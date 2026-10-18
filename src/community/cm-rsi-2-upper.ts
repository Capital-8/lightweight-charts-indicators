/**
 * CM RSI-2 Strategy Upper
 *
 * The price pane of Larry Connors' RSI-2 strategy: the 5-bar and 200-bar SMAs of the close (lime while the 5 SMA is at
 * or above the 200 SMA, red below it) and bar colours from the 2-bar RSI (rma averages of the gains and losses):
 * - lime: long entry, close above the 200 SMA, under the 5 SMA and RSI below 10;
 * - red: short entry, close under the 200 SMA, above the 5 SMA and RSI above 90;
 * - yellow: long exit (close above the 200 SMA, previous close under the previous 5 SMA, high above the 5 SMA and a
 *   long entry on one of the 4 previous bars) or short exit (the mirror rule).
 *
 * Reference: "_CM_RSI_2_HB_MA" by ChrisMoody
 */

import { ta, compare, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';

/** The original has no inputs */
export type CMRSI2UpperInputs = Record<string, never>;

export const defaultInputs: CMRSI2UpperInputs = {};

export const inputConfig: InputConfig[] = [];

// Colour constants of the original's Pine version (1 / 2)
const LIME = '#00FF00';
const RED = '#FF0000';
const YELLOW = '#FFFF00';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '5 SMA', color: LIME, lineWidth: 3, palette: [LIME, RED] },
  { id: 'plot1', title: '200 SMA', color: LIME, lineWidth: 3, style: 'circles', palette: [LIME, RED] },
];

export const metadata = {
  title: '_CM_RSI_2_HB_MA',
  shortTitle: '_CM_RSI_2_HB_MA',
  overlay: true,
};

/**
 * up = rma(max(change(src), 0), 2); down = rma(-min(change(src), 0), 2);
 * rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))
 */
function rsi2(bars: Bar[]): number[] {
  const change = bars.map((b, i) => (i > 0 ? b.close - bars[i - 1].close : NaN));
  // max(na, 0) / min(na, 0) are na
  const up = ta.rma(Series.fromArray(bars, change.map((c) => (Number.isNaN(c) ? NaN : Math.max(c, 0)))), 2).toArray();
  const down = ta.rma(Series.fromArray(bars, change.map((c) => (Number.isNaN(c) ? NaN : -Math.min(c, 0)))), 2).toArray();
  return bars.map((_, i) => {
    const u = up[i] ?? NaN;
    const d = down[i] ?? NaN;
    if (compare.eq(d, 0)) return 100;
    if (compare.eq(u, 0)) return 0;
    return 100 - 100 / (1 + u / d);
  });
}

export function calculate(
  bars: Bar[],
  _inputs: Partial<CMRSI2UpperInputs> = {},
): Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[] } {
  const n = bars.length;
  const rsi = rsi2(bars);
  const closeS = new Series(bars, (b) => b.close);
  const ma5 = ta.sma(closeS, 5).toArray().map((v) => v ?? NaN);
  const ma200 = ta.sma(closeS, 200).toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);
  // x[k]: na before the first bar
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const longSetup = (i: number) =>
    compare.gt(at(close, i), at(ma200, i)) && compare.lt(at(close, i), at(ma5, i)) && compare.lt(at(rsi, i), 10);
  const shortSetup = (i: number) =>
    compare.lt(at(close, i), at(ma200, i)) && compare.gt(at(close, i), at(ma5, i)) && compare.gt(at(rsi, i), 90);

  const barColors: BarColorData[] = [];
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    const isLongEntry = longSetup(i);
    // close > ma200 and close[1] < ma5[1] and high > ma5 and (a long setup 1, 2, 3 or 4 bars back)
    const isLongExit = compare.gt(close[i], ma200[i]) && compare.lt(at(close, i - 1), at(ma5, i - 1))
      && compare.gt(bars[i].high, ma5[i])
      && (longSetup(i - 1) || longSetup(i - 2) || longSetup(i - 3) || longSetup(i - 4));
    const isShortEntry = shortSetup(i);
    const isShortExit = compare.lt(close[i], ma200[i]) && compare.gt(at(close, i - 1), at(ma5, i - 1))
      && compare.lt(bars[i].low, ma5[i])
      && (shortSetup(i - 1) || shortSetup(i - 2) || shortSetup(i - 3) || shortSetup(i - 4));

    // barcolor(isLongEntry() ? lime : na), (isLongExit() ? yellow), (isShortEntry() ? red), (isShortExit() ? yellow)
    if (isLongEntry) barColors.push({ id: 'barcolor0', time: t, color: LIME });
    if (isLongExit) barColors.push({ id: 'barcolor1', time: t, color: YELLOW });
    if (isShortEntry) barColors.push({ id: 'barcolor2', time: t, color: RED });
    if (isShortExit) barColors.push({ id: 'barcolor3', time: t, color: YELLOW });

    // col = ma5 >= ma200 ? lime : ma5 < ma200 ? red : na
    const col = compare.ge(ma5[i], ma200[i]) ? LIME : compare.lt(ma5[i], ma200[i]) ? RED : 'transparent';
    plot0.push({ time: t, value: ma5[i], color: col });
    plot1.push({ time: t, value: ma200[i], color: col });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    barColors,
  };
}

export const CMRSI2Upper = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
