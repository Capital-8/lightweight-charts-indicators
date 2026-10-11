/**
 * Key Levels SpacemanBTC IDWM
 *
 * Horizontal key levels of higher timeframes of the same symbol, drawn on the last bar as a line from the start of
 * the period to a point right of the last bar, with a text label at its right end:
 * - 4 hours, day, week, month, quarter: the open of the current period, the high / low of the previous period and
 *   their middle
 * - year: the open, the high / low so far and their middle
 * - Monday range: the high, low and middle of the first day of the current week
 * - FX sessions (London / New York / Asia ranges, off by default): the open, high and low of the latest session
 * With "Merge Levels?" the labels of levels at the same price are joined into one text ("A / B").
 * "Right Anchored" starts every line at a fixed distance right of the last bar instead of the period start.
 *
 * Limits of the port:
 * - The periods are built from the chart bars with the UTC calendar (see src/anchor-period.ts). A level needs its
 *   whole period in the bars (e.g. the high of the year needs the bars since the start of the year).
 * - A level of a timeframe that the chart bars cannot build needs data that the bars do not carry: the port throws
 *   an Error. That is a timeframe below the chart timeframe (e.g. the day on weekly bars) or one whose periods do
 *   not start on a chart bar (e.g. the month, quarter and year on weekly bars, 4 hours on 3-hour bars).
 *
 * Chart values read from the optional third argument:
 * - the current time (`now`): the right end of the lines is the current time plus "Distance" times the gap between
 *   the last two bars. Without it the port reads the clock of the computer.
 * - the exchange time zone (`timezone`): the hours of the FX sessions are read in it. Without it the port throws an
 *   Error when one of the three FX session ranges is switched on.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Key Levels SpacemanBTC IDWM" by spacemanbtc
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { array, timeframe, time as pineTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData, LabelData, PineSize } from '../types';
import { securityStarts, chartTimeframe } from '../anchor-period';
import { nowOf, type ChartContext } from '../chart-context';

export interface KeyLevelsSpacemanbtcIdwmInputs {
  displayStyle: 'Standard' | 'Right Anchored';
  mergeLevels: boolean;
  /** Right end of the lines, in bars after the current time */
  distanceRight: number;
  /** Start of the lines with "Right Anchored", in bars after the current time */
  anchorDistance: number;
  labelSize: 'Small' | 'Medium' | 'Large';
  lineSize: 'Small' | 'Medium' | 'Large';
  lineStyle: 'Solid' | 'Dashed' | 'Dotted';
  globalTextShortHand: boolean;
  globalColoring: boolean;
  globalColor: string;
  intraOpen: boolean;
  intraRange: boolean;
  intraMid: boolean;
  intraShortHand: boolean;
  dailyOpen: boolean;
  dailyRange: boolean;
  dailyMid: boolean;
  dailyShortHand: boolean;
  mondayRange: boolean;
  mondayMid: boolean;
  mondayShortHand: boolean;
  weeklyOpen: boolean;
  weeklyRange: boolean;
  weeklyMid: boolean;
  weeklyShortHand: boolean;
  monthlyOpen: boolean;
  monthlyRange: boolean;
  monthlyMid: boolean;
  monthlyShortHand: boolean;
  quarterlyOpen: boolean;
  quarterlyRange: boolean;
  quarterlyMid: boolean;
  quarterlyShortHand: boolean;
  yearlyOpen: boolean;
  yearlyRange: boolean;
  yearlyMid: boolean;
  yearlyShortHand: boolean;
  /** Not available in the port (throws) */
  londonRange: boolean;
  /** Not available in the port (throws) */
  newYorkRange: boolean;
  /** Not available in the port (throws) */
  asiaRange: boolean;
  sessionShortHand: boolean;
  londonSession: string;
  newYorkSession: string;
  tokyoSession: string;
  dailyColor: string;
  mondayColor: string;
  weeklyColor: string;
  monthlyColor: string;
  yearlyColor: string;
  quarterlyColor: string;
  intraColor: string;
  londonColor: string;
  newYorkColor: string;
  asiaColor: string;
}

export const defaultInputs: KeyLevelsSpacemanbtcIdwmInputs = {
  displayStyle: 'Standard',
  mergeLevels: true,
  distanceRight: 30,
  anchorDistance: 250,
  labelSize: 'Medium',
  lineSize: 'Small',
  lineStyle: 'Solid',
  globalTextShortHand: false,
  globalColoring: false,
  globalColor: '#FFFFFF',
  intraOpen: false,
  intraRange: false,
  intraMid: false,
  intraShortHand: false,
  dailyOpen: true,
  dailyRange: false,
  dailyMid: false,
  dailyShortHand: false,
  mondayRange: true,
  mondayMid: true,
  mondayShortHand: false,
  weeklyOpen: true,
  weeklyRange: true,
  weeklyMid: true,
  weeklyShortHand: false,
  monthlyOpen: true,
  monthlyRange: true,
  monthlyMid: true,
  monthlyShortHand: false,
  quarterlyOpen: true,
  quarterlyRange: false,
  quarterlyMid: true,
  quarterlyShortHand: false,
  yearlyOpen: true,
  yearlyRange: false,
  yearlyMid: true,
  yearlyShortHand: false,
  londonRange: false,
  newYorkRange: false,
  asiaRange: false,
  sessionShortHand: false,
  londonSession: '0800-1600',
  newYorkSession: '1400-2100',
  tokyoSession: '0000-0900',
  dailyColor: '#08bcd4',
  mondayColor: '#FFFFFF',
  weeklyColor: '#fffcbc',
  monthlyColor: '#08d48c',
  yearlyColor: '#FF5252',
  quarterlyColor: '#FF5252',
  intraColor: '#FF9800',
  londonColor: '#FFFFFF',
  newYorkColor: '#FFFFFF',
  asiaColor: '#FFFFFF',
};

const SIZES = ['Small', 'Medium', 'Large'];

export const inputConfig: InputConfig[] = [
  { id: 'displayStyle', type: 'string', title: 'Display Style', defval: 'Standard', options: ['Standard', 'Right Anchored'], inline: 'Display' },
  { id: 'mergeLevels', type: 'bool', title: 'Merge Levels?', defval: true, inline: 'Display' },
  { id: 'distanceRight', type: 'int', title: 'Distance', defval: 30, min: 5, max: 500, inline: 'Dist' },
  { id: 'anchorDistance', type: 'int', title: 'Anchor Distance', defval: 250, min: 5, max: 500, inline: 'Dist' },
  { id: 'labelSize', type: 'string', title: 'Text Size', defval: 'Medium', options: SIZES },
  { id: 'lineSize', type: 'string', title: 'Line Width', defval: 'Small', options: SIZES, inline: 'Line' },
  { id: 'lineStyle', type: 'string', title: 'Line Style', defval: 'Solid', options: ['Solid', 'Dashed', 'Dotted'], inline: 'Line' },
  { id: 'globalTextShortHand', type: 'bool', title: 'Global Text ShortHand', defval: false, tooltip: 'Enable for shorthand text on all text' },
  { id: 'globalColoring', type: 'bool', title: 'Global Coloring', defval: false, tooltip: 'Enable for all color controls via one color', inline: 'GC' },
  { id: 'globalColor', type: 'color', title: '', defval: '#FFFFFF', inline: 'GC' },
  { id: 'intraOpen', type: 'bool', title: 'Open', defval: false, group: '4H', inline: '4H' },
  { id: 'intraRange', type: 'bool', title: 'Prev H/L', defval: false, group: '4H', inline: '4H' },
  { id: 'intraMid', type: 'bool', title: 'Prev Mid', defval: false, group: '4H', inline: '4H' },
  { id: 'intraShortHand', type: 'bool', title: 'ShortHand', defval: false, group: '4H', inline: '4Hsh' },
  { id: 'dailyOpen', type: 'bool', title: 'Open', defval: true, group: 'Daily', inline: 'Daily' },
  { id: 'dailyRange', type: 'bool', title: 'Prev H/L', defval: false, group: 'Daily', inline: 'Daily' },
  { id: 'dailyMid', type: 'bool', title: 'Prev Mid', defval: false, group: 'Daily', inline: 'Daily' },
  { id: 'dailyShortHand', type: 'bool', title: 'ShortHand', defval: false, group: 'Daily', inline: 'Dailysh' },
  { id: 'mondayRange', type: 'bool', title: 'Range', defval: true, group: 'Monday Range', inline: 'Monday' },
  { id: 'mondayMid', type: 'bool', title: 'Mid', defval: true, group: 'Monday Range', inline: 'Monday' },
  { id: 'mondayShortHand', type: 'bool', title: 'ShortHand', defval: false, group: 'Monday Range', inline: 'Mondaysh' },
  { id: 'weeklyOpen', type: 'bool', title: 'Open', defval: true, group: 'Weekly', inline: 'Weekly' },
  { id: 'weeklyRange', type: 'bool', title: 'Prev H/L', defval: true, group: 'Weekly', inline: 'Weekly' },
  { id: 'weeklyMid', type: 'bool', title: 'Prev Mid', defval: true, group: 'Weekly', inline: 'Weekly' },
  { id: 'weeklyShortHand', type: 'bool', title: 'ShortHand', defval: false, group: 'Weekly', inline: 'Weeklysh' },
  { id: 'monthlyOpen', type: 'bool', title: 'Open', defval: true, group: 'Monthly', inline: 'Monthly' },
  { id: 'monthlyRange', type: 'bool', title: 'Prev H/L', defval: true, group: 'Monthly', inline: 'Monthly' },
  { id: 'monthlyMid', type: 'bool', title: 'Prev Mid', defval: true, group: 'Monthly', inline: 'Monthly' },
  { id: 'monthlyShortHand', type: 'bool', title: 'ShortHand', defval: false, group: 'Monthly', inline: 'Monthlysh' },
  { id: 'quarterlyOpen', type: 'bool', title: 'Open', defval: true, group: 'Quarterly', inline: 'Quarterly' },
  { id: 'quarterlyRange', type: 'bool', title: 'Prev H/L', defval: false, group: 'Quarterly', inline: 'Quarterly' },
  { id: 'quarterlyMid', type: 'bool', title: 'Prev Mid', defval: true, group: 'Quarterly', inline: 'Quarterly' },
  { id: 'quarterlyShortHand', type: 'bool', title: 'ShortHand', defval: false, group: 'Quarterly', inline: 'Quarterlysh' },
  { id: 'yearlyOpen', type: 'bool', title: 'Open', defval: true, group: 'Yearly', inline: 'Yearly' },
  { id: 'yearlyRange', type: 'bool', title: 'Current H/L', defval: false, group: 'Yearly', inline: 'Yearly' },
  { id: 'yearlyMid', type: 'bool', title: 'Mid', defval: true, group: 'Yearly', inline: 'Yearly' },
  { id: 'yearlyShortHand', type: 'bool', title: 'ShortHand', defval: false, group: 'Yearly', inline: 'Yearlysh' },
  { id: 'londonRange', type: 'bool', title: 'London Range', defval: false, group: 'FX Sessions', inline: 'FX' },
  { id: 'newYorkRange', type: 'bool', title: 'New York Range', defval: false, group: 'FX Sessions', inline: 'FX' },
  { id: 'asiaRange', type: 'bool', title: 'Asia Range', defval: false, group: 'FX Sessions', inline: 'FX' },
  { id: 'sessionShortHand', type: 'bool', title: 'ShortHand', defval: false, group: 'FX Sessions', inline: 'FXColor' },
  { id: 'londonSession', type: 'session', title: 'London Session', defval: '0800-1600' },
  { id: 'newYorkSession', type: 'session', title: 'New York Session', defval: '1400-2100' },
  { id: 'tokyoSession', type: 'session', title: 'Tokyo Session', defval: '0000-0900' },
  { id: 'dailyColor', type: 'color', title: '', defval: '#08bcd4', group: 'Daily', inline: 'Dailysh' },
  { id: 'mondayColor', type: 'color', title: '', defval: '#FFFFFF', group: 'Monday Range', inline: 'Mondaysh' },
  { id: 'weeklyColor', type: 'color', title: '', defval: '#fffcbc', group: 'Weekly', inline: 'Weeklysh' },
  { id: 'monthlyColor', type: 'color', title: '', defval: '#08d48c', group: 'Monthly', inline: 'Monthlysh' },
  { id: 'yearlyColor', type: 'color', title: '', defval: '#FF5252', group: 'Yearly', inline: 'Yearlysh' },
  { id: 'quarterlyColor', type: 'color', title: '', defval: '#FF5252', group: 'Quarterly', inline: 'Quarterlysh' },
  { id: 'intraColor', type: 'color', title: '', defval: '#FF9800', group: '4H', inline: '4Hsh' },
  { id: 'londonColor', type: 'color', title: '', defval: '#FFFFFF', group: 'FX Sessions', inline: 'FXColor' },
  { id: 'newYorkColor', type: 'color', title: '', defval: '#FFFFFF', group: 'FX Sessions', inline: 'FXColor' },
  { id: 'asiaColor', type: 'color', title: '', defval: '#FFFFFF', group: 'FX Sessions', inline: 'FXColor' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Key Levels SpacemanBTC IDWM',
  shortTitle: 'SpacemanBTC Key Level V13.1',
  overlay: true,
};

/** Values on the last bar of the requests on one timeframe (lookahead on) */
interface Period {
  /** Start time and open of the current period: [time, open] */
  time: number;
  open: number;
  /** High / low of the current period up to the last bar: [time, high], [time, low] */
  high: number;
  low: number;
  /** Previous period: [time[1], high[1]], [time[1], low[1]] (na when the bars have no previous period) */
  prevTime: number;
  prevHigh: number;
  prevLow: number;
  /** Period start of each chart bar */
  starts: number[];
}

/** Whether the bars of timeframe `tf` can be built from the bars of the chart timeframe `chart` */
function buildable(chart: string, tf: string): boolean {
  const c = timeframe.info(chart);
  const t = timeframe.info(tf);
  const cs = timeframe.in_seconds(chart);
  const ts = timeframe.in_seconds(tf);
  if (cs === ts) return true;
  if (ts < cs) return false;
  if (c.isintraday) return (t.isintraday ? ts : 86400) % cs === 0;
  if (c.isdaily) return c.multiplier === 1;
  if (c.isweekly) return t.isweekly && t.multiplier % c.multiplier === 0;
  return t.ismonthly && t.multiplier % c.multiplier === 0;
}

/** request.security(syminfo.tickerid, tf, ..., lookahead = barmerge.lookahead_on) on the last bar */
function periodOf(bars: Bar[], tf: string, chart: string, context?: ChartContext): Period {
  if (chart !== '' && !buildable(chart, tf)) {
    throw new Error(`Key Levels: the chart bars ("${chart}") cannot build the timeframe "${tf}": the bars do not carry that data.`);
  }
  const starts = securityStarts(bars, tf, context);
  const n = bars.length;
  let a = n - 1;
  while (a > 0 && starts[a - 1] === starts[n - 1]) a--;
  let high = NaN;
  let low = NaN;
  for (let i = a; i < n; i++) {
    high = i === a ? bars[i].high : Math.max(high, bars[i].high);
    low = i === a ? bars[i].low : Math.min(low, bars[i].low);
  }
  let prevTime = NaN;
  let prevHigh = NaN;
  let prevLow = NaN;
  if (a > 0) {
    prevTime = starts[a - 1];
    for (let i = a - 1; i >= 0 && starts[i] === prevTime; i--) {
      prevHigh = i === a - 1 ? bars[i].high : Math.max(prevHigh, bars[i].high);
      prevLow = i === a - 1 ? bars[i].low : Math.min(prevLow, bars[i].low);
    }
  }
  return { time: starts[n - 1], open: bars[a].open, high, low, prevTime, prevHigh, prevLow, starts };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<KeyLevelsSpacemanbtcIdwmInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const result = (): IndicatorResult => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines,
    labels,
  });

  // time(timeframe.period, session) of the London / New York / Tokyo sessions is read in the exchange time zone
  const exchangeZone = chart?.timezone;
  if ((cfg.londonRange || cfg.newYorkRange || cfg.asiaRange) && exchangeZone === undefined) {
    throw new Error('Key Levels: the FX session ranges need the exchange time zone of the symbol (chart.timezone), which the bars do not carry.');
  }
  if (n === 0) return result();

  const chartTf = chartTimeframe(bars, chart);
  const cache = new Map<string, Period>();
  const period = (tf: string): Period => {
    let p = cache.get(tf);
    if (!p) {
      p = periodOf(bars, tf, chartTf, chart);
      cache.set(tf, p);
    }
    return p;
  };

  // Monday range: the first day of the week (the first day of the bars before the first new week); the daily high
  // and low are requested with lookahead, so the whole day is known from its first bar
  let mondayTime = bars[0].time;
  let mondayHigh = bars[0].high;
  let mondayLow = bars[0].low;
  if (cfg.mondayRange) {
    const weeks = period('W').starts;
    const days = period('D').starts;
    let j = n - 1;
    while (j > 0 && weeks[j] === weeks[j - 1]) j--;
    mondayTime = days[j];
    mondayHigh = bars[j].high;
    mondayLow = bars[j].low;
    for (let i = j + 1; i < n && days[i] === days[j]; i++) {
      mondayHigh = Math.max(mondayHigh, bars[i].high);
      mondayLow = Math.min(mondayLow, bars[i].low);
    }
  }

  const colors = cfg.globalColoring
    ? { daily: cfg.globalColor, monday: cfg.globalColor, weekly: cfg.globalColor, monthly: cfg.globalColor,
      yearly: cfg.globalColor, quarterly: cfg.globalColor, intra: cfg.globalColor }
    : { daily: cfg.dailyColor, monday: cfg.mondayColor, weekly: cfg.weeklyColor, monthly: cfg.monthlyColor,
      yearly: cfg.yearlyColor, quarterly: cfg.quarterlyColor, intra: cfg.intraColor };
  const short = (own: boolean) => cfg.globalTextShortHand || own;
  const text = (own: boolean, shortText: string, longText: string) => (short(own) ? shortText : longText);

  const width = cfg.lineSize === 'Medium' ? 2 : cfg.lineSize === 'Large' ? 3 : 1;
  const size: PineSize = cfg.labelSize === 'Medium' ? 'normal' : cfg.labelSize === 'Large' ? 'large' : 'small';
  const style = cfg.lineStyle === 'Dashed' ? 'dashed' : cfg.lineStyle === 'Dotted' ? 'dotted' : 'solid';
  const rightAnchored = cfg.displayStyle === 'Right Anchored';

  // get_limit_right(bars) => timenow + (time - time[1]) * bars, in the unit of the bar times (seconds or ms)
  const ms = bars[0].time >= 1e12;
  const nowMs = nowOf(chart);
  const timenow = ms ? nowMs : Math.floor(nowMs / 1000);
  const gap = n > 1 ? bars[n - 1].time - bars[n - 2].time : NaN;
  const limitRight = (count: number) => timenow + gap * count;
  const right = limitRight(cfg.distanceRight);
  const anchor = limitRight(cfg.anchorDistance);

  // f_LevelMerge: a level at the price of an earlier level gives its text to the label of that level
  const priceArray = array.new_float(0);
  const labelArray: LabelData[] = [];
  const drawnLines: LineDrawingData[] = [];
  const drawnLabels: LabelData[] = [];
  const mergeLevel = (price: number, lb: LabelData, levelColor: string): void => {
    if (array.includes(priceArray, price)) {
      const hold = labelArray[array.indexof(priceArray, price)];
      hold.text = `${lb.text} / ${hold.text}`;
      lb.text = '';
      hold.textColor = levelColor;
    } else {
      array.push(priceArray, price);
      labelArray.push(lb);
    }
  };
  const level = (start: number, price: number, levelText: string, levelColor: string): void => {
    const x1 = rightAnchored ? anchor : start;
    const ln: LineDrawingData = { time1: x1, price1: price, time2: right, price2: price, color: levelColor, width, style };
    const lb: LabelData = { time: right, price, text: levelText, style: 'none', textColor: levelColor, size };
    drawnLines.push(ln);
    drawnLabels.push(lb);
    if (cfg.mergeLevels) mergeLevel(price, lb, levelColor);
  };

  // FX sessions: the range of the session in progress, or of the latest one, and the open of its first bar. A
  // session that is already running on the first bar keeps the time of that bar and an open of 0, as the original
  const sessionLevels = (session: string, color: string, high: string, low: string, open: string): void => {
    if (exchangeZone === undefined) return; // not reached: thrown above
    let currentHigh = 0.0;
    let currentLow = bars[0].close;
    let start = bars[0].time;
    let finalHigh = 0.0;
    let finalLow = 0.0;
    let finalOpen = 0.0;
    let wasOut = false;
    for (const bar of bars) {
      if (pineTime.inSession(ms ? bar.time : bar.time * 1000, session, exchangeZone)) {
        if (bar.high > currentHigh) currentHigh = bar.high;
        if (bar.low < currentLow) currentLow = bar.low;
        if (wasOut) {
          start = bar.time;
          finalOpen = bar.open;
        }
        finalHigh = currentHigh;
        finalLow = currentLow;
        wasOut = false;
      } else {
        if (!wasOut) {
          finalHigh = currentHigh;
          finalLow = currentLow;
        }
        wasOut = true;
        currentHigh = 0.0;
        currentLow = bar.close;
      }
    }
    // three lines and three labels, then the merge of the labels in the same order
    const first = drawnLabels.length;
    const prices = [finalHigh, finalLow, finalOpen];
    [high, low, open].forEach((levelText, k) => {
      drawnLines.push({ time1: rightAnchored ? anchor : start, price1: prices[k], time2: right, price2: prices[k], color, width, style });
      drawnLabels.push({ time: right, price: prices[k], text: levelText, style: 'none', textColor: color, size });
    });
    if (cfg.mergeLevels) prices.forEach((price, k) => mergeLevel(price, drawnLabels[first + k], color));
  };
  const sessionShort = short(cfg.sessionShortHand);
  if (cfg.londonRange) {
    sessionLevels(cfg.londonSession, cfg.londonColor, sessionShort ? 'Lon-H' : 'London High',
      sessionShort ? 'Lon-L' : 'London Low', sessionShort ? 'Lon-O' : 'London Open');
  }
  if (cfg.newYorkRange) {
    sessionLevels(cfg.newYorkSession, cfg.newYorkColor, sessionShort ? 'NY-H' : 'New York High',
      sessionShort ? 'NY-L' : 'New York Low', sessionShort ? 'NY-O' : 'New York Open');
  }
  if (cfg.asiaRange) {
    sessionLevels(cfg.tokyoSession, cfg.asiaColor, sessionShort ? 'AS-H' : 'Asia High',
      sessionShort ? 'AS-L' : 'Asia Low', sessionShort ? 'AS-O' : 'Asia Open');
  }

  // 4 hours
  if (cfg.intraOpen) {
    const p = period('240');
    level(p.time, p.open, text(cfg.intraShortHand, '4H-O', '4H Open'), colors.intra);
  }
  if (cfg.intraRange) {
    const p = period('240');
    level(p.prevTime, p.prevHigh, text(cfg.intraShortHand, 'P-4H-H', 'Prev 4H High'), colors.intra);
    level(p.prevTime, p.prevLow, text(cfg.intraShortHand, 'P-4H-L', 'Prev 4H Low'), colors.intra);
  }
  if (cfg.intraMid) {
    const p = period('240');
    level(p.prevTime, (p.prevLow + p.prevHigh) / 2, text(cfg.intraShortHand, 'P-4H-M', 'Prev 4H Mid'), colors.intra);
  }

  // Monday range
  if (cfg.mondayRange) {
    level(mondayTime, mondayHigh, text(cfg.mondayShortHand, 'MDAY-H', 'Monday High'), colors.monday);
    level(mondayTime, mondayLow, text(cfg.mondayShortHand, 'MDAY-L', 'Monday Low'), colors.monday);
  }
  if (cfg.mondayMid) {
    level(mondayTime, (mondayHigh + mondayLow) / 2, text(cfg.mondayShortHand, 'MDAY-M', 'Monday Mid'), colors.monday);
  }

  // Day
  if (cfg.dailyOpen) {
    const p = period('D');
    level(p.time, p.open, text(cfg.dailyShortHand, 'DO', 'Daily Open'), colors.daily);
  }
  if (cfg.dailyRange) {
    const p = period('D');
    level(p.prevTime, p.prevHigh, text(cfg.dailyShortHand, 'PDH', 'Prev Day High'), colors.daily);
    level(p.prevTime, p.prevLow, text(cfg.dailyShortHand, 'PDL', 'Prev Day Low'), colors.daily);
  }
  if (cfg.dailyMid) {
    const p = period('D');
    level(p.prevTime, (p.prevLow + p.prevHigh) / 2, text(cfg.dailyShortHand, 'PDM', 'Prev Day Mid'), colors.daily);
  }

  // Week
  if (cfg.weeklyOpen) {
    const p = period('W');
    level(p.time, p.open, text(cfg.weeklyShortHand, 'WO', 'Weekly Open'), colors.weekly);
  }
  if (cfg.weeklyRange) {
    const p = period('W');
    level(p.prevTime, p.prevHigh, text(cfg.weeklyShortHand, 'PWH', 'Prev Week High'), colors.weekly);
    level(p.prevTime, p.prevLow, text(cfg.weeklyShortHand, 'PWL', 'Prev Week Low'), colors.weekly);
  }
  if (cfg.weeklyMid) {
    const p = period('W');
    level(p.prevTime, (p.prevLow + p.prevHigh) / 2, text(cfg.weeklyShortHand, 'PWM', 'Prev Week Mid'), colors.weekly);
  }

  // Year: the high and low of the current year
  if (cfg.yearlyRange) {
    const p = period('12M');
    level(p.time, p.low, text(cfg.yearlyShortHand, 'CYL', 'Current Year Low'), colors.yearly);
    level(p.time, p.high, text(cfg.yearlyShortHand, 'CYH', 'Current Year High'), colors.yearly);
  }
  if (cfg.yearlyOpen) {
    const p = period('12M');
    level(p.time, p.open, text(cfg.yearlyShortHand, 'YO', 'Yearly Open'), colors.yearly);
  }
  if (cfg.yearlyMid) {
    const p = period('12M');
    level(p.time, (p.low + p.high) / 2, text(cfg.yearlyShortHand, 'CYM', 'Current Year Mid'), colors.yearly);
  }

  // Quarter
  if (cfg.quarterlyOpen) {
    const p = period('3M');
    level(p.time, p.open, text(cfg.quarterlyShortHand, 'QO', 'Quarterly Open'), colors.quarterly);
  }
  if (cfg.quarterlyRange) {
    const p = period('3M');
    level(p.prevTime, p.prevHigh, text(cfg.quarterlyShortHand, 'PQH', 'Prev Quarter High'), colors.quarterly);
    level(p.prevTime, p.prevLow, text(cfg.quarterlyShortHand, 'PQL', 'Prev Quarter Low'), colors.quarterly);
  }
  if (cfg.quarterlyMid) {
    const p = period('3M');
    level(p.prevTime, (p.prevLow + p.prevHigh) / 2, text(cfg.quarterlyShortHand, 'PQM', 'Prev Quarter Mid'), colors.quarterly);
  }

  // Month
  if (cfg.monthlyRange) {
    const p = period('M');
    level(p.prevTime, p.prevLow, text(cfg.monthlyShortHand, 'PML', 'Prev Month Low'), colors.monthly);
    level(p.prevTime, p.prevHigh, text(cfg.monthlyShortHand, 'PMH', 'Prev Month High'), colors.monthly);
  }
  if (cfg.monthlyMid) {
    const p = period('M');
    level(p.prevTime, (p.prevLow + p.prevHigh) / 2, text(cfg.monthlyShortHand, 'PMM', 'Prev Month Mid'), colors.monthly);
  }
  if (cfg.monthlyOpen) {
    const p = period('M');
    level(p.time, p.open, text(cfg.monthlyShortHand, 'MO', 'Monthly Open'), colors.monthly);
    // The original moves the start of this line one week back on weekly bars; the port has no month on weekly bars
  }

  // A line or label with an na coordinate is not drawn
  for (const ln of drawnLines) {
    if (Number.isFinite(ln.time1) && Number.isFinite(ln.time2) && Number.isFinite(ln.price1)) lines.push(ln);
  }
  for (const lb of drawnLabels) {
    if (Number.isFinite(lb.time) && Number.isFinite(lb.price)) labels.push(lb);
  }
  return result();
}

export const KeyLevelsSpacemanbtcIdwm = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
