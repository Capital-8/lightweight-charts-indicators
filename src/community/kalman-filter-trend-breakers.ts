/**
 * Kalman Filter Trend Breakers
 *
 * A Kalman-style filter of the source: distance = src - kfilt[1]; velocity += distance * K / 100;
 * kfilt = kfilt[1] + distance * sqrt(sharpness * K / 100) + velocity. A second line adds the velocity weighted by
 * its sigmoid: kfilt1 = kfilt + multiplier * velocity * sigmoid(velocity), smoothed by an SMA; both lines and the
 * ribbon fill are green for a positive velocity, red otherwise. Trend breakers: a red label above the bar when the
 * sigmoid is at least the threshold, the smoothed line rose for `lookback` bars up to the previous bar and now
 * falls, and kfilt1 > kfilt; a green label below the bar in the opposite case (sigmoid below 1 - threshold).
 * Each breaker shades the background of its bar and the next four bars with a fading colour.
 *
 * Last bar: a trend breaker is marked on a closed bar only. The port reads the state of the last bar from the
 * optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Kalman Filter Trend Breakers v1.1" by kypexin
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: original Kalman filter calculations (c) loxx; Kalman Filter Trend Breakers (c) kypexin 2025-01-29
 */

import { ta, taCore, callsite, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface KalmanFilterTrendBreakersInputs {
  /** Kalman filter source */
  src: SourceType;
  /** Kalman sharpness */
  sharpnessKalman: number;
  /** Kalman K */
  KKalman: number;
  /** Sigmoid threshold of the breaker signals */
  sigmoidThr: number;
  /** Velocity multiplier of the ribbon line */
  fillMultiplier: number;
  /** SMA length of the ribbon line */
  lenSMA: number;
  /** Bars of rise / fall before a breaker */
  lookbackReverse: number;
  /** Shade the background after a breaker */
  showGradients: boolean;
}

export const defaultInputs: KalmanFilterTrendBreakersInputs = {
  src: 'close',
  sharpnessKalman: 4,
  KKalman: 6,
  sigmoidThr: 0.6,
  fillMultiplier: 10,
  lenSMA: 4,
  lookbackReverse: 8,
  showGradients: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Kalman filter source', defval: 'close', group: 'Source' },
  { id: 'sharpnessKalman', type: 'float', title: 'Kalman Sharpness', defval: 4, min: 0.01, step: 0.1, group: 'Kalman calculation' },
  { id: 'KKalman', type: 'float', title: 'Kalman K', defval: 6, min: 0.1, step: 0.1, group: 'Kalman calculation' },
  { id: 'sigmoidThr', type: 'float', title: 'Sigmoid threshold', defval: 0.6, min: 0, max: 1, step: 0.001, group: 'Kalman calculation' },
  { id: 'fillMultiplier', type: 'int', title: 'Fill multiplier', defval: 10, min: 1, step: 1, group: 'Visual settings',
    tooltip: 'Defines the difference between Kalman signal and velocity signal line (higher values will result in higher amplitude)' },
  { id: 'lenSMA', type: 'int', title: 'Smoothing SMA length', defval: 4, min: 1, step: 1, group: 'Visual settings' },
  { id: 'lookbackReverse', type: 'int', title: 'Reverse lookback, bars', defval: 8, min: 1, step: 1, group: 'Visual settings',
    tooltip: 'Lookback number of bars for rising and falling signal detection (lower values will result in more signals, higher values will detect only significant trends)' },
  { id: 'showGradients', type: 'bool', title: 'Show breaker gradients', defval: true, group: 'Visual settings' },
];

const UP_LINE = String(color.new('#00FF00', 70));
const DOWN_LINE = String(color.new('#FF0000', 70));
const UP_FILL = String(color.new('#00FF00', 85));
const DOWN_FILL = String(color.new('#FF0000', 85));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Kalman filter signal', color: UP_LINE, lineWidth: 3 },
  { id: 'plot1', title: 'Kalman filter velocity ribbon', color: UP_LINE, lineWidth: 1 },
];

export const metadata = {
  title: 'Kalman Filter Trend Breakers v1.1',
  shortTitle: 'Kalman Filter Trend Breakers v1.1',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<KalmanFilterTrendBreakersInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.src));

  // Kalman filter
  const kfilt = new Array<number>(n).fill(NaN);
  const velocity = new Array<number>(n).fill(NaN);
  const sigmoid = new Array<number>(n).fill(NaN);
  const kfilt1 = new Array<number>(n).fill(NaN);
  const gain = Math.sqrt((cfg.sharpnessKalman * cfg.KKalman) / 100);
  for (let i = 0; i < n; i++) {
    const prevK = i > 0 && !isNaN(kfilt[i - 1]) ? kfilt[i - 1] : src[i]; // nz(kfilt[1], src)
    const prevV = i > 0 && !isNaN(velocity[i - 1]) ? velocity[i - 1] : 0; // nz(velocity[1], 0)
    const distance = src[i] - prevK;
    const error = prevK + distance * gain;
    velocity[i] = prevV + (distance * cfg.KKalman) / 100;
    kfilt[i] = error + velocity[i];
    sigmoid[i] = 1 / (1 + Math.exp(-velocity[i]));
    kfilt1[i] = kfilt[i] + cfg.fillMultiplier * velocity[i] * sigmoid[i];
  }
  const sma = A(ta.sma(Series.fromArray(bars, kfilt1), cfg.lenSMA));
  const smaPrev = sma.map((_v, i) => (i > 0 ? sma[i - 1] : NaN)); // kfilt1SMA[1]

  // Pine v6 `and` is lazy: each ta.rising / ta.falling runs (and keeps its history) only on the bars where the
  // operands on its left are true.
  const L = cfg.lookbackReverse;
  const thrUp = 1 - cfg.sigmoidThr;
  // fillReverseDown = sigmoid >= thr and ta.rising(kfilt1SMA[1], L) and ta.falling(kfilt1SMA, 1) and kfilt1 > kfilt
  const downA = sigmoid.map((s) => ge(s, cfg.sigmoidThr));
  const downRising = callsite.whenCalled(downA, (x) => taCore.rising(x, L), smaPrev);
  const downB = downA.map((a, i) => a && downRising[i] === true);
  const downFalling = callsite.whenCalled(downB, (x) => taCore.falling(x, 1), sma);
  const reverseDown = downB.map((b, i) => b && downFalling[i] === true && gt(kfilt1[i], kfilt[i]) && barIsConfirmed(i));
  // fillReverseUp = sigmoid < 1 - thr and ta.falling(kfilt1SMA[1], L) and ta.rising(kfilt1SMA, 1) and kfilt1 < kfilt
  const upA = sigmoid.map((s) => lt(s, thrUp));
  const upFalling = callsite.whenCalled(upA, (x) => taCore.falling(x, L), smaPrev);
  const upB = upA.map((a, i) => a && upFalling[i] === true);
  const upRising = callsite.whenCalled(upB, (x) => taCore.rising(x, 1), sma);
  const reverseUp = upB.map((b, i) => b && upRising[i] === true && lt(kfilt1[i], kfilt[i]) && barIsConfirmed(i));
  // (both end with `and barstate.isconfirmed`)

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const shades = [70, 75, 80, 85, 90];
  const redShades = shades.map((tr) => String(color.new(color.red, tr)));
  const greenShades = shades.map((tr) => String(color.new(color.green, tr)));
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    // plotshape(fillReverseDown, 'Positive trend breaker', shape.labeldown, location.abovebar, #ff0000, size.small)
    if (reverseDown[i]) markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: '#ff0000', size: 'small' });
    // plotshape(kalmanSigmoid < 1 - sigmoidThr ? fillReverseUp : false, 'Negative trend breaker', shape.labelup,
    //   location.belowbar, #00ff00, size.small)
    if (lt(sigmoid[i], thrUp) && reverseUp[i]) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: '#00ff00', size: 'small' });
    }
    if (!cfg.showGradients) continue;
    // bgcolor layers in Pine order (the later call is drawn on top): fillReverseDown[0..4], then fillReverseUp[0..4]
    for (let k = 0; k < 5; k++) if (i - k >= 0 && reverseDown[i - k]) bgColors.push({ time, color: redShades[k] });
    for (let k = 0; k < 5; k++) if (i - k >= 0 && reverseUp[i - k]) bgColors.push({ time, color: greenShades[k] });
  }

  const lineColor = (i: number) => (gt(velocity[i], 0) ? UP_LINE : DOWN_LINE);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: kfilt[i], color: lineColor(i) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: sma[i], color: lineColor(i) })),
    },
    fills: [
      // fill(kfPlot, kfPlot1, color = kfiltFillColor, title = 'Kalman filter ribbon fill', fillgaps = true)
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Kalman filter ribbon fill', fillgaps: true },
        colors: velocity.map((v) => (gt(v, 0) ? UP_FILL : DOWN_FILL)) },
    ],
    markers,
    bgColors,
  };
}

export const KalmanFilterTrendBreakers = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
