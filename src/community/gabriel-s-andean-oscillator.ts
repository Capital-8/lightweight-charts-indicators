/**
 * Gabriel's Andean Oscillator
 *
 * Exponential envelopes of the close / open (up1 = max(C, O, up1[1] - (up1[1] - C) * alpha), dn1 = min(...), and the
 * same on the squares). The bullish component is the standard deviation of the lower envelope,
 * sqrt(dn2 - dn1^2), the bearish component the one of the upper envelope, sqrt(up2 - up1^2). "Double Smoothed"
 * uses the shorter envelope length and an EMA of each component. Optional components from envelopes of the high /
 * low, an optional ATR scaling, a signal line (EMA of the larger component) and a "Break" area sqrt(bull - bear).
 * Alerts (alertcondition, `alerts` of the result): regime flips (bull crossing bear), driver / signal crosses, break
 * turns (bull - bear crossing 0, with "Plot Breakes" on) and the flips confirmed by the high / low components (with
 * "Use Highs and Lows?" on).
 *
 * Reference: "Gabriel's Andean Oscillator" by GabrielAmadeusLau
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: This work is licensed under a Attribution-NonCommercial-ShareAlike 4.0 International
 * (CC BY-NC-SA 4.0) https://creativecommons.org/licenses/by-nc-sa/4.0/ © alexgrover
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface GabrielsAndeanOscillatorInputs {
  envelopeType: 'Regular' | 'Double Smoothed';
  /** EMA envelope length (Regular) */
  length: number;
  /** EMA envelope length (Double Smoothed) */
  length1: number;
  /** EMA smoothing length of the components (Double Smoothed) */
  length2: number;
  signalLength: number;
  /** Plot the "Break" area */
  breakOn: boolean;
  /** Plot the high / low components */
  hilow: boolean;
  /** Divide the components by the ATR */
  atrScale: boolean;
}

export const defaultInputs: GabrielsAndeanOscillatorInputs = {
  envelopeType: 'Regular',
  length: 50,
  length1: 9,
  length2: 50,
  signalLength: 9,
  breakOn: true,
  hilow: false,
  atrScale: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'envelopeType', type: 'string', title: 'Envelope Type', defval: 'Regular', options: ['Regular', 'Double Smoothed'] },
  { id: 'length', type: 'int', title: 'EMA Envelope Length (Regular)', defval: 50 },
  { id: 'length1', type: 'int', title: 'EMA Envelope Length (Double Smoothed)', defval: 9 },
  { id: 'length2', type: 'int', title: 'EMA Envelope Length Smoothing (Double Smoothed)', defval: 50 },
  { id: 'signalLength', type: 'int', title: 'Signal Length', defval: 9 },
  { id: 'breakOn', type: 'bool', title: 'Plot Breakes', defval: true },
  { id: 'hilow', type: 'bool', title: 'Use Highs and Lows?', defval: false },
  { id: 'atrScale', type: 'bool', title: 'ATR Normalized?', defval: false },
];

const RED_30 = String(color.rgb(242, 54, 70, 30));
const GREEN_30 = String(color.rgb(8, 153, 129, 30));
const BREAK_COL = String(color.rgb(33, 149, 243, 60));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bullish Open Component', color: '#089981', lineWidth: 1 },
  { id: 'plot1', title: 'Bearish Close Component', color: '#f23645', lineWidth: 1 },
  { id: 'plot2', title: 'Bullish High Component', color: GREEN_30, lineWidth: 1 },
  { id: 'plot3', title: 'Bearish Low Component', color: GREEN_30, lineWidth: 1 },
  { id: 'plot4', title: 'Signal', color: color.orange, lineWidth: 1 },
  { id: 'plot5', title: 'Break', color: BREAK_COL, lineWidth: 1, style: 'area' },
];

export const metadata = {
  title: "Gabriel's Andean Oscillator",
  shortTitle: "Gabriel's Andean Oscillator",
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
/** Pine nz(x, y): na (and +-infinity) -> y */
const nz = (x: number, y = 0) => (Number.isFinite(x) ? x : y);
/** Pine math.max / math.min: na when an argument is na */
const max = (...a: number[]) => (a.some((v) => Number.isNaN(v)) ? NaN : Math.max(...a));
const min = (...a: number[]) => (a.some((v) => Number.isNaN(v)) ? NaN : Math.min(...a));

export function calculate(
  bars: Bar[],
  inputs: Partial<GabrielsAndeanOscillatorInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { length, length1, length2, signalLength, breakOn, hilow, atrScale } = cfg;
  const regular = cfg.envelopeType === 'Regular';
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // var alpha = 2 / (length + 1): Pine v6 int / int keeps the fraction
  const alpha = 2 / (length + 1);
  const alpha0 = 2 / (length1 + 1);
  const alpha2 = 2.0 / (length + 1.0);
  const alpha22 = 2.0 / (length1 + 1.0);
  const a = regular ? alpha : alpha0;
  const a2 = regular ? alpha2 : alpha22;

  // Raw components: dev of the close / open envelopes (vBull / vBear) and of the high / low envelopes (vBull2 / vBear2)
  const vBull: number[] = new Array(n);
  const vBear: number[] = new Array(n);
  const vBull2: number[] = new Array(n);
  const vBear2: number[] = new Array(n);
  // up1[1] ... is na on bar 0 (the var history starts on bar 0), so math.max(...) is na and nz(..., C) gives C
  let up1 = NaN;
  let up2 = NaN;
  let dn1 = NaN;
  let dn2 = NaN;
  // up12[1] ... are read through nz(): 0 on bar 0
  let up12 = NaN;
  let up22 = NaN;
  let dn12 = NaN;
  let dn22 = NaN;
  for (let i = 0; i < n; i++) {
    const C = bars[i].close;
    const O = bars[i].open;
    const nUp1 = nz(max(C, O, up1 - (up1 - C) * a), C);
    const nUp2 = nz(max(C * C, O * O, up2 - (up2 - C * C) * a), C * C);
    const nDn1 = nz(min(C, O, dn1 + (C - dn1) * a), C);
    const nDn2 = nz(min(C * C, O * O, dn2 + (C * C - dn2) * a), C * C);
    up1 = nUp1;
    up2 = nUp2;
    dn1 = nDn1;
    dn2 = nDn2;

    const C2 = bars[i].high;
    const O2 = bars[i].low;
    const p12 = nz(up12);
    const p22 = nz(up22);
    const q12 = nz(dn12);
    const q22 = nz(dn22);
    up12 = nz(max(C2, O2, p12 - (p12 - C2) * a2), C2);
    // "Double Smoothed" up22: nz(math.max(C2 * C2, O2 * O2, nz(up22[1]) - (nz(up22[1]) - C2 * C2))) (no alpha)
    up22 = regular
      ? nz(max(C2 * C2, O2 * O2, p22 - (p22 - C2 * C2) * alpha2), C2 * C2)
      : nz(max(C2 * C2, O2 * O2, p22 - (p22 - C2 * C2)));
    dn12 = nz(min(C2, O2, q12 + (C2 - q12) * a2), C2);
    dn22 = nz(min(C2 * C2, O2 * O2, q22 + (C2 * C2 - q22) * a2), C2 * C2);

    vBull[i] = Math.sqrt(dn2 - dn1 * dn1);
    vBear[i] = Math.sqrt(up2 - up1 * up1);
    vBull2[i] = Math.sqrt(dn22 - dn12 * dn12);
    vBear2[i] = Math.sqrt(up22 - up12 * up12);
  }

  // The envelope type and the ATR switch are inputs: each ternary takes the same branch on every bar
  let bull: number[];
  let bear: number[];
  let bull2: number[];
  let bear2: number[];
  if (regular) {
    const atr = atrScale ? A(ta.atr(bars, length)) : null;
    const scale = (v: number[]) => v.map((x, i) => (atr ? x / atr[i] : x / 1));
    bull = scale(vBull);
    bear = scale(vBear);
    bull2 = scale(vBull2);
    bear2 = scale(vBear2);
  } else {
    const den = atrScale ? A(ta.sma(ta.atr(bars, length1), length2)) : null;
    const smooth = (v: number[]) => A(ta.ema(S(v), length2)).map((x, i) => (den ? x / den[i] : x / 1));
    bull = smooth(vBull);
    bear = smooth(vBear);
    bull2 = smooth(vBull2);
    bear2 = smooth(vBear2);
  }

  const signal = A(ta.ema(S(bull.map((b, i) => max(b, bear[i]))), signalLength));

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const t = (i: number) => bars[i].time;
  const plots = {
    plot0: bars.map((_b, i) => ({ time: t(i), value: fin(bull[i]) })),
    plot1: bars.map((_b, i) => ({ time: t(i), value: fin(bear[i]) })),
    // color = bull > bull2 ? color.rgb(242, 54, 70, 30) : color.rgb(8, 153, 129, 30)
    plot2: bars.map((_b, i) => ({
      time: t(i), value: hilow ? fin(bull2[i]) : NaN, color: gt(bull[i], bull2[i]) ? RED_30 : GREEN_30,
    })),
    plot3: bars.map((_b, i) => ({
      time: t(i), value: hilow ? fin(bear2[i]) : NaN, color: gt(bear[i], bear2[i]) ? RED_30 : GREEN_30,
    })),
    plot4: bars.map((_b, i) => ({ time: t(i), value: fin(signal[i]) })),
    // math.sqrt(bull - bear): na when bear > bull
    plot5: bars.map((_b, i) => ({ time: t(i), value: breakOn ? fin(Math.sqrt(bull[i] - bear[i])) : NaN })),
  };

  // Alerts: crosses of bull / bear, of the driver (larger component) and the signal, of bull - bear and 0
  const bullCrossUp = crossedOver(bull, bear);
  const bearCrossDn = crossedUnder(bull, bear);
  const driver = bull.map((b, i) => max(b, bear[i]));
  const sigUp = crossedOver(driver, signal);
  const sigDn = crossedUnder(driver, signal);
  const diff = bull.map((b, i) => b - bear[i]);
  const breakUp = crossedOver(diff, 0).map((f) => breakOn && f);
  const breakDn = crossedUnder(diff, 0).map((f) => breakOn && f);
  const bullConfirm = bullCrossUp.map((f, i) => hilow && f && gt(bull[i], bull2[i]));
  const bearConfirm = bearCrossDn.map((f, i) => hilow && f && gt(bear[i], bear2[i]));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    alerts: alertStates(alertConditions, bars, [bullCrossUp, bearCrossDn, sigUp, sigDn, breakUp, breakDn, bullConfirm, bearConfirm]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0',
    title: 'Andean • Bullish Regime Flip',
    message: '{{ticker}} {{interval}} • Andean Oscillator: Bull crossed ABOVE Bear (Bullish regime flip).',
  },
  {
    id: 'alert1',
    title: 'Andean • Bearish Regime Flip',
    message: '{{ticker}} {{interval}} • Andean Oscillator: Bull crossed BELOW Bear (Bearish regime flip).',
  },
  {
    id: 'alert2',
    title: 'Andean • Signal Cross Up',
    message: '{{ticker}} {{interval}} • Andean Oscillator: Driver crossed ABOVE Signal (bullish thrust).',
  },
  {
    id: 'alert3',
    title: 'Andean • Signal Cross Down',
    message: '{{ticker}} {{interval}} • Andean Oscillator: Driver crossed BELOW Signal (bearish thrust).',
  },
  {
    id: 'alert4',
    title: 'Andean • Break Turned Positive',
    message: '{{ticker}} {{interval}} • Andean Oscillator: Break turned POSITIVE (bull > bear).',
  },
  {
    id: 'alert5',
    title: 'Andean • Break Turned Negative',
    message: '{{ticker}} {{interval}} • Andean Oscillator: Break turned NEGATIVE (bear > bull).',
  },
  {
    id: 'alert6',
    title: 'Andean • Bullish Regime Flip (Hi/Lo Confirmed)',
    message: '{{ticker}} {{interval}} • Andean Oscillator: Bullish flip CONFIRMED by High/Low envelopes.',
  },
  {
    id: 'alert7',
    title: 'Andean • Bearish Regime Flip (Hi/Lo Confirmed)',
    message: '{{ticker}} {{interval}} • Andean Oscillator: Bearish flip CONFIRMED by High/Low envelopes.',
  },
];

export const GabrielsAndeanOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
