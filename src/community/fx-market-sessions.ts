/**
 * FX Market Sessions
 *
 * Up to four trading sessions (London, New York, Tokyo, Sydney by default), each with its own hours read in the
 * "Timezone" input (a fixed GMT offset). For each session, on the bars inside it:
 * - Box: a box from the first bar of the session to its expected end (the length of the previous session), from the
 *   session high to the session low, with two dotted lines at the open and at the close (filled between them) and a
 *   dot at the open and at the close when the session is over. Other styles: Background (no border), Hamburger (two
 *   horizontal lines, filled) and Sandwich (two vertical lines, filled).
 * - Label: the session name, and optionally the weekday, the range as a price and the range in pips.
 * - Opening range: the high / low of the first minutes of the session (a box, two dotted lines, two price labels),
 *   targets R1 / R2 / S1 / S2 from the average range of the last sessions (lines, boxes, fills), a mark on the first
 *   bar that goes through a target, and a thick line at the current close while the session is open.
 * - Fibonacci levels: lines at 50 %, 62.8 % and 38.2 % of the session range.
 * - Candle: one candle for the whole session (a box for the body, two lines for the wicks).
 * - Bar: the bars of the session painted with the session colours (bar colour, or candles).
 * An information table shows for each session its current range, the average range of the last sessions and their
 * ratio. A second table shows how often the targets of the opening range were reached. The alerts can be shown:
 * "Start" / "End" labels, and the high and low of the last session with a triangle where the close crosses them
 * after the session.
 *
 * Imported libraries of the original, ported here: boitoki/AwesomeColor/9 (the colours of its three palettes that
 * the script uses) and boitoki/Utilities/11 (get_day(), toPips(), clear_lines(), clear_labels(), clear_boxes()).
 *
 * As the original, calculate() throws an Error where the Pine script stops with a runtime error: when a session has
 * had no bar for 15,000 bars (the window of the session high is longer than Pine allows), when the opening range
 * table gets a third session, and when a session ends with opening range lines but no opening range label.
 *
 * Chart context (third argument), all optional:
 * - Price tick of the symbol: the pips and the prices of the texts; 0.01 without it.
 * - Ticker of the symbol: the title of the opening range table ("Opening range(BTCUSD)"); empty without it.
 * - Regular session hours and exchange time zone: the information table marks a session as open only when the
 *   market is open (session.ismarket: the last bar is in the regular session). Without the hours every bar is
 *   taken as a market bar.
 *
 * Reference: "FX Market Sessions" by boitoki
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © boitoki
 */

import {
  color, str, array, callsite, timeframe, time as pineTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type {
  MarkerData, LineDrawingData, BoxData, LabelData, LinefillData, TableData, TableCellData, TableMergeData, PineSize,
  BarColorData, PlotCandleData, LabelStyle,
} from '../types';
import { barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import { mintickOf, tickerOf, timezoneOf, type ChartContext } from '../chart-context';

type YesNo = 'Yes' | '× No';
type ChartOption = 'Bar color' | 'Candles' | '× No';
type BorderOption = '────' | '- - - - - -' | '•••••••••';
type ColorOption = 'Session color' | 'Red • Green';

export interface FxMarketSessionsInputs {
  /** Time zone of the session hours ("GMT+0", "GMT-5", "GMT+330" ...) */
  tz: string;
  /** Number of past sessions kept on the chart */
  historyPeriod: number;
  showSess1: boolean;
  sess1Label: string;
  sess1Color: string;
  sess1BarColor1: string;
  sess1BarColor2: string;
  sess1: string;
  sess1Extend: YesNo;
  sess1Op: YesNo;
  sess1Fib: YesNo;
  sess1Chart: ChartOption;
  showSess2: boolean;
  sess2Label: string;
  sess2Color: string;
  sess2BarColor1: string;
  sess2BarColor2: string;
  sess2: string;
  sess2Extend: YesNo;
  sess2Op: YesNo;
  sess2Fib: YesNo;
  sess2Chart: ChartOption;
  showSess3: boolean;
  sess3Label: string;
  sess3Color: string;
  sess3BarColor1: string;
  sess3BarColor2: string;
  sess3: string;
  sess3Extend: YesNo;
  sess3Op: YesNo;
  sess3Fib: YesNo;
  sess3Chart: ChartOption;
  showSess4: boolean;
  sess4Label: string;
  sess4Color: string;
  sess4BarColor1: string;
  sess4BarColor2: string;
  sess4: string;
  sess4Extend: YesNo;
  sess4Op: YesNo;
  sess4Fib: YesNo;
  sess4Chart: ChartOption;
  boxStyle: 'Box' | 'Background' | 'Hamburger' | 'Sandwich';
  borderStyle: BorderOption;
  borderWidth: number;
  boxBackground: boolean;
  boxDots: boolean;
  /** Include the latest bar in the session end */
  endOffset: boolean;
  labelShow: boolean;
  labelSize: 'Auto' | 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  labelPositionY: 'Top' | 'Bottom';
  labelPositionS: 'Inside' | 'Outside';
  labelFormatName: boolean;
  labelFormatDay: boolean;
  labelFormatPrice: boolean;
  labelFormatPips: boolean;
  /** Length of the opening range in minutes */
  oMinutes: number;
  oSize: PineSize;
  oColor: ColorOption;
  /** Text of the upper label ("price" shows the price) */
  oLabel1: string;
  oLabel2: string;
  oLabelColor: 'black' | 'white';
  oNowOnly: boolean;
  oBreakoutIcon: boolean;
  oTarget: boolean;
  oTargetBoxes: boolean;
  showOpTable: boolean;
  showCandle: boolean;
  candle: 'OHLC' | 'OC';
  candleBorderWidth: number;
  candleColor: ColorOption;
  candleColorG: string;
  candleColorR: string;
  fShow: boolean;
  fLineStyle: BorderOption;
  fLineWidth: number;
  showInfo: boolean;
  infoSize: PineSize;
  infoValueType: 'Price' | 'Pips';
  infoPeriod: number;
  alert1Show: boolean;
  alert2Show: boolean;
  alert3Show: boolean;
}

const OPTION_YES = 'Yes';
const OPTION_NO = '× No';
const BORDER_STYLE1 = '────';
const BORDER_STYLE2 = '- - - - - -';
const BORDER_STYLE3 = '•••••••••';
const OPTION_CHART_1 = 'Bar color';
const OPTION_CHART_2 = 'Candles';
const OPTION_CANDLE_COLOR1 = 'Session color';
const OPTION_CANDLE_COLOR2 = 'Red • Green';
const OPTION_CANDLE_BODY = 'OC';
const OPTION_CANDLE_WICK = 'OHLC';

export const defaultInputs: FxMarketSessionsInputs = {
  tz: 'GMT+0',
  historyPeriod: 10,
  showSess1: true,
  sess1Label: 'London',
  sess1Color: '#66D9EF',
  sess1BarColor1: '#66D9EF',
  sess1BarColor2: '#66D9EF',
  sess1: '0800-1700',
  sess1Extend: OPTION_NO,
  sess1Op: OPTION_NO,
  sess1Fib: OPTION_NO,
  sess1Chart: OPTION_NO,
  showSess2: true,
  sess2Label: 'New York',
  sess2Color: '#FD971F',
  sess2BarColor1: '#FD971F',
  sess2BarColor2: '#FD971F',
  sess2: '1300-2200',
  sess2Extend: OPTION_NO,
  sess2Op: OPTION_NO,
  sess2Fib: OPTION_NO,
  sess2Chart: OPTION_NO,
  showSess3: true,
  sess3Label: 'Tokyo',
  sess3Color: '#AE81FF',
  sess3BarColor1: '#AE81FF',
  sess3BarColor2: '#AE81FF',
  sess3: '0000-0900',
  sess3Extend: OPTION_NO,
  sess3Op: OPTION_NO,
  sess3Fib: OPTION_NO,
  sess3Chart: OPTION_NO,
  showSess4: false,
  sess4Label: 'Sydney',
  sess4Color: '#FB71A3',
  sess4BarColor1: '#FB71A3',
  sess4BarColor2: '#FB71A3',
  sess4: '2000-0500',
  sess4Extend: OPTION_NO,
  sess4Op: OPTION_NO,
  sess4Fib: OPTION_NO,
  sess4Chart: OPTION_NO,
  boxStyle: 'Box',
  borderStyle: BORDER_STYLE2,
  borderWidth: 1,
  boxBackground: true,
  boxDots: true,
  endOffset: true,
  labelShow: true,
  labelSize: 'Small',
  labelPositionY: 'Top',
  labelPositionS: 'Outside',
  labelFormatName: true,
  labelFormatDay: false,
  labelFormatPrice: false,
  labelFormatPips: false,
  oMinutes: 15,
  oSize: 'small',
  oColor: OPTION_CANDLE_COLOR2,
  oLabel1: 'price',
  oLabel2: 'price',
  oLabelColor: 'white',
  oNowOnly: false,
  oBreakoutIcon: false,
  oTarget: false,
  oTargetBoxes: false,
  showOpTable: false,
  showCandle: false,
  candle: OPTION_CANDLE_WICK,
  candleBorderWidth: 1,
  candleColor: OPTION_CANDLE_COLOR1,
  candleColorG: '#A6E22E',
  candleColorR: '#F92672',
  fShow: true,
  fLineStyle: BORDER_STYLE1,
  fLineWidth: 1,
  showInfo: true,
  infoSize: 'small',
  infoValueType: 'Pips',
  infoPeriod: 50,
  alert1Show: false,
  alert2Show: false,
  alert3Show: false,
};

const TIMEZONES = ['GMT-11', 'GMT-10', 'GMT-9', 'GMT-8', 'GMT-7', 'GMT-6', 'GMT-5', 'GMT-4', 'GMT-3', 'GMT-2', 'GMT-1',
  'GMT+0', 'GMT+1', 'GMT+2', 'GMT+3', 'GMT+330', 'GMT+4', 'GMT+430', 'GMT+5', 'GMT+530', 'GMT+6', 'GMT+7', 'GMT+8',
  'GMT+9', 'GMT+10', 'GMT+11', 'GMT+12'];
const SIZES = ['auto', 'tiny', 'small', 'normal', 'large', 'huge'];
const BORDER_STYLES = [BORDER_STYLE1, BORDER_STYLE2, BORDER_STYLE3];
const YES_NO = [OPTION_YES, OPTION_NO];

const G0 = '// GENERAL //';
const G4 = '// BOX //';
const G6 = '// LABELS //';
const G5 = '// OPENING RANGE //';
const G7 = '// FIBONACCI LEVELS //';
const G11 = '// CANDLE //';
const G10 = '// ALERTS VISUALISED //';
const G12 = '// INFORMATION //';

const SESSION_DEFAULTS: Array<[number, boolean, string, string, string]> = [
  [1, true, 'London', '#66D9EF', '0800-1700'],
  [2, true, 'New York', '#FD971F', '1300-2200'],
  [3, true, 'Tokyo', '#AE81FF', '0000-0900'],
  [4, false, 'Sydney', '#FB71A3', '2000-0500'],
];

const sessionInputs = ([k, show, name, col, hours]: [number, boolean, string, string, string]): InputConfig[] => {
  const group = `// ♯${k} SESSION //`;
  const inline = `session${k}_1`;
  return [
    { id: `showSess${k}`, type: 'bool', title: `Session ${k} `, defval: show, group, inline },
    { id: `sess${k}Label`, type: 'string', title: '', defval: name, group, inline },
    { id: `sess${k}Color`, type: 'color', title: '', defval: col, group, inline },
    { id: `sess${k}BarColor1`, type: 'color', title: '•', defval: col, group, inline },
    { id: `sess${k}BarColor2`, type: 'color', title: '', defval: col, group, inline },
    { id: `sess${k}`, type: 'session', title: 'Time', defval: hours, group },
    { id: `sess${k}Extend`, type: 'string', title: 'Extend', defval: OPTION_NO, options: YES_NO, group },
    { id: `sess${k}Op`, type: 'string', title: 'Opening range', defval: OPTION_NO, options: YES_NO, group },
    { id: `sess${k}Fib`, type: 'string', title: 'Fibonacci levels', defval: OPTION_NO, options: YES_NO, group },
    { id: `sess${k}Chart`, type: 'string', title: 'Bar', defval: OPTION_NO,
      options: [OPTION_CHART_1, OPTION_CHART_2, OPTION_NO], group },
  ];
};

export const inputConfig: InputConfig[] = [
  { id: 'tz', type: 'string', title: 'Timezone', defval: 'GMT+0', options: TIMEZONES, group: G0 },
  { id: 'historyPeriod', type: 'int', title: 'History', defval: 10, min: 1, group: G0 },
  ...SESSION_DEFAULTS.flatMap(sessionInputs),
  { id: 'boxStyle', type: 'string', title: '', defval: 'Box', options: ['Box', 'Background', 'Hamburger', 'Sandwich'],
    group: G4, inline: 'box_style' },
  { id: 'borderStyle', type: 'string', title: '', defval: BORDER_STYLE2, options: BORDER_STYLES, group: G4,
    inline: 'box_style' },
  { id: 'borderWidth', type: 'int', title: '', defval: 1, min: 0, group: G4, inline: 'box_style' },
  { id: 'boxBackground', type: 'bool', title: 'BG color', defval: true, group: G4, inline: 'box_style_options' },
  { id: 'boxDots', type: 'bool', title: 'Dots', defval: true, group: G4, inline: 'box_style_options' },
  { id: 'endOffset', type: 'bool', title: 'Include the latest bar in the Session end', defval: true, group: G4 },
  { id: 'labelShow', type: 'bool', title: '', defval: true, group: G6, inline: 'label_show' },
  { id: 'labelSize', type: 'string', title: '', defval: 'Small',
    options: ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: G6, inline: 'label_show' },
  { id: 'labelPositionY', type: 'string', title: '', defval: 'Top', options: ['Top', 'Bottom'], group: G6,
    inline: 'label_show' },
  { id: 'labelPositionS', type: 'string', title: '', defval: 'Outside', options: ['Inside', 'Outside'], group: G6,
    inline: 'label_show' },
  { id: 'labelFormatName', type: 'bool', title: 'Name', defval: true, group: G6, inline: 'label_format' },
  { id: 'labelFormatDay', type: 'bool', title: 'Day', defval: false, group: G6, inline: 'label_format' },
  { id: 'labelFormatPrice', type: 'bool', title: 'Price', defval: false, group: G6, inline: 'label_format' },
  { id: 'labelFormatPips', type: 'bool', title: 'Pips', defval: false, group: G6, inline: 'label_format' },
  { id: 'oMinutes', type: 'int', title: 'Periods mins', defval: 15, min: 1, step: 1, group: G5 },
  { id: 'oSize', type: 'string', title: 'Label size', defval: 'small', options: SIZES, group: G5 },
  { id: 'oColor', type: 'string', title: 'Label color   ', defval: OPTION_CANDLE_COLOR2,
    options: [OPTION_CANDLE_COLOR1, OPTION_CANDLE_COLOR2], group: G5, inline: 'op_label_color' },
  { id: 'oLabel1', type: 'string', title: 'Label text    ', defval: 'price', group: G5, inline: 'op_label',
    tooltip: 'Type "price" to display the price' },
  { id: 'oLabel2', type: 'string', title: '', defval: 'price', group: G5, inline: 'op_label' },
  { id: 'oLabelColor', type: 'string', title: '', defval: 'white', options: ['black', 'white'], group: G5,
    inline: 'op_label_color' },
  { id: 'oNowOnly', type: 'bool', title: 'Current session only', defval: false, group: G5, inline: 'op_options' },
  { id: 'oBreakoutIcon', type: 'bool', title: 'Breakout flag', defval: false, group: G5, inline: 'op_options' },
  { id: 'oTarget', type: 'bool', title: 'Target lines', defval: false, group: G5, inline: 'op_options' },
  { id: 'oTargetBoxes', type: 'bool', title: 'Target boxes', defval: false, group: G5, inline: 'op_options' },
  { id: 'showOpTable', type: 'bool', title: 'Data table', defval: false, group: G5 },
  { id: 'showCandle', type: 'bool', title: '', defval: false, group: G11, inline: 'candle_display' },
  { id: 'candle', type: 'string', title: '', defval: OPTION_CANDLE_WICK,
    options: [OPTION_CANDLE_WICK, OPTION_CANDLE_BODY], group: G11, inline: 'candle_display' },
  { id: 'candleBorderWidth', type: 'int', title: '', defval: 1, min: 1, group: G11, inline: 'candle_display' },
  { id: 'candleColor', type: 'string', title: '', defval: OPTION_CANDLE_COLOR1,
    options: [OPTION_CANDLE_COLOR1, OPTION_CANDLE_COLOR2], group: G11, inline: 'candle_display' },
  { id: 'candleColorG', type: 'color', title: '', defval: '#A6E22E', group: G11, inline: 'candle_display' },
  { id: 'candleColorR', type: 'color', title: '', defval: '#F92672', group: G11, inline: 'candle_display' },
  { id: 'fShow', type: 'bool', title: '', defval: true, group: G7, inline: 'fib_display' },
  { id: 'fLineStyle', type: 'string', title: '', defval: BORDER_STYLE1, options: BORDER_STYLES, group: G7,
    inline: 'fib_display' },
  { id: 'fLineWidth', type: 'int', title: '', defval: 1, min: 1, group: G7, inline: 'fib_display' },
  { id: 'showInfo', type: 'bool', title: '', defval: true, group: G12, inline: 'info_display' },
  { id: 'infoSize', type: 'string', title: '', defval: 'small', options: SIZES, group: G12, inline: 'info_display' },
  { id: 'infoValueType', type: 'string', title: '', defval: 'Pips', options: ['Price', 'Pips'], group: G12,
    inline: 'info_display' },
  { id: 'infoPeriod', type: 'int', title: '', defval: 50, group: G12, inline: 'info_display' },
  { id: 'alert1Show', type: 'bool', title: 'Alerts - Sessions stard/end', defval: false, group: G10 },
  { id: 'alert2Show', type: 'bool', title: 'Alerts - Opening range breakouts', defval: false, group: G10 },
  { id: 'alert3Show', type: 'bool', title: "Alerts - Price crossed session's High/Low after session closed",
    defval: false, group: G10 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'sess1_high', color: '#66D9EF', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'sess1_low', color: '#66D9EF', lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'sess2_high', color: '#FD971F', lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'sess2_low', color: '#FD971F', lineWidth: 2, style: 'linebr' },
  { id: 'plot4', title: 'sess3_high', color: '#AE81FF', lineWidth: 1, style: 'linebr' },
  { id: 'plot5', title: 'sess3_low', color: '#AE81FF', lineWidth: 2, style: 'linebr' },
  { id: 'plot6', title: 'sess4_high', color: '#FB71A3', lineWidth: 1, style: 'linebr' },
  { id: 'plot7', title: 'sess4_low', color: '#FB71A3', lineWidth: 2, style: 'linebr' },
];

export const metadata = {
  title: 'FX Market Sessions',
  shortTitle: 'Sessions',
  overlay: true,
};

/** max_lines_count / max_boxes_count / max_labels_count of the script */
const MAX_OBJECTS = 200;
const MAX_BARS = 500;
/** Longest window of ta.highest() / ta.lowest() in Pine */
const MAX_HISTORY = 15000;
const ICON_SEPARATOR = ' • ';
const WHITE = '#FFFFFF';
// TRANSPARENT = color.new(color.black, 100)
const TRANSPARENT = String(color.new(color.black, 100));
const TABLE_TEXT = '#e1e2e4';
const TABLE_BG = '#1a1c20';
const TABLE_FRAME = '#25272c';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// boitoki/AwesomeColor/9: the colours the script uses (platform palette, panda palette, monokai palette)
const AC_BLUE = '#2962ff';
const AC_RED = '#f23645';
const AC_GREEN = '#22ab94';
const AC_YELLOW = '#FFCA3B';
const AC_GRAY = '#5d606b';
const PANDA = { black: '#292A2B', white: '#f3f3f3' };
const MONOKAI_GREEN = '#A6E22E';
const MONOKAI_ORANGE = '#FD971F';
const MONOKAI_RED = '#F92472';
const MONOKAI_GRAY = '#74756F';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

type Style = 'solid' | 'dashed' | 'dotted';
type Extend = 'none' | 'left' | 'right' | 'both';

/** A line / box / label of the script: x in bars (NaN = na), `deleted` after line.delete() or the object limit */
interface LineObj {
  x1: number; y1: number; x2: number; y2: number; color: string; width: number; style: Style; extend: Extend;
  deleted?: boolean;
}
interface BoxObj {
  left: number; top: number; right: number; bottom: number; borderColor: string; borderWidth: number;
  borderStyle: Style; bgColor: string; extend: Extend; deleted?: boolean;
}
interface LabelObj {
  x: number; y: number; text: string; style: LabelStyle; color: string; textColor: string; size: PineSize;
  yloc: 'price' | 'abovebar'; tooltip?: string; textAlign?: 'left'; deleted?: boolean;
}
interface FillObj { line1: LineObj; line2: LineObj; color: string }

/**
 * Live drawings of one kind, in creation order. Pine keeps at most max objects: a creation that brings the count
 * above max + 5 deletes the oldest until max remain. An object that a `var` variable of the script still refers to is
 * not deleted by this rule.
 */
class Pool<T extends { deleted?: boolean }> {
  items: T[] = [];
  private held = new Map<string, T | null>();
  add(o: T): T {
    this.items.push(o);
    if (this.items.length > MAX_OBJECTS + 5) {
      const kept = new Set(this.held.values());
      let excess = this.items.length - MAX_OBJECTS;
      this.items = this.items.filter((x) => {
        if (kept.has(x) || excess <= 0) return true;
        excess--;
        x.deleted = true;
        return false;
      });
    }
    return o;
  }
  /** The `var` variable `name` now refers to `o` (the object it referred to before can be deleted) */
  hold(name: string, o: T | null): T | null {
    this.held.set(name, o);
    return o;
  }
  /** line.delete() / box.delete() / label.delete(); na and deleted objects are left alone */
  remove(o: T | null | undefined): void {
    if (!o || o.deleted) return;
    o.deleted = true;
    const k = this.items.indexOf(o);
    if (k >= 0) this.items.splice(k, 1);
  }
}

/** f_border_style() */
const borderStyle = (s: string): Style => (s === BORDER_STYLE1 ? 'solid' : s === BORDER_STYLE2 ? 'dashed' : 'dotted');

/**
 * Utilities.clear_lines() / clear_labels() / clear_boxes(): when the array has more than max(0, min) objects, the
 * loop `for i = min to array.size(arr)` deletes the first object of the array on each turn. The bound is the size
 * of the array on each turn, so the loop stops early: 2 of 20 objects are deleted with min = 18.
 */
function clear<T>(arr: T[], min: number, remove: (o: T) => void): void {
  if (arr.length > Math.max(0, min)) {
    for (let i = min; i <= arr.length; i++) {
      if (arr.length === 0) throw new Error('FX Market Sessions: array.shift() on an empty array (runtime error of the original)');
      remove(arr.shift() as T);
    }
  }
}

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<FxMarketSessionsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[]; lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; linefills: LinefillData[];
  tables: TableData[]; barColors: BarColorData[]; plotCandles: Record<string, PlotCandleData[]>;
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const inMs = n > 0 && bars[0].time >= 1e12;
  const tz = cfg.tz;
  // syminfo.mintick
  const MINTICK = mintickOf(chart);
  /** Utilities.toPips(): price / (tick * 10) */
  const toPips = (v: number) => v / (MINTICK * 10);
  const hist = Math.trunc(cfg.historyPeriod);
  const tf = chartTimeframe(bars);
  // session.ismarket on the last bar: on intraday bars, the bar is in the regular session hours of the chart context
  // (read in the exchange time zone). Without these hours every bar is taken as a market bar.
  const regular = chart?.regularSession ?? chart?.session;
  const isMarket = n > 0 && tf !== '' && timeframe.in_seconds(tf) < 86400
    && typeof regular === 'string' && /^(24x7|\d{4}-\d{4}(,\d{4}-\d{4})*(:\d+)?)$/.test(regular.trim())
    ? pineTime.inSession(inMs ? bars[n - 1].time : bars[n - 1].time * 1000, regular.trim(), timezoneOf(chart))
    : true;
  const multiplier = tf === '' ? 1 : timeframe.info(tf).multiplier;

  // Styles
  const boxStyle = cfg.boxStyle;
  const sessBorderStyle = borderStyle(cfg.borderStyle);
  const sessBorderWidth = boxStyle === 'Background' ? 0 : Math.trunc(cfg.borderWidth);
  const bgOpacity = cfg.boxBackground ? 94 : 100;
  const bgOpacity2 = cfg.showCandle ? 100 : Math.min(bgOpacity - 4, 100);
  const endOffset = cfg.endOffset ? 0 : 1;
  // Labels
  const labelSize = cfg.labelSize.toLowerCase() as PineSize;
  const labelY = cfg.labelPositionY.toLowerCase();
  const labelSide = cfg.labelPositionS.toLowerCase();
  // f_get_label_position()
  const labelPosition: LabelStyle = labelY === 'top'
    ? (labelSide === 'outside' ? 'label_lower_left' : 'label_upper_left')
    : (labelSide === 'outside' ? 'label_upper_left' : 'label_lower_left');
  // Opening range: i_o_minutes := math.max(i_o_minutes, timeframe.multiplier + 1)
  const oMinutes = Math.max(Math.trunc(cfg.oMinutes), multiplier + 1);
  const O_TRANSP = 50;
  // Candle
  const showCandleWick = cfg.showCandle && cfg.candle === OPTION_CANDLE_WICK;
  const candleBorderWidth = Math.trunc(cfg.candleBorderWidth);
  // Fibonacci levels
  const fLineStyle = borderStyle(cfg.fLineStyle);
  const fLineWidth = Math.trunc(cfg.fLineWidth);
  const infoPeriod = Math.trunc(cfg.infoPeriod);

  const lines = new Pool<LineObj>();
  const boxes = new Pool<BoxObj>();
  const labels = new Pool<LabelObj>();
  const fills: FillObj[] = [];
  const newLine = (x1: number, y1: number, x2: number, y2: number, col: string, width = 1, style: Style = 'solid',
    extend: Extend = 'none') => lines.add({ x1, y1, x2, y2, color: col, width, style, extend });
  const newBox = (left: number, top: number, right: number, bottom: number, borderColor: string, borderWidth: number,
    style: Style, bgColor: string) => boxes.add({ left, top, right, bottom, borderColor, borderWidth, borderStyle: style, bgColor, extend: 'none' });
  const removeLine = (o: LineObj | null) => lines.remove(o);
  const removeBox = (o: BoxObj) => boxes.remove(o);
  const removeLabel = (o: LabelObj) => labels.remove(o);
  // f_set_line_x1() / f_set_line_x2() / f_set_box_right(): set only when the value differs (na never differs)
  const differs = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && a !== b;

  const c = cfg as unknown as Record<string, boolean | string | number>;
  const sessions = [1, 2, 3, 4].map((k) => {
    const extendStyle = c[`sess${k}Extend`] as string;
    return {
      show: c[`showSess${k}`] as boolean,
      sess: c[`sess${k}`] as string,
      name: c[`sess${k}Label`] as string,
      colour: c[`sess${k}Color`] as string,
      barColor1: c[`sess${k}BarColor1`] as string,
      barColor2: c[`sess${k}BarColor2`] as string,
      chart: c[`sess${k}Chart`] as string,
      showOp: (c[`sess${k}Op`] as string) !== OPTION_NO,
      showFib: cfg.fShow && (c[`sess${k}Fib`] as string) !== OPTION_NO,
      // State.is_extended()
      extended: extendStyle !== OPTION_NO,
      // type Session
      priceRanges: [] as number[],
      priceRangeAvg: NaN,
      boxes: [] as BoxObj[],
      lines: [] as LineObj[],
      labels: [] as LabelObj[],
      oclines: [] as LineObj[],
      ocLabels: [] as LabelObj[],
      oprBoxes: [] as BoxObj[],
      oprLines: [] as LineObj[],
      oprLinefills: [] as FillObj[],
      oprLabels: [] as LabelObj[],
      fib: [] as LineObj[],
      candleBody: [] as BoxObj[],
      candleWick: [] as Array<LineObj | null>,
      inSession: false,
      ohlc: { open: NaN, high: NaN, low: NaN, hl: NaN },
      op: { total: 0, reached: 0, reachedR1: 0, reachedR2: 0, reachedS1: 0, reachedS2: 0 },
      startBar: 0,
      // history of the session value and of top / bottom (the previous bar)
      prevIn: false,
      prevTop: NaN,
      prevBottom: NaN,
      // draw(): ta.highest(high, max) / ta.lowest(low, max)
      highest: callsite.highest(),
      lowest: callsite.lowest(),
      // f_render_main(): var x1, x2 and the two ta.valuewhen() calls
      x1: 0,
      x2: 0,
      prevStart: NaN,
      lastStart: NaN,
      lastEnd: NaN,
      // f_render_session()
      myBox: null as BoxObj | null,
      // f_render_dots()
      dotOpen: NaN,
      ocLineU: null as LineObj | null,
      ocLineL: null as LineObj | null,
      // f_render_sessionrange()
      aboveLine: null as LineObj | null,
      belowLine: null as LineObj | null,
      // f_render_candle()
      body: null as BoxObj | null,
      wick1: null as LineObj | null,
      wick2: null as LineObj | null,
      // f_render_label()
      myLabel: null as LabelObj | null,
      labelStartTime: NaN,
      // f_render_oprange()
      opStartTime: NaN,
      opLabel1: null as LabelObj | null,
      opLabel2: null as LabelObj | null,
      isOpened: false,
      R1: NaN,
      R2: NaN,
      S1: NaN,
      S2: NaN,
      reachedR1: false,
      reachedR2: false,
      reachedS1: false,
      reachedS2: false,
      savedTop: NaN,
      opHighest: callsite.highest(),
      opLowest: callsite.lowest(),
      crossR1: callsite.crossover(),
      crossR2: callsite.crossover(),
      crossS1: callsite.crossunder(),
      crossS2: callsite.crossunder(),
      // f_render_current_line()
      currentLine: null as LineObj | null,
      // f_render_fibonacci(), three call sites
      fibLines: [null, null, null] as Array<LineObj | null>,
      // plotshape(): ta.crossover(close, high) / ta.crossunder(close, low) on the bars outside the session
      crossHigh: callsite.crossover(),
      crossLow: callsite.crossunder(),
    };
  });
  type Session = (typeof sessions)[number];

  /** Session.add(): the range of a finished session and the average of the last ranges */
  const addRange = (s: Session, range: number) => {
    s.priceRanges.unshift(range);
    if (s.priceRanges.length > infoPeriod) s.priceRanges.pop();
    s.priceRangeAvg = array.avg(s.priceRanges);
  };

  const plots: Record<string, Point[]> = {};
  for (let k = 0; k < 8; k++) plots[`plot${k}`] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const candles: PlotCandleData[] = [];
  const infoCells = new Map<string, TableCellData>();
  const infoMerges: TableMergeData[] = [];
  const opCells = new Map<string, TableCellData>();
  const opMerges: TableMergeData[] = [];

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const { time, open, high, low, close } = bar;
    const tMs = inMs ? time : time * 1000;
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    const isSess: boolean[] = [];

    sessions.forEach((s, k) => {
      // ---- draw() ----
      // Session.update(): t = time(timeframe.period, sess, tz)
      const inS = pineTime.inSession(tMs, s.sess, tz);
      const started = inS && !s.prevIn;
      const ended = !inS && s.prevIn;
      if (started) s.startBar = i;
      const max = i - s.startBar + 1;
      // The original stops here when a session has had no bar for 15,000 bars (e.g. a night session on a stock)
      if (max > MAX_HISTORY) {
        throw new Error(`The 'highest' function references too many historical candles (${max}), the limit is ${MAX_HISTORY}.`);
      }
      const top = s.highest(high, max);
      const bottom = s.lowest(low, max);
      const col = s.colour;
      const show = s.show;
      const site = (name: string) => `${k}:${name}`;

      // ---- f_render_main() ----
      if (started) {
        s.prevStart = s.lastStart;
        s.lastStart = i;
      }
      if (ended) s.lastEnd = i;
      // x0_d = math.min(math.abs(x0_2 - x0_1), MAX_BARS): the length of the previous session
      const x0d = Math.min(Math.abs(s.lastEnd - s.prevStart), MAX_BARS);
      if (show) {
        if (started) {
          s.x1 = i;
          s.x2 = i + x0d;
          s.ohlc.open = open;
          s.ohlc.high = top;
          s.ohlc.low = bottom;
          s.ohlc.hl = top - bottom;
          s.inSession = true;
        } else if (inS) {
          const trueX2 = s.x1 + x0d;
          s.x2 = Math.min(trueX2, i + MAX_BARS);
          s.ohlc.high = top;
          s.ohlc.low = bottom;
          s.ohlc.hl = top - bottom;
        } else if (ended) {
          s.inSession = false;
          s.ohlc.open = NaN;
        }
      }
      const { x1, x2 } = s;

      if (boxStyle === 'Box' || boxStyle === 'Background') {
        // ---- f_render_session() ----
        if (show) {
          if (started) {
            clear(s.boxes, s.extended ? 0 : hist - 1, removeBox);
            s.myBox = newBox(x1, top, x2, bottom, col, sessBorderWidth, sessBorderStyle, String(color.new(col, bgOpacity)));
            boxes.hold(site('box'), s.myBox);
            s.boxes.push(s.myBox);
            if (s.extended) s.myBox.extend = 'right';
          } else if (inS) {
            if (s.myBox) {
              s.myBox.top = top;
              s.myBox.bottom = bottom;
              if (differs(s.myBox.right, x2)) s.myBox.right = x2;
            }
          } else if (ended) {
            if (s.myBox) s.myBox.right = x2 - endOffset;
            addRange(s, s.prevTop - s.prevBottom);
          }
        }
        // ---- f_render_dots() ----
        if (show && cfg.boxDots) {
          if (started) {
            clear(s.oclines, s.extended ? 0 : hist * 2 - 2, removeLine);
            clear(s.ocLabels, s.extended ? 0 : Math.max(0, hist * 2 - 2), removeLabel);
            const dotColor = String(color.new(col, 70));
            s.ocLineU = newLine(x1, open, x2, open, dotColor, 1, 'dotted');
            s.ocLineL = newLine(x1, close, x2, close, dotColor, 1, 'dotted');
            lines.hold(site('ocU'), s.ocLineU);
            lines.hold(site('ocL'), s.ocLineL);
            fills.push({ line1: s.ocLineU, line2: s.ocLineL, color: String(color.new(col, bgOpacity2)) });
            s.oclines.push(s.ocLineU, s.ocLineL);
            s.dotOpen = open;
          } else if (inS) {
            if (s.ocLineU) s.ocLineU.x2 = x2;
            if (s.ocLineL) {
              s.ocLineL.x2 = x2;
              s.ocLineL.y1 = close;
              s.ocLineL.y2 = close;
            }
          } else if (ended) {
            // Dot.create()
            const dot = (x: number, y: number, text: string) => labels.add({
              x, y, text, style: 'label_center', color: TRANSPARENT, textColor: col, size: 'small', yloc: 'price',
            });
            s.ocLabels.push(dot(x1, s.dotOpen, '●'));
            s.ocLabels.push(dot(x2 - endOffset, prevClose, '◉'));
            if (s.ocLineU) s.ocLineU.x2 = x2 - endOffset;
            if (s.ocLineL) {
              s.ocLineL.x2 = x2 - endOffset;
              s.ocLineL.y1 = prevClose;
              s.ocLineL.y2 = prevClose;
            }
            s.dotOpen = NaN;
          }
        }
      } else if (boxStyle === 'Hamburger' || boxStyle === 'Sandwich') {
        // ---- f_render_sessionrange() ----
        const vertical = boxStyle === 'Sandwich';
        if (show) {
          if (started) {
            clear(s.lines, s.extended ? 0 : hist * 2 - 2, removeLine);
            if (vertical) {
              s.aboveLine = newLine(x1, top, x1, bottom, col, sessBorderWidth, sessBorderStyle);
              s.belowLine = newLine(x2, top, x2, bottom, col, sessBorderWidth, sessBorderStyle);
            } else {
              s.aboveLine = newLine(x1, top, x2, top, col, sessBorderWidth, sessBorderStyle);
              s.belowLine = newLine(x1, bottom, x2, bottom, col, sessBorderWidth, sessBorderStyle);
            }
            lines.hold(site('above'), s.aboveLine);
            lines.hold(site('below'), s.belowLine);
            fills.push({ line1: s.aboveLine, line2: s.belowLine, color: String(color.new(col, bgOpacity)) });
            s.lines.push(s.aboveLine, s.belowLine);
            if (s.extended) {
              s.aboveLine.extend = vertical ? 'both' : 'right';
              s.belowLine.extend = vertical ? 'both' : 'right';
            }
          } else if (inS) {
            if (s.aboveLine && s.belowLine) {
              if (vertical) {
                s.aboveLine.y1 = bottom;
                s.aboveLine.y2 = top;
                s.belowLine.y1 = bottom;
                s.belowLine.y2 = top;
              } else {
                s.aboveLine.y1 = top;
                s.aboveLine.y2 = top;
                s.aboveLine.x2 = x2;
                s.belowLine.y1 = bottom;
                s.belowLine.y2 = bottom;
                s.belowLine.x2 = x2;
              }
            }
          } else if (ended) {
            if (vertical) {
              if (s.belowLine) {
                s.belowLine.x1 = x2 - endOffset;
                s.belowLine.x2 = x2 - endOffset;
              }
            } else {
              if (s.aboveLine) s.aboveLine.x2 = x2 - endOffset;
              if (s.belowLine) s.belowLine.x2 = x2 - endOffset;
            }
            addRange(s, s.prevTop - s.prevBottom);
          }
        }
      }

      if (cfg.showCandle) {
        // ---- f_render_candle() ----
        const sessOpen = s.ohlc.open;
        // cx = math.round(math.avg(_x2, _x1)) - math.round(border_width / 2)
        const cx = Math.round((x2 + x1) / 2) - Math.round(candleBorderWidth / 2);
        const baseColor = cfg.candleColor === OPTION_CANDLE_COLOR2
          ? (gt(close, sessOpen) ? cfg.candleColorG : cfg.candleColorR) : col;
        const bodyColor = String(color.new(baseColor, 30));
        if (show) {
          if (started) {
            s.body = newBox(x1, top, x2, bottom, bodyColor, candleBorderWidth, 'solid', TRANSPARENT);
            s.wick1 = showCandleWick ? newLine(cx, top, cx, top, bodyColor, candleBorderWidth) : null;
            s.wick2 = showCandleWick ? newLine(cx, bottom, cx, bottom, bodyColor, candleBorderWidth) : null;
            boxes.hold(site('body'), s.body);
            lines.hold(site('wick1'), s.wick1);
            lines.hold(site('wick2'), s.wick2);
            s.candleBody.push(s.body);
            s.candleWick.push(s.wick1, s.wick2);
            clear(s.candleBody, hist, removeBox);
            clear(s.candleWick, hist * 2, removeLine);
          } else if (inS) {
            const bodyTop = Math.max(sessOpen, close);
            const bodyBottom = Math.min(sessOpen, close);
            if (s.body) {
              s.body.top = bodyTop;
              s.body.bottom = bodyBottom;
              s.body.right = x2;
              s.body.borderColor = bodyColor;
            }
            if (s.wick1) {
              s.wick1.y1 = top;
              s.wick1.y2 = bodyTop;
              if (differs(s.wick1.x1, cx)) s.wick1.x1 = cx;
              if (differs(s.wick1.x2, cx)) s.wick1.x2 = cx;
              s.wick1.color = bodyColor;
            }
            if (s.wick2) {
              s.wick2.y1 = bottom;
              s.wick2.y2 = bodyBottom;
              if (differs(s.wick2.x1, cx)) s.wick2.x1 = cx;
              if (differs(s.wick2.x2, cx)) s.wick2.x2 = cx;
              s.wick2.color = bodyColor;
            }
          } else if (ended) {
            if (s.body) s.body.right = i - endOffset;
          }
        }
      }

      if (cfg.labelShow) {
        // ---- f_render_label() ----
        const y = labelY === 'top' ? top : bottom;
        const chg = top - bottom;
        if (started) s.labelStartTime = tMs;
        const parts: string[] = [];
        if (cfg.labelFormatName) parts.push(s.name);
        if (cfg.labelFormatDay) {
          // util.get_day(dayofweek(start_time, i_tz))
          parts.push(Number.isNaN(s.labelStartTime) ? '' : DAYS[pineTime.dayofweek(s.labelStartTime, tz) - 1]);
        }
        if (cfg.labelFormatPrice) parts.push(str.format('{0,number,#.#####}', chg));
        if (cfg.labelFormatPips) parts.push(str.format('{0,number,#.#}', toPips(chg)));
        const text = parts.join(ICON_SEPARATOR);
        if (show) {
          if (started) {
            clear(s.labels, s.extended ? 0 : hist - 1, removeLabel);
            s.myLabel = labels.add({
              x: i, y, text, textColor: col, color: TRANSPARENT, size: labelSize, style: labelPosition, yloc: 'price',
              tooltip: 'Pips',
            });
            labels.hold(site('label'), s.myLabel);
            s.labels.push(s.myLabel);
          } else if (inS && s.myLabel) {
            s.myLabel.y = y;
            s.myLabel.text = text;
          }
        }
      }

      if (s.showOp) {
        // ---- f_render_oprange() ----
        const opTop = s.opHighest(high, max);
        const opBtm = s.opLowest(low, max);
        if (show) {
          if (started) {
            const keep = s.extended ? 0 : Math.max(0, (hist - 1) * 2);
            clear(s.oprBoxes, keep, removeBox);
            clear(s.oprLines, keep, removeLine);
            clear(s.oprLabels, keep, removeLabel);
            s.opStartTime = tMs;
            s.isOpened = true;
          } else if (inS) {
            const timeOp = s.opStartTime + oMinutes * 60 * 1000;
            // f_get_time_by_bar(1) = timeframe.multiplier * 60 * 1000
            const timeOpDelay = timeOp - multiplier * 60 * 1000;
            if (tMs <= timeOp && tMs > timeOpDelay) {
              const redGreen = cfg.oColor === OPTION_CANDLE_COLOR2;
              const topColor = redGreen ? AC_BLUE : col;
              const btmColor = redGreen ? AC_RED : col;
              const labelText = PANDA[cfg.oLabelColor];
              const topTextColor = String(color.from_gradient(85, 0, 100, topColor, labelText));
              const botTextColor = String(color.from_gradient(85, 0, 100, btmColor, labelText));
              const extend: Extend = s.extended ? 'right' : 'none';
              const mdl = (opTop + opBtm) / 2;
              const avg1 = (s.priceRangeAvg * 0.786) * 0.5;
              const avg2 = (s.priceRangeAvg * 1.272) * 0.5;
              s.savedTop = opTop;
              s.R1 = (opBtm + mdl) / 2 + avg1;
              s.R2 = (opBtm + mdl) / 2 + avg2;
              s.S1 = (opTop + mdl) / 2 - avg1;
              s.S2 = (opTop + mdl) / 2 - avg2;
              // box.new() without a border colour: the default (blue), with a width of 0
              s.oprBoxes.push(newBox(x1, opTop, i, opBtm, '#2962FF', 0, 'solid', String(color.new(AC_YELLOW, O_TRANSP))));
              s.oprLines.push(newLine(x1, opTop, x2, opTop, topColor, 1, 'dotted', extend));
              s.oprLines.push(newLine(x1, opBtm, x2, opBtm, btmColor, 1, 'dotted', extend));
              const topTarget = cfg.oTarget ? String(color.new(topColor, 40)) : TRANSPARENT;
              const btmTarget = cfg.oTarget ? String(color.new(btmColor, 40)) : TRANSPARENT;
              s.oprLines.push(newLine(x1, s.R2, x2, s.R2, topTarget, 1, 'solid', extend));
              s.oprLines.push(newLine(x1, s.S2, x2, s.S2, btmTarget, 1, 'solid', extend));
              s.oprLines.push(newLine(x1, s.R1, x2, s.R1, topTarget, 1, 'solid', extend));
              s.oprLines.push(newLine(x1, s.S1, x2, s.S1, btmTarget, 1, 'solid', extend));
              s.oprBoxes.push(newBox(x1, s.R1, x1 + 1, s.R2, '#2962FF', 0, 'solid',
                cfg.oTargetBoxes ? String(color.new(topColor, O_TRANSP)) : TRANSPARENT));
              s.oprBoxes.push(newBox(x1, s.S1, x1 + 1, s.S2, '#2962FF', 0, 'solid',
                cfg.oTargetBoxes ? String(color.new(btmColor, O_TRANSP)) : TRANSPARENT));
              if (cfg.oTarget) {
                const m = s.oprLines.length;
                const fillS = { line1: s.oprLines[m - 1], line2: s.oprLines[m - 3], color: String(color.new(btmColor, 96)) };
                const fillR = { line1: s.oprLines[m - 2], line2: s.oprLines[m - 4], color: String(color.new(topColor, 96)) };
                fills.push(fillS, fillR);
                s.oprLinefills.unshift(fillS);
                s.oprLinefills.unshift(fillR);
              }
              const topPrice = str.tostring(opTop, 'mintick', MINTICK);
              const btmPrice = str.tostring(opBtm, 'mintick', MINTICK);
              const t1 = cfg.oLabel1 === 'price' ? topPrice : cfg.oLabel1;
              const t2 = cfg.oLabel2 === 'price' ? btmPrice : cfg.oLabel2;
              s.opLabel1 = labels.add({
                x: x1 - 1, y: opTop, text: t1, yloc: 'price', style: 'label_right', color: topColor,
                textColor: topTextColor, size: cfg.oSize, tooltip: topPrice,
              });
              s.opLabel2 = labels.add({
                x: x1 - 1, y: opBtm, text: t2, yloc: 'price', style: 'label_right', color: btmColor,
                textColor: botTextColor, size: cfg.oSize, tooltip: btmPrice,
              });
              labels.hold(site('op1'), s.opLabel1);
              labels.hold(site('op2'), s.opLabel2);
              s.oprLabels.push(s.opLabel1, s.opLabel2);
            } else if (s.isOpened) {
              // The four crossing calls only run on these bars: they compare with the last bar of this branch
              const flag = (y: number, textColor: string) => {
                if (cfg.oBreakoutIcon) {
                  labels.add({ x: i, y, text: '×', yloc: 'price', style: 'label_center', color: TRANSPARENT, textColor, size: 'large' });
                }
              };
              if (s.crossR1(high, s.R1) && !s.reachedR1) {
                s.reachedR1 = true;
                flag(high, AC_BLUE);
              }
              if (s.crossR2(high, s.R2) && !s.reachedR2) {
                s.reachedR2 = true;
                flag(high, AC_BLUE);
              }
              if (s.crossS1(low, s.S1) && !s.reachedS1) {
                s.reachedS1 = true;
                flag(low, AC_RED);
              }
              if (s.crossS2(low, s.S2) && !s.reachedS2) {
                s.reachedS2 = true;
                flag(low, AC_RED);
              }
            }
          } else if (ended) {
            if (cfg.oNowOnly) {
              clear(s.oprLines, -1, removeLine);
              clear(s.oprLabels, -1, removeLabel);
              clear(s.oprBoxes, -1, removeBox);
            } else if (s.oprLines.length > 0) {
              for (let j = 0; j <= 5; j++) {
                const k2 = s.oprLines.length - (j + 1);
                if (k2 < -s.oprLines.length) throw new Error(`In 'array.get()' function. Index ${k2} is out of bounds, array size is ${s.oprLines.length}.`);
                s.oprLines[(k2 + s.oprLines.length) % s.oprLines.length].x2 = x2 - endOffset;
              }
              for (let j = 0; j <= 1; j++) {
                const m = s.oprLabels.length;
                const k2 = m - (j + 1);
                // The original stops here when a session ends with opening range lines but no opening range label
                if (m === 0 || k2 < -m) throw new Error(`In 'array.get()' function. Index ${k2} is out of bounds, array size is ${m}.`);
                const l = s.oprLabels[(k2 + m) % m];
                l.text = '';
                l.style = 'label_center';
                l.textColor = cfg.oColor === OPTION_CANDLE_COLOR2 ? (ge(l.y, s.savedTop) ? AC_BLUE : AC_RED) : col;
                l.color = TRANSPARENT;
                l.size = 'tiny';
                l.x = x1;
              }
            }
            const any = s.reachedR1 || s.reachedR2 || s.reachedS1 || s.reachedS2;
            s.op.total += 1;
            if (any) s.op.reached += 1;
            if (s.reachedR1) s.op.reachedR1 += endOffset;
            if (s.reachedR2) s.op.reachedR2 += endOffset;
            if (s.reachedS1) s.op.reachedS1 += endOffset;
            if (s.reachedS2) s.op.reachedS2 += endOffset;
            s.R1 = NaN;
            s.R2 = NaN;
            s.S1 = NaN;
            s.S2 = NaN;
            s.reachedR1 = false;
            s.reachedR2 = false;
            s.reachedS1 = false;
            s.reachedS2 = false;
            s.isOpened = false;
            s.savedTop = NaN;
          }
        }
        // ---- f_render_current_line() ----
        if (show) {
          if (started) {
            s.currentLine = newLine(x1, close, x1 + 2, close, col, 3);
            lines.hold(site('current'), s.currentLine);
          } else if (inS) {
            if (s.currentLine) {
              s.currentLine.y1 = close;
              s.currentLine.y2 = close;
            }
          } else if (ended) {
            removeLine(s.currentLine);
          }
        }
      }

      if (s.showFib) {
        if (started) clear(s.fib, s.extended ? -1 : hist * 3 - 4, removeLine);
        // ---- f_render_fibonacci(), three call sites ----
        const levels: Array<[number, number, Style]> = [[0.5, 2, 'solid'], [0.628, fLineWidth, fLineStyle], [0.382, fLineWidth, fLineStyle]];
        levels.forEach(([level, width, style], f) => {
          if (!show) return;
          const y = (top - bottom) * level + bottom;
          const line = s.fibLines[f];
          if (started) {
            const created = newLine(x1, y, x2, y, String(color.new(col, 30)), width, style);
            s.fibLines[f] = created;
            lines.hold(site(`fib${f}`), created);
            s.fib.push(created);
            if (s.extended) created.extend = 'right';
          } else if (inS) {
            if (line) {
              line.y1 = y;
              line.y2 = y;
              if (differs(line.x2, x2)) line.x2 = x2;
            }
          } else if (ended) {
            if (line && differs(line.x2, x2 - endOffset)) line.x2 = x2 - endOffset;
          }
        });
      }
      // f_render_limitmessage(): the warning needs more than 500 bars to the right, which x0_d never gives

      // _top[1] / _bottom[1] of the next bar
      s.prevTop = top;
      s.prevBottom = bottom;
      isSess.push(inS);
    });

    // ---- Bar colours and candles ----
    const positive = gt(close, open);
    let barColor: string | null = null;
    let candleColor: string | null = null;
    sessions.forEach((s, k) => {
      if (s.chart !== OPTION_NO && isSess[k]) {
        const sessColor = positive ? s.barColor1 : s.barColor2;
        barColor = s.chart === OPTION_CHART_1 ? sessColor : null;
        candleColor = s.chart === OPTION_CHART_2 ? sessColor : null;
      }
    });
    if (barColor !== null) barColors.push({ time, color: barColor });
    // plotcandle(open, high, low, close, color = is_positive_bar ? TRANSPARENT : c_plotcandle, ...)
    const lineColor = candleColor ?? 'transparent';
    candles.push({ time, open, high, low, close, color: positive ? TRANSPARENT : lineColor, borderColor: lineColor, wickColor: lineColor });

    // ---- Alerts visualised ----
    sessions.forEach((s, k) => {
      if (cfg.alert1Show && s.show) {
        const alertLabel = (x: number, text: string) => labels.add({
          x, y: close, text, yloc: 'abovebar', color: s.colour, textColor: WHITE, size: 'small', style: 'label_down',
        });
        if (isSess[k] && !s.prevIn) alertLabel(i, 'Start');
        if (!isSess[k] && s.prevIn) alertLabel(i - endOffset, 'End');
      }
    });
    sessions.forEach((s, k) => {
      plots[`plot${2 * k}`].push({ time, value: cfg.alert3Show ? s.ohlc.high : NaN, color: s.colour });
      plots[`plot${2 * k + 1}`].push({ time, value: cfg.alert3Show ? s.ohlc.low : NaN, color: s.colour });
    });
    sessions.forEach((s, k) => {
      // i_alert3_show and (not is_sess) and ta.crossover(...): the crossing calls only run outside the session
      if (!cfg.alert3Show || isSess[k]) return;
      if (s.crossHigh(close, s.ohlc.high)) {
        markers.push({ time, position: 'atPriceMiddle', price: s.ohlc.high, shape: 'triangleUp', color: s.colour, size: 'tiny' });
      }
      if (s.crossLow(close, s.ohlc.low)) {
        markers.push({ time, position: 'atPriceMiddle', price: s.ohlc.low, shape: 'triangleDown', color: s.colour, size: 'tiny' });
      }
    });

    // ---- Information table (last bar) ----
    if (cfg.showInfo && i === n - 1) {
      const data = sessions.filter((s) => s.priceRanges.length > 0);
      const header = String(color.new(TABLE_TEXT, 60));
      const put = (cell: TableCellData) => infoCells.set(`${cell.column}:${cell.row}`, cell);
      put({ column: 0, row: 0, text: 'Session', textColor: header, textSize: cfg.infoSize, textHAlign: 'center' });
      put({ column: 1, row: 0, text: '', textColor: header, textSize: cfg.infoSize });
      put({ column: 2, row: 0, text: 'Cur', textColor: header, textSize: cfg.infoSize });
      put({ column: 3, row: 0, text: `Avg(${str.tostring(infoPeriod)})`, textColor: header, textSize: cfg.infoSize });
      put({ column: 4, row: 0, text: '%', textColor: header, textSize: cfg.infoSize });
      infoMerges.push({ startColumn: 0, startRow: 0, endColumn: 1, endRow: 0 });
      data.forEach((s, r) => {
        // in_session = my_data.in_session and session.ismarket
        const inSession = s.inSession && isMarket;
        const p = s.ohlc.hl / s.priceRangeAvg;
        const curBase = gt(0.75, p) ? MONOKAI_GREEN : gt(1.25, p) ? MONOKAI_ORANGE : MONOKAI_RED;
        const price = cfg.infoValueType === 'Price';
        const v1 = price ? str.tostring(s.ohlc.hl, 'mintick', MINTICK) : str.tostring(toPips(s.ohlc.hl), '#.#');
        const v2 = price ? str.tostring(s.priceRangeAvg, 'mintick', MINTICK) : str.tostring(toPips(s.priceRangeAvg), '#.#');
        const nameColor = inSession ? TABLE_TEXT : String(color.new(MONOKAI_GRAY, 30));
        const indColor = inSession ? AC_GREEN : String(color.new(AC_GRAY, 30));
        const curColor = inSession ? curBase : String(color.new(curBase, 60));
        const row = r + 1;
        put({ column: 0, row, text: s.name, textColor: nameColor, textSize: cfg.infoSize, textHAlign: 'left' });
        put({ column: 1, row, text: inSession ? '◉' : '●', textColor: indColor, textSize: 'tiny', textHAlign: 'center', textVAlign: 'center' });
        put({ column: 2, row, text: v1, textColor: curColor, textSize: cfg.infoSize, textHAlign: 'right', fontFamily: 'monospace' });
        put({ column: 3, row, text: v2, textColor: nameColor, textSize: cfg.infoSize, textHAlign: 'right', fontFamily: 'monospace' });
        put({ column: 4, row, text: str.format('{0,number,percent}', p), textColor: curColor, textSize: cfg.infoSize, textHAlign: 'right', fontFamily: 'monospace' });
      });
    }

    // ---- Opening range table (every bar: the cells stay) ----
    if (cfg.showOpTable) {
      // array.unshift(): the last session comes first
      const data = sessions.filter((s) => s.op.reached > 0).reverse();
      const put = (cell: TableCellData) => {
        // The original stops here with three sessions in the table (rows 2, 3 and 5 of a table of 5 rows)
        if (cell.row > 4) throw new Error(`Row ${cell.row} is out of table bounds, number of rows is 5.`);
        opCells.set(`${cell.column}:${cell.row}`, cell);
      };
      // 'Opening range(' + syminfo.ticker + ')'
      put({ column: 0, row: 0, text: `Opening range(${tickerOf(chart)})${data.length === 0 ? ' (No data)' : ''}`, textSize: cfg.infoSize });
      if (!opMerges.length) opMerges.push({ startColumn: 0, startRow: 0, endColumn: 6, endRow: 0 });
      if (data.length > 0) {
        ['Session', 'Sum', 'R1', 'S1', 'R2', 'S2', 'Total'].forEach((text, column) => {
          put({ column, row: 1, text, textSize: cfg.infoSize });
        });
        let row = 2;
        data.forEach((s, r) => {
          // row_index := row_index + i
          row += r;
          const pct = (count: number) => str.format('{0,number,percent}', count / s.op.total);
          const mono = (column: number, text: string) => put({
            column, row, text, fontFamily: 'monospace', textHAlign: 'right', textColor: TABLE_TEXT, textSize: cfg.infoSize,
          });
          put({ column: 0, row, text: s.name, textSize: cfg.infoSize, textColor: TABLE_TEXT, textHAlign: 'left' });
          mono(1, pct(s.op.reached));
          mono(2, pct(s.op.reachedR1));
          mono(3, pct(s.op.reachedS1));
          mono(4, pct(s.op.reachedR2));
          mono(5, pct(s.op.reachedS2));
          mono(6, str.tostring(s.op.total));
        });
      }
    }

    sessions.forEach((s, k) => {
      s.prevIn = isSess[k];
    });
  }

  // ---- Outputs: the drawings alive after the last bar ----
  const at = (x: number) => (x >= 0 && x < n ? bars[x].time : barTime(bars, x));
  const drawn = (...xs: number[]) => xs.every((x) => !Number.isNaN(at(x)));
  const lineOut = new Map<LineObj, LineDrawingData>();
  for (const l of lines.items) {
    if (!drawn(l.x1, l.x2)) continue;
    lineOut.set(l, {
      time1: at(l.x1), price1: l.y1, time2: at(l.x2), price2: l.y2, color: l.color, width: l.width, style: l.style,
      ...(l.extend !== 'none' ? { extend: l.extend } : {}),
    });
  }
  const boxOut: BoxData[] = boxes.items.filter((b) => drawn(b.left, b.right)).map((b) => ({
    time1: at(b.left), price1: b.top, time2: at(b.right), price2: b.bottom, bgColor: b.bgColor,
    borderColor: b.borderColor, borderWidth: b.borderWidth, borderStyle: b.borderStyle,
    ...(b.extend !== 'none' ? { extend: b.extend } : {}),
  }));
  const labelOut: LabelData[] = labels.items.filter((l) => drawn(l.x)).map((l) => ({
    time: at(l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style, size: l.size,
    ...(l.yloc !== 'price' ? { yloc: l.yloc } : {}),
    ...(l.tooltip !== undefined ? { tooltip: l.tooltip } : {}),
  }));
  const linefills: LinefillData[] = [];
  for (const f of fills) {
    const a = lineOut.get(f.line1);
    const b = lineOut.get(f.line2);
    if (a && b) linefills.push({ line1: a, line2: b, color: f.color });
  }

  // var tbl_op = table.new(...) is made on the first bar, tbl_avg on the last bar
  const tables: TableData[] = [];
  if (n > 0) {
    const tableStyle = { bgColor: TABLE_BG, frameColor: TABLE_FRAME, frameWidth: 2, borderColor: TABLE_FRAME, borderWidth: 1 };
    tables.push({
      position: 'bottom_right', columns: 7, rows: 5, cells: [...opCells.values()],
      ...(opMerges.length > 0 ? { merges: opMerges } : {}), ...tableStyle,
    });
    if (cfg.showInfo) {
      tables.push({ position: 'top_right', columns: 5, rows: 5, cells: [...infoCells.values()], merges: infoMerges, ...tableStyle });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    barColors,
    plotCandles: { plotcandle0: candles },
    lines: [...lineOut.values()],
    boxes: boxOut,
    labels: labelOut,
    linefills,
    tables,
  };
}

export const FxMarketSessions = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
