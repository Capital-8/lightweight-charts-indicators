/**
 * Engulfing + Sweep (Confirmed Only), bars only
 *
 * A bullish engulfing sweep: a bullish candle after a bearish one, whose close is above the previous open and close
 * and whose low is below the previous low (optional minimum body / range ratio). The bearish case is the mirror
 * (close below the previous body, high above the previous high). The signal is confirmed on the next bar (with the
 * "Require next candle confirmation" option, that bar must close in the same direction); the engulfing candle is
 * then coloured (barcolor with offset -1: the colour of bar i is drawn on bar i - 1).
 *
 * Last bar: a signal needs a closed confirmation bar. The port reads the state of the last bar from the optional
 * third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Confirmed Bullish Engulfing + Low Sweep' and 'Confirmed Bearish
 * Engulfing + High Sweep', true on the confirmation bar (the bar after the coloured one).
 *
 * Reference: "Engulfing + Sweep (Confirmed Only) v6 — bars only" by fanta-grapefruit
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface EngulfingSweepV6BarsOnlyInputs {
  enableBullish: boolean;
  enableBearish: boolean;
  /** Minimum body / range ratio (0 = any size) */
  minBodySize: number;
  requireConfirmation: boolean;
  bullColor: string;
  bearColor: string;
}

export const defaultInputs: EngulfingSweepV6BarsOnlyInputs = {
  enableBullish: true,
  enableBearish: true,
  minBodySize: 0.0,
  requireConfirmation: true,
  bullColor: color.lime,
  bearColor: color.red,
};

export const inputConfig: InputConfig[] = [
  { id: 'enableBullish', type: 'bool', title: 'Bullish Engulfing + Low Sweep', defval: true },
  { id: 'enableBearish', type: 'bool', title: 'Bearish Engulfing + High Sweep', defval: true },
  { id: 'minBodySize', type: 'float', title: 'Min candle body size (0 = any size)', defval: 0.0, min: 0.0, max: 1.0, step: 0.05 },
  { id: 'requireConfirmation', type: 'bool', title: 'Require next candle confirmation', defval: true },
  { id: 'bullColor', type: 'color', title: 'Bullish color', defval: color.lime },
  { id: 'bearColor', type: 'color', title: 'Bearish color', defval: color.red },
];

// Bar colours only (barcolor)
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Engulfing + Sweep (Confirmed Only) v6 — bars only',
  shortTitle: 'Engulfing + Sweep (Confirmed Only) v6 — bars only',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<EngulfingSweepV6BarsOnlyInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // Conditions of each bar (read one bar back below)
  const bullEngulf: boolean[] = new Array(n).fill(false);
  const bearEngulf: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const b = bars[i];
    const p = bars[i - 1];
    const valid = !isNaN(p.open) && !isNaN(p.close);
    const body2 = Math.abs(b.close - b.open);
    const range2 = b.high - b.low;
    // minBodySize <= 0.0 or (range2 > 0 and body2 / range2 >= minBodySize)
    const body2OK = le(cfg.minBodySize, 0) || (gt(range2, 0) && ge(body2 / range2, cfg.minBodySize));
    const bullPrev = gt(p.close, p.open);
    const bearPrev = lt(p.close, p.open);
    const bullNow = gt(b.close, b.open);
    const bearNow = lt(b.close, b.open);
    const bullEngulfBody = gt(b.close, Math.max(p.open, p.close));
    const bearEngulfBody = lt(b.close, Math.min(p.open, p.close));
    const sweepPrevLow = lt(b.low, p.low);
    const sweepPrevHigh = gt(b.high, p.high);
    bullEngulf[i] = cfg.enableBullish && valid && bullNow && bullEngulfBody && sweepPrevLow && bearPrev && body2OK;
    bearEngulf[i] = cfg.enableBearish && valid && bearNow && bearEngulfBody && sweepPrevHigh && bullPrev && body2OK;
  }

  const barColors: BarColorData[] = [];
  const bullFlags: boolean[] = new Array(n).fill(false);
  const bearFlags: boolean[] = new Array(n).fill(false);
  for (let i = 2; i < n; i++) {
    const b = bars[i];
    // confirmation_bull = requireConfirmation ? (bullNow and barstate.isconfirmed) : barstate.isconfirmed
    const confirmationBull = barIsConfirmed(i) && (cfg.requireConfirmation ? gt(b.close, b.open) : true);
    const confirmationBear = barIsConfirmed(i) && (cfg.requireConfirmation ? lt(b.close, b.open) : true);
    const any = cfg.enableBullish || cfg.enableBearish;
    const bullSignal = bullEngulf[i - 1] && confirmationBull && any;
    const bearSignal = bearEngulf[i - 1] && confirmationBear && any;
    bullFlags[i] = bullSignal;
    bearFlags[i] = bearSignal;
    // barcolor(..., offset = -1): drawn on the engulfing bar i - 1
    if (bullSignal) barColors.push({ time: bars[i - 1].time, color: cfg.bullColor });
    else if (bearSignal) barColors.push({ time: bars[i - 1].time, color: cfg.bearColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    barColors,
    // alertcondition(bullSignal, ...) / alertcondition(bearSignal, ...)
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Confirmed Bullish Engulfing + Low Sweep', message: 'Confirmed Bullish Engulfing + Low Sweep on {{ticker}} @ {{interval}}' },
  { id: 'alert1', title: 'Confirmed Bearish Engulfing + High Sweep', message: 'Confirmed Bearish Engulfing + High Sweep on {{ticker}} @ {{interval}}' },
];

export const EngulfingSweepV6BarsOnly = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
