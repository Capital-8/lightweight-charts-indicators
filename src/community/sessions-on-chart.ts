/**
 * Sessions on Chart
 *
 * Four trading sessions (London, New York, Tokyo, Sydney), each with its own hours read in New York time. On the
 * bars inside a session the script keeps the low and the high of the session; they restart when a new period of the
 * "Resolution" timeframe (day, week or month) starts.
 * Display: the background of the session bars takes the session colour, or, with "Activate High/Low View", the area
 * between the session low and the session high is filled instead. The low and high plots themselves are invisible.
 *
 * The periods of "Resolution" are counted on the trading days of the session itself, in New York time: a session
 * that goes over midnight is one trading day (the day it ends). The low and high restart on the first session bar
 * of a new period only: with "D" once per trading day (the second part of a session in two parts has no low / high),
 * with "W" / "M" on the first session of the week / month (the other sessions have no low / high).
 * `time(res, session, timezone)` comes from the session calendar of the library (clock-change days placed as in the
 * original), except "D" for a session in several runs, see `pausedDayTime`.
 *
 * Reference: "Sessions" by Aurocks_AIF
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Aurocks_AIF
 */

import {
  barInterval, color, timeframe, time as pineTime, periodTime, SessionBars, TradingCalendar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SessionContext,
} from 'oakscriptjs';
import { chartTimeframe } from '../anchor-period';
import type { BgColorData } from '../types';

export interface SessionsOnChartInputs {
  /** Fill the area between the session low and high instead of the background */
  bgColor: boolean;
  /** Timeframe whose new period restarts the session low / high */
  res: 'D' | 'W' | 'M';
  london: string;
  ny: string;
  tokyo: string;
  sydney: string;
  London: boolean;
  NY: boolean;
  Tokyo: boolean;
  Sydney: boolean;
}

export const defaultInputs: SessionsOnChartInputs = {
  bgColor: false,
  res: 'D',
  london: '0300-1200:1234567',
  ny: '0800-1700:1234567',
  tokyo: '2000-0400:1234567',
  sydney: '1700-0200:1234567',
  London: true,
  NY: true,
  Tokyo: true,
  Sydney: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'bgColor', type: 'bool', title: 'Activate High/Low View', defval: false },
  { id: 'res', type: 'timeframe', title: 'Resolution', defval: 'D', options: ['D', 'W', 'M'] },
  { id: 'london', type: 'session', title: 'London Session', defval: '0300-1200:1234567' },
  { id: 'ny', type: 'session', title: 'New York Session', defval: '0800-1700:1234567' },
  { id: 'tokyo', type: 'session', title: 'Tokyo Session', defval: '2000-0400:1234567' },
  { id: 'sydney', type: 'session', title: 'Sydney Session', defval: '1700-0200:1234567' },
  { id: 'London', type: 'bool', title: 'London Session', defval: true },
  { id: 'NY', type: 'bool', title: 'New York Session', defval: true },
  { id: 'Tokyo', type: 'bool', title: 'Tokyo Session', defval: true },
  { id: 'Sydney', type: 'bool', title: 'Sydney Session', defval: false },
];

const INVISIBLE = String(color.new('#000000', 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'London Low', color: INVISIBLE, lineWidth: 1 },
  { id: 'plot1', title: 'London High', color: INVISIBLE, lineWidth: 1 },
  { id: 'plot2', title: 'New York Low', color: INVISIBLE, lineWidth: 1 },
  { id: 'plot3', title: 'New York High', color: INVISIBLE, lineWidth: 1 },
  { id: 'plot4', title: 'Tokyo Low', color: INVISIBLE, lineWidth: 1 },
  { id: 'plot5', title: 'Tokyo High', color: INVISIBLE, lineWidth: 1 },
  { id: 'plot6', title: 'Sydney Low', color: INVISIBLE, lineWidth: 1 },
  { id: 'plot7', title: 'Sydney High', color: INVISIBLE, lineWidth: 1 },
];

export const metadata = {
  title: 'Sessions',
  shortTitle: 'Sessions',
  overlay: true,
};

const TIMEZONE = 'America/New_York';
// color.new(color.green / red / yellow / blue, 90) of Pine v5
const LONDON_COLOR = String(color.new('#4CAF50', 90));
const NY_COLOR = String(color.new('#FF5252', 90));
const ASIA_COLOR = String(color.new('#FFEB3B', 90));
const SYDNEY_COLOR = String(color.new('#2962FF', 90));

const DAY = 86400000;

/**
 * time(tf, session, "America/New_York") of a bar (ms), from the session as a PineScript session calendar of the
 * library: an intraday timeframe is na outside the session (time.inSession); "D" tests the bar against the day's
 * session period (clock-change days placed as PineScript does); "W" / "M" have no session test and keep the period's
 * time (a bar between two sessions of a week is in that week).
 */
function sessionTime(session: string, tf: string, chartTf: string, barMs: number | undefined): (tMs: number) => number {
  const info = timeframe.info(tf);
  if (info.isintraday) return (tMs) => (pineTime.inSession(tMs, session, TIMEZONE, barMs) ? tMs : NaN);
  const daily = info.isdaily && info.multiplier === 1;
  if (daily && hasPause(session)) return pausedDayTime(session, chartTf, barMs);
  const cal = new SessionBars(new TradingCalendar(TIMEZONE, { session }, 'pine', true), chartTf);
  if (daily) return (tMs) => (cal.inside(tMs) ? cal.timeOf(tMs, tf) : NaN);
  return (tMs) => cal.timeOf(tMs, tf);
}

/** True when a section of the session string has several runs ("0900-1200,1300-1500"). */
function hasPause(session: string): boolean {
  return session.split('|').some((section) => section.split(':')[0].split(',').filter((r) => r.trim() !== '').length > 1);
}

/**
 * time("D", session, "America/New_York") of a session in several runs, own code: the library's "D" test is na in the
 * pause between two runs of the day, where the original keeps the day (BTCUSD 60, Tokyo "0900-1200,1300-1500": the
 * run from 13:00 New York time starts no new low / high in the reference). The day of the last session bar is kept
 * on the bars outside the session; on the first bar, the day of the session bars around it (or na between two days).
 */
function pausedDayTime(session: string, chartTf: string, barMs: number | undefined): (tMs: number) => number {
  const ctx: SessionContext = { timeframe: chartTf, timezone: TIMEZONE, session, timeUnit: 'ms' };
  let kept: number | undefined;
  return (tMs) => {
    if (pineTime.inSession(tMs, session, TIMEZONE, barMs)) kept = periodTime(tMs, 'D', ctx);
    else if (kept === undefined) kept = periodAround(tMs, session, ctx, barMs);
    return kept;
  };
}

/** The day of the session bars before and after a bar outside the session, or NaN when they differ. */
function periodAround(tMs: number, session: string, ctx: SessionContext, barMs: number | undefined): number {
  const MINUTE = 60000;
  const LIMIT = 8 * 1440;
  const find = (step: number) => {
    for (let k = 1; k <= LIMIT; k++) {
      const t = tMs + k * step;
      if (pineTime.inSession(t, session, TIMEZONE, barMs)) return periodTime(t, 'D', ctx);
    }
    return NaN;
  };
  const before = find(-MINUTE);
  if (Number.isNaN(before)) return NaN;
  return find(MINUTE) === before ? before : NaN;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SessionsOnChartInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const inMs = n > 0 && bars[0].time >= 1e12;
  const res = cfg.res.replace(/^1/, '');
  // bar size in ms on intraday bars, for the clock-change rule of time.inSession
  const interval = barInterval(bars) * (inMs ? 1 : 1000);
  const barMs = interval > 0 && interval < DAY ? interval : undefined;
  const chartTf = chartTimeframe(bars) || '1D';

  const sessions = [
    { hours: cfg.london, show: cfg.London, col: LONDON_COLOR },
    { hours: cfg.ny, show: cfg.NY, col: NY_COLOR },
    { hours: cfg.tokyo, show: cfg.Tokyo, col: ASIA_COLOR },
    { hours: cfg.sydney, show: cfg.Sydney, col: SYDNEY_COLOR },
  ].map((s) => ({
    ...s,
    // is_session(): time(timeframe.period, sess, "America/New_York"); is_newbar(): time(res, sess, ...)
    sessionT: sessionTime(s.hours, chartTf, chartTf, barMs),
    periodT: sessionTime(s.hours, res, chartTf, barMs),
    prevT: NaN,
    low: NaN,
    high: NaN,
    fill: [] as string[],
  }));

  const plots: Record<string, Array<{ time: number; value: number }>> = {};
  for (let k = 0; k < 8; k++) plots[`plot${k}`] = [];
  const bgColors: BgColorData[] = [];

  for (let i = 0; i < n; i++) {
    const { time, high, low } = bars[i];
    const tMs = inMs ? time : time * 1000;
    sessions.forEach((s, k) => {
      // is_session(): not na(time(timeframe.period, sess, "America/New_York"))
      const inSession = !Number.isNaN(s.sessionT(tMs));
      // is_newbar(): t = time(res, sess, "America/New_York"); na(t[1]) and not na(t) or t[1] < t
      const t = s.periodT(tMs);
      const newBar = (Number.isNaN(s.prevT) && !Number.isNaN(t)) || s.prevT < t;
      s.prevT = t;
      // float low = na; low := if session (if newbar low else math.min(low[1], low)) else low
      if (inSession) {
        s.low = newBar ? low : Math.min(s.low, low);
        s.high = newBar ? high : Math.max(s.high, high);
      } else {
        s.low = NaN;
        s.high = NaN;
      }
      plots[`plot${2 * k}`].push({ time, value: s.low });
      plots[`plot${2 * k + 1}`].push({ time, value: s.high });
      const on = inSession && s.show;
      s.fill.push(on && cfg.bgColor ? s.col : 'transparent');
      if (on && !cfg.bgColor) bgColors.push({ time, color: s.col });
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: sessions.map((s, k) => ({ plot1: `plot${2 * k}`, plot2: `plot${2 * k + 1}`, colors: s.fill })),
    bgColors,
  };
}

export const SessionsOnChart = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
