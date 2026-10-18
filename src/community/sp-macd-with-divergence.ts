/**
 * SP - MACD with Divergence
 *
 * MACD line (EMA(fast) - EMA(slow) of the source), its EMA signal line and the histogram (teal at or above 0, red
 * below). Regular divergences on MACD pivots (5 bars left / right): a bullish divergence is a MACD pivot low higher
 * than the previous one (5 to 60 bars after the previous pivot low) with a lower price low; a bearish divergence is
 * a MACD pivot high lower than the previous one with a higher price high. The divergence lines join the pivots on
 * the pivot bars (offset -5) and Bull / Bear labels mark them.
 * Alerts (alertcondition, `alerts` of the result): 'Regular Bullish Divergence' and 'Regular Bearish Divergence', true
 * on the bar that confirms the divergence (5 bars after the pivot that the label marks).
 *
 * Reference: "SP - MACD with Divergence" by ca_sidnayak
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © disizsid
 */

import { ta, Series, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SpMacdWithDivergenceInputs {
  fastLength: number;
  slowLength: number;
  signalLength: number;
  src: SourceType;
  /** Detect regular bullish and bearish divergences on MACD */
  enableDivergence: boolean;
}

export const defaultInputs: SpMacdWithDivergenceInputs = {
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  src: 'close',
  enableDivergence: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12, min: 1, group: 'MACD Settings' },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26, min: 1, group: 'MACD Settings' },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1, group: 'MACD Settings' },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: 'MACD Settings' },
  { id: 'enableDivergence', type: 'bool', title: 'Enable Divergence Detection', defval: true, group: 'Divergence Settings',
    tooltip: 'Detects regular bullish and bearish divergences on MACD' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MACD Line', color: color.teal, lineWidth: 2 },
  { id: 'plot1', title: 'Signal Line', color: color.orange, lineWidth: 2 },
  { id: 'plot2', title: 'Histogram', color: color.teal, lineWidth: 1, style: 'columns' },
  { id: 'plot3', title: 'Regular Bullish', color: color.green, lineWidth: 2, display: 'pane' },
  { id: 'plot4', title: 'Regular Bearish', color: color.red, lineWidth: 2, display: 'pane' },
];

export const metadata = {
  title: 'SP - MACD with Divergence',
  shortTitle: 'SP - MACD+',
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
  inputs: Partial<SpMacdWithDivergenceInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const lookbackLeft = 5;
  const lookbackRight = 5;
  const rangeUpper = 60;
  const rangeLower = 5;
  const bullColor = String(color.new(color.green, 0));
  const bearColor = String(color.new(color.red, 0));
  const textColor = color.white;
  const noneColor = String(color.new(color.white, 100));

  // MACD
  const src = getSourceSeries(bars, cfg.src);
  const fastMA = A(ta.ema(src, cfg.fastLength));
  const slowMA = A(ta.ema(src, cfg.slowLength));
  const macd = fastMA.map((f, i) => f - slowMA[i]);
  const signal = A(ta.ema(S(macd), cfg.signalLength));
  const hist = macd.map((m, i) => m - signal[i]);

  // Divergences (the `if enableDivergence` block runs on every bar when enabled)
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const macdLbr = (i: number) => (i - lookbackRight >= 0 ? macd[i - lookbackRight] : NaN);
  if (cfg.enableDivergence) {
    const pivotLow = A(ta.pivotlow(S(macd), lookbackLeft, lookbackRight));
    const pivotHigh = A(ta.pivothigh(S(macd), lookbackLeft, lookbackRight));
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plMacd: number[] = [];
    const plLow: number[] = [];
    const phMacd: number[] = [];
    const phHigh: number[] = [];
    // Pine `and` is lazy: the ta.barssince inside _inRange(...) only runs on the bars where the left side
    // (macdLBR > / < ta.valuewhen(...)) is true, so it counts those calls. One state per call site.
    let plCalls = NaN;
    let phCalls = NaN;
    for (let i = 0; i < n; i++) {
      const m = macdLbr(i);
      const lowLbr = i - lookbackRight >= 0 ? bars[i - lookbackRight].low : NaN;
      const highLbr = i - lookbackRight >= 0 ? bars[i - lookbackRight].high : NaN;
      const prevPl = i > 0 && plFound[i - 1]; // plFound[1]
      const prevPh = i > 0 && phFound[i - 1]; // phFound[1]

      plFound[i] = !isNaN(pivotLow[i]);
      if (plFound[i]) {
        plMacd.push(m);
        plLow.push(lowLbr);
      }
      const vwPlMacd = plMacd.length >= 2 ? plMacd[plMacd.length - 2] : NaN;
      const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
      let macdHL = false;
      if (gt(m, vwPlMacd)) {
        if (prevPl) plCalls = 0;
        else if (!isNaN(plCalls)) plCalls++;
        macdHL = rangeLower <= plCalls && plCalls <= rangeUpper;
      }
      const priceLL = lt(lowLbr, vwPlLow);
      bullCond[i] = priceLL && macdHL && plFound[i];

      phFound[i] = !isNaN(pivotHigh[i]);
      if (phFound[i]) {
        phMacd.push(m);
        phHigh.push(highLbr);
      }
      const vwPhMacd = phMacd.length >= 2 ? phMacd[phMacd.length - 2] : NaN;
      const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
      let macdLH = false;
      if (lt(m, vwPhMacd)) {
        if (prevPh) phCalls = 0;
        else if (!isNaN(phCalls)) phCalls++;
        macdLH = rangeLower <= phCalls && phCalls <= rangeUpper;
      }
      const priceHH = gt(highLbr, vwPhHigh);
      bearCond[i] = priceHH && macdLH && phFound[i];
    }
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const interval = barInterval(bars);
  const teal = String(color.new(color.teal, 0));
  const red = String(color.new(color.red, 0));
  // plot(found ? macdLBR : na, offset = -lookbackRight): the value of bar i is drawn on bar i - 5
  const divPlot = (found: boolean[], cond: boolean[], on: string): Point[] => {
    const out: Point[] = [];
    for (let i = lookbackRight; i < n; i++) {
      out.push({ time: barTime(bars, i - lookbackRight, interval), value: found[i] ? fin(macdLbr(i)) : NaN,
        color: cond[i] ? on : noneColor });
    }
    return out;
  };

  const markers: MarkerData[] = [];
  for (let i = lookbackRight; i < n; i++) {
    const price = macdLbr(i);
    if (!Number.isFinite(price)) continue;
    // plotshape(bullCond ? macdLBR : na, offset = -5, " Bull ", shape.labelup, location.absolute, bullColor, white)
    if (bullCond[i]) {
      markers.push({ time: barTime(bars, i - lookbackRight, interval), position: 'atPriceBottom', price, shape: 'labelUp',
        color: bullColor, text: ' Bull ', textColor });
    }
    if (bearCond[i]) {
      markers.push({ time: barTime(bars, i - lookbackRight, interval), position: 'atPriceTop', price, shape: 'labelDown',
        color: bearColor, text: ' Bear ', textColor });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(macd[i]), color: teal })),
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(signal[i]), color: String(color.new(color.orange, 0)) })),
      plot2: bars.map((b, i) => ({ time: b.time, value: fin(hist[i]), color: ge(hist[i], 0) ? teal : red })),
      plot3: divPlot(plFound, bullCond, bullColor),
      plot4: divPlot(phFound, bearCond, bearColor),
    },
    markers,
    // alertcondition(bullCond, ...) / alertcondition(bearCond, ...)
    alerts: alertStates(alertConditions, bars, [bullCond, bearCond]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Regular Bullish Divergence', message: 'MACD: Regular Bullish Divergence detected.' },
  { id: 'alert1', title: 'Regular Bearish Divergence', message: 'MACD: Regular Bearish Divergence detected.' },
];

export const SpMacdWithDivergence = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
