/**
 * Lumina Trend Channels
 *
 * The baseline is the EMA of the close; four bands sit at baseline +- ATR * outer / inner multiplier (EMA and ATR
 * with the same length). The trend is up when the baseline rose over the last 2 bars, down when it fell, else
 * unchanged. Bands, baseline and the layered fills take the trend colour; a circle marks the baseline on a trend
 * change. Buy: the close crosses above the baseline in an uptrend; sell: the close crosses below it in a downtrend.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal', 'Sell Signal' and 'Trend Change' (the trend flips).
 *
 * Reference: "Lumina Trend Channels [Pineify]" by Pineify
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Pineify
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LuminaTrendChannelsInputs {
  /** Length of the EMA baseline and of the ATR */
  length: number;
  /** Outer band multiplier (ATR) */
  multOuter: number;
  /** Inner band multiplier (ATR) */
  multInner: number;
  bullColor: string;
  bearColor: string;
}

export const defaultInputs: LuminaTrendChannelsInputs = {
  length: 21,
  multOuter: 2.0,
  multInner: 1.0,
  bullColor: '#00E676',
  bearColor: '#FF5252',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Channel Length', defval: 21, min: 5, group: 'Calculation' },
  { id: 'multOuter', type: 'float', title: 'Outer Band Multiplier', defval: 2.0, step: 0.1, group: 'Calculation' },
  { id: 'multInner', type: 'float', title: 'Inner Band Multiplier', defval: 1.0, step: 0.1, group: 'Calculation' },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00E676', group: 'Style' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#FF5252', group: 'Style' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Outer', color: String(color.new('#00E676', 50)), lineWidth: 1 },
  { id: 'plot1', title: 'Upper Inner', color: String(color.new('#00E676', 70)), lineWidth: 1 },
  { id: 'plot2', title: 'Baseline', color: '#00E676', lineWidth: 2 },
  { id: 'plot3', title: 'Lower Inner', color: String(color.new('#00E676', 70)), lineWidth: 1 },
  { id: 'plot4', title: 'Lower Outer', color: String(color.new('#00E676', 50)), lineWidth: 1 },
  { id: 'plot5', title: 'Trend Change', color: '#00E676', lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: 'Lumina Trend Channels [Pineify]',
  shortTitle: 'Lumina Channels [Pineify]',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<LuminaTrendChannelsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const basis = A(ta.ema(close, cfg.length));
  const atr = A(ta.atr(bars, cfg.length));
  const basisS = Series.fromArray(bars, basis);
  const rising = ta.rising(basisS, 2).toArray();
  const falling = ta.falling(basisS, 2).toArray();

  type Point = { time: number; value: number; color: string };
  const plots: Record<string, Point[]> = { plot0: [], plot1: [], plot2: [], plot3: [], plot4: [], plot5: [] };
  const fillCols: string[][] = [[], [], [], []];
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [], changeFlags: boolean[] = [];
  let trend = 1; // var int trend = 1
  let lastClose = NaN; // ta.crossover / crossunder: the last bar where both values were not na
  let lastBasis = NaN;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const prevTrend = trend;
    trend = rising[i] ? 1 : falling[i] ? -1 : trend;
    const css = trend === 1 ? cfg.bullColor : cfg.bearColor;
    const c50 = String(color.new(css, 50));
    const c70 = String(color.new(css, 70));
    const c85 = String(color.new(css, 85));
    const bs = basis[i];
    plots.plot0.push({ time: b.time, value: bs + atr[i] * cfg.multOuter, color: c50 });
    plots.plot1.push({ time: b.time, value: bs + atr[i] * cfg.multInner, color: c70 });
    plots.plot2.push({ time: b.time, value: bs, color: css });
    plots.plot3.push({ time: b.time, value: bs - atr[i] * cfg.multInner, color: c70 });
    plots.plot4.push({ time: b.time, value: bs - atr[i] * cfg.multOuter, color: c50 });
    fillCols[0].push(c85);
    fillCols[1].push(c70);
    fillCols[2].push(c70);
    fillCols[3].push(c85);
    // plot(ta.change(trend) != 0 ? basis : na): ta.change is na on the first bar
    const changed = i > 0 && trend !== prevTrend;
    plots.plot5.push({ time: b.time, value: changed ? bs : NaN, color: css });
    changeFlags.push(changed);

    let crossUp = false;
    let crossDown = false;
    if (!isNaN(b.close) && !isNaN(bs)) {
      if (!isNaN(lastClose)) {
        // exact comparisons (no 1e-10 tolerance): close > basis and close[1] <= basis[1]
        crossUp = b.close > bs && lastClose <= lastBasis;
        crossDown = b.close < bs && lastClose >= lastBasis;
      }
      lastClose = b.close;
      lastBasis = bs;
    }
    // plotshape(buySignal, "Buy Signal", shape.triangleup, location.belowbar, color = bullCss, size = size.small)
    buyFlags.push(crossUp && trend === 1);
    sellFlags.push(crossDown && trend === -1);
    if (crossUp && trend === 1) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: cfg.bullColor, size: 'small' });
    }
    // plotshape(sellSignal, "Sell Signal", shape.triangledown, location.abovebar, color = bearCss, size = size.small)
    if (crossDown && trend === -1) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: cfg.bearColor, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Outer Upper Fill' }, colors: fillCols[0] },
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Inner Upper Fill' }, colors: fillCols[1] },
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Inner Lower Fill' }, colors: fillCols[2] },
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Outer Lower Fill' }, colors: fillCols[3] },
    ],
    markers,
    // alertcondition(buySignal, ...) / alertcondition(sellSignal, ...) / alertcondition(ta.change(trend) != 0, ...)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, changeFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Lumina Channels: Bullish Entry Detected' },
  { id: 'alert1', title: 'Sell Signal', message: 'Lumina Channels: Bearish Entry Detected' },
  { id: 'alert2', title: 'Trend Change', message: 'Lumina Channels: Channel Trend Changed Color' },
];

export const LuminaTrendChannels = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
