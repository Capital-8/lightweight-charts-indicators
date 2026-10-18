/**
 * Fourier Series Model of the Market
 *
 * The 2-bar momentum of the source (source - source[2], na as 0) goes through one second-order IIR bandpass filter
 * per harmonic h = 1..N, tuned to the period `period / h` with the bandwidth parameter:
 * value = a * input + b * value[1] - c * value[2] (a = 0.5 * (1 - d), b = cos(w) * (1 + d), c = d, with
 * d = 1 / cos(bw * w) - sqrt(1 / cos(bw * w)^2 - 1)). Each harmonic keeps a rolling energy over `period` bars
 * (value^2 + (period / 2pi * (value - value[1]))^2). The wave is the first harmonic plus each higher harmonic scaled
 * by sqrt(its energy / the energy of the harmonic before). The quadrature is period / 4pi * (wave - wave[2]).
 * Optional threshold bands: k * 0.6745 * stdev (MAD mode), k * stdev, or a percentile (nearest rank) of |wave|.
 * Alerts (alertcondition, `alerts` of the result): the wave crossing the bands (when they are shown) and zero.
 *
 * Reference: "Fourier Series Model of the Market" by e2e4
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FourierSeriesModelOfTheMarketInputs {
  /** Price series to decompose into harmonic components */
  src: SourceType;
  /** Base period of the fundamental harmonic */
  period: number;
  /** Bandpass filter selectivity */
  bandwidth: number;
  /** Number of harmonic components */
  numHarmonics: number;
  showWave: boolean;
  colorWave: string;
  showRoc: boolean;
  colorRoc: string;
  showZeroLine: boolean;
  colorZeroLine: string;
  showThreshold: boolean;
  colorThresholdTop: string;
  colorThresholdBottom: string;
  thresholdMode: 'MAD' | 'Standard Deviation' | 'Percentile Rank';
  thresholdPeriod: number;
  thresholdMultiplier: number;
  thresholdPercentile: number;
}

export const defaultInputs: FourierSeriesModelOfTheMarketInputs = {
  src: 'close',
  period: 20,
  bandwidth: 0.1,
  numHarmonics: 3,
  showWave: true,
  colorWave: '#FF5933',
  showRoc: true,
  colorRoc: '#3A6DFF',
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

const G_MODEL = '》 FOURIER SERIES MODEL     ───────────────────────────────────────────     ';
const G_DISP = '》 DISPLAY SETTINGS     ───────────────────────────────────────────     ';
const G_DIAG = '》 DIAGNOSTICS     ───────────────────────────────────────────     ';

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: G_MODEL,
    tooltip: 'Price series to decompose into harmonic components' },
  { id: 'period', type: 'int', title: 'Period', defval: 20, min: 6, max: 100, step: 1, group: G_MODEL,
    tooltip: 'Base period for fundamental harmonic. Higher harmonics divide this period (e.g., harmonic 2 = period/2)' },
  { id: 'bandwidth', type: 'float', title: 'Bandwidth', defval: 0.1, min: 0.05, max: 0.5, step: 0.05, group: G_MODEL,
    tooltip: 'Bandpass filter selectivity. Lower = narrower passband, more precise harmonic isolation (0.05-0.5)' },
  { id: 'numHarmonics', type: 'int', title: 'Harmonics', defval: 3, min: 1, max: 20, step: 1, group: G_MODEL,
    tooltip: 'Number of harmonic components to extract. More harmonics capture finer detail but increase computation' },
  { id: 'showWave', type: 'bool', title: 'Wave outputs', defval: true, group: G_DISP, inline: 'DISP1' },
  { id: 'colorWave', type: 'color', title: '', defval: '#FF5933', group: G_DISP, inline: 'DISP1',
    tooltip: 'Show/hide the composite Fourier wave output' },
  { id: 'showRoc', type: 'bool', title: 'Quadrature (Rate of Change)', defval: true, group: G_DISP, inline: 'DISP2' },
  { id: 'colorRoc', type: 'color', title: '', defval: '#3A6DFF', group: G_DISP, inline: 'DISP2',
    tooltip: 'Show/hide the quadrature component (90° phase; scaled rate-of-change)' },
  { id: 'showZeroLine', type: 'bool', title: 'Zero Line', defval: true, group: G_DISP, inline: 'DISP3' },
  { id: 'colorZeroLine', type: 'color', title: '', defval: '#4DB8FF', group: G_DISP, inline: 'DISP3',
    tooltip: 'Show/hide zero reference line' },
  { id: 'showThreshold', type: 'bool', title: 'Dynamic Threshold', defval: true, group: G_DIAG, inline: 'DIAG1',
    tooltip: 'Show/hide dynamic threshold bands for identifying significant wave behavior' },
  { id: 'colorThresholdTop', type: 'color', title: '', defval: '#FFB340', group: G_DIAG, inline: 'DIAG1' },
  { id: 'colorThresholdBottom', type: 'color', title: '', defval: '#A6FF4D', group: G_DIAG, inline: 'DIAG1' },
  { id: 'thresholdMode', type: 'string', title: 'Threshold Mode', defval: 'MAD',
    options: ['MAD', 'Standard Deviation', 'Percentile Rank'], group: G_DIAG,
    tooltip: 'MAD (outlier-resistant), Standard deviation (volatility-sensitive), or Percentile rank (fixed probability)' },
  { id: 'thresholdPeriod', type: 'int', title: 'Period', defval: 50, min: 2, max: 200, step: 1, group: G_DIAG,
    tooltip: 'Lookback period for threshold calculations (2-200)' },
  { id: 'thresholdMultiplier', type: 'float', title: 'Multiplier (k)', defval: 1.5, min: 0.0, max: 5.0, step: 0.1, group: G_DIAG,
    tooltip: 'Scaling factor (k) for MAD/Standard deviation modes' },
  { id: 'thresholdPercentile', type: 'float', title: 'Percentile (%)', defval: 90.0, min: 0.0, max: 100.0, step: 0.5, group: G_DIAG,
    tooltip: 'Percentile of |wave| for threshold. E.g., 90% means only 10% of values exceed (0-100%)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Wave', color: '#FF5933', lineWidth: 2, visible: 'showWave' },
  { id: 'plot1', title: 'Rate of Change', color: '#3A6DFF', lineWidth: 1, visible: 'showRoc' },
  { id: 'plot2', title: 'Threshold +', color: '#FFB340', lineWidth: 1, visible: 'showThreshold' },
  { id: 'plot3', title: 'Threshold -', color: '#A6FF4D', lineWidth: 1, visible: 'showThreshold' },
];

export const metadata = {
  title: 'Fourier Series Model of the Market',
  shortTitle: 'FSMM',
  overlay: false,
};

const TWO_PI = 2.0 * Math.PI;
const FOUR_PI = 4.0 * Math.PI;
const MAD_SCALE = 0.6745;

export function calculate(bars: Bar[], inputs: Partial<FourierSeriesModelOfTheMarketInputs> = {}): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { period, bandwidth, numHarmonics } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const source = A(getSourceSeries(bars, cfg.src));
  const nz = (v: number) => (isNaN(v) ? 0 : v);

  // Harmonic states: bandpass coefficients (bandpassCoefficients(bandwidth, period, i)) and filter memory
  type Harmonic = { value: number; prev1: number; prev2: number; energy: number; coefA: number; coefB: number; coefC: number };
  const harmonics: Harmonic[] = [];
  for (let i = 0; i <= numHarmonics - 1; i++) {
    const angularFreq = TWO_PI / (period / (i + 1));
    const freqCos = Math.cos(angularFreq);
    const bandwidthCos = Math.cos(bandwidth * angularFreq);
    const discriminant = 1.0 / (bandwidthCos * bandwidthCos) - 1.0;
    const damping = 1.0 / bandwidthCos - Math.sqrt(discriminant);
    harmonics.push({ value: 0, prev1: 0, prev2: 0, energy: 0,
      coefA: 0.5 * (1.0 - damping), coefB: freqCos * (1.0 + damping), coefC: damping });
  }
  // Flattened energy ring buffer: index = harmonic * period + ringIndex
  const energyBuffer = new Array<number>(numHarmonics * period).fill(0.0);
  let ringIndex = 0;
  const rateScale = period / TWO_PI;

  const wave: number[] = new Array(n);
  for (let k = 0; k < n; k++) {
    // Debias: 2-bar momentum
    const input = nz(source[k]) - nz(k >= 2 ? source[k - 2] : NaN);
    let w = 0.0;
    let prevEnergy = 0.0;
    for (let i = 0; i < harmonics.length; i++) {
      const h = harmonics[i];
      // computeHarmonic
      const value = h.coefA * input + h.coefB * h.prev1 - h.coefC * h.prev2;
      const rate = rateScale * (value - h.prev1);
      const energy = value * value + rate * rate;
      h.prev2 = h.prev1;
      h.prev1 = value;
      h.value = value;
      const idx = i * period + ringIndex;
      const oldEnergy = energyBuffer[idx];
      energyBuffer[idx] = energy;
      h.energy += energy - oldEnergy;
      // Weighted synthesis (a plain division: x / 0 is +-infinity, 0 / 0 NaN, as Pine)
      if (i === 0) w = h.value;
      else w += Math.sqrt(h.energy / prevEnergy) * h.value;
      prevEnergy = h.energy;
    }
    ringIndex = (ringIndex + 1) % period;
    wave[k] = w;
  }

  // computeQuadrature(wave, period): period / 4pi * (wave - nz(wave[2]))
  const quadScale = period / FOUR_PI;
  const roc = wave.map((w, k) => quadScale * (w - nz(k >= 2 ? wave[k - 2] : NaN)));

  // threshold(wave, mode, thresholdPeriod, k, percentile), only when showThreshold (var float thresholdVal = na)
  let threshold: number[] = new Array(n).fill(NaN);
  if (cfg.showThreshold) {
    const waveSeries = Series.fromArray(bars, wave);
    if (cfg.thresholdMode === 'MAD') {
      threshold = A(ta.stdev(waveSeries, cfg.thresholdPeriod)).map((s) => cfg.thresholdMultiplier * (MAD_SCALE * s));
    } else if (cfg.thresholdMode === 'Standard Deviation') {
      threshold = A(ta.stdev(waveSeries, cfg.thresholdPeriod)).map((s) => cfg.thresholdMultiplier * s);
    } else {
      threshold = A(ta.percentile_nearest_rank(Series.fromArray(bars, wave.map((w) => Math.abs(w))),
        cfg.thresholdPeriod, cfg.thresholdPercentile));
    }
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: cfg.showWave ? fin(wave[i]) : NaN, color: cfg.colorWave })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.showRoc ? fin(roc[i]) : NaN, color: cfg.colorRoc })),
      plot2: bars.map((b, i) => ({ time: b.time, value: cfg.showThreshold ? fin(threshold[i]) : NaN, color: cfg.colorThresholdTop })),
      plot3: bars.map((b, i) => ({ time: b.time, value: cfg.showThreshold ? fin(-threshold[i]) : NaN, color: cfg.colorThresholdBottom })),
    },
    // hline(showZeroLine ? 0 : na, 'Zero', colorZeroLine, display = showZeroLine ? display.all : display.none)
    hlines: cfg.showZeroLine
      ? [{ value: 0, options: { title: 'Zero', color: cfg.colorZeroLine, linestyle: 'dashed' } }]
      : [],
    // crossedAboveThreshold = showThreshold and ta.crossover(wave, thresholdVal); crossedBelowThreshold = showThreshold
    // and ta.crossunder(wave, -thresholdVal); ta.crossover / crossunder(wave, 0)
    alerts: alertStates(alertConditions, bars, [
      crossedOver(wave, threshold).map((c) => cfg.showThreshold && c),
      crossedUnder(wave, threshold.map((v) => -v)).map((c) => cfg.showThreshold && c),
      crossedOver(wave, 0),
      crossedUnder(wave, 0),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'FSMM: Above +Threshold', message: 'FSMM: wave crossed above +threshold' },
  { id: 'alert1', title: 'FSMM: Below -Threshold', message: 'FSMM: wave crossed below -threshold' },
  { id: 'alert2', title: 'FSMM: Above Zero', message: 'FSMM: wave crossed above zero' },
  { id: 'alert3', title: 'FSMM: Below Zero', message: 'FSMM: wave crossed below zero' },
];

export const FourierSeriesModelOfTheMarket = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
