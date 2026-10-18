/**
 * Whale Activity Impact Oscillator
 *
 * A bar is whale activity when its volume is above X times the SMA of the volume and its absolute close-to-close
 * change (in percent of the previous close, as a fraction) is above Y times the SMA of that change (over N bars).
 * The oscillator is the absolute change on a whale buy bar (change > 0), minus the absolute change on a whale sell
 * bar (change < 0) and 0 otherwise, drawn as green / red columns around a centre line at 0.
 * Alerts (alertcondition, `alerts` of the result): 'Whale Buying Detected' / 'Whale Selling Detected' on the whale buy
 * / sell bars.
 *
 * Reference: "Whale Activity Impact Oscillator" by mdeacey
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface WhaleActivityImpactOscillatorInputs {
  /** Volume Spike Multiplier (X) */
  volumeSpikeMultiplier: number;
  /** Price Spike Multiplier (Y) */
  priceSpikeMultiplier: number;
  /** Lookback Period (N) */
  lookbackPeriod: number;
  /** Minimum Volume Threshold (the Pine script sets it after the plot: no effect on the output) */
  minVolumeThreshold: number;
  /** Strong Buy Threshold (not used by the Pine script) */
  strongBuyThreshold: number;
  /** Strong Sell Threshold (not used by the Pine script) */
  strongSellThreshold: number;
}

export const defaultInputs: WhaleActivityImpactOscillatorInputs = {
  volumeSpikeMultiplier: 3.0,
  priceSpikeMultiplier: 2.0,
  lookbackPeriod: 50,
  minVolumeThreshold: 1000,
  strongBuyThreshold: 1.5,
  strongSellThreshold: -1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'volumeSpikeMultiplier', type: 'float', title: 'Volume Spike Multiplier (X)', defval: 3.0 },
  { id: 'priceSpikeMultiplier', type: 'float', title: 'Price Spike Multiplier (Y)', defval: 2.0 },
  { id: 'lookbackPeriod', type: 'int', title: 'Lookback Period (N)', defval: 50 },
  { id: 'minVolumeThreshold', type: 'float', title: 'Minimum Volume Threshold', defval: 1000 },
  { id: 'strongBuyThreshold', type: 'float', title: 'Strong Buy Threshold', defval: 1.5 },
  { id: 'strongSellThreshold', type: 'float', title: 'Strong Sell Threshold', defval: -1.5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Whale Activity Oscillator', color: color.green, lineWidth: 2, style: 'columns' },
];

export const metadata = {
  title: 'Whale Activity Impact Oscillator',
  shortTitle: 'Whale Oscillator',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<WhaleActivityImpactOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const S = (x: number[]) => Series.fromArray(bars, x);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const volume = bars.map((b) => b.volume ?? NaN);
  // ta.change(close) / close[1] (a plain division)
  const priceChange = bars.map((b, i) => (i > 0 ? (b.close - bars[i - 1].close) / bars[i - 1].close : NaN));
  const avgVolume = A(ta.sma(S(volume), cfg.lookbackPeriod));
  const avgPriceChange = A(ta.sma(S(priceChange), cfg.lookbackPeriod));

  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  const plot0 = bars.map((b, i) => {
    const volumeSpike = gt(volume[i], cfg.volumeSpikeMultiplier * avgVolume[i]);
    const pc = priceChange[i];
    const priceSpike = gt(Math.abs(pc), cfg.priceSpikeMultiplier * avgPriceChange[i]);
    const buySignal = volumeSpike && gt(pc, 0) && priceSpike;
    const sellSignal = volumeSpike && lt(pc, 0) && priceSpike;
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    const value = buySignal ? Math.abs(pc) : sellSignal ? -Math.abs(pc) : 0;
    const c = buySignal ? color.green : sellSignal ? color.red : null;
    // plot(oscillatorValue, style = plot.style_columns, color = barColor, linewidth = 2); the later
    // `if volume < minVolumeThreshold: oscillatorValue := 0` comes after the plot call
    return c === null ? { time: b.time, value } : { time: b.time, value, color: c };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines: [{ value: 0, options: { title: 'Center Line', color: color.gray, linewidth: 1, linestyle: 'solid' } }],
    markers: [],
    // alertcondition(buySignal, "Whale Buying Detected") / alertcondition(sellSignal, "Whale Selling Detected")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Whale Buying Detected', message: 'Whale buying detected!' },
  { id: 'alert1', title: 'Whale Selling Detected', message: 'Whale selling detected!' },
];

export const WhaleActivityImpactOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
