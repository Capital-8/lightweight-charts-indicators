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
 *
 * Reference: "Sessions" by Aurocks_AIF
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Aurocks_AIF
 */

import {
  barInterval, color, periodTime, time as pineTime,
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
 * time(res, session, "America/New_York") of a bar outside the session: the session bars of one period make one bar
 * of the "Resolution" timeframe, and a chart bar between the first and the last session bar of a period is inside
 * that bar (the pause of a session in two parts with "D", the hours between two sessions of a week with "W"). Gives
 * the period, or NaN when the chart bar is between two periods. Only needed on the first bar: afterwards the period
 * of the last session bar is kept. (The library gives na outside the session: own code.)
 */
function periodAround(tMs: number, session: string, res: string, ctx: SessionContext, barMs: number | undefined): number {
  const MINUTE = 60000;
  const LIMIT = 8 * 1440;
  const find = (step: number) => {
    for (let k = 1; k <= LIMIT; k++) {
      const t = tMs + k * step;
      if (pineTime.inSession(t, session, TIMEZONE, barMs)) return periodTime(t, res, ctx);
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
  const chartTf = chartTimeframe(bars);

  const sessions = [
    { hours: cfg.london, show: cfg.London, col: LONDON_COLOR },
    { hours: cfg.ny, show: cfg.NY, col: NY_COLOR },
    { hours: cfg.tokyo, show: cfg.Tokyo, col: ASIA_COLOR },
    { hours: cfg.sydney, show: cfg.Sydney, col: SYDNEY_COLOR },
  ].map((s) => ({
    ...s,
    // the session as its own calendar, read in New York time (bar times in ms): periodTime gives time(res, session)
    ctx: { timeframe: chartTf, timezone: TIMEZONE, session: s.hours, timeUnit: 'ms' } as SessionContext,
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
      const inSession = pineTime.inSession(tMs, s.hours, TIMEZONE, barMs);
      // is_newbar(): t = time(res, sess, "America/New_York"); na(t[1]) and not na(t) or t[1] < t
      // t is the period of the last bar inside the session (it keeps its value on the bars outside the session)
      let newBar = false;
      if (i === 0 && !inSession) s.prevT = periodAround(tMs, s.hours, res, s.ctx, barMs);
      if (inSession) {
        // the period of the trading day of the bar (a session over midnight belongs to the day it ends)
        const t = periodTime(tMs, res, s.ctx);
        newBar = Number.isNaN(s.prevT) || s.prevT < t;
        s.prevT = t;
      }
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
