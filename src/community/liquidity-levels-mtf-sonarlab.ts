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
 * - At most 50 lines and 50 boxes are kept (the oldest are removed; drawing registry of the library).
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
 * Alerts (alertcondition, `alerts` of the result): 'New High' / 'New Low' on the bars where a level of the chart
 * timeframe is mitigated, 'New HTF High' / 'New HTF Low' for the levels of the higher timeframe. The alert inputs
 * drive the alert() calls (`alertCalls` of the result, once per bar): their text on the same bars when the input is
 * on.
 *
 * Reference: "Liquidity Levels - Sonarlab" by vuetratrading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Sonarlab
 */

import {
  ta, Series, color, timeframe, line, box, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type Box,
} from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import type { AlertCall, BoxData, LineDrawingData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type StyleName = 'Solid' | 'Dashed' | 'Dotted';

/** The original makes alert() calls */
export const hasAlertFunction = true;

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
  // The periods and the bars that complete them: the exchange calendar of the chart context (time zone and
  // session), else the UTC calendar rule; grouped and completed by the library (see anchor-period.ts)
  return higherTimeframeBars(bars, tf, context);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityLevelsMtfSonarlabInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines'> & { lines: LineDrawingData[]; boxes: BoxData[]; alertCalls: AlertCall[] }
  & { alerts: AlertConditionState[] } {
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

  // Lines and boxes: library objects in the drawing registry (above max + 5 objects the oldest are deleted until max
  // remain; a deleted object reads na). x values are bar times (xloc.bar_time, in the unit of the bar times).
  resetDrawings({ line: MAX_COUNT, box: MAX_COUNT });
  const extend = extentionMax ? 'right' : 'none';

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
  const makeSide = (isHigh: boolean) => ({ isHigh, lineArray: [] as Line[], boxArray: [] as Box[] });
  const high = makeSide(true);
  const low = makeSide(false);
  const highHTF = makeSide(true);
  const lowHTF = makeSide(false);

  // remove_mitigated_lines() / remove_mitigated_boxes(): the mitigated copies use the chart timeframe colours
  const removeMitigatedLines = (i: number, arr: Line[], isHigh: boolean): boolean => {
    let m = false;
    if (arr.length > 0 && cfg.removeMitigated) {
      const b = bars[i];
      const prevClose = i > 0 ? bars[i - 1].close : NaN;
      const hh = byClose ? prevClose : b.high;
      const ll = byClose ? prevClose : b.low;
      for (let k = arr.length - 1; k >= 0; k--) {
        const l = arr[k];
        // a deleted line reads na: no comparison is true
        const level = line.get_y1(l);
        if (isHigh ? gt(hh, level) : lt(ll, level)) {
          arr.splice(k, 1);
          if (show) {
            line.new(line.get_x1(l), level, b.time, level, 'bar_time', 'none', String(color.new(isHigh ? cfg.highLineColor : cfg.lowLineColor, 70)));
          }
          line.delete(l);
          m = true;
        }
      }
    }
    // display_limit_line()
    if (arr.length > limit) line.delete(arr.shift() as Line);
    return m;
  };
  const removeMitigatedBoxes = (i: number, arr: Box[], isHigh: boolean): boolean => {
    let m = false;
    if (arr.length > 0 && cfg.removeMitigated) {
      const b = bars[i];
      const prevClose = i > 0 ? bars[i - 1].close : NaN;
      const hh = byClose ? prevClose : b.high;
      const ll = byClose ? prevClose : b.low;
      for (let k = arr.length - 1; k >= 0; k--) {
        const l = arr[k];
        // the low boxes also compare with the top (the low), as the original
        const level = box.get_top(l);
        if (isHigh ? gt(hh, level) : lt(ll, level)) {
          arr.splice(k, 1);
          if (show) {
            box.new(
              box.get_left(l), level, b.time, box.get_bottom(l),
              String(color.new(isHigh ? cfg.highBoxBorderColor : cfg.lowBoxBorderColor, 90)), 1, isHigh ? highStyle : lowStyle, 'none',
              'bar_time', String(color.new(isHigh ? cfg.highBoxBgColor : cfg.lowBoxBgColor, 90)),
            );
          }
          box.delete(l);
          m = true;
        }
      }
    }
    // display_limit_box()
    if (arr.length > limit) box.delete(arr.shift() as Box);
    return m;
  };

  // extend_line_to_current() / extend_box_to_current() (the setters of a deleted object do nothing)
  const extendLines = (i: number, arr: Line[]) => {
    if (arr.length === 0) return;
    const timeExt = T(i) + (T(i - 1) - T(i - 2)) * 20;
    for (const o of arr) line.set_x2(o, timeExt);
  };
  const extendBoxes = (i: number, arr: Box[]) => {
    if (arr.length === 0) return;
    const timeExt = T(i) + (T(i - 1) - T(i - 2)) * 20;
    for (const o of arr) box.set_right(o, timeExt);
  };

  const flags: boolean[][] = [[], [], [], []];
  const alertCalls: AlertCall[] = [];
  try {
    for (let i = 0; i < n; i++) {
      setDrawingBar(i, i === n - 1);
      // Chart timeframe levels
      if (cfg.currentTF && i >= rightBars + 1) {
        const p = bars[i - rightBars - 1];
        if (truthy(i > 0 ? pivotHigh[i - 1] : NaN)) {
          if (asLines) {
            high.lineArray.push(line.new(p.time, p.high, T(i - 1), p.high, 'bar_time', extend, cfg.highLineColor, highStyle, cfg.lineWidth));
          } else {
            high.boxArray.push(box.new(
              p.time, p.high, T(i - 1), Math.max(p.open, p.close), cfg.highBoxBorderColor, cfg.lineWidth, highStyle, extend, 'bar_time',
              cfg.highBoxBgColor,
            ));
          }
        }
        if (truthy(i > 0 ? pivotLow[i - 1] : NaN)) {
          if (asLines) {
            low.lineArray.push(line.new(p.time, p.low, T(i - 1), p.low, 'bar_time', extend, cfg.lowLineColor, lowStyle, cfg.lineWidth));
          } else {
            low.boxArray.push(box.new(
              p.time, p.low, T(i - 1), Math.min(p.open, p.close), cfg.lowBoxBorderColor, cfg.lineWidth, lowStyle, extend, 'bar_time',
              cfg.lowBoxBgColor,
            ));
          }
        }
      }

      const highLineAlert = removeMitigatedLines(i, high.lineArray, true);
      const lowLineAlert = removeMitigatedLines(i, low.lineArray, false);
      const highBoxAlert = removeMitigatedBoxes(i, high.boxArray, true);
      const lowBoxAlert = removeMitigatedBoxes(i, low.boxArray, false);

      if (extentionCurrent) {
        extendLines(i, high.lineArray);
        extendLines(i, low.lineArray);
        extendBoxes(i, high.boxArray);
        extendBoxes(i, low.boxArray);
      }

      // alertcondition(highLineAlert or highBoxAlert, "New High") / (lowLineAlert or lowBoxAlert, "New Low"), and
      // if (...) and alertNewHigh: alert(alertNewHighTxt, alert.freq_once_per_bar) (same for the low)
      const newHigh = highLineAlert || highBoxAlert;
      const newLow = lowLineAlert || lowBoxAlert;
      flags[0].push(newHigh);
      flags[1].push(newLow);
      if (newHigh && cfg.alertNewHigh) alertCalls.push({ time: bars[i].time, message: cfg.alertNewHighTxt, freq: 'once_per_bar' });
      if (newLow && cfg.alertNewLow) alertCalls.push({ time: bars[i].time, message: cfg.alertNewLowTxt, freq: 'once_per_bar' });

      // Higher timeframe levels
      if (cfg.htfBool) {
        const p = i >= dis ? sec[i - dis] : null;
        const prev = i >= 1 ? sec[i - 1] : null;
        const time1 = p ? p.time : NaN;
        const time2 = prev ? prev.time : NaN;
        if (truthy(pivotHighHTF[i])) {
          const level = p ? p.high : NaN;
          if (asLines) {
            highHTF.lineArray.push(line.new(
              time1, level, time2, level, 'bar_time', extend, cfg.highLineColorHTF, dash(cfg.highLineStyleHTF), cfg.lineWidthHTF,
            ));
          } else {
            highHTF.boxArray.push(box.new(
              time1, level, time2, p ? Math.max(p.open, p.close) : NaN, cfg.highBoxBorderColorHTF, cfg.lineWidthHTF,
              dash(cfg.highLineStyleHTF), extend, 'bar_time', cfg.highBoxBgColorHTF,
            ));
          }
        }
        if (truthy(pivotLowHTF[i])) {
          const level = p ? p.low : NaN;
          if (asLines) {
            lowHTF.lineArray.push(line.new(
              time1, level, time2, level, 'bar_time', extend, cfg.lowLineColorHTF, dash(cfg.lowLineStyleHTF), cfg.lineWidthHTF,
            ));
          } else {
            lowHTF.boxArray.push(box.new(
              time1, level, time2, p ? Math.min(p.open, p.close) : NaN, cfg.lowBoxBorderColorHTF, cfg.lineWidthHTF,
              dash(cfg.lowLineStyleHTF), extend, 'bar_time', cfg.lowBoxBgColorHTF,
            ));
          }
        }
      }

      const highLineAlertHTF = removeMitigatedLines(i, highHTF.lineArray, true);
      const lowLineAlertHTF = removeMitigatedLines(i, lowHTF.lineArray, false);
      const highBoxAlertHTF = removeMitigatedBoxes(i, highHTF.boxArray, true);
      const lowBoxAlertHTF = removeMitigatedBoxes(i, lowHTF.boxArray, false);

      if (extentionCurrent) {
        extendLines(i, highHTF.lineArray);
        extendLines(i, lowHTF.lineArray);
        extendBoxes(i, highHTF.boxArray);
        extendBoxes(i, lowHTF.boxArray);
      }

      // alertcondition(... "New HTF High") / ("New HTF Low") and their alert() calls
      const newHighHTF = highLineAlertHTF || highBoxAlertHTF;
      const newLowHTF = lowLineAlertHTF || lowBoxAlertHTF;
      flags[2].push(newHighHTF);
      flags[3].push(newLowHTF);
      if (newHighHTF && cfg.alertNewHighHTF) alertCalls.push({ time: bars[i].time, message: cfg.alertNewHighHTFTxt, freq: 'once_per_bar' });
      if (newLowHTF && cfg.alertNewLowHTF) alertCalls.push({ time: bars[i].time, message: cfg.alertNewLowHTFTxt, freq: 'once_per_bar' });
    }
  } finally {
    setDrawingBar(null);
  }

  // an object with an na coordinate is not drawn
  const drawn = (v: number[]) => !v.some((x) => isNaN(x));
  const lines = line.all().filter((l) => drawn([l.x1, l.y1, l.x2, l.y2])).map((l) => ({
    time1: l.x1, price1: l.y1, time2: l.x2, price2: l.y2, color: String(l.color), width: l.width,
    ...(l.style !== 'solid' ? { style: l.style as Dash } : {}),
    ...(l.extend === 'right' ? { extend: 'right' as const } : {}),
  }));
  const boxes = box.all().filter((b) => drawn([b.left, b.top, b.right, b.bottom])).map((b) => ({
    time1: b.left, price1: b.top, time2: b.right, price2: b.bottom, bgColor: String(b.bgcolor), borderColor: String(b.border_color),
    borderWidth: b.border_width,
    ...(b.border_style !== 'solid' ? { borderStyle: b.border_style } : {}),
    ...(b.extend === 'right' ? { extend: 'right' as const } : {}),
  }));
  resetDrawings();
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines,
    boxes,
    alerts: alertStates(alertConditions, bars, flags),
    alertCalls,
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'New High', message: 'Price is breaking out!' },
  { id: 'alert1', title: 'New Low', message: 'Price is breaking down!' },
  { id: 'alert2', title: 'New HTF High', message: 'Price is breaking out!' },
  { id: 'alert3', title: 'New HTF Low', message: 'Price is breaking down!' },
];

export const LiquidityLevelsMtfSonarlab = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions, hasAlertFunction,
};
