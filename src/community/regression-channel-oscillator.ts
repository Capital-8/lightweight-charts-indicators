/**
 * Regression Channel Oscillator
 *
 * A linear regression of the previous `len` source values (built from cumulative sums: a = WMA, b = SMA of src[1],
 * line start B = 3a - 2b, slope m = (4b - 3a - B) / (len - 1)), with a channel half width of mult * RMSE of the
 * values around that line. The oscillator is 50 * (src - B) / (mult * RMSE), clamped to -150..150 and smoothed
 * (SMA / EMA / none); the signal line is its SMA. Glow plots, a five-layer fill to zero, band glows coloured when the
 * signal passes its thresholds, and triangles on crosses of the oversold / overbought levels.
 * Alerts (alertcondition, `alerts` of the result): the oscillator crosses over the oversold / under the overbought
 * level, the signal crosses over / under 0, over the MA oversold and under the MA overbought threshold.
 *
 * Reference: "Regression Channel Oscillator" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RegressionChannelOscillatorInputs {
  /** Regression length */
  len: number;
  /** RMSE multiplier (channel) */
  mult: number;
  src: SourceType;
  showSignalLine: boolean;
  signalColorMode: 'Direction' | 'Position vs Zero';
  /** Signal SMA length */
  sigLen: number;
  smoothType: 'None' | 'SMA' | 'EMA';
  smoothLen: number;
  obLevel: number;
  osLevel: number;
  maOverbought: number;
  maOversold: number;
  bullColor: string;
  bearColor: string;
  signalColorBull: string;
  signalColorBear: string;
  obColor: string;
  osColor: string;
  midLineColor: string;
  showOverboughtGradient: boolean;
  showOversoldGradient: boolean;
  showOscillatorGradient: boolean;
  showMaGradient: boolean;
  fillEnabled: boolean;
  fillTransparency: number;
  bandTransparency: number;
}

export const defaultInputs: RegressionChannelOscillatorInputs = {
  len: 50,
  mult: 2.5,
  src: 'close',
  showSignalLine: true,
  signalColorMode: 'Position vs Zero',
  sigLen: 30,
  smoothType: 'SMA',
  smoothLen: 3,
  obLevel: 50,
  osLevel: -50,
  maOverbought: 25,
  maOversold: -25,
  bullColor: 'rgb(22, 193, 67)',
  bearColor: 'rgb(229, 11, 11)',
  signalColorBull: 'rgb(22, 193, 67)',
  signalColorBear: 'rgb(229, 11, 11)',
  obColor: color.red,
  osColor: color.green,
  midLineColor: color.gray,
  showOverboughtGradient: true,
  showOversoldGradient: true,
  showOscillatorGradient: true,
  showMaGradient: true,
  fillEnabled: true,
  fillTransparency: 70,
  bandTransparency: 40,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Regression Length', defval: 50, min: 5 },
  { id: 'mult', type: 'float', title: 'RMSE Multiplier (channel)', defval: 2.5 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'showSignalLine', type: 'bool', title: 'Show Signal MA', defval: true },
  { id: 'signalColorMode', type: 'string', title: 'Signal Color Mode', defval: 'Position vs Zero', options: ['Direction', 'Position vs Zero'] },
  { id: 'sigLen', type: 'int', title: 'Signal SMA Length', defval: 30 },
  { id: 'smoothType', type: 'string', title: 'Smooth Oscillator', defval: 'SMA', options: ['None', 'SMA', 'EMA'] },
  { id: 'smoothLen', type: 'int', title: 'Smooth Length', defval: 3, min: 1 },
  { id: 'obLevel', type: 'float', title: 'Overbought Level', defval: 50, min: 0, max: 150 },
  { id: 'osLevel', type: 'float', title: 'Oversold Level', defval: -50, min: -150, max: 0 },
  { id: 'maOverbought', type: 'float', title: 'MA Overbought Threshold', defval: 25, min: 0, max: 150 },
  { id: 'maOversold', type: 'float', title: 'MA Oversold Threshold', defval: -25, min: -150, max: 0 },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: 'rgb(22, 193, 67)' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: 'rgb(229, 11, 11)' },
  { id: 'signalColorBull', type: 'color', title: 'Signal SMA Bullish', defval: 'rgb(22, 193, 67)' },
  { id: 'signalColorBear', type: 'color', title: 'Signal SMA Bearish', defval: 'rgb(229, 11, 11)' },
  { id: 'obColor', type: 'color', title: 'Overbought Line Color', defval: color.red },
  { id: 'osColor', type: 'color', title: 'Oversold Line Color', defval: color.green },
  { id: 'midLineColor', type: 'color', title: 'Midline 0 Color', defval: color.gray },
  { id: 'showOverboughtGradient', type: 'bool', title: 'Show Overbought Gradient', defval: true },
  { id: 'showOversoldGradient', type: 'bool', title: 'Show Oversold Gradient', defval: true },
  { id: 'showOscillatorGradient', type: 'bool', title: 'Show Oscillator Gradient', defval: true },
  { id: 'showMaGradient', type: 'bool', title: 'Show Moving Average Gradient', defval: true },
  { id: 'fillEnabled', type: 'bool', title: 'Enable Gradient Fill', defval: true },
  { id: 'fillTransparency', type: 'int', title: 'Gradient Fill Transparency', defval: 70, min: 0, max: 100 },
  { id: 'bandTransparency', type: 'int', title: 'Band Gradient Transparency', defval: 40, min: 0, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Overbought Gradient', color: color.gray, lineWidth: 8 },
  { id: 'plot1', title: 'Oversold Gradient', color: color.gray, lineWidth: 8 },
  { id: 'plot2', title: 'Oscillator', color: 'rgb(22, 193, 67)', lineWidth: 3 },
  { id: 'plot3', title: 'Oscillator Gradient', color: 'rgb(22, 193, 67)', lineWidth: 10 },
  { id: 'plot4', title: 'Signal SMA', color: color.gray, lineWidth: 1 },
  { id: 'plot5', title: 'Signal Gradient 1', color: color.gray, lineWidth: 4 },
  { id: 'plot6', title: 'Signal Gradient 2', color: color.gray, lineWidth: 2 },
  { id: 'plot7', title: 'Signal Gradient 3', color: color.gray, lineWidth: 1 },
  { id: 'plot8', title: 'Mid Layer 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot9', title: 'Mid Layer 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot10', title: 'Mid Layer 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot11', title: 'Mid Layer 4', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot12', title: 'Zero Line for Fill', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Regression Channel Oscillator',
  shortTitle: 'Regression Channel Oscillator',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<RegressionChannelOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.len;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const gradientTransparency = 85;

  const src = A(getSourceSeries(bars, cfg.src));
  const ago = (x: number[], i: number, k: number) => (i - k >= 0 ? x[i - k] : NaN);
  const src1 = src.map((_v, i) => ago(src, i, 1)); // src[1]

  // Sum(_src, _len) => a = ta.cum(_src); a - a[_len] (one ta.cum per call)
  const sum = (x: number[]) => {
    const c = A(ta.cum(S(x)));
    return c.map((v, i) => v - ago(c, i, len));
  };
  // Wma(_src, _len) => denom = _len * (_len + 1) / 2; a = ta.cum(_src); (_len * a - Sum(a[1], _len)) / denom
  const denom = (len * (len + 1)) / 2;
  const cumW = A(ta.cum(S(src1)));
  const sumW = sum(cumW.map((_v, i) => ago(cumW, i, 1)));
  const a = cumW.map((v, i) => (len * v - sumW[i]) / denom);
  // b = Sum(src[1], len) / len
  const sumB = sum(src1);
  const b = sumB.map((v) => v / len);

  const osc0: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const A0 = 4 * b[i] - 3 * a[i];
    const B = 3 * a[i] - 2 * b[i];
    const m = (A0 - B) / (len - 1);
    // for i = 0 to len - 1: l = B + m * i; d += math.pow(src[i + 1] - l, 2)
    let d = 0.0;
    for (let k = 0; k <= len - 1; k++) {
      const l = B + m * k;
      d += Math.pow(ago(src, i, k + 1) - l, 2);
    }
    const rmse = Math.sqrt(d / (len - 1)) * cfg.mult;
    // rawOsc = rmse != 0 ? (src - mid) / rmse : 0.0 (na != 0 is false: 0.0 while rmse is na)
    const rawOsc = ne(rmse, 0) ? (src[i] - B) / rmse : 0.0;
    const o = rawOsc * 50;
    osc0[i] = Math.max(Math.min(o, 150), -150);
  }

  const osc = cfg.smoothType === 'SMA' ? A(ta.sma(S(osc0), cfg.smoothLen))
    : cfg.smoothType === 'EMA' ? A(ta.ema(S(osc0), cfg.smoothLen)) : osc0;
  const signal = A(ta.sma(S(osc), cfg.sigLen));

  // Signal colour
  const gray = color.gray;
  const sigColor = signal.map((s, i) => {
    let c = gray;
    if (cfg.signalColorMode === 'Direction') {
      const p = ago(signal, i, 1);
      c = gt(s, p) ? cfg.signalColorBull : lt(s, p) ? cfg.signalColorBear : gray;
    }
    if (cfg.signalColorMode === 'Position vs Zero') {
      c = gt(s, 0) ? cfg.signalColorBull : lt(s, 0) ? cfg.signalColorBear : gray;
    }
    return c;
  });
  const lineColor = osc.map((o) => (gt(o, 0) ? cfg.bullColor : cfg.bearColor));

  const plots: Record<string, Point[]> = {};
  const P = (f: (i: number) => Point): Point[] => bars.map((_b, i) => f(i));
  const t = (i: number) => bars[i].time;
  const showSig = cfg.showSignalLine;
  const showSigGrad = cfg.showSignalLine && cfg.showMaGradient;
  // plot(showOverboughtGradient ? obLevel : na, color = color.new(signal >= maOverbought ? obColor : color.gray, bandTransparency), linewidth = 8)
  plots.plot0 = P((i) => ({
    time: t(i), value: cfg.showOverboughtGradient ? cfg.obLevel : NaN,
    color: String(color.new(ge(signal[i], cfg.maOverbought) ? cfg.obColor : gray, cfg.bandTransparency)),
  }));
  plots.plot1 = P((i) => ({
    time: t(i), value: cfg.showOversoldGradient ? cfg.osLevel : NaN,
    color: String(color.new(le(signal[i], cfg.maOversold) ? cfg.osColor : gray, cfg.bandTransparency)),
  }));
  plots.plot2 = P((i) => ({ time: t(i), value: osc[i], color: lineColor[i] }));
  plots.plot3 = P((i) => ({
    time: t(i), value: cfg.showOscillatorGradient ? osc[i] : NaN,
    color: String(color.new(lineColor[i], gradientTransparency)),
  }));
  plots.plot4 = P((i) => ({ time: t(i), value: showSig ? signal[i] : NaN, color: sigColor[i] }));
  plots.plot5 = P((i) => ({ time: t(i), value: showSigGrad ? signal[i] : NaN, color: String(color.new(sigColor[i], 60)) }));
  plots.plot6 = P((i) => ({ time: t(i), value: showSigGrad ? signal[i] : NaN, color: String(color.new(sigColor[i], 35)) }));
  plots.plot7 = P((i) => ({ time: t(i), value: showSigGrad ? signal[i] : NaN, color: String(color.new(sigColor[i], 0)) }));
  plots.plot8 = P((i) => ({ time: t(i), value: osc[i] * 0.8 }));
  plots.plot9 = P((i) => ({ time: t(i), value: osc[i] * 0.6 }));
  plots.plot10 = P((i) => ({ time: t(i), value: osc[i] * 0.4 }));
  plots.plot11 = P((i) => ({ time: t(i), value: osc[i] * 0.2 }));
  plots.plot12 = P((i) => ({ time: t(i), value: 0 }));

  // fill(pOsc, pMid1, color = fillEnabled ? color.new(lineColor, fillTransparency) : na) ... + 4, + 8, + 12, + 16
  const layer = (k: number) => lineColor.map((c) => (cfg.fillEnabled
    ? String(color.new(c, cfg.fillTransparency + k)) : 'transparent'));
  const fills = [
    { plot1: 'plot2', plot2: 'plot8', colors: layer(0) },
    { plot1: 'plot8', plot2: 'plot9', colors: layer(4) },
    { plot1: 'plot9', plot2: 'plot10', colors: layer(8) },
    { plot1: 'plot10', plot2: 'plot11', colors: layer(12) },
    { plot1: 'plot11', plot2: 'plot12', colors: layer(16) },
  ];

  // longOBOS = ta.crossover(osc, osLevel); shortOBOS = ta.crossunder(osc, obLevel)
  const longObos = A(ta.crossover(S(osc), S(new Array(n).fill(cfg.osLevel))));
  const shortObos = A(ta.crossunder(S(osc), S(new Array(n).fill(cfg.obLevel))));
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    // plotshape(longOBOS ? osLevel - 3 : na, style = shape.triangleup, location = location.absolute, color = osColor, size = size.small)
    if (longObos[i]) {
      markers.push({ time: t(i), position: 'atPriceMiddle', price: cfg.osLevel - 3, shape: 'triangleUp',
        color: cfg.osColor, size: 'small' });
    }
    if (shortObos[i]) {
      markers.push({ time: t(i), position: 'atPriceMiddle', price: cfg.obLevel + 3, shape: 'triangleDown',
        color: cfg.obColor, size: 'small' });
    }
  }

  const band = String(color.new(color.gray, 80));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: cfg.obLevel, options: { title: 'Overbought', color: cfg.obColor, linestyle: 'dashed' } },
      { value: cfg.osLevel, options: { title: 'Oversold', color: cfg.osColor, linestyle: 'dashed' } },
      { value: 0, options: { title: 'Midline 0', color: cfg.midLineColor, linestyle: 'dashed' } },
      { value: -150, options: { title: 'Min', color: band, linestyle: 'dotted' } },
      { value: 150, options: { title: 'Max', color: band, linestyle: 'dotted' } },
    ],
    fills,
    markers,
    alerts: alertStates(alertConditions, bars, [
      longObos.map((v) => !!v), shortObos.map((v) => !!v),
      crossedOver(signal, 0), crossedUnder(signal, 0),
      crossedOver(signal, cfg.maOversold), crossedUnder(signal, cfg.maOverbought),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy (Oversold)', message: 'Oscillator crossed above oversold.' },
  { id: 'alert1', title: 'Sell (Overbought)', message: 'Oscillator crossed below overbought.' },
  { id: 'alert2', title: 'Signal MA Cross Above 0', message: 'Signal MA crossed ABOVE zero line.' },
  { id: 'alert3', title: 'Signal MA Cross Below 0', message: 'Signal MA crossed BELOW zero line.' },
  { id: 'alert4', title: 'Signal MA Cross Above MA OS', message: 'Signal MA crossed ABOVE its oversold threshold.' },
  { id: 'alert5', title: 'Signal MA Cross Below MA OB', message: 'Signal MA crossed BELOW its overbought threshold.' },
];

export const RegressionChannelOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
