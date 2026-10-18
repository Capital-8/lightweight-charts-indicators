/**
 * RRR EMA Ignition BUY & SELL (Sideways-Proof)
 *
 * Three EMAs of the source (9, 21, 55). The EMA 55 slope is up when it is above its value 2 bars ago, down when it
 * is below it. A bull trend starts when the EMA 21 crosses over the EMA 55 with an up slope and ADX above the minimum
 * (a bear trend: cross under, down slope); it is also re-armed when the close is above the EMA 55, EMA 9 > EMA 21,
 * slope up and ADX above the minimum (bear: the opposite). A BUY label marks the first bar of a bull trend with a
 * close above the EMA 55, EMA 9 > EMA 21, a green candle, an up slope, ADX above the minimum and the close at least
 * ATR * multiplier away from the EMA 55; SELL is the opposite. A BUY allows the next SELL and the reverse.
 * Alerts (alertcondition, `alerts` of the result): 'BUY Alert' and 'SELL Alert', true on the BUY / SELL bars.
 *
 * Reference: "RRR EMA Ignition BUY & SELL (Sideways-Proof)" by RAGSTER123
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RrrEmaIgnitionBuySellInputs {
  len9: number;
  len21: number;
  len55: number;
  /** ADX length (DI length and ADX smoothing) */
  adxLen: number;
  /** Minimum ADX */
  adxMin: number;
  atrLen: number;
  /** ATR distance multiplier of the sideways filter */
  atrMul: number;
  src: SourceType;
}

export const defaultInputs: RrrEmaIgnitionBuySellInputs = {
  len9: 9,
  len21: 21,
  len55: 55,
  adxLen: 14,
  adxMin: 20,
  atrLen: 14,
  atrMul: 0.6,
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'len9', type: 'int', title: 'EMA 9', defval: 9 },
  { id: 'len21', type: 'int', title: 'EMA 21', defval: 21 },
  { id: 'len55', type: 'int', title: 'EMA 55', defval: 55 },
  { id: 'adxLen', type: 'int', title: 'ADX Length', defval: 14 },
  { id: 'adxMin', type: 'float', title: 'Min ADX', defval: 20 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'atrMul', type: 'float', title: 'ATR Distance Multiplier', defval: 0.6 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 9', color: color.red, lineWidth: 2 },
  { id: 'plot1', title: 'EMA 21', color: color.green, lineWidth: 2 },
  { id: 'plot2', title: 'EMA 55', color: color.blue, lineWidth: 2 },
];

export const metadata = {
  title: 'RRR EMA Ignition BUY & SELL (Sideways-Proof)',
  shortTitle: 'RRR_EMA_IGNITION',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<RrrEmaIgnitionBuySellInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const B = (s: Series) => s.toArray().map((v) => Boolean(v));

  const src = getSourceSeries(bars, cfg.src);
  const ema9 = A(ta.ema(src, cfg.len9));
  const ema21 = A(ta.ema(src, cfg.len21));
  const ema55 = A(ta.ema(src, cfg.len55));
  const [, , adx] = ta.dmi(bars, cfg.adxLen, cfg.adxLen).map(A);
  const atr = A(ta.atr(bars, cfg.atrLen));
  // ta.crossover / ta.crossunder (exact comparisons, last bar where both values were not na)
  const ema21S = Series.fromArray(bars, ema21);
  const ema55S = Series.fromArray(bars, ema55);
  const crossUp = B(ta.crossover(ema21S, ema55S));
  const crossDown = B(ta.crossunder(ema21S, ema55S));

  let bullTrend = false;
  let bearTrend = false;
  let buyDone = false;
  let sellDone = false;
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const e55prev2 = i >= 2 ? ema55[i - 2] : NaN;
    const ema55Up = gt(ema55[i], e55prev2);
    const ema55Down = lt(ema55[i], e55prev2);
    // farFromEMA55 = math.abs(close - ema55) >= atr * atrMul
    const farFromEMA55 = ge(Math.abs(b.close - ema55[i]), atr[i] * cfg.atrMul);
    const adxOk = gt(adx[i], cfg.adxMin);

    if (crossUp[i] && ema55Up && adxOk) {
      bullTrend = true;
      bearTrend = false;
      buyDone = false;
    }
    if (crossDown[i] && ema55Down && adxOk) {
      bearTrend = true;
      bullTrend = false;
      sellDone = false;
    }
    // Re-arm
    if (gt(b.close, ema55[i]) && gt(ema9[i], ema21[i]) && ema55Up && adxOk) {
      bullTrend = true;
      sellDone = false;
    }
    if (lt(b.close, ema55[i]) && lt(ema9[i], ema21[i]) && ema55Down && adxOk) {
      bearTrend = true;
      buyDone = false;
    }

    const buySignal = bullTrend && !buyDone && gt(b.close, ema55[i]) && gt(ema9[i], ema21[i])
      && gt(b.close, b.open) && ema55Up && adxOk && farFromEMA55;
    if (buySignal) {
      buyDone = true;
      sellDone = false;
    }
    const sellSignal = bearTrend && !sellDone && lt(b.close, ema55[i]) && lt(ema9[i], ema21[i])
      && lt(b.close, b.open) && ema55Down && adxOk && farFromEMA55;
    if (sellSignal) {
      sellDone = true;
      buyDone = false;
    }

    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    if (buySignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY',
        textColor: color.white, size: 'small' });
    }
    if (sellSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.white, size: 'small' });
    }
  }

  const line = (values: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: values[i], color: c }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(ema9, color.red),
      plot1: line(ema21, color.green),
      plot2: line(ema55, color.blue),
    },
    markers,
    // alertcondition(buySignal, "BUY Alert") / alertcondition(sellSignal, "SELL Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY Alert', message: 'RRR EMA Ignition BUY' },
  { id: 'alert1', title: 'SELL Alert', message: 'RRR EMA Ignition SELL' },
];

export const RrrEmaIgnitionBuySell = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
