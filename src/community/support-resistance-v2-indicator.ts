/**
 * Support/Resistance V2 Indicator
 *
 * Support and resistance levels from an RSI extreme with a momentum reversal. The momentum term compares the change
 * of the Hull average of the open (5 bars, one bar back) with the change of the Hull average of the close (12
 * bars): its ratio is +100 when the first change is the larger one, else -100. A support level is the low of a bar
 * with RSI(9) below 25 and the ratio above 50; a resistance level is the high of a bar with RSI(9) above 75 and the
 * ratio below -50. Each new level is drawn as a horizontal line (support green, resistance orange) from its bar to
 * the bar before the next level of the same side. The first level of each side draws no line (a line appears when
 * the level changes). As in the original, each side starts with a default line at price 0 from the first bar to the
 * bar before its first drawn level. At most 500 lines are kept.
 *
 * Timeframe: the bars of a higher timeframe are built from the chart bars with the calendar rule of the period
 * helper (see anchor-period.ts for its limits). The original reads the higher timeframe with lookahead: the level of
 * a bar of that timeframe is drawn from its first chart bar. A timeframe below the chart timeframe needs data that
 * the chart bars do not have: the port throws an Error.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Support/Resistance" by BarsStallone
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BarsStallone. Code update provided by @christofferka
 */

import {
  ta, math, Series, timeframe, resample, line, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line,
} from 'oakscriptjs';
import type { LineDrawingData } from '../types';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface SupportResistanceV2IndicatorInputs {
  /** Timeframe of the levels ('' = chart timeframe) */
  srTf: string;
}

export const defaultInputs: SupportResistanceV2IndicatorInputs = {
  srTf: '',
};

export const inputConfig: InputConfig[] = [
  { id: 'srTf', type: 'timeframe', title: 'S/R Timeframe', defval: '' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Support/Resistance',
  shortTitle: 'S/R',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;
const LINE_WIDTH = 3;
const GREEN = '#4CAF50';
const ORANGE = '#FF9800';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => gt(a, b) || Math.abs(a - b) <= EPS;
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

/**
 * request.security(syminfo.tickerid, tf, ..., lookahead = barmerge.lookahead_on): the bars of timeframe `tf` built
 * from the chart bars and for each chart bar the index of its bar of that timeframe.
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; group: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, group: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods come from the library
  // rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, group: exchange.group };
  // Without it: the periods of the UTC calendar rule (see anchor-period.ts), grouped by the library
  const { bars: htf, group } = resample(bars, periodStarts(bars, tf));
  return { htf, group };
}

/** calcXup() and calcXdown() on the bars of one timeframe: the last support and resistance level */
function levels(bars: Bar[]): { xup: number[]; xdown: number[] } {
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (values: number[]) => Series.fromArray(bars, values);
  const open = S(bars.map((b) => b.open));
  const close = S(bars.map((b) => b.close));

  // CMO based on HMA: src1 = ta.hma(open, 5)[1], src2 = ta.hma(close, 12)
  const hmaOpen = A(ta.hma(open, 5));
  const src2 = A(ta.hma(close, 12));
  const src1 = hmaOpen.map((_v, i) => (i >= 1 ? hmaOpen[i - 1] : NaN));
  const m1: number[] = [];
  const m2: number[] = [];
  for (let i = 0; i < n; i++) {
    const momm1 = i >= 1 ? src1[i] - src1[i - 1] : NaN;
    const momm2 = i >= 1 ? src2[i] - src2[i - 1] : NaN;
    const larger = ge(momm1, momm2);
    m1.push(larger ? momm1 : 0);
    m2.push(larger ? 0 : -momm1);
  }
  const sm1 = A(math.sum(S(m1), 1));
  const sm2 = A(math.sum(S(m2), 1));
  const cmo = sm1.map((v, i) => (100 * (v - sm2[i])) / (v + sm2[i]));

  // Close pivots: the highest / lowest of 2 bars when it is the same on 2 bars, else the last such value
  const pivot = (extreme: number[]) => {
    const dev = A(ta.dev(S(extreme), 2));
    let last = NaN;
    return extreme.map((v, i) => {
      const value = truthy(dev[i]) ? NaN : v;
      if (!isNaN(value)) last = value;
      return last;
    });
  };
  const hpivot = pivot(A(ta.highest(S(bars.map((b) => b.high)), 2)));
  const lpivot = pivot(A(ta.lowest(S(bars.map((b) => b.low)), 2)));
  const rsi = A(ta.rsi(close, 9));

  // var x = 0.0, x := cond ? price : x[1]: na until the first level
  const xup: number[] = [];
  const xdown: number[] = [];
  for (let i = 0; i < n; i++) {
    const sup = lt(rsi[i], 25) && gt(cmo[i], 50) && truthy(lpivot[i]);
    const res = gt(rsi[i], 75) && lt(cmo[i], -50) && truthy(hpivot[i]);
    xup.push(sup ? bars[i].low : i > 0 ? xup[i - 1] : NaN);
    xdown.push(res ? bars[i].high : i > 0 ? xdown[i - 1] : NaN);
  }
  return { xup, xdown };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupportResistanceV2IndicatorInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const { htf, group } = timeframeBars(bars, cfg.srTf, chart);
  const { xup, xdown } = levels(htf);

  // The lines go through the drawing registry of the library (max_lines_count, the lines held by the two `var`
  // variables are kept)
  resetDrawings({ line: MAX_LINES });
  const tf1Line = varDrawing<Line>(); // var tf1_line = line.new(0, 0, 0, 0)
  const tf2Line = varDrawing<Line>(); // var tf2_line = line.new(0, 0, 0, 0)
  let tf1Prev = NaN;
  let tf2Prev = NaN;
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const tf1 = xup[group[i]];
    const tf2 = xdown[group[i]];
    if (i === 0) tf1Line.value = line.new(0, 0, 0, 0);
    // ta.change(tf) used as a condition: a change that is not 0 and not na
    if (truthy(tf1 - tf1Prev)) tf1Line.value = line.new(i, tf1, i, tf1, 'bar_index', undefined, GREEN, undefined, LINE_WIDTH);
    line.set_x2(tf1Line.value!, i);
    if (i === 0) tf2Line.value = line.new(0, 0, 0, 0);
    if (truthy(tf2 - tf2Prev)) tf2Line.value = line.new(i, tf2, i, tf2, 'bar_index', undefined, ORANGE, undefined, LINE_WIDTH);
    line.set_x2(tf2Line.value!, i);
    tf1Prev = tf1;
    tf2Prev = tf2;
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: drawingOutputs(bars).lines ?? [],
  };
}

export const SupportResistanceV2Indicator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
