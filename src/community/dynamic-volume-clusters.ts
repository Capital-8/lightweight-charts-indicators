/**
 * Dynamic Volume Clusters with Retest Signals
 *
 * The highest high and lowest low over the range lookback give an upper and a lower zone (zone width = a percentage
 * of the range). Each close inside the upper zone restarts the upper line at that close; after two more bars the
 * line becomes the running average of the following closes. The lower line works the same way from the lower zone.
 * The line colours are gradients set by the number of bars (range lookback) whose high-low range contains the line.
 * Retest triangles: close crossing up the upper line while the 5-bar SMA rises (or down the lower line while it
 * falls), within a bar window after the last restart. The candles are coloured by a dynamic price cluster: an
 * adaptive EMA of close (length from the normalised distance between the two lines, faster when that distance
 * changes quickly) smoothed by a simple Kalman-style filter. The volume power values of the Pine script are not
 * used by any Pine output and are not computed.
 *
 * Reference: "Dynamic Volume Clusters with Retest Signals (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';

export interface DynamicVolumeClustersInputs {
  /** Range lookback period (also the bar count window of the line colours) */
  len: number;
  /** Zone width, % of the range */
  zoneP: number;
  /** Upper line colours (gradient bottom / top) */
  red1: string;
  red2: string;
  /** Lower line colours (gradient bottom / top) */
  green1: string;
  green2: string;
  /** Line width */
  width: number;
  retestSignals: boolean;
  /** Minimum bars after a restart for a retest */
  minBarsBetweenSignals: number;
  /** Maximum bars after a restart for a retest */
  maxBarsBetweenSignals: number;
  /** Lower retest (triangle up) colour */
  retestCol1: string;
  /** Upper retest (triangle down) colour */
  retestCol2: string;
  /** Maximum length of the dynamic price cluster */
  maxLength: number;
  /** Kalman-style filter strength of the price cluster */
  filterStrength: number;
  /** Bar count at the bottom of the cluster colour gradient */
  priceClusterStart: number;
  /** Bar count at the top of the cluster colour gradient */
  priceClusterPeak: number;
  bullishCluster1: string;
  bullishCluster2: string;
  bearishCluster1: string;
  bearishCluster2: string;
}

export const defaultInputs: DynamicVolumeClustersInputs = {
  len: 500,
  zoneP: 1.5,
  red1: color.maroon,
  red2: '#FF0000',
  green1: color.green,
  green2: '#09ff00',
  width: 2,
  retestSignals: true,
  minBarsBetweenSignals: 10,
  maxBarsBetweenSignals: 200,
  retestCol1: color.lime,
  retestCol2: color.red,
  maxLength: 500,
  filterStrength: 0.01,
  priceClusterStart: 2,
  priceClusterPeak: 100,
  bullishCluster1: color.lime,
  bullishCluster2: '#14e4ff',
  bearishCluster1: color.red,
  bearishCluster2: '#14e4ff',
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Range Lookback Period', defval: 500, min: 2 },
  { id: 'zoneP', type: 'float', title: 'Zone Width (% of Range)', defval: 1.5, min: 1, max: 50, step: 0.5 },
  { id: 'red1', type: 'color', title: 'Upper Line Color 1', defval: color.maroon },
  { id: 'red2', type: 'color', title: 'Upper Line Color 2', defval: '#FF0000' },
  { id: 'green1', type: 'color', title: 'Lower Line Color 1', defval: color.green },
  { id: 'green2', type: 'color', title: 'Lower Line Color 2', defval: '#09ff00' },
  { id: 'width', type: 'int', title: 'Width', defval: 2, min: 1, max: 10 },
  { id: 'retestSignals', type: 'bool', title: 'Retest Signals', defval: true },
  { id: 'minBarsBetweenSignals', type: 'int', title: 'Minimum Bars to initite a Retest', defval: 10, min: 1 },
  { id: 'maxBarsBetweenSignals', type: 'int', title: 'Maximum Bars Between Retests', defval: 200, min: 1 },
  { id: 'retestCol1', type: 'color', title: 'Retest Color 1', defval: color.lime },
  { id: 'retestCol2', type: 'color', title: 'Retest Color 2', defval: color.red },
  { id: 'maxLength', type: 'int', title: 'Price Cluster Period', defval: 500, min: 1 },
  { id: 'filterStrength', type: 'float', title: 'Cluster Confirmation', defval: 0.01, min: 0.005, max: 1, step: 0.005 },
  { id: 'priceClusterStart', type: 'int', title: 'Price Cluster Start', defval: 2, min: 1 },
  { id: 'priceClusterPeak', type: 'int', title: 'Price Cluster Peak', defval: 100, min: 1 },
  { id: 'bullishCluster1', type: 'color', title: 'Bullish Cluster Color 1', defval: color.lime },
  { id: 'bullishCluster2', type: 'color', title: 'Bullish Cluster Color 2', defval: '#14e4ff' },
  { id: 'bearishCluster1', type: 'color', title: 'Bearish Cluster Color 1', defval: color.red },
  { id: 'bearishCluster2', type: 'color', title: 'Bearish Cluster Color 2', defval: '#14e4ff' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VPMA Upper', color: '#FF0000', lineWidth: 2 },
  { id: 'plot1', title: 'VPMA Lower', color: '#09ff00', lineWidth: 2 },
];

export const metadata = {
  title: 'Dynamic Volume Clusters with Retest Signals (Zeiierman)',
  shortTitle: 'Dynamic Volume Clusters',
  overlay: true,
};

/** Pine a > b: true only when a - b > 1e-10 (float comparison tolerance); false when a value is na */
const gt = (a: number, b: number) => a - b > 1e-10;
/** Pine a < b */
const lt = (a: number, b: number) => gt(b, a);
/** Pine a >= b: not (a < b), false when a value is na */
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !lt(a, b);
/** Pine a <= b */
const le = (a: number, b: number) => ge(b, a);
/** Pine a == b */
const eq = (a: number, b: number) => ge(a, b) && le(a, b);

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicVolumeClustersInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const at = (a: number[], j: number) => (j >= 0 ? a[j] : NaN);

  // Range boundaries: hh = ta.highest(high, len); ll = ta.lowest(low, len)
  const hh = A(ta.highest(S(high), cfg.len));
  const ll = A(ta.lowest(S(low), cfg.len));

  const vpmU: number[] = new Array(n);
  const vpmL: number[] = new Array(n);
  const lastRetestU: number[] = new Array(n);
  const lastRetestL: number[] = new Array(n);
  let maU = NaN;
  let lenU = 0;
  let countU = 0;
  let maL = NaN;
  let lenL = 0;
  let countL = 0;
  let lastU = 0;
  let lastL = 0;
  for (let i = 0; i < n; i++) {
    const rangee = hh[i] - ll[i];
    const upperZoneTop = hh[i];
    const upperZoneBottom = hh[i] - (rangee * cfg.zoneP) / 100;
    const lowerZoneTop = ll[i] + (rangee * cfg.zoneP) / 100;
    const lowerZoneBottom = ll[i];
    const c = close[i];
    // Restart logic for the upper zone
    if (gt(c, upperZoneBottom) && le(c, upperZoneTop)) {
      maU = c;
      lenU = 1;
      countU = 0;
      lastU = i;
    } else if (lenU > 0) {
      if (countU >= 2) {
        maU = (maU * lenU + c) / (lenU + 1);
        lenU = lenU + 1;
      }
      countU = countU + 1;
    }
    // Restart logic for the lower zone
    if (ge(c, lowerZoneBottom) && lt(c, lowerZoneTop)) {
      maL = c;
      lenL = 1;
      countL = 0;
      lastL = i;
    } else if (lenL > 0) {
      if (countL >= 2) {
        maL = (maL * lenL + c) / (lenL + 1);
        lenL = lenL + 1;
      }
      countL = countL + 1;
    }
    vpmU[i] = maU;
    vpmL[i] = maL;
    lastRetestU[i] = lastU;
    lastRetestL[i] = lastL;
  }

  // Retest signal logic: sma = ta.sma(close, 5); up = ta.rising(sma, 5); dn = ta.falling(sma, 5)
  const sma = S(A(ta.sma(S(close), 5)));
  const up = ta.rising(sma, 5).toArray();
  const dn = ta.falling(sma, 5).toArray();
  const upperRetest: boolean[] = new Array(n);
  const lowerRetest: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // ta.crossover(close, VPMavg_U): close > VPMavg_U and close[1] <= VPMavg_U[1], compared exactly (no 1e-10
    // tolerance; na compares false)
    const crossover = i > 0 && close[i] > vpmU[i] && close[i - 1] <= vpmU[i - 1];
    // ta.crossunder(close, VPMavg_L): close < VPMavg_L and close[1] >= VPMavg_L[1], compared exactly
    const crossunder = i > 0 && close[i] < vpmL[i] && close[i - 1] >= vpmL[i - 1];
    const sinceU = i - lastRetestU[i];
    const sinceL = i - lastRetestL[i];
    upperRetest[i] = cfg.retestSignals && crossover && !!up[i] && sinceU >= cfg.minBarsBetweenSignals
      && sinceU <= cfg.maxBarsBetweenSignals && le(at(vpmU, i - 1), vpmU[i]);
    lowerRetest[i] = cfg.retestSignals && crossunder && !!dn[i] && sinceL >= cfg.minBarsBetweenSignals
      && sinceL <= cfg.maxBarsBetweenSignals && le(vpmL[i], at(vpmL, i - 1));
  }

  // Dynamic price cluster
  // counts_diff = VPMavg_U - VPMavg_L; max_abs_counts_diff = ta.highest(math.abs(counts_diff), 200)
  const countsDiff = vpmU.map((u, i) => u - vpmL[i]);
  const maxAbs = A(ta.highest(S(countsDiff.map(Math.abs)), 200));
  // counts_diff_norm = (counts_diff + max_abs) / (2 * max_abs), a plain division; dyn_length = 5 + norm * (max_length - 5)
  const dynLength = countsDiff.map((d, i) => {
    const norm = (d + maxAbs[i]) / (2 * maxAbs[i]);
    return 5 + norm * (cfg.maxLength - 5);
  });
  // calc_accel_factor(counts_diff, nz(counts_diff[1])): delta = abs(counts_diff - prev);
  // max_delta = ta.highest(delta, 20); max_delta := max_delta == 0 ? 1 : max_delta; delta / max_delta
  const delta = countsDiff.map((d, i) => {
    const prev = at(countsDiff, i - 1);
    return Math.abs(d - (isNaN(prev) ? 0 : prev));
  });
  const maxDelta = A(ta.highest(S(delta), 20)).map((m) => (m === 0 ? 1 : m));
  const accel = delta.map((d, i) => d / maxDelta[i]);
  // adjust_alpha(dyn_length, accel_factor, 5.0): alpha = 2 / (dyn_length + 1) * (1 + accel * 5); math.min(1, alpha)
  const alpha = dynLength.map((l, i) => {
    const a = (2 / (l + 1)) * (1 + accel[i] * 5.0);
    return isNaN(a) ? NaN : Math.min(1, a);
  });
  // dyn_cluster := na(dyn_cluster[1]) ? close : alpha * close + (1 - alpha) * dyn_cluster[1]
  // kf(src): kfRSI := na(kfRSI) ? src : kfRSI + filterStrength * (src - kfRSI)
  const cluster: number[] = new Array(n);
  let dyn = NaN;
  let kf = NaN;
  for (let i = 0; i < n; i++) {
    dyn = isNaN(dyn) ? close[i] : alpha[i] * close[i] + (1 - alpha[i]) * dyn;
    kf = isNaN(kf) ? dyn : kf + cfg.filterStrength * (dyn - kf);
    cluster[i] = kf;
  }

  // cluster_color(avg_val, ...): count of the bars i = 0 .. len - 1 with high[i] >= avg_val and low[i] <= avg_val
  const clusterCount = (i: number, avg: number) => {
    let count = 0;
    for (let k = 0; k <= cfg.len - 1; k++) {
      if (ge(at(high, i - k), avg) && le(at(low, i - k), avg)) count += 1;
    }
    return count;
  };
  const gradient = (count: number, bottom: number, top: number, c1: string, c2: string) =>
    String(color.from_gradient(count, bottom, top, color.new(c1, 20 - count), c2));

  const upperPlot: { time: number; value: number; color: string }[] = [];
  const lowerPlot: { time: number; value: number; color: string }[] = [];
  const candles: PlotCandleData[] = [];
  const markers: MarkerData[] = [];
  const hi5 = A(ta.highest(S(high), 5));
  const lo5 = A(ta.lowest(S(low), 5));
  const trEma = A(ta.ema(ta.tr(bars, false), 20));
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const c = close[i];
    // U_col = VPMavg_U == close ? na : cluster_color(VPMavg_U, true, false, false)
    const uCol = eq(vpmU[i], c) ? 'transparent' : gradient(clusterCount(i, vpmU[i]), 5, 15, cfg.red1, cfg.red2);
    const lCol = eq(vpmL[i], c) ? 'transparent' : gradient(clusterCount(i, vpmL[i]), 5, 15, cfg.green1, cfg.green2);
    // trend_col = dynamic_price_cluster == close ? na : cluster_color(dynamic_price_cluster, false, false, true)
    let trendCol = 'transparent';
    if (!eq(cluster[i], c)) {
      const count = clusterCount(i, cluster[i]);
      trendCol = gt(c, cluster[i])
        ? gradient(count, cfg.priceClusterStart, cfg.priceClusterPeak, cfg.bullishCluster1, cfg.bullishCluster2)
        : gradient(count, cfg.priceClusterStart, cfg.priceClusterPeak, cfg.bearishCluster1, cfg.bearishCluster2);
    }
    upperPlot.push({ time: t, value: vpmU[i], color: uCol });
    lowerPlot.push({ time: t, value: vpmL[i], color: lCol });
    // plotcandle(open, high, low, close, color = trend_col, wickcolor = trend_col, bordercolor = trend_col)
    candles.push({ time: t, open: bars[i].open, high: bars[i].high, low: bars[i].low, close: c,
      color: trendCol, wickColor: trendCol, borderColor: trendCol });

    // placesell = ta.highest(high, 5) + ta.ema(ta.tr, 20); placebuy = ta.lowest(low, 5) - ta.ema(ta.tr, 20)
    // plotshape(upper_retest ? placesell : na, 'Triangle Dn', shape.triangledown, location.absolute, retest_col_2, size.tiny)
    // plotshape(lower_retest ? placebuy : na, 'Triangle Up', shape.triangleup, location.absolute, retest_col_1, size.tiny)
    // and the 'UI Only' copies: color.new(retest_col, 50), size.normal (ids shape0..shape3 in declaration order)
    const placeSell = hi5[i] + trEma[i];
    const placeBuy = lo5[i] - trEma[i];
    if (upperRetest[i] && !isNaN(placeSell)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: placeSell, shape: 'triangleDown', color: cfg.retestCol2, size: 'tiny',
        id: 'shape0' });
      markers.push({ time: t, position: 'atPriceMiddle', price: placeSell, shape: 'triangleDown',
        color: String(color.new(cfg.retestCol2, 50)), size: 'normal', id: 'shape2' });
    }
    if (lowerRetest[i] && !isNaN(placeBuy)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: placeBuy, shape: 'triangleUp', color: cfg.retestCol1, size: 'tiny',
        id: 'shape1' });
      markers.push({ time: t, position: 'atPriceMiddle', price: placeBuy, shape: 'triangleUp',
        color: String(color.new(cfg.retestCol1, 50)), size: 'normal', id: 'shape3' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: upperPlot, plot1: lowerPlot },
    markers,
    plotCandles: { clusterCandles: candles },
  };
}

export const DynamicVolumeClusters = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
