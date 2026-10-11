/**
 * Reversal Probability Zone & Levels [LuxAlgo]
 *
 * Finds price reversals from the candle bodies: the bias turns up when the top of the body is the highest of the
 * last "Swing Length" bars, and down when the bottom of the body is the lowest. Each change of bias confirms the
 * extreme of the leg that just ended as a reversal (a pivot). For every reversal the script stores the price move
 * and the number of bars since the reversal before, in one list for up moves and one for down moves (at most
 * "Maximum Reversals" each; "Normalize Data" stores the price move as a ratio of the price).
 *
 * At each new reversal it draws a zone from the reversal: the box is as wide and as high as the largest enabled
 * percentile of the stored bar counts and price moves of the opposite direction. Inside it, each enabled percentile
 * gives a horizontal line (price move), a vertical line (bar count) and two text labels ("25th", "50th" ...).
 * "No Overlapping Zones" cuts the zone before at the new reversal, "Show Only Last Zone" removes it, "Show Marks"
 * puts a dot on each reversal. At most 500 boxes, 500 lines and 500 labels are kept.
 *
 * The bars are processed when they are closed: a last bar that is still open (chart context) is not used.
 * The mark colour is the chart foreground colour of the context (dark theme value without a context). With
 * "Normalize Data" the price moves are rounded to the symbol tick of the context (0.01 without a context).
 *
 * Reference: "Reversal Probability Zone & Levels [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, array, color, math, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';

type LevelStyle = 'Dotted' | 'Dashed' | 'Solid';

export interface ReversalProbabilityZoneLevelsInputs {
  /** Bars of the highest / lowest candle body window */
  length: number;
  /** Maximum number of stored reversals per direction */
  maxPivots: number;
  /** Store the price moves as a ratio of the price */
  normalizeData: boolean;
  percentile25: boolean;
  percentile25Data: number;
  percentile25Style: LevelStyle;
  percentile25ColorBull: string;
  percentile25ColorBear: string;
  percentile25Size: number;
  percentile50: boolean;
  percentile50Data: number;
  percentile50Style: LevelStyle;
  percentile50ColorBull: string;
  percentile50ColorBear: string;
  percentile50Size: number;
  percentile75: boolean;
  percentile75Data: number;
  percentile75Style: LevelStyle;
  percentile75ColorBull: string;
  percentile75ColorBear: string;
  percentile75Size: number;
  percentile90: boolean;
  percentile90Data: number;
  percentile90Style: LevelStyle;
  percentile90ColorBull: string;
  percentile90ColorBear: string;
  percentile90Size: number;
  noOverlap: boolean;
  onlyLast: boolean;
  marks: boolean;
  bullishColor: string;
  bearishColor: string;
}

const GREEN_70 = 'rgba(8, 153, 129, 0.7)';
const RED_70 = 'rgba(242, 54, 69, 0.7)';

export const defaultInputs: ReversalProbabilityZoneLevelsInputs = {
  length: 20,
  maxPivots: 1000,
  normalizeData: false,
  percentile25: true,
  percentile25Data: 25,
  percentile25Style: 'Dotted',
  percentile25ColorBull: GREEN_70,
  percentile25ColorBear: RED_70,
  percentile25Size: 12,
  percentile50: true,
  percentile50Data: 50,
  percentile50Style: 'Dashed',
  percentile50ColorBull: GREEN_70,
  percentile50ColorBear: RED_70,
  percentile50Size: 12,
  percentile75: true,
  percentile75Data: 75,
  percentile75Style: 'Dashed',
  percentile75ColorBull: GREEN_70,
  percentile75ColorBear: RED_70,
  percentile75Size: 12,
  percentile90: true,
  percentile90Data: 90,
  percentile90Style: 'Solid',
  percentile90ColorBull: GREEN_70,
  percentile90ColorBear: RED_70,
  percentile90Size: 12,
  noOverlap: true,
  onlyLast: false,
  marks: true,
  bullishColor: 'rgba(8, 153, 129, 0.1)',
  bearishColor: 'rgba(242, 54, 69, 0.1)',
};

const EM = ' ';
const PERCENTILE_GROUP = `${EM.repeat(5)}PERCENTILE${EM.repeat(5)}STYLE${EM.repeat(7)}COLORS/SIZE`;
const STYLE_GROUP = 'STYLE';
const STYLE_OPTIONS = ['Dotted', 'Dashed', 'Solid'];

const percentileInputs = (p: 25 | 50 | 75 | 90, style: LevelStyle): InputConfig[] => [
  { id: `percentile${p}`, type: 'bool', title: '', defval: true, inline: String(p), group: PERCENTILE_GROUP },
  { id: `percentile${p}Data`, type: 'int', title: '', defval: p, min: 10, max: 90, inline: String(p), group: PERCENTILE_GROUP },
  { id: `percentile${p}Style`, type: 'string', title: '', defval: style, options: STYLE_OPTIONS, inline: String(p), group: PERCENTILE_GROUP },
  { id: `percentile${p}ColorBull`, type: 'color', title: '', defval: GREEN_70, inline: String(p), group: PERCENTILE_GROUP },
  { id: `percentile${p}ColorBear`, type: 'color', title: '', defval: RED_70, inline: String(p), group: PERCENTILE_GROUP },
  { id: `percentile${p}Size`, type: 'int', title: '', defval: 12, inline: String(p), group: PERCENTILE_GROUP },
];

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Swing Length', defval: 20 },
  { id: 'maxPivots', type: 'int', title: 'Maximum Reversals', defval: 1000, min: 5 },
  { id: 'normalizeData', type: 'bool', title: 'Normalize Data', defval: false },
  ...percentileInputs(25, 'Dotted'),
  ...percentileInputs(50, 'Dashed'),
  ...percentileInputs(75, 'Dashed'),
  ...percentileInputs(90, 'Solid'),
  { id: 'noOverlap', type: 'bool', title: 'No Overlapping Zones', defval: true, group: STYLE_GROUP },
  { id: 'onlyLast', type: 'bool', title: 'Show Only Last Zone', defval: false, group: STYLE_GROUP },
  { id: 'marks', type: 'bool', title: 'Show Marks', defval: true, group: STYLE_GROUP },
  { id: 'bullishColor', type: 'color', title: '', defval: 'rgba(8, 153, 129, 0.1)', inline: 'colors', group: STYLE_GROUP },
  { id: 'bearishColor', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.1)', inline: 'colors', group: STYLE_GROUP },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Reversal Probability Zone & Levels [LuxAlgo]',
  shortTitle: 'LuxAlgo - Reversal Probability Zone & Levels',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

const HIGH = 1;
const LOW = -1;

/** Pine float comparisons: equal within 1e-10, na compares false */
const EPS = 1e-10;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const gt = (a: number, b: number) => a - b > EPS;
/** Pine math.max / math.min: na when one argument is na */
const pmax = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.max(a, b));
const pmin = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.min(a, b));

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: 'dotted' | 'dashed' | 'solid';
  deleted: boolean;
}
interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string | null;
  border: string | null;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
  style: 'label_left' | 'label_down' | 'label_up';
  size: number;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ReversalProbabilityZoneLevelsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length = Math.trunc(cfg.length);
  const maxPivots = Math.trunc(cfg.maxPivots);
  const normalize = cfg.normalizeData;
  const mintick = mintickOf(chart);
  const markColor = String(color.new(foregroundColorOf(chart), 80));
  const roundToMintick = (v: number) => (Number.isNaN(v) ? NaN : math.round_to_mintick(v, mintick));

  const levels = ([25, 50, 75, 90] as const).map((p) => ({
    on: cfg[`percentile${p}`],
    data: Math.trunc(cfg[`percentile${p}Data`]),
    style: cfg[`percentile${p}Style`].toLowerCase() as Ln['style'],
    bull: cfg[`percentile${p}ColorBull`],
    bear: cfg[`percentile${p}ColorBear`],
    size: Math.trunc(cfg[`percentile${p}Size`]),
  }));
  const maxPercentile = Math.max(...levels.map((l) => (l.on ? l.data : 0)));

  const bodyMax = bars.map((b) => Math.max(b.close, b.open));
  const bodyMin = bars.map((b) => Math.min(b.close, b.open));
  const upperArr = ta.highest(Series.fromArray(bars, bodyMax), length).toArray();
  const lowerArr = ta.lowest(Series.fromArray(bars, bodyMin), length).toArray();

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. A deleted object ignores later changes.
  const lines: Ln[] = [];
  const boxes: Bx[] = [];
  const labels: Lb[] = [];
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    while (list.length > MAX_OBJECTS) list.shift()!.deleted = true;
  };
  const create = <T extends { deleted: boolean }>(list: T[], o: T): T => {
    list.push(o);
    limit(list);
    return o;
  };
  const remove = <T extends { deleted: boolean }>(list: T[], o: T) => {
    if (o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };

  // pivots: price moves and bar counts of the up moves and of the down moves
  const bullish = { prices: [] as number[], bars: [] as number[] };
  const bearish = { prices: [] as number[], bars: [] as number[] };
  // var zone currentZone: the first box is made on the first bar, from its high to its low
  let zoneBox: Bx | null = null;
  let zoneLabels: Lb[] = [];
  let zoneLines: Ln[] = [];

  // fetchPivot()
  let pivotPrice = NaN;
  let pivotBar = NaN;
  let pivotBias = NaN;
  let currentPrice = NaN;
  let currentBar = NaN;
  let bias = NaN;
  // fetchData()
  let lastPrice = NaN;
  let lastBar = NaN;
  let started = false;

  const lastConfirmed = lastBarConfirmedOf(chart);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i === 0) {
      zoneBox = create(boxes, { left: 0, top: b.high, right: 0, bottom: b.low, bg: '#2962FF', border: '#2962FF', deleted: false });
    }
    // if barstate.isconfirmed
    if (i === n - 1 && !lastConfirmed) continue;
    if (!started) {
      started = true;
      currentPrice = b.close;
      currentBar = i;
      lastPrice = b.close;
      lastBar = i;
    }

    // fetchPivot(length)
    const upper = upperArr[i] ?? NaN;
    const lower = lowerArr[i] ?? NaN;
    const prevBias = bias;
    bias = eq(bodyMax[i], upper) ? HIGH : eq(bodyMin[i], lower) ? LOW : bias;
    let newPivot = false;
    if (ne(bias, prevBias)) {
      newPivot = true;
      pivotPrice = currentPrice;
      pivotBar = currentBar;
      pivotBias = bias === LOW ? HIGH : LOW;
      currentPrice = bias === HIGH ? upper : lower;
      currentBar = i;
    } else {
      const before = currentPrice;
      currentPrice = bias === HIGH ? pmax(upper, currentPrice) : pmin(lower, currentPrice);
      currentBar = ne(currentPrice, before) ? i : currentBar;
    }

    // fetchData(newPivot, pivotPrice, pivotBar)
    const isBullish = gt(pivotPrice, lastPrice);
    const priceDelta = Math.abs(pivotPrice - lastPrice) / (normalize ? lastPrice : 1);
    const barsDelta = pivotBar - lastBar;
    if (newPivot && !Number.isNaN(barsDelta) && barsDelta !== 0 && Number.isFinite(priceDelta)) {
      const side = isBullish ? bullish : bearish;
      side.prices.push(priceDelta);
      side.bars.push(barsDelta);
      lastPrice = pivotPrice;
      lastBar = pivotBar;
      if (side.prices.length > maxPivots) {
        side.prices.shift();
        side.bars.shift();
      }
    }

    if (!newPivot) continue;

    // plotForecast(newPivot, pivotPrice, pivotBar, pivotBias)
    const pivotHigh = pivotBias === HIGH;
    const sign = pivotHigh ? -1 : 1;
    const side = pivotHigh ? bearish : bullish;
    array.sort(side.prices);
    array.sort(side.bars);
    const maxPrices = array.percentile_nearest_rank(side.prices, maxPercentile);
    const maxBars = array.percentile_nearest_rank(side.bars, maxPercentile);
    const offsetOf = (move: number) => sign * (normalize ? roundToMintick(pivotPrice * move) : move);

    if (cfg.noOverlap && !cfg.onlyLast) {
      if (zoneBox && !zoneBox.deleted && zoneBox.right > pivotBar) zoneBox.right = pivotBar;
      for (const l of zoneLabels) if (!l.deleted && l.x > pivotBar) remove(labels, l);
      for (const l of zoneLines) if (!l.deleted && l.x2 > pivotBar) remove(lines, l);
    }
    if (cfg.onlyLast) {
      if (zoneBox) remove(boxes, zoneBox);
      for (const l of zoneLabels) remove(labels, l);
      for (const l of zoneLines) remove(lines, l);
    }

    zoneBox = create(boxes, {
      left: pivotBar, top: pivotPrice, right: pivotBar + maxBars, bottom: pivotPrice + offsetOf(maxPrices),
      bg: pivotHigh ? cfg.bearishColor : cfg.bullishColor, border: null, deleted: false,
    });
    zoneLabels = [];
    zoneLines = [];

    for (const level of levels) {
      if (!level.on) continue;
      // plotGrid()
      const pricePercentile = array.percentile_nearest_rank(side.prices, level.data);
      const barPercentile = array.percentile_nearest_rank(side.bars, level.data);
      const css = pivotHigh ? level.bear : level.bull;
      const tag = `${level.data}th`;
      const y = pivotPrice + offsetOf(pricePercentile);
      zoneLines.push(create(lines, {
        x1: pivotBar, y1: y, x2: pivotBar + maxBars, y2: y, color: css, style: level.style, deleted: false,
      }));
      zoneLines.push(create(lines, {
        x1: pivotBar + barPercentile, y1: pivotPrice, x2: pivotBar + barPercentile, y2: pivotPrice + offsetOf(maxPrices),
        color: css, style: level.style, deleted: false,
      }));
      zoneLabels.push(create(labels, {
        x: pivotBar + maxBars, y, text: tag, textColor: css, style: 'label_left', size: level.size, deleted: false,
      }));
      zoneLabels.push(create(labels, {
        x: pivotBar + barPercentile, y: pivotPrice, text: tag, textColor: css, style: pivotHigh ? 'label_down' : 'label_up',
        size: level.size, deleted: false,
      }));
    }

    // plotMarks()
    if (cfg.marks) {
      create(labels, {
        x: pivotBar, y: pivotPrice, text: '•', textColor: markColor, style: pivotBias === HIGH ? 'label_down' : 'label_up',
        size: 18, deleted: false,
      });
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const drawn = (...v: number[]) => v.every((x) => !Number.isNaN(x));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // an object with an na coordinate is not drawn
    boxes: boxes.filter((b) => drawn(b.left, b.top, b.right, b.bottom)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
      bgColor: b.bg ?? 'transparent', borderColor: b.border ?? 'transparent',
    })),
    lines: lines.filter((l) => drawn(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color,
      ...(l.style !== 'solid' ? { style: l.style } : {}),
    })),
    labels: labels.filter((l) => drawn(l.x, l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor, style: l.style, size: l.size,
    })),
  };
}

export const ReversalProbabilityZoneLevels = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
