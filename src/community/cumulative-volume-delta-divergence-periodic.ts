/**
 * Cumulative Volume Delta Divergence [TradingFinder] Periodic EMA
 *
 * Volume delta of a bar: the volume split by the position of the close in the bar range, buying = volume x
 * (close - low) / (high - low), selling = volume x (high - close) / (high - low), delta = buying - selling. The
 * oscillator is the sum of the delta over "CVD Period" bars ("Periodic") or its EMA ("EMA"), drawn as columns (green
 * above zero, red below).
 *
 * Divergences use fractals: a pivot high (n bars on each side) whose close is above the 50-bar EMA of the current
 * bar, or a pivot low whose close is below it.
 * - Bearish (-RD): the two latest high fractals are less than 30 bars apart, the latest is less than 30 bars old, the
 *   oscillator is positive on both, the price high is higher and the oscillator is lower.
 * - Bullish (+RD): the mirror on the low fractals with a negative oscillator.
 * While a divergence holds, every bar draws a line between the two fractals and a label on the latest one, on the
 * oscillator and on the price chart (so the same line is drawn several times). At most 500 lines and 500 labels are
 * kept.
 *
 * "Ultra Data" (off by default) adds the volume of the same ticker on 26 other exchanges, which are other symbols:
 * the chart bars do not have that data and the port throws an Error when it is switched on.
 *
 * Reference: "Cumulative Volume Delta Divergence [TradingFinder] Periodic EMA" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import { ta, math, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';

export interface CumulativeVolumeDeltaDivergencePeriodicInputs {
  /** Bars on each side of a fractal */
  n: number;
  period: number;
  cumMode: 'Periodic' | 'EMA';
  /** Add the volume of other exchanges (not available: throws when true) */
  ultraData: boolean;
  market: 'Forex' | 'Crypto' | 'Stock';
  showLabel: 'Yes' | 'No';
}

export const defaultInputs: CumulativeVolumeDeltaDivergencePeriodicInputs = {
  n: 2,
  period: 21,
  cumMode: 'Periodic',
  ultraData: false,
  market: 'Forex',
  showLabel: 'Yes',
};

export const inputConfig: InputConfig[] = [
  { id: 'n', type: 'int', title: 'Divergence Fractal Periods', defval: 2, min: 1, group: 'Logic Setting' },
  { id: 'period', type: 'int', title: 'CVD Period', defval: 21, group: 'Logic Setting' },
  { id: 'cumMode', type: 'string', title: 'Cumulative Mode', defval: 'Periodic', options: ['Periodic', 'EMA'], group: 'Logic Setting' },
  { id: 'ultraData', type: 'bool', title: '', defval: false, inline: 'Data', group: 'Logic Setting' },
  { id: 'market', type: 'string', title: 'Market Ultra Data', defval: 'Forex', options: ['Forex', 'Crypto', 'Stock'], inline: 'Data', group: 'Logic Setting' },
  { id: 'showLabel', type: 'string', title: 'Show Label', defval: 'Yes', options: ['Yes', 'No'], group: 'display Setting' },
];

const UP = 'rgba(76, 175, 79, 0.5)';
const DOWN = 'rgba(255, 82, 82, 0.5)';
const BULL_LINE = 'rgb(21, 151, 25)';
const BEAR_LINE = 'rgb(212, 44, 44)';
const GREEN = '#4CAF50';
const RED = '#FF5252';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Show Cumulative Vol Delta', color: UP, lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'Cumulative Volume Delta Divergence [TradingFinder] Periodic EMA',
  shortTitle: 'CVD Divergence Oscillator',
  overlay: false,
};

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<CumulativeVolumeDeltaDivergencePeriodicInputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines'> & { labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  if (cfg.ultraData) {
    throw new Error('Cumulative Volume Delta Divergence: "Ultra Data" needs the volume of the same ticker on other exchanges (other symbols), which the chart bars do not have');
  }
  const nBars = bars.length;
  const n = Math.trunc(cfg.n);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // delta = Buying - Selling; a bar without range gives 0 / 0 (na)
  const delta = bars.map((b) => {
    const volume = b.volume ?? NaN;
    const buying = volume * ((b.close - b.low) / (b.high - b.low));
    const selling = volume * ((b.high - b.close) / (b.high - b.low));
    return buying - selling;
  });
  const deltaSeries = Series.fromArray(bars, delta);
  const hist = cfg.cumMode === 'Periodic'
    ? A(math.sum(deltaSeries, cfg.period) as Series)
    : cfg.cumMode === 'EMA' ? A(ta.ema(deltaSeries, cfg.period)) : new Array<number>(nBars).fill(NaN);
  const H = (i: number) => (i >= 0 && Number.isFinite(hist[i]) ? hist[i] : NaN);

  const ema = A(ta.ema(new Series(bars, (b) => b.close), 50));
  const upPivot = A(ta.pivothigh(new Series(bars, (b) => b.high), n, n));
  const downPivot = A(ta.pivotlow(new Series(bars, (b) => b.low), n, n));
  /** A number used as a condition: na and 0 are false */
  const truthy = (v: number) => !isNaN(v) && v !== 0;

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. An object held by a `var` variable of the script (the latest line and label of each of the four
  // kinds) is never deleted by this limit, but it counts.
  const held = new Set<object>();
  const limit = <T extends object>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (held.has(list[k])) k++;
      else list.splice(k, 1);
    }
  };
  /** `variable := object`: the variable holds the new object and releases the one before */
  const hold = <T extends object>(before: T | null, now: T): T => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; overlay: boolean }
  interface Lb { x: number; y: number; bull: boolean; overlay: boolean }
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const newLine = (l: Ln): Ln => {
    lines.push(l);
    limit(lines);
    return l;
  };
  const newLabel = (l: Lb): Lb => {
    labels.push(l);
    limit(labels);
    return l;
  };
  let buLine: Ln | null = null;
  let buLineOnChart: Ln | null = null;
  let beLine: Ln | null = null;
  let beLineOnChart: Ln | null = null;
  let buLabel: Lb | null = null;
  let buLabelOnChart: Lb | null = null;
  let beLabel: Lb | null = null;
  let beLabelOnChart: Lb | null = null;
  const withLabels = cfg.showLabel === 'Yes';

  // Bar of the latest fractal and of the one before (ta.valuewhen(fractal, x[n], 0 / 1) reads x on these bars)
  let highLast = NaN;
  let highPer = NaN;
  let lowLast = NaN;
  let lowPer = NaN;
  const at = (k: number, f: (b: Bar) => number) => (isNaN(k) ? NaN : f(bars[k]));
  const histAt = (k: number) => (isNaN(k) ? NaN : H(k));

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  for (let i = 0; i < nBars; i++) {
    const closeN = i >= n ? bars[i - n].close : NaN;
    const upFractal = truthy(upPivot[i]) && gt(closeN, ema[i]);
    const downFractal = truthy(downPivot[i]) && lt(closeN, ema[i]);
    if (upFractal) {
      highPer = highLast;
      highLast = i - n;
    }
    if (downFractal) {
      lowPer = lowLast;
      lowLast = i - n;
    }

    // Bearish divergence
    const highLastHist = histAt(highLast);
    const highPerHist = histAt(highPer);
    const bearish = gt(highLastHist, 0) && gt(highPerHist, 0) && gt(highLast + 30, i) && lt(highLast - highPer, 30)
      ? gt(at(highLast, (b) => b.high), at(highPer, (b) => b.high)) && lt(highLastHist, highPerHist)
      : false;
    // Bullish divergence
    const lowLastHist = histAt(lowLast);
    const lowPerHist = histAt(lowPer);
    const bullish = lt(lowLastHist, 0) && lt(lowPerHist, 0) && gt(lowLast + 30, i) && lt(lowLast - lowPer, 30)
      ? lt(at(lowLast, (b) => b.low), at(lowPer, (b) => b.low)) && gt(lowLastHist, lowPerHist)
      : false;

    // Drawing()
    if (bullish) {
      buLine = hold(buLine, newLine({ x1: lowPer, y1: lowPerHist, x2: lowLast, y2: lowLastHist, color: BULL_LINE, overlay: false }));
      if (withLabels) buLabel = hold(buLabel, newLabel({ x: lowLast, y: lowLastHist, bull: true, overlay: false }));
      buLineOnChart = hold(buLineOnChart, newLine({
        x1: lowPer, y1: bars[lowPer].low, x2: lowLast, y2: bars[lowLast].low, color: BULL_LINE, overlay: true,
      }));
      if (withLabels) buLabelOnChart = hold(buLabelOnChart, newLabel({ x: lowLast, y: bars[lowLast].low, bull: true, overlay: true }));
    }
    if (bearish) {
      beLine = hold(beLine, newLine({ x1: highPer, y1: highPerHist, x2: highLast, y2: highLastHist, color: BEAR_LINE, overlay: false }));
      if (withLabels) beLabel = hold(beLabel, newLabel({ x: highLast, y: highLastHist, bull: false, overlay: false }));
      beLineOnChart = hold(beLineOnChart, newLine({
        x1: highPer, y1: bars[highPer].high, x2: highLast, y2: bars[highLast].high, color: BEAR_LINE, overlay: true,
      }));
      if (withLabels) beLabelOnChart = hold(beLabelOnChart, newLabel({ x: highLast, y: bars[highLast].high, bull: false, overlay: true }));
    }

    const v = H(i);
    // no colour (na) when the value is 0 or na
    plot0.push({ time: bars[i].time, value: v, color: gt(v, 0) ? UP : lt(v, 0) ? DOWN : 'transparent' });
  }

  const T = (index: number) => bars[index].time;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    lines: lines.map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color, width: 2,
      ...(l.overlay ? { forceOverlay: true } : {}),
    })),
    labels: labels.map((l) => ({
      time: T(l.x), price: l.y, text: l.bull ? '+RD' : '-RD', color: l.bull ? GREEN : RED, textColor: '#FFFFFF',
      size: 'tiny' as const, style: l.bull ? 'label_up' as const : 'label_down' as const,
      ...(l.overlay ? { forceOverlay: true } : {}),
    })),
  };
}

export const CumulativeVolumeDeltaDivergencePeriodic = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
