/**
 * UCS_Stochastic Momentum Index
 *
 * Stochastic Momentum Index with nested EMAs: over the highest high / lowest low of a (Percent K Length) bars,
 * rdiff = close - (hh + ll) / 2 and diff = hh - ll; SMI = EMA(EMA(rdiff, b), b) / (EMA(EMA(diff, b), b) / 2) * 100
 * (0 when the smoothed range is 0 or na), signal = EMA(SMI, b) (b: Percent D Length). Lines at 40 (Over Bought),
 * -40 (Over Sold) and 0 (Zero Line) are plots.
 *
 * Reference: "UCS_Stochastic Momentum Index" by UCSgears
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface SMIUCSInputs {
  /** a: Percent K Length */
  kLen: number;
  /** b: Percent D Length */
  dLen: number;
}

export const defaultInputs: SMIUCSInputs = {
  kLen: 5,
  dLen: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'kLen', type: 'int', title: 'Percent K Length', defval: 5 },
  { id: 'dLen', type: 'int', title: 'Percent D Length', defval: 3 },
];

/** Pine default plot colour (the SMI plot has no colour argument) */
const PINE_BLUE = '#2962FF';
/** Pine v1 colour constants */
const RED = '#FF0000';
const GREEN = '#008000';
const BLUE = '#0000FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Stochastic Momentum Index', color: PINE_BLUE, lineWidth: 1 },
  { id: 'plot1', title: 'SMI Signal Line', color: RED, lineWidth: 1 },
  { id: 'plot2', title: 'Over Bought', color: RED, lineWidth: 1 },
  { id: 'plot3', title: 'Over Sold', color: GREEN, lineWidth: 1 },
  { id: 'plot4', title: 'Zero Line', color: BLUE, lineWidth: 1 },
];

export const metadata = {
  title: 'UCS_Stochastic Momentum Index',
  shortTitle: 'UCS_SMI',
  overlay: false,
};

/** Pine `x != 0`: false when x is na, true when |x| > 1e-10 */
const EPS = 1e-10;
const ne0 = (a: number) => !isNaN(a) && Math.abs(a) > EPS;

export function calculate(bars: Bar[], inputs: Partial<SMIUCSInputs> = {}): IndicatorResult {
  const { kLen: a, dLen: b } = { ...defaultInputs, ...inputs };
  const num = (v: number | null | undefined) => (v == null ? NaN : v);

  // ll = lowest(low, a); hh = highest(high, a); diff = hh - ll; rdiff = close - (hh + ll) / 2
  const ll = ta.lowest(new Series(bars, (x) => x.low), a);
  const hh = ta.highest(new Series(bars, (x) => x.high), a);
  const diff = hh.sub(ll);
  const rdiff = new Series(bars, (x) => x.close).sub(hh.add(ll).div(2));

  // avgrel = ema(ema(rdiff, b), b); avgdiff = ema(ema(diff, b), b)
  const avgrel = ta.ema(ta.ema(rdiff, b), b).toArray().map(num);
  const avgdiff = ta.ema(ta.ema(diff, b), b).toArray().map(num);

  // SMI = avgdiff != 0 ? (avgrel / (avgdiff / 2) * 100) : 0
  const smi = bars.map((_x, i) => (ne0(avgdiff[i]) ? avgrel[i] / (avgdiff[i] / 2) * 100 : 0));
  // SMIsignal = ema(SMI, b)
  const signal = ta.ema(Series.fromArray(bars, smi), b).toArray().map(num);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((x, i) => ({ time: x.time, value: smi[i] })),
      plot1: bars.map((x, i) => ({ time: x.time, value: signal[i] })),
      plot2: bars.map((x) => ({ time: x.time, value: 40 })),
      plot3: bars.map((x) => ({ time: x.time, value: -40 })),
      plot4: bars.map((x) => ({ time: x.time, value: 0 })),
    },
  };
}

export const SMIUCS = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
