/**
 * Laguerre-Kalman Adaptive Filter
 *
 * A 4-element Laguerre filter of the close (gamma) is smoothed by a one-dimensional Kalman-like estimate (process and
 * measurement noise from `Kalman Noise Reduction`). A second Laguerre filter uses an adaptive gamma:
 * gamma * (1 + 10 * stdev(close, adaptivePeriod) / close), clamped to 0.1..0.99. The line is the EMA(3) of the mean
 * of the Kalman estimate and the adaptive filter. It is cyan when it rises by more than the threshold and the close
 * is above it on this bar and the bar before, else magenta.
 * Alerts (alertcondition, `alerts` of the result): the close crossing over / under the line.
 *
 * Reference: "Laguerre-Kalman Adaptive Filter | AlphaNatt" by AlphaNatt
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LaguerreKalmanAdaptiveFilterAlphanattInputs {
  /** Laguerre gamma */
  gamma: number;
  /** Stdev length of the volatility that adapts the gamma */
  adaptivePeriod: number;
  /** Kalman noise level */
  noiseLevel: number;
  /** Minimum rise of the line for an up trend */
  threshold: number;
}

export const defaultInputs: LaguerreKalmanAdaptiveFilterAlphanattInputs = {
  gamma: 0.5,
  adaptivePeriod: 20,
  noiseLevel: 0.5,
  threshold: 0.001,
};

export const inputConfig: InputConfig[] = [
  { id: 'gamma', type: 'float', title: 'Laguerre Gamma', defval: 0.5, min: 0.1, max: 0.99, step: 0.01 },
  { id: 'adaptivePeriod', type: 'int', title: 'Adaptive Period', defval: 20, min: 5, max: 100 },
  { id: 'noiseLevel', type: 'float', title: 'Kalman Noise Reduction', defval: 0.5, min: 0.1, max: 2.0, step: 0.1 },
  { id: 'threshold', type: 'float', title: 'Trend Threshold', defval: 0.001, min: 0.0001, max: 0.01, step: 0.0001 },
];

const UP_COL = '#00F1FF';
const DOWN_COL = '#FF019A';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Laguerre-Kalman Filter', color: DOWN_COL, lineWidth: 2 },
];

export const metadata = {
  title: 'Laguerre-Kalman Adaptive Filter | AlphaNatt',
  shortTitle: 'LKAF AlphaNatt',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;
const nz = (v: number) => (isNaN(v) ? 0 : v);

export function calculate(
  bars: Bar[],
  inputs: Partial<LaguerreKalmanAdaptiveFilterAlphanattInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { gamma, adaptivePeriod, noiseLevel, threshold } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);
  const stdev = A(ta.stdev(Series.fromArray(bars, close), adaptivePeriod));

  const finalFilter: number[] = new Array(n);
  // Laguerre elements of the previous bar (series history, read with nz())
  let l0 = NaN, l1 = NaN, l2 = NaN, l3 = NaN;
  let a0 = NaN, a1 = NaN, a2 = NaN, a3 = NaN;
  let estimate = NaN; // var float estimate = na
  let errorCovariance = 1.0; // var float errorCovariance = 1.0
  for (let i = 0; i < n; i++) {
    const c = close[i];
    const L0 = (1 - gamma) * c + gamma * nz(l0);
    const L1 = -gamma * L0 + nz(l0) + gamma * nz(l1);
    const L2 = -gamma * L1 + nz(l1) + gamma * nz(l2);
    const L3 = -gamma * L2 + nz(l2) + gamma * nz(l3);
    l0 = L0; l1 = L1; l2 = L2; l3 = L3;
    const laguerreFilter = (L0 + 2 * L1 + 2 * L2 + L3) / 6;

    if (isNaN(estimate)) estimate = laguerreFilter;
    const predictedEstimate = estimate;
    const predictedError = errorCovariance + noiseLevel * noiseLevel;
    const kalmanGain = predictedError / (predictedError + noiseLevel);
    estimate = predictedEstimate + kalmanGain * (laguerreFilter - predictedEstimate);
    errorCovariance = (1 - kalmanGain) * predictedError;

    // volatility = ta.stdev(close, adaptivePeriod) / close; math.min / math.max give na with an na argument
    const volatility = stdev[i] / c;
    const adaptiveGamma = Math.min(0.99, Math.max(0.1, gamma * (1 + volatility * 10)));
    const A0 = (1 - adaptiveGamma) * c + adaptiveGamma * nz(a0);
    const A1 = -adaptiveGamma * A0 + nz(a0) + adaptiveGamma * nz(a1);
    const A2 = -adaptiveGamma * A1 + nz(a1) + adaptiveGamma * nz(a2);
    const A3 = -adaptiveGamma * A2 + nz(a2) + adaptiveGamma * nz(a3);
    a0 = A0; a1 = A1; a2 = A2; a3 = A3;
    const adaptiveFilter = (A0 + 2 * A1 + 2 * A2 + A3) / 6;

    finalFilter[i] = (estimate + adaptiveFilter) / 2;
  }
  const smoothed = A(ta.ema(Series.fromArray(bars, finalFilter), 3));

  const plot0 = bars.map((b, i) => {
    const prev = i > 0 ? smoothed[i - 1] : NaN;
    const filterTrend = gt(smoothed[i], prev + threshold);
    const priceTrend = gt(close[i], smoothed[i]) && i > 0 && gt(close[i - 1], prev);
    return { time: b.time, value: smoothed[i], color: filterTrend && priceTrend ? UP_COL : DOWN_COL };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    // alertcondition(ta.crossover(close, smoothed), ...) / alertcondition(ta.crossunder(close, smoothed), ...)
    alerts: alertStates(alertConditions, bars, [crossedOver(close, smoothed), crossedUnder(close, smoothed)]),
  };
}

/** The original's alertconditions (each declared twice by the original, listed once) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Filter Cross Up', message: 'Price crossed above Laguerre-Kalman Filter' },
  { id: 'alert1', title: 'Filter Cross Down', message: 'Price crossed below Laguerre-Kalman Filter' },
];

export const LaguerreKalmanAdaptiveFilterAlphanatt = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
