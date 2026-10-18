/**
 * Adaptive Convergence Divergence
 *
 * A MACD (or PPO) built from two adaptive moving averages instead of EMAs. Each adaptive average is
 * ma = alpha * src + (1 - alpha) * nz(ma[1], sma(src, len)), with alpha = clamp(2 / (len + 1) * factor, 0.01, 1).
 * The factor comes from the MA type: ACMO |cmo| / 100, ARSI |rsi - 50| / 50, FRMA the normalized range roughness
 * (2 * range of len / 2 bars / range of len bars), VOLA the normalized volume ratio (volume / sma(volume) - 1); the
 * last two are normalized to 0..1 by their min / max over len bars. The fast average uses the source and the fast
 * length; the slow one uses the fast average, the slow length and half the alpha. ACD = fast - slow (PPO: in % of
 * the slow one), signal = EMA (or Wilder's RMA) of ACD, histogram = ACD - signal. Colours follow ACD vs signal.
 * Alerts (alertcondition, `alerts` of the result): ACD crosses over the signal, under it, and either cross.
 *
 * Reference: "Adaptive Convergence Divergence" by singhxgurjit
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (c) 2025 Gurjit Singh. This source code is licensed under the Creative Commons
 * Attribution-ShareAlike: https://creativecommons.org/licenses/by-sa/4.0/.
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type AdaptiveConvergenceDivergenceMaType = 'ACMO' | 'ARSI' | 'FRMA' | 'VOLA';

export interface AdaptiveConvergenceDivergenceInputs {
  src: SourceType;
  maType: AdaptiveConvergenceDivergenceMaType;
  /** Fast length */
  length: number;
  slowLen: number;
  signalLen: number;
  /** PPO (percent) instead of MACD (difference) */
  usePPO: boolean;
  /** Wilder's RMA instead of EMA for the signal line */
  useWilders: boolean;
  bullishColor: string;
  bearishColor: string;
  fillTrans: number;
  histTransUp: number;
  histTransDown: number;
}

export const defaultInputs: AdaptiveConvergenceDivergenceInputs = {
  src: 'close',
  maType: 'ARSI',
  length: 12,
  slowLen: 26,
  signalLen: 9,
  usePPO: false,
  useWilders: false,
  bullishColor: 'rgb(176, 190, 197)',
  bearishColor: 'rgb(141, 110, 99)',
  fillTrans: 94,
  histTransUp: 25,
  histTransDown: 65,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close', inline: 'src' },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'ARSI', options: ['ACMO', 'ARSI', 'FRMA', 'VOLA'], inline: 'src' },
  { id: 'length', type: 'int', title: 'Length: Fast', defval: 12, inline: 'len' },
  { id: 'slowLen', type: 'int', title: 'Slow', defval: 26, inline: 'len' },
  { id: 'signalLen', type: 'int', title: 'Signal', defval: 9, inline: 'len' },
  { id: 'usePPO', type: 'bool', title: 'Use PPO (vs MACD)', defval: false },
  { id: 'useWilders', type: 'bool', title: "Use Wilder's (vs EMA) smoothing for signal line", defval: false },
  { id: 'bullishColor', type: 'color', title: 'Bullish', defval: 'rgb(176, 190, 197)', inline: 'Clr' },
  { id: 'bearishColor', type: 'color', title: 'Bearish', defval: 'rgb(141, 110, 99)', inline: 'Clr' },
  { id: 'fillTrans', type: 'int', title: 'Fill Transparency', defval: 94, inline: 'Clr' },
  { id: 'histTransUp', type: 'int', title: 'Histogram Trans: Up', defval: 25, inline: 'Clr1' },
  { id: 'histTransDown', type: 'int', title: 'Down', defval: 65, inline: 'Clr1' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ACD', color: 'rgb(176, 190, 197)', lineWidth: 2 },
  { id: 'plot1', title: 'Signal', color: 'rgb(176, 190, 197)', lineWidth: 1 },
  { id: 'plot2', title: 'Histogram', color: 'rgb(176, 190, 197)', lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'Adaptive Convergence Divergence',
  shortTitle: 'ACD',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10; `x != 0` is false when x is na */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const neZero = (x: number) => !isNaN(x) && Math.abs(x) > EPS;
/** math.max / math.min: na when an argument is na */
const clampAlpha = (alpha: number) => (isNaN(alpha) ? NaN : Math.max(0.01, Math.min(alpha, 1)));

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveConvergenceDivergenceInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const volume = bars.map((b) => b.volume ?? NaN);

  // normalize(x, len): (x - lowest) / (highest - lowest); 0.5 when the range is 0 or na
  const normalize = (x: number[], len: number) => {
    const lo = A(ta.lowest(S(x), len));
    const hi = A(ta.highest(S(x), len));
    return x.map((v, i) => {
      const fullRange = hi[i] - lo[i];
      return neZero(fullRange) ? (v - lo[i]) / fullRange : 0.5;
    });
  };
  // adaptiveMA(src, len, alpha): ma = alpha * src + (1 - alpha) * nz(ma[1], sma(src, len))
  const adaptiveMA = (src: number[], len: number, alpha: number[]) => {
    const initSMA = A(ta.sma(S(src), len));
    const out: number[] = new Array(n);
    let prev = NaN;
    for (let i = 0; i < n; i++) {
      const base = isNaN(prev) ? initSMA[i] : prev;
      prev = alpha[i] * src[i] + (1 - alpha[i]) * base;
      out[i] = prev;
    }
    return out;
  };
  const getAlphaBase = (len: number) => 2 / (len + 1);

  const maCalc = (src: number[], len: number, halfAlpha: boolean): number[] => {
    let alpha: number[];
    if (cfg.maType === 'ACMO') {
      // cmo = math.abs(ta.cmo(src, len) / 100); alpha = clampAlpha(base * cmo)
      const cmo = A(ta.cmo(S(src), len));
      alpha = cmo.map((v) => clampAlpha(getAlphaBase(len) * Math.abs(v / 100)));
    } else if (cfg.maType === 'ARSI') {
      // rsi = math.abs(ta.rsi(src, len) - 50) / 50
      const rsi = A(ta.rsi(S(src), len));
      alpha = rsi.map((v) => clampAlpha(getAlphaBase(len) * (Math.abs(v - 50) / 50)));
    } else if (cfg.maType === 'FRMA') {
      const half = Math.floor(len / 2);
      const hiL = A(ta.highest(S(src), len));
      const loL = A(ta.lowest(S(src), len));
      const hiS = A(ta.highest(S(src), half));
      const loS = A(ta.lowest(S(src), half));
      const roughness = src.map((_v, i) => {
        const rangeLong = hiL[i] - loL[i];
        const rangeShort = (hiS[i] - loS[i]) * 2;
        return neZero(rangeLong) ? rangeShort / rangeLong : 1;
      });
      const norm = normalize(roughness, len);
      alpha = norm.map((v) => clampAlpha(getAlphaBase(len) * v));
    } else {
      // VOLA: volRatio = avgVol != 0 ? volume / avgVol - 1 : 0
      const avgVol = A(ta.sma(S(volume), len));
      const volRatio = volume.map((v, i) => (neZero(avgVol[i]) ? v / avgVol[i] - 1 : 0));
      const norm = normalize(volRatio, len);
      alpha = norm.map((v) => clampAlpha(getAlphaBase(len) * v));
    }
    // getHalfAlpha(alpha, half) => half ? alpha / 2 : alpha
    if (halfAlpha) alpha = alpha.map((a) => a / 2);
    return adaptiveMA(src, len, alpha);
  };

  const src = A(getSourceSeries(bars, cfg.src));
  const ma = maCalc(src, cfg.length, false);
  const fama = maCalc(ma, cfg.slowLen, true);
  // Plain division: x / 0 is +-infinity (0 / 0 na), as Pine
  const osc = ma.map((m, i) => (cfg.usePPO ? ((m - fama[i]) / fama[i]) * 100 : m - fama[i]));
  const signal = A(cfg.useWilders ? ta.rma(S(osc), cfg.signalLen) : ta.ema(S(osc), cfg.signalLen));
  const hist = osc.map((o, i) => o - signal[i]);

  const trendColor = (i: number) => (gt(osc[i], signal[i]) ? cfg.bullishColor : cfg.bearishColor);
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

  const plot0 = bars.map((b, i) => ({ time: b.time, value: fin(osc[i]), color: trendColor(i) }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: fin(signal[i]), color: trendColor(i) }));
  // color = hist[1] < hist ? color.new(trendColor, histTransUp) : color.new(trendColor, histTransDown)
  const plot2 = bars.map((b, i) => ({
    time: b.time, value: fin(hist[i]),
    color: String(color.new(trendColor(i), i > 0 && lt(hist[i - 1], hist[i]) ? cfg.histTransUp : cfg.histTransDown)),
  }));
  // fill(plotOsc, plotSign, color = color.new(trendColor, fillTrans))
  const fills = [{ plot1: 'plot0', plot2: 'plot1', colors: bars.map((_b, i) => String(color.new(trendColor(i), cfg.fillTrans))) }];

  // co = ta.crossover(osc, signal); cu = ta.crossunder(osc, signal)
  const co = crossedOver(osc, signal);
  const cu = crossedUnder(osc, signal);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills,
    // alertcondition(co, ...), alertcondition(cu, ...), alertcondition(co or cu, ...)
    alerts: alertStates(alertConditions, bars, [co, cu, co.map((c, i) => c || cu[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish 🐂', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Bearish 🐻', message: 'Alert Fired!' },
  { id: 'alert2', title: '🐂 Bulls ⚔️ Bears 🐻', message: 'Alert Fired!' },
];

export const AdaptiveConvergenceDivergence = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
