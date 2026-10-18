/**
 * Percentile-Based BB% Trend - Mattes
 *
 * A %B oscillator on percentile bands: the basis is the mean of the 25th and 75th percentiles (linear
 * interpolation) of the source over `length` bars; the bands are basis +/- mult * MAD, with
 * MAD = median(|source - median(source, length)|, length). %B = (source - lower) / (upper - lower) is smoothed by an
 * EMA and drawn as columns: light blue when above 0 and rising, blue when above 0 and falling, purple when below 0
 * and falling, dark purple when below 0 and rising (the colour is kept when the value does not change). The price
 * candles are redrawn blue when the trend is above 0, purple otherwise.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Trend Shift' / 'Bearish Trend Shift' when the trend
 * crosses over / under 0.
 *
 * Reference: "Percentile-Based BB% Trend - Mattes" by Mattes00
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { PlotCandleData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PercentileBasedBbTrendMattesInputs {
  /** Lookback length of the percentiles and medians */
  length: number;
  /** MAD multiplier */
  mult: number;
  source: SourceType;
  /** EMA smoothing length of the trend line */
  smoothLength: number;
}

export const defaultInputs: PercentileBasedBbTrendMattesInputs = {
  length: 36,
  mult: 0.15,
  source: 'close',
  smoothLength: 9,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Lookback Length', defval: 36, min: 1 },
  { id: 'mult', type: 'float', title: 'MAD Multiplier', defval: 0.15, min: 0.05, step: 0.05 },
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'smoothLength', type: 'int', title: 'EMA Smoothing Length for Trend Line', defval: 9, min: 1 },
];

const BULL = String(color.rgb(45, 162, 252));
const BEAR = String(color.rgb(113, 59, 249));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'pb_trend', color: '#4caf50', lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'Percentile-Based BB% Trend - Mattes',
  shortTitle: 'PBB% Trend',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** Division: Pine x / 0 is +-Infinity, but pb_percent only feeds ta.ema, which skips an infinite value as na */
const div = (x: number, y: number) => (y === 0 ? NaN : x / y);

export function calculate(
  bars: Bar[],
  inputs: Partial<PercentileBasedBbTrendMattesInputs> = {},
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const srcSeries = getSourceSeries(bars, cfg.source);
  const src = A(srcSeries);

  const p25 = A(ta.percentile_linear_interpolation(srcSeries, cfg.length, 25));
  const p75 = A(ta.percentile_linear_interpolation(srcSeries, cfg.length, 75));
  const med = A(ta.median(srcSeries, cfg.length));
  // mad = ta.median(math.abs(source - ta.median(source, length)), length)
  const mad = A(ta.median(S(src.map((v, i) => Math.abs(v - med[i]))), cfg.length));
  const pb = bars.map((_b, i) => {
    const basis = (p25[i] + p75[i]) / 2;
    const dev = cfg.mult * mad[i];
    const upper = basis + dev;
    const lower = basis - dev;
    return div(src[i] - lower, upper - lower);
  });
  const pbTrend = A(ta.ema(S(pb), cfg.smoothLength));

  const plot0: { time: number; value: number; color: string }[] = [];
  const candles: PlotCandleData[] = [];
  let col = '#4caf50'; // var color col = #4caf50
  for (let i = 0; i < n; i++) {
    const v = pbTrend[i];
    const prev = i > 0 ? pbTrend[i - 1] : NaN;
    const positiveChange = gt(v, prev);
    const negativeChange = lt(v, prev);
    if (gt(v, 0) && positiveChange) col = BULL;
    if (gt(v, 0) && negativeChange) col = '#1095fa';
    if (lt(v, 0) && negativeChange) col = BEAR;
    if (lt(v, 0) && positiveChange) col = '#5418eb';
    plot0.push({ time: bars[i].time, value: v, color: col });
    // plotcandle(open, high, low, close, 'BarColor', syscol, syscol, syscol, force_overlay = true)
    const syscol = gt(v, 0) ? BULL : BEAR;
    const b = bars[i];
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
      color: syscol, wickColor: syscol, borderColor: syscol, forceOverlay: true });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines: [
      { value: 0, options: { title: 'Midline', color: String(color.new(color.white, 60)), linestyle: 'dotted' } },
    ],
    plotCandles: { BarColor: candles },
    // alertcondition(ta.crossover(pb_trend, 0)) / alertcondition(ta.crossunder(pb_trend, 0))
    alerts: alertStates(alertConditions, bars, [crossedOver(pbTrend, 0), crossedUnder(pbTrend, 0)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Shift', message: 'PBB% Trend crossing above midline' },
  { id: 'alert1', title: 'Bearish Trend Shift', message: 'PBB% Trend crossing below midline' },
];

export const PercentileBasedBbTrendMattes = {
  alertConditions,
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
