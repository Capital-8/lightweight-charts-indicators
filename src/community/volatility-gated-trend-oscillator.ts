/**
 * Volatility-Gated Trend Oscillator
 *
 * raw = source - MA(source, length) (SMA, EMA, WMA, HMA or RMA); the noise floor is SMA(|raw|, length) * threshold.
 * When raw is above the noise floor the trend is up and the locked value is raw; below -noise floor the trend is
 * down and the locked value is raw; otherwise the locked value decays by 0.9 per bar. The oscillator is
 * WMA(locked / ATR(length), 5), coloured by the trend, with four fills of decreasing opacity between the oscillator,
 * its 80 %, 55 % and 30 % layers and zero. Optional trend bar colours. Presets override the length, the MA type and
 * the threshold; colour presets override the trend colours.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Trend Signal' / 'Bearish Trend Signal' on the bar the trend
 * state turns to 1 / -1, 'Trend Direction Changed' on either.
 *
 * Reference: "Volatility-Gated Trend Oscillator [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolatilityGatedTrendOscillatorInputs {
  /** Price source */
  src: SourceType;
  /** Filter strength: length of the baseline MA, of the noise floor SMA and of the ATR */
  sensitivity: number;
  /** Baseline MA type */
  maType: 'SMA' | 'EMA' | 'WMA' | 'HMA' | 'RMA';
  /** Noise threshold (multiple of the average absolute deviation) */
  noiseMult: number;
  /** Preset: 'Fast Response' (EMA, 12, 1.1) and 'Smooth Trend' (HMA, 34, 2.0) override the three settings above */
  presetConfig: 'Default' | 'Fast Response' | 'Smooth Trend';
  /** Colour preset ('Custom' uses the two colours below) */
  colorPreset: 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom';
  bullColor: string;
  bearColor: string;
  /** Colour the price bars by the trend */
  enableBarcolor: boolean;
}

export const defaultInputs: VolatilityGatedTrendOscillatorInputs = {
  src: 'hlc3',
  sensitivity: 20,
  maType: 'SMA',
  noiseMult: 1.5,
  presetConfig: 'Default',
  colorPreset: 'Custom',
  bullColor: '#00ffaa',
  bearColor: '#ff0000',
  enableBarcolor: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'hlc3' },
  { id: 'sensitivity', type: 'int', title: 'Filter Strength', defval: 20 },
  { id: 'maType', type: 'string', title: 'Baseline MA Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA', 'HMA', 'RMA'] },
  { id: 'noiseMult', type: 'float', title: 'Noise Threshold', defval: 1.5, step: 0.1 },
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#ff0000' },
  { id: 'enableBarcolor', type: 'bool', title: 'Enable Bar Coloring', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Main', color: '#00ffaa', lineWidth: 2 },
  { id: 'plot1', title: 'Inner Layer', color: 'transparent', lineWidth: 1 },
  { id: 'plot2', title: 'Mid Layer', color: 'transparent', lineWidth: 1 },
  { id: 'plot3', title: 'Outer Layer', color: 'transparent', lineWidth: 1 },
  { id: 'plot4', title: 'Zero', color: 'transparent', lineWidth: 1 },
];

export const metadata = {
  title: 'Volatility-Gated Trend Oscillator [QuantAlgo]',
  shortTitle: 'Volatility-Gated Trend Oscillator [QuantAlgo]',
  overlay: false,
};

const COLOR_PRESETS: Record<string, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolatilityGatedTrendOscillatorInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  let { sensitivity, maType, noiseMult } = cfg;
  if (cfg.presetConfig === 'Fast Response') {
    sensitivity = 12;
    maType = 'EMA';
    noiseMult = 1.1;
  } else if (cfg.presetConfig === 'Smooth Trend') {
    sensitivity = 34;
    maType = 'HMA';
    noiseMult = 2.0;
  }
  const [bullCol, bearCol] = COLOR_PRESETS[cfg.colorPreset] ?? [cfg.bullColor, cfg.bearColor];

  const srcS = getSourceSeries(bars, cfg.src);
  const src = A(srcS);
  const maFns: Record<string, (s: Series, l: number) => Series> = {
    SMA: ta.sma, EMA: ta.ema, WMA: ta.wma, HMA: ta.hma, RMA: ta.rma,
  };
  const baseline = A(maFns[maType](srcS, sensitivity));
  const rawDiff = src.map((v, i) => v - baseline[i]);
  const noiseFloor = A(ta.sma(S(rawDiff.map(Math.abs)), sensitivity)).map((v) => v * noiseMult);
  const atr = A(ta.atr(bars, sensitivity));

  const trend: number[] = new Array(n);
  const normalized: number[] = new Array(n);
  let trendState = 0; // var int trend_state = 0
  let locked = 0.0; // var float locked_val = 0.0
  for (let i = 0; i < n; i++) {
    if (gt(rawDiff[i], noiseFloor[i])) {
      trendState = 1;
      locked = rawDiff[i];
    } else if (lt(rawDiff[i], -noiseFloor[i])) {
      trendState = -1;
      locked = rawDiff[i];
    } else {
      locked = locked * 0.9;
    }
    trend[i] = trendState;
    // locked_val / ta.atr(...): a plain division (x / 0 is +-infinity, which ta.wma skips like na)
    const v = locked / atr[i];
    normalized[i] = Number.isFinite(v) ? v : NaN;
  }
  const finalOsc = A(ta.wma(S(normalized), 5));

  const sigColor = (i: number) => (trend[i] === 1 ? bullCol : trend[i] === -1 ? bearCol : color.gray);
  type Point = { time: number; value: number; color: string };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const fillCols: string[][] = [[], [], [], []];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const c = sigColor(i);
    const hidden = String(color.new(c, 100));
    const f = finalOsc[i];
    plot0.push({ time: t, value: f, color: String(color.new(c, 0)) });
    plot1.push({ time: t, value: f * 0.8, color: hidden });
    plot2.push({ time: t, value: f * 0.55, color: hidden });
    plot3.push({ time: t, value: f * 0.3, color: hidden });
    plot4.push({ time: t, value: 0, color: hidden });
    fillCols[0].push(String(color.new(c, 55)));
    fillCols[1].push(String(color.new(c, 72)));
    fillCols[2].push(String(color.new(c, 84)));
    fillCols[3].push(String(color.new(c, 93)));
    // barcolor(enable_barcolor ? (trend_state != 0 ? color.new(sig_color, 20) : na) : na)
    if (cfg.enableBarcolor && trend[i] !== 0) barColors.push({ time: t, color: String(color.new(c, 20)) });
  }

  // trend_turned_bullish = trend_state == 1 and trend_state[1] != 1 (bearish: -1); trend_changed = either
  const turnedBull = trend.map((v, i) => v === 1 && i > 0 && trend[i - 1] !== 1);
  const turnedBear = trend.map((v, i) => v === -1 && i > 0 && trend[i - 1] !== -1);
  const changed = turnedBull.map((b, i) => b || turnedBear[i]);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: String(color.new(color.white, 75)), linestyle: 'solid', linewidth: 1 } }],
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Luminance Layer 1' }, colors: fillCols[0] },
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Luminance Layer 2' }, colors: fillCols[1] },
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Luminance Layer 3' }, colors: fillCols[2] },
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Luminance Layer 4' }, colors: fillCols[3] },
    ],
    barColors,
    alerts: alertStates(alertConditions, bars, [turnedBull, turnedBear, changed]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Signal', message: 'Volatility-Gated Trend Oscillator: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Trend Signal', message: 'Volatility-Gated Trend Oscillator: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Trend Direction Changed', message: 'Volatility-Gated Trend Oscillator: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}' },
];

export const VolatilityGatedTrendOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
