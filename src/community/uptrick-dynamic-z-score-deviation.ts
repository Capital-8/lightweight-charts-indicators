/**
 * Uptrick: Dynamic Z-Score Deviation
 *
 * The main line is the mean of an ALMA and an approximate zero-lag EMA (ema(2 * close - close[len], len)) of the
 * close. Its colour follows the slope over `slopeLen` bars: by default the RGB channels are EMAs (15) of the bullish /
 * bearish channel values, so the colour moves smoothly between the two. Up to four ATR shadow bands around the line
 * are filled with the line colour, and the candles can take it. Reversal labels: the z-score of the distance of the
 * close to the line and the z-score of an ALMA-smoothed RSI are both beyond their thresholds, the RSI EMA is below 40
 * (buy) / above 60 (sell) and the close turns up (buy) / down (sell). The label size follows the signal strength
 * |z price| + |z RSI| (tiny < 4, small < 6, normal from 6) or is fixed (small).
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' / 'Sell Alert' on the bars of the buy / sell labels.
 *
 * Reference: "Uptrick: Dynamic Z-Score Deviation" by Uptrick
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uptrick
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface UptrickDynamicZScoreDeviationInputs {
  maLen: number;
  rsiLen: number;
  zLookback: number;
  priceZThresh: number;
  rsiZThresh: number;
  rsiEmaLen: number;
  almaOffset: number;
  almaSigma: number;
  showSignals: boolean;
  /** Slope length of the line colour */
  slopeLen: number;
  showShadow: boolean;
  /** Number of ATR shadow bands (1..4) */
  shadowLayers: number;
  shadowBaseMult: number;
  /** Colour from EMAs of the RGB channels (else bullish / bearish / gray by the slope sign) */
  smoothGradient: boolean;
  atrLength: number;
  useBarColor: boolean;
  /** Label size from the signal strength (else a fixed small label) */
  useDynamicSize: boolean;
}

export const defaultInputs: UptrickDynamicZScoreDeviationInputs = {
  maLen: 50,
  rsiLen: 14,
  zLookback: 50,
  priceZThresh: 2.0,
  rsiZThresh: 1.5,
  rsiEmaLen: 8,
  almaOffset: 0.85,
  almaSigma: 6,
  showSignals: true,
  slopeLen: 10,
  showShadow: true,
  shadowLayers: 3,
  shadowBaseMult: 1.0,
  smoothGradient: true,
  atrLength: 14,
  useBarColor: true,
  useDynamicSize: true,
};

const MAIN = 'MAIN INPUTS';
const SHADOW = 'SHADOW SETTINGS';
export const inputConfig: InputConfig[] = [
  { id: 'maLen', type: 'int', title: 'Main MA Length', defval: 50, group: MAIN },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, group: MAIN },
  { id: 'zLookback', type: 'int', title: 'Z-Score Lookback', defval: 50, group: MAIN },
  { id: 'priceZThresh', type: 'float', title: 'Price Z-Score Threshold', defval: 2.0, group: MAIN },
  { id: 'rsiZThresh', type: 'float', title: 'RSI Z-Score Threshold', defval: 1.5, group: MAIN },
  { id: 'rsiEmaLen', type: 'int', title: 'RSI EMA Filter Length', defval: 8, group: MAIN },
  { id: 'almaOffset', type: 'float', title: 'ALMA Offset', defval: 0.85, group: MAIN },
  { id: 'almaSigma', type: 'float', title: 'ALMA Sigma', defval: 6, group: MAIN },
  { id: 'showSignals', type: 'bool', title: 'Show Reversal Signals', defval: true, group: MAIN },
  { id: 'slopeLen', type: 'int', title: 'Slope Sensitivity', defval: 10, min: 1, group: MAIN },
  { id: 'showShadow', type: 'bool', title: 'Show MA Shadow', defval: true, group: SHADOW },
  { id: 'shadowLayers', type: 'int', title: 'Shadow Layer Count', defval: 3, min: 1, max: 4, group: SHADOW },
  { id: 'shadowBaseMult', type: 'float', title: 'Base Shadow ATR Multiplier', defval: 1.0, group: SHADOW },
  { id: 'smoothGradient', type: 'bool', title: 'Smooth Color Transitions', defval: true, group: SHADOW },
  { id: 'atrLength', type: 'int', title: 'ATR Length for Shadow', defval: 14, group: SHADOW },
  { id: 'useBarColor', type: 'bool', title: 'Use Bar Coloring', defval: true, group: 'BAR COLOR' },
  { id: 'useDynamicSize', type: 'bool', title: 'Use Dynamic Signal Size', defval: true, group: 'SIGNAL CUSTOMIZATION' },
];

const BULL = color.rgb(92, 240, 215);
const BEAR = color.rgb(179, 42, 195);
const SHADOW_PLOT = '#2962FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Shadow 1', color: SHADOW_PLOT, lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Lower Shadow 1', color: SHADOW_PLOT, lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Upper Shadow 2', color: SHADOW_PLOT, lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Lower Shadow 2', color: SHADOW_PLOT, lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Upper Shadow 3', color: SHADOW_PLOT, lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Lower Shadow 3', color: SHADOW_PLOT, lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Upper Shadow 4', color: SHADOW_PLOT, lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'Lower Shadow 4', color: SHADOW_PLOT, lineWidth: 1, display: 'none' },
  { id: 'plot8', title: 'Smoothed MA (ALMA + ZLMA)', color: BULL, lineWidth: 2 },
];

export const metadata = {
  title: 'Uptrick: Dynamic Z-Score Deviation',
  shortTitle: 'Uptrick: Dynamic Z-Score Deviation',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<UptrickDynamicZScoreDeviationInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const src = S(close);

  // Core MA: (alma + zlma) / 2 with zlma = ta.ema(2 * src - src[maLen], maLen)
  const alma = A(ta.alma(src, cfg.maLen, cfg.almaOffset, cfg.almaSigma));
  const zlmaSrc = close.map((c, i) => (i >= cfg.maLen ? 2 * c - close[i - cfg.maLen] : NaN));
  const zlma = A(ta.ema(S(zlmaSrc), cfg.maLen));
  const comboMA = alma.map((v, i) => (v + zlma[i]) / 2);

  // RSI, ALMA-smoothed RSI and RSI EMA
  const rsi = ta.rsi(src, cfg.rsiLen);
  const rsiSmooth = ta.alma(rsi, 10, 0.85, 6);
  const rsiEma = A(ta.ema(rsi, cfg.rsiEmaLen));

  // z-scores
  const rs = A(rsiSmooth);
  const rsiMean = A(ta.sma(rsiSmooth, cfg.zLookback));
  const rsiStdev = A(ta.stdev(rsiSmooth, cfg.zLookback));
  const zRsi = rs.map((v, i) => (v - rsiMean[i]) / (rsiStdev[i] + 1e-10));
  const priceDist = close.map((c, i) => c - comboMA[i]);
  const pdMean = A(ta.sma(S(priceDist), cfg.zLookback));
  const pdStd = A(ta.stdev(S(priceDist), cfg.zLookback));
  const zPrice = priceDist.map((v, i) => (v - pdMean[i]) / (pdStd[i] + 1e-10));

  // Line colour: rawSlope = comboMA - comboMA[slopeLen]; channels = ta.ema(rawSlope > 0 ? bull : bear, 15)
  const rawSlope = comboMA.map((v, i) => (i >= cfg.slopeLen ? v - comboMA[i - cfg.slopeLen] : NaN));
  const up = rawSlope.map((s) => gt(s, 0));
  const emaR = A(ta.ema(S(up.map((u) => (u ? color.r(BULL) : color.r(BEAR)))), 15));
  const emaG = A(ta.ema(S(up.map((u) => (u ? color.g(BULL) : color.g(BEAR)))), 15));
  const emaB = A(ta.ema(S(up.map((u) => (u ? color.b(BULL) : color.b(BEAR)))), 15));
  const maCoreColor = rawSlope.map((s, i) => (cfg.smoothGradient
    // color.rgb(int(r), int(g), int(b)): int() truncates, a na channel is 0
    ? color.rgb(Math.trunc(emaR[i]), Math.trunc(emaG[i]), Math.trunc(emaB[i]))
    : gt(s, 0) ? BULL : lt(s, 0) ? BEAR : color.gray));

  const atr = A(ta.atr(bars, cfg.atrLength));
  const plots: Record<string, Point[]> = {};
  const fills: NonNullable<IndicatorResult['fills']> = [];
  // Shadow layers k = 1..4: plot(on ? comboMA +/- shadowBaseMult * k * shadowATR : na), fill(u, l, color.new(maCoreColor, tr))
  const layerTransp = [75, 85, 92, 96];
  for (let k = 1; k <= 4; k++) {
    const on = cfg.showShadow && (k === 1 || (k === 4 ? cfg.shadowLayers === 4 : cfg.shadowLayers >= k));
    const width = atr.map((a) => cfg.shadowBaseMult * k * a);
    const u = `plot${2 * (k - 1)}`;
    const l = `plot${2 * (k - 1) + 1}`;
    plots[u] = bars.map((b, i) => ({ time: b.time, value: on ? comboMA[i] + width[i] : NaN }));
    plots[l] = bars.map((b, i) => ({ time: b.time, value: on ? comboMA[i] - width[i] : NaN }));
    const tr = layerTransp[k - 1];
    fills.push({ plot1: u, plot2: l, colors: maCoreColor.map((c) => (on ? String(color.new(c, tr)) : 'transparent')) });
  }
  // plot(comboMA, title = "Smoothed MA (ALMA + ZLMA)", color = maCoreColor, linewidth = 2)
  plots.plot8 = bars.map((b, i) => ({ time: b.time, value: comboMA[i], color: maCoreColor[i] }));

  // barcolor(useBarColor ? maCoreColor : na)
  const barColors: BarColorData[] = cfg.useBarColor ? bars.map((b, i) => ({ time: b.time, color: maCoreColor[i] })) : [];

  const markers: MarkerData[] = [];
  const upText = '𝐔𝐩';
  const downText = '𝐃𝐨𝐰𝐧';
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const t = bars[i].time;
    const buyCond = cfg.showSignals && lt(zPrice[i], -cfg.priceZThresh) && lt(zRsi[i], -cfg.rsiZThresh)
      && lt(rsiEma[i], 40) && gt(close[i], close[i - 1]);
    const sellCond = cfg.showSignals && gt(zPrice[i], cfg.priceZThresh) && gt(zRsi[i], cfg.rsiZThresh)
      && gt(rsiEma[i], 60) && lt(close[i], close[i - 1]);
    buyFlags[i] = buyCond;
    sellFlags[i] = sellCond;
    const strength = Math.abs(zPrice[i]) + Math.abs(zRsi[i]);
    // Strong (>= 6): normal; medium (4..6): small; weak (< 4): tiny; fixed (dynamic size off): small
    const size = !cfg.useDynamicSize ? 'small' : ge(strength, 6) ? 'normal' : ge(strength, 4) ? 'small' : lt(strength, 4) ? 'tiny' : null;
    if (size === null) continue;
    // Style ids: Buy Strong / Medium / Weak / Fixed = shape0..3, Sell Strong / Medium / Weak / Fixed = shape4..7
    const k = !cfg.useDynamicSize ? 3 : size === 'normal' ? 0 : size === 'small' ? 1 : 2;
    // plotshape(buyCond ..., location.belowbar, shape.labelup, color.rgb(92, 240, 215), text = "𝐔𝐩", textcolor = #000000)
    if (buyCond) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: BULL, size, text: upText, textColor: '#000000', id: `shape${k}` });
    }
    // plotshape(sellCond ..., location.abovebar, shape.labeldown, color.rgb(179, 42, 195), text = "𝐃𝐨𝐰𝐧", textcolor = color.white)
    if (sellCond) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: BEAR, size, text: downText, textColor: color.white, id: `shape${4 + k}` });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    barColors,
    // alertcondition(buyCond, "Buy Alert") / alertcondition(sellCond, "Sell Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'Uptrick Buy Reversal Signal' },
  { id: 'alert1', title: 'Sell Alert', message: 'Uptrick Sell Reversal Signal' },
];

export const UptrickDynamicZScoreDeviation = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
