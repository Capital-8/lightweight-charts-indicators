/**
 * Institutional MACD (Z-Score Edition)
 *
 * The classic MACD (fast EMA - slow EMA, EMA signal line, histogram = MACD - signal) with each series replaced by its
 * z-score over a lookback: (x - SMA(x)) / stdev(x). The z-scored histogram is drawn as columns coloured by sign and by
 * rising / falling, with the z-scored MACD and signal lines and +/- threshold lines.
 * Alerts (alertcondition, `alerts` of the result): the z-scored histogram above the threshold, below minus the
 * threshold, crossing over 0 and crossing under 0.
 *
 * Reference: "Institutional MACD (Z-Score Edition) [VolumeVigilante]" by VolumeVigilante
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © VolumeVigilante | Trade Smart. Trade Vigilantly.
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface InstitutionalMacdInputs {
  fastLength: number;
  slowLength: number;
  signalLength: number;
  src: SourceType;
  /** Z-score lookback length */
  zScoreLength: number;
  /** Level of the +/- threshold lines */
  zScoreThreshold: number;
  showZHistogram: boolean;
  showZLines: boolean;
  showZBands: boolean;
}

export const defaultInputs: InstitutionalMacdInputs = {
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  src: 'close',
  zScoreLength: 50,
  zScoreThreshold: 1.0,
  showZHistogram: true,
  showZLines: true,
  showZBands: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'MACD Fast Length', defval: 12 },
  { id: 'slowLength', type: 'int', title: 'MACD Slow Length', defval: 26 },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing Length', defval: 9 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'zScoreLength', type: 'int', title: 'Z-Score Lookback Length', defval: 50 },
  { id: 'zScoreThreshold', type: 'float', title: 'Z-Score Threshold Level', defval: 1.0, min: 0.1, step: 0.1 },
  { id: 'showZHistogram', type: 'bool', title: 'Show Z-Scored Histogram', defval: true },
  { id: 'showZLines', type: 'bool', title: 'Show Z-Scored MACD Lines', defval: true },
  { id: 'showZBands', type: 'bool', title: 'Show ±Z Threshold Bands', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Z-Score Histogram', color: '#26A69A', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Z-MACD Line', color: '#2962FF', lineWidth: 1 },
  { id: 'plot2', title: 'Z-Signal Line', color: '#FF6D00', lineWidth: 1 },
  { id: 'plot3', title: '+Z Threshold', color: '#26A69A', lineWidth: 1 },
  { id: 'plot4', title: '-Z Threshold', color: '#FF5252', lineWidth: 1 },
];

/** hline(0, "Zero", color = color.new(#787B86, 50)), Pine default hline style (dashed) */
const ZERO_COLOR = String(color.new('#787B86', 50));

export const metadata = {
  title: 'Institutional MACD (Z-Score Edition) [VolumeVigilante]',
  shortTitle: 'Institutional MACD (Z-Score Edition) [VolumeVigilante]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<InstitutionalMacdInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = getSourceSeries(bars, cfg.src);

  const fastMA = A(ta.ema(src, cfg.fastLength));
  const slowMA = A(ta.ema(src, cfg.slowLength));
  const macdLine = fastMA.map((f, i) => f - slowMA[i]);
  const signalLine = A(ta.ema(S(macdLine), cfg.signalLength));
  const hist = macdLine.map((m, i) => m - signalLine[i]);

  // z = (x - ta.sma(x, len)) / ta.stdev(x, len): a plain division (x / 0 is +-infinity, 0 / 0 NaN); the histogram
  // colour compares the infinite value, the plots show na for it
  const zScore = (x: number[]) => {
    const mean = A(ta.sma(S(x), cfg.zScoreLength));
    const sd = A(ta.stdev(S(x), cfg.zScoreLength));
    return x.map((v, i) => (v - mean[i]) / sd[i]);
  };
  const plotValue = (v: number) => (Number.isFinite(v) ? v : NaN);
  const zHist = zScore(hist);
  const macdZ = zScore(macdLine);
  const signalZ = zScore(signalLine);

  const t = (i: number) => bars[i].time;
  const plot0 = bars.map((_b, i) => {
    const isRising = i > 0 && gt(zHist[i], zHist[i - 1]);
    const c = ge(zHist[i], 0) ? (isRising ? '#26A69A' : '#B2DFDB') : isRising ? '#FFCDD2' : '#FF5252';
    return { time: t(i), value: cfg.showZHistogram ? plotValue(zHist[i]) : NaN, color: c };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0,
      plot1: bars.map((_b, i) => ({ time: t(i), value: cfg.showZLines ? plotValue(macdZ[i]) : NaN })),
      plot2: bars.map((_b, i) => ({ time: t(i), value: cfg.showZLines ? plotValue(signalZ[i]) : NaN })),
      plot3: bars.map((_b, i) => ({ time: t(i), value: cfg.showZBands ? cfg.zScoreThreshold : NaN })),
      plot4: bars.map((_b, i) => ({ time: t(i), value: cfg.showZBands ? -cfg.zScoreThreshold : NaN })),
    },
    hlines: [{ value: 0, options: { title: 'Zero', color: ZERO_COLOR, linestyle: 'dashed' } }],
    // alertcondition(zHist > zScoreThreshold, ...), (zHist < -zScoreThreshold, ...), (ta.crossover(zHist, 0), ...),
    // (ta.crossunder(zHist, 0), ...)
    alerts: alertStates(alertConditions, bars, [
      zHist.map((z) => gt(z, cfg.zScoreThreshold)),
      zHist.map((z) => lt(z, -cfg.zScoreThreshold)),
      crossedOver(zHist, 0),
      crossedUnder(zHist, 0),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Z-Score > Threshold', message: 'Z-Score is above threshold (Overbought)' },
  { id: 'alert1', title: 'Z-Score < Threshold', message: 'Z-Score is below threshold (Oversold)' },
  { id: 'alert2', title: 'Z-Score Bull Cross', message: 'Z-Score crossed above 0' },
  { id: 'alert3', title: 'Z-Score Bear Cross', message: 'Z-Score crossed below 0' },
];

export const InstitutionalMacd = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
