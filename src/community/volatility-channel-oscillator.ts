/**
 * Volatility Channel Oscillator
 *
 * A channel around the SMA of the candle midpoint, with a half width of the average range * scale, widened by the
 * ratio of the average body to the average range. The oscillator is the close position in the channel
 * (-50 at the lower band, +50 at the upper band, clamped to -100..100), with an SMA signal line. Glow plots and a
 * five-layer fill to zero draw the oscillator; pivot divergences between price and oscillator give Bull / Bear
 * labels, and crosses of the thresholds, of zero and of the signal with zero give triangle signals.
 * Alerts (alertcondition, `alerts` of the result): the two divergences and the six crosses (whatever the Signal Type).
 *
 * Reference: "Volatility Channel Oscillator" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolatilityChannelOscillatorInputs {
  /** SMA length / volatility window */
  length: number;
  /** Band scaling (%) */
  scale: number;
  /** SMA length of the signal line */
  signalLength: number;
  overbought: number;
  oversold: number;
  maOverbought: number;
  maOversold: number;
  /** Pivot length (left / right) of the divergence detection */
  pivotLength: number;
  calculateDivergence: boolean;
  signalType: 'None' | 'Overbought/Oversold' | 'Zero Line' | 'MA Zero Line' | 'All';
  oscColorPositive: string;
  oscColorNegative: string;
  signalColor: string;
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
  showMaGradient: boolean;
  fillEnabled: boolean;
  fillTransparency: number;
  bandTransparency: number;
}

export const defaultInputs: VolatilityChannelOscillatorInputs = {
  length: 30,
  scale: 200.0,
  signalLength: 20,
  overbought: 50.0,
  oversold: -50.0,
  maOverbought: 30.0,
  maOversold: -30.0,
  pivotLength: 2,
  calculateDivergence: true,
  signalType: 'Overbought/Oversold',
  oscColorPositive: 'rgb(6, 162, 47)',
  oscColorNegative: 'rgb(207, 23, 23)',
  signalColor: color.yellow,
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
  showMaGradient: true,
  fillEnabled: true,
  fillTransparency: 70,
  bandTransparency: 40,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'SMA Length / Volatility Window', defval: 30 },
  { id: 'scale', type: 'float', title: 'Band Scaling (%)', defval: 200.0, min: 100.0 },
  { id: 'signalLength', type: 'int', title: 'SMA Length for Signal', defval: 20 },
  { id: 'overbought', type: 'float', title: 'Overbought Threshold', defval: 50.0, step: 0.1 },
  { id: 'oversold', type: 'float', title: 'Oversold Threshold', defval: -50.0, step: 0.1 },
  { id: 'maOverbought', type: 'float', title: 'MA Overbought Threshold', defval: 30.0, step: 0.1 },
  { id: 'maOversold', type: 'float', title: 'MA Oversold Threshold', defval: -30.0, step: 0.1 },
  { id: 'pivotLength', type: 'int', title: 'Pivot Length (Left/Right)', defval: 2, min: 1 },
  { id: 'calculateDivergence', type: 'bool', title: 'Enable Divergence Detection', defval: true },
  { id: 'signalType', type: 'string', title: 'Signal Type', defval: 'Overbought/Oversold', options: ['None', 'Overbought/Oversold', 'Zero Line', 'MA Zero Line', 'All'] },
  { id: 'oscColorPositive', type: 'color', title: 'Bullish Oscillator Color', defval: 'rgb(6, 162, 47)' },
  { id: 'oscColorNegative', type: 'color', title: 'Bearish Oscillator Color', defval: 'rgb(207, 23, 23)' },
  { id: 'signalColor', type: 'color', title: 'Signal SMA Color', defval: color.yellow },
  { id: 'zeroLineColor', type: 'color', title: 'Zero Line Color', defval: color.gray },
  { id: 'overboughtColor', type: 'color', title: 'Overbought Line Color', defval: color.red },
  { id: 'oversoldColor', type: 'color', title: 'Oversold Line Color', defval: color.green },
  { id: 'bullDivColor', type: 'color', title: 'Bullish Divergence Color', defval: color.green },
  { id: 'bearDivColor', type: 'color', title: 'Bearish Divergence Color', defval: color.red },
  { id: 'textColor', type: 'color', title: 'Text Color', defval: color.white },
  { id: 'showZeroLineGradient', type: 'bool', title: 'Show Zero Line Gradient', defval: true },
  { id: 'showOverboughtGradient', type: 'bool', title: 'Show Overbought Gradient', defval: true },
  { id: 'showOversoldGradient', type: 'bool', title: 'Show Oversold Gradient', defval: true },
  { id: 'showOscillatorGradient', type: 'bool', title: 'Show Oscillator Gradient', defval: true },
  { id: 'showMaGradient', type: 'bool', title: 'Show Moving Average Gradient', defval: true },
  { id: 'fillEnabled', type: 'bool', title: 'Enable Gradient Fill', defval: true },
  { id: 'fillTransparency', type: 'int', title: 'Gradient Fill Transparency', defval: 70, min: 0, max: 100 },
  { id: 'bandTransparency', type: 'int', title: 'Band and Label Gradient Transparency', defval: 40, min: 0, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero Line Gradient', color: color.gray, lineWidth: 10 },
  { id: 'plot1', title: 'Overbought Gradient', color: color.gray, lineWidth: 10 },
  { id: 'plot2', title: 'Oversold Gradient', color: color.gray, lineWidth: 10 },
  { id: 'plot3', title: 'Oscillator', color: 'rgb(6, 162, 47)', lineWidth: 2 },
  { id: 'plot4', title: 'Oscillator Gradient', color: 'rgb(6, 162, 47)', lineWidth: 10 },
  { id: 'plot5', title: 'Signal SMA', color: color.yellow, lineWidth: 2 },
  { id: 'plot6', title: 'Moving Average Gradient', color: color.yellow, lineWidth: 6 },
  { id: 'plot7', title: 'Mid Layer 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot8', title: 'Mid Layer 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot9', title: 'Mid Layer 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot10', title: 'Mid Layer 4', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot11', title: 'Zero Line for Fill', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot12', title: 'Bullish Divergence', color: color.green, lineWidth: 2 },
  { id: 'plot13', title: 'Bearish Divergence', color: color.red, lineWidth: 2 },
];

export const metadata = {
  title: 'Volatility Channel Oscillator',
  shortTitle: 'VCO',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<VolatilityChannelOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const rangeUpper = 60;
  const rangeLower = 5;
  const gradientTransparency = 85;

  // Channel
  const midSma = A(ta.sma(S(bars.map((b) => (b.high + b.low) / 2)), cfg.length));
  const avgRange = A(ta.sma(S(bars.map((b) => b.high - b.low)), cfg.length));
  const avgBody = A(ta.sma(S(bars.map((b) => Math.abs(b.close - b.open))), cfg.length));
  const osc: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // offset = avgRange * scale / 100 * (1 + avgBody / math.max(avgRange, 1e-10))
    const off = ((avgRange[i] * cfg.scale) / 100) * (1 + avgBody[i] / Math.max(avgRange[i], 1e-10));
    const upperBand = midSma[i] + off;
    const lowerBand = midSma[i] - off;
    const bandWidth = Math.max(upperBand - lowerBand, 1e-10);
    const rawBaseOsc = (100 * (bars[i].close - lowerBand)) / bandWidth - 50;
    osc[i] = Math.max(Math.min(rawBaseOsc, 100), -100);
  }
  const oscSignal = A(ta.sma(S(osc), cfg.signalLength));

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

  // Colours
  const oscColor = (i: number) => (ge(osc[i], 0) ? cfg.oscColorPositive : cfg.oscColorNegative);
  const zeroGrad = String(color.new(cfg.zeroLineColor, gradientTransparency));
  const signalGrad = String(color.new(cfg.signalColor, gradientTransparency));
  const noDiv = String(color.new(color.white, 100));
  const interval = barInterval(bars);

  const plots: Record<string, Point[]> = {};
  const P = (f: (i: number) => Point | null): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p = f(i);
      if (p) out.push(p);
    }
    return out;
  };
  const t = (i: number) => bars[i].time;
  // plot(showZeroLineGradient ? 0 : na, color.new(zeroLineColor, 85), linewidth = 10)
  plots.plot0 = P((i) => ({ time: t(i), value: cfg.showZeroLineGradient ? 0 : NaN, color: zeroGrad }));
  // plot(showOverboughtGradient ? overbought : na, color.new(oscSignal >= maOverbought ? overboughtColor : zeroLineColor, bandTransparency))
  plots.plot1 = P((i) => ({
    time: t(i), value: cfg.showOverboughtGradient ? cfg.overbought : NaN,
    color: String(color.new(ge(oscSignal[i], cfg.maOverbought) ? cfg.overboughtColor : cfg.zeroLineColor, cfg.bandTransparency)),
  }));
  // plot(showOversoldGradient ? oversold : na, color.new(oscSignal <= maOversold ? oversoldColor : zeroLineColor, bandTransparency))
  plots.plot2 = P((i) => ({
    time: t(i), value: cfg.showOversoldGradient ? cfg.oversold : NaN,
    color: String(color.new(le(oscSignal[i], cfg.maOversold) ? cfg.oversoldColor : cfg.zeroLineColor, cfg.bandTransparency)),
  }));
  plots.plot3 = P((i) => ({ time: t(i), value: osc[i], color: oscColor(i) }));
  plots.plot4 = P((i) => ({
    time: t(i), value: cfg.showOscillatorGradient ? osc[i] : NaN, color: String(color.new(oscColor(i), gradientTransparency)),
  }));
  plots.plot5 = P((i) => ({ time: t(i), value: oscSignal[i], color: cfg.signalColor }));
  plots.plot6 = P((i) => ({ time: t(i), value: cfg.showMaGradient ? oscSignal[i] : NaN, color: signalGrad }));
  plots.plot7 = P((i) => ({ time: t(i), value: osc[i] * 0.8 }));
  plots.plot8 = P((i) => ({ time: t(i), value: osc[i] * 0.6 }));
  plots.plot9 = P((i) => ({ time: t(i), value: osc[i] * 0.4 }));
  plots.plot10 = P((i) => ({ time: t(i), value: osc[i] * 0.2 }));
  plots.plot11 = P((i) => ({ time: t(i), value: 0 }));
  // plot(calculateDivergence and plFound ? oscLbr : na, offset = -lookbackRight,
  //      color = bullCond ? bullDivColor : color.new(color.white, 100)): the value of bar i is drawn on bar i - lb
  plots.plot12 = P((i) => (i - lb < 0 ? null : {
    time: barTime(bars, i - lb, interval),
    value: cfg.calculateDivergence && plFound[i] ? oscLbr(i) : NaN,
    color: bullCond[i] ? cfg.bullDivColor : noDiv,
  }));
  plots.plot13 = P((i) => (i - lb < 0 ? null : {
    time: barTime(bars, i - lb, interval),
    value: cfg.calculateDivergence && phFound[i] ? oscLbr(i) : NaN,
    color: bearCond[i] ? cfg.bearDivColor : noDiv,
  }));

  // fill(pOsc, pMid1, fillEnabled ? color.new(oscColor, fillTransparency) : na) ... + 5, + 10, + 15, + 20
  const layer = (k: number) => bars.map((_b, i) => (cfg.fillEnabled
    ? String(color.new(oscColor(i), cfg.fillTransparency + k)) : 'transparent'));
  const fills = [
    { plot1: 'plot3', plot2: 'plot7', colors: layer(0) },
    { plot1: 'plot7', plot2: 'plot8', colors: layer(5) },
    { plot1: 'plot8', plot2: 'plot9', colors: layer(10) },
    { plot1: 'plot9', plot2: 'plot10', colors: layer(15) },
    { plot1: 'plot10', plot2: 'plot11', colors: layer(20) },
  ];

  const markers: MarkerData[] = [];
  const bullLabel = String(color.new(cfg.bullDivColor, cfg.bandTransparency));
  const bearLabel = String(color.new(cfg.bearDivColor, cfg.bandTransparency));
  const showObos = cfg.signalType === 'Overbought/Oversold' || cfg.signalType === 'All';
  const showZero = cfg.signalType === 'Zero Line' || cfg.signalType === 'All';
  const showMaZero = cfg.signalType === 'MA Zero Line' || cfg.signalType === 'All';
  // ta.crossover(a, b): a > b and a[1] <= b[1]; ta.crossunder(a, b): a < b and a[1] >= b[1]; both compare exactly
  // (no 1e-10 tolerance; na compares false)
  const crossover = (a: number[], b: number, i: number) => i > 0 && a[i] > b && a[i - 1] <= b;
  const crossunder = (a: number[], b: number, i: number) => i > 0 && a[i] < b && a[i - 1] >= b;
  const signalFlags: boolean[][] = [[], [], [], [], [], []];
  for (let i = 0; i < n; i++) {
    // plotshape(bullCond ? oscLbr : na, offset = -lookbackRight, text = ' Bull ', shape.labelup, location.absolute,
    //   color.new(bullDivColor, bandTransparency), textcolor = textColor, display = calculateDivergence ? all : none)
    if (cfg.calculateDivergence && i - lb >= 0) {
      const price = oscLbr(i);
      if (bullCond[i] && !isNaN(price)) {
        markers.push({ time: barTime(bars, i - lb, interval), position: 'atPriceBottom', price, shape: 'labelUp',
          color: bullLabel, text: ' Bull ', textColor: cfg.textColor, id: 'shape0' });
      }
      if (bearCond[i] && !isNaN(price)) {
        markers.push({ time: barTime(bars, i - lb, interval), position: 'atPriceTop', price, shape: 'labelDown',
          color: bearLabel, text: ' Bear ', textColor: cfg.textColor, id: 'shape1' });
      }
    }
    // Signal triangles: location.bottom (buy) / location.top (sell), size.tiny
    // Style ids: shape2 .. shape7 in the original's declaration order
    const buy = (on: boolean, v: number, id: string) => {
      if (on && !isNaN(v)) markers.push({ time: t(i), position: 'bottom', shape: 'triangleUp', color: cfg.oversoldColor, size: 'tiny', id });
    };
    const sell = (on: boolean, v: number, id: string) => {
      if (on && !isNaN(v)) markers.push({ time: t(i), position: 'top', shape: 'triangleDown', color: cfg.overboughtColor, size: 'tiny', id });
    };
    const sig = [
      crossover(osc, cfg.oversold, i), crossunder(osc, cfg.overbought, i), crossover(osc, 0, i), crossunder(osc, 0, i),
      crossover(oscSignal, 0, i), crossunder(oscSignal, 0, i),
    ];
    sig.forEach((f, k) => signalFlags[k].push(f));
    buy(showObos && sig[0], osc[i], 'shape2');
    sell(showObos && sig[1], osc[i], 'shape3');
    buy(showZero && sig[2], osc[i], 'shape4');
    sell(showZero && sig[3], osc[i], 'shape5');
    buy(showMaZero && sig[4], oscSignal[i], 'shape6');
    sell(showMaZero && sig[5], oscSignal[i], 'shape7');
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: 0, options: { title: 'Zero Line', color: cfg.zeroLineColor, linestyle: 'dashed' } },
      { value: cfg.overbought, options: { title: 'Overbought Level', color: cfg.overboughtColor, linestyle: 'dashed' } },
      { value: cfg.oversold, options: { title: 'Oversold Level', color: cfg.oversoldColor, linestyle: 'dashed' } },
    ],
    fills,
    markers,
    // alertcondition(bullCond / bearCond / longSignalObos / shortSignalObos / longSignalZero / shortSignalZero /
    // longSignalMaZero / shortSignalMaZero)
    alerts: alertStates(alertConditions, bars, [bullCond, bearCond, ...signalFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Divergence Detected', message: 'Bullish divergence detected at pivot, lookback right bars ago.' },
  { id: 'alert1', title: 'Bearish Divergence Detected', message: 'Bearish divergence detected at pivot, lookback right bars ago.' },
  { id: 'alert2', title: 'Buy Signal (Oversold)', message: 'Oscillator crossed above the oversold threshold.' },
  { id: 'alert3', title: 'Sell Signal (Overbought)', message: 'Oscillator crossed below the overbought threshold.' },
  { id: 'alert4', title: 'Buy Signal (Zero Line)', message: 'Oscillator crossed above the zero line.' },
  { id: 'alert5', title: 'Sell Signal (Zero Line)', message: 'Oscillator crossed below the zero line.' },
  { id: 'alert6', title: 'Buy Signal (MA Zero Line)', message: 'Moving Average crossed above the zero line.' },
  { id: 'alert7', title: 'Sell Signal (MA Zero Line)', message: 'Moving Average crossed below the zero line.' },
];

export const VolatilityChannelOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
