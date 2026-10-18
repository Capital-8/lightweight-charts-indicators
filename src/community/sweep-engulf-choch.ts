/**
 * Sweep Engulf CHoCH
 *
 * Three-candle entry pattern. Bullish: candle 1 is bearish, candle 2 takes out its low and closes above its close,
 * candle 3 closes above the open of candle 1. Bearish: candle 1 is bullish, candle 2 takes out its high and closes
 * above its open, candle 3 closes below the open of candle 1. Each entry draws a small triangle (below the bar for
 * bullish, above the bar for bearish).
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Entry' and 'Bearish Entry' (each with its Show input).
 * alert() calls (`alertCalls`, once per bar close) on every entry when "Enable Alerts" is on.
 *
 * Reference: "Sweep Engulf CHoCH" by gastrophollic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Entry', message: 'Bullish Entry Signal Detected!' },
  { id: 'alert1', title: 'Bearish Entry', message: 'Bearish Entry Signal Detected!' },
];

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface SweepEngulfChochInputs {
  /** Show Bullish Entry */
  showBullish: boolean;
  /** Show Bearish Entry */
  showBearish: boolean;
  /** Enable Alerts: the alert() calls are made (`alertCalls`); no effect on the other outputs */
  enableAlert: boolean;
}

export const defaultInputs: SweepEngulfChochInputs = {
  showBullish: true,
  showBearish: true,
  enableAlert: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'showBullish', type: 'bool', title: 'Show Bullish Entry', defval: true },
  { id: 'showBearish', type: 'bool', title: 'Show Bearish Entry', defval: true },
  { id: 'enableAlert', type: 'bool', title: 'Enable Alerts', defval: true },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Sweep Engulf CHoCH',
  shortTitle: 'Sweep Engulf CHoCH',
  overlay: true,
};

// Pine comparison operators: a > b only when a - b > 1e-10; a comparison with na is false
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<SweepEngulfChochInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const markers: MarkerData[] = [];
  const bullFlags: boolean[] = new Array(bars.length).fill(false);
  const bearFlags: boolean[] = new Array(bars.length).fill(false);
  const alertCalls: AlertCall[] = [];

  // bars 0 and 1: close[2] / open[2] are na, every comparison is false
  for (let i = 2; i < bars.length; i++) {
    const b = bars[i];
    const b1 = bars[i - 1];
    const b2 = bars[i - 2];
    const bullishEntry = lt(b2.close, b2.open) && lt(b1.low, b2.low) && gt(b1.close, b2.close) && gt(b.close, b2.open);
    const bearishEntry = gt(b2.close, b2.open) && gt(b1.high, b2.high) && gt(b1.close, b2.open) && lt(b.close, b2.open);
    // alertcondition(showBullish and bullishEntry) / alertcondition(showBearish and bearishEntry)
    bullFlags[i] = cfg.showBullish && bullishEntry;
    bearFlags[i] = cfg.showBearish && bearishEntry;
    // if enableAlert: alert(..., alert.freq_once_per_bar_close) on each entry
    if (cfg.enableAlert) {
      const t = b.time as number;
      if (bullishEntry) alertCalls.push({ time: t, message: 'Bullish Entry Signal Detected!', freq: 'once_per_bar_close' });
      if (bearishEntry) alertCalls.push({ time: t, message: 'Bearish Entry Signal Detected!', freq: 'once_per_bar_close' });
    }
    // plotshape(showBullish and bullishEntry, 'Bullish Entry', location.belowbar, color.green, shape.triangleup, size.tiny)
    if (cfg.showBullish && bullishEntry) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'tiny' });
    }
    // plotshape(showBearish and bearishEntry, 'Bearish Entry', location.abovebar, color.red, shape.triangledown, size.tiny)
    if (cfg.showBearish && bearishEntry) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'tiny' });
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

export const SweepEngulfChoch = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions, hasAlertFunction };
