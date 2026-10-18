/**
 * ALL-IN-ONE RSI System (Cloud Divergence Stoch RSI CM WVF)
 *
 * RSI of the source with an EMA base line. A cloud between RSI and base is coloured by the RSI zone: purple at or
 * below the extreme oversold level, red at or below the oversold start, blue at or above the extreme overbought
 * level, green at or above the overbought start. Stochastic RSI %K (SMA of the RSI position in its range) and %D
 * (SMA of %K). BUY labels on RSI crosses over the oversold start or the extreme oversold level, SELL labels on RSI
 * crosses under the overbought start or the extreme overbought level (optionally confirmed by a Stoch RSI cross).
 * Regular and hidden RSI divergences on RSI pivots (drawn on the pivot bars). The CM Williams Vix Fix
 * ((highest close - low) / highest close * 100) is drawn as a histogram shifted down by the vertical shift, green
 * when it reaches its upper Bollinger band or the percentile high of its range, with optional range and band lines.
 *
 * Reference: "ALL-IN-ONE RSI System (Cloud Divergence Stoch RSI CM WVF)" by ethem11
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface AllInOneRsiSystemInputs {
  rsiLen: number;
  src: SourceType;
  /** RSI base EMA length */
  baseLen: number;
  /** Oversold start (red cloud at or below) */
  osStart: number;
  /** Extreme oversold (purple cloud at or below) */
  osExtreme: number;
  /** Overbought start (green cloud at or above) */
  obStart: number;
  /** Extreme overbought (blue cloud at or above) */
  obExtreme: number;
  showCloud: boolean;
  /** Cloud transparency (0 = strong) */
  cloudOp: number;
  showBuySell: boolean;
  /** BUY / SELL need a Stoch RSI cross (%K over %D below 20 / under %D above 80) */
  buySellUseStoch: boolean;
  buyOnExtremeOS: boolean;
  sellOnExtremeOB: boolean;
  buyOnPurpleExit: boolean;
  sellOnBlueExit: boolean;
  showStoch: boolean;
  stochLen: number;
  kLen: number;
  dLen: number;
  rsiColor: string;
  baseColor: string;
  cloudBullColor: string;
  cloudBearColor: string;
  cloudExtremeOS: string;
  cloudExtremeOB: string;
  bgBandColor: string;
  bgBandOpacity: number;
  stochKColor: string;
  stochDColor: string;
  stochLineOpacity: number;
  buyColor: string;
  sellColor: string;
  labelTextColor: string;
  bullDivColor: string;
  bearDivColor: string;
  hiddenBullDivColor: string;
  hiddenBearDivColor: string;
  wvfSpikeColor: string;
  wvfNormalColor: string;
  wvfRangeColor: string;
  wvfBandColor: string;
  /** Pivot lookback right */
  lbR: number;
  /** Pivot lookback left */
  lbL: number;
  /** Max of lookback range */
  rangeUpper: number;
  /** Min of lookback range */
  rangeLower: number;
  plotBull: boolean;
  plotHiddenBull: boolean;
  plotBear: boolean;
  plotHiddenBear: boolean;
  showWVF: boolean;
  /** WVF lookback of the highest close */
  pd: number;
  /** WVF Bollinger band length */
  bbl: number;
  /** WVF Bollinger band standard deviations */
  mult: number;
  /** WVF lookback of the percentile range */
  lb: number;
  /** WVF highest percentile */
  ph: number;
  /** WVF lowest percentile */
  pl: number;
  /** Show the WVF range lines */
  hp: boolean;
  /** Show the WVF band lines */
  sd: boolean;
  /** WVF vertical shift (histogram base) */
  wvfBase: number;
}

const RSI_COL = String(color.rgb(41, 98, 255));
const BASE_COL = String(color.new(color.gray, 80));
const HIDDEN_BULL_COL = String(color.new(color.green, 80));
const HIDDEN_BEAR_COL = String(color.new(color.red, 80));

export const defaultInputs: AllInOneRsiSystemInputs = {
  rsiLen: 14,
  src: 'close',
  baseLen: 14,
  osStart: 44.0,
  osExtreme: 25.0,
  obStart: 70.0,
  obExtreme: 85.0,
  showCloud: true,
  cloudOp: 55,
  showBuySell: true,
  buySellUseStoch: false,
  buyOnExtremeOS: true,
  sellOnExtremeOB: true,
  buyOnPurpleExit: true,
  sellOnBlueExit: true,
  showStoch: true,
  stochLen: 14,
  kLen: 3,
  dLen: 3,
  rsiColor: RSI_COL,
  baseColor: BASE_COL,
  cloudBullColor: color.lime,
  cloudBearColor: color.red,
  cloudExtremeOS: color.purple,
  cloudExtremeOB: color.blue,
  bgBandColor: color.blue,
  bgBandOpacity: 92,
  stochKColor: color.orange,
  stochDColor: color.fuchsia,
  stochLineOpacity: 45,
  buyColor: color.green,
  sellColor: color.red,
  labelTextColor: color.white,
  bullDivColor: color.green,
  bearDivColor: color.red,
  hiddenBullDivColor: HIDDEN_BULL_COL,
  hiddenBearDivColor: HIDDEN_BEAR_COL,
  wvfSpikeColor: color.lime,
  wvfNormalColor: color.gray,
  wvfRangeColor: color.orange,
  wvfBandColor: color.aqua,
  lbR: 5,
  lbL: 5,
  rangeUpper: 60,
  rangeLower: 5,
  plotBull: true,
  plotHiddenBull: false,
  plotBear: true,
  plotHiddenBear: false,
  showWVF: true,
  pd: 22,
  bbl: 20,
  mult: 2.0,
  lb: 50,
  ph: 0.85,
  pl: 1.01,
  hp: false,
  sd: false,
  wvfBase: -60.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLen', type: 'int', title: 'RSI Period', defval: 14, min: 1 },
  { id: 'src', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'baseLen', type: 'int', title: 'RSI Base EMA', defval: 14 },
  { id: 'osStart', type: 'float', title: 'OS Start (red ≤)', defval: 44.0 },
  { id: 'osExtreme', type: 'float', title: 'OS Extreme (purple ≤)', defval: 25.0 },
  { id: 'obStart', type: 'float', title: 'OB Start (green ≥)', defval: 70.0 },
  { id: 'obExtreme', type: 'float', title: 'OB Extreme (blue ≥)', defval: 85.0 },
  { id: 'showCloud', type: 'bool', title: 'Show Cloud', defval: true },
  { id: 'cloudOp', type: 'int', title: 'Cloud Opacity (0=strong)', defval: 55, min: 0, max: 95 },
  { id: 'showBuySell', type: 'bool', title: 'Show BUY/SELL', defval: true },
  { id: 'buySellUseStoch', type: 'bool', title: 'BUY/SELL require Stoch confirmation', defval: false },
  { id: 'buyOnExtremeOS', type: 'bool', title: 'BUY when crosses UP from OS (44)', defval: true },
  { id: 'sellOnExtremeOB', type: 'bool', title: 'SELL when crosses DOWN from OB (70)', defval: true },
  { id: 'buyOnPurpleExit', type: 'bool', title: 'BUY when exits purple (25)', defval: true },
  { id: 'sellOnBlueExit', type: 'bool', title: 'SELL when exits blue (85)', defval: true },
  { id: 'showStoch', type: 'bool', title: 'Show Stoch RSI', defval: true },
  { id: 'stochLen', type: 'int', title: 'Stoch RSI Length', defval: 14 },
  { id: 'kLen', type: 'int', title: 'Stoch K', defval: 3 },
  { id: 'dLen', type: 'int', title: 'Stoch D', defval: 3 },
  { id: 'rsiColor', type: 'color', title: 'RSI Line Color', defval: RSI_COL },
  { id: 'baseColor', type: 'color', title: 'RSI Base (EMA) Color', defval: BASE_COL },
  { id: 'cloudBullColor', type: 'color', title: 'Cloud: Overbought (70-85)', defval: color.lime },
  { id: 'cloudBearColor', type: 'color', title: 'Cloud: Oversold (25-44)', defval: color.red },
  { id: 'cloudExtremeOS', type: 'color', title: 'Cloud: Extreme Oversold (<=25)', defval: color.purple },
  { id: 'cloudExtremeOB', type: 'color', title: 'Cloud: Extreme Overbought (>=85)', defval: color.blue },
  { id: 'bgBandColor', type: 'color', title: 'OB/OS Background Color', defval: color.blue },
  { id: 'bgBandOpacity', type: 'int', title: 'OB/OS Background Opacity', defval: 92, min: 0, max: 100 },
  { id: 'stochKColor', type: 'color', title: 'Stoch RSI %K Color', defval: color.orange },
  { id: 'stochDColor', type: 'color', title: 'Stoch RSI %D Color', defval: color.fuchsia },
  { id: 'stochLineOpacity', type: 'int', title: 'Stoch Lines Opacity', defval: 45, min: 0, max: 100 },
  { id: 'buyColor', type: 'color', title: 'BUY Label Color', defval: color.green },
  { id: 'sellColor', type: 'color', title: 'SELL Label Color', defval: color.red },
  { id: 'labelTextColor', type: 'color', title: 'Label Text Color', defval: color.white },
  { id: 'bullDivColor', type: 'color', title: 'Bull Div Stroke', defval: color.green },
  { id: 'bearDivColor', type: 'color', title: 'Bear Div Stroke', defval: color.red },
  { id: 'hiddenBullDivColor', type: 'color', title: 'Hidden Bull Div Stroke', defval: HIDDEN_BULL_COL },
  { id: 'hiddenBearDivColor', type: 'color', title: 'Hidden Bear Div Stroke', defval: HIDDEN_BEAR_COL },
  { id: 'wvfSpikeColor', type: 'color', title: 'WVF Spike (Green) Color', defval: color.lime },
  { id: 'wvfNormalColor', type: 'color', title: 'WVF Normal (Gray) Color', defval: color.gray },
  { id: 'wvfRangeColor', type: 'color', title: 'WVF Range Lines Color', defval: color.orange },
  { id: 'wvfBandColor', type: 'color', title: 'WVF Bands Color', defval: color.aqua },
  { id: 'lbR', type: 'int', title: 'Pivot Lookback Right', defval: 5, display: 'data_window' },
  { id: 'lbL', type: 'int', title: 'Pivot Lookback Left', defval: 5, display: 'data_window' },
  { id: 'rangeUpper', type: 'int', title: 'Max of Lookback Range', defval: 60, display: 'data_window' },
  { id: 'rangeLower', type: 'int', title: 'Min of Lookback Range', defval: 5, display: 'data_window' },
  { id: 'plotBull', type: 'bool', title: 'Plot Bullish', defval: true, display: 'data_window' },
  { id: 'plotHiddenBull', type: 'bool', title: 'Plot Hidden Bullish', defval: false, display: 'data_window' },
  { id: 'plotBear', type: 'bool', title: 'Plot Bearish', defval: true, display: 'data_window' },
  { id: 'plotHiddenBear', type: 'bool', title: 'Plot Hidden Bearish', defval: false, display: 'data_window' },
  { id: 'showWVF', type: 'bool', title: 'Show CM_Williams_Vix_Fix (shifted down, ORIGINAL shape)', defval: true },
  { id: 'pd', type: 'int', title: 'WVF LookBack Period Standard Deviation High', defval: 22 },
  { id: 'bbl', type: 'int', title: 'WVF Bollinger Band Length', defval: 20 },
  { id: 'mult', type: 'float', title: 'WVF Bollinger Band Std Dev Up', defval: 2.0, min: 1, max: 5 },
  { id: 'lb', type: 'int', title: 'WVF Look Back Period Percentile High', defval: 50 },
  { id: 'ph', type: 'float', title: 'WVF Highest Percentile (e.g. 0.90 = 90%)', defval: 0.85, step: 0.01 },
  { id: 'pl', type: 'float', title: 'WVF Lowest Percentile (e.g. 1.10 = 90%)', defval: 1.01, step: 0.01 },
  { id: 'hp', type: 'bool', title: 'WVF Show High/Low Range (Percentile & LookBack)', defval: false },
  { id: 'sd', type: 'bool', title: 'WVF Show Standard Deviation Line', defval: false },
  { id: 'wvfBase', type: 'float', title: 'WVF Vertical Shift (more negative = lower)', defval: -60.0 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: RSI_COL, lineWidth: 2 },
  { id: 'plot1', title: 'RSI Base (EMA)', color: BASE_COL, lineWidth: 1 },
  { id: 'plot2', title: 'Stoch K', color: String(color.new(color.orange, 45)), lineWidth: 1 },
  { id: 'plot3', title: 'Stoch D', color: String(color.new(color.fuchsia, 45)), lineWidth: 1 },
  { id: 'plot4', title: 'Regular Bullish', color: color.green, lineWidth: 2, display: 'pane' },
  { id: 'plot5', title: 'Hidden Bullish', color: HIDDEN_BULL_COL, lineWidth: 2, display: 'pane' },
  { id: 'plot6', title: 'Regular Bearish', color: color.red, lineWidth: 2, display: 'pane' },
  { id: 'plot7', title: 'Hidden Bearish', color: HIDDEN_BEAR_COL, lineWidth: 2, display: 'pane' },
  { id: 'plot8', title: 'WVF Range High', color: color.orange, lineWidth: 1 },
  { id: 'plot9', title: 'WVF Range Low', color: color.orange, lineWidth: 1 },
  { id: 'plot10', title: 'Williams Vix Fix (Shifted)', color: color.gray, lineWidth: 2, style: 'histogram', histbase: -60 },
  { id: 'plot11', title: 'WVF Upper Band', color: color.aqua, lineWidth: 1 },
  { id: 'plot12', title: 'WVF Lower Band', color: color.aqua, lineWidth: 1 },
];

/** hline(50 / obStart / osStart) with the default levels */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_mid', price: 50, title: 'Middle', color: String(color.new('#787B86', 60)), linestyle: 'dotted' },
  { id: 'hline_ob', price: 70, title: 'Overbought', color: String(color.new('#787B86', 70)), linestyle: 'dotted' },
  { id: 'hline_os', price: 44, title: 'Oversold', color: String(color.new('#787B86', 70)), linestyle: 'dotted' },
];

/** fill(obLine, osLine, color.new(bgBandColor, bgBandOpacity)) with the default colour */
export const fillConfig: FillConfig[] = [
  { id: 'fill_obos', plot1: 'hline_ob', plot2: 'hline_os', color: String(color.new(color.blue, 92)), title: 'OB/OS Background' },
];

export const metadata = {
  title: 'ALL-IN-ONE RSI (Cloud + ORIGINAL Divergence + StochRSI + CM_WVF ORIGINAL + BUY/SELL) [Color Settings]',
  shortTitle: 'ALL-IN-ONE RSI (Cloud + ORIGINAL Divergence + StochRSI + CM_WVF ORIGINAL + BUY/SELL) [Color Settings]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Pine a != b: false with na */
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<AllInOneRsiSystemInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const t = (i: number) => bars[i].time;

  // Core
  const oscS = ta.rsi(getSourceSeries(bars, cfg.src), cfg.rsiLen);
  const osc = A(oscS);
  const base = A(ta.ema(oscS, cfg.baseLen));

  // Stoch RSI: stochRSI = oscMax != oscMin ? (osc - oscMin) / (oscMax - oscMin) : 0.0 (0 while na)
  const oscMin = A(ta.lowest(oscS, cfg.stochLen));
  const oscMax = A(ta.highest(oscS, cfg.stochLen));
  const stoch100 = osc.map((o, i) => (ne(oscMax[i], oscMin[i]) ? (o - oscMin[i]) / (oscMax[i] - oscMin[i]) : 0.0) * 100.0);
  const kS = ta.sma(S(stoch100), cfg.kLen);
  const K = A(kS);
  const D = A(ta.sma(kS, cfg.dLen));
  const kOverD = A(ta.crossover(kS, S(D)));
  const kUnderD = A(ta.crossunder(kS, S(D)));

  // BUY / SELL
  const crossUpOS = A(ta.crossover(oscS, cfg.osStart));
  const crossDownOB = A(ta.crossunder(oscS, cfg.obStart));
  const exitPurpleUp = A(ta.crossover(oscS, cfg.osExtreme));
  const exitBlueDown = A(ta.crossunder(oscS, cfg.obExtreme));

  // Divergences
  const lbR = cfg.lbR;
  const pivotLow = A(ta.pivotlow(oscS, cfg.lbL, lbR));
  const pivotHigh = A(ta.pivothigh(oscS, cfg.lbL, lbR));
  const oscLbr = (i: number) => (i - lbR >= 0 ? osc[i - lbR] : NaN);
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const hiddenBullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const hiddenBearCond: boolean[] = new Array(n).fill(false);
  // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
  const plOsc: number[] = [];
  const plLow: number[] = [];
  const phOsc: number[] = [];
  const phHigh: number[] = [];
  const second = (a: number[]) => (a.length >= 2 ? a[a.length - 2] : NaN);
  // ta.barssince(plFound[1]) / ta.barssince(phFound[1]): run on every bar
  let sincePl = NaN;
  let sincePh = NaN;
  const inRange = (bars_: number) => cfg.rangeLower <= bars_ && bars_ <= cfg.rangeUpper;
  for (let i = 0; i < n; i++) {
    const o = oscLbr(i);
    const lowLbr = i - lbR >= 0 ? bars[i - lbR].low : NaN;
    const highLbr = i - lbR >= 0 ? bars[i - lbR].high : NaN;
    if (i > 0 && plFound[i - 1]) sincePl = 0;
    else if (!isNaN(sincePl)) sincePl++;
    if (i > 0 && phFound[i - 1]) sincePh = 0;
    else if (!isNaN(sincePh)) sincePh++;

    plFound[i] = !isNaN(pivotLow[i]);
    phFound[i] = !isNaN(pivotHigh[i]);
    if (plFound[i]) {
      plOsc.push(o);
      plLow.push(lowLbr);
    }
    if (phFound[i]) {
      phOsc.push(o);
      phHigh.push(highLbr);
    }
    const inRangePl = inRange(sincePl);
    const inRangePh = inRange(sincePh);
    const vwPlOsc = second(plOsc);
    const vwPlLow = second(plLow);
    const vwPhOsc = second(phOsc);
    const vwPhHigh = second(phHigh);

    // Regular bullish: osc higher low, price lower low
    const oscHL = gt(o, vwPlOsc) && inRangePl;
    const priceLL = lt(lowLbr, vwPlLow);
    bullCond[i] = cfg.plotBull && priceLL && oscHL && plFound[i];
    // Hidden bullish: osc lower low, price higher low
    const oscLL = lt(o, vwPlOsc) && inRangePl;
    const priceHL = gt(lowLbr, vwPlLow);
    hiddenBullCond[i] = cfg.plotHiddenBull && priceHL && oscLL && plFound[i];
    // Regular bearish: osc lower high, price higher high
    const oscLH = lt(o, vwPhOsc) && inRangePh;
    const priceHH = gt(highLbr, vwPhHigh);
    bearCond[i] = cfg.plotBear && priceHH && oscLH && phFound[i];
    // Hidden bearish: osc higher high, price lower high
    const oscHH = gt(o, vwPhOsc) && inRangePh;
    const priceLH = lt(highLbr, vwPhHigh);
    hiddenBearCond[i] = cfg.plotHiddenBear && priceLH && oscHH && phFound[i];
  }

  // CM Williams Vix Fix
  const close = S(bars.map((b) => b.close));
  const hc = A(ta.highest(close, cfg.pd));
  const wvf = bars.map((b, i) => ((hc[i] - b.low) / hc[i]) * 100.0);
  const wvfS = S(wvf);
  const sDevW = A(ta.stdev(wvfS, cfg.bbl)).map((v) => cfg.mult * v);
  const midLineW = A(ta.sma(wvfS, cfg.bbl));
  const lowerBandW = midLineW.map((m, i) => m - sDevW[i]);
  const upperBandW = midLineW.map((m, i) => m + sDevW[i]);
  const rangeHighW = A(ta.highest(wvfS, cfg.lb)).map((v) => v * cfg.ph);
  const rangeLowW = A(ta.lowest(wvfS, cfg.lb)).map((v) => v * cfg.pl);

  // Plots
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const P = (f: (i: number) => Point): Point[] => bars.map((_b, i) => f(i));
  const rsiCol = String(color.new(cfg.rsiColor, 0));
  const kCol = String(color.new(cfg.stochKColor, cfg.stochLineOpacity));
  const dCol = String(color.new(cfg.stochDColor, cfg.stochLineOpacity));
  const noneColor = String(color.new(color.white, 100));
  const interval = barInterval(bars);
  // plot(found ? osc[lbR] : na, offset = -lbR, color = cond ? divColor : noneColor): the value of bar i on bar i - lbR
  const divPlot = (found: boolean[], cond: boolean[], on: string): Point[] => {
    const out: Point[] = [];
    for (let i = Math.max(lbR, 0); i < n; i++) {
      out.push({ time: barTime(bars, i - lbR, interval), value: found[i] ? fin(oscLbr(i)) : NaN,
        color: cond[i] ? on : noneColor });
    }
    return out;
  };
  const wvfLine = (show: boolean, vals: number[], col: string) => P((i) => ({
    time: t(i), value: show ? fin(cfg.wvfBase + vals[i]) : NaN, color: col,
  }));

  const plots: Record<string, Point[]> = {
    plot0: P((i) => ({ time: t(i), value: osc[i], color: rsiCol })),
    plot1: P((i) => ({ time: t(i), value: base[i], color: cfg.baseColor })),
    plot2: P((i) => ({ time: t(i), value: cfg.showStoch ? K[i] : NaN, color: kCol })),
    plot3: P((i) => ({ time: t(i), value: cfg.showStoch ? D[i] : NaN, color: dCol })),
    plot4: divPlot(plFound, bullCond, cfg.bullDivColor),
    plot5: divPlot(plFound, hiddenBullCond, cfg.hiddenBullDivColor),
    plot6: divPlot(phFound, bearCond, cfg.bearDivColor),
    plot7: divPlot(phFound, hiddenBearCond, cfg.hiddenBearDivColor),
    plot8: wvfLine(cfg.showWVF && cfg.hp, rangeHighW, cfg.wvfRangeColor),
    plot9: wvfLine(cfg.showWVF && cfg.hp, rangeLowW, cfg.wvfRangeColor),
    // colW = (wvf >= upperBandW or wvf >= rangeHighW) ? wvfSpikeColor : wvfNormalColor
    plot10: P((i) => ({
      time: t(i), value: cfg.showWVF ? fin(cfg.wvfBase + wvf[i]) : NaN,
      color: ge(wvf[i], upperBandW[i]) || ge(wvf[i], rangeHighW[i]) ? cfg.wvfSpikeColor : cfg.wvfNormalColor,
    })),
    plot11: wvfLine(cfg.showWVF && cfg.sd, upperBandW, cfg.wvfBandColor),
    plot12: wvfLine(cfg.showWVF && cfg.sd, lowerBandW, cfg.wvfBandColor),
  };

  // Cloud colour: osc <= osExtreme ? purple : osc <= osStart ? red : osc >= obExtreme ? blue : osc >= obStart ? green : na
  const cloud = osc.map((o) => {
    if (!cfg.showCloud) return 'transparent';
    const c = le(o, cfg.osExtreme) ? cfg.cloudExtremeOS : le(o, cfg.osStart) ? cfg.cloudBearColor
      : ge(o, cfg.obExtreme) ? cfg.cloudExtremeOB : ge(o, cfg.obStart) ? cfg.cloudBullColor : null;
    return c === null ? 'transparent' : String(color.new(c, cfg.cloudOp));
  });

  // Markers
  const markers: MarkerData[] = [];
  const buyCol = String(color.new(cfg.buyColor, 0));
  const sellCol = String(color.new(cfg.sellColor, 0));
  const textColor = cfg.labelTextColor;
  for (let i = 0; i < n; i++) {
    const stochBull = kOverD[i] === 1 && lt(K[i], 20);
    const stochBear = kUnderD[i] === 1 && gt(K[i], 80);
    const buyCond = (cfg.buyOnExtremeOS && crossUpOS[i] === 1) || (cfg.buyOnPurpleExit && exitPurpleUp[i] === 1);
    const sellCond = (cfg.sellOnExtremeOB && crossDownOB[i] === 1) || (cfg.sellOnBlueExit && exitBlueDown[i] === 1);
    const buyFinal = cfg.showBuySell && buyCond && (!cfg.buySellUseStoch || stochBull);
    const sellFinal = cfg.showBuySell && sellCond && (!cfg.buySellUseStoch || stochBear);
    // plotshape(buyFinal ? osc : na, "BUY", shape.labelup, location.absolute, text = "BUY", size = size.small)
    if (buyFinal && !isNaN(osc[i])) {
      markers.push({ id: 'shape0', time: t(i), position: 'atPriceBottom', price: osc[i], shape: 'labelUp', color: buyCol, text: 'BUY',
        textColor, size: 'small' });
    }
    if (sellFinal && !isNaN(osc[i])) {
      markers.push({ id: 'shape1', time: t(i), position: 'atPriceTop', price: osc[i], shape: 'labelDown', color: sellCol, text: 'SELL',
        textColor, size: 'small' });
    }
    // Divergence labels: plotshape(cond ? osc[lbR] : na, offset = -lbR, location.absolute)
    const price = oscLbr(i);
    if (i - lbR < 0 || isNaN(price)) continue;
    const at = barTime(bars, i - lbR, interval);
    if (bullCond[i]) {
      markers.push({ id: 'shape2', time: at, position: 'atPriceBottom', price, shape: 'labelUp', color: cfg.bullDivColor, text: ' Bull ',
        textColor });
    }
    if (hiddenBullCond[i]) {
      markers.push({ id: 'shape3', time: at, position: 'atPriceBottom', price, shape: 'labelUp', color: cfg.bullDivColor,
        text: ' H Bull ', textColor });
    }
    if (bearCond[i]) {
      markers.push({ id: 'shape4', time: at, position: 'atPriceTop', price, shape: 'labelDown', color: cfg.bearDivColor, text: ' Bear ',
        textColor });
    }
    if (hiddenBearCond[i]) {
      markers.push({ id: 'shape5', time: at, position: 'atPriceTop', price, shape: 'labelDown', color: cfg.bearDivColor,
        text: ' H Bear ', textColor });
    }
  }

  const obosFill = String(color.new(cfg.bgBandColor, cfg.bgBandOpacity));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: 50, options: { title: 'Middle', color: String(color.new('#787B86', 60)), linestyle: 'dotted' } },
      { value: cfg.obStart, options: { title: 'Overbought', color: String(color.new('#787B86', 70)), linestyle: 'dotted' } },
      { value: cfg.osStart, options: { title: 'Oversold', color: String(color.new('#787B86', 70)), linestyle: 'dotted' } },
    ],
    fills: [
      // fill(pOsc, pBase, color = showCloud ? cloudColor : na)
      { plot1: 'plot0', plot2: 'plot1', colors: cloud },
      // fill(obLine, osLine, title = "OB/OS Background", color = color.new(bgBandColor, bgBandOpacity))
      { plot1: 'hline_ob', plot2: 'hline_os', options: { title: 'OB/OS Background' }, colors: new Array<string>(n).fill(obosFill) },
    ],
    markers,
  };
}

export const AllInOneRsiSystem = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
};
