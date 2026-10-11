/**
 * Opening Range Breakout with 2 Profit Targets
 *
 * The opening range is the high and the low of the first bar of the session, taken on the "Length Of Opening Range"
 * timeframe (60 minutes by default: the first hour). Two profit targets sit above and below the range at a
 * multiple of its height (input value * 0.1). The six levels are drawn as circles while the chart bar is inside the
 * session, with a silver background and a fill between the two range lines. A level turns lime (red for the range
 * low) on the bars that trade through it. A "1" or a "2" marks the bar that reaches target 1 or 2 after five bars
 * that did not.
 *
 * Rules of the original (a version 1 script) kept by the port:
 * - a session without days runs from Monday to Friday; a bar is inside the session when it opens inside it
 * - the trading day of a session starts at the session start (for "1700-1600": at 17:00 of the day before). The
 *   range starts on a range-timeframe bar whose trading day differs from the trading day of the bar before it, both
 *   bars being inside the session. When the symbol has bars between two sessions (e.g. "0930-1600" or "1700-1600"
 *   on a symbol that trades all day), no range ever starts: only the background is drawn
 * - session 0 (24 hours): the range starts on the first range-timeframe bar of each day of the symbol
 * - every chart bar of a range-timeframe bar shows the final value of that bar: the range of the first hour is
 *   drawn from the first chart bar of the day
 *
 * Limits of the port:
 * - the bars of the range timeframe are built from the chart bars, so the range of the first day of the bars is
 *   not known (the original reads earlier bars of that timeframe)
 * - a range timeframe below the chart timeframe needs data that the bars do not carry: the port throws an Error
 *
 * Chart values (third argument): the exchange time zone, in which the session hours are read (without it: UTC),
 * the session of the symbol for the days and the bars of the range timeframe (without it: the UTC calendar and the
 * bars, see src/anchor-period.ts) and the chart timeframe (without it: taken from the bar spacing).
 *
 * Reference: "Opening Range Breakout with 2 Profit Targets." (_CM_Opening-Range-Final) by ChrisMoody
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, time, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { periodStarts, securityStarts, chartTimeframe } from '../anchor-period';
import type { MarkerData, BgColorData } from '../types';
import { timezoneOf, type ChartContext } from '../chart-context';

export interface OpeningRangeBreakoutWith2ProfitTargetsInputs {
  /** Session to use: 0 = 24 hours, 1 to 6 = one of the sessions below */
  sessNum: number;
  /** Separator of the settings dialog (no effect) */
  desc: boolean;
  forexUsBankingOpen: string;
  goldUsOpen: string;
  oilUsOpen: string;
  usStocksOpen: string;
  nyForexOpen: string;
  europeOpen: string;
  /** Profit target 1: multiple of the opening range * 0.1 */
  pt1: number;
  /** Profit target 2: multiple of the opening range * 0.1 */
  pt2: number;
  /** Timeframe of the opening range */
  res: string;
  /** Mark the bars where target 1 and target 2 are reached */
  snp: boolean;
}

export const defaultInputs: OpeningRangeBreakoutWith2ProfitTargetsInputs = {
  sessNum: 4,
  desc: false,
  forexUsBankingOpen: '0800-1700',
  goldUsOpen: '0820-1700',
  oilUsOpen: '0900-1700',
  usStocksOpen: '0930-1600',
  nyForexOpen: '1700-1600',
  europeOpen: '0200-1700',
  pt1: 5,
  pt2: 10,
  res: '60',
  snp: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'sessNum', type: 'int', title: 'Session to use (0 = 24 Hours, Other Numbers Listed Below)', defval: 4, min: 0, max: 6 },
  { id: 'desc', type: 'bool', title: 'Below---Line Plot Start Times and End Times---Change Input Above To Select', defval: false },
  { id: 'forexUsBankingOpen', type: 'session', title: '1 - Forex U.S. Banks Open -- ALL START TIMES = START OF OPENING RANGE!!!', defval: '0800-1700' },
  { id: 'goldUsOpen', type: 'session', title: '2 - Gold U.S. Open -- All End Times are when Lines Stop Plotting', defval: '0820-1700' },
  { id: 'oilUsOpen', type: 'session', title: '3 - Oil U.S. Open', defval: '0900-1700' },
  { id: 'usStocksOpen', type: 'session', title: '4 - U.S. Cash Cash Session - Stocks Session', defval: '0930-1600' },
  { id: 'nyForexOpen', type: 'session', title: '5 - NY Forex Open', defval: '1700-1600' },
  { id: 'europeOpen', type: 'session', title: '6 - Europe', defval: '0200-1700' },
  { id: 'pt1', type: 'int', title: 'Profit Target 1 - Multiple of Opening Range *.1, 5 = .5, 7 = .7, 10 = 1, 15 = 1.5 etc.', defval: 5, min: 1, max: 15 },
  { id: 'pt2', type: 'int', title: 'Profit Target 2 - Multiple of Opening Range *.1, 10 = 1, 15 = 1.5, 18 = 1.8, etc.', defval: 10, min: 1, max: 30 },
  { id: 'res', type: 'timeframe', title: 'Length Of Opening Range?', defval: '60' },
  { id: 'snp', type: 'bool', title: 'Plot 1 and 2 When 1st and 2nd Profit Target are Achieved?', defval: true },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const LIME = V1('#00FF00');
const YELLOW = V1('#FFFF00');
const RED = V1('#FF0000');
const FUCHSIA = V1('#FF00FF');
const AQUA = V1('#00FFFF');
const WHITE = String(color.new('#FFFFFF', 0));
const BG = String(color.new('#C0C0C0', 85));
const FILL = String(color.new('#C0C0C0', 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Opening Range High', color: YELLOW, lineWidth: 4, style: 'circles' },
  { id: 'plot1', title: 'Opening Range Low', color: YELLOW, lineWidth: 4, style: 'circles' },
  { id: 'plot2', title: 'Profit Target 1 High', color: FUCHSIA, lineWidth: 4, style: 'circles' },
  { id: 'plot3', title: 'Profit Target 1 Low', color: FUCHSIA, lineWidth: 4, style: 'circles' },
  { id: 'plot4', title: 'Profit Target 2 High', color: AQUA, lineWidth: 4, style: 'circles' },
  { id: 'plot5', title: 'Profit Target 2 Low', color: AQUA, lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: '_CM_Opening-Range-Final',
  shortTitle: '_CM_OpenRange_PlusTargets',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/**
 * security(tickerid, tf, ...) on the chart symbol: the first chart bar, the start time (unit of the bar times) and
 * the high / low of each bar of timeframe `tf`, and for each chart bar the index of its bar of that timeframe.
 */
function timeframeBars(
  bars: Bar[],
  tf: string,
  chartTf: string,
  chart: ChartContext | undefined,
): { first: number[]; start: number[]; high: number[]; low: number[]; group: number[] } {
  const same = tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf);
  if (!same && timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the bars do not carry that data.`);
  }
  const starts = same ? [] : securityStarts(bars, tf, chart);
  const first: number[] = [];
  const start: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (same || i === 0 || starts[i] !== starts[i - 1]) {
      first.push(i);
      start.push(same ? b.time : starts[i]);
      high.push(b.high);
      low.push(b.low);
    } else {
      const j = high.length - 1;
      high[j] = Math.max(high[j], b.high);
      low[j] = Math.min(low[j], b.low);
    }
    group.push(high.length - 1);
  });
  return { first, start, high, low, group };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<OpeningRangeBreakoutWith2ProfitTargetsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const tz = timezoneOf(chart);
  const chartTf = chartTimeframe(bars, chart);
  const ms = n > 0 && bars[0].time >= 1e12;

  // Session selection: 0 = no session (24 hours)
  const sessions = [cfg.forexUsBankingOpen, cfg.goldUsOpen, cfg.oilUsOpen, cfg.usStocksOpen, cfg.nyForexOpen, cfg.europeOpen];
  const picked = cfg.sessNum >= 1 && cfg.sessNum <= 6 ? sessions[cfg.sessNum - 1] : '0000-0000';
  // A version 1 session without days runs from Monday to Friday
  const sessToUse = picked.includes(':') ? picked : `${picked}:23456`;
  const allDay = cfg.sessNum === 0;
  /** time(tf, session) is not na: a bar that opens at `t` (unit of the bar times) is inside the session */
  const inSess = (t: number) => allDay || time.inSession(ms ? t : t * 1000, sessToUse, tz);

  // time('D', session): the start of the trading day of the session that contains the bar (the latest session
  // start at or before the bar; the first range of a session with several ranges), na outside the session.
  // time('D'): the start of the day of the symbol.
  const dayStarts = periodStarts(bars, 'D', chart);
  const startMin = (Number(picked.slice(0, 2)) * 60 + Number(picked.slice(2, 4))) % 1440;
  const minuteOfDay = (t: number) => time.hour(t, tz) * 60 + time.minute(t, tz);
  const sessionDay = (barTime: number, firstBar: number): number => {
    if (!inSess(barTime)) return NaN;
    if (allDay) return dayStarts[firstBar];
    const t = Math.floor((ms ? barTime : barTime * 1000) / 60000) * 60000;
    const start = t - (((minuteOfDay(t) - startMin) % 1440 + 1440) % 1440) * 60000;
    // a clock change between the session start and the bar moves the start by one hour
    for (const shift of [0, 3600000, -3600000]) {
      if (start + shift <= t && minuteOfDay(start + shift) === startMin) return start + shift;
    }
    return start;
  };

  // Range timeframe: bartimeSess = time('D', session), newbarSess = bartimeSess != bartimeSess[1] (false with na),
  // high_range = valuewhen(newbarSess, high, 0)
  const { first, start: tfStart, high: tfHigh, low: tfLow, group } = timeframeBars(bars, cfg.res, chartTf, chart);
  const highRange: number[] = [];
  const lowRange: number[] = [];
  let hr = NaN;
  let lr = NaN;
  for (let j = 0; j < first.length; j++) {
    const cur = sessionDay(tfStart[j], first[j]);
    const prev = j > 0 ? sessionDay(tfStart[j - 1], first[j - 1]) : NaN;
    if (!isNaN(cur) && !isNaN(prev) && cur !== prev) {
      hr = tfHigh[j];
      lr = tfLow[j];
    }
    highRange.push(hr);
    lowRange.push(lr);
  }

  const pft1 = cfg.pt1 * 0.1;
  const pft2 = cfg.pt2 * 0.1;
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);

  type Point = { time: number; value: number; color: string };
  const plots: Point[][] = [[], [], [], [], [], []];
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const mark = (t: number, position: 'aboveBar' | 'belowBar', text: string) => {
    markers.push({ time: t, position, shape: 'circle', color: 'transparent', text, textColor: WHITE });
  };

  for (let i = 0; i < n; i++) {
    const { high, low } = bars[i];
    const t = bars[i].time;
    const active = inSess(t);
    const highRes = highRange[group[i]];
    const lowRes = lowRange[group[i]];
    const range = highRes - lowRes;
    const highRes2 = highRes + range * pft1;
    const lowRes2 = lowRes - range * pft1;
    const highRes3 = highRes + range * pft2;
    const lowRes3 = lowRes - range * pft2;

    const show = (v: number) => (active ? v : NaN);
    plots[0].push({ time: t, value: show(highRes), color: gt(high, highRes) ? LIME : YELLOW });
    plots[1].push({ time: t, value: show(lowRes), color: lt(low, lowRes) ? RED : YELLOW });
    plots[2].push({ time: t, value: show(highRes2), color: gt(high, highRes2) ? LIME : FUCHSIA });
    plots[3].push({ time: t, value: show(lowRes2), color: lt(low, lowRes2) ? LIME : FUCHSIA });
    plots[4].push({ time: t, value: show(highRes3), color: gt(high, highRes3) ? LIME : AQUA });
    plots[5].push({ time: t, value: show(lowRes3), color: lt(low, lowRes3) ? LIME : AQUA });
    if (active) bgColors.push({ time: t, color: BG });

    // The level is reached on this bar and was not on the five bars before
    const upHit = (lvl: number) => ge(high, lvl) && [1, 2, 3, 4, 5].every((k) => lt(H(i - k), lvl));
    const downHit = (lvl: number) => le(low, lvl) && [1, 2, 3, 4, 5].every((k) => gt(L(i - k), lvl));
    if (cfg.snp && active) {
      if (upHit(highRes2)) mark(t, 'aboveBar', '1');
      if (downHit(lowRes2) && gt(low, lowRes3)) mark(t, 'belowBar', '1');
      if (upHit(highRes3)) mark(t, 'aboveBar', '2');
      if (downHit(lowRes3)) mark(t, 'belowBar', '2');
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: plots[0], plot1: plots[1], plot2: plots[2], plot3: plots[3], plot4: plots[4], plot5: plots[5] },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { color: FILL, title: 'Opening Range Fill' } }],
    markers,
    bgColors,
  };
}

export const OpeningRangeBreakoutWith2ProfitTargets = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
