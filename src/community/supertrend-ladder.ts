/**
 * Supertrend - Ladder ATR - 1909Capital [Trendoscope®]
 *
 * A supertrend with two ATRs: the true range of each bullish bar (open < close) goes into a positive list and the true
 * range of the other bars into a negative list (the last `length` values of each); a moving average (sma / ema / rma /
 * wma / hma of the arrayutils library rules) of each list gives the positive and negative ATR. The buy stop is the low
 * minus Multiplier x negative ATR, the sell stop the high plus Multiplier x positive ATR; the stop distance of the
 * running side only shrinks. The direction turns down when the previous low (close with "Wait For Close") is below
 * the previous buy stop and up when the previous high (close) is above the previous sell stop; "Delayed/Sticky" keeps
 * the stop of the new side until the previous target is reached. The stop of the current side is drawn, teal when
 * up and fuchsia when down; the direction is a data-window value.
 * Alerts (alertcondition, `alerts` of the result): 'Supertrend Bullish Alert' / 'Supertrend Bearish Alert' on a
 * direction change up / down; alert() calls (`alertCalls`, once per bar close): "Supertrend Bullish" /
 * "Supertrend Bearish" on the same bars.
 *
 * Library rules (arrayutils v10, a Pine v5 library): its wma weights the list from the oldest value (index 0) with
 * the largest weight; its ema / rma start from the close of the first bar the list is full and read the oldest
 * value of the list; int / int is an integer division (hma half length, ema factor 2 / (length + 1)).
 *
 * Reference: "Supertrend - Ladder ATR - 1909Capital [Trendoscope®]" by Trendoscope
 * Licence: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0), as the
 * original Pine script (https://creativecommons.org/licenses/by-nc-sa/4.0/). Original notice: © Trendoscope Pty Ltd
 */

import { ta, array, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export type LadderMaType = 'sma' | 'ema' | 'rma' | 'wma' | 'hma';

export interface SupertrendLadderInputs {
  /** Moving Average type */
  matype: LadderMaType;
  /** Moving Average length (number of true ranges kept in each list) */
  malength: number;
  /** ATR Multiplier */
  multiplier: number;
  /** Wait For Close */
  waitForClose: boolean;
  /** Delayed/Sticky */
  delayed: boolean;
}

export const defaultInputs: SupertrendLadderInputs = {
  matype: 'hma',
  malength: 7,
  multiplier: 4,
  waitForClose: false,
  delayed: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'matype', type: 'string', title: 'Moving Average  ', defval: 'hma', options: ['sma', 'ema', 'rma', 'wma', 'hma'],
    group: 'Supertrend', inline: 'ma' },
  { id: 'malength', type: 'int', title: '', defval: 7, group: 'Supertrend', inline: 'ma' },
  { id: 'multiplier', type: 'int', title: 'ATR Multiplier', defval: 4, step: 1, group: 'Supertrend' },
  { id: 'waitForClose', type: 'bool', title: 'Wait For Close', defval: false, group: 'Supertrend' },
  { id: 'delayed', type: 'bool', title: 'Delayed/Sticky', defval: false, group: 'Supertrend' },
];

const UP_COLOR = color.rgb(83, 195, 189);
const DOWN_COLOR = color.fuchsia;

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Supertrend Stop', color: color.blue, lineWidth: 1 },
  // plot(dir, 'Direction', display = display.data_window)
  { id: 'plot1', title: 'Direction', color: color.blue, lineWidth: 1, display: 'data_window' },
];

export const metadata = {
  title: 'Supertrend - Ladder ATR - 1909Capital [Trendoscope®]',
  shortTitle: 'SLA [Trendoscope®]',
  overlay: true,
};

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Supertrend Bullish Alert', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Supertrend Bearish Alert', message: 'Alert Fired!' },
];

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const nz = (v: number, d = 0) => (isNaN(v) ? d : v);
/** math.min / math.max: na when an argument is na */
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
/** Pine v5 int / int (the library is v5): integer division */
const idiv = (a: number, b: number) => (b === 0 ? NaN : Math.trunc(a / b));

/** arrayutils push(arr, val, maxItems): push, then remove the first element when the size exceeds maxItems */
function pushMax(arr: number[], val: number, maxItems: number): void {
  arr.push(val);
  if (arr.length > maxItems) arr.splice(0, 1);
}

/** arrayutils wma(source, length): sum of source[i] * (length - i) for i = 0 .. length - 1, over length * (length + 1) / 2 */
function libWma(source: number[], length: number): number {
  if (length <= 0) return NaN; // lenSum = 0: division by zero
  let masum = 0.0;
  for (let i = 0; i <= length - 1; i++) masum = masum + (source[i] ?? NaN) * (length - i);
  const lenSum = idiv(length * (length + 1), 2);
  return masum / lenSum;
}

/** One pa.ma(source, matype, length) call site, with the state of its var variables */
class LibMa {
  /** var float ma = ta.tr (na on the first bar) */
  private ma = NaN;
  /** var ma = close of ema() / rma(): set on the first call */
  private emaMa: number | null = null;
  private rmaMa: number | null = null;
  /** var hmaRange of hma() */
  private hmaRange: number[] = [];

  constructor(private readonly matype: LadderMaType, private readonly length: number) {}

  next(source: number[], close: number): number {
    const length = this.length;
    if (source.length === length) {
      if (this.matype === 'sma') this.ma = array.avg(source) as number;
      if (this.matype === 'ema') {
        if (this.emaMa === null) this.emaMa = close;
        const last = nz(source[0]);
        const k = idiv(2, length + 1);
        this.emaMa = last * k + (1 - k) * this.emaMa;
        this.ma = this.emaMa;
      }
      if (this.matype === 'rma') {
        if (this.rmaMa === null) this.rmaMa = close;
        const last = nz(source[0]);
        this.rmaMa = (this.rmaMa * (length - 1) + last) / length;
        this.ma = this.rmaMa;
      }
      if (this.matype === 'wma') this.ma = libWma(source, length);
      if (this.matype === 'hma') {
        const wma1 = libWma(source, idiv(length, 2));
        const wma2 = libWma(source, length);
        pushMax(this.hmaRange, 2 * wma1 - wma2, length);
        let hma = NaN;
        if (this.hmaRange.length === length) hma = libWma(this.hmaRange, Math.round(Math.sqrt(length)));
        this.ma = hma;
      }
    }
    return this.ma;
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupertrendLadderInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { malength, multiplier, waitForClose, delayed } = cfg;

  // ta.tr (handle_na false: na on the first bar)
  const tr = ta.tr(bars, false).toArray().map((v) => v ?? NaN);

  const positiveTrArray: number[] = [];
  const negativeTrArray: number[] = [];
  const posMa = new LibMa(cfg.matype, malength);
  const negMa = new LibMa(cfg.matype, malength);

  // supertrend_atr state
  let dir = 1; // var dir = 1
  let buyStop = NaN; // var buyStop / sellStop (set on the first bar)
  let sellStop = NaN;
  let buyStopDiffPrev = NaN; // buyStopDiff[1] / sellStopDiff[1]
  let sellStopDiffPrev = NaN;
  let highConfPrev = NaN; // highConfirmation[1] / lowConfirmation[1]
  let lowConfPrev = NaN;

  const dirArr = new Array<number>(n);
  const stArr = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // if open < close: pa.push(positiveTrArray, ta.tr, malength) else pa.push(negativeTrArray, ta.tr, malength)
    if (lt(b.open, b.close)) pushMax(positiveTrArray, tr[i], malength);
    else pushMax(negativeTrArray, tr[i], malength);
    const positiveAtr = posMa.next(positiveTrArray, b.close);
    const negativeAtr = negMa.next(negativeTrArray, b.close);

    let buyStopDiff = negativeAtr * multiplier;
    let sellStopDiff = positiveAtr * multiplier;
    buyStopDiff = dir === 1 ? min(buyStopDiff, isNaN(buyStopDiffPrev) ? buyStopDiff : buyStopDiffPrev) : buyStopDiff;
    sellStopDiff = dir === -1 ? min(sellStopDiff, isNaN(sellStopDiffPrev) ? sellStopDiff : sellStopDiffPrev) : sellStopDiff;
    if (i === 0) {
      buyStop = b.low - buyStopDiff;
      sellStop = b.high + sellStopDiff;
    }
    const buyStopCurrent = b.low - buyStopDiff;
    const sellStopCurrent = b.high + sellStopDiff;
    const buyStopInverse = b.low - buyStopDiff / 2;
    const sellStopInverse = b.high + sellStopDiff / 2;
    const highConfirmation = waitForClose ? b.close : b.high;
    const lowConfirmation = waitForClose ? b.close : b.low;
    // buyStop / sellStop hold the values of the bar before (buyStop[1] / sellStop[1]) on bars after the first
    const buyStop1 = i > 0 ? buyStop : NaN;
    const sellStop1 = i > 0 ? sellStop : NaN;
    dir = dir === 1 && lt(lowConfPrev, buyStop1) ? -1 : dir === -1 && gt(highConfPrev, sellStop1) ? 1 : dir;
    const targetReached = (dir === 1 && ge(nz(highConfPrev), nz(sellStop1)))
      || (dir === -1 && le(nz(lowConfPrev), nz(buyStop1)))
      || !delayed;
    buyStop = dir === 1
      ? (targetReached ? max(nz(buyStop, buyStopCurrent), buyStopCurrent) : buyStop)
      : (targetReached ? buyStopCurrent : max(nz(buyStop, buyStopInverse), buyStopInverse));
    sellStop = dir === -1
      ? (targetReached ? min(nz(sellStop, sellStopCurrent), sellStopCurrent) : sellStop)
      : (targetReached ? sellStopCurrent : min(nz(sellStop, sellStopInverse), sellStopInverse));

    dirArr[i] = dir;
    stArr[i] = dir > 0 ? buyStop : sellStop;
    buyStopDiffPrev = buyStopDiff;
    sellStopDiffPrev = sellStopDiff;
    highConfPrev = highConfirmation;
    lowConfPrev = lowConfirmation;
  }

  const bull: boolean[] = new Array(n).fill(false);
  const bear: boolean[] = new Array(n).fill(false);
  const alertCalls: AlertCall[] = [];
  for (let i = 1; i < n; i++) {
    // directionChange = ta.change(dir); if directionChange != 0: alert(alertMessage, alert.freq_once_per_bar_close)
    const change = dirArr[i] - dirArr[i - 1];
    bull[i] = change > 0;
    bear[i] = change < 0;
    if (change !== 0) {
      alertCalls.push({ time: bars[i].time as number, message: change > 0 ? 'Supertrend Bullish' : 'Supertrend Bearish', freq: 'once_per_bar_close' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(supertrend, color = dir > 0 ? color.rgb(83, 195, 189) : color.fuchsia, title = 'Supertrend Stop')
      plot0: bars.map((b, i) => ({ time: b.time, value: stArr[i], color: dirArr[i] > 0 ? UP_COLOR : DOWN_COLOR })),
      plot1: bars.map((b, i) => ({ time: b.time, value: dirArr[i] })),
    },
    // alertcondition(ta.change(dir) > 0, ...) / alertcondition(ta.change(dir) < 0, ...)
    alerts: alertStates(alertConditions, bars, [bull, bear]),
    alertCalls,
  };
}

export const SupertrendLadder = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions, hasAlertFunction };
