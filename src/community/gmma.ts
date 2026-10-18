/**
 * GMMA - Guppy Multiple Moving Average
 *
 * Two groups of EMAs: short-term (3,5,8,10,12,15) and long-term (30,35,40,45,50,60).
 * Short group reflects trader sentiment, long group reflects investor sentiment.
 * Convergence/divergence between groups signals trend changes.
 * Alert arrows (the original's plotarrow outputs, `arrows` of the result), from the Super Guppy rules of the original:
 * the average of 11 fast EMAs (3..23) against the average of 16 slow EMAs (25..70), with the fast / slow ribbons in
 * order: a swing arrow when the fast ribbon turns ordered with the trend, a break arrow when the averages cross, each
 * only after more than "Alert Lookback Length" bars since the last one. The alternate anchor timeframe of the
 * original is not ported (multiplier 1).
 *
 * Reference: "Guppy Multiple Moving Average" by Daryl Guppy
 */

import { ta, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { ArrowData } from 'oakscriptjs';

export interface GMMAInputs {
  src: SourceType;
  /** Show Trend Break Arrow Alerts */
  showBreak: boolean;
  /** Show Swing Arrow Alerts */
  showSwing: boolean;
  /** Give Only Fast+Slow Confluence Alerts */
  showCon: boolean;
  /** Add Bar Colour Changes to Swing Alerts */
  uOccSwing: boolean;
  /** Alert Lookback Length */
  lookback: number;
  /** Filter Alerts with 200ema */
  emaFilter: boolean;
}

export const defaultInputs: GMMAInputs = {
  src: 'close',
  showBreak: true,
  showSwing: true,
  showCon: false,
  uOccSwing: false,
  lookback: 6,
  emaFilter: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'showBreak', type: 'bool', title: 'Show Trend Break Arrow Alerts', defval: true },
  { id: 'showSwing', type: 'bool', title: 'Show Swing Arrow Alerts', defval: true },
  { id: 'showCon', type: 'bool', title: 'Give Only Fast+Slow Confluence Alerts', defval: false },
  { id: 'uOccSwing', type: 'bool', title: 'Add Bar Colour Changes to Swing Alerts', defval: false },
  { id: 'lookback', type: 'int', title: 'Alert Lookback Length', defval: 6 },
  { id: 'emaFilter', type: 'bool', title: 'Filter Alerts with 200ema', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Short EMA 3', color: '#26A69A', lineWidth: 1 },
  { id: 'plot1', title: 'Short EMA 5', color: '#2E7D32', lineWidth: 1 },
  { id: 'plot2', title: 'Short EMA 8', color: '#388E3C', lineWidth: 1 },
  { id: 'plot3', title: 'Short EMA 10', color: '#43A047', lineWidth: 1 },
  { id: 'plot4', title: 'Short EMA 12', color: '#4CAF50', lineWidth: 1 },
  { id: 'plot5', title: 'Short EMA 15', color: '#66BB6A', lineWidth: 1 },
  { id: 'plot6', title: 'Long EMA 30', color: '#EF5350', lineWidth: 1 },
  { id: 'plot7', title: 'Long EMA 35', color: '#E53935', lineWidth: 1 },
  { id: 'plot8', title: 'Long EMA 40', color: '#D32F2F', lineWidth: 1 },
  { id: 'plot9', title: 'Long EMA 45', color: '#C62828', lineWidth: 1 },
  { id: 'plot10', title: 'Long EMA 50', color: '#B71C1C', lineWidth: 1 },
  { id: 'plot11', title: 'Long EMA 60', color: '#880E4F', lineWidth: 1 },
];

export const metadata = {
  title: 'Guppy Multiple Moving Average',
  shortTitle: 'GMMA',
  overlay: true,
};

/** Colour constants of Pine version 3 (the original's version) */
const LIME = '#00FF00';
const RED = '#FF0000';
const AQUA = '#00FFFF';
const BLUE = '#0000FF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(bars: Bar[], inputs: Partial<GMMAInputs> = {}): IndicatorResult & { arrows: ArrowData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const src = getSourceSeries(bars, cfg.src);

  const shortLengths = [3, 5, 8, 10, 12, 15];
  const longLengths = [30, 35, 40, 45, 50, 60];
  const allLengths = [...shortLengths, ...longLengths];
  const warmup = 60;

  const emaArrays = allLengths.map((len) => ta.ema(src, len).toArray());

  const plots: Record<string, Array<{ time: number; value: number }>> = {};

  for (let idx = 0; idx < allLengths.length; idx++) {
    const arr = emaArrays[idx];
    plots[`plot${idx}`] = arr.map((v, i) => {
      if (i < warmup || isNaN(v)) return { time: bars[i].time, value: NaN };
      return { time: bars[i].time, value: v };
    });
  }

  // Short cloud fill between plot0 (EMA 3) and plot5 (EMA 15)
  const shortFillColors = bars.map((_b, i) => (i < warmup ? 'transparent' : '#26A69A40'));
  // Long cloud fill between plot6 (EMA 30) and plot11 (EMA 60)
  const longFillColors = bars.map((_b, i) => (i < warmup ? 'transparent' : '#EF535040'));

  // Super Guppy alert arrows (anchor multiplier 1)
  const A = (len: number) => ta.ema(src, len).toArray().map((v) => v ?? NaN);
  const fastE = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23].map(A);
  const slowE = [25, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70].map(A);
  const ema200 = A(200);
  const ordered = (list: number[][], i: number, cmp: (a: number, b: number) => boolean) =>
    list.every((e, k) => k === 0 || cmp(list[k - 1][i], e[i]));
  const closeArr = bars.map((b) => b.close);
  const openArr = bars.map((b) => b.open);
  const { showBreak, showSwing, showCon, uOccSwing, lookback, emaFilter } = cfg;
  const buy: number[] = [], sell: number[] = [], buyBreak: number[] = [], sellBreak: number[] = [];
  // barssince(nz(x[1], 1) == 1): bars since the last bar on which the previous value was 1 (na before the first)
  const since = [NaN, NaN, NaN, NaN];
  const sinceStep = (k: number, prev: number) => {
    since[k] = (isNaN(prev) ? 1 : prev) === 1 ? 0 : since[k] + 1;
    return since[k];
  };
  const arrows: ArrowData[] = [];
  const arrowColor = (c: string) => String(color.new(c, 20));
  for (let i = 0; i < bars.length; i++) {
    const emafast = fastE.reduce((s, e) => s + e[i], 0) / 11;
    const emaslow = slowE.reduce((s, e) => s + e[i], 0) / 16;
    const colfastL = ordered(fastE, i, gt);
    const colfastS = ordered(fastE, i, lt);
    const colslowL = ordered(slowE, i, gt);
    const colslowS = ordered(slowE, i, lt);
    const p = (a: number[]) => (i > 0 ? a[i - 1] : NaN);
    const nzPos = (v: number) => (isNaN(v) ? 0 : v) > 0;
    let b = gt(emafast, emaslow) && !colslowS && colfastL && (!showCon || colslowL) && (!emaFilter || gt(emafast, ema200[i]))
      ? (nzPos(p(buy)) ? p(buy) + 1 : 1) : 0;
    let s = lt(emafast, emaslow) && !colslowL && colfastS && (!showCon || colslowS) && (!emaFilter || lt(emafast, ema200[i]))
      ? (nzPos(p(sell)) ? p(sell) + 1 : 1) : 0;
    const c1 = i > 0 ? closeArr[i - 1] : NaN, o1 = i > 0 ? openArr[i - 1] : NaN;
    if (b > 1 && colfastL && uOccSwing && lt(c1, o1) && gt(closeArr[i], openArr[i])) b = 1;
    if (s > 1 && colfastS && uOccSwing && gt(c1, o1) && lt(closeArr[i], openArr[i])) s = 1;
    const bb = gt(emafast, emaslow) && !colslowS && (!emaFilter || gt(emafast, ema200[i]))
      ? (nzPos(p(buyBreak)) ? p(buyBreak) + 1 : 1) : 0;
    const sb = lt(emafast, emaslow) && !colslowL && (!emaFilter || lt(emafast, ema200[i]))
      ? (nzPos(p(sellBreak)) ? p(sellBreak) + 1 : 1) : 0;
    const sinceBuy = sinceStep(0, p(buy));
    const sinceSell = sinceStep(1, p(sell));
    const sinceBuyBreak = sinceStep(2, p(buyBreak));
    const sinceSellBreak = sinceStep(3, p(sellBreak));
    buy.push(b);
    sell.push(s);
    buyBreak.push(bb);
    sellBreak.push(sb);
    const t = bars[i].time;
    // plotarrow(ShowSwing and buy == 1 and barssince(nz(buy[1], 1) == 1) > Lookback ? 1 : na, "BUY Swing Arrow", colorup = lime)
    if (showSwing && b === 1 && sinceBuy > lookback) arrows.push({ time: t, id: 'arrow0', value: 1, color: arrowColor(LIME) });
    // plotarrow(... sell == 1 ... ? -1 : na, "SELL Swing Arrow", colordown = red)
    if (showSwing && s === 1 && sinceSell > lookback) arrows.push({ time: t, id: 'arrow1', value: -1, color: arrowColor(RED) });
    // plotarrow(ShowBreak and buybreak == 1 and barssince(sellbreak) > Lookback and barssince(buybreak) > Lookback ? 1 : na)
    if (showBreak && bb === 1 && sinceSellBreak > lookback && sinceBuyBreak > lookback) {
      arrows.push({ time: t, id: 'arrow2', value: 1, color: arrowColor(AQUA) });
    }
    if (showBreak && sb === 1 && sinceBuyBreak > lookback && sinceSellBreak > lookback) {
      arrows.push({ time: t, id: 'arrow3', value: -1, color: arrowColor(BLUE) });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    arrows,
    fills: [
      { plot1: 'plot0', plot2: 'plot5', colors: shortFillColors },
      { plot1: 'plot6', plot2: 'plot11', colors: longFillColors },
    ],
  };
}

export const GMMA = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
