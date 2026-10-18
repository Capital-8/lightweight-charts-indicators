/**
 * Candle Range Trading (CRT) with Alerts
 *
 * Two-candle range pattern.
 * Bearish CRT: the previous candle is bullish, the current candle is bearish, makes a higher high than the previous
 * candle and closes inside the previous candle range (low[1] <= close <= high[1]).
 * Bullish CRT: the previous candle is bearish, the current candle is bullish, makes a lower low than the previous
 * candle and closes inside the previous candle range.
 * A triangle marks each pattern, and on the pattern bar the CRT High / CRT Low plots give the highest high and the
 * lowest low of the two candles (na on the other bars).
 * Alerts (alertcondition, `alerts` of the result): 'Bullish CRT Alert' and 'Bearish CRT Alert', true on the pattern
 * bars.
 *
 * Reference: "Candle Range Trading (CRT) with Alerts" by marcostan93
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CandleRangeTradingInputs {
  /** Show the CRT High / CRT Low plots */
  showBox: boolean;
}

export const defaultInputs: CandleRangeTradingInputs = {
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
  title: 'Candle Range Trading (CRT) with Alerts',
  shortTitle: 'CRT',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<CandleRangeTradingInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { showBox } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const markers: MarkerData[] = [];
  const plot0: { time: number; value: number }[] = new Array(n);
  const plot1: { time: number; value: number }[] = new Array(n);
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // open[1], close[1], high[1], low[1] are na on the first bar: every comparison with them is false
    const open1 = i > 0 ? bars[i - 1].open : NaN;
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    const high1 = i > 0 ? bars[i - 1].high : NaN;
    const low1 = i > 0 ? bars[i - 1].low : NaN;

    const bearishCRT = close1 > open1 && b.close < b.open && b.high > high1 && b.close <= high1 && b.close >= low1;
    const bullishCRT = close1 < open1 && b.close > b.open && b.low < low1 && b.close <= high1 && b.close >= low1;
    bullFlags.push(bullishCRT);
    bearFlags.push(bearishCRT);

    // plotshape(bullishCRT, 'Bullish CRT', shape.triangleup, location.belowbar, color.green, size = size.small)
    if (bullishCRT) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'small' });
    }
    // plotshape(bearishCRT, 'Bearish CRT', shape.triangledown, location.abovebar, color.red, size = size.small)
    if (bearishCRT) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small' });
    }

    // boxHigh = showBox and (bullishCRT or bearishCRT) ? math.max(high0, high1) : na (boxLow with math.min of the lows)
    const on = showBox && (bullishCRT || bearishCRT);
    plot0[i] = { time: b.time, value: on ? Math.max(b.high, high1) : NaN };
    plot1[i] = { time: b.time, value: on ? Math.min(b.low, low1) : NaN };
  }

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

export const CandleRangeTrading = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
