/**
 * Optimized Trend Tracker (OTT)
 *
 * Smoothed moving average with percentage-based trailing stop.
 * Support line (MA) determines trend direction;
 * OTT = MA * (200 ± percent) / 200 based on which side of trailing stop.
 * Alerts (alertcondition, `alerts` of the result): the 9 conditions of the original (OTT colour change, support
 * line / OTT crosses, price / OTT crosses), on the series of the port (OTT[2] = OTT two bars back).
 *
 * Reference: "Optimized Trend Tracker" by KivancOzbilgic
 */

import { getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface OTTInputs {
  source: SourceType;
  period: number;
  percent: number;
  highlight: boolean;
  showSignalsC: boolean;
  showSignalsR: boolean;
}

export const defaultInputs: OTTInputs = {
  source: 'close',
  period: 2,
  percent: 1.4,
  highlight: true,
  showSignalsC: false,
  showSignalsR: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'period', type: 'int', title: 'OTT Period', defval: 2, min: 1 },
  { id: 'percent', type: 'float', title: 'OTT Percent', defval: 1.4, min: 0, step: 0.1 },
  { id: 'highlight', type: 'bool', title: 'Highlight OTT Color', defval: true },
  { id: 'showSignalsC', type: 'bool', title: 'Show Price/OTT Crossing Signals', defval: false },
  { id: 'showSignalsR', type: 'bool', title: 'Show OTT Color Change Signals', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Support Line', color: '#0585E1', lineWidth: 2 },
  { id: 'plot1', title: 'OTT', color: '#B800D9', lineWidth: 2 },
  // mPlot = plot(ohlc4, display = display.none): one side of the highlighter fills
  { id: 'plot2', title: 'OHLC4', color: '#2196F3', lineWidth: 1, style: 'circles', display: 'none' },
];

export const metadata = {
  title: 'Optimized Trend Tracker',
  shortTitle: 'OTT',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<OTTInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { source, period, percent, highlight, showSignalsC, showSignalsR } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // Default MA type is VAR (Variable Index Dynamic Average)
  const src = getSourceSeries(bars, source);
  const srcArr = src.toArray();

  // VAR calculation (VIDYA-like using CMO)
  const valpha = 2 / (period + 1);
  const mavg: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const s = srcArr[i] ?? 0;
    // Compute CMO over 9 bars
    let vUD = 0;
    let vDD = 0;
    for (let j = Math.max(0, i - 8); j <= i; j++) {
      const cur = srcArr[j] ?? 0;
      const prev = j > 0 ? (srcArr[j - 1] ?? 0) : cur;
      if (cur > prev) vUD += cur - prev;
      if (cur < prev) vDD += prev - cur;
    }
    const vCMO = (vUD + vDD) === 0 ? 0 : (vUD - vDD) / (vUD + vDD);
    mavg[i] = i === 0 ? s : valpha * Math.abs(vCMO) * s + (1 - valpha * Math.abs(vCMO)) * mavg[i - 1];
  }

  // Trailing stop logic
  const fark = mavg.map((v) => v * percent * 0.01);
  const longStop: number[] = new Array(n);
  const shortStop: number[] = new Array(n);
  const dir: number[] = new Array(n);
  const ott: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    longStop[i] = mavg[i] - fark[i];
    shortStop[i] = mavg[i] + fark[i];

    if (i > 0) {
      if (mavg[i] > longStop[i - 1]) longStop[i] = Math.max(longStop[i], longStop[i - 1]);
      if (mavg[i] < shortStop[i - 1]) shortStop[i] = Math.min(shortStop[i], shortStop[i - 1]);

      dir[i] = dir[i - 1];
      if (dir[i - 1] === -1 && mavg[i] > shortStop[i - 1]) dir[i] = 1;
      else if (dir[i - 1] === 1 && mavg[i] < longStop[i - 1]) dir[i] = -1;
    } else {
      dir[i] = 1;
    }

    const mt = dir[i] === 1 ? longStop[i] : shortStop[i];
    ott[i] = mavg[i] > mt ? mt * (200 + percent) / 200 : mt * (200 - percent) / 200;
  }

  const warmup = period + 9;
  const plot0 = mavg.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : v }));
  // OTT is plotted with 2-bar offset like the original, with dynamic color
  const plot1 = ott.map((_v, i) => {
    if (i < warmup + 2) return { time: bars[i].time, value: NaN };
    const ottLag = ott[i - 2];
    const ottLagPrev = i >= warmup + 3 ? ott[i - 3] : ottLag;
    // Dynamic color: green when OTT rising, red when falling, default purple
    const color = highlight
      ? (ottLag > ottLagPrev ? '#008000' : '#FF0000')
      : '#B800D9';
    return { time: bars[i].time, value: ottLag, color };
  });

  // mPlot = plot(ohlc4, display = display.none)
  const plot2 = bars.map((b) => ({ time: b.time, value: (b.open + b.high + b.low + b.close) / 4 }));
  // fill(mPlot, pALL, "UpTrend Highligter", MAvg > OTT ? green : na) / fill(..., "DownTrend Highligter", MAvg < OTT ? red : na)
  const upFill = mavg.map((v, i) => (i >= warmup + 2 && v > ott[i] ? 'rgba(0,128,0,0.15)' : 'transparent'));
  const downFill = mavg.map((v, i) => (i >= warmup + 2 && v < ott[i] ? 'rgba(255,0,0,0.15)' : 'transparent'));

  // Markers: buy when MAvg crosses above OTT[2], sell when crosses below (support line signals - always shown)
  const markers: MarkerData[] = [];
  for (let i = warmup + 3; i < n; i++) {
    const ottLag = ott[i - 2];
    const ottLagPrev = ott[i - 3];
    // Support line / MA crossover signals (showsignalsk - always on by default)
    if (mavg[i - 1] <= ottLagPrev && mavg[i] > ottLag) {
      markers.push({ id: 'shape0', time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#008000', text: 'Buy' });
    } else if (mavg[i - 1] >= ottLagPrev && mavg[i] < ottLag) {
      markers.push({ id: 'shape1', time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#FF0000', text: 'Sell' });
    }

    // Price/OTT crossing signals (Pine: buySignalc = crossover(src, OTT[2]))
    if (showSignalsC) {
      const srcCur = srcArr[i] ?? 0;
      const srcPrev = srcArr[i - 1] ?? 0;
      if (srcPrev <= ottLagPrev && srcCur > ottLag) {
        markers.push({ id: 'shape2', time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#008000', text: 'Buy' });
      } else if (srcPrev >= ottLagPrev && srcCur < ottLag) {
        markers.push({ id: 'shape3', time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#FF0000', text: 'Sell' });
      }
    }

  }

  // Re-do OTT color change signals correctly outside the loop to avoid nested complexity
  if (showSignalsR) {
    for (let i = warmup + 4; i < n; i++) {
      const curOtt2 = ott[i - 2];
      const curOtt3 = ott[i - 3];
      const prevOtt2 = ott[i - 3]; // at bar i-1, OTT[2] = ott[(i-1)-2] = ott[i-3]
      const prevOtt3 = ott[i - 4]; // at bar i-1, OTT[3] = ott[(i-1)-3] = ott[i-4]
      // crossover(OTT[2], OTT[3]): prevOtt2 <= prevOtt3 && curOtt2 > curOtt3
      if (prevOtt2 <= prevOtt3 && curOtt2 > curOtt3) {
        markers.push({ id: 'shape4', time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#008000', text: 'Buy' });
      }
      // crossunder(OTT[2], OTT[3]): prevOtt2 >= prevOtt3 && curOtt2 < curOtt3
      if (prevOtt2 >= prevOtt3 && curOtt2 < curOtt3) {
        markers.push({ id: 'shape5', time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#FF0000', text: 'Sell' });
      }
    }
  }

  // Alerts: OTT[2] / OTT[3] (na on the first bars), MAvg and the source of the port
  const ott2 = ott.map((_v, i) => (i >= 2 ? ott[i - 2] : NaN));
  const ott3 = ott.map((_v, i) => (i >= 3 ? ott[i - 3] : NaN));
  const srcVals = srcArr.map((v) => v ?? NaN);
  const either = (a: boolean[], b: boolean[]) => a.map((v, i) => v || b[i]);
  const colorUp = crossedOver(ott2, ott3), colorDown = crossedUnder(ott2, ott3);
  const supUp = crossedOver(mavg, ott2), supDown = crossedUnder(mavg, ott2);
  const priceUp = crossedOver(srcVals, ott2), priceDown = crossedUnder(srcVals, ott2);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2 },
    fills: [
      { plot1: 'plot2', plot2: 'plot1', options: { title: 'UpTrend Highligter' }, colors: upFill },
      { plot1: 'plot2', plot2: 'plot1', options: { title: 'DownTrend Highligter' }, colors: downFill },
    ],
    markers,
    // alertcondition(cross / crossover / crossunder of OTT[2] and OTT[3], MAvg and OTT[2], src and OTT[2])
    alerts: alertStates(alertConditions, bars, [
      either(colorUp, colorDown), colorUp, colorDown,
      either(supUp, supDown), supUp, supDown,
      either(priceUp, priceDown), priceUp, priceDown,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Color ALARM', message: 'OTT Has Changed Color!' },
  { id: 'alert1', title: 'GREEN ALERT', message: 'OTT GREEN BUY SIGNAL!' },
  { id: 'alert2', title: 'RED ALERT', message: 'OTT RED SELL SIGNAL!' },
  { id: 'alert3', title: 'Cross Alert', message: 'OTT - Support Line Crossing!' },
  { id: 'alert4', title: 'Crossover Alarm', message: 'Support Line BUY SIGNAL!' },
  { id: 'alert5', title: 'Crossunder Alarm', message: 'Support Line SELL SIGNAL!' },
  { id: 'alert6', title: 'Price Cross Alert', message: 'OTT - Price Crossing!' },
  { id: 'alert7', title: 'Price Crossover Alarm', message: 'PRICE OVER OTT - BUY SIGNAL!' },
  { id: 'alert8', title: 'Price Crossunder Alarm', message: 'PRICE UNDER OTT - SELL SIGNAL!' },
];

export const OptimizedTrendTracker = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
