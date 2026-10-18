/**
 * Smart Money Flow Signals [QuantAlgo]
 *
 * Composite wave = 0.5 * momentum wave + 0.3 * Chaikin flow wave + 0.2 * money flow wave:
 * - momentum wave: EMA(trend period) of a volume-weighted channel index, (source - EMA) / (0.015 * EMA of the absolute
 *   deviation) * (1 + 0.5 * log(volume / SMA(volume) + 1)), with EMAs over the momentum channel period;
 * - Chaikin flow wave: 100 * Chaikin Money Flow over the trend period;
 * - money flow wave: (Money Flow Index over the MFI period - 50) * 1.2.
 * The wave is filled to zero with a gradient whose opacity follows the wave, volume and flow alignment strength;
 * an SMA of the wave is the smoothed trend line, and bars take a bearish-to-bullish gradient of the wave.
 * The presets replace the four periods, as in Pine.
 * Alerts (alertcondition, `alerts` of the result): wave crossing above / below zero, either, reversals from the
 * overbought / oversold levels (as the original writes them: at or beyond the level and crossing back on the same
 * bar, so they never fire), and the wave at or beyond the overbought / oversold level.
 *
 * Reference: "Smart Money Flow Signals [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type SmartMoneyPreset = 'Default' | 'Fast Response' | 'Smooth Trend';
export type SmartMoneyColorPreset = 'Classic' | 'Aqua' | 'Cosmic' | 'Ember' | 'Neon' | 'Custom';

export interface SmartMoneyFlowSignalsInputs {
  /** Price source */
  source: SourceType;
  /** Momentum channel period (EMA length of the channel index) */
  momentumChannelPeriod: number;
  /** Trend period: momentum wave EMA, Chaikin money flow and volume average */
  trendPeriod: number;
  /** Money Flow Index period */
  mfiPeriod: number;
  /** SMA length of the smoothed trend line */
  signalSmoothing: number;
  /** Preset; other than Default it replaces the four periods above */
  presetConfig: SmartMoneyPreset;
  /** Overbought level (scale of the fill strength) */
  overboughtLevel: number;
  /** Oversold level */
  oversoldLevel: number;
  /** Colour preset; Custom uses bullColor / bearColor */
  colorPreset: SmartMoneyColorPreset;
  bullColor: string;
  bearColor: string;
  /** Colour the price bars with the wave gradient */
  enableBarColoring: boolean;
  /** Show the smoothed trend line */
  showSmoothedLine: boolean;
}

export const defaultInputs: SmartMoneyFlowSignalsInputs = {
  source: 'hlc3',
  momentumChannelPeriod: 10,
  trendPeriod: 21,
  mfiPeriod: 14,
  signalSmoothing: 4,
  presetConfig: 'Default',
  overboughtLevel: 60,
  oversoldLevel: -60,
  colorPreset: 'Custom',
  bullColor: '#00ffaa',
  bearColor: '#ff0000',
  enableBarColoring: true,
  showSmoothedLine: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Price Source', defval: 'hlc3' },
  { id: 'momentumChannelPeriod', type: 'int', title: 'Momentum Channel Period', defval: 10, min: 1 },
  { id: 'trendPeriod', type: 'int', title: 'Trend Period', defval: 21, min: 1 },
  { id: 'mfiPeriod', type: 'int', title: 'Money Flow Index Period', defval: 14, min: 1 },
  { id: 'signalSmoothing', type: 'int', title: 'Signal Smoothing', defval: 4, min: 1 },
  { id: 'presetConfig', type: 'string', title: 'Preconfigured Preset', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'overboughtLevel', type: 'float', title: 'Overbought Level', defval: 60, min: 20, max: 100, step: 5 },
  { id: 'oversoldLevel', type: 'float', title: 'Oversold Level', defval: -60, min: -100, max: -20, step: 5 },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Ember', 'Neon', 'Custom'] },
  { id: 'bullColor', type: 'color', title: 'Bullish Flow Color', defval: '#00ffaa' },
  { id: 'bearColor', type: 'color', title: 'Bearish Flow Color', defval: '#ff0000' },
  { id: 'enableBarColoring', type: 'bool', title: 'Enable Bar Coloring', defval: true },
  { id: 'showSmoothedLine', type: 'bool', title: 'Show Smoothed Trend Line', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero', color: color.gray, lineWidth: 1 },
  { id: 'plot1', title: 'Smart Money Flow', color: '#00ffaa', lineWidth: 3 },
  { id: 'plot2', title: 'Smoothed Trend', color: color.white, lineWidth: 1 },
  { id: 'plot3', title: 'Overbought', color: color.gray, lineWidth: 1 },
  { id: 'plot4', title: 'Oversold', color: color.gray, lineWidth: 1 },
];

export const metadata = {
  title: 'Smart Money Flow Signals [QuantAlgo]',
  shortTitle: 'Smart Money Flow Signals',
  overlay: false,
};

const COLOR_PRESETS: Record<Exclude<SmartMoneyColorPreset, 'Custom'>, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00bfff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Ember: ['#ff6600', '#00cccc'],
  Neon: ['#ffff00', '#ff00ff'],
};

// Pine compares floats with a tolerance of 1e-10. A comparison with na is false, `na != 0` too (Pine:
// channel_index is 0 while the deviation is na, the money flow index 100 while the sums are na).
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** Division whose denominator is guarded by the Pine code (or is |overbought level| >= 20): never 0 here */
const div = (a: number, b: number) => (b === 0 ? NaN : a / b);

export function calculate(
  bars: Bar[],
  inputs: Partial<SmartMoneyFlowSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  let { momentumChannelPeriod, trendPeriod, mfiPeriod, signalSmoothing } = cfg;
  if (cfg.presetConfig === 'Fast Response') {
    momentumChannelPeriod = 7;
    trendPeriod = 14;
    mfiPeriod = 10;
    signalSmoothing = 2;
  } else if (cfg.presetConfig === 'Smooth Trend') {
    momentumChannelPeriod = 14;
    trendPeriod = 30;
    mfiPeriod = 21;
    signalSmoothing = 7;
  }
  const { overboughtLevel, oversoldLevel } = cfg;
  const [bullishColor, bearishColor] = cfg.colorPreset === 'Custom'
    ? [cfg.bullColor, cfg.bearColor] : COLOR_PRESETS[cfg.colorPreset];
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.source));
  const volume = bars.map((b) => b.volume ?? NaN);

  // Money Flow Index
  // raw_money_flow = source * volume; positive_flow = source >= source[1] ? raw : 0; negative_flow = source < source[1] ? raw : 0
  const rawMoneyFlow = src.map((s, i) => s * volume[i]);
  const positiveFlow = src.map((s, i) => (i > 0 && ge(s, src[i - 1]) ? rawMoneyFlow[i] : 0));
  const negativeFlow = src.map((s, i) => (i > 0 && lt(s, src[i - 1]) ? rawMoneyFlow[i] : 0));
  const positiveMoneyFlow = A(math.sum(S(positiveFlow), mfiPeriod) as Series);
  const negativeMoneyFlow = A(math.sum(S(negativeFlow), mfiPeriod) as Series);
  // money_flow_index = negative_money_flow != 0 ? 100 - 100 / (1 + positive / negative) : 100
  const moneyFlowIndex = negativeMoneyFlow.map((neg, i) =>
    ne(neg, 0) ? 100 - div(100, 1 + div(positiveMoneyFlow[i], neg)) : 100);

  // Chaikin Money Flow
  // money_flow_multiplier = high != low ? (close - low - (high - close)) / (high - low) : 0
  const moneyFlowVolume = bars.map((b, i) =>
    (ne(b.high, b.low) ? div(b.close - b.low - (b.high - b.close), b.high - b.low) : 0) * volume[i]);
  const volumeSma = A(ta.sma(S(volume), trendPeriod));
  // chaikin_money_flow = volume_sma != 0 ? ta.sma(money_flow_volume, trend_period) / volume_sma : 0
  // Pine runs ta.sma of the ternary branch only on the bars where volume_sma != 0: its window holds the last
  // trend_period values of those bars. With the na volume_sma of the first bars, the CMF is 0 on bars
  // 0 .. trend_period - 2, then na until the call has trend_period values.
  const called = volumeSma.map((vs) => ne(vs, 0));
  const calledIdx = bars.map((_b, i) => i).filter((i) => called[i]);
  const calledSma = A(ta.sma(Series.fromArray(calledIdx.map((i) => bars[i]), calledIdx.map((i) => moneyFlowVolume[i])), trendPeriod));
  const mfvSma: number[] = new Array(n).fill(NaN);
  calledIdx.forEach((i, k) => { mfvSma[i] = calledSma[k]; });
  const chaikinMoneyFlow = volumeSma.map((vs, i) => (called[i] ? div(mfvSma[i], vs) : 0));

  // Volume analysis: volume_strength = volume_average != 0 ? volume / volume_average : 1 (volume_average = volume_sma)
  const volumeStrength = volumeSma.map((va, i) => (ne(va, 0) ? div(volume[i], va) : 1));
  const volumeWeight = volumeStrength.map((v) => Math.log(v + 1));

  // Not computed: pressure_ratio (buy / sell pressure, used by no output of the original).

  // Volume-weighted momentum
  const esa = A(ta.ema(S(src), momentumChannelPeriod));
  const deviation = A(ta.ema(S(src.map((s, i) => Math.abs(s - esa[i]))), momentumChannelPeriod));
  // channel_index = deviation != 0 ? (source - esa) / (0.015 * deviation) * (1 + volume_weight * 0.5) : 0
  const channelIndex = deviation.map((d, i) =>
    (ne(d, 0) ? div(src[i] - esa[i], 0.015 * d) * (1 + volumeWeight[i] * 0.5) : 0));

  // Composite wave
  const momentumWave = A(ta.ema(S(channelIndex), trendPeriod));
  const compositeWave = momentumWave.map((m, i) =>
    m * 0.5 + chaikinMoneyFlow[i] * 100 * 0.3 + (moneyFlowIndex[i] - 50) * 1.2 * 0.2);
  const smoothedWave = A(ta.sma(S(compositeWave), signalSmoothing));

  const bullLow = String(color.new(bullishColor, 85));
  const bullHigh = String(color.new(bullishColor, 20));
  const bearLow = String(color.new(bearishColor, 85));
  const bearHigh = String(color.new(bearishColor, 20));
  const bullLine = String(color.new(bullishColor, 0));
  const bearLine = String(color.new(bearishColor, 0));

  const wavePlot: { time: number; value: number; color: string }[] = [];
  const fillColors: string[] = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const w = compositeWave[i];
    // wave_strength_percent = |composite_wave| / |overbought_level| * 100
    const waveStrength = div(Math.abs(w), Math.abs(overboughtLevel)) * 100;
    // volume_intensity_percent = math.min(volume_strength, 2.5) / 2.5 * 100
    const volumeIntensity = (Math.min(volumeStrength[i], 2.5) / 2.5) * 100;
    // flow_alignment_percent = cmf > 0 and wave > 0 or cmf < 0 and wave < 0 ? 100 : 50
    const flowAlignment = (gt(chaikinMoneyFlow[i], 0) && gt(w, 0)) || (lt(chaikinMoneyFlow[i], 0) && lt(w, 0)) ? 100 : 50;
    const totalStrength = waveStrength * 0.4 + volumeIntensity * 0.4 + flowAlignment * 0.2;
    // wave_fill_color = composite_wave > 0 ? gradient_bullish_color : gradient_bearish_color
    const up = gt(w, 0);
    fillColors.push(String(up
      ? color.from_gradient(totalStrength, 0, 100, bullLow, bullHigh)
      : color.from_gradient(totalStrength, 0, 100, bearLow, bearHigh)));
    // plot(composite_wave, 'Smart Money Flow', color = composite_wave > 0 ? bullish : bearish, linewidth = 3)
    wavePlot.push({ time: t, value: w, color: up ? bullLine : bearLine });
    // barcolor(enable_bar_coloring ? color.from_gradient(composite_wave, -70, 70, bearish_color, bullish_color) : na)
    if (cfg.enableBarColoring) {
      barColors.push({ time: t, color: String(color.from_gradient(w, -70, 70, bearishColor, bullishColor)) });
    }
  }

  // Signals of the alertconditions
  const bullishSignal = crossedOver(compositeWave, 0);
  const bearishSignal = crossedUnder(compositeWave, 0);
  const extremeOverbought = compositeWave.map((w) => ge(w, overboughtLevel));
  const extremeOversold = compositeWave.map((w) => le(w, oversoldLevel));
  const obCross = crossedUnder(compositeWave, overboughtLevel);
  const osCross = crossedOver(compositeWave, oversoldLevel);
  const overboughtReversal = extremeOverbought.map((x, i) => x && obCross[i]);
  const oversoldReversal = extremeOversold.map((x, i) => x && osCross[i]);
  const anyChange = bullishSignal.map((x, i) => x || bearishSignal[i]);

  const constant = (v: number) => bars.map((b) => ({ time: b.time, value: v }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: constant(0),
      plot1: wavePlot,
      plot2: bars.map((b, i) => ({ time: b.time, value: cfg.showSmoothedLine ? smoothedWave[i] : NaN })),
      plot3: constant(overboughtLevel),
      plot4: constant(oversoldLevel),
    },
    // fill(wave_plot, zero_line_plot, color = wave_fill_color, title = 'Flow Gradient')
    fills: [{ plot1: 'plot1', plot2: 'plot0', options: { title: 'Flow Gradient' }, colors: fillColors }],
    markers: [],
    barColors,
    alerts: alertStates(alertConditions, bars, [
      bullishSignal, bearishSignal, anyChange, overboughtReversal, oversoldReversal, extremeOverbought, extremeOversold,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Flow', message: 'Smart Money Flow: BULLISH crossover detected! Money flowing INTO {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Flow', message: 'Smart Money Flow: BEARISH crossover detected! Money flowing OUT of {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Any Flow Direction Change', message: 'Smart Money Flow: Direction change detected! Check chart {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert3', title: 'Overbought Reversal', message: 'Smart Money Flow: OVERBOUGHT reversal signal! Potential bearish reversal {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert4', title: 'Oversold Reversal', message: 'Smart Money Flow: OVERSOLD reversal signal! Potential bullish reversal {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert5', title: 'Extreme Overbought', message: 'Smart Money Flow: EXTREME overbought conditions! {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert6', title: 'Extreme Oversold', message: 'Smart Money Flow: EXTREME oversold conditions! {{exchange}}:{{ticker}} - {{interval}}' },
];

export const SmartMoneyFlowSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
