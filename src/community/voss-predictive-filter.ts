/**
 * Voss Predictive Filter
 *
 * Ehlers' Voss predictor. A two-pole bandpass filter (center period `period`, relative bandwidth `bandwidth`) runs on
 * the 2-bar momentum of the source. The Voss output is a negative group delay stage on the bandpass output:
 * voss = (3 + order) / 2 * filt - weighted sum of the past voss values, order = 3 * predictMultiplier (kept with a
 * running sum and a ring buffer of `order` values). Optional threshold bands +/- k * MAD (0.6745 * stdev), +/- k * stdev
 * or the percentile (nearest rank) of |voss| over `thresholdPeriod` bars.
 *
 * Alerts (alertcondition, `alerts` of the result): Voss crossing over the + threshold and under the - threshold (with
 * the threshold shown), and crossing over / under zero.
 *
 * Reference: "Voss Predictive Filter" by e2e4
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type VossThresholdMode = 'MAD' | 'Standard Deviation' | 'Percentile Rank';

export interface VossPredictiveFilterInputs {
  /** Price series to filter */
  source: SourceType;
  /** Bandpass center period */
  period: number;
  /** Prediction multiplier: NGD order = 3 * multiplier */
  predictMultiplier: number;
  /** Relative bandwidth of the bandpass filter */
  bandwidth: number;
  showVoss: boolean;
  colorVoss: string;
  showFilter: boolean;
  colorFilter: string;
  showZeroLine: boolean;
  colorZeroLine: string;
  showThreshold: boolean;
  colorThresholdTop: string;
  colorThresholdBottom: string;
  thresholdMode: VossThresholdMode;
  thresholdPeriod: number;
  /** Multiplier k of the MAD / Standard Deviation modes */
  thresholdMultiplier: number;
  /** Percentile of |voss| (Percentile Rank mode) */
  thresholdPercentile: number;
}

export const defaultInputs: VossPredictiveFilterInputs = {
  source: 'close',
  period: 20,
  predictMultiplier: 3,
  bandwidth: 0.25,
  showVoss: true,
  colorVoss: '#3A6DFF',
  showFilter: true,
  colorFilter: '#FF5933',
  showZeroLine: true,
  colorZeroLine: '#4DB8FF',
  showThreshold: true,
  colorThresholdTop: '#FFB340',
  colorThresholdBottom: '#A6FF4D',
  thresholdMode: 'MAD',
  thresholdPeriod: 50,
  thresholdMultiplier: 1.5,
  thresholdPercentile: 90.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'period', type: 'int', title: 'Bandpass Period', defval: 20, min: 1, max: 100, step: 1 },
  { id: 'predictMultiplier', type: 'int', title: 'Prediction Multiplier', defval: 3, min: 2, max: 10, step: 1 },
  { id: 'bandwidth', type: 'float', title: 'Bandwidth', defval: 0.25, min: 0.01, max: 0.45, step: 0.01 },
  { id: 'showVoss', type: 'bool', title: 'Voss Output', defval: true },
  { id: 'colorVoss', type: 'color', title: 'Voss Output Color', defval: '#3A6DFF' },
  { id: 'showFilter', type: 'bool', title: 'Bandpass Filter', defval: true },
  { id: 'colorFilter', type: 'color', title: 'Bandpass Filter Color', defval: '#FF5933' },
  { id: 'showZeroLine', type: 'bool', title: 'Zero Line', defval: true },
  { id: 'colorZeroLine', type: 'color', title: 'Zero Line Color', defval: '#4DB8FF' },
  { id: 'showThreshold', type: 'bool', title: 'Dynamic Threshold', defval: true },
  { id: 'colorThresholdTop', type: 'color', title: 'Threshold + Color', defval: '#FFB340' },
  { id: 'colorThresholdBottom', type: 'color', title: 'Threshold - Color', defval: '#A6FF4D' },
  { id: 'thresholdMode', type: 'string', title: 'Threshold mode', defval: 'MAD', options: ['MAD', 'Standard Deviation', 'Percentile Rank'] },
  { id: 'thresholdPeriod', type: 'int', title: 'Period', defval: 50, min: 2, max: 200, step: 1 },
  { id: 'thresholdMultiplier', type: 'float', title: 'Multiplier (k)', defval: 1.5, min: 0.0, max: 5.0, step: 0.1 },
  { id: 'thresholdPercentile', type: 'float', title: 'Percentile (%)', defval: 90.0, min: 0.0, max: 100.0, step: 0.5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Voss', color: '#3A6DFF', lineWidth: 2 },
  { id: 'plot1', title: 'Filter', color: '#FF5933', lineWidth: 1 },
  { id: 'plot2', title: 'Threshold +', color: '#FFB340', lineWidth: 1 },
  { id: 'plot3', title: 'Threshold -', color: '#A6FF4D', lineWidth: 1 },
];

export const metadata = {
  title: 'Voss Predictive Filter',
  shortTitle: 'VPF',
  overlay: false,
};

const MAD_SCALE = 0.6745;

export function calculate(
  bars: Bar[],
  inputs: Partial<VossPredictiveFilterInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const nz = (v: number) => (isNaN(v) ? 0 : v);
  const src = A(getSourceSeries(bars, cfg.source));

  // Filter parameters (var: computed on the first bar)
  const order = 3 * cfg.predictMultiplier;
  const scale = (3 + order) / 2.0;
  const angularFreq = (2.0 * Math.PI) / cfg.period;
  const freqCos = Math.cos(angularFreq);
  const invBCos = 1.0 / Math.cos(angularFreq * cfg.bandwidth);
  const damping = invBCos - Math.sqrt(invBCos * invBCos - 1.0);

  // NGD state
  const buffer: number[] = new Array(order).fill(0.0);
  let ringIndex = 0;
  let rollingSum = 0.0;
  let residualSum = 0.0;

  const voss: number[] = new Array(n);
  const filt: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // sourceDelta = nz(source) - nz(source[2])
    const delta = nz(src[i]) - nz(i >= 2 ? src[i - 2] : NaN);
    const f1 = i >= 1 ? nz(filt[i - 1]) : 0;
    const f2 = i >= 2 ? nz(filt[i - 2]) : 0;
    filt[i] = 0.5 * (1 - damping) * delta + freqCos * (1 + damping) * f1 - damping * f2;
    const v = scale * filt[i] - residualSum;
    voss[i] = v;
    residualSum += v - rollingSum / order;
    rollingSum += v - buffer[ringIndex];
    buffer[ringIndex] = v;
    ringIndex = (ringIndex + 1) % order;
  }

  // Threshold (computed on every bar when showThreshold is on)
  let threshold: number[] = new Array(n).fill(NaN);
  if (cfg.showThreshold) {
    if (cfg.thresholdMode === 'MAD') {
      threshold = A(ta.stdev(S(voss), cfg.thresholdPeriod)).map((sd) => cfg.thresholdMultiplier * (MAD_SCALE * sd));
    } else if (cfg.thresholdMode === 'Standard Deviation') {
      threshold = A(ta.stdev(S(voss), cfg.thresholdPeriod)).map((sd) => cfg.thresholdMultiplier * sd);
    } else {
      threshold = A(ta.percentile_nearest_rank(S(voss.map((v) => Math.abs(v))), cfg.thresholdPeriod, cfg.thresholdPercentile));
    }
  }

  // crossedAboveThreshold = showThreshold and ta.crossover(voss, thresholdVal) (na threshold when it is off)
  const aboveThreshold = crossedOver(voss, threshold).map((v) => cfg.showThreshold && v);
  const belowThreshold = crossedUnder(voss, threshold.map((v) => -v)).map((v) => cfg.showThreshold && v);

  const t = (i: number) => bars[i].time;
  const line = (on: boolean, values: (i: number) => number, c: string) =>
    bars.map((_b, i) => ({ time: t(i), value: on ? values(i) : NaN, color: c }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(cfg.showVoss, (i) => voss[i], cfg.colorVoss),
      plot1: line(cfg.showFilter, (i) => filt[i], cfg.colorFilter),
      plot2: line(cfg.showThreshold, (i) => threshold[i], cfg.colorThresholdTop),
      plot3: line(cfg.showThreshold, (i) => -threshold[i], cfg.colorThresholdBottom),
    },
    // hline(showZeroLine ? 0 : na, 'Zero', colorZeroLine): Pine default hline style (dashed)
    hlines: cfg.showZeroLine
      ? [{ value: 0, options: { title: 'Zero', color: cfg.colorZeroLine, linestyle: 'dashed' } }]
      : [],
    alerts: alertStates(alertConditions, bars, [aboveThreshold, belowThreshold, crossedOver(voss, 0), crossedUnder(voss, 0)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Voss Predictive Filter: Above +Threshold', message: 'VPF: voss crossed above +threshold' },
  { id: 'alert1', title: 'Voss Predictive Filter: Below -Threshold', message: 'VPF: voss crossed below -threshold' },
  { id: 'alert2', title: 'Voss Predictive Filter: Above Zero', message: 'VPF: voss crossed above zero' },
  { id: 'alert3', title: 'Voss Predictive Filter: Below Zero', message: 'VPF: voss crossed below zero' },
];

export const VossPredictiveFilter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
