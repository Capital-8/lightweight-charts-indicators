/**
 * Elliot Wave Oscillator [LazyBear]
 *
 * EMA(close, 5) - EMA(close, 35), drawn as a histogram: lime above zero, red at zero and below.
 *
 * Reference: "Elliot Wave Oscillator [LazyBear]" by LazyBear
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

// The original has no input
export type ElliottWaveOscillatorLazybearInputs = Record<string, never>;

export const defaultInputs: ElliottWaveOscillatorLazybearInputs = {};

export const inputConfig: InputConfig[] = [];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const RED = V1('#FF0000');
const LIME = V1('#00FF00');

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EWO', color: LIME, lineWidth: 2, style: 'histogram' },
];

export const metadata = {
  title: 'Elliot Wave Oscillator [LazyBear]',
  shortTitle: 'EWO_LB',
  overlay: false,
};

export function calculate(bars: Bar[], _inputs: Partial<ElliottWaveOscillatorLazybearInputs> = {}): IndicatorResult {
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const fast = ta.ema(close, 5).toArray();
  const slow = ta.ema(close, 35).toArray();
  const plot0 = bars.map((b, i) => {
    const s2 = (fast[i] ?? NaN) - (slow[i] ?? NaN);
    // c_color = s2 <= 0 ? red : lime (Pine float comparison: within 1e-10 of zero counts as zero; na gives lime)
    return { time: b.time, value: s2, color: !isNaN(s2) && !(s2 > 1e-10) ? RED : LIME };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
  };
}

export const ElliottWaveOscillatorLazybear = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
