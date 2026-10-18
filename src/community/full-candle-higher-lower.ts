/**
 * Full Candle Higher/Lower (No Repeats)
 *
 * Higher: close > high[1] and low[1] <= high[2]. Lower: close < low[1] and high[1] >= low[2]. A signal is shown only
 * when the last signal was not the same one (Higher and Lower alternate): a green "Higher" label below the bar, a red
 * "Lower" label above the bar.
 * Alerts (alertcondition, `alerts` of the result): 'Higher Flag' / 'Lower Flag' on the bars of each signal.
 *
 * Reference: "Full Candle Higher/Lower (No Repeats)" by devtiqo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FullCandleHigherLowerInputs {}

export const defaultInputs: FullCandleHigherLowerInputs = {};

export const inputConfig: InputConfig[] = [];

// No plot(): the outputs are the plotshape markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Full Candle Higher/Lower (No Repeats)',
  shortTitle: 'Full Candle Higher/Lower (No Repeats)',
  overlay: true,
};

/** Pine float comparisons: equal within 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => !isNaN(a) && !isNaN(b) && a - b > EPS;
const lt = (a: number, b: number) => !isNaN(a) && !isNaN(b) && b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  _inputs: Partial<FullCandleHigherLowerInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const n = bars.length;
  const high = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const low = (i: number) => (i >= 0 ? bars[i].low : NaN);

  const markers: MarkerData[] = [];
  let lastSignal = 'none'; // var string lastSignal
  const higherFlags: boolean[] = [];
  const lowerFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const isNewHigher = gt(close, high(i - 1)) && le(low(i - 1), high(i - 2));
    const isNewLower = lt(close, low(i - 1)) && ge(high(i - 1), low(i - 2));

    const newHigher = isNewHigher && lastSignal !== 'newHigher';
    const newLower = isNewLower && lastSignal !== 'newLower';

    higherFlags.push(newHigher);
    lowerFlags.push(newLower);
    if (newHigher) lastSignal = 'newHigher';
    else if (newLower) lastSignal = 'newLower';

    const t = bars[i].time as number;
    // plotshape(newHigher, 'Higher', shape.labelup, location.belowbar, color.green, text = 'Higher', textcolor = color.white, size = size.tiny)
    if (newHigher) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'Higher', textColor: color.white, size: 'tiny' });
    }
    // plotshape(newLower, 'Lower', shape.labeldown, location.abovebar, color.red, text = 'Lower', textcolor = color.white, size = size.tiny)
    if (newLower) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'Lower', textColor: color.white, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(newHigher, "Higher Flag") / alertcondition(newLower, "Lower Flag")
    alerts: alertStates(alertConditions, bars, [higherFlags, lowerFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Higher Flag', message: 'Higher flag detected' },
  { id: 'alert1', title: 'Lower Flag', message: 'Lower flag detected' },
];

export const FullCandleHigherLower = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
