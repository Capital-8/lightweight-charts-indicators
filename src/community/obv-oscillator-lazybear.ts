/**
 * On Balance Volume Oscillator [LazyBear]
 *
 * On balance volume (running sum of the volume, added on a higher close and subtracted on a lower close) minus its
 * EMA. The line is green above zero and red at zero and below; the same value is also drawn as a silver area.
 *
 * Reference: "On Balance Volume Oscillator [LazyBear]" by LazyBear
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';

export interface ObvOscillatorLazybearInputs {
  /** EMA length */
  length: number;
}

export const defaultInputs: ObvOscillatorLazybearInputs = {
  length: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'length', defval: 20 },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const GREEN = V1('#008000');
const RED = V1('#FF0000');
// plot(..., color = silver, transp = 70)
const SILVER = String(color.new('#C0C0C0', 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'OBV-Points', color: GREEN, lineWidth: 2 },
  { id: 'plot1', title: 'OBV', color: SILVER, lineWidth: 1, style: 'area' },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_0', price: 0, color: '#787B86', linestyle: 'dashed', linewidth: 1, title: 'Level' },
];

export const metadata = {
  title: 'On Balance Volume Oscillator [LazyBear]',
  shortTitle: 'OBVOSC_LB',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(bars: Bar[], inputs: Partial<ObvOscillatorLazybearInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  // obv(src) => cum(change(src) > 0 ? volume : change(src) < 0 ? -volume : 0 * volume)
  const step = bars.map((b, i) => {
    const change = i > 0 ? b.close - bars[i - 1].close : NaN;
    const volume = b.volume ?? NaN;
    return gt(change, 0) ? volume : lt(change, 0) ? -volume : 0 * volume;
  });
  const os = ta.cum(Series.fromArray(bars, step));
  const osValues = os.toArray();
  const average = ta.ema(os, cfg.length).toArray();

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: Array<{ time: number; value: number }> = [];
  bars.forEach((b, i) => {
    const osc = (osValues[i] ?? NaN) - (average[i] ?? NaN);
    // obc_color = obv_osc > 0 ? green : red
    plot0.push({ time: b.time, value: osc, color: gt(osc, 0) ? GREEN : RED });
    plot1.push({ time: b.time, value: osc });
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [{ value: 0, options: { title: 'Level', color: '#787B86', linestyle: 'dashed', linewidth: 1 } }],
  };
}

export const ObvOscillatorLazybear = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig };
