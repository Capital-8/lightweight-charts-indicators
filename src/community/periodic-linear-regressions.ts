/**
 * Periodic Linear Regressions
 *
 * A least-squares line of the source against the bar index, refitted on each bar with all the bars since the start
 * of the current 'Anchor Period' (default one week). Bands at +- Multiple * sqrt(variance * (1 - r²)) of the source.
 * The bar that opens a new period is still part of the period before (the sums are reset after it).
 * 'Rolling': the line and bands are plots (the line coloured by the correlation from the Bicolor colours, else the
 * mono colour) with gradient fills between the line and each band. 'Static': each period gets a line (and two band
 * lines) that is redrawn on every bar from the period start to the current bar. 'First Bar' anchor with 'Rolling'
 * keeps the bars of every period (only the population count is reset at a period change, as the original).
 * A dashboard shows the anchor period.
 *
 * Chart values read: the exchange time zone and session (period changes, through the chart context).
 *
 * Reference: "Periodic Linear Regressions [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  array, color, line, resetDrawings, setDrawingBar, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType, type Line, type PineArray,
} from 'oakscriptjs';
import type { LineDrawingData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { periodChanges } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface PeriodicLinearRegressionsInputs {
  /** Method */
  choice: 'Static' | 'Rolling';
  /** Anchor Type */
  anchor: 'Periodic' | 'First Bar';
  /** Anchor Period */
  res: string;
  /** Source */
  src: SourceType;
  /** Multiple */
  mult: number;
  /** Show Extremities */
  bands: boolean;
  /** Mono color */
  col: string;
  /** Bicolor */
  bicolor: boolean;
  /** Bicolor: positive correlation colour */
  colA: string;
  /** Bicolor: negative correlation colour */
  colB: string;
  /** Gradient */
  grad: boolean;
  /** Gradient strength (100 - transparency of the band side) */
  grade: number;
  /** Show Dashboard */
  showDash: boolean;
  /** Dashboard location */
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  /** Dashboard text size */
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: PeriodicLinearRegressionsInputs = {
  choice: 'Rolling',
  anchor: 'Periodic',
  res: 'W',
  src: 'close',
  mult: 1,
  bands: true,
  col: '#FF5D00',
  bicolor: true,
  colA: '#089981',
  colB: '#F23645',
  grad: true,
  grade: 15,
  showDash: true,
  dashLoc: 'Top Right',
  textSize: 'Normal',
};

export const inputConfig: InputConfig[] = [
  { id: 'choice', type: 'string', title: 'Method', defval: 'Rolling', options: ['Static', 'Rolling'] },
  {
    id: 'anchor', type: 'string', title: 'Anchor Type', defval: 'Periodic', options: ['Periodic', 'First Bar'],
    tooltip: "'First Bar' -> Choice: 'Rolling' ",
  },
  { id: 'res', type: 'timeframe', title: 'Anchor Period', defval: 'W' },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'mult', type: 'float', title: 'Multiple', defval: 1, step: 0.1, min: 0.1 },
  { id: 'bands', type: 'bool', title: 'Show Extremities', defval: true },
  { id: 'col', type: 'color', title: 'Mono color          ', defval: '#FF5D00', group: 'Color Settings', inline: '1' },
  { id: 'bicolor', type: 'bool', title: 'Bicolor        ', defval: true, group: 'Color Settings', inline: 'a' },
  { id: 'colA', type: 'color', title: '', defval: '#089981', group: 'Color Settings', inline: 'a' },
  { id: 'colB', type: 'color', title: '', defval: '#F23645', group: 'Color Settings', inline: 'a' },
  { id: 'grad', type: 'bool', title: 'Gradient', defval: true, group: 'Color Settings', inline: 'c' },
  { id: 'grade', type: 'int', title: '    ', defval: 15, min: 0, max: 50, group: 'Color Settings', inline: 'c' },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: true, group: 'Dashboard' },
  {
    id: 'dashLoc', type: 'string', title: 'Location', defval: 'Top Right',
    options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard',
  },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Normal', options: ['Tiny', 'Small', 'Normal'], group: 'Dashboard' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: '#FF5D00', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Plot', color: '#FF5D00', lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Plot', color: '#FF5D00', lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Periodic Linear Regressions [LuxAlgo]',
  shortTitle: 'LuxAlgo - Periodic Linear Regressions',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<PeriodicLinearRegressionsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'tables'> & { lines: LineDrawingData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { choice, anchor, res, mult, bands, col, bicolor, colA, colB, grad, grade, showDash } = cfg;
  const nBars = bars.length;
  const srcArr = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const changes = periodChanges(bars, res, chart);

  resetDrawings({ line: 500 });

  // var line ln / lnU / lnD = na
  let ln: Line | undefined;
  let lnU: Line | undefined;
  let lnD: Line | undefined;
  const aX: PineArray<number> = array.new_float();
  const aY: PineArray<number> = array.new_float();
  let Ex = 0;
  let Ey = 0;
  let Ex2 = 0;
  let Exy = 0;
  let N = 0;

  const yMxArr: number[] = new Array(nBars).fill(NaN);
  const posArr: number[] = new Array(nBars).fill(NaN);
  const minArr: number[] = new Array(nBars).fill(NaN);
  const rArr: number[] = new Array(nBars).fill(NaN);
  const getX1 = (l: Line | undefined) => (l ? line.get_x1(l) : NaN);

  for (let n = 0; n < nBars; n++) {
    setDrawingBar(n, n === nBars - 1);
    const src = srcArr[n];
    const ch = changes[n];

    Ex += n;
    Ey += src;
    Ex2 += Math.pow(n, 2);
    Exy += n * src;
    N += 1;

    array.unshift(aX, n);
    array.unshift(aY, src);

    const cov = array.covariance(aY, aX);
    // a_ = cov / aX.variance() and b_ are not used by the outputs
    const r2 = Math.pow(cov / (array.stdev(aY) * array.stdev(aX)), 2);
    const rss = array.variance(aY) - r2 * array.variance(aY);
    const dist = Math.sqrt(rss) * mult;

    const m = (N * Exy - Ex * Ey) / (N * Ex2 - Math.pow(Ex, 2));
    const b = (Ey - m * Ex) / N;
    const yMx = m * n + b;

    if (choice === 'Static') {
      const cl = bicolor ? (ln && gt(line.get_y2(ln), line.get_y1(ln)) ? colA : colB) : col;
      const x1 = getX1(ln);
      if (ln) {
        line.set_xy2(ln, n, yMx);
        line.set_y1(ln, m * x1 + b);
        if (bicolor) line.set_color(ln, cl);
      }
      if (bands) {
        if (lnU) {
          line.set_xy2(lnU, n, yMx + dist);
          line.set_y1(lnU, m * x1 + b + dist);
          line.set_color(lnU, cl);
        }
        if (lnD) {
          line.set_xy2(lnD, n, yMx - dist);
          line.set_y1(lnD, m * x1 + b - dist);
          line.set_color(lnD, cl);
        }
      }
    }

    if (ch) {
      if (anchor === 'Periodic' || choice === 'Static') {
        Ex = 0;
        Ey = 0;
        Ex2 = 0;
        Exy = 0;
        array.clear(aX);
        array.clear(aY);
      }
      N = 0;
      if (choice === 'Static') {
        ln = line.new(n, src, n, src, 'bar_index', 'none', col);
        if (bands) {
          lnU = line.new(n, src + dist, n, src + dist, 'bar_index', 'none', col);
          lnD = line.new(n, src - dist, n, src - dist, 'bar_index', 'none', col);
        }
      }
    }

    // R = cov / (aX.stdev() * aY.stdev()) (after a reset: the arrays are empty)
    rArr[n] = cov / (array.stdev(aX) * array.stdev(aY));
    if (choice === 'Rolling') {
      yMxArr[n] = yMx;
      if (bands) {
        posArr[n] = yMx + dist;
        minArr[n] = yMx - dist;
      }
    }
  }
  setDrawingBar(null);

  const rolling = bicolor && choice === 'Rolling';
  const num = (v: number) => (Number.isFinite(v) ? v : NaN);
  const gradient = rArr.map((R) => color.from_gradient(R, -1, 1, colB, colA));
  const topColor = gradient.map((c) => (grad ? String(color.new(c, 100)) : null));
  const bottomColor = gradient.map((c) => (grad ? String(color.new(c, 100 - grade)) : null));

  const tables: TableData[] = [];
  // var tb = table.new(dashLoc, 2, 3, ...): made on the first bar, cells written on the last bar
  if (nBars > 0) {
    const textSize = cfg.textSize.toLowerCase() as 'tiny' | 'small' | 'normal';
    tables.push({
      position: cfg.dashLoc.toLowerCase().replace(' ', '_') as TableData['position'],
      columns: 2, rows: 3,
      bgColor: '#1e222d', borderColor: '#373a46', borderWidth: 1, frameColor: '#373a46', frameWidth: 1,
      cells: showDash ? [
        { column: 0, row: 0, text: 'HTF', textColor: '#FFFFFF', textSize },
        { column: 1, row: 0, text: res, textColor: '#FFFFFF', textSize },
      ] : [],
    });
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((bar, i) => ({
        time: bar.time, value: num(yMxArr[i]), color: rolling ? String(gradient[i]) : col,
      })),
      plot1: bars.map((bar, i) => ({ time: bar.time, value: num(minArr[i]), color: rolling ? 'transparent' : col })),
      plot2: bars.map((bar, i) => ({ time: bar.time, value: num(posArr[i]), color: rolling ? 'transparent' : col })),
    },
    fills: [
      // fill(m, t, yMx, yMx_pos, top colour, bottom colour)
      { plot1: 'plot0', plot2: 'plot2', gradient: { topValue: yMxArr, bottomValue: posArr, topColor, bottomColor } },
      // fill(m, b, yMx, yMx_min, top colour, bottom colour)
      { plot1: 'plot0', plot2: 'plot1', gradient: { topValue: yMxArr, bottomValue: minArr, topColor, bottomColor } },
    ],
    lines: line.all().map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color),
    })),
    tables,
  };
}

export const PeriodicLinearRegressions = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
