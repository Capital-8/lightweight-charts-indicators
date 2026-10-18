/**
 * Advanced Dual Hull Cross Suite v6 - Precision Signals
 *
 * Two Hull moving averages, each of a selectable variant: HMA = WMA(2 * WMA(src, len / 2) - WMA(src, len),
 * round(sqrt(len))), EHMA = the same with EMAs, THMA = WMA(3 * WMA(src, l / 3) - WMA(src, l / 2) - WMA(src, l), l)
 * with l = len / 2. Fractional lengths are truncated by the moving averages. Each line is coloured up when it rises,
 * down otherwise. BUY / SELL labels are drawn at the line of suite 2 when it crosses over / under the line of
 * suite 1. Alerts (alert() calls, `alertCalls` of the result, once per bar close): "Bullish Cross at <suite 2 line>"
 * and "Bearish Cross at <suite 2 line>" on the crosses.
 *
 * Reference: "Advanced Dual Hull Cross Suite v6 - Precision Signals" by NitMan279
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

type HullMode = 'Hma' | 'Thma' | 'Ehma';

export interface AdvancedDualHullCrossSuiteInputs {
  src1: SourceType;
  mode1: HullMode;
  len1: number;
  vis1: boolean;
  colorUp1: string;
  colorDown1: string;
  /** Line width of suite 1 (the plot width of the config stays at the default 2) */
  thick1: number;
  src2: SourceType;
  mode2: HullMode;
  len2: number;
  vis2: boolean;
  colorUp2: string;
  colorDown2: string;
  /** Line width of suite 2 (the plot width of the config stays at the default 2) */
  thick2: number;
}

export const defaultInputs: AdvancedDualHullCrossSuiteInputs = {
  src1: 'close',
  mode1: 'Hma',
  len1: 14,
  vis1: true,
  colorUp1: '#00ff00',
  colorDown1: '#ff0000',
  thick1: 2,
  src2: 'close',
  mode2: 'Thma',
  len2: 16,
  vis2: true,
  colorUp2: '#00bcd4',
  colorDown2: '#e91e63',
  thick2: 2,
};

const MODES = ['Hma', 'Thma', 'Ehma'];

export const inputConfig: InputConfig[] = [
  { id: 'src1', type: 'source', title: 'Source', defval: 'close', group: 'Suite 1 (Slow/Base)' },
  { id: 'mode1', type: 'string', title: 'Variation', defval: 'Hma', options: MODES, group: 'Suite 1 (Slow/Base)' },
  { id: 'len1', type: 'int', title: 'Length', defval: 14, group: 'Suite 1 (Slow/Base)' },
  { id: 'vis1', type: 'bool', title: 'Show Suite 1?', defval: true, group: 'Suite 1 (Slow/Base)' },
  { id: 'colorUp1', type: 'color', title: 'Color Up', defval: '#00ff00', group: 'Suite 1 (Slow/Base)' },
  { id: 'colorDown1', type: 'color', title: 'Color Down', defval: '#ff0000', group: 'Suite 1 (Slow/Base)' },
  { id: 'thick1', type: 'int', title: 'Thickness', defval: 2, min: 1, max: 5, group: 'Suite 1 (Slow/Base)' },
  { id: 'src2', type: 'source', title: 'Source', defval: 'close', group: 'Suite 2 (Fast/Cross)' },
  { id: 'mode2', type: 'string', title: 'Variation', defval: 'Thma', options: MODES, group: 'Suite 2 (Fast/Cross)' },
  { id: 'len2', type: 'int', title: 'Length', defval: 16, group: 'Suite 2 (Fast/Cross)' },
  { id: 'vis2', type: 'bool', title: 'Show Suite 2?', defval: true, group: 'Suite 2 (Fast/Cross)' },
  { id: 'colorUp2', type: 'color', title: 'Color Up', defval: '#00bcd4', group: 'Suite 2 (Fast/Cross)' },
  { id: 'colorDown2', type: 'color', title: 'Color Down', defval: '#e91e63', group: 'Suite 2 (Fast/Cross)' },
  { id: 'thick2', type: 'int', title: 'Thickness', defval: 2, min: 1, max: 5, group: 'Suite 2 (Fast/Cross)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Suite 1 Line', color: '#00ff00', lineWidth: 2 },
  { id: 'plot1', title: 'Suite 2 Line', color: '#00bcd4', lineWidth: 2 },
];

export const metadata = {
  title: 'Advanced Dual Hull Cross Suite v6 - Precision Signals',
  shortTitle: 'Advanced Dual Hull Cross Suite v6 - Precision Signals',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AdvancedDualHullCrossSuiteInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const zip = (f: (...v: number[]) => number, ...xs: number[][]) => xs[0].map((_v, i) => f(...xs.map((x) => x[i])));
  // Pine v6: int / int keeps the fractional quotient; ta.wma / ta.ema truncate the length
  const wma = (x: number[], len: number) => A(ta.wma(S(x), len));
  const ema = (x: number[], len: number) => A(ta.ema(S(x), len));

  const hma = (x: number[], length: number) =>
    wma(zip((a, b) => 2 * a - b, wma(x, length / 2), wma(x, length)), Math.round(Math.sqrt(length)));
  const ehma = (x: number[], length: number) =>
    ema(zip((a, b) => 2 * a - b, ema(x, length / 2), ema(x, length)), Math.round(Math.sqrt(length)));
  const thma = (x: number[], length: number) =>
    wma(zip((a, b, c) => a * 3 - b - c, wma(x, length / 3), wma(x, length / 2), wma(x, length)), length);
  const getHull = (mode: string, x: number[], len: number): number[] => {
    switch (mode) {
      case 'Hma': return hma(x, len);
      case 'Ehma': return ehma(x, len);
      case 'Thma': return thma(x, len / 2);
      default: return new Array(n).fill(NaN);
    }
  };

  const mhull1 = getHull(cfg.mode1, A(getSourceSeries(bars, cfg.src1)), cfg.len1);
  const mhull2 = getHull(cfg.mode2, A(getSourceSeries(bars, cfg.src2)), cfg.len2);
  const buy = A(ta.crossover(S(mhull2), S(mhull1)));
  const sell = A(ta.crossunder(S(mhull2), S(mhull1)));

  const val = (v: number) => (Number.isFinite(v) ? v : NaN);
  const rising = (x: number[], i: number) => i > 0 && gt(x[i], x[i - 1]);
  const plot0 = bars.map((b, i) => ({
    time: b.time, value: cfg.vis1 ? val(mhull1[i]) : NaN, color: rising(mhull1, i) ? cfg.colorUp1 : cfg.colorDown1,
  }));
  const plot1 = bars.map((b, i) => ({
    time: b.time, value: cfg.vis2 ? val(mhull2[i]) : NaN, color: rising(mhull2, i) ? cfg.colorUp2 : cfg.colorDown2,
  }));

  // plotshape(buySignal ? mhull2 : na, "Buy", shape.labelup, location.absolute, color.green, 0, "BUY", color.white,
  // size = size.small); plotshape(sellSignal ? mhull2 : na, "Sell", shape.labeldown, ...)
  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  for (let i = 0; i < n; i++) {
    // if buySignal: alert("Bullish Cross at " + str.tostring(mhull2), alert.freq_once_per_bar_close); sell alike
    if (buy[i]) alertCalls.push({ time: bars[i].time, message: 'Bullish Cross at ' + str.tostring(mhull2[i]), freq: 'once_per_bar_close' });
    if (sell[i]) alertCalls.push({ time: bars[i].time, message: 'Bearish Cross at ' + str.tostring(mhull2[i]), freq: 'once_per_bar_close' });
    const price = val(mhull2[i]);
    if (Number.isNaN(price)) continue;
    if (buy[i]) {
      markers.push({ time: bars[i].time, position: 'atPriceBottom', price, shape: 'labelUp', color: color.green,
        text: 'BUY', textColor: color.white, size: 'small' });
    }
    if (sell[i]) {
      markers.push({ time: bars[i].time, position: 'atPriceTop', price, shape: 'labelDown', color: color.red,
        text: 'SELL', textColor: color.white, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    alertCalls,
  };
}

export const AdvancedDualHullCrossSuite = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
