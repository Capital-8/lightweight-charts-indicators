/**
 * Volume Weighted MACD [LazyBear]
 *
 * A MACD histogram built on volume-weighted averages: each average is ema(volume * close, n) / ema(volume, n).
 * d = average(12) - average(26), signal = ema(d, 9), histogram = d - signal. The histogram is green when it is at or
 * above 0 and rising, red when it is below 0 and falling, orange otherwise.
 *
 * As in the original, the input titled "Short period" (12) is named `slow` and "Long period" (26) is named `fast`.
 *
 * Reference: "Volume Weighted MACD [LazyBear]" by LazyBear
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface IndicatorsVolumeWeightedMacdHistogramInputs {
  /** "Short period" */
  slow: number;
  /** "Long period" */
  fast: number;
  /** "Smoothing period" */
  signal: number;
}

export const defaultInputs: IndicatorsVolumeWeightedMacdHistogramInputs = {
  slow: 12,
  fast: 26,
  signal: 9,
};

export const inputConfig: InputConfig[] = [
  { id: 'slow', type: 'int', title: 'Short period', defval: 12 },
  { id: 'fast', type: 'int', title: 'Long period', defval: 26 },
  { id: 'signal', type: 'int', title: 'Smoothing period', defval: 9 },
];

// Colour constants of Pine v1
const GREEN = '#008000';
const ORANGE = '#FF7F00';
const RED = '#FF0000';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: GREEN, lineWidth: 3, style: 'histogram' },
];

export const metadata = {
  title: 'Volume Weighted MACD [LazyBear]',
  shortTitle: 'VWMACD_LB',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<IndicatorsVolumeWeightedMacdHistogramInputs> = {},
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const volume = new Series(bars, (b) => b.volume ?? NaN);
  const volClose = new Series(bars, (b) => (b.volume ?? NaN) * b.close);
  const average = (length: number) => {
    const num = A(ta.ema(volClose, length));
    const den = A(ta.ema(volume, length));
    return num.map((v, i) => v / den[i]);
  };
  const maFast = average(cfg.fast);
  const maSlow = average(cfg.slow);
  const d = maSlow.map((v, i) => v - maFast[i]);
  const maSignal = A(ta.ema(Series.fromArray(bars, d), cfg.signal));
  const dm = d.map((v, i) => v - maSignal[i]);

  const plot0 = bars.map((b, i) => {
    const prev = i > 0 ? dm[i - 1] : NaN;
    const c = ge(dm[i], 0) ? (gt(dm[i], prev) ? GREEN : ORANGE) : (lt(dm[i], prev) ? RED : ORANGE);
    return { time: b.time, value: Number.isFinite(dm[i]) ? dm[i] : NaN, color: c };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
  };
}

export const IndicatorsVolumeWeightedMacdHistogram = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
