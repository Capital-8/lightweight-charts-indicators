/**
 * Actually Engulfing Candlesticks
 *
 * Bullish engulfing: volume above its SMA, the previous low is the lowest low of the last `reversalLookback` bars
 * before the current bar, the close is above the highest high of the last `engulfingLookback` bars before the current
 * bar, and the RSI is below 50 and above its own SMA. Bearish engulfing is the mirror (previous high is the highest
 * high, close below the lowest low, RSI above 50 and below its SMA). Lime circles below the bar mark bullish
 * signals, fuchsia circles above the bar mark bearish signals.
 *
 * Alerts (alert() calls, `alertCalls` of the result): "Bullish Engulfing" on each bullish bar and "Bearish Engulfing"
 * on each bearish bar, once per bar close.
 *
 * Reference: "Actually Engulfing Candlesticks" by llbot
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © llbot
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';

export interface ActuallyEngulfingCandlesticksInputs {
  reversalLookback: number;
  engulfingLookback: number;
  rsiLookback: number;
  useBullishEngulfing: boolean;
  useBearishEngulfing: boolean;
}

export const defaultInputs: ActuallyEngulfingCandlesticksInputs = {
  reversalLookback: 5,
  engulfingLookback: 2,
  rsiLookback: 14,
  useBullishEngulfing: true,
  useBearishEngulfing: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'reversalLookback', type: 'int', title: 'Reversal Lookback', defval: 5 },
  { id: 'engulfingLookback', type: 'int', title: 'Engulfing Lookback', defval: 2 },
  { id: 'rsiLookback', type: 'int', title: 'RSI Lookback', defval: 14 },
  { id: 'useBullishEngulfing', type: 'bool', title: 'Bullish Engulfing', defval: true },
  { id: 'useBearishEngulfing', type: 'bool', title: 'Bearish Engulfing', defval: true },
];

// Only markers (plotshape): no line plots
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Actually Engulfing Candlesticks',
  shortTitle: 'Actually Engulfing Candlesticks',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ActuallyEngulfingCandlesticksInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (arr: number[]) => Series.fromArray(bars, arr);

  const volume = bars.map((b) => b.volume ?? NaN);
  const low1 = bars.map((_, i) => (i > 0 ? bars[i - 1].low : NaN));
  const high1 = bars.map((_, i) => (i > 0 ? bars[i - 1].high : NaN));

  const volumeAverage = A(ta.sma(S(volume), cfg.reversalLookback));
  const rsiS = ta.rsi(S(bars.map((b) => b.close)), cfg.rsiLookback);
  const rsi = A(rsiS);
  const rsiAverage = A(ta.sma(rsiS, cfg.rsiLookback));

  const reversalLow = A(ta.lowest(S(low1), cfg.reversalLookback));
  const engulfingHigh = A(ta.highest(S(high1), cfg.engulfingLookback));
  const reversalHigh = A(ta.highest(S(high1), cfg.reversalLookback));
  const engulfingLow = A(ta.lowest(S(low1), cfg.engulfingLookback));

  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const bullishEngulfing = gt(volume[i], volumeAverage[i]) && eq(reversalLow[i], low1[i])
      && gt(close, engulfingHigh[i]) && lt(rsi[i], 50) && gt(rsi[i], rsiAverage[i]);
    const bearishEngulfing = gt(volume[i], volumeAverage[i]) && eq(reversalHigh[i], high1[i])
      && lt(close, engulfingLow[i]) && gt(rsi[i], 50) && lt(rsi[i], rsiAverage[i]);
    const bullish = cfg.useBullishEngulfing && bullishEngulfing;
    const bearish = cfg.useBearishEngulfing && bearishEngulfing;
    // plotshape(bullish, 'Bullish Engulfing', shape.circle, location.belowbar, color.lime, size = size.tiny)
    if (bullish) markers.push({ time: bars[i].time, position: 'belowBar', shape: 'circle', color: color.lime, size: 'tiny' });
    // plotshape(bearish, 'Bearish Engulfing', shape.circle, location.abovebar, color.fuchsia, size = size.tiny)
    if (bearish) markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'circle', color: color.fuchsia, size: 'tiny' });
    // if bullish: alert('Bullish Engulfing', alert.freq_once_per_bar_close); if bearish: alert('Bearish Engulfing', ...)
    if (bullish) alertCalls.push({ time: bars[i].time, message: 'Bullish Engulfing', freq: 'once_per_bar_close' });
    if (bearish) alertCalls.push({ time: bars[i].time, message: 'Bearish Engulfing', freq: 'once_per_bar_close' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    alertCalls,
  };
}

export const hasAlertFunction = true;

export const ActuallyEngulfingCandlesticks = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
