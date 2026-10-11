/**
 * Volume Suite - By Leviathan
 *
 * Six volume views in one pane ("Display"): relative volume (volume / its average over "Relative Length"),
 * cumulative relative volume (the running sum of the relative volume, added on up bars and subtracted on the other
 * bars), volume, buy / sell volume, volume delta (buy - sell) and cumulative volume delta. The cumulative views are
 * candles (from the previous sum to the new one) or a line.
 *
 * Colours: the primary colours by bar direction (by the sign of the delta for the delta views), replaced by three
 * stronger colour pairs when the value passes the three "Large Change Thresholds". The threshold test is one of:
 * "RELATIVE" (value / its average against the multiplier), "SMA" (value against its average over "SMA Length" times
 * multiplier + 1) or "Z-SCORE" ((value - average) / standard deviation over "Z Length" against the multiplier).
 * Two optional "Volume-Price Imbalances" colours (high volume with a small bar range, low volume with a large one,
 * both as z-scores), an optional gradient colouring, optional bar colours, and five optional lines on the price pane
 * (four moving averages of the close and a VWAP of hlc3 anchored on a timeframe, with optional deviation bands).
 *
 * Lower-timeframe limit: the original builds the buy and sell volume of a bar from the bars of the "LTF Timeframe"
 * (default 1 minute): buy volume is the volume of the lower bars that close above their open, sell volume that of
 * the lower bars that close below it. The bars passed to a port are the chart bars only, so the port ESTIMATES
 * them with the same rule on the chart bar itself: all the volume of a bar is buy volume when it closes above its
 * open, sell volume when it closes below, and neither when close = open. So the displays "Buy/Sell Volume",
 * "Volume Delta" and "CVD (Cumulative Volume Delta)" are NOT the values of the original, except when the "LTF
 * Timeframe" is the chart timeframe (then the chart bars are the requested bars and the values are the original
 * ones). Also, the original has lower-timeframe data only on the most recent bars (0 elsewhere), while the port has
 * the estimate on every bar. An "LTF Timeframe" above the chart timeframe throws the error of the original. The
 * displays "Relative Volume" (default), "CRVOL" and "Volume", and the price-pane lines, do not use these values.
 *
 * The plot style inputs of the "Display Settings" group ("Columns" / "Histogram" / "Line") are kept as inputs; the
 * plot configuration is static and has the default style (columns).
 *
 * Reference: "Volume Suite - By Leviathan" by LeviathanCapital
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LeviathanCapital
 */

import { ta, taCore, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, PlotCandleData } from '../types';
import { periodStarts } from '../anchor-period';
import { lowerTimeframe } from '../lower-tf-volume';
import type { ChartContext } from '../chart-context';

type Display = 'Relative Volume' | 'CRVOL (Cumulative Relative Volume)' | 'Volume' | 'Buy/Sell Volume' | 'Volume Delta'
  | 'CVD (Cumulative Volume Delta)';
type MaType = 'SMA' | 'EMA' | 'VWMA';
type PlotStyle = 'Columns' | 'Histogram' | 'Line';

export interface VolumeSuiteByLeviathanInputs {
  disp: Display;
  upcol: string;
  downcol: string;
  showMult1: boolean;
  mult: number;
  upcolMult1: string;
  downcolMult1: string;
  showMult2: boolean;
  mult2: number;
  upcolMult2: string;
  downcolMult2: string;
  showMult3: boolean;
  mult3: number;
  upcolMult3: string;
  downcolMult3: string;
  /** High Volume + Small Price Change */
  showImb1: boolean;
  imb1Col: string;
  vimb1: number;
  pimb1: number;
  /** Low Volume + Large Price Change */
  showImb2: boolean;
  imb2Col: string;
  vimb2: number;
  pimb2: number;
  showPlot1: boolean;
  showPlot2: boolean;
  showPlot3: boolean;
  showPlot4: boolean;
  showPlot5: boolean;
  plot1: MaType;
  plot2: MaType;
  plot3: MaType;
  plot4: MaType;
  plot5: 'VWAP' | 'VWAP & STDEV';
  len1: number;
  len2: number;
  len3: number;
  len4: number;
  /** VWAP anchor timeframe */
  len5: string;
  plot1Col: string;
  plot2Col: string;
  plot3Col: string;
  plot4Col: string;
  plot5Col: string;
  colorCandles: boolean;
  gradient: boolean;
  gr1: string;
  gr2: string;
  /** LTF Timeframe (see the file header) */
  tf: string;
  threshtype: 'SMA' | 'RELATIVE' | 'Z-SCORE';
  zlen: number;
  smalen: number;
  rellen: number;
  vwapstd: number;
  rvDisp: PlotStyle;
  crvDisp: 'Candles' | 'Line';
  bsvDisp: PlotStyle;
  vdDisp: PlotStyle;
  cvdDisp: 'Candles' | 'Line';
}

export const defaultInputs: VolumeSuiteByLeviathanInputs = {
  disp: 'Relative Volume',
  upcol: '#D1D4DC',
  downcol: '#9598A1F5',
  showMult1: true,
  mult: 1.5,
  upcolMult1: '#C8E6C9',
  downcolMult1: '#FAA1A4',
  showMult2: true,
  mult2: 2.5,
  upcolMult2: '#A5D6A7',
  downcolMult2: '#F77C80',
  showMult3: true,
  mult3: 3.5,
  upcolMult3: '#66BB6A',
  downcolMult3: '#F7525F',
  showImb1: false,
  imb1Col: '#FF9800',
  vimb1: 1,
  pimb1: 0,
  showImb2: false,
  imb2Col: '#2962FF',
  vimb2: 0,
  pimb2: 1,
  showPlot1: false,
  showPlot2: false,
  showPlot3: false,
  showPlot4: false,
  showPlot5: false,
  plot1: 'SMA',
  plot2: 'EMA',
  plot3: 'VWMA',
  plot4: 'SMA',
  plot5: 'VWAP',
  len1: 50,
  len2: 50,
  len3: 50,
  len4: 50,
  len5: 'D',
  plot1Col: '#787B86',
  plot2Col: '#787B86',
  plot3Col: '#787B86',
  plot4Col: '#787B86',
  plot5Col: '#787B86',
  colorCandles: false,
  gradient: false,
  gr1: '#F7525F',
  gr2: '#FFE0B2',
  tf: '1',
  threshtype: 'RELATIVE',
  zlen: 50,
  smalen: 300,
  rellen: 20,
  vwapstd: 1,
  rvDisp: 'Columns',
  crvDisp: 'Candles',
  bsvDisp: 'Columns',
  vdDisp: 'Columns',
  cvdDisp: 'Candles',
};

const G2 = 'Large Change Thresholds';
const G3 = 'Volume-Price Imbalances';
const G5 = 'Additional Settings';
const G4 = 'Display Settings';
const G6 = 'Moving Averages';
const SP = ' ';
const MA_TYPES = ['SMA', 'EMA', 'VWMA'];
const STYLES = ['Columns', 'Histogram', 'Line'];

export const inputConfig: InputConfig[] = [
  { id: 'disp', type: 'string', title: 'Display', defval: 'Relative Volume', options: ['Relative Volume', 'CRVOL (Cumulative Relative Volume)', 'Volume', 'Buy/Sell Volume', 'Volume Delta', 'CVD (Cumulative Volume Delta)'] },
  { id: 'upcol', type: 'color', title: `Primary Colors ${SP.repeat(13)}▲`, defval: '#D1D4DC', inline: 'udcol' },
  { id: 'downcol', type: 'color', title: '▼', defval: '#9598A1F5', inline: 'udcol' },
  { id: 'showMult1', type: 'bool', title: '', defval: true, inline: 'mult1', group: G2 },
  { id: 'mult', type: 'float', title: '>', defval: 1.5, step: 0.1, inline: 'mult1', group: G2 },
  { id: 'upcolMult1', type: 'color', title: `${SP.repeat(5)}▲`, defval: '#C8E6C9', inline: 'mult1', group: G2 },
  { id: 'downcolMult1', type: 'color', title: '▼', defval: '#FAA1A4', inline: 'mult1', group: G2 },
  { id: 'showMult2', type: 'bool', title: '', defval: true, inline: 'mult2', group: G2 },
  { id: 'mult2', type: 'float', title: '>', defval: 2.5, step: 0.1, inline: 'mult2', group: G2 },
  { id: 'upcolMult2', type: 'color', title: `${SP.repeat(5)}▲`, defval: '#A5D6A7', inline: 'mult2', group: G2 },
  { id: 'downcolMult2', type: 'color', title: '▼', defval: '#F77C80', inline: 'mult2', group: G2 },
  { id: 'showMult3', type: 'bool', title: '', defval: true, inline: 'mult3', group: G2 },
  { id: 'mult3', type: 'float', title: '>', defval: 3.5, step: 0.1, inline: 'mult3', group: G2 },
  { id: 'upcolMult3', type: 'color', title: `${SP.repeat(5)}▲`, defval: '#66BB6A', inline: 'mult3', group: G2 },
  { id: 'downcolMult3', type: 'color', title: '▼', defval: '#F7525F', inline: 'mult3', group: G2 },
  { id: 'showImb1', type: 'bool', title: 'High Volume + Small Price Change', defval: false, inline: 'imb1', group: G3 },
  { id: 'imb1Col', type: 'color', title: '', defval: '#FF9800', inline: 'imb1', group: G3 },
  { id: 'vimb1', type: 'float', title: 'V >', defval: 1, step: 0.1, inline: 'imb11', group: G3 },
  { id: 'pimb1', type: 'float', title: 'P <', defval: 0, step: 0.1, inline: 'imb11', group: G3 },
  { id: 'showImb2', type: 'bool', title: 'Low Volume + Large Price Change', defval: false, inline: 'imb2', group: G3 },
  { id: 'imb2Col', type: 'color', title: '', defval: '#2962FF', inline: 'imb2', group: G3 },
  { id: 'vimb2', type: 'float', title: 'V <', defval: 0, step: 0.1, inline: 'imb22', group: G3 },
  { id: 'pimb2', type: 'float', title: 'P >', defval: 1, step: 0.1, inline: 'imb22', group: G3 },
  { id: 'showPlot1', type: 'bool', title: '', defval: false, inline: 'pl1', group: G6 },
  { id: 'showPlot2', type: 'bool', title: '', defval: false, inline: 'pl2', group: G6 },
  { id: 'showPlot3', type: 'bool', title: '', defval: false, inline: 'pl3', group: G6 },
  { id: 'showPlot4', type: 'bool', title: '', defval: false, inline: 'pl4', group: G6 },
  { id: 'showPlot5', type: 'bool', title: '', defval: false, inline: 'pl5', group: G6 },
  { id: 'plot1', type: 'string', title: '', defval: 'SMA', options: MA_TYPES, inline: 'pl1', group: G6 },
  { id: 'plot2', type: 'string', title: '', defval: 'EMA', options: MA_TYPES, inline: 'pl2', group: G6 },
  { id: 'plot3', type: 'string', title: '', defval: 'VWMA', options: MA_TYPES, inline: 'pl3', group: G6 },
  { id: 'plot4', type: 'string', title: '', defval: 'SMA', options: MA_TYPES, inline: 'pl4', group: G6 },
  { id: 'plot5', type: 'string', title: '', defval: 'VWAP', options: ['VWAP', 'VWAP & STDEV'], inline: 'pl5', group: G6 },
  { id: 'len1', type: 'int', title: '', defval: 50, inline: 'pl1', group: G6 },
  { id: 'len2', type: 'int', title: '', defval: 50, inline: 'pl2', group: G6 },
  { id: 'len3', type: 'int', title: '', defval: 50, inline: 'pl3', group: G6 },
  { id: 'len4', type: 'int', title: '', defval: 50, inline: 'pl4', group: G6 },
  { id: 'len5', type: 'timeframe', title: '', defval: 'D', inline: 'pl5', group: G6 },
  { id: 'plot1Col', type: 'color', title: '', defval: '#787B86', inline: 'pl1', group: G6 },
  { id: 'plot2Col', type: 'color', title: '', defval: '#787B86', inline: 'pl2', group: G6 },
  { id: 'plot3Col', type: 'color', title: '', defval: '#787B86', inline: 'pl3', group: G6 },
  { id: 'plot4Col', type: 'color', title: '', defval: '#787B86', inline: 'pl4', group: G6 },
  { id: 'plot5Col', type: 'color', title: '', defval: '#787B86', inline: 'pl5', group: G6 },
  { id: 'colorCandles', type: 'bool', title: 'Color Candles', defval: false, group: G5 },
  { id: 'gradient', type: 'bool', title: 'Gradient Coloring', defval: false, inline: 'g', group: G5 },
  { id: 'gr1', type: 'color', title: '', defval: '#F7525F', inline: 'g', group: G5 },
  { id: 'gr2', type: 'color', title: '', defval: '#FFE0B2', inline: 'g', group: G5 },
  { id: 'tf', type: 'timeframe', title: 'LTF Timeframe', defval: '1', group: G5 },
  { id: 'threshtype', type: 'string', title: 'Threshold Calculation Type', defval: 'RELATIVE', options: ['SMA', 'RELATIVE', 'Z-SCORE'], group: G5 },
  { id: 'zlen', type: 'int', title: 'Z Length', defval: 50, group: G5 },
  { id: 'smalen', type: 'int', title: 'SMA Length', defval: 300, group: G5 },
  { id: 'rellen', type: 'int', title: 'Relative Length', defval: 20, group: G5 },
  { id: 'vwapstd', type: 'int', title: 'VWAP SD Multiplier', defval: 1, group: G5 },
  { id: 'rvDisp', type: 'string', title: 'Relative Volume', defval: 'Columns', options: STYLES, group: G4 },
  { id: 'crvDisp', type: 'string', title: 'Cumulative Relative Volume', defval: 'Candles', options: ['Candles', 'Line'], group: G4 },
  { id: 'bsvDisp', type: 'string', title: 'Buy/Sell Volume', defval: 'Columns', options: STYLES, group: G4 },
  { id: 'vdDisp', type: 'string', title: 'Volume Delta', defval: 'Columns', options: STYLES, group: G4 },
  { id: 'cvdDisp', type: 'string', title: 'CVD', defval: 'Candles', options: ['Candles', 'Line'], group: G4 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'CRVOL', color: '#2962FF', lineWidth: 1 },
  { id: 'plot1', title: 'CVD', color: '#2962FF', lineWidth: 1 },
  { id: 'plot2', title: 'RVOL', color: '#2962FF', lineWidth: 1, style: 'columns' },
  { id: 'plot3', title: 'VOL', color: '#2962FF', lineWidth: 1, style: 'columns' },
  { id: 'plot4', title: 'Buy Volume', color: '#2962FF', lineWidth: 1, style: 'columns' },
  { id: 'plot5', title: 'Sell Volume', color: '#2962FF', lineWidth: 1, style: 'columns' },
  { id: 'plot6', title: 'Volume Delta', color: '#2962FF', lineWidth: 1, style: 'columns' },
  { id: 'plot7', title: 'Plot 1', color: '#787B86', lineWidth: 1, forceOverlay: true },
  { id: 'plot8', title: 'Plot 2', color: '#787B86', lineWidth: 1, forceOverlay: true },
  { id: 'plot9', title: 'Plot 3', color: '#787B86', lineWidth: 1, forceOverlay: true },
  { id: 'plot10', title: 'Plot 4', color: '#787B86', lineWidth: 1, forceOverlay: true },
  { id: 'plot11', title: 'VWAP', color: '#787B86', lineWidth: 1, forceOverlay: true },
  { id: 'plot12', title: 'VWAP +SD', color: '#787B86', lineWidth: 1, forceOverlay: true },
  { id: 'plot13', title: 'VWAP -SD', color: '#787B86', lineWidth: 1, forceOverlay: true },
];

export const metadata = {
  title: 'Volume Suite - By Leviathan',
  shortTitle: 'Volume Suite - By Leviathan',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

const CRVOL = 'CRVOL (Cumulative Relative Volume)';
const CVD = 'CVD (Cumulative Volume Delta)';

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeSuiteByLeviathanInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { barColors: BarColorData[]; plotCandles: Record<string, PlotCandleData[]> } {
  const cfg = { ...defaultInputs, ...inputs };
  const { disp, threshtype } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const sma = (a: number[], length: number) => A(ta.sma(S(a), length));

  // f_mult1 / f_mult2 / f_mult3: ta.sma(src, smalen) * (multiplier + 1)
  const fMult = (a: number[], m: number) => sma(a, cfg.smalen).map((v) => v * (m + 1));
  // f_relative: a plain division (x / 0 is +-infinity, 0 / 0 na)
  const fRelative = (a: number[]) => {
    const mean = sma(a, cfg.rellen);
    return a.map((v, i) => v / mean[i]);
  };
  const fZscore = (a: number[]) => {
    const mean = sma(a, cfg.zlen);
    const std = A(ta.stdev(S(a), cfg.zlen));
    return a.map((v, i) => (v - mean[i]) / std[i]);
  };
  const tiers = [
    { show: cfg.showMult1, mult: cfg.mult, up: cfg.upcolMult1, down: cfg.downcolMult1 },
    { show: cfg.showMult2, mult: cfg.mult2, up: cfg.upcolMult2, down: cfg.downcolMult2 },
    { show: cfg.showMult3, mult: cfg.mult3, up: cfg.upcolMult3, down: cfg.downcolMult3 },
  ];
  /** One series per threshold */
  const perTier = (a: number[], factor: number[] = [1, 1, 1]) => tiers.map((t, k) => fMult(a, t.mult).map((v) => v * factor[k]));

  // Volume calculations
  const vol = bars.map((b) => b.volume ?? NaN);
  // Relative volume and cumulative relative volume
  const rvol = fRelative(vol);
  const obv = A(ta.cum(S(rvol.map((v, i) => (gt(bars[i].close, bars[i].open) ? v : -v)))));

  // Volume delta, CVD, buy / sell volume: request.security_lower_tf(syminfo.tickerid, tf, ...) of the original
  // (its error when the timeframe is above the chart timeframe). The chart bars stand for the lower bars: the
  // original values when the timeframe is the chart timeframe, else the estimate of the port (see the file header).
  lowerTimeframe(bars, true, cfg.tf, chart);
  const buyVol = bars.map((b) => (gt(b.close, b.open) ? (b.volume ?? NaN) : 0));
  const sellVol = bars.map((b) => (lt(b.close, b.open) ? (b.volume ?? NaN) : 0));
  const deltaVol = buyVol.map((v, i) => v - sellVol[i]);
  const cumDeltaVol = A(ta.cum(S(deltaVol)));
  const posDelta = deltaVol.map((v) => (gt(v, 0) ? v : 0));
  const negDelta = deltaVol.map((v) => (lt(v, 0) ? v : 0));

  // Series of the selected display and threshold type only (every one is computed on every bar in the original)
  const isVol = disp === 'Volume';
  const isRv = disp === CRVOL || disp === 'Relative Volume';
  const isVd = disp === 'Volume Delta' || disp === CVD;
  const isBs = disp === 'Buy/Sell Volume';
  const none: number[][] = [];
  const smaType = threshtype === 'SMA';
  const relType = threshtype === 'RELATIVE';
  const zType = threshtype === 'Z-SCORE';
  const volSma = smaType && isVol ? perTier(vol) : none;
  const rvolSma = smaType && isRv ? perTier(rvol) : none;
  const vdpSma = smaType && isVd ? perTier(posDelta, [2, 3, 7]) : none;
  const vdnSma = smaType && isVd ? perTier(negDelta, [2, 3, 7]) : none;
  const bvlSma = smaType && isBs ? perTier(buyVol) : none;
  const svlSma = smaType && isBs ? perTier(sellVol) : none;
  const relVol = relType && isVol ? fRelative(vol) : [];
  const rposdelta = isVd && !smaType ? fRelative(posDelta) : [];
  const rnegdelta = isVd && !smaType ? fRelative(negDelta) : [];
  const relBuy = relType && isBs ? fRelative(buyVol) : [];
  const relSell = relType && isBs ? fRelative(sellVol) : [];
  const zVol = zType && isVol ? fZscore(vol) : [];
  const zRvol = zType && isRv ? fZscore(rvol) : [];
  const zPos = zType && isVd ? fZscore(rposdelta) : [];
  const zNeg = zType && isVd ? fZscore(rnegdelta) : [];
  const zBuy = zType && isBs ? fZscore(buyVol) : [];
  const zSell = zType && isBs ? fZscore(sellVol) : [];

  // Imbalances: z-score of the displayed value (switch_src) and of the bar range
  const anyImb = cfg.showImb1 || cfg.showImb2;
  const zSrc = anyImb ? fZscore(isVol ? vol : isRv ? rvol : deltaVol.map(Math.abs)) : [];
  const zRange = anyImb ? fZscore(bars.map((b) => b.high - b.low)) : [];

  // Gradient colouring over the last 50 bars
  const GLEN = 50;
  const hi = (a: number[]) => A(ta.highest(S(a), GLEN));
  const volHi = cfg.gradient ? hi(vol) : [];
  const rvolHi = cfg.gradient ? hi(rvol) : [];
  const deltaHi = cfg.gradient ? hi(deltaVol) : [];
  const deltaLo = cfg.gradient ? A(ta.lowest(S(deltaVol), GLEN)) : [];
  const buyHi = cfg.gradient ? hi(buyVol) : [];
  const sellHi = cfg.gradient ? hi(sellVol) : [];
  const grad = (v: number, lo: number, top: number): string | null => {
    if (isNaN(v) || isNaN(lo) || isNaN(top)) return null;
    return String(color.from_gradient(v, lo, top, cfg.gr2, cfg.gr1));
  };

  // color bar_col = color.rgb(0, 0, 0, 100); barcolor(color_candles and bar_col != color.rgb(0, 0, 0, 100) ? ...)
  const BLANK = String(color.rgb(0, 0, 0, 100));
  const isBlank = (c: string) => color.r(c) === 0 && color.g(c) === 0 && color.b(c) === 0 && color.t(c) === 100;
  const css = (c: string | null) => c ?? 'transparent';

  const crvCandles: PlotCandleData[] = [];
  const cvdCandles: PlotCandleData[] = [];
  const barColors: BarColorData[] = [];
  const colV: string[] = [];
  const colVd: string[] = [];
  const colCrv: string[] = [];
  const colBv: string[] = [];
  const colSv: string[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const up = gt(b.close, b.open);
    const delta = deltaVol[i];
    let V: string | null = up ? cfg.upcol : cfg.downcol;
    let VD: string | null = gt(delta, 0) ? cfg.upcol : cfg.downcol;
    let CRV: string | null = up ? cfg.upcol : cfg.downcol;
    let BV: string | null = cfg.upcol;
    let SV: string | null = cfg.downcol;
    let barCol = BLANK;

    tiers.forEach((t, k) => {
      if (!t.show || !isVol) return;
      const hit = smaType ? ge(vol[i], volSma[k][i]) : relType ? gt(relVol[i], t.mult) : ge(zVol[i], t.mult);
      if (hit) {
        V = up ? t.up : t.down;
        barCol = V;
      }
    });
    tiers.forEach((t, k) => {
      if (!t.show || !isRv) return;
      const hit = smaType ? ge(rvol[i], rvolSma[k][i]) : relType ? ge(rvol[i], t.mult) : ge(zRvol[i], t.mult);
      if (hit) {
        CRV = up ? t.up : t.down;
        barCol = CRV;
      }
    });
    if (isVd) {
      tiers.forEach((t, k) => {
        if (!t.show || !gt(delta, 0)) return;
        const hit = smaType ? gt(delta, vdpSma[k][i]) : relType ? gt(rposdelta[i], t.mult * 1.5) : ge(zPos[i], t.mult);
        if (hit) {
          VD = t.up;
          barCol = VD;
        }
      });
      tiers.forEach((t, k) => {
        if (!t.show || !lt(delta, 0)) return;
        const hit = smaType ? lt(delta, vdnSma[k][i]) : relType ? lt(-rnegdelta[i], -t.mult * 1.5) : ge(zNeg[i], t.mult);
        if (hit) {
          VD = t.down;
          barCol = VD;
        }
      });
    }
    if (isBs) {
      tiers.forEach((t, k) => {
        if (!t.show) return;
        const hit = smaType ? gt(buyVol[i], bvlSma[k][i]) : relType ? gt(relBuy[i], t.mult) : ge(zBuy[i], t.mult);
        if (hit) {
          BV = t.up;
          barCol = BV;
        }
      });
      tiers.forEach((t, k) => {
        if (!t.show) return;
        const hit = smaType ? gt(sellVol[i], svlSma[k][i]) : relType ? ge(relSell[i], t.mult) : ge(zSell[i], t.mult);
        if (hit) {
          SV = t.down;
          barCol = SV;
        }
      });
    }

    if (cfg.showImb1 && gt(zSrc[i], cfg.vimb1) && lt(zRange[i], cfg.pimb1)) {
      V = CRV = VD = cfg.imb1Col;
      BV = gt(buyVol[i], sellVol[i]) ? cfg.imb1Col : null;
      SV = gt(sellVol[i], buyVol[i]) ? cfg.imb1Col : null;
      barCol = cfg.imb1Col;
    }
    if (cfg.showImb2 && lt(zSrc[i], cfg.vimb2) && gt(zRange[i], cfg.pimb2)) {
      V = CRV = VD = cfg.imb2Col;
      BV = lt(buyVol[i], sellVol[i]) ? cfg.imb2Col : null;
      SV = lt(sellVol[i], buyVol[i]) ? cfg.imb2Col : null;
      barCol = cfg.imb2Col;
    }

    if (cfg.gradient) {
      V = grad(vol[i], 0, volHi[i]);
      CRV = grad(rvol[i], 0, rvolHi[i]);
      VD = grad(delta, deltaLo[i], deltaHi[i]);
      BV = grad(buyVol[i], 0, buyHi[i]);
      SV = grad(sellVol[i], 0, sellHi[i]);
    }
    colV.push(css(V));
    colVd.push(css(VD));
    colCrv.push(css(CRV));
    colBv.push(css(BV));
    colSv.push(css(SV));

    // Cumulative candles: open = the sum of the bar before, high = low = close = the sum
    const candle = (list: PlotCandleData[], sum: number[], c: string) => {
      const o = i > 0 ? sum[i - 1] : NaN;
      if (!Number.isFinite(o) || !Number.isFinite(sum[i])) return; // no candle when a value is na
      list.push({ time: b.time, open: o, high: sum[i], low: sum[i], close: sum[i], color: c, wickColor: c, borderColor: c });
    };
    if (disp === CRVOL && cfg.crvDisp === 'Candles') candle(crvCandles, obv, css(CRV));
    if (disp === CVD && cfg.cvdDisp === 'Candles') candle(cvdCandles, cumDeltaVol, css(VD));

    if (cfg.colorCandles && !isBlank(barCol)) barColors.push({ time: b.time, color: barCol });
  }

  // Moving averages of the close on the price pane
  const close = new Series(bars, (b) => b.close);
  const volumeSeries = S(vol);
  const fPlots = (show: boolean, type: MaType, length: number): number[] => {
    if (!show) return new Array<number>(n).fill(NaN);
    if (type === 'SMA') return A(ta.sma(close, length));
    if (type === 'EMA') return A(ta.ema(close, length));
    if (type === 'VWMA') return A(ta.vwma(close, length, volumeSeries));
    return new Array<number>(n).fill(NaN); // a switch without a matching case gives na
  };

  // [vwap, vwapSDu, vwapSDl] = ta.vwap(hlc3, timeframe.change(len5), vwapstd): the sums restart on each bar that
  // opens a period of the anchor timeframe; na before the first such bar (timeframe.change is false on bar 0)
  let vwap: number[] = new Array<number>(n).fill(NaN);
  let vwapUp: number[] = vwap;
  let change: boolean[] = [];
  if (cfg.showPlot5) {
    const starts = periodStarts(bars, cfg.len5, chart);
    change = starts.map((t, i) => i > 0 && t !== starts[i - 1]);
    const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
    const [v, u] = taCore.vwap(hlc3, vol, change, cfg.vwapstd);
    vwap = Array.from(v, (x) => x ?? NaN);
    vwapUp = Array.from(u, (x) => x ?? NaN);
  }
  const withBands = cfg.showPlot5 && cfg.plot5 === 'VWAP & STDEV';

  const line = (values: number[], colors: (i: number) => string) => bars.map((b, i) => ({
    time: b.time, value: Number.isFinite(values[i]) ? values[i] : NaN, color: colors(i),
  }));
  const off = new Array<number>(n).fill(NaN);
  const vwapColor = (i: number) => (change[i] ? 'transparent' : cfg.plot5Col);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(disp === CRVOL && cfg.crvDisp === 'Line' ? obv : off, (i) => colCrv[i]),
      plot1: line(disp === CVD && cfg.cvdDisp === 'Line' ? cumDeltaVol : off, (i) => colVd[i]),
      plot2: line(disp === 'Relative Volume' ? rvol : off, (i) => colCrv[i]),
      plot3: line(isVol ? vol : off, (i) => colV[i]),
      plot4: line(isBs ? buyVol : off, (i) => colBv[i]),
      plot5: line(isBs ? sellVol.map((v) => -v) : off, (i) => colSv[i]),
      plot6: line(disp === 'Volume Delta' ? deltaVol : off, (i) => colVd[i]),
      plot7: line(fPlots(cfg.showPlot1, cfg.plot1, cfg.len1), () => cfg.plot1Col),
      plot8: line(fPlots(cfg.showPlot2, cfg.plot2, cfg.len2), () => cfg.plot2Col),
      plot9: line(fPlots(cfg.showPlot3, cfg.plot3, cfg.len3), () => cfg.plot3Col),
      plot10: line(fPlots(cfg.showPlot4, cfg.plot4, cfg.len4), () => cfg.plot4Col),
      plot11: line(vwap, vwapColor),
      // vwapSDbu = vwap + (vwapSDu - vwap), vwapSDbl = vwap - (vwapSDu - vwap)
      plot12: line(withBands ? vwap.map((v, i) => v + (vwapUp[i] - v)) : off, vwapColor),
      plot13: line(withBands ? vwap.map((v, i) => v - (vwapUp[i] - v)) : off, vwapColor),
    },
    barColors,
    plotCandles: { crvol: crvCandles, cvd: cvdCandles },
  };
}

export const VolumeSuiteByLeviathan = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
