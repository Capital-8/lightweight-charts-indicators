/**
 * Scalp Pro
 *
 * A MACD built with two-pole "super smoother" filters instead of moving averages. Each filter is
 * `c1 * (x + x[1]) / 2 + c2 * y[1] + c3 * y[2]` with `a = exp(-1.414 * pi / length)`, `c2 = 2 * a * cos(1.414 * pi /
 * length)`, `c3 = -a * a` and `c1 = 1 - c2 - c3`. The main line is the fast filter of the close minus the slow one,
 * times 10,000,000; the signal line is the filter of the main line. A "Buy" label is drawn when the main line crosses
 * above the signal line, a "Sell" label when it crosses below.
 *
 * Limit of the port: the 2 alert conditions give no output.
 *
 * Reference: "Scalp Pro" by ovelix
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface ScalpProInputs {
  /** Length of the fast filter */
  fastLength: number;
  /** Length of the slow filter */
  slowLength: number;
  /** Length of the filter of the signal line */
  smoothLength: number;
}

export const defaultInputs: ScalpProInputs = {
  fastLength: 8,
  slowLength: 10,
  smoothLength: 8,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast Line', defval: 8, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow Line', defval: 10, min: 1 },
  { id: 'smoothLength', type: 'int', title: 'Smoothness', defval: 8, min: 1 },
];

// Colour constants of Pine version 2, with the default plot transparency of that version (35)
const LIME = String(color.new('#00FF00', 35));
const YELLOW = String(color.new('#FFFF00', 35));
const GREEN = '#008000';
const RED = '#FF0000';
const WHITE = '#FFFFFF';
// fill(p1, p2, color = black): the default fill transparency of that version is 90
const FILL = String(color.new('#000000', 90));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MACD', color: LIME, lineWidth: 2 },
  { id: 'plot1', title: 'Signal', color: YELLOW, lineWidth: 1 },
];

export const metadata = {
  title: 'Scalp Pro',
  shortTitle: 'Scalp Pro',
  overlay: false,
};

/** nz(): na becomes 0 */
const nz = (v: number) => (Number.isNaN(v) ? 0 : v);

/** y = c1 * (x + x[1]) * 0.5 + c2 * nz(y[1]) + c3 * nz(y[2]) */
function superSmoother(x: number[], length: number): number[] {
  const f = (1.414 * 3.141592653589793238462643) / length;
  const a = Math.exp(-f);
  const c2 = 2 * a * Math.cos(f);
  const c3 = -a * a;
  const c1 = 1 - c2 - c3;
  const y: number[] = new Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const prevX = i >= 1 ? x[i - 1] : NaN;
    y[i] = c1 * (x[i] + prevX) * 0.5 + c2 * nz(i >= 1 ? y[i - 1] : NaN) + c3 * nz(i >= 2 ? y[i - 2] : NaN);
  }
  return y;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ScalpProInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = bars.map((b) => b.close);

  const fast = superSmoother(close, cfg.fastLength);
  const slow = superSmoother(close, cfg.slowLength);
  const macd = fast.map((v, i) => (v - slow[i]) * 10000000);
  const signal = superSmoother(macd, cfg.smoothLength);

  const macdS = Series.fromArray(bars, macd);
  const signalS = Series.fromArray(bars, signal);
  const buy = ta.crossover(macdS, signalS).toArray();
  const sell = ta.crossunder(macdS, signalS).toArray();

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    // plotshape(buy, text = 'Buy', style = shape.labelup, location = location.belowbar, color = green,
    //   textcolor = white, transp = 0, size = size.tiny)
    if (buy[i]) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: GREEN, text: 'Buy', textColor: WHITE, size: 'tiny' });
    }
    if (sell[i]) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'Sell', textColor: WHITE, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: macd[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: signal[i] })),
    },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { color: FILL } }],
    markers,
  };
}

export const ScalpPro = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
