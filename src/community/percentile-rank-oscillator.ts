/**
 * Percentile Rank Oscillator (Price + VWMA)
 *
 * Percentile rank (0..100) of the candle midpoint (high + low) / 2 among its last `Lookback` values (fewer at the
 * start of the history; na counts as 0): (count below + 0.5 * count equal) / count * 100, with a linear interpolation
 * between the two neighbours when the value is not in the window. The second line is the percentile rank of the
 * deviation of the midpoint from its VWMA. Both can be smoothed with an RMA and are shown on a -1..+1 or 0..100
 * scale. The background takes the top / bottom colour when a percentile reaches the upper / lower threshold
 * (priority: both lines, then price, then VWMA), with a band fill between the threshold lines.
 * Alerts (alertcondition, `alerts` of the result): price / VWMA / confluence TOP and BOTTOM, true on the bars where
 * the percentile is at or beyond the threshold (and the alert switch of that kind is on).
 *
 * Reference: "Percentile Rank Oscillator (Price + VWMA)" by exploretranspose
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, math, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type PercentileRankOutputScale = '-1..+1' | '0..100';

export interface PercentileRankOscillatorInputs {
  /** Lookback (bars for percentile), clamped to 3..500 */
  lookback: number;
  /** Output scale */
  outputScale: PercentileRankOutputScale;
  /** Enable the VWMA-based percentile */
  enableVwmaPct: boolean;
  /** Use VWMA length = main lookback */
  vwmaLenSame: boolean;
  /** VWMA length when not the main lookback */
  vwmaLenCustom: number;
  /** RMA smoothing length (1 = none) */
  smooth: number;
  /** Upper percentile threshold (%) */
  highThresh: number;
  /** Lower percentile threshold (%) */
  lowThresh: number;
  /** Fill the background when an extreme is hit */
  fillExtremes: boolean;
  /** Price percentile background (and alerts) */
  alertsPrice: boolean;
  /** VWMA percentile background (and alerts) */
  alertsVwma: boolean;
  /** Confluence background (and alerts) */
  alertsConfl: boolean;
  topColor: string;
  botColor: string;
  bandFillColor: string;
}

export const defaultInputs: PercentileRankOscillatorInputs = {
  lookback: 100,
  outputScale: '-1..+1',
  enableVwmaPct: true,
  vwmaLenSame: true,
  vwmaLenCustom: 100,
  smooth: 1,
  highThresh: 95.0,
  lowThresh: 5.0,
  fillExtremes: true,
  alertsPrice: true,
  alertsVwma: true,
  alertsConfl: true,
  // input.color(color.new(#A53860, 80)) / (#4D8B31, 80) / (#423E3B, 95): alpha 0.2 / 0.2 / 0.05
  topColor: 'rgba(165, 56, 96, 0.2)',
  botColor: 'rgba(77, 139, 49, 0.2)',
  bandFillColor: 'rgba(66, 62, 59, 0.05)',
};

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Lookback (bars for percentile)', defval: 100, min: 3, max: 500, group: 'Core' },
  { id: 'outputScale', type: 'string', title: 'Output scale', defval: '-1..+1', options: ['-1..+1', '0..100'], group: 'Core' },
  { id: 'enableVwmaPct', type: 'bool', title: 'Enable VWMA-based percentile', defval: true, group: 'VWMA Percentile' },
  { id: 'vwmaLenSame', type: 'bool', title: 'Use VWMA length = main lookback', defval: true, group: 'VWMA Percentile' },
  { id: 'vwmaLenCustom', type: 'int', title: 'VWMA length (if custom)', defval: 100, min: 1, group: 'VWMA Percentile' },
  { id: 'smooth', type: 'int', title: 'Smoothing (RMA) length (1 = none)', defval: 1, min: 1, group: 'Display' },
  { id: 'highThresh', type: 'float', title: 'Upper percentile threshold (%)', defval: 95.0, min: 50.0, max: 100.0, step: 0.1, group: 'Display' },
  { id: 'lowThresh', type: 'float', title: 'Lower percentile threshold (%)', defval: 5.0, min: 0.0, max: 50.0, step: 0.1, group: 'Display' },
  { id: 'fillExtremes', type: 'bool', title: 'Fill background when extremes hit', defval: true, group: 'Display' },
  { id: 'alertsPrice', type: 'bool', title: 'Enable price percentile alerts', defval: true, group: 'Alerts & Colors' },
  { id: 'alertsVwma', type: 'bool', title: 'Enable VWMA percentile alerts', defval: true, group: 'Alerts & Colors' },
  { id: 'alertsConfl', type: 'bool', title: 'Enable confluence alerts (price + VWMA)', defval: true, group: 'Alerts & Colors' },
  { id: 'topColor', type: 'color', title: 'Top (overbought) BG color', defval: 'rgba(165, 56, 96, 0.2)', group: 'Colors (bg fills)' },
  { id: 'botColor', type: 'color', title: 'Bottom (oversold) BG color', defval: 'rgba(77, 139, 49, 0.2)', group: 'Colors (bg fills)' },
  { id: 'bandFillColor', type: 'color', title: 'Working band fill (between thresholds)', defval: 'rgba(66, 62, 59, 0.05)', group: 'Colors (bg fills)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Price Percentile', color: '#5448C8', lineWidth: 1 },
  { id: 'plot1', title: 'VWMA Percentile', color: '#548687', lineWidth: 1 },
];

/** hline(top_line / bot_line / mid) with the default inputs (-1..+1 scale, thresholds 95 / 5) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_top', price: 0.9, title: 'Top', color: '#A53860', linestyle: 'dashed' },
  { id: 'hline_bot', price: -0.9, title: 'Bot', color: '#4D8B31', linestyle: 'dashed' },
  { id: 'hline_mid', price: 0, title: 'Mid', color: '#423E3B', linestyle: 'dashed' },
];

/** fill(h_top, h_bot, band_fill_color) with the default colour */
export const fillConfig: FillConfig[] = [
  { id: 'fill_band', plot1: 'hline_top', plot2: 'hline_bot', color: 'rgba(66, 62, 59, 0.05)' },
];

export const metadata = {
  title: 'Percentile Rank Oscillator (Price + VWMA)',
  shortTitle: 'PRO',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const nz = (v: number) => (isNaN(v) ? 0 : v);

/**
 * rolling_percentile_interp(src, n) at bar i: percentile rank (0..100) of nz(src) among nz(src[0..avail - 1]),
 * avail = min(n, bar_index + 1)
 */
function rollingPercentile(src: number[], n: number, i: number): number {
  const avail = Math.min(n, i + 1);
  const arr: number[] = [];
  for (let k = 0; k <= avail - 1; k++) arr.push(nz(src[i - k]));
  arr.sort((x, y) => x - y);
  const current = nz(src[i]);
  let less = 0;
  let equal = 0;
  for (const v of arr) {
    less += lt(v, current) ? 1 : 0;
    equal += eq(v, current) ? 1 : 0;
  }
  let pct = 0.0;
  if (equal > 0) {
    pct = ((less + 0.5 * equal) / Math.max(avail, 1)) * 100.0;
  } else if (less === 0) {
    pct = 0.0;
  } else if (less >= avail) {
    pct = 100.0;
  } else {
    const vLow = arr[less - 1];
    const vHigh = arr[less];
    const denom = vHigh - vLow;
    const frac = eq(denom, 0.0) ? 0.5 : Math.max(0.0, Math.min(1.0, (current - vLow) / denom));
    pct = ((less + frac) / Math.max(avail, 1)) * 100.0;
  }
  return pct;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<PercentileRankOscillatorInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const len = Math.max(3, Math.min(cfg.lookback, 500));
  const minusOneToOne = cfg.outputScale === '-1..+1';
  const mapToOut = (x: number) => (minusOneToOne ? x / 50.0 - 1.0 : x);
  const smoothFn = (a: number[]) => (cfg.smooth > 1 ? A(ta.rma(S(a), cfg.smooth)) : a);

  const mid = bars.map((b) => (b.high + b.low) / 2.0);

  // Price percentile
  const pricePct = bars.map((_b, i) => rollingPercentile(mid, len, i));
  const priceOut = smoothFn(pricePct).map(mapToOut);

  // VWMA percentile: percentile of the deviation mid - vwma(mid)
  let vwmaPct: number[] = new Array<number>(n).fill(0.0);
  let vwOut: number[] = new Array<number>(n).fill(0.0);
  if (cfg.enableVwmaPct) {
    const vwlen = cfg.vwmaLenSame ? len : Math.max(1, cfg.vwmaLenCustom);
    const vwmaMid = A(ta.vwma(S(mid), vwlen, S(bars.map((b) => b.volume ?? NaN))));
    const disp = mid.map((m, i) => m - vwmaMid[i]);
    vwmaPct = bars.map((_b, i) => rollingPercentile(disp, len, i));
    vwOut = smoothFn(vwmaPct).map(mapToOut);
  }

  // Background: confluence > price > VWMA
  const bgColors: BgColorData[] = [];
  const flags: boolean[][] = [[], [], [], [], [], []];
  for (let i = 0; i < n; i++) {
    const isPriceTop = ge(pricePct[i], cfg.highThresh);
    const isPriceBot = le(pricePct[i], cfg.lowThresh);
    const isVwTop = cfg.enableVwmaPct ? ge(vwmaPct[i], cfg.highThresh) : false;
    const isVwBot = cfg.enableVwmaPct ? le(vwmaPct[i], cfg.lowThresh) : false;
    const conflTop = cfg.enableVwmaPct && isPriceTop && isVwTop;
    const conflBot = cfg.enableVwmaPct && isPriceBot && isVwBot;
    const bgPrice = (isPriceTop || isPriceBot) && cfg.fillExtremes && cfg.alertsPrice ? (isPriceTop ? cfg.topColor : cfg.botColor) : null;
    const bgVw = (isVwTop || isVwBot) && cfg.fillExtremes && cfg.alertsVwma ? (isVwTop ? cfg.topColor : cfg.botColor) : null;
    const bgConfl = (conflTop || conflBot) && cfg.fillExtremes && cfg.alertsConfl ? (conflTop ? cfg.topColor : cfg.botColor) : null;
    const finalBg = bgConfl ?? bgPrice ?? bgVw;
    flags[0].push(cfg.alertsPrice && isPriceTop);
    flags[1].push(cfg.alertsPrice && isPriceBot);
    flags[2].push(cfg.enableVwmaPct && cfg.alertsVwma && isVwTop);
    flags[3].push(cfg.enableVwmaPct && cfg.alertsVwma && isVwBot);
    flags[4].push(cfg.enableVwmaPct && cfg.alertsConfl && conflTop);
    flags[5].push(cfg.enableVwmaPct && cfg.alertsConfl && conflBot);
    if (finalBg !== null) bgColors.push({ time: bars[i].time, color: finalBg });
  }

  // Working band lines, rounded to 6 decimals
  const topLine = math.round((minusOneToOne ? cfg.highThresh / 50.0 - 1.0 : cfg.highThresh) * 1e6) / 1e6;
  const botLine = math.round((minusOneToOne ? cfg.lowThresh / 50.0 - 1.0 : cfg.lowThresh) * 1e6) / 1e6;
  const midLine = minusOneToOne ? 0.0 : 50.0;

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: priceOut[i], color: '#5448C8' })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.enableVwmaPct ? vwOut[i] : NaN, color: '#548687' })),
    },
    hlines: [
      { value: topLine, options: { title: 'Top', color: '#A53860', linestyle: 'dashed' } },
      { value: botLine, options: { title: 'Bot', color: '#4D8B31', linestyle: 'dashed' } },
      { value: midLine, options: { title: 'Mid', color: '#423E3B', linestyle: 'dashed' } },
    ],
    fills: [
      // fill(h_top, h_bot, band_fill_color)
      { plot1: 'hline_top', plot2: 'hline_bot', options: { color: cfg.bandFillColor },
        colors: new Array<string>(n).fill(cfg.bandFillColor) },
    ],
    bgColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Price Percentile TOP', message: 'Price percentile reached TOP threshold' },
  { id: 'alert1', title: 'Price Percentile BOTTOM', message: 'Price percentile reached BOTTOM threshold' },
  { id: 'alert2', title: 'VWMA Percentile TOP', message: 'VWMA percentile reached TOP threshold' },
  { id: 'alert3', title: 'VWMA Percentile BOTTOM', message: 'VWMA percentile reached BOTTOM threshold' },
  { id: 'alert4', title: 'Confluence TOP', message: 'Price & VWMA percentiles both at TOP extreme' },
  { id: 'alert5', title: 'Confluence BOTTOM', message: 'Price & VWMA percentiles both at BOTTOM extreme' },
];

export const PercentileRankOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
