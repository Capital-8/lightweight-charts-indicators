/**
 * Reversal Correlation Pressure [OmegaTools]
 *
 * Pressure: the z-score of the high / low correlation over `length` bars against its SMA / stdev over 5 * `length`
 * bars, clamped to [0, 2], drawn as columns (gradient colour above 1, grey otherwise). Signals: the close z-score
 * over `length` bars below -2 (long) / above 2 (short). Two rolling backtests (the last 250 outcomes of the signals of
 * 10 bars before, split by the pressure state of that bar: above 1 or not) keep the signal when the pressure state
 * of the current bar has the better win rate: mean reversion (pressure > 1 vs < 1) and trend following (signals
 * reversed, pressure > 1 vs <= 0). The sum of both gives arrows on the price pane (the original's plotarrow with
 * force_overlay, `arrows` of the result, id 'arrow0') and bar colours.
 *
 * Reference: "Reversal Correlation Pressure [OmegaTools]" by OmegaTools
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © OmegaTools
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import type { ArrowData } from 'oakscriptjs';

export interface ReversalCorrelationPressureInputs {
  /** Correlation / z-score length */
  length: number;
}

export const defaultInputs: ReversalCorrelationPressureInputs = {
  length: 21,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 21 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Pressure', color: '#2962FF', lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'Reversal Correlation Pressure [OmegaTools]',
  shortTitle: 'Reversal Correlation Pressure [OmegaTools]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

const UP = '#2962ff';
const DOWN = '#e91e63';
const X = 10;
const MAX_SIZE = 250;

/**
 * backtester(long, short, cond1, cond2, x): one call site (its own `var` arrays) called on every bar.
 * Returns the output series (1, -1 or 0).
 */
function backtester(close: number[], long: boolean[], short: boolean[], cond1: boolean[], cond2: boolean[]): number[] {
  const n = close.length;
  const c1: number[] = [];
  const c2: number[] = [];
  const out: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const j = i - X;
    if (j >= 0 && long[j]) {
      if (cond1[j]) c1.push(gt(close[i], close[j]) ? 1 : 0);
      if (cond2[j]) c2.push(gt(close[i], close[j]) ? 1 : 0);
    }
    if (j >= 0 && short[j]) {
      if (cond1[j]) c1.push(lt(close[i], close[j]) ? 1 : 0);
      if (cond2[j]) c2.push(lt(close[i], close[j]) ? 1 : 0);
    }
    if (c1.length > MAX_SIZE) c1.shift();
    if (c2.length > MAX_SIZE) c2.shift();
    // c.sum() / c.size() * 100: na (0 / 0) for an empty array
    const wr1 = (c1.reduce((a, b) => a + b, 0) / c1.length) * 100;
    const wr2 = (c2.reduce((a, b) => a + b, 0) / c2.length) * 100;
    let output = 0;
    if ((gt(wr1, wr2) && cond1[i]) || (gt(wr2, wr1) && cond2[i])) {
      if (long[i]) output = 1;
      if (short[i]) output = -1;
    }
    out[i] = output;
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ReversalCorrelationPressureInputs> = {},
): IndicatorResult & { arrows: ArrowData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const lnt = cfg.length;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  const corr = A(ta.correlation(S(bars.map((b) => b.high)), S(bars.map((b) => b.low)), lnt));
  const corrMean = A(ta.sma(S(corr), lnt * 5));
  const corrDev = A(ta.stdev(S(corr), lnt * 5));
  // z = math.min(math.max((corr - sma) / stdev, -0), 2): x / 0 is +-infinity (clamped), 0 / 0 is na
  const z = corr.map((c, i) => Math.min(Math.max((c - corrMean[i]) / corrDev[i], -0), 2));

  const mean = A(ta.sma(S(close), lnt));
  const dev = A(ta.stdev(S(close), lnt));
  const zscore = close.map((c, i) => (c - mean[i]) / dev[i]);
  const long = zscore.map((v) => lt(v, -2));
  const short = zscore.map((v) => gt(v, 2));

  const zAbove1 = z.map((v) => gt(v, 1));
  const signalmr = backtester(close, long, short, zAbove1, z.map((v) => lt(v, 1)));
  const signaltf = backtester(close, short, long, zAbove1, z.map((v) => le(v, 0)));

  const low = String(color.new(color.gray, 50));
  const bottom = String(color.new('#1100fc', 30));
  const top = String(color.new('#ee00ff', 0));
  const plot0 = [];
  const arrows: ArrowData[] = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const zcol = zAbove1[i] ? String(color.from_gradient(z[i], 1, 2, bottom, top)) : low;
    // plot(z != 0 ? z : na, 'Pressure', zcol, style = plot.style_columns)
    plot0.push({ time: t, value: ne(z[i], 0) ? z[i] : NaN, color: zcol });
    const signal = signalmr[i] + signaltf[i];
    // plotarrow(signal, 'Filtered Signal', #2962ff, #e91e63, 0, 10, 15, force_overlay = true)
    if (signal > 0) {
      arrows.push({ time: t, id: 'arrow0', value: signal, color: UP });
      barColors.push({ time: t, color: UP });
    } else if (signal < 0) {
      arrows.push({ time: t, id: 'arrow0', value: signal, color: DOWN });
      barColors.push({ time: t, color: DOWN });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    arrows,
    barColors,
  };
}

export const ReversalCorrelationPressure = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
