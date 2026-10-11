/**
 * Trend Channels With Liquidity Breaks [ChartPrime]
 *
 * Down and up trend channels drawn from pivots, with a label where the price leaves a channel.
 * - Pivot highs and lows use "Length" bars on each side. A down channel starts when a new pivot high is not above
 *   the pivot high before it; an up channel when a new pivot low is not below the pivot low before it. Only one
 *   channel of each kind is active, and with "Wait for Break" a channel only starts when the other kind is not
 *   active.
 * - A channel has seven lines through the two pivots: a top line, a bottom line 6 ATR(10) away, a dashed centre line
 *   and the edges of two zones (1/7 of that distance on each side of the pivot line and of the far line), with fills
 *   in the zones. While the channel is active its right end follows the current bar, moved by the slope of the two
 *   pivots on each bar.
 * - The channel ends when the low is above its top line or the high is below its bottom line. A label is placed
 *   there with the volume state: the weighted average of the volume (21 bars), scaled between its lowest and highest
 *   of 100 bars, is "LV" when it is below its average since the start, "MV" when it is between this average and the
 *   average of its highest of 75 bars (a nearest-rank percentile of 100), else "HV".
 * - "Volume BG" colours the zone fills of an active channel with the scaled volume.
 *
 * Chart values (third argument): the port reads the symbol tick (the line prices are rounded to it; without it:
 * 0.01) and the state of the last bar (a channel only starts, and an up channel only ends, on a closed bar; without
 * it the last bar is taken as closed).
 *
 * Reference: "Trend Channels With Liquidity Breaks [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData } from '../types';
import { lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';

export interface TrendChannelsWithLiquidityBreaksInputs {
  /** Pivot length */
  length: number;
  /** Show Last Channel */
  show: boolean;
  /** Wait for Break */
  wait: boolean;
  /** Extend Line */
  extend: boolean;
  /** Volume BG */
  enableLiquid: boolean;
  topColor: string;
  centerColor: string;
  bottomColor: string;
}

export const defaultInputs: TrendChannelsWithLiquidityBreaksInputs = {
  length: 8,
  show: true,
  wait: true,
  extend: false,
  enableLiquid: false,
  topColor: 'rgb(51, 124, 79)',
  centerColor: '#787B86',
  bottomColor: 'rgb(165, 45, 45)',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 8 },
  { id: 'show', type: 'bool', title: 'Show Last Channel', defval: true },
  { id: 'wait', type: 'bool', title: 'Wait for Break', defval: true },
  { id: 'extend', type: 'bool', title: 'Extend Line', defval: false },
  { id: 'enableLiquid', type: 'bool', title: 'Volume BG', defval: false },
  { id: 'topColor', type: 'color', title: 'Colors', defval: 'rgb(51, 124, 79)', inline: 'Colors' },
  { id: 'centerColor', type: 'color', title: '', defval: '#787B86', inline: 'Colors' },
  { id: 'bottomColor', type: 'color', title: '', defval: 'rgb(165, 45, 45)', inline: 'Colors' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Trend Channels With Liquidity Breaks [ChartPrime]',
  shortTitle: 'Trend Channels [ChartPrime]',
  overlay: true,
};

/** color.new(color.black, 100) of this Pine version */
const NO_COLOR = 'rgba(54, 58, 69, 0)';
/** color.new(color.silver, 0) */
const SILVER = '#B2B5BE';
/** Default label colour */
const BLUE = '#2962FF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
/** nz(): na and infinite values count as 0 */
const nz = (x: number) => (Number.isFinite(x) ? x : 0);

interface Ln { x1: number; y1: number; x2: number; y2: number; color: string | null; dashed: boolean }
interface Lb { x: number; y: number; text: string; color: string; style: 'label_down' | 'label_up' }
interface Fill { line1: Ln; line2: Ln; color: string }

/** The seven lines of one channel */
interface Channel { top: Ln; bottom: Ln; topZone: Ln; bottomZone: Ln; topZoneMid: Ln; bottomZoneMid: Ln; center: Ln }

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendChannelsWithLiquidityBreaksInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; linefills: LinefillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length = Math.trunc(cfg.length);
  const mintick = mintickOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const round = (x: number) => (isNaN(x) ? NaN : math.round_to_mintick(x, mintick));

  const ph = A(ta.pivothigh(new Series(bars, (b) => b.high), length, length));
  const pl = A(ta.pivotlow(new Series(bars, (b) => b.low), length, length));
  const atr10 = A(ta.atr(bars, 10));
  const atr20 = A(ta.atr(bars, 20));

  // volume_normalized(): the weighted average of the volume between its lowest and highest of 100 bars (0 to 100)
  const wma = ta.wma(new Series(bars, (b) => b.volume ?? NaN), 21);
  const wmaArr = A(wma);
  const lowest = A(ta.lowest(wma, 100));
  const highest = A(ta.highest(wma, 100));
  const vol = wmaArr.map((v, i) => Math.max(Math.min(100, ((v - lowest[i]) / (highest[i] - lowest[i])) * 100), 0));
  // ta.percentile_nearest_rank(vol, 75, 100): length 75, percentage 100
  const rank = A(ta.percentile_nearest_rank(Series.fromArray(bars, vol), 75, 100));

  // simple_moving_average(): the sum restarts after an na value, the count runs from the first bar
  const average = () => {
    let sum = NaN;
    let count = NaN;
    return (source: number) => {
      count = nz(count) + 1;
      sum = nz(sum) + source;
      return sum / count;
    };
  };
  const avgOf = average();
  const avgRankOf = average();

  const newLine = (dashed = false): Ln => ({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: dashed ? null : NO_COLOR, dashed });
  const newChannel = (): Channel => {
    const c = {
      top: newLine(), bottom: newLine(), topZone: newLine(), bottomZone: newLine(), topZoneMid: newLine(),
      bottomZoneMid: newLine(), center: newLine(true),
    };
    // var ..._top / ..._bottom = line.new(na, na, na, na, color = na, width = 2)
    c.top.color = null;
    c.bottom.color = null;
    return c;
  };
  const all = (c: Channel) => [c.top, c.bottom, c.topZone, c.bottomZone, c.topZoneMid, c.bottomZoneMid, c.center];
  const down = newChannel();
  const up = newChannel();
  const downLabel: Lb = { x: NaN, y: NaN, text: '', color: BLUE, style: 'label_down' };
  const upLabel: Lb = { x: NaN, y: NaN, text: '', color: BLUE, style: 'label_up' };

  const topFill = String(color.new(cfg.topColor, 20));
  const bottomFill = String(color.new(cfg.bottomColor, 20));
  const topZoneFill = String(color.new(cfg.topColor, 80));
  const bottomZoneFill = String(color.new(cfg.bottomColor, 80));
  // linefill.new() runs on every bar: the fill between the same two lines is made again with its first colour
  const fillsOf = (c: Channel): Fill[] => [
    { line1: c.top, line2: c.topZoneMid, color: topFill },
    { line1: c.bottom, line2: c.bottomZoneMid, color: bottomFill },
    { line1: c.topZoneMid, line2: c.topZone, color: topZoneFill },
    { line1: c.bottomZoneMid, line2: c.bottomZone, color: bottomZoneFill },
  ];
  const downFills = fillsOf(down);
  const upFills = fillsOf(up);

  const setXy1 = (l: Ln, x: number, y: number) => {
    l.x1 = x;
    l.y1 = y;
  };
  const setXy2 = (l: Ln, x: number, y: number) => {
    l.x2 = x;
    l.y2 = y;
  };
  /** line.get_price(): the price of the line (extended both ways) on a bar */
  const priceAt = (l: Ln, x: number) => l.y1 + ((l.y2 - l.y1) * (x - l.x1)) / (l.x2 - l.x1);
  const blank = (c: Channel, label: Lb) => {
    for (const l of all(c)) {
      setXy1(l, NaN, NaN);
      setXy2(l, NaN, NaN);
    }
    label.text = '';
    label.color = NO_COLOR;
  };

  let prevPivotHigh = NaN;
  let prevPivotHighIndex = NaN;
  let lastPivotHigh = NaN;
  let lastPivotHighIndex = NaN;
  let prevPivotLow = NaN;
  let prevPivotLowIndex = NaN;
  let lastPivotLow = NaN;
  let lastPivotLowIndex = NaN;
  let downDydx = 0;
  let upDydx = 0;
  let downCount = 0;
  let upCount = 0;
  // atan2(): `var float angle`, one per call
  let downAngle = 0.0;
  let upAngle = 0.0;
  const atan2 = (angle: number, y: number, x: number): number => {
    if (gt(x, 0)) return Math.atan(y / x);
    if (lt(x, 0) && ge(y, 0)) return Math.atan(y / x) + Math.PI;
    if (lt(x, 0) && lt(y, 0)) return Math.atan(y / x) - Math.PI;
    if (eq(x, 0) && gt(y, 0)) return Math.PI / 2;
    if (eq(x, 0) && lt(y, 0)) return -Math.PI / 2;
    return angle;
  };

  for (let i = 0; i < n; i++) {
    const { high, low } = bars[i];
    const confirmed = i < n - 1 || lastConfirmed;
    const prevPivotHighBefore = prevPivotHigh;
    const prevPivotLowBefore = prevPivotLow;

    if (!isNaN(ph[i])) {
      prevPivotHigh = lastPivotHigh;
      prevPivotHighIndex = lastPivotHighIndex;
      lastPivotHigh = ph[i];
      lastPivotHighIndex = i;
    }
    if (!isNaN(pl[i])) {
      prevPivotLow = lastPivotLow;
      prevPivotLowIndex = lastPivotLowIndex;
      lastPivotLow = pl[i];
      lastPivotLowIndex = i;
    }
    const volumeScore = vol[i];

    // The fills are made again on every bar
    downFills[0].color = topFill;
    downFills[1].color = bottomFill;
    downFills[2].color = topZoneFill;
    downFills[3].color = bottomZoneFill;
    upFills[0].color = topFill;
    upFills[1].color = bottomFill;
    upFills[2].color = topZoneFill;
    upFills[3].color = bottomZoneFill;

    const offset = atr10[i] * 6;

    // A new down channel
    downAngle = atan2(downAngle, lastPivotHigh - prevPivotHigh, lastPivotHighIndex - prevPivotHighIndex);
    if (!isNaN(prevPivotHigh) && !isNaN(lastPivotHigh) && ne(prevPivotHigh, prevPivotHighBefore) && le(downAngle, 0)
      && downCount === 0 && (cfg.wait ? upCount !== 1 : true) && confirmed) {
      downCount = 1;
      const x1 = prevPivotHighIndex - length;
      const x2 = lastPivotHighIndex - length;
      const p = prevPivotHigh;
      const l = lastPivotHigh;
      setXy1(down.top, x1, round(p + offset / 7));
      setXy2(down.top, x2, round(l + offset / 7));
      down.top.color = cfg.topColor;
      setXy1(down.topZone, x1, round(p - offset / 7));
      setXy2(down.topZone, x2, round(l - offset / 7));
      setXy1(down.topZoneMid, x1, p);
      setXy2(down.topZoneMid, x2, l);
      downDydx = (l - p) / (lastPivotHighIndex - prevPivotHighIndex);
      setXy1(down.bottom, x1, round(p - offset - offset / 7));
      setXy2(down.bottom, x2, round(l - offset - offset / 7));
      down.bottom.color = cfg.bottomColor;
      setXy1(down.bottomZone, x1, round(p - offset + offset / 7));
      setXy2(down.bottomZone, x2, round(l - offset + offset / 7));
      setXy1(down.bottomZoneMid, x1, round(p - offset));
      setXy2(down.bottomZoneMid, x2, round(l - offset));
      setXy1(down.center, x1, round((p + p - offset) / 2));
      setXy2(down.center, x2, round((l + l - offset) / 2));
      down.center.color = cfg.centerColor;
      downLabel.text = '';
      downLabel.color = NO_COLOR;
      if (!cfg.show) blank(up, upLabel);
    }

    // A new up channel
    upAngle = atan2(upAngle, lastPivotLow - prevPivotLow, lastPivotLowIndex - prevPivotLowIndex);
    if (!isNaN(prevPivotLow) && !isNaN(lastPivotLow) && ne(prevPivotLow, prevPivotLowBefore) && ge(upAngle, 0)
      && upCount === 0 && (cfg.wait ? downCount !== 1 : true) && confirmed) {
      upCount = 1;
      const x1 = prevPivotLowIndex - length;
      const x2 = lastPivotLowIndex - length;
      const p = prevPivotLow;
      const l = lastPivotLow;
      setXy1(up.top, x1, round(p + offset + offset / 7));
      setXy2(up.top, x2, round(l + offset + offset / 7));
      up.top.color = cfg.topColor;
      setXy1(up.topZone, x1, round(p + offset - offset / 7));
      setXy2(up.topZone, x2, round(l + offset - offset / 7));
      setXy1(up.topZoneMid, x1, round(p + offset));
      setXy2(up.topZoneMid, x2, round(l + offset));
      setXy1(up.bottom, x1, round(p - offset / 7));
      setXy2(up.bottom, x2, round(l - offset / 7));
      up.bottom.color = cfg.bottomColor;
      setXy1(up.bottomZone, x1, round(p + offset / 7));
      setXy2(up.bottomZone, x2, round(l + offset / 7));
      setXy1(up.bottomZoneMid, x1, round(p));
      setXy2(up.bottomZoneMid, x2, round(l));
      upDydx = (l - p) / (lastPivotLowIndex - prevPivotLowIndex);
      setXy1(up.center, x1, round((p + p + offset) / 2));
      setXy2(up.center, x2, round((l + l + offset) / 2));
      up.center.color = cfg.centerColor;
      upLabel.text = '';
      upLabel.color = NO_COLOR;
      if (!cfg.show) blank(down, downLabel);
    }

    // liquidity_break()
    const avg = avgOf(vol[i]);
    const avgRank = avgRankOf(rank[i]);
    const liquidityScore = lt(vol[i], avg) ? 'LV' : gt(vol[i], avg) && lt(vol[i], avgRank) ? 'MV' : 'HV';
    const volumeColorHigh = String(color.new(cfg.topColor, 60 + (100 - volumeScore) / 5));
    const volumeColorLow = String(color.new(cfg.bottomColor, 60 + (100 - volumeScore) / 5));
    const atr = atr20[i] / 1.5;

    /** An active channel: fills, right end on the current bar, break labels */
    const follow = (c: Channel, fills: Fill[], dydx: number, label: Lb, needsClosedBar: boolean): boolean => {
      if (cfg.enableLiquid) {
        fills[2].color = volumeColorHigh;
        fills[3].color = volumeColorLow;
      }
      if (!cfg.extend) {
        for (const l of all(c)) l.y2 += dydx;
        for (const l of all(c)) l.x2 = i;
      }
      let broken = false;
      if (gt(low, priceAt(c.top, i)) && (!needsClosedBar || confirmed)) {
        broken = true;
        label.text = liquidityScore;
        label.color = cfg.topColor;
        label.style = 'label_up';
        label.x = i;
        label.y = c.top.y2 - atr;
      }
      if (lt(high, priceAt(c.bottom, i)) && (!needsClosedBar || confirmed)) {
        broken = true;
        label.text = liquidityScore;
        label.color = cfg.bottomColor;
        label.style = 'label_down';
        label.x = i;
        label.y = c.bottom.y2 + atr;
      }
      return broken;
    };
    if (downCount === 1 && follow(down, downFills, downDydx, downLabel, false)) downCount = 0;
    if (upCount === 1 && follow(up, upFills, upDydx, upLabel, true)) upCount = 0;
  }

  // An object with an na coordinate is not drawn
  const drawn = (l: Ln) => ![l.x1, l.y1, l.x2, l.y2].some((v) => isNaN(v));
  const toLine = (l: Ln): LineDrawingData => ({
    time1: bars[l.x1].time, price1: l.y1, time2: bars[l.x2].time, price2: l.y2, color: l.color ?? 'transparent', width: 2,
    ...(l.dashed ? { style: 'dashed' as const } : {}),
    ...(cfg.extend ? { extend: 'right' as const } : {}),
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: [...all(down), ...all(up)].filter(drawn).map(toLine),
    linefills: [...downFills, ...upFills].filter((f) => drawn(f.line1) && drawn(f.line2))
      .map((f) => ({ line1: toLine(f.line1), line2: toLine(f.line2), color: f.color })),
    labels: [downLabel, upLabel].filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.text, color: l.color, textColor: SILVER, style: l.style,
    })),
  };
}

export const TrendChannelsWithLiquidityBreaks = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
