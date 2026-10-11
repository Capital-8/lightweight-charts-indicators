/**
 * DonAlt - Smart Money Toolkit [BigBeluga]
 *
 * Three tools, all computed on the last 400 bars only:
 * - Levels (on by default): a horizontal line at each pivot of the candle bodies (pivot high of the open, pivot low
 *   of the close, "Period" bars on each side) when the range of the pivot bar is above 20 % of its 200-bar span. The
 *   line starts at the pivot bar and extends to the right; it has the first colour while the close is above it and
 *   the second colour below. A new level also lengthens the older lines that lie inside its zone (2.5 or 1.5 times
 *   the 200-bar average range around it). The 14 latest levels are kept.
 * - Order blocks (off by default): after a gap between the high of two bars back and the low of the bar (larger than
 *   a quarter of the 200-bar ATR) with a down candle in the last 5 bars, a box over the body of the latest down
 *   candle (and the mirror for bearish blocks). A box is removed when price leaves it on the far side, when another
 *   box starts inside it or when it is thinner than a quarter of the ATR. At most 19 per side.
 * - Trend lines (off by default): a line through the two latest pivot highs when it falls, or the two latest pivot
 *   lows when it rises or is flat, extended by 2 x "Extend" bars. Only the latest line is kept.
 *
 * Notes on the port:
 * - Order block borders and text use the chart foreground colour: read from the chart context (optional third
 *   argument of calculate), the dark theme value without it.
 * - Trend lines are placed by time: their end is the time of the pivot bar plus 2 x "Extend" times the gap between the
 *   current bar and the bar before (after a weekend that gap is longer than one bar).
 * - The zones of the levels are boxes without background nor border (not visible), as in the original.
 * - The original also makes one empty line per bar; they count in its limit of 500 lines, as here, and draw nothing.
 *
 * Reference: "DonAlt - Smart Money Toolkit [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: This work is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0
 * International https://creativecommons.org/licenses/by-nc-sa/4.0/ © BigBeluga
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface DonaltSmartMoneyToolkitInputs {
  displayLvl: boolean;
  /** Bars on each side of a level pivot */
  length: number;
  style1: 'Solid' | 'Dashed';
  up: string;
  dn: string;
  displayOb: boolean;
  colBull: string;
  colBear: string;
  displayTren: boolean;
  /** Bars on each side of a trend line pivot */
  period: number;
  style2: 'Solid' | 'Dashed';
  /** The trend line continues 2 x this number of bars after its second pivot */
  extend: number;
  lineCol1: string;
  lineCol2: string;
}

export const defaultInputs: DonaltSmartMoneyToolkitInputs = {
  displayLvl: true,
  length: 20,
  style1: 'Solid',
  up: 'rgba(35, 184, 80, 0.7)',
  dn: 'rgba(255, 82, 82, 0.7)',
  displayOb: false,
  colBull: 'rgba(20, 190, 147, 0.3)',
  colBear: 'rgba(194, 25, 25, 0.3)',
  displayTren: false,
  period: 10,
  style2: 'Solid',
  extend: 10,
  lineCol1: '#1bd663',
  lineCol2: '#d61b7f',
};

export const inputConfig: InputConfig[] = [
  { id: 'displayLvl', type: 'bool', title: '', defval: true, group: 'Levels', inline: '1' },
  { id: 'length', type: 'int', title: 'Period', defval: 20, group: 'Levels', inline: '1' },
  { id: 'style1', type: 'string', title: '', defval: 'Solid', options: ['Solid', 'Dashed'], group: 'Levels', inline: '1' },
  { id: 'up', type: 'color', title: '', defval: 'rgba(35, 184, 80, 0.7)', group: 'Levels', inline: '1' },
  { id: 'dn', type: 'color', title: '', defval: 'rgba(255, 82, 82, 0.7)', group: 'Levels', inline: '1' },
  { id: 'displayOb', type: 'bool', title: '', defval: false, group: 'OrderBlocks', inline: '2' },
  { id: 'colBull', type: 'color', title: '', defval: 'rgba(20, 190, 147, 0.3)', group: 'OrderBlocks', inline: '2' },
  { id: 'colBear', type: 'color', title: '', defval: 'rgba(194, 25, 25, 0.3)', group: 'OrderBlocks', inline: '2' },
  { id: 'displayTren', type: 'bool', title: '', defval: false, group: 'TrendLine', inline: '3' },
  { id: 'period', type: 'int', title: 'Period', defval: 10, group: 'TrendLine', inline: '3' },
  { id: 'style2', type: 'string', title: '', defval: 'Solid', options: ['Solid', 'Dashed'], group: 'TrendLine', inline: '3' },
  { id: 'extend', type: 'int', title: 'Extend', defval: 10, group: 'TrendLine', inline: '3' },
  { id: 'lineCol1', type: 'color', title: '', defval: '#1bd663', group: 'TrendLine', inline: '4' },
  { id: 'lineCol2', type: 'color', title: '', defval: '#d61b7f', group: 'TrendLine', inline: '4' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'DonAlt Toolkit [BigBeluga]',
  shortTitle: 'DonAlt Toolkit [BigBeluga]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 100) */
const MAX_LINES = 500;
const MAX_BOXES = 100;
/** Bars from the last bar on which the tools run */
const LOOKBACK = 400;
const FILTER = 20;
const BOX_AMOUNT = 20;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Ln {
  /** x in bar indexes, or in ms for the trend lines */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  byTime: boolean;
  color: string;
  dashed: boolean;
  extendRight: boolean;
  forceOverlay: boolean;
  deleted: boolean;
}
interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** A zone of a level (no background, no border) or an order block */
  zone: boolean;
  bg: string;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DonaltSmartMoneyToolkitInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines'> & { boxes: BoxData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length = Math.trunc(cfg.length);
  const period = Math.trunc(cfg.period);
  const fg = foregroundColorOf(chart);
  const ms = n > 0 && bars[0].time >= 1e12;
  const timeMs = (i: number) => (ms ? bars[i].time : bars[i].time * 1000);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const range = bars.map((b) => b.high - b.low);
  const rangeSeries = Series.fromArray(bars, range);
  const ph = A(ta.pivothigh(new Series(bars, (b) => b.open), length, length));
  const pl = A(ta.pivotlow(new Series(bars, (b) => b.close), length, length));
  // normalize(): position of the bar range inside its 200-bar span, 0 to 100
  const lowest = A(ta.lowest(rangeSeries, 200));
  const highest = A(ta.highest(rangeSeries, 200));
  const nVolatility = range.map((r, i) => ((r - lowest[i]) / (highest[i] - lowest[i])) * 100);
  const volatility = A(ta.sma(rangeSeries, 200));
  const bodyHigh = bars.map((b) => (gt(b.close, b.open) ? b.close : b.open));
  const bodyLow = bars.map((b) => (gt(b.close, b.open) ? b.open : b.close));
  const atr = A(ta.atr(bars, 200)).map((v) => v * 0.5);
  const PH = A(ta.pivothigh(new Series(bars, (b) => b.high), period, period));
  const PL = A(ta.pivotlow(new Series(bars, (b) => b.low), period, period));

  // Objects in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain. A deleted object ignores later changes and reads as na.
  const lineRegistry: Ln[] = [];
  const boxRegistry: Bx[] = [];
  const limit = <T extends { deleted: boolean }>(list: T[], max: number) => {
    if (list.length <= max + 5) return;
    for (const o of list.splice(0, list.length - max)) o.deleted = true;
  };
  const newLine = (l: Omit<Ln, 'deleted' | 'extendRight'>): Ln => {
    const o = { ...l, extendRight: false, deleted: false };
    lineRegistry.push(o);
    limit(lineRegistry, MAX_LINES);
    return o;
  };
  const deleteLine = (l: Ln | null) => {
    if (!l || l.deleted) return;
    l.deleted = true;
    lineRegistry.splice(lineRegistry.indexOf(l), 1);
  };
  const newBox = (b: Omit<Bx, 'deleted'>): Bx => {
    const o = { ...b, deleted: false };
    boxRegistry.push(o);
    limit(boxRegistry, MAX_BOXES);
    return o;
  };
  const deleteBox = (b: Bx) => {
    if (b.deleted) return;
    b.deleted = true;
    boxRegistry.splice(boxRegistry.indexOf(b), 1);
  };
  const topOf = (b: Bx | null) => (b && !b.deleted ? b.top : NaN);
  const bottomOf = (b: Bx | null) => (b && !b.deleted ? b.bottom : NaN);

  // var array<line> lines = array.new<line>(10): ten empty slots first
  const lines: Array<Ln | null> = new Array<Ln | null>(10).fill(null);
  // var array<line> Lines = array.new<line>(5)
  const trendLines: Array<Ln | null> = new Array<Ln | null>(5).fill(null);

  /** draw_ob(): one side of the order blocks; it only runs on the last bars and keeps the history of its own runs */
  const orderBlocks = (bullish: boolean, first: number) => {
    const boxes1: Array<Bx | null> = new Array<Bx | null>(BOX_AMOUNT).fill(null);
    // candle_, src_l and src_h of each bar where the function ran (na before its first run)
    const candle = (i: number) => {
      if (i < first) return false;
      const b = bars[i];
      return bullish ? lt(b.close, b.open) : gt(b.close, b.open);
    };
    const srcL = (i: number) => (i < first ? NaN : bullish ? bars[i].close : bars[i].open);
    const srcH = (i: number) => (i < first ? NaN : bullish ? bars[i].open : bars[i].close);
    /** boxes1.set(boxes1.indexof(box_id), na): an index of -1 (not found) is the last element */
    const clear = (b: Bx) => {
      const at = boxes1.indexOf(b);
      if (boxes1.length > 0) boxes1[at < 0 ? boxes1.length - 1 : at] = null;
    };
    return (i: number, gap: boolean) => {
      const b = bars[i];
      if (gap) {
        const index = candle(i - 1) ? 1 : candle(i - 2) ? 2 : candle(i - 3) ? 3 : candle(i - 4) ? 4 : 2;
        boxes1.push(newBox({
          left: i - index, top: srcH(i - index), right: n - 1, bottom: srcL(i - index), zone: false,
          bg: bullish ? cfg.colBull : cfg.colBear,
        }));
      }
      for (let a = 0; a < boxes1.length; a++) {
        const id = boxes1[a];
        if (!id) continue;
        if (!id.deleted) id.right = i + 25;
        if (bullish ? lt(b.high, bottomOf(id)) : gt(b.low, topOf(id))) {
          deleteBox(id);
          clear(id);
        }
        for (let c = 0; c < boxes1.length; c++) {
          const top1 = topOf(boxes1[c]);
          const top = topOf(id);
          const bottom = bottomOf(id);
          if (lt(top1, top) && gt(top1, bottom)) {
            deleteBox(id);
            clear(id);
          }
          if (lt(top - bottom, atr[i] * 0.5)) {
            deleteBox(id);
            clear(id);
          }
        }
      }
      if (boxes1.length >= BOX_AMOUNT) {
        const old = boxes1.shift();
        if (old) deleteBox(old);
      }
    };
  };

  /** draw_trendLine(): one side of the trend lines; it only runs on the last bars and keeps the history of its own runs */
  const trendLine = (lineSlope: boolean) => {
    // var src = 0, var TIME = 1; their value one run back is na on the first run
    let src = 0;
    let TIME = 1;
    let prevSrc = NaN;
    let prevTIME = NaN;
    return (i: number, pivot: number) => {
      if (!isNaN(pivot)) {
        const barTimeGap = i > 0 ? timeMs(i) - timeMs(i - 1) : NaN;
        src = pivot;
        TIME = i >= period ? timeMs(i - period) : NaN;
        const yStart = prevSrc;
        const start = prevTIME;
        const slope = (src - yStart) / (TIME - start);
        const extend = barTimeGap * cfg.extend * 2;
        const end = TIME + extend;
        const yEnd = src + extend * slope;
        const falling = lt(slope * timeMs(i), 0);
        const css = falling ? (lineSlope ? null : cfg.lineCol1) : lineSlope ? cfg.lineCol2 : null;
        if (css !== null) {
          trendLines.push(newLine({
            x1: start, y1: yStart, x2: end, y2: yEnd, byTime: true, color: css, dashed: cfg.style2 === 'Dashed',
            forceOverlay: false,
          }));
        }
      }
      prevSrc = src;
      prevTIME = TIME;
    };
  };

  const first = Math.max(0, n - LOOKBACK);
  const bullBlocks = orderBlocks(true, first);
  const bearBlocks = orderBlocks(false, first);
  const highTrend = trendLine(false);
  const lowTrend = trendLine(true);
  const levelDashed = cfg.style1 === 'Dashed';

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const allow = n - 1 - i < LOOKBACK;
    // array<box> boxes: the zones made on this bar
    const zones: Bx[] = [];

    if (allow && cfg.displayLvl) {
      const k = i - length;
      const level = (y: number, width: number, css: string, forceOverlay: boolean) => {
        if (!gt(nVolatility[k], FILTER)) return;
        lines.push(newLine({ x1: k, y1: y, x2: k, y2: y, byTime: false, color: css, dashed: levelDashed, forceOverlay }));
        zones.push(newBox({ left: k, top: y + volatility[i] * width, right: k, bottom: y - volatility[i] * width, zone: true, bg: 'transparent' }));
      };
      if (!isNaN(ph[i]) && k >= 0) level(bodyHigh[k], 2.5, cfg.up, true);
      if (!isNaN(pl[i]) && k >= 0) level(bodyLow[k], 1.5, cfg.dn, false);
    }

    // Colour from the side of the close; a line that was lengthened extends to the right
    for (const id of lines) {
      if (!id || id.deleted) continue;
      id.color = gt(b.close, id.y1) ? cfg.up : cfg.dn;
      if (id.x1 !== id.x2) id.extendRight = true;
    }
    // A new zone lengthens the lines inside it
    for (const zone of zones) {
      for (const id of lines) {
        if (!id || id.deleted) continue;
        if (gt(id.y2, bottomOf(zone)) && lt(id.y2, topOf(zone))) id.x2 = i + 500;
      }
    }
    if (lines.length >= 15) deleteLine(lines.shift() ?? null);

    // line.new(na, na, na, na): an empty line on every bar
    newLine({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, byTime: false, color: '#2962FF', dashed: false, forceOverlay: false });

    if (cfg.displayOb && allow) {
      const h2 = i >= 2 ? bars[i - 2].high : NaN;
      const l2 = i >= 2 ? bars[i - 2].low : NaN;
      const h1 = i >= 1 ? bars[i - 1].high : NaN;
      const l1 = i >= 1 ? bars[i - 1].low : NaN;
      let bearCandles = false;
      let bullCandles = false;
      for (let k = 0; k <= 4 && i - k >= 0; k++) {
        bearCandles = bearCandles || lt(bars[i - k].close, bars[i - k].open);
        bullCandles = bullCandles || gt(bars[i - k].close, bars[i - k].open);
      }
      const isBullGap = lt(h2, b.low) && lt(h2, h1) && lt(l2, b.low) && gt(b.low - h2, atr[i] * 0.5) && bearCandles;
      const isBearGap = gt(l2, b.high) && gt(l2, l1) && gt(h2, b.high) && gt(l2 - b.high, atr[i] * 0.5) && bullCandles;
      bullBlocks(i, isBullGap);
      bearBlocks(i, isBearGap);
    }

    if (cfg.displayTren && allow) {
      highTrend(i, PH[i]);
      lowTrend(i, PL[i]);
    }
    if (trendLines.length > 1) deleteLine(trendLines.shift() ?? null);
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const fromMs = (t: number) => (ms ? t : t / 1000);
  const drawn = (...v: number[]) => v.every((x) => !isNaN(x));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // a line or a box with an na coordinate is not drawn
    lines: lineRegistry.filter((l) => drawn(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
      time1: l.byTime ? fromMs(l.x1) : T(l.x1), price1: l.y1, time2: l.byTime ? fromMs(l.x2) : T(l.x2), price2: l.y2,
      color: l.color,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
      ...(l.extendRight ? { extend: 'right' as const } : {}),
      ...(l.forceOverlay ? { forceOverlay: true } : {}),
    })),
    boxes: boxRegistry.filter((b) => drawn(b.left, b.top, b.right, b.bottom)).map((b) => (b.zone
      ? { time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: 'transparent', borderWidth: 0 }
      : {
        time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg, borderColor: fg,
        borderWidth: 1, textSize: 'small' as const, textColor: fg, textHAlign: 'right' as const,
      })),
  };
}

export const DonaltSmartMoneyToolkit = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
