/**
 * Parabolic SAR + EMA 200 + MACD Signals
 *
 * Combined indicator using SAR, EMA200, and MACD histogram for buy/sell signals.
 * Buy: SAR below price AND close > EMA200 AND MACD histogram > 0.
 * Sell: SAR above price AND close < EMA200 AND MACD histogram < 0.
 * Alerts (alertcondition, `alerts` of the result), with the original's rule: buy = SAR below the low, the MACD
 * histogram (EMA 12 - EMA 26 minus its EMA 9) crossing above 0 and ohlc4 not below the EMA 200; sell = SAR above the
 * high, the histogram crossing below 0 and ohlc4 below the EMA 200.
 *
 * Reference: "Parabolic SAR + EMA 200 + MACD Signals" (community)
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SAREMAMACDInputs {
  sarStart: number;
  sarInc: number;
  sarMax: number;
  emaLen: number;
}

export const defaultInputs: SAREMAMACDInputs = {
  sarStart: 0.02,
  sarInc: 0.02,
  sarMax: 0.2,
  emaLen: 200,
};

export const inputConfig: InputConfig[] = [
  { id: 'sarStart', type: 'float', title: 'SAR Start', defval: 0.02, min: 0.001, step: 0.01 },
  { id: 'sarInc', type: 'float', title: 'SAR Increment', defval: 0.02, min: 0.001, step: 0.01 },
  { id: 'sarMax', type: 'float', title: 'SAR Max', defval: 0.2, min: 0.01, step: 0.01 },
  { id: 'emaLen', type: 'int', title: 'EMA Length', defval: 200, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SAR', color: '#2962FF', lineWidth: 1, style: 'circles' },
  { id: 'plot1', title: 'EMA 200', color: '#787B86', lineWidth: 2 },
];

export const metadata = {
  title: 'SAR + EMA + MACD Signals',
  shortTitle: 'SEM',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SAREMAMACDInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { sarStart, sarInc, sarMax, emaLen } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const closeSeries = new Series(bars, (b) => b.close);
  const ema200 = ta.ema(closeSeries, emaLen);
  const ema200Arr = ema200.toArray();

  // Manual SAR computation
  const sarArr: number[] = new Array(n);
  const sarDirArr: number[] = new Array(n); // 1 = bullish (SAR below), -1 = bearish (SAR above)

  let af = sarStart;
  let ep = bars[0].high;
  sarArr[0] = bars[0].low;
  sarDirArr[0] = 1;

  for (let i = 1; i < n; i++) {
    const prevDir = sarDirArr[i - 1];
    let sar = sarArr[i - 1] + af * (ep - sarArr[i - 1]);

    if (prevDir === 1) {
      sar = Math.min(sar, bars[i - 1].low);
      if (i >= 2) sar = Math.min(sar, bars[i - 2].low);
      if (bars[i].low < sar) {
        sarDirArr[i] = -1;
        sar = ep;
        ep = bars[i].low;
        af = sarStart;
      } else {
        sarDirArr[i] = 1;
        if (bars[i].high > ep) {
          ep = bars[i].high;
          af = Math.min(af + sarInc, sarMax);
        }
      }
    } else {
      sar = Math.max(sar, bars[i - 1].high);
      if (i >= 2) sar = Math.max(sar, bars[i - 2].high);
      if (bars[i].high > sar) {
        sarDirArr[i] = 1;
        sar = ep;
        ep = bars[i].high;
        af = sarStart;
      } else {
        sarDirArr[i] = -1;
        if (bars[i].low < ep) {
          ep = bars[i].low;
          af = Math.min(af + sarInc, sarMax);
        }
      }
    }
    sarArr[i] = sar;
  }

  // MACD histogram
  const macdFastEma = ta.ema(closeSeries, 12);
  const macdSlowEma = ta.ema(closeSeries, 26);
  const macdLine = macdFastEma.sub(macdSlowEma);
  const macdSignal = ta.ema(macdLine, 9);
  const macdHist = macdLine.sub(macdSignal);
  const macdHistArr = macdHist.toArray();

  const warmup = emaLen;
  const markers: MarkerData[] = [];

  for (let i = warmup + 1; i < n; i++) {
    const close = bars[i].close;
    const emaVal = ema200Arr[i] ?? 0;
    const histVal = macdHistArr[i] ?? 0;
    const sarBelow = sarDirArr[i] === 1;
    const sarAbove = sarDirArr[i] === -1;
    const prevSarBelow = sarDirArr[i - 1] === 1;
    const prevSarAbove = sarDirArr[i - 1] === -1;

    if (sarBelow && !prevSarBelow && close > emaVal && histVal > 0) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#26A69A', text: 'Buy' });
    } else if (sarAbove && !prevSarAbove && close < emaVal && histVal < 0) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#EF5350', text: 'Sell' });
    }
  }

  const plot0 = sarArr.map((v, i) => ({
    time: bars[i].time,
    value: i < 1 ? NaN : v,
    color: sarDirArr[i] === 1 ? '#26A69A' : '#EF5350',
  }));

  const plot1 = ema200Arr.map((v, i) => ({
    time: bars[i].time,
    value: (v == null || i < warmup) ? NaN : v,
  }));

  // The original's alert rule: SAR = ta.sar(start, inc, max); main_trend = ohlc4 < EMA_200 ? "Bearish" : "Bullish"
  // (na EMA = Bullish); buy_signal = SAR < low and ta.crossover(delta, 0) and Bullish; sell_signal = SAR > high and
  // ta.crossunder(delta, 0) and Bearish
  const pineSar = ta.sar(bars, sarStart, sarInc, sarMax).toArray().map((v) => v ?? NaN);
  const delta = macdHistArr.map((v) => v ?? NaN);
  const deltaUp = crossedOver(delta, 0);
  const deltaDown = crossedUnder(delta, 0);
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const bearish = lt((b.open + b.high + b.low + b.close) / 4, ema200Arr[i] ?? NaN);
    buyFlags.push(lt(pineSar[i], b.low) && deltaUp[i] && !bearish);
    sellFlags.push(gt(pineSar[i], b.high) && deltaDown[i] && bearish);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1 },
    markers,
    // alertcondition(buy_signal, 'SAR EMA200 MACD Buy signal!') / alertcondition(sell_signal, '... Sell signal!')
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'SAR EMA200 MACD Buy signal!', message: 'Buy signal' },
  { id: 'alert1', title: 'SAR EMA200 MACD Sell signal!', message: 'Sell signal' },
];

export const SAREMAMACDSignals = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
