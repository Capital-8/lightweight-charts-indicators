/**
 * Market Structure with Inducements & Sweeps [LuxAlgo]
 *
 * Swings: a bar is a swing high when its high is above the highest high of the `len` bars after it (a swing low
 * when its low is below the lowest low), and highs and lows alternate. Two swing sets are used: a long one ("CHoCH
 * Detection Period") and a short one ("IDM Detection Period").
 * - CHoCH (change of character): a close above the latest long swing high turns the structure bullish, a close
 *   below the latest long swing low turns it bearish. A dashed line runs from the swing to the bar of the close.
 * - IDM (inducement): in a bullish structure, the first low below the latest short swing low (dotted line); the
 *   mirror in a bearish structure.
 * - BOS (break of structure): after an inducement, a close beyond the trailing maximum (bullish) or minimum
 *   (bearish) reached since the change of character (solid line).
 * - Sweep: a high above the trailing maximum with a close back below it (bullish structure), or the mirror: a dotted
 *   line with an "x".
 * On the last bar three more lines with their labels show the levels in progress: the level whose break would change
 * the character, the level of the next break of structure and the inducement level still open (15 bars to the right).
 * The long swings are drawn as circles on their bar. At most 500 lines and 500 labels are kept.
 *
 * Reference: "Market Structure with Inducements & Sweeps [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface MarketStructureWithInducementsSweepsInputs {
  /** Bars after a swing of the long set */
  len: number;
  /** Bars after a swing of the short set */
  shortLen: number;
  bullCss: string;
  bearCss: string;
  showChoch: boolean;
  showBos: boolean;
  showIdm: boolean;
  idmCss: string;
  showSweeps: boolean;
  sweepsCss: string;
  showCircles: boolean;
}

export const defaultInputs: MarketStructureWithInducementsSweepsInputs = {
  len: 50,
  shortLen: 3,
  bullCss: '#089981',
  bearCss: '#ff5252',
  showChoch: true,
  showBos: true,
  showIdm: true,
  idmCss: '#787B86',
  showSweeps: true,
  sweepsCss: '#787B86',
  showCircles: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'CHoCH Detection Period', defval: 50 },
  { id: 'shortLen', type: 'int', title: 'IDM Detection Period', defval: 3 },
  { id: 'bullCss', type: 'color', title: 'Bullish Elements', defval: '#089981', group: 'Style' },
  { id: 'bearCss', type: 'color', title: 'Bearish Elements', defval: '#ff5252', group: 'Style' },
  { id: 'showChoch', type: 'bool', title: 'Show CHoCH', defval: true, group: 'Style' },
  { id: 'showBos', type: 'bool', title: 'Show BOS', defval: true, group: 'Style' },
  { id: 'showIdm', type: 'bool', title: 'Show Inducements', defval: true, inline: 'idm', group: 'Style' },
  { id: 'idmCss', type: 'color', title: '', defval: '#787B86', inline: 'idm', group: 'Style' },
  { id: 'showSweeps', type: 'bool', title: 'Show Sweeps', defval: true, inline: 'sweeps', group: 'Style' },
  { id: 'sweepsCss', type: 'color', title: '', defval: '#787B86', inline: 'sweeps', group: 'Style' },
  { id: 'showCircles', type: 'bool', title: 'Show Swings', defval: true, group: 'Style' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Swing High', color: String(color.new('#ff5252', 50)), lineWidth: 5, style: 'circles' },
  { id: 'plot1', title: 'Swing Low', color: String(color.new('#089981', 50)), lineWidth: 5, style: 'circles' },
];

export const metadata = {
  title: 'Market Structure with Inducements & Sweeps [LuxAlgo]',
  shortTitle: 'LuxAlgo - Market Structure with Inducements & Sweeps',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** color.gray of Pine version 5 (the bearish inducement has this fixed colour) */
const GRAY = '#787B86';
/** Text colour of a label that was given none (Pine version 5) */
const DEFAULT_TEXT = '#363A45';
/** Colour of a line that was given none */
const DEFAULT_LINE = '#2962FF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string | null;
  style: 'solid' | 'dashed' | 'dotted';
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string | null;
  style: 'label_down' | 'label_up';
  size?: 'tiny';
}

/** swings(len): the swing high / low confirmed on each bar and the bar of the latest one */
function swings(bars: Bar[], len: number): { top: number[]; topx: number[]; btm: number[]; btmx: number[] } {
  const n = bars.length;
  const upper = ta.highest(new Series(bars, (b) => b.high), len).toArray();
  const lower = ta.lowest(new Series(bars, (b) => b.low), len).toArray();
  const top: number[] = [];
  const topx: number[] = [];
  const btm: number[] = [];
  const btmx: number[] = [];
  // var os = 0, then os := ... : os[1]: na from the first bar until the first swing
  let os = NaN;
  let tx = NaN;
  let bx = NaN;
  for (let i = 0; i < n; i++) {
    const before = os;
    const back = i >= len ? bars[i - len] : null;
    const h = back ? back.high : NaN;
    const l = back ? back.low : NaN;
    os = gt(h, upper[i] ?? NaN) ? 0 : lt(l, lower[i] ?? NaN) ? 1 : before;
    // os[1] != 0 is false while os[1] is na
    const isTop = os === 0 && !isNaN(before) && before !== 0;
    const isBtm = os === 1 && !isNaN(before) && before !== 1;
    if (isTop) tx = i - len;
    if (isBtm) bx = i - len;
    top.push(isTop ? h : NaN);
    topx.push(tx);
    btm.push(isBtm ? l : NaN);
    btmx.push(bx);
  }
  return { top, topx, btm, btmx };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketStructureWithInducementsSweepsInputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines'> & { labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.len);
  const shortLen = Math.trunc(cfg.shortLen);
  const { bullCss, bearCss, idmCss, sweepsCss } = cfg;

  const long = swings(bars, len);
  const short = swings(bars, shortLen);

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. The three lines and three labels of the last-bar levels are held by `var` variables: they are never
  // deleted by this limit, but they count.
  const held = new Set<object>();
  const limit = <T extends object>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (held.has(list[k])) k++;
      else list.splice(k, 1);
    }
  };
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const newLine = (l: Ln): Ln => {
    lines.push(l);
    limit(lines);
    return l;
  };
  const newLabel = (l: Lb): Lb => {
    labels.push(l);
    limit(labels);
    return l;
  };
  /** A level line from bar x to the current bar with its label in the middle */
  const level = (
    i: number, x: number, y: number, css: string, style: Ln['style'], text: string, labelStyle: Lb['style'], tiny = true,
  ) => {
    newLine({ x1: x, y1: y, x2: i, y2: y, color: css, style });
    // int(math.avg(n, x))
    newLabel({ x: Math.trunc((i + x) / 2), y, text, textColor: css, style: labelStyle, ...(tiny ? { size: 'tiny' as const } : {}) });
  };

  let os = 0;
  let topCrossed = false;
  let btmCrossed = false;
  let max = NaN;
  let min = NaN;
  let maxX1 = NaN;
  let minX1 = NaN;
  let topy = NaN;
  let btmy = NaN;
  let stopCrossed = false;
  let sbtmCrossed = false;
  let stopy = NaN; // fixnan(stop)
  let sbtmy = NaN; // fixnan(sbtm)

  let extChoch: Ln | null = null;
  let extBos: Ln | null = null;
  let extIdm: Ln | null = null;
  let extChochLbl: Lb | null = null;
  let extBosLbl: Lb | null = null;
  let extIdmLbl: Lb | null = null;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const osBefore = i > 0 ? os : NaN;
    const maxBefore = max;
    const minBefore = min;
    const topx = long.topx[i];
    const btmx = long.btmx[i];
    const stopx = short.topx[i];
    const sbtmx = short.btmx[i];

    // CHoCH detection
    if (truthy(long.top[i])) {
      topy = long.top[i];
      topCrossed = false;
    }
    if (truthy(long.btm[i])) {
      btmy = long.btm[i];
      btmCrossed = false;
    }
    if (gt(b.close, topy) && !topCrossed) {
      os = 1;
      topCrossed = true;
    }
    if (lt(b.close, btmy) && !btmCrossed) {
      os = 0;
      btmCrossed = true;
    }

    // os != os[1]
    if (!isNaN(osBefore) && os !== osBefore) {
      max = b.high;
      min = b.low;
      maxX1 = i;
      minX1 = i;
      stopCrossed = false;
      sbtmCrossed = false;
      if (os === 1 && cfg.showChoch) level(i, topx, topy, bullCss, 'dashed', 'CHoCH', 'label_down');
      else if (cfg.showChoch) level(i, btmx, btmy, bearCss, 'dashed', 'CHoCH', 'label_up');
    }

    if (!isNaN(short.top[i])) stopy = short.top[i];
    if (!isNaN(short.btm[i])) sbtmy = short.btm[i];

    // Bullish IDM and BOS
    if (lt(b.low, sbtmy) && !sbtmCrossed && os === 1 && ne(sbtmy, btmy)) {
      if (cfg.showIdm) level(i, sbtmx, sbtmy, idmCss, 'dotted', 'IDM', 'label_up');
      sbtmCrossed = true;
    }
    if (gt(b.close, max) && sbtmCrossed && os === 1) {
      if (cfg.showBos) level(i, maxX1, max, bullCss, 'solid', 'BOS', 'label_down');
      sbtmCrossed = false;
    }

    // Bearish IDM (always gray) and BOS
    if (gt(b.high, stopy) && !stopCrossed && os === 0 && ne(stopy, topy)) {
      if (cfg.showIdm) level(i, stopx, stopy, GRAY, 'dotted', 'IDM', 'label_down');
      stopCrossed = true;
    }
    if (lt(b.close, min) && stopCrossed && os === 0) {
      if (cfg.showBos) level(i, minX1, min, bearCss, 'solid', 'BOS', 'label_up');
      stopCrossed = false;
    }

    // Sweeps
    if (gt(b.high, max) && lt(b.close, max) && os === 1 && i - maxX1 > 1 && cfg.showSweeps) {
      level(i, maxX1, max, sweepsCss, 'dotted', 'x', 'label_down', false);
    }
    if (lt(b.low, min) && gt(b.close, min) && os === 0 && i - minX1 > 1 && cfg.showSweeps) {
      level(i, minX1, min, sweepsCss, 'dotted', 'x', 'label_up', false);
    }

    // Trailing max / min (math.max / math.min give na while max / min is na)
    max = isNaN(max) ? NaN : Math.max(b.high, max);
    min = isNaN(min) ? NaN : Math.min(b.low, min);
    if (gt(max, maxBefore)) maxX1 = i;
    if (lt(min, minBefore)) minX1 = i;

    // Extensions: created on the first bar without coordinates
    if (i === 0) {
      extChoch = newLine({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: DEFAULT_LINE, style: 'dashed' });
      extBos = newLine({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: DEFAULT_LINE, style: 'solid' });
      extIdm = newLine({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: idmCss, style: 'dotted' });
      extChochLbl = newLabel({ x: NaN, y: NaN, text: 'CHoCH', textColor: DEFAULT_TEXT, style: 'label_down', size: 'tiny' });
      extBosLbl = newLabel({ x: NaN, y: NaN, text: 'BOS', textColor: DEFAULT_TEXT, style: 'label_down', size: 'tiny' });
      extIdmLbl = newLabel({ x: NaN, y: NaN, text: 'IDM', textColor: idmCss, style: 'label_down', size: 'tiny' });
      for (const o of [extChoch, extBos, extIdm, extChochLbl, extBosLbl, extIdmLbl]) held.add(o);
    }

    // barstate.islast
    if (i === n - 1 && extChoch && extBos && extIdm && extChochLbl && extBosLbl && extIdmLbl) {
      const bull = os === 1;
      if (cfg.showChoch) {
        const [x, y, css] = bull ? [btmx, btmy, bearCss] : [topx, topy, bullCss];
        Object.assign(extChoch, { x1: x, y1: y, x2: i, y2: y, color: css });
        Object.assign(extChochLbl, { x: i, y, style: bull ? 'label_up' : 'label_down', textColor: css });
      }
      if (cfg.showBos) {
        const [x, y, css] = bull ? [maxX1, max, bullCss] : [minX1, min, bearCss];
        Object.assign(extBos, { x1: x, y1: y, x2: i, y2: y, color: css });
        Object.assign(extBosLbl, { x: i, y, style: bull ? 'label_down' : 'label_up', textColor: css });
      }
      if (!(bull ? sbtmCrossed : stopCrossed) && cfg.showIdm) {
        const [x, y] = bull ? [sbtmx, sbtmy] : [stopx, stopy];
        Object.assign(extIdm, { x1: x, y1: y, x2: i + 15, y2: y, color: idmCss });
        Object.assign(extIdmLbl, { x: i + 15, y, style: bull ? 'label_up' : 'label_down', textColor: idmCss });
      } else {
        extIdm.color = null;
        extIdmLbl.textColor = null;
      }
    }
  }

  // plot(showCircles ? top : na, offset = -len): the swing confirmed on bar i is drawn on bar i - len
  const highCss = String(color.new(bearCss, 50));
  const lowCss = String(color.new(bullCss, 50));
  const shifted = (values: number[], css: string) => bars.map((b, j) => ({
    time: b.time,
    value: cfg.showCircles && j + len >= 0 && j + len < n ? values[j + len] : NaN,
    color: css,
  }));

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: shifted(long.top, highCss), plot1: shifted(long.btm, lowCss) },
    // an object with an na coordinate is not drawn
    lines: lines.filter((l) => !isNaN(l.x1) && !isNaN(l.x2) && !isNaN(l.y1) && !isNaN(l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color ?? 'transparent',
      ...(l.style !== 'solid' ? { style: l.style } : {}),
    })),
    labels: labels.filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor ?? 'transparent', style: l.style,
      ...(l.size ? { size: l.size } : {}),
    })),
  };
}

export const MarketStructureWithInducementsSweeps = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
