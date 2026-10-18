/**
 * SMA Squeeze Oscillator
 *
 * Three SMAs of the close (6, 18, 26). A squeeze is on when the spread between the highest and the lowest of them is
 * below ATR * multiplier. The momentum is the SMA (3) of ((sma1 - sma2) + (sma1 - sma3)) / 2. Gradient fills from
 * the momentum to zero are green / red outside a squeeze and yellow inside it. Diamonds mark the momentum crosses of
 * zero, circles the first bar after a squeeze (both filtered by the close against an SMA filter when enabled).
 * Candles are coloured yellow in a squeeze, else green / red by the momentum sign. Pivot divergences between the
 * momentum and the price give Bull / Bear labels.
 * Alerts (alertcondition, `alerts` of the result): bull / bear cross of zero, first bar after a squeeze long / short,
 * bullish / bearish divergence (on the bar that confirms the pivot), true on the bars of each signal.
 *
 * Reference: "SMA Squeeze Oscillator" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, PlotCandleData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SmaSqueezeOscillatorInputs {
  /** SMA 1 length (squeeze and momentum) */
  len1: number;
  /** SMA 2 length (squeeze and momentum) */
  len2: number;
  /** SMA 3 length (squeeze and momentum) */
  len3: number;
  /** Filter the signals and the zero line colour by the close against the SMA filter */
  useSmaFilter: boolean;
  /** SMA filter length */
  smaFilterLen: number;
  /** ATR length */
  atrLen: number;
  /** ATR multiplier of the squeeze threshold */
  atrMult: number;
  /** SMA smoothing of the momentum */
  momentumSmoothing: number;
  /** Colour the candles (wave style) */
  enableCandleColor: boolean;
  /** Draw the divergences */
  calculateDivergence: boolean;
  /** Pivot length (left and right) */
  pivotLength: number;
  bullColor: string;
  bearColor: string;
  squeezeColor: string;
  bullCrossColor: string;
  bearCrossColor: string;
  firstLongColor: string;
  firstShortColor: string;
  /** Divergence text colour */
  textColor: string;
}

export const defaultInputs: SmaSqueezeOscillatorInputs = {
  len1: 6,
  len2: 18,
  len3: 26,
  useSmaFilter: true,
  smaFilterLen: 50,
  atrLen: 14,
  atrMult: 0.8,
  momentumSmoothing: 3,
  enableCandleColor: true,
  calculateDivergence: true,
  pivotLength: 2,
  bullColor: '#54b859',
  bearColor: '#e06161',
  squeezeColor: '#e9cd31',
  bullCrossColor: '#16b900',
  bearCrossColor: '#df0303',
  firstLongColor: '#16b900',
  firstShortColor: '#df0303',
  textColor: color.white,
};

export const inputConfig: InputConfig[] = [
  { id: 'len1', type: 'int', title: 'SMA 1 (used for Squeeze & Momentum)', defval: 6 },
  { id: 'len2', type: 'int', title: 'SMA 2 (used for Squeeze & Momentum)', defval: 18 },
  { id: 'len3', type: 'int', title: 'SMA 3 (used for Squeeze & Momentum)', defval: 26 },
  { id: 'useSmaFilter', type: 'bool', title: 'Enable SMA Filter', defval: true },
  { id: 'smaFilterLen', type: 'int', title: 'SMA Filter Length', defval: 50 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 0.8, step: 0.1 },
  { id: 'momentumSmoothing', type: 'int', title: 'Momentum SMA Smoothing', defval: 3 },
  { id: 'enableCandleColor', type: 'bool', title: 'Enable candle coloring (wave style)', defval: true },
  { id: 'calculateDivergence', type: 'bool', title: 'Enable Divergence', defval: true },
  { id: 'pivotLength', type: 'int', title: 'Pivot Length', defval: 2, min: 1 },
  { id: 'bullColor', type: 'color', title: 'Bullish color (green)', defval: '#54b859' },
  { id: 'bearColor', type: 'color', title: 'Bearish color (red)', defval: '#e06161' },
  { id: 'squeezeColor', type: 'color', title: 'Squeeze color (yellow)', defval: '#e9cd31' },
  { id: 'bullCrossColor', type: 'color', title: 'Bull Cross color', defval: '#16b900' },
  { id: 'bearCrossColor', type: 'color', title: 'Bear Cross color', defval: '#df0303' },
  { id: 'firstLongColor', type: 'color', title: '1st after Squeeze LONG color', defval: '#16b900' },
  { id: 'firstShortColor', type: 'color', title: '1st after Squeeze SHORT color', defval: '#df0303' },
  { id: 'textColor', type: 'color', title: 'Divergence Text Color', defval: color.white },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero Line Filter', color: '#54b859', lineWidth: 3 },
  { id: 'plot1', title: 'Momentum', color: '#54b859', lineWidth: 2 },
  { id: 'plot2', title: 'Zero (fill base)', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Bullish Divergence', color: '#54b859', lineWidth: 2 },
  { id: 'plot4', title: 'Bearish Divergence', color: '#e06161', lineWidth: 2 },
];

export const metadata = {
  title: 'SMA Squeeze Oscillator',
  shortTitle: 'SMA Squeeze Oscillator',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

type Point = { time: number; value: number; color?: string };
type Gradient = { topValue: number[]; bottomValue: number[]; topColor: Array<string | null>; bottomColor: Array<string | null> };

export function calculate(
  bars: Bar[],
  inputs: Partial<SmaSqueezeOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));

  // Calculations
  const sma1 = A(ta.sma(close, cfg.len1));
  const sma2 = A(ta.sma(close, cfg.len2));
  const sma3 = A(ta.sma(close, cfg.len3));
  const smaFilter = A(ta.sma(close, cfg.smaFilterLen));
  const atr = A(ta.atr(bars, cfg.atrLen));
  const isSqueeze: boolean[] = new Array(n);
  const rawMomentum: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const maxSma = Math.max(sma1[i], Math.max(sma2[i], sma3[i]));
    const minSma = Math.min(sma1[i], Math.min(sma2[i], sma3[i]));
    isSqueeze[i] = lt(maxSma - minSma, atr[i] * cfg.atrMult);
    rawMomentum[i] = (sma1[i] - sma2[i] + sma1[i] - sma3[i]) / 2;
  }
  const momentumSeries = ta.sma(S(rawMomentum), cfg.momentumSmoothing);
  const momentum = A(momentumSeries);
  const zero = S(new Array(n).fill(0));
  const crossUp = A(ta.crossover(momentumSeries, zero));
  const crossDown = A(ta.crossunder(momentumSeries, zero));

  // Colours
  const colBullStrong = String(color.new(cfg.bullColor, 0));
  const colBullFade = String(color.new(cfg.bullColor, 90));
  const colBearStrong = String(color.new(cfg.bearColor, 0));
  const colBearFade = String(color.new(cfg.bearColor, 90));
  const sqStrong = String(color.new(cfg.squeezeColor, 0));
  const sqFade = String(color.new(cfg.squeezeColor, 90));
  const sqFill = String(color.new(cfg.squeezeColor, 85));
  const bullLabel = String(color.new(cfg.bullColor, 10));
  const bearLabel = String(color.new(cfg.bearColor, 10));

  // Divergence
  const lb = cfg.pivotLength;
  const rangeUpper = 60;
  const rangeLower = 1;
  const pivotHighOsc = A(ta.pivothigh(momentumSeries, lb, lb));
  const pivotLowOsc = A(ta.pivotlow(momentumSeries, lb, lb));
  const oscLbr = (i: number) => (i - lb >= 0 ? momentum[i - lb] : NaN);
  const plFound: boolean[] = new Array(n);
  const phFound: boolean[] = new Array(n);
  const bullCond: boolean[] = new Array(n);
  const bearCond: boolean[] = new Array(n);
  {
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plOsc: number[] = [];
    const plLow: number[] = [];
    const phOsc: number[] = [];
    const phHigh: number[] = [];
    // ta.barssince(found): na until the first found bar
    let bsLow = NaN;
    let bsHigh = NaN;
    for (let i = 0; i < n; i++) {
      const o = oscLbr(i);
      const lowLbr = i - lb >= 0 ? bars[i - lb].low : NaN;
      const highLbr = i - lb >= 0 ? bars[i - lb].high : NaN;
      plFound[i] = !isNaN(pivotLowOsc[i]);
      phFound[i] = !isNaN(pivotHighOsc[i]);
      if (plFound[i]) {
        plOsc.push(o);
        plLow.push(lowLbr);
      }
      if (phFound[i]) {
        phOsc.push(o);
        phHigh.push(highLbr);
      }
      const prevOscLow = plOsc.length >= 2 ? plOsc[plOsc.length - 2] : NaN;
      const prevPriceLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
      const prevOscHigh = phOsc.length >= 2 ? phOsc[phOsc.length - 2] : NaN;
      const prevPriceHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
      // ta.barssince(...)[1]: the count of the previous bar
      const bsLowPrev = bsLow;
      const bsHighPrev = bsHigh;
      bsLow = plFound[i] ? 0 : isNaN(bsLow) ? NaN : bsLow + 1;
      bsHigh = phFound[i] ? 0 : isNaN(bsHigh) ? NaN : bsHigh + 1;
      const inRangeLow = bsLowPrev >= rangeLower && bsLowPrev <= rangeUpper;
      const inRangeHigh = bsHighPrev >= rangeLower && bsHighPrev <= rangeUpper;
      bullCond[i] = plFound[i] && lt(lowLbr, prevPriceLow) && gt(o, prevOscLow) && inRangeLow;
      bearCond[i] = phFound[i] && gt(highLbr, prevPriceHigh) && lt(o, prevOscHigh) && inRangeHigh;
    }
  }

  const interval = barInterval(bars);
  const plots: Record<string, Point[]> = { plot0: [], plot1: [], plot2: [], plot3: [], plot4: [] };
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const candles: PlotCandleData[] = [];
  const newGradient = (): Gradient => ({ topValue: new Array(n), bottomValue: new Array(n), topColor: new Array(n), bottomColor: new Array(n) });
  const gBull = newGradient();
  const gBear = newGradient();
  const gSqBull = newGradient();
  const gSqBear = newGradient();
  const squeezeFill: string[] = new Array(n);
  const flags: boolean[][] = alertConditions.map(() => []);
  const setGrad = (g: Gradient, i: number, on: boolean, top: number, bottom: number, topC: string, bottomC: string) => {
    g.topValue[i] = on ? top : NaN;
    g.bottomValue[i] = on ? bottom : NaN;
    g.topColor[i] = on ? topC : null;
    g.bottomColor[i] = on ? bottomC : null;
  };

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    const m = momentum[i];
    const sq = isSqueeze[i];
    const trendUp = !cfg.useSmaFilter || gt(b.close, smaFilter[i]);
    const trendDown = !cfg.useSmaFilter || lt(b.close, smaFilter[i]);

    // plot(0, 'Zero Line Filter', color = not useSmaFilter ? bullColor : close > smaFilter ? bullColor : bearColor)
    plots.plot0.push({ time: t, value: 0, color: trendUp ? cfg.bullColor : cfg.bearColor });
    plots.plot1.push({ time: t, value: m, color: ge(m, 0) ? cfg.bullColor : cfg.bearColor });
    plots.plot2.push({ time: t, value: 0 });

    // Fills between the momentum and zero
    const pos = gt(m, 0);
    const neg = lt(m, 0);
    setGrad(gBull, i, !sq && pos, m, 0, colBullStrong, colBullFade);
    setGrad(gBear, i, !sq && neg, 0, m, colBearFade, colBearStrong);
    squeezeFill[i] = sq ? sqFill : 'transparent';
    setGrad(gSqBull, i, sq && pos, m, 0, sqStrong, sqFade);
    setGrad(gSqBear, i, sq && neg, 0, m, sqFade, sqStrong);

    // Cross signals (diamonds at the momentum)
    const bullCross = !!crossUp[i] && trendUp && !isNaN(m);
    const bearCross = !!crossDown[i] && trendDown && !isNaN(m);
    if (bullCross) {
      markers.push({ id: 'shape0', time: t, position: 'atPriceMiddle', price: m, shape: 'diamond', color: cfg.bullCrossColor, size: 'small' });
    }
    if (bearCross) {
      markers.push({ id: 'shape1', time: t, position: 'atPriceMiddle', price: m, shape: 'diamond', color: cfg.bearCrossColor, size: 'small' });
    }
    // First bar after a squeeze (circles at the momentum)
    const nowOutOfSqueeze = !sq && i > 0 && isSqueeze[i - 1];
    const firstLong = nowOutOfSqueeze && pos && trendUp;
    const firstShort = nowOutOfSqueeze && neg && trendDown;
    if (firstLong) {
      markers.push({ id: 'shape2', time: t, position: 'atPriceMiddle', price: m, shape: 'circle', color: cfg.firstLongColor, size: 'small' });
    }
    if (firstShort) {
      markers.push({ id: 'shape3', time: t, position: 'atPriceMiddle', price: m, shape: 'circle', color: cfg.firstShortColor, size: 'small' });
    }
    // alertcondition(bullCross / bearCross / firstAfterSqueezeLong / firstAfterSqueezeShort /
    //   calculateDivergence and bullCond / calculateDivergence and bearCond)
    [bullCross, bearCross, firstLong, firstShort, cfg.calculateDivergence && bullCond[i], cfg.calculateDivergence && bearCond[i]]
      .forEach((f, k) => flags[k].push(f));

    // Wave candles: barcolor and plotcandle(force_overlay = true); colour na draws nothing
    const wave = sq ? sqStrong : pos ? colBullStrong : neg ? colBearStrong : null;
    const candleColor = cfg.enableCandleColor ? wave : null;
    if (candleColor) barColors.push({ time: t, color: candleColor });
    const cc = candleColor ?? 'transparent';
    candles.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close, color: cc, wickColor: cc,
      borderColor: cc, forceOverlay: true });

    // Divergences, offset = -lookbackRight: the value of bar i is drawn on bar i - lb
    if (i - lb >= 0) {
      const tp = barTime(bars, i - lb, interval);
      const o = oscLbr(i);
      plots.plot3.push({ time: tp, value: cfg.calculateDivergence && plFound[i] ? o : NaN,
        color: cfg.calculateDivergence && bullCond[i] ? cfg.bullColor : 'transparent' });
      plots.plot4.push({ time: tp, value: cfg.calculateDivergence && phFound[i] ? o : NaN,
        color: cfg.calculateDivergence && bearCond[i] ? cfg.bearColor : 'transparent' });
      if (cfg.calculateDivergence && bullCond[i] && !isNaN(o)) {
        markers.push({ id: 'shape4', time: tp, position: 'atPriceBottom', price: o, shape: 'labelUp', color: bullLabel, text: 'Bull',
          textColor: cfg.textColor, size: 'small' });
      }
      if (cfg.calculateDivergence && bearCond[i] && !isNaN(o)) {
        markers.push({ id: 'shape5', time: tp, position: 'atPriceTop', price: o, shape: 'labelDown', color: bearLabel, text: 'Bear',
          textColor: cfg.textColor, size: 'small' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      // fill(momPlot, p0, top_value / bottom_value = momentum / 0 when not squeeze and momentum > 0, bull strong -> fade)
      { plot1: 'plot1', plot2: 'plot2', gradient: gBull },
      // fill(momPlot, p0, top_value / bottom_value = 0 / momentum when not squeeze and momentum < 0, bear fade -> strong)
      { plot1: 'plot1', plot2: 'plot2', gradient: gBear },
      // fill(momPlot, p0, color = isSqueeze ? color.new(squeezeColor, 85) : na, title = 'Squeeze Fill')
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Squeeze Fill' }, colors: squeezeFill },
      // squeeze gradients (yellow), above / below zero
      { plot1: 'plot1', plot2: 'plot2', gradient: gSqBull },
      { plot1: 'plot1', plot2: 'plot2', gradient: gSqBear },
    ],
    markers,
    barColors,
    plotCandles: { waveCandles: candles },
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bull Cross Alert', message: 'Momentum crossed above zero' },
  { id: 'alert1', title: 'Bear Cross Alert', message: 'Momentum crossed below zero' },
  { id: 'alert2', title: '1st after Squeeze LONG Alert', message: 'First bullish momentum after squeeze' },
  { id: 'alert3', title: '1st after Squeeze SHORT Alert', message: 'First bearish momentum after squeeze' },
  { id: 'alert4', title: 'Bullish Divergence Alert', message: 'Bullish divergence detected on momentum' },
  { id: 'alert5', title: 'Bearish Divergence Alert', message: 'Bearish divergence detected on momentum' },
];

export const SmaSqueezeOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
