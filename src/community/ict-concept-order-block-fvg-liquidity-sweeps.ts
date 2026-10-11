/**
 * ICT Concept [TradingFinder] Order Block | FVG | Liquidity Sweeps
 *
 * Three tools on the price chart.
 *
 * Order blocks. A candle "breaks" up when it closes above the previous high and down when it closes below the
 * previous low. A down break right after an up break marks a swing high (the highest high since the last down
 * break), an up break right after a down break a swing low. The major high / low levels follow these swings. A
 * close through the major high (low) is a bullish (bearish) break of structure; when it comes with a new swing
 * candle, a demand (supply) zone is drawn from that candle: two dashed lines (proximal and distal), a dotted line at
 * their middle and a fill. "Order Block Refine" narrows the zone from the candles around it and the ATR(55)
 * ("Defensive" keeps the far part of a wide zone, "Aggressive" the whole zone). The zone is extended to the right
 * while the price stays outside its proximal line, and stops for good when the price crosses its distal line.
 *
 * Fair value gaps (from the FVGDetectorLibrary of TFlab, version 1). A demand gap: the low is above the high of two
 * bars before; a supply gap: the high is below the low of two bars before. The filter asks for a wide middle candle
 * (ATR(55)), a new high (low) and, depending on its type, candles with full bodies. Each gap is two dotted lines
 * with a fill and an "FVG" label, extended until the price comes back to its near edge.
 *
 * Liquidity lines (from the LiquidityFinderLibrary of TFlab, version 1). Static lines: two consecutive pivot highs
 * (lows) of the static period, the second not above (below) the first and within the sensitivity (in ATR(55)):
 * a horizontal dotted line with a "2 Top Liq" / "2 Bottom Liq" label; a third pivot extends the line ("3 Top Liq").
 * Dynamic lines: the same with the dynamic period for pivots that are further apart in price (a sloped line, label
 * "DLiq"); as in the original, a dynamic line between pivots less than 8 bars apart is removed on the next bar.
 *
 * The original also sends alerts when the price enters a zone (AlertSenderLibrary of TFlab); alerts are not
 * outputs, their settings are kept as inputs without effect. At most 500 lines and 500 labels are kept.
 *
 * Reference: "ICT Concept [TradingFinder] Order Block | FVG | Liquidity Sweeps" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import { ta, Series, color, callsite, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface IctConceptOrderBlockFvgLiquiditySweepsInputs {
  /** Order Block Refine */
  obRefine: 'On' | 'Off';
  /** Refine Type */
  refineType: 'Defensive' | 'Aggressive';
  /** Show High Level */
  showHigh: 'No' | 'Yes';
  /** Show Low Level */
  showLow: 'No' | 'Yes';
  /** Show Last Support */
  showSupport: 'No' | 'Yes';
  /** Show Last Resistance */
  showResistance: 'No' | 'Yes';
  /** Demand Zone Color */
  demBxColor: string;
  /** Supply Zone Color */
  supBxColor: string;
  /** FVG Filter */
  fvgFilter: 'On' | 'Off';
  /** FVG Filter Type */
  fvgFilterType: 'Very Aggressive' | 'Aggressive' | 'Defensive' | 'Very Defensive';
  /** Show Demand FVG */
  showDeFvg: boolean;
  /** Show Supply FVG */
  showSuFvg: boolean;
  /** Statics Liquidity Line Sensitivity */
  slls: number;
  /** Dynamics Liquidity Line Sensitivity */
  dlls: number;
  /** Statics Period Pivot */
  spp: number;
  /** Dynamics Period Pivot */
  dpp: number;
  /** Show Statics High Liquidity Line */
  showShll: boolean;
  /** Show Statics Low Liquidity Line */
  showSlll: boolean;
  /** Show Dynamics High Liquidity Line */
  showDhll: boolean;
  /** Show Dynamics Low Liquidity Line */
  showDlll: boolean;
  /** Alert (alerts are not outputs: no effect) */
  alert: 'On' | 'Off';
  /** Alert Name (no effect) */
  alertName: string;
  /** Message Frequency (no effect) */
  frequncy: 'All' | 'Once Per Bar' | 'Per Bar Close';
  /** Show Alert time by Time Zone (no effect) */
  utc: string;
  /** Display More Info (no effect) */
  moreInfo: 'On' | 'Off';
  /** Long Signal Message (no effect) */
  messageBull: string;
  /** Short Signal Message (no effect) */
  messageBear: string;
}

export const defaultInputs: IctConceptOrderBlockFvgLiquiditySweepsInputs = {
  obRefine: 'On',
  refineType: 'Defensive',
  showHigh: 'No',
  showLow: 'No',
  showSupport: 'No',
  showResistance: 'No',
  demBxColor: '#69BF6F80',
  supBxColor: '#F2223366',
  fvgFilter: 'On',
  fvgFilterType: 'Defensive',
  showDeFvg: true,
  showSuFvg: true,
  slls: 0.3,
  dlls: 1.0,
  spp: 8,
  dpp: 3,
  showShll: true,
  showSlll: true,
  showDhll: true,
  showDlll: true,
  alert: 'On',
  alertName: 'Order Blocks Finder [TradingFinder]',
  frequncy: 'Once Per Bar',
  utc: 'UTC',
  moreInfo: 'On',
  messageBull: 'Long Position',
  messageBear: 'Short Position',
};

const G_OB = 'Order Block Setting';
const G_LEVELS = 'Major Levels';
const G_SR = 'Support and Resistance';
const G_COLOR = ' Color Setting';
const G_FVG = 'FVG';
const G_LIQ = 'Liquidity';
const G_ALERT = 'Alert';

export const inputConfig: InputConfig[] = [
  { id: 'obRefine', type: 'string', title: 'Order Block Refine', defval: 'On', options: ['On', 'Off'], group: G_OB,
    tooltip: 'If Order Block Refine is Turned on,an Attempt is made to Detect the Optimal Rangefor the Order Block Using an Error Ccorrection Algorithm.' },
  { id: 'refineType', type: 'string', title: 'Refine Type', defval: 'Defensive', options: ['Defensive', 'Aggressive'], group: G_OB,
    tooltip: 'By Using Aggressive Error Correction Algorithm,a Large Range is Identified as Block Order.The Defensive Algorithm Detect a Small Range.' },
  { id: 'showHigh', type: 'string', title: 'Show High Level', defval: 'No', options: ['No', 'Yes'], group: G_LEVELS, tooltip: 'High Major Levels' },
  { id: 'showLow', type: 'string', title: 'Show Low Level', defval: 'No', options: ['No', 'Yes'], group: G_LEVELS, tooltip: 'Low Major Levels' },
  { id: 'showSupport', type: 'string', title: 'Show Last Support', defval: 'No', options: ['No', 'Yes'], group: G_SR, tooltip: 'Last Support' },
  { id: 'showResistance', type: 'string', title: 'Show Last Resistance', defval: 'No', options: ['No', 'Yes'], group: G_SR, tooltip: 'Last Resistance' },
  { id: 'demBxColor', type: 'color', title: 'Demand Zone Color', defval: '#69BF6F80', group: G_COLOR },
  { id: 'supBxColor', type: 'color', title: 'Supply Zone Color', defval: '#F2223366', group: G_COLOR },
  { id: 'fvgFilter', type: 'string', title: 'FVG Filter', defval: 'On', options: ['On', 'Off'], group: G_FVG },
  { id: 'fvgFilterType', type: 'string', title: 'FVG Filter Type', defval: 'Defensive', options: ['Very Aggressive', 'Aggressive', 'Defensive', 'Very Defensive'], group: G_FVG },
  { id: 'showDeFvg', type: 'bool', title: ' Show Demand FVG', defval: true, group: G_FVG },
  { id: 'showSuFvg', type: 'bool', title: ' Show Supply FVG', defval: true, group: G_FVG },
  { id: 'slls', type: 'float', title: 'Statics Liquidity Line Sensitivity', defval: 0.3, min: 0.0, max: 0.4, step: 0.01, group: G_LIQ },
  { id: 'dlls', type: 'float', title: 'Dynamics Liquidity Line Sensitivity', defval: 1.0, min: 0.4, max: 1.95, step: 0.01, group: G_LIQ },
  { id: 'spp', type: 'int', title: 'Statics Period Pivot', defval: 8, group: G_LIQ },
  { id: 'dpp', type: 'int', title: 'Dynamics Period Pivot', defval: 3, group: G_LIQ },
  { id: 'showShll', type: 'bool', title: 'Show Statics High Liquidity Line', defval: true, group: G_LIQ },
  { id: 'showSlll', type: 'bool', title: 'Show Statics Low Liquidity Line', defval: true, group: G_LIQ },
  { id: 'showDhll', type: 'bool', title: 'Show Dynamics High Liquidity Line', defval: true, group: G_LIQ },
  { id: 'showDlll', type: 'bool', title: 'Show Dynamics Low Liquidity Line', defval: true, group: G_LIQ },
  { id: 'alert', type: 'string', title: 'Alert', defval: 'On', options: ['On', 'Off'], group: G_ALERT,
    tooltip: 'If you turn on the Alert, you can receive alerts and notifications after setting the "Alert".' },
  { id: 'alertName', type: 'string', title: 'Alert Name', defval: 'Order Blocks Finder [TradingFinder]', group: G_ALERT },
  { id: 'frequncy', type: 'string', title: 'Message Frequency', defval: 'Once Per Bar', options: ['All', 'Once Per Bar', 'Per Bar Close'], group: G_ALERT,
    tooltip: 'The triggering frequency. Possible values are: All (all function calls trigger the alert), Once Per Bar (the first function call during the bar triggers the alert),  Per Bar Close (the function call triggers the alert only when it occurs during the last script iteration of the real-time bar, when it closes). The default is alert.freq_once_per_bar.)' },
  { id: 'utc', type: 'string', title: 'Show Alert time by Time Zone', defval: 'UTC', group: G_ALERT },
  { id: 'moreInfo', type: 'string', title: 'Display More Info', defval: 'On', options: ['On', 'Off'], group: G_ALERT },
  { id: 'messageBull', type: 'string', title: 'Long Signal Message', defval: 'Long Position', group: G_ALERT },
  { id: 'messageBear', type: 'string', title: 'Short Signal Message', defval: 'Short Position', group: G_ALERT },
];

const HIGH_CSS = String(color.rgb(5, 148, 10));
const LOW_CSS = String(color.rgb(184, 0, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Major High Levels', color: HIGH_CSS, lineWidth: 1 },
  { id: 'plot1', title: 'Major Low Levels', color: LOW_CSS, lineWidth: 1 },
];

export const metadata = {
  title: 'ICT Concept [TradingFinder] Order Block | FVG | Liquidity Sweeps',
  shortTitle: 'ICT Concept TFlab',
  overlay: true,
};

/** max_lines_count, max_labels_count */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(Math.abs(a - b) > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
/** math.min / math.max: na with an na argument */
const minOf = (v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.min(...v));
const maxOf = (v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.max(...v));

type LineStyle = 'dashed' | 'dotted';
interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; style: LineStyle; extend?: 'right'; deleted: boolean }
interface Lb { x: number; y: number; text: string; style: 'label_up' | 'label_down'; textColor: string; deleted: boolean }
interface Fill { line1: Ln; line2: Ln; color: string }

const BLACK = String(color.rgb(0, 0, 0));
const ZONE_EDGE = String(color.rgb(0, 0, 0, 45));
const SUPPORT_CSS = String(color.rgb(0, 82, 3));
const RESISTANCE_CSS = String(color.rgb(146, 33, 33));
const LABEL_BG = String(color.rgb(255, 255, 255, 100));
const TOP_TEXT = String(color.rgb(18, 123, 184));
const BOTTOM_TEXT = String(color.rgb(162, 10, 233));
const STATIC_TOP_LINE = String(color.rgb(18, 123, 184, 43));
const DYNAMIC_TOP_LINE = String(color.rgb(18, 123, 184, 44));
const BOTTOM_LINE = String(color.rgb(162, 10, 233, 45));
const DEMAND_FVG_FILL = '#a9d60580';
const SUPPLY_FVG_FILL = '#ff7d044d';

export function calculate(
  bars: Bar[],
  inputs: Partial<IctConceptOrderBlockFvgLiquiditySweepsInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; linefills: LinefillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const refineOn = cfg.obRefine === 'On';
  const sPP = cfg.spp;
  const dPP = cfg.dpp;

  const O = (i: number) => (i >= 0 ? bars[i].open : NaN);
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);

  const atr = ta.atr(bars, 55).toArray().map((v) => v ?? NaN);
  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  const pivots = (len: number) => ({
    high: ta.pivothigh(highSeries, len, len).toArray().map((v) => v ?? NaN),
    low: ta.pivotlow(lowSeries, len, len).toArray().map((v) => v ?? NaN),
  });
  const staticPivots = pivots(sPP);
  const dynamicPivots = pivots(dPP);

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. An object held by a `var` variable of the script or of its libraries (the latest object of each
  // kind) is never deleted by this limit, but it counts. A deleted object ignores later changes and reads as na.
  const held = new Set<object>();
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (held.has(list[k])) k++;
      else list.splice(k, 1)[0].deleted = true;
    }
  };
  /** `variable := object`: the variable holds the new object and releases the one before */
  const hold = <T extends object>(before: T | null, now: T): T => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const fills: Fill[] = [];
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string, style: LineStyle, extend?: 'right'): Ln => {
    const o: Ln = { x1, y1, x2, y2, color: css, style, ...(extend ? { extend } : {}), deleted: false };
    lines.push(o);
    limit(lines);
    return o;
  };
  const newLabel = (x: number, y: number, text: string, style: Lb['style'], textColor: string): Lb => {
    const o: Lb = { x, y, text, style, textColor, deleted: false };
    labels.push(o);
    limit(labels);
    return o;
  };
  const remove = <T extends { deleted: boolean }>(list: T[], o: T | null) => {
    if (!o || o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };
  const alive = <T extends { deleted: boolean }>(o: T | null): o is T => o !== null && !o.deleted;
  const setX2 = (l: Ln | null, x: number) => {
    if (alive(l)) l.x2 = x;
  };

  // --- Swings and major levels ---
  const highestFirst = callsite.highest();
  const lowestFirst = callsite.lowest();
  const highestFirst1 = callsite.highest();
  const lowestFirst1 = callsite.lowest();
  let barIndexBull = NaN; // ta.valuewhen(close > high[1], bar_index, 0)
  let barIndexBear = NaN;
  // Candle_Break, High_sec and Low_sec come from an `if` without a final `else`: on a bar where no branch runs
  // they keep the value of the bar before (measured on the original)
  let candleBreak: 'bull' | 'bear' | null = null;
  let startBarIndexHigh = 0;
  let startBarIndexLow = 0;
  let highCorrect = 0.0;
  let lowCorrect = 0.0;
  let highSec = NaN;
  let lowSec = NaN;
  let barIndexBullBoS = 0;
  let barIndexBearBoS = 0;
  let boS = 'Hi';
  let highCorrectF = 0.0;
  let lowCorrectF = 0.0;
  let sline: Ln | null = null;
  let rline: Ln | null = null;

  // --- Order blocks ---
  let barIndexSupplyOB = NaN; // ta.valuewhen(High_Correct != High_Correct[1], bar_index[1], 0)
  let barIndexDemandOB = NaN;
  let demandCheck = 0;
  let supplyCheck = 0;
  let YDp12 = 0.0;
  let XDp1 = 0;
  let YDd12 = 0.0;
  let XDd1 = 0;
  let YSp12 = 0.0;
  let XSp1 = 0;
  let YSd12 = 0.0;
  let XSd1 = 0;
  let DCRa1 = 0.0;
  let DCRO = 0.0;
  let DminOpen = 0.0;
  let DminLow = 0.0;
  let DminClose = 0.0;
  let DmaxOpen = 0.0;
  let DmaxHigh = 0.0;
  let DmaxLow = 0.0;
  let DmaxClose = 0.0;
  let DDA = 0.0;
  let DPA = 0.0;
  let SminOpen = 0.0;
  let SminLow = 0.0;
  let SminClose = 0.0;
  let SmaxHigh = 0.0;
  let SDA = 0.0;
  let SPA = 0.0;
  let DProximal = 0.0;
  let DDistal = 0.0;
  let SProximal = 0.0;
  let SDistal = 0.0;
  // LinerFunctionDem / LinerFunctionSup
  let demCheck = true;
  let demDistal: Ln | null = null;
  let demProximal: Ln | null = null;
  let demLine50: Ln | null = null;
  let supCheck = true;
  let supDistal: Ln | null = null;
  let supProximal: Ln | null = null;
  let supLine50: Ln | null = null;

  // --- FVGDetector ---
  let DDFVG = 0.0;
  let DPFVG = 0.0;
  let SDFVG = 0.0;
  let SPFVG = 0.0;
  let barDFVG = 0;
  let barSFVG = 0;
  let fvgDDistal: Ln | null = null;
  let fvgDProximal: Ln | null = null;
  let fvgSDistal: Ln | null = null;
  let fvgSProximal: Ln | null = null;
  let dFvgLabel: Lb | null = null;
  let sFvgLabel: Lb | null = null;
  let dMitigated = true;
  let sMitigated = true;

  // --- LLF: the last two pivots of each kind (ta.valuewhen with occurrence 0 and 1) and the latest line and label ---
  interface PivotPair { vc: number; vp: number; ic: number; ip: number }
  const pair = (): PivotPair => ({ vc: NaN, vp: NaN, ic: NaN, ip: NaN });
  const stsH = pair();
  const stsL = pair();
  const dtsH = pair();
  const dtsL = pair();
  let sHLL: Ln | null = null;
  let sLLL: Ln | null = null;
  let dHLL: Ln | null = null;
  let dLLL: Ln | null = null;
  let sHLLl: Lb | null = null;
  let sLLLl: Lb | null = null;
  let dHLLl: Lb | null = null;
  let dLLLl: Lb | null = null;

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: typeof plot0 = [];

  for (let i = 0; i < n; i++) {
    const { open, high, low, close } = bars[i];
    const candleBody = close - open;
    /** A history offset; an na offset reads the current bar */
    const back = (offset: number) => i - (isNaN(offset) ? 0 : offset);
    const bodyAt = (k: number) => C(k) - O(k);

    // Candle break
    const prevBreak = candleBreak;
    if (gt(close, H(i - 1))) {
      candleBreak = 'bull';
      barIndexBull = i;
    } else if (lt(close, L(i - 1))) {
      candleBreak = 'bear';
      barIndexBear = i;
    }
    // lengths: na before the first break -> 1
    const highestLen = isNaN(barIndexBear) ? 1 : i - barIndexBear + 5;
    const lowestLen = isNaN(barIndexBull) ? 1 : i - barIndexBull + 5;
    const highestLen1 = isNaN(barIndexBear) ? 1 : i - barIndexBear + 3;
    const lowestLen1 = isNaN(barIndexBull) ? 1 : i - barIndexBull + 3;
    const highFirst = highestFirst(high, highestLen);
    const lowFirst = lowestFirst(low, lowestLen);
    const highFirst1 = highestFirst1(high, highestLen1);
    const lowFirst1 = lowestFirst1(low, lowestLen1);

    // Swing high / low on a break that follows the opposite break
    const prevHighCorrect = highCorrect;
    const prevLowCorrect = lowCorrect;
    const prevHighSec = highSec;
    const prevLowSec = lowSec;
    if (candleBreak === 'bear' && prevBreak === 'bull') {
      startBarIndexHigh = i;
      highSec = eq(prevHighCorrect, highFirst) ? highFirst1 : highFirst;
    }
    if (candleBreak === 'bull' && prevBreak === 'bear') {
      startBarIndexLow = i;
      lowSec = eq(prevLowCorrect, lowFirst) ? lowFirst1 : lowFirst;
    }
    // High_Correct := not na(High_sec) ? High_sec : High_sec[1]
    highCorrect = !isNaN(highSec) ? highSec : prevHighSec;
    lowCorrect = !isNaN(lowSec) ? lowSec : prevLowSec;

    // Major levels (BoS and its bar indexes still have the values of the bar before)
    const prevHighF = highCorrectF;
    const prevLowF = lowCorrectF;
    if (eq(prevHighF, 0)) highCorrectF = highCorrect;
    else if (gt(highCorrect, prevHighF) && ne(prevHighF, 0)) highCorrectF = highCorrect;
    else if (lt(highCorrect, prevHighF)) highCorrectF = boS === 'Bear BoS' && barIndexBearBoS >= startBarIndexHigh ? highCorrect : prevHighF;
    else if (eq(prevHighF, prevHighF) && ne(prevHighF, 0)) highCorrectF = prevHighF;
    else highCorrectF = highCorrect;

    if (eq(prevLowF, 0)) lowCorrectF = lowCorrect;
    else if (lt(lowCorrect, prevLowF) && ne(prevLowF, 0)) lowCorrectF = lowCorrect;
    else if (gt(lowCorrect, prevLowF)) lowCorrectF = boS === 'Bull BoS' && barIndexBullBoS >= startBarIndexLow ? lowCorrect : prevLowF;
    else if (eq(prevLowF, prevLowF) && ne(prevLowF, 0)) lowCorrectF = prevLowF;
    else lowCorrectF = lowCorrect;

    // Last support and resistance lines
    if (ne(lowCorrectF, prevLowF) && cfg.showSupport === 'Yes') {
      remove(lines, sline);
      sline = hold(sline, newLine(i, lowCorrectF, i + 1, lowCorrectF, SUPPORT_CSS, 'dotted', 'right'));
    }
    if (ne(highCorrectF, prevHighF) && cfg.showResistance === 'Yes') {
      remove(lines, rline);
      rline = hold(rline, newLine(i, highCorrectF, i + 1, highCorrectF, RESISTANCE_CSS, 'dotted', 'right'));
    }

    plot0.push({ time: bars[i].time, value: highCorrectF, color: cfg.showHigh === 'Yes' && eq(highCorrectF, prevHighF) ? HIGH_CSS : 'transparent' });
    plot1.push({ time: bars[i].time, value: lowCorrectF, color: cfg.showLow === 'Yes' && eq(lowCorrectF, prevLowF) ? LOW_CSS : 'transparent' });

    // Break of structure
    const prevBullBoS = barIndexBullBoS;
    const prevBearBoS = barIndexBearBoS;
    if (gt(close, highCorrectF) && le(C(i - 1), highCorrectF)) {
      boS = 'Bull BoS';
      barIndexBullBoS = i;
    } else if (lt(close, lowCorrectF) && ge(C(i - 1), lowCorrectF)) {
      boS = 'Bear BoS';
      barIndexBearBoS = i;
    } else {
      boS = '0';
    }

    // Order block candles: the bar before a change of the swing value
    if (ne(highCorrect, prevHighCorrect)) barIndexSupplyOB = i - 1;
    if (ne(lowCorrect, prevLowCorrect)) barIndexDemandOB = i - 1;
    const demandCondition = boS === 'Bull BoS' && (prevBullBoS > barIndexBearBoS || barIndexBullBoS > barIndexBearBoS)
      && !isNaN(barIndexDemandOB) && demandCheck !== barIndexDemandOB;
    const supplyCondition = boS === 'Bear BoS' && (prevBearBoS > barIndexBullBoS || barIndexBearBoS > barIndexBullBoS)
      && !isNaN(barIndexSupplyOB) && supplyCheck !== barIndexSupplyOB;

    const ATR = atr[i];
    // Offsets from the current bar to the order block candles (na before the first one)
    const d = i - barIndexDemandOB;
    const s = i - barIndexSupplyOB;

    // Demand: candle ranges and extremes of the candles around the order block candle
    if (i >= barIndexDemandOB + 1) {
      DCRa1 = H(back(d + 1)) - L(back(d + 1));
      DCRO = H(back(d)) - L(back(d));
    }
    if (i > barIndexDemandOB + 1 || i >= barIndexDemandOB) {
      const offsets = i > barIndexDemandOB + 1 ? [d - 2, d + 1, d, d - 1] : [d + 1, d, d - 1];
      const opens = offsets.map((k) => O(i - k));
      const highs = offsets.map((k) => H(i - k));
      const lows = offsets.map((k) => L(i - k));
      const closes = offsets.map((k) => C(i - k));
      DminOpen = minOf(opens);
      DminLow = minOf(lows);
      DminClose = minOf(closes);
      DmaxOpen = maxOf(opens);
      DmaxHigh = maxOf(highs);
      DmaxLow = maxOf(lows);
      DmaxClose = maxOf(closes);
    }

    // Demand order block refiner
    if (le(DCRO, ATR * 0.5)) {
      DPA = H(back(d));
      DDA = DminLow;
    } else if (gt(DCRO, ATR * 0.5) && le(DCRO, ATR)) {
      if (gt(candleBody, 0) || eq(candleBody, 0)) {
        DPA = C(back(d));
        DDA = DminLow;
      } else if (lt(candleBody, 0)) {
        DPA = O(back(d));
        DDA = DminLow;
      }
    } else if (gt(DCRO, ATR)) {
      if (lt(L(back(d + 1)), H(back(d)))) {
        if (gt(L(back(d + 1)), L(back(d)))) {
          DPA = L(back(d + 1));
          DDA = L(back(d));
        } else if (le(L(back(d + 1)), L(back(d)))) {
          const body = bodyAt(back(d + 1));
          if (gt(body, 0) || eq(body, 0)) {
            if (gt(DCRa1, ATR)) {
              DPA = DmaxOpen;
              DDA = DminLow;
            } else if (lt(DCRa1, ATR)) {
              DPA = DmaxClose;
              DDA = DminLow;
            }
          } else if (lt(body, 0)) {
            if (gt(DCRa1, ATR) || lt(DCRa1, ATR)) {
              DPA = DmaxOpen;
              DDA = DminLow;
            }
          }
        }
      } else if (gt(DminLow - DminOpen, DminLow - DminClose) && le(DminLow - DminOpen, ATR) && ge(DminLow - DminOpen, ATR * 0.5)) {
        DPA = DminOpen;
        DDA = DminLow;
      } else if (lt(DminLow - DminOpen, DminLow - DminClose) && le(DminLow - DminClose, ATR) && ge(DminLow - DminClose, ATR * 0.5)) {
        DPA = DminClose;
        DDA = DminLow;
      }
    } else if (gt(candleBody, 0)) {
      DPA = DmaxHigh;
      DDA = DminLow;
    } else if (lt(candleBody, 0)) {
      DPA = DmaxHigh;
      DDA = DmaxLow;
    }

    // Supply: candle ranges and extremes
    const SCRa1 = H(back(s + 1)) - L(back(s + 1));
    const SCRO = H(back(s)) - L(back(s));
    if (i > barIndexSupplyOB + 1 || i >= barIndexSupplyOB) {
      const offsets = i > barIndexSupplyOB + 1 ? [s - 2, s + 1, s, s - 1] : [s + 1, s, s - 1];
      SminOpen = minOf(offsets.map((k) => O(i - k)));
      SminLow = minOf(offsets.map((k) => L(i - k)));
      SminClose = minOf(offsets.map((k) => C(i - k)));
      SmaxHigh = maxOf(offsets.map((k) => H(i - k)));
    }

    // Supply order block refiner
    if (le(SCRO, ATR * 0.5)) {
      SPA = L(back(s));
      SDA = SmaxHigh;
    } else if (gt(SCRO, ATR * 0.5) && le(SCRO, ATR)) {
      if (gt(candleBody, 0) || eq(candleBody, 0)) {
        SPA = C(back(s));
        SDA = SmaxHigh;
      } else if (lt(candleBody, 0)) {
        SPA = O(back(s));
        SDA = SmaxHigh;
      }
    } else if (gt(SCRO, ATR)) {
      if (gt(H(back(s - 1)), L(back(s)))) {
        if (gt(H(back(s - 1)), H(back(s)))) {
          SPA = H(back(s - 1));
          SDA = H(back(s));
        } else if (le(H(back(s - 1)), H(back(s)))) {
          const body = bodyAt(back(s - 1));
          if (gt(body, 0) || eq(body, 0)) {
            if (gt(SCRa1, ATR)) {
              SPA = SminClose;
              SDA = SmaxHigh;
            } else if (lt(SCRa1, ATR)) {
              SPA = SminOpen;
              SDA = SmaxHigh;
            }
          } else if (lt(body, 0)) {
            if (gt(SCRa1, ATR)) {
              SPA = SminOpen;
              SDA = SmaxHigh;
            } else if (lt(SCRa1, ATR)) {
              SPA = SmaxHigh;
              SDA = H(back(s - 1));
            }
          }
        }
      } else if (!gt(H(back(s + 1)), L(back(s)))) {
        if (gt(SmaxHigh - SminOpen, SmaxHigh - SminClose) && le(SmaxHigh - SminOpen, ATR) && ge(SmaxHigh - SminOpen, ATR * 0.5)) {
          SPA = SminOpen;
          SDA = SmaxHigh;
        } else if (lt(SmaxHigh - DminOpen, SmaxHigh - DminClose) && le(SmaxHigh - DminClose, ATR) && ge(SmaxHigh - DminClose, ATR * 0.5)) {
          // as in the original, this test reads the demand values
          SPA = SminClose;
          SDA = SmaxHigh;
        }
      }
    } else if (gt(candleBody, 0) || lt(candleBody, 0)) {
      SPA = SminLow;
      SDA = SmaxHigh;
    }

    // Refine type: "Defensive" keeps the far part of a wide zone
    if (cfg.refineType === 'Defensive') {
      const size = DPA - DDA;
      if (ge(size, ATR * 3)) {
        DDistal = DDA;
        DProximal = DPA - size * 0.7;
      } else if (lt(size, ATR * 3) && ge(size, ATR * 2)) {
        DDistal = DDA;
        DProximal = DPA - size * 0.6;
      } else if (lt(size, ATR * 2) && ge(size, ATR * 1.6)) {
        DDistal = DDA;
        DProximal = DPA - size * 0.5;
      } else if (lt(size, ATR * 1.6) && gt(size, ATR)) {
        DDistal = DDA;
        DProximal = DPA - size * 0.25;
      } else if (le(size, ATR)) {
        DDistal = DDA;
        DProximal = DPA;
      }
    } else if (cfg.refineType === 'Aggressive') {
      DDistal = DDA;
      DProximal = DPA;
    }
    if (cfg.refineType === 'Defensive') {
      const size = SDA - SPA;
      if (ge(size, ATR * 3)) {
        SDistal = SDA;
        SProximal = SPA + size * 0.7;
      } else if (lt(size, ATR * 3) && ge(size, ATR * 2)) {
        SDistal = SDA;
        SProximal = SPA + size * 0.6;
      } else if (lt(size, ATR * 2) && ge(size, ATR * 1.6)) {
        SDistal = SDA;
        SProximal = SPA + size * 0.5;
      } else if (lt(size, ATR * 1.6) && gt(size, ATR)) {
        SDistal = SDA;
        SProximal = SPA + size * 0.25;
      } else if (le(size, ATR)) {
        SDistal = SDA;
        SProximal = SPA;
      }
    } else if (cfg.refineType === 'Aggressive') {
      SDistal = SDA;
      SProximal = SPA;
    }

    const prevYDp12 = YDp12;
    const prevYSp12 = YSp12;
    if (demandCondition) {
      demandCheck = barIndexDemandOB;
      YDp12 = refineOn ? DProximal : H(back(d));
      XDp1 = barIndexDemandOB;
      YDd12 = refineOn ? DDistal : L(back(d));
      XDd1 = barIndexDemandOB;
    }
    if (supplyCondition) {
      supplyCheck = barIndexSupplyOB;
      YSp12 = refineOn ? SProximal : L(back(s));
      XSp1 = barIndexSupplyOB;
      YSd12 = refineOn ? SDistal : H(back(s));
      XSd1 = barIndexSupplyOB;
    }

    // LinerFunctionDem(): the demand zone
    if (demandCondition) {
      const mid = (YDp12 + YDd12) / 2;
      demDistal = hold(demDistal, newLine(XDd1, YDd12, XDd1 + 1, YDd12, ZONE_EDGE, 'dashed'));
      demProximal = hold(demProximal, newLine(XDp1, YDp12, XDd1 + 1, YDp12, ZONE_EDGE, 'dashed'));
      demLine50 = hold(demLine50, newLine(XDp1, mid, XDd1 + 1, mid, BLACK, 'dotted'));
      fills.push({ line1: demDistal, line2: demProximal, color: cfg.demBxColor });
    }
    if ((gt(low, YDp12) || eq(XDd1, prevYDp12)) && demCheck) {
      setX2(demDistal, i + 1);
      setX2(demProximal, i + 1);
      setX2(demLine50, i + 1);
    }
    if (lt(low, YDd12) && gt(L(i - 1), YDd12)) demCheck = false;
    if (demandCondition) demCheck = true;

    // LinerFunctionSup(): the supply zone
    if (supplyCondition) {
      const mid = (YSp12 + YSd12) / 2;
      supDistal = hold(supDistal, newLine(XSd1, YSd12, i, YSd12, ZONE_EDGE, 'dashed'));
      supProximal = hold(supProximal, newLine(XSp1, YSp12, i, YSp12, ZONE_EDGE, 'dashed'));
      supLine50 = hold(supLine50, newLine(XSp1, mid, i, mid, BLACK, 'dotted'));
      fills.push({ line1: supDistal, line2: supProximal, color: cfg.supBxColor });
    }
    if ((lt(high, YSp12) || eq(XSd1, prevYSp12)) && supCheck) {
      setX2(supDistal, i + 1);
      setX2(supProximal, i + 1);
      setX2(supLine50, i + 1);
    }
    if (gt(high, YSd12) && lt(H(i - 1), YSd12)) supCheck = false;
    if (supplyCondition) supCheck = true;

    // --- FVGDetector(PFVGFilter, PFVGFilterType, PShowDeFVG, PShowSuFVG) ---
    {
      const range1 = H(i - 1) - L(i - 1);
      const body1 = bodyAt(i - 1);
      const body2 = bodyAt(i - 2);
      const full1 = gt(Math.abs(body1 / range1), 0.7);
      const full2 = gt(Math.abs(body2 / (H(i - 2) - L(i - 2))), 0.35);
      const full0 = gt(Math.abs((close - open) / (high - low)), 0.35);
      const gapUp = gt(low, H(i - 2));
      const gapDown = lt(high, L(i - 2));
      const newHigh = gt(high, H(i - 1));
      const newLow = gt(L(i - 1), low);
      let dCondition = false;
      let sCondition = false;
      if (cfg.fvgFilter === 'Off') {
        dCondition = gapUp;
        sCondition = gapDown;
      } else if (cfg.fvgFilter === 'On') {
        switch (cfg.fvgFilterType) {
          case 'Very Aggressive':
            dCondition = gapUp && newHigh;
            sCondition = gapDown && newLow;
            break;
          case 'Aggressive':
            dCondition = gapUp && ge(range1, 1.0 * ATR) && newHigh;
            sCondition = gapDown && ge(range1, 1.0 * ATR) && newLow;
            break;
          case 'Defensive':
            dCondition = gapUp && ge(range1, 1.5 * ATR) && newHigh && ((gt(body2, 0) && gt(body1, 0)) || full1);
            sCondition = gapDown && ge(range1, 1.5 * ATR) && newLow && ((lt(body2, 0) && lt(body1, 0)) || full1);
            break;
          case 'Very Defensive':
            dCondition = gapUp && ge(range1, 1.5 * ATR) && newHigh && gt(body2, 0) && gt(body1, 0) && full1 && full2 && full0;
            sCondition = gapDown && ge(range1, 1.5 * ATR) && newLow && lt(body2, 0) && lt(body1, 0) && full1 && full2 && full0;
            break;
          default:
        }
      }

      // Demand gap
      const prevDDFVG = DDFVG;
      if (dCondition && cfg.showDeFvg) {
        DDFVG = H(i - 2);
        DPFVG = low;
        barDFVG = i;
        fvgDDistal = hold(fvgDDistal, newLine(i, DDFVG, i, DDFVG, BLACK, 'dotted'));
        fvgDProximal = hold(fvgDProximal, newLine(i, DPFVG, i, DPFVG, BLACK, 'dotted'));
        fills.push({ line1: fvgDDistal, line2: fvgDProximal, color: DEMAND_FVG_FILL });
        dFvgLabel = hold(dFvgLabel, newLabel(i, DDFVG, 'FVG', 'label_up', '#000000'));
      }
      if ((gt(low, DDFVG) || eq(DDFVG, prevDDFVG)) && dMitigated) {
        setX2(fvgDDistal, i + 1);
        setX2(fvgDProximal, i + 1);
        if (alive(dFvgLabel)) dFvgLabel.x = Math.round((barDFVG + i) / 2);
      }
      if (ge(L(i - 1), DPFVG) && le(low, DPFVG)) dMitigated = false;
      if (dCondition) dMitigated = true;

      // Supply gap
      const prevSDFVG = SDFVG;
      if (sCondition && cfg.showSuFvg) {
        SDFVG = L(i - 2);
        SPFVG = high;
        barSFVG = i;
        fvgSDistal = hold(fvgSDistal, newLine(i, SDFVG, i + 10, SDFVG, BLACK, 'dotted'));
        fvgSProximal = hold(fvgSProximal, newLine(i, SPFVG, i + 10, SPFVG, BLACK, 'dotted'));
        fills.push({ line1: fvgSDistal, line2: fvgSProximal, color: SUPPLY_FVG_FILL });
        sFvgLabel = hold(sFvgLabel, newLabel(i, SDFVG, 'FVG', 'label_down', '#000000'));
      }
      if ((lt(high, SDFVG) || eq(SDFVG, prevSDFVG)) && sMitigated) {
        setX2(fvgSDistal, i + 1);
        setX2(fvgSProximal, i + 1);
        if (alive(sFvgLabel)) sFvgLabel.x = Math.round((barSFVG + i) / 2);
      }
      if (ge(high, SPFVG) && le(H(i - 1), SPFVG)) sMitigated = false;
      if (sCondition) sMitigated = true;
    }

    // --- LLF(SPP, DPP, SLLS, DLLS, ...) ---
    {
      /** ta.valuewhen(pivot, x[len], 0 / 1): true when the latest pivot changed on this bar (and there was one before) */
      const feed = (p: PivotPair, pivot: number, len: number, price: (k: number) => number): boolean => {
        if (isNaN(pivot) || pivot === 0) return false;
        const hadOne = !isNaN(p.ic);
        p.vp = p.vc;
        p.ip = p.ic;
        p.vc = price(i - len);
        p.ic = i - len;
        return hadOne && p.ic !== p.ip;
      };
      const newStsH = feed(stsH, staticPivots.high[i], sPP, H);
      const newStsL = feed(stsL, staticPivots.low[i], sPP, L);
      const newDtsH = feed(dtsH, dynamicPivots.high[i], dPP, H);
      const newDtsL = feed(dtsL, dynamicPivots.low[i], dPP, L);
      const prevSHLL = sHLL;
      const prevSLLL = sLLL;
      const prevDHLL = dHLL;
      const prevDLLL = dLLL;
      const prevSHLLl = sHLLl;
      const prevSLLLl = sLLLl;
      const prevDHLLl = dHLLl;
      const prevDLLLl = dLLLl;
      const atrS = i - sPP >= 0 ? atr[i - sPP] : NaN;
      const atrD = i - dPP >= 0 ? atr[i - dPP] : NaN;

      // Statics
      if (newStsH && le(stsH.vc, stsH.vp) && stsH.ic - stsH.ip >= 8 && cfg.showShll && le(Math.abs((stsH.vp - stsH.vc) / atrS), cfg.slls)) {
        sHLL = hold(sHLL, newLine(stsH.ip, stsH.vp, stsH.ic, stsH.vp, STATIC_TOP_LINE, 'dotted'));
        sHLLl = hold(sHLLl, newLabel(Math.round((stsH.ip + stsH.ic) / 2), stsH.vp - ATR / 2, '2 Top Liq', 'label_down', TOP_TEXT));
      }
      if (newStsL && ge(stsL.vc, stsL.vp) && stsL.ic - stsL.ip >= 8 && cfg.showSlll && le(Math.abs((stsL.vp - stsL.vc) / atrS), cfg.slls)) {
        sLLL = hold(sLLL, newLine(stsL.ip, stsL.vp, stsL.ic, stsL.vp, BOTTOM_LINE, 'dotted'));
        sLLLl = hold(sLLLl, newLabel(Math.round((stsL.ip + stsL.ic) / 2), stsL.vp + ATR / 2, '2 Bottom Liq', 'label_up', BOTTOM_TEXT));
      }
      // Dynamics
      if (newDtsH && le(dtsH.vc, dtsH.vp) && dtsH.ic - dtsH.ip >= 4 && cfg.showDhll) {
        const ratio = Math.abs((dtsH.vp - dtsH.vc) / atrD);
        if (ge(ratio, cfg.dlls) && le(ratio, 1.95)) {
          dHLL = hold(dHLL, newLine(dtsH.ip, dtsH.vp, dtsH.ic, dtsH.vc, DYNAMIC_TOP_LINE, 'dotted'));
          dHLLl = hold(dHLLl, newLabel(Math.round((dtsH.ip + dtsH.ic) / 2) + 2, (dtsH.vp + dtsH.vc) / 2 - ATR / 4, 'DLiq', 'label_down', TOP_TEXT));
        }
      }
      if (newDtsL && ge(dtsL.vc, dtsL.vp) && dtsL.ic - dtsL.ip >= 4 && cfg.showDlll) {
        const ratio = Math.abs((dtsL.vp - dtsL.vc) / atrD);
        if (ge(ratio, cfg.dlls) && le(ratio, 1.95)) {
          dLLL = hold(dLLL, newLine(dtsL.ip, dtsL.vp, dtsL.ic, dtsL.vc, BOTTOM_LINE, 'dotted'));
          dLLLl = hold(dLLLl, newLabel(Math.round((dtsL.ip + dtsL.ic) / 2) + 2, (dtsL.vp + dtsL.vp) / 2 + ATR / 4, 'DLiq', 'label_up', BOTTOM_TEXT));
        }
      }

      /**
       * The line of the bar before ends where the line of this bar starts (within `gap` bars): the new line is
       * removed with the label of the bar before, and the old line is extended to the latest pivot. On a bar
       * without a new line both are the same line: a line shorter than `gap` bars removes itself.
       */
      const merge = (
        before: Ln | null, now: Ln | null, labelBefore: Lb | null, labelNow: Lb | null, gap: number,
        extend: (l: Ln) => void, place: (label: Lb, l: Ln) => void,
      ) => {
        const x2 = alive(before) ? before.x2 : NaN;
        const x1 = alive(now) ? now.x1 : NaN;
        if (!(Math.abs(x2 - x1) <= gap)) return;
        remove(lines, now);
        remove(labels, labelBefore);
        if (alive(before)) extend(before);
        if (alive(labelNow) && alive(before)) place(labelNow, before);
      };
      // a label x given as a number with a fraction is truncated
      const middle = (l: Ln) => Math.trunc(Math.abs((l.x1 + l.x2) / 2));
      merge(prevSHLL, sHLL, prevSHLLl, sHLLl, 2, (l) => { l.x2 = stsH.ic; }, (label, l) => {
        label.text = '3 Top Liq';
        label.x = middle(l);
      });
      merge(prevSLLL, sLLL, prevSLLLl, sLLLl, 2, (l) => { l.x2 = stsL.ic; }, (label, l) => {
        label.text = '3 Top Liq';
        label.x = middle(l);
      });
      merge(prevDHLL, dHLL, prevDHLLl, dHLLl, dPP * 2 + 1, (l) => {
        l.x2 = dtsH.ic;
        l.y2 = dtsH.vc;
      }, (label, l) => {
        label.x = Math.trunc(Math.abs((l.x1 + l.x2) / 2 + 2));
        label.y = (l.y1 + l.y2) / 2;
      });
      merge(prevDLLL, dLLL, prevDLLLl, dLLLl, dPP * 2 + 1, (l) => {
        l.x2 = dtsL.ic;
        l.y2 = dtsL.vc;
      }, (label, l) => {
        label.x = Math.trunc(Math.abs((l.x1 + l.x2) / 2 + 2));
        label.y = (l.y1 + l.y2) / 2;
      });
    }
  }

  const interval = barInterval(bars);
  const xTime = (index: number) => (index < n ? bars[Math.max(index, 0)].time : barTime(bars, index, interval));
  const lineOut = (l: Ln): LineDrawingData => ({
    time1: xTime(l.x1), price1: l.y1, time2: xTime(l.x2), price2: l.y2, color: l.color, style: l.style, width: 1,
    ...(l.extend ? { extend: l.extend } : {}),
  });
  // an object with an na coordinate is not drawn
  const drawn = (l: Ln) => ![l.x1, l.x2, l.y1, l.y2].some((v) => isNaN(v));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    lines: lines.filter(drawn).map(lineOut),
    labels: labels.filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: xTime(l.x), price: l.y, text: l.text, style: l.style, color: LABEL_BG, textColor: l.textColor,
      textAlign: 'center' as const, size: 'small' as const,
    })),
    // a fill lives as long as its two lines
    linefills: fills.filter((f) => !f.line1.deleted && !f.line2.deleted && drawn(f.line1) && drawn(f.line2))
      .map((f) => ({ line1: lineOut(f.line1), line2: lineOut(f.line2), color: f.color })),
  };
}

export const IctConceptOrderBlockFvgLiquiditySweeps = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
