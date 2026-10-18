/**
 * Magnet Force + RSI Filter
 *
 * A band around the VWMA of the close (the magnet core): core +- mult * stdev(close, length). The background is red
 * when the close is above the upper band with RSI >= overbought, green when the close is below the lower band with
 * RSI <= oversold. A SELL label when the close crosses under the upper band with RSI[1] >= overbought, a BUY label
 * when the close crosses over the lower band with RSI[1] <= oversold.
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close) on the bars of the SELL / BUY signals.
 *
 * Reference: "Magnet Force + RSI Filter V6" by mehmetbezgincan
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BgColorData, MarkerData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface MagnetForceRsiFilterV6Inputs {
  /** Magnet core period (VWMA and stdev length) */
  length: number;
  /** Attraction strength (stdev multiplier) */
  mult: number;
  /** RSI period */
  rsiLength: number;
  /** RSI overbought level */
  rsiOverbought: number;
  /** RSI oversold level */
  rsiOversold: number;
}

export const defaultInputs: MagnetForceRsiFilterV6Inputs = {
  length: 20,
  mult: 2.0,
  rsiLength: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Magnet Core Period', defval: 20, min: 1 },
  { id: 'mult', type: 'float', title: 'Attraction Strength (Sigma)', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'rsiLength', type: 'int', title: 'RSI Period', defval: 14, min: 1 },
  { id: 'rsiOverbought', type: 'int', title: 'RSI Overbought Level', defval: 70 },
  { id: 'rsiOversold', type: 'int', title: 'RSI Oversold Level', defval: 30 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Magnet Core', color: String(color.new(color.gray, 0)), lineWidth: 2 },
  { id: 'plot1', title: 'Upper Bound', color: String(color.new(color.red, 60)), lineWidth: 1 },
  { id: 'plot2', title: 'Lower Bound', color: String(color.new(color.green, 60)), lineWidth: 1 },
];

export const metadata = {
  title: 'Magnet Force + RSI Filter V6',
  shortTitle: 'Magnet Force + RSI Filter V6',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<MagnetForceRsiFilterV6Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const close = S(bars.map((b) => b.close));
  const volume = S(bars.map((b) => b.volume ?? NaN));
  // magnet_core = ta.vwma(close, length); dev = mult * ta.stdev(close, length)
  const core = A(ta.vwma(close, cfg.length, volume));
  const sd = A(ta.stdev(close, cfg.length));
  const upper = core.map((c, i) => c + cfg.mult * sd[i]);
  const lower = core.map((c, i) => c - cfg.mult * sd[i]);
  const rsi = A(ta.rsi(close, cfg.rsiLength));
  // ta.crossunder(close, upper_attraction) / ta.crossover(close, lower_attraction): exact comparisons
  const crossUnder = A(ta.crossunder(close, S(upper)));
  const crossOver = A(ta.crossover(close, S(lower)));

  const bgRed = String(color.new(color.red, 90));
  const bgGreen = String(color.new(color.green, 90));
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  const t = (i: number) => bars[i].time;

  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const isOverbought = gt(c, upper[i]) && ge(rsi[i], cfg.rsiOverbought);
    const isOversold = lt(c, lower[i]) && le(rsi[i], cfg.rsiOversold);
    const rsiPrev = i > 0 ? rsi[i - 1] : NaN;
    const sellSignal = crossUnder[i] === 1 && ge(rsiPrev, cfg.rsiOverbought);
    const buySignal = crossOver[i] === 1 && le(rsiPrev, cfg.rsiOversold);

    // bgcolor(is_overbought ? red 90 : na); bgcolor(is_oversold ? green 90 : na): the later call is drawn on top
    if (isOversold) bgColors.push({ time: t(i), color: bgGreen });
    else if (isOverbought) bgColors.push({ time: t(i), color: bgRed });

    if (sellSignal) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.white, size: 'small' });
    }
    if (buySignal) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY',
        textColor: color.white, size: 'small' });
    }
    // if sell_signal alert("Magnet Pull Down: ...") / if buy_signal alert("Magnet Pull Up: ..."), once per bar close
    if (sellSignal) {
      alertCalls.push({ time: t(i), message: 'Magnet Pull Down: Price returning to core from Overbought', freq: 'once_per_bar_close' });
    }
    if (buySignal) {
      alertCalls.push({ time: t(i), message: 'Magnet Pull Up: Price returning to core from Oversold', freq: 'once_per_bar_close' });
    }
  }

  const P = (vals: number[]) => bars.map((b, i) => ({ time: b.time, value: vals[i] }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: P(core), plot1: P(upper), plot2: P(lower) },
    // fill(u_plot, l_plot, color = color.new(color.purple, 92), title = "Magnetic Field")
    fills: [{ plot1: 'plot1', plot2: 'plot2', options: { title: 'Magnetic Field', color: String(color.new(color.purple, 92)) } }],
    bgColors,
    markers,
    alertCalls,
  };
}

export const MagnetForceRsiFilterV6 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
