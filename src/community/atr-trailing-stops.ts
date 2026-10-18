/**
 * ATR + Trailing Stops
 *
 * An ATR of a weighted true range: the body range max(|open - close|, |open - close[1]|, |close - close[1]|) times the
 * body percentage plus the wicks (high - max(open, close) + min(open, close) - low) times the wick percentage,
 * smoothed by RMA / SMA / EMA / WMA over the lookback, times the multiplier. Running mode draws low - ATR and
 * high + ATR on every bar. Trailing mode draws a long stop (low - ATR, only rising) while long and a short stop
 * (high + ATR, only falling) while short, each as a wide line with a thin highlight on top; the side flips when the
 * close (or the wick, per "Flip Trail on") goes beyond the opposite stop, the stop of the new side then restarting at
 * the current low - ATR / high + ATR. Both stops are drawn until the first flip.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Long: Price crossed ATR up' when the flip source goes above the
 * drawn short stop of the bar before (and was not above the one of 2 bars back); 'Short: Price crossed ATR down' the
 * mirror below the drawn long stop.
 *
 * Reference: "ATR + Trailing Stops" by SimpleCryptoLife
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ATRTrailingStopsInputs {
  /** ATR Lookback Period */
  atrPeriod: number;
  atrMultiplier: number;
  trailMode: 'Running' | 'Trailing';
  flipOn: 'Close' | 'Wick';
  bodyPercent: number;
  wickPercent: number;
  smoothing: 'RMA' | 'SMA' | 'EMA' | 'WMA';
}

export const defaultInputs: ATRTrailingStopsInputs = {
  atrPeriod: 14,
  atrMultiplier: 3,
  trailMode: 'Trailing',
  flipOn: 'Close',
  bodyPercent: 100,
  wickPercent: 100,
  smoothing: 'RMA',
};

export const inputConfig: InputConfig[] = [
  { id: 'atrPeriod', type: 'int', title: 'ATR Lookback Period', defval: 14 },
  { id: 'atrMultiplier', type: 'float', title: 'ATR Multiplier', defval: 3, min: 0.5, max: 4, step: 0.1 },
  { id: 'trailMode', type: 'string', title: 'Trail Mode', defval: 'Trailing', options: ['Running', 'Trailing'] },
  { id: 'flipOn', type: 'string', title: 'Flip Trail on:', defval: 'Close', options: ['Close', 'Wick'] },
  { id: 'bodyPercent', type: 'int', title: 'Percentage of Body to Include', defval: 100, min: 0, max: 200, step: 10, group: 'Advanced Settings' },
  { id: 'wickPercent', type: 'int', title: 'Percentage of Wick to Include', defval: 100, min: 0, max: 200, step: 10 },
  { id: 'smoothing', type: 'string', title: 'ATR Smoothing Mode', defval: 'RMA', options: ['RMA', 'SMA', 'EMA', 'WMA'] },
];

const WHITE_60 = String(color.new(color.white, 60));
const NAVY_50 = String(color.new(color.navy, 50));
const MAROON_50 = String(color.new(color.maroon, 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Running ATR Low', color: WHITE_60, lineWidth: 1 },
  { id: 'plot1', title: 'Running ATR High', color: WHITE_60, lineWidth: 1 },
  { id: 'plot2', title: 'Trailing ATR Long Stop', color: NAVY_50, lineWidth: 3, style: 'linebr' },
  { id: 'plot3', title: 'Trailing ATR Long Stop Highlight', color: '#00897B', lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Trailing ATR Short Stop', color: MAROON_50, lineWidth: 3, style: 'linebr' },
  { id: 'plot5', title: 'Trailing ATR Short Stop Highlight', color: '#FF5252', lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'ATR + Trailing Stops',
  shortTitle: 'ATR Trail',
  overlay: true,
};

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long: Price crossed ATR up', message: 'Price crossed the trailing ATR short stop (bullish)' },
  { id: 'alert1', title: 'Short: Price crossed ATR down', message: 'Price crossed trailing ATR long stop (bearish)' },
];

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<ATRTrailingStopsInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // atrPercentAdjustedTrueRange (na on bar 0: close[1] is na)
  const tr = bars.map((b, i) => {
    if (i === 0) return NaN;
    const c1 = bars[i - 1].close;
    const body = Math.max(Math.abs(b.open - b.close), Math.abs(b.open - c1), Math.abs(b.close - c1));
    const wick = b.high - Math.max(b.open, b.close) + Math.min(b.open, b.close) - b.low;
    return body * (cfg.bodyPercent / 100) + wick * (cfg.wickPercent / 100);
  });
  // f_ma(_source, atrLookback, atrSmoothingMode)
  const trSeries = Series.fromArray(bars, tr);
  const maSeries =
    cfg.smoothing === 'RMA' ? ta.rma(trSeries, cfg.atrPeriod)
    : cfg.smoothing === 'SMA' ? ta.sma(trSeries, cfg.atrPeriod)
    : cfg.smoothing === 'EMA' ? ta.ema(trSeries, cfg.atrPeriod)
    : ta.wma(trSeries, cfg.atrPeriod);
  const atr = maSeries.toArray().map((v) => v ?? NaN);

  const atrLow = new Array<number>(n);
  const atrHigh = new Array<number>(n);
  const longPlot = new Array<number>(n).fill(NaN);
  const shortPlot = new Array<number>(n).fill(NaN);
  const flipLongSrc = bars.map((b) => (cfg.flipOn === 'Close' ? b.close : b.high));
  const flipShortSrc = bars.map((b) => (cfg.flipOn === 'Close' ? b.close : b.low));

  // var float trailAtrLong = atrLow / trailAtrShort = atrHigh (na on bar 0: the ATR is na there)
  let trailLong = NaN;
  let trailShort = NaN;
  // var bool _isLong = true / _isShort = true of f_flip; their [1] is na on bar 0
  let isLongPrev: boolean | null = null;
  let isShortPrev: boolean | null = null;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const atrM = atr[i] * cfg.atrMultiplier;
    atrLow[i] = b.low - atrM;
    atrHigh[i] = b.high + atrM;
    // f_trail: the long stop keeps its value while the source is at or below it ('up'), the short stop while the
    // source is at or above it ('down')
    trailLong = le(atrLow[i], trailLong) ? trailLong : atrLow[i];
    trailShort = ge(atrHigh[i], trailShort) ? trailShort : atrHigh[i];
    // f_flip
    let flipLong: boolean = isShortPrev === true && gt(flipLongSrc[i], trailShort);
    let flipShort: boolean = isLongPrev === true && lt(flipShortSrc[i], trailLong);
    flipLong = flipShort && flipLong && gt(b.close, trailLong) ? true : flipShort && flipLong && le(b.close, trailLong) ? false : flipLong;
    flipShort = flipLong && flipShort && lt(b.close, trailShort) ? true : flipShort && flipLong && ge(b.close, trailShort) ? false : flipShort;
    const isLong: boolean = flipLong ? true : flipShort ? false : isLongPrev === null ? true : isLongPrev;
    const isShort: boolean = flipShort ? true : flipLong ? false : isShortPrev === null ? true : isShortPrev;
    // a side that starts on this bar resets its stop (`not _isLong[1]` is na, so false, on bar 0)
    if (isLong && isLongPrev === false) trailLong = atrLow[i];
    if (isShort && isShortPrev === false) trailShort = atrHigh[i];
    if (isLong) longPlot[i] = trailLong;
    if (isShort) shortPlot[i] = trailShort;
    isLongPrev = isLong;
    isShortPrev = isShort;
  }

  const running = cfg.trailMode === 'Running';
  const trailing = cfg.trailMode === 'Trailing';
  const pts = (vals: number[], on: boolean) => bars.map((b, i) => ({ time: b.time, value: on ? vals[i] : NaN }));

  // alertCrossAtrShortStop = flipLongSource > trailAtrShortPlot[1] and flipLongSource[1] <= trailAtrShortPlot[2]
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const crossShortStop = bars.map((_b, i) => gt(flipLongSrc[i], at(shortPlot, i - 1)) && le(at(flipLongSrc, i - 1), at(shortPlot, i - 2)));
  const crossLongStop = bars.map((_b, i) => lt(flipShortSrc[i], at(longPlot, i - 1)) && ge(at(flipShortSrc, i - 1), at(longPlot, i - 2)));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: pts(atrLow, running),
      plot1: pts(atrHigh, running),
      plot2: pts(longPlot, trailing),
      plot3: pts(longPlot, trailing),
      plot4: pts(shortPlot, trailing),
      plot5: pts(shortPlot, trailing),
    },
    alerts: alertStates(alertConditions, bars, [crossShortStop, crossLongStop]),
  };
}

export const ATRTrailingStops = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
