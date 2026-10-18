/**
 * Super Guppy R1.0
 *
 * Multi-EMA trend alignment indicator.
 * 11 Fast EMAs (3-23) and 16 Slow EMAs (25-70) detect trend strength and alignment.
 * Fast/slow bands are filled with alignment-dependent colors.
 * Swing and Break buy / sell arrows (the original's plotarrow outputs, `arrows` of the result): swing arrows on the
 * first bar of a fast + slow alignment, break arrows on the first bar of the fast average beyond the slow one, each
 * only when the previous one of that kind is more than `lookback` bars back.
 *
 * Reference: "Super Guppy R1.0" by JustUncleL
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type ArrowData } from 'oakscriptjs';
import type { BarColorData } from '../types';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export interface SuperGuppyInputs {
  showBreak: boolean;
  showSwing: boolean;
  lookback: number;
}

export const defaultInputs: SuperGuppyInputs = {
  showBreak: true,
  showSwing: true,
  lookback: 6,
};

export const inputConfig: InputConfig[] = [
  { id: 'showBreak', type: 'bool', title: 'Show Break Signals', defval: true },
  { id: 'showSwing', type: 'bool', title: 'Show Swing Signals', defval: true },
  { id: 'lookback', type: 'int', title: 'Signal Lookback', defval: 6, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast Upper (EMA 3)', color: '#00FFFF', lineWidth: 1 },
  { id: 'plot1', title: 'Fast Lower (EMA 23)', color: '#00FFFF', lineWidth: 1 },
  { id: 'plot2', title: 'Slow Upper (EMA 25)', color: '#00FF00', lineWidth: 1 },
  { id: 'plot3', title: 'Slow Lower (EMA 70)', color: '#00FF00', lineWidth: 1 },
  { id: 'plot4', title: 'EMA Fast Avg', color: '#FFD700', lineWidth: 2 },
  { id: 'plot5', title: 'EMA Slow Avg', color: '#FF00FF', lineWidth: 2 },
];

export const metadata = {
  title: 'Super Guppy',
  shortTitle: 'SGuppy',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<SuperGuppyInputs> = {}): IndicatorResult & { arrows: ArrowData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { showBreak, showSwing } = cfg;
  const n = bars.length;
  const close = new Series(bars, (b) => b.close);

  // Fast EMAs: periods 3,5,7,9,11,13,15,17,19,21,23
  const fastPeriods = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
  const fastEmas = fastPeriods.map((p) => ta.ema(close, p).toArray());

  // Slow EMAs: periods 25,28,31,34,37,40,43,46,49,52,55,58,61,64,67,70
  const slowPeriods = [25, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70];
  const slowEmas = slowPeriods.map((p) => ta.ema(close, p).toArray());

  const warmup = 70; // longest EMA period

  // Compute averages
  const emaFastAvg: number[] = new Array(n);
  const emaSlowAvg: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let fSum = 0;
    for (let j = 0; j < fastEmas.length; j++) fSum += fastEmas[j][i] ?? 0;
    emaFastAvg[i] = fSum / fastEmas.length;

    let sSum = 0;
    for (let j = 0; j < slowEmas.length; j++) sSum += slowEmas[j][i] ?? 0;
    emaSlowAvg[i] = sSum / slowEmas.length;
  }

  // Alignment checks
  const fastAlignedLong: boolean[] = new Array(n);
  const fastAlignedShort: boolean[] = new Array(n);
  const slowAlignedLong: boolean[] = new Array(n);
  const slowAlignedShort: boolean[] = new Array(n);

  for (let i = 0; i < n; i++) {
    // Fast aligned long: F1>F2>F3>...>F11 AND S1>S16
    let fLong = true;
    let fShort = true;
    for (let j = 0; j < fastEmas.length - 1; j++) {
      if ((fastEmas[j][i] ?? 0) <= (fastEmas[j + 1][i] ?? 0)) fLong = false;
      if ((fastEmas[j][i] ?? 0) >= (fastEmas[j + 1][i] ?? 0)) fShort = false;
    }
    const s1 = slowEmas[0][i] ?? 0;
    const s16 = slowEmas[slowEmas.length - 1][i] ?? 0;
    fastAlignedLong[i] = fLong && s1 > s16;
    fastAlignedShort[i] = fShort && s1 < s16;

    // Slow aligned long: S1>S2>...>S16
    let sLong = true;
    let sShort = true;
    for (let j = 0; j < slowEmas.length - 1; j++) {
      if ((slowEmas[j][i] ?? 0) <= (slowEmas[j + 1][i] ?? 0)) sLong = false;
      if ((slowEmas[j][i] ?? 0) >= (slowEmas[j + 1][i] ?? 0)) sShort = false;
    }
    slowAlignedLong[i] = sLong;
    slowAlignedShort[i] = sShort;
  }

  // Plots
  const toPlot = (arr: number[]) =>
    arr.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : v }));

  const f1 = fastEmas[0]; // EMA 3 (fastest of fast)
  const f11 = fastEmas[fastEmas.length - 1]; // EMA 23 (slowest of fast)
  const s1 = slowEmas[0]; // EMA 25 (fastest of slow)
  const s16 = slowEmas[slowEmas.length - 1]; // EMA 70 (slowest of slow)

  // Fast band coloring
  const fastColor = (i: number): string => {
    if (i < warmup) return 'transparent';
    if (fastAlignedLong[i]) return '#00FFFF'; // Aqua
    if (fastAlignedShort[i]) return '#0000FF'; // Blue
    return '#808080'; // Gray
  };

  // Slow band coloring
  const slowColor = (i: number): string => {
    if (i < warmup) return 'transparent';
    if (slowAlignedLong[i]) return '#00FF00'; // Lime
    if (slowAlignedShort[i]) return '#FF0000'; // Red
    return '#808080'; // Gray
  };

  const plot0 = f1.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : (v ?? NaN), color: fastColor(i) }));
  const plot1 = f11.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : (v ?? NaN), color: fastColor(i) }));
  const plot2 = s1.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : (v ?? NaN), color: slowColor(i) }));
  const plot3 = s16.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : (v ?? NaN), color: slowColor(i) }));
  const plot4 = toPlot(emaFastAvg);
  const plot5 = toPlot(emaSlowAvg);

  // Fill colors
  const fastFillColors = f1.map((_v, i) => {
    if (i < warmup) return 'transparent';
    if (fastAlignedLong[i]) return 'rgba(0,255,255,0.15)';
    if (fastAlignedShort[i]) return 'rgba(0,0,255,0.15)';
    return 'rgba(128,128,128,0.08)';
  });

  const slowFillColors = s1.map((_v, i) => {
    if (i < warmup) return 'transparent';
    if (slowAlignedLong[i]) return 'rgba(0,255,0,0.15)';
    if (slowAlignedShort[i]) return 'rgba(255,0,0,0.15)';
    return 'rgba(128,128,128,0.08)';
  });

  // Alert arrows (plotarrow outputs of the original, `arrows` of the result), with the original's rules (no
  // confluence-only, bar-colour-change or 200 EMA filter: those inputs are off by default and not given here):
  // buy := emafast > emaslow and emaS1 > emaS16 and not colslowS and colfastL ? nz(buy[1]) > 0 ? buy[1] + 1 : 1 : 0
  // sell := emafast < emaslow and emaS1 < emaS16 and not colslowL and colfastS ? ... : 0
  // buybreak := emafast > emaslow and not colslowS ? ... : 0; sellbreak := emafast < emaslow and not colslowL ? ... : 0
  const E = (a: (number | null | undefined)[]) => a.map((v) => v ?? NaN);
  const fastE = fastEmas.map(E);
  const slowE = slowEmas.map(E);
  const ordered = (list: number[][], i: number, cmp: (a: number, b: number) => boolean) =>
    list.every((e, k) => k === 0 || cmp(list[k - 1][i], e[i]));
  const lookback = cfg.lookback;
  const buy: number[] = [], sell: number[] = [], buyBreak: number[] = [], sellBreak: number[] = [];
  // barssince(nz(x[1], 1) == 1): bars since the last bar on which the previous value was 1
  const since = [NaN, NaN, NaN, NaN];
  const sinceStep = (k: number, prev: number) => {
    since[k] = (isNaN(prev) ? 1 : prev) === 1 ? 0 : since[k] + 1;
    return since[k];
  };
  const arrows: ArrowData[] = [];
  const arrowColor = (c: string) => String(color.new(c, 20));
  for (let i = 0; i < n; i++) {
    const emafast = fastE.reduce((sum, e) => sum + e[i], 0) / fastE.length;
    const emaslow = slowE.reduce((sum, e) => sum + e[i], 0) / slowE.length;
    const colfastL = ordered(fastE, i, gt);
    const colfastS = ordered(fastE, i, lt);
    const colslowL = ordered(slowE, i, gt);
    const colslowS = ordered(slowE, i, lt);
    const s1v = slowE[0][i], s16v = slowE[slowE.length - 1][i];
    const prev = (a: number[]) => (i > 0 ? a[i - 1] : NaN);
    const next = (a: number[]) => ((isNaN(prev(a)) ? 0 : prev(a)) > 0 ? prev(a) + 1 : 1);
    const b = gt(emafast, emaslow) && gt(s1v, s16v) && !colslowS && colfastL ? next(buy) : 0;
    const sl = lt(emafast, emaslow) && lt(s1v, s16v) && !colslowL && colfastS ? next(sell) : 0;
    const bb = gt(emafast, emaslow) && !colslowS ? next(buyBreak) : 0;
    const sb = lt(emafast, emaslow) && !colslowL ? next(sellBreak) : 0;
    const sinceBuy = sinceStep(0, prev(buy));
    const sinceSell = sinceStep(1, prev(sell));
    const sinceBuyBreak = sinceStep(2, prev(buyBreak));
    const sinceSellBreak = sinceStep(3, prev(sellBreak));
    buy.push(b);
    sell.push(sl);
    buyBreak.push(bb);
    sellBreak.push(sb);
    const t = bars[i].time;
    // plotarrow(ShowSwing and buy == 1 and barssince(nz(buy[1], 1) == 1) > Lookback ? 1 : na, "BUY Swing Arrow", colorup = lime, transp = 20)
    if (showSwing && b === 1 && sinceBuy > lookback) arrows.push({ time: t, id: 'arrow0', value: 1, color: arrowColor('#00FF00') });
    // plotarrow(ShowSwing and sell == 1 and ... ? -1 : na, "SELL Swing Arrow", colordown = red)
    if (showSwing && sl === 1 && sinceSell > lookback) arrows.push({ time: t, id: 'arrow1', value: -1, color: arrowColor('#FF0000') });
    // plotarrow(ShowBreak and buybreak == 1 and barssince(sellbreak) > Lookback and barssince(buybreak) > Lookback ? 1 : na, colorup = aqua)
    if (showBreak && bb === 1 && sinceSellBreak > lookback && sinceBuyBreak > lookback) {
      arrows.push({ time: t, id: 'arrow2', value: 1, color: arrowColor('#00FFFF') });
    }
    // plotarrow(ShowBreak and sellbreak == 1 and ... ? -1 : na, "SELL Break Arrow", colordown = blue)
    if (showBreak && sb === 1 && sinceBuyBreak > lookback && sinceSellBreak > lookback) {
      arrows.push({ time: t, id: 'arrow3', value: -1, color: arrowColor('#0000FF') });
    }
  }

  // Bar colors: fast alignment color
  const barColors: BarColorData[] = [];
  for (let i = warmup; i < n; i++) {
    if (fastAlignedLong[i]) {
      barColors.push({ time: bars[i].time, color: '#00FFFF' });
    } else if (fastAlignedShort[i]) {
      barColors.push({ time: bars[i].time, color: '#0000FF' });
    } else {
      barColors.push({ time: bars[i].time, color: '#808080' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2, 'plot3': plot3, 'plot4': plot4, 'plot5': plot5 },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { color: '#00FFFF' }, colors: fastFillColors },
      { plot1: 'plot2', plot2: 'plot3', options: { color: '#00FF00' }, colors: slowFillColors },
    ],
    arrows,
    barColors,
  };
}

export const SuperGuppy = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
