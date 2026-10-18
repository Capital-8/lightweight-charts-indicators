/**
 * Candle Color Flip
 *
 * Red to green flip: the previous bar is red (close < open) and the current low is not below the previous low
 * (triangle below the bar). Green to red flip: the previous bar is green (close > open) and the current high is not
 * above the previous high (triangle above the bar). Signals on confirmed bars only.
 *
 * Last bar: a flip is marked on a closed bar only. The port reads the state of the last bar from the optional third
 * argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Red to Green Candle Flip' and 'Green to Red Candle Flip', true on
 * the bars of each flip.
 *
 * Reference: "Candle Color Flip" by LorPlant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

// The Pine script has no inputs
export interface CandleColorFlipInputs {}

export const defaultInputs: CandleColorFlipInputs = {};

export const inputConfig: InputConfig[] = [];

/** No plot(): the outputs are the two plotshape markers */
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Candle Color Flip Alerts',
  shortTitle: 'Candle Color Flip Alerts',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  _inputs: Partial<CandleColorFlipInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const markers: MarkerData[] = [];
  const lime = '#00E676';
  const red = '#F23645';
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const p = i > 0 ? bars[i - 1] : undefined;
    const open1 = p ? p.open : NaN;
    const close1 = p ? p.close : NaN;
    const high1 = p ? p.high : NaN;
    const low1 = p ? p.low : NaN;

    const prevBull = gt(close1, open1);
    const prevBear = lt(close1, open1);
    const noHigherHigh = le(b.high, high1);
    const noLowerLow = ge(b.low, low1);

    // bearFlip = barstate.isconfirmed and prevBull and noHigherHigh
    const bearFlip = barIsConfirmed(i) && prevBull && noHigherHigh;
    const bullFlip = barIsConfirmed(i) && prevBear && noLowerLow;
    bullFlags.push(bullFlip);
    bearFlags.push(bearFlip);

    // plotshape(bullFlip, "Red→Green Flip", shape.triangleup, location.belowbar, color.lime, size = size.tiny)
    if (bullFlip) markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: lime, size: 'tiny' });
    // plotshape(bearFlip, "Green→Red Flip", shape.triangledown, location.abovebar, color.red, size = size.tiny)
    if (bearFlip) markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: red, size: 'tiny' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(bullFlip, "Red to Green Candle Flip") / alertcondition(bearFlip, "Green to Red Candle Flip")
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0',
    title: 'Red to Green Candle Flip',
    message: '{{ticker}} {{interval}} – Candle failed to make a lower low after a red bar. Close: {{close}}',
  },
  {
    id: 'alert1',
    title: 'Green to Red Candle Flip',
    message: '{{ticker}} {{interval}} – Candle failed to make a higher high after a green bar. Close: {{close}}',
  },
];

export const CandleColorFlip = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
