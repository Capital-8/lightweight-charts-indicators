/**
 * Reflex & Trendflex
 *
 * Ehlers' Reflex (cycle component) and Trendflex (trend component) oscillators on the SuperSmoother (two-pole
 * Butterworth low-pass filter) of the source. Trendflex is the mean of (smoothed - smoothed[i]) for i = 1..period;
 * Reflex is the mean deviation of the past smoothed values from the line between smoothed[period] and smoothed.
 * Both are normalized by an exponentially weighted RMS (0.04 / 0.96). An optional dynamic threshold (+/-) on one
 * oscillator: multiplier * 0.6745 * stdev (MAD mode), multiplier * stdev, or the percentile (nearest rank) of the
 * absolute oscillator over the threshold period.
 * Alerts (alertcondition, `alerts` of the result): the threshold oscillator crosses over +threshold / under
 * -threshold (with the threshold shown), Reflex and Trendflex cross over / under zero.
 *
 * Reference: "Reflex & Trendflex" by e2e4
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: @author=@e2e4
 */

import { ta, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type ReflexTrendflexThresholdMode = 'MAD' | 'Standard Deviation' | 'Percentile Rank';

export interface ReflexTrendflexInputs {
  /** Price series to decompose into cycle and trend components */
  source: SourceType;
  /** SuperSmoother period of Reflex */
  reflexPeriod: number;
  /** SuperSmoother period of Trendflex */
  trendflexPeriod: number;
  showReflex: boolean;
  colorReflex: string;
  showTrendflex: boolean;
  colorTrendflex: string;
  showZeroLine: boolean;
  colorZeroLine: string;
  /** Dynamic threshold bands */
  showThreshold: boolean;
  colorThresholdTop: string;
  colorThresholdBottom: string;
  thresholdMode: ReflexTrendflexThresholdMode;
  /** Oscillator of the threshold */
  thresholdSource: 'Reflex' | 'Trendflex';
  thresholdPeriod: number;
  /** Scaling factor (k) of the MAD / Standard Deviation modes */
  thresholdMultiplier: number;
  /** Percentile (%) of the Percentile Rank mode */
  thresholdPercentile: number;
}

export const defaultInputs: ReflexTrendflexInputs = {
  source: 'close',
  reflexPeriod: 20,
  trendflexPeriod: 20,
  showReflex: true,
  colorReflex: '#4A90E2',
  showTrendflex: true,
  colorTrendflex: '#E24A4A',
  showZeroLine: true,
  colorZeroLine: '#4DB8FF',
  showThreshold: true,
  colorThresholdTop: '#FFB340',
  colorThresholdBottom: '#A6FF4D',
  thresholdMode: 'MAD',
  thresholdSource: 'Reflex',
  thresholdPeriod: 50,
  thresholdMultiplier: 1.5,
  thresholdPercentile: 90.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'reflexPeriod', type: 'int', title: 'Reflex Period', defval: 20, min: 5, max: 50, step: 1 },
  { id: 'trendflexPeriod', type: 'int', title: 'Trendflex Period', defval: 20, min: 5, max: 50, step: 1 },
  { id: 'showReflex', type: 'bool', title: 'Reflex (Cycle Component)', defval: true },
  { id: 'colorReflex', type: 'color', title: 'Reflex Color', defval: '#4A90E2' },
  { id: 'showTrendflex', type: 'bool', title: 'Trendflex (Trend Component)', defval: true },
  { id: 'colorTrendflex', type: 'color', title: 'Trendflex Color', defval: '#E24A4A' },
  { id: 'showZeroLine', type: 'bool', title: 'Zero Line', defval: true },
  { id: 'colorZeroLine', type: 'color', title: 'Zero Line Color', defval: '#4DB8FF' },
  { id: 'showThreshold', type: 'bool', title: 'Dynamic Threshold', defval: true },
  { id: 'colorThresholdTop', type: 'color', title: 'Threshold + Color', defval: '#FFB340' },
  { id: 'colorThresholdBottom', type: 'color', title: 'Threshold - Color', defval: '#A6FF4D' },
  { id: 'thresholdMode', type: 'string', title: 'Threshold mode', defval: 'MAD', options: ['MAD', 'Standard Deviation', 'Percentile Rank'] },
  { id: 'thresholdSource', type: 'string', title: 'Apply to', defval: 'Reflex', options: ['Reflex', 'Trendflex'] },
  { id: 'thresholdPeriod', type: 'int', title: 'Period', defval: 50, min: 2, max: 200, step: 1 },
  { id: 'thresholdMultiplier', type: 'float', title: 'Multiplier (k)', defval: 1.5, min: 0.0, max: 5.0, step: 0.1 },
  { id: 'thresholdPercentile', type: 'float', title: 'Percentile (%)', defval: 90.0, min: 0.0, max: 100.0, step: 0.5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Reflex', color: '#4A90E2', lineWidth: 2 },
  { id: 'plot1', title: 'Trendflex', color: '#E24A4A', lineWidth: 2 },
  { id: 'plot2', title: 'Threshold +', color: '#FFB340', lineWidth: 1 },
  { id: 'plot3', title: 'Threshold -', color: '#A6FF4D', lineWidth: 1 },
];

export const metadata = {
  title: 'Reflex & Trendflex',
  shortTitle: 'xFlex',
  overlay: false,
};

const SQRT2_PI = Math.sqrt(2.0) * Math.PI;
const MAD_SCALE = 0.6745;
const nz = (v: number) => (isNaN(v) ? 0 : v);
/** Pine x / y: na when y is 0 */
const div = (x: number, y: number) => (y === 0 ? NaN : x / y);

/** Ehlers' SuperSmoother: two-pole Butterworth low-pass filter (nz() on the inputs and the past outputs) */
function superSmoother(src: number[], period: number): number[] {
  const decay = Math.exp(-SQRT2_PI / (0.5 * period));
  const freq = Math.cos(SQRT2_PI / (0.5 * period));
  const f1 = 2.0 * decay * freq;
  const f2 = -decay * decay;
  const ci = (1.0 - f1 - f2) / 2.0;
  const out: number[] = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const s1 = i > 0 ? src[i - 1] : NaN;
    const o1 = i > 0 ? out[i - 1] : NaN;
    const o2 = i > 1 ? out[i - 2] : NaN;
    out[i] = ci * (nz(src[i]) + nz(s1)) + f1 * nz(o1) + f2 * nz(o2);
  }
  return out;
}

/** RMS normalization: rms := 0.04 * v * v + 0.96 * nz(rms[1]); v / sqrt(rms) */
function normalize(values: number[]): number[] {
  let rms = NaN;
  return values.map((v) => {
    rms = 0.04 * v * v + 0.96 * nz(rms);
    return div(v, Math.sqrt(rms));
  });
}

/** sumSmoothed := sumSmoothed + nz(smoothed[1]) - nz(smoothed[period + 1]) (var, starts at 0) */
function runningSum(sm: number[], period: number): number[] {
  let sum = 0;
  return sm.map((_v, i) => {
    sum = sum + nz(i >= 1 ? sm[i - 1] : NaN) - nz(i >= period + 1 ? sm[i - period - 1] : NaN);
    return sum;
  });
}

function reflex(src: number[], period: number): number[] {
  const sm = superSmoother(src, period);
  const sums = runningSum(sm, period);
  const sumIndices = (period * (period + 1)) / 2.0;
  const avgDev = sm.map((s, i) => {
    const slope = i >= period ? (sm[i - period] - s) / period : NaN;
    return (period * s + slope * sumIndices - sums[i]) / period;
  });
  return normalize(avgDev);
}

function trendflex(src: number[], period: number): number[] {
  const sm = superSmoother(src, period);
  const sums = runningSum(sm, period);
  return normalize(sm.map((s, i) => (period * s - sums[i]) / period));
}

export function calculate(bars: Bar[], inputs: Partial<ReflexTrendflexInputs> = {}): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.source));

  const none = new Array(n).fill(NaN);
  const reflexValue = cfg.showReflex ? reflex(src, cfg.reflexPeriod) : none;
  const trendflexValue = cfg.showTrendflex ? trendflex(src, cfg.trendflexPeriod) : none;
  const thresholdOsc = cfg.thresholdSource === 'Reflex' ? reflexValue : trendflexValue;

  let thresholdValue = none;
  if (cfg.showThreshold) {
    const oscS = S(thresholdOsc);
    if (cfg.thresholdMode === 'MAD') {
      // multiplier * MAD_SCALE * ta.stdev(source, period)
      thresholdValue = A(ta.stdev(oscS, cfg.thresholdPeriod)).map((v) => cfg.thresholdMultiplier * (MAD_SCALE * v));
    } else if (cfg.thresholdMode === 'Standard Deviation') {
      thresholdValue = A(ta.stdev(oscS, cfg.thresholdPeriod)).map((v) => cfg.thresholdMultiplier * v);
    } else {
      thresholdValue = A(ta.percentile_nearest_rank(S(thresholdOsc.map((v) => Math.abs(v))), cfg.thresholdPeriod,
        cfg.thresholdPercentile));
    }
  }

  const t = (i: number) => bars[i].time;
  const plot0 = bars.map((_b, i) => ({ time: t(i), value: reflexValue[i], color: cfg.colorReflex }));
  const plot1 = bars.map((_b, i) => ({ time: t(i), value: trendflexValue[i], color: cfg.colorTrendflex }));
  const plot2 = bars.map((_b, i) => ({ time: t(i), value: thresholdValue[i], color: cfg.colorThresholdTop }));
  const plot3 = bars.map((_b, i) => ({ time: t(i), value: -thresholdValue[i], color: cfg.colorThresholdBottom }));

  // crossedAboveThreshold = showThreshold and ta.crossover(thresholdOsc, thresholdValue)
  // crossedBelowThreshold = showThreshold and ta.crossunder(thresholdOsc, -thresholdValue)
  const aboveThr = cfg.showThreshold ? crossedOver(thresholdOsc, thresholdValue) : none.map(() => false);
  const belowThr = cfg.showThreshold ? crossedUnder(thresholdOsc, thresholdValue.map((v) => -v)) : none.map(() => false);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    // hline(showZeroLine ? 0 : na, 'Zero', colorZeroLine, display = showZeroLine ? display.all : display.none)
    hlines: cfg.showZeroLine
      ? [{ value: 0, options: { title: 'Zero', color: cfg.colorZeroLine, linestyle: 'dashed', linewidth: 1 } }]
      : [],
    alerts: alertStates(alertConditions, bars, [
      aboveThr, belowThr,
      crossedOver(reflexValue, 0), crossedUnder(reflexValue, 0),
      crossedOver(trendflexValue, 0), crossedUnder(trendflexValue, 0),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Reflex & Trendflex: Above +Threshold', message: 'xFlex: oscillator crossed above +threshold' },
  { id: 'alert1', title: 'Reflex & Trendflex: Below -Threshold', message: 'xFlex: oscillator crossed below -threshold' },
  { id: 'alert2', title: 'Reflex & Trendflex: Reflex Above Zero', message: 'xFlex: Reflex crossed above zero' },
  { id: 'alert3', title: 'Reflex & Trendflex: Reflex Below Zero', message: 'xFlex: Reflex crossed below zero' },
  { id: 'alert4', title: 'Reflex & Trendflex: Trendflex Above Zero', message: 'xFlex: Trendflex crossed above zero' },
  { id: 'alert5', title: 'Reflex & Trendflex: Trendflex Below Zero', message: 'xFlex: Trendflex crossed below zero' },
];

export const ReflexTrendflex = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
