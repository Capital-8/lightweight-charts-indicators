/**
 * Elastic Volume Weighted Moving Average [LazyBear]
 *
 * EVWMA of the close: each bar moves the average by its volume share of the "floating shares" (the volume of the
 * last `length` bars, or the cumulative volume): evwma = evwma[1] * (shares - volume) / shares
 * + volume * close / shares. With `Draw Envelope` the same average of the high (red) and of the low (green) is drawn
 * around it.
 *
 * Reference: "Elastic Volume Weighted Moving Average [LazyBear]" by LazyBear
 */

import { ta, math, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface EVWMAEnvelopeInputs {
  /** length */
  length: number;
  /** Use Cumulative Volume */
  useCV: boolean;
  /** Draw Envelope */
  renderBands: boolean;
}

export const defaultInputs: EVWMAEnvelopeInputs = {
  length: 20,
  useCV: false,
  renderBands: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'length', defval: 20 },
  { id: 'useCV', type: 'bool', title: 'Use Cumulative Volume', defval: false },
  { id: 'renderBands', type: 'bool', title: 'Draw Envelope', defval: false },
];

/** Pine version 1 colours: maroon, red, green */
const MAROON = '#800000';
const RED = '#FF0000';
const GREEN = '#008000';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'evwma', color: MAROON, lineWidth: 2 },
  { id: 'plot1', title: 'evwma+', color: RED, lineWidth: 2 },
  { id: 'plot2', title: 'evwma-', color: GREEN, lineWidth: 2 },
];

export const metadata = {
  title: 'Elastic Volume Weighted Moving Average [LazyBear]',
  shortTitle: 'EVWMA_LB',
  overlay: true,
};

/** nz(): na (also an infinite value of a division by 0) -> 0 */
const nz = (v: number) => (Number.isFinite(v) ? v : 0);

export function calculate(bars: Bar[], inputs: Partial<EVWMAEnvelopeInputs> = {}): IndicatorResult {
  const { length, useCV, renderBands } = { ...defaultInputs, ...inputs };
  const volume = bars.map((b) => b.volume ?? NaN);
  // nbfs = useCV ? cum(volume) : sum(volume, length)
  const nbfs = (useCV ? ta.cum(Series.fromArray(bars, volume)).toArray() : math.sum(volume, length) as number[])
    .map((v) => v ?? NaN);

  // calc_evwma(price, length, nb_floating_shares): each call keeps its own `data` history
  const evwma = (price: (b: Bar) => number): number[] => {
    const out: number[] = new Array(bars.length);
    let prev = NaN;
    for (let i = 0; i < bars.length; i++) {
      const v = volume[i];
      const data = (nz(prev) * (nbfs[i] - v)) / nbfs[i] + (v * price(bars[i])) / nbfs[i];
      out[i] = Number.isFinite(data) ? data : NaN;
      prev = data;
    }
    return out;
  };

  const m = evwma((b) => b.close);
  const upper = renderBands ? evwma((b) => b.high) : null;
  const lower = renderBands ? evwma((b) => b.low) : null;
  const line = (v: number[] | null) => bars.map((b, i) => ({ time: b.time, value: v ? v[i] : NaN }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: line(m), plot1: line(upper), plot2: line(lower) },
  };
}

export const EVWMAEnvelope = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
