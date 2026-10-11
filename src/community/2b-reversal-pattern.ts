/**
 * 2B Reversal Pattern (Expo)
 *
 * The 2B pattern: price breaks a swing high (or a swing low) and fails, then closes back through the bar that made
 * the break.
 * - Swing highs and lows are pivots with `Period` bars on each side.
 * - When the close crosses above the last swing high (below the last swing low) a dashed line is drawn from the pivot
 *   to the break, and the low (the high) of the break bar becomes the level to watch. A solid line follows that level
 *   on each bar.
 * - When the close crosses back through the level between `Minimum Break Length` and `Maximum Break Length` bars
 *   after the break, the pattern is complete: a solid line from the break bar and a triangle (below the bar for a
 *   cross up, above the bar for a cross down).
 * - A cross of the level outside that window, or no cross within the maximum length, cancels the level and removes
 *   the line of the break.
 *
 * At most 500 lines are kept (the oldest are removed).
 *
 * Reference: "2B Reversal Pattern (Expo)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { ta, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData, MarkerData } from '../types';

export interface TwoBReversalPatternInputs {
  /** Pivot period */
  prd: number;
  /** Maximum bars until the pattern must be complete */
  max: number;
  /** Minimum bars before the breakout */
  min: number;
  /** Colour of a breakout up */
  bUp: string;
  /** Colour of a breakout down */
  bDn: string;
  /** Colour of the pivot and level lines */
  pCol: string;
}

export const defaultInputs: TwoBReversalPatternInputs = {
  prd: 20,
  max: 10,
  min: 3,
  bUp: '#6ce5a0',
  bDn: '#f23645',
  pCol: '#00BCD4',
};

export const inputConfig: InputConfig[] = [
  { id: 'prd', type: 'int', title: 'Period', defval: 20, min: 1, tooltip: 'Set the pivot period.' },
  {
    id: 'max', type: 'int', title: 'Maximum Break Length', defval: 10, min: 1,
    tooltip: 'Set the maximum bars until the pattern should be completed. This means establishing a limit on the number of bars allowed for the completion of the pattern. A high value returns more signals.',
  },
  {
    id: 'min', type: 'int', title: 'Minimum Break Length', defval: 3, min: 1,
    tooltip: 'Set the minimum bars before the breakout. This means establishing a minimum number of bars that must be completed before the breakout. A low value returns more signals.',
  },
  { id: 'bUp', type: 'color', title: '', defval: '#6ce5a0', inline: 'col' },
  { id: 'bDn', type: 'color', title: '', defval: '#f23645', inline: 'col' },
  { id: 'pCol', type: 'color', title: '', defval: '#00BCD4', inline: 'col' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: '2B Reversal Pattern (Expo)',
  shortTitle: '2B Reversal Pattern (Expo)',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  dashed: boolean;
  width: number;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TwoBReversalPatternInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const prd = Math.trunc(cfg.prd);
  const { max, min, bUp, bDn, pCol } = cfg;

  const pvtHi = ta.pivothigh(new Series(bars, (b) => b.high), prd, prd).toArray();
  const pvtLo = ta.pivotlow(new Series(bars, (b) => b.low), prd, prd).toArray();

  // Live lines in creation order. When a creation brings the count above max + 5 the oldest are deleted until max
  // remain; the line held by the `var` variable `active` is not deleted by this limit, but it counts.
  const live: Ln[] = [];
  let active: Ln | null = null;
  const newLine = (x1: number, y: number, x2: number, color: string, dashed: boolean, width: number): Ln => {
    const o: Ln = { x1, x2, y, color, dashed, width, deleted: false };
    live.push(o);
    if (live.length > MAX_LINES + 5) {
      for (let k = 0; k < live.length && live.length > MAX_LINES; ) {
        if (live[k] === active) k++;
        else live.splice(k, 1)[0].deleted = true;
      }
    }
    return o;
  };
  const del = (l: Ln | null | undefined) => {
    if (!l || l.deleted) return;
    l.deleted = true;
    live.splice(live.indexOf(l), 1);
  };

  let ph = NaN;
  let pl = NaN;
  let phL = NaN;
  let plL = NaN;
  let bo = NaN;
  let boL = NaN;
  const lines: Ln[] = []; // var array<line> lines
  let activePrev: Ln | null = null; // active[1]

  // One history per ta.cross* call: the level changes between the calls of one bar
  const overPh = callsite.crossover();
  const underPl = callsite.crossunder();
  const underBo = callsite.crossunder();
  const overBo = callsite.crossover();
  const crossBo = callsite.cross();

  const markers: MarkerData[] = [];

  for (let i = 0; i < n; i++) {
    const { high, low, close, time } = bars[i];
    let breakoutUp = false;
    let breakoutDn = false;

    // Pivots (`if pvtHi`: a value that is not na and not 0)
    const hi = pvtHi[i] ?? NaN;
    const lo = pvtLo[i] ?? NaN;
    if (!isNaN(hi) && hi !== 0) {
      ph = bars[i - prd].high;
      phL = i - prd;
    }
    if (!isNaN(lo) && lo !== 0) {
      pl = bars[i - prd].low;
      plL = i - prd;
    }

    // Pattern detection
    if (overPh(close, ph)) {
      bo = low;
      boL = i;
      lines.push(newLine(phL, ph, i, pCol, true, 1));
      ph = NaN;
    }
    if (underPl(close, pl)) {
      bo = high;
      boL = i;
      lines.push(newLine(plL, pl, i, pCol, true, 1));
      pl = NaN;
    }
    // `and` is not lazy in this Pine version: each crossing call runs on every bar
    const xUnder = underBo(close, bo);
    if (xUnder && i - boL <= max && i - boL >= min) {
      del(active);
      lines.push(newLine(boL, bo, i, bDn, false, 2));
      breakoutDn = true;
      bo = NaN;
    }
    const xOver = overBo(close, bo);
    if (xOver && i - boL <= max && i - boL >= min) {
      del(active);
      lines.push(newLine(boL, bo, i, bUp, false, 2));
      breakoutUp = true;
      bo = NaN;
    }
    if (crossBo(close, bo)) {
      bo = NaN;
      del(lines.pop());
    }

    if (!isNaN(bo)) {
      active = newLine(boL, bo, i, pCol, false, 2);
      del(activePrev);
      if (i - boL > max) {
        bo = NaN;
        del(lines.pop());
        del(active);
      }
    }
    activePrev = active;

    // plotshape(breakoutup ? low : na, location.belowbar): the series is read as a bool (na and 0 draw nothing)
    if (breakoutUp && low !== 0) {
      markers.push({ time, position: 'belowBar', shape: 'triangleUp', color: bUp, size: 'small' });
    }
    if (breakoutDn && high !== 0) {
      markers.push({ time, position: 'aboveBar', shape: 'triangleDown', color: bDn, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    lines: live.map((l) => ({
      time1: bars[l.x1].time, price1: l.y, time2: bars[l.x2].time, price2: l.y, color: l.color,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
      ...(l.width !== 1 ? { width: l.width } : {}),
    })),
  };
}

export const TwoBReversalPattern = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
