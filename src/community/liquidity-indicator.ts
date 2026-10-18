/**
 * Liquidity Indicator
 *
 * Local highs and lows: the high is drawn as a red step line on the bars where it equals the highest high of the
 * last `lengthHigh` bars, and the low as a green step line on the bars where it equals the lowest low of the last
 * `lengthLow` bars. Other bars have no value.
 * Alerts (alertcondition, `alerts` of the result): 'Local High Detected' and 'Local Low Detected' on those bars.
 *
 * Reference: "Liquidity Indicator" by The_Forex_Steward
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Script created by D'Andre B.
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LiquidityIndicatorInputs {
  /** Lookback period for local highs */
  lengthHigh: number;
  /** Lookback period for local lows */
  lengthLow: number;
}

export const defaultInputs: LiquidityIndicatorInputs = {
  lengthHigh: 10,
  lengthLow: 10,
};

export const inputConfig: InputConfig[] = [
  { id: 'lengthHigh', type: 'int', title: 'Lookback Period for Local Highs', defval: 10 },
  { id: 'lengthLow', type: 'int', title: 'Lookback Period for Local Lows', defval: 10 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Local High Line', color: color.red, lineWidth: 2, style: 'stepline' },
  { id: 'plot1', title: 'Local Low Line', color: color.green, lineWidth: 2, style: 'stepline' },
];

export const metadata = {
  title: 'Liquidity Indicator',
  shortTitle: 'Liquidity Indicator',
  overlay: true,
};

/** Pine float comparisons: a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityIndicatorInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const hh = A(ta.highest(S(bars.map((b) => b.high)), cfg.lengthHigh));
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), cfg.lengthLow));

  // isLocalHigh = high == ta.highest(high, lengthHigh); isLocalLow = low == ta.lowest(low, lengthLow)
  const isLocalHigh = bars.map((b, i) => eq(b.high, hh[i]));
  const isLocalLow = bars.map((b, i) => eq(b.low, ll[i]));
  const plot0 = bars.map((b, i) => ({ time: b.time, value: isLocalHigh[i] ? b.high : NaN }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: isLocalLow[i] ? b.low : NaN }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    // alertcondition(isLocalHigh, "Local High Detected") / alertcondition(isLocalLow, "Local Low Detected")
    alerts: alertStates(alertConditions, bars, [isLocalHigh, isLocalLow]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Local High Detected', message: 'Local high detected at [CurrencyPair] [TimeFrame]' },
  { id: 'alert1', title: 'Local Low Detected', message: 'Local low detected at [CurrencyPair] [TimeFrame]' },
];

export const LiquidityIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
