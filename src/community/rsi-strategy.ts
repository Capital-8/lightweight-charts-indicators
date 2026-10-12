/**
 * RSI Strategy (bar colours)
 *
 * RSI of the close. The state is 1 when the RSI is above the overbought level, -1 when it is below the oversold
 * level, and keeps its previous value (0 at the start) in between. Bars are coloured red for -1, green for 1 and
 * blue otherwise. No plot.
 *
 * Reference: "Strategy RSI" by HPotter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright by HPotter v1.0 19/05/2014
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';

export interface RsiStrategyInputs {
  length: number;
  oversold: number;
  overbought: number;
}

export const defaultInputs: RsiStrategyInputs = {
  length: 12,
  oversold: 30,
  overbought: 70,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 12, min: 1 },
  { id: 'oversold', type: 'int', title: 'Oversold', defval: 30, min: 1 },
  { id: 'overbought', type: 'int', title: 'Overbought', defval: 70, min: 1 },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Strategy RSI',
  shortTitle: 'Strategy RSI',
  overlay: true,
};

// Pine comparison: a > b only when a - b > 1e-10; na compares false
const EPS = 1e-10;

export function calculate(bars: Bar[], inputs: Partial<RsiStrategyInputs> = {}): Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[] } {
  const { length, oversold, overbought } = { ...defaultInputs, ...inputs };
  const rsi = ta.rsi(new Series(bars, (b) => b.close), length).toArray();

  const barColors: BarColorData[] = [];
  let pos = 0;
  for (let i = 0; i < bars.length; i++) {
    const r = rsi[i];
    const v = r == null || Number.isNaN(r) ? NaN : r;
    if (v - overbought > EPS) pos = 1;
    else if (oversold - v > EPS) pos = -1;
    // else: nz(pos[1], 0), the previous value
    barColors.push({ time: bars[i].time as number, color: pos === -1 ? '#FF0000' : pos === 1 ? '#008000' : '#0000FF' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    barColors,
  };
}

export const RsiStrategy = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
