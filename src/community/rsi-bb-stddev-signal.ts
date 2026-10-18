/**
 * RSI BB StdDev Signal
 *
 * RSI (RMA of the gains and losses) with a moving average of the RSI and Bollinger Bands on the RSI (a moving average
 * +/- a multiple of the standard deviation; 10 average types). Buy / sell signals: the RSI crossing over / under the
 * MA, crossing over the lower band / under the upper band, and regular divergences between RSI pivots (5 left, 1
 * right) and price. Filters: an RSI zone for buys and one for sells, a minimum number of bars between two signals of
 * the same side, waiting for the opposite signal, and an AND mode (signals only when two or three kinds agree).
 * Signals are drawn in the RSI pane and on the price chart; a connector plot gives 1 (buy), -1 (sell) or 0.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' and 'Sell Signal', true on the bars of the final buy
 * / sell signal (the one the connector gives). The two "Div" divergence labels on the pivot bar are hidden by
 * default.
 *
 * Reference: "RSI BB StdDev Signal" by trade_lexx (Pine title "RSI Signal [trade_lexx]")
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type MaType = 'SMA' | 'EMA' | 'WMA' | 'HMA' | 'KAMA' | 'VWMA' | 'ALMA' | 'TEMA' | 'ZLEMA' | 'LSMA';

export interface RsiBbStddevSignalInputs {
  /** Moving Average signal on / off */
  maModeInput: boolean;
  maTypeInput: MaType;
  maLengthInput: number;
  /** Bollinger Bands signal on / off */
  bbModeInput: boolean;
  bbTypeInput: Exclude<MaType, 'KAMA'>;
  bbLengthInput: number;
  /** Standard deviation multiplier of the bands */
  bbMultInput: number;
  /** Divergence signal on / off */
  divergenceModeInput: boolean;
  /** RSI zone filter on / off */
  overboughtOversold: boolean;
  rsiSourceInput: SourceType;
  rsiLengthInput: number;
  /** Sell signals: RSI above this level */
  overboughtLowerLevel: number;
  /** Sell signals: RSI below this level */
  overboughtUpperLevel: number;
  /** Buy signals: RSI above this level */
  oversoldLowerLevel: number;
  /** Buy signals: RSI below this level */
  oversoldUpperLevel: number;
  /** Minimum bars between two signals of the same side */
  minBarsBetweenSignals: number;
  waitForOppositeSignal: boolean;
  andMode: boolean;
}

export const defaultInputs: RsiBbStddevSignalInputs = {
  maModeInput: true,
  maTypeInput: 'SMA',
  maLengthInput: 14,
  bbModeInput: true,
  bbTypeInput: 'SMA',
  bbLengthInput: 14,
  bbMultInput: 2.0,
  divergenceModeInput: true,
  overboughtOversold: true,
  rsiSourceInput: 'close',
  rsiLengthInput: 14,
  overboughtLowerLevel: 60,
  overboughtUpperLevel: 80,
  oversoldLowerLevel: 20,
  oversoldUpperLevel: 40,
  minBarsBetweenSignals: 5,
  waitForOppositeSignal: false,
  andMode: false,
};

const G1 = '🔧 Signal Settings 🔧';
const G2 = '🛠 Filters 🛠';

export const inputConfig: InputConfig[] = [
  { id: 'maModeInput', type: 'bool', title: 'Moving Average Signal ⮕', defval: true, group: G1, inline: 'MA', display: 'data_window' },
  { id: 'maTypeInput', type: 'string', title: 'Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA', 'HMA', 'KAMA', 'VWMA', 'ALMA', 'TEMA', 'ZLEMA', 'LSMA'], group: G1, inline: 'MA', display: 'data_window' },
  { id: 'maLengthInput', type: 'int', title: 'Length', defval: 14, group: G1, inline: 'MA', display: 'data_window' },
  { id: 'bbModeInput', type: 'bool', title: 'Bollinger Bands Signal ⮕', defval: true, group: G1, inline: 'signal', display: 'data_window' },
  { id: 'bbTypeInput', type: 'string', title: 'Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA', 'HMA', 'VWMA', 'ALMA', 'TEMA', 'ZLEMA', 'LSMA'], group: G1, inline: 'signal', display: 'data_window' },
  { id: 'bbLengthInput', type: 'int', title: 'Length', defval: 14, group: G1, inline: 'signal', display: 'data_window' },
  { id: 'bbMultInput', type: 'float', title: 'StdDev', defval: 2.0, min: 0.001, max: 50, step: 0.1, group: G1, inline: 'signal', display: 'data_window' },
  { id: 'divergenceModeInput', type: 'bool', title: 'Divergence Signal', defval: true, group: G1, inline: 'Div', display: 'data_window' },
  { id: 'overboughtOversold', type: 'bool', title: 'RSI Filter ⮕', defval: true, group: G2, inline: 'RSI' },
  { id: 'rsiSourceInput', type: 'source', title: 'Source', defval: 'close', group: G2, inline: 'RSI' },
  { id: 'rsiLengthInput', type: 'int', title: 'Length', defval: 14, min: 1, group: G2, inline: 'RSI', tooltip: 'This mode works with MA, BB, Div signals' },
  { id: 'overboughtLowerLevel', type: 'int', title: '🪫 Sell ⮕ Above⬆', defval: 60, min: 0, max: 100, group: G2, inline: 'overbought', tooltip: 'For Sell signals' },
  { id: 'overboughtUpperLevel', type: 'int', title: 'Below⬇', defval: 80, min: 0, max: 100, group: G2, inline: 'overbought', tooltip: 'For Sell signals' },
  { id: 'oversoldLowerLevel', type: 'int', title: '🔋 Buy ⮕ Above⬆', defval: 20, min: 0, max: 100, group: G2, inline: 'oversold', tooltip: 'For Buy signals' },
  { id: 'oversoldUpperLevel', type: 'int', title: 'Below⬇', defval: 40, min: 0, max: 100, group: G2, inline: 'oversold', tooltip: 'For Buy signals' },
  { id: 'minBarsBetweenSignals', type: 'int', title: 'Reentry pause', defval: 5, min: 0, group: G2, inline: 'wait' },
  { id: 'waitForOppositeSignal', type: 'bool', title: 'Wait Opposite', defval: false, group: G2, inline: 'wait' },
  { id: 'andMode', type: 'bool', title: 'AND Mode', defval: false, group: G2, inline: 'wait', display: 'data_window' },
];

const NONE_COLOR = String(color.new(color.white, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: '#7E57C2', lineWidth: 1 },
  { id: 'plot1', title: 'RSI-based MA', color: color.yellow, lineWidth: 1 },
  { id: 'plot2', title: 'Upper Bollinger Band', color: color.green, lineWidth: 1 },
  { id: 'plot3', title: 'Lower Bollinger Band', color: color.green, lineWidth: 1 },
  { id: 'plot4', title: 'Regular Bullish', color: color.green, lineWidth: 2, display: 'pane' },
  { id: 'plot5', title: 'Regular Bearish', color: color.red, lineWidth: 2, display: 'pane' },
  { id: 'plot6', title: '🔌Connector🔌', color: NONE_COLOR, lineWidth: 1 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 60, title: 'Upper Band', color: '#787B86', linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'Middle Level', color: '#787B86', linestyle: 'dotted' },
  { id: 'hline_lower', price: 40, title: 'Lower Band', color: '#787B86', linestyle: 'dashed' },
];

/** fill(obPlot, osPlot, title = "Background", color = color.rgb(126, 87, 194, 90)) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_background', plot1: 'hline_upper', plot2: 'hline_lower', color: String(color.rgb(126, 87, 194, 90)), title: 'Background' },
];

export const metadata = {
  title: 'RSI Signal [trade_lexx]',
  shortTitle: 'RSI Signal [trade_lexx]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

/** A ta.sma call site that only runs on some bars: its history is the values of the bars where it runs */
function smaSite(length: number) {
  const hist: number[] = [];
  return (v: number) => {
    hist.push(v);
    if (hist.length < length) return NaN;
    let s = 0;
    for (let k = hist.length - length; k < hist.length; k++) s += hist[k];
    return s / length;
  };
}

/** A ta.stdev (biased) call site that only runs on some bars */
function stdevSite(length: number) {
  const hist: number[] = [];
  return (v: number) => {
    hist.push(v);
    if (hist.length < length) return NaN;
    let s = 0;
    for (let k = hist.length - length; k < hist.length; k++) s += hist[k];
    const mean = s / length;
    let ss = 0;
    for (let k = hist.length - length; k < hist.length; k++) ss += (hist[k] - mean) ** 2;
    return Math.sqrt(ss / length);
  };
}

/** A ta.rma call site that only runs on some bars: SMA seed of its first `length` values, then recursive */
function rmaSite(length: number) {
  const seed = smaSite(length);
  let prev = NaN;
  return (v: number) => {
    const s = seed(v);
    prev = isNaN(prev) ? s : (v + (length - 1) * prev) / length;
    return prev;
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiBbStddevSignalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // RSI
  const src = getSourceSeries(bars, cfg.rsiSourceInput);
  const change = A(ta.change(src));
  const up = A(ta.rma(S(change.map((c) => Math.max(c, 0))), cfg.rsiLengthInput));
  const down = A(ta.rma(S(change.map((c) => -Math.min(c, 0))), cfg.rsiLengthInput));
  // rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))
  const rsi = up.map((u, i) => (eq(down[i], 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / down[i])));
  const rsiS = S(rsi);

  // ma(source, length, MAtype): one call site for the MA, one for the bands
  const ma = (length: number, type: MaType): number[] => {
    switch (type) {
      case 'SMA': return A(ta.sma(rsiS, length));
      case 'EMA': return A(ta.ema(rsiS, length));
      case 'WMA': return A(ta.wma(rsiS, length));
      case 'VWMA': return A(ta.vwma(rsiS, length, S(bars.map((b) => b.volume ?? NaN))));
      case 'HMA': return A(ta.hma(rsiS, length));
      case 'ALMA': return A(ta.alma(rsiS, length, 0.85, 6));
      case 'TEMA': {
        const e1 = ta.ema(rsiS, length);
        const e2 = ta.ema(e1, length);
        const e3 = A(ta.ema(e2, length));
        const a1 = A(e1);
        const a2 = A(e2);
        return a1.map((v, i) => 3 * v - 3 * a2[i] + e3[i]);
      }
      case 'ZLEMA': {
        // lag = (length - 1) / 2 (fractional in Pine v6); ema[lag] truncates the index
        const lag = Math.trunc((length - 1) / 2);
        const e = A(ta.ema(rsiS, length));
        return e.map((_v, i) => (i - lag >= 0 ? e[i - lag] : NaN));
      }
      case 'KAMA': {
        // var float kama: ta.sma while kama is na, else ta.stdev / ta.atr (histories of the bars of each branch)
        const sma = smaSite(length);
        const sd = stdevSite(length);
        const atr = rmaSite(length);
        const out: number[] = new Array(n);
        let kama = NaN;
        for (let i = 0; i < n; i++) {
          if (isNaN(kama)) {
            kama = sma(rsi[i]);
          } else {
            const b = bars[i];
            const tr = i > 0
              ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))
              : b.high - b.low;
            const volatility = sd(rsi[i]);
            const atrV = atr(tr);
            // efficiency_ratio = volatility / ta.atr(length): an ATR of 0 gives +infinity (or na for 0 / 0); math.pow
            // and math.min use the infinite value (sc = 0.666)
            const er = volatility / atrV;
            let sc = Math.pow(er, 2);
            // math.max(0.666, math.min(0.0645, sc)): na when sc is na
            sc = isNaN(sc) ? NaN : Math.max(0.666, Math.min(0.0645, sc));
            kama = sc * rsi[i] + (1 - sc) * kama;
          }
          out[i] = kama;
        }
        return out;
      }
      case 'LSMA': {
        // var float lsma: ta.sma while lsma is na, else (source + lsma[1] * (length - 1)) / length
        const sma = smaSite(length);
        const out: number[] = new Array(n);
        let lsma = NaN;
        for (let i = 0; i < n; i++) {
          lsma = isNaN(lsma) ? sma(rsi[i]) : (rsi[i] + lsma * (length - 1)) / length;
          out[i] = lsma;
        }
        return out;
      }
    }
    return new Array(n).fill(NaN);
  };

  const nanArr = () => new Array<number>(n).fill(NaN);
  const smoothingMA = cfg.maModeInput ? ma(cfg.maLengthInput, cfg.maTypeInput) : nanArr();
  const smoothingBB = cfg.bbModeInput ? ma(cfg.bbLengthInput, cfg.bbTypeInput) : nanArr();
  const smoothingStDev = cfg.bbModeInput ? A(ta.stdev(rsiS, cfg.bbLengthInput)).map((v) => v * cfg.bbMultInput) : nanArr();
  const bbUpper = smoothingBB.map((v, i) => v + smoothingStDev[i]);
  const bbLower = smoothingBB.map((v, i) => v - smoothingStDev[i]);

  // Divergence: pivots of the RSI, 5 bars left, 1 bar right
  const lookbackRight = 1;
  const lookbackLeft = 5;
  const rangeUpper = 60;
  const rangeLower = 5;
  const rsiLBR = (i: number) => (i - lookbackRight >= 0 ? rsi[i - lookbackRight] : NaN);
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond0: boolean[] = new Array(n).fill(false);
  const bearCond0: boolean[] = new Array(n).fill(false);
  if (cfg.divergenceModeInput) {
    const pl = A(ta.pivotlow(rsiS, lookbackLeft, lookbackRight));
    const ph = A(ta.pivothigh(rsiS, lookbackLeft, lookbackRight));
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plRsi: number[] = [];
    const plLow: number[] = [];
    const phRsi: number[] = [];
    const phHigh: number[] = [];
    // `and` is lazy: the ta.barssince of _inRange(...) only runs when the left side is true (one state per site)
    let plCalls = NaN;
    let phCalls = NaN;
    for (let i = 0; i < n; i++) {
      const r = rsiLBR(i);
      const lowLBR = i - lookbackRight >= 0 ? bars[i - lookbackRight].low : NaN;
      const highLBR = i - lookbackRight >= 0 ? bars[i - lookbackRight].high : NaN;
      const prevPl = i > 0 && plFound[i - 1];
      plFound[i] = !isNaN(pl[i]);
      if (plFound[i]) {
        plRsi.push(r);
        plLow.push(lowLBR);
      }
      const vwPlRsi = plRsi.length >= 2 ? plRsi[plRsi.length - 2] : NaN;
      const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
      let rsiHL = false;
      if (gt(r, vwPlRsi)) {
        if (prevPl) plCalls = 0;
        else if (!isNaN(plCalls)) plCalls++;
        rsiHL = rangeLower <= plCalls && plCalls <= rangeUpper;
      }
      const priceLL = lt(lowLBR, vwPlLow);
      bullCond0[i] = priceLL && rsiHL && plFound[i];

      const prevPh = i > 0 && phFound[i - 1];
      phFound[i] = !isNaN(ph[i]);
      if (phFound[i]) {
        phRsi.push(r);
        phHigh.push(highLBR);
      }
      const vwPhRsi = phRsi.length >= 2 ? phRsi[phRsi.length - 2] : NaN;
      const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
      let rsiLH = false;
      if (lt(r, vwPhRsi)) {
        if (prevPh) phCalls = 0;
        else if (!isNaN(phCalls)) phCalls++;
        rsiLH = rangeLower <= phCalls && phCalls <= rangeUpper;
      }
      const priceHH = gt(highLBR, vwPhHigh);
      bearCond0[i] = priceHH && rsiLH && phFound[i];
    }
  }

  // ta.crossover(a, b): a > b and a <= b on the previous bar where both were not na (Pine keeps the last
  // non-na pair: the KAMA average is na on every other bar during its warm-up); crossunder likewise. Exact
  // comparisons: ta.crossover / ta.crossunder do not use the 1e-10 tolerance of the operators
  const lastPair = (a: number[], b: number[]) => {
    const prev: number[] = new Array(n).fill(-1);
    let last = -1;
    for (let i = 0; i < n; i++) {
      prev[i] = last;
      if (!isNaN(a[i]) && !isNaN(b[i])) last = i;
    }
    return prev;
  };
  const crossover = (a: number[], b: number[], prev: number[], i: number) =>
    prev[i] >= 0 && a[i] > b[i] && a[prev[i]] <= b[prev[i]];
  const crossunder = (a: number[], b: number[], prev: number[], i: number) =>
    prev[i] >= 0 && a[i] < b[i] && a[prev[i]] >= b[prev[i]];
  const prevMA = lastPair(rsi, smoothingMA);
  const prevLower = lastPair(rsi, bbLower);
  const prevUpper = lastPair(rsi, bbUpper);

  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const finalSignal: number[] = new Array(n).fill(0);
  const markers: MarkerData[] = [];
  const interval = barInterval(bars);
  const green = String(color.new(color.green, 0));
  const red = String(color.new(color.red, 0));
  const textColor = color.blue; // Pine default plotshape text colour
  const t = (i: number) => bars[i].time;
  // id: the plotshape of the original (shape<k>, k counted in declaration order)
  const buyAt = (id: string, i: number, position: MarkerData['position'], text: string, forceOverlay = false) => {
    markers.push({ id, time: t(i), position, shape: 'triangleUp', color: green, text, textColor, ...(forceOverlay ? { forceOverlay } : {}) });
  };
  const sellAt = (id: string, i: number, position: MarkerData['position'], text: string, forceOverlay = false) => {
    markers.push({ id, time: t(i), position, shape: 'triangleDown', color: red, text, textColor, ...(forceOverlay ? { forceOverlay } : {}) });
  };
  const finalBuyFlags: boolean[] = new Array(n).fill(false);
  const finalSellFlags: boolean[] = new Array(n).fill(false);

  let lastBuyBar = NaN;
  let lastSellBar = NaN;
  let lastSignal = NaN;
  const pauseOk = (last: number, i: number) => isNaN(last) || i - last >= cfg.minBarsBetweenSignals;
  for (let i = 0; i < n; i++) {
    let buyMA = crossover(rsi, smoothingMA, prevMA, i) && pauseOk(lastBuyBar, i);
    let sellMA = crossunder(rsi, smoothingMA, prevMA, i) && pauseOk(lastSellBar, i);
    let buyBB = crossover(rsi, bbLower, prevLower, i) && pauseOk(lastBuyBar, i);
    let sellBB = crossunder(rsi, bbUpper, prevUpper, i) && pauseOk(lastSellBar, i);
    let buyDiv = bullCond0[i] && pauseOk(lastBuyBar, i);
    let sellDiv = bearCond0[i] && pauseOk(lastSellBar, i);
    let bull = bullCond0[i];
    let bear = bearCond0[i];

    if (cfg.waitForOppositeSignal) {
      const buyOk = isNaN(lastSignal) || lastSignal === -1;
      const sellOk = isNaN(lastSignal) || lastSignal === 1;
      buyMA = buyMA && buyOk;
      sellMA = sellMA && sellOk;
      buyBB = buyBB && buyOk;
      sellBB = sellBB && sellOk;
      buyDiv = buyDiv && buyOk;
      sellDiv = sellDiv && sellOk;
      bull = bull && buyOk;
      bear = bear && sellOk;
    }
    if (cfg.overboughtOversold) {
      const r = rsi[i];
      const buyZone = ge(r, cfg.oversoldLowerLevel) && le(r, cfg.oversoldUpperLevel);
      const sellZone = ge(r, cfg.overboughtLowerLevel) && le(r, cfg.overboughtUpperLevel);
      buyMA = buyMA && buyZone;
      sellMA = sellMA && sellZone;
      buyBB = buyBB && buyZone;
      sellBB = sellBB && sellZone;
      buyDiv = buyDiv && buyZone;
      sellDiv = sellDiv && sellZone;
      bull = bull && buyZone;
      bear = bear && sellZone;
    }
    bullCond[i] = bull;
    bearCond[i] = bear;

    if (buyMA) { lastBuyBar = i; lastSignal = 1; }
    if (sellMA) { lastSellBar = i; lastSignal = -1; }
    if (buyBB) { lastBuyBar = i; lastSignal = 1; }
    if (sellBB) { lastSellBar = i; lastSignal = -1; }
    if (buyDiv) { lastBuyBar = i; lastSignal = 1; }
    if (sellDiv) { lastSellBar = i; lastSignal = -1; }

    const ma = cfg.maModeInput;
    const bb = cfg.bbModeInput;
    const dv = cfg.divergenceModeInput;
    // plotshape(bullCond ? rsiLBR : na, offset = -lookbackRight, location.absolute, text = "Div") and the bearish one
    // ("Regular Bullish / Bearish Label", display.none: hidden by default): the value of bar i drawn on bar i - 1
    const lbr = rsiLBR(i);
    if (i - lookbackRight >= 0 && !isNaN(lbr)) {
      const lblTime = barTime(bars, i - lookbackRight, interval);
      if (bull) markers.push({ id: 'shape0', time: lblTime, position: 'atPriceMiddle', price: lbr, shape: 'triangleUp', color: green, text: 'Div', textColor });
      if (bear) markers.push({ id: 'shape1', time: lblTime, position: 'atPriceMiddle', price: lbr, shape: 'triangleDown', color: red, text: 'Div', textColor });
    }
    // Oscillator signals: location.bottom / top, Div at the RSI of the pivot bar (location.absolute)
    if (ma && buyMA) buyAt('shape2', i, 'bottom', 'MA');
    if (ma && sellMA) sellAt('shape3', i, 'top', 'MA');
    if (bb && buyBB) buyAt('shape4', i, 'bottom', 'BB');
    if (bb && sellBB) sellAt('shape5', i, 'top', 'BB');
    const r1 = rsiLBR(i);
    if (buyDiv && !isNaN(r1)) {
      markers.push({ id: 'shape6', time: t(i), position: 'atPriceMiddle', price: r1, shape: 'triangleUp', color: green, text: 'Div', textColor });
    }
    if (sellDiv && !isNaN(r1)) {
      markers.push({ id: 'shape7', time: t(i), position: 'atPriceMiddle', price: r1, shape: 'triangleDown', color: red, text: 'Div', textColor });
    }
    // Chart signals (force_overlay)
    if (!cfg.andMode) {
      if (ma && buyMA) buyAt('shape8', i, 'belowBar', 'Buy', true);
      if (ma && sellMA) sellAt('shape9', i, 'aboveBar', 'Sell', true);
      if (bb && buyBB) buyAt('shape10', i, 'belowBar', 'Buy', true);
      if (bb && sellBB) sellAt('shape11', i, 'aboveBar', 'Sell', true);
      if (dv && buyDiv) buyAt('shape12', i, 'belowBar', 'Buy', true);
      if (dv && sellDiv) sellAt('shape13', i, 'aboveBar', 'Sell', true);
    }
    const bMA = ma && buyMA;
    const bBB = bb && buyBB;
    const bDv = dv && buyDiv;
    const sMA = ma && sellMA;
    const sBB = bb && sellBB;
    const sDv = dv && sellDiv;
    const buySaD = [bMA && bBB, bMA && bDv, bBB && bDv, bMA && bBB && bDv];
    const sellSaD = [sMA && sBB, sMA && sDv, sBB && sDv, sMA && sBB && sDv];
    const sadText = ['MA+BB', 'MA+Div', 'BB+Div', 'MA+BB+Div'];
    if (cfg.andMode) {
      buySaD.forEach((on, k) => { if (on) buyAt(`shape${14 + k}`, i, 'belowBar', sadText[k], true); });
      sellSaD.forEach((on, k) => { if (on) sellAt(`shape${18 + k}`, i, 'aboveBar', sadText[k], true); });
    }
    const finalBuy = cfg.andMode ? buySaD.some(Boolean) : bMA || bBB || bDv;
    const finalSell = cfg.andMode ? sellSaD.some(Boolean) : sMA || sBB || sDv;
    finalSignal[i] = finalBuy ? 1 : finalSell ? -1 : 0;
    finalBuyFlags[i] = finalBuy;
    finalSellFlags[i] = finalSell;
  }

  // plot(plFound ? rsiLBR : na, offset = -lookbackRight, color = bullCond ? bullColor : noneColor): bar i on bar i - 1
  const divPlot = (found: boolean[], cond: boolean[], c: string) => {
    const out: Array<{ time: number; value: number; color: string }> = [];
    for (let i = lookbackRight; i < n; i++) {
      out.push({ time: barTime(bars, i - lookbackRight, interval), value: found[i] ? rsiLBR(i) : NaN, color: cond[i] ? c : NONE_COLOR });
    }
    return out;
  };

  const bbFill = String(color.new(color.green, 90));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: rsi[i], color: '#7E57C2' })),
      plot1: bars.map((b, i) => ({ time: b.time, value: smoothingMA[i], color: color.yellow })),
      plot2: bars.map((b, i) => ({ time: b.time, value: bbUpper[i], color: color.green })),
      plot3: bars.map((b, i) => ({ time: b.time, value: bbLower[i], color: color.green })),
      plot4: divPlot(plFound, bullCond, color.green),
      plot5: divPlot(phFound, bearCond, color.red),
      plot6: bars.map((b, i) => ({ time: b.time, value: finalSignal[i], color: NONE_COLOR })),
    },
    hlines: [
      { value: cfg.overboughtLowerLevel, options: { title: 'Upper Band', color: '#787B86', linestyle: 'dashed' } },
      { value: 50, options: { title: 'Middle Level', color: '#787B86', linestyle: 'dotted' } },
      { value: cfg.oversoldUpperLevel, options: { title: 'Lower Band', color: '#787B86', linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_upper', plot2: 'hline_lower', options: { title: 'Background' },
        colors: new Array<string>(n).fill(String(color.rgb(126, 87, 194, 90))) },
      // fill(bbUpperBand, bbLowerBand, color = bbModeInput ? color.new(color.green, 90) : na)
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Bollinger Bands Background Fill' },
        colors: new Array<string>(n).fill(cfg.bbModeInput ? bbFill : 'transparent') },
    ],
    markers,
    // alertcondition(finalBuySignal, 'Buy Signal') / alertcondition(finalSellSignal, 'Sell Signal')
    alerts: alertStates(alertConditions, bars, [finalBuyFlags, finalSellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Final Buy Signal Triggered' },
  { id: 'alert1', title: 'Sell Signal', message: 'Final Sell Signal Triggered' },
];

export const RsiBbStddevSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
