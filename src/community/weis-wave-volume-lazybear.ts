/**
 * Weis Wave Volume [LazyBear]
 *
 * The close direction (up / down, unchanged bars keep the last one) gives the trend. The wave follows the trend
 * once the close has been rising or falling over the detection length. The volume is summed while the wave keeps
 * its direction and starts again when the wave turns. Up waves are drawn as a green histogram, the other waves as a
 * red histogram (below zero for down waves when the option is on).
 *
 * Reference: "Weis Wave Volume [LazyBear]" by LazyBear
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface WeisWaveVolumeLazybearInputs {
  /** Number of bars the close must rise / fall to turn the wave */
  trendDetectionLength: number;
  /** Draw the volume of down waves below zero */
  showDistributionBelowZero: boolean;
}

export const defaultInputs: WeisWaveVolumeLazybearInputs = {
  trendDetectionLength: 2,
  showDistributionBelowZero: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'trendDetectionLength', type: 'int', title: 'trendDetectionLength', defval: 2 },
  { id: 'showDistributionBelowZero', type: 'bool', title: 'showDistributionBelowZero', defval: false },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Up', color: V1('#008000'), lineWidth: 3, style: 'histogram' },
  { id: 'plot1', title: 'Down', color: V1('#FF0000'), lineWidth: 3, style: 'histogram' },
];

export const metadata = {
  title: 'Weis Wave Volume [LazyBear]',
  shortTitle: 'WWV_LB',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(bars: Bar[], inputs: Partial<WeisWaveVolumeLazybearInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const rising = ta.rising(close, cfg.trendDetectionLength).toArray();
  const falling = ta.falling(close, cfg.trendDetectionLength).toArray();

  const plot0: Array<{ time: number; value: number }> = [];
  const plot1: typeof plot0 = [];
  let prevMov = NaN; // mov[1]
  let trend = 0; // nz(trend[1])
  let prevWave = NaN; // wave[1]
  let prevVol = NaN; // vol[1]
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const c1 = i > 0 ? bars[i - 1].close : NaN;
    const mov = gt(c, c1) ? 1 : lt(c, c1) ? -1 : 0;
    // trend = (mov != 0) and (mov != mov[1]) ? mov : nz(trend[1])
    if (mov !== 0 && !isNaN(prevMov) && mov !== prevMov) trend = mov;
    const isTrending = Boolean(rising[i]) || Boolean(falling[i]);
    // wave = (trend != nz(wave[1])) and isTrending ? trend : nz(wave[1])
    const wave1 = isNaN(prevWave) ? 0 : prevWave;
    const wave = trend !== wave1 && isTrending ? trend : wave1;
    // vol = wave == wave[1] ? (nz(vol[1]) + volume) : volume
    const volume = bars[i].volume ?? NaN;
    const vol = wave === prevWave ? (isNaN(prevVol) ? 0 : prevVol) + volume : volume;
    const up = wave === 1 ? vol : 0;
    const dn = cfg.showDistributionBelowZero ? (wave === 1 ? 0 : wave === -1 ? -vol : vol) : wave === 1 ? 0 : vol;
    plot0.push({ time: bars[i].time, value: up });
    plot1.push({ time: bars[i].time, value: dn });
    prevMov = mov;
    prevWave = wave;
    prevVol = vol;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
  };
}

export const WeisWaveVolumeLazybear = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
