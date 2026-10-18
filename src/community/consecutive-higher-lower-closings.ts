/**
 * Consecutive Higher/Lower Closings
 *
 * Counts the bars in a row where the chosen price (open, high, low or close; close by default) is above the
 * previous value (up count) or below it (down count); an equal or na change resets both counts. A BUY signal when
 * the up count reaches the input count, a SELL signal when the down count reaches its input count. Signals
 * alternate: a BUY only after a SELL (or as the first signal), a SELL only after a BUY (or as the first signal).
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' and 'Sell Alert', true on the bars of each signal.
 *
 * Reference: "Custom Buy/Sell Signal (Alternating Signals)" by rahul_joshi_2
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © rahul_joshi_2
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ConsecutiveHigherLowerClosingsInputs {
  /** Consecutive higher values for a BUY */
  consecutiveHigherValues: number;
  /** Consecutive lower values for a SELL */
  consecutiveLowerValues: number;
  /** Price source: open (first match of open, high, low, close wins) */
  useOpen: boolean;
  useHigh: boolean;
  useLow: boolean;
  useClose: boolean;
}

export const defaultInputs: ConsecutiveHigherLowerClosingsInputs = {
  consecutiveHigherValues: 3,
  consecutiveLowerValues: 3,
  useOpen: false,
  useHigh: false,
  useLow: false,
  useClose: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'consecutiveHigherValues', type: 'int', title: 'Consecutive Higher Values for Buy', defval: 3, min: 1 },
  { id: 'consecutiveLowerValues', type: 'int', title: 'Consecutive Lower Values for Sell', defval: 3, min: 1 },
  { id: 'useOpen', type: 'bool', title: 'Use Open', defval: false },
  { id: 'useHigh', type: 'bool', title: 'Use High', defval: false },
  { id: 'useLow', type: 'bool', title: 'Use Low', defval: false },
  { id: 'useClose', type: 'bool', title: 'Use Close', defval: true },
];

// No plot(): the outputs are the BUY / SELL markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Custom Buy/Sell Signal (Alternating Signals)',
  shortTitle: 'Custom Buy/Sell Signal (Alternating Signals)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ConsecutiveHigherLowerClosingsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  // value = close, then open / high / low / close by the first input that is on
  const pick = (b: Bar): number => {
    if (cfg.useOpen) return b.open;
    if (cfg.useHigh) return b.high;
    if (cfg.useLow) return b.low;
    return b.close;
  };

  const markers: MarkerData[] = [];
  const textColor = color.blue; // no textcolor: the Pine plotshape default text colour
  let upCount = 0;
  let downCount = 0;
  let lastSignal = 0; // 1 = last signal BUY, -1 = last signal SELL
  let prev = NaN;
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  for (let i = 0; i < bars.length; i++) {
    const value = pick(bars[i]);
    const valueDiff = value - prev; // value - value[1] (na on bar 0)
    prev = value;
    if (gt(valueDiff, 0)) {
      upCount += 1;
      downCount = 0;
    } else if (lt(valueDiff, 0)) {
      downCount += 1;
      upCount = 0;
    } else {
      upCount = 0;
      downCount = 0;
    }
    const rawBuy = upCount === cfg.consecutiveHigherValues;
    const rawSell = downCount === cfg.consecutiveLowerValues;
    let buySignal = false;
    let sellSignal = false;
    if (rawBuy && lastSignal !== 1) {
      buySignal = true;
      lastSignal = 1;
    }
    if (rawSell && lastSignal !== -1) {
      sellSignal = true;
      lastSignal = -1;
    }
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    const t = bars[i].time;
    // plotshape(buySignal, "Buy Signal", shape.triangleup, location.belowbar, color.lime, size.small, text = "BUY")
    if (buySignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: color.lime, text: 'BUY', textColor, size: 'small' });
    }
    // plotshape(sellSignal, "Sell Signal", shape.triangledown, location.abovebar, color.red, size.small, text = "SELL")
    if (sellSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: color.red, text: 'SELL', textColor, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(buySignal, "Buy Alert") / alertcondition(sellSignal, "Sell Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'BUY Signal' },
  { id: 'alert1', title: 'Sell Alert', message: 'SELL Signal' },
];

export const ConsecutiveHigherLowerClosings = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions,
};
