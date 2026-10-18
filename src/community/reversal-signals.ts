/**
 * Reversal Signals [LuxAlgo]
 *
 * Momentum phase: counts consecutive closes below the close of 4 bars before (bullish count) or not below it
 * (bearish count), from 1 to 9. A count of 9 completes the phase ("perfect" when the low of one of the last two bars
 * is at or below the lows of 2 and 3 bars back; mirrored for the bearish phase); a count stopped at 8 is an early
 * phase. A completed or early bullish phase sets a resistance level (highest high of 9 bars) kept until a close
 * above it; a bearish phase sets a support level (lowest low of 9 bars). Each phase also has a risk level.
 *
 * Trend exhaustion phase: starts on a completed perfect momentum phase and counts the closes at or below the low of
 * 2 bars before (at or above the high for the bearish phase) up to 13, with the count 13 delayed while the bar does
 * not pass the close of count 8. It gives a completion label (E) and target and risk levels.
 *
 * Trade setups (off by default): a completed phase followed by a price flip gives an L / S label with the stop and
 * the target in its tooltip, and optional warning labels on price flips against the setup. At most 500 labels are
 * kept.
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar): the trade setups, the crosses of the support /
 * resistance and risk levels, the phase completions and the start of a bullish / bearish momentum, with the messages
 * of the original (ticker from the chart context).
 *
 * The two "Overall Trend Mark" shapes are hidden in the original (display.none) and are not drawn. The prices in
 * the label tooltips and alert messages use the price tick of the symbol: the port reads it from the chart context
 * (third argument) and uses 0.01 without it.
 *
 * Reference: "Reversal Signals [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, Series, color, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, LabelData, MarkerData } from '../types';
import { mintickOf, tickerOf, type ChartContext } from '../chart-context';

/** The original calls alert() */
export const hasAlertFunction = true;

export interface ReversalSignalsInputs {
  /** Display of the momentum phases */
  bSh: 'Completed' | 'Detailed' | 'None';
  /** Support and resistance levels */
  srL: boolean;
  ptLT: 'Circles' | 'Step Line' | 'Step Line w/ Diamonds';
  /** Momentum phase risk levels */
  rsB: boolean;
  ptSR: 'Circles' | 'Step Line';
  /** Display of the trend exhaustion phases */
  eSh: 'Completed' | 'Detailed' | 'None';
  /** Trend exhaustion phase risk levels */
  rsE: boolean;
  /** Trend exhaustion phase target levels */
  ttE: boolean;
  /** Phase specific trade setup */
  tso: 'Momentum' | 'Exhaustion' | 'Qualified' | 'None';
  /** Price flips against the phase specific trade setups */
  war: boolean;
}

export const defaultInputs: ReversalSignalsInputs = {
  bSh: 'Completed',
  srL: true,
  ptLT: 'Step Line w/ Diamonds',
  rsB: false,
  ptSR: 'Circles',
  eSh: 'Completed',
  rsE: false,
  ttE: false,
  tso: 'None',
  war: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'bSh', type: 'string', title: 'Display Phases', defval: 'Completed', options: ['Completed', 'Detailed', 'None'], group: 'Momentum Phase' },
  { id: 'srL', type: 'bool', title: 'Support & Resistance Levels', defval: true, inline: 'bSh', group: 'Momentum Phase' },
  { id: 'ptLT', type: 'string', title: '', defval: 'Step Line w/ Diamonds', options: ['Circles', 'Step Line', 'Step Line w/ Diamonds'], inline: 'bSh', group: 'Momentum Phase' },
  { id: 'rsB', type: 'bool', title: 'Momentum Phase Risk Levels', defval: false, inline: 'bSh2', group: 'Momentum Phase' },
  { id: 'ptSR', type: 'string', title: '', defval: 'Circles', options: ['Circles', 'Step Line'], inline: 'bSh2', group: 'Momentum Phase' },
  { id: 'eSh', type: 'string', title: 'Display Phases', defval: 'Completed', options: ['Completed', 'Detailed', 'None'], group: 'Trend Exhaustion Phase' },
  { id: 'rsE', type: 'bool', title: 'Trend Exhaustion Phase Risk Levels', defval: false, group: 'Trend Exhaustion Phase' },
  { id: 'ttE', type: 'bool', title: 'Trend Exhaustion Phase Target Levels', defval: false, group: 'Trend Exhaustion Phase' },
  { id: 'tso', type: 'string', title: 'Phase Specific Trade Setup Options', defval: 'None', options: ['Momentum', 'Exhaustion', 'Qualified', 'None'], group: 'Trade Setups' },
  { id: 'war', type: 'bool', title: 'Price Flips against the Phase Specific Trade Setups', defval: false, group: 'Trade Setups' },
];

const RED = '#f23645';
const GREEN = '#089981';
const WHITE = '#ffffff';
const BLUE = '#2962ff';
const GRAY = '#787b86';
const CYAN = '#00bcd4';
/** noC = #00000000 */
const NO_COLOR = '#00000000';
/** color.yellow, color.blue and color.white of Pine v5 */
const YELLOW = '#FFEB3B';
const LABEL_BLUE = '#2962FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Resistance Levels', color: String(color.new(RED, 50)), lineWidth: 2, style: 'steplinebr' },
  { id: 'plot1', title: 'Bullish Momentum Risk Levels', color: BLUE, lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'Support Levels', color: String(color.new(GREEN, 50)), lineWidth: 2, style: 'steplinebr' },
  { id: 'plot3', title: 'Bearish Momentum Risk Levels', color: BLUE, lineWidth: 1, style: 'circles' },
  { id: 'plot4', title: 'Bullish Exhaustion Target Levels', color: GRAY, lineWidth: 1, style: 'circles' },
  { id: 'plot5', title: 'Bullish Exhaustion Risk Levels', color: CYAN, lineWidth: 1, style: 'circles' },
  { id: 'plot6', title: 'Bearish Exhaustion Risk Levels', color: CYAN, lineWidth: 1, style: 'circles' },
  { id: 'plot7', title: 'Bearish Exhaustion Target Levels', color: GRAY, lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'Reversal Signals [LuxAlgo]',
  shortTitle: 'LuxAlgo - Reversal Signals',
  overlay: true,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

/** Subscript digits of the detailed counts */
const DIGITS = ['₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '₁₀', '₁₁', '₁₂'];

export function calculate(
  bars: Bar[],
  inputs: Partial<ReversalSignalsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'labels'> & { markers: MarkerData[]; labels: LabelData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { srL, rsB, rsE, ttE, tso, war } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const BnoShw = cfg.bSh !== 'None';
  const Bcmpltd = cfg.bSh === 'Completed';
  const noShw = cfg.eSh !== 'None';
  const cmpltd = cfg.eSh === 'Completed';
  const diamonds = cfg.ptLT.includes('Diamonds');
  const trdS = tso !== 'None';

  const sR = A(ta.highest(new Series(bars, (b) => b.high), 9));
  const sS = A(ta.lowest(new Series(bars, (b) => b.low), 9));

  const close = (i: number) => (i >= 0 ? bars[i].close : NaN);
  const high = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const low = (i: number) => (i >= 0 ? bars[i].low : NaN);

  // Momentum phase (type trb): the counts are na until the first bar that resets them
  let bSC = NaN;
  let bSH = NaN;
  let bSL = NaN;
  let sSC = NaN;
  let sSH = NaN;
  let sSL = NaN;
  // Trend exhaustion phase (type tre)
  let bCC = NaN;
  let bC8 = NaN;
  let bCHt = NaN;
  let bCH = NaN;
  let bCL = NaN;
  let bCLt = NaN;
  let fieldBCD = NaN; // C.bCD
  let sCC = NaN;
  let sC8 = NaN;
  let sCHt = NaN;
  let sCH = NaN;
  let sCL = NaN;
  let sCLt = NaN;
  let fieldSCT = NaN; // C.sCT

  // Values of the bar before
  let bSCPrev = NaN;
  let sSCPrev = NaN;
  let bSR = NaN;
  let sSS = NaN;
  let bSD = NaN;
  let sSD = NaN;
  let pbSPrev = false;
  let psSPrev = false;
  let sbC = false;
  let ssC = false;
  let bCT = NaN;
  let bCD = NaN;
  let sCD = NaN;
  let sCT = NaN;
  const bCCHist: number[] = []; // C.bCC at the end of each bar
  const sCCHist: number[] = [];

  // Trade setups
  let sbPF = false;
  let bPFc = false;
  let ssPF = false;
  let sPFc = false;
  let lTrd = false;
  let sTrd = false;
  // ta.valuewhen(cond, bar_index, 0 / 1)
  let bBl9 = NaN;
  let bBp9 = NaN;
  let bB13 = NaN;
  let sBl9 = NaN;
  let sBp9 = NaN;
  let sB13 = NaN;

  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  const tTxt = tickerOf(chart);
  let labels: LabelData[] = [];
  const newLabel = (l: LabelData) => {
    labels.push(l);
    if (labels.length > MAX_LABELS + 5) labels = labels.slice(labels.length - MAX_LABELS);
  };
  const mintick = mintickOf(chart);
  const tick = (v: number) => str.tostring(v, 'mintick', mintick);

  type Point = { time: number; value: number };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const plot5: Point[] = [];
  const plot6: Point[] = [];
  const plot7: Point[] = [];

  const bullPhase = String(color.new(GREEN, 25));
  const bearPhase = String(color.new(RED, 25));
  const bullPerfect8 = String(color.new(GREEN, 75));
  const bearPerfect8 = String(color.new(RED, 75));
  const bullExhaustion = String(color.new('#006400', 25));
  const bearExhaustion = String(color.new('#910000', 25));

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time;
    const c = b.close;
    /** plotshape with a text and no visible body (digits of the detailed display) */
    const digit = (id: number, on: boolean, text: string, textColor: string, below: boolean, body = NO_COLOR) => {
      if (on) {
        markers.push({ id: `shape${id}`, time, position: below ? 'belowBar' : 'aboveBar', shape: 'labelDown', color: body, text, textColor });
      }
    };
    /** plotshape of a completed phase (size.tiny) */
    const phase = (id: number, on: boolean, up: boolean, body: string, text: string) => {
      if (!on) return;
      markers.push({
        id: `shape${id}`, time, position: up ? 'belowBar' : 'aboveBar', shape: up ? 'labelUp' : 'labelDown', color: body,
        ...(text ? { text } : {}), textColor: WHITE, size: 'tiny',
      });
    };

    // Momentum phase
    const con = lt(c, close(i - 4));
    if (con) {
      bSC = bSC === 9 ? 1 : bSC + 1;
      sSC = 0;
    } else {
      sSC = sSC === 9 ? 1 : sSC + 1;
      bSC = 0;
    }

    const pbS = (le(b.low, low(i - 3)) && le(b.low, low(i - 2))) || (le(low(i - 1), low(i - 3)) && le(low(i - 1), low(i - 2)));
    const detailed = BnoShw && !Bcmpltd;
    // Shape ids: the original's plotshape outputs in declaration order (shape0 ... shape53)
    for (let k = 1; k <= 7; k++) digit(k - 1, detailed && bSC === k, DIGITS[k - 1], GREEN, false);
    digit(7, detailed && bSC === 8 && !pbS, '₈', GREEN, false);
    digit(8, detailed && bSC === 8 && pbS, 'ᵖ\n₈', WHITE, false, bullPerfect8);
    phase(9, BnoShw && bSC === 9 && !pbS, true, bullPhase, '');
    phase(10, BnoShw && bSC === 9 && pbS, true, bullPhase, 'ᵖ');
    const bullEarly = bSCPrev === 8 && sSC === 1; // bC8
    phase(11, BnoShw && bullEarly, true, bullPhase, '');

    const bSR1 = bSR;
    bSR = bSC === 9 || bullEarly ? sR[i] : gt(c, bSR1) ? 0 : bSR1;
    plot0.push({ time, value: srL && gt(bSR, 0) ? bSR : NaN });
    if (srL && gt(bSR, 0) && ne(bSR, bSR1) && diamonds) {
      markers.push({ id: 'shape12', time, position: 'atPriceMiddle', price: bSR, shape: 'diamond', color: RED, size: 'tiny' });
    }

    if (bSC === 1) bSL = b.low;
    if (bSC > 0) {
      bSL = Math.min(b.low, bSL);
      if (eq(b.low, bSL)) bSH = b.high;
    }
    const bSD1 = bSD;
    bSD = bSC === 9 ? 2 * bSL - bSH : lt(c, bSD1) || sSC === 9 ? 0 : bSD1;
    plot1.push({ time, value: rsB && gt(bSD, 0) ? bSD : NaN });

    const psS = (ge(b.high, high(i - 3)) && ge(b.high, high(i - 2))) || (ge(high(i - 1), high(i - 3)) && ge(high(i - 1), high(i - 2)));
    for (let k = 1; k <= 7; k++) digit(12 + k, detailed && sSC === k, DIGITS[k - 1], RED, false);
    digit(20, detailed && sSC === 8 && !psS, '₈', RED, false);
    digit(21, detailed && sSC === 8 && psS, 'ᵖ\n₈', WHITE, false, bearPerfect8);
    phase(22, BnoShw && sSC === 9 && !psS, false, bearPhase, '');
    phase(23, BnoShw && sSC === 9 && psS, false, bearPhase, 'ᵖ');
    const bearEarly = sSCPrev === 8 && bSC === 1; // sC8
    phase(24, BnoShw && bearEarly, false, bearPhase, '');

    const sSS1 = sSS;
    sSS = sSC === 9 || bearEarly ? sS[i] : lt(c, sSS1) ? 0 : sSS1;
    plot2.push({ time, value: srL && gt(sSS, 0) ? sSS : NaN });
    if (srL && gt(sSS, 0) && ne(sSS, sSS1) && diamonds) {
      markers.push({ id: 'shape25', time, position: 'atPriceMiddle', price: sSS, shape: 'diamond', color: GREEN, size: 'tiny' });
    }

    if (sSC === 1) sSH = b.high;
    if (sSC > 0) {
      sSH = Math.max(b.high, sSH);
      if (eq(b.high, sSH)) sSL = b.low;
    }
    const sSD1 = sSD;
    sSD = sSC === 9 ? 2 * sSH - sSL : gt(c, sSD1) || bSC === 9 ? 0 : sSD1;
    plot3.push({ time, value: rsB && gt(sSD, 0) ? sSD : NaN });

    // Trend exhaustion phase - bullish
    const bCount = le(c, low(i - 2));
    const b13 = bCount && ge(b.low, bC8);
    const bCC1 = bCC; // C.bCC[1]
    if (bSC === 9 && bCC === 0 && (pbS || pbSPrev)) sbC = true;
    else if (sSC === 9 || bCC === 13 || gt(c, bSR)) sbC = false;

    bCC = sbC ? (bSC === 9 ? (bCount ? 1 : 0) : bCount ? bCC + 1 : bCC) : 0;
    if (bCC === 13 && b13) bCC -= 1;
    const bChanged = !isNaN(bCC) && !isNaN(bCC1) && bCC !== bCC1;
    if (bCC === 8 && bChanged) bC8 = c;

    const shwBC = noShw && !cmpltd && sbC && bChanged;
    for (let k = 1; k <= 12; k++) digit(25 + k, shwBC && bCC === k, DIGITS[k - 1], GREEN, true);
    digit(38, noShw && !cmpltd && sbC && bCC === bCC1 && bCC === 12 && b13, '₊', GREEN, true);
    phase(39, noShw && sbC && bChanged && bCC === 13, true, bullExhaustion, 'E');

    if (bCC === 1) {
      bCLt = b.low;
      bCHt = b.high;
    }
    if (sbC) {
      bCHt = Math.max(b.high, bCHt);
      bCLt = Math.min(b.low, bCLt);
      if (eq(b.high, bCHt)) bCL = b.low;
      if (eq(b.low, bCLt)) bCH = b.high;
    }

    // C.sCC is still the count of the bar before here
    const bCT1 = bCT;
    bCT = bCC === 13 ? 2 * bCHt - bCL : gt(c, bCT1) || (eq(fieldBCD, 0) && sCC === 13) ? 0 : bCT1;
    plot4.push({ time, value: ttE && gt(bCT, 0) ? bCT : NaN });

    const bCD1 = bCD;
    bCD = bCC === 13 ? 2 * bCLt - bCH : lt(c, bCD1) || (eq(bCT, 0) && sCC === 13) ? 0 : bCD1;
    fieldBCD = bCD;
    plot5.push({ time, value: rsE && gt(bCD, 0) ? bCD : NaN });

    // Trend exhaustion phase - bearish
    const sCount = ge(c, high(i - 2));
    const s13 = sCount && le(b.high, sC8);
    const sCC1 = sCC; // C.sCC[1]
    if (sSC === 9 && sCC === 0 && (psS || psSPrev)) ssC = true;
    else if (bSC === 9 || sCC === 13 || lt(c, sSS)) ssC = false;

    sCC = ssC ? (sSC === 9 ? (sCount ? 1 : 0) : sCount ? sCC + 1 : sCC) : 0;
    if (sCC === 13 && s13) sCC -= 1;
    const sChanged = !isNaN(sCC) && !isNaN(sCC1) && sCC !== sCC1;
    if (sCC === 8 && sChanged) sC8 = c;

    const shwSC = noShw && !cmpltd && ssC && sChanged;
    for (let k = 1; k <= 12; k++) digit(39 + k, shwSC && sCC === k, DIGITS[k - 1], RED, true);
    digit(52, noShw && !cmpltd && ssC && sCC === sCC1 && sCC === 12 && s13, '₊', RED, true);
    phase(53, noShw && ssC && sChanged && sCC === 13, false, bearExhaustion, 'E');

    if (sCC === 1) {
      sCLt = b.low;
      sCHt = b.high;
    }
    if (ssC) {
      sCHt = Math.max(b.high, sCHt);
      sCLt = Math.min(b.low, sCLt);
      if (eq(b.high, sCHt)) sCL = b.low;
      if (eq(b.low, sCLt)) sCH = b.high;
    }

    const sCD1 = sCD;
    sCD = sCC === 13 ? 2 * sCHt - sCL : gt(c, sCD1) || (eq(fieldSCT, 0) && bCC === 13) ? 0 : sCD1;
    plot6.push({ time, value: rsE && gt(sCD, 0) ? sCD : NaN });

    const sCT1 = sCT;
    sCT = sCC === 13 ? 2 * sCLt - sCH : lt(c, sCT1) || (eq(sCD, 0) && bCC === 13) ? 0 : sCT1;
    fieldSCT = sCT;
    plot7.push({ time, value: ttE && gt(sCT, 0) ? sCT : NaN });

    bCCHist.push(bCC);
    sCCHist.push(sCC);

    // Trade setups
    if (bSC === 9) {
      bBp9 = bBl9;
      bBl9 = i;
    }
    if (bCC === 13) bB13 = i;
    if (sSC === 9) {
      sBp9 = sBl9;
      sBl9 = i;
    }
    if (sCC === 13) sB13 = i;

    const c1 = close(i - 1);
    const c4 = close(i - 4);
    const c5 = close(i - 5);

    const sQC = sBl9 > sB13 && sB13 > sBp9 && sBp9 > bBl9;
    const sPFO = tso === 'Momentum' ? sSC === 9 || bearEarly
      : tso === 'Exhaustion' ? (i >= 5 && sCCHist[i - 5] === 13)
        : sSC === 9 && sQC;
    if (sPFO) ssPF = true;
    else if (sPFc) ssPF = false;
    sPFc = ssPF && lt(c, c4) && gt(c1, c5);

    if (sPFc && trdS) {
      const stop = tso === 'Exhaustion' ? sCD : sSD;
      const risky = eq(stop, 0);
      const sTT = 'Short Trade Setup' + (risky ? ' - Risky' : '') + '\n Signal : Completed ' + tso + ' plus Bearish Price Flip\n'
        + ' Stop    : ' + tick(risky ? b.high : stop)
        + '\n Target : ' + tick(tso === 'Exhaustion' ? sCT : sSS);
      newLabel({
        time, price: b.high, text: 'S', color: String(color.new(YELLOW, 25)), style: 'label_down', textColor: WHITE,
        size: 'small', tooltip: sTT + '\n\nnot a finacial advice, subject to high risk',
      });
      alertCalls.push({
        time, freq: 'once_per_bar',
        message: tTxt + ' : ' + sTT + '\n Price    : ' + tick(c) + '\n\nnot a finacial advice, subject to high risk',
      });
      sTrd = true;
      lTrd = false;
    }
    if (war && sTrd && lt(b.open, c) && sSC === 2 && !lTrd) {
      newLabel({
        time, price: b.low, text: '⚠️', color: String(color.new(YELLOW, 100)), style: 'label_up', textColor: YELLOW,
        size: 'large', tooltip: 'Warning\nbullish price flip detected',
      });
      sTrd = false;
    }
    if (war && sTrd && lt(b.open, c) && ((ne(sSD1, 0) && gt(c, sSD1)) || (ne(sCD1, 0) && gt(c, sCD1)))) {
      newLabel({
        time, price: b.low, text: '⚠️', color: String(color.new(YELLOW, 100)), style: 'label_up', textColor: YELLOW,
        size: 'large', tooltip: 'Critical Warning\nstop/risk level breached',
      });
      sTrd = false;
    }

    const bQC = bBl9 > bB13 && bB13 > bBp9 && bBp9 > sBl9;
    const bPFO = tso === 'Momentum' ? bSC === 9 || bullEarly
      : tso === 'Exhaustion' ? (i >= 5 && bCCHist[i - 5] === 13)
        : bSC === 9 && bQC;
    if (bPFO) sbPF = true;
    else if (bPFc) sbPF = false;
    bPFc = sbPF && gt(c, c4) && lt(c1, c5);

    if (bPFc && trdS) {
      const stop = tso === 'Exhaustion' ? bCD : bSD;
      const risky = eq(stop, 0);
      const lTT = 'Long Trade Setup' + (risky ? ' - Risky' : '') + '\n Signal : Completed ' + tso + ' plus Bullish Price Flip\n'
        + ' Stop    : ' + tick(risky ? b.low : stop)
        + '\n Target : ' + tick(tso === 'Exhaustion' ? bCT : bSR);
      newLabel({
        time, price: b.low, text: 'L', color: String(color.new(LABEL_BLUE, 25)), style: 'label_up', textColor: WHITE,
        size: 'small', tooltip: lTT + '\n\nnot a finacial advice, subject to high risk',
      });
      alertCalls.push({
        time, freq: 'once_per_bar',
        message: tTxt + ' : ' + lTT + '\n Price    : ' + tick(c) + '\n\nnot a finacial advice, subject to high risk',
      });
      lTrd = true;
      sTrd = false;
    }
    if (war && lTrd && gt(b.open, c) && bSC === 2 && !sTrd) {
      newLabel({
        time, price: b.high, text: '⚠️', color: String(color.new(LABEL_BLUE, 100)), style: 'label_down', textColor: YELLOW,
        size: 'large', tooltip: 'Warning\nbearish price flip detected',
      });
      lTrd = false;
    }
    if (war && lTrd && gt(b.open, c) && (lt(c, bSD1) || lt(c, bCD1))) {
      newLabel({
        time, price: b.high, text: '⚠️', color: String(color.new(LABEL_BLUE, 100)), style: 'label_down', textColor: YELLOW,
        size: 'large', tooltip: 'Critical Warning\nstop/risk level breached',
      });
      lTrd = false;
    }

    // Alerts: f_xLX(_p, _l) = (_l > _p and _l < _p[1]) or (_l < _p and _l > _p[1]) with _p = close
    const xLX = (l: number) => (gt(l, c) && lt(l, c1)) || (lt(l, c) && gt(l, c1));
    const pTxt = tick(c);
    const call = (message: string) => alertCalls.push({ time, message, freq: 'once_per_bar' });
    if (xLX(bSR) && srL) call(tTxt + ' crossing resistance level detected, price ' + tick(bSR));
    // `a or b and c` is `a or (b and c)`, as in the original
    if (xLX(bSD) || (xLX(sSD) && rsB)) call(tTxt + ' crossing momentum risk level detected, price ' + tick(bSD));
    if (xLX(sSS) && srL) call(tTxt + ' crossing support level detected, price ' + tick(sSS));
    if (xLX(bCD) || (xLX(sCD) && rsE)) call(tTxt + ' crossing trend exhaustion risk level detected, price ' + tick(bCD));
    if (bSC === 9 && cmpltd) call(tTxt + ' bullish momentum phase completion detected, price ' + pTxt);
    if (sSC === 9 && cmpltd) call(tTxt + ' bearish momentum phase completion detected, price ' + pTxt);
    if (bCC === 13 && cmpltd) call(tTxt + ' bullish trend exhaustion phase completion detected, price ' + pTxt);
    if (sCC === 13 && cmpltd) call(tTxt + ' bearish trend exhaustion phase completion detected, price ' + pTxt);
    if (gt(bSR, 0) && eq(bSR1, 0)) call(tTxt + ' bearish momentum detected, price ' + pTxt);
    if (gt(sSS, 0) && eq(sSS1, 0)) call(tTxt + ' bullish momentum detected, price ' + pTxt);

    bSCPrev = bSC;
    sSCPrev = sSC;
    pbSPrev = pbS;
    psSPrev = psS;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5, plot6, plot7 },
    markers,
    labels,
    alertCalls,
  };
}

export const ReversalSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
