/**
 * BTCUSDSHORTS BTCUSDLONGS - Bitfinex BTC Shorts & Longs
 *
 * Plots the close of the Bitfinex margin short and margin long positions (the symbols BITFINEX:BTCUSDSHORTS and
 * BITFINEX:BTCUSDLONGS) on the chart timeframe. The values come from the bars of those two symbols in the chart
 * context (`chart.bars`): without them `calculate` throws a `MissingSymbolDataError`. Each chart bar shows the last
 * bar of the other symbol that closed at or before it (no lookahead, no gaps).
 *
 * Reference: "BTCUSDSHORTS BTCUSDLONGS - Bitfinex BTC Shorts & Longs" by autemox
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type Bar, type IndicatorResult, type InputConfig, type PlotConfig } from 'oakscriptjs';
import { symbolBarsOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { chartTimeframe } from '../anchor-period';
import { otherSymbolChart, securityOtherValues } from '../other-symbol';

export type BitfinexBtcShortsLongsInputs = Record<string, never>;

export const defaultInputs: BitfinexBtcShortsLongsInputs = {};

export const inputConfig: InputConfig[] = [];

/** Plot colours of a Pine v3 script: transparency 35 */
const RED = String(color.new('#FF0000', 35));
const GREEN = String(color.new('#008000', 35));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bitfinex Shorts', color: RED, lineWidth: 1 },
  { id: 'plot1', title: 'Bitfinex Longs', color: GREEN, lineWidth: 1 },
];

export const metadata = {
  title: 'BTCUSDSHORTS BTCUSDLONGS - Bitfinex BTC Shorts & Longs',
  shortTitle: 'BTCUSDSHORTS BTCUSDLONGS - Bitfinex BTC Shorts & Longs',
  overlay: false,
};

const SHORTS = 'BITFINEX:BTCUSDSHORTS';
const LONGS = 'BITFINEX:BTCUSDLONGS';

/** Bars of other symbols the indicator needs: the two Bitfinex symbols on the chart timeframe (`period`). */
export function requiredSymbols(_inputs: Partial<BitfinexBtcShortsLongsInputs> = {}, chart?: ChartContext): SymbolRequest[] {
  const tf = chartTimeframe([], chart);
  return [{ symbol: SHORTS, timeframe: tf }, { symbol: LONGS, timeframe: tf }];
}

export function calculate(
  bars: Bar[],
  _inputs: Partial<BitfinexBtcShortsLongsInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const tf = chartTimeframe(bars, chart);
  const [shortBars, longBars] = symbolBarsOf([{ symbol: SHORTS, timeframe: tf }, { symbol: LONGS, timeframe: tf }], chart);
  // shorts = pow(security("BITFINEX:BTCUSDSHORTS", period, close), 1.0)
  const closes = (other: ReadonlyArray<Bar>) => other.map((b) => b.close);
  const shorts = securityOtherValues(bars, shortBars, '', closes(shortBars), otherSymbolChart(bars, chart), { other: chart?.symbolInfo?.(SHORTS) })
    .map((v) => Math.pow(v, 1.0));
  const longs = securityOtherValues(bars, longBars, '', closes(longBars), otherSymbolChart(bars, chart), { other: chart?.symbolInfo?.(LONGS) })
    .map((v) => Math.pow(v, 1.0));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: shorts[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: longs[i] })),
    },
  };
}

export const BitfinexBtcShortsLongs = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
};
