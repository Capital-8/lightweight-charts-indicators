/**
 * Quartile For Loop
 *
 * Weighted quartile of the source over `Quartile Length` bars: (Q1 + 2 * median + Q3) / 4 with nearest-rank
 * percentiles. The score sums +1 / -1 for i = Loop Start to Loop End: +1 when the source is above the weighted
 * quartile i bars ago (alternate signal: when the current weighted quartile is above it). The trend is long when the
 * score is above the uptrend threshold and short when it is below the downtrend threshold; the score line, an SMA(14)
 * of the close on the price pane and optionally the candles take the trend colour. Labels on the price pane mark the
 * changes to the up / down state of the score (7.5 % below / above the weighted quartile).
 * Alerts (alertcondition, `alerts` of the result): 'Quartile For-Loop Postive Trend' / 'Quartile For-Loop Negative
 * Trend', true on every bar of the long / short signal state.
 *
 * Reference: "Quartile For Loop [SeerQuant]" by SeerQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © SeerQuant
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Quartile For-Loop Postive Trend', message: 'Quartile For-Loop Bullish Signal on: {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Quartile For-Loop Negative Trend', message: 'Quartile For-Loop Bearish Signal on: {{exchange}}:{{ticker}}' },
];

export type QuartileForLoopColorScheme = 'Default' | 'Modern' | 'Cool' | 'Alternate' | 'Bright';

export interface QuartileForLoopInputs {
  /** Quartile length */
  qLength: number;
  /** Calculation source */
  src: SourceType;
  /** Alternate signal: compare the current weighted quartile (not the source) with its past values */
  typeSig: boolean;
  /** Loop start */
  sl: number;
  /** Loop end */
  el: number;
  /** Threshold uptrend */
  thrUp: number;
  /** Threshold downtrend */
  thrDown: number;
  /** Colour the candles */
  paint: boolean;
  colScheme: QuartileForLoopColorScheme;
}

export const defaultInputs: QuartileForLoopInputs = {
  qLength: 14,
  src: 'close',
  typeSig: false,
  sl: 5,
  el: 55,
  thrUp: 35,
  thrDown: -5,
  paint: false,
  colScheme: 'Default',
};

export const inputConfig: InputConfig[] = [
  { id: 'qLength', type: 'int', title: 'Quartile Length', defval: 14 },
  { id: 'src', type: 'source', title: 'Calculation Source', defval: 'close' },
  { id: 'typeSig', type: 'bool', title: 'Use Alternate Signal?', defval: false },
  { id: 'sl', type: 'int', title: 'Loop Start', defval: 5 },
  { id: 'el', type: 'int', title: 'Loop End', defval: 55 },
  { id: 'thrUp', type: 'float', title: 'Threshold Uptrend', defval: 35 },
  { id: 'thrDown', type: 'float', title: 'Threshold Downtrend', defval: -5 },
  { id: 'paint', type: 'bool', title: 'Colour Candles?', defval: false },
  { id: 'colScheme', type: 'string', title: 'Color Scheme', defval: 'Default', options: ['Default', 'Modern', 'Cool', 'Alternate', 'Bright'] },
];

/** [bull, bear, neutral] per colour scheme */
const SCHEMES: Record<QuartileForLoopColorScheme, [string, string, string]> = {
  Default: ['#00ff73', '#ff0040', '#606060'],
  Modern: ['#23d7e4', '#e11179', '#707070'],
  Cool: ['#00ffcc', '#4e4f75', '#505050'],
  Alternate: ['#00ff80', '#ff6600', '#505050'],
  Bright: ['#e8ec00', '#f200fa', '#505050'],
};

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Score', color: '#606060', lineWidth: 3 },
  { id: 'plot1', title: 'Threshold Uptrend', color: String(color.new('#00ff73', 50)), lineWidth: 2 },
  { id: 'plot2', title: 'Threshold Downtrend', color: String(color.new('#ff0040', 50)), lineWidth: 2 },
  // Pine force_overlay = true: the SMA is drawn on the price pane
  { id: 'plot3', title: 'SMA', color: '#606060', lineWidth: 4, forceOverlay: true },
];

export const metadata = {
  title: 'Quartile For Loop [SeerQuant]',
  shortTitle: 'QFL [SeerQuant]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<QuartileForLoopInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const [bull, bear, neutral] = SCHEMES[cfg.colScheme] ?? SCHEMES.Default;

  const srcS = getSourceSeries(bars, cfg.src);
  const src = A(srcS);
  // f_quartile: (Q1 + 2 * median + Q3) / 4 with ta.percentile_nearest_rank
  const q1 = A(ta.percentile_nearest_rank(srcS, cfg.qLength, 25));
  const med = A(ta.percentile_nearest_rank(srcS, cfg.qLength, 50));
  const q3 = A(ta.percentile_nearest_rank(srcS, cfg.qLength, 75));
  const aq = q1.map((v, i) => (v + 2 * med[i] + q3[i]) / 4);
  const sma = A(ta.sma(Series.fromArray(bars, bars.map((b) => b.close)), 14));

  const score: number[] = new Array(n);
  const histColor: string[] = new Array(n);
  const markers: MarkerData[] = [];
  const signals: number[] = new Array(n);
  let signal = 0; // var signal = 0
  let prevTrendState = 0; // var int prevTrendState = 0
  for (let b = 0; b < n; b++) {
    // calcScore(sl, el, adaptive_quartile, typeSig): sum of (x > val[i] ? 1 : -1) for i = sl to el
    // (x = src, or the current quartile with the alternate signal; val[i] before bar 0 is na: -1)
    const x = cfg.typeSig ? aq[b] : src[b];
    let sum = 0;
    const step = cfg.sl <= cfg.el ? 1 : -1;
    for (let i = cfg.sl; step > 0 ? i <= cfg.el : i >= cfg.el; i += step) {
      const past = b - i >= 0 && b - i < n ? aq[b - i] : NaN;
      sum += gt(x, past) ? 1 : -1;
    }
    score[b] = sum;

    const goLong = gt(sum, cfg.thrUp);
    const goShort = lt(sum, cfg.thrDown);
    if (goLong && !goShort) signal = 1;
    if (goShort) signal = -1;
    signals[b] = signal;
    histColor[b] = signal === 1 ? bull : signal === -1 ? bear : neutral;

    // currentTrendState: 1 above thrUp, -1 below thrDown, else 0
    const current = gt(sum, cfg.thrUp) ? 1 : lt(sum, cfg.thrDown) ? -1 : 0;
    const bullishTransition = prevTrendState !== 1 && current === 1;
    const bearishTransition = prevTrendState !== -1 && current === -1;
    if (bullishTransition || bearishTransition) prevTrendState = current;

    const t = bars[b].time;
    // plotshape(bullishTransition ? aq - aq * 0.075 : na, shape.labelup, location.absolute, color = bull,
    //   text = "▲", textcolor = #000000, size.small, force_overlay = true)
    const lo = aq[b] - aq[b] * 0.075;
    if (bullishTransition && !isNaN(lo)) {
      markers.push({ time: t, position: 'atPriceBottom', price: lo, shape: 'labelUp', color: bull, text: '▲',
        textColor: '#000000', size: 'small', forceOverlay: true });
    }
    // plotshape(bearishTransition ? aq + aq * 0.075 : na, shape.labeldown, ..., color = bear, text = "▼")
    const hi = aq[b] + aq[b] * 0.075;
    if (bearishTransition && !isNaN(hi)) {
      markers.push({ time: t, position: 'atPriceTop', price: hi, shape: 'labelDown', color: bear, text: '▼',
        textColor: '#000000', size: 'small', forceOverlay: true });
    }
  }

  const upCol = String(color.new(bull, 50));
  const downCol = String(color.new(bear, 50));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(score, color = color.new(hist_color, 0), linewidth = 3)
      plot0: bars.map((b, i) => ({ time: b.time, value: score[i], color: histColor[i] })),
      // plot(thrUp, color = color.new(bull, 50), linewidth = 2)
      plot1: bars.map((b) => ({ time: b.time, value: cfg.thrUp, color: upCol })),
      // plot(thrDown, color = color.new(bear, 50), linewidth = 2)
      plot2: bars.map((b) => ({ time: b.time, value: cfg.thrDown, color: downCol })),
      // plot(sma, color = hist_color, linewidth = 4, force_overlay = true)
      plot3: bars.map((b, i) => ({ time: b.time, value: sma[i], color: histColor[i] })),
    },
    markers,
    // barcolor(paint ? hist_color : na)
    barColors: cfg.paint ? bars.map((b, i) => ({ time: b.time, color: histColor[i] })) : [],
    // alertcondition(signal == 1) / alertcondition(signal == -1)
    alerts: alertStates(alertConditions, bars, [signals.map((v) => v === 1), signals.map((v) => v === -1)]),
  };
}

export const QuartileForLoop = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
