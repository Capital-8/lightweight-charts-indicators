/**
 * TrendSync Buy and Sell
 *
 * Trend from the close against a 200 SMA. A bar is a candidate when its range (high - low) is above ATR * multiplier.
 * Above the SMA: a buy needs a low above the lowest low of the 3 previous bars and RSI above the threshold, a sell
 * needs a high above the highest high of the 3 previous bars and RSI below 100 - threshold. Below the SMA: a buy
 * needs a low below the lowest low of the 3 previous bars and RSI above the threshold, a sell a high below the highest
 * high of the 3 previous bars and RSI below 100 - threshold. Only the first bar of each condition gives a BUY / SELL
 * label. The SMA is drawn as the trend line.
 * Alerts (alertcondition, `alerts` of the result): 'Unified Buy/Sell Alert', true on the bars of a BUY or SELL label.
 *
 * Reference: "TRENDSYNC BUY/SELL BY SIMPLY_DANTE-FX" by Simply_Dante-fx
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrendsyncBuySellInputs {
  smaLength: number;
  atrLength: number;
  /** Range Filter Multiplier (of the ATR) */
  rangeThreshold: number;
  rsiLength: number;
  /** RSI Threshold for Buy/Sell */
  rsiThreshold: number;
}

export const defaultInputs: TrendsyncBuySellInputs = {
  smaLength: 200,
  atrLength: 14,
  rangeThreshold: 1.2,
  rsiLength: 14,
  rsiThreshold: 50,
};

export const inputConfig: InputConfig[] = [
  { id: 'smaLength', type: 'int', title: 'SMA Length', defval: 200 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'rangeThreshold', type: 'float', title: 'Range Filter Multiplier', defval: 1.2 },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'rsiThreshold', type: 'int', title: 'RSI Threshold for Buy/Sell', defval: 50 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SMA', color: color.purple, lineWidth: 2 },
];

export const metadata = {
  title: 'TRENDSYNC BUY AND SELL ',
  shortTitle: 'TRENDSYNC BUY AND SELL ',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendsyncBuySellInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const close = S(bars.map((b) => b.close));
  const sma = A(ta.sma(close, cfg.smaLength));
  const atr = A(ta.atr(bars, cfg.atrLength));
  const rsi = A(ta.rsi(close, cfg.rsiLength));
  // ta.highest(high[1], 3) / ta.lowest(low[1], 3)
  const prevHigh = A(ta.highest(S(bars.map((_b, i) => (i > 0 ? bars[i - 1].high : NaN))), 3));
  const prevLow = A(ta.lowest(S(bars.map((_b, i) => (i > 0 ? bars[i - 1].low : NaN))), 3));

  const markers: MarkerData[] = [];
  const unifiedFlags: boolean[] = [];
  let prevBuy = false;
  let prevSell = false;
  let prevBuyDown = false;
  let prevSellDown = false;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const higherHigh = gt(b.high, prevHigh[i]);
    const higherLow = gt(b.low, prevLow[i]);
    const lowerHigh = gt(prevHigh[i], b.high);
    const lowerLow = gt(prevLow[i], b.low);
    const uptrend = gt(b.close, sma[i]);
    const downtrend = gt(sma[i], b.close);
    const rangeFilter = gt(b.high - b.low, atr[i] * cfg.rangeThreshold);
    const momentumFilterUp = gt(rsi[i], cfg.rsiThreshold);
    const momentumFilterDown = gt(100 - cfg.rsiThreshold, rsi[i]);

    const buySignal = uptrend && higherLow && rangeFilter && momentumFilterUp;
    const sellSignal = uptrend && higherHigh && rangeFilter && momentumFilterDown;
    const buySignalDown = downtrend && lowerLow && rangeFilter && momentumFilterUp;
    const sellSignalDown = downtrend && lowerHigh && rangeFilter && momentumFilterDown;

    // x and not x[1] (x[1] is false on the first bar)
    const finalBuy = (buySignal && !prevBuy) || (buySignalDown && !prevBuyDown);
    const finalSell = (sellSignal && !prevSell) || (sellSignalDown && !prevSellDown);
    // unifiedSignal = finalBuySignal or finalSellSignal
    unifiedFlags.push(finalBuy || finalSell);
    prevBuy = buySignal;
    prevSell = sellSignal;
    prevBuyDown = buySignalDown;
    prevSellDown = sellSignalDown;

    // plotshape(..., location.belowbar / abovebar, shape.labelup / labeldown, text = "BUY" / "SELL"); the Pine
    // default text colour is blue
    if (finalBuy) {
      markers.push({ time: b.time as number, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY', textColor: color.blue });
    }
    if (finalSell) {
      markers.push({ time: b.time as number, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL', textColor: color.blue });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time as number, value: sma[i], color: color.purple })),
    },
    markers,
    alerts: alertStates(alertConditions, bars, [unifiedFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Unified Buy/Sell Alert', message: 'Unified Signal Triggered (Buy/Sell)' },
];

export const TrendsyncBuySell = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
