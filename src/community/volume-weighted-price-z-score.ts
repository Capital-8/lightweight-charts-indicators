/**
 * Volume-Weighted Price Z-Score
 *
 * Log deviation of the source from its volume-weighted moving average: d = log(src / vwma(src, lookback)). The raw
 * z-score is d / stdev(d, lookback), smoothed by an EMA. The line and the bars take a gradient colour: grey at 0 to
 * the positive colour at +threshold, the negative colour at -threshold to grey at 0. A gradient fill joins the line
 * to zero; levels at +/- threshold (dashed in Pine), +/- 1 and +/- 2 (dotted in Pine, +/- 2 hidden).
 * Presets replace the lookback and the smoothing (Fast Response 50 / 3, Smooth Trend 200 / 8).
 *
 * Alerts (alertcondition, `alerts` of the result): the z-score crossing into (over +threshold, under -threshold) and
 * out of the extreme zones, crossing over / under zero, and entering either extreme zone.
 *
 * Reference: "Volume-Weighted Price Z-Score [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type VWPZPreset = 'Default' | 'Fast Response' | 'Smooth Trend';
export type VWPZColorPreset = 'Classic' | 'Aqua' | 'Cosmic' | 'Ember' | 'Neon' | 'Custom';

export interface VolumeWeightedPriceZScoreInputs {
  /** Price source */
  priceSource: SourceType;
  /** VWMA and volatility length */
  lookbackPeriod: number;
  /** EMA length of the z-score */
  smoothingPeriod: number;
  /** Preset: replaces the lookback and the smoothing */
  presetConfig: VWPZPreset;
  /** Extreme level */
  extremeThreshold: number;
  colorPreset: VWPZColorPreset;
  positiveColor: string;
  negativeColor: string;
  /** Transparency of the fill on the z-score side */
  fillTransparency: number;
  enableBarColoring: boolean;
}

export const defaultInputs: VolumeWeightedPriceZScoreInputs = {
  priceSource: 'close',
  lookbackPeriod: 100,
  smoothingPeriod: 5,
  presetConfig: 'Default',
  extremeThreshold: 2.5,
  colorPreset: 'Custom',
  positiveColor: '#ff0000',
  negativeColor: '#00ffaa',
  fillTransparency: 70,
  enableBarColoring: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'priceSource', type: 'source', title: 'Price Source', defval: 'close' },
  { id: 'lookbackPeriod', type: 'int', title: 'Lookback Period', defval: 100 },
  { id: 'smoothingPeriod', type: 'int', title: 'Smoothing Period', defval: 5, min: 1 },
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'extremeThreshold', type: 'float', title: 'Extreme Threshold', defval: 2.5, min: 1.0, max: 4.0, step: 0.5 },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Ember', 'Neon', 'Custom'] },
  { id: 'positiveColor', type: 'color', title: 'Positive Deviation Color', defval: '#ff0000' },
  { id: 'negativeColor', type: 'color', title: 'Negative Deviation Color', defval: '#00ffaa' },
  { id: 'fillTransparency', type: 'int', title: 'Fill Transparency', defval: 70, min: 0, max: 100 },
  { id: 'enableBarColoring', type: 'bool', title: 'Enable Bar Coloring', defval: true },
];

const GRAY50 = String(color.new(color.gray, 50));
const NEUTRAL = '#808080';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Z-Score', color: NEUTRAL, lineWidth: 3 },
  // Pine linestyle = plot.linestyle_dotted (dashed for the extreme levels): PlotConfig has no line style, drawn solid
  { id: 'plot1', title: 'Zero Line', color: GRAY50, lineWidth: 1 },
  { id: 'plot2', title: 'Extreme Positive Level', color: '#ff0000', lineWidth: 1 },
  { id: 'plot3', title: 'Extreme Negative Level', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot4', title: '+2σ', color: GRAY50, lineWidth: 1, display: 'none' },
  { id: 'plot5', title: '-2σ', color: GRAY50, lineWidth: 1, display: 'none' },
  { id: 'plot6', title: '+1σ', color: GRAY50, lineWidth: 1 },
  { id: 'plot7', title: '-1σ', color: GRAY50, lineWidth: 1 },
];

export const metadata = {
  title: 'Volume-Weighted Price Z-Score [QuantAlgo]',
  shortTitle: 'Volume-Weighted Price Z-Score [QuantAlgo]',
  overlay: false,
};

/** [positive, negative] colours of the presets */
const PRESETS: Record<Exclude<VWPZColorPreset, 'Custom'>, [string, string]> = {
  Classic: ['#ff0000', '#00ff00'],
  Aqua: ['#ff8c00', '#00bfff'],
  Cosmic: ['#9932cc', '#49ffce'],
  Ember: ['#00cccc', '#ff6600'],
  Neon: ['#ff00ff', '#ffff00'],
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeWeightedPriceZScoreInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  let lookback = cfg.lookbackPeriod;
  let smoothing = cfg.smoothingPeriod;
  if (cfg.presetConfig === 'Fast Response') {
    lookback = 50;
    smoothing = 3;
  } else if (cfg.presetConfig === 'Smooth Trend') {
    lookback = 200;
    smoothing = 8;
  }
  const [positiveColor, negativeColor] = cfg.colorPreset === 'Custom'
    ? [cfg.positiveColor, cfg.negativeColor] : PRESETS[cfg.colorPreset];
  const thr = cfg.extremeThreshold;

  const src = getSourceSeries(bars, cfg.priceSource);
  const srcArr = A(src);
  const vwmaArr = A(ta.vwma(src, lookback, S(bars.map((b) => b.volume ?? NaN))));
  // logDeviation = math.log(priceSource / volumeWeightedAverage)
  const logDev = srcArr.map((s, i) => (vwmaArr[i] === 0 ? NaN : Math.log(s / vwmaArr[i])));
  const vol = A(ta.stdev(S(logDev), lookback));
  // rawZScore = logDeviation / volatilityMeasure (x / 0 = na)
  const raw = logDev.map((d, i) => (vol[i] === 0 ? NaN : d / vol[i]));
  const z = A(ta.ema(S(raw), smoothing));

  // gradientColor = zScore > 0 ? from_gradient(z, 0, thr, neutral, positive) : from_gradient(z, -thr, 0, negative, neutral)
  const grad = z.map((v) => (gt(v, 0)
    ? color.from_gradient(v, 0, thr, NEUTRAL, positiveColor)
    : color.from_gradient(v, -thr, 0, negativeColor, NEUTRAL)));

  // Signals of the alertconditions
  const crossAboveZero = crossedOver(z, 0);
  const crossBelowZero = crossedUnder(z, 0);
  const enterExtremePositive = crossedOver(z, thr);
  const enterExtremeNegative = crossedUnder(z, -thr);
  const exitExtremePositive = crossedUnder(z, thr);
  const exitExtremeNegative = crossedOver(z, -thr);
  const anyExtreme = enterExtremePositive.map((v, i) => v || enterExtremeNegative[i]);

  const t = (i: number) => bars[i].time;
  const line = (value: number, c: string) => bars.map((b) => ({ time: b.time, value, color: c }));
  const topT = cfg.fillTransparency;
  const bottomT = Math.min(cfg.fillTransparency + 20, 100);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((_b, i) => ({ time: t(i), value: z[i], color: grad[i] })),
      plot1: line(0, GRAY50),
      plot2: line(thr, positiveColor),
      plot3: line(-thr, negativeColor),
      plot4: line(2, GRAY50),
      plot5: line(-2, GRAY50),
      plot6: line(1, GRAY50),
      plot7: line(-1, GRAY50),
    },
    fills: [
      // fill(zScorePlot, zeroLinePlot, zScore, 0, color.new(gradientColor, fillTransparency),
      //      color.new(gradientColor, math.min(fillTransparency + 20, 100)), title = 'Z-Score Fill')
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Z-Score Fill' },
        gradient: {
          topValue: z.slice(),
          bottomValue: new Array<number>(n).fill(0),
          topColor: grad.map((c) => String(color.new(c, topT))),
          bottomColor: grad.map((c) => String(color.new(c, bottomT))),
        } },
    ],
    // barcolor(enableBarColoring ? gradientColor : na, title = 'Z-Score Bar Color')
    barColors: cfg.enableBarColoring ? bars.map((_b, i) => ({ time: t(i), color: grad[i] })) : [],
    alerts: alertStates(alertConditions, bars, [
      enterExtremePositive, enterExtremeNegative, exitExtremePositive, exitExtremeNegative,
      crossAboveZero, crossBelowZero, anyExtreme,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Extreme Overbought', message: 'VWPZ: Extreme OVERBOUGHT condition detected! {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Extreme Oversold', message: 'VWPZ: Extreme OVERSOLD condition detected! {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Exit Extreme Overbought', message: 'VWPZ: Exiting extreme overbought zone {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert3', title: 'Exit Extreme Oversold', message: 'VWPZ: Exiting extreme oversold zone {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert4', title: 'Bullish Mean Reversion', message: 'VWPZ: Crossed above zero - Bullish momentum {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert5', title: 'Bearish Mean Reversion', message: 'VWPZ: Crossed below zero - Bearish momentum {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert6', title: 'Any Extreme Level', message: 'VWPZ: Extreme deviation detected! Check chart {{exchange}}:{{ticker}} - {{interval}}' },
];

export const VolumeWeightedPriceZScore = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
