/**
 * Liquidity Zones [BigBeluga]
 *
 * Marks the swing highs and lows (pivots with "Length" bars on the left and "Length" - 2 on the right) that come
 * with a strong volume. The volume strength is the mean volume of the last "Length" - 2 bars divided by the standard
 * deviation of that mean over 500 bars; a pivot is kept when the strength on the pivot bar is above the filter
 * (Low 1, Mid 2, High 3).
 *
 * Each kept pivot gives a liquidity level one ATR(200) beyond the pivot price (with "Dynamic Distance": half the
 * strength times the ATR): a line that runs from the pivot bar to one bar after the current bar, and a box of 8 bars
 * between the pivot price and the level with the volume as text. The colour is stronger with a higher strength.
 * When a bar goes through the level (high above and low below it), the liquidity is grabbed: the line stops and
 * becomes dashed, the box loses its background and says "Liquidity Grabbed", and a red circle label is put on that
 * bar. Only the "Zones Amount" latest boxes and lines are kept. The levels are followed on the last 1,500 bars only.
 * Two circles (plotshape) mark each kept pivot, and a small table shows the settings.
 *
 * Chart context (optional third argument):
 * - `chart.foregroundColor`: the colour of the texts of the boxes and of the table. Without it #DBDBDB (dark theme).
 *
 * Reference: "Liquidity Zones [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import { ta, str, color, math, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, MarkerData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface LiquidityZonesInputs {
  /** Length (bars on the left of a pivot; the right side has 2 bars less) */
  leftBars: number;
  /** Zones Amount */
  qtyPivots: number;
  /** Volume Strength Filter */
  flt: 'Low' | 'Mid' | 'High';
  /** Dynamic Distance */
  dynamic: boolean;
  /** Filtered Pivots */
  hidePivot: boolean;
  upperCol: string;
  lowerCol: string;
}

export const defaultInputs: LiquidityZonesInputs = {
  leftBars: 10,
  qtyPivots: 10,
  flt: 'Mid',
  dynamic: false,
  hidePivot: true,
  upperCol: '#2370a3',
  lowerCol: '#23a372',
};

export const inputConfig: InputConfig[] = [
  { id: 'leftBars', type: 'int', title: 'Length', defval: 10 },
  { id: 'qtyPivots', type: 'int', title: 'Zones Amount', defval: 10, min: 1, max: 50 },
  {
    id: 'flt', type: 'string', title: 'Volume Strength Filter', defval: 'Mid', options: ['Low', 'Mid', 'High'],
    tooltip: 'Filtering Pivots By Volume Strength',
  },
  {
    id: 'dynamic', type: 'bool', title: 'Dynamic Distance', defval: false, group: 'Mode',
    tooltip: 'Dynamic Distance from Pivots based on Volume Strength',
  },
  { id: 'hidePivot', type: 'bool', title: 'Filtered Pivots', defval: true, group: 'Mode' },
  { id: 'upperCol', type: 'color', title: 'Upper', defval: '#2370a3', group: 'Liquidity Color', inline: 'L' },
  { id: 'lowerCol', type: 'color', title: 'Lower', defval: '#23a372', group: 'Liquidity Color', inline: 'L' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Liquidity Zones [BigBeluga]',
  shortTitle: 'Liquidity Zones [BigBeluga]',
  overlay: true,
};

/** Default max_labels_count */
const MAX_LABELS = 50;
/** The levels are followed on the last 1,500 bars */
const FOLLOW_BARS = 1500;
/** Colour constants of the original Pine version */
const GRAY = '#787B86';
const BLACK = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  dashed: boolean;
  width: number;
  deleted: boolean;
}
interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  color: string;
  bg: string | null;
  borderWidth: number;
  text: string;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityZonesInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const leftBars = Math.trunc(cfg.leftBars);
  const rightBars = leftBars - 2;
  const qty = Math.trunc(cfg.qtyPivots);
  const { dynamic, hidePivot, upperCol, lowerCol } = cfg;
  const fg = foregroundColorOf(chart);
  const filter = cfg.flt === 'Low' ? 1 : cfg.flt === 'Mid' ? 2 : cfg.flt === 'High' ? 3 : 0;

  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const ph = arr(ta.pivothigh(new Series(bars, (b) => b.high), leftBars, rightBars));
  const pl = arr(ta.pivotlow(new Series(bars, (b) => b.low), leftBars, rightBars));
  const avgVolS = ta.sma(new Series(bars, (b) => b.volume ?? NaN), rightBars);
  const avgVol = arr(avgVolS);
  const dev = arr(ta.stdev(avgVolS, 500));
  const atr = arr(ta.atr(bars, 200));
  const normalizedVol = avgVol.map((v, i) => v / dev[i]);
  const colorIntense = normalizedVol.map((v) => {
    const c = math.round(v) * 15;
    return gt(c, 100) ? 100 : c;
  });

  const allLines: Ln[] = []; // line.all: the lines alive, in creation order
  const allBoxes: Bx[] = []; // box.all
  const lineArr: Array<Ln | null> = []; // var line[] lines
  const boxArr: Bx[] = []; // var box[] boxes
  const labels: LabelData[] = [];
  const markers: MarkerData[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const back = i >= rightBars && rightBars >= 0 ? i - rightBars : -1;
    const strength = back >= 0 ? normalizedVol[back] : NaN;
    const strong = gt(strength, filter);
    const isHigh = !isNaN(ph[i]);
    const isLow = !isNaN(pl[i]);

    // New box and line of a pivot (a pivot high comes first)
    if (strong && (isHigh || isLow)) {
      const pivot = bars[back];
      const distance = dynamic ? (strength * atr[back]) / 2 : atr[i];
      const base = isHigh ? upperCol : lowerCol;
      const css = String(color.from_gradient(colorIntense[back], 0, 100, color.new(base, isHigh ? 60 : 80), color.new(base, 0)));
      const price = isHigh ? pivot.high : pivot.low;
      const level = isHigh ? price + distance : price - distance;
      const bx: Bx = {
        left: back, top: level, right: back + 8, bottom: price, color: css, bg: css, borderWidth: 2,
        text: `Volume:\n${str.tostring(math.round(avgVol[back], 2))}`, deleted: false,
      };
      allBoxes.push(bx);
      boxArr.push(bx);
      const ln: Ln = { x1: back, x2: i, y: level, color: css, dashed: false, width: 2, deleted: false };
      allLines.push(ln);
      lineArr.push(ln);
    }

    // extend_line(): extend the levels, mark the grabbed ones
    if (lineArr.length > 0 && last - i < FOLLOW_BARS) {
      for (let k = lineArr.length - 1; k >= 0; k--) {
        const ln = lineArr[k];
        // a deleted line (or na) gives na coordinates
        const x2 = ln !== null && !ln.deleted ? ln.x2 : NaN;
        const y = ln !== null && !ln.deleted ? ln.y : NaN;
        const through = gt(b.high, y) && lt(b.low, y);
        if (i === x2 && !through) ln!.x2 = i + 1;
        if (through) {
          ln!.dashed = true;
          ln!.width = 1;
          const bx = boxArr[k];
          if (!bx.deleted) {
            bx.text = 'Liquidity\nGrabbed';
            bx.borderWidth = 1;
            bx.bg = null;
          }
          lineArr[k] = null;
          labels.push({
            time: b.time, price: y, text: '〇', color: 'transparent', style: 'label_center', textColor: '#df1c1c',
            tooltip: 'Claim Liquidity Point',
          });
          if (labels.length > MAX_LABELS + 5) labels.splice(0, labels.length - MAX_LABELS);
        }
      }
    }

    // Keep the latest zones: one box and one line are deleted per bar
    if (allBoxes.length > qty) allBoxes.shift()!.deleted = true;
    if (allLines.length > qty) allLines.shift()!.deleted = true;

    // Filtered pivots: plotshape(..., location.absolute, offset = -rightBars)
    if (strong && hidePivot && (isHigh || isLow)) {
      const draw = (price: number, base: string) => {
        const time = bars[back].time;
        markers.push({ time, position: 'atPriceMiddle', price, shape: 'circle', color: String(color.new(base, 60)), size: 'small' });
        markers.push({ time, position: 'atPriceMiddle', price, shape: 'circle', color: base, size: 'tiny' });
      };
      if (isHigh) draw(bars[back].high, upperCol);
      if (isLow) draw(bars[back].low, lowerCol);
    }
  }

  // Dashboard
  const qtyBg = color.from_gradient(qty, 1, 50, null as unknown as string, color.new(lowerCol, 50));
  const tables: TableData[] = n === 0 ? [] : [{
    position: 'top_right', columns: 10, rows: 10,
    cells: [
      { column: 0, row: 0, text: 'Qty', textColor: fg, textSize: 'auto' },
      { column: 1, row: 0, text: str.tostring(qty), textColor: fg, textSize: 'auto', ...(qtyBg ? { bgColor: String(qtyBg) } : {}) },
      { column: 0, row: 1, text: 'Mode:', textColor: fg, textSize: 'auto' },
      {
        column: 1, row: 1, text: dynamic ? 'Dynamic Mode' : 'Simple Mode', textColor: fg, textSize: 'auto',
        ...(dynamic ? { bgColor: String(color.new(upperCol, 50)) } : {}),
      },
    ],
    frameColor: GRAY, frameWidth: 1, borderColor: BLACK, borderWidth: 1,
  }];

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // an object with an na coordinate is not drawn
    lines: allLines.filter((l) => !isNaN(l.y)).map((l) => ({
      time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, width: l.width,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
    })),
    boxes: allBoxes.filter((b) => !isNaN(b.top) && !isNaN(b.bottom)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg ?? 'transparent', borderColor: b.color,
      borderWidth: b.borderWidth, text: b.text, textColor: fg, textSize: 'small' as const,
    })),
    labels,
    tables,
  };
}

export const LiquidityZones = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
