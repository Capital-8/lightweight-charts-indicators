/**
 * OBV + Custom MA Strategy
 *
 * On Balance Volume computed by hand: it starts at 0 on the first bar, adds the volume when the close is above the
 * previous close, subtracts it when the close is below, and stays the same otherwise. A short-term and a long-term
 * moving average (SMA, EMA or WMA) of the OBV are plotted with it.
 *
 * Alerts (alertcondition, `alerts` of the result): the short-term MA crossing over / under the long-term MA and the
 * OBV crossing over / under the short-term MA.
 *
 * Reference: "OBV + Custom MA Strategy" by Rafiki-is-Trading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Signal (MA Crossover)', message: 'Bullish signal: Short-term MA crosses above long-term MA' },
  { id: 'alert1', title: 'Bearish Signal (MA Crossover)', message: 'Bearish signal: Short-term MA crosses below long-term MA' },
  { id: 'alert2', title: 'Bullish Signal (OBV Crossover)', message: 'Bullish signal: OBV crosses above short-term MA' },
  { id: 'alert3', title: 'Bearish Signal (OBV Crossover)', message: 'Bearish signal: OBV crosses below short-term MA' },
];

export type ObvCustomMaType = 'SMA' | 'EMA' | 'WMA';

export interface ObvCustomMaStrategyInputs {
  /** Moving average type */
  maType: ObvCustomMaType;
  /** Short-term MA length */
  maLength1: number;
  /** Long-term MA length */
  maLength2: number;
}

export const defaultInputs: ObvCustomMaStrategyInputs = {
  maType: 'EMA',
  maLength1: 20,
  maLength2: 100,
};

export const inputConfig: InputConfig[] = [
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'EMA', options: ['SMA', 'EMA', 'WMA'] },
  { id: 'maLength1', type: 'int', title: 'Short-term MA Length', defval: 20, min: 1 },
  { id: 'maLength2', type: 'int', title: 'Long-term MA Length', defval: 100, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'OBV', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'Short-term MA', color: color.red, lineWidth: 1 },
  { id: 'plot2', title: 'Long-term MA', color: color.green, lineWidth: 1 },
];

export const metadata = {
  title: 'OBV + Custom MA Strategy',
  shortTitle: 'OBV + Custom MA Strategy',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ObvCustomMaStrategyInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // var float obv = na; if na(obv): obv := 0, else +volume / -volume / unchanged
  const obv: number[] = new Array(n);
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    let v = prev;
    if (isNaN(v)) v = 0;
    else if (i > 0 && gt(bars[i].close, bars[i - 1].close)) v = v + (bars[i].volume ?? NaN);
    else if (i > 0 && lt(bars[i].close, bars[i - 1].close)) v = v - (bars[i].volume ?? NaN);
    obv[i] = v;
    prev = v;
  }

  // f_ma(src, length, ma_type): ma_type is an input, so the same branch runs on every bar
  const ma = (len: number): number[] => {
    switch (cfg.maType) {
      case 'SMA': return A(ta.sma(S(obv), len));
      case 'EMA': return A(ta.ema(S(obv), len));
      case 'WMA': return A(ta.wma(S(obv), len));
      default: return new Array(n).fill(NaN);
    }
  };
  const maShort = ma(cfg.maLength1);
  const maLong = ma(cfg.maLength2);

  const t = (i: number) => bars[i].time;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: obv.map((v, i) => ({ time: t(i), value: v, color: color.blue })),
      plot1: maShort.map((v, i) => ({ time: t(i), value: v, color: color.red })),
      plot2: maLong.map((v, i) => ({ time: t(i), value: v, color: color.green })),
    },
    alerts: alertStates(alertConditions, bars, [
      crossedOver(maShort, maLong), crossedUnder(maShort, maLong), crossedOver(obv, maShort), crossedUnder(obv, maShort),
    ]),
  };
}

export const ObvCustomMaStrategy = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
