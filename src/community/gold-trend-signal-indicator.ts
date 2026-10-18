/**
 * Gold Trend Signal
 *
 * A fast and a slow EMA of the close. A LONG label is drawn when the fast EMA crosses over the slow EMA, a SHORT label
 * when it crosses under. The background is green while the fast EMA is above the slow EMA, red otherwise.
 * Alerts (alertcondition, `alerts` of the result): 'Gold Long Signal' and 'Gold Short Signal', on the bars of the
 * crosses.
 *
 * Reference: "Gold Trend Signal" by CsmillrSirrry
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface GoldTrendSignalIndicatorInputs {
  /** Fast EMA period */
  emaFast: number;
  /** Slow EMA period */
  emaSlow: number;
}

export const defaultInputs: GoldTrendSignalIndicatorInputs = {
  emaFast: 20,
  emaSlow: 50,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaFast', type: 'int', title: 'Fast EMA Period', defval: 20 },
  { id: 'emaSlow', type: 'int', title: 'Slow EMA Period', defval: 50 },
];

const FAST_COL = String(color.new(color.blue, 0));
const SLOW_COL = String(color.new(color.orange, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast EMA (20)', color: FAST_COL, lineWidth: 2 },
  { id: 'plot1', title: 'Slow EMA (50)', color: SLOW_COL, lineWidth: 3 },
];

export const metadata = {
  title: 'Gold Trend Signal',
  shortTitle: 'GOLD-SIG',
  overlay: true,
};

/** Pine float comparison: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<GoldTrendSignalIndicatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const ema20s = ta.ema(close, cfg.emaFast);
  const ema50s = ta.ema(close, cfg.emaSlow);
  const ema20 = A(ema20s);
  const ema50 = A(ema50s);
  // ta.crossover / ta.crossunder compare exactly
  const longSignal = A(ta.crossover(ema20s, ema50s));
  const shortSignal = A(ta.crossunder(ema20s, ema50s));

  const upBg = String(color.new(color.green, 90));
  const downBg = String(color.new(color.red, 90));
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].time;
    if (longSignal[i]) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'LONG',
        textColor: color.white, size: 'large' });
    }
    if (shortSignal[i]) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SHORT',
        textColor: color.white, size: 'large' });
    }
    // bgcolor(uptrend ? color.new(color.green, 90) : color.new(color.red, 90))
    bgColors.push({ time: t, color: gt(ema20[i], ema50[i]) ? upBg : downBg });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: ema20[i], color: FAST_COL })),
      plot1: bars.map((b, i) => ({ time: b.time, value: ema50[i], color: SLOW_COL })),
    },
    markers,
    bgColors,
    // alertcondition(long_signal, "Gold Long Signal") / alertcondition(short_signal, "Gold Short Signal")
    alerts: alertStates(alertConditions, bars, [longSignal.map((v) => !!v), shortSignal.map((v) => !!v)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Gold Long Signal', message: 'Gold Long Entry Triggered!' },
  { id: 'alert1', title: 'Gold Short Signal', message: 'Gold Short Entry Triggered!' },
];

export const GoldTrendSignalIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
