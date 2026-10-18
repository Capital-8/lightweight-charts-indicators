/**
 * Swing Support and Resistance
 *
 * The resistance is the last pivot high and the support the last pivot low (`pivotLen` bars on each side). Both
 * levels are drawn as circles, shifted back by `pivotLen` bars (on the bars where the pivots are confirmed minus
 * `pivotLen`). A Buy triangle marks a close crossing above the resistance, a Sell triangle a close crossing below
 * the support.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' and 'Sell Alert', true on the bars of each signal.
 *
 * Reference: "Swing Support and Resistance [Vijay]" by VSB-2024
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'Buy: Price broke above resistance' },
  { id: 'alert1', title: 'Sell Alert', message: 'Sell: Price broke below support' },
];

export interface SwingSupportAndResistanceInputs {
  /** Pivot length (bars on each side) */
  pivotLen: number;
  showSupport: boolean;
  showResistance: boolean;
}

export const defaultInputs: SwingSupportAndResistanceInputs = {
  pivotLen: 10,
  showSupport: true,
  showResistance: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'pivotLen', type: 'int', title: 'Pivot Length', defval: 10 },
  { id: 'showSupport', type: 'bool', title: 'Show Support', defval: true },
  { id: 'showResistance', type: 'bool', title: 'Show Resistance', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Resistance', color: color.red, lineWidth: 2, style: 'circles' },
  { id: 'plot1', title: 'Support', color: color.green, lineWidth: 2, style: 'circles' },
];

export const metadata = {
  title: 'Swing Support and Resistance [Vijay]',
  shortTitle: 'Swing Signal [Vijay]',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<SwingSupportAndResistanceInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.pivotLen;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const pivotHigh = A(ta.pivothigh(getSourceSeries(bars, 'high'), len, len));
  const pivotLow = A(ta.pivotlow(getSourceSeries(bars, 'low'), len, len));

  // var float resistance / support: the last pivot high / low
  const resistance: number[] = new Array(n);
  const support: number[] = new Array(n);
  let r = NaN;
  let s = NaN;
  for (let i = 0; i < n; i++) {
    if (!isNaN(pivotHigh[i])) r = pivotHigh[i];
    if (!isNaN(pivotLow[i])) s = pivotLow[i];
    resistance[i] = r;
    support[i] = s;
  }

  // plot(..., offset = -pivotLen): the value of bar i is drawn on bar i - pivotLen
  const interval = barInterval(bars);
  const shifted = (vals: number[], show: boolean, col: string) => {
    const out: { time: number; value: number; color: string }[] = [];
    for (let i = 0; i < n; i++) {
      const t = barTime(bars, i - len, interval);
      if (isNaN(t)) continue;
      out.push({ time: t, value: show ? vals[i] : NaN, color: col });
    }
    return out;
  };

  // ta.crossover(close, resistance) / ta.crossunder(close, support)
  const close = getSourceSeries(bars, 'close');
  const buySignal = ta.crossover(close, S(resistance)).toArray();
  const sellSignal = ta.crossunder(close, S(support)).toArray();
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    if (buySignal[i]) {
      markers.push({ time, position: 'belowBar', shape: 'triangleUp', color: color.green, text: 'Buy',
        textColor: color.green, size: 'small' });
    }
    if (sellSignal[i]) {
      markers.push({ time, position: 'aboveBar', shape: 'triangleDown', color: color.red, text: 'Sell',
        textColor: color.red, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: shifted(resistance, cfg.showResistance, color.red),
      plot1: shifted(support, cfg.showSupport, color.green),
    },
    markers,
    // alertcondition(buySignal, 'Buy Alert') / alertcondition(sellSignal, 'Sell Alert')
    alerts: alertStates(alertConditions, bars, [buySignal.map((v) => !!v), sellSignal.map((v) => !!v)]),
  };
}

export const SwingSupportAndResistance = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
