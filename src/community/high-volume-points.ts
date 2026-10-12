/**
 * High Volume Points [BigBeluga]
 *
 * Marks the pivot highs and lows (`Left Bars` / `Right Bars`) where the volume of the last 2 x `Left Bars` bars is
 * high: the volume sum is divided by its 95th percentile of 1000 bars and multiplied by 5 (0 to about 6). A pivot is
 * kept when this strength is above "Filter Points by Volume". It gets a circle label, a label with the volume sum,
 * a level line and up to 11 nested circles (polylines of 11 points around the pivot, one per strength step above
 * 0, 1, ... 10; radius i x "Diameter Of Circles", 2 bars wide per step and half the 500-bar ATR high per step). Only
 * the pivots of the last 300 bars are drawn. A level line runs to the current bar until the close crosses it (the
 * sign of close - level changes); it then stays where it is, dotted. Its width is a third of the number of circles.
 * "Show Levels" off deletes every line.
 *
 * Label texts use the chart foreground colour (chart context, `foregroundColorOf`). Drawings need a closed bar: on an
 * open last bar (chart context `lastBarConfirmed` false) none is made there.
 *
 * Reference: "High Volume Points [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, str, math, color, Series, line, label, polyline, chartPoint, resetDrawings, setDrawingBar, drawingOutputs,
  type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, PolylineData } from '../types';
import { foregroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface HighVolumePointsInputs {
  /** Diameter Of Circles */
  step: number;
  /** Filter Points by Volume */
  filterVol: number;
  leftBars: number;
  rightBars: number;
  /** Show Levels */
  showLvl: boolean;
  /** Colour of the pivot highs */
  upperCol: string;
  /** Colour of the pivot lows */
  lowerCol: string;
}

export const defaultInputs: HighVolumePointsInputs = {
  step: 1,
  filterVol: 2,
  leftBars: 15,
  rightBars: 15,
  showLvl: true,
  upperCol: '#fda05e',
  lowerCol: '#2fd68e',
};

export const inputConfig: InputConfig[] = [
  { id: 'step', type: 'float', title: 'Diameter Of Circles', defval: 1, step: 0.1, group: 'Settings' },
  { id: 'filterVol', type: 'float', title: 'Filter Points by Volume', defval: 2, step: 0.1, min: 0, max: 6, group: 'Settings' },
  { id: 'leftBars', type: 'int', title: 'Left Bars', defval: 15, group: 'Points' },
  { id: 'rightBars', type: 'int', title: 'Right Bars', defval: 15, group: 'Points' },
  { id: 'showLvl', type: 'bool', title: 'Show Levels', defval: true, group: 'Visual' },
  { id: 'upperCol', type: 'color', title: '', defval: '#fda05e', inline: '1' },
  { id: 'lowerCol', type: 'color', title: '', defval: '#2fd68e', inline: '1' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'High Volume Points [BigBeluga]',
  shortTitle: 'High Volume Points [BigBeluga]',
  overlay: true,
};

/** indicator(max_polylines_count = 100, max_lines_count = 17, max_labels_count = 500) */
const MAX_POLYLINES = 100;
const MAX_LINES = 17;
const MAX_LABELS = 500;
const X_SCALE = 2.0;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<HighVolumePointsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; polylines: PolylineData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const fg = foregroundColorOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const rightBars = cfg.rightBars;
  const upperCol = cfg.upperCol;
  const lowerCol = cfg.lowerCol;

  // float yScale = 0.5 * ta.atr(500)
  const yScale = ta.atr(bars, 500).toArray().map((v) => 0.5 * (v ?? NaN));
  const ph = ta.pivothigh(new Series(bars, (b) => b.high), cfg.leftBars, rightBars).toArray().map((v) => v ?? NaN);
  const pl = ta.pivotlow(new Series(bars, (b) => b.low), cfg.leftBars, rightBars).toArray().map((v) => v ?? NaN);
  // volume_ = math.sum(volume, leftBars * 2); norm_vol = volume_ / percentile_nearest_rank(volume_, 1000, 95) * 5
  const volumeSum = math.sum(new Series(bars, (b) => b.volume ?? NaN), cfg.leftBars * 2);
  const vol = volumeSum.toArray().map((v) => v ?? NaN);
  const refVol = ta.percentile_nearest_rank(volumeSum, 1000, 95).toArray().map((v) => v ?? NaN);
  const normVol = vol.map((v, i) => (v / refVol[i]) * 5);

  resetDrawings({ polyline: MAX_POLYLINES, line: MAX_LINES, label: MAX_LABELS });
  const levels: Line[] = []; // var levels = array.new<line>()

  /** method draw_circle(bool src, int mult_x, int mult_y) */
  const drawCircle = (i: number, up: boolean, multX: number, multY: number) => {
    const p = bars[i - rightBars];
    const source = up ? p.high : p.low;
    const c = up ? upperCol : lowerCol;
    const points = [];
    let angle = 0;
    for (let k = 1; k <= 11; k++) {
      const xValue = math.round(X_SCALE * multX * Math.sin(angle)) + i - rightBars;
      const yValue = yScale[i] * multY * Math.cos(angle) + source;
      angle = angle + Math.PI / 5;
      points.push(chartPoint.from_index(xValue, yValue));
    }
    polyline.new(points, false, false, 'bar_index', c, String(color.new(c, 90)), 'solid', 1);
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const confirmed = i < n - 1 || lastConfirmed;
    let width1 = 0;
    let width2 = 0;

    if (n - 1 - i < 300) {
      // pivot highs
      for (let k = 0; k <= 10; k++) {
        const condition = !isNaN(ph[i]) && gt(normVol[i], k) && gt(normVol[i], cfg.filterVol);
        if (condition && confirmed) {
          drawCircle(i, true, math.round(k * cfg.step), math.round(k * cfg.step));
          width1 = width1 + 1;
        }
      }
      if (!isNaN(ph[i]) && gt(normVol[i], cfg.filterVol) && confirmed) {
        const x = i - rightBars;
        const src = bars[x].high;
        levels.push(line.new(x, src, x, src, 'bar_index', 'none', upperCol, 'solid', math.round(width1 / 3)));
        label.new(x, src, '', 'bar_index', 'price', String(color.new(upperCol, 30)), 'circle', fg, 'tiny');
        label.new(x, src, str.tostring(vol[i], 'volume'), 'bar_index', 'price', 'transparent', 'label_down', fg);
      }
      // pivot lows (for i = 10 to 0)
      for (let k = 10; k >= 0; k--) {
        const condition = !isNaN(pl[i]) && gt(normVol[i], k) && gt(normVol[i], cfg.filterVol);
        if (condition && gt(normVol[i], cfg.filterVol) && confirmed) {
          drawCircle(i, false, math.round(k * cfg.step), math.round(k * cfg.step));
          width2 = width2 + 1;
        }
      }
      if (!isNaN(pl[i]) && gt(normVol[i], cfg.filterVol) && confirmed) {
        const x = i - rightBars;
        const src = bars[x].low;
        levels.push(line.new(x, src, x, src, 'bar_index', 'none', lowerCol, 'solid', math.round(width2 / 3)));
        label.new(x, src, '', 'bar_index', 'price', String(color.new(lowerCol, 30)), 'circle', fg, 'tiny');
        label.new(x, src, str.tostring(vol[i], 'volume'), 'bar_index', 'price', 'transparent', 'label_up', fg);
      }
    }

    // check_cross(levels): `for lineNo = 0 to size - 1` (bound fixed at the start) with a removal inside
    const qty = levels.length;
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    for (let lineNo = 0; lineNo <= qty - 1; lineNo++) {
      if (lineNo < levels.length) {
        const current = levels[lineNo];
        const level = line.get_price(current, i);
        const s1 = math.sign(prevClose - level);
        const s2 = math.sign(b.close - level);
        // math.sign(na) is na and na != na is false
        const crossed = !isNaN(s1) && !isNaN(s2) && s1 !== s2;
        if (crossed) {
          line.set_style(current, 'dotted');
          levels.splice(lineNo, 1);
        } else {
          line.set_x2(current, i);
        }
      }
    }

    if (!cfg.showLvl) {
      for (const l of line.all()) line.delete(l);
    }
  }
  setDrawingBar(null);

  const drawn = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: drawn.lines ?? [],
    labels: drawn.labels ?? [],
    polylines: drawn.polylines ?? [],
  };
}

export const HighVolumePoints = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
