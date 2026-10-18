/**
 * Buy & Sell - Accurate Signals (Chandelier Exit)
 *
 * Chandelier Exit: long stop = highest(close or high, length) - mult * ATR(length), short stop =
 * lowest(close or low, length) + mult * ATR(length). The long stop only rises while the previous close stays above
 * it, the short stop only falls while the previous close stays below it. The direction turns long when the close
 * goes above the previous short stop and short when it goes below the previous long stop. The stop of the current
 * direction is drawn, with a circle and a Buy / Sell label on direction changes and a fill between ohlc4 and the
 * stop.
 *
 * Alert conditions (`alerts` of the result): "CE Direction Change" (the direction differs from the previous bar's),
 * "CE Buy" and "CE Sell" (the Buy / Sell signals). With "Await Bar Confirmation" they are false on a last bar that
 * is still open (`barstate.isconfirmed`, from the chart context, third argument of calculate).
 *
 * Reference: "Chandelier Exit" by Cryptokingworld91 (published as "Buy & Sell - Accurate Signals")
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (c) 2019-present, Alex Orekhov (everget). Chandelier Exit script may be freely
 * distributed under the terms of the GPL-3.0 license.
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface BuySellAccurateSignalsInputs {
  /** ATR period (also the highest / lowest window) */
  length: number;
  /** ATR multiplier */
  mult: number;
  /** Use the close for the highest / lowest (else high / low) */
  useClose: boolean;
  showLabels: boolean;
  /** Fill between ohlc4 and the stop of the current direction */
  highlightState: boolean;
  /** Alert conditions only on confirmed bars */
  awaitBarConfirmation: boolean;
}

export const defaultInputs: BuySellAccurateSignalsInputs = {
  length: 22,
  mult: 3.0,
  useClose: true,
  showLabels: true,
  highlightState: true,
  awaitBarConfirmation: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'ATR Period', defval: 22, group: 'Calculation' },
  { id: 'mult', type: 'float', title: 'ATR Multiplier', defval: 3.0, step: 0.1, group: 'Calculation' },
  { id: 'useClose', type: 'bool', title: 'Use Close Price for Extremums', defval: true, group: 'Calculation' },
  { id: 'showLabels', type: 'bool', title: 'Show Buy/Sell Labels', defval: true, group: 'Visuals' },
  { id: 'highlightState', type: 'bool', title: 'Highlight State', defval: true, group: 'Visuals' },
  { id: 'awaitBarConfirmation', type: 'bool', title: 'Await Bar Confirmation', defval: true, group: 'Alerts' },
];

const LONG = color.green;
const SHORT = color.red;
const LONG_FILL = String(color.new(color.green, 85));
const SHORT_FILL = String(color.new(color.red, 85));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Long Stop', color: LONG, lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Short Stop', color: SHORT, lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'Mid Price', color: '#2962FF', lineWidth: 1, display: 'none' },
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
  inputs: Partial<BuySellAccurateSignalsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  const atr = A(ta.atr(bars, cfg.length)).map((v) => cfg.mult * v);
  const hi = A(ta.highest(S(cfg.useClose ? close : bars.map((b) => b.high)), cfg.length));
  const lo = A(ta.lowest(S(cfg.useClose ? close : bars.map((b) => b.low)), cfg.length));

  const longStop: number[] = new Array(n);
  const shortStop: number[] = new Array(n);
  const dir: number[] = new Array(n);
  let d = 1; // var int dir = 1
  for (let i = 0; i < n; i++) {
    const prevClose = i > 0 ? close[i - 1] : NaN;
    let ls = hi[i] - atr[i];
    // longStopPrev = nz(longStop[1], longStop)
    const lsPrev = i > 0 && !isNaN(longStop[i - 1]) ? longStop[i - 1] : ls;
    if (gt(prevClose, lsPrev)) ls = Math.max(ls, lsPrev);
    let ss = lo[i] + atr[i];
    const ssPrev = i > 0 && !isNaN(shortStop[i - 1]) ? shortStop[i - 1] : ss;
    if (lt(prevClose, ssPrev)) ss = Math.min(ss, ssPrev);
    longStop[i] = ls;
    shortStop[i] = ss;
    // dir := close > shortStopPrev ? 1 : close < longStopPrev ? -1 : dir
    d = gt(close[i], ssPrev) ? 1 : lt(close[i], lsPrev) ? -1 : d;
    dir[i] = d;
  }

  const markers: MarkerData[] = [];
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const plot2: { time: number; value: number }[] = [];
  const longFill: string[] = new Array(n);
  const shortFill: string[] = new Array(n);
  // await = awaitBarConfirmation ? barstate.isconfirmed : true (only a last bar can be open)
  const lastOpen = !lastBarConfirmedOf(chart);
  const flagChange: boolean[] = new Array(n);
  const flagBuy: boolean[] = new Array(n);
  const flagSell: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const b = bars[i];
    const prevDir = i > 0 ? dir[i - 1] : NaN;
    const buySignal = dir[i] === 1 && prevDir === -1;
    const sellSignal = dir[i] === -1 && prevDir === 1;
    const awaitOk = cfg.awaitBarConfirmation ? !(lastOpen && i === n - 1) : true;
    // alertcondition(dir != dir[1] and await) / (buySignal and await) / (sellSignal and await); dir[1] na: false
    flagChange[i] = i > 0 && dir[i] !== prevDir && awaitOk;
    flagBuy[i] = buySignal && awaitOk;
    flagSell[i] = sellSignal && awaitOk;
    plot0.push({ time: t, value: dir[i] === 1 ? longStop[i] : NaN, color: LONG });
    plot1.push({ time: t, value: dir[i] === 1 ? NaN : shortStop[i], color: SHORT });
    // midPricePlot = plot(ohlc4, display = display.none)
    plot2.push({ time: t, value: (b.open + b.high + b.low + b.close) / 4 });
    longFill[i] = cfg.highlightState && dir[i] === 1 ? LONG_FILL : 'transparent';
    shortFill[i] = cfg.highlightState && dir[i] === -1 ? SHORT_FILL : 'transparent';
    if (buySignal && !isNaN(longStop[i])) {
      // plotshape(buySignal ? longStop : na, 'Long Stop Start', location.absolute, shape.circle, size.tiny)
      markers.push({ id: 'shape0', time: t, position: 'atPriceMiddle', price: longStop[i], shape: 'circle', color: LONG, size: 'tiny' });
      // plotshape(buySignal and showLabels ? longStop : na, 'Buy Label', text = 'Buy', shape.labelup, size.tiny)
      if (cfg.showLabels) {
        markers.push({ id: 'shape1', time: t, position: 'atPriceBottom', price: longStop[i], shape: 'labelUp', color: LONG,
          text: 'Buy', textColor: color.white, size: 'tiny' });
      }
    }
    if (sellSignal && !isNaN(shortStop[i])) {
      // plotshape(sellSignal ? shortStop : na, 'Short Stop Start', ...) / plotshape(..., 'Sell Label', text = 'Sell')
      markers.push({ id: 'shape2', time: t, position: 'atPriceMiddle', price: shortStop[i], shape: 'circle', color: SHORT, size: 'tiny' });
      if (cfg.showLabels) {
        markers.push({ id: 'shape3', time: t, position: 'atPriceTop', price: shortStop[i], shape: 'labelDown', color: SHORT,
          text: 'Sell', textColor: color.white, size: 'tiny' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [
      // fill(midPricePlot, longStopPlot, 'Long State Filling', highlightState and dir == 1 ? green 85 : na)
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'Long State Filling' }, colors: longFill },
      // fill(midPricePlot, shortStopPlot, 'Short State Filling', highlightState and dir == -1 ? red 85 : na)
      { plot1: 'plot2', plot2: 'plot1', options: { title: 'Short State Filling' }, colors: shortFill },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [flagChange, flagBuy, flagSell]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'CE Direction Change', message: 'Chandelier Exit has changed direction, {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'CE Buy', message: 'Chandelier Exit Buy, {{exchange}}:{{ticker}}' },
  { id: 'alert2', title: 'CE Sell', message: 'Chandelier Exit Sell, {{exchange}}:{{ticker}}' },
];

export const BuySellAccurateSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
