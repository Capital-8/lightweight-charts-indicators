/**
 * 1-2-3 Pattern (Expo)
 *
 * Swing pivots (highs and lows with `Period` bars on each side) are taken in alternation: a pivot high only after a
 * pivot low and the reverse. The last three pivots are kept (3 = newest, 2, 1 = oldest). A bullish 1-2-3 is a high
 * cross above pivot 2 while pivot 3 is above pivot 1 and below pivot 2; a bearish 1-2-3 is a low cross below pivot 2
 * while pivot 3 is below pivot 1 and above pivot 2. Only one break is drawn per pivot 2.
 *
 * Drawings: the break shape (a label in the chosen style and colour) and a dashed line from pivot 2 to the break bar;
 * the "1", "2", "3" labels and the two lines of the pattern; optional HH / LH / HL / LL labels on the pivots. Lines
 * and texts use the chart foreground colour. At most 500 labels and 500 lines are kept. The alerts of the original
 * have no output.
 *
 * Chart context: `chart.fg_color` (lines and label texts).
 *
 * Reference: "1-2-3 Pattern (Expo)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import {
  ta, Series, callsite, line, label, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface Pattern123Inputs {
  /** Pivot period */
  prd: number;
  showBreak: boolean;
  showPattern: boolean;
  showPvts: boolean;
  visuell: 'Diamond' | 'XCross' | 'Cross' | 'Flag' | 'Square';
  colBull: string;
  colBear: string;
  size: 'tiny' | 'small' | 'normal' | 'large' | 'huge';
}

export const defaultInputs: Pattern123Inputs = {
  prd: 10,
  showBreak: true,
  showPattern: true,
  showPvts: false,
  visuell: 'Diamond',
  colBull: '#31BE0C',
  colBear: '#DF3D3D',
  size: 'tiny',
};

export const inputConfig: InputConfig[] = [
  { id: 'prd', type: 'int', title: 'Period', defval: 10, tooltip: 'Pivot period' },
  { id: 'showBreak', type: 'bool', title: 'Show Break', defval: true, inline: 'break' },
  { id: 'showPattern', type: 'bool', title: 'Show Pattern', defval: true, tooltip: 'Show the 1-2-3 Pattern' },
  { id: 'showPvts', type: 'bool', title: 'Show Pivots', defval: false, tooltip: 'Enable the HH/HL/LL/LH labels' },
  { id: 'visuell', type: 'string', title: '', defval: 'Diamond', options: ['Diamond', 'XCross', 'Cross', 'Flag', 'Square'],
    inline: 'break' },
  { id: 'colBull', type: 'color', title: '', defval: '#31BE0C', inline: 'break' },
  { id: 'colBear', type: 'color', title: '', defval: '#DF3D3D', inline: 'break' },
  { id: 'size', type: 'string', title: '', defval: 'tiny', options: ['tiny', 'small', 'normal', 'large', 'huge'],
    inline: 'break', tooltip: 'Show pattern break, set the size, and coloring' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: '1-2-3 Pattern (Expo)',
  shortTitle: '1-2-3 Pattern (Expo)',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;
/** Text colour of a label without `textcolor` in a v5 script */
const V5_LABEL_TEXT = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const SHAPES = {
  Diamond: 'diamond', XCross: 'xcross', Cross: 'cross', Flag: 'flag', Square: 'square',
} as const;

export function calculate(bars: Bar[], inputs: Partial<Pattern123Inputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const prd = cfg.prd;
  const shape = SHAPES[cfg.visuell];
  const fg = foregroundColorOf(chart);

  const pvtHi = ta.pivothigh(new Series(bars, (b) => b.high), prd, prd).toArray();
  const pvtLo = ta.pivotlow(new Series(bars, (b) => b.low), prd, prd).toArray();

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });

  // var pvts = array.new<float>(3, 0.0), var idx = array.new<int>(3, 0): index 0 is the newest pivot
  const pvts = [0, 0, 0];
  const idx = [0, 0, 0];
  let pos = 0;
  let pattern = true;
  const crossUp = callsite.crossover();
  const crossDown = callsite.crossunder();
  let prevP1 = NaN;

  const push = (price: number, index: number) => {
    pvts.pop();
    idx.pop();
    pvts.unshift(price);
    idx.unshift(index);
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const hi = pvtHi[i] ?? NaN;
    const lo = pvtLo[i] ?? NaN;

    if (!isNaN(hi) && pos <= 0) {
      const price = bars[i - prd].high;
      if (cfg.showPvts) {
        label.new(i - prd, price, gt(hi, pvts[1]) ? 'HH' : 'LH', 'bar_index', 'price', 'transparent', 'label_down', fg);
      }
      push(price, i - prd);
      pos = 1;
    }
    if (!isNaN(lo) && pos >= 0) {
      const price = bars[i - prd].low;
      if (cfg.showPvts) {
        label.new(i - prd, price, gt(lo, pvts[1]) ? 'HL' : 'LL', 'bar_index', 'price', 'transparent', 'label_up', fg);
      }
      push(price, i - prd);
      pos = -1;
    }

    // ta.crossover / ta.crossunder run on every bar (left side of the `and`)
    const up = crossUp(b.high, pvts[1]);
    if (up && pattern) {
      if (gt(pvts[0], pvts[2]) && lt(pvts[0], pvts[1])) {
        if (cfg.showBreak) {
          label.new(i, b.high, '', 'bar_index', 'price', cfg.colBull, shape, V5_LABEL_TEXT, cfg.size);
          line.new(idx[1], pvts[1], i, pvts[1], 'bar_index', 'none', fg, 'dashed');
        }
        if (cfg.showPattern) {
          label.new(idx[2], pvts[2], '1', 'bar_index', 'price', 'transparent', 'label_up', fg);
          label.new(idx[1], pvts[1], '2', 'bar_index', 'price', 'transparent', 'label_down', fg);
          label.new(idx[0], pvts[0], '3', 'bar_index', 'price', 'transparent', 'label_up', fg);
          line.new(idx[2], pvts[2], idx[1], pvts[1], 'bar_index', 'none', fg);
          line.new(idx[1], pvts[1], idx[0], pvts[0], 'bar_index', 'none', fg);
        }
        pattern = false;
      }
    }
    const down = crossDown(b.low, pvts[1]);
    if (down && pattern) {
      if (lt(pvts[0], pvts[2]) && gt(pvts[0], pvts[1])) {
        if (cfg.showBreak) {
          label.new(i, b.low, '', 'bar_index', 'price', cfg.colBear, shape, V5_LABEL_TEXT, cfg.size);
          line.new(idx[1], pvts[1], i, pvts[1], 'bar_index', 'none', fg, 'dashed');
        }
        if (cfg.showPattern) {
          label.new(idx[2], pvts[2], '1', 'bar_index', 'price', 'transparent', 'label_down', fg);
          label.new(idx[1], pvts[1], '2', 'bar_index', 'price', 'transparent', 'label_up', fg);
          label.new(idx[0], pvts[0], '3', 'bar_index', 'price', 'transparent', 'label_down', fg);
          line.new(idx[2], pvts[2], idx[1], pvts[1], 'bar_index', 'none', fg);
          line.new(idx[1], pvts[1], idx[0], pvts[0], 'bar_index', 'none', fg);
        }
        pattern = false;
      }
    }

    // if ta.change(array.get(pvts, 1)): a new pivot 2 allows the next break
    const change = pvts[1] - prevP1;
    if (!isNaN(change) && change !== 0) pattern = true;
    prevP1 = pvts[1];
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const Pattern123 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
