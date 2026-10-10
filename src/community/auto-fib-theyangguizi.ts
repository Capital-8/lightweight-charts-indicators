/**
 * Auto Fib (FibFib)
 *
 * Fibonacci levels of the range between the highest and the lowest close of the last `fiblength` bars: 1 (highest
 * close), 0.764, 0.618, 0.5, 0.382, 0.236 and 0 (lowest close), with a coloured fill between each pair of levels.
 *
 * Reference: "FibFib" (Auto Fib) by TheYangGuizi
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar } from 'oakscriptjs';

export interface AutoFibTheyangguiziInputs {
  /** Number of bars of the range */
  fiblength: number;
}

export const defaultInputs: AutoFibTheyangguiziInputs = {
  fiblength: 265,
};

export const inputConfig: InputConfig[] = [
  { id: 'fiblength', type: 'int', title: 'fiblength', defval: 265 },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35); fills: 90
const V1 = (hex: string) => String(color.new(hex, 35));
const fillOf = (hex: string) => String(color.new(hex, 90));
const RED = '#FF0000';
const LIGHT_BLUE = '#3399FF';
const LIME = '#00FF00';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '1', color: V1('#000000'), lineWidth: 1 },
  { id: 'plot1', title: '0.764', color: V1(LIGHT_BLUE), lineWidth: 1 },
  { id: 'plot2', title: '0.618', color: V1('#0000FF'), lineWidth: 1 },
  { id: 'plot3', title: '0.5', color: V1(LIME), lineWidth: 1 },
  { id: 'plot4', title: '0.382', color: V1('#008000'), lineWidth: 1 },
  { id: 'plot5', title: '0.236', color: V1(RED), lineWidth: 1 },
  { id: 'plot6', title: '0', color: V1('#000000'), lineWidth: 1 },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill0', plot1: 'plot0', plot2: 'plot1', color: fillOf(RED), title: 'Plots Background' },
  { id: 'fill1', plot1: 'plot1', plot2: 'plot2', color: fillOf(LIGHT_BLUE), title: 'Plots Background' },
  { id: 'fill2', plot1: 'plot2', plot2: 'plot3', color: fillOf(LIME), title: 'Plots Background' },
  { id: 'fill3', plot1: 'plot3', plot2: 'plot4', color: fillOf(LIME), title: 'Plots Background' },
  { id: 'fill4', plot1: 'plot4', plot2: 'plot5', color: fillOf(LIGHT_BLUE), title: 'Plots Background' },
  { id: 'fill5', plot1: 'plot5', plot2: 'plot6', color: fillOf(RED), title: 'Plots Background' },
];

export const metadata = {
  title: 'FibFib',
  shortTitle: 'AutoFib',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<AutoFibTheyangguiziInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const maxr = ta.highest(close, cfg.fiblength).toArray();
  const minr = ta.lowest(close, cfg.fiblength).toArray();

  const plots: Record<string, Array<{ time: number; value: number }>> = {
    plot0: [], plot1: [], plot2: [], plot3: [], plot4: [], plot5: [], plot6: [],
  };
  bars.forEach((b, i) => {
    const hi = maxr[i] ?? NaN;
    const lo = minr[i] ?? NaN;
    const ranr = hi - lo;
    const levels = [hi, hi - 0.236 * ranr, hi - 0.382 * ranr, hi - 0.5 * ranr, lo + 0.382 * ranr, lo + 0.236 * ranr, lo];
    levels.forEach((value, k) => plots[`plot${k}`].push({ time: b.time, value }));
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: fillConfig.map((f) => ({ plot1: f.plot1, plot2: f.plot2, options: { color: f.color, title: f.title } })),
  };
}

export const AutoFibTheyangguizi = { calculate, metadata, defaultInputs, inputConfig, plotConfig, fillConfig };
