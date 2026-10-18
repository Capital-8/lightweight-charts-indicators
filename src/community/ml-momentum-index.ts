/**
 * Machine Learning Momentum Index (MLMI) [Zeiierman]
 *
 * Two momentum features: rsi_slow = WMA(RSI(close, 20), Trend Length) and rsi_quick = WMA(RSI(close, 5), Trend
 * Length). On each cross of WMA(close, 5) with WMA(close, 20) the features and the close are stored with the result
 * of the move since the previous stored trade (+1 when the close is >= the previous stored close, else -1; the
 * stores start with one point (0, 0) of result 0). The prediction on each bar is the k-nearest-neighbours vote: the
 * sum of the results of the stored points whose distance to the current features is within the k-th smallest
 * distance. Plotted with its WMA (20). A channel from the highest / lowest prediction over 2000 bars gives gradient
 * fills from zero to the channel and overbought / oversold gradient fills of the prediction (edges at the channel
 * minus / plus EMA(20) of the 20-bar standard deviation of the prediction).
 *
 * Alerts (alertcondition, `alerts` of the result): the prediction crossing over / under the overbought edge, the
 * oversold edge, zero and its WMA.
 *
 * Reference: "Machine Learning Momentum Index (MLMI) [Zeiierman]" by Zeiierman
 * Licence: Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0), as the original Pine script
 * (https://creativecommons.org/licenses/by-nc-sa/4.0/).
 * Original notice: © Zeiierman
 */

import { ta, taCore, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type FillData } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MlMomentumIndexInputs {
  /** Prediction Data (k): number of neighbours */
  k: number;
  /** Trend Length: WMA length of the two RSIs */
  momentumWindow: number;
}

export const defaultInputs: MlMomentumIndexInputs = {
  k: 200,
  momentumWindow: 20,
};

const T1 = 'This parameter controls the number of neighbors to consider while making a prediction using the k-Nearest Neighbors (k-NN) algorithm. By modifying the value of k, you can change how sensitive the prediction is to local fluctuations in the data. \n\nA smaller value of k will make the prediction more sensitive to local variations and can lead to a more erratic prediction line. \n\nA larger value of k will consider more neighbors, thus making the prediction more stable but potentially less responsive to sudden changes.';
const T2 = 'The parameter controls the length of the trend used in computing the momentum. This length refers to the number of periods over which the momentum is calculated, affecting how quickly the indicator reacts to changes in the underlying price movements. \n\nA shorter trend length (smaller momentumWindow) will make the indicator more responsive to short-term price changes, potentially generating more signals but at the risk of more false alarms. \n\nA longer trend length (larger momentumWindow) will make the indicator smoother and less responsive to short-term noise, but it may lag in reacting to significant price changes.';

export const inputConfig: InputConfig[] = [
  { id: 'k', type: 'int', title: 'Prediction Data (k)', defval: 200, tooltip: T1 },
  { id: 'momentumWindow', type: 'int', title: 'Trend Length', defval: 20, min: 10, max: 200, step: 2, tooltip: T2 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MLMI Prediction', color: '#426eff', lineWidth: 1 },
  { id: 'plot1', title: 'WMA of MLMI Prediction', color: '#31ffc8', lineWidth: 1 },
  // channel_upper / channel_lower / channel_mid: plot(..., color = na, editable = false, display = display.none)
  { id: 'plot2', title: 'Plot', color: 'transparent', lineWidth: 1, editable: false, display: 'none' },
  { id: 'plot3', title: 'Plot', color: 'transparent', lineWidth: 1, editable: false, display: 'none' },
  { id: 'plot4', title: 'Plot', color: 'transparent', lineWidth: 1, editable: false, display: 'none' },
];

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'MLMI Crossover OB', message: 'MLMI Crossover OB' },
  { id: 'alert1', title: 'MLMI Crossunder OB', message: 'MLMI Crossunder OB' },
  { id: 'alert2', title: 'MLMI Crossover OS', message: 'MLMI Crossover OS' },
  { id: 'alert3', title: 'MLMI Crossunder OS', message: 'MLMI Crossunder OS' },
  { id: 'alert4', title: 'MLMI Crossover 50', message: 'MLMI Crossover 50' },
  { id: 'alert5', title: 'MLMI Crossunder 50', message: 'MLMI Crossunder 50' },
  { id: 'alert6', title: 'MLMI Crossover Ma', message: 'MLMI Crossover Ma' },
  { id: 'alert7', title: 'MLMI Crossunder Ma', message: 'MLMI Crossunder Ma' },
];

export const metadata = {
  title: 'Machine Learning Momentum Index (MLMI) [Zeiierman]',
  shortTitle: 'Machine Learning Momentum Index (MLMI)',
  overlay: false,
};

/** Pine float comparisons (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<MlMomentumIndexInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));
  const t = (i: number) => bars[i].time;

  // Moving averages & RSI
  const maQuick = A(ta.wma(close, 5));
  const maSlow = A(ta.wma(close, 20));
  const rsiQuick = A(ta.wma(ta.rsi(close, 5), cfg.momentumWindow));
  const rsiSlow = A(ta.wma(ta.rsi(close, 20), cfg.momentumWindow));
  const pos = taCore.crossover(maQuick, maSlow);
  const neg = taCore.crossunder(maQuick, maSlow);

  // var data = Data.new(array.new_float(1, 0) x 4)
  const p1s: number[] = [0];
  const p2s: number[] = [0];
  const prices: number[] = [0];
  const results: number[] = [0];
  const k = Math.max(0, Math.trunc(cfg.k));
  const prediction: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    // if pos or neg: data.storePreviousTrade(rsi_slow, rsi_quick)
    if (pos[i] || neg[i]) {
      const last = p1s.length - 1;
      p1s.push(p1s[last]);
      p2s.push(p2s[last]);
      prices.push(prices[last]);
      results.push(ge(c, prices[last]) ? 1 : -1);
      p1s[last + 1] = rsiSlow[i];
      p2s[last + 1] = rsiQuick[i];
      prices[last + 1] = c;
    }
    // knnPredict(rsi_slow, rsi_quick, k): distances to all the stored points; maxDist = the greatest of the k smallest
    // (na sorted after the numbers, array.max skips na); the results of the points within maxDist are summed
    const p1 = rsiSlow[i];
    const p2 = rsiQuick[i];
    const distances = p1s.map((v, j) => Math.sqrt(Math.pow(p1 - v, 2) + Math.pow(p2 - p2s[j], 2)));
    const sorted = distances.filter((d) => !isNaN(d)).sort((a, b) => a - b);
    const m = Math.min(k, distances.length, sorted.length);
    const maxDist = m > 0 ? sorted[m - 1] : NaN;
    let sum = 0;
    let count = 0;
    for (let j = 0; j < distances.length; j++) {
      if (le(distances[j], maxDist)) {
        sum += results[j];
        count++;
      }
    }
    // neighbors.sum(): na for no neighbour
    prediction[i] = count ? sum : NaN;
  }

  const predSeries = S(prediction);
  const predictionMa = A(ta.wma(predSeries, 20));

  // Gradient fill channel
  const upper = A(ta.highest(predSeries, 2000));
  const lower = A(ta.lowest(predSeries, 2000));
  const dev = A(ta.ema(ta.stdev(predSeries, 20), 20));
  const upperEdge = upper.map((v, i) => v - dev[i]);
  const lowerEdge = lower.map((v, i) => v + dev[i]);

  const constant = <T>(v: T): T[] => new Array(n).fill(v);
  const lime75 = String(color.new(color.lime, 75));
  const red75 = String(color.new(color.red, 75));
  const fills: FillData[] = [
    // fill(channel_mid, channel_upper, top_value = upper, bottom_value = 0, bottom_color = na, top_color = lime 75)
    { plot1: 'plot4', plot2: 'plot2', options: { title: 'Channel Gradient Fill' },
      gradient: { topValue: upper, bottomValue: constant(0), topColor: constant(lime75), bottomColor: constant(null) } },
    // fill(channel_mid, channel_lower, top_value = 0, bottom_value = lower, bottom_color = red 75, top_color = na)
    { plot1: 'plot4', plot2: 'plot3', options: { title: 'Channel Gradient Fill' },
      gradient: { topValue: constant(0), bottomValue: lower, topColor: constant(null), bottomColor: constant(red75) } },
    // fill(prediction_, channel_mid, upper, upper_, top_color = lime 0, bottom_color = green 100)
    { plot1: 'plot0', plot2: 'plot4', options: { title: 'Overbought Gradient Fill' },
      gradient: { topValue: upper, bottomValue: upperEdge, topColor: constant(String(color.new(color.lime, 0))),
        bottomColor: constant(String(color.new(color.green, 100))) } },
    // fill(prediction_, channel_mid, lower_, lower, top_color = red 100, bottom_color = red 0)
    { plot1: 'plot0', plot2: 'plot4', options: { title: 'Oversold Gradient Fill' },
      gradient: { topValue: lowerEdge, bottomValue: lower, topColor: constant(String(color.new(color.red, 100))),
        bottomColor: constant(String(color.new(color.red, 0))) } },
  ];

  // Alerts
  const zero = constant(0);
  const flags: boolean[][] = [
    taCore.crossover(prediction, upperEdge),
    taCore.crossunder(prediction, upperEdge),
    taCore.crossover(prediction, lowerEdge),
    taCore.crossunder(prediction, lowerEdge),
    taCore.crossover(prediction, zero),
    taCore.crossunder(prediction, zero),
    taCore.crossover(prediction, predictionMa),
    taCore.crossunder(prediction, predictionMa),
  ];

  const P = (a: number[]) => a.map((v, i) => ({ time: t(i), value: v }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: P(prediction), plot1: P(predictionMa), plot2: P(upper), plot3: P(lower), plot4: P(zero) },
    // hline(0, title = "Mid Level")
    hlines: [{ value: 0, options: { title: 'Mid Level', color: '#787B86', linestyle: 'dashed', linewidth: 1 } }],
    fills,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

export const MlMomentumIndex = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
