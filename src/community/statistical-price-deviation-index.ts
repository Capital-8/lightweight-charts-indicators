/**
 * Statistical Price Deviation Index (MAD/VWMA)
 *
 * Robust z-score of the bar midpoint (high + low) / 2: (mid - rolling median) / rolling mean absolute deviation
 * around the median, over the lookback (fewer bars at the start of the history; na history values count as 0),
 * clipped to +-K and mapped to -1..+1 with tanh(alpha * z), optionally RMA-smoothed. A second line does the same
 * with the displacement of the midpoint from its VWMA. Output on -1..+1 or 0..100, levels at mid / top / bottom with
 * a band fill, and a background when both lines are beyond the top or bottom level (confluence, optionally within a
 * window of bars) or, when enabled, when one line is.
 * Alerts (alertcondition, `alerts` of the result): Price / VWMA Top and Bot (one line at or beyond its level, when the
 * single-series alerts are enabled) and Confluence Top / Bottom (both lines, when confluence is enabled).
 *
 * Reference: "Statistical Price Deviation Index (MAD/VWMA)" by exploretranspose
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface StatisticalPriceDeviationIndexInputs {
  /** Lookback (median & MAD) */
  lenIn: number;
  /** Clip after normalization (+-K) */
  clipK: number;
  /** Mapping scale (alpha) */
  alpha: number;
  /** Output scale */
  outMode: '-1..+1' | '0..100';
  showPriceRaw: boolean;
  showVwmaRaw: boolean;
  /** Smoothing (RMA) length (1 = none) */
  smooth: number;
  levelHigh: number;
  levelLow: number;
  fillBand: boolean;
  useVwmaLine: boolean;
  vwmaLenSame: boolean;
  vwmaLenCustom: number;
  confluenceEnable: boolean;
  /** Confluence window bars (0 = same bar) */
  confluenceWindow: number;
  alertsPriceOnly: boolean;
  alertsVwmaOnly: boolean;
  topColor: string;
  botColor: string;
  bandFillColor: string;
}

// Input colour defaults as Pine stores them: color.new(c, 80) -> alpha byte 51, color.new(c, 90) -> 26
export const defaultInputs: StatisticalPriceDeviationIndexInputs = {
  lenIn: 100,
  clipK: 5.0,
  alpha: 0.6,
  outMode: '-1..+1',
  showPriceRaw: false,
  showVwmaRaw: false,
  smooth: 1,
  levelHigh: 0.8,
  levelLow: -0.8,
  fillBand: true,
  useVwmaLine: true,
  vwmaLenSame: true,
  vwmaLenCustom: 100,
  confluenceEnable: true,
  confluenceWindow: 0,
  alertsPriceOnly: false,
  alertsVwmaOnly: false,
  topColor: '#F2364533',
  botColor: '#4CAF5033',
  bandFillColor: '#A0A0A01A',
};

export const inputConfig: InputConfig[] = [
  { id: 'lenIn', type: 'int', title: 'Lookback (median & MAD)', defval: 100, min: 3, max: 500 },
  { id: 'clipK', type: 'float', title: 'Clip after normalization (±K)', defval: 5.0, step: 0.1 },
  { id: 'alpha', type: 'float', title: 'Mapping scale (alpha)', defval: 0.6, min: 0.01, step: 0.01 },
  { id: 'outMode', type: 'string', title: 'Output scale', defval: '-1..+1', options: ['-1..+1', '0..100'] },
  { id: 'showPriceRaw', type: 'bool', title: 'Show raw price z (clipped)', defval: false },
  { id: 'showVwmaRaw', type: 'bool', title: 'Show raw VWMA z (clipped)', defval: false },
  { id: 'smooth', type: 'int', title: 'Smoothing (RMA) length (1 = none)', defval: 1, min: 1 },
  { id: 'levelHigh', type: 'float', title: 'Top level (default 0.8)', defval: 0.8, step: 0.01 },
  { id: 'levelLow', type: 'float', title: 'Bottom level (default -0.8)', defval: -0.8, step: 0.01 },
  { id: 'fillBand', type: 'bool', title: 'Fill main working band (Mid ↔ Top and Mid ↔ Bot)', defval: true },
  { id: 'useVwmaLine', type: 'bool', title: 'Enable VWMA Disp oscillator (second line)', defval: true },
  { id: 'vwmaLenSame', type: 'bool', title: 'Use VWMA length = main lookback', defval: true },
  { id: 'vwmaLenCustom', type: 'int', title: 'VWMA length (if not using main lookback)', defval: 100, min: 1 },
  { id: 'confluenceEnable', type: 'bool', title: 'Enable confluence signals/alerts (both extremes)', defval: true },
  { id: 'confluenceWindow', type: 'int', title: 'Confluence window bars (0 = same bar)', defval: 0, min: 0 },
  { id: 'alertsPriceOnly', type: 'bool', title: 'Enable single-series price BG alerts (Top/Bottom)', defval: false },
  { id: 'alertsVwmaOnly', type: 'bool', title: 'Enable single-series VWMA BG alerts (Top/Bottom)', defval: false },
  { id: 'topColor', type: 'color', title: 'Top (Overbought) BG color - single', defval: '#F2364533' },
  { id: 'botColor', type: 'color', title: 'Bottom (Oversold) BG color - single', defval: '#4CAF5033' },
  { id: 'bandFillColor', type: 'color', title: 'Working band fill color (Mid↔Top↔Bot)', defval: '#A0A0A01A' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Price MAD Osc', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'VWMA Disp Osc', color: color.green, lineWidth: 1 },
  { id: 'plot2', title: 'Price raw z (clipped)', color: String(color.new(color.blue, 80)), lineWidth: 1 },
  { id: 'plot3', title: 'VWMA raw z (clipped)', color: String(color.new(color.green, 80)), lineWidth: 1 },
];

/** hline(mid / top / bottom level) with the default inputs (-1..+1 scale; the Pine default style is dashed) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_mid', price: 0, title: 'MID', color: color.gray, linestyle: 'dashed' },
  { id: 'hline_top', price: 0.8, title: 'Top', color: color.red, linestyle: 'dashed' },
  { id: 'hline_bot', price: -0.8, title: 'Bot', color: color.green, linestyle: 'dashed' },
];

/** fill(h_top, h_bot, fill_band ? band_fill_color : na) with the default colour */
export const fillConfig: FillConfig[] = [
  { id: 'fill_band', plot1: 'hline_top', plot2: 'hline_bot', color: '#A0A0A01A', title: 'Hlines Background' },
];

export const metadata = {
  title: 'Statistical Price Deviation Index (MAD/VWMA)',
  shortTitle: 'SPDI',
  overlay: false,
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/**
 * rolling_median_and_mad(src, n): avail = min(n, bar_index + 1) values nz(src[i]) (na counts as 0), sorted; the
 * median and the mean absolute deviation around it.
 */
function rollingMedianAndMad(src: number[], n: number): [number[], number[]] {
  const med: number[] = new Array(src.length);
  const mad: number[] = new Array(src.length);
  for (let b = 0; b < src.length; b++) {
    const avail = Math.min(n, b + 1);
    const arr: number[] = [];
    for (let i = 0; i <= avail - 1; i++) {
      const v = src[b - i];
      arr.push(Number.isFinite(v) ? v : 0);
    }
    arr.sort((x, y) => x - y);
    let midVal = 0.0;
    if (avail % 2 === 1) {
      midVal = arr[Math.trunc(avail / 2)];
    } else {
      midVal = (arr[Math.trunc(avail / 2) - 1] + arr[Math.trunc(avail / 2)]) / 2.0;
    }
    let sumAbs = 0.0;
    for (let j = 0; j <= avail - 1; j++) sumAbs += Math.abs(arr[j] - midVal);
    med[b] = midVal;
    mad[b] = sumAbs / Math.max(avail, 1);
  }
  return [med, mad];
}

/** tanh_map(x): (e - 1) / (e + 1) with e = exp(2 * clamp(x, -50, 50)) */
const tanhMap = (x: number) => {
  const y = Math.max(Math.min(x, 50.0), -50.0);
  const e = Math.exp(2.0 * y);
  return (e - 1.0) / (e + 1.0);
};

export function calculate(
  bars: Bar[],
  inputs: Partial<StatisticalPriceDeviationIndexInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const tiny = 1e-9;
  const len = Math.max(3, Math.min(cfg.lenIn, 500));
  const { clipK, alpha, smooth } = cfg;
  const oneScale = cfg.outMode === '-1..+1';

  const mid = bars.map((b) => (b.high + b.low) / 2.0);

  /** z-score clipped to +-K, tanh mapping, optional RMA (ta.rma runs on every bar when smooth > 1) */
  const oscillator = (x: number[]) => {
    const [median, mad] = rollingMedianAndMad(x, len);
    const zClipped = x.map((v, i) => Math.max(Math.min((v - median[i]) / Math.max(mad[i], tiny), clipK), -clipK));
    const mapped = zClipped.map((z) => tanhMap(alpha * z));
    const final = smooth > 1 ? A(ta.rma(S(mapped), smooth)) : mapped;
    const out = final.map((v) => (oneScale ? v : (v + 1.0) * 50.0));
    const zDisplay = zClipped.map((z) => (oneScale ? z : (z + clipK) * (100.0 / (2.0 * clipK))));
    return { final, out, zDisplay };
  };

  // PRICE MAD OSCILLATOR
  const price = oscillator(mid);
  // VWMA DISP OSCILLATOR: disp = mid - ta.vwma(mid, vwlen)
  const vwlen = cfg.vwmaLenSame ? len : Math.max(1, cfg.vwmaLenCustom);
  const vwmaMid = A(ta.vwma(S(mid), vwlen, S(bars.map((b) => b.volume ?? NaN))));
  const vwma = oscillator(mid.map((m, i) => m - vwmaMid[i]));

  // LEVELS
  const midNum = oneScale ? 0.0 : 50.0;
  const topNum = oneScale ? cfg.levelHigh : (cfg.levelHigh + 1.0) * 50.0;
  const botNum = oneScale ? cfg.levelLow : (cfg.levelLow + 1.0) * 50.0;

  // Confluence: extremes of the -1..+1 values
  const priceCondTop = price.final.map((v) => ge(v, cfg.levelHigh));
  const priceCondBot = price.final.map((v) => le(v, cfg.levelLow));
  const vwmaCondTop = vwma.final.map((v) => ge(v, cfg.levelHigh));
  const vwmaCondBot = vwma.final.map((v) => le(v, cfg.levelLow));
  // checkWithin(cond, window) = window == 0 ? cond : (na(ta.barssince(cond)) ? false : ta.barssince(cond) <= window)
  // (the second ta.barssince runs from the first true condition on, as the first one: same value)
  const checkWithin = (cond: boolean[]) => {
    if (cfg.confluenceWindow === 0) return cond;
    const since = A(ta.barssince(S(cond.map((c) => (c ? 1 : 0)))));
    return since.map((s) => !isNaN(s) && s <= cfg.confluenceWindow);
  };
  const priceTopOk = checkWithin(priceCondTop);
  const priceBotOk = checkWithin(priceCondBot);
  const vwmaTopOk = checkWithin(vwmaCondTop);
  const vwmaBotOk = checkWithin(vwmaCondBot);

  // final_bg: confluence > price > vwma
  const bgColors: BgColorData[] = [];
  const flags: boolean[][] = [[], [], [], [], [], []];
  for (let i = 0; i < n; i++) {
    const conflTop = cfg.confluenceEnable && priceTopOk[i] && vwmaTopOk[i];
    const conflBot = cfg.confluenceEnable && priceBotOk[i] && vwmaBotOk[i];
    const isVwmaTop = cfg.useVwmaLine && vwmaCondTop[i];
    const isVwmaBot = cfg.useVwmaLine && vwmaCondBot[i];
    // alertcondition(alerts_price_only and price_final >= level_high, ...) and the other five, in declaration order
    flags[0].push(cfg.alertsPriceOnly && priceCondTop[i]);
    flags[1].push(cfg.alertsPriceOnly && priceCondBot[i]);
    flags[2].push(cfg.alertsVwmaOnly && isVwmaTop);
    flags[3].push(cfg.alertsVwmaOnly && isVwmaBot);
    flags[4].push(cfg.confluenceEnable && conflTop);
    flags[5].push(cfg.confluenceEnable && conflBot);
    let bg: string | null = null;
    if (conflTop && cfg.confluenceEnable) bg = cfg.topColor;
    else if (conflBot && cfg.confluenceEnable) bg = cfg.botColor;
    else if (priceCondTop[i] && cfg.alertsPriceOnly) bg = cfg.topColor;
    else if (priceCondBot[i] && cfg.alertsPriceOnly) bg = cfg.botColor;
    else if (isVwmaTop && cfg.alertsVwmaOnly) bg = cfg.topColor;
    else if (isVwmaBot && cfg.alertsVwmaOnly) bg = cfg.botColor;
    if (bg) bgColors.push({ time: bars[i].time, color: bg });
  }

  const P = (vals: number[], show: boolean, c: string) =>
    bars.map((b, i) => ({ time: b.time, value: show ? vals[i] : NaN, color: c }));
  const bandColor = cfg.fillBand ? cfg.bandFillColor : 'transparent';

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(price_out, "Price MAD Osc", color.blue)
      plot0: P(price.out, true, color.blue),
      // plot(use_vwma_line ? vwma_out : na, "VWMA Disp Osc", color.green)
      plot1: P(vwma.out, cfg.useVwmaLine, color.green),
      // plot(show_price_raw ? price_z_display : na, "Price raw z (clipped)", color.new(color.blue, 80))
      plot2: P(price.zDisplay, cfg.showPriceRaw, String(color.new(color.blue, 80))),
      // plot(show_vwma_raw ? vwma_z_display : na, "VWMA raw z (clipped)", color.new(color.green, 80))
      plot3: P(vwma.zDisplay, cfg.showVwmaRaw, String(color.new(color.green, 80))),
    },
    hlines: [
      { value: midNum, options: { title: 'MID', color: color.gray, linestyle: 'dashed' } },
      { value: topNum, options: { title: 'Top', color: color.red, linestyle: 'dashed' } },
      { value: botNum, options: { title: 'Bot', color: color.green, linestyle: 'dashed' } },
    ],
    fills: [
      // fill(h_top, h_bot, fill_band ? band_fill_color : na)
      { plot1: 'hline_top', plot2: 'hline_bot', options: { title: 'Hlines Background' },
        colors: new Array<string>(n).fill(bandColor) },
    ],
    bgColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Price Top Alert', message: 'SPDI — Price MAD OSC entered TOP extreme' },
  { id: 'alert1', title: 'Price Bot Alert', message: 'SPDI — Price MAD OSC entered BOTTOM extreme' },
  { id: 'alert2', title: 'VWMA Top Alert', message: 'SPDI — VWMA DISP OSC entered TOP extreme' },
  { id: 'alert3', title: 'VWMA Bot Alert', message: 'SPDI — VWMA DISP OSC entered BOTTOM extreme' },
  { id: 'alert4', title: 'Confluence Top Alert', message: 'SPDI — BOTH Price MAD and VWMA DISP in TOP extreme (confluence).' },
  { id: 'alert5', title: 'Confluence Bottom Alert', message: 'SPDI — BOTH Price MAD and VWMA DISP in BOTTOM extreme (confluence).' },
];

export const StatisticalPriceDeviationIndex = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
