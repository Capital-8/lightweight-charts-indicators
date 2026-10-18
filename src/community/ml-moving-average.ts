/**
 * Machine Learning Moving Average [LuxAlgo]
 *
 * Gaussian Process Regression end point estimate, as the original computes it: an RBF kernel (length scale =
 * window) over the training points 0..window-1, Ktrain = K(xtrain, xtrain) + sigma^2 * I, its pseudo-inverse, and
 * K_row = (K(xtrain, xtest)^T * Ktrain^-1).row(window + forecast - 1). On each bar after `window`:
 * out = sum(K_row[i] * (src[window - 1 - i] - sma(src, window))) + sma(src, window).
 * Bands: out +- sma(abs(src - out), window) * mult (invisible plots, the fills' edges). os = 1 when close is above the
 * upper band with out rising, 0 when below the lower band with out falling, else kept; the 'Circle' plot (style
 * circles, width 3) marks the bars where os changes.
 *
 * Reference: "Machine Learning Moving Average [LuxAlgo]"
 */

import { getSourceSeries, ta, Series, color, matrix, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';

export interface MlMovingAverageInputs {
  window: number;
  forecast: number;
  sigma: number;
  mult: number;
  src: SourceType;
  upCss: string;
  dnCss: string;
  bullCss: string;
  bearCss: string;
}

const UP_CSS = String(color.new('#5b9cf6', 50));
const DN_CSS = String(color.new('#e91e63', 50));

export const defaultInputs: MlMovingAverageInputs = {
  window: 100,
  forecast: 0,
  sigma: 0.01,
  mult: 2,
  src: 'close',
  upCss: UP_CSS,
  dnCss: DN_CSS,
  bullCss: '#3179f5',
  bearCss: '#e91e63',
};

export const inputConfig: InputConfig[] = [
  { id: 'window', type: 'int', title: 'Window', defval: 100, min: 0 },
  { id: 'forecast', type: 'int', title: 'Forecast', defval: 0 },
  { id: 'sigma', type: 'float', title: 'Sigma', defval: 0.01, min: 0, step: 0.1 },
  { id: 'mult', type: 'float', title: 'Multiplicative Factor', defval: 2, min: 0 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'upCss', type: 'color', title: 'Upper Extremity', defval: UP_CSS, group: 'Style' },
  { id: 'dnCss', type: 'color', title: 'Lower Extremity', defval: DN_CSS, group: 'Style' },
  { id: 'bullCss', type: 'color', title: 'Moving Average', defval: '#3179f5', inline: 'ma', group: 'Style' },
  { id: 'bearCss', type: 'color', title: '', defval: '#e91e63', inline: 'ma', group: 'Style' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'End Point GPR', color: '#3179f5', lineWidth: 1 },
  { id: 'circle', title: 'Circle', color: '#3179f5', lineWidth: 3, style: 'circles' },
  // plot(upper, 'Upper', color = na) / plot(lower, 'Lower', color = na): the fills' edges, not drawn
  { id: 'plot1', title: 'Upper', color: 'transparent', lineWidth: 1 },
  { id: 'plot2', title: 'Lower', color: 'transparent', lineWidth: 1 },
];

export const metadata = {
  title: 'ML Moving Average',
  shortTitle: 'MLMA',
  overlay: true,
};

type PineMatrix = ReturnType<typeof matrix.new_matrix<number>>;

/** kernel_matrix(X1, X2, l): exp(-(x1 - x2)^2 / (2 * l^2)) */
function kernelMatrix(x1: number[], x2: number[], l: number): PineMatrix {
  const km = matrix.new_matrix<number>(x1.length, x2.length, NaN);
  x1.forEach((a, i) => x2.forEach((b, j) => matrix.set(km, i, j, Math.exp(-Math.pow(a - b, 2) / (2.0 * Math.pow(l, 2))))));
  return km;
}

/** The original's barstate.isfirst kernel setup: K_row (window values), or null when the setup has no such row */
export function gprKernelRow(window: number, forecast: number, sigma: number): number[] | null {
  if (window < 1 || window + forecast < 1) return null;
  const xtrain = Array.from({ length: window }, (_, i) => i);
  const xtest = Array.from({ length: window + forecast }, (_, i) => i);
  const identity = matrix.new_matrix<number>(window, window, 0);
  for (let i = 0; i < window; i++) matrix.set(identity, i, i, 1);
  const s = matrix.mult(identity, sigma * sigma) as PineMatrix;
  const kTrain = matrix.sum(kernelMatrix(xtrain, xtrain, window), s);
  const kInv = matrix.pinv(kTrain);
  const kStar = kernelMatrix(xtrain, xtest, window);
  const prod = matrix.mult(matrix.transpose(kStar), kInv) as PineMatrix;
  const r = window + forecast - 1;
  return Array.from({ length: window }, (_, i) => matrix.get(prod, r, i));
}

export function calculate(bars: Bar[], inputs: Partial<MlMovingAverageInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const win = cfg.window;
  const n = bars.length;
  const srcArr = getSourceSeries(bars, cfg.src).toArray();

  const kRow = gprKernelRow(win, cfg.forecast, cfg.sigma);
  const meanArr = win >= 1 ? ta.sma(Series.fromArray(bars, srcArr), win).toArray() : new Array<number>(n).fill(NaN);

  // float out = na; if bar_index > window: out := dotprod + mean
  const out: number[] = new Array(n).fill(NaN);
  if (kRow) {
    for (let t = win + 1; t < n; t++) {
      const mean = meanArr[t];
      let dot = 0;
      for (let i = 0; i < win; i++) dot += kRow[i] * (srcArr[t - (win - 1 - i)] - mean);
      out[t] = dot + mean;
    }
  }

  // mae = ta.sma(math.abs(src - out), window) * mult
  const maeArr = win >= 1
    ? ta.sma(Series.fromArray(bars, srcArr.map((v, t) => Math.abs(v - out[t]))), win).toArray().map((v) => v * cfg.mult)
    : new Array<number>(n).fill(NaN);
  const upper = out.map((v, t) => v + maeArr[t]);
  const lower = out.map((v, t) => v - maeArr[t]);

  // var os = 0; os := close > upper and out > out[1] ? 1 : close < lower and out < out[1] ? 0 : os
  const os: number[] = new Array(n).fill(0);
  let state = 0;
  for (let t = 0; t < n; t++) {
    const c = bars[t].close;
    const prev = t > 0 ? out[t - 1] : NaN;
    if (c > upper[t] && out[t] > prev) state = 1;
    else if (c < lower[t] && out[t] < prev) state = 0;
    os[t] = state;
  }

  const css = (t: number) => (os[t] ? cfg.bullCss : cfg.bearCss);
  const plot0 = out.map((v, t) => ({ time: bars[t].time, value: v, color: css(t) }));
  // plot(os != os[1] ? out : na, 'Circle', os ? bullCss : bearCss, 3, plot.style_circles)
  const circle = out.map((v, t) => ({
    time: bars[t].time,
    value: t > 0 && os[t] !== os[t - 1] ? v : NaN,
    color: css(t),
  }));
  const plot1 = upper.map((v, t) => ({ time: bars[t].time, value: v }));
  const plot2 = lower.map((v, t) => ({ time: bars[t].time, value: v }));

  //   fill(plot_upper, plot_out, out + mae, out, upCss, color.new(chart.bg_color, 100))
  //   fill(plot_out, plot_lower, out, out - mae, color.new(chart.bg_color, 100), dnCss)
  const bgTransparent = '#00000000';
  const constant = <T>(v: T): T[] => new Array(n).fill(v);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'circle': circle, 'plot1': plot1, 'plot2': plot2 },
    fills: [
      {
        plot1: 'plot1', plot2: 'plot0',
        gradient: { topValue: upper, bottomValue: out, topColor: constant(cfg.upCss), bottomColor: constant(bgTransparent) },
      },
      {
        plot1: 'plot0', plot2: 'plot2',
        gradient: { topValue: out, bottomValue: lower, topColor: constant(bgTransparent), bottomColor: constant(cfg.dnCss) },
      },
    ],
  };
}

export const MlMovingAverage = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
