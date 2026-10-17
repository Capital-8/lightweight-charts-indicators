/**
 * Perfect Hammer Pattern
 *
 * A perfect bullish candle opens at its low (low == open, |low - open| <= 0.03), closes above the open and below the
 * high. A perfect bearish candle opens at its high, closes below the open and above the low. A buy signal needs
 * `consecutivePatterns` perfect bullish candles in a row (the current bar and the bars before it) after a red candle
 * or a doji (|close - open| <= 0.001); a short signal needs perfect bearish candles after a green candle or a doji.
 * A green "H" label below the bar marks a buy signal, a red "H" label above the bar a short signal.
 *
 * Alert conditions (`alerts` of the result): "Bullish Pattern Alert" on each buy signal and "Bearish Pattern Alert"
 * on each short signal.
 *
 * Reference: "Perfect Hammer Pattern" by girishptryambakee
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PerfectHammerPatternInputs {
  /** Number of consecutive perfect candles */
  consecutivePatterns: number;
}

export const defaultInputs: PerfectHammerPatternInputs = {
  consecutivePatterns: 2,
};

export const inputConfig: InputConfig[] = [
  { id: 'consecutivePatterns', type: 'int', title: 'Consecutive Perfect Patterns', defval: 2, min: 1, max: 10 },
];

// No plot(): the only outputs are two plotshape markers (and 2 alertconditions)
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Perfect Hammer Pattern',
  shortTitle: 'PerfectHammer',
  overlay: true,
};

const TOLERANCE = 0.03;
const DOJI_TOLERANCE = 0.001;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<PerfectHammerPatternInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alerts: AlertConditionState[] } {
  const { consecutivePatterns } = { ...defaultInputs, ...inputs };
  // x[index] before the first bar is na: every comparison with it is false
  const at = (i: number, k: number): Bar | null => (i - k >= 0 ? bars[i - k] : null);
  const NA_BAR = { open: NaN, high: NaN, low: NaN, close: NaN };

  const isDoji = (b: { open: number; close: number }) => le(Math.abs(b.close - b.open), DOJI_TOLERANCE);
  const isPerfectBullish = (b: { open: number; high: number; low: number; close: number }) =>
    eq(b.low, b.open) && gt(b.high, b.close) && gt(b.close, b.open) && le(Math.abs(b.low - b.open), TOLERANCE)
    && gt(b.high, b.close);
  const isPerfectBearish = (b: { open: number; high: number; low: number; close: number }) =>
    eq(b.high, b.open) && gt(b.close, b.low) && gt(b.open, b.close) && le(Math.abs(b.high - b.open), TOLERANCE)
    && gt(b.close, b.low);

  const white = String(color.white);
  const green = String(color.green);
  const red = String(color.red);
  const markers: MarkerData[] = [];
  const bullFlags: boolean[] = [];
  const bearFlags: boolean[] = [];
  for (let i = 0; i < bars.length; i++) {
    let bullishPattern = true;
    let bearishPattern = true;
    for (let k = 0; k <= consecutivePatterns - 1; k++) {
      const b = at(i, k) ?? NA_BAR;
      bullishPattern = bullishPattern && isPerfectBullish(b);
      bearishPattern = bearishPattern && isPerfectBearish(b);
    }
    const prior = at(i, consecutivePatterns) ?? NA_BAR;
    bullishPattern = bullishPattern && (gt(prior.open, prior.close) || isDoji(prior));
    bearishPattern = bearishPattern && (gt(prior.close, prior.open) || isDoji(prior));

    // alertcondition(bullish_pattern, ...) / alertcondition(bearish_pattern, ...)
    bullFlags.push(bullishPattern);
    bearFlags.push(bearishPattern);
    const time = bars[i].time;
    if (bullishPattern) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: green, text: 'H', textColor: white,
        size: 'tiny' });
    }
    if (bearishPattern) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: red, text: 'H', textColor: white,
        size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Pattern Alert', message: 'Perfect Bullish Hammers Found!' },
  { id: 'alert1', title: 'Bearish Pattern Alert', message: 'Perfect Bearish Hammers Found!' },
];

export const PerfectHammerPattern = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
