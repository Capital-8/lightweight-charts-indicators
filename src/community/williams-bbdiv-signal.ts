/**
 * Williams Signal (Williams %R with MA, Bollinger Band and divergence signals)
 *
 * Williams %R = 100 * (src - highest(high, length)) / (highest - lowest(low, length)). A moving average of %R
 * (SMA, EMA, WMA, HMA, KAMA, VWMA, ALMA, TEMA, ZLEMA or LSMA) and Bollinger Bands on %R (a moving average +- stdev *
 * mult). Regular divergences between %R pivots (5 bars left, 1 bar right) and price. Buy / sell signals: %R crossing
 * over / under the MA, crossing over the lower band / under the upper band, and the divergences, with a re-entry
 * pause in bars, an optional wait for the opposite signal, a %R zone filter and an optional RSI filter. The signals
 * are drawn in the pane and on the price chart (each signal alone, or in AND mode the combinations of two or three
 * signals on the same bar). A transparent "Connector" plot gives 1 (buy), -1 (sell) or 0.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' and 'Sell Signal', true on the bars of the final buy /
 * sell signal (the Connector at 1 / -1). The "Regular Bullish / Bearish Label" shapes ("Div" on the pivot bar) are
 * hidden by default.
 *
 * Reference: "Williams Signal [trade_lexx]" by trade_lexx
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  taCore, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig,
  type FillConfig, type Bar, type SourceType, callsite,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export type WilliamsBbdivSignalMAType = 'SMA' | 'EMA' | 'WMA' | 'HMA' | 'KAMA' | 'VWMA' | 'ALMA' | 'TEMA' | 'ZLEMA' | 'LSMA';
export type WilliamsBbdivSignalBBType = Exclude<WilliamsBbdivSignalMAType, 'KAMA'>;

export interface WilliamsBbdivSignalInputs {
  /** Moving average signal on / off */
  maModeInput: boolean;
  maTypeInput: WilliamsBbdivSignalMAType;
  maLengthInput: number;
  /** Bollinger Bands signal on / off */
  bbModeInput: boolean;
  bbTypeInput: WilliamsBbdivSignalBBType;
  bbLengthInput: number;
  bbMultInput: number;
  /** Divergence signal on / off */
  divergenceModeInput: boolean;
  /** %R zone filter */
  wrFilterEnabled: boolean;
  /** Williams %R source */
  src: SourceType;
  /** Williams %R length */
  length: number;
  wrOverboughtLowerLevel: number;
  wrOverboughtUpperLevel: number;
  wrOversoldLowerLevel: number;
  wrOversoldUpperLevel: number;
  rsiFilterEnabled: boolean;
  rsiSourceInput: SourceType;
  rsiLengthInput: number;
  rsiSellLevelLower: number;
  rsiSellLevelUpper: number;
  rsiBuyLevelLower: number;
  rsiBuyLevelUpper: number;
  /** Re-entry pause in bars */
  minBarsBetweenSignals: number;
  waitForOppositeSignal: boolean;
  andMode: boolean;
}

export const defaultInputs: WilliamsBbdivSignalInputs = {
  maModeInput: true,
  maTypeInput: 'SMA',
  maLengthInput: 14,
  bbModeInput: true,
  bbTypeInput: 'SMA',
  bbLengthInput: 14,
  bbMultInput: 2.0,
  divergenceModeInput: true,
  wrFilterEnabled: true,
  src: 'close',
  length: 14,
  wrOverboughtLowerLevel: -35,
  wrOverboughtUpperLevel: -10,
  wrOversoldLowerLevel: -95,
  wrOversoldUpperLevel: -75,
  rsiFilterEnabled: false,
  rsiSourceInput: 'close',
  rsiLengthInput: 14,
  rsiSellLevelLower: 60,
  rsiSellLevelUpper: 100,
  rsiBuyLevelLower: 1,
  rsiBuyLevelUpper: 40,
  minBarsBetweenSignals: 7,
  waitForOppositeSignal: false,
  andMode: false,
};

const GROUP1 = '🔧 Signal Settings 🔧';
const GROUP3 = '🛠 Filters 🛠';
const MA_TYPES = ['SMA', 'EMA', 'WMA', 'HMA', 'KAMA', 'VWMA', 'ALMA', 'TEMA', 'ZLEMA', 'LSMA'];
const BB_TYPES = ['SMA', 'EMA', 'WMA', 'HMA', 'VWMA', 'ALMA', 'TEMA', 'ZLEMA', 'LSMA'];

export const inputConfig: InputConfig[] = [
  { id: 'maModeInput', type: 'bool', title: 'Moving Average Signal ⮕', defval: true, group: GROUP1, inline: 'MA' },
  { id: 'maTypeInput', type: 'string', title: 'Type', defval: 'SMA', options: MA_TYPES, group: GROUP1, inline: 'MA' },
  { id: 'maLengthInput', type: 'int', title: 'Length', defval: 14, group: GROUP1, inline: 'MA' },
  { id: 'bbModeInput', type: 'bool', title: 'Bollinger Bands Signal ⮕', defval: true, group: GROUP1, inline: 'signal' },
  { id: 'bbTypeInput', type: 'string', title: 'Type', defval: 'SMA', options: BB_TYPES, group: GROUP1, inline: 'signal' },
  { id: 'bbLengthInput', type: 'int', title: 'Length', defval: 14, group: GROUP1, inline: 'signal' },
  { id: 'bbMultInput', type: 'float', title: 'StdDev', defval: 2.0, min: 0.001, max: 50, step: 0.1, group: GROUP1, inline: 'signal' },
  { id: 'divergenceModeInput', type: 'bool', title: 'Divergence Signal', defval: true, group: GROUP1, inline: 'Div' },
  { id: 'wrFilterEnabled', type: 'bool', title: 'Wil Filter ⮕', defval: true, group: GROUP3, inline: 'WR' },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: GROUP3, inline: 'WR' },
  { id: 'length', type: 'int', title: 'Length', defval: 14, group: GROUP3, inline: 'WR' },
  { id: 'wrOverboughtLowerLevel', type: 'int', title: '🪫 Sell ⮕ Above⬆', defval: -35, min: -100, max: 0, group: GROUP3,
    tooltip: 'For Sell signals', inline: 'overbought' },
  { id: 'wrOverboughtUpperLevel', type: 'int', title: 'Below⬇', defval: -10, min: -100, max: 0, group: GROUP3,
    tooltip: 'For Sell signals', inline: 'overbought' },
  { id: 'wrOversoldLowerLevel', type: 'int', title: '🔋 Buy ⮕ Above⬆', defval: -95, min: -100, max: 0, group: GROUP3,
    tooltip: 'For Buy signals', inline: 'oversold' },
  { id: 'wrOversoldUpperLevel', type: 'int', title: 'Below⬇', defval: -75, min: -100, max: 0, group: GROUP3,
    tooltip: 'For Buy signals', inline: 'oversold' },
  { id: 'rsiFilterEnabled', type: 'bool', title: 'RSI Filter ⮕', defval: false, group: GROUP3, inline: 'RSI' },
  { id: 'rsiSourceInput', type: 'source', title: 'Source', defval: 'close', group: GROUP3, inline: 'RSI' },
  { id: 'rsiLengthInput', type: 'int', title: 'Length', defval: 14, min: 1, group: GROUP3, inline: 'RSI' },
  { id: 'rsiSellLevelLower', type: 'int', title: '🪫 Sell ⮕ Above⬆', defval: 60, min: 0, max: 100, group: GROUP3,
    tooltip: 'For Sell signals', inline: 'rsioverbought' },
  { id: 'rsiSellLevelUpper', type: 'int', title: 'Below⬇', defval: 100, min: 0, max: 100, group: GROUP3,
    tooltip: 'For Sell signals', inline: 'rsioverbought' },
  { id: 'rsiBuyLevelLower', type: 'int', title: '🔋 Buy ⮕ Above⬆', defval: 1, min: 0, max: 100, group: GROUP3,
    tooltip: 'For Buy signals', inline: 'rsioversold' },
  { id: 'rsiBuyLevelUpper', type: 'int', title: 'Below⬇', defval: 40, min: 0, max: 100, group: GROUP3,
    tooltip: 'For Buy signals', inline: 'rsioversold' },
  { id: 'minBarsBetweenSignals', type: 'int', title: 'Reentry pause', defval: 7, min: 0, group: GROUP3, inline: 'wait' },
  { id: 'waitForOppositeSignal', type: 'bool', title: 'Wait Opposite', defval: false, group: GROUP3, inline: 'wait' },
  { id: 'andMode', type: 'bool', title: 'AND Mode', defval: false, group: GROUP3, inline: 'wait' },
];

const GREEN = String(color.new(color.green, 0));
const RED = String(color.new(color.red, 0));
const NONE_COLOR = String(color.new(color.white, 100));
const BB_FILL = String(color.new(color.green, 90));
const HLINE_COLOR = '#787B86';
const ZONE_FILL = String(color.rgb(126, 87, 194, 90));
/** Pine default plotshape text colour */
const PINE_TEXT = '#2962FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '%R', color: '#7E57C2', lineWidth: 1 },
  { id: 'plot1', title: 'Williams %R-based MA', color: color.yellow, lineWidth: 1 },
  { id: 'plot2', title: 'Upper Bollinger Band', color: color.green, lineWidth: 1 },
  { id: 'plot3', title: 'Lower Bollinger Band', color: color.green, lineWidth: 1 },
  { id: 'plot4', title: 'Regular Bullish', color: color.green, lineWidth: 2, display: 'pane' },
  { id: 'plot5', title: 'Regular Bearish', color: color.red, lineWidth: 2, display: 'pane' },
  { id: 'plot6', title: '🔌Connector🔌', color: NONE_COLOR, lineWidth: 1 },
];

/** hline(wrOverboughtLowerLevel / -50 / wrOversoldUpperLevel) with the default levels */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: -35, title: 'Upper Band', color: HLINE_COLOR, linestyle: 'dashed' },
  { id: 'hline_mid', price: -50, title: 'Middle Level', color: HLINE_COLOR, linestyle: 'dotted' },
  { id: 'hline_lower', price: -75, title: 'Lower Band', color: HLINE_COLOR, linestyle: 'dashed' },
];

/** fill(obPlot, osPlot, title = "Background", color = color.rgb(126, 87, 194, 90)) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_zone', plot1: 'hline_upper', plot2: 'hline_lower', color: ZONE_FILL, title: 'Background' },
];

export const metadata = {
  title: 'Williams Signal [trade_lexx]',
  shortTitle: 'Williams Signal [trade_lexx]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

/**
 * A ta.* call inside an `if` branch: it receives the values of the bars where the branch runs only. `call(i)` is
 * the call on bar i (calls in bar order). The ta function is causal (its k-th output depends on its first k inputs),
 * so its outputs are computed once for the values so far followed by the values of all later bars (as if the branch
 * ran on every later bar), and computed again only when a bar is skipped.
 */
function branchSite(values: number[], fn: (a: number[]) => ArrayLike<number>): (i: number) => number {
  const got: number[] = [];
  let out: ArrayLike<number> = [];
  let fromBar = -1;
  let fromCall = 0;
  return (i: number) => {
    got.push(values[i]);
    const k = got.length - 1;
    if (fromBar < 0 || fromBar + (k - fromCall) !== i) {
      out = fn(got.concat(values.slice(i + 1)));
      fromBar = i;
      fromCall = k;
    }
    return (out[k] as number) ?? NaN;
  };
}

/**
 * kama(source, length) of the Pine script. `var float kama`: while it is na, kama := ta.sma(source, length) (that
 * ta.sma only receives the bars of this branch); else sc = max(0.666, min(0.0645, (stdev / atr)^2)) (0.666, or na
 * when stdev / atr is na) and kama := sc * source + (1 - sc) * kama[1]; the ta.stdev and ta.atr of the else branch
 * only receive the bars of that branch.
 */
function kamaMa(source: number[], length: number, bars: Bar[]): number[] {
  const n = source.length;
  const out: number[] = new Array(n);
  // ta.atr(length) = ta.rma(ta.tr(true), length); close[1] is the previous chart bar
  const tr = bars.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  const smaSite = branchSite(source, (a) => taCore.sma(a, length));
  const stdevSite = branchSite(source, (a) => taCore.stdev(a, length));
  const atrSite = branchSite(tr, (a) => taCore.rma(a, length));
  let k = NaN;
  for (let i = 0; i < n; i++) {
    if (isNaN(k)) {
      k = smaSite(i);
    } else {
      const volatility = stdevSite(i);
      const efficiencyRatio = volatility / atrSite(i);
      let sc = Math.pow(efficiencyRatio, 2);
      // math.min / math.max with na give na
      sc = isNaN(sc) ? NaN : Math.max(0.666, Math.min(0.0645, sc));
      k = sc * source[i] + (1 - sc) * out[i - 1];
    }
    out[i] = k;
  }
  return out;
}

/** lsma(source, length): while na, ta.sma(source, length) (bars of this branch only); else (source + lsma[1] * (length - 1)) / length */
function lsmaMa(source: number[], length: number): number[] {
  const n = source.length;
  const out: number[] = new Array(n);
  const smaSite = branchSite(source, (a) => taCore.sma(a, length));
  let l = NaN;
  for (let i = 0; i < n; i++) {
    l = isNaN(l) ? smaSite(i) : (source[i] + out[i - 1] * (length - 1)) / length;
    out[i] = l;
  }
  return out;
}

/** ma(source, length, MAtype) of the Pine script (one call site per call) */
function ma(source: number[], length: number, type: string, bars: Bar[]): number[] {
  const arr = (a: ArrayLike<number>) => Array.from(a, (v) => v ?? NaN);
  switch (type) {
    case 'SMA': return arr(taCore.sma(source, length));
    case 'EMA': return arr(taCore.ema(source, length));
    case 'WMA': return arr(taCore.wma(source, length));
    case 'VWMA': return arr(taCore.vwma(source, length, bars.map((b) => b.volume ?? NaN)));
    case 'KAMA': return kamaMa(source, length, bars);
    case 'HMA':
      if (Math.floor(length / 2) < 1) {
        throw new Error("Invalid value of the 'length' argument (0.0) in the 'wma' function. It must be > 0.");
      }
      return arr(taCore.hma(source, length));
    case 'ZLEMA': {
      // lag = (length - 1) / 2 (fractional in Pine v6); ema[lag] truncates the history offset
      const lag = Math.trunc((length - 1) / 2);
      const e = arr(taCore.ema(source, length));
      return e.map((_v, i) => (i - lag >= 0 ? e[i - lag] : NaN));
    }
    case 'TEMA': {
      const e1 = arr(taCore.ema(source, length));
      const e2 = arr(taCore.ema(e1, length));
      const e3 = arr(taCore.ema(e2, length));
      return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
    }
    case 'ALMA': return arr(taCore.alma(source, length, 0.85, 6));
    case 'LSMA': return lsmaMa(source, length);
    default: return new Array(source.length).fill(NaN);
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<WilliamsBbdivSignalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const arr = (a: ArrayLike<number>) => Array.from(a, (v) => v ?? NaN);

  // Williams %R: 100 * (src - max) / (max - min), a plain division (0 / 0 is na)
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const hh = arr(taCore.highest(bars.map((b) => b.high), cfg.length));
  const ll = arr(taCore.lowest(bars.map((b) => b.low), cfg.length));
  const percentR = src.map((s, i) => (100 * (s - hh[i])) / (hh[i] - ll[i]));

  const rsiSrc = getSourceSeries(bars, cfg.rsiSourceInput).toArray().map((v) => v ?? NaN);
  const rsi = arr(taCore.rsi(rsiSrc, cfg.rsiLengthInput));

  const nanArr = () => new Array<number>(n).fill(NaN);
  const smoothingMA = cfg.maModeInput ? ma(percentR, cfg.maLengthInput, cfg.maTypeInput, bars) : nanArr();
  const smoothingBB = cfg.bbModeInput ? ma(percentR, cfg.bbLengthInput, cfg.bbTypeInput, bars) : nanArr();
  const smoothingStDev = cfg.bbModeInput
    ? arr(taCore.stdev(percentR, cfg.bbLengthInput)).map((v) => v * cfg.bbMultInput) : nanArr();
  const bbUpper = smoothingBB.map((v, i) => v + smoothingStDev[i]);
  const bbLower = smoothingBB.map((v, i) => v - smoothingStDev[i]);

  // Divergence (lookbackRight = 1, lookbackLeft = 5, range 5..60)
  const lookbackRight = 1;
  const lookbackLeft = 5;
  const rangeUpper = 60;
  const rangeLower = 5;
  const percentRLBR = percentR.map((_v, i) => (i - lookbackRight >= 0 ? percentR[i - lookbackRight] : NaN));
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCondRaw: boolean[] = new Array(n).fill(false);
  const bearCondRaw: boolean[] = new Array(n).fill(false);
  if (cfg.divergenceModeInput) {
    const pivLow = arr(taCore.pivotlow(percentR, lookbackLeft, lookbackRight));
    const pivHigh = arr(taCore.pivothigh(percentR, lookbackLeft, lookbackRight));
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plR: number[] = [];
    const plLow: number[] = [];
    const phR: number[] = [];
    const phHigh: number[] = [];
    // `a and _inRange(found[1])` is lazy: the ta.barssince in _inRange only runs on the bars where `a` is true
    const plSince = callsite.barssince();
    const phSince = callsite.barssince();
    for (let i = 0; i < n; i++) {
      const r = percentRLBR[i];
      const lowLBR = i - lookbackRight >= 0 ? bars[i - lookbackRight].low : NaN;
      const highLBR = i - lookbackRight >= 0 ? bars[i - lookbackRight].high : NaN;
      const prevPl = i > 0 && plFound[i - 1];
      const prevPh = i > 0 && phFound[i - 1];

      plFound[i] = !isNaN(pivLow[i]);
      if (plFound[i]) {
        plR.push(r);
        plLow.push(lowLBR);
      }
      let percentRHL = false;
      if (gt(r, plR.length >= 2 ? plR[plR.length - 2] : NaN)) {
        const b = plSince(prevPl);
        percentRHL = rangeLower <= b && b <= rangeUpper;
      }
      const priceLL = lt(lowLBR, plLow.length >= 2 ? plLow[plLow.length - 2] : NaN);
      bullCondRaw[i] = priceLL && percentRHL && plFound[i];

      phFound[i] = !isNaN(pivHigh[i]);
      if (phFound[i]) {
        phR.push(r);
        phHigh.push(highLBR);
      }
      let percentRLH = false;
      if (lt(r, phR.length >= 2 ? phR[phR.length - 2] : NaN)) {
        const b = phSince(prevPh);
        percentRLH = rangeLower <= b && b <= rangeUpper;
      }
      const priceHH = gt(highLBR, phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN);
      bearCondRaw[i] = priceHH && percentRLH && phFound[i];
    }
  }

  // ta.crossover / ta.crossunder (exact comparisons)
  const crossMA = taCore.crossover(percentR, smoothingMA);
  const crossunderMA = taCore.crossunder(percentR, smoothingMA);
  const crossBB = taCore.crossover(percentR, bbLower);
  const crossunderBB = taCore.crossunder(percentR, bbUpper);

  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const buyMA: boolean[] = new Array(n).fill(false);
  const sellMA: boolean[] = new Array(n).fill(false);
  const buyBB: boolean[] = new Array(n).fill(false);
  const sellBB: boolean[] = new Array(n).fill(false);
  const buyDiv: boolean[] = new Array(n).fill(false);
  const sellDiv: boolean[] = new Array(n).fill(false);
  let lastBuyBar = NaN; // var int lastPercentRBuySignalBar = na
  let lastSellBar = NaN;
  let lastSignal = NaN; // 1 buy, -1 sell
  const pauseOk = (lastBar: number, i: number) => isNaN(lastBar) || i - lastBar >= cfg.minBarsBetweenSignals;
  for (let i = 0; i < n; i++) {
    const buyPause = pauseOk(lastBuyBar, i);
    const sellPause = pauseOk(lastSellBar, i);
    let bMA = crossMA[i] && buyPause;
    let sMA = crossunderMA[i] && sellPause;
    let bBB = crossBB[i] && buyPause;
    let sBB = crossunderBB[i] && sellPause;
    let bDiv = bullCondRaw[i] && buyPause;
    let sDiv = bearCondRaw[i] && sellPause;
    let bull = bullCondRaw[i];
    let bear = bearCondRaw[i];
    if (cfg.waitForOppositeSignal) {
      const okBuy = isNaN(lastSignal) || lastSignal === -1;
      const okSell = isNaN(lastSignal) || lastSignal === 1;
      bMA = bMA && okBuy;
      sMA = sMA && okSell;
      bBB = bBB && okBuy;
      sBB = sBB && okSell;
      bDiv = bDiv && okBuy;
      sDiv = sDiv && okSell;
      bull = bull && okBuy;
      bear = bear && okSell;
    }
    if (cfg.wrFilterEnabled) {
      const r = percentR[i];
      const inBuy = ge(r, cfg.wrOversoldLowerLevel) && le(r, cfg.wrOversoldUpperLevel);
      const inSell = ge(r, cfg.wrOverboughtLowerLevel) && le(r, cfg.wrOverboughtUpperLevel);
      bMA = bMA && inBuy;
      sMA = sMA && inSell;
      bBB = bBB && inBuy;
      sBB = sBB && inSell;
      bDiv = bDiv && inBuy;
      sDiv = sDiv && inSell;
      bull = bull && inBuy;
      bear = bear && inSell;
    }
    if (cfg.rsiFilterEnabled) {
      const r = rsi[i];
      const inBuy = ge(r, cfg.rsiBuyLevelLower) && le(r, cfg.rsiBuyLevelUpper);
      const inSell = ge(r, cfg.rsiSellLevelLower) && le(r, cfg.rsiSellLevelUpper);
      bMA = bMA && inBuy;
      sMA = sMA && inSell;
      bBB = bBB && inBuy;
      sBB = sBB && inSell;
      bDiv = bDiv && inBuy;
      sDiv = sDiv && inSell;
      bull = bull && inBuy;
      bear = bear && inSell;
    }
    if (bMA) { lastBuyBar = i; lastSignal = 1; }
    if (sMA) { lastSellBar = i; lastSignal = -1; }
    if (bBB) { lastBuyBar = i; lastSignal = 1; }
    if (sBB) { lastSellBar = i; lastSignal = -1; }
    if (bDiv) { lastBuyBar = i; lastSignal = 1; }
    if (sDiv) { lastSellBar = i; lastSignal = -1; }
    buyMA[i] = bMA;
    sellMA[i] = sMA;
    buyBB[i] = bBB;
    sellBB[i] = sBB;
    buyDiv[i] = bDiv;
    sellDiv[i] = sDiv;
    bullCond[i] = bull;
    bearCond[i] = bear;
  }

  const interval = barInterval(bars);
  const t = (i: number) => bars[i].time;
  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const plot3 = [];
  const plot4 = [];
  const plot5 = [];
  const plot6 = [];
  const bbFill: string[] = new Array(n).fill(cfg.bbModeInput ? BB_FILL : 'transparent');
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  // id: the plotshape of the original that draws the marker (shape<k>, in declaration order)
  const mark = (i: number, id: string, m: Omit<MarkerData, 'time' | 'textColor' | 'size' | 'id'>) => {
    markers.push({ time: t(i), textColor: PINE_TEXT, id, ...m });
  };
  for (let i = 0; i < n; i++) {
    const time = t(i);
    plot0.push({ time, value: fin(percentR[i]), color: '#7E57C2' });
    plot1.push({ time, value: fin(smoothingMA[i]), color: color.yellow });
    plot2.push({ time, value: fin(bbUpper[i]), color: color.green });
    plot3.push({ time, value: fin(bbLower[i]), color: color.green });
    // plot(plFound ? percentRLBR : na, offset = -lookbackRight, color = bullCond ? bullColor : noneColor):
    // the value of bar i is drawn on bar i - 1
    if (i - lookbackRight >= 0) {
      const tt = barTime(bars, i - lookbackRight, interval);
      plot4.push({ time: tt, value: plFound[i] ? fin(percentRLBR[i]) : NaN, color: bullCond[i] ? GREEN : NONE_COLOR });
      plot5.push({ time: tt, value: phFound[i] ? fin(percentRLBR[i]) : NaN, color: bearCond[i] ? RED : NONE_COLOR });
    }

    const mBuyMA = cfg.maModeInput && buyMA[i];
    const mSellMA = cfg.maModeInput && sellMA[i];
    const mBuyBB = cfg.bbModeInput && buyBB[i];
    const mSellBB = cfg.bbModeInput && sellBB[i];
    const mBuyDiv = cfg.divergenceModeInput && buyDiv[i];
    const mSellDiv = cfg.divergenceModeInput && sellDiv[i];

    // plotshape(bullCond ? percentRLBR : na, offset = -lookbackRight, location.absolute, text = "Div") and the
    // bearish one ("Regular Bullish / Bearish Label", display.none: hidden by default): bar i drawn on bar i - 1
    const lbr = fin(percentRLBR[i]);
    if (i - lookbackRight >= 0 && !isNaN(lbr)) {
      const tt = barTime(bars, i - lookbackRight, interval);
      if (bullCond[i]) {
        markers.push({ time: tt, textColor: PINE_TEXT, id: 'shape0', position: 'atPriceMiddle', price: lbr, shape: 'triangleUp', color: GREEN, text: 'Div' });
      }
      if (bearCond[i]) {
        markers.push({ time: tt, textColor: PINE_TEXT, id: 'shape1', position: 'atPriceMiddle', price: lbr, shape: 'triangleDown', color: RED, text: 'Div' });
      }
    }
    // Pane signals
    if (mBuyMA) mark(i, 'shape2', { position: 'bottom', shape: 'triangleUp', color: GREEN, text: 'MA' });
    if (mSellMA) mark(i, 'shape3', { position: 'top', shape: 'triangleDown', color: RED, text: 'MA' });
    if (mBuyBB) mark(i, 'shape4', { position: 'bottom', shape: 'triangleUp', color: GREEN, text: 'BB' });
    if (mSellBB) mark(i, 'shape5', { position: 'top', shape: 'triangleDown', color: RED, text: 'BB' });
    // plotshape(percentRBuySignalDiv ? percentRLBR : na, location.absolute)
    if (buyDiv[i] && !isNaN(percentRLBR[i])) {
      mark(i, 'shape6', { position: 'atPriceMiddle', price: percentRLBR[i], shape: 'triangleUp', color: GREEN, text: 'Div' });
    }
    if (sellDiv[i] && !isNaN(percentRLBR[i])) {
      mark(i, 'shape7', { position: 'atPriceMiddle', price: percentRLBR[i], shape: 'triangleDown', color: RED, text: 'Div' });
    }

    // Price chart signals (force_overlay = true)
    const chart = (on: boolean, buy: boolean, text: string, id: string) => {
      if (!on) return;
      mark(i, id, buy
        ? { position: 'belowBar', shape: 'triangleUp', color: GREEN, text, forceOverlay: true }
        : { position: 'aboveBar', shape: 'triangleDown', color: RED, text, forceOverlay: true });
    };
    if (!cfg.andMode) {
      chart(mBuyMA, true, 'Buy', 'shape8');
      chart(mSellMA, false, 'Sell', 'shape9');
      chart(mBuyBB, true, 'Buy', 'shape10');
      chart(mSellBB, false, 'Sell', 'shape11');
      chart(mBuyDiv, true, 'Buy', 'shape12');
      chart(mSellDiv, false, 'Sell', 'shape13');
    }
    const buyMaBb = mBuyMA && mBuyBB;
    const buyMaDiv = mBuyMA && mBuyDiv;
    const buyBbDiv = mBuyBB && mBuyDiv;
    const buyAll = mBuyMA && mBuyBB && mBuyDiv;
    const sellMaBb = mSellMA && mSellBB;
    const sellMaDiv = mSellMA && mSellDiv;
    const sellBbDiv = mSellBB && mSellDiv;
    const sellAll = mSellMA && mSellBB && mSellDiv;
    if (cfg.andMode) {
      chart(buyMaBb, true, 'MA+BB', 'shape14');
      chart(buyMaDiv, true, 'MA+Div', 'shape15');
      chart(buyBbDiv, true, 'BB+Div', 'shape16');
      chart(buyAll, true, 'MA+BB+Div', 'shape17');
      chart(sellMaBb, false, 'MA+BB', 'shape18');
      chart(sellMaDiv, false, 'MA+Div', 'shape19');
      chart(sellBbDiv, false, 'BB+Div', 'shape20');
      chart(sellAll, false, 'MA+BB+Div', 'shape21');
    }

    const buySignalOR = mBuyMA || mBuyBB || mBuyDiv;
    const sellSignalOR = mSellMA || mSellBB || mSellDiv;
    const buySignalAND = buyMaBb || buyMaDiv || buyBbDiv || buyAll;
    const sellSignalAND = sellMaBb || sellMaDiv || sellBbDiv || sellAll;
    const finalBuy = cfg.andMode ? buySignalAND : buySignalOR;
    const finalSell = cfg.andMode ? sellSignalAND : sellSignalOR;
    plot6.push({ time, value: finalBuy ? 1 : finalSell ? -1 : 0, color: NONE_COLOR });
    buyFlags[i] = finalBuy;
    sellFlags[i] = finalSell;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5, plot6 },
    hlines: [
      { value: cfg.wrOverboughtLowerLevel, options: { title: 'Upper Band', color: HLINE_COLOR, linestyle: 'dashed' } },
      { value: -50, options: { title: 'Middle Level', color: HLINE_COLOR, linestyle: 'dotted' } },
      { value: cfg.wrOversoldUpperLevel, options: { title: 'Lower Band', color: HLINE_COLOR, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_upper', plot2: 'hline_lower', options: { title: 'Background' },
        colors: new Array<string>(n).fill(ZONE_FILL) },
      // fill(bbUpperBand, bbLowerBand, color = bbModeInput ? color.new(color.green, 90) : na)
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Bollinger Bands Background Fill' }, colors: bbFill },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** alertcondition(finalBuySignal / finalSellSignal) of the original */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Final Buy Signal Triggered' },
  { id: 'alert1', title: 'Sell Signal', message: 'Final Sell Signal Triggered' },
];

export const WilliamsBbdivSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
