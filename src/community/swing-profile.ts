/**
 * Swing Profile [BigBeluga]
 *
 * Swings are found with the highest high and the lowest low of "Swing Length" bars: a new highest high starts a
 * down move, a new lowest low starts an up move. Each time the move changes, a volume profile is drawn between the
 * last completed swing high and swing low: the price range of the leg is cut into rows of about half an ATR(200),
 * and each bar of the leg adds its volume to the rows whose middle is closer to its close than one row height. The
 * profile is drawn as boxes with an outline (or as a heatmap), with the row of the largest volume as point of
 * control (a line and the volume as text), a zigzag line between the two swings and a label with an arrow (the
 * total, buy and sell volumes are in its tooltip). On the last bar the profile of the current leg is drawn in the
 * chart foreground colour, with a label for the total, buy, sell and delta volumes.
 * An optional moving average of a source is plotted.
 *
 * As the original, the script runs on the last 2,000 bars only.
 * Chart context (optional third argument): the current leg uses the foreground colour of the chart, read from the
 * context (`foregroundColor`). Without it the colour is #DBDBDB (dark chart).
 *
 * Reference: "Swing Profile [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  array, color, compare, str, ta, Series, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, PineSize, PolylineData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface SwingProfileInputs {
  swingLength: number;
  upColor: string;
  downColor: string;
  showProfile: boolean;
  showHeatMap: boolean;
  showZigZag: boolean;
  zigZagStyle: 'Dotted' | 'Dashed' | 'Solid';
  showPoc: boolean;
  pocWidth: number;
  pocColor: string;
  dataSize: 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  maType: 'None' | 'SMA' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';
  maLength: number;
  src: SourceType;
}

export const defaultInputs: SwingProfileInputs = {
  swingLength: 50,
  upColor: color.lime,
  downColor: color.orange,
  showProfile: true,
  showHeatMap: false,
  showZigZag: true,
  zigZagStyle: 'Dotted',
  showPoc: true,
  pocWidth: 2,
  pocColor: color.red,
  dataSize: 'Small',
  maType: 'None',
  maLength: 25,
  src: 'close',
};

const PROFILE_GROUP = 'Swing Volume Profile';
const POC_GROUP = 'Point of Control';
const MA_GROUP = 'Moving Average';

export const inputConfig: InputConfig[] = [
  { id: 'swingLength', type: 'int', title: 'Swing Length', defval: 50, min: 10 },
  { id: 'upColor', type: 'color', title: '▲', defval: color.lime, inline: 'colors' },
  { id: 'downColor', type: 'color', title: '▼', defval: color.orange, inline: 'colors' },
  { id: 'showProfile', type: 'bool', title: 'Profile', defval: true, group: PROFILE_GROUP },
  { id: 'showHeatMap', type: 'bool', title: 'HeatMap', defval: false, group: PROFILE_GROUP },
  { id: 'showZigZag', type: 'bool', title: 'ZigZag', defval: true, inline: 'Zz' },
  { id: 'zigZagStyle', type: 'string', title: '', defval: 'Dotted', options: ['Dotted', 'Dashed', 'Solid'], inline: 'Zz' },
  { id: 'showPoc', type: 'bool', title: 'PoC', defval: true, inline: 'Poc', group: POC_GROUP },
  { id: 'pocWidth', type: 'int', title: '', defval: 2, inline: 'Poc', group: POC_GROUP },
  { id: 'pocColor', type: 'color', title: '', defval: color.red, inline: 'Poc', group: POC_GROUP },
  { id: 'dataSize', type: 'string', title: 'Data Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'] },
  { id: 'maType', type: 'string', title: 'Type', defval: 'None', options: ['None', 'SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'], group: MA_GROUP },
  { id: 'maLength', type: 'int', title: 'Length', defval: 25, group: MA_GROUP },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: MA_GROUP },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA', color: color.yellow, lineWidth: 1 },
];

export const metadata = {
  title: 'Swing Profile [BigBeluga]',
  shortTitle: 'Swing Profile [BigBeluga]',
  overlay: true,
};

/** indicator(calc_bars_count = 2000, max_labels_count = 500, max_boxes_count = 500); lines and polylines: 50 */
const CALC_BARS = 2000;
const MAX_LABELS = 500;
const MAX_BOXES = 500;
const MAX_LINES = 50;
const MAX_POLYLINES = 50;
/** Text colour of a box when the script gives none (Pine v6) */
const BOX_TEXT = '#FFFFFF';
/** transparentNA = color.new(color.black, 100) */
const TRANSPARENT_NA = String(color.new(color.black, 100));

/** Live drawings in creation order: above max + 5 objects the oldest are deleted until max remain */
class Registry<T> {
  live: T[] = [];

  constructor(private max: number) {}

  create(data: T): void {
    this.live.push(data);
    if (this.live.length > this.max + 5) this.live.splice(0, this.live.length - this.max);
  }
}

/** Drawings with bar indexes */
interface LineObj {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style?: 'dotted' | 'dashed';
  width?: number;
}
interface BoxObj {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
  text: string;
}
interface LabelObj {
  x: number;
  y: number;
  text: string;
  style: 'label_down' | 'label_up';
  textColor: string;
  tooltip: string;
  alignLeft: boolean;
}
interface PolyObj {
  points: Array<{ x: number; y: number }>;
  color: string;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SwingProfileInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; polylines: PolylineData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  // chart.fg_color
  const chartFg = foregroundColorOf(chart);
  const { swingLength, showProfile, showHeatMap, showPoc } = cfg;
  const n = bars.length;
  // calc_bars_count: the script runs on the last 2,000 bars; `start` is the first of them
  const start = Math.max(0, n - CALC_BARS);
  const cb = bars.slice(start);
  const m = cb.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const highest = A(ta.highest(new Series(cb, (b) => b.high), swingLength));
  const lowest = A(ta.lowest(new Series(cb, (b) => b.low), swingLength));
  // priceBinSize = ta.atr(200) * 0.5
  const atr = A(ta.atr(cb, 200));

  const lines = new Registry<LineObj>(MAX_LINES);
  const boxes = new Registry<BoxObj>(MAX_BOXES);
  const labels = new Registry<LabelObj>(MAX_LABELS);
  const polylines = new Registry<PolyObj>(MAX_POLYLINES);
  const fmtVolume = (v: number) => str.tostring(v, 'volume');
  const fmtPercent = (v: number) => str.tostring(v, 'percent');
  const zigZagStyle = cfg.zigZagStyle === 'Dotted' ? 'dotted' : cfg.zigZagStyle === 'Dashed' ? 'dashed' : undefined;

  // Swing points (bar index in the calculated bars)
  let highIndex = NaN;
  let highPrice = NaN;
  let lowIndex = NaN;
  let lowPrice = NaN;
  let isDownMove = false;

  // Profile of the leg between the two swings, drawn on bar j; `current` = the leg of the last bar
  const drawProfile = (j: number, mainColor: string, current: boolean) => {
    const priceBinSize = atr[j] * 0.5;
    // math.min / math.max: na with an na argument
    const known = !Number.isNaN(highPrice) && !Number.isNaN(lowPrice);
    const swingBottom = known ? Math.min(highPrice, lowPrice) : NaN;
    const swingTop = known ? Math.max(highPrice, lowPrice) : NaN;
    const binCount = Math.trunc(Math.abs(highPrice - lowPrice) / priceBinSize);
    const binStep = Math.abs(highPrice - lowPrice) / binCount;
    const lastSwingIndex = known ? Math.max(highIndex, lowIndex) : NaN;
    const prevSwingIndex = known ? Math.min(highIndex, lowIndex) : NaN;
    const points: Array<{ x: number; y: number }> = [];
    // An na number of rows: empty arrays and loops that do not run
    const rows = Number.isNaN(binCount) ? 0 : binCount;
    const volumeBins: number[] = new Array(rows).fill(0);
    const buyVolumeBins: number[] = new Array(rows).fill(0);
    const sellVolumeBins: number[] = new Array(rows).fill(0);

    if (!Number.isNaN(binCount)) {
      // for k = 0 to binCount - 1 with binCount = 0 counts down (k = 0, then -1): reading the empty array is the
      // runtime error of the original
      if (binCount === 0) throw new Error('Index 0 is out of bounds, array size is 0');
      const barOffset = j - lastSwingIndex;
      for (let i = barOffset; i <= lastSwingIndex - prevSwingIndex + barOffset; i++) {
        const b = cb[j - i];
        const candleVol = b.volume ?? NaN;
        for (let k = 0; k < binCount; k++) {
          const binMidPrice = swingBottom + k * binStep + binStep / 2;
          if (compare.lt(Math.abs(binMidPrice - b.close), binStep)) {
            volumeBins[k] += candleVol;
            if (compare.gt(b.close, b.open)) buyVolumeBins[k] += candleVol;
            else sellVolumeBins[k] += candleVol;
          }
        }
      }

      const maxVolume = array.max(volumeBins);
      for (let k = 0; k < binCount; k++) {
        const binLow = swingBottom + k * binStep;
        const binHigh = binLow + binStep;
        const volumeRatio = volumeBins[k] / maxVolume;
        const profileWidth = Math.trunc(volumeRatio * ((lastSwingIndex - prevSwingIndex) / 2));
        const isPoc = compare.eq(volumeRatio, 1);
        const left = showProfile ? prevSwingIndex + profileWidth : prevSwingIndex;

        if (isPoc && showPoc) {
          const mid = (binLow + binHigh) / 2;
          lines.create({ x1: left, y1: mid, x2: lastSwingIndex, y2: mid, color: cfg.pocColor, width: cfg.pocWidth });
        }
        boxes.create({
          left, top: binHigh, right: showHeatMap ? lastSwingIndex : prevSwingIndex, bottom: binLow,
          bg: showProfile || showHeatMap
            ? String(color.from_gradient(volumeRatio, 0, 1, color.new(mainColor, 90), color.new(isPoc && showPoc ? cfg.pocColor : mainColor, 50)))
            : TRANSPARENT_NA,
          text: showHeatMap ? '' : isPoc ? fmtVolume(maxVolume) : '',
        });

        if (k === 0) points.push({ x: prevSwingIndex, y: binLow });
        points.push({ x: prevSwingIndex + profileWidth, y: binLow });
        points.push({ x: prevSwingIndex + profileWidth, y: binHigh });
        if (k === binCount - 1) points.push({ x: prevSwingIndex, y: binHigh });
      }
    }

    if (showProfile) polylines.create({ points, color: showHeatMap ? String(color.new(mainColor, 50)) : mainColor });

    const totalVolume = array.sum(volumeBins);
    const buyVolume = array.sum(buyVolumeBins);
    const sellVolume = array.sum(sellVolumeBins);
    const delta = fmtPercent(((buyVolume - sellVolume) / totalVolume) * 100);
    if (current) {
      labels.create({
        x: prevSwingIndex, y: !isDownMove ? swingTop : swingBottom,
        text: 'T: ' + fmtVolume(totalVolume) + '\nB: ' + fmtVolume(buyVolume) + '\nS: ' + fmtVolume(sellVolume) + '\nD: ' + delta,
        style: !isDownMove ? 'label_down' : 'label_up', textColor: mainColor,
        tooltip: 'T - Total Volume\nB - Buy Volume\nS - Sell Volume\nD - Delta Volume', alignLeft: true,
      });
    } else {
      labels.create({
        x: prevSwingIndex, y: isDownMove ? swingTop : swingBottom, text: isDownMove ? '▼' : '▲',
        style: isDownMove ? 'label_down' : 'label_up', textColor: mainColor,
        tooltip: 'Total Volume: ' + fmtVolume(totalVolume) + '\nBuy Volume: ' + fmtVolume(buyVolume)
          + '\nSell Volume: ' + fmtVolume(sellVolume) + '\nDelta Volume: ' + delta,
        alignLeft: false,
      });
    }
  };

  for (let j = 0; j < m; j++) {
    const bar = cb[j];
    const wasDownMove: boolean = isDownMove;
    if (compare.eq(bar.high, highest[j])) isDownMove = true;
    if (compare.eq(bar.low, lowest[j])) isDownMove = false;

    // Completed swing high / low
    if (j > 0 && compare.eq(cb[j - 1].high, highest[j - 1]) && compare.lt(bar.high, highest[j])) {
      highIndex = j - 1;
      highPrice = cb[j - 1].high;
    }
    if (j > 0 && compare.eq(cb[j - 1].low, lowest[j - 1]) && compare.gt(bar.low, lowest[j])) {
      lowIndex = j - 1;
      lowPrice = cb[j - 1].low;
    }

    // The move changes: profile of the leg that ended
    if (isDownMove !== wasDownMove) {
      const swingMainColor = isDownMove ? cfg.downColor : cfg.upColor;
      if (cfg.showZigZag) {
        lines.create({ x1: highIndex, y1: highPrice, x2: lowIndex, y2: lowPrice, color: swingMainColor, style: zigZagStyle });
      }
      drawProfile(j, swingMainColor, false);
    }

    // Last bar: profile of the current leg
    if (j === m - 1) {
      lines.create({ x1: highIndex, y1: highPrice, x2: lowIndex, y2: lowPrice, color: chartFg, style: 'dashed' });
      drawProfile(j, chartFg, true);
    }
  }

  // Moving average (na with "None")
  const ma = (): number[] => {
    const source = getSourceSeries(cb, cfg.src);
    switch (cfg.maType) {
      case 'SMA': return A(ta.sma(source, cfg.maLength));
      case 'EMA': return A(ta.ema(source, cfg.maLength));
      case 'SMMA (RMA)': return A(ta.rma(source, cfg.maLength));
      case 'WMA': return A(ta.wma(source, cfg.maLength));
      case 'VWMA': return A(ta.vwma(source, cfg.maLength, new Series(cb, (b) => b.volume ?? NaN)));
      default: return [];
    }
  };
  const maValues = ma();
  const plot0 = bars.map((b, i) => {
    const v = i >= start ? maValues[i - start] : NaN;
    return { time: b.time, value: v === undefined || !Number.isFinite(v) ? NaN : v };
  });

  // Outputs: bar indexes to bar times (a drawing with an na coordinate is not drawn)
  const interval = barInterval(bars);
  const time = (x: number) => barTime(bars, start + x, interval);
  const drawn = (...v: number[]) => v.every((x) => !Number.isNaN(x));
  const size: PineSize = cfg.dataSize === 'Small' ? 'small' : cfg.dataSize === 'Normal' ? 'normal'
    : cfg.dataSize === 'Large' ? 'large' : cfg.dataSize === 'Huge' ? 'huge' : 'tiny';

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    lines: lines.live.filter((l) => drawn(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
      time1: time(l.x1), price1: l.y1, time2: time(l.x2), price2: l.y2, color: l.color,
      ...(l.style ? { style: l.style } : {}), ...(l.width !== undefined ? { width: l.width } : {}),
    })),
    boxes: boxes.live.filter((b) => drawn(b.left, b.top, b.right, b.bottom)).map((b) => ({
      time1: time(b.left), price1: b.top, time2: time(b.right), price2: b.bottom, borderColor: TRANSPARENT_NA,
      borderWidth: 0, bgColor: b.bg, ...(b.text !== '' ? { text: b.text, textColor: BOX_TEXT } : {}),
    })),
    labels: labels.live.filter((l) => drawn(l.x, l.y)).map((l) => ({
      time: time(l.x), price: l.y, text: l.text, color: TRANSPARENT_NA, style: l.style, textColor: l.textColor, size,
      tooltip: l.tooltip, ...(l.alignLeft ? { textAlign: 'left' as const } : {}),
    })),
    polylines: polylines.live.filter((p) => p.points.length > 0 && p.points.every((pt) => drawn(pt.x, pt.y))).map((p) => ({
      points: p.points.map((pt) => ({ time: time(pt.x), price: pt.y })), curved: false, closed: true, lineColor: p.color,
    })),
  };
}

export const SwingProfile = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
