/**
 * 5-Minute Buy/Sell Signal
 *
 * An EMA of the close on the price chart, with BUY / SELL labels. BUY: MACD histogram (MACD line - signal line) above
 * 0, RSI below the oversold level, close above the EMA and volume above its SMA. SELL: MACD histogram below 0, RSI
 * above the overbought level, close below the EMA and volume above its SMA.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' and 'Sell Signal', true on the bars of each signal.
 *
 * Reference: "5-Minute Buy/Sell Signal" by Waqas_Khalid
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FiveMinuteBuySellSignalInputs {
  macdFastLength: number;
  macdSlowLength: number;
  macdSignalSmoothing: number;
  rsiLength: number;
  rsiOverbought: number;
  rsiOversold: number;
  emaLength: number;
  /** SMA length of the volume */
  volumeLength: number;
}

export const defaultInputs: FiveMinuteBuySellSignalInputs = {
  macdFastLength: 12,
  macdSlowLength: 26,
  macdSignalSmoothing: 9,
  rsiLength: 14,
  rsiOverbought: 70,
  rsiOversold: 30,
  emaLength: 50,
  volumeLength: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'macdFastLength', type: 'int', title: 'MACD Fast Length', defval: 12 },
  { id: 'macdSlowLength', type: 'int', title: 'MACD Slow Length', defval: 26 },
  { id: 'macdSignalSmoothing', type: 'int', title: 'MACD Signal Smoothing', defval: 9 },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'rsiOverbought', type: 'int', title: 'RSI Overbought Level', defval: 70 },
  { id: 'rsiOversold', type: 'int', title: 'RSI Oversold Level', defval: 30 },
  { id: 'emaLength', type: 'int', title: 'EMA Length', defval: 50 },
  { id: 'volumeLength', type: 'int', title: 'Volume Moving Average Length', defval: 20 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 50', color: color.orange, lineWidth: 1 },
];

export const metadata = {
  title: '5-Minute Buy/Sell Signal',
  shortTitle: '5-Minute Buy/Sell Signal',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<FiveMinuteBuySellSignalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const volume = bars.map((b) => b.volume ?? NaN);

  const [macdLine, signalLine] = ta.macd(close, cfg.macdFastLength, cfg.macdSlowLength, cfg.macdSignalSmoothing);
  const macd = A(macdLine);
  const signal = A(signalLine);
  const rsi = A(ta.rsi(close, cfg.rsiLength));
  const ema50 = A(ta.ema(close, cfg.emaLength));
  const volMA = A(ta.sma(Series.fromArray(bars, volume), cfg.volumeLength));

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const macdHist = macd[i] - signal[i];
    const c = bars[i].close;
    // buySignal = macdHist > 0 and rsi < rsiOversold and close > ema50 and volume > volMA
    const buy = gt(macdHist, 0) && lt(rsi[i], cfg.rsiOversold) && gt(c, ema50[i]) && gt(volume[i], volMA[i]);
    // sellSignal = macdHist < 0 and rsi > rsiOverbought and close < ema50 and volume > volMA
    const sell = lt(macdHist, 0) && gt(rsi[i], cfg.rsiOverbought) && lt(c, ema50[i]) && gt(volume[i], volMA[i]);
    buyFlags.push(buy);
    sellFlags.push(sell);
    // plotshape(..., color.green / color.red, shape.labelup / labeldown, location.belowbar / abovebar, size.small);
    // no textcolor: Pine default blue
    if (buy) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY',
        textColor: color.blue, size: 'small' });
    }
    if (sell) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.blue, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: ema50.map((v, i) => ({ time: bars[i].time, value: v, color: color.orange })) },
    markers,
    // alertcondition(buySignal, 'Buy Signal', ...) / alertcondition(sellSignal, 'Sell Signal', ...)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy Signal: MACD bullish, RSI oversold, price above EMA50' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell Signal: MACD bearish, RSI overbought, price below EMA50' },
];

export const FiveMinuteBuySellSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
