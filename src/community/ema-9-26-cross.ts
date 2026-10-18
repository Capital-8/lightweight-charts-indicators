/**
 * EMA 9 / 26 Cross
 *
 * The EMA 9 and the EMA 26 of the close. An X mark is drawn at the EMA 9 value on the bars where the EMA 9 crosses
 * above (Buy X) or below (Sell X) the EMA 26.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Cross' and 'Bearish Cross', true on the bars of each
 * cross.
 *
 * Reference: "EMA 9 / 26 Cross" by h0s1m001
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © h0s1m001
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The Pine script has no inputs */
export interface Ema926CrossInputs {}

export const defaultInputs: Ema926CrossInputs = {};

export const inputConfig: InputConfig[] = [];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 9', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'EMA 26', color: color.blue, lineWidth: 1 },
];

export const metadata = {
  title: 'EMA 9 / 26 Cross',
  shortTitle: 'EMA 9 / 26 Cross',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  _inputs: Partial<Ema926CrossInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const fastS = ta.ema(close, 9);
  const slowS = ta.ema(close, 26);
  const fast = A(fastS);
  const slow = A(slowS);
  const bull = A(ta.crossover(fastS, slowS));
  const bear = A(ta.crossunder(fastS, slowS));

  const markers: MarkerData[] = [];
  bars.forEach((b, i) => {
    // plotshape(bullCross ? fastEMA : na, "Buy X", shape.xcross, location.absolute, size.normal, color.blue)
    if (bull[i] && !isNaN(fast[i])) {
      markers.push({ id: 'shape0', time: b.time, position: 'atPriceMiddle', price: fast[i], shape: 'xcross', color: color.blue, size: 'normal' });
    }
    // plotshape(bearCross ? fastEMA : na, "Sell X", shape.xcross, location.absolute, size.normal, color.blue)
    if (bear[i] && !isNaN(fast[i])) {
      markers.push({ id: 'shape1', time: b.time, position: 'atPriceMiddle', price: fast[i], shape: 'xcross', color: color.blue, size: 'normal' });
    }
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fast[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: slow[i] })),
    },
    markers,
    // alertcondition(bullCross, "Bullish Cross") / alertcondition(bearCross, "Bearish Cross")
    alerts: alertStates(alertConditions, bars, [bull.map(Boolean), bear.map(Boolean)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Cross', message: 'EMA 9 crossed above EMA 26' },
  { id: 'alert1', title: 'Bearish Cross', message: 'EMA 9 crossed below EMA 26' },
];

export const Ema926Cross = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
