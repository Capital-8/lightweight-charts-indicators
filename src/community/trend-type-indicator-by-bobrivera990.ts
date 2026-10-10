/**
 * Trend Type Indicator by BobRivera990
 *
 * Classifies each bar as uptrend (2), sideways (0) or downtrend (-2). The market is sideways when the ATR is at or
 * below its moving average, or when the ADX is at or below a limit (each test can be switched off); else the trend
 * is up when +DI is above -DI and down otherwise. The class is smoothed with an SMA rounded to the nearest of the
 * three levels, and drawn as a step line shifted back by `lag` bars over three coloured zones. Labels on the last
 * bar name the zones and mark the current state.
 *
 * Reference: "Trend Type Indicator by BobRivera990" by BobRivera990
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: (c) BobRivera990
 */

import { ta, math, compare, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface TrendTypeIndicatorInputs {
  /** Use ATR to detect Sideways Movements */
  useAtr: boolean;
  /** ATR Length */
  atrLen: number;
  /** ATR Moving Average Type */
  atrMaType: 'SMA' | 'EMA';
  /** ATR MA Length */
  atrMaLen: number;
  /** Use ADX to detect Sideways Movements */
  useAdx: boolean;
  /** ADX Smoothing */
  adxLen: number;
  /** DI Length */
  diLen: number;
  /** ADX Limit */
  adxLim: number;
  /** Smoothing Factor */
  smooth: number;
  /** Lag: the oscillator is drawn this number of bars back */
  lag: number;
}

export const defaultInputs: TrendTypeIndicatorInputs = {
  useAtr: true,
  atrLen: 14,
  atrMaType: 'SMA',
  atrMaLen: 20,
  useAdx: true,
  adxLen: 14,
  diLen: 14,
  adxLim: 25,
  smooth: 3,
  lag: 8,
};

export const inputConfig: InputConfig[] = [
  { id: 'useAtr', type: 'bool', title: 'Use ATR to detect Sideways Movements', defval: true },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'atrMaType', type: 'string', title: 'ATR Moving Average Type', defval: 'SMA', options: ['SMA', 'EMA'] },
  { id: 'atrMaLen', type: 'int', title: 'ATR MA Length', defval: 20, min: 1 },
  { id: 'useAdx', type: 'bool', title: 'Use ADX to detect Sideways Movements', defval: true },
  { id: 'adxLen', type: 'int', title: 'ADX Smoothing', defval: 14, min: 1, max: 50 },
  { id: 'diLen', type: 'int', title: 'DI Length', defval: 14, min: 1 },
  { id: 'adxLim', type: 'int', title: 'ADX Limit', defval: 25, min: 1 },
  { id: 'smooth', type: 'int', title: 'Smoothing Factor', defval: 3, min: 1, max: 5 },
  { id: 'lag', type: 'int', title: 'Lag', defval: 8, min: 0, max: 15 },
];

// Colours of the original Pine version
const GREEN = '#4CAF50';
const RED = '#FF5252';
const GRAY = '#787B86';
const WHITE = '#FFFFFF';
const BLUE = '#2196F3';
const BLACK = '#363A45';
const COL_GREEN30 = String(color.new(GREEN, 30));
const COL_GREEN90 = String(color.new(GREEN, 90));
const COL_GRAY = String(color.new(GRAY, 20));
const COL_WHITE90 = String(color.new(WHITE, 90));
const COL_RED30 = String(color.new(RED, 30));
const COL_RED90 = String(color.new(RED, 90));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Band_3', color: BLACK, lineWidth: 1 },
  { id: 'plot1', title: 'Band_2', color: BLACK, lineWidth: 1 },
  { id: 'plot2', title: 'Band_1', color: BLACK, lineWidth: 1 },
  { id: 'plot3', title: 'Band_0', color: BLACK, lineWidth: 1 },
  { id: 'plot4', title: 'Trend Type Oscillator', color: BLUE, lineWidth: 3, style: 'stepline', offset: -8 },
];

export const metadata = {
  title: 'Trend Type Indicator by BobRivera990',
  shortTitle: 'Trend Type Indicator by BobRivera990',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendTypeIndicatorInputs> = {},
): IndicatorResult & { labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  // fixnan: the last value that is not na
  const fixnan = (a: number[]) => {
    let last = NaN;
    return a.map((v) => {
      if (!Number.isNaN(v)) last = v;
      return last;
    });
  };

  const atr = A(ta.atr(bars, cfg.atrLen));
  const atrMa = A(cfg.atrMaType === 'EMA' ? ta.ema(S(atr), cfg.atrMaLen) : ta.sma(S(atr), cfg.atrMaLen));

  const up = A(ta.change(new Series(bars, (b) => b.high)));
  const down = A(ta.change(new Series(bars, (b) => b.low))).map((v) => -v);
  const plusDM = up.map((u, i) => (isNaN(u) ? NaN : compare.gt(u, down[i]) && compare.gt(u, 0) ? u : 0));
  const minusDM = down.map((d, i) => (isNaN(d) ? NaN : compare.gt(d, up[i]) && compare.gt(d, 0) ? d : 0));
  const trur = A(ta.rma(ta.tr(bars, false), cfg.diLen));
  const plusRma = A(ta.rma(S(plusDM), cfg.diLen));
  const minusRma = A(ta.rma(S(minusDM), cfg.diLen));
  const plus = fixnan(plusRma.map((v, i) => (100 * v) / trur[i]));
  const minus = fixnan(minusRma.map((v, i) => (100 * v) / trur[i]));
  const adx = A(ta.rma(S(plus.map((p, i) => {
    const sum = p + minus[i];
    return Math.abs(p - minus[i]) / (compare.eq(sum, 0) ? 1 : sum);
  })), cfg.adxLen)).map((v) => 100 * v);

  // Pine na(): na or an infinite value
  const na = (v: number) => !Number.isFinite(v);
  const trendType: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // cndNa: the original tests na(atrMaLen) (the input), not the moving average
    const cndNa = na(atr[i]) || na(adx[i]) || na(plus[i]) || na(minus[i]);
    const sideways1 = cfg.useAtr && compare.le(atr[i], atrMa[i]);
    const sideways2 = cfg.useAdx && compare.le(adx[i], cfg.adxLim);
    const cndUp = compare.gt(plus[i], minus[i]);
    trendType[i] = cndNa ? NaN : sideways1 || sideways2 ? 0 : cndUp ? 2 : -2;
  }
  const sma = A(ta.sma(S(trendType), cfg.smooth));
  // smoothType = na(trendType) ? na : round(sma(trendType, smooth) / 2) * 2
  const smoothType = trendType.map((v, i) => (isNaN(v) || isNaN(sma[i]) ? NaN : math.round(sma[i] / 2) * 2));

  const interval = barInterval(bars);
  const trendCol = (v: number) => (compare.eq(v, 2) ? COL_GREEN30 : compare.eq(v, 0) ? COL_GRAY : COL_RED30);
  // plot(smoothType, offset = -lag): the value of bar i is drawn on bar i - lag
  const oscillator: Array<{ time: number; value: number; color: string }> = [];
  for (let i = cfg.lag; i < n; i++) {
    oscillator.push({ time: barTime(bars, i - cfg.lag, interval), value: smoothType[i], color: trendCol(smoothType[i]) });
  }

  // Labels of the last bar (each bar deletes the labels of the bar before)
  const labels: LabelData[] = [];
  if (n > 0) {
    const time = bars[n - 1].time;
    const hidden = String(color.new(GREEN, 100));
    const zone = (price: number, text: string): LabelData => (
      { time, price, text, color: hidden, textColor: BLACK, style: 'label_left', size: 'normal', textAlign: 'left' }
    );
    labels.push(zone(2, 'UP'), zone(0, 'SIDEWAYS'), zone(-2, 'DOWN'));
    if (!isNaN(smoothType[n - 1])) {
      labels.push({ time, price: smoothType[n - 1], text: '', color: String(color.new(BLUE, 30)), style: 'label_right', size: 'small' });
    }
  }

  const constant = (v: number) => bars.map((b) => ({ time: b.time, value: v }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: constant(3),
      plot1: constant(1),
      plot2: constant(-1),
      plot3: constant(-3),
      plot4: oscillator,
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot0', options: { color: COL_GREEN90, title: 'Uptrend area' } },
      { plot1: 'plot2', plot2: 'plot1', options: { color: COL_WHITE90, title: 'Sideways area' } },
      { plot1: 'plot3', plot2: 'plot2', options: { color: COL_RED90, title: 'Downtrend area' } },
    ],
    labels,
  };
}

export const TrendTypeIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
