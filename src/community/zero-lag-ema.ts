/**
 * Almost Zero Lag EMA
 *
 * ema1 = ema(close, length), ema2 = ema(ema1, length); the line is ema1 + (ema1 - ema2), a double EMA that takes
 * back most of the EMA lag.
 *
 * Reference: "Almost Zero Lag EMA [LazyBear]" by LazyBear
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: @author LazyBear
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface ZeroLagEMAInputs {
  /** EMA length */
  length: number;
}

export const defaultInputs: ZeroLagEMAInputs = {
  length: 10,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'length', defval: 10 },
];

// Pine v1 default plot colour (blue #0000FF) with the v1 default plot transparency of 35
const LINE = String(color.new('#0000FF', 35));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: LINE, lineWidth: 1 },
];

export const metadata = {
  title: 'Almost Zero Lag EMA [LazyBear]',
  shortTitle: 'ZeroLagEMA_LB',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<ZeroLagEMAInputs> = {}): IndicatorResult {
  const { length } = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const ema1 = A(ta.ema(Series.fromArray(bars, bars.map((b) => b.close)), length));
  const ema2 = A(ta.ema(Series.fromArray(bars, ema1), length));

  const plot0 = bars.map((b, i) => {
    const zlema = ema1[i] + (ema1[i] - ema2[i]);
    return { time: b.time, value: Number.isFinite(zlema) ? zlema : NaN };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
  };
}

export const ZeroLagEMA = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
