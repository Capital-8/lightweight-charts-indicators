/**
 * Candle Breakout Oscillator
 *
 * Each bar is a bullish breakout (close above the previous high), a bearish breakout (close below the previous low)
 * or sideways. For each kind, +1 (the bar is of that kind) or -1 (it is not) is kept for the last `window` bars,
 * optionally weighted by volume or by the breakout distance (the weighted sum is then divided by the sum of the
 * weights). Each sum is normalised to 0..100 against its lowest and highest value over `window` bars and smoothed
 * (method and length selectable). Three lines (bullish, bearish, sideways), circles where the bullish line crosses
 * above the bearish line and the reverse, and fills beyond the top and bottom thresholds.
 *
 * Reference: "Candle Breakout Oscillator [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';

export type CandleBreakoutSmoothing = 'None' | 'RMA' | 'SMA' | 'TMA' | 'EMA' | 'DEMA' | 'TEMA' | 'HMA' | 'WMA' | 'SWMA' | 'VWMA';
export type CandleBreakoutWeighting = 'None' | 'Volume' | 'Price';

export interface CandleBreakoutOscillatorInputs {
  /** Window (bars kept and normalisation length) */
  windowInput: number;
  /** Smoothing method */
  smoothingInput: CandleBreakoutSmoothing;
  /** Smoothing length */
  smoothingLengthInput: number;
  /** Weighting method */
  weightTypeInput: CandleBreakoutWeighting;
  /** Top threshold (50..100) */
  topThresholdInput: number;
  /** Bottom threshold (0..50) */
  bottomThresholdInput: number;
}

export const defaultInputs: CandleBreakoutOscillatorInputs = {
  windowInput: 100,
  smoothingInput: 'RMA',
  smoothingLengthInput: 2,
  weightTypeInput: 'None',
  topThresholdInput: 80,
  bottomThresholdInput: 20,
};

const SMOOTHING: CandleBreakoutSmoothing[] = ['None', 'RMA', 'SMA', 'TMA', 'EMA', 'DEMA', 'TEMA', 'HMA', 'WMA', 'SWMA', 'VWMA'];

export const inputConfig: InputConfig[] = [
  { id: 'windowInput', type: 'int', title: 'Window', defval: 100 },
  { id: 'smoothingInput', type: 'string', title: 'Smoothing Method', defval: 'RMA', options: SMOOTHING },
  { id: 'smoothingLengthInput', type: 'int', title: 'Smoothing Length', defval: 2, min: 1, max: 100, step: 1 },
  { id: 'weightTypeInput', type: 'string', title: 'Weighting Method', defval: 'None', options: ['None', 'Volume', 'Price'] },
  { id: 'topThresholdInput', type: 'int', title: 'Top', defval: 80, min: 50, max: 100 },
  { id: 'bottomThresholdInput', type: 'int', title: 'Bottom', defval: 20, min: 0, max: 50 },
];

const GREEN = '#089981';
const RED = '#F23645';
const bullColor = String(color.new(GREEN, 50));
const bearColor = String(color.new(RED, 50));
const sidewaysColor = String(color.new(color.silver, 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bullish', color: bullColor, lineWidth: 1 },
  { id: 'plot1', title: 'Bearish', color: bearColor, lineWidth: 1 },
  { id: 'plot2', title: 'Sideways', color: sidewaysColor, lineWidth: 1 },
  { id: 'plot3', title: 'Top', color: 'transparent', lineWidth: 1 },
  { id: 'plot4', title: 'Bottom', color: 'transparent', lineWidth: 1 },
];

export const metadata = {
  title: 'Candle Breakout Oscillator',
  shortTitle: 'Candle Breakout Oscillator',
  overlay: false,
};

/** Pine float comparison: a > b only when a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;
/**
 * x / 0 gives NaN. In Pine a non-zero x / 0 is +/-infinity, but here x is always 0 when the denominator is 0 (the sums
 * of the same weights; a value between its own lowest and highest), and Pine 0 / 0 is NaN too.
 */
const div = (a: number, b: number) => (b === 0 ? NaN : a / b);
/** Pine array.sum: the na elements are skipped */
const sum = (a: number[]) => a.reduce((s, v) => (isNaN(v) ? s : s + v), 0);

export function calculate(
  bars: Bar[],
  inputs: Partial<CandleBreakoutOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { windowInput: window, weightTypeInput: weightType, topThresholdInput: top, bottomThresholdInput: bottom } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // parseWeight(weight) => weightTypeInput != NONE ? (weightTypeInput == VOLUME ? volume : weight) : 1
  const parseWeight = (i: number, weight: number) =>
    weightType !== 'None' ? (weightType === 'Volume' ? bars[i].volume ?? NaN : weight) : 1;
  // array.push, then array.shift when the size is above `window`
  const add = (arr: number[], value: number) => {
    arr.push(value);
    if (arr.length > window) arr.shift();
  };
  const bulls: number[] = [];
  const bears: number[] = [];
  const sideways: number[] = [];
  const volumes: number[] = [];
  const bullWeights: number[] = [];
  const bearWeights: number[] = [];
  const sidewayWeights: number[] = [];
  const bullValue: number[] = new Array(n);
  const bearValue: number[] = new Array(n);
  const sidewaysValue: number[] = new Array(n);
  // value = weightTypeInput != NONE ? a_rray.sum() / (VOLUME ? volumes.sum() : weights.sum()) : a_rray.sum()
  const value = (arr: number[], weights: number[]) =>
    weightType !== 'None' ? div(sum(arr), weightType === 'Volume' ? sum(volumes) : sum(weights)) : sum(arr);
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const prevHigh = i > 0 ? bars[i - 1].high : NaN;
    const prevLow = i > 0 ? bars[i - 1].low : NaN;
    const bull = gt(close, prevHigh);
    const bear = gt(prevLow, close);
    const sideway = !bull && !bear;
    const bullWeight = Math.abs(close - prevHigh);
    const bearWeight = Math.abs(close - prevLow);
    const sidewayWeight = 1;
    add(bulls, (bull ? 1 : -1) * parseWeight(i, bullWeight));
    add(bears, (bear ? 1 : -1) * parseWeight(i, bearWeight));
    add(sideways, (sideway ? 1 : -1) * parseWeight(i, sidewayWeight));
    add(volumes, bars[i].volume ?? NaN);
    add(bullWeights, bullWeight);
    add(bearWeights, bearWeight);
    add(sidewayWeights, sidewayWeight);
    bullValue[i] = value(bulls, bullWeights);
    bearValue[i] = value(bears, bearWeights);
    sidewaysValue[i] = value(sideways, sidewayWeights);
  }

  // normalize: 100 * (value - ta.lowest(value, window)) / (ta.highest(value, window) - ta.lowest(value, window))
  const normalize = (v: number[]) => {
    const lo = A(ta.lowest(S(v), window));
    const hi = A(ta.highest(S(v), window));
    return v.map((x, i) => div(100 * (x - lo[i]), hi[i] - lo[i]));
  };
  const smooth = (data: number[]) => smoothSeries(bars, data, cfg.smoothingInput, cfg.smoothingLengthInput);
  const bullsN = smooth(normalize(bullValue));
  const bearsN = smooth(normalize(bearValue));
  const sidewaysN = smooth(normalize(sidewaysValue));

  const markers: MarkerData[] = [];
  const fillColors: string[][] = [[], [], [], [], []];
  const transparent = 'transparent';
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const bu = bullsN[i];
    const be = bearsN[i];
    const pbu = i > 0 ? bullsN[i - 1] : NaN;
    const pbe = i > 0 ? bearsN[i - 1] : NaN;
    // bullishCross = bulls > bears and bulls[1] <= bears[1]; bearishCross = bears > bulls and bears[1] <= bulls[1]
    const bullishCross = gt(bu, be) && !isNaN(pbu) && !isNaN(pbe) && !gt(pbu, pbe);
    const bearishCross = gt(be, bu) && !isNaN(pbu) && !isNaN(pbe) && !gt(pbe, pbu);
    // plotshape(bullsNormalized, 'Bullish Cross', circle, absolute, bullishCross ? color.new(bullColor, 0) : na, tiny)
    if (bullishCross && !isNaN(bu)) {
      markers.push({ id: 'shape0', time: t, position: 'atPriceMiddle', price: bu, shape: 'circle', color: String(color.new(bullColor, 0)), size: 'tiny' });
    }
    if (bearishCross && !isNaN(be)) {
      // plotshape(bearsNormalized, 'Bearish Cross', circle, absolute, bearishCross ? color.new(bearColor, 0) : na, tiny)
      markers.push({ id: 'shape1', time: t, position: 'atPriceMiddle', price: be, shape: 'circle', color: String(color.new(bearColor, 0)), size: 'tiny' });
    }
    fillColors[0].push(gt(bu, top) ? bullColor : transparent);
    fillColors[1].push(gt(bottom, bu) ? bullColor : transparent);
    fillColors[2].push(gt(be, top) ? bearColor : transparent);
    fillColors[3].push(gt(bottom, be) ? bearColor : transparent);
    fillColors[4].push(gt(bottom, sidewaysN[i]) ? sidewaysColor : transparent);
  }

  const line = (v: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: v[i], color: c }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(bullsN, bullColor),
      plot1: line(bearsN, bearColor),
      plot2: line(sidewaysN, sidewaysColor),
      plot3: bars.map((b) => ({ time: b.time, value: top, color: transparent })),
      plot4: bars.map((b) => ({ time: b.time, value: bottom, color: transparent })),
    },
    hlines: [
      { value: top, options: { title: 'Top Threshold', color: color.gray, linestyle: 'dashed', linewidth: 1 } },
      { value: bottom, options: { title: 'Bottom Threshold', color: color.gray, linestyle: 'dashed', linewidth: 1 } },
    ],
    fills: [
      { plot1: 'plot0', plot2: 'plot3', options: { title: 'Bullish Top Fill' }, colors: fillColors[0] },
      { plot1: 'plot0', plot2: 'plot4', options: { title: 'Bullish Bottom Fill' }, colors: fillColors[1] },
      { plot1: 'plot1', plot2: 'plot3', options: { title: 'Bearish Top Fill' }, colors: fillColors[2] },
      { plot1: 'plot1', plot2: 'plot4', options: { title: 'Bearish Bottom Fill' }, colors: fillColors[3] },
      { plot1: 'plot2', plot2: 'plot4', options: { title: 'Sideways Bottom Fill' }, colors: fillColors[4] },
    ],
    markers,
  };
}

/** smooth(data) of the script */
function smoothSeries(bars: Bar[], data: number[], method: CandleBreakoutSmoothing, len: number): number[] {
  const S = (a: number[]) => Series.fromArray(bars, a);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  switch (method) {
    case 'RMA': return A(ta.rma(S(data), len));
    case 'SMA': return A(ta.sma(S(data), len));
    case 'TMA': return A(ta.sma(ta.sma(S(data), len), len));
    case 'EMA': return A(ta.ema(S(data), len));
    case 'DEMA': {
      const e1 = ta.ema(S(data), len);
      const a1 = A(e1);
      const a2 = A(ta.ema(e1, len));
      return a1.map((v, i) => 2 * v - a2[i]);
    }
    case 'TEMA': {
      const e1 = ta.ema(S(data), len);
      const e2 = ta.ema(e1, len);
      const a1 = A(e1);
      const a2 = A(e2);
      const a3 = A(ta.ema(e2, len));
      return a1.map((v, i) => 3 * v - 3 * a2[i] + a3[i]);
    }
    case 'HMA': return A(ta.hma(S(data), len));
    case 'WMA': return A(ta.wma(S(data), len));
    case 'SWMA': return A(ta.swma(S(data)));
    case 'VWMA': return A(ta.vwma(S(data), len, new Series(bars, (b) => b.volume ?? NaN)));
    default: return data;
  }
}

export const CandleBreakoutOscillator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
