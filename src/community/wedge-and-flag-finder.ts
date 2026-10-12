/**
 * Wedge and Flag Finder (Multi - zigzag)
 *
 * Looks for wedges and flags on four zigzags of different lengths. A zigzag pivot is a bar whose high (low) is the
 * highest (lowest) of the last "length" bars; pivots alternate and the last one moves while the price extends.
 * On each new pivot the last 5 (or 6) pivots are tested:
 * - two trend lines are drawn through pivots 1-3-5 and 2-4; the legs must alternately grow and shrink (a contracting
 *   or an expanding shape), every bar between the first and the last pivot must touch the area between the two lines,
 *   and the middle pivots must lie on their line;
 * - optional filters on the angle of the lines (angle from the average true range of the pattern bars);
 * - a pattern is skipped when it shares two pivots with one of the last 10 patterns, or (Suppress Overlap) when it
 *   starts inside one of them.
 * The pattern is a "Flag" when an earlier pivot of the trend before it makes a pole (the wedge retraces less than
 * 0.618 of the pole): a line is drawn from that pivot, else it is a "Wedge". Each pattern gets the next colour of
 * the theme list, its two trend lines, a label, and with "Draw Zigzag" the zigzag legs with the pivot numbers.
 * At most 500 lines and 500 labels are kept.
 *
 * The zigzag is the function `czigzag` of the library "zigzag" (version 14) by HeWhoMustNotBeNamed (Trendoscope);
 * `unshift` comes from the library "arrays" (version 1) and `get_trend_series` from "utils" (version 1) of the same
 * author. The functions used are written in this file.
 *
 * Reference: "Wedge and Flag Finder (Multi - zigzag)" by Trendoscope
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Trendoscope Pty Ltd
 */

import { ta, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface WedgeAndFlagFinderInputs {
  /** Pivots of a wedge: 5 or 6 */
  wedgeSize: number;
  theme: 'Light' | 'Dark';
  avoidOverlap: boolean;
  drawZigzag: boolean;
  showZigZag1: boolean;
  zigzag1Length: number;
  showZigZag2: boolean;
  zigzag2Length: number;
  showZigZag3: boolean;
  zigzag3Length: number;
  showZigZag4: boolean;
  zigzag4Length: number;
  allowFlag: boolean;
  allowWedge: boolean;
  applyAngleDiff: boolean;
  minAngleDiff: number;
  maxAngleDiff: number;
  applyAngleLimit: boolean;
  minAngleRange: number;
  maxAngleRange: number;
  alertOnBarCompletion: boolean;
}

export const defaultInputs: WedgeAndFlagFinderInputs = {
  wedgeSize: 5,
  theme: 'Dark',
  avoidOverlap: true,
  drawZigzag: true,
  showZigZag1: true,
  zigzag1Length: 5,
  showZigZag2: true,
  zigzag2Length: 8,
  showZigZag3: true,
  zigzag3Length: 13,
  showZigZag4: true,
  zigzag4Length: 21,
  allowFlag: true,
  allowWedge: true,
  applyAngleDiff: false,
  minAngleDiff: 5,
  maxAngleDiff: 20,
  applyAngleLimit: false,
  minAngleRange: 10,
  maxAngleRange: 60,
  alertOnBarCompletion: true,
};

export const inputConfig: InputConfig[] = [
  // Pine options = [5, 6]
  { id: 'wedgeSize', type: 'int', title: 'Wedge Length', defval: 5, min: 5, max: 6, group: 'Generic', tooltip: 'Defines how many pivots a wedge should comply. Options are 5 and 6 with 5 being default' },
  {
    id: 'theme', type: 'string', title: 'Theme', defval: 'Dark', options: ['Light', 'Dark'], group: 'Generic',
    tooltip: 'Chart theme settings. Line and label colors are generted based on the theme settings. If dark theme is selected, lighter colors are used and if light theme is selected, darker colors are used.',
  },
  {
    id: 'avoidOverlap', type: 'bool', title: 'Suppress Overlap', defval: true, group: 'Generic',
    tooltip: 'Avoids plotting wedge if there is an existing wedge at starting point. This does not avoid nesting wedges (Wedge within wedge)',
  },
  { id: 'drawZigzag', type: 'bool', title: 'Draw Zigzag', defval: true, group: 'Generic', tooltip: 'Draw zigzag lines and mark pivots within wedge' },
  { id: 'showZigZag1', type: 'bool', title: 'L1', defval: true, group: 'Zigzag', inline: 'z1' },
  { id: 'zigzag1Length', type: 'int', title: '', defval: 5, min: 3, step: 5, group: 'Zigzag', inline: 'z1' },
  { id: 'showZigZag2', type: 'bool', title: 'L2', defval: true, group: 'Zigzag', inline: 'z1' },
  { id: 'zigzag2Length', type: 'int', title: '', defval: 8, min: 3, step: 5, group: 'Zigzag', inline: 'z1' },
  { id: 'showZigZag3', type: 'bool', title: 'L3', defval: true, group: 'Zigzag', inline: 'z2' },
  { id: 'zigzag3Length', type: 'int', title: '', defval: 13, min: 3, step: 5, group: 'Zigzag', inline: 'z2' },
  { id: 'showZigZag4', type: 'bool', title: 'L4', defval: true, group: 'Zigzag', inline: 'z2' },
  { id: 'zigzag4Length', type: 'int', title: '', defval: 21, min: 3, step: 5, group: 'Zigzag', inline: 'z2' },
  { id: 'allowFlag', type: 'bool', title: 'Flag', defval: true, group: 'Patterns', inline: 'p' },
  { id: 'allowWedge', type: 'bool', title: 'Wedge', defval: true, group: 'Patterns', inline: 'p' },
  { id: 'applyAngleDiff', type: 'bool', title: 'Angle Difference', defval: false, inline: 'ad', group: 'Angles' },
  { id: 'minAngleDiff', type: 'int', title: '', defval: 5, min: 0, max: 10, step: 5, inline: 'ad', group: 'Angles' },
  { id: 'maxAngleDiff', type: 'int', title: '', defval: 20, min: 10, max: 90, step: 5, inline: 'ad', group: 'Angles', tooltip: 'Show patterns where angle between trend lines falls under the selected range' },
  { id: 'applyAngleLimit', type: 'bool', title: 'Angle Range    ', defval: false, inline: 'ar', group: 'Angles' },
  { id: 'minAngleRange', type: 'int', title: '', defval: 10, min: 0, max: 20, step: 5, inline: 'ar', group: 'Angles' },
  { id: 'maxAngleRange', type: 'int', title: '', defval: 60, min: 20, max: 90, step: 5, inline: 'ar', group: 'Angles', tooltip: 'Show patterns where at least one of the trend line is within the given angle range' },
  { id: 'alertOnBarCompletion', type: 'bool', title: 'Alert only after the confirmation of the bar', defval: true, group: 'Alert', tooltip: 'Avoids repainting due to real time bar updates' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Wedge and Flag Finder (Multi - zigzag)',
  shortTitle: 'Wedge and Flag Finder (Multi - zigzag)',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** czigzag(numberOfPivots = 20) */
const NUMBER_OF_PIVOTS = 20;
const MAX_PATTERNS_REFERENCE = 10;
/** Default colour of a line and of a label */
const BLUE = '#2962FF';
/** color.black of Pine v5 */
const BLACK = '#363A45';

const rgb = (r: number, g: number, b: number) => `rgb(${r}, ${g}, ${b})`;
const DARK_THEME = [
  rgb(251, 244, 109), rgb(141, 186, 81), rgb(74, 159, 245), rgb(255, 153, 140), rgb(255, 149, 0), rgb(0, 234, 211),
  rgb(167, 153, 183), rgb(255, 210, 113), rgb(119, 217, 112), rgb(95, 129, 228), rgb(235, 146, 190), rgb(198, 139, 89),
  rgb(200, 149, 149), rgb(196, 182, 182), rgb(255, 190, 15), rgb(192, 226, 24), rgb(153, 140, 235), rgb(206, 31, 107),
  rgb(251, 54, 64), rgb(194, 255, 217), rgb(255, 219, 197), rgb(121, 180, 183),
];
const LIGHT_THEME = [
  rgb(61, 86, 178), rgb(57, 163, 136), rgb(250, 30, 14), rgb(169, 51, 58), rgb(225, 87, 138), rgb(62, 124, 23),
  rgb(244, 164, 66), rgb(134, 72, 121), rgb(113, 159, 176), rgb(170, 46, 230), rgb(161, 37, 104), rgb(189, 32, 0),
  rgb(16, 86, 82), rgb(200, 92, 92), rgb(63, 51, 81), rgb(114, 106, 149), rgb(171, 109, 35), rgb(247, 136, 18),
  rgb(51, 71, 86), rgb(12, 123, 147), rgb(195, 43, 173),
];

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** A float used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  style: 'none' | 'label_down' | 'label_up';
  yloc: 'price' | 'abovebar' | 'belowbar';
  color: string;
  textColor: string;
}
/** State of one zigzag (newest pivot first) */
interface Zigzag {
  pivots: number[];
  bars: number[];
  dirs: number[];
}

/** line.get_price(): the price of the (endless) line at bar x */
const priceAt = (l: Ln, x: number) => l.y1 + ((l.y2 - l.y1) * (x - l.x1)) / (l.x2 - l.x1);

/** Library "utils": get_trend_series(pivots, firstIndex, lastIndex) */
function trendSeries(pivots: number[], firstIndex: number, lastIndex: number): number[] {
  const startIndex = firstIndex;
  const endIndex = Math.min(pivots.length, lastIndex);
  const trendIndexes: number[] = [];
  if (startIndex + 1 < endIndex) {
    const first = pivots[startIndex];
    const dir = gt(first, pivots[startIndex + 1]) ? 1 : -1;
    let min = pivots.slice(startIndex, endIndex);
    while (min.length > 1) {
      const peak = dir === 1 ? Math.min(...min) : Math.max(...min);
      let peakIndex = -1;
      for (let k = min.length - 1; k >= 0; k--) {
        if (eq(min[k], peak)) {
          peakIndex = k;
          break;
        }
      }
      min = pivots.slice(startIndex, startIndex + peakIndex);
      const reversePeak = min.length === 0 ? NaN : dir === 1 ? Math.max(...min) : Math.min(...min);
      if (eq(reversePeak, first)) trendIndexes.push(startIndex + peakIndex);
    }
  }
  return trendIndexes;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<WedgeAndFlagFinderInputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines'> & { labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const wedgeSize = cfg.wedgeSize;
  const themeColors = cfg.theme === 'Dark' ? [...DARK_THEME] : [...LIGHT_THEME];

  // Drawings alive on the chart in creation order: when a creation brings the count above max + 5, the oldest are
  // deleted until max remain.
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const newLine = (x1: number, y1: number, x2: number, y2: number, color: string): Ln => {
    const l: Ln = { x1, y1, x2, y2, color, deleted: false };
    lines.push(l);
    if (lines.length > MAX_OBJECTS + 5) for (const old of lines.splice(0, lines.length - MAX_OBJECTS)) old.deleted = true;
    return l;
  };
  const deleteLine = (l: Ln) => {
    if (l.deleted) return;
    l.deleted = true;
    lines.splice(lines.indexOf(l), 1);
  };
  const newLabel = (l: Lb) => {
    labels.push(l);
    if (labels.length > MAX_OBJECTS + 5) labels.splice(0, labels.length - MAX_OBJECTS);
  };

  // pivot bars of the last patterns (newest first)
  const aBarArray: number[] = [];
  const bBarArray: number[] = [];
  const cBarArray: number[] = [];
  const dBarArray: number[] = [];
  const eBarArray: number[] = [];
  const fBarArray: number[] = [];
  /** Library "arrays": unshift(arr, val, maxItems) */
  const unshift = (arr: number[], val: number, maxItems: number) => {
    arr.unshift(val);
    while (arr.length > maxItems) arr.pop();
  };

  // ta.tr
  const tr = bars.map((b, i) => (i === 0 ? NaN : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  /** f_angle(a, b, loopback): `math.sum(ta.tr, loopback + 1)` keeps its own history at each place where it is called */
  const angle = (site: ReturnType<typeof callsite.sum>, i: number, a: number, b: number, loopback: number) =>
    (180 / Math.PI) * Math.atan((a - b) / ((2 * site(i, tr[i], loopback + 1)) / (loopback + 1)));

  interface Sites {
    l1: ReturnType<typeof callsite.sum>;
    l2: ReturnType<typeof callsite.sum>;
  }

  const addNewWedge = (
    a: number, b: number, c: number, d: number, e: number, f: number,
    aBar: number, bBar: number, cBar: number, dBar: number, eBar: number, fBar: number, zgColor: string,
  ) => {
    const dir = gt(a, b) ? 1 : -1;
    unshift(fBarArray, fBar, MAX_PATTERNS_REFERENCE);
    unshift(aBarArray, aBar, MAX_PATTERNS_REFERENCE);
    unshift(bBarArray, bBar, MAX_PATTERNS_REFERENCE);
    unshift(cBarArray, cBar, MAX_PATTERNS_REFERENCE);
    unshift(dBarArray, dBar, MAX_PATTERNS_REFERENCE);
    unshift(eBarArray, eBar, MAX_PATTERNS_REFERENCE);
    if (!cfg.drawZigzag) return;
    newLine(bBar, b, aBar, a, BLUE);
    newLine(cBar, c, bBar, b, BLUE);
    newLine(dBar, d, cBar, c, BLUE);
    newLine(eBar, e, dBar, d, BLUE);
    const mark = (x: number, y: number, text: string, above: boolean) =>
      newLabel({ x, y, text, style: 'none', yloc: above ? 'abovebar' : 'belowbar', color: BLUE, textColor: zgColor });
    mark(aBar, a, '5', dir > 0);
    mark(bBar, b, '4', dir < 0);
    mark(cBar, c, '3', dir > 0);
    mark(dBar, d, '2', dir < 0);
    mark(eBar, e, '1', dir > 0);
    if (wedgeSize === 6) {
      newLine(fBar, f, eBar, e, BLUE);
      mark(fBar, f, '0', dir < 0);
    }
  };

  const findWedge = (
    i: number, sites: Sites,
    a: number, b: number, c: number, d: number, e: number, f: number,
    aBar: number, bBar: number, cBar: number, dBar: number, eBar: number, fBar: number,
    zigzagpivots: number[], zigzagpivotbars: number[], fIndex: number,
  ) => {
    const six = wedgeSize === 6;
    const lastPivot = six ? f : e;
    const lastPivotBar = six ? fBar : eBar;
    const llastPivot = six ? e : d;
    for (let k = 0; k < aBarArray.length; k++) {
      const commonPivots = (aBarArray[k] === aBar ? 1 : 0) + (bBarArray[k] === bBar ? 1 : 0) + (cBarArray[k] === cBar ? 1 : 0)
        + (dBarArray[k] === dBar ? 1 : 0) + (eBarArray[k] === eBar ? 1 : 0) + (six && fBarArray[k] === fBar ? 1 : 0);
      if (commonPivots >= 2 || (cfg.avoidOverlap && lastPivotBar < aBarArray[k] && lastPivotBar > fBarArray[k])) return;
    }
    const aRatio = Math.abs(a - b) / Math.abs(b - c);
    const bRatio = Math.abs(b - c) / Math.abs(c - d);
    const cRatio = Math.abs(c - d) / Math.abs(d - e);
    const dRatio = Math.abs(d - e) / Math.abs(e - f);
    const zgColor = themeColors.pop()!;

    // wedgeLine(): the two trend lines, cut to the bars of the pattern
    const l1t = newLine(eBar, e, aBar, a, zgColor);
    const l2t = newLine(six ? fBar : dBar, six ? f : d, bBar, b, zgColor);
    const startBar = Math.min(l2t.x1, l1t.x1);
    const endBar = l1t.x2;
    const l1Start = priceAt(l1t, startBar);
    const l1End = priceAt(l1t, endBar);
    const l2Start = priceAt(l2t, startBar);
    const l2End = priceAt(l2t, endBar);
    Object.assign(l1t, { x1: startBar, y1: l1Start, x2: endBar, y2: l1End });
    Object.assign(l2t, { x1: startBar, y1: l2Start, x2: endBar, y2: l2End });
    const l1Angle = angle(sites.l1, i, l1End, l1Start, endBar - startBar);
    const l2Angle = angle(sites.l2, i, l2End, l2Start, endBar - startBar);
    const l1Diff = Math.abs(l1Start - l1End);
    const l2Diff = Math.abs(l2Start - l2End);

    const isType1Wedge = ge(aRatio, 1) && lt(bRatio, 1) && ge(cRatio, 1) && (lt(dRatio, 1) || wedgeSize === 5) && lt(l1Diff, l2Diff);
    const isType2Wedge = lt(aRatio, 1) && ge(bRatio, 1) && lt(cRatio, 1) && (ge(dRatio, 1) || wedgeSize === 5) && gt(l1Diff, l2Diff);
    const angleDiff = Math.abs(l1Angle - l2Angle);
    const angleDiffInRange = (ge(angleDiff, cfg.minAngleDiff) && le(angleDiff, cfg.maxAngleDiff)) || !cfg.applyAngleDiff;
    const angleInRange = (ge(Math.max(Math.abs(l1Angle), Math.abs(l2Angle)), cfg.minAngleRange)
      && le(Math.min(Math.abs(l1Angle), Math.abs(l2Angle)), cfg.maxAngleRange)) || !cfg.applyAngleLimit;
    let isWedge = (isType1Wedge || isType2Wedge) && angleDiffInRange && angleInRange;

    let deleteDrawing = true;
    if (isWedge) {
      for (let k = aBar; aBar <= lastPivotBar ? k <= lastPivotBar : k >= lastPivotBar; k += aBar <= lastPivotBar ? 1 : -1) {
        const l = bars[k].low;
        const h = bars[k].high;
        const l1Price = priceAt(l1t, k);
        const l2Price = priceAt(l2t, k);
        if (lt(h, Math.min(l1Price, l2Price)) || gt(l, Math.max(l1Price, l2Price))
          || (k === cBar && (gt(l1Price, h) || lt(l1Price, l)))
          || (k === dBar && (gt(l2Price, h) || lt(l2Price, l)))) {
          isWedge = false;
          break;
        }
      }
    }
    if (isWedge) {
      const xIndexes = trendSeries(zigzagpivots, fIndex, zigzagpivots.length);
      // `for i = array.size(xIndexes) - 1 to 0` on an empty array counts from -1 up to 0
      if (xIndexes.length === 0) throw new Error('Index -1 is out of bounds, array size is 0');
      let isFlag = false;
      for (let k = xIndexes.length - 1; k >= 0; k--) {
        const xIndex = xIndexes[k];
        const x = zigzagpivots[xIndex];
        const xBar = zigzagpivotbars[xIndex];
        const flagRatio = Math.abs(lastPivot - priceAt(six ? l1t : l2t, lastPivotBar)) / Math.abs(x - lastPivot);
        const other = six ? b : a;
        isFlag = lt(flagRatio, 0.618) && eq((lastPivot - x) / Math.abs(lastPivot - x), (lastPivot - other) / Math.abs(lastPivot - other));
        if (isFlag && cfg.allowFlag) {
          newLine(xBar, x, lastPivotBar, lastPivot, zgColor);
          newLabel({ x: xBar, y: x, text: 'Flag', style: gt(x, lastPivot) ? 'label_down' : 'label_up', yloc: 'price', color: zgColor, textColor: BLACK });
          break;
        }
      }
      if (!isFlag && cfg.allowWedge) {
        newLabel({ x: fBar, y: f, text: 'Wedge', style: gt(lastPivot, llastPivot) ? 'label_down' : 'label_up', yloc: 'price', color: zgColor, textColor: BLACK });
      }
      deleteDrawing = !((isFlag && cfg.allowFlag) || (!isFlag && cfg.allowWedge));
      if (!deleteDrawing) addNewWedge(a, b, c, d, e, f, aBar, bBar, cBar, dBar, eBar, fBar, zgColor);
      themeColors.unshift(zgColor);
    }
    if (deleteDrawing) {
      deleteLine(l1t);
      deleteLine(l2t);
      themeColors.push(zgColor);
    }
  };

  const scanPatterns = (i: number, sites: Sites, startIndex: number, newPivot: boolean, z: Zigzag, lastABar: number): number => {
    const length = z.pivots.length;
    if (!(length >= startIndex + 6 && newPivot)) return lastABar;
    const aBar = z.bars[startIndex];
    if (aBar === lastABar) return lastABar;
    const at = (k: number) => z.pivots[startIndex + k];
    const barAt = (k: number) => z.bars[startIndex + k];
    const six = wedgeSize === 6;
    findWedge(
      i, sites, at(0), at(1), at(2), at(3), at(4), six ? at(5) : at(4),
      aBar, barAt(1), barAt(2), barAt(3), barAt(4), six ? barAt(5) : barAt(4),
      z.pivots, z.bars, startIndex + wedgeSize - 1,
    );
    return aBar;
  };

  /** Library "zigzag": add_to_array() of addnewpivot() */
  const addNewPivot = (z: Zigzag, value: number, bar: number, dir: number) => {
    let newDir = dir;
    if (z.pivots.length >= 2) newDir = gt(dir * value, dir * z.pivots[1]) ? dir * 2 : dir;
    z.pivots.unshift(value);
    z.bars.unshift(bar);
    z.dirs.unshift(newDir);
    if (z.pivots.length > NUMBER_OF_PIVOTS) {
      z.pivots.pop();
      z.bars.pop();
      z.dirs.pop();
    }
  };
  /** Library "zigzag": zigzagcore(); returns [newPivot, doublePivot] */
  const zigzagCore = (z: Zigzag, phigh: number, plow: number, bar: number): [boolean, boolean] => {
    let pDir = 1;
    let newZG = false;
    const doubleZG = truthy(phigh) && truthy(plow);
    if (z.pivots.length >= 1) {
      pDir = z.dirs[0];
      pDir = pDir % 2 === 0 ? pDir / 2 : pDir;
    }
    if (((pDir === 1 && truthy(phigh)) || (pDir === -1 && truthy(plow))) && z.pivots.length >= 1) {
      const pivot = z.pivots.shift()!;
      const pivotbar = z.bars.shift()!;
      const pivotdir = z.dirs.shift()!;
      const value = pDir === 1 ? phigh : plow;
      const useNewValues = gt(value * pivotdir, pivot * pivotdir);
      newZG = newZG || useNewValues;
      addNewPivot(z, useNewValues ? value : pivot, useNewValues ? bar : pivotbar, pDir);
    }
    if ((pDir === 1 && truthy(plow)) || (pDir === -1 && truthy(phigh))) {
      newZG = true;
      addNewPivot(z, pDir === 1 ? plow : phigh, bar, pDir === 1 ? -1 : 1);
    }
    return [newZG, doubleZG];
  };

  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const levels = [
    { show: cfg.showZigZag1, length: cfg.zigzag1Length },
    { show: cfg.showZigZag2, length: cfg.zigzag2Length },
    { show: cfg.showZigZag3, length: cfg.zigzag3Length },
    { show: cfg.showZigZag4, length: cfg.zigzag4Length },
  ].filter((l) => l.show).map((l) => ({
    // pivots(): the bar is the highest / lowest of the last `length` bars
    hb: ta.highestbars(highS, l.length).toArray(),
    lb: ta.lowestbars(lowS, l.length).toArray(),
    z: { pivots: [], bars: [], dirs: [] } as Zigzag,
    lastABar: 0,
    double: { l1: callsite.sum(), l2: callsite.sum() } as Sites,
    single: { l1: callsite.sum(), l2: callsite.sum() } as Sites,
  }));

  for (let i = 0; i < n; i++) {
    for (const lv of levels) {
      const phigh = lv.hb[i] === 0 ? bars[i].high : NaN;
      const plow = lv.lb[i] === 0 ? bars[i].low : NaN;
      const [newPivot, doublePivot] = zigzagCore(lv.z, phigh, plow, i);
      lv.lastABar = scanPatterns(i, lv.double, 1, doublePivot, lv.z, lv.lastABar);
      lv.lastABar = scanPatterns(i, lv.single, 0, newPivot, lv.z, lv.lastABar);
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: lines.map((l) => ({ time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color })),
    labels: labels.map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style,
      ...(l.yloc !== 'price' ? { yloc: l.yloc } : {}),
    })),
  };
}

export const WedgeAndFlagFinder = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
