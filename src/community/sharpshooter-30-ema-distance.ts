/**
 * Sharpshooter 30
 *
 * A fast and a slow EMA of close. A death cross (the fast EMA crosses under the slow EMA) arms the signal; the first
 * confirmed bar after that where the fast EMA is at least `distUSD` below the slow EMA gives a BUY label and disarms
 * it (one signal per death cross).
 *
 * Last bar: a BUY label needs a closed bar. The port reads the state of the last bar from the optional third argument
 * (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Sharpshooter 30" by hrak22
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface Sharpshooter30EmaDistanceInputs {
  /** Fast EMA length */
  fastLength: number;
  /** Slow EMA length */
  slowLength: number;
  /** Distance of the fast EMA below the slow EMA (price units) */
  distUSD: number;
}

export const defaultInputs: Sharpshooter30EmaDistanceInputs = {
  fastLength: 7,
  slowLength: 200,
  distUSD: 20.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast MA Length', defval: 7, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow MA Length', defval: 200, min: 2 },
  { id: 'distUSD', type: 'float', title: 'USD Distance below Slow MA', defval: 20.0, min: 0.1, step: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA Fast', color: color.teal, lineWidth: 2 },
  { id: 'plot1', title: 'EMA Slow', color: color.orange, lineWidth: 2 },
];

export const metadata = {
  title: 'Sharpshooter 30',
  shortTitle: 'Sharpshooter 30',
  overlay: true,
};

/** Pine float comparisons: a <= b unless a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<Sharpshooter30EmaDistanceInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const fastSeries = ta.ema(close, cfg.fastLength);
  const slowSeries = ta.ema(close, cfg.slowLength);
  const fastMa = fastSeries.toArray().map((v) => v ?? NaN);
  const slowMa = slowSeries.toArray().map((v) => v ?? NaN);
  // isDeathCross = ta.crossunder(fastMA, slowMA)
  const deathCross = ta.crossunder(fastSeries, slowSeries).toArray();

  const markers: MarkerData[] = [];
  let armed = false; // var bool armed = false
  for (let i = 0; i < bars.length; i++) {
    armed = deathCross[i] ? true : armed;
    // buySignal = barstate.isconfirmed and armed and fastMA <= slowMA - distUSD
    const buySignal = barIsConfirmed(i) && armed && le(fastMa[i], slowMa[i] - cfg.distUSD);
    if (buySignal) {
      armed = false;
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: color.lime, text: 'BUY',
        textColor: color.black, size: 'tiny' });
    }
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(fastMa[i]) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(slowMa[i]) })),
    },
    markers,
  };
}

export const Sharpshooter30EmaDistance = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
