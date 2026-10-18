/**
 * Pullback SAR
 *
 * Parabolic SAR with a slow acceleration (start 0.01, increment 0.01, max 0.1). The trend is bullish when the close
 * is above the SAR and bearish when it is below. A pullback in an uptrend is a bar after a bullish bar with a lower
 * close and a lower low; a long re-entry is the next bar when it is bullish and closes higher. A pullback in a
 * downtrend is a bar after a bearish bar with a higher close and a higher high; a short re-entry is the next bar when
 * it is bearish and closes lower. Re-entries are drawn as triangles, the SAR as crosses.
 * Alerts (alertcondition, `alerts` of the result): 'Alert Long' and 'Alert Short', true on the re-entry bars.
 *
 * Reference: "Pullback SAR" by szymonsobkowiak
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PullbackSarInputs {
  /** SAR start (acceleration factor) */
  start: number;
  /** SAR increment */
  increment: number;
  /** SAR maximum */
  maximum: number;
}

export const defaultInputs: PullbackSarInputs = {
  start: 0.01,
  increment: 0.01,
  maximum: 0.1,
};

export const inputConfig: InputConfig[] = [
  { id: 'start', type: 'float', title: 'Start', defval: 0.01 },
  { id: 'increment', type: 'float', title: 'Increment', defval: 0.01 },
  { id: 'maximum', type: 'float', title: 'Max Value', defval: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SAR', color: color.gray, lineWidth: 1, style: 'cross' },
];

export const metadata = {
  title: 'Pullback SAR',
  shortTitle: 'Pullback SAR',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<PullbackSarInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const sar = ta.sar(bars, cfg.start, cfg.increment, cfg.maximum).toArray().map((v) => v ?? NaN);

  const isBull: boolean[] = new Array(n);
  const isBear: boolean[] = new Array(n);
  const pbUp: boolean[] = new Array(n);
  const pbDown: boolean[] = new Array(n);
  const markers: MarkerData[] = [];
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const p = i > 0 ? bars[i - 1] : undefined;
    const pClose = p ? p.close : NaN;
    isBull[i] = gt(b.close, sar[i]);
    isBear[i] = lt(b.close, sar[i]);
    // pullbackInUptrend = isBull[1] and close < close[1] and low < low[1]
    pbUp[i] = i > 0 && isBull[i - 1] && lt(b.close, pClose) && lt(b.low, p!.low);
    // pullbackInDowntrend = isBear[1] and close > close[1] and high > high[1]
    pbDown[i] = i > 0 && isBear[i - 1] && gt(b.close, pClose) && gt(b.high, p!.high);
    // reentryLong = pullbackInUptrend[1] and isBull and close > close[1]
    const reentryLong = i > 0 && pbUp[i - 1] && isBull[i] && gt(b.close, pClose);
    // reentryShort = pullbackInDowntrend[1] and isBear and close < close[1]
    const reentryShort = i > 0 && pbDown[i - 1] && isBear[i] && lt(b.close, pClose);
    longFlags.push(reentryLong);
    shortFlags.push(reentryShort);
    // plotshape(reentryLong, location.belowbar, color.green, shape.triangleup, size.small)
    if (reentryLong) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'small' });
    }
    // plotshape(reentryShort, location.abovebar, color.red, shape.triangledown, size.small)
    if (reentryShort) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(sar, "SAR", style = plot.style_cross, color = color.gray)
      plot0: bars.map((b, i) => ({ time: b.time, value: sar[i], color: color.gray })),
    },
    markers,
    // alertcondition(reentryLong, "Alert Long") / alertcondition(reentryShort, "Alert Short")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Alert Long', message: 'Pullback SAR: LONG signal' },
  { id: 'alert1', title: 'Alert Short', message: 'Pullback SAR: SHORT signal' },
];

export const PullbackSar = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
