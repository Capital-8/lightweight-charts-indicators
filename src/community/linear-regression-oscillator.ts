/**
 * Linear Regression Oscillator [ChartPrime]
 *
 * A least squares line is fitted to the last `Length` closes; the oscillator is the value of that line at the bar
 * index, with the sign changed, normalized with its 100-bar mean and standard deviation. Its colour fades towards
 * zero. Crosses of zero give trend signals (filled diamonds in the pane, triangles on the price) and set an
 * invalidation level, the highest high or lowest low of the last 5 bars, drawn on the price until the next signal.
 * A turn of the oscillator beyond a threshold gives a mean reversion signal (hollow diamond, "Reversion" label on
 * the price). Optionally the candles take the colour of the oscillator sign.
 *
 * The text colour of the threshold labels and the zero line use the foreground colour of the chart in the original;
 * the port has no chart theme and uses #DBDBDB (dark theme).
 *
 * Reference: "Linear Regression Oscillator [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import {
  ta, Series, color, str, array,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { MarkerData, LabelData, PlotCandleData, BarColorData } from '../types';

export interface LinearRegressionOscillatorInputs {
  length: number;
  upper: number;
  lower: number;
  /** Plot Bar Color: candles and bars take the colour of the oscillator sign */
  candles: boolean;
}

export const defaultInputs: LinearRegressionOscillatorInputs = {
  length: 20,
  upper: 1.5,
  lower: -1.5,
  candles: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 20 },
  { id: 'upper', type: 'float', title: 'Upper Threshold', defval: 1.5, step: 0.1 },
  { id: 'lower', type: 'float', title: 'Lower Threshold', defval: -1.5, step: 0.1 },
  { id: 'candles', type: 'bool', title: 'Plot Bar Color', defval: false },
];

const COL_UP = '#10cab8';
const COL_DN = '#2962FF';
/** color(na): fully transparent */
const NA_COLOR = '#00000000';
/** chart.fg_color of the reference chart (dark theme) */
const CHART_FG = '#DBDBDB';

// The plots of the original have no title
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Oscillator', color: COL_UP, lineWidth: 1, style: 'area' },
  { id: 'plot1', title: 'Zero Line', color: CHART_FG, lineWidth: 2 },
  { id: 'plot2', title: 'Upper Threshold', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Lower Threshold', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Lower Bound', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Upper Bound', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Invalidation Level', color: COL_UP, lineWidth: 2, style: 'linebr', forceOverlay: true },
];

export const metadata = {
  title: 'Linear Regression Oscillator [ChartPrime]',
  shortTitle: 'Linear Regression Oscillator [ChartPrime]',
  overlay: false,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** A float used as a condition: na and 0 are false */
const truthy = (x: number) => !Number.isNaN(x) && x !== 0;

export function calculate(
  bars: Bar[],
  inputs: Partial<LinearRegressionOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers' | 'labels' | 'plotCandles' | 'barColors'> & {
  markers: MarkerData[]; labels: LabelData[]; plotCandles: Record<string, PlotCandleData[]>; barColors: BarColorData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length = cfg.length;
  if (length < 1) throw new Error('Linear Regression Oscillator: Length must be 1 or more');
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);

  // Slope and intercept of the least squares line of the last `length` closes (x = 0 on the current bar)
  const raw: number[] = new Array(n);
  for (let bar = 0; bar < n; bar++) {
    let sumX = 0.0;
    let sumY = 0.0;
    let sumXY = 0.0;
    let sumXSquared = 0.0;
    for (let i = 0; i <= length - 1; i++) {
      const src = bar - i >= 0 ? close[bar - i] : NaN;
      sumX += i;
      sumY += src;
      sumXY += i * src;
      sumXSquared += i * i;
    }
    const m = (length * sumXY - sumX * sumY) / (length * sumXSquared - sumX * sumX);
    const c = (sumY - m * sumX) / length;
    raw[bar] = (m * bar + c) * -1;
  }
  // Normalization
  const rawSeries = Series.fromArray(bars, raw);
  const mean = A(ta.sma(rawSeries, 100));
  const dev = A(ta.stdev(rawSeries, 100));
  const lr = raw.map((v, i) => (v - mean[i]) / dev[i]);
  const lrSeries = Series.fromArray(bars, lr);

  // Trend (zero crosses) and mean reversion (turn beyond a threshold) conditions
  const cond1 = A(ta.crossunder(lrSeries, 0)).map((v) => v === 1);
  const cond2 = A(ta.crossover(lrSeries, 0)).map((v) => v === 1);
  const lr2 = lrSeries.offset(2);
  const turnDown = A(ta.crossunder(lrSeries, lr2)).map((v) => v === 1);
  const turnUp = A(ta.crossover(lrSeries, lr2)).map((v) => v === 1);

  const colDn = COL_DN;
  const colUp = COL_UP;
  const fgHalf = String(color.new(CHART_FG, 50));
  const lowest = array.new_float(5, NaN);
  const highest = array.new_float(5, NaN);
  let points = NaN;

  const labels: LabelData[] = [];
  const newLabel = (l: LabelData) => {
    labels.push(l);
    // above max + 5 labels the oldest are deleted until max remain
    if (labels.length > MAX_LABELS + 5) labels.splice(0, labels.length - MAX_LABELS);
  };
  const markers: MarkerData[] = [];
  const candles: PlotCandleData[] = [];
  const barColors: BarColorData[] = [];
  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: Array<{ time: number; value: number; color: string }> = [];
  const plot6: Array<{ time: number; value: number; color: string }> = [];

  for (let i = 0; i < n; i++) {
    const { open, high, low, time } = bars[i];
    const v = lr[i];
    const prev = i >= 1 ? lr[i - 1] : NaN;
    // cond_1 / cond_2: the previous oscillator value on a turn beyond the threshold, else na
    const reversionDown = turnDown[i] && gt(v, cfg.upper) ? prev : NaN;
    const reversionUp = turnUp[i] && lt(v, cfg.lower) ? prev : NaN;

    // Invalidation price levels: extremes of the last 5 bars
    array.push(lowest, low);
    array.push(highest, high);
    if (array.size(lowest) > 5) {
      array.shift(lowest);
      array.shift(highest);
    }
    const prevPoints = points;
    if (cond1[i]) points = array.max(highest);
    else if (cond2[i]) points = array.min(lowest);

    // Colours
    const positive = gt(v, 0);
    const col = String(positive ? color.from_gradient(v, 0, 2, NA_COLOR, colUp) : color.from_gradient(v, -2, 0, colDn, NA_COLOR));
    const col1 = String(positive ? color.from_gradient(v, 0, 2, NA_COLOR, fgHalf) : color.from_gradient(v, -2, 0, fgHalf, NA_COLOR));
    const col2 = String(positive ? color.from_gradient(v, 0, 1, NA_COLOR, colUp) : color.from_gradient(v, -1, 0, colDn, NA_COLOR));
    plot0.push({ time, value: Number.isFinite(v) ? v : NaN, color: col });
    plot1.push({ time, value: 0, color: col1 });

    // Threshold labels on the last bar
    if (i === n - 1) {
      newLabel({ time, price: cfg.upper, text: str.tostring(cfg.upper), style: 'diamond', size: 'tiny', textColor: CHART_FG, color: colUp });
      newLabel({ time, price: cfg.lower, text: str.tostring(cfg.lower), style: 'diamond', size: 'tiny', textColor: CHART_FG, color: colDn });
    }

    // plotchar(..., location = location.absolute, offset = -1): drawn on the previous bar
    if (i >= 1) {
      const t1 = bars[i - 1].time;
      const char = (price: number, text: string, css: string, size: 'small' | 'tiny') => {
        markers.push({ time: t1, position: 'atPriceMiddle', price, shape: 'circle', color: 'transparent', text, textColor: css, size });
      };
      if (!Number.isNaN(reversionDown)) char(reversionDown, '◇', colDn, 'small');
      if (!Number.isNaN(reversionUp)) char(reversionUp, '◇', colUp, 'small');
      if (cond1[i]) char(0, '◆', String(color.new(colDn, 0)), 'tiny');
      if (cond2[i]) char(0, '◆', String(color.new(colUp, 0)), 'tiny');
    }

    // Trend labels on the price
    if (cond2[i]) {
      newLabel({ time, price: low, text: '▲', style: 'label_up', textColor: colUp, size: 'large', color: 'transparent', forceOverlay: true });
    } else if (cond1[i]) {
      newLabel({ time, price: high, text: '▽', style: 'label_down', textColor: colDn, size: 'large', color: 'transparent', forceOverlay: true });
    }
    // Mean reversion labels on the price
    if (truthy(reversionUp)) {
      newLabel({ time, price: low, text: '◆\nReversion', style: 'label_up', textColor: colUp, size: 'normal', color: 'transparent', forceOverlay: true });
    } else if (truthy(reversionDown)) {
      newLabel({ time, price: high, text: 'Reversion\n◆', style: 'label_down', textColor: colDn, size: 'normal', color: 'transparent', forceOverlay: true });
    }

    // Invalidation level: the line breaks on the bar where the level changes, with a label at the old level
    const change = points - prevPoints;
    plot6.push({ time, value: !truthy(change) ? points : NaN, color: col2 });
    if (truthy(change)) {
      newLabel({
        time, price: prevPoints, text: 'Invalidation\nLevel', style: 'label_left', textColor: lt(v, 0) ? colUp : colDn,
        size: 'small', color: 'transparent', forceOverlay: true,
      });
    }

    // Candle colours
    const candleCol = cfg.candles ? (lt(v, 0) ? colDn : colUp) : 'transparent';
    candles.push({
      time, open, high, low, close: close[i], color: candleCol, borderColor: candleCol, wickColor: candleCol, forceOverlay: true,
    });
    if (cfg.candles) barColors.push({ time, color: candleCol });
  }

  const constant = (value: number) => bars.map((b) => ({ time: b.time, value }));
  const upFill = String(color.new(colUp, 75));
  const dnFill = String(color.new(colDn, 75));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0,
      plot1,
      plot2: constant(cfg.upper),
      plot3: constant(cfg.lower),
      plot4: constant(-4),
      plot5: constant(4),
      plot6,
    },
    fills: [
      // fill(p1, p2, 4, upper, na, color.new(col_up, 75))
      {
        plot1: 'plot2', plot2: 'plot5',
        gradient: {
          topValue: bars.map(() => 4), bottomValue: bars.map(() => cfg.upper),
          topColor: bars.map(() => null), bottomColor: bars.map(() => upFill),
        },
      },
      // fill(p3, p4, lower, -4, color.new(col_dn, 75), na)
      {
        plot1: 'plot3', plot2: 'plot4',
        gradient: {
          topValue: bars.map(() => cfg.lower), bottomValue: bars.map(() => -4),
          topColor: bars.map(() => dnFill), bottomColor: bars.map(() => null),
        },
      },
    ],
    markers,
    labels,
    plotCandles: { colorCandles: candles },
    barColors,
  };
}

export const LinearRegressionOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
