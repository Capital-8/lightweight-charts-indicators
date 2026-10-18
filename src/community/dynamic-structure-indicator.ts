/**
 * Dynamic Structure Indicator
 *
 * Support / resistance zones from fractal swing highs / lows (the original's rules): a swing high (the previous high
 * is the highest of "High/Low Lookback" bars and the high is below it) gives a potential resistance zone from that
 * wick high (R1) to the highest body of the three bars around it (R2), kept when it is no larger than "Max Zone Size"
 * x ATR(14); it becomes the current zone once price falls "ATR Movement Required" x the saved ATR below it (support:
 * the mirror rules with the lows). A confirmed close beyond the current zone starts the search for a new one; the
 * zone that was broken is kept as a previous zone (support turned resistance, resistance turned support) until a
 * confirmed close beyond its body level, or replaced after "Zone Update Count Before Reset" updates.
 * As in the original, the levels are `var` values that start at 0: R1 / R2 and S1 / S2 are drawn wherever the wick
 * level did not change on the bar (also at 0 before the first zone, a gap on the bar of a change); green / red by the
 * side of the close, with a fill (opaque green above the resistance, 50 % red else; red below the support, 50 %
 * green else). PS1 / PS2 (red) and PR1 / PR2 (green) draw the previous zones while unchanged and different from the
 * current one ("Draw Previous Structure"), filled 10 % transparent.
 *
 * Alerts (alertcondition, `alerts` of the result): '[DSI] Alert!' (any of the four below), '[DSI] Resistance Alert'
 * (high >= R2), '[DSI] Support Alert' (low <= S2), '[DSI] Resistance Breakout' (close >= R1) and '[DSI] Support
 * Breakout' (close <= S1). barstate.isconfirmed comes from the chart context, the third argument.
 *
 * Reference: "Dynamic Structure Indicator" (community)
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface DynamicStructureIndicatorInputs {
  atrMovement: number;
  lookback: number;
  maxZoneSize: number;
  newStructureReset: number;
  drawPreviousStructure: boolean;
}

export const defaultInputs: DynamicStructureIndicatorInputs = {
  atrMovement: 1.0,
  lookback: 25,
  maxZoneSize: 2.5,
  newStructureReset: 25,
  drawPreviousStructure: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrMovement', type: 'float', title: 'ATR Movement', defval: 1.0, min: 0.1, step: 0.1 },
  { id: 'lookback', type: 'int', title: 'Lookback', defval: 25, min: 1 },
  { id: 'maxZoneSize', type: 'float', title: 'Max Zone Size (ATR)', defval: 2.5, min: 0.1, step: 0.1 },
  { id: 'newStructureReset', type: 'int', title: 'New Structure Reset', defval: 25, min: 1 },
  { id: 'drawPreviousStructure', type: 'bool', title: 'Draw Previous Structure', defval: true },
];

const GREEN = color.green;
const RED = color.red;

export const plotConfig: PlotConfig[] = [
  { id: 'r1', title: 'R1', color: RED, lineWidth: 1, style: 'linebr' },
  { id: 'r2', title: 'R2', color: RED, lineWidth: 1, style: 'linebr' },
  { id: 's1', title: 'S1', color: GREEN, lineWidth: 1, style: 'linebr' },
  { id: 's2', title: 'S2', color: GREEN, lineWidth: 1, style: 'linebr' },
  { id: 'ps1', title: 'PS1', color: RED, lineWidth: 1, style: 'linebr' },
  { id: 'ps2', title: 'PS2', color: RED, lineWidth: 1, style: 'linebr' },
  { id: 'pr1', title: 'PR1', color: GREEN, lineWidth: 1, style: 'linebr' },
  { id: 'pr2', title: 'PR2', color: GREEN, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Dynamic Structure Indicator',
  shortTitle: 'DSI',
  overlay: true,
};

/** The original's levels at the end of each bar */
interface Levels {
  res1: number[]; res2: number[]; sup1: number[]; sup2: number[];
  prevRes1: number[]; prevRes2: number[]; prevSup1: number[]; prevSup2: number[];
}

/**
 * The original's zone levels per bar (res1 / res2 / sup1 / sup2: wick and body of the current resistance and support,
 * 0 until the first zone; previousRes1 / 2, previousSup1 / 2: the previous zones, na when reset), from its rules.
 */
function originalLevels(bars: Bar[], cfg: DynamicStructureIndicatorInputs, atr: number[], lastBarOpen: boolean): Levels {
  const n = bars.length;
  const out: Levels = { res1: [], res2: [], sup1: [], sup2: [], prevRes1: [], prevRes2: [], prevSup1: [], prevSup2: [] };
  const hb = bars.map((b) => (b.open > b.close ? b.open : b.close));
  const lb = bars.map((b) => (b.open > b.close ? b.close : b.open));
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  let r1v = 0, r2v = 0, s1v = 0, s2v = 0;
  let lookRes = true, lookSup = true;
  let prevRes1 = 0, prevRes2 = 0, prevSup1 = 0, prevSup2 = 0;
  let atrSaved = 0, potR1 = 0, potR2 = 0, potS1 = 0, potS2 = 0;
  let supCount = 0, resCount = 0;
  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];
    const confirmed = !(lastBarOpen && i === n - 1);
    // ta.highest(high, lookback) / ta.lowest(low, lookback): na until lookback bars exist
    let hh = NaN, ll = NaN;
    if (i >= cfg.lookback - 1) {
      hh = -Infinity; ll = Infinity;
      for (let j = i - cfg.lookback + 1; j <= i; j++) { hh = Math.max(hh, bars[j].high); ll = Math.min(ll, bars[j].low); }
    }
    const high1 = i > 0 ? bars[i - 1].high : NaN;
    const low1 = i > 0 ? bars[i - 1].low : NaN;
    if (high1 === hh && high < high1 && lookRes) {
      const r1 = high1;
      const r2 = at(hb, i - 2) > at(hb, i - 1) ? at(hb, i - 2) : hb[i] > at(hb, i - 1) ? hb[i] : at(hb, i - 1);
      if ((r1 - r2) / atr[i] <= cfg.maxZoneSize) {
        lookRes = false; potR1 = r1; potR2 = r2; atrSaved = atr[i];
      }
    }
    if (low1 === ll && low > low1 && lookSup) {
      const s1 = low1;
      const s2 = at(lb, i - 2) < at(lb, i - 1) ? at(lb, i - 2) : lb[i] < at(lb, i - 1) ? lb[i] : at(lb, i - 1);
      if ((s2 - s1) / atr[i] <= cfg.maxZoneSize) {
        lookSup = false; potS1 = s1; potS2 = s2; atrSaved = atr[i];
      }
    }
    if (close > potR1 && confirmed) { potR1 = NaN; potR2 = NaN; }
    if (close < potS1 && confirmed) { potS1 = NaN; potS2 = NaN; }
    if (potR1 - low >= atrSaved * cfg.atrMovement) {
      prevRes1 = isNaN(prevRes1) ? potR1 : prevRes1;
      prevRes2 = isNaN(prevRes2) ? potR2 : prevRes2;
      r1v = potR1; r2v = potR2; potR1 = NaN; potR2 = NaN;
    }
    if (high - potS1 >= atrSaved * cfg.atrMovement) {
      prevSup1 = isNaN(prevSup1) ? potS1 : prevSup1;
      prevSup2 = isNaN(prevSup2) ? potS2 : prevSup2;
      s1v = potS1; s2v = potS2; potS1 = NaN; potS2 = NaN;
    }
    if (close >= r1v && confirmed) { lookRes = true; lookSup = true; resCount++; }
    if (close <= s1v && confirmed) { lookSup = true; lookRes = true; supCount++; }
    if ((close > r1v && isNaN(prevRes1) && confirmed) || prevRes1 === 0 || supCount >= cfg.newStructureReset) {
      prevRes1 = r1v; prevRes2 = r2v; supCount = 0;
    }
    if ((close < s1v && isNaN(prevSup1) && confirmed) || prevSup1 === 0 || resCount >= cfg.newStructureReset) {
      prevSup1 = s1v; prevSup2 = s2v; resCount = 0;
    }
    if (close < prevRes2 && confirmed) { prevRes1 = NaN; prevRes2 = NaN; }
    if (close > prevSup2 && confirmed) { prevSup1 = NaN; prevSup2 = NaN; }
    out.res1.push(r1v); out.res2.push(r2v); out.sup1.push(s1v); out.sup2.push(s2v);
    out.prevRes1.push(prevRes1); out.prevRes2.push(prevRes2); out.prevSup1.push(prevSup1); out.prevSup2.push(prevSup2);
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicStructureIndicatorInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const atrNum = ta.atr(bars, 14).toArray().map((v) => v ?? NaN);
  const lv = originalLevels(bars, cfg, atrNum, !lastBarConfirmedOf(chart));
  const { res1, res2, sup1, sup2, prevRes1, prevRes2, prevSup1, prevSup2 } = lv;

  // x == x[1] (na on the first bar, and na == na is false)
  const same = (a: number[], i: number) => i > 0 && a[i] === a[i - 1];
  // na != x is false as well
  const differs = (a: number, b: number) => !isNaN(a) && !isNaN(b) && a !== b;
  const point = (i: number, value: number, c: string) => ({ time: bars[i].time, value, color: c });

  const plots: Record<string, { time: number; value: number; color: string }[]> = {
    r1: [], r2: [], s1: [], s2: [], ps1: [], ps2: [], pr1: [], pr2: [],
  };
  const resFill: string[] = [];
  const supFill: string[] = [];
  const prevSupFill: string[] = [];
  const prevResFill: string[] = [];
  const red50 = String(color.new(RED, 50));
  const green50 = String(color.new(GREEN, 50));
  const red10 = String(color.new(RED, 10));
  const green10 = String(color.new(GREEN, 10));
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    // r1 = plot(res1 == res1[1] ? res1 : na, color = close >= res1 ? color.green : color.red, plot.style_linebr)
    // r2 = plot(res1 == res1[1] ? res2 : na, ...); fill(r1, r2, close > res1 ? color.green : color.new(color.red, 50))
    const rOn = same(res1, i);
    const rColor = c >= res1[i] ? GREEN : RED;
    plots.r1.push(point(i, rOn ? res1[i] : NaN, rColor));
    plots.r2.push(point(i, rOn ? res2[i] : NaN, rColor));
    resFill.push(c > res1[i] ? GREEN : red50);
    // s1 = plot(sup1 == sup1[1] ? sup1 : na, color = close < sup1 ? color.red : color.green) / s2;
    // fill(s1, s2, close < sup1 ? color.red : color.new(color.green, 50))
    const sOn = same(sup1, i);
    const sColor = c < sup1[i] ? RED : GREEN;
    plots.s1.push(point(i, sOn ? sup1[i] : NaN, sColor));
    plots.s2.push(point(i, sOn ? sup2[i] : NaN, sColor));
    supFill.push(c < sup1[i] ? RED : green50);
    // ps1 = plot(previousSup1 == previousSup1[1] and previousSup1 != sup1 and drawPreviousStructure ? previousSup1 : na,
    // color.red) / ps2 (previousSup2); fill(ps1, ps2, color.new(color.red, 10))
    const psOn = cfg.drawPreviousStructure && same(prevSup1, i) && differs(prevSup1[i], sup1[i]);
    plots.ps1.push(point(i, psOn ? prevSup1[i] : NaN, RED));
    plots.ps2.push(point(i, psOn ? prevSup2[i] : NaN, RED));
    prevSupFill.push(red10);
    // pr1 / pr2: the same with previousRes1 / previousRes2 against res1, color.green; fill color.new(color.green, 10)
    const prOn = cfg.drawPreviousStructure && same(prevRes1, i) && differs(prevRes1[i], res1[i]);
    plots.pr1.push(point(i, prOn ? prevRes1[i] : NaN, GREEN));
    plots.pr2.push(point(i, prOn ? prevRes2[i] : NaN, GREEN));
    prevResFill.push(green10);
  }

  // alertResistance = high >= res2, alertSupport = low <= sup2, alertResistanceBO = close >= res1,
  // alertSupportBO = close <= sup1
  const al = {
    resAlert: bars.map((b, i) => b.high >= res2[i]),
    supAlert: bars.map((b, i) => b.low <= sup2[i]),
    resBo: bars.map((b, i) => b.close >= res1[i]),
    supBo: bars.map((b, i) => b.close <= sup1[i]),
  };

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'r1', plot2: 'r2', options: { color: GREEN }, colors: resFill },
      { plot1: 's1', plot2: 's2', options: { color: RED }, colors: supFill },
      { plot1: 'ps1', plot2: 'ps2', options: { color: red10 }, colors: prevSupFill },
      { plot1: 'pr1', plot2: 'pr2', options: { color: green10 }, colors: prevResFill },
    ],
    alerts: alertStates(alertConditions, bars, [
      bars.map((_, i) => al.resAlert[i] || al.supAlert[i] || al.resBo[i] || al.supBo[i]),
      al.resAlert, al.supAlert, al.resBo, al.supBo,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '[DSI] Alert!', message: 'DSI alert for {{ticker}}' },
  { id: 'alert1', title: '[DSI] Resistance Alert', message: 'Price has entered current potential resistance zone for {{ticker}}' },
  { id: 'alert2', title: '[DSI] Support Alert', message: 'Price has entered current potential support zone for {{ticker}}' },
  { id: 'alert3', title: '[DSI] Resistance Breakout', message: 'Price has broken past potential resistance zone for {{ticker}}' },
  { id: 'alert4', title: '[DSI] Support Breakout', message: 'Price has broken past potential support zone for {{ticker}}' },
];

export const DynamicStructureIndicator = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
