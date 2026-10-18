/**
 * ATR-Scaled Deviation Oscillator
 *
 * The momentum close - close[len] is divided by its root mean square over the last `devLen` bars, scaled by the ATR
 * ratio: dev = sqrt(sum(mom^2) / devLen), atrRatio = atr / sma(atr, atrLen) * atrMult (1 when the ATR average is 0),
 * osc = mom / (dev / atrRatio). The oscillator is the EMA(2) of osc. A cross above the upper threshold sets the trend
 * to long, a cross below the lower threshold to short. The area between zero and the oscillator is blue (trend >= 0)
 * or red, and the price candles are drawn in the trend colour on the price pane.
 * Alerts (alertcondition, `alerts` of the result): 'ATR-DevOsc Long' on a cross above the upper threshold,
 * 'ATR-DevOsc Short' on a cross below the lower threshold.
 *
 * Reference: "ATR-Scaled Deviation Oscillator" by C_H_I_P_A
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AtrScaledDeviationOscillatorInputs {
  /** Momentum length: close - close[len] */
  len: number;
  /** Number of momentum values in the deviation */
  devLen: number;
  /** Upper threshold (a cross above it starts a long trend) */
  upper: number;
  /** Lower threshold (a cross below it starts a short trend) */
  lower: number;
  /** ATR length (also the length of the ATR average) */
  atrLen: number;
  /** ATR reaction multiplier */
  atrMult: number;
}

export const defaultInputs: AtrScaledDeviationOscillatorInputs = {
  len: 20,
  devLen: 20,
  upper: 1.0,
  lower: -1.0,
  atrLen: 14,
  atrMult: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Momentum Length', defval: 20, min: 1 },
  { id: 'devLen', type: 'int', title: 'Deviation Length', defval: 20, min: 1 },
  { id: 'upper', type: 'float', title: 'Upper Threshold', defval: 1.0, step: 0.2 },
  { id: 'lower', type: 'float', title: 'Lower Threshold', defval: -1.0, step: 0.2 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'atrMult', type: 'float', title: 'ATR Reaction Multiplier', defval: 1.5, step: 0.1 },
];

const ZERO_COL = String(color.new(color.gray, 50));
const OSC_COL = '#2962FF';
const LONG_COL = String(color.new(color.rgb(0, 180, 255), 40));
const SHORT_COL = String(color.new(color.rgb(255, 80, 60), 40));
const FILL_LONG = String(color.new(color.rgb(0, 180, 255), 70));
const FILL_SHORT = String(color.new(color.rgb(255, 80, 60), 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero Line', color: ZERO_COL, lineWidth: 1 },
  { id: 'plot1', title: 'Oscillator', color: OSC_COL, lineWidth: 2 },
];

export const metadata = {
  title: 'ATR-Scaled Deviation Oscillator',
  shortTitle: 'ATR-DevOsc',
  overlay: false,
};

/** Pine `==`: equal within 1e-10 (false with na) */
const eq = (a: number, b: number) => Math.abs(a - b) <= 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<AtrScaledDeviationOscillatorInputs> = {},
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { len, devLen, upper, lower, atrLen, atrMult } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = bars.map((b) => b.close);
  const at = (i: number) => (i >= 0 ? src[i] : NaN);

  const atrVal = A(ta.atr(bars, atrLen));
  const atrAvg = A(ta.sma(S(atrVal), atrLen));
  const osc: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const currMom = at(i) - at(i - len);
    // sumSq := 0.0; for k = 0 to devLen - 1: sumSq += (src[k] - src[k + len])^2 (na once a value is na)
    let sumSq = 0.0;
    for (let k = 0; k <= devLen - 1; k++) {
      const delta = at(i - k) - at(i - k - len);
      sumSq += delta * delta;
    }
    const dev = Math.sqrt(sumSq / devLen);
    const atrRatio = eq(atrAvg[i], 0) ? 1 : (atrVal[i] / atrAvg[i]) * atrMult;
    // Plain divisions: x / 0 is +-infinity (0 / 0 NaN), as in Pine
    const devAdj = dev / atrRatio;
    osc[i] = currMom / (eq(devAdj, 0) ? 1 : devAdj);
  }
  const smoothOsc = A(ta.ema(S(osc), 2));
  const smooth = S(smoothOsc);
  const longSignal = ta.crossover(smooth, upper).toArray();
  const shortSignal = ta.crossunder(smooth, lower).toArray();

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const fillColors: string[] = [];
  const candles: PlotCandleData[] = [];
  let trend = 0; // var int Trend = 0
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (longSignal[i]) trend = 1;
    else if (shortSignal[i]) trend = -1;
    const coloring = trend === 1 ? LONG_COL : trend === -1 ? SHORT_COL : 'transparent';
    plot0.push({ time: b.time, value: 0, color: ZERO_COL });
    plot1.push({ time: b.time, value: Number.isFinite(smoothOsc[i]) ? smoothOsc[i] : NaN, color: OSC_COL });
    // fill(zeroPlot, oscPlot, color = Trend >= 0 ? color.new(rgb(0, 180, 255), 70) : color.new(rgb(255, 80, 60), 70))
    fillColors.push(trend >= 0 ? FILL_LONG : FILL_SHORT);
    // plotcandle(open, high, low, close, color / bordercolor / wickcolor = coloring, force_overlay = true)
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: coloring,
      borderColor: coloring, wickColor: coloring, forceOverlay: true });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    // hline(upper) / hline(lower): default colour and style
    hlines: [
      { value: upper, options: { title: 'Upper Threshold', color: '#787B86', linestyle: 'dashed' } },
      { value: lower, options: { title: 'Lower Threshold', color: '#787B86', linestyle: 'dashed' } },
    ],
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' }, colors: fillColors }],
    plotCandles: { trendCandles: candles },
    // alertcondition(longSignal, ...) / alertcondition(shortSignal, ...)
    alerts: alertStates(alertConditions, bars, [
      bars.map((_b, i) => !!longSignal[i]),
      bars.map((_b, i) => !!shortSignal[i]),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ATR-DevOsc Long', message: 'ATR-DevOsc: Long signal on {{ticker}} at {{close}}' },
  { id: 'alert1', title: 'ATR-DevOsc Short', message: 'ATR-DevOsc: Short signal on {{ticker}} at {{close}}' },
];

export const AtrScaledDeviationOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
