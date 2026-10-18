/**
 * Volume Sentiment Breakout Channels [AlgoAlpha]
 *
 * The close is normalised in the range of the last 'Normalization Length' bars; `vol` is its standard deviation
 * over 14 bars and `lower` the weighted average of `vol` over 'Box Detection Length' bars. `duration` is the number
 * of bars since `lower` crossed over `vol`. When `vol` crosses over `lower` after more than 10 bars, a channel is
 * made from the highest high to the lowest low of these `duration` bars, unless it overlaps a running channel: a
 * grey box, a red box at its top and a green box at its bottom (each half an ATR high), a dashed mid line and four
 * border lines.
 *
 * Volume profile of a channel: its price range is cut in 20 rows; each bar adds its volume to every row that it
 * touches, with a plus sign when it closed above its open and a minus sign otherwise. On each bar of a running
 * channel the profile is computed again and drawn twice: 20 boxes to the right of the last bar (length by the row
 * volume, colour by the sign) and 20 "sentiment" boxes to the left of the channel (colour by the signed volume, text
 * = the signed volume in percent of the largest positive one). The red and the green box show the sentiment of the
 * row of the close and the sign of the whole channel.
 *
 * A channel grows to the right until the price (the mid of the candle body with 'Strong Closes Only', else the
 * close) is above its top or below its bottom: a ▲ or ▼ is drawn and a trend line starts, the average of the lows
 * (highs) since the break, with a gradient fill to the mid of the candle body, until the close crosses it.
 *
 * At most 500 boxes and 50 lines are kept (the oldest are deleted). The boxes of one bar that have no value (a row
 * without volume data) are not drawn and are left out. As in the original, the sentiment boxes are one list for all
 * channels: a second running channel reads the boxes of the first one, and the original script stops with an error
 * ("Index 0 is out of bounds, array size is 0") when a channel is still running after the break of another one; the
 * port throws the same error. A new channel cannot overlap a running one, so this needs a price exactly on a border.
 *
 * Chart values read (optional third argument of calculate): the chart foreground colour (grey box, mid line, text
 * of the channel sentiment) and the chart background colour (sentiment boxes, fills). Without a chart context they
 * are the dark theme colours #DBDBDB and #0F0F0F.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Channel Formed' on the bars where a channel is made, 'Bullish
 * Channel Break' on a ▲ and 'Bearish Channel Break' on a ▼.
 *
 * Reference: "Volume Sentiment Breakout Channels [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import { ta, taCore, Series, color, str, array, callsite, barTime, barInterval, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LineDrawingData, MarkerData } from '../types';
import { foregroundColorOf, backgroundColorOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolumeSentimentBreakoutChannelsInputs {
  /** Normalization Length */
  normLength: number;
  /** Box Detection Length */
  length: number;
  /** Strong Closes Only: a breakout needs the mid of the candle body outside the channel */
  strong: boolean;
  green: string;
  red: string;
}

export const defaultInputs: VolumeSentimentBreakoutChannelsInputs = {
  normLength: 100,
  length: 14,
  strong: true,
  green: '#00ffbb',
  red: '#ff1100',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'normLength', type: 'int', title: 'Normalization Length', defval: 100, min: 1, group: 'Main Settings',
    tooltip: 'The number of bars used to calculate the highest high and lowest low for price normalization. Higher values create more stable normalization but may be less responsive to recent price changes.',
  },
  {
    id: 'length', type: 'int', title: 'Box Detection Length', defval: 14, min: 1, group: 'Main Settings',
    tooltip: 'The number of bars used to detect channel formation patterns. Lower values create more frequent channels but may be more sensitive to noise. Higher values create fewer but potentially more significant channels.',
  },
  {
    id: 'strong', type: 'bool', title: 'Strong Closes Only', defval: true, group: 'Main Settings',
    tooltip: 'When enabled, breakouts only trigger when more than 50% of the candle body is outside the channel. This reduces false signals from wicks. When disabled, any price movement outside the channel triggers a breakout.',
  },
  {
    id: 'green', type: 'color', title: 'Bullish Colour', defval: '#00ffbb', group: 'Appearance',
    tooltip: 'Color used for bullish visuals and positive sentiment texts.',
  },
  {
    id: 'red', type: 'color', title: 'Bearish Colour', defval: '#ff1100', group: 'Appearance',
    tooltip: 'Color used for bearish visuals and negative sentiment texts.',
  },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: '#2962FF', display: 'none' },
  { id: 'plot1', title: 'Bullish Trend', color: '#00ffbb', style: 'linebr' },
  { id: 'plot2', title: 'Bearish Trend', color: '#ff1100', style: 'linebr' },
];

export const metadata = {
  title: 'Volume Sentiment Breakout Channels [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - Sentiment Breakout',
  overlay: true,
};

/** indicator(max_boxes_count = 500); lines keep the default of 50 */
const MAX_BOXES = 500;
const MAX_LINES = 50;
/** Rows of the volume profile, and length in bars of the longest profile box */
const RES = 20;
const SCALE = 30;

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b when a - b >= -1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

/** A drawing of the script (`dead` = deleted) */
interface BoxObj {
  dead: boolean;
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
  border: string;
  text: string;
  textColor: string;
}
interface LineObj {
  dead: boolean;
  x1: number;
  y: number;
  x2: number;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
}

/** The volume profile of a range of bars */
interface Profile {
  top: number[];
  bottom: number[];
  binlen: number[];
  bintype: number[];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeSentimentBreakoutChannelsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; lines: LineDrawingData[]; boxes: BoxData[] } & {
  alerts: AlertConditionState[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const { length, strong, green, red } = cfg;
  // chart.fg_color, chart.bg_color
  const chartFg = foregroundColorOf(chart);
  const chartBg = backgroundColorOf(chart);
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);

  const lowestLow = A(ta.lowest(S(low), cfg.normLength));
  const highestHigh = A(ta.highest(S(high), cfg.normLength));
  const normalizedPrice = bars.map((b, i) => (b.close - lowestLow[i]) / (highestHigh[i] - lowestLow[i]));
  const vol = ta.stdev(S(normalizedPrice), 14);
  const upper = vol;
  const lower = ta.wma(vol, length);
  const lowerOverUpper = A(ta.crossover(lower, upper) as unknown as Series).map((v) => Boolean(v));
  const upperOverLower = A(ta.crossover(upper, lower) as unknown as Series).map((v) => Boolean(v));
  const since = A(ta.barssince(S(lowerOverUpper.map((x) => (x ? 1 : 0)))));
  // duration = math.max(nz(ta.barssince(...)), 1); h = ta.highest(duration), l = ta.lowest(duration): series length
  const duration = since.map((v) => Math.max(Number.isFinite(v) ? v : 0, 1));
  const highestSite = callsite.highest();
  const lowestSite = callsite.lowest();
  const atr = A(ta.atr(bars, length));

  const C = (c: string, transp: number) => String(color.new(c, transp));
  const green90 = C(green, 90);
  const red90 = C(red, 90);

  // All objects in creation order (count limit), and the arrays of the script (running channels, newest first)
  const allBoxes: BoxObj[] = [];
  const allLines: LineObj[] = [];
  const boxes: BoxObj[] = [];
  const boxesU: BoxObj[] = [];
  const boxesL: BoxObj[] = [];
  const centerLines: LineObj[] = [];
  const upperTopLines: LineObj[] = [];
  const upperBottomLines: LineObj[] = [];
  const lowerTopLines: LineObj[] = [];
  const lowerBottomLines: LineObj[] = [];
  const lineArrays = [centerLines, upperTopLines, upperBottomLines, lowerTopLines, lowerBottomLines];
  let sentiments: BoxObj[] = [];
  let profileBoxes: BoxObj[] = [];
  // A deleted box has na coordinates
  const leftOf = (b: BoxObj) => (b.dead ? NaN : b.left);
  const rightOf = (b: BoxObj) => (b.dead ? NaN : b.right);
  const topOf = (b: BoxObj) => (b.dead ? NaN : b.top);
  const bottomOf = (b: BoxObj) => (b.dead ? NaN : b.bottom);
  // When a creation brings the count above max + 5, the oldest objects are deleted until max remain
  const newBox = (left: number, top: number, right: number, bottom: number, bg: string, border: string): BoxObj => {
    const obj: BoxObj = { dead: false, left, top, right, bottom, bg, border, text: '', textColor: '#FFFFFF' };
    allBoxes.push(obj);
    if (allBoxes.length > MAX_BOXES + 5) {
      for (const old of allBoxes.splice(0, allBoxes.length - MAX_BOXES)) old.dead = true;
    }
    return obj;
  };
  const newLine = (x1: number, y: number, x2: number, col: string, width: number, style: LineObj['style']): LineObj => {
    const obj: LineObj = { dead: false, x1, y, x2, color: col, width, style };
    allLines.push(obj);
    if (allLines.length > MAX_LINES + 5) {
      for (const old of allLines.splice(0, allLines.length - MAX_LINES)) old.dead = true;
    }
    return obj;
  };
  const deleteBox = (b: BoxObj) => {
    if (b.dead) return;
    b.dead = true;
    allBoxes.splice(allBoxes.indexOf(b), 1);
  };

  // profileCalculation(start_index, end_index, res, scale, top_truncation, bottom_truncation) on bar i
  const profile = (i: number, startIndex: number, topTruncation: number, bottomTruncation: number): Profile => {
    // array.new_float(res): res na values; the rows are inserted before them
    const out: Profile = {
      top: new Array<number>(RES).fill(NaN), bottom: new Array<number>(RES).fill(NaN),
      binlen: new Array<number>(RES).fill(NaN), bintype: new Array<number>(RES).fill(NaN),
    };
    const highs: number[] = [];
    const lows: number[] = [];
    const volumes: number[] = [];
    const dirs: number[] = [];
    if (!Number.isNaN(startIndex)) {
      for (let k = startIndex; k <= i; k++) {
        highs.push(high[k]);
        lows.push(low[k]);
        volumes.push(volume[k]);
        dirs.push(gt(bars[k].close, bars[k].open) ? 1 : -1);
      }
    }
    let maxx = array.max(highs);
    let minn = array.min(lows);
    if (!Number.isNaN(topTruncation)) maxx = Math.min(maxx, topTruncation);
    if (!Number.isNaN(bottomTruncation)) minn = Math.max(minn, bottomTruncation);
    if (highs.length > 0 && gt(maxx, minn)) {
      const step = (maxx - minn) / RES;
      for (let r = 0; r <= RES - 1; r++) {
        let binSize = 0;
        let binSigned = 0;
        const bottom = minn + r * step;
        const top = minn + (r + 1) * step;
        out.bottom.splice(r, 0, bottom);
        out.top.splice(r, 0, top);
        for (let j = 0; j <= highs.length - 1; j++) {
          const above = gt(lows[j], top);
          const below = gt(bottom, highs[j]);
          if (!(above || below)) {
            binSize += volumes[j];
            binSigned += volumes[j] * dirs[j];
          }
        }
        out.binlen.splice(r, 0, binSize);
        out.bintype.splice(r, 0, binSigned);
      }
    }
    return out;
  };
  const gradientOf = (p: Profile, r: number, binMax: number): string => {
    const c = gt(p.bintype[r], 0)
      ? color.from_gradient(p.binlen[r], 0, binMax, green90, green)
      : color.from_gradient(p.binlen[r], 0, binMax, red90, red);
    return c == null ? 'transparent' : String(c);
  };
  // The row of the close, and the texts of the red and green boxes
  const sentimentTexts = (
    p: Profile, close: number, centerY: number, upperBox: BoxObj, lowerBox: BoxObj, percentFormat: boolean,
  ) => {
    let curIdx = NaN;
    for (let r = 0; r <= RES - 1; r++) {
      if (ge(close, p.bottom[r]) && ge(p.top[r], close)) {
        curIdx = r;
        break;
      }
    }
    if (Number.isNaN(curIdx)) return;
    const maxAbsBt = Math.max(Math.abs(array.max(p.bintype)), Math.abs(array.min(p.bintype)));
    const curBt = p.bintype[curIdx];
    const value = (curBt / maxAbsBt) * 100;
    const sentimentText = `Current Sentiment: ${percentFormat ? str.tostring(value, 'percent') : str.tostring(value)}%`;
    let channelSum = 0;
    for (let r = 0; r <= RES - 1; r++) channelSum += p.bintype[r];
    const channelText = `Overall Sentiment: ${gt(channelSum, 0) ? 'Bullish' : 'Bearish'}`;
    const [withSentiment, withChannel] = gt(close, centerY) ? [lowerBox, upperBox] : [upperBox, lowerBox];
    if (!withSentiment.dead) {
      withSentiment.text = sentimentText;
      withSentiment.textColor = ge(curBt, 0) ? green : red;
    }
    if (!withChannel.dead) {
      withChannel.text = channelText;
      withChannel.textColor = chartFg;
    }
  };

  const channelBreak: boolean[] = [];
  const channelBreakDown: boolean[] = [];
  const newChannel = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const h = highestSite(bar.high, duration[i]);
    const l = lowestSite(bar.low, duration[i]);
    const vola = atr[i] / 2;

    // New channel
    if (upperOverLower[i] && duration[i] > 10) {
      // f_can_create(h, l): no overlap with a running channel
      if (!boxes.some((b) => gt(h, bottomOf(b)) && gt(topOf(b), l))) {
        const left = i - duration[i];
        boxes.unshift(newBox(left, h, i, l, C(chartFg, 90), 'transparent'));
        boxesU.unshift(newBox(left, h, i, h - vola, C(red, 70), 'transparent'));
        boxesL.unshift(newBox(left, l + vola, i, l, C(green, 70), 'transparent'));
        const p = profile(i, leftOf(boxes[0]), topOf(boxes[0]), bottomOf(boxes[0]));
        const binMax = array.max(p.binlen);
        for (let r = 0; r <= RES - 1; r++) {
          const boxRight = leftOf(boxes[0]);
          const boxLeft = Math.trunc(boxRight - (rightOf(boxes[0]) - boxRight) * 0.15);
          const gradient = gradientOf(p, r, binMax);
          sentiments.push(newBox(boxLeft, p.top[r], boxRight, p.bottom[r], gradient, gradient));
        }
        const centerY = (h + l) / 2;
        centerLines.unshift(newLine(left, centerY, i, C(chartFg, 50), 1, 'dashed'));
        upperTopLines.unshift(newLine(left, h, i, C(red, 0), 2, 'solid'));
        upperBottomLines.unshift(newLine(left, h - vola, i, C(red, 20), 1, 'dotted'));
        lowerTopLines.unshift(newLine(left, l + vola, i, C(green, 20), 1, 'dotted'));
        lowerBottomLines.unshift(newLine(left, l, i, C(green, 0), 2, 'solid'));
        sentimentTexts(p, bar.close, centerY, boxesU[0], boxesL[0], false);
        newChannel[i] = true;
      }
    }

    // The profile boxes of the bar before are deleted
    for (const b of profileBoxes) deleteBox(b);
    profileBoxes = [];

    let broke = false;
    let brokeDown = false;
    // The end of the loop is read again on each step (Pine v6): after a removal the next channel of the arrays is
    // skipped on this bar
    const price = strong ? (bar.close + bar.open) / 2 : bar.close;
    for (let k = 0; k <= boxes.length - 1; k++) {
      const top = topOf(boxes[k]);
      const bottom = bottomOf(boxes[k]);
      const up = gt(price, top);
      if (up || gt(bottom, price)) {
        boxes.splice(k, 1);
        boxesU.splice(k, 1);
        boxesL.splice(k, 1);
        for (const list of lineArrays) list.splice(k, 1);
        sentiments = [];
        if (up) broke = true;
        else brokeDown = true;
        continue;
      }
      for (const b of [boxes[k], boxesU[k], boxesL[k]]) if (!b.dead) b.right = i;
      for (const list of lineArrays) if (!list[k].dead) list[k].x2 = i;
      const p = profile(i, leftOf(boxes[k]), top, bottom);
      const binMax = array.max(p.binlen);
      const btMax = array.max(p.bintype);
      const maxAbsBt = Math.max(Math.abs(btMax), Math.abs(array.min(p.bintype)));
      for (let r = 0; r <= RES - 1; r++) {
        const boxRight = i + 7 + SCALE;
        const boxLeft = boxRight - (Math.round(p.binlen[r]) / Math.round(binMax)) * SCALE;
        const gradient = gradientOf(p, r, binMax);
        profileBoxes.push(newBox(Math.trunc(boxLeft), p.top[r], boxRight, p.bottom[r], gradient, gradient));
        const cLeft = leftOf(boxes[k]);
        const cRight = rightOf(boxes[k]);
        const shifted = Math.trunc(cLeft - (cRight - cLeft) * 0.15);
        // sentiments.get(i_)
        if (r >= sentiments.length) throw new Error(`Index ${r} is out of bounds, array size is ${sentiments.length}`);
        const box = sentiments[r];
        const signed = p.bintype[r];
        const mag = Math.abs(signed);
        const ratio = gt(maxAbsBt, 0) ? mag / maxAbsBt : 0;
        const tr = Math.trunc(100 - Math.round(ratio * 100));
        const base = gt(signed, 0) ? green : red;
        const col = Number.isNaN(tr) ? null : color.from_gradient(tr, 0, 100, base, chartBg);
        if (!box.dead) {
          box.left = shifted;
          box.bg = col == null ? 'transparent' : String(col);
          box.border = box.bg;
          box.text = str.tostring((100 * Math.abs(signed)) / Math.abs(btMax), 'percent');
        }
        if (r === RES - 1) {
          for (const list of lineArrays) if (!list[k].dead) list[k].x1 = shifted;
        }
      }
      sentimentTexts(p, bar.close, (top + bottom) / 2, boxesU[k], boxesL[k], true);
    }
    channelBreak.push(broke);
    channelBreakDown.push(brokeDown);
  }

  // Trend lines after a break: the average of the lows (highs) since the break
  const sinceOf = (flags: boolean[]) => A(ta.barssince(S(flags.map((x) => (x ? 1 : 0)))))
    .map((v) => Math.max(Number.isFinite(v) ? v : 0, 1));
  const trndUp = taCore.sma(low, sinceOf(channelBreak));
  const trndDn = taCore.sma(high, sinceOf(channelBreakDown));
  // `activeUp and ta.crossunder(close, trnd_up)`: the crossing only runs on the bars where activeUp is true
  const crossUnder = callsite.crossunder();
  const crossOver = callsite.crossover();
  let activeUp = false;
  let activeDn = false;
  const midp = bars.map((b) => (b.close + b.open) / 2);
  const plot0: Array<{ time: number; value: number }> = [];
  const plot1: Array<{ time: number; value: number; color: string }> = [];
  const plot2: Array<{ time: number; value: number; color: string }> = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    if (channelBreak[i]) activeUp = true;
    if (activeUp && crossUnder(bar.close, trndUp[i])) activeUp = false;
    if (channelBreakDown[i]) activeDn = true;
    if (activeDn && crossOver(bar.close, trndDn[i])) activeDn = false;
    plot0.push({ time: bar.time, value: midp[i] });
    plot1.push({ time: bar.time, value: activeUp ? trndUp[i] : NaN, color: green });
    plot2.push({ time: bar.time, value: activeDn ? trndDn[i] : NaN, color: red });

    // plotchar(channelBreak ? math.min(low, low[1], low[2]) : na, "Bullish Breakout", "▲", location.absolute, green)
    if (channelBreak[i] && i >= 2) {
      markers.push({
        time: bar.time, position: 'atPriceMiddle', price: Math.min(low[i], low[i - 1], low[i - 2]), shape: 'circle',
        color: 'transparent', text: '▲', textColor: green, size: 'tiny',
      });
    }
    if (channelBreakDown[i] && i >= 2) {
      markers.push({
        time: bar.time, position: 'atPriceMiddle', price: Math.max(high[i], high[i - 1], high[i - 2]), shape: 'circle',
        color: 'transparent', text: '▼', textColor: red, size: 'tiny',
      });
    }
  }

  const fills = [
    // fill(mid, b1, midp, trnd_up, color.new(chart.bg_color, 70), color.new(green, 70), "Bullish Fill")
    {
      plot1: 'plot0', plot2: 'plot1', options: { title: 'Bullish Fill' },
      gradient: {
        topValue: midp, bottomValue: trndUp,
        topColor: new Array<string>(n).fill(C(chartBg, 70)), bottomColor: new Array<string>(n).fill(C(green, 70)),
      },
    },
    // fill(mid, b2, trnd_dn, midp, color.new(red, 70), color.new(chart.bg_color, 70), "Bearish Fill")
    {
      plot1: 'plot0', plot2: 'plot2', options: { title: 'Bearish Fill' },
      gradient: {
        topValue: trndDn, bottomValue: midp,
        topColor: new Array<string>(n).fill(C(red, 70)), bottomColor: new Array<string>(n).fill(C(chartBg, 70)),
      },
    },
  ];

  // A bar before the first bar (the left of a sentiment box of an early channel) keeps the bar spacing
  const interval = barInterval(bars);
  const time = (index: number) => (index >= 0 ? barTime(bars, index, interval) : bars[0].time + index * interval);
  const drawn = (...values: number[]) => values.every((v) => Number.isFinite(v));
  const boxOut: BoxData[] = allBoxes.filter((b) => drawn(b.left, b.right, b.top, b.bottom)).map((b) => ({
    time1: time(b.left), price1: b.top, time2: time(b.right), price2: b.bottom, bgColor: b.bg, borderColor: b.border,
    borderWidth: 1, borderStyle: 'solid' as const, text: b.text, textColor: b.textColor, textSize: 'auto' as const,
  }));
  const lineOut: LineDrawingData[] = allLines.filter((ln) => drawn(ln.x1, ln.x2, ln.y)).map((ln) => ({
    time1: time(ln.x1), price1: ln.y, time2: time(ln.x2), price2: ln.y, color: ln.color, width: ln.width, style: ln.style,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills,
    markers,
    lines: lineOut,
    boxes: boxOut,
    // alertcondition(newChannel, ...) / alertcondition(channelBreak, ...) / alertcondition(channelBreak_, ...)
    alerts: alertStates(alertConditions, bars, [newChannel, channelBreak, channelBreakDown]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Channel Formed', message: 'A new channel has formed.' },
  { id: 'alert1', title: 'Bullish Channel Break', message: 'Price broke above the channel.' },
  { id: 'alert2', title: 'Bearish Channel Break', message: 'Price broke below the channel.' },
];

export const VolumeSentimentBreakoutChannels = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions,
};
