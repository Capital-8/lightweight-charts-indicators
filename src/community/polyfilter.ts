/**
 * PolyFilter [BackQuant]
 *
 * One of three filters of the source:
 * - Fractional MA: weights (k + 1)^-adaptationSpeed for k = 0..length - 1, normalised to a sum of 1; the sum runs on
 *   the bars that exist (min(length - 1, bar_index)).
 * - Ehlers 2-Pole super smoother: filt = c1 * (src + src[1]) / 2 + c2 * filt[1] + c3 * filt[2] with
 *   a1 = exp(-1.414 * 3.14159 / length), c2 = 2 * a1 * cos(1.414 * 3.14159 / length), c3 = -a1², c1 = 1 - c2 - c3.
 * - Multi-Kernel: 0.7 * Gaussian weighted average (sigma = length / 3) + 0.3 * exponential weighted average
 *   (alpha = 2 / (length + 1)) over `length` bars.
 * The line, the bars and the optional background are green when the filter rises (or the source is above the
 * filter), red otherwise. Triangles mark the filter turning up / down (or crossing the source).
 * Alerts (alertcondition, `alerts` of the result): trend up / down (the filter crossing its value of the bar before)
 * and the filter crossing above / below the source.
 *
 * Reference: "PolyFilter [BackQuant]" by BackQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BackQuant
 */

import { getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, BgColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type PolyFilterType = 'Fractional MA' | 'Ehlers 2-Pole' | 'Multi-Kernel';

export interface PolyFilterInputs {
  /** Price source for the calculation */
  src: SourceType;
  /** Filter length */
  filterLength: number;
  /** Adaptation speed (exponent of the Fractional MA weights) */
  adaptationSpeed: number;
  /** Filter type */
  filterType: PolyFilterType;
  /** Colour from the trend (true) or from the source above / below the filter (false) */
  col1or2: boolean;
  longColor: string;
  shortColor: string;
  /** Show the filter line */
  showLine: boolean;
  /** Paint the candles */
  paintCandles: boolean;
  /** Colour the background */
  bgCol: boolean;
  /** Line width of the filter line (the plot width stays 2) */
  lineW: number;
}

export const defaultInputs: PolyFilterInputs = {
  src: 'hlc3',
  filterLength: 83,
  adaptationSpeed: 0.618,
  filterType: 'Ehlers 2-Pole',
  col1or2: true,
  longColor: '#00ff00',
  shortColor: '#ff0000',
  showLine: true,
  paintCandles: true,
  bgCol: false,
  lineW: 2,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Price Source for Calculation', defval: 'hlc3' },
  { id: 'filterLength', type: 'int', title: 'Filter Length', defval: 83 },
  { id: 'adaptationSpeed', type: 'float', title: 'Adaptation Speed', defval: 0.618, step: 0.01 },
  { id: 'filterType', type: 'string', title: 'Filter Type', defval: 'Ehlers 2-Pole', options: ['Fractional MA', 'Ehlers 2-Pole', 'Multi-Kernel'] },
  { id: 'col1or2', type: 'bool', title: 'Color based off Trend (true) or > or < close (false)', defval: true },
  { id: 'longColor', type: 'color', title: 'Long Color', defval: '#00ff00' },
  { id: 'shortColor', type: 'color', title: 'Short Color', defval: '#ff0000' },
  { id: 'showLine', type: 'bool', title: 'Show Filter Line', defval: true },
  { id: 'paintCandles', type: 'bool', title: 'Paint candles', defval: true, tooltip: 'Color candles using color method defined above.' },
  { id: 'bgCol', type: 'bool', title: 'Color Background?', defval: false },
  { id: 'lineW', type: 'int', title: 'Line Width', defval: 2, tooltip: 'This is for the filter line' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Filter', color: '#00ff00', lineWidth: 2 },
];

export const metadata = {
  title: 'PolyFilter [BackQuant]',
  shortTitle: 'PolyFilter [BackQuant]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const nz = (x: number) => (isNaN(x) ? 0 : x);

function fractionalMa(src: number[], length: number, fraction: number): number[] {
  const weights: number[] = [];
  let sumWeights = 0.0;
  for (let k = 0; k < length; k++) {
    const w = Math.pow(k + 1, -fraction);
    weights.push(w);
    sumWeights += w;
  }
  for (let k = 0; k < weights.length; k++) weights[k] = weights[k] / sumWeights;
  return src.map((_v, i) => {
    let weightedSum = 0.0;
    for (let k = 0; k <= Math.min(length - 1, i); k++) {
      if (k < weights.length) weightedSum += src[i - k] * weights[k];
    }
    return weightedSum;
  });
}

function ehlers2Pole(src: number[], length: number): number[] {
  const arg = (1.414 * 3.14159) / length;
  const a1 = Math.exp(-arg);
  const b1 = 2 * a1 * Math.cos(arg);
  const c2 = b1;
  const c3 = -a1 * a1;
  const c1 = 1 - c2 - c3;
  const filt: number[] = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const s1 = i > 0 ? src[i - 1] : NaN;
    const f1 = i > 0 ? filt[i - 1] : NaN;
    const f2 = i > 1 ? filt[i - 2] : NaN;
    filt[i] = (c1 * (src[i] + nz(s1))) / 2 + c2 * nz(f1) + c3 * nz(f2);
  }
  return filt;
}

function multiKernel(src: number[], length: number): number[] {
  const sigma = length / 3.0;
  const alpha = 2.0 / (length + 1);
  return src.map((_v, i) => {
    const at = (k: number) => (i - k >= 0 ? src[i - k] : NaN);
    let gaussianSum = 0.0;
    let gaussianWeightSum = 0.0;
    for (let k = 0; k <= length - 1; k++) {
      const w = Math.exp(-Math.pow(k, 2) / (2 * Math.pow(sigma, 2)));
      gaussianSum += at(k) * w;
      gaussianWeightSum += w;
    }
    const gaussianMa = gaussianSum / gaussianWeightSum;
    let expSum = 0.0;
    let expWeightSum = 0.0;
    for (let k = 0; k <= length - 1; k++) {
      const w = Math.pow(1 - alpha, k);
      expSum += at(k) * w;
      expWeightSum += w;
    }
    const expMa = expSum / expWeightSum;
    return 0.7 * gaussianMa + 0.3 * expMa;
  });
}

export function calculate(
  bars: Bar[],
  inputs: Partial<PolyFilterInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);

  const signal = cfg.filterType === 'Fractional MA'
    ? fractionalMa(src, cfg.filterLength, cfg.adaptationSpeed)
    : cfg.filterType === 'Multi-Kernel'
      ? multiKernel(src, cfg.filterLength)
      : ehlers2Pole(src, cfg.filterLength);

  const plot0: { time: number; value: number; color: string }[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const flags: boolean[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const s1 = i > 0 ? signal[i - 1] : NaN;
    const s2 = i > 1 ? signal[i - 2] : NaN;
    const up = gt(signal[i], s1);
    const aboveFilter = gt(src[i], signal[i]);
    const trendCol = up ? cfg.longColor : cfg.shortColor;
    const filtCol = aboveFilter ? cfg.longColor : cfg.shortColor;
    const col = cfg.col1or2 ? trendCol : filtCol;
    plot0.push({ time: t, value: cfg.showLine ? signal[i] : NaN, color: col });
    if (cfg.paintCandles) barColors.push({ time: t, color: col });
    if (cfg.bgCol) bgColors.push({ time: t, color: col });

    // ta.crossover(a, b): a > b and a[1] <= b[1]; ta.crossunder(a, b): a < b and a[1] >= b[1] (exact, no 1e-10 tolerance)
    const src1 = i > 0 ? src[i - 1] : NaN;
    const alertUp = signal[i] > s1 && s1 <= s2;
    const alertDown = signal[i] < s1 && s1 >= s2;
    const alertAbove = signal[i] > src[i] && s1 <= src1;
    const alertBelow = signal[i] < src[i] && s1 >= src1;
    flags[0].push(alertUp);
    flags[1].push(alertDown);
    flags[2].push(alertAbove);
    flags[3].push(alertBelow);
    if (cfg.col1or2 ? alertUp : alertAbove) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: cfg.longColor, text: 'L',
        textColor: cfg.longColor, size: 'tiny' });
    }
    if (cfg.col1or2 ? alertDown : alertBelow) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: cfg.shortColor, text: 'S',
        textColor: cfg.shortColor, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    barColors,
    bgColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'PolyFilter Trend Up', message: 'PolyFilter Trend Up - {{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'PolyFilter Trend Down', message: 'PolyFilter Trend Down - {{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'PolyFilter Above Price', message: 'PolyFilter Above Price - {{ticker}} - {{interval}}' },
  { id: 'alert3', title: 'PolyFilter Below Price', message: 'PolyFilter Below Price - {{ticker}} - {{interval}}' },
];

export const PolyFilter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
