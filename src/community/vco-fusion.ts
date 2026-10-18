/**
 * VCO Fusion
 *
 * A channel around the SMA of the candle midpoint, with a half width of the average range * scale, widened by the
 * ratio of the average body to the average range. The oscillator is the close position in the channel (-50 at the
 * lower band, +50 at the upper band, clamped to -100..100). MA 1 = SMA(EMA(osc, smoothing 1), length 1) and
 * MA 2 = SMA(EMA(osc, smoothing 2), length 2); the histogram is MA 1 - MA 2. The trend (line and fill colour) turns
 * up / down on the crosses of MA 1 and MA 2. Diamonds mark histogram turns beyond the peak levels, triangles the
 * crosses of MA 1 with the oversold / overbought levels, circles the MA crosses with MA 1 inside a range, and pivot
 * divergences between MA 1 and the price give Bull Div / Bear Div labels. The overbought / oversold lines are more
 * opaque as MA 1 gets closer to them; gradient fills go from MA 1 to zero.
 * Alerts (alertcondition, `alerts` of the result): long / short (triangles), bull / bear cross in range (circles),
 * histogram peak up / down (diamonds) and bullish / bearish divergence (on the bar where the pivot is confirmed).
 *
 * Reference: "VCO Fusion" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { taCore, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export interface VcoFusionInputs {
  /** Volatility window */
  length: number;
  /** Band scaling (%) */
  scale: number;
  overbought: number;
  oversold: number;
  /** EMA smoothing of MA 1 */
  smoothLen1: number;
  /** SMA length of MA 1 */
  maLen1: number;
  /** EMA smoothing of MA 2 */
  smoothLen2: number;
  /** SMA length of MA 2 */
  maLen2: number;
  bullCircleUpper: number;
  bullCircleLower: number;
  bearCircleUpper: number;
  bearCircleLower: number;
  /** Histogram peak down level (diamonds) */
  histPeakUpper: number;
  /** Histogram peak up level (diamonds) */
  histPeakLower: number;
  showDivergence: boolean;
  /** Pivot lookback (left / right) */
  pivotLength: number;
  colBullMain: string;
  colBearMain: string;
  bullDivColor: string;
  bearDivColor: string;
  divTextColor: string;
  colOB: string;
  colOS: string;
  /** Draw the overbought / oversold lines with a dynamic transparency */
  useDynamicLevels: boolean;
  /** Transparency of a weak signal */
  minTransp: number;
  /** Transparency of a strong signal */
  maxTransp: number;
  /** Overbought / oversold line width (Pine input; the plot width is static) */
  levelLineWidth: number;
}

const BULL = 'rgb(6, 162, 47)';
const BEAR = 'rgb(207, 23, 23)';

export const defaultInputs: VcoFusionInputs = {
  length: 10,
  scale: 200,
  overbought: 25,
  oversold: -25,
  smoothLen1: 7,
  maLen1: 5,
  smoothLen2: 10,
  maLen2: 5,
  bullCircleUpper: 20,
  bullCircleLower: 1,
  bearCircleUpper: -1,
  bearCircleLower: -20,
  histPeakUpper: 3,
  histPeakLower: -3,
  showDivergence: true,
  pivotLength: 2,
  colBullMain: BULL,
  colBearMain: BEAR,
  bullDivColor: BULL,
  bearDivColor: BEAR,
  divTextColor: color.white,
  colOB: BEAR,
  colOS: BULL,
  useDynamicLevels: true,
  minTransp: 85,
  maxTransp: 10,
  levelLineWidth: 4,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Volatility Window', defval: 10, min: 1, group: 'Channel / Oscillator' },
  { id: 'scale', type: 'float', title: 'Band Scaling (%)', defval: 200, min: 100, step: 5, group: 'Channel / Oscillator' },
  { id: 'overbought', type: 'float', title: 'Overbought Level', defval: 25, step: 0.1, group: 'Channel / Oscillator' },
  { id: 'oversold', type: 'float', title: 'Oversold Level', defval: -25, step: 0.1, group: 'Channel / Oscillator' },
  { id: 'smoothLen1', type: 'int', title: 'Smoothing 1 (EMA)', defval: 7, min: 1, group: 'MA1 / MA2' },
  { id: 'maLen1', type: 'int', title: 'MA 1 Length (SMA)', defval: 5, min: 1, group: 'MA1 / MA2' },
  { id: 'smoothLen2', type: 'int', title: 'Smoothing 2 (EMA)', defval: 10, min: 1, group: 'MA1 / MA2' },
  { id: 'maLen2', type: 'int', title: 'MA 2 Length (SMA)', defval: 5, min: 1, group: 'MA1 / MA2' },
  { id: 'bullCircleUpper', type: 'float', title: 'Bull Signal – Upper Filter Level', defval: 20, step: 0.5, group: 'SIGNALS' },
  { id: 'bullCircleLower', type: 'float', title: 'Bull Signal – Lower Filter Level', defval: 1, step: 0.5, group: 'SIGNALS' },
  { id: 'bearCircleUpper', type: 'float', title: 'Bear Signal – Upper Filter Level', defval: -1, step: 0.5, group: 'SIGNALS' },
  { id: 'bearCircleLower', type: 'float', title: 'Bear Signal – Lower Filter Level', defval: -20, step: 0.5, group: 'SIGNALS' },
  { id: 'histPeakUpper', type: 'float', title: 'Histogram Peak Down Level (diamonds)', defval: 3, step: 0.5, group: 'SIGNALS' },
  { id: 'histPeakLower', type: 'float', title: 'Histogram Peak Up Level (diamonds)', defval: -3, step: 0.5, group: 'SIGNALS' },
  { id: 'showDivergence', type: 'bool', title: 'Show Divergences on MA1', defval: true, group: 'Divergences' },
  { id: 'pivotLength', type: 'int', title: 'Pivot Lookback (left/right)', defval: 2, min: 1, group: 'Divergences' },
  { id: 'colBullMain', type: 'color', title: 'Bull Color (MA lines / hist / gradient / labels)', defval: BULL, group: 'Colors' },
  { id: 'colBearMain', type: 'color', title: 'Bear Color (MA lines / hist / gradient / labels)', defval: BEAR, group: 'Colors' },
  { id: 'bullDivColor', type: 'color', title: 'Bullish Divergence', defval: BULL, group: 'Colors' },
  { id: 'bearDivColor', type: 'color', title: 'Bearish Divergence', defval: BEAR, group: 'Colors' },
  { id: 'divTextColor', type: 'color', title: 'Divergence Text', defval: color.white, group: 'Colors' },
  { id: 'colOB', type: 'color', title: 'Overbought Color', defval: BEAR, group: 'Colors' },
  { id: 'colOS', type: 'color', title: 'Oversold Color', defval: BULL, group: 'Colors' },
  { id: 'useDynamicLevels', type: 'bool', title: 'OB/OS Lines', defval: true, group: 'Colors' },
  { id: 'minTransp', type: 'int', title: 'Min. Transparency (weak signal)', defval: 85, min: 0, max: 100, group: 'Colors' },
  { id: 'maxTransp', type: 'int', title: 'Max. Transparency (strong signal)', defval: 10, min: 0, max: 100, group: 'Colors' },
  { id: 'levelLineWidth', type: 'int', title: 'OB/OS Line Thickness', defval: 4, min: 1, max: 6, group: 'Colors' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Overbought', color: BEAR, lineWidth: 4 },
  { id: 'plot1', title: 'Oversold', color: BULL, lineWidth: 4 },
  { id: 'plot2', title: 'MA 1', color: BULL, lineWidth: 2 },
  { id: 'plot3', title: 'MA 2', color: BULL, lineWidth: 2 },
  { id: 'plot4', title: 'MA 1 Fill Edge', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'MA 2 Fill Edge', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Zero Fill Edge', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'Histogram MA1-MA2', color: String(color.new(BULL, 60)), lineWidth: 1, style: 'area' },
  { id: 'plot8', title: 'Bull Div point', color: BULL, lineWidth: 2 },
  { id: 'plot9', title: 'Bear Div point', color: BEAR, lineWidth: 2 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero', color: color.gray, linestyle: 'dashed' },
];

export const metadata = {
  title: 'VCO Fusion',
  shortTitle: 'VCO Fusion',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b when b - a <= 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<VcoFusionInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const triangleOffset = 6.0;
  const circleOffset = 2.0;
  const ma1PeakTransp = 55;
  const masGradientTransp = 30;

  // Channel and oscillator
  const midSma = taCore.sma(bars.map((b) => (b.high + b.low) / 2), cfg.length);
  const avgRange = taCore.sma(bars.map((b) => b.high - b.low), cfg.length);
  const avgBody = taCore.sma(bars.map((b) => Math.abs(b.close - b.open)), cfg.length);
  const osc: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const off = ((avgRange[i] * cfg.scale) / 100) * (1 + avgBody[i] / Math.max(avgRange[i], 1e-10));
    const upperBand = midSma[i] + off;
    const lowerBand = midSma[i] - off;
    const bandWidth = Math.max(upperBand - lowerBand, 1e-10);
    const rawBaseOsc = (100 * (bars[i].close - lowerBand)) / bandWidth - 50;
    osc[i] = Math.max(Math.min(rawBaseOsc, 100), -100);
  }
  const ma1 = taCore.sma(taCore.ema(osc, cfg.smoothLen1), cfg.maLen1);
  const ma2 = taCore.sma(taCore.ema(osc, cfg.smoothLen2), cfg.maLen2);
  const hist = ma1.map((v, i) => v - ma2[i]);

  // ta.crossover / ta.crossunder compare exactly (no 1e-10; na compares false)
  const crossUp = (i: number) => i > 0 && ma1[i] > ma2[i] && ma1[i - 1] <= ma2[i - 1];
  const crossDown = (i: number) => i > 0 && ma1[i] < ma2[i] && ma1[i - 1] >= ma2[i - 1];
  const crossoverLevel = (i: number, lvl: number) => i > 0 && ma1[i] > lvl && ma1[i - 1] <= lvl;
  const crossunderLevel = (i: number, lvl: number) => i > 0 && ma1[i] < lvl && ma1[i - 1] >= lvl;

  // Divergences: pivots of MA 1 and ta.valuewhen(found, x, 1) (x on the found bar before the latest one)
  const lb = cfg.pivotLength;
  const pivotHigh = taCore.pivothigh(ma1, lb, lb);
  const pivotLow = taCore.pivotlow(ma1, lb, lb);
  const ma1AtPivot = (i: number) => (i - lb >= 0 ? ma1[i - lb] : NaN);
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  if (cfg.showDivergence) {
    const plOsc: number[] = [];
    const plLow: number[] = [];
    const phOsc: number[] = [];
    const phHigh: number[] = [];
    for (let i = 0; i < n; i++) {
      const o = ma1AtPivot(i);
      const lowLb = i - lb >= 0 ? bars[i - lb].low : NaN;
      const highLb = i - lb >= 0 ? bars[i - lb].high : NaN;
      plFound[i] = !isNaN(pivotLow[i]);
      if (plFound[i]) {
        plOsc.push(o);
        plLow.push(lowLb);
      }
      const vwPlOsc = plOsc.length >= 2 ? plOsc[plOsc.length - 2] : NaN;
      const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
      bullCond[i] = lt(lowLb, vwPlLow) && gt(o, vwPlOsc) && plFound[i];

      phFound[i] = !isNaN(pivotHigh[i]);
      if (phFound[i]) {
        phOsc.push(o);
        phHigh.push(highLb);
      }
      const vwPhOsc = phOsc.length >= 2 ? phOsc[phOsc.length - 2] : NaN;
      const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
      bearCond[i] = gt(highLb, vwPhHigh) && lt(o, vwPhOsc) && phFound[i];
    }
  }

  // Dynamic overbought / oversold colours
  const remap = (val: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
    outMin + ((val - inMin) * (outMax - outMin)) / (inMax - inMin);
  // Pine math.round: half away from zero
  const pineRound = (x: number) => Math.sign(x) * Math.round(Math.abs(x));
  const obColor = (i: number) => {
    if (!cfg.useDynamicLevels) return cfg.colOB;
    const rawDist = cfg.overbought - ma1[i];
    const clamped = Math.max(0, Math.min(rawDist, cfg.overbought));
    return String(color.new(cfg.colOB, pineRound(remap(clamped, 0, cfg.overbought, cfg.maxTransp, cfg.minTransp))));
  };
  const osColor = (i: number) => {
    if (!cfg.useDynamicLevels) return cfg.colOS;
    const rawDist = ma1[i] - cfg.oversold;
    const clamped = Math.max(0, Math.min(rawDist, -cfg.oversold));
    return String(color.new(cfg.colOS, pineRound(remap(clamped, 0, -cfg.oversold, cfg.maxTransp, cfg.minTransp))));
  };

  const cBullPeak = String(color.new(cfg.colBullMain, ma1PeakTransp));
  const cBearPeak = String(color.new(cfg.colBearMain, ma1PeakTransp));
  const cBullZero = String(color.new(cfg.colBullMain, 100));
  const cBearZero = String(color.new(cfg.colBearMain, 100));
  const histBull = String(color.new(cfg.colBullMain, 60));
  const histBear = String(color.new(cfg.colBearMain, 60));
  const noDiv = String(color.new(color.white, 100));
  const bullLabel = String(color.new(cfg.bullDivColor, 40));
  const bearLabel = String(color.new(cfg.bearDivColor, 40));
  const interval = barInterval(bars);
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

  const plots: Record<string, Point[]> = {};
  for (let k = 0; k < 10; k++) plots[`plot${k}`] = [];
  const markers: MarkerData[] = [];
  const trendColors: string[] = new Array(n);
  const gradTop: { topValue: number[]; bottomValue: number[]; topColor: Array<string | null>; bottomColor: Array<string | null> } =
    { topValue: new Array(n), bottomValue: new Array(n), topColor: new Array(n), bottomColor: new Array(n) };
  const gradBottom: typeof gradTop =
    { topValue: new Array(n), bottomValue: new Array(n), topColor: new Array(n), bottomColor: new Array(n) };

  let trendUp = true; // var bool trendUp = true
  /** One flag per bar for each alertcondition, in the original's order */
  const flags: boolean[][] = Array.from({ length: 8 }, () => new Array(n).fill(false));
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const up = crossUp(i);
    const down = crossDown(i);
    if (up) trendUp = true;
    if (down) trendUp = false;
    const trendColor = trendUp ? cfg.colBullMain : cfg.colBearMain;
    trendColors[i] = String(color.new(trendColor, masGradientTransp));

    plots.plot0.push({ time: t, value: cfg.useDynamicLevels ? cfg.overbought : NaN, color: obColor(i) });
    plots.plot1.push({ time: t, value: cfg.useDynamicLevels ? cfg.oversold : NaN, color: osColor(i) });
    plots.plot2.push({ time: t, value: fin(ma1[i]), color: trendColor });
    plots.plot3.push({ time: t, value: fin(ma2[i]), color: trendColor });
    plots.plot4.push({ time: t, value: fin(ma1[i]) });
    plots.plot5.push({ time: t, value: fin(ma2[i]) });
    plots.plot6.push({ time: t, value: 0 });
    plots.plot7.push({ time: t, value: fin(hist[i]), color: ge(hist[i], 0) ? histBull : histBear });

    // Gradient MA 1 -> zero (above zero: bull colours, below zero: bear colours)
    const pos = gt(ma1[i], 0);
    const neg = lt(ma1[i], 0);
    gradTop.topValue[i] = pos ? ma1[i] : NaN;
    gradTop.bottomValue[i] = pos ? 0 : NaN;
    gradTop.topColor[i] = pos ? cBullPeak : null;
    gradTop.bottomColor[i] = pos ? cBullZero : null;
    gradBottom.topValue[i] = neg ? 0 : NaN;
    gradBottom.bottomValue[i] = neg ? ma1[i] : NaN;
    gradBottom.topColor[i] = neg ? cBearZero : null;
    gradBottom.bottomColor[i] = neg ? cBearPeak : null;

    // Diamonds: histogram turns beyond the peak levels
    const h = hist[i];
    const h1 = i >= 1 ? hist[i - 1] : NaN;
    const h2 = i >= 2 ? hist[i - 2] : NaN;
    const histTurnDown = lt(h, h1) && gt(h1, h2) && gt(h1, cfg.histPeakUpper);
    const histTurnUp = gt(h, h1) && lt(h1, h2) && lt(h1, cfg.histPeakLower);
    if (histTurnDown && !isNaN(h)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: h, shape: 'diamond', color: cfg.colBearMain, size: 'tiny', id: 'shape0' });
    }
    if (histTurnUp && !isNaN(h)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: h, shape: 'diamond', color: cfg.colBullMain, size: 'tiny', id: 'shape1' });
    }
    // Triangles: MA 1 crosses the oversold / overbought levels
    const longSignal = crossoverLevel(i, cfg.oversold);
    const shortSignal = crossunderLevel(i, cfg.overbought);
    if (longSignal) {
      markers.push({ time: t, position: 'atPriceMiddle', price: cfg.oversold - triangleOffset, shape: 'triangleUp',
        color: cfg.colBullMain, size: 'tiny', id: 'shape2' });
    }
    if (shortSignal) {
      markers.push({ time: t, position: 'atPriceMiddle', price: cfg.overbought + triangleOffset, shape: 'triangleDown',
        color: cfg.colBearMain, size: 'tiny', id: 'shape3' });
    }
    // Circles: MA crosses with MA 1 inside the filter range
    const bullCrossSignal = up && ge(ma1[i], cfg.bullCircleLower) && le(ma1[i], cfg.bullCircleUpper);
    const bearCrossSignal = down && ge(ma1[i], cfg.bearCircleLower) && le(ma1[i], cfg.bearCircleUpper);
    if (bullCrossSignal) {
      markers.push({ time: t, position: 'atPriceMiddle', price: cfg.oversold - circleOffset, shape: 'circle',
        color: cfg.colBullMain, size: 'tiny', id: 'shape4' });
    }
    if (bearCrossSignal) {
      markers.push({ time: t, position: 'atPriceMiddle', price: cfg.overbought + circleOffset, shape: 'circle',
        color: cfg.colBearMain, size: 'tiny', id: 'shape5' });
    }
    flags[0][i] = longSignal;
    flags[1][i] = shortSignal;
    flags[2][i] = bullCrossSignal;
    flags[3][i] = bearCrossSignal;
    flags[4][i] = histTurnUp;
    flags[5][i] = histTurnDown;
    flags[6][i] = cfg.showDivergence && bullCond[i];
    flags[7][i] = cfg.showDivergence && bearCond[i];

    // Divergences, offset = -lookbackRight: the value of bar i is drawn on bar i - lb
    if (i - lb >= 0) {
      const tp = barTime(bars, i - lb, interval);
      const o = ma1AtPivot(i);
      plots.plot8.push({ time: tp, value: cfg.showDivergence && plFound[i] ? fin(o) : NaN,
        color: bullCond[i] ? cfg.bullDivColor : noDiv });
      plots.plot9.push({ time: tp, value: cfg.showDivergence && phFound[i] ? fin(o) : NaN,
        color: bearCond[i] ? cfg.bearDivColor : noDiv });
      if (cfg.showDivergence && bullCond[i] && !isNaN(o)) {
        markers.push({ time: tp, position: 'atPriceBottom', price: o, shape: 'labelUp', color: bullLabel,
          text: 'Bull Div', textColor: cfg.divTextColor, size: 'tiny', id: 'shape6' });
      }
      if (cfg.showDivergence && bearCond[i] && !isNaN(o)) {
        markers.push({ time: tp, position: 'atPriceTop', price: o, shape: 'labelDown', color: bearLabel,
          text: 'Bear Div', textColor: cfg.divTextColor, size: 'tiny', id: 'shape7' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [{ value: 0, options: { title: 'Zero', color: color.gray, linestyle: 'dashed' } }],
    fills: [
      // fill(pMA1, pZero, top_value = ma1 > 0 ? ma1 : na, bottom_value = ma1 > 0 ? 0 : na, c_bull_peak -> c_bull_zero)
      { plot1: 'plot4', plot2: 'plot6', gradient: gradTop },
      // fill(pZero, pMA1, top_value = ma1 < 0 ? 0 : na, bottom_value = ma1 < 0 ? ma1 : na, c_bear_zero -> c_bear_peak)
      { plot1: 'plot6', plot2: 'plot4', gradient: gradBottom },
      // fill(pMA1, pMA2, color.new(trendUp ? colBullMain : colBearMain, 30))
      { plot1: 'plot4', plot2: 'plot5', colors: trendColors },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long Signal', message: 'VCO Long Signal – MA1 crossed above Oversold' },
  { id: 'alert1', title: 'Short Signal', message: 'VCO Short Signal – MA1 crossed below Overbought' },
  { id: 'alert2', title: 'Bull Cross (Range Filter)', message: 'VCO Bull Cross – MA1 crossed above MA2 in bull range' },
  { id: 'alert3', title: 'Bear Cross (Range Filter)', message: 'VCO Bear Cross – MA1 crossed below MA2 in bear range' },
  { id: 'alert4', title: 'Histogram Peak Up', message: 'VCO Histogram turned UP (bullish wave turn)' },
  { id: 'alert5', title: 'Histogram Peak Down', message: 'VCO Histogram turned DOWN (bearish wave turn)' },
  { id: 'alert6', title: 'Bullish Divergence', message: 'VCO Bullish Divergence detected on MA1' },
  { id: 'alert7', title: 'Bearish Divergence', message: 'VCO Bearish Divergence detected on MA1' },
];

export const VcoFusion = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
