/**
 * RSI Swing Signal
 *
 * RSI(rsiSrc, rsiLen), red above the overbought level, lime below the oversold level, else blue, with levels at the
 * overbought / oversold inputs and a dashed midpoint at 50. Exhaustion setups are painted in the background:
 * - "123 Fractal": a bullish (bearish) engulfing-like bar after a down (up) bar whose low (high) was a lower low
 *   (higher high) and the lowest low (highest high) of the lookback, with RSI oversold (overbought) now or on the bar
 *   before: lime (buy) / red (sell);
 * - "Swing Fractal": the same reversal bar making itself a new low (high) of the lookback: lime / red.
 * An alert condition fires on any of the four signals.
 *
 * Reference: "RSI Swing Signal" by ZenAndTheArtOfTrading
 * Licence: Mozilla Public License 2.0, as the original (https://mozilla.org/MPL/2.0/).
 * Original notice: © ZenAndTheArtOfTrading | PineScriptMastery
 */

import { ta, color, getSourceSeries, Series, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RSISwingSignalInputs {
  lookback: number;
  rsiOB: number;
  rsiOS: number;
  rsiLen: number;
  src: SourceType;
}

export const defaultInputs: RSISwingSignalInputs = {
  lookback: 7,
  rsiOB: 80,
  rsiOS: 20,
  rsiLen: 7,
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Lookback:', defval: 7 },
  { id: 'rsiOB', type: 'int', title: 'RSI Overbought Level:', defval: 80 },
  { id: 'rsiOS', type: 'int', title: 'RSI Oversold Level:', defval: 20 },
  { id: 'rsiLen', type: 'int', title: 'RSI Length:', defval: 7 },
  { id: 'src', type: 'source', title: 'RSI Source:', defval: 'close' },
];

const RSI_COLOR = '#4985e7';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: RSI_COLOR, lineWidth: 2 },
];

/** hline(rsiOB / rsiOS / 50) with the default inputs (the result `hlines` carry the input levels) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_ob', price: 80, title: 'RSI Overbought', color: color.red, linestyle: 'solid' },
  { id: 'hline_os', price: 20, title: 'RSI Oversold', color: color.green, linestyle: 'solid' },
  { id: 'hline_mid', price: 50, title: 'Midpoint', color: color.gray, linestyle: 'dashed' },
];

export const metadata = {
  title: 'RSI Swing Signal',
  shortTitle: 'RSI+',
  overlay: false,
};

/** The original's alertcondition() */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RSI SIGNAL', message: 'RSI Exhaustion signal for {{ticker}}' },
];

/** Pine float comparisons: equal within 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RSISwingSignalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { bgColors: BgColorData[]; alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const num = (v: number | null | undefined) => (v == null ? NaN : v);

  // rsi = ta.rsi(rsiSrc, rsiLen)
  const rsi = ta.rsi(getSourceSeries(bars, cfg.src), cfg.rsiLen).toArray().map(num);
  // swingHigh = ta.highest(high, lookback); swingLow = ta.lowest(low, lookback)
  const swingHigh = ta.highest(new Series(bars, (b) => b.high), cfg.lookback).toArray().map(num);
  const swingLow = ta.lowest(new Series(bars, (b) => b.low), cfg.lookback).toArray().map(num);

  // rsisell = rsi > rsiOB; rsibuy = rsi < rsiOS
  const rsisell = rsi.map((v) => gt(v, cfg.rsiOB));
  const rsibuy = rsi.map((v) => lt(v, cfg.rsiOS));

  const O = (i: number) => (i >= 0 ? bars[i].open : NaN);
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);

  const plot0: { time: number; value: number; color: string }[] = [];
  const bgColors: BgColorData[] = [];
  const signal: boolean[] = [];
  const lime = String(color.lime);
  const red = String(color.red);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    const buyRsi = rsibuy[i] || (i > 0 && rsibuy[i - 1]);
    const sellRsi = rsisell[i] || (i > 0 && rsisell[i - 1]);
    const buysignal1 = buyRsi && lt(C(i - 1), O(i - 1)) && gt(C(i), O(i - 1)) && gt(L(i), L(i - 1)) && lt(L(i - 1), L(i - 2))
      && eq(L(i - 1), swingLow[i]) && le(O(i), C(i - 1));
    const buysignal2 = buyRsi && lt(C(i - 1), O(i - 1)) && gt(C(i), O(i - 1)) && lt(L(i), L(i - 1))
      && eq(L(i), swingLow[i]) && le(O(i), C(i - 1));
    const sellsignal2 = sellRsi && gt(C(i - 1), O(i - 1)) && lt(C(i), O(i - 1)) && gt(H(i), H(i - 1))
      && eq(H(i), swingHigh[i]) && ge(O(i), C(i - 1));
    const sellsignal1 = sellRsi && gt(C(i - 1), O(i - 1)) && lt(C(i), O(i - 1)) && lt(H(i), H(i - 1)) && gt(H(i - 1), H(i - 2))
      && eq(H(i - 1), swingHigh[i]) && ge(O(i), C(i - 1));

    // bgcolor(buysignal1 ? color.lime : sellsignal1 ? color.red : na, title="123 Fractal")
    if (buysignal1) bgColors.push({ id: 'bgcolor0', time: t, color: lime });
    else if (sellsignal1) bgColors.push({ id: 'bgcolor0', time: t, color: red });
    // bgcolor(buysignal2 ? color.lime : sellsignal2 ? color.red : na, title="Swing Fractal")
    if (buysignal2) bgColors.push({ id: 'bgcolor1', time: t, color: lime });
    else if (sellsignal2) bgColors.push({ id: 'bgcolor1', time: t, color: red });

    // plot(rsi, "RSI", rsisell ? color.red : rsibuy ? color.lime : #4985e7, linewidth=2)
    plot0.push({ time: t, value: rsi[i], color: rsisell[i] ? red : rsibuy[i] ? lime : RSI_COLOR });

    // alertcondition(sellsignal1 or sellsignal2 or buysignal1 or buysignal2, ...)
    signal.push(sellsignal1 || sellsignal2 || buysignal1 || buysignal2);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines: [
      { id: 'hline_ob', value: cfg.rsiOB, options: { title: 'RSI Overbought', color: color.red, linestyle: 'solid' } },
      { id: 'hline_os', value: cfg.rsiOS, options: { title: 'RSI Oversold', color: color.green, linestyle: 'solid' } },
      { id: 'hline_mid', value: 50, options: { title: 'Midpoint', color: color.gray, linestyle: 'dashed' } },
    ],
    bgColors,
    alerts: alertStates(alertConditions, bars, [signal]),
  };
}

export const RSISwingSignal = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig, alertConditions };
