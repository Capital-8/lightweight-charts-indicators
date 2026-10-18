/**
 * Machine Learning Adaptive SuperTrend [AlgoAlpha]
 *
 * The ATR ('ATR Length') of the last 'Training Data Length' bars is split into three clusters (high, medium and low
 * volatility) by k-means: the three centroids start at the 'Initial ... Percentile Guess' points of the ATR range of
 * that window and are moved to the mean of their points until none of them changes. The current ATR is assigned to
 * the nearest centroid, and that centroid is the ATR of a SuperTrend ('SuperTrend Factor', bands on hl2).
 * Drawn: the SuperTrend below the price (bullish colour) and above it (bearish colour), each with a gradient fill to
 * the middle of the candle body (a hidden "Body Middle" plot); a "▲" / "▼" label on each trend change; on every bar a
 * text label (3 high, 2 medium, 1 low volatility; the last 500 kept) one ATR(7) beyond the SuperTrend; on the last
 * bar a table of the centroids, the cluster sizes (in the original's order: the "3 (High)" row shows the size of the
 * low-volatility cluster and the reverse) and the current volatility level.
 *
 * Chart values read (optional third argument of calculate): the chart foreground / background colours (marker texts,
 * table; without them #DBDBDB / #0F0F0F) and the state of the last bar (`barstate.isconfirmed` of the alerts).
 * Alerts (alertcondition, `alerts` of the result): the trend shifts and the volatility cluster changes, on confirmed
 * bars; the original declares 'Low Volatility' twice.
 *
 * Reference: "Machine Learning Adaptive SuperTrend [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import { ta, Series, color, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, LabelData, TableData, TableCellData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { backgroundColorOf, foregroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface MlAdaptiveSupertrendInputs {
  /** ATR Length */
  atrLen: number;
  /** SuperTrend Factor */
  fact: number;
  /** Training Data Length */
  trainLen: number;
  /** Initial High volatility Percentile Guess */
  highvol: number;
  /** Initial Medium volatility Percentile Guess */
  midvol: number;
  /** Initial Low volatility Percentile Guess */
  lowvol: number;
  /** Transparency 1 */
  t1: number;
  /** Transparency 2 */
  t2: number;
  /** Bullish Color */
  green: string;
  /** Bearish Color */
  red: string;
}

export const defaultInputs: MlAdaptiveSupertrendInputs = {
  atrLen: 10,
  fact: 3,
  trainLen: 100,
  highvol: 0.75,
  midvol: 0.5,
  lowvol: 0.25,
  t1: 70,
  t2: 95,
  green: '#00ffbb',
  red: '#ff1100',
};

export const inputConfig: InputConfig[] = [
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 10, group: 'SuperTrend Settings' },
  { id: 'fact', type: 'float', title: 'SuperTrend Factor', defval: 3, group: 'SuperTrend Settings' },
  { id: 'trainLen', type: 'int', title: 'Training Data Length', defval: 100, group: 'K-Means Settings' },
  {
    id: 'highvol', type: 'float', title: 'Initial High volatility Percentile Guess', defval: 0.75, max: 1, group: 'K-Means Settings',
    tooltip: "The initial guess of where the potential 'high volatility' area is, a value of 0.75 will take the 75th percentile of the range of ATR values over the training data period",
  },
  {
    id: 'midvol', type: 'float', title: 'Initial Medium volatility Percentile Guess', defval: 0.5, max: 1, group: 'K-Means Settings',
    tooltip: "The initial guess of where the potential 'medium volatility' area is, a value of 0.5 will take the 50th percentile of the range of ATR values over the training data period",
  },
  {
    id: 'lowvol', type: 'float', title: 'Initial Low volatility Percentile Guess', defval: 0.25, max: 1, group: 'K-Means Settings',
    tooltip: "The initial guess of where the potential 'low volatility' area is, a value of 0.25 will take the 25th percentile of the range of ATR values over the training data period",
  },
  { id: 't1', type: 'int', title: 'Transparency 1', defval: 70, min: 0, max: 100, group: 'Appearance' },
  { id: 't2', type: 'int', title: 'Transparency 2', defval: 95, min: 0, max: 100, group: 'Appearance' },
  { id: 'green', type: 'color', title: 'Bullish Color', defval: '#00ffbb', group: 'Appearance' },
  { id: 'red', type: 'color', title: 'Bearish Color', defval: '#ff1100', group: 'Appearance' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: String(color.new('#00ffbb', 70)), lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Plot', color: String(color.new('#ff1100', 70)), lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Body Middle', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Machine Learning Adaptive SuperTrend [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - 🤖 Adaptive SuperTrend',
  overlay: true,
};

/** The original's alertconditions ('Low Volatility' is declared twice) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Shift', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Bearish Trend Shift', message: 'Alert Fired!' },
  { id: 'alert2', title: 'High Volatility', message: 'Alert Fired!' },
  { id: 'alert3', title: 'Medium Volatility', message: 'Alert Fired!' },
  { id: 'alert4', title: 'Low Volatility', message: 'Alert Fired!' },
  { id: 'alert5', title: 'Low Volatility', message: 'Alert Fired!' },
];

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;
/** Safety bound of the k-means loop (the means of a one-dimensional k-means settle in a few passes) */
const MAX_ITERATIONS = 10000;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const nz = (v: number) => (Number.isNaN(v) ? 0 : v);

export function calculate(
  bars: Bar[],
  inputs: Partial<MlAdaptiveSupertrendInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & {
    markers: MarkerData[];
    labels: LabelData[];
    tables: TableData[];
    alerts: AlertConditionState[];
  } {
  const { atrLen, fact, trainLen, highvol, midvol, lowvol, t1, t2, green, red } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const chartFg = foregroundColorOf(chart);
  const chartBg = backgroundColorOf(chart);
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));

  // volatility = ta.atr(atr_len); upper / lower = highest / lowest over the training data
  const volatility = A(ta.atr(bars, atrLen));
  const upper = A(ta.highest(Series.fromArray(bars, volatility), trainLen));
  const lower = A(ta.lowest(Series.fromArray(bars, volatility), trainLen));
  const atr7 = A(ta.atr(bars, 7));

  const cluster = new Array<number>(n).fill(-1);
  const assigned = new Array<number>(n).fill(NaN);
  let lastHv = NaN, lastMv = NaN, lastLv = NaN, lastSizeA = 0, lastSizeB = 0, lastSizeC = 0;

  for (let i = 0; i < n; i++) {
    const range = upper[i] - lower[i];
    // amean / bmean / cmean: the history of the means, the newest first
    const amean = [lower[i] + range * highvol];
    const bmean = [lower[i] + range * midvol];
    const cmean = [lower[i] + range * lowvol];
    let sizeA = 0, sizeB = 0, sizeC = 0;
    if (nz(volatility[i]) > 0 && i >= trainLen - 1) {
      const moving = (m: number[]) => m.length === 1 || ne(m[0], m[1]);
      let guard = 0;
      while ((moving(amean) || moving(bmean) || moving(cmean)) && guard++ < MAX_ITERATIONS) {
        let sa = 0, sb = 0, sc = 0;
        sizeA = 0; sizeB = 0; sizeC = 0;
        for (let k = trainLen - 1; k >= 0; k--) {
          const v = i - k >= 0 ? volatility[i - k] : NaN;
          const d1 = Math.abs(v - amean[0]);
          const d2 = Math.abs(v - bmean[0]);
          const d3 = Math.abs(v - cmean[0]);
          if (lt(d1, d2) && lt(d1, d3)) { sa += v; sizeA++; }
          if (lt(d2, d1) && lt(d2, d3)) { sb += v; sizeB++; }
          if (lt(d3, d1) && lt(d3, d2)) { sc += v; sizeC++; }
        }
        // array.avg of an empty array is na
        amean.unshift(sizeA ? sa / sizeA : NaN);
        bmean.unshift(sizeB ? sb / sizeB : NaN);
        cmean.unshift(sizeC ? sc / sizeC : NaN);
      }
    }
    const centroids = [amean[0], bmean[0], cmean[0]];
    const distances = centroids.map((c) => Math.abs(volatility[i] - c));
    // distances.indexof(distances.min()): array.min skips na; indexof of na is -1
    let min = NaN;
    for (const d of distances) if (!Number.isNaN(d) && (Number.isNaN(min) || d < min)) min = d;
    const c = Number.isNaN(min) ? -1 : distances.findIndex((d) => eq(d, min));
    cluster[i] = c;
    assigned[i] = c === -1 ? NaN : centroids[c];
    if (i === n - 1) {
      [lastHv, lastMv, lastLv] = centroids;
      lastSizeA = sizeA; lastSizeB = sizeB; lastSizeC = sizeC;
    }
  }

  // [ST, dir] = pine_supertrend(fact, assigned_centroid)
  const st = new Array<number>(n).fill(NaN);
  const dir = new Array<number>(n).fill(1);
  let prevLb = NaN, prevUb = NaN;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const src = (b.high + b.low) / 2;
    let ub = src + fact * assigned[i];
    let lb = src - fact * assigned[i];
    const pLb = nz(prevLb);
    const pUb = nz(prevUb);
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    lb = gt(lb, pLb) || lt(close1, pLb) ? lb : pLb;
    ub = lt(ub, pUb) || gt(close1, pUb) ? ub : pUb;
    const prevSt = i > 0 ? st[i - 1] : NaN;
    let d: number;
    if (Number.isNaN(i > 0 ? assigned[i - 1] : NaN)) d = 1;
    else if (eq(prevSt, pUb)) d = gt(b.close, ub) ? -1 : 1;
    else d = lt(b.close, lb) ? 1 : -1;
    dir[i] = d;
    st[i] = d === -1 ? lb : ub;
    prevLb = lb;
    prevUb = ub;
  }

  const greenT1 = String(color.new(green, t1));
  const greenT2 = String(color.new(green, t2));
  const redT1 = String(color.new(red, t1));
  const redT2 = String(color.new(red, t2));
  const plot0 = bars.map((b, i) => ({ time: b.time, value: gt(b.close, st[i]) ? st[i] : NaN, color: greenT1 }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: lt(b.close, st[i]) ? st[i] : NaN, color: redT1 }));
  const bodyMid = bars.map((b) => (b.open + b.close) / 2);
  const plot2 = bars.map((b, i) => ({ time: b.time, value: i === 0 ? NaN : bodyMid[i] }));

  const bullShift = crossedUnder(dir, 0);
  const bearShift = crossedOver(dir, 0);
  const markers: MarkerData[] = [];
  const labels: LabelData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    if (bullShift[i] && Number.isFinite(st[i])) {
      markers.push({
        id: 'shape0', time: t, position: 'atPriceBottom', price: st[i], shape: 'labelUp', color: green, text: '▲',
        textColor: chartFg, size: 'small',
      });
    }
    if (bearShift[i] && Number.isFinite(st[i])) {
      markers.push({
        id: 'shape1', time: t, position: 'atPriceTop', price: st[i], shape: 'labelDown', color: red, text: '▼',
        textColor: chartFg, size: 'small',
      });
    }
    // label.new(bar_index, dir > 0 ? ST + ta.atr(7) : ST - ta.atr(7), str.tostring(4 - (cluster + 1)), style_none)
    const base = dir[i] > 0 ? red : green;
    labels.push({
      time: t,
      price: dir[i] > 0 ? st[i] + atr7[i] : st[i] - atr7[i],
      text: String(4 - (cluster[i] + 1)),
      style: 'none',
      textColor: String(color.from_gradient(cluster[i] + 1, 1, 3, color.new(base, 30), color.new(base, 90))),
    });
  }
  // the last 500 labels are kept; a label at na is not drawn
  const shownLabels = labels.slice(-MAX_LABELS).filter((l) => Number.isFinite(l.price));

  const tables: TableData[] = [];
  if (n > 0) {
    const vol = volatility[n - 1];
    const c = cluster[n - 1];
    const f = (v: number) => str.format('{0,number,#.##}', v);
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string, textColor: string, bgColor?: string) => {
      cells.push({ column, row, text, textColor, textHAlign: 'center', ...(bgColor ? { bgColor } : {}) });
    };
    cell(0, 0, 'Cluster Number (Volatility Level)', chartFg);
    cell(1, 0, 'Cluster Centroid (ATR)', chartFg);
    cell(2, 0, 'Cluster Size (No. of Data Points in Each Cluster)', chartFg);
    cell(3, 0, 'Current Volatility', chartFg);
    cell(0, 1, '3 (High)', chartFg);
    cell(0, 2, '2 (Medium)', chartFg);
    cell(0, 3, '1 (Low)', chartFg);
    cell(1, 1, f(lastHv), chartFg);
    cell(1, 2, f(lastMv), chartFg);
    cell(1, 3, f(lastLv), chartFg);
    cell(2, 1, f(lastSizeC), chartFg);
    cell(2, 2, f(lastSizeB), chartFg);
    cell(2, 3, f(lastSizeA), chartFg);
    cell(3, 1, `HIGH (ATR: ${f(vol)})`, chartBg, c === 0 ? chartFg : chartBg);
    cell(3, 2, `MEDIUM (ATR: ${f(vol)})`, chartBg, c === 1 ? chartFg : chartBg);
    cell(3, 3, `LOW (ATR: ${f(vol)})`, chartBg, c === 2 ? chartFg : chartBg);
    tables.push({
      position: 'top_right', columns: 4, rows: 4, cells, bgColor: chartBg,
      borderWidth: 1, borderColor: chartFg, frameColor: chartFg, frameWidth: 1,
    });
  }

  // alertconditions, on confirmed bars (the last bar only when the chart context says it is closed)
  const lastConfirmed = lastBarConfirmedOf(chart);
  const confirmed = (i: number) => i < n - 1 || lastConfirmed;
  const changedTo = (k: number) => cluster.map((c, i) => confirmed(i) && c === k && i > 0 && cluster[i - 1] !== k);
  const lowFlags = changedTo(2);
  const flags = [
    bullShift.map((v, i) => v && confirmed(i)),
    bearShift.map((v, i) => v && confirmed(i)),
    changedTo(0),
    changedTo(1),
    lowFlags,
    lowFlags,
  ];

  const constant = (v: string) => new Array<string>(n).fill(v);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [
      {
        plot1: 'plot2', plot2: 'plot0', options: { title: 'Plots Background' },
        gradient: { topValue: bodyMid, bottomValue: st.slice(), topColor: constant(greenT2), bottomColor: constant(greenT1) },
      },
      {
        plot1: 'plot2', plot2: 'plot1', options: { title: 'Plots Background' },
        gradient: { topValue: st.slice(), bottomValue: bodyMid.slice(), topColor: constant(redT1), bottomColor: constant(redT2) },
      },
    ],
    markers,
    labels: shownLabels,
    tables,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

export const MlAdaptiveSupertrend = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
