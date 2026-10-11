/**
 * Liquidity Levels MTF - Sonarlab
 *
 * Liquidity levels are the pivot highs and pivot lows of the chart ("Left Bars" before, "Right Bars" after). One bar
 * after a pivot is confirmed, a level starts on the pivot bar at its high (or low), as a line or as a box from the
 * wick to the candle body.
 * - A level is mitigated when the previous close ("Close") or the high / low of the bar ("Wick") goes through it.
 *   A mitigated level stops: with "Show" a paler copy stays from the pivot bar to the bar of the mitigation, with
 *   "Remove" it disappears.
 * - On each side the script keeps at most "Display Limit" / 2 open levels (2 with the default 5): after each bar the
 *   oldest one is removed while there are more.
 * - Open levels end one bar before the confirmation bar ("Short"), follow the current bar 20 bars ahead ("Current")
 *   or are extended to the right ("Max").
 * - "Higher Timeframe" adds the levels of another timeframe of the same symbol: the pivots are searched on the chart
 *   bars in the high / low of that timeframe (without lookahead), with "Left Bars" x m bars before and
 *   "Right Bars" + m bars after, m = timeframe / chart timeframe. As in the original, their mitigated copies use the
 *   colours of the chart timeframe levels.
 * - At most 50 lines and 50 boxes are kept (the oldest are removed).
 *
 * Times: the levels are placed by time. The end of a level that follows the current bar is the bar time plus 20
 * times the gap between the two bars before.
 *
 * Other timeframe: the bars of that timeframe are built from the chart bars (periods from the UTC calendar and the
 * bars, see src/anchor-period.ts). A timeframe below the chart timeframe needs data that the bars do not carry: the
 * port throws an Error.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * The four alert inputs and their texts only drive alerts, which the port does not have.
 *
 * Reference: "Liquidity Levels - Sonarlab" by vuetratrading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Sonarlab
 */

import { ta, Series, color, timeframe, barInterval, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import type { BoxData, LineDrawingData } from '../types';

type StyleName = 'Solid' | 'Dashed' | 'Dotted';

export interface LiquidityLevelsMtfSonarlabInputs {
  currentTF: boolean;
  htfBool: boolean;
  /** Higher timeframe ('' = chart timeframe) */
  htfTF: string;
  leftBars: number;
  rightBars: number;
  removeMitigated: boolean;
  mitiOptions: 'Remove' | 'Show';
  candleType: 'Close' | 'Wick';
  displayStyle: 'Lines' | 'Boxes';
  extentionOptions: 'Short' | 'Current' | 'Max';
  displayLimit: number;
  highLineStyle: StyleName;
  lowLineStyle: StyleName;
  lineWidth: number;
  highLineColor: string;
  lowLineColor: string;
  highBoxBgColor: string;
  highBoxBorderColor: string;
  lowBoxBgColor: string;
  lowBoxBorderColor: string;
  highLineStyleHTF: StyleName;
  lowLineStyleHTF: StyleName;
  lineWidthHTF: number;
  highLineColorHTF: string;
  lowLineColorHTF: string;
  highBoxBgColorHTF: string;
  highBoxBorderColorHTF: string;
  lowBoxBgColorHTF: string;
  lowBoxBorderColorHTF: string;
  alertNewHigh: boolean;
  alertNewHighTxt: string;
  alertNewLow: boolean;
  alertNewLowTxt: string;
  alertNewHighHTF: boolean;
  alertNewHighHTFTxt: string;
  alertNewLowHTF: boolean;
  alertNewLowHTFTxt: string;
}

export const defaultInputs: LiquidityLevelsMtfSonarlabInputs = {
  currentTF: true,
  htfBool: false,
  htfTF: '',
  leftBars: 15,
  rightBars: 5,
  removeMitigated: true,
  mitiOptions: 'Show',
  candleType: 'Close',
  displayStyle: 'Lines',
  extentionOptions: 'Current',
  displayLimit: 5,
  highLineStyle: 'Solid',
  lowLineStyle: 'Solid',
  lineWidth: 1,
  highLineColor: '#1f4ef5',
  lowLineColor: '#fd441c',
  highBoxBgColor: 'rgba(31, 78, 245, 0.2)',
  highBoxBorderColor: 'rgba(31, 78, 245, 0.2)',
  lowBoxBgColor: 'rgba(253, 68, 28, 0.2)',
  lowBoxBorderColor: 'rgba(253, 68, 28, 0.2)',
  highLineStyleHTF: 'Solid',
  lowLineStyleHTF: 'Solid',
  lineWidthHTF: 1,
  highLineColorHTF: '#4c9650',
  lowLineColorHTF: '#fd1c49',
  highBoxBgColorHTF: 'rgba(76, 150, 80, 0.2)',
  highBoxBorderColorHTF: 'rgba(76, 150, 80, 0.2)',
  lowBoxBgColorHTF: 'rgba(253, 28, 73, 0.2)',
  lowBoxBorderColorHTF: 'rgba(253, 28, 73, 0.2)',
  alertNewHigh: true,
  alertNewHighTxt: 'Break out!',
  alertNewLow: true,
  alertNewLowTxt: 'Break down!',
  alertNewHighHTF: true,
  alertNewHighHTFTxt: 'Break out!',
  alertNewLowHTF: true,
  alertNewLowHTFTxt: 'Break down!',
};

const TF_GROUP = 'TimeFrame Settings';
const LEVELS_GROUP = 'Liquidity Levels';
const REMOVE_GROUP = 'Mitigation Settings';
const DISPLAY_GROUP = 'Display Styles';
const STYLE_GROUP = 'Line Styles and Colors';
const STYLE_GROUP_HTF = 'Line Styles and Colors - Higher TimeFrame';
const STYLES = ['Solid', 'Dashed', 'Dotted'];

export const inputConfig: InputConfig[] = [
  { id: 'currentTF', type: 'bool', title: 'Liquidity Levels', defval: true, group: TF_GROUP },
  { id: 'htfBool', type: 'bool', title: 'Higher Timeframe', defval: false, inline: '1', group: TF_GROUP },
  {
    id: 'htfTF', type: 'timeframe', title: '', defval: '', inline: '1', group: TF_GROUP,
    tooltip: 'Display Liquidity Levels for a Higher Timeframe',
  },
  {
    id: 'leftBars', type: 'int', title: 'Left Bars', defval: 15, group: LEVELS_GROUP,
    tooltip: 'Set the lookback point for what determines a Liquidity Level',
  },
  {
    id: 'rightBars', type: 'int', title: 'Right Bars', defval: 5, group: LEVELS_GROUP,
    tooltip: 'Set the number of bars to confirm a Liquidity Level',
  },
  { id: 'removeMitigated', type: 'bool', title: 'Mitigated', defval: true, inline: '1', group: REMOVE_GROUP },
  {
    id: 'mitiOptions', type: 'string', title: '    ', defval: 'Show', options: ['Remove', 'Show'], inline: '1',
    group: REMOVE_GROUP,
    tooltip: 'Show: Liquidity Levels will stop printing when mitigated and remain on the chart.\nRemove: Liquidity Levels will be removed from the chart when mitigated.',
  },
  {
    id: 'candleType', type: 'string', title: 'Candle type', defval: 'Close', options: ['Close', 'Wick'], group: REMOVE_GROUP,
    tooltip: 'Choose whether a candle close or a candles high/low is needed to determine a mitigated Liquidity Level',
  },
  {
    id: 'displayStyle', type: 'string', title: 'Display Style', defval: 'Lines', options: ['Lines', 'Boxes'], group: DISPLAY_GROUP,
    tooltip: 'Choose how Liquidity Levels are displayed on the chart',
  },
  {
    id: 'extentionOptions', type: 'string', title: 'Extention Options', defval: 'Current', options: ['Short', 'Current', 'Max'],
    group: DISPLAY_GROUP, tooltip: 'Choose how Liquidity Levels are extended on the chart',
  },
  { id: 'displayLimit', type: 'int', title: 'Display Limit', defval: 5, group: DISPLAY_GROUP },
  { id: 'highLineStyle', type: 'string', title: 'High Line Style', defval: 'Solid', options: STYLES, group: STYLE_GROUP },
  { id: 'lowLineStyle', type: 'string', title: 'Low Line Style', defval: 'Solid', options: STYLES, group: STYLE_GROUP },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 1, group: STYLE_GROUP },
  { id: 'highLineColor', type: 'color', title: 'High Line   ', defval: '#1f4ef5', group: STYLE_GROUP, inline: '1' },
  { id: 'lowLineColor', type: 'color', title: 'Low Line', defval: '#fd441c', group: STYLE_GROUP, inline: '1' },
  { id: 'highBoxBgColor', type: 'color', title: 'High Box Bg ', defval: 'rgba(31, 78, 245, 0.2)', group: STYLE_GROUP, inline: '2' },
  { id: 'highBoxBorderColor', type: 'color', title: 'Box Border', defval: 'rgba(31, 78, 245, 0.2)', group: STYLE_GROUP, inline: '2' },
  { id: 'lowBoxBgColor', type: 'color', title: 'Low Box Bg  ', defval: 'rgba(253, 68, 28, 0.2)', group: STYLE_GROUP, inline: '3' },
  { id: 'lowBoxBorderColor', type: 'color', title: 'Box Border', defval: 'rgba(253, 68, 28, 0.2)', group: STYLE_GROUP, inline: '3' },
  { id: 'highLineStyleHTF', type: 'string', title: 'High Line HTF', defval: 'Solid', options: STYLES, group: STYLE_GROUP_HTF },
  { id: 'lowLineStyleHTF', type: 'string', title: 'Low Line HTF', defval: 'Solid', options: STYLES, group: STYLE_GROUP_HTF },
  { id: 'lineWidthHTF', type: 'int', title: 'Line Width HTF', defval: 1, group: STYLE_GROUP_HTF },
  { id: 'highLineColorHTF', type: 'color', title: 'High Line   ', defval: '#4c9650', group: STYLE_GROUP_HTF, inline: '1' },
  { id: 'lowLineColorHTF', type: 'color', title: 'Low Line', defval: '#fd1c49', group: STYLE_GROUP_HTF, inline: '1' },
  { id: 'highBoxBgColorHTF', type: 'color', title: 'High Box Bg ', defval: 'rgba(76, 150, 80, 0.2)', group: STYLE_GROUP_HTF, inline: '2' },
  { id: 'highBoxBorderColorHTF', type: 'color', title: 'Box Border', defval: 'rgba(76, 150, 80, 0.2)', group: STYLE_GROUP_HTF, inline: '2' },
  { id: 'lowBoxBgColorHTF', type: 'color', title: 'Low Box Bg  ', defval: 'rgba(253, 28, 73, 0.2)', group: STYLE_GROUP_HTF, inline: '3' },
  { id: 'lowBoxBorderColorHTF', type: 'color', title: 'Box Border', defval: 'rgba(253, 28, 73, 0.2)', group: STYLE_GROUP_HTF, inline: '3' },
  { id: 'alertNewHigh', type: 'bool', title: 'New High', defval: true, inline: '1', group: 'Alerts' },
  { id: 'alertNewHighTxt', type: 'string', title: '', defval: 'Break out!', inline: '1', group: 'Alerts' },
  { id: 'alertNewLow', type: 'bool', title: 'New Low', defval: true, inline: '2', group: 'Alerts' },
  { id: 'alertNewLowTxt', type: 'string', title: '', defval: 'Break down!', inline: '2', group: 'Alerts' },
  { id: 'alertNewHighHTF', type: 'bool', title: 'New HTF High', defval: true, inline: '3', group: 'Alerts' },
  { id: 'alertNewHighHTFTxt', type: 'string', title: '', defval: 'Break out!', inline: '3', group: 'Alerts' },
  { id: 'alertNewLowHTF', type: 'bool', title: 'New HTF Low', defval: true, inline: '4', group: 'Alerts' },
  { id: 'alertNewLowHTFTxt', type: 'string', title: '', defval: 'Break down!', inline: '4', group: 'Alerts' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Liquidity Levels - Sonarlab',
  shortTitle: 'Liquidity Levels - Sonarlab',
  overlay: true,
};

/** Default max_lines_count / max_boxes_count */
const MAX_COUNT = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

type Dash = 'solid' | 'dashed' | 'dotted';
const dash = (name: StyleName): Dash => (name === 'Solid' ? 'solid' : name === 'Dashed' ? 'dashed' : 'dotted');

/** A line or a box, with times as x (xloc.bar_time). y2 is only used by boxes (the bottom). */
interface Obj {
  x1: number; y1: number; x2: number; y2: number;
  color: string; border: string; style: Dash; width: number; extend: boolean; dead: boolean;
}

/** Live drawings of one kind: above max + 5 objects the oldest are deleted until max remain */
class Live {
  list: Obj[] = [];
  add(o: Obj): Obj {
    this.list.push(o);
    if (this.list.length > MAX_COUNT + 5) for (const old of this.list.splice(0, this.list.length - MAX_COUNT)) old.dead = true;
    return o;
  }
  delete(o: Obj): void {
    if (o.dead) return;
    o.dead = true;
    this.list.splice(this.list.indexOf(o), 1);
  }
}

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars (time = the start of the period), and for each chart bar the index of the latest completed bar of that
 * timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`Liquidity Levels: the timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods and the bars that
  // complete them come from the library rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, latest: exchange.latest };
  const n = bars.length;
  const starts = periodStarts(bars, tf);
  const htf: Bar[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
    } else {
      const last = htf[htf.length - 1];
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume = (last.volume ?? NaN) + (b.volume ?? NaN);
    }
    group.push(htf.length - 1);
  });

  // A bar completes its period when its close reaches the end of the period. Symbols that trade every day follow
  // the UTC calendar: the period of the close time is another period. Other symbols: the last bar of a period.
  const ms = n > 0 && bars[0].time >= 1e12;
  const weekend = (t: number) => {
    const wd = new Date(ms ? t : t * 1000).getUTCDay();
    return wd === 0 || wd === 6;
  };
  const interval = barInterval(bars);
  const closes = bars.map((b) => ({ time: b.time + interval }));
  const calendar = bars.some((b) => weekend(b.time)) && closes.some((b) => weekend(b.time));
  const closeStarts = calendar ? periodStarts(closes, tf) : [];
  // The last bar of a symbol that does not trade every day: its period is complete when the next possible bar is in
  // another period. The next bar is on the same day while the bar is earlier in the day than the last bar of the
  // trading day before; else it is on the next weekday.
  let lastEnds = true;
  if (!calendar && n > 1) {
    const DAY = 86400000;
    const toMs = (t: number) => (ms ? t : t * 1000);
    const lastMs = toMs(bars[n - 1].time);
    const day = Math.floor(lastMs / DAY) * DAY;
    let next = lastMs + toMs(interval);
    let sessionOver = true;
    if (toMs(interval) < DAY) {
      let j = n - 2;
      while (j >= 0 && toMs(bars[j].time) >= day) j--;
      sessionOver = j < 0 || lastMs - day >= toMs(bars[j].time) % DAY;
    }
    if (sessionOver) {
      next = day + DAY;
      while (weekend(ms ? next : next / 1000)) next += DAY;
    }
    const withNext = periodStarts([...bars, { time: ms ? next : next / 1000 }], tf);
    lastEnds = withNext[n] !== withNext[n - 1];
  }
  const latest: number[] = [];
  for (let i = 0; i < n; i++) {
    let done = i === 0 ? -1 : latest[i - 1];
    if (i > 0 && group[i] !== group[i - 1]) done = Math.max(done, group[i] - 1);
    const ends = i === n - 1 ? lastEnds : starts[i + 1] !== starts[i];
    const reaches = !calendar || closeStarts[i] !== starts[i];
    if (ends && reaches) done = Math.max(done, group[i]);
    latest.push(done);
  }
  return { htf, latest };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityLevelsMtfSonarlabInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines'> & { lines: LineDrawingData[]; boxes: BoxData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const leftBars = Math.trunc(cfg.leftBars);
  const rightBars = Math.trunc(cfg.rightBars);
  const asLines = cfg.displayStyle === 'Lines';
  const extentionMax = cfg.extentionOptions === 'Max';
  const extentionCurrent = cfg.extentionOptions === 'Current';
  const byClose = cfg.candleType === 'Close';
  const show = cfg.mitiOptions === 'Show';
  // displayLimit / 2 is a float division (2.5 with the default 5)
  const limit = cfg.displayLimit / 2;
  const highStyle = dash(cfg.highLineStyle);
  const lowStyle = dash(cfg.lowLineStyle);

  const lines = new Live();
  const boxes = new Live();

  // Chart timeframe pivots, read one bar later
  const pivotHigh = A(ta.pivothigh(new Series(bars, (b) => b.high), leftBars, rightBars));
  const pivotLow = A(ta.pivotlow(new Series(bars, (b) => b.low), leftBars, rightBars));

  // Higher timeframe: [time, open, high, low, close] of the latest completed bar of the timeframe, on each chart bar
  let sec: Array<Bar | null> = [];
  let pivotHighHTF: number[] = [];
  let pivotLowHTF: number[] = [];
  let dis = 0;
  if (cfg.htfBool) {
    const { htf, latest } = timeframeBars(bars, cfg.htfTF, chart);
    sec = latest.map((k) => (k >= 0 ? htf[k] : null));
    // tf_multi(): seconds of the timeframe / seconds of the chart timeframe
    const chartTf = chartTimeframe(bars, chart);
    const multi = cfg.htfTF.trim() === '' || chartTf === '' ? 1 : timeframe.in_seconds(cfg.htfTF) / timeframe.in_seconds(chartTf);
    dis = Math.trunc(rightBars + multi);
    const left = Math.trunc(leftBars * multi);
    pivotHighHTF = A(ta.pivothigh(Series.fromArray(bars, sec.map((b) => (b ? b.high : NaN))), left, dis));
    pivotLowHTF = A(ta.pivotlow(Series.fromArray(bars, sec.map((b) => (b ? b.low : NaN))), left, dis));
  }

  const T = (i: number) => (i >= 0 ? bars[i].time : NaN);

  /** One side of one timeframe: the open levels (lines and boxes) */
  const makeSide = (isHigh: boolean) => ({ isHigh, lineArray: [] as Obj[], boxArray: [] as Obj[] });
  const high = makeSide(true);
  const low = makeSide(false);
  const highHTF = makeSide(true);
  const lowHTF = makeSide(false);

  // remove_mitigated_lines() / remove_mitigated_boxes(): the mitigated copies use the chart timeframe colours
  const removeMitigated = (i: number, arr: Obj[], isHigh: boolean, live: Live, isBox: boolean) => {
    if (arr.length > 0 && cfg.removeMitigated) {
      const b = bars[i];
      const prevClose = i > 0 ? bars[i - 1].close : NaN;
      const hh = byClose ? prevClose : b.high;
      const ll = byClose ? prevClose : b.low;
      for (let k = arr.length - 1; k >= 0; k--) {
        const l = arr[k];
        // a deleted object returns na: no comparison is true
        const level = l.dead ? NaN : l.y1;
        if (isHigh ? gt(hh, level) : lt(ll, level)) {
          arr.splice(k, 1);
          if (show) {
            if (isBox) {
              live.add({
                x1: l.x1, y1: l.y1, x2: b.time, y2: l.y2,
                color: String(color.new(isHigh ? cfg.highBoxBgColor : cfg.lowBoxBgColor, 90)),
                border: String(color.new(isHigh ? cfg.highBoxBorderColor : cfg.lowBoxBorderColor, 90)),
                style: isHigh ? highStyle : lowStyle, width: 1, extend: false, dead: false,
              });
            } else {
              live.add({
                x1: l.x1, y1: l.y1, x2: b.time, y2: l.y1,
                color: String(color.new(isHigh ? cfg.highLineColor : cfg.lowLineColor, 70)), border: '',
                style: 'solid', width: 1, extend: false, dead: false,
              });
            }
          }
          live.delete(l);
        }
      }
    }
    // display_limit_line() / display_limit_box()
    if (arr.length > limit) live.delete(arr.shift() as Obj);
  };

  // extend_line_to_current() / extend_box_to_current()
  const extend = (i: number, arr: Obj[]) => {
    if (arr.length === 0) return;
    const timeExt = T(i) + (T(i - 1) - T(i - 2)) * 20;
    for (const o of arr) if (!o.dead) o.x2 = timeExt;
  };

  for (let i = 0; i < n; i++) {
    // Chart timeframe levels
    if (cfg.currentTF && i >= rightBars + 1) {
      const p = bars[i - rightBars - 1];
      if (truthy(i > 0 ? pivotHigh[i - 1] : NaN)) {
        if (asLines) {
          high.lineArray.push(lines.add({
            x1: p.time, y1: p.high, x2: T(i - 1), y2: p.high, color: cfg.highLineColor, border: '',
            style: highStyle, width: cfg.lineWidth, extend: extentionMax, dead: false,
          }));
        } else {
          high.boxArray.push(boxes.add({
            x1: p.time, y1: p.high, x2: T(i - 1), y2: Math.max(p.open, p.close), color: cfg.highBoxBgColor,
            border: cfg.highBoxBorderColor, style: highStyle, width: cfg.lineWidth, extend: extentionMax, dead: false,
          }));
        }
      }
      if (truthy(i > 0 ? pivotLow[i - 1] : NaN)) {
        if (asLines) {
          low.lineArray.push(lines.add({
            x1: p.time, y1: p.low, x2: T(i - 1), y2: p.low, color: cfg.lowLineColor, border: '',
            style: lowStyle, width: cfg.lineWidth, extend: extentionMax, dead: false,
          }));
        } else {
          low.boxArray.push(boxes.add({
            x1: p.time, y1: p.low, x2: T(i - 1), y2: Math.min(p.open, p.close), color: cfg.lowBoxBgColor,
            border: cfg.lowBoxBorderColor, style: lowStyle, width: cfg.lineWidth, extend: extentionMax, dead: false,
          }));
        }
      }
    }

    removeMitigated(i, high.lineArray, true, lines, false);
    removeMitigated(i, low.lineArray, false, lines, false);
    removeMitigated(i, high.boxArray, true, boxes, true);
    removeMitigated(i, low.boxArray, false, boxes, true);

    if (extentionCurrent) {
      extend(i, high.lineArray);
      extend(i, low.lineArray);
      extend(i, high.boxArray);
      extend(i, low.boxArray);
    }

    // Higher timeframe levels
    if (cfg.htfBool) {
      const p = i >= dis ? sec[i - dis] : null;
      const prev = i >= 1 ? sec[i - 1] : null;
      const time1 = p ? p.time : NaN;
      const time2 = prev ? prev.time : NaN;
      if (truthy(pivotHighHTF[i])) {
        const level = p ? p.high : NaN;
        if (asLines) {
          highHTF.lineArray.push(lines.add({
            x1: time1, y1: level, x2: time2, y2: level, color: cfg.highLineColorHTF, border: '',
            style: dash(cfg.highLineStyleHTF), width: cfg.lineWidthHTF, extend: extentionMax, dead: false,
          }));
        } else {
          highHTF.boxArray.push(boxes.add({
            x1: time1, y1: level, x2: time2, y2: p ? Math.max(p.open, p.close) : NaN, color: cfg.highBoxBgColorHTF,
            border: cfg.highBoxBorderColorHTF, style: dash(cfg.highLineStyleHTF), width: cfg.lineWidthHTF,
            extend: extentionMax, dead: false,
          }));
        }
      }
      if (truthy(pivotLowHTF[i])) {
        const level = p ? p.low : NaN;
        if (asLines) {
          lowHTF.lineArray.push(lines.add({
            x1: time1, y1: level, x2: time2, y2: level, color: cfg.lowLineColorHTF, border: '',
            style: dash(cfg.lowLineStyleHTF), width: cfg.lineWidthHTF, extend: extentionMax, dead: false,
          }));
        } else {
          lowHTF.boxArray.push(boxes.add({
            x1: time1, y1: level, x2: time2, y2: p ? Math.min(p.open, p.close) : NaN, color: cfg.lowBoxBgColorHTF,
            border: cfg.lowBoxBorderColorHTF, style: dash(cfg.lowLineStyleHTF), width: cfg.lineWidthHTF,
            extend: extentionMax, dead: false,
          }));
        }
      }
    }

    removeMitigated(i, highHTF.lineArray, true, lines, false);
    removeMitigated(i, lowHTF.lineArray, false, lines, false);
    removeMitigated(i, highHTF.boxArray, true, boxes, true);
    removeMitigated(i, lowHTF.boxArray, false, boxes, true);

    if (extentionCurrent) {
      extend(i, highHTF.lineArray);
      extend(i, lowHTF.lineArray);
      extend(i, highHTF.boxArray);
      extend(i, lowHTF.boxArray);
    }
  }

  // an object with an na coordinate is not drawn
  const drawn = (o: Obj) => ![o.x1, o.y1, o.x2, o.y2].some((v) => isNaN(v));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: lines.list.filter(drawn).map((l) => ({
      time1: l.x1, price1: l.y1, time2: l.x2, price2: l.y2, color: l.color, width: l.width,
      ...(l.style !== 'solid' ? { style: l.style } : {}),
      ...(l.extend ? { extend: 'right' as const } : {}),
    })),
    boxes: boxes.list.filter(drawn).map((b) => ({
      time1: b.x1, price1: b.y1, time2: b.x2, price2: b.y2, bgColor: b.color, borderColor: b.border, borderWidth: b.width,
      ...(b.style !== 'solid' ? { borderStyle: b.style } : {}),
      ...(b.extend ? { extend: 'right' as const } : {}),
    })),
  };
}

export const LiquidityLevelsMtfSonarlab = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
