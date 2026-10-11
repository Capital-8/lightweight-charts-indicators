/**
 * Fibonacci Ranges (Real-Time) [LuxAlgo]
 *
 * Fibonacci channels between the two latest swings, kept until the price breaks out.
 * - Swings: pivot highs and lows ("L" bars before, "R" bars after). A pivot in the direction of the latest swing
 *   that goes further replaces it; a pivot in the other direction starts a new swing.
 * - When no channel is active and a pivot is confirmed, a channel is drawn from the pivot to the swing before the
 *   latest one: nine horizontal levels (-0.382, 0, 0.236, 0.382, 0.5, 0.618, 0.764, 1 and 1.382 of the distance),
 *   a dashed diagonal between the two points and two small labels at the break levels. The levels follow the
 *   current bar (8 bars ahead).
 * - The channel ends when the close stays outside the "Break level" pair for more than "Break count" consecutive
 *   bars. A label marks the bar of the break (above the bar when it breaks up, below when it breaks down).
 * - The nine plots carry the level values (they are fully transparent); "Channel + Shadows" fills between them with
 *   gradients from the level colour to nothing.
 * - "Latest Fibonacci": the retracement of the latest two swings, with four filled areas, a middle line, a
 *   diagonal and a label on the latest swing.
 *
 * Chart values (third argument): the port reads the chart background colour (the transparent end of the gradient
 * fills; without it: #0F0F0F, a dark chart).
 *
 * Reference: "Fibonacci Ranges (Real-Time) [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { backgroundColorOf, type ChartContext } from '../chart-context';

export interface FibonacciRangesInputs {
  /** Bars before a pivot */
  L: number;
  /** Bars after a pivot */
  R: number;
  channel: 'Channel' | 'Channel + Shadows' | 'None';
  /** Pair of levels that the close has to leave */
  breakLevel: '-0.382 - 1.382' | '0.000 - 1.000' | '0.236 - 0.764' | '0.382 - 0.618';
  /** Consecutive closes outside the levels that are allowed */
  breakCount: number;
  showBreaks: boolean;
  /** Latest Fibonacci */
  latestFibonacci: boolean;
  color0: string;
  colorLow: string;
  colorMid: string;
  colorHigh: string;
  color1: string;
}

export const defaultInputs: FibonacciRangesInputs = {
  L: 5,
  R: 1,
  channel: 'Channel + Shadows',
  breakLevel: '0.000 - 1.000',
  breakCount: 2,
  showBreaks: true,
  latestFibonacci: false,
  color0: 'rgba(8, 153, 129, 0.39)',
  colorLow: 'rgba(8, 153, 129, 0.5)',
  colorMid: 'rgba(30, 66, 176, 0.44)',
  colorHigh: 'rgba(242, 54, 69, 0.5)',
  color1: 'rgba(242, 54, 69, 0.39)',
};

export const inputConfig: InputConfig[] = [
  { id: 'L', type: 'int', title: 'L', defval: 5, min: 1, group: 'Swing Settings' },
  { id: 'R', type: 'int', title: 'R', defval: 1, min: 1, group: 'Swing Settings' },
  { id: 'channel', type: 'string', title: 'Channel', defval: 'Channel + Shadows', options: ['Channel', 'Channel + Shadows', 'None'], group: 'Fibonacci Channel' },
  { id: 'breakLevel', type: 'string', title: 'Break level', defval: '0.000 - 1.000', options: ['-0.382 - 1.382', '0.000 - 1.000', '0.236 - 0.764', '0.382 - 0.618'], group: 'Fibonacci Channel' },
  { id: 'breakCount', type: 'int', title: 'Break count', defval: 2, min: 0, group: 'Fibonacci Channel' },
  { id: 'showBreaks', type: 'bool', title: '                    Show breaks', defval: true, group: 'Fibonacci Channel' },
  { id: 'latestFibonacci', type: 'bool', title: '                 Latest Fibonacci', defval: false, group: 'Fibonacci' },
  { id: 'color0', type: 'color', title: '      ', defval: 'rgba(8, 153, 129, 0.39)', inline: 'f', group: 'Fibonacci' },
  { id: 'colorLow', type: 'color', title: '', defval: 'rgba(8, 153, 129, 0.5)', inline: 'f', group: 'Fibonacci' },
  { id: 'colorMid', type: 'color', title: '', defval: 'rgba(30, 66, 176, 0.44)', inline: 'f', group: 'Fibonacci' },
  { id: 'colorHigh', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.5)', inline: 'f', group: 'Fibonacci' },
  { id: 'color1', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.39)', inline: 'f', group: 'Fibonacci' },
];

/** color.new(color.blue, 100): the plots only carry the values for the fills */
const HIDDEN = String(color.new('#2962FF', 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '-0.382', color: HIDDEN, lineWidth: 1, style: 'steplinebr' },
  { id: 'plot1', title: '0.000', color: HIDDEN, lineWidth: 1, style: 'steplinebr' },
  { id: 'plot2', title: '0.236', color: HIDDEN, lineWidth: 1, style: 'steplinebr' },
  { id: 'plot3', title: '0.382', color: HIDDEN, lineWidth: 1, style: 'steplinebr' },
  { id: 'plot4', title: '0.500', color: HIDDEN, lineWidth: 1, style: 'steplinebr' },
  { id: 'plot5', title: '0.618', color: HIDDEN, lineWidth: 1, style: 'steplinebr' },
  { id: 'plot6', title: '0.764', color: HIDDEN, lineWidth: 1, style: 'steplinebr' },
  { id: 'plot7', title: '1.000', color: HIDDEN, lineWidth: 1, style: 'steplinebr' },
  { id: 'plot8', title: '1.382', color: HIDDEN, lineWidth: 1, style: 'steplinebr' },
];

export const metadata = {
  title: 'Fibonacci Ranges (Real-Time) [LuxAlgo]',
  shortTitle: 'LuxAlgo - Fibonacci Ranges (Real-Time)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** color.gray, color.silver and color.blue of Pine v5, and the default label text colour */
const GRAY = '#787B86';
const SILVER = '#B2B5BE';
const BLUE = '#2962FF';
const LABEL_TEXT = '#363A45';

interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; dashed?: boolean }
interface Lb { x: number; y: number; style: 'label_center' | 'label_up' | 'label_down'; size: 'tiny' | 'normal' }
/** Pine type piv: bar, price, direction */
interface Piv { b: number; p: number; d: number }

const newLine = (css: string, dashed = false): Ln => ({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: css, dashed });
const setXy1 = (l: Ln, x: number, y: number) => { l.x1 = x; l.y1 = y; };
const setXy2 = (l: Ln, x: number, y: number) => { l.x2 = x; l.y2 = y; };
/** math.avg(a, b) */
const avg = (a: number, b: number) => (a + b) / 2;

export function calculate(
  bars: Bar[],
  inputs: Partial<FibonacciRangesInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'lines' | 'labels' | 'linefills'> & {
  markers: MarkerData[]; lines: LineDrawingData[]; labels: LabelData[]; linefills: LinefillData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const L = Math.trunc(cfg.L);
  const R = Math.trunc(cfg.R);
  const c = Math.trunc(cfg.breakCount);
  const sF = cfg.latestFibonacci;
  const Fc = cfg.channel !== 'None';
  const fl = cfg.channel === 'Channel + Shadows';
  const { color0: F0, colorLow: F_, colorMid: Fm, colorHigh: Fp, color1: F1 } = cfg;
  const opt = cfg.breakLevel;
  const a1 = opt === '-0.382 - 1.382' ? -0.382 : opt === '0.000 - 1.000' ? 0 : opt === '0.236 - 0.764' ? 0.236 : 0.382;
  const a2 = opt === '-0.382 - 1.382' ? 1.382 : opt === '0.000 - 1.000' ? 1 : opt === '0.236 - 0.764' ? 0.764 : 0.618;

  const phArr = ta.pivothigh(new Series(bars, (b) => b.high), L, R).toArray();
  const plArr = ta.pivotlow(new Series(bars, (b) => b.low), L, R).toArray();

  // var f = fib.new(...): the nine levels, the diagonal and the two labels of the channel
  const f = {
    n0_382: newLine(F0), _0_000: newLine(F0), _0_236: newLine(F_), _0_382: newLine(F_), _0_500: newLine(Fm),
    _0_618: newLine(Fp), _0_764: newLine(Fp), _1_000: newLine(F1), _1_382: newLine(F1),
    diagon: newLine(SILVER, true),
    lab1: { x: NaN, y: NaN, style: 'label_center', size: 'tiny' } as Lb,
    lab2: { x: NaN, y: NaN, style: 'label_center', size: 'tiny' } as Lb,
    active: false,
    count: 0,
  };
  const levels: Ln[] = [f.n0_382, f._0_000, f._0_236, f._0_382, f._0_500, f._0_618, f._0_764, f._1_000, f._1_382];
  // var fibLast fLast = fibLast.new(...): four filled pairs of lines, the middle line, the diagonal and the label
  const l0_1 = newLine(F0), l0_2 = newLine(F0);
  const lM01 = newLine(F_), lM02 = newLine(F_);
  const lM11 = newLine(Fp), lM12 = newLine(Fp);
  const l1_1 = newLine(F1), l1_2 = newLine(F1);
  const ln_0_5 = newLine(BLUE);
  const lastDiagon = newLine(SILVER, true);
  const lastLab: Lb = { x: NaN, y: NaN, style: 'label_down', size: 'normal' };
  const lastLines: Ln[] = [l0_1, l0_2, lM01, lM02, lM11, lM12, l1_1, l1_2, ln_0_5];

  const pivs: Piv[] = [];
  const plotVals: number[][] = Array.from({ length: 9 }, () => new Array<number>(n).fill(NaN));
  const raw: number[][] = Array.from({ length: 9 }, () => new Array<number>(n).fill(NaN));
  const hidden: boolean[] = new Array<boolean>(n).fill(false);
  const markers: MarkerData[] = [];
  let prevActive = false; // f.active[1]
  let prev0 = NaN; // plot_0_000[1]
  const last = n - 1;

  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];
    const ph = phArr[i] ?? NaN;
    const pl = plArr[i] ?? NaN;
    const isPh = !Number.isNaN(ph) && ph !== 0;
    const isPl = !Number.isNaN(pl) && pl !== 0;
    let brokeU = false;
    let brokeD = false;

    if (isPh) {
      const hR = bars[i - R].high;
      if (pivs.length > 0) {
        const get = pivs[0];
        if (get.d > 0 && gt(ph, get.p)) {
          get.b = i - R;
          get.p = hR;
        }
        if (get.d < 0 && gt(ph, get.p)) pivs.unshift({ b: i - R, p: hR, d: 1 });
      } else {
        pivs.unshift({ b: i - R, p: hR, d: 1 });
      }
      if (pivs.length > 1 && !f.active && Fc) {
        const get1 = pivs[1];
        const diff = hR - get1.p;
        const ys = [hR + diff * 0.382, hR, hR - diff * 0.236, hR - diff * 0.382, hR - diff * 0.5, hR - diff * 0.618,
          hR - diff * 0.764, get1.p, get1.p - diff * 0.382];
        levels.forEach((l, k) => { setXy1(l, i - R, ys[k]); setXy2(l, i + 8, ys[k]); });
        f.lab1.x = i + 8; f.lab1.y = hR - diff * a1;
        f.lab2.x = i + 8; f.lab2.y = hR - diff * a2;
        setXy1(f.diagon, get1.b, get1.p);
        setXy2(f.diagon, i - R, hR);
        f.active = true;
      }
    }

    if (isPl) {
      const lR = bars[i - R].low;
      if (pivs.length > 0) {
        const get = pivs[0];
        if (get.d < 0 && lt(pl, get.p)) {
          get.b = i - R;
          get.p = lR;
        }
        if (get.d > 0 && lt(pl, get.p)) pivs.unshift({ b: i - R, p: lR, d: -1 });
      } else {
        pivs.unshift({ b: i - R, p: lR, d: -1 });
      }
      if (pivs.length > 1 && !f.active && Fc) {
        const get1 = pivs[1];
        const diff = get1.p - lR;
        const ys = [lR - diff * 0.382, lR, lR + diff * 0.236, lR + diff * 0.382, lR + diff * 0.5, lR + diff * 0.618,
          lR + diff * 0.764, get1.p, get1.p + diff * 0.382];
        levels.forEach((l, k) => { setXy1(l, i - R, ys[k]); setXy2(l, i + 8, ys[k]); });
        f.lab1.x = i + 8; f.lab1.y = lR + diff * a1;
        f.lab2.x = i + 8; f.lab2.y = lR + diff * a2;
        setXy1(f.diagon, get1.b, get1.p);
        setXy2(f.diagon, i - R, lR);
        f.active = true;
      }
    }

    if (pivs.length >= 2) {
      const p0 = pivs[0];
      const p1 = pivs[1];
      const dif = Math.max(p0.p, p1.p) - Math.min(p0.p, p1.p);
      const d = lt(p0.p, p1.p) ? -dif : dif;
      const x2 = Math.max(last, p0.b) + 8;
      if ((isPh || isPl) && sF) {
        const set = (l: Ln, y: number) => { setXy1(l, p0.b, y); setXy2(l, x2, y); };
        set(l0_1, p0.p + d * 0.382);
        set(l0_2, p0.p);
        set(lM01, p0.p - d * 0.236);
        set(lM02, p0.p - d * 0.382);
        set(lM11, p0.p - d * 0.618);
        set(lM12, p0.p - d * 0.764);
        set(l1_1, p0.p - d);
        set(l1_2, p1.p - d * 0.382);
        set(ln_0_5, p0.p - d * 0.5);
        setXy1(lastDiagon, p0.b, p0.p);
        setXy2(lastDiagon, p1.b, p1.p);
        lastLab.x = p0.b;
        lastLab.y = p0.p;
        lastLab.style = gt(p1.p, p0.p) ? 'label_up' : 'label_down';
      } else {
        for (const l of lastLines) l.x2 = i + 8;
      }
    }

    if (f.active) {
      const lv1 = opt === '0.000 - 1.000' ? f._0_000 : opt === '0.236 - 0.764' ? f._0_236 : opt === '0.382 - 0.618' ? f._0_382 : f.n0_382;
      const lv2 = opt === '0.000 - 1.000' ? f._1_000 : opt === '0.236 - 0.764' ? f._0_764 : opt === '0.382 - 0.618' ? f._0_618 : f._1_382;
      const max = Math.max(lv1.y2, lv2.y2);
      const min = Math.min(lv1.y2, lv2.y2);
      if (lt(close, max) && gt(close, min)) f.count = 0;
      else if (gt(close, max) || lt(close, min)) f.count += 1;
      if (f.count > c) {
        for (const l of [...levels, f.diagon]) { setXy1(l, NaN, NaN); setXy2(l, NaN, NaN); }
        f.lab1.x = NaN; f.lab1.y = NaN;
        f.lab2.x = NaN; f.lab2.y = NaN;
        f.active = false;
        if (gt(close, max)) brokeU = true;
        else brokeD = true;
      } else {
        for (const l of levels) l.x2 = i + 8;
        f.lab1.x = i + 8;
        f.lab2.x = i + 8;
      }
    }

    // Plots: the level values, na on the bar where the 0.000 level changes
    const ch = levels[1].y2 - prev0;
    hidden[i] = !Number.isNaN(ch) && Math.abs(ch) > EPS;
    for (let k = 0; k < 9; k++) {
      raw[k][i] = levels[k].y2;
      plotVals[k][i] = hidden[i] ? NaN : levels[k].y2;
    }
    prev0 = levels[1].y2;

    if (cfg.showBreaks && prevActive) {
      if (brokeU && !Number.isNaN(high) && high !== 0) {
        markers.push({ time: bars[i].time as number, position: 'aboveBar', shape: 'labelDown', color: '#089981', size: 'tiny' });
      }
      if (brokeD && !Number.isNaN(low) && low !== 0) {
        markers.push({ time: bars[i].time as number, position: 'belowBar', shape: 'labelUp', color: '#f23645', size: 'tiny' });
      }
    }
    prevActive = f.active;
  }

  // Gradient fills: fill(p1, p2, top_value, bottom_value, top_color, bottom_color)
  const clear = String(color.new(backgroundColorOf(chart), 100));
  const [vN, v0, v236, v382, v500, v618, v764, v1, v1382] = raw;
  const at = (fn: (i: number) => number): number[] => bars.map((_, i) => (hidden[i] || !fl ? NaN : fn(i)));
  const all = (fn: (i: number) => number): number[] => bars.map((_, i) => fn(i));
  const cols = (css: string) => new Array<string>(n).fill(css);
  const grad = (plot1: string, plot2: string, topValue: number[], bottomValue: number[], top: string, bottom: string) => ({
    plot1, plot2, gradient: { topValue, bottomValue, topColor: cols(top), bottomColor: cols(bottom) },
  });
  const fills = [
    grad('plot0', 'plot1', at((i) => v0[i]), all((i) => avg(vN[i], v0[i])), F0, clear),
    grad('plot0', 'plot1', at((i) => vN[i]), all((i) => avg(vN[i], v0[i])), F0, clear),
    grad('plot2', 'plot3', at((i) => v236[i]), all((i) => avg(v382[i], avg(v382[i], v236[i]))), F_, clear),
    grad('plot2', 'plot3', at((i) => avg(v236[i], avg(v382[i], v236[i]))), all((i) => v382[i]), clear, F_),
    grad('plot3', 'plot4', at((i) => v382[i]), all((i) => v500[i]), clear, Fm),
    grad('plot4', 'plot5', at((i) => v500[i]), all((i) => v618[i]), Fm, clear),
    grad('plot5', 'plot6', at((i) => v764[i]), all((i) => avg(v618[i], avg(v618[i], v764[i]))), Fp, clear),
    grad('plot5', 'plot6', at((i) => avg(v764[i], avg(v618[i], v764[i]))), all((i) => v618[i]), clear, Fp),
    grad('plot7', 'plot8', at((i) => v1[i]), all((i) => avg(v1382[i], v1[i])), F1, clear),
    grad('plot7', 'plot8', at((i) => v1382[i]), all((i) => avg(v1382[i], v1[i])), F1, clear),
  ];

  // Drawings alive after the last bar; an object with an na coordinate is not drawn
  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const drawn = (l: Ln) => ![l.x1, l.y1, l.x2, l.y2].some((v) => Number.isNaN(v));
  const toLine = (l: Ln): LineDrawingData => ({
    time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color, ...(l.dashed ? { style: 'dashed' as const } : {}),
  });
  const toLabel = (l: Lb): LabelData => ({
    time: T(l.x), price: l.y, text: '', color: GRAY, textColor: LABEL_TEXT, style: l.style, size: l.size,
  });
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const linefills: LinefillData[] = [];
  if (n > 0) {
    for (const l of levels) if (drawn(l)) lines.push(toLine(l));
    if (drawn(f.diagon)) lines.push(toLine(f.diagon));
    for (const l of [f.lab1, f.lab2]) if (!Number.isNaN(l.x) && !Number.isNaN(l.y)) labels.push(toLabel(l));
    const pairs: Array<[Ln, Ln, string]> = [[l0_1, l0_2, F0], [lM01, lM02, F_], [lM11, lM12, Fp], [l1_1, l1_2, F1]];
    for (const [a, b, css] of pairs) {
      if (drawn(a)) lines.push(toLine(a));
      if (drawn(b)) lines.push(toLine(b));
      if (drawn(a) && drawn(b)) linefills.push({ line1: toLine(a), line2: toLine(b), color: String(color.new(css, 75)) });
    }
    if (drawn(ln_0_5)) lines.push(toLine(ln_0_5));
    if (drawn(lastDiagon)) lines.push(toLine(lastDiagon));
    if (!Number.isNaN(lastLab.x) && !Number.isNaN(lastLab.y)) labels.push(toLabel(lastLab));
  }

  const plots: Record<string, Array<{ time: number; value: number }>> = {};
  for (let k = 0; k < 9; k++) plots[`plot${k}`] = bars.map((b, i) => ({ time: b.time as number, value: plotVals[k][i] }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    lines,
    labels,
    linefills,
  };
}

export const FibonacciRanges = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
