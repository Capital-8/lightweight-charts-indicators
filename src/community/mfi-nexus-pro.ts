/**
 * MFI Nexus Pro
 *
 * Money Flow Index from hlc3 * volume: 100 - 100 / (1 + positive flow / max(negative flow, 0.000001)) over the MFI
 * length. A moving average of the MFI (10 types), Bollinger Bands of the MFI and regular divergences between MFI
 * pivots (5 left, 1 right) and price give buy / sell signals: MFI crossing the MA, MFI crossing the lower band up /
 * the upper band down, bullish / bearish divergences. Signals need a minimum number of bars since the last signal of
 * the same side and can be filtered by MFI and RSI zones and by "wait for the opposite signal". Signals are drawn in
 * the pane and on the price chart (each signal, all signals combined by AND, or by OR). The divergences are drawn as
 * lines between the pivots and "Div" triangles on the pivot bar (hidden by default). Five connector plots give
 * 1 (buy), -1 (sell) or 0.
 * Alerts (alertcondition, `alerts` of the result): the buy / sell signals of the MA, BB and divergence modes, of all
 * three combined by OR and by AND, as the original declares them.
 *
 * Reference: "MFI Nexus Pro [trade_lexx]" by trade_lexx
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal MA', message: 'Buy Signal MA: MFI crossed above the MA.' },
  { id: 'alert1', title: 'Sell Signal MA', message: 'Sell Signal MA: MFI crossed below the MA.' },
  { id: 'alert2', title: 'Buy Signal BB', message: 'Buy Signal BB: MFI crossed above the lower Bollinger Band.' },
  { id: 'alert3', title: 'Sell Signal BB', message: 'Sell Signal BB: MFI crossed below the upper Bollinger Band.' },
  { id: 'alert4', title: 'Buy Signal Div', message: 'Buy Signal Div: Bullish divergence detected.' },
  { id: 'alert5', title: 'Sell Signal Div', message: 'Sell Signal Div: Bearish divergence detected.' },
  { id: 'alert6', title: 'Buy OR Signal MA, BB, Div', message: 'Buy Signal: MFI crossed above the MA or BB or bullish divergence' },
  { id: 'alert7', title: 'Sell OR Signal MA, BB, Div', message: 'Sell Signal: MFI crossed below the MA or BB or bearish divergence.' },
  { id: 'alert8', title: 'Buy AND Signal MA, BB, Div', message: 'Buy Signal: MFI crossed above the MA or BB or bullish divergence' },
  { id: 'alert9', title: 'Sell AND Signal MA, BB, Div', message: 'Sell Signal: MFI crossed below the MA or BB or bearish divergence.' },
];

type MaType = 'SMA' | 'EMA' | 'WMA' | 'HMA' | 'KAMA' | 'VWMA' | 'ALMA' | 'TEMA' | 'ZLEMA' | 'DEMA';
type AndOrMode = 'None' | 'MA and BB and Div' | 'MA or BB or Div';

export interface MfiNexusProInputs {
  /** Moving average signal */
  maMode: boolean;
  /** Moving average type */
  maType: MaType;
  /** Moving average length */
  maLength: number;
  /** Bollinger Bands signal */
  bbMode: boolean;
  /** Divergence signal */
  divergenceMode: boolean;
  /** Basis type of the Bollinger Bands */
  bbType: Exclude<MaType, 'KAMA'>;
  /** Bollinger Bands length */
  bbLength: number;
  /** Bollinger Bands standard deviation multiplier */
  bbMult: number;
  /** Minimum bars between two signals of the same side */
  minBarsBetweenSignals: number;
  /** MFI filter */
  mfiFilter: boolean;
  /** MFI length */
  mfiLength: number;
  /** Sell signals: MFI above this level */
  overboughtLowerLevel: number;
  /** Sell signals: MFI below this level */
  overboughtUpperLevel: number;
  /** Buy signals: MFI above this level */
  oversoldLowerLevel: number;
  /** Buy signals: MFI below this level */
  oversoldUpperLevel: number;
  /** RSI filter */
  rsiFilter: boolean;
  /** RSI length */
  rsiLength: number;
  /** Sell signals: RSI above this level */
  rsiOverboughtLowerLevel: number;
  /** Sell signals: RSI below this level */
  rsiOverboughtUpperLevel: number;
  /** Buy signals: RSI above this level */
  rsiOversoldLowerLevel: number;
  /** Buy signals: RSI below this level */
  rsiOversoldUpperLevel: number;
  /** Chart signals: each signal ('None'), MA and BB and Div combinations, or MA or BB or Div */
  andOrMode: AndOrMode;
  /** A signal needs the last signal to be of the other side */
  waitForOppositeSignal: boolean;
}

export const defaultInputs: MfiNexusProInputs = {
  maMode: true,
  maType: 'SMA',
  maLength: 14,
  bbMode: true,
  divergenceMode: true,
  bbType: 'SMA',
  bbLength: 14,
  bbMult: 2.0,
  minBarsBetweenSignals: 5,
  mfiFilter: true,
  mfiLength: 14,
  overboughtLowerLevel: 70,
  overboughtUpperLevel: 100,
  oversoldLowerLevel: 1,
  oversoldUpperLevel: 30,
  rsiFilter: true,
  rsiLength: 14,
  rsiOverboughtLowerLevel: 65,
  rsiOverboughtUpperLevel: 100,
  rsiOversoldLowerLevel: 1,
  rsiOversoldUpperLevel: 30,
  andOrMode: 'None',
  waitForOppositeSignal: false,
};

const MA_TYPES: MaType[] = ['SMA', 'EMA', 'WMA', 'HMA', 'KAMA', 'VWMA', 'ALMA', 'TEMA', 'ZLEMA', 'DEMA'];
const BB_TYPES = ['SMA', 'EMA', 'WMA', 'HMA', 'VWMA', 'ALMA', 'TEMA', 'ZLEMA', 'DEMA'];

export const inputConfig: InputConfig[] = [
  { id: 'maMode', type: 'bool', title: 'Moving Average Signal', defval: true },
  { id: 'maType', type: 'string', title: 'Type', defval: 'SMA', options: MA_TYPES },
  { id: 'maLength', type: 'int', title: 'Length', defval: 14 },
  { id: 'bbMode', type: 'bool', title: 'Bollinger Bands Signal', defval: true },
  { id: 'divergenceMode', type: 'bool', title: 'Divergence Signal', defval: true },
  { id: 'bbType', type: 'string', title: 'Type', defval: 'SMA', options: BB_TYPES },
  { id: 'bbLength', type: 'int', title: 'Length', defval: 14 },
  { id: 'bbMult', type: 'float', title: 'StdDev', defval: 2.0, min: 0.001, max: 50, step: 0.1 },
  { id: 'minBarsBetweenSignals', type: 'int', title: 'Minimum Bars Between Signals', defval: 5, min: 0 },
  { id: 'mfiFilter', type: 'bool', title: 'MFI Filter |', defval: true },
  { id: 'mfiLength', type: 'int', title: 'MFI Length', defval: 14, min: 1 },
  { id: 'overboughtLowerLevel', type: 'int', title: 'Sell ⮕ Above⬆', defval: 70, min: 0, max: 100 },
  { id: 'overboughtUpperLevel', type: 'int', title: 'Below⬇', defval: 100, min: 0, max: 100 },
  { id: 'oversoldLowerLevel', type: 'int', title: 'Buy ⮕ Above⬆', defval: 1, min: 0, max: 100 },
  { id: 'oversoldUpperLevel', type: 'int', title: 'Below⬇', defval: 30, min: 0, max: 100 },
  { id: 'rsiFilter', type: 'bool', title: 'RSI Filter |', defval: true },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'rsiOverboughtLowerLevel', type: 'int', title: 'Sell ⮕ Above⬆', defval: 65, min: 0, max: 100 },
  { id: 'rsiOverboughtUpperLevel', type: 'int', title: 'Below⬇', defval: 100, min: 0, max: 100 },
  { id: 'rsiOversoldLowerLevel', type: 'int', title: 'Buy ⮕ Above⬆', defval: 1, min: 0, max: 100 },
  { id: 'rsiOversoldUpperLevel', type: 'int', title: 'Below⬇', defval: 30, min: 0, max: 100 },
  { id: 'andOrMode', type: 'string', title: 'AND/OR Mode', defval: 'None', options: ['None', 'MA and BB and Div', 'MA or BB or Div'] },
  { id: 'waitForOppositeSignal', type: 'bool', title: 'Wait for Opposite Signal', defval: false },
];

const MFI_COL = '#7E57C2';
const BAND_COL = '#787B86';
const NONE_COL = String(color.new(color.white, 100));
/** Pine plotshape default text colour */
const PINE_TEXT = '#2962FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MFI', color: MFI_COL, lineWidth: 1 },
  { id: 'plot1', title: 'MFI-based MA', color: color.yellow, lineWidth: 1 },
  { id: 'plot2', title: 'Upper Bollinger Band', color: color.green, lineWidth: 1 },
  { id: 'plot3', title: 'Lower Bollinger Band', color: color.green, lineWidth: 1 },
  { id: 'plot4', title: 'Regular Bullish', color: color.green, lineWidth: 2, display: 'pane' },
  { id: 'plot5', title: 'Regular Bearish', color: color.red, lineWidth: 2, display: 'pane' },
  { id: 'plot6', title: '🔌Connector Signal MA🔌', color: NONE_COL, lineWidth: 1 },
  { id: 'plot7', title: '🔌Connector Signal BB🔌', color: NONE_COL, lineWidth: 1 },
  { id: 'plot8', title: '🔌Connector Divergence🔌', color: NONE_COL, lineWidth: 1 },
  { id: 'plot9', title: '🔌Connector AND Mode🔌', color: NONE_COL, lineWidth: 1 },
  { id: 'plot10', title: '🔌Connector OR Mode🔌', color: NONE_COL, lineWidth: 1 },
];

/** hline(70 / 50 / 30) with the default levels (the result `hlines` carry the input levels) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 70, title: 'Upper Band', color: BAND_COL, linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'Middle Level', color: BAND_COL, linestyle: 'dotted' },
  { id: 'hline_lower', price: 30, title: 'Lower Band', color: BAND_COL, linestyle: 'dashed' },
];

/** fill(obPlot, osPlot, color.rgb(126, 87, 194, 90)) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_bands', plot1: 'hline_upper', plot2: 'hline_lower', color: String(color.rgb(126, 87, 194, 90)), title: 'Background' },
];

export const metadata = {
  title: 'MFI Nexus Pro [trade_lexx]',
  shortTitle: 'MFI Nexus Pro [trade_lexx]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<MfiNexusProInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  /** oakscriptjs averages do not skip +-infinity (#119): give them NaN */
  const finite = (a: number[]) => a.map((v) => (Number.isFinite(v) ? v : NaN));
  const lookbackRight = 1;
  const lookbackLeft = 5;
  const rangeUpper = 60;
  const rangeLower = 5;

  // MFI: math.sum of the money flow of the bars where hlc3 rises / falls (hlc3 > hlc3[1] is false on bar 0)
  const typical = bars.map((b) => (b.high + b.low + b.close) / 3);
  const posFlow = bars.map((b, i) => (b.volume ?? NaN) * typical[i] * (i > 0 && gt(typical[i], typical[i - 1]) ? 1 : 0));
  const negFlow = bars.map((b, i) => (b.volume ?? NaN) * typical[i] * (i > 0 && lt(typical[i], typical[i - 1]) ? 1 : 0));
  const posSum = A(math.sum(S(posFlow), cfg.mfiLength) as Series);
  const negSum = A(math.sum(S(negFlow), cfg.mfiLength) as Series);
  const mfi = posSum.map((p, i) => 100 - 100 / (1 + p / Math.max(negSum[i], 0.000001)));

  const rsi = A(ta.rsi(S(bars.map((b) => b.close)), cfg.rsiLength));

  // Moving averages of the MFI
  const ema = (src: number[], len: number) => A(ta.ema(S(finite(src)), len));
  const kama = (src: number[], len: number) => {
    // var float kama = na; sc = max(0.666, min(0.0645, (stdev / atr)^2)) (na when stdev / atr is na)
    const sma = A(ta.sma(S(src), len));
    const vol = A(ta.stdev(S(src), len));
    const atr = A(ta.atr(bars, len));
    const out: number[] = new Array(n);
    let k = NaN;
    for (let i = 0; i < n; i++) {
      const er = vol[i] / atr[i];
      let sc = Math.pow(er, 2);
      sc = isNaN(sc) ? NaN : Math.max(0.666, Math.min(0.0645, sc));
      k = isNaN(k) ? sma[i] : sc * src[i] + (1 - sc) * k;
      out[i] = k;
    }
    return out;
  };
  const ma = (src: number[], len: number, type: string): number[] => {
    switch (type) {
      case 'SMA': return A(ta.sma(S(src), len));
      case 'EMA': return ema(src, len);
      case 'WMA': return A(ta.wma(S(src), len));
      case 'VWMA': return A(ta.vwma(S(src), len, S(bars.map((b) => b.volume ?? NaN))));
      case 'KAMA': return kama(src, len);
      case 'HMA': return A(ta.hma(S(src), len));
      case 'ZLEMA': {
        // ema[(length - 1) / 2]: a fractional index is truncated
        const lag = Math.trunc((len - 1) / 2);
        const e = ema(src, len);
        return e.map((_v, i) => (i - lag >= 0 ? e[i - lag] : NaN));
      }
      case 'TEMA': {
        const e1 = ema(src, len);
        const e2 = ema(e1, len);
        const e3 = ema(e2, len);
        return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
      }
      case 'ALMA': return A(ta.alma(S(src), len, 0.85, 6));
      case 'DEMA': {
        const e1 = ema(src, len);
        const e2 = ema(e1, len);
        return e1.map((v, i) => 2 * v - e2[i]);
      }
      default: return new Array(n).fill(NaN);
    }
  };
  const nanArr = () => new Array<number>(n).fill(NaN);
  const smoothingMA = cfg.maMode ? ma(mfi, cfg.maLength, cfg.maType) : nanArr();
  const smoothingBB = cfg.bbMode ? ma(mfi, cfg.bbLength, cfg.bbType) : nanArr();
  const stdev = cfg.bbMode ? A(ta.stdev(S(finite(mfi)), cfg.bbLength)) : nanArr();
  const smoothingStDev = stdev.map((v) => v * cfg.bbMult);
  const bbUpper = smoothingBB.map((v, i) => v + smoothingStDev[i]);
  const bbLower = smoothingBB.map((v, i) => v - smoothingStDev[i]);

  // Divergence: pivots of the MFI (5 left, 1 right)
  const mfiLBR = (i: number) => (i - lookbackRight >= 0 ? mfi[i - lookbackRight] : NaN);
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  if (cfg.divergenceMode) {
    const pl = A(ta.pivotlow(S(finite(mfi)), lookbackLeft, lookbackRight));
    const ph = A(ta.pivothigh(S(finite(mfi)), lookbackLeft, lookbackRight));
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plMfi: number[] = [];
    const plLow: number[] = [];
    const phMfi: number[] = [];
    const phHigh: number[] = [];
    // ta.barssince(plFound[1]) / ta.barssince(phFound[1]): runs on every bar
    let plSince = NaN;
    let phSince = NaN;
    for (let i = 0; i < n; i++) {
      const o = mfiLBR(i);
      const lowLBR = i - lookbackRight >= 0 ? bars[i - lookbackRight].low : NaN;
      const highLBR = i - lookbackRight >= 0 ? bars[i - lookbackRight].high : NaN;

      plFound[i] = !isNaN(pl[i]);
      if (i > 0 && plFound[i - 1]) plSince = 0;
      else if (!isNaN(plSince)) plSince++;
      const plFoundRange = rangeLower <= plSince && plSince <= rangeUpper;
      if (plFound[i]) {
        plMfi.push(o);
        plLow.push(lowLBR);
      }
      const vwPlMfi = plMfi.length >= 2 ? plMfi[plMfi.length - 2] : NaN;
      const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
      const mfiHL = gt(o, vwPlMfi) && plFoundRange;
      const priceLL = lt(lowLBR, vwPlLow);
      bullCond[i] = priceLL && mfiHL && plFound[i];

      phFound[i] = !isNaN(ph[i]);
      if (i > 0 && phFound[i - 1]) phSince = 0;
      else if (!isNaN(phSince)) phSince++;
      const phFoundRange = rangeLower <= phSince && phSince <= rangeUpper;
      if (phFound[i]) {
        phMfi.push(o);
        phHigh.push(highLBR);
      }
      const vwPhMfi = phMfi.length >= 2 ? phMfi[phMfi.length - 2] : NaN;
      const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
      const mfiLH = lt(o, vwPhMfi) && phFoundRange;
      const priceHH = gt(highLBR, vwPhHigh);
      bearCond[i] = priceHH && mfiLH && phFound[i];
    }
  }

  // ta.crossover / ta.crossunder: compared with the last bar where both values were not na, exactly (no 1e-10 tolerance)
  const crossState = () => ({ a: NaN, b: NaN });
  const cross = (st: { a: number; b: number }, a: number, b: number, over: boolean) => {
    let res = false;
    if (!isNaN(a) && !isNaN(b)) {
      res = over ? a > b && st.a <= st.b : a < b && st.a >= st.b;
      st.a = a;
      st.b = b;
    }
    return res;
  };
  const xMaUp = crossState();
  const xMaDn = crossState();
  const xBbUp = crossState();
  const xBbDn = crossState();

  const buyMA: boolean[] = new Array(n).fill(false);
  const sellMA: boolean[] = new Array(n).fill(false);
  const buyBB: boolean[] = new Array(n).fill(false);
  const sellBB: boolean[] = new Array(n).fill(false);
  const buyDiv: boolean[] = new Array(n).fill(false);
  const sellDiv: boolean[] = new Array(n).fill(false);
  let lastBuyBar = NaN;
  let lastSellBar = NaN;
  let lastSignal = NaN;
  for (let i = 0; i < n; i++) {
    const m = mfi[i];
    const r = rsi[i];
    const buyGap = isNaN(lastBuyBar) || i - lastBuyBar >= cfg.minBarsBetweenSignals;
    const sellGap = isNaN(lastSellBar) || i - lastSellBar >= cfg.minBarsBetweenSignals;
    let bMA = cross(xMaUp, m, smoothingMA[i], true) && buyGap;
    let sMA = cross(xMaDn, m, smoothingMA[i], false) && sellGap;
    let bBB = cross(xBbUp, m, bbLower[i], true) && buyGap;
    let sBB = cross(xBbDn, m, bbUpper[i], false) && sellGap;
    let bDiv = bullCond[i] && buyGap;
    let sDiv = bearCond[i] && sellGap;
    let bull = bullCond[i];
    let bear = bearCond[i];

    if (cfg.waitForOppositeSignal) {
      const okBuy = isNaN(lastSignal) || lastSignal === -1;
      const okSell = isNaN(lastSignal) || lastSignal === 1;
      bMA &&= okBuy; sMA &&= okSell; bBB &&= okBuy; sBB &&= okSell; bDiv &&= okBuy; sDiv &&= okSell;
      bull &&= okBuy; bear &&= okSell;
    }
    if (cfg.mfiFilter) {
      const okBuy = ge(m, cfg.oversoldLowerLevel) && le(m, cfg.oversoldUpperLevel);
      const okSell = ge(m, cfg.overboughtLowerLevel) && le(m, cfg.overboughtUpperLevel);
      bMA &&= okBuy; sMA &&= okSell; bBB &&= okBuy; sBB &&= okSell; bDiv &&= okBuy; sDiv &&= okSell;
      bull &&= okBuy; bear &&= okSell;
    }
    if (cfg.rsiFilter) {
      const okBuy = ge(r, cfg.rsiOversoldLowerLevel) && le(r, cfg.rsiOversoldUpperLevel);
      const okSell = ge(r, cfg.rsiOverboughtLowerLevel) && le(r, cfg.rsiOverboughtUpperLevel);
      bMA &&= okBuy; sMA &&= okSell; bBB &&= okBuy; sBB &&= okSell; bDiv &&= okBuy; sDiv &&= okSell;
      bull &&= okBuy; bear &&= okSell;
    }
    if (bMA) { lastBuyBar = i; lastSignal = 1; }
    if (sMA) { lastSellBar = i; lastSignal = -1; }
    if (bBB) { lastBuyBar = i; lastSignal = 1; }
    if (sBB) { lastSellBar = i; lastSignal = -1; }
    if (bDiv) { lastBuyBar = i; lastSignal = 1; }
    if (sDiv) { lastSellBar = i; lastSignal = -1; }
    buyMA[i] = bMA; sellMA[i] = sMA; buyBB[i] = bBB; sellBB[i] = sBB; buyDiv[i] = bDiv; sellDiv[i] = sDiv;
    bullCond[i] = bull;
    bearCond[i] = bear;
  }

  // Plots
  const interval = barInterval(bars);
  const t = (i: number) => bars[i].time;
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const P = (f: (i: number) => Point | null): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p = f(i);
      if (p) out.push(p);
    }
    return out;
  };
  const plots: Record<string, Point[]> = {};
  plots.plot0 = P((i) => ({ time: t(i), value: fin(mfi[i]), color: MFI_COL }));
  plots.plot1 = P((i) => ({ time: t(i), value: fin(smoothingMA[i]), color: color.yellow }));
  plots.plot2 = P((i) => ({ time: t(i), value: fin(bbUpper[i]), color: color.green }));
  plots.plot3 = P((i) => ({ time: t(i), value: fin(bbLower[i]), color: color.green }));
  // plot(plFound ? mfiLBR : na, offset = -lookbackRight, color = bullCond ? bullColor : noneColor): the value of
  // bar i is drawn on bar i - 1
  plots.plot4 = P((i) => (i - lookbackRight < 0 ? null : {
    time: barTime(bars, i - lookbackRight, interval),
    value: plFound[i] ? fin(mfiLBR(i)) : NaN,
    color: bullCond[i] ? color.green : NONE_COL,
  }));
  plots.plot5 = P((i) => (i - lookbackRight < 0 ? null : {
    time: barTime(bars, i - lookbackRight, interval),
    value: phFound[i] ? fin(mfiLBR(i)) : NaN,
    color: bearCond[i] ? color.red : NONE_COL,
  }));
  const sadBuy = (i: number) => [
    cfg.maMode && buyMA[i] && cfg.bbMode && buyBB[i],
    cfg.maMode && buyMA[i] && cfg.divergenceMode && buyDiv[i],
    cfg.bbMode && buyBB[i] && cfg.divergenceMode && buyDiv[i],
    cfg.maMode && buyMA[i] && cfg.bbMode && buyBB[i] && cfg.divergenceMode && buyDiv[i],
  ];
  const sadSell = (i: number) => [
    cfg.maMode && sellMA[i] && cfg.bbMode && sellBB[i],
    cfg.maMode && sellMA[i] && cfg.divergenceMode && sellDiv[i],
    cfg.bbMode && sellBB[i] && cfg.divergenceMode && sellDiv[i],
    cfg.maMode && sellMA[i] && cfg.bbMode && sellBB[i] && cfg.divergenceMode && sellDiv[i],
  ];
  const sodBuy = (i: number) => buyMA[i] || buyBB[i] || buyDiv[i];
  const sodSell = (i: number) => sellMA[i] || sellBB[i] || sellDiv[i];
  const conn = (buy: boolean, sell: boolean) => (buy ? 1 : sell ? -1 : 0);
  plots.plot6 = P((i) => ({ time: t(i), value: conn(cfg.maMode && buyMA[i], cfg.maMode && sellMA[i]), color: NONE_COL }));
  plots.plot7 = P((i) => ({ time: t(i), value: conn(cfg.bbMode && buyBB[i], cfg.bbMode && sellBB[i]), color: NONE_COL }));
  plots.plot8 = P((i) => ({
    time: t(i), value: conn(cfg.divergenceMode && buyDiv[i], cfg.divergenceMode && sellDiv[i]), color: NONE_COL,
  }));
  plots.plot9 = P((i) => ({ time: t(i), value: conn(sadBuy(i).some(Boolean), sadSell(i).some(Boolean)), color: NONE_COL }));
  plots.plot10 = P((i) => ({ time: t(i), value: conn(sodBuy(i), sodSell(i)), color: NONE_COL }));

  // Markers
  const markers: MarkerData[] = [];
  const green = String(color.new(color.green, 0));
  const red = String(color.new(color.red, 0));
  for (let i = 0; i < n; i++) {
    const time = t(i);
    // plotshape(bullCond ? mfiLBR : na, offset = -lookbackRight, triangleup, location.absolute, text = "Div") and the
    // bearish one (display.none: hidden by default, the host shows them from the Style settings); bullCond / bearCond
    // after the filters; the value of bar i is drawn on bar i - 1
    const lbr = fin(mfiLBR(i));
    if (i - lookbackRight >= 0 && !isNaN(lbr)) {
      const lblTime = barTime(bars, i - lookbackRight, interval);
      if (bullCond[i]) {
        markers.push({ time: lblTime, position: 'atPriceMiddle', price: lbr, shape: 'triangleUp', color: green,
          text: 'Div', textColor: PINE_TEXT, size: 'auto', id: 'shape0' });
      }
      if (bearCond[i]) {
        markers.push({ time: lblTime, position: 'atPriceMiddle', price: lbr, shape: 'triangleDown', color: red,
          text: 'Div', textColor: PINE_TEXT, size: 'auto', id: 'shape1' });
      }
    }
    // id: the Style-settings id of the plotshape (shape<k>, k over the plotshapes in declaration order)
    const pane = (on: boolean, buy: boolean, text: string, id: string) => {
      if (on) {
        markers.push({ time, position: buy ? 'bottom' : 'top', shape: buy ? 'triangleUp' : 'triangleDown',
          color: buy ? green : red, text, textColor: PINE_TEXT, size: 'auto', id });
      }
    };
    const chart = (on: boolean, buy: boolean, text: string, id: string) => {
      if (on) {
        markers.push({ time, position: buy ? 'belowBar' : 'aboveBar', shape: buy ? 'triangleUp' : 'triangleDown',
          color: buy ? green : red, text, textColor: PINE_TEXT, size: 'auto', forceOverlay: true, id });
      }
    };
    // Pane signals: location.bottom / location.top; divergence signals at mfiLBR (location.absolute)
    pane(cfg.maMode && buyMA[i], true, 'MA', 'shape2');
    pane(cfg.maMode && sellMA[i], false, 'MA', 'shape3');
    pane(cfg.bbMode && buyBB[i], true, 'BB', 'shape4');
    pane(cfg.bbMode && sellBB[i], false, 'BB', 'shape5');
    const price = fin(mfiLBR(i));
    if (!isNaN(price)) {
      if (buyDiv[i]) {
        markers.push({ time, position: 'atPriceMiddle', price, shape: 'triangleUp', color: green, text: 'Div',
          textColor: PINE_TEXT, size: 'auto', id: 'shape6' });
      }
      if (sellDiv[i]) {
        markers.push({ time, position: 'atPriceMiddle', price, shape: 'triangleDown', color: red, text: 'Div',
          textColor: PINE_TEXT, size: 'auto', id: 'shape7' });
      }
    }
    // Chart signals (force_overlay)
    const none = cfg.andOrMode === 'None';
    chart(none && cfg.maMode && buyMA[i], true, 'Buy', 'shape8');
    chart(none && cfg.maMode && sellMA[i], false, 'Sell', 'shape9');
    chart(none && cfg.bbMode && buyBB[i], true, 'Buy', 'shape10');
    chart(none && cfg.bbMode && sellBB[i], false, 'Sell', 'shape11');
    chart(none && cfg.divergenceMode && buyDiv[i], true, 'Buy', 'shape12');
    chart(none && cfg.divergenceMode && sellDiv[i], false, 'Sell', 'shape13');
    if (cfg.andOrMode === 'MA and BB and Div') {
      const texts = ['MA+BB', 'MA+Div', 'BB+Div', 'MA+BB+Div'];
      sadBuy(i).forEach((on, k) => chart(on, true, texts[k], `shape${14 + k}`));
      sadSell(i).forEach((on, k) => chart(on, false, texts[k], `shape${18 + k}`));
    }
    if (cfg.andOrMode === 'MA or BB or Div') {
      chart(sodBuy(i), true, 'Buy', 'shape22');
      chart(sodSell(i), false, 'Sell', 'shape23');
    }
  }

  // The alertconditions, in the original's order
  const range = Array.from({ length: n }, (_v, i) => i);
  const alertFlags: boolean[][] = [
    range.map((i) => cfg.maMode && buyMA[i]),
    range.map((i) => cfg.maMode && sellMA[i]),
    range.map((i) => cfg.bbMode && buyBB[i]),
    range.map((i) => cfg.bbMode && sellBB[i]),
    range.map((i) => cfg.divergenceMode && buyDiv[i]),
    range.map((i) => cfg.divergenceMode && sellDiv[i]),
    range.map((i) => sodBuy(i)),
    range.map((i) => sodSell(i)),
    range.map((i) => sadBuy(i).some(Boolean)),
    range.map((i) => sadSell(i).some(Boolean)),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: cfg.overboughtLowerLevel, options: { title: 'Upper Band', color: BAND_COL, linestyle: 'dashed' } },
      { value: 50, options: { title: 'Middle Level', color: BAND_COL, linestyle: 'dotted' } },
      { value: cfg.oversoldUpperLevel, options: { title: 'Lower Band', color: BAND_COL, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_upper', plot2: 'hline_lower', options: { title: 'Background' },
        colors: new Array<string>(n).fill(String(color.rgb(126, 87, 194, 90))) },
      // fill(bbUpperBand, bbLowerBand, color = bbModeInput ? color.new(color.green, 90) : na)
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Bollinger Bands Background Fill' },
        colors: new Array<string>(n).fill(cfg.bbMode ? String(color.new(color.green, 90)) : 'transparent') },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

export const MfiNexusPro = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
