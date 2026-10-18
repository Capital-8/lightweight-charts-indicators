/**
 * DEMA Flow
 *
 * DEMA of the close (2 * EMA - EMA of the EMA), smoothed by a running median of its last `hlFilterLength` values.
 * ATR bands around the smoothed DEMA: + upper multiplier * ATR and - lower multiplier * ATR. The trend turns
 * bullish when the close is above the upper band and bearish when it is below the lower band (it starts neutral).
 * The line, the candles drawn by the indicator and the bar colours take the trend colour.
 * Alerts (alertcondition, `alerts` of the result): 'DEMA Trend Bullish' / 'DEMA Trend Bearish' when the trend crosses
 * above / below 0 (ta.crossover / ta.crossunder of the trend signal).
 *
 * Reference: "DEMA Flow [Alpha Extract]" by AlphaExtract
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, PlotCandleData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DemaFlowInputs {
  /** DEMA length */
  demaLength: number;
  /** Length of the median filter of the DEMA */
  hlFilterLength: number;
  /** ATR length of the bands */
  atrLength: number;
  /** ATR multiplier of the upper band */
  upperAtrMult: number;
  /** ATR multiplier of the lower band */
  lowerAtrMult: number;
  /** Not used by the script */
  showBands: boolean;
  /** Not used by the script */
  showLabels: boolean;
}

export const defaultInputs: DemaFlowInputs = {
  demaLength: 23,
  hlFilterLength: 4,
  atrLength: 14,
  upperAtrMult: 2.1,
  lowerAtrMult: 1.5,
  showBands: true,
  showLabels: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'demaLength', type: 'int', title: 'DEMA Length', defval: 23, min: 5, max: 100 },
  { id: 'hlFilterLength', type: 'int', title: 'HL Median Filter Length', defval: 4, min: 3, max: 15 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 5, max: 50 },
  { id: 'upperAtrMult', type: 'float', title: 'Upper ATR Multiplier', defval: 2.1, min: 0.5, max: 5.0, step: 0.1 },
  { id: 'lowerAtrMult', type: 'float', title: 'Lower ATR Multiplier', defval: 1.5, min: 0.5, max: 5.0, step: 0.1 },
  { id: 'showBands', type: 'bool', title: 'Show ATR Bands', defval: true },
  { id: 'showLabels', type: 'bool', title: 'Show Trend Labels', defval: true },
];

const BULL = String(color.new('#00ff88', 0));
const BEAR = String(color.new('#ff0066', 0));
const NEUTRAL = String(color.new('#888888', 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Smooth DEMA Trend', color: NEUTRAL, lineWidth: 2 },
];

export const metadata = {
  title: 'DEMA Flow [Alpha Extract]',
  shortTitle: 'DEMA Flow [Alpha Extract]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<DemaFlowInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // dema(close, demaLength) = 2 * ema1 - ema2
  const ema1 = A(ta.ema(S(bars.map((b) => b.close)), cfg.demaLength));
  const ema2 = A(ta.ema(S(ema1), cfg.demaLength));
  const demaValue = ema1.map((e, i) => 2 * e - ema2[i]);

  // hlMedian(demaValue, hlFilterLength): from bar_index >= length - 1, the median of demaValue[0..length-1]
  // (array.sort puts na values last); before that bar the median keeps its var value (na)
  const len = cfg.hlFilterLength;
  const smooth: number[] = new Array(n);
  let median = NaN;
  for (let i = 0; i < n; i++) {
    if (i >= len - 1) {
      const w: number[] = [];
      for (let k = 0; k < len; k++) w.push(demaValue[i - k]);
      w.sort((a, b) => (isNaN(a) ? (isNaN(b) ? 0 : 1) : isNaN(b) ? -1 : a - b));
      const m = w.length;
      median = m % 2 === 1 ? w[Math.floor(m / 2)] : (w[m / 2 - 1] + w[m / 2]) / 2;
    }
    smooth[i] = median;
  }

  const atr = A(ta.atr(bars, cfg.atrLength));
  const plot0: { time: number; value: number; color: string }[] = [];
  const candles: PlotCandleData[] = [];
  const barColors: BarColorData[] = [];
  let trendSignal = 0; // var trendSignal = 0
  const trend: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const upperBand = smooth[i] + cfg.upperAtrMult * atr[i];
    const lowerBand = smooth[i] - cfg.lowerAtrMult * atr[i];
    const c = bars[i].close;
    if (gt(c, upperBand)) trendSignal = 1;
    if (lt(c, lowerBand)) trendSignal = -1;
    trend[i] = trendSignal;
    const trendColor = trendSignal === 1 ? BULL : trendSignal === -1 ? BEAR : NEUTRAL;
    const t = bars[i].time;
    plot0.push({ time: t, value: smooth[i], color: trendColor });
    // plotcandle(open, high, low, close, color = trendColor, wickcolor = trendColor, bordercolor = trendColor,
    //   force_overlay = true)
    const b = bars[i];
    candles.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close,
      color: trendColor, wickColor: trendColor, borderColor: trendColor, forceOverlay: true });
    // barcolor(trendColor, title = 'Trend Bars')
    barColors.push({ time: t, color: trendColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    plotCandles: { demaTrendCandles: candles },
    barColors,
    // bullishSignal = ta.crossover(trendSignal, 0) / bearishSignal = ta.crossunder(trendSignal, 0)
    alerts: alertStates(alertConditions, bars, [crossedOver(trend, 0), crossedUnder(trend, 0)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'DEMA Trend Bullish', message: 'DEMA Trend: Turned Bullish ▲' },
  { id: 'alert1', title: 'DEMA Trend Bearish', message: 'DEMA Trend: Turned Bearish ▼' },
];

export const DemaFlow = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
