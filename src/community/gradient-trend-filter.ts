/**
 * Gradient Trend Filter [ChartPrime]
 *
 * A three-stage EMA noise filter of the source gives the trend line; the same filter of (high - low) gives the band
 * width, with three band pairs at 0.236 * 1.5, 0.382 * 2 and 0.618 * 2.5 of it. The bands are filled with a colour
 * from a gradient of diff = filter - filter[2] between its lowest and highest value of the last 100 bars. Orange
 * diamonds mark the crossings of diff over / under 0, drawn on the previous bar.
 * The Pine 'Line Width' input is not ported: plot widths are fixed by plotConfig (the Pine default, 2).
 *
 * Reference: "Gradient Trend Filter [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface GradientTrendFilterInputs {
  src: SourceType;
  length: number;
  /** Up colour */
  color1: string;
  /** Down colour */
  color2: string;
  /** Transparency of the band fills (0..100) */
  transp: number;
}

export const defaultInputs: GradientTrendFilterInputs = {
  src: 'close',
  length: 25,
  color1: '#22c878',
  color2: '#c8224e',
  transp: 80,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'length', type: 'int', title: 'Length', defval: 25 },
  { id: 'color1', type: 'color', title: 'Up Color', defval: '#22c878' },
  { id: 'color2', type: 'color', title: 'Down Color', defval: '#c8224e' },
  { id: 'transp', type: 'int', title: 'Transparency', defval: 80 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Filter', color: '#22c878', lineWidth: 2 },
  { id: 'plot1', title: 'Upper 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Upper 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Upper 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Lower 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Lower 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Lower 3', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Gradient Trend Filter [ChartPrime]',
  shortTitle: 'Gradient Trend Filter',
  overlay: true,
};

/** noise_filter(src, length): three chained EMAs with alpha = 2 / (length + 1), each started from 0 (nz) */
function noiseFilter(src: number[], length: number): number[] {
  const alpha = 2 / (length + 1);
  const out: number[] = new Array(src.length);
  let nf1 = NaN;
  let nf2 = NaN;
  let nf3 = NaN;
  const nz = (v: number) => (isNaN(v) ? 0 : v);
  for (let i = 0; i < src.length; i++) {
    nf1 = alpha * src[i] + (1 - alpha) * nz(nf1);
    nf2 = alpha * nf1 + (1 - alpha) * nz(nf2);
    nf3 = alpha * nf2 + (1 - alpha) * nz(nf3);
    out[i] = nf3;
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<GradientTrendFilterInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const { src, length, color1, color2, transp } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const source = getSourceSeries(bars, src).toArray().map((v) => v ?? NaN);

  const base = noiseFilter(source, length);
  const val = noiseFilter(bars.map((b) => b.high - b.low), length);
  const band = (k: number) => base.map((b, i) => b + val[i] * k);
  const upper3 = band(0.618 * 2.5);
  const upper2 = band(0.382 * 2);
  const upper1 = band(0.236 * 1.5);
  const lower1 = base.map((b, i) => b - val[i] * 0.236 * 1.5);
  const lower2 = base.map((b, i) => b - val[i] * 0.382 * 2);
  const lower3 = base.map((b, i) => b - val[i] * 0.618 * 2.5);

  // diff = base - base[2]
  const diff = base.map((b, i) => (i >= 2 ? b - base[i - 2] : NaN));
  const diffSeries = Series.fromArray(bars, diff);
  const lo = ta.lowest(diffSeries, 100).toArray();
  const hi = ta.highest(diffSeries, 100).toArray();

  const filter: { time: number; value: number; color: string }[] = [];
  const trendColors: string[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    // color gradient_col = color.from_gradient(diff, lowest(diff, 100), highest(diff, 100), color2, color1)
    // trend_color = color.new(gradient_col, transp)
    const grad = color.from_gradient(diff[i], lo[i] ?? NaN, hi[i] ?? NaN, color2, color1);
    trendColors.push(String(color.new(grad, transp)));
    // plot(base, "Filter", color = diff >= 0 ? color1 : color2)
    filter.push({ time: bars[i].time, value: base[i], color: diff[i] >= 0 ? color1 : color2 });
    // plotshape(signal_up / signal_dn ? base[1] : na, shape.diamond, location.absolute, offset = -1, color.orange)
    // signal: ta.crossover / ta.crossunder(diff, 0) (every historical bar is confirmed)
    if (i > 0 && !isNaN(diff[i - 1])) {
      const up = diff[i] > 0 && diff[i - 1] <= 0;
      const dn = diff[i] < 0 && diff[i - 1] >= 0;
      // shape0: the signal_up diamond, shape1: the signal_dn diamond
      if (up || dn) {
        markers.push({ id: up ? 'shape0' : 'shape1', time: bars[i - 1].time, position: 'atPriceMiddle', price: base[i - 1],
          shape: 'diamond', color: color.orange, size: 'tiny' });
      }
    }
  }

  const line = (arr: number[]) => bars.map((b, i) => ({ time: b.time, value: arr[i] }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: filter,
      plot1: line(upper3),
      plot2: line(upper2),
      plot3: line(upper1),
      plot4: line(lower1),
      plot5: line(lower2),
      plot6: line(lower3),
    },
    // fill(up3, lw3, trend_color); fill(up2, lw2, trend_color); fill(up1, lw1, trend_color)
    fills: [
      { plot1: 'plot1', plot2: 'plot6', colors: trendColors },
      { plot1: 'plot2', plot2: 'plot5', colors: trendColors },
      { plot1: 'plot3', plot2: 'plot4', colors: trendColors },
    ],
    markers,
  };
}

export const GradientTrendFilter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
