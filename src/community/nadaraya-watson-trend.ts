/**
 * Nadaraya-Watson Trend [QuantAlgo]
 *
 * Kernel regression of the source over the last `lookback` bars: weights from a kernel (Gaussian, Epanechnikov,
 * Triangular, Quartic, Cosine or Rational Quadratic) of the bar distance with bandwidth = bandwidth * multiplier.
 * Residual bands at the kernel-weighted mean absolute deviation * band multiplier. The trend colour follows the
 * slope of the line; six fills fade from the line to the price, markers show the slope reversals, and bars and
 * background can take the trend colour.
 *
 * Alerts (alertcondition, `alerts` of the result): bullish / bearish / any kernel reversal, source crossing above the
 * upper / below the lower residual band (the bands as computed, also when they are not shown).
 *
 * Reference: "Nadaraya-Watson Trend [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Kernel Reversal', message: 'Nadaraya-Watson Trend: BULLISH kernel reversal on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Kernel Reversal', message: 'Nadaraya-Watson Trend: BEARISH kernel reversal on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Any Kernel Reversal', message: 'Nadaraya-Watson Trend: Kernel path direction changed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert3', title: 'Source Cross Above Upper Band', message: 'Nadaraya-Watson Trend: Source crossed above upper residual band on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert4', title: 'Source Cross Below Lower Band', message: 'Nadaraya-Watson Trend: Source crossed below lower residual band on {{exchange}}:{{ticker}} - {{interval}}' },
];

const KERNELS = ['Gaussian', 'Epanechnikov', 'Triangular', 'Quartic', 'Cosine', 'Rational Quadratic'];
const COLOR_PAIRS: Record<string, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

export interface NadarayaWatsonTrendInputs {
  /** Default uses the inputs below; Fast Response 25 / 5 / 1.5; Smooth Trend 100 / 12 / 2.5 */
  preset: string;
  src: SourceType;
  kernelType: string;
  lookback: number;
  bandwidth: number;
  hMult: number;
  /** Relative weighting of the Rational Quadratic kernel */
  relWeight: number;
  showBands: boolean;
  bandMult: number;
  showFill: boolean;
  showMarkers: boolean;
  /** Colour preset; Custom uses bullishColor / bearishColor */
  colorPreset: string;
  bullishColor: string;
  bearishColor: string;
  showCandles: boolean;
  barTrans: number;
  showBgcolor: boolean;
  bgTrans: number;
}

export const defaultInputs: NadarayaWatsonTrendInputs = {
  preset: 'Default',
  src: 'close',
  kernelType: 'Gaussian',
  lookback: 50,
  bandwidth: 8,
  hMult: 2.0,
  relWeight: 8.0,
  showBands: false,
  bandMult: 1.5,
  showFill: true,
  showMarkers: true,
  colorPreset: 'Custom',
  bullishColor: '#00ffaa',
  bearishColor: '#ff0000',
  showCandles: false,
  barTrans: 0,
  showBgcolor: false,
  bgTrans: 90,
};

export const inputConfig: InputConfig[] = [
  { id: 'preset', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'kernelType', type: 'string', title: 'Kernel Type', defval: 'Gaussian', options: KERNELS },
  { id: 'lookback', type: 'int', title: 'Lookback Window', defval: 50, min: 1, max: 500 },
  { id: 'bandwidth', type: 'int', title: 'Kernel Bandwidth', defval: 8, min: 1 },
  { id: 'hMult', type: 'float', title: 'Bandwidth Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'relWeight', type: 'float', title: 'Relative Weighting (RQ)', defval: 8.0, min: 0.1, step: 0.25 },
  { id: 'showBands', type: 'bool', title: 'Show Residual Bands', defval: false },
  { id: 'bandMult', type: 'float', title: 'Band Multiplier', defval: 1.5, min: 0.1, step: 0.1 },
  { id: 'showFill', type: 'bool', title: 'Show Gradient Fill', defval: true },
  { id: 'showMarkers', type: 'bool', title: 'Show Reversal Markers', defval: true },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#ff0000' },
  { id: 'showCandles', type: 'bool', title: 'Enable Bar Coloring', defval: false },
  { id: 'barTrans', type: 'int', title: 'Bar Color Transparency', defval: 0, min: 0, max: 100 },
  { id: 'showBgcolor', type: 'bool', title: 'Enable Background Coloring', defval: false },
  { id: 'bgTrans', type: 'int', title: 'Background Color Transparency', defval: 90, min: 0, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'NW Trend', color: '#00ffaa', lineWidth: 3 },
  { id: 'plot1', title: 'Price Anchor', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Gradient 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Gradient 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Gradient 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Gradient 4', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Gradient 5', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'NW Upper Band', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot8', title: 'NW Lower Band', color: '#00ffaa', lineWidth: 1 },
];

export const metadata = {
  title: 'Nadaraya-Watson Trend [QuantAlgo]',
  shortTitle: 'Nadaraya-Watson Trend',
  overlay: true,
};

/** kernel_weight(dist, h, ktype, rq) */
function kernelWeight(dist: number, h: number, ktype: string, rq: number): number {
  if (!(h > 0)) return 0;
  const u = dist / h;
  if (ktype === 'Gaussian') return Math.exp(-(dist * dist) / (2.0 * h * h));
  if (ktype === 'Rational Quadratic') return Math.pow(1.0 + (dist * dist) / (2.0 * rq * h * h), -rq);
  if (Math.abs(u) <= 1.0) {
    if (ktype === 'Epanechnikov') return 0.75 * (1.0 - u * u);
    if (ktype === 'Triangular') return 1.0 - Math.abs(u);
    if (ktype === 'Quartic') return (15.0 / 16.0) * Math.pow(1.0 - u * u, 2.0);
    if (ktype === 'Cosine') return (Math.PI / 4.0) * Math.cos((Math.PI * u) / 2.0);
  }
  return 0;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<NadarayaWatsonTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const lookback = cfg.preset === 'Fast Response' ? 25 : cfg.preset === 'Smooth Trend' ? 100 : cfg.lookback;
  const bandwidth = cfg.preset === 'Fast Response' ? 5 : cfg.preset === 'Smooth Trend' ? 12 : cfg.bandwidth;
  const hMult = cfg.preset === 'Fast Response' ? 1.5 : cfg.preset === 'Smooth Trend' ? 2.5 : cfg.hMult;
  const [bullish, bearish] = COLOR_PAIRS[cfg.colorPreset] ?? [cfg.bullishColor, cfg.bearishColor];
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const h = bandwidth * hMult;
  const weights = Array.from({ length: lookback + 1 }, (_, k) => kernelWeight(k, h, cfg.kernelType, cfg.relWeight));

  const nw: number[] = new Array(n);
  const upper: number[] = new Array(n);
  const lower: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // sum over i = 0..lookback of src[i] * w (na when a source value before bar 0 is used)
    let sumW = 0;
    let sumP = 0;
    for (let k = 0; k <= lookback; k++) {
      sumW += weights[k];
      sumP += (i - k >= 0 ? src[i - k] : NaN) * weights[k];
    }
    nw[i] = sumW !== 0 ? sumP / sumW : NaN;
    // residual: kernel-weighted mean of |src - nw_trend| over the non-na values
    let sumAbs = 0;
    let sumResW = 0;
    for (let k = 0; k <= lookback; k++) {
      const v = i - k >= 0 ? src[i - k] : NaN;
      if (weights[k] > 0 && !isNaN(v) && !isNaN(nw[i])) {
        sumAbs += weights[k] * Math.abs(v - nw[i]);
        sumResW += weights[k];
      }
    }
    const residual = sumResW !== 0 ? sumAbs / sumResW : NaN;
    const ok = !isNaN(nw[i]) && !isNaN(residual);
    upper[i] = ok ? nw[i] + residual * cfg.bandMult : NaN;
    lower[i] = ok ? nw[i] - residual * cfg.bandMult : NaN;
  }

  const c = (col: string, transp: number) => String(color.new(col, transp));
  const plots: Record<string, { time: number; value: number; color?: string }[]> = {};
  for (let k = 0; k <= 8; k++) plots[`plot${k}`] = [];
  const fillCols: string[][] = [[], [], [], [], [], [], []];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const fillTransp = [60, 68, 76, 84, 92, 96];
  const turnedBull: boolean[] = new Array(n).fill(false);
  const turnedBear: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const cur = nw[i];
    const p1 = i > 0 ? nw[i - 1] : NaN;
    const p2 = i > 1 ? nw[i - 2] : NaN;
    // trend_color = na(nw) or na(nw[1]) ? bullish : nw > nw[1] ? bullish : bearish
    const trend = isNaN(cur) || isNaN(p1) ? bullish : cur > p1 ? bullish : bearish;
    const step = !isNaN(cur) ? (src[i] - cur) / 6.0 : NaN;
    plots.plot0.push({ time: t, value: cur, color: c(trend, 0) });
    plots.plot1.push({ time: t, value: src[i] });
    for (let g = 1; g <= 5; g++) plots[`plot${g + 1}`].push({ time: t, value: !isNaN(step) ? cur + step * g : NaN });
    plots.plot7.push({ time: t, value: cfg.showBands ? upper[i] : NaN, color: c(trend, 55) });
    plots.plot8.push({ time: t, value: cfg.showBands ? lower[i] : NaN, color: c(trend, 55) });
    for (let g = 0; g < 6; g++) fillCols[g].push(cfg.showFill && !isNaN(cur) ? c(trend, fillTransp[g]) : 'transparent');
    fillCols[6].push(cfg.showBands ? c(trend, 90) : 'transparent');

    // turned_bullish: nw[1] < nw[2] and nw > nw[1] (all three not na); turned_bearish the other way
    const valid = !isNaN(cur) && !isNaN(p1) && !isNaN(p2);
    turnedBull[i] = valid && p1 < p2 && cur > p1;
    turnedBear[i] = valid && p1 > p2 && cur < p1;
    if (cfg.showMarkers && valid && p1 < p2 && cur > p1) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: c(bullish, 0), size: 'small' });
    }
    if (cfg.showMarkers && valid && p1 > p2 && cur < p1) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: c(bearish, 0), size: 'small' });
    }
    if (cfg.showCandles && !isNaN(cur)) barColors.push({ time: t, color: c(trend, cfg.barTrans) });
    if (cfg.showBgcolor && !isNaN(cur)) bgColors.push({ time: t, color: c(trend, cfg.bgTrans) });
  }
  // band_cross_up = not na(upper) and ta.crossover(src, upper); band_cross_dn the same with lower / crossunder
  const crossUp = crossedOver(src, upper).map((f, i) => f && !isNaN(upper[i]));
  const crossDn = crossedUnder(src, lower).map((f, i) => f && !isNaN(lower[i]));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'plot0', plot2: 'plot2', colors: fillCols[0] },
      { plot1: 'plot2', plot2: 'plot3', colors: fillCols[1] },
      { plot1: 'plot3', plot2: 'plot4', colors: fillCols[2] },
      { plot1: 'plot4', plot2: 'plot5', colors: fillCols[3] },
      { plot1: 'plot5', plot2: 'plot6', colors: fillCols[4] },
      { plot1: 'plot6', plot2: 'plot1', colors: fillCols[5] },
      { plot1: 'plot7', plot2: 'plot8', colors: fillCols[6] },
    ],
    markers,
    barColors,
    bgColors,
    alerts: alertStates(alertConditions, bars, [turnedBull, turnedBear, turnedBull.map((f, i) => f || turnedBear[i]), crossUp, crossDn]),
  };
}

export const NadarayaWatsonTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
