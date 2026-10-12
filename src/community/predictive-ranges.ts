/**
 * Predictive Ranges [LuxAlgo]
 *
 * A stepped average with four range levels around it. The average starts at the source; when the source is more
 * than ATR(length) * factor away from it, the average moves by that amount towards the source, else it stays. Each
 * time the average moves, half of the ATR amount is kept as the range unit: the levels are the average plus / minus
 * one and two units. The lines are not drawn on the bars where the average moves, so each step is a separate set of
 * horizontal levels; the areas between the two upper levels and between the two lower levels are filled.
 *
 * Timeframe input: the levels can be computed on a higher timeframe of the same symbol. The bars of that timeframe
 * are built from the chart bars (periods from the exchange calendar of the chart context, the optional third
 * argument; without it from the UTC calendar and the bars, see anchor-period.ts), so its ATR and its average start
 * at the first chart bar; each chart bar shows the levels of the latest completed bar of that timeframe. A
 * timeframe below the chart timeframe needs data that the chart bars do not have: the port throws an Error.
 *
 * Reference: "Predictive Ranges [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, color, timeframe, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface PredictiveRangesInputs {
  /** ATR length */
  length: number;
  /** ATR multiplier */
  mult: number;
  /** Timeframe of the levels ("" = the chart timeframe) */
  tf: string;
  src: SourceType;
}

export const defaultInputs: PredictiveRangesInputs = {
  length: 200,
  mult: 6,
  tf: '',
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 200, min: 2 },
  { id: 'mult', type: 'float', title: 'Factor', defval: 6, min: 0, step: 0.5 },
  { id: 'tf', type: 'timeframe', title: 'Timeframe', defval: '' },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
];

const RED = '#f23645';
const BLUE = '#5b9cf6';
const GREEN = '#089981';
const RED_FILL = String(color.new(RED, 95));
const GREEN_FILL = String(color.new(GREEN, 95));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'PR Upper 2', color: RED, lineWidth: 1 },
  { id: 'plot1', title: 'PR Upper 1', color: RED, lineWidth: 1 },
  { id: 'plot2', title: 'PR Average', color: BLUE, lineWidth: 1 },
  { id: 'plot3', title: 'PR Lower 1', color: GREEN, lineWidth: 1 },
  { id: 'plot4', title: 'PR Lower 2', color: GREEN, lineWidth: 1 },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill_upper', plot1: 'plot0', plot2: 'plot1', color: RED_FILL },
  { id: 'fill_lower', plot1: 'plot3', plot2: 'plot4', color: GREEN_FILL },
];

export const metadata = {
  title: 'Predictive Ranges [LuxAlgo]',
  shortTitle: 'LuxAlgo - Predictive Ranges',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10; a != b only when they differ by more (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

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
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // The periods and the bars that complete them: the exchange calendar of the chart context (time zone and
  // session), else the UTC calendar rule; grouped and completed by the library (see anchor-period.ts)
  return higherTimeframeBars(bars, tf, context);
}

/** pred_ranges(length, mult) on the bars of one timeframe: the average and the range unit of each bar */
function predRanges(bars: Bar[], src: SourceType, length: number, mult: number): { avg: number[]; hold: number[] } {
  const source = getSourceSeries(bars, src).toArray().map((v) => v ?? NaN);
  const atrArr = ta.atr(bars, length).toArray();
  const avgOut: number[] = [];
  const holdOut: number[] = [];
  let avg = NaN; // var avg = src
  let holdAtr = 0; // var hold_atr = 0.
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) avg = source[0];
    const prev = i > 0 ? avgOut[i - 1] : NaN;
    // atr = nz(ta.atr(length)) * mult
    const a = atrArr[i];
    const atr = (a === null || a === undefined || !Number.isFinite(a) ? 0 : a) * mult;
    avg = gt(source[i] - avg, atr) ? avg + atr : gt(avg - source[i], atr) ? avg - atr : avg;
    // hold_atr := avg != avg[1] ? atr / 2 : hold_atr
    if (ne(avg, prev)) holdAtr = atr / 2;
    avgOut.push(avg);
    holdOut.push(holdAtr);
  }
  return { avg: avgOut, hold: holdOut };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<PredictiveRangesInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const { htf, latest } = timeframeBars(bars, cfg.tf, chart);
  const ranges = predRanges(htf, cfg.src, cfg.length, cfg.mult);
  const avg = latest.map((k) => (k >= 0 ? ranges.avg[k] : NaN));
  const hold = latest.map((k) => (k >= 0 ? ranges.hold[k] : NaN));

  type Point = { time: number; value: number; color: string };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const upperFill: string[] = [];
  const lowerFill: string[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    // avg != avg[1] ? na : colour
    const moved = i > 0 && ne(avg[i], avg[i - 1]);
    const c = (css: string) => (moved ? 'transparent' : css);
    plot0.push({ time, value: avg[i] + hold[i] * 2, color: c(RED) });
    plot1.push({ time, value: avg[i] + hold[i], color: c(RED) });
    plot2.push({ time, value: avg[i], color: c(BLUE) });
    plot3.push({ time, value: avg[i] - hold[i], color: c(GREEN) });
    plot4.push({ time, value: avg[i] - hold[i] * 2, color: c(GREEN) });
    upperFill.push(c(RED_FILL));
    lowerFill.push(c(GREEN_FILL));
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', colors: upperFill },
      { plot1: 'plot3', plot2: 'plot4', colors: lowerFill },
    ],
  };
}

export const PredictiveRanges = { calculate, metadata, defaultInputs, inputConfig, plotConfig, fillConfig };
