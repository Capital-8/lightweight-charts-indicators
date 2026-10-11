/**
 * Trading ABC
 *
 * ABC corrections inside a trend, read from a zigzag and a cloud of six moving averages.
 * - Trend cloud: four SMAs and two EMAs of the source. The averages above the candle body and those below it are
 *   counted. Only averages below the body on two bars in a row: up trend. Only averages above the body on two bars
 *   in a row: down trend. The cloud is the area between the highest and the lowest of the averages on that side.
 * - Zigzag: a bar is a pivot high when its high is the highest of the last "ZigZag Period" bars, a pivot low when
 *   its low is the lowest. The direction follows the last pivot; a new direction adds a point, the same direction
 *   moves the last point. The last five points are kept.
 * - The last two zigzag legs are drawn as dashed lines, with two dashed lines for the retracement range of the
 *   Fibonacci minimum and maximum (with the error rate).
 * - ABC: when the last zigzag point moves on a pivot against the trend (a pivot low in an up trend below the highest
 *   average, a pivot high in a down trend above the lowest average) and the retracement of the last leg is between
 *   the Fibonacci minimum and maximum, the two legs are drawn with the labels A, B and C.
 * - Signal: within 6 bars of an ABC, a candle in the trend direction that touches an average and closes on the
 *   trend side of it, while the price has not passed the last zigzag point: a triangle below (long) or above (short)
 *   the bar.
 *
 * Drawings are kept up to 500 lines and 500 labels (the oldest are removed).
 *
 * Reference: "Trading ABC" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import {
  ta, array, callsite, getSourceSeries, Series,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface TradingAbcInputs {
  /** ZigZag Period */
  prd: number;
  /** Fibonacci Max */
  fiboup: number;
  /** Fibonacci Min */
  fibodn: number;
  /** Error Rate (%) */
  errorrate: number;
  showabc: boolean;
  /** Keep Old ABCs */
  keepabc: boolean;
  showcloud: boolean;
  /** Cloud colour of an up trend */
  cUpcol: string;
  /** Cloud colour of a down trend */
  cDncol: string;
  /** Show Zig Zag & Fibo */
  showzigzag: boolean;
  upcol: string;
  dncol: string;
  /** Source for Moving Averages */
  srcma: SourceType;
  malen1: number;
  malen2: number;
  malen3: number;
  malen4: number;
  malen5: number;
  malen6: number;
}

export const defaultInputs: TradingAbcInputs = {
  prd: 8,
  fiboup: 0.618,
  fibodn: 0.382,
  errorrate: 5.0,
  showabc: true,
  keepabc: true,
  showcloud: true,
  cUpcol: 'rgba(0, 230, 118, 0.25)',
  cDncol: 'rgba(255, 82, 82, 0.25)',
  showzigzag: true,
  upcol: '#00E676',
  dncol: '#FF5252',
  srcma: 'close',
  malen1: 50,
  malen2: 100,
  malen3: 150,
  malen4: 200,
  malen5: 20,
  malen6: 40,
};

export const inputConfig: InputConfig[] = [
  { id: 'prd', type: 'int', title: 'ZigZag Period', defval: 8, min: 2, max: 50, group: 'Setup' },
  { id: 'fiboup', type: 'float', title: 'Fibonacci Max', defval: 0.618, group: 'Setup' },
  { id: 'fibodn', type: 'float', title: 'Fibonacci Min', defval: 0.382, group: 'Setup' },
  { id: 'errorrate', type: 'float', title: 'Error Rate', defval: 5.0, min: 0, max: 30, group: 'Setup' },
  { id: 'showabc', type: 'bool', title: 'Show ABC', defval: true, group: 'Extras' },
  { id: 'keepabc', type: 'bool', title: 'Keep Old ABCs', defval: true, group: 'Extras' },
  { id: 'showcloud', type: 'bool', title: 'Show Cloud', defval: true, group: 'Extras', inline: 'cloud' },
  { id: 'cUpcol', type: 'color', title: '', defval: 'rgba(0, 230, 118, 0.25)', group: 'Extras', inline: 'cloud' },
  { id: 'cDncol', type: 'color', title: '', defval: 'rgba(255, 82, 82, 0.25)', group: 'Extras', inline: 'cloud' },
  { id: 'showzigzag', type: 'bool', title: 'Show Zig Zag & Fibo', defval: true, group: 'Extras', inline: 'zigzag' },
  { id: 'upcol', type: 'color', title: '', defval: '#00E676', group: 'Extras', inline: 'zigzag' },
  { id: 'dncol', type: 'color', title: '', defval: '#FF5252', group: 'Extras', inline: 'zigzag' },
  { id: 'srcma', type: 'source', title: 'Source for Moving Averages', defval: 'close', group: 'Trend Cloud' },
  { id: 'malen1', type: 'int', title: 'SMA 1 Length', defval: 50, min: 1, group: 'Trend Cloud' },
  { id: 'malen2', type: 'int', title: 'SMA 2 Length', defval: 100, min: 1, group: 'Trend Cloud' },
  { id: 'malen3', type: 'int', title: 'SMA 3 Length', defval: 150, min: 1, group: 'Trend Cloud' },
  { id: 'malen4', type: 'int', title: 'SMA 4 Length', defval: 200, min: 1, group: 'Trend Cloud' },
  { id: 'malen5', type: 'int', title: 'EMA 1 Length', defval: 20, min: 1, group: 'Trend Cloud' },
  { id: 'malen6', type: 'int', title: 'EMA 2 Length', defval: 40, min: 1, group: 'Trend Cloud' },
];

export const plotConfig: PlotConfig[] = [
  // plot(umax, color = na), plot(umin, color = na), plot(lmax, color = na), plot(lmin, color = na)
  { id: 'plot0', title: 'Upper Cloud Max', color: 'transparent', lineWidth: 1 },
  { id: 'plot1', title: 'Upper Cloud Min', color: 'transparent', lineWidth: 1 },
  { id: 'plot2', title: 'Lower Cloud Max', color: 'transparent', lineWidth: 1 },
  { id: 'plot3', title: 'Lower Cloud Min', color: 'transparent', lineWidth: 1 },
];

export const metadata = {
  title: 'Trading ABC',
  shortTitle: 'Trading ABC',
  overlay: true,
};

/** study(max_lines_count = 500, max_labels_count = 500) */
const MAX_COUNT = 500;
/** var max_array_size = 10 */
const MAX_ARRAY_SIZE = 10;
/** color.blue of this Pine version */
const BLUE = '#2196F3';
/** color.new(color.white, 100) */
const NO_COLOR = 'rgba(255, 255, 255, 0)';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** A number read as a condition: na and 0 are false */
const truthy = (x: number) => !isNaN(x) && Math.abs(x) > EPS;

interface Ln {
  x1: number; y1: number; x2: number; y2: number;
  color: string; width: number; style?: 'dashed'; extend?: 'right'; dead: boolean;
}
interface Lb { x: number; y: number; text: string; style: 'label_down' | 'label_up'; dead: boolean }

/** Live drawings of one kind: above max + 5 objects the oldest are deleted until max remain */
class Live<T extends { dead: boolean }> {
  readonly list: T[] = [];
  add(o: T): T {
    this.list.push(o);
    if (this.list.length > MAX_COUNT + 5) for (const old of this.list.splice(0, this.list.length - MAX_COUNT)) old.dead = true;
    return o;
  }
  /** line.delete / label.delete (na or an object already deleted: nothing) */
  remove(o: T | null | undefined): void {
    if (!o || o.dead) return;
    o.dead = true;
    this.list.splice(this.list.indexOf(o), 1);
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TradingAbcInputs> = {},
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const errorrate = cfg.errorrate / 100;
  const { fiboup, fibodn, upcol, dncol } = cfg;

  const src = getSourceSeries(bars, cfg.srcma);
  const mas = [
    A(ta.sma(src, cfg.malen1)), A(ta.sma(src, cfg.malen2)), A(ta.sma(src, cfg.malen3)), A(ta.sma(src, cfg.malen4)),
    A(ta.ema(src, cfg.malen5)), A(ta.ema(src, cfg.malen6)),
  ];
  const hb = A(ta.highestbars(new Series(bars, (b) => b.high), cfg.prd));
  const lb = A(ta.lowestbars(new Series(bars, (b) => b.low), cfg.prd));

  const umaxArr: number[] = new Array(n);
  const uminArr: number[] = new Array(n);
  const lmaxArr: number[] = new Array(n);
  const lminArr: number[] = new Array(n);
  const upFill: string[] = new Array(n);
  const dnFill: string[] = new Array(n);
  const markers: MarkerData[] = [];

  const lines = new Live<Ln>();
  const labels = new Live<Lb>();

  let trend = 0;
  let prevLower = NaN;
  let prevUpper = NaN;
  let dir = 0;
  let prevDir = NaN;
  const zigzag: number[] = [];
  let prevZchange = NaN;
  let zzline1: Ln | null = null;
  let zzline2: Ln | null = null;
  let fibo1: Ln | null = null;
  let fibo2: Ln | null = null;
  // var abclines = array.new_line(2), var abclabels = array.new_label(3)
  const abclines: Array<Ln | null> = [null, null];
  const abclabels: Array<Lb | null> = [null, null, null];
  let lastZzPoint = 0;
  let abcBarCount = 0;
  const highestSite = callsite.highest();
  const lowestSite = callsite.lowest();

  const addToZigzag = (value: number, bindex: number) => {
    zigzag.unshift(bindex);
    zigzag.unshift(value);
    if (zigzag.length > MAX_ARRAY_SIZE) {
      zigzag.pop();
      zigzag.pop();
    }
  };

  for (let i = 0; i < n; i++) {
    const { open, high, low, close } = bars[i];
    const ma = mas.map((m) => m[i]);
    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);

    // Averages above and below the candle body
    let umax = NaN;
    let umin = NaN;
    let lmax = NaN;
    let lmin = NaN;
    let upper = 0;
    let lower = 0;
    for (const m of ma) {
      if (ge(m, bodyTop)) {
        upper++;
        umax = isNaN(umax) ? m : Math.max(umax, m);
        umin = isNaN(umin) ? m : Math.min(umin, m);
      } else if (le(m, bodyBottom)) {
        lower++;
        lmax = isNaN(lmax) ? m : Math.max(lmax, m);
        lmin = isNaN(lmin) ? m : Math.min(lmin, m);
      }
    }
    if (lower > 0 && upper === 0 && prevLower > 0 && prevUpper === 0) trend = 1;
    else if (lower === 0 && upper > 0 && prevLower === 0 && prevUpper > 0) trend = -1;
    prevLower = lower;
    prevUpper = upper;

    umaxArr[i] = umax;
    uminArr[i] = umin;
    lmaxArr[i] = lmax;
    lminArr[i] = lmin;
    // fill(..., color = showcloud ? tdcolor : na), fill(..., color = showcloud ? tucolor : na)
    dnFill[i] = cfg.showcloud && trend === -1 ? cfg.cDncol : 'transparent';
    upFill[i] = cfg.showcloud && trend === 1 ? cfg.cUpcol : 'transparent';

    // Zigzag
    const ph = hb[i] === 0 ? high : NaN;
    const pl = lb[i] === 0 ? low : NaN;
    if (truthy(ph) && isNaN(pl)) dir = 1;
    else if (truthy(pl) && isNaN(ph)) dir = -1;
    const dirChanged = truthy(dir - prevDir);
    prevDir = dir;
    if (truthy(ph) || truthy(pl)) {
      const value = dir === 1 ? ph : pl;
      if (dirChanged) {
        addToZigzag(value, i);
      } else if (zigzag.length === 0) {
        addToZigzag(value, i);
      } else if ((dir === 1 && gt(value, zigzag[0])) || (dir === -1 && lt(value, zigzag[0]))) {
        zigzag[0] = value;
        zigzag[1] = i;
      }
    }

    if (cfg.showzigzag && zigzag.length > 5) {
      lines.remove(zzline1);
      lines.remove(zzline2);
      zzline1 = lines.add({
        x1: Math.round(zigzag[1]), y1: zigzag[0], x2: Math.round(zigzag[3]), y2: zigzag[2],
        color: dir === 1 ? upcol : dncol, width: 2, style: 'dashed', dead: false,
      });
      zzline2 = lines.add({
        x1: Math.round(zigzag[3]), y1: zigzag[2], x2: Math.round(zigzag[5]), y2: zigzag[4],
        color: dir === -1 ? upcol : dncol, width: 2, style: 'dashed', dead: false,
      });
      // Retracement range of the Fibonacci minimum and maximum
      const zzlen = Math.abs(zigzag[2] - zigzag[4]);
      const fmin = dir === 1 ? zigzag[2] + zzlen * (fibodn - errorrate) : zigzag[4] + zzlen * (1 - fibodn + errorrate);
      const fmax = dir === 1 ? zigzag[2] + zzlen * (fiboup + errorrate) : zigzag[4] + zzlen * (1 - fiboup - errorrate);
      lines.remove(fibo1);
      lines.remove(fibo2);
      const x = Math.round(zigzag[3]);
      fibo1 = lines.add({ x1: x, y1: fmin, x2: x + 1, y2: fmin, color: BLUE, width: 1, style: 'dashed', extend: 'right', dead: false });
      fibo2 = lines.add({ x1: x, y1: fmax, x2: x + 1, y2: fmax, color: BLUE, width: 1, style: 'dashed', extend: 'right', dead: false });
    }

    // ABC
    const zchange = zigzag.length > 0 ? zigzag[0] : 0.0;
    const zchanged = truthy(zchange - prevZchange);
    prevZchange = zchange;
    const abc: number[] = [];
    if (zchanged && zigzag.length > 5
      && ((truthy(pl) && trend === 1 && dir === -1 && lt(low, array.max(ma)))
        || (truthy(ph) && trend === -1 && dir === 1 && gt(high, array.min(ma))))) {
      const a = zigzag[0];
      const b = zigzag[2];
      const c = zigzag[4];
      const rate = (a - b) / (c - b);
      if (ge(rate, fibodn - fibodn * errorrate) && le(rate, fiboup + fiboup * errorrate)) abc.push(b, zigzag[3], c, zigzag[5]);
    }

    if (cfg.showabc && abc.length >= 4) {
      if (!cfg.keepabc) {
        lines.remove(abclines.pop());
        lines.remove(abclines.pop());
        labels.remove(abclabels.pop());
        labels.remove(abclabels.pop());
        labels.remove(abclabels.pop());
      }
      const x2 = Math.round(abc[1]);
      const x3 = Math.round(abc[3]);
      const l1 = lines.add({ x1: i, y1: zigzag[0], x2, y2: abc[0], color: dir === 1 ? upcol : dncol, width: 2, dead: false });
      const l2 = lines.add({ x1: x2, y1: abc[0], x2: x3, y2: abc[2], color: dir === 1 ? dncol : upcol, width: 2, dead: false });
      abclines.unshift(l1);
      abclines.unshift(l2);
      const la1 = labels.add({ x: i, y: zigzag[0], text: 'C', style: dir === 1 ? 'label_down' : 'label_up', dead: false });
      const la2 = labels.add({ x: x2, y: abc[0], text: 'B', style: dir === -1 ? 'label_down' : 'label_up', dead: false });
      const la3 = labels.add({ x: x3, y: abc[2], text: 'A', style: dir === 1 ? 'label_down' : 'label_up', dead: false });
      abclabels.unshift(la1);
      abclabels.unshift(la2);
      abclabels.unshift(la3);
    }

    // Bounce on an average
    let lbounced = false;
    let sbounced = false;
    const prevLow = i > 0 ? bars[i - 1].low : NaN;
    const prevHigh = i > 0 ? bars[i - 1].high : NaN;
    for (const m of ma) {
      if (le(Math.min(low, prevLow), m) && gt(close, m) && gt(close, open)) lbounced = true;
      if (ge(Math.max(high, prevHigh), m) && lt(close, m) && lt(close, open)) sbounced = true;
    }

    const thereIsAbc = abc.length !== 0;
    if (zigzag.length > 2 && thereIsAbc) lastZzPoint = zigzag[0];
    abcBarCount = thereIsAbc ? 0 : abcBarCount + 1;
    // highest(abc_bar_count + 1), lowest(abc_bar_count + 1): a length that changes on each bar
    const hhh = highestSite(high, abcBarCount + 1);
    const lll = lowestSite(low, abcBarCount + 1);

    const long = trend === 1 && abcBarCount <= 6 && lbounced && ge(lll, lastZzPoint);
    const short = trend === -1 && abcBarCount <= 6 && sbounced && le(hhh, lastZzPoint);
    if (long) markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: upcol, size: 'small' });
    if (short) markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: dncol, size: 'small' });
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const P = (values: number[]) => bars.map((b, i) => ({ time: b.time, value: values[i] }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: P(umaxArr), plot1: P(uminArr), plot2: P(lmaxArr), plot3: P(lminArr) },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', colors: dnFill },
      { plot1: 'plot2', plot2: 'plot3', colors: upFill },
    ],
    markers,
    lines: lines.list.map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color, width: l.width,
      ...(l.style ? { style: l.style } : {}),
      ...(l.extend ? { extend: l.extend } : {}),
    })),
    labels: labels.list.map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: NO_COLOR, textColor: BLUE, style: l.style,
    })),
  };
}

export const TradingAbc = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
