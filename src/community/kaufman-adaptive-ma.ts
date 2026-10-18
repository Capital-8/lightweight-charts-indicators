/**
 * Kaufman Adaptive Moving Average (KAMA)
 *
 * Adapts smoothing based on efficiency ratio (signal / noise).
 * alpha = (ER * (fast - slow) + slow)²
 * KAMA = alpha * src + (1 - alpha) * KAMA[1]
 *
 * Alert (alertcondition, `alerts` of the result): 'Color Change' when the colour of the original's line changes:
 * with "Highlight ?" green when the KAMA rises (on a confirmed bar with "Await Bar Confirmation ?"), else red; without
 * it one colour (no change). The last bar is confirmed unless `lastBarConfirmed` of the optional chart context (third
 * argument) says otherwise. These two inputs only act on the alert: the port's line keeps its own colours.
 *
 * Reference: "Kaufman Adaptive Moving Average" by everget
 */

import { getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface KaufmanAdaptiveMAInputs {
  length: number;
  fastLength: number;
  slowLength: number;
  src: SourceType;
  /** Highlight ? (direction colours of the original's line, used by the alert) */
  highlight: boolean;
  /** Await Bar Confirmation ? (the rising colour only on confirmed bars, used by the alert) */
  awaitBarConfirmation: boolean;
}

export const defaultInputs: KaufmanAdaptiveMAInputs = {
  length: 14,
  fastLength: 2,
  slowLength: 30,
  src: 'close',
  highlight: true,
  awaitBarConfirmation: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 14, min: 1 },
  { id: 'fastLength', type: 'int', title: 'Fast EMA Length', defval: 2, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow EMA Length', defval: 30, min: 1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'highlight', type: 'bool', title: 'Highlight ?', defval: true },
  { id: 'awaitBarConfirmation', type: 'bool', title: 'Await Bar Confirmation ?', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'KAMA', color: '#6D1E7F', lineWidth: 2 },
];

export const metadata = {
  title: 'Kaufman Adaptive Moving Average',
  shortTitle: 'KAMA',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<KaufmanAdaptiveMAInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alerts: AlertConditionState[] } {
  const { length, fastLength, slowLength, src, highlight, awaitBarConfirmation } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const srcArr = getSourceSeries(bars, src).toArray();

  const fastAlpha = 2 / (fastLength + 1);
  const slowAlpha = 2 / (slowLength + 1);

  const kama: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const s = srcArr[i] ?? 0;

    if (i < length) {
      kama[i] = s;
      continue;
    }

    // Efficiency Ratio = |change over length| / sum of |1-bar changes|
    const mom = Math.abs(s - (srcArr[i - length] ?? s));
    let volatility = 0;
    for (let j = 0; j < length; j++) {
      volatility += Math.abs((srcArr[i - j] ?? 0) - (srcArr[i - j - 1] ?? 0));
    }
    const er = volatility !== 0 ? mom / volatility : 0;

    const sc = Math.pow(er * (fastAlpha - slowAlpha) + slowAlpha, 2);
    kama[i] = sc * s + (1 - sc) * kama[i - 1];
  }

  const warmup = length;
  const plot = kama.map((v, i) => {
    if (i < warmup) return { time: bars[i].time, value: NaN };
    const prev = i > 0 ? kama[i - 1] : v;
    const color = v > prev ? '#26A69A' : v < prev ? '#EF5350' : '#6D1E7F';
    return { time: bars[i].time, value: v, color };
  });

  // await = awaitBarConfirmation ? barstate.isconfirmed : true
  // maColor = highlight ? (kama > kama[1] and await ? color.green : color.red) : #6d1e7f
  // alertCond = maColor != maColor[1] (maColor[1] is na on the first bar)
  const maColor = kama.map((v, i) => {
    if (!highlight) return 'default';
    const awaitOk = !awaitBarConfirmation || i < n - 1 || lastBarConfirmedOf(chart);
    return i > 0 && v > kama[i - 1] && awaitOk ? 'green' : 'red';
  });
  const changeFlags = maColor.map((c, i) => i > 0 && c !== maColor[i - 1]);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot },
    alerts: alertStates(alertConditions, bars, [changeFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Color Change', message: 'KAMA has changed its color!' },
];

export const KaufmanAdaptiveMA = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
