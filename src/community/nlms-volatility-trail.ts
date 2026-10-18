/**
 * NLMS Volatility Trail
 *
 * A Normalized Least Mean Squares (Widrow-Hoff) adaptive filter predicts each bar from the previous M bars of the
 * source: pred = sum(w[i] * src[i + 1]), then the weights learn from the error (w += mu / (eps + |x|^2) * err * x),
 * starting from equal weights 1 / M. The trail follows the prediction inside an ATR band: it keeps its previous value
 * unless the prediction -/+ ATR * factor pushes it up / down. The trend turns long when the trail rises, short when
 * it falls. Candles, the trail and a glow take the trend colour; gradient fills join the trail and the close.
 * The Pine 'Line Width' input is not ported: plot widths are fixed by plotConfig (the Pine default, 3). The Pine
 * 'Color Bars' input is not ported: the script does not use it (the trend candles are always drawn).
 *
 * Alerts (alertcondition, `alerts` of the result): "NLMS ATR Bullish" (the trail crosses over its previous value)
 * and "NLMS ATR Bearish" (it crosses under it).
 *
 * Reference: "NLMS Volatility Trail [BackQuant]" by BackQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BackQuant
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'NLMS ATR Bullish', message: 'NLMS ATR Trend turned bullish on {{ticker}}' },
  { id: 'alert1', title: 'NLMS ATR Bearish', message: 'NLMS ATR Trend turned bearish on {{ticker}}' },
];

export interface NlmsVolatilityTrailInputs {
  src: SourceType;
  /** Filter taps (M): number of past bars with a learned weight */
  taps: number;
  /** Step size (mu): learning rate */
  mu: number;
  /** Regularization (epsilon) of the input power */
  eps: number;
  /** ATR period */
  periodAtr: number;
  /** ATR factor of the band */
  factorAtr: number;
  longCol: string;
  shortCol: string;
  showFill: boolean;
  showGlow: boolean;
}

export const defaultInputs: NlmsVolatilityTrailInputs = {
  src: 'close',
  taps: 72,
  mu: 0.195,
  eps: 0.6,
  periodAtr: 14,
  factorAtr: 1.7,
  longCol: '#00ff00',
  shortCol: '#ff0000',
  showFill: true,
  showGlow: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'taps', type: 'int', title: 'Filter Taps (M)', defval: 72, min: 2, max: 200 },
  { id: 'mu', type: 'float', title: 'Step Size (μ)', defval: 0.195, min: 0.001, max: 1.5, step: 0.001 },
  { id: 'eps', type: 'float', title: 'Regularization (ε)', defval: 0.6, min: 0.0, step: 0.1 },
  { id: 'periodAtr', type: 'int', title: 'Period', defval: 14 },
  { id: 'factorAtr', type: 'float', title: 'Factor', defval: 1.7, step: 0.01 },
  { id: 'longCol', type: 'color', title: 'Long Color', defval: '#00ff00' },
  { id: 'shortCol', type: 'color', title: 'Short Color', defval: '#ff0000' },
  { id: 'showFill', type: 'bool', title: 'Gradient Fill', defval: true },
  { id: 'showGlow', type: 'bool', title: 'Trail Glow', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trail Ref', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Price Ref', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Glow Lower Ref', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Glow Upper Ref', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'NLMS ATR', color: '#00ff00', lineWidth: 3 },
];

export const metadata = {
  title: 'NLMS Volatility Trail [BackQuant]',
  shortTitle: 'NLMS Volatility Trail [BackQuant]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<NlmsVolatilityTrailInputs> = {},
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.src));
  const M = cfg.taps;

  // NLMS one-step predictor: var w = array.new_float(M, 1.0 / M), updated from bar_index >= M
  const w: number[] = new Array(M).fill(1.0 / M);
  const raw: number[] = new Array(n).fill(NaN);
  for (let b = M; b < n; b++) {
    let pred = 0.0;
    let power = 0.0;
    for (let i = 0; i < M; i++) {
      const xi = src[b - i - 1];
      pred += w[i] * xi;
      power += xi * xi;
    }
    const err = src[b] - pred;
    const k = cfg.mu / (cfg.eps + power);
    for (let i = 0; i < M; i++) w[i] = w[i] + k * err * src[b - i - 1];
    raw[b] = pred;
  }

  // Trail: nz(trail[1], nlms) clamped into nlms +/- atr * factor
  const atr = A(ta.atr(bars, cfg.periodAtr));
  const trail: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const tr = atr[i] * cfg.factorAtr;
    let v = i > 0 && !isNaN(trail[i - 1]) ? trail[i - 1] : raw[i];
    const upper = raw[i] + tr;
    const lower = raw[i] - tr;
    if (gt(lower, v)) v = lower;
    if (lt(upper, v)) v = upper;
    trail[i] = v;
  }

  const glowAtr = A(ta.atr(bars, 14));
  const t = (i: number) => bars[i].time;
  const lineColor: string[] = new Array(n);
  const trendCol: string[] = new Array(n);
  let col = 'transparent'; // var color col = na
  let trendDir = 0;
  const longFlags: boolean[] = new Array(n).fill(false);
  const shortFlags: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    // ta.crossover(trail, trail[1]): trail > trail[1] and trail[1] <= trail[2], compared exactly (no 1e-10 tolerance)
    const a1 = i > 0 ? trail[i - 1] : NaN;
    const a2 = i > 1 ? trail[i - 2] : NaN;
    const long = trail[i] > a1 && a1 <= a2;
    const short = trail[i] < a1 && a1 >= a2;
    longFlags[i] = long;
    shortFlags[i] = short;
    if (long) col = cfg.longCol;
    else if (short) col = cfg.shortCol;
    if (long) trendDir = 1;
    else if (short) trendDir = -1;
    lineColor[i] = col;
    trendCol[i] = trendDir === 1 ? cfg.longCol : trendDir === -1 ? cfg.shortCol : color.gray;
  }

  const close = bars.map((b) => b.close);
  const glow = glowAtr.map((v) => v * 0.06);
  const above = (i: number) => gt(close[i], trail[i]);
  const below = (i: number) => lt(close[i], trail[i]);
  const idx = bars.map((_b, i) => i);
  // fill(pPrice, pTrail, close > trail ? close : trail, close > trail ? trail : close,
  //      showFill and close > trail ? color.new(longCol, 90) : na, showFill and close > trail ? color.new(longCol, 20) : na)
  const bullFill = {
    topValue: idx.map((i) => (above(i) ? close[i] : trail[i])),
    bottomValue: idx.map((i) => (above(i) ? trail[i] : close[i])),
    topColor: idx.map((i): string | null => (cfg.showFill && above(i) ? String(color.new(cfg.longCol, 90)) : null)),
    bottomColor: idx.map((i): string | null => (cfg.showFill && above(i) ? String(color.new(cfg.longCol, 20)) : null)),
  };
  // fill(pPrice, pTrail, close < trail ? trail : close, close < trail ? close : trail,
  //      showFill and close < trail ? color.new(shortCol, 20) : na, showFill and close < trail ? color.new(shortCol, 90) : na)
  const bearFill = {
    topValue: idx.map((i) => (below(i) ? trail[i] : close[i])),
    bottomValue: idx.map((i) => (below(i) ? close[i] : trail[i])),
    topColor: idx.map((i): string | null => (cfg.showFill && below(i) ? String(color.new(cfg.shortCol, 20)) : null)),
    bottomColor: idx.map((i): string | null => (cfg.showFill && below(i) ? String(color.new(cfg.shortCol, 90)) : null)),
  };
  // fill(pTrail, pGlowUp / pGlowDn, showGlow ? color.new(trendCol, 55) : na)
  const glowColors = idx.map((i) => (cfg.showGlow ? String(color.new(trendCol[i], 55)) : 'transparent'));

  // plotcandle(open, high, low, close, "Trend Candles", trendCol, trendCol, bordercolor = trendCol)
  const candles: PlotCandleData[] = bars.map((b, i) => ({
    time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
    color: trendCol[i], wickColor: trendCol[i], borderColor: trendCol[i],
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: idx.map((i) => ({ time: t(i), value: trail[i] })),
      plot1: idx.map((i) => ({ time: t(i), value: close[i] })),
      plot2: idx.map((i) => ({ time: t(i), value: trail[i] - glow[i] })),
      plot3: idx.map((i) => ({ time: t(i), value: trail[i] + glow[i] })),
      plot4: idx.map((i) => ({ time: t(i), value: trail[i], color: lineColor[i] })),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot0', options: { title: 'Bull Fill' }, gradient: bullFill },
      { plot1: 'plot1', plot2: 'plot0', options: { title: 'Bear Fill' }, gradient: bearFill },
      { plot1: 'plot0', plot2: 'plot2', options: { title: 'Glow Lower' }, colors: glowColors },
      { plot1: 'plot0', plot2: 'plot3', options: { title: 'Glow Upper' }, colors: glowColors.slice() },
    ],
    plotCandles: { trendCandles: candles },
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

export const NlmsVolatilityTrail = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
