/**
 * Optimized Trend Tracker (OTT)
 *
 * Smoothed moving average with percentage-based trailing stop.
 * Support line (MA) determines trend direction;
 * OTT = MA * (200 ± percent) / 200 based on which side of trailing stop.
 * VAR moving average as the original: vCMO = nz((sum(vud1, 9) - sum(vdd1, 9)) / (sum + sum)), 0 until the 9-bar
 * sums exist, VAR = nz(valpha * |vCMO| * src) + (1 - valpha * |vCMO|) * nz(VAR[1]) (it starts from 0).
 * Buy / Sell labels (plotshape, location absolute, as the original): at OTT * 0.995 under / OTT * 1.005 over, green
 * #4CAF50 / red #FF5252 with white text, from the first bar where the crosses exist; the support line crossing
 * labels behind "Show Support Line Crossing Signals?" (on), the others behind their inputs (off).
 * Lines from bar 0, as the original: the support line (VAR, 0 until its 9-bar sums exist) behind "Show Support
 * Line?", OTT plotted as nz(OTT[2]) (0 on the first two bars), purple #B800D9, or green / red by OTT[2] against
 * OTT[3] with "Show OTT Color Changes?" (off). Highlighter fills ("Highlighter On/Off ?", on) green / red where the
 * support line is above / below OTT.
 * Alerts (alertcondition, `alerts` of the result): the 9 conditions of the original (OTT colour change, support
 * line / OTT crosses, price / OTT crosses) on the same crosses as the labels (OTT[2] = OTT two bars back).
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
  /** Show Support Line? */
  showSupport: boolean;
  /** Show Support Line Crossing Signals? */
  showSignalsK: boolean;
  showSignalsC: boolean;
  /** Show OTT Color Changes? */
  highlight: boolean;
  showSignalsR: boolean;
  /** Highlighter On/Off ? */
  highlighting: boolean;
}

export const defaultInputs: OTTInputs = {
  source: 'close',
  period: 2,
  percent: 1.4,
  showSupport: true,
  showSignalsK: true,
  showSignalsC: false,
  highlight: false,
  showSignalsR: false,
  highlighting: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'period', type: 'int', title: 'OTT Period', defval: 2, min: 1 },
  { id: 'percent', type: 'float', title: 'OTT Percent', defval: 1.4, min: 0, step: 0.1 },
  { id: 'showSupport', type: 'bool', title: 'Show Support Line?', defval: true },
  { id: 'showSignalsK', type: 'bool', title: 'Show Support Line Crossing Signals?', defval: true },
  { id: 'showSignalsC', type: 'bool', title: 'Show Price/OTT Crossing Signals?', defval: false },
  { id: 'highlight', type: 'bool', title: 'Show OTT Color Changes?', defval: false },
  { id: 'showSignalsR', type: 'bool', title: 'Show OTT Color Change Signals?', defval: false },
  { id: 'highlighting', type: 'bool', title: 'Highlighter On/Off ?', defval: true },
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
  const { source, period, percent, showSupport, showSignalsK, showSignalsC, highlight, showSignalsR, highlighting } =
    { ...defaultInputs, ...inputs };
  const n = bars.length;

  // Default MA type is VAR (Variable Index Dynamic Average)
  const src = getSourceSeries(bars, source);
  const srcArr = src.toArray();

  // VAR calculation (Pine Var_Func)
  const valpha = 2 / (period + 1);
  const mavg: number[] = new Array(n);
  const vud1: number[] = new Array(n);
  const vdd1: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = srcArr[i] ?? NaN;
    const ps = i > 0 ? (srcArr[i - 1] ?? NaN) : NaN;
    // vud1 = src > src[1] ? src - src[1] : 0 (0 when src[1] is na)
    vud1[i] = s > ps ? s - ps : 0;
    vdd1[i] = s < ps ? ps - s : 0;
    // vUD = sum(vud1, 9), vDD = sum(vdd1, 9): na before the 9th bar
    let vCMO = 0;
    if (i >= 8) {
      let vUD = 0, vDD = 0;
      for (let j = i - 8; j <= i; j++) { vUD += vud1[j]; vDD += vdd1[j]; }
      const c = (vUD - vDD) / (vUD + vDD);
      vCMO = Number.isFinite(c) ? c : 0; // nz()
    }
    const k = valpha * Math.abs(vCMO);
    const term = k * s;
    mavg[i] = (Number.isFinite(term) ? term : 0) + (1 - k) * (i > 0 ? mavg[i - 1] : 0);
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

  // plot(showsupport ? MAvg : na, "Support Line"): from bar 0 (VAR starts from 0)
  const plot0 = mavg.map((v, i) => ({ time: bars[i].time, value: showSupport ? v : NaN }));
  // pALL = plot(nz(OTT[2]), color = OTTC, "OTT"): 0 on the first two bars;
  // OTTC = highlight ? OTT[2] > OTT[3] ? color.green : color.red : #B800D9 (na compares false: red)
  const plot1 = ott.map((_v, i) => {
    const ottLag = i >= 2 ? ott[i - 2] : NaN;
    const ottLagPrev = i >= 3 ? ott[i - 3] : NaN;
    const color = highlight ? (ottLag > ottLagPrev ? '#4CAF50' : '#FF5252') : '#B800D9';
    return { time: bars[i].time, value: Number.isFinite(ottLag) ? ottLag : 0, color };
  });

  // mPlot = plot(ohlc4, display = display.none)
  const plot2 = bars.map((b) => ({ time: b.time, value: (b.open + b.high + b.low + b.close) / 4 }));
  // fill(mPlot, pALL, "UpTrend Highligter", highlighting ? (MAvg > OTT ? color.green : na) : na) /
  // fill(mPlot, pALL, "DownTrend Highligter", highlighting ? (MAvg < OTT ? color.red : na) : na)
  const upFill = mavg.map((v, i) => (highlighting && v > ott[i] ? 'rgba(76,175,80,0.15)' : 'transparent'));
  const downFill = mavg.map((v, i) => (highlighting && v < ott[i] ? 'rgba(255,82,82,0.15)' : 'transparent'));

  // Crosses (Pine: crossover / crossunder of MAvg, src and OTT[2] with OTT[2] / OTT[3]; OTT[2] / OTT[3] are na on the
  // first bars). The alerts read the same crosses.
  const ott2 = ott.map((_v, i) => (i >= 2 ? ott[i - 2] : NaN));
  const ott3 = ott.map((_v, i) => (i >= 3 ? ott[i - 3] : NaN));
  const srcVals = srcArr.map((v) => v ?? NaN);
  const either = (a: boolean[], b: boolean[]) => a.map((v, i) => v || b[i]);
  const colorUp = crossedOver(ott2, ott3), colorDown = crossedUnder(ott2, ott3);
  const supUp = crossedOver(mavg, ott2), supDown = crossedUnder(mavg, ott2);
  const priceUp = crossedOver(srcVals, ott2), priceDown = crossedUnder(srcVals, ott2);

  // Markers (plotshape order): support line crosses (showsignalsk, on by default), price crosses (showsignalsc), OTT colour
  // changes (showsignalsr); Buy at OTT * 0.995 (labelup under it), Sell at OTT * 1.005 (labeldown over it)
  const green = '#4CAF50', red = '#FF5252', white = '#FFFFFF';
  const buy = (id: string, i: number): MarkerData => ({ id, time: bars[i].time, position: 'atPriceBottom', price: ott[i] * 0.995,
    shape: 'labelUp', color: green, text: 'Buy', textColor: white, size: 'tiny' });
  const sell = (id: string, i: number): MarkerData => ({ id, time: bars[i].time, position: 'atPriceTop', price: ott[i] * 1.005,
    shape: 'labelDown', color: red, text: 'Sell', textColor: white, size: 'tiny' });
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    if (showSignalsK && supUp[i]) markers.push(buy('shape0', i));
    if (showSignalsK && supDown[i]) markers.push(sell('shape1', i));
    if (showSignalsC && priceUp[i]) markers.push(buy('shape2', i));
    if (showSignalsC && priceDown[i]) markers.push(sell('shape3', i));
    if (showSignalsR && colorUp[i]) markers.push(buy('shape4', i));
    if (showSignalsR && colorDown[i]) markers.push(sell('shape5', i));
  }

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
