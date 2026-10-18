/**
 * Chandelier Exit
 *
 * Long stop:  highest(length) - ATR*mult, short stop: lowest(length) + ATR*mult (the highest / lowest close with
 * "Use Close for Extremums"). The stops ratchet: the long stop never falls while the previous close is above it, the
 * short stop never rises while the previous close is below it. The direction turns long when the close is above the
 * previous short stop and short when it is below the previous long stop (it starts long).
 * As in the original, the long stop is drawn while the direction is long and the short stop while it is short (lines
 * with breaks); a circle at the stop and a Buy / Sell label ("Show Buy/Sell Labels") mark the bar where the direction
 * turns; with "Highlight State" the area between ohlc4 and the stop of the direction is filled green / red (85 %
 * transparent).
 *
 * Alerts (alertcondition, `alerts` of the result): 'CE Direction Change', 'CE Buy' and 'CE Sell', on the same
 * direction. With "Await Bar Confirmation" (default) an open last bar gives no alert: the state of the last bar is read
 * from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface ChandelierExitInputs {
  atrPeriod: number;
  atrMult: number;
  useClose: boolean;
  /** Show Buy/Sell Labels */
  showLabels: boolean;
  /** Highlight State: fill between ohlc4 and the stop of the direction */
  highlightState: boolean;
  /** The alerts wait for the bar to close */
  awaitBarConfirmation: boolean;
}

export const defaultInputs: ChandelierExitInputs = {
  atrPeriod: 22,
  atrMult: 3.0,
  useClose: true,
  showLabels: true,
  highlightState: true,
  awaitBarConfirmation: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 22, min: 1 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 3.0, min: 0.01, step: 0.1 },
  { id: 'useClose', type: 'bool', title: 'Use Close for Extremums', defval: true },
  { id: 'showLabels', type: 'bool', title: 'Show Buy/Sell Labels', defval: true },
  { id: 'highlightState', type: 'bool', title: 'Highlight State', defval: true },
  { id: 'awaitBarConfirmation', type: 'bool', title: 'Await Bar Confirmation', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Long Stop', color: '#4CAF50', lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Short Stop', color: '#F23645', lineWidth: 2, style: 'linebr' },
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
  const { atrPeriod, atrMult, useClose, showLabels, highlightState, awaitBarConfirmation } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // atr = mult * ta.atr(length); ta.highest(close, length) / ta.highest(length) (of the high), lowest: the mirror
  const atrArr = ta.atr(bars, atrPeriod).toArray();
  const closeSeries = new Series(bars, (bar) => bar.close);
  const highSeries = new Series(bars, (bar) => bar.high);
  const lowSeries = new Series(bars, (bar) => bar.low);
  const highestArr = (useClose ? ta.highest(closeSeries, atrPeriod) : ta.highest(highSeries, atrPeriod)).toArray();
  const lowestArr = (useClose ? ta.lowest(closeSeries, atrPeriod) : ta.lowest(lowSeries, atrPeriod)).toArray();

  const longColor = color.green;
  const shortColor = color.red;
  const textColor = color.white;
  const longFill = String(color.new(color.green, 85));
  const shortFill = String(color.new(color.red, 85));

  const lastBarOpen = !lastBarConfirmedOf(chart);
  const flags: boolean[][] = [[], [], []];
  const longData: { time: number; value: number }[] = [];
  const shortData: { time: number; value: number }[] = [];
  const midData: { time: number; value: number }[] = [];
  const longFillColors: string[] = [];
  const shortFillColors: string[] = [];
  const markers: MarkerData[] = [];
  let longStopLast = NaN;
  let shortStopLast = NaN;
  let dir = 1; // var int dir = 1
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time as number;
    const atr = atrMult * (atrArr[i] ?? NaN);
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    // longStop = highest - atr; longStopPrev = nz(longStop[1], longStop);
    // longStop := close[1] > longStopPrev ? math.max(longStop, longStopPrev) : longStop (short stop: the mirror)
    let longStop = (highestArr[i] ?? NaN) - atr;
    const longStopPrev = isNaN(longStopLast) ? longStop : longStopLast;
    if (gt(close1, longStopPrev)) longStop = Math.max(longStop, longStopPrev);
    let shortStop = (lowestArr[i] ?? NaN) + atr;
    const shortStopPrev = isNaN(shortStopLast) ? shortStop : shortStopLast;
    if (lt(close1, shortStopPrev)) shortStop = Math.min(shortStop, shortStopPrev);
    // dir := close > shortStopPrev ? 1 : close < longStopPrev ? -1 : dir
    const prevDir = i > 0 ? dir : NaN;
    dir = gt(b.close, shortStopPrev) ? 1 : lt(b.close, longStopPrev) ? -1 : dir;
    longStopLast = longStop;
    shortStopLast = shortStop;

    // buySignal = dir == 1 and dir[1] == -1 (dir[1] is na on the first bar); sellSignal = dir == -1 and dir[1] == 1
    const buySignal = dir === 1 && prevDir === -1;
    const sellSignal = dir === -1 && prevDir === 1;

    // plot(dir == 1 ? longStop : na, 'Long Stop', plot.style_linebr) / plot(dir == 1 ? na : shortStop, 'Short Stop')
    longData.push({ time, value: dir === 1 ? longStop : NaN });
    shortData.push({ time, value: dir === 1 ? NaN : shortStop });
    // midPricePlot = plot(ohlc4, display = display.none, editable = false)
    midData.push({ time, value: (b.open + b.high + b.low + b.close) / 4 });
    // fill(midPricePlot, longStopPlot, color = highlightState and dir == 1 ? longFillColor : na); the short one with -1
    longFillColors.push(highlightState && dir === 1 ? longFill : 'transparent');
    shortFillColors.push(highlightState && dir === -1 ? shortFill : 'transparent');

    // plotshape(buySignal ? longStop : na, 'Long Stop Start', location.absolute, shape.circle, size.tiny)
    // plotshape(buySignal and showLabels ? longStop : na, 'Buy Label', text = 'Buy', shape.labelup, size.tiny)
    if (buySignal && !isNaN(longStop)) {
      markers.push({ id: 'shape0', time, position: 'atPriceMiddle', price: longStop, shape: 'circle', color: longColor,
        size: 'tiny' });
      if (showLabels) {
        markers.push({ id: 'shape1', time, position: 'atPriceBottom', price: longStop, shape: 'labelUp', color: longColor,
          text: 'Buy', textColor, size: 'tiny' });
      }
    }
    // plotshape(sellSignal ? shortStop : na, 'Short Stop Start', ...) / 'Sell Label' (shape.labeldown)
    if (sellSignal && !isNaN(shortStop)) {
      markers.push({ id: 'shape2', time, position: 'atPriceMiddle', price: shortStop, shape: 'circle', color: shortColor,
        size: 'tiny' });
      if (showLabels) {
        markers.push({ id: 'shape3', time, position: 'atPriceTop', price: shortStop, shape: 'labelDown', color: shortColor,
          text: 'Sell', textColor, size: 'tiny' });
      }
    }

    // await = awaitBarConfirmation ? barstate.isconfirmed : true
    const awaitOk = !awaitBarConfirmation || !(lastBarOpen && i === n - 1);
    // dir != dir[1] (false on the first bar: dir[1] is na)
    flags[0].push(i > 0 && dir !== prevDir && awaitOk);
    flags[1].push(buySignal && awaitOk);
    flags[2].push(sellSignal && awaitOk);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': longData, 'plot1': shortData, 'plot2': midData },
    fills: [
      { plot1: 'plot2', plot2: 'plot0', options: { color: longFill }, colors: longFillColors },
      { plot1: 'plot2', plot2: 'plot1', options: { color: shortFill }, colors: shortFillColors },
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
