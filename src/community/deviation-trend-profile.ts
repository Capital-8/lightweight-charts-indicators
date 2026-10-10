/**
 * Deviation Trend Profile [BigBeluga]
 *
 * An SMA of the close with six levels around it at 1, 2 and 3 ATR(200) distances (the "standard deviation"
 * multipliers of the inputs). The slope of the SMA (its change over 5 bars, divided by the largest change of the
 * last 500 bars) colours the SMA from the down colour to the up colour. The trend turns up when that slope crosses
 * above 0.1 and down when it crosses below -0.1; each turn is marked by a circle on the SMA.
 *
 * On the last bar the levels are drawn as short lines with their label, and the "Trend Distribution Profile" is
 * drawn to the right of the chart: the range between the two outer levels is cut into bins, and for each bar since
 * the start of the trend the close is counted in every bin it falls in (one bin of margin on each side, with the
 * levels of that bar). Each bin is a box whose length is its count; a label gives the number of bars of the trend.
 * At most 500 boxes are kept.
 *
 * The port has no chart theme: the chart foreground and background colours used by the original are those of the
 * reference run (dark theme: foreground #DBDBDB, background #0F0F0F).
 *
 * Reference: "Deviation Trend Profile [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import { ta, str, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, LineDrawingData, LabelData, BoxData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface DeviationTrendProfileInputs {
  /** SMA length */
  length: number;
  mult1: number;
  mult2: number;
  mult3: number;
  /** Show the trend distribution profile */
  showTp: boolean;
  /** Number of bins of the profile */
  bins: number;
  /** Distance of the profile from the last bar, in bars */
  offset: number;
  colUp: string;
  colDn: string;
}

export const defaultInputs: DeviationTrendProfileInputs = {
  length: 50,
  mult1: 1,
  mult2: 2,
  mult3: 3,
  showTp: true,
  bins: 50,
  offset: 30,
  colUp: '#12D1EB',
  colDn: '#FA2856',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'SMA Length', defval: 50, group: 'SMA' },
  { id: 'mult1', type: 'int', title: 'Standart Deviation 1', defval: 1, group: 'Standart Deviation Levels' },
  { id: 'mult2', type: 'int', title: 'Standart Deviation 2', defval: 2, group: 'Standart Deviation Levels' },
  { id: 'mult3', type: 'int', title: 'Standart Deviation 3', defval: 3, group: 'Standart Deviation Levels' },
  { id: 'showTp', type: 'bool', title: 'Show', defval: true, group: 'Trend Distribution Profile' },
  { id: 'bins', type: 'int', title: 'Bins Amount', defval: 50, group: 'Trend Distribution Profile' },
  { id: 'offset', type: 'int', title: 'Offset', defval: 30, group: 'Trend Distribution Profile' },
  { id: 'colUp', type: 'color', title: '', defval: '#12D1EB', group: 'Theme', inline: 'c' },
  { id: 'colDn', type: 'color', title: '', defval: '#FA2856', group: 'Theme', inline: 'c' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SMA', color: '#2962FF', lineWidth: 3 },
];

export const metadata = {
  title: 'Deviation Trend Profile [BigBeluga]',
  shortTitle: 'Deviation Trend Profile [BigBeluga]',
  overlay: true,
};

/** chart.fg_color / chart.bg_color of the reference run (dark theme) */
const CHART_FG = '#DBDBDB';
const CHART_BG = '#0F0F0F';
/** indicator(max_boxes_count = 500) */
const MAX_BOXES = 500;

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

/** A colour as a string; an na colour (fully transparent) is 'transparent' */
const css = (c: unknown): string => {
  const s = String(c);
  return color.t(s) >= 100 ? 'transparent' : s;
};

export function calculate(
  bars: Bar[],
  inputs: Partial<DeviationTrendProfileInputs> = {},
): Omit<IndicatorResult, 'markers' | 'lines' | 'labels' | 'boxes'> & {
  markers: MarkerData[];
  lines: LineDrawingData[];
  labels: LabelData[];
  boxes: BoxData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { colUp, colDn } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const avg = A(ta.sma(new Series(bars, (b) => b.close), cfg.length));
  const atr = A(ta.atr(bars, 200));
  // max = stdv3, min = stdv_3
  const maxArr = avg.map((v, i) => v + atr[i] * cfg.mult3);
  const minArr = avg.map((v, i) => v - atr[i] * cfg.mult3);

  const avgDiff = avg.map((v, i) => (i >= 5 ? v - avg[i - 5] : NaN));
  const top = A(ta.percentile_linear_interpolation(Series.fromArray(bars, avgDiff), 500, 100));
  // a plain division (x / 0 is +-infinity, 0 / 0 is na)
  const avgCol = avgDiff.map((v, i) => v / top[i]);
  const avgColSeries = Series.fromArray(bars, avgCol);
  const level = (v: number) => Series.fromArray(bars, new Array(n).fill(v));
  const crossUp = ta.crossover(avgColSeries, level(0.1)).toArray();
  const crossDown = ta.crossunder(avgColSeries, level(-0.1)).toArray();
  const avgColor = avgCol.map((v) => css(color.from_gradient(v, -0.3, 0.3, colDn, colUp)));

  const up50 = String(color.new(colUp, 50));
  const dn50 = String(color.new(colDn, 50));
  const markers: MarkerData[] = [];
  const plot0: Array<{ time: number; value: number; color: string }> = [];

  // var trend = bool(na): false (a bool is never na); var start_index = int(na)
  let trend = false;
  let startIndex = NaN;
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const trendPrev: boolean = trend;
    if (crossUp[i] && !trend) {
      trend = true;
      startIndex = i;
    }
    if (crossDown[i] && trend) {
      trend = false;
      startIndex = i;
    }
    plot0.push({ time, value: avg[i], color: avgColor[i] });
    // trend != trend[1] (false on the first bar: trend[1] is na)
    if (i > 0 && trend !== trendPrev && !Number.isNaN(avg[i])) {
      const c = trend ? colUp : colDn;
      markers.push({ time, position: 'atPriceMiddle', price: avg[i], shape: 'circle', color: c, size: 'tiny' });
      markers.push({ time, position: 'atPriceMiddle', price: avg[i], shape: 'circle', color: trend ? up50 : dn50, size: 'small' });
    }
  }

  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  let boxes: BoxData[] = [];
  if (n > 0) {
    // barstate.islast
    const last = n - 1;
    const interval = barInterval(bars);
    const T = (index: number) => barTime(bars, index, interval);
    const lastColor = avgColor[last];

    // draw_stdv(): an object with an na price is not drawn
    const drawStdv = (mult: number, text: string, mid = false) => {
      const src = avg[last] + atr[last] * mult;
      if (mid && !Number.isNaN(avg[last])) {
        lines.push({ time1: T(last), price1: avg[last], time2: T(last + 5), price2: avg[last], color: lastColor, width: 2 });
      }
      if (Number.isNaN(src)) return;
      lines.push({ time1: T(last), price1: src, time2: T(last + 5), price2: src, color: CHART_FG, width: 2 });
      labels.push({ time: T(last + 5), price: src, text, style: 'label_left', color: css(color.new(CHART_FG, 100)), textColor: CHART_FG });
    };
    drawStdv(cfg.mult1, '+1', true);
    drawStdv(cfg.mult2, '+2');
    drawStdv(cfg.mult3, '+3');
    drawStdv(-cfg.mult1, '-1');
    drawStdv(-cfg.mult2, '-2');
    drawStdv(-cfg.mult3, '-3');

    // profile(min, max)
    if (cfg.showTp) {
      const bins = cfg.bins;
      const stepAt = (i: number) => (maxArr[i] - minArr[i]) / bins;
      const start = last + cfg.offset;
      const loockback = last - startIndex;
      const bin: number[] = new Array(Math.max(0, bins)).fill(0);
      if (!Number.isNaN(loockback)) {
        for (let l = 0; l <= loockback; l++) {
          const c = bars[last - l].close;
          const mi = minArr[last - l];
          const s = stepAt(last - l);
          for (let k = 0; k < bin.length; k++) {
            const lower = mi + s * k;
            const upper = lower + s;
            if (ge(c, lower - s) && le(c, upper + s)) bin[k] += 1;
          }
        }
      }
      const binMax = bin.reduce((m, v) => Math.max(m, v), -Infinity);
      const step = stepAt(last);
      const dim = String(color.new(CHART_FG, 80));
      for (let j = 0; j < bin.length; j++) {
        const val = bin[j];
        const lower = minArr[last] + step * j;
        const upper = lower + step;
        // when a creation brings the count above max + 5, the oldest boxes are deleted until max remain
        if (boxes.length + 1 > MAX_BOXES + 5) boxes = boxes.slice(boxes.length + 1 - MAX_BOXES);
        if (Number.isNaN(lower) || Number.isNaN(upper)) continue;
        boxes.push({
          time1: T(start - val), price1: upper, time2: T(start), price2: lower,
          bgColor: css(color.from_gradient(val, 0, binMax, dim, lastColor)),
          borderColor: val === 0 ? CHART_FG : CHART_BG,
        });
      }
      if (!Number.isNaN(maxArr[last])) {
        const text = str.tostring(loockback);
        labels.push({
          time: T(start), price: maxArr[last], text, color: css(color.new(lastColor === 'transparent' ? null : lastColor, 80)),
          textColor: CHART_FG, tooltip: text + ' bars back beginnig of the trend',
        });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    lines,
    labels,
    boxes,
  };
}

export const DeviationTrendProfile = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
