/**
 * Simplified Percentile Clustering (SPC)
 *
 * Six features: RSI, CCI, Fisher transform of hl2, DMI difference (+DI - -DI), z-score of the close and close / MA
 * (SMA or EMA); RSI, CCI, Fisher, DMI and MAR can be standardised with a z-score over `lookback` bars. For each
 * feature the last `lookback` values are sorted; the centers are the averages of the SMA(lookback) with the lower
 * and with the upper percentile value (index floor((size - 1) * pct / 100) of the sorted values, na values last),
 * plus the SMA itself as the middle center when K = 3. Each bar goes to the nearest center: in "Clusters" mode the
 * distance is the average of the absolute feature distances of the enabled features, else the distance of the
 * chosen feature. The "Clusters" line interpolates between the nearest and the second nearest cluster index by
 * min / (min + second) distance; histograms show the cluster, step lines the centers, and the bars take the
 * cluster colour (gray when the plotted value is na).
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): "SPC: Market regime shifted → Now in
 * cluster k<n>" on each bar whose cluster differs from the cluster of the bar before (and on bar 0, where the cluster
 * of the bar before is na: the comparison is false).
 *
 * Reference: "Simplified Percentile Clustering" by InvestorUnknown
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © InvestorUnknown
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BarColorData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

type MainPlot = 'Clusters' | 'RSI' | 'CCI' | 'Fisher' | 'DMI' | 'Z-Score' | 'MAR';

export interface SimplifiedPercentileClusteringInputs {
  useRsi: boolean;
  rsiLength: number;
  rsiStandardize: boolean;
  useCci: boolean;
  cciLength: number;
  cciStandardize: boolean;
  useFisher: boolean;
  fisherLength: number;
  fisherStandardize: boolean;
  useDmi: boolean;
  dmiLength: number;
  dmiStandardize: boolean;
  useZscore: boolean;
  zscoreLength: number;
  useMar: boolean;
  marLength: number;
  /** Moving average of the close / MA feature */
  maType: 'SMA' | 'EMA';
  marStandardize: boolean;
  /** Number of cluster centers (2 or 3) */
  k: number;
  /** Bars of the percentile, SMA and standardisation windows */
  lookback: number;
  pLow: number;
  pHigh: number;
  mainPlot: MainPlot;
  /** Plot the cluster line in "Clusters" mode */
  plotClusterLine: boolean;
}

export const defaultInputs: SimplifiedPercentileClusteringInputs = {
  useRsi: true,
  rsiLength: 14,
  rsiStandardize: true,
  useCci: true,
  cciLength: 20,
  cciStandardize: true,
  useFisher: true,
  fisherLength: 9,
  fisherStandardize: true,
  useDmi: true,
  dmiLength: 9,
  dmiStandardize: true,
  useZscore: true,
  zscoreLength: 20,
  useMar: true,
  marLength: 14,
  maType: 'SMA',
  marStandardize: true,
  k: 2,
  lookback: 1000,
  pLow: 5.0,
  pHigh: 95.0,
  mainPlot: 'Clusters',
  plotClusterLine: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'useRsi', type: 'bool', title: 'Use RSI', defval: true },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'rsiStandardize', type: 'bool', title: 'Standardize RSI', defval: true },
  { id: 'useCci', type: 'bool', title: 'Use CCI', defval: true },
  { id: 'cciLength', type: 'int', title: 'CCI Length', defval: 20 },
  { id: 'cciStandardize', type: 'bool', title: 'Standardize CCI', defval: true },
  { id: 'useFisher', type: 'bool', title: 'Use Fisher', defval: true },
  { id: 'fisherLength', type: 'int', title: 'Fisher Length', defval: 9 },
  { id: 'fisherStandardize', type: 'bool', title: 'Standardize Fisher', defval: true },
  { id: 'useDmi', type: 'bool', title: 'Use DMI', defval: true },
  { id: 'dmiLength', type: 'int', title: 'DMI Length', defval: 9 },
  { id: 'dmiStandardize', type: 'bool', title: 'Standardize DMI', defval: true },
  { id: 'useZscore', type: 'bool', title: 'Use Z-Score', defval: true },
  { id: 'zscoreLength', type: 'int', title: 'Z-Score Length', defval: 20 },
  { id: 'useMar', type: 'bool', title: 'Use MAR', defval: true },
  { id: 'marLength', type: 'int', title: 'MA Length', defval: 14 },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'SMA', options: ['SMA', 'EMA'] },
  { id: 'marStandardize', type: 'bool', title: 'Standardize MAR', defval: true },
  { id: 'k', type: 'int', title: 'K Clusters', defval: 2, min: 2, max: 3 },
  { id: 'lookback', type: 'int', title: 'Lookback', defval: 1000 },
  { id: 'pLow', type: 'float', title: 'Lower Percentile', defval: 5.0 },
  { id: 'pHigh', type: 'float', title: 'Upper Percentile', defval: 95.0 },
  { id: 'mainPlot', type: 'string', title: 'Main Plot', defval: 'Clusters', options: ['Clusters', 'RSI', 'CCI', 'Fisher', 'DMI', 'Z-Score', 'MAR'] },
  { id: 'plotClusterLine', type: 'bool', title: 'Plot Cluster Line', defval: false },
];

const RED20 = String(color.new(color.red, 20));
const GREEN20 = String(color.new(color.green, 20));
const ORANGE20 = String(color.new(color.orange, 20));
const GRAY80 = String(color.new(color.gray, 80));
const GUIDE = String(color.new(color.gray, 70));
const RED30 = String(color.new(color.red, 30));
const GREEN30 = String(color.new(color.green, 30));
const ORANGE30 = String(color.new(color.orange, 30));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Guide Line 1', color: GUIDE, lineWidth: 1 },
  { id: 'plot1', title: 'Guide Line 2', color: GUIDE, lineWidth: 1 },
  { id: 'plot2', title: 'Clusers line', color: String(color.new(color.green, 50)), lineWidth: 1 },
  { id: 'plot3', title: 'Cluster Circles', color: GREEN20, lineWidth: 1, style: 'circles' },
  { id: 'plot4', title: 'Cluster k0 Histogram', color: RED20, lineWidth: 1, style: 'histogram', histbase: 0 },
  { id: 'plot5', title: 'Cluster k1 Histogram', color: GREEN20, lineWidth: 1, style: 'histogram', histbase: 1 },
  { id: 'plot6', title: 'Cluster k2 Histogram', color: GREEN20, lineWidth: 1, style: 'histogram', histbase: 2 },
  { id: 'plot7', title: 'k0 Cluster Center', color: RED30, lineWidth: 2, style: 'stepline' },
  { id: 'plot8', title: 'k1 Cluster Center', color: GREEN30, lineWidth: 2, style: 'stepline' },
  { id: 'plot9', title: 'k2 Cluster Center', color: GREEN30, lineWidth: 2, style: 'stepline' },
];

export const metadata = {
  title: 'Simplified Percentile Clustering',
  shortTitle: 'SPC',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/**
 * x / y with NaN when y is 0: only used where Pine can only get 0 / 0 (NaN) or where Pine itself guards y == 0.
 * A plain Pine division with a non-zero x / 0 gives +/-infinity (see zScore and mar).
 */
const div = (x: number, y: number) => (y === 0 ? NaN : x / y);
/** Pine na() is also true for +/-infinity, and a plot draws nothing for it */
const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

/**
 * get_centers: the last `lookback` values in a var array, sorted ascending with the na values last (Pine
 * array.sort), lower / upper percentile = sorted[floor((size - 1) * pct / 100)], middle = SMA(x, lookback).
 */
function centersOf(x: number[], mid: number[], lookback: number, pLow: number, pHigh: number, k: number): number[][] {
  const n = x.length;
  const out: number[][] = new Array(n);
  const window: number[] = []; // insertion order (with na)
  const sorted: number[] = []; // non-na values, ascending
  let naCount = 0;
  const find = (v: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sorted[m] < v) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
  for (let i = 0; i < n; i++) {
    // array.push(x_arr, x); if array.size(x_arr) > lookback: array.shift(x_arr)
    window.push(x[i]);
    if (isNaN(x[i])) naCount++;
    else sorted.splice(find(x[i]), 0, x[i]);
    if (window.length > lookback) {
      const old = window.shift() as number;
      if (isNaN(old)) naCount--;
      else sorted.splice(find(old), 1);
    }
    const size = window.length;
    const pct = (p: number) => {
      const idx = Math.floor(((size - 1) * p) / 100);
      return idx >= 0 && idx < sorted.length ? sorted[idx] : NaN; // indexes >= sorted.length hold na
    };
    const xHigh = pct(pHigh);
    const xLow = pct(pLow);
    const c0 = (xLow + mid[i]) / 2;
    const c1 = (xHigh + mid[i]) / 2;
    out[i] = k === 2 ? [c0, c1] : [c0, mid[i], c1];
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SimplifiedPercentileClusteringInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { lookback, k, mainPlot } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const closeS = S(close);

  // z_score(src, length) = (src - ta.sma(src, length)) / ta.stdev(src, length): a plain division (x / 0 is
  // +/-infinity). ta.sma / ta.stdev skip +/-infinity values like na, so they get the series with NaN there.
  const zScore = (src: number[], length: number) => {
    const finite = S(src.map(fin));
    const mean = A(ta.sma(finite, length));
    const sd = A(ta.stdev(finite, length));
    return src.map((v, i) => (v - mean[i]) / sd[i]);
  };

  // RSI, CCI
  const rsi = A(ta.rsi(closeS, cfg.rsiLength));
  const rsiVal = cfg.rsiStandardize ? zScore(rsi, lookback) : rsi;
  const cci = A(ta.cci(closeS, cfg.cciLength));
  const cciVal = cfg.cciStandardize ? zScore(cci, lookback) : cci;

  // fisher(len): value := round_(.66 * ((hl2 - low_) / (high_ - low_) - .5) + .67 * nz(value[1]))
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const hi = A(ta.highest(S(hl2), cfg.fisherLength));
  const lo = A(ta.lowest(S(hl2), cfg.fisherLength));
  const round = (v: number) => (gt(v, 0.99) ? 0.999 : lt(v, -0.99) ? -0.999 : v);
  const fisher: number[] = new Array(n);
  let value = NaN;
  let fish = NaN;
  for (let i = 0; i < n; i++) {
    value = round(0.66 * (div(hl2[i] - lo[i], hi[i] - lo[i]) - 0.5) + 0.67 * (isNaN(value) ? 0 : value));
    fish = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * (isNaN(fish) ? 0 : fish);
    fisher[i] = fish;
  }
  const fisherVal = cfg.fisherStandardize ? zScore(fisher, lookback) : fisher;

  // dmi_difference(len): fixnan(100 * rma(plusDM) / rma(tr)) - fixnan(100 * rma(minusDM) / rma(tr))
  const plusDM: number[] = new Array(n);
  const minusDM: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const up = i > 0 ? bars[i].high - bars[i - 1].high : NaN;
    const down = i > 0 ? -(bars[i].low - bars[i - 1].low) : NaN;
    plusDM[i] = isNaN(up) ? NaN : gt(up, down) && gt(up, 0) ? up : 0;
    minusDM[i] = isNaN(down) ? NaN : gt(down, up) && gt(down, 0) ? down : 0;
  }
  const trur = A(ta.rma(ta.tr(bars, false), cfg.dmiLength));
  const plusR = A(ta.rma(S(plusDM), cfg.dmiLength));
  const minusR = A(ta.rma(S(minusDM), cfg.dmiLength));
  const dmi: number[] = new Array(n);
  let plus = NaN;
  let minus = NaN;
  for (let i = 0; i < n; i++) {
    const p = div(100 * plusR[i], trur[i]);
    const m = div(100 * minusR[i], trur[i]);
    if (!isNaN(p)) plus = p; // fixnan
    if (!isNaN(m)) minus = m;
    dmi[i] = plus - minus;
  }
  const dmiVal = cfg.dmiStandardize ? zScore(dmi, lookback) : dmi;

  // z-score of the close
  const zscVal = zScore(close, cfg.zscoreLength);

  // close / MA
  const ma = A(cfg.maType === 'EMA' ? ta.ema(closeS, cfg.marLength) : ta.sma(closeS, cfg.marLength));
  const mar = close.map((c, i) => c / ma[i]); // plain division: x / 0 is +/-infinity
  const marVal = cfg.marStandardize ? zScore(mar, lookback) : mar;

  // centers of each feature
  const feats = [rsiVal, cciVal, fisherVal, dmiVal, zscVal, marVal];
  // x_mid = ta.sma(x, lookback) (skips +/-infinity like na); the sorted window keeps +/-infinity in numeric order
  const centers = feats.map((x) => centersOf(x, A(ta.sma(S(x.map(fin)), lookback)), lookback, cfg.pLow, cfg.pHigh, k));
  const uses: number[] = [cfg.useRsi, cfg.useCci, cfg.useFisher, cfg.useDmi, cfg.useZscore, cfg.useMar].map((u) => (u ? 1 : 0));
  const useCount = uses.reduce((a, b) => a + b, 0);
  const single: Record<string, number> = { RSI: 0, CCI: 1, Fisher: 2, DMI: 3, 'Z-Score': 4, MAR: 5 };
  const f = mainPlot === 'Clusters' ? -1 : single[mainPlot];

  const colorOf = (cluster: number) => (k === 2
    ? (cluster === 0 ? RED20 : cluster === 1 ? GREEN20 : GRAY80)
    : (cluster === 0 ? RED20 : cluster === 1 ? ORANGE20 : cluster === 2 ? GREEN20 : GRAY80));

  const plotVal: number[] = new Array(n);
  const clusterVal: number[] = new Array(n);
  const currColor: string[] = new Array(n);
  const kCenter: number[][] = [new Array(n), new Array(n), new Array(n)];
  const alertCalls: AlertCall[] = [];
  for (let t = 0; t < n; t++) {
    let minDist = NaN;
    let secondMinDist = NaN;
    let curr = -1; // curr_cluster (index of "k0" / "k1" / "k2")
    let second = -1;
    for (let i = 0; i < k; i++) {
      let dist: number;
      if (f >= 0) {
        dist = Math.abs(feats[f][t] - centers[f][t][i]);
      } else {
        // average of the feature distances weighted by on_off(use_*) (na * 0 is na)
        let sum = 0;
        for (let j = 0; j < 6; j++) sum += Math.abs(feats[j][t] - centers[j][t][i]) * uses[j];
        dist = div(sum, useCount);
      }
      // na(min_dist) or dist < min_dist (na() is true for +/-infinity)
      if (!Number.isFinite(minDist) || lt(dist, minDist)) {
        secondMinDist = minDist;
        second = curr;
        minDist = dist;
        curr = i;
      } else if (!Number.isFinite(secondMinDist) || lt(dist, secondMinDist)) {
        secondMinDist = dist;
        second = i;
      }
    }
    const cluster = curr; // cluster_val (curr_cluster is never na: the loop runs k >= 2 times)
    // rel_pos = second_min_dist == 0 ? 0 : min_dist / (min_dist + second_min_dist)
    const relPos = !isNaN(secondMinDist) && Math.abs(secondMinDist) <= EPS ? 0 : div(minDist, minDist + secondMinDist);
    const secondVal = second === 0 ? 0 : second === 1 ? 1 : 2;
    const realClust = cluster + (secondVal - cluster) * relPos;
    const pv = f >= 0 ? feats[f][t] : realClust;
    plotVal[t] = pv;
    clusterVal[t] = cluster;
    // if not (curr_cluster == curr_cluster[1]): alert("SPC: Market regime shifted → Now in cluster " +
    //   str.tostring(curr_cluster), freq = alert.freq_once_per_bar_close) (curr_cluster[1] is na on bar 0)
    if (t === 0 || clusterVal[t - 1] !== cluster) {
      alertCalls.push({ time: bars[t].time as number, message: 'SPC: Market regime shifted → Now in cluster k' + cluster, freq: 'once_per_bar_close' });
    }
    currColor[t] = !Number.isFinite(pv) ? GRAY80 : colorOf(cluster); // if na(plot_val): gray
    kCenter[0][t] = f >= 0 ? centers[f][t][0] : 0;
    kCenter[1][t] = f >= 0 ? centers[f][t][1] : 1;
    kCenter[2][t] = f >= 0 ? (k > 2 ? centers[f][t][2] : NaN) : k > 2 ? 2 : 0;
  }

  const clusters = mainPlot === 'Clusters';
  const P = (value: (i: number) => number, col: (i: number) => string) =>
    bars.map((b, i) => ({ time: b.time, value: fin(value(i)), color: col(i) }));
  const has = (i: number) => Number.isFinite(plotVal[i]);
  const cur = (i: number) => currColor[i];
  const hist = (c: number) => P((i) => (clusters && clusterVal[i] === c ? plotVal[i] : NaN), cur);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P((i) => (has(i) && clusters ? 0.5 : NaN), () => GUIDE),
      plot1: P((i) => (has(i) && clusters && k === 3 ? 1.5 : NaN), () => GUIDE),
      // plot(main_plot == "Clusters" ? (plot_cl ? plot_val : na) : plot_val, color = color.new(curr_color, 50))
      plot2: P((i) => (clusters ? (cfg.plotClusterLine ? plotVal[i] : NaN) : plotVal[i]), (i) => String(color.new(cur(i), 50))),
      plot3: P((i) => plotVal[i], cur),
      plot4: hist(0),
      plot5: hist(1),
      plot6: hist(2),
      plot7: P((i) => (has(i) && k >= 1 ? kCenter[0][i] : NaN), () => RED30),
      plot8: P((i) => (has(i) && k >= 2 ? kCenter[1][i] : NaN), () => (k <= 2 ? GREEN30 : ORANGE30)),
      plot9: P((i) => (has(i) && k === 3 ? kCenter[2][i] : NaN), () => GREEN30),
    },
    // barcolor(curr_color)
    barColors: bars.map((b, i) => ({ time: b.time as number, color: currColor[i] })),
    alertCalls,
  };
}

export const SimplifiedPercentileClustering = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
