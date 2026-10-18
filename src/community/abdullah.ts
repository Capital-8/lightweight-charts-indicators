/**
 * 3-in-1 Combined Indicator (published as "Abdullah")
 *
 * Three indicators in one overlay:
 * 1. ZLSMA: lsma = linreg(src, length, offset), zlsma = 2 * lsma - linreg(lsma, length, offset).
 * 2. Chandelier Exit: long stop = highest(close or high, length) - mult * ATR, kept from falling while the
 *    previous close stays above it; short stop = lowest(close or low, length) + mult * ATR, kept from rising while
 *    the previous close stays below it. The direction turns long when the close goes above the previous short stop,
 *    short when it goes below the previous long stop; Buy / Sell labels at the turns and a state fill to ohlc4.
 * 3. EMA of the source, with an optional smoothing moving average (SMA, EMA, RMA, WMA, VWMA) of the EMA and
 *    optional Bollinger Bands around the SMA.
 *
 * Reference: "3-in-1 Combined Indicator v6" by royalsherry888
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, getSourceSeries, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';

export type AbdullahMaType = 'None' | 'SMA' | 'SMA + Bollinger Bands' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';

export interface AbdullahInputs {
  /** ZLSMA length */
  zlsmaLength: number;
  /** ZLSMA linreg offset */
  zlsmaOffset: number;
  zlsmaSrc: SourceType;
  /** Chandelier Exit ATR period */
  ceLength: number;
  /** Chandelier Exit ATR multiplier */
  ceMult: number;
  /** Use the close for the extremums (else high / low) */
  ceUseClose: boolean;
  ceShowLabels: boolean;
  ceHighlightState: boolean;
  emaLength: number;
  emaSrc: SourceType;
  /** Plot offset of the EMA (bars) */
  emaOffset: number;
  /** Smoothing moving average type of the EMA */
  maType: AbdullahMaType;
  maLength: number;
  /** Bollinger Bands standard deviation multiplier */
  bbMult: number;
}

export const defaultInputs: AbdullahInputs = {
  zlsmaLength: 32,
  zlsmaOffset: 0,
  zlsmaSrc: 'close',
  ceLength: 22,
  ceMult: 3.0,
  ceUseClose: true,
  ceShowLabels: true,
  ceHighlightState: true,
  emaLength: 9,
  emaSrc: 'close',
  emaOffset: 0,
  maType: 'None',
  maLength: 14,
  bbMult: 2.0,
};

const ZLSMA_GROUP = '1. ZLSMA - Zero Lag LSMA';
const CE_CALC_GROUP = '2. Chandelier Exit - Calculation';
const CE_VISUAL_GROUP = '2. Chandelier Exit - Visuals';
const EMA_GROUP = '3. EMA';
const EMA_SMOOTH_GROUP = '3. EMA - Smoothing';

export const inputConfig: InputConfig[] = [
  { id: 'zlsmaLength', type: 'int', title: 'Length', defval: 32, group: ZLSMA_GROUP },
  { id: 'zlsmaOffset', type: 'int', title: 'Offset', defval: 0, group: ZLSMA_GROUP },
  { id: 'zlsmaSrc', type: 'source', title: 'Source', defval: 'close', group: ZLSMA_GROUP },
  { id: 'ceLength', type: 'int', title: 'ATR Period', defval: 22, group: CE_CALC_GROUP },
  { id: 'ceMult', type: 'float', title: 'ATR Multiplier', defval: 3.0, step: 0.1, group: CE_CALC_GROUP },
  { id: 'ceUseClose', type: 'bool', title: 'Use Close Price for Extremums', defval: true, group: CE_CALC_GROUP },
  { id: 'ceShowLabels', type: 'bool', title: 'Show Buy/Sell Labels', defval: true, group: CE_VISUAL_GROUP },
  { id: 'ceHighlightState', type: 'bool', title: 'Highlight State', defval: true, group: CE_VISUAL_GROUP },
  { id: 'emaLength', type: 'int', title: 'Length', defval: 9, min: 1, group: EMA_GROUP },
  { id: 'emaSrc', type: 'source', title: 'Source', defval: 'close', group: EMA_GROUP },
  { id: 'emaOffset', type: 'int', title: 'Offset', defval: 0, min: -500, max: 500, group: EMA_GROUP },
  { id: 'maType', type: 'string', title: 'Type', defval: 'None', group: EMA_SMOOTH_GROUP,
    options: ['None', 'SMA', 'SMA + Bollinger Bands', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] },
  { id: 'maLength', type: 'int', title: 'Length', defval: 14, group: EMA_SMOOTH_GROUP },
  { id: 'bbMult', type: 'float', title: 'BB StdDev', defval: 2.0, min: 0.001, max: 50, step: 0.5, group: EMA_SMOOTH_GROUP,
    tooltip: "Only applies when 'SMA + Bollinger Bands' is selected. Determines the distance between the SMA and the bands." },
];

const LONG_FILL = String(color.new(color.green, 85));
const SHORT_FILL = String(color.new(color.red, 85));
const BB_FILL = String(color.new(color.green, 90));

// display = enableMA / isBB ? display.all : display.none: PlotConfig `visible` = result.visibility entry
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ZLSMA', color: color.yellow, lineWidth: 3 },
  { id: 'plot1', title: 'Long Stop', color: color.green, lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'Short Stop', color: color.red, lineWidth: 2, style: 'linebr' },
  { id: 'plot3', title: 'CE Mid Price', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'EMA', color: color.blue, lineWidth: 1 },
  { id: 'plot5', title: 'EMA-based MA', color: color.yellow, lineWidth: 1, visible: 'enableMA' },
  { id: 'plot6', title: 'Upper Bollinger Band', color: color.green, lineWidth: 1, visible: 'isBB' },
  { id: 'plot7', title: 'Lower Bollinger Band', color: color.green, lineWidth: 1, visible: 'isBB' },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill0', plot1: 'plot3', plot2: 'plot1', color: LONG_FILL, title: 'Long State Filling' },
  { id: 'fill1', plot1: 'plot3', plot2: 'plot2', color: SHORT_FILL, title: 'Short State Filling' },
  { id: 'fill2', plot1: 'plot6', plot2: 'plot7', color: BB_FILL, title: 'Bollinger Bands Background Fill', visible: 'isBB' },
];

export const metadata = {
  title: '3-in-1 Combined Indicator v6',
  shortTitle: '3-in-1 v6',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<AbdullahInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; visibility: Record<string, boolean> } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const t = (i: number) => bars[i].time;

  // 1. ZLSMA
  const lsma = A(ta.linreg(getSourceSeries(bars, cfg.zlsmaSrc), cfg.zlsmaLength, cfg.zlsmaOffset));
  const lsma2 = A(ta.linreg(S(lsma), cfg.zlsmaLength, cfg.zlsmaOffset));
  const zlsma = lsma.map((v, i) => v + (v - lsma2[i]));

  // 2. Chandelier Exit
  const atr = A(ta.atr(bars, cfg.ceLength));
  const close = S(bars.map((b) => b.close));
  const hi = A(ta.highest(cfg.ceUseClose ? close : S(bars.map((b) => b.high)), cfg.ceLength));
  const lo = A(ta.lowest(cfg.ceUseClose ? close : S(bars.map((b) => b.low)), cfg.ceLength));
  const longStop: number[] = new Array(n);
  const shortStop: number[] = new Array(n);
  const dir: number[] = new Array(n);
  const markers: MarkerData[] = [];
  let ceDir = 1; // var int ce_dir = 1
  for (let i = 0; i < n; i++) {
    const ceAtr = cfg.ceMult * atr[i];
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    let ls = hi[i] - ceAtr;
    // longStopPrev = nz(longStop[1], longStop)
    const lsPrev = i > 0 && !isNaN(longStop[i - 1]) ? longStop[i - 1] : ls;
    ls = gt(prevClose, lsPrev) ? Math.max(ls, lsPrev) : ls;
    let ss = lo[i] + ceAtr;
    const ssPrev = i > 0 && !isNaN(shortStop[i - 1]) ? shortStop[i - 1] : ss;
    ss = lt(prevClose, ssPrev) ? Math.min(ss, ssPrev) : ss;
    longStop[i] = ls;
    shortStop[i] = ss;
    const c = bars[i].close;
    ceDir = gt(c, ssPrev) ? 1 : lt(c, lsPrev) ? -1 : ceDir;
    dir[i] = ceDir;

    // ce_dir[1] is na on bar 0: no signal
    const buySignal = i > 0 && ceDir === 1 && dir[i - 1] === -1;
    const sellSignal = i > 0 && ceDir === -1 && dir[i - 1] === 1;
    // plotshape(buySignal ? longStop : na, 'Long Stop Start', location.absolute, shape.circle, size.tiny, green)
    if (buySignal && !isNaN(ls)) {
      markers.push({ time: t(i), position: 'atPriceMiddle', price: ls, shape: 'circle', color: color.green, size: 'tiny', id: 'shape0' });
    }
    // plotshape(buySignal and ce_showLabels ? longStop : na, 'Buy Label', text = 'Buy', shape.labelup, size.tiny)
    if (buySignal && cfg.ceShowLabels && !isNaN(ls)) {
      markers.push({ time: t(i), position: 'atPriceBottom', price: ls, shape: 'labelUp', color: color.green,
        text: 'Buy', textColor: color.white, size: 'tiny', id: 'shape1' });
    }
    if (sellSignal && !isNaN(ss)) {
      // plotshape(sellSignal ? shortStop : na, 'Short Stop Start', ...) / 'Sell Label'
      markers.push({ time: t(i), position: 'atPriceMiddle', price: ss, shape: 'circle', color: color.red, size: 'tiny', id: 'shape2' });
    }
    if (sellSignal && cfg.ceShowLabels && !isNaN(ss)) {
      markers.push({ time: t(i), position: 'atPriceTop', price: ss, shape: 'labelDown', color: color.red,
        text: 'Sell', textColor: color.white, size: 'tiny', id: 'shape3' });
    }
  }

  // 3. EMA and its smoothing
  const emaOut = A(ta.ema(getSourceSeries(bars, cfg.emaSrc), cfg.emaLength));
  const isBB = cfg.maType === 'SMA + Bollinger Bands';
  const enableMA = cfg.maType !== 'None';
  const emaS = S(emaOut);
  let smoothingMA: number[] = new Array(n).fill(NaN);
  if (enableMA) {
    switch (cfg.maType) {
      case 'SMA':
      case 'SMA + Bollinger Bands': smoothingMA = A(ta.sma(emaS, cfg.maLength)); break;
      case 'EMA': smoothingMA = A(ta.ema(emaS, cfg.maLength)); break;
      case 'SMMA (RMA)': smoothingMA = A(ta.rma(emaS, cfg.maLength)); break;
      case 'WMA': smoothingMA = A(ta.wma(emaS, cfg.maLength)); break;
      case 'VWMA': smoothingMA = A(ta.vwma(emaS, cfg.maLength, S(bars.map((b) => b.volume ?? NaN)))); break;
    }
  }
  const smoothingStDev = isBB ? A(ta.stdev(emaS, cfg.maLength)).map((v) => v * cfg.bbMult) : new Array<number>(n).fill(NaN);

  const P = (f: (i: number) => number, col?: string): Point[] =>
    bars.map((b, i) => (col === undefined ? { time: b.time, value: f(i) } : { time: b.time, value: f(i), color: col }));
  // plot(ema_out, offset = ema_offset): the value of bar i is drawn on bar i + offset
  const interval = barInterval(bars);
  const emaPlot: Point[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + cfg.emaOffset;
    if (j < 0) continue;
    emaPlot.push({ time: barTime(bars, j, interval), value: emaOut[i], color: color.blue });
  }

  const ohlc4 = A(getSourceSeries(bars, 'ohlc4'));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P((i) => zlsma[i], color.yellow),
      plot1: P((i) => (dir[i] === 1 ? longStop[i] : NaN), color.green),
      plot2: P((i) => (dir[i] === 1 ? NaN : shortStop[i]), color.red),
      plot3: P((i) => ohlc4[i]),
      plot4: emaPlot,
      plot5: P((i) => smoothingMA[i], color.yellow),
      plot6: P((i) => smoothingMA[i] + smoothingStDev[i], color.green),
      plot7: P((i) => smoothingMA[i] - smoothingStDev[i], color.green),
    },
    fills: [
      // fill(midPricePlot, longStopPlot, color = ce_highlightState and ce_dir == 1 ? longFill : na)
      { plot1: 'plot3', plot2: 'plot1', options: { title: 'Long State Filling' },
        colors: dir.map((d) => (cfg.ceHighlightState && d === 1 ? LONG_FILL : 'transparent')) },
      { plot1: 'plot3', plot2: 'plot2', options: { title: 'Short State Filling' },
        colors: dir.map((d) => (cfg.ceHighlightState && d === -1 ? SHORT_FILL : 'transparent')) },
      // fill(bbUpperBand, bbLowerBand, color = isBB ? color.new(color.green, 90) : na)
      { plot1: 'plot6', plot2: 'plot7', options: { title: 'Bollinger Bands Background Fill' },
        colors: new Array<string>(n).fill(isBB ? BB_FILL : 'transparent') },
    ],
    markers,
    visibility: { enableMA, isBB },
  };
}

export const Abdullah = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  fillConfig,
};
