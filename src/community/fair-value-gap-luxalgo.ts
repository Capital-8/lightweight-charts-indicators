/**
 * Fair Value Gap [LuxAlgo]
 *
 * Finds fair value gaps on the chart timeframe or on a higher timeframe. A bullish gap: the low is above the high of
 * two bars before, the close of the bar between them is above that high too, and the gap size relative to that high
 * is above the threshold. A bearish gap is the mirrored case (the size is relative to the high of the bar). The
 * threshold is a fixed percentage, or with "Auto" the cumulative average of (high - low) / low.
 *
 * Each gap is drawn as a box from two bars back to "Extend" bars after the bar. A bullish gap is mitigated when a
 * close is below its lower edge, a bearish gap when a close is above its upper edge: the box is removed and, with
 * "Mitigation Levels", a dashed line is drawn from the gap to that bar. "Unmitigated Levels" draws a line for the
 * most recent gaps that are still open. With "Dynamic" the boxes are replaced by two plotted bands: the open gap of
 * each side, whose edge follows the close into the gap. The dashboard shows the number of gaps and the percentage of
 * mitigated gaps. At most 500 boxes and 500 lines are kept.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Bullish FVG' / 'Bearish FVG' on the bars where a new gap is
 * counted, 'Bullish FVG Mitigation' / 'Bearish FVG Mitigation' on the bars where a gap of that side is mitigated.
 *
 * Timeframe: the higher-timeframe bars are built from the chart bars with the calendar rule of the period
 * helper (see anchor-period.ts for its limits). The values of a higher-timeframe bar appear on the chart bar that
 * completes it: on symbols that trade every day, a bar whose close reaches the end of the period, else the first bar
 * of the next period; on other symbols the last bar of the period. Every bar is a closed bar. As in the original, a
 * higher timeframe gives a runtime error when the first chart bar does not complete a bar of that timeframe (the
 * record is na there). A timeframe lower than the chart timeframe needs data that the chart bars do not have: the
 * port throws an Error.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Fair Value Gap [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  str, color, timeframe, box, line, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Box,
} from 'oakscriptjs';
import type { BoxData, LineDrawingData, TableData, TableCellData } from '../types';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FairValueGapLuxalgoInputs {
  /** Smallest gap size, in percent */
  thresholdPer: number;
  /** Use the cumulative average bar range as threshold */
  auto: boolean;
  /** Number of unmitigated levels drawn on the last bar (0: none) */
  showLast: number;
  mitigationLevels: boolean;
  /** Timeframe of the gaps ('' = chart timeframe) */
  tf: string;
  /** Box length after the gap bar, in bars */
  extend: number;
  dynamic: boolean;
  bullCss: string;
  bearCss: string;
  showDash: boolean;
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: FairValueGapLuxalgoInputs = {
  thresholdPer: 0,
  auto: false,
  showLast: 0,
  mitigationLevels: false,
  tf: '',
  extend: 20,
  dynamic: false,
  bullCss: 'rgba(8, 153, 129, 0.3)',
  bearCss: 'rgba(242, 54, 69, 0.3)',
  showDash: false,
  dashLoc: 'Top Right',
  textSize: 'Small',
};

export const inputConfig: InputConfig[] = [
  { id: 'thresholdPer', type: 'float', title: 'Threshold %', defval: 0, min: 0, max: 100, step: 0.1, inline: 'threshold' },
  { id: 'auto', type: 'bool', title: 'Auto', defval: false, inline: 'threshold' },
  { id: 'showLast', type: 'int', title: 'Unmitigated Levels', defval: 0, min: 0 },
  { id: 'mitigationLevels', type: 'bool', title: 'Mitigation Levels', defval: false },
  { id: 'tf', type: 'timeframe', title: 'Timeframe', defval: '' },
  { id: 'extend', type: 'int', title: 'Extend', defval: 20, min: 0, inline: 'extend', group: 'Style' },
  { id: 'dynamic', type: 'bool', title: 'Dynamic', defval: false, inline: 'extend', group: 'Style' },
  { id: 'bullCss', type: 'color', title: 'Bullish FVG', defval: 'rgba(8, 153, 129, 0.3)', group: 'Style' },
  { id: 'bearCss', type: 'color', title: 'Bearish FVG', defval: 'rgba(242, 54, 69, 0.3)', group: 'Style' },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: false, group: 'Dashboard' },
  { id: 'dashLoc', type: 'string', title: 'Location', defval: 'Top Right', options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard' },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], group: 'Dashboard' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bullish FVG Top', color: 'transparent', lineWidth: 1 },
  { id: 'plot1', title: 'Bullish FVG Bottom', color: 'transparent', lineWidth: 1 },
  { id: 'plot2', title: 'Bearish FVG Top', color: 'transparent', lineWidth: 1 },
  { id: 'plot3', title: 'Bearish FVG Bottom', color: 'transparent', lineWidth: 1 },
];

export const metadata = {
  title: 'Fair Value Gap [LuxAlgo]',
  shortTitle: 'LuxAlgo - Fair Value Gap',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** A gap record (type fvg): t is the time of the bar that made it, in its timeframe */
interface Fvg {
  max: number;
  min: number;
  isbull: boolean;
  t: number;
}

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars, and for each chart bar the index of the latest completed bar of that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`Fair Value Gap: the timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // The periods and the bars that complete them: the exchange calendar of the chart context (time zone and
  // session), else the UTC calendar rule; grouped and completed by the library (see anchor-period.ts)
  const { htf, latest, first } = higherTimeframeBars(bars, tf, context);
  // the time of a bar of the timeframe: its first chart bar
  return { htf: htf.map((b, k) => ({ ...b, time: bars[first[k]].time })), latest };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<FairValueGapLuxalgoInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines' | 'tables'> & { boxes: BoxData[]; lines: LineDrawingData[]; tables: TableData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const { bullCss, bearCss, dynamic } = cfg;

  // detect() on the bars of the timeframe
  const { htf, latest } = timeframeBars(bars, cfg.tf, chart);
  // `new_fvg.t` is read on every bar: when the first chart bar does not complete a bar of the timeframe, the
  // record is na there and the script stops with a runtime error
  if (n > 0 && latest[0] < 0) {
    throw new Error("Error on bar 0: Cannot access the 'fvg.t' field of an undefined object. The object is 'na'.");
  }
  const bullAt: boolean[] = [];
  const bearAt: boolean[] = [];
  const fvgAt: Array<Fvg | null> = [];
  {
    let newFvg: Fvg | null = null; // var new_fvg = fvg.new(na, na, na, na): no gap yet
    let cum = 0;
    for (let k = 0; k < htf.length; k++) {
      const b = htf[k];
      cum += (b.high - b.low) / b.low;
      const threshold = cfg.auto ? cum / k : cfg.thresholdPer / 100;
      const high2 = k >= 2 ? htf[k - 2].high : NaN;
      const low2 = k >= 2 ? htf[k - 2].low : NaN;
      const close1 = k >= 1 ? htf[k - 1].close : NaN;
      const bull = gt(b.low, high2) && gt(close1, high2) && gt((b.low - high2) / high2, threshold);
      const bear = lt(b.high, low2) && lt(close1, low2) && gt((low2 - b.high) / b.high, threshold);
      if (bull) newFvg = { max: b.low, min: high2, isbull: true, t: b.time };
      else if (bear) newFvg = { max: low2, min: b.high, isbull: false, t: b.time };
      bullAt.push(bull);
      bearAt.push(bear);
      fvgAt.push(newFvg);
    }
  }

  // Boxes and lines in the drawing registry of the library (max_boxes_count / max_lines_count 500)
  resetDrawings({ box: MAX_OBJECTS, line: MAX_OBJECTS });
  const ms = n > 0 && bars[0].time >= 1e12;
  const toMs = (t: number) => (ms ? t : t * 1000);
  // line.new(get.t, price, time, price, xloc.bar_time, color = css, style = ...)
  const newLine = (t1: number, t2: number, price: number, css: string, dashed: boolean) => {
    line.new(toMs(t1), price, toMs(t2), price, 'bar_time', undefined, css, dashed ? 'dashed' : undefined);
  };

  let maxBull = NaN;
  let minBull = NaN;
  let bullCount = 0;
  let bullMitigated = 0;
  let maxBear = NaN;
  let minBear = NaN;
  let bearCount = 0;
  let bearMitigated = 0;
  let t = 0;
  const records: Fvg[] = [];
  const areas: Box[] = [];
  const plot0: number[] = [];
  const plot1: number[] = [];
  const plot2: number[] = [];
  const plot3: number[] = [];
  // alertcondition(bull_count > bull_count[1]) / bear_count / bull_mitigated / bear_mitigated (na on bar 0: false)
  const flags: boolean[][] = [[], [], [], []];

  for (let i = 0; i < n; i++) {
    const before = [bullCount, bearCount, bullMitigated, bearMitigated];
    setDrawingBar(i, i === last);
    const close = bars[i].close;
    const time = bars[i].time;
    const k = latest[i];
    const bull = k >= 0 && bullAt[k];
    const bear = k >= 0 && bearAt[k];
    const fvg = k >= 0 ? fvgAt[k] : null;
    const isNew = fvg !== null && fvg.t !== t;

    if (bull && isNew) {
      if (dynamic) {
        maxBull = fvg!.max;
        minBull = fvg!.min;
      } else {
        areas.unshift(box.new(i - 2, fvg!.max, i + cfg.extend, fvg!.min, NaN, undefined, undefined, undefined, undefined, bullCss));
      }
      records.unshift(fvg!);
      bullCount += 1;
      t = fvg!.t;
    } else if (dynamic) {
      maxBull = Math.max(Math.min(close, maxBull), minBull);
    }

    if (bear && fvg !== null && fvg.t !== t) {
      if (dynamic) {
        maxBear = fvg.max;
        minBear = fvg.min;
      } else {
        areas.unshift(box.new(i - 2, fvg.max, i + cfg.extend, fvg.min, NaN, undefined, undefined, undefined, undefined, bearCss));
      }
      records.unshift(fvg);
      bearCount += 1;
      t = fvg.t;
    } else if (dynamic) {
      minBear = Math.min(Math.max(close, minBear), maxBear);
    }

    // Test for mitigation, from the oldest gap
    for (let j = records.length - 1; j >= 0; j--) {
      const get = records[j];
      if (get.isbull) {
        if (lt(close, get.min)) {
          if (cfg.mitigationLevels) newLine(get.t, time, get.min, bullCss, true);
          if (!dynamic) box.delete(areas.splice(j, 1)[0]);
          records.splice(j, 1);
          bullMitigated += 1;
        }
      } else if (gt(close, get.max)) {
        if (cfg.mitigationLevels) newLine(get.t, time, get.max, bearCss, true);
        if (!dynamic) box.delete(areas.splice(j, 1)[0]);
        records.splice(j, 1);
        bearMitigated += 1;
      }
    }

    // Unmitigated lines (barstate.islast)
    if (i === last && cfg.showLast > 0 && records.length > 0) {
      for (let j = 0; j <= Math.min(cfg.showLast - 1, records.length - 1); j++) {
        const get = records[j];
        const price = get.isbull ? get.min : get.max;
        newLine(get.t, time, price, get.isbull ? bullCss : bearCss, false);
      }
    }

    plot0.push(maxBull);
    plot1.push(minBull);
    plot2.push(maxBear);
    plot3.push(minBear);
    [bullCount, bearCount, bullMitigated, bearMitigated].forEach((v, k) => flags[k].push(i > 0 && v > before[k]));
  }

  // Dashboard: the table exists also when it is not shown (no cell)
  const cellSize = cfg.textSize === 'Tiny' ? 'tiny' : cfg.textSize === 'Small' ? 'small' : 'normal';
  const solid = (c: string) => String(color.rgb(color.r(c), color.g(c), color.b(c)));
  const cells: TableCellData[] = [];
  if (cfg.showDash && n > 0) {
    const cell = (column: number, row: number, text: string, textColor: string) => {
      cells.push({ column, row, text, textColor, textSize: cellSize });
    };
    cell(1, 0, 'Bullish', solid(bullCss));
    cell(2, 0, 'Bearish', solid(bearCss));
    cell(0, 1, 'Count', '#FFFFFF');
    cell(0, 2, 'Mitigated', '#FFFFFF');
    cell(1, 1, str.tostring(bullCount), solid(bullCss));
    cell(2, 1, str.tostring(bearCount), solid(bearCss));
    cell(1, 2, str.tostring((bullMitigated / bullCount) * 100, 'percent'), solid(bullCss));
    cell(2, 2, str.tostring((bearMitigated / bearCount) * 100, 'percent'), solid(bearCss));
  }
  const table: TableData = {
    position: cfg.dashLoc === 'Bottom Left' ? 'bottom_left' : cfg.dashLoc === 'Top Right' ? 'top_right' : 'bottom_right',
    columns: 3,
    rows: 3,
    cells,
    bgColor: '#1E222D',
    borderColor: '#373A46',
    borderWidth: 1,
    frameColor: '#373A46',
    frameWidth: 1,
  };

  setDrawingBar(null);
  const drawings = drawingOutputs(bars, ms ? 'ms' : 's');
  const P = (values: number[]) => values.map((value, i) => ({ time: bars[i].time, value }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: P(plot0), plot1: P(plot1), plot2: P(plot2), plot3: P(plot3) },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', colors: bars.map(() => bullCss) },
      { plot1: 'plot2', plot2: 'plot3', colors: bars.map(() => bearCss) },
    ],
    boxes: drawings.boxes ?? [],
    lines: drawings.lines ?? [],
    tables: n > 0 ? [table] : [],
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish FVG', message: 'Bullish FVG detected' },
  { id: 'alert1', title: 'Bearish FVG', message: 'Bearish FVG detected' },
  { id: 'alert2', title: 'Bullish FVG Mitigation', message: 'Bullish FVG mitigated' },
  { id: 'alert3', title: 'Bearish FVG Mitigation', message: 'Bearish FVG mitigated' },
];

export const FairValueGapLuxalgo = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
