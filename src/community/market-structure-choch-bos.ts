/**
 * Market Structure CHoCH/BOS (Fractal) [LuxAlgo]
 *
 * A bullish fractal is a high with p = length / 2 rising highs before it and p falling highs after it, which is
 * also the highest high of the last "length" bars; a bearish fractal is the mirror case on the lows. The first
 * close that crosses above the latest bullish fractal draws a line from the fractal bar to the cross bar with a text
 * at its middle: "ChoCH" when the structure before was bearish, else "BOS". A close crossing below the latest
 * bearish fractal is the bearish case.
 *
 * "Support": after a bullish structure, a dashed line at the lowest low since the fractal, extended to the current
 * bar until a close goes below it (a red dot marks that bar). "Resistance" is the mirror case (green dot).
 * The dashboard gives the share of the fractals that ended in a structure, per side.
 *
 * At most 500 lines and 500 labels are kept (the oldest are removed first).
 *
 * Reference: "Market Structure CHoCH/BOS (Fractal) [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, math, str, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, TableData, TableCellData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface MarketStructureChochBosInputs {
  length: number;
  showBull: boolean;
  bullCss: string;
  showBear: boolean;
  bearCss: string;
  showSupport: boolean;
  supCss: string;
  showResistance: boolean;
  resCss: string;
  showDash: boolean;
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: MarketStructureChochBosInputs = {
  length: 5,
  showBull: true,
  bullCss: '#089981',
  showBear: true,
  bearCss: '#F23645',
  showSupport: false,
  supCss: '#089981',
  showResistance: false,
  resCss: '#F23645',
  showDash: false,
  dashLoc: 'Top Right',
  textSize: 'Small',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'length', defval: 5, min: 3 },
  { id: 'showBull', type: 'bool', title: 'Bullish Structures', defval: true, inline: 'bull', group: 'Style' },
  { id: 'bullCss', type: 'color', title: '', defval: '#089981', inline: 'bull', group: 'Style' },
  { id: 'showBear', type: 'bool', title: 'Bearish Structures', defval: true, inline: 'bear', group: 'Style' },
  { id: 'bearCss', type: 'color', title: '', defval: '#F23645', inline: 'bear', group: 'Style' },
  { id: 'showSupport', type: 'bool', title: 'Support', defval: false, inline: 's', group: 'Style' },
  { id: 'supCss', type: 'color', title: '', defval: '#089981', inline: 's', group: 'Style' },
  { id: 'showResistance', type: 'bool', title: 'Resistance', defval: false, inline: 'r', group: 'Style' },
  { id: 'resCss', type: 'color', title: '', defval: '#F23645', inline: 'r', group: 'Style' },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: false, group: 'Dashboard' },
  {
    id: 'dashLoc', type: 'string', title: 'Location', defval: 'Top Right', options: ['Top Right', 'Bottom Right', 'Bottom Left'],
    group: 'Dashboard',
  },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], group: 'Dashboard' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Resistance Breakout', color: '#089981', lineWidth: 2, style: 'circles' },
  { id: 'plot1', title: 'Support Breakout', color: '#F23645', lineWidth: 2, style: 'circles' },
];

export const metadata = {
  title: 'Market Structure CHoCH/BOS (Fractal) [LuxAlgo]',
  shortTitle: 'LuxAlgo - Market Structure (Fractal)',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  dashed: boolean;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
  style: 'label_down' | 'label_up';
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketStructureChochBosInputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines' | 'tables'> & { labels: LabelData[]; lines: LineDrawingData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length = Math.trunc(cfg.length);
  const p = Math.trunc(length / 2);

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const signOf = (x: number[]) => x.map((v, i) => (i === 0 ? NaN : math.sign(v - x[i - 1])));
  const dh = math.sum(signOf(high), p);
  const dl = math.sum(signOf(low), p);
  const highest = ta.highest(new Series(bars, (b) => b.high), length).toArray();
  const lowest = ta.lowest(new Series(bars, (b) => b.low), length).toArray();
  const at = (x: (number | null | undefined)[], i: number) => (i >= 0 ? (x[i] ?? NaN) : NaN);

  // Live drawings in creation order. Limit: when a creation brings the count above max + 5, the oldest are deleted
  // until max remain; an object held by a `var` variable of the script (the latest bullish label, the support and
  // resistance lines) is never deleted by the limit, but it counts.
  const held = new Set<object>();
  const limit = <T extends object>(list: T[], onDelete: (o: T) => void) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (held.has(list[k])) k++;
      else onDelete(list.splice(k, 1)[0]);
    }
  };
  const hold = <T extends object>(before: T | null, now: T): T => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const newLine = (x1: number, x2: number, y: number, col: string, dashed: boolean): Ln => {
    const o: Ln = { x1, x2, y, color: col, dashed, deleted: false };
    lines.push(o);
    limit(lines, (l) => {
      l.deleted = true;
    });
    return o;
  };
  const newLabel = (l: Lb): Lb => {
    labels.push(l);
    limit(labels, () => undefined);
    return l;
  };

  // fractal.new(): value, loc, iscrossed (na)
  const upper = { value: NaN, loc: NaN, iscrossed: false };
  const lower = { value: NaN, loc: NaN, iscrossed: false };
  let lowerLvl: Ln | null = null;
  let upperLvl: Ln | null = null;
  let msLbl: Lb | null = null;
  let bullMsCount = 0;
  let bearMsCount = 0;
  let bullfCount = 0;
  let bearfCount = 0;
  let brokenSup = false;
  let brokenRes = false;
  let os = 0;
  const crossUp = callsite.crossover();
  const crossDn = callsite.crossunder();

  const resBreak: number[] = new Array(n).fill(NaN);
  const supBreak: number[] = new Array(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const bullf = eq(at(dh, i), -p) && eq(at(dh, i - p), p) && eq(at(high, i - p), at(highest, i));
    const bearf = eq(at(dl, i), p) && eq(at(dl, i - p), -p) && eq(at(low, i - p), at(lowest, i));
    bullfCount += bullf ? 1 : 0;
    bearfCount += bearf ? 1 : 0;
    const brokenRes1 = brokenRes;
    const brokenSup1 = brokenSup;

    // Bullish market structure
    if (bullf) {
      upper.value = high[i - p];
      upper.loc = i - p;
      upper.iscrossed = false;
    }
    if (crossUp(close, upper.value) && !upper.iscrossed) {
      newLine(upper.loc, i, upper.value, cfg.showBull ? cfg.bullCss : 'transparent', false);
      msLbl = hold(msLbl, newLabel({
        x: Math.trunc((i + upper.loc) / 2), y: upper.value, text: os === -1 ? 'ChoCH' : 'BOS',
        textColor: cfg.showBull ? cfg.bullCss : 'transparent', style: 'label_down',
      }));

      // Set support: the lowest low since the fractal (a `for` with an end below its start counts down)
      let k = 2;
      let min = at(low, i - 1);
      const end = i - upper.loc - 1;
      for (let j = 2; end >= 2 ? j <= end : j >= end; j += end >= 2 ? 1 : -1) {
        min = math.min(at(low, i - j), min) as number;
        k = eq(at(low, i - j), min) ? j : k;
      }
      if (cfg.showSupport) {
        lowerLvl = hold(lowerLvl, newLine(i - k, i, min, cfg.bullCss, true));
        brokenSup = false;
      }
      upper.iscrossed = true;
      bullMsCount += 1;
      os = 1;
    } else if (cfg.showSupport && !brokenSup) {
      if (lowerLvl && !lowerLvl.deleted) lowerLvl.x2 = i;
      if (lowerLvl && lt(close, lowerLvl.y)) brokenSup = true;
    }

    // Bearish market structure
    if (bearf) {
      lower.value = low[i - p];
      lower.loc = i - p;
      lower.iscrossed = false;
    }
    if (crossDn(close, lower.value) && !lower.iscrossed) {
      newLine(lower.loc, i, lower.value, cfg.showBear ? cfg.bearCss : 'transparent', false);
      newLabel({
        x: Math.trunc((i + lower.loc) / 2), y: lower.value, text: os === 1 ? 'ChoCH' : 'BOS',
        textColor: cfg.showBear ? cfg.bearCss : 'transparent', style: 'label_up',
      });

      // Set resistance
      let k = 2;
      let max = at(high, i - 1);
      const end = i - lower.loc - 1;
      for (let j = 2; end >= 2 ? j <= end : j >= end; j += end >= 2 ? 1 : -1) {
        max = math.max(at(high, i - j), max) as number;
        k = eq(at(high, i - j), max) ? j : k;
      }
      if (cfg.showResistance) {
        upperLvl = hold(upperLvl, newLine(i - k, i, max, cfg.bearCss, true));
        brokenRes = false;
      }
      lower.iscrossed = true;
      bearMsCount += 1;
      os = -1;
    } else if (cfg.showResistance && !brokenRes) {
      if (upperLvl && !upperLvl.deleted) upperLvl.x2 = i;
      if (upperLvl && gt(close, upperLvl.y)) brokenRes = true;
    }

    if (brokenRes && !brokenRes1) resBreak[i] = bars[i].low;
    if (brokenSup && !brokenSup1) supBreak[i] = bars[i].high;
  }

  // Dashboard: the table always exists; its cells are written when "Show Dashboard" is on
  const tableSize = cfg.textSize === 'Tiny' ? 'tiny' : cfg.textSize === 'Small' ? 'small' : 'normal';
  const cells: TableCellData[] = [];
  if (cfg.showDash && n > 0) {
    cells.push(
      { column: 0, row: 0, text: 'Structure To Fractal %', textColor: '#FFFFFF', textSize: tableSize },
      { column: 0, row: 1, text: 'Bullish', textColor: '#089981', textSize: tableSize },
      { column: 1, row: 1, text: 'Bearish', textColor: '#F23645', textSize: tableSize },
      { column: 0, row: 2, text: str.tostring((bullMsCount / bullfCount) * 100, 'percent'), textColor: '#089981', textSize: tableSize },
      { column: 1, row: 2, text: str.tostring((bearMsCount / bearfCount) * 100, 'percent'), textColor: '#F23645', textSize: tableSize },
    );
  }
  const table: TableData = {
    position: cfg.dashLoc === 'Bottom Left' ? 'bottom_left' : cfg.dashLoc === 'Top Right' ? 'top_right' : 'bottom_right',
    columns: 2,
    rows: 3,
    cells,
    ...(cfg.showDash && n > 0 ? { merges: [{ startColumn: 0, startRow: 0, endColumn: 1, endRow: 0 }] } : {}),
    bgColor: '#1E222D',
    borderColor: '#373A46',
    borderWidth: 1,
    frameColor: '#373A46',
    frameWidth: 1,
  };

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: resBreak[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: supBreak[i] })),
    },
    lines: lines.map((l) => ({
      time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, ...(l.dashed ? { style: 'dashed' as const } : {}),
    })),
    labels: labels.map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor, style: l.style, size: 'tiny' as const,
    })),
    tables: [table],
  };
}

export const MarketStructureChochBos = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
