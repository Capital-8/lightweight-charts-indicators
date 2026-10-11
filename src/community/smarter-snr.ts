/**
 * Smarter SNR (Support and Ressistance, Trendline, MTF OSC)
 *
 * - Support and resistance: the swing highs and lows (pivots of "Swing Period" bars on each side) are put in a
 *   zigzag order: when two swing lows follow each other, the highest high between them is taken as the swing high
 *   that is missing (and the same for two swing highs). The last three lows are the supports S1 to S3 and the last
 *   three highs the resistances R1 to R3: a line from the swing to 10 bars after the last bar, with a price label.
 *   "Show Zigzag" draws the zigzag lines.
 * - Trendlines: an upper line through the last two pivot highs of the source when the second is lower, a lower line
 *   through the last two pivot lows when the second is higher, extended to the last bar, with a price label. A
 *   label marks the bar where the source crosses a trendline (only the newest one with "Show Newest Break Only").
 * - Dashboard: a label on the right of the last bar with the levels and the trendline prices.
 * - Two tables: a text ("quote"), and the state of a stochastic and an RSI (overbought, oversold or neither) on
 *   three timeframes.
 *
 * All prices shown are cut to a number of decimals taken from the symbol tick: the length of the tick as a text
 * minus 2 (0.01 gives 2 decimals; a tick of 1 gives -1, a multiple of 10). At most 500 lines and 500 labels are
 * kept.
 *
 * Chart values (third argument): the symbol tick (`chart.mintick`; without it 0.01), the chart timeframe
 * (`chart.timeframe`; without it, it is taken from the bars), the state of the last bar (`chart.lastBarConfirmed`:
 * no break label on a bar that is still open; without it the last bar is closed) and the exchange calendar for the
 * table timeframes (without it: the UTC calendar and the bars, see src/anchor-period.ts).
 *
 * Limits of the port:
 * - Table timeframes: the bars of a higher timeframe are built from the chart bars, so the stochastic and the RSI
 *   start at the first chart bar. A timeframe below the chart timeframe needs data that the chart bars do not have:
 *   with "Show Table?" on, the port throws an Error for such a timeframe. The default "Timeframe - B" is 45 minutes:
 *   on a chart above 45 minutes choose another timeframe or switch the table off.
 * - Position of an added swing (the highest high between two lows): the library has no `ta.highestbars` /
 *   `ta.lowestbars` with a length that changes on each bar; the port calls them on the window of each bar.
 *
 * Reference: "Smarter SnR" by hanabil
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © hanabil
 */

import {
  ta, Series, str, math, color, callsite, timeframe, getSourceSeries, barInterval, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import { mintickOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';
import type { LabelData, LineDrawingData, TableData, TableCellData, TablePosition } from '../types';

type LineStyleName = 'Solid' | 'Dashed' | 'Dotted';
type TablePlace = 'Top' | 'Middle' | 'Bot';

export interface SmarterSnrInputs {
  showSnr: boolean;
  showTL: boolean;
  showZZ: boolean;
  zzCol: string;
  showPriceSnr: boolean;
  /** Not used by the original */
  snrType: 'Volume' | 'Swing HiLo';
  /** Swing Period */
  snrPeriod: number;
  lStyleSRI: LineStyleName;
  linWidth: number;
  lineExtendI: 'None' | 'Left' | 'Right' | 'Both';
  supCol: string;
  supTextCol: string;
  supLineCol: string;
  resCol: string;
  resTextCol: string;
  resLineCol: string;
  showPriceTl: boolean;
  newestTL: boolean;
  newestBreak: boolean;
  /** Trendline Period */
  tlPeriod: number;
  srcI: 'Close Body' | 'Shadow';
  lStyleI: LineStyleName;
  /** Trendline Length */
  y2Mult: number;
  lWidth: number;
  lColor: string;
  dash: boolean;
  dashTitle: string;
  dashColor: string;
  dashTextCol: string;
  dashDist: number;
  showTable: boolean;
  quote: string;
  tabPosQuote: TablePlace;
  tabColor: string;
  borderCol: string;
  tabTextCol: string;
  useTab: boolean;
  tf1: string;
  tf2: string;
  tf3: string;
  tabPosI: TablePlace;
  bullCol: string;
  bearCol: string;
  neutralCol: string;
  textCol: string;
  textSizeI: 'Small' | 'Tiny' | 'Normal';
  rsiSource: SourceType;
  rsiPeriod: number;
  obRsi: number;
  osRsi: number;
  /** Not used by the original */
  stochSource: SourceType;
  /** Not used by the original */
  stochPeriod: number;
  periodK: number;
  /** Not used by the original */
  periodD: number;
  smoothK: number;
  obStoch: number;
  osStoch: number;
}

export const defaultInputs: SmarterSnrInputs = {
  showSnr: true,
  showTL: true,
  showZZ: false,
  zzCol: '#363A45',
  showPriceSnr: true,
  snrType: 'Swing HiLo',
  snrPeriod: 20,
  lStyleSRI: 'Solid',
  linWidth: 1,
  lineExtendI: 'None',
  supCol: '#363A4500',
  supTextCol: '#FF5252',
  supLineCol: '#FF5252',
  resCol: '#363A4500',
  resTextCol: '#2962FF',
  resLineCol: '#2962FF',
  showPriceTl: true,
  newestTL: true,
  newestBreak: true,
  tlPeriod: 20,
  srcI: 'Close Body',
  lStyleI: 'Dashed',
  y2Mult: 1,
  lWidth: 1,
  lColor: '#363A45',
  dash: true,
  dashTitle: '😎 Smarter Dashboard 😎',
  dashColor: '#512DA8A6',
  dashTextCol: '#FFFFFF',
  dashDist: 50,
  showTable: true,
  quote: '🎓 Smarter Trade Give Better Pain & Gain 🎓',
  tabPosQuote: 'Top',
  tabColor: '#512DA8A6',
  borderCol: '#363A45',
  tabTextCol: '#FFFFFF',
  useTab: true,
  tf1: '',
  tf2: '45',
  tf3: 'D',
  tabPosI: 'Bot',
  bullCol: '#4CAF50',
  bearCol: '#FF5252',
  neutralCol: '#BBD9FB',
  textCol: '#FFFFFF',
  textSizeI: 'Small',
  rsiSource: 'close',
  rsiPeriod: 14,
  obRsi: 80,
  osRsi: 20,
  stochSource: 'close',
  stochPeriod: 14,
  periodK: 14,
  periodD: 3,
  smoothK: 1,
  obStoch: 80,
  osStoch: 20,
};

const GR1 = 'General';
const GR3 = 'Support and Ressistance';
const GR5 = 'Trendlines';
const GR6 = 'Dashboard';
const GR50 = 'QUOTES';
const GR10 = 'Table';
const GR11 = 'RSI';
const GR12 = 'Stochastic';
const LINE_STYLES = ['Solid', 'Dashed', 'Dotted'];
const PLACES = ['Top', 'Middle', 'Bot'];

export const inputConfig: InputConfig[] = [
  { id: 'showSnr', type: 'bool', title: 'SnR', defval: true, group: GR1 },
  { id: 'showTL', type: 'bool', title: 'TrendLine', defval: true, group: GR1 },
  { id: 'showZZ', type: 'bool', title: 'Show Zigzag', defval: false, group: GR1, inline: '1' },
  { id: 'zzCol', type: 'color', title: '', defval: '#363A45', group: GR1, inline: '1' },
  { id: 'showPriceSnr', type: 'bool', title: 'Show Price', defval: true, group: GR3 },
  { id: 'snrType', type: 'string', title: 'SnR Type', defval: 'Swing HiLo', options: ['Volume', 'Swing HiLo'], group: GR3 },
  { id: 'snrPeriod', type: 'int', title: 'Swing Period', defval: 20, min: 1, group: GR3 },
  { id: 'lStyleSRI', type: 'string', title: 'Line Style', defval: 'Solid', options: LINE_STYLES, group: GR3 },
  { id: 'linWidth', type: 'int', title: 'Linewidth', defval: 1, group: GR3 },
  { id: 'lineExtendI', type: 'string', title: 'Line Extend', defval: 'None', options: ['None', 'Left', 'Right', 'Both'], group: GR3 },
  { id: 'supCol', type: 'color', title: 'Support Label', defval: '#363A4500', group: GR3, inline: '1' },
  { id: 'supTextCol', type: 'color', title: 'Text', defval: '#FF5252', group: GR3, inline: '1' },
  { id: 'supLineCol', type: 'color', title: 'Line', defval: '#FF5252', group: GR3, inline: '1' },
  { id: 'resCol', type: 'color', title: 'Ressistance Label', defval: '#363A4500', group: GR3, inline: '2' },
  { id: 'resTextCol', type: 'color', title: 'Text', defval: '#2962FF', group: GR3, inline: '2' },
  { id: 'resLineCol', type: 'color', title: 'Line', defval: '#2962FF', group: GR3, inline: '2' },
  { id: 'showPriceTl', type: 'bool', title: 'Show Price', defval: true, group: GR5 },
  { id: 'newestTL', type: 'bool', title: 'Show Newest', defval: true, group: GR5 },
  { id: 'newestBreak', type: 'bool', title: 'Show Newest Break Only', defval: true, group: GR5 },
  { id: 'tlPeriod', type: 'int', title: 'Trendline Period', defval: 20, group: GR5 },
  { id: 'srcI', type: 'string', title: 'Source', defval: 'Close Body', options: ['Close Body', 'Shadow'], group: GR5 },
  { id: 'lStyleI', type: 'string', title: 'Line Style', defval: 'Dashed', options: LINE_STYLES, group: GR5, inline: '2' },
  { id: 'y2Mult', type: 'int', title: 'Trendline Length', defval: 1, group: GR5, inline: '2' },
  { id: 'lWidth', type: 'int', title: 'Line Width', defval: 1, group: GR5, inline: '1' },
  { id: 'lColor', type: 'color', title: '', defval: '#363A45', group: GR5, inline: '1' },
  { id: 'dash', type: 'bool', title: 'Dashboard', defval: true, group: GR6 },
  { id: 'dashTitle', type: 'string', title: 'Title', defval: '😎 Smarter Dashboard 😎', group: GR6 },
  { id: 'dashColor', type: 'color', title: 'Label', defval: '#512DA8A6', group: GR6, inline: '3' },
  { id: 'dashTextCol', type: 'color', title: 'Text', defval: '#FFFFFF', group: GR6, inline: '3' },
  { id: 'dashDist', type: 'int', title: 'Dashboard Distance', defval: 50, group: GR6 },
  { id: 'showTable', type: 'bool', title: 'Show Quotes Table', defval: true, group: GR50 },
  { id: 'quote', type: 'string', title: 'Drop Your Quotes Here', defval: '🎓 Smarter Trade Give Better Pain & Gain 🎓', group: GR50 },
  { id: 'tabPosQuote', type: 'string', title: 'Table Position', defval: 'Top', options: PLACES, group: GR50 },
  { id: 'tabColor', type: 'color', title: 'Background', defval: '#512DA8A6', group: GR50 },
  { id: 'borderCol', type: 'color', title: 'Border', defval: '#363A45', group: GR50 },
  { id: 'tabTextCol', type: 'color', title: 'Text', defval: '#FFFFFF', group: GR50 },
  { id: 'useTab', type: 'bool', title: 'Show Table?', defval: true, group: GR10 },
  { id: 'tf1', type: 'timeframe', title: 'Timeframe - A', defval: '', group: GR10 },
  { id: 'tf2', type: 'timeframe', title: 'Timeframe - B', defval: '45', group: GR10 },
  { id: 'tf3', type: 'timeframe', title: 'Timeframe - C', defval: 'D', group: GR10 },
  { id: 'tabPosI', type: 'string', title: 'Table Position', defval: 'Bot', options: PLACES, group: GR10 },
  { id: 'bullCol', type: 'color', title: 'Oversold', defval: '#4CAF50', group: GR10, inline: '1' },
  { id: 'bearCol', type: 'color', title: 'Overbought', defval: '#FF5252', group: GR10, inline: '1' },
  { id: 'neutralCol', type: 'color', title: 'Not Over', defval: '#BBD9FB', group: GR10, inline: '1' },
  { id: 'textCol', type: 'color', title: 'Text', defval: '#FFFFFF', group: GR10, inline: '1' },
  { id: 'textSizeI', type: 'string', title: 'Text Size', defval: 'Small', options: ['Small', 'Tiny', 'Normal'], group: GR10 },
  { id: 'rsiSource', type: 'source', title: 'RSI -- Source', defval: 'close', group: GR11, inline: '1' },
  { id: 'rsiPeriod', type: 'int', title: 'Period', defval: 14, group: GR11, inline: '1' },
  { id: 'obRsi', type: 'int', title: 'Overbought', defval: 80, group: GR11, inline: '2' },
  { id: 'osRsi', type: 'int', title: 'Oversold  ', defval: 20, group: GR11, inline: '2' },
  { id: 'stochSource', type: 'source', title: 'Stochastic -- Source', defval: 'close', group: GR12, inline: '2' },
  { id: 'stochPeriod', type: 'int', title: 'Period', defval: 14, group: GR12, inline: '2' },
  { id: 'periodK', type: 'int', title: 'Period -- K', defval: 14, group: GR12, inline: '1' },
  { id: 'periodD', type: 'int', title: 'D', defval: 3, group: GR12, inline: '1' },
  { id: 'smoothK', type: 'int', title: 'Smooth K', defval: 1, group: GR12, inline: '0' },
  { id: 'obStoch', type: 'int', title: 'Overbought', defval: 80, group: GR12, inline: '2' },
  { id: 'osStoch', type: 'int', title: 'Oversold  ', defval: 20, group: GR12, inline: '2' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Smarter SnR',
  shortTitle: 'Smarter SnR',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;
/** Text colour of a label without one */
const LABEL_TEXT = '#363A45';
const BLACK = '#363A45';
const RED = '#FF5252';

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

const lineStyleOf = (name: LineStyleName) => (name === 'Solid' ? 'solid' : name === 'Dashed' ? 'dashed' : 'dotted');
const positionOf = (place: TablePlace): TablePosition =>
  (place === 'Top' ? 'top_right' : place === 'Bot' ? 'bottom_right' : 'middle_right');

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The x values are times (ms) and not bar indexes */
  byTime: boolean;
  /** 0: zigzag, 1: support, 2: resistance, 3: trendline */
  kind: number;
  deleted: boolean;
}
interface Lb {
  /** 0 to 5: S1, S2, S3, R1, R2, R3; 6 / 7: upper / lower trendline price; 8 / 9: upper / lower break; 10: dashboard */
  kind: number;
  bar: number;
  y: number;
  deleted: boolean;
}

/**
 * request.security(syminfo.ticker, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars, and for each chart bar the index of the latest completed bar of that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`Smarter SnR: the table timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data (choose another timeframe or switch "Show Table?" off)`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods and the bars that
  // complete them come from the library rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, latest: exchange.latest };

  const n = bars.length;
  const starts = periodStarts(bars, tf, context);
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
  // the UTC calendar: the period of the close time is another period. Other symbols: the last bar of a period
  // (the last bar of the data: when the next weekday is in another period).
  const ms = n > 0 && bars[0].time >= 1e12;
  const weekend = (t: number) => {
    const wd = new Date(ms ? t : t * 1000).getUTCDay();
    return wd === 0 || wd === 6;
  };
  const interval = barInterval(bars);
  const closes = bars.map((b) => ({ time: b.time + interval }));
  const calendar = bars.some((b) => weekend(b.time)) && closes.some((b) => weekend(b.time));
  const closeStarts = calendar ? periodStarts(closes, tf, context) : [];
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
    const withNext = periodStarts([...bars, { time: ms ? next : next / 1000 }], tf, context);
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

/** The values of every bar that the drawings of the script read */
function levels(bars: Bar[], cfg: SmarterSnrInputs, chart?: ChartContext) {
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (v: number[]) => Series.fromArray(bars, v);
  /** ta.valuewhen(cond, src, occurrence) */
  const vw = (cond: boolean[], src: number[], occurrence: number) =>
    A(ta.valuewhen(S(cond.map((c) => (c ? 1 : 0))), S(src), occurrence));
  const index = bars.map((_b, i) => i);
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const ms = n > 0 && bars[0].time >= 1e12;
  // Pine times are in ms
  const time = bars.map((b) => (ms ? b.time : b.time * 1000));

  // var int dec = str.length(str.tostring(syminfo.mintick)) - 2
  const dec = str.tostring(mintickOf(chart)).length - 2;
  const factor = math.pow(10, dec);
  const truncate = (v: number) => (isNaN(v) ? NaN : Math.trunc(v * factor) / factor);

  // ---- SnR pivots
  const P = Math.trunc(cfg.snrPeriod);
  const back = (v: number[], k: number) => v.map((_x, i) => (i >= k ? v[i - k] : NaN));
  const ph = A(ta.pivothigh(S(high), P, P)).map(truthy);
  const pl = A(ta.pivotlow(S(low), P, P)).map(truthy);
  const closeP = back(close, P);
  const highP = back(high, P);
  const lowP = back(low, P);
  const either = ph.map((v, i) => v || pl[i]);
  const ph1 = vw(ph, closeP, 1);
  const pl1 = vw(pl, closeP, 1);
  const P1 = vw(either, closeP, 1);

  // f_barssince(cond, count) = bar_index - ta.valuewhen(cond, bar_index, count)
  const barsSince = (cond: boolean[], count: number) => vw(cond, index, count).map((v, i) => i - v);
  // int(math.max(1, nz(f_barssince(...))))
  const windowOf = (cond: boolean[]) => barsSince(cond, 1).map((v) => Math.trunc(Math.max(1, isNaN(v) ? 0 : v)));
  const barPl1 = windowOf(pl);
  const barPh1 = windowOf(ph);
  // ta.highest(high[Period], bar_pl1) / ta.lowest(low[Period], bar_ph1): a length that changes on each bar
  const highestSite = callsite.highest();
  const lowestSite = callsite.lowest();
  const highest1 = highP.map((v, i) => highestSite(v, barPl1[i]));
  const lowest1 = lowP.map((v, i) => lowestSite(v, barPh1[i]));
  // ta.highestbars(high[Period], bar_pl1) / ta.lowestbars(low[Period], bar_ph1) on the window of the bar
  const extremeBars = (source: number[], length: number[], fn: typeof ta.highestbars) => {
    const memo = new Map<number, number>();
    return (i: number): number => {
      let v = memo.get(i);
      if (v === undefined) {
        const len = length[i];
        if (len > i + 1) v = NaN;
        else {
          const window = bars.slice(i - len + 1, i + 1);
          v = fn(new Series(window, (_b, k) => source[i - len + 1 + k]), len).toArray()[len - 1] ?? NaN;
        }
        memo.set(i, v);
      }
      return v;
    };
  };
  const highestbars1 = extremeBars(highP, barPl1, ta.highestbars);
  const lowestbars1 = extremeBars(lowP, barPh1, ta.lowestbars);

  const h = ph;
  const hA = pl.map((v, i) => v && eq(P1[i], pl1[i]));
  const l = pl;
  const lA = ph.map((v, i) => v && eq(P1[i], ph1[i]));
  const h0 = vw(h, highP, 0);
  const h1 = vw(h, highP, 1);
  const hA0 = vw(hA, highest1, 0);
  const l0 = vw(l, lowP, 0);
  const l1 = vw(l, lowP, 1);
  const lA0 = vw(lA, lowest1, 0);

  // ---- Fixed zigzag pivots
  const fixPh = hA.map((v, i) => v || h[i]);
  const fixPl = lA.map((v, i) => v || l[i]);
  // ta.valuewhen(x or xA, close, 0) == ta.valuewhen(x, close, 0): the latest swing is a real pivot
  const lastFixPhClose = vw(fixPh, close, 0);
  const lastHClose = vw(h, close, 0);
  const lastFixPlClose = vw(fixPl, close, 0);
  const lastLClose = vw(l, close, 0);
  const realHigh = lastFixPhClose.map((v, i) => eq(v, lastHClose[i]));
  const realLow = lastFixPlClose.map((v, i) => eq(v, lastLClose[i]));
  const fixPhVal = h0.map((v, i) => (realHigh[i] ? v : hA0[i]));
  const fixPlVal = l0.map((v, i) => (realLow[i] ? v : lA0[i]));
  const sinceFixPh = barsSince(fixPh, 0);
  const sinceFixPl = barsSince(fixPl, 0);
  const offsetPhAt = (i: number) => -sinceFixPh[i] + (realHigh[i] ? -P : highestbars1(i) - P);
  const offsetPlAt = (i: number) => -sinceFixPl[i] + (realLow[i] ? -P : lowestbars1(i) - P);
  // The offsets are read on the bars of a fixed pivot (ta.valuewhen) and, for the zigzag, on the bars of a pivot
  const offsetPh = index.map((i) => (fixPh[i] || fixPl[i] ? offsetPhAt(i) : NaN));
  const offsetPl = index.map((i) => (fixPh[i] || fixPl[i] ? offsetPlAt(i) : NaN));
  const sinceL1 = barsSince(l, 1);
  const sinceH1 = barsSince(h, 1);

  // ---- fVwSeries(): the last three fixed pivots of a side, price and bar offset
  const series3 = (x: boolean[], xVal: number[], xBar: number[]) => [0, 1, 2].map((k) => {
    const since = barsSince(x, k);
    return { price: vw(x, xVal, k).map(truncate), bar: vw(x, xBar, k).map((v, i) => v - since[i]) };
  });
  const supports = series3(fixPl, fixPlVal, offsetPl);
  const resistances = series3(fixPh, fixPhVal, offsetPh);

  // ---- Trendlines
  const period = Math.trunc(cfg.tlPeriod);
  const srcH = cfg.srcI === 'Shadow' ? high : close;
  const srcL = cfg.srcI === 'Shadow' ? low : close;
  const phFound = A(ta.pivothigh(S(srcH), period, period)).map(truthy);
  const plFound = A(ta.pivotlow(S(srcL), period, period)).map(truthy);
  const trendline = (found: boolean[], src: number[], upper: boolean) => {
    const srcBack = back(src, period);
    const val = vw(found, srcBack, 0);
    const val1 = vw(found, srcBack, 1);
    // newUp = phFound and phVal < phVal1 and showTL; newLo = plFound and plVal > plVal1 and showTL
    const cond = found.map((v, i) => v && (upper ? lt(val[i], val1[i]) : gt(val[i], val1[i])) && cfg.showTL);
    // x1Bar_ = f_barssince(found, 1) + period, x2Bar_ = f_barssince(found, 0) + period
    const since1 = barsSince(found, 1);
    const since0 = barsSince(found, 0);
    const timeBack = (i: number, k: number) => (isNaN(k) ? time[i] : i - k >= 0 ? time[i - k] : NaN);
    const x1 = vw(cond, index.map((i) => (cond[i] ? timeBack(i, since1[i] + period) : NaN)), 0);
    const x2 = vw(cond, index.map((i) => (cond[i] ? timeBack(i, since0[i] + period) : NaN)), 0);
    const y1 = vw(cond, val1, 0);
    const y2 = vw(cond, val, 0);
    const slope = vw(cond, index.map((i) => (y2[i] - y1[i]) / (x2[i] - x1[i])), 0);
    const price = index.map((i) => truncate(y2[i] + (time[i] - x2[i]) * slope[i]));
    return { cond, x1, y1, x2, price };
  };
  const upper = trendline(phFound, srcH, true);
  const lower = trendline(plFound, srcL, false);
  // breakUpper = srcH[1] < upperTl[1] and srcH > upperTl; breakLower = srcL[1] > lowerTl[1] and srcL < lowerTl
  const breakUpper = index.map((i) => i > 0 && lt(srcH[i - 1], upper.price[i - 1]) && gt(srcH[i], upper.price[i]));
  const breakLower = index.map((i) => i > 0 && gt(srcL[i - 1], lower.price[i - 1]) && lt(srcL[i], lower.price[i]));

  return {
    time, P, h, hA, l, lA, h1, l1, hA0, lA0, fixPhVal, fixPlVal, offsetPh, offsetPl, sinceL1, sinceH1,
    supports, resistances, upper, lower, breakUpper, breakLower,
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SmarterSnrInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'labels' | 'lines' | 'tables'> & { labels: LabelData[]; lines: LineDrawingData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const v = levels(bars, cfg, chart);
  const { P } = v;
  const ms = n > 0 && bars[0].time >= 1e12;

  // The table values first: a timeframe below the chart timeframe throws before the bar loop
  const chartTf = chartTimeframe(bars, chart).replace(/^1(?=[DWM]$)/, '');
  const rows = cfg.useTab && n > 0 ? [cfg.tf1, cfg.tf2, cfg.tf3].map((tf) => {
    const { htf, latest } = timeframeBars(bars, tf, chart);
    const at = latest[n - 1];
    const S = (fn: (b: Bar) => number) => new Series(htf, fn);
    // ta.sma(ta.stoch(close, high, low, periodK), smoothK) and ta.rsi(rsiSource, rsiPeriod) on the timeframe
    const stoch = ta.stoch(S((b) => b.close), S((b) => b.high), S((b) => b.low), Math.trunc(cfg.periodK));
    const k = ta.sma(stoch, Math.trunc(cfg.smoothK)).toArray();
    const r = ta.rsi(getSourceSeries(htf, cfg.rsiSource), Math.trunc(cfg.rsiPeriod)).toArray();
    const kNow = at >= 0 ? k[at] ?? NaN : NaN;
    const rNow = at >= 0 ? r[at] ?? NaN : NaN;
    return {
      name: tf === '' ? chartTf : tf,
      stoch: gt(kNow, cfg.obStoch) ? 'Overbought' : lt(kNow, cfg.osStoch) ? 'Oversold' : 'Not Over',
      rsi: gt(rNow, cfg.obRsi) ? 'Overbought' : lt(rNow, cfg.osRsi) ? 'Oversold' : 'Not Over',
    };
  }) : [];

  // Live drawings in creation order. When a creation brings the count above max + 5, the oldest are deleted until
  // max remain. A label held by a `var` variable of the script (the two trendline price labels and the latest break
  // label of each side) is never deleted by this limit, but it counts.
  const held = new Set<object>();
  const registry = <T extends { deleted: boolean }>() => {
    const list: T[] = [];
    const add = (o: T): T => {
      list.push(o);
      if (list.length > MAX_OBJECTS + 5) {
        for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
          if (held.has(list[k])) k++;
          else list.splice(k, 1)[0].deleted = true;
        }
      }
      return o;
    };
    const remove = (o: T | null) => {
      if (!o || o.deleted) return;
      o.deleted = true;
      list.splice(list.lastIndexOf(o), 1);
    };
    return { list, add, remove };
  };
  const lines = registry<Ln>();
  const labels = registry<Lb>();
  const newLine = (kind: number, x1: number, y1: number, x2: number, y2: number, byTime = false) =>
    lines.add({ x1, y1, x2, y2, byTime, kind, deleted: false });
  const newLabel = (kind: number, bar: number, y: number) => labels.add({ kind, bar, y, deleted: false });

  const lastConfirmed = lastBarConfirmedOf(chart);
  const snrLine: Array<Ln | null> = [null, null, null, null, null, null];
  const snrLabel: Array<Lb | null> = [null, null, null, null, null, null];
  const tlLine: Array<Ln | null> = [null, null];
  const tlLabel: Array<Lb | null> = [null, null];
  const breakLabel: Array<Lb | null> = [null, null];
  let dashLabel: Lb | null = null;
  const sides = [...v.supports, ...v.resistances];

  for (let i = 0; i < n; i++) {
    // ---- Zigzag
    if (cfg.showZZ) {
      if (v.hA[i]) {
        newLine(0, i + v.offsetPh[i], v.hA0[i], i - P, v.fixPlVal[i]);
        newLine(0, i - v.sinceL1[i] - P, v.l1[i], i + v.offsetPh[i], v.hA0[i]);
      }
      if (v.lA[i]) {
        newLine(0, i + v.offsetPl[i], v.lA0[i], i - P, v.fixPhVal[i]);
        newLine(0, i - v.sinceH1[i] - P, v.h1[i], i + v.offsetPl[i], v.lA0[i]);
      }
      if (v.h[i]) newLine(0, i - P, v.fixPhVal[i], i + v.offsetPl[i], v.fixPlVal[i]);
      if (v.l[i]) newLine(0, i - P, v.fixPlVal[i], i + v.offsetPh[i], v.fixPhVal[i]);
    }

    // ---- fLL(): the six levels, made again on every bar
    if (truthy(bars[i].close) && cfg.showSnr) {
      for (let k = 0; k < 6; k++) {
        const y = sides[k].price[i];
        const before = snrLine[k];
        snrLine[k] = newLine(k < 3 ? 1 : 2, i + sides[k].bar[i], y, i + 10, y);
        lines.remove(before);
        if (cfg.showPriceSnr) {
          const labelBefore = snrLabel[k];
          snrLabel[k] = newLabel(k, i, y);
          labels.remove(labelBefore);
        }
      }
    }

    // ---- f_trendline(): upper, then lower
    [v.upper, v.lower].forEach((t, side) => {
      if (truthy(bars[i].close) && cfg.newestTL) {
        const before = tlLine[side];
        tlLine[side] = newLine(3, t.x1[i], t.y1[i], v.time[i], t.price[i], true);
        lines.remove(before);
      }
      if (t.cond[i] && !cfg.newestTL) {
        // newY2 = x2 + (y2_mult * a_bar_time * 25), a_bar_time = time - time[1]
        const barTimeMs = i > 0 ? v.time[i] - v.time[i - 1] : NaN;
        newLine(3, t.x1[i], t.y1[i], t.x2[i] + cfg.y2Mult * barTimeMs * 25, t.price[i], true);
      }
      if (cfg.showPriceTl) {
        const before = tlLabel[side];
        const label = newLabel(6 + side, i, t.price[i]);
        if (before) held.delete(before);
        held.add(label);
        tlLabel[side] = label;
        labels.remove(before);
      }
    });

    // ---- Breaks of the trendlines, on closed bars
    if (i < n - 1 || lastConfirmed) {
      [v.breakUpper[i], v.breakLower[i]].forEach((broken, side) => {
        if (!broken) return;
        const before = breakLabel[side];
        const label = newLabel(8 + side, i, side === 0 ? bars[i].low : bars[i].high);
        if (before) held.delete(before);
        held.add(label);
        breakLabel[side] = label;
        if (cfg.newestBreak) labels.remove(before);
      });
    }

    // ---- Dashboard
    if (cfg.dash) {
      const before = dashLabel;
      dashLabel = newLabel(10, i, bars[i].close);
      labels.remove(before);
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const fromMs = (t: number) => (ms ? t : t / 1000);
  const snrStyle = lineStyleOf(cfg.lStyleSRI);
  const snrExtend = cfg.lineExtendI === 'None' ? 'none' : cfg.lineExtendI === 'Left' ? 'left' : cfg.lineExtendI === 'Both' ? 'both' : 'right';
  const tlStyle = lineStyleOf(cfg.lStyleI);
  // a line or a label with an na coordinate is not drawn
  const outLines: LineDrawingData[] = lines.list
    .filter((l) => ![l.x1, l.y1, l.x2, l.y2].some((c) => isNaN(c)))
    .map((l) => {
      const time1 = l.byTime ? fromMs(l.x1) : T(l.x1);
      const time2 = l.byTime ? fromMs(l.x2) : T(l.x2);
      if (l.kind === 0) return { time1, price1: l.y1, time2, price2: l.y2, color: cfg.zzCol };
      if (l.kind === 3) return { time1, price1: l.y1, time2, price2: l.y2, color: cfg.lColor, style: tlStyle, width: cfg.lWidth };
      return {
        time1, price1: l.y1, time2, price2: l.y2, color: l.kind === 1 ? cfg.supLineCol : cfg.resLineCol,
        style: snrStyle, width: cfg.linWidth, extend: snrExtend,
      };
    });

  const NAMES = ['S1', 'S2', 'S3', 'R1', 'R2', 'R3'];
  const noneCol = String(color.new(RED, 100));
  /** dashTitle + snrText + trendlineText (a part that is switched off is na: nothing is added) */
  const dashText = (i: number) => {
    const price = (k: number) => str.tostring(sides[k].price[i]);
    const wave = '\n〰️〰️〰️〰️〰️〰️〰️〰️〰️';
    const snrText = cfg.showSnr ? `${wave}\nSupport and Resistance`
      + `\nS1 = ${price(0)}, R1 = ${price(3)}\nS2 = ${price(1)}, R2 = ${price(4)}\nS3 = ${price(2)}, R3 = ${price(5)}` : '';
    const trendlineText = cfg.showTL ? `${wave}\nTrendline Price`
      + `\n🔸 Upper = ${str.tostring(v.upper.price[i])}\n🔸 Lower = ${str.tostring(v.lower.price[i])}` : '';
    return cfg.dashTitle + snrText + trendlineText;
  };
  const outLabels: LabelData[] = labels.list.filter((l) => !isNaN(l.y)).map((l): LabelData => {
    if (l.kind < 6) {
      return {
        time: T(l.bar + 10), price: l.y, text: `${NAMES[l.kind]} -> ${str.tostring(l.y)}`,
        color: l.kind < 3 ? cfg.supCol : cfg.resCol, style: 'label_left', textColor: l.kind < 3 ? cfg.supTextCol : cfg.resTextCol,
      };
    }
    if (l.kind < 8) {
      return {
        time: T(l.bar + 10), price: l.y, text: `${l.kind === 6 ? 'Upper' : 'Lower'} -> ${str.tostring(l.y)}`,
        color: noneCol, style: 'label_left', textColor: l.kind === 6 ? cfg.resTextCol : cfg.supTextCol,
      };
    }
    if (l.kind === 8) return { time: T(l.bar), price: l.y, text: '🔼', color: cfg.resTextCol, style: 'label_up', textColor: LABEL_TEXT };
    if (l.kind === 9) return { time: T(l.bar), price: l.y, text: '🔽', color: cfg.supTextCol, style: 'label_down', textColor: LABEL_TEXT };
    return {
      time: T(l.bar + Math.trunc(cfg.dashDist)), price: l.y, text: dashText(l.bar), color: cfg.dashColor,
      style: 'label_center', textColor: cfg.dashTextCol,
    };
  });

  // ---- Tables (made on the first bar)
  const tables: TableData[] = [];
  if (n > 0) {
    tables.push({
      position: positionOf(cfg.tabPosQuote), columns: 1, rows: 1, bgColor: cfg.tabColor,
      frameColor: cfg.borderCol, frameWidth: 1, borderColor: cfg.borderCol, borderWidth: 1,
      cells: cfg.showTable ? [{ column: 0, row: 0, text: cfg.quote, textColor: cfg.tabTextCol, textSize: 'small' }] : [],
    });
    const textSize = cfg.textSizeI === 'Small' ? 'small' : cfg.textSizeI === 'Tiny' ? 'tiny' : 'normal';
    const cell = (column: number, row: number, text: string, bgColor: string): TableCellData =>
      ({ column, row, text, textColor: cfg.textCol, textSize, bgColor });
    const stateColor = (state: string) => (state === 'Overbought' ? cfg.bearCol : state === 'Oversold' ? cfg.bullCol : cfg.neutralCol);
    const cells: TableCellData[] = [];
    if (rows.length > 0) {
      cells.push(cell(0, 0, 'Timeframe', cfg.dashColor), cell(1, 0, 'Stochastic', cfg.dashColor), cell(2, 0, 'RSI', cfg.dashColor));
      rows.forEach((r, k) => {
        cells.push(cell(0, k + 1, r.name, cfg.dashColor), cell(1, k + 1, r.stoch, stateColor(r.stoch)), cell(2, k + 1, r.rsi, stateColor(r.rsi)));
      });
    }
    tables.push({
      position: positionOf(cfg.tabPosI), columns: 50, rows: 50, bgColor: String(color.new(BLACK, 100)),
      frameColor: BLACK, frameWidth: 1, borderColor: BLACK, borderWidth: 1, cells,
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: outLines,
    labels: outLabels,
    tables,
  };
}

export const SmarterSnr = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
