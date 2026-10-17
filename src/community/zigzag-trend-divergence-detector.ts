/**
 * Zigzag Trend/Divergence Detector
 *
 * A zigzag on the close (or the high / low): a bar whose close is the highest of the last `length` bars is a pivot
 * high, the lowest a pivot low. A pivot in the direction of the last zigzag point moves that point when it goes
 * further; a pivot in the other direction adds a point. Each point gets a direction: 1 / -1, or 2 / -2 when it goes
 * beyond the point before in the same direction (higher high, lower low). The oscillator (RSI of the close by
 * default, or another source) gets the same directions from its values at the points.
 *
 * Trend bias: a supertrend whose stops are the lowest / highest of the zigzag points 1 to `Pivot History` minus /
 * plus ATR * multiplier; it turns when the previous close goes through the stop. It is plotted and colours the bars.
 *
 * Drawings: a zigzag line for each leg with a label at its newest point: "C" continuation, "D" divergence, "H"
 * hidden divergence, "I" indeterminate, from the price direction, the oscillator direction and the supertrend
 * direction at that point (at most 500 lines and 500 labels). On the last bar a table lists the zigzag points (bar
 * time, price, oscillator and trend directions, sentiment). The bar times of the table are in the exchange time zone
 * of the chart context (UTC without it).
 *
 * Alerts (alert() call, `alertCalls` of the result, once per bar): on the bar of a new last zigzag point (without
 * "Confirmed Pivots"; with it, on the bar on which the confirmed point changes) whose sentiment is switched on in the
 * Alert inputs, "Sentiment alert on <tickerid> :: <sentiment>" (e.g. "Bullish Divergence", "Bearish Hidden
 * Divergence", "Indeterminate"). The ticker id is read from the chart context (empty without it).
 *
 * Reference: "Zigzag Trend/Divergence Detector" by Trendoscope
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © HeWhoMustNotBeNamed
 */

import {
  taCore, str, time, timeframe, line, label, table, resetDrawings, setDrawingBar, drawingOutputs, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type Label, type SourceType,
} from 'oakscriptjs';
import type { BarColorData, AlertCall } from '../types';
import { tickeridOf, timezoneOf, type ChartContext } from '../chart-context';
import { chartTimeframe } from '../anchor-period';

type OscillatorSource = 'CCI' | 'CMO' | 'COG' | 'DMI' | 'HIST' | 'MACD' | 'MFI' | 'MOM' | 'ROC' | 'RSI' | 'TSI' | 'WPR'
  | 'BB' | 'KC' | 'DC' | 'ADC' | 'External';
type TextSize = 'tiny' | 'small' | 'normal' | 'large' | 'huge' | 'auto';

export interface ZigzagTrendDivergenceDetectorInputs {
  useClosePrices: boolean;
  waitForConfirmation: boolean;
  pZigzagLength: number;
  pZigzagColor: string;
  oscillatorSource: OscillatorSource;
  externalSource: SourceType;
  oscillatorLength: number;
  oscillatorShortLength: number;
  oscillatorLongLength: number;
  /** "Pivot History" switch (not used by the original script) */
  considerTrendBias: boolean;
  supertrendHistory: number;
  atrPeriods: number;
  atrMult: number;
  colorCandles: boolean;
  /** "Plot Supertrend" switch (not used by the original script: the plot is always drawn) */
  showSupertrend: boolean;
  showStatTable: boolean;
  maxArraySize: number;
  textSize: TextSize;
  showContinuation: boolean;
  showIndeterminate: boolean;
  showDivergence: boolean;
  showHiddenDivergence: boolean;
  alertContinuation: boolean;
  alertIndeterminate: boolean;
  alertDivergence: boolean;
  alertHiddenDivergence: boolean;
}

export const defaultInputs: ZigzagTrendDivergenceDetectorInputs = {
  useClosePrices: true,
  waitForConfirmation: false,
  pZigzagLength: 5,
  pZigzagColor: '#FBC02D',
  oscillatorSource: 'RSI',
  externalSource: 'close',
  oscillatorLength: 22,
  oscillatorShortLength: 12,
  oscillatorLongLength: 26,
  considerTrendBias: true,
  supertrendHistory: 4,
  atrPeriods: 22,
  atrMult: 1,
  colorCandles: true,
  showSupertrend: true,
  showStatTable: true,
  maxArraySize: 10,
  textSize: 'small',
  showContinuation: true,
  showIndeterminate: true,
  showDivergence: true,
  showHiddenDivergence: true,
  alertContinuation: false,
  alertIndeterminate: false,
  alertDivergence: true,
  alertHiddenDivergence: true,
};

const ZZ = 'Zigzag';
const OSC = 'Oscillator';
const ST = 'Supertrend (Trend Bias)';
const STATS = 'Stats and Display';
const ALERT = 'Alert';

export const inputConfig: InputConfig[] = [
  { id: 'useClosePrices', type: 'bool', title: 'Close Prices', defval: true, group: ZZ, inline: 'price' },
  { id: 'waitForConfirmation', type: 'bool', title: 'Confirmed Pivots', defval: false, group: ZZ, inline: 'price' },
  { id: 'pZigzagLength', type: 'int', title: '', defval: 5, min: 3, step: 1, group: ZZ, inline: 'price' },
  { id: 'pZigzagColor', type: 'color', title: '', defval: '#FBC02D', group: ZZ, inline: 'price' },
  {
    id: 'oscillatorSource', type: 'string', title: 'Source', defval: 'RSI', group: OSC, inline: 'osc',
    options: ['CCI', 'CMO', 'COG', 'DMI', 'HIST', 'MACD', 'MFI', 'MOM', 'ROC', 'RSI', 'TSI', 'WPR', 'BB', 'KC', 'DC', 'ADC', 'External'],
  },
  { id: 'externalSource', type: 'source', title: 'External Source', defval: 'close', group: OSC, inline: 'osc' },
  { id: 'oscillatorLength', type: 'int', title: 'Length', defval: 22, group: OSC, inline: 'osc2' },
  { id: 'oscillatorShortLength', type: 'int', title: 'Fast', defval: 12, group: OSC, inline: 'osc2' },
  { id: 'oscillatorLongLength', type: 'int', title: 'Slow', defval: 26, group: OSC, inline: 'osc2' },
  { id: 'considerTrendBias', type: 'bool', title: 'Pivot History', defval: true, group: ST, inline: 'st' },
  { id: 'supertrendHistory', type: 'int', title: '', defval: 4, step: 1, group: ST, inline: 'st' },
  { id: 'atrPeriods', type: 'int', title: 'ATR Length', defval: 22, step: 5, group: ST },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 1, step: 0.5, group: ST },
  { id: 'colorCandles', type: 'bool', title: 'Color Candles', defval: true, group: ST, inline: '1' },
  { id: 'showSupertrend', type: 'bool', title: 'Plot Supertrend', defval: true, group: ST, inline: '1' },
  { id: 'showStatTable', type: 'bool', title: 'Max Rows', defval: true, group: STATS, inline: 'stats' },
  { id: 'maxArraySize', type: 'int', title: '', defval: 10, min: 5, step: 5, group: STATS, inline: 'stats' },
  {
    id: 'textSize', type: 'string', title: 'Size', defval: 'small', group: STATS, inline: 'stats',
    options: ['tiny', 'small', 'normal', 'large', 'huge', 'auto'],
  },
  { id: 'showContinuation', type: 'bool', title: 'Continuation', defval: true, group: STATS, inline: 'display' },
  { id: 'showIndeterminate', type: 'bool', title: 'Indeterminate', defval: true, group: STATS, inline: 'display' },
  { id: 'showDivergence', type: 'bool', title: 'Divergence', defval: true, group: STATS, inline: 'display' },
  { id: 'showHiddenDivergence', type: 'bool', title: 'Hidden Divergence', defval: true, group: STATS, inline: 'display' },
  { id: 'alertContinuation', type: 'bool', title: 'Continuation', defval: false, group: ALERT, inline: 'alert' },
  { id: 'alertIndeterminate', type: 'bool', title: 'Indeterminate', defval: false, group: ALERT, inline: 'alert' },
  { id: 'alertDivergence', type: 'bool', title: 'Divergence', defval: true, group: ALERT, inline: 'alert' },
  { id: 'alertHiddenDivergence', type: 'bool', title: 'Hidden Divergence', defval: true, group: ALERT, inline: 'alert' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Supertrend', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'Zigzag Trend/Divergence Detector',
  shortTitle: 'Zigzag-Trend-Divergence',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

// Colour constants of Pine version 5
const GREEN = '#4CAF50';
const RED = '#FF5252';
const LIME = '#00E676';
const ORANGE = '#FF9800';
const SILVER = '#B2B5BE';
const BLACK = '#363A45';
const WHITE = '#FFFFFF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** A float used as a condition (version 5): na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;
/** math.max / math.min: na when an argument is na */
const pmax = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const pmin = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));

/**
 * History of a value inside a user function at one call site: one kept value per bar where the call runs (the value
 * of its last call on that bar); `at(bar)` is the last kept value at that bar or before (na before the first call).
 */
class CallSiteHistory {
  private readonly bars: number[] = [];
  private readonly values: number[] = [];

  keep(bar: number, value: number): void {
    const last = this.bars.length - 1;
    if (last >= 0 && this.bars[last] === bar) this.values[last] = value;
    else {
      this.bars.push(bar);
      this.values.push(value);
    }
  }

  at(bar: number): number {
    let lo = 0;
    let hi = this.bars.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.bars[mid] <= bar) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found < 0 ? NaN : this.values[found];
  }
}

/** f_get_divergence(pDir, oDir, sDir) */
function getDivergence(pDir: number, oDir: number, sDir: number): [number, string] {
  const divergence = pDir === oDir
    ? ((pDir % 2 === 0 && pDir / 2 === sDir) || (pDir % 2 !== 0 && pDir !== sDir) ? 1 : 0)
    : pDir === 2 * oDir && oDir === sDir ? -1
      : 2 * pDir === oDir && pDir === -sDir ? -2 : 0;
  const id = divergence === 1 ? 'C' : divergence === -1 ? 'D' : divergence === -2 ? 'H' : 'I';
  return [divergence, id];
}

/** f_get_bias(pDir, oDir) */
function getBias(pDir: number, oDir: number): number {
  return pDir === 2 && oDir === 2 ? 1 : pDir === -2 && oDir === -2 ? -1 : pDir > 0 ? -1 : pDir < 0 ? 1 : 0;
}

/** getSentimentByDivergenceAndBias(divergence, bias) */
function getSentiment(divergence: number, bias: number): [string, string] {
  const col = divergence === 1 ? (bias === 1 ? GREEN : RED)
    : divergence === -1 || divergence === -2 ? (bias === 1 ? LIME : ORANGE) : SILVER;
  const text = divergence === 0 ? '▣'
    : bias > 0
      ? (divergence === 1 ? '⬆' : divergence === -1 ? '⤴' : divergence === -2 ? '↗' : '⤮')
      : (divergence === 1 ? '⬇' : divergence === -1 ? '⤵' : divergence === -2 ? '↘' : '⤭');
  return [text, col];
}

const cellColorByDirection = (dir: number) =>
  dir === 2 ? GREEN : dir === 1 ? ORANGE : dir === -1 ? LIME : dir === -2 ? RED : SILVER;
const labelByDirection = (dir: number) =>
  dir === 2 ? '⇈' : dir === 1 ? '↑' : dir === -1 ? '↓' : dir === -2 ? '⇊' : 'NA';

/** The oscillator of the "Source" input (before nz(oscillator, close)) */
function oscillatorOf(bars: Bar[], cfg: ZigzagTrendDivergenceDetectorInputs): number[] {
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const len = cfg.oscillatorLength;
  const fast = cfg.oscillatorShortLength;
  const slow = cfg.oscillatorLongLength;
  const ratio = (lower: number[], upper: number[]) => close.map((c, i) => (c - lower[i]) / (upper[i] - lower[i]));
  switch (cfg.oscillatorSource) {
    case 'CCI': return taCore.cci(close, len);
    case 'CMO': return taCore.cmo(close, len);
    case 'COG': return taCore.cog(close, len);
    case 'DMI': return taCore.dmi(slow, fast, high, low, close)[2];
    case 'HIST': return taCore.macd(close, fast, slow, fast)[2];
    case 'MACD': return taCore.macd(close, fast, slow, fast)[0];
    case 'MFI': return taCore.mfi(close, len, bars.map((b) => b.volume ?? NaN));
    case 'MOM': return taCore.mom(close, len);
    case 'ROC': return taCore.roc(close, len);
    case 'RSI': return taCore.rsi(close, len);
    case 'TSI': return taCore.tsi(close, fast, slow);
    case 'WPR': return taCore.wpr(high, low, close, len);
    case 'BB': {
      const [, upper, lower] = taCore.bb(close, len, 5);
      return ratio(lower, upper);
    }
    case 'KC': {
      const [, upper, lower] = taCore.kc(close, len, 5, true, high, low, close);
      return ratio(lower, upper);
    }
    case 'DC': return ratio(taCore.lowest(low, len), taCore.highest(high, len));
    case 'ADC': {
      // adoptive_donchian(): without a break of the channel of the bar before, the channel of the bar before
      const top = taCore.highest(high, len);
      const bottom = taCore.lowest(low, len);
      const t: number[] = [];
      const btm: number[] = [];
      for (let i = 0; i < bars.length; i++) {
        const pt = i > 0 ? t[i - 1] : NaN;
        const pb = i > 0 ? btm[i - 1] : NaN;
        const channelBreak = (!isNaN(pt) && !lt(high[i], pt)) || (!isNaN(pb) && !gt(low[i], pb));
        t.push(channelBreak || isNaN(pt) ? top[i] : pt);
        btm.push(channelBreak || isNaN(pb) ? bottom[i] : pb);
      }
      return ratio(btm, t);
    }
    case 'External': return getSourceSeries(bars, cfg.externalSource).toArray().map((v) => v ?? NaN);
  }
  return close.map(() => NaN);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ZigzagTrendDivergenceDetectorInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const startIndex = cfg.waitForConfirmation ? 1 : 0;
  const maxItems = cfg.maxArraySize + startIndex;
  const H = cfg.supertrendHistory;
  const close = bars.map((b) => b.close);

  const oscRaw = oscillatorOf(bars, cfg);
  // oscillator := nz(oscillator, close) (nz treats an infinite value as na)
  const osc = oscRaw.map((v, i) => (Number.isFinite(v) ? v : close[i]));
  const atr = taCore.atr(cfg.atrPeriods, bars.map((b) => b.high), bars.map((b) => b.low), close);
  // pivots(): highestbars(source, length) == 0 ? source : na
  const highSrc = cfg.useClosePrices ? close : bars.map((b) => b.high);
  const lowSrc = cfg.useClosePrices ? close : bars.map((b) => b.low);
  const hb = taCore.highestbars(highSrc, cfg.pZigzagLength);
  const lb = taCore.lowestbars(lowSrc, cfg.pZigzagLength);

  // Zigzag arrays (newest first)
  const pivots: number[] = [];
  const pivotBars: number[] = [];
  const pivotDirs: number[] = [];
  const oPivots: number[] = [];
  const oPivotDirs: number[] = [];
  // Supertrend state (var arrays)
  let stDir = 1;
  let buyStop = NaN;
  let sellStop = NaN;
  const supertrendDir: number[] = new Array(n);

  // `otherSource[bar_index - bar]` inside addnewpivot() and `supertrendDir[bar_index - x1]` inside draw_zg_line()
  // read the history of that call site: a function call that runs only on some bars keeps, per bar, the value of
  // its last call; [k] reads the last kept value at bar i - k or before (user-function history)
  const site1 = new CallSiteHistory(); // addnewpivot() in the first `if` of zigzagcore()
  const drawSites = [new CallSiteHistory(), new CallSiteHistory()]; // draw_zg_line() under doubleZG, then the other

  const addToArray = (arr: number[], val: number) => {
    arr.unshift(val);
    if (arr.length > maxItems) arr.pop();
  };
  /** addnewpivot(); `other` is otherSource[bar_index - bar] of the call site */
  const addNewPivot = (value: number, other: number, bar: number, dir: number) => {
    let newDir = dir;
    let othDir = dir;
    if (pivots.length >= 2) {
      newDir = gt(dir * value, dir * pivots[1]) ? dir * 2 : dir;
      othDir = gt(dir * other, dir * oPivots[1]) ? dir * 2 : dir;
    }
    addToArray(pivots, value);
    addToArray(pivotBars, bar);
    addToArray(pivotDirs, newDir);
    addToArray(oPivots, other);
    addToArray(oPivotDirs, othDir);
  };

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });
  const zigzagLines: Line[] = [];
  const zigzagLabels: Label[] = [];
  const hidden = (divergence: number) => (!cfg.showIndeterminate && divergence === 0)
    || (!cfg.showContinuation && divergence === 1) || (!cfg.showDivergence && divergence === -1)
    || (!cfg.showHiddenDivergence && divergence === -2);

  const drawLine = (i: number, site: CallSiteHistory, idx1: number, idx2: number) => {
    site.keep(i, supertrendDir[i]);
    if (!(pivots.length > idx2)) return;
    const y1 = pivots[idx1];
    const y2 = pivots[idx2];
    const x1 = pivotBars[idx1];
    const x2 = pivotBars[idx2];
    const pDir = pivotDirs[idx1];
    const oDir = oPivotDirs[idx1];
    const sDir = site.at(x1);
    const [divergence, id] = getDivergence(pDir, oDir, sDir);
    const [, sentimentColor] = getSentiment(divergence, getBias(pDir, oDir));
    const zline = line.new(x1, y1, x2, y2, 'bar_index', 'none', cfg.pZigzagColor, 'solid', 1);
    const zlabel = label.new(x1, y1, id, 'bar_index', 'price', sentimentColor, pDir > 0 ? 'label_down' : 'label_up', BLACK, 'small');
    if (zigzagLines.length >= 1) {
      const lastLine = zigzagLines[0];
      if (x2 === line.get_x2(lastLine) && eq(y2, line.get_y2(lastLine))) {
        line.delete(zigzagLines.shift()!);
        label.delete(zigzagLabels.shift()!);
      }
    }
    if (hidden(divergence)) label.delete(zlabel);
    zigzagLines.unshift(zline);
    zigzagLabels.unshift(zlabel);
    if (zigzagLines.length > 500) {
      line.delete(zigzagLines.pop()!);
      label.delete(zigzagLabels.pop()!);
    }
  };

  // alert(): 'Sentiment alert on ' + syminfo.tickerid + ' :: ' + sentimentText
  const tickerid = tickeridOf(chart);
  const alertCalls: AlertCall[] = [];
  let prevLastPivotBar = NaN; // lastPivotBar[1] of the `if` block

  const plotValues: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    // f_initialize_supertrend(pZigzagPivots): with the points of the bars before
    const tail = pivots.length > 1 + H ? pivots.slice(1, 1 + H) : [];
    const highest = tail.length ? Math.max(...tail) : NaN;
    const lowest = tail.length ? Math.min(...tail) : NaN;
    const atrDiff = atr[i] * cfg.atrMult;
    let newBuyStop = lowest - atrDiff;
    let newSellStop = highest + atrDiff;
    const prevClose = i > 0 ? close[i - 1] : NaN;
    const newDir = stDir > 0 && lt(prevClose, buyStop) ? -1 : stDir < 0 && gt(prevClose, sellStop) ? 1 : stDir;
    newBuyStop = newDir > 0 ? pmax(isNaN(buyStop) ? newBuyStop : buyStop, newBuyStop) : newBuyStop;
    newSellStop = newDir < 0 ? pmin(isNaN(sellStop) ? newSellStop : sellStop, newSellStop) : newSellStop;
    stDir = newDir;
    buyStop = newBuyStop;
    sellStop = newSellStop;
    supertrendDir[i] = newDir;
    plotValues[i] = newDir > 0 ? newBuyStop : newSellStop;

    // zigzag(): pivots() then zigzagcore()
    const phigh = hb[i] === 0 ? highSrc[i] : NaN;
    const plow = lb[i] === 0 ? lowSrc[i] : NaN;
    let pDir = 1;
    let newZG = false;
    const doubleZG = truthy(phigh) && truthy(plow);
    if (pivots.length >= 1) {
      pDir = pivotDirs[0];
      pDir = pDir % 2 === 0 ? pDir / 2 : pDir;
    }
    if (((pDir === 1 && truthy(phigh)) || (pDir === -1 && truthy(plow))) && pivots.length >= 1) {
      const pivot = pivots.shift()!;
      const pivotbar = pivotBars.shift()!;
      const pivotdir = pivotDirs.shift()!;
      let otherVal = oPivots.shift()!;
      oPivotDirs.shift();
      let value = pDir === 1 ? phigh : plow;
      let bar = i;
      const useNewValues = gt(value * pivotdir, pivot * pivotdir);
      value = useNewValues ? value : pivot;
      bar = useNewValues ? bar : pivotbar;
      otherVal = useNewValues ? osc[i] : otherVal;
      newZG = newZG || useNewValues;
      site1.keep(i, otherVal);
      addNewPivot(value, site1.at(bar), bar, pDir);
    }
    if ((pDir === 1 && truthy(plow)) || (pDir === -1 && truthy(phigh))) {
      const value = pDir === 1 ? plow : phigh;
      const dir = pDir === 1 ? -1 : 1;
      newZG = true;
      addNewPivot(value, osc[i], i, dir);
    }

    if (newZG) {
      if (doubleZG) drawLine(i, drawSites[0], startIndex + 1, startIndex + 2);
      if (pivots.length >= startIndex + 2) drawLine(i, drawSites[1], startIndex, startIndex + 1);
    }

    // if array.size(pZigzagPivotBars) > startIndex: the alert of the last point
    if (pivotBars.length > startIndex) {
      const lastPivotBar = pivotBars[startIndex];
      const lPivotDir = pivotDirs[startIndex];
      const lOscillatorDir = oPivotDirs[startIndex];
      const sDir = supertrendDir[lastPivotBar];
      const [divergence] = getDivergence(lPivotDir, lOscillatorDir, sDir);
      const bias = getBias(lPivotDir, lOscillatorDir);
      // lastPivotBar != lastPivotBar[1] (na compares false)
      const isAlertBar = (i === lastPivotBar && startIndex === 0)
        || (startIndex === 1 && !isNaN(prevLastPivotBar) && lastPivotBar !== prevLastPivotBar);
      prevLastPivotBar = lastPivotBar;
      if (isAlertBar && ((cfg.alertIndeterminate && divergence === 0) || (cfg.alertContinuation && divergence === 1)
        || (cfg.alertDivergence && divergence === -1) || (cfg.alertHiddenDivergence && divergence === -2))) {
        const sentimentText = divergence === 1 ? (bias === 1 ? 'Bullish Continuation' : 'Bearish Continuation')
          : divergence === -1 ? (bias === 1 ? 'Bullish Divergence' : 'Bearish Divergence')
            : divergence === -2 ? (bias === 1 ? 'Bullish Hidden Divergence' : 'Bearish Hidden Divergence') : 'Indeterminate';
        alertCalls.push({ time: bars[i].time, message: 'Sentiment alert on ' + tickerid + ' :: ' + sentimentText, freq: 'once_per_bar' });
      }
    }
  }

  // Statistics table, on the last bar
  if (n > 0 && cfg.showStatTable) {
    const ts = cfg.textSize;
    const stats = table.new('top_right', 5, cfg.maxArraySize + startIndex + 2, undefined, undefined, undefined, undefined, 1);
    const header = ['Bar Time', 'Price', 'Oscillator', 'Trend', 'Sentiment'];
    header.forEach((t, c) => table.cell(stats, c, 0, t, undefined, undefined, WHITE, undefined, undefined, ts, BLACK));
    const tz = timezoneOf(chart);
    const tf = chartTimeframe(bars, chart);
    const intraday = tf !== '' && timeframe.info(tf).isintraday;
    const msUnit = bars[0].time >= 1e12 ? 1 : 1000;
    const size = pivotDirs.length;
    if (size > 0) {
      const to = size - 1;
      const step = startIndex <= to ? 1 : -1;
      for (let k = startIndex; step > 0 ? k <= to : k >= to; k += step) {
        if (k >= size) throw new Error(`Index ${k} is out of bounds. Array size is ${size}.`);
        const pBar = pivotBars[k];
        const pDir = pivotDirs[k];
        const oDir = oPivotDirs[k];
        const sDir = supertrendDir[pBar];
        const [divergence] = getDivergence(pDir, oDir, sDir);
        const [sentiment, sentimentColor] = getSentiment(divergence, getBias(pDir, oDir));
        if (hidden(divergence)) continue;
        const t = bars[pBar].time * msUnit;
        const two = (v: number) => str.tostring(v, '00');
        const barTimeString = `${str.tostring(time.year(t, tz), '0000')}/${two(time.month(t, tz))}/${two(time.dayofmonth(t, tz))}`
          + (intraday ? `-${two(time.hour(t, tz))}:${two(time.minute(t, tz))}:${two(time.second(t, tz))}` : '');
        const row = k + 1 - startIndex;
        const cell = (c: number, text: string, bg: string) =>
          table.cell(stats, c, row, text, undefined, undefined, BLACK, undefined, undefined, ts, bg);
        cell(0, barTimeString, cellColorByDirection(pDir));
        cell(1, labelByDirection(pDir), cellColorByDirection(pDir));
        cell(2, labelByDirection(oDir), cellColorByDirection(oDir));
        cell(3, sDir > 0 ? '⇑' : '⇓', sDir > 0 ? GREEN : RED);
        cell(4, sentiment, sentimentColor);
      }
    }
  }
  setDrawingBar(null);

  const plot0 = bars.map((b, i) => ({
    time: b.time,
    value: Number.isFinite(plotValues[i]) ? plotValues[i] : NaN,
    color: supertrendDir[i] > 0 ? LIME : ORANGE,
  }));
  const barColors: BarColorData[] = cfg.colorCandles
    ? bars.map((b, i) => ({ time: b.time, color: supertrendDir[i] > 0 ? LIME : ORANGE }))
    : [];

  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    barColors,
    lines: out.lines ?? [],
    labels: out.labels ?? [],
    tables: out.tables ?? [],
    alertCalls,
  };
}

export const hasAlertFunction = true;

export const ZigzagTrendDivergenceDetector = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
