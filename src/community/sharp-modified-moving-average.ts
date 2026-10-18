/**
 * Sharp Modified Moving Average
 *
 * SHMMA = 3 * WMA(src, length) - 2 * SMA(src, length). The line is green when the SHMMA rises (ma > ma[1]) and pink
 * otherwise. Optional bar colours, wick colours and background colours follow the SHMMA direction.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Color Change' / 'Bearish Color Change' when the line
 * takes the bullish / bearish colour, 'Any Color Change' when its colour changes (na colour of the bar before bar 0
 * compares false).
 *
 * Reference: "Sharp Modified Moving Average" by everget
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (c) 2018-present, Alex Orekhov (everget). Sharp Modified Moving Average script may be
 * freely distributed under the terms of the GPL-3.0 license.
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, BgColorData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SharpModifiedMovingAverageInputs {
  /** WMA / SMA length */
  length: number;
  src: SourceType;
  /** Colour the SHMMA by its direction */
  highlightDirection: boolean;
  /** Colour the price bars (and wicks) by the SHMMA direction */
  applyBarColors: boolean;
  /** Colour the background by the SHMMA direction */
  applyBgColors: boolean;
}

export const defaultInputs: SharpModifiedMovingAverageInputs = {
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
  { id: 'plot0', title: 'SHMMA', color: BULLISH, lineWidth: 2 },
];

export const metadata = {
  title: 'Sharp Modified Moving Average',
  shortTitle: 'SHMMA',
  overlay: true,
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<SharpModifiedMovingAverageInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src);
  const wma = ta.wma(src, cfg.length).toArray().map((v) => v ?? NaN);
  const sma = ta.sma(src, cfg.length).toArray().map((v) => v ?? NaN);

  // ma = 3 * ta.wma(src, length) - 2 * ta.sma(src, length)
  const ma = bars.map((_b, i) => 3 * wma[i] - 2 * sma[i]);

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
  { id: 'alert0', title: 'Bullish Color Change', message: 'SHMMA - Bullish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
  { id: 'alert1', title: 'Bearish Color Change', message: 'SHMMA - Bearish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
  { id: 'alert2', title: 'Any Color Change', message: 'SHMMA - Any Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
];

export const SharpModifiedMovingAverage = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
