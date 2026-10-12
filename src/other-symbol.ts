/**
 * PineScript `request.security(symbol, timeframe, expression, gaps, lookahead)` of another symbol, for ports: which
 * bar of the other symbol each chart bar shows. The bars of the other symbol come from the `bars` accessor of the
 * chart context (`symbolBarsOf`), already on the requested timeframe; the port computes its expression on them and
 * maps the values to the chart bars with the index given here.
 *
 * The library merges other symbols in its script API only (oakScriptJS #179): this module has its own code for it,
 * with the rules measured on reference runs (stocks, crypto and an exchange whose trading day starts on the previous
 * UTC day; the chart timeframe, D, W and M on intraday and daily charts; all four gaps / lookahead combinations):
 * - lookahead off: the last bar of the other symbol whose close time is at or before the close time of the chart bar
 *   (a daily stock bar closes at the session end, a crypto daily bar at 00:00 UTC: a stock chart shows the crypto
 *   bar of the day before, a crypto chart shows the stock bar of the same day)
 * - lookahead on, intraday chart: the last bar of the other symbol that opened at or before the open of the chart bar
 * - lookahead on, D / W / M chart: the last bar of the other symbol whose period starts at or before the trading day of
 *   the chart bar: the trading day of a D bar, the Monday of a W bar, the first day of the month of an M bar, in the
 *   exchange time zone of each symbol (a week that opens on a Tuesday after a holiday still starts on Monday)
 * - before the first bar of the other symbol: na; on chart bars where the other symbol has no bar (weekends,
 *   holidays, closed hours), gaps off repeats the last value
 * - gaps on: a value only on the chart bar where the shown bar changes (and on the first chart bar), na on the others
 * - the last bar while it is open (`chart.lastBarConfirmed` false), gaps off: realtime updates show the bar of the
 *   other symbol given by lookahead on (the open bar of a higher timeframe), with lookahead off as well
 *
 * Close times, trading days and time zones come from the exchange calendars: the time zone and the session of the
 * chart (`chart.timezone`, `chart.session`) and of the other symbol (`options.timezone`, `options.session`), read by
 * the session functions of the library. Without them:
 * - a symbol that trades every day (bars on Saturdays or Sundays; W bars at Monday 00:00 UTC; M bars on the first day
 *   at 00:00 UTC) is on the "24x7" UTC calendar
 * - another symbol whose bars open where the chart calendar starts its periods is on the calendar of the chart
 * - else the UTC rule: an intraday bar closes one bar interval after its open (or at the next bar), a D / W / M bar at
 *   the end of the last weekday (UTC) of its day / week / month; the trading day is the UTC date of the bar
 * The rule is exact between symbols of the same calendar and with 24x7 symbols; between a stock and a 24x7 symbol, or
 * an exchange whose trading day starts on the previous UTC day, it needs the session of the stock.
 */

import { chartSessions, periodClose, periodTime, tradingDayTime, timeframe, type Bar, type SessionContext } from 'oakscriptjs';
import type { ChartContext } from './chart-context';
import { chartTimeframe } from './anchor-period';

const DAY = 86400000;

/** Options of `securityOther`. */
export interface OtherSymbolOptions {
  /** PineScript `barmerge.lookahead_on`; default false */
  lookahead?: boolean;
  /** PineScript `barmerge.gaps_on`; default false */
  gaps?: boolean;
  /** Exchange time zone of the other symbol ("America/New_York"); see the module comment for the fallback */
  timezone?: string;
  /** Session of the other symbol (hours, corrections, holidays), as `chart.session` */
  session?: ChartContext['session'];
  /**
   * Ticker id of the other symbol: without `timezone` / `session`, they are read from `chart.symbolInfo(symbol)`
   */
  symbol?: string;
}

/** Time zone and session of a symbol, or null for the UTC rule. */
interface Zone {
  timezone: string;
  session: NonNullable<ChartContext['session']>;
}

const calendars = new Map<string, SessionContext | null>();

/** The session context of the library for a zone and a timeframe (bar times in ms); null when it cannot read them. */
function calendarOf(zone: Zone | null, tf: string): SessionContext | null {
  if (!zone) return null;
  const key = `${zone.timezone}|${typeof zone.session === 'string' ? zone.session : JSON.stringify(zone.session)}|${tf}`;
  let context = calendars.get(key);
  if (context === undefined) {
    context = { timeframe: tf, timezone: zone.timezone, session: zone.session, timeUnit: 'ms' };
    try {
      chartSessions(context);
    } catch {
      context = null;
    }
    // a few calendars per chart: keep the cache small
    if (calendars.size > 64) calendars.clear();
    calendars.set(key, context);
  }
  return context;
}

const UTC_24X7: Zone = { timezone: 'Etc/UTC', session: '24x7' };

/** True when bars of timeframe `tf` opening at `times` (ms) are those of a symbol that trades every day in UTC. */
function tradesEveryDay(times: number[], tf: string): boolean {
  if (times.length === 0) return false;
  const info = timeframe.info(tf);
  if (info.isweekly) return times.every((t) => t % DAY === 0 && new Date(t).getUTCDay() === 1);
  if (info.ismonthly) return times.every((t) => t % DAY === 0 && new Date(t).getUTCDate() === 1);
  return times.some((t) => {
    const wd = new Date(t).getUTCDay();
    return wd === 0 || wd === 6;
  });
}

/** True when most of the last bars open at the start of a period of `tf` on the calendar `zone`. */
function onCalendar(times: number[], tf: string, zone: Zone | null): boolean {
  const calendar = calendarOf(zone, tf);
  if (!calendar || times.length === 0) return false;
  const last = times.slice(-50);
  return last.filter((t) => periodTime(t, tf, calendar) === t).length >= 0.9 * last.length;
}

/** 00:00 UTC (ms) of the day of `t`. */
const utcDay = (t: number) => Math.floor(t / DAY) * DAY;

/** Monday 00:00 UTC of the week of the day `day` (00:00 UTC, ms). */
const weekStart = (day: number) => day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;

/** First day of the month of the day `day`. */
function monthStart(day: number): number {
  const d = new Date(day);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** 00:00 UTC after the last weekday before `end` (00:00 UTC, ms): the end of a period of a Monday-to-Friday symbol. */
function afterLastWeekday(end: number): number {
  let day = end - DAY;
  while (new Date(day).getUTCDay() % 6 === 0) day -= DAY;
  return day + DAY;
}

/** Close time (ms) of each bar of timeframe `tf` opening at `times` (ms). */
function closeTimes(times: number[], tf: string, zone: Zone | null): number[] {
  const calendar = calendarOf(zone, tf);
  const info = timeframe.info(tf);
  const len = timeframe.in_seconds(tf) * 1000;
  return times.map((t, i) => {
    if (calendar) {
      const c = periodClose(t, tf, calendar);
      if (!Number.isNaN(c)) return c;
    }
    if (info.isintraday) return i + 1 < times.length ? Math.min(t + len, times[i + 1]) : t + len;
    const day = utcDay(t);
    if (info.isweekly) return afterLastWeekday(weekStart(day) + 7 * DAY * info.multiplier);
    if (info.ismonthly) {
      const d = new Date(day);
      return afterLastWeekday(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + info.multiplier, 1));
    }
    return day + DAY * info.multiplier;
  });
}

/** Trading day (00:00 UTC, ms) of each bar opening at `times` (ms): its date in the exchange time zone. */
function tradingDays(times: number[], zone: Zone | null): number[] {
  const calendar = calendarOf(zone, '1D');
  return times.map((t) => {
    const d = calendar ? tradingDayTime(t, calendar) : NaN;
    return Number.isNaN(d) ? utcDay(t) : d;
  });
}

/** For each element of `at` (non-decreasing), the index of the last element of `keys` (non-decreasing) <= it; -1: none. */
function latestAtOrBefore(keys: number[], at: number[]): number[] {
  let j = -1;
  return at.map((x) => {
    while (j + 1 < keys.length && keys[j + 1] <= x) j++;
    return j;
  });
}

/**
 * PineScript `request.security` of another symbol: the index in `otherBars` of the bar shown on each chart bar, -1
 * for na. `otherBars` are the bars of the other symbol on `tf` ("" for the chart timeframe, or a higher timeframe:
 * "D", "W", "240"...), in the time unit of the chart bars (`chart.timeUnit`). See the module comment for the rules.
 * @throws RangeError when `tf` is lower than the chart timeframe (not supported) or is not a timeframe
 */
export function securityOther(
  chartBars: ReadonlyArray<{ time: number }>,
  otherBars: ReadonlyArray<{ time: number }>,
  tf: string,
  options: OtherSymbolOptions = {},
  chart?: ChartContext,
): number[] {
  const n = chartBars.length;
  if (n === 0) return [];
  const unit = chart?.timeUnit === 'ms' || (chart?.timeUnit === undefined && chartBars[0].time >= 1e12) ? 1 : 1000;
  const ct = chartBars.map((b) => b.time * unit);
  const ot = otherBars.map((b) => b.time * unit);

  const chartTf = chartTimeframe(chartBars, chart) || (tf.trim() === '' ? '1D' : timeframe.info(tf).period);
  const otherTf = tf.trim() === '' ? chartTf : timeframe.info(tf).period;
  if (timeframe.info(otherTf).isticks || timeframe.in_seconds(otherTf) < timeframe.in_seconds(chartTf)) {
    throw new RangeError(`Timeframe "${tf}" is lower than the chart timeframe "${chartTf}": not supported`);
  }
  if (ot.length === 0) return new Array(n).fill(-1);

  // exchange calendars: given, 24x7, the chart's, else the UTC rule
  const chartZone: Zone | null =
    chart?.timezone && chart.session ? { timezone: chart.timezone, session: chart.session }
      : tradesEveryDay(ct, chartTf) ? UTC_24X7 : null;
  const info = options.symbol !== undefined ? chart?.symbolInfo?.(options.symbol) : undefined;
  const otherTz = options.timezone ?? info?.timezone;
  const otherSession = options.session ?? info?.session;
  const otherZone: Zone | null =
    otherTz && otherSession ? { timezone: otherTz, session: otherSession }
      : tradesEveryDay(ot, otherTf) ? UTC_24X7
        : chartZone && onCalendar(ot, otherTf, chartZone) ? chartZone : null;

  const daily = timeframe.info(chartTf).isdwm;
  const lookahead = !!options.lookahead;
  const realtime = chart?.lastBarConfirmed === false && !options.gaps;

  // lookahead on: by open time on intraday charts, by trading day on D / W / M charts
  let on: number[] = [];
  if (lookahead || realtime) {
    if (daily) {
      const info = timeframe.info(otherTf);
      const starts = tradingDays(ot, otherZone).map((d) => (info.isweekly ? weekStart(d) : info.ismonthly ? monthStart(d) : d));
      on = latestAtOrBefore(starts, tradingDays(ct, chartZone));
    } else {
      on = latestAtOrBefore(ot, ct);
    }
  }
  const index = lookahead ? on : latestAtOrBefore(closeTimes(ot, otherTf, otherZone), closeTimes(ct, chartTf, chartZone));
  // realtime updates of the open last bar: lookahead off shows the bar of lookahead on
  if (realtime) index[n - 1] = on[n - 1];
  if (!options.gaps) return index;
  return index.map((j, i) => (i === 0 || j !== index[i - 1] ? j : -1));
}

/**
 * `securityOther` with the values of an expression: `values` has one value per bar of the other symbol (or is a
 * function that computes them from `otherBars`); the result has one value per chart bar, NaN for na.
 * @throws RangeError when `tf` is lower than the chart timeframe (not supported) or is not a timeframe
 */
export function securityOtherValues(
  chartBars: ReadonlyArray<{ time: number }>,
  otherBars: ReadonlyArray<Bar>,
  tf: string,
  values: ArrayLike<number> | ((bars: ReadonlyArray<Bar>) => ArrayLike<number>),
  options: OtherSymbolOptions = {},
  chart?: ChartContext,
): number[] {
  const series = typeof values === 'function' ? values(otherBars) : values;
  return securityOther(chartBars, otherBars, tf, options, chart).map((j) => (j < 0 ? NaN : (series[j] ?? NaN)));
}

/**
 * Spread symbols: an expression of two tickers and an operator ("ECONOMICS:CNM2 * FX_IDC:CNYUSD", "A / B"), as the
 * symbol of `request.security`. The library has no spread symbols: a port asks for the bars of both tickers
 * (`spreadSymbols`), builds the bars of the spread (`spreadBars`) and merges them with `securityOtherValues` and the
 * options of the expression (`spreadOptions`). Rule measured on reference runs (41 spreads of economic series and
 * exchange rates, every close equal):
 * - one bar per trading day of either part, from the later of the first trading days of the two parts
 * - close = last close of A at or before that day (op) last close of B at or before that day (open = high = low =
 *   close, volume 0); the bar opens at 00:00 UTC of the day
 * - the spread trades every day on the UTC calendar ("24x7")
 * The trading day of a part comes from its time zone and session (`chart.symbolInfo`; an FX_IDC rate trades from
 * 22:00 UTC the day before, an FX rate from 17:00 New York); without them a bar that opens at 12:00 UTC or later
 * belongs to the next UTC day.
 */

/** An expression of `spreadSymbols`: one ticker, or two tickers and an operator. */
interface SpreadExpression {
  a: string;
  op?: '*' | '/';
  b?: string;
}

function parseSpread(expr: string): SpreadExpression {
  const s = expr.replace(/\s+/g, '');
  const m = /^([^*/]+)([*/])([^*/]+)$/.exec(s);
  return m ? { a: m[1], op: m[2] as '*' | '/', b: m[3] } : { a: s };
}

/**
 * Tickers of a symbol expression, once each, in their order: ["A", "B"] for "A * B" or "A / B", ["A"] for one ticker
 * (spaces removed).
 */
export function spreadSymbols(expr: string): string[] {
  const e = parseSpread(expr);
  return e.b !== undefined && e.b !== e.a ? [e.a, e.b] : [e.a];
}

/**
 * Options of `securityOther` for the bars of `spreadBars(expr, ...)`: the ticker for one ticker (its time zone and
 * session come from `chart.symbolInfo`), the 24x7 UTC calendar for a spread.
 */
export function spreadOptions(expr: string): OtherSymbolOptions {
  const e = parseSpread(expr);
  return e.op ? { timezone: UTC_24X7.timezone, session: UTC_24X7.session } : { symbol: e.a };
}

/** Trading day (00:00 UTC, ms) of each bar opening at `times` (ms); without a calendar, the noon rule of spreads. */
function spreadTradingDays(times: number[], zone: Zone | null): number[] {
  const calendar = calendarOf(zone, '1D');
  return times.map((t) => {
    const d = calendar ? tradingDayTime(t, calendar) : NaN;
    if (!Number.isNaN(d)) return d;
    const day = utcDay(t);
    return t - day >= DAY / 2 ? day + DAY : day;
  });
}

/**
 * Bars of a symbol expression (see `spreadSymbols`): for one ticker its bars as given; for a spread "A op B" the bars
 * built by the measured rule (see above), times in the unit of the given bars (`chart.timeUnit`; without it, ms when
 * the first bar time is 1e12 or more, else seconds). `barsBySymbol` gives the bars of each ticker (a Map or a
 * function), on a daily or higher timeframe.
 * @throws RangeError when the bars of a ticker of the expression are missing
 */
export function spreadBars(
  expr: string,
  barsBySymbol: ReadonlyMap<string, ReadonlyArray<Bar>> | ((symbol: string) => ReadonlyArray<Bar> | undefined),
  chart?: ChartContext,
): Bar[] {
  const get = (symbol: string): ReadonlyArray<Bar> => {
    const bars = typeof barsBySymbol === 'function' ? barsBySymbol(symbol) : barsBySymbol.get(symbol);
    if (!bars) throw new RangeError(`No bars for the symbol "${symbol}" of "${expr}"`);
    return bars;
  };
  const e = parseSpread(expr);
  if (!e.op || e.b === undefined) return get(e.a).slice();
  const a = get(e.a);
  const b = get(e.b);
  if (a.length === 0 || b.length === 0) return [];
  const unit = chart?.timeUnit === 'ms' || (chart?.timeUnit === undefined && a[0].time >= 1e12) ? 1 : 1000;
  const days = (bars: ReadonlyArray<Bar>, symbol: string) => {
    const info = chart?.symbolInfo?.(symbol);
    const zone = info?.timezone && info.session ? { timezone: info.timezone, session: info.session } : null;
    return spreadTradingDays(bars.map((x) => x.time * unit), zone);
  };
  const aDays = days(a, e.a);
  const bDays = days(b, e.b);
  const start = Math.max(aDays[0], bDays[0]);
  const out: Bar[] = [];
  let i = -1;
  let j = -1;
  while (i + 1 < a.length || j + 1 < b.length) {
    const next = Math.min(i + 1 < a.length ? aDays[i + 1] : Infinity, j + 1 < b.length ? bDays[j + 1] : Infinity);
    while (i + 1 < a.length && aDays[i + 1] <= next) i++;
    while (j + 1 < b.length && bDays[j + 1] <= next) j++;
    if (next < start) continue;
    const c = e.op === '*' ? a[i].close * b[j].close : a[i].close / b[j].close;
    out.push({ time: next / unit, open: c, high: c, low: c, close: c, volume: 0 });
  }
  return out;
}
