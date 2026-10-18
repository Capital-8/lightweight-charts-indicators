/**
 * AI Trend Navigator [K-Neighbor]
 *
 * kNN moving average: on each bar, of the last `windowSize` = max(k, 30) values of the price value (SMA of hl2, VWAP
 * of the close `maLen` bars back, or an SMA / WMA / EMA / HMA of the close), the k closest to the target value (RMA
 * of the close, VWAP of the close `maLen_` bars back, ATR(14), or an SMA / WMA / EMA / HMA of the close) are kept
 * and the line is their sum divided by k (slots not filled count as 0). The Knn Classifier Line is the WMA(5) of it,
 * lime when rising, red when falling, orange otherwise; the Average Knn Classifier Line is its RMA over the smoothing
 * period. kNN classifier: among the last 10 values of avg(kNN MA, close), each new nearest one votes up when the RMA of
 * the kNN MA one bar back is below the RMA of the kNN MA on that bar, down when above; the prediction is the WMA(3) of
 * +1 (more up votes) / -1. An optional background follows the prediction.
 *
 * Alerts (alertcondition, `alerts` of the result): the classifier line crossing over / under its average and the
 * close, switching up / down, turning neutral, and the positive / negative prediction starting.
 *
 * VWAP choices: ta.vwap restarts on each new day; on intraday bars the port reads the exchange time zone and the
 * session from the optional third argument (see src/chart-context.ts), else the day starts at 00:00 UTC.
 *
 * Reference: "AI Trend Navigator" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import type { ChartContext } from '../chart-context';
import { periodChanges } from '../anchor-period';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type AiTrendNavigatorPriceValue = 'hl2' | 'VWAP' | 'sma' | 'wma' | 'ema' | 'hma';
export type AiTrendNavigatorTargetValue = 'Price Action' | 'VWAP' | 'Volatility' | 'sma' | 'wma' | 'ema' | 'hma';

export interface AiTrendNavigatorInputs {
  /** Price value fed to the kNN */
  priceValue: AiTrendNavigatorPriceValue;
  /** Length of the price value */
  maLen: number;
  /** Target value of the kNN */
  targetValue: AiTrendNavigatorTargetValue;
  /** Length of the target value */
  targetLen: number;
  /** Number of closest values (k) */
  numberOfClosestValues: number;
  /** Smoothing period of the average line and of the classifier */
  smoothingPeriod: number;
  upKnnColor: string;
  downKnnColor: string;
  neutralKnnColor: string;
  maKnnColor: string;
  /** Trend Prediction Color (background) */
  showBackground: boolean;
  upBgColor: string;
  downBgColor: string;
}

export const defaultInputs: AiTrendNavigatorInputs = {
  priceValue: 'hl2',
  maLen: 5,
  targetValue: 'Price Action',
  targetLen: 5,
  numberOfClosestValues: 3,
  smoothingPeriod: 50,
  upKnnColor: color.lime,
  downKnnColor: color.red,
  neutralKnnColor: color.orange,
  maKnnColor: color.teal,
  showBackground: false,
  upBgColor: color.lime,
  downBgColor: color.red,
};

export const inputConfig: InputConfig[] = [
  { id: 'priceValue', type: 'string', title: 'Price Value', defval: 'hl2', options: ['hl2', 'VWAP', 'sma', 'wma', 'ema', 'hma'] },
  { id: 'maLen', type: 'int', title: 'Price Value Length', defval: 5, min: 2, max: 200 },
  { id: 'targetValue', type: 'string', title: 'Target Value', defval: 'Price Action', options: ['Price Action', 'VWAP', 'Volatility', 'sma', 'wma', 'ema', 'hma'] },
  { id: 'targetLen', type: 'int', title: 'Target Value Length', defval: 5, min: 2, max: 200 },
  { id: 'numberOfClosestValues', type: 'int', title: 'Number of Closest Values', defval: 3, min: 2, max: 200 },
  { id: 'smoothingPeriod', type: 'int', title: 'Smoothing Period', defval: 50, min: 2, max: 500 },
  { id: 'upKnnColor', type: 'color', title: 'KNN Up Color', defval: color.lime, group: 'KNN Color' },
  { id: 'downKnnColor', type: 'color', title: 'KNN Down Color', defval: color.red, group: 'KNN Color' },
  { id: 'neutralKnnColor', type: 'color', title: 'KNN Neutral Color', defval: color.orange, group: 'KNN Color' },
  { id: 'maKnnColor', type: 'color', title: 'MA KNN Color', defval: color.teal, group: 'MA KNN Color' },
  { id: 'showBackground', type: 'bool', title: 'Trend Prediction Color', defval: false, group: 'BG Color' },
  { id: 'upBgColor', type: 'color', title: 'Up Background Color', defval: color.lime, group: 'BG Color' },
  { id: 'downBgColor', type: 'color', title: 'Down Background Color', defval: color.red, group: 'BG Color' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Knn Classifier Line', color: color.lime, lineWidth: 1 },
  { id: 'plot1', title: 'Average Knn Classifier Line', color: color.teal, lineWidth: 1 },
];

export const metadata = {
  title: 'AI Trend Navigator [K-Neighbor]',
  shortTitle: 'AI-TN',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<AiTrendNavigatorInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const closeS = S(close);
  const k = cfg.numberOfClosestValues;
  const windowSize = Math.max(k, 30);

  // ta.vwap(close[len]): anchor timeframe.change("1D") (true on the first bar)
  const vwapOfCloseBack = (len: number) => {
    const day = periodChanges(bars, '1D', chart).map((c, i) => (i === 0 || c ? 1 : 0));
    const src = close.map((_v, i) => (i - len >= 0 ? close[i - len] : NaN));
    return A(ta.vwap(S(src), S(bars.map((b) => b.volume ?? NaN)), S(day)));
  };
  const closeMa = (typ: string, len: number) =>
    typ === 'sma' ? A(ta.sma(closeS, len))
    : typ === 'wma' ? A(ta.wma(closeS, len))
    : typ === 'ema' ? A(ta.ema(closeS, len))
    : A(ta.hma(closeS, len));

  const valueIn = cfg.priceValue === 'hl2' ? A(ta.sma(S(bars.map((b) => (b.high + b.low) / 2)), cfg.maLen))
    : cfg.priceValue === 'VWAP' ? vwapOfCloseBack(cfg.maLen)
    : closeMa(cfg.priceValue, cfg.maLen);
  const targetIn = cfg.targetValue === 'Price Action' ? A(ta.rma(closeS, cfg.targetLen))
    : cfg.targetValue === 'VWAP' ? vwapOfCloseBack(cfg.targetLen)
    : cfg.targetValue === 'Volatility' ? A(ta.atr(bars, 14))
    : closeMa(cfg.targetValue, cfg.targetLen);

  // meanOfKClosest(value_in, target_in)
  const knnMA: number[] = new Array(n);
  for (let b = 0; b < n; b++) {
    const dists = new Array<number>(k).fill(1e10);
    const vals = new Array<number>(k).fill(0.0);
    for (let i = 1; i <= windowSize; i++) {
      const value = b - i >= 0 ? valueIn[b - i] : NaN;
      const distance = Math.abs(targetIn[b] - value);
      let maxDistIndex = 0;
      let maxDistValue = dists[0];
      for (let j = 1; j <= k - 1; j++) {
        if (gt(dists[j], maxDistValue)) {
          maxDistIndex = j;
          maxDistValue = dists[j];
        }
      }
      if (lt(distance, maxDistValue)) {
        dists[maxDistIndex] = distance;
        vals[maxDistIndex] = value;
      }
    }
    knnMA[b] = vals.reduce((s, v) => s + v, 0) / k;
  }

  // price = math.avg(knnMA, close); c = ta.rma(knnMA[1], smoothingPeriod); o = ta.rma(knnMA, smoothingPeriod)
  const price = knnMA.map((v, i) => (v + close[i]) / 2);
  const c = A(ta.rma(S(knnMA.map((_v, i) => (i > 0 ? knnMA[i - 1] : NaN))), cfg.smoothingPeriod));
  const o = A(ta.rma(S(knnMA), cfg.smoothingPeriod));

  // knn(price): each new nearest of the last 10 values votes with c > o (down) / c < o (up) on its bar
  const raw: number[] = new Array(n);
  for (let b = 0; b < n; b++) {
    let pos = 0;
    let neg = 0;
    let minDistance = 10e10;
    for (let j = 1; j <= 10; j++) {
      const pj = b - j >= 0 ? price[b - j] : NaN;
      const distance = Math.sqrt(Math.pow(pj - price[b], 2));
      if (lt(distance, minDistance)) {
        minDistance = distance;
        const cj = b - j >= 0 ? c[b - j] : NaN;
        const oj = b - j >= 0 ? o[b - j] : NaN;
        if (lt(cj, oj)) pos += 1;
        if (gt(cj, oj)) neg += 1;
      }
    }
    raw[b] = pos > neg ? 1 : -1;
  }
  const knnPrediction = A(ta.wma(S(raw), 3));

  const knnLine = A(ta.wma(S(knnMA), 5));
  const maKnn = o; // MAknn_ = ta.rma(knnMA, smoothingPeriod)
  const lineCol = knnLine.map((v, i) => {
    const p = i > 0 ? knnLine[i - 1] : NaN;
    return gt(v, p) ? cfg.upKnnColor : lt(v, p) ? cfg.downKnnColor : cfg.neutralKnnColor;
  });

  // green = knn_prediction < 0.5, red = knn_prediction > -0.5
  const green = knnPrediction.map((v) => lt(v, 0.5));
  const red = knnPrediction.map((v) => gt(v, -0.5));
  const bgColors: BgColorData[] = [];
  if (cfg.showBackground) {
    const dn80 = String(color.new(cfg.downBgColor, 80));
    const up80 = String(color.new(cfg.upBgColor, 80));
    // bgcolor(green and bgcolor ? color.new(Dn_col, 80) : red and bgcolor ? color.new(Up_col, 80) : na)
    for (let i = 0; i < n; i++) {
      if (green[i]) bgColors.push({ id: 'bgcolor0', time: bars[i].time, color: dn80 });
      else if (red[i]) bgColors.push({ id: 'bgcolor0', time: bars[i].time, color: up80 });
    }
  }

  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const switchUp = knnLine.map((v, i) => lt(at(knnLine, i - 1), v) && le(at(knnLine, i - 1), at(knnLine, i - 2)));
  const switchDn = knnLine.map((v, i) => gt(at(knnLine, i - 1), v) && ge(at(knnLine, i - 1), at(knnLine, i - 2)));
  const neutral = lineCol.map((col, i) => i > 0 && col === cfg.neutralKnnColor && lineCol[i - 1] !== cfg.neutralKnnColor);
  const greenBG = green.map((g, i) => g && !(i > 0 && green[i - 1]));
  const redBG = red.map((r, i) => r && !(i > 0 && red[i - 1]));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(knnMA_, "Knn Classifier Line", knnMA_col); plot(MAknn_, "Average Knn Classifier Line", Maknn_col)
      plot0: knnLine.map((v, i) => ({ time: bars[i].time, value: v, color: lineCol[i] })),
      plot1: maKnn.map((v, i) => ({ time: bars[i].time, value: v, color: cfg.maKnnColor })),
    },
    bgColors,
    alerts: alertStates(alertConditions, bars, [
      crossedOver(knnLine, maKnn), crossedUnder(knnLine, maKnn),
      crossedOver(knnLine, close), crossedUnder(knnLine, close),
      switchUp, switchDn, neutral, greenBG, redBG,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Knn Crossover Average Knn', message: 'Knn Crossover Average Knn' },
  { id: 'alert1', title: 'Knn Crossunder Average Knn', message: 'Knn Crossunder Average Knn' },
  { id: 'alert2', title: 'Knn Crossover Close', message: 'Knn Crossover Close' },
  { id: 'alert3', title: 'Knn Crossunder Close', message: 'Knn Crossunder Close' },
  { id: 'alert4', title: 'Knn Switch Up', message: 'Knn Switch Up' },
  { id: 'alert5', title: 'Knn Switch Dn', message: 'Knn Switch Dn' },
  { id: 'alert6', title: 'Knn is Neutral', message: 'Knn is Neutral' },
  { id: 'alert7', title: 'Positive Prediction', message: 'Positive Prediction' },
  { id: 'alert8', title: 'Negative Prediction', message: 'Negative Prediction' },
];

export const AiTrendNavigator = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
