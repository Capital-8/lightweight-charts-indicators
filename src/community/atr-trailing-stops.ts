/**
 * ATR Trailing Stops Colored
 *
 * ATR-based trailing stop with direction color.
 * Trailing stop ratchets in favorable direction only.
 * Green when price above stop (long), red when below (short).
 *
 * Alerts (alertcondition, `alerts` of the result): the original's two crosses, computed with the original's trail
 * logic (not with the line drawn here): an ATR of the body true range plus the wicks (RMA of ATR Period, times the
 * multiplier), a long stop low - ATR that only rises and a short stop high + ATR that only falls, the long / short
 * state flipping when the close goes beyond the opposite stop (the stop of the new side is then reset to the current
 * low - ATR / high + ATR). 'Long: Price crossed ATR up': the close goes above the short stop of the bar before (and
 * was not above the one of 2 bars back); 'Short: Price crossed ATR down': the mirror below the long stop. The
 * original's other inputs are at their defaults (flip on the close, 100 % body and wick, RMA).
 *
 * Reference: "ATR Trailing Stops" (community)
 */

import { ta, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ATRTrailingStopsInputs {
  atrPeriod: number;
  atrMultiplier: number;
}

export const defaultInputs: ATRTrailingStopsInputs = {
  atrPeriod: 5,
  atrMultiplier: 3.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 5, min: 1 },
  { id: 'atrMultiplier', type: 'float', title: 'ATR Multiplier', defval: 3.5, min: 0.1, step: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trailing Stop', color: '#2962FF', lineWidth: 2 },
];

export const metadata = {
  title: 'ATR Trailing Stops',
  shortTitle: 'ATRTS',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/**
 * The original's alert conditions (alertCrossAtrShortStop, alertCrossAtrLongStop) for an ATR lookback and multiplier,
 * the other inputs of the original at their defaults ('Close' flip source, 100 % body and wick, RMA smoothing).
 */
function originalAlertFlags(bars: Bar[], lookback: number, multiplier: number): [boolean[], boolean[]] {
  const n = bars.length;
  // atrPercentAdjustedTrueRange = max(|open - close|, |open - close[1]|, |close - close[1]|) + wicks (na on bar 0)
  const tr = bars.map((b, i) => {
    if (i === 0) return NaN;
    const c1 = bars[i - 1].close;
    const body = Math.max(Math.abs(b.open - b.close), Math.abs(b.open - c1), Math.abs(b.close - c1));
    const wick = b.high - Math.max(b.open, b.close) + Math.min(b.open, b.close) - b.low;
    return body + wick;
  });
  // ta.rma: seeded by ta.sma of the first `lookback` values (na while one of them is na)
  const atr: number[] = new Array(n).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    if (isNaN(prev)) {
      if (i >= lookback - 1) {
        let sum = 0;
        for (let k = i - lookback + 1; k <= i; k++) sum += tr[k];
        prev = sum / lookback;
      }
    } else {
      prev = (tr[i] + (lookback - 1) * prev) / lookback;
    }
    atr[i] = prev;
  }

  const longPlot: number[] = new Array(n).fill(NaN);
  const shortPlot: number[] = new Array(n).fill(NaN);
  let trailLong = NaN; // var float trailAtrLong = atrLow (na on bar 0)
  let trailShort = NaN;
  // var bool _isLong = true / _isShort = true; their [1] is na on bar 0
  let isLongPrev: boolean | null = null;
  let isShortPrev: boolean | null = null;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const atrM = atr[i] * multiplier;
    const atrLow = b.low - atrM;
    const atrHigh = b.high + atrM;
    // f_trail: the long stop keeps its value while the source is at or below it, the short stop while at or above
    trailLong = le(atrLow, trailLong) ? trailLong : atrLow;
    trailShort = ge(atrHigh, trailShort) ? trailShort : atrHigh;
    // f_flip with the close as the flip source
    let flipLong: boolean = isShortPrev === true && gt(b.close, trailShort);
    let flipShort: boolean = isLongPrev === true && lt(b.close, trailLong);
    flipLong = flipShort && flipLong && gt(b.close, trailLong) ? true : flipShort && flipLong && le(b.close, trailLong) ? false : flipLong;
    flipShort = flipLong && flipShort && lt(b.close, trailShort) ? true : flipShort && flipLong && ge(b.close, trailShort) ? false : flipShort;
    const isLong: boolean = flipLong ? true : flipShort ? false : isLongPrev === null ? true : isLongPrev;
    const isShort: boolean = flipShort ? true : flipLong ? false : isShortPrev === null ? true : isShortPrev;
    // a side that starts on this bar resets its stop (`not _isLong[1]` is na, so false, on bar 0)
    if (isLong && isLongPrev === false) trailLong = atrLow;
    if (isShort && isShortPrev === false) trailShort = atrHigh;
    longPlot[i] = isLong ? trailLong : NaN;
    shortPlot[i] = isShort ? trailShort : NaN;
    isLongPrev = isLong;
    isShortPrev = isShort;
  }

  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const close = (i: number) => (i >= 0 ? bars[i].close : NaN);
  // close > trailAtrShortPlot[1] and close[1] <= trailAtrShortPlot[2]; the mirror for the long stop
  const crossShortStop = bars.map((_b, i) => gt(close(i), at(shortPlot, i - 1)) && le(close(i - 1), at(shortPlot, i - 2)));
  const crossLongStop = bars.map((_b, i) => lt(close(i), at(longPlot, i - 1)) && ge(close(i - 1), at(longPlot, i - 2)));
  return [crossShortStop, crossLongStop];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ATRTrailingStopsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; alerts: AlertConditionState[] } {
  const { atrPeriod, atrMultiplier } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const atrArr = ta.atr(bars, atrPeriod).toArray();

  const stopArr: number[] = new Array(n);
  const dirArr: number[] = new Array(n); // 1 = long, -1 = short

  for (let i = 0; i < n; i++) {
    const atrVal = (atrArr[i] ?? 0) * atrMultiplier;
    const close = bars[i].close;

    if (i === 0) {
      stopArr[i] = close - atrVal;
      dirArr[i] = 1;
      continue;
    }

    const prevStop = stopArr[i - 1];
    const prevDir = dirArr[i - 1];

    if (prevDir === 1) {
      // Long: trailing stop is below price
      const newStop = close - atrVal;
      stopArr[i] = close > prevStop ? Math.max(newStop, prevStop) : newStop;
      dirArr[i] = close < prevStop ? -1 : 1;
    } else {
      // Short: trailing stop is above price
      const newStop = close + atrVal;
      stopArr[i] = close < prevStop ? Math.min(newStop, prevStop) : newStop;
      dirArr[i] = close > prevStop ? 1 : -1;
    }
  }

  const warmup = atrPeriod;
  const plot = stopArr.map((v, i) => {
    if (i < warmup) return { time: bars[i].time, value: NaN };
    const color = dirArr[i] === 1 ? '#26A69A' : '#EF5350';
    return { time: bars[i].time, value: v, color };
  });

  // Pine barcolor: green when close > TS, red when close < TS, black otherwise
  const barColors: BarColorData[] = [];
  for (let i = warmup; i < n; i++) {
    const c = bars[i].close;
    const ts = stopArr[i];
    if (c > ts) {
      barColors.push({ time: bars[i].time, color: '#00FF00' });
    } else if (c < ts) {
      barColors.push({ time: bars[i].time, color: '#FF0000' });
    } else {
      barColors.push({ time: bars[i].time, color: '#000000' });
    }
  }

  // Pine plotshape: Buy on crossover(close, TS), Sell on crossunder(close, TS)
  const markers: MarkerData[] = [];
  for (let i = warmup + 1; i < n; i++) {
    const prevBelow = bars[i - 1].close <= stopArr[i - 1];
    const curAbove = bars[i].close > stopArr[i];
    const prevAbove = bars[i - 1].close >= stopArr[i - 1];
    const curBelow = bars[i].close < stopArr[i];

    if (prevBelow && curAbove) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#00FF00', text: 'BUY' });
    }
    if (prevAbove && curBelow) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#FF0000', text: 'SELL' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot },
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, originalAlertFlags(bars, atrPeriod, atrMultiplier)),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long: Price crossed ATR up', message: 'Price crossed the trailing ATR short stop (bullish)' },
  { id: 'alert1', title: 'Short: Price crossed ATR down', message: 'Price crossed trailing ATR long stop (bearish)' },
];

export const ATRTrailingStops = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
