/**
 * Philakone 55 EMA Swing Trading
 *
 * MAs 8 / 13 / 21 / 55 (EMA, or SMA with 'Exponential MA' off) for swing trading. Buy: MA 21 crosses MA 55 with
 * MA 8 > MA 13 and MA 21 > MA 55; Sell: the mirror. Each MA is drawn from its first value (bar length - 1), the
 * markers on every bar where the original's conditions are true (the cross needs both MAs on the bar before).
 * Lines red (8), orange (13), yellow (21) and lime (55), as the original.
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
  exponential: boolean;
}

export const defaultInputs: PhilakoneEMASwingInputs = {
  src: 'close',
  exponential: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'exponential', type: 'bool', title: 'Exponential MA', defval: true },
];

// plot(ma8 / ma13 / ma21 / ma55, color = color.new(color.red / orange / yellow / lime, 0), linewidth = 1 / 2 / 3 / 4)
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '8', color: '#FF5252', lineWidth: 1 },
  { id: 'plot1', title: '13', color: '#FF9800', lineWidth: 2 },
  { id: 'plot2', title: '21', color: '#FFEB3B', lineWidth: 3 },
  { id: 'plot3', title: '55', color: '#00E676', lineWidth: 4 },
];

export const metadata = {
  title: 'Philakone 55 EMA Swing Trading',
  shortTitle: 'P55EMA',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<PhilakoneEMASwingInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const src = getSourceSeries(bars, cfg.src);

  // maN = exponential ? ta.ema(src, N) : ta.sma(src, N)
  const ma = (len: number) => (cfg.exponential ? ta.ema(src, len) : ta.sma(src, len)).toArray();
  const ma8Arr = ma(8);
  const ma13Arr = ma(13);
  const ma21Arr = ma(21);
  const ma55Arr = ma(55);

  const line = (a: (number | null)[]) => a.map((v, i) => ({ time: bars[i].time, value: v ?? NaN }));
  const plot0 = line(ma8Arr);
  const plot1 = line(ma13Arr);
  const plot2 = line(ma21Arr);
  const plot3 = line(ma55Arr);

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

  // plotshape(buy_cond, 'buy', shape.triangleup, location.belowbar, color.new(color.lime, 35), text = 'Buy') and
  // plotshape(sell_cond, 'sell', shape.triangledown, location.abovebar, color.new(color.red, 35), text = 'Sell')
  const markers: MarkerData[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (buyFlags[i]) {
      markers.push({ id: 'shape0', time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: 'rgba(0,230,118,0.65)', text: 'Buy', textColor: 'rgba(0,230,118,0.65)', size: 'normal' });
    }
    if (sellFlags[i]) {
      markers.push({ id: 'shape1', time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: 'rgba(255,82,82,0.65)', text: 'Sell', textColor: 'rgba(255,82,82,0.65)', size: 'normal' });
    }
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
