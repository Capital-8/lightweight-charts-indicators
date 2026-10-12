/**
 * Dynamic Linear Regression Channels
 *
 * A least squares line of the closes from a start bar to the current bar, with bands at +- a multiple of the standard
 * deviation of the closes around the line. When a close is outside the bands of the channel that includes it, the
 * channel of the bar before (start bar to the previous bar) is drawn as three lines (base, upper, lower) with fills
 * between them, and a new channel starts on that bar. The running channel is drawn on the last bar. At most 500 lines
 * are kept.
 *
 * Chart value read from the optional third argument: the state of the last bar. While the last bar is open, a close
 * outside the bands does not end the channel: the running channel is drawn up to the bar before. Without it every
 * bar is taken as closed.
 *
 * Reference: "Dynamic Linear Regression Channels" by iravan
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  line, linefill, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type Line, type Linefill, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface DynamicLinearRegressionChannelsInputs {
  upperMult: number;
  /** Colour of the upper fill (the upper and lower lines take it without transparency) */
  colorUpper: string;
  lowerMult: number;
  /** Colour of the lower fill (the base line takes it without transparency) */
  colorLower: string;
}

/** input.color(color.new(color.blue / color.red, 85)): alpha 0.15 */
export const defaultInputs: DynamicLinearRegressionChannelsInputs = {
  upperMult: 2.0,
  colorUpper: '#2962FF26',
  lowerMult: 2.0,
  colorLower: '#FF525226',
};

export const inputConfig: InputConfig[] = [
  { id: 'upperMult', type: 'float', title: 'Upper Deviation', defval: 2.0, inline: 'Upper Deviation' },
  { id: 'colorUpper', type: 'color', title: '', defval: '#2962FF26', inline: 'Upper Deviation' },
  { id: 'lowerMult', type: 'float', title: 'Lower Deviation', defval: 2.0, inline: 'Lower Deviation' },
  { id: 'colorLower', type: 'color', title: '', defval: '#FF525226', inline: 'Lower Deviation' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Dynamic Linear Regression Channels',
  shortTitle: 'Dynamic Linear Regression Channels',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Colour without transparency: color.new(c, 0) */
function opaque(c: string): string {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(c.trim());
  if (m) return `#${m[1]}`;
  const r = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(c.trim());
  return r ? `rgb(${r[1]}, ${r[2]}, ${r[3]})` : c;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicLinearRegressionChannelsInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const lowerLineColor = opaque(cfg.colorLower);
  const upperLineColor = opaque(cfg.colorUpper);

  const startPrice: number[] = new Array(n).fill(NaN);
  const endPrice: number[] = new Array(n).fill(NaN);
  const upperStartPrice: number[] = new Array(n).fill(NaN);
  const upperEndPrice: number[] = new Array(n).fill(NaN);
  const lowerStartPrice: number[] = new Array(n).fill(NaN);
  const lowerEndPrice: number[] = new Array(n).fill(NaN);

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS });
  const baseLine = varDrawing<Line>();
  const upper = varDrawing<Line>();
  const lower = varDrawing<Line>();
  // linefill.new(upper, baseLine) and linefill.new(baseLine, lower) run on every bar. A second linefill.new on a pair
  // that has a live linefill keeps that one (no new object); the library adds one (oakScriptJS #174): the port only
  // calls linefill.new when the pair has no live linefill (on the first bar, and after the maximum count deleted it).
  let upperFill: Linefill | null = null;
  let lowerFill: Linefill | null = null;
  const alive = (f: Linefill | null) => f !== null && linefill.all().includes(f);

  let startIndex = 1; // var start_index = 1
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    setDrawingBar(i, isLast);
    const length = i - startIndex + 1;

    // calcSlope(close, length)
    let s = NaN;
    let a = NaN;
    let ic = NaN;
    if (!(i === 0 || length <= 1)) {
      let sumX = 0.0;
      let sumY = 0.0;
      let sumXSqr = 0.0;
      let sumXY = 0.0;
      for (let k = 0; k <= length - 1; k++) {
        const val = at(close, i - k);
        const per = k + 1.0;
        sumX += per;
        sumY += val;
        sumXSqr += per * per;
        sumXY += val * per;
      }
      s = (length * sumXY - sumX * sumY) / (length * sumXSqr - sumX * sumX);
      a = sumY / length;
      ic = a - (s * sumX) / length + s;
    }
    startPrice[i] = ic + s * (length - 1);
    endPrice[i] = ic;

    // calcDev(close, length, slope, average, intercept): only the standard deviation is used
    let stdDev = NaN;
    if (!(i === 0 || length <= 1)) {
      let stdDevAcc = 0.0;
      const periods = length - 1;
      let val = ic;
      for (let j = 0; j <= periods; j++) {
        const price = at(close, i - j) - val;
        stdDevAcc += price * price;
        val += s;
      }
      stdDev = Math.sqrt(stdDevAcc / (periods === 0 ? 1 : periods));
    }
    upperStartPrice[i] = startPrice[i] + cfg.upperMult * stdDev;
    upperEndPrice[i] = endPrice[i] + cfg.upperMult * stdDev;
    lowerStartPrice[i] = startPrice[i] - cfg.lowerMult * stdDev;
    lowerEndPrice[i] = endPrice[i] - cfg.lowerMult * stdDev;

    if (i === 0) {
      baseLine.value = line.new(NaN, NaN, NaN, NaN, 'bar_index', undefined, lowerLineColor, undefined, 1);
      upper.value = line.new(NaN, NaN, NaN, NaN, 'bar_index', undefined, upperLineColor, undefined, 1);
      lower.value = line.new(NaN, NaN, NaN, NaN, 'bar_index', undefined, upperLineColor, undefined, 1);
    }
    if (!alive(upperFill)) upperFill = linefill.new(upper.value!, baseLine.value!, cfg.colorUpper);
    if (!alive(lowerFill)) lowerFill = linefill.new(baseLine.value!, lower.value!, cfg.colorLower);

    const outside = gt(close[i], upperEndPrice[i]) || lt(close[i], lowerEndPrice[i]);
    if (outside && (!isLast || lastConfirmed)) {
      const x1 = i - length + 1;
      const b = line.new(x1, at(startPrice, i - 1), i - 1, at(endPrice, i - 1), 'bar_index', undefined, lowerLineColor, undefined, 1);
      const u = line.new(x1, at(upperStartPrice, i - 1), i - 1, at(upperEndPrice, i - 1), 'bar_index', undefined, upperLineColor, undefined, 1);
      const l = line.new(x1, at(lowerStartPrice, i - 1), i - 1, at(lowerEndPrice, i - 1), 'bar_index', undefined, upperLineColor, undefined, 1);
      linefill.new(u, b, cfg.colorUpper);
      linefill.new(b, l, cfg.colorLower);
      startIndex = i;
    } else if (isLast) {
      const j = outside ? 1 : 0;
      const x1 = i - length + 1;
      line.set_xy1(baseLine.value!, x1, at(startPrice, i - j));
      line.set_xy2(baseLine.value!, i - j, at(endPrice, i - j));
      line.set_xy1(upper.value!, x1, at(upperStartPrice, i - j));
      line.set_xy2(upper.value!, i - j, at(upperEndPrice, i - j));
      line.set_xy1(lower.value!, x1, at(lowerStartPrice, i - j));
      line.set_xy2(lower.value!, i - j, at(lowerEndPrice, i - j));
    }
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const DynamicLinearRegressionChannels = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
