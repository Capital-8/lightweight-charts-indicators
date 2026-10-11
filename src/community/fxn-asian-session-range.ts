/**
 * FXN - Asian Session Range
 *
 * Marks three trading sessions on intraday bars (below 2 hours): the Asian session (20:00 to 02:00 by default), the
 * London session (03:00 to 07:00) and the New York session (08:00 to 12:00), hours in New York time ("EST").
 * - Each session keeps its running high and low. The range of the session is shaded (a fill between the two hidden
 *   plots of the session high and low) and, on the last bar, outlined with a box of lines with its middle line.
 * - The high, low and middle of the Asian session are extended with lines until the "Extend Session Lines Until" time.
 * - When a session ends, a label under its low gives the size of the range in pips (A = Asian, L = London,
 *   N = New York), with the average daily range (average of the high - low of the previous days) on the last days.
 * - Lines mark the high and low of the previous day and of the previous week (and of the current week as an option),
 *   with a label (PWH / PWL, YH / YL, WH / WL) at the start of the day.
 * - Option: labels with the time of the high and of the low of the day (HOD / LOD) at 16:45.
 * The lines are drawn again on every bar, so only those of the last bar remain.
 *
 * Notes on the port:
 * - The original reads the clock of the bars, the session hours and the days in the exchange time zone, and adds
 *   4 hours to every hour input when that time zone is UTC (the day labels are then made at 00:00, else at 20:00).
 *   The port reads the exchange time zone from the chart context (third argument). Without it the port uses UTC (so
 *   it adds the 4 hours): this is equal on symbols with a UTC exchange time zone (e.g. crypto); on other symbols
 *   the sessions are then the input hours + 4 in UTC all year (for a New York symbol: New York time in summer, one
 *   hour off in winter).
 * - Session strings without days are Monday to Friday in this version of the language: no session on weekends.
 * - The range in pips and the average daily range divide by the price tick of the symbol: read from the chart
 *   context, 0.01 without it.
 * - The average daily range is shown on the labels of the last days before the current time (timenow in the
 *   original): read from the chart context, the clock of the computer without it.
 * - The previous day, week and average daily range come from the daily and weekly bars built from the chart bars
 *   (UTC days, weeks from Monday): they need bars from the start of the previous week (22 days for the average).
 * - The six plots are hidden in the original (white, transparency 100, only the last 5 bars): only the fills between
 *   them are visible. The three session background colours have a transparency of 100.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "FXN - Asian Session Range" by RobMinty
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, str, timeframe, time as pineTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, LineDrawingData, LabelData, PineSize } from '../types';
import { chartTimeframe, periodStarts, securityBars } from '../anchor-period';
import { mintickOf, nowOf, timezoneOf, type ChartContext } from '../chart-context';

type StyleName = 'solid' | 'dashed' | 'dotted';
type SizeName = 'tiny' | 'small' | 'normal' | 'large';

export interface FxnAsianSessionRangeInputs {
  userSsth: string;
  userSstm: string;
  userEsth: string;
  userEstm: string;
  userElth: string;
  userEltm: string;
  userBoxLineColor: string;
  boxLineWidth: number;
  userBoxLineStyle: StyleName;
  sessionLineWidth: number;
  userUpperlowerLineStyle: StyleName;
  userMidlineColor: string;
  userMiddleLineStyle: StyleName;
  userTextColor: string;
  userLabelSize: SizeName;
  showLondonSession: boolean;
  showLondonSessionRng: boolean;
  londonSsth: string;
  londonSstm: string;
  londonEsth: string;
  londonEstm: string;
  luserBoxLineColor: string;
  lboxLineWidth: number;
  luserBoxLineStyle: StyleName;
  lsessionLineWidth: number;
  /** Not used by the original script (the London high / low are not extended) */
  luserUpperlowerLineStyle: StyleName;
  luserMidlineColor: string;
  luserMiddleLineStyle: StyleName;
  luserTextColor: string;
  luserLabelSize: SizeName;
  showNySession: boolean;
  showNySessionRng: boolean;
  nySsth: string;
  nySstm: string;
  nyEsth: string;
  nyEstm: string;
  nuserBoxLineColor: string;
  nboxLineWidth: number;
  nuserBoxLineStyle: StyleName;
  nsessionLineWidth: number;
  /** Not used by the original script (the New York high / low are not extended) */
  nuserUpperlowerLineStyle: StyleName;
  nuserMidlineColor: string;
  nuserMiddleLineStyle: StyleName;
  nuserTextColor: string;
  /** Also the size of the day and week labels */
  nuserLabelSize: SizeName;
  showADR: boolean;
  isForexPips: boolean;
  dailyAdrUser: number;
  dailyAdrLength: number;
  showPreviousDayHiLo: boolean;
  previousDayHiLoColor: string;
  /** Also the width of the lines of the current week */
  supportLineWidth: number;
  /** Also the style of the lines of the current week */
  previousDayHiLoLineStyle: StyleName;
  showHiLoPriceRange: boolean;
  showHiLoPriceLabel: boolean;
  showLastWeeklyHiLo: boolean;
  lastWeeklyHiLoColor: string;
  supportLastWeekLineWidth: number;
  lastWeeklyHiLoStyle: StyleName;
  lastWeeklyHiLoShowLabel: boolean;
  showWeeklyHiLo: boolean;
  weeklyHiLoColor: string;
  /** Not used by the original script */
  supportWeekLineWidth: number;
  /** Not used by the original script */
  weeklyHiLoStyle: StyleName;
  weeklyHiLoShowLabel: boolean;
  showHiLoTime: boolean;
}

export const defaultInputs: FxnAsianSessionRangeInputs = {
  userSsth: '20',
  userSstm: '00',
  userEsth: '02',
  userEstm: '00',
  userElth: '11',
  userEltm: '30',
  userBoxLineColor: 'blue',
  boxLineWidth: 1,
  userBoxLineStyle: 'solid',
  sessionLineWidth: 2,
  userUpperlowerLineStyle: 'dotted',
  userMidlineColor: 'orange',
  userMiddleLineStyle: 'dotted',
  userTextColor: 'blue',
  userLabelSize: 'normal',
  showLondonSession: true,
  showLondonSessionRng: true,
  londonSsth: '03',
  londonSstm: '00',
  londonEsth: '07',
  londonEstm: '00',
  luserBoxLineColor: 'teal',
  lboxLineWidth: 1,
  luserBoxLineStyle: 'solid',
  lsessionLineWidth: 2,
  luserUpperlowerLineStyle: 'dotted',
  luserMidlineColor: 'teal',
  luserMiddleLineStyle: 'dotted',
  luserTextColor: 'teal',
  luserLabelSize: 'normal',
  showNySession: true,
  showNySessionRng: true,
  nySsth: '08',
  nySstm: '00',
  nyEsth: '12',
  nyEstm: '00',
  nuserBoxLineColor: 'silver',
  nboxLineWidth: 1,
  nuserBoxLineStyle: 'solid',
  nsessionLineWidth: 2,
  nuserUpperlowerLineStyle: 'dotted',
  nuserMidlineColor: 'silver',
  nuserMiddleLineStyle: 'dotted',
  nuserTextColor: 'silver',
  nuserLabelSize: 'normal',
  showADR: true,
  isForexPips: true,
  dailyAdrUser: 1,
  dailyAdrLength: 21,
  showPreviousDayHiLo: true,
  previousDayHiLoColor: 'yellow',
  supportLineWidth: 1,
  previousDayHiLoLineStyle: 'dashed',
  showHiLoPriceRange: false,
  showHiLoPriceLabel: false,
  showLastWeeklyHiLo: true,
  lastWeeklyHiLoColor: 'orange',
  supportLastWeekLineWidth: 1,
  lastWeeklyHiLoStyle: 'dashed',
  lastWeeklyHiLoShowLabel: true,
  showWeeklyHiLo: false,
  weeklyHiLoColor: 'olive',
  supportWeekLineWidth: 1,
  weeklyHiLoStyle: 'dashed',
  weeklyHiLoShowLabel: false,
  showHiLoTime: false,
};

const HOURS = Array.from({ length: 24 }, (_v, h) => String(h).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];
const COLOR_NAMES = ['aqua', 'black', 'blue', 'fuchsia', 'gray', 'green', 'lime', 'maroon', 'navy', 'olive', 'orange',
  'purple', 'red', 'silver', 'teal', 'white', 'yellow'];
const STYLES = ['solid', 'dashed', 'dotted'];
const SIZES = ['tiny', 'small', 'normal', 'large'];

const sessionInputs = (p: string, l: string, name: string, col: string, defaults: [string, string]): InputConfig[] => [
  { id: `${p}Ssth`, type: 'string', title: `${name} Start Hour (EST)`, defval: defaults[0], options: HOURS },
  { id: `${p}Sstm`, type: 'string', title: `${name} Start Minute (EST)`, defval: '00', options: MINUTES },
  { id: `${p}Esth`, type: 'string', title: `${name} End Hour (EST)`, defval: defaults[1], options: HOURS },
  { id: `${p}Estm`, type: 'string', title: `${name} End Minute (EST)`, defval: '00', options: MINUTES },
  { id: `${l}userBoxLineColor`, type: 'string', title: `${name} Range Border Color`, defval: col, options: COLOR_NAMES },
  { id: `${l}boxLineWidth`, type: 'int', title: `${name} Box Line Width`, defval: 1, min: 0, max: 10 },
  { id: `${l}userBoxLineStyle`, type: 'string', title: `${name} Box Line Style`, defval: 'solid', options: STYLES },
  { id: `${l}sessionLineWidth`, type: 'int', title: 'Session High / Low / Mid Line Width', defval: 2, min: 0, max: 20 },
  { id: `${l}userUpperlowerLineStyle`, type: 'string', title: 'Session High / Low Line Style', defval: 'dotted', options: STYLES },
  { id: `${l}userMidlineColor`, type: 'string', title: 'Middle Range Line Color', defval: col, options: COLOR_NAMES },
  { id: `${l}userMiddleLineStyle`, type: 'string', title: 'Middle Range Line Style', defval: 'dotted', options: STYLES },
  { id: `${l}userTextColor`, type: 'string', title: 'Text Color', defval: col, options: COLOR_NAMES },
  { id: `${l}userLabelSize`, type: 'string', title: 'Text Size', defval: 'normal', options: SIZES },
];

export const inputConfig: InputConfig[] = [
  { id: 'userSsth', type: 'string', title: 'Start Session Hour (EST)', defval: '20', options: HOURS },
  { id: 'userSstm', type: 'string', title: 'Start Session Minute (EST)', defval: '00', options: MINUTES },
  { id: 'userEsth', type: 'string', title: 'End Session Hour (EST)', defval: '02', options: HOURS },
  { id: 'userEstm', type: 'string', title: 'End Session Minute (EST)', defval: '00', options: MINUTES },
  { id: 'userElth', type: 'string', title: 'Extend Session Lines Until Hour (EST)', defval: '11', options: HOURS },
  { id: 'userEltm', type: 'string', title: 'Extend Session Lines Until Minute (EST)', defval: '30', options: MINUTES },
  { id: 'userBoxLineColor', type: 'string', title: 'Asian Range Border Color', defval: 'blue', options: COLOR_NAMES },
  { id: 'boxLineWidth', type: 'int', title: 'Asian Box Line Width', defval: 1, min: 0, max: 10 },
  { id: 'userBoxLineStyle', type: 'string', title: 'Asian Box Line Style', defval: 'solid', options: STYLES },
  { id: 'sessionLineWidth', type: 'int', title: 'Session High / Low / Mid Line Width', defval: 2, min: 0, max: 20 },
  { id: 'userUpperlowerLineStyle', type: 'string', title: 'Session High / Low Line Style', defval: 'dotted', options: STYLES },
  { id: 'userMidlineColor', type: 'string', title: 'Middle Range Line Color', defval: 'orange', options: COLOR_NAMES },
  { id: 'userMiddleLineStyle', type: 'string', title: 'Middle Range Line Style', defval: 'dotted', options: STYLES },
  { id: 'userTextColor', type: 'string', title: 'Text Color', defval: 'blue', options: COLOR_NAMES },
  { id: 'userLabelSize', type: 'string', title: 'Text Size', defval: 'normal', options: SIZES },
  { id: 'showLondonSession', type: 'bool', title: 'Show London Session Box', defval: true },
  { id: 'showLondonSessionRng', type: 'bool', title: 'Show London Session Range Pips', defval: true },
  ...sessionInputs('london', 'l', 'London', 'teal', ['03', '07']),
  { id: 'showNySession', type: 'bool', title: 'Show New York Session Box', defval: true },
  { id: 'showNySessionRng', type: 'bool', title: 'Show New York Session Range Pips', defval: true },
  ...sessionInputs('ny', 'n', 'New York', 'silver', ['08', '12']),
  { id: 'showADR', type: 'bool', title: 'Show Average Daily Range', defval: true },
  { id: 'isForexPips', type: 'bool', title: 'Display average range as forex pips?', defval: true },
  { id: 'dailyAdrUser', type: 'int', title: 'Show ADR for x days', defval: 1, min: 0 },
  { id: 'dailyAdrLength', type: 'int', title: 'ADR Length parameter (Days - default 3 weeks, 21 days)', defval: 21, min: 0 },
  { id: 'showPreviousDayHiLo', type: 'bool', title: 'Show Previous Days High / Low', defval: true },
  { id: 'previousDayHiLoColor', type: 'string', title: 'Previous Days Line Color', defval: 'yellow', options: COLOR_NAMES },
  { id: 'supportLineWidth', type: 'int', title: 'Previous Days Line Width', defval: 1, min: 0, max: 10 },
  { id: 'previousDayHiLoLineStyle', type: 'string', title: 'Previous Days Line Style', defval: 'dashed', options: STYLES },
  { id: 'showHiLoPriceRange', type: 'bool', title: 'Show Previous Days Range', defval: false },
  { id: 'showHiLoPriceLabel', type: 'bool', title: 'Show Line Label (YH / YL)', defval: false },
  { id: 'showLastWeeklyHiLo', type: 'bool', title: 'Show Last Weeks High / Low', defval: true },
  { id: 'lastWeeklyHiLoColor', type: 'string', title: 'Last Week Line Color', defval: 'orange', options: COLOR_NAMES },
  { id: 'supportLastWeekLineWidth', type: 'int', title: 'Last Week Line Width', defval: 1, min: 0, max: 10 },
  { id: 'lastWeeklyHiLoStyle', type: 'string', title: 'Last Week Line Style', defval: 'dashed', options: STYLES },
  { id: 'lastWeeklyHiLoShowLabel', type: 'bool', title: 'Show Line Label (PWH / PWL)', defval: true },
  { id: 'showWeeklyHiLo', type: 'bool', title: 'Show This Weeks High / Low', defval: false },
  { id: 'weeklyHiLoColor', type: 'string', title: 'This Weeks Line Color', defval: 'olive', options: COLOR_NAMES },
  { id: 'supportWeekLineWidth', type: 'int', title: 'This Weeks Line Width', defval: 1, min: 0, max: 10 },
  { id: 'weeklyHiLoStyle', type: 'string', title: 'This Weeks Line Style', defval: 'dashed', options: STYLES },
  { id: 'weeklyHiLoShowLabel', type: 'bool', title: 'Show Line Label (WH / WL)', defval: false },
  { id: 'showHiLoTime', type: 'bool', title: 'Show Hi / Low Time of Day (Always Displays Eastern Standard Time)', defval: false },
];

/** color.new(color.white, 100): the six plots are hidden */
const HIDDEN = 'rgba(255, 255, 255, 0)';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Asian Range High', color: HIDDEN, lineWidth: 1 },
  { id: 'plot1', title: 'Asian Range Low', color: HIDDEN, lineWidth: 1 },
  { id: 'plot2', title: 'London Range High', color: HIDDEN, lineWidth: 1 },
  { id: 'plot3', title: 'London Range Low', color: HIDDEN, lineWidth: 1 },
  { id: 'plot4', title: 'New York Range High', color: HIDDEN, lineWidth: 1 },
  { id: 'plot5', title: 'New York Range Low', color: HIDDEN, lineWidth: 1 },
];

export const metadata = {
  title: 'FXN - Asian Session Range',
  shortTitle: 'Asian Session Range',
  overlay: true,
};

/** Named colours of this version of the language */
const COLORS: Record<string, string> = {
  aqua: '#00BCD4', black: '#363A45', blue: '#2196F3', fuchsia: '#E040FB', gray: '#787B86', green: '#4CAF50',
  lime: '#00E676', maroon: '#880E4F', navy: '#311B92', olive: '#808000', orange: '#FF9800', purple: '#9C27B0',
  red: '#FF5252', silver: '#B2B5BE', teal: '#00897B', white: '#FFFFFF', yellow: '#FFEB3B',
};
/** tickerExchangeOffset: hours added to the inputs when the exchange time zone is UTC */
const UTC_EXCHANGE_OFFSET = 4;
/** Days of a session string without days in this version of the language: Monday to Friday */
const WEEKDAYS = ':23456';
/** max_labels_count of the script (default) */
const MAX_LABELS = 50;
const ONE_DAY = 1000 * 60 * 60 * 24;

interface ScriptLabel { time: number; price: number; text: string; style: 'label_up' | 'none'; textColor?: string; size?: PineSize; noColor: boolean }

/**
 * An hour input ("00" .. "23") moved to the exchange time zone (`offset` hours added): its number (24 and more are
 * kept) and its string
 */
function exchangeHour(input: string, offset: number): { hour: number; text: string } {
  const n = HOURS.indexOf(input);
  const hour = (n < 0 ? 0 : n) + offset;
  let text: string;
  if (hour >= 24) text = hour === 24 ? '00' : `0${str.tostring(hour - 24)}`;
  else text = hour < 10 ? `0${str.tostring(hour)}` : str.tostring(hour);
  return { hour, text };
}

const minuteOf = (input: string) => (MINUTES.includes(input) ? Number(input) : 0);

/**
 * Bars of timeframe `tf` built from the chart bars, with the index of the bar of that timeframe of each chart bar
 * (security() with lookahead on and no gaps: every chart bar reads the finished bar of its period).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { high: number[]; low: number[]; group: number[] } {
  // With the exchange calendar of the chart context (time zone and session): the periods come from the library
  // rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { high: exchange.htf.map((b) => b.high), low: exchange.htf.map((b) => b.low), group: exchange.group };
  const starts = periodStarts(bars, tf);
  const high: number[] = [];
  const low: number[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      high.push(b.high);
      low.push(b.low);
    } else {
      const k = high.length - 1;
      high[k] = Math.max(high[k], b.high);
      low[k] = Math.min(low[k], b.low);
    }
    group.push(high.length - 1);
  });
  return { high, low, group };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<FxnAsianSessionRangeInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { bgColors: BgColorData[]; lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  // syminfo.mintick, and syminfo.timezone: the clock of the bars, the session hours and the days are read in the
  // exchange time zone; when it is UTC the original adds 4 hours to every hour input
  const MINTICK = mintickOf(chart);
  const TZ = timezoneOf(chart);
  const utcExchange = TZ === 'Etc/UTC' || TZ === 'UTC';
  const EXCHANGE_OFFSET = utcExchange ? UTC_EXCHANGE_OFFSET : 0;
  const n = bars.length;
  const inMs = n > 0 && bars[0].time >= 1e12;
  const ms = (t: number) => (inMs ? t : t * 1000);
  const out = (tMs: number) => (inMs ? tMs : tMs / 1000);
  const period = chartTimeframe(bars, chart);
  const info = period === '' ? null : timeframe.info(period);
  const col = (name: string) => COLORS[name] ?? COLORS.black;
  const style = (name: string): StyleName => (name === 'dashed' || name === 'dotted' ? name : 'solid');
  const size = (name: string): PineSize => (SIZES.includes(name) ? name as PineSize : 'normal');

  // ADR reset period: `if (dayofweek.sunday)` and `if (dayofweek.saturday)` test constants: 2 days are always added
  const dailyAdr = Math.trunc(cfg.dailyAdrUser) + 2;
  const lblTP = 70;
  const wlineTP = 30;
  const supportLineColor = col(cfg.previousDayHiLoColor);
  const supportLineLabelColor = String(color.new(col(cfg.previousDayHiLoColor), lblTP));
  const supportLastWeekLineColor = col(cfg.lastWeeklyHiLoColor);
  const supportLastWeekLineLabelColor = String(color.new(col(cfg.lastWeeklyHiLoColor), lblTP));
  const supportWeekLineColor = String(color.new(col(cfg.weeklyHiLoColor), wlineTP));
  const nlabelsize = size(cfg.nuserLabelSize);

  const chartPeriodInt = ['1', '3', '5', '15', '30', '45'].includes(period) ? Number(period) : 15;
  const smallPeriod = period === '5' || period === '3' || period === '1';
  // isValidResolution() / isBelowHourValidResolution()
  const validResolution = !(info === null || info.isdwm || ['120', '240', '180', '360'].includes(period));

  // The three sessions: hours moved to the exchange time zone, session strings
  const session = (ssth: string, sstm: string, esth: string, estm: string) => {
    const start = exchangeHour(ssth, EXCHANGE_OFFSET);
    const end = exchangeHour(esth, EXCHANGE_OFFSET);
    const endMinute = minuteOf(estm);
    const offsetMinute = endMinute + chartPeriodInt;
    return {
      startHour: start.hour, startMinute: minuteOf(sstm), endHour: end.hour, endMinute, endText: end.text,
      // rth_ses and rth_fill_ses (the end minute moved by one chart period)
      ses: `${start.text}${sstm}-${end.text}${estm}`,
      fillSes: `${start.text}${sstm}-${end.text}${smallPeriod && endMinute === 0 ? '0' : ''}${str.tostring(offsetMinute)}`,
      low: NaN, high: NaN, prevLow: NaN, prevHigh: NaN, t: NaN, active: false, prevActive: false,
    };
  };
  const asian = session(cfg.userSsth, cfg.userSstm, cfg.userEsth, cfg.userEstm);
  const london = session(cfg.londonSsth, cfg.londonSstm, cfg.londonEsth, cfg.londonEstm);
  const ny = session(cfg.nySsth, cfg.nySstm, cfg.nyEsth, cfg.nyEstm);
  const endLineHour = exchangeHour(cfg.userElth, EXCHANGE_OFFSET).hour;
  const endLineMinute = minuteOf(cfg.userEltm);
  const supportHour = 17 + EXCHANGE_OFFSET;

  /** not na(time(timeframe.period, ses)) */
  const inSession = (tMs: number, ses: string) => pineTime.inSession(tMs, ses + WEEKDAYS, TZ);
  /** time("D", ses): the start of the session that contains the bar (na outside the session) */
  const sessionStart = (tMs: number, ses: string): number => {
    if (!inSession(tMs, ses)) return NaN;
    const m = /^(\d{2})(\d{2})-/.exec(ses);
    if (!m) return NaN;
    const second = pineTime.hour(tMs, TZ) * 3600 + pineTime.minute(tMs, TZ) * 60 + pineTime.second(tMs, TZ);
    const since = (second - (Number(m[1]) * 60 + Number(m[2])) * 60 + 86400) % 86400;
    return tMs - since * 1000;
  };

  // Daily and weekly bars of the symbol (security(..., lookahead_on)), on the resolutions that use them
  const day = validResolution ? timeframeBars(bars, 'D', chart) : null;
  const week = validResolution ? timeframeBars(bars, 'W', chart) : null;
  // adr(length) = sma((high - low)[1], length) on the daily bars
  let dayAdr: number[] = [];
  if (day) {
    const ranges = day.high.map((_h, k) => (k > 0 ? day.high[k - 1] - day.low[k - 1] : NaN));
    const bucket = ranges.map((_v, k) => ({ time: k, open: 0, high: 0, low: 0, close: 0 }));
    dayAdr = ta.sma(Series.fromArray(bucket, ranges), Math.trunc(cfg.dailyAdrLength)).toArray().map((v) => v ?? NaN);
  }
  const toPips = (val: number) => (cfg.isForexPips ? Math.round(val / MINTICK / 10) : Math.round(val / MINTICK));

  // highestbars(95) / lowestbars(95), for the time of the high and low of the day
  const lookbackLength = 95;
  const hb = cfg.showHiLoTime ? ta.highestbars(Series.fromArray(bars, bars.map((b) => b.high)), lookbackLength).toArray() : [];
  const lb = cfg.showHiLoTime ? ta.lowestbars(Series.fromArray(bars, bars.map((b) => b.low)), lookbackLength).toArray() : [];

  // Labels in creation order: a creation that brings the count above max + 5 deletes the oldest until max remain
  let labels: ScriptLabel[] = [];
  const addLabel = (l: ScriptLabel): ScriptLabel => {
    labels.push(l);
    if (labels.length > MAX_LABELS + 5) labels = labels.slice(labels.length - MAX_LABELS);
    return l;
  };
  // label.delete(x[1]) of a label made inside an `if`: the label of the last bar where that `if` ran
  const last: Record<string, ScriptLabel | undefined> = {};
  const replaceLabel = (site: string, l: ScriptLabel) => {
    const old = last[site];
    last[site] = addLabel(l);
    if (old) labels = labels.filter((x) => x !== old);
  };
  const timeAt = (i: number) => (i >= 0 ? ms(bars[i].time) : NaN);
  /** get_label_offset(): the time some bars back, by chart timeframe */
  const labelOffset = (i: number) => {
    const back = period === '1' ? 180 : period === '3' ? 60 : period === '5' ? 36 : period === '15' ? 12 : period === '60' ? 3 : 12;
    return timeAt(i - back);
  };
  const rangeLabel = (i: number, s: typeof asian, text: string, textColor: string, labelSize: PineSize) => {
    addLabel({ time: labelOffset(i), price: s.prevLow, text, style: 'label_up', textColor, size: labelSize, noColor: true });
  };

  // timenow
  const now = nowOf(chart);
  const plots: Record<string, Array<{ time: number; value: number }>> = {};
  for (let k = 0; k < 6; k++) plots[`plot${k}`] = [];
  const bgColors: BgColorData[] = [];
  const bgSilver = String(color.new(COLORS.silver, 100));
  const lines: LineDrawingData[] = [];
  const stamp = (tMs: number, dayShift: number, hour: number, minute: number) => pineTime.timestamp(
    TZ, pineTime.year(tMs, TZ), pineTime.month(tMs, TZ), pineTime.dayofmonth(tMs, TZ) + dayShift, hour, minute);

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const tMs = ms(bar.time);
    const hour = pineTime.hour(tMs, TZ);
    const minute = pineTime.minute(tMs, TZ);
    const lastBar = i === n - 1;

    // Running low / high of each session
    for (const s of [asian, london, ny]) {
      const t = sessionStart(tMs, s.ses);
      // open_bar(ses): na(t[1]) and not na(t) or t[1] < t; is_open(ses): the bar is in the session
      const openBar = (Number.isNaN(s.t) && !Number.isNaN(t)) || s.t < t;
      s.t = t;
      s.prevActive = s.active;
      s.active = !Number.isNaN(t);
      s.prevLow = s.low;
      s.prevHigh = s.high;
      if (s.active) {
        s.low = openBar ? bar.low : Math.min(s.prevLow, bar.low);
        s.high = openBar ? bar.high : Math.max(s.prevHigh, bar.high);
      }
    }
    const pipsRange = (s: typeof asian) => (s.prevHigh - s.prevLow) / MINTICK / 10;

    // ---- Asian session
    const startTimeDelta = 24 - asian.startHour + 1;
    const startAlign = hour + startTimeDelta > 24 ? 0 : 1;
    const overnight = asian.startHour >= asian.endHour;
    const endBoxAlign = overnight ? (hour + startTimeDelta > 24 ? 1 : 0) : (hour + startTimeDelta > 24 ? 0 : -1);
    let endAlign: number;
    if (overnight) endAlign = hour + startTimeDelta > 24 ? 1 : 0;
    else if (endBoxAlign === 0) endAlign = 1;
    else endAlign = hour + startTimeDelta > 24 ? -1 : 0;

    if (lastBar) {
      const fromDate = stamp(tMs, -startAlign, asian.startHour, asian.startMinute);
      const toDate = stamp(tMs, endBoxAlign, asian.endHour, asian.endMinute) - chartPeriodInt;
      const lineToDate = stamp(tMs, endAlign, endLineHour, endLineMinute);
      const mid = (asian.low + asian.high) / 2;
      const lineColor = col(cfg.userBoxLineColor);
      const midColor = col(cfg.userMidlineColor);
      const boxStyle = style(cfg.userBoxLineStyle);
      const boxWidth = Math.trunc(cfg.boxLineWidth);
      const wide = Math.trunc(cfg.sessionLineWidth);
      const line = (x1: number, y1: number, x2: number, y2: number, c: string, st: StyleName, width: number) => {
        lines.push({ time1: out(x1), price1: y1, time2: out(x2), price2: y2, color: c, style: st, width });
      };
      // The Asian box
      line(fromDate, asian.low, toDate, asian.low, lineColor, boxStyle, boxWidth);
      line(fromDate, asian.high, toDate, asian.high, lineColor, boxStyle, boxWidth);
      line(fromDate, mid, toDate, mid, midColor, style(cfg.userMiddleLineStyle), wide);
      line(fromDate, asian.high, fromDate, asian.low, lineColor, boxStyle, boxWidth);
      line(toDate, asian.high, toDate, asian.low, lineColor, boxStyle, boxWidth);
      // The high / low / mid session lines for London / New York
      line(toDate, asian.low, lineToDate, asian.low, lineColor, style(cfg.userUpperlowerLineStyle), wide);
      line(toDate, asian.high, lineToDate, asian.high, lineColor, style(cfg.userUpperlowerLineStyle), wide);
      line(toDate, mid, lineToDate, mid, midColor, style(cfg.userMiddleLineStyle), wide);

      // The London and New York boxes
      const box = (s: typeof asian, show: boolean, c: string, midC: string, st: StyleName, width: number,
        midStyle: StyleName, midWidth: number) => {
        if (!(show && validResolution)) return;
        const delta = 24 - s.startHour + 1;
        const sAlign = hour + delta > 24 ? 0 : 1;
        const eAlign = hour >= s.startHour && sAlign === 0 ? 0 : 1;
        const from = stamp(tMs, -sAlign, s.startHour, s.startMinute);
        const to = stamp(tMs, -eAlign, s.endHour, s.endMinute) - chartPeriodInt;
        const m = (s.low + s.high) / 2;
        line(from, s.low, to, s.low, c, st, width);
        line(from, s.high, to, s.high, c, st, width);
        line(from, m, to, m, midC, midStyle, midWidth);
        line(from, s.high, from, s.low, c, st, width);
        line(to, s.high, to, s.low, c, st, width);
      };
      box(london, cfg.showLondonSession, col(cfg.luserBoxLineColor), col(cfg.luserMidlineColor),
        style(cfg.luserBoxLineStyle), Math.trunc(cfg.lboxLineWidth), style(cfg.luserMiddleLineStyle), Math.trunc(cfg.lsessionLineWidth));
      box(ny, cfg.showNySession, col(cfg.nuserBoxLineColor), col(cfg.nuserMidlineColor),
        style(cfg.nuserBoxLineStyle), Math.trunc(cfg.nboxLineWidth), style(cfg.nuserMiddleLineStyle), Math.trunc(cfg.nsessionLineWidth));

      // Previous day, current week and previous week lines
      if (day && week) {
        const d = day.group[i];
        const w = week.group[i];
        const supportAlign = hour + startTimeDelta > 24 ? 0 : 1;
        const supportFrom = stamp(tMs, -supportAlign, supportHour, 0);
        const supportTo = stamp(tMs, 1 - supportAlign, supportHour, 0) - chartPeriodInt;
        const prev = (a: number[], k: number) => (k > 0 ? a[k - 1] : NaN);
        const supportStyle = style(cfg.previousDayHiLoLineStyle);
        const supportWidth = Math.trunc(cfg.supportLineWidth);
        if (cfg.showPreviousDayHiLo) {
          line(supportFrom, prev(day.high, d), supportTo, prev(day.high, d), supportLineColor, supportStyle, supportWidth);
          line(supportFrom, prev(day.low, d), supportTo, prev(day.low, d), supportLineColor, supportStyle, supportWidth);
        }
        if (cfg.showWeeklyHiLo) {
          line(supportFrom, week.high[w], supportTo, week.high[w], supportWeekLineColor, supportStyle, supportWidth);
          line(supportFrom, week.low[w], supportTo, week.low[w], supportWeekLineColor, supportStyle, supportWidth);
        }
        if (cfg.showLastWeeklyHiLo) {
          const lastStyle = style(cfg.lastWeeklyHiLoStyle);
          const lastWidth = Math.trunc(cfg.supportLastWeekLineWidth);
          line(supportFrom, prev(week.high, w), supportTo, prev(week.high, w), supportLastWeekLineColor, lastStyle, lastWidth);
          line(supportFrom, prev(week.low, w), supportTo, prev(week.low, w), supportLastWeekLineColor, lastStyle, lastWidth);
        }
      }
    }

    // Plots, background colours and range labels of the three sessions
    const inFill = (s: typeof asian) => validResolution && inSession(tMs, s.fillSes);
    const asianFill = inFill(asian);
    plots.plot0.push({ time: bar.time, value: asianFill ? asian.high : NaN });
    plots.plot1.push({ time: bar.time, value: asianFill ? asian.low : NaN });
    if (validResolution && asian.active) bgColors.push({ time: bar.time, color: bgSilver });
    if (!asian.active && asian.prevActive && validResolution) {
      let text = `A = ${str.tostring(pipsRange(asian))}`;
      if (info !== null && (info.isintraday || info.isdaily) && cfg.showADR && now - tMs < ONE_DAY * dailyAdr && day) {
        text += `\nADR = ${str.tostring(toPips(dayAdr[day.group[i]]))}`;
      }
      rangeLabel(i, asian, text, col(cfg.userTextColor), size(cfg.userLabelSize));
    }

    const londonFill = cfg.showLondonSession && inFill(london);
    plots.plot2.push({ time: bar.time, value: londonFill ? london.high : NaN });
    plots.plot3.push({ time: bar.time, value: londonFill ? london.low : NaN });
    if (londonFill) bgColors.push({ time: bar.time, color: bgSilver });
    if (cfg.showLondonSessionRng && !london.active && london.prevActive && validResolution) {
      rangeLabel(i, london, `L = ${str.tostring(pipsRange(london))}`, col(cfg.luserTextColor), size(cfg.luserLabelSize));
    }

    const nyFill = cfg.showNySession && inFill(ny);
    plots.plot4.push({ time: bar.time, value: nyFill ? ny.high : NaN });
    plots.plot5.push({ time: bar.time, value: nyFill ? ny.low : NaN });
    if (nyFill) bgColors.push({ time: bar.time, color: bgSilver });
    if (cfg.showNySessionRng && !ny.active && ny.prevActive && validResolution) {
      rangeLabel(i, ny, `N = ${str.tostring(pipsRange(ny))}`, col(cfg.nuserTextColor), nlabelsize);
    }

    // Labels of the previous day, the current week and the previous week, at the start of a day (is_new_day())
    // is_new_day(): 00:00 when the exchange time zone is UTC, else 20:00
    if (day && week && hour === (utcExchange ? 0 : 20) && minute === 0) {
      const d = day.group[i];
      const w = week.group[i];
      const prev = (a: number[], k: number) => (k > 0 ? a[k - 1] : NaN);
      // time - (time - time[1]) * k
      const back = (k: number) => tMs - (tMs - timeAt(i - 1)) * k;
      const text = (site: string, time: number, price: number, t: string, textColor: string) => {
        replaceLabel(site, { time, price, text: t, style: 'none', textColor, size: nlabelsize, noColor: true });
      };
      if (cfg.showPreviousDayHiLo) {
        // is_new_day_switch_period(): from 20:00 on the hour, the labels use the previous day, else the current day
        const switchPeriod = hour >= 20 && minute === 0 && hour <= 23 && minute <= 59;
        const pdh = switchPeriod ? prev(day.high, d) : day.high[d];
        const pdl = switchPeriod ? prev(day.low, d) : day.low[d];
        const range = str.tostring((pdh - pdl) / MINTICK / 10);
        if (cfg.showHiLoPriceRange) {
          if (cfg.showHiLoPriceLabel) {
            text('pdHi1', back(15), pdh, `YH (${range})`, supportLineLabelColor);
            text('pdLow1', back(14), pdl, 'YL', supportLineLabelColor);
          } else {
            text('pdHi2', back(15), pdh, range, supportLineLabelColor);
          }
        }
        if (cfg.showHiLoPriceLabel && !cfg.showHiLoPriceRange) {
          text('pdHi3', back(14), pdh, 'YH', supportLineLabelColor);
          text('pdLow3', back(14), pdl, 'YL', supportLineLabelColor);
        }
      }
      if (cfg.showWeeklyHiLo && cfg.weeklyHiLoShowLabel) {
        text('wkHi', back(14), week.high[w], 'WH', supportWeekLineColor);
        text('wkLow', back(14), week.low[w], 'WL', supportWeekLineColor);
      }
      if (cfg.showLastWeeklyHiLo && cfg.lastWeeklyHiLoShowLabel) {
        text('lwkHi', back(14), prev(week.high, w), 'PWH', supportLastWeekLineLabelColor);
        text('lwkLow', back(14), prev(week.low, w), 'PWL', supportLastWeekLineLabelColor);
      }
    }

    // Time of the high and of the low of the day, at the end of the day (is_end_day(): 16:45)
    if (cfg.showHiLoTime && validResolution && hour === 16 && minute === 45) {
      const hi = i - Math.abs(hb[i] ?? NaN);
      const lo = i - Math.abs(lb[i] ?? NaN);
      const clock = (k: number) => (k >= 0
        ? `${str.tostring(pineTime.hour(timeAt(k), TZ))}:${str.tostring(pineTime.minute(timeAt(k), TZ))}` : 'NaN:NaN');
      addLabel({ time: timeAt(i - 10), price: hi >= 0 ? bars[hi].high : NaN, text: `HOD: ${clock(hi)}`, style: 'none', textColor: COLORS.silver, noColor: false });
      addLabel({ time: timeAt(i - 10), price: lo >= 0 ? bars[lo].low : NaN, text: `LOD: ${clock(lo)}`, style: 'none', textColor: COLORS.silver, noColor: false });
    }
  }

  // fill() between the two plots of each session: blue, teal and silver with `transp = 90`, a style value (alpha 0.1);
  // na on resolutions where the sessions are not drawn
  const fillColor = (c: string) => `rgba(${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)}, 0.1)`;
  const fillColors = (c: string, show: boolean) => bars.map(() => (show && validResolution ? fillColor(c) : 'transparent'));
  const fills = [
    { plot1: 'plot0', plot2: 'plot1', colors: fillColors(COLORS.blue, true) },
    { plot1: 'plot2', plot2: 'plot3', colors: fillColors(COLORS.teal, cfg.showLondonSession) },
    { plot1: 'plot4', plot2: 'plot5', colors: fillColors(COLORS.silver, cfg.showNySession) },
  ];

  // A drawing with an na coordinate is an object of the script but is not drawn
  const ok = (...v: number[]) => v.every((x) => Number.isFinite(x));
  // color.new(color.black, 100)
  const noColor = String(color.new(COLORS.black, 100));
  const outLabels: LabelData[] = labels.filter((l) => ok(l.time, l.price)).map((l) => ({
    time: out(l.time), price: l.price, text: l.text, style: l.style,
    ...(l.noColor ? { color: noColor } : {}),
    ...(l.textColor !== undefined ? { textColor: l.textColor } : {}),
    ...(l.size !== undefined ? { size: l.size } : {}),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    bgColors,
    lines: lines.filter((l) => ok(l.time1, l.price1, l.time2, l.price2)),
    labels: outLabels,
  };
}

export const FxnAsianSessionRange = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
