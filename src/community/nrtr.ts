/**
 * Nick Rypock Trailing Reverse (NRTR)
 *
 * ATR-based dynamic trailing reverse indicator.
 * In uptrend, trail = max(prev_trail, close - k*ATR).
 * If close < trail, flip to downtrend (and vice versa).
 * Two plot series: green for uptrend, red for downtrend, each filled to ohlc4 (hidden plot) while its trend is on.
 *
 * Alerts (alertcondition, `alerts` of the result): "NRTR Direction Change", "NRTR Buy" and "NRTR Sell" (the trend
 * changes, from the first drawn bar).
 *
 * Reference: "Nick Rypock Trailing Reverse"
 */

import { ta, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'NRTR Direction Change', message: 'NRTR has changed direction, {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'NRTR Buy', message: 'NRTR Buy, {{exchange}}:{{ticker}}' },
  { id: 'alert2', title: 'NRTR Sell', message: 'NRTR Sell, {{exchange}}:{{ticker}}' },
];

export interface NRTRInputs {
  atrPeriod: number;
  mult: number;
}

export const defaultInputs: NRTRInputs = {
  atrPeriod: 14,
  mult: 2.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 14, min: 1 },
  { id: 'mult', type: 'float', title: 'Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'NRTR Up', color: '#26A69A', lineWidth: 2 },
  { id: 'plot1', title: 'NRTR Down', color: '#EF5350', lineWidth: 2 },
  { id: 'plot2', title: 'Mid Price', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Nick Rypock Trailing Reverse',
  shortTitle: 'NRTR',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<NRTRInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { atrPeriod, mult } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const atrArr = ta.atr(bars, atrPeriod).toArray();

  const trailArr: number[] = new Array(n);
  const dirArr: number[] = new Array(n); // 1 = up, -1 = down

  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const rawAtr = atrArr[i];
    const atrVal = (rawAtr != null && !isNaN(rawAtr) ? rawAtr : 0) * mult;

    if (i === 0 || atrVal === 0) {
      trailArr[i] = close;
      dirArr[i] = 1;
      continue;
    }

    const prevTrail = trailArr[i - 1];
    const prevDir = dirArr[i - 1];

    if (prevDir === 1) {
      // Uptrend: trail ratchets up
      const newTrail = close - atrVal;
      trailArr[i] = Math.max(prevTrail, newTrail);
      if (close < trailArr[i]) {
        dirArr[i] = -1;
        trailArr[i] = close + atrVal;
      } else {
        dirArr[i] = 1;
      }
    } else {
      // Downtrend: trail ratchets down
      const newTrail = close + atrVal;
      trailArr[i] = Math.min(prevTrail, newTrail);
      if (close > trailArr[i]) {
        dirArr[i] = 1;
        trailArr[i] = close - atrVal;
      } else {
        dirArr[i] = -1;
      }
    }
  }

  const warmup = atrPeriod;

  // Markers: buy when trend flips to 1, sell when trend flips to -1
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  for (let i = warmup; i < n; i++) {
    buyFlags[i] = dirArr[i] === 1 && dirArr[i - 1] === -1;
    sellFlags[i] = dirArr[i] === -1 && dirArr[i - 1] === 1;
    if (dirArr[i] === 1 && dirArr[i - 1] === -1) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'circle', color: '#26A69A', text: '' });
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#26A69A', text: 'Buy' });
    } else if (dirArr[i] === -1 && dirArr[i - 1] === 1) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'circle', color: '#EF5350', text: '' });
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#EF5350', text: 'Sell' });
    }
  }

  const plot0 = trailArr.map((v, i) => ({
    time: bars[i].time,
    value: (i < warmup || dirArr[i] !== 1) ? NaN : v,
  }));

  const plot1 = trailArr.map((v, i) => ({
    time: bars[i].time,
    value: (i < warmup || dirArr[i] !== -1) ? NaN : v,
  }));

  // midPricePlot = plot(ohlc4, display = display.none)
  const plot2 = bars.map((b) => ({ time: b.time, value: (b.open + b.high + b.low + b.close) / 4 }));
  // fill(midPricePlot, longStopPlot, 'Long State Filling', trend == 1 ? long fill : na)
  // fill(midPricePlot, shortStopPlot, 'Short State Filling', trend == -1 ? short fill : na)
  const longFill: string[] = [];
  const shortFill: string[] = [];
  for (let i = 0; i < n; i++) {
    const on = i >= warmup;
    longFill.push(on && dirArr[i] === 1 ? 'rgba(38,166,154,0.15)' : 'rgba(0,0,0,0)');
    shortFill.push(on && dirArr[i] === -1 ? 'rgba(239,83,80,0.15)' : 'rgba(0,0,0,0)');
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2 },
    fills: [
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'Long State Filling', color: 'rgba(38,166,154,0.15)' }, colors: longFill },
      { plot1: 'plot2', plot2: 'plot1', options: { title: 'Short State Filling', color: 'rgba(239,83,80,0.15)' }, colors: shortFill },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [buyFlags.map((f, i) => f || sellFlags[i]), buyFlags, sellFlags]),
  };
}

export const NRTR = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
