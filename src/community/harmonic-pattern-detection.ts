/**
 * Harmonic Pattern Detection [LuxAlgo]
 *
 * The user gives five anchor times X, A, B, C and D. The closes at X, A, B and C give the ratios AB / XA and
 * BC / AB, and the script tests four harmonic patterns (Bat, Gartley, Butterfly, Crab), each with its own
 * projection of D from A and X. On the bar of the last of the four anchors it draws the legs, the ratio labels, the
 * projected point D at the time D, a table with the pattern found and the potential reversal zone (D +- 0.382 of
 * the distance D to X) as a box and two plots without colour. When no pattern matches, D is the Bat projection.
 *
 * With the default anchors (0) no bar matches: only the empty table is there.
 *
 * Port notes:
 * - An anchor time is a time in ms. A drawing time between two bars is given as the time of the next bar, where
 *   it is drawn; a time after the last bar is kept.
 * - Objects with an na price are not drawn and are left out.
 *
 * Reference: "Harmonic Pattern Detection [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { str, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData, LabelData, BoxData, TableData, TableCellData } from '../types';

export interface HarmonicPatternDetectionInputs {
  /** Tolerance of the AB / XA ratio of the Gartley and Butterfly patterns */
  precision: number;
  bullish: string;
  bearish: string;
  /** Anchor times (ms) */
  x: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

export const defaultInputs: HarmonicPatternDetectionInputs = {
  precision: 0.01,
  bullish: '#0cb51a',
  bearish: '#ff1100',
  x: 0,
  a: 0,
  b: 0,
  c: 0,
  d: 0,
};

export const inputConfig: InputConfig[] = [
  { id: 'precision', type: 'float', title: 'XA Precision', defval: 0.01, step: 0.01, group: 'Precision' },
  { id: 'bullish', type: 'color', title: 'Bullish', defval: '#0cb51a', group: 'style' },
  { id: 'bearish', type: 'color', title: 'Bullish', defval: '#ff1100', group: 'style' },
  { id: 'x', type: 'time', title: 'X', defval: 0, group: 'Anchor Points' },
  { id: 'a', type: 'time', title: 'A', defval: 0, group: 'Anchor Points' },
  { id: 'b', type: 'time', title: 'B', defval: 0, group: 'Anchor Points' },
  { id: 'c', type: 'time', title: 'C', defval: 0, group: 'Anchor Points' },
  { id: 'd', type: 'time', title: 'D', defval: 0, group: 'Anchor Points' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper PRZ', color: 'transparent', lineWidth: 1 },
  { id: 'plot1', title: 'Lower PRZ', color: 'transparent', lineWidth: 1 },
];

export const metadata = {
  title: 'Harmonic Pattern Detection [LuxAlgo]',
  shortTitle: 'Harmonic Pattern Detection [LuxAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const AB_TOOLTIP = '🦇 0.382-0.5 \n📏 ≈ 0.618 \n🦋 ≈ 0.786 \n🦀 0.382-0.618';
const BC_TOOLTIP = '🦇 0.382-0.886 \n📏 0.382-0.886 \n🦋 0.382-0.886 \n🦀 0.382-0.886';
const CD_TOOLTIP = '🦇 1.618-2.618 \n📏 1.130-1.618 \n🦋 1.618-2.240 \n🦀 2.618-3.618';
const PATTERNS = ['🦇 Bat', '📏 Gartley', '🦋 Butterfly', '🦀 Crab'];
/** Text colour of a table cell without text_color in Pine v5 */
const CELL_TEXT = '#363A45';

export function calculate(
  bars: Bar[],
  inputs: Partial<HarmonicPatternDetectionInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { x, a, b, c, d, precision } = cfg;
  const tMs = (i: number) => (bars[i].time as number) * 1000;

  // A time between two bars is drawn on the next bar; a time after the last bar is kept
  const drawnTime = (tm: number): number => {
    if (n === 0 || tm > tMs(n - 1)) return tm / 1000;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tMs(mid) >= tm) hi = mid;
      else lo = mid + 1;
    }
    return bars[lo].time as number;
  };

  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const boxes: BoxData[] = [];
  // var tb = table.new(position.top_right, 2, 4, bgcolor = color.gray)
  const cells: TableCellData[] = [];
  const setCell = (cell: TableCellData) => {
    const k = cells.findIndex((e) => e.column === cell.column && e.row === cell.row);
    if (k >= 0) cells[k] = cell;
    else cells.push(cell);
  };

  // line.new / label.new with xloc.bar_time; an object with an na coordinate is not drawn
  const newLine = (t1: number, y1: number, t2: number, y2: number, css: string, thick: boolean) => {
    if (isNaN(y1) || isNaN(y2)) return;
    lines.push({
      time1: drawnTime(t1), price1: y1, time2: drawnTime(t2), price2: y2, color: css,
      ...(thick ? { width: 2 } : { style: 'dotted' as const }),
    });
  };
  const newLabel = (tm: number, y: number, text: string, css: string, style: LabelData['style'], tooltip?: string) => {
    if (isNaN(y)) return;
    labels.push({
      time: drawnTime(tm), price: y, text, color: css, style, textColor: String(color.white), size: 'small',
      ...(tooltip ? { tooltip } : {}),
    });
  };
  const avg = (p: number, q: number) => (p + q) / 2;

  // x_y = ta.valuewhen(time == x, close, 0) ...
  let xy = NaN;
  let ay = NaN;
  let by = NaN;
  let cy = NaN;
  let upperPrz = NaN; // var float upper_prz = na
  let lowerPrz = NaN; // var float lower_prz = na
  let dy = NaN; // var float d_y = na
  const last = Math.max(x, a, b, c);
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];

  for (let i = 0; i < n; i++) {
    const time = tMs(i);
    const close = bars[i].close;
    if (time === x) xy = close;
    if (time === a) ay = close;
    if (time === b) by = close;
    if (time === c) cy = close;

    // dist(fib): d_y = a_y + fib * (x_y - a_y); math.abs(d_y - c_y) / math.abs(c_y - b_y)
    const project = (fib: number) => ay + fib * (xy - ay);
    const dist = (fib: number) => Math.abs(project(fib) - cy) / Math.abs(cy - by);
    const ab = Math.abs(ay - by) / Math.abs(ay - xy);
    const bc = Math.abs(cy - by) / Math.abs(ay - by);

    if (time === last) {
      const bear = gt(xy, ay);
      const css = bear ? cfg.bearish : cfg.bullish;
      const high: LabelData['style'] = bear ? 'label_down' : 'label_up';
      const low: LabelData['style'] = bear ? 'label_up' : 'label_down';

      newLine(x, xy, a, ay, css, true);
      newLine(a, ay, b, by, css, true);
      newLine(b, by, c, cy, css, true);
      // the source draws the dotted X to B line twice
      newLine(x, xy, b, by, css, false);
      newLine(x, xy, b, by, css, false);
      newLine(a, ay, c, cy, css, false);

      newLabel(x, xy, 'X', css, high);
      newLabel(a, ay, 'A', css, low);
      newLabel(b, by, 'B', css, high);
      newLabel(c, cy, 'C', css, low);
      // label.new(int(math.avg(x, b)), math.avg(x_y, b_y), str.tostring(ab, '#.###'), ...)
      newLabel(Math.trunc(avg(x, b)), avg(xy, by), str.tostring(ab, '#.###'), css, 'label_center', AB_TOOLTIP);
      newLabel(Math.trunc(avg(a, c)), avg(ay, cy), str.tostring(bc, '#.###'), css, 'label_center', BC_TOOLTIP);

      PATTERNS.forEach((text, row) => setCell({
        column: 0, row, text, textColor: String(color.white), textHAlign: 'left', textSize: 'auto',
      }));

      const bcOk = gt(bc, 0.382) && lt(bc, 0.886);
      let found = -1;
      let fib = 0.886;
      if (gt(ab, 0.382) && lt(ab, 0.5) && bcOk && gt(dist(0.886), 1.618) && lt(dist(0.886), 2.618)) {
        found = 0; // Bat
      } else if (gt(ab, 0.618 - precision) && lt(ab, 0.618 + precision) && bcOk && gt(dist(0.786), 1.13) && lt(dist(0.786), 1.618)) {
        found = 1; // Gartley
        fib = 0.786;
      } else if (gt(ab, 0.786 - precision) && lt(ab, 0.786 + precision) && bcOk && gt(dist(1.27), 1.618) && lt(dist(1.27), 2.24)) {
        found = 2; // Butterfly
        fib = 1.27;
      } else if (gt(ab, 0.382) && lt(ab, 0.618) && bcOk && gt(dist(1.618), 2.224) && lt(dist(1.618), 3.618)) {
        found = 3; // Crab
        fib = 1.618;
      }
      for (let row = 0; row < 4; row++) setCell({ column: 1, row, text: row === found ? '✔️' : '❌', textColor: CELL_TEXT, textSize: 'auto' });

      dy = project(fib);
      const cd = Math.abs(dy - cy) / Math.abs(cy - by);
      newLine(c, cy, d, dy, css, true);
      newLine(b, by, d, dy, css, false);
      newLabel(d, dy, 'D', css, high);
      newLabel(Math.trunc(avg(d, b)), avg(dy, by), str.tostring(cd, '#.###'), css, 'label_center', CD_TOOLTIP);

      upperPrz = dy + 0.382 * Math.abs(dy - xy);
      lowerPrz = dy - 0.382 * Math.abs(dy - xy);
      // box.new(x, upper_prz, d, lower_prz, border_color = na, xloc.bar_time, bgcolor = color.new(css, 80), extend.both)
      if (!isNaN(upperPrz) && !isNaN(lowerPrz)) {
        boxes.push({
          time1: drawnTime(x), price1: upperPrz, time2: drawnTime(d), price2: lowerPrz,
          borderColor: 'transparent', bgColor: String(color.new(css, 80)), extend: 'both',
        });
      }
      newLine(x, xy, d, dy, css, false);
    }

    // plot(upper_prz, 'Upper PRZ', na); plot(lower_prz, 'Lower PRZ', na)
    plot0.push({ time: bars[i].time as number, value: upperPrz, color: 'transparent' });
    plot1.push({ time: bars[i].time as number, value: lowerPrz, color: 'transparent' });
  }

  const tables: TableData[] = [{ position: 'top_right', columns: 2, rows: 4, bgColor: String(color.gray), cells }];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    lines,
    labels,
    boxes,
    tables,
  };
}

export const HarmonicPatternDetection = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
