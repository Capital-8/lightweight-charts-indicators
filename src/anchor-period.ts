/**
 * Timeframe periods of the bars, for ports with a timeframe input (PineScript `time(tf)`, `timeframe.change(tf)`,
 * `request.security` on the chart symbol), and the chart timeframe of the bars (lower-timeframe volume ports).
 *
 * The original computes periods from the exchange time zone and the trading sessions of the symbol, which the bars
 * do not carry. Every function takes the chart context as an optional last argument (see chart-context.ts).
 *
 * With `chart.timezone` and `chart.session` (the session hours of the symbol, with its corrections and holidays
 * when the caller has them; `chart.regularSession` on extended-hours bars), the periods are those of the exchange
 * calendar. The values come from the script API of oakscriptjs (`time(tf)`, `request.security`, `session.*`,
 * `time_tradingday`), which has the PineScript rules: trading days from the session and its holidays, sessions that
 * cross midnight, "nD" counted in trading days from the first trading day of the year, weeks from Monday, the
 * start of a D / W / M period at the session start of its first trading day, and a higher-timeframe bar completed
 * by the chart bar whose close reaches the end of the period (`securityPeriods`).
 * `chart.timeframe`, when given, is the chart timeframe; else it is taken from the bar spacing.
 *
 * Without the time zone or the session the port uses the UTC calendar and takes the session start of a trading day
 * from the bars:
 * - symbols with bars on Saturdays or Sundays trade every day: each UTC day is a trading day starting at 00:00 UTC
 * - other symbols: the trading days are the UTC days that have bars, and a trading day starts at its first bar
 * Then, as in the original:
 * - "" (the chart timeframe): every bar is its own period
 * - seconds / minutes: periods of the timeframe length aligned on the session start of the trading day
 * - "D": the trading day; "nD": n trading days counted from the first trading day of the year (when the bars start
 *   after it, the count starts at the first bar)
 * - "W": the week from Monday; "nW": n weeks counted from the first Monday of the year
 * - "M": the month; "nM": n months counted from January
 * - `time(tf)` of D / W / M periods: the session start of the first trading day of the period (the first bar of
 *   the period on symbols that do not trade every day)
 * This fallback is exact on UTC 24x7 symbols and on symbols whose trading day is inside the UTC day with bars from
 * the session start (e.g. US stocks); not on sessions that cross 00:00 UTC (futures, forex), and a week or a "nD"
 * period shortened by a holiday is only seen through the bars. Before the first bar the port has no trading days:
 * the first period of the bars (the first year for "nD" on symbols that do not trade every day) can differ.
 *
 * The calendar functions run a script of the library (`executeScript`), which clears the drawing registry of the
 * library: a port that draws with the library objects calls them before its own run.
 */

import { barInterval, timeframe, type Bar } from 'oakscriptjs';
import {
  executeScript, barmerge, request, ta as scriptTa, close as scriptClose,
  time as scriptTime, time_tradingday as scriptTradingDay, session as scriptSession,
} from 'oakscriptjs/script';
import type { ChartContext } from './chart-context';

const DAY = 86400000;
const WEEK = 7 * DAY;

/** True when the context gives the exchange calendar: the time zone and the session of the symbol. */
export function hasCalendar(chart?: ChartContext): boolean {
  return !!chart && !!chart.timezone && !!chart.session;
}

/**
 * The bars and the context of a library run for the exchange calendar, or null when the context does not give the
 * time zone and the session (or the chart timeframe is not known: fewer than 2 bars without `chart.timeframe`).
 * The library only reads the bar times here: the prices are 1, so that a cumulative sum counts the bars.
 */
function calendarOf(
  bars: ReadonlyArray<{ time: number }>,
  chart?: ChartContext,
): { bars: Bar[]; chart: ChartContext; unit: number } | null {
  if (!chart || !hasCalendar(chart) || bars.length === 0) return null;
  const tf = chartTimeframe(bars, chart);
  if (tf === '') return null;
  const ms = bars[0].time >= 1e12;
  const context: ChartContext = {
    timeframe: tf, timezone: chart.timezone, session: chart.session, regularSession: chart.regularSession,
    sessionType: chart.sessionType, timeUnit: ms ? 'ms' : 's',
  };
  const flat = (b: { time: number }): Bar => ({ time: b.time, open: 1, high: 1, low: 1, close: 1, volume: 1 });
  // a time zone or a session that the library does not read: no calendar, the caller uses the bars
  let readable = readableCalendars.get(chart);
  if (readable === undefined) {
    try {
      executeScript(() => { values(scriptTime('1D')); }, [flat(bars[0])], {}, context);
      readable = true;
    } catch {
      readable = false;
    }
    readableCalendars.set(chart, readable);
  }
  return readable ? { bars: bars.map(flat), chart: context, unit: ms ? 1 : 1000 } : null;
}

const readableCalendars = new WeakMap<ChartContext, boolean>();

const values = (s: { toArray(): ArrayLike<number | null | undefined> }): number[] =>
  Array.from(s.toArray(), (v) => v ?? NaN);

/** Start (UNIX ms, UTC) of the D / W / M calendar period that contains the day `day` (00:00 UTC, ms). */
function calendarPeriodStart(day: number, info: ReturnType<typeof timeframe.info>): number {
  const n = info.multiplier;
  const d = new Date(day);
  const year = d.getUTCFullYear();
  if (info.isdaily) {
    if (n === 1) return day;
    const jan1 = Date.UTC(year, 0, 1);
    return jan1 + Math.floor((day - jan1) / DAY / n) * n * DAY;
  }
  if (info.isweekly) {
    const monday = day - ((d.getUTCDay() + 6) % 7) * DAY;
    if (n === 1) return monday;
    const jan1 = Date.UTC(new Date(monday).getUTCFullYear(), 0, 1);
    const firstMonday = jan1 + ((8 - new Date(jan1).getUTCDay()) % 7) * DAY;
    return firstMonday + Math.floor((monday - firstMonday) / WEEK / n) * n * WEEK;
  }
  return Date.UTC(year, Math.floor(d.getUTCMonth() / n) * n, 1);
}

/**
 * PineScript `time(tf)` of each bar: the start of the `tf` period that contains the bar, in the unit of the bar
 * times (seconds as lightweight-charts, or ms). A bar opens a new period (`timeframe.change(tf)`) when its value
 * differs from the previous bar's. `tf` = "" (the chart timeframe) gives the bar times.
 * @throws RangeError for a string that is not a timeframe, or a tick timeframe
 */
export function periodStarts(bars: ReadonlyArray<{ time: number }>, tf: string, chart?: ChartContext): number[] {
  if (tf.trim() === '') return bars.map((b) => b.time);
  const info = timeframe.info(tf);
  if (info.isticks) throw new RangeError(`Unsupported timeframe "${tf}"`);
  const calendar = calendarOf(bars, chart);
  if (calendar) {
    // time(tf) of the library; a bar for which the calendar finds no trading day is its own period
    let startMs: number[] = [];
    executeScript(() => { startMs = values(scriptTime(tf)); }, calendar.bars, {}, calendar.chart);
    return startMs.map((t, i) => (Number.isNaN(t) ? bars[i].time : t / calendar.unit));
  }
  const ms = bars.length > 0 && bars[0].time >= 1e12;
  const times = bars.map((b) => (ms ? b.time : b.time * 1000));
  const weekend = (t: number) => {
    const wd = new Date(t).getUTCDay();
    return wd === 0 || wd === 6;
  };
  const everyDay = times.some(weekend);
  const len = info.isintraday ? timeframe.in_seconds(tf) * 1000 : 0;

  const out: number[] = [];
  let prevDay = NaN;
  let sessionStart = NaN;
  let prevKey = NaN;
  let start = NaN;
  let tradingYear = NaN;
  let tradingDays = -1;
  let prevTradingDay = NaN;
  for (const t of times) {
    const day = Math.floor(t / DAY) * DAY;
    if (day !== prevDay) sessionStart = everyDay ? day : t;
    prevDay = day;
    if (info.isintraday) {
      start = len >= DAY ? sessionStart : sessionStart + Math.floor((t - sessionStart) / len) * len;
    } else if (info.isdaily && info.multiplier > 1 && !everyDay) {
      // n trading days (UTC days with bars) counted from the first trading day of the year
      const year = new Date(day).getUTCFullYear();
      if (year !== tradingYear) {
        tradingYear = year;
        tradingDays = -1;
      }
      if (day !== prevTradingDay) {
        tradingDays++;
        prevTradingDay = day;
        if (tradingDays % info.multiplier === 0) start = t;
      }
    } else {
      const key = calendarPeriodStart(day, info);
      if (key !== prevKey) start = everyDay ? key : t;
      prevKey = key;
    }
    out.push(ms ? start : Math.floor(start / 1000));
  }
  return out;
}

/**
 * Chart timeframe of the bars ("1", "60", "1D", "1W", "1M", ...): `chart.timeframe` when the context gives it, else
 * from the most frequent gap between two bars (`barInterval`): one day on daily bars even with weekends and
 * holidays, 28 to 31 days on monthly bars. Empty string with fewer than 2 bars and no context value.
 */
export function chartTimeframe(bars: ReadonlyArray<{ time: number }>, chart?: ChartContext): string {
  if (chart?.timeframe) return timeframe.info(chart.timeframe).period;
  const gap = barInterval(bars);
  const s = Math.round(bars.length > 0 && bars[0].time >= 1e12 ? gap / 1000 : gap);
  if (!(s > 0)) return '';
  if (s < 86400) return timeframe.from_seconds(s);
  if (s < 7 * 86400) return `${Math.round(s / 86400)}D`;
  if (s < 28 * 86400) return `${Math.round(s / (7 * 86400))}W`;
  return `${Math.max(1, Math.round(s / timeframe.in_seconds('1M')))}M`;
}

/** Periods of a higher timeframe on the chart bars, as `request.security` on the chart symbol sees them. */
export interface SecurityPeriods {
  /** Start of the period of each chart bar, in the unit of the bar times (D / W / M periods follow the regular hours) */
  starts: number[];
  /** Index of the period of each chart bar (0 for the first period of the bars) */
  group: number[];
  /** Index of the latest completed period at each chart bar (-1: none yet): the value shown without lookahead */
  latest: number[];
  /**
   * True for a chart bar that comes after the bar that completed its period (the premarket bars of the next trading
   * day on extended-hours bars): it still shows the period but is not part of its higher-timeframe bar
   */
  after: boolean[];
  /** True when the last bar completes its period */
  lastCompletes: boolean;
}

/**
 * The periods of timeframe `tf` as PineScript `request.security(syminfo.tickerid, tf, ...)` builds them, from the
 * exchange calendar of the context: a period is complete on the chart bar whose close reaches its end (the session
 * end of its last trading day for D / W / M), or on the first bar of the next period when its last bars are
 * missing. Null when the context does not give the time zone and the session: the caller keeps its own rule.
 * @throws Error when `tf` is lower than the chart timeframe
 */
export function securityPeriods(
  bars: ReadonlyArray<{ time: number }>,
  tf: string,
  chart?: ChartContext,
): SecurityPeriods | null {
  const calendar = calendarOf(bars, chart);
  if (!calendar) return null;
  const n = bars.length;
  let startMs: number[] = [];
  let group: number[] = [];
  let latest: number[] = [];
  executeScript(() => {
    // on the bars of the timeframe: the bar time and the bar count (the close of every bar is 1)
    const period = () => [scriptTime, scriptTa.cum(scriptClose)] as [typeof scriptClose, typeof scriptClose];
    const [start, count] = request.security('', tf, period, barmerge.gaps_off, barmerge.lookahead_on);
    const [, done] = request.security('', tf, period, barmerge.gaps_off, barmerge.lookahead_off);
    startMs = values(start);
    group = values(count).map((c) => c - 1);
    latest = values(done).map((c) => (Number.isNaN(c) ? -1 : c - 1));
  }, calendar.bars, {}, calendar.chart);
  return {
    starts: startMs.map((t, i) => (Number.isNaN(t) ? bars[i].time : t / calendar.unit)),
    group,
    latest,
    after: group.map((g, i) => i > 0 && group[i - 1] === g && latest[i - 1] >= g),
    lastCompletes: n > 0 && latest[n - 1] === group[n - 1],
  };
}

/**
 * Period start of each chart bar for a port that groups the chart bars as `request.security(..., tf)` does: with
 * the exchange calendar of the context the starts of `securityPeriods` (D / W / M periods follow the regular
 * hours), else `periodStarts`. A timeframe below the chart timeframe gives `periodStarts` too.
 */
export function securityStarts(bars: ReadonlyArray<{ time: number }>, tf: string, chart?: ChartContext): number[] {
  if (tf.trim() !== '' && hasCalendar(chart)) {
    const chartTf = chartTimeframe(bars, chart);
    if (chartTf !== '' && timeframe.in_seconds(tf) >= timeframe.in_seconds(chartTf)) {
      const periods = securityPeriods(bars, tf, chart);
      if (periods) return periods.starts;
    }
  }
  return periodStarts(bars, tf, chart);
}

/** The periods of a higher timeframe with their bars. */
export interface SecurityBars extends SecurityPeriods {
  /**
   * Bars of the timeframe built from the chart bars (the bars `after` the completion of their period are left out);
   * `time` is the period start. `htf[group[i]]` is the bar of chart bar i, `htf[latest[i]]` the latest completed bar
   */
  htf: Bar[];
  /** Index of the first chart bar of each bar of the timeframe */
  first: number[];
}

/**
 * `securityPeriods` with the bars of the timeframe built from the chart bars (open of the first bar, highest high,
 * lowest low, close of the last bar, sum of the volumes). Null when the context does not give the time zone and
 * the session.
 * @throws Error when `tf` is lower than the chart timeframe
 */
export function securityBars(bars: ReadonlyArray<Bar>, tf: string, chart?: ChartContext): SecurityBars | null {
  const periods = securityPeriods(bars, tf, chart);
  if (!periods) return null;
  const htf: Bar[] = [];
  const first: number[] = [];
  bars.forEach((b, i) => {
    const g = periods.group[i];
    if (g >= htf.length) {
      htf.push({ time: periods.starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
      first.push(i);
    } else if (!periods.after[i]) {
      const bar = htf[g];
      bar.high = Math.max(bar.high, b.high);
      bar.low = Math.min(bar.low, b.low);
      bar.close = b.close;
      bar.volume = (bar.volume ?? NaN) + (b.volume ?? NaN);
    }
  });
  return { ...periods, htf, first };
}

/** PineScript `session.*` flags of each bar. */
export interface SessionFlags {
  isfirstbar: boolean[];
  islastbar: boolean[];
  ismarket: boolean[];
  ispremarket: boolean[];
  ispostmarket: boolean[];
  isfirstbar_regular: boolean[];
  islastbar_regular: boolean[];
}

/**
 * PineScript `session.isfirstbar`, `session.islastbar`, `session.ismarket` ... of each bar, from the exchange
 * calendar of the context. Null when the context does not give the time zone and the session.
 */
export function sessionFlags(bars: ReadonlyArray<{ time: number }>, chart?: ChartContext): SessionFlags | null {
  const calendar = calendarOf(bars, chart);
  if (!calendar) return null;
  const flags = {} as SessionFlags;
  const keys = [
    'isfirstbar', 'islastbar', 'ismarket', 'ispremarket', 'ispostmarket', 'isfirstbar_regular', 'islastbar_regular',
  ] as const;
  let dayStart: number[] = [];
  executeScript(() => {
    for (const key of keys) flags[key] = values(scriptSession[key]).map((v) => v !== 0);
    dayStart = values(scriptTime('1D'));
  }, calendar.bars, {}, calendar.chart);
  // The library takes the first loaded bar as the first bar of its session. On intraday bars that start inside a
  // session (the bars before are not loaded) the original gives false: bar 0 is a first bar only at the session start
  if (!timeframe.info(calendar.chart.timeframe ?? '').isdwm && dayStart[0] !== bars[0].time * calendar.unit) {
    flags.isfirstbar[0] = false;
    flags.isfirstbar_regular[0] = false;
  }
  return flags;
}

/**
 * PineScript `time_tradingday` of each bar: 00:00 UTC of its trading day (on W / M bars, of the last trading day of
 * the bar), in the unit of the bar times. Null when the context does not give the time zone and the session.
 */
export function tradingDays(bars: ReadonlyArray<{ time: number }>, chart?: ChartContext): number[] | null {
  const calendar = calendarOf(bars, chart);
  if (!calendar) return null;
  let days: number[] = [];
  executeScript(() => { days = values(scriptTradingDay); }, calendar.bars, {}, calendar.chart);
  return days.map((t) => t / calendar.unit);
}
