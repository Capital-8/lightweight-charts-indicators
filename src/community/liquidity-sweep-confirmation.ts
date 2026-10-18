/**
 * Liquidity Sweep Confirmation
 *
 * Keeps the last swing high and swing low (pivots with `pivotLen` bars on each side). A high above the last swing
 * high marks a high sweep; a low below the last swing low marks a low sweep. After a high sweep, a close below the
 * 3-bar lowest low of the previous bar gives a SELL label; after a low sweep, a close above the 3-bar highest high of
 * the previous bar gives a BUY label (the sweep is then reset). A signal opens a long (BUY) or short (SELL) position
 * state; a long that saw RSI >= 70 on the previous bar and now has RSI < 70 gives a TP label (short: RSI <= 30, then
 * RSI > 30), which closes the position state.
 * Alerts (alertcondition, `alerts` of the result): 'BUY Alert' / 'SELL Alert' on the signals, 'RSI LONG TP' /
 * 'RSI SHORT TP' on the TP labels.
 *
 * Reference: "Liquidity Sweep Confirmation" by filipiti
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LiquiditySweepConfirmationInputs {
  /** Pivot bars on each side of a swing */
  pivotLen: number;
  rsiLen: number;
}

export const defaultInputs: LiquiditySweepConfirmationInputs = {
  pivotLen: 3,
  rsiLen: 14,
};

export const inputConfig: InputConfig[] = [
  { id: 'pivotLen', type: 'int', title: 'Swing Length', defval: 3, min: 1 },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14 },
];

// Markers only (plotshape)
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Liquidity Sweep Confirmation',
  shortTitle: 'Liquidity Sweep Confirmation',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Pine default plotshape text colour */
const PINE_TEXT = '#2962FF';

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquiditySweepConfirmationInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const high = S(bars.map((b) => b.high));
  const low = S(bars.map((b) => b.low));

  const ph = A(ta.pivothigh(high, cfg.pivotLen, cfg.pivotLen));
  const pl = A(ta.pivotlow(low, cfg.pivotLen, cfg.pivotLen));
  const rejectionLow = A(ta.lowest(low, 3));
  const rejectionHigh = A(ta.highest(high, 3));
  const rsi = A(ta.rsi(S(bars.map((b) => b.close)), cfg.rsiLen));

  const markers: MarkerData[] = [];
  let lastHigh = NaN; // var float lastHigh = na
  let lastLow = NaN;
  let sweptHigh = false; // var bool
  let sweptLow = false;
  let inLong = false;
  let inShort = false;
  let prevLongExtreme = false; // rsiLongExtreme[1] (false on bar 0)
  let prevShortExtreme = false;
  const flags: boolean[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (!isNaN(ph[i])) lastHigh = ph[i];
    if (!isNaN(pl[i])) lastLow = pl[i];
    if (!isNaN(lastHigh) && gt(b.high, lastHigh)) sweptHigh = true;
    if (!isNaN(lastLow) && lt(b.low, lastLow)) sweptLow = true;

    const sellSignal = sweptHigh && i > 0 && lt(b.close, rejectionLow[i - 1]);
    const buySignal = sweptLow && i > 0 && gt(b.close, rejectionHigh[i - 1]);
    if (buySignal) sweptLow = false;
    if (sellSignal) sweptHigh = false;

    if (buySignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.lime, text: 'BUY',
        textColor: PINE_TEXT });
    }
    if (sellSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: PINE_TEXT });
    }

    if (buySignal) {
      inLong = true;
      inShort = false;
    }
    if (sellSignal) {
      inShort = true;
      inLong = false;
    }
    const rsiLongExtreme = inLong && ge(rsi[i], 70);
    const rsiShortExtreme = inShort && le(rsi[i], 30);
    const longTP = inLong && prevLongExtreme && lt(rsi[i], 70);
    const shortTP = inShort && prevShortExtreme && gt(rsi[i], 30);
    prevLongExtreme = rsiLongExtreme;
    prevShortExtreme = rsiShortExtreme;
    if (longTP) inLong = false;
    if (shortTP) inShort = false;
    flags[0].push(buySignal);
    flags[1].push(sellSignal);
    flags[2].push(longTP);
    flags[3].push(shortTP);

    if (longTP) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: color.blue, text: 'TP',
        textColor: PINE_TEXT });
    }
    if (shortTP) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.orange, text: 'TP',
        textColor: PINE_TEXT });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY Alert', message: 'Liquidity Sweep BUY' },
  { id: 'alert1', title: 'SELL Alert', message: 'Liquidity Sweep SELL' },
  { id: 'alert2', title: 'RSI LONG TP', message: 'RSI TP LONG' },
  { id: 'alert3', title: 'RSI SHORT TP', message: 'RSI TP SHORT' },
];

export const LiquiditySweepConfirmation = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
