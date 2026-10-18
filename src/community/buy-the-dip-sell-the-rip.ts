/**
 * Buy the Dip & Sell the Rip
 *
 * RSI of the close and an SMA of the RSI. DIP: the previous RSI is below the oversold level and the RSI rises.
 * RIP: the RSI and its SMA are above the overbought level and the RSI falls.
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): "Buy the Dip!" on a DIP bar and
 * "Sell the Rip!" on a RIP bar.
 *
 * Reference: "Buy the Dip & Sell the Rip" by vvedding
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © vvedding
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface BuyTheDipSellTheRipInputs {
  rsiLength: number;
  rsiSmaLength: number;
  oversold: number;
  overbought: number;
}

export const defaultInputs: BuyTheDipSellTheRipInputs = {
  rsiLength: 14,
  rsiSmaLength: 14,
  oversold: 30,
  overbought: 70,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'rsiSmaLength', type: 'int', title: 'RSI SMA Length', defval: 14 },
  { id: 'oversold', type: 'int', title: 'Oversold', defval: 30 },
  { id: 'overbought', type: 'int', title: 'Overbought', defval: 70 },
];

// No plot(): plotshape markers only
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Buy the Dip & Sell the Rip',
  shortTitle: 'Buy the Dip & Sell the Rip',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Pine default plotshape text colour */
const PINE_TEXT_COLOR = '#2962FF';

export function calculate(
  bars: Bar[],
  inputs: Partial<BuyTheDipSellTheRipInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const close = new Series(bars, (b) => b.close);
  const rsiSeries = ta.rsi(close, cfg.rsiLength);
  const rsi = rsiSeries.toArray().map((v) => v ?? NaN);
  const rsiSma = ta.sma(rsiSeries, cfg.rsiSmaLength).toArray().map((v) => v ?? NaN);

  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  bars.forEach((b, i) => {
    const rsi1 = i > 0 ? rsi[i - 1] : NaN;
    const btd = lt(rsi1, cfg.oversold) && gt(rsi[i], rsi1);
    const str = gt(rsi[i], cfg.overbought) && gt(rsiSma[i], cfg.overbought) && gt(rsi1, rsi[i]);
    if (btd) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.lime, text: 'DIP',
        textColor: PINE_TEXT_COLOR, size: 'small' });
    }
    if (str) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, text: 'RIP',
        textColor: PINE_TEXT_COLOR, size: 'small' });
    }
    // if btd: alert("Buy the Dip!", alert.freq_once_per_bar_close); if str: alert("Sell the Rip!", ...)
    if (btd) alertCalls.push({ time: b.time, message: 'Buy the Dip!', freq: 'once_per_bar_close' });
    if (str) alertCalls.push({ time: b.time, message: 'Sell the Rip!', freq: 'once_per_bar_close' });
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    alertCalls,
  };
}

export const BuyTheDipSellTheRip = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
