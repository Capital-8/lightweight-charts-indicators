/**
 * Kaufman Trend Strength Signal
 *
 * A two-state Kalman filter (level and slope, process noise 0.01, measurement noise 500) of the close. The
 * covariance diagonal is set back to 1 at the start of every bar. The filtered level is the line; the slope is the
 * oscillator. Trend strength = WMA 10 of oscillator / max |oscillator| of the last 10 bars * 100. The line is lime
 * above 0, red otherwise, blue when |strength| < 10. Triangles when the strength crosses above the entry threshold
 * or below minus the threshold.
 *
 * Last bar: the filter is updated on a closed bar only (an open bar keeps the values of the bar before). The port
 * reads the state of the last bar from the optional third argument (see src/chart-context.ts); without it every bar
 * is taken as closed.
 *
 * Reference: "Kaufman Trend Strength Signal" by PakunFX
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, matrix, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

type PineMatrix = ReturnType<typeof matrix.new_matrix<number>>;

export interface KaufmanTrendStrengthSignalInputs {
  /** Entry threshold of the trend strength (signals at +threshold and -threshold) */
  trendStrengthEntry: number;
}

export const defaultInputs: KaufmanTrendStrengthSignalInputs = {
  trendStrengthEntry: 60,
};

export const inputConfig: InputConfig[] = [
  { id: 'trendStrengthEntry', type: 'int', title: 'Entry Threshold', defval: 60 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Kalman Filter MA', color: color.lime, lineWidth: 2 },
];

export const metadata = {
  title: 'Kaufman Trend Strength Signal',
  shortTitle: 'Kaufman Trend Strength Signal',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<KaufmanTrendStrengthSignalInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const processNoise1 = 0.01;
  const processNoise2 = 0.01;
  const measurementNoise = 500.0;
  const R2 = 10;
  const N2 = 10;

  const mat = (rows: number, cols: number, values: number[][]) => {
    const m = matrix.new_matrix<number>(rows, cols, 0.0);
    values.forEach((row, i) => row.forEach((v, j) => matrix.set(m, i, j, v)));
    return m;
  };
  const mult = (a: PineMatrix, b: PineMatrix | number) => matrix.mult(a, b) as PineMatrix;

  let P = mat(2, 2, [[0, 0], [0, 0]]);
  const Q = mat(2, 2, [[processNoise1, 0], [0, processNoise2]]);
  const R = mat(1, 1, [[measurementNoise]]);
  const H = mat(1, 2, [[1, 0]]);
  const I = mat(2, 2, [[1, 0], [0, 1]]);
  const F = mat(2, 2, [[1, 1], [0, 1]]);

  const filtered = new Array<number>(n).fill(NaN);
  const trendRaw = new Array<number>(n).fill(NaN);
  let X: [number, number] = [NaN, NaN];
  let oscillator = NaN;
  let filteredSrc = NaN;
  const oscBuffer: number[] = [];
  for (let i = 0; i < n; i++) {
    const src = bars[i].close;
    // matrix.set(P, 0, 0, 1.0); matrix.set(P, 1, 1, 1.0) on every bar (P keeps its off-diagonal values)
    matrix.set(P, 0, 0, 1.0);
    matrix.set(P, 1, 1, 1.0);
    if (i === 0) X = [src, 0.0]; // var X = array.from(src, 0.0)
    // if barstate.isconfirmed: the filter update
    if (barIsConfirmed(i)) {
      const x1 = matrix.get(F, 0, 0) * X[0] + matrix.get(F, 0, 1) * X[1];
      const x2 = matrix.get(F, 1, 1) * X[1];
      X = [x1, x2];
      P = matrix.sum(mult(F, mult(P, matrix.transpose(F))), Q);
      const S = matrix.sum(mult(H, mult(P, matrix.transpose(H))), R);
      const Sinv = matrix.inv(S);
      if (Sinv === null) throw new Error("In the 'matrix.inv()' function. Cannot inverse a singular matrix (matrix  determinant is zero).");
      const K = mult(P, mult(matrix.transpose(H), Sinv));
      const hx = matrix.mult(H, X) as unknown as number[];
      const innovation = src - hx[0];
      const diff = mult(K, innovation);
      X = [X[0] + matrix.get(diff, 0, 0), X[1] + matrix.get(diff, 1, 0)];
      P = mult(matrix.sum(I, mult(mult(K, H), -1)), P);
      oscillator = X[1];
      filteredSrc = X[0];
    }
    filtered[i] = filteredSrc;

    // osc_buffer: the last N2 oscillator values; A = max |value| (Pine `absVal > A`)
    oscBuffer.push(oscillator);
    if (oscBuffer.length > N2) oscBuffer.shift();
    let maxAbs = 0.0;
    for (const v of oscBuffer) {
      const absVal = Math.abs(v);
      if (gt(absVal, maxAbs)) maxAbs = absVal;
    }
    trendRaw[i] = gt(maxAbs, 0) ? (oscillator / maxAbs) * 100 : NaN;
  }

  const ts = Series.fromArray(bars, trendRaw);
  const trendStrengthS = ta.wma(ts, R2);
  const trendStrength = trendStrengthS.toArray().map((v) => v ?? NaN);
  const crossUp = ta.crossover(trendStrengthS, cfg.trendStrengthEntry).toArray();
  const crossDown = ta.crossunder(trendStrengthS, -cfg.trendStrengthEntry).toArray();

  const markers: MarkerData[] = [];
  const plot0 = bars.map((b, i) => {
    // osc_color = trend_strength > 0 ? lime : red; math.abs(trend_strength) < 10 ? blue : osc_color
    const s = trendStrength[i];
    const c = lt(Math.abs(s), 10) ? color.blue : gt(s, 0) ? color.lime : color.red;
    if (crossUp[i]) markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'small' });
    if (crossDown[i]) markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small' });
    return { time: b.time, value: Number.isFinite(filtered[i]) ? filtered[i] : NaN, color: c };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
  };
}

export const KaufmanTrendStrengthSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
