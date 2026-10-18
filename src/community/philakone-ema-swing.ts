/**
 * Philakone 55 EMA Swing Trading
 *
 * EMA 55 with EMA 9 for swing trading. Buy signal when close > EMA55 and EMA9 crosses
 * above EMA55. Sell signal when close < EMA55 and EMA9 crosses below EMA55.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Condition' / 'Sell Condition', true on the bars where EMA 21
 * crosses EMA 55 with EMA 8 > EMA 13 and EMA 21 > EMA 55 (buy) or the mirror (sell).
 *
 * Reference: "Philakone 55 EMA Swing Trading" (community)
 */

import { ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PhilakoneEMASwingInputs {
  src: SourceType;
}

export const defaultInputs: PhilakoneEMASwingInputs = {
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA 8', color: '#FF0000', lineWidth: 1 },
  { id: 'plot1', title: 'MA 13', color: '#FF7F00', lineWidth: 2 },
  { id: 'plot2', title: 'MA 21', color: '#FFFF00', lineWidth: 3 },
  { id: 'plot3', title: 'MA 55', color: '#00FF00', lineWidth: 4 },
];

export const metadata = {
  title: 'Philakone 55 EMA Swing Trading',
  shortTitle: 'P55EMA',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<PhilakoneEMASwingInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const src = getSourceSeries(bars, cfg.src);

  const ma8Arr = ta.ema(src, 8).toArray();
  const ma13Arr = ta.ema(src, 13).toArray();
  const ma21Arr = ta.ema(src, 21).toArray();
  const ma55Arr = ta.ema(src, 55).toArray();

  const warmup = 55;

  const plot0 = ma8Arr.map((v, i) => ({
    time: bars[i].time,
    value: i < warmup ? NaN : (v ?? NaN),
  }));

  const plot1 = ma13Arr.map((v, i) => ({
    time: bars[i].time,
    value: i < warmup ? NaN : (v ?? NaN),
  }));

  const plot2 = ma21Arr.map((v, i) => ({
    time: bars[i].time,
    value: i < warmup ? NaN : (v ?? NaN),
  }));

  const plot3 = ma55Arr.map((v, i) => ({
    time: bars[i].time,
    value: i < warmup ? NaN : (v ?? NaN),
  }));

  // Pine buy/sell: cross(ma21, ma55) and ma8 > ma13 and ma21 > ma55
  const markers: MarkerData[] = [];
  for (let i = warmup + 1; i < bars.length; i++) {
    const m8 = ma8Arr[i] ?? 0;
    const m13 = ma13Arr[i] ?? 0;
    const m21 = ma21Arr[i] ?? 0;
    const m55 = ma55Arr[i] ?? 0;
    const pm21 = ma21Arr[i - 1] ?? 0;
    const pm55 = ma55Arr[i - 1] ?? 0;

    const cross21_55 = (pm21 <= pm55 && m21 > m55) || (pm21 >= pm55 && m21 < m55);

    // Buy: ma21 crosses ma55 and ma8 > ma13 and ma21 > ma55
    if (cross21_55 && m8 > m13 && m21 > m55) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: '#00FF00', text: 'Buy' });
    }
    // Sell: ma21 crosses ma55 and ma8 < ma13 and ma21 < ma55
    if (cross21_55 && m8 < m13 && m21 < m55) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: '#FF0000', text: 'Sell' });
    }
  }

  // buy_cond / sell_cond of the original on every bar (na compares false)
  const v = (a: (number | null)[], i: number) => (i >= 0 ? a[i] ?? NaN : NaN);
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  for (let i = 0; i < bars.length; i++) {
    const m8 = v(ma8Arr, i), m13 = v(ma13Arr, i), m21 = v(ma21Arr, i), m55 = v(ma55Arr, i);
    const pm21 = v(ma21Arr, i - 1), pm55 = v(ma55Arr, i - 1);
    const cross = (m21 > m55 && pm21 <= pm55) || (m21 < m55 && pm21 >= pm55);
    buyFlags.push(cross && m8 > m13 && m21 > m55);
    sellFlags.push(cross && m8 < m13 && m21 < m55);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2, 'plot3': plot3 },
    markers,
    // alertcondition(buy_cond, 'Buy Condition') / alertcondition(sell_cond, 'Sell Condition')
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Condition', message: 'Buy Condition Alert' },
  { id: 'alert1', title: 'Sell Condition', message: 'Sell Condition Alert' },
];

export const PhilakoneEMASwing = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
