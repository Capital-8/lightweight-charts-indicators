/**
 * Trend Levels [ChartPrime]
 *
 * The trend is up from a bar whose high is the highest high of the last Length bars, and down from a bar whose low
 * is the lowest low of the last Length bars. Since the start of the running trend the script keeps the highest
 * high, the lowest low and their average (the middle level): three plotted levels with two gradient fills, three
 * lines and three price labels 10 bars ahead of the last bar, and an arrow label on each change of trend. The
 * closes above and below the middle level are counted since the change of trend: their difference, in percent of
 * their sum, colours the candles (gradient from the Down Colour at -50 to the Up Colour at +50) and is shown in a
 * table with the base currency of the symbol.
 *
 * At most 500 labels are kept (the oldest arrows are removed first).
 *
 * Chart values read from the optional third argument (see src/chart-context.ts): the chart foreground colour for
 * the captions of the table (#DBDBDB without it), and the symbol for the base currency: the original shows
 * `syminfo.basecurrency`, which the port takes from the ticker of a crypto or forex symbol by removing its currency
 * ("BTCUSD" with the currency "USD" gives "BTC"); it is empty for other symbol types and without a context.
 *
 * Reference: "Trend Levels [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import { ta, str, color, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, PlotCandleData, TableData } from '../types';
import { currencyOf, foregroundColorOf, symbolTypeOf, tickerOf, type ChartContext } from '../chart-context';
import { barInterval, barTime } from '../bar-time';

export interface TrendLevelsInputs {
  /** Number of bars of the highest high / lowest low that set the trend */
  length: number;
  upColor: string;
  downColor: string;
}

export const defaultInputs: TrendLevelsInputs = {
  length: 30,
  upColor: '#00E676',
  downColor: '#E040FB',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'length', defval: 30 },
  { id: 'upColor', type: 'color', title: 'Up Color', defval: '#00E676' },
  { id: 'downColor', type: 'color', title: 'Down Color', defval: '#E040FB' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Low Level', color: '#E040FB', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'High Level', color: '#00E676', lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Mid Level', color: '#787B86', lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Trend Levels [ChartPrime]',
  shortTitle: 'Trend Levels [ChartPrime]',
  overlay: true,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;
const GRAY = '#787B86';
/** Default text colour of a label and a line colour of this Pine version */
const LABEL_TEXT = '#363A45';

/** Pine float comparisons: a == b within 1e-10, a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  style: 'label_left' | 'label_upper_right' | 'label_lower_right';
  /** a variable of the script still refers to it: the limit of 500 labels does not delete it */
  held: boolean;
}
interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  dashed: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendLevelsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]>; lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const upCol = cfg.upColor;
  const dnCol = cfg.downColor;
  const highest = ta.highest(Series.fromArray(bars, bars.map((b) => b.high)), cfg.length).toArray();
  const lowest = ta.lowest(Series.fromArray(bars, bars.map((b) => b.low)), cfg.length).toArray();
  // h1 := ta.highest(bars), l1 := ta.lowest(bars): the length is the number of bars of the running trend
  const highestSince = callsite.highest();
  const lowestSince = callsite.lowest();

  // Labels in creation order. Above 505 labels the oldest ones that no variable refers to are deleted until 500
  // remain.
  let labels: Lb[] = [];
  const newLabel = (l: Lb): Lb => {
    labels.push(l);
    if (labels.length > MAX_LABELS + 5) {
      let excess = labels.length - MAX_LABELS;
      labels = labels.filter((o) => o.held || excess-- <= 0);
    }
    return l;
  };
  const remove = (l: Lb | null) => {
    if (l !== null) labels = labels.filter((o) => o !== l);
  };

  let count = 0;
  /** null = na */
  let trend: boolean | null = null;
  let countUp = NaN;
  let countDn = NaN;
  let l1 = NaN;
  let h1 = NaN;
  let m1 = NaN;
  let levelLabels: Array<Lb | null> = [null, null, null];
  let levelLines: Ln[] = [];
  let delta = NaN;

  const plot0: Array<{ time: number; value: number; color?: string }> = [];
  const plot1: Array<{ time: number; value: number; color?: string }> = [];
  const plot2: Array<{ time: number; value: number; color?: string }> = [];
  const candles: PlotCandleData[] = [];
  const h1Arr: number[] = [];
  const m1Arr: number[] = [];
  const l1Arr: number[] = [];
  let lastColor: string | null = null;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const before: boolean | null = trend;
    if (eq(highest[i] ?? NaN, b.high)) trend = true;
    if (eq(lowest[i] ?? NaN, b.low)) trend = false;

    // `if trend` and `if not trend` do the same (an na trend runs the second one): one more bar, the labels and
    // lines of the levels of the bar before are made again 10 bars ahead
    count += 1;
    const previous = levelLabels;
    const text = (v: number) => str.tostring(v, '#.#');
    const lower = newLabel({ x: i + 10, y: l1, text: text(l1), color: dnCol, style: 'label_left', held: true });
    if (previous[0]) previous[0].held = false;
    const upper = newLabel({ x: i + 10, y: h1, text: text(h1), color: upCol, style: 'label_left', held: true });
    if (previous[1]) previous[1].held = false;
    const mid = newLabel({ x: i + 10, y: m1, text: text(m1), color: GRAY, style: 'label_left', held: true });
    if (previous[2]) previous[2].held = false;
    previous.forEach(remove);
    levelLabels = [lower, upper, mid];
    levelLines = [
      { x1: i, x2: i + 10, y: h1, color: upCol, dashed: false },
      { x1: i, x2: i + 10, y: m1, color: GRAY, dashed: true },
      { x1: i, x2: i + 10, y: l1, color: dnCol, dashed: false },
    ];

    // if ta.change(trend): false while the trend of the bar before is na
    if (before !== null && trend !== before) {
      levelLabels.forEach(remove);
      levelLabels = [null, null, null];
      levelLines = [];
      count = 1;
      countUp = 0;
      countDn = 0;
    }

    h1 = highestSince(b.high, count);
    l1 = lowestSince(b.low, count);
    m1 = (h1 + l1) / 2;
    if (count === 1) {
      h1 = NaN;
      l1 = NaN;
      m1 = NaN;
    }
    if (gt(b.close, m1)) countUp += 1;
    if (lt(b.close, m1)) countDn += 1;
    delta = ((countUp - countDn) / (countUp + countDn)) * 100;

    // `not trend[1]` is true while the trend of the bar before is na
    if (trend === true && before !== true) {
      newLabel({ x: i, y: b.low, text: '⇗', color: upCol, style: 'label_upper_right', held: false });
    }
    if (before === true && trend === false) {
      newLabel({ x: i, y: b.high, text: '⇘', color: dnCol, style: 'label_lower_right', held: false });
    }

    const css = isNaN(delta) ? null : String(color.from_gradient(delta, -50, 50, dnCol, upCol));
    lastColor = css;
    const paint = css ?? 'transparent';
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: paint, wickColor: paint, borderColor: paint });
    plot0.push({ time: b.time, value: l1, color: dnCol });
    plot1.push({ time: b.time, value: h1, color: upCol });
    // color = bar_index % 3 == 0 ? color.gray : na
    plot2.push({ time: b.time, value: m1, color: i % 3 === 0 ? GRAY : 'transparent' });
    h1Arr.push(h1);
    m1Arr.push(m1);
    l1Arr.push(l1);
  }

  const interval = barInterval(bars);
  const tables: TableData[] = [];
  if (n > 0) {
    const fg = foregroundColorOf(chart);
    const type = symbolTypeOf(chart);
    const ticker = tickerOf(chart);
    const currency = currencyOf(chart);
    // syminfo.basecurrency
    const base = (type === 'crypto' || type === 'forex') && ticker.endsWith(currency) ? ticker.slice(0, ticker.length - currency.length) : '';
    const valueColor = lastColor ?? 'transparent';
    tables.push({
      position: 'top_right', columns: 10, rows: 10,
      cells: [
        { column: 0, row: 0, text: 'Symbol: ', textColor: fg, textSize: 'auto' },
        { column: 1, row: 0, text: base, textColor: valueColor, textSize: 'auto' },
        { column: 0, row: 1, text: 'Trend: ', textColor: fg, textSize: 'auto' },
        { column: 1, row: 1, text: str.tostring(delta, 'percent'), textColor: valueColor, textSize: 'auto' },
      ],
    });
  }

  const upFill = String(color.new(upCol, 90));
  const dnFill = String(color.new(dnCol, 90));
  const constant = <T,>(v: T): T[] => new Array<T>(n).fill(v);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [
      // fill(pm, ph, h1, m1, color.new(up_col, 90), na)
      { plot1: 'plot2', plot2: 'plot1', options: { title: 'Plots Background' },
        gradient: { topValue: h1Arr, bottomValue: m1Arr, topColor: constant<string | null>(upFill), bottomColor: constant<string | null>(null) } },
      // fill(pm, pl, m1, l1, na, color.new(dn_col, 90))
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'Plots Background' },
        gradient: { topValue: m1Arr, bottomValue: l1Arr, topColor: constant<string | null>(null), bottomColor: constant<string | null>(dnFill) } },
    ],
    plotCandles: { candles },
    // an object with an na coordinate is not drawn
    lines: levelLines.filter((l) => !isNaN(l.y)).map((l): LineDrawingData => ({
      time1: barTime(bars, l.x1, interval), price1: l.y, time2: barTime(bars, l.x2, interval), price2: l.y, color: l.color,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
    })),
    labels: labels.filter((l) => !isNaN(l.y)).map((l): LabelData => ({
      time: barTime(bars, l.x, interval), price: l.y, text: l.text, color: l.color, textColor: LABEL_TEXT, style: l.style,
    })),
    tables,
  };
}

export const TrendLevels = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
