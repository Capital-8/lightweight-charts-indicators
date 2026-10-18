/**
 * Trading Gaul (Chandelier Exit)
 *
 * ATR stops: the long stop is the highest close (or high) of `length` bars minus mult * ATR, the short stop is the
 * lowest close (or low) plus mult * ATR. The long stop only moves up (and the short stop only moves down) while the
 * previous close stays beyond the previous stop. The direction turns long when the close goes above the previous
 * short stop and short when it goes below the previous long stop. The stop of the current direction is drawn, with a
 * circle and a Buy / Sell label when the direction changes, and a fill between the stop and ohlc4.
 * Alerts (alertcondition, `alerts` of the result): 'CE Direction Change', 'CE Buy' and 'CE Sell'. With "Await Bar
 * Confirmation" they are true on confirmed bars only (`barstate.isconfirmed`: the last bar only when the chart context
 * says it is closed, `lastBarConfirmed`; true without a context).
 *
 * Reference: "Chandelier Exit" by investment20223
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (c) 2019-present, Alex Orekhov (everget). Chandelier Exit script may be freely
 * distributed under the terms of the GPL-3.0 license.
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface TradingGaulInputs {
  /** ATR period (also the length of the highest / lowest) */
  length: number;
  /** ATR multiplier */
  mult: number;
  /** Use the close for the highest / lowest (else high / low) */
  useClose: boolean;
  /** Show the Buy / Sell labels */
  showLabels: boolean;
  /** Fill between ohlc4 and the stop of the current direction */
  highlightState: boolean;
  /** Await bar confirmation (alerts only: the conditions are true on confirmed bars only) */
  awaitBarConfirmation: boolean;
}

export const defaultInputs: TradingGaulInputs = {
  length: 22,
  mult: 3.0,
  useClose: true,
  showLabels: true,
  highlightState: true,
  awaitBarConfirmation: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'ATR Period', defval: 22 },
  { id: 'mult', type: 'float', title: 'ATR Multiplier', defval: 3.0, step: 0.1 },
  { id: 'useClose', type: 'bool', title: 'Use Close Price for Extremums', defval: true },
  { id: 'showLabels', type: 'bool', title: 'Show Buy/Sell Labels', defval: true },
  { id: 'highlightState', type: 'bool', title: 'Highlight State', defval: true },
  { id: 'awaitBarConfirmation', type: 'bool', title: 'Await Bar Confirmation', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Long Stop', color: color.green, lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Short Stop', color: color.red, lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'Mid Price', color: color.blue, lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Chandelier Exit',
  shortTitle: 'TraderGauls',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TradingGaulInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // atr = mult * ta.atr(length)
  const atr = A(ta.atr(bars, cfg.length)).map((v) => cfg.mult * v);
  // ta.highest(close, length) / ta.highest(length) (high); ta.lowest likewise
  const hi = A(ta.highest(S(bars.map((b) => (cfg.useClose ? b.close : b.high))), cfg.length));
  const lo = A(ta.lowest(S(bars.map((b) => (cfg.useClose ? b.close : b.low))), cfg.length));

  const longStop: number[] = new Array(n);
  const shortStop: number[] = new Array(n);
  const dir: number[] = new Array(n);
  let d = 1; // var int dir = 1
  for (let i = 0; i < n; i++) {
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    let ls = hi[i] - atr[i];
    // longStopPrev = nz(longStop[1], longStop)
    const lsPrev = i > 0 && !isNaN(longStop[i - 1]) ? longStop[i - 1] : ls;
    if (gt(prevClose, lsPrev)) ls = Math.max(ls, lsPrev);
    let ss = lo[i] + atr[i];
    const ssPrev = i > 0 && !isNaN(shortStop[i - 1]) ? shortStop[i - 1] : ss;
    if (lt(prevClose, ssPrev)) ss = Math.min(ss, ssPrev);
    // dir := close > shortStopPrev ? 1 : close < longStopPrev ? -1 : dir
    d = gt(bars[i].close, ssPrev) ? 1 : lt(bars[i].close, lsPrev) ? -1 : d;
    longStop[i] = ls;
    shortStop[i] = ss;
    dir[i] = d;
  }

  const longFill = String(color.new(color.green, 85));
  const shortFill = String(color.new(color.red, 85));
  const plot0: { time: number; value: number }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const plot2: { time: number; value: number }[] = [];
  const longColors: string[] = [];
  const shortColors: string[] = [];
  const markers: MarkerData[] = [];
  const lastConfirmed = lastBarConfirmedOf(chart);
  const changeFlags: boolean[] = [], buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const b = bars[i];
    plot0.push({ time: t, value: dir[i] === 1 ? longStop[i] : NaN });
    plot1.push({ time: t, value: dir[i] === 1 ? NaN : shortStop[i] });
    plot2.push({ time: t, value: (b.open + b.high + b.low + b.close) / 4 });
    longColors.push(cfg.highlightState && dir[i] === 1 ? longFill : 'transparent');
    shortColors.push(cfg.highlightState && dir[i] === -1 ? shortFill : 'transparent');

    // buySignal = dir == 1 and dir[1] == -1 (dir[1] is na on the first bar)
    const buySignal = i > 0 && dir[i] === 1 && dir[i - 1] === -1;
    const sellSignal = i > 0 && dir[i] === -1 && dir[i - 1] === 1;
    // await = awaitBarConfirmation ? barstate.isconfirmed : true
    const awaitOk = !cfg.awaitBarConfirmation || i < n - 1 || lastConfirmed;
    // alertcondition(dir != dir[1] and await) / (buySignal and await) / (sellSignal and await)
    changeFlags.push(i > 0 && dir[i] !== dir[i - 1] && awaitOk);
    buyFlags.push(buySignal && awaitOk);
    sellFlags.push(sellSignal && awaitOk);
    if (buySignal && !isNaN(longStop[i])) {
      // plotshape(buySignal ? longStop : na, location.absolute, shape.circle, size.tiny)
      markers.push({ time: t, position: 'atPriceMiddle', price: longStop[i], shape: 'circle', color: color.green, size: 'tiny', id: 'shape0' });
      // plotshape(buySignal and showLabels ? longStop : na, text = 'Buy', shape.labelup, textcolor = white)
      if (cfg.showLabels) {
        markers.push({ time: t, position: 'atPriceBottom', price: longStop[i], shape: 'labelUp', color: color.green,
          size: 'tiny', text: 'Buy', textColor: color.white, id: 'shape1' });
      }
    }
    if (sellSignal && !isNaN(shortStop[i])) {
      markers.push({ time: t, position: 'atPriceMiddle', price: shortStop[i], shape: 'circle', color: color.red, size: 'tiny', id: 'shape2' });
      if (cfg.showLabels) {
        markers.push({ time: t, position: 'atPriceTop', price: shortStop[i], shape: 'labelDown', color: color.red,
          size: 'tiny', text: 'Sell', textColor: color.white, id: 'shape3' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'Long State Filling' }, colors: longColors },
      { plot1: 'plot2', plot2: 'plot1', options: { title: 'Short State Filling' }, colors: shortColors },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [changeFlags, buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'CE Direction Change', message: 'Chandelier Exit has changed direction, {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'CE Buy', message: 'Chandelier Exit Buy, {{exchange}}:{{ticker}}' },
  { id: 'alert2', title: 'CE Sell', message: 'Chandelier Exit Sell, {{exchange}}:{{ticker}}' },
];

export const TradingGaul = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
