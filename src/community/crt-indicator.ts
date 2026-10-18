/**
 * CRT indicator (Candle Range Trading)
 *
 * Two-candle patterns. Bearish CRT: a bullish candle, then a bearish candle with a higher high and a higher low
 * that closes inside the first candle body (between its open and its high). Bullish CRT: a bearish candle, then a
 * bullish candle with a lower low that closes between the first candle low and its open. Triangles mark the
 * patterns; on a pattern bar the CRT High / CRT Low plots show the high / low of the two candles.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish CRT Alert' and 'Bearish CRT Alert', true on the bars of
 * each pattern.
 *
 * Reference: "CRT indicator" by INTELA
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CrtIndicatorInputs {
  /** Show the CRT High / CRT Low plots */
  showBox: boolean;
}

export const defaultInputs: CrtIndicatorInputs = {
  showBox: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'showBox', type: 'bool', title: 'Show CRT High/Low', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'CRT High', color: color.gray, lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'CRT Low', color: color.gray, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'CRT indicator',
  shortTitle: 'CRT indicator',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<CrtIndicatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const markers: MarkerData[] = [];
  const boxHigh: number[] = new Array(n).fill(NaN);
  const boxLow: number[] = new Array(n).fill(NaN);
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // open[1] ... low[1] are na on the first bar: every comparison with them is false
    const p = i > 0 ? bars[i - 1] : { open: NaN, high: NaN, low: NaN, close: NaN };
    const bearishCRT = gt(p.close, p.open) && lt(b.close, b.open) && gt(b.high, p.high) && lt(b.close, p.high)
      && gt(b.close, p.open) && gt(b.low, p.low);
    const bullishCRT = lt(p.close, p.open) && gt(b.close, b.open) && lt(b.low, p.low) && ge(b.close, p.low)
      && lt(b.close, p.open);
    bullFlags.push(bullishCRT);
    bearFlags.push(bearishCRT);
    if (bullishCRT) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'small' });
    }
    if (bearishCRT) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small' });
    }
    if (cfg.showBox && (bullishCRT || bearishCRT)) {
      boxHigh[i] = Math.max(b.high, p.high);
      boxLow[i] = Math.min(b.low, p.low);
    }
  }

  const plot0 = bars.map((b, i) => ({ time: b.time, value: boxHigh[i] }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: boxLow[i] }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    // alertcondition(bullishCRT, 'Bullish CRT Alert') / alertcondition(bearishCRT, 'Bearish CRT Alert')
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish CRT Alert', message: 'Bullish CRT Pattern Detected' },
  { id: 'alert1', title: 'Bearish CRT Alert', message: 'Bearish CRT Pattern Detected' },
];

export const CrtIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
