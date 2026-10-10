/**
 * Three Bar Reversal Pattern [LuxAlgo]
 *
 * Bullish pattern: a falling bar, then a falling bar with a lower low and a lower high, then a rising bar whose high
 * is above the high of the first bar. The bearish pattern is the mirrored case. "Enhanced" keeps the patterns whose
 * third bar closes beyond the first bar, "Normal" the others. A trend filter (moving average cloud, Supertrend or
 * Donchian channels, drawn when selected) keeps the patterns that are aligned with the trend or opposite to it.
 *
 * Each pattern gets a triangle label and two lines (the high of the first bar and the lowest low of the last two
 * bars for a bullish pattern) with a fill between them; a second pair of lines follows the bars while the pattern
 * is open. The pattern is confirmed when a close is beyond the first line (a dot label marks the bar, and a support
 * or resistance box starts, extended until a close crosses it) and it fails when a close is beyond the other line
 * or when the opposite pattern appears. The label tooltip tells the state. At most 500 lines, labels and boxes are
 * kept.
 *
 * The background colour of the chart is only used fully transparent, so the port needs no chart theme.
 *
 * Reference: "Three Bar Reversal Pattern [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, Series, color, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, LinefillData } from '../types';

export interface ThreeBarReversalPatternInputs {
  brpType: 'Normal' | 'Enhanced' | 'All';
  /** Support and resistance derived from the confirmed patterns */
  brpSR: 'Level' | 'Zone' | 'None';
  brpAC: string;
  brpSC: string;
  trendType: 'Moving Average Cloud' | 'Supertrend' | 'Donchian Channels' | 'None';
  trendFilt: 'Aligned' | 'Opposite';
  trendAC: string;
  trendSC: string;
  maType: 'SMA' | 'EMA' | 'HMA' | 'RMA' | 'WMA' | 'VWMA';
  maFLength: number;
  maSLength: number;
  atrPeriod: number;
  factor: number;
  /** Donchian channel length */
  length: number;
}

export const defaultInputs: ThreeBarReversalPatternInputs = {
  brpType: 'All',
  brpSR: 'Level',
  brpAC: '#2962ff',
  brpSC: '#ff9800',
  trendType: 'None',
  trendFilt: 'Aligned',
  trendAC: '#089981',
  trendSC: '#f23645',
  maType: 'HMA',
  maFLength: 50,
  maSLength: 200,
  atrPeriod: 10,
  factor: 3,
  length: 13,
};

export const inputConfig: InputConfig[] = [
  { id: 'brpType', type: 'string', title: 'Pattern Type', defval: 'All', options: ['Normal', 'Enhanced', 'All'] },
  { id: 'brpSR', type: 'string', title: 'Derived Support and Resistance', defval: 'Level', options: ['Level', 'Zone', 'None'] },
  { id: 'brpAC', type: 'color', title: 'Bullish Reversal Patterns', defval: '#2962ff' },
  { id: 'brpSC', type: 'color', title: 'Bearish Reversal Patterns', defval: '#ff9800' },
  { id: 'trendType', type: 'string', title: 'Filtering', defval: 'None', options: ['Moving Average Cloud', 'Supertrend', 'Donchian Channels', 'None'], group: 'Trend Filtering', inline: 'flt' },
  { id: 'trendFilt', type: 'string', title: '', defval: 'Aligned', options: ['Aligned', 'Opposite'], group: 'Trend Filtering', inline: 'flt' },
  { id: 'trendAC', type: 'color', title: 'Bullish Trend', defval: '#089981', inline: 'trnd' },
  { id: 'trendSC', type: 'color', title: ' Bearish Trend', defval: '#f23645', inline: 'trnd' },
  { id: 'maType', type: 'string', title: 'Type', defval: 'HMA', options: ['SMA', 'EMA', 'HMA', 'RMA', 'WMA', 'VWMA'], group: 'Moving Average Settings' },
  { id: 'maFLength', type: 'int', title: 'Fast Length', defval: 50, min: 1, max: 100, group: 'Moving Average Settings' },
  { id: 'maSLength', type: 'int', title: 'Slow Length', defval: 200, min: 100, group: 'Moving Average Settings' },
  { id: 'atrPeriod', type: 'int', title: 'ATR Length', defval: 10, min: 1, group: 'Supertrend Settings' },
  { id: 'factor', type: 'float', title: 'Factor', defval: 3, min: 2, step: 0.1, group: 'Supertrend Settings' },
  { id: 'length', type: 'int', title: 'Length', defval: 13, min: 1, group: 'Donchian Channel Settings' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ma fast', color: String(color.new('#f23645', 81)), lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'ma slow', color: String(color.new('#f23645', 73)), lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Up Trend', color: String(color.new('#089981', 73)), lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'Down Trend', color: String(color.new('#f23645', 73)), lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Body Middle', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Donchian Upper', color: String(color.new('#f23645', 73)), lineWidth: 1 },
  { id: 'plot6', title: 'Donchian Lower', color: String(color.new('#f23645', 99)), lineWidth: 1 },
];

export const metadata = {
  title: 'Three Bar Reversal Pattern [LuxAlgo]',
  shortTitle: 'LuxAlgo - Three Bar Reversal Pattern',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Ln { x1: number; x2: number; y: number; color: string; deleted: boolean }
interface Lb { x: number; y: number; text: string; textColor: string; up: boolean; tooltip: string; deleted: boolean }
interface Bx { left: number; right: number; top: number; bottom: number; border: string; bg: string; deleted: boolean }
interface Lf { line1: Ln; line2: Ln; color: string }

export function calculate(
  bars: Bar[],
  inputs: Partial<ThreeBarReversalPatternInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines' | 'linefills'> & {
  boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[]; linefills: LinefillData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { brpAC, brpSC, trendAC, trendSC, trendType, trendFilt, brpType, brpSR } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const closeS = new Series(bars, (b) => b.close);

  // Trend indicators - moving average cloud
  const movingAverage = (length: number): number[] => {
    switch (cfg.maType) {
      case 'SMA': return A(ta.sma(closeS, length));
      case 'EMA': return A(ta.ema(closeS, length));
      case 'HMA':
        if (length === 1) throw new Error("Invalid value of the 'length' argument (0.0) in the 'wma' function");
        return A(ta.hma(closeS, length));
      case 'RMA': return A(ta.rma(closeS, length));
      case 'WMA': return A(ta.wma(closeS, length));
      case 'VWMA': return A(ta.vwma(closeS, length, new Series(bars, (b) => b.volume ?? NaN)));
      default: return new Array<number>(n).fill(NaN);
    }
  };
  const maFast = movingAverage(cfg.maFLength);
  const maSlow = movingAverage(cfg.maSLength);

  // Trend indicators - Supertrend
  const [stS, dirS] = ta.supertrend(bars, cfg.factor, cfg.atrPeriod);
  const supertrend = A(stS);
  const direction = A(dirS);
  if (n > 0) supertrend[0] = NaN; // supertrend := barstate.isfirst ? na : supertrend

  // Trend indicators - Donchian channels
  const upper = A(ta.highest(closeS, cfg.length));
  const lower = A(ta.lowest(closeS, cfg.length));

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. An object held by a `var` variable of the script (the lines, the label and the box of the latest
  // pattern of each side) is never deleted by this limit, but it counts. A deleted object ignores later changes.
  const held = new Set<object>();
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (held.has(list[k])) k++;
      else list.splice(k, 1)[0].deleted = true;
    }
  };
  /** `variable := object`: the variable holds the new object and releases the one before */
  const hold = <T extends object>(before: T | null, now: T): T => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const boxes: Bx[] = [];
  const linefills: Lf[] = [];
  const newLine = (x1: number, x2: number, y: number, css: string): Ln => {
    const o = { x1, x2, y, color: css, deleted: false };
    lines.push(o);
    limit(lines);
    return o;
  };
  const newLabel = (l: Omit<Lb, 'deleted'>): Lb => {
    const o = { ...l, deleted: false };
    labels.push(o);
    limit(labels);
    return o;
  };
  const newBox = (b: Omit<Bx, 'deleted'>): Bx => {
    const o = { ...b, deleted: false };
    boxes.push(o);
    limit(boxes);
    return o;
  };

  /** One side: the bullish patterns (bull = true) or the bearish patterns */
  const side = (bull: boolean) => {
    const css = bull ? brpAC : brpSC;
    const lineCss = String(color.new(css, 53));
    const fillCss = String(color.new(css, 73));
    const textCss = String(color.new(css, 7));
    let lnA: Ln | null = null; // the line of the first bar (lnAT / lnSB)
    let lnB: Ln | null = null; // the line of the extreme of the last two bars (lnAB / lnST)
    let lnA2: Ln | null = null;
    let lnB2: Ln | null = null;
    let lb: Lb | null = null;
    let bx: Bx | null = null;
    let process = false;
    let process2 = false;
    let level = NaN; // bullHigh / bearLow
    let process1: boolean | null = null; // process[1] (na before the first bar)
    let process2Back: boolean | null = null; // process[2]

    return (i: number, pattern: boolean, opposite: boolean) => {
      const b = bars[i];
      const b1 = i >= 1 ? bars[i - 1] : null;
      const b2 = i >= 2 ? bars[i - 2] : null;
      const close1 = b1 ? b1.close : NaN;

      // beyond(x, y): x is on the confirmation side of y (above for a bullish pattern)
      const beyond = (x: number, y: number) => (bull ? gt(x, y) : lt(x, y));
      const against = (x: number, y: number) => (bull ? lt(x, y) : gt(x, y));

      if (pattern && b1 && b2) {
        const first = bull ? b2.high : b2.low;
        const enhanced = beyond(b.close, first);
        const normal = against(b.close, first);
        if (brpType === 'All' || (brpType === 'Enhanced' ? enhanced : brpType === 'Normal' ? normal : false)) {
          process = true;
          lb = hold(lb, newLabel({
            x: i, y: bull ? b.low : b.high, text: bull ? '▲' : '▼', textColor: textCss, up: bull,
            tooltip: (bull ? 'new bullish pattern detected' : 'new bearish pattern detected') + (enhanced ? ' (enchanced)' : ' (normal)'),
          }));
          const extreme = bull ? Math.min(b1.low, b.low) : Math.max(b1.high, b.high);
          // both sides create the line of the first bar, then the line of the extreme
          lnA = hold(lnA, newLine(i - 2, i, first, lineCss));
          lnB = hold(lnB, newLine(i - 1, i, extreme, lineCss));
          linefills.push({ line1: lnA, line2: lnB, color: fillCss });
          lnA2 = hold(lnA2, newLine(i - 2, i, first, lineCss));
          lnB2 = hold(lnB2, newLine(i - 1, i, extreme, lineCss));
          level = brpSR === 'Zone'
            ? (bull ? Math.max(b1.low, b.low) : Math.min(b1.high, b.high))
            : extreme;
        }
      }

      if (process) {
        const confirm = () => {
          if (!beyond(close1, lnA!.y)) return;
          if (process1 === true && process2Back !== null && process1 !== process2Back) {
            lb!.tooltip = bull
              ? 'enchanced pattern (confirmed at detection)\nprice activity above the pattern high'
              : 'enchanced pattern (confirmed at detection)\nprice activity below the pattern low';
          } else {
            lb!.tooltip = 'pattern confirmed ' + str.tostring(i - 1 - lb!.x) + ' bars later';
            newLabel({
              x: i - 1, y: bull ? b1!.low : b1!.high, text: '⦁', textColor: textCss, up: bull,
              tooltip: bull ? 'confirmation bar\nprice activity above the pattern high' : 'confirmation bar\nprice activity blow the pattern low',
            });
          }
          process = false;
          const border = String(color.new(css, brpSR === 'Zone' ? 73 : 53));
          bx = hold(bx, bull
            ? newBox({ left: i, top: level, right: i, bottom: lnB!.y, border, bg: fillCss })
            : newBox({ left: i, top: lnB!.y, right: i, bottom: level, border, bg: fillCss }));
          process2 = true;
        };
        const fail = () => {
          if (against(close1, lnB!.y) || opposite) {
            lb!.tooltip = bull ? 'pattern failed\nthe low of the pattern breached' : 'pattern failed\nthe high of the pattern breached';
            process = false;
          }
        };
        // the bullish side tests the confirmation first, the bearish side the failure first
        if (bull) {
          confirm();
          fail();
        } else {
          fail();
          confirm();
        }
        const x2 = process ? i : i - 1;
        if (!lnA2!.deleted) lnA2!.x2 = x2;
        if (!lnB2!.deleted) lnB2!.x2 = x2;
      }

      if (process2 && brpSR !== 'None') {
        // bxA.get_bottom() / bxS.get_top(): the box of the latest confirmed pattern
        const edge = bull ? bx!.bottom : bx!.top;
        if (!bx!.deleted) bx!.right = i;
        if (!beyond(b.close, edge)) process2 = false;
      }

      process2Back = process1;
      process1 = process;
    };
  };

  const bullSide = side(true);
  const bearSide = side(false);

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const plot3: typeof plot0 = [];
  const plot4: Array<{ time: number; value: number }> = [];
  const plot5: typeof plot0 = [];
  const plot6: typeof plot0 = [];
  const grad = () => ({ topValue: [] as number[], bottomValue: [] as number[], topColor: [] as Array<string | null>, bottomColor: [] as Array<string | null> });
  const g0 = grad();
  const g1 = grad();
  const g2 = grad();
  const g3 = grad();
  const upTrendCss = String(color.new(trendAC, 73));
  const downTrendCss = String(color.new(trendSC, 73));
  const upFill = String(color.new(trendAC, 81));
  const downFill = String(color.new(trendSC, 81));

  let os = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time;
    const fastAbove = gt(maFast[i], maSlow[i]);
    const maColor = fastAbove ? trendAC : trendSC;
    const cloud = trendType === 'Moving Average Cloud';
    plot0.push({ time, value: cloud ? maFast[i] : NaN, color: String(color.new(maColor, 81)) });
    plot1.push({ time, value: cloud ? maSlow[i] : NaN, color: String(color.new(maColor, 73)) });
    // math.max / math.min give na when one value is na
    const bothMa = !isNaN(maFast[i]) && !isNaN(maSlow[i]);
    g0.topValue.push(bothMa ? Math.max(maFast[i], maSlow[i]) : NaN);
    g0.bottomValue.push(bothMa ? Math.min(maFast[i], maSlow[i]) : NaN);
    g0.topColor.push(String(color.new(maColor, fastAbove ? 99 : 81)));
    g0.bottomColor.push(String(color.new(maColor, fastAbove ? 81 : 99)));

    const st = trendType === 'Supertrend';
    const up = direction[i] < 0;
    const mid = (b.open + b.close) / 2;
    plot2.push({ time, value: up && st ? supertrend[i] : NaN, color: upTrendCss });
    plot3.push({ time, value: !up && st ? supertrend[i] : NaN, color: downTrendCss });
    plot4.push({ time, value: i > 0 && st ? mid : NaN });
    g1.topValue.push(supertrend[i]);
    g1.bottomValue.push(mid);
    g1.topColor.push(upFill);
    g1.bottomColor.push('transparent');
    g2.topValue.push(mid);
    g2.bottomValue.push(supertrend[i]);
    g2.topColor.push('transparent');
    g2.bottomColor.push(downFill);

    // os := upper > upper[1] ? 1 : lower < lower[1] ? 0 : os
    if (i > 0 && gt(upper[i], upper[i - 1])) os = 1;
    else if (i > 0 && lt(lower[i], lower[i - 1])) os = 0;
    const dc = trendType === 'Donchian Channels';
    plot5.push({ time, value: dc ? upper[i] : NaN, color: os === 1 ? String(color.new(trendAC, 99)) : downTrendCss });
    plot6.push({ time, value: dc ? lower[i] : NaN, color: os === 1 ? upTrendCss : String(color.new(trendSC, 99)) });
    g3.topValue.push(upper[i]);
    g3.bottomValue.push(lower[i]);
    g3.topColor.push(os === 1 ? 'transparent' : downFill);
    g3.bottomColor.push(os === 0 ? 'transparent' : upFill);

    // Trend conditions
    let downTrend = true;
    let upTrend = true;
    const aligned = trendFilt === 'Aligned';
    if (cloud) {
      const below = lt(b.close, maFast[i]) && lt(maFast[i], maSlow[i]);
      const above = gt(b.close, maFast[i]) && gt(maFast[i], maSlow[i]);
      downTrend = aligned ? below : above;
      upTrend = aligned ? above : below;
    }
    if (st) {
      downTrend = aligned ? direction[i] > 0 : direction[i] < 0;
      upTrend = aligned ? direction[i] < 0 : direction[i] > 0;
    }
    if (dc) {
      downTrend = aligned ? os === 0 : os === 1;
      upTrend = aligned ? os === 1 : os === 0;
    }

    // 3-bar reversal pattern
    let bullishReversal = false;
    let bearishReversal = false;
    if (i >= 2) {
      const b1 = bars[i - 1];
      const b2 = bars[i - 2];
      bullishReversal = lt(b2.close, b2.open) && lt(b1.low, b2.low) && lt(b1.high, b2.high) && lt(b1.close, b1.open)
        && gt(b.close, b.open) && gt(b.high, b2.high) && upTrend;
      bearishReversal = gt(b2.close, b2.open) && gt(b1.high, b2.high) && gt(b1.low, b2.low) && gt(b1.close, b1.open)
        && lt(b.close, b.open) && lt(b.low, b2.low) && downTrend;
    }
    bullSide(i, bullishReversal, bearishReversal);
    bearSide(i, bearishReversal, bullishReversal);
  }

  const T = (index: number) => bars[index].time;
  const lineOut = (l: Ln): LineDrawingData => ({ time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5, plot6 },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', gradient: g0 },
      { plot1: 'plot4', plot2: 'plot2', gradient: g1 },
      { plot1: 'plot4', plot2: 'plot3', gradient: g2 },
      { plot1: 'plot5', plot2: 'plot6', gradient: g3 },
    ],
    lines: lines.map(lineOut),
    // a fill whose line was deleted by the object limit is not drawn
    linefills: linefills.filter((f) => !f.line1.deleted && !f.line2.deleted)
      .map((f) => ({ line1: lineOut(f.line1), line2: lineOut(f.line2), color: f.color })),
    labels: labels.map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor,
      style: l.up ? 'label_up' as const : 'label_down' as const, size: 'small' as const, tooltip: l.tooltip,
    })),
    boxes: boxes.map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, borderColor: b.border, bgColor: b.bg,
    })),
  };
}

export const ThreeBarReversalPattern = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
