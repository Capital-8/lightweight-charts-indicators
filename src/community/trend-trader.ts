/**
 * Trend Trader Strategy
 *
 * Andrew Abraham's trend trader (TASC, September 1998): avgTR = WMA(ATR(1), Length); hiLimit = highest high of
 * Length bars one bar back - avgTR one bar back * Multiplier, loLimit = lowest low one bar back + avgTR one bar back *
 * Multiplier. The line takes hiLimit when the close is above both limits, loLimit when it is below both, else keeps
 * its value (the close on the first bar). pos is 1 when the close is above the line, -1 below, else unchanged; the
 * bars are coloured green (1), red (-1) or blue (0).
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): "Color changed - Buy" when pos turns 1 and
 * "Color changed - Sell" when it turns -1.
 *
 * Reference: "Trend Trader Strategy" by HPotter
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BarColorData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface TrendTraderInputs {
  /** Length */
  length: number;
  /** Multiplier */
  multiplier: number;
}

export const defaultInputs: TrendTraderInputs = {
  length: 21,
  multiplier: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 21, min: 1 },
  { id: 'multiplier', type: 'float', title: 'Multiplier', defval: 3, min: 0.000001 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend Trader Strategy', color: color.blue, lineWidth: 1 },
];

export const metadata = {
  title: 'Trend Trader Strategy',
  shortTitle: 'Trend Trader Strategy',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendTraderInputs> = {},
): Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[]; alertCalls: AlertCall[] } {
  const { length, multiplier } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // avgTR = ta.wma(ta.atr(1), Length); highestC = ta.highest(Length) (high); lowestC = ta.lowest(Length) (low)
  const avgTR = ta.wma(ta.atr(bars, 1), length).toArray().map((v) => v ?? NaN);
  const highestC = ta.highest(new Series(bars, (b) => b.high), length).toArray().map((v) => v ?? NaN);
  const lowestC = ta.lowest(new Series(bars, (b) => b.low), length).toArray().map((v) => v ?? NaN);

  const red = color.red;
  const green = color.green;
  const blue = color.blue;

  const ret = new Array<number>(n);
  const barColors: BarColorData[] = [];
  const alertCalls: AlertCall[] = [];
  let posPrev = NaN;
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const hiLimit = i > 0 ? highestC[i - 1] - avgTR[i - 1] * multiplier : NaN;
    const loLimit = i > 0 ? lowestC[i - 1] + avgTR[i - 1] * multiplier : NaN;
    // ret := close > hiLimit and close > loLimit ? hiLimit : close < loLimit and close < hiLimit ? loLimit : nz(ret[1], close)
    const ret1 = i > 0 ? ret[i - 1] : NaN;
    ret[i] = gt(close, hiLimit) && gt(close, loLimit) ? hiLimit
      : lt(close, loLimit) && lt(close, hiLimit) ? loLimit
      : isNaN(ret1) ? close : ret1;
    // pos := close > ret ? 1 : close < ret ? -1 : nz(pos[1], 0)
    const pos = gt(close, ret[i]) ? 1 : lt(close, ret[i]) ? -1 : isNaN(posPrev) ? 0 : posPrev;
    const t = bars[i].time as number;
    // if pos != pos[1] and pos == 1: alert("Color changed - Buy", alert.freq_once_per_bar_close) (pos[1] na on bar 0)
    if (!isNaN(posPrev) && pos !== posPrev && pos === 1) alertCalls.push({ time: t, message: 'Color changed - Buy', freq: 'once_per_bar_close' });
    if (!isNaN(posPrev) && pos !== posPrev && pos === -1) alertCalls.push({ time: t, message: 'Color changed - Sell', freq: 'once_per_bar_close' });
    // barcolor(pos == -1 ? color.red : pos == 1 ? color.green : color.blue)
    barColors.push({ time: t, color: pos === -1 ? red : pos === 1 ? green : blue, id: 'barcolor0' });
    posPrev = pos;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    // plot(ret, color = color.new(color.blue, 0), title = 'Trend Trader Strategy')
    plots: { plot0: bars.map((b, i) => ({ time: b.time, value: ret[i], color: blue })) },
    barColors,
    alertCalls,
  };
}

export const TrendTrader = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
