/**
 * STC Indicator - A Better MACD (Schaff Trend Cycle)
 *
 * MACD line = EMA(close, FastLength) - EMA(close, SlowLength). A first stochastic of the MACD over `Length` bars
 * (kept when the range is 0) is smoothed by a factor AAA, then a second stochastic of that smoothed line over
 * `Length` bars is smoothed again: the STC line, green when it rises and red otherwise. Two lines at 25 and 75
 * with a fill between them.
 *
 * Reference: "STC Indicator - A Better MACD [SHK]" by shayankm
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface StcIndicatorABetterMacdInputs {
  /** Stochastic length */
  length: number;
  /** Fast EMA length */
  fastLength: number;
  /** Slow EMA length */
  slowLength: number;
  /** Smoothing factor of the two stochastic steps */
  factor: number;
}

export const defaultInputs: StcIndicatorABetterMacdInputs = {
  length: 12,
  fastLength: 26,
  slowLength: 50,
  factor: 0.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 12 },
  { id: 'fastLength', type: 'int', title: 'FastLength', defval: 26 },
  { id: 'slowLength', type: 'int', title: 'SlowLength', defval: 50 },
  { id: 'factor', type: 'float', title: 'AAA', defval: 0.5 },
];

const LEVEL_COLOR = String(color.new('#787B86', 70));
const FILL_COLOR = String(color.new('#787B86', 96));
const UP_COLOR = String(color.new('#4CAF50', 20));
const DOWN_COLOR = String(color.new('#FF5252', 20));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'STC', color: '#2962FF', lineWidth: 2 },
  { id: 'plot1', title: 'Level 25', color: LEVEL_COLOR, lineWidth: 1 },
  { id: 'plot2', title: 'Level 75', color: LEVEL_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: '[SHK] Schaff Trend Cycle (STC)',
  shortTitle: 'STC',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(bars: Bar[], inputs: Partial<StcIndicatorABetterMacdInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const { length, fastLength, slowLength, factor } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const close = S(bars.map((b) => b.close));
  const fast = A(ta.ema(close, fastLength));
  const slow = A(ta.ema(close, slowLength));
  const macd = fast.map((f, i) => f - slow[i]);
  const ccc = A(ta.lowest(S(macd), length));
  const cHigh = A(ta.highest(S(macd), length));

  // First stochastic + smoothing (DDD), then the lowest / highest of DDD
  const k1: number[] = new Array(n);
  const ddd: number[] = new Array(n);
  let prevK1 = NaN;
  let prevD = NaN;
  for (let i = 0; i < n; i++) {
    const range = cHigh[i] - ccc[i];
    // CCCCC := CCCC > 0 ? (BBBBBB - CCC) / CCCC * 100 : nz(CCCCC[1])
    k1[i] = gt(range, 0) ? ((macd[i] - ccc[i]) / range) * 100 : (isNaN(prevK1) ? 0 : prevK1);
    // DDD := na(DDD[1]) ? CCCCC : DDD[1] + AAA * (CCCCC - DDD[1])
    ddd[i] = isNaN(prevD) ? k1[i] : prevD + factor * (k1[i] - prevD);
    prevK1 = k1[i];
    prevD = ddd[i];
  }
  const dLow = A(ta.lowest(S(ddd), length));
  const dHigh = A(ta.highest(S(ddd), length));

  const stc: number[] = new Array(n);
  let prevK2 = NaN;
  let prevE = NaN;
  for (let i = 0; i < n; i++) {
    const range = dHigh[i] - dLow[i];
    const k2 = gt(range, 0) ? ((ddd[i] - dLow[i]) / range) * 100 : (isNaN(prevK2) ? 0 : prevK2);
    stc[i] = isNaN(prevE) ? k2 : prevE + factor * (k2 - prevE);
    prevK2 = k2;
    prevE = stc[i];
  }

  const plot0 = bars.map((b, i) => ({
    time: b.time,
    value: Number.isFinite(stc[i]) ? stc[i] : NaN,
    color: i > 0 && gt(stc[i], stc[i - 1]) ? UP_COLOR : DOWN_COLOR,
  }));
  const plot1 = bars.map((b) => ({ time: b.time, value: 25 }));
  const plot2 = bars.map((b) => ({ time: b.time, value: 75 }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [{ plot1: 'plot1', plot2: 'plot2', options: { color: FILL_COLOR } }],
  };
}

export const StcIndicatorABetterMacd = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
