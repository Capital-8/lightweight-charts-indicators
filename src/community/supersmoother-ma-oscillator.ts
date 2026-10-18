/**
 * SuperSmoother MA Oscillator
 *
 * The source is smoothed with a 2-pole SuperSmoother; the oscillator is EMA(fast) - EMA(slow) of the smoothed price,
 * with an EMA(25) signal line and their difference as a histogram. The oscillator colour is a hue from red to green
 * (HSV) set by the tanh-normalised acceleration of the oscillator. Crosses of the signal line larger than
 * ATR * sensitivity give buy / sell triangles on the price pane (larger when the oscillator momentum agrees),
 * a background tint, fills to zero and to the signal line, and bar colours.
 *
 * Reference: "SuperSmoother MA Oscillator" by BOSWaves
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';

export interface SuperSmootherMAOscillatorInputs {
  smoothingLength: number;
  fastLength: number;
  slowLength: number;
  srcMA: SourceType;
  atrLength: number;
  /** Pine input, not used by the Pine calculation */
  atrMultiplier: number;
  signalSensitivity: number;
  showVortexFill: boolean;
  fillTransparency: number;
  enhancedColors: boolean;
  enableCandleColor: boolean;
}

export const defaultInputs: SuperSmootherMAOscillatorInputs = {
  smoothingLength: 5,
  fastLength: 20,
  slowLength: 50,
  srcMA: 'close',
  atrLength: 20,
  atrMultiplier: 1.2,
  signalSensitivity: 0.03,
  showVortexFill: true,
  fillTransparency: 85,
  enhancedColors: true,
  enableCandleColor: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'smoothingLength', type: 'int', title: 'Price Smoothing Length', defval: 5 },
  { id: 'fastLength', type: 'int', title: 'Fast MA', defval: 20 },
  { id: 'slowLength', type: 'int', title: 'Slow MA', defval: 50 },
  { id: 'srcMA', type: 'source', title: 'Source Data', defval: 'close' },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 20 },
  { id: 'atrMultiplier', type: 'float', title: 'ATR Multiplier', defval: 1.2 },
  { id: 'signalSensitivity', type: 'float', title: 'Signal Sensitivity', defval: 0.03, min: 0.01, max: 1.0, step: 0.01 },
  { id: 'showVortexFill', type: 'bool', title: 'Show Vortex Fill', defval: true },
  { id: 'fillTransparency', type: 'int', title: 'Fill Transparency', defval: 85, min: 0, max: 100 },
  { id: 'enhancedColors', type: 'bool', title: 'Enhanced Colors', defval: true },
  { id: 'enableCandleColor', type: 'bool', title: 'Enable Candle Coloring', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Oscillator', color: color.yellow, lineWidth: 2 },
  { id: 'plot1', title: 'Signal Line', color: '#FF6B35', lineWidth: 1 },
  { id: 'plot2', title: 'Histogram', color: '#00FF7F', lineWidth: 1, style: 'histogram' },
  { id: 'plot3', title: 'Zero Line Plot', color: 'transparent', lineWidth: 1 },
];

export const metadata = {
  title: 'SuperSmoother MA Oscillator',
  shortTitle: 'SuperSmoother MA Oscillator',
  overlay: false,
};

/** Pine hsv_to_rgb(h, s, v) of the script: color.rgb(int((r + m) * 255), ...); Pine color.rgb takes an na channel as 0 */
function hsvToRgb(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const ch = [r, g, b].map((k) => {
    const v255 = Math.trunc((k + m) * 255);
    return isNaN(v255) ? 0 : v255;
  });
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SuperSmootherMAOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.srcMA));

  // supersmoother(src, length): ss := c1 * (src + nz(src[1])) / 2 + c2 * nz(ss[1]) + c3 * nz(ss[2])
  const a1 = Math.exp((-1.414 * 3.14159) / cfg.smoothingLength);
  const c2 = 2.0 * a1 * Math.cos((1.414 * 3.14159) / cfg.smoothingLength);
  const c3 = -a1 * a1;
  const c1 = 1 - c2 - c3;
  const nz = (v: number) => (isNaN(v) ? 0 : v);
  const ss: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    ss[i] = (c1 * (src[i] + nz(i > 0 ? src[i - 1] : NaN))) / 2 + c2 * nz(i > 0 ? ss[i - 1] : NaN) + c3 * nz(i > 1 ? ss[i - 2] : NaN);
  }

  const fast = A(ta.ema(S(ss), cfg.fastLength));
  const slow = A(ta.ema(S(ss), cfg.slowLength));
  const osc = fast.map((v, i) => v - slow[i]);
  const accelRaw = osc.map((v, i) => (i > 0 ? v - osc[i - 1] : NaN));
  const accelSmooth = A(ta.ema(S(accelRaw), 3));
  const atr20 = A(ta.atr(bars, 20));
  // tanh(x) = (e^2x - 1) / (e^2x + 1); hue_raw = 60 + accel_norm * 60
  const hueRaw = accelSmooth.map((v, i) => {
    const ex = Math.exp(2 * (v / (atr20[i] * 0.01)));
    return 60 + ((ex - 1) / (ex + 1)) * 60;
  });
  // hue = na(hue_raw[1]) ? hue_raw : (hue_raw + hue_raw[1]) / 2
  const hue = hueRaw.map((h, i) => (i === 0 || isNaN(hueRaw[i - 1]) ? h : (h + hueRaw[i - 1]) / 2));

  const signal = A(ta.ema(S(osc), 25));
  const atr = A(ta.atr(bars, cfg.atrLength));

  const oscPlot: { time: number; value: number; color: string }[] = [];
  const histPlot: { time: number; value: number; color: string }[] = [];
  const oscFill: string[] = [];
  const crossFill: string[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const green = cfg.enhancedColors ? '#00FF7F' : color.green;
  const red = cfg.enhancedColors ? '#FF1493' : color.red;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const o = osc[i];
    const s = signal[i];
    const oscColor = cfg.enhancedColors ? hsvToRgb(hue[i], 1.0, 1.0) : color.yellow;
    oscPlot.push({ time: t, value: o, color: oscColor });
    histPlot.push({ time: t, value: o - s, color: String(color.new(o > s ? green : red, 70)) });
    oscFill.push(cfg.showVortexFill ? String(color.new(o > 0 ? green : red, cfg.fillTransparency)) : 'transparent');
    crossFill.push(cfg.showVortexFill
      ? String(color.new(o > s ? color.blue : color.purple, cfg.fillTransparency + 10)) : 'transparent');

    // bullishSignal = ta.crossover(osc, signal) and |osc - signal| > atr * signalSensitivity
    const minThreshold = atr[i] * cfg.signalSensitivity;
    const big = Math.abs(o - s) > minThreshold;
    const bull = i > 0 && o > s && osc[i - 1] <= signal[i - 1] && big;
    const bear = i > 0 && o < s && osc[i - 1] >= signal[i - 1] && big;
    const momentum = i > 0 ? o - osc[i - 1] : NaN;
    if (bull) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'small', forceOverlay: true, id: 'shape0' });
    if (bear) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small', forceOverlay: true, id: 'shape1' });
    if (bull && momentum > 0) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'normal', forceOverlay: true, id: 'shape2' });
    if (bear && momentum < 0) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: color.maroon, size: 'normal', forceOverlay: true, id: 'shape3' });
    // bgcolor(bullishSignal ? color.new(color.green, 95) : na); bgcolor(bearishSignal ? color.new(color.red, 95) : na)
    if (bull) bgColors.push({ time: t, color: String(color.new(color.green, 95)), id: 'bgcolor0' });
    if (bear) bgColors.push({ time: t, color: String(color.new(color.red, 95)), id: 'bgcolor1' });
    // candleColor: green above the signal, red below, gray otherwise (also when a value is na)
    if (cfg.enableCandleColor) barColors.push({ time: t, color: o > s ? color.green : o < s ? color.red : color.gray, id: 'barcolor0' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: oscPlot,
      plot1: bars.map((b, i) => ({ time: b.time, value: signal[i], color: cfg.enhancedColors ? '#FF6B35' : color.orange })),
      plot2: histPlot,
      plot3: bars.map((b) => ({ time: b.time, value: 0 })),
    },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dashed' } }],
    fills: [
      { plot1: 'plot0', plot2: 'plot3', colors: oscFill },
      { plot1: 'plot0', plot2: 'plot1', colors: crossFill },
    ],
    markers,
    barColors,
    bgColors,
  };
}

export const SuperSmootherMAOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
