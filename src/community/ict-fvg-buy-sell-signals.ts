/**
 * ICT FVG Buy/Sell Signals
 *
 * The dealing range is the last pivot high and pivot low (swing length `lenSwing`); its midpoint (CE) splits premium
 * (close above) from discount (close below), shown by the background. A bullish fair value gap is a bar whose low is
 * above the high of two bars before; a bearish gap a bar whose high is below the low of two bars before. The midpoint
 * (CE) of the last gap of each side is drawn as circles. BUY: the bar trades into the last bullish gap, is in discount
 * (with the filter), is a bullish displacement bar (body >= ATR * multiple) and closes above the gap CE. SELL mirrors it.
 * Alerts (alertcondition, `alerts` of the result): 'ICT Buy' and 'ICT Sell', true on the bars of each signal.
 *
 * Reference: "ICT FVG Buy/Sell Signals" by svmstellarvisionmedia
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © svmstellarvisionmedia
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface IctFvgBuySellSignalsInputs {
  /** Swing length of the dealing range pivots */
  lenSwing: number;
  /** Only buy in discount / sell in premium */
  usePDFilter: boolean;
  /** Minimum body size as ATR multiple (displacement) */
  displATR: number;
  /** ATR length */
  atrLen: number;
}

export const defaultInputs: IctFvgBuySellSignalsInputs = {
  lenSwing: 5,
  usePDFilter: true,
  displATR: 0.6,
  atrLen: 14,
};

export const inputConfig: InputConfig[] = [
  { id: 'lenSwing', type: 'int', title: 'Swing length (dealing range pivots)', defval: 5, min: 2 },
  { id: 'usePDFilter', type: 'bool', title: 'Only Buy in Discount / Sell in Premium', defval: true },
  { id: 'displATR', type: 'float', title: 'Min body size as ATR multiple (displacement)', defval: 0.6, min: 0.0, step: 0.1 },
  { id: 'atrLen', type: 'int', title: 'ATR length', defval: 14 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Dealing Range CE', color: color.yellow, lineWidth: 2, style: 'stepline' },
  { id: 'plot1', title: 'Bullish FVG CE', color: color.teal, lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'Bearish FVG CE', color: color.red, lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'ICT FVG Buy/Sell Signals',
  shortTitle: 'ICT FVG Buy/Sell Signals',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ICT Buy', message: 'ICT Buy Signal' },
  { id: 'alert1', title: 'ICT Sell', message: 'ICT Sell Signal' },
];

export function calculate(
  bars: Bar[],
  inputs: Partial<IctFvgBuySellSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const atr = A(ta.atr(bars, cfg.atrLen));
  const ph = A(ta.pivothigh(S(bars.map((b) => b.high)), cfg.lenSwing, cfg.lenSwing));
  const pl = A(ta.pivotlow(S(bars.map((b) => b.low)), cfg.lenSwing, cfg.lenSwing));

  const premiumBg = String(color.new(color.red, 92));
  const discountBg = String(color.new(color.teal, 92));
  const eqArr: number[] = new Array(n);
  const bullCeArr: number[] = new Array(n);
  const bearCeArr: number[] = new Array(n);
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const longFlags: boolean[] = new Array(n).fill(false);
  const shortFlags: boolean[] = new Array(n).fill(false);

  let drHigh = NaN; // var float drHigh = na
  let drLow = NaN; // var float drLow = na
  // ta.valuewhen(cond, x, 0): x on the last bar where cond was true
  let lastBullTop = NaN;
  let lastBullBottom = NaN;
  let lastBullCE = NaN;
  let lastBearTop = NaN;
  let lastBearBottom = NaN;
  let lastBearCE = NaN;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const body = Math.abs(b.close - b.open);
    // body / atr: atr is 0 only when every true range is 0, then body is 0 too and Pine 0 / 0 is NaN
    const ratio = atr[i] === 0 ? NaN : body / atr[i];
    const isBullDisp = ge(ratio, cfg.displATR) && gt(b.close, b.open);
    const isBearDisp = ge(ratio, cfg.displATR) && lt(b.close, b.open);

    if (!isNaN(ph[i])) drHigh = ph[i];
    if (!isNaN(pl[i])) drLow = pl[i];
    const rangeReady = !isNaN(drHigh) && !isNaN(drLow);
    const eq = rangeReady ? (drHigh + drLow) / 2.0 : NaN;
    const inPremium = rangeReady && gt(b.close, eq);
    const inDiscount = rangeReady && lt(b.close, eq);
    eqArr[i] = eq;
    if (rangeReady) bgColors.push({ time: b.time, color: inPremium ? premiumBg : discountBg });

    // 3-bar fair value gaps
    const high2 = i >= 2 ? bars[i - 2].high : NaN;
    const low2 = i >= 2 ? bars[i - 2].low : NaN;
    const bullFVG = gt(b.low, high2);
    const bearFVG = lt(b.high, low2);
    if (bullFVG) {
      lastBullTop = b.low;
      lastBullBottom = high2;
      lastBullCE = (lastBullTop + lastBullBottom) / 2.0;
    }
    if (bearFVG) {
      lastBearTop = low2;
      lastBearBottom = b.high;
      lastBearCE = (lastBearTop + lastBearBottom) / 2.0;
    }
    bullCeArr[i] = lastBullCE;
    bearCeArr[i] = lastBearCE;

    const inBullZone = !isNaN(lastBullTop) && !isNaN(lastBullBottom) && le(b.low, lastBullTop) && ge(b.high, lastBullBottom);
    const inBearZone = !isNaN(lastBearTop) && !isNaN(lastBearBottom) && ge(b.high, lastBearBottom) && le(b.low, lastBearTop);
    const longOkPD = !cfg.usePDFilter || inDiscount;
    const shortOkPD = !cfg.usePDFilter || inPremium;
    // close > nz(lastBullCE, close)
    const longSignal = inBullZone && longOkPD && isBullDisp && gt(b.close, isNaN(lastBullCE) ? b.close : lastBullCE);
    const shortSignal = inBearZone && shortOkPD && isBearDisp && lt(b.close, isNaN(lastBearCE) ? b.close : lastBearCE);
    longFlags[i] = longSignal;
    shortFlags[i] = shortSignal;
    if (longSignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY',
        textColor: color.white, size: 'small' });
    }
    if (shortSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.white, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: eqArr[i], color: color.yellow })),
      plot1: bars.map((b, i) => ({ time: b.time, value: bullCeArr[i], color: color.teal })),
      plot2: bars.map((b, i) => ({ time: b.time, value: bearCeArr[i], color: color.red })),
    },
    markers,
    bgColors,
    // alertcondition(longSignal, "ICT Buy") / alertcondition(shortSignal, "ICT Sell")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

export const IctFvgBuySellSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
