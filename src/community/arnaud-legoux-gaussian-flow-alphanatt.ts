/**
 * Arnaud Legoux Gaussian Flow | AlphaNatt
 *
 * A Gaussian-weighted average of the last `length` closes (weight of close[i] = exp(-(i - m)^2 / (2 s^2)),
 * m = offset * (length - 1), s = length / sigma), smoothed by an EMA. An envelope around it: the base width is
 * ATR * multiplier (Fixed), ATR * multiplier * (1 + acceleration / SMA of acceleration) (Adaptive) or
 * (ATR + stdev(close - average)) / 2 * multiplier (Hybrid), times a Gaussian factor exp(-0.5^2 / (2 * 0.3^2)) and a
 * momentum factor 1 + |EMA(5) of the momentum| / average * 10; the bands are at average +- 2 * envelope. Ten hidden
 * gradient levels on each side are filled with fading colours. The average is cyan when the close is above it,
 * else magenta.
 * Alerts (alertcondition, `alerts` of the result): trend long / short (the close crosses the average in a strong up /
 * down trend: EMA(5) of the trend strength beyond +-0.5), mean reversion long / short (the close beyond the average
 * -+ 0.95 envelope) and the first bar of a strong up / down trend.
 *
 * Reference: "Arnaud Legoux Gaussian Flow | AlphaNatt" by AlphaNatt
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type AlmaGaussianEnvelopeMode = 'Fixed' | 'Adaptive' | 'Hybrid';

export interface ArnaudLegouxGaussianFlowAlphanattInputs {
  /** Number of closes in the Gaussian average */
  almaLength: number;
  /** Gaussian offset (0 .. 1) */
  almaOffset: number;
  /** Gaussian sigma */
  almaSigma: number;
  /** Envelope width mode */
  envelopeMode: AlmaGaussianEnvelopeMode;
  envelopeMultiplier: number;
  /** ATR / SMA / stdev length of the envelope */
  adaptivePeriod: number;
  /** Number of gradient steps between the band and the average */
  gradientDepth: number;
  /** Momentum lookback */
  momentumLength: number;
  /** EMA length of the average */
  signalSmoothing: number;
}

export const defaultInputs: ArnaudLegouxGaussianFlowAlphanattInputs = {
  almaLength: 21,
  almaOffset: 0.85,
  almaSigma: 6.0,
  envelopeMode: 'Adaptive',
  envelopeMultiplier: 1.5,
  adaptivePeriod: 20,
  gradientDepth: 10,
  momentumLength: 14,
  signalSmoothing: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'almaLength', type: 'int', title: 'ALMA Period', defval: 21, min: 5, max: 100 },
  { id: 'almaOffset', type: 'float', title: 'Gaussian Offset', defval: 0.85, min: 0.0, max: 1.0, step: 0.05 },
  { id: 'almaSigma', type: 'float', title: 'Gaussian Sigma', defval: 6.0, min: 1.0, max: 10.0, step: 0.5 },
  { id: 'envelopeMode', type: 'string', title: 'Envelope Mode', defval: 'Adaptive', options: ['Fixed', 'Adaptive', 'Hybrid'] },
  { id: 'envelopeMultiplier', type: 'float', title: 'Envelope Multiplier', defval: 1.5, min: 0.5, max: 3.0, step: 0.1 },
  { id: 'adaptivePeriod', type: 'int', title: 'Adaptive Period', defval: 20, min: 10, max: 50 },
  { id: 'gradientDepth', type: 'int', title: 'Gradient Depth', defval: 10, min: 5, max: 15 },
  { id: 'momentumLength', type: 'int', title: 'Momentum Length', defval: 14, min: 5, max: 30 },
  { id: 'signalSmoothing', type: 'int', title: 'Signal Smoothing', defval: 3, min: 1, max: 10 },
];

const BULL = '#00F1FF';
const BEAR = '#FF019A';
/** Transparencies of the band plot and of the gradient levels 2 .. 10 */
const LEVEL_TRANSP = [0, 70, 75, 80, 83, 86, 89, 92, 95, 98];
/** Transparencies of the fills: band-2, 2-3, ..., 9-10, 10-average */
const FILL_TRANSP = [70, 75, 80, 83, 86, 89, 92, 95, 98, 99];

const levelPlots = (side: 'Upper' | 'Lower', first: number, c: string): PlotConfig[] =>
  LEVEL_TRANSP.map((t, k) => ({
    id: `plot${first + k}`,
    title: k === 0 ? `${side} Envelope` : `${side === 'Upper' ? 'UB' : 'LB'}${k + 1}`,
    color: String(color.new(c, t)),
    lineWidth: 1,
    display: 'none' as const,
  }));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ALMA Gaussian', color: BULL, lineWidth: 2 },
  ...levelPlots('Upper', 1, BEAR),
  ...levelPlots('Lower', 11, BULL),
];

export const metadata = {
  title: 'Arnaud Legoux Gaussian Flow | AlphaNatt',
  shortTitle: 'Arnaud Legoux Gaussian Flow | AlphaNatt',
  overlay: true,
};

/** Pine float comparison: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ArnaudLegouxGaussianFlowAlphanattInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const len = cfg.almaLength;

  // Gaussian weighted average of close[0 .. len - 1]
  const m = cfg.almaOffset * (len - 1);
  const s = len / cfg.almaSigma;
  const alma: number[] = new Array(n);
  for (let bar = 0; bar < n; bar++) {
    let wtdSum = 0.0;
    let weightSum = 0.0;
    for (let i = 0; i <= len - 1; i++) {
      const weight = Math.exp(-Math.pow(i - m, 2) / (2 * Math.pow(s, 2)));
      wtdSum = wtdSum + (bar - i >= 0 ? close[bar - i] : NaN) * weight;
      weightSum = weightSum + weight;
    }
    alma[bar] = wtdSum / weightSum;
  }
  const almaSmooth = A(ta.ema(S(alma), cfg.signalSmoothing));
  const prev = (a: number[], i: number, k = 1) => (i - k >= 0 ? a[i - k] : NaN);

  // baseWidth = switch envelopeMode (the mode is the same on every bar: each branch runs on all bars or on none)
  const p = cfg.adaptivePeriod;
  const mult = cfg.envelopeMultiplier;
  let baseWidth: number[];
  if (cfg.envelopeMode === 'Adaptive') {
    const accel = almaSmooth.map((v, i) => Math.abs(v - prev(almaSmooth, i)));
    const avgAccel = A(ta.sma(S(accel), p));
    const atr = A(ta.atr(bars, p));
    baseWidth = atr.map((a, i) => a * mult * (1 + accel[i] / avgAccel[i]));
  } else if (cfg.envelopeMode === 'Hybrid') {
    const atr = A(ta.atr(bars, p));
    const std = A(ta.stdev(S(close.map((c, i) => c - almaSmooth[i])), p));
    baseWidth = atr.map((a, i) => ((a + std[i]) / 2) * mult);
  } else {
    baseWidth = A(ta.atr(bars, p)).map((a) => a * mult);
  }

  const gaussianMult = Math.exp(-Math.pow(0.5, 2) / (2 * Math.pow(0.3, 2)));
  const momentum = almaSmooth.map((v, i) => v - prev(almaSmooth, i, cfg.momentumLength));
  const momentumNorm = A(ta.ema(S(momentum), 5));

  const upper: number[] = new Array(n);
  const lower: number[] = new Array(n);
  const finalEnv: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const envelopeWidth = baseWidth[i] * gaussianMult;
    const momentumAdjust = 1 + (Math.abs(momentumNorm[i]) / almaSmooth[i]) * 10;
    const finalEnvelope = envelopeWidth * momentumAdjust;
    finalEnv[i] = finalEnvelope;
    upper[i] = almaSmooth[i] + 2 * finalEnvelope;
    lower[i] = almaSmooth[i] - 2 * finalEnvelope;
  }

  // Alerts: trendStrength = (almaSmooth - almaSmooth[momentumLength]) / almaSmooth * 100, trendMA = ta.ema(trendStrength, 5)
  const trendMA = A(ta.ema(S(momentum.map((v, i) => (v / almaSmooth[i]) * 100)), 5));
  const strongUp = close.map((c, i) => gt(trendMA[i], 0.5) && gt(c, almaSmooth[i]));
  const strongDown = close.map((c, i) => lt(trendMA[i], -0.5) && lt(c, almaSmooth[i]));
  const crossUp = crossedOver(close, almaSmooth);
  const crossDown = crossedUnder(close, almaSmooth);
  const alertFlags: boolean[][] = [
    // trendLong = ta.crossover(close, almaSmooth) and strongUptrend / trendShort
    crossUp.map((f, i) => f && strongUp[i]),
    crossDown.map((f, i) => f && strongDown[i]),
    // meanRevLong = close < almaSmooth - finalEnvelope * 0.95 and trendMA > -0.5 / meanRevShort
    close.map((c, i) => lt(c, almaSmooth[i] - finalEnv[i] * 0.95) && gt(trendMA[i], -0.5)),
    close.map((c, i) => gt(c, almaSmooth[i] + finalEnv[i] * 0.95) && lt(trendMA[i], 0.5)),
    // strongUptrend and not strongUptrend[1] (false before the first bar) / the same for the down trend
    strongUp.map((f, i) => f && !(i > 0 && strongUp[i - 1])),
    strongDown.map((f, i) => f && !(i > 0 && strongDown[i - 1])),
  ];

  // Plot values: na for na and +-infinity
  const pv = (x: number) => (Number.isFinite(x) ? x : NaN);
  const plots: Record<string, Array<{ time: number; value: number; color: string }>> = {};
  plots.plot0 = bars.map((b, i) => ({
    time: b.time, value: pv(almaSmooth[i]), color: gt(close[i], almaSmooth[i]) ? BULL : BEAR,
  }));
  // Upper: upperEnvelope - upperGradStep * k (k = 0 .. 9); lower: lowerEnvelope + lowerGradStep * k
  const depth = cfg.gradientDepth;
  LEVEL_TRANSP.forEach((t, k) => {
    const cu = String(color.new(BEAR, t));
    const cl = String(color.new(BULL, t));
    plots[`plot${1 + k}`] = bars.map((b, i) => {
      const step = (upper[i] - almaSmooth[i]) / depth;
      return { time: b.time, value: pv(k === 0 ? upper[i] : k === 1 ? upper[i] - step : upper[i] - step * k), color: cu };
    });
    plots[`plot${11 + k}`] = bars.map((b, i) => {
      const step = (almaSmooth[i] - lower[i]) / depth;
      return { time: b.time, value: pv(k === 0 ? lower[i] : k === 1 ? lower[i] + step : lower[i] + step * k), color: cl };
    });
  });

  // fill(upperMain, ub2), ..., fill(ub10, almaPlot); the same on the lower side
  const fills = [
    ...FILL_TRANSP.map((t, k) => ({
      plot1: `plot${1 + k}`, plot2: k === 9 ? 'plot0' : `plot${2 + k}`, options: { color: String(color.new(BEAR, t)) },
    })),
    ...FILL_TRANSP.map((t, k) => ({
      plot1: `plot${11 + k}`, plot2: k === 9 ? 'plot0' : `plot${12 + k}`, options: { color: String(color.new(BULL, t)) },
    })),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ALMA Trend Long', message: 'Price crossed above ALMA in strong uptrend' },
  { id: 'alert1', title: 'ALMA Trend Short', message: 'Price crossed below ALMA in strong downtrend' },
  { id: 'alert2', title: 'ALMA Mean Reversion Long', message: 'Price in lower Gaussian zone - potential bounce' },
  { id: 'alert3', title: 'ALMA Mean Reversion Short', message: 'Price in upper Gaussian zone - potential pullback' },
  { id: 'alert4', title: 'ALMA Strong Uptrend', message: 'Strong uptrend detected' },
  { id: 'alert5', title: 'ALMA Strong Downtrend', message: 'Strong downtrend detected' },
];

export const ArnaudLegouxGaussianFlowAlphanatt = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
