/**
 * vdub_Trend_Master_v (version 1 script that joins several tools of other authors):
 * - MA2: the 144-bar SMA of the close.
 * - An Ichimoku cloud: Lead 1 = mean of the Donchian midlines of 34 and 26 bars, Lead 2 = Donchian midline of 52 bars,
 *   both drawn 26 bars ahead, filled black at 90 % transparency.
 * - Extremes of a higher timeframe (RicardoSantos): highest high / lowest low of the last 2 bars of the timeframe
 *   "ExtremeTimeFrame" (default 240), red / green while the value does not change (no colour on a change).
 * - Previous day high / low (Lachlan Smith), cross style; the weekly / monthly switches draw the DAILY levels too
 *   (as the original), shown only while the weekly / monthly levels exist.
 * - Madrid moving average ribbon: EMA (or SMA) of 5 to 90 bars, each grey / red / silver by its slope and by the
 *   5-bar average against the 100-bar average.
 * - Madrid profit area: fast and slow averages (5 / 90), silver when rising, else red, filled silver.
 * - Jurij: the 10-bar lowest low / highest high channel and a ★ "Sell" / "Buy" mark on a bar whose high (low) is the
 *   highest (lowest) of the 10 bars on each side, drawn 11 bars back. The input "Show PTZ" is not read by the original.
 *
 * Other timeframes: `security(tickerid, tf, ...)` of version 1: every chart bar of a period shows the value of the bar
 * of that timeframe that holds it (as lookahead on, no gaps). The bars of the timeframe are built from the chart bars
 * (exchange calendar of the chart context when given, else the UTC calendar and the bars; see src/anchor-period.ts).
 * A timeframe equal to the chart timeframe is the chart series. A timeframe below the chart timeframe (e.g. the
 * default "240" on a daily chart) needs the bars of that lower timeframe, which the chart does not have: the port
 * throws an Error.
 *
 * Plot colours are the version 1 colour constants with the default plot transparency of that version (35). The
 * untitled Lead plots have no colour in Pine: the version 1 blue. `trackprice = true` of the daily / weekly / monthly
 * plots is not drawn.
 *
 * Reference: "vdub_Trend_Master_v  /  v1 / v2 / v3" by vdubus
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, timeframe, resample, mapToChart,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type MarkerData,
} from 'oakscriptjs';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import { barInterval, barTime } from '../bar-time';

export interface VdubTrendMasterInputs {
  /** MA2 Period: */
  m2P: number;
  conversionPeriods: number;
  basePeriods: number;
  laggingSpan2Periods: number;
  displacement: number;
  extremeTimeFrame: string;
  extremeTimeWindow: number;
  /** Show Daily High & Lows? */
  disDaily: boolean;
  /** Show Weekly High & Lows? */
  disWeekly: boolean;
  /** Show Monthly High & Lows? */
  disMonthly: boolean;
  /** Exponential MA (ribbon) */
  exponential: boolean;
  /** Fast MA Length */
  fastLen: number;
  /** Slow MA Length */
  slowLen: number;
  /** Exponential MA (profit area) */
  exponential_1: boolean;
  /** h left */
  hLeft: number;
  /** h right */
  hRight: number;
  /** Show PTZ (not read by the original) */
  showPtz: boolean;
  /** Show channel */
  showChannel: boolean;
}

export const defaultInputs: VdubTrendMasterInputs = {
  m2P: 144,
  conversionPeriods: 34,
  basePeriods: 26,
  laggingSpan2Periods: 52,
  displacement: 26,
  extremeTimeFrame: '240',
  extremeTimeWindow: 2,
  disDaily: true,
  disWeekly: false,
  disMonthly: false,
  exponential: true,
  fastLen: 5,
  slowLen: 90,
  exponential_1: true,
  hLeft: 10,
  hRight: 10,
  showPtz: true,
  showChannel: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'm2P', type: 'int', title: 'MA2 Period:', defval: 144 },
  { id: 'conversionPeriods', type: 'int', title: 'conversionPeriods', defval: 34, min: 1 },
  { id: 'basePeriods', type: 'int', title: 'basePeriods', defval: 26, min: 1 },
  { id: 'laggingSpan2Periods', type: 'int', title: 'laggingSpan2Periods', defval: 52, min: 1 },
  { id: 'displacement', type: 'int', title: 'displacement', defval: 26, min: 1 },
  { id: 'extremeTimeFrame', type: 'string', title: 'ExtremeTimeFrame', defval: '240' },
  { id: 'extremeTimeWindow', type: 'int', title: 'ExtremeTimeWindow', defval: 2 },
  { id: 'disDaily', type: 'bool', title: 'Show Daily High & Lows?', defval: true },
  { id: 'disWeekly', type: 'bool', title: 'Show Weekly High & Lows?', defval: false },
  { id: 'disMonthly', type: 'bool', title: 'Show Monthly High & Lows?', defval: false },
  { id: 'exponential', type: 'bool', title: 'Exponential MA', defval: true },
  { id: 'fastLen', type: 'int', title: 'Fast MA Length', defval: 5, min: 1 },
  { id: 'slowLen', type: 'int', title: 'Slow MA Length', defval: 90, min: 1 },
  { id: 'exponential_1', type: 'bool', title: 'exponential_1', defval: true },
  { id: 'hLeft', type: 'int', title: 'h left', defval: 10 },
  { id: 'hRight', type: 'int', title: 'h right', defval: 10 },
  { id: 'showPtz', type: 'bool', title: 'Show PTZ', defval: true },
  { id: 'showChannel', type: 'bool', title: 'Show channel', defval: true },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const BLUE = V1('#0000FF');
const RED = V1('#FF0000');
const GREEN = V1('#008000');
const BLACK = V1('#000000');
const SILVER = V1('#C0C0C0');
const GRAY = V1('#808080');

const MMA_LENGTHS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const mmaTitle = (len: number) => `MMA${String(len).padStart(2, '0')}`;

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA2', color: BLUE, lineWidth: 1 },
  { id: 'plot1', title: 'Lead 1', color: BLUE, lineWidth: 1 },
  { id: 'plot2', title: 'Lead 2', color: BLUE, lineWidth: 1 },
  { id: 'plot3', title: 'Extreme High', color: RED, lineWidth: 1 },
  { id: 'plot4', title: 'Extreme Low', color: GREEN, lineWidth: 1 },
  { id: 'plot5', title: 'Daily High', color: BLACK, lineWidth: 1, style: 'cross' },
  { id: 'plot6', title: 'Daily Low', color: BLACK, lineWidth: 1, style: 'cross' },
  { id: 'plot7', title: 'Weekly High', color: SILVER, lineWidth: 1, style: 'cross' },
  { id: 'plot8', title: 'Weekly Low', color: SILVER, lineWidth: 1, style: 'cross' },
  { id: 'plot9', title: 'Monthly High', color: SILVER, lineWidth: 1, style: 'cross' },
  { id: 'plot10', title: 'Monthly Low', color: SILVER, lineWidth: 1, style: 'cross' },
  ...MMA_LENGTHS.map((len, k) => ({
    id: `plot${11 + k}`, title: mmaTitle(len), color: GRAY, lineWidth: len === 5 || len === 90 ? 3 : 1,
  })),
  { id: 'plot29', title: 'Fast MA', color: SILVER, lineWidth: 1 },
  { id: 'plot30', title: 'Slow MA', color: SILVER, lineWidth: 1 },
  { id: 'plot31', title: 'Channel Low', color: SILVER, lineWidth: 1 },
  { id: 'plot32', title: 'Channel High', color: SILVER, lineWidth: 1 },
];

export const metadata = {
  title: 'vdub_Trend_Master_v',
  shortTitle: 'vdub_Trend_Master_v',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;
const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);

/**
 * security(tickerid, tf, ...) on the chart symbol: the bars of timeframe `tf` built from the chart bars, and the
 * function that brings one value per bar of that timeframe back to the chart bars. Version 1 rule: every chart bar
 * of a period shows the value of the bar of the timeframe that holds it (no gaps).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; toChart: (values: number[]) => number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, toChart: (values) => values };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`vdub_Trend_Master_v: the timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  const exchange = securityBars(bars, tf, context);
  const { bars: htf, group } = exchange ? { bars: exchange.htf, group: exchange.group } : resample(bars, periodStarts(bars, tf));
  return { htf, toChart: (values) => mapToChart(values, group, [], true, false) };
}

export function calculate(bars: Bar[], inputs: Partial<VdubTrendMasterInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const interval = barInterval(bars);
  const T = (i: number) => barTime(bars, i, interval);
  const close = new Series(bars, (b) => b.close);
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);

  // MA2
  const ma2 = arr(ta.sma(close, cfg.m2P));

  // Ichimoku: donchian(len) = avg(lowest(len), highest(len))
  const donchian = (len: number) => {
    const lo = arr(ta.lowest(low, len));
    const hi = arr(ta.highest(high, len));
    return lo.map((v, i) => (v + hi[i]) / 2);
  };
  const conversionLine = donchian(cfg.conversionPeriods);
  const baseLine = donchian(cfg.basePeriods);
  const leadLine1 = conversionLine.map((v, i) => (v + baseLine[i]) / 2);
  const leadLine2 = donchian(cfg.laggingSpan2Periods);

  // Extremes of the timeframe ExtremeTimeFrame: highest(window) / lowest(window) on its bars
  const ext = timeframeBars(bars, cfg.extremeTimeFrame, chart);
  const teh = ext.toChart(arr(ta.highest(new Series(ext.htf, (b) => b.high), cfg.extremeTimeWindow)));
  const tel = ext.toChart(arr(ta.lowest(new Series(ext.htf, (b) => b.low), cfg.extremeTimeWindow)));

  // security(tickerid, 'D' / 'W' / 'M', high[1]) and low[1]: computed only when a plot reads them
  const previous = (tf: string) => {
    const { htf, toChart } = timeframeBars(bars, tf, chart);
    return {
      high: toChart(htf.map((_b, g) => (g > 0 ? htf[g - 1].high : NaN))),
      low: toChart(htf.map((_b, g) => (g > 0 ? htf[g - 1].low : NaN))),
    };
  };
  const none = { high: new Array<number>(n).fill(NaN), low: new Array<number>(n).fill(NaN) };
  const daily = cfg.disDaily || cfg.disWeekly || cfg.disMonthly ? previous('D') : none;
  const weekly = cfg.disWeekly ? previous('W') : none;
  const monthly = cfg.disMonthly ? previous('M') : none;

  // Madrid ribbon
  const ma = (src: Series, len: number, exp: boolean) => arr(exp ? ta.ema(src, len) : ta.sma(src, len));
  const mmas = MMA_LENGTHS.map((len) => ma(close, len, cfg.exponential));
  const ma100 = ma(close, 100, cfg.exponential);
  const ma05 = mmas[0];
  // maColor(ma, maRef): the slope of `ma`, and ma05 against maRef; leadMAColor is maColor(ma05, ma100)
  const maColor = (m: number[], i: number) => {
    const ch = i > 0 ? m[i] - m[i - 1] : NaN;
    const above = gt(ma05[i], ma100[i]);
    const below = lt(ma05[i], ma100[i]);
    if (ge(ch, 0) && above) return GRAY;
    if (lt(ch, 0) && above) return RED;
    if (le(ch, 0) && below) return RED;
    if (ge(ch, 0) && below) return SILVER;
    return GRAY;
  };

  // Madrid profit area
  const fastMA = ma(close, cfg.fastLen, cfg.exponential_1);
  const slowMA = ma(close, cfg.slowLen, cfg.exponential_1);

  // Jurij channel and PTZ
  const hLeftLow = arr(ta.lowest(low, cfg.hLeft));
  const hLeftHigh = arr(ta.highest(high, cfg.hLeft));
  const zone = cfg.hLeft + cfg.hRight + 1;
  const fullLow = arr(ta.lowest(low, zone));
  const fullHigh = arr(ta.highest(high, zone));
  const back = cfg.hRight + 1;

  const plots: Record<string, Array<{ time: number; value: number; color?: string }>> = {};
  const series = (id: string, values: (i: number) => number, col?: (i: number) => string, offset = 0) => {
    plots[id] = bars.map((_b, i) => ({
      time: T(i + offset), value: values(i), ...(col ? { color: col(i) } : {}),
    }));
  };
  series('plot0', (i) => ma2[i]);
  series('plot1', (i) => leadLine1[i], undefined, cfg.displacement);
  series('plot2', (i) => leadLine2[i], undefined, cfg.displacement);
  // color = TEH != TEH[1] ? na : red (na on the bar after a change only; an na TEH[1] compares false)
  series('plot3', (i) => teh[i], (i) => (i > 0 && ne(teh[i], teh[i - 1]) ? 'transparent' : RED));
  series('plot4', (i) => tel[i], (i) => (i > 0 && ne(tel[i], tel[i - 1]) ? 'transparent' : GREEN));
  // plot(disDaily and dHigh ? dHigh : na); the weekly / monthly plots draw dHigh / dLow (as the original)
  const shown = (on: boolean, cond: number[], value: number[]) => (i: number) => (on && truthy(cond[i]) ? value[i] : NaN);
  series('plot5', shown(cfg.disDaily, daily.high, daily.high));
  series('plot6', shown(cfg.disDaily, daily.low, daily.low));
  series('plot7', shown(cfg.disWeekly, weekly.high, daily.high));
  series('plot8', shown(cfg.disWeekly, weekly.low, daily.low));
  series('plot9', shown(cfg.disMonthly, monthly.high, daily.high));
  series('plot10', shown(cfg.disMonthly, monthly.low, daily.low));
  mmas.forEach((m, k) => series(`plot${11 + k}`, (i) => m[i], (i) => maColor(m, i)));
  series('plot29', (i) => fastMA[i], (i) => (i > 0 && gt(fastMA[i] - fastMA[i - 1], 0) ? SILVER : RED));
  series('plot30', (i) => slowMA[i], (i) => (i > 0 && gt(slowMA[i] - slowMA[i - 1], 0) ? SILVER : RED));
  series('plot31', (i) => (cfg.showChannel ? hLeftLow[i] : 0));
  series('plot32', (i) => (cfg.showChannel ? hLeftHigh[i] : 0));

  // plotchar(central_bar_is_highest ? -1 : 0, offset = -h_right - 1, color = red, text = "Sell") and the "Buy" one
  // (location belowbar): a value of 0 draws nothing
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const j = i - back;
    if (j < 0 || j >= n) continue;
    if (ge(bars[j].high, fullHigh[i])) {
      markers.push({ time: bars[j].time, position: 'aboveBar', shape: 'circle', char: '★', color: RED, text: 'Sell' });
    }
    if (le(bars[j].low, fullLow[i])) {
      markers.push({ time: bars[j].time, position: 'belowBar', shape: 'circle', char: '★', color: GREEN, text: 'Buy' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    fills: [
      // fill(p1, p2, color = black, transp = 90)
      { plot1: 'plot1', plot2: 'plot2', options: { color: String(color.new('#000000', 90)) } },
      // fill(p5, p6, color = silver, transp = 75)
      { plot1: 'plot29', plot2: 'plot30', options: { color: String(color.new('#C0C0C0', 75)) } },
    ],
  };
}

export const VdubTrendMasterV = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
