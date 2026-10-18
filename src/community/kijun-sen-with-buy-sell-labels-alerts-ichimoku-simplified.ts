/**
 * Kijun-Sen with Buy / Sell Labels
 *
 * The Kijun-Sen line (middle of the highest high and the lowest low over the base periods), green when the close is
 * above it, red when the close is below it, gray otherwise. A "B" label is drawn below the bar when the close crosses
 * over the line or a new uptrend starts; an "S" label above the bar when the close crosses under the line or a new
 * downtrend starts.
 * Alerts (alertcondition, `alerts` of the result): trend change (a new uptrend or downtrend), close crossing over /
 * under the line.
 *
 * Reference: "Kijun-Sen with Buy / Sell Labels & Alerts - Ichimoku simplified" by TaureaYinYang
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Created by TaureaYinYang
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface KijunSenWithAlertsInputs {
  /** Base periods of the Kijun-Sen */
  basePeriods: number;
}

export const defaultInputs: KijunSenWithAlertsInputs = {
  basePeriods: 26,
};

export const inputConfig: InputConfig[] = [
  { id: 'basePeriods', type: 'int', title: 'Base Periods', defval: 26 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Kijun-Sen', color: color.gray, lineWidth: 2 },
];

export const metadata = {
  title: 'Kijun-Sen with Alerts',
  shortTitle: 'Kijun-Sen with Alerts',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<KijunSenWithAlertsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const B = (s: Series) => s.toArray().map((v) => Boolean(v));
  const S = (a: number[]) => Series.fromArray(bars, a);

  const highestHigh = A(ta.highest(S(bars.map((b) => b.high)), cfg.basePeriods));
  const lowestLow = A(ta.lowest(S(bars.map((b) => b.low)), cfg.basePeriods));
  const kijun = bars.map((_b, i) => (highestHigh[i] + lowestLow[i]) / 2);

  const uptrend = bars.map((b, i) => gt(b.close, kijun[i]));
  const downtrend = bars.map((b, i) => lt(b.close, kijun[i]));
  const close = S(bars.map((b) => b.close));
  const kijunS = S(kijun);
  // ta.crossover / ta.crossunder compare exactly
  const crossUp = B(ta.crossover(close, kijunS));
  const crossDown = B(ta.crossunder(close, kijunS));

  const markers: MarkerData[] = [];
  const trendChange: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // uptrend[1] / downtrend[1] are false on the first bar (bool history)
    const prevUp = i > 0 && uptrend[i - 1];
    const prevDown = i > 0 && downtrend[i - 1];
    // trend_change = uptrend and not uptrend[1] or downtrend and not downtrend[1]
    trendChange.push((uptrend[i] && !prevUp) || (downtrend[i] && !prevDown));
    // buy_signal = price_cross_up or uptrend and not uptrend[1]
    if (crossUp[i] || (uptrend[i] && !prevUp)) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'B',
        textColor: color.white, size: 'small' });
    }
    // sell_signal = price_cross_down or downtrend and not downtrend[1]
    if (crossDown[i] || (downtrend[i] && !prevDown)) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'S',
        textColor: color.white, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // kijun_color = uptrend ? color.green : downtrend ? color.red : color.gray
      plot0: bars.map((b, i) => ({
        time: b.time, value: kijun[i], color: uptrend[i] ? color.green : downtrend[i] ? color.red : color.gray,
      })),
    },
    markers,
    alerts: alertStates(alertConditions, bars, [trendChange, crossUp, crossDown]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Color Change Alert', message: 'Kijun-Sen Color Change: Trend Changed!' },
  { id: 'alert1', title: 'Price Crosses Kijun Up', message: 'Price crossed Kijun-Sen upwards!' },
  { id: 'alert2', title: 'Price Crosses Kijun Down', message: 'Price crossed Kijun-Sen downwards!' },
];

export const KijunSenWithAlerts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
