/**
 * Session Streaks [LuxAlgo]
 *
 * Splits the chart into sessions and counts the streaks of bullish and bearish sessions. On intraday charts a session
 * starts on the first bar of the regular session of each trading day and runs until the next one; on daily charts
 * each bar is a session. A session is bullish when its close is at or above its open.
 * - Plots "Top" and "Bottom": the high and the low of the current session so far, coloured by the session direction
 *   with the "Transparency" input (on the first bar of a session the colour is na, i.e. black with that transparency,
 *   as `color.new(na, t)`); a fill between them, a gradient from the bullish colour at the top to the bearish colour
 *   at the bottom ("Horizontal") or the colour of the 10-bar average of the sign of close - session open
 *   ("Vertical").
 * - On the last bars (at most 501 sessions are kept): a label per session at its middle time with the streak
 *   ("Bullish (3)") and two lines at its high and low.
 * - Dashboard (off by default): the streak of the last session and, for the bullish and bearish streaks longer than one
 *   session, their number, median and mode.
 *
 * The session start of intraday bars comes from the exchange time zone and session of the chart context (without
 * them: the UTC day). Charts above the daily timeframe read daily bars inside each chart bar, which the chart bars
 * do not have: the port throws an Error there.
 *
 * Reference: "Session Streaks [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, Series, color, str, array, line, label, resetDrawings, setDrawingBar, timeframe,
  type Line, type Label, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, TableCellData, TableData, TableMergeData, PineSize } from '../types';
import type { ChartContext } from '../chart-context';
import { lastBarConfirmedOf } from '../chart-context';
import { chartTimeframe, periodStarts, sessionFlags } from '../anchor-period';

type Position = 'Top Right' | 'Bottom Right' | 'Bottom Left';
type Size = 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';

export interface SessionStreaksInputs {
  /** Dashboard */
  dashboard: boolean;
  /** Dashboard position */
  dashboardPosition: Position;
  /** Dashboard size */
  dashboardSize: Size;
  bullishColor: string;
  bearishColor: string;
  transparency: number;
  /** Gradient of the fill */
  gradientType: 'Horizontal' | 'Vertical';
}

export const defaultInputs: SessionStreaksInputs = {
  dashboard: false,
  dashboardPosition: 'Top Right',
  dashboardSize: 'Normal',
  bullishColor: '#089981',
  bearishColor: '#F23645',
  transparency: 80,
  gradientType: 'Horizontal',
};

export const inputConfig: InputConfig[] = [
  { id: 'dashboard', type: 'bool', title: 'Dashboard', defval: false, group: 'Dashboard' },
  { id: 'dashboardPosition', type: 'string', title: 'Position', defval: 'Top Right', options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard' },
  { id: 'dashboardSize', type: 'string', title: 'Size', defval: 'Normal', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: 'Dashboard' },
  { id: 'bullishColor', type: 'color', title: 'Bullish', defval: '#089981', group: 'Style' },
  { id: 'bearishColor', type: 'color', title: 'Bearish', defval: '#F23645', group: 'Style' },
  { id: 'transparency', type: 'int', title: 'Transparency', defval: 80, group: 'Style' },
  { id: 'gradientType', type: 'string', title: 'Gradient', defval: 'Horizontal', options: ['Horizontal', 'Vertical'], group: 'Style' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Top', color: '#089981', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Bottom', color: '#089981', lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Session Streaks [LuxAlgo]',
  shortTitle: 'LuxAlgo - Session Streaks',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons within 1e-10 */
const EPS = 1e-10;
const ge = (a: number, b: number) => a - b >= -EPS;

interface Session {
  startTime: number;
  endTime: number;
  openPrice: number;
  closePrice: number;
  top: number;
  bottom: number;
  labelTop: number;
  labelBottom: number;
  tag?: Label;
  topLine?: Line;
  bottomLine?: Line;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SessionStreaksInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { labels: LabelData[]; lines: LineDrawingData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const transp = cfg.transparency;
  const bull = cfg.bullishColor;
  const bear = cfg.bearishColor;

  const tf = chartTimeframe(bars, chart);
  const info = tf === '' ? null : timeframe.info(tf);
  const intraday = info ? info.isintraday : false;
  if (info && !intraday && timeframe.in_seconds(tf) > 86400) {
    throw new Error('Session Streaks: on charts above the daily timeframe the script reads the daily bars inside each chart bar, which the chart bars do not have');
  }

  // session.isfirstbar_regular: from the exchange calendar of the context; without it the first bar of each UTC day
  // (every bar of daily charts)
  let sessionStart: boolean[];
  const flags = sessionFlags(bars, chart);
  if (flags) {
    sessionStart = flags.isfirstbar_regular;
  } else if (!intraday) {
    sessionStart = bars.map(() => true);
  } else {
    const starts = periodStarts(bars, 'D', chart);
    sessionStart = starts.map((s, i) => (i > 0 ? s !== starts[i - 1] : bars[0].time === s));
  }

  const toMs = bars.length > 0 && bars[0].time >= 1e12 ? 1 : 1000;
  const fromMs = (t: number) => t / toMs;
  /** The time of the first bar at or after time t (the bar on which a drawing at time t shows) */
  const onBar = (t: number) => {
    let lo = 0;
    let hi = n - 1;
    if (n === 0 || t > bars[hi].time) return t;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (bars[m].time < t) lo = m + 1;
      else hi = m;
    }
    return bars[lo].time;
  };
  const lastConfirmedHistory = lastBarConfirmedOf(chart) ? n - 1 : n - 2;

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });

  const sessions: Session[] = [];
  const bullishStreaks: number[] = [];
  const bearishStreaks: number[] = [];
  const streak = { bias: '', number: 0 };
  let wasLastBullish = true;

  const sizeOf: Record<Size, PineSize> = { Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Huge: 'huge' };
  const dashSize = sizeOf[cfg.dashboardSize];
  const position = cfg.dashboardPosition === 'Bottom Right' ? 'bottom_right' : cfg.dashboardPosition === 'Bottom Left' ? 'bottom_left' : 'top_right';
  const cells = new Map<string, TableCellData>();
  const merges: TableMergeData[] = [];

  const gatherStatistics = () => {
    if (sessions.length > 0) {
      const s = sessions[sessions.length - 1];
      const bullishSession = ge(s.closePrice, s.openPrice);
      if (bullishSession) {
        if (bullishStreaks.length !== 0 && wasLastBullish) bullishStreaks[bullishStreaks.length - 1] += 1;
        else bullishStreaks.push(1);
      } else if (bearishStreaks.length !== 0 && !wasLastBullish) {
        bearishStreaks[bearishStreaks.length - 1] += 1;
      } else {
        bearishStreaks.push(1);
      }
      wasLastBullish = bullishSession;
    }
  };

  const cell = (column: number, row: number, text: string, align: 'left' | 'center' | 'right' = 'right', textColor = '#FFFFFF', bg?: string) => {
    cells.set(`${column},${row}`, {
      column, row, text, textColor, textSize: dashSize, textHAlign: align, ...(bg !== undefined ? { bgColor: bg } : {}),
    });
  };

  const updateDashboard = () => {
    const last = sessions.length > 0 ? sessions[sessions.length - 1] : null;
    const css = last ? (ge(last.closePrice, last.openPrice) ? bull : bear) : null;
    const tag = (last && last.tag ? label.get_text(last.tag) : '') ?? '';
    cell(1, 0, tag, 'center', css === null ? 'transparent' : css, String(color.new(css, transp)));
  };

  const drawDashboard = () => {
    merges.push({ startColumn: 1, startRow: 0, endColumn: 2, endRow: 0 });
    cell(0, 0, 'Current', 'center');
    merges.push({ startColumn: 0, startRow: 1, endColumn: 2, endRow: 1 });
    cell(0, 1, 'Streaks', 'center');
    cell(1, 2, 'Bullish', 'center');
    cell(2, 2, 'Bearish', 'center');
    cell(0, 3, 'Number', 'left');
    cell(0, 4, 'Median', 'left');
    cell(0, 5, 'Mode', 'left');
    updateDashboard();
    const parsedBull = array.from(...bullishStreaks.filter((s) => s > 1));
    const parsedBear = array.from(...bearishStreaks.filter((s) => s > 1));
    cell(1, 3, str.format('{0, number, 0}', array.size(parsedBull)));
    cell(2, 3, str.format('{0, number, 0}', array.size(parsedBear)));
    cell(1, 4, str.format('{0, number, 0.00}', array.median(parsedBull)));
    cell(2, 4, str.format('{0, number, 0.00}', array.median(parsedBear)));
    cell(1, 5, str.format('{0, number, 0.00}', array.mode(parsedBull)));
    cell(2, 5, str.format('{0, number, 0.00}', array.mode(parsedBear)));
  };

  const drawSession = (s: Session) => {
    const bullishArea = ge(s.closePrice, s.openPrice);
    const bias = bullishArea ? 'Bullish' : 'Bearish';
    if (streak.bias === bias) streak.number += 1;
    else {
      streak.bias = bias;
      streak.number = 1;
    }
    const tag = `${streak.bias} (${str.tostring(streak.number)})`;
    const css = bullishArea ? bull : bear;
    if (s.tag) label.delete(s.tag);
    if (s.topLine) line.delete(s.topLine);
    if (s.bottomLine) line.delete(s.bottomLine);
    // a time between two bars is drawn on the next bar
    const mid = onBar(fromMs(s.startTime + Math.round(0.5 * (s.endTime - s.startTime))));
    s.tag = label.new(mid, bullishArea ? s.labelBottom : s.labelTop, tag, 'bar_time', 'price', 'transparent',
      bullishArea ? 'label_up' : 'label_down', css, 'normal');
    const lineCss = String(color.new(css, 50));
    s.topLine = line.new(fromMs(s.startTime), s.top, fromMs(s.endTime), s.top, 'bar_time', 'none', lineCss);
    s.bottomLine = line.new(fromMs(s.startTime), s.bottom, fromMs(s.endTime), s.bottom, 'bar_time', 'none', lineCss);
  };

  const topArr: number[] = [];
  const bottomArr: number[] = [];
  const fillCss: Array<string | null> = [];
  const delta: number[] = [];

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const time = b.time * toMs;
    if (intraday) {
      // gatherData()
      if (sessionStart[i]) {
        gatherStatistics();
        if (sessions.length > 500) sessions.shift();
        sessions.push({
          startTime: time, endTime: time, openPrice: b.open, closePrice: b.close, top: b.high, bottom: b.low,
          labelTop: NaN, labelBottom: NaN,
        });
      }
      if (sessions.length > 0) {
        const s = sessions[sessions.length - 1];
        s.endTime = time;
        s.closePrice = b.close;
        s.top = Math.max(s.top, b.high);
        s.bottom = Math.min(s.bottom, b.low);
        s.labelTop = s.top;
        s.labelBottom = s.bottom;
      }
    } else {
      // gatherDataHTF(): request.security('', 'D', ...) on a daily chart is the chart bar
      gatherStatistics();
      if (sessions.length > 500) sessions.shift();
      sessions.push({
        startTime: time, endTime: time, openPrice: b.open, closePrice: b.close, top: b.high, bottom: b.low,
        labelTop: b.high, labelBottom: b.low,
      });
    }

    if (i === lastConfirmedHistory) {
      for (const s of sessions) drawSession(s);
      if (cfg.dashboard) drawDashboard();
    }
    if (i === n - 1) {
      if (intraday) streak.number -= 1;
      if (sessions.length === 0) throw new Error('Session Streaks: array.last() on an empty array (no session start in the bars)');
      drawSession(sessions[sessions.length - 1]);
      if (cfg.dashboard) updateDashboard();
    }

    const last = sessions.length > 0 ? sessions[sessions.length - 1] : null;
    topArr.push(last ? last.top : NaN);
    bottomArr.push(last ? last.bottom : NaN);
    fillCss.push(last && !sessionStart[i] ? (ge(last.closePrice, last.openPrice) ? bull : bear) : null);
    delta.push(last ? b.close - last.openPrice : NaN);
  }
  setDrawingBar(null);

  const smooth = ta.sma(Series.fromArray(bars, delta.map((d) => (isNaN(d) ? NaN : Math.sign(d)))), 10).toArray()
    .map((v) => v ?? NaN);
  const bearT = String(color.new(bear, transp));
  const bullT = String(color.new(bull, transp));
  const vertical = cfg.gradientType === 'Vertical';
  const horizontal = cfg.gradientType === 'Horizontal';

  const plot0 = bars.map((b, i) => ({ time: b.time, value: topArr[i], color: String(color.new(fillCss[i], transp)) }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: bottomArr[i], color: String(color.new(fillCss[i], transp)) }));
  const fills = [
    // fill(topPlot, bottomPlot, gradientTypeInput == VERTICAL ? smoothGradient : color(na))
    {
      plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' },
      colors: smooth.map((s) => (vertical && !isNaN(s) ? String(color.from_gradient(s, -1, 1, bearT, bullT)) : 'transparent')),
    },
    // fill(topPlot, bottomPlot, topLevel, bottomLevel, bullish colour, bearish colour) for "Horizontal"
    {
      plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' },
      gradient: {
        topValue: topArr, bottomValue: bottomArr,
        topColor: bars.map(() => (horizontal ? bullT : null)), bottomColor: bars.map(() => (horizontal ? bearT : null)),
      },
    },
  ];

  const live = (x: number, y: number) => !isNaN(x) && !isNaN(y);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills,
    labels: label.all().filter((l) => live(l.x, l.y)).map((l) => ({
      time: l.x, price: l.y, text: l.text ?? '', color: 'transparent', textColor: String(l.textcolor),
      style: l.style as 'label_up' | 'label_down', size: 'normal' as const,
    })),
    lines: line.all().filter((l) => live(l.x1, l.y1)).map((l) => ({
      time1: l.x1, price1: l.y1, time2: l.x2, price2: l.y2, color: String(l.color), width: 1,
    })),
    // var table t_able = table.new(...): created on the first bar, cells only with the dashboard
    tables: n > 0 ? [{
      position, columns: 3, rows: 12, bgColor: '#1e222d', borderColor: '#373a46', borderWidth: 1,
      frameColor: '#373a46', frameWidth: 1, cells: [...cells.values()], ...(merges.length > 0 ? { merges } : {}),
    }] : [],
  };
}

export const SessionStreaks = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
