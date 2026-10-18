/**
 * Volatility Reversion Bands
 *
 * Bollinger Bands of close (SMA and standard deviation over `length`, * mult) widened by ATR(length) * atrMult:
 * reversal upper = BB upper + ATR band, reversal lower = BB lower - ATR band. A close crossing under the lower band
 * gives a "▲+" long label, a close crossing over the upper band a "▼+" short label. The bars are coloured by the
 * close position between the bands (0 = lower band, 1 = upper band, clamped): from cyan to purple, each channel
 * interpolated and truncated to an integer. Optional weak signals: "▼" labels when the position is 0.9 or more,
 * "▲" labels when it is 0.1 or less.
 *
 * Reference: "Uptrick: Volatility Reversion Bands" by Uptrick
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';

export interface UptrickVolatilityReversionBandsInputs {
  /** SMA, standard deviation and ATR length */
  length: number;
  /** Standard deviation multiplier */
  mult: number;
  /** ATR multiplier */
  atrMult: number;
  /** Weak signals near the bands */
  weakSignals: boolean;
}

export const defaultInputs: UptrickVolatilityReversionBandsInputs = {
  length: 20,
  mult: 2.0,
  atrMult: 1.5,
  weakSignals: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Lookback Length', defval: 20, min: 1 },
  { id: 'mult', type: 'float', title: 'Standard Deviation Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 1.5, min: 0.1, step: 0.1 },
  { id: 'weakSignals', type: 'bool', title: 'Include Weak Signals (Near Bands)?', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Reversal Upper', color: '#e40df3', lineWidth: 1 },
  { id: 'plot1', title: 'Reversal Lower', color: '#04ddd2', lineWidth: 1 },
];

export const metadata = {
  title: 'Uptrick: Volatility Reversion Bands',
  shortTitle: 'Uptrick: Volatility Reversion Bands',
  overlay: true,
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => ge(b, a);
/** Pine math.max / math.min: na when an argument is na */
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));

export function calculate(
  bars: Bar[],
  inputs: Partial<UptrickVolatilityReversionBandsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);
  const closeS = Series.fromArray(bars, close);

  const basis = A(ta.sma(closeS, cfg.length));
  const sd = A(ta.stdev(closeS, cfg.length));
  const atr = A(ta.atr(bars, cfg.length));
  const upper = basis.map((b, i) => b + sd[i] * cfg.mult + atr[i] * cfg.atrMult);
  const lower = basis.map((b, i) => b - sd[i] * cfg.mult - atr[i] * cfg.atrMult);

  // f_colorGradient(ratioClamped, cyan, purple): channel = a + int((b - a) * ratio); color.rgb(r, g, b, 0)
  const colCyan = color.rgb(0, 255, 255);
  const colPurple = color.rgb(128, 0, 128);
  const lerp = (a: number, b: number, r: number) => a + Math.trunc((b - a) * r);
  const gradient = (r: number) => String(color.rgb(
    lerp(color.r(colCyan), color.r(colPurple), r),
    lerp(color.g(colCyan), color.g(colPurple), r),
    lerp(color.b(colCyan), color.b(colPurple), r),
    0,
  ));

  const t = (i: number) => bars[i].time;
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const longCol = String(color.new(color.green, 0));
  const shortCol = String(color.new(color.red, 0));
  const weakSellCol = String(color.new(color.red, 70));
  const weakBuyCol = String(color.new(color.green, 70));
  for (let i = 0; i < n; i++) {
    // longSignal = ta.crossunder(close, reversalLower); shortSignal = ta.crossover(close, reversalUpper); both compare
    // exactly (no 1e-10 tolerance; na compares false)
    const longSignal = i > 0 && close[i] < lower[i] && close[i - 1] >= lower[i - 1];
    const shortSignal = i > 0 && close[i] > upper[i] && close[i - 1] <= upper[i - 1];
    if (longSignal) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'labelUp', color: longCol, text: '▲+', textColor: color.white, size: 'small', id: 'shape0' });
    }
    if (shortSignal) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'labelDown', color: shortCol, text: '▼+', textColor: color.white, size: 'small', id: 'shape1' });
    }

    const denom = max(upper[i] - lower[i], 0.0000001);
    const ratio = (close[i] - lower[i]) / denom;
    const ratioClamped = max(0.0, min(ratio, 1.0));
    barColors.push({ time: t(i), color: gradient(ratioClamped) });

    // weak signals: ratioClamped >= 0.9 / <= 0.1
    if (cfg.weakSignals && ge(ratioClamped, 0.9)) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'labelDown', color: weakSellCol, text: '▼', textColor: color.white, size: 'tiny', id: 'shape2' });
    }
    if (cfg.weakSignals && le(ratioClamped, 0.1)) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'labelUp', color: weakBuyCol, text: '▲', textColor: color.white, size: 'tiny', id: 'shape3' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: upper[i], color: '#e40df3' })),
      plot1: bars.map((b, i) => ({ time: b.time, value: lower[i], color: '#04ddd2' })),
    },
    markers,
    barColors,
  };
}

export const UptrickVolatilityReversionBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
