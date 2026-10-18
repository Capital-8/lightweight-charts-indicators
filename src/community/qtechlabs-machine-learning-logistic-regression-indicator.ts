/**
 * Q# ML Logistic Regression Indicator [Lite]
 *
 * A logistic model with fixed weights on two features of the price source: the log return over `retLookback` bars
 * and log(|price^2 - 1| + 0.5), each min-max normalised over 20 bars (0.5 on a flat window).
 * z = -2 + 2 * normRet + normSynthetic, probability = 1 / (1 + exp(-z)), smoothed by an EMA. The signal is buy above
 * the threshold, sell below 1 - threshold, else hold; BUY / SELL labels mark the bars where the signal changes to
 * buy / sell. The smoothed probability is drawn with lines at 0.5, the threshold and 1 - threshold.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' and 'Sell Signal', true on the bars of the labels.
 *
 * Reference: "Q# ML Logistic Regression Indicator [Lite]" by QTechLabsInfo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Q# Tech Labs 2025
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Q# Lite Buy Signal' },
  { id: 'alert1', title: 'Sell Signal', message: 'Q# Lite Sell Signal' },
];

export interface QtechlabsMachineLearningLogisticRegressionIndicatorInputs {
  /** Price source */
  ptype: 'Open' | 'High' | 'Low' | 'Close' | 'HL2' | 'HLC3' | 'OHLC4';
  /** Signal threshold of the smoothed probability */
  threshold: number;
  /** Log return lookback (bars) */
  retLookback: number;
  /** EMA length of the probability */
  smoothLen: number;
}

export const defaultInputs: QtechlabsMachineLearningLogisticRegressionIndicatorInputs = {
  ptype: 'Close',
  threshold: 0.6,
  retLookback: 3,
  smoothLen: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'ptype', type: 'string', title: 'Price Source', defval: 'Close', options: ['Open', 'High', 'Low', 'Close', 'HL2', 'HLC3', 'OHLC4'] },
  { id: 'threshold', type: 'float', title: 'Signal Threshold', defval: 0.6, min: 0.5, max: 0.9 },
  { id: 'retLookback', type: 'int', title: 'Log Return Lookback', defval: 3, min: 1 },
  { id: 'smoothLen', type: 'int', title: 'Probability Smoothing', defval: 3 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Signal Confidence', color: color.blue, lineWidth: 1, display: 'pane' },
];

export const metadata = {
  title: 'Q# ML Logistic Regression Indicator [Lite]',
  shortTitle: 'Q# ML Logistic Regression Indicator [Lite]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<QtechlabsMachineLearningLogisticRegressionIndicatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const ds = bars.map((b) => {
    switch (cfg.ptype) {
      case 'Open': return b.open;
      case 'High': return b.high;
      case 'Low': return b.low;
      case 'Close': return b.close;
      case 'HL2': return (b.high + b.low) / 2;
      case 'HLC3': return (b.high + b.low + b.close) / 3;
      default: return (b.open + b.high + b.low + b.close) / 4;
    }
  });

  // ret = math.log(ds / ds[ret_lookback]); synthetic = math.log(math.abs(math.pow(ds, 2) - 1) + 0.5)
  const ret = ds.map((v, i) => (i >= cfg.retLookback ? Math.log(v / ds[i - cfg.retLookback]) : NaN));
  const synthetic = ds.map((v) => Math.log(Math.abs(Math.pow(v, 2) - 1) + 0.5));

  // normalize(x, len): hi == lo ? 0.5 : (x - lo) / (hi - lo)
  const normalize = (x: number[], len: number) => {
    const hi = A(ta.highest(S(x), len));
    const lo = A(ta.lowest(S(x), len));
    return x.map((v, i) => (eq(hi[i], lo[i]) ? 0.5 : (v - lo[i]) / (hi[i] - lo[i])));
  };
  const normRet = normalize(ret, 20);
  const normSynthetic = normalize(synthetic, 20);

  const w0 = -2.0;
  const w1 = 2.0;
  const w2 = 1.0;
  const prob = normRet.map((r, i) => 1 / (1 + Math.exp(-(w0 + w1 * r + w2 * normSynthetic[i]))));
  const sprob = A(ta.ema(S(prob), cfg.smoothLen));

  const markers: MarkerData[] = [];
  const buyColor = color.green;
  const sellColor = color.red;
  let prevSignal = NaN;
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const signal = gt(sprob[i], cfg.threshold) ? 1 : lt(sprob[i], 1 - cfg.threshold) ? -1 : 0;
    // signal != signal[1]: false when signal[1] is na (bar 0)
    const changed = !isNaN(prevSignal) && signal !== prevSignal;
    buyFlags.push(signal === 1 && changed);
    sellFlags.push(signal === -1 && changed);
    // plotshape(..., text = "BUY"): no textcolor, the Pine default text colour (color.blue)
    if (signal === 1 && changed) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: buyColor, text: 'BUY',
        textColor: color.blue });
    }
    if (signal === -1 && changed) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: sellColor, text: 'SELL',
        textColor: color.blue });
    }
    prevSignal = signal;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: sprob.map((v, i) => ({ time: bars[i].time, value: Number.isFinite(v) ? v : NaN, color: color.blue })),
    },
    hlines: [
      { value: 0.5, options: { title: 'Neutral', color: color.gray, linestyle: 'dashed' } },
      { value: cfg.threshold, options: { title: 'Buy Threshold', color: color.green, linestyle: 'dotted' } },
      { value: 1 - cfg.threshold, options: { title: 'Sell Threshold', color: color.red, linestyle: 'dotted' } },
    ],
    markers,
    // alertcondition(buy, "Buy Signal") / alertcondition(sell, "Sell Signal")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

export const QtechlabsMachineLearningLogisticRegressionIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
