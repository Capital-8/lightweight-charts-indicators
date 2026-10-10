/**
 * Market Structure - By Leviathan
 *
 * Swing points are pivots with "Swing Length" bars on each side. A swing high at or above the swing high before is
 * "HH", else "LH"; a swing low at or above the swing low before is "HL", else "LL" (text labels on the pivot bar).
 * The first close (or wick, "BOS Confirmation") above the latest swing high, or below the latest swing low, is a
 * break of structure: a line from the swing bar to the break bar and a "BOS" text at its middle. With "Show CHoCH"
 * the first break against the direction of the break before is named "CHoCH".
 * "Show 0.5 Retracement Level" adds a line at the middle of an HL to HH move (or of an LH to LL move), from the bar
 * of the first swing to the bar of the second.
 *
 * At most 500 lines and 500 labels are kept (the oldest are removed first).
 * The swing texts use the chart foreground colour. A port has no chart theme: it uses #DBDBDB (dark chart).
 *
 * Reference: "Market Structure - By Leviathan" by LeviathanCapital
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Leviathan. Swing point generation inspired by @BacktestRookies
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

type LineStyleOption = 'Solid' | 'Dashed' | 'Dotted';

export interface MarketStructureByLeviathanInputs {
  /** Bars on each side of a swing point */
  swingSize: number;
  bosConfType: 'Candle Close' | 'Wicks';
  /** Name the first break against the direction before "CHoCH" */
  choch: boolean;
  showSwing: boolean;
  showHalf: boolean;
  halfColor: string;
  halfStyle: LineStyleOption;
  halfWidth: number;
  bosColor: string;
  bosStyle: LineStyleOption;
  bosWidth: number;
}

export const defaultInputs: MarketStructureByLeviathanInputs = {
  swingSize: 20,
  bosConfType: 'Candle Close',
  choch: false,
  showSwing: true,
  showHalf: false,
  halfColor: '#2927B0',
  halfStyle: 'Solid',
  halfWidth: 1,
  bosColor: '#707277',
  bosStyle: 'Dashed',
  bosWidth: 1,
};

const STYLES = ['Solid', 'Dashed', 'Dotted'];

export const inputConfig: InputConfig[] = [
  { id: 'swingSize', type: 'int', title: 'Swing Length', defval: 20 },
  { id: 'bosConfType', type: 'string', title: 'BOS Confirmation', defval: 'Candle Close', options: ['Candle Close', 'Wicks'] },
  { id: 'choch', type: 'bool', title: 'Show CHoCH', defval: false },
  { id: 'showSwing', type: 'bool', title: 'Show Swing Points', defval: true },
  { id: 'showHalf', type: 'bool', title: 'Show 0.5 Retracement Level', defval: false, group: '0.5 Retracement Level' },
  { id: 'halfColor', type: 'color', title: 'Color', defval: '#2927B0', group: '0.5 Retracement Level' },
  { id: 'halfStyle', type: 'string', title: 'Line Style', defval: 'Solid', options: STYLES, group: '0.5 Retracement Level' },
  { id: 'halfWidth', type: 'int', title: 'Width', defval: 1, min: 1, group: '0.5 Retracement Level' },
  { id: 'bosColor', type: 'color', title: 'Color', defval: '#707277', group: 'BOS Settings' },
  { id: 'bosStyle', type: 'string', title: 'Line Style', defval: 'Dashed', options: STYLES, group: 'BOS Settings' },
  { id: 'bosWidth', type: 'int', title: 'Width', defval: 1, min: 1, group: 'BOS Settings' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Market Structure - By Leviathan',
  shortTitle: 'Market Structure - By Leviathan',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;
/** chart.fg_color of a dark chart (the port has no chart theme) */
const CHART_FG = '#DBDBDB';
/** color.rgb(0, 0, 0, 100) */
const CLEAR = '#00000000';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

const lineStyle = (x: LineStyleOption): 'solid' | 'dashed' | 'dotted' =>
  x === 'Dashed' ? 'dashed' : x === 'Dotted' ? 'dotted' : 'solid';

/** Pine drawing limit: when a creation brings the count above max + 5, the oldest are deleted until max remain */
function push<T>(list: T[], item: T): void {
  list.push(item);
  if (list.length > MAX_OBJECTS + 5) list.splice(0, list.length - MAX_OBJECTS);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketStructureByLeviathanInputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines'> & { labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const swingSize = Math.trunc(cfg.swingSize);
  const byClose = cfg.bosConfType === 'Candle Close';

  const pivHiArr = ta.pivothigh(new Series(bars, (b) => b.high), swingSize, swingSize).toArray();
  const pivLoArr = ta.pivotlow(new Series(bars, (b) => b.low), swingSize, swingSize).toArray();

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const newLine = (x1: number, x2: number, y: number, col: string, style: LineStyleOption, width: number) => {
    push(lines, { time1: T(x1), price1: y, time2: T(x2), price2: y, color: col, style: lineStyle(style), width });
  };

  let prevHigh = NaN;
  let prevLow = NaN;
  let prevHighIndex = NaN;
  let prevLowIndex = NaN;
  let highActive = false;
  let lowActive = false;
  // HH = 2, LH = 1, HL = -1, LL = -2
  let prevSwing = 0;
  let prevBreakoutDir = 0;

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const pivHi = pivHiArr[i] ?? NaN;
    const pivLo = pivLoArr[i] ?? NaN;
    const prevSwing1 = prevSwing; // prevSwing[1]
    let hh = false;
    let lh = false;
    let hl = false;
    let ll = false;

    if (!isNaN(pivHi)) {
      if (ge(pivHi, prevHigh)) {
        hh = true;
        prevSwing = 2;
      } else {
        lh = true;
        prevSwing = 1;
      }
      prevHigh = pivHi;
      highActive = true;
      prevHighIndex = i - swingSize;
    }
    if (!isNaN(pivLo)) {
      if (ge(pivLo, prevLow)) {
        hl = true;
        prevSwing = -1;
      } else {
        ll = true;
        prevSwing = -2;
      }
      prevLow = pivLo;
      lowActive = true;
      prevLowIndex = i - swingSize;
    }

    let highBroken = false;
    let lowBroken = false;
    if (gt(byClose ? bar.close : bar.high, prevHigh) && highActive) {
      highBroken = true;
      highActive = false;
    }
    if (lt(byClose ? bar.close : bar.low, prevLow) && lowActive) {
      lowBroken = true;
      lowActive = false;
    }

    // Swing labels
    const swingLabel = (price: number, text: string, style: 'label_down' | 'label_up') => {
      push(labels, { time: T(i - swingSize), price, text, color: CLEAR, textColor: CHART_FG, style });
    };
    if (hh && cfg.showSwing) {
      swingLabel(pivHi, 'HH', 'label_down');
      if (prevSwing1 === -1 && cfg.showHalf) {
        newLine(prevLowIndex, i - swingSize, (prevLow + pivHi) / 2, cfg.halfColor, cfg.halfStyle, cfg.halfWidth);
      }
    }
    if (lh && cfg.showSwing) swingLabel(pivHi, 'LH', 'label_down');
    if (hl && cfg.showSwing) swingLabel(pivLo, 'HL', 'label_up');
    if (ll && cfg.showSwing) {
      swingLabel(pivLo, 'LL', 'label_up');
      if (prevSwing1 === 1 && cfg.showHalf) {
        newLine(prevHighIndex, i - swingSize, (prevHigh + pivLo) / 2, cfg.halfColor, cfg.halfStyle, cfg.halfWidth);
      }
    }

    // Break of structure lines
    if (highBroken) {
      newLine(prevHighIndex, i, prevHigh, cfg.bosColor, cfg.bosStyle, cfg.bosWidth);
      push(labels, {
        time: T(Math.floor(i - (i - prevHighIndex) / 2)), price: prevHigh,
        text: prevBreakoutDir === -1 && cfg.choch ? 'CHoCH' : 'BOS',
        color: CLEAR, textColor: cfg.bosColor, style: 'label_down', size: 'tiny',
      });
      prevBreakoutDir = 1;
    }
    if (lowBroken) {
      newLine(prevLowIndex, i, prevLow, cfg.bosColor, cfg.bosStyle, cfg.bosWidth);
      push(labels, {
        time: T(Math.floor(i - (i - prevLowIndex) / 2)), price: prevLow,
        text: prevBreakoutDir === 1 && cfg.choch ? 'CHoCH' : 'BOS',
        color: CLEAR, textColor: cfg.bosColor, style: 'label_up', size: 'tiny',
      });
      prevBreakoutDir = -1;
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines,
    labels,
  };
}

export const MarketStructureByLeviathan = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
