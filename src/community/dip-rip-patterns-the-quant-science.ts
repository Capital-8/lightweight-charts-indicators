/**
 * Dip & Rip Patterns
 *
 * Measures the move of the current bar against the extremes of the previous (period - 1) bars. Rip: the high is at
 * least `rip` % above the lowest previous low. Dip: the low is at least `dip` % (a negative threshold) under the
 * highest previous high. A bar with only a dip gets a red bar colour and a red circle under the bar; a bar with only
 * a rip gets a green bar colour and a green circle above the bar (a bar with both gets nothing). The script has no
 * plot. The original shows the signals of the last bar only once the bar is closed. The port reads the state of the
 * last bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Dip & Rip Patterns [The Quant Science]" by thequantscience
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface DipRipPatternsInputs {
  /** Analysis period [bars]: the current bar and (period - 1) previous bars */
  analysisPeriod: number;
  /** Dip threshold [%] (negative) */
  dipThreshold: number;
  /** Rip threshold [%] */
  ripThreshold: number;
}

export const defaultInputs: DipRipPatternsInputs = {
  analysisPeriod: 2,
  dipThreshold: -5.0,
  ripThreshold: 5.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'analysisPeriod', type: 'int', title: 'Analysis Period [Bars]', defval: 2, min: 2, max: 100, group: 'Settings' },
  { id: 'dipThreshold', type: 'float', title: 'Dip Threshold [%]', defval: -5.0, step: 0.5, max: -0.01, group: 'Settings' },
  { id: 'ripThreshold', type: 'float', title: 'Rip Threshold [%]', defval: 5.0, step: 0.5, min: 0.01, group: 'Settings' },
];

// No plot: bar colours and markers only
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Dip & Rip Patterns [The Quant Science]',
  shortTitle: 'Dip & Rip Patterns [The Quant Science]',
  overlay: true,
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);

const DIP_COLOR = '#FF0000';
const RIP_COLOR = '#03FF00';

export function calculate(
  bars: Bar[],
  inputs: Partial<DipRipPatternsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const { analysisPeriod, dipThreshold, ripThreshold } = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const prevLow = Series.fromArray(bars, bars.map((_b, i) => (i > 0 ? bars[i - 1].low : NaN)));
  const prevHigh = Series.fromArray(bars, bars.map((_b, i) => (i > 0 ? bars[i - 1].high : NaN)));
  const pastLowest = A(ta.lowest(prevLow, analysisPeriod - 1));
  const pastHighest = A(ta.highest(prevHigh, analysisPeriod - 1));

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  bars.forEach((b, i) => {
    // Plain division: x / 0 is +-infinity (compares), 0 / 0 is na
    const ripPerf = ((b.high - pastLowest[i]) / pastLowest[i]) * 100.0;
    const dipPerf = ((b.low - pastHighest[i]) / pastHighest[i]) * 100.0;
    // dip = dip_raw and (not barstate.islast or barstate.isconfirmed)
    const dip = le(dipPerf, dipThreshold) && barIsConfirmed(i);
    const rip = ge(ripPerf, ripThreshold) && barIsConfirmed(i);
    const realDip = dip && !rip;
    const realRip = rip && !dip;
    if (realDip) barColors.push({ time: b.time, color: DIP_COLOR });
    else if (realRip) barColors.push({ time: b.time, color: RIP_COLOR });
    if (realDip) markers.push({ time: b.time, position: 'belowBar', shape: 'circle', color: DIP_COLOR, size: 'small' });
    if (realRip) markers.push({ time: b.time, position: 'aboveBar', shape: 'circle', color: RIP_COLOR, size: 'small' });
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
  };
}

export const DipRipPatterns = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
