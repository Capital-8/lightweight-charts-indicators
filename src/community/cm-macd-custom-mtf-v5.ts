/**
 * CM MACD Custom Indicator - Multiple Time Frame - V2
 *
 * MACD = MA(source, fast) - MA(source, slow), signal = MA(MACD, signal length), histogram = MACD - signal, with SMA
 * or EMA averages, computed on the chart timeframe or on a higher timeframe of the same symbol. The MACD line has the
 * trend colour (above / below the signal), the histogram has four colours (rising / falling, above / below zero; an
 * unchanged histogram keeps its colour) and a circle marks each cross of MACD and signal. Options: bar colours by
 * trend and a background colour on the crosses.
 *
 * Other timeframe: the bars of that timeframe are built from the chart bars with the calendar rule of the period
 * helper (see anchor-period.ts for its limits), so its averages start at the first chart bar. The value of a bar of
 * that timeframe appears on the chart bar that completes it (on symbols that trade every day, a bar whose close
 * reaches the end of the period, else the first bar of the next period; on other symbols the last bar of the
 * period). A timeframe below the chart timeframe needs data that the chart bars do not have: the port throws an
 * Error. The plot widths are inputs in the original; the plots are drawn with their default widths.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "_CM_MacD_Ult_MTF_V2.1" by ChrisMoody
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, timeframe, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BarColorData, BgColorData } from '../types';
import { barInterval } from '../bar-time';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface CmMacdCustomMtfV5Inputs {
  /** Timeframe of the MACD ('' = chart timeframe) */
  res: string;
  fastLength: number;
  slowLength: number;
  src: SourceType;
  signalLength: number;
  smaSource: 'SMA' | 'EMA';
  smaSignal: 'SMA' | 'EMA';
  showMacd: boolean;
  showMacdLW: number;
  showSignalLW: number;
  showHist: boolean;
  showHistLW: number;
  showTrend: boolean;
  showHB: boolean;
  showCross: boolean;
  showDots: boolean;
  showDotsLW: number;
  colMacd: string;
  colSignal: string;
  colTrndUp: string;
  colTrndDn: string;
  colGrowAbove: string;
  colFallAbove: string;
  colGrowBelow: string;
  colFallBelow: string;
  alertLong: boolean;
  alertShort: boolean;
  alertLongA: boolean;
  alertShortB: boolean;
}

export const defaultInputs: CmMacdCustomMtfV5Inputs = {
  res: '',
  fastLength: 12,
  slowLength: 26,
  src: 'close',
  signalLength: 9,
  smaSource: 'EMA',
  smaSignal: 'EMA',
  showMacd: true,
  showMacdLW: 3,
  showSignalLW: 2,
  showHist: true,
  showHistLW: 5,
  showTrend: true,
  showHB: false,
  showCross: false,
  showDots: true,
  showDotsLW: 5,
  colMacd: '#FF6D00',
  colSignal: '#2962FF',
  colTrndUp: '#4BAF4F',
  colTrndDn: '#B71D1C',
  colGrowAbove: '#26A69A',
  colFallAbove: '#B2DFDB',
  colGrowBelow: '#FF5252',
  colFallBelow: '#FFCDD2',
  alertLong: true,
  alertShort: true,
  alertLongA: false,
  alertShortB: false,
};

const G_SHOW = 'Show Plots?';
const G_COL = 'Color Settings';
const G_HIST = 'Histogram Colors';
const G_ALERT = 'Alerts';

export const inputConfig: InputConfig[] = [
  { id: 'res', type: 'timeframe', title: 'Indicator TimeFrame', defval: '' },
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1, max: 999 },
  { id: 'smaSource', type: 'string', title: 'Oscillator MA Type', defval: 'EMA', options: ['SMA', 'EMA'] },
  { id: 'smaSignal', type: 'string', title: 'Signal Line MA Type', defval: 'EMA', options: ['SMA', 'EMA'] },
  { id: 'showMacd', type: 'bool', title: 'Show MACD Lines', defval: true, group: G_SHOW, inline: 'SP10' },
  { id: 'showMacdLW', type: 'int', title: 'MACD Width', defval: 3, min: 0, max: 5, group: G_SHOW, inline: 'SP11' },
  { id: 'showSignalLW', type: 'int', title: 'Signal Width', defval: 2, min: 0, max: 5, group: G_SHOW, inline: 'SP11' },
  { id: 'showHist', type: 'bool', title: 'Show Histogram', defval: true, group: G_SHOW, inline: 'SP20' },
  { id: 'showHistLW', type: 'int', title: '-- Width', defval: 5, min: 0, max: 5, group: G_SHOW, inline: 'SP20' },
  { id: 'showTrend', type: 'bool', title: 'Show MACD Lines w/ Trend Color', defval: true, group: G_SHOW, inline: 'SP30' },
  { id: 'showHB', type: 'bool', title: 'Show Highlight Price Bars', defval: false, group: G_SHOW, inline: 'SP40' },
  { id: 'showCross', type: 'bool', title: 'Show BackGround on Cross', defval: false, group: G_SHOW, inline: 'SP50' },
  { id: 'showDots', type: 'bool', title: 'Show Circle on Cross', defval: true, group: G_SHOW, inline: 'SP60' },
  { id: 'showDotsLW', type: 'int', title: '-- Width', defval: 5, min: 0, max: 5, group: G_SHOW, inline: 'SP60' },
  { id: 'colMacd', type: 'color', title: 'MACD Line\u2003\u2006', defval: '#FF6D00', group: G_COL, inline: 'CS1' },
  { id: 'colSignal', type: 'color', title: 'Signal Line\u2003\u2003', defval: '#2962FF', group: G_COL, inline: 'CS1' },
  { id: 'colTrndUp', type: 'color', title: 'Trend Up\u2003\u2006\u2006\u2006\u2006\u2006', defval: '#4BAF4F', group: G_COL, inline: 'CS2' },
  { id: 'colTrndDn', type: 'color', title: 'Trend Down\u2003\u2006\u2006\u2006', defval: '#B71D1C', group: G_COL, inline: 'CS2' },
  { id: 'colGrowAbove', type: 'color', title: 'Above\u2004\u2004\u2005Grow', defval: '#26A69A', group: G_HIST, inline: 'Hist10' },
  { id: 'colFallAbove', type: 'color', title: 'Fall', defval: '#B2DFDB', group: G_HIST, inline: 'Hist10' },
  { id: 'colGrowBelow', type: 'color', title: 'Below\u2003Grow', defval: '#FF5252', group: G_HIST, inline: 'Hist20' },
  { id: 'colFallBelow', type: 'color', title: 'Fall', defval: '#FFCDD2', group: G_HIST, inline: 'Hist20' },
  { id: 'alertLong', type: 'bool', title: 'MACD Cross Up', defval: true, group: G_ALERT, inline: 'Alert10' },
  { id: 'alertShort', type: 'bool', title: 'MACD Cross Dn', defval: true, group: G_ALERT, inline: 'Alert10' },
  { id: 'alertLongA', type: 'bool', title: 'MACD Cross Up & > 0', defval: false, group: G_ALERT, inline: 'Alert20' },
  { id: 'alertShortB', type: 'bool', title: 'MACD Cross Dn & < 0', defval: false, group: G_ALERT, inline: 'Alert20' },
];

const SILVER = '#B2B5BE';
const GRAY = '#787B86';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Histogram', color: '#26A69A', lineWidth: 5, style: 'columns' },
  { id: 'plot1', title: 'Signal', color: '#2962FF', lineWidth: 2 },
  { id: 'plot2', title: 'MACD', color: '#4BAF4F', lineWidth: 3 },
  { id: 'plot3', title: 'Dots', color: '#4BAF4F', lineWidth: 5, style: 'circles' },
  { id: 'plot4', title: 'Dots', color: '#B71D1C', lineWidth: 5, style: 'circles' },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_0', price: 0, color: GRAY, linestyle: 'dashed', linewidth: 1, title: '0 Line' },
];

export const metadata = {
  title: '_CM_MacD_Ult_MTF_V2.1',
  shortTitle: '_CM_Ult_MacD_MTF_V2.1',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => gt(a, b) || eq(a, b);
const le = (a: number, b: number) => lt(a, b) || eq(a, b);
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars, and for each chart bar the index of the latest completed bar of that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods and the bars that
  // complete them come from the library rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) {
    // the time of a bar of the timeframe: its first chart bar
    const htf = exchange.htf.map((b, k) => ({ ...b, time: bars[exchange.first[k]].time }));
    return { htf, latest: exchange.latest };
  }
  const n = bars.length;
  const starts = periodStarts(bars, tf);
  const htf: Bar[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
    } else {
      const last = htf[htf.length - 1];
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume = (last.volume ?? NaN) + (b.volume ?? NaN);
    }
    group.push(htf.length - 1);
  });

  // A bar completes its period when its close reaches the end of the period. Symbols that trade every day follow
  // the UTC calendar: the period of the close time is another period. Other symbols: the last bar of a period.
  const ms = n > 0 && bars[0].time >= 1e12;
  const weekend = (t: number) => {
    const wd = new Date(ms ? t : t * 1000).getUTCDay();
    return wd === 0 || wd === 6;
  };
  const interval = barInterval(bars);
  const closes = bars.map((b) => ({ time: b.time + interval }));
  const calendar = bars.some((b) => weekend(b.time)) && closes.some((b) => weekend(b.time));
  const closeStarts = calendar ? periodStarts(closes, tf) : [];
  // The last bar of a symbol that does not trade every day: its period is complete when the next possible bar is in
  // another period. The next bar is on the same day while the bar is earlier in the day than the last bar of the
  // trading day before; else it is on the next weekday.
  let lastEnds = true;
  if (!calendar && n > 1) {
    const DAY = 86400000;
    const toMs = (t: number) => (ms ? t : t * 1000);
    const lastMs = toMs(bars[n - 1].time);
    const day = Math.floor(lastMs / DAY) * DAY;
    let next = lastMs + toMs(interval);
    let sessionOver = true;
    if (toMs(interval) < DAY) {
      let j = n - 2;
      while (j >= 0 && toMs(bars[j].time) >= day) j--;
      sessionOver = j < 0 || lastMs - day >= toMs(bars[j].time) % DAY;
    }
    if (sessionOver) {
      next = day + DAY;
      while (weekend(ms ? next : next / 1000)) next += DAY;
    }
    const withNext = periodStarts([...bars, { time: ms ? next : next / 1000 }], tf);
    lastEnds = withNext[n] !== withNext[n - 1];
  }
  const latest: number[] = [];
  for (let i = 0; i < n; i++) {
    let done = i === 0 ? -1 : latest[i - 1];
    if (i > 0 && group[i] !== group[i - 1]) done = Math.max(done, group[i] - 1);
    const ends = i === n - 1 ? lastEnds : starts[i + 1] !== starts[i];
    const reaches = !calendar || closeStarts[i] !== starts[i];
    if (ends && reaches) done = Math.max(done, group[i]);
    latest.push(done);
  }
  return { htf, latest };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<CmMacdCustomMtfV5Inputs> = {},
  chart?: ChartContext,
): IndicatorResult & { barColors: BarColorData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // The three request.security calls: the averages on the bars of the timeframe
  const { htf, latest } = timeframeBars(bars, cfg.res, chart);
  const source = getSourceSeries(htf, cfg.src);
  const ma = (type: 'SMA' | 'EMA', s: Series, len: number) => A(type === 'SMA' ? ta.sma(s, len) : ta.ema(s, len));
  const fastHtf = ma(cfg.smaSource, source, cfg.fastLength);
  const slowHtf = ma(cfg.smaSource, source, cfg.slowLength);
  const macdHtf = fastHtf.map((v, k) => v - slowHtf[k]);
  const signalHtf = ma(cfg.smaSignal, Series.fromArray(htf, macdHtf), cfg.signalLength);
  const toChart = (values: number[]) => latest.map((k) => (k >= 0 ? values[k] : NaN));
  const fastMa = toChart(fastHtf);
  const slowMa = toChart(slowHtf);
  const macd = fastMa.map((v, i) => v - slowMa[i]);
  const signal = toChart(signalHtf);
  const hist = macd.map((v, i) => v - signal[i]);

  // color.new(colour, 0): an na colour (no trend) gives black, as in the original
  const opaque = (c: string | null) => String(color.new(c as string, 0));

  type Point = { time: number; value: number; color: string };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  let histAIsUp = false;
  let histAIsDown = false;
  let histBIsDown = false;
  let histBIsUp = false;
  const signalColor = opaque(cfg.colSignal);
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const m = macd[i];
    const s = signal[i];
    const m1 = i > 0 ? macd[i - 1] : NaN;
    const s1 = i > 0 ? signal[i - 1] : NaN;
    const h = hist[i];
    const h1 = i > 0 ? hist[i - 1] : NaN;

    const trendUp = gt(m, s);
    const trendDn = lt(m, s);
    const crossUp = ge(s1, m1) && lt(s, m);
    const crossDn = le(s1, m1) && gt(s, m);
    const trendCol = trendUp ? (cfg.showTrend ? cfg.colTrndUp : cfg.colMacd)
      : trendDn ? (cfg.showTrend ? cfg.colTrndDn : cfg.colMacd) : null;

    // An unchanged histogram keeps the flags of the bar before
    if (!eq(h, h1)) {
      histAIsUp = gt(h, h1) && gt(h, 0);
      histAIsDown = lt(h, h1) && gt(h, 0);
      histBIsDown = lt(h, h1) && le(h, 0);
      histBIsUp = gt(h, h1) && le(h, 0);
    }
    const histCol = histAIsUp ? cfg.colGrowAbove : histAIsDown ? cfg.colFallAbove
      : histBIsDown ? cfg.colGrowBelow : histBIsUp ? cfg.colFallBelow : SILVER;

    // The two bgcolor calls and the two barcolor calls never colour the same bar
    if (cfg.showCross && crossUp) bgColors.push({ time, color: cfg.colTrndUp });
    if (cfg.showCross && crossDn) bgColors.push({ time, color: cfg.colTrndDn });
    if (cfg.showHB && trendUp) barColors.push({ time, color: cfg.colTrndUp });
    if (cfg.showHB && trendDn) barColors.push({ time, color: cfg.colTrndDn });

    // plot(show and x ? x : na): a value of 0 or na is not drawn
    plot0.push({ time, value: cfg.showHist && truthy(h) ? h : NaN, color: opaque(histCol) });
    plot1.push({ time, value: cfg.showMacd && truthy(s) ? s : NaN, color: signalColor });
    plot2.push({ time, value: cfg.showMacd && truthy(m) ? m : NaN, color: opaque(trendCol) });
    plot3.push({ time, value: cfg.showDots && crossUp ? m : NaN, color: opaque(trendCol) });
    plot4.push({ time, value: cfg.showDots && crossDn ? m : NaN, color: opaque(trendCol) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    hlines: [{ value: 0, options: { title: '0 Line', color: GRAY, linestyle: 'dashed', linewidth: 1 } }],
    barColors,
    bgColors,
  };
}

export const CmMacdCustomMtfV5 = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig };
