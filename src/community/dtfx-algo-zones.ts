/**
 * DTFX Algo Zones [LuxAlgo]
 *
 * Swing points: a high that is above the highs of the `Structure Length` bars after it (when the last swing was not
 * a high) is a swing high; a low below the lows of the bars after it is a swing low. They are marked with a circle,
 * `Structure Length` bars back.
 *
 * Market structure shifts: a close that crosses above the last swing high (or below the last swing low) is a break of
 * structure, or a change of character when the trend was the other way and the bar makes the highest high (lowest
 * low) of the window. Each shift draws a zone (box) from the broken swing to the break bar, between the swing price
 * and the opposite extreme, and up to 5 Fibonacci levels of that range (lines). The levels of the latest zone are
 * extended to the current bar. "Clean-Up Level Overlap" cuts the levels of the zone before where the new zone starts.
 *
 * At most 500 boxes and 500 lines are kept.
 *
 * Reference: "DTFX Algo Zones [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';

type FibStyle = '___' | '- - -' | '. . .';

export interface DtfxAlgoZonesInputs {
  structureTog: boolean;
  structureLen: number;
  zoneDispNum: number;
  dispAll: boolean;
  zoneFilter: 'Bullish Only' | 'Bearish Only' | 'Both';
  noOverlap: boolean;
  f1Tog: boolean;
  f2Tog: boolean;
  f3Tog: boolean;
  f4Tog: boolean;
  f5Tog: boolean;
  f1Lvl: number;
  f2Lvl: number;
  f3Lvl: number;
  f4Lvl: number;
  f5Lvl: number;
  f1Style: FibStyle;
  f2Style: FibStyle;
  f3Style: FibStyle;
  f4Style: FibStyle;
  f5Style: FibStyle;
  f1BullColor: string;
  f2BullColor: string;
  f3BullColor: string;
  f4BullColor: string;
  f5BullColor: string;
  f1BearColor: string;
  f2BearColor: string;
  f3BearColor: string;
  f4BearColor: string;
  f5BearColor: string;
  structureColor: string;
  bullZoneColor: string;
  bearZoneColor: string;
}

const BULL = '#089981';
const BEAR = '#f23645';

export const defaultInputs: DtfxAlgoZonesInputs = {
  structureTog: true,
  structureLen: 10,
  zoneDispNum: 1,
  dispAll: true,
  zoneFilter: 'Both',
  noOverlap: true,
  f1Tog: false,
  f2Tog: true,
  f3Tog: true,
  f4Tog: true,
  f5Tog: false,
  f1Lvl: 0,
  f2Lvl: 0.3,
  f3Lvl: 0.5,
  f4Lvl: 0.7,
  f5Lvl: 1,
  f1Style: '. . .',
  f2Style: '- - -',
  f3Style: '___',
  f4Style: '- - -',
  f5Style: '. . .',
  f1BullColor: BULL,
  f2BullColor: BULL,
  f3BullColor: BULL,
  f4BullColor: BULL,
  f5BullColor: BULL,
  f1BearColor: BEAR,
  f2BearColor: BEAR,
  f3BearColor: BEAR,
  f4BearColor: BEAR,
  f5BearColor: BEAR,
  structureColor: '#787B86',
  bullZoneColor: 'rgba(8, 153, 129, 0.2)',
  bearZoneColor: 'rgba(242, 54, 69, 0.2)',
};

const FIB_GROUP = '              Fib Levels                    Line Style                 Bull | Bear';
const STYLES = ['___', '- - -', '. . .'];
const LEVELS = [1, 2, 3, 4, 5] as const;

export const inputConfig: InputConfig[] = [
  { id: 'structureTog', type: 'bool', title: 'Show Swing Points', defval: true, group: 'Structure' },
  { id: 'structureLen', type: 'int', title: 'Structure Length', defval: 10, group: 'Structure' },
  { id: 'zoneDispNum', type: 'int', title: 'Show Last', defval: 1, min: 0, group: 'Zones' },
  {
    id: 'dispAll', type: 'bool', title: 'Display All Zones', defval: true, group: 'Zones',
    tooltip: 'Ignores Zone Display # and Displays all Possible Zones.',
  },
  { id: 'zoneFilter', type: 'string', title: 'Zone Display', defval: 'Both', options: ['Bullish Only', 'Bearish Only', 'Both'], group: 'Zones' },
  { id: 'noOverlap', type: 'bool', title: 'Clean-Up Level Overlap', defval: true, group: 'Zones' },
  ...LEVELS.map((k): InputConfig => ({
    id: `f${k}Tog`, type: 'bool', title: '', defval: defaultInputs[`f${k}Tog`], group: FIB_GROUP, inline: String(k),
  })),
  ...LEVELS.map((k): InputConfig => ({
    id: `f${k}Lvl`, type: 'float', title: '', defval: defaultInputs[`f${k}Lvl`], group: FIB_GROUP, inline: String(k),
  })),
  ...LEVELS.map((k): InputConfig => ({
    id: `f${k}Style`, type: 'string', title: '', defval: defaultInputs[`f${k}Style`], options: STYLES, group: FIB_GROUP, inline: String(k),
  })),
  ...LEVELS.map((k): InputConfig => ({
    id: `f${k}BullColor`, type: 'color', title: '', defval: BULL, group: FIB_GROUP, inline: String(k),
  })),
  ...LEVELS.map((k): InputConfig => ({
    id: `f${k}BearColor`, type: 'color', title: '', defval: BEAR, group: FIB_GROUP, inline: String(k),
  })),
  { id: 'structureColor', type: 'color', title: 'Structure Color', defval: '#787B86', group: 'Style' },
  { id: 'bullZoneColor', type: 'color', title: 'Bullish Zone Color', defval: 'rgba(8, 153, 129, 0.2)', group: 'Style' },
  { id: 'bearZoneColor', type: 'color', title: 'Bearish Zone Color', defval: 'rgba(242, 54, 69, 0.2)', group: 'Style' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'DTFX Algo Zones [LuxAlgo]',
  shortTitle: 'LuxAlgo - DTFX Algo Zones',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  deleted: boolean;
}
interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
  deleted: boolean;
}

const lineStyle = (s: string): 'solid' | 'dashed' | 'dotted' => (s === '- - -' ? 'dashed' : s === '. . .' ? 'dotted' : 'solid');

export function calculate(
  bars: Bar[],
  inputs: Partial<DtfxAlgoZonesInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'lines' | 'markers'> & { boxes: BoxData[]; lines: LineDrawingData[]; markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.structureLen);
  // fNLvl = fNTog ? input.float(...) : na
  const toggles = LEVELS.map((k) => cfg[`f${k}Tog`]);
  const levels = LEVELS.map((k, j) => (toggles[j] ? cfg[`f${k}Lvl`] : NaN));
  const styles = LEVELS.map((k) => lineStyle(cfg[`f${k}Style`]));
  const bullColors = LEVELS.map((k) => cfg[`f${k}BullColor`]);
  const bearColors = LEVELS.map((k) => cfg[`f${k}BearColor`]);

  const upper = ta.highest(new Series(bars, (b) => b.high), len).toArray();
  const lower = ta.lowest(new Series(bars, (b) => b.low), len).toArray();

  // Drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain. A deleted object ignores later changes and its getters give na.
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length > MAX_OBJECTS + 5) for (const o of list.splice(0, list.length - MAX_OBJECTS)) o.deleted = true;
  };
  const remove = <T extends { deleted: boolean }>(list: T[], o: T) => {
    if (o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };
  const lines: Ln[] = [];
  const boxes: Bx[] = [];
  const newLine = (l: Omit<Ln, 'deleted'>): Ln => {
    const o = { ...l, deleted: false };
    lines.push(o);
    limit(lines);
    return o;
  };

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const markers: MarkerData[] = [];

  let dir = 0;
  let tPrice = NaN;
  let tBar = NaN;
  let bPrice = NaN;
  let bBar = NaN;
  let bosUpCheck = false;
  let bosDownCheck = false;
  let tDir = 0;
  const zones: Bx[] = [];
  const lvls: Ln[][] = [];
  let liveZone: Bx | null = null;
  let liveLvls: Ln[] = [];
  const crossUp = callsite.crossover();
  const crossDown = callsite.crossunder();

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const back = i >= len ? bars[i - len] : null;
    const up = upper[i] ?? NaN;
    const lo = lower[i] ?? NaN;
    let top = NaN;
    let btm = NaN;
    if (dir >= 0 && back && gt(back.high, up)) {
      dir = -1;
      top = back.high;
    }
    if (dir <= 0 && back && lt(back.low, lo)) {
      dir = 1;
      btm = back.low;
    }

    let structureConfirmed = 0;
    if (!isNaN(top)) {
      tPrice = top;
      tBar = i - len;
      bosUpCheck = true;
      if (cfg.structureTog) structureConfirmed = 1;
    }
    if (!isNaN(btm)) {
      bPrice = btm;
      bBar = i - len;
      bosDownCheck = true;
      if (cfg.structureTog) structureConfirmed = -1;
    }
    // plotshape(..., offset = -structureLen): the shape of bar i is drawn on bar i - structureLen
    if (structureConfirmed > 0) {
      markers.push({ time: T(i - len), position: 'aboveBar', shape: 'circle', color: cfg.structureColor });
    } else if (structureConfirmed < 0) {
      markers.push({ time: T(i - len), position: 'belowBar', shape: 'circle', color: cfg.structureColor });
    }

    const crossedUp = crossUp(bar.close, tPrice);
    const crossedDown = crossDown(bar.close, bPrice);
    const chochUp = crossedUp && eq(bar.high, up) && tDir <= 0;
    const chochDown = crossedDown && eq(bar.low, lo) && tDir >= 0;
    if (chochUp) tDir = 1;
    if (chochDown) tDir = -1;
    const bosUp = crossedUp && bosUpCheck && tDir >= 0;
    const bosDown = crossedDown && bosDownCheck && tDir <= 0;

    const zone = (bull: boolean) => {
      const zTop = bull ? tPrice : dir === 1 ? up : dir === -1 ? tPrice : 0;
      const zBot = bull ? (dir === -1 ? lo : dir === 1 ? bPrice : 0) : bPrice;
      // get_fibs()
      const rng = bull ? zTop - zBot : zBot - zTop;
      const anchor = bull ? zBot : zTop;
      const x1 = bull ? tBar : bBar;
      liveZone = { left: x1, top: zTop, right: i, bottom: zBot, bg: bull ? cfg.bullZoneColor : cfg.bearZoneColor, deleted: false };
      boxes.push(liveZone);
      limit(boxes);
      liveLvls = levels.map((lvl, j) => {
        const fib = anchor + rng * lvl;
        return newLine({ x1, y1: toggles[j] ? fib : NaN, x2: i, y2: fib, color: (bull ? bullColors : bearColors)[j], style: styles[j] });
      });
      zones.push(liveZone);
      lvls.push(liveLvls);
    };

    if (bosUp || chochUp) {
      bosUpCheck = false;
      if (cfg.zoneFilter !== 'Bearish Only') zone(true);
    }
    if (bosDown || chochDown) {
      bosDownCheck = false;
      if (cfg.zoneFilter !== 'Bullish Only') zone(false);
    }

    if (zones.length > cfg.zoneDispNum && !cfg.dispAll) {
      remove(boxes, zones.shift()!);
      for (const l of lvls.shift()!) remove(lines, l);
    }

    if (lvls.length > 1 && cfg.noOverlap) {
      const lastZone = zones[zones.length - 2];
      const lastLvl = lvls[lvls.length - 2];
      const x2 = lastLvl[0].deleted ? NaN : lastLvl[0].x2;
      const x1 = liveLvls[0].deleted ? NaN : liveLvls[0].x1;
      if (x2 > x1) {
        const cut = Math.max(liveZone!.deleted ? NaN : liveZone!.left, lastZone.deleted ? NaN : lastZone.right);
        for (const l of lastLvl) if (!l.deleted) l.x2 = cut;
        for (const l of liveLvls) if (!l.deleted) l.x1 = cut;
      }
    }

    for (const l of liveLvls) if (!l.deleted) l.x2 = i;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // a line with an na coordinate (a level that is switched off) is not drawn
    lines: lines.filter((l) => !isNaN(l.x1) && !isNaN(l.x2) && !isNaN(l.y1) && !isNaN(l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color,
      ...(l.style !== 'solid' ? { style: l.style } : {}),
    })),
    boxes: boxes.filter((b) => !isNaN(b.left) && !isNaN(b.top) && !isNaN(b.bottom)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg, borderColor: 'transparent',
    })),
  };
}

export const DtfxAlgoZones = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
