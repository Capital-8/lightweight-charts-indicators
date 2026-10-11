/**
 * Renko Flip Alert
 *
 * Marks a change of candle direction on a closed bar: a blue triangle below the bar when a bull bar (close > open)
 * follows a bear bar (close < open), a red triangle above the bar when a bear bar follows a bull bar. The script is
 * meant for traditional Renko charts but works on any bars.
 *
 * Last bar: a flip is marked on a closed bar only. The port reads the state of the last bar from the optional third
 * argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Renko Flip Alert (Traditional Only)" by deephrenology
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface RenkoFlipAlertInputs {}

export const defaultInputs: RenkoFlipAlertInputs = {};

export const inputConfig: InputConfig[] = [];

// No plot(): the outputs are two plotshape markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Renko Flip Alert',
  shortTitle: 'Renko Flip Alert',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  _inputs: Partial<RenkoFlipAlertInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const blue = String(color.blue);
  const red = String(color.red);
  const markers: MarkerData[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const isBull = gt(b.close, b.open);
    const isBear = lt(b.close, b.open);
    // close[1] / open[1] are na on the first bar: the comparisons are false
    const p = i > 0 ? bars[i - 1] : undefined;
    const wasBull = p !== undefined && gt(p.close, p.open);
    const wasBear = p !== undefined && lt(p.close, p.open);
    // bullFlip = barstate.isconfirmed and isBull and wasBear
    const bullFlip = barIsConfirmed(i) && isBull && wasBear;
    const bearFlip = barIsConfirmed(i) && isBear && wasBull;
    if (bullFlip) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: blue, size: 'small' });
    }
    if (bearFlip) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: red, size: 'small' });
    }
  }
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
  };
}

export const RenkoFlipAlert = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
