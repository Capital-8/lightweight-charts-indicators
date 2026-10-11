/**
 * Trend Targets [AlgoAlpha]
 *
 * The baseline is an EMA of a WMA of the middle of the two Supertrend bands (ATR period and factor from the
 * inputs, both bands trailed as in Supertrend). The trend is up from a bar where the baseline turns up and down
 * from a bar where it turns down; the baseline, the bars and a label at the turn show it. While the bars straddle
 * the baseline in a trend, a counter runs; above the "Confirmation count" a rejection arrow is drawn.
 *
 * With "Show Take Profit Levels", each trend change sets a stop loss (the low minus, or the high plus, the ATR times
 * its multiplier) and three targets (multiples of the distance from the close to the stop). The entry, the stop and
 * the targets are lines with a price label, extended 40 bars after the last bar, with a fill from the entry to the
 * stop and to the third target. Only the levels of the last trend change are kept.
 *
 * The prices of the label texts are rounded to the price tick of the symbol: the port reads it from the chart
 * context (third argument) and uses 0.01 without it.
 *
 * Reference: "Trend Targets [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import { ta, str, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, LineDrawingData, LabelData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { mintickOf, type ChartContext } from '../chart-context';

export interface TrendTargetsInputs {
  /** Multiplier for the ATR of the Supertrend bands */
  stFactor: number;
  stAtrPeriod: number;
  wmaLength: number;
  emaLength: number;
  /** Bars at the baseline before a rejection signal */
  contFactor: number;
  showTp: boolean;
  atrPeriod: number;
  slMultiplier: number;
  tp1Multiplier: number;
  tp2Multiplier: number;
  tp3Multiplier: number;
  green: string;
  red: string;
}

export const defaultInputs: TrendTargetsInputs = {
  stFactor: 12,
  stAtrPeriod: 90,
  wmaLength: 40,
  emaLength: 14,
  contFactor: 3,
  showTp: true,
  atrPeriod: 14,
  slMultiplier: 5,
  tp1Multiplier: 0.5,
  tp2Multiplier: 1.0,
  tp3Multiplier: 1.5,
  green: '#00FFBB',
  red: '#FF1100',
};

export const inputConfig: InputConfig[] = [
  { id: 'stFactor', type: 'float', title: 'Supertrend Factor', defval: 12, min: 1, step: 0.5, group: 'Trend Settings' },
  { id: 'stAtrPeriod', type: 'int', title: 'Supertrend ATR Period', defval: 90, min: 1, group: 'Trend Settings' },
  { id: 'wmaLength', type: 'int', title: 'WMA Length', defval: 40, min: 1, group: 'Trend Settings' },
  { id: 'emaLength', type: 'int', title: 'EMA Length', defval: 14, min: 1, group: 'Trend Settings' },
  { id: 'contFactor', type: 'int', title: 'Confirmation count', defval: 3, min: 1, group: 'Rejection Settings' },
  { id: 'showTp', type: 'bool', title: 'Show Take Profit Levels', defval: true, group: 'Targets' },
  { id: 'atrPeriod', type: 'int', title: 'Volatility (ATR) period', defval: 14, min: 1, group: 'Targets' },
  { id: 'slMultiplier', type: 'float', title: 'Stop Loss ATR Multiplier', defval: 5, min: 0.1, step: 0.1, group: 'Targets' },
  { id: 'tp1Multiplier', type: 'float', title: 'TP1 Multiplier', defval: 0.5, min: 0.1, step: 0.1, group: 'Targets' },
  { id: 'tp2Multiplier', type: 'float', title: 'TP2 Multiplier', defval: 1.0, min: 0.1, step: 0.1, group: 'Targets' },
  { id: 'tp3Multiplier', type: 'float', title: 'TP3 Multiplier', defval: 1.5, min: 0.1, step: 0.1, group: 'Targets' },
  { id: 'green', type: 'color', title: 'Bullish Color', defval: '#00FFBB', group: 'Appearance' },
  { id: 'red', type: 'color', title: 'Bearish Color', defval: '#FF1100', group: 'Appearance' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Baseline', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'Trend Targets [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - Trend Targets',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** A level: its line and its label */
interface Level {
  x1: number;
  x2: number;
  labelX: number;
  y: number;
  color: string;
  text: string;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendTargetsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'barColors' | 'lines' | 'labels' | 'linefills'> & {
  markers: MarkerData[];
  barColors: BarColorData[];
  lines: LineDrawingData[];
  labels: LabelData[];
  linefills: LinefillData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { green, red } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const nz = (v: number) => (Number.isNaN(v) ? 0 : v);

  const volatility = A(ta.atr(bars, cfg.atrPeriod));

  // pine_supertrend(): the two trailed bands
  const atr = A(ta.atr(bars, cfg.stAtrPeriod));
  const mid: number[] = new Array(n);
  let lowerPrev = NaN;
  let upperPrev = NaN;
  for (let i = 0; i < n; i++) {
    const src = (bars[i].high + bars[i].low) / 2;
    let upperBand = src + cfg.stFactor * atr[i];
    let lowerBand = src - cfg.stFactor * atr[i];
    const prevLowerBand = nz(lowerPrev);
    const prevUpperBand = nz(upperPrev);
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    lowerBand = gt(lowerBand, prevLowerBand) || lt(close1, prevLowerBand) ? lowerBand : prevLowerBand;
    upperBand = lt(upperBand, prevUpperBand) || gt(close1, prevUpperBand) ? upperBand : prevUpperBand;
    lowerPrev = lowerBand;
    upperPrev = upperBand;
    // math.avg(lwr, upr): na when one of them is na
    mid[i] = (lowerBand + upperBand) / 2;
  }
  const tLSeries = ta.ema(ta.wma(Series.fromArray(bars, mid), cfg.wmaLength), cfg.emaLength);
  const tL = A(tLSeries);
  const turnUp = ta.crossover(tLSeries, tLSeries.offset(1)).toArray();
  const turnDown = ta.crossunder(tLSeries, tLSeries.offset(1)).toArray();

  // var trend = 0
  const trend: number[] = new Array(n);
  {
    let t = 0;
    for (let i = 0; i < n; i++) {
      if (turnUp[i]) t = 1;
      if (turnDown[i]) t = -1;
      trend[i] = t;
    }
  }
  const trendSeries = Series.fromArray(bars, trend);
  const zero = Series.fromArray(bars, new Array(n).fill(0));
  const trendCross = ta.cross(trendSeries, zero).toArray();
  const longSignal = ta.crossover(trendSeries, zero).toArray();
  const shortSignal = ta.crossunder(trendSeries, zero).toArray();

  const up50 = String(color.new(green, 50));
  const down50 = String(color.new(red, 50));
  const green80 = String(color.new(green, 80));
  const red80 = String(color.new(red, 80));
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const mintick = mintickOf(chart);
  const priceText = (v: number) => str.tostring(v, 'mintick', mintick);

  let rejcount = 0;
  // entry, stop loss, TP1, TP2, TP3 (var lines and labels: na before the first signal)
  let levels: Level[] = [];

  for (let i = 0; i < n; i++) {
    const { high, low, close, time } = bars[i];
    const tr = trend[i];
    const straddle = gt(high, tL[i]) && lt(low, tL[i]);
    const bullishrej = tr === 1 && straddle;
    const bearishrej = tr === -1 && straddle;
    if (bullishrej || bearishrej) rejcount += 1;
    if (trendCross[i] || (!(bullishrej || bearishrej) && rejcount > 0)) rejcount = 0;

    // plotchar: a series at a location other than absolute is read as a bool (na and 0 draw nothing)
    const shown = !Number.isNaN(tL[i]) && tL[i] !== 0;
    if (rejcount > cfg.contFactor && tr === 1 && shown) {
      markers.push({ time, position: 'belowBar', shape: 'circle', color: 'transparent', text: '▲', textColor: green, size: 'tiny' });
    }
    if (rejcount > cfg.contFactor && tr === -1 && shown) {
      markers.push({ time, position: 'aboveBar', shape: 'circle', color: 'transparent', text: '▼', textColor: red, size: 'tiny' });
    }

    plot0.push({ time, value: tL[i], color: tr === 1 ? up50 : down50 });
    barColors.push({ time, color: tr === 1 ? up50 : down50 });

    if (turnUp[i] && !Number.isNaN(tL[i])) {
      markers.push({ time, position: 'atPriceBottom', price: tL[i], shape: 'labelUp', color: green, size: 'small' });
    }
    if (turnDown[i] && !Number.isNaN(tL[i])) {
      markers.push({ time, position: 'atPriceTop', price: tL[i], shape: 'labelDown', color: red, size: 'small' });
    }

    // Levels of a signal: the new lines and labels replace the ones before (deleted)
    const setLevels = (long: boolean) => {
      const sl = long ? low - volatility[i] * cfg.slMultiplier : high + volatility[i] * cfg.slMultiplier;
      const dist = Math.abs(close - sl);
      const sign = long ? 1 : -1;
      const tp = [cfg.tp1Multiplier, cfg.tp2Multiplier, cfg.tp3Multiplier].map((m) => close + sign * dist * m);
      const level = (y: number, c: string, text: string): Level => ({ x1: i, x2: i, labelX: i, y, color: c, text });
      levels = [
        level(close, long ? green : red, 'Entry ▸ ' + priceText(close)),
        level(sl, red80, '✘ SL ▸ ' + priceText(sl)),
        level(tp[0], green80, ' ✔ TP1 ▸ ' + priceText(tp[0])),
        level(tp[1], green80, ' ✔ TP2 ▸ ' + priceText(tp[1])),
        level(tp[2], green80, ' ✔ TP3 ▸ ' + priceText(tp[2])),
      ];
    };
    const extend = (x: number) => {
      for (const l of levels) {
        l.x2 = x;
        l.labelX = x;
      }
    };
    if (longSignal[i] && cfg.showTp) setLevels(true);
    else extend(i);
    if (shortSignal[i] && cfg.showTp) setLevels(false);
    else extend(i + 40);
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lines: LineDrawingData[] = levels.map((l) => ({ time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, width: 3 }));
  const labels: LabelData[] = levels.map((l) => ({
    time: T(l.labelX), price: l.y, text: l.text, style: 'label_left', color: l.color, textColor: '#FFFFFF',
  }));
  // linefill.new on every bar between the entry line and the stop / third target (one fill per pair of lines)
  const linefills: LinefillData[] = levels.length
    ? [
      { line1: lines[0], line2: lines[1], color: String(color.new(color.red, 95)) },
      { line1: lines[0], line2: lines[4], color: String(color.new(color.green, 95)) },
    ]
    : [];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    barColors,
    lines,
    labels,
    linefills,
  };
}

export const TrendTargets = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
