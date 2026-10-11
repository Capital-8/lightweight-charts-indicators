/**
 * Slow Stochastic
 *
 * Stochastic of the close over the high / low range of `smoothK` bars, smoothed with a 3-bar simple average (%K),
 * and the simple average of %K over `smoothD` bars (%D). Two levels at 80 and 20 with a light purple background
 * between them.
 *
 * Reference: "Slow Stochastic" by Oshri17
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar,
} from 'oakscriptjs';

export interface SlowStochasticInputs {
  /** Bars of the stochastic range */
  smoothK: number;
  /** Bars of the %D average */
  smoothD: number;
}

export const defaultInputs: SlowStochasticInputs = {
  smoothK: 14,
  smoothD: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'smoothK', type: 'int', title: 'smoothK', defval: 14, min: 1 },
  { id: 'smoothD', type: 'int', title: 'smoothD', defval: 3, min: 1 },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const BLACK = V1('#000000');
const RED = V1('#FF0000');
const LEVEL = '#787B86';
/** fill(h0, h1, color = purple, transp = 95) */
const BACKGROUND = String(color.new('#800080', 95));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '%K', color: BLACK, lineWidth: 1 },
  { id: 'plot1', title: '%D', color: RED, lineWidth: 1 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_0', price: 80, title: 'Level', color: LEVEL, linestyle: 'dashed' },
  { id: 'hline_1', price: 20, title: 'Level', color: LEVEL, linestyle: 'dashed' },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill_0', plot1: 'hline_0', plot2: 'hline_1', color: BACKGROUND, title: 'Hlines Background' },
];

export const metadata = {
  title: 'Slow Stochastic',
  shortTitle: 'SlowStoch',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<SlowStochasticInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const smoothK = Math.trunc(cfg.smoothK);
  const smoothD = Math.trunc(cfg.smoothD);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const close = new Series(bars, (b) => b.close);
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);

  // k = sma(stoch(close, high, low, smoothK), 3); d = sma(k, smoothD)
  const kSeries = ta.sma(ta.stoch(close, high, low, smoothK), 3);
  const k = A(kSeries);
  const d = A(ta.sma(kSeries, smoothD));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: k[i], color: BLACK })),
      plot1: bars.map((b, i) => ({ time: b.time, value: d[i], color: RED })),
    },
    hlines: [
      { value: 80, options: { title: 'Level', color: LEVEL, linestyle: 'dashed' } },
      { value: 20, options: { title: 'Level', color: LEVEL, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_0', plot2: 'hline_1', options: { title: 'Hlines Background', color: BACKGROUND } },
    ],
  };
}

export const SlowStochastic = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
};
