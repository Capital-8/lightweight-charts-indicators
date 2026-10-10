/**
 * Pivot Point
 *
 * Floor-trader pivots of the previous day: PP = (high + low + close) / 3 of the previous day, then three supports
 * and three resistances: R1 = 2 PP - low, S1 = 2 PP - high, R2 = PP + (high - low), S2 = PP - (high - low),
 * R3 = high + 2 (PP - low), S3 = low - 2 (high - PP). The pivot itself is not plotted.
 *
 * The daily bars are built from the chart bars (days from the UTC calendar and the bars, see src/anchor-period.ts);
 * every chart bar of a day shows the levels of that day, and the first day of the data has none. A chart timeframe
 * above one day needs data that the bars do not carry: the port throws an Error.
 * The line width input is not applied (the plot width is static: the default, 2).
 *
 * Reference: "Pivot Point" by HPotter
 * Original notice: Copyright by HPotter v1.0 10/07/2014
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { periodStarts, chartTimeframe } from '../anchor-period';

export interface PivotPointHpotterInputs {
  /** Line width of the plots */
  width: number;
}

export const defaultInputs: PivotPointHpotterInputs = {
  width: 2,
};

export const inputConfig: InputConfig[] = [
  { id: 'width', type: 'int', title: 'width', defval: 2, min: 1 },
];

// Default plot transparency of Pine version 1 (35)
const V1 = (hex: string) => String(color.new(hex, 35));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'S1', color: V1('#ff0000'), lineWidth: 2, style: 'circles' },
  { id: 'plot1', title: 'S2', color: V1('#ff002a'), lineWidth: 2, style: 'circles' },
  { id: 'plot2', title: 'S3', color: V1('#ff014a'), lineWidth: 2, style: 'circles' },
  { id: 'plot3', title: 'R1', color: V1('#009600'), lineWidth: 2, style: 'circles' },
  { id: 'plot4', title: 'R2', color: V1('#006F00'), lineWidth: 2, style: 'circles' },
  { id: 'plot5', title: 'R3', color: V1('#004900'), lineWidth: 2, style: 'circles' },
];

export const metadata = {
  title: 'Pivot Point',
  shortTitle: 'Pivot Point',
  overlay: true,
};

/**
 * security(tickerid, "D", x[1]) for x = high, low, close: the high, low and close of the previous day on every
 * chart bar of a day (version 1 rule: no gaps, each chart bar of a period shows the value of that period).
 */
function previousDay(bars: Bar[]): { high: number[]; low: number[]; close: number[] } {
  const chart = chartTimeframe(bars);
  if (chart !== '' && timeframe.in_seconds(chart) > timeframe.in_seconds('D')) {
    throw new Error(`Pivot Point: the daily timeframe is lower than the chart timeframe "${chart}": the bars do not carry that data.`);
  }
  const starts = periodStarts(bars, 'D');
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  let prev = { high: NaN, low: NaN, close: NaN };
  let day = { high: NaN, low: NaN, close: NaN };
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      prev = day;
      day = { high: b.high, low: b.low, close: b.close };
    } else {
      day.high = Math.max(day.high, b.high);
      day.low = Math.min(day.low, b.low);
      day.close = b.close;
    }
    high.push(prev.high);
    low.push(prev.low);
    close.push(prev.close);
  });
  return { high, low, close };
}

export function calculate(bars: Bar[], _inputs: Partial<PivotPointHpotterInputs> = {}): IndicatorResult {
  const { high: xHigh, low: xLow, close: xClose } = previousDay(bars);

  const vPP = bars.map((_b, i) => (xHigh[i] + xLow[i] + xClose[i]) / 3);
  const series = (value: (i: number) => number) => bars.map((b, i) => ({ time: b.time, value: value(i) }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: series((i) => vPP[i] - (xHigh[i] - vPP[i])),
      plot1: series((i) => vPP[i] - (xHigh[i] - xLow[i])),
      plot2: series((i) => xLow[i] - 2 * (xHigh[i] - vPP[i])),
      plot3: series((i) => vPP[i] + (vPP[i] - xLow[i])),
      plot4: series((i) => vPP[i] + (xHigh[i] - xLow[i])),
      plot5: series((i) => xHigh[i] + 2 * (vPP[i] - xLow[i])),
    },
  };
}

export const PivotPointHpotter = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
