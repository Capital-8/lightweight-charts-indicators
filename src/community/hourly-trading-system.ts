/**
 * Hourly Trading System (Zeiierman)
 *
 * Tools around the hour, for charts of 1 to 5 minutes:
 * - the open of each clock hour, as a zone (the open plus and minus "Zone width" / 10,000) or a line, one hour long;
 * - the open of each 4-hour block (hours 0, 4, 8 ... of the exchange clock), as a line four hours long;
 * - the average close of the current hour, green when the close is at or above the hour open, else red;
 * - labels on the high and the low of each past hour ("H[1]", "L[1]" for the last hour, then 2, 3 ...) and on the
 *   high and low of the current hour;
 * - optional retest signals: after at least two bars, a bar that dips into the zone from above and closes at or
 *   above its bottom (or the mirror from below), at most "Nbr of Retest" per hour, with an optional volume filter
 *   (volume above its WMA);
 * - optional candles and bar colours by the side of the close against the hour open;
 * - the last candles of a higher timeframe, drawn to the right of the last bar with boxes and wick lines;
 * - a table with the bars left in the hour and the change of the close since the previous 1-hour, 4-hour and daily
 *   close; and a warning table when the chart timeframe is 15 minutes or more.
 * At most 100 lines, 100 labels and 50 boxes are kept.
 *
 * The clock hours are read in the exchange time zone and the chart timeframe is needed: both come from the chart
 * context (optional third argument of calculate); without it the port uses UTC and the spacing of the bars. The
 * 1-hour, 4-hour, daily and higher-timeframe values are built from the chart bars (see src/anchor-period.ts), so the
 * chart timeframe must not be above 60 minutes, nor above the "Timeframe" input: the port throws an Error
 * otherwise, as the chart bars do not have the bars of a lower timeframe.
 *
 * Reference: "Hourly Trading System (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import {
  ta, str, color, timeframe, Series, time as pineTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BarColorData, BoxData, LabelData, LineDrawingData, MarkerData, PlotCandleData, TableCellData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import { timezoneOf, type ChartContext } from '../chart-context';

type LineStyleName = 'Solid' | 'Dotted' | 'Dashed';

export interface HourlyTradingSystemInputs {
  hCol: string;
  hLineBox: 'Line' | 'Zone';
  hStyle: LineStyleName;
  hWidth: number;
  h4Col: string;
  h4Style: LineStyleName;
  h4Width: number;
  /** Half width of the zone around the hour open, in 1 / 10,000 of the price */
  zoneDev: number;
  hourTest: boolean;
  /** Maximum number of retests per hour */
  retests: number;
  vol: boolean;
  volLen: number;
  reUp: string;
  reDn: string;
  average: boolean;
  hourlyHl: boolean;
  maUp: string;
  maDn: string;
  candle: boolean;
  bar: boolean;
  cUp: string;
  cDn: string;
  /** Timeframe of the candles drawn to the right of the last bar */
  tf: string;
  /** Number of these candles (0: none) */
  numb: number;
  dnCol: string;
  dnWick: string;
  upCol: string;
  upWick: string;
  /** Distance of the candles from the last bar */
  loc: number;
}

// Colour constants of Pine version 5
const LIME = '#00E676';
const RED = '#FF5252';
const GREEN = '#4CAF50';
const BLUE = '#2962FF';
const MAROON = '#880E4F';
const WHITE = '#FFFFFF';
const MINT = 'rgb(105, 255, 190)';

export const defaultInputs: HourlyTradingSystemInputs = {
  hCol: MINT,
  hLineBox: 'Zone',
  hStyle: 'Solid',
  hWidth: 1,
  h4Col: MINT,
  h4Style: 'Dashed',
  h4Width: 1,
  zoneDev: 1,
  hourTest: false,
  retests: 2,
  vol: false,
  volLen: 20,
  reUp: LIME,
  reDn: RED,
  average: true,
  hourlyHl: true,
  maUp: LIME,
  maDn: RED,
  candle: false,
  bar: false,
  cUp: LIME,
  cDn: RED,
  tf: '60',
  numb: 2,
  dnCol: 'rgba(255, 82, 82, 0.9)',
  dnWick: RED,
  upCol: 'rgba(0, 230, 118, 0.9)',
  upWick: LIME,
  loc: 2,
};

const T1 = 'Sets the color for the 1-Hour Open line. Changing the color helps distinguish it from other lines on the chart.  \n\nChoose between displaying the 1-Hour Open as a Line or a Zone. A zone shows an area around the open price, providing a visual representation of a price range. \n\nSets the line style for the 1-Hour Open (Solid, Dotted, Dashed). Different styles can help visually differentiate the lines on your chart.';
const T2 = 'Sets the color for the 4-Hour Open line. Adjusting the color can help you easily identify this line on your chart. \n\nSets the line style for the 4-Hour Open (Solid, Dotted, Dashed). Different styles can help visually differentiate the lines on your chart.';
const T3 = 'Specifies the width of the zone around the 1-Hour Open as a percentage. Increasing this value widens the zone, showing a larger range around the open price.';
const T4 = 'Enables or disables the display of retest markers. When enabled, markers show where the price retested the 1-Hour Open line.';
const T5 = 'Sets the number of retests to display. Increasing this value shows more retest markers on the chart.';
const T6 = 'Enables or disables the volume filter for retests. When enabled, only retests with higher volume are displayed. \n\nSets the length of the volume filter. Increasing this value smooths the volume filter, potentially reducing the number of retest markers.';
const T7 = 'Enables or disables the 1-hour average line. This line shows the average price over the past hour.';
const T8 = 'Enables or disables the display of hourly high and low labels. These labels mark the highest and lowest prices within each hour.';
const T9 = 'Enables or disables the display of candlesticks on the chart. Candlesticks provide a detailed view of price action. \n\nEnables or disables bar coloring based on price direction. Up bars are colored green and down bars are colored red.';
const T10 = 'Sets the timeframe for higher timeframe candles. Changing this value adjusts the period over which higher timeframe candles are calculated.';
const T11 = 'Sets the number of higher timeframe candles to display. Increasing this value shows more candles on the chart.';
const T12 = 'Sets the location for higher timeframe candles. Adjusting this value moves the higher timeframe candles left or right on the chart.';

const STYLES = ['Solid', 'Dotted', 'Dashed'];

export const inputConfig: InputConfig[] = [
  { id: 'hCol', type: 'color', title: '1-Hour Open', defval: MINT, group: 'Levels', inline: '1' },
  { id: 'hLineBox', type: 'string', title: '', defval: 'Zone', options: ['Line', 'Zone'], group: 'Levels', inline: '1' },
  { id: 'hStyle', type: 'string', title: '', defval: 'Solid', options: STYLES, group: 'Levels', inline: '1' },
  { id: 'hWidth', type: 'int', title: '', defval: 1, min: 1, max: 4, group: 'Levels', inline: '1', tooltip: T1 },
  { id: 'h4Col', type: 'color', title: '4-Hour Open', defval: MINT, group: 'Levels', inline: '4' },
  { id: 'h4Style', type: 'string', title: '', defval: 'Dashed', options: STYLES, group: 'Levels', inline: '4', tooltip: T2 },
  { id: 'h4Width', type: 'int', title: '', defval: 1, min: 1, max: 4, group: 'Levels', inline: '4' },
  { id: 'zoneDev', type: 'float', title: 'Zone width', defval: 1, min: 0, step: 0.1, group: 'Levels', tooltip: T3 },
  { id: 'hourTest', type: 'bool', title: 'Show Retests', defval: false, group: 'Retest', tooltip: T4 },
  { id: 'retests', type: 'int', title: 'Nbr of Retest', defval: 2, min: 1, max: 100, group: 'Retest', tooltip: T5 },
  { id: 'vol', type: 'bool', title: 'Volume Filter', defval: false, group: 'Retest', inline: 'Filter' },
  { id: 'volLen', type: 'int', title: ' ', defval: 20, min: 1, group: 'Retest', inline: 'Filter', tooltip: T6 },
  { id: 'reUp', type: 'color', title: '', defval: LIME, group: 'Retest', inline: 'Retest' },
  { id: 'reDn', type: 'color', title: '', defval: RED, group: 'Retest', inline: 'Retest' },
  { id: 'average', type: 'bool', title: '1 hour average', defval: true, group: 'Average', inline: 'ma', tooltip: T7 },
  { id: 'hourlyHl', type: 'bool', title: 'Hourly High & Low Labels', defval: true, group: 'Average', tooltip: T8 },
  { id: 'maUp', type: 'color', title: '', defval: LIME, group: 'Average', inline: 'Average' },
  { id: 'maDn', type: 'color', title: '', defval: RED, group: 'Average', inline: 'Average' },
  { id: 'candle', type: 'bool', title: 'Candlesticks', defval: false, group: 'BarColor', inline: 'bar' },
  { id: 'bar', type: 'bool', title: 'BarColor', defval: false, group: 'BarColor', inline: 'bar', tooltip: T9 },
  { id: 'cUp', type: 'color', title: '', defval: LIME, group: 'BarColor', inline: 'barcolor' },
  { id: 'cDn', type: 'color', title: '', defval: RED, group: 'BarColor', inline: 'barcolor' },
  { id: 'tf', type: 'timeframe', title: 'Timeframe', defval: '60', group: 'Higher Timeframe Candles', tooltip: T10 },
  { id: 'numb', type: 'int', title: 'Nbr of Candles', defval: 2, min: 0, max: 20, group: 'Higher Timeframe Candles', tooltip: T11 },
  { id: 'dnCol', type: 'color', title: 'Dn', defval: 'rgba(255, 82, 82, 0.9)', group: 'Higher Timeframe Candles', inline: 'Candles' },
  { id: 'dnWick', type: 'color', title: 'Wick', defval: RED, group: 'Higher Timeframe Candles', inline: 'Candles' },
  { id: 'upCol', type: 'color', title: 'Up', defval: 'rgba(0, 230, 118, 0.9)', group: 'Higher Timeframe Candles', inline: 'Candles' },
  { id: 'upWick', type: 'color', title: 'Wick', defval: LIME, group: 'Higher Timeframe Candles', inline: 'Candles' },
  { id: 'loc', type: 'int', title: 'Location', defval: 2, group: 'Location Settings', tooltip: T12 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Hourly Average Price', color: BLUE, lineWidth: 1 },
];

export const metadata = {
  title: 'Hourly Trading System (Zeiierman)',
  shortTitle: 'Hourly Trading System (Zeiierman)',
  overlay: true,
};

/** indicator(max_lines_count = 100, max_labels_count = 100); the box limit is the default */
const MAX_LINES = 100;
const MAX_LABELS = 100;
const MAX_BOXES = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => gt(a, b) || eq(a, b);
const le = (a: number, b: number) => lt(a, b) || eq(a, b);
const ne = (a: number, b: number) => gt(a, b) || lt(a, b);

type DrawStyle = 'solid' | 'dotted' | 'dashed';
const styleOf = (name: LineStyleName): DrawStyle => (name === 'Dotted' ? 'dotted' : name === 'Dashed' ? 'dashed' : 'solid');

/** A drawing of the script: x values are bar times (`byTime`) or bar indices */
interface Ln {
  byTime: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: DrawStyle;
  width: number;
  deleted: boolean;
}
interface Bx {
  byTime: boolean;
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
  border: string | null;
  borderStyle: DrawStyle;
  borderWidth: number;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  style: 'label_down' | 'label_up';
  deleted: boolean;
}

/**
 * request.security(syminfo.tickerid, tf, ..., lookahead = barmerge.lookahead_on): the bars of timeframe `tf` built
 * from the chart bars, and for each chart bar the index of its bar of that timeframe.
 */
function timeframeBars(bars: Bar[], tf: string, chartTf: string, context?: ChartContext): { htf: Bar[]; group: number[] } {
  if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) {
    return { htf: bars, group: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`Hourly Trading System: the timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods come from the library rule
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, group: exchange.group };
  const starts = periodStarts(bars, tf, context);
  const htf: Bar[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
    } else {
      const last = htf[htf.length - 1];
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume = (last.volume ?? NaN) + (b.volume ?? NaN);
    }
    group.push(htf.length - 1);
  });
  return { htf, group };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<HourlyTradingSystemInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'barColors' | 'plotCandles' | 'lines' | 'boxes' | 'labels' | 'tables'> & {
  markers: MarkerData[]; barColors: BarColorData[]; plotCandles: Record<string, PlotCandleData[]>;
  lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; tables: TableData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const numb = Math.trunc(cfg.numb);
  const loc = Math.trunc(cfg.loc);
  const zoneDev = cfg.zoneDev / 10000;

  // Chart timeframe
  const chartTf = chartTimeframe(bars, chart);
  const info = chartTf === '' ? null : timeframe.info(chartTf);
  const chartSeconds = chartTf === '' ? NaN : timeframe.in_seconds(chartTf);
  if (chartSeconds > 3600) {
    throw new Error(`Hourly Trading System: the chart timeframe "${chartTf}" is above 60 minutes: the 1-hour values need the bars of a lower timeframe, which the chart bars do not have`);
  }
  const isIntraday = info !== null && info.isintraday;
  const multiplier = info !== null ? info.multiplier : NaN;

  // Clock of the exchange
  const ms = n > 0 && bars[0].time >= 1e12;
  const toMs = (t: number) => (ms ? t : t * 1000);
  const HOUR = ms ? 3600000 : 3600;
  const tz = timezoneOf(chart);
  const hours = bars.map((b) => pineTime.hour(toMs(b.time), tz));
  const minutes = bars.map((b) => pineTime.minute(toMs(b.time), tz));

  // Values of the other timeframes (lookahead on: the bar of the period of each chart bar)
  const h1 = timeframeBars(bars, '60', chartTf, chart);
  const h4 = timeframeBars(bars, '240', chartTf, chart);
  const day = timeframeBars(bars, 'D', chartTf, chart);
  const candles = numb > 0 ? timeframeBars(bars, cfg.tf, chartTf, chart) : null;
  /** close[1] of the timeframe */
  const prevClose = (src: { htf: Bar[]; group: number[] }, i: number) => (src.group[i] >= 1 ? src.htf[src.group[i] - 1].close : NaN);
  const volumeWma = cfg.vol
    ? ta.wma(new Series(bars, (b) => b.volume ?? NaN), cfg.volLen).toArray().map((v) => v ?? NaN)
    : [];

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. An object held by a `var` variable of the script (the latest hour line, hour zone, 4-hour line and
  // current High / Low labels) is never deleted by this limit, but it counts. A deleted object ignores later changes.
  const held = new Set<object>();
  const limit = <O extends { deleted: boolean }>(list: O[], max: number) => {
    if (list.length <= max + 5) return;
    for (let k = 0; k < list.length && list.length > max; ) {
      if (held.has(list[k])) k++;
      else list.splice(k, 1)[0].deleted = true;
    }
  };
  /** `variable := object`: the variable holds the new object and releases the one before */
  const hold = <O extends object>(before: O | null, now: O): O => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const remove = <O extends { deleted: boolean }>(list: O[], o: O | null) => {
    if (!o || o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };
  const lines: Ln[] = [];
  const boxes: Bx[] = [];
  const labels: Lb[] = [];
  const newLine = (l: Omit<Ln, 'deleted'>): Ln => {
    const o = { ...l, deleted: false };
    lines.push(o);
    limit(lines, MAX_LINES);
    return o;
  };
  const newBox = (b: Omit<Bx, 'deleted'>): Bx => {
    const o = { ...b, deleted: false };
    boxes.push(o);
    limit(boxes, MAX_BOXES);
    return o;
  };
  const newLabel = (l: Omit<Lb, 'deleted'>): Lb => {
    const o = { ...l, deleted: false };
    labels.push(o);
    limit(labels, MAX_LABELS);
    return o;
  };

  const hStyle = styleOf(cfg.hStyle);
  const h4Style = styleOf(cfg.h4Style);
  const zoneBg = String(color.new(cfg.hCol, 75));

  // Script state
  let line2: Ln | null = null; // 1-hour open line
  let line1: Ln | null = null; // 4-hour open line
  let box2: Bx | null = null; // 1-hour open zone
  let count = 0;
  let end = NaN;
  let pos = false;
  let startPoint = NaN;
  let hourHigh = NaN;
  let hourLow = NaN;
  let hourHighTime = 0;
  let hourLowTime = 0;
  let prevHourHigh = NaN;
  let prevHourLow = NaN;
  /** Labels of the past hours in creation order: high then low of each hour */
  const hourLabels: Lb[] = [];
  let highLabel: Lb | null = null;
  let lowLabel: Lb | null = null;
  let avgSum = NaN;
  let avgLen = 0;
  let hourlyChange = NaN;
  let fourHourChange = NaN;
  let dailyChange = NaN;
  let retestCount = 0;
  // Candles of the higher timeframe: boxes and wick lines, oldest first (none at the start)
  const candleBoxes: Array<Bx | null> = new Array(Math.max(numb, 0)).fill(null);
  const wickHigh: Array<Ln | null> = new Array(Math.max(numb, 0)).fill(null);
  const wickLow: Array<Ln | null> = new Array(Math.max(numb, 0)).fill(null);
  let prevO = NaN;

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const candlesticks: PlotCandleData[] = [];
  const barColors: BarColorData[] = [];
  const markers: MarkerData[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    if (i === 0) {
      startPoint = b.close;
      hourHigh = b.high;
      hourLow = b.low;
    }
    const newHour = i > 0 && hours[i] !== hours[i - 1];

    // 1-hour open
    if (newHour) {
      startPoint = b.open;
      if (cfg.hLineBox === 'Line') {
        line2 = hold(line2, newLine({ byTime: true, x1: t, y1: b.open, x2: t + HOUR, y2: b.open, color: cfg.hCol, style: hStyle, width: cfg.hWidth }));
      } else {
        box2 = hold(box2, newBox({
          byTime: true, left: t, top: b.open * (1 + zoneDev), right: t + HOUR, bottom: b.open * (1 - zoneDev),
          bg: zoneBg, border: cfg.hCol, borderStyle: hStyle, borderWidth: cfg.hWidth,
        }));
      }
      count = 0;
      end = t + HOUR;
      pos = true;

      if (cfg.hourlyHl) {
        // The labels of the hours before move one rank back (only the labels that still exist: the oldest go first)
        for (let k = 0; ; k++) {
          const low = hourLabels[hourLabels.length - 1 - 2 * k];
          const high = hourLabels[hourLabels.length - 2 - 2 * k];
          if (!low || (low.deleted && high.deleted)) break;
          if (!high.deleted) high.text = `H[${k + 2}]`;
          if (!low.deleted) low.text = `L[${k + 2}]`;
        }
        hourLabels.push(newLabel({ x: hourHighTime, y: hourHigh, text: 'H[1]', color: GREEN, style: 'label_down' }));
        hourLabels.push(newLabel({ x: hourLowTime, y: hourLow, text: 'L[1]', color: RED, style: 'label_up' }));
        hourHigh = b.high;
        hourLow = b.low;
      }
    }

    // High and low of the current hour: one label each, replaced when the value changes
    if (cfg.hourlyHl) {
      hourHigh = Math.max(b.high, hourHigh);
      hourLow = Math.min(b.low, hourLow);
      if (ne(hourHigh, prevHourHigh)) {
        const before: Lb | null = highLabel;
        highLabel = hold(before, newLabel({ x: t, y: hourHigh, text: 'High', color: GREEN, style: 'label_down' }));
        remove(labels, before);
        hourHighTime = t;
      }
      if (ne(hourLow, prevHourLow)) {
        const before: Lb | null = lowLabel;
        lowLabel = hold(before, newLabel({ x: t, y: hourLow, text: 'Low', color: RED, style: 'label_up' }));
        remove(labels, before);
        hourLowTime = t;
      }
    }
    prevHourHigh = hourHigh;
    prevHourLow = hourLow;

    // 4-hour open
    if (isIntraday && minutes[i] === 0 && hours[i] % 4 === 0) {
      line1 = hold(line1, newLine({ byTime: true, x1: t, y1: b.open, x2: t + 4 * HOUR, y2: b.open, color: cfg.h4Col, style: h4Style, width: cfg.h4Width }));
      count = 0;
      end = t + 4 * HOUR;
      pos = true;
    }

    // Average close of the hour
    let maHour = NaN;
    if (cfg.average) {
      if (newHour) {
        avgSum = b.close;
        avgLen = 1;
      } else {
        avgSum = (isNaN(avgSum) ? 0 : avgSum) + b.close;
        avgLen += 1;
      }
      maHour = avgSum / avgLen;
    }

    // Side of the close against the hour open
    const up = ge(b.close, startPoint);
    const col = up ? cfg.cUp : cfg.cDn;
    plot0.push({ time: t, value: maHour, color: i >= 2 && hours[i] === hours[i - 2] ? (up ? cfg.maUp : cfg.maDn) : 'transparent' });
    if (cfg.candle) candlesticks.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close, color: col, borderColor: col, wickColor: col });
    if (cfg.bar) barColors.push({ time: t, color: col });

    // Changes since the previous 1-hour, 4-hour and daily close
    const change = (src: { htf: Bar[]; group: number[] }, before: number) => {
      const prev = prevClose(src, i);
      return isNaN(prev) ? before : ((b.close - prev) / prev) * 100;
    };
    hourlyChange = change(h1, hourlyChange);
    fourHourChange = change(h4, fourHourChange);
    dailyChange = change(day, dailyChange);

    // Candles of the higher timeframe, to the right of the current bar
    if (candles) {
      const bar = candles.htf[candles.group[i]];
      const o = bar.open, h = bar.high, l = bar.low, c = bar.close;
      const top = Math.max(o, c);
      const bottom = Math.min(o, c);
      const down = gt(o, c);
      if (i > 0 && ne(o, prevO)) {
        // A new candle: the oldest one is deleted
        remove(boxes, candleBoxes.shift() ?? null);
        remove(lines, wickHigh.shift() ?? null);
        remove(lines, wickLow.shift() ?? null);
        const x = i + numb * 4 + loc;
        const body = down ? cfg.dnCol : cfg.upCol;
        candleBoxes.push(newBox({ byTime: false, left: x, top, right: x + 2, bottom, bg: body, border: null, borderStyle: 'solid', borderWidth: 1 }));
        wickHigh.push(newLine({ byTime: false, x1: x + 1, y1: top, x2: x + 1, y2: h, color: body, style: 'solid', width: 1 }));
        wickLow.push(newLine({ byTime: false, x1: x + 1, y1: bottom, x2: x + 1, y2: l, color: body, style: 'solid', width: 1 }));
      } else {
        // The candles follow the current bar; the last one also follows the prices of its period
        let d = loc;
        for (let k = 0; k < candleBoxes.length; k++) {
          const box = candleBoxes[k];
          const wh = wickHigh[k];
          const wl = wickLow[k];
          const x = i + d * 2;
          if (box && !box.deleted) {
            box.left = x;
            box.right = x + 2;
          }
          if (wh && !wh.deleted) wh.x1 = wh.x2 = x + 1;
          if (wl && !wl.deleted) wl.x1 = wl.x2 = x + 1;
          if (k >= numb - 1) {
            const wick = down ? cfg.dnWick : cfg.upWick;
            if (box && !box.deleted) {
              box.top = top;
              box.bottom = bottom;
              box.bg = down ? cfg.dnCol : cfg.upCol;
            }
            if (wh && !wh.deleted) {
              wh.y1 = top;
              wh.y2 = h;
              wh.color = wick;
            }
            if (wl && !wl.deleted) {
              wl.y1 = bottom;
              wl.y2 = l;
              wl.color = wick;
            }
          }
          d += 2;
        }
      }
      prevO = o;
    }

    // Retests of the 1-hour zone (the original tests the zone only: in the 'Line' mode there is no zone, no retest)
    const zoneTop = box2 ? box2.top : NaN;
    const zoneBottom = box2 ? box2.bottom : NaN;
    const prevLow = i > 0 ? bars[i - 1].low : NaN;
    const prevHigh = i > 0 ? bars[i - 1].high : NaN;
    let positiveRetest = false;
    let negativeRetest = false;
    if (pos && count > 1 && t <= end && retestCount < cfg.retests
      && gt(prevLow, zoneTop) && le(b.low, zoneTop) && ge(b.close, zoneBottom)) {
      positiveRetest = true;
      pos = false;
      count = 0;
      retestCount += 1;
    }
    if (pos && count > 1 && t <= end && retestCount < cfg.retests
      && lt(prevHigh, zoneBottom) && ge(b.high, zoneBottom) && le(b.close, zoneTop)) {
      negativeRetest = true;
      pos = false;
      count = 0;
      retestCount += 1;
    }
    count += 1;
    if (count > 1) pos = true;
    if (newHour) retestCount = 0;

    const volumeOk = !cfg.vol || gt(b.volume ?? NaN, volumeWma[i]);
    // plotshape(retest ? low : na, ...): a price of 0 draws nothing
    if (cfg.hourTest && positiveRetest && volumeOk && b.low !== 0) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: cfg.reUp, size: 'tiny' });
    }
    if (cfg.hourTest && negativeRetest && volumeOk && b.high !== 0) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: cfg.reDn, size: 'tiny' });
    }
  }

  // Tables (the values of the last bar)
  const tables: TableData[] = [];
  if (n > 0) {
    // Bars left in the hour, on 1, 5 and 15-minute charts
    const barsHour = isIntraday ? (multiplier === 1 ? 60 : multiplier === 5 ? 12 : multiplier === 15 ? 4 : NaN) : NaN;
    const barsLeft = isNaN(barsHour) ? 0 : barsHour - minutes[n - 1] / multiplier;
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string, bgColor?: string) => {
      cells.push({ column, row, text, textColor: WHITE, textSize: 'auto', ...(bgColor ? { bgColor } : {}) });
    };
    const changeCell = (row: number, title: string, value: number) => {
      cell(0, row, title);
      cell(1, row, str.tostring(value, 'percent'), gt(value, 0) ? LIME : RED);
    };
    cell(0, 0, '1 hour closes in:');
    cell(1, 0, `${str.tostring(Math.round(barsLeft))} bars`, BLUE);
    changeCell(1, '1H Δ%:', hourlyChange);
    changeCell(2, '4H Δ%:', fourHourChange);
    changeCell(3, 'Daily Δ%:', dailyChange);
    tables.push({ position: 'top_right', columns: 2, rows: 4, borderColor: WHITE, frameColor: WHITE, bgColor: BLUE, borderWidth: 1, cells });
    if (chartSeconds >= 15 * 60) {
      tables.push({
        position: 'top_center', columns: 1, rows: 1, borderWidth: 1, frameWidth: 1, frameColor: MAROON, borderColor: RED,
        cells: [{
          column: 0, row: 0, text: 'Error: Timeframe is above 15 minutes. \n\n The system works in the 1 - 5 min Timeframe',
          textSize: 'large', bgColor: RED, textColor: WHITE,
        }],
      });
    }
  }

  // Bar times of the drawings. A time between two bars is drawn on the next bar; a bar index after the last bar is a
  // future bar.
  const interval = barInterval(bars);
  const atIndex = (index: number) => barTime(bars, index, interval);
  const atTime = (time: number) => {
    if (n === 0 || time > bars[n - 1].time) return time;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time >= time) hi = mid;
      else lo = mid + 1;
    }
    return bars[lo].time;
  };
  const X = (byTime: boolean, x: number) => (byTime ? atTime(x) : atIndex(x));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    plotCandles: { candlesticks },
    barColors,
    markers,
    lines: lines.map((l) => ({
      time1: X(l.byTime, l.x1), price1: l.y1, time2: X(l.byTime, l.x2), price2: l.y2, color: l.color, width: l.width, style: l.style,
    })),
    boxes: boxes.map((b) => ({
      time1: X(b.byTime, b.left), price1: b.top, time2: X(b.byTime, b.right), price2: b.bottom, bgColor: b.bg,
      borderColor: b.border ?? 'transparent', borderWidth: b.borderWidth, borderStyle: b.borderStyle,
    })),
    labels: labels.map((l) => ({ time: atTime(l.x), price: l.y, text: l.text, color: l.color, textColor: WHITE, style: l.style })),
    tables,
  };
}

export const HourlyTradingSystem = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
