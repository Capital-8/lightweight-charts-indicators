/**
 * John Wick Doji indicator
 *
 * A "John Wick" candle has one long wick against the candle direction: a green candle whose lower wick is larger
 * than its upper wick and above `maxWick` % of the body, or a red candle whose upper wick is larger than its lower
 * wick and above `maxWick` % of the body. The reverse option also accepts a red candle with a long lower wick and
 * a green candle with a long upper wick. These candles are coloured black.
 *
 * Alerts: the alert condition "John Wick Candle" (`alerts` of the result) is true on every John Wick candle; the
 * alert() call "John Wick Candle" (`alertCalls`, once per bar close) is made on them when "Show John Wick Candles?"
 * is on.
 *
 * Reference: "John Wick" by Nossgrr
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Nossgrr
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface JohnWickDojiInputs {
  /** Minimum wick size in % of the body */
  maxWick: number;
  /** Show John Wick candles */
  showJWic: boolean;
  /** Show reverse John Wick candles */
  showReverseJWic: boolean;
}

export const defaultInputs: JohnWickDojiInputs = {
  maxWick: 60,
  showJWic: true,
  showReverseJWic: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'maxWick', type: 'float', title: 'John Wick Max Upper Wick Size', defval: 60, min: 0.1, step: 1 },
  { id: 'showJWic', type: 'bool', title: 'Show John Wick Candles?', defval: true },
  { id: 'showReverseJWic', type: 'bool', title: 'Show Reverse John Wick Candles?', defval: false },
];

// No plot(): the only output is a bar colour
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'John Wick',
  shortTitle: 'John Wick',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a != b when |a - b| > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<JohnWickDojiInputs> = {},
): Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[]; alerts: AlertConditionState[]; alertCalls: AlertCall[] } {
  const { maxWick, showJWic, showReverseJWic } = { ...defaultInputs, ...inputs };
  const black = String(color.rgb(0, 0, 0));
  const barColors: BarColorData[] = [];
  const flags: boolean[] = [];
  const alertCalls: AlertCall[] = [];

  for (const b of bars) {
    let bullishJC = false;
    let bearishJC = false;

    const body = Math.abs(b.close - b.open);
    const upperWick = b.high - Math.max(b.open, b.close);
    const lowerWick = Math.min(b.open, b.close) - b.low;
    const upperWickPct = ne(body, 0) ? (upperWick / body) * 100 : NaN;
    const lowerWickPct = ne(body, 0) ? (lowerWick / body) * 100 : NaN;

    if (lt(b.open, b.close)) { // Bull candle
      if (gt(lowerWick, upperWick)) bullishJC = gt(lowerWickPct, maxWick);
    }
    if (gt(b.open, b.close)) { // Bear candle
      if (gt(upperWick, lowerWick)) bearishJC = gt(upperWickPct, maxWick);
    }
    if (gt(b.open, b.close) && showReverseJWic) { // Reverse bull candle
      if (gt(lowerWick, upperWick)) bullishJC = gt(lowerWickPct, maxWick);
    }
    if (lt(b.open, b.close) && showReverseJWic) { // Reverse bear candle
      if (gt(upperWick, lowerWick)) bearishJC = gt(upperWickPct, maxWick);
    }

    // barcolor((bullishJC or bearishJC) and (showJWic or showReverseJWic) ? color.rgb(0, 0, 0) : na)
    if ((bullishJC || bearishJC) && (showJWic || showReverseJWic)) barColors.push({ time: b.time, color: black });
    // alertcondition((bullishJC or bearishJC), 'John Wick Candle')
    flags.push(bullishJC || bearishJC);
    // if (bullishJC or bearishJC) and showJWic: alert("John Wick Candle", alert.freq_once_per_bar_close)
    if ((bullishJC || bearishJC) && showJWic) alertCalls.push({ time: b.time, message: 'John Wick Candle', freq: 'once_per_bar_close' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    barColors,
    alerts: alertStates(alertConditions, bars, [flags]),
    alertCalls,
  };
}

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'John Wick Candle', message: '[CurrencyPair] [TimeFrame], John Wick candle' },
];

export const hasAlertFunction = true;

export const JohnWickDoji = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions, hasAlertFunction };
