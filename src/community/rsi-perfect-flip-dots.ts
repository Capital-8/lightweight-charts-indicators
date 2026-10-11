/**
 * RSI PERFECT Flip Dots
 *
 * RSI of the source, then a fast EMA (5) and a slow EMA (14) of the RSI. An up arrow below the bar while the fast
 * EMA is above the slow EMA, a down arrow above the bar while it is below. A large green dot below the bar where the
 * fast EMA crosses over the slow EMA, a large red dot above the bar where it crosses under (confirmed bars only).
 *
 * Last bar: a buy / sell dot needs a closed bar. The port reads the state of the last bar from the optional third
 * argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "RSI (Kernel Optimized) | Flux Charts + PERFECT Flip Dots" by debanshuchanda6
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, getSourceSeries, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface RsiPerfectFlipDotsInputs {
  rsiLengthInput: number;
  rsiSourceInput: SourceType;
}

export const defaultInputs: RsiPerfectFlipDotsInputs = {
  rsiLengthInput: 14,
  rsiSourceInput: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLengthInput', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'rsiSourceInput', type: 'source', title: 'Source', defval: 'close' },
];

// No plot(): plotarrow and plotshape markers only
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'RSI (Kernel Optimized) | Flux Charts + PERFECT Flip Dots',
  shortTitle: 'RSI (Kernel Optimized) | Flux Charts + PERFECT Flip Dots',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiPerfectFlipDotsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const bullishColor = color.new('#089981', 0);
  const bearishColor = color.new('#f23646', 0);

  const rsi = ta.rsi(getSourceSeries(bars, cfg.rsiSourceInput), cfg.rsiLengthInput);
  const fastS = ta.ema(rsi, 5);
  const slowS = ta.ema(rsi, 14);
  const fast = A(fastS);
  const slow = A(slowS);

  // ta.crossover / ta.crossunder: exact comparisons (library functions)
  const bullFlip = A(ta.crossover(fastS, slowS));
  const bearFlip = A(ta.crossunder(fastS, slowS));

  const arrowUpColor = String(color.new(bullishColor, 70));
  const arrowDownColor = String(color.new(bearishColor, 70));
  const green = String(color.green);
  const red = String(color.red);

  const markers: MarkerData[] = [];
  bars.forEach((b, i) => {
    const bullCond = gt(fast[i], slow[i]);
    const bearCond = lt(fast[i], slow[i]);

    // plotarrow(bullCond ? 1 : na, colorup = color.new(bullishColor, 70)): arrow height not ported
    if (bullCond) markers.push({ time: b.time, position: 'belowBar', shape: 'arrowUp', color: arrowUpColor });
    // plotarrow(bearCond ? -1 : na, colordown = color.new(bearishColor, 70))
    if (bearCond) markers.push({ time: b.time, position: 'aboveBar', shape: 'arrowDown', color: arrowDownColor });

    const isConfirmed = barIsConfirmed(i); // barstate.isconfirmed
    const buySignal = isConfirmed && bullFlip[i] === 1;
    const sellSignal = isConfirmed && bearFlip[i] === 1;

    // plotshape(buySignal, location.belowbar, shape.circle, color.green, size.large, title = "Buy Dot")
    if (buySignal) markers.push({ time: b.time, position: 'belowBar', shape: 'circle', color: green, size: 'large' });
    // plotshape(sellSignal, location.abovebar, shape.circle, color.red, size.large, title = "Sell Dot")
    if (sellSignal) markers.push({ time: b.time, position: 'aboveBar', shape: 'circle', color: red, size: 'large' });
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
  };
}

export const RsiPerfectFlipDots = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
