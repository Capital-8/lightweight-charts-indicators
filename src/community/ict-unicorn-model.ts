/**
 * ICT Unicorn Model [LuxAlgo]
 *
 * Finds the "unicorn" pattern: a breaker block that overlaps a fair value gap. Swings are pivots with "Swings" bars
 * on the left and one bar on the right, joined in a zigzag (points A, B, C, D from old to new). A bearish pattern
 * needs a new swing low D whose bar closes below the low B after a higher high C; the breaker block is the last
 * falling candle at B (up to 4 bars before it). The bars from D back to C are searched for a fair value gap that
 * overlaps the block and is wider than 5 % of the average true range. The bullish pattern is the mirrored case.
 *
 * Drawings per pattern: the block box, the gap box, two dashed lines along the block and a dotted mark at the swing
 * C (the stop level). A dot marks the entry bar: a candle that opens inside the block and closes beyond it, after a
 * candle that touched the block. From there a risk box and a reward box follow the price until the stop or the
 * target is reached, which draws a line at that level. A pattern that is not triggered is removed when the close
 * goes through its gap or when a new pattern replaces it. With "Trailing Stop" two plots show a stop that follows
 * the pivots of the trailing length. At most 500 boxes, lines and labels are kept.
 *
 * The original draws the block and the lines with the foreground colour of the chart; the port has no chart theme
 * and uses #DBDBDB (a dark chart).
 *
 * Reference: "ICT Unicorn Model [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface IctUnicornModelInputs {
  /** Bars on the left of a swing */
  len: number;
  iBull: boolean;
  colBl: string;
  iBear: boolean;
  colBr: string;
  /** A bullish and a bearish pattern can be present at the same time */
  combine: boolean;
  risk: number;
  reward: number;
  trail: boolean;
  /** Bars on each side of a trailing-stop pivot */
  lenS: number;
  showTargets: boolean;
  colRisk: string;
  colReward: string;
}

export const defaultInputs: IctUnicornModelInputs = {
  len: 10,
  iBull: true,
  colBl: '#089981',
  iBear: true,
  colBr: '#F23645',
  combine: false,
  risk: 1,
  reward: 1,
  trail: false,
  lenS: 5,
  showTargets: true,
  colRisk: 'rgba(120, 123, 134, 0.2)',
  colReward: 'rgba(91, 156, 246, 0.2)',
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Swings', defval: 10, group: 'Unicorn' },
  { id: 'iBull', type: 'bool', title: 'Bull', defval: true, inline: 'bl', group: 'Unicorn' },
  { id: 'colBl', type: 'color', title: '', defval: '#089981', inline: 'bl', group: 'Unicorn' },
  { id: 'iBear', type: 'bool', title: 'Bear', defval: true, inline: 'br', group: 'Unicorn' },
  { id: 'colBr', type: 'color', title: '', defval: '#F23645', inline: 'br', group: 'Unicorn' },
  { id: 'combine', type: 'bool', title: 'Combine', defval: false, group: 'Unicorn' },
  { id: 'risk', type: 'float', title: 'Risk/Reward', defval: 1, step: 0.1, inline: 'r', group: 'Targets' },
  { id: 'reward', type: 'float', title: ':', defval: 1, step: 0.1, inline: 'r', group: 'Targets' },
  { id: 'trail', type: 'bool', title: 'Trailing Stop', defval: false, inline: 'ts', group: 'Targets' },
  { id: 'lenS', type: 'int', title: '', defval: 5, min: 3, max: 10, inline: 'ts', group: 'Targets' },
  { id: 'showTargets', type: 'bool', title: 'Target Areas', defval: true, inline: 'target_css', group: 'Targets' },
  { id: 'colRisk', type: 'color', title: '', defval: 'rgba(120, 123, 134, 0.2)', inline: 'target_css', group: 'Targets' },
  { id: 'colReward', type: 'color', title: '', defval: 'rgba(91, 156, 246, 0.2)', inline: 'target_css', group: 'Targets' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: '#089981', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Plot', color: '#F23645', lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'ICT Unicorn Model [LuxAlgo]',
  shortTitle: 'LuxAlgo - ICT Unicorn Model',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** chart.fg_color of the reference chart */
const CHART_FG = '#DBDBDB';
/** Size of the zigzag arrays */
const ZZ_SIZE = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  border: string;
  bg: string;
  deleted: boolean;
}
interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
  color: string;
  deleted: boolean;
}
/** type unicorn */
interface Unicorn {
  box: Bx | null;
  fvg: Bx | null;
  risk: Bx | null;
  reward: Bx | null;
  lT: Ln | null;
  lB: Ln | null;
  sl: Ln | null;
  linSL: Ln | null;
  labC: Lb | null;
  active: boolean;
  isTaR: boolean;
  trig: boolean;
  swing: number;
  taR: number;
  tsL: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<IctUnicornModelInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.len);
  const lenS = Math.trunc(cfg.lenS);
  const lenL = 1;
  const { combine, trail, showTargets, colBl, colBr } = cfg;
  const rr = cfg.reward / cfg.risk;
  const minGap = len > 1 ? 1 : 0;

  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const atrArr = ta.atr(bars, 14).toArray();
  const phArr = ta.pivothigh(highS, len, lenL).toArray();
  const plArr = ta.pivotlow(lowS, len, lenL).toArray();
  const phTsLArr = ta.pivothigh(highS, lenS, lenS).toArray();
  const plTsLArr = ta.pivotlow(lowS, lenS, lenS).toArray();

  const fg50 = String(color.new(CHART_FG, 50));
  const fg65 = String(color.new(CHART_FG, 65));
  const fg97 = String(color.new(CHART_FG, 97));
  const fg100 = String(color.new(CHART_FG, 100));
  const DEFAULT_BLUE = '#2962FF';

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. A deleted object ignores later changes and its coordinates read na.
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length > MAX_OBJECTS + 5) for (const old of list.splice(0, list.length - MAX_OBJECTS)) old.deleted = true;
  };
  const boxes: Bx[] = [];
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const newBox = (left: number, top: number, right: number, bottom: number, border: string, bg: string): Bx => {
    const o = { left, top, right, bottom, border, bg, deleted: false };
    boxes.push(o);
    limit(boxes);
    return o;
  };
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string, style: Ln['style']): Ln => {
    const o = { x1, y1, x2, y2, color: css, style, deleted: false };
    lines.push(o);
    limit(lines);
    return o;
  };
  const newLabel = (x: number, y: number, text: string, textColor: string, css: string): Lb => {
    const o = { x, y, text, textColor, color: css, deleted: false };
    labels.push(o);
    limit(labels);
    return o;
  };
  const remove = <T extends { deleted: boolean }>(list: T[], o: T | null) => {
    if (!o || o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };
  const live = <T extends { deleted: boolean }>(o: T | null): T | null => (o && !o.deleted ? o : null);

  /** The placeholder pattern of the first bar: drawings without a place */
  const placeholder = (): Unicorn => ({
    box: newBox(NaN, 0, 0, NaN, DEFAULT_BLUE, DEFAULT_BLUE),
    fvg: newBox(NaN, 0, 0, NaN, DEFAULT_BLUE, DEFAULT_BLUE),
    risk: newBox(NaN, 0, 0, NaN, DEFAULT_BLUE, DEFAULT_BLUE),
    reward: newBox(NaN, 0, 0, NaN, DEFAULT_BLUE, DEFAULT_BLUE),
    lT: newLine(NaN, 0, 0, NaN, DEFAULT_BLUE, 'solid'),
    lB: newLine(NaN, 0, 0, NaN, DEFAULT_BLUE, 'solid'),
    sl: newLine(NaN, 0, 0, NaN, DEFAULT_BLUE, 'solid'),
    linSL: newLine(NaN, 0, 0, NaN, DEFAULT_BLUE, 'solid'),
    labC: newLabel(NaN, NaN, '', '#FFFFFF', DEFAULT_BLUE),
    active: false,
    isTaR: false,
    trig: false,
    swing: NaN,
    taR: NaN,
    tsL: NaN,
  });
  /** method remove(unicorn) */
  const removeUnicorn = (u: Unicorn) => {
    u.active = false;
    u.swing = NaN;
    u.taR = NaN;
    remove(boxes, u.fvg);
    remove(lines, u.linSL);
    remove(lines, u.lT);
    remove(lines, u.lB);
    remove(lines, u.sl);
    remove(labels, u.labC);
    const box = live(u.box);
    if (box) box.bg = 'transparent'; // color.new(na, na)
  };

  // var ZZ aZZ: direction, bar and price of the latest swings (newest first)
  const zzD: number[] = new Array(ZZ_SIZE).fill(0);
  const zzX: number[] = new Array(ZZ_SIZE).fill(0);
  const zzY: number[] = new Array(ZZ_SIZE).fill(NaN);
  const inOut = (d: number, x: number, y: number) => {
    zzD.unshift(d);
    zzX.unshift(x);
    zzY.unshift(y);
    zzD.pop();
    zzX.pop();
    zzY.pop();
  };

  let aUniBl: Unicorn[] = [];
  let aUniBr: Unicorn[] = [];
  // var x, y, z: bar, top and bottom of the latest breaker block
  let x = 0;
  let y = 0;
  let z = 0;

  // History of expressions (the value at that place of the script on the bar before; na when it did not run)
  let prevSwingBl = NaN;
  let prevSwingBr = NaN;
  let ranBl = -2; // last bar where `firstBl.active[1]` was evaluated
  let ranBr = -2;
  const tsLSwitch = { bl: { bar: -2, value: NaN }, br: { bar: -2, value: NaN } };
  let prevPlotBl = NaN;
  let prevPlotBr = NaN;

  const plot0: number[] = [];
  const plot1: number[] = [];

  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const O = (i: number) => (i >= 0 ? bars[i].open : NaN);
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i === 0) {
      // var patL = array.new<line>(3, line.new(na, na, na, na)): one line without a place
      newLine(NaN, NaN, NaN, NaN, DEFAULT_BLUE, 'solid');
      const bl = placeholder();
      aUniBl = [bl, bl];
      const br = placeholder();
      aUniBr = [br, br];
    }
    const atr = atrArr[i] ?? NaN;
    const ph = phArr[i] ?? NaN;
    const pl = plArr[i] ?? NaN;
    const phTsL = phTsLArr[i] ?? NaN;
    const plTsL = plTsLArr[i] ?? NaN;

    const firstBl = aUniBl[0];
    const firstBr = aUniBr[0];
    const secndBl = aUniBl[1];
    const secndBr = aUniBr[1];

    // ta.change(first.swing) != 0
    const chSBl = ne(firstBl.swing, prevSwingBl);
    const chSBr = ne(firstBr.swing, prevSwingBr);
    prevSwingBl = firstBl.swing;
    prevSwingBr = firstBr.swing;

    // Zigzag
    if (!isNaN(ph)) {
      const dr = zzD[0];
      const cy = zzY[0];
      const dx = i - lenL;
      const dy = H(i - lenL);
      if (dr < 1) inOut(1, dx, dy);
      else if (dr === 1 && gt(ph, cy)) {
        zzX[0] = dx;
        zzY[0] = dy;
      }
    }
    if (!isNaN(pl)) {
      const dr = zzD[0];
      const cy = zzY[0];
      const dx = i - lenL;
      const dy = L(i - lenL);
      if (dr > -1) inOut(-1, dx, dy);
      else if (dr === -1 && lt(pl, cy)) {
        zzX[0] = dx;
        zzY[0] = dy;
      }
    }
    const Ax = zzX[3];
    const Ay = zzY[3];
    const Bx = zzX[2];
    const By = zzY[2];
    const Cx = zzX[1];
    const Cy = zzY[1];
    const Dx = zzX[0];
    const dir = zzD[0];

    // A pattern that is not triggered is removed
    if (firstBl.active) {
      const activeBefore = ranBl === i - 1; // firstBl.active[1]: true when this place ran on the bar before, else na
      ranBl = i;
      if (combine || !activeBefore || chSBl) {
        if (!secndBl.trig) removeUnicorn(secndBl);
      }
      if (!firstBl.trig && lt(b.close, live(firstBl.fvg)?.bottom ?? NaN)) removeUnicorn(firstBl);
    }
    if (firstBr.active) {
      const activeBefore = ranBr === i - 1;
      ranBr = i;
      if (combine || !activeBefore || chSBr) {
        if (!secndBr.trig) removeUnicorn(secndBr);
      }
      if (!firstBr.trig && gt(b.close, live(firstBr.fvg)?.top ?? NaN)) removeUnicorn(firstBr);
    }

    if (i - lenL === Dx) {
      const spaced = Dx - Cx > minGap && Cx - Bx > minGap && Bx - Ax > minGap;
      const reset = (other: Unicorn) => {
        if (!other.trig) removeUnicorn(other);
        other.active = false;
        other.taR = NaN;
        other.tsL = NaN;
        other.swing = NaN;
      };
      const create = (list: Unicorn[], fvgBar: number, fvgTop: number, fvgBottom: number, css: string) => {
        list.unshift({
          box: newBox(x, y, fvgBar, z, fg100, fg97),
          fvg: newBox(fvgBar, fvgTop, i - 1, fvgBottom, 'transparent', String(color.new(css, 75))),
          risk: null,
          reward: null,
          lT: newLine(x, y, i - 1, y, fg50, 'dashed'),
          lB: newLine(x, z, i - 1, z, fg50, 'dashed'),
          sl: newLine(Cx, Cy, Cx, Cy, fg65, 'dotted'),
          linSL: null,
          labC: null,
          active: true,
          isTaR: false,
          trig: false,
          swing: Cy,
          taR: NaN,
          tsL: NaN,
        });
      };

      if (dir < 1 && cfg.iBear && lt(C(i - lenL), By) && gt(Cy, Ay) && spaced) {
        // Breaker block: the last falling candle at B
        for (let k = 0; k <= 4; k++) {
          if (lt(C(Bx - k), O(Bx - k))) {
            x = Bx - k;
            y = H(Bx - k);
            z = L(Bx - k);
            break;
          }
        }
        // Fair value gap
        for (let j = 0; j <= i - Cx; j++) {
          const fvgT = L(i - j - 2);
          const fvgB = H(i - j);
          if (lt(fvgB, fvgT) && ((lt(fvgT, y) && gt(fvgT, z)) || (lt(fvgB, y) && gt(fvgB, z))) && gt(fvgT - fvgB, atr * 0.05)) {
            if (ne(y, live(firstBr.box)?.top ?? NaN)) create(aUniBr, i - j - 2, fvgT, fvgB, colBr);
            if (!combine) reset(firstBl);
            break;
          }
        }
      }

      if (dir > -1 && cfg.iBull && gt(C(i - lenL), By) && lt(Cy, Ay) && spaced) {
        for (let k = 0; k <= 4; k++) {
          if (gt(C(Bx - k), O(Bx - k))) {
            x = Bx - k;
            y = H(Bx - k);
            z = L(Bx - k);
            break;
          }
        }
        for (let j = 0; j <= i - Cx; j++) {
          const fvgB = H(i - j - 2);
          const fvgT = L(i - j);
          if (lt(fvgB, fvgT) && ((lt(fvgT, y) && gt(fvgT, z)) || (lt(fvgB, y) && gt(fvgB, z))) && gt(fvgT - fvgB, atr * 0.05)) {
            if (ne(y, live(firstBl.box)?.top ?? NaN)) create(aUniBl, i - j - 2, fvgT, fvgB, colBl);
            if (!combine) reset(firstBr);
            break;
          }
        }
      }
    }

    // Entry, stop and target of the active pattern
    const manage = (first: Unicorn, bear: boolean) => {
      const risk = live(first.risk);
      if (risk) risk.right = i + 1;
      const reward = live(first.reward);
      if (reward) reward.right = i + 1;

      const fvg = live(first.fvg);
      const rgt = fvg ? fvg.right : NaN;
      const top = live(first.lT)?.y2 ?? NaN;
      const btm = live(first.lB)?.y2 ?? NaN;

      const isStop = bear ? gt(b.high, first.swing) : lt(b.low, first.swing);
      if (isStop) {
        if (showTargets) first.linSL = newLine(rgt, first.swing, i, first.swing, fg50, 'solid');
        first.active = false;
        first.taR = NaN;
        first.tsL = NaN;
        first.swing = NaN;
      }
      if (!first.trig && fvg) fvg.right = i - 1;

      if (first.isTaR) {
        if (bear ? lt(b.low, first.taR) : gt(b.high, first.taR)) {
          if (showTargets) newLine(rgt, first.taR, i, first.taR, fg50, 'solid');
          first.isTaR = false;
          first.active = false;
          first.taR = NaN;
          first.tsL = NaN;
        }
        if (trail) {
          // close[1] > first.TsL[1]: the stop value at this place on the bar before (na when it did not run)
          const hist = bear ? tsLSwitch.br : tsLSwitch.bl;
          const tsLBefore = hist.bar === i - 1 ? hist.value : NaN;
          hist.bar = i;
          hist.value = first.tsL;
          const close1 = C(i - 1);
          if (bear ? gt(close1, tsLBefore) : lt(close1, tsLBefore)) first.tsL = NaN;
          const pivot = bear ? phTsL : plTsL;
          if (!isNaN(pivot)) first.tsL = bear ? Math.min(first.tsL, pivot) : Math.max(first.tsL, pivot);
        }
      } else {
        const bodyTop = Math.max(C(i - 1), O(i - 1));
        const bodyBtm = Math.min(C(i - 1), O(i - 1));
        const trigger = bear
          ? lt(b.close, btm) && gt(b.open, btm) && lt(b.open, top) && gt(bodyTop, btm) && lt(bodyBtm, top)
          : gt(b.close, top) && lt(b.open, top) && gt(b.open, btm) && lt(bodyBtm, top) && gt(bodyTop, btm);
        if (trigger) {
          newLabel(i, bear ? b.high : b.low, '●', bear ? colBr : colBl, 'transparent');
          first.trig = true;
          first.isTaR = true;
          for (const l of [first.sl, first.lT, first.lB]) {
            const line = live(l);
            if (line) line.x2 = i;
          }
          if (fvg) fvg.right = i;

          const edge = bear ? btm : top;
          const diff = bear ? (first.swing - btm) * rr : (top - first.swing) * rr;
          first.taR = bear ? btm - diff : top + diff;
          first.tsL = first.swing;
          if (showTargets) {
            first.risk = newBox(i, first.swing, i + 1, edge, 'transparent', cfg.colRisk);
            first.reward = newBox(i, edge, i + 1, bear ? btm - diff : top + diff, 'transparent', cfg.colReward);
          }
        }
      }
    };
    if (firstBr.active) manage(firstBr, true);
    if (firstBl.active) manage(firstBl, false);

    // Trailing stop plots
    const tsLBl = firstBl.tsL;
    const tsLBr = firstBr.tsL;
    plot0.push(trail && (ge(tsLBl, prevPlotBl) || isNaN(prevPlotBl)) ? tsLBl : NaN);
    plot1.push(trail && (ge(prevPlotBr, tsLBr) || isNaN(prevPlotBr)) ? tsLBr : NaN);
    prevPlotBl = tsLBl;
    prevPlotBr = tsLBr;
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const P = (values: number[], css: string) => values.map((value, i) => ({ time: bars[i].time, value, color: css }));
  const drawn = (...v: number[]) => v.every((value) => !isNaN(value));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: P(plot0, colBl), plot1: P(plot1, colBr) },
    // an object with an na coordinate is not drawn
    boxes: boxes.filter((o) => drawn(o.left, o.top, o.right, o.bottom)).map((o) => ({
      time1: T(o.left), price1: o.top, time2: T(o.right), price2: o.bottom, bgColor: o.bg, borderColor: o.border,
    })),
    lines: lines.filter((o) => drawn(o.x1, o.y1, o.x2, o.y2)).map((o) => ({
      time1: T(o.x1), price1: o.y1, time2: T(o.x2), price2: o.y2, color: o.color,
      ...(o.style !== 'solid' ? { style: o.style } : {}),
    })),
    labels: labels.filter((o) => drawn(o.x, o.y)).map((o) => ({
      time: T(o.x), price: o.y, text: o.text, color: o.color, textColor: o.textColor, style: 'label_center' as const, size: 'tiny' as const,
    })),
  };
}

export const IctUnicornModel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
