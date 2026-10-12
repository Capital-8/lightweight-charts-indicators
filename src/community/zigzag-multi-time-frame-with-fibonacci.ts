/**
 * ZigZag Multi Time Frame with Fibonacci Retracement
 *
 * A zigzag whose swing length follows another timeframe: the window is the bars from the start of the period that is
 * `ZigZag Period` - 1 periods before the current one of the zigzag timeframe (default: daily periods). A bar is a
 * swing high when its high is the highest of that window, a swing low when its low is the lowest. The direction turns
 * up on a swing high without a swing low and down on a swing low without a swing high. A turn adds a zigzag point, a
 * further extreme in the same direction moves the latest point.
 *
 * Drawings: with "Show Zig Zag" every leg of the zigzag (at most 50 lines); without it only the leg before the
 * latest one, dotted. On the last bar the Fibonacci levels of that leg (0, the enabled ratios below 1, then 1, 1.272,
 * 1.414, 1.618, 2 ... 5.618) as lines extended to the right with a text "ratio(price)"; the levels above 1 stop after
 * the first level beyond the latest zigzag point. "Colorful Fibonacci Levels" picks the line colours from the current
 * time (they change every second in the original).
 *
 * The periods of the zigzag timeframe come from the exchange calendar when the chart context gives the time zone and
 * the session, else from the UTC calendar and the bars (see src/anchor-period.ts). The prices of the texts are rounded
 * to the symbol tick of the chart context (0.01 without it).
 *
 * Reference: "ZigZag Multi Time Frame with Fibonacci Retracement" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import {
  ta, taCore, str, math, Series, line, resetDrawings, setDrawingBar, varDrawing,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { periodStarts } from '../anchor-period';
import { mintickOf, nowOf, type ChartContext } from '../chart-context';

export interface ZigzagMultiTimeFrameWithFibonacciInputs {
  /** Timeframe of the zigzag periods ("D", "W", "240", ...) */
  tf: string;
  /** Number of periods of the zigzag timeframe in the swing window */
  prd: number;
  showzigzag: boolean;
  showfibo: boolean;
  colorfulfibo: boolean;
  labelcol: string;
  fibolinecol: string;
  upcol: string;
  dncol: string;
  labelloc: 'Left' | 'Right';
  enable236: boolean;
  enable382: boolean;
  enable500: boolean;
  enable618: boolean;
  enable786: boolean;
}

// Colour constants of Pine version 4
const BLUE = '#2196F3';
const LIME = '#00E676';
const RED = '#FF5252';

export const defaultInputs: ZigzagMultiTimeFrameWithFibonacciInputs = {
  tf: 'D',
  prd: 2,
  showzigzag: false,
  showfibo: true,
  colorfulfibo: false,
  labelcol: BLUE,
  fibolinecol: LIME,
  upcol: LIME,
  dncol: RED,
  labelloc: 'Left',
  enable236: true,
  enable382: true,
  enable500: true,
  enable618: true,
  enable786: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'tf', type: 'timeframe', title: 'ZigZag Resolution', defval: 'D' },
  { id: 'prd', type: 'int', title: 'ZigZag Period', defval: 2, min: 2, max: 10 },
  { id: 'showzigzag', type: 'bool', title: 'Show Zig Zag', defval: false },
  { id: 'showfibo', type: 'bool', title: 'Show Fibonacci Ratios', defval: true },
  { id: 'colorfulfibo', type: 'bool', title: 'Colorful Fibonacci Levels', defval: false },
  { id: 'labelcol', type: 'color', title: 'Text Color', defval: BLUE },
  { id: 'fibolinecol', type: 'color', title: 'Line Color', defval: LIME },
  { id: 'upcol', type: 'color', title: 'Zigzag Line Colors', defval: LIME, inline: 'zzcol' },
  { id: 'dncol', type: 'color', title: '', defval: RED, inline: 'zzcol' },
  { id: 'labelloc', type: 'string', title: 'Label Location', defval: 'Left', options: ['Left', 'Right'] },
  { id: 'enable236', type: 'bool', title: 'Enable Level 0.236', defval: true },
  { id: 'enable382', type: 'bool', title: 'Enable Level 0.382', defval: true },
  { id: 'enable500', type: 'bool', title: 'Enable Level 0.500', defval: true },
  { id: 'enable618', type: 'bool', title: 'Enable Level 0.618', defval: true },
  { id: 'enable786', type: 'bool', title: 'Enable Level 0.786', defval: true },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ZigZag Multi Time Frame with Fibonacci Retracement',
  shortTitle: 'ZZMTF',
  overlay: true,
};

/** Colours of the "Colorful Fibonacci Levels" option (version 4 constants): lime, silver, gray, red, purple, fuchsia, olive, navy, teal, orange */
const FIBO_COLORS = [LIME, '#B2B5BE', '#787B86', RED, '#9C27B0', '#E040FB', '#808000', '#311B92', '#00897B', '#FF9800'];
/** Default number of lines kept (no max_lines_count in the script) */
const MAX_LINES = 50;
const MAX_ARRAY_SIZE = 50;
/** Text before a label on the right: 18 em quads */
const RIGHT_PAD = ' '.repeat(18);

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

type Line = ReturnType<typeof line.new>;

export function calculate(
  bars: Bar[],
  inputs: Partial<ZigzagMultiTimeFrameWithFibonacciInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'labels' | 'lines'> & { labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const prd = Math.trunc(cfg.prd);
  const mintick = mintickOf(chart);

  // newbar = change(time(tf)) != 0 (false on the first bar: the change is na)
  const starts = periodStarts(bars, cfg.tf, chart);
  const newbar = starts.map((t, i) => i > 0 && t !== starts[i - 1]);
  // bi = valuewhen(newbar, bar_index, prd - 1)
  const bi = ta
    .valuewhen(Series.fromArray(bars, newbar.map((v) => (v ? 1 : 0))), Series.fromArray(bars, bars.map((_, i) => i)), prd - 1)
    .toArray()
    .map((v) => v ?? NaN);

  // ph = highestbars(high, nz(len, 1)) == 0 ? high : na (a length per bar)
  const len = bi.map((v, i) => (isNaN(v) ? 1 : i - v + 1));
  const hb = taCore.highestbars(bars.map((b) => b.high), len);
  const lb = taCore.lowestbars(bars.map((b) => b.low), len);

  let dir = 0;
  // zigzag: value, bar index, value, bar index ... (newest first)
  const zigzag: number[] = [];
  // Lines live in the library registry: the line count limit (max_lines_count 50) and the line held by the `var`
  // variable `zzline` follow the PineScript rules there
  resetDrawings({ line: MAX_LINES });
  const zzline = varDrawing<Line>();
  const addToZigzag = (value: number, bindex: number) => {
    zigzag.unshift(value, bindex);
    if (zigzag.length > MAX_ARRAY_SIZE) zigzag.length -= 2;
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const ph = hb[i] === 0 ? b.high : NaN;
    const pl = lb[i] === 0 ? b.low : NaN;

    const prevDir = dir;
    dir = truthy(ph) && isNaN(pl) ? 1 : truthy(pl) && isNaN(ph) ? -1 : dir;
    const oldzigzag = zigzag.slice();

    const dirchanged = i > 0 && dir !== prevDir;
    if (truthy(ph) || truthy(pl)) {
      const value = dir === 1 ? ph : pl;
      if (dirchanged) {
        addToZigzag(value, i);
      } else if (zigzag.length === 0) {
        addToZigzag(value, i);
      } else if ((dir === 1 && gt(value, zigzag[0])) || (dir === -1 && lt(value, zigzag[0]))) {
        zigzag[0] = value;
        zigzag[1] = i;
      }
    }

    if (cfg.showzigzag && zigzag.length >= 4 && oldzigzag.length >= 4) {
      if (!eq(zigzag[0], oldzigzag[0]) || !eq(zigzag[1], oldzigzag[1])) {
        if (zzline.value && eq(zigzag[2], oldzigzag[2]) && eq(zigzag[3], Math.round(oldzigzag[3]))) line.delete(zzline.value);
        zzline.value = line.new(
          Math.round(zigzag[1]), zigzag[0], Math.round(zigzag[3]), zigzag[2], 'bar_index', 'none', dir === 1 ? cfg.upcol : cfg.dncol, 'solid', 2,
        );
      }
    }
    if (!cfg.showzigzag && zigzag.length >= 6) {
      if (zzline.value) line.delete(zzline.value);
      zzline.value = line.new(
        Math.round(zigzag[3]), zigzag[2], Math.round(zigzag[5]), zigzag[4], 'bar_index', 'none', dir === 1 ? cfg.upcol : cfg.dncol, 'dotted', 2,
      );
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const outLabels: LabelData[] = [];

  // Fibonacci levels, on the last bar (the drawing bar is still the last bar)
  if (cfg.showfibo && zigzag.length >= 6 && n > 0) {
    const ratios = [0];
    let shownlevels = 1;
    for (const [on, r] of [[cfg.enable236, 0.236], [cfg.enable382, 0.382], [cfg.enable500, 0.5], [cfg.enable618, 0.618], [cfg.enable786, 0.786]] as const) {
      if (on) {
        ratios.push(r);
        shownlevels++;
      }
    }
    for (let x = 1; x <= 5; x++) ratios.push(x, x + 0.272, x + 0.414, x + 0.618);

    const last = n - 1;
    // timenow / 1000 is a float division; the array index is truncated
    const seconds = nowOf(chart) / 1000;
    const diff = zigzag[4] - zigzag[2];
    let stopit = false;
    for (let x = 0; x < ratios.length; x++) {
      if (stopit && x > shownlevels) break;
      const level = zigzag[2] + diff * ratios[x];
      const lineColor = cfg.colorfulfibo ? FIBO_COLORS[Math.trunc((seconds * x) % 10)] : cfg.fibolinecol;
      line.new(Math.round(zigzag[5]), level, last, level, 'bar_index', 'right', lineColor, 'solid', 1);
      const left = cfg.labelloc === 'Left';
      outLabels.unshift({
        time: T(left ? Math.round(zigzag[5]) - 1 : last),
        price: level,
        text: `${left ? '' : RIGHT_PAD}${str.tostring(ratios[x], '#.###')}(${str.tostring(math.round_to_mintick(level, mintick) as number)})`,
        color: BLUE,
        textColor: cfg.labelcol,
        style: 'none',
      });
      if ((dir === 1 && gt(level, zigzag[0])) || (dir === -1 && lt(level, zigzag[0]))) stopit = true;
    }
  }

  setDrawingBar(null);

  const outLines: LineDrawingData[] = line.all().map((l) => ({
    time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), width: l.width ?? 1,
    ...(l.style === 'dotted' ? { style: 'dotted' as const } : {}),
    ...(l.extend === 'right' ? { extend: 'right' as const } : {}),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: outLines,
    labels: outLabels,
  };
}

export const ZigzagMultiTimeFrameWithFibonacci = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
