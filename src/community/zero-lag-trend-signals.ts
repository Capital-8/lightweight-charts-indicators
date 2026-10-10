/**
 * Zero Lag Trend Signals (MTF) [AlgoAlpha]
 *
 * Zero-lag EMA: the EMA of close + (close - close[lag]) with lag = floor((length - 1) / 2). The band width is the
 * highest ATR(length) of 3 * length bars times the multiplier. The trend turns bullish when the close crosses over
 * the upper band and bearish when it crosses under the lower band. The basis is drawn in the trend colour, the band
 * on the other side of the trend is drawn with a gradient fill, a label marks each trend change and a small arrow
 * marks a cross of the close and the basis in the direction of the trend. A table shows the trend of five other
 * timeframes of the same symbol.
 *
 * Other timeframes: the bars of a higher timeframe are built from the chart bars with the UTC calendar rule of the
 * period helper (see anchor-period.ts for its limits), so its trend starts at the first chart bar. The table shows
 * the trend of the latest completed bar of each timeframe (every bar is a closed bar). A timeframe below the chart
 * timeframe needs data that the chart bars do not have: the port throws an Error. The default timeframes are 5, 15,
 * 60, 240 and 1D: on a chart above 5 minutes, set the timeframes to the chart timeframe or higher.
 *
 * The script reads the chart background and foreground colours (table, label texts). A port has no chart theme: it
 * uses the colours of the reference run (background #0F0F0F, foreground #DBDBDB).
 *
 * Reference: "Zero Lag Trend Signals (MTF) [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import { ta, Series, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, TableData, TableCellData } from '../types';
import { barInterval } from '../bar-time';
import { periodStarts, chartTimeframe } from '../anchor-period';

export interface ZeroLagTrendSignalsInputs {
  /** Look-back window of the zero-lag EMA */
  length: number;
  /** Band width, in highest ATR */
  mult: number;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  t5: string;
  green: string;
  red: string;
}

export const defaultInputs: ZeroLagTrendSignalsInputs = {
  length: 70,
  mult: 1.2,
  t1: '5',
  t2: '15',
  t3: '60',
  t4: '240',
  t5: '1D',
  green: '#00FFBB',
  red: '#FF1100',
};

const G_MAIN = 'Main Calculations';
const G_TF = 'Extra Timeframes';

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 70, group: G_MAIN, tooltip: 'The Look-Back window for the Zero-Lag EMA calculations' },
  { id: 'mult', type: 'float', title: 'Band Multiplier', defval: 1.2, group: G_MAIN, tooltip: 'This value controls the thickness of the bands, a larger value makes the indicato less noisy' },
  { id: 't1', type: 'timeframe', title: 'Time frame 1', defval: '5', group: G_TF },
  { id: 't2', type: 'timeframe', title: 'Time frame 2', defval: '15', group: G_TF },
  { id: 't3', type: 'timeframe', title: 'Time frame 3', defval: '60', group: G_TF },
  { id: 't4', type: 'timeframe', title: 'Time frame 4', defval: '240', group: G_TF },
  { id: 't5', type: 'timeframe', title: 'Time frame 5', defval: '1D', group: G_TF },
  { id: 'green', type: 'color', title: 'Bullish Color', defval: '#00FFBB', group: 'Appearance' },
  { id: 'red', type: 'color', title: 'Bearish Color', defval: '#FF1100', group: 'Appearance' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero Lag Basis', color: String(color.new('#00FFBB', 70)), lineWidth: 2 },
  { id: 'plot1', title: 'Upper Deviation Band', color: String(color.new('#FF1100', 90)), lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Lower Deviation Band', color: String(color.new('#00FFBB', 90)), lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Zero Lag Trend Signals (MTF) [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - 0️⃣Zero Lag Signals',
  overlay: true,
};

/** Chart colours of the reference run (chart.bg_color / chart.fg_color) */
const CHART_BG = '#0F0F0F';
const CHART_FG = '#DBDBDB';

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars, and for each chart bar the index of the latest completed bar of that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string): { htf: Bar[]; latest: number[] } {
  const chart = chartTimeframe(bars);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
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
  const latest: number[] = [];
  for (let i = 0; i < n; i++) {
    let done = i === 0 ? -1 : latest[i - 1];
    if (i > 0 && group[i] !== group[i - 1]) done = Math.max(done, group[i] - 1);
    const ends = i === n - 1 || starts[i + 1] !== starts[i];
    const reaches = !calendar || closeStarts[i] !== starts[i];
    if (ends && reaches) done = Math.max(done, group[i]);
    latest.push(done);
  }
  return { htf, latest };
}

/** The basis, the band width and the trend on the bars of one timeframe */
function trendOf(bars: Bar[], length: number, mult: number) {
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const lag = Math.floor((length - 1) / 2);
  const closeS = Series.fromArray(bars, bars.map((b) => b.close));
  const zlema = A(ta.ema(Series.fromArray(bars, bars.map((b, i) => (i >= lag ? b.close + (b.close - bars[i - lag].close) : NaN))), length));
  const volatility = A(ta.highest(ta.atr(bars, length), length * 3)).map((v) => v * mult);
  const upperBand = zlema.map((v, i) => v + volatility[i]);
  const lowerBand = zlema.map((v, i) => v - volatility[i]);
  const up = ta.crossover(closeS, Series.fromArray(bars, upperBand)).toArray();
  const down = ta.crossunder(closeS, Series.fromArray(bars, lowerBand)).toArray();
  const trend: number[] = [];
  let state = 0;
  for (let i = 0; i < n; i++) {
    if (up[i]) state = 1;
    if (down[i]) state = -1;
    trend.push(state);
  }
  return { closeS, zlema, volatility, upperBand, lowerBand, trend };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ZeroLagTrendSignalsInputs> = {},
): IndicatorResult & { markers: MarkerData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { green, red } = cfg;
  const green70 = String(color.new(green, 70));
  const red70 = String(color.new(red, 70));
  const green90 = String(color.new(green, 90));
  const red90 = String(color.new(red, 90));

  // The trend of the five other timeframes on the last bar (request.security(syminfo.tickerid, tf, trend))
  const signals = [cfg.t1, cfg.t2, cfg.t3, cfg.t4, cfg.t5].map((tf) => {
    const { htf, latest } = timeframeBars(bars, tf);
    if (n === 0) return NaN;
    const k = latest[n - 1];
    return k >= 0 ? trendOf(htf, cfg.length, cfg.mult).trend[k] : NaN;
  });

  const { closeS, zlema, volatility, upperBand, lowerBand, trend } = trendOf(bars, cfg.length, cfg.mult);
  const zlemaS = Series.fromArray(bars, zlema);
  const closeOver = ta.crossover(closeS, zlemaS).toArray();
  const closeUnder = ta.crossunder(closeS, zlemaS).toArray();

  type Point = { time: number; value: number; color?: string };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const markers: MarkerData[] = [];
  const mid: number[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const tr = trend[i];
    const tr1 = i > 0 ? trend[i - 1] : NaN;
    mid.push((bars[i].open + bars[i].close) / 2);
    plot0.push({ time, value: zlema[i], color: tr === 1 ? green70 : red70 });
    plot1.push({ time, value: tr === -1 ? upperBand[i] : NaN, color: red90 });
    plot2.push({ time, value: tr === 1 ? lowerBand[i] : NaN, color: green90 });

    // ta.crossunder(trend, 0) / ta.crossover(trend, 0): a label at the band
    if (tr < 0 && tr1 >= 0 && !isNaN(upperBand[i])) {
      markers.push({ time, position: 'atPriceTop', price: upperBand[i], shape: 'labelDown', color: red, text: '▼', textColor: CHART_FG, size: 'small' });
    }
    if (tr > 0 && tr1 <= 0 && !isNaN(lowerBand[i])) {
      markers.push({ time, position: 'atPriceBottom', price: lowerBand[i], shape: 'labelUp', color: green, text: '▲', textColor: CHART_FG, size: 'small' });
    }
    // plotchar: a cross of the close and the basis in the direction of a trend that is at least one bar old
    const bullEntry = zlema[i] - volatility[i] * 1.5;
    if (closeOver[i] && tr === 1 && tr1 === 1 && !isNaN(bullEntry)) {
      markers.push({ time, position: 'atPriceMiddle', price: bullEntry, shape: 'circle', color: 'transparent', text: '▲', textColor: green, size: 'tiny' });
    }
    const bearEntry = zlema[i] + volatility[i] * 1.5;
    if (closeUnder[i] && tr === -1 && tr1 === -1 && !isNaN(bearEntry)) {
      markers.push({ time, position: 'atPriceMiddle', price: bearEntry, shape: 'circle', color: 'transparent', text: '▼', textColor: red, size: 'tiny' });
    }
  }

  // Table (barstate.islast)
  const tables: TableData[] = [];
  if (n > 0) {
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string, bgColor?: string) => {
      cells.push({ column, row, text, textColor: CHART_FG, textHAlign: 'center', textSize: 'auto', ...(bgColor !== undefined ? { bgColor } : {}) });
    };
    cell(0, 0, 'Time Frame');
    cell(1, 0, 'Signal');
    [cfg.t1, cfg.t2, cfg.t3, cfg.t4, cfg.t5].forEach((tf, k) => {
      const bullish = signals[k] === 1;
      cell(0, k + 1, tf);
      cell(1, k + 1, bullish ? 'Bullish' : 'Bearish', bullish ? green70 : red70);
    });
    tables.push({
      position: 'top_right', columns: 2, rows: 6, cells, bgColor: CHART_BG,
      borderWidth: 1, borderColor: CHART_FG, frameColor: CHART_FG, frameWidth: 1,
    });
  }

  const fillArr = <T,>(v: T): T[] => new Array<T>(n).fill(v);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [
      // fill(m, upper, (open + close) / 2, zlema + volatility, color.new(red, 90), color.new(red, 70))
      { plot1: 'plot0', plot2: 'plot1', gradient: {
        topValue: mid, bottomValue: upperBand, topColor: fillArr<string | null>(red90), bottomColor: fillArr<string | null>(red70) } },
      // fill(m, lower, (open + close) / 2, zlema - volatility, color.new(green, 90), color.new(green, 70))
      { plot1: 'plot0', plot2: 'plot2', gradient: {
        topValue: mid, bottomValue: lowerBand, topColor: fillArr<string | null>(green90), bottomColor: fillArr<string | null>(green70) } },
    ],
    markers,
    tables,
  };
}

export const ZeroLagTrendSignals = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
