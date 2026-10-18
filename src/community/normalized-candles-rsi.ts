/**
 * Normalized Candles RSI [Jamallo]
 *
 * Fractional differencing of the close: weights w0 = 1, wk = -w(k-1) * (d - k + 1) / k, kept while |wk| >= the
 * threshold (at most Max Window weights); the differenced close is sum(wk * close[k]). The candle keeps its shape
 * around the differenced close (open, high and low at the same distance from it). The four prices are normalised
 * with the z-score over the lookback (mean and standard deviation of the differenced close) and a sigmoid:
 * 100 / (1 + exp(-z / (scale / 2))), and drawn as candles. The pane also shows the RSI with bands at 70 / 50 / 30,
 * a background fill, gradient fills above 70 and below 30, an optional smoothing moving average (with Bollinger
 * Bands for "SMA + Bollinger Bands") and optional regular divergences (RSI pivots 5 / 5).
 *
 * Alerts (alertcondition, `alerts` of the result): regular bullish / bearish divergence (only with "Calculate
 * Divergence" on, as in the original) and the normalised close crossing above 50, below 50, above 70 and below 30.
 *
 * Reference: "Normalized Candles RSI [Jamallo]" by Jamallo22
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Regular Bullish Divergence', message: 'Found a new Regular Bullish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.' },
  { id: 'alert1', title: 'Regular Bearish Divergence', message: 'Found a new Regular Bearish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.' },
  { id: 'alert2', title: 'Norm Close Cross Above 50', message: 'FFD Normalized Close crossed above 50 — bullish regime shift.' },
  { id: 'alert3', title: 'Norm Close Cross Below 50', message: 'FFD Normalized Close crossed below 50 — bearish regime shift.' },
  { id: 'alert4', title: 'Norm Close Cross Above 70', message: 'FFD Normalized Close crossed above 70 — overbought.' },
  { id: 'alert5', title: 'Norm Close Cross Below 30', message: 'FFD Normalized Close crossed below 30 — oversold.' },
];

type MaType = 'None' | 'SMA' | 'SMA + Bollinger Bands' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';

export interface NormalizedCandlesRsiInputs {
  /** Enable the fractional differencing */
  fdEnabled: boolean;
  /** Fractional differencing order d */
  fdD: number;
  /** Weight threshold: weights below it end the weight list */
  fdThresh: number;
  /** Maximum number of weights */
  fdMaxWin: number;
  /** Z-score lookback */
  zLen: number;
  /** Sigmoid compression scale */
  zClip: number;
  bullColor: string;
  bearColor: string;
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

export const defaultInputs: NormalizedCandlesRsiInputs = {
  fdEnabled: true,
  fdD: 0.3,
  fdThresh: 0.01,
  fdMaxWin: 30,
  zLen: 100,
  zClip: 4.0,
  bullColor: color.teal,
  bearColor: color.maroon,
  rsiLength: 14,
  rsiSource: 'close',
  calculateDivergence: false,
  maType: 'SMA',
  maLength: 14,
  bbMult: 2.0,
};

const FD = 'Fractional Differencing';
const NORM = 'Normalization';

export const inputConfig: InputConfig[] = [
  { id: 'fdEnabled', type: 'bool', title: 'Enable Fractal Differencing', defval: true, group: FD,
    tooltip: 'Toggles the fractional differencing engine on or off.' },
  { id: 'fdD', type: 'float', title: 'Diff Order (d)', defval: 0.3, min: 0.01, max: 0.99, step: 0.01, group: FD,
    tooltip: 'The fractional differencing order. A higher value makes the series more stationary but removes more historical memory.' },
  { id: 'fdThresh', type: 'float', title: 'Weight Threshold', defval: 0.01, min: 0.001, max: 0.1, step: 0.001, group: FD,
    tooltip: 'Weight threshold to stop calculating historical lags. A smaller value increases the lookback memory.' },
  { id: 'fdMaxWin', type: 'int', title: 'Max Window', defval: 30, min: 10, max: 100, group: FD,
    tooltip: 'Maximum number of bars to process for fractional differencing.' },
  { id: 'zLen', type: 'int', title: 'Z-Score Lookback', defval: 100, min: 2, group: NORM,
    tooltip: 'The rolling lookback window used to calculate the mean and standard deviation for the Z-Score normalization.' },
  { id: 'zClip', type: 'float', title: 'Sigmoid Compression Scale', defval: 4.0, min: 1.0, max: 6.0, step: 0.5, group: NORM,
    tooltip: 'Controls the elasticity of the 0-100 bounds. Lower = faster compression at the edges. Higher = softer compression.' },
  { id: 'bullColor', type: 'color', title: 'Bullish Candle Color', defval: color.teal, group: 'Colors' },
  { id: 'bearColor', type: 'color', title: 'Bearish Candle Color', defval: color.maroon, group: 'Colors' },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1, group: 'RSI Settings' },
  { id: 'rsiSource', type: 'source', title: 'Source', defval: 'close', group: 'RSI Settings' },
  { id: 'calculateDivergence', type: 'bool', title: 'Calculate Divergence', defval: false, group: 'RSI Settings',
    display: 'none', tooltip: 'Calculating divergences is needed in order for divergence alerts to fire.' },
  { id: 'maType', type: 'string', title: 'Type', defval: 'SMA', group: 'Smoothing', display: 'none',
    options: ['None', 'SMA', 'SMA + Bollinger Bands', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] },
  { id: 'maLength', type: 'int', title: 'Length', defval: 14, group: 'Smoothing', display: 'none' },
  { id: 'bbMult', type: 'float', title: 'BB StdDev', defval: 2.0, min: 0.001, max: 50, step: 0.5, group: 'Smoothing',
    display: 'none', tooltip: "Only applies when 'SMA + Bollinger Bands' is selected. Determines the distance between the SMA and the bands." },
];

const NONE_COLOR = String(color.new(color.white, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: '#7E57C2', lineWidth: 1 },
  // midLinePlot = plot(50, color = na, editable = false, display = display.none): bounds the gradient fills
  { id: 'plot1', title: 'Middle Line', color: 'transparent', lineWidth: 1, display: 'none' },
  // display = enableMA ? display.all : display.none (result.visibility.enableMA)
  { id: 'plot2', title: 'RSI-based MA', color: color.yellow, lineWidth: 1, visible: 'enableMA' },
  // display = isBB ? display.all : display.none (result.visibility.isBB)
  { id: 'plot3', title: 'Upper Bollinger Band', color: color.green, lineWidth: 1, visible: 'isBB' },
  { id: 'plot4', title: 'Lower Bollinger Band', color: color.green, lineWidth: 1, visible: 'isBB' },
  // offset = -lookbackRight (5), display = display.pane
  { id: 'plot5', title: 'Regular Bullish', color: color.green, lineWidth: 2, display: 'pane' },
  { id: 'plot6', title: 'Regular Bearish', color: color.red, lineWidth: 2, display: 'pane' },
];

const BAND_COLOR = '#787B86';
const MIDDLE_COLOR = String(color.new('#787B86', 50));
const BAND_FILL = 'rgba(126, 87, 194, 0.1)'; // color.rgb(126, 87, 194, 90)
const BB_FILL = String(color.new(color.green, 90));

/** hline(70 / 50 / 30) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 70, title: 'RSI Upper Band', color: BAND_COLOR, linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'RSI Middle Band', color: MIDDLE_COLOR, linestyle: 'dotted' },
  { id: 'hline_lower', price: 30, title: 'RSI Lower Band', color: BAND_COLOR, linestyle: 'dashed' },
];

/** fill(rsiUpperBand, rsiLowerBand, color.rgb(126, 87, 194, 90)); Bollinger Bands fill shown with isBB */
export const fillConfig: FillConfig[] = [
  { id: 'fill_bands', plot1: 'hline_upper', plot2: 'hline_lower', color: BAND_FILL, title: 'RSI Background Fill' },
  { id: 'fill_bb', plot1: 'plot3', plot2: 'plot4', color: BB_FILL, title: 'Bollinger Bands Background Fill', visible: 'isBB' },
];

export const metadata = {
  title: 'Normalized Candles RSI',
  shortTitle: 'Normalized Candles RSI',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<NormalizedCandlesRsiInputs> = {},
): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[];
  plotCandles: Record<string, PlotCandleData[]>;
  visibility: Record<string, boolean>;
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // f_fd_build_weights(d, thresh, maxL) (input Max Window >= 10: the loop counts up)
  const w: number[] = [1.0];
  for (let k = 1; k <= cfg.fdMaxWin - 1; k++) {
    const wPrev = w[k - 1];
    const wK = (-wPrev * (cfg.fdD - k + 1.0)) / k;
    if (Math.abs(wK) < cfg.fdThresh) break;
    w.push(wK);
  }
  const L = w.length;
  const fdWarmup = L;

  // f_frac_diff(fd_w, close): sum of w[k] * nz(close[k], close) once bar_index >= L - 1, else close
  const close = bars.map((b) => b.close);
  const fdClose: number[] = new Array(n);
  const fdOpen: number[] = new Array(n);
  const fdHigh: number[] = new Array(n);
  const fdLow: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const src = close[i];
    let val = 0.0;
    if (i >= L - 1) {
      for (let k = 0; k < L; k++) {
        const x = close[i - k];
        val += w[k] * (isNaN(x) ? src : x);
      }
    } else {
      val = src;
    }
    const b = bars[i];
    const on = cfg.fdEnabled && i >= fdWarmup;
    fdClose[i] = on ? val : b.close;
    fdOpen[i] = on ? val - (b.close - b.open) : b.open;
    fdHigh[i] = on ? val + (b.high - b.close) : b.high;
    fdLow[i] = on ? val - (b.close - b.low) : b.low;
  }

  // Z-score + sigmoid
  const fdMean = A(ta.sma(S(fdClose), cfg.zLen));
  const fdStd = A(ta.stdev(S(fdClose), cfg.zLen));
  const normalize = (val: number, i: number) => {
    const fdSafe = isNaN(fdStd[i]) ? NaN : Math.max(fdStd[i], 0.0001);
    const zScore = (val - fdMean[i]) / fdSafe;
    const scaledZ = zScore / (cfg.zClip / 2.0);
    return 100.0 / (1.0 + Math.exp(-scaledZ));
  };
  const candles: PlotCandleData[] = [];
  const normClose: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = normalize(fdOpen[i], i);
    const h = normalize(fdHigh[i], i);
    const l = normalize(fdLow[i], i);
    const c = normalize(fdClose[i], i);
    normClose[i] = c;
    // candleColor = norm_close >= norm_open ? bullColor : bearColor
    const col = ge(c, o) ? cfg.bullColor : cfg.bearColor;
    // plotcandle draws no candle when a value is na
    if ([o, h, l, c].every((v) => Number.isFinite(v))) {
      candles.push({ time: bars[i].time, open: o, high: h, low: l, close: c, color: col, wickColor: col, borderColor: col });
    }
  }

  // RSI: change = ta.change(src); up = ta.rma(math.max(change, 0)); down = ta.rma(-math.min(change, 0))
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
  const pl = cfg.calculateDivergence ? A(ta.pivotlow(rsiS, lbL, lbR)) : [];
  const ph = cfg.calculateDivergence ? A(ta.pivothigh(rsiS, lbL, lbR)) : [];
  // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
  const plRsi: number[] = [];
  const plLow: number[] = [];
  const phRsi: number[] = [];
  const phHigh: number[] = [];
  const second = (a: number[]) => (a.length >= 2 ? a[a.length - 2] : NaN);
  // _inRange(plFound[1]) / _inRange(phFound[1]) run on every bar: ta.barssince(found[1])
  let plSince = NaN;
  let phSince = NaN;
  const inRange = (bs: number) => rangeLower <= bs && bs <= rangeUpper;
  for (let i = 0; i < n; i++) {
    plSince = i > 0 && plFound[i - 1] ? 0 : isNaN(plSince) ? NaN : plSince + 1;
    phSince = i > 0 && phFound[i - 1] ? 0 : isNaN(phSince) ? NaN : phSince + 1;
    const inRangePl = inRange(plSince);
    const inRangePh = inRange(phSince);
    if (!cfg.calculateDivergence) continue;
    const r = rsiLbr(i);
    const lowLbr = i - lbR >= 0 ? bars[i - lbR].low : NaN;
    const highLbr = i - lbR >= 0 ? bars[i - lbR].high : NaN;

    plFound[i] = !isNaN(pl[i]);
    if (plFound[i]) {
      plRsi.push(r);
      plLow.push(lowLbr);
    }
    const rsiHL = gt(r, second(plRsi)) && inRangePl;
    const priceLL = lt(lowLbr, second(plLow));
    bullCond[i] = priceLL && rsiHL && plFound[i];

    phFound[i] = !isNaN(ph[i]);
    if (phFound[i]) {
      phRsi.push(r);
      phHigh.push(highLbr);
    }
    const rsiLH = lt(r, second(phRsi)) && inRangePh;
    const priceHH = gt(highLbr, second(phHigh));
    bearCond[i] = priceHH && rsiLH && phFound[i];
  }

  const interval = barInterval(bars);
  const line = (f: (i: number) => number, c?: string): Point[] =>
    bars.map((b, i) => (c === undefined ? { time: b.time, value: f(i) } : { time: b.time, value: f(i), color: c }));
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

  const constant = <T>(v: T) => new Array<T>(n).fill(v);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line((i) => rsi[i], '#7E57C2'),
      plot1: line(() => 50),
      plot2: line((i) => ma[i], color.yellow),
      plot3: line((i) => ma[i] + sd[i], color.green),
      plot4: line((i) => ma[i] - sd[i], color.green),
      plot5: back((i) => ({ value: plFound[i] ? rsiLbr(i) : NaN, color: bullCond[i] ? color.green : NONE_COLOR })),
      plot6: back((i) => ({ value: phFound[i] ? rsiLbr(i) : NaN, color: bearCond[i] ? color.red : NONE_COLOR })),
    },
    hlines: [
      { value: 70, options: { title: 'RSI Upper Band', color: BAND_COLOR, linestyle: 'dashed' } },
      { value: 50, options: { title: 'RSI Middle Band', color: MIDDLE_COLOR, linestyle: 'dotted' } },
      { value: 30, options: { title: 'RSI Lower Band', color: BAND_COLOR, linestyle: 'dashed' } },
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
        colors: constant(isBB ? BB_FILL : 'transparent') },
    ],
    markers,
    plotCandles: { ffdNormalizedCandles: candles },
    visibility: { enableMA, isBB },
    alerts: alertStates(alertConditions, bars, [
      bullCond, bearCond,
      crossedOver(normClose, 50), crossedUnder(normClose, 50), crossedOver(normClose, 70), crossedUnder(normClose, 30),
    ]),
  };
}

export const NormalizedCandlesRsi = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
