/**
 * Uptrick: Trend Analysis
 *
 * MACD (EMA(fast) - EMA(slow)) with an EMA signal line; the MACD line is cyan above the signal and purple below, with
 * a wide circle "shadow" plot. Regular divergences: a MACD pivot low (5 / 5 bars) with a higher MACD value but a
 * lower price low than the previous pivot low, 5 to 60 bars after it, is bullish; the mirror case with pivot highs is
 * bearish. Pivots are drawn 5 bars back with Bull / Bear labels in the pane and on the price bars. Bars are coloured
 * by the most recent divergence, fading out over 1000 bars. Levels at -1, 1 and 0.
 * Alerts (alertcondition, `alerts` of the result): 'Regular Bullish Divergence' / 'Regular Bearish Divergence' on the
 * bar where the divergence is found (5 bars after its pivot).
 *
 * Reference: "Uptrick: Trend Analysis" by Uptrick
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uptrick
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export interface UptrickTrendAnalysisInputs {
  /** Fast EMA period of the MACD */
  fastInput: number;
  /** Slow EMA period of the MACD */
  slowInput: number;
  /** EMA period of the signal line */
  signalInput: number;
  /** Not used by the Pine script */
  emaPeriod: number;
  /** Not used by the Pine script (MACD slope, not plotted) */
  slopeLookback: number;
  /** Line width of the MACD and signal lines (the plot widths stay at the default 2 / 4) */
  lineWidth: number;
  /** Transparency of the MACD shadow colours */
  shadowTransparency: number;
  /** Detect the regular divergences */
  calculateDivergence: boolean;
}

export const defaultInputs: UptrickTrendAnalysisInputs = {
  fastInput: 12,
  slowInput: 26,
  signalInput: 9,
  emaPeriod: 20,
  slopeLookback: 5,
  lineWidth: 2,
  shadowTransparency: 80,
  calculateDivergence: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastInput', type: 'int', title: 'Fast EMA Period', defval: 12, min: 1 },
  { id: 'slowInput', type: 'int', title: 'Slow EMA Period', defval: 26, min: 1 },
  { id: 'signalInput', type: 'int', title: 'Signal Line Period', defval: 9, min: 1 },
  { id: 'emaPeriod', type: 'int', title: 'EMA Period for Trend', defval: 20, min: 1 },
  { id: 'slopeLookback', type: 'int', title: 'Slope Lookback Period', defval: 5, min: 1 },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 2, min: 1, max: 5 },
  { id: 'shadowTransparency', type: 'int', title: 'Shadow Transparency (%)', defval: 80, min: 0, max: 100 },
  { id: 'calculateDivergence', type: 'bool', title: 'Calculate Divergence', defval: true },
];

const BULLISH = '#5cf3da';
const BEARISH = '#b72cc7';
const SHADOW_BULL = color.rgb(90, 242, 217);
const SHADOW_BEAR = color.rgb(188, 44, 203);

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Regular Bullish', color: BULLISH, lineWidth: 2 },
  { id: 'plot1', title: 'Regular Bearish', color: BEARISH, lineWidth: 2 },
  { id: 'plot2', title: 'MACD Line', color: BULLISH, lineWidth: 2 },
  { id: 'plot3', title: 'Signal Line', color: color.orange, lineWidth: 2 },
  { id: 'plot4', title: 'MACD Shadows', color: String(color.new(SHADOW_BULL, 80)), lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: 'Uptrick: Trend Analysis',
  shortTitle: 'Uptrick: Trend Analysis',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<UptrickTrendAnalysisInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const lookbackRight = 5;
  const lookbackLeft = 5;
  const rangeUpper = 60;
  const rangeLower = 5;
  const fadeSteps = 1000;

  const close = S(bars.map((b) => b.close));
  const fastMA = A(ta.ema(close, cfg.fastInput));
  const slowMA = A(ta.ema(close, cfg.slowInput));
  const macd = fastMA.map((v, i) => v - slowMA[i]);
  const signal = A(ta.ema(S(macd), cfg.signalInput));

  // Divergences (the `if calculateDivergence` block runs on every bar or on none)
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const macdLbr = (i: number) => (i - lookbackRight >= 0 ? macd[i - lookbackRight] : NaN);
  if (cfg.calculateDivergence) {
    const pivotLow = A(ta.pivotlow(S(macd), lookbackLeft, lookbackRight));
    const pivotHigh = A(ta.pivothigh(S(macd), lookbackLeft, lookbackRight));
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plMacd: number[] = [];
    const plLow: number[] = [];
    const phMacd: number[] = [];
    const phHigh: number[] = [];
    // Pine `and` is lazy: the ta.barssince inside _inRange(...) only runs on the bars where the left side
    // (macdLBR > ta.valuewhen(...)) is true, so it counts those calls. One state per call site.
    let plCalls = NaN;
    let phCalls = NaN;
    for (let i = 0; i < n; i++) {
      const m = macdLbr(i);
      const lowLbr = i - lookbackRight >= 0 ? bars[i - lookbackRight].low : NaN;
      const highLbr = i - lookbackRight >= 0 ? bars[i - lookbackRight].high : NaN;

      // Regular bullish
      plFound[i] = !isNaN(pivotLow[i]);
      if (plFound[i]) {
        plMacd.push(m);
        plLow.push(lowLbr);
      }
      const vwPlMacd = plMacd.length >= 2 ? plMacd[plMacd.length - 2] : NaN;
      const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
      let macdHL = false;
      if (gt(m, vwPlMacd)) {
        // _inRange(plFound[1]): ta.barssince(plFound[1])
        if (i > 0 && plFound[i - 1]) plCalls = 0;
        else if (!isNaN(plCalls)) plCalls++;
        macdHL = rangeLower <= plCalls && plCalls <= rangeUpper;
      }
      const priceLL = lt(lowLbr, vwPlLow);
      bullCond[i] = priceLL && macdHL && plFound[i];

      // Regular bearish
      phFound[i] = !isNaN(pivotHigh[i]);
      if (phFound[i]) {
        phMacd.push(m);
        phHigh.push(highLbr);
      }
      const vwPhMacd = phMacd.length >= 2 ? phMacd[phMacd.length - 2] : NaN;
      const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
      let macdLH = false;
      if (lt(m, vwPhMacd)) {
        if (i > 0 && phFound[i - 1]) phCalls = 0;
        else if (!isNaN(phCalls)) phCalls++;
        macdLH = rangeLower <= phCalls && phCalls <= rangeUpper;
      }
      const priceHH = gt(highLbr, vwPhHigh);
      bearCond[i] = priceHH && macdLH && phFound[i];
    }
  }

  const interval = barInterval(bars);
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const shadowBull = String(color.new(SHADOW_BULL, cfg.shadowTransparency));
  const shadowBear = String(color.new(SHADOW_BEAR, cfg.shadowTransparency));
  // ta.barssince(bullCond) / ta.barssince(bearCond), on every bar
  let sinceBull = NaN;
  let sinceBear = NaN;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const m = macdLbr(i);
    if (i - lookbackRight >= 0) {
      // plot(plFound ? macdLBR : na, offset = -lookbackRight, color = bullCond ? bullish_color : na)
      const tb = barTime(bars, i - lookbackRight, interval);
      plot0.push({ time: tb, value: plFound[i] ? m : NaN, color: bullCond[i] ? BULLISH : 'transparent' });
      plot1.push({ time: tb, value: phFound[i] ? m : NaN, color: bearCond[i] ? BEARISH : 'transparent' });
      if (!isNaN(m)) {
        // plotshape(bullCond ? macdLBR : na, offset = -lookbackRight, text = ' Bull ', shape.labelup, ...)
        if (bullCond[i]) {
          markers.push({ time: tb, position: 'atPriceBottom', price: m, shape: 'labelUp', color: BULLISH, text: ' Bull ', textColor: color.white });
          markers.push({ time: tb, position: 'belowBar', shape: 'labelUp', color: BULLISH, text: ' Bull ', textColor: color.white, forceOverlay: true });
        }
        if (bearCond[i]) {
          markers.push({ time: tb, position: 'atPriceTop', price: m, shape: 'labelDown', color: BEARISH, text: ' Bear ', textColor: color.white });
          markers.push({ time: tb, position: 'aboveBar', shape: 'labelDown', color: BEARISH, text: ' Bear ', textColor: color.white, forceOverlay: true });
        }
      }
    }

    const up = gt(macd[i], signal[i]);
    plot2.push({ time: t, value: macd[i], color: up ? BULLISH : BEARISH });
    plot3.push({ time: t, value: signal[i], color: color.orange });
    plot4.push({ time: t, value: macd[i], color: up ? shadowBull : shadowBear });

    // Bar colour of the most recent divergence, fading over fade_steps bars
    sinceBull = bullCond[i] ? 0 : isNaN(sinceBull) ? NaN : sinceBull + 1;
    sinceBear = bearCond[i] ? 0 : isNaN(sinceBear) ? NaN : sinceBear + 1;
    let c: string | null = null;
    if (!isNaN(sinceBull) && (isNaN(sinceBear) || sinceBull < sinceBear) && sinceBull < fadeSteps) {
      const intensity = (fadeSteps - sinceBull) / fadeSteps;
      c = String(color.new(BULLISH, 100 - Math.trunc(intensity * 100)));
    } else if (!isNaN(sinceBear) && (isNaN(sinceBull) || sinceBear < sinceBull) && sinceBear < fadeSteps) {
      const intensity = (fadeSteps - sinceBear) / fadeSteps;
      c = String(color.new(BEARISH, 100 - Math.trunc(intensity * 100)));
    }
    if (c !== null) barColors.push({ time: t, color: c });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    hlines: [
      { value: -1, options: { title: 'Oversold', color: BEARISH, linestyle: 'solid', linewidth: 1 } },
      { value: 1, options: { title: 'Overbought', color: BULLISH, linestyle: 'solid', linewidth: 1 } },
      { value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dotted', linewidth: 1 } },
    ],
    markers,
    barColors,
    // alertcondition(bullCond) / alertcondition(bearCond)
    alerts: alertStates(alertConditions, bars, [bullCond, bearCond]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0', title: 'Regular Bullish Divergence',
    message: 'Found a new Regular Bullish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.',
  },
  {
    id: 'alert1', title: 'Regular Bearish Divergence',
    message: 'Found a new Regular Bearish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.',
  },
];

export const UptrickTrendAnalysis = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
