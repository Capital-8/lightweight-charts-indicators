/**
 * Premium & Discount Delta Volume [BigBeluga]
 *
 * Drawn on the last bar only. Over the last "Premium & Discount Lookback Period" bars: a premium box from the highest
 * high up by 0.8 times the 200-bar ATR, a discount box from the lowest low down by the same amount, an equilibrium
 * line halfway between them and a middle box with the delta volume. Over the last "Macro Lookback Period" bars: the
 * same premium and discount boxes (filled). The boxes run from the start of their period to 50 (or 70) bars after
 * the last bar.
 *
 * Volume: each bar of the period with a close above its open adds its volume to the positive side, each bar with a
 * close below its open adds minus its volume to the negative side (one slot per bar, 0 for the other bars). Delta
 * volume = (average negative / average positive + 1) * 100, capped to [-100, 100]. The discount boxes show the sum
 * of the positive side, the premium boxes the sum of the negative side; a table shows the macro delta volume.
 * Text colours use the chart foreground colour (chart context; dark theme colour without it).
 *
 * Reference: "Premium & Discount Delta Volume [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, str, math, array, color, box, line, table, resetDrawings, setDrawingBar, drawingOutputs,
  type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LineDrawingData, TableData } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface PremiumDiscountDeltaVolumeInputs {
  /** Show the premium / discount levels */
  showSR: boolean;
  /** Premium & Discount Lookback Period */
  srPeriod: number;
  /** Show the macro highs / lows */
  showMacro: boolean;
  /** Macro Lookback Period */
  macroPeriod: number;
  /** Discount colour */
  upColor: string;
  /** Premium colour */
  downColor: string;
}

export const defaultInputs: PremiumDiscountDeltaVolumeInputs = {
  showSR: true,
  srPeriod: 50,
  showMacro: true,
  macroPeriod: 200,
  upColor: '#79c1f1',
  downColor: '#f19579',
};

export const inputConfig: InputConfig[] = [
  { id: 'showSR', type: 'bool', title: '', defval: true, inline: '0' },
  { id: 'srPeriod', type: 'int', title: 'Premium & Discount Lookback Period', defval: 50, min: 10, step: 10, inline: '0' },
  { id: 'showMacro', type: 'bool', title: '', defval: true, inline: '1' },
  { id: 'macroPeriod', type: 'int', title: 'Macro Lookback Period', defval: 200, min: 10, step: 10, inline: '1' },
  { id: 'upColor', type: 'color', title: 'Discount', defval: '#79c1f1', inline: 'col', group: 'Color' },
  { id: 'downColor', type: 'color', title: 'Premium', defval: '#f19579', inline: 'col', group: 'Color' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Premium & Discount Delta Volume [BigBeluga]',
  shortTitle: 'Premium & Discount Delta Volume [BigBeluga]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<PremiumDiscountDeltaVolumeInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines' | 'tables'> & { boxes: BoxData[]; lines: LineDrawingData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { showSR, showMacro, upColor, downColor } = cfg;
  const srPeriod = Math.trunc(cfg.srPeriod);
  const macroPeriod = Math.trunc(cfg.macroPeriod);
  const fg = foregroundColorOf(chart);
  const atr = ta.atr(bars, 200).toArray().map((v) => (v ?? NaN) * 0.8);

  // indicator(max_lines_count = 2, max_boxes_count = 3)
  resetDrawings({ line: 2, box: 3 });
  const empty = { metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay }, plots: {} };
  if (n === 0) return { ...empty, boxes: [], lines: [], tables: [] };

  // Every bar before the last one clears the high / low arrays (the `else` branches), and the boxes stay na until
  // the last bar: only the last bar draws.
  const last = n - 1;
  setDrawingBar(last, true);
  const atrValue = atr[last];
  const highAt = (k: number) => (last - k >= 0 ? bars[last - k].high : NaN);
  const lowAt = (k: number) => (last - k >= 0 ? bars[last - k].low : NaN);

  /** The pushes of the last bar and the delta volume of one period */
  const period = (len: number) => {
    const highs = array.new_float(0);
    const lows = array.new_float(0);
    const pos = array.new_float(len, 0);
    const neg = array.new_float(len, 0);
    for (let k = 0; k <= len - 1; k++) {
      array.push(highs, highAt(k));
      array.push(lows, lowAt(k));
      const b = last - k >= 0 ? bars[last - k] : null;
      if (b && gt(b.close, b.open)) array.set(pos, k, b.volume ?? NaN);
      if (b && lt(b.close, b.open)) array.set(neg, k, -(b.volume ?? NaN));
    }
    let delta = (array.avg(neg) / array.avg(pos) + 1) * 100;
    delta = math.min(math.max(delta, -100), 100) as number;
    return { highs, lows, pos, neg, delta };
  };
  const sr = showSR ? period(srPeriod) : null;
  const macro = showMacro ? period(macroPeriod) : null;

  const srStart = last - srPeriod;
  const srEnd = last + 50;
  const macroStart = last - macroPeriod;
  const macroEnd = last + 70;
  let srLower: Box | undefined;
  let srUpper: Box | undefined;
  let macroUpper: Box | undefined;
  let macroLower: Box | undefined;

  if (sr) {
    const lo = array.min(sr.lows);
    srLower = box.new(srStart, lo, srEnd, lo - atrValue, upColor, 1, 'solid', 'none', 'bar_index',
      String(color.new(upColor, 100)), 'DISCOUNT: ' + str.tostring(array.sum(sr.pos), 'volume'), 'small', fg,
      undefined, undefined, undefined, undefined, true);
    const hi = array.max(sr.highs);
    srUpper = box.new(srStart, hi + atrValue, srEnd, hi, downColor, 1, 'solid', 'none', 'bar_index',
      String(color.new(downColor, 100)), 'PREMIUM: ' + str.tostring(array.sum(sr.neg), 'volume'), 'small', fg,
      undefined, undefined, undefined, undefined, true);
  }
  if (macro) {
    const halign = showSR ? 'right' : 'center';
    const hi = array.max(macro.highs);
    macroUpper = box.new(macroStart, hi + atrValue, macroEnd, hi, downColor, 0, 'solid', 'none', 'bar_index',
      String(color.new(downColor, 60)), str.tostring(array.sum(macro.neg), 'volume'), 'small', fg, halign);
    const lo = array.min(macro.lows);
    macroLower = box.new(macroStart, lo, macroEnd, lo - atrValue, upColor, 0, 'solid', 'none', 'bar_index',
      String(color.new(upColor, 60)), str.tostring(array.sum(macro.pos), 'volume'), 'small', fg, halign);
  }

  if (sr && srLower && srUpper) {
    const mid = math.avg(box.get_top(srLower), box.get_bottom(srUpper)) as number;
    line.new(srStart, mid, srEnd, mid, 'bar_index', 'none', fg, 'dashed');
    const deltaCol = gt(sr.delta, 0) ? upColor : downColor;
    box.new(srStart, box.get_bottom(srUpper), srEnd, box.get_top(srLower), 'transparent', 0, 'solid', 'none',
      'bar_index', String(color.new(deltaCol, 93)), 'Delta Volume\n' + str.tostring(sr.delta, 'percent'), 'normal',
      deltaCol, 'right', 'bottom');
  }
  if (!showSR && macro && macroLower && macroUpper) {
    const midMacro = math.avg(box.get_top(macroLower), box.get_bottom(macroUpper)) as number;
    line.new(macroStart, midMacro, macroEnd, midMacro, 'bar_index', 'none', fg, 'dashed');
  }
  if (macro) {
    const deltaTable = table.new('top_right', 5, 5);
    table.cell(deltaTable, 0, 0, 'Macro\n Delta Volume:\n' + str.tostring(macro.delta, 'percent'), 0, 0,
      gt(macro.delta, 0) ? upColor : downColor, 'center', 'center', 'large');
  }
  setDrawingBar(null);

  const drawn = drawingOutputs(bars);
  return { ...empty, boxes: drawn.boxes ?? [], lines: drawn.lines ?? [], tables: drawn.tables ?? [] };
}

export const PremiumDiscountDeltaVolume = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
