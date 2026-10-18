/**
 * Bollinger Adaptive Trend Navigator
 *
 * An adaptive average of the source whose smoothing factor grows with the distance of the source from the middle of
 * its Bollinger Bands, scaled by the band width relative to its average: alpha = clamp(2 / (period + 1) *
 * (1 + |adaptive factor|), 0.01, 0.5). The trend value is 0.7 * the adaptive average + 0.3 * an EMA of the band
 * middle. A trailing line follows it inside an ATR band (trend value +- ATR * multiplier): it only moves when the band
 * pushes it. The line is bullish while it last rose, bearish while it last fell; a gradient fill runs from the line
 * to hl2, and the candles can be coloured. Presets override the lengths and multipliers.
 * Alerts (alertcondition, `alerts` of the result): 'Bollinger Adaptive Trend Bullish' / 'Bearish' on the bar where
 * the line turns bullish / bearish.
 *
 * Reference: "Bollinger Adaptive Trend Navigator [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bollinger Adaptive Trend Bullish', message: 'Bollinger Adaptive Trend Bullish Signal {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Bollinger Adaptive Trend Bearish', message: 'Bollinger Adaptive Trend Bearish Signal {{exchange}}:{{ticker}}' },
];

export interface BollingerAdaptiveTrendNavigatorInputs {
  bbPeriod: number;
  bbStdDev: number;
  centerSmoothing: number;
  adaptiveMultiplier: number;
  volatilityPeriod: number;
  volatilityMultiplier: number;
  priceSource: SourceType;
  inputPreset: 'Default' | 'Scalping' | 'Swing Trading';
  colorPreset: 'Classic' | 'Aqua' | 'Cosmic' | 'Custom';
  bullColor: string;
  bearColor: string;
  paintBars: boolean;
}

export const defaultInputs: BollingerAdaptiveTrendNavigatorInputs = {
  bbPeriod: 20,
  bbStdDev: 2.0,
  centerSmoothing: 5,
  adaptiveMultiplier: 1.0,
  volatilityPeriod: 14,
  volatilityMultiplier: 1.5,
  priceSource: 'close',
  inputPreset: 'Default',
  colorPreset: 'Custom',
  bullColor: '#00ffaa',
  bearColor: '#ff0000',
  paintBars: false,
};

const G_TREND = '════════ Trend Settings ════════';
const G_VIS = '════════ Visualization Settings ════════';

export const inputConfig: InputConfig[] = [
  { id: 'bbPeriod', type: 'int', title: 'Bollinger Band Period', defval: 20, min: 2, group: G_TREND },
  { id: 'bbStdDev', type: 'float', title: 'BB Standard Deviation', defval: 2.0, min: 0.1, step: 0.1, group: G_TREND },
  { id: 'centerSmoothing', type: 'int', title: 'Center Line Smoothing', defval: 5, min: 1, group: G_TREND },
  { id: 'adaptiveMultiplier', type: 'float', title: 'Adaptive Multiplier', defval: 1.0, min: 0.1, step: 0.1, group: G_TREND },
  { id: 'volatilityPeriod', type: 'int', title: 'Volatility Period', defval: 14, min: 1, group: G_TREND },
  { id: 'volatilityMultiplier', type: 'float', title: 'Volatility Multiplier', defval: 1.5, min: 0.1, step: 0.1, group: G_TREND },
  { id: 'priceSource', type: 'source', title: 'Price Source', defval: 'close', group: G_TREND },
  { id: 'inputPreset', type: 'string', title: 'Preconfigured Input Preset', defval: 'Default', options: ['Default', 'Scalping', 'Swing Trading'], group: G_TREND },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Custom'], group: G_VIS },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa', group: G_VIS },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#ff0000', group: G_VIS },
  { id: 'paintBars', type: 'bool', title: 'Color Candles', defval: false, group: G_VIS },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bollinger Adaptive Trend Line', color: '#ff0000', lineWidth: 4 },
  { id: 'plot1', title: 'Price', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Bollinger Adaptive Trend Navigator [QuantAlgo]',
  shortTitle: 'Bollinger Adaptive Trend Navigator [QuantAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a != b beyond 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<BollingerAdaptiveTrendNavigatorInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  let { bbPeriod, bbStdDev, centerSmoothing, adaptiveMultiplier, volatilityPeriod, volatilityMultiplier } = cfg;
  if (cfg.inputPreset === 'Scalping') {
    [bbPeriod, bbStdDev, centerSmoothing, adaptiveMultiplier, volatilityPeriod, volatilityMultiplier] = [12, 1.8, 3, 1.5, 10, 1.0];
  } else if (cfg.inputPreset === 'Swing Trading') {
    [bbPeriod, bbStdDev, centerSmoothing, adaptiveMultiplier, volatilityPeriod, volatilityMultiplier] = [30, 2.2, 8, 0.8, 20, 2.2];
  }
  const presets: Record<string, [string, string]> = {
    Classic: ['#00ff00', '#ff0000'],
    Aqua: ['#00bfff', '#ff8c00'],
    Cosmic: ['#ff1493', '#9932cc'],
    Custom: [cfg.bullColor, cfg.bearColor],
  };
  const [bullish, bearish] = presets[cfg.colorPreset] ?? presets.Custom;

  // bollingerAdaptiveTrend(source, ...)
  const source = A(getSourceSeries(bars, cfg.priceSource));
  const srcS = S(source);
  const bbMiddle = A(ta.sma(srcS, bbPeriod));
  const bbStd = A(ta.stdev(srcS, bbPeriod));
  const bbUpper = bbMiddle.map((m, i) => m + bbStdDev * bbStd[i]);
  const bbLower = bbMiddle.map((m, i) => m - bbStdDev * bbStd[i]);
  const smoothedCenter = A(ta.ema(S(bbMiddle), centerSmoothing));
  const bandWidth = bbUpper.map((u, i) => u - bbLower[i]);
  const avgBandWidth = A(ta.sma(S(bandWidth), bbPeriod));
  const trendValue: number[] = new Array(n);
  let adaptiveTrend = NaN; // var float adaptiveTrend = source (first bar), then set on every bar
  for (let i = 0; i < n; i++) {
    const src = source[i];
    // na != na is false: 0.5 while the bands are na
    const bbPosition = ne(bbUpper[i], bbLower[i]) ? (src - bbLower[i]) / (bbUpper[i] - bbLower[i]) : 0.5;
    const bandWidthRatio = ne(avgBandWidth[i], 0) ? bandWidth[i] / avgBandWidth[i] : 1;
    const adaptiveFactor = (bbPosition - 0.5) * 2 * adaptiveMultiplier * bandWidthRatio;
    const alpha = Math.max(0.01, Math.min(0.5, (2.0 / (bbPeriod + 1)) * (1 + Math.abs(adaptiveFactor))));
    const prev = i === 0 ? src : adaptiveTrend; // var initial value on bar 0
    adaptiveTrend = alpha * src + (1 - alpha) * (isNaN(prev) ? src : prev);
    trendValue[i] = 0.7 * adaptiveTrend + 0.3 * smoothedCenter[i];
  }

  const atr = A(ta.atr(bars, volatilityPeriod));
  const trendLine: number[] = new Array(n);
  const isBull: boolean[] = new Array(n);
  let tl = NaN; // var float trendLine = bollingerTrendValue (first bar)
  let bull = false;
  // var bool isBearish = false: false until the line first falls (isBullish is false before it first rises)
  let bear = false;
  const bullFlags: boolean[] = new Array(n);
  const bearFlags: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const deviation = atr[i] * volatilityMultiplier;
    const upperBound = trendValue[i] + deviation;
    const lowerBound = trendValue[i] - deviation;
    const prev = i === 0 ? trendValue[0] : tl;
    tl = isNaN(prev) ? trendValue[i] : prev;
    if (lt(upperBound, tl)) tl = upperBound;
    if (gt(lowerBound, tl)) tl = lowerBound;
    trendLine[i] = tl;
    const prevTl = i > 0 ? trendLine[i - 1] : NaN;
    const wasBull = bull;
    const wasBear = bear;
    if (gt(tl, prevTl)) {
      bull = true;
      bear = false;
    } else if (lt(tl, prevTl)) {
      bull = false;
      bear = true;
    }
    isBull[i] = bull;
    // alertcondition(isBullish and not isBullish[1]) / alertcondition(isBearish and not isBearish[1])
    bullFlags[i] = bull && !wasBull;
    bearFlags[i] = bear && !wasBear;
  }

  const current = isBull.map((b) => (b ? bullish : bearish));
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const barColors: BarColorData[] = cfg.paintBars ? bars.map((b, i) => ({ time: b.time, color: current[i] })) : [];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: trendLine[i], color: current[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: hl2[i] })),
    },
    // fill(p_trend, p_price, hl2, trendLine, na, color.new(currentTrend, 20))
    fills: [{
      plot1: 'plot0',
      plot2: 'plot1',
      gradient: {
        topValue: hl2,
        bottomValue: trendLine,
        topColor: hl2.map((): string | null => null),
        bottomColor: current.map((c): string | null => String(color.new(c, 20))),
      },
    }],
    barColors,
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

export const BollingerAdaptiveTrendNavigator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
