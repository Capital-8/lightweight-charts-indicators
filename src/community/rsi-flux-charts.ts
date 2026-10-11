/**
 * RSI (Kernel Optimized) | Flux Charts
 *
 * Learns at which RSI values the price made its pivots. The RSI of each pivot high and of each pivot low (the last
 * 301 of each side) goes into a kernel density estimate (Gaussian, uniform or sigmoid kernel) over twice the range of
 * the stored values, in "Nº Bins" steps per range. On the last 5,000 bars the current RSI is placed on both curves: the
 * high probability is the density summed up to the RSI, the low probability the density summed from the RSI on.
 *
 * A bar is bullish when the low probability is above (1 - threshold) of the whole low density, else bearish when the
 * high probability is above (1 - threshold) of the whole high density (threshold 0.4 / 0.25 / 0.15 for High / Medium
 * / Low). Outputs: a faint arrow on each bullish / bearish bar, a full arrow on the first bar after such a run
 * ("possible pivot") with a label giving the RSI and the probability (at most one label per side every 9 bars), and
 * a dashboard table with the RSI and the larger probability of the last bar. At most 500 labels are kept.
 *
 * The arrows are markers below (up) and above (down) the bars; the fixed arrow height of the original is not
 * ported. The debug options of the original (constant DEBUG = false) have no input and are left out.
 *
 * Chart context (optional third argument): the original draws arrows and labels on closed bars only. When the
 * context says that the last bar is still open (`lastBarConfirmed` false), the last bar has no arrow and no label
 * (the dashboard still shows its values). Without it every bar is a closed bar.
 *
 * Reference: "RSI (Kernel Optimized) | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Flux Charts®
 */

import { ta, array, str, color, getSourceSeries, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { LabelData, MarkerData, TableData, TableCellData, TablePosition } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface RsiFluxChartsInputs {
  rsiLength: number;
  rsiSource: SourceType;
  highPivotLen: number;
  lowPivotLen: number;
  /** Amount of arrows: High shows the most */
  activationThreshold: 'High' | 'Medium' | 'Low';
  kdeKernel: 'Uniform' | 'Gaussian' | 'Sigmoid';
  kdeBandwidth: number;
  /** Steps per range of the stored RSI values */
  kdeStep: number;
  tableEnabled: boolean;
  tableLocation: 'Top Right' | 'Top Center' | 'Right Center' | 'Middle Center' | 'Left Center' | 'Bottom Center';
  screenerColor: string;
  frameColor: string;
  borderColor: string;
  textColorDB: string;
  /** Not used by the original */
  fillBackgrounds: boolean;
  bearishColor: string;
  /** Not used by the original */
  neutralColor: string;
  bullishColor: string;
  textColor: string;
  rsiLabelsEnabled: boolean;
  kdeLabelsEnabled: boolean;
}

export const defaultInputs: RsiFluxChartsInputs = {
  rsiLength: 14,
  rsiSource: 'close',
  highPivotLen: 21,
  lowPivotLen: 21,
  activationThreshold: 'Medium',
  kdeKernel: 'Gaussian',
  kdeBandwidth: 2.71828,
  kdeStep: 100,
  tableEnabled: true,
  tableLocation: 'Top Right',
  screenerColor: '#1B1F2B',
  frameColor: '#FFFFFF',
  borderColor: '#FFFFFF',
  textColorDB: '#FFFFFF',
  fillBackgrounds: true,
  bearishColor: '#f23646',
  neutralColor: '#787B86',
  bullishColor: '#089981',
  textColor: '#FFFFFF',
  rsiLabelsEnabled: true,
  kdeLabelsEnabled: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1, group: 'RSI Settings' },
  { id: 'rsiSource', type: 'source', title: 'Source', defval: 'close', group: 'RSI Settings' },
  { id: 'highPivotLen', type: 'int', title: 'High Pivot Length', defval: 21, min: 1, group: 'Pivots' },
  { id: 'lowPivotLen', type: 'int', title: 'Low Pivot Length', defval: 21, min: 1, group: 'Pivots' },
  {
    id: 'activationThreshold', type: 'string', title: 'Activation Threshold', defval: 'Medium', options: ['High', 'Medium', 'Low'], group: 'KDE',
    tooltip: 'Determines the amount of arrows shown. Higher options will result in more arrows being rendered.',
  },
  {
    id: 'kdeKernel', type: 'string', title: 'Kernel', defval: 'Gaussian', options: ['Uniform', 'Gaussian', 'Sigmoid'], group: 'KDE',
    tooltip: 'The kernel function for KDE calculation. Gaussian is a commonly used kernel and is based on normal distribution.',
  },
  {
    id: 'kdeBandwidth', type: 'float', title: 'Bandwidth', defval: 2.71828, group: 'KDE',
    tooltip: 'This setting sets the smoothness of the KDE function output.',
  },
  {
    id: 'kdeStep', type: 'int', title: 'Nº Bins', defval: 100, min: 1, group: 'KDE',
    tooltip: 'The number of elements the KDE Probability array will have. Higher settings will result in greater precision.',
  },
  { id: 'tableEnabled', type: 'bool', title: 'Dashboard', defval: true, group: 'Dashboard' },
  {
    id: 'tableLocation', type: 'string', title: 'Position', defval: 'Top Right', group: 'Dashboard',
    options: ['Top Right', 'Top Center', 'Right Center', 'Middle Center', 'Left Center', 'Bottom Center'],
  },
  { id: 'screenerColor', type: 'color', title: 'Background', defval: '#1B1F2B', group: 'Dashboard' },
  { id: 'frameColor', type: 'color', title: 'Frame', defval: '#FFFFFF', group: 'Dashboard' },
  { id: 'borderColor', type: 'color', title: 'Border', defval: '#FFFFFF', group: 'Dashboard' },
  { id: 'textColorDB', type: 'color', title: 'Text', defval: '#FFFFFF', group: 'Dashboard' },
  { id: 'fillBackgrounds', type: 'bool', title: 'Fill Backgrounds', defval: true, group: 'Dashboard' },
  { id: 'bearishColor', type: 'color', title: 'High Pivots', defval: '#f23646', group: 'Style', inline: 'col' },
  { id: 'neutralColor', type: 'color', title: 'Neutral', defval: '#787B86', group: 'Style', inline: 'col' },
  { id: 'bullishColor', type: 'color', title: 'Low Pivots', defval: '#089981', group: 'Style', inline: 'col' },
  { id: 'textColor', type: 'color', title: 'Text', defval: '#FFFFFF', group: 'Style', inline: 'col' },
  { id: 'rsiLabelsEnabled', type: 'bool', title: 'RSI Labels', defval: true, group: 'Style' },
  { id: 'kdeLabelsEnabled', type: 'bool', title: 'KDE Labels', defval: true, group: 'Style' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'RSI (Kernel Optimized) | Flux Charts',
  shortTitle: 'RSI (Kernel Optimized) | Flux Charts',
  overlay: true,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;
/** Constants of the original */
const MAX_DISTANCE_TO_LAST_BAR = 5000;
const LABEL_COOLDOWN = 8;
const KDE_LIMIT = 300;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const gaussian = (distance: number, bandwidth: number) =>
  (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.pow(Math.E, -0.5 * Math.pow(distance / bandwidth, 2.0));
const uniform = (distance: number, bandwidth: number) => (gt(Math.abs(distance), bandwidth) ? 0.0 : 0.5);
const sigmoid = (distance: number, bandwidth: number) =>
  (2.0 / Math.PI) * (1.0 / (Math.pow(Math.E, distance / bandwidth) + Math.pow(Math.E, -(distance / bandwidth))));

const POSITIONS: Record<RsiFluxChartsInputs['tableLocation'], TablePosition> = {
  'Top Right': 'top_right',
  'Top Center': 'top_center',
  'Right Center': 'middle_right',
  'Left Center': 'middle_left',
  'Bottom Center': 'bottom_center',
  'Middle Center': 'middle_center',
};

/** One side (pivot highs or pivot lows): the stored RSI values and their density curve */
interface Side {
  rsis: number[];
  x: number[] | null;
  y: number[] | null;
  ySum: number[];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiFluxChartsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'labels' | 'tables'> & { markers: MarkerData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const highLen = Math.trunc(cfg.highPivotLen);
  const lowLen = Math.trunc(cfg.lowPivotLen);
  const steps = Math.trunc(cfg.kdeStep);
  const threshold = cfg.activationThreshold === 'High' ? 0.4 : cfg.activationThreshold === 'Medium' ? 0.25 : 0.15;
  const kernel = cfg.kdeKernel === 'Uniform' ? uniform : cfg.kdeKernel === 'Sigmoid' ? sigmoid : gaussian;
  const kernelWidth = 1.0 / cfg.kdeBandwidth;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const rsi = A(ta.rsi(getSourceSeries(bars, cfg.rsiSource), cfg.rsiLength));
  const highPivot = A(ta.pivothigh(new Series(bars, (b) => b.high), highLen, highLen));
  const lowPivot = A(ta.pivotlow(new Series(bars, (b) => b.low), lowLen, lowLen));

  /** kde(): density on 2 * steps points from the lowest stored value, one range / steps apart */
  const kde = (arr: number[]): [number[], number[]] => {
    const arrSize = arr.length;
    const arrRange = array.range(arr);
    const arrMin = array.min(arr);
    const stepCount = arrRange / steps;
    const xArr: number[] = [];
    const yArr: number[] = [];
    for (let i = 0; i < steps * 2; i++) {
      const point = arrMin + i * stepCount;
      let temp = 0;
      for (let j = 0; j < arr.length; j++) temp += kernel(point - arr[j], kernelWidth);
      xArr.push(point);
      yArr.push((1.0 / arrSize) * temp);
    }
    return [xArr, yArr];
  };

  const addPivot = (side: Side, value: number) => {
    if (side.rsis.length > KDE_LIMIT) side.rsis.shift();
    side.rsis.push(value);
    const [x, y] = kde(side.rsis);
    side.x = x;
    side.y = y;
    side.ySum = [];
    let temp = 0.0;
    for (let i = 0; i < y.length; i++) {
      temp += y[i];
      side.ySum.push(temp);
    }
  };

  /** Index of the density point nearest to the RSI */
  const nearestIndex = (x: number[], value: number): number => {
    const l = array.binary_search_leftmost(x, value);
    const r = Math.min(array.binary_search_rightmost(x, value), x.length - 1);
    return lt(Math.abs(value - array.get(x, l)), Math.abs(value - array.get(x, r))) ? l : r;
  };

  const high: Side = { rsis: [], x: null, y: null, ySum: [] };
  const low: Side = { rsis: [], x: null, y: null, ySum: [] };

  const bullishColor = cfg.bullishColor;
  const bearishColor = cfg.bearishColor;
  // `curColor == bullishColor`: two inputs with the same colour are equal
  const sameColor = String(color.new(bullishColor, 0)) === String(color.new(bearishColor, 0));
  const bullFaint = String(color.new(bullishColor, 70));
  const bearFaint = String(color.new(bearishColor, 70));

  const markers: MarkerData[] = [];
  const labels: LabelData[] = [];
  const newLabel = (l: LabelData) => {
    labels.push(l);
    if (labels.length > MAX_LABELS + 5) labels.splice(0, labels.length - MAX_LABELS);
  };

  // curColor: 0 = na, 1 = bullish, -1 = bearish
  let prevColor = 0;
  let lastBullishLabel = 0;
  let lastBearishLabel = 0;
  let lowProb = NaN;
  let highProb = NaN;
  const lastConfirmed = lastBarConfirmedOf(chart);

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // barstate.isconfirmed: false on an open last bar
    const confirmed = i < n - 1 || lastConfirmed;
    if (!isNaN(highPivot[i])) addPivot(high, i >= highLen ? rsi[i - highLen] : NaN);
    if (!isNaN(lowPivot[i])) addPivot(low, i >= lowLen ? rsi[i - lowLen] : NaN);

    lowProb = NaN;
    highProb = NaN;
    if (n - 1 - MAX_DISTANCE_TO_LAST_BAR < i) {
      if (high.rsis.length > 0) highProb = array.get(high.ySum, nearestIndex(high.x!, rsi[i]));
      if (low.rsis.length > 0) {
        const k = nearestIndex(low.x!, rsi[i]);
        lowProb = array.get(low.ySum, low.ySum.length - 1) - (k === 0 ? 0 : array.get(low.ySum, k - 1));
      }
    }

    let cur = 0;
    if (low.y !== null && high.y !== null) {
      if (gt(lowProb, array.sum(low.y) * (1.0 - threshold))) cur = 1;
      else if (gt(highProb, array.sum(high.y) * (1.0 - threshold))) cur = -1;
    }
    const isBull = cur === 1 || (sameColor && cur === -1);
    const isBear = cur === -1 || (sameColor && cur === 1);
    const wasBull = prevColor === 1 || (sameColor && prevColor === -1);
    const wasBear = prevColor === -1 || (sameColor && prevColor === 1);
    prevColor = cur;

    // plotarrow(): up arrows below the bar, down arrows above the bar
    if (isBull && confirmed) markers.push({ time: b.time, position: 'belowBar', shape: 'arrowUp', color: bullFaint });
    if (isBear && confirmed) markers.push({ time: b.time, position: 'aboveBar', shape: 'arrowDown', color: bearFaint });
    const possibleBull = cur === 0 && wasBull && confirmed;
    const possibleBear = cur === 0 && wasBear && confirmed;
    if (possibleBull) markers.push({ time: b.time, position: 'belowBar', shape: 'arrowUp', color: bullishColor });
    if (possibleBear) markers.push({ time: b.time, position: 'aboveBar', shape: 'arrowDown', color: bearishColor });

    if (cfg.kdeLabelsEnabled || cfg.rsiLabelsEnabled) {
      const text = (prob: number) =>
        cfg.rsiLabelsEnabled && cfg.kdeLabelsEnabled
          ? 'RSI | ' + str.tostring(rsi[i], '#') + ' | ' + str.tostring(prob * 100, '#.##') + '%'
          : cfg.rsiLabelsEnabled
            ? 'RSI | ' + str.tostring(rsi[i], '#')
            : str.tostring(rsi[i], '#') + '%';
      if (possibleBull && i - lastBullishLabel > LABEL_COOLDOWN) {
        lastBullishLabel = i;
        newLabel({
          time: b.time, price: b.low, text: text(lowProb), yloc: 'belowbar', color: 'transparent', style: 'label_up',
          textColor: cfg.textColor, forceOverlay: true,
        });
      }
      if (possibleBear && i - lastBearishLabel > LABEL_COOLDOWN) {
        lastBearishLabel = i;
        newLabel({
          time: b.time, price: b.low, text: text(highProb), yloc: 'abovebar', color: 'transparent', style: 'label_down',
          textColor: cfg.textColor, forceOverlay: true,
        });
      }
    }
  }

  // Dashboard: the cells of the last bar
  const tables: TableData[] = [];
  if (cfg.tableEnabled && n > 0) {
    const bullishKde = gt(lowProb, highProb);
    const best = Math.max(highProb, lowProb); // na when one side is na
    const cell = (column: number, row: number, text: string, textColor: string): TableCellData =>
      ({ column, row, text, textColor, bgColor: cfg.screenerColor, textSize: 'auto' });
    tables.push({
      position: POSITIONS[cfg.tableLocation], columns: 2, rows: 10, bgColor: cfg.screenerColor, frameWidth: 2,
      frameColor: cfg.frameColor, borderWidth: 1, borderColor: cfg.borderColor,
      merges: [{ startColumn: 0, startRow: 0, endColumn: 1, endRow: 0 }],
      cells: [
        cell(0, 0, 'KDE Optimized RSI', cfg.textColorDB),
        cell(0, 1, 'RSI', cfg.textColorDB),
        cell(1, 1, str.tostring(rsi[n - 1], '#'), cfg.textColorDB),
        cell(0, 2, bullishKde ? 'Bullish KDE' : 'Bearish KDE', bullishKde ? bullishColor : bearishColor),
        cell(1, 2, str.tostring((isNaN(best) ? 0 : best) * 100, '#.##') + '%', cfg.textColorDB),
      ],
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    labels,
    tables,
  };
}

export const RsiFluxCharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
