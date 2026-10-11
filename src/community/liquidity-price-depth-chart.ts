/**
 * Liquidity Price Depth Chart [LuxAlgo]
 *
 * A depth chart of the bars visible on the chart: the volume of the bullish bars and of the bearish bars, sorted by
 * closing price and accumulated from the highest price down.
 * - Each visible bullish bar (close above open) gives one point at its close, each bearish bar one point at its
 *   close; a later bar with the same close replaces the volume of the earlier one.
 * - Bullish points go from the first visible bar towards the middle of the visible range, bearish points from the
 *   last visible bar towards the middle: the distance is the accumulated share of the bullish (bearish) volume.
 *   Each point is a dot label; the points are joined by a polyline with a filled area down to the visible low.
 * - The bar with the highest bullish (bearish) volume: a dotted vertical line on the bar and a dotted horizontal
 *   line at its close over the visible range.
 * - Under the visible low: two frames, each half of the visible range wide, filled in proportion to the share of
 *   the bullish and of the bearish volume, with the percentage as text.
 * At most 500 labels are kept (the oldest are removed), as the original.
 *
 * Visible range: the indicator reads the first and the last visible bar of the chart (`leftVisibleBarTime` /
 * `rightVisibleBarTime` of the chart context, third argument of calculate). It must be calculated again when the
 * user scrolls or zooms. Without these values the range is all the bars. When no bar is in the range nothing is
 * drawn.
 *
 * Chart values (third argument): the port also reads the symbol tick (the vertical line of the highest volume
 * goes from close + tick to close - tick; without it: 0.01; the line is extended both ways, so it looks the same).
 *
 * Reference: "Liquidity Price Depth Chart [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { array, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, PolylineData } from '../types';
import { mintickOf, visibleRangeOf, type ChartContext } from '../chart-context';

export interface LiquidityPriceDepthChartInputs {
  /** Bullish Price Highest Volume Location */
  showBullMax: boolean;
  /** Bullish Volume % */
  showBullPer: boolean;
  /** Bullish Prices */
  bullCss: string;
  /** Area (bullish) */
  bullFillCss: string;
  /** Bearish Price Highest Volume Location */
  showBearMax: boolean;
  /** Bearish Volume % */
  showBearPer: boolean;
  /** Bearish Prices */
  bearCss: string;
  /** Area (bearish) */
  bearFillCss: string;
  /** Volume % Box Padding */
  padding: number;
}

export const defaultInputs: LiquidityPriceDepthChartInputs = {
  showBullMax: true,
  showBullPer: true,
  bullCss: '#089981',
  bullFillCss: 'rgba(8, 153, 129, 0.1)',
  showBearMax: true,
  showBearPer: true,
  bearCss: '#F23645',
  bearFillCss: 'rgba(242, 54, 69, 0.1)',
  padding: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'showBullMax', type: 'bool', title: 'Bullish Price Highest Volume Location', defval: true, group: 'Bullish Elements' },
  { id: 'showBullPer', type: 'bool', title: 'Bullish Volume %', defval: true, group: 'Bullish Elements' },
  { id: 'bullCss', type: 'color', title: 'Bullish Prices', defval: '#089981', inline: 'bull', group: 'Bullish Elements' },
  { id: 'bullFillCss', type: 'color', title: 'Area', defval: 'rgba(8, 153, 129, 0.1)', inline: 'bull', group: 'Bullish Elements' },
  { id: 'showBearMax', type: 'bool', title: 'Bearish Price Highest Volume Location', defval: true, group: 'Bearish Elements' },
  { id: 'showBearPer', type: 'bool', title: 'Bearish Volume %', defval: true, group: 'Bearish Elements' },
  { id: 'bearCss', type: 'color', title: 'Bearish Prices', defval: '#F23645', inline: 'bear', group: 'Bearish Elements' },
  { id: 'bearFillCss', type: 'color', title: 'Area', defval: 'rgba(242, 54, 69, 0.1)', inline: 'bear', group: 'Bearish Elements' },
  { id: 'padding', type: 'float', title: 'Volume % Box Padding', defval: 5, min: 0, max: 100, group: 'Misc' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Liquidity Price Depth Chart [LuxAlgo]',
  shortTitle: 'LuxAlgo - Liquidity Price Depth Chart',
  overlay: true,
};

/** The indicator reads the visible range of the chart: calculate again when the user scrolls or zooms */
export const usesVisibleRange = true;

/** max_labels_count, and the default maximum of lines */
const MAX_LABELS = 500;
const MAX_LINES = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; both: boolean; kept: boolean; dead: boolean }
interface Lb { x: number; y: number; textColor: string; dead: boolean }
interface Pt { index: number; price: number }

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityPriceDepthChartInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[]; polylines: PolylineData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { bullCss, bearCss } = cfg;
  const padding = cfg.padding / 100;
  const mintick = mintickOf(chart);
  const boxes: BoxData[] = [];
  const polylines: PolylineData[] = [];

  // lines: above the maximum + 5 the oldest are deleted until the maximum remains; the two lines held by a `var`
  // are never deleted but count
  const lineList: Ln[] = [];
  const newLine = (l: Omit<Ln, 'dead'>): Ln => {
    const o: Ln = { ...l, dead: false };
    lineList.push(o);
    if (lineList.length > MAX_LINES + 5) {
      let extra = lineList.length - MAX_LINES;
      for (let k = 0; k < lineList.length && extra > 0; k++) {
        if (lineList[k].kept) continue;
        lineList[k].dead = true;
        lineList.splice(k--, 1);
        extra--;
      }
    }
    return o;
  };
  const labelList: Lb[] = [];
  const newLabel = (x: number, y: number, textColor: string) => {
    labelList.push({ x, y, textColor, dead: false });
    if (labelList.length > MAX_LABELS + 5) for (const old of labelList.splice(0, labelList.length - MAX_LABELS)) old.dead = true;
  };

  const maxBullVlvl = newLine({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: bullCss, both: true, kept: true });
  const maxBearVlvl = newLine({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: bearCss, both: true, kept: true });

  // the visible bars: Pine `time == chart.left_visible_bar_time`, `time <= chart.right_visible_bar_time`
  const range = visibleRangeOf(bars, chart);
  const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
  const { left, right } = range;
  const visible = bars.length > 0 && left <= right
    && bars[left].time * toMs >= range.leftTime && bars[right].time * toMs <= range.rightTime;

  if (visible) {
    const x1 = left;
    const n = right;
    const first = bars[left];
    let max = first.high;
    let min = first.low;
    let maxBullVol = gt(first.close, first.open) ? (first.volume ?? NaN) : 0;
    let maxBearVol = lt(first.close, first.open) ? (first.volume ?? NaN) : 0;
    const bullMap = new Map<number, number>();
    const bearMap = new Map<number, number>();

    // populate the price / volume maps
    for (let i = left; i <= right; i++) {
      const b = bars[i];
      const volume = b.volume ?? NaN;
      if (gt(b.close, b.open)) {
        bullMap.set(b.close, volume);
        maxBullVol = Math.max(volume, maxBullVol);
        if (eq(maxBullVol, volume) && cfg.showBullMax) {
          Object.assign(maxBullVlvl, { x1: i, y1: b.close + mintick, x2: i, y2: b.close - mintick });
        }
      } else if (lt(b.close, b.open)) {
        bearMap.set(b.close, volume);
        maxBearVol = Math.max(volume, maxBearVol);
        if (eq(maxBearVol, volume) && cfg.showBearMax) {
          Object.assign(maxBearVlvl, { x1: i, y1: b.close + mintick, x2: i, y2: b.close - mintick });
        }
      }
      max = Math.max(b.high, max);
      min = Math.min(b.low, min);
    }

    // cumulative areas, on the last visible bar
    const bullSorted = [...bullMap.keys()].sort((a, b) => b - a);
    const bearSorted = [...bearMap.keys()].sort((a, b) => b - a);
    // the sum of an empty array is na
    const bullSumv = array.sum([...bullMap.values()]);
    const bearSumv = array.sum([...bearMap.values()]);

    let bullIdx = 0;
    let bearIdx = 0;
    const bullCoordinates: Pt[] = [{ index: x1, price: max }];
    const bearCoordinates: Pt[] = [{ index: n, price: max }];

    for (const element of bullSorted) {
      const v = bullMap.get(element) as number;
      bullIdx += v / bullSumv;
      const point = { index: x1 + Math.trunc((bullIdx * (n - x1)) / 2), price: element };
      if (eq(v, maxBullVol) && cfg.showBullMax) {
        newLine({ x1, y1: element, x2: n, y2: element, color: bullCss, both: false, kept: false });
      }
      bullCoordinates.push(point);
      newLabel(point.index, point.price, bullCss);
    }
    for (const element of bearSorted) {
      const v = bearMap.get(element) as number;
      bearIdx += v / bearSumv;
      const point = { index: n - Math.trunc((bearIdx * (n - x1)) / 2), price: element };
      if (eq(v, maxBearVol) && cfg.showBearMax) {
        newLine({ x1, y1: element, x2: n, y2: element, color: bearCss, both: false, kept: false });
      }
      bearCoordinates.push(point);
      newLabel(point.index, point.price, bearCss);
    }

    // horizontal line at the visible low, for the fill. `(n - x1) / 2` keeps its fraction; a bar index with a
    // fraction is cut to its integer part
    const half = (n - x1) / 2;
    bullCoordinates.push({ index: Math.trunc(x1 + half), price: min }, { index: x1, price: min });
    bearCoordinates.push({ index: Math.trunc(n - half), price: min }, { index: n, price: min });

    const polyline = (points: Pt[], lineColor: string, fillColor: string) => {
      if (points.some((p) => Number.isNaN(p.index) || Number.isNaN(p.price))) return;
      polylines.push({ points: points.map((p) => ({ time: bars[p.index].time, price: p.price })), lineColor, fillColor });
    };
    polyline(bullCoordinates, bullCss, cfg.bullFillCss);
    polyline(bearCoordinates, bearCss, cfg.bearFillCss);

    // volume % boxes (a box with an na point is not drawn)
    const bottom = min - padding * (max - min);
    const box = (l: number, r: number, extra: Partial<BoxData>) => {
      if ([l, r, min, bottom].some((x) => Number.isNaN(x))) return;
      boxes.push({ time1: bars[Math.trunc(l)].time, price1: min, time2: bars[Math.trunc(r)].time, price2: bottom, ...extra });
    };
    const filled = (css: string, share: number): Partial<BoxData> => ({
      borderColor: 'transparent', bgColor: css, textColor: '#FFFFFF', text: str.tostring(share * 100, 'percent'), textSize: 'small',
    });
    if (cfg.showBullPer) {
      const bullVper = bullSumv / (bullSumv + bearSumv);
      box(x1, x1 + half, { borderColor: bullCss, bgColor: 'transparent' });
      box(x1, x1 + Math.trunc(half * bullVper), filled(bullCss, bullVper));
    }
    if (cfg.showBearPer) {
      const bearVper = bearSumv / (bullSumv + bearSumv);
      box(n - half, n, { borderColor: bearCss, bgColor: 'transparent' });
      box(n - Math.trunc(half * bearVper), n, filled(bearCss, bearVper));
    }
  }

  // objects with an na point are not drawn
  const lines: LineDrawingData[] = lineList
    .filter((l) => !l.dead && ![l.x1, l.y1, l.x2, l.y2].some((x) => Number.isNaN(x)))
    .map((l) => ({
      time1: bars[l.x1].time, price1: l.y1, time2: bars[l.x2].time, price2: l.y2, color: l.color, style: 'dotted' as const,
      ...(l.both ? { extend: 'both' as const } : {}),
    }));
  const labels: LabelData[] = labelList
    .filter((l) => !l.dead && !Number.isNaN(l.x) && !Number.isNaN(l.y))
    .map((l) => ({
      time: bars[l.x].time, price: l.y, text: '•', color: 'transparent', style: 'label_center' as const, textColor: l.textColor,
    }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
    labels,
    lines,
    polylines,
  };
}

export const LiquidityPriceDepthChart = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
