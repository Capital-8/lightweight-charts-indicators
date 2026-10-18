/**
 * Renko Sniper PRO (Liquidity Sweep + EMA + ST + RSI)
 *
 * A fast and a slow EMA of the close and a Supertrend line (green when the Supertrend direction is 1, red
 * otherwise). A liquidity sweep is marked when the bar goes past the highest high (lowest low) of the last
 * `lookback` bars and closes back inside: high > ta.highest(high, lookback) and close < ta.highest(high, lookback)
 * (low < ta.lowest(low, lookback) and close > ta.lowest(low, lookback)). The window of ta.highest / ta.lowest
 * includes the current bar, so the high is never above it and the sweep shapes never show (as in the original).
 * The long / short conditions (sweep + EMA cross + trend + Supertrend + RSI) feed the original's alert() calls
 * (`alertCalls` of the result, once per bar close); as they need a sweep, they never fire either. The script works on
 * any chart type; it reads no Renko data.
 *
 * Reference: "Renko Sniper PRO (Liquidity Sweep + EMA + ST + RSI)" by zachsprad
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © zachsprad
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';

/** The original calls alert() */
export const hasAlertFunction = true;

export interface RenkoSniperProInputs {
  emaFastLen: number;
  emaSlowLen: number;
  /** RSI length (only used by the alert conditions) */
  rsiLen: number;
  atrLen: number;
  factor: number;
  /** Liquidity lookback (bars) */
  lookback: number;
  /** Sweep sensitivity (%): computed by the original script but not used by any output */
  sweepBuffer: number;
}

export const defaultInputs: RenkoSniperProInputs = {
  emaFastLen: 9,
  emaSlowLen: 21,
  rsiLen: 14,
  atrLen: 10,
  factor: 3.0,
  lookback: 10,
  sweepBuffer: 0.1,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaFastLen', type: 'int', title: 'Fast EMA', defval: 9 },
  { id: 'emaSlowLen', type: 'int', title: 'Slow EMA', defval: 21 },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'atrLen', type: 'int', title: 'Supertrend ATR Length', defval: 10 },
  { id: 'factor', type: 'float', title: 'Supertrend Factor', defval: 3.0 },
  { id: 'lookback', type: 'int', title: 'Liquidity Lookback (bars)', defval: 10 },
  { id: 'sweepBuffer', type: 'float', title: 'Sweep Sensitivity (%)', defval: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 9', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'EMA 21', color: color.yellow, lineWidth: 1 },
  { id: 'plot2', title: 'Supertrend', color: color.green, lineWidth: 1 },
];

export const metadata = {
  title: 'Renko Sniper PRO',
  shortTitle: 'Renko Sniper PRO',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RenkoSniperProInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const close = bars.map((b) => b.close);
  const emaFast = A(ta.ema(S(close), cfg.emaFastLen));
  const emaSlow = A(ta.ema(S(close), cfg.emaSlowLen));
  const [stSeries, dirSeries] = ta.supertrend(bars, cfg.factor, cfg.atrLen);
  const supertrend = A(stSeries);
  const direction = A(dirSeries);
  const highestHigh = A(ta.highest(S(bars.map((b) => b.high)), cfg.lookback));
  const lowestLow = A(ta.lowest(S(bars.map((b) => b.low)), cfg.lookback));
  const rsi = A(ta.rsi(S(close), cfg.rsiLen));

  const finite = (v: number) => (Number.isFinite(v) ? v : NaN);
  const plot0 = bars.map((b, i) => ({ time: b.time, value: finite(emaFast[i]) }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: finite(emaSlow[i]) }));
  // plot(supertrend, color = direction == 1 ? color.green : color.red)
  const plot2 = bars.map((b, i) => ({
    time: b.time, value: finite(supertrend[i]), color: eq(direction[i], 1) ? color.green : color.red,
  }));

  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time as number;
    const liquiditySweepLow = lt(b.low, lowestLow[i]) && gt(b.close, lowestLow[i]);
    const liquiditySweepHigh = gt(b.high, highestHigh[i]) && lt(b.close, highestHigh[i]);
    // bullCross = ta.crossover(emaFast, emaSlow), bearCross = ta.crossunder(emaFast, emaSlow)
    const bullCross = i > 0 && gt(emaFast[i], emaSlow[i]) && !gt(emaFast[i - 1], emaSlow[i - 1])
      && !isNaN(emaFast[i - 1]) && !isNaN(emaSlow[i - 1]);
    const bearCross = i > 0 && lt(emaFast[i], emaSlow[i]) && !lt(emaFast[i - 1], emaSlow[i - 1])
      && !isNaN(emaFast[i - 1]) && !isNaN(emaSlow[i - 1]);
    // longCondition = liquiditySweepLow and bullCross and close > emaSlow and direction == 1 and rsi > 50
    const longCondition = liquiditySweepLow && bullCross && gt(b.close, emaSlow[i]) && eq(direction[i], 1) && gt(rsi[i], 50);
    const shortCondition = liquiditySweepHigh && bearCross && lt(b.close, emaSlow[i]) && eq(direction[i], -1) && lt(rsi[i], 50);
    if (longCondition) {
      alertCalls.push({ time: t, message: '🟢 LONG SWEEP: Liquidity Grab + Bullish Confirmation', freq: 'once_per_bar_close' });
    }
    if (shortCondition) {
      alertCalls.push({ time: t, message: '🔴 SHORT SWEEP: Liquidity Grab + Bearish Confirmation', freq: 'once_per_bar_close' });
    }
    // liquiditySweepLow = low < lowestLow and close > lowestLow
    if (liquiditySweepLow) {
      markers.push({ time: b.time as number, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'small' });
    }
    // liquiditySweepHigh = high > highestHigh and close < highestHigh
    if (liquiditySweepHigh) {
      markers.push({ time: b.time as number, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    markers,
    alertCalls,
  };
}

export const RenkoSniperPro = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
