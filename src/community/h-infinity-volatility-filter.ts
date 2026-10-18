/**
 * H-Infinity Volatility Filter
 *
 * An H-infinity style filter of the source. Each of the `order` states starts at the first source value with an
 * error of 1. On every bar: error += noise; gain = error / (error + disturbance); state += gain * (source - state);
 * error = (1 - gain) * error. The line is the first state. The trend is 1 when the line rises, -1 when it falls and
 * keeps its value when the line is flat; the line and the candles take the bullish / bearish colour of the trend.
 * Alerts (alertcondition, `alerts` of the result): the trend crossing over / under 0 (turning bullish / bearish).
 *
 * Reference: "H-Infinity Volatility Filter [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface HInfinityVolatilityFilterInputs {
  /** Price source of the filter */
  inputSource: SourceType;
  /** Worst-case noise parameter */
  inputNoise: number;
  /** Disturbance parameter */
  inputDisturbance: number;
  /** Number of filter states */
  inputOrder: number;
  upColor: string;
  downColor: string;
  colorCandlesByTrend: boolean;
}

export const defaultInputs: HInfinityVolatilityFilterInputs = {
  inputSource: 'close',
  inputNoise: 0.02,
  inputDisturbance: 3.0,
  inputOrder: 5,
  upColor: '#00ffaa',
  downColor: '#ff0000',
  colorCandlesByTrend: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'inputSource', type: 'source', title: 'Source', defval: 'close' },
  { id: 'inputNoise', type: 'float', title: 'Worst-Case Noise', defval: 0.02, step: 0.01 },
  { id: 'inputDisturbance', type: 'float', title: 'Disturbance', defval: 3.0 },
  { id: 'inputOrder', type: 'int', title: 'Order', defval: 5, min: 1 },
  { id: 'upColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa' },
  { id: 'downColor', type: 'color', title: 'Bearish Color', defval: '#ff0000' },
  { id: 'colorCandlesByTrend', type: 'bool', title: 'Color Candles by Trend?', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'H∞ Filter', color: '#00ffaa', lineWidth: 3 },
];

export const metadata = {
  title: 'H-Infinity Volatility Filter [QuantAlgo]',
  shortTitle: 'H∞ Volatility Filter [QuantAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<HInfinityVolatilityFilterInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const order = cfg.inputOrder;
  const src = getSourceSeries(bars, cfg.inputSource).toArray().map((v) => v ?? NaN);

  // var float[] state = array.new_float(inputOrder, na); var float[] error = array.new_float(inputOrder, 100.0)
  const state: number[] = new Array(order).fill(NaN);
  const error: number[] = new Array(order).fill(100.0);
  const filtered: number[] = new Array(n);
  const trend: number[] = new Array(n);
  let trendVar = NaN; // var int trend = na (in detectTrend)
  let barColor: string | null = null; // var color barColor = na
  const plot0: { time: number; value: number; color: string }[] = [];
  const barColors: BarColorData[] = [];

  for (let i = 0; i < n; i++) {
    const price = src[i];
    // initializeState(price): when state[0] is na, every state = price and every error = 1.0
    if (isNaN(state[0])) {
      for (let k = 0; k < order; k++) {
        state[k] = price;
        error[k] = 1.0;
      }
    }
    // applyHInfinity(price)
    const newState = state.slice();
    const newError = error.map((e) => e + cfg.inputNoise);
    for (let k = 0; k < order; k++) {
      const gain = newError[k] / (newError[k] + cfg.inputDisturbance);
      state[k] = newState[k] + gain * (price - newState[k]);
      error[k] = (1 - gain) * newError[k];
    }
    filtered[i] = state[0];

    // detectTrend(filteredPrice)
    const prev = i > 0 ? filtered[i - 1] : NaN;
    if (gt(filtered[i], prev)) trendVar = 1;
    else if (lt(filtered[i], prev)) trendVar = -1;
    trend[i] = trendVar;

    if (trendVar === 1) barColor = cfg.upColor;
    else if (trendVar === -1) barColor = cfg.downColor;

    // plot(filteredPrice, color = trend == 1 ? upColor : downColor, linewidth = 3)
    plot0.push({ time: bars[i].time, value: filtered[i], color: trendVar === 1 ? cfg.upColor : cfg.downColor });
    // barcolor(colorCandlesByTrend ? barColor : na)
    if (cfg.colorCandlesByTrend && barColor !== null) barColors.push({ time: bars[i].time, color: barColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    barColors,
    // alertcondition(ta.crossover(trend, 0)) / alertcondition(ta.crossunder(trend, 0))
    alerts: alertStates(alertConditions, bars, [crossedOver(trend, 0), crossedUnder(trend, 0)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend', message: 'H∞ Filter: Bullish Trend Detected' },
  { id: 'alert1', title: 'Bearish Trend', message: 'H∞ Filter: Bearish Trend Detected' },
];

export const HInfinityVolatilityFilter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
