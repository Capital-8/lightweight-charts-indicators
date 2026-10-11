/**
 * Imbalance Detector [LuxAlgo]
 *
 * Three kinds of price imbalance are drawn as boxes:
 * - Fair value gap (FVG): the low is above the high of two bars back and the previous close is above that high
 *   (bearish: the mirror), when no opening gap was found on this bar or the bar before. A filled box from two bars
 *   back, with a line at its middle.
 * - Opening gap (OG): the low is above the previous high (bearish: the high is below the previous low). A filled box
 *   with the text "OG" between the bodies of the two candles.
 * - Volume imbalance (VI): the bodies of two candles do not overlap but their wicks do. A box with a dotted border
 *   between the two bodies.
 * Each kind has an optional minimum width (in points, in % or in ATR(200)) and a number of bars by which the box is
 * extended to the right. The optional dashboard shows, for each kind, the number of bullish and bearish imbalances
 * and the share of them that were filled (price came back through the start of the gap).
 *
 * Drawings are kept up to 500 boxes and 500 lines (the oldest are removed).
 *
 * Chart values read: the chart foreground colour (the "OG" text). Without a chart context it is the dark theme
 * colour #DBDBDB. The 6 alert conditions of the script have no output.
 *
 * Reference: "Imbalance Detector [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, color, str, barTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LineDrawingData, PineSize, TableCellData, TableData } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';

type WidthMethod = 'Points' | '%' | 'ATR';

export interface ImbalanceDetectorInputs {
  /** Fair Value Gaps (FVG) */
  showFvg: boolean;
  bullFvgCss: string;
  bearFvgCss: string;
  /** Min Width (FVG) */
  fvgUseWidth: boolean;
  fvgGapWidth: number;
  fvgMethod: WidthMethod;
  /** Extend FVG */
  fvgExtend: number;
  /** Show Opening Gaps (OG) */
  showOg: boolean;
  bullOgCss: string;
  bearOgCss: string;
  /** Min Width (OG) */
  ogUseWidth: boolean;
  ogGapWidth: number;
  ogMethod: WidthMethod;
  /** Extend OG */
  ogExtend: number;
  /** Show Volume Imbalances (VI) */
  showVi: boolean;
  bullViCss: string;
  bearViCss: string;
  /** Min Width (VI) */
  viUseWidth: boolean;
  viGapWidth: number;
  viMethod: WidthMethod;
  /** Extend VI */
  viExtend: number;
  /** Show Dashboard */
  showDash: boolean;
  /** Dashboard Location */
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  /** Dashboard Size */
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: ImbalanceDetectorInputs = {
  showFvg: true,
  bullFvgCss: '#2157f3',
  bearFvgCss: '#ff1100',
  fvgUseWidth: false,
  fvgGapWidth: 0,
  fvgMethod: 'Points',
  fvgExtend: 0,
  showOg: true,
  bullOgCss: '#2157f3',
  bearOgCss: '#ff1100',
  ogUseWidth: false,
  ogGapWidth: 0,
  ogMethod: 'Points',
  ogExtend: 0,
  showVi: true,
  bullViCss: '#2157f3',
  bearViCss: '#ff1100',
  viUseWidth: false,
  viGapWidth: 0,
  viMethod: 'Points',
  viExtend: 5,
  showDash: false,
  dashLoc: 'Bottom Right',
  textSize: 'Tiny',
};

const METHODS = ['Points', '%', 'ATR'];
const GF = 'Fair Value Gaps';
const GO = 'Opening Gaps';
const GV = 'Volume Imbalance';
const GD = 'Dashboard';

export const inputConfig: InputConfig[] = [
  { id: 'showFvg', type: 'bool', title: 'Fair Value Gaps (FVG)', defval: true, inline: 'fvg_css', group: GF },
  { id: 'bullFvgCss', type: 'color', title: '', defval: '#2157f3', inline: 'fvg_css', group: GF },
  { id: 'bearFvgCss', type: 'color', title: '', defval: '#ff1100', inline: 'fvg_css', group: GF },
  { id: 'fvgUseWidth', type: 'bool', title: 'Min Width', defval: false, inline: 'fvg_width', group: GF },
  { id: 'fvgGapWidth', type: 'float', title: '', defval: 0, inline: 'fvg_width', group: GF },
  { id: 'fvgMethod', type: 'string', title: '', defval: 'Points', options: METHODS, inline: 'fvg_width', group: GF },
  { id: 'fvgExtend', type: 'int', title: 'Extend FVG', defval: 0, min: 0, group: GF },
  { id: 'showOg', type: 'bool', title: 'Show Opening Gaps (OG)', defval: true, inline: 'og_css', group: GO },
  { id: 'bullOgCss', type: 'color', title: '', defval: '#2157f3', inline: 'og_css', group: GO },
  { id: 'bearOgCss', type: 'color', title: '', defval: '#ff1100', inline: 'og_css', group: GO },
  { id: 'ogUseWidth', type: 'bool', title: 'Min Width', defval: false, inline: 'og_width', group: GO },
  { id: 'ogGapWidth', type: 'float', title: '', defval: 0, inline: 'og_width', group: GO },
  { id: 'ogMethod', type: 'string', title: '', defval: 'Points', options: METHODS, inline: 'og_width', group: GO },
  { id: 'ogExtend', type: 'int', title: 'Extend OG', defval: 0, min: 0, group: GO },
  { id: 'showVi', type: 'bool', title: 'Show Volume Imbalances (VI)', defval: true, inline: 'vi_css', group: GV },
  { id: 'bullViCss', type: 'color', title: '', defval: '#2157f3', inline: 'vi_css', group: GV },
  { id: 'bearViCss', type: 'color', title: '', defval: '#ff1100', inline: 'vi_css', group: GV },
  { id: 'viUseWidth', type: 'bool', title: 'Min Width', defval: false, inline: 'vi_width', group: GV },
  { id: 'viGapWidth', type: 'float', title: '', defval: 0, inline: 'vi_width', group: GV },
  { id: 'viMethod', type: 'string', title: '', defval: 'Points', options: METHODS, inline: 'vi_width', group: GV },
  { id: 'viExtend', type: 'int', title: 'Extend VI', defval: 5, min: 0, group: GV },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: false, group: GD },
  { id: 'dashLoc', type: 'string', title: 'Dashboard Location', defval: 'Bottom Right', options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: GD },
  { id: 'textSize', type: 'string', title: 'Dashboard Size', defval: 'Tiny', options: ['Tiny', 'Small', 'Normal'], group: GD },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Imbalance Detector [LuxAlgo]',
  shortTitle: 'Imbalance Detector [LuxAlgo]',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;

/** The drawing count limit of Pine: above max + 5 objects of one kind the oldest are deleted until max remain */
function register<T>(list: T[], obj: T): void {
  list.push(obj);
  if (list.length > MAX_OBJECTS + 5) list.splice(0, list.length - MAX_OBJECTS);
}

/** imbalance_detection(): one state per call */
function detector(show: boolean, useWidth: boolean, method: WidthMethod, width: number) {
  let isWidth = true;
  let count = 0;
  return {
    get count() {
      return count;
    },
    test(top: number, btm: number, condition: boolean, atr: number): boolean {
      if (useWidth) {
        const dist = top - btm;
        isWidth = method === 'Points' ? gt(dist, width) : method === '%' ? gt((dist / btm) * 100, width) : gt(dist, atr * width);
      }
      const isTrue = show && condition && isWidth;
      count += isTrue ? 1 : 0;
      return isTrue;
    },
  };
}

/** bull_filled() / bear_filled(): the count of imbalances whose start was crossed again */
function fillCounter(bull: boolean) {
  const levels: number[] = [];
  let count = 0;
  return (condition: boolean, level: number, bar: Bar): number => {
    if (condition) levels.unshift(level);
    for (let i = levels.length - 1; i >= 0; i--) {
      if (bull ? gt(levels[i], bar.low) : gt(bar.high, levels[i])) {
        levels.splice(i, 1);
        count += 1;
      }
    }
    return count;
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ImbalanceDetectorInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // chart.fg_color
  const chartFg = foregroundColorOf(chart);
  const atr = ta.atr(bars, 200).toArray().map((v) => v ?? NaN);

  const bullVi = detector(cfg.showVi, cfg.viUseWidth, cfg.viMethod, cfg.viGapWidth);
  const bearVi = detector(cfg.showVi, cfg.viUseWidth, cfg.viMethod, cfg.viGapWidth);
  const bullOg = detector(cfg.showOg, cfg.ogUseWidth, cfg.ogMethod, cfg.ogGapWidth);
  const bearOg = detector(cfg.showOg, cfg.ogUseWidth, cfg.ogMethod, cfg.ogGapWidth);
  const bullFvg = detector(cfg.showFvg, cfg.fvgUseWidth, cfg.fvgMethod, cfg.fvgGapWidth);
  const bearFvg = detector(cfg.showFvg, cfg.fvgUseWidth, cfg.fvgMethod, cfg.fvgGapWidth);
  const bullViFill = fillCounter(true);
  const bearViFill = fillCounter(false);
  const bullOgFill = fillCounter(true);
  const bearOgFill = fillCounter(false);
  const bullFvgFill = fillCounter(true);
  const bearFvgFill = fillCounter(false);
  const filled = { bullVi: 0, bearVi: 0, bullOg: 0, bearOg: 0, bullFvg: 0, bearFvg: 0 };

  const boxes: BoxData[] = [];
  const lines: LineDrawingData[] = [];
  const time = (index: number) => barTime(bars, index);
  const bullOgBg = String(color.new(cfg.bullOgCss, 50));
  const bearOgBg = String(color.new(cfg.bearOgCss, 50));
  const bullFvgBg = String(color.new(cfg.bullFvgCss, 80));
  const bearFvgBg = String(color.new(cfg.bearFvgCss, 80));

  // Values of the bar before
  let prevBullVi = false;
  let prevBearVi = false;
  let prevBullOg = false;
  let prevBearOg = false;
  let prevBullGapBtm = NaN;
  let prevBearGapTop = NaN;

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const { open, high, low, close } = bar;
    const p1 = i >= 1 ? bars[i - 1] : undefined;
    const p2 = i >= 2 ? bars[i - 2] : undefined;
    const open1 = p1 ? p1.open : NaN;
    const high1 = p1 ? p1.high : NaN;
    const low1 = p1 ? p1.low : NaN;
    const close1 = p1 ? p1.close : NaN;
    const high2 = p2 ? p2.high : NaN;
    const low2 = p2 ? p2.low : NaN;

    // Volume imbalances
    const bullGapTop = Math.min(close, open);
    const bullGapBtm = p1 ? Math.max(close1, open1) : NaN;
    const isBullVi = bullVi.test(bullGapTop, bullGapBtm,
      gt(open, close1) && gt(high1, low) && gt(close, close1) && gt(open, open1) && gt(bullGapTop, high1), atr[i]);
    filled.bullVi = bullViFill(prevBullVi, prevBullGapBtm, bar);

    const bearGapTop = p1 ? Math.min(close1, open1) : NaN;
    const bearGapBtm = Math.max(close, open);
    const isBearVi = bearVi.test(bearGapTop, bearGapBtm,
      gt(close1, open) && gt(high, low1) && gt(close1, close) && gt(open1, open) && gt(low1, bearGapBtm), atr[i]);
    filled.bearVi = bearViFill(prevBearVi, prevBearGapTop, bar);

    if (isBullVi) {
      register(boxes, {
        time1: time(i - 1), price1: bullGapTop, time2: time(i + cfg.viExtend), price2: bullGapBtm, borderColor: cfg.bullViCss,
        bgColor: 'transparent', borderStyle: 'dotted',
      });
    }
    if (isBearVi) {
      register(boxes, {
        time1: time(i - 1), price1: bearGapTop, time2: time(i + cfg.viExtend), price2: bearGapBtm, borderColor: cfg.bearViCss,
        bgColor: 'transparent', borderStyle: 'dotted',
      });
    }

    // Opening gaps
    const isBullOg = bullOg.test(bullGapTop, bullGapBtm, gt(low, high1), atr[i]);
    filled.bullOg = bullOgFill(isBullOg, bullGapBtm, bar);
    const isBearOg = bearOg.test(bearGapTop, bearGapBtm, gt(low1, high), atr[i]);
    filled.bearOg = bearOgFill(isBearOg, bearGapTop, bar);

    if (isBullOg) {
      register(boxes, {
        time1: time(i - 1), price1: bullGapTop, time2: time(i + cfg.ogExtend), price2: bullGapBtm, borderColor: 'transparent',
        bgColor: bullOgBg, text: 'OG', textColor: chartFg,
      });
    }
    if (isBearOg) {
      register(boxes, {
        time1: time(i - 1), price1: bearGapTop, time2: time(i + cfg.ogExtend), price2: bearGapBtm, borderColor: 'transparent',
        bgColor: bearOgBg, text: 'OG', textColor: chartFg,
      });
    }

    // Fair value gaps
    const isBullFvg = bullFvg.test(low, high2, gt(low, high2) && gt(close1, high2) && !(isBullOg || prevBullOg), atr[i]);
    filled.bullFvg = bullFvgFill(isBullFvg, high2, bar);
    const isBearFvg = bearFvg.test(low2, high, gt(low2, high) && gt(low2, close1) && !(isBearOg || prevBearOg), atr[i]);
    filled.bearFvg = bearFvgFill(isBearFvg, low2, bar);

    if (isBullFvg) {
      const avg = (low + high2) / 2;
      register(boxes, { time1: time(i - 2), price1: low, time2: time(i + cfg.fvgExtend), price2: high2, borderColor: 'transparent', bgColor: bullFvgBg });
      register(lines, { time1: time(i - 2), price1: avg, time2: time(i + cfg.fvgExtend), price2: avg, color: cfg.bullFvgCss });
    }
    if (isBearFvg) {
      const avg = (low2 + high) / 2;
      register(boxes, { time1: time(i - 2), price1: low2, time2: time(i + cfg.fvgExtend), price2: high, borderColor: 'transparent', bgColor: bearFvgBg });
      register(lines, { time1: time(i - 2), price1: avg, time2: time(i + cfg.fvgExtend), price2: avg, color: cfg.bearFvgCss });
    }

    prevBullVi = isBullVi;
    prevBearVi = isBearVi;
    prevBullOg = isBullOg;
    prevBearOg = isBearOg;
    prevBullGapBtm = bullGapBtm;
    prevBearGapTop = bearGapTop;
  }

  // Dashboard
  const tables: TableData[] = [];
  if (cfg.showDash && n > 0) {
    const position = cfg.dashLoc === 'Bottom Left' ? 'bottom_left' : cfg.dashLoc === 'Top Right' ? 'top_right' : 'bottom_right';
    const size: PineSize = cfg.textSize === 'Tiny' ? 'tiny' : cfg.textSize === 'Small' ? 'small' : 'normal';
    const cells = new Map<string, TableCellData>();
    const cell = (column: number, row: number, text: string, textColor: string, left = false) => {
      cells.set(`${column},${row}`, { column, row, text, textColor, textSize: size, ...(left ? { textHAlign: 'left' as const } : {}) });
    };
    if (cfg.showFvg) cell(2, 0, '〓 FVG', '#FFFFFF');
    if (cfg.showOg) cell(3, 0, '◼ OG', '#FFFFFF');
    if (cfg.showVi) cell(4, 0, '⬚ VI', '#FFFFFF');
    // table.merge_cells() makes the cells of its range that do not exist yet: empty cells
    const empty = (column: number, row: number) => {
      cells.set(`${column},${row}`, { column, row, text: '', textColor: 'transparent', textSize: 'auto' });
    };
    empty(0, 0);
    empty(1, 0);
    cell(0, 1, 'Bullish', '#089981');
    cell(1, 1, 'Frequency', '#089981', true);
    cell(1, 2, 'Filled', '#089981', true);
    empty(0, 2);
    cell(0, 3, 'Bearish', '#f23645');
    cell(1, 3, 'Frequency', '#f23645', true);
    cell(1, 4, 'Filled', '#f23645', true);
    empty(0, 4);
    // set_cells() on the last bar
    const setCells = (column: number, bullFilled: number, bullCount: number, bearFilled: number, bearCount: number, bullCss: string, bearCss: string) => {
      cell(column, 1, str.tostring(bullCount), bullCss, true);
      cell(column, 2, str.format('{0,number,percent}', bullFilled / bullCount), bullCss, true);
      cell(column, 3, str.tostring(bearCount), bearCss, true);
      cell(column, 4, str.format('{0,number,percent}', bearFilled / bearCount), bearCss, true);
    };
    if (cfg.showFvg) setCells(2, filled.bullFvg, bullFvg.count, filled.bearFvg, bearFvg.count, cfg.bullFvgCss, cfg.bearFvgCss);
    if (cfg.showOg) setCells(3, filled.bullOg, bullOg.count, filled.bearOg, bearOg.count, cfg.bullOgCss, cfg.bearOgCss);
    if (cfg.showVi) setCells(4, filled.bullVi, bullVi.count, filled.bearVi, bearVi.count, cfg.bullViCss, cfg.bearViCss);
    tables.push({
      position, columns: 5, rows: 7, bgColor: '#1e222d', borderColor: '#373a46', borderWidth: 1, frameColor: '#373a46', frameWidth: 1,
      cells: [...cells.values()],
      merges: [
        { startColumn: 0, startRow: 0, endColumn: 1, endRow: 0 },
        { startColumn: 0, startRow: 1, endColumn: 0, endRow: 2 },
        { startColumn: 0, startRow: 3, endColumn: 0, endRow: 4 },
      ],
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
    lines,
    tables,
  };
}

export const ImbalanceDetector = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
