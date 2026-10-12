/**
 * Clusters Volume Profile
 *
 * On the last bar, the hl2 prices of the last "Lookback Period" bars are grouped into "Number of Clusters" price
 * clusters with K-means (centroids start evenly spaced between the lowest and highest hl2, each pass assigns every
 * price to the nearest centroid and moves the centroids to the volume-weighted mean of their prices). Each cluster
 * gets its own volume profile to the right of the last bar: its high-low range cut into "Rows per Cluster VP" rows,
 * the volume of each bar shared between the rows its wick overlaps. The row with the most volume (POC) is drawn in
 * the full cluster colour with a dashed line from the start of the window, a POC volume label and a total volume
 * label; optional dots mark the hl2 price of every bar of the cluster.
 *
 * `syminfo.mintick` (the row height of a flat cluster and the smallest wick range) comes from the chart context.
 *
 * Reference: "Clusters Volume Profile [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  array, str, color, box, label, line, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { mintickOf, type ChartContext } from '../chart-context';

type DotSize = 'tiny' | 'small' | 'normal' | 'large' | 'huge';

export interface ClustersVolumeProfileInputs {
  lookback: number;
  kInput: number;
  iters: number;
  rowsInput: number;
  vpWidth: number;
  vpOffset: number;
  showDots: boolean;
  dotSizeInput: DotSize;
}

export const defaultInputs: ClustersVolumeProfileInputs = {
  lookback: 200,
  kInput: 5,
  iters: 50,
  rowsInput: 20,
  vpWidth: 40,
  vpOffset: 10,
  showDots: true,
  dotSizeInput: 'small',
};

const GRP_MAIN = 'Clustering Settings';
const GRP_VP = 'Volume Profile Settings';

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Lookback Period', defval: 200, min: 10, group: GRP_MAIN,
    tooltip: 'Number of recent bars to cluster and analyze.' },
  { id: 'kInput', type: 'int', title: 'Number of Clusters', defval: 5, min: 2, max: 10, group: GRP_MAIN,
    tooltip: 'How many distinct price groups (clusters) to detect.' },
  { id: 'iters', type: 'int', title: 'K-Means Iterations', defval: 50, min: 5, max: 50, group: GRP_MAIN },
  { id: 'rowsInput', type: 'int', title: 'Rows per Cluster VP', defval: 20, min: 2, group: GRP_VP,
    tooltip: "Number of histogram bins for each individual cluster's volume profile." },
  { id: 'vpWidth', type: 'int', title: 'Max VP Width (Bars)', defval: 40, min: 5, group: GRP_VP },
  { id: 'vpOffset', type: 'int', title: 'VP Offset', defval: 10, group: GRP_VP },
  { id: 'showDots', type: 'bool', title: 'Highlight Price Dots', defval: true, group: GRP_VP,
    tooltip: 'Limited by the label count of the chart. Volume labels take priority.' },
  { id: 'dotSizeInput', type: 'string', title: 'Dot Size', defval: 'small',
    options: ['tiny', 'small', 'normal', 'large', 'huge'], group: GRP_VP },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Clusters Volume Profile [LuxAlgo]',
  shortTitle: 'LuxAlgo - Clusters Volume Profile',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

const PALETTE = ['#2196f3', '#f44336', '#4caf50', '#ff9800', '#9c27b0', '#00bcd4', '#ffeb3b', '#e91e63', '#795548', '#607d8b'];

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ClustersVolumeProfileInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lookback = Math.trunc(cfg.lookback);
  const k = Math.trunc(cfg.kInput);
  const iterations = Math.trunc(cfg.iters);
  const rows = Math.trunc(cfg.rowsInput);
  const mintick = mintickOf(chart);

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS, label: MAX_OBJECTS });

  if (n > 0) {
    const last = n - 1;
    setDrawingBar(last, true);
    // x[i] of the last bar (na before the first bar)
    const at = (i: number) => (last - i >= 0 ? bars[last - i] : undefined);
    const hl2 = (i: number) => { const b = at(i); return b ? (b.high + b.low) / 2 : NaN; };
    const vol = (i: number) => at(i)?.volume ?? NaN;

    // f_kmeans(lookback, kInput, iters)
    const prices: number[] = [];
    const volumes: number[] = [];
    let minP = 1e10;
    let maxP = -1e10;
    for (let i = 0; i <= lookback - 1; i++) {
      const p = hl2(i);
      prices.push(p);
      volumes.push(vol(i));
      // math.min / math.max with na give na
      minP = Math.min(minP, p);
      maxP = Math.max(maxP, p);
    }
    const centroids = new Array<number>(k).fill(NaN);
    const step = (maxP - minP) / (k + 1);
    for (let i = 0; i <= k - 1; i++) centroids[i] = minP + (i + 1) * step;
    const assignments = new Array<number>(lookback).fill(NaN);
    for (let it = 1; it <= iterations; it++) {
      for (let i = 0; i <= lookback - 1; i++) {
        const p = prices[i];
        let bestK = 0;
        let minDist = 1e10;
        for (let j = 0; j <= k - 1; j++) {
          const dist = Math.abs(p - centroids[j]);
          if (gt(minDist, dist)) {
            minDist = dist;
            bestK = j;
          }
        }
        assignments[i] = bestK;
      }
      const sumPv = new Array<number>(k).fill(0);
      const sumV = new Array<number>(k).fill(0);
      for (let i = 0; i <= lookback - 1; i++) {
        const cluster = assignments[i];
        sumPv[cluster] = sumPv[cluster] + prices[i] * volumes[i];
        sumV[cluster] = sumV[cluster] + volumes[i];
      }
      for (let j = 0; j <= k - 1; j++) {
        if (gt(sumV[j], 0)) centroids[j] = sumPv[j] / sumV[j];
      }
    }

    const calcStart = last - lookback + 1;
    const vpStartX = last + cfg.vpOffset;
    const reservedForMetrics = k * 2;
    let labelsUsed = 0;
    let boxCount = 0;

    for (let cId = 0; cId <= k - 1; cId++) {
      const clusterColor = PALETTE[cId % PALETTE.length];
      const cHighs: number[] = [];
      const cLows: number[] = [];
      const cVols: number[] = [];
      let cMin = 1e10;
      let cMax = -1e10;
      let cTotalVol = 0;

      for (let i = 0; i <= lookback - 1; i++) {
        if (assignments[i] !== cId) continue;
        const b = at(i);
        const p = hl2(i);
        const h = b ? b.high : NaN;
        const l = b ? b.low : NaN;
        const v = vol(i);
        cVols.push(v);
        cHighs.push(h);
        cLows.push(l);
        cMin = Math.min(cMin, l);
        cMax = Math.max(cMax, h);
        cTotalVol += v;
        if (cfg.showDots && labelsUsed < MAX_OBJECTS - reservedForMetrics) {
          label.new(last - i, p, '•', 'bar_index', 'price', '#00000000', 'label_center', clusterColor, cfg.dotSizeInput);
          labelsUsed += 1;
        }
      }

      if (cVols.length === 0) continue;
      const binVols = new Array<number>(rows).fill(0);
      let binSize = (cMax - cMin) / rows;
      if (eq(binSize, 0)) binSize = mintick;
      for (let i = 0; i <= cVols.length - 1; i++) {
        const bH = cHighs[i];
        const bL = cLows[i];
        const bV = cVols[i];
        const wickRange = Math.max(bH - bL, mintick);
        for (let bIdx = 0; bIdx <= rows - 1; bIdx++) {
          const binB = cMin + bIdx * binSize;
          const binT = binB + binSize;
          const intersectL = Math.max(bL, binB);
          const intersectH = Math.min(bH, binT);
          if (gt(intersectH, intersectL)) binVols[bIdx] = binVols[bIdx] + bV * (intersectH - intersectL) / wickRange;
        }
      }
      const maxBinVol = array.max(binVols);
      const pocBinIdx = array.indexof(binVols, maxBinVol);

      for (let bIdx = 0; bIdx <= rows - 1; bIdx++) {
        if (boxCount >= MAX_OBJECTS) break;
        const v = binVols[bIdx];
        if (eq(v, 0)) continue;
        const bBottom = cMin + bIdx * binSize;
        const bTop = bBottom + binSize;
        const bWidth = Math.trunc((v / maxBinVol) * cfg.vpWidth);
        const endX = vpStartX + bWidth;
        const isPoc = bIdx === pocBinIdx;
        const bColor = isPoc ? clusterColor : String(color.new(clusterColor, 75));
        box.new(vpStartX, bTop, endX, bBottom, isPoc ? clusterColor : '#00000000', 1, 'solid', 'none', 'bar_index', bColor);
        boxCount += 1;
        if (isPoc) {
          const pocY = (bTop + bBottom) / 2;
          line.new(calcStart, pocY, vpStartX, pocY, 'bar_index', 'none', clusterColor, 'dashed', 1);
          label.new(calcStart, pocY, str.tostring(v, 'volume'), 'bar_index', 'price', '#00000000', 'label_right',
            clusterColor, 'small');
          label.new(endX, pocY, 'Total: ' + str.tostring(cTotalVol, 'volume'), 'bar_index', 'price', '#00000000',
            'label_left', clusterColor, 'small');
        }
      }
    }
    setDrawingBar(null);
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const col = (c: unknown) => (c === null || c === undefined || c === '' ? 'transparent' : String(c));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // an object with an na coordinate is not drawn
    lines: line.all().filter((l) => ![l.x1, l.x2, l.y1, l.y2].some((v) => isNaN(v))).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: col(l.color), width: l.width,
      style: 'dashed' as const,
    })),
    boxes: box.all().filter((b) => ![b.left, b.right, b.top, b.bottom].some((v) => isNaN(v))).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
      bgColor: col(b.bgcolor), borderColor: col(b.border_color), borderWidth: b.border_width,
    })),
    labels: label.all().filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: '#00000000', textColor: col(l.textcolor),
      style: l.style as LabelData['style'], size: l.size as LabelData['size'],
    })),
  };
}

export const ClustersVolumeProfile = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
