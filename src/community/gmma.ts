/**
 * GMMA - Guppy Multiple Moving Average
 *
 * Two groups of EMAs as the original: 'Trader EMA 1..6' (lengths 3, 5, 8, 10, 12, 15, aqua) and 'Investor EMA 1..6'
 * (lengths 30, 35, 40, 45, 50, 60, red), transparency 15, 12, 9, 6, 3, 0 from the first to the sixth of each group.
 * Each EMA is drawn from its first value (ta.ema, seeded with the SMA of its first `length` values); no cloud fills.
 * Alert arrows (the original's plotarrow outputs, `arrows` of the result), from the Super Guppy rules of the original:
 * the average of 11 fast EMAs (3..23) against the average of 16 slow EMAs (25..70), with the fast / slow ribbons in
 * order: a swing arrow when the fast ribbon turns ordered with the trend, a break arrow when the averages cross, each
 * only after more than "Alert Lookback Length" bars since the last one. "Use alternate Anchor TimeFrame" multiplies
 * the lengths of these Super Guppy EMAs (and of the 200 EMA filter) as the original: on intraday charts by
 * round(anchor / chart minutes) when the anchor (minutes, up to 1440) is above the chart interval, on daily / weekly /
 * monthly charts by round(anchor / chart multiplier) when the anchor is at most 52 and above it; 1 otherwise (0 = none).
 * The chart timeframe is `chart.timeframe` of the optional third argument, else the bar spacing.
 *
 * Reference: "Guppy Multiple Moving Average" by Daryl Guppy
 */

import { ta, color, timeframe, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { ArrowData } from 'oakscriptjs';
import { chartTimeframe } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface GMMAInputs {
  src: SourceType;
  /** Use alternate Anchor TimeFrame (0 = none): minutes on intraday charts, D / W / M units above */
  anchor: number;
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
  /** Trader EMA 1..6 length */
  t1: number; t2: number; t3: number; t4: number; t5: number; t6: number;
  /** Investor EMA 1..6 length */
  i1: number; i2: number; i3: number; i4: number; i5: number; i6: number;
}

export const defaultInputs: GMMAInputs = {
  src: 'close',
  anchor: 0,
  showBreak: true,
  showSwing: true,
  showCon: false,
  uOccSwing: false,
  lookback: 6,
  emaFilter: false,
  t1: 3, t2: 5, t3: 8, t4: 10, t5: 12, t6: 15,
  i1: 30, i2: 35, i3: 40, i4: 45, i5: 50, i6: 60,
};

const TRADER_KEYS = ['t1', 't2', 't3', 't4', 't5', 't6'] as const;
const INVESTOR_KEYS = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'] as const;

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'anchor', type: 'int', title: 'Use alternate Anchor TimeFrame (0=none, max=1440 (mins,D,W)', defval: 0, min: 0, max: 1440 },
  { id: 'showBreak', type: 'bool', title: 'Show Trend Break Arrow Alerts', defval: true },
  { id: 'showSwing', type: 'bool', title: 'Show Swing Arrow Alerts', defval: true },
  { id: 'showCon', type: 'bool', title: 'Give Only Fast+Slow Confluence Alerts', defval: false },
  { id: 'uOccSwing', type: 'bool', title: 'Add Bar Colour Changes to Swing Alerts', defval: false },
  { id: 'lookback', type: 'int', title: 'Alert Lookback Length', defval: 6 },
  { id: 'emaFilter', type: 'bool', title: 'Filter Alerts with 200ema', defval: false },
  ...TRADER_KEYS.map((id, k): InputConfig => ({
    id, type: 'int', title: `Trader EMA ${k + 1} length`, defval: defaultInputs[id], min: 1,
  })),
  ...INVESTOR_KEYS.map((id, k): InputConfig => ({
    id, type: 'int', title: `Investor EMA ${k + 1} length`, defval: defaultInputs[id], min: 1,
  })),
];

/** Colour constants of Pine version 3 (the original's version) */
const LIME = '#00FF00';
const RED = '#FF0000';
const AQUA = '#00FFFF';
const BLUE = '#0000FF';
/** transp1..transp6 of the original */
const TRANSP = [15, 12, 9, 6, 3, 0];

export const plotConfig: PlotConfig[] = [
  ...TRANSP.map((tr, k): PlotConfig => ({ id: `plot${k}`, title: `Trader EMA ${k + 1}`, color: String(color.new(AQUA, tr)), lineWidth: 1 })),
  ...TRANSP.map((tr, k): PlotConfig => ({ id: `plot${k + 6}`, title: `Investor EMA ${k + 1}`, color: String(color.new(RED, tr)), lineWidth: 1 })),
];

export const metadata = {
  title: 'Guppy Multiple Moving Average',
  shortTitle: 'GMMA',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/**
 * The original's multiplier of the Super Guppy lengths:
 * mult = isintraday ? (anchor == 0 or interval <= 0 or interval >= anchor or anchor > 1440) ? 1
 *   : round(anchor / interval) > 1 ? round(anchor / interval) : 1 : 1
 * mult := not isintraday ? (anchor == 0 or interval <= 0 or interval >= anchor or anchor > 52) ? mult
 *   : round(anchor / interval) > 1 ? round(anchor / interval) : 1 : mult
 */
function anchorMultiplier(anchor: number, tf: string): number {
  if (tf === '') return 1;
  const info = timeframe.info(tf);
  const interval = info.multiplier;
  const r = Math.round(anchor / interval);
  if (info.isintraday) {
    return anchor === 0 || interval <= 0 || interval >= anchor || anchor > 1440 ? 1 : r > 1 ? r : 1;
  }
  return anchor === 0 || interval <= 0 || interval >= anchor || anchor > 52 ? 1 : r > 1 ? r : 1;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<GMMAInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { arrows: ArrowData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const src = getSourceSeries(bars, cfg.src);

  // TEMA1..6 = ema(src, T1..T6), IEMA1..6 = ema(src, I1..I6): plotted as they are (na until each EMA has a value)
  const lengths = [...TRADER_KEYS, ...INVESTOR_KEYS].map((k) => cfg[k]);
  const plots: Record<string, Array<{ time: number; value: number }>> = {};
  lengths.forEach((len, idx) => {
    const arr = ta.ema(src, len).toArray();
    plots[`plot${idx}`] = arr.map((v, i) => ({ time: bars[i].time, value: v ?? NaN }));
  });

  // Super Guppy alert arrows: emaF<k> = ema(src, lenF<k> * mult), emaS<k> = ema(src, lenS<k> * mult),
  // ema200 = ema(src, len * mult)
  const mult = anchorMultiplier(cfg.anchor, chartTimeframe(bars, chart));
  const A = (len: number) => ta.ema(src, len * mult).toArray().map((v) => v ?? NaN);
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
  };
}

export const GMMA = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
