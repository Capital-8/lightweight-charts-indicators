/**
 * Market Sentiment Technicals [LuxAlgo]
 *
 * Scores eleven indicators from 0 to 100 and averages them into a market sentiment. Oscillators (RSI, Stochastic %K,
 * Stochastic RSI %K, CCI, Bull Bear Power) are rescaled so that their overbought / oversold levels sit at 75 / 25.
 * Trend indicators (moving average, VWAP bands, Bollinger Bands, Supertrend, market structure) give a buy / sell
 * state; the score is the smoothed position of the close in the range made since the state changed. Linear
 * regression is scored by the correlation of the source with the bar index.
 *
 * The sentiment is plotted as an oscillator with gradient fills and optional divergences (pivots of the oscillator
 * against price). On the last bar a panel (one box per indicator between oversold, neutral and overbought levels)
 * and a meter (a half circle of lines with a needle) are drawn after the last bar, on a scale without unit.
 *
 * Timeframe: the indicators can be computed on a higher timeframe. Its bars are built from the chart bars with the
 * UTC calendar rule of the period helper (see anchor-period.ts for its limits), and a chart bar shows the values of
 * the latest completed bar of that timeframe: on symbols that trade every day a bar whose close reaches the end of the
 * period, on other symbols the last bar of the period (the original also waits for the next bar when the period
 * ends on a holiday or a short session that its exchange calendar does not have). The history of the timeframe starts
 * at the first chart bar, and a daily or longer bar built from intraday bars of a stock can differ from the exchange
 * bar (auction prices and volume). The VWAP anchor periods use the same calendar rule.
 *
 * Chart values read from the optional third argument (see src/chart-context.ts): the symbol name at the start of the
 * panel title (left out without it) and the chart foreground colour of the panel and the meter (#DBDBDB, the value
 * of a dark chart, without it).
 * Limit of the port: the oscillator line width input is not applied to the plot (static plot width).
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Market Sentiment Technicals [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, taCore, Series, color, str, math, timeframe, getSourceSeries, resample, periodsOf,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BoxData, LabelData, LabelStyle, LineDrawingData, MarkerData, PolylineData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import { foregroundColorOf, tickerOf, type ChartContext } from '../chart-context';

type MaType = 'SMA' | 'EMA' | 'HMA' | 'RMA' | 'WMA' | 'VWMA';

export interface MarketSentimentTechnicalsInputs {
  /** Timeframe of the indicators (a timeframe below the chart timeframe is the chart timeframe) */
  indiTf: 'Chart' | '5 Minutes' | '15 Minutes' | '1 Hour' | '4 Hours' | '1 Day' | '1 Week' | '1 Month';
  /** Distance of the panel and the meter from the last bar, in bars */
  hOffset: number;
  bullColor: string;
  bearColor: string;
  panelShow: boolean;
  panelHeight: number;
  mrktMtrShow: boolean;
  mrktOscShow: boolean;
  mrktOscDivergence: 'Regular' | 'Hidden' | 'All' | 'None';
  mrktOscLnWidth: number;
  mrktOscHeight: number;
  rsiSource: SourceType;
  rsiLength: number;
  stochLengthK: number;
  stochSmoothK: number;
  stochRsiLengthK: number;
  stochRsiSmoothK: number;
  stochRsiSourceRsi: SourceType;
  stochRsiLengthRsi: number;
  cciSource: SourceType;
  cciLength: number;
  bbpLength: number;
  maType: MaType;
  maLength: number;
  vwapAnchor: 'Auto' | 'Day' | 'Week' | 'Month' | 'Quarter' | 'Year';
  vwapStDev: number;
  bbType: MaType;
  bbSource: SourceType;
  bbLength: number;
  bbMult: number;
  stPeriod: number;
  stFactor: number;
  lrSource: SourceType;
  lrLength: number;
  msLength: number;
  normSmooth: number;
}

export const defaultInputs: MarketSentimentTechnicalsInputs = {
  indiTf: 'Chart',
  hOffset: 17,
  bullColor: '#085def',
  bearColor: '#f10707',
  panelShow: true,
  panelHeight: 3,
  mrktMtrShow: true,
  mrktOscShow: true,
  mrktOscDivergence: 'None',
  mrktOscLnWidth: 1,
  mrktOscHeight: 3.5,
  rsiSource: 'close',
  rsiLength: 14,
  stochLengthK: 14,
  stochSmoothK: 3,
  stochRsiLengthK: 14,
  stochRsiSmoothK: 3,
  stochRsiSourceRsi: 'close',
  stochRsiLengthRsi: 14,
  cciSource: 'hlc3',
  cciLength: 20,
  bbpLength: 13,
  maType: 'SMA',
  maLength: 20,
  vwapAnchor: 'Auto',
  vwapStDev: 2,
  bbType: 'SMA',
  bbSource: 'close',
  bbLength: 20,
  bbMult: 2.0,
  stPeriod: 10,
  stFactor: 3,
  lrSource: 'close',
  lrLength: 25,
  msLength: 5,
  normSmooth: 3,
};

const MA_TYPES = ['SMA', 'EMA', 'HMA', 'RMA', 'WMA', 'VWMA'];
const G_GENERIC = 'Generic Settings';
const G_PANEL = 'Indicators Sentiment Panel';
const G_OSC = 'Market Sentiment Oscillator';
const G_RSI = 'Relative Strength Index Settings';
const G_STOCH = 'Stochastic %K Settings';
const G_STOCH_RSI = 'Stochastic RSI Fast Settings';
const G_CCI = 'Commodity Channel Index Settings';
const G_VWAP = 'VWAP Settings';
const G_BB = 'Bollinger Bands Settings';
const G_ST = 'Supertrend Settings';
const G_LR = 'Linear Regression Settings';

export const inputConfig: InputConfig[] = [
  { id: 'indiTf', type: 'string', title: 'Timeframe', defval: 'Chart', options: ['Chart', '5 Minutes', '15 Minutes', '1 Hour', '4 Hours', '1 Day', '1 Week', '1 Month'], group: G_GENERIC },
  { id: 'hOffset', type: 'int', title: 'Horizontal Offset', defval: 17, min: 10, max: 360, group: G_GENERIC },
  { id: 'bullColor', type: 'color', title: 'Gradient Colors: Bullish', defval: '#085def', inline: 'CSS', group: G_GENERIC },
  { id: 'bearColor', type: 'color', title: 'Bearish', defval: '#f10707', inline: 'CSS', group: G_GENERIC },
  { id: 'panelShow', type: 'bool', title: 'Indicators Sentiment Panel', defval: true, group: G_PANEL },
  { id: 'panelHeight', type: 'int', title: '  Panel Height', defval: 3, min: 2, max: 7, group: G_PANEL },
  { id: 'mrktMtrShow', type: 'bool', title: 'Market Sentiment Meter', defval: true, group: 'Market Sentiment Meter' },
  { id: 'mrktOscShow', type: 'bool', title: 'Market Sentiment Oscillator', defval: true, group: G_OSC },
  { id: 'mrktOscDivergence', type: 'string', title: '  Show Divergence', defval: 'None', options: ['Regular', 'Hidden', 'All', 'None'], group: G_OSC },
  { id: 'mrktOscLnWidth', type: 'int', title: '  Oscillator Line Width', defval: 1, min: 1, group: G_OSC },
  { id: 'mrktOscHeight', type: 'float', title: '  Oscillator Height', defval: 3.5, min: 0, step: 0.5, group: G_OSC },
  { id: 'rsiSource', type: 'source', title: '  Source', defval: 'close', group: G_RSI },
  { id: 'rsiLength', type: 'int', title: '  Length', defval: 14, min: 1, group: G_RSI },
  { id: 'stochLengthK', type: 'int', title: '  Stochastic %K Length', defval: 14, min: 1, group: G_STOCH },
  { id: 'stochSmoothK', type: 'int', title: '  %K Smoothing', defval: 3, min: 1, group: G_STOCH },
  { id: 'stochRsiLengthK', type: 'int', title: '  Stochastic Length', defval: 14, min: 1, group: G_STOCH_RSI },
  { id: 'stochRsiSmoothK', type: 'int', title: '  %K Smoothing', defval: 3, min: 1, group: G_STOCH_RSI },
  { id: 'stochRsiSourceRsi', type: 'source', title: '  RSI Source', defval: 'close', group: G_STOCH_RSI },
  { id: 'stochRsiLengthRsi', type: 'int', title: '  RSI Length', defval: 14, min: 1, group: G_STOCH_RSI },
  { id: 'cciSource', type: 'source', title: '  Source', defval: 'hlc3', group: G_CCI },
  { id: 'cciLength', type: 'int', title: '  Length', defval: 20, min: 1, group: G_CCI },
  { id: 'bbpLength', type: 'int', title: '  Length', defval: 13, min: 1, group: 'Bull Bear Power Settings' },
  { id: 'maType', type: 'string', title: '  Type', defval: 'SMA', options: MA_TYPES, group: 'MA Settings' },
  { id: 'maLength', type: 'int', title: '  Length', defval: 20, min: 1, group: 'MA Settings' },
  { id: 'vwapAnchor', type: 'string', title: '  Anchor', defval: 'Auto', options: ['Auto', 'Day', 'Week', 'Month', 'Quarter', 'Year'], group: G_VWAP },
  { id: 'vwapStDev', type: 'float', title: '  StdDev', defval: 2, min: 1, group: G_VWAP },
  { id: 'bbType', type: 'string', title: '  Basis Type', defval: 'SMA', options: MA_TYPES, group: G_BB },
  { id: 'bbSource', type: 'source', title: '  Source', defval: 'close', group: G_BB },
  { id: 'bbLength', type: 'int', title: '  Length', defval: 20, min: 1, group: G_BB },
  { id: 'bbMult', type: 'float', title: '  StdDev', defval: 2.0, min: 0.01, max: 50, group: G_BB },
  { id: 'stPeriod', type: 'int', title: '  ATR Length', defval: 10, min: 1, group: G_ST },
  { id: 'stFactor', type: 'float', title: '  Factor', defval: 3, min: 2, step: 0.1, group: G_ST },
  { id: 'lrSource', type: 'source', title: '  Source', defval: 'close', group: G_LR },
  { id: 'lrLength', type: 'int', title: '  Length', defval: 25, min: 1, group: G_LR },
  { id: 'msLength', type: 'int', title: '  Length', defval: 5, min: 1, group: 'Market Structure Settings' },
  { id: 'normSmooth', type: 'int', title: '  Smoothing', defval: 3, min: 1, group: 'Normalization Settings - Trend Indicators' },
];

const GRAY = '#787b86';
const LEVEL_CSS = String(color.new(GRAY, 63));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Oscillator', color: '#2962FF', lineWidth: 1 },
  { id: 'plot1', title: 'Overbought Level', color: LEVEL_CSS, lineWidth: 1 },
  { id: 'plot2', title: 'Equilibrium Level', color: LEVEL_CSS, lineWidth: 1 },
  { id: 'plot3', title: 'Oversold Level', color: LEVEL_CSS, lineWidth: 1 },
  { id: 'plot4', title: 'Regular Bullish', color: '#085def', lineWidth: 2, offset: -5 },
  { id: 'plot5', title: 'Hidden Bullish', color: String(color.new('#085def', 73)), lineWidth: 2, offset: -5 },
  { id: 'plot6', title: 'Regular Bearish', color: '#f10707', lineWidth: 2, offset: -5 },
  { id: 'plot7', title: 'Hidden Bearish', color: String(color.new('#f10707', 73)), lineWidth: 2, offset: -5 },
  { id: 'plot8', title: 'Panel Location', color: 'transparent', lineWidth: 1 },
];

export const metadata = {
  title: 'Market Sentiment Technicals [LuxAlgo]',
  shortTitle: 'LuxAlgo - Market Sentiment Technicals',
  overlay: true,
};

/** color.black of Pine v5, the default text colour of a label */
const LABEL_TEXT = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

const interpolate = (value: number, valueHigh: number, valueLow: number, rangeHigh: number, rangeLow: number) =>
  rangeLow + ((value - valueLow) * (rangeHigh - rangeLow)) / (valueHigh - valueLow);

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars, and for each chart bar the index of the latest completed bar of that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  // With the exchange calendar of the chart context (time zone and session): the periods and the bars that
  // complete them come from the library rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) {
    // the time of a bar of the timeframe: its first chart bar
    const htf = exchange.htf.map((b, k) => ({ ...b, time: bars[exchange.first[k]].time }));
    return { htf, latest: exchange.latest };
  }
  const n = bars.length;
  // Without it: the periods of the UTC calendar rule (anchor-period.ts), grouped by the library (`resample`)
  const starts = periodStarts(bars, tf);
  const { bars: grouped, group } = resample(bars, starts);
  // the time of a bar of the timeframe: its first chart bar
  const first: number[] = [];
  group.forEach((g, i) => { if (g === first.length) first.push(i); });
  const htf = grouped.map((b, k) => ({ ...b, time: bars[first[k]].time }));

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
  // trading day before; else it is on the next weekday. (The library rule `periodsOf` takes the last bar as the end
  // of its period: without an exchange calendar it cannot know the next bar, so the port keeps this test.)
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
  // completion rule of the library: a bar completes its period when it is the last bar of the period and reaches
  // its end; a new period completes the ones before
  const reaches = bars.map((_b, i) => (!calendar || closeStarts[i] !== starts[i]) && (i < n - 1 || lastEnds));
  const { latest } = periodsOf(starts, starts, reaches);
  return { htf, latest };
}

/** scoreLeft(): number of lit segments of the left half of the meter */
function scoreLeft(value: number): number {
  const steps: Array<[number, number]> = [
    [48.5, 13], [45.3, 12], [45, 11], [42, 10], [38.63, 9], [35.2, 8], [33.3, 7], [31.5, 6], [27.5, 5], [23.1, 4], [20, 3], [15.5, 2], [0, 1],
  ];
  for (const [level, score] of steps) if (ge(value, level)) return score;
  return NaN;
}

/** scoreRight(): number of lit segments of the right half of the meter */
function scoreRight(value: number): number {
  const steps: Array<[number, number]> = [
    [51.6, 0], [54.75, 1], [55.5, 2], [58.1, 3], [61.39, 4], [64.8, 5], [66.5, 6], [68.6, 7], [72.53, 8], [76.3, 9], [78.8, 10], [82.5, 11], [90, 12],
  ];
  for (const [level, score] of steps) if (lt(value, level)) return score;
  return le(value, 100) ? 13 : NaN;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketSentimentTechnicalsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'boxes' | 'labels' | 'lines' | 'polylines'> & {
  markers: MarkerData[]; boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[]; polylines: PolylineData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // chart.fg_color, and syminfo.ticker (the ticker id without its exchange prefix)
  const CHART_FG = foregroundColorOf(chart);
  const TICKER = tickerOf(chart);
  const { bullColor, bearColor, hOffset } = cfg;
  const height = cfg.mrktOscHeight;

  // timeframe(): the timeframe of the indicators, never below the chart timeframe
  const chartTf = chartTimeframe(bars, chart);
  const period = chartTf.replace(/^1([DWM])$/, '$1'); // timeframe.period
  const chartInfo = chartTf === '' ? null : timeframe.info(chartTf);
  const chartMinutes = chartTf === '' ? NaN : timeframe.in_seconds(chartTf) / 60;
  const intraday = chartInfo !== null && chartInfo.isintraday;
  const daily = chartInfo !== null && chartInfo.isdaily;
  const weekly = chartInfo !== null && chartInfo.isweekly;
  let tf = period;
  if (cfg.indiTf === '5 Minutes' && chartMinutes <= 5) tf = '5';
  else if (cfg.indiTf === '15 Minutes' && chartMinutes <= 15) tf = '15';
  else if (cfg.indiTf === '1 Hour' && chartMinutes <= 60) tf = '60';
  else if (cfg.indiTf === '4 Hours' && chartMinutes <= 240) tf = '240';
  else if (cfg.indiTf === '1 Day' && intraday) tf = 'D';
  else if (cfg.indiTf === '1 Week' && (daily || intraday)) tf = 'W';
  else if (cfg.indiTf === '1 Month' && (weekly || daily || intraday)) tf = 'M';

  const sameTf = chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf);
  const { htf: hb, latest } = sameTf ? { htf: bars, latest: bars.map((_b, i) => i) } : timeframeBars(bars, tf, chart);
  const m = hb.length;

  // ---- collectData(): the indicators on the bars of the timeframe ----
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(hb, a);
  const hClose = hb.map((b) => b.close);
  const hHigh = hb.map((b) => b.high);
  const hLow = hb.map((b) => b.low);
  const hVolume = hb.map((b) => b.volume ?? NaN);
  const closeS = S(hClose);
  const src = (s: SourceType) => getSourceSeries(hb, s);

  const movingAverageValue = (source: Series, length: number, type: MaType): number[] => {
    switch (type) {
      case 'SMA': return A(ta.sma(source, length));
      case 'EMA': return A(ta.ema(source, length));
      case 'HMA':
        if (length === 1) throw new Error("Invalid value of the 'length' argument (0.0) in the 'wma' function");
        return A(ta.hma(source, length));
      case 'RMA': return A(ta.rma(source, length));
      case 'WMA': return A(ta.wma(source, length));
      case 'VWMA': return A(ta.vwma(source, length, S(hVolume)));
      default: return new Array<number>(m).fill(NaN);
    }
  };

  /** normalize(buy, sell, smooth): position of the close in the range made since the state changed */
  const normalize = (buy: (k: number) => boolean, sell: (k: number) => boolean): number[] => {
    let os = 0;
    let max = NaN;
    let min = NaN;
    const raw: number[] = [];
    for (let k = 0; k < m; k++) {
      const prev = k > 0 ? os : NaN; // os[1]
      os = buy(k) ? 1 : sell(k) ? -1 : os;
      const c = hClose[k];
      // math.max / math.min give na when a value is na
      max = os > prev ? c : os < prev ? max : Math.max(c, max);
      min = os < prev ? c : os > prev ? min : Math.min(c, min);
      raw.push((c - min) / (max - min));
    }
    return A(ta.sma(S(raw), cfg.normSmooth)).map((v) => v * 100);
  };

  /** Scale of the stochastic scores: 80 -> 75, 50 -> 50, 20 -> 25 */
  const stochScore = (stoch: number) => (gt(stoch, 80) ? interpolate(stoch, 100, 80, 100, 75)
    : gt(stoch, 50) ? interpolate(stoch, 80, 50, 75, 50)
      : gt(stoch, 20) ? interpolate(stoch, 50, 20, 50, 25)
        : ge(stoch, 0) ? interpolate(stoch, 20, 0, 25, 0) : NaN);

  // rsi()
  const rsiValue = A(ta.rsi(src(cfg.rsiSource), cfg.rsiLength)).map((rsi) => (gt(rsi, 70) ? interpolate(rsi, 100, 70, 100, 75)
    : gt(rsi, 50) ? interpolate(rsi, 70, 50, 75, 50)
      : gt(rsi, 30) ? interpolate(rsi, 50, 30, 50, 25)
        : ge(rsi, 0) ? interpolate(rsi, 30, 0, 25, 0) : NaN));

  // stochastic(lengthK, smoothK)
  const stochValue = A(ta.sma(ta.stoch(closeS, S(hHigh), S(hLow), cfg.stochLengthK), cfg.stochSmoothK)).map(stochScore);

  // stochastic(rsiSource, rsiLength, stochLengthK, stochSmoothK)
  const rsiForStoch = ta.rsi(src(cfg.stochRsiSourceRsi), cfg.stochRsiLengthRsi);
  const stochRsiValue = A(ta.sma(ta.stoch(rsiForStoch, rsiForStoch, rsiForStoch, cfg.stochRsiLengthK), cfg.stochRsiSmoothK)).map(stochScore);

  // cci()
  const cciSrc = A(src(cfg.cciSource));
  const cciMa = A(ta.sma(S(cciSrc), cfg.cciLength));
  const cciDev = A(ta.dev(S(cciSrc), cfg.cciLength));
  const cciValue = cciSrc.map((x, k) => {
    const cci = (x - cciMa[k]) / (0.015 * cciDev[k]);
    if (gt(cci, 100)) return gt(cci, 300) ? 100 : interpolate(cci, 300, 100, 100, 75);
    if (ge(cci, 0)) return interpolate(cci, 100, 0, 75, 50);
    if (lt(cci, -100)) return lt(cci, -300) ? 0 : interpolate(cci, -100, -300, 25, 0);
    if (lt(cci, 0)) return interpolate(cci, 0, -100, 50, 25);
    return NaN;
  });

  // bullBearPower()
  const bbpEma = A(ta.ema(closeS, cfg.bbpLength));
  const bbpRaw = hb.map((b, k) => b.high + b.low - 2 * bbpEma[k]);
  const [, bbpUpperS, bbpLowerS] = ta.bb(S(bbpRaw), 100, 2);
  const bbpUpper = A(bbpUpperS);
  const bbpLower = A(bbpLowerS);
  const bbpValue = bbpRaw.map((bbp, k) => {
    const upper = bbpUpper[k];
    const lower = bbpLower[k];
    if (gt(bbp, upper)) return gt(bbp, 1.5 * upper) ? 100 : interpolate(bbp, 1.5 * upper, upper, 100, 75);
    if (gt(bbp, 0)) return interpolate(bbp, upper, 0, 75, 50);
    if (lt(bbp, lower)) return lt(bbp, 1.5 * lower) ? 0 : interpolate(bbp, lower, 1.5 * lower, 25, 0);
    if (lt(bbp, 0)) return interpolate(bbp, 0, lower, 50, 25);
    return NaN;
  });

  // movingAverage()
  const maBasis = movingAverageValue(closeS, cfg.maLength, cfg.maType);
  const maValue = normalize((k) => gt(hClose[k], maBasis[k]), (k) => lt(hClose[k], maBasis[k]));

  // vwapBands(): ta.vwap(close, timeframe.change(autoAnchor(anchor)), stdev)
  const tfInfo = chartTf === '' ? null : timeframe.info(sameTf ? chartTf : tf);
  let anchorTf = '';
  switch (cfg.vwapAnchor) {
    case 'Auto':
      if (tfInfo === null) anchorTf = '';
      else if (tfInfo.isintraday) anchorTf = tfInfo.multiplier <= 15 ? 'D' : 'W';
      else if (tfInfo.isdaily) anchorTf = 'M';
      else if (tfInfo.isweekly) anchorTf = '3M';
      else if (tfInfo.ismonthly) anchorTf = '12M';
      break;
    case 'Day': anchorTf = 'D'; break;
    case 'Week': anchorTf = 'W'; break;
    case 'Month': anchorTf = 'M'; break;
    case 'Quarter': anchorTf = '3M'; break;
    default: anchorTf = '12M';
  }
  let vwapUpper = new Array<number>(m).fill(NaN);
  let vwapLower = new Array<number>(m).fill(NaN);
  if (anchorTf !== '') {
    // on the bars of the timeframe: the chart context with that timeframe
    const anchorStarts = periodStarts(hb, anchorTf, chart && !sameTf ? { ...chart, timeframe: tf } : chart);
    // timeframe.change() is false on the first bar: the VWAP is na before the first new period
    const anchor = anchorStarts.map((s, k) => k > 0 && s !== anchorStarts[k - 1]);
    const [, upper, lower] = taCore.vwap(hClose, hVolume, anchor, cfg.vwapStDev);
    vwapUpper = Array.from(upper, (v) => v ?? NaN);
    vwapLower = Array.from(lower, (v) => v ?? NaN);
  }
  const vwapValue = normalize((k) => gt(hClose[k], vwapUpper[k]), (k) => lt(hClose[k], vwapLower[k]));

  // bollingerBands()
  const bbSrc = src(cfg.bbSource);
  const bbBasis = movingAverageValue(bbSrc, cfg.bbLength, cfg.bbType);
  const bbDev = A(ta.stdev(bbSrc, cfg.bbLength)).map((v) => cfg.bbMult * v);
  const bbValue = normalize((k) => gt(hClose[k], bbBasis[k] + bbDev[k]), (k) => lt(hClose[k], bbBasis[k] - bbDev[k]));

  // supertrend()
  const supertrend = A(ta.supertrend(hb, cfg.stFactor, cfg.stPeriod)[0]);
  const stValue = normalize((k) => gt(hClose[k], supertrend[k]), (k) => lt(hClose[k], supertrend[k]));

  // linearRegression(): 50 * ta.correlation(source, bar_index, length) + 50
  const regValue = A(ta.correlation(src(cfg.lrSource), S(hb.map((_b, k) => k)), cfg.lrLength)).map((v) => 50 * v + 50);

  // marketStructure()
  const ph = A(ta.pivothigh(S(hHigh), cfg.msLength, cfg.msLength));
  const pl = A(ta.pivotlow(S(hLow), cfg.msLength, cfg.msLength));
  const msBull: boolean[] = [];
  const msBear: boolean[] = [];
  {
    let phY = NaN;
    let plY = NaN;
    let phCross = false;
    let plCross = false;
    for (let k = 0; k < m; k++) {
      let bull = false;
      let bear = false;
      if (!isNaN(ph[k])) {
        phY = ph[k];
        phCross = false;
      }
      if (!isNaN(pl[k])) {
        plY = pl[k];
        plCross = false;
      }
      if (gt(hClose[k], phY) && !phCross) {
        phCross = true;
        bull = true;
      }
      if (lt(hClose[k], plY) && !plCross) {
        plCross = true;
        bear = true;
      }
      msBull.push(bull);
      msBear.push(bear);
    }
  }
  const msValue = normalize((k) => msBull[k], (k) => msBear[k]);

  // ---- The values on the chart bars ----
  const scores = [rsiValue, stochValue, stochRsiValue, cciValue, bbpValue, maValue, vwapValue, bbValue, stValue, regValue, msValue];
  const VWAP = 6;
  const onChart = (values: number[], i: number) => (latest[i] >= 0 ? values[latest[i]] : NaN);
  const sentiment: number[] = [];
  for (let i = 0; i < n; i++) {
    // math.avg(...) with nz(vwapValue, 50): na when a score is na
    let sum = 0;
    scores.forEach((values, j) => {
      const v = onChart(values, i);
      sum += j === VWAP && isNaN(v) ? 50 : v;
    });
    sentiment.push(sum / scores.length);
  }

  // ---- Oscillator and divergences ----
  const show = cfg.mrktOscShow;
  const isRegular = cfg.mrktOscDivergence === 'All' || cfg.mrktOscDivergence === 'Regular';
  const isHidden = cfg.mrktOscDivergence === 'All' || cfg.mrktOscDivergence === 'Hidden';
  const osc = sentiment.map((v) => (height * v) / 100);
  const lbR = 5;
  const lbL = 5;
  const rUpper = 60;
  const rLower = 5;
  const C = (a: number[]) => Series.fromArray(bars, a);
  const plFound = A(ta.pivotlow(C(osc), lbL, lbR)).map((v) => !isNaN(v));
  const phFound = A(ta.pivothigh(C(osc), lbL, lbR)).map((v) => !isNaN(v));
  const back = (a: number[]) => a.map((_v, i) => (i >= lbR ? a[i - lbR] : NaN));
  const oscBack = back(osc);
  const lowBack = back(bars.map((b) => b.low));
  const highBack = back(bars.map((b) => b.high));
  const flag = (a: boolean[]) => C(a.map((v) => (v ? 1 : 0)));
  const prevFlag = (a: boolean[]) => C(a.map((_v, i) => (i > 0 && a[i - 1] ? 1 : 0)));
  const when = (cond: boolean[], source: number[]) => A(ta.valuewhen(flag(cond), C(source), 1));
  // _inRange(cond[1]): rLower <= ta.barssince(cond[1]) <= rUpper
  const inRange = (cond: boolean[]) => A(ta.barssince(prevFlag(cond))).map((v) => rLower <= v && v <= rUpper);
  const plInRange = inRange(plFound);
  const phInRange = inRange(phFound);
  const plOsc = when(plFound, oscBack);
  const plLow = when(plFound, lowBack);
  const phOsc = when(phFound, oscBack);
  const phHigh = when(phFound, highBack);

  type Point = { time: number; value: number; color?: string };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const plot5: Point[] = [];
  const plot6: Point[] = [];
  const plot7: Point[] = [];
  const plot8: Point[] = [];
  const markers: MarkerData[] = [];
  const bullHidden = String(color.new(bullColor, 73));
  const bearHidden = String(color.new(bearColor, 73));
  const bullSolid = String(color.new(bullColor, 0));
  const bearSolid = String(color.new(bearColor, 0));
  const locator = 5.25 + cfg.panelHeight + cfg.panelHeight + 0.5;

  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    plot0.push({
      time, value: show ? osc[i] : NaN,
      color: String(color.from_gradient(height * sentiment[i], 0, height * 100, bearColor, bullColor) ?? 'transparent'),
    });
    plot1.push({ time, value: show ? height * 0.75 : NaN });
    plot2.push({ time, value: show ? height * 0.5 : NaN });
    plot3.push({ time, value: show ? height * 0.25 : NaN });
    plot8.push({ time, value: locator, color: 'transparent' });

    const oscHL = gt(oscBack[i], plOsc[i]) && plInRange[i];
    const priceLL = lt(lowBack[i], plLow[i]);
    const bullCond = show && isRegular && priceLL && oscHL && plFound[i];
    const oscLL = lt(oscBack[i], plOsc[i]) && plInRange[i];
    const priceHL = gt(lowBack[i], plLow[i]);
    const hiddenBullCond = show && isHidden && priceHL && oscLL && plFound[i];
    const oscLH = lt(oscBack[i], phOsc[i]) && phInRange[i];
    const priceHH = gt(highBack[i], phHigh[i]);
    const bearCond = show && isRegular && priceHH && oscLH && phFound[i];
    const oscHH = gt(oscBack[i], phOsc[i]) && phInRange[i];
    const priceLH = lt(highBack[i], phHigh[i]);
    const hiddenBearCond = show && isHidden && priceLH && oscHH && phFound[i];

    // offset = -lbR: the value of bar i is drawn on bar i - lbR
    if (i >= lbR) {
      const t = bars[i - lbR].time;
      const price = oscBack[i];
      plot4.push({ time: t, value: plFound[i] ? price : NaN, color: bullCond ? bullColor : 'transparent' });
      plot5.push({ time: t, value: plFound[i] ? price : NaN, color: hiddenBullCond ? bullHidden : 'transparent' });
      plot6.push({ time: t, value: phFound[i] ? price : NaN, color: bearCond ? bearColor : 'transparent' });
      plot7.push({ time: t, value: phFound[i] ? price : NaN, color: hiddenBearCond ? bearHidden : 'transparent' });
      if (!isNaN(price)) {
        if (bullCond) markers.push({ time: t, position: 'atPriceBottom', price, shape: 'labelUp', color: bullSolid });
        if (hiddenBullCond) markers.push({ time: t, position: 'atPriceBottom', price, shape: 'labelUp', color: bullHidden });
        if (bearCond) markers.push({ time: t, position: 'atPriceTop', price, shape: 'labelDown', color: bearSolid });
        if (hiddenBearCond) markers.push({ time: t, position: 'atPriceTop', price, shape: 'labelDown', color: bearHidden });
      }
    }
  }

  // ---- Panel and meter, on the last bar ----
  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const boxes: BoxData[] = [];
  const labels: LabelData[] = [];
  const lines: LineDrawingData[] = [];
  const polylines: PolylineData[] = [];
  const gradient = (value: number, top: number) => String(color.from_gradient(value, 0, top, bearColor, bullColor) ?? 'transparent');

  if (n > 0) {
    const last = n - 1;
    const sent = sentiment[last];
    const x0 = hOffset + last;

    if (cfg.panelShow) {
      const size = cfg.panelHeight;
      const offset = 5.25 + cfg.panelHeight;
      const label = (x: number, y: number, text: string, style: LabelStyle, textColor: string, extra: Partial<LabelData> = {}) => {
        labels.push({ time: T(x), price: y, text, color: 'transparent', style, textColor, ...extra });
      };
      // a box with an na coordinate is not drawn
      const box = (left: number, top: number, right: number, bottom: number, borderColor: string, bgColor: string) => {
        if ([left, top, right, bottom].some((v) => isNaN(v))) return;
        boxes.push({ time1: T(left), price1: top, time2: T(right), price2: bottom, borderColor, bgColor });
      };
      const oscIndies = scores.slice(0, 5).map((values) => onChart(values, last));
      const oscNames = ['R\nS\nI', '%\nK', 'S\nT\nR\nS\nI', 'C\nC\nI', 'B\nB\nP'];
      const oscTitles = ['Relative Strength Index (RSI)', 'Stochastic %K', 'Stochastic RSI %K', 'Commodity Channel Index', 'Bull Bear Power'];
      const trendIndies = scores.slice(5).map((values, j) => {
        const v = onChart(values, last);
        return j + 5 === VWAP && isNaN(v) ? 50 : v;
      });
      const trendNames = ['M\nA', 'V\nW\nA\nP', 'B\nB', 'S\nT', 'R\nE\nG', 'M\nS'];
      const trendTitles = [str.format('Moving Average ({0} {1})', cfg.maType, cfg.maLength), 'Volume Weighted Average Price',
        'Bollinger Bands', 'Supertrend', 'Linear Regression', 'Market Structure'];
      const pSize = oscIndies.length + trendIndies.length;
      const width = 3 * (pSize + 1);

      // timeframeText(): the timeframe of the indicators
      let tfText = tf;
      if (!/[DWMS]/.test(tf)) {
        const minutes = Number(tf);
        tfText = minutes < 60 ? tf + 'm' : str.tostring(minutes / 60) + 'H';
      }
      const closeValue = latest[last] >= 0 ? hClose[latest[last]] : NaN;
      label(x0 + Math.trunc((width - 1) / 2), size + offset + 0.5,
        TICKER + ' (' + str.tostring(closeValue) + ') · ' + tfText, 'label_down', CHART_FG);

      const level = (score: number) => interpolate(score, 100, 0, size, 0) + offset;
      label(x0, level(75), 'Overbought', 'label_right', bullColor);
      label(x0, level(50), 'Neutral', 'label_right', GRAY);
      label(x0, level(25), 'Oversold', 'label_right', bearColor);
      label(x0 + width, level(75), 'Strong Bullish Trend', 'label_left', bullColor);
      label(x0 + width, level(50), 'Trendless', 'label_left', GRAY);
      label(x0 + width, level(25), 'Strong Bearish Trend', 'label_left', bearColor);

      const levelBox = (score: number, css: string) => {
        const y = offset + interpolate(score, 100, 0, size, 0);
        box(x0 - 1, y, x0 + width, y, String(color.new(css, 50)), css);
      };
      levelBox(75, bullColor);
      levelBox(50, GRAY);
      levelBox(25, bearColor);

      box(x0, offset + size + 0.5, x0 + width - 1, offset + size + 0.25, String(color.new(GRAY, 73)), String(color.new(GRAY, 83)));
      box(x0, offset + size + 0.5, x0 + (math.round(((width - 1) * sent) / 100) as number), offset + size + 0.25,
        String(color.new(CHART_FG, 73)), gradient(sent, 100));
      const divider = x0 + 3 + 3 * oscIndies.length - 2;
      box(divider, offset + size * 0.85, divider, offset + size * -0.2, String(color.new(GRAY, 75)), 'transparent');

      const score = (title: string, element: number) => title + '\n Calculated Score: ' + str.tostring(element, '#.##');
      oscIndies.forEach((element, index) => {
        box(x0 + 3 * index, offset + interpolate(size * 0.5, 1, 0, 1, 0), x0 + 3 * index + 2,
          offset + interpolate(size * element, 100, 0, 1, 0), 'transparent', gradient(element, 100));
        label(x0 + 3 * index + 1, offset, oscNames[index], 'label_up', CHART_FG, { size: 'tiny', tooltip: score(oscTitles[index], element) });
      });
      trendIndies.forEach((element, index) => {
        const x = x0 + 3 + 3 * (oscIndies.length + index);
        box(x, offset + size * 0.5, x + 2, offset + (size * (element - 0)) / 100, 'transparent', gradient(element, 100));
        label(x + 1, offset, trendNames[index], 'label_up', CHART_FG, { size: 'tiny', tooltip: score(trendTitles[index], element) });
      });
    }

    if (cfg.mrktMtrShow) {
      const radius = 13;
      const coefficient = 0.15;
      const base = 1.1;
      const degrees = (-(sent - 100) * 9) / 5;
      const centre = last + hOffset + 17;
      const arc = (k: number) => base + coefficient * Math.sqrt(Math.pow(radius, 2) - Math.pow(k, 2));
      // a line with an na coordinate is not drawn
      const line = (x1: number, y1: number, x2: number, y2: number, css: string, width: number, style?: 'arrow_right') => {
        if ([x1, y1, x2, y2].some((v) => isNaN(v))) return;
        lines.push({ time1: T(x1), price1: y1, time2: T(x2), price2: y2, color: css, width, ...(style ? { style } : {}) });
      };
      const circulus: Array<{ time: number; price: number }> = [];

      for (let segment = radius; segment >= 0; segment--) {
        circulus.push({ time: T(centre - segment), price: arc(segment) });
        if (ge(sent, 50) || radius - segment <= scoreLeft(sent)) {
          line(centre - segment, arc(segment), centre - segment - 1, arc(segment + 1), gradient(radius - segment, 26), 5);
        }
      }
      for (let segment = radius; segment >= 0; segment--) {
        circulus.push({ time: T(centre + radius - segment), price: arc(radius - segment) });
        if (gt(sent, 50) && radius - segment < scoreRight(sent)) {
          line(centre - segment + radius, arc(radius - segment), centre - segment + radius + 1, arc(radius - segment + 1),
            gradient(2 * radius - segment - 1, 26), 5);
        }
      }
      polylines.push({ points: circulus, curved: false, closed: false, lineColor: String(color.new(CHART_FG, 73)), lineWidth: 5 });

      const rad = math.toradians(degrees) as number;
      const needleX = centre + (math.round((radius - 3) * Math.cos(rad)) as number);
      const needleY = base + coefficient * ((radius - 3) * Math.sin(rad));
      line(centre, base + coefficient, needleX, needleY, String(color.new(CHART_FG, 50)), 3);
      line(centre, base + coefficient, needleX, needleY, String(color.new(CHART_FG, 15)), 1, 'arrow_right');

      labels.push({
        time: T(centre), price: base + coefficient, text: '', color: String(color.new(CHART_FG, 15)), style: 'circle',
        textColor: LABEL_TEXT, size: 'auto', tooltip: str.tostring(sent, '#.#'),
      });
      const mark = (angle: number, text: string, style: LabelStyle, textColor: string) => {
        const a = math.toradians(angle) as number;
        labels.push({
          time: T(centre + (math.round(radius * Math.cos(a)) as number)), price: base + coefficient * (radius * Math.sin(a)),
          text, color: 'transparent', style, textColor,
        });
      };
      mark(160, 'Strong\nBearish', 'label_right', le(sent, 20) ? bearColor : GRAY);
      mark(130, 'Bearish', 'label_lower_right', gt(sent, 20) && le(sent, 40) ? bearColor : GRAY);
      mark(90, 'Neutral', 'label_down', gt(sent, 40) && le(sent, 60) ? CHART_FG : GRAY);
      mark(50, 'Bullish', 'label_lower_left', gt(sent, 60) && le(sent, 80) ? bullColor : GRAY);
      mark(20, 'Strong\nBullish', 'label_left', gt(sent, 80) ? bullColor : GRAY);
    }
  }

  const fillN = <T>(v: T) => new Array<T>(n).fill(v);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5, plot6, plot7, plot8 },
    fills: [
      { plot1: 'plot0', plot2: 'plot2', options: { title: 'Bullish Gradient Fill' },
        gradient: { topValue: fillN(height * 1), bottomValue: fillN(height * 0.5),
          topColor: fillN(String(color.new(bullColor, 0))), bottomColor: fillN(String(color.new(bullColor, 100))) } },
      { plot1: 'plot0', plot2: 'plot2', options: { title: 'Bearish Gradient Fill' },
        gradient: { topValue: fillN(height * 0.5), bottomValue: fillN(height * 0),
          topColor: fillN(String(color.new(bearColor, 100))), bottomColor: fillN(String(color.new(bearColor, 0))) } },
    ],
    markers,
    boxes,
    labels,
    lines,
    polylines,
  };
}

export const MarketSentimentTechnicals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
