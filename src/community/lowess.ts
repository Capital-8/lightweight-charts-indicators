/**
 * LOWESS (Locally Weighted Scatterplot Smoothing) [ChartPrime]
 *
 * Gaussian moving average adapted to the volatility, smoothed with a LOWESS weighting. For each bar the script walks
 * the last "Length" closes; at step i the running highest / lowest close of the steps so far are compared with the
 * highest / lowest of the window as it was i bars back (max of the two highs + min of the two lows), and these values
 * are averaged with Gaussian weights exp(-((i - (Length - 1)) / (2 sigma))^2 / 2), sigma = (ATR + standard deviation
 * of the close) / 2 over "Length" bars; the result is halved. The smoothed line is the tricube weighted average
 * (1 - (i / 10)^3)^3 of the last 10 values of that average, plus a small slope term. It is blue when above its value
 * 2 bars back and purple otherwise (thin line and a wide transparent line), and a diamond marks each cross of the two.
 *
 * Pivots (pivot high / low with "Length" bars on the left and Length - 2 on the right): a pivot high when the line is
 * blue starts a level at the pivot high with a diamond label; when the close crosses over the level, the level runs
 * to the bar of the cross and the label moves there (with the number of breaks in a row when "Count Breaks" is on).
 * Pivot lows when the line is purple, crosses under, the same way. At most 500 lines and 500 labels are kept.
 *
 * "Gaussian Scatterplot" draws the Gaussian average as crosses on every 4th bar with a random grey (math.random
 * without a seed): its colours cannot be the same as those of another run.
 *
 * Reference: "LOWESS (Locally Weighted Scatterplot Smoothing) [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import {
  ta, math, str, color, callsite, Series, line, label, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type Label,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, MarkerData } from '../types';

export interface LowessInputs {
  /** Length of the Gaussian average */
  length: number;
  /** Bars on the left of a pivot (the right side uses this value - 2) */
  leftBars: number;
  showCount: boolean;
  gaussianPlot: boolean;
}

export const defaultInputs: LowessInputs = {
  length: 30,
  leftBars: 5,
  showCount: false,
  gaussianPlot: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 30, min: 1, group: 'LOWESS (Locally Weighted Scatterplot Smoothing)' },
  { id: 'leftBars', type: 'int', title: 'Length', defval: 5, group: 'Pivots' },
  { id: 'showCount', type: 'bool', title: 'Count Breaks', defval: false, group: '===' },
  { id: 'gaussianPlot', type: 'bool', title: 'Gaussian Scatterplot', defval: false },
];

const COL_UP = '#60befd';
const COL_DN = '#ab61ff';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Gaussian Moving Average', color: '#2962ff', lineWidth: 1, style: 'cross' },
  { id: 'plot1', title: 'Gaussian Moving Average', color: COL_UP, lineWidth: 1 },
  { id: 'plot2', title: 'Gaussian Moving Average', color: String(color.new(COL_UP, 80)), lineWidth: 5 },
];

export const metadata = {
  title: 'LOWESS (Locally Weighted Scatterplot Smoothing) [ChartPrime]',
  shortTitle: 'Lowess & GaussianMA [ChartPrime]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** A float used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

export function calculate(
  bars: Bar[],
  inputs: Partial<LowessInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length = cfg.length;
  const leftBars = cfg.leftBars;
  const rightBars = leftBars - 2;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const close = bars.map((b) => b.close);
  const closeS = new Series(bars, (b) => b.close);

  const ph = A(ta.pivothigh(new Series(bars, (b) => b.high), leftBars, rightBars));
  const pl = A(ta.pivotlow(new Series(bars, (b) => b.low), leftBars, rightBars));

  // GaussianMA(close, length)
  const atr = A(ta.atr(bars, length));
  const sd = A(ta.stdev(closeS, length));
  // `highest` / `lowest` of the function at the end of each bar: max / min of the non-na closes of the window
  // (h_l starts with `length` na elements)
  const hiEnd: number[] = [];
  const loEnd: number[] = [];
  const gma: number[] = [];
  const pastOf = (x: number[], k: number, i: number) => (i - k >= 0 ? x[i - k] : NaN);
  for (let t = 0; t < n; t++) {
    const sigma = (atr[t] + sd[t]) / 2;
    let g = 0;
    let sumW = 0;
    let hi = NaN;
    let lo = NaN;
    for (let i = 0; i < length; i++) {
      const c = pastOf(close, i, t);
      // h_l.push(close[i]); highest := h_l.max(); lowest := h_l.min() (na elements skipped)
      if (!isNaN(c)) {
        hi = isNaN(hi) ? c : Math.max(hi, c);
        lo = isNaN(lo) ? c : Math.min(lo, c);
      }
      const weight = Math.exp(-Math.pow((i - (length - 1)) / (2 * sigma), 2) / 2);
      // highest[i] / lowest[i]: the value of the variable i bars back (the current value for i = 0)
      const hiPast = i === 0 ? hi : pastOf(hiEnd, i, t);
      const loPast = i === 0 ? lo : pastOf(loEnd, i, t);
      const value = Math.max(hiPast, hi) + Math.min(loPast, lo); // na when one side is na, as math.max / math.min
      g = g + value * weight;
      sumW += weight;
    }
    hiEnd.push(hi);
    loEnd.push(lo);
    gma.push(g / sumW / 2);
  }

  // smoothed = lowess(gma, 10)
  const smoothed: number[] = [];
  for (let t = 0; t < n; t++) {
    let sumW = 0;
    let sumWX = 0;
    let sumWY = 0;
    for (let i = 0; i < 10; i++) {
      const w = Math.pow(1 - Math.pow(i / 10, 3), 3);
      sumW += w;
      sumWX += w * i;
      sumWY += w * pastOf(gma, i, t);
    }
    const a = sumWY / sumW;
    const b = sumWX / sumW;
    smoothed.push(a + b / (10 - 1) / 2000);
  }

  const smoothedColor = smoothed.map((s, i) => {
    const s2 = pastOf(smoothed, 2, i);
    return gt(s, s2) ? COL_UP : le(s, s2) ? COL_DN : null;
  });

  resetDrawings({ line: 500, label: 500 });
  const lineH = varDrawing<Line>();
  const lineL = varDrawing<Line>();
  const lblH = varDrawing<Label>();
  const lblL = varDrawing<Label>();
  let countUp = 0;
  let countDn = 0;
  const crossH = callsite.crossover();
  const crossL = callsite.crossunder();
  const trendUp = callsite.crossover();
  const trendDn = callsite.crossunder();
  const markers: MarkerData[] = [];
  const plot0: Array<{ time: number; value: number; color?: string }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const sc = smoothedColor[i];
    // random1 = math.random(0, 255): drawn on every bar (the sequence of the run)
    const random1 = math.random(0, 255);
    const gmaColor = String(color.rgb(random1, random1, random1));
    plot0.push({ time: b.time, value: fin(gma[i]), color: i % 4 === 0 && cfg.gaussianPlot ? gmaColor : 'transparent' });
    plot1.push({ time: b.time, value: fin(smoothed[i]), color: sc ?? 'transparent' });
    // color.new(na, 80): black with transparency 80, as in Pine
    plot2.push({ time: b.time, value: fin(smoothed[i]), color: String(color.new(sc ?? NaN, 80)) });

    // pivot high when the line is blue
    if (sc === COL_UP && truthy(ph[i])) {
      const hi = bars[i - rightBars].high;
      lineH.value = line.new(i - rightBars, hi, i - rightBars, hi);
      lblH.value = label.new(NaN, hi, '⬥', 'bar_index', 'price', '#00000000', undefined, COL_UP, 'large');
    }
    const yH = lineH.value ? line.get_y1(lineH.value) : NaN;
    if (crossH(b.close, yH)) {
      countDn = 0;
      countUp += 1;
      line.set_x2(lineH.value!, i);
      line.set_color(lineH.value!, String(color.new(COL_UP, 30)));
      const lb = lblH.value!;
      label.set_x(lb, i);
      if (!cfg.showCount) label.set_style(lb, 'label_center');
      if (cfg.showCount) {
        label.set_y(lb, b.high);
        label.set_size(lb, 'normal');
        label.set_style(lb, 'label_down');
        label.set_text(lb, str.tostring(countUp));
      }
      lineH.value = undefined;
    }

    // pivot low when the line is purple
    if (sc === COL_DN && truthy(pl[i])) {
      const lo = bars[i - rightBars].low;
      lineL.value = line.new(i - rightBars, lo, i - rightBars, lo);
      lblL.value = label.new(NaN, lo, '⬥', 'bar_index', 'price', '#00000000', undefined, COL_DN, 'large');
    }
    const yL = lineL.value ? line.get_y1(lineL.value) : NaN;
    if (crossL(b.close, yL)) {
      countUp = 0;
      countDn += 1;
      line.set_x2(lineL.value!, i);
      line.set_color(lineL.value!, String(color.new(COL_DN, 30)));
      const lb = lblL.value!;
      label.set_x(lb, i);
      if (!cfg.showCount) label.set_style(lb, 'label_center');
      if (cfg.showCount) {
        label.set_y(lb, b.low);
        label.set_size(lb, 'normal');
        label.set_style(lb, 'label_up');
        label.set_text(lb, str.tostring(countDn));
      }
      lineL.value = undefined;
    }

    // plotshape(smoothed, shape.diamond, location.absolute, color = ta.crossover(smoothed, smoothed[2]) ? col_up :
    // ta.crossunder(smoothed, smoothed[2]) ? col_dn : na): the crossunder only runs when the crossover is false
    const s2 = pastOf(smoothed, 2, i);
    const up = trendUp(smoothed[i], s2);
    const dn = up ? false : trendDn(smoothed[i], s2);
    if ((up || dn) && Number.isFinite(smoothed[i])) {
      markers.push({ time: b.time, position: 'atPriceMiddle', price: smoothed[i], shape: 'diamond', color: up ? COL_UP : COL_DN, size: 'tiny' });
    }
  }
  setDrawingBar(null);
  const drawn = drawingOutputs(bars);
  resetDrawings();

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    markers,
    lines: drawn.lines ?? [],
    labels: drawn.labels ?? [],
  };
}

export const Lowess = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
