/**
 * Multi Kernel Regression [ChartPrime]
 *
 * A kernel regression of the source with a choice of 17 kernels (Laplace by default) and a bandwidth.
 *
 * "Repaint" on (default): on the last bar, the estimate of each of the last 500 bars is the weighted mean of the last
 * 500 source values, with the kernel of the distance in bars as weight (divided by the sum of the 500 weights of that
 * bar). The estimates are drawn as line segments (width 3), coloured by their direction, optionally with two
 * deviation lines at "Deviation" weighted standard deviations. "Up" / "Down" labels mark the bars where the direction
 * of the estimate turns. The labels are removed when the last bar is closed, so they only show while it is still
 * open (chart context; without one the last bar is taken as closed).
 * At most 500 lines and 500 labels are kept. The script creates more than that on the first bar, so only the newest
 * survive: the turn labels of about the last 250 bars, and with the deviation lines on, the lines of about the last
 * 166 bars.
 *
 * "Repaint" off: a one-sided weighted mean of the last "Bandwidth" source values (weight: the kernel of
 * (i / bandwidth) squared), plotted with the direction colour, with two bands at "Deviation" times the root mean
 * square distance between the source and the mean, and "Up" / "Down" labels where the direction turns.
 *
 * Reference: "Multi Kernel Regression [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { LabelData, LineDrawingData, PineSize } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

const KERNELS = [
  'Triangular', 'Gaussian', 'Epanechnikov', 'Logistic', 'Log Logistic', 'Cosine', 'Sinc', 'Laplace', 'Quartic',
  'Parabolic', 'Exponential', 'Silverman', 'Cauchy', 'Tent', 'Wave', 'Power', 'Morters',
];

export interface MultiKernelRegressionInputs {
  /** Estimates of the last 500 bars drawn on the last bar (true) or a one-sided mean plotted on every bar (false) */
  repaint: boolean;
  kernel: string;
  bandwidth: number;
  source: SourceType;
  deviations: number;
  style: 'Solid' | 'Dotted' | 'Dashed';
  /** Show the deviation lines / bands */
  enable: boolean;
  labelSize: 'Auto' | 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  labels: boolean;
  bullishColor: string;
  bearishColor: string;
  textColor: string;
}

export const defaultInputs: MultiKernelRegressionInputs = {
  repaint: true,
  kernel: 'Laplace',
  bandwidth: 14,
  source: 'close',
  deviations: 2.0,
  style: 'Solid',
  enable: false,
  labelSize: 'Tiny',
  labels: true,
  bullishColor: '#54C294',
  bearishColor: '#EB3939',
  textColor: '#080C14',
};

export const inputConfig: InputConfig[] = [
  { id: 'repaint', type: 'bool', title: 'Repaint', defval: true },
  { id: 'kernel', type: 'string', title: 'Kernel Select', defval: 'Laplace', options: KERNELS },
  { id: 'bandwidth', type: 'int', title: 'Bandwidth', defval: 14, min: 1 },
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'deviations', type: 'float', title: 'Deviation', defval: 2.0, min: 0, max: 100, step: 0.25, inline: 'dev' },
  { id: 'style', type: 'string', title: 'Line Style', defval: 'Solid', options: ['Solid', 'Dotted', 'Dashed'] },
  { id: 'enable', type: 'bool', title: '', defval: false, inline: 'dev' },
  { id: 'labelSize', type: 'string', title: 'Labels', defval: 'Tiny', options: ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge'], inline: 'label' },
  { id: 'labels', type: 'bool', title: '', defval: true, inline: 'label' },
  { id: 'bullishColor', type: 'color', title: 'Colors', defval: '#54C294', inline: 'color' },
  { id: 'bearishColor', type: 'color', title: '', defval: '#EB3939', inline: 'color' },
  { id: 'textColor', type: 'color', title: '', defval: '#080C14', inline: 'color' },
];

// plot(..., display = enable ? display.all : display.none): PlotConfig `visible` = the input id
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Non Repaint MA', color: '#2962FF', lineWidth: 1 },
  { id: 'plot1', title: 'Non Repaint STDEV', color: '#2962FF', lineWidth: 1, visible: 'enable' },
  { id: 'plot2', title: 'Non Repaint STDEV', color: '#2962FF', lineWidth: 1, visible: 'enable' },
];

export const metadata = {
  title: 'Multi Kernel Regression [ChartPrime]',
  shortTitle: 'Multi Kernel Regression [ChartPrime]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** Bars of the repainting estimate */
const WINDOW = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);

const sq = (x: number) => math.pow(x, 2);

/** Kernel weight of a distance `x` for a bandwidth `bw` */
function kernelWeight(x: number, bw: number, kind: string): number {
  const u = x / bw;
  const inside = le(Math.abs(u), 1);
  switch (kind) {
    case 'Triangular':
    case 'Tent':
      return inside ? 1 - Math.abs(u) : 0.0;
    case 'Gaussian':
      return math.exp(-sq(u) / 2) / math.sqrt(2 * Math.PI);
    case 'Epanechnikov':
      return inside ? (3 / 4) * (1 - sq(u)) : 0.0;
    case 'Logistic':
      return 1 / (math.exp(u) + 2 + math.exp(-x / bw));
    case 'Log Logistic':
      return 1 / math.pow(1 + Math.abs(u), 2);
    case 'Cosine':
      return inside ? (Math.PI / 4) * math.cos((Math.PI / 2) * u) : 0.0;
    case 'Sinc':
      return Math.abs(x) <= EPS ? 1 : math.sin((Math.PI * x) / bw) / ((Math.PI * x) / bw);
    case 'Laplace':
      return (1 / (2 * bw)) * math.exp(-Math.abs(u));
    case 'Quartic':
      return inside ? (15 / 16) * math.pow(1 - sq(u), 2) : 0.0;
    case 'Parabolic':
      return inside ? 1 - math.pow(u, 2) : 0.0;
    case 'Exponential':
      return (1 / bw) * math.exp(-Math.abs(u));
    case 'Silverman':
      return le(Math.abs(u), 0.5) ? 0.5 * math.exp(-u / 2) * math.sin(u / 2 + Math.PI / 4) : 0.0;
    case 'Cauchy':
      return 1 / (Math.PI * bw * (1 + sq(u)));
    case 'Wave':
      return inside ? (1 - Math.abs(u)) * math.cos((Math.PI * x) / bw) : 0.0;
    case 'Power':
      return inside ? math.pow(1 - math.pow(Math.abs(u), 3), 3) : 0.0;
    case 'Morters':
      return le(Math.abs(u), Math.PI) ? (1 + math.cos(u)) / (2 * Math.PI * bw) : 0.0;
    default:
      return NaN;
  }
}

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
  up: boolean;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MultiKernelRegressionInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const bw = cfg.bandwidth;
  const src = getSourceSeries(bars, cfg.source).toArray().map((v) => v ?? NaN);
  const size = cfg.labelSize.toLowerCase() as PineSize;
  const lineStyle = cfg.style === 'Dotted' ? 'dotted' : cfg.style === 'Dashed' ? 'dashed' : 'solid';

  const nrpSum = new Array<number>(n).fill(NaN);
  const nrpStdev = new Array<number>(n).fill(NaN);
  const nrpColor: Array<string | null> = new Array(n).fill(null);

  // Drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain. A deleted object ignores later changes.
  const lineList: Ln[] = [];
  const labelList: Lb[] = [];
  const limit = <T extends { deleted: boolean }>(list: T[]): void => {
    if (list.length > MAX_OBJECTS + 5) for (const o of list.splice(0, list.length - MAX_OBJECTS)) o.deleted = true;
  };
  const newLine = (): Ln => {
    const l: Ln = { x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: '', deleted: false };
    lineList.push(l);
    limit(lineList);
    return l;
  };
  const newLabel = (x: number, y: number, up: boolean): Lb => {
    const l: Lb = { x, y, up, deleted: false };
    labelList.push(l);
    limit(labelList);
    return l;
  };

  if (n > 0) {
    // var arrays of the first bar: each filled with one empty object
    newLine();
    newLine();
    newLine();
    newLabel(NaN, NaN, true);
    newLabel(NaN, NaN, false);
  }

  if (!cfg.repaint) {
    // weights of the one-sided mean
    const weights: number[] = [];
    let sumw = 0;
    for (let i = 0; i <= bw - 1; i++) {
      const weight = kernelWeight(math.pow(i, 2) / math.pow(bw, 2), 1, cfg.kernel);
      weights.push(weight);
      sumw += weight;
    }
    for (let b = 0; b < n; b++) {
      let sum = 0.0;
      let sumsq = 0.0;
      for (let i = 0; i <= bw - 1; i++) {
        const v = b - i >= 0 ? src[b - i] : NaN;
        sum += (Number.isNaN(v) ? 0 : v) * weights[i];
      }
      nrpSum[b] = sum / sumw;
      const direction = gt(nrpSum[b] - (b > 0 ? nrpSum[b - 1] : NaN), 0);
      nrpColor[b] = direction ? cfg.bullishColor : cfg.bearishColor;
      for (let i = 0; i <= bw - 1; i++) {
        sumsq += b - i >= 0 ? math.pow(src[b - i] - nrpSum[b - i], 2) : NaN;
      }
      nrpStdev[b] = math.sqrt(sumsq / (bw - 1)) * cfg.deviations;
    }
    if (cfg.labels) {
      const S = (a: number[]) => Series.fromArray(bars, a);
      const prev = nrpSum.map((_, b) => (b > 0 ? nrpSum[b - 1] : NaN));
      const up = ta.crossover(S(nrpSum), S(prev)).toArray();
      const down = ta.crossunder(S(nrpSum), S(prev)).toArray();
      for (let b = 0; b < n; b++) {
        if (up[b]) newLabel(b, nrpSum[b], true);
        if (down[b]) newLabel(b, nrpSum[b], false);
      }
    }
  } else if (n > 0) {
    // first bar: one object per bar of the window
    const estimateArr: Ln[] = new Array(WINDOW);
    const upperArr: Array<Ln | null> = new Array(WINDOW).fill(null);
    const lowerArr: Array<Ln | null> = new Array(WINDOW).fill(null);
    const upLabels: Array<Lb | null> = new Array(WINDOW).fill(null);
    const downLabels: Array<Lb | null> = new Array(WINDOW).fill(null);
    for (let i = WINDOW - 1; i >= 0; i--) {
      estimateArr[i] = newLine();
      if (cfg.enable) {
        upperArr[i] = newLine();
        lowerArr[i] = newLine();
      }
      if (cfg.labels) {
        upLabels[i] = newLabel(NaN, NaN, true);
        downLabels[i] = newLabel(NaN, NaN, false);
      }
    }

    // last bar: the estimates
    const last = n - 1;
    const span = Math.min(last, WINDOW - 1);
    let previousPrice = NaN;
    let previousDelta = NaN;
    let upper1 = NaN;
    let lower1 = NaN;
    const setLine = (l: Ln | null, x1: number, y1: number, x2: number, y2: number, color: string): void => {
      if (!l || l.deleted) return;
      l.x1 = x1;
      l.y1 = y1;
      l.x2 = x2;
      l.y2 = y2;
      l.color = color;
    };
    for (let i = 0; i <= span; i++) {
      // weights of bar i: the kernel of the distance to each of the 500 bars, and their sum
      const w: number[] = new Array(WINDOW);
      let sumw = 0;
      for (let j = 0; j <= WINDOW - 1; j++) {
        w[j] = kernelWeight(i - j, bw, cfg.kernel);
        sumw += w[j];
      }
      let sum = 0;
      let sumsq = 0;
      for (let j = 0; j <= span; j++) {
        sum += src[last - j] * w[j];
        sumsq += sq(src[last - j]) * w[j];
      }
      const currentPrice = sum / sumw;
      const delta = currentPrice - previousPrice;
      let upper2 = NaN;
      let lower2 = NaN;
      if (cfg.enable) {
        // math.max is na when a value is na
        const stdDev = math.sqrt(Math.max(sumsq / sumw - sq(currentPrice), 0));
        upper2 = currentPrice + cfg.deviations * stdDev;
        lower2 = currentPrice - cfg.deviations * stdDev;
      }
      const lineColor = gt(currentPrice, previousPrice) ? cfg.bearishColor : cfg.bullishColor;
      setLine(estimateArr[i], last - i + 1, previousPrice, last - i, currentPrice, lineColor);
      if (cfg.enable) {
        setLine(upperArr[i], last - i + 1, upper1, last - i, upper2, lineColor);
        setLine(lowerArr[i], last - i + 1, lower1, last - i, lower2, lineColor);
      }
      if (cfg.labels) {
        const bullish = upLabels[i];
        const bearish = downLabels[i];
        if (gt(delta, 0) && lt(previousDelta, 0) && bullish && !bullish.deleted) {
          bullish.x = last - i + 1;
          bullish.y = src[last - i];
        }
        if (lt(delta, 0) && gt(previousDelta, 0) && bearish && !bearish.deleted) {
          bearish.x = last - i + 1;
          bearish.y = src[last - i];
        }
      }
      previousPrice = currentPrice;
      upper1 = upper2;
      lower1 = lower2;
      previousDelta = delta;
    }

    // a closed bar removes the labels: label.set_xy(na, na)
    if (lastBarConfirmedOf(chart)) {
      for (const l of [...upLabels, ...downLabels]) {
        if (l && !l.deleted) {
          l.x = NaN;
          l.y = NaN;
        }
      }
    }
  }

  // ── Output: the objects with coordinates (an object with an na coordinate is not drawn) ──
  const lines: LineDrawingData[] = lineList
    .filter((l) => !Number.isNaN(l.x1) && !Number.isNaN(l.y1) && !Number.isNaN(l.x2) && !Number.isNaN(l.y2))
    .map((l) => ({ time1: bars[l.x1].time, price1: l.y1, time2: bars[l.x2].time, price2: l.y2, color: l.color, width: 3, style: lineStyle }));
  const labels: LabelData[] = labelList
    .filter((l) => !Number.isNaN(l.x) && !Number.isNaN(l.y))
    .map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.up ? 'Up' : 'Down', color: l.up ? cfg.bullishColor : cfg.bearishColor,
      textColor: cfg.textColor, style: l.up ? ('label_up' as const) : ('label_down' as const), size,
      yloc: l.up ? ('belowbar' as const) : ('abovebar' as const), textAlign: 'center' as const,
    }));

  const P = (value: (i: number) => number) =>
    bars.map((bar, i) => ({ time: bar.time, value: value(i), ...(nrpColor[i] !== null ? { color: nrpColor[i] as string } : {}) }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P((i) => nrpSum[i]),
      plot1: P((i) => nrpSum[i] + nrpStdev[i]),
      plot2: P((i) => nrpSum[i] - nrpStdev[i]),
    },
    lines,
    labels,
  };
}

export const MultiKernelRegression = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
