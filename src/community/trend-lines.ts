/**
 * Trend Lines
 *
 * Finds pivot highs and pivot lows ("Left Bars" bars before and "Right Bars" bars after the pivot bar) and joins each
 * new pivot to the pivot before it on the same side:
 * - a pivot high below the pivot high before it gives a downtrend line through the two highs;
 * - a pivot low above the pivot low before it gives an uptrend line through the two lows.
 * A new line is extended to the right. The slope of each line (price change per bar) is compared with the slope of
 * the line before it: when the new downtrend line is less steep, the line before stops at its second pivot; when it
 * is steeper, the new line itself is not extended (the same rule, mirrored, for uptrend lines). A pivot that does not
 * give a line resets the slope. With "Show Old Line as Dashed" the line of the pivot before becomes dashed when the
 * next pivot of that side arrives.
 *
 * Each pivot is marked with an "H" above its bar or an "L" below it. At most 50 lines are kept.
 *
 * Reference: "Trend Lines" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface TrendLinesInputs {
  /** Bars before the pivot bar */
  lb: number;
  /** Bars after the pivot bar */
  rb: number;
  showpivot: boolean;
  chdashed: boolean;
  ucolor: string;
  dcolor: string;
}

export const defaultInputs: TrendLinesInputs = {
  lb: 30,
  rb: 30,
  showpivot: true,
  chdashed: true,
  ucolor: '#00E676',
  dcolor: '#FF5252',
};

export const inputConfig: InputConfig[] = [
  { id: 'lb', type: 'int', title: 'Left Bars', defval: 30, min: 1 },
  { id: 'rb', type: 'int', title: 'Right Bars', defval: 30, min: 1 },
  { id: 'showpivot', type: 'bool', title: 'Show Pivot Points', defval: true },
  { id: 'chdashed', type: 'bool', title: 'Show Old Line as Dashed', defval: true },
  { id: 'ucolor', type: 'color', title: 'Uptrend line color', defval: '#00E676' },
  { id: 'dcolor', type: 'color', title: 'Downtrend line color', defval: '#FF5252' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Trend Lines',
  shortTitle: 'Trend Lines',
  overlay: true,
};

/** Default number of lines kept */
const MAX_LINES = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** `x != 0` (false when x is na) */
const nonZero = (x: number) => !isNaN(x) && Math.abs(x) > EPS;

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  extend: 'right' | 'none';
  dashed: boolean;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendLinesInputs> = {},
): Omit<IndicatorResult, 'lines' | 'markers'> & { lines: LineDrawingData[]; markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lb = Math.trunc(cfg.lb);
  const rb = Math.trunc(cfg.rb);
  const mb = lb + rb + 1;

  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const highestBars = ta.highestbars(highS, mb).toArray();
  const lowestBars = ta.lowestbars(lowS, mb).toArray();

  // top := not na(high[mb]) ? (highestbars(high, mb) == -rb ? high[rb] : na) : na
  const top: number[] = new Array(n).fill(NaN);
  const bot: number[] = new Array(n).fill(NaN);
  for (let i = mb; i < n; i++) {
    if (!isNaN(bars[i - mb].high) && highestBars[i] === -rb) top[i] = bars[i - rb].high;
    if (!isNaN(bars[i - mb].low) && lowestBars[i] === -rb) bot[i] = bars[i - rb].low;
  }
  // valuewhen(top, top, 1): the pivot before the latest one (a float is true when it is not na and not 0)
  const topS = Series.fromArray(bars, top);
  const botS = Series.fromArray(bars, bot);
  const ltop = ta.valuewhen(Series.fromArray(bars, top.map((v) => (nonZero(v) ? 1 : 0))), topS, 1).toArray();
  const lbot = ta.valuewhen(Series.fromArray(bars, bot.map((v) => (nonZero(v) ? 1 : 0))), botS, 1).toArray();

  // Lines in creation order: when a creation brings the count above max + 5, the oldest are deleted until max remain
  const lines: Ln[] = [];
  const newLine = (l: Omit<Ln, 'deleted'>): Ln => {
    const o = { ...l, deleted: false };
    lines.push(o);
    if (lines.length > MAX_LINES + 5) for (const old of lines.splice(0, lines.length - MAX_LINES)) old.deleted = true;
    return o;
  };

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const markers: MarkerData[] = [];
  const labelColor = String(color.new('#FFFFFF', 100));

  /** One side: pivot highs (downtrend lines) or pivot lows (uptrend lines) */
  const side = (isTop: boolean) => {
    const pivot = isTop ? top : bot;
    const before = isTop ? ltop : lbot;
    const price = (i: number) => (i >= 0 ? (isTop ? bars[i].high : bars[i].low) : NaN);
    const css = isTop ? cfg.dcolor : cfg.ucolor;
    let since = NaN; // bst / bsb
    let angle = NaN; // t_angle / b_angle: na on the first bar, then carried
    // `line tline = na` inside the `if` block: tline[1] is the value the block gave it the last time it ran
    let lineBefore: Ln | null = null;

    return (i: number) => {
      const p = pivot[i];
      const isPivot = nonZero(p);
      const sinceBefore = since;
      since = isPivot ? 1 : (isNaN(sinceBefore) ? 0 : sinceBefore) + 1;
      const angleBefore = angle;

      if (isPivot && cfg.showpivot) {
        markers.push(isTop
          ? { time: T(i - rb), position: 'aboveBar', shape: 'labelDown', color: labelColor, text: 'H', textColor: '#FF5252' }
          : { time: T(i - rb), position: 'belowBar', shape: 'labelUp', color: labelColor, text: 'L', textColor: '#00E676' });
      }

      const last = before[i] ?? NaN;
      if (isNaN(last) || isNaN(p)) return;
      let line: Ln | null = null;
      if (isTop ? gt(last, p) : lt(last, p)) {
        const y1 = price(i - sinceBefore - rb);
        const y2 = price(i - rb);
        line = newLine({ x1: i - sinceBefore - rb, y1, x2: i - rb, y2, color: css, extend: 'right', dashed: false });
        angle = (y1 - y2) / sinceBefore;
        const flatter = isTop ? lt(angle, angleBefore) : gt(angle, angleBefore);
        const steeper = isTop ? gt(angle, angleBefore) : lt(angle, angleBefore);
        if (flatter && nonZero(angleBefore) && lineBefore && !lineBefore.deleted) lineBefore.extend = 'none';
        if (steeper && nonZero(angleBefore)) line.extend = 'none';
      }
      if (isTop ? !gt(last, p) : !lt(last, p)) angle = 0;
      if (cfg.chdashed && lineBefore && !lineBefore.deleted) lineBefore.dashed = true;
      lineBefore = line;
    };
  };

  const tops = side(true);
  const bots = side(false);
  for (let i = 0; i < n; i++) {
    tops(i);
    bots(i);
  }
  markers.sort((a, b) => a.time - b.time);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // a line with an na coordinate is not drawn
    lines: lines.filter((l) => !isNaN(l.y1) && !isNaN(l.y2) && !isNaN(l.x1)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color, extend: l.extend,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
    })),
  };
}

export const TrendLines = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
