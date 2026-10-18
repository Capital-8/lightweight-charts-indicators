/**
 * CCI Pro (Hash Capital Research)
 *
 * A smoothed CCI: rawCCI = (src - sma(src, length)) / (0.015 * dev(src, length)), cci = ema(ema(rawCCI, smoothing), 2).
 * The line colour follows the CCI: green for a positive CCI, red for a negative one, brighter and more opaque as
 * |cci| / 150 grows (scaled by the colour intensity). A wide glow line (green / red, more opaque past +-100) and
 * a fill to zero draw the CCI as an area; fills past +100 / -100 shade the extreme zones. With the divergence
 * option, regular bullish (CCI higher low, price lower low) and bearish (CCI lower high, price higher high)
 * divergences between 5 / 5 pivots are drawn on the pivot bar with Bull / Bear labels.
 * Alerts (alertcondition, `alerts` of the result): 'Strong Buy' / 'Strong Sell' (CCI beyond 0.8 x the extreme level,
 * 1.3 x the adaptive level 100 + 0.3 x stdev(cci, 30), as the momentum crosses zero), 'Buy Signal' / 'Sell Signal'
 * (CCI beyond the adaptive level x sensitivity / 10 with momentum and velocity turning back) and the two divergences.
 *
 * Reference: "CCI [Hash Adaptive]" by Hash_Capital
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, math, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CciHashCapitalInputs {
  /** CCI period */
  length: number;
  src: SourceType;
  /** EMA length of the first smoothing */
  smoothing: number;
  /** Calculate the divergences (Bull / Bear lines and labels) */
  calculateDivergence: boolean;
  /** Colour intensity (1-10) */
  colorIntensity: number;
  showGlowEffect: boolean;
  /** Glow intensity (1-10) */
  glowIntensity: number;
  /** Signal sensitivity (1-10): the Buy / Sell Signal alerts */
  signalSensitivity: number;
}

export const defaultInputs: CciHashCapitalInputs = {
  length: 20,
  src: 'hlc3',
  smoothing: 5,
  calculateDivergence: false,
  colorIntensity: 7.0,
  showGlowEffect: true,
  glowIntensity: 5.0,
  signalSensitivity: 6.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'CCI Period', defval: 20, min: 1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'hlc3' },
  { id: 'smoothing', type: 'int', title: 'Smoothing', defval: 5, min: 1, max: 10 },
  { id: 'calculateDivergence', type: 'bool', title: 'Calculate Divergence', defval: false },
  { id: 'colorIntensity', type: 'float', title: 'Color Intensity', defval: 7.0, min: 1.0, max: 10.0, step: 1.0 },
  { id: 'showGlowEffect', type: 'bool', title: 'Glow Effect', defval: true },
  { id: 'glowIntensity', type: 'float', title: 'Glow Intensity', defval: 5.0, min: 1.0, max: 10.0, step: 1.0 },
  { id: 'signalSensitivity', type: 'float', title: 'Signal Sensitivity', defval: 6.0, min: 1.0, max: 10, step: 1.0 },
];

const WHITE_100 = String(color.new(color.white, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'CCI Main Line', color: '#00FF00', lineWidth: 2 },
  { id: 'plot1', title: 'CCI Glow Effect', color: '#00FF00', lineWidth: 5 },
  { id: 'plot2', title: 'Zero Reference', color: WHITE_100 },
  { id: 'plot3', title: 'Upper Extreme Area', color: WHITE_100, display: 'none' },
  { id: 'plot4', title: 'Lower Extreme Area', color: WHITE_100, display: 'none' },
  { id: 'plot5', title: 'Regular Bullish', color: '#00FF00', lineWidth: 2, display: 'pane' },
  { id: 'plot6', title: 'Regular Bearish', color: '#FF0000', lineWidth: 2, display: 'pane' },
];

export const metadata = {
  title: 'CCI Pro [Hash Capital Research]',
  shortTitle: 'CCI Pro',
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
  inputs: Partial<CciHashCapitalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // Smoothed CCI
  const src = getSourceSeries(bars, cfg.src);
  const srcArr = A(src);
  const ma = A(ta.sma(src, cfg.length));
  const deviation = A(ta.dev(src, cfg.length));
  // A plain division: x / 0 is +-infinity (ta.ema skips it as na), 0 / 0 is na
  const rawCci = srcArr.map((s, i) => (s - ma[i]) / (0.015 * deviation[i]));
  const cci1 = A(ta.ema(S(rawCci), cfg.smoothing));
  const cci = A(ta.ema(S(cci1), 2));

  // getAdaptiveColor(): green spectrum for a positive CCI, red spectrum for a negative one
  const colorScale = cfg.colorIntensity / 10.0;
  const adaptiveColor = (c: number): string => {
    const normalizedCci = Math.max(-1.0, Math.min(1.0, c / 150));
    if (ge(normalizedCci, 0)) {
      const intensity = math.pow(normalizedCci, 0.5) * colorScale;
      const redVal = math.round(100 * (1 - intensity));
      const blueVal = math.round(100 * (1 - intensity * 0.7));
      const alpha = Math.max(0, math.round(30 * (1 - intensity)));
      return String(color.rgb(redVal, 255, blueVal, alpha));
    }
    const intensity = math.pow(Math.abs(normalizedCci), 0.5) * colorScale;
    const greenVal = math.round(100 * (1 - intensity));
    const blueVal = math.round(100 * (1 - intensity * 0.7));
    const alpha = Math.max(0, math.round(30 * (1 - intensity)));
    return String(color.rgb(255, greenVal, blueVal, alpha));
  };
  // getGlowColor(): brighter past +-100; na when the glow is off
  const glowScale = cfg.glowIntensity / 10.0;
  const glowColor = (c: number): string => {
    if (!cfg.showGlowEffect) return 'transparent';
    const baseIntensity = Math.abs(c) / 120;
    const isExtreme = gt(c, 100) || lt(c, -100);
    const intensityBoost = isExtreme ? 1.5 : 1.0;
    const glowAlpha = math.round(100 - baseIntensity * 60 * glowScale * intensityBoost);
    return String(color.new(ge(c, 0) ? '#00FF00' : '#FF0000', Math.max(30, glowAlpha)));
  };

  // Divergences (5 / 5 pivots of the CCI; the previous pivot 5 to 60 bars back)
  const lookbackRight = 5;
  const lookbackLeft = 5;
  const rangeUpper = 60;
  const rangeLower = 5;
  const cciLbr = cci.map((_v, i) => (i >= lookbackRight ? cci[i - lookbackRight] : NaN));
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  if (cfg.calculateDivergence) {
    const lowLbr = bars.map((_b, i) => (i >= lookbackRight ? bars[i - lookbackRight].low : NaN));
    const highLbr = bars.map((_b, i) => (i >= lookbackRight ? bars[i - lookbackRight].high : NaN));
    const pl = A(ta.pivotlow(S(cci), lookbackLeft, lookbackRight));
    const ph = A(ta.pivothigh(S(cci), lookbackLeft, lookbackRight));
    for (let i = 0; i < n; i++) {
      plFound[i] = !isNaN(pl[i]);
      phFound[i] = !isNaN(ph[i]);
    }
    const B = (a: boolean[]) => S(a.map((x) => (x ? 1 : 0)));
    // _inRange(found[1]): rangeLower <= ta.barssince(found[1]) <= rangeUpper
    const barsBull = A(ta.barssince(B(plFound.map((_x, i) => i > 0 && plFound[i - 1]))));
    const barsBear = A(ta.barssince(B(phFound.map((_x, i) => i > 0 && phFound[i - 1]))));
    const vwBullCci = A(ta.valuewhen(B(plFound), S(cciLbr), 1));
    const vwBullLow = A(ta.valuewhen(B(plFound), S(lowLbr), 1));
    const vwBearCci = A(ta.valuewhen(B(phFound), S(cciLbr), 1));
    const vwBearHigh = A(ta.valuewhen(B(phFound), S(highLbr), 1));
    for (let i = 0; i < n; i++) {
      const inRangeBull = rangeLower <= barsBull[i] && barsBull[i] <= rangeUpper;
      const cciHl = gt(cciLbr[i], vwBullCci[i]) && inRangeBull;
      const priceLl = lt(lowLbr[i], vwBullLow[i]);
      bullCond[i] = priceLl && cciHl && plFound[i];
      const inRangeBear = rangeLower <= barsBear[i] && barsBear[i] <= rangeUpper;
      const cciLh = lt(cciLbr[i], vwBearCci[i]) && inRangeBear;
      const priceHh = gt(highLbr[i], vwBearHigh[i]);
      bearCond[i] = priceHh && cciLh && phFound[i];
    }
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const t = (i: number) => bars[i].time;
  const interval = barInterval(bars);
  const adaptive = cci.map(adaptiveColor);
  const bullColor = String(color.new('#00FF00', 0));
  const bearColor = String(color.new('#FF0000', 0));

  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const plot5: Point[] = [];
  const plot6: Point[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const c = fin(cci[i]);
    plot0.push({ time: t(i), value: c, color: adaptive[i] });
    plot1.push({ time: t(i), value: c, color: glowColor(cci[i]) });
    plot2.push({ time: t(i), value: 0 });
    // plot(cci > 100 ? cci : 100) / plot(cci < -100 ? cci : -100), display = display.none
    plot3.push({ time: t(i), value: gt(cci[i], 100) ? c : 100 });
    plot4.push({ time: t(i), value: lt(cci[i], -100) ? c : -100 });
    // offset = -lookbackRight: the value of bar i is drawn on bar i - 5
    if (i >= lookbackRight) {
      const at = barTime(bars, i - lookbackRight, interval);
      const v = fin(cciLbr[i]);
      plot5.push({ time: at, value: plFound[i] ? v : NaN, color: bullCond[i] ? bullColor : WHITE_100 });
      plot6.push({ time: at, value: phFound[i] ? v : NaN, color: bearCond[i] ? bearColor : WHITE_100 });
      if (bullCond[i] && !isNaN(v)) {
        markers.push({ time: at, position: 'atPriceBottom', price: v, shape: 'labelUp', color: bullColor,
          text: ' Bull ', textColor: color.black });
      }
      if (bearCond[i] && !isNaN(v)) {
        markers.push({ time: at, position: 'atPriceTop', price: v, shape: 'labelDown', color: bearColor,
          text: ' Bear ', textColor: color.white });
      }
    }
  }

  const fills = [
    // fill(cciMainLine, zeroLinePlot, color.new(getAdaptiveColor(), 85))
    { plot1: 'plot0', plot2: 'plot2', options: { title: 'CCI Area Fill' },
      colors: adaptive.map((c) => String(color.new(c, 85))) },
    { plot1: 'plot0', plot2: 'plot3', options: { title: 'Overbought Extreme Zone' },
      colors: cci.map((c) => (gt(c, 100) ? String(color.new('#00FF00', 90)) : 'transparent')) },
    { plot1: 'plot0', plot2: 'plot4', options: { title: 'Oversold Extreme Zone' },
      colors: cci.map((c) => (lt(c, -100) ? String(color.new('#FF0000', 90)) : 'transparent')) },
  ];

  // Signals: momentum = ta.change(cci), velocity = ta.change(momentum), adaptive levels 100 + 0.3 x ta.stdev(cci, 30)
  const momentum = cci.map((c, i) => (i > 0 ? c - cci[i - 1] : NaN));
  const velocity = momentum.map((m, i) => (i > 0 ? m - momentum[i - 1] : NaN));
  const volatility = A(ta.stdev(S(cci), 30));
  const momentumCrossUp = crossedOver(momentum, 0);
  const momentumCrossDown = crossedUnder(momentum, 0);
  const signalMultiplier = cfg.signalSensitivity / 10.0;
  const flags: boolean[][] = [[], [], [], [], [], []];
  for (let i = 0; i < n; i++) {
    const upperLevel = 100 + volatility[i] * 0.3;
    const lowerLevel = -100 - volatility[i] * 0.3;
    const extremeUpper = upperLevel * 1.3;
    const extremeLower = lowerLevel * 1.3;
    // extremeOversoldReversal, extremeOverboughtReversal, oversoldReversal, overboughtReversal, bullCond, bearCond
    flags[0].push(lt(cci[i], extremeLower * 0.8) && momentumCrossUp[i]);
    flags[1].push(gt(cci[i], extremeUpper * 0.8) && momentumCrossDown[i]);
    flags[2].push(lt(cci[i], lowerLevel * signalMultiplier) && gt(momentum[i], 0) && gt(velocity[i], 0));
    flags[3].push(gt(cci[i], upperLevel * signalMultiplier) && lt(momentum[i], 0) && lt(velocity[i], 0));
    flags[4].push(bullCond[i]);
    flags[5].push(bearCond[i]);
  }

  const lineColor = String(color.new(color.white, 50));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5, plot6 },
    hlines: [
      { value: 0, options: { title: 'Zero', color: lineColor, linestyle: 'solid', linewidth: 1 } },
      { value: 100, options: { title: 'Extreme Overbought', color: lineColor, linestyle: 'dotted', linewidth: 2 } },
      { value: -100, options: { title: 'Extreme Oversold', color: lineColor, linestyle: 'dotted', linewidth: 2 } },
    ],
    fills,
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Strong Buy', message: 'Extreme oversold reversal signal' },
  { id: 'alert1', title: 'Strong Sell', message: 'Extreme overbought reversal signal' },
  { id: 'alert2', title: 'Buy Signal', message: 'Oversold reversal detected' },
  { id: 'alert3', title: 'Sell Signal', message: 'Overbought reversal detected' },
  { id: 'alert4', title: 'Bullish Divergence', message: 'Bullish Divergence detected on CCI - Potential reversal UP' },
  { id: 'alert5', title: 'Bearish Divergence', message: 'Bearish Divergence detected on CCI - Potential reversal DOWN' },
];

export const CciHashCapital = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
