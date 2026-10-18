/**
 * Sweep2Trade Pro [CHE]
 *
 * A T3 line (six nested EMAs of hlc3 with the volume factor) is the trend line, green when it is below hlc3, red
 * otherwise. A bullish sweep is a low under the lowest low of the previous `swingLook` bars with a close back above
 * it (bearish: mirror with the highest high). Each side runs a sequence: the sweep starts phase 1 with a timeout of
 * `dipWindow` bars; a rising (falling) T3 moves it to phase 2 (sweep signal, optional timeout restart); in phase 2 a
 * confirmation bar gives the BUY (SELL) signal and resets the sequence. Confirmation: a break of the highest high
 * (lowest low) of the previous `bosLb` bars (wick or close cross), a close in the top (bottom) quarter of the bar, a
 * close above (below) the T3, and with the regime filter a T3 rising (falling) over 3 bars with the close on the
 * right side and R² of close against bar_index over `r2Len` bars above the minimum.
 * Alerts (alertcondition, `alerts` of the result): BUY / SELL sequence complete and SWEEP Long / Short cleared, true on
 * the bars of the matching markers.
 *
 * Reference: "Sweep2Trade Pro [CHE]" by chervolino
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © chervolino
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0',
    title: 'S2T Pro [CHE] BUY: Sequence complete',
    message: 'S2T Pro [CHE] – BUY: Bullish sweep → T3↑ → confirmation (trend filter possibly active).',
  },
  { id: 'alert1', title: 'S2T Pro [CHE] SWEEP Long (bullish)', message: 'S2T Pro [CHE] – SWEEP LONG (bullish) cleared (T3 rising).' },
  {
    id: 'alert2',
    title: 'S2T Pro [CHE] SELL: Sequence complete',
    message: 'S2T Pro [CHE] – SELL: Bearish sweep → T3↓ → confirmation (trend filter possibly active).',
  },
  { id: 'alert3', title: 'S2T Pro [CHE] SWEEP Short (bearish)', message: 'S2T Pro [CHE] – SWEEP SHORT (bearish) cleared (T3 falling).' },
];

export interface Sweep2TradeProInputs {
  /** T3 length */
  t3Length: number;
  /** T3 volume factor */
  t3VolumeFactor: number;
  /** R² lookback */
  r2Len: number;
  /** R² minimum threshold */
  r2Min: number;
  /** Regime filter active */
  useTrendFilter: boolean;
  /** Max bars for the sequence (timeout) */
  dipWindow: number;
  /** Restart the timeout after the T3 direction */
  extendTimeoutOnPhase2: boolean;
  /** Swing lookback for the sweep (high / low) */
  swingLook: number;
  /** BOS lookback (micro pivot) */
  bosLb: number;
  /** BOS: the wick is sufficient (else a close cross) */
  useWickBOS: boolean;
  /** Require the BOS */
  requireBOS: boolean;
  /** Require a close above / below the T3 */
  needT3Close: boolean;
}

export const defaultInputs: Sweep2TradeProInputs = {
  t3Length: 4,
  t3VolumeFactor: 0.7,
  r2Len: 100,
  r2Min: 0.2,
  useTrendFilter: true,
  dipWindow: 8,
  extendTimeoutOnPhase2: true,
  swingLook: 20,
  bosLb: 5,
  useWickBOS: true,
  requireBOS: true,
  needT3Close: true,
};

export const inputConfig: InputConfig[] = [
  { id: 't3Length', type: 'int', title: 'T3 Length', defval: 4, min: 1, step: 1 },
  { id: 't3VolumeFactor', type: 'float', title: 'T3 Volume Factor', defval: 0.7, min: 0, max: 1, step: 0.1 },
  { id: 'r2Len', type: 'int', title: 'R² Lookback', defval: 100, min: 20 },
  { id: 'r2Min', type: 'float', title: 'R² Minimum Threshold', defval: 0.2, min: 0.0, max: 1.0, step: 0.01 },
  { id: 'useTrendFilter', type: 'bool', title: 'Regime Filter active', defval: true },
  { id: 'dipWindow', type: 'int', title: 'Max bars for sequence (timeout)', defval: 8, min: 1, max: 50 },
  { id: 'extendTimeoutOnPhase2', type: 'bool', title: 'Restart timeout after T3 direction', defval: true },
  { id: 'swingLook', type: 'int', title: 'Swing lookback for sweep (High/Low)', defval: 20, min: 5 },
  { id: 'bosLb', type: 'int', title: 'BOS lookback (micro pivot)', defval: 5, min: 2 },
  { id: 'useWickBOS', type: 'bool', title: 'BOS: Wick is sufficient', defval: true },
  { id: 'requireBOS', type: 'bool', title: 'Require BOS', defval: true },
  { id: 'needT3Close', type: 'bool', title: 'Require close above/below T3', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'S2T T3', color: color.green, lineWidth: 2 },
];

export const metadata = {
  title: 'Sweep2Trade Pro [CHE]',
  shortTitle: 'S2T Pro',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Pine plotshape default text colour */
const PINE_TEXT = '#2962FF';

export function calculate(
  bars: Bar[],
  inputs: Partial<Sweep2TradeProInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // T3 of hlc3
  const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
  const len = cfg.t3Length;
  const xe1 = A(ta.ema(S(hlc3), len));
  const xe2 = A(ta.ema(S(xe1), len));
  const xe3 = A(ta.ema(S(xe2), len));
  const xe4 = A(ta.ema(S(xe3), len));
  const xe5 = A(ta.ema(S(xe4), len));
  const xe6 = A(ta.ema(S(xe5), len));
  const c1 = cfg.t3VolumeFactor;
  const c2 = c1 * 3;
  const c3 = c1 * 3;
  const c4 = c1;
  const t3 = bars.map((_b, i) => xe6[i] * c4 + xe5[i] * -c3 + xe4[i] * c2 + xe3[i] * -c1 + xe2[i]);

  // r = ta.correlation(close, bar_index, r2Len); the bar_index origin does not change the correlation
  const r = A(ta.correlation(S(bars.map((b) => b.close)), S(bars.map((_b, i) => i)), cfg.r2Len));

  const lowest = A(ta.lowest(S(bars.map((b) => b.low)), cfg.swingLook));
  const highest = A(ta.highest(S(bars.map((b) => b.high)), cfg.swingLook));
  const bosHigh = A(ta.highest(S(bars.map((b) => b.high)), cfg.bosLb));
  const bosLow = A(ta.lowest(S(bars.map((b) => b.low)), cfg.bosLb));
  const prev = (a: number[], i: number, k = 1) => (i - k >= 0 ? a[i - k] : NaN);

  const t3Col = (i: number) => (lt(t3[i], hlc3[i]) ? color.green : color.red);
  const plot0 = bars.map((b, i) => ({ time: b.time, value: t3[i], color: t3Col(i) }));

  const markers: MarkerData[] = [];
  const flags: boolean[][] = [[], [], [], []];
  let phaseL = 0;
  let phaseS = 0;
  let timeoutBarL = NaN;
  let timeoutBarS = NaN;
  let prevBull = false;
  let prevBear = false;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const r2 = Math.pow(r[i], 2);
    const upChain = gt(t3[i], prev(t3, i)) && gt(prev(t3, i), prev(t3, i, 2)) && gt(prev(t3, i, 2), prev(t3, i, 3));
    const downChain = lt(t3[i], prev(t3, i)) && lt(prev(t3, i), prev(t3, i, 2)) && lt(prev(t3, i, 2), prev(t3, i, 3));
    const trendUp = gt(b.close, t3[i]) && upChain && gt(r2, cfg.r2Min);
    const trendDown = lt(b.close, t3[i]) && downChain && gt(r2, cfg.r2Min);

    // Sweeps
    const priorLowest = prev(lowest, i);
    const bullishSweep = lt(b.low, priorLowest) && gt(b.close, priorLowest);
    const newBullish = bullishSweep && !prevBull;
    const priorHighest = prev(highest, i);
    const bearishSweep = gt(b.high, priorHighest) && lt(b.close, priorHighest);
    const newBearish = bearishSweep && !prevBear;
    prevBull = bullishSweep;
    prevBear = bearishSweep;

    // Confirmation; ta.crossover(close, level): close > level and close[1] <= level[1]; ta.crossunder(close, level):
    // close < level and close[1] >= level[1]; both compare exactly (no 1e-10 tolerance; na compares false). The wick
    // tests are Pine operators (1e-10 tolerance).
    const lvlH = prev(bosHigh, i);
    const lvlH1 = prev(bosHigh, i, 2);
    const lvlL = prev(bosLow, i);
    const lvlL1 = prev(bosLow, i, 2);
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    const bosLong = cfg.useWickBOS ? gt(b.high, lvlH) : b.close > lvlH && close1 <= lvlH1;
    const bosShort = cfg.useWickBOS ? lt(b.low, lvlL) : b.close < lvlL && close1 >= lvlL1;
    const bullClose = ge(b.close, b.high - (b.high - b.low) * 0.25);
    const bearClose = le(b.close, b.low + (b.high - b.low) * 0.25);
    const aboveT3 = isNaN(t3[i]) ? true : gt(b.close, t3[i]);
    const belowT3 = isNaN(t3[i]) ? true : lt(b.close, t3[i]);
    const confirmLong = (cfg.requireBOS ? bosLong : true) && bullClose && (cfg.needT3Close ? aboveT3 : true);
    const confirmShort = (cfg.requireBOS ? bosShort : true) && bearClose && (cfg.needT3Close ? belowT3 : true);

    // Event 1: sweep -> phase 1 + timeout (bar_index origin cancels out)
    if (newBullish) {
      phaseL = 1;
      timeoutBarL = i + cfg.dipWindow;
    }
    if (newBearish) {
      phaseS = 1;
      timeoutBarS = i + cfg.dipWindow;
    }
    // Timeout
    if (phaseL > 0 && !isNaN(timeoutBarL) && i > timeoutBarL) {
      phaseL = 0;
      timeoutBarL = NaN;
    }
    if (phaseS > 0 && !isNaN(timeoutBarS) && i > timeoutBarS) {
      phaseS = 0;
      timeoutBarS = NaN;
    }
    // Event 2 / 3: T3 direction -> phase 2
    const t3Up = gt(t3[i], prev(t3, i));
    const t3Down = lt(t3[i], prev(t3, i));
    const sweepSignalLong = phaseL === 1 && t3Up;
    const sweepSignalShort = phaseS === 1 && t3Down;
    if (sweepSignalLong) {
      phaseL = 2;
      if (cfg.extendTimeoutOnPhase2) timeoutBarL = i + cfg.dipWindow;
    }
    if (sweepSignalShort) {
      phaseS = 2;
      if (cfg.extendTimeoutOnPhase2) timeoutBarS = i + cfg.dipWindow;
    }
    // Event 4: trades
    const buySignal = phaseL === 2 && confirmLong && (cfg.useTrendFilter ? trendUp : true);
    const sellSignal = phaseS === 2 && confirmShort && (cfg.useTrendFilter ? trendDown : true);
    if (buySignal) {
      phaseL = 0;
      timeoutBarL = NaN;
    }
    if (sellSignal) {
      phaseS = 0;
      timeoutBarS = NaN;
    }

    // alertcondition(buySignal) / (sweepSignalLong) / (sellSignal) / (sweepSignalShort)
    flags[0].push(buySignal);
    flags[1].push(sweepSignalLong);
    flags[2].push(sellSignal);
    flags[3].push(sweepSignalShort);

    const t = b.time;
    if (sweepSignalLong) {
      markers.push({ time: t, position: 'belowBar', shape: 'xcross', color: color.aqua, text: 'SWEEP L OK',
        textColor: PINE_TEXT, size: 'tiny' });
    }
    if (buySignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: color.lime, text: 'BUY',
        textColor: PINE_TEXT, size: 'small' });
    }
    if (sweepSignalShort) {
      markers.push({ time: t, position: 'aboveBar', shape: 'xcross', color: color.fuchsia, text: 'SWEEP S OK',
        textColor: PINE_TEXT, size: 'tiny' });
    }
    if (sellSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: color.red, text: 'SELL',
        textColor: PINE_TEXT, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

export const Sweep2TradePro = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
