/**
 * Sweep Engulf 2 Candle
 *
 * Two-candle engulfing with a sweep of the previous extreme. Bullish: the low is below the previous low and either
 * the close is above the open of a previous bearish candle, or the close is above the close of a previous bullish
 * candle (green label below the bar). Bearish: the high is above the previous high and either the close is below the
 * close of a previous bearish candle, or the close is below the open of a previous bullish candle (red label above
 * the bar).
 *
 * Alerts: the alert conditions "Bullish Engulfing" / "Bearish Engulfing" (`alerts` of the result) are the shown
 * signals; with "Aktifkan Notifikasi" on, every bullish / bearish engulfing bar (shown or not) makes the alert() call
 * "Bullish Engulfing Terbentuk!" / "Bearish Engulfing Terbentuk!" (`alertCalls`, once per bar close).
 *
 * Reference: "Sweep Engulf 2 Candle" by gastrophollic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SweepEngulf2CandleInputs {
  showBullish: boolean;
  showBearish: boolean;
  /** Alert switch of the alert() calls */
  enableAlert: boolean;
}

export const defaultInputs: SweepEngulf2CandleInputs = {
  showBullish: true,
  showBearish: true,
  enableAlert: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'showBullish', type: 'bool', title: 'Tampilkan Bullish Engulfing', defval: true },
  { id: 'showBearish', type: 'bool', title: 'Tampilkan Bearish Engulfing', defval: true },
  { id: 'enableAlert', type: 'bool', title: 'Aktifkan Notifikasi', defval: true },
];

// No plot(): the only outputs are plotshape markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Sweep Engulf 2 Candle',
  shortTitle: 'Sweep Engulf 2 Candle',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SweepEngulf2CandleInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alerts: AlertConditionState[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const green = String(color.green);
  const red = String(color.red);
  const markers: MarkerData[] = [];
  const n = bars.length;
  // first bar: low < low[1] / high > high[1] with na is false
  const bullFlags: boolean[] = new Array(n).fill(false);
  const bearFlags: boolean[] = new Array(n).fill(false);
  const alertCalls: AlertCall[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const p = bars[i - 1];
    const bullishEngulfing = lt(b.low, p.low)
      && ((gt(b.close, p.open) && lt(p.close, p.open)) || (gt(b.close, p.close) && gt(p.close, p.open)));
    const bearishEngulfing = gt(b.high, p.high)
      && ((lt(b.close, p.close) && lt(p.close, p.open)) || (lt(b.close, p.open) && gt(p.close, p.open)));
    if (cfg.showBullish && bullishEngulfing) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: green, size: 'tiny' });
    }
    if (cfg.showBearish && bearishEngulfing) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: red, size: 'tiny' });
    }
    // alertcondition(showBullish and bullishEngulfing, ...) / alertcondition(showBearish and bearishEngulfing, ...)
    bullFlags[i] = cfg.showBullish && bullishEngulfing;
    bearFlags[i] = cfg.showBearish && bearishEngulfing;
    // if enableAlert: if bullishEngulfing alert(...); if bearishEngulfing alert(...) (alert.freq_once_per_bar_close)
    if (cfg.enableAlert) {
      if (bullishEngulfing) alertCalls.push({ time: b.time, message: 'Bullish Engulfing Terbentuk!', freq: 'once_per_bar_close' });
      if (bearishEngulfing) alertCalls.push({ time: b.time, message: 'Bearish Engulfing Terbentuk!', freq: 'once_per_bar_close' });
    }
  }
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
    alertCalls,
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Engulfing', message: 'Bullish Engulfing Terbentuk!' },
  { id: 'alert1', title: 'Bearish Engulfing', message: 'Bearish Engulfing Terbentuk!' },
];

export const hasAlertFunction = true;

export const SweepEngulf2Candle = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions, hasAlertFunction };
