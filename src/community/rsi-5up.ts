/**
 * RSI - 5UP
 *
 * RSI from the RMA of the up and down changes of the source, with bands at 70 / 50 / 30, a background fill between
 * 70 and 30, and gradient fills above 70 (green) and below 30 (red). An optional smoothing moving average (SMA,
 * SMA + Bollinger Bands, EMA, RMA, WMA or VWMA) of the RSI, with Bollinger Bands for "SMA + Bollinger Bands".
 * Optional regular divergences: RSI pivots (5 / 5 bars) whose RSI and price disagree with the previous pivot,
 * 5 to 60 bars apart, drawn on the pivot bar with Bull / Bear labels.
 * Alerts (alertcondition, `alerts` of the result): 'Regular Bullish Divergence' / 'Regular Bearish Divergence', true
 * on the bar that confirms the divergence (5 bars after its pivot); only with "Calculate Divergence" on.
 *
 * Reference: "RSI - 5UP" by Marrulk
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Marrulk
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type MaType = 'None' | 'SMA' | 'SMA + Bollinger Bands' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';

export interface Rsi5UpInputs {
  rsiLength: number;
  rsiSource: SourceType;
  /** Detect regular divergences */
  calculateDivergence: boolean;
  /** Smoothing type */
  maType: MaType;
  /** Smoothing length */
  maLength: number;
  /** Bollinger Bands standard deviation multiplier */
  bbMult: number;
}

export const defaultInputs: Rsi5UpInputs = {
  rsiLength: 14,
  rsiSource: 'close',
  calculateDivergence: false,
  maType: 'SMA',
  maLength: 14,
  bbMult: 2.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1, group: 'RSI Settings' },
  { id: 'rsiSource', type: 'source', title: 'Source', defval: 'close', group: 'RSI Settings' },
  { id: 'calculateDivergence', type: 'bool', title: 'Calculate Divergence', defval: false, group: 'RSI Settings',
    display: 'data_window', tooltip: 'Calculating divergences is needed in order for divergence alerts to fire.' },
  { id: 'maType', type: 'string', title: 'Type', defval: 'SMA', group: 'Smoothing', display: 'data_window',
    options: ['None', 'SMA', 'SMA + Bollinger Bands', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] },
  { id: 'maLength', type: 'int', title: 'Length', defval: 14, group: 'Smoothing', display: 'data_window' },
  { id: 'bbMult', type: 'float', title: 'BB StdDev', defval: 2.0, min: 0.001, max: 50, step: 0.5, group: 'Smoothing',
    display: 'data_window', tooltip: "Only applies when 'SMA + Bollinger Bands' is selected. Determines the distance between the SMA and the bands." },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: '#7E57C2', lineWidth: 1 },
  // midLinePlot = plot(50, color = na, display = display.none): bounds the gradient fills
  { id: 'plot1', title: 'Middle Line', color: 'transparent', lineWidth: 1, display: 'none' },
  // display = enableMA ? display.all : display.none (result.visibility.enableMA)
  { id: 'plot2', title: 'RSI-based MA', color: color.yellow, lineWidth: 1, visible: 'enableMA' },
  // display = isBB ? display.all : display.none (result.visibility.isBB)
  { id: 'plot3', title: 'Upper Bollinger Band', color: color.green, lineWidth: 1, visible: 'isBB' },
  { id: 'plot4', title: 'Lower Bollinger Band', color: color.green, lineWidth: 1, visible: 'isBB' },
  // offset = -5, display = display.pane
  { id: 'plot5', title: 'Regular Bullish', color: color.green, lineWidth: 2, display: 'pane' },
  { id: 'plot6', title: 'Regular Bearish', color: color.red, lineWidth: 2, display: 'pane' },
];

const UPPER_COLOR = 'rgb(255, 0, 0)';
const MIDDLE_COLOR = String(color.new('#ffffff', 50));
const LOWER_COLOR = 'rgb(0, 130, 6)';
const BAND_FILL = 'rgba(126, 87, 194, 0.1)'; // color.rgb(126, 87, 194, 90)

/** hline(70 / 50 / 30): Pine default dashed style */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 70, title: 'RSI Upper Band', color: UPPER_COLOR, linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'RSI Middle Band', color: MIDDLE_COLOR, linestyle: 'dashed' },
  { id: 'hline_lower', price: 30, title: 'RSI Lower Band', color: LOWER_COLOR, linestyle: 'dashed' },
];

/** fill(rsiUpperBand, rsiLowerBand, color.rgb(126, 87, 194, 90)) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_bands', plot1: 'hline_upper', plot2: 'hline_lower', color: BAND_FILL, title: 'RSI Background Fill' },
];

export const metadata = {
  title: 'RSI - 5UP',
  shortTitle: 'RSI-5UP',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<Rsi5UpInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; visibility: Record<string, boolean> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // change = ta.change(src); up = ta.rma(math.max(change, 0)); down = ta.rma(-math.min(change, 0))
  const src = A(getSourceSeries(bars, cfg.rsiSource));
  const change = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const up = A(ta.rma(S(change.map((c) => (isNaN(c) ? NaN : Math.max(c, 0)))), cfg.rsiLength));
  const down = A(ta.rma(S(change.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0)))), cfg.rsiLength));
  // rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))
  const rsi = up.map((u, i) => (eq(down[i], 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / down[i])));
  const rsiS = S(rsi);

  // Smoothing MA and Bollinger Bands
  const enableMA = cfg.maType !== 'None';
  const isBB = cfg.maType === 'SMA + Bollinger Bands';
  let ma = new Array<number>(n).fill(NaN);
  if (enableMA) {
    let maS: Series;
    switch (cfg.maType) {
      case 'EMA': maS = ta.ema(rsiS, cfg.maLength); break;
      case 'SMMA (RMA)': maS = ta.rma(rsiS, cfg.maLength); break;
      case 'WMA': maS = ta.wma(rsiS, cfg.maLength); break;
      case 'VWMA': maS = ta.vwma(rsiS, cfg.maLength, S(bars.map((b) => b.volume ?? NaN))); break;
      default: maS = ta.sma(rsiS, cfg.maLength); break;
    }
    ma = A(maS);
  }
  const sd = isBB ? A(ta.stdev(rsiS, cfg.maLength)).map((v) => v * cfg.bbMult) : new Array<number>(n).fill(NaN);
  const bbUpper = ma.map((m, i) => m + sd[i]);
  const bbLower = ma.map((m, i) => m - sd[i]);

  // Regular divergences
  const lbR = 5;
  const lbL = 5;
  const rangeUpper = 60;
  const rangeLower = 5;
  const rsiLbr = (i: number) => (i - lbR >= 0 ? rsi[i - lbR] : NaN);
  const plFound = new Array<boolean>(n).fill(false);
  const phFound = new Array<boolean>(n).fill(false);
  const bullCond = new Array<boolean>(n).fill(false);
  const bearCond = new Array<boolean>(n).fill(false);
  if (cfg.calculateDivergence) {
    const pl = A(ta.pivotlow(rsiS, lbL, lbR));
    const ph = A(ta.pivothigh(rsiS, lbL, lbR));
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plRsi: number[] = [];
    const plLow: number[] = [];
    const phRsi: number[] = [];
    const phHigh: number[] = [];
    const second = (a: number[]) => (a.length >= 2 ? a[a.length - 2] : NaN);
    // Pine v6 `and` is lazy: the ta.barssince inside _inRange(found[1]) only runs on the bars where the left side
    // (rsiLBR > / < ta.valuewhen(...)) is true, so it counts those calls.
    let plCalls = NaN;
    let phCalls = NaN;
    for (let i = 0; i < n; i++) {
      const r = rsiLbr(i);
      const lowLbr = i - lbR >= 0 ? bars[i - lbR].low : NaN;
      const highLbr = i - lbR >= 0 ? bars[i - lbR].high : NaN;

      plFound[i] = !isNaN(pl[i]);
      if (plFound[i]) {
        plRsi.push(r);
        plLow.push(lowLbr);
      }
      let rsiHL = false;
      if (gt(r, second(plRsi))) {
        if (i > 0 && plFound[i - 1]) plCalls = 0;
        else if (!isNaN(plCalls)) plCalls++;
        rsiHL = rangeLower <= plCalls && plCalls <= rangeUpper;
      }
      bullCond[i] = lt(lowLbr, second(plLow)) && rsiHL && plFound[i];

      phFound[i] = !isNaN(ph[i]);
      if (phFound[i]) {
        phRsi.push(r);
        phHigh.push(highLbr);
      }
      let rsiLH = false;
      if (lt(r, second(phRsi))) {
        if (i > 0 && phFound[i - 1]) phCalls = 0;
        else if (!isNaN(phCalls)) phCalls++;
        rsiLH = rangeLower <= phCalls && phCalls <= rangeUpper;
      }
      bearCond[i] = gt(highLbr, second(phHigh)) && rsiLH && phFound[i];
    }
  }

  const t = (i: number) => bars[i].time;
  const interval = barInterval(bars);
  const noneColor = String(color.new(color.white, 100));
  const line = (f: (i: number) => Point): Point[] => bars.map((_b, i) => f(i));
  // plot(..., offset = -lookbackRight): the value of bar i is drawn on bar i - 5
  const back = (f: (i: number) => { value: number; color: string }): Point[] => {
    const out: Point[] = [];
    for (let i = lbR; i < n; i++) out.push({ time: barTime(bars, i - lbR, interval), ...f(i) });
    return out;
  };

  // plotshape(bullCond ? rsiLBR : na, offset = -5, " Bull ", shape.labelup, location.absolute, green, textcolor white)
  const markers: MarkerData[] = [];
  for (let i = lbR; i < n; i++) {
    const price = rsiLbr(i);
    if (isNaN(price)) continue;
    const time = barTime(bars, i - lbR, interval);
    if (bullCond[i]) {
      markers.push({ time, position: 'atPriceBottom', price, shape: 'labelUp', color: color.green, text: ' Bull ',
        textColor: color.white });
    }
    if (bearCond[i]) {
      markers.push({ time, position: 'atPriceTop', price, shape: 'labelDown', color: color.red, text: ' Bear ',
        textColor: color.white });
    }
  }

  const bbFill = String(color.new(color.green, 90));
  const constant = <T>(v: T) => new Array<T>(n).fill(v);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      plot0: line((i) => ({ time: t(i), value: rsi[i], color: '#7E57C2' })),
      plot1: line((i) => ({ time: t(i), value: 50 })),
      plot2: line((i) => ({ time: t(i), value: ma[i], color: color.yellow })),
      plot3: line((i) => ({ time: t(i), value: bbUpper[i], color: color.green })),
      plot4: line((i) => ({ time: t(i), value: bbLower[i], color: color.green })),
      plot5: back((i) => ({ value: plFound[i] ? rsiLbr(i) : NaN, color: bullCond[i] ? color.green : noneColor })),
      plot6: back((i) => ({ value: phFound[i] ? rsiLbr(i) : NaN, color: bearCond[i] ? color.red : noneColor })),
    },
    hlines: [
      { value: 70, options: { title: 'RSI Upper Band', color: UPPER_COLOR, linestyle: 'dashed' } },
      { value: 50, options: { title: 'RSI Middle Band', color: MIDDLE_COLOR, linestyle: 'dashed' } },
      { value: 30, options: { title: 'RSI Lower Band', color: LOWER_COLOR, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_upper', plot2: 'hline_lower', options: { title: 'RSI Background Fill' }, colors: constant(BAND_FILL) },
      // fill(rsiPlot, midLinePlot, 100, 70, top_color = color.new(color.green, 0), bottom_color = color.new(color.green, 100))
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Overbought Gradient Fill' },
        gradient: { topValue: constant(100), bottomValue: constant(70),
          topColor: constant(String(color.new(color.green, 0))), bottomColor: constant(String(color.new(color.green, 100))) } },
      // fill(rsiPlot, midLinePlot, 30, 0, top_color = color.new(color.red, 100), bottom_color = color.new(color.red, 0))
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Oversold Gradient Fill' },
        gradient: { topValue: constant(30), bottomValue: constant(0),
          topColor: constant(String(color.new(color.red, 100))), bottomColor: constant(String(color.new(color.red, 0))) } },
      // fill(bbUpperBand, bbLowerBand, color = isBB ? color.new(color.green, 90) : na, display = isBB ? all : none)
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Bollinger Bands Background Fill' },
        colors: constant(isBB ? bbFill : 'transparent') },
    ],
    markers,
    visibility: { enableMA, isBB },
    // alertcondition(bullCond, ...) / alertcondition(bearCond, ...): on the bar the condition is found
    alerts: alertStates(alertConditions, bars, [bullCond, bearCond]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0',
    title: 'Regular Bullish Divergence',
    message: 'Found a new Regular Bullish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.',
  },
  {
    id: 'alert1',
    title: 'Regular Bearish Divergence',
    message: 'Found a new Regular Bearish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.',
  },
];

export const Rsi5Up = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
