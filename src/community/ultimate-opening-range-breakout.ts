/**
 * Ultimate Opening Range Breakout [LuxAlgo]
 *
 * The opening range is the high and the low of the bars inside the "Opening Range Session" (hours read in the
 * "Timezone" input, on the chosen days of the week). The range restarts on the first bar of a session and on a new
 * day of the symbol.
 * - Plots: the range high and low, and three extension levels on each side (range x multiplier, or the Fibonacci
 *   ratios 0.382 / 0.618 / 1), with gradient fills between them. With "Limit Plotting Duration" they are only shown
 *   from the session start to the end time ("New York Close" 17:00, "London Close" 11:30, a manual time, or 23:59).
 * - Signals: after the session, the first close crossing above the range high gives a "BULL BREAK" label and the
 *   first close crossing below the range low a "BEAR BREAK" label, with "(HV)" when the volume is above its 20-bar
 *   average, else "(LV)". At most 500 labels are kept.
 * - Trailing stop (optional): from the first break, low - ATR x multiplier (only moving up) for a bullish break and
 *   high + ATR x multiplier (only moving down) for a bearish one, until the close goes through it or the plotting
 *   time ends. The profit of each trade (from the range level to that close) is summed.
 * - Volume profile of the session (last bar only): the volume of each session bar is added to the price row of its
 *   close; the rows are drawn as boxes 25 bars after the last bar, the row with the most volume in full colour.
 * - Level labels 2 bars after the last bar, with the hit rate of each target.
 * - Dashboard: for each target the number of sessions in which the price reached it after the session, the number
 *   of sessions and the rate; optionally the trailing profit and the best of five ATR multipliers ("Stop Optimizer").
 *
 * New day: as in the original, the day is read with the session hours of the symbol taken in the "Timezone" input,
 * not in the exchange time zone. A bar that opens outside these hours has no day, and the bar after it does not
 * start a new day. Example: a US stock (09:30 to 16:00) with "UTC-5" has a new day at 09:30 in winter, and none in
 * summer, when New York is at UTC-4 and the first bar of the day opens at 08:30 UTC-5.
 *
 * Chart values (optional third argument of calculate): the port reads the symbol tick (smallest height of a profile
 * row; without it: 0.01), the chart foreground colour (the hidden "Trail Price Ref" plot; without it: #DBDBDB) and,
 * for the new days, the exchange time zone and the session of the symbol (`timezone`, `session`). Without the
 * session the port takes every bar as inside the session hours: a new day starts at 00:00 of the "Timezone" input,
 * which is exact on symbols that trade 24 hours a day. `timeframe`, when given, is the chart timeframe; without it
 * the chart timeframe is read from the bar spacing.
 *
 * Reference: "Ultimate Opening Range Breakout [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, color, time, timeframe, callsite, Series, label, resetDrawings, setDrawingBar, SessionBars, TradingCalendar,
  type Label, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { chartTimeframe, hasCalendar } from '../anchor-period';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, mintickOf, sessionHoursOf, type ChartContext } from '../chart-context';
import type { BgColorData, BoxData, LabelData, TableCellData, TableData, TableMergeData } from '../types';

export interface UltimateOpeningRangeBreakoutInputs {
  /** Opening range session, "HHMM-HHMM" */
  sessionInput: string;
  /** Days of the week of the session (1 = Sunday ... 7 = Saturday) */
  sessionDays: string;
  timezoneInput: string;
  srcInput: 'High/Low' | 'Close';
  showExtensions: boolean;
  extType: 'Multiples' | 'Fibonacci';
  mult1: number;
  mult2: number;
  mult3: number;
  bullColor: string;
  bearColor: string;
  neutralColor: string;
  bgTransp: number;
  showLabels: boolean;
  sigLabelSize: 'Tiny' | 'Small' | 'Normal' | 'Large';
  showVP: boolean;
  vpRowsInput: number;
  /** Not used by the original script */
  vpWidth: number;
  vpColor: string;
  stopPlotting: boolean;
  stopTimeType: 'New York Close' | 'London Close' | 'Manual Time' | 'End of Day';
  manualEndTime: string;
  showTrail: boolean;
  trailMult: number;
  trailAtrLen: number;
  dashboardInput: boolean;
  showOptimizer: boolean;
  dashboardPositionInput: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  dashboardSizeInput: 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
}

export const defaultInputs: UltimateOpeningRangeBreakoutInputs = {
  sessionInput: '0930-1000',
  sessionDays: '1234567',
  timezoneInput: 'UTC-5',
  srcInput: 'High/Low',
  showExtensions: true,
  extType: 'Multiples',
  mult1: 1.0,
  mult2: 2.0,
  mult3: 3.0,
  bullColor: '#089981',
  bearColor: '#f23645',
  neutralColor: '#5b9cf6',
  bgTransp: 85,
  showLabels: true,
  sigLabelSize: 'Small',
  showVP: true,
  vpRowsInput: 14,
  vpWidth: 30,
  vpColor: 'rgba(91, 156, 246, 0.4)',
  stopPlotting: true,
  stopTimeType: 'New York Close',
  manualEndTime: '16:00',
  showTrail: false,
  trailMult: 2.0,
  trailAtrLen: 14,
  dashboardInput: true,
  showOptimizer: false,
  dashboardPositionInput: 'Top Right',
  dashboardSizeInput: 'Small',
};

const TIMEZONES = [
  'UTC-12', 'UTC-11', 'UTC-10', 'UTC-9', 'UTC-8', 'UTC-7', 'UTC-6', 'UTC-5', 'UTC-4', 'UTC-3', 'UTC-2', 'UTC-1', 'UTC+0',
  'UTC+1', 'UTC+2', 'UTC+3', 'UTC+4', 'UTC+5', 'UTC+6', 'UTC+7', 'UTC+8', 'UTC+9', 'UTC+10', 'UTC+11', 'UTC+12',
];

export const inputConfig: InputConfig[] = [
  {
    id: 'sessionInput', type: 'session', title: 'Opening Range Session', defval: '0930-1000',
    tooltip: 'Define the time range for the opening range calculation. Format: HHMM-HHMM',
  },
  {
    id: 'sessionDays', type: 'string', title: 'Days of Week', defval: '1234567',
    tooltip: 'Select days to apply the opening range (1=Sunday, 7=Saturday)',
  },
  {
    id: 'timezoneInput', type: 'string', title: 'Timezone', defval: 'UTC-5', options: TIMEZONES,
    tooltip: 'Adjust the timezone for the session input.',
  },
  {
    id: 'srcInput', type: 'string', title: 'Range Source', defval: 'High/Low', options: ['High/Low', 'Close'],
    tooltip: 'Use the high/low of the session or the closing prices to define the range.',
  },
  { id: 'showExtensions', type: 'bool', title: 'Show Extension Levels', defval: true, group: 'Extensions' },
  { id: 'extType', type: 'string', title: 'Extension Type', defval: 'Multiples', options: ['Multiples', 'Fibonacci'], group: 'Extensions' },
  { id: 'mult1', type: 'float', title: 'Multiplier 1', defval: 1.0, min: 0, group: 'Extensions' },
  { id: 'mult2', type: 'float', title: 'Multiplier 2', defval: 2.0, min: 0, group: 'Extensions' },
  { id: 'mult3', type: 'float', title: 'Multiplier 3', defval: 3.0, min: 0, group: 'Extensions' },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#089981', group: 'Style', inline: 'Colors' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#f23645', group: 'Style', inline: 'Colors' },
  { id: 'neutralColor', type: 'color', title: 'Range Color', defval: '#5b9cf6', group: 'Style', inline: 'Colors' },
  { id: 'bgTransp', type: 'int', title: 'Background Transparency', defval: 85, min: 0, max: 100, group: 'Style' },
  { id: 'showLabels', type: 'bool', title: 'Show Level Labels', defval: true, group: 'Style' },
  {
    id: 'sigLabelSize', type: 'string', title: 'Signal Label Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal', 'Large'],
    group: 'Style',
  },
  { id: 'showVP', type: 'bool', title: 'Show Volume Profile', defval: true, group: 'Volume Profile' },
  {
    id: 'vpRowsInput', type: 'int', title: 'Number of Rows', defval: 14, min: 5, max: 50, group: 'Volume Profile',
    tooltip: "Number of blocks to divide the opening range into. Lower values make the profile more 'blocky'.",
  },
  {
    id: 'vpWidth', type: 'int', title: 'Profile Width (%)', defval: 30, min: 1, max: 100, group: 'Volume Profile',
    tooltip: 'Width of the volume profile relative to the session length.',
  },
  { id: 'vpColor', type: 'color', title: 'Profile Color', defval: 'rgba(91, 156, 246, 0.4)', group: 'Volume Profile' },
  { id: 'stopPlotting', type: 'bool', title: 'Limit Plotting Duration', defval: true, group: 'Plotting Duration' },
  {
    id: 'stopTimeType', type: 'string', title: 'End Plotting At', defval: 'New York Close',
    options: ['New York Close', 'London Close', 'Manual Time', 'End of Day'], group: 'Plotting Duration',
    tooltip: 'Choose when to stop drawing the levels on the chart.',
  },
  {
    id: 'manualEndTime', type: 'string', title: 'Manual End Time (HH:MM)', defval: '16:00', group: 'Plotting Duration',
    tooltip: "Format: HH:MM. Used if 'Manual Time' is selected.",
  },
  { id: 'showTrail', type: 'bool', title: 'Show Trailing Stop', defval: false, group: 'Trailing Stop' },
  {
    id: 'trailMult', type: 'float', title: 'ATR Multiplier', defval: 2.0, min: 0.1, step: 0.1, group: 'Trailing Stop',
    tooltip: 'Multiplier for the ATR-based trailing stop.',
  },
  { id: 'trailAtrLen', type: 'int', title: 'ATR Length', defval: 14, min: 1, group: 'Trailing Stop' },
  {
    id: 'dashboardInput', type: 'bool', title: 'Show Hit Rate Dashboard', defval: true, group: 'Dashboard',
    tooltip: 'Enable or disable the dashboard.',
  },
  {
    id: 'showOptimizer', type: 'bool', title: 'Show Stop Optimizer', defval: false, group: 'Dashboard',
    tooltip: 'Simulates different ATR multipliers to find the most profitable distance.',
  },
  {
    id: 'dashboardPositionInput', type: 'string', title: 'Position', defval: 'Top Right',
    options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard', tooltip: 'Select the dashboard location.',
  },
  {
    id: 'dashboardSizeInput', type: 'string', title: 'Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'],
    group: 'Dashboard', tooltip: 'Select the dashboard size.',
  },
];

const NEUTRAL_LINE = String(color.new('#5b9cf6', 20));
const BULL_LINE = String(color.new('#089981', 40));
const BEAR_LINE = String(color.new('#f23645', 40));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'OR High', color: NEUTRAL_LINE, lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'OR Low', color: NEUTRAL_LINE, lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'Upper Ext 1', color: BULL_LINE, lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'Upper Ext 2', color: BULL_LINE, lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Upper Ext 3', color: BULL_LINE, lineWidth: 1, style: 'linebr' },
  { id: 'plot5', title: 'Lower Ext 1', color: BEAR_LINE, lineWidth: 1, style: 'linebr' },
  { id: 'plot6', title: 'Lower Ext 2', color: BEAR_LINE, lineWidth: 1, style: 'linebr' },
  { id: 'plot7', title: 'Lower Ext 3', color: BEAR_LINE, lineWidth: 1, style: 'linebr' },
  { id: 'plot8', title: 'Trailing Stop', color: '#f23645', lineWidth: 2, style: 'linebr' },
  { id: 'plot9', title: 'Trail Price Ref', color: 'transparent' },
];

export const metadata = {
  title: 'Ultimate Opening Range Breakout [LuxAlgo]',
  shortTitle: 'LuxAlgo - Ult ORB',
  overlay: true,
};

const DATA = '#DBDBDB';
const HEADERS = '#808080';
const BACKGROUND = '#161616';
const BORDERS = '#2E2E2E';
const WHITE = '#FFFFFF';

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const nz = (v: number, alt: number) => (Number.isFinite(v) ? v : alt);

interface Lb { x: number; y: number; text: string; color: string; style: 'label_down' | 'label_up' | 'label_left'; size: string }

/**
 * time("D", "", timezone) of each bar: the day of the bar with the session hours of the symbol read in `timezone`
 * (NaN: the bar opens outside these hours). With the session of the chart context the value comes from the session
 * calendar of the library (the symbol hours in `timezone`, without corrections and holidays, as the script API
 * `time("D", "", timezone)`); without it every bar is inside the hours and the value is the day number in `timezone`.
 */
function dayTimes(bars: Bar[], timezone: string, chart?: ChartContext): number[] {
  const ms = bars.length > 0 && bars[0].time >= 1e12;
  const tf = chartTimeframe(bars, chart);
  if (chart && hasCalendar(chart) && tf !== '') {
    const days = new SessionBars(new TradingCalendar(timezone, { session: sessionHoursOf(chart) }, 'symbol'), tf);
    return bars.map((b) => {
      const t = ms ? b.time : b.time * 1000;
      return days.inside(t) ? days.timeOf(t, 'D') : NaN;
    });
  }
  return bars.map((b) => {
    const t = ms ? b.time : b.time * 1000;
    return time.year(t, timezone) * 10000 + time.month(t, timezone) * 100 + time.dayofmonth(t, timezone);
  });
}

export function calculate(
  bars: Bar[],
  inputs: Partial<UltimateOpeningRangeBreakoutInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'tables'> & {
  bgColors: BgColorData[]; boxes: BoxData[]; labels: LabelData[]; tables: TableData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const { bullColor, bearColor, neutralColor, bgTransp, showExtensions, showTrail, trailMult } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const ms = n > 0 && bars[0].time >= 1e12;
  const mintick = mintickOf(chart);
  const vpRows = cfg.vpRowsInput;

  const atrVal = A(ta.atr(bars, 200));
  const atrTrailArr = A(ta.atr(bars, Math.trunc(cfg.trailAtrLen)));
  const volSMA = A(ta.sma(new Series(bars, (b) => b.volume ?? NaN), 20));

  // time(timeframe.period, session + ":" + days, timezone) is not na: the bar opens inside the session
  const orSession = `${cfg.sessionInput}:${cfg.sessionDays}`;
  const targetEndTime = cfg.stopTimeType === 'New York Close' ? '1700'
    : cfg.stopTimeType === 'London Close' ? '1130'
      : cfg.stopTimeType === 'Manual Time' ? cfg.manualEndTime.replace(':', '') : '2359';
  const plottingSession = `${cfg.sessionInput.substring(0, 4)}-${targetEndTime}:${cfg.sessionDays}`;
  // the bar duration is needed on the days of a clock change
  const chartTf = chartTimeframe(bars, chart);
  const barMs = chartTf !== '' ? timeframe.in_seconds(chartTf) * 1000 : undefined;
  const within = (i: number, session: string) => time.inSession(ms ? bars[i].time : bars[i].time * 1000, session, cfg.timezoneInput, barMs);
  const dayStarts = dayTimes(bars, cfg.timezoneInput, chart);

  const f1 = cfg.extType === 'Fibonacci' ? 0.382 : cfg.mult1;
  const f2 = cfg.extType === 'Fibonacci' ? 0.618 : cfg.mult2;
  const f3 = cfg.extType === 'Fibonacci' ? 1.0 : cfg.mult3;
  const szSignal = cfg.sigLabelSize === 'Tiny' ? 'tiny' : cfg.sigLabelSize === 'Small' ? 'small' : cfg.sigLabelSize === 'Normal' ? 'normal' : 'large';

  let dynamicTickSize = NaN;
  let orHigh = NaN;
  let orLow = NaN;
  let sessionEnded = false;
  let totalSessions = 0;
  const countU = [0, 0, 0];
  const countD = [0, 0, 0];
  let reachedU = [false, false, false];
  let reachedD = [false, false, false];
  const volMap = new Map<number, number>();
  let totalProfit = 0;
  let entryPrice = NaN;
  const optProfits = [0, 0, 0, 0, 0];
  const optMults = [1.0, 1.5, 2.0, 2.5, 3.0];
  const optStops = [NaN, NaN, NaN, NaN, NaN];
  const optActive = [0, 0, 0, 0, 0];
  let trailStop = NaN;
  let activeDir = 0;
  let canSignalUp = true;
  let canSignalDn = true;
  let prevInSession = false;
  let prevTrailStop = NaN;
  const crossUp = callsite.crossover();
  const crossDn = callsite.crossunder();

  // Labels in the drawing registry of the library, with the label limit of the script (max_labels_count)
  resetDrawings({ label: MAX_LABELS, line: MAX_LABELS, box: MAX_LABELS });
  const labelData = new Map<Label, Lb>();
  const newLabel = (l: Lb) => {
    labelData.set(label.new(l.x, l.y, l.text, 'bar_index'), l);
  };

  type Point = { time: number; value: number; color?: string };
  const ids = ['plot0', 'plot1', 'plot2', 'plot3', 'plot4', 'plot5', 'plot6', 'plot7', 'plot8', 'plot9'] as const;
  const plots = Object.fromEntries(ids.map((id) => [id, [] as Point[]])) as Record<(typeof ids)[number], Point[]>;
  const bgColors: BgColorData[] = [];
  const bgCss = String(color.new(neutralColor, 90));
  const neutralLine = String(color.new(neutralColor, 20));
  const bullLine = String(color.new(bullColor, 40));
  const bearLine = String(color.new(bearColor, 40));
  const priceRefCss = String(color.new(foregroundColorOf(chart), 100));
  const trailTop: number[] = [];
  const trailBottom: number[] = [];
  const trailTopColor: Array<string | null> = [];
  const trailBottomColor: Array<string | null> = [];
  const bullHalf = String(color.new(bullColor, 50));
  const bullClear = String(color.new(bullColor, 100));
  const bearHalf = String(color.new(bearColor, 50));
  const bearClear = String(color.new(bearColor, 100));
  let u = [NaN, NaN, NaN];
  let d = [NaN, NaN, NaN];

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === last);
    const b = bars[i];
    const volume = b.volume ?? NaN;
    const inSession = within(i, orSession);
    // ta.change(time("D", "", timezone)) != 0
    const isNewDay = i > 0 && !isNaN(dayStarts[i]) && !isNaN(dayStarts[i - 1]) && dayStarts[i] !== dayStarts[i - 1];

    // Core logic
    if (isNewDay || (inSession && !prevInSession)) {
      orHigh = NaN;
      orLow = NaN;
      sessionEnded = false;
      reachedU = [false, false, false];
      reachedD = [false, false, false];
      volMap.clear();
      entryPrice = NaN;
      optStops.fill(NaN);
      optActive.fill(0);
      dynamicTickSize = Math.max(mintick, nz(atrVal[i], b.high - b.low) / vpRows);
    }

    if (inSession) {
      const currentHigh = cfg.srcInput === 'High/Low' ? b.high : Math.max(b.open, b.close);
      const currentLow = cfg.srcInput === 'High/Low' ? b.low : Math.min(b.open, b.close);
      orHigh = isNaN(orHigh) ? currentHigh : Math.max(orHigh, currentHigh);
      orLow = isNaN(orLow) ? currentLow : Math.min(orLow, currentLow);
      const currentRange = orHigh - orLow;
      if (gt(currentRange, 0)) dynamicTickSize = Math.max(mintick, currentRange / vpRows);
      const priceLevel = Math.round(b.close / dynamicTickSize) * dynamicTickSize;
      volMap.set(priceLevel, (volMap.has(priceLevel) ? (volMap.get(priceLevel) as number) : 0) + volume);
    }

    if (!inSession && prevInSession) {
      sessionEnded = true;
      totalSessions += 1;
    }

    const orRange = orHigh - orLow;
    u = [orHigh + orRange * f1, orHigh + orRange * f2, orHigh + orRange * f3];
    d = [orLow - orRange * f1, orLow - orRange * f2, orLow - orRange * f3];

    if (sessionEnded) {
      for (let k = 0; k < 3; k++) {
        if (ge(b.high, u[k]) && !reachedU[k]) {
          countU[k] += 1;
          reachedU[k] = true;
        }
      }
      for (let k = 0; k < 3; k++) {
        if (le(b.low, d[k]) && !reachedD[k]) {
          countD[k] += 1;
          reachedD[k] = true;
        }
      }
    }

    const displayAllowed = !cfg.stopPlotting || within(i, plottingSession);
    const atrTrail = atrTrailArr[i];
    const volSuffix = gt(volume, volSMA[i]) ? ' (HV)' : ' (LV)';

    // the crossings run on every bar (left side of the `and`)
    const crossedUp = crossUp(b.close, orHigh);
    const crossedDn = crossDn(b.close, orLow);
    const breakoutUp = crossedUp && !inSession && sessionEnded;
    const breakoutDn = crossedDn && !inSession && sessionEnded;

    if (isNewDay || inSession) {
      canSignalUp = true;
      canSignalDn = true;
      activeDir = 0;
      trailStop = NaN;
    }

    if (breakoutUp && canSignalUp && displayAllowed) {
      newLabel({ x: i, y: b.high, text: `BULL BREAK${volSuffix}`, color: bullColor, style: 'label_down', size: szSignal });
      canSignalUp = false;
      if (activeDir === 0) {
        activeDir = 1;
        entryPrice = orHigh;
        trailStop = b.low - atrTrail * trailMult;
        for (let k = 0; k < 5; k++) {
          optActive[k] = 1;
          optStops[k] = b.low - atrTrail * optMults[k];
        }
      }
    }

    if (breakoutDn && canSignalDn && displayAllowed) {
      newLabel({ x: i, y: b.low, text: `BEAR BREAK${volSuffix}`, color: bearColor, style: 'label_up', size: szSignal });
      canSignalDn = false;
      if (activeDir === 0) {
        activeDir = -1;
        entryPrice = orLow;
        trailStop = b.high + atrTrail * trailMult;
        for (let k = 0; k < 5; k++) {
          optActive[k] = -1;
          optStops[k] = b.high + atrTrail * optMults[k];
        }
      }
    }

    if (activeDir === 1) {
      const level = b.low - atrTrail * trailMult;
      trailStop = Math.max(nz(prevTrailStop, level), level);
      if (lt(b.close, trailStop) || !displayAllowed) {
        totalProfit += b.close - entryPrice;
        activeDir = 0;
        trailStop = NaN;
      }
    }

    if (activeDir === -1) {
      const level = b.high + atrTrail * trailMult;
      trailStop = Math.min(nz(prevTrailStop, level), level);
      if (gt(b.close, trailStop) || !displayAllowed) {
        totalProfit += entryPrice - b.close;
        activeDir = 0;
        trailStop = NaN;
      }
    }

    if (cfg.showOptimizer) {
      for (let k = 0; k < 5; k++) {
        const m = optMults[k];
        const a = optActive[k];
        const s = optStops[k];
        if (a === 1) {
          const level = b.low - atrTrail * m;
          const newStop = Math.max(nz(s, level), level);
          optStops[k] = newStop;
          if (lt(b.close, newStop) || !displayAllowed) {
            optProfits[k] += b.close - entryPrice;
            optActive[k] = 0;
          }
        } else if (a === -1) {
          const level = b.high + atrTrail * m;
          const newStop = Math.min(nz(s, level), level);
          optStops[k] = newStop;
          if (gt(b.close, newStop) || !displayAllowed) {
            optProfits[k] += entryPrice - b.close;
            optActive[k] = 0;
          }
        }
      }
    }

    // Visuals
    if (inSession) bgColors.push({ time: b.time, color: bgCss });
    const ext = displayAllowed && showExtensions;
    plots.plot0.push({ time: b.time, value: displayAllowed ? orHigh : NaN, color: neutralLine });
    plots.plot1.push({ time: b.time, value: displayAllowed ? orLow : NaN, color: neutralLine });
    plots.plot2.push({ time: b.time, value: ext ? u[0] : NaN, color: bullLine });
    plots.plot3.push({ time: b.time, value: ext ? u[1] : NaN, color: bullLine });
    plots.plot4.push({ time: b.time, value: ext ? u[2] : NaN, color: bullLine });
    plots.plot5.push({ time: b.time, value: ext ? d[0] : NaN, color: bearLine });
    plots.plot6.push({ time: b.time, value: ext ? d[1] : NaN, color: bearLine });
    plots.plot7.push({ time: b.time, value: ext ? d[2] : NaN, color: bearLine });
    plots.plot8.push({ time: b.time, value: showTrail ? trailStop : NaN, color: activeDir === 1 ? bullColor : bearColor });
    plots.plot9.push({ time: b.time, value: showTrail ? b.close : NaN, color: priceRefCss });
    trailTop.push(activeDir === 1 ? b.close : trailStop);
    trailBottom.push(activeDir === 1 ? trailStop : b.close);
    trailTopColor.push(activeDir === 1 ? bullHalf : bearClear);
    trailBottomColor.push(activeDir === 1 ? bullClear : bearHalf);

    prevInSession = inSession;
    prevTrailStop = trailStop;
  }

  // Last bar: volume profile of the session, level labels
  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const boxes: BoxData[] = [];
  if (n > 0) {
    if (cfg.showVP && volMap.size > 0) {
      let maxVol = 0.0;
      // math.max gives na with an na volume
      for (const vol of volMap.values()) maxVol = Math.max(maxVol, vol);
      const prices = [...volMap.keys()].sort((a, b) => a - b);
      const profileMaxBars = 15;
      const levelHeight = dynamicTickSize;
      const startX = last + 25;
      const pocCss = String(color.new(cfg.vpColor, 0));
      const cellCss = String(color.new(cfg.vpColor, 40));
      for (const p of prices) {
        if (ge(p, orLow - levelHeight / 2) && le(p, orHigh + levelHeight / 2)) {
          const vol = volMap.get(p) as number;
          const isPOC = eq(vol, maxVol);
          const width = Math.max(1, Math.round((vol / Math.max(1e-10, maxVol)) * profileMaxBars));
          // an na width (no volume) gives a box without a right side: not drawn
          if (isNaN(width)) continue;
          boxes.push({
            time1: T(startX), price1: p + levelHeight / 2, time2: T(startX + width), price2: p - levelHeight / 2,
            borderColor: String(color.new(cfg.vpColor, 100)), bgColor: isPOC ? pocCss : cellCss, textColor: WHITE,
          });
        }
      }
    }
    if (cfg.showLabels) {
      newLabel({ x: last + 2, y: orHigh, text: 'OR High', color: neutralColor, style: 'label_left', size: 'small' });
      newLabel({ x: last + 2, y: orLow, text: 'OR Low', color: neutralColor, style: 'label_left', size: 'small' });
      if (showExtensions) {
        const rate = (count: number) => str.tostring(totalSessions > 0 ? Math.round((count / totalSessions) * 100) : 0);
        for (let k = 0; k < 3; k++) {
          newLabel({ x: last + 2, y: u[k], text: `Target ${k + 1} (${rate(countU[k])}%)`, color: bullColor, style: 'label_left', size: 'small' });
          newLabel({ x: last + 2, y: d[k], text: `Target ${k + 1} (${rate(countD[k])}%)`, color: bearColor, style: 'label_left', size: 'small' });
        }
      }
    }
  }

  const labels = label.all().map((obj) => labelData.get(obj) as Lb);
  setDrawingBar(null);

  // Dashboard
  const tables: TableData[] = [];
  if (n > 0 && cfg.dashboardInput) {
    const textSize = cfg.dashboardSizeInput.toLowerCase() as 'tiny' | 'small' | 'normal' | 'large' | 'huge';
    const position = cfg.dashboardPositionInput === 'Top Right' ? 'top_right'
      : cfg.dashboardPositionInput === 'Bottom Right' ? 'bottom_right' : 'bottom_left';
    const cells: TableCellData[] = [];
    const merges: TableMergeData[] = [];
    const cell = (column: number, row: number, text: string, textColor: string, textHAlign: 'left' | 'center' | 'right' = 'right', height = 0) => {
      cells.push({ column, row, text, textColor, textSize, textHAlign, ...(height ? { height } : {}) });
    };
    const mergeRow = (row: number) => merges.push({ startColumn: 0, startRow: row, endColumn: 3, endRow: row });
    const divider = (row: number) => {
      mergeRow(row);
      cell(0, row, '━━━━━━━━━━━━━━', BORDERS, 'center', 0.5);
    };
    const rowsTotal = 13 + (showTrail ? 2 : 0) + (cfg.showOptimizer ? 2 : 0);

    // First bar
    mergeRow(0);
    cell(0, 0, 'ORB Hit Rate', DATA, 'center');
    divider(1);
    cell(0, 2, 'Level', HEADERS, 'left');
    cell(1, 2, 'Hits', HEADERS);
    cell(2, 2, 'Total', HEADERS);
    cell(3, 2, 'Rate', HEADERS);
    divider(3);
    divider(7);
    divider(11);
    mergeRow(12);
    let nextRow = 13;
    if (showTrail) {
      divider(nextRow);
      nextRow += 1;
      mergeRow(nextRow);
      nextRow += 1;
    }
    if (cfg.showOptimizer) {
      divider(nextRow);
      nextRow += 1;
      mergeRow(nextRow);
    }

    // Last bar
    const totalHits = Math.max(1, totalSessions);
    const level = (row: number, name: string, count: number, css: string) => {
      cell(0, row, name, HEADERS, 'left');
      cell(1, row, str.tostring(count), css);
      cell(2, row, str.tostring(totalSessions), css);
      cell(3, row, `${str.tostring(Math.round((count / totalHits) * 100))}%`, css);
    };
    level(4, 'Bull T1', countU[0], bullColor);
    level(5, 'Bull T2', countU[1], bullColor);
    level(6, 'Bull T3', countU[2], bullColor);
    level(8, 'Bear T1', countD[0], bearColor);
    level(9, 'Bear T2', countD[1], bearColor);
    level(10, 'Bear T3', countD[2], bearColor);
    cell(0, 12, `Tracked: ${str.tostring(totalSessions)} (${cfg.sessionInput})`, DATA, 'center');
    nextRow = 13;
    if (showTrail) {
      nextRow += 1;
      cell(0, nextRow, `Cumulative Trail Profit: ${str.tostring(totalProfit, '#.##')}`, DATA, 'center');
      nextRow += 1;
    }
    if (cfg.showOptimizer) {
      nextRow += 1;
      let bestIdx = 0;
      let maxP = -1e10;
      for (let k = 0; k < 5; k++) {
        if (gt(optProfits[k], maxP)) {
          maxP = optProfits[k];
          bestIdx = k;
        }
      }
      cell(0, nextRow, `Best ATR Mult: ${str.tostring(optMults[bestIdx])} (Profit: ${str.tostring(maxP, '#.##')})`, '#FFD700', 'center');
    }
    tables.push({
      position, columns: 4, rows: rowsTotal, cells, merges, bgColor: BACKGROUND, frameColor: BORDERS, frameWidth: 1, borderWidth: 0,
    });
  }

  const gradient = (top: Point[], bottom: Point[], topColor: string, bottomColor: string) => ({
    topValue: top.map((p) => p.value),
    bottomValue: bottom.map((p) => p.value),
    topColor: top.map((): string | null => topColor),
    bottomColor: bottom.map((): string | null => bottomColor),
  });
  const C = (css: string, transp: number) => String(color.new(css, transp));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Range Fill' }, gradient: gradient(plots.plot0, plots.plot1, C(neutralColor, bgTransp), C(neutralColor, bgTransp)) },
      { plot1: 'plot0', plot2: 'plot2', options: { title: 'Bull Zone 1' }, gradient: gradient(plots.plot2, plots.plot0, C(bullColor, bgTransp + 10), C(bullColor, bgTransp)) },
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Bull Zone 2' }, gradient: gradient(plots.plot3, plots.plot2, C(bullColor, bgTransp + 5), C(bullColor, bgTransp + 10)) },
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Bull Zone 3' }, gradient: gradient(plots.plot4, plots.plot3, C(bullColor, bgTransp), C(bullColor, bgTransp + 5)) },
      { plot1: 'plot1', plot2: 'plot5', options: { title: 'Bear Zone 1' }, gradient: gradient(plots.plot1, plots.plot5, C(bearColor, bgTransp), C(bearColor, bgTransp + 10)) },
      { plot1: 'plot5', plot2: 'plot6', options: { title: 'Bear Zone 2' }, gradient: gradient(plots.plot5, plots.plot6, C(bearColor, bgTransp + 10), C(bearColor, bgTransp + 5)) },
      { plot1: 'plot6', plot2: 'plot7', options: { title: 'Bear Zone 3' }, gradient: gradient(plots.plot6, plots.plot7, C(bearColor, bgTransp + 5), C(bearColor, bgTransp)) },
      {
        plot1: 'plot8', plot2: 'plot9', options: { title: 'Trailing Stop Fill' },
        gradient: { topValue: trailTop, bottomValue: trailBottom, topColor: trailTopColor, bottomColor: trailBottomColor },
      },
    ],
    bgColors,
    boxes,
    // a label with an na price is not drawn
    labels: labels.filter((l) => !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: l.color, textColor: WHITE, style: l.style, size: l.size as LabelData['size'],
    })),
    tables,
  };
}

export const UltimateOpeningRangeBreakout = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
