/**
 * Vulkan Profit
 *
 * Two short WMAs (3, 8) and two longer EMAs (18, 28) of the close. Bullish when both WMAs are above both EMAs,
 * bearish when both are below. A buy (sell) triangle marks the first bar of a bullish (bearish) state. A signal line
 * under the lows (low - ATR(14) * offset) is green in the bullish state, red in the bearish state and grey before the
 * first state.
 * Alerts (alertcondition, `alerts` of the result): 'Vulkan Profit Buy Signal' and 'Vulkan Profit Sell Signal', true on
 * the bars of a buy / sell signal (whether or not the triangles are shown).
 *
 * Reference: "Vulkan Profit" by AlgoCollective
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoCollective
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VulkanProfitInputs {
  fastWmaPeriod: number;
  mediumWmaPeriod: number;
  fastEmaPeriod: number;
  slowEmaPeriod: number;
  showMas: boolean;
  showSignals: boolean;
  showColoredLine: boolean;
  /** Width of the signal line (the plot width stays 2) */
  lineWidth: number;
  /** Distance of the signal line under the low, in ATR units */
  lineOffset: number;
}

export const defaultInputs: VulkanProfitInputs = {
  fastWmaPeriod: 3,
  mediumWmaPeriod: 8,
  fastEmaPeriod: 18,
  slowEmaPeriod: 28,
  showMas: true,
  showSignals: true,
  showColoredLine: true,
  lineWidth: 2,
  lineOffset: 0.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastWmaPeriod', type: 'int', title: 'Fast WMA Period', defval: 3, min: 1, max: 50 },
  { id: 'mediumWmaPeriod', type: 'int', title: 'Medium WMA Period', defval: 8, min: 1, max: 50 },
  { id: 'fastEmaPeriod', type: 'int', title: 'Fast EMA Period', defval: 18, min: 1, max: 100 },
  { id: 'slowEmaPeriod', type: 'int', title: 'Slow EMA Period', defval: 28, min: 1, max: 100 },
  { id: 'showMas', type: 'bool', title: 'Show Moving Averages', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Buy/Sell Signals', defval: true },
  { id: 'showColoredLine', type: 'bool', title: 'Show Colored Line', defval: true },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 2, min: 1, max: 5 },
  { id: 'lineOffset', type: 'float', title: 'Line Offset (% of ATR)', defval: 0.5, min: 0.1, max: 3.0, step: 0.1 },
];

const BULL = '#00C176';
const BEAR = '#FF6B6B';
const NEUTRAL = '#B2B5BE';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Signal Line', color: BULL, lineWidth: 2 },
  { id: 'plot1', title: 'Fast WMA (3)', color: '#1E88E5', lineWidth: 1 },
  { id: 'plot2', title: 'Medium WMA (8)', color: '#42A5F5', lineWidth: 1 },
  { id: 'plot3', title: 'Fast EMA (18)', color: '#FFA726', lineWidth: 1 },
  { id: 'plot4', title: 'Slow EMA (28)', color: '#FF7043', lineWidth: 2 },
];

export const metadata = {
  title: 'Vulkan Profit',
  shortTitle: 'Vulkan Profit',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VulkanProfitInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const fastWma = A(ta.wma(close, cfg.fastWmaPeriod));
  const mediumWma = A(ta.wma(close, cfg.mediumWmaPeriod));
  const fastEma = A(ta.ema(close, cfg.fastEmaPeriod));
  const slowEma = A(ta.ema(close, cfg.slowEmaPeriod));
  const atr = A(ta.atr(bars, 14));

  const bullColor = String(color.new(BULL, 0));
  const bearColor = String(color.new(BEAR, 0));
  const neutralColor = String(color.new(NEUTRAL, 0));

  const signalLine: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  let prevBullish = false;
  let prevBearish = false;
  let signalState = 0;
  for (let i = 0; i < n; i++) {
    // math.min / math.max give na when an argument is na
    const minShort = Math.min(fastWma[i], mediumWma[i]);
    const maxShort = Math.max(fastWma[i], mediumWma[i]);
    const minLong = Math.min(fastEma[i], slowEma[i]);
    const maxLong = Math.max(fastEma[i], slowEma[i]);
    const bullish = gt(minShort, maxLong);
    const bearish = gt(minLong, maxShort);
    const buy = bullish && !prevBullish;
    const sell = bearish && !prevBearish;
    prevBullish = bullish;
    prevBearish = bearish;
    buyFlags.push(buy);
    sellFlags.push(sell);
    if (buy) signalState = 1;
    else if (sell) signalState = -1;
    else if (bullish && signalState !== 1) signalState = 1;
    else if (bearish && signalState !== -1) signalState = -1;

    const c = signalState === 1 ? bullColor : signalState === -1 ? bearColor : neutralColor;
    const pos = bars[i].low - atr[i] * cfg.lineOffset;
    signalLine.push({ time: bars[i].time, value: cfg.showColoredLine ? pos : NaN, color: c });

    if (cfg.showSignals && buy) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: bullColor, size: 'normal' });
    }
    if (cfg.showSignals && sell) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: bearColor, size: 'normal' });
    }
  }

  const ma = (arr: number[], c: string) => arr.map((v, i) => ({ time: bars[i].time, value: cfg.showMas ? v : NaN, color: c }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: signalLine,
      plot1: ma(fastWma, String(color.new('#1E88E5', 0))),
      plot2: ma(mediumWma, String(color.new('#42A5F5', 0))),
      plot3: ma(fastEma, String(color.new('#FFA726', 0))),
      plot4: ma(slowEma, String(color.new('#FF7043', 0))),
    },
    markers,
    // alertcondition(buy_signal, ...) / alertcondition(sell_signal, ...)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Vulkan Profit Buy Signal', message: 'Vulkan Profit: BUY Signal' },
  { id: 'alert1', title: 'Vulkan Profit Sell Signal', message: 'Vulkan Profit: SELL Signal' },
];

export const VulkanProfit = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
