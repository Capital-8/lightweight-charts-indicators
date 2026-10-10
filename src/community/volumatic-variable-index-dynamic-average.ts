/**
 * Volumatic Variable Index Dynamic Average [BigBeluga]
 *
 * A VIDYA (an exponential average whose weight follows the absolute Chande momentum of the source), smoothed with a
 * 15-bar simple average, with an upper and a lower band at "Distance factor" times the 200-bar ATR. The trend turns up
 * when the source crosses above the upper band and down when it crosses below the lower band. The plotted line is the
 * lower band in an up trend and the upper band in a down trend (no value on the bar of a trend change), with a
 * gradient fill to the middle of the bar and a label marker on the bar after each trend change.
 *
 * Liquidity lines: a short line at the low of each pivot low of the close (3 bars on each side) above the trend line,
 * and at the high of each pivot high below it. When the trend line crosses such a line within 50 bars, the line ends
 * there and two labels are placed on the bar before: the average volume of the 6 last calls of the pivot branch, and a
 * circle. These lines and labels are only made on the last 5,000 bars. At most 500 lines and 500 labels are kept.
 *
 * The last bar has two more labels at the trend line: the up-bar and down-bar volume since the last trend change with
 * their difference in percent of their average, and a star.
 *
 * The port has no chart theme: the foreground colour of the chart (texts) is #DBDBDB, the value of the reference run
 * (dark chart).
 *
 * Reference: "Volumatic Variable Index Dynamic Average [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import { ta, math, str, color, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface VolumaticVariableIndexDynamicAverageInputs {
  vidyaLength: number;
  vidyaMomentum: number;
  /** Band distance in ATR(200) */
  bandDistance: number;
  source: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'hlcc4';
  upTrendColor: string;
  downTrendColor: string;
  /** Gradient fill between the trend line and the middle of the bar */
  shadow: boolean;
}

export const defaultInputs: VolumaticVariableIndexDynamicAverageInputs = {
  vidyaLength: 10,
  vidyaMomentum: 20,
  bandDistance: 2,
  source: 'close',
  upTrendColor: '#17dfad',
  downTrendColor: '#dd326b',
  shadow: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'vidyaLength', type: 'int', title: 'VIDYA Length', defval: 10 },
  { id: 'vidyaMomentum', type: 'int', title: 'VIDYA Momentum', defval: 20 },
  { id: 'bandDistance', type: 'float', title: 'Distance factor for upper/lower bands', defval: 2, step: 0.1 },
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'upTrendColor', type: 'color', title: '+', defval: '#17dfad', group: 'Color', inline: 'c' },
  { id: 'downTrendColor', type: 'color', title: '-', defval: '#dd326b', group: 'Color', inline: 'c' },
  { id: 'shadow', type: 'bool', title: 'Shadow', defval: true, group: 'Color', inline: 'c' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend Line', color: '#2962FF', lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Bar Middle', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Volumatic Variable Index Dynamic Average [BigBeluga]',
  shortTitle: 'Volumatic VIDYA [BigBeluga]',
  overlay: true,
};

/** chart.fg_color of the reference run (dark chart) */
const CHART_FG = '#DBDBDB';
/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** Pivot bars on each side */
const PIVOT_BARS = 3;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  textColor: string;
  style: LabelData['style'];
  size?: LabelData['size'];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumaticVariableIndexDynamicAverageInputs> = {},
): Omit<IndicatorResult, 'markers' | 'labels' | 'lines'> & { markers: MarkerData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const vidyaLength = cfg.vidyaLength;
  const momentumLength = Math.trunc(cfg.vidyaMomentum);
  const upColor = cfg.upTrendColor;
  const downColor = cfg.downTrendColor;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const src: number[] = bars.map((b) => {
    switch (cfg.source) {
      case 'open': return b.open;
      case 'high': return b.high;
      case 'low': return b.low;
      case 'hl2': return (b.high + b.low) / 2;
      case 'hlc3': return (b.high + b.low + b.close) / 3;
      case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
      case 'hlcc4': return (b.high + b.low + b.close + b.close) / 4;
      default: return b.close;
    }
  });

  // vidya_calc(): the momentum of bar 0 is na, so its negative part is na there (na >= 0 is false)
  const momentum = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const sumPos = A(math.sum(S(momentum.map((m) => (ge(m, 0) ? m : 0))), momentumLength));
  const sumNeg = A(math.sum(S(momentum.map((m) => (ge(m, 0) ? 0 : -m))), momentumLength));
  const alpha = 2 / (vidyaLength + 1);
  const vidyaRaw: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const absCmo = Math.abs((100 * (sumPos[i] - sumNeg[i])) / (sumPos[i] + sumNeg[i]));
    const prev = i > 0 && !isNaN(vidyaRaw[i - 1]) ? vidyaRaw[i - 1] : 0; // nz(vidya_value[1])
    const v = ((alpha * absCmo) / 100) * src[i] + (1 - (alpha * absCmo) / 100) * prev;
    vidyaRaw[i] = Number.isFinite(v) ? v : NaN;
  }
  const vidya = A(ta.sma(S(vidyaRaw), 15));
  const atr = A(ta.atr(bars, 200));
  const upper = vidya.map((v, i) => v + atr[i] * cfg.bandDistance);
  const lower = vidya.map((v, i) => v - atr[i] * cfg.bandDistance);
  const crossUp = callsite.crossover();
  const crossDown = callsite.crossunder();

  const pivotHigh = A(ta.pivothigh(new Series(bars, (b) => b.high), PIVOT_BARS, PIVOT_BARS));
  const pivotLow = A(ta.pivotlow(new Series(bars, (b) => b.close), PIVOT_BARS, PIVOT_BARS));

  // Drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain. A deleted line reads as na.
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const newLine = (l: Omit<Ln, 'deleted'>): Ln => {
    const o = { ...l, deleted: false };
    lines.push(o);
    if (lines.length > MAX_OBJECTS + 5) for (const d of lines.splice(0, lines.length - MAX_OBJECTS)) d.deleted = true;
    return o;
  };
  const newLabel = (l: Lb) => {
    labels.push(l);
    if (labels.length > MAX_OBJECTS + 5) labels.splice(0, labels.length - MAX_OBJECTS);
  };

  // The line arrays of the script start with 500 na lines, which are never crossed. A line 50 bars old or deleted is
  // never crossed again: `start` skips this oldest part of each array.
  const lowLines: Ln[] = [];
  const highLines: Ln[] = [];
  const start = { low: 0, high: 0 };
  const lowVolume = callsite.sum();
  const highVolume = callsite.sum();
  let volumeValue = NaN;

  const smoothed: number[] = new Array(n).fill(NaN);
  const trendColor: string[] = new Array(n);
  const markers: MarkerData[] = [];
  let trendUp = false;
  let upVolume = NaN;
  let downVolume = NaN;
  // ta.change() of the two trend-change flags. In `a or b` the second call only runs when the first is false and
  // compares with its own last call.
  let prevCrossUpFlag = false;
  let prevCrossDownSeen = false;

  /** extend_liquidity_lines(): `price_level[1]` is the trend line of the bar before */
  const extend = (list: Ln[], side: 'low' | 'high', i: number) => {
    if (n - 1 - i >= 5000) return;
    const isCross = side === 'high';
    const level = smoothed[i];
    const before = i > 0 ? smoothed[i - 1] : NaN;
    while (start[side] < list.length && (list[start[side]].deleted || i - list[start[side]].x1 >= 50)) start[side]++;
    for (let k = start[side]; k < list.length; k++) {
      const l = list[k];
      if (l.deleted) continue;
      const y = l.y;
      const cross = isCross ? lt(level, y) && ge(before, y) : gt(level, y) && le(before, y);
      if (cross && i - l.x1 < 50) {
        l.x2 = i;
        // the element after a removed one moves to its index and is skipped by the loop
        list.splice(k, 1);
        newLabel({
          x: i - 1, y: before, text: str.tostring(volumeValue, 'volume'), color: String(color.rgb(0, 0, 0, 99)),
          textColor: CHART_FG, style: isCross ? 'label_lower_left' : 'label_upper_left', size: 'small',
        });
        newLabel({
          x: i - 1, y: before, text: '◉', color: '#00000003', textColor: isCross ? downColor : upColor,
          style: 'label_center', size: 'normal',
        });
      }
    }
  };

  const upMarkerColor = String(color.new(upColor, 50));
  const downMarkerColor = String(color.new(downColor, 50));
  let prevTrendUp = false;
  let prevCrossUp = false;
  let prevCrossDown = false;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (crossUp(src[i], upper[i])) trendUp = true;
    if (crossDown(src[i], lower[i])) trendUp = false;
    const changed = i > 0 && trendUp !== prevTrendUp;
    smoothed[i] = changed ? NaN : trendUp ? lower[i] : upper[i];
    trendColor[i] = trendUp ? upColor : downColor;

    if (i >= PIVOT_BARS) {
      const p = bars[i - PIVOT_BARS];
      if (gt(p.low, smoothed[i]) && !isNaN(pivotLow[i])) {
        lowLines.push(newLine({ x1: i - PIVOT_BARS, x2: i - PIVOT_BARS + 5, y: p.low, color: String(color.new(upColor, 50)) }));
        volumeValue = lowVolume(i, b.volume ?? NaN, 2 * PIVOT_BARS) / (2 * PIVOT_BARS);
      }
      if (lt(p.high, smoothed[i]) && !isNaN(pivotHigh[i])) {
        highLines.push(newLine({ x1: i - PIVOT_BARS, x2: i - PIVOT_BARS + 5, y: p.high, color: String(color.new(downColor, 50)) }));
        volumeValue = highVolume(i, -(b.volume ?? NaN), 2 * PIVOT_BARS) / (2 * PIVOT_BARS);
      }
    }
    extend(highLines, 'high', i);
    extend(lowLines, 'low', i);

    const trendCrossUp = !prevTrendUp && trendUp;
    const trendCrossDown = !trendUp && prevTrendUp;
    const changeUp = trendCrossUp !== prevCrossUpFlag;
    prevCrossUpFlag = trendCrossUp;
    let reset = changeUp;
    if (!changeUp) {
      reset = trendCrossDown !== prevCrossDownSeen;
      prevCrossDownSeen = trendCrossDown;
    }
    if (reset) {
      upVolume = 0;
      downVolume = 0;
    } else {
      upVolume += gt(b.close, b.open) ? (b.volume ?? NaN) : 0;
      downVolume += lt(b.close, b.open) ? (b.volume ?? NaN) : 0;
    }

    // plotshape(trend_cross_up[1] ? smoothed_value : na, ...), location.absolute
    if (prevCrossUp && !isNaN(smoothed[i])) {
      markers.push({ time: b.time, position: 'atPriceBottom', price: smoothed[i], shape: 'labelUp', color: upMarkerColor, text: '▲', textColor: CHART_FG });
    }
    if (prevCrossDown && !isNaN(smoothed[i])) {
      markers.push({ time: b.time, position: 'atPriceTop', price: smoothed[i], shape: 'labelDown', color: downMarkerColor, text: '▼', textColor: CHART_FG });
    }
    prevCrossUp = trendCrossUp;
    prevCrossDown = trendCrossDown;
    prevTrendUp = trendUp;

    if (i === n - 1) {
      const pct = str.tostring(((upVolume - downVolume) / ((upVolume + downVolume) / 2)) * 100, 'percent');
      newLabel({
        x: i, y: smoothed[i],
        text: 'Buy: ' + str.tostring(upVolume, 'volume') + '\n Sell: ' + str.tostring(downVolume, 'volume') + '\nDelta Volume: ' + (pct === 'NaN%' ? '0%' : pct),
        color: String(color.new(trendColor[i], 90)), textColor: CHART_FG, style: trendUp ? 'label_upper_left' : 'label_lower_left',
      });
      newLabel({ x: i, y: smoothed[i], text: '✪', color: '#00000003', textColor: trendColor[i], style: 'label_center', size: 'large' });
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const fillColor = trendColor.map((c): string | null => String(color.new(c, cfg.shadow ? 80 : 100)));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: smoothed[i], color: trendColor[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: hl2[i] })),
    },
    // fill(p1, p2, smoothed_value, hl2, color.new(trend_color, 80), na)
    fills: [{
      plot1: 'plot0', plot2: 'plot1',
      gradient: { topValue: smoothed.slice(), bottomValue: hl2, topColor: fillColor, bottomColor: fillColor.map(() => null) },
    }],
    markers,
    lines: lines.map((l) => ({ time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color })),
    // a label with an na price is not drawn
    labels: labels.filter((l) => !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style,
      ...(l.size ? { size: l.size } : {}),
    })),
  };
}

export const VolumaticVariableIndexDynamicAverage = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
