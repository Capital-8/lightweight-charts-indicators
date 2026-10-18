/**
 * FSVZO [Alpha Extract]
 *
 * A volume-weighted momentum oscillator. The price change and the relative volume (volume / SMA of volume) are
 * EMA-smoothed; their product (70 %) and the product with a trend factor (30 %: 1 +/- 0.1 from the distance of a
 * short and a long SMA of the close in standard deviations) is smoothed again. The EMAs of the positive and negative
 * momentum give a ratio r and vzo_raw = 100 * (r - 1) / (r + 1). The oscillator is 60 % of an EMA of vzo_raw plus
 * 40 % of an exponentially weighted average (clamped to -100..100), with an SMA signal line and a flow momentum line
 * (oscillator - its EMA) / 2. Colours move between the primary and secondary colours with the momentum intensity.
 * Circles mark the turns of the oscillator, crosses / triangles the turns beyond +/-90, and pivot divergences
 * (regular and hidden) give lines and labels.
 * Alerts (alertcondition, `alerts` of the result): the oscillator crossing its signal line, and the same crosses
 * beyond -80 / +80 (reversals).
 *
 * Reference: "FSVZO [Alpha Extract]" by AlphaExtract
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export type FsvzoGradientStyle = 'Modern' | 'Ocean' | 'Sunset' | 'Aurora' | 'Neon';

export interface FsvzoInputs {
  /** VZO length */
  length: number;
  /** Signal line (SMA) length */
  signalLength: number;
  /** Period of the exponential smoothing */
  smoothingLength: number;
  /** Number of periods of the Fourier-based smoothing */
  fourierLength: number;
  /** Window of the trend filter (ADF test approximation) */
  adfWindow: number;
  /** Overbought level (not used by the outputs, as in the original script) */
  overboughtLevel: number;
  /** Oversold level (not used by the outputs, as in the original script) */
  oversoldLevel: number;
  /** EMA length of the flow momentum */
  momentumLookback: number;
  enableVolumeDynamics: boolean;
  enableFlowMomentum: boolean;
  enableSignalMarkers: boolean;
  /** Confirm the flip markers on bar close (historical bars are always confirmed) */
  confirmOnClose: boolean;
  enableStandardBullDiv: boolean;
  enableHiddenBullDiv: boolean;
  enableStandardBearDiv: boolean;
  enableHiddenBearDiv: boolean;
  /** Use the colours of the gradient style instead of the manual colours */
  useColorPalette: boolean;
  /** Preset palette (also gives the neutral colours) */
  gradientStyle: FsvzoGradientStyle;
  manualBullPrimary: string;
  manualBullSecondary: string;
  manualBearPrimary: string;
  manualBearSecondary: string;
  pivotBarsRight: number;
  pivotBarsLeft: number;
}

export const defaultInputs: FsvzoInputs = {
  length: 9,
  signalLength: 3,
  smoothingLength: 3,
  fourierLength: 31,
  adfWindow: 50,
  overboughtLevel: 60,
  oversoldLevel: 40,
  momentumLookback: 14,
  enableVolumeDynamics: true,
  enableFlowMomentum: true,
  enableSignalMarkers: true,
  confirmOnClose: true,
  enableStandardBullDiv: true,
  enableHiddenBullDiv: true,
  enableStandardBearDiv: true,
  enableHiddenBearDiv: true,
  useColorPalette: false,
  gradientStyle: 'Modern',
  manualBullPrimary: '#13fed9',
  manualBullSecondary: '#13fed9',
  manualBearPrimary: '#f23744',
  manualBearSecondary: '#f23744',
  pivotBarsRight: 1,
  pivotBarsLeft: 10,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'VZO Length', defval: 9, min: 1 },
  { id: 'signalLength', type: 'int', title: 'Signal Line Length', defval: 3, min: 1 },
  { id: 'smoothingLength', type: 'int', title: 'Smoothing Period', defval: 3, min: 1 },
  { id: 'fourierLength', type: 'int', title: 'Fourier Approx. Length', defval: 31, min: 5 },
  { id: 'adfWindow', type: 'int', title: 'ADF Test Approx. Window', defval: 50, min: 10 },
  { id: 'overboughtLevel', type: 'int', title: 'Overbought Level', defval: 60, min: 0, max: 100 },
  { id: 'oversoldLevel', type: 'int', title: 'Oversold Level', defval: 40, min: 0, max: 100 },
  { id: 'momentumLookback', type: 'int', title: 'Flow Momentum Lookback', defval: 14, min: 1 },
  { id: 'enableVolumeDynamics', type: 'bool', title: 'Enable Volume Dynamics', defval: true },
  { id: 'enableFlowMomentum', type: 'bool', title: 'Enable Flow Momentum', defval: true },
  { id: 'enableSignalMarkers', type: 'bool', title: 'Enable Signal Markers', defval: true },
  { id: 'confirmOnClose', type: 'bool', title: 'Confirm Markers on Bar Close', defval: true },
  { id: 'enableStandardBullDiv', type: 'bool', title: 'Standard Bullish Divergence', defval: true },
  { id: 'enableHiddenBullDiv', type: 'bool', title: 'Hidden Bullish Divergence', defval: true },
  { id: 'enableStandardBearDiv', type: 'bool', title: 'Standard Bearish Divergence', defval: true },
  { id: 'enableHiddenBearDiv', type: 'bool', title: 'Hidden Bearish Divergence', defval: true },
  { id: 'useColorPalette', type: 'bool', title: 'Use Color Palette', defval: false },
  { id: 'gradientStyle', type: 'string', title: 'Gradient Style', defval: 'Modern', options: ['Modern', 'Ocean', 'Sunset', 'Aurora', 'Neon'] },
  { id: 'manualBullPrimary', type: 'color', title: 'Bull Primary Color', defval: '#13fed9' },
  { id: 'manualBullSecondary', type: 'color', title: 'Bull Secondary Color', defval: '#13fed9' },
  { id: 'manualBearPrimary', type: 'color', title: 'Bear Primary Color', defval: '#f23744' },
  { id: 'manualBearSecondary', type: 'color', title: 'Bear Secondary Color', defval: '#f23744' },
  { id: 'pivotBarsRight', type: 'int', title: 'Pivot Right Bars', defval: 1 },
  { id: 'pivotBarsLeft', type: 'int', title: 'Pivot Left Bars', defval: 10 },
];

/** Preset colours per gradient style: bull primary / secondary, bear primary / secondary, neutral primary / secondary */
const PALETTES: Record<FsvzoGradientStyle, [string, string, string, string, string, string]> = {
  Modern: ['#00D4FF', '#0099CC', '#FF6B6B', '#CC5555', '#4ECDC4', '#45B7D1'],
  Ocean: ['#4FC3F7', '#29B6F6', '#FF5722', '#E64A19', '#26C6DA', '#00ACC1'],
  Sunset: ['#FFB74D', '#FF9800', '#E91E63', '#C2185B', '#FF7043', '#FF5722'],
  Aurora: ['#81C784', '#66BB6A', '#BA68C8', '#AB47BC', '#64B5F6', '#42A5F5'],
  Neon: ['#00ffa6', '#00ffa6', '#FF1744', '#D50000', '#00B0FF', '#0091EA'],
};

const DEFAULT_BLUE = '#2962FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Enhanced Reference Line', color: String(color.new('#45B7D1', 70)), lineWidth: 1 },
  { id: 'plot1', title: 'Enhanced Flow Momentum', color: String(color.new('#13fed9', 60)), lineWidth: 1 },
  { id: 'plot2', title: 'Enhanced Volume Dynamics', color: '#13fed9', lineWidth: 1 },
  { id: 'plot3', title: 'Enhanced Signal Line', color: String(color.new('#13fed9', 40)), lineWidth: 1 },
  { id: 'plot4', title: 'Boundary', color: DEFAULT_BLUE, lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Upper Extreme', color: DEFAULT_BLUE, lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Lower Extreme', color: DEFAULT_BLUE, lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'Upper Threshold', color: DEFAULT_BLUE, lineWidth: 1, display: 'none' },
  { id: 'plot8', title: 'Lower Threshold', color: DEFAULT_BLUE, lineWidth: 1, display: 'none' },
  { id: 'plot9', title: 'Enhanced Bull Divergence', color: '#13fed9', lineWidth: 1 },
  { id: 'plot10', title: 'Enhanced Hidden Bull Divergence', color: String(color.new('#13fed9', 50)), lineWidth: 1 },
  { id: 'plot11', title: 'Enhanced Bear Divergence', color: '#f23744', lineWidth: 1 },
  { id: 'plot12', title: 'Enhanced Hidden Bear Divergence', color: String(color.new('#f23744', 50)), lineWidth: 1 },
];

export const metadata = {
  title: 'FSVZO [Alpha Extract]',
  shortTitle: 'FSVZO [Alpha Extract]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<FsvzoInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  // ── VZO ──
  // adf_trend_filter(close, adfWindow): 1 + clamp((sma(close, window / 3) - sma(close, window)) / stdev * 0.2, +/-0.1)
  let trend: number[];
  if (cfg.adfWindow > 10) {
    // window / 3: a fractional length is truncated (checked: 50 / 3 gives the SMA of 16 bars)
    const smaShort = A(ta.sma(S(close), Math.max(1, Math.trunc(cfg.adfWindow / 3))));
    const smaLong = A(ta.sma(S(close), cfg.adfWindow));
    const vol = A(ta.stdev(S(close), cfg.adfWindow));
    trend = bars.map((_b, i) => {
      const strength = gt(vol[i], 0) ? (smaShort[i] - smaLong[i]) / vol[i] : 0;
      return 1.0 + Math.max(-0.1, Math.min(0.1, strength * 0.2));
    });
  } else {
    trend = new Array(n).fill(1.0);
  }
  const volSma = A(ta.sma(S(bars.map((b) => b.volume ?? NaN)), cfg.length));
  // rel_volume = volume / ta.sma(volume, length): a plain division (x / 0 is +-infinity, 0 / 0 NaN)
  const relVolume = bars.map((b, i) => (b.volume ?? NaN) / volSma[i]);
  const smoothedVol = A(ta.ema(S(relVolume), cfg.smoothingLength));
  const priceChange = bars.map((b, i) => (i > 0 ? b.close - bars[i - 1].close : NaN));
  const smoothedChange = A(ta.ema(S(priceChange), cfg.smoothingLength));
  const baseMomentum = A(ta.ema(S(bars.map((_b, i) => smoothedChange[i] * smoothedVol[i])), cfg.smoothingLength));
  const trendMomentum = A(ta.ema(S(bars.map((_b, i) => smoothedChange[i] * smoothedVol[i] * trend[i])), cfg.smoothingLength));
  const momentum = bars.map((_b, i) => baseMomentum[i] * 0.7 + trendMomentum[i] * 0.3);
  // math.max(na, 0) is na
  const posMom = A(ta.ema(S(momentum.map((m) => (isNaN(m) ? NaN : Math.max(m, 0)))), cfg.length));
  const negMom = A(ta.ema(S(momentum.map((m) => (isNaN(m) ? NaN : Math.abs(Math.min(m, 0))))), cfg.length));
  const vzoRaw = bars.map((_b, i) => {
    const ratio = gt(negMom[i], 0.00001) ? posMom[i] / negMom[i] : gt(posMom[i], 0.00001) ? 100.0 : 1.0;
    return (100.0 * (ratio - 1.0)) / (ratio + 1.0);
  });
  const emaRaw = A(ta.ema(S(vzoRaw), cfg.smoothingLength));
  const vzo = bars.map((_b, i) => {
    let finalVzo: number;
    if (cfg.fourierLength >= 5) {
      // fourier_smooth(vzo_raw, fourierLength): weights exp(-k / (length * 0.3)), vzo_raw[k] na before the first bar
      let sum = 0;
      let weightSum = 0;
      for (let k = 0; k < cfg.fourierLength; k++) {
        const weight = Math.exp(-k / (cfg.fourierLength * 0.3));
        sum = sum + (i - k >= 0 ? vzoRaw[i - k] : NaN) * weight;
        weightSum = weightSum + weight;
      }
      finalVzo = emaRaw[i] * 0.6 + (sum / weightSum) * 0.4;
    } else {
      finalVzo = emaRaw[i];
    }
    return Math.min(Math.max(finalVzo, -100), 100);
  });
  const signal = A(ta.sma(S(vzo), cfg.signalLength));

  // ── Colours ──
  const pal = PALETTES[cfg.gradientStyle] ?? PALETTES.Modern;
  const bullPrimary = cfg.useColorPalette ? pal[0] : cfg.manualBullPrimary;
  const bullSecondary = cfg.useColorPalette ? pal[1] : cfg.manualBullSecondary;
  const bearPrimary = cfg.useColorPalette ? pal[2] : cfg.manualBearPrimary;
  const bearSecondary = cfg.useColorPalette ? pal[3] : cfg.manualBearSecondary;
  const neutralPrimary = pal[4];
  const neutralSecondary = pal[5];

  // intensity = max_strength > 0 ? momentum_strength / max_strength : 0
  const momentumStrength = A(ta.change(S(vzo), 3)).map((v) => Math.abs(v));
  const maxStrength = A(ta.highest(S(momentumStrength), 50));
  const intensity = bars.map((_b, i) => (gt(maxStrength[i], 0) ? momentumStrength[i] / maxStrength[i] : 0));

  // get_dynamic_color: RGB between the primary and the secondary colour (math.round of na is na: channel 0)
  const dynColor = (isBullish: boolean, strength: number): string => {
    const c1 = isBullish ? bullPrimary : bearPrimary;
    const c2 = isBullish ? bullSecondary : bearSecondary;
    const mix = (a: number, b: number) => Math.round(a + (b - a) * strength);
    return String(color.rgb(mix(color.r(c1), color.r(c2)), mix(color.g(c1), color.g(c2)), mix(color.b(c1), color.b(c2))));
  };

  const rising = bars.map((_b, i) => i > 0 && gt(vzo[i], vzo[i - 1])); // vzoRising = vzo > vzo[1]
  // flow_momentum = (volume_oscillator - ta.ema(volume_oscillator, momentum_lookback)) * 0.5
  const vzoEma = A(ta.ema(S(vzo), cfg.momentumLookback));
  const flow = bars.map((_b, i) => (vzo[i] - vzoEma[i]) * 0.5);

  const t = (i: number) => bars[i].time;
  const interval = barInterval(bars);
  const transparent = String(color.new(color.white, 100));
  const P = (value: (i: number) => number, col?: (i: number) => string): Point[] =>
    bars.map((_b, i) => (col ? { time: t(i), value: value(i), color: col(i) } : { time: t(i), value: value(i) }));

  const zeroColor = String(color.new(neutralSecondary, 70));
  const plots: Record<string, Point[]> = {};
  plots.plot0 = P(() => 0, () => zeroColor);
  // flow_color = flow_momentum > 0 ? color.new(get_dynamic_color(true, intensity), 60) : color.new(..(false..), 60)
  plots.plot1 = P((i) => (cfg.enableFlowMomentum ? flow[i] : NaN),
    (i) => String(color.new(dynColor(gt(flow[i], 0), intensity[i]), 60)));
  plots.plot2 = P((i) => (cfg.enableVolumeDynamics ? vzo[i] : NaN), (i) => dynColor(rising[i], intensity[i]));
  plots.plot3 = P((i) => (cfg.enableVolumeDynamics ? signal[i] : NaN),
    (i) => String(color.new(gt(vzo[i], signal[i]) ? bullSecondary : bearSecondary, 40)));
  // boundary: vzo >= 0 ? math.min(vzo, signal) : math.max(vzo, signal) (display.none)
  plots.plot4 = P((i) => (!cfg.enableVolumeDynamics ? NaN
    : ge(vzo[i], 0) ? Math.min(vzo[i], signal[i]) : Math.max(vzo[i], signal[i])));
  plots.plot5 = P(() => 120);
  plots.plot6 = P(() => -120);
  plots.plot7 = P(() => 80);
  plots.plot8 = P(() => -80);

  // ── Divergences ──
  const rb = cfg.pivotBarsRight;
  const plOsc = A(ta.pivotlow(S(vzo), cfg.pivotBarsLeft, rb));
  const phOsc = A(ta.pivothigh(S(vzo), cfg.pivotBarsLeft, rb));
  const lowPivot = plOsc.map((v) => !isNaN(v));
  const highPivot = phOsc.map((v) => !isNaN(v));
  const vzoR = (i: number) => (i - rb >= 0 ? vzo[i - rb] : NaN);
  const bullDiv: boolean[] = new Array(n).fill(false);
  const hiddenBullDiv: boolean[] = new Array(n).fill(false);
  const bearDiv: boolean[] = new Array(n).fill(false);
  const hiddenBearDiv: boolean[] = new Array(n).fill(false);
  {
    // ta.valuewhen(pivot, x, 1): x on the pivot bar before the latest one (the latest can be the current bar)
    const plO: number[] = [];
    const plL: number[] = [];
    const phO: number[] = [];
    const phH: number[] = [];
    // validate_range(pivot[1]) = 0 <= ta.barssince(pivot[1]) <= 80. Pine v6 `and` is lazy: the barssince of each
    // of the four call sites only runs on the bars where the left side of its `and` is true (its own history).
    const calls = [NaN, NaN, NaN, NaN];
    const validate = (k: number, cond: boolean) => {
      if (cond) calls[k] = 0;
      else if (!isNaN(calls[k])) calls[k]++;
      return -80 <= calls[k] && calls[k] <= 80;
    };
    for (let i = 0; i < n; i++) {
      const o = vzoR(i);
      const lowR = i - rb >= 0 ? bars[i - rb].low : NaN;
      const highR = i - rb >= 0 ? bars[i - rb].high : NaN;
      const prevLow = i > 0 && lowPivot[i - 1];
      const prevHigh = i > 0 && highPivot[i - 1];
      if (lowPivot[i]) {
        plO.push(o);
        plL.push(lowR);
      }
      if (highPivot[i]) {
        phO.push(o);
        phH.push(highR);
      }
      const vwPlO = plO.length >= 2 ? plO[plO.length - 2] : NaN;
      const vwPlL = plL.length >= 2 ? plL[plL.length - 2] : NaN;
      const vwPhO = phO.length >= 2 ? phO[phO.length - 2] : NaN;
      const vwPhH = phH.length >= 2 ? phH[phH.length - 2] : NaN;

      const oscHigherLow = gt(o, vwPlO) && validate(0, prevLow);
      bullDiv[i] = cfg.enableStandardBullDiv && lt(lowR, vwPlL) && oscHigherLow && lowPivot[i];
      const oscLowerLow = lt(o, vwPlO) && validate(1, prevLow);
      hiddenBullDiv[i] = cfg.enableHiddenBullDiv && gt(lowR, vwPlL) && oscLowerLow && lowPivot[i];
      const oscLowerHigh = lt(o, vwPhO) && validate(2, prevHigh);
      bearDiv[i] = cfg.enableStandardBearDiv && gt(highR, vwPhH) && oscLowerHigh && highPivot[i];
      const oscHigherHigh = gt(o, vwPhO) && validate(3, prevHigh);
      hiddenBearDiv[i] = cfg.enableHiddenBearDiv && lt(highR, vwPhH) && oscHigherHigh && highPivot[i];
    }
  }
  const hiddenBullColor = String(color.new(bullPrimary, 50));
  const hiddenBearColor = String(color.new(bearPrimary, 50));
  const bullDivColor = dynColor(true, 0.8);
  const bearDivColor = dynColor(false, 0.8);
  // plot(pivot ? volume_oscillator[pivot_bars_right] : na, offset = -pivot_bars_right): value of bar i on bar i - rb
  const divPlot = (pivot: boolean[], on: boolean[], col: string): Point[] => {
    const out: Point[] = [];
    for (let i = rb; i < n; i++) {
      out.push({ time: barTime(bars, i - rb, interval), value: pivot[i] ? vzoR(i) : NaN, color: on[i] ? col : transparent });
    }
    return out;
  };
  plots.plot9 = divPlot(lowPivot, bullDiv, bullDivColor);
  plots.plot10 = divPlot(lowPivot, hiddenBullDiv, hiddenBullColor);
  plots.plot11 = divPlot(highPivot, bearDiv, bearDivColor);
  plots.plot12 = divPlot(highPivot, hiddenBearDiv, hiddenBearColor);

  // ── Fills ──
  const fills = [
    // fill(main_plot, signal_plot, color.new(get_dynamic_color(vzo > signal, intensity * 0.7), math.round(70 + 20 * (1 - intensity))))
    { plot1: 'plot2', plot2: 'plot3', options: { title: 'Enhanced Dynamic Fill' },
      colors: bars.map((_b, i) => String(color.new(dynColor(gt(vzo[i], signal[i]), intensity[i] * 0.7),
        Math.round(70 + 20 * (1 - intensity[i]))))) },
    // fill(boundary_plot, zero_line, top_value, bottom_value, top_color, bottom_color)
    { plot1: 'plot4', plot2: 'plot0',
      gradient: {
        topValue: signal.map((s) => (gt(s, 0) ? s : 0)),
        bottomValue: signal.map((s) => (gt(s, 0) ? 0 : s)),
        topColor: signal.map((s) => (gt(s, 0) ? String(color.new(dynColor(true, 0.5), 85)) : '#00000000')),
        bottomColor: signal.map((s) => (gt(s, 0) ? '#00000000' : String(color.new(dynColor(false, 0.5), 85)))),
      } },
    // fill(flow_plot, zero_line, color.new(color.from_gradient(+/-flow / 50, 0, 1, neutral_primary, bull / bear primary), 80))
    { plot1: 'plot1', plot2: 'plot0', options: { title: 'Enhanced Flow Fill' },
      colors: flow.map((f) => String(color.new(gt(f, 0)
        ? color.from_gradient(f / 50, 0, 1, neutralPrimary, bullPrimary)
        : color.from_gradient(f / -50, 0, 1, neutralPrimary, bearPrimary), 80))) },
    { plot1: 'plot5', plot2: 'plot7', options: { title: 'Enhanced Overbought Zone' },
      gradient: {
        topValue: new Array<number>(n).fill(120), bottomValue: new Array<number>(n).fill(80),
        topColor: new Array<string>(n).fill(String(color.new(bearPrimary, 60))),
        bottomColor: new Array<string>(n).fill(String(color.new(bearSecondary, 85))),
      } },
    { plot1: 'plot6', plot2: 'plot8', options: { title: 'Enhanced Oversold Zone' },
      gradient: {
        topValue: new Array<number>(n).fill(-80), bottomValue: new Array<number>(n).fill(-120),
        topColor: new Array<string>(n).fill(String(color.new(bullSecondary, 85))),
        bottomColor: new Array<string>(n).fill(String(color.new(bullPrimary, 60))),
      } },
  ];

  // Alerts: ta.crossover / ta.crossunder(volume_oscillator, oscillator_ema)
  const bullFlow = crossedOver(vzo, signal);
  const bearFlow = crossedUnder(vzo, signal);

  // ── Markers ──
  const markers: MarkerData[] = [];
  const showFlips = cfg.enableVolumeDynamics && cfg.enableSignalMarkers;
  const white80 = String(color.new(color.white, 20));
  const bullFull = dynColor(true, 1.0);
  const bearFull = dynColor(false, 1.0);
  const bullLabel = dynColor(true, 0.9);
  const bearLabel = dynColor(false, 0.9);
  for (let i = 0; i < n; i++) {
    // flip_to_bull_bar = bullish and not bullish[1]; flip_to_bear_bar = bearish and not bearish[1] (bearish =
    // not bullish; a bool [1] is false on the first bar). Drawn at vzo[1] with offset -1.
    const bullish = rising[i];
    const bearish = !rising[i];
    const prevBullish = i > 0 && rising[i - 1];
    const prevBearish = i > 0 && !rising[i - 1];
    const flipBull = bullish && !prevBullish;
    const flipBear = bearish && !prevBearish;
    if (showFlips && i > 0 && !isNaN(vzo[i - 1])) {
      if (flipBull) {
        markers.push({ time: t(i - 1), position: 'atPriceMiddle', price: vzo[i - 1], shape: 'circle',
          color: dynColor(true, intensity[i]), size: 'tiny', id: 'shape0' });
      }
      if (flipBear) {
        markers.push({ time: t(i - 1), position: 'atPriceMiddle', price: vzo[i - 1], shape: 'circle',
          color: dynColor(false, intensity[i]), size: 'tiny', id: 'shape1' });
      }
    }
    // bull_signal = ta.crossover(vzo, vzo[1]); bear_signal = ta.crossover(vzo[1], vzo)
    // (exact comparisons, no 1e-10 tolerance; na gives false)
    const v0 = vzo[i];
    const v1 = i > 0 ? vzo[i - 1] : NaN;
    const v2 = i > 1 ? vzo[i - 2] : NaN;
    const bullSignal = v0 > v1 && v1 <= v2;
    const bearSignal = v1 > v0 && v2 <= v1;
    // plotchar outputs char2..char5
    const char = (price: number, text: string, textColor: string, id: string) => markers.push({ time: t(i),
      position: 'atPriceMiddle', price, shape: 'circle', color: 'transparent', text, textColor, size: 'tiny', id });
    if (bullSignal && gt(v0, 90)) char(125, '×', white80, 'char2');
    if (bearSignal && lt(v0, -90)) char(-125, '×', white80, 'char3');
    if (bullSignal && lt(v0, -90)) char(-125, '▲', bullFull, 'char4');
    if (bearSignal && gt(v0, 90)) char(125, '▼', bearFull, 'char5');
    // divergence labels (offset = -pivot_bars_right, at volume_oscillator[pivot_bars_right])
    const o = vzoR(i);
    if (i - rb >= 0 && !isNaN(o)) {
      const lt0 = barTime(bars, i - rb, interval);
      if (bullDiv[i]) markers.push({ time: lt0, position: 'atPriceBottom', price: o, shape: 'labelUp', color: bullLabel,
        text: ' BULL ', textColor: color.white, size: 'tiny', id: 'shape6' });
      if (hiddenBullDiv[i]) markers.push({ time: lt0, position: 'atPriceBottom', price: o, shape: 'labelUp',
        color: hiddenBullColor, text: ' H.BULL ', textColor: color.white, size: 'tiny', id: 'shape7' });
      if (bearDiv[i]) markers.push({ time: lt0, position: 'atPriceTop', price: o, shape: 'labelDown', color: bearLabel,
        text: ' BEAR ', textColor: color.white, size: 'tiny', id: 'shape8' });
      if (hiddenBearDiv[i]) markers.push({ time: lt0, position: 'atPriceTop', price: o, shape: 'labelDown',
        color: hiddenBearColor, text: ' H.BEAR ', textColor: color.white, size: 'tiny', id: 'shape9' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    // alertcondition(ta.crossover(volume_oscillator, oscillator_ema)) / crossunder(...) / crossover(...) and
    // volume_oscillator < -80 / crossunder(...) and volume_oscillator > 80
    alerts: alertStates(alertConditions, bars, [
      bullFlow, bearFlow, bullFlow.map((c, i) => c && lt(vzo[i], -80)), bearFlow.map((c, i) => c && gt(vzo[i], 80)),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Enhanced Bullish Flow Alert', message: '🟢 Enhanced Bullish Flow Detected! {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Enhanced Bearish Flow Alert', message: '🔴 Enhanced Bearish Flow Detected! {{exchange}}:{{ticker}}' },
  { id: 'alert2', title: 'Enhanced Bullish Reversal Alert', message: '🚀 Strong Enhanced Bullish Reversal! {{exchange}}:{{ticker}}' },
  { id: 'alert3', title: 'Enhanced Bearish Reversal Alert', message: '💥 Strong Enhanced Bearish Reversal! {{exchange}}:{{ticker}}' },
];

export const Fsvzo = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
