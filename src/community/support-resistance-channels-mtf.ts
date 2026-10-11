/**
 * Support Resistance Channels/Zones Multi Time Frame
 *
 * Support / resistance channels from the pivot points of a higher timeframe, calculated on the last bar.
 * - The highs and lows of the last 'Loopback Period' bars of the higher timeframe are read. A high (low) that is
 *   the highest (lowest) of the 'Pivot Period' bars on each side is a pivot point.
 * - Around each pivot a channel collects the pivots that fit in the maximum channel width (a % of the distance
 *   between the highest and the lowest pivot). Its strength is 20 per pivot, plus 1 for each of the last 500 chart
 *   bars with its open, high, low or close inside the channel.
 * - The strongest channels that do not share pivots are kept (up to 10, at least 'Minimum Strength' pivots) and
 *   sorted by strength with the swap of the original (the strength list itself is not fully swapped, so the order
 *   is not always strictly by strength).
 * - Each of the first 'Maximum Number of S/R' channels is drawn as a box extended both ways: resistance colour
 *   when the channel is above the close, support colour when below, else the in-channel colour. With 'Show S/Rs
 *   that fits the Chart' only the channels inside the price range of the visible bars (plus 5 %) are drawn.
 * - The table lists the channels (rank, kind, low, high).
 *
 * Visible range: with 'Show S/Rs that fits the Chart' the indicator reads the first and the last visible bar of
 * the chart (`leftVisibleBarTime` / `rightVisibleBarTime` of the chart context, third argument of calculate). It
 * must be calculated again when the user scrolls or zooms. Without these values the range is all the bars. As in
 * the original, the visible price range is used only when the last visible bar is the last bar; otherwise the
 * range is the last bar alone. A visible range of more than 15,000 bars throws the Error of the original (its
 * highest / lowest window limit).
 *
 * Chart values (third argument): the port also reads the symbol tick (levels in the table are rounded to it;
 * without it: 0.01).
 *
 * Other timeframe: the bars of the higher timeframe are built from the chart bars. With the exchange time zone and
 * the session of the symbol in the chart context (`timezone`, `session`) the periods are those of the exchange
 * calendar, see src/anchor-period.ts; without them the UTC calendar and the bars. `timeframe`, when given, is the
 * chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Limits of the port:
 * - The higher timeframe bars come from the chart bars: when the chart bars cover fewer than 'Loopback Period'
 *   bars of the higher timeframe, the older ones are missing (the original reads them from the full history).
 * - A timeframe lower than the chart timeframe throws the Error of the original ('You should choose Time Frame wisely').
 * - 2 alert conditions of the original (resistance broken, support broken) give no output.
 *
 * Reference: "Support Resistance Channels/Zones Multi Time Frame" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import { array, color, math, str, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { chartTimeframe, periodStarts, securityBars } from '../anchor-period';
import { barTime } from '../bar-time';
import type { BoxData, TableCellData, TableData, TablePosition } from '../types';
import { mintickOf, visibleRangeOf, type ChartContext } from '../chart-context';

export interface SupportResistanceChannelsMtfInputs {
  /** Higher Time Frame */
  tf: string;
  /** Pivot Period */
  prd: number;
  /** Loopback Period */
  loopback: number;
  /** Maximum Channel Width % */
  channelW: number;
  /** Minimum Strength */
  minstrength: number;
  /** Maximum Number of S/R */
  maxnumsr: number;
  /** Show S/Rs that fits the Chart */
  showsrfit: boolean;
  /** Show S/R channels in a table */
  showtable: boolean;
  /** Chart Location (vertical) */
  tableposy: 'bottom' | 'middle' | 'top';
  /** Chart Location (horizontal) */
  tableposx: 'left' | 'center' | 'right';
  /** Resistance Color */
  resCol: string;
  /** Support Color */
  supCol: string;
  /** Color When Price in Channel */
  inchCol: string;
}

export const defaultInputs: SupportResistanceChannelsMtfInputs = {
  tf: 'D',
  prd: 5,
  loopback: 250,
  channelW: 6,
  minstrength: 2,
  maxnumsr: 6,
  showsrfit: true,
  showtable: true,
  tableposy: 'bottom',
  tableposx: 'left',
  resCol: 'rgba(255, 82, 82, 0.25)',
  supCol: 'rgba(0, 230, 118, 0.25)',
  inchCol: 'rgba(120, 123, 134, 0.25)',
};

export const inputConfig: InputConfig[] = [
  { id: 'tf', type: 'timeframe', title: 'Higher Time Frame', defval: 'D' },
  {
    id: 'prd', type: 'int', title: 'Pivot Period', defval: 5, min: 1, max: 30,
    tooltip: 'Used while calculating Pivot Points, checks left&right bars',
  },
  {
    id: 'loopback', type: 'int', title: 'Loopback Period', defval: 250, min: 50, max: 400,
    tooltip: 'While calculating S/R levels it checks Pivots in Loopback Period',
  },
  {
    id: 'channelW', type: 'float', title: 'Maximum Channel Width %', defval: 6, min: 1, max: 15,
    tooltip: 'Calculated using Highest/Lowest levels in 300 bars',
  },
  {
    id: 'minstrength', type: 'int', title: 'Minimum Strength', defval: 2, min: 1,
    tooltip: 'Channel must contain at least X Pivot Points',
  },
  {
    id: 'maxnumsr', type: 'int', title: 'Maximum Number of S/R', defval: 6, min: 1, max: 10,
    tooltip: 'Maximum number of Support/Resistance Channels to Show',
  },
  { id: 'showsrfit', type: 'bool', title: 'Show S/Rs that fits the Chart', defval: true },
  { id: 'showtable', type: 'bool', title: 'Show S/R channels in a table', defval: true },
  { id: 'tableposy', type: 'string', title: 'Chart Location', defval: 'bottom', options: ['bottom', 'middle', 'top'], inline: 'chartpos' },
  { id: 'tableposx', type: 'string', title: '', defval: 'left', options: ['left', 'center', 'right'], inline: 'chartpos' },
  { id: 'resCol', type: 'color', title: 'Resistance Color', defval: 'rgba(255, 82, 82, 0.25)' },
  { id: 'supCol', type: 'color', title: 'Support Color', defval: 'rgba(0, 230, 118, 0.25)' },
  { id: 'inchCol', type: 'color', title: 'Color When Price in Channel', defval: 'rgba(120, 123, 134, 0.25)' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Support Resistance Channels/Zones Multi Time Frame',
  shortTitle: 'SRMTF',
  overlay: true,
};

/** The indicator reads the visible range of the chart: calculate again when the user scrolls or zooms */
export const usesVisibleRange = true;

/** Longest window of ta.highest / ta.lowest */
const MAX_WINDOW = 15000;

/** Pine float comparisons within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => a - b <= EPS;
const isZero = (a: number) => Math.abs(a) <= EPS;

/** Pine `==` of two colours */
const sameColour = (a: string, b: string) =>
  color.r(a) === color.r(b) && color.g(a) === color.g(b) && color.b(a) === color.b(b) && color.t(a) === color.t(b);

/** Highs and lows of the bars of timeframe `tf`, built from the chart bars (the last one is the period in progress). */
function timeframeHighLow(bars: Bar[], tf: string, chart?: ChartContext): Array<{ high: number; low: number }> {
  const chartTf = chartTimeframe(bars, chart);
  if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) return bars;
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    // the original stops here too (its request gives na)
    throw new Error('You should choose Time Frame wisely');
  }
  const exchange = securityBars(bars, tf, chart);
  if (exchange) return exchange.htf;
  const starts = periodStarts(bars, tf, chart);
  const htf: Array<{ high: number; low: number }> = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ high: b.high, low: b.low });
    } else {
      const last = htf[htf.length - 1];
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
    }
  });
  return htf;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupportResistanceChannelsMtfInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { prd, loopback, minstrength, showsrfit, showtable } = cfg;
  const maxnumsr = cfg.maxnumsr - 1;
  const boxes: BoxData[] = [];
  const tables: TableData[] = [];
  const result = () => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
    tables,
  });
  const n = bars.length;
  if (n === 0) return result();

  // matrix.rows(hlmatrix) < prd * 10
  if (loopback < prd * 10) {
    throw new Error('There is not enough candles on Time Frame you choose. You better choose Time Frame wisely');
  }

  // highs and lows of the last `loopback` bars of the higher timeframe, newest first (na where there is no bar)
  const htf = timeframeHighLow(bars, cfg.tf, chart);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let x = 0; x < loopback; x++) {
    const b = htf[htf.length - 1 - x];
    highs.push(b ? b.high : NaN);
    lows.push(b ? b.low : NaN);
  }

  // pivot points
  const pivotvals: number[] = [];
  for (let x = prd; x <= highs.length - prd - 1; x++) {
    if (ge(highs[x], array.max(highs.slice(x - prd, x + prd + 1)))) pivotvals.push(highs[x]);
    if (le(lows[x], array.min(lows.slice(x - prd, x + prd + 1)))) pivotvals.push(lows[x]);
  }
  const count = pivotvals.length;
  // `for x = 0 to array.size(pivotvals) - 1` runs with x = 0 on an empty array
  if (count === 0) throw new Error('Index 0 is out of bounds, array size is 0');

  // visible price range: ta.highest(visibleBars) / ta.lowest(visibleBars) on the last bar, where visibleBars is
  // the number of visible bars when the last bar is the last visible bar, else 1
  const last = n - 1;
  const close = bars[last].close;
  let chartHighest = NaN;
  let chartLowest = NaN;
  if (showsrfit) {
    const range = visibleRangeOf(bars, chart);
    const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
    const visible = range.left <= range.right
      && bars[range.left].time * toMs >= range.leftTime && bars[range.right].time * toMs <= range.rightTime;
    const visibleBars = visible && range.right === last ? last - range.left + 1 : 1;
    if (visibleBars > MAX_WINDOW) {
      throw new Error(`The 'highest' function references too many historical candles (${visibleBars}), the limit is ${MAX_WINDOW}.`);
    }
    chartHighest = bars[last].high;
    chartLowest = bars[last].low;
    for (let i = last - visibleBars + 1; i < last; i++) {
      chartHighest = Math.max(chartHighest, bars[i].high);
      chartLowest = Math.min(chartLowest, bars[i].low);
    }
    // use 5% more
    chartHighest += (chartHighest - chartLowest) * 0.05;
    chartLowest -= (chartHighest - chartLowest) * 0.05;
  }

  // maximum channel width
  const cwidth = ((array.max(pivotvals) - array.min(pivotvals)) * cfg.channelW) / 100;

  // channel and strength of each pivot: strength, high, low
  const supres: number[] = [];
  for (let x = 0; x < count; x++) {
    let lo = pivotvals[x];
    let hi = lo;
    let numpp = 0;
    for (let y = 0; y < count; y++) {
      const cpp = pivotvals[y];
      const wdth = le(cpp, hi) ? hi - cpp : cpp - lo;
      if (le(wdth, cwidth)) {
        if (le(cpp, hi)) lo = Math.min(lo, cpp);
        else hi = Math.max(hi, cpp);
        numpp += 20;
      }
    }
    supres.push(numpp, hi, lo);
  }

  // the last 500 chart bars add 1 for each bar with its open, high, low or close in the channel
  const inside = (v: number, h: number, l: number) => le(v, h) && ge(v, l);
  for (let x = 0; x < count; x++) {
    const h = supres[x * 3 + 1];
    const l = supres[x * 3 + 2];
    let s = 0;
    for (let y = 0; y <= 499 && last - y >= 0; y++) {
      const b = bars[last - y];
      if (inside(b.high, h, l) || inside(b.low, h, l) || inside(b.open, h, l) || inside(b.close, h, l)) s++;
    }
    supres[x * 3] += s;
  }

  // the strongest channels
  const suportresistance: number[] = new Array(20).fill(0);
  const stren: number[] = new Array(10).fill(0);
  let src = 0;
  for (let x = 0; x < count; x++) {
    let stv = -1;
    let stl = -1;
    for (let y = 0; y < count; y++) {
      if (gt(supres[y * 3], stv) && ge(supres[y * 3], minstrength * 20)) {
        stv = supres[y * 3];
        stl = y;
      }
    }
    if (stl >= 0) {
      const hh = supres[stl * 3 + 1];
      const ll = supres[stl * 3 + 2];
      suportresistance[src * 2] = hh;
      suportresistance[src * 2 + 1] = ll;
      stren[src] = supres[stl * 3];
      // the pivots inside this channel are not used again
      for (let y = 0; y < count; y++) {
        if (inside(supres[y * 3 + 1], hh, ll) || inside(supres[y * 3 + 2], hh, ll)) supres[y * 3] = -1;
      }
      src += 1;
      if (src >= 10) break;
    }
  }

  // sort by strength, as the original: the stronger strength of the pair is not written back
  for (let x = 0; x <= 8; x++) {
    for (let y = x + 1; y <= 9; y++) {
      if (gt(stren[y], stren[x])) {
        stren[y] = stren[x];
        for (const k of [0, 1]) {
          const tmp = suportresistance[y * 2 + k];
          suportresistance[y * 2 + k] = suportresistance[x * 2 + k];
          suportresistance[x * 2 + k] = tmp;
        }
      }
    }
  }

  const getLevel = (ind: number) => (ind < suportresistance.length && !isZero(suportresistance[ind]) ? suportresistance[ind] : NaN);
  const getColor = (ind: number): string | null => {
    if (ind >= suportresistance.length || isZero(suportresistance[ind])) return null;
    if (gt(suportresistance[ind], close) && gt(suportresistance[ind + 1], close)) return cfg.resCol;
    if (lt(suportresistance[ind], close) && lt(suportresistance[ind + 1], close)) return cfg.supCol;
    return cfg.inchCol;
  };

  // table and channels
  const cells: TableCellData[] = [];
  if (showtable) {
    cells.push({
      column: 0, row: 0, text: `TF:${cfg.tf} Sorted by the Strength`, textColor: String(color.rgb(0, 0, 250)), bgColor: '#FFEB3B',
      textSize: 'auto',
    });
  }
  const mintick = mintickOf(chart);
  let rowindex = 1;
  for (let x = 0; x <= Math.min(9, maxnumsr); x++) {
    const srcol = getColor(x * 2);
    if (srcol === null) continue;
    const top = getLevel(x * 2);
    const bottom = getLevel(x * 2 + 1);
    if (!showsrfit || (le(bottom, chartHighest) && ge(top, chartLowest))) {
      // box.new(bar_index - 300, top, bar_index + 1, bottom, extend = extend.both): a box with an na point is not drawn.
      // With fewer than 301 bars the left side is before the first bar: the box is extended both ways, so the
      // first bar gives the same drawing
      const time1 = last - 300 >= 0 ? bars[last - 300].time : bars[0].time;
      const time2 = barTime(bars, last + 1);
      if (!Number.isNaN(top) && !Number.isNaN(bottom) && !Number.isNaN(time2)) {
        boxes.push({ time1, price1: top, time2, price2: bottom, borderColor: srcol, borderWidth: 1, extend: 'both', bgColor: srcol });
      }
    }
    if (showtable) {
      const isRes = sameColour(srcol, cfg.resCol);
      const textColor = isRes ? '#FFFFFF' : '#363A45';
      const bgColor = String(isRes ? color.rgb(200, 0, 0) : color.rgb(0, 200, 0));
      const texts = [
        str.tostring(rowindex),
        isRes ? 'Resistance' : 'Support',
        str.tostring(math.round_to_mintick(bottom, mintick) as number),
        str.tostring(math.round_to_mintick(top, mintick) as number),
      ];
      texts.forEach((text, column) => cells.push({ column, row: rowindex, text, textColor, bgColor, textSize: 'auto' }));
      rowindex += 1;
    }
  }
  if (showtable) {
    tables.push({
      position: `${cfg.tableposy}_${cfg.tableposx}` as TablePosition, columns: 5, rows: 11,
      frameWidth: 1, frameColor: '#787B86', borderWidth: 1, borderColor: '#787B86',
      cells, merges: [{ startColumn: 0, startRow: 0, endColumn: 3, endRow: 0 }],
    });
  }
  return result();
}

export const SupportResistanceChannelsMtf = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
