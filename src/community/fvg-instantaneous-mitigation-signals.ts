/**
 * FVG Instantaneous Mitigation Signals [LuxAlgo]
 *
 * A fair value gap that is mitigated by the very next bar gives a signal. Bullish: the low of 3 bars back is above
 * the high of the previous bar (a bearish gap), the close of 2 bars back is below that low and the current close is
 * back above it. Bearish: the mirrored case. The gap size can be filtered with a multiple of the ATR (200).
 *
 * Each signal draws the gap as a box (3 bars back to the signal bar), a label ("▲" below the low, "▼" above the
 * high) and, with "Average", a dashed line at the middle of the gap that is extended until a close crosses it.
 * Optional take-profit and stop-loss areas (ATR multiples from the middle of the gap) are extended until the price
 * reaches one of them or the opposite signal comes. A trailing stop (ATR multiple from the close) starts on every
 * signal, or only on an inverse signal, and is plotted until a close crosses it. Bars are coloured by the last
 * signal while its trailing stop and its areas are not reached. At most 500 boxes, 500 lines and 500 labels are
 * kept.
 *
 * Reference: "FVG Instantaneous Mitigation Signals [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface FvgInstantaneousMitigationSignalsInputs {
  /** Smallest gap size, as a multiple of the ATR (200) */
  filterWidth: number;
  showTp: boolean;
  tpMult: number;
  tpCss: string;
  showSl: boolean;
  slMult: number;
  slCss: string;
  /** When the trailing stop starts again */
  tsReset: 'Every Signals' | 'Inverse Signals';
  tsMult: number;
  showBull: boolean;
  bullCss: string;
  bullAvg: boolean;
  showBear: boolean;
  bearCss: string;
  bearAvg: boolean;
}

export const defaultInputs: FvgInstantaneousMitigationSignalsInputs = {
  filterWidth: 0,
  showTp: false,
  tpMult: 4,
  tpCss: 'rgba(91, 156, 246, 0.2)',
  showSl: false,
  slMult: 2,
  slCss: 'rgba(120, 123, 134, 0.2)',
  tsReset: 'Every Signals',
  tsMult: 3,
  showBull: true,
  bullCss: '#00897B',
  bullAvg: true,
  showBear: true,
  bearCss: '#F23645',
  bearAvg: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'filterWidth', type: 'float', title: 'FVG Width Filter', defval: 0, min: 0, step: 0.1 },
  { id: 'showTp', type: 'bool', title: 'TP Area', defval: false, inline: 'tp', group: 'TP/SL' },
  { id: 'tpMult', type: 'float', title: 'Multiplier', defval: 4, min: 0, inline: 'tp', group: 'TP/SL' },
  { id: 'tpCss', type: 'color', title: '', defval: 'rgba(91, 156, 246, 0.2)', inline: 'tp', group: 'TP/SL' },
  { id: 'showSl', type: 'bool', title: 'SL Area', defval: false, inline: 'sl', group: 'TP/SL' },
  { id: 'slMult', type: 'float', title: 'Multiplier', defval: 2, min: 0, inline: 'sl', group: 'TP/SL' },
  { id: 'slCss', type: 'color', title: '', defval: 'rgba(120, 123, 134, 0.2)', inline: 'sl', group: 'TP/SL' },
  { id: 'tsReset', type: 'string', title: 'Reset Trailing Stop', defval: 'Every Signals', options: ['Every Signals', 'Inverse Signals'], group: 'Trailing Stop' },
  { id: 'tsMult', type: 'float', title: 'Multiplier', defval: 3, group: 'Trailing Stop' },
  { id: 'showBull', type: 'bool', title: 'Bullish IMFVG', defval: true, inline: 'bull', group: 'Style' },
  { id: 'bullCss', type: 'color', title: '', defval: '#00897B', inline: 'bull', group: 'Style' },
  { id: 'bullAvg', type: 'bool', title: 'Average', defval: true, inline: 'bull', group: 'Style' },
  { id: 'showBear', type: 'bool', title: 'Bearish IMFVG', defval: true, inline: 'bear', group: 'Style' },
  { id: 'bearCss', type: 'color', title: '', defval: '#F23645', inline: 'bear', group: 'Style' },
  { id: 'bearAvg', type: 'bool', title: 'Average', defval: true, inline: 'bear', group: 'Style' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trailing Stop', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'FVG Instantaneous Mitigation Signals [LuxAlgo]',
  shortTitle: 'LuxAlgo - FVG Instantaneous Mitigation Signals',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
  deleted: boolean;
}
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
  style: 'label_up' | 'label_down';
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<FvgInstantaneousMitigationSignalsInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'lines' | 'labels' | 'barColors'> & {
  boxes: BoxData[];
  lines: LineDrawingData[];
  labels: LabelData[];
  barColors: BarColorData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { bullCss, bearCss } = cfg;
  // atr = nz(ta.atr(200))
  const atrArr = ta.atr(bars, 200).toArray().map((v) => (v === null || v === undefined || Number.isNaN(v) ? 0 : v));

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. An object held by a `var` variable of the script (the average lines, the TP / SL areas) is never
  // deleted by this limit, but it counts.
  const held = new Set<object>();
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (held.has(list[k])) k++;
      else list.splice(k, 1)[0].deleted = true;
    }
  };
  /** `variable := object`: the variable holds the new object and releases the one before */
  const hold = <T extends object>(before: T | null, now: T): T => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const boxes: Bx[] = [];
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const newBox = (b: Omit<Bx, 'deleted'>): Bx => {
    const o = { ...b, deleted: false };
    boxes.push(o);
    limit(boxes);
    return o;
  };
  const newLine = (l: Omit<Ln, 'deleted'>): Ln => {
    const o = { ...l, deleted: false };
    lines.push(o);
    limit(lines);
    return o;
  };
  const newLabel = (l: Omit<Lb, 'deleted'>) => {
    labels.push({ ...l, deleted: false });
    limit(labels);
  };

  /** tpsl(): one call site (its own `var` areas and state) */
  const tpsl = (islong: boolean) => {
    let tpArea: Bx | null = null;
    let slArea: Bx | null = null;
    let reached = false;
    return (i: number, condition: boolean, opposite: boolean, level: number, atr: number): boolean => {
      if (condition) {
        if (islong) {
          if (cfg.showTp) tpArea = hold(tpArea, newBox({ left: i, top: level + atr * cfg.tpMult, right: i, bottom: level, bg: cfg.tpCss }));
          if (cfg.showSl) slArea = hold(slArea, newBox({ left: i, top: level, right: i, bottom: level - atr * cfg.slMult, bg: cfg.slCss }));
        } else {
          if (cfg.showTp) tpArea = hold(tpArea, newBox({ left: i, top: level, right: i, bottom: level - atr * cfg.tpMult, bg: cfg.tpCss }));
          if (cfg.showSl) slArea = hold(slArea, newBox({ left: i, top: level + atr * cfg.slMult, right: i, bottom: level, bg: cfg.slCss }));
        }
        reached = false;
      } else if (opposite) {
        reached = true;
      }
      if (!reached) {
        if (tpArea) tpArea.right = i;
        if (slArea) slArea.right = i;
        const { high, low } = bars[i];
        if (islong) {
          if (gt(high, tpArea ? tpArea.top : NaN) || lt(low, slArea ? slArea.bottom : NaN)) reached = true;
        } else if (lt(low, tpArea ? tpArea.bottom : NaN) || gt(high, slArea ? slArea.top : NaN)) {
          reached = true;
        }
      }
      return reached;
    };
  };
  const bullTpsl = tpsl(true);
  const bearTpsl = tpsl(false);

  let bullLine: Ln | null = null;
  let bullLvlReached: boolean | null = null; // var bool = na
  let bearLine: Ln | null = null;
  let bearLvlReached: boolean | null = null;
  let os = 0;
  // trailing_stop()
  let ts = NaN;
  let tsReached = false;

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const barColors: BarColorData[] = [];

  for (let i = 0; i < n; i++) {
    const { high, low, close, time } = bars[i];
    const atr = atrArr[i];
    const low3 = i >= 3 ? bars[i - 3].low : NaN;
    const high3 = i >= 3 ? bars[i - 3].high : NaN;
    const high1 = i >= 1 ? bars[i - 1].high : NaN;
    const low1 = i >= 1 ? bars[i - 1].low : NaN;
    const close2 = i >= 2 ? bars[i - 2].close : NaN;
    const osPrev = i > 0 ? os : NaN;

    // Bullish signal
    const bull = gt(low3, high1) && lt(close2, low3) && gt(close, low3) && gt(low3 - high1, atr * cfg.filterWidth) && cfg.showBull;
    if (bull) {
      newBox({ left: i - 3, top: low3, right: i, bottom: high1, bg: String(color.new(bullCss, 50)) });
      const avg = (low3 + high1) / 2;
      if (cfg.bullAvg) bullLine = hold(bullLine, newLine({ x1: i, x2: i, y: avg, color: bullCss }));
      newLabel({ x: i, y: low, text: '▲', textColor: bullCss, style: 'label_up' });
      os = 1;
      bullLvlReached = false;
    }

    // Bearish signal
    const bear = gt(low1, high3) && gt(close2, high3) && lt(close, high3) && gt(low1 - high3, atr * cfg.filterWidth) && cfg.showBear;
    if (bear) {
      newBox({ left: i - 3, top: low1, right: i, bottom: high3, bg: String(color.new(bearCss, 50)) });
      const avg = (low1 + high3) / 2;
      if (cfg.bearAvg) bearLine = hold(bearLine, newLine({ x1: i, x2: i, y: avg, color: bearCss }));
      newLabel({ x: i, y: high, text: '▼', textColor: bearCss, style: 'label_down' });
      os = 0;
      bearLvlReached = false;
    }

    // Extend the average lines (an na bool is false: `not na` is true)
    if (!bullLvlReached && bullLine) bullLine.x2 = i;
    if (!bearLvlReached && bearLine) bearLine.x2 = i;

    // Test if reached
    if (bullLine && lt(close, bullLine.y)) bullLvlReached = true;
    if (bearLine && gt(close, bearLine.y)) bearLvlReached = true;

    const bullReached = bullTpsl(i, bull, bear, (low3 + high1) / 2, atr);
    const bearReached = bearTpsl(i, bear, bull, (low1 + high3) / 2, atr);

    // Trailing stop (os != os[1] is false on the first bar: os[1] is na)
    const tsResetNow = cfg.tsReset === 'Every Signals' ? bull || bear : !Number.isNaN(osPrev) && os !== osPrev;
    const dist = atr * cfg.tsMult;
    if (tsResetNow) {
      ts = os === 1 ? close - dist : close + dist;
      tsReached = false;
    } else {
      if (os === 1) ts = gt(close - ts, dist) ? close - dist : ts;
      else ts = gt(ts - close, dist) ? close + dist : ts;
      if (lt(close, ts) && os === 1) tsReached = true;
      else if (gt(close, ts) && os === 0) tsReached = true;
    }

    // barcolor(ts_reached ? na : os == 1 and not bull_reached ? bullCss : os == 0 and not bear_reached ? bearCss : na)
    if (!tsReached) {
      if (os === 1 && !bullReached) barColors.push({ time, color: bullCss });
      else if (os === 0 && !bearReached) barColors.push({ time, color: bearCss });
    }
    // plot(ts, 'Trailing Stop', ts_reached or bull or bear ? na : os ? bullCss : bearCss)
    plot0.push({ time, value: ts, color: tsReached || bull || bear ? 'transparent' : os ? bullCss : bearCss });
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    barColors,
    boxes: boxes.map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg, borderColor: 'transparent',
    })),
    lines: lines.map((l) => ({ time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, style: 'dashed' as const })),
    labels: labels.map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor, style: l.style, size: 'small' as const,
    })),
  };
}

export const FvgInstantaneousMitigationSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
