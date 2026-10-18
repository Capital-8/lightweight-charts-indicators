/**
 * Edward Smart Channel Reversal
 *
 * A Donchian channel (highest high / lowest low over `channelLength` bars, with its middle), filled in light blue,
 * and an EMA trend line. BUY: the low touches the lower channel, the bar is green, the close is back above the lower
 * channel, the RSI is below 40 and the close is above the EMA. SELL: the high touches the upper channel, the bar is
 * red, the close is back below the upper channel, the RSI is above 60 and the close is below the EMA.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' / 'Sell Alert', true on the BUY / SELL bars.
 *
 * Reference: "Edward Smart Channel Reversal" by Jos-ProTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Jos-ProTrader
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EdwardSmartChannelReversalInputs {
  /** Channel length (highest high / lowest low) */
  channelLength: number;
  /** Trend EMA length */
  emaLength: number;
  /** RSI length */
  rsiLength: number;
}

export const defaultInputs: EdwardSmartChannelReversalInputs = {
  channelLength: 20,
  emaLength: 100,
  rsiLength: 14,
};

export const inputConfig: InputConfig[] = [
  { id: 'channelLength', type: 'int', title: 'Channel Length', defval: 20, min: 5 },
  { id: 'emaLength', type: 'int', title: 'Trend EMA', defval: 100 },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Channel', color: color.red, lineWidth: 2 },
  { id: 'plot1', title: 'Lower Channel', color: color.green, lineWidth: 2 },
  { id: 'plot2', title: 'Middle Channel', color: color.orange, lineWidth: 1 },
  { id: 'plot3', title: 'EMA', color: color.yellow, lineWidth: 2 },
];

export const metadata = {
  title: 'Edward Smart Channel Reversal',
  shortTitle: 'Edward Smart Channel Reversal',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Pine plotshape default text colour */
const PINE_TEXT = '#2962FF';

export function calculate(
  bars: Bar[],
  inputs: Partial<EdwardSmartChannelReversalInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const upper = A(ta.highest(S(bars.map((b) => b.high)), cfg.channelLength));
  const lower = A(ta.lowest(S(bars.map((b) => b.low)), cfg.channelLength));
  const close = S(bars.map((b) => b.close));
  const ema = A(ta.ema(close, cfg.emaLength));
  const rsi = A(ta.rsi(close, cfg.rsiLength));

  const plots: Record<string, { time: number; value: number; color: string }[]> = {
    plot0: [], plot1: [], plot2: [], plot3: [],
  };
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    const mid = (upper[i] + lower[i]) / 2;
    plots.plot0.push({ time: t, value: fin(upper[i]), color: color.red });
    plots.plot1.push({ time: t, value: fin(lower[i]), color: color.green });
    plots.plot2.push({ time: t, value: fin(mid), color: color.orange });
    plots.plot3.push({ time: t, value: fin(ema[i]), color: color.yellow });

    const bullReversal = le(b.low, lower[i]) && gt(b.close, b.open) && gt(b.close, lower[i]) && lt(rsi[i], 40);
    const bearReversal = ge(b.high, upper[i]) && lt(b.close, b.open) && lt(b.close, upper[i]) && gt(rsi[i], 60);
    const buySignal = bullReversal && gt(b.close, ema[i]);
    const sellSignal = bearReversal && lt(b.close, ema[i]);
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    // plotshape(buySignal, 'BUY', shape.labelup, location.belowbar, color.lime, text = 'BUY')
    if (buySignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.lime, text: 'BUY', textColor: PINE_TEXT, size: 'auto' });
    }
    // plotshape(sellSignal, 'SELL', shape.labeldown, location.abovebar, color.red, text = 'SELL')
    if (sellSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL', textColor: PINE_TEXT, size: 'auto' });
    }
  }

  // fill(upperPlot, lowerPlot, color = color.new(color.blue, 92))
  const fillColor = String(color.new(color.blue, 92));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' }, colors: new Array<string>(n).fill(fillColor) }],
    markers,
    // alertcondition(buySignal, "Buy Alert") / alertcondition(sellSignal, "Sell Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'Edward Smart Channel Reversal BUY' },
  { id: 'alert1', title: 'Sell Alert', message: 'Edward Smart Channel Reversal SELL' },
];

export const EdwardSmartChannelReversal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
