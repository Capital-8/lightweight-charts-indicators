/**
 * Suppot and resistance & BUY SELL SIGNALS
 *
 * A channel of the highest high / lowest low over `length` bars and a second one of the highest / lowest close
 * (YPSAR / DPSAR), with the middle of each. A BUY label is drawn on a green candle that dips below DPSAR and closes
 * above it, with RSI oversold, ADX above the trend threshold and a liquidity trap (volume above the multiplier times
 * the `length`-bar average volume and a wick longer than the threshold share of the bar range). A SELL label is the
 * mirror case at YPSAR with RSI overbought on a red candle.
 * Alerts (alertcondition, `alerts` of the result): 'BUY Signal' and 'SELL Signal', true on the bars of each label.
 *
 * Reference: "Suppot and resistance & BUY SELL SIGNALS" by doganayy2
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © doganayy2
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY Signal', message: 'BUY signal detected!' },
  { id: 'alert1', title: 'SELL Signal', message: 'SELL signal detected!' },
];

export interface SuppotAndResistanceBuySellSignalsInputs {
  /** Channel / volume average period */
  length: number;
  /** Minimum wick share of the bar range */
  wickThreshold: number;
  /** Volume SMA period (not used by the Pine script outputs) */
  volumeSmaPeriod: number;
  /** Volume spike multiplier */
  volumeMultiplier: number;
  rsiPeriod: number;
  rsiOversoldLevel: number;
  rsiOverboughtLevel: number;
  /** ADX smoothing */
  adxLen: number;
  /** DI length */
  diLen: number;
  /** Trend strength threshold (ADX) */
  adxTrendThreshold: number;
}

export const defaultInputs: SuppotAndResistanceBuySellSignalsInputs = {
  length: 200,
  wickThreshold: 0.6,
  volumeSmaPeriod: 20,
  volumeMultiplier: 1.5,
  rsiPeriod: 14,
  rsiOversoldLevel: 30,
  rsiOverboughtLevel: 70,
  adxLen: 14,
  diLen: 14,
  adxTrendThreshold: 30,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Period', defval: 200, group: 'General Settings' },
  { id: 'wickThreshold', type: 'float', title: 'Wick Threshold', defval: 0.6, group: 'Wick Analysis' },
  { id: 'volumeSmaPeriod', type: 'int', title: 'Volume SMA Period', defval: 20, group: 'Volume Analysis' },
  { id: 'volumeMultiplier', type: 'float', title: 'Volume Multiplier', defval: 1.5, group: 'Volume Analysis' },
  { id: 'rsiPeriod', type: 'int', title: 'RSI Period', defval: 14, group: 'RSI Settings' },
  { id: 'rsiOversoldLevel', type: 'int', title: 'RSI Oversold Level', defval: 30, group: 'RSI Settings' },
  { id: 'rsiOverboughtLevel', type: 'int', title: 'RSI Overbought Level', defval: 70, group: 'RSI Settings' },
  { id: 'adxLen', type: 'int', title: 'ADX Smoothing', defval: 14, group: 'ADX Settings' },
  { id: 'diLen', type: 'int', title: 'DI Length', defval: 14, group: 'ADX Settings' },
  { id: 'adxTrendThreshold', type: 'int', title: 'Trend Strength Threshold', defval: 30, group: 'ADX Settings' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Mid Level', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'Mid Level 2', color: color.yellow, lineWidth: 1 },
  { id: 'plot2', title: 'YPSAR', color: color.green, lineWidth: 2 },
  { id: 'plot3', title: 'DPSAR', color: color.orange, lineWidth: 2 },
  { id: 'plot4', title: 'Upper Channel', color: color.purple, lineWidth: 3 },
  { id: 'plot5', title: 'Lower Channel', color: color.red, lineWidth: 3 },
];

export const metadata = {
  title: 'Suppot and resistance & BUY SELL SIGNALS',
  shortTitle: 'Suppot and resistance & BUY SELL SIGNALS',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SuppotAndResistanceBuySellSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);

  const rsi = A(ta.rsi(S(close), cfg.rsiPeriod));
  const volumeAvg = A(ta.sma(S(volume), cfg.length));

  // dirmov(dilen): +DM / -DM, RMA of ta.tr (na on bar 0), fixnan of the DI values
  const plusDM: number[] = new Array(n).fill(NaN);
  const minusDM: number[] = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const up = high[i] - high[i - 1];
    const down = -(low[i] - low[i - 1]);
    plusDM[i] = gt(up, down) && gt(up, 0) ? up : 0;
    minusDM[i] = gt(down, up) && gt(down, 0) ? down : 0;
  }
  const trueRange = A(ta.rma(ta.tr(bars, false), cfg.diLen));
  const rmaPlus = A(ta.rma(S(plusDM), cfg.diLen));
  const rmaMinus = A(ta.rma(S(minusDM), cfg.diLen));
  const plus: number[] = new Array(n);
  const minus: number[] = new Array(n);
  let lastPlus = NaN;
  let lastMinus = NaN;
  for (let i = 0; i < n; i++) {
    // fixnan(100 * ta.rma(plusDM, len) / truerange): plain division (x / 0 is infinite and kept by fixnan)
    const p = (100 * rmaPlus[i]) / trueRange[i];
    const m = (100 * rmaMinus[i]) / trueRange[i];
    if (!isNaN(p)) lastPlus = p;
    if (!isNaN(m)) lastMinus = m;
    plus[i] = lastPlus;
    minus[i] = lastMinus;
  }
  // adx = 100 * ta.rma(math.abs(plus - minus) / (sum == 0 ? 1 : sum), adxlen)
  const adxSrc = plus.map((p, i) => {
    const sum = p + minus[i];
    return Math.abs(p - minus[i]) / (eq(sum, 0) ? 1 : sum);
  });
  const adxValue = A(ta.rma(S(adxSrc), cfg.adxLen)).map((v) => 100 * v);

  const highChannel = A(ta.highest(S(high), cfg.length));
  const lowChannel = A(ta.lowest(S(low), cfg.length));
  const ypsar = A(ta.highest(S(close), cfg.length));
  const dpsar = A(ta.lowest(S(close), cfg.length));

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  const plot0: { time: number; value: number }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const plot2: { time: number; value: number }[] = [];
  const plot3: { time: number; value: number }[] = [];
  const plot4: { time: number; value: number }[] = [];
  const plot5: { time: number; value: number }[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time as number;
    const strongTrend = gt(adxValue[i], cfg.adxTrendThreshold);
    const volumeSpike = gt(volume[i], cfg.volumeMultiplier * volumeAvg[i]);
    const touchYpsar = gt(b.high, ypsar[i]) && lt(b.close, ypsar[i]);
    const touchDpsar = lt(b.low, dpsar[i]) && gt(b.close, dpsar[i]);
    // wick_anomaly = upper_wick / (high - low) > wick_threshold or lower_wick / (high - low) > wick_threshold
    const range = b.high - b.low;
    const upperWick = b.high - Math.max(b.open, b.close);
    const lowerWick = Math.min(b.open, b.close) - b.low;
    const wickAnomaly = gt(upperWick / range, cfg.wickThreshold) || gt(lowerWick / range, cfg.wickThreshold);
    const liquidityTrap = volumeSpike && wickAnomaly;
    const buySignal = liquidityTrap && lt(rsi[i], cfg.rsiOversoldLevel) && strongTrend && touchDpsar && gt(b.close, b.open);
    const sellSignal = liquidityTrap && gt(rsi[i], cfg.rsiOverboughtLevel) && strongTrend && touchYpsar && lt(b.close, b.open);
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    if (buySignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY', textColor: color.blue, size: 'small' });
    }
    if (sellSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL', textColor: color.blue, size: 'small' });
    }
    plot0.push({ time: t, value: (highChannel[i] + lowChannel[i]) / 2 });
    plot1.push({ time: t, value: (ypsar[i] + dpsar[i]) / 2 });
    plot2.push({ time: t, value: ypsar[i] });
    plot3.push({ time: t, value: dpsar[i] });
    plot4.push({ time: t, value: highChannel[i] });
    plot5.push({ time: t, value: lowChannel[i] });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5 },
    markers,
    // alertcondition(buySignal, 'BUY Signal') / alertcondition(sellSignal, 'SELL Signal')
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

export const SuppotAndResistanceBuySellSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
