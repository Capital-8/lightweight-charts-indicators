/**
 * ZigZag with Fibonacci Levels
 *
 * A bar is a pivot high when its high is the highest of the period, a pivot low when its low is the lowest. The
 * direction turns up on a pivot high (without a pivot low on the same bar) and down on a pivot low. A change of
 * direction adds a point to the zig zag; a more extreme pivot in the same direction moves the last point. The zig
 * zag keeps its last 5 points.
 *
 * Drawings: a line from the last point to the point before when the last point changes (the line of a moved point
 * is replaced); at most 300 lines are kept. On the last bar, Fibonacci levels of the last complete leg (from the
 * third last point to the second last), from the third last point to the right, with their labels: the enabled
 * levels below 1, then the extensions 1, 1.272, 1.414, 1.618, 2, ... until a level passes the last point.
 *
 * Reference: "ZigZag with Fibonacci Levels" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import {
  ta, Series, line, label, str, math, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line,
} from 'oakscriptjs';
import type { LineDrawingData, LabelData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';

export interface ZigzagFibonacciInputs {
  period: number;
  showZigzag: boolean;
  showFibo: boolean;
  labelcol: string;
  fibolinecol: string;
  upcol: string;
  dncol: string;
  labelloc: 'Left' | 'Right';
  enable236: boolean;
  enable382: boolean;
  enable500: boolean;
  enable618: boolean;
  enable786: boolean;
}

export const defaultInputs: ZigzagFibonacciInputs = {
  period: 15,
  showZigzag: true,
  showFibo: true,
  labelcol: '#2196F3',
  fibolinecol: '#00E676',
  upcol: '#00E676',
  dncol: '#FF5252',
  labelloc: 'Left',
  enable236: true,
  enable382: true,
  enable500: true,
  enable618: true,
  enable786: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'period', type: 'int', title: 'ZigZag Period', defval: 15, min: 2, max: 50 },
  { id: 'showZigzag', type: 'bool', title: 'Show Zig Zag', defval: true },
  { id: 'showFibo', type: 'bool', title: 'Show Fibonacci Ratios', defval: true },
  { id: 'labelcol', type: 'color', title: 'Text Color for Fibo Levels', defval: '#2196F3' },
  { id: 'fibolinecol', type: 'color', title: 'Line Color for Fibo Levels', defval: '#00E676' },
  { id: 'upcol', type: 'color', title: 'Zigzag Colors', defval: '#00E676', inline: 'zzcol' },
  { id: 'dncol', type: 'color', title: '', defval: '#FF5252', inline: 'zzcol' },
  { id: 'labelloc', type: 'string', title: 'Label Location', defval: 'Left', options: ['Left', 'Right'] },
  { id: 'enable236', type: 'bool', title: 'Enable Level 0.236', defval: true },
  { id: 'enable382', type: 'bool', title: 'Enable Level 0.382', defval: true },
  { id: 'enable500', type: 'bool', title: 'Enable Level 0.500', defval: true },
  { id: 'enable618', type: 'bool', title: 'Enable Level 0.618', defval: true },
  { id: 'enable786', type: 'bool', title: 'Enable Level 0.786', defval: true },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ZigZag with Fibonacci Levels',
  shortTitle: 'ZZ Fibo',
  overlay: true,
};

/** max_lines_count of the original */
const MAX_LINES = 300;

export function calculate(
  bars: Bar[],
  inputs: Partial<ZigzagFibonacciInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const prd = cfg.period;
  const n = bars.length;
  const mintick = mintickOf(chart);

  const fiboRatios: number[] = [0.0];
  if (cfg.enable236) fiboRatios.push(0.236);
  if (cfg.enable382) fiboRatios.push(0.382);
  if (cfg.enable500) fiboRatios.push(0.5);
  if (cfg.enable618) fiboRatios.push(0.618);
  if (cfg.enable786) fiboRatios.push(0.786);
  const shownlevels = fiboRatios.length;
  for (let x = 1; x <= 5; x++) fiboRatios.push(x, x + 0.272, x + 0.414, x + 0.618);

  const hbArr = ta.highestbars(new Series(bars, (b) => b.high), prd).toArray();
  const lbArr = ta.lowestbars(new Series(bars, (b) => b.low), prd).toArray();

  // zigzag: [value, bar index, value, bar index, ...], newest point first, at most 5 points
  const maxArraySize = 10;
  let zigzag: number[] = [];
  let dir = 0;
  const addToZigzag = (value: number, bindex: number) => {
    zigzag.unshift(bindex);
    zigzag.unshift(value);
    if (zigzag.length > maxArraySize) zigzag = zigzag.slice(0, maxArraySize);
  };
  const updateZigzag = (value: number, bindex: number) => {
    if (zigzag.length === 0) addToZigzag(value, bindex);
    else if ((dir === 1 && value > zigzag[0]) || (dir === -1 && value < zigzag[0])) {
      zigzag[0] = value;
      zigzag[1] = bindex;
    }
  };

  resetDrawings({ line: MAX_LINES });
  const zzline = varDrawing<Line>(); // var line zzline

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const ph = hbArr[i] === 0 ? bars[i].high : NaN;
    const pl = lbArr[i] === 0 ? bars[i].low : NaN;
    const oldzigzag = zigzag.slice();
    const dirPrev = dir;
    if (!Number.isNaN(ph) && ph !== 0 && Number.isNaN(pl)) dir = 1;
    else if (!Number.isNaN(pl) && pl !== 0 && Number.isNaN(ph)) dir = -1;
    const dirchanged = i > 0 && dir !== dirPrev;
    if ((!Number.isNaN(ph) && ph !== 0) || (!Number.isNaN(pl) && pl !== 0)) {
      if (dirchanged) addToZigzag(dir === 1 ? ph : pl, i);
      else updateZigzag(dir === 1 ? ph : pl, i);
    }

    if (cfg.showZigzag && zigzag.length >= 4 && oldzigzag.length >= 4) {
      if (zigzag[0] !== oldzigzag[0] || zigzag[1] !== oldzigzag[1]) {
        if (zigzag[2] === oldzigzag[2] && zigzag[3] === Math.round(oldzigzag[3]) && zzline.value) line.delete(zzline.value);
        zzline.value = line.new(Math.round(zigzag[1]), zigzag[0], Math.round(zigzag[3]), zigzag[2], 'bar_index', 'none',
          dir === 1 ? cfg.upcol : cfg.dncol, 'solid', 2);
      }
    }

    if (cfg.showFibo && zigzag.length >= 6 && i === n - 1) {
      const base = zigzag[2];
      const diff = zigzag[4] - base;
      const x1 = Math.round(zigzag[5]);
      let stopit = false;
      for (let x = 0; x < fiboRatios.length; x++) {
        if (stopit && x > shownlevels) break;
        const y = base + diff * fiboRatios[x];
        line.new(x1, y, i, y, 'bar_index', 'right', cfg.fibolinecol);
        const text = str.tostring(fiboRatios[x], '#.###') + '(' + str.tostring(math.round_to_mintick(y, mintick)) + ')';
        label.new(cfg.labelloc === 'Left' ? x1 - 1 : i + 15, y, text, 'bar_index', 'price', undefined, 'none', cfg.labelcol);
        if ((dir === 1 && y > zigzag[0]) || (dir === -1 && y < zigzag[0])) stopit = true;
      }
    }
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: out.lines ?? [],
    labels: out.labels ?? [],
  };
}

export const ZigzagFibonacci = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
