/**
 * Abusuhil Bullish Candles
 *
 * Marks six bullish candlestick patterns in a down move (the close and the two previous closes below the EMA 20 of
 * the close): Hammer, Bullish Engulfing, Morning Star, Piercing Line, Three White Soldiers and Three Inside Up, each
 * with a label below the bar. Optional filters: a stochastic filter (K = SMA of the stochastic, D = SMA of K; K above
 * D) and a volume filter (volume above the SMA 20 of the volume times a multiplier).
 * Alerts (alertcondition, `alerts` of the result): one per pattern ('Hammer Alert', 'Engulfing Alert', 'Morning Star
 * Alert', 'Piercing Line Alert', 'Three White Soldiers Alert', 'Three Inside Up Alert'), true on the bars of its label
 * when its alert toggle is on.
 *
 * Reference: "Abusuhil Bullish Candles" by abusuhil
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AbusuhilBullishCandlesInputs {
  showHammer: boolean;
  showEngulfing: boolean;
  showMorningStar: boolean;
  showPiercing: boolean;
  showThreeSoldiers: boolean;
  showThreeInsideUp: boolean;
  /** Alert toggles (only used by the alert conditions) */
  alertHammer: boolean;
  alertEngulfing: boolean;
  alertMorningStar: boolean;
  alertPiercing: boolean;
  alertThreeSoldiers: boolean;
  alertThreeInsideUp: boolean;
  /** Stochastic filter: K > D */
  useStoch: boolean;
  stochKLen: number;
  stochDLen: number;
  stochSmooth: number;
  /** Volume filter: volume > SMA 20 of the volume * multiplier */
  useVolume: boolean;
  volumeMultiplier: number;
}

export const defaultInputs: AbusuhilBullishCandlesInputs = {
  showHammer: true,
  showEngulfing: true,
  showMorningStar: true,
  showPiercing: true,
  showThreeSoldiers: true,
  showThreeInsideUp: true,
  alertHammer: true,
  alertEngulfing: true,
  alertMorningStar: true,
  alertPiercing: true,
  alertThreeSoldiers: true,
  alertThreeInsideUp: true,
  useStoch: false,
  stochKLen: 14,
  stochDLen: 3,
  stochSmooth: 3,
  useVolume: false,
  volumeMultiplier: 1.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'showHammer', type: 'bool', title: 'Enable Hammer', defval: true },
  { id: 'showEngulfing', type: 'bool', title: 'Enable Bullish Engulfing', defval: true },
  { id: 'showMorningStar', type: 'bool', title: 'Enable Morning Star', defval: true },
  { id: 'showPiercing', type: 'bool', title: 'Enable Piercing Line', defval: true },
  { id: 'showThreeSoldiers', type: 'bool', title: 'Enable Three White Soldiers', defval: true },
  { id: 'showThreeInsideUp', type: 'bool', title: 'Enable Three Inside Up', defval: true },
  { id: 'alertHammer', type: 'bool', title: 'Alert Hammer', defval: true, group: 'Alert Settings' },
  { id: 'alertEngulfing', type: 'bool', title: 'Alert Bullish Engulfing', defval: true, group: 'Alert Settings' },
  { id: 'alertMorningStar', type: 'bool', title: 'Alert Morning Star', defval: true, group: 'Alert Settings' },
  { id: 'alertPiercing', type: 'bool', title: 'Alert Piercing Line', defval: true, group: 'Alert Settings' },
  { id: 'alertThreeSoldiers', type: 'bool', title: 'Alert Three White Soldiers', defval: true, group: 'Alert Settings' },
  { id: 'alertThreeInsideUp', type: 'bool', title: 'Alert Three Inside Up', defval: true, group: 'Alert Settings' },
  { id: 'useStoch', type: 'bool', title: 'Enable Stochastic Filter', defval: false, group: 'Filters' },
  { id: 'stochKLen', type: 'int', title: 'K Period', defval: 14, group: 'Filters' },
  { id: 'stochDLen', type: 'int', title: 'D Period', defval: 3, group: 'Filters' },
  { id: 'stochSmooth', type: 'int', title: 'Smooth', defval: 3, group: 'Filters' },
  { id: 'useVolume', type: 'bool', title: 'Enable Volume Filter', defval: false, group: 'Filters' },
  { id: 'volumeMultiplier', type: 'float', title: 'Volume Multiplier', defval: 1.0, group: 'Filters' },
];

/** No plot(): the outputs are the label markers of the six plotshape calls */
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Abusuhil Bullish Candles',
  shortTitle: 'Abusuhil Bullish Candles',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Pine plotshape default text colour */
const PINE_TEXT = '#2962FF';

export function calculate(
  bars: Bar[],
  inputs: Partial<AbusuhilBullishCandlesInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = new Series(bars, (b) => b.close);

  // k = ta.sma(ta.stoch(close, high, low, stochKLen), stochSmooth), d = ta.sma(k, stochDLen)
  const kS = ta.sma(ta.stoch(close, new Series(bars, (b) => b.high), new Series(bars, (b) => b.low), cfg.stochKLen), cfg.stochSmooth);
  const k = A(kS);
  const d = A(ta.sma(kS, cfg.stochDLen));
  // volPass = not useVolume or volume > ta.sma(volume, 20) * volumeMultiplier (lazy or: the SMA runs only when the
  // filter is on, then on every bar)
  const volSma = cfg.useVolume ? A(ta.sma(new Series(bars, (b) => b.volume ?? NaN), 20)) : [];
  const ema = A(ta.ema(close, 20));

  const markers: MarkerData[] = [];
  // id: the plotshape output (shape0 .. shape5 in the original's order)
  const label = (time: number, on: boolean, col: string, text: string, id: string) => {
    if (on) markers.push({ time, position: 'belowBar', shape: 'labelUp', color: col, text, textColor: PINE_TEXT, size: 'auto', id });
  };
  // alertcondition(<pattern>Cond and alert<Pattern>, ...): one flag list per pattern
  const flags: boolean[][] = [[], [], [], [], [], []];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const { open, high, close: c } = b;
    const p1 = i >= 1 ? bars[i - 1] : null;
    const p2 = i >= 2 ? bars[i - 2] : null;
    const open1 = p1 ? p1.open : NaN;
    const close1 = p1 ? p1.close : NaN;
    const low1 = p1 ? p1.low : NaN;
    const open2 = p2 ? p2.open : NaN;
    const close2 = p2 ? p2.close : NaN;
    const high2 = p2 ? p2.high : NaN;
    const ema1 = i >= 1 ? ema[i - 1] : NaN;
    const ema2 = i >= 2 ? ema[i - 2] : NaN;
    const k1 = i >= 1 ? k[i - 1] : NaN;
    const d1 = i >= 1 ? d[i - 1] : NaN;

    const volPass = !cfg.useVolume || gt(b.volume ?? NaN, volSma[i] * cfg.volumeMultiplier);
    const stochPass = !cfg.useStoch || (gt(k[i], d[i]) || (lt(k1, d1) && gt(k[i], d[i])));
    const allFiltersPass = stochPass && volPass;
    const isDown = lt(c, ema[i]) && lt(close1, ema1) && lt(close2, ema2);

    // Hammer
    const hammerCond = cfg.showHammer && isDown && gt(c, open) && gt(open - b.low, 2 * Math.abs(c - open))
      && lt(high - c, c - open) && allFiltersPass;
    label(b.time, hammerCond, color.green, 'Hammer', 'shape0');
    flags[0].push(hammerCond && cfg.alertHammer);

    // Bullish Engulfing
    const engulfingCond = cfg.showEngulfing && isDown && lt(close1, open1) && gt(c, open) && lt(open, close1)
      && gt(c, open1) && gt(c - open, 1.5 * Math.abs(close1 - open1)) && allFiltersPass;
    label(b.time, engulfingCond, color.lime, 'Engulf', 'shape1');
    flags[1].push(engulfingCond && cfg.alertEngulfing);

    // Morning Star
    const body2 = Math.abs(close2 - open2);
    const body1 = Math.abs(close1 - open1);
    const morningStarCond = cfg.showMorningStar && isDown && lt(close2, open2) && gt(body2, body1 * 2)
      && lt(body1, body2 * 0.5) && gt(c, open) && gt(c, (open2 + close2) / 2) && allFiltersPass;
    label(b.time, morningStarCond, color.navy, 'Morning Star', 'shape2');
    flags[2].push(morningStarCond && cfg.alertMorningStar);

    // Piercing Line
    const piercingCond = cfg.showPiercing && isDown && lt(close1, open1) && gt(c, open) && lt(open, low1)
      && gt(c, (open1 + close1) / 2) && allFiltersPass;
    label(b.time, piercingCond, color.orange, 'Piercing', 'shape3');
    flags[3].push(piercingCond && cfg.alertPiercing);

    // Three White Soldiers
    const threeSoldiersCond = cfg.showThreeSoldiers && isDown && gt(close2, open2) && gt(close1, open1) && gt(c, open)
      && gt(open1, open2) && gt(close1, close2) && gt(open, open1) && gt(c, close1) && allFiltersPass;
    label(b.time, threeSoldiersCond, color.maroon, '3 Soldiers', 'shape4');
    flags[4].push(threeSoldiersCond && cfg.alertThreeSoldiers);

    // Three Inside Up
    const threeInsideUpCond = cfg.showThreeInsideUp && isDown && lt(close2, open2) && gt(close1, open1)
      && gt(open1, close2) && lt(close1, open2) && gt(c, open) && gt(c, high2) && allFiltersPass;
    label(b.time, threeInsideUpCond, color.teal, 'Inside Up', 'shape5');
    flags[5].push(threeInsideUpCond && cfg.alertThreeInsideUp);
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
  { id: 'alert0', title: 'Hammer Alert', message: 'Hammer pattern detected' },
  { id: 'alert1', title: 'Engulfing Alert', message: 'Bullish Engulfing pattern detected' },
  { id: 'alert2', title: 'Morning Star Alert', message: 'Morning Star pattern detected' },
  { id: 'alert3', title: 'Piercing Line Alert', message: 'Piercing Line pattern detected' },
  { id: 'alert4', title: 'Three White Soldiers Alert', message: 'Three White Soldiers pattern detected' },
  { id: 'alert5', title: 'Three Inside Up Alert', message: 'Three Inside Up pattern detected' },
];

export const AbusuhilBullishCandles = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
