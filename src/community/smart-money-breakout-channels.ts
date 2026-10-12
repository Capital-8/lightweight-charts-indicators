/**
 * Smart Money Breakout Channels [AlgoAlpha]
 *
 * The close is normalised in the range of the last 'Normalization Length' bars and `vol` is its standard deviation
 * over 14 bars. `upper` / `lower` are the positions of the highest / lowest `vol` in the last 'Box Detection Length'
 * + 1 bars. `duration` is the number of bars since `lower` crossed over `upper`. When `upper` crosses over `lower`
 * after more than 10 bars, a channel is made from the highest high to the lowest low of these `duration` bars:
 * a grey box, a red box at its top and a green box at its bottom (each half an ATR high) and a dashed mid line.
 * A channel grows to the right until the price (the mid of the candle body with 'Strong Closes Only', else the
 * close) is above its top or below its bottom: a breakout label is drawn at the opposite side and the channel
 * stops there. Without 'Nested Channels' a new channel is not made while it overlaps a running one.
 *
 * Volume: two candle series are drawn from the mid line of the newest running channel (up volume above, down
 * volume below; total volume or volume delta in the other modes), scaled by the 20-bar average volume, and the
 * volume of the bar is written in the red or green box. On the last bar a gauge of 21 segments is drawn 2 bars
 * after the channel, with a pointer at the place of the volume delta between its lowest and highest value since
 * the last cross of `lower` over `upper`.
 *
 * Limit, lower-timeframe volume: the original reads the up volume, down volume and delta of each bar from the bars
 * of 'Volume Delta Timeframe Source' (default 1 minute) with `requestUpAndDownVolume()` of the ta library of the
 * platform. The bars passed to a port are the chart bars only, so the port ESTIMATES these three values from the
 * chart bars (src/lower-tf-volume.ts): all the volume of a bar is up volume or down volume by the library rule (up
 * when close > open, down when close < open, else by the close against the previous close, else as the previous bar).
 * So with the default inputs the volume numbers in the boxes, the heights of the volume candles and the gauge
 * pointer are NOT the values of the original. Also, the original has these values only on the bars where data of
 * the lower timeframe exists (the most recent bars for 1 minute; elsewhere its texts are "NaNK/NaNK", its candles
 * are flat and its pointer is missing), while the port has the estimate on every bar. Everything else (channels,
 * mid lines, breakout labels, gauge segments, colours, and the texts and candles of the mode "Volume") does not use
 * these values.
 * The timeframe input is kept. In the port it only does this: equal to the chart timeframe (taken from the bar
 * times), the chart bars are the bars of the request and the three values are the original ones; below the chart
 * timeframe, the estimate is used whatever its value; above the chart timeframe, the error of the library is
 * thrown.
 *
 * Chart values read: the chart foreground colour (channel box, mid line, texts, breakout label texts, gauge pointer,
 * table). Without a chart context it is the dark theme colour #DBDBDB. A gauge pointer without a value (na) is not drawn and is left out. The 3 alert conditions of the
 * script have no output.
 *
 * Chart timeframe: `timeframe` of the chart context (optional third argument of calculate) when given; without it
 * the chart timeframe is read from the bar spacing (the most frequent gap between two bars).
 *
 * Reference: "Smart Money Breakout Channels [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import {
  ta, Series, color, math, str, timeframe, callsite, barTime, box, line, resetDrawings, setDrawingBar,
  type Box, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, MarkerData, PineSize, PlotCandleData, TableData } from '../types';
import { chartTimeframe } from '../anchor-period';
import { foregroundColorOf, type ChartContext } from '../chart-context';
import { upDownVolumeOfChartBars } from '../lower-tf-volume';

export interface SmartMoneyBreakoutChannelsInputs {
  /** Nested Channels: several channels can run at the same time */
  overlap: boolean;
  /** Strong Closes Only: a breakout needs the mid of the candle body outside the channel */
  strong: boolean;
  /** Normalization Length */
  normLength: number;
  /** Box Detection Length */
  length: number;
  /** Show Volume Analysis (the volume candles) */
  showVolume: boolean;
  volMode: 'Volume' | 'Comparison' | 'Delta';
  /** Volume Delta Timeframe Source (see the file header for what it does in the port) */
  tf: string;
  volScale: number;
  textSize: 'Tiny' | 'Small' | 'Medium' | 'Large';
  green: string;
  red: string;
}

export const defaultInputs: SmartMoneyBreakoutChannelsInputs = {
  overlap: false,
  strong: true,
  normLength: 100,
  length: 14,
  showVolume: true,
  volMode: 'Comparison',
  tf: '1',
  volScale: 0.5,
  textSize: 'Tiny',
  green: '#00ffbb',
  red: '#ff1100',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'overlap', type: 'bool', title: 'Nested Channels', defval: false, group: 'Main Settings',
    tooltip: 'When enabled, allows multiple channels to overlap. When disabled, only one channel can exist at a time. Overlapping channels can show multiple breakout levels simultaneously.',
  },
  {
    id: 'strong', type: 'bool', title: 'Strong Closes Only', defval: true, group: 'Main Settings',
    tooltip: 'When enabled, breakouts only trigger when more than 50% of the candle body is outside the channel. This reduces false signals from wicks. When disabled, any price movement outside the channel triggers a breakout.',
  },
  {
    id: 'normLength', type: 'int', title: 'Normalization Length', defval: 100, min: 1, group: 'Main Settings',
    tooltip: 'The number of bars used to calculate the highest high and lowest low for price normalization. Higher values create more stable normalization but may be less responsive to recent price changes.',
  },
  {
    id: 'length', type: 'int', title: 'Box Detection Length', defval: 14, min: 1, group: 'Main Settings',
    tooltip: 'The number of bars used to detect channel formation patterns. Lower values create more frequent channels but may be more sensitive to noise. Higher values create fewer but potentially more significant channels.',
  },
  {
    id: 'showVolume', type: 'bool', title: 'Show Volume Analysis', defval: true, group: 'Volume Analysis',
    tooltip: 'When enabled, displays volume analysis as candle-like bars within the channel. This helps identify volume patterns that may precede breakouts.',
  },
  {
    id: 'volMode', type: 'string', title: 'Volume Display Mode', defval: 'Comparison', options: ['Volume', 'Comparison', 'Delta'], group: 'Volume Analysis',
    tooltip: 'Volume: Shows total volume as symmetrical bars. Comparison: Shows up volume above midline, down volume below. Delta: Shows net volume delta (positive above, negative below midline).',
  },
  {
    id: 'tf', type: 'timeframe', title: 'Volume Delta Timeframe Source', defval: '1', group: 'Volume Analysis',
    tooltip: 'The timeframe used to calculate volume delta data. Lower timeframes provide more granular volume analysis but may be noisier.',
  },
  {
    id: 'volScale', type: 'float', title: 'Volume Scale', defval: 0.5, min: 0.1, max: 2.0, step: 0.1, group: 'Volume Analysis',
    tooltip: 'Adjusts the height of volume bars relative to channel size. Higher values make volume bars more prominent, lower values make them more subtle.',
  },
  {
    id: 'textSize', type: 'string', title: 'Volume Text Size', defval: 'Tiny', options: ['Tiny', 'Small', 'Medium', 'Large'], group: 'Appearance',
    tooltip: 'Size of the volume text at the corner of the channels.',
  },
  {
    id: 'green', type: 'color', title: 'Bullish Colour', defval: '#00ffbb', group: 'Appearance',
    tooltip: 'Primary colour for bullish visual elements. Adjust for preferred palette – affects bars, fills, and labels when momentum is positive.',
  },
  {
    id: 'red', type: 'color', title: 'Bearish Colour', defval: '#ff1100', group: 'Appearance',
    tooltip: 'Primary colour for bearish visual elements. Adjust for preferred palette – affects bars, fills, and labels when momentum is negative.',
  },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Smart Money Breakout Channels [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - Breakout Channels',
  overlay: true,
};

/** indicator(max_boxes_count = 500); lines keep the default of 50 */
const MAX_BOXES = 500;
const MAX_LINES = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SmartMoneyBreakoutChannelsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & {
    markers: MarkerData[];
    plotCandles: Record<string, PlotCandleData[]>;
    lines: LineDrawingData[];
    boxes: BoxData[];
    labels: LabelData[];
    tables: TableData[];
  } {
  const cfg = { ...defaultInputs, ...inputs };
  const { overlap, strong, length, volMode } = cfg;
  // chart.fg_color
  const chartFg = foregroundColorOf(chart);
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // [uv, dv, vold] = ta.requestUpAndDownVolume(tf): checkLTF() of the library first
  const chartTf = chartTimeframe(bars, chart);
  if (chartTf !== '' && timeframe.in_seconds(cfg.tf) > timeframe.in_seconds(chartTf)) {
    throw new Error(`Invalid lower timeframe: '${cfg.tf}'. The timeframe must be lower than or equal to '${chartTf}'`);
  }
  // The timeframe is the chart timeframe: the chart bars are the requested bars and the values are the original
  // ones. Below it, the same computation on the chart bars is the estimate of the port (see the file header).
  const { up: uv, down: dv, delta: vold } = upDownVolumeOfChartBars(bars);

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);

  const lowestLow = A(ta.lowest(S(low), cfg.normLength));
  const highestHigh = A(ta.highest(S(high), cfg.normLength));
  const normalizedPrice = bars.map((b, i) => (b.close - lowestLow[i]) / (highestHigh[i] - lowestLow[i]));
  const vol = ta.stdev(S(normalizedPrice), 14);
  const upper = A(ta.highestbars(vol, length + 1)).map((v) => (v + length) / length);
  const lower = A(ta.lowestbars(vol, length + 1)).map((v) => (v + length) / length);
  const lowerOverUpper = A(ta.crossover(S(lower), S(upper)) as unknown as Series).map((v) => Boolean(v));
  const upperOverLower = A(ta.crossover(S(upper), S(lower)) as unknown as Series).map((v) => Boolean(v));
  const since = A(ta.barssince(S(lowerOverUpper.map((x) => (x ? 1 : 0)))));
  // duration = math.max(nz(ta.barssince(...)), 1); h = ta.highest(duration), l = ta.lowest(duration): series length
  const duration = since.map((v) => Math.max(Number.isFinite(v) ? v : 0, 1));
  const highestSite = callsite.highest();
  const lowestSite = callsite.lowest();
  const smoothedVol = A(ta.sma(S(volume), 20));
  const atr = A(ta.atr(bars, length));

  const fg90 = String(color.new(chartFg, 90));
  const fg50 = String(color.new(chartFg, 50));
  const fg30 = String(color.new(chartFg, 30));
  const red70 = String(color.new(cfg.red, 70));
  const green70 = String(color.new(cfg.green, 70));
  const textSize = ({ Tiny: 'tiny', Small: 'small', Medium: 'normal', Large: 'large' } as const)[cfg.textSize];
  const kText = (v: number) => `${str.tostring(math.round(v / 1000, 1))}K`;

  // Drawings of the library registry with the limits of indicator() (count limit: a deleted object has na
  // coordinates and ignores its setters), and the arrays of the running channels (newest first)
  resetDrawings({ box: MAX_BOXES, line: MAX_LINES });
  const boxes: Box[] = [];
  const boxesU: Box[] = [];
  const boxesL: Box[] = [];
  const centerLines: Line[] = [];
  // The red and green boxes: they always get a text (possibly empty) on the bar they are made
  const bandBoxes = new Set<Box>();
  const newBox = (left: number, top: number, right: number, bottom: number, bg: string) =>
    box.new(left, top, right, bottom, 'transparent', undefined, undefined, undefined, undefined, bg);

  const markers: MarkerData[] = [];
  const upCandles: PlotCandleData[] = [];
  const downCandles: PlotCandleData[] = [];
  const labels: LabelData[] = [];
  const tables: TableData[] = [];
  let hvold = NaN;
  let lvold = NaN;

  try {
    for (let i = 0; i < n; i++) {
      setDrawingBar(i, i === n - 1);
      const bar = bars[i];
      const h = highestSite(bar.high, duration[i]);
      const l = lowestSite(bar.low, duration[i]);
      let upbreak = 0;
      let downbreak = 0;

      // var hvold = vold, var lvold = vold
      if (i === 0) {
        hvold = vold[i];
        lvold = vold[i];
      }
      if (lowerOverUpper[i]) {
        hvold = vold[i];
        lvold = vold[i];
      }
      if (gt(vold[i], hvold)) hvold = vold[i];
      if (gt(lvold, vold[i])) lvold = vold[i];

      const vola = atr[i] / 2;

      // New channel
      if (upperOverLower[i] && duration[i] > 10) {
        const canCreate = overlap || !boxes.some((b) => gt(h, box.get_bottom(b)) && gt(box.get_top(b), l));
        if (canCreate) {
          const left = i - duration[i];
          boxes.unshift(newBox(left, h, i, l, fg90));
          boxesU.unshift(newBox(left, h, i, h - vola, red70));
          boxesL.unshift(newBox(left, l + vola, i, l, green70));
          bandBoxes.add(boxesU[0]).add(boxesL[0]);
          const centerY = (h + l) / 2;
          centerLines.unshift(line.new(left, centerY, i, centerY, 'bar_index', 'none', fg50, 'dashed', 1));
        }
      }

      // Breakouts and running channels. The end of the loop is read again on each step (Pine v6), so after a
      // removal the next channel of the array is skipped on this bar.
      const price = strong ? (bar.close + bar.open) / 2 : bar.close;
      for (let k = 0; k <= boxes.length - 1; k++) {
        const top = box.get_top(boxes[k]);
        const bottom = box.get_bottom(boxes[k]);
        const isUp = gt(price, top);
        if (isUp || gt(bottom, price)) {
          if (isUp) upbreak = bottom;
          else downbreak = top;
          boxes.splice(k, 1);
          boxesU.splice(k, 1);
          boxesL.splice(k, 1);
          centerLines.splice(k, 1);
        } else {
          for (const b of [boxes[k], boxesU[k], boxesL[k]]) box.set_right(b, i);
          line.set_x2(centerLines[k], i);
          const volText = volMode === 'Volume' ? kText(volume[i])
            : volMode === 'Comparison' ? `${kText(uv[i])}/${kText(dv[i])}`
            : kText(vold[i]);
          // The price above the mid line: text in the lower (green) box, else in the upper (red) box
          const above = gt(price, (top + bottom) / 2);
          const withText = above ? boxesL[k] : boxesU[k];
          const without = above ? boxesU[k] : boxesL[k];
          box.set_text(withText, volText);
          box.set_text_halign(withText, 'right');
          box.set_text_color(withText, fg30);
          box.set_text_size(withText, textSize);
          box.set_text(without, '');
        }
      }

      // Volume candles on the newest running channel
      if (boxes.length > 0 && cfg.showVolume) {
        const topBound = box.get_top(boxes[0]);
        const bottomBound = box.get_bottom(boxes[0]);
        const mid = (topBound + bottomBound) / 2;
        const quarter = ((topBound - bottomBound) * cfg.volScale) / 4;
        let upHeight: number;
        let downHeight: number;
        let upColor = cfg.green;
        let downColor = cfg.red;
        if (volMode === 'Volume') {
          const ratio = volume[i] / smoothedVol[i];
          upHeight = ratio * quarter;
          downHeight = -upHeight;
          // getVolumeTransparency
          const transparency = math.max(20, math.min(80, 80 - (ratio - 0.5) * 40) as number) as number;
          upColor = String(color.new(chartFg, transparency));
          downColor = upColor;
        } else if (volMode === 'Comparison') {
          upHeight = Number.isNaN(uv[i]) ? 0 : (uv[i] / smoothedVol[i]) * quarter;
          downHeight = Number.isNaN(dv[i]) ? 0 : (dv[i] / smoothedVol[i]) * quarter;
        } else {
          const deltaHeight = Number.isNaN(vold[i]) ? 0 : Math.abs(vold[i] / smoothedVol[i]) * quarter;
          const positive = ge(vold[i], 0);
          upHeight = positive ? deltaHeight : 0;
          downHeight = positive ? 0 : -deltaHeight;
        }
        // A candle with an na (or infinite) value is not drawn
        if (Number.isFinite(mid) && Number.isFinite(upHeight)) {
          upCandles.push({
            time: bar.time, open: mid, high: mid + upHeight, low: mid, close: mid + upHeight,
            color: upColor, wickColor: upColor, borderColor: upColor,
          });
        }
        if (Number.isFinite(mid) && Number.isFinite(downHeight)) {
          downCandles.push({
            time: bar.time, open: mid, high: mid, low: mid + downHeight, close: mid + downHeight,
            color: downColor, wickColor: downColor, borderColor: downColor,
          });
        }
      }

      // plotshape(upbreak != 0 ? upbreak : na, ...), plotshape(downbreak != 0 ? downbreak : na, ...)
      if (!Number.isNaN(upbreak) && !eq(upbreak, 0)) {
        markers.push({
          time: bar.time, position: 'atPriceBottom', price: upbreak, shape: 'labelUp', color: cfg.green, text: '▲', textColor: chartFg,
        });
      }
      if (!Number.isNaN(downbreak) && !eq(downbreak, 0)) {
        markers.push({
          time: bar.time, position: 'atPriceTop', price: downbreak, shape: 'labelDown', color: cfg.red, text: '▼', textColor: chartFg,
        });
      }

      // Gauge on the last bar
      if (i === n - 1 && boxes.length > 0 && eq(upbreak, 0) && eq(downbreak, 0)) {
        const topBound = box.get_top(boxes[0]);
        const bottomBound = box.get_bottom(boxes[0]);
        if (!Number.isNaN(topBound) && !Number.isNaN(bottomBound) && !eq(topBound, bottomBound)) {
          const segments = 21;
          const segLen = (topBound - bottomBound) / segments;
          for (let k = 0; k <= segments - 1; k++) {
            const y1 = topBound - k * segLen;
            const y2 = topBound - (k + 1) * segLen;
            const segCol = String(color.from_gradient(y1, bottomBound, topBound, cfg.red, cfg.green));
            line.new(i + 2, y1, i + 2, y2, 'bar_index', 'none', segCol, 'solid', 4);
          }
          let delvol = -100 * 2 * ((vold[i] - lvold) / (hvold - lvold) - 0.5);
          delvol = math.max(math.min(delvol, 100) as number, -100) as number;
          const pointerPos = topBound - ((delvol + 100) / 200) * (topBound - bottomBound);
          if (Number.isFinite(pointerPos)) {
            labels.push({
              time: barTime(bars, i + 3), price: pointerPos, text: '◀', color: 'transparent', textColor: chartFg,
              size: 'small', style: 'label_left',
            });
          }
        }
      }

      // if not volumeAvailable: the warning table (made once, kept)
      if (Number.isNaN(volume[i]) && tables.length === 0) {
        tables.push({
          position: 'top_right', columns: 1, rows: 1, bgColor: cfg.red, borderWidth: 1, borderColor: chartFg,
          frameColor: chartFg, frameWidth: 1,
          cells: [{
            column: 0, row: 0, text: 'Volume not available\nGauge may not work as expected', textColor: chartFg,
            textHAlign: 'center', textSize: 'small',
          }],
        });
      }
    }
  } finally {
    setDrawingBar(null);
  }

  const time = (index: number) => barTime(bars, index);
  const boxOut: BoxData[] = box.all().map((b) => ({
    time1: time(b.left), price1: b.top, time2: time(b.right), price2: b.bottom, bgColor: String(b.bgcolor),
    borderColor: 'transparent',
    ...(bandBoxes.has(b) ? { text: b.text ?? '' } : {}),
    // the text design is set together with a text that is not empty
    ...(b.text_halign === 'right'
      ? { textHAlign: 'right' as const, textColor: String(b.text_color), textSize: b.text_size as PineSize }
      : {}),
  }));
  const lineOut: LineDrawingData[] = line.all().map((ln) => ({
    time1: time(ln.x1), price1: ln.y1, time2: time(ln.x2), price2: ln.y2, color: String(ln.color), width: ln.width,
    style: ln.style as 'solid' | 'dashed',
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    plotCandles: { volumeUp: upCandles, volumeDown: downCandles },
    lines: lineOut,
    boxes: boxOut,
    labels,
    tables,
  };
}

export const SmartMoneyBreakoutChannels = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
