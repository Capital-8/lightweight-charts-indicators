/**
 * MPO4 Lines – Modal Engine
 *
 * Candle pressure oscillator lines. Each bar contributes its direction (+1 up, -1 down, 0 flat) times its body
 * divided by the SMA of the bodies over the lookback (1 when that SMA is 0 or na); the contributions are summed over
 * the lookback, normalised to rolling / (2 * lookback) * 100 and smoothed by an EMA. The slow line gets a second
 * EMA. Fast line B has a five-layer fill to zero and a fill to fast line A; bands at the overbought / oversold
 * levels change colour with the order of the fast lines. Circles mark fast line A crossing back from the oversold /
 * overbought levels; pivot divergences between price and fast line A give Bull / Bear labels.
 *
 * Alerts (alertcondition, `alerts` of the result): the buy / sell return signals (when shown), the slow line colour
 * change (Direction mode / Position vs Zero mode) and the bullish / bearish divergences on fast line A.
 *
 * Reference: "MPO4 Lines – Modal Engine" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export type Mpo4SlowColorMode = 'Direction' | 'Position vs Zero';

export interface Mpo4LinesModalEngineInputs {
  /** Slow line colouring: direction (rising / falling) or position against zero */
  slowColorMode: Mpo4SlowColorMode;
  showLine1: boolean;
  showLine2: boolean;
  showLine3: boolean;
  showLine4: boolean;
  /** Slow line lookback */
  len1: number;
  /** Slow line primary EMA */
  smoothLen1: number;
  /** Slow line extra EMA */
  extraSmoothLen: number;
  len2: number;
  smoothLen2: number;
  len3: number;
  smoothLen3: number;
  len4: number;
  smoothLen4: number;
  overbought: number;
  oversold: number;
  /** Circles when fast line A crosses back from the oversold / overbought levels */
  showObosSignals: boolean;
  /** Divergences on fast line A */
  calculateDivergence: boolean;
  /** Pivot length (left / right) */
  pivotLength: number;
  line1ColorPositive: string;
  line1ColorNegative: string;
  line2ColorPositive: string;
  line2ColorNegative: string;
  line3ColorPositive: string;
  line3ColorNegative: string;
  line4ColorPositive: string;
  line4ColorNegative: string;
  zeroLineColor: string;
  overboughtLineColor: string;
  oversoldLineColor: string;
  bullDivColor: string;
  bearDivColor: string;
  textColor: string;
  gradientTransparency: number;
  line2Line3GradientTransparency: number;
  bandTransparency: number;
  showOverboughtGradient: boolean;
  showOversoldGradient: boolean;
  showFastBToZeroGradient: boolean;
}

export const defaultInputs: Mpo4LinesModalEngineInputs = {
  slowColorMode: 'Direction',
  showLine1: true,
  showLine2: true,
  showLine3: true,
  showLine4: false,
  len1: 20,
  smoothLen1: 5,
  extraSmoothLen: 5,
  len2: 6,
  smoothLen2: 7,
  len3: 6,
  smoothLen3: 10,
  len4: 14,
  smoothLen4: 1,
  overbought: 30.0,
  oversold: -30.0,
  showObosSignals: true,
  calculateDivergence: true,
  pivotLength: 2,
  line1ColorPositive: 'rgb(6, 162, 47)',
  line1ColorNegative: 'rgb(207, 23, 23)',
  line2ColorPositive: 'rgb(163, 231, 172)',
  line2ColorNegative: 'rgb(237, 121, 121)',
  line3ColorPositive: 'rgb(6, 162, 47)',
  line3ColorNegative: 'rgb(207, 23, 23)',
  line4ColorPositive: 'rgb(6, 162, 47)',
  line4ColorNegative: 'rgb(207, 23, 23)',
  zeroLineColor: color.gray,
  overboughtLineColor: color.red,
  oversoldLineColor: color.green,
  bullDivColor: color.green,
  bearDivColor: color.red,
  textColor: color.white,
  gradientTransparency: 75,
  line2Line3GradientTransparency: 50,
  bandTransparency: 40,
  showOverboughtGradient: true,
  showOversoldGradient: true,
  showFastBToZeroGradient: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'slowColorMode', type: 'string', title: 'Slow Line Coloring Mode', defval: 'Direction', options: ['Direction', 'Position vs Zero'] },
  { id: 'showLine1', type: 'bool', title: 'Show Slow Line', defval: true },
  { id: 'showLine2', type: 'bool', title: 'Show Fast Line A', defval: true },
  { id: 'showLine3', type: 'bool', title: 'Show Fast Line B', defval: true },
  { id: 'showLine4', type: 'bool', title: 'Show Line 4', defval: false },
  { id: 'len1', type: 'int', title: 'Slow Line Lookback (Base)', defval: 20 },
  { id: 'smoothLen1', type: 'int', title: 'Slow Line Primary Smoothing (EMA)', defval: 5 },
  { id: 'extraSmoothLen', type: 'int', title: 'Slow Line Extra Smoothing (EMA)', defval: 5, min: 1 },
  { id: 'len2', type: 'int', title: 'Fast Line A Lookback', defval: 6 },
  { id: 'smoothLen2', type: 'int', title: 'Fast Line A Smoothing (EMA)', defval: 7 },
  { id: 'len3', type: 'int', title: 'Fast Line B Lookback', defval: 6 },
  { id: 'smoothLen3', type: 'int', title: 'Fast Line B Smoothing (EMA)', defval: 10 },
  { id: 'len4', type: 'int', title: 'Line 4 Lookback', defval: 14 },
  { id: 'smoothLen4', type: 'int', title: 'Line 4 Smoothing (EMA)', defval: 1 },
  { id: 'overbought', type: 'float', title: 'Overbought Threshold', defval: 30.0, step: 0.1 },
  { id: 'oversold', type: 'float', title: 'Oversold Threshold', defval: -30.0, step: 0.1 },
  { id: 'showObosSignals', type: 'bool', title: 'Show Fast A OB/OS Return Signals', defval: true },
  { id: 'calculateDivergence', type: 'bool', title: 'Enable Divergence (on Fast Line A)', defval: true },
  { id: 'pivotLength', type: 'int', title: 'Pivot Length (Left/Right)', defval: 2, min: 1 },
  { id: 'line1ColorPositive', type: 'color', title: 'Slow Line Bullish', defval: 'rgb(6, 162, 47)' },
  { id: 'line1ColorNegative', type: 'color', title: 'Slow Line Bearish', defval: 'rgb(207, 23, 23)' },
  { id: 'line2ColorPositive', type: 'color', title: 'Fast Line A Bullish', defval: 'rgb(163, 231, 172)' },
  { id: 'line2ColorNegative', type: 'color', title: 'Fast Line A Bearish', defval: 'rgb(237, 121, 121)' },
  { id: 'line3ColorPositive', type: 'color', title: 'Fast Line B Bullish', defval: 'rgb(6, 162, 47)' },
  { id: 'line3ColorNegative', type: 'color', title: 'Fast Line B Bearish', defval: 'rgb(207, 23, 23)' },
  { id: 'line4ColorPositive', type: 'color', title: 'Line 4 Bullish', defval: 'rgb(6, 162, 47)' },
  { id: 'line4ColorNegative', type: 'color', title: 'Line 4 Bearish', defval: 'rgb(207, 23, 23)' },
  { id: 'zeroLineColor', type: 'color', title: 'Zero Line Color', defval: color.gray },
  { id: 'overboughtLineColor', type: 'color', title: 'Overbought Line Color', defval: color.red },
  { id: 'oversoldLineColor', type: 'color', title: 'Oversold Line Color', defval: color.green },
  { id: 'bullDivColor', type: 'color', title: 'Bullish Divergence Color', defval: color.green },
  { id: 'bearDivColor', type: 'color', title: 'Bearish Divergence Color', defval: color.red },
  { id: 'textColor', type: 'color', title: 'Divergence Text Color', defval: color.white },
  { id: 'gradientTransparency', type: 'int', title: 'Fast B to Zero Gradient Transparency', defval: 75, min: 0, max: 100 },
  { id: 'line2Line3GradientTransparency', type: 'int', title: 'Fast A to B Fill Transparency', defval: 50, min: 0, max: 100 },
  { id: 'bandTransparency', type: 'int', title: 'Band Gradient Transparency', defval: 40, min: 0, max: 100 },
  { id: 'showOverboughtGradient', type: 'bool', title: 'Show Overbought Gradient', defval: true },
  { id: 'showOversoldGradient', type: 'bool', title: 'Show Oversold Gradient', defval: true },
  { id: 'showFastBToZeroGradient', type: 'bool', title: 'Show Fast B to Zero Gradient', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Slow Line', color: 'rgb(6, 162, 47)', lineWidth: 3 },
  { id: 'plot1', title: 'Fast Line A', color: 'rgb(163, 231, 172)', lineWidth: 2 },
  { id: 'plot2', title: 'Fast Line B', color: 'rgb(6, 162, 47)', lineWidth: 2 },
  { id: 'plot3', title: 'Line 4', color: 'rgb(6, 162, 47)', lineWidth: 2 },
  { id: 'plot4', title: 'Intermediate Layer 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Intermediate Layer 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Intermediate Layer 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'Intermediate Layer 4', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot8', title: 'Zero Line for Fill', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot9', title: 'Overbought Gradient', color: String(color.new(color.gray, 40)), lineWidth: 10 },
  { id: 'plot10', title: 'Oversold Gradient', color: String(color.new(color.gray, 40)), lineWidth: 10 },
  { id: 'plot11', title: 'Bullish Divergence', color: color.green, lineWidth: 2 },
  { id: 'plot12', title: 'Bearish Divergence', color: color.red, lineWidth: 2 },
];

export const metadata = {
  title: 'MPO4 Lines – Modal Engine',
  shortTitle: 'MPO4',
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
  inputs: Partial<Mpo4LinesModalEngineInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const rangeUpper = 60;
  const rangeLower = 5;

  // calcCPO(_len, _smooth)
  const body = bars.map((b) => Math.abs(b.close - b.open));
  const bodyS = S(body);
  const direction = bars.map((b) => (gt(b.close, b.open) ? 1.0 : lt(b.close, b.open) ? -1.0 : 0.0));
  const calcCPO = (len: number, smooth: number): number[] => {
    const avgBody = A(ta.sma(bodyS, len));
    // weight = avgBody != 0 ? body / avgBody : 1.0 (na != 0 is false)
    const contrib = body.map((bd, i) => direction[i] * (!isNaN(avgBody[i]) && Math.abs(avgBody[i]) > EPS ? bd / avgBody[i] : 1.0));
    const norm: number[] = new Array(n);
    for (let b = 0; b < n; b++) {
      // rolling = sum of contrib[i] for i = 0 to _len - 1 (na before bar 0)
      let rolling = 0.0;
      const step = len - 1 >= 0 ? 1 : -1;
      for (let i = 0; step > 0 ? i <= len - 1 : i >= len - 1; i += step) {
        rolling += b - i >= 0 && b - i < n ? contrib[b - i] : NaN;
      }
      norm[b] = (rolling / (len * 2)) * 100;
    }
    return A(ta.ema(S(norm), smooth));
  };
  const line1Raw = calcCPO(cfg.len1, cfg.smoothLen1);
  const line1 = A(ta.ema(S(line1Raw), cfg.extraSmoothLen));
  const line2 = calcCPO(cfg.len2, cfg.smoothLen2);
  const line3 = calcCPO(cfg.len3, cfg.smoothLen3);
  const line4 = calcCPO(cfg.len4, cfg.smoothLen4);

  // Colours (color.new(c, 0))
  const c0 = (c: string) => String(color.new(c, 0));
  const line1Color = (i: number) => (cfg.slowColorMode === 'Position vs Zero'
    ? (ge(line1[i], 0) ? c0(cfg.line1ColorPositive) : c0(cfg.line1ColorNegative))
    : (gt(line1[i], i > 0 ? line1[i - 1] : NaN) ? c0(cfg.line1ColorPositive) : c0(cfg.line1ColorNegative)));
  const line2Color = (i: number) => (ge(line2[i], 0) ? c0(cfg.line2ColorPositive) : c0(cfg.line2ColorNegative));
  const line3Color = (i: number) => (ge(line3[i], 0) ? c0(cfg.line3ColorPositive) : c0(cfg.line3ColorNegative));
  const line4Color = (i: number) => (ge(line4[i], 0) ? c0(cfg.line4ColorPositive) : c0(cfg.line4ColorNegative));

  // Divergence on fast line A
  const lb = cfg.pivotLength;
  const pivotHighOsc = A(ta.pivothigh(S(line2), lb, lb));
  const pivotLowOsc = A(ta.pivotlow(S(line2), lb, lb));
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const oscLbr = (i: number) => (i - lb >= 0 ? line2[i - lb] : NaN);
  {
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
    let bullVar = false; // var bool bullCond = false
    let bearVar = false; // var bool bearCond = false
    for (let i = 0; i < n; i++) {
      if (cfg.calculateDivergence) {
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
        bullVar = priceLl && oscHl && plFoundVar;

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
        bearVar = priceHh && oscLh && phFoundVar;
      }
      plFound[i] = plFoundVar;
      phFound[i] = phFoundVar;
      bullCond[i] = bullVar;
      bearCond[i] = bearVar;
    }
  }

  const interval = barInterval(bars);
  const t = (i: number) => bars[i].time;
  const P = (f: (i: number) => Point | null): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p = f(i);
      if (p) out.push(p);
    }
    return out;
  };
  const showMid = cfg.showLine3 && cfg.showFastBToZeroGradient;
  const noDiv = String(color.new(color.white, 100));
  const plots: Record<string, Point[]> = {
    plot0: P((i) => ({ time: t(i), value: cfg.showLine1 ? line1[i] : NaN, color: line1Color(i) })),
    plot1: P((i) => ({ time: t(i), value: cfg.showLine2 ? line2[i] : NaN, color: line2Color(i) })),
    plot2: P((i) => ({ time: t(i), value: cfg.showLine3 ? line3[i] : NaN, color: line3Color(i) })),
    plot3: P((i) => ({ time: t(i), value: cfg.showLine4 ? line4[i] : NaN, color: line4Color(i) })),
    // plot(showLine3 and showFastBToZeroGradient ? line3 * k : na, color = na, display = display.none)
    plot4: P((i) => ({ time: t(i), value: showMid ? line3[i] * 0.8 : NaN })),
    plot5: P((i) => ({ time: t(i), value: showMid ? line3[i] * 0.6 : NaN })),
    plot6: P((i) => ({ time: t(i), value: showMid ? line3[i] * 0.4 : NaN })),
    plot7: P((i) => ({ time: t(i), value: showMid ? line3[i] * 0.2 : NaN })),
    plot8: P((i) => ({ time: t(i), value: 0 })),
    // plot(showOverboughtGradient ? overbought : na,
    //      color.new(line2 <= line3 ? overboughtLineColor : zeroLineColor, bandTransparency), linewidth = 10)
    plot9: P((i) => ({
      time: t(i), value: cfg.showOverboughtGradient ? cfg.overbought : NaN,
      color: String(color.new(le(line2[i], line3[i]) ? cfg.overboughtLineColor : cfg.zeroLineColor, cfg.bandTransparency)),
    })),
    // plot(showOversoldGradient ? oversold : na, color.new(line2 > line3 ? oversoldLineColor : zeroLineColor, ...))
    plot10: P((i) => ({
      time: t(i), value: cfg.showOversoldGradient ? cfg.oversold : NaN,
      color: String(color.new(gt(line2[i], line3[i]) ? cfg.oversoldLineColor : cfg.zeroLineColor, cfg.bandTransparency)),
    })),
    // plot(calculateDivergence and plFound ? oscLbr : na, offset = -lookbackRight,
    //      color = bullCond ? bullDivColor : color.new(color.white, 100)): the value of bar i is drawn on bar i - lb
    plot11: P((i) => (i - lb < 0 ? null : {
      time: barTime(bars, i - lb, interval),
      value: cfg.calculateDivergence && plFound[i] ? oscLbr(i) : NaN,
      color: bullCond[i] ? cfg.bullDivColor : noDiv,
    })),
    plot12: P((i) => (i - lb < 0 ? null : {
      time: barTime(bars, i - lb, interval),
      value: cfg.calculateDivergence && phFound[i] ? oscLbr(i) : NaN,
      color: bearCond[i] ? cfg.bearDivColor : noDiv,
    })),
  };

  // fillColor = line3 >= 0 ? color.new(line3ColorPositive, gradientTransparency) : color.new(line3ColorNegative, ...)
  const gT = cfg.gradientTransparency;
  const layer = (k: number) => bars.map((_b, i) => {
    if (!showMid) return 'transparent';
    if (k === 0) return String(color.new(ge(line3[i], 0) ? cfg.line3ColorPositive : cfg.line3ColorNegative, gT));
    return String(color.new(line3Color(i), gT + k));
  });
  const fills = [
    { plot1: 'plot2', plot2: 'plot4', options: { title: 'Fill Layer 1' }, colors: layer(0) },
    { plot1: 'plot4', plot2: 'plot5', options: { title: 'Fill Layer 2' }, colors: layer(5) },
    { plot1: 'plot5', plot2: 'plot6', options: { title: 'Fill Layer 3' }, colors: layer(10) },
    { plot1: 'plot6', plot2: 'plot7', options: { title: 'Fill Layer 4' }, colors: layer(15) },
    { plot1: 'plot7', plot2: 'plot8', options: { title: 'Fill Layer 5' }, colors: layer(20) },
    // fill(plot_line2, plot_line3, showLine2 and showLine3 ? color.new(line2Color, line2Line3GradientTransparency) : na)
    { plot1: 'plot1', plot2: 'plot2', options: { title: 'Fast A to B Fill' },
      colors: bars.map((_b, i) => (cfg.showLine2 && cfg.showLine3
        ? String(color.new(line2Color(i), cfg.line2Line3GradientTransparency)) : 'transparent')) },
  ];

  const markers: MarkerData[] = [];
  const buyColor = String(color.new(cfg.oversoldLineColor, 60));
  const sellColor = String(color.new(cfg.overboughtLineColor, 60));
  const bullLabel = String(color.new(cfg.bullDivColor, 40));
  const bearLabel = String(color.new(cfg.bearDivColor, 40));
  const buyAlert = new Array<boolean>(n).fill(false);
  const sellAlert = new Array<boolean>(n).fill(false);
  const dirChange = new Array<boolean>(n).fill(false);
  const posChange = new Array<boolean>(n).fill(false);
  const l1 = (i: number) => (i >= 0 ? line1[i] : NaN);
  for (let i = 0; i < n; i++) {
    // ta.crossover(line2, oversold) / ta.crossunder(line2, overbought): exact comparisons (na compares false)
    const longSignal = i > 0 && line2[i] > cfg.oversold && line2[i - 1] <= cfg.oversold;
    const shortSignal = i > 0 && line2[i] < cfg.overbought && line2[i - 1] >= cfg.overbought;
    // supBuySignal / supSellSignal
    buyAlert[i] = cfg.showObosSignals && longSignal;
    sellAlert[i] = cfg.showObosSignals && shortSignal;
    // colorChangeDirection = slowColorMode == 'Direction' and (line1 > line1[1]) != (line1[1] > line1[2])
    dirChange[i] = cfg.slowColorMode === 'Direction' && gt(l1(i), l1(i - 1)) !== gt(l1(i - 1), l1(i - 2));
    // colorChangePosition = slowColorMode == 'Position vs Zero' and (line1 >= 0) != (line1[1] >= 0)
    posChange[i] = cfg.slowColorMode === 'Position vs Zero' && ge(l1(i), 0) !== ge(l1(i - 1), 0);
    // plotshape(supBuySignal ? line2 : na, location.bottom, color.new(oversoldLineColor, 60), shape.circle, size.tiny)
    if (cfg.showObosSignals && longSignal) {
      markers.push({ time: t(i), position: 'bottom', shape: 'circle', color: buyColor, size: 'tiny' });
    }
    // plotshape(supSellSignal ? line2 : na, location.top, color.new(overboughtLineColor, 60), shape.circle, size.tiny)
    if (cfg.showObosSignals && shortSignal) {
      markers.push({ time: t(i), position: 'top', shape: 'circle', color: sellColor, size: 'tiny' });
    }
    // plotshape(bullCond ? oscLbr : na, offset = -lookbackRight, text = ' Bull ', shape.labelup, location.absolute,
    //   color.new(bullDivColor, 40), textcolor = textColor, size.small)
    if (i - lb >= 0) {
      const price = oscLbr(i);
      if (bullCond[i] && !isNaN(price)) {
        markers.push({ time: barTime(bars, i - lb, interval), position: 'atPriceBottom', price, shape: 'labelUp',
          color: bullLabel, text: ' Bull ', textColor: cfg.textColor, size: 'small' });
      }
      if (bearCond[i] && !isNaN(price)) {
        markers.push({ time: barTime(bars, i - lb, interval), position: 'atPriceTop', price, shape: 'labelDown',
          color: bearLabel, text: ' Bear ', textColor: cfg.textColor, size: 'small' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots,
    hlines: [
      { value: 0, options: { title: 'Zero Line', color: cfg.zeroLineColor, linestyle: 'dashed' } },
      { value: cfg.overbought, options: { title: 'Overbought', color: cfg.overboughtLineColor, linestyle: 'dashed' } },
      { value: cfg.oversold, options: { title: 'Oversold', color: cfg.oversoldLineColor, linestyle: 'dashed' } },
    ],
    fills,
    markers,
    alerts: alertStates(alertConditions, bars, [buyAlert, sellAlert, dirChange, posChange, bullCond, bearCond]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy: Fast A Return from Oversold', message: 'Fast Line A crossed above oversold level.' },
  { id: 'alert1', title: 'Sell: Fast A Return from Overbought', message: 'Fast Line A crossed below overbought level.' },
  { id: 'alert2', title: 'Slow Line Color Change (Direction Mode)', message: 'Slow Line changed direction.' },
  { id: 'alert3', title: 'Slow Line Color Change (Position vs Zero Mode)', message: 'Slow Line crossed zero level.' },
  { id: 'alert4', title: 'Bullish Divergence (Fast A)', message: 'Bullish divergence detected on Fast Line A.' },
  { id: 'alert5', title: 'Bearish Divergence (Fast A)', message: 'Bearish divergence detected on Fast Line A.' },
];

export const Mpo4LinesModalEngine = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
