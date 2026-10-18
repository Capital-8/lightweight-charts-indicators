/**
 * Nova Statistical Filtering Oscillator
 *
 * Z-score of the close over `length` bars ((close - SMA) / stdev, 0 on a zero stdev), smoothed by a TEMA
 * (3 * (ema1 - ema2) + ema3). Dynamic bands at +-mult * stdev of the smoothed z-score over `length` bars. The line
 * and histogram take a bear-to-bull gradient colour from the lower to the upper band; a gradient fill to zero.
 * Circles mark crosses of the oscillator above the lower band (buy) and below the upper band (sell).
 *
 * Alerts (alertcondition, `alerts` of the result): "Buy Signal" and "Sell Signal" (the crosses of the circles).
 *
 * Reference: "Nova Statistical Filtering Oscillator [Pineify]" by Pineify
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Pineify
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Bullish momentum is returning from an oversold statistical extreme.' },
  { id: 'alert1', title: 'Sell Signal', message: 'Bearish momentum is returning from an overbought statistical extreme.' },
];

export interface NovaStatisticalFilteringOscillatorInputs {
  /** Statistical window (mean and stdev of the z-score, stdev of the bands) */
  lengthInput: number;
  /** TEMA smoothing length */
  smoothInput: number;
  /** Bands multiplier */
  multInput: number;
  bullColor: string;
  bearColor: string;
}

export const defaultInputs: NovaStatisticalFilteringOscillatorInputs = {
  lengthInput: 20,
  smoothInput: 10,
  multInput: 2.0,
  bullColor: '#089981',
  bearColor: '#F23645',
};

export const inputConfig: InputConfig[] = [
  { id: 'lengthInput', type: 'int', title: 'Statistical Window', defval: 20, min: 2 },
  { id: 'smoothInput', type: 'int', title: 'Smoothing Length', defval: 10, min: 1 },
  { id: 'multInput', type: 'float', title: 'Bands Multiplier', defval: 2.0, min: 0.5, step: 0.5 },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#089981' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#F23645' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Band', color: String(color.new('#F23645', 50)), lineWidth: 1 },
  { id: 'plot1', title: 'Lower Band', color: String(color.new('#089981', 50)), lineWidth: 1 },
  { id: 'plot2', title: 'Baseline', color: String(color.new(color.gray, 50)), lineWidth: 1 },
  { id: 'plot3', title: 'Nova Oscillator', color: '#089981', lineWidth: 2 },
  { id: 'plot4', title: 'Histogram', color: String(color.new('#089981', 70)), lineWidth: 1, style: 'histogram' },
];

export const metadata = {
  title: 'Nova Statistical Filtering Oscillator [Pineify]',
  shortTitle: 'Pineify - NSFO',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false); a == b within 1e-10 */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<NovaStatisticalFilteringOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  // zScore = stdevPrice == 0 ? 0 : (close - meanPrice) / stdevPrice
  const mean = A(ta.sma(S(close), cfg.lengthInput));
  const sd = A(ta.stdev(S(close), cfg.lengthInput));
  const z = close.map((c, i) => (eq(sd[i], 0) ? 0 : (c - mean[i]) / sd[i]));

  // tema(src, len) => 3 * (ema1 - ema2) + ema3
  const ema1 = A(ta.ema(S(z), cfg.smoothInput));
  const ema2 = A(ta.ema(S(ema1), cfg.smoothInput));
  const ema3 = A(ta.ema(S(ema2), cfg.smoothInput));
  const sm = ema1.map((e1, i) => 3 * (e1 - ema2[i]) + ema3[i]);

  const bandSd = A(ta.stdev(S(sm), cfg.lengthInput));
  const upper = bandSd.map((v) => v * cfg.multInput);
  const lower = bandSd.map((v) => -v * cfg.multInput);

  const oscColor = sm.map((v, i) => String(color.from_gradient(v, lower[i], upper[i], cfg.bearColor, cfg.bullColor)));

  const t = (i: number) => bars[i].time;
  const upCol = String(color.new(cfg.bearColor, 50));
  const loCol = String(color.new(cfg.bullColor, 50));
  const baseCol = String(color.new(color.gray, 50));
  const plots = {
    plot0: bars.map((_b, i) => ({ time: t(i), value: upper[i], color: upCol })),
    plot1: bars.map((_b, i) => ({ time: t(i), value: lower[i], color: loCol })),
    plot2: bars.map((_b, i) => ({ time: t(i), value: 0, color: baseCol })),
    plot3: bars.map((_b, i) => ({ time: t(i), value: sm[i], color: oscColor[i] })),
    plot4: bars.map((_b, i) => ({ time: t(i), value: sm[i], color: String(color.new(oscColor[i], 70)) })),
  };

  // fill(oscPlot, baseline, math.max(s, 0), math.min(s, 0), s > 0 ? color.new(bullColor, 50) : color.new(bearColor, 100),
  //      s > 0 ? color.new(bullColor, 100) : color.new(bearColor, 50))
  const bull50 = String(color.new(cfg.bullColor, 50));
  const bull100 = String(color.new(cfg.bullColor, 100));
  const bear50 = String(color.new(cfg.bearColor, 50));
  const bear100 = String(color.new(cfg.bearColor, 100));
  const fills = [{
    plot1: 'plot3', plot2: 'plot2',
    gradient: {
      topValue: sm.map((v) => (isNaN(v) ? NaN : Math.max(v, 0))),
      bottomValue: sm.map((v) => (isNaN(v) ? NaN : Math.min(v, 0))),
      topColor: sm.map((v) => (gt(v, 0) ? bull50 : bear100)),
      bottomColor: sm.map((v) => (gt(v, 0) ? bull100 : bear50)),
    },
  }];

  // bullSignal = ta.crossover(smoothedStat, lowerBand); bearSignal = ta.crossunder(smoothedStat, upperBand)
  const bull = A(ta.crossover(S(sm), S(lower)));
  const bear = A(ta.crossunder(S(sm), S(upper)));
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    // plotshape(bullSignal ? smoothedStat : na, "Buy Signal", shape.circle, location.absolute, bullColor, size = size.tiny)
    if (bull[i] && !isNaN(sm[i])) {
      markers.push({ time: t(i), position: 'atPriceMiddle', price: sm[i], shape: 'circle', color: cfg.bullColor, size: 'tiny', id: 'shape0' });
    }
    if (bear[i] && !isNaN(sm[i])) {
      markers.push({ time: t(i), position: 'atPriceMiddle', price: sm[i], shape: 'circle', color: cfg.bearColor, size: 'tiny', id: 'shape1' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    alerts: alertStates(alertConditions, bars, [bull.map((v) => !!v), bear.map((v) => !!v)]),
  };
}

export const NovaStatisticalFilteringOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
