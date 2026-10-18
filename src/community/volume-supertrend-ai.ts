/**
 * Volume SuperTrend AI (Expo)
 *
 * A SuperTrend built on a volume-weighted average of the close (`Moving Average Source`: SMA / EMA / WMA / RMA /
 * VWMA of close * volume over the same average of the volume) -/+ factor * ATR(len), with the usual band trailing:
 * the lower band only rises and the upper band only falls while the previous close stays on their side. A weighted
 * k-nearest-neighbours vote classifies the current SuperTrend value: the last `Data` SuperTrend values are the
 * points, each labelled 1 when WMA(close, `Price Trend`) was above WMA(SuperTrend, `Prediction Trend`) on that bar,
 * else 0; the `Neighbors` nearest points (bubble sort of |distance|) vote with a weight of 1 / (distance + 1e-6).
 * A vote of exactly 1 colours the line bullish, exactly 0 bearish, anything else neutral. The SuperTrend is drawn
 * with its up / down halves (line breaks) and a fill between each half and the candle body midpoint (hidden plot)
 * at 90 % transparency of the line colour. Circles mark the start of a bullish / bearish colour, triangles a
 * direction change confirmed by the vote.
 * Alerts (alertcondition, `alerts` of the result): bullish / bearish / any trend start and trend signal.
 *
 * Reference: "Volume SuperTrend AI (Expo)" by Zeiierman
 * Licence: Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0), as the original
 * (https://creativecommons.org/licenses/by-nc-sa/4.0/).
 * Original notice: © Zeiierman
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type VolumeSuperTrendAiMaSource = 'SMA' | 'EMA' | 'WMA' | 'RMA' | 'VWMA';

export interface VolumeSuperTrendAiInputs {
  /** Number of nearest neighbours (k) */
  k: number;
  /** Number of data points (n = max(k, n)) */
  n: number;
  /** WMA length of the close (labels of the points) */
  knnPriceLen: number;
  /** WMA length of the SuperTrend (labels of the points) */
  knnSTLen: number;
  /** Show the trend start / signal shapes */
  aiSignals: boolean;
  bullishCol: string;
  bearishCol: string;
  /** SuperTrend length (average and ATR) */
  atrLen: number;
  /** ATR multiplier */
  factor: number;
  /** Average of close * volume / volume */
  maSrc: VolumeSuperTrendAiMaSource;
  upCol: string;
  dnCol: string;
  neCol: string;
}

export const defaultInputs: VolumeSuperTrendAiInputs = {
  k: 3,
  n: 10,
  knnPriceLen: 20,
  knnSTLen: 100,
  aiSignals: true,
  bullishCol: color.lime,
  bearishCol: color.red,
  atrLen: 10,
  factor: 3.0,
  maSrc: 'WMA',
  upCol: color.lime,
  dnCol: color.red,
  neCol: color.blue,
};

const T1 = 'Number of nearest neighbors in KNN algorithm (k): Increase to consider more neighbors, providing a more balanced view but possibly smoothing out local patterns. Decrease for fewer neighbors to make the algorithm more responsive to recent changes. \n\nNumber of data points to consider (n): Increase for more historical data, providing a broader context but possibly diluting recent trends. Decrease for less historical data to focus more on recent behavior.';
const T2 = 'Length of weighted moving average for price (KNN_PriceLen): Higher values create a smoother price line, influencing the KNN algorithm to be more stable but less sensitive to short-term price movements. Lower values enhance responsiveness in KNN predictions to recent price changes but may lead to more noise. \n\nLength of weighted moving average for SuperTrend (KNN_STLen): Higher values lead to a smoother SuperTrend line, affecting the KNN algorithm to emphasize long-term trends. Lower values make KNN predictions more sensitive to recent SuperTrend changes but may result in more volatility.';
const T3 = 'Length of the SuperTrend (len): Increase for a smoother trend line, ideal for identifying long-term trends but possibly ignoring short-term fluctuations. Decrease for more responsiveness to recent changes but risk of more false signals. \n\nMultiplier for ATR in SuperTrend calculation (factor): Increase for wider bands, capturing larger price movements but possibly missing subtle changes. Decrease for narrower bands, more sensitive to small shifts but risk of more noise.';
const T4 = 'Type of moving average for SuperTrend calculation (maSrc): Choose based on desired characteristics. SMA is simple and clear, EMA emphasizes recent prices, WMA gives more weight to recent data, RMA is less sensitive to recent changes, and VWMA considers volume.';
const T5 = 'Color for bullish trend (upCol): Select to visually identify upward trends. \n\nColor for bearish trend (dnCol): Select to visually identify downward trends.\n\nColor for neutral trend (neCol): Select to visually identify neutral trends.';

const AI_GROUP = 'AI Settings';
const TREND_GROUP = 'AI Trend';
const ST_GROUP = 'Super Trend Settings';
const COL_GROUP = 'Super Trend Coloring';

export const inputConfig: InputConfig[] = [
  { id: 'k', type: 'int', title: 'Neighbors', defval: 3, min: 1, max: 100, inline: 'AI', group: AI_GROUP },
  { id: 'n', type: 'int', title: 'Data', defval: 10, min: 1, max: 100, inline: 'AI', group: AI_GROUP, tooltip: T1 },
  { id: 'knnPriceLen', type: 'int', title: 'Price Trend', defval: 20, min: 2, max: 500, step: 10, inline: 'AITrend', group: TREND_GROUP },
  { id: 'knnSTLen', type: 'int', title: 'Prediction Trend', defval: 100, min: 2, max: 500, step: 10, inline: 'AITrend', group: TREND_GROUP, tooltip: T2 },
  { id: 'aiSignals', type: 'bool', title: 'AI Trend Signals', defval: true, inline: 'signal', group: TREND_GROUP },
  { id: 'bullishCol', type: 'color', title: '', defval: color.lime, inline: 'signal', group: TREND_GROUP },
  { id: 'bearishCol', type: 'color', title: '', defval: color.red, inline: 'signal', group: TREND_GROUP },
  { id: 'atrLen', type: 'int', title: 'Length', defval: 10, min: 1, inline: 'SuperTrend', group: ST_GROUP },
  { id: 'factor', type: 'float', title: '', defval: 3.0, step: 0.1, inline: 'SuperTrend', group: ST_GROUP, tooltip: T3 },
  { id: 'maSrc', type: 'string', title: 'Moving Average Source', defval: 'WMA', options: ['SMA', 'EMA', 'WMA', 'RMA', 'VWMA'], group: ST_GROUP, tooltip: T4 },
  { id: 'upCol', type: 'color', title: 'Bullish Color', defval: color.lime, inline: 'col', group: COL_GROUP },
  { id: 'dnCol', type: 'color', title: 'Bearish Color', defval: color.red, inline: 'col', group: COL_GROUP },
  { id: 'neCol', type: 'color', title: 'Neutral Color', defval: color.blue, inline: 'col', group: COL_GROUP, tooltip: T5 },
];

// The plot colours are the per-bar trend colour (col): the Style rows show the default series colour
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Volume Super Trend AI', color: '#2962FF', lineWidth: 1 },
  { id: 'plot1', title: 'Up Volume Super Trend AI', color: '#2962FF', lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Plot', color: '#2962FF', lineWidth: 1, display: 'none', editable: false },
  { id: 'plot3', title: 'Down Volume Super Trend AI', color: '#2962FF', lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Volume SuperTrend AI (Expo)',
  shortTitle: 'Volume SuperTrend AI (Expo)',
  overlay: true,
};

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '1 Bullish Trend Start', message: 'AI Bullish Trend Start' },
  { id: 'alert1', title: '2 Bearish Trend Start', message: 'AI Bearish Trend Start' },
  { id: 'alert2', title: '3 Any Trend Start', message: 'Any AI Trend Start' },
  { id: 'alert3', title: '4 Bullish Trend Signal', message: 'AI Bullish Trend Signal' },
  { id: 'alert4', title: '5 Bearish Trend Signal', message: 'AI Bearish Trend Signal' },
  { id: 'alert5', title: '6 Any Trend Signal', message: 'Any AI Trend Signal' },
];

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeSuperTrendAiInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const nb = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const at = (a: number[], i: number) => (i >= 0 && i < a.length ? a[i] : NaN);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);
  const len = cfg.atrLen;
  const k = cfg.k;
  const n = Math.max(k, cfg.n);

  // vwma = average(close * volume, len) / average(volume, len)
  const cv = S(close.map((c, i) => c * volume[i]));
  const vol = S(volume);
  let num: number[];
  let den: number[];
  switch (cfg.maSrc) {
    case 'SMA': num = A(ta.sma(cv, len)); den = A(ta.sma(vol, len)); break;
    case 'EMA': num = A(ta.ema(cv, len)); den = A(ta.ema(vol, len)); break;
    case 'RMA': num = A(ta.rma(cv, len)); den = A(ta.rma(vol, len)); break;
    case 'VWMA': num = A(ta.vwma(cv, len, vol)); den = A(ta.vwma(vol, len, vol)); break;
    case 'WMA':
    default: num = A(ta.wma(cv, len)); den = A(ta.wma(vol, len)); break;
  }
  // division by zero gives na
  const vwma = num.map((x, i) => (den[i] === 0 ? NaN : x / den[i]));
  const atr = A(ta.atr(bars, len));

  const lowerBand: number[] = new Array(nb);
  const upperBand: number[] = new Array(nb);
  const direction: number[] = new Array(nb);
  const superTrend: number[] = new Array(nb);
  for (let i = 0; i < nb; i++) {
    const ub = vwma[i] + cfg.factor * atr[i];
    const lb = vwma[i] - cfg.factor * atr[i];
    const prevLower = i > 0 && !isNaN(lowerBand[i - 1]) ? lowerBand[i - 1] : 0; // nz(lowerBand[1])
    const prevUpper = i > 0 && !isNaN(upperBand[i - 1]) ? upperBand[i - 1] : 0; // nz(upperBand[1])
    const close1 = at(close, i - 1);
    lowerBand[i] = lb > prevLower || close1 < prevLower ? lb : prevLower;
    upperBand[i] = ub < prevUpper || close1 > prevUpper ? ub : prevUpper;
    const prevSuperTrend = at(superTrend, i - 1);
    let dir: number;
    if (isNaN(at(atr, i - 1))) dir = 1;
    else if (prevSuperTrend === prevUpper) dir = close[i] > upperBand[i] ? -1 : 1;
    else dir = close[i] < lowerBand[i] ? 1 : -1;
    direction[i] = dir;
    superTrend[i] = dir === -1 ? lowerBand[i] : upperBand[i];
  }

  // KNN points: superTrend[i] labelled price[i] > sT[i] ? 1 : 0, i = 0 .. n - 1 bars back
  const price = A(ta.wma(S(close), cfg.knnPriceLen));
  const sT = A(ta.wma(S(superTrend), cfg.knnSTLen));
  const labelOf = price.map((p, i) => (p > sT[i] ? 1 : 0));
  const label_: number[] = new Array(nb);
  const distances: number[] = new Array(n);
  const indices: number[] = new Array(n);
  for (let b = 0; b < nb; b++) {
    const x = superTrend[b];
    for (let i = 0; i < n; i++) {
      distances[i] = Math.abs(x - at(superTrend, b - i));
      indices[i] = i;
    }
    // bubble sort, ascending (a comparison with na is false: no swap)
    for (let i = 0; i <= n - 2; i++) {
      for (let j = 0; j <= n - i - 2; j++) {
        if (distances[j] > distances[j + 1]) {
          const td = distances[j]; distances[j] = distances[j + 1]; distances[j + 1] = td;
          const ti = indices[j]; indices[j] = indices[j + 1]; indices[j + 1] = ti;
        }
      }
    }
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < k; i++) {
      const back = indices[i];
      const lbl = b - back >= 0 ? labelOf[b - back] : 0; // price[i] > sT[i] with na is false
      const w = 1 / (distances[i] + 1e-6);
      weightedSum += w * lbl;
      totalWeight += w;
    }
    label_[b] = weightedSum / totalWeight;
  }

  const col = label_.map((l) => (l === 1 ? cfg.upCol : l === 0 ? cfg.dnCol : cfg.neCol));
  const fillCol = col.map((c) => String(color.new(c, 90)));

  // Signals
  const startUp: boolean[] = [], startDn: boolean[] = [], trendUp: boolean[] = [], trendDn: boolean[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < nb; i++) {
    const c1 = i > 0 ? col[i - 1] : undefined; // col[1] na on the first bar: != is true, == is false
    const su = col[i] === cfg.upCol && (c1 !== cfg.upCol || c1 === cfg.neCol) && cfg.aiSignals;
    const sd = col[i] === cfg.dnCol && (c1 !== cfg.dnCol || c1 === cfg.neCol) && cfg.aiSignals;
    const d1 = at(direction, i - 1);
    const tu = direction[i] === -1 && d1 === 1 && label_[i] === 1 && cfg.aiSignals;
    const td = direction[i] === 1 && d1 === -1 && label_[i] === 0 && cfg.aiSignals;
    startUp.push(su); startDn.push(sd); trendUp.push(tu); trendDn.push(td);
    const st = superTrend[i];
    if (isNaN(st)) continue;
    const t = bars[i].time;
    if (su) markers.push({ id: 'shape0', time: t, position: 'atPriceMiddle', price: st, shape: 'circle', color: cfg.bullishCol, size: 'tiny' });
    if (sd) markers.push({ id: 'shape1', time: t, position: 'atPriceMiddle', price: st, shape: 'circle', color: cfg.bearishCol, size: 'tiny' });
    if (tu) markers.push({ id: 'shape2', time: t, position: 'atPriceMiddle', price: st, shape: 'triangleUp', color: cfg.bullishCol, size: 'small' });
    if (td) markers.push({ id: 'shape3', time: t, position: 'atPriceMiddle', price: st, shape: 'triangleDown', color: cfg.bearishCol, size: 'small' });
  }

  const line = (f: (i: number) => number) => bars.map((b, i) => ({ time: b.time, value: f(i), color: col[i] }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(current_superTrend, color = col, title = "Volume Super Trend AI")
      plot0: line((i) => superTrend[i]),
      // plot(superTrend == lowerBand ? current_superTrend : na, "Up Volume Super Trend AI", col, linebr)
      plot1: line((i) => (superTrend[i] === lowerBand[i] ? superTrend[i] : NaN)),
      // Middle = plot((open + close) / 2, display = display.none, editable = false)
      plot2: bars.map((b) => ({ time: b.time, value: (b.open + b.close) / 2 })),
      // plot(superTrend == upperBand ? current_superTrend : na, "Down Volume Super Trend AI", col, linebr)
      plot3: line((i) => (superTrend[i] === upperBand[i] ? superTrend[i] : NaN)),
    },
    // fill(Middle, upTrend / downTrend, color.new(col, 90), fillgaps = false)
    fills: [
      { plot1: 'plot2', plot2: 'plot1', options: { title: 'Up Volume Super Trend AI' }, colors: fillCol },
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Down Volume Super Trend AI' }, colors: fillCol },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [
      startUp,
      startDn,
      startUp.map((v, i) => v || startDn[i]),
      trendUp,
      trendDn,
      trendUp.map((v, i) => v || trendDn[i]),
    ]),
  };
}

export const VolumeSuperTrendAi = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
