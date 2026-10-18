/**
 * IU Smart Flow System
 *
 * Order flow score = (highest close of `length` bars - close `length` bars ago) - (close `length` bars ago - lowest
 * close of `length` bars). Trend band: SMA(close, trend length) +/- ATR(14), drawn as two lines with a fill. A Long
 * label marks the first bar (not already long) with a positive score, a close above the upper band and RSI above 50;
 * a Short label marks the first bar (not already short) with a negative score, a close below the lower band and RSI
 * below 50. A Long signal ends the short state and a Short signal ends the long state.
 * Alerts (alert() calls, `alertCalls` of the result, once per bar): "Long Entry Tiggered!" on each Long signal and
 * "Short Entry Tiggered!" on each Short signal (the original's spelling).
 *
 * Reference: "IU Smart Flow System" by Shivam_Mandrai
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Shivam_Mandrai
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';

/** The original calls alert() */
export const hasAlertFunction = true;

export interface IuSmartFlowSystemInputs {
  /** Imbalance length */
  length: number;
  /** Trend length (SMA of the close) */
  trendLength: number;
  /** RSI length */
  rsiLength: number;
}

export const defaultInputs: IuSmartFlowSystemInputs = {
  length: 10,
  trendLength: 50,
  rsiLength: 14,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Imbalance length', defval: 10 },
  { id: 'trendLength', type: 'int', title: 'Trend length', defval: 50 },
  { id: 'rsiLength', type: 'int', title: 'RSI Lenght = ', defval: 14 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bull Trend', color: color.gray, lineWidth: 2 },
  { id: 'plot1', title: 'Bear Trned', color: color.gray, lineWidth: 2 },
];

export const metadata = {
  title: 'IU Smart Flow System',
  shortTitle: 'IU Smart Flow System',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<IuSmartFlowSystemInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const closeS = Series.fromArray(bars, bars.map((b) => b.close));

  const highest = A(ta.highest(closeS, cfg.length));
  const lowest = A(ta.lowest(closeS, cfg.length));
  const atr = A(ta.atr(bars, 14));
  const sma = A(ta.sma(closeS, cfg.trendLength));
  const rsi = A(ta.rsi(closeS, cfg.rsiLength));

  const bullTrend: number[] = new Array(n);
  const bearTrend: number[] = new Array(n);
  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  let inLong = false; // var in_long = false
  let inShort = false; // var in_short = false
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const closeLen = i - cfg.length >= 0 ? bars[i - cfg.length].close : NaN;
    // order_flow_score = (highest - close[length]) - (close[length] - lowest)
    const score = (highest[i] - closeLen) - (closeLen - lowest[i]);
    bullTrend[i] = sma[i] + atr[i];
    bearTrend[i] = sma[i] - atr[i];
    const trendUp = gt(close, bullTrend[i]);
    const trendDown = lt(close, bearTrend[i]);

    let longEntry = false;
    let shortEntry = false;
    if (gt(score, 0) && trendUp && gt(rsi[i], 50) && !inLong) {
      longEntry = true;
      inLong = true;
      inShort = false;
    }
    if (lt(score, 0) && trendDown && lt(rsi[i], 50) && !inShort) {
      shortEntry = true;
      inShort = true;
      inLong = false;
    }

    // plotshape(long_entry, color = color.green, text = "Long", location.belowbar, shape.labelup, textcolor = color.white)
    if (longEntry) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'Long',
        textColor: color.white, size: 'auto' });
    }
    // plotshape(short_entry, color = color.red, text = "Short", location.abovebar, shape.labeldown, textcolor = color.white)
    if (shortEntry) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'Short',
        textColor: color.white, size: 'auto' });
    }
    // if long_entry: alert("Long Entry Tiggered!", alert.freq_once_per_bar); the same for short_entry
    if (longEntry) alertCalls.push({ time: bars[i].time, message: 'Long Entry Tiggered!', freq: 'once_per_bar' });
    if (shortEntry) alertCalls.push({ time: bars[i].time, message: 'Short Entry Tiggered!', freq: 'once_per_bar' });
  }

  const fillCol = String(color.new(color.gray, 90));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: bullTrend[i], color: color.gray })),
      plot1: bars.map((b, i) => ({ time: b.time, value: bearTrend[i], color: color.gray })),
    },
    // fill(bull_trend_plot, bear_trend_plot, color = color.new(color.gray, 90))
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { color: fillCol } }],
    markers,
    alertCalls,
  };
}

export const IuSmartFlowSystem = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
