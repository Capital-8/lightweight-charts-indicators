/**
 * Bull Vs. Bear Market Intraday Sessions
 *
 * Up to nine intraday sessions (UTC time ranges, four shown by default: 00-06, 06-12, 12-18 and 18-24 UTC). When a
 * session ends, its bars get a volume profile: the session range (highest high and lowest low of its bars after the
 * first one) is cut into "Profile Rows" levels; the volume of each bar of the session is shared between the levels
 * its wick covers, as bull volume (close above open) or bear volume (close below open). The bull and bear profiles
 * are drawn from the first bar of the session as filled polylines (the value area, "Value Area %" of the bull volume
 * around the level with the most volume, in stronger colours), with an optional box and name label per session,
 * optional delta labels (bull minus bear volume in "Delta Rows" bands), POC lines and value area lines that extend
 * until the price comes back. A "Live" profile of the current period of the "Live" timeframe (1 day) is drawn 200
 * bars to the right of the last bar, with a band behind the bars of that period.
 *
 * `syminfo.mintick` (the top of the live band) comes from the chart context. The session label colour is the
 * midpoint of the HSV gradient between the up and down colours (function `hsv_gradient` of the library hsvColor by
 * kaigouthro, with `percentOfDistance` of its library calc, ported below); the comparison methods of the library
 * MathOperator by RicardoSantos and the array methods `flush` of the library arraymethods by HeWhoMustNotBeNamed are
 * written inline.
 *
 * Reference: "Bull Vs. Bear Market Intraday Sessions [Kioseff Trading]" by KioseffTrading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © KioseffTrading
 */

import {
  array, math, str, color, time, taCore, line, label, box, polyline, linefill, chartPoint,
  resetDrawings, setDrawingBar, drawingOutputs, barInterval,
  type ChartPoint, type Line, type Label, type Polyline, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { mintickOf, type ChartContext } from '../chart-context';
import { periodChanges } from '../anchor-period';

type DeltaSize = 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';

export interface TenXBullVsBearVpIntradaySessionsInputs {
  showT1: boolean; t1: string; showT2: boolean; t2: string; showT3: boolean; t3: string;
  showT4: boolean; t4: string; showT5: boolean; t5: string; showT6: boolean; t6: string;
  showT7: boolean; t7: string; showT8: boolean; t8: string; showT9: boolean; t9: string;
  T1T: string; T2T: string; T3T: string; T4T: string; T5T: string; T6T: string; T7T: string; T8T: string; T9T: string;
  showLI: boolean;
  LIT: string;
  upColT1: string; dnColT1: string; upColT2: string; dnColT2: string; upColT3: string; dnColT3: string;
  upColT4: string; dnColT4: string; upColT5: string; dnColT5: string; upColT6: string; dnColT6: string;
  upColT7: string; dnColT7: string; upColT8: string; dnColT8: string; upColT9: string; dnColT9: string;
  upColLI: string; dnColLI: string;
  boxed: boolean;
  ROWS: number;
  factor: number;
  same: 'Middle' | 'Same Side';
  showdel: boolean;
  deltaRows: number;
  deltaSz: DeltaSize;
  poc: boolean;
  delet: boolean;
  poctype: 'Bull & Bear POC' | 'Regular POC';
  show: number;
  wid: number;
  generalPOCcol: string;
  transp3: number;
  valines: boolean;
  vacol: string;
  cumu: number;
  vashow: number;
  deletva: boolean;
  transp: number;
  transp2: number;
  transpv: number;
  transpv2: number;
}

const UP = '#14D990';
const DN = '#F24968';

export const defaultInputs: TenXBullVsBearVpIntradaySessionsInputs = {
  showT1: true, t1: 'Range 1', showT2: true, t2: 'Range 2', showT3: true, t3: 'Range 3 ',
  showT4: true, t4: 'Range 4', showT5: false, t5: 'Range 5', showT6: false, t6: 'Range 6',
  showT7: false, t7: 'Range 7 ', showT8: false, t8: 'Range 8', showT9: false, t9: 'Range 9',
  T1T: '0000-0600', T2T: '0600-1200', T3T: '1200-1800', T4T: '1800-0000', T5T: '0000-0600', T6T: '0600-1200',
  T7T: '1200-1800', T8T: '1800-0000', T9T: '0000-0600',
  showLI: true,
  LIT: '1D',
  upColT1: UP, dnColT1: DN, upColT2: UP, dnColT2: DN, upColT3: UP, dnColT3: DN,
  upColT4: UP, dnColT4: DN, upColT5: UP, dnColT5: DN, upColT6: UP, dnColT6: DN,
  upColT7: UP, dnColT7: DN, upColT8: UP, dnColT8: DN, upColT9: UP, dnColT9: DN,
  upColLI: '#00E676', dnColLI: '#FF5252',
  boxed: true,
  ROWS: 100,
  factor: 4,
  same: 'Same Side',
  showdel: false,
  deltaRows: 20,
  deltaSz: 'Tiny',
  poc: false,
  delet: false,
  poctype: 'Regular POC',
  show: 10,
  wid: 2,
  generalPOCcol: '#FFEB3B',
  transp3: 25,
  valines: false,
  vacol: '#FFFFFF',
  cumu: 70,
  vashow: 20,
  deletva: false,
  transp: 90,
  transp2: 0,
  transpv: 95,
  transpv2: 70,
};

const G_SHOW = 'Profiles to Show';
const sessionInputs = (): InputConfig[] => {
  const d = defaultInputs as unknown as Record<string, string | boolean>;
  const out: InputConfig[] = [];
  for (let k = 1; k <= 9; k++) {
    out.push(
      { id: `showT${k}`, type: 'bool', title: '', defval: d[`showT${k}`], group: G_SHOW, inline: `T${k}` },
      { id: `t${k}`, type: 'string', title: '', defval: d[`t${k}`], group: G_SHOW, inline: `T${k}` },
    );
  }
  for (let k = 1; k <= 9; k++) {
    out.push({ id: `T${k}T`, type: 'session', title: '', defval: d[`T${k}T`], group: G_SHOW, inline: `T${k}` });
  }
  out.push(
    { id: 'showLI', type: 'bool', title: 'Live', defval: true, group: G_SHOW, inline: 'LI' },
    { id: 'LIT', type: 'timeframe', title: '', defval: '1D', group: G_SHOW, inline: 'LI' },
  );
  for (let k = 1; k <= 9; k++) {
    out.push(
      { id: `upColT${k}`, type: 'color', title: '', defval: UP, group: G_SHOW, inline: `T${k}` },
      { id: `dnColT${k}`, type: 'color', title: '', defval: DN, group: G_SHOW, inline: `T${k}` },
    );
  }
  out.push(
    { id: 'upColLI', type: 'color', title: '', defval: '#00E676', group: G_SHOW, inline: 'LI' },
    { id: 'dnColLI', type: 'color', title: '', defval: '#FF5252', group: G_SHOW, inline: 'LI' },
  );
  return out;
};

export const inputConfig: InputConfig[] = [
  ...sessionInputs(),
  { id: 'boxed', type: 'bool', title: 'Boxed Sessions', defval: true },
  { id: 'ROWS', type: 'int', title: 'Profile Rows', defval: 100, min: 10, max: 2000, step: 10, group: 'Profile Settings' },
  { id: 'factor', type: 'float', title: 'Scaling Factor', defval: 4, min: 1.1, step: 0.1, group: 'Profile Settings' },
  { id: 'same', type: 'string', title: 'VP Plot Type', defval: 'Same Side', options: ['Middle', 'Same Side'], group: 'Profile Settings' },
  { id: 'showdel', type: 'bool', title: 'Show Delta', defval: false, group: 'Delta Settings' },
  { id: 'deltaRows', type: 'int', title: 'Delta Rows', defval: 20, min: 5, group: 'Delta Settings' },
  { id: 'deltaSz', type: 'string', title: 'Delta Text Size', defval: 'Tiny', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: 'Delta Settings' },
  { id: 'poc', type: 'bool', title: 'Show POC', defval: false, group: 'POC Settings', inline: '1' },
  { id: 'delet', type: 'bool', title: 'Delete Violated POCs', defval: false, group: 'POC Settings', inline: '1' },
  { id: 'poctype', type: 'string', title: 'POC Type', defval: 'Regular POC', options: ['Bull & Bear POC', 'Regular POC'], group: 'POC Settings' },
  { id: 'show', type: 'int', title: 'POCs To Show', defval: 10, min: 1, max: 500, group: 'POC Settings' },
  { id: 'wid', type: 'int', title: 'POC Width', defval: 2, group: 'POC Settings' },
  { id: 'generalPOCcol', type: 'color', title: 'Normal POC Col', defval: '#FFEB3B', group: 'POC Settings' },
  { id: 'transp3', type: 'int', title: 'POC Line Transparency', defval: 25, min: 0, max: 100, group: 'POC Settings' },
  { id: 'valines', type: 'bool', title: 'Show VA Lines', defval: false, group: 'VA Settings', inline: 'VA' },
  { id: 'vacol', type: 'color', title: '', defval: '#FFFFFF', group: 'VA Settings', inline: 'VA' },
  { id: 'cumu', type: 'float', title: 'Value Area %', defval: 70, min: 5, max: 95, group: 'VA Settings' },
  { id: 'vashow', type: 'int', title: 'VA Lines To Show', defval: 20, min: 1, max: 500, group: 'VA Settings' },
  { id: 'deletva', type: 'bool', title: 'Delete Violated VA Lines', defval: false, group: 'VA Settings' },
  { id: 'transp', type: 'int', title: 'VA Pofile Fill Transparency', defval: 90, min: 0, max: 100, group: 'VA Settings' },
  { id: 'transp2', type: 'int', title: 'VA Pofile Line Transparency', defval: 0, min: 0, max: 100, group: 'VA Settings' },
  { id: 'transpv', type: 'int', title: 'NON VA Fill Transparency', defval: 95, min: 0, max: 100, group: 'NON VA Settings' },
  { id: 'transpv2', type: 'int', title: 'NON VA Line Transparency', defval: 70, min: 0, max: 100, group: 'NON VA Settings' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Bull Vs. Bear Market Intraday Sessions [Kioseff Trading]',
  shortTitle: 'Bull Vs. Bear Market Intraday Sessions [Kioseff Trading]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500, max_polylines_count = 100) */
const LIMITS = { line: 500, label: 500, box: 500, polyline: 100 };

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b when a - b >= -1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const nz = (v: number, r = 0) => (Number.isNaN(v) ? r : v);
/** Pine math.min / math.max: na when an argument is na */
const min2 = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.min(a, b));
const max2 = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.max(a, b));
const avg2 = (a: number, b: number) => (a + b) / 2;
/** Inclusive Pine `for i = from to to` (counts down when from > to; an na bound runs nothing) */
function forTo(from: number, to: number, body: (i: number) => boolean | void): void {
  if (Number.isNaN(from) || Number.isNaN(to)) return;
  if (from <= to) {
    for (let i = from; i <= to; i++) if (body(i) === false) return;
  } else {
    for (let i = from; i >= to; i--) if (body(i) === false) return;
  }
}

// ---- library hsvColor (kaigouthro): hsv_gradient and its helpers; calc.percentOfDistance ----

const INV255 = 1 / 255;

function hslimit(h: number, s: number, v: number, a: number): [number, number, number, number] {
  return [((h % 360) + 360) % 360, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, v)), Math.max(0, Math.min(1, a))];
}

function rgbhsv(col: string): [number, number, number, number] {
  const r = color.r(col) * INV255;
  const g = color.g(col) * INV255;
  const b = color.b(col) * INV255;
  const t = color.t(col);
  const minV = Math.min(r, Math.min(g, b));
  const maxV = Math.max(r, Math.max(g, b));
  const value = maxV;
  const chroma = maxV - minV;
  const saturation = eq(value, 0) ? 0 : chroma / value;
  const hue = eq(chroma, 0) ? 0
    : eq(value, r) ? 60 * (0 + (g - b) / chroma)
      : eq(value, g) ? 60 * (2 + (b - r) / chroma)
        : 60 * (4 + (r - g) / chroma);
  return hslimit(hue, saturation, value, 1 - t / 100);
}

function percentOfDistance(signal: number, startVal: number, endVal: number): number {
  const mx = Math.max(startVal, endVal);
  const mn = Math.min(startVal, endVal);
  const s = Math.max(mn, Math.min(mx, signal));
  const num = Math.abs(s - startVal);
  const den = Math.abs(endVal - startVal);
  return eq(num, 0) || eq(den, 0) ? 0 : num / den;
}

function hsv(h0: number, s0: number, v0: number, a0: number): string {
  const [hue, saturation, value, alpha] = hslimit(h0, s0, v0, a0);
  const h = hue / 60;
  const chroma = value * saturation;
  const secondary = chroma * (1 - Math.abs((h % 2) - 1));
  const m = value - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (eq(saturation, 0)) {
    red = value;
    green = value;
    blue = value;
  } else {
    switch (Math.floor(h)) {
      case 0: red = chroma; green = secondary; blue = 0; break;
      case 1: red = secondary; green = chroma; blue = 0; break;
      case 2: red = 0; green = chroma; blue = secondary; break;
      case 3: red = 0; green = secondary; blue = chroma; break;
      case 4: red = secondary; green = 0; blue = chroma; break;
      case 5: red = chroma; green = 0; blue = secondary; break;
      default: break;
    }
  }
  const transparency = 100 - math.round(alpha * 100);
  return transparency < 100
    ? color.rgb((m + red) * 255, (m + green) * 255, (m + blue) * 255, transparency)
    : 'transparent';
}

function hsvGradient(signal: number, startVal: number, endVal: number, startCol: string, endCol: string): string {
  const [h1, s1, v1, a1] = rgbhsv(startCol);
  const [h2, s2, v2, a2] = rgbhsv(endCol);
  const position = percentOfDistance(signal, startVal, endVal);
  let h = 0;
  let s = 0;
  let v = 0;
  let a = 0;
  if (!eq(startVal, endVal)) {
    h = h1 + 360 + position * (((h2 - h1 + 540) % 360) - 180);
    s = s1 + (s2 - s1) * position;
    v = v1 + (v2 - v1) * position;
    a = a1 + (a2 - a1) * position;
  }
  return hsv(h, s, v, a);
}

// ---- the script ----

interface Pt { index: number; price: number }

export function calculate(
  bars: Bar[],
  inputs: Partial<TenXBullVsBearVpIntradaySessionsInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const c = cfg as unknown as Record<string, unknown>;
  const n = bars.length;
  const last = n - 1;
  const ROWS = Math.trunc(cfg.ROWS);
  const deltaRows = Math.trunc(cfg.deltaRows);
  const sameSide = cfg.same === 'Same Side';
  const middle = cfg.same === 'Middle';
  const mintick = mintickOf(chart);
  const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
  const barMs = barInterval(bars) * (toMs === 1 ? 1 : 1000);
  // show := switch poctype: "Regular POC" => show + 1, => show * 2
  const showPocs = cfg.poctype === 'Regular POC' ? cfg.show + 1 : cfg.show * 2;
  const dsz = ({ Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Huge: 'huge' } as const)[cfg.deltaSz];

  const atr = taCore.atr(14, bars.map((b) => b.high), bars.map((b) => b.low), bars.map((b) => b.close)) as number[];
  const liveChange = cfg.showLI ? periodChanges(bars, cfg.LIT, chart) : [];

  resetDrawings(LIMITS);

  // data (var): columns newest first (column k = bar N - k): time / volume, high / low, sign(close - open)
  const pocs: Line[] = [];
  const valine: Line[] = [];
  const retAt = (N: number, k: number) => Math.trunc(math.sign(bars[N - k].close - bars[N - k].open));
  const volAt = (N: number, k: number) => bars[N - k].volume ?? NaN;
  /** HLmat.row(0 | 1).slice(from, to) at bar N */
  const hlSlice = (N: number, row: 0 | 1, from: number, to: number) => {
    const col = Array.from({ length: N + 1 }, (_v, k) => (row === 0 ? bars[N - k].high : bars[N - k].low));
    return array.slice(col, from, to) as number[];
  };

  /** array.flush() of a line / label array: removes and deletes from the end */
  const flushLines = (arr: Line[]) => {
    while (arr.length > 0) line.delete(arr.pop()!);
  };

  /** id.setLevels(gety, gety2): row 0 of the profile matrix */
  const levelsOf = (gety: number, gety2: number) => {
    const step = (gety2 - gety) / (ROWS - 1);
    return Array.from({ length: ROWS }, (_v, i) => gety + step * i);
  };

  /** effSwitch over the levels a bar covers: double_binary_search_leftmost(i) then for x = l1 to l2 */
  const addBar = (N: number, k: number, idrow: number[], up: number[], dn: number[]) => {
    const l1 = array.binary_search_leftmost(idrow, bars[N - k].high);
    const l2 = array.binary_search_leftmost(idrow, bars[N - k].low);
    const div = Math.abs(l1 - l2) + 1;
    forTo(l1, l2, (x) => {
      const r = retAt(N, k);
      if (r === 1) up[x] = up[x] + volAt(N, k) / div;
      else if (r === -1) dn[x] = dn[x] + volAt(N, k) / div;
    });
  };

  /** Per call site state of calcDelta (var lastdb, var liveLab) */
  interface DeltaState { lastLabels: Label[]; liveLab: Label[] }
  const newDeltaState = (): DeltaState => ({ lastLabels: [], liveLab: [] });

  const calcDelta = (N: number, st: DeltaState, idrow: number[], up: number[], dn: number[], getY: number,
    getY2: number, mid: number, upCol: string, dnCol: string) => {
    if (!cfg.showdel) return;
    const dbLabels: Label[] = [];
    const mapped = new Map<number, number>();
    if (st.lastLabels.length > 0) {
      forTo(st.lastLabels.length - 1, 0, (i) => {
        label.delete(array.remove(st.lastLabels, i) as Label);
      });
    }
    if (st.liveLab.length > 0) label.delete(array.remove(st.liveLab, 0) as Label);
    const lo = min2(getY, getY2);
    const newSlice = (max2(getY, getY2) - lo) / deltaRows;
    const idx = N === last ? st.lastLabels : dbLabels;
    forTo(0, deltaRows - 1, (i) => {
      mapped.set(i, 0);
      const btm = lo + newSlice * i;
      const top = lo + newSlice * (i + 1);
      idx.push(label.new(chartPoint.from_index(mid, avg2(top, btm)), '', 'bar_index', 'price', '#00000000', 'none',
        '#FFFFFF', dsz));
      const topCol = array.binary_search_leftmost(idrow, top);
      const btmCol = array.binary_search_leftmost(idrow, btm);
      forTo(btmCol, topCol, (x) => {
        // mappedLevel.get(i) + (newRowUp.get(x) - newRowDn.get(x)): PineScript evaluates a + (b - c) left to
        // right, as (a + b) - c
        mapped.set(i, (mapped.get(i)! + up[x]) - dn[x]);
      });
    });
    const valArr = [...mapped.values()];
    array.sort(valArr, 'ascending');
    let pos: number[] | null = null;
    let neg: number[] | null = null;
    if (gt(array.last(valArr) as number, 0)) pos = array.slice(valArr, array.binary_search_rightmost(valArr, 0), valArr.length) as number[];
    if (gt(0, array.first(valArr) as number)) neg = array.slice(valArr, 0, array.binary_search_leftmost(valArr, 0)) as number[];
    const minOf = (a: number[] | null) => (a ? array.min(a) : NaN);
    const maxOf = (a: number[] | null) => (a ? array.max(a) : NaN);
    forTo(0, deltaRows - 1, (i) => {
      const v = mapped.get(i)!;
      const sign = math.sign(v);
      const col = sign === 1
        ? color.from_gradient(v, minOf(pos), maxOf(pos), String(color.new(upCol, 50)), String(color.new(upCol, 10)))
        : sign === -1
          ? color.from_gradient(v, maxOf(neg), minOf(neg), String(color.new(dnCol, 10)), String(color.new(dnCol, 50)))
          : String(color.new('#FFFFFF', 75));
      const lb = array.get(idx, i) as Label;
      label.set_textcolor(lb, col);
      label.set_text(lb, str.tostring(v, 'volume'));
    });
    const diff = (array.sum(up) as number) - (array.sum(dn) as number);
    const sumSign = math.sign(diff);
    const sumCol = sumSign === 1 ? upCol : sumSign === -1 ? dnCol : '#FFFFFF';
    const y = max2(getY, getY2) + atr[N] * 4;
    if (N < last) {
      label.new(chartPoint.from_index(mid, y), str.tostring(diff, 'volume'), 'bar_index', 'price', '#00000000',
        undefined, sumCol);
    }
    if (N === last) {
      st.liveLab.push(label.new(chartPoint.from_index(mid, y), str.tostring(diff, 'volume'), 'bar_index', 'price',
        '#00000000', undefined, sumCol));
    }
  };

  const drawPOC = (N: number, ids: Line[], startIndex: number, upCol: string, dnCol: string, idrow: number[],
    up: number[], dn: number[], remove: boolean, cond1 = false, enterStart = NaN) => {
    const avg = math.round(avg2(N, startIndex));
    if (remove) flushLines(ids);
    if (!cfg.poc) return;
    const [start, end] = !cond1
      ? (middle ? [avg, N] : [Math.max(startIndex, N - 999), N])
      : [max2(enterStart, N - 999), N + 40];
    if (cfg.poctype === 'Bull & Bear POC') {
      for (let i = 0; i <= 1; i++) {
        const [arr, col] = i === 0 ? [up, upCol] : [dn, dnCol];
        const at = array.indexof(arr, array.max(arr));
        const y = avg2(array.get(idrow, at) as number, array.get(idrow, Math.min(at + 1, arr.length - 1)) as number);
        ids.push(line.new(start, y, end, y, 'bar_index', 'none', String(color.new(col, cfg.transp3)), 'solid', cfg.wid));
      }
    } else {
      forTo(0, up.length - 1, (i) => {
        up[i] = up[i] + dn[i];
      });
      const at = array.indexof(up, array.max(up));
      const y = avg2(array.get(idrow, at) as number, array.get(idrow, Math.min(at + 1, idrow.length - 1)) as number);
      ids.push(line.new(start, y, end, y, 'bar_index', 'none', String(color.new(cfg.generalPOCcol, cfg.transp3)), 'solid', cfg.wid));
    }
  };

  /** findValue: the value area rows [first, last] of the bull volume, and the optional value area lines */
  const findValue = (N: number, det: number[], up: number[], dn: number[], start: number, idrow: number[],
    lines: Line[], remove: boolean, manual: number) => {
    const copyArr = up.map((v, i) => v + dn[i]);
    const highest = array.indexof(copyArr, array.max(copyArr));
    const total = array.sum(up) as number;
    forTo(1, up.length - 1, (i) => {
      const slice = array.slice(up, Math.max(highest - i, 0), Math.min(highest + i + 1, up.length)) as number[];
      if (ge((array.sum(slice) as number) / total, cfg.cumu / 100)) {
        det[0] = Math.max(highest - i, 0);
        det[1] = Math.min(highest + i, up.length - 1);
        return false;
      }
      return true;
    });
    if (cfg.valines) {
      if (remove) flushLines(lines);
      const end = remove ? manual : N;
      const y1 = array.get(idrow, Math.trunc(det[0])) as number;
      const y2 = array.get(idrow, Math.trunc(Math.min(det[1] + 1, idrow.length - 1))) as number;
      lines.push(line.new(chartPoint.from_index(start, y1), chartPoint.from_index(end, y1), 'bar_index', 'none', cfg.vacol));
      lines.push(line.new(chartPoint.from_index(start, y2), chartPoint.from_index(end, y2), 'bar_index', 'none', cfg.vacol));
    }
  };

  /** A profile: setCoordsHistory then createPoly (matrices of chart points as two rows) */
  const drawProfile = (N: number, up: number[], dn: number[], newRange: number, idrow: number[], startIndex: number,
    subtract: number, live: boolean, lines: Line[], remove: boolean, manual: number, upCol: string, dnCol: string,
    cond: boolean, polys: Polyline[]) => {
    const oldMin = min2(array.min(up) as number, array.min(dn) as number);
    const oldMax = max2(array.max(up) as number, array.max(dn) as number);
    const finalPoints: number[] = new Array<number>(6).fill(NaN);
    const rows = { main: [[], []] as Pt[][], dn: [[], []] as Pt[][], up: [[], []] as Pt[][] };

    // setCoordsHistory
    const avg = math.round(avg2(N, startIndex));
    const det = [-1, 9e9];
    findValue(N, det, up, dn, sameSide ? startIndex : avg, idrow, lines, remove, manual);
    const addPoints = (m: Pt[][], newXUp: number, newXDn: number, i: number) => {
      const adjDn = sameSide ? newXUp + (newXDn - (startIndex + 1)) : newXDn;
      const y0 = idrow[i];
      const y1 = nz(idrow[i + 1]);
      m[0].push({ index: math.round(newXUp), price: y0 }, { index: math.round(newXUp), price: y1 });
      m[1].push({ index: math.round(adjDn), price: y0 }, { index: math.round(adjDn), price: y1 });
      const newAvgU = middle ? avg - subtract : startIndex + subtract;
      m[0].push({ index: newAvgU, price: y1 });
      m[1].push({ index: math.round(newXUp), price: y1 });
    };
    forTo(0, up.length - 2, (i) => {
      const calcUp = 1 + ((up[i] - oldMin) / (oldMax - oldMin)) * (newRange - 1);
      const calcDn = 1 + ((dn[i] - oldMin) / (oldMax - oldMin)) * (newRange - 1);
      const newSwitchUp = middle ? avg - calcUp : (live ? startIndex - calcUp : startIndex + calcUp);
      const newXUp = middle ? min2(newSwitchUp, avg - 1)
        : (live ? min2(startIndex - 1, newSwitchUp) : max2(newSwitchUp, startIndex + 1));
      const newSwitchDn = sameSide ? (live ? startIndex - calcDn : startIndex + calcDn) : avg + calcDn;
      const newXDn = sameSide ? (live ? min2(newSwitchDn, startIndex - 1) : max2(newSwitchDn, startIndex + 1))
        : max2(newSwitchDn, avg + 1);
      if (i < det[0]) {
        addPoints(rows.dn, newXUp, newXDn, i);
        finalPoints[0] = min2(nz(finalPoints[0], 9e9), idrow[i]);
        finalPoints[1] = max2(nz(finalPoints[1], -1), idrow[i + 1]);
      } else if (i > det[1]) {
        addPoints(rows.up, newXUp, newXDn, i);
        finalPoints[2] = min2(nz(finalPoints[2], 9e9), idrow[i]);
        finalPoints[3] = max2(nz(finalPoints[3], -1), idrow[i + 1]);
      } else {
        addPoints(rows.main, newXUp, newXDn, i);
        finalPoints[4] = min2(nz(finalPoints[4], 9e9), idrow[i]);
        finalPoints[5] = max2(nz(finalPoints[5], -1), idrow[i + 1]);
      }
    });

    // createPoly (cond: the live profile)
    const finx = !middle ? (cond ? N + 200 : startIndex) : (cond ? N + 100 : math.round(avg2(N, startIndex)));
    const wrap = (m: Pt[][], lo: number, hi: number) => {
      for (const r of m) {
        r.unshift({ index: finx, price: lo });
        r.push({ index: finx, price: hi });
      }
    };
    const poly = (pts: Pt[], fill: string, lineCol: string) => {
      const p: ChartPoint[] = pts.map((q) => chartPoint.from_index(q.index, q.price));
      polys.push(polyline.new(p, false, false, 'bar_index', lineCol, fill));
    };
    wrap(rows.main, finalPoints[4], finalPoints[5]);
    if (rows.dn[0].length > 0) {
      wrap(rows.dn, finalPoints[0], finalPoints[1]);
      poly(rows.dn[1], String(color.new(dnCol, cfg.transpv)), String(color.new(dnCol, cfg.transpv2)));
      poly(rows.dn[0], String(color.new(upCol, cfg.transpv)), String(color.new(upCol, cfg.transpv2)));
    }
    if (rows.up[0].length > 0) {
      wrap(rows.up, finalPoints[2], finalPoints[3]);
      poly(rows.up[1], String(color.new(dnCol, cfg.transpv)), String(color.new(dnCol, cfg.transpv2)));
      poly(rows.up[0], String(color.new(upCol, cfg.transpv)), String(color.new(upCol, cfg.transpv2)));
    }
    poly(rows.main[1], String(color.new(dnCol, cfg.transp)), String(color.new(dnCol, cfg.transp2)));
    poly(rows.main[0], String(color.new(upCol, cfg.transp)), String(color.new(upCol, cfg.transp2)));
  };

  // update(): one call site per session (T7 shares the matrix of T4, T8 the matrix of T3: matrices are new on
  // every bar, so two sessions on one matrix only add up when they end on the same bar)
  interface Site { k: number; matrix: string; session: string; on: boolean; up: string; dn: string; name: string;
    labelCol: string; tim: boolean[]; startIndex: number; delta: DeltaState }
  const order = [1, 2, 4, 3, 5, 6, 7, 8, 9];
  const matrixOf: Record<number, string> = { 1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4', 5: 'T5', 6: 'T6', 7: 'T4', 8: 'T3', 9: 'T9' };
  const sites: Site[] = order.map((k) => {
    const session = c[`T${k}T`] as string;
    const up = c[`upColT${k}`] as string;
    const dn = c[`dnColT${k}`] as string;
    return {
      k, matrix: matrixOf[k], session, on: c[`showT${k}`] as boolean, up, dn, name: c[`t${k}`] as string,
      labelCol: hsvGradient(0, -1, 1, up, dn),
      // timeTrue(): math.sign(time("1", session, "UTC")), 1 in the session and na outside
      tim: bars.map((b) => time.inSession(b.time * toMs, session, 'UTC', barMs)),
      startIndex: 0, delta: newDeltaState(),
    };
  });

  // realtime() state
  let timArr0 = NaN;
  const tBack: Line[] = [];
  const pocsLive: Line[] = [];
  const valineLive: Line[] = [];
  const livePoly: Polyline[] = [];
  const liveDelta = newDeltaState();

  const keyLevelsUpdate = (N: number, ids: Line[], showtyp: number, deletyp: boolean) => {
    const b = bars[N];
    if (ids.length > 0) {
      for (let i = 0; i <= ids.length - 1; i++) {
        const l = ids[i];
        const y1 = line.get_y1(l);
        if (gt(y1, b.high) || gt(b.low, y1)) {
          if (eq(line.get_x2(l), N - 1)) line.set_x2(l, N);
        } else if (deletyp) {
          line.delete(l);
        }
        if (deletyp) {
          const x2 = line.get_x2(l);
          if (!Number.isNaN(x2) && !eq(x2, N)) line.delete(l);
        }
      }
    }
    if (N === last && ids.length > showtyp) {
      forTo(0, Math.max(ids.length - showtyp - 1, 0), (i) => {
        line.delete(ids[i]);
      });
    }
  };

  for (let N = 0; N < n; N++) {
    setDrawingBar(N, N === last);
    const tLevels = new Map<string, number[][]>();
    const matrix = (name: string) => {
      let m = tLevels.get(name);
      if (!m) {
        m = [new Array<number>(ROWS).fill(0), new Array<number>(ROWS).fill(0), new Array<number>(ROWS).fill(0)];
        tLevels.set(name, m);
      }
      return m;
    };

    for (const s of sites) {
      if (!s.on) continue;
      const tim = s.tim[N];
      const tim1 = N > 0 ? s.tim[N - 1] : false;
      const change = !tim && tim1;
      if (tim && !tim1) s.startIndex = N;
      const startIndex = s.startIndex;
      const diff = N - startIndex;
      if (N === last || !change) continue;

      const highsArr = hlSlice(N, 0, 1, diff);
      const lowsArr = hlSlice(N, 1, 1, diff);
      const gety = array.min(lowsArr) as number;
      const gety2 = array.max(highsArr) as number;
      if (cfg.boxed) {
        box.new(startIndex, gety2, N - 1, gety, '#FFFFFF', 1, 'dashed', 'none', 'bar_index', String(color.new('#2962FF', 95)));
        label.new(math.round(avg2(startIndex, N - 1)), gety2, s.name, 'bar_index', 'price', '#00000000', 'label_down',
          s.labelCol, 'small');
      }
      const m = matrix(s.matrix);
      m[0] = levelsOf(gety, gety2);
      const idrow = [...m[0]];
      forTo(1, diff, (k) => addBar(N, k, idrow, m[1], m[2]));
      const newRange = Math.floor((N - startIndex) / cfg.factor);
      const up = [...m[1]];
      const dn = [...m[2]];
      drawProfile(N, up, dn, newRange, idrow, startIndex, 1, false, valine, false, NaN, s.up, s.dn, false, []);
      calcDelta(N, s.delta, idrow, up, dn, gety, gety2, math.round(avg2(N, startIndex)), s.up, s.dn);
      drawPOC(N, pocs, startIndex, s.up, s.dn, idrow, up, dn, false);
    }

    // realtime()
    if (cfg.showLI) {
      const b = bars[N];
      const t = b.time * toMs;
      if (liveChange[N]) {
        timArr0 = last - N - 1;
        flushLines(tBack);
        tBack.push(line.new(t, b.high + mintick, t, b.low, 'bar_time', 'both', '#00000000'));
      }
      if (N === last) {
        timArr0 = timArr0 + 1;
        if (tBack.length > 1) line.delete(tBack.pop()!);
        tBack.push(line.new(t, b.high + mintick, t, b.low, 'bar_time', 'both', '#00000000'));
        for (const f of linefill.all()) linefill.delete(f);
        linefill.new(array.first(tBack) as Line, array.last(tBack) as Line, String(color.new('#6929F2', 95)));
        while (livePoly.length > 0) polyline.delete(livePoly.shift()!);

        const startIndex = timArr0;
        const highs = hlSlice(N, 0, 0, startIndex + 1);
        const lows = hlSlice(N, 1, 0, startIndex + 1);
        const lo = array.min(lows) as number;
        const hi = array.max(highs) as number;
        const levelsArr = levelsOf(lo, hi);
        const up = new Array<number>(ROWS).fill(0);
        const dn = new Array<number>(ROWS).fill(0);
        forTo(0, startIndex, (k) => addBar(N, k, levelsArr, up, dn));
        drawProfile(N, up, dn, 80, levelsArr, N + 200, 0, true, valineLive, true, N - startIndex, cfg.upColLI,
          cfg.dnColLI, true, livePoly);
        calcDelta(N, liveDelta, levelsArr, up, dn, lo, hi, N + 225, cfg.upColLI, cfg.dnColLI);
        drawPOC(N, pocsLive, startIndex, cfg.upColLI, cfg.dnColLI, levelsArr, up, dn, true, true, N - timArr0);
      }
    }

    keyLevelsUpdate(N, pocs, showPocs, cfg.delet);
    keyLevelsUpdate(N, valine, cfg.vashow, cfg.deletva);
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars, toMs === 1 ? 'ms' : 's'),
  };
}

export const TenXBullVsBearVpIntradaySessions = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
