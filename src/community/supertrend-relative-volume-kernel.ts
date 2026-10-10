/**
 * SuperTrend + Relative Volume (Kernel Optimized) | Flux Charts
 *
 * A SuperTrend whose breaks are rated by the relative volume of the breaking side. The volume of each bar is split
 * into buy volume (the part of the range below the close) and sell volume; the relative volume of a side is its
 * 10-bar EMA divided by its "Relative Volume Length" EMA. On each bullish break (close crosses above the SuperTrend)
 * the relative buy volume is stored, on each bearish break the relative sell volume (the last "Nº Bins" values per
 * side). The stored values, standardized, feed a Gaussian kernel density estimate on "Nº Bins" points from -3 to 3.
 * On every bar the current relative volume of the trend side is placed on that curve: the "KDE %" is the density
 * summed up to it (the share of past breaks with a lower relative volume).
 *
 * Outputs: the SuperTrend line (green / red when the last signal agrees with its side, else gray), a fill from the
 * middle of the bar body to the line that gets more opaque with the KDE %, an arrow and a "Vol: x%" label on each
 * break (only when the KDE % is above the threshold if "Enable Activation Threshold" is on), optional bar colours,
 * and an error cell in a table when the last bar has no volume or when fewer than "Nº Bins" breaks of a side were
 * seen. At most 500 labels are kept.
 *
 * The original imports the `ta` library of its platform; of its functions only supertrend() is called, which is the
 * built-in SuperTrend calculation (close prices, no wicks). The error texts of the original end with the ticker of
 * the symbol, which the bars do not carry: the port leaves it out.
 *
 * Reference: "SuperTrend + Relative Volume (Kernel Optimized) | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import { ta, array, str, color, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, LabelData, MarkerData, TableData } from '../types';

export interface SupertrendRelativeVolumeKernelInputs {
  atrLength: number;
  atrMultiplier: number;
  /** Transparency of the fill at KDE 0 % */
  supertrendMaxOpacity: number;
  /** Transparency of the fill at KDE 100 % */
  supertrendMinOpacity: number;
  kdeBandwidth: number;
  /** Points of the density curve and number of breaks stored per side */
  kdeStep: number;
  /** KDE % a break must reach when the activation threshold is enabled */
  activationThreshold: number;
  /** Length of the long EMA of the relative volume */
  barLength: number;
  activationThresholdEnabled: boolean;
  bearishColor: string;
  bullishColor: string;
  textColor: string;
  kdeLabelsEnabled: boolean;
  showSuperTrendLine: boolean;
  showFillColors: boolean;
  showTrendColor: boolean;
  showErrors: boolean;
}

export const defaultInputs: SupertrendRelativeVolumeKernelInputs = {
  atrLength: 10,
  atrMultiplier: 3,
  supertrendMaxOpacity: 99,
  supertrendMinOpacity: 53,
  kdeBandwidth: 0.1,
  kdeStep: 100,
  activationThreshold: 70,
  barLength: 25,
  activationThresholdEnabled: false,
  bearishColor: '#f23646',
  bullishColor: 'rgb(9, 209, 66)',
  textColor: '#FFFFFF',
  kdeLabelsEnabled: true,
  showSuperTrendLine: true,
  showFillColors: true,
  showTrendColor: false,
  showErrors: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 10, group: 'SuperTrend' },
  { id: 'atrMultiplier', type: 'int', title: 'ATR Multiplier', defval: 3, group: 'SuperTrend' },
  {
    id: 'supertrendMaxOpacity', type: 'int', title: 'SuperTrend Max Opacity', defval: 99, min: 0, max: 100, group: 'SuperTrend',
    tooltip: 'This setting sets the opacity of supertrend based on the KDE%. A higher value will increase the transparency.',
  },
  {
    id: 'supertrendMinOpacity', type: 'int', title: 'SuperTrend Min Opacity', defval: 53, min: 0, max: 100, group: 'SuperTrend',
    tooltip: 'This setting sets the opacity of supertrend based on the KDE%. A lower value will decrease the transparency.',
  },
  {
    id: 'kdeBandwidth', type: 'float', title: 'Bandwidth', defval: 0.1, min: 0.01, step: 0.1, group: 'KDE',
    tooltip: 'This setting sets the smoothness of the KDE function output.',
  },
  {
    id: 'kdeStep', type: 'int', title: 'Nº Bins', defval: 100, min: 1, group: 'KDE',
    tooltip: 'The number of elements the KDE Probability array will have. Higher settings will result in greater precision.',
  },
  {
    id: 'activationThreshold', type: 'float', title: 'KDE Threshold %', defval: 70, min: 0, max: 100, step: 2.5, group: 'KDE',
    tooltip: 'This setting sets the KDE% threshold that must be exceeeded to indicate buy or sell signals.',
  },
  {
    id: 'barLength', type: 'int', title: 'Relative Volume Length', defval: 25, min: 1, group: 'KDE',
    tooltip: 'This setting sets the number of candles back to calculate Relative Breakout Volume',
  },
  {
    id: 'activationThresholdEnabled', type: 'bool', title: 'Enable Activation Threshold', defval: false, group: 'KDE',
    tooltip: "Only trigger a supertrend direction change if the relative volume's percentile is above the KDE Threshold %",
  },
  { id: 'bearishColor', type: 'color', title: 'Bullish Break', defval: '#f23646', group: 'Style', inline: 'col' },
  { id: 'bullishColor', type: 'color', title: 'Bearish Break', defval: 'rgb(9, 209, 66)', group: 'Style', inline: 'col' },
  { id: 'textColor', type: 'color', title: 'Text', defval: '#FFFFFF', group: 'Style', inline: 'col' },
  { id: 'kdeLabelsEnabled', type: 'bool', title: 'KDE Labels', defval: true, group: 'Style' },
  { id: 'showSuperTrendLine', type: 'bool', title: 'Display SuperTrend Line', defval: true, group: 'Style' },
  { id: 'showFillColors', type: 'bool', title: 'Display Volume Gradient', defval: true, group: 'Style' },
  { id: 'showTrendColor', type: 'bool', title: 'Display Trend Color', defval: false, group: 'Style' },
  { id: 'showErrors', type: 'bool', title: 'Show Errors', defval: true, group: 'Style' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Up direction', color: '#2962FF', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Down direction', color: '#2962FF', lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Body Middle', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'SuperTrend + Relative Volume (Kernel Optimized) | Flux Charts',
  shortTitle: 'SuperTrend + Relative Volume (Kernel Optimized) | Flux Charts',
  overlay: true,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

const gaussian = (distance: number, bandwidth: number) =>
  (1.0 / Math.sqrt(2.0 * Math.PI)) * Math.pow(Math.E, -0.5 * Math.pow(distance / bandwidth, 2.0));

/** One side (bullish or bearish breaks): the stored relative volumes and their density curve */
interface Side {
  volumes: number[];
  x: number[];
  ySum: number[];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupertrendRelativeVolumeKernelInputs> = {},
): Omit<IndicatorResult, 'markers' | 'labels' | 'tables'> & {
  markers: MarkerData[]; labels: LabelData[]; tables: TableData[]; barColors: BarColorData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const steps = Math.trunc(cfg.kdeStep);
  const threshold = cfg.activationThreshold / 100;
  const maxOpacity = cfg.supertrendMaxOpacity;
  const minOpacity = cfg.supertrendMinOpacity;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const [stSeries, dirSeries] = ta.supertrend(bars, cfg.atrMultiplier, cfg.atrLength);
  const supertrend = A(stSeries);
  const direction = A(dirSeries);

  // Buy / sell volume: a bar without range gives 0 / 0 = na
  const volume = bars.map((b) => b.volume ?? NaN);
  const buyTotal = S(bars.map((b, i) => (volume[i] * (b.close - b.low)) / (b.high - b.low)));
  const sellTotal = S(bars.map((b, i) => (volume[i] * (b.high - b.close)) / (b.high - b.low)));
  const buyAverage = A(ta.ema(buyTotal, cfg.barLength));
  const buyShort = A(ta.ema(buyTotal, 10));
  const sellAverage = A(ta.ema(sellTotal, cfg.barLength));
  const sellShort = A(ta.ema(sellTotal, 10));

  /** kde(): density of the standardized values on `steps` points from -3, normalized to a sum of 1 */
  const kde = (arr: number[]): [number[], number[]] => {
    const stepCount = 6 / steps;
    const xArr: number[] = [];
    const yArr: number[] = [];
    for (let i = 0; i < steps; i++) {
      const point = -3 + i * stepCount;
      let temp = 0;
      for (let j = 0; j < arr.length; j++) temp += gaussian(point - arr[j], cfg.kdeBandwidth);
      xArr.push(point);
      yArr.push(temp);
    }
    const totalDensity = array.sum(yArr);
    for (let k = 0; k < yArr.length; k++) yArr[k] = yArr[k] / totalDensity;
    return [xArr, yArr];
  };

  const addBreak = (side: Side, value: number) => {
    if (side.volumes.length >= steps) side.volumes.shift();
    side.volumes.push(value);
    const [x, y] = kde(array.standardize(side.volumes));
    side.x = x;
    side.ySum = [];
    let temp = 0.0;
    for (let i = 0; i < y.length; i++) {
      temp += y[i];
      side.ySum.push(temp);
    }
  };

  /** KDE % of a relative volume on the curve of its side (the density summed up to the nearest point) */
  const probability = (side: Side, value: number): number => {
    const vol = (value - array.avg(side.volumes)) / array.stdev(side.volumes);
    const l = array.binary_search_leftmost(side.x, vol);
    const r = Math.min(array.binary_search_rightmost(side.x, vol), side.x.length - 1);
    const nearest = lt(Math.abs(vol - array.get(side.x, l)), Math.abs(vol - array.get(side.x, r))) ? l : r;
    return array.get(side.ySum, nearest);
  };

  const bullSide: Side = { volumes: [], x: [], ySum: [] };
  const bearSide: Side = { volumes: [], x: [], ySum: [] };
  const crossUp = callsite.crossover();
  const crossDown = callsite.crossunder();

  const up: number[] = new Array(n).fill(NaN);
  const down: number[] = new Array(n).fill(NaN);
  const lineColor: string[] = new Array(n);
  const fillColor: string[] = new Array(n);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const labels: LabelData[] = [];
  const newLabel = (l: LabelData) => {
    labels.push(l);
    if (labels.length > MAX_LABELS + 5) labels.splice(0, labels.length - MAX_LABELS);
  };

  let volumeProb = NaN;
  let trendUp = false;
  const gray = String(color.gray);
  const labelColor = String(color.new(color.blue, 100));

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const st = supertrend[i];
    const bullishBreak = crossUp(b.close, st);
    const bearishBreak = crossDown(b.close, st);
    const buyVolume = buyShort[i] / buyAverage[i];
    const sellVolume = sellShort[i] / sellAverage[i];
    const hasVolume = !isNaN(volume[i]);

    if (hasVolume) {
      if (bullishBreak && Number.isFinite(buyVolume)) addBreak(bullSide, buyVolume);
      if (bearishBreak && Number.isFinite(sellVolume)) addBreak(bearSide, sellVolume);
    }

    const bull = direction[i] < 0 && hasVolume;
    const bear = direction[i] > 0 && hasVolume;
    if (bull && bullSide.volumes.length > 0) volumeProb = probability(bullSide, buyVolume);
    if (bear && bearSide.volumes.length > 0) volumeProb = probability(bearSide, sellVolume);

    // overKDEThreshold(): false when the KDE % is na
    const thresholdOk = !cfg.activationThresholdEnabled || ge(volumeProb, threshold);
    const bullCondition = bullishBreak && thresholdOk;
    const bearCondition = bearishBreak && thresholdOk;
    if (bullCondition) trendUp = true;
    else if (bearCondition) trendUp = false;

    const stColor = trendUp && bull ? cfg.bullishColor : !trendUp && bear ? cfg.bearishColor : gray;
    up[i] = bull ? st : NaN;
    down[i] = bear ? st : NaN;
    lineColor[i] = cfg.showSuperTrendLine ? stColor : 'transparent';
    // getSupertrendTransparency(): max at KDE 0 %, min at KDE 100 %; an na KDE % gives a transparent fill
    const transparency = maxOpacity - (volumeProb * (maxOpacity - minOpacity) + minOpacity) + minOpacity;
    fillColor[i] = String(color.new(stColor, cfg.showFillColors ? transparency : 100));

    const text = 'Vol: ' + str.tostring(volumeProb * 100, '#.#') + '%';
    if (bullCondition) {
      if (!isNaN(st)) {
        markers.push({
          time: b.time, position: 'atPriceMiddle', price: st * 0.999, shape: 'arrowUp', color: cfg.bullishColor, size: 'normal',
          forceOverlay: true,
        });
      }
      if (cfg.kdeLabelsEnabled) {
        newLabel({
          time: b.time, price: st * 0.999, text, color: labelColor, style: 'label_up', textColor: cfg.textColor, forceOverlay: true,
        });
      }
    }
    if (bearCondition) {
      if (!isNaN(st)) {
        markers.push({
          time: b.time, position: 'atPriceMiddle', price: st * 1.001, shape: 'arrowDown', color: cfg.bearishColor, size: 'normal',
          forceOverlay: true,
        });
      }
      if (cfg.kdeLabelsEnabled) {
        newLabel({
          time: b.time, price: st * 1.001, text, color: labelColor, style: 'label_down', textColor: cfg.textColor, forceOverlay: true,
        });
      }
    }
    if (cfg.showTrendColor) barColors.push({ time: b.time, color: trendUp ? cfg.bullishColor : cfg.bearishColor });
  }

  // Error table: every bar sets or clears the cell, so the last bar decides
  const tables: TableData[] = [];
  if (n > 0 && cfg.showErrors) {
    const lastVolume = volume[n - 1];
    const errorText = isNaN(lastVolume) || Math.abs(lastVolume) <= EPS
      ? '⚠️ No Volume Data Available for '
      : bullSide.volumes.length !== steps || bearSide.volumes.length !== steps
        ? '⚠️ Not enough data. There were not enough SuperTrend Signals generated on this chart for the model. Lower bin value or change chart settings. '
        : null;
    if (errorText !== null) {
      tables.push({
        position: 'top_right', columns: 1, rows: 1,
        cells: [{ column: 0, row: 0, text: errorText, textColor: String(color.white), bgColor: String(color.red), textSize: 'auto' }],
      });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: up[i], color: lineColor[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: down[i], color: lineColor[i] })),
      // barstate.isfirst ? na : (open + close) / 2
      plot2: bars.map((b, i) => ({ time: b.time, value: i === 0 ? NaN : (b.open + b.close) / 2 })),
    },
    fills: [
      { plot1: 'plot2', plot2: 'plot0', options: { fillgaps: false }, colors: fillColor },
      { plot1: 'plot2', plot2: 'plot1', options: { fillgaps: false }, colors: fillColor.slice() },
    ],
    markers,
    barColors,
    // a label with an na price is not drawn
    labels: labels.filter((l) => !isNaN(l.price)),
    tables,
  };
}

export const SupertrendRelativeVolumeKernel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
