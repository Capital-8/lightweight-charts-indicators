/**
 * SSL Hybrid Scalper (Gold Scalping Strategy v6)
 *
 * Fast, slow and trend EMAs of the close. A buy label marks a crossover of the fast EMA over the slow EMA while the
 * RSI is below the overbought level and the close is above the trend EMA; a sell label marks a crossunder while the
 * RSI is above the oversold level and the close is below the trend EMA.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' and 'Sell Alert', true on the bars of each signal.
 *
 * Reference: "SSL Hybrid Scalper" by nabeel8369
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SslHybridScalperInputs {
  /** Fast EMA length */
  fastLength: number;
  /** Slow EMA length */
  slowLength: number;
  /** RSI length */
  rsiLength: number;
  /** RSI overbought level (buy signals need the RSI below it) */
  rsiOverbought: number;
  /** RSI oversold level (sell signals need the RSI above it) */
  rsiOversold: number;
  /** Trend filter EMA length */
  trendFilterLength: number;
}

export const defaultInputs: SslHybridScalperInputs = {
  fastLength: 8,
  slowLength: 21,
  rsiLength: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  trendFilterLength: 50,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast EMA Length', defval: 8 },
  { id: 'slowLength', type: 'int', title: 'Slow EMA Length', defval: 21 },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'rsiOverbought', type: 'int', title: 'RSI Overbought Level', defval: 70 },
  { id: 'rsiOversold', type: 'int', title: 'RSI Oversold Level', defval: 30 },
  { id: 'trendFilterLength', type: 'int', title: 'Trend Filter EMA Length', defval: 50 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast EMA', color: color.orange, lineWidth: 1 },
  { id: 'plot1', title: 'Slow EMA', color: color.blue, lineWidth: 1 },
  { id: 'plot2', title: 'Trend EMA', color: color.silver, lineWidth: 2 },
];

export const metadata = {
  title: 'Gold Scalping Strategy v6',
  shortTitle: 'Gold Scalping Strategy v6',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SslHybridScalperInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const fastEMA = A(ta.ema(close, cfg.fastLength));
  const slowEMA = A(ta.ema(close, cfg.slowLength));
  const trendEMA = A(ta.ema(close, cfg.trendFilterLength));
  const rsi = A(ta.rsi(close, cfg.rsiLength));

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  // ta.crossover / ta.crossunder compare with the last bar where both values were not na (exact comparisons:
  // no 1e-10 tolerance, unlike the operators)
  let prevF = NaN;
  let prevS = NaN;
  for (let i = 0; i < n; i++) {
    const f = fastEMA[i];
    const s = slowEMA[i];
    const both = !isNaN(f) && !isNaN(s);
    const crossUp = both && f > s && prevF <= prevS;
    const crossDown = both && f < s && prevF >= prevS;
    if (both) {
      prevF = f;
      prevS = s;
    }
    const c = bars[i].close;
    const trendUp = gt(c, trendEMA[i]);
    const trendDown = lt(c, trendEMA[i]);
    const buySignal = crossUp && lt(rsi[i], cfg.rsiOverbought) && trendUp;
    const sellSignal = crossDown && gt(rsi[i], cfg.rsiOversold) && trendDown;
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    const t = bars[i].time;
    if (buySignal) markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, size: 'small' });
    if (sellSignal) markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, size: 'small' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fastEMA[i], color: color.orange })),
      plot1: bars.map((b, i) => ({ time: b.time, value: slowEMA[i], color: color.blue })),
      plot2: bars.map((b, i) => ({ time: b.time, value: trendEMA[i], color: color.silver })),
    },
    markers,
    // alertcondition(buySignal, "Buy Alert") / alertcondition(sellSignal, "Sell Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'Bullish signal detected' },
  { id: 'alert1', title: 'Sell Alert', message: 'Bearish signal detected' },
];

export const SslHybridScalper = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
