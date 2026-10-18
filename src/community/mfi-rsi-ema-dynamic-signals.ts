/**
 * MFI + RSI + EMA Dynamic Signals
 *
 * Fast and slow EMAs of the close on the price chart, with the MFI and the RSI of the close (pane-only plots) and
 * their levels. A buy signal on the bar after (the MFI crosses above the oversold level, or the fast EMA crosses above
 * the slow EMA) with (the RSI above the buy threshold, or the EMAs within the proximity percentage of each other); a
 * sell signal on the bar after (the MFI crosses under the overbought level, or the fast EMA crosses under the slow
 * EMA) with (the RSI under the sell threshold, or the EMAs within the proximity percentage).
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' and 'Sell Signal', true on the bars of the signals.
 *
 * Reference: "MFI + RSI + EMA Dynamic Signals" by Raisontgh
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Raisontgh
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'MFI + RSI + EMA Buy Signal v6' },
  { id: 'alert1', title: 'Sell Signal', message: 'MFI + RSI + EMA Sell Signal v6' },
];

export interface MfiRsiEmaDynamicSignalsInputs {
  mfiLength: number;
  mfiOverbought: number;
  mfiOversold: number;
  rsiLength: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
  fastEmaLength: number;
  slowEmaLength: number;
  /** EMA proximity threshold (%) */
  emaProximity: number;
}

export const defaultInputs: MfiRsiEmaDynamicSignalsInputs = {
  mfiLength: 14,
  mfiOverbought: 70,
  mfiOversold: 30,
  rsiLength: 14,
  rsiBuyThreshold: 45,
  rsiSellThreshold: 55,
  fastEmaLength: 9,
  slowEmaLength: 21,
  emaProximity: 0.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'mfiLength', type: 'int', title: 'MFI Length', defval: 14, min: 1 },
  { id: 'mfiOverbought', type: 'int', title: 'MFI Overbought Level', defval: 70, min: 50, max: 100 },
  { id: 'mfiOversold', type: 'int', title: 'MFI Oversold Level', defval: 30, min: 0, max: 50 },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'rsiBuyThreshold', type: 'int', title: 'RSI Buy Threshold', defval: 45, min: 0, max: 100 },
  { id: 'rsiSellThreshold', type: 'int', title: 'RSI Sell Threshold', defval: 55, min: 0, max: 100 },
  { id: 'fastEmaLength', type: 'int', title: 'Fast EMA Length', defval: 9, min: 1 },
  { id: 'slowEmaLength', type: 'int', title: 'Slow EMA Length', defval: 21, min: 1 },
  { id: 'emaProximity', type: 'float', title: 'EMA Proximity Threshold (%)', defval: 0.5, step: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast EMA', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'Slow EMA', color: color.red, lineWidth: 1 },
  { id: 'plot2', title: 'MFI', color: color.blue, lineWidth: 1, display: 'pane' },
  { id: 'plot3', title: 'RSI', color: color.orange, lineWidth: 1, display: 'pane' },
];

export const metadata = {
  title: 'MFI + RSI + EMA Dynamic Signals',
  shortTitle: 'MFI + RSI + EMA Dynamic Signals',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<MfiRsiEmaDynamicSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const B = (s: Series) => s.toArray().map((v) => Boolean(v));

  const close = S(bars.map((b) => b.close));
  const volume = S(bars.map((b) => b.volume ?? NaN));
  const mfi = A(ta.mfi(close, cfg.mfiLength, volume));
  const rsi = A(ta.rsi(close, cfg.rsiLength));
  const fastEma = A(ta.ema(close, cfg.fastEmaLength));
  const slowEma = A(ta.ema(close, cfg.slowEmaLength));

  const bullishMomentum = rsi.map((v) => gt(v, cfg.rsiBuyThreshold));
  const bearishMomentum = rsi.map((v) => lt(v, cfg.rsiSellThreshold));
  // ema_diff_percent = math.abs((fast_ema - slow_ema) / slow_ema * 100); a plain division (x / 0 is infinite)
  const emaNear = bars.map((_b, i) => le(Math.abs(((fastEma[i] - slowEma[i]) / slowEma[i]) * 100), cfg.emaProximity));
  const emaCrossover = B(ta.crossover(S(fastEma), S(slowEma)));
  const emaCrossunder = B(ta.crossunder(S(fastEma), S(slowEma)));
  // ta.crossover(mfi[1], level) / ta.crossunder(mfi[1], level)
  const mfi1 = S(mfi.map((_v, i) => (i > 0 ? mfi[i - 1] : NaN)));
  const mfiUp = B(ta.crossover(mfi1, cfg.mfiOversold));
  const mfiDown = B(ta.crossunder(mfi1, cfg.mfiOverbought));

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const near1 = emaNear[i - 1];
    const buy = (mfiUp[i] || emaCrossover[i - 1]) && (bullishMomentum[i - 1] || near1);
    const sell = (mfiDown[i] || emaCrossunder[i - 1]) && (bearishMomentum[i - 1] || near1);
    buyFlags[i] = buy;
    sellFlags[i] = sell;
    // plotshape(buy_signal, "Buy Signal", shape.triangleup, location.belowbar, color.green, size = size.small)
    if (buy) markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'small' });
    // plotshape(sell_signal, "Sell Signal", shape.triangledown, location.abovebar, color.red, size = size.small)
    if (sell) markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small' });
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(fastEma[i]) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(slowEma[i]) })),
      plot2: bars.map((b, i) => ({ time: b.time, value: fin(mfi[i]) })),
      plot3: bars.map((b, i) => ({ time: b.time, value: fin(rsi[i]) })),
    },
    hlines: [
      { value: cfg.mfiOverbought, options: { title: 'Overbought', color: color.red, linestyle: 'dashed' } },
      { value: cfg.mfiOversold, options: { title: 'Oversold', color: color.green, linestyle: 'dashed' } },
      { value: cfg.rsiBuyThreshold, options: { title: 'RSI Buy Threshold', color: color.green, linestyle: 'dashed' } },
      { value: cfg.rsiSellThreshold, options: { title: 'RSI Sell Threshold', color: color.red, linestyle: 'dashed' } },
    ],
    markers,
    // alertcondition(buy_signal, "Buy Signal") / alertcondition(sell_signal, "Sell Signal")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

export const MfiRsiEmaDynamicSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
