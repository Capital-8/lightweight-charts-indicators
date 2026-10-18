/**
 * Pivot Trendlines with Breaks [HG]
 *
 * Trendlines between pivots, and their breaks.
 * - Pivots: pivot lows of the low and pivot highs of the high ("Pivot Length" bars on the right; the same number on
 *   the left with the "Normal" type, 1 bar with "Fast"), each kept until the next one (fixnan). "Override Source"
 *   takes both from the "Source" input.
 * - Lines: when a pivot low is above the pivot low before it (a pivot high below the one before), a solid line joins
 *   the two pivots, but only when no close (or source) of the bars from the new pivot to the current bar is on the
 *   other side of the line. A dotted trendline continues it with the same slope up to the current bar.
 * - Breaks: a close below the line of the lows (above the line of the highs) ends the trendline: the solid line is
 *   extended to the break, a copy of it stays on the chart, and a "Br" label marks the break at the line price (red
 *   label above for the lows, green label below for the highs). With "Repainting" off a break needs a closed bar.
 * - "Target Levels": a horizontal line at the latest pivot of each side from the bar of that pivot, with the same
 *   break rule (dashed by default).
 *
 * The lines come from the SimpleTrendlines library of the same author (functions new, drawLine and drawTrendline,
 * ported in this file). Each use of the library keeps two lines (a `var` line pair) and its own history; at most
 * 500 lines are kept (drawing registry of oakscriptjs). Alerts (alertcondition, `alerts` of the result):
 * 'Bearish Breakout' / 'Bullish Breakout', true on the bar of each break of the lows / highs trendline.
 *
 * Reference: "Pivot Trendlines with Breaks [HG]" by HoanGhetti
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © HoanGhetti
 */

import {
  ta, line, Series, getSourceSeries, resetDrawings, setDrawingBar, varDrawing,
  type Bar, type IndicatorResult, type InputConfig, type Line, type PlotConfig, type SourceType,
} from 'oakscriptjs';
import type { LineDrawingData, MarkerData } from '../types';
import { barTime } from '../bar-time';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PivotTrendlinesWithBreaksInputs {
  /** Bars on the right of a pivot (and on the left with the "Normal" type) */
  len: number;
  pivotType: 'Normal' | 'Fast';
  repaint: boolean;
  targets: boolean;
  bearC: string;
  bullC: string;
  /** Pine extend constants: none, right, left, both */
  extend: 'n' | 'r' | 'l' | 'b';
  /** Pine line style constants: dotted, dashed, solid */
  style: 'dot' | 'dsh' | 'sol';
  tstyle: 'dot' | 'dsh' | 'sol';
  override: boolean;
  useSrc: boolean;
  source: SourceType;
}

export const defaultInputs: PivotTrendlinesWithBreaksInputs = {
  len: 20,
  pivotType: 'Normal',
  repaint: true,
  targets: false,
  bearC: '#FF5252',
  bullC: '#4CAF50',
  extend: 'n',
  style: 'dot',
  tstyle: 'dsh',
  override: false,
  useSrc: true,
  source: 'low',
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Pivot Length', defval: 20, min: 1 },
  {
    id: 'pivotType', type: 'string', title: 'Pivot Type', defval: 'Normal', options: ['Normal', 'Fast'],
    tooltip: "Normal: Uses Pine's built-in pivot system.\n\nFast: Uses a custom pivot system that tracks every reversal.",
  },
  {
    id: 'repaint', type: 'bool', title: 'Repainting', defval: true,
    tooltip: 'If disabled, it will wait for bar confirmation to avoid printing false alerts.',
  },
  { id: 'targets', type: 'bool', title: 'Target Levels', defval: false },
  { id: 'bearC', type: 'color', title: 'Bear Breakout', defval: '#FF5252', group: 'Styling' },
  { id: 'bullC', type: 'color', title: 'Bull Breakout', defval: '#4CAF50', group: 'Styling' },
  { id: 'extend', type: 'string', title: 'Extend', defval: 'n', options: ['n', 'r', 'l', 'b'], group: 'Styling' },
  { id: 'style', type: 'string', title: 'Trendline Style', defval: 'dot', options: ['dot', 'dsh', 'sol'], group: 'Styling' },
  { id: 'tstyle', type: 'string', title: 'Target Style', defval: 'dsh', options: ['dot', 'dsh', 'sol'], group: 'Styling' },
  {
    id: 'override', type: 'bool', title: 'Override Source', defval: false, group: 'Override',
    tooltip: 'Overriding the source will allow the script to create trendlines on any specified source.',
  },
  {
    id: 'useSrc', type: 'bool', title: 'Use Source for Cross Detection', defval: true, group: 'Override',
    tooltip: 'Instead of checking if the close value crossed trendline, check for the specified source.',
  },
  { id: 'source', type: 'source', title: 'Source', defval: 'low', group: 'Override' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Pivot Trendlines with Breaks [HG]',
  shortTitle: 'Pivot Trendlines with Breaks [HG]',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;

/** Pine float comparisons: a == b within 1e-10, a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !lt(a, b);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !gt(a, b);
/** A float used as a condition (v5): na and 0 are false */
const truthy = (x: number) => !Number.isNaN(x) && x !== 0;

const STYLE = { dot: 'dotted', dsh: 'dashed', sol: 'solid' } as const;
const EXTEND = { n: 'none', r: 'right', l: 'left', b: 'both' } as const;

/** ta.change(x) of one call site: x - x[1] (x[1] = the value of the bar before) */
class Change {
  private prev = NaN;
  next(x: number): number {
    const d = x - this.prev;
    this.prev = x;
    return d;
  }
}

/** ta.barssince(cond) of one call site */
class BarsSince {
  private last = NaN;
  next(i: number, cond: boolean): number {
    if (cond) this.last = i;
    return i - this.last;
  }
}

/** One use of the library: its `var` line pair and the history of its drawLine() call */
class Trendline {
  readonly start = varDrawing<Line>();
  readonly trend = varDrawing<Line>();
  savedSlope = NaN;
  savedY1 = NaN;
  savedY2 = NaN;
  readonly y1Change = new Change();
  readonly y1Since = new BarsSince();

  constructor() {
    // var line l1 = line.new(na, na, na, na), var line l2 = line.new(na, na, na, na)
    this.start.value = line.new(NaN, NaN, NaN, NaN);
    this.trend.value = line.new(NaN, NaN, NaN, NaN);
  }

  get startline(): Line { return this.start.value as Line; }
  get trendline(): Line { return this.trend.value as Line; }
}

/** The Trendline object of a bar: settings and values (new on every bar), with the lines of its use */
interface TrendlineBar {
  tl: Trendline;
  xAxis: number;
  offset: number;
  strictMode: boolean | null;
  strictType: number;
  slope: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  changeInX: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<PivotTrendlinesWithBreaksInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.len);
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : (v as number)));
  const close = bars.map((b) => b.close);
  const source = A(getSourceSeries(bars, cfg.source));
  const sourceOr = (k: 'low' | 'high') => (cfg.override ? source : bars.map((b) => b[k]));
  // src of drawLine(): input_override ? input_source : na
  const strictSrc = cfg.override ? source : null;
  // the value compared with the trendline in breakout()
  const crossSrc = cfg.override && cfg.useSrc ? source : close;
  const left = cfg.pivotType === 'Normal' ? len : 1;

  const fixnan = (v: number[]) => {
    let last = NaN;
    return v.map((x) => (Number.isNaN(x) ? last : (last = x)));
  };
  const pl = fixnan(A(ta.pivotlow(Series.fromArray(bars, sourceOr('low')), left, len)));
  const ph = fixnan(A(ta.pivothigh(Series.fromArray(bars, sourceOr('high')), left, len)));

  resetDrawings({ line: MAX_LINES });
  const trendStyle = STYLE[cfg.style];
  const targetStyle = STYLE[cfg.tstyle];
  const extend = EXTEND[cfg.extend];

  /** tl.new(): the Trendline of the bar; the library checks of its arguments */
  const newTrendline = (
    tl: Trendline, i: number, xAxis: number, offset: number, strictMode: boolean | null, strictType: number,
  ): TrendlineBar => {
    if (gt(strictType, 1) || lt(strictType, 0)) throw new Error('strictType must be a value of 0 or 1.');
    if (gt(strictType, 0) && strictMode !== true) {
      throw new Error("strictType can't have an assigned value without strictMode being true.");
    }
    if (strictMode === true && offset < 1) throw new Error('Offset must be over 0 in order to use strictMode.');
    return {
      tl, xAxis, offset, strictMode, strictType, slope: NaN,
      x1: i - (xAxis + offset), x2: i - offset, y1: NaN, y2: NaN, changeInX: NaN,
    };
  };

  /** method drawLine(this, condition, y1, y2, src) */
  const drawLine = (t: TrendlineBar, i: number, condition: boolean, y1: number, y2: number, src: number[] | null) => {
    const { tl } = t;
    const setStart = () => {
      line.set_xy1(tl.startline, t.x1, y1);
      line.set_xy2(tl.startline, t.x2, y2);
      tl.savedSlope = (line.get_y2(tl.startline) - line.get_y1(tl.startline)) / t.xAxis;
      tl.savedY1 = line.get_y1(tl.startline);
      tl.savedY2 = line.get_y2(tl.startline);
    };
    if (condition && t.strictMode !== true) setStart();
    if (condition && t.strictMode === true) {
      t.slope = (y2 - y1) / t.xAxis;
      let valid = false;
      // na(src) reads the current value of the source
      const useClose = src === null || Number.isNaN(src[i]);
      for (let k = 0; k <= t.offset; k++) {
        const j = t.offset - k;
        const v = i - j >= 0 ? (useClose ? close[i - j] : (src as number[])[i - j]) : NaN;
        const level = y2 + t.slope * k;
        if (t.strictType === 0 ? ge(v, level) : le(v, level)) {
          valid = true;
        } else {
          valid = false;
          break;
        }
      }
      if (valid) setStart();
    }
    t.slope = tl.savedSlope;
    t.y1 = tl.savedY1;
    t.y2 = tl.savedY2;
    t.changeInX = tl.y1Since.next(i, truthy(tl.y1Change.next(line.get_y1(tl.startline)))) + t.offset;
  };

  /** method drawTrendline(this, condition) */
  const drawTrendline = (t: TrendlineBar, i: number, condition: boolean) => {
    if (!condition) return;
    const { startline, trendline } = t.tl;
    line.set_xy1(trendline, line.get_x2(startline), line.get_y2(startline));
    line.set_xy2(trendline, i, line.get_y2(startline) + t.slope * t.changeInX);
  };

  // One use of pivot() / breakout() per call of the script: its own history
  interface PivotSite { tl: Trendline; change: Change; changes: Array<{ bar: number; pivot: number }> }
  const pivotSite = (): PivotSite => ({ tl: new Trendline(), change: new Change(), changes: [] });
  interface BreakoutSite { hasCrossed: boolean; y1Change: Change }
  const breakoutSite = (): BreakoutSite => ({ hasCrossed: false, y1Change: new Change() });

  /** pivot(pType) */
  const pivot = (site: PivotSite, i: number, pType: number): TrendlineBar => {
    const isPl = eq(pType, pl[i]);
    const p = isPl ? pl[i] : ph[i];
    const changed = truthy(site.change.next(p));
    if (changed) site.changes.unshift({ bar: i, pivot: p });
    const at = (k: number) => site.changes[k];
    const xAxis = at(0) && at(1) ? at(0).bar - at(1).bar : NaN;
    const prevPivot = at(1) ? at(1).pivot : NaN;
    const pivotCond = changed && (isPl ? gt(p, prevPivot) : lt(p, prevPivot));
    const data = newTrendline(site.tl, i, xAxis, len, true, isPl ? 0 : 1);
    drawLine(data, i, pivotCond, prevPivot, p, strictSrc);
    return data;
  };

  /** breakout(this, pType) */
  const breakout = (site: BreakoutSite, t: TrendlineBar, i: number, pType: number): boolean => {
    const { startline, trendline } = t.tl;
    if (truthy(site.y1Change.next(line.get_y1(startline)))) site.hasCrossed = false;
    drawTrendline(t, i, !site.hasCrossed);
    const confirmed = i < n - 1 || lastBarConfirmedOf(chart);
    const confirmation = !site.hasCrossed && (cfg.repaint ? !site.hasCrossed : confirmed);
    const y2 = line.get_y2(trendline);
    const crossed = eq(pType, pl[i]) ? lt(crossSrc[i], y2) : gt(crossSrc[i], y2);
    if (crossed && confirmation) {
      site.hasCrossed = true;
      line.set_xy2(startline, line.get_x2(trendline), line.get_y2(trendline));
      line.set_xy2(trendline, NaN, NaN);
      line.copy(startline);
    }
    return site.hasCrossed;
  };

  const style = (t: TrendlineBar, col: string) => {
    const { startline, trendline } = t.tl;
    line.set_color(startline, col);
    line.set_color(trendline, col);
    line.set_width(startline, 2);
    line.set_width(trendline, 2);
    line.set_style(trendline, trendStyle);
    line.set_extend(trendline, extend);
  };
  const targetStyleOf = (t: TrendlineBar, col: string) => {
    const { startline, trendline } = t.tl;
    line.set_style(startline, targetStyle);
    line.set_style(trendline, targetStyle);
    line.set_color(startline, col);
    line.set_color(trendline, col);
  };

  const markers: MarkerData[] = [];
  const bearFlags: boolean[] = [], bullFlags: boolean[] = [];
  try {
    setDrawingBar(0, n === 1);
    // creation order of the `var` lines on the first bar: pivot(pl), pivot(ph), then the two target levels
    const plSite = pivotSite();
    const phSite = pivotSite();
    const phTarget = new Trendline();
    const plTarget = new Trendline();
    const cuSite = breakoutSite();
    const coSite = breakoutSite();
    const phTargetBreak = breakoutSite();
    const plTargetBreak = breakoutSite();
    let cuPrev = false;
    let coPrev = false;
    const phY1Change = new Change();
    const plY1Change = new Change();

    for (let i = 0; i < n; i++) {
      setDrawingBar(i, i === n - 1);
      const plData = pivot(plSite, i, pl[i]);
      const phData = pivot(phSite, i, ph[i]);
      style(plData, cfg.bearC);
      style(phData, cfg.bullC);

      const cu = breakout(cuSite, plData, i, pl[i]);
      const co = breakout(coSite, phData, i, ph[i]);
      const time = bars[i].time as number;
      // alertcondition(ta.change(cu) and cu, 'Bearish Breakout') / alertcondition(ta.change(co) and co, 'Bullish Breakout')
      bearFlags.push(cu && !cuPrev);
      bullFlags.push(co && !coPrev);
      // plotshape(ta.change(cu) and cu ? startline.get_y2() : na, location.absolute)
      if (cu && !cuPrev) {
        const price = line.get_y2(plData.tl.startline);
        if (!Number.isNaN(price)) {
          markers.push({
            time, position: 'atPriceTop', price, shape: 'labelDown', color: cfg.bearC, text: 'Br', textColor: '#FFFFFF',
          });
        }
      }
      if (co && !coPrev) {
        const price = line.get_y2(phData.tl.startline);
        if (!Number.isNaN(price)) {
          markers.push({
            time, position: 'atPriceBottom', price, shape: 'labelUp', color: cfg.bullC, text: 'Br', textColor: '#FFFFFF',
          });
        }
      }
      cuPrev = cu;
      coPrev = co;

      // Target levels: tl.new(changeInX) (offset 0, no strict mode), a flat line at the latest pivot
      const phTargetData = newTrendline(phTarget, i, phData.changeInX, 0, null, NaN);
      const plTargetData = newTrendline(plTarget, i, plData.changeInX, 0, null, NaN);
      const phNew = truthy(phY1Change.next(phData.y1));
      const plNew = truthy(plY1Change.next(plData.y1));
      drawLine(phTargetData, i, phNew && cfg.targets, phData.y2, phData.y2, null);
      drawLine(plTargetData, i, plNew && cfg.targets, plData.y2, plData.y2, null);
      targetStyleOf(plTargetData, cfg.bearC);
      targetStyleOf(phTargetData, cfg.bullC);
      breakout(phTargetBreak, phTargetData, i, ph[i]);
      breakout(plTargetBreak, plTargetData, i, pl[i]);
    }
  } finally {
    setDrawingBar(null);
  }

  // xloc.bar_index lines; a line with an na coordinate is not drawn
  const T = (x: number) => barTime(bars, x);
  const lines: LineDrawingData[] = line.all()
    .filter((l) => [l.x1, l.y1, l.x2, l.y2].every((v) => !Number.isNaN(v)))
    .map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color),
      width: l.width,
      ...(l.style && l.style !== 'solid' ? { style: l.style as LineDrawingData['style'] } : {}),
      ...(l.extend && l.extend !== 'none' ? { extend: l.extend as LineDrawingData['extend'] } : {}),
    }));
  resetDrawings();

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    lines,
    alerts: alertStates(alertConditions, bars, [bearFlags, bullFlags]),
  };
}

/** The original's alertconditions (no message: the default one) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bearish Breakout', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Bullish Breakout', message: 'Alert Fired!' },
];

export const PivotTrendlinesWithBreaks = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
