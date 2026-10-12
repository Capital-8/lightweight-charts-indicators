/**
 * Pivot Points High Low Multi Time Frame
 *
 * Pivot highs and pivot lows of a higher timeframe of the same symbol (a high that is the highest of "Left Bars"
 * bars before and "Right Bars" bars after it; lows mirrored). Each pivot is drawn on the chart bars of its bar of
 * the higher timeframe: a horizontal line at the pivot price with a small bracket at both ends and a label with the
 * price. The bracket height is 1 / 50 of the range of the last 300 chart bars (nothing is drawn before 300 bars).
 * As in the original, a pivot confirmed on the bar of the higher timeframe that follows another confirmation of the
 * same side is not drawn. At most 500 lines and 500 labels are kept.
 *
 * Timeframe: the bars of the higher timeframe are built from the chart bars with the calendar rule of the period
 * helper (see anchor-period.ts for its limits). The original reads the higher timeframe with lookahead: a pivot is
 * drawn on the first chart bar of the bar of the higher timeframe that confirms it. A timeframe below the chart
 * timeframe (the default 240 on a daily chart) needs data that the chart bars do not have: the port throws an Error.
 *
 * Chart context (optional third argument): the label text is the price rounded to the price tick of the symbol,
 * read from the context (`mintick`). Without it the tick is 0.01.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Pivot Points High Low Multi Time Frame" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import {
  ta, Series, str, math, timeframe, resample, line, label, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import { mintickOf, type ChartContext } from '../chart-context';

export interface PivotPointsHighLowMultiTimeFrameInputs {
  /** Timeframe of the pivots */
  timeframe: string;
  leftBars: number;
  rightBars: number;
  phlinecol: string;
  pllinecol: string;
  phbgcol: string;
  phtextcol: string;
  plbgcol: string;
  pltextcol: string;
}

export const defaultInputs: PivotPointsHighLowMultiTimeFrameInputs = {
  timeframe: '240',
  leftBars: 2,
  rightBars: 2,
  phlinecol: '#00E676',
  pllinecol: '#FF5252',
  phbgcol: '#00E676',
  phtextcol: '#363A45',
  plbgcol: '#FF5252',
  pltextcol: '#FFFFFF',
};

export const inputConfig: InputConfig[] = [
  { id: 'timeframe', type: 'timeframe', title: 'timeframe', defval: '240' },
  { id: 'leftBars', type: 'int', title: 'Left Bars', defval: 2, min: 1 },
  { id: 'rightBars', type: 'int', title: 'Right Bars', defval: 2, min: 1 },
  { id: 'phlinecol', type: 'color', title: 'Pivot High/Low Line Colors', defval: '#00E676', inline: 'lc' },
  { id: 'pllinecol', type: 'color', title: '', defval: '#FF5252', inline: 'lc' },
  { id: 'phbgcol', type: 'color', title: 'Pivot High BG/Text Colors', defval: '#00E676', inline: 'ph' },
  { id: 'phtextcol', type: 'color', title: '', defval: '#363A45', inline: 'ph' },
  { id: 'plbgcol', type: 'color', title: 'Pivot Low BG/Text Colors', defval: '#FF5252', inline: 'pl' },
  { id: 'pltextcol', type: 'color', title: '', defval: '#FFFFFF', inline: 'pl' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Pivot Points High Low Multi Time Frame',
  shortTitle: 'Pivot Points High Low Multi Time Frame',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

/**
 * request.security(syminfo.tickerid, tf, ..., lookahead = barmerge.lookahead_on): the bars of timeframe `tf` built
 * from the chart bars (their time is the start of the period) and for each chart bar the index of its bar of that
 * timeframe.
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; group: number[] } {
  const chartTf = chartTimeframe(bars, context);
  if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) {
    return { htf: bars, group: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods come from the library
  // rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, group: exchange.group };
  // Without it: the periods of the UTC calendar rule (see anchor-period.ts), grouped by the library
  const { bars: htf, group } = resample(bars, periodStarts(bars, tf));
  return { htf, group };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<PivotPointsHighLowMultiTimeFrameInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { leftBars, rightBars } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // get_phpl() on the bars of the timeframe
  const { htf, group } = timeframeBars(bars, cfg.timeframe, chart);
  const phH = A(ta.pivothigh(Series.fromArray(htf, htf.map((b) => b.high)), leftBars, rightBars));
  const plH = A(ta.pivotlow(Series.fromArray(htf, htf.map((b) => b.low)), leftBars, rightBars));
  const htfTime = (k: number) => (k >= 0 ? htf[k].time : NaN);

  // width = (ta.highest(300) - ta.lowest(300)) / 50
  const highest = A(ta.highest(Series.fromArray(bars, bars.map((b) => b.high)), 300));
  const lowest = A(ta.lowest(Series.fromArray(bars, bars.map((b) => b.low)), 300));

  // The lines and labels go through the drawing registry of the library (max_lines_count, max_labels_count), with
  // xloc.bar_time (UNIX ms)
  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });
  const ms = n > 0 && bars[0].time >= 1e12;
  const toMs = (t: number) => (ms ? t : t * 1000);
  const newLine = (time1: number, price1: number, time2: number, price2: number, color: string) => {
    line.new(toMs(time1), price1, toMs(time2), price2, 'bar_time', undefined, color, undefined, 2);
  };
  // syminfo.mintick: the symbol tick of the chart context (0.01 without it)
  const mintick = mintickOf(chart);
  const text = (price: number) => str.tostring(math.round_to_mintick(price, mintick) as number);

  const indexOfTime = new Map<number, number>();
  let ph1 = NaN;
  let pl1 = NaN;
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const g = group[i];
    const ph = phH[g];
    const pl = plH[g];
    indexOfTime.set(bars[i].time, i);
    // The end of a pivot: the chart bar before the bar of the timeframe that follows the pivot bar (the current bar
    // when the chart has no bar at that time)
    const endOf = (timeEnd: number) => {
      const at = indexOfTime.get(timeEnd);
      const back = at === undefined ? -1 : i - at;
      return bars[i - Math.min(back + 1, i)].time;
    };
    const width = (highest[i] - lowest[i]) / 50;

    // to draw once: na(ph[1]) and ph
    if (isNaN(ph1) && truthy(ph)) {
      const start = htfTime(g - rightBars);
      const end = endOf(htfTime(g - rightBars + 1));
      newLine(start, ph, end, ph, cfg.phlinecol);
      newLine(start, ph, start, ph + width, cfg.phlinecol);
      newLine(end, ph, end, ph + width, cfg.phlinecol);
      label.new(toMs((start + end) / 2), ph + width, text(ph), 'bar_time', undefined, cfg.phbgcol, undefined, cfg.phtextcol);
    }
    if (isNaN(pl1) && truthy(pl)) {
      const start = htfTime(g - rightBars);
      const end = endOf(htfTime(g - rightBars + 1));
      newLine(start, pl, end, pl, cfg.pllinecol);
      newLine(start, pl, start, pl - width, cfg.pllinecol);
      newLine(end, pl, end, pl - width, cfg.pllinecol);
      label.new(toMs((start + end) / 2), pl - width, text(pl), 'bar_time', undefined, cfg.plbgcol, 'label_up', cfg.pltextcol);
    }
    ph1 = ph;
    pl1 = pl;
  }

  setDrawingBar(null);

  // An object with an na coordinate is not drawn (drawingOutputs). A label time between two bars is drawn on the next
  // bar
  const onBar = (time: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    return lo < n ? bars[lo].time : time;
  };
  const out = drawingOutputs(bars, ms ? 'ms' : 's');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: out.lines ?? [],
    labels: (out.labels ?? []).map((l) => ({ ...l, time: onBar(l.time) })),
  };
}

export const PivotPointsHighLowMultiTimeFrame = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
