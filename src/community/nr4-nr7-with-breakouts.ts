/**
 * NR4 & NR7 with Breakouts [LuxAlgo]
 *
 * Narrow range patterns on a higher timeframe ("Timeframe", one day by default): a bar of that timeframe is NR7 when
 * its range (high - low) is the smallest of the last 7 bars, and NR4 when it is the smallest of the last 4 bars and
 * not NR7 ("Pattern Type" keeps one kind or both). The pattern of the previous completed bar of the timeframe is read
 * on each chart bar, with its high and low (no repainting).
 *
 * Drawings: at the start of each period of the timeframe an invisible box is created on the first chart bar. When
 * the previous period was a pattern, the box of that period gets the pattern high / low as top / bottom, ends on the
 * current bar and takes the NR4 or NR7 colour; three lines (high, low and dashed middle of the range) start there and
 * run while the pattern holds, and for the rest of a period after a breakout. A close crossing above the range high
 * (after a close below the middle) is an up breakout, a close crossing below the range low (after a close above the
 * middle) a down breakout: a "▲" label at the range low, a "▼" label at the range high. At most 500 lines, 500 boxes
 * and 500 labels are kept.
 *
 * A timeframe lower than the chart timeframe needs the bars of that timeframe, which the chart bars do not have: the
 * port throws an Error. Chart context: the exchange calendar of the timeframe periods.
 *
 * Reference: "NR4 & NR7 with Breakouts [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, callsite, Series, timeframe, line, box, label, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type Box, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars, periodChanges } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface Nr4Nr7WithBreakoutsInputs {
  /** Timeframe on which NR4 / NR7 are found */
  tf: string;
  ptype: 'NR4/NR7' | 'NR4' | 'NR7';
  sigTog: boolean;
  sigSize: 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  upSigColor: string;
  downSigColor: string;
  nr4Color: string;
  nr7Color: string;
  rngColor: string;
}

export const defaultInputs: Nr4Nr7WithBreakoutsInputs = {
  tf: 'D',
  ptype: 'NR4/NR7',
  sigTog: true,
  sigSize: 'Small',
  upSigColor: '#089981',
  downSigColor: '#f23645',
  nr4Color: 'rgba(102, 187, 106, 0.3)',
  nr7Color: 'rgba(255, 238, 88, 0.3)',
  rngColor: '#787b86',
};

export const inputConfig: InputConfig[] = [
  { id: 'tf', type: 'timeframe', title: 'Timeframe', defval: 'D', group: 'Patterns',
    tooltip: 'Sets the HTF to identify NR4 and NR7 on.' },
  { id: 'ptype', type: 'string', title: 'Pattern Type', defval: 'NR4/NR7', options: ['NR4/NR7', 'NR4', 'NR7'],
    group: 'Patterns' },
  { id: 'sigTog', type: 'bool', title: 'Show Breakout Signals', defval: true, group: 'Breakout Signals' },
  { id: 'sigSize', type: 'string', title: 'Signal Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'],
    group: 'Breakout Signals' },
  { id: 'upSigColor', type: 'color', title: 'Up Color', defval: '#089981', group: 'Breakout Signals', inline: 'Colors' },
  { id: 'downSigColor', type: 'color', title: 'Down Color', defval: '#f23645', group: 'Breakout Signals', inline: 'Colors' },
  { id: 'nr4Color', type: 'color', title: 'NR4 Pattern', defval: 'rgba(102, 187, 106, 0.3)', group: 'Style' },
  { id: 'nr7Color', type: 'color', title: 'NR7 Pattern', defval: 'rgba(255, 238, 88, 0.3)', group: 'Style' },
  { id: 'rngColor', type: 'color', title: 'Range Color', defval: '#787b86', group: 'Style' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'NR4 & NR7 with Breakouts [LuxAlgo]',
  shortTitle: 'LuxAlgo - NR4/NR7 w/ Breakouts',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500, max_polylines_count = 100) */
const MAX_OBJECTS = 500;
const MAX_POLYLINES = 100;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

/** color.rgb(0, 0, 0, 100) */
const INVIS = 'rgba(0, 0, 0, 0)';

export function calculate(
  bars: Bar[],
  inputs: Partial<Nr4Nr7WithBreakoutsInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const tf = cfg.tf;
  const sigSize = cfg.sigSize.toLowerCase();

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS, label: MAX_OBJECTS, polyline: MAX_POLYLINES });

  // request.security("", tf, [nr4_pattern[1], nr7_pattern[1], high[1], low[1]], lookahead = barmerge.lookahead_on):
  // on each chart bar, the values of the bar of the timeframe before the one that contains the chart bar
  const chartTf = chartTimeframe(bars, chart);
  const same = tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf);
  if (!same && timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`NR4 & NR7 with Breakouts: the timeframe ${tf} is lower than the chart timeframe ${chartTf}; `
      + `its bars are not available (choose a timeframe of at least ${chartTf})`);
  }
  let htf: Bar[];
  let group: number[];
  if (same) {
    htf = bars;
    group = bars.map((_b, i) => i);
  } else {
    const s = higherTimeframeBars(bars, tf, chart);
    htf = s.htf;
    group = s.group;
  }
  const rng = htf.map((b) => b.high - b.low);
  const lst4 = ta.lowest(new Series(htf, (_b, j) => rng[j]), 4).toArray();
  const lst7 = ta.lowest(new Series(htf, (_b, j) => rng[j]), 7).toArray();
  const nr7Pattern = rng.map((r, j) => cfg.ptype !== 'NR4' && eq(r, lst7[j] ?? NaN));
  const nr4Pattern = rng.map((r, j) => cfg.ptype !== 'NR7' && eq(r, lst4[j] ?? NaN) && !nr7Pattern[j]);

  // timeframe.change(tf)
  const newTf = same ? bars.map((_b, i) => i > 0) : periodChanges(bars, tf, chart);

  let downCheck = false;
  let upCheck = false;
  let upFired = false;
  let downFired = false;
  const bx = varDrawing<Box>();
  const hLn = varDrawing<Line>();
  const lLn = varDrawing<Line>();
  const mLn = varDrawing<Line>();
  let rh = NaN;
  let rl = NaN;
  const crossDown = callsite.crossunder();
  const crossUp = callsite.crossover();

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const g = group[i] - 1;
    const nr4 = g >= 0 && nr4Pattern[g];
    const nr7 = g >= 0 && nr7Pattern[g];
    const ph = g >= 0 ? htf[g].high : NaN;
    const pl = g >= 0 ? htf[g].low : NaN;

    const NR = nr4 || nr7;
    if (NR) {
      rh = ph;
      rl = pl;
    }
    const mid = (rh + rl) / 2;
    const isNewTf = newTf[i];

    if (isNewTf && NR) {
      if (bx.value) {
        box.set_top(bx.value, rh);
        box.set_bottom(bx.value, rl);
        box.set_right(bx.value, i);
        box.set_bgcolor(bx.value, nr4 ? cfg.nr4Color : cfg.nr7Color);
      }
      upCheck = true;
      downCheck = true;
      hLn.value = line.new(i, rh, i + 1, rh, 'bar_index', 'none', cfg.rngColor);
      lLn.value = line.new(i, rl, i + 1, rl, 'bar_index', 'none', cfg.rngColor);
      mLn.value = line.new(i, mid, i + 1, mid, 'bar_index', 'none', cfg.rngColor, 'dashed');
    }
    if (isNewTf) {
      upFired = false;
      downFired = false;
      bx.value = box.new(i, b.high, i, b.low, undefined, 0, undefined, undefined, undefined, INVIS);
    }

    // Down signal
    if (gt(b.close, mid) && !downCheck) downCheck = true;
    let downSignal = false;
    if (crossDown(b.close, rl) && downCheck) {
      downSignal = true;
      downCheck = false;
      downFired = true;
    }
    // Up signal
    if (lt(b.close, mid) && !upCheck) upCheck = true;
    let upSignal = false;
    if (crossUp(b.close, rh) && upCheck) {
      upSignal = true;
      upCheck = false;
      upFired = true;
    }

    if (NR || upFired || downFired) {
      if (hLn.value) line.set_x2(hLn.value, i);
      if (lLn.value) line.set_x2(lLn.value, i);
      if (mLn.value) line.set_x2(mLn.value, i);
    }

    if (upSignal && cfg.sigTog) {
      label.new(i, rl, '\n▲', 'bar_index', 'price', INVIS, 'label_center', cfg.upSigColor, sigSize);
    }
    if (downSignal && cfg.sigTog) {
      label.new(i, rh, '▼\n', 'bar_index', 'price', INVIS, 'label_center', cfg.downSigColor, sigSize);
    }
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const Nr4Nr7WithBreakouts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
