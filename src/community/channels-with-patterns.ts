/**
 * Channels With Patterns [ChartPrime]
 *
 * Predictive channels started from swing pivots of the highs and lows (wicks or bodies), with candle patterns inside
 * their reversal zones:
 * - Pivots with `Pivot Length` bars on the left and `Pivot Look Forward` bars on the right. A bullish channel starts on
 *   a new pivot low (or at once in "Instant Mode" when the latest pivot is a low and the last channel was not
 *   bullish) while the low stays above the pivot low; a bearish channel likewise on pivot highs. Only one channel is
 *   active at a time, and a new one starts on a closed bar.
 * - The channel runs from the pivot bar to the current bar. Its height is `Size` x ATR (a smoothing of the true range
 *   with alpha 1 / (`ATR Length` + 1)), with a buffer of 1/7 of it and a vertical shift of `Offset Center` x 4/7 ATR;
 *   its end is the `Average H/L Length` SMA of the lows (bullish) or highs (bearish) minus / plus a cumulative ATR
 *   (the cumulative EMA of the true range / 8.71875), and it moves by the same slope on every bar. Five lines: top,
 *   upper zone edge (`Padding %`), dashed centre, lower zone edge, bottom; the two zones are filled.
 * - A bar entirely above the top (break up) or below the bottom (break down) ends the channel, with a "Break Up" /
 *   "Break Down" label ("Close" break style: the close). A channel that is broken on its first bar is deleted.
 * - Inside the upper zone: inverted hammer ("iH") and bearish engulfing ("EG"); inside the lower zone: hammer ("H")
 *   and bullish engulfing ("EG"), on closed bars, against 14-bar EMAs of the body and wicks.
 * - The last `Channel History Length` channels are kept; the latest active one extends to the right ("Extend
 *   Channel"). Presets "Stocks", "Forex", "Crypto" replace the main settings.
 * Deleting a channel deletes its labels (pattern and break labels). At most 500 lines and 500 labels are kept. The
 * alerts of the original have no output.
 *
 * Chart context: the state of the last bar (`barstate.isconfirmed`).
 *
 * Reference: "Channels With Patterns [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import {
  ta, Series, callsite, color, line, linefill, label, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type Linefill, type Label,
} from 'oakscriptjs';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface ChannelsWithPatternsInputs {
  preset: 'User' | 'Stocks' | 'Forex' | 'Crypto';
  style: 'Wick' | 'Body';
  breakStyle: 'Close' | 'High/Low';
  instant: boolean;
  atrLength: number;
  /** Offset Center (multiplied by 0.125) */
  offset: number;
  atrMultiplier: number;
  padding: number;
  pivotLength: number;
  lookForward: number;
  avgLength: number;
  enableHammer: boolean;
  enableIhammer: boolean;
  enableBullishEngulfing: boolean;
  enableBearishEngulfing: boolean;
  extend: boolean;
  showBreakLabel: boolean;
  historyLength: number;
  topColor: string;
  bottomColor: string;
  /** Opacity of the channel lines (transparency = 100 - value) */
  lineOpacity: number;
  centerColor: string;
  /** Opacity of the centre line (transparency = 100 - value) */
  centerOpacity: number;
  /** Opacity of the fills (transparency = 100 - value) */
  fillOpacity: number;
  breakUpColor: string;
  breakDownColor: string;
  textColor: string;
  hColor: string;
  ihColor: string;
  bullishEngulfingColor: string;
  bearishEngulfingColor: string;
  candleTextColor: string;
  /** Alert switches (no output) */
  newChannelAlert: boolean;
  breakAlert: boolean;
  hammerAlert: boolean;
  ihammerAlert: boolean;
  bullishEngulfingAlert: boolean;
  bearishEngulfingAlert: boolean;
}

// Input colour defaults: a hex literal with alpha 0x88 is stored with an alpha of 0.53 (byte 0x87)
export const defaultInputs: ChannelsWithPatternsInputs = {
  preset: 'User',
  style: 'Wick',
  breakStyle: 'High/Low',
  instant: true,
  atrLength: 10,
  offset: 5,
  atrMultiplier: 4,
  padding: 50,
  pivotLength: 10,
  lookForward: 15,
  avgLength: 18,
  enableHammer: true,
  enableIhammer: true,
  enableBullishEngulfing: true,
  enableBearishEngulfing: true,
  extend: true,
  showBreakLabel: true,
  historyLength: 5,
  topColor: '#337C4F',
  bottomColor: '#A52D2D',
  lineOpacity: 100,
  centerColor: '#787B86',
  centerOpacity: 100,
  fillOpacity: 30,
  breakUpColor: '#337C4F87',
  breakDownColor: '#A52D2D87',
  textColor: '#EAEAEA',
  hColor: '#337C4F87',
  ihColor: '#2D3FA587',
  bullishEngulfingColor: '#337C4F87',
  bearishEngulfingColor: '#A53B2D87',
  candleTextColor: '#EAEAEA',
  newChannelAlert: true,
  breakAlert: true,
  hammerAlert: true,
  ihammerAlert: true,
  bullishEngulfingAlert: true,
  bearishEngulfingAlert: true,
};

const G_SET = 'Settings';
const G_ATR = 'ATR';
const G_PIVOT = 'Pivot';
const G_SMOOTH = 'Smoothing';
const G_PAT = 'Candle Patterns';
const G_VIEW = 'View';
const G_COL = 'Channel Collor';
const G_PATCOL = 'Candle Pattern Color';
const G_ALERTS = 'Alerts';
const ZONE_TT = ' They will only appear inside of a reversal zone.';

export const inputConfig: InputConfig[] = [
  { id: 'preset', type: 'string', title: 'Presets', defval: 'User', options: ['User', 'Stocks', 'Forex', 'Crypto'], group: G_SET,
    tooltip: "Choose a preset configuration. 'User' allows custom settings, while others are tailored for specific markets." },
  { id: 'style', type: 'string', title: 'Style', defval: 'Wick', options: ['Wick', 'Body'], group: G_SET,
    tooltip: "Select 'Wick' or 'Body' to define pivot points based on candlestick wicks or bodies." },
  { id: 'breakStyle', type: 'string', title: 'Break Style', defval: 'High/Low', options: ['Close', 'High/Low'], group: G_SET,
    tooltip: "Choose 'Close' to use closing price or 'High/Low' for high/low price to identify channel breaks." },
  { id: 'instant', type: 'bool', title: 'Instant Mode', defval: true, group: G_SET,
    tooltip: 'Enable to initiate channels immediately upon potential formation, providing faster channel updates.' },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 10, min: 1, group: G_ATR,
    tooltip: 'Set the lookback period for Average True Range (ATR), influencing channel offset and size.' },
  { id: 'offset', type: 'float', title: 'Offset Center', defval: 5, group: G_ATR,
    tooltip: "Adjust the channel's vertical offset to optimize channel formation." },
  { id: 'atrMultiplier', type: 'float', title: 'Size', defval: 4, min: 0.25, step: 0.25, group: G_ATR,
    tooltip: 'Modify the overall size of the channel relative to ATR.' },
  { id: 'padding', type: 'float', title: 'Padding %', defval: 50, min: 0, max: 100, group: G_ATR,
    tooltip: "Adjust the channel's top and bottom quarter. 50% is perfectly in between the top and center, 100% is up to the center, and 0% is at the maximum." },
  { id: 'pivotLength', type: 'int', title: 'Pivot Length', defval: 10, min: 1, group: G_PIVOT,
    tooltip: 'Determine the lookback length for pivot points, affecting channel formation.' },
  { id: 'lookForward', type: 'int', title: 'Pivot Look Forward', defval: 15, min: 1, group: G_PIVOT,
    tooltip: 'Set the lookforward length for pivots, impacting channel initiation delay.' },
  { id: 'avgLength', type: 'int', title: 'Average H/L Length', defval: 18, min: 1, group: G_SMOOTH,
    tooltip: 'Control smoothing level for high/low prices, influencing channel slope. Higher values lead to smoother, less reactive channels.' },
  { id: 'enableHammer', type: 'bool', title: 'Enable Hammer', defval: true, group: G_PAT,
    tooltip: 'Enable this to see high probability Hammer patterns.' + ZONE_TT },
  { id: 'enableIhammer', type: 'bool', title: 'Enable Inverted Hammer', defval: true, group: G_PAT,
    tooltip: 'Enable this to see high probability Inverted Hammer patterns.' + ZONE_TT },
  { id: 'enableBullishEngulfing', type: 'bool', title: 'Enable Bullish Englufing', defval: true, group: G_PAT,
    tooltip: 'Enable this to see high probability Bullish Englufing patterns.' + ZONE_TT },
  { id: 'enableBearishEngulfing', type: 'bool', title: 'Enable Bearish Engulfing', defval: true, group: G_PAT,
    tooltip: 'Enable this to see high probability Bearish Engulfing.' + ZONE_TT },
  { id: 'extend', type: 'bool', title: 'Extend Channel', defval: true, group: G_VIEW,
    tooltip: 'Enable to extend channel while it is active.' },
  { id: 'showBreakLabel', type: 'bool', title: 'Show Break Label', defval: true, group: G_VIEW,
    tooltip: 'Enable to show channel break label.' },
  { id: 'historyLength', type: 'int', title: 'Channel History Length', defval: 5, min: 1, max: 100, group: G_VIEW,
    tooltip: 'Specify the number of historical channels to display on the chart.' },
  { id: 'topColor', type: 'color', title: 'Channel Colors', defval: '#337C4F', inline: 'Color', group: G_COL },
  { id: 'bottomColor', type: 'color', title: '', defval: '#A52D2D', inline: 'Color', group: G_COL },
  { id: 'lineOpacity', type: 'int', title: '', defval: 100, min: 0, max: 100, inline: 'Color', group: G_COL,
    tooltip: 'Adjust the transparency of channel lines.' },
  { id: 'centerColor', type: 'color', title: 'Center Color', defval: '#787B86', inline: 'Center Color', group: G_COL },
  { id: 'centerOpacity', type: 'int', title: '', defval: 100, min: 0, max: 100, inline: 'Center Color', group: G_COL,
    tooltip: 'Set the transparency of the center channel line.' },
  { id: 'fillOpacity', type: 'int', title: 'Channel Fill Transparency', defval: 30, min: 0, max: 100, group: G_COL,
    tooltip: 'Modify the transparency of the area between channel lines for better visual clarity.' },
  { id: 'breakUpColor', type: 'color', title: 'Break Colors', defval: '#337C4F87', inline: 'Break', group: G_COL },
  { id: 'breakDownColor', type: 'color', title: '', defval: '#A52D2D87', inline: 'Break', group: G_COL },
  { id: 'textColor', type: 'color', title: 'Break Lable Text Color', defval: '#EAEAEA', group: G_COL },
  { id: 'hColor', type: 'color', title: 'Bullish Hammer Color', defval: '#337C4F87', group: G_PATCOL },
  { id: 'ihColor', type: 'color', title: 'Bearish Inverted Hammer Color', defval: '#2D3FA587', group: G_PATCOL },
  { id: 'bullishEngulfingColor', type: 'color', title: 'Bullish Englufing Color', defval: '#337C4F87', group: G_PATCOL },
  { id: 'bearishEngulfingColor', type: 'color', title: 'Bearish Engulfing Color', defval: '#A53B2D87', group: G_PATCOL },
  { id: 'candleTextColor', type: 'color', title: 'Candle Pattern Text Color', defval: '#EAEAEA', group: G_PATCOL },
  { id: 'newChannelAlert', type: 'bool', title: 'New Channel Alert', defval: true, group: G_ALERTS },
  { id: 'breakAlert', type: 'bool', title: 'Channel Break Alert', defval: true, group: G_ALERTS },
  { id: 'hammerAlert', type: 'bool', title: 'Hammer Alert', defval: true, group: G_ALERTS },
  { id: 'ihammerAlert', type: 'bool', title: 'Inverted Hammer Alert', defval: true, group: G_ALERTS },
  { id: 'bullishEngulfingAlert', type: 'bool', title: 'Bullish Engulfing Alert', defval: true, group: G_ALERTS },
  { id: 'bearishEngulfingAlert', type: 'bool', title: 'Bearish Engulfing Alert', defval: true, group: G_ALERTS },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Channels With Patterns [ChartPrime]',
  shortTitle: 'Channels With Patterns [ChartPrime]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Pine `x != 0` (na is false) */
const ne0 = (x: number) => !isNaN(x) && Math.abs(x) > EPS;

/** The settings that a preset replaces */
interface MainSettings {
  style: 'Wick' | 'Body';
  breakStyle: boolean;
  instant: boolean;
  offset: number;
  atrLength: number;
  atrMultiplier: number;
  length: number;
  lookForward: number;
  avgLength: number;
}

/** One channel: five lines, two linefills and the label array of its side */
interface Channel {
  top: Line;
  midTop: Line;
  center: Line;
  midBottom: Line;
  bottom: Line;
  topFill: Linefill;
  bottomFill: Linefill;
  labels: Label[];
  delta: number;
}

/** The candle values read with a history offset by the engulfing methods */
interface CandleHistory {
  polarity: boolean;
  bodyTop: number;
  bodyBottom: number;
  aboveAverageBody: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ChannelsWithPatternsInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lastConfirmed = lastBarConfirmedOf(chart);
  const confirmed = (i: number) => i < n - 1 || lastConfirmed;

  const user: MainSettings = {
    style: cfg.style, breakStyle: cfg.breakStyle === 'Close', instant: cfg.instant, offset: cfg.offset * 0.125,
    atrLength: cfg.atrLength, atrMultiplier: cfg.atrMultiplier, length: cfg.pivotLength, lookForward: cfg.lookForward,
    avgLength: cfg.avgLength,
  };
  const preset = (offset: number, atrLength: number, atrMultiplier: number): MainSettings => ({
    style: 'Wick', breakStyle: false, instant: true, offset, atrLength, atrMultiplier, length: 10, lookForward: 15, avgLength: 18,
  });
  const s: MainSettings = cfg.preset === 'Stocks' ? preset(10 * 0.125, 10, 4)
    : cfg.preset === 'Forex' ? preset(14 * 0.125, 100, 5)
      : cfg.preset === 'Crypto' ? preset(8 * 0.125, 10, 4)
        : user;
  const lineTrans = 100 - cfg.lineOpacity;
  const centerTrans = 100 - cfg.centerOpacity;
  const fillTrans = 100 - cfg.fillOpacity;
  const padding = cfg.padding / 100 * 4;

  // levels()
  const wick = s.style === 'Wick';
  const topLevel = bars.map((b) => (wick ? b.high : Math.max(b.open, b.close)));
  const bottomLevel = bars.map((b) => (wick ? b.low : Math.min(b.open, b.close)));

  // ranges(): atr() = rma() with alpha 1 / (length + 1) of the true range; catr = cema(ta.tr) / 8.71875
  const atr: number[] = [];
  const catr: number[] = [];
  {
    const alpha = 1 / (s.atrLength + 1);
    let smoothed = NaN;
    let ema = NaN;
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const tr = i === 0 ? b.high - b.low
        : Math.max(Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close)), Math.abs(b.low - bars[i - 1].close));
      smoothed = alpha * tr + (1 - alpha) * (isNaN(smoothed) ? 0 : smoothed);
      atr.push(smoothed);
      const taTr = i === 0 ? NaN : tr; // ta.tr: na on the first bar
      const count = i + 1;
      ema = (1.0 - 2.0 / (count + 1.0)) * (isNaN(ema) ? 0 : ema) + 2.0 / (count + 1.0) * taTr;
      catr.push(ema / 8.71875);
    }
  }

  // averages()
  const avgH = ta.sma(Series.fromArray(bars, topLevel), s.avgLength).toArray();
  const avgL = ta.sma(Series.fromArray(bars, bottomLevel), s.avgLength).toArray();

  // pivots()
  const ph = ta.pivothigh(Series.fromArray(bars, topLevel), s.length, s.lookForward).toArray();
  const pl = ta.pivotlow(Series.fromArray(bars, bottomLevel), s.length, s.lookForward).toArray();
  const sinceHigh = callsite.barssince();
  const sinceLow = callsite.barssince();

  // candle()
  const bodyTop = bars.map((b) => Math.max(b.open, b.close));
  const bodyBottom = bars.map((b) => Math.min(b.open, b.close));
  const bodyRange = bodyTop.map((t, i) => t - bodyBottom[i]);
  const topWick = bars.map((b, i) => b.high - bodyTop[i]);
  const bottomWick = bars.map((b, i) => bodyBottom[i] - b.low);
  const avgBody = ta.ema(Series.fromArray(bars, bodyRange), 14).toArray();
  const avgTopWick = ta.ema(Series.fromArray(bars, topWick), 14).toArray();
  const avgBottomWick = ta.ema(Series.fromArray(bars, bottomWick), 14).toArray();

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });

  const topCol = String(color.new(cfg.topColor, lineTrans));
  const bottomCol = String(color.new(cfg.bottomColor, lineTrans));
  const centerCol = String(color.new(cfg.centerColor, centerTrans));
  const topFillCol = String(color.new(cfg.topColor, fillTrans));
  const bottomFillCol = String(color.new(cfg.bottomColor, fillTrans));

  // constructor(): `var labels = array.new<label>()` gives each channel its own array (measured on the reference
  // runs: deleting a channel keeps the labels of the other channels)
  const constructor = (): Channel => {
    const top = line.new(NaN, NaN, NaN, NaN, 'bar_index', undefined, topCol);
    const midTop = line.new(NaN, NaN, NaN, NaN, 'bar_index', undefined, topCol);
    const center = line.new(NaN, NaN, NaN, NaN, 'bar_index', undefined, centerCol, 'dashed');
    const midBottom = line.new(NaN, NaN, NaN, NaN, 'bar_index', undefined, bottomCol);
    const bottom = line.new(NaN, NaN, NaN, NaN, 'bar_index', undefined, bottomCol);
    const topFill = linefill.new(top, midTop, topFillCol);
    const bottomFill = linefill.new(bottom, midBottom, bottomFillCol);
    return { top, midTop, center, midBottom, bottom, topFill, bottomFill, labels: [], delta: 0 };
  };
  const linesOf = (ch: Channel) => [ch.top, ch.midTop, ch.center, ch.midBottom, ch.bottom];
  const destructor = (ch: Channel) => {
    // clear_labels()
    for (let k = ch.labels.length - 1; k >= 0; k--) {
      label.delete(ch.labels[k]);
      ch.labels.splice(k, 1);
    }
    linefill.delete(ch.topFill);
    linefill.delete(ch.bottomFill);
    for (const l of linesOf(ch)) line.delete(l);
  };
  const setExtend = (ch: Channel, condition: boolean) => {
    for (const l of linesOf(ch)) line.set_extend(l, condition ? 'right' : 'none');
  };

  const history: Channel[] = [];
  let active = false;
  let last: boolean | null = null; // var bool last = na
  let highPrice = NaN;
  let highIndex = NaN;
  let lowPrice = NaN;
  let lowIndex = NaN;
  // history of the engulfing methods (called only on active bars): the values of their last call
  let prevCall: CandleHistory | null = null;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const isConfirmed = confirmed(i);

    // pivots()
    const highFlag = !isNaN(ph[i] ?? NaN);
    const sinceHighFlag = sinceHigh(highFlag);
    if (highFlag) {
      highPrice = topLevel[i - s.lookForward];
      highIndex = i - s.lookForward;
    }
    const lowFlag = !isNaN(pl[i] ?? NaN);
    const sinceLowFlag = sinceLow(lowFlag);
    if (lowFlag) {
      lowPrice = bottomLevel[i - s.lookForward];
      lowIndex = i - s.lookForward;
    }
    // deltas()
    const upDelta = (avgL[i] - catr[i] - lowPrice) / (s.lookForward + sinceLowFlag);
    const downDelta = (avgH[i] + catr[i] - highPrice) / (s.lookForward + sinceHighFlag);

    const breakUp = s.breakStyle ? b.close : b.low;
    const breakDown = s.breakStyle ? b.close : b.high;

    /** get_points() and init_channel() */
    const initChannel = (polarity: boolean): Channel => {
      const a = atr[i] * s.atrMultiplier;
      const buffer = a / 7;
      const offset = atr[i] * 4 / 7 * s.offset;
      let topY1: number;
      let topY2: number;
      let bottomY1: number;
      let bottomY2: number;
      let start: number;
      if (polarity) {
        topY1 = lowPrice + a + buffer - offset;
        topY2 = avgL[i] - catr[i] + a + buffer - offset;
        bottomY1 = lowPrice - buffer - offset;
        bottomY2 = avgL[i] - catr[i] - buffer - offset;
        start = i - s.lookForward - sinceLowFlag;
      } else {
        topY1 = highPrice + buffer + offset;
        topY2 = avgH[i] + catr[i] + buffer + offset;
        bottomY1 = highPrice - a - buffer + offset;
        bottomY2 = avgH[i] + catr[i] - a - buffer + offset;
        start = i - s.lookForward - sinceHighFlag;
      }
      const midTopY1 = topY1 - buffer * padding;
      const midTopY2 = topY2 - buffer * padding;
      const centerY1 = (topY1 + bottomY1) / 2;
      const centerY2 = (topY2 + bottomY2) / 2;
      const midBottomY1 = bottomY1 + buffer * padding;
      const midBottomY2 = bottomY2 + buffer * padding;

      const ch = constructor();
      // set_channel()
      ch.delta = polarity ? upDelta : downDelta;
      const set = (l: Line, y1: number, y2: number) => {
        line.set_xy1(l, start, y1);
        line.set_xy2(l, i, y2);
      };
      set(ch.top, topY1, topY2);
      set(ch.midTop, midTopY1, midTopY2);
      set(ch.center, centerY1, centerY2);
      set(ch.midBottom, midBottomY1, midBottomY2);
      set(ch.bottom, bottomY1, bottomY2);
      setExtend(ch, cfg.extend);
      return ch;
    };

    /** break_condition() */
    const breakCondition = (ch: Channel, top: number, bottom: number, del: boolean): boolean => {
      const up = gt(top, line.get_y2(ch.top));
      const down = lt(bottom, line.get_y2(ch.bottom));
      const condition = up || down;
      if (del) {
        if (condition) destructor(ch);
        return condition;
      }
      if (up && cfg.showBreakLabel) {
        ch.labels.push(label.new(i, b.low, 'Break Up', 'bar_index', 'belowbar', cfg.breakUpColor, 'label_up', cfg.textColor));
      }
      if (down && cfg.showBreakLabel) {
        ch.labels.push(label.new(i, b.high, 'Break Down', 'bar_index', 'abovebar', cfg.breakDownColor, 'label_down', cfg.textColor));
      }
      return condition;
    };

    /** history.extend(): the last channel of the history stops extending */
    const extendHistory = () => {
      if (history.length > 0) setExtend(history[history.length - 1], false);
    };

    // predictive_channels()
    const notActive = !active && isConfirmed;
    const goingUp = lt(lowPrice, b.low);
    const goingDown = gt(highPrice, b.high);
    const instantUp = lowIndex > highIndex && last !== true && s.instant; // not na is true
    const instantDown = lowIndex < highIndex && last === true && s.instant;

    if ((lowFlag || instantUp) && notActive && goingUp) {
      active = true;
      const ch = initChannel(true);
      if (breakCondition(ch, b.high, b.low, true)) {
        active = false;
      } else {
        last = true;
        extendHistory();
        history.push(ch);
      }
    }
    if ((highFlag || instantDown) && notActive && goingDown) {
      active = true;
      const ch = initChannel(false);
      if (breakCondition(ch, b.high, b.low, true)) {
        destructor(ch);
        active = false;
      } else {
        last = false;
        extendHistory();
        history.push(ch);
      }
    }

    if (active) {
      const ch = history[history.length - 1];
      // update_channel()
      for (const l of linesOf(ch)) line.set_xy2(l, i, line.get_y2(l) + ch.delta);

      // candle_patterns()
      const hl2 = (b.high + b.low) / 2;
      const polarity = lt(b.open, b.close);
      const aboveAvgBody = gt(bodyRange[i], avgBody[i]);
      const aboveAvgTopWick = gt(topWick[i], avgTopWick[i]);
      const aboveAvgBottomWick = gt(bottomWick[i], avgBottomWick[i]);
      const hammer = ge(bodyTop[i], hl2) && !ne0(topWick[i]) && ge(bottomWick[i] / bodyRange[i], 2) && !aboveAvgBody
        && aboveAvgBottomWick && cfg.enableHammer && isConfirmed;
      const ihammer = le(bodyTop[i], hl2) && !ne0(bottomWick[i]) && ge(topWick[i] / bodyRange[i], 2) && !aboveAvgBody
        && aboveAvgTopWick && cfg.enableIhammer && isConfirmed;
      const p = prevCall;
      const bullishEngulfing = polarity && p !== null && !p.polarity && gt(bodyTop[i], p.bodyTop)
        && le(bodyBottom[i], p.bodyBottom) && aboveAvgBody && !p.aboveAverageBody && !aboveAvgBottomWick
        && cfg.enableBullishEngulfing;
      const bearishEngulfing = !polarity && p !== null && p.polarity && ge(bodyTop[i], p.bodyTop)
        && lt(bodyBottom[i], p.bodyBottom) && aboveAvgBody && !p.aboveAverageBody && !aboveAvgTopWick
        && cfg.enableBearishEngulfing;
      prevCall = { polarity, bodyTop: bodyTop[i], bodyBottom: bodyBottom[i], aboveAverageBody: aboveAvgBody };

      const top = line.get_y2(ch.top);
      const midTop = line.get_y2(ch.midTop);
      const center = line.get_y2(ch.center);
      const midBottom = line.get_y2(ch.midBottom);
      const bottom = line.get_y2(ch.bottom);
      const highCondition = ge(b.high, midTop) && ge(b.low, center) && le(hl2, top);
      const lowCondition = le(b.low, midBottom) && le(b.high, center) && ge(hl2, bottom);
      if (highCondition) {
        if (ihammer) {
          ch.labels.push(label.new(i, b.high, 'iH', 'bar_index', 'abovebar', cfg.ihColor, 'label_down', cfg.candleTextColor,
            undefined, undefined, 'Inverted Hammer'));
        }
        if (bearishEngulfing) {
          ch.labels.push(label.new(i, b.high, 'EG', 'bar_index', 'abovebar', cfg.bearishEngulfingColor, 'label_down',
            cfg.candleTextColor, undefined, undefined, 'Bearish Engulfing'));
        }
      }
      if (lowCondition) {
        if (hammer) {
          ch.labels.push(label.new(i, b.low, 'H', 'bar_index', 'belowbar', cfg.hColor, 'label_up', cfg.candleTextColor,
            undefined, undefined, 'Hammer'));
        }
        if (bullishEngulfing) {
          ch.labels.push(label.new(i, b.high, 'EG', 'bar_index', 'belowbar', cfg.bullishEngulfingColor, 'label_up',
            cfg.candleTextColor, undefined, undefined, 'Bullish Engulfing'));
        }
      }

      if (breakCondition(ch, breakUp, breakDown, false) && isConfirmed) active = false;
    }

    // safe_destructor()
    if (history.length > cfg.historyLength) {
      destructor(history[0]);
      history.shift();
    }
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const ChannelsWithPatterns = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
