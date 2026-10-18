/**
 * WaveTrend Oscillator
 *
 * LazyBear's WaveTrend: ap = hlc3, esa = ema(ap, n1), d = ema(abs(ap - esa), n1), ci = (ap - esa) / (0.015 * d),
 * wt1 = ema(ci, n2), wt2 = sma(wt1, 4) (each na until its inputs exist and its window is full). The original's eight
 * plots, in its order: 0 (gray), Over Bought Level 1 (red), Over Sold Level 1 (green), Over Bought Level 2 (red,
 * cross), Over Sold Level 2 (green, cross), wt1 (green), wt2 (red, cross), wt1 - wt2 (blue area, 80% transparent).
 * No markers, bar colours, horizontal lines or fills: the original draws plots only.
 *
 * Reference: "WaveTrend Oscillator" by LazyBear
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface WavetrendOscillatorInputs {
  channelLength: number;
  avgLength: number;
  obLevel1: number;
  obLevel2: number;
  osLevel1: number;
  osLevel2: number;
}

export const defaultInputs: WavetrendOscillatorInputs = {
  channelLength: 10,
  avgLength: 21,
  obLevel1: 60,
  obLevel2: 53,
  osLevel1: -60,
  osLevel2: -53,
};

export const inputConfig: InputConfig[] = [
  { id: 'channelLength', type: 'int', title: 'Channel Length', defval: 10, min: 1 },
  { id: 'avgLength', type: 'int', title: 'Average Length', defval: 21, min: 1 },
  { id: 'obLevel1', type: 'int', title: 'Over Bought Level 1', defval: 60 },
  { id: 'obLevel2', type: 'int', title: 'Over Bought Level 2', defval: 53 },
  { id: 'osLevel1', type: 'int', title: 'Over Sold Level 1', defval: -60 },
  { id: 'osLevel2', type: 'int', title: 'Over Sold Level 2', defval: -53 },
];

/** Colours of Pine versions 1-3 (the original's version) */
const GRAY = '#808080';
const RED = '#FF0000';
const GREEN = '#008000';
const BLUE = '#0000FF';
const DIFF_COLOR = String(color.new(BLUE, 80));

export const plotConfig: PlotConfig[] = [
  { id: 'zero', title: 'Plot', color: GRAY, lineWidth: 1 },
  { id: 'ob1', title: 'Plot', color: RED, lineWidth: 1 },
  { id: 'os1', title: 'Plot', color: GREEN, lineWidth: 1 },
  { id: 'ob2', title: 'Plot', color: RED, lineWidth: 1, style: 'cross' },
  { id: 'os2', title: 'Plot', color: GREEN, lineWidth: 1, style: 'cross' },
  { id: 'wt1', title: 'Plot', color: GREEN, lineWidth: 1 },
  { id: 'wt2', title: 'Plot', color: RED, lineWidth: 1, style: 'cross' },
  { id: 'diff', title: 'Plot', color: DIFF_COLOR, lineWidth: 1, style: 'area' },
];

export const metadata = {
  title: 'WaveTrend Oscillator',
  shortTitle: 'WT',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<WavetrendOscillatorInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const t = (i: number) => bars[i].time;
  const arr = (x: Series) => x.toArray().map((v) => v ?? NaN);

  // ap = hlc3; esa = ema(ap, n1); d = ema(abs(ap - esa), n1); ci = (ap - esa) / (0.015 * d)
  const ap = new Series(bars, (b) => (b.high + b.low + b.close) / 3);
  const apArr = arr(ap);
  const esaArr = arr(ta.ema(ap, cfg.channelLength));
  const dArr = arr(ta.ema(Series.fromArray(bars, apArr.map((v, i) => Math.abs(v - esaArr[i]))), cfg.channelLength));
  // a division by 0 is na
  const ci = apArr.map((v, i) => (dArr[i] === 0 ? NaN : (v - esaArr[i]) / (0.015 * dArr[i])));
  // wt1 = tci = ema(ci, n2); wt2 = sma(wt1, 4)
  const wt1Arr = arr(ta.ema(Series.fromArray(bars, ci), cfg.avgLength));
  const wt2Arr = arr(ta.sma(Series.fromArray(bars, wt1Arr), 4));

  const line = (v: (i: number) => number) => bars.map((_b, i) => ({ time: t(i), value: v(i) }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      zero: line(() => 0),
      ob1: line(() => cfg.obLevel1),
      os1: line(() => cfg.osLevel1),
      ob2: line(() => cfg.obLevel2),
      os2: line(() => cfg.osLevel2),
      wt1: line((i) => wt1Arr[i]),
      wt2: line((i) => wt2Arr[i]),
      diff: line((i) => wt1Arr[i] - wt2Arr[i]),
    },
  };
}

export const WavetrendOscillator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
