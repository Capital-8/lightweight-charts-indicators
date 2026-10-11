/**
 * Zero Lag HMA Trend Suite
 *
 * Hull moving average WMA(2 * WMA(source, ceil(length / 2)) - WMA(source, length), round(sqrt(length))), drawn as
 * nine stacked lines of growing width and transparency (a glow) in the slope colour: teal when the HMA is above its
 * value `slopeIndex` bars ago, purple otherwise. The price bars take the same colour. Optional signals: Buy / Sell
 * labels when the source crosses under the HMA - multiplier * ATR / over the HMA + multiplier * ATR, reversal circles
 * on the opposite crosses. Optional VWAP ribbon: the session VWAP (anchored on each new day) drawn as two wide
 * translucent lines, teal when it is below the HMA and purple when it is above.
 * The VWAP day: on intraday bars the port reads the exchange time zone and the session of the symbol from the
 * optional third argument (see src/chart-context.ts) and starts the VWAP with the trading day of the exchange, as
 * the original. Without them the day starts at 00:00 UTC.
 *
 * Reference: "Uptrick: Zero Lag HMA Trend Suite" by Uptrick
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import type { ChartContext } from '../chart-context';
import { executeScript, timeframe as scriptTimeframe } from 'oakscriptjs/script';
import { barInterval } from '../bar-time';

export interface ZeroLagHMATrendSuiteInputs {
  /** HMA length */
  length: number;
  /** Source */
  source: SourceType;
  /** ATR length of the signal thresholds */
  atrLength: number;
  /** ATR multiplier of the signal thresholds */
  signalMultiplier: number;
  /** Show the Buy / Sell labels */
  showBuySellSignals: boolean;
  /** Show the reversal circles */
  showReversalSignals: boolean;
  /** Show the bull / bear VWAP ribbon */
  showVWAP: boolean;
  /** Slope colouring: the HMA is compared with its value this many bars ago */
  slopeIndex: number;
}

export const defaultInputs: ZeroLagHMATrendSuiteInputs = {
  length: 21,
  source: 'close',
  atrLength: 14,
  signalMultiplier: 1.5,
  showBuySellSignals: false,
  showReversalSignals: false,
  showVWAP: false,
  slopeIndex: 1,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'HMA Length', defval: 21, min: 1 },
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'signalMultiplier', type: 'float', title: 'Signal Multiplier', defval: 1.5, min: 0.1 },
  { id: 'showBuySellSignals', type: 'bool', title: 'Show Buy/Sell Signals', defval: false },
  { id: 'showReversalSignals', type: 'bool', title: 'Show Reversal Signals', defval: false },
  { id: 'showVWAP', type: 'bool', title: 'Show Bull/Bear VWAP Ribbon', defval: false },
  { id: 'slopeIndex', type: 'int', title: 'Slope Index Coloring', defval: 1 },
];

/** Line widths and transparencies of the nine HMA lines */
const HMA_LINES: [number, number][] = [[2, 0], [3, 20], [4, 40], [5, 60], [7, 80], [10, 85], [14, 90], [16, 95], [20, 97]];

export const plotConfig: PlotConfig[] = [
  ...HMA_LINES.map(([w], k) => ({ id: `plot${k}`, title: 'Zero Lag HMA', color: '#5CF0D7', lineWidth: w })),
  { id: 'plot9', title: 'Bullish VWAP', color: String(color.new('#5CF3DA', 70)), lineWidth: 20, style: 'linebr' },
  { id: 'plot10', title: 'Bullish VWAP', color: String(color.new('#5CF3DA', 80)), lineWidth: 60, style: 'linebr' },
  { id: 'plot11', title: 'Bearish VWAP', color: String(color.new('#B029C0', 70)), lineWidth: 20, style: 'linebr' },
  { id: 'plot12', title: 'Bearish VWAP', color: String(color.new('#B029C0', 80)), lineWidth: 60, style: 'linebr' },
];

export const metadata = {
  title: 'Zero Lag HMA Trend Suite',
  shortTitle: 'ZL HMA Trend Suite',
  overlay: true,
};

/** Pine float comparison: a > b only when a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;

/**
 * First bar of each trading day of the exchange on intraday bars (Pine timeframe.change("1D")), found by the library
 * from the time zone and the session of the chart context. Null when the context does not give both, or when the bars
 * are not intraday.
 */
function tradingDayStarts(bars: Bar[], chart?: ChartContext): boolean[] | null {
  const interval = barInterval(bars);
  if (chart?.timezone === undefined || chart.session === undefined || !(interval > 0 && interval < 86400)) return null;
  let change: Array<number | null> = [];
  const context = { ...chart, timeframe: chart.timeframe ?? timeframe.from_seconds(interval) };
  executeScript(() => { change = scriptTimeframe.change('1D').toArray(); }, bars, {}, context);
  return change.map((v) => v === 1);
}

/**
 * Start of a new day (Pine ta.vwap anchor: timeframe.change("1D")); true on the first bar. On intraday bars with the
 * time zone and the session of the chart context: the trading days of the exchange. Else: UTC days.
 */
function newDay(bars: Bar[], chart?: ChartContext): boolean[] {
  const starts = tradingDayStarts(bars, chart);
  return bars.map((b, i) => i === 0 || (starts ? starts[i] : Math.floor(b.time / 86400) !== Math.floor(bars[i - 1].time / 86400)));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ZeroLagHMATrendSuiteInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { length, atrLength, signalMultiplier, showBuySellSignals, showReversalSignals, showVWAP, slopeIndex } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const source = A(getSourceSeries(bars, cfg.source));
  // halfLength = math.ceil(length / 2); sqrtLength = math.round(math.sqrt(length))
  const halfLength = Math.ceil(length / 2);
  const sqrtLength = Math.round(Math.sqrt(length));
  const wma1 = A(ta.wma(S(source), halfLength));
  const wma2 = A(ta.wma(S(source), length));
  const hma = A(ta.wma(S(wma1.map((v, i) => 2 * v - wma2[i])), sqrtLength));

  // slopeUp = zeroLagHMA > zeroLagHMA[slopeIndex]
  const slopeColor = hma.map((v, i) => (gt(v, i >= slopeIndex ? hma[i - slopeIndex] : NaN) ? '#5CF0D7' : '#B32AC3'));

  const plots: Record<string, { time: number; value: number; color: string }[]> = {};
  HMA_LINES.forEach(([, transp], k) => {
    plots[`plot${k}`] = bars.map((b, i) => ({ time: b.time, value: hma[i], color: String(color.new(slopeColor[i], transp)) }));
  });

  // barcolor(slopeColor)
  const barColors: BarColorData[] = bars.map((b, i) => ({ time: b.time, color: slopeColor[i] }));

  // Signals: crossunder / crossover of the source with zeroLagHMA -/+ signalMultiplier * atr
  const atr = A(ta.atr(bars, atrLength));
  const lower = hma.map((v, i) => v - signalMultiplier * atr[i]);
  const upper = hma.map((v, i) => v + signalMultiplier * atr[i]);
  // ta.crossover / ta.crossunder compare exactly (no 1e-10 tolerance); na operands give false
  const crossover = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
  const crossunder = (a: number[], b: number[], i: number) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    if (showBuySellSignals && crossunder(source, lower, i)) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: '#40a998', text: '𝓤𝓹', textColor: '#FFFFFF' });
    }
    if (showBuySellSignals && crossover(source, upper, i)) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: String(color.new('#B32AC3', 0)), text: '𝓓𝓸𝔀𝓷', textColor: '#FFFFFF' });
    }
    if (showReversalSignals && crossover(source, lower, i)) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: String(color.new('#58EDD4C3', 0)), text: 'B', textColor: '#FFFFFF', size: 'small' });
    }
    if (showReversalSignals && crossunder(source, upper, i)) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: String(color.new('#B129C0C3', 0)), text: 'B', textColor: '#FFFFFF', size: 'small' });
    }
  }

  // vwap = ta.vwap (hlc3, anchored on each new day); bullishVWAP = vwap < zeroLagHMA; bearishVWAP = vwap > zeroLagHMA
  const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
  const vwap = A(ta.vwap(S(hlc3), S(bars.map((b) => b.volume ?? NaN)), S(newDay(bars, chart).map(Number))));
  const bullish = vwap.map((v, i) => showVWAP && gt(hma[i], v));
  const bearish = vwap.map((v, i) => showVWAP && gt(v, hma[i]));
  const ribbon = (on: boolean[], col: string, transp: number) =>
    bars.map((b, i) => ({ time: b.time, value: showVWAP && on[i] ? vwap[i] : NaN, color: String(color.new(col, transp)) }));
  plots.plot9 = ribbon(bullish, '#5CF3DAEB', 70);
  plots.plot10 = ribbon(bullish, '#5CF3DAEB', 80);
  plots.plot11 = ribbon(bearish, '#B029C0EB', 70);
  plots.plot12 = ribbon(bearish, '#B029C0EB', 80);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    barColors,
  };
}

export const ZeroLagHMATrendSuite = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
