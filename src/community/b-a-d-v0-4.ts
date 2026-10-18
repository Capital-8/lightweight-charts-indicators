/**
 * B + A + D v1
 *
 * Four tools in one pane:
 * - B-Xtrender: short term = RSI(EMA(close, L1) - EMA(close, L2), L3) - 50 as columns, with a T3 (b = 0.7, length 5)
 *   line; long term = RSI(EMA(close, L1), L2) - 50 as a histogram and lines.
 * - ADX & DI: Wilder-smoothed true range and directional movements (running sums), DI+ / DI-, ADX = SMA(DX), and a
 *   threshold line.
 * - Trend Step: a trend direction from close against SMA +- ATR on the first 300 bars, then from the bar range
 *   against a step band +- ATR * width; drawn as a white (up) / black (down) line at 0.
 * - EMA Core: a line at -10 coloured by the hue of the normalized EMA acceleration (tanh of the EMA of the EMA change
 *   over 1 % of ATR 14).
 * Signals: a DI cross sets a pending bull / bear signal; it fires (a circle on the T3 line) when the long-term
 * Xtrender is on the same side of 0 and the previous signal was of the other type. Pending signals colour the
 * background.
 * Alert (alertcondition, `alerts` of the result): 'Signal Confirmed', true on the bars of a bull or a bear signal.
 *
 * Reference: "B + A + D v1" by wepritz84
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface BadV04Inputs {
  shortL1: number;
  shortL2: number;
  shortL3: number;
  longL1: number;
  longL2: number;
  /** ADX length */
  adxLength: number;
  /** ADX threshold (horizontal line) */
  adxThreshold: number;
  /** Trend Step: SMA length */
  maLength: number;
  /** Trend Step: ATR period */
  volatility: number;
  /** Trend Step: channel width (ATR multiplier) */
  trendWidth: number;
  emaLength: number;
  emaSource: SourceType;
  /** EMA length of the EMA change (acceleration) */
  colorSmooth: number;
  showEmaLine: boolean;
}

export const defaultInputs: BadV04Inputs = {
  shortL1: 5,
  shortL2: 20,
  shortL3: 15,
  longL1: 20,
  longL2: 15,
  adxLength: 14,
  adxThreshold: 20,
  maLength: 25,
  volatility: 200,
  trendWidth: 2,
  emaLength: 50,
  emaSource: 'close',
  colorSmooth: 3,
  showEmaLine: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'shortL1', type: 'int', title: 'Short - L1', defval: 5 },
  { id: 'shortL2', type: 'int', title: 'Short - L2', defval: 20 },
  { id: 'shortL3', type: 'int', title: 'Short - L3', defval: 15 },
  { id: 'longL1', type: 'int', title: 'Long - L1', defval: 20 },
  { id: 'longL2', type: 'int', title: 'Long - L2', defval: 15 },
  { id: 'adxLength', type: 'int', title: 'ADX Length', defval: 14 },
  { id: 'adxThreshold', type: 'float', title: 'ADX Threshold', defval: 20 },
  { id: 'maLength', type: 'int', title: 'MA Length', defval: 25 },
  { id: 'volatility', type: 'int', title: 'Volatility (ATR Period)', defval: 200 },
  { id: 'trendWidth', type: 'float', title: 'Channel Width', defval: 2, step: 0.1 },
  { id: 'emaLength', type: 'int', title: 'EMA Length', defval: 50, min: 1 },
  { id: 'emaSource', type: 'source', title: 'EMA Source', defval: 'close' },
  { id: 'colorSmooth', type: 'int', title: 'Color Smoothing', defval: 3, min: 1 },
  { id: 'showEmaLine', type: 'bool', title: 'Show EMA Line', defval: true },
];

// Colours of the script (most have transparency 100)
const UP_T = String(color.rgb(0, 230, 119, 100));
const DN_T = String(color.rgb(255, 82, 82, 100));
const LONG_UP_RISE = String(color.rgb(255, 255, 255, 73));
const LONG_DN_RISE = String(color.rgb(151, 151, 151, 73));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'B-Xtrender Osc.', color: '#228b2200', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'B-X Shadow', color: '#00000000', lineWidth: 5 },
  { id: 'plot2', title: 'B-X Color', color: UP_T, lineWidth: 3 },
  { id: 'plot3', title: 'DI+', color: color.green, lineWidth: 1 },
  { id: 'plot4', title: 'DI-', color: color.red, lineWidth: 1 },
  { id: 'plot5', title: 'ADX', color: color.navy, lineWidth: 1 },
  { id: 'plot6', title: 'Trend Line', color: color.white, lineWidth: 3 },
  { id: 'plot7', title: 'EMA Core', color: 'rgb(255, 255, 0)', lineWidth: 3 },
  { id: 'plot8', title: 'B-X Trend Hist', color: LONG_UP_RISE, lineWidth: 2, style: 'histogram' },
  { id: 'plot9', title: 'B-X Trend Line', color: '#00000000', lineWidth: 5 },
  { id: 'plot10', title: 'B-X Trend Color', color: UP_T, lineWidth: 3 },
];

export const metadata = {
  title: 'B + A + D v1',
  shortTitle: 'B + A + D v1',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Pine nz: na and +-infinity give the replacement */
const nz = (v: number, r = 0) => (Number.isFinite(v) ? v : r);

export function calculate(
  bars: Bar[],
  inputs: Partial<BadV04Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const prev = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);

  // 1. B-Xtrender
  const emaS1 = A(ta.ema(S(close), cfg.shortL1));
  const emaS2 = A(ta.ema(S(close), cfg.shortL2));
  const shortX = A(ta.rsi(S(emaS1.map((v, i) => v - emaS2[i])), cfg.shortL3)).map((v) => v - 50);
  const longX = A(ta.rsi(ta.ema(S(close), cfg.longL1), cfg.longL2)).map((v) => v - 50);

  // t3(src, 5): six chained EMAs, b = 0.7
  const t3 = (src: number[], len: number) => {
    const xe1 = A(ta.ema(S(src), len));
    const xe2 = A(ta.ema(S(xe1), len));
    const xe3 = A(ta.ema(S(xe2), len));
    const xe4 = A(ta.ema(S(xe3), len));
    const xe5 = A(ta.ema(S(xe4), len));
    const xe6 = A(ta.ema(S(xe5), len));
    const b = 0.7;
    const c1 = -b * b * b;
    const c2 = 3 * b * b + 3 * b * b * b;
    const c3 = -6 * b * b - 3 * b - 3 * b * b * b;
    const c4 = 1 + 3 * b + b * b * b + 3 * b * b;
    return xe6.map((_v, i) => c1 * xe6[i] + c2 * xe5[i] + c3 * xe4[i] + c4 * xe3[i]);
  };
  const maShortX = t3(shortX, 5);

  // 2. ADX + DI (nz(x[1]) is 0 on bar 0)
  const len = cfg.adxLength;
  const diPlus: number[] = new Array(n);
  const diMinus: number[] = new Array(n);
  const dx: number[] = new Array(n);
  let str = 0.0;
  let sdmp = 0.0;
  let sdmm = 0.0;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const pc = nz(prev(close, i));
    const ph = i > 0 ? bars[i - 1].high : 0;
    const pl = i > 0 ? bars[i - 1].low : 0;
    const tr = Math.max(Math.max(b.high - b.low, Math.abs(b.high - pc)), Math.abs(b.low - pc));
    const dmp = gt(b.high - ph, pl - b.low) ? Math.max(b.high - ph, 0) : 0;
    const dmm = gt(pl - b.low, b.high - ph) ? Math.max(pl - b.low, 0) : 0;
    str = nz(str) - nz(str) / len + tr;
    sdmp = nz(sdmp) - nz(sdmp) / len + dmp;
    sdmm = nz(sdmm) - nz(sdmm) / len + dmm;
    diPlus[i] = (sdmp / str) * 100;
    diMinus[i] = (sdmm / str) * 100;
    dx[i] = (Math.abs(diPlus[i] - diMinus[i]) / (diPlus[i] + diMinus[i])) * 100;
  }
  const adx = A(ta.sma(S(dx), len));

  // 3. Trend Step
  const atr = A(ta.atr(bars, cfg.volatility));
  const maClose = A(ta.sma(S(close), cfg.maLength));
  const trendDir: boolean[] = new Array(n);
  let direction = false; // var trendDirection = bool(na): false in Pine v6
  let trendBand = NaN; // var trendBand = float(na)
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const maUp = maClose[i] + atr[i];
    const maDn = maClose[i] - atr[i];
    const upperBand = trendBand + atr[i] * cfg.trendWidth;
    const lowerBand = trendBand - atr[i] * cfg.trendWidth;
    // bar_index < 300: bar_index counts from the first bar given
    if (i < 300) {
      if (ge(b.close, maUp)) direction = true;
      if (le(b.close, maDn)) direction = false;
    } else {
      if (ge(b.low, upperBand)) direction = true;
      if (le(b.high, lowerBand)) direction = false;
    }
    const hl2 = (b.high + b.low) / 2;
    trendBand = direction ? Math.max(nz(trendBand), hl2) : Math.min(nz(trendBand), hl2);
    trendDir[i] = direction;
  }

  // 4. EMA Core
  const ema = A(ta.ema(getSourceSeries(bars, cfg.emaSource), cfg.emaLength));
  const emaChange = ema.map((v, i) => v - prev(ema, i));
  const emaAccel = A(ta.ema(S(emaChange), cfg.colorSmooth));
  const atr14 = A(ta.atr(bars, 14));
  const hueRaw = emaAccel.map((a, i) => {
    // tanh(x) = (exp(2x) - 1) / (exp(2x) + 1)
    const ex = Math.exp(2 * (a / (atr14[i] * 0.01)));
    return 60 + ((ex - 1) / (ex + 1)) * 60;
  });
  const emaColor = hueRaw.map((h, i) => {
    const hp = prev(hueRaw, i);
    return hsvToRgb(isNaN(hp) ? h : (h + hp) / 2, 1.0, 1.0);
  });

  // 6. DI crossover with delayed histogram confirmation
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const pendingBullCol = String(color.new(color.green, 95));
  const pendingBearCol = String(color.new(color.red, 95));
  let pendingBull = false;
  let pendingBear = false;
  let lastSignalType = 0;
  const stateFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // ta.crossover / ta.crossunder compare exactly
    const crossUp = i > 0 && diPlus[i] > diMinus[i] && diPlus[i - 1] <= diMinus[i - 1];
    const crossDown = i > 0 && diPlus[i] < diMinus[i] && diPlus[i - 1] >= diMinus[i - 1];
    if (crossUp) {
      pendingBull = true;
      pendingBear = false;
    }
    if (crossDown) {
      pendingBear = true;
      pendingBull = false;
    }
    const bullRev = pendingBull && gt(longX[i], 0) && lastSignalType !== 1;
    const bearRev = pendingBear && lt(longX[i], 0) && lastSignalType !== -1;
    if (bullRev) {
      lastSignalType = 1;
      pendingBull = false;
    }
    if (bearRev) {
      lastSignalType = -1;
      pendingBear = false;
    }
    const price = maShortX[i];
    if (bullRev && !isNaN(price)) {
      markers.push({ id: 'shape0', time: t, position: 'atPriceMiddle', price, shape: 'circle', color: String(color.rgb(255, 255, 255)), size: 'tiny' });
    }
    if (bearRev && !isNaN(price)) {
      markers.push({ id: 'shape1', time: t, position: 'atPriceMiddle', price, shape: 'circle', color: String(color.rgb(5, 0, 0)), size: 'tiny' });
    }
    if (pendingBull && !bullRev) bgColors.push({ id: 'bgcolor0', time: t, color: pendingBullCol });
    if (pendingBear && !bearRev) bgColors.push({ id: 'bgcolor1', time: t, color: pendingBearCol });
    // stateChange = bullReversalCondition or bearReversalCondition
    stateFlags.push(bullRev || bearRev);
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const P = (value: (i: number) => number, col: (i: number) => string) =>
    bars.map((b, i) => ({ time: b.time, value: fin(value(i)), color: col(i) }));
  const rising = (a: number[], i: number) => gt(a[i], prev(a, i));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P((i) => shortX[i], (i) => (gt(shortX[i], 0)
        ? (rising(shortX, i) ? UP_T : '#228b2200')
        : (rising(shortX, i) ? DN_T : '#8b000000'))),
      plot1: P((i) => maShortX[i], () => '#00000000'),
      plot2: P((i) => maShortX[i], (i) => (rising(maShortX, i) ? UP_T : DN_T)),
      plot3: P((i) => diPlus[i], () => color.green),
      plot4: P((i) => diMinus[i], () => color.red),
      plot5: P((i) => adx[i], () => color.navy),
      plot6: P(() => 0, (i) => (trendDir[i] ? color.white : color.black)),
      plot7: P(() => (cfg.showEmaLine ? -10 : NaN), (i) => emaColor[i]),
      plot8: P((i) => longX[i], (i) => (gt(longX[i], 0)
        ? (rising(longX, i) ? LONG_UP_RISE : '#77777749')
        : (rising(longX, i) ? LONG_DN_RISE : '#0000003f'))),
      plot9: P((i) => longX[i], () => '#00000000'),
      plot10: P((i) => longX[i], (i) => (rising(longX, i) ? UP_T : DN_T)),
    },
    // hline(th, color = color.gray): Pine default style dashed, width 1
    hlines: [{ value: cfg.adxThreshold, options: { title: 'ADX Threshold', color: color.gray, linestyle: 'dashed', linewidth: 1 } }],
    markers,
    bgColors,
    // alertcondition(stateChange, "Signal Confirmed")
    alerts: alertStates(alertConditions, bars, [stateFlags]),
  };
}

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Signal Confirmed', message: 'HISTOGRAM CONFIRMED: {{ticker}} - {{interval}}' },
];

/**
 * hsv_to_rgb(h, s, v) of the script: comparisons with na are false (the last branch), color.rgb takes int() of the
 * channels (na channel = 0).
 */
function hsvToRgb(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r: number;
  let g: number;
  let b: number;
  if (lt(h, 60)) [r, g, b] = [c, x, 0];
  else if (lt(h, 120)) [r, g, b] = [x, c, 0];
  else if (lt(h, 180)) [r, g, b] = [0, c, x];
  else if (lt(h, 240)) [r, g, b] = [0, x, c];
  else if (lt(h, 300)) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return String(color.rgb(Math.trunc((r + m) * 255), Math.trunc((g + m) * 255), Math.trunc((b + m) * 255)));
}

export const BadV04 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
