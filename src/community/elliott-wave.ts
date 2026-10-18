/**
 * Elliott Wave [LuxAlgo]
 *
 * Three zig-zags (pivot lengths 4, 8 and 16 by default; a pivot needs 1 bar on its right) are searched for Elliott
 * wave patterns. On every new pivot the last 6 zig-zag points are tested:
 * - motive wave (1)-(5): wave 3 is not the shortest, and the points rise (bullish) or fall (bearish) in the usual
 *   order. It is drawn with 5 lines and 5 labels. When the pattern is no longer valid on a later pivot the lines
 *   become dotted and the labels are hidden.
 * - corrective wave (a)-(b)-(c) after a motive wave, while the retracement stays within "level 4" of the motive
 *   wave: 3 lines, 3 labels and a box from the (c) point. When it fails the lines become dashed.
 * - a circle marks a possible new start of a motive wave after a correction, and a cross marks a bar that breaks
 *   the box of the latest correction.
 * On the last bar, the Fibonacci levels of the latest valid motive wave are drawn 10 bars ahead (4 levels, a dashed
 * pole and a filled area between the levels 3 and 4: green when level 4 holds, red and dotted when it is broken).
 *
 * At most 500 lines, 500 labels and 50 boxes are kept, and 15 patterns per zig-zag.
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close), on the bar of the pivot: a new or
 * invalidated motive pattern ('New EW Motive Bullish Pattern found', 'Invalidated EW Motive Bearish Pattern', ...),
 * a new or invalidated corrective pattern (the original gives 'Invalidated EW Corrective Bullish Pattern' for both
 * directions) and a possible new start of a motive wave.
 *
 * Reference: "Elliott Wave [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, str, color, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BoxData, LabelData, LabelStyle, LineDrawingData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface ElliottWaveInputs {
  iHi: 'high' | 'close' | 'max open/close';
  iLo: 'low' | 'close' | 'min open/close';
  s1: boolean;
  len1: number;
  col1: string;
  s2: boolean;
  len2: number;
  col2: string;
  s3: boolean;
  len3: number;
  col3: string;
  i500: number;
  i618: number;
  i764: number;
  i854: number;
  shZZ: boolean;
}

export const defaultInputs: ElliottWaveInputs = {
  iHi: 'high',
  iLo: 'low',
  s1: true,
  len1: 4,
  col1: '#FF5252',
  s2: true,
  len2: 8,
  col2: '#2962FF',
  s3: true,
  len3: 16,
  col3: '#FFFFFF',
  i500: 0.5,
  i618: 0.618,
  i764: 0.764,
  i854: 0.854,
  shZZ: false,
};

const G_SRC = 'source [high - low]';
const G_ZZ = 'ZigZag';
const G_FIB = 'Fibonacci values';

export const inputConfig: InputConfig[] = [
  { id: 'iHi', type: 'string', title: '', defval: 'high', options: ['high', 'close', 'max open/close'], inline: 'hl', group: G_SRC },
  { id: 'iLo', type: 'string', title: '', defval: 'low', options: ['low', 'close', 'min open/close'], inline: 'hl', group: G_SRC },
  { id: 's1', type: 'bool', title: '', defval: true, inline: '1', group: G_ZZ },
  { id: 'len1', type: 'int', title: '  1 Length', defval: 4, min: 1, inline: '1', group: G_ZZ },
  { id: 'col1', type: 'color', title: '', defval: '#FF5252', inline: '1', group: G_ZZ },
  { id: 's2', type: 'bool', title: '', defval: true, inline: '2', group: G_ZZ },
  { id: 'len2', type: 'int', title: '  2 Length', defval: 8, min: 1, inline: '2', group: G_ZZ },
  { id: 'col2', type: 'color', title: '', defval: '#2962FF', inline: '2', group: G_ZZ },
  { id: 's3', type: 'bool', title: '', defval: true, inline: '3', group: G_ZZ },
  { id: 'len3', type: 'int', title: '  3 Length', defval: 16, min: 1, inline: '3', group: G_ZZ },
  { id: 'col3', type: 'color', title: '', defval: '#FFFFFF', inline: '3', group: G_ZZ },
  { id: 'i500', type: 'float', title: '           level 1', defval: 0.5, min: 0, max: 1, step: 0.01, group: G_FIB },
  { id: 'i618', type: 'float', title: '           level 2', defval: 0.618, min: 0, max: 1, step: 0.01, group: G_FIB },
  { id: 'i764', type: 'float', title: '           level 3', defval: 0.764, min: 0, max: 1, step: 0.01, group: G_FIB },
  { id: 'i854', type: 'float', title: '           level 4', defval: 0.854, min: 0, max: 1, step: 0.01, group: G_FIB },
  { id: 'shZZ', type: 'bool', title: '', defval: false, inline: 'zz', group: 'show ZZ' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Elliott Wave [LuxAlgo]',
  shortTitle: 'Elliott Wave [LuxAlgo]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500); the box limit is the default 50 */
const MAX_LINES = 500;
const MAX_LABELS = 500;
const MAX_BOXES = 50;
/** Patterns kept per zig-zag */
const MAX_WAVES = 15;

const RED = '#FF5252';
const LIME = '#00E676';
const BLUE = '#2962FF';
/** Text colour of a label made without `textcolor` (Pine v5 color.black) */
const LABEL_TEXT = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

type Style = 'solid' | 'dashed' | 'dotted';

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string | null;
  style: Style;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  color: string | null;
  textColor: string | null;
  style: LabelStyle;
  yloc: 'price' | 'abovebar' | 'belowbar';
  size: 'normal' | 'tiny';
  deleted: boolean;
}
interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string | null;
  border: string | null;
  deleted: boolean;
}
/** type Ewave (objects are na until set) */
interface Wave {
  l: Array<Ln | null>; // l1 .. l5
  b: Array<Lb | null>; // b1 .. b5
  on: boolean;
  dir: number;
  lA: Ln | null;
  lB: Ln | null;
  lC: Ln | null;
  bA: Lb | null;
  bB: Lb | null;
  bC: Lb | null;
  next: boolean;
  lb: Lb | null;
  bx: Bx | null;
}
/** type fibL */
interface FibLines {
  levels: Ln[]; // wave1_0_500, 618, 764, 854
  pole: Ln;
  fill1: Ln;
  fill2: Ln;
  fillColor: string | null;
  broken: boolean | null; // _break_ (na at the start)
}

// Getters of a line / label / box that is na or deleted give na
const lx1 = (l: Ln | null) => (l && !l.deleted ? l.x1 : NaN);
const ly1 = (l: Ln | null) => (l && !l.deleted ? l.y1 : NaN);
const lx2 = (l: Ln | null) => (l && !l.deleted ? l.x2 : NaN);
const ly2 = (l: Ln | null) => (l && !l.deleted ? l.y2 : NaN);
const bX = (l: Lb | null) => (l && !l.deleted ? l.x : NaN);
const bY = (l: Lb | null) => (l && !l.deleted ? l.y : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<ElliottWaveInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines' | 'linefills'> & {
  boxes: BoxData[];
  labels: LabelData[];
  lines: LineDrawingData[];
  linefills: LinefillData[];
  alertCalls: AlertCall[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;

  const hi = bars.map((b) => (cfg.iHi === 'high' ? b.high : cfg.iHi === 'close' ? b.close : Math.max(b.open, b.close)));
  // the original tests the high option here (`i_hi == 'close'`)
  const lo = bars.map((b) => (cfg.iLo === 'low' ? b.low : cfg.iHi === 'close' ? b.close : Math.min(b.open, b.close)));
  const hiS = Series.fromArray(bars, hi);
  const loS = Series.fromArray(bars, lo);

  // Drawings in creation order, shared by the three zig-zags: when a creation brings the count above max + 5, the
  // oldest are deleted until max remain. A deleted object ignores later changes and its getters give na.
  const limit = <T extends { deleted: boolean }>(list: T[], max: number) => {
    if (list.length > max + 5) for (const o of list.splice(0, list.length - max)) o.deleted = true;
  };
  const remove = <T extends { deleted: boolean }>(list: T[], o: T | null) => {
    if (!o || o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const boxes: Bx[] = [];
  const newLine = (x1: number, y1: number, x2: number, y2: number, lineColor: string | null, style: Style = 'solid'): Ln => {
    const o: Ln = { x1, y1, x2, y2, color: lineColor, style, deleted: false };
    lines.push(o);
    limit(lines, MAX_LINES);
    return o;
  };
  const newLabel = (l: Omit<Lb, 'deleted'>): Lb => {
    const o = { ...l, deleted: false };
    labels.push(o);
    limit(labels, MAX_LABELS);
    return o;
  };
  const setXY1 = (l: Ln | null, x: number, y: number) => {
    if (l && !l.deleted) {
      l.x1 = x;
      l.y1 = y;
    }
  };
  const setXY2 = (l: Ln | null, x: number, y: number) => {
    if (l && !l.deleted) {
      l.x2 = x;
      l.y2 = y;
    }
  };
  const setStyle = (l: Ln | null, style: Style) => {
    if (l && !l.deleted) l.style = style;
  };
  const hideText = (l: Lb | null) => {
    if (l && !l.deleted) l.textColor = null;
  };
  const setLabelXY = (l: Lb | null, x: number, y: number) => {
    if (l && !l.deleted) {
      l.x = x;
      l.y = y;
    }
  };

  const fibs: FibLines[] = [];
  const alertCalls: AlertCall[] = [];
  /** alert(message, alert.freq_once_per_bar_close) on bar i */
  const alertOn = (i: number, message: string) => {
    alertCalls.push({ time: bars[i].time as number, message, freq: 'once_per_bar_close' });
  };

  /** One `draw(enabled, left, col, n)` call of the script; returns the function to run on each bar */
  const draw = (enabled: boolean, leftInput: number, col: string, index: number) => {
    if (!enabled) return () => {};
    const left = Math.trunc(leftInput);
    const ph = ta.pivothigh(hiS, left, 1).toArray();
    const pl = ta.pivotlow(loS, left, 1).toArray();
    const t = index === 2 ? '\n\n' : index === 1 ? '\n' : '';
    const emptyWave = (): Wave => ({
      l: [null, null, null, null, null], b: [null, null, null, null, null], on: false, dir: NaN,
      lA: null, lB: null, lC: null, bA: null, bB: null, bC: null, next: false, lb: null, bx: null,
    });

    let nFibL!: FibLines;
    // type ZZ: direction, bar and price of the last 11 zig-zag points (newest first), and their lines
    const zzD: number[] = [];
    const zzX: number[] = [];
    const zzY: number[] = [];
    const zzL: Array<Ln | null> = [];
    const aEW: Wave[] = [];
    const crossUnder = callsite.crossunder();
    const crossOver = callsite.crossover();

    const waveLabel = (x: number, y: number, text: string, down: boolean): Lb =>
      newLabel({
        x, y, text: down ? text + t : t + text, color: null, textColor: col, style: down ? 'label_down' : 'label_up',
        yloc: 'price', size: 'normal',
      });

    /** A new pivot high (isHigh) or pivot low on bar i */
    const pivot = (i: number, isHigh: boolean, value: number) => {
      const s = isHigh ? 1 : -1;
      const side = isHigh ? 'Bullish' : 'Bearish';
      const gEW = aEW[0];
      const dir = zzD[0];
      const x1 = zzX[0];
      const y1 = zzY[0];
      const x2 = i - 1;
      const src = (isHigh ? hi : lo)[i - 1];
      const y2 = isNaN(src) ? 0 : src;

      if (isHigh ? dir < 1 : dir > -1) {
        // in_out(): the previous point was on the other side: add a point
        zzD.unshift(s);
        zzX.unshift(x2);
        zzY.unshift(y2);
        zzD.pop();
        zzX.pop();
        zzY.pop();
        if (cfg.shZZ) {
          zzL.unshift(newLine(x1, y1, x2, y2, col));
          remove(lines, zzL.pop() ?? null);
        }
      } else if (dir === s && (isHigh ? gt(value, y1) : lt(value, y1))) {
        zzX[0] = x2;
        zzY[0] = y2;
        if (cfg.shZZ) setXY2(zzL[0], x2, y2);
      }

      const x6 = x2;
      const y6 = y2;
      const [x5, x4, x3, x2_, x1_] = [zzX[1], zzX[2], zzX[3], zzX[4], zzX[5]];
      const [y5, y4, y3, y2_, y1_] = [zzY[1], zzY[2], zzY[3], zzY[4], zzY[5]];

      // 12345
      const w5 = s * (y6 - y5);
      const w3 = s * (y4 - y3);
      const w1 = s * (y2_ - y1_);
      const min = Math.min(w1, w3, w5);
      const isWave = ne(w3, min) && gt(s * y6, s * y4) && gt(s * y3, s * y1_) && gt(s * y5, s * y2_);
      const same = x1_ === lx1(gEW.l[0]) && x2_ === lx1(gEW.l[1]) && x3 === lx1(gEW.l[2]) && x4 === lx1(gEW.l[3]);
      if (isWave) {
        if (same) {
          setXY2(gEW.l[4], x6, y6);
          setLabelXY(gEW.b[4], x6, y6);
        } else {
          let tx = '(1)';
          const b5 = gEW.b[4];
          if (x2_ === bX(b5)) {
            tx = '(5) (1)';
            b5!.text = '';
          }
          const wave = emptyWave();
          wave.l = [
            newLine(x1_, y1_, x2_, y2_, col), newLine(x2_, y2_, x3, y3, col), newLine(x3, y3, x4, y4, col),
            newLine(x4, y4, x5, y5, col), newLine(x5, y5, x6, y6, col),
          ];
          wave.b = [
            waveLabel(x2_, y2_, tx, isHigh), waveLabel(x3, y3, '(2)', !isHigh), waveLabel(x4, y4, '(3)', isHigh),
            waveLabel(x5, y5, '(4)', !isHigh), waveLabel(x6, y6, '(5)', isHigh),
          ];
          wave.on = true;
          wave.dir = s;
          aEW.unshift(wave);
          nFibL.broken = false;
          alertOn(i, `New EW Motive ${side} Pattern found`);
        }
      } else if (same && gEW.on) {
        // dot(): the motive wave is no longer valid
        for (const l of gEW.l) setStyle(l, 'dotted');
        for (const b of gEW.b) hideText(b);
        gEW.on = false;
        alertOn(i, `Invalidated EW Motive ${side} Pattern`);
      }

      // ABC
      const getEW = aEW[0];
      const diff = Math.abs(ly2(getEW.l[4]) - ly1(getEW.l[0]));
      if (getEW.dir === -s) {
        const getX = lx2(getEW.l[4]);
        const getY = ly2(getEW.l[4]);
        const isSame2 = x1_ === lx2(getEW.l[2]) && x2_ === lx2(getEW.l[3]) && x3 === lx2(getEW.l[4]);
        const bound = s * getY + diff * cfg.i854;
        const isValid = x3 === getX && lt(s * y6, bound) && lt(s * y4, bound) && gt(s * y5, s * getY);
        const current = isSame2 && bX(getEW.bA) > x3;
        if (isValid) {
          const width = x6 - x2_;
          if (current) {
            setXY1(getEW.lC, x5, y5);
            setXY2(getEW.lC, x6, y6);
            setLabelXY(getEW.bC, x6, y6);
            if (getEW.bx && !getEW.bx.deleted) {
              getEW.bx.left = x6;
              getEW.bx.top = y6;
              getEW.bx.right = x6 + width;
            }
          } else {
            getEW.lA = newLine(x3, y3, x4, y4, col);
            getEW.bA = waveLabel(x4, y4, '(a)', isHigh);
            getEW.lB = newLine(x4, y4, x5, y5, col);
            getEW.bB = waveLabel(x5, y5, '(b)', !isHigh);
            getEW.lC = newLine(x5, y5, x6, y6, col);
            getEW.bC = waveLabel(x6, y6, '(c)', isHigh);
            getEW.bx = { left: x6, top: y6, right: x6 + width, bottom: y4, bg: String(color.new(col, 93)), border: String(color.new(col, 65)), deleted: false };
            boxes.push(getEW.bx);
            limit(boxes, MAX_BOXES);
            alertOn(i, `New EW Corrective ${side} Pattern found`);
          }
        } else if (current) {
          // dash(): the corrective wave is no longer valid
          setStyle(getEW.lA, 'dashed');
          setStyle(getEW.lB, 'dashed');
          setStyle(getEW.lC, 'dashed');
          hideText(getEW.bA);
          hideText(getEW.bB);
          hideText(getEW.bC);
          if (getEW.bx && !getEW.bx.deleted) {
            getEW.bx.bg = null;
            getEW.bx.border = null;
          }
          // the original gives the bullish message for both directions
          alertOn(i, 'Invalidated EW Corrective Bullish Pattern');
        }
      }

      // a possible new (1) after a motive and a corrective wave (once)
      if (getEW.dir === s && x5 === bX(getEW.bC) && gt(s * y6, s * bY(getEW.b[4])) && !getEW.next) {
        getEW.next = true;
        getEW.lb = newLabel({
          x: x6, y: y6, text: '', color: String(color.new(col, 65)), textColor: LABEL_TEXT, style: 'circle',
          yloc: isHigh ? 'abovebar' : 'belowbar', size: 'tiny',
        });
        alertOn(i, `Possible new start of EW Motive ${side} Wave`);
      }
    };

    return (i: number) => {
      const bar = bars[i];
      if (i === 0) {
        // var fibL nFibL = fibL.new(...)
        const fibLine = (transp: number, style: Style = 'solid') => newLine(NaN, NaN, NaN, NaN, String(color.new(col, transp)), style);
        nFibL = {
          levels: [fibLine(50), fibLine(38), fibLine(24), fibLine(15)],
          pole: fibLine(50, 'dashed'),
          fill1: newLine(NaN, NaN, NaN, NaN, null),
          fill2: newLine(NaN, NaN, NaN, NaN, null),
          fillColor: null,
          broken: null,
        };
        fibs.push(nFibL);
        // barstate.isfirst
        aEW.unshift(emptyWave());
        for (let k = 0; k <= 10; k++) {
          zzD.unshift(0);
          zzX.unshift(0);
          zzY.unshift(0);
          zzL.unshift(cfg.shZZ ? newLine(NaN, NaN, NaN, NaN, BLUE) : null);
        }
      }

      const p = ph[i] ?? NaN;
      if (!isNaN(p)) pivot(i, true, p);
      const q = pl[i] ?? NaN;
      if (!isNaN(q)) pivot(i, false, q);

      // a bar that breaks the box of the latest pattern
      const gEW = aEW[0];
      const bx = gEW.bx && !gEW.bx.deleted ? gEW.bx : null;
      const right = bx ? bx.right : NaN;
      if (gEW.dir === 1) {
        if (crossUnder(bar.low, bx ? bx.bottom : NaN) && i <= right) {
          newLabel({ x: i, y: bar.low, text: '', color: RED, textColor: LABEL_TEXT, style: 'xcross', yloc: 'belowbar', size: 'tiny' });
        }
      } else if (crossOver(bar.high, bx ? bx.top : NaN) && i <= right) {
        newLabel({ x: i, y: bar.high, text: '', color: RED, textColor: LABEL_TEXT, style: 'xcross', yloc: 'abovebar', size: 'tiny' });
      }

      // barstate.islast
      if (i === last) {
        const getEW = aEW[0];
        const setNa = () => {
          for (const l of [...nFibL.levels, nFibL.pole]) {
            setXY1(l, NaN, NaN);
            setXY2(l, NaN, NaN);
          }
          nFibL.fillColor = null;
        };
        if (aEW.length > 1) {
          const getEW1 = aEW[1];
          const last6x = lx2(getEW.l[4]);
          const last6y = ly2(getEW.l[4]);
          const diff = Math.abs(last6y - ly1(getEW.l[0]));
          const sign = getEW.dir === 1 ? -1 : 1;
          // an invalid wave, or an ABC after it: no Fibonacci lines
          if (!getEW.on || bX(getEW.bC) > bX(getEW.b[4])) {
            setNa();
          } else {
            const x2 = i + 10;
            const y = [cfg.i500, cfg.i618, cfg.i764, cfg.i854].map((k) => last6y + sign * (diff * k));
            nFibL.levels.forEach((l, k) => {
              setXY1(l, last6x, y[k]);
              setXY2(l, x2, y[k]);
            });
            setXY1(nFibL.pole, last6x, last6y);
            setXY2(nFibL.pole, last6x, y[3]);
            setXY1(nFibL.fill1, last6x, y[2]);
            setXY2(nFibL.fill1, x2, y[2]);
            setXY1(nFibL.fill2, last6x, y[3]);
            setXY2(nFibL.fill2, x2, y[3]);
          }
          // the (2) label is on the (c) label of the pattern before
          if (bX(getEW.b[1]) === bX(getEW1.bC)) {
            hideText(getEW.b[0]);
            hideText(getEW.b[1]);
            const bB = getEW1.bB;
            const bC = getEW1.bC;
            if (bB && !bB.deleted) bB.text = str.replace(bB.text, '(b)', '(b) (1)', 0);
            if (bC && !bC.deleted) bC.text = str.replace(bC.text, '(c)', '(c) (2)', 0);
          }
        }

        // is level 4 broken since the end of the wave?
        const level4 = nFibL.levels[3];
        const p854 = ly1(level4);
        const from = lx1(level4);
        if (!isNaN(from)) {
          for (let k = 0; k <= i - from; k++) {
            if (getEW.dir === -1 ? gt(bars[i - k].high, p854) : lt(bars[i - k].low, p854)) {
              nFibL.broken = true;
              break;
            }
          }
        }
        if (nFibL.broken === null) {
          setNa();
        } else {
          for (const l of nFibL.levels) setStyle(l, nFibL.broken ? 'dotted' : 'solid');
          nFibL.fillColor = String(color.new(nFibL.broken ? RED : LIME, 95));
        }
      }

      if (aEW.length > MAX_WAVES) {
        const pop = aEW.pop()!;
        for (const l of [...pop.l, pop.lA, pop.lB, pop.lC]) remove(lines, l);
        for (const b of [...pop.b, pop.bA, pop.bB, pop.bC, pop.lb]) remove(labels, b);
        remove(boxes, pop.bx);
      }
    };
  };

  const steps = [draw(cfg.s1, cfg.len1, cfg.col1, 0), draw(cfg.s2, cfg.len2, cfg.col2, 1), draw(cfg.s3, cfg.len3, cfg.col3, 2)];
  for (let i = 0; i < n; i++) for (const step of steps) step(i);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  // an object with an na coordinate is not drawn
  const drawn = (l: Ln) => !l.deleted && !isNaN(l.x1) && !isNaN(l.y1) && !isNaN(l.x2) && !isNaN(l.y2);
  const toLine = (l: Ln): LineDrawingData => ({
    time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color ?? 'transparent',
    ...(l.style !== 'solid' ? { style: l.style } : {}),
  });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: lines.filter(drawn).map(toLine),
    labels: labels.filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: l.color ?? 'transparent', textColor: l.textColor ?? 'transparent', style: l.style,
      ...(l.yloc !== 'price' ? { yloc: l.yloc } : {}),
      ...(l.size !== 'normal' ? { size: l.size } : {}),
    })),
    boxes: boxes.filter((b) => !isNaN(b.left) && !isNaN(b.top) && !isNaN(b.right) && !isNaN(b.bottom)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg ?? 'transparent', borderColor: b.border ?? 'transparent',
    })),
    // a fill between two lines that are not drawn is not drawn
    linefills: fibs.filter((f) => drawn(f.fill1) && drawn(f.fill2)).map((f) => ({
      line1: toLine(f.fill1), line2: toLine(f.fill2), color: f.fillColor ?? 'transparent',
    })),
    alertCalls,
  };
}

export const ElliottWave = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
