/**
 * ORB - Opening Range Breakout
 *
 * High and low of the opening range: the bars inside the session "Session Time" (every day of the week). On the
 * first bar of the session the range is the high and the low of that bar; on the next bars of the session it grows
 * with each new high or low. After the session the two levels stay until the next session starts. The levels are
 * only shown on intraday bars whose timeframe (in minutes) is not above "ORB total time (minutes)". A line has no
 * colour on the bar where its level changes.
 *
 * The session hours are read in the exchange time zone of the symbol, given by the optional third argument (see
 * src/chart-context.ts); without it they are read in UTC.
 *
 * Reference: "ORB" by zzzcrypto123
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { time as pineTime, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { chartTimeframe } from '../anchor-period';
import { timezoneOf, type ChartContext } from '../chart-context';

export interface OrbOpeningRangeBreakoutInputs {
  /** Highest chart timeframe (minutes) that shows the levels */
  inputMax: number;
  /** Session of the opening range */
  sess: string;
}

export const defaultInputs: OrbOpeningRangeBreakoutInputs = {
  inputMax: 5,
  sess: '0915-0920',
};

export const inputConfig: InputConfig[] = [
  { id: 'inputMax', type: 'int', title: 'ORB total time (minutes)', defval: 5 },
  { id: 'sess', type: 'session', title: 'Session Time', defval: '0915-0920' },
];

const GREEN = '#4CAF50';
const RED = '#FF5252';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ORB High', color: GREEN, lineWidth: 2 },
  { id: 'plot1', title: 'ORB Low', color: RED, lineWidth: 2 },
];

export const metadata = {
  title: 'ORB',
  shortTitle: 'ORB',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10; a != b when they differ by more (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<OrbOpeningRangeBreakoutInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const inMs = n > 0 && bars[0].time >= 1e12;
  // hide = timeframe.isintraday and timeframe.multiplier <= inputMax
  const tf = chartTimeframe(bars);
  const info = tf === '' ? null : timeframe.info(tf);
  const hide = info !== null && info.isintraday && info.multiplier <= cfg.inputMax;
  // t = time(timeframe.period, sess + ":1234567")
  const session = `${cfg.sess}:1234567`;
  const timezone = timezoneOf(chart);

  const plot0: Array<{ time: number; value: number; color?: string }> = [];
  const plot1: Array<{ time: number; value: number; color?: string }> = [];
  let prevIn = false;
  let prevHigh = NaN;
  let prevLow = NaN;
  for (let i = 0; i < n; i++) {
    const { time, high, low } = bars[i];
    const inSession = pineTime.inSession(inMs ? time : time * 1000, session, timezone);
    const isFirst = inSession && !prevIn;
    let orbHigh = isFirst ? high : prevHigh;
    let orbLow = isFirst ? low : prevLow;
    if (gt(high, orbHigh) && inSession) orbHigh = high;
    if (gt(orbLow, low) && inSession) orbLow = low;
    // color = orb_high[1] != orb_high ? na : color.green
    plot0.push({ time, value: hide ? orbHigh : NaN, color: ne(prevHigh, orbHigh) ? 'transparent' : GREEN });
    plot1.push({ time, value: hide ? orbLow : NaN, color: ne(prevLow, orbLow) ? 'transparent' : RED });
    prevIn = inSession;
    prevHigh = orbHigh;
    prevLow = orbLow;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
  };
}

export const OrbOpeningRangeBreakout = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
