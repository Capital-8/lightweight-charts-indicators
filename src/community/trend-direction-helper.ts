/**
 * Trend Direction Helper (ZigZag and S/R and HH/LL labels)
 *
 * Four tools on the price chart:
 * - Trend direction labels: `value2` = 100 - |Williams %R| over `abs(Risk / 180) + 1` bars (1 bar with the default
 *   Risk). A bar is in the upper zone when value2 > 60 + Risk and in the lower zone when value2 < 20 - Risk. A buy
 *   label is drawn below a bar in the upper zone when the newest of the 50 bars before it that is in a zone is in
 *   the lower zone; a sell label above a bar in the lower zone when that bar is in the upper zone.
 * - Supports and resistances: the last "quick" pivot high / low (Left Pivot bars before, Quick Right Pivot bars
 *   after) and the last three pivot highs / lows (Left Pivot bars before, Right Pivot bars after), each green when
 *   the close is at or above it, else red. The original draws each of them on the last bar only (show_last = 1),
 *   and so does the port: every other bar has no value.
 * - HH / LH / HL / LL markers (off by default): a Bill Williams fractal top (bottom) that is above (below) the two
 *   fractal tops (bottoms) before it, drawn 2 bars back on the fractal bar.
 * - Zig zag lines (percent reversal): while the direction is up the highest high is tracked and a close below it by
 *   more than `percent` of the last pivot price makes it a pivot and turns the direction down (and the same with
 *   lows in the other direction). A new pivot above (below) the two pivots before it is pushed in front of a list
 *   of 11 points when the first point of the list is below (above) the second one, else it replaces the first
 *   point; a pivot between them is ignored. The newest 8 segments of the list are drawn; a point has the time of
 *   the bar that confirmed the pivot.
 *
 * Notes:
 * - The label price of the original (low / high moved by an average range) is na on every bar (the average range is
 *   read on the first bar, where it is na); the labels are placed below / above the bar, so the price is not used.
 * - Risk must be between 5 and 10005: outside it the original stops with a runtime error on the first bar (its
 *   average range reads a negative history index below 5, and more than 10000 bars back above 10005); the port
 *   throws an Error with the same message. Labels need a Risk below 40 (buy) / below 20 (sell).
 * - At most 50 labels stay, as in the original (default label limit, drawing registry of the library: the labels of
 *   the two `var` variables are not deleted by the limit).
 * - The plots have `trackprice = true` in the original (a horizontal line at the last value): PlotConfig has no
 *   such field, so that line is not described here.
 * - The input "== TREND DIRECTION ==" is a title in the original: it does nothing.
 *
 * Reference: "Trend Direction Helper" by Daveatt (zig zag by Ricardo Santos, pivot levels from Backtest Rookies)
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, label, resetDrawings, setDrawingBar, varDrawing, type IndicatorResult, type InputConfig, type PlotConfig,
  type Bar, type Label,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, MarkerData, PineSize } from '../types';

export interface TrendDirectionHelperInputs {
  /** == TREND DIRECTION == (a title in the original; no effect) */
  td: boolean;
  /** Risk */
  risk: number;
  /** Label size */
  size: 'tiny' | 'normal' | 'large' | 'huge';
  /** TEXT Buy */
  textUp: string;
  /** TEXT Sell */
  textDn: string;
  /** Show Supports & Resistances */
  showSR: boolean;
  /** Left Pivot */
  left: number;
  /** Right Pivot */
  right: number;
  /** Quick Right Pivot */
  quickRight: number;
  /** Show Higher/Highs and Lower Lows labels */
  showHHLL: boolean;
  /** Show ZIG ZAG Lines */
  showZZ: boolean;
  /** Percent of last pivot price for zigzag reversal */
  percent: number;
}

export const defaultInputs: TrendDirectionHelperInputs = {
  td: true,
  risk: 14,
  size: 'normal',
  textUp: 'B',
  textDn: 'S',
  showSR: true,
  left: 50,
  right: 25,
  quickRight: 5,
  showHHLL: false,
  showZZ: true,
  percent: 1.75,
};

export const inputConfig: InputConfig[] = [
  { id: 'td', type: 'bool', title: '== TREND DIRECTION ==', defval: true },
  { id: 'risk', type: 'int', title: 'Risk', defval: 14 },
  { id: 'size', type: 'string', title: 'Size', defval: 'normal', options: ['tiny', 'normal', 'large', 'huge'] },
  { id: 'textUp', type: 'string', title: 'TEXT Buy', defval: 'B' },
  { id: 'textDn', type: 'string', title: 'TEXT Sell', defval: 'S' },
  { id: 'showSR', type: 'bool', title: 'Show Supports & Resistances', defval: true },
  { id: 'left', type: 'int', title: 'Left Pivot', defval: 50 },
  { id: 'right', type: 'int', title: 'Right Pivot', defval: 25 },
  { id: 'quickRight', type: 'int', title: 'Quick Right Pivot', defval: 5 },
  { id: 'showHHLL', type: 'bool', title: 'Show Higher/Highs and Lower Lows labels', defval: false },
  { id: 'showZZ', type: 'bool', title: 'Show ZIG ZAG Lines', defval: true },
  { id: 'percent', type: 'float', title: 'Percent of last pivot price for zigzag reversal:', defval: 1.75, min: 0.0, max: 99.0, step: 0.25 },
];

// Colours of the script version (v4)
const GREEN = '#4CAF50';
const RED = '#FF5252';
const MAROON = '#880E4F';
/** color.blue of the script version (v4): the default plot colour and the default text colour of plotshape */
const PLOT_BLUE = '#2196F3';
/** color.new(color.aqua, 20), color.new(color.red, 20), color.new(color.maroon, 20), color.new(color.black, 20) */
const LABEL_UP = 'rgba(0, 188, 212, 0.8)';
const LABEL_DN = 'rgba(255, 82, 82, 0.8)';
const TEXT_UP = 'rgba(136, 14, 79, 0.8)';
const TEXT_DN = 'rgba(54, 58, 69, 0.8)';
/** Zig zag line colours: #6d8b0d90 (the first point above the second one), #bb704590 */
const ZZ_COL1 = '#6d8b0d90';
const ZZ_COL2 = '#bb704590';
const ZZ_WIDTH = 5;
/** Default label limit (max_labels_count) */
const MAX_LABELS = 50;
/** Points of the zig zag list (__x_A00 .. __x_A10) */
const ZZ_POINTS = 11;

const level = (id: string, title: string): PlotConfig => ({ id, title, color: PLOT_BLUE, lineWidth: 2, style: 'circles' });

export const plotConfig: PlotConfig[] = [
  level('plot0', 'Quick Pivot High'),
  level('plot1', 'Quick Pivot Low'),
  level('plot2', 'Pivot High'),
  level('plot3', 'Pivot Low'),
  level('plot4', 'Pivot High 2'),
  level('plot5', 'Pivot Low 2'),
  level('plot6', 'Pivot High 3'),
  level('plot7', 'Pivot Low 3'),
];

export const metadata = {
  title: 'Trend Direction Helper',
  shortTitle: 'TDH',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
/** A float used as a condition: na and 0 are false */
const truthy = (v: number) => !Number.isNaN(v) && Math.abs(v) > EPS;

interface LabelObj {
  bar: number;
  /** Text, colours and style of a buy label (`up` is not 0 on the bar) */
  up: boolean;
  /** Placed above the bar (the label of `dn`), else below it */
  above: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendDirectionHelperInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  // var AVG_RANGE = range(RISK) reads close[i] and open[i] for i = 1 to RISK - 5 on the first bar: the loop counts
  // down to a negative index when Risk is below 5, and passes the history limit of 10000 bars above 10005
  if (n > 0 && cfg.risk < 5) {
    throw new Error(
      'Error on bar 0: The script attempts to reference historical data that is too far from the current bar (-1 bars back). '
      + 'The history-referencing length for the expression must be a value between 0 and 10000.',
    );
  }
  if (n > 0 && cfg.risk > 10005) {
    throw new Error(
      'Error on bar 0: Invalid number of bars back specified in the history-referencing operator. '
      + 'It accepts a value between 0 and 10000.',
    );
  }

  // ----- Trend direction: TS(RISK)
  // value10 = abs(RISK / 180) + 1 is the length of highest() / lowest() in wpr() (the library truncates a fraction)
  const wprLength = Math.abs(cfg.risk / 180) + 1;
  const x1 = 60 + cfg.risk;
  const x2 = 20 - cfg.risk;
  const upper = A(ta.highest(S(high), wprLength));
  const lower = A(ta.lowest(S(low), wprLength));
  // value2 = 100 - abs(wpr(value10)), wpr = 100 * (close - upper) / (upper - lower)
  const value2 = bars.map((b, i) => 100 - Math.abs((100 * (b.close - upper[i])) / (upper[i] - lower[i])));

  // Labels: library objects in the drawing registry (a creation that brings the count above max + 5 deletes the
  // oldest until max remain; the labels of the `var` variables TS_UP_Label / TS_DN_Label are not deleted, but count)
  resetDrawings({ label: MAX_LABELS });
  const upLabel = varDrawing<Label>();
  const dnLabel = varDrawing<Label>();
  const labelInfo = new Map<object, LabelObj>();
  const newLabel = (bar: number, up: boolean, above: boolean): Label => {
    const obj = label.new(bar, NaN, up ? cfg.textUp : cfg.textDn, 'bar_index', above ? 'abovebar' : 'belowbar');
    labelInfo.set(obj, { bar, up, above });
    return obj;
  };

  // ----- Supports and resistances
  const cond = (pivot: Series) => S(A(pivot).map((v) => (truthy(v) ? 1 : 0)));
  const back = (a: number[], k: number) => S(a.map((_v, i) => at(a, i - k)));
  const pivotHigh = cond(ta.pivothigh(S(high), cfg.left, cfg.right));
  const pivotLow = cond(ta.pivotlow(S(low), cfg.left, cfg.right));
  const quickPivotHigh = cond(ta.pivothigh(S(high), cfg.left, cfg.quickRight));
  const quickPivotLow = cond(ta.pivotlow(S(low), cfg.left, cfg.quickRight));
  const highRight = back(high, cfg.right);
  const lowRight = back(low, cfg.right);
  const levels = [
    A(ta.valuewhen(quickPivotHigh, back(high, cfg.quickRight), 0)),
    A(ta.valuewhen(quickPivotLow, back(low, cfg.quickRight), 0)),
    A(ta.valuewhen(pivotHigh, highRight, 0)),
    A(ta.valuewhen(pivotLow, lowRight, 0)),
    A(ta.valuewhen(pivotHigh, highRight, 1)),
    A(ta.valuewhen(pivotLow, lowRight, 1)),
    A(ta.valuewhen(pivotHigh, highRight, 2)),
    A(ta.valuewhen(pivotLow, lowRight, 2)),
  ];

  // ----- HH / LL: the highs / lows of the Bill Williams fractals, newest last
  const topHighs: number[] = [];
  const botLows: number[] = [];
  const markers: MarkerData[] = [];

  // ----- Zig zag: f_zz(percent) state and the list of points (index 0 = newest)
  const percent = cfg.percent / 100;
  let pivot = NaN;
  let isDirectionUp: boolean | null = null;
  let htrack = NaN;
  let ltrack = NaN;
  const xs: number[] = new Array(ZZ_POINTS).fill(NaN);
  const ys: number[] = new Array(ZZ_POINTS).fill(NaN);
  /** zz of the bars where the comparisons of f_y(0), f_y(1), f_y(2) ran: valuewhen() keeps the history of these bars only */
  const compared: number[] = [];

  try {
    for (let i = 0; i < n; i++) {
      const bar = bars[i];
      setDrawingBar(i, i === n - 1);

      // ----- Trend direction labels
      // for i1 = 1 to 50: the newest bar before this one with value2 in a zone (ii1 stays 1 without one)
      let ii1 = 1;
      for (let k = 1; k <= 50; k++) {
        const v = at(value2, i - k);
        if (gt(x2, v) || gt(v, x1)) {
          ii1 = k;
          break;
        }
      }
      const ref = at(value2, i - ii1);
      const dn = gt(x2, value2[i]) && gt(ref, x1) ? ii1 : 0;
      const up = gt(value2[i], x1) && gt(x2, ref) ? ii1 : 0;
      // label.new(x = bar_index - barssince(up), ...): barssince is 0 on the bar of the signal. Text, colours and
      // style of both labels follow `up` (text_label = up ? text_up : text_dn ...); with a Risk below -20 the two
      // zones overlap and a bar can have both labels.
      if (up !== 0) upLabel.value = newLabel(i, true, false);
      if (dn !== 0) dnLabel.value = newLabel(i, up !== 0, true);

      // ----- HH / LL markers, drawn with offset = -2
      if (i >= 4) {
        const top = gt(high[i - 2], high[i - 4]) && ge(high[i - 2], high[i - 3]) && ge(high[i - 2], high[i - 1]) && gt(high[i - 2], high[i]);
        const bot = gt(low[i - 4], low[i - 2]) && ge(low[i - 3], low[i - 2]) && le(low[i - 2], low[i - 1]) && gt(low[i], low[i - 2]);
        const time = bars[i - 2].time;
        if (top) {
          // valuewhen(filteredtopf, high[2], 0 / 1 / 2)
          topHighs.push(high[i - 2]);
          const [v2, v1, v0] = [at(topHighs, topHighs.length - 3), at(topHighs, topHighs.length - 2), high[i - 2]];
          const higherHigh = gt(v0, v1) && gt(v0, v2);
          const lowerHigh = gt(v1, v0) && gt(v2, v0);
          if (cfg.showHHLL && higherHigh) markers.push({ time, position: 'aboveBar', shape: 'square', color: MAROON, text: '[HH]', textColor: PLOT_BLUE });
          if (cfg.showHHLL && lowerHigh) markers.push({ time, position: 'aboveBar', shape: 'square', color: MAROON, text: '[LH]', textColor: PLOT_BLUE });
        }
        if (bot) {
          botLows.push(low[i - 2]);
          const [v2, v1, v0] = [at(botLows, botLows.length - 3), at(botLows, botLows.length - 2), low[i - 2]];
          const higherLow = gt(v0, v1) && gt(v0, v2);
          const lowerLow = gt(v1, v0) && gt(v2, v0);
          if (cfg.showHHLL && higherLow) markers.push({ time, position: 'belowBar', shape: 'square', color: GREEN, text: '[HL]', textColor: PLOT_BLUE });
          if (cfg.showHHLL && lowerLow) markers.push({ time, position: 'belowBar', shape: 'square', color: GREEN, text: '[LL]', textColor: PLOT_BLUE });
        }
      }

      // ----- Zig zag: f_zz(percent)
      const prevPivot = pivot;
      const prevHtrack = htrack;
      const prevLtrack = ltrack;
      if (i >= 1) {
        const reverseRange = (Number.isNaN(prevPivot) ? 0 : prevPivot) * percent;
        if (isDirectionUp === null) isDirectionUp = true;
        if (isDirectionUp) {
          htrack = Math.max(Math.max(bar.high, high[i - 1]), Number.isNaN(prevHtrack) ? bar.high : prevHtrack);
          ltrack = NaN;
          if (gt(prevHtrack - reverseRange, bar.close)) {
            pivot = htrack;
            isDirectionUp = false;
          }
        }
        if (!isDirectionUp) {
          ltrack = Math.min(Math.min(bar.low, low[i - 1]), Number.isNaN(prevLtrack) ? bar.low : prevLtrack);
          htrack = NaN;
          if (gt(bar.close, prevLtrack + reverseRange)) {
            pivot = ltrack;
            isDirectionUp = true;
          }
        }
      }
      // zz = change(pivot) != 0 ? pivot : na
      const zz = truthy(pivot - prevPivot) ? pivot : NaN;

      let mode: 'push' | 'replace' | null = null;
      if (truthy(zz)) {
        if (Number.isNaN(ys[1])) {
          mode = 'push';
        } else {
          compared.push(zz);
          const f1 = at(compared, compared.length - 2);
          const f2 = at(compared, compared.length - 3);
          // a pivot above the two before it
          if (gt(zz, f1) && gt(zz, f2)) mode = gt(ys[1], ys[0]) ? 'push' : 'replace';
          // a pivot below the two before it
          if (gt(f1, zz) && gt(f2, zz)) mode = gt(ys[0], ys[1]) ? 'push' : 'replace';
        }
      }
      if (mode === 'push') {
        xs.unshift(bar.time);
        ys.unshift(zz);
        xs.length = ZZ_POINTS;
        ys.length = ZZ_POINTS;
      } else if (mode === 'replace') {
        xs[0] = bar.time;
        ys[0] = zz;
      }
    }
  } finally {
    setDrawingBar(null);
  }

  // The 8 lines are made again on every bar: the lines of the last bar stay. A line with an na point is not drawn.
  const lines: LineDrawingData[] = [];
  if (cfg.showZZ && n > 0) {
    for (let k = 0; k < 8; k++) {
      if (Number.isNaN(ys[k]) || Number.isNaN(ys[k + 1])) continue;
      lines.push({
        time1: xs[k], price1: ys[k], time2: xs[k + 1], price2: ys[k + 1],
        color: gt(ys[k], ys[k + 1]) ? ZZ_COL1 : ZZ_COL2, width: ZZ_WIDTH, style: 'solid',
      });
    }
  }

  const size: PineSize = cfg.size;
  const labels: LabelData[] = label.all().map((obj) => labelInfo.get(obj)!).map((l) => ({
    time: bars[l.bar].time, price: NaN, yloc: l.above ? 'abovebar' : 'belowbar', text: l.up ? cfg.textUp : cfg.textDn,
    color: l.up ? LABEL_UP : LABEL_DN, textColor: l.up ? TEXT_UP : TEXT_DN, style: l.up ? 'label_up' : 'label_down', size,
  }));
  resetDrawings();

  // plot(showSR ? level : na, style = plot.style_circles, color = close >= level ? green : red, show_last = 1)
  const plots: Record<string, Array<{ time: number; value: number; color?: string }>> = {};
  levels.forEach((lv, k) => {
    plots[`plot${k}`] = bars.map((b, i) => (i === n - 1 && cfg.showSR && Number.isFinite(lv[i])
      ? { time: b.time, value: lv[i], color: ge(b.close, lv[i]) ? GREEN : RED }
      : { time: b.time, value: NaN }));
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    labels,
    lines,
  };
}

export const TrendDirectionHelper = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
