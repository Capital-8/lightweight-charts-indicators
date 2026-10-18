/**
 * Trendlines - JD
 *
 * Trendlines through the pivot points of the price.
 * - Pivots: a pivot high (of the highs, or of the candle bodies) with "length" bars on the left and half of it on
 *   the right; the same for pivot lows. The script keeps the last 42 pivots of each side with their time, price and
 *   the slope (price per ms) from the pivot before.
 * - Lines: when a pivot is confirmed, a solid line runs from the pivot before, through the new pivot, to half the
 *   length after it (the bar of the confirmation for an even length), and a dotted line continues on the same slope ("limit extensions" x 100 bars after the pivot,
 *   or without end when the value is 0). The lines are placed by time; a bar is the time between the confirmation
 *   bar and the bar before it. A line of the highs is drawn when the highs fall, a line of the lows when the highs
 *   do not fall (the original tests the slope of the highs for both); the other ones only when the first display
 *   option is off. At most 50 lines are kept (drawing registry of the library).
 * - Breaks: the close is compared with the last lines (the "number of past trendlines to check" + 1 latest pivots
 *   of each side, each with its own slope). A close that crosses over a line of the highs gives a triangle below
 *   the bar and a lime bar; a close that crosses over a line of the lows gives a triangle above the bar and a
 *   fuchsia bar. The comparison uses the close of the bar before on which the same side was tested.
 * - Plots: the pivot highs and pivot lows, on the bar of the pivot.
 * - Alerts (alertcondition, `alerts` of the result, whatever "show trendline breaks"): 'trendline break' (either
 *   break), 'trendline break up' (cross over a line of the highs) and 'trendline break down' (over a line of the lows).
 *
 * "limit number of trendlines shown": the original reads the line that was current a number of bars ago, the number
 * of bars since an older pivot. While fewer pivots than that exist, the number is the bar time divided by the bar
 * length, and the original stops with an error when it is above 5000: the port throws the same error.
 *
 * Reference: "Trendlines - JD" by Duyck
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Copyright 2019 to present, Joris Duyck (JD)
 */

import {
  ta, math, line, Series, resetDrawings, setDrawingBar, varDrawing, type IndicatorResult, type InputConfig, type PlotConfig,
  type Bar, type Line,
} from 'oakscriptjs';
import type { BarColorData, LineDrawingData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrendlinesJdInputs {
  len: number;
  wicks: boolean;
  dispSelect: boolean;
  doMono: boolean;
  limitExtension: number;
  doAlerts: boolean;
  limitTrendlineNr: boolean;
  trendlineNr: number;
  trendlineCheckNr: number;
  selectBreaks: boolean;
  logChart: boolean;
}

export const defaultInputs: TrendlinesJdInputs = {
  len: 30,
  wicks: true,
  dispSelect: true,
  doMono: false,
  limitExtension: 2,
  doAlerts: true,
  limitTrendlineNr: false,
  trendlineNr: 5,
  trendlineCheckNr: 1,
  selectBreaks: true,
  logChart: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'loockback length pivots', defval: 30 },
  { id: 'wicks', type: 'bool', title: 'Draw lines from wicks (checked) or real bodies (unchecked)?', defval: true },
  { id: 'dispSelect', type: 'bool', title: "Display only falling 'high' and rising 'low' trendlines?", defval: true },
  { id: 'doMono', type: 'bool', title: 'checked = monochrome lines, unchecked = direction colored lines?', defval: false },
  { id: 'limitExtension', type: 'int', title: 'Limit extensions of the lines? 0 = infinite, other values x 50 bars', defval: 2, min: 0 },
  { id: 'doAlerts', type: 'bool', title: 'show trendline breaks', defval: true },
  { id: 'limitTrendlineNr', type: 'bool', title: 'limit number of trendlines shown (value in next setting calculates the lookback period)', defval: false },
  { id: 'trendlineNr', type: 'int', title: 'number of trendlines to show (select true above to limit)', defval: 5, min: 1, max: 50 },
  { id: 'trendlineCheckNr', type: 'int', title: 'number of past trendlines to check for breaks', defval: 1, min: 1, max: 50 },
  { id: 'selectBreaks', type: 'bool', title: "only display 'long' breaks on trendlines connecting 'highs' and 'short' for 'lows'", defval: true },
  { id: 'logChart', type: 'bool', title: 'USING A LOG CHART? MAKE SURE TO CHECK THIS BOX!!', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'High Pivot', color: '#2196F3', lineWidth: 1 },
  { id: 'plot1', title: 'Low Pivot', color: '#2196F3', lineWidth: 1 },
];

export const metadata = {
  title: 'Trendlines - JD',
  shortTitle: 'Trendlines',
  overlay: true,
};

const TEAL = '#00897B';
const LIME = '#00E676';
const FUCHSIA = '#E040FB';

/** study() without max_lines_count: 50 lines */
const MAX_LINES = 50;
/** rows of each sheet of the pivot table of the script */
const ROWS = 42;
/** longest history reference of the line variable */
const MAX_BARS_BACK = 5000;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Row { x: number; y: number; slope: number }
/** `_check_value[1]` of one line_cross() call: the close of the latest earlier bar on which the call ran */
interface Site { bar: number; value: number; previous: number }

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendlinesJdInputs> = {},
): Omit<IndicatorResult, 'lines' | 'markers' | 'barColors'>
  & { lines: LineDrawingData[]; markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.len);
  // len / 2 is a float (15.5 for 31): the pivot bars, the time of the pivot and the plot offset use its integer
  // part, the end of the solid line uses the float
  const half = Math.trunc(len / 2);
  const checkNr = Math.trunc(cfg.trendlineCheckNr);
  const trendlineNr = Math.trunc(cfg.trendlineNr);
  const log = cfg.logChart;
  const colorRising = cfg.doMono ? TEAL : LIME;
  const colorFalling = cfg.doMono ? TEAL : FUCHSIA;
  const xtend = cfg.limitExtension === 0;
  // bar times in ms, as the script reads them
  const unit = n > 0 && (bars[0].time as number) >= 1e12 ? 1 : 1000;
  const timeOf = (i: number) => (bars[i].time as number) * unit;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const highPivot = A(ta.pivothigh(new Series(bars, (b) => (cfg.wicks ? b.high : Math.max(b.open, b.close))), len, half));
  const lowPivot = A(ta.pivotlow(new Series(bars, (b) => (cfg.wicks ? b.low : Math.min(b.open, b.close))), len, half));

  // The pivot table: sheet 0 = highs, sheet 1 = lows; row 0 is the latest pivot
  const sheets: Row[][] = [0, 1].map(() => Array.from({ length: ROWS }, () => ({ x: 0, y: 0, slope: 0 })));
  const row = (sheet: number, index: number) => sheets[sheet][Math.min(ROWS - 1, index)];
  const addRecord = (sheet: number, x: number, y: number) => {
    sheets[sheet].unshift({ x, y, slope: 0 });
    sheets[sheet].pop();
  };
  const slopeOf = (x1: number, y1: number, x2: number, y2: number) =>
    (log ? ((math.log(y2) as number) - (math.log(y1) as number)) / (x2 - x1) : (y2 - y1) / (x2 - x1));
  const project = (y: number, dt: number, slope: number) => (log ? y * (math.exp(dt * slope) as number) : y + dt * slope);

  // Lines: library objects (xloc.bar_time) in the drawing registry: a creation that brings the count above max + 5
  // deletes the oldest until max remain; the lines of the four `var` variables of the script are not deleted by this
  // rule, but they count; the script deletes count on the last bar. A deleted line ignores later changes.
  resetDrawings({ line: MAX_LINES });
  const lookbackLineHigh = varDrawing<Line>();
  const trendlineHigh = varDrawing<Line>();
  const lookbackLineLow = varDrawing<Line>();
  const trendlineLow = varDrawing<Line>();
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string, dotted: boolean): Line => line.new(
    x1, y1, x2, y2, 'bar_time', xtend && dotted ? 'right' : 'none', css, dotted ? 'dotted' : 'solid', 1,
  );
  const deleteLine = (l: Line | undefined) => {
    if (l) line.delete(l);
  };
  // trendline_low at the end of each bar, for trendline_low[k]
  const trendlineLowHistory: Array<Line | undefined> = new Array(n).fill(undefined);
  /** line.delete(trendline_low[(time - pivot time) / bar_time]) */
  const deleteOlder = (i: number, pivotTime: number, barTime: number) => {
    const offset = (timeOf(i) - pivotTime) / barTime;
    // an na offset reads the current bar
    const k = Number.isNaN(offset) ? 0 : Math.trunc(offset);
    if (k > MAX_BARS_BACK) {
      throw new Error(
        `Error on bar ${i}: The script attempts to reference historical data that is too far from the current bar (${k} bars back). `
        + `The history-referencing length for the expression must be a value between 0 and ${MAX_BARS_BACK}.`,
      );
    }
    deleteLine(k === 0 ? trendlineLow.value : i - k >= 0 ? trendlineLowHistory[i - k] : undefined);
  };

  // line_cross(close, start time, start price, slope): 1 for a cross over the line, -1 for a cross under, else 0
  const lineCross = (i: number, site: Site, barTime: number, x: number, y: number, slope: number): number => {
    const close = bars[i].close;
    if (site.bar !== i) {
      site.previous = site.value;
      site.bar = i;
    }
    site.value = close;
    const elapsed = timeOf(i) - x;
    const current = project(y, elapsed - 0 * barTime, slope);
    const previous = project(y, elapsed - 1 * barTime, slope);
    return lt(site.previous, previous) && gt(close, current) ? 1 : gt(site.previous, previous) && lt(close, current) ? -1 : 0;
  };
  const highSite: Site = { bar: -1, value: NaN, previous: NaN };
  const lowSite: Site = { bar: -1, value: NaN, previous: NaN };

  const colorHigh: Array<string | null> = new Array(n).fill(null);
  const colorLow: Array<string | null> = new Array(n).fill(null);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const breakFlags: boolean[] = [], upFlags: boolean[] = [], downFlags: boolean[] = [];

  try {
    for (let i = 0; i < n; i++) {
      setDrawingBar(i, i === n - 1);
      const time = timeOf(i);
      const barTime = i > 0 ? time - timeOf(i - 1) : NaN;
      const hp = highPivot[i];
      const lp = lowPivot[i];

      // Track and store the pivots
      if (!Number.isNaN(hp)) addRecord(0, timeOf(i - half), hp);
      const phx1 = Math.trunc(row(0, 1).x);
      const phy1 = row(0, 1).y;
      const phx2 = Math.trunc(row(0, 0).x);
      const phy2 = row(0, 0).y;
      const slopeHigh = slopeOf(phx1, phy1, phx2, phy2);
      row(0, 0).slope = slopeHigh;

      if (!Number.isNaN(lp)) addRecord(1, timeOf(i - half), lp);
      const plx1 = Math.trunc(row(1, 1).x);
      const ply1 = row(1, 1).y;
      const plx2 = Math.trunc(row(1, 0).x);
      const ply2 = row(1, 0).y;
      const slopeLow = slopeOf(plx1, ply1, plx2, ply2);
      row(1, 0).slope = slopeLow;

      // Line ends: the bar where the pivot is detected, and the limited extension
      const lookbackTime = barTime * (len / 2);
      const phx2Lb = phx2 + lookbackTime;
      const phy2Lb = project(phy2, lookbackTime, slopeHigh);
      const plx2Lb = plx2 + lookbackTime;
      const ply2Lb = project(ply2, lookbackTime, slopeLow);
      const extensionTime = cfg.limitExtension * barTime * 100;
      const phx2Adj = xtend ? phx2 : phx2 + extensionTime;
      const phy2Adj = xtend ? phy2 : project(phy2, extensionTime, slopeHigh);
      const plx2Adj = xtend ? plx2 : plx2 + extensionTime;
      const ply2Adj = xtend ? ply2 : project(ply2, extensionTime, slopeLow);

      const highsFall = lt(slopeHigh * time, 0);
      if (!Number.isNaN(hp)) {
        const css = highsFall ? colorRising : cfg.dispSelect ? null : colorFalling;
        if (css !== null) {
          lookbackLineHigh.value = newLine(phx1, phy1, phx2Lb, phy2Lb, css, false);
          trendlineHigh.value = newLine(phx1, phy1, phx2Adj, phy2Adj, css, true);
        }
      }
      if (cfg.limitTrendlineNr) deleteOlder(i, row(0, trendlineNr).x, barTime);

      if (!Number.isNaN(lp)) {
        const css = highsFall ? (cfg.dispSelect ? null : colorRising) : colorFalling;
        if (css !== null) {
          lookbackLineLow.value = newLine(plx1, ply1, plx2Lb, ply2Lb, css, false);
          trendlineLow.value = newLine(plx1, ply1, plx2Adj, ply2Adj, css, true);
        }
      }
      if (cfg.limitTrendlineNr) deleteOlder(i, row(1, trendlineNr).x, barTime);
      trendlineLowHistory[i] = trendlineLow.value;

      // Crosses of the last lines
      let longBreak = false;
      let shortBreak = false;
      for (let k = 0; k <= checkNr; k++) {
        const h = row(0, k);
        const crossHigh = cfg.dispSelect && gt(h.slope * time, 0) ? 0 : lineCross(i, highSite, barTime, Math.trunc(h.x), h.y, h.slope);
        if (crossHigh === 1) longBreak = true;
        const l = row(1, k);
        const crossLow = cfg.dispSelect && gt(l.slope * time, 0) ? 0 : lineCross(i, lowSite, barTime, Math.trunc(l.x), l.y, l.slope);
        if (crossLow === 1) shortBreak = true;
      }

      colorHigh[i] = highsFall ? colorRising : cfg.dispSelect ? null : colorFalling;
      colorLow[i] = gt(slopeLow * time, 0) ? colorFalling : cfg.dispSelect ? null : colorRising;

      // alertcondition(long_break or short_break) / alertcondition(long_break) / alertcondition(short_break)
      breakFlags.push(longBreak || shortBreak);
      upFlags.push(longBreak);
      downFlags.push(shortBreak);

      if (cfg.doAlerts) {
        const t = bars[i].time as number;
        const shown = !Number.isNaN(bars[i].close) && bars[i].close !== 0;
        if (longBreak && shown) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: LIME, size: 'small' });
        if (shortBreak && shown) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: FUCHSIA, size: 'small' });
        if (longBreak || shortBreak) barColors.push({ time: t, color: longBreak ? LIME : FUCHSIA });
      }
    }
  } finally {
    setDrawingBar(null);
  }

  // plot(high_pivot, color = color_high, offset = -len / 2): the value of bar i + half on bar i
  const shifted = (values: number[], colors: Array<string | null>) => bars.map((b, i) => {
    const j = i + half;
    const value = j < n ? values[j] : NaN;
    const css = j < n ? colors[j] : null;
    return { time: b.time as number, value: Number.isFinite(value) ? value : NaN, color: css ?? 'transparent' };
  });

  // xloc.bar_time: the ends are times; a line with an na coordinate is not drawn
  const finite = (l: Line) => [l.x1, l.y1, l.x2, l.y2].every((v) => !Number.isNaN(v));
  const lines: LineDrawingData[] = line.all().filter(finite).map((l) => ({
    time1: l.x1 / unit, price1: l.y1, time2: l.x2 / unit, price2: l.y2, color: String(l.color),
    ...(l.style === 'dotted' ? { style: 'dotted' as const } : {}),
    ...(l.extend === 'right' ? { extend: 'right' as const } : {}),
  }));
  resetDrawings();
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: shifted(highPivot, colorHigh), plot1: shifted(lowPivot, colorLow) },
    markers,
    barColors,
    lines,
    alerts: alertStates(alertConditions, bars, [breakFlags, upFlags, downFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'trendline break', message: 'trendline break: {{close}}' },
  { id: 'alert1', title: 'trendline break up', message: 'trendline break up: {{close}}' },
  { id: 'alert2', title: 'trendline break down', message: 'trendline break down: {{close}}' },
];

export const TrendlinesJd = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
