/**
 * ROC-Weighted MA Oscillator
 *
 * The rate of change of the source (length rocLen) is normalised to 0..1 over rocLen bars. A moving average of the
 * source (type and length selectable) is moved towards the source by this weight: rwma = ma + weight * (src - ma).
 * The oscillator is the z-score of rwma over rocLen bars, with an EMA signal line. The histogram colour is bull above
 * the neutral threshold, bear below its negative, and keeps the previous colour inside the neutral zone. A colour
 * change from bear to bull (bull to bear) gives a long (short) triangle on the price pane. Gradient fills between
 * 2.5 and 3 (and -2.5 and -3) follow the oscillator; optional candle colours.
 * Alerts (alertcondition, `alerts` of the result): 'ROC Weighted MA Postive Trend' (oscillator above the neutral
 * threshold) and 'ROC Weighted MA Negative Trend' (oscillator below the neutral threshold), as the original.
 *
 * Reference: "ROC-Weighted MA Oscillator [SeerQuant]" by SeerQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type RocWeightedMAType = 'SMA' | 'EMA' | 'SMMA' | 'WMA' | 'VWMA' | 'TEMA' | 'DEMA' | 'LSMA' | 'HMA' | 'ALMA';
export type RocWeightedColorScheme = 'Default' | 'Modern' | 'Cool' | 'Alternate' | 'Bright';

export interface RocWeightedMAOscillatorInputs {
  /** ROC length (also the normalisation and z-score length) */
  rocLen: number;
  /** MA length */
  maLen: number;
  /** Signal EMA length */
  sigLen: number;
  /** Calculation source */
  src: SourceType;
  /** Neutral threshold */
  neutralThr: number;
  /** MA type */
  maType: RocWeightedMAType;
  /** Colour the candles */
  paint: boolean;
  /** Colour scheme */
  colScheme: RocWeightedColorScheme;
}

export const defaultInputs: RocWeightedMAOscillatorInputs = {
  rocLen: 55,
  maLen: 7,
  sigLen: 9,
  src: 'hlcc4',
  neutralThr: 0.5,
  maType: 'TEMA',
  paint: false,
  colScheme: 'Default',
};

const MA_TYPES: RocWeightedMAType[] = ['SMA', 'EMA', 'SMMA', 'WMA', 'VWMA', 'TEMA', 'DEMA', 'LSMA', 'HMA', 'ALMA'];

export const inputConfig: InputConfig[] = [
  { id: 'rocLen', type: 'int', title: 'ROC Length', defval: 55 },
  { id: 'maLen', type: 'int', title: 'MA Length', defval: 7 },
  { id: 'sigLen', type: 'int', title: 'Signal Length', defval: 9 },
  { id: 'src', type: 'source', title: 'Calculation Source', defval: 'hlcc4' },
  { id: 'neutralThr', type: 'float', title: 'Neutral Threshold', defval: 0.5 },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'TEMA', options: MA_TYPES },
  { id: 'paint', type: 'bool', title: 'Colour Candles?', defval: false },
  { id: 'colScheme', type: 'string', title: 'Color Scheme', defval: 'Default', options: ['Default', 'Modern', 'Cool', 'Alternate', 'Bright'] },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Oscillator', color: '#00ff73', lineWidth: 2, style: 'histogram' },
  { id: 'plot1', title: 'Signal', color: color.white, lineWidth: 1 },
  { id: 'plot2', title: 'Upper Bound 3', color: '#606060', lineWidth: 1 },
  { id: 'plot3', title: 'Upper Bound 2.5', color: '#606060', lineWidth: 1 },
  { id: 'plot4', title: 'Lower Bound -3', color: '#606060', lineWidth: 1 },
  { id: 'plot5', title: 'Lower Bound -2.5', color: '#606060', lineWidth: 1 },
];

export const metadata = {
  title: 'ROC-Weighted MA Oscillator',
  shortTitle: 'ROCWMA',
  overlay: false,
};

const SCHEMES: Record<RocWeightedColorScheme, [string, string, string]> = {
  Default: ['#00ff73', '#ff0040', '#606060'],
  Modern: ['#23d7e4', '#e11179', '#707070'],
  Cool: ['#00ffcc', '#1600db', '#505050'],
  Alternate: ['#00ff80', '#ff6600', '#505050'],
  Bright: ['#e8ec00', '#f200fa', '#505050'],
};

/** Pine float comparison: a > b only when a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;
/** x / 0 of the normalised ROC: highest = lowest means roc = lowest, so Pine also gives 0 / 0 = na */
const div = (a: number, b: number) => (b === 0 ? NaN : a / b);
/** Pine na() / plots / ta.ema treat +-infinity as na */
const finite = (v: number) => (Number.isFinite(v) ? v : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<RocWeightedMAOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { rocLen, maLen, sigLen, neutralThr, paint } = cfg;
  const [bull, bear, neutral] = SCHEMES[cfg.colScheme];
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.src));

  // roc = ta.roc(src, rocLen); normalized_roc = (roc - lowest(roc)) / (highest(roc) - lowest(roc))
  const roc = A(ta.roc(S(src), rocLen));
  const rocLo = A(ta.lowest(S(roc), rocLen));
  const rocHi = A(ta.highest(S(roc), rocLen));
  const normRoc = roc.map((v, i) => div(v - rocLo[i], rocHi[i] - rocLo[i]));

  const baseMa = movingAverage(bars, src, maLen, cfg.maType);
  // rwma = base_ma + normalized_roc * (src - base_ma)
  const rwma = baseMa.map((m, i) => m + normRoc[i] * (src[i] - m));
  // oscillator = zscore(rwma, rocLen) = (rwma - sma) / stdev
  const mean = A(ta.sma(S(rwma), rocLen));
  const sd = A(ta.stdev(S(rwma), rocLen));
  // a non-zero value / 0 stays +-infinity (comparisons and fill gradients use it), 0 / 0 is na
  const osc = rwma.map((v, i) => (v - mean[i]) / sd[i]);
  const signal = A(ta.ema(S(osc.map(finite)), sigLen));

  const oscPlot: { time: number; value: number; color: string }[] = [];
  const upperFill: string[] = [];
  const lowerFill: string[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  let prevColor: string | null = null;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const o = osc[i];
    // inNeutralZone = oscillator > -neutralThr and oscillator < neutralThr (na: false)
    const inNeutralZone = gt(o, -neutralThr) && gt(neutralThr, o);
    const currentCol: string | null = inNeutralZone ? prevColor : gt(o, neutralThr) ? bull : gt(-neutralThr, o) ? bear : neutral;
    const longSignal = currentCol === bull && prevColor === bear;
    const shortSignal = currentCol === bear && prevColor === bull;
    prevColor = currentCol;

    oscPlot.push({ time: t, value: finite(o), color: currentCol ?? 'transparent' });
    // oscillator > 0 ? color.from_gradient(oscillator, 0, 3, #0e0e0e, bear) : na
    upperFill.push(gt(o, 0) ? String(color.from_gradient(o, 0, 3, '#0e0e0e', bear)) : 'transparent');
    // oscillator < 0 ? color.from_gradient(oscillator, -3, 0, bull, #0e0e0e) : na
    lowerFill.push(gt(0, o) ? String(color.from_gradient(o, -3, 0, bull, '#0e0e0e')) : 'transparent');
    // barcolor(paint ? currentCol : na)
    if (paint && currentCol !== null) barColors.push({ time: t, color: currentCol });
    // plotshape(longSignal, triangleup, bull, belowbar, text "𝐋", textcolor bull, size.small, force_overlay)
    if (longSignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: bull, text: '𝐋', textColor: bull, size: 'small', forceOverlay: true });
    }
    if (shortSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: bear, text: '𝐒', textColor: bear, size: 'small', forceOverlay: true });
    }
  }

  const level = (v: number) => bars.map((b) => ({ time: b.time, value: v, color: '#606060' }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: oscPlot,
      plot1: bars.map((b, i) => ({ time: b.time, value: signal[i], color: color.white })),
      plot2: level(3),
      plot3: level(2.5),
      plot4: level(-3),
      plot5: level(-2.5),
    },
    fills: [
      { plot1: 'plot2', plot2: 'plot3', colors: upperFill },
      { plot1: 'plot4', plot2: 'plot5', colors: lowerFill },
    ],
    markers,
    barColors,
    // alertcondition(oscillator > neutralThr) / alertcondition(oscillator < neutralThr)
    alerts: alertStates(alertConditions, bars, [osc.map((o) => gt(o, neutralThr)), osc.map((o) => gt(neutralThr, o))]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ROC Weighted MA Postive Trend', message: 'ROC Weighted MA Bullish Signal on: {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'ROC Weighted MA Negative Trend', message: 'ROC Weighted MA Bearish Signal on: {{exchange}}:{{ticker}}' },
];

/** ma(source, length, type) of the script */
function movingAverage(bars: Bar[], src: number[], length: number, type: RocWeightedMAType): number[] {
  const S = (a: number[]) => Series.fromArray(bars, a);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  switch (type) {
    case 'SMA': return A(ta.sma(S(src), length));
    case 'EMA': return A(ta.ema(S(src), length));
    case 'SMMA': return A(ta.rma(S(src), length));
    case 'WMA': return A(ta.wma(S(src), length));
    case 'VWMA': return A(ta.vwma(S(src), length, new Series(bars, (b) => b.volume ?? NaN)));
    case 'TEMA': {
      const e1 = ta.ema(S(src), length);
      const e2 = ta.ema(e1, length);
      const a1 = A(e1);
      const a2 = A(e2);
      const a3 = A(ta.ema(e2, length));
      return a1.map((v, i) => 3 * (v - a2[i]) + a3[i]);
    }
    case 'DEMA': {
      const e1 = ta.ema(S(src), length);
      const a1 = A(e1);
      const a2 = A(ta.ema(e1, length));
      return a1.map((v, i) => 2 * v - a2[i]);
    }
    case 'LSMA': return A(ta.linreg(S(src), length, 0));
    case 'HMA': {
      // ta.wma(2 * ta.wma(source, length / 2) - ta.wma(source, length), math.floor(math.sqrt(length)))
      // (length / 2 is fractional for an odd length; the WMA length is its integer part, as ta.wma here)
      const half = A(ta.wma(S(src), length / 2));
      const full = A(ta.wma(S(src), length));
      return A(ta.wma(S(half.map((v, i) => 2 * v - full[i])), Math.floor(Math.sqrt(length))));
    }
    case 'ALMA': return A(ta.alma(S(src), length, 0.85, 6));
  }
}

export const RocWeightedMAOscillator = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
