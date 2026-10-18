/**
 * Adaptive Entropy Trend
 *
 * Shannon entropy of the log returns of the last `Entropy Lookback` bars (10-bin histogram between the lowest and
 * the highest return of the window), normalised by log2(10). An adaptive EMA of the close uses
 * alpha = 2 / (lookback * (0.3 + 1.4 * entropy) + 1): it is faster when the returns are concentrated (trend) and
 * slower when they are spread (noise). Bands around it: ATR(lookback) * multiplier * (0.5 + 1 - entropy), inner
 * (fast multiplier) and outer (slow multiplier). The trend turns up when the close is above the inner upper band and
 * down when it is below the inner lower band; the bands, fills and candles take the trend colour.
 * Presets replace the lookback and the multipliers (Fast Response 12 / 1.4 / 2.8, Smooth Trend 40 / 2.2 / 4.5).
 * Alerts (alertcondition, `alerts` of the result): the trend turns bullish, bearish, or either.
 *
 * Reference: "Adaptive Entropy Trend [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type AdaptiveEntropyTrendPreset = 'Default' | 'Fast Response' | 'Smooth Trend';
export type AdaptiveEntropyTrendColorPreset = 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom';

export interface AdaptiveEntropyTrendInputs {
  /** Entropy and ATR lookback */
  lookbackLen: number;
  /** Inner band multiplier */
  fastMultiplier: number;
  /** Outer band multiplier */
  slowMultiplier: number;
  /** Preset: replaces the lookback and the multipliers */
  presetConfig: AdaptiveEntropyTrendPreset;
  colorPreset: AdaptiveEntropyTrendColorPreset;
  bullColor: string;
  bearColor: string;
  /** Transparency of the outer fills (inner fill: + 6) */
  fillTransparency: number;
  enableBarcolor: boolean;
}

export const defaultInputs: AdaptiveEntropyTrendInputs = {
  lookbackLen: 25,
  fastMultiplier: 1.8,
  slowMultiplier: 3.5,
  presetConfig: 'Default',
  colorPreset: 'Custom',
  bullColor: '#00ffaa',
  bearColor: '#ff0000',
  fillTransparency: 88,
  enableBarcolor: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookbackLen', type: 'int', title: 'Entropy Lookback', defval: 25, min: 5 },
  { id: 'fastMultiplier', type: 'float', title: 'Fast Band Multiplier', defval: 1.8, step: 0.1 },
  { id: 'slowMultiplier', type: 'float', title: 'Slow Band Multiplier', defval: 3.5, step: 0.1 },
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullColor', type: 'color', title: 'Bull Color', defval: '#00ffaa' },
  { id: 'bearColor', type: 'color', title: 'Bear Color', defval: '#ff0000' },
  { id: 'fillTransparency', type: 'int', title: 'Fill Transparency', defval: 88, min: 0, max: 100 },
  { id: 'enableBarcolor', type: 'bool', title: 'Enable Bar Coloring', defval: true },
];

const NEUTRAL = '#787b86';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Outer Upper', color: String(color.new(NEUTRAL, 90)), lineWidth: 1 },
  { id: 'plot1', title: 'Inner Upper', color: String(color.new(NEUTRAL, 70)), lineWidth: 1 },
  { id: 'plot2', title: 'Adaptive EMA', color: NEUTRAL, lineWidth: 3 },
  { id: 'plot3', title: 'Inner Lower', color: String(color.new(NEUTRAL, 70)), lineWidth: 1 },
  { id: 'plot4', title: 'Outer Lower', color: String(color.new(NEUTRAL, 90)), lineWidth: 1 },
];

export const metadata = {
  title: 'Adaptive Entropy Trend [QuantAlgo]',
  shortTitle: 'Adaptive Entropy Trend [QuantAlgo]',
  overlay: true,
};

/** [bull, bear] colours of the presets */
const PRESETS: Record<Exclude<AdaptiveEntropyTrendColorPreset, 'Custom'>, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveEntropyTrendInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  let len = cfg.lookbackLen;
  let fastMult = cfg.fastMultiplier;
  let slowMult = cfg.slowMultiplier;
  if (cfg.presetConfig === 'Fast Response') {
    len = 12;
    fastMult = 1.4;
    slowMult = 2.8;
  } else if (cfg.presetConfig === 'Smooth Trend') {
    len = 40;
    fastMult = 2.2;
    slowMult = 4.5;
  }
  const [bullColor, bearColor] = cfg.colorPreset === 'Custom' ? [cfg.bullColor, cfg.bearColor] : PRESETS[cfg.colorPreset];

  const histBins = 10;
  // logReturn = math.log(close / close[1])
  const logReturn = bars.map((b, i) => (i > 0 ? Math.log(b.close / bars[i - 1].close) : NaN));
  const lrS = Series.fromArray(bars, logReturn);
  const minReturn = A(ta.lowest(lrS, len));
  const maxReturn = A(ta.highest(lrS, len));
  const atr = A(ta.atr(bars, len));
  const maxEntropy = Math.log(histBins) / Math.log(2);

  const outerUpper: number[] = new Array(n);
  const innerUpper: number[] = new Array(n);
  const ema: number[] = new Array(n);
  const innerLower: number[] = new Array(n);
  const outerLower: number[] = new Array(n);
  const trendColor: string[] = new Array(n);
  const direction: number[] = new Array(n);
  let adaptiveEma = NaN; // var float adaptiveEma = na
  let trendDirection = 0; // var int trendDirection = 0
  for (let b = 0; b < n; b++) {
    const returnRange = maxReturn[b] - minReturn[b];
    let entropy = 0.0;
    if (gt(returnRange, 0)) {
      const binCounts = new Array<number>(histBins).fill(0);
      for (let i = 0; i < len; i++) {
        const lr = b - i >= 0 ? logReturn[b - i] : NaN;
        // binIndex = math.floor((logReturn[i] - minReturn) / returnRange * (histBins - 1)), clamped to 0..histBins - 1
        const binIndex = Math.min(Math.max(Math.floor(((lr - minReturn[b]) / returnRange) * (histBins - 1)), 0), histBins - 1);
        if (isNaN(binIndex)) continue;
        binCounts[binIndex] += 1.0;
      }
      for (let i = 0; i < histBins; i++) {
        const probability = binCounts[i] / len;
        if (gt(probability, 0)) entropy = entropy - (probability * Math.log(probability)) / Math.log(2);
      }
    }
    const normalizedEntropy = gt(maxEntropy, 0) ? entropy / maxEntropy : 0.5;
    const adaptiveAlpha = 2.0 / (len * (0.3 + normalizedEntropy * 1.4) + 1.0);
    const close = bars[b].close;
    adaptiveEma = isNaN(adaptiveEma) ? close : adaptiveEma + adaptiveAlpha * (close - adaptiveEma);
    const trendStrength = 1.0 - normalizedEntropy;
    const fastBandWidth = atr[b] * fastMult * (0.5 + trendStrength);
    const slowBandWidth = atr[b] * slowMult * (0.5 + trendStrength);
    ema[b] = adaptiveEma;
    innerUpper[b] = adaptiveEma + fastBandWidth;
    innerLower[b] = adaptiveEma - fastBandWidth;
    outerUpper[b] = adaptiveEma + slowBandWidth;
    outerLower[b] = adaptiveEma - slowBandWidth;

    if (gt(close, innerUpper[b])) trendDirection = 1;
    else if (lt(close, innerLower[b])) trendDirection = -1;
    direction[b] = trendDirection;
    trendColor[b] = trendDirection === 1 ? bullColor : trendDirection === -1 ? bearColor : NEUTRAL;
  }

  const t = (i: number) => bars[i].time;
  const P = (v: number[], transp: number) => bars.map((_b, i) => ({ time: t(i), value: v[i], color: String(color.new(trendColor[i], transp)) }));
  const outerT = cfg.fillTransparency;
  const innerT = Math.min(cfg.fillTransparency + 6, 100);
  const fillColors = (transp: number) => trendColor.map((c) => String(color.new(c, transp)));
  // trendTurnedBullish = trendDirection == 1 and trendDirection[1] != 1 (na on the first bar: false), bearish alike
  const turnedBull = direction.map((d, i) => d === 1 && i > 0 && direction[i - 1] !== 1);
  const turnedBear = direction.map((d, i) => d === -1 && i > 0 && direction[i - 1] !== -1);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P(outerUpper, 90),
      plot1: P(innerUpper, 70),
      plot2: bars.map((_b, i) => ({ time: t(i), value: ema[i], color: trendColor[i] })),
      plot3: P(innerLower, 70),
      plot4: P(outerLower, 90),
    },
    fills: [
      // fill(plotOuterUpper, plotInnerUpper, color = color.new(trendColor, outerFillTransparency))
      { plot1: 'plot0', plot2: 'plot1', colors: fillColors(outerT) },
      // fill(plotInnerUpper, plotInnerLower, color = color.new(trendColor, innerFillTransparency))
      { plot1: 'plot1', plot2: 'plot3', colors: fillColors(innerT) },
      // fill(plotInnerLower, plotOuterLower, color = color.new(trendColor, outerFillTransparency))
      { plot1: 'plot3', plot2: 'plot4', colors: fillColors(outerT) },
    ],
    // barcolor(enableBarcolor ? color.new(trendColor, 20) : na, title = 'Trend Bar Color')
    barColors: cfg.enableBarcolor ? bars.map((_b, i) => ({ time: t(i), color: String(color.new(trendColor[i], 20)) })) : [],
    // alertcondition(trendTurnedBullish / trendTurnedBearish / trendChanged, ...)
    alerts: alertStates(alertConditions, bars, [turnedBull, turnedBear, turnedBull.map((v, i) => v || turnedBear[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Signal', message: 'Adaptive Entropy Trend: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Trend Signal', message: 'Adaptive Entropy Trend: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Trend Direction Changed', message: 'Adaptive Entropy Trend: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}' },
];

export const AdaptiveEntropyTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
