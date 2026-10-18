/**
 * MACD-V (Volatility Normalized MACD)
 *
 * MACD line (EMA(fast) - EMA(slow) of the source) divided by ATR(atrLength) and multiplied by 100, with an EMA
 * signal line and their difference as a histogram. The histogram columns are teal / light teal above zero and
 * light red / red below zero, the stronger colour when the histogram rises (above zero) or falls (below zero).
 * Horizontal lines at 150, 50, 0, -50 and -150.
 * Alerts (alertcondition, `alerts` of the result): 'Rising to falling' (the histogram turns negative) and 'Falling to
 * rising' (it turns positive).
 *
 * Reference: "MACD-V (Volatility Normalized MACD)" by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MACDVInputs {
  fastLength: number;
  slowLength: number;
  signalLength: number;
  atrLength: number;
  src: SourceType;
}

export const defaultInputs: MACDVInputs = {
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  atrLength: 26,
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26 },
  { id: 'signalLength', type: 'int', title: 'Signal Length', defval: 9 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 26 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MACD-V', color: '#2962FF', lineWidth: 2 },
  { id: 'plot1', title: 'Signal', color: '#FF299B', lineWidth: 2 },
  { id: 'plot2', title: 'Histogram', color: '#2962FF', lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'MACD-V (Volatility Normalized MACD)',
  shortTitle: 'MACD-V',
  overlay: false,
};

/** Pine float comparison a > b: true only when a - b > 1e-10; na operands give false */
const gt = (a: number, b: number): boolean => a - b > 1e-10;
/** Pine float comparison a >= b: false only when b - a > 1e-10; na operands give false */
const ge = (a: number, b: number): boolean => !isNaN(a) && !isNaN(b) && !(b - a > 1e-10);

export function calculate(
  bars: Bar[],
  inputs: Partial<MACDVInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = getSourceSeries(bars, cfg.src);

  // macdLine = ta.ema(src, fastLength) - ta.ema(src, slowLength); atrValue = ta.atr(atrLength)
  const fastEMA = A(ta.ema(src, cfg.fastLength));
  const slowEMA = A(ta.ema(src, cfg.slowLength));
  const atrValue = A(ta.atr(bars, cfg.atrLength));
  // macdV = macdLine / atrValue * 100. With an ATR of 0 it is +-Infinity (0 / 0: NaN): na for the plots and for
  // ta.ema (Pine ta.ema skips an infinite value as na), but `hist > hist[1]` compares the infinite value.
  const macdV = fastEMA.map((f, i) => ((f - slowEMA[i]) / atrValue[i]) * 100);
  const finite = (v: number) => (Number.isFinite(v) ? v : NaN);
  const signal = A(ta.ema(Series.fromArray(bars, macdV.map(finite)), cfg.signalLength));
  const hist = macdV.map((v, i) => v - signal[i]);

  // alertcondition(hist[1] >= 0 and hist < 0, "Rising to falling") / alertcondition(hist[1] <= 0 and hist > 0, ...)
  const toFalling = hist.map((h, i) => i > 0 && ge(hist[i - 1], 0) && gt(0, h));
  const toRising = hist.map((h, i) => i > 0 && ge(0, hist[i - 1]) && gt(h, 0));

  const plot0: { time: number; value: number }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const plot2: { time: number; value: number; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    plot0.push({ time: t, value: finite(macdV[i]) });
    plot1.push({ time: t, value: signal[i] });
    // hColor = hist >= 0 ? hist > hist[1] ? #26a69a : #b2dfdb : hist > hist[1] ? #ffcdd2 : #ff5252
    const prev = i > 0 ? hist[i - 1] : NaN;
    const rising = gt(hist[i], prev);
    const hColor = ge(hist[i], 0) ? (rising ? '#26A69A' : '#B2DFDB') : rising ? '#FFCDD2' : '#FF5252';
    plot2.push({ time: t, value: finite(hist[i]), color: hColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    hlines: [
      { value: 150, options: { title: 'Extreme Overbought', color: color.red, linestyle: 'dashed' } },
      { value: 50, options: { title: 'Strong Momentum Up', color: color.green, linestyle: 'dotted' } },
      { value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dashed' } },
      { value: -50, options: { title: 'Strong Momentum Down', color: color.orange, linestyle: 'dotted' } },
      { value: -150, options: { title: 'Extreme Oversold', color: color.red, linestyle: 'dashed' } },
      { value: 0, options: { title: 'Zero', color: '#787B8680', linestyle: 'dashed' } },
    ],
    markers: [],
    alerts: alertStates(alertConditions, bars, [toFalling, toRising]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Rising to falling', message: 'MACD Volatility histogram switched from a rising to falling state' },
  { id: 'alert1', title: 'Falling to rising', message: 'MACD Volatility histogram switched from a falling to rising state' },
];

export const MACDV = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
