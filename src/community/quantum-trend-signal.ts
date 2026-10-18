/**
 * Quantum Trend Signal
 *
 * Fast and slow EMAs of the close. A BUY triangle is drawn when the fast EMA crosses over the slow EMA while the RSI
 * is above 55 and the ATR is above its 20-bar SMA times the ATR filter; a SELL triangle when the fast EMA crosses
 * under the slow EMA while the RSI is below 45 with the same volatility filter. The background is green while the
 * fast EMA is above the slow EMA and red while it is below.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' and 'Sell Alert', true on the bars of the triangles.
 *
 * Reference: "Quantum Trend Signal" by ReubenMiles
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ExpertTraderASK
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'Quantum Trend BUY' },
  { id: 'alert1', title: 'Sell Alert', message: 'Quantum Trend SELL' },
];

export interface QuantumTrendSignalInputs {
  fastEMA: number;
  slowEMA: number;
  rsiLen: number;
  atrLen: number;
  /** The ATR must be above its 20-bar SMA times this factor */
  atrFilter: number;
}

export const defaultInputs: QuantumTrendSignalInputs = {
  fastEMA: 21,
  slowEMA: 55,
  rsiLen: 14,
  atrLen: 14,
  atrFilter: 0.8,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastEMA', type: 'int', title: 'Fast EMA', defval: 21 },
  { id: 'slowEMA', type: 'int', title: 'Slow EMA', defval: 55 },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'atrFilter', type: 'float', title: 'ATR Filter', defval: 0.8 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast EMA', color: color.aqua, lineWidth: 2 },
  { id: 'plot1', title: 'Slow EMA', color: color.orange, lineWidth: 2 },
];

export const metadata = {
  title: 'Quantum Trend Signal',
  shortTitle: 'Quantum Trend Signal',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<QuantumTrendSignalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const emaFast = A(ta.ema(close, cfg.fastEMA));
  const emaSlow = A(ta.ema(close, cfg.slowEMA));
  const rsi = A(ta.rsi(close, cfg.rsiLen));
  const atrS = ta.atr(bars, cfg.atrLen);
  const atr = A(atrS);
  const atrAvg = A(ta.sma(atrS, 20));

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const upCol = String(color.new(color.green, 92));
  const downCol = String(color.new(color.red, 92));
  // ta.crossover / ta.crossunder: compared with the last bar where both values were not na; a tie there counts.
  // The comparisons are exact (no 1e-10 tolerance).
  let prevF = NaN;
  let prevS = NaN;
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    const crossUp = f > s && prevF <= prevS;
    const crossDown = f < s && prevF >= prevS;
    if (!isNaN(f) && !isNaN(s)) {
      prevF = f;
      prevS = s;
    }
    const volatilityOK = gt(atr[i], atrAvg[i] * cfg.atrFilter);
    const buy = crossUp && gt(rsi[i], 55) && volatilityOK;
    const sell = crossDown && lt(rsi[i], 45) && volatilityOK;
    buyFlags.push(buy);
    sellFlags.push(sell);
    // plotshape(buy, "BUY", location.belowbar, color.lime, shape.triangleup, size = size.small, text = "BUY")
    if (buy) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'small',
        text: 'BUY', textColor: color.blue });
    }
    // plotshape(sell, "SELL", location.abovebar, color.red, shape.triangledown, size = size.small, text = "SELL")
    if (sell) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small',
        text: 'SELL', textColor: color.blue });
    }
    // bgcolor(upTrend ? color.new(color.green, 92) : downTrend ? color.new(color.red, 92) : na)
    if (gt(f, s)) bgColors.push({ time: bars[i].time, color: upCol });
    else if (lt(f, s)) bgColors.push({ time: bars[i].time, color: downCol });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: emaFast[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: emaSlow[i] })),
    },
    markers,
    bgColors,
    // alertcondition(buy, "Buy Alert") / alertcondition(sell, "Sell Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

export const QuantumTrendSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
