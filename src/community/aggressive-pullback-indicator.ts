/**
 * Aggressive Pullback Indicator
 *
 * Marks bullish engulfing candles above a 50 EMA and bearish engulfing candles below it when they follow a pullback
 * (open below / above the open of 2 bars ago) and pass the swing and EMA-touch rules of the script.
 * On a signal bar the stop price (5-bar swing low / high plus an ATR(14) buffer) and the target price (stop distance
 * times the risk:reward) are plotted on the signal bar and on the next bar.
 * Alerts (alertcondition, `alerts` of the result): 'API Alert!', true on the bars of a long or a short signal.
 *
 * Reference: "Aggressive Pullback Indicator" by ZenAndTheArtOfTrading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AggressivePullbackIndicatorInputs {
  /** EMA Length */
  emaLength: number;
  /** Stop loss distance from the 5-bar high / low, in ATR(14) */
  stopSizeInput: number;
  /** Risk:reward of the target */
  riskToReward: number;
}

export const defaultInputs: AggressivePullbackIndicatorInputs = {
  emaLength: 50,
  stopSizeInput: 1.0,
  riskToReward: 1.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaLength', type: 'int', title: 'EMA Length:', defval: 50, min: 1 },
  { id: 'stopSizeInput', type: 'float', title: 'Stop Distance (ATR):', defval: 1.0, min: 0.0 },
  { id: 'riskToReward', type: 'float', title: 'R:R:', defval: 1.0, min: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA', color: color.red, lineWidth: 1 },
  { id: 'plot1', title: 'Long Stop Price', color: color.red, lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Short Stop Price', color: color.red, lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'Long Target Price', color: color.green, lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Short Target Price', color: color.green, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Aggressive Pullback Indicator',
  shortTitle: 'API',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<AggressivePullbackIndicatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { emaLength, stopSizeInput, riskToReward } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const closeS = new Series(bars, (b) => b.close);
  const ema = ta.ema(closeS, emaLength).toArray();
  const currentATR = ta.atr(bars, 14).toArray();
  const lowest5Low = ta.lowest(new Series(bars, (b) => b.low), 5).toArray();
  const highest5High = ta.highest(new Series(bars, (b) => b.high), 5).toArray();
  const highest5Open = ta.highest(new Series(bars, (b) => b.open), 5).toArray();
  const lowest5Open = ta.lowest(new Series(bars, (b) => b.open), 5).toArray();

  // x[k] of a bar field (na before the first bar)
  const at = (i: number, k: number, f: 'open' | 'high' | 'low' | 'close') => (i - k >= 0 ? bars[i - k][f] : NaN);

  const validLong: boolean[] = new Array(n);
  const validShort: boolean[] = new Array(n);
  const tradeStopPrice: number[] = new Array(n);
  const tradeTargetPrice: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const { open, close } = bars[i];
    const e = ema[i];
    const stopSize = currentATR[i] * stopSizeInput;
    const longEntrySize = close - lowest5Low[i] + stopSize;
    const shortEntrySize = highest5High[i] - close + stopSize;
    const o1 = at(i, 1, 'open'), c1 = at(i, 1, 'close'), o2 = at(i, 2, 'open'), o5 = at(i, 5, 'open');
    const h1 = at(i, 1, 'high'), h2 = at(i, 2, 'high'), l1 = at(i, 1, 'low'), l2 = at(i, 2, 'low');
    const c2 = at(i, 2, 'close');

    // Comparisons with na are false in Pine
    const rule1L = close > e && o1 > c1 && close > open && close >= o1 && c1 >= open && close - open > o1 - c1;
    const rule2L = open < o2;
    const rule3L = close < o5;
    const rule4L = close < highest5Open[i];
    const rule5L = highest5High[i] > e && (h1 > e || h2 > e);
    const rule6L = close > e && (c1 > e || c2 > e);
    validLong[i] = rule1L && rule2L && (rule3L || rule4L) && rule5L && rule6L;

    const rule1S = close < e && c1 > o1 && open > close && open >= c1 && o1 >= close && open - close > c1 - o1;
    const rule2S = open > o2;
    const rule3S = close > o5;
    const rule4S = close > lowest5Open[i];
    const rule5S = lowest5Low[i] < e && (l1 < e || l2 < e);
    const rule6S = close < e && (c1 < e || c2 < e);
    validShort[i] = rule1S && rule2S && (rule3S || rule4S) && rule5S && rule6S;

    // tradeStopPrice = 0.0 and tradeTargetPrice = 0.0 on every bar (not var)
    let stop = 0.0;
    let target = 0.0;
    if (validLong[i]) {
      stop = close - longEntrySize;
      target = close + longEntrySize * riskToReward;
    }
    if (validShort[i]) {
      stop = close + shortEntrySize;
      target = close - shortEntrySize * riskToReward;
    }
    tradeStopPrice[i] = stop;
    tradeTargetPrice[i] = target;
  }

  // plot(valid or valid[1] ? valid ? price : price[1] : na)
  const twoBars = (valid: boolean[], price: number[]) =>
    bars.map((b, i) => {
      const prev = i > 0 && valid[i - 1];
      const value = valid[i] ? price[i] : prev ? price[i - 1] : NaN;
      return { time: b.time, value };
    });

  const plot0 = bars.map((b, i) => ({ time: b.time, value: ema[i] }));

  // plotshape(validLong, location.belowbar, color.green, shape.triangleup) and
  // plotshape(validShort, color.red, shape.triangledown) (default location.abovebar, default size.auto)
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    if (validLong[i]) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'auto' });
    }
    if (validShort[i]) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'auto' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0,
      plot1: twoBars(validLong, tradeStopPrice),
      plot2: twoBars(validShort, tradeStopPrice),
      plot3: twoBars(validLong, tradeTargetPrice),
      plot4: twoBars(validShort, tradeTargetPrice),
    },
    markers,
    // alertcondition(validLong or validShort, "API Alert!")
    alerts: alertStates(alertConditions, bars, [validLong.map((v, i) => v || validShort[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'API Alert!', message: 'Pullback signal for {{ticker}}' },
];

export const AggressivePullbackIndicator = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
