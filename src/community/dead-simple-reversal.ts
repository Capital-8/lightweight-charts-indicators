/**
 * Dead Simple Reversal
 *
 * Buy: the prior bar is bearish, the current bar is bullish and closes above the prior open, and one of the last 4
 * long-term lows (lowest low of the long period, 1 to 4 bars back) is above the near-term low (lowest low of the near
 * period). Sell: the mirror rule with highs. A buy draws a triangle below the bar, a sell a triangle above the bar.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' and 'Sell Signal', true on the bars of each signal.
 *
 * Reference: "Dead Simple Reversal" by B3AR_Trades (converted from "p2f - Dead Simple Reversal" by paidtofade;
 * original concept "Dead Simple Reversal Points" by BenTen)
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DeadSimpleReversalInputs {
  /** Near Term Period */
  nearTerm: number;
  /** Long Term Period */
  longTerm: number;
  /** Up Color */
  upColor: string;
  /** Down Color */
  downColor: string;
  /** Opacity (0-100) */
  opacity: number;
}

export const defaultInputs: DeadSimpleReversalInputs = {
  nearTerm: 3,
  longTerm: 50,
  upColor: '#00BCD4',
  downColor: '#00BCD4',
  opacity: 100,
};

export const inputConfig: InputConfig[] = [
  { id: 'nearTerm', type: 'int', title: 'Near Term Period', defval: 3, min: 1 },
  { id: 'longTerm', type: 'int', title: 'Long Term Period', defval: 50, min: 1 },
  { id: 'upColor', type: 'color', title: 'Up Color', defval: '#00BCD4' },
  { id: 'downColor', type: 'color', title: 'Down Color', defval: '#00BCD4' },
  { id: 'opacity', type: 'int', title: 'Opacity', defval: 100, min: 0, max: 100 },
];

// No plot(): the outputs are plotshape triangles
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Dead Simple Reversal',
  shortTitle: 'Dead Simple Reversal',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<DeadSimpleReversalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);
  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // atr = ta.rma(ta.tr(true), 100): computed in the Pine script but used by no output, so not ported

  const nearHigh = arr(ta.highest(high, cfg.nearTerm));
  const nearLow = arr(ta.lowest(low, cfg.nearTerm));
  const longHigh = arr(ta.highest(high, cfg.longTerm));
  const longLow = arr(ta.lowest(low, cfg.longTerm));
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  const buyColor = String(color.new(cfg.upColor, 100 - cfg.opacity));
  const sellColor = String(color.new(cfg.downColor, 100 - cfg.opacity));
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  bars.forEach((b, i) => {
    const p = i > 0 ? bars[i - 1] : undefined;
    const close1 = p ? p.close : NaN;
    const open1 = p ? p.open : NaN;

    // Buy conditions
    const c1 = lt(close1, open1) && gt(b.close, b.open);
    const c2 = gt(b.close, open1);
    const c3 = gt(at(longLow, i - 1), nearLow[i]) || gt(at(longLow, i - 2), nearLow[i])
      || gt(at(longLow, i - 3), nearLow[i]) || gt(at(longLow, i - 4), nearLow[i]);
    const buy = c1 && c2 && c3;

    // Sell conditions
    const c4 = gt(close1, open1) && lt(b.close, b.open);
    const c5 = lt(b.close, open1);
    const c6 = lt(at(longHigh, i - 1), nearHigh[i]) || lt(at(longHigh, i - 2), nearHigh[i])
      || lt(at(longHigh, i - 3), nearHigh[i]) || lt(at(longHigh, i - 4), nearHigh[i]);
    const sell = c4 && c5 && c6;
    buyFlags.push(buy);
    sellFlags.push(sell);

    // plotshape(buy ? low : na, "Buy Signal", location.belowbar, shape.triangleup, size.small): a value draws it
    if (buy) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: buyColor, size: 'small' });
    }
    // plotshape(sell ? high : na, "Sell Signal", location.abovebar, shape.triangledown, size.small)
    if (sell) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: sellColor, size: 'small' });
    }
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(buy, "Buy Signal") / alertcondition(sell, "Sell Signal")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Dead Simple Reversal — Buy' },
  { id: 'alert1', title: 'Sell Signal', message: 'Dead Simple Reversal — Sell' },
];

export const DeadSimpleReversal = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
