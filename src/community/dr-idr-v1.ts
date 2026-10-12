/**
 * DR/IDR V1.5
 *
 * Defining range (DR) and implied defining range (IDR) of three sessions of the New York day, on intraday charts.
 * - Three sessions (regular 09:30-10:30, after 19:30-20:30, overnight 03:00-04:00, New York time) each have a
 *   "lines time" after them. During a session the DR is the high and low of the session, the IDR the highest and
 *   lowest candle body (open / close), and a box covers the session (IDR or DR).
 * - The DR lines, the IDR lines, their middle lines and the line of the session open start at the session start and
 *   follow the current bar during the session and, when extended, during the lines time.
 * - STD lines: when the regular session ends, lines are drawn every half IDR range above the IDR high and below the
 *   IDR low of the regular session, from the start of its lines time to the end of the overnight lines time of the
 *   next day (3 days later on a Friday when the symbol is not a crypto symbol), with a label of the level (0.5, 1,
 *   -0.5 ...). "Static" draws a fixed number of levels; "Dynamic" draws the levels that the price has reached since
 *   the regular session, plus the extra levels.
 * - On a chart below 5 minutes the session values are those of the 5-minute bars. The port builds them from the chart
 *   bars; on a chart whose bars do not fill 5-minute bars (2, 3 or 4 minutes) it throws an Error.
 *
 * Drawings are kept up to 500 lines, 500 boxes and 500 labels (the oldest are removed). Nothing is drawn on daily
 * and higher charts. The inputs "Show complete history ?" and the type of "Extend" of the opening line are not read
 * by the script.
 *
 * Chart values (third argument): the port reads the exchange time zone (calendar day of the STD lines; without it:
 * UTC), the symbol type (Friday rule of the STD lines, "Extend lines of all ranges ..."; without it: no type), the
 * chart timeframe (without it: the bar spacing) and the current time (only with "Extend lines of all ranges to end of
 * most recent Regular session?"; without it: the clock of the computer).
 *
 * Reference: "DR/IDR V1.5" by TheMas7er
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TheMas7er and bmistiaen
 */

import {
  array, str, timeframe, time as pineTime, resample, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { chartTimeframe, periodStarts } from '../anchor-period';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { nowOf, symbolTypeOf, timezoneOf, type ChartContext } from '../chart-context';

type LineStyleOption = 'Solid' | 'Dashed' | 'Dotted';

export interface DrIdrV1Inputs {
  /** Exchange Offset (hours) */
  exchangeOffset: number;
  /** RDR Time */
  regularTime: string;
  /** RDR Lines Time */
  regularExtend: string;
  /** ADR Time */
  afterTime: string;
  /** ADR Lines Time */
  afterExtend: string;
  /** ODR Time */
  overnightTime: string;
  /** ODR Lines Time */
  overnightExtend: string;
  showRegular: boolean;
  showAfter: boolean;
  showOvernight: boolean;
  drlines: boolean;
  idrlines: boolean;
  middledrline: boolean;
  middleidrline: boolean;
  openline: boolean;
  /** Extend the opening line into the lines time */
  extendopLines: boolean;
  /** Not read by the script */
  extendopLinesType: 'Follow Time' | 'Session End' | 'ADR End' | 'ODR End' | 'RDR End';
  showBackground: boolean;
  boxType: 'DR' | 'IDR';
  extenddrLines: boolean;
  extendidrLines: boolean;
  /** Not read by the script */
  showAllHistory: boolean;
  useBoxColors: boolean;
  extendToEndOfRDR: boolean;
  showStdLines: boolean;
  showStdLinesAll: boolean;
  showStdLineLabels: boolean;
  stdLineType: 'Dynamic' | 'Static';
  stdLineDynamicExtraPos: number;
  stdLineDynamicExtraNeg: number;
  stdLineDynamicExtraAuto: boolean;
  stdLineStaticExtraPos: number;
  stdLineStaticExtraNeg: number;
  linesWidth: number;
  drLineColor: string;
  drLineStyle: LineStyleOption;
  idrLineColor: string;
  idrLineStyle: LineStyleOption;
  middleLineColor: string;
  middleLineStyle: LineStyleOption;
  opLineColor: string;
  opLineStyle: LineStyleOption;
  stdLineColor: string;
  stdLineStyle: LineStyleOption;
  backgroundColor: string;
  boxBorderSize: number;
  upBoxColor: string;
  upBorderColor: string;
  downBoxColor: string;
  downBorderColor: string;
}

export const defaultInputs: DrIdrV1Inputs = {
  exchangeOffset: 0,
  regularTime: '0930-1030',
  regularExtend: '1030-1600',
  afterTime: '1930-2030',
  afterExtend: '2030-0200',
  overnightTime: '0300-0400',
  overnightExtend: '0400-0830',
  showRegular: true,
  showAfter: true,
  showOvernight: true,
  drlines: true,
  idrlines: true,
  middledrline: false,
  middleidrline: true,
  openline: true,
  extendopLines: true,
  extendopLinesType: 'Session End',
  showBackground: true,
  boxType: 'IDR',
  extenddrLines: true,
  extendidrLines: true,
  showAllHistory: false,
  useBoxColors: false,
  extendToEndOfRDR: false,
  showStdLines: true,
  showStdLinesAll: true,
  showStdLineLabels: true,
  stdLineType: 'Static',
  stdLineDynamicExtraPos: 0,
  stdLineDynamicExtraNeg: 0,
  stdLineDynamicExtraAuto: false,
  stdLineStaticExtraPos: 10,
  stdLineStaticExtraNeg: 10,
  linesWidth: 1,
  drLineColor: '#787B86',
  drLineStyle: 'Solid',
  idrLineColor: '#FF5252',
  idrLineStyle: 'Dashed',
  middleLineColor: '#787B86',
  middleLineStyle: 'Dotted',
  opLineColor: '#4CAF50',
  opLineStyle: 'Dotted',
  stdLineColor: '#787B86',
  stdLineStyle: 'Dotted',
  backgroundColor: 'rgba(120, 123, 134, 0.25)',
  boxBorderSize: 0,
  upBoxColor: 'rgba(76, 175, 80, 0.15)',
  upBorderColor: '#4CAF50',
  downBoxColor: 'rgba(255, 82, 82, 0.15)',
  downBorderColor: '#FF5252',
};

const STYLES = ['Solid', 'Dashed', 'Dotted'];
const G1 = 'Time Settings';
const G2 = 'General Settings';
const G3 = 'Styles';

export const inputConfig: InputConfig[] = [
  { id: 'exchangeOffset', type: 'int', title: 'Exchange Offset (hours)', defval: 0, group: G1 },
  { id: 'regularTime', type: 'session', title: 'RDR Time', defval: '0930-1030', group: G1 },
  { id: 'regularExtend', type: 'session', title: 'RDR Lines Time', defval: '1030-1600', group: G1 },
  { id: 'afterTime', type: 'session', title: 'ADR Time', defval: '1930-2030', group: G1 },
  { id: 'afterExtend', type: 'session', title: 'ADR Lines Time', defval: '2030-0200', group: G1 },
  { id: 'overnightTime', type: 'session', title: 'ODR Time', defval: '0300-0400', group: G1 },
  { id: 'overnightExtend', type: 'session', title: 'ODR Lines Time', defval: '0400-0830', group: G1 },
  { id: 'showRegular', type: 'bool', title: 'Regular', defval: true, group: G2, inline: 'session',
    tooltip: 'Show Regular and/or After and/or Overnight session' },
  { id: 'showAfter', type: 'bool', title: 'After', defval: true, group: G2, inline: 'session' },
  { id: 'showOvernight', type: 'bool', title: 'Overnight', defval: true, group: G2, inline: 'session' },
  { id: 'drlines', type: 'bool', title: 'Show DR Lines ?', defval: true, group: G2 },
  { id: 'idrlines', type: 'bool', title: 'Show IDR Lines ?', defval: true, group: G2 },
  { id: 'middledrline', type: 'bool', title: 'Show Middle DR Line ?', defval: false, group: G2 },
  { id: 'middleidrline', type: 'bool', title: 'Show Middle IDR Line ?', defval: true, group: G2 },
  { id: 'openline', type: 'bool', title: 'Show Opening Line ?', defval: true, group: G2, inline: 'openline',
    tooltip: 'Shows the Opening line of the Defining Range.\n- Extend: Extends the drawing of the Opening line into the RDR/ODR Lines Time.' },
  { id: 'extendopLines', type: 'bool', title: 'Extend', defval: true, group: G2, inline: 'openline' },
  { id: 'extendopLinesType', type: 'string', title: '', defval: 'Session End',
    options: ['Follow Time', 'Session End', 'ADR End', 'ODR End', 'RDR End'], group: G2, inline: 'openline' },
  { id: 'showBackground', type: 'bool', title: 'Show DR/IDR Box ?', defval: true, group: G2 },
  { id: 'boxType', type: 'string', title: 'Box DR or IDR ?', defval: 'IDR', options: ['DR', 'IDR'], group: G2 },
  { id: 'extenddrLines', type: 'bool', title: 'Extend DR Lines ?', defval: true, group: G2 },
  { id: 'extendidrLines', type: 'bool', title: 'Extend IDR Lines ?', defval: true, group: G2 },
  { id: 'showAllHistory', type: 'bool', title: 'Show complete history ?', defval: false, group: G2,
    tooltip: 'Might cause a slight drawing delay when panning/moving/zooming the chart.' },
  { id: 'useBoxColors', type: 'bool', title: 'Box color based on open and close', defval: false, group: G2,
    tooltip: 'If unchecked, it will default to the selected Box Background Color' },
  { id: 'extendToEndOfRDR', type: 'bool', title: 'Extend lines of all ranges to end of most recent Regular session?', defval: false, group: G2 },
  { id: 'showStdLines', type: 'bool', title: 'Show STD Lines ?', defval: true, group: G2, inline: 'stdlines',
    tooltip: 'Shows the Standard Deviation lines in 0.5 IDR range increments.\n- All = Shows all the STD lines on previous sessions.\n- Labels = Show STD level labels.\n- Dropdown = Choose between Dynamic or Static STD lines.' },
  { id: 'showStdLinesAll', type: 'bool', title: 'All', defval: true, group: G2, inline: 'stdlines' },
  { id: 'showStdLineLabels', type: 'bool', title: 'Labels', defval: true, group: G2, inline: 'stdlines' },
  { id: 'stdLineType', type: 'string', title: '', defval: 'Static', options: ['Dynamic', 'Static'], group: G2, inline: 'stdlines' },
  { id: 'stdLineDynamicExtraPos', type: 'int', title: 'Dynamic (+)', defval: 0, min: 0, group: G2, inline: 'stdlinedynamic',
    tooltip: 'Dynamic STD Lines.\nDynamically draw STD lines around price action. Progresses with price.\n- (+) = Number of positive extra levels to draw in addition to the lines that are automatically drawn around price action.\n- (-) = Number of negative extra levels to draw in addition to the lines that are automatically drawn around price action.\n- Auto = Automatically determine number of STD lines that need to be drawn. Follows price action.' },
  { id: 'stdLineDynamicExtraNeg', type: 'int', title: '(-)', defval: 0, min: 0, group: G2, inline: 'stdlinedynamic' },
  { id: 'stdLineDynamicExtraAuto', type: 'bool', title: 'Auto', defval: false, group: G2, inline: 'stdlinedynamic' },
  { id: 'stdLineStaticExtraPos', type: 'int', title: 'Static (+)', defval: 10, min: 0, group: G2, inline: 'stdlinestatic',
    tooltip: 'Static STD Lines.\nDraws a fixed number of STD lines.\n- (+) = Number of positive levels to draw.\n- (-) = Number of negative levels to draw.' },
  { id: 'stdLineStaticExtraNeg', type: 'int', title: '(-)', defval: 10, min: 0, group: G2, inline: 'stdlinestatic' },
  { id: 'linesWidth', type: 'int', title: 'Box And Lines Width ?', defval: 1, min: 1, max: 4, group: G3 },
  { id: 'drLineColor', type: 'color', title: 'DR Line Color', defval: '#787B86', group: G3, inline: 'drline' },
  { id: 'drLineStyle', type: 'string', title: 'Style', defval: 'Solid', options: STYLES, group: G3, inline: 'drline' },
  { id: 'idrLineColor', type: 'color', title: 'IDR Line Color', defval: '#FF5252', group: G3, inline: 'idrline' },
  { id: 'idrLineStyle', type: 'string', title: 'Style', defval: 'Dashed', options: STYLES, group: G3, inline: 'idrline' },
  { id: 'middleLineColor', type: 'color', title: 'Middle Line Color', defval: '#787B86', group: G3, inline: 'midline' },
  { id: 'middleLineStyle', type: 'string', title: 'Style', defval: 'Dotted', options: STYLES, group: G3, inline: 'midline' },
  { id: 'opLineColor', type: 'color', title: 'Opening Line', defval: '#4CAF50', group: G3, inline: 'openline',
    tooltip: 'Opening line:\n- Color\n- Style\n- Width' },
  { id: 'opLineStyle', type: 'string', title: '', defval: 'Dotted', options: STYLES, group: G3, inline: 'openline' },
  { id: 'stdLineColor', type: 'color', title: 'STD Lines', defval: '#787B86', group: G3, inline: 'stdline',
    tooltip: 'Standard deviation lines:\n- Color\n- Style\n- Width' },
  { id: 'stdLineStyle', type: 'string', title: '', defval: 'Dotted', options: STYLES, group: G3, inline: 'stdline' },
  { id: 'backgroundColor', type: 'color', title: 'Box Background Color', defval: 'rgba(120, 123, 134, 0.25)', group: G3 },
  { id: 'boxBorderSize', type: 'int', title: 'Box border size', defval: 0, min: 0, group: G3 },
  { id: 'upBoxColor', type: 'color', title: 'Up box', defval: 'rgba(76, 175, 80, 0.15)', group: G3, inline: 'upbox' },
  { id: 'upBorderColor', type: 'color', title: 'border', defval: '#4CAF50', group: G3, inline: 'upbox' },
  { id: 'downBoxColor', type: 'color', title: 'Down box', defval: 'rgba(255, 82, 82, 0.15)', group: G3, inline: 'downbox' },
  { id: 'downBorderColor', type: 'color', title: 'border', defval: '#FF5252', group: G3, inline: 'downbox' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'DR/IDR V1.5',
  shortTitle: 'DR/IDR V1.5',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500, max_labels_count = 500) */
const MAX_COUNT = 500;
const TIMEZONE = 'America/New_York';
const ONE_DAY = 24 * 3600 * 1000;
/** Default border colour of a box */
const BLUE = '#2962FF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** math.max / math.min: na with an na argument */
const pmax = (...v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.max(...v));
const pmin = (...v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.min(...v));

type Style = 'solid' | 'dashed' | 'dotted';
// Times (x) are in ms, as in the script
interface Ln { x1: number; x2: number; y: number; color: string; style: Style; dead: boolean }
interface Bx { left: number; top: number; right: number; bottom: number; border: string; bg: string; dead: boolean }
interface Lb { x: number; y: number; text: string; dead: boolean }

export function calculate(
  bars: Bar[],
  inputs: Partial<DrIdrV1Inputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const empty = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {}, lines: [], boxes: [], labels: [],
  };
  if (n === 0) return empty;
  const tf = chartTimeframe(bars, chart);
  // if timeframe.isintraday
  if (tf === '' || !timeframe.info(tf).isintraday) return empty;

  // Bar times in ms
  const unit = bars[0].time >= 1e12 ? 1 : 1000;
  const exchangeTz = timezoneOf(chart);
  const symbolType = symbolTypeOf(chart);
  const exchangeOffsetMS = cfg.exchangeOffset * 3600000;

  // Below 5 minutes the session values are those of the 5-minute bar of each chart bar
  // (request.security(..., '5', ..., lookahead = barmerge.lookahead_on))
  const tfSeconds = timeframe.in_seconds(tf);
  const useM5 = tfSeconds < 300;
  const values = bars.map((b) => ({ open: b.open, high: b.high, low: b.low, close: b.close }));
  if (useM5) {
    if (300 % tfSeconds !== 0) {
      throw new Error(`DR/IDR: on a chart below 5 minutes the script reads the 5-minute bars, which cannot be built from the bars of a "${tf}" chart`);
    }
    const { bars: m5, group } = resample(bars, periodStarts(bars, '5', chart));
    for (let i = 0; i < n; i++) values[i] = m5[group[i]];
  }

  const styleOf = (option: LineStyleOption): Style => (option === 'Dashed' ? 'dashed' : option === 'Dotted' ? 'dotted' : 'solid');

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. An object held by a `var` variable of the script (the lines and the box of the latest session) is
  // never deleted by this limit, but it counts.
  const held = new Set<object>();
  const live = <T extends { dead: boolean }>() => {
    const list: T[] = [];
    return {
      list,
      add(o: T): T {
        list.push(o);
        if (list.length > MAX_COUNT + 5) {
          for (let k = 0; k < list.length && list.length > MAX_COUNT; ) {
            if (held.has(list[k])) k++;
            else list.splice(k, 1)[0].dead = true;
          }
        }
        return o;
      },
      remove(o: T | null | undefined) {
        if (!o || o.dead) return;
        o.dead = true;
        list.splice(list.indexOf(o), 1);
      },
    };
  };
  const lines = live<Ln>();
  const boxes = live<Bx>();
  const labels = live<Lb>();
  /** `variable := object`: the variable holds the new object and releases the one before */
  const hold = <T extends object>(before: T | null, now: T): T => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const newLine = (color: string, option: LineStyleOption): Ln =>
    lines.add({ x1: NaN, x2: NaN, y: NaN, color, style: styleOf(option), dead: false });
  const moveLine = (l: Ln | null, x1: number, y: number, x2: number): void => {
    if (!l || l.dead) return;
    l.x1 = x1 + exchangeOffsetMS;
    l.x2 = x2 + exchangeOffsetMS;
    l.y = y;
  };

  // f_sessionTime(): one `var int ts` (and one hour / minute pair) per call in the script
  const sessionTimeSite = (part: 0 | 1) => {
    let ts = NaN;
    let hourInt = NaN;
    let minuteInt = NaN;
    return (session: string | null, tMs: number): number => {
      if (session !== null && session.length === 9) {
        const timeStr = session.split('-')[part];
        if (timeStr !== undefined && timeStr.length === 4) {
          hourInt = Math.trunc(str.tonumber(timeStr.substring(0, 2)) ?? NaN);
          minuteInt = Math.trunc(str.tonumber(timeStr.substring(2, 4)) ?? NaN);
        }
        // year, month and dayofmonth of the bar are in the exchange time zone
        ts = isNaN(hourInt) || isNaN(minuteInt) ? NaN : pineTime.timestamp(
          TIMEZONE, pineTime.year(tMs, exchangeTz), pineTime.month(tMs, exchangeTz), pineTime.dayofmonth(tMs, exchangeTz),
          hourInt, minuteInt,
        );
      }
      return ts;
    };
  };
  const stdStartSite = sessionTimeSite(0);
  const stdStopSite = sessionTimeSite(1);
  const currentStopSite = sessionTimeSite(1);
  const regularStopSite = sessionTimeSite(1);
  const dateOf = (ts: number) => (isNaN(ts) ? NaN : pineTime.timestamp(
    TIMEZONE, pineTime.year(ts, TIMEZONE), pineTime.month(ts, TIMEZONE), pineTime.dayofmonth(ts, TIMEZONE),
  ));

  let startTime = NaN;
  let endTime = NaN;
  let currentSession: string | null = null;
  let lowrdrl: Ln | null = null;
  let highrdrl: Ln | null = null;
  let lowridrl: Ln | null = null;
  let highridrl: Ln | null = null;
  let middlerdrl: Ln | null = null;
  let middleridrl: Ln | null = null;
  let drLineOpen: Ln | null = null;
  let bgBox: Bx | null = null;
  let stdLines: Ln[] = [];
  let stdLevels: number[] = [];
  let stdLabels: Lb[] = [];
  let rdrlow = NaN;
  let rdrhigh = NaN;
  let ridrlow = NaN;
  let ridrhigh = NaN;
  let rdrmiddle = NaN;
  let ridrmiddle = NaN;
  let sessionOpen = NaN;
  let regidrlow = NaN;
  let regidrhigh = NaN;
  let sessionHigh = NaN;
  let sessionLow = NaN;
  let stdLinesStartTime = NaN;
  let stdLinesStopTime = NaN;

  const drawStdLine = (fromTime: number, toTime: number, level: number, labelValue: number) => {
    if (isNaN(level) || array.includes(stdLevels, level)) return;
    stdLevels.push(level);
    const l = newLine(cfg.stdLineColor, cfg.stdLineStyle);
    moveLine(l, fromTime, level, toTime);
    stdLines.push(l);
    if (cfg.showStdLineLabels) stdLabels.push(labels.add({ x: toTime, y: level, text: str.format('{0}', labelValue), dead: false }));
  };
  const stdStepFactor = 0.5;
  const drawStdLines = (fromTime: number, toTime: number, clear: boolean) => {
    if (clear && !cfg.showStdLinesAll && stdLevels.length > 0) {
      for (let k = 0; k < stdLines.length; k++) {
        lines.remove(stdLines[k]);
        if (cfg.showStdLineLabels) labels.remove(stdLabels[k]);
      }
    }
    if (clear) {
      stdLevels = [];
      stdLines = [];
      if (cfg.showStdLineLabels) stdLabels = [];
    }
    const stdStep = Math.abs(regidrhigh - regidrlow) * stdStepFactor;
    if (isNaN(stdStep) || Math.abs(stdStep) <= EPS) return;
    let nrLevelsPos: number;
    let nrLevelsNeg: number;
    if (cfg.stdLineType === 'Dynamic') {
      nrLevelsPos = Math.ceil(pmax(sessionHigh - regidrhigh, 0) / stdStep) + (cfg.stdLineDynamicExtraAuto ? 0 : cfg.stdLineDynamicExtraPos);
      nrLevelsNeg = Math.ceil(pmax(regidrlow - sessionLow, 0) / stdStep) + (cfg.stdLineDynamicExtraAuto ? 0 : cfg.stdLineDynamicExtraNeg);
    } else {
      nrLevelsPos = cfg.stdLineStaticExtraPos;
      nrLevelsNeg = cfg.stdLineStaticExtraNeg;
    }
    if (ge(nrLevelsPos, 1)) {
      for (let cnt = 1; cnt <= nrLevelsPos; cnt++) drawStdLine(fromTime, toTime, regidrhigh + cnt * stdStep, cnt * stdStepFactor);
    }
    if (ge(nrLevelsNeg, 1)) {
      for (let cnt = 1; cnt <= nrLevelsNeg; cnt++) drawStdLine(fromTime, toTime, regidrlow - cnt * stdStep, cnt * -stdStepFactor);
    }
  };

  let prevInSession = false;
  let prevInExtend = false;
  let prevInRegularSession = false;
  let prevInRegularExtend = false;

  for (let i = 0; i < n; i++) {
    const time = bars[i].time * unit;
    const { open, high, low, close } = values[i];
    const inSessionOf = (session: string) => pineTime.inSession(time, session, TIMEZONE, tfSeconds * 1000);

    const inRegularSession = inSessionOf(cfg.regularTime) && cfg.showRegular;
    const inRegularExtend = inSessionOf(cfg.regularExtend) && cfg.showRegular;
    const inAfterSession = inSessionOf(cfg.afterTime) && cfg.showAfter;
    const inAfterExtend = inSessionOf(cfg.afterExtend) && cfg.showAfter;
    const inOvernightSession = inSessionOf(cfg.overnightTime) && cfg.showOvernight;
    const inOvernightExtend = inSessionOf(cfg.overnightExtend) && cfg.showOvernight;
    const inSession = inRegularSession || inOvernightSession || inAfterSession;
    const inExtend = inRegularExtend || inOvernightExtend || inAfterExtend;
    const enterSession = inSession && !prevInSession;
    const enterExtend = inExtend && !prevInExtend;
    const leaveRegularSession = !inRegularSession && prevInRegularSession;
    const enterRegularExtend = inRegularExtend && !prevInRegularExtend;

    if (enterSession) {
      currentSession = inRegularSession ? cfg.regularTime : inOvernightSession ? cfg.overnightTime : inAfterSession ? cfg.afterTime : null;
    } else if (enterExtend) {
      currentSession = inRegularExtend ? cfg.regularExtend : inOvernightExtend ? cfg.overnightExtend : inAfterExtend ? cfg.afterExtend : null;
    }

    if (inSession) {
      if (!prevInSession) {
        startTime = time;
        sessionOpen = open;
        rdrhigh = high;
        rdrlow = low;
        ridrlow = Math.min(open, close);
        ridrhigh = Math.max(open, close);
        if (cfg.showBackground) {
          bgBox = hold(bgBox, boxes.add({ left: NaN, top: NaN, right: NaN, bottom: NaN, border: BLUE, bg: cfg.backgroundColor, dead: false }));
        }
        if (cfg.drlines) {
          highrdrl = hold(highrdrl, newLine(cfg.drLineColor, cfg.drLineStyle));
          lowrdrl = hold(lowrdrl, newLine(cfg.drLineColor, cfg.drLineStyle));
        }
        if (cfg.idrlines) {
          highridrl = hold(highridrl, newLine(cfg.idrLineColor, cfg.idrLineStyle));
          lowridrl = hold(lowridrl, newLine(cfg.idrLineColor, cfg.idrLineStyle));
        }
        if (cfg.middledrline) middlerdrl = hold(middlerdrl, newLine(cfg.middleLineColor, cfg.middleLineStyle));
        if (cfg.middleidrline) middleridrl = hold(middleridrl, newLine(cfg.middleLineColor, cfg.middleLineStyle));
        if (cfg.openline) drLineOpen = hold(drLineOpen, newLine(cfg.opLineColor, cfg.opLineStyle));
      }
      rdrhigh = pmax(high, rdrhigh);
      rdrlow = pmin(low, rdrlow);
      ridrhigh = pmax(open, close, ridrhigh);
      ridrlow = pmin(open, close, ridrlow);
      rdrmiddle = (rdrhigh + rdrlow) / 2;
      ridrmiddle = (ridrhigh + ridrlow) / 2;
    }

    if (leaveRegularSession) {
      regidrhigh = ridrhigh;
      regidrlow = ridrlow;
      if (inRegularExtend) {
        stdLinesStartTime = stdStartSite(cfg.regularExtend, time);
        const friday = pineTime.dayofweek(time, exchangeTz) === 6;
        stdLinesStopTime = stdStopSite(cfg.overnightExtend, time) + ONE_DAY * (friday && symbolType !== 'crypto' ? 3 : 1);
      }
    }

    if (enterRegularExtend) {
      sessionHigh = high;
      sessionLow = low;
    }
    // High and low since the regular session, for the STD levels
    sessionHigh = pmax(sessionHigh, high);
    sessionLow = pmin(sessionLow, low);

    if (cfg.showBackground && inSession && bgBox && !bgBox.dead) {
      const boxUp = gt(close, sessionOpen);
      bgBox.left = startTime + exchangeOffsetMS;
      bgBox.top = cfg.boxType === 'DR' ? rdrhigh : ridrhigh;
      bgBox.right = time + exchangeOffsetMS;
      bgBox.bottom = cfg.boxType === 'DR' ? rdrlow : ridrlow;
      bgBox.border = cfg.useBoxColors ? (boxUp ? cfg.upBorderColor : cfg.downBorderColor) : cfg.backgroundColor;
      bgBox.bg = cfg.useBoxColors ? (boxUp ? cfg.upBoxColor : cfg.downBoxColor) : cfg.backgroundColor;
    }

    if (cfg.extendToEndOfRDR) {
      if (symbolType === 'warrant' || symbolType === 'structured' || symbolType === 'right') {
        endTime = time;
      } else if (time > nowOf(chart) - 2 * ONE_DAY) {
        // Only the bars of the last 2 days: the lines end at the end of the regular lines time of the current day
        if (dateOf(currentStopSite(currentSession, time)) === dateOf(nowOf(chart))) endTime = regularStopSite(cfg.regularExtend, time);
        else endTime = time;
      } else {
        endTime = time;
      }
    } else {
      endTime = time;
    }

    if (cfg.drlines && (inSession || (cfg.extenddrLines && inExtend))) {
      moveLine(highrdrl, startTime, rdrhigh, endTime);
      moveLine(lowrdrl, startTime, rdrlow, endTime);
      if (cfg.middledrline) moveLine(middlerdrl, startTime, rdrmiddle, endTime);
    }
    if (cfg.idrlines && (inSession || (cfg.extendidrLines && inExtend))) {
      moveLine(highridrl, startTime, ridrhigh, endTime);
      moveLine(lowridrl, startTime, ridrlow, endTime);
      if (cfg.middleidrline) moveLine(middleridrl, startTime, ridrmiddle, endTime);
    }
    if (cfg.openline && (inSession || (cfg.extendopLines && inExtend))) moveLine(drLineOpen, startTime, sessionOpen, endTime);

    if (cfg.showStdLines) drawStdLines(stdLinesStartTime, stdLinesStopTime, enterRegularExtend);

    prevInSession = inSession;
    prevInExtend = inExtend;
    prevInRegularSession = inRegularSession;
    prevInRegularExtend = inRegularExtend;
  }

  // An object with an na coordinate is not drawn
  return {
    ...empty,
    lines: lines.list.filter((l) => !isNaN(l.x1) && !isNaN(l.x2) && !isNaN(l.y)).map((l) => ({
      time1: l.x1 / unit, price1: l.y, time2: l.x2 / unit, price2: l.y, color: l.color,
      ...(cfg.linesWidth !== 1 ? { width: cfg.linesWidth } : {}),
      ...(l.style !== 'solid' ? { style: l.style } : {}),
    })),
    boxes: boxes.list.filter((b) => ![b.left, b.top, b.right, b.bottom].some((v) => isNaN(v))).map((b) => ({
      time1: b.left / unit, price1: b.top, time2: b.right / unit, price2: b.bottom,
      bgColor: b.bg, borderColor: b.border, borderWidth: cfg.boxBorderSize,
    })),
    labels: labels.list.filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: l.x / unit, price: l.y, text: l.text, color: 'transparent', textColor: cfg.stdLineColor, style: 'label_left' as const,
    })),
  };
}

export const DrIdrV1 = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
