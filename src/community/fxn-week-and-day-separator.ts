/**
 * FXN - Week and Day Separator
 *
 * Vertical separators on intraday charts and the names of the weekdays at the bottom of the pane.
 * - Week separator: a vertical line on the bar that opens the new trading day (17:00 exchange time) on the chosen
 *   weekday (Sunday by default). Not on charts of 2, 3, 4 or 6 hours, nor on daily and higher charts.
 * - Day separator (off by default): the same line on the other days. Not on charts of 1 hour (unless the 1-hour
 *   option is on), 2, 3, 4 or 6 hours, nor on daily and higher charts.
 * - Day names ("Monday" ... "Friday", or "Mon" ... "Fri"): on the bar of 01:00 exchange time, on the same charts as
 *   the day separator.
 * - "Use Background Separator": background colours in place of the lines (no limit on their number).
 * When the exchange time zone is UTC the original adds 5 hours to both times (22:00 and 06:00).
 * At most 50 lines are kept (the oldest are removed).
 *
 * Notes on the port:
 * - The clock of the bars, the weekday and the test on the exchange time zone come from the chart context (optional
 *   third argument of calculate, `timezone`). Without it the port uses UTC, so it adds the 5 hours. `timeframe`,
 *   when given, is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 * - The lines go from price 0 to price 1 and extend both ways; the original has no price scale of its own
 *   (scale.none), which the port does not set.
 * - The day names are markers with a transparent circle and the name as text.
 *
 * Reference: "FXN - Week and Day Separator" by RobMinty
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, timeframe, time as pineTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, LineDrawingData, MarkerData } from '../types';
import { chartTimeframe } from '../anchor-period';
import { timezoneOf, type ChartContext } from '../chart-context';

type DayName = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
type ColourName =
  | 'aqua' | 'black' | 'blue' | 'fuchsia' | 'gray' | 'green' | 'lime' | 'maroon' | 'navy' | 'olive' | 'orange' | 'purple'
  | 'red' | 'silver' | 'teal' | 'white' | 'yellow';
type LineStyleName = 'solid' | 'dashed' | 'dotted';

export interface FxnWeekAndDaySeparatorInputs {
  weekStart: DayName;
  weekToggle: boolean;
  weekLineColour: ColourName | 'default';
  weekLineWidth: number;
  weekLineStyle: LineStyleName;
  dayToggle: boolean;
  dayLineColour: ColourName | 'default';
  dayLineWidth: number;
  dayLineStyle: LineStyleName;
  /** Show the day separator and the day names on the 1-hour chart */
  showOn1Hour: boolean;
  /** Background colours in place of the lines */
  showAsBackground: boolean;
  showDow: boolean;
  shortDayLabel: boolean;
  mondayColor: ColourName;
  tuesdayColor: ColourName;
  wednesdayColor: ColourName;
  thursdayColor: ColourName;
  fridayColor: ColourName;
}

export const defaultInputs: FxnWeekAndDaySeparatorInputs = {
  weekStart: 'Sunday',
  weekToggle: true,
  weekLineColour: 'default',
  weekLineWidth: 4,
  weekLineStyle: 'dashed',
  dayToggle: false,
  dayLineColour: 'default',
  dayLineWidth: 1,
  dayLineStyle: 'dashed',
  showOn1Hour: false,
  showAsBackground: false,
  showDow: true,
  shortDayLabel: false,
  mondayColor: 'silver',
  tuesdayColor: 'silver',
  wednesdayColor: 'silver',
  thursdayColor: 'silver',
  fridayColor: 'silver',
};

const DAYS: DayName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const COLOUR_NAMES: ColourName[] = [
  'aqua', 'black', 'blue', 'fuchsia', 'gray', 'green', 'lime', 'maroon', 'navy', 'olive', 'orange', 'purple', 'red',
  'silver', 'teal', 'white', 'yellow',
];
const LINE_COLOUR_NAMES = [...COLOUR_NAMES, 'default'];
const STYLES: LineStyleName[] = ['solid', 'dashed', 'dotted'];

export const inputConfig: InputConfig[] = [
  { id: 'weekStart', type: 'string', title: 'Week Separator on Day', defval: 'Sunday', options: DAYS },
  { id: 'weekToggle', type: 'bool', title: 'Show Week Separator Line', defval: true },
  { id: 'weekLineColour', type: 'string', title: 'Week Line Colour', defval: 'default', options: LINE_COLOUR_NAMES },
  { id: 'weekLineWidth', type: 'int', title: 'Week Line Width', defval: 4, min: 0, max: 20, step: 1 },
  { id: 'weekLineStyle', type: 'string', title: 'Week Line Style', defval: 'dashed', options: STYLES },
  { id: 'dayToggle', type: 'bool', title: 'Show Day Separator Line', defval: false },
  { id: 'dayLineColour', type: 'string', title: 'Day Colour', defval: 'default', options: LINE_COLOUR_NAMES },
  { id: 'dayLineWidth', type: 'int', title: 'Day Line Width', defval: 1, min: 0, max: 20, step: 1 },
  { id: 'dayLineStyle', type: 'string', title: 'Day Line Style', defval: 'dashed', options: STYLES },
  { id: 'showOn1Hour', type: 'bool', title: 'Show Day Separator and Days of Week on 1 hour Chart', defval: false },
  {
    id: 'showAsBackground',
    type: 'bool',
    title: 'Use Background Separator, rather than Lines (Please Note: The show day separator line option above, still needs to be checked to show either type of day separator)  - Using the background separator option may be preferred if you would prefer to see unlimited separators. This is especially useful when working with zoomed out charts. To change the color, transparency please use options that can be found on the style tab. The options above will have no impact on background separators.',
    defval: false,
  },
  { id: 'showDow', type: 'bool', title: 'Show days of week', defval: true },
  { id: 'shortDayLabel', type: 'bool', title: 'Use short names for days of week (Mon, Tue...)', defval: false },
  { id: 'mondayColor', type: 'string', title: 'Monday Text Color', defval: 'silver', options: COLOUR_NAMES },
  { id: 'tuesdayColor', type: 'string', title: 'Tuesday Text Color', defval: 'silver', options: COLOUR_NAMES },
  { id: 'wednesdayColor', type: 'string', title: 'Wednesday Text Color', defval: 'silver', options: COLOUR_NAMES },
  { id: 'thursdayColor', type: 'string', title: 'Thursday Text Color', defval: 'silver', options: COLOUR_NAMES },
  { id: 'fridayColor', type: 'string', title: 'Friday Text Color', defval: 'silver', options: COLOUR_NAMES },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'FXN - Week and Day Separator',
  shortTitle: 'FXN - Week and Day Separator',
  overlay: true,
};

/** Colour constants of this version of the language */
const COLOURS: Record<ColourName, string> = {
  aqua: '#00BCD4', black: '#363A45', blue: '#2196F3', fuchsia: '#E040FB', gray: '#787B86', green: '#4CAF50',
  lime: '#00E676', maroon: '#880E4F', navy: '#311B92', olive: '#808000', orange: '#FF9800', purple: '#9C27B0',
  red: '#FF5252', silver: '#B2B5BE', teal: '#00897B', white: '#FFFFFF', yellow: '#FFEB3B',
};
const WEEK_DEFAULT = '#F4D415';
const DAY_DEFAULT = '#7497DF';
const WEEK_TRANSPARENCY = 50;
const DAY_TRANSPARENCY = 20;
/** study() without max_lines_count: 50 lines */
const MAX_LINES = 50;

export function calculate(
  bars: Bar[],
  inputs: Partial<FxnWeekAndDaySeparatorInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines'> & { lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const TZ = timezoneOf(chart);
  const ms = n > 0 && bars[0].time >= 1e12;

  const weekColour = String(color.new(COLOURS[cfg.weekLineColour as ColourName] ?? WEEK_DEFAULT, WEEK_TRANSPARENCY));
  const dayColour = String(color.new(COLOURS[cfg.dayLineColour as ColourName] ?? DAY_DEFAULT, DAY_TRANSPARENCY));
  const lineStyle = (s: string): LineStyleName => (s === 'dashed' ? 'dashed' : s === 'dotted' ? 'dotted' : 'solid');
  // dayofweek.sunday = 1 ... dayofweek.saturday = 7
  const weekStartDay = Math.max(0, DAYS.indexOf(cfg.weekStart)) + 1;

  // The trading day opens at 17:00 and the names are written at 01:00; 5 hours later on a UTC exchange
  let newDayStartTime = 17;
  let dayLabelStartTime = 1;
  if (TZ === 'Etc/UTC') {
    newDayStartTime += 5;
    dayLabelStartTime += 5;
  }

  // timeframe.isdwm / timeframe.period of the chart
  const period = chartTimeframe(bars, chart);
  const isdwm = period !== '' && timeframe.info(period).isdwm;
  const longHours = period === '120' || period === '240' || period === '180' || period === '360';
  const validDay = !(isdwm || (period === '60' && !cfg.showOn1Hour) || longHours);
  const validWeek = !(isdwm || longHours);

  // Lines in creation order: when a creation brings the count above max + 5, the oldest are deleted until max remain
  const lines: LineDrawingData[] = [];
  const vline = (time: number, css: string, style: LineStyleName, width: number) => {
    lines.push({ time1: time, price1: 0, time2: time, price2: 1, extend: 'both', color: css, style, width });
    if (lines.length > MAX_LINES + 5) lines.splice(0, lines.length - MAX_LINES);
  };

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const dot = String(color.new(COLOURS.silver, 100));
  const shortNames = (cfg.shortDayLabel && cfg.showDow) || (cfg.showDow && period === '60' && cfg.showOn1Hour);
  const longNames = !cfg.shortDayLabel && cfg.showDow && !cfg.showOn1Hour;
  // Monday (2) to Friday (6): short text, long text, text colour
  const names: Array<[string, string, string]> = [
    ['Mon', 'Monday', COLOURS[cfg.mondayColor]],
    ['Tues', 'Tuesday', COLOURS[cfg.tuesdayColor]],
    ['Wed', 'Wednesday', COLOURS[cfg.wednesdayColor]],
    ['Thu', 'Thursday', COLOURS[cfg.thursdayColor]],
    ['Fri', 'Friday', COLOURS[cfg.fridayColor]],
  ];
  // bgcolor(#F4D415, transp = 60) and bgcolor(#7497DF, transp = 90)
  const weekBg = 'rgba(244, 212, 21, 0.4)';
  const dayBg = 'rgba(116, 151, 223, 0.1)';

  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const tMs = ms ? t : t * 1000;
    const hour = pineTime.hour(tMs, TZ);
    const minute = pineTime.minute(tMs, TZ);
    const dow = pineTime.dayofweek(tMs, TZ);
    const isNewWeek = dow === weekStartDay;
    const isStartTime = hour === newDayStartTime && minute === 0;
    const week = validWeek && cfg.weekToggle && isNewWeek && isStartTime;
    const day = validDay && cfg.dayToggle && !isNewWeek && isStartTime;

    if (!cfg.showAsBackground) {
      if (week) vline(t, weekColour, lineStyle(cfg.weekLineStyle), cfg.weekLineWidth);
      if (day) vline(t, dayColour, lineStyle(cfg.dayLineStyle), cfg.dayLineWidth);
    } else {
      if (week) bgColors.push({ id: 'bgcolor0', time: t, color: weekBg });
      // four bgcolor() calls with the same condition and colour (Monday to Thursday separators: bgcolor1 to bgcolor4)
      if (day) for (let k = 0; k < 4; k++) bgColors.push({ id: `bgcolor${k + 1}`, time: t, color: dayBg });
    }

    // Day names
    if (validDay && hour === dayLabelStartTime && minute === 0 && dow >= 2 && dow <= 6) {
      const [shortText, longText, textColor] = names[dow - 2];
      // plotshape outputs: short names shape0 (Mon) to shape4 (Fri), long names shape5 (Monday) to shape9 (Friday)
      const marker = (text: string, id: string): MarkerData => ({
        id, time: t, position: 'bottom', shape: 'circle', color: dot, text, textColor, size: 'tiny',
      });
      if (shortNames) markers.push(marker(shortText, `shape${dow - 2}`));
      if (longNames) markers.push(marker(longText, `shape${dow + 3}`));
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    bgColors,
    lines,
  };
}

export const FxnWeekAndDaySeparator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
