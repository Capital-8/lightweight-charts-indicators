/**
 * Higher High Lower Low Strategy
 *
 * Pivot highs and lows ("Left Bars" / "Right Bars") are filtered into a zigzag-like sequence: of two pivots of the
 * same kind in a row the less extreme one is dropped, and a pivot that does not pass the previous opposite pivot is
 * dropped too. Each kept pivot is compared with the four pivots before it (alternating kinds) and gets a label:
 * HH (higher high), LL (lower low), HL (higher low) or LH (lower high), drawn on the pivot bar.
 *
 * Resistance is the last lower high and support the last higher low. The trend is up when the close is above the
 * resistance, down when it is below the support. In an up trend a higher high moves the resistance and a higher low
 * the support; in a down trend a lower high and a lower low do. Each new level is a line from the pivot bar,
 * extended to the right until the level changes again (at most 500 lines are kept). The bars are coloured by the
 * trend.
 *
 * Reference: "Higher High Lower Low Strategy" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeThecolor.blue
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface HigherHighLowerLowStrategyInputs {
  /** Bars on the left of a pivot */
  lb: number;
  /** Bars on the right of a pivot */
  rb: number;
  showSupRes: boolean;
  supCol: string;
  resCol: string;
  srLineStyle: 'sol' | 'dsh' | 'dot';
  srLineWidth: number;
  changeBarCol: boolean;
  bColUp: string;
  bColDn: string;
}

// Colour constants of Pine version 4
const LIME = '#00E676';
const RED = '#FF5252';
const BLUE = '#2196F3';
const BLACK = '#363A45';
const WHITE = '#FFFFFF';

export const defaultInputs: HigherHighLowerLowStrategyInputs = {
  lb: 5,
  rb: 5,
  showSupRes: true,
  supCol: LIME,
  resCol: RED,
  srLineStyle: 'dot',
  srLineWidth: 3,
  changeBarCol: true,
  bColUp: BLUE,
  bColDn: BLACK,
};

export const inputConfig: InputConfig[] = [
  { id: 'lb', type: 'int', title: 'Left Bars', defval: 5, min: 1 },
  { id: 'rb', type: 'int', title: 'Right Bars', defval: 5, min: 1 },
  { id: 'showSupRes', type: 'bool', title: 'Support/Resistance', defval: true, inline: 'srcol' },
  { id: 'supCol', type: 'color', title: '', defval: LIME, inline: 'srcol' },
  { id: 'resCol', type: 'color', title: '', defval: RED, inline: 'srcol' },
  { id: 'srLineStyle', type: 'string', title: 'Line Style/Width', defval: 'dot', options: ['sol', 'dsh', 'dot'], inline: 'style' },
  { id: 'srLineWidth', type: 'int', title: '', defval: 3, min: 1, max: 5, inline: 'style' },
  { id: 'changeBarCol', type: 'bool', title: 'Change Bar Color', defval: true, inline: 'bcol' },
  { id: 'bColUp', type: 'color', title: '', defval: BLUE, inline: 'bcol' },
  { id: 'bColDn', type: 'color', title: '', defval: BLACK, inline: 'bcol' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Higher High Lower Low Strategy',
  shortTitle: 'Higher High Lower Low Strategy',
  overlay: true,
};

/** study(max_lines_count = 500) */
const MAX_LINES = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => gt(a, b) || eq(a, b);
const le = (a: number, b: number) => lt(a, b) || eq(a, b);
const ne = (a: number, b: number) => gt(a, b) || lt(a, b);
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  extendRight: boolean;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<HigherHighLowerLowStrategyInputs> = {},
): Omit<IndicatorResult, 'markers' | 'barColors' | 'lines'> & { markers: MarkerData[]; barColors: BarColorData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lb = Math.trunc(cfg.lb);
  const rb = Math.trunc(cfg.rb);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const phArr = A(ta.pivothigh(new Series(bars, (b) => b.high), lb, rb));
  const plArr = A(ta.pivotlow(new Series(bars, (b) => b.low), lb, rb));

  // valuewhen(x, x, 1) of each call of the script: the value before the latest one (the latest can be the current
  // bar). Each call has its own history, taken where the script calls it.
  const history = () => {
    const list: number[] = [];
    return (v: number) => {
      if (truthy(v)) list.push(v);
      return list.length > 1 ? list[list.length - 2] : NaN;
    };
  };
  const rawDirection = history();
  const rawPivot = history();
  const pivotAfterLows = history();
  const pivotAfterHighs = history();
  const directionAfterLows = history();

  const hlArr: number[] = new Array(n).fill(NaN); // direction of the kept pivot: 1 high, -1 low
  const zzArr: number[] = new Array(n).fill(NaN); // price of the kept pivot
  /** x[k] of a variable; na before the first bar */
  const past = (arr: number[], i: number, k: number) => (i - k >= 0 && k >= 0 ? arr[i - k] : NaN);

  // findprevious(): the four pivots before the current one, of alternating kinds (0 when there is none)
  const findPrevious = (i: number): [number, number, number, number] => {
    const hl = hlArr[i];
    const locs: [number, number, number, number] = [0, 0, 0, 0];
    let xx = 0;
    const scan = (from: number, kind: number, slot: number, keep: boolean) => {
      // `for x = from to 1000` counts down when from is above 1000
      const step = from <= 1000 ? 1 : -1;
      for (let x = from; step > 0 ? x <= 1000 : x >= 1000; x += step) {
        const z = past(zzArr, i, x);
        if (past(hlArr, i, x) === kind && !isNaN(z)) {
          locs[slot] = z;
          if (keep) xx = x + 1;
          break;
        }
      }
    };
    const other = hl === 1 ? -1 : 1;
    scan(1, other, 0, true);
    scan(xx, hl, 1, true);
    scan(xx, other, 2, true);
    scan(xx, hl, 3, false);
    return locs;
  };

  // Live lines in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain. The two lines held by the `var` variables of the script are never deleted by this limit, but they count.
  const lines: Ln[] = [];
  let resLine: Ln | null = null;
  let supLine: Ln | null = null;
  const newLine = (x1: number, x2: number, y: number, css: string): Ln => {
    const o: Ln = { x1, x2, y, color: css, extendRight: true, deleted: false };
    lines.push(o);
    if (lines.length > MAX_LINES + 5) {
      for (let k = 0; k < lines.length && lines.length > MAX_LINES; ) {
        if (lines[k] === resLine || lines[k] === supLine) k++;
        else lines.splice(k, 1)[0].deleted = true;
      }
    }
    return o;
  };

  const interval = barInterval(bars);
  const T = (i: number) => barTime(bars, i, interval);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  let res = NaN;
  let sup = NaN;
  let trend = NaN;

  for (let i = 0; i < n; i++) {
    const ph = phArr[i];
    const pl = plArr[i];
    let hl = truthy(ph) ? 1 : truthy(pl) ? -1 : NaN;
    let zz = truthy(ph) ? ph : truthy(pl) ? pl : NaN;

    const prevDirection = rawDirection(hl);
    // A low after a low: the higher one is dropped. A high after a high: the lower one is dropped.
    const prevRaw = rawPivot(zz);
    if (truthy(pl) && hl === -1 && prevDirection === -1 && gt(pl, prevRaw)) zz = NaN;
    const beforeHighs = pivotAfterLows(zz);
    if (truthy(ph) && hl === 1 && prevDirection === 1 && lt(ph, beforeHighs)) zz = NaN;

    const prevPivot = pivotAfterHighs(zz);
    if (hl === -1 && prevDirection === 1 && gt(zz, prevPivot)) hl = NaN;
    const prevKept = directionAfterLows(hl);
    if (hl === 1 && prevKept === -1 && lt(zz, prevPivot)) hl = NaN;
    if (isNaN(hl)) zz = NaN;
    hlArr[i] = hl;
    zzArr[i] = zz;

    let a = NaN, b = NaN, c = NaN, d = NaN, e = NaN;
    if (!isNaN(hl)) {
      [b, c, d, e] = findPrevious(i);
      a = zz;
    }
    const on = truthy(zz);
    const isHH = on && gt(a, b) && gt(a, c) && gt(c, b) && gt(c, d);
    const isLL = on && lt(a, b) && lt(a, c) && lt(c, b) && lt(c, d);
    const isHL = on && ((ge(a, c) && gt(b, c) && gt(b, d) && gt(d, c) && gt(d, e)) || (lt(a, b) && gt(a, c) && lt(b, d)));
    const isLH = on && ((le(a, c) && lt(b, c) && lt(b, d) && lt(d, c) && lt(d, e)) || (gt(a, b) && lt(a, c) && gt(b, d)));

    // plotshape(..., offset = -rb): drawn on the pivot bar
    if (i - rb >= 0) {
      const time = T(i - rb);
      if (isHL) markers.push({ time, position: 'belowBar', shape: 'labelUp', color: LIME, text: 'HL', textColor: BLACK });
      if (isHH) markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: LIME, text: 'HH', textColor: BLACK });
      if (isLL) markers.push({ time, position: 'belowBar', shape: 'labelUp', color: RED, text: 'LL', textColor: WHITE });
      if (isLH) markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'LH', textColor: WHITE });
    }

    const prevRes = res;
    const prevSup = sup;
    if (isLH) res = zz;
    if (isHL) sup = zz;
    const close = bars[i].close;
    trend = gt(close, res) ? 1 : lt(close, sup) ? -1 : (isNaN(trend) ? 0 : trend);
    if ((trend === 1 && isHH) || (trend === -1 && isLH)) res = zz;
    if ((trend === 1 && isHL) || (trend === -1 && isLL)) sup = zz;

    if (cfg.showSupRes) {
      if (ne(res, prevRes)) {
        if (resLine && !resLine.deleted) {
          resLine.x2 = i;
          resLine.extendRight = false;
        }
        resLine = newLine(i - rb, i, res, cfg.resCol);
      }
      if (ne(sup, prevSup)) {
        if (supLine && !supLine.deleted) {
          supLine.x2 = i;
          supLine.extendRight = false;
        }
        supLine = newLine(i - rb, i, sup, cfg.supCol);
      }
    }

    if (cfg.changeBarCol) barColors.push({ time: bars[i].time, color: trend === 1 ? cfg.bColUp : cfg.bColDn });
  }

  const style = cfg.srLineStyle === 'sol' ? 'solid' : cfg.srLineStyle === 'dsh' ? 'dashed' : 'dotted';
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    lines: lines.map((l) => ({
      time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, style, width: cfg.srLineWidth,
      extend: l.extendRight ? 'right' as const : 'none' as const,
    })),
  };
}

export const HigherHighLowerLowStrategy = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
