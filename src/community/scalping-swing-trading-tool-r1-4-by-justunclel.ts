/**
 * Scalping Swing Trading Tool R1-6 by JustUncleL
 *
 * A set of EMA tools for pullback scalping:
 * - the Price Action Channel (PAC): EMAs of the high, the low and the close (shown when the EMA 5-12 channel is off,
 *   or the EMA 12-36 ribbon when the PAC length is above 30), and bar colours from the close position against the
 *   channel (blue at or above the top, red at or below the bottom, gray inside);
 * - the EMA 5-12 channel (EMA 5 and EMA 11 with a fill);
 * - three long EMAs: 89 / 200 / 633, or 75 / 180 / 540 on a 1-minute chart;
 * - the EMA 12-36 ribbon (EMAs 12 to 36 by steps of 3), coloured by the slope of each EMA and the side of EMA 12
 *   against EMA 36;
 * - five-bar fractals drawn three bars back (regular shape when the pivots are shown, else the wider shape), the
 *   last fractal levels, HH / LH / HL / LL labels, and pivot labels with the count of the bars of the pattern;
 * - swing alerts: the first bar that closes outside the channel in its own direction (optionally only on the side
 *   of the medium EMA), drawn one bar later as BUY / SELL arrows or as big arrows.
 *
 * The chart timeframe (1 minute or not) is read from the chart context; without it, from the spacing of the bars.
 *
 * Reference: "Scalping Swing Trading Tool R1-6 by JustUncleL" by JustUncleL
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface ScalpingSwingTradingToolInputs {
  showPac: boolean;
  /** Colour the bars from the close position against the PAC */
  scolor: boolean;
  hiLoLen: number;
  showPacExit: boolean;
  useBigArrows: boolean;
  filterEma200: boolean;
  showEma12Channel: boolean;
  showEma36Ribbon: boolean;
  showPivots: boolean;
  showPivotLabels: boolean;
  showHHLL: boolean;
  showFractals: boolean;
  showFractalLevels: boolean;
  filterBw: boolean;
}

export const defaultInputs: ScalpingSwingTradingToolInputs = {
  showPac: true,
  scolor: true,
  hiLoLen: 10,
  showPacExit: false,
  useBigArrows: false,
  filterEma200: true,
  showEma12Channel: true,
  showEma36Ribbon: true,
  showPivots: true,
  showPivotLabels: true,
  showHHLL: false,
  showFractals: true,
  showFractalLevels: false,
  filterBw: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'showPac', type: 'bool', title: 'Show Price Action Channel (PAC)', defval: true },
  { id: 'scolor', type: 'bool', title: 'Show coloured Bars close relative on PAC', defval: true },
  { id: 'hiLoLen', type: 'int', title: 'High Low PAC Length', defval: 10, min: 2 },
  { id: 'showPacExit', type: 'bool', title: 'Show PAC Swing Alerts', defval: false },
  { id: 'useBigArrows', type: 'bool', title: 'Use Big Arrows for Swing Alerts', defval: false },
  { id: 'filterEma200', type: 'bool', title: 'Filter PAC Alerts with 200ema', defval: true },
  { id: 'showEma12Channel', type: 'bool', title: 'ShowEMA12_Channel', defval: true },
  { id: 'showEma36Ribbon', type: 'bool', title: 'ShowEMA36_Ribbon', defval: true },
  { id: 'showPivots', type: 'bool', title: 'ShowPivots', defval: true },
  { id: 'showPivotLabels', type: 'bool', title: 'ShowPivotLabels', defval: true },
  { id: 'showHHLL', type: 'bool', title: 'ShowHHLL_', defval: false },
  { id: 'showFractals', type: 'bool', title: 'ShowFractals_', defval: true },
  { id: 'showFractalLevels', type: 'bool', title: 'ShowFractalLevels', defval: false },
  { id: 'filterBw', type: 'bool', title: 'Filter for Pristine (Ideal) Fractals', defval: false },
];

// Colour constants of Pine version 3
const GRAY = '#808080';
const LIME = '#00FF00';
const BLUE = '#0000FF';
const RED = '#FF0000';
const GREEN = '#008000';
const BLACK = '#000000';
const MAROON = '#800000';
const AQUA = '#00FFFF';
const FUCHSIA = '#FF00FF';
const DODGER_BLUE = '#1E90FF';
const T = (hex: string, transp: number) => String(color.new(hex, transp));

const RIBBON = [12, 15, 18, 21, 24, 27, 30, 33, 36];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'High PAC EMA', color: T(GRAY, 50), lineWidth: 1 },
  { id: 'plot1', title: 'Low PAC EMA', color: T(GRAY, 50), lineWidth: 1 },
  { id: 'plot2', title: 'Close PAC EMA', color: LIME, lineWidth: 1 },
  { id: 'plot3', title: 'EMA05', color: T(BLUE, 92), lineWidth: 1 },
  { id: 'plot4', title: 'EMA11', color: T(BLUE, 92), lineWidth: 1 },
  { id: 'plot5', title: 'EMA fast', color: T(GREEN, 20), lineWidth: 3 },
  { id: 'plot6', title: 'EMA medium', color: T(BLUE, 20), lineWidth: 3 },
  { id: 'plot7', title: 'EMA slow', color: T(BLACK, 20), lineWidth: 3 },
  ...RIBBON.map((len, k) => ({
    id: `plot${8 + k}`, title: `MA${len}`, color: T(DODGER_BLUE, 20), lineWidth: len === 12 || len === 36 ? 2 : 1,
  })),
  { id: 'plot17', title: 'Top Fractal Level', color: GREEN, lineWidth: 2 },
  { id: 'plot18', title: 'Bottom Fractal Level', color: RED, lineWidth: 2 },
];

export const metadata = {
  title: 'Scalping Swing Trading Tool R1-6 by JustUncleL',
  shortTitle: 'SCALPSWING R1-6',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => gt(a, b) || eq(a, b);
const le = (a: number, b: number) => lt(a, b) || eq(a, b);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<ScalpingSwingTradingToolInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'barColors'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // ShowPAC = HiLoLen > 30 ? (ShowEMA36_Ribbon ? false : ShowPAC_) : (ShowEMA12_Channel ? false : ShowPAC_)
  const showPac = cfg.hiLoLen > 30 ? (cfg.showEma36Ribbon ? false : cfg.showPac) : (cfg.showEma12Channel ? false : cfg.showPac);
  // Pivots switch the fractal markers and the HH / LL squares off, and need the regular fractal shape
  const showHHLL = cfg.showPivots ? false : cfg.showHHLL;
  const showFractals = cfg.showPivots ? false : cfg.showFractals;
  const filterBw = cfg.showPivots ? true : cfg.filterBw;

  const closeS = new Series(bars, (b) => b.close);
  const ema = (len: number) => A(ta.ema(closeS, len));
  const pacC = ema(cfg.hiLoLen);
  const pacL = A(ta.ema(new Series(bars, (b) => b.low), cfg.hiLoLen));
  const pacU = A(ta.ema(new Series(bars, (b) => b.high), cfg.hiLoLen));
  const ema05 = ema(5);
  const ema11 = ema(11);
  const ribbon = RIBBON.map((len) => ema(len));
  const ema12 = ribbon[0];
  const ema36 = ribbon[RIBBON.length - 1];

  // On a 1-minute chart the long EMAs are 75 / 180 / 540
  const tf = chart?.timeframe ?? chartTimeframe(bars);
  const info = tf === '' ? null : timeframe.info(tf);
  const oneMinute = info !== null && info.isintraday && info.multiplier === 1;
  const emaFast = ema(oneMinute ? 75 : 89);
  const emaMedium = ema(oneMinute ? 180 : 200);
  const emaSlow = ema(oneMinute ? 540 : 633);

  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const interval = barInterval(bars);
  const time = (i: number) => barTime(bars, i, interval);

  // MA colour of the ribbon
  const maColor = (base: number, ma: number[], ref: number, i: number): string => {
    const ch = i > 0 ? ma[i] - ma[i - 1] : NaN;
    return ge(ch, 0) && gt(base, ref) ? DODGER_BLUE
      : lt(ch, 0) && gt(base, ref) ? MAROON
        : le(ch, 0) && lt(base, ref) ? RED
          : ge(ch, 0) && lt(base, ref) ? BLUE
            : GRAY;
  };

  const plots: Record<string, Point[]> = {};
  for (let k = 0; k < 19; k++) plots[`plot${k}`] = [];
  const barColors: BarColorData[] = [];
  const markers: MarkerData[] = [];
  const add = (on: boolean, index: number, m: Omit<MarkerData, 'time'>) => {
    if (on && index >= 0) markers.push({ time: time(index), ...m });
  };

  // valuewhen histories of the fractals (latest value last)
  const tops: number[] = [];
  const bots: number[] = [];
  const back = (list: number[], k: number) => (list.length > k ? list[list.length - 1 - k] : NaN);
  let topFractals = NaN;
  let botFractals = NaN;
  let upAlert = NaN; // up_alert[1] is na on the first bar
  let dnAlert = NaN;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    plots.plot0.push({ time: t, value: showPac ? pacL[i] : NaN });
    plots.plot1.push({ time: t, value: showPac ? pacU[i] : NaN });
    plots.plot2.push({ time: t, value: showPac ? pacC[i] : NaN });
    if (cfg.scolor) barColors.push({ time: t, color: ge(b.close, pacU[i]) ? BLUE : le(b.close, pacL[i]) ? RED : GRAY });
    plots.plot3.push({ time: t, value: cfg.showEma12Channel ? ema05[i] : NaN });
    plots.plot4.push({ time: t, value: cfg.showEma12Channel ? ema11[i] : NaN });
    plots.plot5.push({ time: t, value: emaFast[i] });
    plots.plot6.push({ time: t, value: emaMedium[i] });
    plots.plot7.push({ time: t, value: emaSlow[i] });
    RIBBON.forEach((len, k) => {
      const last = len === 36;
      plots[`plot${8 + k}`].push({
        time: t,
        value: last || cfg.showEma36Ribbon ? ribbon[k][i] : NaN,
        color: T(last && !cfg.showEma36Ribbon ? RED : maColor(ema12[i], ribbon[k], ema36[i], i), 20),
      });
    });

    // Fractals on the five bars before the current bar (centre three bars back)
    const h1 = H(i - 1), h2 = H(i - 2), h3 = H(i - 3), h4 = H(i - 4), h5 = H(i - 5);
    const l1 = L(i - 1), l2 = L(i - 2), l3 = L(i - 3), l4 = L(i - 4), l5 = L(i - 5);
    const top = filterBw
      ? lt(h5, h4) && lt(h4, h3) && gt(h3, h2) && gt(h2, h1)
      : lt(h5, h3) && lt(h4, h3) && gt(h3, h2) && gt(h3, h1);
    const bot = filterBw
      ? gt(l5, l4) && gt(l4, l3) && lt(l3, l2) && lt(l2, l1)
      : gt(l5, l3) && gt(l4, l3) && lt(l3, l2) && lt(l3, l1);
    add(showFractals && top, i - 3, { position: 'aboveBar', shape: 'triangleDown', color: RED });
    add(showFractals && bot, i - 3, { position: 'belowBar', shape: 'triangleUp', color: LIME });

    // Last fractal levels: no colour on the bar where the level changes
    const prevTop = topFractals;
    const prevBot = botFractals;
    if (top) topFractals = h3;
    if (bot) botFractals = l3;
    const changed = (now: number, before: number) => !isNaN(now) && !isNaN(before) && !eq(now, before);
    plots.plot17.push({
      time: t, value: cfg.showFractalLevels ? topFractals : NaN, color: changed(topFractals, prevTop) ? 'transparent' : GREEN,
    });
    plots.plot18.push({
      time: t, value: cfg.showFractalLevels ? botFractals : NaN, color: changed(botFractals, prevBot) ? 'transparent' : RED,
    });

    // Higher highs, lower highs, higher lows, lower lows
    if (top) tops.push(h3);
    if (bot) bots.push(l3);
    const t0 = back(tops, 0), t1 = back(tops, 1), t2 = back(tops, 2);
    const b0 = back(bots, 0), b1 = back(bots, 1), b2 = back(bots, 2);
    const higherHigh = top && lt(t1, t0) && (cfg.showPivots || lt(t2, t0));
    const lowerHigh = top && gt(t1, t0) && (cfg.showPivots || gt(t2, t0));
    const higherLow = bot && lt(b1, b0) && (cfg.showPivots || lt(b2, b0));
    const lowerLow = bot && gt(b1, b0) && (cfg.showPivots || gt(b2, b0));

    add(showHHLL && higherHigh, i - 3, { position: 'aboveBar', shape: 'square', color: MAROON, text: '[HH]' });
    add(showHHLL && lowerHigh, i - 3, { position: 'aboveBar', shape: 'square', color: MAROON, text: '[LH]' });
    add(showHHLL && higherLow, i - 3, { position: 'belowBar', shape: 'square', color: GREEN, text: '[HL]' });
    add(showHHLL && lowerLow, i - 3, { position: 'belowBar', shape: 'square', color: GREEN, text: '[LL]' });

    // Pivot points: a cross with a label, or the cross alone
    const pivot = (on: boolean, above: boolean, text: string) => {
      const base = { position: above ? 'aboveBar' as const : 'belowBar' as const, shape: 'cross' as const, color: above ? MAROON : GREEN };
      add(cfg.showPivots && on, i - 3, cfg.showPivotLabels ? { ...base, text } : base);
    };
    pivot(higherHigh, true, '[HH]\n[PVT]');
    pivot(lowerHigh, true, '[LH]\n[PVT]');
    pivot(higherLow, false, '[PVT]\n[HL]');
    pivot(lowerLow, false, '[PVT]\n[LL]');

    // Numbers on the bars of a pivot pattern (plotchar: the character only)
    const digit = (on: boolean, offset: number, above: boolean, char: string) => add(cfg.showPivots && on, i + offset, {
      position: above ? 'aboveBar' : 'belowBar', shape: 'circle', color: 'transparent', text: char, textColor: above ? MAROON : GREEN,
    });
    digit(top, -5, true, '1');
    digit(top, -4, true, '2');
    digit(top, -2, true, '2');
    digit(top, -1, true, '1');
    digit(bot, -5, false, '1');
    digit(bot, -4, false, '2');
    digit(bot, -2, false, '2');
    digit(bot, -1, false, '1');

    // Swing alerts: the first bar that leaves the PAC, drawn on the next bar
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    const isUp = gt(b.close, b.open) && gt(b.close, pacU[i]) && lt(prevClose, i > 0 ? pacU[i - 1] : NaN)
      && (!cfg.filterEma200 || gt(pacC[i], emaMedium[i]));
    const isDown = lt(b.close, b.open) && lt(b.close, pacL[i]) && gt(prevClose, i > 0 ? pacL[i - 1] : NaN)
      && (!cfg.filterEma200 || lt(pacC[i], emaMedium[i]));
    const prevUp = upAlert;
    const prevDn = dnAlert;
    upAlert = isUp ? (isNaN(prevUp) ? 1 : prevUp + 1) : 0;
    dnAlert = isDown ? (isNaN(prevDn) ? 1 : prevDn + 1) : 0;
    if (cfg.showPacExit && cfg.useBigArrows) {
      // plotarrow: the arrow height is not ported
      if (prevUp === 1) markers.push({ time: t, position: 'belowBar', shape: 'arrowUp', color: T(AQUA, 20) });
      else if (prevDn === 1) markers.push({ time: t, position: 'aboveBar', shape: 'arrowDown', color: T(FUCHSIA, 20) });
    }
    if (cfg.showPacExit && !cfg.useBigArrows) {
      if (prevUp === 1) markers.push({ time: t, position: 'belowBar', shape: 'arrowUp', color: GREEN, text: 'BUY', textColor: GREEN });
      if (prevDn === 1) markers.push({ time: t, position: 'aboveBar', shape: 'arrowDown', color: RED, text: 'SELL', textColor: RED });
    }
  }
  markers.sort((p, q) => p.time - q.time);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Fill HiLo PAC', color: T(GRAY, 92) } },
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Fill EMA5-12', color: T(BLUE, 92) } },
    ],
    markers,
    barColors,
  };
}

export const ScalpingSwingTradingTool = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
