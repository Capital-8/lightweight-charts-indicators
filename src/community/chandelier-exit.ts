/**
 * Chandelier Exit
 *
 * Long stop:  highest(length) - ATR*mult
 * Short stop: lowest(length)  + ATR*mult
 *
 * Both lines are plotted continuously, as in the PineScript
 * `ta.chandelier()` library function. Direction state is still
 * tracked to drive buy/sell markers and the fill colors, but the plotted
 * series are never gated to NaN.
 *
 * Alerts (alertcondition, `alerts` of the result): 'CE Direction Change', 'CE Buy' and 'CE Sell', on the direction of
 * the original: the stops ratchet (the long stop never falls while the previous close is above it, the short stop
 * never rises while the previous close is below it) and the direction turns when the close crosses the previous
 * stop. With "Await Bar Confirmation" (default) an open last bar gives no alert: the state of the last bar is read
 * from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface ChandelierExitInputs {
  atrPeriod: number;
  atrMult: number;
  useClose: boolean;
  /** The alerts wait for the bar to close */
  awaitBarConfirmation: boolean;
}

export const defaultInputs: ChandelierExitInputs = {
  atrPeriod: 22,
  atrMult: 3.0,
  useClose: true,
  awaitBarConfirmation: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 22, min: 1 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 3.0, min: 0.01, step: 0.1 },
  { id: 'useClose', type: 'bool', title: 'Use Close for Extremums', defval: true },
  { id: 'awaitBarConfirmation', type: 'bool', title: 'Await Bar Confirmation', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Long Stop', color: '#26A69A', lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Short Stop', color: '#EF5350', lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'Mid Price', color: 'transparent', lineWidth: 0, display: 'none' },
];

export const metadata = {
  title: 'Chandelier Exit',
  shortTitle: 'CE',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ChandelierExitInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { atrPeriod, atrMult, useClose, awaitBarConfirmation } = { ...defaultInputs, ...inputs };

  const atrSeries = ta.atr(bars, atrPeriod);
  const atrArr = atrSeries.toArray();

  const closeSeries = new Series(bars, (bar) => bar.close);
  const highSeries = new Series(bars, (bar) => bar.high);
  const lowSeries = new Series(bars, (bar) => bar.low);

  const highestSrc = useClose ? ta.highest(closeSeries, atrPeriod) : ta.highest(highSeries, atrPeriod);
  const lowestSrc = useClose ? ta.lowest(closeSeries, atrPeriod) : ta.lowest(lowSeries, atrPeriod);
  const highestArr = highestSrc.toArray();
  const lowestArr = lowestSrc.toArray();

  const longStopArr: number[] = [];
  const shortStopArr: number[] = [];
  const dirArr: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    const atrVal = (atrArr[i] ?? 0) * atrMult;
    const longStop = (highestArr[i] ?? bars[i].high) - atrVal;
    const shortStop = (lowestArr[i] ?? bars[i].low) + atrVal;

    if (i > 0) {
      const prevLongStop = longStopArr[i - 1];
      const prevShortStop = shortStopArr[i - 1];
      const prevDir = dirArr[i - 1];
      const close = bars[i].close;
      if (close > prevShortStop) {
        dirArr.push(1);
      } else if (close < prevLongStop) {
        dirArr.push(-1);
      } else {
        dirArr.push(prevDir);
      }
    } else {
      dirArr.push(1);
    }

    longStopArr.push(longStop);
    shortStopArr.push(shortStop);
  }

  const warmup = atrPeriod;
  const longData = longStopArr.map((value, i) => ({
    time: bars[i].time,
    value: i < warmup ? NaN : value,
  }));

  const shortData = shortStopArr.map((value, i) => ({
    time: bars[i].time,
    value: i < warmup ? NaN : value,
  }));

  // Hidden ohlc4 plot for fills
  const midData = bars.map((b, i) => ({
    time: b.time,
    value: i < warmup ? NaN : (b.open + b.high + b.low + b.close) / 4,
  }));

  // Markers: buy/sell on direction change, plus circle at stop level
  const markers: MarkerData[] = [];
  for (let i = warmup + 1; i < bars.length; i++) {
    if (dirArr[i] !== dirArr[i - 1]) {
      if (dirArr[i] === 1) {
        markers.push({ time: bars[i].time, position: 'belowBar', shape: 'circle', color: '#26A69A', text: '' });
        markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#26A69A', text: 'Buy' });
      } else {
        markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'circle', color: '#EF5350', text: '' });
        markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#EF5350', text: 'Sell' });
      }
    }
  }

  // Dynamic fill colors: green when long (dir=1), red when short (dir=-1)
  const longFillColors = bars.map((_b, i) => {
    if (i < warmup) return 'transparent';
    return dirArr[i] === 1 ? 'rgba(38,166,154,0.15)' : 'transparent';
  });
  const shortFillColors = bars.map((_b, i) => {
    if (i < warmup) return 'transparent';
    return dirArr[i] === -1 ? 'rgba(239,83,80,0.15)' : 'transparent';
  });

  // Alerts, on the stops and direction of the original:
  // longStop = highest - atr; longStopPrev = nz(longStop[1], longStop);
  // longStop := close[1] > longStopPrev ? math.max(longStop, longStopPrev) : longStop (short stop: the mirror rule);
  // dir := close > shortStopPrev ? 1 : close < longStopPrev ? -1 : dir (var int dir = 1)
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const flags: boolean[][] = [[], [], []];
  let longStopLast = NaN;
  let shortStopLast = NaN;
  let dir = 1;
  for (let i = 0; i < bars.length; i++) {
    const atr = atrMult * (atrArr[i] ?? NaN);
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    let longStop = (highestArr[i] ?? NaN) - atr;
    const longStopPrev = isNaN(longStopLast) ? longStop : longStopLast;
    if (gt(close1, longStopPrev)) longStop = Math.max(longStop, longStopPrev);
    let shortStop = (lowestArr[i] ?? NaN) + atr;
    const shortStopPrev = isNaN(shortStopLast) ? shortStop : shortStopLast;
    if (lt(close1, shortStopPrev)) shortStop = Math.min(shortStop, shortStopPrev);
    const prevDir = i > 0 ? dir : NaN;
    const close = bars[i].close;
    dir = gt(close, shortStopPrev) ? 1 : lt(close, longStopPrev) ? -1 : dir;
    longStopLast = longStop;
    shortStopLast = shortStop;
    // await = awaitBarConfirmation ? barstate.isconfirmed : true
    const awaitOk = !awaitBarConfirmation || !(lastBarOpen && i === bars.length - 1);
    // dir != dir[1] (false on the first bar: dir[1] is na); buySignal = dir == 1 and dir[1] == -1; sellSignal mirror
    flags[0].push(i > 0 && dir !== prevDir && awaitOk);
    flags[1].push(dir === 1 && prevDir === -1 && awaitOk);
    flags[2].push(dir === -1 && prevDir === 1 && awaitOk);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': longData, 'plot1': shortData, 'plot2': midData },
    fills: [
      { plot1: 'plot2', plot2: 'plot0', options: { color: 'rgba(38,166,154,0.15)' }, colors: longFillColors },
      { plot1: 'plot2', plot2: 'plot1', options: { color: 'rgba(239,83,80,0.15)' }, colors: shortFillColors },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'CE Direction Change', message: 'Chandelier Exit has changed direction, {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'CE Buy', message: 'Chandelier Exit Buy, {{exchange}}:{{ticker}}' },
  { id: 'alert2', title: 'CE Sell', message: 'Chandelier Exit Sell, {{exchange}}:{{ticker}}' },
];

export const ChandelierExit = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
