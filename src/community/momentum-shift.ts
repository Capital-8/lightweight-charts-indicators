/**
 * Momentum Shift [Bigbeluga]
 *
 * A smoothed momentum line and the price zones that follow its turns. The momentum is the Hull moving average
 * ("Smooth") of close - close["Length" bars back]; it is filled from the line to 0 with a gradient between the two
 * colours, by its place between its lowest and highest value of the last 150 bars.
 *
 * A turn up (the momentum crosses above its value 2 bars back) marks the bar with a triangle under the low (and, when
 * the momentum is below 0, with a second triangle on the price pane and one on the momentum line) and draws six
 * levels above the bar: the high, then the high + 1 .. 5 times the zone size (the 100-bar average of high - low,
 * times "Shift Zone Size"). Each level starts 3 bars after the one below, carries its number, and runs 5 bars after
 * the current bar until the price reaches it; the areas between two levels are filled. A turn down does the same
 * below the bar and removes the levels of the other side that the price did not reach. Only the numbers of the
 * latest levels are kept. At most 500 lines, 500 labels and 500 fills are kept.
 *
 * The momentum line has the foreground colour of the chart: it comes from the chart context (third argument);
 * without it the dark theme value is used. The triangles, the levels, their numbers and their fills are on the price
 * pane (forceOverlay), the triangle on the momentum line is on the indicator pane.
 *
 * Reference: "Momentum Shift [Bigbeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface MomentumShiftInputs {
  /** Momentum length */
  length: number;
  /** Hull moving average length */
  smooth: number;
  /** Shift Zone Size: multiplier of the average bar range */
  multDist: number;
  colU: string;
  colD: string;
}

export const defaultInputs: MomentumShiftInputs = {
  length: 50,
  smooth: 50,
  multDist: 1,
  colU: '#3AD79B',
  colD: '#FB6B2E',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 50, group: 'Momentum', inline: 'mom' },
  { id: 'smooth', type: 'int', title: 'Smooth', defval: 50, group: 'Momentum', inline: 'mom' },
  { id: 'multDist', type: 'float', title: 'Shift Zone Size', defval: 1, step: 0.1 },
  { id: 'colU', type: 'color', title: '', defval: '#3AD79B', inline: 'ccc' },
  { id: 'colD', type: 'color', title: '', defval: '#FB6B2E', inline: 'ccc' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Momentum', color: '#DBDBDB', lineWidth: 1 },
  { id: 'plot1', title: 'Zero', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Momentum Shift [Bigbeluga]',
  shortTitle: 'Momentum Shift [Bigbeluga]',
  overlay: false,
};

/** indicator(max_labels_count = 500, max_lines_count = 500); the fills between lines follow the same count */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
  style: 'label_up' | 'label_down' | 'label_right';
  overlay: boolean;
  deleted: boolean;
}
interface Lf {
  line1: Ln;
  line2: Ln;
  color: string;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MomentumShiftInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'labels' | 'lines' | 'linefills'> & {
  labels: LabelData[];
  lines: LineDrawingData[];
  linefills: LinefillData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const { colU, colD } = cfg;
  const length = Math.trunc(cfg.length);
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // Smoothed momentum
  const change = Series.fromArray(bars, bars.map((b, i) => (i >= length && length >= 0 ? b.close - bars[i - length].close : NaN)));
  const momSeries = ta.hma(change, cfg.smooth);
  const mom = A(momSeries);
  const high_ = A(ta.highest(momSeries, 150));
  const low_ = A(ta.lowest(momSeries, 150));

  // Signals: the momentum against its value 2 bars back
  const mom2 = Series.fromArray(bars, mom.map((_, i) => (i >= 2 ? mom[i - 2] : NaN)));
  const rising = ta.crossover(momSeries, mom2).toArray();
  const falling = ta.crossunder(momSeries, mom2).toArray();

  const range = new Series(bars, (b) => b.high - b.low);
  const dist = A(ta.sma(range, 100)).map((v) => v * cfg.multDist);

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. A deleted object ignores later changes. A fill is removed with a line that the script deletes; a
  // fill whose line was removed by the count limit stays in the count but is not drawn.
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const fills: Lf[] = [];
  const limit = <T>(list: T[], drop: (o: T) => void) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (const o of list.splice(0, list.length - MAX_OBJECTS)) drop(o);
  };
  const newLine = (x1: number, y: number, x2: number, c: string): Ln => {
    const o: Ln = { x1, x2, y, color: c, deleted: false };
    lines.push(o);
    limit(lines, (l) => { l.deleted = true; });
    return o;
  };
  const deleteLine = (l: Ln | null) => {
    if (!l || l.deleted) return;
    l.deleted = true;
    lines.splice(lines.indexOf(l), 1);
    for (let k = fills.length - 1; k >= 0; k--) {
      if (fills[k].line1 === l || fills[k].line2 === l) fills.splice(k, 1);
    }
  };
  const newLabel = (x: number, y: number, text: string, textColor: string, style: Lb['style'], overlay: boolean): Lb => {
    const o: Lb = { x, y, text, textColor, style, overlay, deleted: false };
    labels.push(o);
    limit(labels, (l) => { l.deleted = true; });
    return o;
  };
  const deleteLabel = (l: Lb | null | undefined) => {
    if (!l || l.deleted) return;
    l.deleted = true;
    labels.splice(labels.indexOf(l), 1);
  };
  /**
   * linefill.new(line1, line2, color): nothing with an na line. An existing fill that has both lines among its two
   * lines takes the new colour and no fill is made. So a call with twice the same line, as the script does for
   * the last level, recolours the fill between that level and the one before.
   */
  const newFill = (line1: Ln | null, line2: Ln | null, c: string) => {
    if (!line1 || !line2 || line1.deleted || line2.deleted) return;
    const has = (f: Lf, l: Ln) => f.line1 === l || f.line2 === l;
    const old = fills.find((f) => has(f, line1) && has(f, line2));
    if (old) {
      old.color = c;
      return;
    }
    if (line1 === line2) return;
    fills.push({ line1, line2, color: c });
    limit(fills, () => undefined);
  };

  // var arrays of the script
  let linesUp: Array<Ln | null> = [];
  let linesDn: Array<Ln | null> = [];
  const numbered: Lb[] = [];
  // draw_lbl(): `var lbl` of each of its two call sites, now and at the end of the bar before (lbl[1])
  const sites = { up: { now: null as Lb | null, before: null as Lb | null }, dn: { now: null as Lb | null, before: null as Lb | null } };
  const drawLbl = (site: { now: Lb | null; before: Lb | null }, x: number, y: number, text: string, c: string) => {
    site.now = newLabel(x, y, text, c, 'label_right', true);
    deleteLabel(site.before);
    numbered.push(site.now);
  };

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    sites.up.before = sites.up.now;
    sites.dn.before = sites.dn.now;

    // Rising zones
    if (rising[i]) {
      newLabel(i, b.low, '▲', String(color.new(colU, 50)), 'label_up', true);
      if (lt(mom[i], 0)) {
        newLabel(i, mom[i], '▲', colU, 'label_up', false);
        newLabel(i, b.low, '△', colU, 'label_up', true);
      }
      for (const l of linesDn) deleteLine(l);
      linesDn = [];
      for (let k = 0; k <= 5; k++) {
        const y = b.high + dist[i] * k;
        const c = String(color.new(colU, 60 - 10 * k));
        linesUp.push(newLine(i + k * 3, y, i + 15 + k * 3, c));
        if (k > 0) drawLbl(sites.up, i + k * 3, y, String(k), c);
      }
    }

    // Falling zones
    if (falling[i]) {
      newLabel(i, b.high, '▼', String(color.new(colD, 50)), 'label_down', true);
      if (gt(mom[i], 0)) {
        newLabel(i, mom[i], '▼', colD, 'label_down', false);
        newLabel(i, b.high, '▽', colD, 'label_down', true);
      }
      for (const l of linesUp) deleteLine(l);
      linesUp = [];
      for (let k = 0; k <= 5; k++) {
        const y = b.low - dist[i] * k;
        const c = String(color.new(colD, 60 - 10 * k));
        linesDn.push(newLine(i + k * 3, y, i + 15 + k * 3, c));
        if (k > 0) drawLbl(sites.dn, i + k * 3, y, String(k), c);
      }
    }

    // Manage lines: a level runs 5 bars (+ 3 per level) after the current bar until the price reaches it
    const manage = (arr: Array<Ln | null>, col: string, reached: (y: number) => boolean) => {
      for (let k = 0; k < arr.length; k++) {
        const line = arr[k];
        const next = arr[k < arr.length - 1 ? k + 1 : k];
        if (line && !line.deleted) line.x2 = i + 5 + k * 3;
        newFill(line, next, String(color.new(col, 90 - k * 5)));
        if (line && !line.deleted && reached(line.y)) {
          line.x2 = i;
          arr[k] = null;
        }
      }
    };
    manage(linesUp, colU, (y) => ge(b.high, y));
    manage(linesDn, colD, (y) => le(b.low, y));

    // Remove the oldest numbers, one per bar, while more than 5 are kept
    if (numbered.length > 5) deleteLabel(numbered.shift());
  }

  const fg = foregroundColorOf(chart);
  const plot0 = bars.map((b, i) => ({ time: b.time, value: mom[i], color: fg }));
  const plot1 = bars.map((b) => ({ time: b.time, value: 0 }));
  // color colorM = color.from_gradient(mom, low_, high_, col_d, col_u)
  const colorM = mom.map((m, i): string | null => {
    if (isNaN(m) || isNaN(low_[i]) || isNaN(high_[i])) return null;
    return String(color.from_gradient(m, low_[i], high_[i], colD, colU));
  });
  const none = mom.map((): string | null => null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lineData = (l: Ln): LineDrawingData => ({
    time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, forceOverlay: true,
  });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [{ value: 0, options: { color: '#787B86', linestyle: 'dashed' } }],
    // fill(pm, p0, high_, low_, mom > 0 ? colorM : na, na), then fill(pm, p0, high_, low_, na, mom < 0 ? colorM : na)
    fills: [
      { plot1: 'plot0', plot2: 'plot1', gradient: {
        topValue: high_.slice(), bottomValue: low_.slice(),
        topColor: mom.map((m, i) => (gt(m, 0) ? colorM[i] : null)), bottomColor: none,
      } },
      { plot1: 'plot0', plot2: 'plot1', gradient: {
        topValue: high_.slice(), bottomValue: low_.slice(),
        topColor: none, bottomColor: mom.map((m, i) => (lt(m, 0) ? colorM[i] : null)),
      } },
    ],
    // an object with an na coordinate is not drawn
    lines: lines.filter((l) => !isNaN(l.y)).map(lineData),
    linefills: fills
      .filter((f) => !f.line1.deleted && !f.line2.deleted && !isNaN(f.line1.y) && !isNaN(f.line2.y))
      .map((f) => ({ line1: lineData(f.line1), line2: lineData(f.line2), color: f.color })),
    labels: labels.filter((l) => !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor, style: l.style,
      ...(l.overlay ? { forceOverlay: true } : {}),
    })),
  };
}

export const MomentumShift = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
