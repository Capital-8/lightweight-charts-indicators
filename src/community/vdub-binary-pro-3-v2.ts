/**
 * VDUB_BINARY_PRO_3_V2
 *
 * Several tools on the price pane:
 * - a WMA of the close with bands at 2 and 3 times the WMA of the true range, with fills;
 * - a centre band: the SMA of the highs, the SMA of the lows and their middle;
 * - a base line: SMA(close, 3) and SMA(close, 13), with a circle where they cross;
 * - a large and a small channel: the high and the low of the bars of two other timeframes of the same symbol
 *   (drawn while they do not change), with triangles on the bars that reach the large channel;
 * - a zigzag: the lowest low / highest high on the bars where the RMA of hl2 turns up / down, and an optional
 *   second zigzag on the bars that reach the large channel.
 *
 * Other timeframes: the bars of the two channel timeframes are built from the chart bars (periods from the UTC
 * calendar and the bars, see src/anchor-period.ts). As in the original (a version 1 script), every chart bar of a
 * period shows the value of that period at its end (on past bars the value of a period is known from its first
 * bar; the last period is still open). A channel timeframe below the chart timeframe needs data that the bars do
 * not carry: the port throws an Error. With the default timeframes ("30" and "240") the chart must be 30 minutes
 * or lower.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "VDUB_BINARY_PRO_3_V2" by vdubus
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, timeframe, resample, mapToChart, type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface VdubBinaryPro3V2Inputs {
  /** WMA length of the close */
  length: number;
  /** WMA length of the true range */
  atrlen: number;
  /** Not used by the original */
  nlookback: number;
  /** Not used by the original */
  scale: number;
  /** Not used by the original */
  nATR: number;
  /** SMA length of the centre band */
  periods: number;
  /** Show the centre band */
  pc: boolean;
  /** Timeframe of the large channel ("30", "240", "D", "W", "M", ...) */
  lrgChannelTf: string;
  /** Number of bars (of the large channel timeframe) of the channel high / low */
  range2: number;
  /** Timeframe of the small channel */
  smlChannelTf: string;
  zigzagLength: number;
  /** Show the second zigzag */
  zigzag2: boolean;
}

export const defaultInputs: VdubBinaryPro3V2Inputs = {
  length: 56,
  atrlen: 100,
  nlookback: 20,
  scale: 1,
  nATR: 14,
  periods: 21,
  pc: true,
  lrgChannelTf: '30',
  range2: 1,
  smlChannelTf: '240',
  zigzagLength: 7,
  zigzag2: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'WMA Length', defval: 56, min: 1 },
  { id: 'atrlen', type: 'int', title: 'ATR Length', defval: 100, min: 1 },
  { id: 'nlookback', type: 'int', title: 'Number of Lookback', defval: 20, min: 1 },
  { id: 'scale', type: 'int', title: 'scale of ATR', defval: 1 },
  { id: 'nATR', type: 'int', title: 'ATR Parameter', defval: 14 },
  { id: 'periods', type: 'int', title: 'MA Period', defval: 21, min: 1 },
  { id: 'pc', type: 'bool', title: 'MA BAND', defval: true },
  { id: 'lrgChannelTf', type: 'string', title: 'LRG_Channel_TF_mins_D_W_M', defval: '30' },
  { id: 'range2', type: 'int', title: 'Range2', defval: 1 },
  { id: 'smlChannelTf', type: 'string', title: 'SML_Channel_TF_mins_D_W_M', defval: '240' },
  { id: 'zigzagLength', type: 'int', title: 'Zingzag_length', defval: 7 },
  { id: 'zigzag2', type: 'bool', title: 'Zigzag2', defval: false },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const RED_HEX = '#FF0000';
const GRAY_HEX = '#808080';
const WHITE = V1('#FFFFFF');
const RED = V1(RED_HEX);
const BLACK = V1('#000000');
const GREEN = V1('#008000');
const FUCHSIA = V1('#FF00FF');

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Band 1', color: WHITE, lineWidth: 1 },
  { id: 'plot1', title: 'Upper Band 2', color: WHITE, lineWidth: 1 },
  { id: 'plot2', title: 'Lower Band 1', color: WHITE, lineWidth: 1 },
  { id: 'plot3', title: 'Lower Band 2', color: WHITE, lineWidth: 1 },
  { id: 'plot4', title: 'Centre', color: RED, lineWidth: 4 },
  { id: 'plot5', title: 'Swing High Plot', color: BLACK, lineWidth: 1 },
  { id: 'plot6', title: 'Swing Low Plot', color: BLACK, lineWidth: 1 },
  { id: 'plot7', title: 'Short MA', color: RED, lineWidth: 2 },
  { id: 'plot8', title: 'Long MA', color: V1('#000080'), lineWidth: 4 },
  { id: 'plot9', title: 'MA Cross', color: V1('#0000FF'), lineWidth: 9, style: 'circles' },
  { id: 'plot10', title: 'Large Channel High', color: RED, lineWidth: 2 },
  { id: 'plot11', title: 'Large Channel Low', color: GREEN, lineWidth: 2 },
  { id: 'plot12', title: 'Small Channel High', color: FUCHSIA, lineWidth: 2 },
  { id: 'plot13', title: 'Small Channel Low', color: FUCHSIA, lineWidth: 2 },
  { id: 'plot14', title: 'Zigzag', color: BLACK, lineWidth: 1 },
  { id: 'plot15', title: 'Zigzag 2', color: RED, lineWidth: 3 },
];

// The last fill has transp = 100 in the original: it is not visible
export const fillConfig: FillConfig[] = [
  { id: 'fill0', plot1: 'plot1', plot2: 'plot0', color: String(color.new('#30628E', 80)), title: 'Plots Background' },
  { id: 'fill1', plot1: 'plot3', plot2: 'plot2', color: String(color.new('#30628E', 80)), title: 'Plots Background' },
  { id: 'fill2', plot1: 'plot2', plot2: 'plot0', color: String(color.new('#128E89', 80)), title: 'Plots Background' },
  { id: 'fill3', plot1: 'plot10', plot2: 'plot11', color: String(color.new('#E3CAF1', 100)), title: 'Plots Background' },
];

export const metadata = {
  title: 'VDUB_BINARY_PRO_3_V2',
  shortTitle: 'VDUB_BINARY_PRO_3_V2',
  overlay: true,
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** a != b: false when one side is na */
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

/**
 * security(tickerid, tf, ...) on the chart symbol: the bars of timeframe `tf` built from the chart bars, and the
 * function that brings one value per bar of that timeframe back to the chart bars. Version 1 rule: every chart bar
 * of a period shows the value of the period (no gaps).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; toChart: (values: number[]) => number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, toChart: (values) => values };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chart}": the bars do not carry that data.`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods and the bars that
  // complete them come from the library rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) {
    return { htf: exchange.htf, toChart: (values) => mapToChart(values, exchange.group, exchange.latest, true, false) };
  }
  // Without it: the periods of the UTC calendar rule (see anchor-period.ts), grouped by the library
  const { bars: htf, group } = resample(bars, periodStarts(bars, tf));
  // lookahead on: the latest completed period is not read
  return { htf, toChart: (values) => mapToChart(values, group, group, true, false) };
}

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<VdubBinaryPro3V2Inputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const highS = S(bars.map((b) => b.high));
  const lowS = S(bars.map((b) => b.low));
  const closeS = S(bars.map((b) => b.close));

  // Bands: ma = wma(close, length), rangema = wma(tr, atrlen)
  const ma = A(ta.wma(closeS, cfg.length));
  const rangema = A(ta.wma(ta.tr(bars), cfg.atrlen));

  // Centre band
  const smaHigh = A(ta.sma(highS, cfg.periods));
  const smaLow = A(ta.sma(lowS, cfg.periods));

  // Base line
  const shortS = ta.sma(closeS, 3);
  const longS = ta.sma(closeS, 13);
  const short = A(shortS);
  const long = A(longS);
  const crossed = ta.cross(longS, shortS).toArray();

  // Large channel: security(tickerid, tf, highest(Range2)) / lowest(Range2)
  const large = timeframeBars(bars, cfg.lrgChannelTf, chart);
  const largeHigh = Series.fromArray(large.htf, large.htf.map((b) => b.high));
  const largeLow = Series.fromArray(large.htf, large.htf.map((b) => b.low));
  const sell = large.toChart(A(ta.highest(largeHigh, cfg.range2)));
  const buy = large.toChart(A(ta.lowest(largeLow, cfg.range2)));
  // Small channel: security(tickerid, tf, high) / low
  const small = timeframeBars(bars, cfg.smlChannelTf, chart);
  const mHigh = small.toChart(small.htf.map((b) => b.high));
  const mLow = small.toChart(small.htf.map((b) => b.low));

  // Zigzag
  const hls = A(ta.rma(S(bars.map((b) => (b.high + b.low) / 2)), cfg.zigzagLength));
  const lowest = A(ta.lowest(lowS, cfg.zigzagLength));
  const highest = A(ta.highest(highS, cfg.zigzagLength));

  const plots: Record<string, Point[]> = {};
  for (let k = 0; k < 16; k++) plots[`plot${k}`] = [];
  const add = (k: number, i: number, value: number, colour?: string) => {
    plots[`plot${k}`].push(colour === undefined ? { time: bars[i].time, value } : { time: bars[i].time, value, color: colour });
  };
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  // bgcolor(OutputSignal > 0 ? red : gray, transp = 100): not visible
  const bgRed = String(color.new(RED_HEX, 100));
  const bgGray = String(color.new(GRAY_HEX, 100));
  const maroon = V1('#800000');
  let prevRising = false; // isRising[1] (na on the first bar: false in a condition)
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    add(0, i, ma[i] + rangema[i] * 2);
    add(1, i, ma[i] + rangema[i] * 3);
    add(2, i, ma[i] - rangema[i] * 2);
    add(3, i, ma[i] - rangema[i] * 3);

    const spread = smaHigh[i] - smaLow[i];
    add(4, i, (smaHigh[i] + 2.5 * spread + (smaLow[i] - 2.5 * spread)) / 2);
    // plot(pc and sma(high, periods) ? sma(high, periods) : na): a value of 0 or na is not drawn
    add(5, i, cfg.pc && truthy(smaHigh[i]) ? smaHigh[i] : NaN);
    add(6, i, cfg.pc && truthy(smaLow[i]) ? smaLow[i] : NaN);

    add(7, i, short[i]);
    add(8, i, long[i]);
    add(9, i, crossed[i] ? long[i] : NaN);
    bgColors.push({ time: b.time, color: ge(long[i], short[i]) ? bgRed : bgGray });

    const prev = (x: number[]) => (i > 0 ? x[i - 1] : NaN);
    add(10, i, sell[i], ne(sell[i], prev(sell)) ? 'transparent' : RED);
    add(11, i, buy[i], ne(buy[i], prev(buy)) ? 'transparent' : GREEN);
    const hcon = ge(b.high, sell[i]);
    const lcon = le(b.low, buy[i]);
    if (hcon) markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: maroon });
    if (lcon) markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: GREEN });

    add(12, i, mHigh[i], ne(mHigh[i], prev(mHigh)) ? 'transparent' : FUCHSIA);
    add(13, i, mLow[i], ne(mLow[i], prev(mLow)) ? 'transparent' : FUCHSIA);

    // isRising = hls >= hls[1]
    const isRising = ge(hls[i], prev(hls));
    add(14, i, isRising && !prevRising ? lowest[i] : !isRising && prevRising ? highest[i] : NaN);
    prevRising = isRising;

    add(15, i, !cfg.zigzag2 ? NaN : hcon ? b.high : lcon ? b.low : NaN);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: fillConfig.map((f) => ({ plot1: f.plot1, plot2: f.plot2, options: { color: f.color, title: f.title } })),
    markers,
    bgColors,
  };
}

export const VdubBinaryPro3V2 = { calculate, metadata, defaultInputs, inputConfig, plotConfig, fillConfig };
