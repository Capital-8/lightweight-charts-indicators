/**
 * ICT Algorithmic Macro Tracker° (Open-Source)
 *
 * Marks the ICT "macro" time windows of New York time (hh:50 to hh+1:10 of each hour, and 15:15 to 15:45) on
 * intraday charts. "On Chart" mode: each window gets a bracket above the price, a vertical line at its first bar, a
 * horizontal line along the window (raised with the highs of the window) and a vertical line at the first bar after
 * it, with a "MACRO" label (optionally with the window time) in the middle and optional dotted projections down to
 * the price. "New Pane" mode: each window is a box from 0 to 2, placed one day later (three days on a Friday, except
 * for crypto symbols), with an "ⓘ" label. The script keeps the latest 300 lines of each window, 300 projections and
 * 100 labels (500 lines / labels / boxes at most).
 *
 * The bracket height uses ta.highest(timeframe.in_seconds("15") / timeframe.in_seconds(timeframe.period)): on a
 * timeframe above 15 minutes the length is 0 and the original stops with a runtime error, as the port does.
 *
 * Chart values read from the optional third argument: the symbol tick (bracket height and margins), the symbol
 * type (crypto symbols have no three-day Friday shift), the exchange time zone and session (day of the week and bar
 * close times) and the chart timeframe. Without it: tick 0.01, UTC, the bar interval.
 *
 * Reference: "ICT Algorithmic Macro Tracker° (Open-Source) by toodegrees" by toodegrees
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © toodegrees
 */

import {
  ta, Series, line, label, box, time as ptime, timeframe, periodClose, resetDrawings, setDrawingBar, drawingOutputs,
  type Line, type Label, type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { mintickOf, symbolTypeOf, timezoneOf, type ChartContext } from '../chart-context';
import { chartTimeframe, hasCalendar } from '../anchor-period';
import { barInterval } from '../bar-time';

export interface IctAlgorithmicMacroTrackerInputs {
  /** Macro colour (lines, label text, box border) */
  macroColor: string;
  mode: 'On Chart' | 'New Pane';
  showLabel: boolean;
  showTime: boolean;
  /** Macro Projections: dotted lines from the price to the bracket */
  projections: boolean;
  /** Box colour of the "New Pane" mode */
  paneColor: string;
  show1: boolean;
  show2: boolean;
  show3: boolean;
  show4: boolean;
  show5: boolean;
  show6: boolean;
  show7: boolean;
  show8: boolean;
  show9: boolean;
  show10: boolean;
  show11: boolean;
  show12: boolean;
  show13: boolean;
  show14: boolean;
  show17: boolean;
  show18: boolean;
  show19: boolean;
  show20: boolean;
  show21: boolean;
  show22: boolean;
  show23: boolean;
  show24: boolean;
  show15: boolean;
  showPM1: boolean;
  show16: boolean;
}

export const defaultInputs: IctAlgorithmicMacroTrackerInputs = {
  macroColor: '#000000',
  mode: 'On Chart',
  showLabel: true,
  showTime: false,
  projections: false,
  paneColor: '#4CAF504D',
  show1: false,
  show2: false,
  show3: true,
  show4: true,
  show5: true,
  show6: false,
  show7: false,
  show8: false,
  show9: false,
  show10: true,
  show11: true,
  show12: true,
  show13: true,
  show14: true,
  show17: false,
  show18: false,
  show19: false,
  show20: false,
  show21: false,
  show22: false,
  show23: false,
  show24: false,
  show15: true,
  showPM1: true,
  show16: true,
};

type ShowKey = Exclude<keyof IctAlgorithmicMacroTrackerInputs, 'macroColor' | 'mode' | 'showLabel' | 'showTime' | 'projections' | 'paneColor'>;

/** The macro windows in the order of the calls of the original: id, start hour / minute, end hour / minute, text */
const MACROS: Array<[ShowKey, number, number, number, number, string]> = [
  ['show1', 0, 50, 1, 10, '00:50 - 1:10'],
  ['show2', 1, 50, 2, 10, '1:50 - 2:10'],
  ['show3', 2, 50, 3, 10, '2:50 - 3:10'],
  ['show4', 3, 50, 4, 10, '3:50 - 4:10'],
  ['show5', 4, 50, 5, 10, '4:50 - 5:10'],
  ['show6', 5, 50, 6, 10, '5:50 - 6:10'],
  ['show7', 6, 50, 7, 10, '6:50 - 7:10'],
  ['show8', 7, 50, 8, 10, '7:50 - 8:10'],
  ['show9', 8, 50, 9, 10, '8:50 - 9:10'],
  ['show10', 9, 50, 10, 10, '9:50 - 10:10'],
  ['show11', 10, 50, 11, 10, '10:50 - 11:10'],
  ['show12', 11, 50, 12, 10, '11:50 - 12:10'],
  ['show13', 12, 50, 13, 10, '12:50 - 13:10'],
  ['show14', 13, 50, 14, 10, '13:50 - 14:10'],
  ['show15', 14, 50, 15, 10, '14:50 - 15:10'],
  ['show16', 15, 50, 16, 10, '15:50 - 16:10'],
  ['show17', 16, 50, 17, 10, '16:50 - 17:10'],
  ['show18', 17, 50, 18, 10, '17:50 - 18:10'],
  ['show19', 18, 50, 19, 10, '18:50 - 19:10'],
  ['show20', 19, 50, 20, 10, '19:50 - 20:10'],
  ['show21', 20, 50, 21, 10, '20:50 - 21:10'],
  ['show22', 21, 50, 22, 10, '21:50 - 22:10'],
  ['show23', 22, 50, 23, 10, '22:50 - 23:10'],
  ['show24', 23, 50, 0, 10, '23:50 - 00:10'],
  ['showPM1', 15, 15, 15, 45, '15:15 - 15:45'],
];

const hourly = (key: ShowKey, title: string, defval: boolean): InputConfig => ({ id: key, type: 'bool', title, defval, group: 'Hourly Macros' });
const pm = (key: ShowKey, title: string, defval: boolean): InputConfig => ({ id: key, type: 'bool', title, defval, group: 'Last Hour NY PM Macros' });

export const inputConfig: InputConfig[] = [
  { id: 'macroColor', type: 'color', title: 'Macro Color', defval: '#000000', inline: 'main' },
  {
    id: 'mode', type: 'string', title: '', defval: 'On Chart', options: ['On Chart', 'New Pane'], inline: 'main',
    tooltip: 'When "New Pane" is selected, make sure you move the indicator to a New Pane as well, it is not automatic.',
  },
  { id: 'showLabel', type: 'bool', title: 'Macro Label?', defval: true, inline: 'sh' },
  { id: 'showTime', type: 'bool', title: 'Show Time?', defval: false, inline: 'sh' },
  { id: 'projections', type: 'bool', title: 'Macro Projections?', defval: false, inline: 'sh', tooltip: 'Extends On Chart Macro lines towards price.' },
  { id: 'paneColor', type: 'color', title: 'Macro Color', defval: '#4CAF504D', inline: 'bc', tooltip: 'Visible only in "New Pane" mode' },
  hourly('show1', '00:50 - 01:10', false),
  hourly('show2', '01:50 - 02:10', false),
  hourly('show3', '02:50 - 03:10', true),
  hourly('show4', '03:50 - 04:10', true),
  hourly('show5', '04:50 - 05:10', true),
  hourly('show6', '05:50 - 06:10', false),
  hourly('show7', '06:50 - 07:10', false),
  hourly('show8', '07:50 - 08:10', false),
  hourly('show9', '08:50 - 09:10', false),
  hourly('show10', '09:50 - 10:10', true),
  hourly('show11', '10:50 - 11:10', true),
  hourly('show12', '11:50 - 12:10', true),
  hourly('show13', '12:50 - 13:10', true),
  hourly('show14', '13:50 - 14:10', true),
  hourly('show17', '16:50 - 17:10', false),
  hourly('show18', '17:50 - 18:10', false),
  hourly('show19', '18:50 - 19:10', false),
  hourly('show20', '19:50 - 20:10', false),
  hourly('show21', '20:50 - 21:10', false),
  hourly('show22', '21:50 - 22:10', false),
  hourly('show23', '22:50 - 23:10', false),
  hourly('show24', '23:50 - 00:10', false),
  pm('show15', '14:50 - 15:10', true),
  pm('showPM1', '15:15 - 15:45', true),
  pm('show16', '15:50 - 16:10', true),
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ICT Algorithmic Macro Tracker° (Open-Source) by toodegrees',
  shortTitle: 'Macro Tracker°',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;
const ONE_DAY_MS = 86400000;
/** color.new(#ffffff, 100) */
const NO_COLOR = '#FFFFFF00';
/** Default box text colour of a v5 script */
const BOX_TEXT = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** time_isMacro(H_start, M_start, H_end, M_end) of the original (New York time) */
function isMacro(h: number, m: number, hs: number, ms: number, he: number, me: number): boolean {
  if (h === hs) return hs !== he ? m >= ms : m >= ms && m < me;
  return h > hs ? (h === he ? m < me : h < he) : false;
}

/** time_close of each bar (ms): the close of the exchange calendar with the context, else the bar time plus the interval */
function closeTimes(bars: Bar[], tf: string, unit: number, chart?: ChartContext): number[] {
  const fallback = bars.map((b) => b.time * unit + barInterval(bars) * unit);
  if (!chart || !hasCalendar(chart) || tf === '') return fallback;
  try {
    const context = {
      timeframe: tf, timezone: chart.timezone, session: chart.session, regularSession: chart.regularSession,
      timeUnit: unit === 1 ? 'ms' as const : 's' as const,
    };
    return bars.map((b, i) => {
      const v = periodClose(b.time, tf, context);
      return Number.isNaN(v) ? fallback[i] : v;
    });
  } catch {
    return fallback;
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<IctAlgorithmicMacroTrackerInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const unit = n > 0 && bars[0].time >= 1e12 ? 1 : 1000;
  const tick = mintickOf(chart);
  const tz = timezoneOf(chart);
  const crypto = symbolTypeOf(chart) === 'crypto';
  const tf = chartTimeframe(bars, chart);

  // one = ta.highest(timeframe.in_seconds("15") / timeframe.in_seconds(timeframe.period)) + syminfo.mintick * 10
  const length = tf === '' ? 0 : Math.trunc(timeframe.in_seconds('15') / timeframe.in_seconds(tf));
  if (n > 0 && !(length > 0)) {
    throw new Error("Error on bar 0: Invalid value of the 'length' argument (0.0) in the 'highest' function. It must be > 0.");
  }
  const highest = n > 0 ? ta.highest(new Series(bars, (b) => b.high), length).toArray().map((v) => v ?? NaN) : [];
  const closeMs = closeTimes(bars, tf, unit, chart);

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS, box: MAX_OBJECTS });
  const EXT: Line[] = [];
  const LBL: Label[] = [];
  const onChart = cfg.mode === 'On Chart';
  const active = MACROS.filter(([key]) => cfg[key]).map(([key, hs, ms, he, me, text]) => ({
    key, hs, ms, he, me, text, lines: [] as Line[], boxes: [] as Box[], prev: false, plotNP: false,
  }));

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const t = b.time * unit;
    const oneBarMS = closeMs[i] - t;
    const one = highest[i] + tick * 10;
    const yBtm = one;
    const yTop = one + tick * 5;
    const h = ptime.hour(t, 'America/New_York');
    const m = ptime.minute(t, 'America/New_York');
    // dayofweek(time) == dayofweek.friday and syminfo.type != 'crypto'
    const friday = ptime.dayofweek(t, tz) === 6 && !crypto;

    for (const mac of active) {
      const inMacro = isMacro(h, m, mac.hs, mac.ms, mac.he, mac.me);
      const prev = mac.prev; // _time[1] (false on the first bar)
      const tt = `MACRO\n${mac.text}`;
      if (onChart) {
        // macroOC(LINES, _time, _kzTime, _friday)
        const LINES = mac.lines;
        const txt = cfg.showTime ? `MACRO\n${mac.text}` : 'MACRO';
        if (!prev && inMacro) {
          const vline1 = line.new(t, yBtm, t, yTop, 'bar_time', undefined, cfg.macroColor);
          LINES.push(vline1);
          LINES.push(line.new(t, yTop, t + oneBarMS, yTop, 'bar_time', undefined, cfg.macroColor));
          if (cfg.projections) {
            EXT.push(line.new(t, b.high, t, line.get_y2(vline1), 'bar_time', undefined, cfg.macroColor, 'dotted'));
          }
          LBL.push(label.new(t, line.get_y2(LINES[LINES.length - 2]), cfg.showLabel ? txt : '', 'bar_time', 'price',
            NO_COLOR, 'label_down', cfg.macroColor, 'small', undefined, tt));
        }
        if (prev && !inMacro && LINES.length > 0 && LBL.length > 0) {
          const vline2 = line.new(t, yBtm, t, yTop, 'bar_time', undefined, cfg.macroColor);
          const first = LINES[LINES.length - 2];
          label.set_x(LBL[LBL.length - 1], Math.round((line.get_x1(first) + t) / 2));
          if (gt(yTop, line.get_y2(first))) {
            line.set_y2(first, yTop);
            line.set_y1(LINES[LINES.length - 1], yTop);
            line.set_y2(LINES[LINES.length - 1], yTop);
            label.set_y(LBL[LBL.length - 1], yTop);
          } else if (lt(yTop, line.get_y2(first))) {
            line.set_y2(vline2, line.get_y2(first));
          }
          if (cfg.projections) {
            EXT.push(line.new(t, b.high, t, line.get_y2(vline2), 'bar_time', undefined, cfg.macroColor, 'dotted'));
          }
          LINES.push(vline2);
        }
        // _controlMacroLine(LINES, LBL, _time)
        if (LINES.length > 0 && LBL.length > 0 && inMacro) {
          const first = LINES[LINES.length - 2];
          const last = LINES[LINES.length - 1];
          label.set_x(LBL[LBL.length - 1], Math.round((line.get_x1(first) + t) / 2));
          if (gt(b.high, line.get_y2(last) - tick * 10)) {
            line.set_y2(first, b.high + tick * 10);
            line.set_y1(last, b.high + tick * 10);
            line.set_y2(last, b.high + tick * 10);
            label.set_y(LBL[LBL.length - 1], b.high + tick * 10);
          }
          // if na or _lines.last().get_x2() == time (na is false)
          if (line.get_x2(last) === t) line.set_x2(last, t + oneBarMS);
        }
      } else {
        // macroNP(BOXES, _time, _kzTime, _friday)
        const BOXES = mac.boxes;
        const dly = friday ? ONE_DAY_MS * 3 : ONE_DAY_MS;
        if (!prev && inMacro) {
          // a v5 box text is #363A45 when not set (the box has no text)
          BOXES.push(box.new(t + dly, 2, t + dly, 0, cfg.macroColor, undefined, undefined, undefined, 'bar_time', cfg.paneColor,
            undefined, undefined, BOX_TEXT));
          mac.plotNP = true;
        }
        if (prev && !inMacro && BOXES.length > 0) {
          // _controlMacroBox(BOXES, true, ...)
          const last = BOXES[BOXES.length - 1];
          box.set_right(last, t + dly);
          mac.plotNP = false;
          label.new(Math.round((box.get_left(last) + box.get_right(last)) / 2), 1, 'ⓘ\n\n\n\n\n\n', 'bar_time', 'price',
            NO_COLOR, 'label_center', cfg.macroColor, 'small', undefined, tt);
        }
        if (inMacro && mac.plotNP) box.set_right(BOXES[BOXES.length - 1], t + dly);
      }
      mac.prev = inMacro;
    }

    // Memory clean up: the latest 300 lines of each macro and of the projections, the latest 100 labels
    const cleanLines = (A: Line[]) => {
      if (A.length > 300) {
        for (let k = 0; k <= 3; k++) line.delete(A.shift()!);
      }
    };
    for (const mac of active) cleanLines(mac.lines);
    cleanLines(EXT);
    if (LBL.length > 100) label.delete(LBL.shift()!);
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars, unit === 1 ? 'ms' : 's'),
  };
}

export const IctAlgorithmicMacroTracker = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
