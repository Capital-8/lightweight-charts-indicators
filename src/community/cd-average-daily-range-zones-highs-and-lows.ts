/**
 * CD_Average Daily Range Zones
 *
 * Average daily range (ADR) levels around the open of the day. The daily range is high - low of a daily bar; the
 * 10-day and 5-day ADR are the averages of the ranges of the 10 / 5 days before the current day. The levels are
 * the daily open plus and minus half of each ADR, drawn as circles; a fill joins the two high levels (maroon) and
 * the two low levels (lime).
 *
 * Daily bars on an intraday chart: they are built from the chart bars (periods from the UTC calendar and the bars,
 * or the exchange calendar of the chart context, see src/anchor-period.ts). As in the original (a version 1
 * script), every chart bar of a day shows the values of that day: the daily open and the ranges of the days
 * before, all known from the first bar of the day. On daily charts the daily bars are the chart bars. A chart
 * timeframe above one day needs data that the bars do not carry: the port throws an Error.
 *
 * Reference: "CD_Average Daily Range Zones- highs and lows of the day" by cristian.d
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  color, timeframe, resample, mapToChart,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export type CdAverageDailyRangeZonesInputs = Record<string, never>;

export const defaultInputs: CdAverageDailyRangeZonesInputs = {};

export const inputConfig: InputConfig[] = [];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const RED = String(color.new('#FF0000', 35));
const GREEN = String(color.new('#008000', 35));
/** fill(..., color = lime) / fill(..., color = maroon): default fill transparency 90 */
const LIME_FILL = String(color.new('#00FF00', 90));
const MAROON_FILL = String(color.new('#800000', 90));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ADR High10', color: RED, lineWidth: 2, style: 'circles' },
  { id: 'plot1', title: 'ADR LOW10', color: GREEN, lineWidth: 2, style: 'circles' },
  { id: 'plot2', title: 'ADR High5', color: RED, lineWidth: 2, style: 'circles' },
  { id: 'plot3', title: 'ADR LOW5', color: GREEN, lineWidth: 2, style: 'circles' },
];

export const metadata = {
  title: 'CD_Average Daily Range Zones',
  shortTitle: 'CD_Daily High/Low Zones V01',
  overlay: true,
};

/**
 * security(tickerid, 'D', ...) on the chart symbol: the daily bars built from the chart bars, and the function that
 * brings one value per daily bar back to the chart bars. Version 1 rule: every chart bar of a day shows the value
 * of the day (no gaps).
 */
function dailyBars(bars: Bar[], context?: ChartContext): { htf: Bar[]; toChart: (values: number[]) => number[] } {
  const tf = 'D';
  const chart = chartTimeframe(bars, context);
  if (chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, toChart: (values) => values };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chart}": the bars do not carry that data.`);
  }
  const exchange = securityBars(bars, tf, context);
  const { bars: htf, group } = exchange ? { bars: exchange.htf, group: exchange.group } : resample(bars, periodStarts(bars, tf));
  // lookahead: every chart bar of a period shows the value of the period
  return { htf, toChart: (values) => mapToChart(values, group, [], true, false) };
}

export function calculate(
  bars: Bar[],
  _inputs: Partial<CdAverageDailyRangeZonesInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const { htf, toChart } = dailyBars(bars, chart);
  const m = htf.length;
  // dayrange = high - low of each daily bar
  const range = htf.map((b) => b.high - b.low);
  const r = (k: number, j: number) => (j - k >= 0 ? range[j - k] : NaN);
  const open: number[] = [];
  const adr10: number[] = [];
  const adr5: number[] = [];
  for (let j = 0; j < m; j++) {
    open.push(htf[j].open);
    // (r1+r2+...+r10) / 10 and (r1+...+r5) / 5, summed in the order of the source
    let s = r(1, j);
    for (let k = 2; k <= 5; k++) s += r(k, j);
    adr5.push(s / 5);
    for (let k = 6; k <= 10; k++) s += r(k, j);
    adr10.push(s / 10);
  }
  const OPEN = toChart(open);
  const A10 = toChart(adr10);
  const A5 = toChart(adr5);

  const plot = (values: number[], c: string) =>
    bars.map((b, i) => ({ time: b.time, value: Number.isFinite(values[i]) ? values[i] : NaN, color: c }));
  const high10 = OPEN.map((o, i) => o + A10[i] / 2);
  const low10 = OPEN.map((o, i) => o - A10[i] / 2);
  const high5 = OPEN.map((o, i) => o + A5[i] / 2);
  const low5 = OPEN.map((o, i) => o - A5[i] / 2);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: plot(high10, RED),
      plot1: plot(low10, GREEN),
      plot2: plot(high5, RED),
      plot3: plot(low5, GREEN),
    },
    fills: [
      // fill(adrlow10, adrlow5, color = lime)
      { plot1: 'plot1', plot2: 'plot3', options: { color: LIME_FILL } },
      // fill(adrhigh10, adrhigh5, color = maroon)
      { plot1: 'plot0', plot2: 'plot2', options: { color: MAROON_FILL } },
    ],
  };
}

export const CdAverageDailyRangeZones = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
