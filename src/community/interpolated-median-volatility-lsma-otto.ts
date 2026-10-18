/**
 * Interpolated Median Volatility LSMA | Otto
 *
 * The middle line is the rolling median (linear-interpolated 50th percentile over the percentile length) of the
 * LSMA (linear regression) of the source; the band half width is the rolling median of the standard deviation of
 * the source times the multiplier. The trend turns up when the close is above the upper band (and not below the
 * lower band) and down when the close is below the lower band. Lines, band fills, candles and bar colours are green
 * in an up trend and purple in a down trend (no colour before the first signal).
 * Alerts (alertcondition, `alerts` of the result): 'IMVL long' when the trend signal crosses over 0, 'IMVL short' when
 * it crosses under 0.
 *
 * Reference: "Interpolated Median Volatility LSMA | Oquant" by oquant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © otto0
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar, type SourceType, Series } from 'oakscriptjs';
import type { BarColorData, PlotCandleData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface InterpolatedMedianVolatilityLSMAOttoInputs {
  /** Source */
  src: SourceType;
  /** LSMA length */
  lsmalen: number;
  /** Standard deviation length */
  sdlen: number;
  /** Length of the rolling medians */
  prclen: number;
  /** Band multiplier */
  mult: number;
}

export const defaultInputs: InterpolatedMedianVolatilityLSMAOttoInputs = {
  src: 'close',
  lsmalen: 30,
  sdlen: 20,
  prclen: 30,
  mult: 1.4,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'source', defval: 'close' },
  { id: 'lsmalen', type: 'int', title: 'lsma length', defval: 30 },
  { id: 'sdlen', type: 'int', title: 'sd length', defval: 20 },
  { id: 'prclen', type: 'int', title: 'percentile length', defval: 30 },
  { id: 'mult', type: 'float', title: 'multiplier', defval: 1.4, step: 0.1 },
];

const UP = color.green;
const DOWN = color.purple;

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'plot lsma', color: UP, lineWidth: 2 },
  { id: 'plot1', title: 'plot upperband', color: UP, lineWidth: 1 },
  { id: 'plot2', title: 'plot lowerband', color: UP, lineWidth: 1 },
];

/** fill(upperbandplot, lsmaplot) / fill(lowerbandplot, lsmaplot): color.new(colors, 75), per bar in the result */
export const fillConfig: FillConfig[] = [
  { id: 'fill0', plot1: 'plot1', plot2: 'plot0', color: String(color.new(UP, 75)) },
  { id: 'fill1', plot1: 'plot2', plot2: 'plot0', color: String(color.new(UP, 75)) },
];

export const metadata = {
  title: 'Interpolated Median Volatility LSMA | Oquant',
  shortTitle: 'Interpolated Median Volatility LSMA | Oquant',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<InterpolatedMedianVolatilityLSMAOttoInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; plotCandles: Record<string, PlotCandleData[]> } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = getSourceSeries(bars, cfg.src);

  const lsmaraw = ta.linreg(src, cfg.lsmalen, 0);
  const sdraw = ta.stdev(src, cfg.sdlen);
  const lsma = A(ta.percentile_linear_interpolation(lsmaraw, cfg.prclen, 50));
  const sd = A(ta.percentile_linear_interpolation(sdraw, cfg.prclen, 50));

  const upper: number[] = new Array(n);
  const lower: number[] = new Array(n);
  // colors = signal == 1 ? green : signal == -1 ? purple : na
  const colors: Array<string | null> = new Array(n);
  let signal = 0; // var signal = 0
  const signals: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    upper[i] = lsma[i] + sd[i] * cfg.mult;
    lower[i] = lsma[i] - sd[i] * cfg.mult;
    const long = gt(bars[i].close, upper[i]);
    const short = lt(bars[i].close, lower[i]);
    if (long && !short) signal = 1;
    if (short) signal = -1;
    signals[i] = signal;
    colors[i] = signal === 1 ? UP : signal === -1 ? DOWN : null;
  }

  const t = (i: number) => bars[i].time;
  const plotColor = (i: number) => colors[i] ?? 'transparent';
  // color.new(na, 75) is black with transparency 75
  const fillColors = colors.map((c) => String(color.new(c ?? '#000000', 75)));
  const candles: PlotCandleData[] = bars.map((b, i) => ({
    time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
    color: plotColor(i), borderColor: plotColor(i), wickColor: plotColor(i),
  }));
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const c = colors[i];
    if (c !== null) barColors.push({ time: t(i), color: c });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: lsma.map((v, i) => ({ time: t(i), value: v, color: plotColor(i) })),
      plot1: upper.map((v, i) => ({ time: t(i), value: v, color: plotColor(i) })),
      plot2: lower.map((v, i) => ({ time: t(i), value: v, color: plotColor(i) })),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot0', colors: fillColors },
      { plot1: 'plot2', plot2: 'plot0', colors: fillColors },
    ],
    // plotcandle(open, high, low, close, "bar color", colors, colors, colors, force_overlay = true)
    plotCandles: { barColorCandles: candles },
    barColors,
    // alertcondition(ta.crossover(signal, 0), "IMVL long", ...) / alertcondition(ta.crossunder(signal, 0), "IMVL short", ...)
    alerts: alertStates(alertConditions, bars, [crossedOver(signals, 0), crossedUnder(signals, 0)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'IMVL long', message: 'IMVL long {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'IMVL short', message: 'IMVL short {{exchange}}:{{ticker}}' },
];

export const InterpolatedMedianVolatilityLSMAOtto = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  fillConfig,
  alertConditions,
};
