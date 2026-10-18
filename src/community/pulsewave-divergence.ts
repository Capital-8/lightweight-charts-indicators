/**
 * PulseWave + Divergence
 *
 * The oscillator is the RSI of the source minus its SMA. Glow plots and a five-layer fill to zero draw the
 * oscillator. Pivot divergences between price and oscillator give Bull / Bear lines and labels (drawn on the pivot
 * bar), and crosses of the overbought / oversold levels or of zero give triangle signals at the pane edges.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Divergence' and 'Bearish Divergence', true on the bar
 * that confirms the divergence (the pivot is pivotLength bars back).
 *
 * Reference: "PulseWave + Divergence" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { ta, Series, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export interface PulsewaveDivergenceInputs {
  /** RSI length */
  rsiLen: number;
  /** SMA length of the RSI */
  maLen: number;
  /** RSI source */
  rsiSrc: SourceType;
  overbought: number;
  oversold: number;
  calculateDivergence: boolean;
  /** Pivot length (left / right) of the divergence detection */
  pivotLength: number;
  signalType: 'None' | 'Overbought/Oversold' | 'Zero Line' | 'Both';
  oscColorPositive: string;
  oscColorNegative: string;
  zeroLineColor: string;
  overboughtColor: string;
  oversoldColor: string;
  bullDivColor: string;
  bearDivColor: string;
  textColor: string;
  showZeroLineGradient: boolean;
  showOverboughtGradient: boolean;
  showOversoldGradient: boolean;
  showOscillatorGradient: boolean;
  fillEnabled: boolean;
}

export const defaultInputs: PulsewaveDivergenceInputs = {
  rsiLen: 20,
  maLen: 20,
  rsiSrc: 'close',
  overbought: 12.0,
  oversold: -12.0,
  calculateDivergence: true,
  pivotLength: 5,
  signalType: 'Overbought/Oversold',
  oscColorPositive: 'rgb(6, 162, 47)',
  oscColorNegative: 'rgb(207, 23, 23)',
  zeroLineColor: color.gray,
  overboughtColor: color.red,
  oversoldColor: color.green,
  bullDivColor: color.green,
  bearDivColor: color.red,
  textColor: color.white,
  showZeroLineGradient: true,
  showOverboughtGradient: true,
  showOversoldGradient: true,
  showOscillatorGradient: true,
  fillEnabled: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 20 },
  { id: 'maLen', type: 'int', title: 'RSI MA Length', defval: 20 },
  { id: 'rsiSrc', type: 'source', title: 'Source', defval: 'close' },
  { id: 'overbought', type: 'float', title: 'Overbought Level (Oscillator)', defval: 12.0, step: 0.1 },
  { id: 'oversold', type: 'float', title: 'Oversold Level (Oscillator)', defval: -12.0, step: 0.1 },
  { id: 'calculateDivergence', type: 'bool', title: 'Calculate Divergence', defval: true },
  { id: 'pivotLength', type: 'int', title: 'Pivot Length (Left/Right)', defval: 5, min: 1 },
  { id: 'signalType', type: 'string', title: 'Signal Type', defval: 'Overbought/Oversold', options: ['None', 'Overbought/Oversold', 'Zero Line', 'Both'] },
  { id: 'oscColorPositive', type: 'color', title: 'Oscillator Color (Positive)', defval: 'rgb(6, 162, 47)' },
  { id: 'oscColorNegative', type: 'color', title: 'Oscillator Color (Negative)', defval: 'rgb(207, 23, 23)' },
  { id: 'zeroLineColor', type: 'color', title: 'Zero Line Color', defval: color.gray },
  { id: 'overboughtColor', type: 'color', title: 'Overbought Line Color', defval: color.red },
  { id: 'oversoldColor', type: 'color', title: 'Oversold Line Color', defval: color.green },
  { id: 'bullDivColor', type: 'color', title: 'Bullish Divergence Color', defval: color.green },
  { id: 'bearDivColor', type: 'color', title: 'Bearish Divergence Color', defval: color.red },
  { id: 'textColor', type: 'color', title: 'Label Text Color', defval: color.white },
  { id: 'showZeroLineGradient', type: 'bool', title: 'Show Zero Line Gradient', defval: true },
  { id: 'showOverboughtGradient', type: 'bool', title: 'Show Overbought Gradient', defval: true },
  { id: 'showOversoldGradient', type: 'bool', title: 'Show Oversold Gradient', defval: true },
  { id: 'showOscillatorGradient', type: 'bool', title: 'Show Oscillator Gradient', defval: true },
  { id: 'fillEnabled', type: 'bool', title: 'Enable Gradient Fill', defval: true },
];

const GRADIENT_TRANSPARENCY = 85;
const FILL_TRANSPARENCY = 60;

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'PulseWave Oscillator', color: 'rgb(6, 162, 47)', lineWidth: 2 },
  { id: 'plot1', title: 'Oscillator Gradient', color: String(color.new('rgb(6, 162, 47)', GRADIENT_TRANSPARENCY)), lineWidth: 10, display: 'pane' },
  { id: 'plot2', title: 'Zero Line', color: color.gray, lineWidth: 1 },
  { id: 'plot3', title: 'Zero Line Gradient', color: String(color.new(color.gray, GRADIENT_TRANSPARENCY)), lineWidth: 10, display: 'pane' },
  { id: 'plot4', title: 'Mid Layer 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Mid Layer 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Mid Layer 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'Mid Layer 4', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot8', title: 'Bullish Divergence', color: color.green, lineWidth: 2 },
  { id: 'plot9', title: 'Bearish Divergence', color: color.red, lineWidth: 2 },
  { id: 'plot10', title: 'Overbought Gradient', color: String(color.new(color.red, GRADIENT_TRANSPARENCY)), lineWidth: 10, display: 'pane' },
  { id: 'plot11', title: 'Oversold Gradient', color: String(color.new(color.green, GRADIENT_TRANSPARENCY)), lineWidth: 10, display: 'pane' },
];

export const metadata = {
  title: 'PulseWave + Divergence',
  shortTitle: 'PulseWave + Divergence',
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
  inputs: Partial<PulsewaveDivergenceInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const rangeUpper = 60;
  const rangeLower = 5;

  // osc = rsi - sma(rsi, maLen)
  const rsi = A(ta.rsi(getSourceSeries(bars, cfg.rsiSrc), cfg.rsiLen));
  const rsiMa = A(ta.sma(S(rsi), cfg.maLen));
  const osc = rsi.map((r, i) => r - rsiMa[i]);

  // Divergence detection
  const lb = cfg.pivotLength;
  const pivotHighOsc = A(ta.pivothigh(S(osc), lb, lb));
  const pivotLowOsc = A(ta.pivotlow(S(osc), lb, lb));
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const oscLbr = (i: number) => (i - lb >= 0 ? osc[i - lb] : NaN);
  if (cfg.calculateDivergence) {
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plOsc: number[] = [];
    const plLow: number[] = [];
    const phOsc: number[] = [];
    const phHigh: number[] = [];
    // Pine v6 `and` is lazy: the ta.barssince inside _inRange(...) only runs on the bars where the left side
    // (oscLbr > ta.valuewhen(...)) is true, so it counts those calls. One state per call site.
    let plCalls = NaN;
    let phCalls = NaN;
    let plFoundVar = false; // var bool plFound = false
    let phFoundVar = false; // var bool phFound = false
    for (let i = 0; i < n; i++) {
      const o = oscLbr(i);
      const lowLbr = i - lb >= 0 ? bars[i - lb].low : NaN;
      const highLbr = i - lb >= 0 ? bars[i - lb].high : NaN;

      const prevPlFound = plFoundVar; // plFound[1]
      plFoundVar = !isNaN(pivotLowOsc[i]);
      if (plFoundVar) {
        plOsc.push(o);
        plLow.push(lowLbr);
      }
      const vwPlOsc = plOsc.length >= 2 ? plOsc[plOsc.length - 2] : NaN;
      const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
      let oscHl = false;
      if (gt(o, vwPlOsc)) {
        if (prevPlFound) plCalls = 0;
        else if (!isNaN(plCalls)) plCalls++;
        oscHl = rangeLower <= plCalls && plCalls <= rangeUpper;
      }
      const priceLl = lt(lowLbr, vwPlLow);
      bullCond[i] = priceLl && oscHl && plFoundVar;
      plFound[i] = plFoundVar;

      const prevPhFound = phFoundVar; // phFound[1]
      phFoundVar = !isNaN(pivotHighOsc[i]);
      if (phFoundVar) {
        phOsc.push(o);
        phHigh.push(highLbr);
      }
      const vwPhOsc = phOsc.length >= 2 ? phOsc[phOsc.length - 2] : NaN;
      const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
      let oscLh = false;
      if (lt(o, vwPhOsc)) {
        if (prevPhFound) phCalls = 0;
        else if (!isNaN(phCalls)) phCalls++;
        oscLh = rangeLower <= phCalls && phCalls <= rangeUpper;
      }
      const priceHh = gt(highLbr, vwPhHigh);
      bearCond[i] = priceHh && oscLh && phFoundVar;
      phFound[i] = phFoundVar;
    }
  }

  // Colours: oscColor = osc >= 0 ? oscColorPositive : oscColorNegative (na: negative)
  const oscColor = (i: number) => (ge(osc[i], 0) ? cfg.oscColorPositive : cfg.oscColorNegative);
  const zeroGrad = String(color.new(cfg.zeroLineColor, GRADIENT_TRANSPARENCY));
  const obGrad = String(color.new(cfg.overboughtColor, GRADIENT_TRANSPARENCY));
  const osGrad = String(color.new(cfg.oversoldColor, GRADIENT_TRANSPARENCY));
  const noDiv = String(color.new(color.white, 100));
  const interval = barInterval(bars);

  const P = (f: (i: number) => Point | null): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p = f(i);
      if (p) out.push(p);
    }
    return out;
  };
  const t = (i: number) => bars[i].time;
  const plots: Record<string, Point[]> = {};
  plots.plot0 = P((i) => ({ time: t(i), value: osc[i], color: oscColor(i) }));
  // plot(showOscillatorGradient ? osc : na, color.new(oscColor, 85), linewidth = 10, display = display.pane)
  plots.plot1 = P((i) => ({
    time: t(i), value: cfg.showOscillatorGradient ? osc[i] : NaN, color: String(color.new(oscColor(i), GRADIENT_TRANSPARENCY)),
  }));
  plots.plot2 = P((i) => ({ time: t(i), value: 0, color: cfg.zeroLineColor }));
  plots.plot3 = P((i) => ({ time: t(i), value: cfg.showZeroLineGradient ? 0 : NaN, color: zeroGrad }));
  plots.plot4 = P((i) => ({ time: t(i), value: osc[i] * 0.8 }));
  plots.plot5 = P((i) => ({ time: t(i), value: osc[i] * 0.6 }));
  plots.plot6 = P((i) => ({ time: t(i), value: osc[i] * 0.4 }));
  plots.plot7 = P((i) => ({ time: t(i), value: osc[i] * 0.2 }));
  // plot(calculateDivergence and plFound ? oscLbr : na, offset = -lookbackRight,
  //      color = bullCond ? bullDivColor : color.new(color.white, 100)): the value of bar i is drawn on bar i - lb
  plots.plot8 = P((i) => (i - lb < 0 ? null : {
    time: barTime(bars, i - lb, interval),
    value: cfg.calculateDivergence && plFound[i] ? oscLbr(i) : NaN,
    color: bullCond[i] ? cfg.bullDivColor : noDiv,
  }));
  plots.plot9 = P((i) => (i - lb < 0 ? null : {
    time: barTime(bars, i - lb, interval),
    value: cfg.calculateDivergence && phFound[i] ? oscLbr(i) : NaN,
    color: bearCond[i] ? cfg.bearDivColor : noDiv,
  }));
  plots.plot10 = P((i) => ({ time: t(i), value: cfg.showOverboughtGradient ? cfg.overbought : NaN, color: obGrad }));
  plots.plot11 = P((i) => ({ time: t(i), value: cfg.showOversoldGradient ? cfg.oversold : NaN, color: osGrad }));

  // fill(pOsc, pMid1, fillEnabled ? color.new(oscColor, fillTransparency) : na) ... + 5, + 5, + 10, + 15
  const layer = (k: number) => bars.map((_b, i) => (cfg.fillEnabled
    ? String(color.new(oscColor(i), FILL_TRANSPARENCY + k)) : 'transparent'));
  const fills = [
    { plot1: 'plot0', plot2: 'plot4', options: { title: 'Fill Layer 1' }, colors: layer(0) },
    { plot1: 'plot4', plot2: 'plot5', options: { title: 'Fill Layer 2' }, colors: layer(5) },
    { plot1: 'plot5', plot2: 'plot6', options: { title: 'Fill Layer 3' }, colors: layer(5) },
    { plot1: 'plot6', plot2: 'plot7', options: { title: 'Fill Layer 4' }, colors: layer(10) },
    { plot1: 'plot7', plot2: 'plot2', options: { title: 'Fill Layer 5' }, colors: layer(15) },
  ];

  const markers: MarkerData[] = [];
  const showObos = cfg.signalType === 'Overbought/Oversold' || cfg.signalType === 'Both';
  const showZero = cfg.signalType === 'Zero Line' || cfg.signalType === 'Both';
  // ta.crossover(a, b): a > b and a[1] <= b[1]; ta.crossunder(a, b): a < b and a[1] >= b[1]
  // (exact comparisons, no 1e-10 tolerance; na gives false)
  const crossover = (b: number, i: number) => i > 0 && osc[i] > b && osc[i - 1] <= b;
  const crossunder = (b: number, i: number) => i > 0 && osc[i] < b && osc[i - 1] >= b;
  for (let i = 0; i < n; i++) {
    // plotshape(bullCond ? oscLbr : na, offset = -lookbackRight, text = ' Bull ', shape.labelup, location.absolute,
    //   color = bullDivColor, textcolor = textColor, display = calculateDivergence ? display.pane : display.none)
    if (cfg.calculateDivergence && i - lb >= 0) {
      const price = oscLbr(i);
      if (bullCond[i] && !isNaN(price)) {
        markers.push({ time: barTime(bars, i - lb, interval), position: 'atPriceBottom', price, shape: 'labelUp',
          color: cfg.bullDivColor, text: ' Bull ', textColor: cfg.textColor, id: 'shape0' });
      }
      if (bearCond[i] && !isNaN(price)) {
        markers.push({ time: barTime(bars, i - lb, interval), position: 'atPriceTop', price, shape: 'labelDown',
          color: cfg.bearDivColor, text: ' Bear ', textColor: cfg.textColor, id: 'shape1' });
      }
    }
    // Signal triangles: plotshape(cond ? osc : na, location.bottom (buy) / location.top (sell), size.tiny)
    const buy = (on: boolean, id: string) => {
      if (on && !isNaN(osc[i])) markers.push({ time: t(i), position: 'bottom', shape: 'triangleUp', color: cfg.oversoldColor, size: 'tiny', id });
    };
    const sell = (on: boolean, id: string) => {
      if (on && !isNaN(osc[i])) markers.push({ time: t(i), position: 'top', shape: 'triangleDown', color: cfg.overboughtColor, size: 'tiny', id });
    };
    buy(showObos && crossover(cfg.oversold, i), 'shape2');
    sell(showObos && crossunder(cfg.overbought, i), 'shape3');
    buy(showZero && crossover(0, i), 'shape4');
    sell(showZero && crossunder(0, i), 'shape5');
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: cfg.overbought, options: { title: 'Overbought', color: cfg.overboughtColor, linestyle: 'dashed' } },
      { value: cfg.oversold, options: { title: 'Oversold', color: cfg.oversoldColor, linestyle: 'dashed' } },
    ],
    fills,
    markers,
    // alertcondition(bullCond, "Bullish Divergence") / alertcondition(bearCond, "Bearish Divergence")
    alerts: alertStates(alertConditions, bars, [bullCond, bearCond]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Divergence', message: 'New bullish divergence detected, Pivot Lookback Right bars to the left of current bar.' },
  { id: 'alert1', title: 'Bearish Divergence', message: 'New bearish divergence detected, Pivot Lookback Right bars to the left of current bar.' },
];

export const PulsewaveDivergence = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
