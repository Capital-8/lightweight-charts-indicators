/**
 * RSI Games 1.2
 *
 * RSI (RMA of the up / down changes) with a smoothing moving average (SMA, SMA + Bollinger Bands, EMA, RMA, WMA or
 * VWMA). The RSI line is green above its MA, red below (fuchsia without MA); a fill between the RSI and its MA takes
 * the same colours. With "SMA + Bollinger Bands" the bands are drawn with a fill, and arrows mark the RSI crossing
 * back above the lower band (buy, pane bottom) or below the upper band (sell, pane top). The background is green
 * below 30 and red above 70. Pivot divergences (5 / 5 bars) between the RSI and the price give regular and
 * "hidden" bullish / bearish labels, drawn on the pivot bar.
 * Alerts (alertcondition, `alerts` of the result): the regular and hidden bullish / bearish divergences, true on the
 * bar that confirms the pivot (5 bars after it).
 *
 * Reference: "RSI Games 1.2" by petejfjohnson
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © petejfjohnson
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type MaType = 'None' | 'SMA' | 'SMA + Bollinger Bands' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';

export interface RsiGames12Inputs {
  rsiLength: number;
  rsiSource: SourceType;
  calculateDivergence: boolean;
  /** Smoothing type */
  maType: MaType;
  /** Smoothing length */
  maLength: number;
  /** Bollinger Bands standard deviation multiplier */
  bbMult: number;
}

export const defaultInputs: RsiGames12Inputs = {
  rsiLength: 14,
  rsiSource: 'close',
  calculateDivergence: true,
  maType: 'SMA + Bollinger Bands',
  maLength: 14,
  bbMult: 2.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'rsiSource', type: 'source', title: 'Source', defval: 'close' },
  { id: 'calculateDivergence', type: 'bool', title: 'Calculate Divergence', defval: true },
  { id: 'maType', type: 'string', title: 'Type', defval: 'SMA + Bollinger Bands',
    options: ['None', 'SMA', 'SMA + Bollinger Bands', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] },
  { id: 'maLength', type: 'int', title: 'Length', defval: 14 },
  { id: 'bbMult', type: 'float', title: 'BB StdDev', defval: 2.0, min: 0.001, max: 50, step: 0.5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: color.green, lineWidth: 1 },
  // display = enableMA ? display.all : display.none (result.visibility.enableMA)
  { id: 'plot1', title: 'RSI-based MA', color: color.green, lineWidth: 1, visible: 'enableMA' },
  // display = isBB ? display.all : display.none (result.visibility.isBB)
  { id: 'plot2', title: 'Upper Bollinger Band', color: color.red, lineWidth: 1, visible: 'isBB' },
  { id: 'plot3', title: 'Lower Bollinger Band', color: 'rgb(41, 230, 20)', lineWidth: 1, visible: 'isBB' },
  { id: 'plot4', title: 'RSI MA for Fill (Hidden)', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Regular Bullish', color: color.green, lineWidth: 2 },
  { id: 'plot6', title: 'Regular Bearish', color: color.red, lineWidth: 2 },
];

export const metadata = {
  title: 'RSI Games 1.2',
  shortTitle: 'RSI Games 1.2',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiGames12Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[]; visibility: Record<string, boolean> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // RSI: rma of max(change, 0) and -min(change, 0)
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

  // Divergence
  const lbR = 5;
  const lbL = 5;
  const rangeUpper = 60;
  const rangeLower = 5;
  const rsiLbr = (i: number) => (i - lbR >= 0 ? rsi[i - lbR] : NaN);
  const plFound = new Array<boolean>(n).fill(false);
  const phFound = new Array<boolean>(n).fill(false);
  const bullCond = new Array<boolean>(n).fill(false);
  const bearCond = new Array<boolean>(n).fill(false);
  const hiddenBullCond = new Array<boolean>(n).fill(false);
  const hiddenBearCond = new Array<boolean>(n).fill(false);
  if (cfg.calculateDivergence) {
    const pl = A(ta.pivotlow(rsiS, lbL, lbR));
    const ph = A(ta.pivothigh(rsiS, lbL, lbR));
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plRsi: number[] = [];
    const plLow: number[] = [];
    const phRsi: number[] = [];
    const phHigh: number[] = [];
    // Pine v6 `and` is lazy: the ta.barssince inside _inRange(found[1]) only runs on the bars where the left side
    // (rsiLBR > / < ta.valuewhen(...)) is true, so it counts those calls. The regular and hidden call sites have the
    // same left side, so they give the same counts.
    let plCalls = NaN;
    let phCalls = NaN;
    const second = (a: number[]) => (a.length >= 2 ? a[a.length - 2] : NaN);
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
      const vwLow = second(plLow);
      bullCond[i] = lt(lowLbr, vwLow) && rsiHL && plFound[i];
      hiddenBullCond[i] = gt(lowLbr, vwLow) && rsiHL && plFound[i];

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
      const vwHigh = second(phHigh);
      bearCond[i] = gt(highLbr, vwHigh) && rsiLH && phFound[i];
      hiddenBearCond[i] = lt(highLbr, vwHigh) && rsiLH && phFound[i];
    }
  }

  // Colours
  const above = (i: number) => gt(rsi[i], ma[i]);
  const rsiColor = (i: number) => (enableMA && !isNaN(ma[i]) ? (above(i) ? color.green : color.red) : color.fuchsia);
  const maColor = (i: number) => (above(i) ? color.green : color.red);
  const fillGreen = String(color.new(color.green, 80));
  const fillRed = String(color.new(color.red, 80));
  const bbFill = String(color.new(color.white, 90));
  const noneColor = String(color.new(color.white, 100));
  const bgGreen = String(color.new(color.green, 90));
  const bgRed = String(color.new(color.red, 90));

  const t = (i: number) => bars[i].time;
  const interval = barInterval(bars);
  const line = (f: (i: number) => Point): Point[] => bars.map((_b, i) => f(i));
  // plot(..., offset = -lookbackRight): the value of bar i is drawn on bar i - 5
  const back = (f: (i: number) => { value: number; color: string }): Point[] => {
    const out: Point[] = [];
    for (let i = lbR; i < n; i++) out.push({ time: barTime(bars, i - lbR, interval), ...f(i) });
    return out;
  };

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    // crossAboveLowerBB = rsi[1] <= bbLower[1] and rsi > bbLower; crossBelowUpperBB = rsi[1] >= bbUpper[1] and rsi < bbUpper
    if (isBB && i > 0 && le(rsi[i - 1], bbLower[i - 1]) && gt(rsi[i], bbLower[i])) {
      markers.push({ time: t(i), position: 'bottom', shape: 'arrowUp', color: color.green, size: 'small' });
    }
    if (isBB && i > 0 && ge(rsi[i - 1], bbUpper[i - 1]) && lt(rsi[i], bbUpper[i])) {
      markers.push({ time: t(i), position: 'top', shape: 'arrowDown', color: color.red, size: 'small' });
    }
    // bgcolor(rsi < 30 ? color.new(color.green, 90) : rsi > 70 ? color.new(color.red, 90) : na)
    if (lt(rsi[i], 30)) bgColors.push({ time: t(i), color: bgGreen });
    else if (gt(rsi[i], 70)) bgColors.push({ time: t(i), color: bgRed });

    // Divergence labels (offset = -lookbackRight, location.absolute at rsiLBR)
    if (i - lbR < 0) continue;
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
    if (hiddenBullCond[i]) {
      markers.push({ time, position: 'atPriceBottom', price, shape: 'labelUp', color: color.teal, text: ' H-Bull ',
        textColor: color.white });
    }
    if (hiddenBearCond[i]) {
      markers.push({ time, position: 'atPriceTop', price, shape: 'labelDown', color: color.orange, text: ' H-Bear ',
        textColor: color.white });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line((i) => ({ time: t(i), value: rsi[i], color: rsiColor(i) })),
      plot1: line((i) => ({ time: t(i), value: ma[i], color: maColor(i) })),
      plot2: line((i) => ({ time: t(i), value: bbUpper[i], color: color.red })),
      plot3: line((i) => ({ time: t(i), value: bbLower[i], color: 'rgb(41, 230, 20)' })),
      plot4: line((i) => ({ time: t(i), value: ma[i], color: 'transparent' })),
      plot5: back((i) => ({ value: plFound[i] ? rsiLbr(i) : NaN, color: bullCond[i] ? color.green : noneColor })),
      plot6: back((i) => ({ value: phFound[i] ? rsiLbr(i) : NaN, color: bearCond[i] ? color.red : noneColor })),
    },
    hlines: [
      { value: 70, options: { title: 'RSI Upper Band', color: color.red, linestyle: 'dashed' } },
      { value: 50, options: { title: 'RSI Middle Band', color: '#f4fc0980', linestyle: 'dashed' } },
      { value: 30, options: { title: 'RSI Lower Band', color: color.green, linestyle: 'dashed' } },
    ],
    fills: [
      // fill(bbUpper, bbLower, color = isBB ? color.new(color.white, 90) : na, title = "Bollinger Bands Background Fill")
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Bollinger Bands Background Fill' },
        colors: bars.map(() => (isBB ? bbFill : 'transparent')) },
      // fill(rsiPlot, maPlot, color = enableMA and not na(ma) ? (rsi > ma ? green 80 : red 80) : na,
      //   title = "RSI & RSI MA Fill", display = enableMA ? display.all : display.none)
      { plot1: 'plot0', plot2: 'plot4', options: { title: 'RSI & RSI MA Fill' },
        colors: bars.map((_b, i) => (enableMA && !isNaN(ma[i]) ? (above(i) ? fillGreen : fillRed) : 'transparent')) },
    ],
    markers,
    bgColors,
    visibility: { enableMA, isBB },
    alerts: alertStates(alertConditions, bars, [bullCond, bearCond, hiddenBullCond, hiddenBearCond]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Regular Bullish Divergence', message: 'Regular Bullish Divergence' },
  { id: 'alert1', title: 'Regular Bearish Divergence', message: 'Regular Bearish Divergence' },
  { id: 'alert2', title: 'Hidden Bullish Divergence', message: 'Hidden Bullish Divergence' },
  { id: 'alert3', title: 'Hidden Bearish Divergence', message: 'Hidden Bearish Divergence' },
];

export const RsiGames12 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
