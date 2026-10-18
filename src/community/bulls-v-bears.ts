/**
 * Bulls v Bears
 *
 * Bull pressure (high - MA) and bear pressure (MA - low) around an EMA / SMA / WMA of the close. "Normalized": each
 * pressure is scaled to -50..50 over its range of the last bars and the histogram is their difference (-100..100),
 * with fixed thresholds at +/- line height. "Raw": the histogram is bulls - bears, with thresholds at a percentile
 * of its rolling range. Dots mark the bars above the upper / below the lower threshold.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Crossover' (above the upper threshold), 'Bearish
 * Crossover' (below the lower threshold), 'Total Crossover' and 'Bearish Zero Cross' (histogram crosses above / below 0).
 *
 * Reference: "Bulls v Bears" by Mihkel00
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Crossover', message: 'Bullish overbought' },
  { id: 'alert1', title: 'Bearish Crossover', message: 'Bearish oversold' },
  { id: 'alert2', title: 'Total Crossover', message: 'BvB total crossover' },
  { id: 'alert3', title: 'Bearish Zero Cross', message: 'Bulls v Bears: Bearish zero line cross' },
];

export interface BullsVBearsInputs {
  /** BvB period (MA length) */
  len: number;
  maType: 'EMA' | 'SMA' | 'WMA';
  normType: 'Normalized' | 'Raw';
  /** Range length of the Normalized method */
  barsBack: number;
  /** Rolling period of the Raw thresholds */
  rawLookback: number;
  /** Percentile of the Raw thresholds */
  rawPercentile: number;
  /** Threshold of the Normalized method */
  tline: number;
  showThresholdLines: boolean;
  bullColor: string;
  bearColor: string;
  showSignals: boolean;
  bullishDotColor: string;
  bearishDotColor: string;
}

export const defaultInputs: BullsVBearsInputs = {
  len: 14,
  maType: 'EMA',
  normType: 'Normalized',
  barsBack: 120,
  rawLookback: 50,
  rawPercentile: 95,
  tline: 80,
  showThresholdLines: true,
  bullColor: String(color.new(color.green, 20)),
  bearColor: String(color.new(color.red, 20)),
  showSignals: true,
  bullishDotColor: '#ff00d4',
  bearishDotColor: '#eeff00',
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'BvB Period', defval: 14, min: 1 },
  { id: 'maType', type: 'string', title: 'Moving Average Type', defval: 'EMA', options: ['EMA', 'SMA', 'WMA'] },
  { id: 'normType', type: 'string', title: 'Calculation Method', defval: 'Normalized', options: ['Normalized', 'Raw'] },
  { id: 'barsBack', type: 'int', title: 'Normalized Bars Back', defval: 120, min: 1 },
  { id: 'rawLookback', type: 'int', title: 'Raw Rolling Period', defval: 50, min: 10 },
  { id: 'rawPercentile', type: 'float', title: 'Raw Threshold Percentile', defval: 95, min: 80, max: 99 },
  { id: 'tline', type: 'float', title: 'Line Height', defval: 80, min: 0, max: 100 },
  { id: 'showThresholdLines', type: 'bool', title: 'Show Threshold Lines', defval: true },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: String(color.new(color.green, 20)) },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: String(color.new(color.red, 20)) },
  { id: 'showSignals', type: 'bool', title: 'Show Signal Dots', defval: true },
  { id: 'bullishDotColor', type: 'color', title: 'Bullish Signal Color', defval: '#ff00d4' },
  { id: 'bearishDotColor', type: 'color', title: 'Bearish Signal Color', defval: '#eeff00' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'BvB', color: String(color.new(color.green, 20)), lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Upper Threshold (Raw)', color: String(color.new(color.gray, 50)), lineWidth: 1 },
  { id: 'plot2', title: 'Lower Threshold (Raw)', color: String(color.new(color.gray, 50)), lineWidth: 1 },
];

export const metadata = {
  title: 'Bulls v Bears v6',
  shortTitle: 'BvB v6',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** Pine division: x / 0 is na */
const div = (a: number, b: number) => (b === 0 ? NaN : a / b);

export function calculate(
  bars: Bar[],
  inputs: Partial<BullsVBearsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));

  // ma = switch ma_type: "EMA" => ta.ema, "SMA" => ta.sma, "WMA" => ta.wma, => ta.ema
  const ma = A(cfg.maType === 'SMA' ? ta.sma(close, cfg.len) : cfg.maType === 'WMA' ? ta.wma(close, cfg.len) : ta.ema(close, cfg.len));
  const bulls = bars.map((b, i) => b.high - ma[i]);
  const bears = bars.map((b, i) => ma[i] - b.low);

  let total: number[];
  if (cfg.normType === 'Normalized') {
    const minBulls = A(ta.lowest(S(bulls), cfg.barsBack));
    const maxBulls = A(ta.highest(S(bulls), cfg.barsBack));
    const minBears = A(ta.lowest(S(bears), cfg.barsBack));
    const maxBears = A(ta.highest(S(bears), cfg.barsBack));
    total = bars.map((_b, i) => {
      const normBulls = (div(bulls[i] - minBulls[i], maxBulls[i] - minBulls[i]) - 0.5) * 100;
      const normBears = (div(bears[i] - minBears[i], maxBears[i] - minBears[i]) - 0.5) * 100;
      return normBulls - normBears;
    });
  } else {
    total = bulls.map((v, i) => v - bears[i]);
  }

  // Raw percentile thresholds
  const rawHighest = A(ta.highest(S(total), cfg.rawLookback));
  const rawLowest = A(ta.lowest(S(total), cfg.rawLookback));
  const upper: number[] = new Array(n);
  const lower: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const rawRange = rawHighest[i] - rawLowest[i];
    const rawUpper = rawLowest[i] + rawRange * (cfg.rawPercentile / 100);
    const rawLower = rawLowest[i] + rawRange * ((100 - cfg.rawPercentile) / 100);
    upper[i] = cfg.normType === 'Normalized' ? cfg.tline : rawUpper;
    lower[i] = cfg.normType === 'Normalized' ? -cfg.tline : rawLower;
  }

  const markers: MarkerData[] = [];
  const raw = cfg.normType === 'Raw' && cfg.showThresholdLines;
  const thresholdColor = String(color.new(color.gray, 50));
  // bullish_o = total > upper_threshold; bearish_o = total < lower_threshold
  const bullishO = total.map((v, i) => gt(v, upper[i]));
  const bearishO = total.map((v, i) => lt(v, lower[i]));
  for (let i = 0; i < n; i++) {
    // plotshape(show_signals and bullish_o, shape.circle, location.top, ...); bearish_o: location.bottom.
    if (cfg.showSignals && bullishO[i]) {
      markers.push({ time: bars[i].time, position: 'top', shape: 'circle', color: cfg.bullishDotColor, size: 'auto' });
    }
    if (cfg.showSignals && bearishO[i]) {
      markers.push({ time: bars[i].time, position: 'bottom', shape: 'circle', color: cfg.bearishDotColor, size: 'auto' });
    }
  }

  // hline(norm_type == "Normalized" and show_threshold_lines ? tline / -tline : na): an na hline is not drawn
  const hlineOptions = { color: thresholdColor, linestyle: 'dotted' as const };
  const hlines = cfg.normType === 'Normalized' && cfg.showThresholdLines
    ? [
      { value: cfg.tline, options: { title: 'Upper Threshold', ...hlineOptions } },
      { value: -cfg.tline, options: { title: 'Lower Threshold', ...hlineOptions } },
    ]
    : [];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(total, color = total >= 0 ? bull_color : bear_color, style = plot.style_columns, title = "BvB")
      plot0: bars.map((b, i) => ({ time: b.time, value: total[i], color: ge(total[i], 0) ? cfg.bullColor : cfg.bearColor })),
      // plot(norm_type == "Raw" and show_threshold_lines ? upper_threshold / lower_threshold : na)
      plot1: bars.map((b, i) => ({ time: b.time, value: raw ? upper[i] : NaN, color: thresholdColor })),
      plot2: bars.map((b, i) => ({ time: b.time, value: raw ? lower[i] : NaN, color: thresholdColor })),
    },
    hlines,
    markers,
    // alertcondition(bullish_o) / (bearish_o) / (ta.crossover(total, 0)) / (ta.crossunder(total, 0))
    alerts: alertStates(alertConditions, bars, [bullishO, bearishO, crossedOver(total, 0), crossedUnder(total, 0)]),
  };
}

export const BullsVBears = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
