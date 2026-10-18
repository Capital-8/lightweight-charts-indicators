/**
 * Inversion Fair Value Gaps (IFVG) [LuxAlgo]
 *
 * A fair value gap: the low is above the high of two bars before (bullish) or the high is below the low of two bars
 * before (bearish), the close of the bar between them is beyond that level too, and the gap is wider than the
 * average true range of 200 bars times the multiplier (before 200 bars: the cumulative average of high - low, not
 * multiplied). A gap becomes an inversion when a candle body goes through it: the body bottom is below a bullish
 * gap, or the body top is above a bearish gap. From that bar the zone has the opposite direction. It ends when a body
 * goes through it again. While it lives, a signal is given when the close leaves the zone on its new side after
 * the close before (or the wick of the bar with "Wick") was inside it.
 *
 * Everything is drawn again on the last bar, for the last "Show Last" inversions of each side: a box over the gap
 * until the inversion bar, a box from there to the last bar, a box of 50 bars after the last bar, the dashed middle
 * line of the zone on both parts, and a triangle for each signal. At most 100 gaps and 100 inversions per side are
 * kept in memory; at most 500 boxes, lines and labels are kept.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Signal' on the bars with a signal of a bearish gap turned
 * bullish (an up triangle), 'Bearish Signal' on the bars with a signal of a bullish gap turned bearish.
 *
 * Reference: "Inversion Fair Value Gaps (IFVG) [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: ©LuxAlgo
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface InversionFairValueGapsInputs {
  /** Number of most recent inversions drawn per side */
  dispNum: number;
  /** Signals from the close before ("Close") or from the wick of the bar ("Wick") */
  signalPref: 'Close' | 'Wick';
  /** Smallest gap width, as a multiple of the average true range */
  atrMulti: number;
  green: string;
  red: string;
  gray: string;
}

export const defaultInputs: InversionFairValueGapsInputs = {
  dispNum: 5,
  signalPref: 'Close',
  atrMulti: 0.25,
  green: 'rgba(8, 153, 129, 0.2)',
  red: 'rgba(242, 54, 69, 0.2)',
  gray: '#787B86',
};

export const inputConfig: InputConfig[] = [
  { id: 'dispNum', type: 'int', title: 'Show Last', defval: 5, min: 1, max: 100 },
  { id: 'signalPref', type: 'string', title: 'Signal Preference', defval: 'Close', options: ['Close', 'Wick'] },
  { id: 'atrMulti', type: 'float', title: 'ATR Multiplier', defval: 0.25, min: 0, step: 0.25 },
  { id: 'green', type: 'color', title: 'Bull Color', defval: 'rgba(8, 153, 129, 0.2)', group: 'Colors' },
  { id: 'red', type: 'color', title: 'Bear Color', defval: 'rgba(242, 54, 69, 0.2)', group: 'Colors' },
  { id: 'gray', type: 'color', title: 'Midline Color', defval: '#787B86', group: 'Colors' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Inversion Fair Value Gaps (IFVG) [LuxAlgo]',
  shortTitle: 'LuxAlgo - Inversion Fair Value Gaps (IFVG)',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** How many gaps are kept in memory */
const BUFFER = 100;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

interface Signal {
  x: number;
  y: number;
  dir: number;
}
/** type fvg: left / right / xVal are bar times */
interface Fvg {
  left: number;
  top: number;
  right: number;
  bot: number;
  mid: number;
  dir: number;
  state: number;
  labs: Signal[];
  xVal: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<InversionFairValueGapsInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const wick = cfg.signalPref === 'Wick';
  const { green, red, gray } = cfg;
  const invis = String(color.rgb(0, 0, 0, 100));

  const atrArr = ta.atr(bars, 200).toArray();
  const cumArr = ta.cum(new Series(bars, (b) => b.high - b.low)).toArray();

  const bullFvg: Fvg[] = [];
  const bearFvg: Fvg[] = [];
  const bullInv: Fvg[] = [];
  const bearInv: Fvg[] = [];

  // Drawings of the last bar, in creation order: when a creation brings the count above max + 5, the oldest are
  // deleted until max remain
  const add = <T>(list: T[], o: T) => {
    list.push(o);
    if (list.length > MAX_OBJECTS + 5) list.splice(0, list.length - MAX_OBJECTS);
  };
  const boxes: BoxData[] = [];
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const interval = barInterval(bars);
  const bullFlags: boolean[] = [];
  const bearFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time;
    const cTop = Math.max(b.open, b.close);
    const cBot = Math.min(b.open, b.close);
    const close1 = i >= 1 ? bars[i - 1].close : NaN;
    const high2 = i >= 2 ? bars[i - 2].high : NaN;
    const low2 = i >= 2 ? bars[i - 2].low : NaN;

    // atr = nz(ta.atr(200) * atr_multi, ta.cum(high - low) / (bar_index + 1))
    const scaled = (atrArr[i] ?? NaN) * cfg.atrMulti;
    const atr = Number.isFinite(scaled) ? scaled : (cumArr[i] ?? NaN) / (i + 1);

    const fvgUp = gt(b.low, high2) && gt(close1, high2);
    const fvgDown = lt(b.high, low2) && lt(close1, low2);
    if (fvgUp && gt(Math.abs(b.low - high2), atr)) {
      bullFvg.push({
        left: bars[i - 1].time, top: b.low, right: time, bot: high2, mid: (b.low + high2) / 2, dir: 1, state: 0, labs: [], xVal: NaN,
      });
    }
    if (fvgDown && gt(Math.abs(low2 - b.high), atr)) {
      bearFvg.push({
        left: bars[i - 1].time, top: low2, right: time, bot: b.high, mid: (b.high + low2) / 2, dir: -1, state: 0, labs: [], xVal: NaN,
      });
    }

    // fvg_manage(): a gap that a candle body goes through becomes an inversion
    const fvgManage = (ary: Fvg[], inv: Fvg[]) => {
      if (ary.length >= BUFFER) ary.shift();
      for (let k = ary.length - 1; k >= 0; k--) {
        const value = ary[k];
        if (value.dir === 1 && lt(cBot, value.bot)) {
          value.xVal = time;
          inv.push(ary.splice(k, 1)[0]);
        }
        if (value.dir === -1 && gt(cTop, value.top)) {
          value.xVal = time;
          inv.push(ary.splice(k, 1)[0]);
        }
      }
    };
    fvgManage(bullFvg, bullInv);
    fvgManage(bearFvg, bearInv);

    // inv_manage(): the signals and the end of an inversion; returns `fire` (a signal on this bar)
    const invManage = (ary: Fvg[]): boolean => {
      let fire = false;
      if (ary.length >= BUFFER) ary.shift();
      const ref = (dirUp: boolean) => (wick ? (dirUp ? b.low : b.high) : close1);
      for (let k = ary.length - 1; k >= 0; k--) {
        const value = ary[k];
        const { top, bot, dir, state: st } = value;
        if (st === 0 && dir === 1) {
          value.state = 1;
          value.dir = -1;
        }
        if (dir === -1 && st === 0) {
          value.state = 1;
          value.dir = 1;
        }
        if (st >= 1) value.right = time;
        if (dir === -1 && st === 1 && lt(b.close, bot) && ge(ref(false), bot) && lt(ref(false), top)) {
          value.labs.push({ x: time, y: top, dir: -1 });
          fire = true;
        }
        if (dir === 1 && st === 1 && gt(b.close, top) && le(ref(true), top) && gt(ref(true), bot)) {
          value.labs.push({ x: time, y: bot, dir: 1 });
          fire = true;
        }
        if (st >= 1 && ((dir === -1 && gt(cTop, top)) || (dir === 1 && lt(cBot, bot)))) ary.splice(k, 1);
      }
      return fire;
    };
    // bear_signal = inv_manage(bull_inv_ary); bull_signal = inv_manage(bear_inv_ary)
    bearFlags.push(invManage(bullInv));
    bullFlags.push(invManage(bearInv));

    // send_it() on the last bar (the drawings of the bars before are deleted on every bar)
    if (i === last) {
      const sendIt = (ary: Fvg[]) => {
        const lastIndex = ary.length - 1;
        ary.forEach((value, index) => {
          if (index <= lastIndex - cfg.dispNum) return;
          const col = value.dir === -1 ? green : red;
          const oCol = value.dir === -1 ? red : green;
          const future = barTime(bars, i + 50, interval);
          add(boxes, { time1: value.left, price1: value.top, time2: value.xVal, price2: value.bot, bgColor: col, borderColor: invis });
          add(boxes, { time1: value.xVal, price1: value.top, time2: time, price2: value.bot, bgColor: oCol, borderColor: invis });
          add(lines, { time1: value.left, price1: value.mid, time2: time, price2: value.mid, color: gray, style: 'dashed' });
          add(boxes, { time1: time, price1: value.top, time2: future, price2: value.bot, bgColor: oCol, borderColor: invis });
          add(lines, { time1: time, price1: value.mid, time2: future, price2: value.mid, color: gray, style: 'dashed' });
          for (const s of value.labs) {
            // label_maker(): a switch without a matching case makes no label
            if (s.dir === 1) {
              add(labels, {
                time: s.x, price: s.y, text: '\n▲', style: 'text_outline', color: invis, textColor: String(color.new(green, 0)), size: 'small',
              });
            } else if (s.dir === -1) {
              add(labels, {
                time: s.x, price: s.y, text: '▼\n', style: 'text_outline', color: invis, textColor: String(color.new(red, 0)), size: 'small',
              });
            }
          }
        });
      };
      sendIt(bullInv);
      sendIt(bearInv);
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
    lines,
    labels,
    // alertcondition(bull_signal, "Bullish Signal"); alertcondition(bear_signal, "Bearish Signal")
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Signal', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Bearish Signal', message: 'Alert Fired!' },
];

export const InversionFairValueGaps = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
