/**
 * Triple Gaussian Smoothed Ribbon [BOSWaves]
 *
 * A Gaussian filter (normalised weights exp(-x^2 / (2 sigma^2)), x = i - floor(length / 2), weight i on the value
 * length - 1 - i bars ago) applied three times to the source gives the core line v1; the same filter on v1 with the
 * signal length gives v2, and with signal length + 4 / + 8 / + 12 / + 16 the four outer ribbon lines. The colour is a
 * gradient of the normalised distance v2 - v1 over 70 bars (bullish to bearish); the ribbon fill opacity follows the
 * momentum |v1 - v1[5]| relative to its 50-bar high. An ATR glow band, bar colours and triangles at crossings of v2
 * and v1 (away from consolidation) complete the display.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Signal' and 'Bearish Signal', true on the bars of the
 * triangles (v2 crosses under / over v1 away from consolidation).
 *
 * Reference: "Triple Gaussian Smoothed Ribbon [BOSWaves]" by BOSWaves
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BOSWaves
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TripleGaussianSmoothedRibbonInputs {
  /** Main smoothing length */
  slength: number;
  /** Signal length */
  siglen: number;
  /** Sigma (standard deviation) */
  sigma: number;
  src: SourceType;
  bullishColor: string;
  bearishColor: string;
  showCandleColors: boolean;
  /** Minimum signal separation (fraction of v1) */
  minSeparation: number;
  /** Trend strength period */
  trendStrength: number;
}

export const defaultInputs: TripleGaussianSmoothedRibbonInputs = {
  slength: 7,
  siglen: 18,
  sigma: 3.0,
  src: 'close',
  bullishColor: '#4ab2c8',
  bearishColor: '#7f30cb',
  showCandleColors: true,
  minSeparation: 0.03,
  trendStrength: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'slength', type: 'int', title: 'Main Smoothing Length', defval: 7 },
  { id: 'siglen', type: 'int', title: 'Signal Length', defval: 18 },
  { id: 'sigma', type: 'float', title: 'Sigma (Standard Deviation)', defval: 3.0, min: 0.1 },
  { id: 'src', type: 'source', title: 'Data Source', defval: 'close' },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#4ab2c8' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#7f30cb' },
  { id: 'showCandleColors', type: 'bool', title: 'Color Candles', defval: true },
  { id: 'minSeparation', type: 'float', title: 'Minimum Signal Separation %', defval: 0.03, min: 0.0, max: 1.0, step: 0.01 },
  { id: 'trendStrength', type: 'int', title: 'Trend Strength Period', defval: 20, min: 5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Ribbon 1', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Ribbon 2', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Ribbon 3', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Ribbon 4', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Ribbon 5', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Core Gaussian', color: '#4ab2c8', lineWidth: 3 },
  { id: 'plot6', title: 'Glow Upper', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'Glow Lower', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Triple Gaussian Smoothed Ribbon [BOSWaves]',
  shortTitle: 'Triple Gaussian Smoothed Ribbon [BOSWaves]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/**
 * gaussian(source, length, sig): result = sum over i of weight[i] * source[length - 1 - i], added only when
 * bar_index >= i; a missing history value (na) makes the sum na, so the result is na until bar length - 1.
 */
function gaussian(source: number[], length: number, sig: number): number[] {
  const weights: number[] = [];
  let sumWeights = 0.0;
  const center = Math.floor(length / 2);
  for (let i = 0; i <= length - 1; i++) {
    const x = i - center;
    const w = Math.exp(-(x * x) / (2 * sig * sig));
    weights.push(w);
    sumWeights += w;
  }
  for (let i = 0; i < weights.length; i++) weights[i] = weights[i] / sumWeights;
  const n = source.length;
  const out: number[] = new Array(n);
  for (let b = 0; b < n; b++) {
    let result = 0.0;
    for (let i = 0; i <= length - 1; i++) {
      if (b >= i) {
        const k = b - (length - 1 - i);
        result += weights[i] * (k >= 0 ? source[k] : NaN);
      }
    }
    out[b] = result;
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TripleGaussianSmoothedRibbonInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const { slength, siglen, sigma } = cfg;

  const src = A(getSourceSeries(bars, cfg.src));
  // Triple Gaussian smoothing on the source; signal line and ribbon layers on v1
  const v1 = gaussian(gaussian(gaussian(src, slength, sigma), slength, sigma), slength, sigma);
  const v2 = gaussian(v1, siglen, sigma);
  const ribbon2 = gaussian(v1, siglen + 4, sigma);
  const ribbon3 = gaussian(v1, siglen + 8, sigma);
  const ribbon4 = gaussian(v1, siglen + 12, sigma);
  const ribbon5 = gaussian(v1, siglen + 16, sigma);

  // ndist = (dist - ta.lowest(dist, 70)) / (ta.highest(dist, 70) - ta.lowest(dist, 70)) (x / 0: +-infinity or na)
  const dist = v2.map((v, i) => v - v1[i]);
  const distLow = A(ta.lowest(S(dist), 70));
  const distHigh = A(ta.highest(S(dist), 70));
  const ndist = dist.map((d, i) => (d - distLow[i]) / (distHigh[i] - distLow[i]));

  // normMomentum = maxMomentum > 0 ? momentum / maxMomentum : 0
  const momentum = v1.map((v, i) => Math.abs(v - (i >= 5 ? v1[i - 5] : NaN)));
  const maxMomentum = A(ta.highest(S(momentum), 50));
  const normMomentum = momentum.map((m, i) => (gt(maxMomentum[i], 0) ? m / maxMomentum[i] : 0));

  const trendColor = ndist.map((d) => color.from_gradient(d, 0, 1, cfg.bullishColor, cfg.bearishColor));
  const baseOpacity = 35;
  // opacityK = int(baseOpacity + 5 * k - normMomentum * 15) (int() truncates; na stays na)
  const opacity = (k: number) => normMomentum.map((m) => Math.trunc(baseOpacity + 5 * k - m * 15));
  const layer = (k: number) => {
    const op = opacity(k);
    return trendColor.map((c, i) => String(color.new(c, op[i])));
  };

  // atr = ta.atr(14); glow = v1 +- atr * 0.5
  const atr = A(ta.atr(bars, 14));
  const glowUpper = v1.map((v, i) => v + atr[i] * 0.5);
  const glowLower = v1.map((v, i) => v - atr[i] * 0.5);

  // barcolor(showCandleColors ? candleColor : na)
  const barColors: BarColorData[] = [];
  if (cfg.showCandleColors) {
    for (let i = 0; i < n; i++) barColors.push({ time: bars[i].time, color: trendColor[i] });
  }

  // Signals at extremes
  const v1S = S(v1);
  const extremeHigh = A(ta.highest(v1S, 7));
  const extremeLow = A(ta.lowest(v1S, 7));
  const rangeHigh = A(ta.highest(v1S, cfg.trendStrength));
  const rangeLow = A(ta.lowest(v1S, cfg.trendStrength));
  // ta.crossunder(v2, v1) / ta.crossover(v2, v1): exact comparisons
  const v2S = S(v2);
  const crossUnder = A(ta.crossunder(v2S, v1S));
  const crossOver = A(ta.crossover(v2S, v1S));
  const markers: MarkerData[] = [];
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const signalOffset = atr[i] * 1.5;
    // isConsolidating = rangev1 / v1 < minSeparation
    const isConsolidating = lt((rangeHigh[i] - rangeLow[i]) / v1[i], cfg.minSeparation);
    // validBullish = ta.crossunder(v2, v1) and not isConsolidating / validBearish = ta.crossover(v2, v1) and ...
    bullFlags.push(crossUnder[i] === 1 && !isConsolidating);
    bearFlags.push(crossOver[i] === 1 && !isConsolidating);
    // plotshape(validBullish ? extremeLow - signalOffset : na, shape.triangleup, location.absolute, size.normal)
    if (crossUnder[i] === 1 && !isConsolidating) {
      const price = extremeLow[i] - signalOffset;
      if (Number.isFinite(price)) {
        markers.push({ time: bars[i].time, position: 'atPriceMiddle', price, shape: 'triangleUp', color: cfg.bullishColor, size: 'normal' });
      }
    }
    // plotshape(validBearish ? extremeHigh + signalOffset : na, shape.triangledown, location.absolute, size.normal)
    if (crossOver[i] === 1 && !isConsolidating) {
      const price = extremeHigh[i] + signalOffset;
      if (Number.isFinite(price)) {
        markers.push({ time: bars[i].time, position: 'atPriceMiddle', price, shape: 'triangleDown', color: cfg.bearishColor, size: 'normal' });
      }
    }
  }

  const P = (vals: number[]) => bars.map((b, i) => ({ time: b.time, value: vals[i] }));
  const glowColor = trendColor.map((c) => String(color.new(c, 88)));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // p1..p5 = plot(ribbon1..5, display = display.none)
      plot0: P(v1),
      plot1: P(ribbon2),
      plot2: P(ribbon3),
      plot3: P(ribbon4),
      plot4: P(ribbon5),
      // plot(v1, "Core Gaussian", color = trendColor, linewidth = 3)
      plot5: bars.map((b, i) => ({ time: b.time, value: v1[i], color: trendColor[i] })),
      // p_glow_upper / p_glow_lower = plot(v1 +- atr * 0.5, display = display.none)
      plot6: P(glowUpper),
      plot7: P(glowLower),
    },
    fills: [
      // fill(pK, pK+1, color = color.new(trendColor, opacityK))
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Ribbon Layer 1' }, colors: layer(0) },
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Ribbon Layer 2' }, colors: layer(1) },
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Ribbon Layer 3' }, colors: layer(2) },
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Ribbon Layer 4' }, colors: layer(3) },
      // fill(p_glow_upper, p_glow_lower, color = color.new(trendColor, 88))
      { plot1: 'plot6', plot2: 'plot7', options: { title: 'Outer Glow' }, colors: glowColor },
    ],
    barColors,
    markers,
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions (no message: the default one) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Signal', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Bearish Signal', message: 'Alert Fired!' },
];

export const TripleGaussianSmoothedRibbon = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
