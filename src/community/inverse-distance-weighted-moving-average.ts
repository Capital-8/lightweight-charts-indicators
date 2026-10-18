/**
 * Inverse Distance Weighted Moving Average
 *
 * A weighted average of the last `length` source values. The weight of each value is the sum of its absolute
 * distances to all other values of the window: IDWMA = sum(src[i] * w[i]) / sum(w[i]), w[i] = sum_j |src[i] - src[j]|.
 * A missing older value (first bars) is replaced by the current source; a flat window (all weights zero) gives the
 * source. The line is green when the IDWMA rises and pink when it falls. Optional bar colours, wick colours and
 * background colours follow the IDWMA direction.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Color Change' / 'Bearish Color Change' when the line turns
 * green / pink, 'Any Color Change' when its colour changes (from the second bar).
 *
 * Reference: "Inverse Distance Weighted Moving Average" by everget
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (c) 2019-present, Alex Orekhov (everget). Inverse Distance Weighted Moving Average
 * script may be freely distributed under the GPL-3.0 license.
 */

import { getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, BgColorData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface InverseDistanceWeightedMovingAverageInputs {
  /** Number of bars in the window */
  length: number;
  src: SourceType;
  /** Colour the IDWMA by its direction */
  highlightDirection: boolean;
  /** Colour the price bars (and wicks) by the IDWMA direction */
  applyBarColors: boolean;
  /** Colour the background by the IDWMA direction */
  applyBgColors: boolean;
}

export const defaultInputs: InverseDistanceWeightedMovingAverageInputs = {
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
  { id: 'plot0', title: 'IDWMA', color: BULLISH, lineWidth: 2 },
];

export const metadata = {
  title: 'Inverse Distance Weighted Moving Average',
  shortTitle: 'IDWMA',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10; a != b only when |a - b| > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;
const ne = (a: number, b: number) => Math.abs(a - b) > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<InverseDistanceWeightedMovingAverageInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);

  const ma: number[] = new Array(n);
  const weights: number[] = new Array(len).fill(0);
  for (let b = 0; b < n; b++) {
    // nz(src[i], src): na (before the first bar, or an na source) is replaced by the current source
    const at = (i: number) => {
      const v = b - i >= 0 ? src[b - i] : NaN;
      return isNaN(v) ? src[b] : v;
    };
    weights.fill(0);
    // Each unordered pair once; the distance is added to both taps (Pine order)
    if (len > 1) {
      for (let i = 0; i <= len - 2; i++) {
        for (let j = i + 1; j <= len - 1; j++) {
          const d = Math.abs(at(i) - at(j));
          weights[i] = weights[i] + d;
          weights[j] = weights[j] + d;
        }
      }
    }
    let sum = 0.0;
    let weightSum = 0.0;
    for (let i = 0; i < len; i++) {
      sum += at(i) * weights[i];
      weightSum += weights[i];
    }
    // ma = weightSum != 0 ? sum / weightSum : src
    ma[b] = ne(weightSum, 0) ? sum / weightSum : src[b];
  }

  const plot0: { time: number; value: number; color: string }[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const candles: PlotCandleData[] = [];
  const maColors: string[] = [];
  for (let b = 0; b < n; b++) {
    const t = bars[b].time;
    const bull = b > 0 && gt(ma[b], ma[b - 1]); // isBullishSlope = ma > ma[1]
    const maColor = cfg.highlightDirection ? (bull ? BULLISH : BEARISH) : NEUTRAL;
    maColors.push(maColor);
    plot0.push({ time: t, value: Number.isFinite(ma[b]) ? ma[b] : NaN, color: maColor });
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

  // bullishColorChangeAlert = maColor[1] != bullishColor and maColor == bullishColor; bearish the same;
  // anyColorChangeAlert = maColor != maColor[1] (maColor[1] is na on the first bar)
  const bullFlags = maColors.map((c, b) => b > 0 && maColors[b - 1] !== BULLISH && c === BULLISH);
  const bearFlags = maColors.map((c, b) => b > 0 && maColors[b - 1] !== BEARISH && c === BEARISH);
  const anyFlags = maColors.map((c, b) => b > 0 && c !== maColors[b - 1]);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    barColors,
    bgColors,
    plotCandles: { wickCandles: candles },
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags, anyFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Color Change', message: 'IDWMA - Bullish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
  { id: 'alert1', title: 'Bearish Color Change', message: 'IDWMA - Bearish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
  { id: 'alert2', title: 'Any Color Change', message: 'IDWMA - Any Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
];

export const InverseDistanceWeightedMovingAverage = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
