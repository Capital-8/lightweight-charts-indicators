/**
 * Pivot Oscillator
 *
 * The pivot line is a level between the average of the last pivot highs and the average of the last pivot lows
 * (pivot level 0 = lows, 1 = highs). The oscillator is 50 + 50 * (close - pivot line) / (ATR * multiplier),
 * clamped to 1..100, with glow plots and a four-layer fill towards 50. Its SMA is smoothed again by a second SMA,
 * coloured by its slope; crosses of the overbought / oversold levels give triangle signals.
 * Alerts (alertcondition, `alerts` of the result): 'Buy (Oversold)' / 'Sell (Overbought)', true on the bars of the
 * triangle signals.
 *
 * Reference: "Pivot Oscillator" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PivotOscillatorInputs {
  /** Pivot left / right bars */
  lenSwing: number;
  /** Position of the pivot line between the pivot low average (0) and the pivot high average (1) */
  pivotLevel: number;
  /** Number of last pivots averaged */
  lookback: number;
  atrLen: number;
  multUp: number;
  multDown: number;
  obLevel: number;
  osLevel: number;
  maOverbought: number;
  maOversold: number;
  /** SMA length of the signal */
  signalLength: number;
  /** Length of the second SMA (smoothed signal) */
  extraSmooth: number;
  bullColor: string;
  bearColor: string;
  signalColorBull: string;
  signalColorBear: string;
  obColor: string;
  osColor: string;
  midLineColor: string;
  /** Pine input, not used by the Pine drawing */
  textColor: string;
  showOverboughtGradient: boolean;
  showOversoldGradient: boolean;
  showOscillatorGradient: boolean;
  showMaGradient: boolean;
  fillEnabled: boolean;
  fillTransparency: number;
  bandTransparency: number;
}

export const defaultInputs: PivotOscillatorInputs = {
  lenSwing: 5,
  pivotLevel: 0.5,
  lookback: 5,
  atrLen: 14,
  multUp: 15.0,
  multDown: 15.0,
  obLevel: 70,
  osLevel: 30,
  maOverbought: 60,
  maOversold: 40,
  signalLength: 14,
  extraSmooth: 10,
  bullColor: 'rgb(22, 193, 67)',
  bearColor: 'rgb(229, 11, 11)',
  signalColorBull: 'rgb(22, 193, 67)',
  signalColorBear: 'rgb(229, 11, 11)',
  obColor: color.red,
  osColor: color.green,
  midLineColor: color.gray,
  textColor: color.white,
  showOverboughtGradient: true,
  showOversoldGradient: true,
  showOscillatorGradient: true,
  showMaGradient: true,
  fillEnabled: true,
  fillTransparency: 75,
  bandTransparency: 50,
};

export const inputConfig: InputConfig[] = [
  { id: 'lenSwing', type: 'int', title: 'Pivot Length', defval: 5, min: 1 },
  { id: 'pivotLevel', type: 'float', title: 'Pivot Level', defval: 0.5, min: 0.0, max: 1.0, step: 0.01 },
  { id: 'lookback', type: 'int', title: 'Pivot Lookback', defval: 5, min: 1 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'multUp', type: 'float', title: 'ATR Multiplier Up', defval: 15.0, min: 0.1 },
  { id: 'multDown', type: 'float', title: 'ATR Multiplier Down', defval: 15.0, min: 0.1 },
  { id: 'obLevel', type: 'float', title: 'Overbought Level', defval: 70, min: 51, max: 99 },
  { id: 'osLevel', type: 'float', title: 'Oversold Level', defval: 30, min: 1, max: 49 },
  { id: 'maOverbought', type: 'float', title: 'MA Overbought Threshold', defval: 60, min: 51, max: 99 },
  { id: 'maOversold', type: 'float', title: 'MA Oversold Threshold', defval: 40, min: 1, max: 49 },
  { id: 'signalLength', type: 'int', title: 'SMA Length for Signal', defval: 14 },
  { id: 'extraSmooth', type: 'int', title: 'SMA Smoothing', defval: 10, min: 1 },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: 'rgb(22, 193, 67)' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: 'rgb(229, 11, 11)' },
  { id: 'signalColorBull', type: 'color', title: 'Signal SMA Bullish', defval: 'rgb(22, 193, 67)' },
  { id: 'signalColorBear', type: 'color', title: 'Signal SMA Bearish', defval: 'rgb(229, 11, 11)' },
  { id: 'obColor', type: 'color', title: 'Overbought Line Color', defval: color.red },
  { id: 'osColor', type: 'color', title: 'Oversold Line Color', defval: color.green },
  { id: 'midLineColor', type: 'color', title: 'Midline 50 Color', defval: color.gray },
  { id: 'textColor', type: 'color', title: 'Text Color', defval: color.white },
  { id: 'showOverboughtGradient', type: 'bool', title: 'Show Overbought Gradient', defval: true },
  { id: 'showOversoldGradient', type: 'bool', title: 'Show Oversold Gradient', defval: true },
  { id: 'showOscillatorGradient', type: 'bool', title: 'Show Oscillator Gradient', defval: true },
  { id: 'showMaGradient', type: 'bool', title: 'Show Moving Average Gradient', defval: true },
  { id: 'fillEnabled', type: 'bool', title: 'Enable Gradient Fill', defval: true },
  { id: 'fillTransparency', type: 'int', title: 'Gradient Fill Transparency', defval: 75, min: 0, max: 100 },
  { id: 'bandTransparency', type: 'int', title: 'Band/Label Gradient Transparency', defval: 50, min: 0, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'OB Gradient', color: color.gray, lineWidth: 8 },
  { id: 'plot1', title: 'OS Gradient', color: color.gray, lineWidth: 8 },
  { id: 'plot2', title: 'Oscillator 1–100', color: 'rgb(22, 193, 67)', lineWidth: 2 },
  { id: 'plot3', title: 'Osc Gradient', color: 'rgb(22, 193, 67)', lineWidth: 10 },
  { id: 'plot4', title: 'Signal SMA', color: color.gray, lineWidth: 2 },
  { id: 'plot5', title: 'Signal SMA Glow 1', color: color.gray, lineWidth: 5 },
  { id: 'plot6', title: 'Signal SMA Glow 2', color: color.gray, lineWidth: 3 },
  { id: 'plot7', title: 'Signal SMA Glow 3', color: color.gray, lineWidth: 1 },
  { id: 'plot8', title: 'Mid 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot9', title: 'Mid 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot10', title: 'Mid 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot11', title: 'Mid 4', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Pivot Oscillator',
  shortTitle: 'Pivot Oscillator',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<PivotOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const gradientTransparency = 85;

  // ph = ta.pivothigh(high, lenSwing, lenSwing); pl = ta.pivotlow(low, lenSwing, lenSwing)
  const ph = A(ta.pivothigh(S(bars.map((b) => b.high)), cfg.lenSwing, cfg.lenSwing));
  const pl = A(ta.pivotlow(S(bars.map((b) => b.low)), cfg.lenSwing, cfg.lenSwing));
  const atr = A(ta.atr(bars, cfg.atrLen));

  const phArray: number[] = [];
  const plArray: number[] = [];
  const avg = (a: number[]) => {
    let s = 0;
    for (const v of a) s += v;
    return s / a.length;
  };
  const oscRaw: number[] = new Array(n);
  const osc: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (!isNaN(ph[i])) {
      phArray.push(ph[i]);
      if (phArray.length > cfg.lookback) phArray.shift();
    }
    if (!isNaN(pl[i])) {
      plArray.push(pl[i]);
      if (plArray.length > cfg.lookback) plArray.shift();
    }
    const avgPH = phArray.length > 0 ? avg(phArray) : NaN;
    const avgPL = plArray.length > 0 ? avg(plArray) : NaN;
    const pivotLine = !isNaN(avgPH) && !isNaN(avgPL) ? avgPL + (avgPH - avgPL) * cfg.pivotLevel : NaN;
    // osc_raw = close - nz(pivotLine)
    const raw = bars[i].close - (isNaN(pivotLine) ? 0 : pivotLine);
    oscRaw[i] = raw;
    // atr_safe = atr > 0 ? atr : 1 (na > 0 is false)
    const atrSafe = gt(atr[i], 0) ? atr[i] : 1;
    const upperBound = atrSafe * cfg.multUp;
    const lowerBound = atrSafe * cfg.multDown;
    let scaled: number;
    if (gt(raw, 0)) scaled = 50.0 + 50.0 * (raw / upperBound);
    else if (lt(raw, 0)) scaled = 50.0 + 50.0 * (raw / lowerBound);
    else scaled = 50.0;
    osc[i] = Math.max(1.0, Math.min(100.0, scaled));
  }
  const oscSignal = A(ta.sma(S(osc), cfg.signalLength));
  const smoothSignal = A(ta.sma(S(oscSignal), cfg.extraSmooth));

  const lineColor = (i: number) => (gt(oscRaw[i], 0) ? cfg.bullColor : cfg.bearColor);
  // dynSignalColor = smoothSignal > smoothSignal[1] ? bull : smoothSignal < smoothSignal[1] ? bear : color.gray
  const dynColor = (i: number) => {
    const prev = i > 0 ? smoothSignal[i - 1] : NaN;
    return gt(smoothSignal[i], prev) ? cfg.signalColorBull : lt(smoothSignal[i], prev) ? cfg.signalColorBear : color.gray;
  };
  const t = (i: number) => bars[i].time;
  const P = (f: (i: number) => { time: number; value: number; color?: string }) => bars.map((_b, i) => f(i));

  const plots = {
    // plot(showOverboughtGradient ? obLevel : na, color.new(oscSignal >= maOverbought ? obColor : color.gray, bandTransparency), 8)
    plot0: P((i) => ({
      time: t(i), value: cfg.showOverboughtGradient ? cfg.obLevel : NaN,
      color: String(color.new(ge(oscSignal[i], cfg.maOverbought) ? cfg.obColor : color.gray, cfg.bandTransparency)),
    })),
    // plot(showOversoldGradient ? osLevel : na, color.new(oscSignal <= maOversold ? osColor : color.gray, bandTransparency), 8)
    plot1: P((i) => ({
      time: t(i), value: cfg.showOversoldGradient ? cfg.osLevel : NaN,
      color: String(color.new(le(oscSignal[i], cfg.maOversold) ? cfg.osColor : color.gray, cfg.bandTransparency)),
    })),
    plot2: P((i) => ({ time: t(i), value: osc[i], color: lineColor(i) })),
    plot3: P((i) => ({
      time: t(i), value: cfg.showOscillatorGradient ? osc[i] : NaN, color: String(color.new(lineColor(i), gradientTransparency)),
    })),
    // plot(showMaGradient ? smoothSignal : smoothSignal, "Signal SMA", dynSignalColor, 2)
    plot4: P((i) => ({ time: t(i), value: smoothSignal[i], color: dynColor(i) })),
    // plot(showMaGradient ? smoothSignal : na, "", color.new(dynSignalColor, 60 / 35 / 0), 5 / 3 / 1)
    plot5: P((i) => ({ time: t(i), value: cfg.showMaGradient ? smoothSignal[i] : NaN, color: String(color.new(dynColor(i), 60)) })),
    plot6: P((i) => ({ time: t(i), value: cfg.showMaGradient ? smoothSignal[i] : NaN, color: String(color.new(dynColor(i), 35)) })),
    plot7: P((i) => ({ time: t(i), value: cfg.showMaGradient ? smoothSignal[i] : NaN, color: String(color.new(dynColor(i), 0)) })),
    // pMid1..4 = plot(osc_scaled * (1 - k) + 50 * k, display = display.none), k = 0.2, 0.4, 0.6, 0.8
    plot8: P((i) => ({ time: t(i), value: osc[i] * 0.8 + 50 * 0.2 })),
    plot9: P((i) => ({ time: t(i), value: osc[i] * 0.6 + 50 * 0.4 })),
    plot10: P((i) => ({ time: t(i), value: osc[i] * 0.4 + 50 * 0.6 })),
    plot11: P((i) => ({ time: t(i), value: osc[i] * 0.2 + 50 * 0.8 })),
  };

  // fill(pOsc, pMid1, fillEnabled ? color.new(lineColor, fillTransparency) : na) ... + 5, + 10, + 15
  const layer = (k: number) => bars.map((_b, i) => (cfg.fillEnabled
    ? String(color.new(lineColor(i), cfg.fillTransparency + k)) : 'transparent'));
  const fills = [
    { plot1: 'plot2', plot2: 'plot8', colors: layer(0) },
    { plot1: 'plot8', plot2: 'plot9', colors: layer(5) },
    { plot1: 'plot9', plot2: 'plot10', colors: layer(10) },
    { plot1: 'plot10', plot2: 'plot11', colors: layer(15) },
  ];

  // longSignalObos = ta.crossover(osc_scaled, osLevel); shortSignalObos = ta.crossunder(osc_scaled, obLevel)
  // (exact comparisons: crossover / crossunder have no 1e-10 tolerance)
  // plotshape(..., location.bottom / location.top, osColor / obColor, triangleup / triangledown, size.tiny).
  const markers: MarkerData[] = [];
  const longFlags: boolean[] = new Array<boolean>(n).fill(false);
  const shortFlags: boolean[] = new Array<boolean>(n).fill(false);
  for (let i = 1; i < n; i++) {
    longFlags[i] = osc[i] > cfg.osLevel && osc[i - 1] <= cfg.osLevel;
    shortFlags[i] = osc[i] < cfg.obLevel && osc[i - 1] >= cfg.obLevel;
    if (longFlags[i]) {
      markers.push({ time: t(i), position: 'bottom', shape: 'triangleUp', color: cfg.osColor, size: 'tiny' });
    }
    if (shortFlags[i]) {
      markers.push({ time: t(i), position: 'top', shape: 'triangleDown', color: cfg.obColor, size: 'tiny' });
    }
  }

  const minMax = String(color.new(color.gray, 80));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: cfg.obLevel, options: { title: 'Overbought', color: cfg.obColor, linestyle: 'dashed', linewidth: 1 } },
      { value: cfg.osLevel, options: { title: 'Oversold', color: cfg.osColor, linestyle: 'dashed', linewidth: 1 } },
      { value: 50, options: { title: 'Midline 50', color: cfg.midLineColor, linestyle: 'dashed', linewidth: 1 } },
      { value: 1, options: { title: 'Min', color: minMax, linestyle: 'dotted' } },
      { value: 100, options: { title: 'Max', color: minMax, linestyle: 'dotted' } },
    ],
    fills,
    markers,
    // alertcondition(longSignalObos, 'Buy (Oversold)') / alertcondition(shortSignalObos, 'Sell (Overbought)')
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy (Oversold)', message: 'Oscillator crossed above oversold.' },
  { id: 'alert1', title: 'Sell (Overbought)', message: 'Oscillator crossed below overbought.' },
];

export const PivotOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
