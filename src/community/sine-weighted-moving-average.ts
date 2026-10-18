/**
 * Sine Weighted Moving Average
 *
 * A weighted moving average whose weights follow a half sine wave: the bar i bars ago has the weight
 * sin((i + 1) * pi / (length + 1)), so the middle of the window weighs most. SWMA = sum(src[i] * w(i)) / sum(w);
 * a missing older value (first bars) is replaced by the current source. The line is green when the SWMA rises and
 * pink when it falls. Optional bar colours, wick colours and background colours follow the SWMA direction.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Color Change' / 'Bearish Color Change' when the line
 * takes the bullish / bearish colour, 'Any Color Change' when its colour changes (na colour of the bar before bar 0
 * compares false).
 *
 * Reference: "Sine Weighted Moving Average" by everget
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (c) 2018-present, Alex Orekhov (everget). Sine Weighted Moving Average script may be
 * freely distributed under the terms of the GPL-3.0 license.
 */

import { getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, BgColorData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SineWeightedMovingAverageInputs {
  /** Number of bars */
  length: number;
  src: SourceType;
  /** Colour the SWMA by its direction */
  highlightDirection: boolean;
  /** Colour the price bars (and wicks) by the SWMA direction */
  applyBarColors: boolean;
  /** Colour the background by the SWMA direction */
  applyBgColors: boolean;
}

export const defaultInputs: SineWeightedMovingAverageInputs = {
  length: 14,
  src: 'close',
  highlightDirection: true,
  applyBarColors: true,
  applyBgColors: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 14, min: 1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'highlightDirection', type: 'bool', title: 'Highlight Direction', defval: true },
  { id: 'applyBarColors', type: 'bool', title: 'Apply Bar Colors', defval: true },
  { id: 'applyBgColors', type: 'bool', title: 'Apply Background Colors', defval: false },
];

const BULLISH = '#09b71e';
const BEARISH = '#e91e63';
const NEUTRAL = '#512da8';
const BULLISH_BAR = String(color.new(BULLISH, 50));
const BEARISH_BAR = String(color.new(BEARISH, 50));
const BULLISH_BG = String(color.new(BULLISH, 88));
const BEARISH_BG = String(color.new(BEARISH, 88));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SWMA', color: BULLISH, lineWidth: 2 },
];

export const metadata = {
  title: 'Sine Weighted Moving Average',
  shortTitle: 'SWMA',
  overlay: true,
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<SineWeightedMovingAverageInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { length } = cfg;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);

  // Weights built once: w(i) = sin((i + 1) * pi / (length + 1)), i = 0 (newest bar) .. length - 1
  const weights: number[] = [];
  let weightSum = 0.0;
  for (let i = 0; i < length; i++) {
    const weight = Math.sin(((i + 1) * Math.PI) / (length + 1));
    weights.push(weight);
    weightSum += weight;
  }

  const ma: number[] = new Array(n);
  for (let b = 0; b < n; b++) {
    let sum = 0.0;
    for (let i = 0; i < length; i++) {
      // nz(src[i], src): na (before the first bar, or an na source) is replaced by the current source
      const v = b - i >= 0 ? src[b - i] : NaN;
      sum += (isNaN(v) ? src[b] : v) * weights[i];
    }
    ma[b] = sum / weightSum;
  }

  const plot0: { time: number; value: number; color: string }[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const candles: PlotCandleData[] = [];
  const flags: boolean[][] = [[], [], []];
  let prevColor = '';
  for (let b = 0; b < n; b++) {
    const t = bars[b].time;
    const bull = b > 0 && gt(ma[b], ma[b - 1]); // isBullishSlope = ma > ma[1]
    const maColor = cfg.highlightDirection ? (bull ? BULLISH : BEARISH) : NEUTRAL;
    plot0.push({ time: t, value: Number.isFinite(ma[b]) ? ma[b] : NaN, color: maColor });
    // bullishColorChangeAlert = maColor[1] != bullishColor and maColor == bullishColor; bearish alike;
    // anyColorChangeAlert = maColor != maColor[1] (maColor[1] is na on bar 0: false)
    flags[0].push(b > 0 && prevColor !== BULLISH && maColor === BULLISH);
    flags[1].push(b > 0 && prevColor !== BEARISH && maColor === BEARISH);
    flags[2].push(b > 0 && maColor !== prevColor);
    prevColor = maColor;
    if (cfg.applyBarColors) barColors.push({ time: t, color: bull ? BULLISH_BAR : BEARISH_BAR });
    // plotcandle(open, high, low, close, 'Bar Color', color = na, wickcolor = maWickColor, bordercolor = na,
    //   display = display.pane): only the wicks are drawn (none when Apply Bar Colors is off)
    const bar = bars[b];
    candles.push({
      time: t, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      color: 'transparent', borderColor: 'transparent',
      wickColor: cfg.applyBarColors ? (bull ? BULLISH : BEARISH) : 'transparent',
    });
    if (cfg.applyBgColors) bgColors.push({ time: t, color: bull ? BULLISH_BG : BEARISH_BG });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    barColors,
    bgColors,
    plotCandles: { wickCandles: candles },
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Color Change', message: 'SWMA - Bullish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
  { id: 'alert1', title: 'Bearish Color Change', message: 'SWMA - Bearish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
  { id: 'alert2', title: 'Any Color Change', message: 'SWMA - Any Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
];

export const SineWeightedMovingAverage = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
