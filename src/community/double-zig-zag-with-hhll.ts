/**
 * Double Zig Zag with HHLL
 *
 * Two zig zags with their own period. A bar is a pivot high when its high is the highest of the period, a pivot low
 * when its low is the lowest. The direction turns up on a pivot high (without a pivot low on the same bar) and down
 * on a pivot low. A change of direction adds a point to the zig zag; a more extreme pivot in the same direction
 * moves the last point. Each zig zag keeps its last 5 points.
 *
 * Drawings (when a zig zag has at least 3 points and its last point changed): a line from the last point to the
 * point before (the line of a moved point is replaced), and a label at the last point: HH / LH on a high, LL / HL on
 * a low, compared with the point two steps back. At most 50 lines and 50 labels are kept (the oldest are removed).
 *
 * Reference: "Double Zig Zag with HHLL" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';

export interface DoubleZigZagWithHhllInputs {
  prd1: number;
  prd2: number;
  showzz: 'Show Zig Zag 1' | 'Show Zig Zag 2' | 'Show Both' | 'Show None';
  showhhll: 'Show HHLL 1' | 'Show HHLL 2' | 'Show Both' | 'Show None';
  upcol1: string;
  dncol1: string;
  upcol2: string;
  dncol2: string;
  txtcol: string;
  zz1style: 'Dashed' | 'Dotted';
  zz1width: number;
  zz2width: number;
}

export const defaultInputs: DoubleZigZagWithHhllInputs = {
  prd1: 8,
  prd2: 20,
  showzz: 'Show Both',
  showhhll: 'Show Both',
  upcol1: '#00E676',
  dncol1: '#FF5252',
  upcol2: '#2196F3',
  dncol2: '#9C27B0',
  txtcol: '#363A45',
  zz1style: 'Dashed',
  zz1width: 2,
  zz2width: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'prd1', type: 'int', title: 'ZigZag Period 1', defval: 8, min: 2, max: 20 },
  { id: 'prd2', type: 'int', title: 'ZigZag Period 2', defval: 20, min: 2, max: 50 },
  { id: 'showzz', type: 'string', title: 'Show Zig Zags', defval: 'Show Both',
    options: ['Show Zig Zag 1', 'Show Zig Zag 2', 'Show Both', 'Show None'] },
  { id: 'showhhll', type: 'string', title: 'Show HHLL', defval: 'Show Both',
    options: ['Show HHLL 1', 'Show HHLL 2', 'Show Both', 'Show None'] },
  { id: 'upcol1', type: 'color', title: 'Zig Zag 1 Up Color', defval: '#00E676' },
  { id: 'dncol1', type: 'color', title: 'Zig Zag 1 Down Color', defval: '#FF5252' },
  { id: 'upcol2', type: 'color', title: 'Zig Zag 2 Up Color', defval: '#2196F3' },
  { id: 'dncol2', type: 'color', title: 'Zig Zag 2 Down Color', defval: '#9C27B0' },
  { id: 'txtcol', type: 'color', title: 'Text Color', defval: '#363A45' },
  { id: 'zz1style', type: 'string', title: 'Zig Zag 1 Line Style', defval: 'Dashed', options: ['Dashed', 'Dotted'] },
  { id: 'zz1width', type: 'int', title: 'Zig zag 1 Line Width', defval: 2, min: 1, max: 4 },
  { id: 'zz2width', type: 'int', title: 'Zig zag 2 Line Width', defval: 3, min: 1, max: 6 },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Double Zig Zag with HHLL',
  shortTitle: 'Double Zig Zag with HHLL',
  overlay: true,
};

/** Default max_lines_count / max_labels_count of study() */
const MAX_OBJECTS = 50;
/** A [5, 2] matrix: 5 points as value, bar index */
const MAX_ARRAY_SIZE = 10;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** A float read as a bool: na and 0 are false */
const truthy = (x: number) => !isNaN(x) && x !== 0;

interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; width: number; style: 'solid' | 'dashed' | 'dotted'; deleted: boolean }
interface Lb { x: number; y: number; text: string; color: string; style: 'label_down' | 'label_up'; deleted: boolean }

export function calculate(
  bars: Bar[],
  inputs: Partial<DoubleZigZagWithHhllInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. An object held by a `var` variable of the script is never deleted by this limit, but it counts.
  const held = new Set<object>();
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (held.has(list[k])) k++;
      else list.splice(k, 1)[0].deleted = true;
    }
  };
  const hold = <T extends object>(before: T | null, now: T): T => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const remove = <T extends { deleted: boolean }>(list: T[], o: T | null) => {
    if (o && !o.deleted) {
      o.deleted = true;
      list.splice(list.indexOf(o), 1);
    }
  };

  /** One zig zag */
  const zigzag = (prd: number, upcol: string, dncol: string, showLine: boolean, showLabel: boolean, width: number,
    style: Ln['style']) => {
    const hb = ta.highestbars(highSeries, prd).toArray();
    const lb = ta.lowestbars(lowSeries, prd).toArray();
    let dir = 0;
    let prevDir = NaN;
    const zz: number[] = [];
    let zzline: Ln | null = null;
    let zzlabel: Lb | null = null;

    const add = (value: number, bindex: number) => {
      zz.unshift(bindex);
      zz.unshift(value);
      if (zz.length > MAX_ARRAY_SIZE) {
        zz.pop();
        zz.pop();
      }
    };

    return (i: number) => {
      const ph = hb[i] === 0 ? bars[i].high : NaN;
      const pl = lb[i] === 0 ? bars[i].low : NaN;
      dir = truthy(ph) && isNaN(pl) ? 1 : truthy(pl) && isNaN(ph) ? -1 : dir;
      const old = zz.slice();

      // change(dir): na on the first bar
      const dirChanged = dir - prevDir;
      prevDir = dir;
      if (truthy(ph) || truthy(pl)) {
        const value = dir === 1 ? ph : pl;
        if (truthy(dirChanged)) {
          add(value, i);
        } else if (zz.length === 0) {
          add(value, i);
        } else if ((dir === 1 && gt(value, zz[0])) || (dir === -1 && lt(value, zz[0]))) {
          zz[0] = value;
          zz[1] = i;
        }
      }

      if (zz.length >= 6) {
        if (ne(zz[0], old[0]) || ne(zz[1], old[1])) {
          if (eq(zz[2], old[2]) && eq(zz[3], old[3])) {
            remove(lines, zzline);
            remove(labels, zzlabel);
          }
          if (showLine) {
            const l: Ln = {
              x1: Math.round(zz[1]), y1: zz[0], x2: Math.round(zz[3]), y2: zz[2], color: dir === 1 ? upcol : dncol,
              width, style, deleted: false,
            };
            lines.push(l);
            zzline = hold(zzline, l);
            limit(lines);
          }
          if (showLabel) {
            const text = dir === 1 ? (gt(zz[0], zz[4]) ? 'HH' : 'LH') : lt(zz[0], zz[4]) ? 'LL' : 'HL';
            const labelcol = dir === 1 ? (gt(zz[0], zz[4]) ? upcol : dncol) : lt(zz[0], zz[4]) ? dncol : upcol;
            const l: Lb = {
              x: Math.round(zz[1]), y: zz[0], text, color: labelcol, style: dir === 1 ? 'label_down' : 'label_up',
              deleted: false,
            };
            labels.push(l);
            zzlabel = hold(zzlabel, l);
            limit(labels);
          }
        }
      }
    };
  };

  const one = cfg.showzz === 'Show Zig Zag 1' || cfg.showzz === 'Show Both';
  const two = cfg.showzz === 'Show Zig Zag 2' || cfg.showzz === 'Show Both';
  const hhll1 = cfg.showhhll === 'Show HHLL 1' || cfg.showhhll === 'Show Both';
  const hhll2 = cfg.showhhll === 'Show HHLL 2' || cfg.showhhll === 'Show Both';
  const zz1 = zigzag(cfg.prd1, cfg.upcol1, cfg.dncol1, one, hhll1, cfg.zz1width,
    cfg.zz1style === 'Dashed' ? 'dashed' : 'dotted');
  const zz2 = zigzag(cfg.prd2, cfg.upcol2, cfg.dncol2, two, hhll2, cfg.zz2width, 'solid');
  for (let i = 0; i < n; i++) {
    zz1(i);
    zz2(i);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: lines.map((l) => ({
      time1: bars[l.x1].time, price1: l.y1, time2: bars[l.x2].time, price2: l.y2, color: l.color, width: l.width,
      ...(l.style !== 'solid' ? { style: l.style } : {}),
    })),
    labels: labels.map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.text, color: l.color, textColor: cfg.txtcol, style: l.style,
    })),
  };
}

export const DoubleZigZagWithHhll = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
