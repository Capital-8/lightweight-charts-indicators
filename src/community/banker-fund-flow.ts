/**
 * Banker Fund Flow Trend Oscillator
 *
 * Models institutional fund flow using a weighted simple average normalization
 * combined with EMA smoothing. Computes two series: fund flow trend and bull/bear line (drawn as candles only).
 * Fund flow trend = double-smoothed stochastic-like normalization over 27 bars.
 * Bull/bear line = EMA(13) of typical price normalized over 34-bar highest/lowest.
 * Entry signal fires when fund_flow crosses above bull_bear and bull_bear < 25.
 * Candles, as the original's five plotcandle outputs (in their order, each drawn on the bars where its colour is not
 * na): yellow 0..50 entry candle; green (fund flow above the bull bear line), white (fund flow below 95 % of the
 * previous fund flow), red (fund flow below the line) and blue (below the line and above 95 % of the previous fund
 * flow) candles from the fund flow to the bull bear line.
 * Alerts (alertcondition, `alerts` of the result): one per candle colour, with the candle's condition.
 * No entry markers: the original shows the entry as the yellow candle only.
 *
 * Reference: "[blackcat] L3 Banker Fund Flow Trend Oscillator"
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface BankerFundFlowInputs {
  normLength: number;
  typicalLength: number;
  emaLength: number;
  entryThreshold: number;
}

export const defaultInputs: BankerFundFlowInputs = {
  normLength: 27,
  typicalLength: 34,
  emaLength: 13,
  entryThreshold: 25,
};

export const inputConfig: InputConfig[] = [
  { id: 'normLength', type: 'int', title: 'Normalization Length', defval: 27, min: 2 },
  { id: 'typicalLength', type: 'int', title: 'Typical Price Length', defval: 34, min: 2 },
  { id: 'emaLength', type: 'int', title: 'EMA Length', defval: 13, min: 1 },
  { id: 'entryThreshold', type: 'int', title: 'Entry Threshold', defval: 25, min: 1 },
];

// No line plots: the original draws the fund flow and the bull bear line only as its candles
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Banker Fund Flow Trend Oscillator',
  shortTitle: 'BankerFlow',
  overlay: false,
};

/**
 * PineScript calculate_weighted_simple_average:
 *   sum_float := nz(sum_float[1]) - nz(src[length]) + src
 *   moving_average := na(src[length]) ? na : sum_float / length
 *   output := na(output[1]) ? moving_average : (src * weight + output[1] * (length - weight)) / length
 *
 * This is a stateful running sum + weighted EMA-like smoothing.
 */
function calcWeightedSimpleAverage(srcArr: number[], length: number, weight: number): number[] {
  const n = srcArr.length;
  const output: number[] = new Array(n);
  let sumFloat = 0;
  let prevOutput = NaN;

  for (let i = 0; i < n; i++) {
    const src = srcArr[i];
    const srcLag = i >= length ? srcArr[i - length] : NaN;

    // nz(sum_float[1]) - nz(src[length]) + src
    sumFloat = (isNaN(sumFloat) ? 0 : sumFloat) - (isNaN(srcLag) ? 0 : srcLag) + src;

    // moving_average := na(src[length]) ? na : sum_float / length
    const movingAverage = (i < length || isNaN(srcLag)) ? NaN : sumFloat / length;

    // output := na(output[1]) ? moving_average : (src * weight + output[1] * (length - weight)) / length
    if (isNaN(prevOutput)) {
      output[i] = movingAverage;
    } else {
      output[i] = (src * weight + prevOutput * (length - weight)) / length;
    }

    prevOutput = output[i];
  }

  return output;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<BankerFundFlowInputs> = {},
): Omit<IndicatorResult, 'markers'> & { plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const { normLength, typicalLength, emaLength, entryThreshold } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const lowSeries = new Series(bars, (b) => b.low);
  const highSeries = new Series(bars, (b) => b.high);

  // Highest/lowest over normLength (27) for stochastic normalization
  const hhNorm = ta.highest(highSeries, normLength).toArray();
  const llNorm = ta.lowest(lowSeries, normLength).toArray();

  // Raw stochastic normalization: (close - lowest(low, 27)) / (highest(high, 27) - lowest(low, 27)) * 100
  const rawNorm: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const h = hhNorm[i];
    const l = llNorm[i];
    if (h == null || isNaN(h) || l == null || isNaN(l) || h === l) {
      rawNorm[i] = NaN;
    } else {
      rawNorm[i] = ((bars[i].close - l) / (h - l)) * 100;
    }
  }

  // fund_flow_trend = (3 * WSA(rawNorm, 5, 1) - 2 * WSA(WSA(rawNorm, 5, 1), 3, 1) - 50) * 1.032 + 50
  const wsa1 = calcWeightedSimpleAverage(rawNorm, 5, 1);
  const wsa2 = calcWeightedSimpleAverage(wsa1, 3, 1);

  const fundFlowTrend: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const w1 = wsa1[i];
    const w2 = wsa2[i];
    if (isNaN(w1) || isNaN(w2)) {
      fundFlowTrend[i] = NaN;
    } else {
      fundFlowTrend[i] = (3 * w1 - 2 * w2 - 50) * 1.032 + 50;
    }
  }

  // Bull bear line: EMA((typical_price - lowest_low_34) / (highest_high_34 - lowest_low_34) * 100, 13)
  const typicalPrice: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    typicalPrice[i] = (2 * bars[i].close + bars[i].high + bars[i].low + bars[i].open) / 5;
  }

  const hhTyp = ta.highest(highSeries, typicalLength).toArray();
  const llTyp = ta.lowest(lowSeries, typicalLength).toArray();

  const normTypical: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const h = hhTyp[i];
    const l = llTyp[i];
    if (h == null || isNaN(h) || l == null || isNaN(l) || h === l) {
      normTypical[i] = NaN;
    } else {
      normTypical[i] = ((typicalPrice[i] - l) / (h - l)) * 100;
    }
  }

  const bullBearArr = ta.ema(Series.fromArray(bars, normTypical), emaLength).toArray();

  // The original's five plotcandle() outputs, in their order, each with its own colour condition (bordercolor = na).
  // find_recent_value(fund_flow_trend * 0.95, 1): the previous value * 0.95, or the current one when it is na.
  const YELLOW = '#FFEB3B', GREEN = '#4CAF50', WHITE = '#FFFFFF', RED = '#FF5252', BLUE = '#2962FF';
  const entryCandles: PlotCandleData[] = [];
  const greenCandles: PlotCandleData[] = [];
  const whiteCandles: PlotCandleData[] = [];
  const redCandles: PlotCandleData[] = [];
  const blueCandles: PlotCandleData[] = [];
  const flags: boolean[][] = [[], [], [], [], []];
  for (let i = 0; i < n; i++) {
    const fft = fundFlowTrend[i];
    const bbl = bullBearArr[i] ?? NaN;
    const prevFft = i > 0 ? fundFlowTrend[i - 1] : NaN;
    const prevBbl = i > 0 ? bullBearArr[i - 1] ?? NaN : NaN;
    const recent95 = isNaN(prevFft) ? fft * 0.95 : prevFft * 0.95;
    // banker_entry_signal = ta.crossover(fund_flow_trend, bull_bear_line) and bull_bear_line < 25
    const entry = fft > bbl && prevFft <= prevBbl && bbl < entryThreshold;
    const green = fft > bbl;
    const white = fft < recent95;
    const red = fft < bbl;
    const blue = fft < bbl && fft > recent95;
    [entry, green, white, red, blue].forEach((f, k) => flags[k].push(f));

    const time = bars[i].time;
    // plotcandle(0, 50, 0, 50, color = banker_entry_signal ? yellow : na, bordercolor = na)
    if (entry) entryCandles.push({ time, open: 0, high: 50, low: 0, close: 50, color: YELLOW, borderColor: 'transparent' });
    // plotcandle(fund_flow_trend, bull_bear_line, fund_flow_trend, bull_bear_line, color = <cond> ? <colour> : na)
    if (isNaN(fft) || isNaN(bbl)) continue;
    const candle = (color: string): PlotCandleData => ({
      time, open: fft, high: Math.max(fft, bbl), low: Math.min(fft, bbl), close: bbl, color, borderColor: 'transparent',
    });
    if (green) greenCandles.push(candle(GREEN));
    if (white) whiteCandles.push(candle(WHITE));
    if (red) redCandles.push(candle(RED));
    if (blue) blueCandles.push(candle(BLUE));
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    hlines: [
      { value: 90, options: { color: '#E040FB', linestyle: 'dotted' as const, title: 'Strong' } },
      { value: 80, options: { color: '#EF5350', linestyle: 'dotted' as const, title: 'Overbought' } },
      { value: 20, options: { color: '#FFD700', linestyle: 'dotted' as const, title: 'Oversold' } },
      { value: 10, options: { color: '#66BB6A', linestyle: 'dotted' as const, title: 'Weak' } },
    ],
    fills: [
      { plot1: 'hline_oversold', plot2: 'hline_weak', options: { color: 'rgba(255, 235, 59, 0.3)' } },
      { plot1: 'hline_overbought', plot2: 'hline_strong', options: { color: 'rgba(224, 64, 251, 0.3)' } },
    ],
    // later candles are drawn on top
    plotCandles: { entrySignal: entryCandles, green: greenCandles, white: whiteCandles, red: redCandles, blue: blueCandles },
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Alert on Yellow Candle', message: 'Yellow Candle!' },
  { id: 'alert1', title: 'Alert on Green Candle', message: 'Green Candle!' },
  { id: 'alert2', title: 'Alert on White Candle', message: 'White Candle!' },
  { id: 'alert3', title: 'Alert on Red Candle', message: 'Red Candle!' },
  { id: 'alert4', title: 'Alert on Blue Candle', message: 'Blue Candle!' },
];

export const BankerFundFlow = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
