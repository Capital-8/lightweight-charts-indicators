/**
 * Force Pulse
 *
 * Over the last `lookback` bars, the bull force is the sum of the bodies of the up candles and the bear force the
 * sum of the bodies of the down candles ('AVG Body' mode: the 20-bar average body instead of the body). The
 * imbalance (bull - bear) / (bull + bear) is scaled to 0..100, smoothed with an EMA (the oscillator) and averaged
 * with an SMA (the MA). Glow plots and a five-layer fill to the midline 50 draw the oscillator; the overbought /
 * oversold bands turn red / green when the MA is beyond the MA levels. Pivot divergences between price and
 * oscillator give Bull / Bear labels; crosses of the levels, of the midline and of the MA with the midline give
 * triangle signals.
 * Alerts (alertcondition, `alerts` of the result): the level, midline and MA midline crosses and the divergences.
 *
 * Reference: "Force Pulse" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export interface ForcePulseInputs {
  /** Calculation period (bars of the force sums) */
  lookback: number;
  /** 'Body': candle body; 'AVG Body': 20-bar average body */
  mode: 'Body' | 'AVG Body';
  /** EMA length of the oscillator */
  smoothLen: number;
  /** SMA length of the MA */
  maLength: number;
  calculateDivergence: boolean;
  /** Pivot lookback (left / right) of the divergence detection */
  pivotLength: number;
  signalType: 'None' | 'Overbought/Oversold' | 'Midline' | 'MA Midline' | 'All';
  overbought: number;
  oversold: number;
  maOverbought: number;
  maOversold: number;
  showMa: boolean;
  maColor: string;
  oscColorPositive: string;
  oscColorNegative: string;
  zeroLineColor: string;
  overboughtColor: string;
  oversoldColor: string;
  bullDivColor: string;
  bearDivColor: string;
  textColor: string;
  fillEnabled: boolean;
  fillTransparency: number;
  bandTransparency: number;
  showZeroLineGradient: boolean;
  showOverboughtGradient: boolean;
  showOversoldGradient: boolean;
  showOscillatorGradient: boolean;
  showMaGradient: boolean;
}

export const defaultInputs: ForcePulseInputs = {
  lookback: 20,
  mode: 'Body',
  smoothLen: 3,
  maLength: 20,
  calculateDivergence: true,
  pivotLength: 3,
  signalType: 'Overbought/Oversold',
  overbought: 73.0,
  oversold: 27.0,
  maOverbought: 65.0,
  maOversold: 35.0,
  showMa: true,
  maColor: color.yellow,
  oscColorPositive: 'rgb(6, 162, 47)',
  oscColorNegative: 'rgb(207, 23, 23)',
  zeroLineColor: color.gray,
  overboughtColor: color.red,
  oversoldColor: color.green,
  bullDivColor: color.green,
  bearDivColor: color.red,
  textColor: color.white,
  fillEnabled: true,
  fillTransparency: 70,
  bandTransparency: 40,
  showZeroLineGradient: true,
  showOverboughtGradient: true,
  showOversoldGradient: true,
  showOscillatorGradient: true,
  showMaGradient: true,
};

const CALC = 'Calculation Settings';
const DIV = 'Divergence Detection';
const SIG = 'Signal Settings';
const LEVELS = 'Threshold Levels';
const STYLE = 'Style & Colors';
const GRAD = 'Gradient & Fill';

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Calculation Period', defval: 20, min: 10, max: 200, group: CALC },
  { id: 'mode', type: 'string', title: 'Force Mode', defval: 'Body', options: ['Body', 'AVG Body'], group: CALC },
  { id: 'smoothLen', type: 'int', title: 'Smoothing Length (EMA)', defval: 3, group: CALC },
  { id: 'maLength', type: 'int', title: 'Moving Average Length (SMA)', defval: 20, min: 1, group: CALC },
  { id: 'calculateDivergence', type: 'bool', title: 'Enable Divergence Detection', defval: true, group: DIV },
  { id: 'pivotLength', type: 'int', title: 'Pivot Lookback (Left/Right)', defval: 3, min: 1, group: DIV },
  { id: 'signalType', type: 'string', title: 'Signal Type', defval: 'Overbought/Oversold',
    options: ['None', 'Overbought/Oversold', 'Midline', 'MA Midline', 'All'], group: SIG },
  { id: 'overbought', type: 'float', title: 'Overbought Level', defval: 73.0, step: 0.1, group: LEVELS },
  { id: 'oversold', type: 'float', title: 'Oversold Level', defval: 27.0, step: 0.1, group: LEVELS },
  { id: 'maOverbought', type: 'float', title: 'MA Overbought Level', defval: 65.0, step: 0.1, group: LEVELS },
  { id: 'maOversold', type: 'float', title: 'MA Oversold Level', defval: 35.0, step: 0.1, group: LEVELS },
  { id: 'showMa', type: 'bool', title: 'Show Moving Average', defval: true, group: STYLE },
  { id: 'maColor', type: 'color', title: 'MA Color', defval: color.yellow, group: STYLE },
  { id: 'oscColorPositive', type: 'color', title: 'Oscillator Bullish Color', defval: 'rgb(6, 162, 47)', group: STYLE },
  { id: 'oscColorNegative', type: 'color', title: 'Oscillator Bearish Color', defval: 'rgb(207, 23, 23)', group: STYLE },
  { id: 'zeroLineColor', type: 'color', title: 'Midline Color', defval: color.gray, group: STYLE },
  { id: 'overboughtColor', type: 'color', title: 'Overbought Line Color', defval: color.red, group: STYLE },
  { id: 'oversoldColor', type: 'color', title: 'Oversold Line Color', defval: color.green, group: STYLE },
  { id: 'bullDivColor', type: 'color', title: 'Bullish Divergence Color', defval: color.green, group: STYLE },
  { id: 'bearDivColor', type: 'color', title: 'Bearish Divergence Color', defval: color.red, group: STYLE },
  { id: 'textColor', type: 'color', title: 'Label Text Color', defval: color.white, group: STYLE },
  { id: 'fillEnabled', type: 'bool', title: 'Enable Gradient Fill', defval: true, group: GRAD },
  { id: 'fillTransparency', type: 'int', title: 'Fill Transparency', defval: 70, min: 0, max: 100, group: GRAD },
  { id: 'bandTransparency', type: 'int', title: 'Band/Label Transparency', defval: 40, min: 0, max: 100, group: GRAD },
  { id: 'showZeroLineGradient', type: 'bool', title: 'Midline Gradient', defval: true, group: GRAD },
  { id: 'showOverboughtGradient', type: 'bool', title: 'Overbought Gradient', defval: true, group: GRAD },
  { id: 'showOversoldGradient', type: 'bool', title: 'Oversold Gradient', defval: true, group: GRAD },
  { id: 'showOscillatorGradient', type: 'bool', title: 'Oscillator Gradient', defval: true, group: GRAD },
  { id: 'showMaGradient', type: 'bool', title: 'MA Gradient', defval: true, group: GRAD },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Midline Gradient', color: String(color.new(color.gray, 40)), lineWidth: 2 },
  { id: 'plot1', title: 'Overbought Gradient', color: String(color.new(color.gray, 40)), lineWidth: 10 },
  { id: 'plot2', title: 'Oversold Gradient', color: String(color.new(color.gray, 40)), lineWidth: 10 },
  { id: 'plot3', title: 'Force Pulse', color: 'rgb(6, 162, 47)', lineWidth: 2 },
  { id: 'plot4', title: 'Oscillator Gradient', color: String(color.new('rgb(6, 162, 47)', 85)), lineWidth: 10 },
  { id: 'plot5', title: 'Oscillator Gradient Wide', color: String(color.new('rgb(6, 162, 47)', 94)), lineWidth: 16 },
  { id: 'plot6', title: 'MA', color: color.yellow, lineWidth: 2 },
  { id: 'plot7', title: 'MA Gradient', color: String(color.new(color.yellow, 85)), lineWidth: 6 },
  { id: 'plot8', title: 'Mid Layer 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot9', title: 'Mid Layer 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot10', title: 'Mid Layer 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot11', title: 'Mid Layer 4', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot12', title: 'Midline for Fill', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot13', title: 'Bullish Divergence', color: color.green, lineWidth: 2 },
  { id: 'plot14', title: 'Bearish Divergence', color: color.red, lineWidth: 2 },
];

export const metadata = {
  title: 'Force Pulse',
  shortTitle: 'Force Pulse',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<ForcePulseInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const rangeUpper = 60;
  const rangeLower = 5;

  // Force Pulse calculation
  const body = bars.map((b) => Math.abs(b.close - b.open));
  const avgBody = A(ta.sma(S(body), 20));
  const up = bars.map((b) => ge(b.close, b.open)); // close >= open
  const down = bars.map((b) => lt(b.close, b.open)); // close < open
  const avg = cfg.mode === 'AVG Body';
  const bullForce = bars.map((_b, i) => (avg ? (up[i] ? avgBody[i] : 0) : (up[i] ? body[i] : 0)));
  const bearForce = bars.map((_b, i) => (avg ? (down[i] ? avgBody[i] : 0) : (down[i] ? body[i] : 0)));
  // bullSum = ta.cum(bullForce) - ta.cum(bullForce)[lookback]
  const cumBull = A(ta.cum(S(bullForce)));
  const cumBear = A(ta.cum(S(bearForce)));
  const lb = cfg.lookback;
  const norm = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const bullSum = i - lb >= 0 ? cumBull[i] - cumBull[i - lb] : NaN;
    const bearSum = i - lb >= 0 ? cumBear[i] - cumBear[i - lb] : NaN;
    const total = bullSum + bearSum;
    // A plain division (as Pine): x / 0 is +-infinity, 0 / 0 is na
    const imbalance = eq(total, 0) ? 0 : (bullSum - bearSum) / total;
    const v = (imbalance + 1) * 50;
    // norm := math.max(math.min(norm, 100), 0) (na stays na)
    norm[i] = isNaN(v) ? NaN : Math.max(Math.min(v, 100), 0);
  }
  const cpo = A(ta.ema(S(norm), cfg.smoothLen));
  const maCpo = A(ta.sma(S(cpo), cfg.maLength));

  // Divergence detection
  const pr = cfg.pivotLength;
  const pivotLowOsc = A(ta.pivotlow(S(cpo), pr, pr));
  const pivotHighOsc = A(ta.pivothigh(S(cpo), pr, pr));
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const oscLbr = (i: number) => (i - pr >= 0 ? cpo[i - pr] : NaN);
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
      const lowLbr = i - pr >= 0 ? bars[i - pr].low : NaN;
      const highLbr = i - pr >= 0 ? bars[i - pr].high : NaN;

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
  const plotColor = (i: number) => (ge(cpo[i], 50) ? cfg.oscColorPositive : cfg.oscColorNegative);
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
  const midGrad = String(color.new(cfg.zeroLineColor, cfg.bandTransparency));
  // plot(showZeroLineGradient ? 50 : na, color.new(zeroLineColor, bandTransparency), linewidth = 2)
  plots.plot0 = P((i) => ({ time: t(i), value: cfg.showZeroLineGradient ? 50 : NaN, color: midGrad }));
  // plot(showOverboughtGradient ? overbought : na,
  //      color.new(maCpo >= maOverbought ? overboughtColor : zeroLineColor, bandTransparency), linewidth = 10)
  plots.plot1 = P((i) => ({
    time: t(i), value: cfg.showOverboughtGradient ? cfg.overbought : NaN,
    color: String(color.new(ge(maCpo[i], cfg.maOverbought) ? cfg.overboughtColor : cfg.zeroLineColor, cfg.bandTransparency)),
  }));
  plots.plot2 = P((i) => ({
    time: t(i), value: cfg.showOversoldGradient ? cfg.oversold : NaN,
    color: String(color.new(le(maCpo[i], cfg.maOversold) ? cfg.oversoldColor : cfg.zeroLineColor, cfg.bandTransparency)),
  }));
  plots.plot3 = P((i) => ({ time: t(i), value: cpo[i], color: plotColor(i) }));
  plots.plot4 = P((i) => ({
    time: t(i), value: cfg.showOscillatorGradient ? cpo[i] : NaN, color: String(color.new(plotColor(i), 85)),
  }));
  plots.plot5 = P((i) => ({
    time: t(i), value: cfg.showOscillatorGradient ? cpo[i] : NaN, color: String(color.new(plotColor(i), 94)),
  }));
  plots.plot6 = P((i) => ({ time: t(i), value: cfg.showMa ? maCpo[i] : NaN, color: cfg.maColor }));
  const maGrad = String(color.new(cfg.maColor, 85));
  plots.plot7 = P((i) => ({ time: t(i), value: cfg.showMa && cfg.showMaGradient ? maCpo[i] : NaN, color: maGrad }));
  plots.plot8 = P((i) => ({ time: t(i), value: cpo[i] * 0.8 + 50 * 0.2 }));
  plots.plot9 = P((i) => ({ time: t(i), value: cpo[i] * 0.6 + 50 * 0.4 }));
  plots.plot10 = P((i) => ({ time: t(i), value: cpo[i] * 0.4 + 50 * 0.6 }));
  plots.plot11 = P((i) => ({ time: t(i), value: cpo[i] * 0.2 + 50 * 0.8 }));
  plots.plot12 = P((i) => ({ time: t(i), value: 50 }));
  // plot(calculateDivergence and plFound ? oscLbr : na, offset = -lookbackRight,
  //      color = bullCond ? bullDivColor : color.new(color.white, 100)): the value of bar i is drawn on bar i - pr
  plots.plot13 = P((i) => (i - pr < 0 ? null : {
    time: barTime(bars, i - pr, interval),
    value: cfg.calculateDivergence && plFound[i] ? oscLbr(i) : NaN,
    color: bullCond[i] ? cfg.bullDivColor : noDiv,
  }));
  plots.plot14 = P((i) => (i - pr < 0 ? null : {
    time: barTime(bars, i - pr, interval),
    value: cfg.calculateDivergence && phFound[i] ? oscLbr(i) : NaN,
    color: bearCond[i] ? cfg.bearDivColor : noDiv,
  }));

  // fill(p1, p_mid1, fillEnabled ? color.new(plotColor, fillTransparency) : na) ... + 5, + 10, + 15, + 20
  const layer = (k: number) => bars.map((_b, i) => (cfg.fillEnabled
    ? String(color.new(plotColor(i), cfg.fillTransparency + k)) : 'transparent'));
  const fills = [
    { plot1: 'plot3', plot2: 'plot8', colors: layer(0) },
    { plot1: 'plot8', plot2: 'plot9', colors: layer(5) },
    { plot1: 'plot9', plot2: 'plot10', colors: layer(10) },
    { plot1: 'plot10', plot2: 'plot11', colors: layer(15) },
    { plot1: 'plot11', plot2: 'plot12', colors: layer(20) },
  ];

  const markers: MarkerData[] = [];
  const bullLabel = String(color.new(cfg.bullDivColor, cfg.bandTransparency));
  const bearLabel = String(color.new(cfg.bearDivColor, cfg.bandTransparency));
  const showObos = cfg.signalType === 'Overbought/Oversold' || cfg.signalType === 'All';
  const showZero = cfg.signalType === 'Midline' || cfg.signalType === 'All';
  const showMaZero = cfg.signalType === 'MA Midline' || cfg.signalType === 'All';
  // ta.crossover(a, b): a > b and a[1] <= b[1]; ta.crossunder(a, b): a < b and a[1] >= b[1]; both compare exactly
  // (no 1e-10 tolerance; na compares false)
  const crossover = (a: number[], b: number, i: number) => i > 0 && a[i] > b && a[i - 1] <= b;
  const crossunder = (a: number[], b: number, i: number) => i > 0 && a[i] < b && a[i - 1] >= b;
  const flags: boolean[][] = Array.from({ length: 8 }, () => []);
  for (let i = 0; i < n; i++) {
    // Signal triangles: location.bottom (long) / location.top (short), size.tiny
    // (ids shape0..shape5: the plotshapes in the original's order)
    const buy = (on: boolean, id: string) => {
      if (on) markers.push({ time: t(i), position: 'bottom', shape: 'triangleUp', color: cfg.oversoldColor, size: 'tiny', id });
    };
    const sell = (on: boolean, id: string) => {
      if (on) markers.push({ time: t(i), position: 'top', shape: 'triangleDown', color: cfg.overboughtColor, size: 'tiny', id });
    };
    const sig = [
      crossover(cpo, cfg.oversold, i), crossunder(cpo, cfg.overbought, i), crossover(cpo, 50, i),
      crossunder(cpo, 50, i), crossover(maCpo, 50, i), crossunder(maCpo, 50, i),
    ];
    sig.forEach((on, k) => flags[k].push(on));
    flags[6].push(bullCond[i]);
    flags[7].push(bearCond[i]);
    buy(showObos && sig[0], 'shape0');
    sell(showObos && sig[1], 'shape1');
    buy(showZero && sig[2], 'shape2');
    sell(showZero && sig[3], 'shape3');
    buy(showMaZero && sig[4], 'shape4');
    sell(showMaZero && sig[5], 'shape5');
    // plotshape(bullCond ? oscLbr : na, offset = -lookbackRight, text = ' Bull ', shape.labelup, location.absolute,
    //   color.new(bullDivColor, bandTransparency), textcolor = textColor, size.small)
    if (i - pr >= 0) {
      const price = oscLbr(i);
      if (bullCond[i] && !isNaN(price)) {
        markers.push({ time: barTime(bars, i - pr, interval), position: 'atPriceBottom', price, shape: 'labelUp',
          color: bullLabel, text: ' Bull ', textColor: cfg.textColor, size: 'small', id: 'shape6' });
      }
      if (bearCond[i] && !isNaN(price)) {
        markers.push({ time: barTime(bars, i - pr, interval), position: 'atPriceTop', price, shape: 'labelDown',
          color: bearLabel, text: ' Bear ', textColor: cfg.textColor, size: 'small', id: 'shape7' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots,
    hlines: [
      { value: 50, options: { title: 'Midline', color: cfg.zeroLineColor, linestyle: 'dashed' } },
      { value: cfg.overbought, options: { title: 'Overbought', color: cfg.overboughtColor, linestyle: 'dashed' } },
      { value: cfg.oversold, options: { title: 'Oversold', color: cfg.oversoldColor, linestyle: 'dashed' } },
    ],
    fills,
    markers,
    // alertcondition(longSignalObos / shortSignalObos / longSignalZero / shortSignalZero / longSignalMaZero /
    // shortSignalMaZero / bullCond / bearCond)
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy – Oversold', message: 'Force Pulse: Price crossed above oversold level' },
  { id: 'alert1', title: 'Sell – Overbought', message: 'Force Pulse: Price crossed below overbought level' },
  { id: 'alert2', title: 'Midline Long', message: 'Force Pulse: Oscillator crossed above Midline' },
  { id: 'alert3', title: 'Midline Short', message: 'Force Pulse: Oscillator crossed below Midline' },
  { id: 'alert4', title: 'MA Midline Long', message: 'Force Pulse: MA crossed above Midline' },
  { id: 'alert5', title: 'MA Midline Short', message: 'Force Pulse: MA crossed below Midline' },
  { id: 'alert6', title: 'Bullish Divergence', message: 'Force Pulse: Bullish divergence detected' },
  { id: 'alert7', title: 'Bearish Divergence', message: 'Force Pulse: Bearish divergence detected' },
];

export const ForcePulse = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
