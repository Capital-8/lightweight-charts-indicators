/**
 * Support Resistance with Breaks and Retests
 *
 * Support and resistance boxes from pivots, with labels on breakouts and retests.
 * - A new pivot low (lookback bars on each side) with another value than the previous one draws a support box from
 *   the pivot bar: bottom at the pivot low, top at the lower low of the two bars next to the pivot. A new pivot high
 *   draws a resistance box: top at the pivot high, bottom at the higher high of the two bars next to it. The current
 *   box of each side is extended 5 bars after every closed bar. When a box is replaced it ends on the bar of the new
 *   pivot; it is deleted when it was never broken.
 * - Breakout: the close (or the low / high with "Off: High & Low") crosses under the support bottom or over the
 *   resistance top: a "Break" label, once per box.
 * - Retest: more than "Bars Since Breakout" bars after the breakout, the price comes back into the box: a "Potential
 *   Retest" label. When, within "Retest Detection Limiter" bars, the close (or the high / low) is back on the far
 *   side of the extreme of that bar, the label becomes a "Retest" label; otherwise it is deleted.
 * At most 500 boxes and 500 labels are kept.
 *
 * Chart context (optional third argument): `chart.lastBarConfirmed`: when the last bar is still open, the boxes
 * are not extended on it and "Off: Candle Confirmation" gives no signal on it. Without it every bar is taken as
 * closed.
 *
 * Limit of the port: the 8 alert conditions and the alert() calls give no output.
 *
 * Reference: "Breaks and Retests [HG]" by HoanGhetti
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © HoanGhetti
 */

import {
  ta, color, Series, barInterval, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LabelStyle, PineSize } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface SupportResistanceWithBreaksAndRetestsInputs {
  /** Bars on each side of a pivot */
  lookback: number;
  /** Bars since the breakout before a retest can be detected */
  retSince: number;
  /** Bars during which a potential retest can be confirmed */
  retValid: number;
  /** Show the breakout labels */
  breakout: boolean;
  /** Detect and show the retests */
  retest: boolean;
  repType: 'On' | 'Off: Candle Confirmation' | 'Off: High & Low';
  outline: 'dotted' | 'dashed' | 'solid';
  extend: 'none' | 'right' | 'left' | 'both';
  labelType: 'Full' | 'Simple';
  labelSize: 'tiny' | 'small' | 'normal' | 'large' | 'huge';
  supportColor: string;
  resistanceColor: string;
  overrideTextColor: boolean;
  textColor: string;
}

export const defaultInputs: SupportResistanceWithBreaksAndRetestsInputs = {
  lookback: 20,
  retSince: 2,
  retValid: 2,
  breakout: true,
  retest: true,
  repType: 'On',
  outline: 'dotted',
  extend: 'none',
  labelType: 'Full',
  labelSize: 'small',
  supportColor: '#FF5252',
  resistanceColor: '#089981',
  overrideTextColor: false,
  textColor: '#FFFFFF',
};

const G_SR = 'Support and Resistance';
const G_C = 'Conditions';
const G_ST = 'Styling';
const T_R = 'Bar Confirmation: Generates alerts when candle closes. (1 Candle Later) \n\nHigh & Low: By default, the Break & Retest system uses the current close value to determine a condition, selecting High & Low will make the script utilize these two values instead of the close value. In return, the script won\'t repaint and will yield different results.';
const T_RV = 'Whenever a potential retest is detected, the indicator knows that a retest is about to happen. In that given situation, this input grants the ability to raise the limit on how many bars are allowed to be actively checked while a potential retest event is active.\n\nExample, if you see the potential retest label, how many bars do you want that potential retest label to be active for to eventually confirm a retest? This system was implemented to prevent retest alerts from going off 10+ bars later from the potential retest point leading to inaccurate results.';

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Lookback Range', defval: 20, min: 1, tooltip: 'How many bars for a pivot event to occur.', group: G_SR },
  { id: 'retSince', type: 'int', title: 'Bars Since Breakout', defval: 2, min: 1, tooltip: 'How many bars since breakout in order to detect a retest.', group: G_SR },
  { id: 'retValid', type: 'int', title: 'Retest Detection Limiter', defval: 2, min: 1, tooltip: T_RV, group: G_SR },
  { id: 'breakout', type: 'bool', title: 'Breakouts', defval: true, group: G_C },
  { id: 'retest', type: 'bool', title: 'Retests', defval: true, group: G_C },
  { id: 'repType', type: 'string', title: 'Repainting', defval: 'On', options: ['On', 'Off: Candle Confirmation', 'Off: High & Low'], tooltip: T_R, group: G_C },
  { id: 'outline', type: 'string', title: 'Outline', defval: 'dotted', options: ['dotted', 'dashed', 'solid'], group: G_ST },
  { id: 'extend', type: 'string', title: 'Extend', defval: 'none', options: ['none', 'right', 'left', 'both'], group: G_ST },
  { id: 'labelType', type: 'string', title: 'Label Type', defval: 'Full', options: ['Full', 'Simple'], group: G_ST },
  { id: 'labelSize', type: 'string', title: 'Label Size', defval: 'small', options: ['tiny', 'small', 'normal', 'large', 'huge'], group: G_ST },
  { id: 'supportColor', type: 'color', title: 'Support', defval: '#FF5252', inline: 'Color', group: G_ST },
  { id: 'resistanceColor', type: 'color', title: 'Resistance', defval: '#089981', inline: 'Color', group: G_ST },
  { id: 'overrideTextColor', type: 'bool', title: 'Override Text Color ', defval: false, inline: 'Override', group: G_ST },
  { id: 'textColor', type: 'color', title: '', defval: '#FFFFFF', inline: 'Override', group: G_ST },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Breaks and Retests [HG]',
  shortTitle: 'Breaks and Retests [HG]',
  overlay: true,
};

/** max_boxes_count / max_labels_count of the script */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);

/** Drawings as the script handles them: x is a bar index */
interface Bx { left: number; right: number; top: number; bottom: number; color: string; extend: 'none' | 'right' | 'left' | 'both'; deleted: boolean }
interface Lb { x: number; y: number; text: string; color: string; textColor: string; style: LabelStyle; deleted: boolean }

/**
 * Live objects in creation order. At most max objects are kept: a creation that brings the count above max + 5
 * deletes the oldest until max remain.
 */
class Live<T extends { deleted: boolean }> {
  items: T[] = [];
  add(o: T): T {
    this.items.push(o);
    if (this.items.length > MAX_OBJECTS + 5) {
      for (const old of this.items.splice(0, this.items.length - MAX_OBJECTS)) old.deleted = true;
    }
    return o;
  }
  delete(o: T | null): void {
    if (!o || o.deleted) return;
    o.deleted = true;
    this.items.splice(this.items.indexOf(o), 1);
  }
}

/** State of one retestEvent() call */
interface RetestState {
  /** var bool retOccurred: na (false here) or true */
  occurred: boolean;
  /** retActive[1] */
  prevActive: boolean;
  /** ta.valuewhen(retEvent, y2, 0) of the first retEvent value */
  eventY2: number;
  /** ta.valuewhen(retEvent, y1, 0) of the final retEvent value */
  retValue: number;
  /** ta.barssince(retEvent) */
  since: number;
  /** var retLabel */
  potential: Lb[];
}

const newRetest = (): RetestState => ({ occurred: false, prevActive: false, eventY2: NaN, retValue: NaN, since: NaN, potential: [] });

export function calculate(
  bars: Bar[],
  inputs: Partial<SupportResistanceWithBreaksAndRetestsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const bb = cfg.lookback;
  const lastConfirmed = lastBarConfirmedOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const rTon = cfg.repType === 'On';
  const rTcc = cfg.repType === 'Off: Candle Confirmation';
  const rThv = cfg.repType === 'Off: High & Low';
  const simple = cfg.labelType === 'Simple';
  const breakText = simple ? 'Br' : 'Break';

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  // Pivot instance: pl = fixnan(ta.pivotlow(low, bb, bb)), ph = fixnan(ta.pivothigh(high, bb, bb))
  const fixnan = (a: number[]) => {
    let lastValue = NaN;
    return a.map((v) => {
      if (!Number.isNaN(v)) lastValue = v;
      return lastValue;
    });
  };
  const pl = fixnan(A(ta.pivotlow(S(low), bb, bb)));
  const ph = fixnan(A(ta.pivothigh(S(high), bb, bb)));
  // ta.change(x) used as a condition: true when the change is neither na nor 0
  const changed = (a: number[], i: number) => {
    const d = a[i] - at(a, i - 1);
    return !Number.isNaN(d) && d !== 0;
  };

  // Box edges of each bar (box.get_top / box.get_bottom of the current box), for the crossings
  const sTopA: number[] = new Array(n).fill(NaN);
  const sBotA: number[] = new Array(n).fill(NaN);
  const rTopA: number[] = new Array(n).fill(NaN);
  const rBotA: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      sTopA[i] = sTopA[i - 1];
      sBotA[i] = sBotA[i - 1];
      rTopA[i] = rTopA[i - 1];
      rBotA[i] = rBotA[i - 1];
    }
    if (changed(pl, i)) {
      // s_yLoc = low[bb + 1] > low[bb - 1] ? low[bb - 1] : low[bb + 1]
      sTopA[i] = gt(at(low, i - bb - 1), at(low, i - bb + 1)) ? at(low, i - bb + 1) : at(low, i - bb - 1);
      sBotA[i] = pl[i];
    }
    if (changed(ph, i)) {
      // r_yLoc = high[bb + 1] > high[bb - 1] ? high[bb + 1] : high[bb - 1]
      rTopA[i] = ph[i];
      rBotA[i] = gt(at(high, i - bb - 1), at(high, i - bb + 1)) ? at(high, i - bb - 1) : at(high, i - bb + 1);
    }
  }
  const B = (s: Series) => s.toArray().map((v) => Boolean(v));
  const cuClose = B(ta.crossunder(S(close), S(sBotA)));
  const cuLow = B(ta.crossunder(S(low), S(sBotA)));
  const coClose = B(ta.crossover(S(close), S(rTopA)));
  const coHigh = B(ta.crossover(S(high), S(rTopA)));

  const boxes = new Live<Bx>();
  const labels = new Live<Lb>();
  const newLabel = (x: number, y: number, text: string, col: string, style: LabelStyle): Lb => labels.add({
    x, y, text, color: String(color.new(col, 50)), textColor: cfg.overrideTextColor ? cfg.textColor : col, style, deleted: false,
  });

  let sBox: Bx | null = null;
  let rBox: Bx | null = null;
  let sBreak = false; // var bool sBreak = na: na or true
  let rBreak = false;
  let sinceNaS = NaN; // ta.barssince(na(sBreak))
  let sinceNaR = NaN;
  const retestR = newRetest();
  const retestS = newRetest();

  for (let i = 0; i < n; i++) {
    const confirmed = i < n - 1 || lastConfirmed;
    const chPl = changed(pl, i);
    const chPh = changed(ph, i);
    const prevSBox: Bx | null = sBox; // sBox[1]
    const prevRBox: Bx | null = rBox;

    // drawBox(): the box that is replaced ends on the pivot bar
    const drawBox = (old: Bx | null, top: number, bottom: number, col: string): Bx => {
      if (old && !old.deleted) {
        old.right = i - bb;
        old.extend = 'none';
      }
      return boxes.add({ left: i - bb, top, right: i, bottom, color: col, extend: cfg.extend, deleted: false });
    };
    if (chPl) sBox = drawBox(sBox, sTopA[i], sBotA[i], cfg.supportColor);
    if (chPh) rBox = drawBox(rBox, rTopA[i], rBotA[i], cfg.resistanceColor);
    const sTop = sTopA[i];
    const sBot = sBotA[i];
    const rTop = rTopA[i];
    const rBot = rBotA[i];

    // updateBox()
    if (confirmed) {
      if (sBox && !sBox.deleted) sBox.right = i + 5;
      if (rBox && !rBox.deleted) rBox.right = i + 5;
    }

    // Breakout event: repaint(c1, c2, c3) => rTon ? c1 : rThv ? c2 : rTcc ? c3 : na
    const cu = rTon ? cuClose[i] : rThv ? cuLow[i] : rTcc ? cuClose[i] && confirmed : false;
    const co = rTon ? coClose[i] : rThv ? coHigh[i] : rTcc ? coClose[i] && confirmed : false;
    if (cu && !sBreak) {
      sBreak = true;
      if (cfg.breakout) newLabel(i, sBot, breakText, cfg.supportColor, 'label_upper_right');
    } else if (co && !rBreak) {
      rBreak = true;
      if (cfg.breakout) newLabel(i, rTop, breakText, cfg.resistanceColor, 'label_lower_right');
    }
    if (chPl) {
      if (!sBreak) boxes.delete(prevSBox);
      sBreak = false;
    }
    if (chPh) {
      if (!rBreak) boxes.delete(prevRBox);
      rBreak = false;
    }

    // Retest event: retestCondition(breakout, condition) => ta.barssince(na(breakout)) > input_retSince and condition
    sinceNaS = !sBreak ? 0 : sinceNaS + 1;
    sinceNaR = !rBreak ? 0 : sinceNaR + 1;
    const sOn = sinceNaS > cfg.retSince;
    const rOn = sinceNaR > cfg.retSince;
    const h = high[i];
    const l = low[i];
    const c = close[i];
    const s1 = sOn && ge(h, sTop) && le(c, sBot);
    const s2 = sOn && ge(h, sTop) && ge(c, sBot) && le(c, sTop);
    const s3 = sOn && ge(h, sBot) && le(h, sTop);
    const s4 = sOn && ge(h, sBot) && le(h, sTop) && lt(c, sBot);
    const r1 = rOn && le(l, rBot) && ge(c, rTop);
    const r2 = rOn && le(l, rBot) && le(c, rTop) && ge(c, rBot);
    const r3 = rOn && le(l, rTop) && ge(l, rBot);
    const r4 = rOn && le(l, rTop) && ge(l, rBot) && gt(c, rTop);

    const retestEvent = (
      st: RetestState, active: boolean, y1: number[], y2: number[], col: string, style: LabelStyle, isPh: boolean,
    ): void => {
      if (!cfg.retest) return;
      let retEvent = active && !st.prevActive;
      st.prevActive = active;
      if (retEvent) st.eventY2 = y2[i];
      // a new extreme while the retest is active moves the event to this bar
      if (isPh ? lt(y2[i], st.eventY2) : gt(y2[i], st.eventY2)) retEvent = active;
      if (retEvent) st.retValue = y1[i];
      st.since = retEvent ? 0 : st.since + 1;
      const retSince = st.since;

      if (retEvent) {
        st.occurred = false;
        st.potential.push(newLabel(i, y2[i], simple ? 'P. Re' : 'Potential Retest', col, style));
      }
      if (st.potential.length === 2) {
        labels.delete(st.potential[0]);
        st.potential.shift();
      }
      const price = isPh ? (rTon || rTcc ? c : h) : (rTon || rTcc ? c : l);
      const cond = isPh ? ge(price, st.retValue) : le(price, st.retValue);
      const retConditions = rTon ? cond : rThv ? cond : rTcc ? cond && confirmed : false;
      const retValid = retSince > 0 && retSince <= cfg.retValid && retConditions && !st.occurred;
      if (retValid) {
        newLabel(i - retSince, y2[i - retSince], simple ? 'Re' : 'Retest', col, style);
        st.occurred = true;
      }
      if (retValid || retSince > cfg.retValid) {
        // array.first() of an empty array is a runtime error
        if (st.potential.length === 0) throw new Error('Index 0 is out of bounds, array size is 0');
        labels.delete(st.potential[0]);
      }
      // the box that is replaced after a retest ends on the bar of the retest event
      if ((isPh ? chPh : chPl) && st.occurred) {
        const old = isPh ? prevRBox : prevSBox;
        if (old && !old.deleted) old.right = i - retSince;
        st.occurred = false;
      }
    };
    retestEvent(retestR, r1 || r2 || r3 || r4, high, low, cfg.resistanceColor, 'label_upper_left', true);
    retestEvent(retestS, s1 || s2 || s3 || s4, low, high, cfg.supportColor, 'label_lower_left', false);
  }

  const interval = barInterval(bars);
  const X = (index: number) => barTime(bars, index, interval);
  const size: PineSize = cfg.labelSize;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: boxes.items.map((b) => ({
      time1: X(b.left), price1: b.top, time2: X(b.right), price2: b.bottom,
      borderColor: b.color, bgColor: String(color.new(b.color, 90)), borderStyle: cfg.outline, extend: b.extend,
    })),
    labels: labels.items.map((lb) => ({
      time: X(lb.x), price: lb.y, text: lb.text, color: lb.color, textColor: lb.textColor, style: lb.style, size,
    })),
  };
}

export const SupportResistanceWithBreaksAndRetests = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
