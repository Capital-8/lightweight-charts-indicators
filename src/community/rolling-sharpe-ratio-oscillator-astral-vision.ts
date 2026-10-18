/**
 * Rolling Sharpe Ratio Oscillator | Astral Vision
 *
 * Log return r = ln(close / close[1]); Sharpe = SMA(r, len) / stdev(r, len) * sqrt(365) when the stdev is above 0,
 * smoothed by an EMA. The line is coloured by a gradient from -2 to 2 (or by the overbought / oversold thresholds),
 * with fills to the threshold lines when beyond them. On the price pane: background colours beyond the thresholds,
 * candles in the line colour, and two price levels: EMA of close[len] * exp(threshold * stdev / sqrt(365) * len).
 *
 * Reference: "Rolling Sharpe Ratio Oscillator | Astral Vision 🌠💠" by AstralVision
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Astral Vision
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, PlotCandleData } from '../types';

export interface RollingSharpeRatioOscillatorAstralVisionInputs {
  /** Lookback period (bars) of the mean and stdev of the log returns */
  len: number;
  /** EMA length of the Sharpe ratio and of the price levels */
  smoothLen: number;
  /** Oversold threshold */
  threshOs: number;
  /** Overbought threshold */
  threshOb: number;
  /** Gradient colour (else threshold colours) */
  useGrad: boolean;
  theme: 'Inferno' | 'Paradiso' | 'Futura' | 'Infinito' | 'Hermes';
  useCustom: boolean;
  customPos: string;
  customNeg: string;
}

export const defaultInputs: RollingSharpeRatioOscillatorAstralVisionInputs = {
  len: 365,
  smoothLen: 30,
  threshOs: -1.5,
  threshOb: 2.8,
  useGrad: true,
  theme: 'Futura',
  useCustom: false,
  customPos: color.green,
  customNeg: color.red,
};

const G1 = 'Settings';
const G2 = 'Astral Colors';

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Lookback Period (days)', defval: 365, group: G1 },
  { id: 'smoothLen', type: 'int', title: 'Smoothing EMA Length', defval: 30, group: G1 },
  { id: 'threshOs', type: 'float', title: 'Oversold Threshold', defval: -1.5, step: 0.1, group: G1 },
  { id: 'threshOb', type: 'float', title: 'Overbought Threshold', defval: 2.8, step: 0.1, group: G1 },
  { id: 'useGrad', type: 'bool', title: 'Use Gradient Color', defval: true, group: G1 },
  { id: 'theme', type: 'string', title: 'Theme', defval: 'Futura', options: ['Inferno', 'Paradiso', 'Futura', 'Infinito', 'Hermes'], group: G2 },
  { id: 'useCustom', type: 'bool', title: 'Use Custom Colors', defval: false, group: G2 },
  { id: 'customPos', type: 'color', title: 'Custom Positive', defval: color.green, group: G2 },
  { id: 'customNeg', type: 'color', title: 'Custom Negative', defval: color.red, group: G2 },
];

const POS = String(color.rgb(0, 255, 180));
const NEG = String(color.rgb(180, 0, 255));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Overbought Threshold', color: String(color.new(POS, 40)), lineWidth: 1 },
  { id: 'plot1', title: 'Oversold Threshold', color: String(color.new(NEG, 40)), lineWidth: 1 },
  { id: 'plot2', title: 'Sharpe Ratio', color: POS, lineWidth: 2 },
  { id: 'plot3', title: 'Overbought Price', color: String(color.new(POS, 40)), lineWidth: 1, forceOverlay: true },
  { id: 'plot4', title: 'Oversold Price', color: String(color.new(NEG, 40)), lineWidth: 1, forceOverlay: true },
];

export const metadata = {
  title: 'Rolling Sharpe Ratio Oscillator | Astral Vision 🌠💠',
  shortTitle: 'Rolling Sharpe Ratio Oscillator | Astral Vision 🌠💠',
  overlay: false,
  precision: 2,
  format: 'price',
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const THEMES: Record<string, [string, string]> = {
  Inferno: [String(color.rgb(255, 0, 0)), String(color.rgb(120, 0, 0))],
  Paradiso: [String(color.rgb(0, 210, 255)), String(color.rgb(0, 80, 160))],
  Futura: [POS, NEG],
  Infinito: [String(color.rgb(180, 120, 255)), String(color.rgb(255, 220, 80))],
  Hermes: [String(color.rgb(255, 160, 0)), String(color.rgb(0, 180, 120))],
};

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<RollingSharpeRatioOscillatorAstralVisionInputs> = {},
): IndicatorResult & { bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]> } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const { len, smoothLen, threshOs, threshOb } = cfg;

  // Theme colours (Hermes is the last `else` of the Pine ternary chain)
  const [themePos, themeNeg] = THEMES[cfg.theme] ?? THEMES.Hermes;
  const posCol = cfg.useCustom ? cfg.customPos : themePos;
  const negCol = cfg.useCustom ? cfg.customNeg : themeNeg;

  const excess = bars.map((b, i) => (i > 0 ? Math.log(b.close / bars[i - 1].close) : NaN));
  const meanExcess = A(ta.sma(S(excess), len));
  const stdevExcess = A(ta.stdev(S(excess), len));
  // sharpe = stdev_excess > 0 ? mean / stdev * sqrt(365) : na
  const sharpe = meanExcess.map((m, i) => (gt(stdevExcess[i], 0) ? (m / stdevExcess[i]) * Math.sqrt(365) : NaN));
  const sharpeSmooth = A(ta.ema(S(sharpe), smoothLen));

  // price levels: close[len] * exp(thresh * stdev / sqrt(365) * len), smoothed by an EMA
  const level = (th: number) => bars.map((_b, i) => (i - len >= 0
    ? bars[i - len].close * Math.exp(((th * stdevExcess[i]) / Math.sqrt(365)) * len) : NaN));
  const priceOb = A(ta.ema(S(level(threshOb)), smoothLen));
  const priceOs = A(ta.ema(S(level(threshOs)), smoothLen));

  const NA = 'transparent';
  const posLine = String(color.new(posCol, 40));
  const negLine = String(color.new(negCol, 40));
  const posFill = String(color.new(posCol, 80));
  const negFill = String(color.new(negCol, 80));
  const posBg = String(color.new(posCol, 50));
  const negBg = String(color.new(negCol, 50));

  const definite: string[] = new Array(n);
  const fillOs: string[] = new Array(n);
  const fillOb: string[] = new Array(n);
  const bgColors: BgColorData[] = [];
  const candles: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    const ss = sharpeSmooth[i];
    const above = gt(ss, threshOb);
    const below = lt(ss, threshOs);
    // grad = color.from_gradient(sharpe_smooth, -2, 2, neg_col, pos_col) (na value: na colour)
    const grad = String(color.from_gradient(ss, -2, 2, negCol, posCol));
    const col = above ? posCol : below ? negCol : color.black;
    definite[i] = cfg.useGrad ? grad : col;
    // fill(sharpeplot, h2, sharpe_smooth < thresh_os ? color.new(neg_col, 80) : na)
    fillOs[i] = below ? negFill : NA;
    // fill(sharpeplot, h1, sharpe_smooth > thresh_ob ? color.new(pos_col, 80) : na)
    fillOb[i] = above ? posFill : NA;
    // two bgcolor calls (force_overlay): the second one is drawn on top; they never hold on the same bar
    if (below) bgColors.push({ id: 'bgcolor0', time: bars[i].time, color: negBg, forceOverlay: true });
    if (above) bgColors.push({ id: 'bgcolor1', time: bars[i].time, color: posBg, forceOverlay: true });
    // plotcandle(open, high, low, close, color = definitecol, wickcolor = definitecol, bordercolor = definitecol, force_overlay = true)
    const b = bars[i];
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
      color: definite[i], wickColor: definite[i], borderColor: definite[i], forceOverlay: true });
  }

  const P = (f: (b: Bar, i: number) => Point): Point[] => bars.map(f);
  return {
    metadata: {
      title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay,
      precision: metadata.precision, format: metadata.format,
    },
    plots: {
      // h1 = plot(thresh_ob, color = color.new(pos_col, 40), linewidth = 1)
      plot0: P((b) => ({ time: b.time, value: threshOb, color: posLine })),
      // h2 = plot(thresh_os, color = color.new(neg_col, 40), linewidth = 1)
      plot1: P((b) => ({ time: b.time, value: threshOs, color: negLine })),
      // sharpeplot = plot(sharpe_smooth, color = definitecol, linewidth = 2)
      plot2: P((b, i) => ({ time: b.time, value: sharpeSmooth[i], color: definite[i] })),
      // plot(ta.ema(price_ob, smooth_len), color = color.new(pos_col, 40), linewidth = 1, force_overlay = true)
      plot3: P((b, i) => ({ time: b.time, value: priceOb[i], color: posLine })),
      // plot(ta.ema(price_os, smooth_len), color = color.new(neg_col, 40), linewidth = 1, force_overlay = true)
      plot4: P((b, i) => ({ time: b.time, value: priceOs[i], color: negLine })),
    },
    fills: [
      { plot1: 'plot2', plot2: 'plot1', colors: fillOs },
      { plot1: 'plot2', plot2: 'plot0', colors: fillOb },
    ],
    bgColors,
    plotCandles: { sharpeCandles: candles },
  };
}

export const RollingSharpeRatioOscillatorAstralVision = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
