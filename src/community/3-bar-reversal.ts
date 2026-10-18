/**
 * 3 Bar Reversal
 *
 * a = bars since close >= close[1], b = bars since close <= close[1]. When a or b equals 3 (three closes in a row
 * against the last up / down close), the bar two bars back is coloured purple (barcolor with offset -2: the colour
 * of bar i is drawn on bar i - 2). A lime triangle below the bar when b == 4 and a red triangle above the bar when
 * a == 4.
 * Alert (alertcondition, `alerts` of the result): 'Market Reversal', true on the bars where a or b equals 3.
 *
 * Reference: "3 Bar Reversal" by abbadon9
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © abbadon9
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ThreeBarReversalInputs {}

export const defaultInputs: ThreeBarReversalInputs = {};

export const inputConfig: InputConfig[] = [];

// Markers and bar colours only (plotshape, barcolor)
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: '3 Bar Reversal',
  shortTitle: '3 BAR',
  overlay: true,
};

/** Pine float comparisons: equal within 1e-10; na compares false */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  _inputs: Partial<ThreeBarReversalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const n = bars.length;
  const up: boolean[] = new Array(n);
  const down: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? bars[i - 1].close : NaN;
    up[i] = ge(bars[i].close, prev); // close >= close[1]
    down[i] = le(bars[i].close, prev); // close <= close[1]
  }
  const a = ta.barssince(Series.fromArray(bars, up.map((x) => (x ? 1 : 0)))).toArray();
  const b = ta.barssince(Series.fromArray(bars, down.map((x) => (x ? 1 : 0)))).toArray();

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const reversal: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    // alertcondition(ta.barssince(close >= close[1]) == 3 or ta.barssince(close <= close[1]) == 3, ...)
    reversal[i] = b[i] === 3 || a[i] === 3;
    // barcolor(isReversing() ? color.purple : na, offset = -2): drawn on bar i - 2
    if ((b[i] === 3 || a[i] === 3) && i >= 2) barColors.push({ time: bars[i - 2].time as number, color: color.purple });
    if (b[i] === 4) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'tiny' });
    if (a[i] === 4) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'tiny' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, [reversal]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Market Reversal', message: 'REVERSAL' },
];

export const ThreeBarReversal = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
