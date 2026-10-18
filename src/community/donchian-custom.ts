/**
 * CM_Donchian Channels Modified
 *
 * Donchian channel with separate lengths for its two sides: the upper line is the highest high of the last
 * `Upper Channel` bars (lime), the lower line the lowest low of the last `Lower Channel` bars (red), the mid line their
 * average (yellow); the channel between the upper and lower lines is filled (white, 75 % transparent).
 *
 * Reference: "CM_Donchian Channels Modified" by ChrisMoody
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface DonchianCustomInputs {
  /** Upper Channel */
  upperLen: number;
  /** Lower Channel */
  lowerLen: number;
}

export const defaultInputs: DonchianCustomInputs = {
  upperLen: 4,
  lowerLen: 60,
};

export const inputConfig: InputConfig[] = [
  { id: 'upperLen', type: 'int', title: 'Upper Channel', defval: 4, min: 1 },
  { id: 'lowerLen', type: 'int', title: 'Lower Channel', defval: 60, min: 1 },
];

/** Pine version 1 colours: red, lime, yellow */
const RED = '#FF0000';
const LIME = '#00FF00';
const YELLOW = '#FFFF00';
/** fill(u, l, color = white, transp = 75) */
const FILL = 'rgba(255, 255, 255, 0.25)';

// l = plot(lower), u = plot(upper) (both untitled), plot(basis, title = "Mid-Line Average")
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: RED, lineWidth: 4 },
  { id: 'plot1', title: 'Plot', color: LIME, lineWidth: 4 },
  { id: 'plot2', title: 'Mid-Line Average', color: YELLOW, lineWidth: 1 },
];

export const metadata = {
  title: 'CM_Donchian Channels Modified',
  shortTitle: 'CM_DC Modified',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<DonchianCustomInputs> = {}): IndicatorResult {
  const { upperLen, lowerLen } = { ...defaultInputs, ...inputs };

  const upper = ta.highest(new Series(bars, (b) => b.high), upperLen).toArray().map((v) => v ?? NaN);
  const lower = ta.lowest(new Series(bars, (b) => b.low), lowerLen).toArray().map((v) => v ?? NaN);
  // avg(upper, lower): na when one of them is na
  const basis = upper.map((u, i) => (u + lower[i]) / 2);

  const line = (v: number[]) => bars.map((b, i) => ({ time: b.time, value: v[i] }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: line(lower), plot1: line(upper), plot2: line(basis) },
    fills: [{ plot1: 'plot1', plot2: 'plot0', options: { title: 'Fill', color: FILL } }],
  };
}

export const DonchianCustom = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
