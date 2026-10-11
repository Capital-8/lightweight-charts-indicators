/**
 * Dynamic Liquidity HeatMap Profile [BigBeluga]
 *
 * Liquidity levels above the 2-bar highs and below the 2-bar lows of the last "Calculated Bars" bars, and a profile
 * of the volume that rests on them.
 * - On every bar: the 10-bar volume sum, as a percentage of its maximum over the calculated bars, times ATR(5) / 50
 *   gives a distance. The highest distance of the calculated bars widens the price range (highs plus it, lows minus
 *   it), which is cut in 100 steps.
 * - In the last calculated bars a bar whose high is the 2-bar high leaves a level above it (at the high plus the
 *   distance, on the middles of the steps next to it) and a bar whose low is the 2-bar low leaves one below it. A
 *   level is removed when a later high / low goes through it.
 * - On the last bar the range is cut in "Resolution" bins. Each bin sums the volume of the levels within one bin
 *   height of its middle. Every bin that does not hold the close draws a line from the last bar that reached its
 *   middle (width and colour by its volume) and, when the profile is on, a box whose length is the volume (50 bars
 *   for the largest) with the volume as text, and a second box with its share (100 % for the largest).
 *
 * Chart context (optional third argument): `chart.backgroundColor` is the border colour of the profile boxes
 * (the chart background). Without it the dark theme value.
 *
 * Reference: "Dynamic Liquidity HeatMap Profile [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, math, str, color, array, Series, barInterval, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LineDrawingData } from '../types';
import { backgroundColorOf, type ChartContext } from '../chart-context';

export interface DynamicLiquidityHeatmapProfileInputs {
  /** Number of bars, from the last one, that are calculated */
  lookBack: number;
  /** Show the profile boxes */
  displayProfile: boolean;
  /** Number of bins of the profile */
  bins: number;
  sellColor: string;
  buyColor: string;
  /** Colour the bin with the most volume with the max point colour */
  poc: boolean;
  maxColor: string;
}

export const defaultInputs: DynamicLiquidityHeatmapProfileInputs = {
  lookBack: 300,
  displayProfile: true,
  bins: 50,
  sellColor: '#2962FF',
  buyColor: '#00E676',
  poc: true,
  maxColor: '#FF9800',
};

export const inputConfig: InputConfig[] = [
  { id: 'lookBack', type: 'int', title: 'Calculated Bars', defval: 300 },
  { id: 'displayProfile', type: 'bool', title: 'Profile', defval: true, group: 'Profile' },
  { id: 'bins', type: 'int', title: 'Resolution', defval: 50, group: 'Profile' },
  { id: 'sellColor', type: 'color', title: 'Sell Liquidity', defval: '#2962FF' },
  { id: 'buyColor', type: 'color', title: 'Buy  Liquidity', defval: '#00E676' },
  { id: 'poc', type: 'bool', title: '', defval: true, inline: 'maxp' },
  { id: 'maxColor', type: 'color', title: 'Max Point Liquidity', defval: '#FF9800', inline: 'maxp' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Dynamic Liquidity HeatMap Profile [BigBeluga]',
  shortTitle: 'Dynamic Liquidity HeatMap Profile [BigBeluga]',
  overlay: true,
};

/** Number of steps of the price range for the levels */
const RESOLUTION = 100;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

/** color(na) */
const NA_COLOR = null as unknown as string;

/** A liquidity level (type pivot of the script; only the fields that are read) */
interface Level { value: number; vol: number; isLower: boolean }

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicLiquidityHeatmapProfileInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lookBack = cfg.lookBack;
  const bins = cfg.bins;
  const result = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: [] as LineDrawingData[],
    boxes: [] as BoxData[],
  };
  if (n === 0) return result;
  // for i = 0 to lookBack - 1 with lookBack < 1 counts down to a negative history offset
  if (lookBack < 1) throw new Error('Calculated Bars must be at least 1.');
  if (bins < 1) throw new Error('Resolution must be at least 1.');

  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars[n - 1].close;

  const h = A(ta.highest(S(high), 2));
  const l = A(ta.lowest(S(low), 2));
  const vol = A(math.sum(S(bars.map((b) => b.volume ?? NaN)), 10));
  const atr = A(ta.atr(bars, 5)).map((v) => v / 50);
  // volumeArr: vol[0 .. lookBack - 1]; nVol = vol / volumeArr.max() * 100 (array.max skips na values)
  const nVol: number[] = new Array(n);
  for (let t = 0; t < n; t++) {
    let m = NaN;
    for (let i = Math.max(0, t - lookBack + 1); i <= t; i++) {
      if (!Number.isNaN(vol[i]) && (Number.isNaN(m) || vol[i] > m)) m = vol[i];
    }
    nVol[t] = (vol[t] / m) * 100;
  }
  const dist = atr.map((v, i) => v * nVol[i]);
  const offset = A(ta.highest(S(dist), lookBack));

  // h_l of a bar: high[i] + offset[i] and low[i] - offset[i] of its last lookBack bars
  const rangeOf = (t: number): { top: number; bot: number } => {
    let top = NaN;
    let bot = NaN;
    for (let i = Math.max(0, t - lookBack + 1); i <= t; i++) {
      const a = high[i] + offset[i];
      const b = low[i] - offset[i];
      for (const v of [a, b]) {
        if (Number.isNaN(v)) continue;
        if (Number.isNaN(top) || v > top) top = v;
        if (Number.isNaN(bot) || v < bot) bot = v;
      }
    }
    return { top, bot };
  };

  const levels: Level[] = [];
  for (let t = Math.max(0, n - lookBack); t < n; t++) {
    // if last_bar_index - bar_index < lookBack
    const { top, bot } = rangeOf(t);
    const step = (top - bot) / RESOLUTION;
    const level1 = high[t] + dist[t];
    const level2 = low[t] - dist[t];
    if (eq(h[t], high[t])) {
      for (let i = 0; i < RESOLUTION; i++) {
        const mid = bot + step * i + step / 2;
        if (le(Math.abs(level1 - mid), step)) levels.push({ value: mid, vol: vol[t], isLower: false });
      }
    }
    if (eq(l[t], low[t])) {
      for (let i = 0; i < RESOLUTION; i++) {
        const mid = bot + step * i + step / 2;
        if (le(Math.abs(level2 - mid), step)) levels.push({ value: mid - dist[t], vol: vol[t], isLower: true });
      }
    }
    // for p in pivots: a removal inside the loop skips the element after the removed one
    for (let k = 0; k < levels.length; k++) {
      const p = levels[k];
      let removed = false;
      if (p.isLower && lt(low[t], p.value)) {
        levels.splice(k, 1);
        removed = true;
      }
      if (!p.isLower && gt(high[t], p.value)) {
        // pivots.remove(pivots.indexof(p)): p is no longer in the array when it was removed above
        if (!removed) levels.splice(k, 1);
      }
    }
  }

  // if barstate.islast
  const last = n - 1;
  if (levels.length === 0) return result;
  const { top, bot } = rangeOf(last);
  const step = (top - bot) / bins;
  const volumeBins: number[] = new Array(bins).fill(0);
  for (const lvl of levels) {
    for (let j = 0; j < bins; j++) {
      const mid = bot + step * j + step / 2;
      if (lt(Math.abs(lvl.value - mid), step)) volumeBins[j] += lvl.vol;
    }
  }
  const binMax = array.max(volumeBins) as number;
  const binMin = array.min(volumeBins) as number;
  const binAvg = array.avg(volumeBins) as number;
  const chartBg = backgroundColorOf(chart);
  const interval = barInterval(bars);
  const X = (index: number) => barTime(bars, index, interval);
  const C = (c: string, t: number) => String(color.new(c, t));

  let start = 0; // var start = 0
  for (let j = 0; j < bins; j++) {
    const lower = bot + step * j;
    const upper = lower + step;
    const mid = lower + step / 2;
    const voll = volumeBins[j];
    const valueVol = (voll / binMax) * 50;
    const col = gt(close, mid) ? cfg.buyColor : cfg.sellColor;
    const mCol = String(color.from_gradient(voll, binMin, binMax, C(col, 80), C(col, 0)));
    const mCol1 = String(color.from_gradient(voll, binMin, binMax, C(col, 50), C(col, 0)));
    const isMax = eq(voll, binMax);
    if (lt(close, upper) && gt(close, lower)) continue;

    if (cfg.displayProfile && ne(valueVol, 0)) {
      result.boxes.push({
        time1: X(last + 20), price1: upper, time2: X(last + 20 + Math.trunc(valueVol)), price2: lower,
        bgColor: isMax && cfg.poc ? cfg.maxColor : mCol,
        borderColor: chartBg,
        text: gt(voll, binAvg) ? str.tostring(voll, 'volume') : '',
        textColor: '#FFFFFF',
        textHAlign: 'left',
      });
      result.boxes.push({
        time1: X(last + 20), price1: upper, time2: X(last + 5), price2: lower,
        text: str.tostring(valueVol * 2, 'percent'),
        bgColor: 'transparent',
        borderColor: 'transparent',
        textColor: isMax ? cfg.maxColor : mCol1,
      });
    }

    const isLower = gt(close, mid);
    for (let i = 0; i < lookBack; i++) {
      const k = last - i;
      if (isLower ? (k >= 0 && lt(low[k], mid)) : (k >= 0 && gt(high[k], mid))) {
        start = last - i;
        break;
      }
      if (i === lookBack - 1) {
        start = last - i;
        break;
      }
    }
    const lineColor = isMax && cfg.poc
      ? cfg.maxColor
      : String(color.from_gradient(valueVol, 0, 50, NA_COLOR, isLower ? C(cfg.buyColor, 30) : C(cfg.sellColor, 30)));
    result.lines.push({
      time1: X(start + 3), price1: mid, time2: X(last + 5), price2: mid, width: Math.trunc(valueVol / 5), color: lineColor,
    });
  }
  return result;
}

export const DynamicLiquidityHeatmapProfile = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
