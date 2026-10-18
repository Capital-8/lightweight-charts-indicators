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
 * Other timeframes: the bars of a higher timeframe are built from the chart bars with the calendar rule of the
 * period helper (see anchor-period.ts for its limits), so its trend starts at the first chart bar. The table shows
 * the trend of the latest completed bar of each timeframe (every bar is a closed bar). A timeframe below the chart
 * timeframe needs data that the chart bars do not have: the port throws an Error. The default timeframes are 5, 15,
 * 60, 240 and 1D: on a chart above 5 minutes, set the timeframes to the chart timeframe or higher.
 *
 * The table and the label texts have the chart background and foreground colours: the port reads them from the
 * chart context (third argument) and uses the colours of a dark chart without it (background #0F0F0F, foreground
 * #DBDBDB).
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Alerts (alertcondition, `alerts` of the result, in the order of the original): the bullish / bearish entries, the
 * trend crosses of 0 (over, under, either) of the chart and of each of the five timeframes (their trend on each chart
 * bar: the one of their latest completed bar, as the table), and the two entries again ('Bullish Entry' /
 * 'Bearish Entry').
 *
 * Reference: "Zero Lag Trend Signals (MTF) [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import { ta, Series, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, TableData, TableCellData } from '../types';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import { backgroundColorOf, foregroundColorOf, type ChartContext } from '../chart-context';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

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
  // The periods and the bars that complete them: the exchange calendar of the chart context (time zone and
  // session), else the UTC calendar rule; grouped and completed by the library (see anchor-period.ts)
  return higherTimeframeBars(bars, tf, context);
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
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; tables: TableData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  // chart.bg_color / chart.fg_color
  const CHART_BG = backgroundColorOf(chart);
  const CHART_FG = foregroundColorOf(chart);
  const n = bars.length;
  const { green, red } = cfg;
  const green70 = String(color.new(green, 70));
  const red70 = String(color.new(red, 70));
  const green90 = String(color.new(green, 90));
  const red90 = String(color.new(red, 90));

  // The trend of the five other timeframes on each chart bar (request.security(syminfo.tickerid, tf, trend)): the
  // trend of their latest completed bar (na before the first one)
  const tfTrends = [cfg.t1, cfg.t2, cfg.t3, cfg.t4, cfg.t5].map((tf) => {
    const { htf, latest } = timeframeBars(bars, tf, chart);
    const htfTrend = n === 0 ? [] : trendOf(htf, cfg.length, cfg.mult).trend;
    return latest.map((k) => (k >= 0 ? htfTrend[k] : NaN));
  });
  // The table: their trend on the last bar
  const signals = tfTrends.map((s) => (n === 0 ? NaN : s[n - 1]));

  const { closeS, zlema, volatility, upperBand, lowerBand, trend } = trendOf(bars, cfg.length, cfg.mult);
  const zlemaS = Series.fromArray(bars, zlema);
  const closeOver = ta.crossover(closeS, zlemaS).toArray();
  const closeUnder = ta.crossunder(closeS, zlemaS).toArray();

  type Point = { time: number; value: number; color?: string };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const markers: MarkerData[] = [];
  const bullEntryFlags: boolean[] = new Array(n).fill(false);
  const bearEntryFlags: boolean[] = new Array(n).fill(false);
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
      markers.push({ id: 'shape0', time, position: 'atPriceTop', price: upperBand[i], shape: 'labelDown', color: red, text: '▼', textColor: CHART_FG, size: 'small' });
    }
    if (tr > 0 && tr1 <= 0 && !isNaN(lowerBand[i])) {
      markers.push({ id: 'shape1', time, position: 'atPriceBottom', price: lowerBand[i], shape: 'labelUp', color: green, text: '▲', textColor: CHART_FG, size: 'small' });
    }
    // plotchar: a cross of the close and the basis in the direction of a trend that is at least one bar old
    bullEntryFlags[i] = !!closeOver[i] && tr === 1 && tr1 === 1;
    bearEntryFlags[i] = !!closeUnder[i] && tr === -1 && tr1 === -1;
    const bullEntry = zlema[i] - volatility[i] * 1.5;
    if (bullEntryFlags[i] && !isNaN(bullEntry)) {
      markers.push({ id: 'char2', time, position: 'atPriceMiddle', price: bullEntry, shape: 'circle', char: '▲', color: green, size: 'tiny' });
    }
    const bearEntry = zlema[i] + volatility[i] * 1.5;
    if (bearEntryFlags[i] && !isNaN(bearEntry)) {
      markers.push({ id: 'char3', time, position: 'atPriceMiddle', price: bearEntry, shape: 'circle', char: '▼', color: red, size: 'tiny' });
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

  // alertcondition() calls: ta.crossover / ta.crossunder / ta.cross of the trends with 0
  const trendFlags = [trend, ...tfTrends].flatMap((s) => {
    const over = crossedOver(s, 0);
    const under = crossedUnder(s, 0);
    return [over, under, over.map((v, i) => v || under[i])];
  });
  const alerts = alertStates(alertConditions, bars, [bullEntryFlags, bearEntryFlags, ...trendFlags, bullEntryFlags, bearEntryFlags]);

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
    alerts,
  };
}

const TREND_ALERTS = ['', ' Time Frame 1', ' Time Frame 2', ' Time Frame 3', ' Time Frame 4', ' Time Frame 5'].flatMap((tf) => [
  `Bullish Trend${tf}`, `Bearish Trend${tf}`, `(Bullish or Bearish) Trend${tf}`,
]);

/** alertcondition() calls of the original (a condition without a message: 'Alert Fired!') */
export const alertConditions: AlertConditionDecl[] = [
  { title: 'Bullish Entry Signal', message: 'Bullish Entry Signal detected. Consider entering a long position.' },
  { title: 'Bearish Entry Signal', message: 'Bearish Entry Signal detected. Consider entering a short position.' },
  ...TREND_ALERTS.map((title) => ({ title, message: 'Alert Fired!' })),
  { title: 'Bullish Entry', message: 'Alert Fired!' },
  { title: 'Bearish Entry', message: 'Alert Fired!' },
].map((d, k) => ({ id: `alert${k}`, ...d }));

export const ZeroLagTrendSignals = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
