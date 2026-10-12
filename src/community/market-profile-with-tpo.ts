/**
 * Market Profile with TPO
 *
 * A market profile per session: how many bars traded at each price row (one "TPO" per bar and row).
 * - Sessions: a month on daily bars, a year on weekly and monthly bars, a day on intraday bars above 5 minutes
 *   ("Use 24hr Session?"), an hour on bars of 5 minutes or less, a minute on second bars. With the 24 hour option
 *   off, intraday bars above 5 minutes use up to four sessions of the day (times read in UTC).
 * - Row height ("tick size"): fixed for a session. Automatic: the average bar height at the session starts (average
 *   high minus average low of the last "Bars Back" session-start bars) divided by the target height, rounded to the
 *   symbol tick. Manual: a number of symbol ticks.
 * - Point of control (POC): the row with the most TPOs (the one nearest to the middle of the range on a tie).
 *   Value area: rows are added above and below the POC, two at a time, until the "Value Area Percent" of the TPOs
 *   is covered.
 * - Drawings: one box per run of rows with the same width (the number of TPOs) and colour (POC, in value, out of
 *   value); three lines per session (POC, value area high, value area low) that run to the bar after the current
 *   one; on the last bar, one letter per TPO of the current session (A for the first bar of the session, B for the
 *   second...; the row of a bar's open has its own colour) and a marker text at the current price when the last
 *   bar is still open; an info table (ticks per row, row height, number of TPOs, current letter, session) and a
 *   warning table above 495 TPOs. At most 500 boxes, 501 lines and 501 labels are kept.
 *
 * As the original, the automatic row height needs "Bars Back" session starts in its history: with fewer the row
 * height is not available and the script stops with an array error (thrown here with the same message). On a first
 * session shorter than "Bars Back" - 1 bars this happens on the third session start, so with the default inputs the
 * script only runs on charts whose first day has 47 bars or more (e.g. 15 minute bars of a 24 hour market).
 *
 * Chart values (third argument): the port reads the symbol tick (without it: 0.01), the symbol type ("stock", "cfd"
 * and "economic" force the 24 hour session; without it, the exchange time zone is used for the sessions, as for
 * an unknown type), the exchange time zone (calendar fields of the bars; without it: UTC), the chart timeframe
 * (without it: from the bar spacing) and the state of the last bar (the current price marker is only kept while
 * the last bar is open; without it: closed).
 *
 * Reference: "Market Profile with TPO" by drother
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © drother
 */

import {
  callsite, color, math, str, time as pineTime, timeframe, SessionBars, TradingCalendar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, PineSize, TableData, TableCellData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import { lastBarConfirmedOf, mintickOf, symbolTypeOf, timezoneOf, type ChartContext } from '../chart-context';

export interface MarketProfileWithTpoInputs {
  autoTickSize: boolean;
  /** Session starts averaged for the automatic row height */
  tickBarsBack: number;
  /** Average target session height, in rows per average bar height */
  targetSessionHt: number;
  /** Manual row height in symbol ticks */
  manTickSize: number;
  /** Value area, percent of the TPOs */
  valueAreaPct: number;
  openColor: string;
  pocTpoColor: string;
  pocBoxColor: string;
  pocLineColor: string;
  inValueTpoColor: string;
  inValueBoxColor: string;
  inValueLineColor: string;
  inValueBoxTransparency: number;
  outOfValueTpoColor: string;
  outOfValueBoxColor: string;
  outOfValueBoxTransparency: number;
  tpoTxtSize: PineSize;
  currPriceText: string;
  tpoLetterSpace: string;
  showTpoInfo: boolean;
  infoTableTxtSize: PineSize;
  infoTableTextColor: string;
  infoTableColor: string;
  plotTpoLetters: boolean;
  sessionOption24hr: boolean;
  /** Session days: 1 = Sunday ... 7 = Saturday */
  sessDays: string;
  showSess1: boolean;
  sess1Name: string;
  sess1Time: string;
  showSess2: boolean;
  sess2Name: string;
  sess2Time: string;
  showSess3: boolean;
  sess3Name: string;
  sess3Time: string;
  showSess4: boolean;
  sess4Name: string;
  sess4Time: string;
  showWarning: boolean;
}

export const defaultInputs: MarketProfileWithTpoInputs = {
  autoTickSize: true,
  tickBarsBack: 48,
  targetSessionHt: 5,
  manTickSize: 100,
  valueAreaPct: 68.26,
  openColor: '#FF9800',
  pocTpoColor: '#FF5252',
  pocBoxColor: '#FF5252',
  pocLineColor: '#FF5252',
  inValueTpoColor: '#2962FF',
  inValueBoxColor: '#2962FF',
  inValueLineColor: '#2962FF',
  inValueBoxTransparency: 70,
  outOfValueTpoColor: '#4CAF50',
  outOfValueBoxColor: '#4CAF50',
  outOfValueBoxTransparency: 70,
  tpoTxtSize: 'small',
  currPriceText: '  🔴',
  tpoLetterSpace: '   ',
  showTpoInfo: true,
  infoTableTxtSize: 'small',
  infoTableTextColor: '#FFFFFF',
  infoTableColor: '#787B86',
  plotTpoLetters: true,
  sessionOption24hr: true,
  sessDays: '1234567',
  showSess1: true,
  sess1Name: 'Asian',
  sess1Time: '0000-0759',
  showSess2: true,
  sess2Name: 'London',
  sess2Time: '0800-1329',
  showSess3: true,
  sess3Name: 'US',
  sess3Time: '1330-1959',
  showSess4: true,
  sess4Name: 'Pre Market',
  sess4Time: '2000-0000',
  showWarning: true,
};

const SIZES = ['auto', 'tiny', 'small', 'normal', 'large', 'huge'];
const G_TICK = 'Tick Size';
const G_MP = 'Market Profile Options';
const G_SESS = 'Market Session';

export const inputConfig: InputConfig[] = [
  { id: 'autoTickSize', type: 'bool', title: 'Auto Tick Size?', defval: true, group: G_TICK },
  { id: 'tickBarsBack', type: 'int', title: 'Avg Tick Size - Bars Back', defval: 48, min: 1, group: G_TICK },
  { id: 'targetSessionHt', type: 'float', title: 'Average Target Session Height for Tick Size', defval: 5, min: 1, group: G_TICK },
  { id: 'manTickSize', type: 'int', title: 'Manual Tick Size', defval: 100, min: 1, group: G_TICK },
  { id: 'valueAreaPct', type: 'float', title: 'Value Area Percent', defval: 68.26, min: 0.01, max: 100, group: G_MP, tooltip: 'Values are typically 68.26 to 70' },
  { id: 'openColor', type: 'color', title: 'Open TPO Text Color', defval: '#FF9800', group: G_MP },
  { id: 'pocTpoColor', type: 'color', title: 'POC TPO Text Color', defval: '#FF5252', group: G_MP },
  { id: 'pocBoxColor', type: 'color', title: 'POC Box Color', defval: '#FF5252', group: G_MP },
  { id: 'pocLineColor', type: 'color', title: 'POC Line Color', defval: '#FF5252', group: G_MP },
  { id: 'inValueTpoColor', type: 'color', title: 'In Value TPO Text Color', defval: '#2962FF', group: G_MP },
  { id: 'inValueBoxColor', type: 'color', title: 'In Value Box Color', defval: '#2962FF', group: G_MP },
  { id: 'inValueLineColor', type: 'color', title: 'In Value Line Color', defval: '#2962FF', group: G_MP },
  { id: 'inValueBoxTransparency', type: 'int', title: 'In Value Box Transparency', defval: 70, min: 0, max: 100, group: G_MP },
  { id: 'outOfValueTpoColor', type: 'color', title: 'Out Of Value TPO Text Color', defval: '#4CAF50', group: G_MP },
  { id: 'outOfValueBoxColor', type: 'color', title: 'Out Of Value Box Color', defval: '#4CAF50', group: G_MP },
  { id: 'outOfValueBoxTransparency', type: 'int', title: 'Out of Value Box Transparency', defval: 70, min: 0, max: 100, group: G_MP },
  { id: 'tpoTxtSize', type: 'string', title: 'TPO Letter Size', defval: 'small', options: SIZES, group: G_MP },
  { id: 'currPriceText', type: 'string', title: 'Current Price Text', defval: '  🔴', group: G_MP },
  { id: 'tpoLetterSpace', type: 'string', title: 'TPO Spacer to center over Candle', defval: '   ', group: G_MP },
  { id: 'showTpoInfo', type: 'bool', title: 'Show TPO Info Text?', defval: true, group: G_MP },
  { id: 'infoTableTxtSize', type: 'string', title: 'TPO Info Text Size', defval: 'small', options: SIZES, group: G_MP },
  { id: 'infoTableTextColor', type: 'color', title: 'Info Box Letter Color', defval: '#FFFFFF', group: G_MP },
  { id: 'infoTableColor', type: 'color', title: 'Info Box Background Color', defval: '#787B86', group: G_MP },
  { id: 'plotTpoLetters', type: 'bool', title: 'Plot TPO Letters?', defval: true, group: G_MP },
  { id: 'sessionOption24hr', type: 'bool', title: 'Use 24hr Session? Overwrites all below settings', defval: true, group: G_SESS, tooltip: 'Forced to True for CFDs/Stocks' },
  { id: 'sessDays', type: 'string', title: 'Session Days of Week', defval: '1234567', group: G_SESS, tooltip: '1 = Sunday, 7 = Saturday' },
  { id: 'showSess1', type: 'bool', title: 'Show Session 1?', defval: true, group: G_SESS },
  { id: 'sess1Name', type: 'string', title: 'Session 1 Name', defval: 'Asian', group: G_SESS },
  { id: 'sess1Time', type: 'session', title: 'Session 1', defval: '0000-0759', group: G_SESS, tooltip: 'Times are GMT' },
  { id: 'showSess2', type: 'bool', title: 'Show Session 2?', defval: true, group: G_SESS },
  { id: 'sess2Name', type: 'string', title: 'Session 1 Name', defval: 'London', group: G_SESS },
  { id: 'sess2Time', type: 'session', title: 'Session 2', defval: '0800-1329', group: G_SESS, tooltip: 'Times are GMT' },
  { id: 'showSess3', type: 'bool', title: 'Show Session 3?', defval: true, group: G_SESS },
  { id: 'sess3Name', type: 'string', title: 'Session 1 Name', defval: 'US', group: G_SESS },
  { id: 'sess3Time', type: 'session', title: 'Session 3', defval: '1330-1959', group: G_SESS, tooltip: 'Times are GMT' },
  { id: 'showSess4', type: 'bool', title: 'Show Session 4?', defval: true, group: G_SESS },
  { id: 'sess4Name', type: 'string', title: 'Session 1 Name', defval: 'Pre Market', group: G_SESS },
  { id: 'sess4Time', type: 'session', title: 'Session 4', defval: '2000-0000', group: G_SESS, tooltip: 'Times are GMT' },
  { id: 'showWarning', type: 'bool', title: 'Show Tick Warning?', defval: true, group: 'Debug' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Market Profile with TPO',
  shortTitle: 'Market Profile with TPO',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** color.black, color.red, color.white of Pine v5; default text colour of a v5 label */
const BLACK = '#363A45';
const RED = '#FF5252';
const WHITE = '#FFFFFF';
const LABEL_TEXT = '#363A45';

const TPO_NAME_LIST = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y',
  'Z', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x',
  'y', 'z', '!', '@', '#', '$', '%', '&', '*',
];

/** array.get: a Pine runtime error outside the array */
function get<T>(arr: T[], index: number): T {
  if (Number.isNaN(index) || index < 0 || index >= arr.length) {
    throw new Error(`In 'array.get()' function. Index ${Number.isNaN(index) ? 'na' : index} is out of bounds, array size is ${arr.length}.`);
  }
  return arr[index];
}
/** array.indexof / array.lastindexof / array.includes compare like Pine `==` */
const indexOf = (arr: number[], v: number) => arr.findIndex((x) => eq(x, v));
const lastIndexOf = (arr: number[], v: number) => {
  for (let k = arr.length - 1; k >= 0; k--) if (eq(arr[k], v)) return k;
  return -1;
};
/** array.max / array.min: na on an empty array */
const arrMax = (arr: number[]) => (arr.length === 0 ? NaN : Math.max(...arr));
const arrMin = (arr: number[]) => (arr.length === 0 ? NaN : Math.min(...arr));
/** int(x): truncation; na stays na */
const int = (x: number) => Math.trunc(x);
const sameColor = (a: string, b: string) =>
  color.r(a) === color.r(b) && color.g(a) === color.g(b) && color.b(a) === color.b(b) && color.t(a) === color.t(b);

/** fn_build_VA(): indexes of the value area low and high rows */
function buildVA(pocIndex: number, tpo: number[], vaPct: number): [number, number] {
  let left = math.round(tpo.reduce((s, v) => s + v, 0) * vaPct - get(tpo, pocIndex));
  const mid = math.round((tpo.length - 1) / 2);
  let VAL = pocIndex;
  let VAH = pocIndex;
  const max = tpo.length - 1;
  for (let i = 0; i <= max; i++) {
    if (!(left > 0)) continue;
    let up2 = 0;
    let up1 = 0;
    let dn1 = 0;
    let dn2 = 0;
    if (VAH === max) {
      up2 = 0;
      up1 = 0;
    } else if (VAH + 1 === max) {
      up2 = 0;
      up1 = get(tpo, VAH + 1);
    } else {
      up2 = get(tpo, VAH + 2);
      up1 = get(tpo, VAH + 1);
    }
    if (VAL === 0) {
      dn2 = 0;
      dn1 = 0;
    } else if (VAL - 1 === 0) {
      dn2 = 0;
      dn1 = get(tpo, VAL - 1);
    } else {
      dn2 = get(tpo, VAL - 2);
      dn1 = get(tpo, VAL - 1);
    }
    const dH = Math.abs(VAH - mid);
    const dL = Math.abs(VAL - mid);
    const up = up1 + up2;
    const dn = dn1 + dn2;
    // One row, the side with more TPOs; on a tie the side nearer to the middle row, else the low side
    const oneRow = () => {
      if (up1 > dn1) {
        left -= up1;
        VAH += 1;
      } else if (up1 < dn1) {
        left -= dn1;
        VAL -= 1;
      } else if (dH < dL) {
        left -= up1;
        VAH += 1;
      } else {
        left -= dn1;
        VAL -= 1;
      }
    };
    if (VAH + 2 <= max && VAL - 2 >= 0) {
      if (up > dn && left - up >= 0) {
        left -= up;
        VAH += 2;
      } else if (dn > up && left - dn >= 0) {
        left -= dn;
        VAL -= 2;
      } else if (up > dn && left - up1 >= 0) {
        left -= up;
        VAH += 2;
      } else if (dn > up && left - dn1 >= 0) {
        // as the original: this case also takes the two rows above
        left -= up;
        VAH += 2;
      } else if (up === dn) {
        if (dH < dL && left - up >= 0) {
          left -= up;
          VAH += 2;
        } else if (dH > dL && left - dn >= 0) {
          left -= dn;
          VAL -= 2;
        } else if (dH === dL && left - dn >= 0) {
          left -= dn;
          VAL -= 2;
        } else if (dH < dL) {
          left -= up1;
          VAH += 1;
        } else {
          left -= dn1;
          VAL -= 1;
        }
      } else {
        oneRow();
      }
    } else if (VAH + 1 === max || VAL - 1 === 0) {
      oneRow();
    }
  }
  return [VAL, VAH];
}

interface Ln { x1: number; y: number; x2: number; color: string }
interface Bx { left: number; top: number; right: number; bottom: number; bg: string }
interface Lb { x: number; y: number; text: string; textColor: string }

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketProfileWithTpoInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const mintick = mintickOf(chart);
  const symbolType = symbolTypeOf(chart);
  const exchangeTz = timezoneOf(chart);
  const valueAreaPct = cfg.valueAreaPct / 100;
  const tickBarsBackInput = Math.trunc(cfg.tickBarsBack);

  // tz: UTC for the known symbol types, else the exchange time zone; stocks, CFDs and economic data use the 24 hour session
  let option24hr = cfg.sessionOption24hr;
  if (symbolType === 'stock' || symbolType === 'economic' || symbolType === 'cfd') option24hr = true;
  const known = ['stock', 'futures', 'index', 'forex', 'crypto', 'fund', 'dr', 'economic', 'cfd'];
  const tz = known.includes(symbolType) ? 'Etc/UTC' : exchangeTz;

  const tfInfo = timeframe.info(chartTimeframe(bars, chart) || '1D');
  const unit = n > 0 && bars[0].time >= 1e12 ? 1 : 1000; // bar time unit in ms
  const tMs = (i: number) => (bars[i].time as number) * unit;
  // bar size for the clock-change rule of the session test (intraday bars)
  const barMs = tfInfo.isintraday ? timeframe.in_seconds(tfInfo.period) * 1000 : undefined;
  // time("1440", session, tz): na outside the session, else the start of the 1440-minute period counted from the
  // start of the session run of the bar, from the session periods of the library calendar (only compared with the
  // value of the bar before: a new value is a new session)
  const sessionTimes = new Map<string, (t: number) => number>();
  const sessTime = (i: number, session: string): number => {
    let fn = sessionTimes.get(session);
    if (!fn) {
      const cal = new SessionBars(new TradingCalendar(tz, { session }, 'pine'), tfInfo.period);
      fn = (t) => (pineTime.inSession(t, session, tz, barMs) ? cal.timeOf(t, '1440') : NaN);
      sessionTimes.set(session, fn);
    }
    return fn(tMs(i));
  };
  const sess24hr = `0000-0000:${cfg.sessDays}`;
  const sessions = [
    { session: `${cfg.sess1Time}:${cfg.sessDays}`, show: cfg.showSess1, name: cfg.sess1Name },
    { session: `${cfg.sess2Time}:${cfg.sessDays}`, show: cfg.showSess2, name: cfg.sess2Name },
    { session: `${cfg.sess3Time}:${cfg.sessDays}`, show: cfg.showSess3, name: cfg.sess3Name },
    { session: `${cfg.sess4Time}:${cfg.sessDays}`, show: cfg.showSess4, name: cfg.sess4Name },
  ];
  // ta.barssince(fn_is_session_start("1440", sessN)) of each session branch: the call only runs, and only keeps its
  // history, on the bars where its branch is taken
  const sessionSites = sessions.map(() => ({ prevT: NaN, since: NaN }));

  // Calendar field read by the session rule of the chart timeframe (exchange time zone), and its barssince state
  type Mode = 'year' | 'month' | 'dayofweek' | 'hour' | 'minute' | 'sessions';
  let mode: Mode;
  let whichFixed = 0;
  if (tfInfo.ismonthly) { mode = 'year'; whichFixed = -4; }
  else if (tfInfo.isweekly) { mode = 'year'; whichFixed = -3; }
  else if (tfInfo.isdaily) { mode = 'month'; whichFixed = -2; }
  else if (option24hr && tfInfo.multiplier > 5 && tfInfo.isminutes) { mode = 'dayofweek'; whichFixed = -1; }
  else if (tfInfo.multiplier <= 5 && tfInfo.isminutes) { mode = 'hour'; whichFixed = 5; }
  else if (tfInfo.isseconds) { mode = 'minute'; whichFixed = 6; }
  else mode = 'sessions';
  const field = (i: number): number => {
    const t = tMs(i);
    switch (mode) {
      case 'year': return pineTime.year(t, exchangeTz);
      case 'month': return pineTime.month(t, exchangeTz);
      case 'dayofweek': return pineTime.dayofweek(t, exchangeTz);
      case 'hour': return pineTime.hour(t, exchangeTz);
      default: return pineTime.minute(t, exchangeTz);
    }
  };
  let prevField = NaN;
  let since = NaN; // ta.barssince(ta.change(field)): na before the first change

  // ta.sma(high, tick_bars_back) and ta.sma(low, tick_bars_back) inside the `if`: their history is the session starts
  const smaHigh = callsite.sma();
  const smaLow = callsite.sma();

  const tickSize: number[] = new Array<number>(n).fill(NaN);
  const openTick: number[] = new Array<number>(n).fill(NaN);
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);

  const tpoNames: string[] = [];
  // Drawings alive, in creation order
  const lines = new Set<Ln>();
  const boxes = new Set<Bx>();
  const labels = new Set<Lb>();
  let labelIds: Lb[] = [];
  let boxIDs: Bx[] = [];
  const lastBoxIDs: Bx[] = [];
  const lineIDs: Array<Ln | null> = [null, null, null];
  const lastLineIDs: Array<Ln | null> = [];
  let redPill: Lb | null = null;
  const delLine = (l: Ln | null | undefined) => { if (l) lines.delete(l); };
  const delBox = (b: Bx | undefined) => { if (b) boxes.delete(b); };
  const delLabel = (l: Lb | null | undefined) => { if (l) labels.delete(l); };
  const newLine = (x1: number, y: number, x2: number, css: string): Ln => {
    const l = { x1, y, x2, color: css };
    lines.add(l);
    return l;
  };

  const last = n - 1;
  // barstate.islastconfirmedhistory on the last bar
  const lastIsConfirmedHistory = lastBarConfirmedOf(chart) && chart?.realtime !== true;
  let totalTpoCount = 0;
  let lastTick = NaN;
  let lastSessStart = 0;
  let lastInSession = false;
  let lastWhich = 0;

  for (let i = 0; i < n; i++) {
    const { open, high, low, close } = bars[i];
    let isInSession = false;
    let sessStart = i;
    let whichSess = 0;
    const tickBarsBack = tickBarsBackInput > i + 1 ? i + 1 : tickBarsBackInput;

    if (mode === 'sessions') {
      let taken = -1;
      for (let k = 0; k < 4 && taken < 0; k++) {
        if (!Number.isNaN(sessTime(i, sessions[k].session)) && sessions[k].show) taken = k;
      }
      if (taken >= 0) {
        const site = sessionSites[taken];
        const t = sessTime(i, sessions[taken].session);
        // fn_is_session_start(): na(t[1]) and not na(t) or t[1] < t
        const started = (Number.isNaN(site.prevT) && !Number.isNaN(t)) || lt(site.prevT, t);
        site.prevT = t;
        site.since = started ? 0 : Number.isNaN(site.since) ? NaN : site.since + 1;
        isInSession = true;
        sessStart = Number.isNaN(site.since) ? 0 : site.since;
        whichSess = taken + 1;
      } else {
        isInSession = false;
        sessStart = 0;
        whichSess = 5;
      }
    } else {
      const v = field(i);
      const changed = !Number.isNaN(prevField) && v !== prevField;
      prevField = v;
      since = changed ? 0 : Number.isNaN(since) ? NaN : since + 1;
      sessStart = Number.isNaN(since) ? 0 : since;
      whichSess = whichFixed;
      isInSession = mode === 'year' || mode === 'month' ? true : !Number.isNaN(sessTime(i, sess24hr));
    }
    if (symbolType === 'economic') isInSession = false;
    const sessStartBar = i - sessStart;

    // Row height of the session
    let tick: number;
    if (cfg.autoTickSize && sessStart === 0) {
      const avgBarHt = smaHigh(i, high, tickBarsBack) - smaLow(i, low, tickBarsBack);
      let auto = math.round_to_mintick(avgBarHt / cfg.targetSessionHt, mintick);
      if (auto === 0) auto = mintick;
      tick = auto;
    } else if (sessStart === 0) {
      tick = Math.trunc(cfg.manTickSize) * mintick;
    } else {
      tick = i - sessStart >= 0 ? tickSize[i - sessStart] : NaN;
    }
    tickSize[i] = tick;
    const halfTick = math.round_to_mintick(tick * 0.5, mintick);

    // TPO letters: one more name per bar of the longest session so far
    const requiredNames = sessStart - tpoNames.length;
    const nameMult = int(tpoNames.length / TPO_NAME_LIST.length);
    if (requiredNames >= 0) {
      for (let k = 0; k <= requiredNames; k++) tpoNames.push(get(TPO_NAME_LIST, tpoNames.length - TPO_NAME_LIST.length * nameMult));
    }

    let highestHigh = high;
    let lowestLow = low;
    for (let k = 0; k <= sessStart; k++) {
      if (gt(H(i - k), highestHigh)) highestHigh = H(i - k);
      if (lt(L(i - k), lowestLow)) lowestLow = L(i - k);
    }
    const tpoMax = int(highestHigh / tick) * tick;
    const tpoMin = int(lowestLow / tick) * tick;
    const tpoRows = (tpoMax - tpoMin) / tick;
    openTick[i] = int(open / tick) * tick;
    const tpoMid = math.round_to_mintick((tpoMin + tpoMax) / 2, mintick);
    totalTpoCount = 0;
    // var label red_pill = na, label.delete(red_pill)
    delLabel(redPill);
    const tpoPrice: number[] = [];
    const tpoLength: number[] = [];

    if (isInSession) {
      if (sessStart === 0) {
        lastBoxIDs.push(...boxIDs);
        if (lastLineIDs.length > 497) for (let k = 0; k < 3; k++) delLine(lastLineIDs.shift());
        lastLineIDs.push(...lineIDs);
        lineIDs[0] = null;
        lineIDs[1] = null;
        lineIDs[2] = null;
        boxIDs = [];
      }
      for (const b of boxIDs) delBox(b);
      boxIDs = [];
      for (const l of labelIds) delLabel(l);
      labelIds = [];

      // TPO count of each row. The loop end is compared like Pine `<=` (a row count of 1.99999999999998 gives rows 0 to
      // 2); a loop to an na row count does not run
      for (let r = 0; le(r, tpoRows); r++) {
        const priceTickMin = tpoMin + r * tick;
        const priceTickMax = priceTickMin + tick - mintick;
        let count = 0;
        for (let k = 0; k <= sessStart; k++) if (ge(H(i - k), priceTickMin) && le(L(i - k), priceTickMax)) count += 1;
        tpoLength.push(count);
        tpoPrice.push(priceTickMin);
      }

      // POC and value area
      totalTpoCount = tpoLength.reduce((s, v) => s + v, 0);
      const maxTpos = arrMax(tpoLength);
      let tpoPoc: number;
      if (indexOf(tpoLength, maxTpos) === lastIndexOf(tpoLength, maxTpos)) {
        tpoPoc = get(tpoPrice, indexOf(tpoLength, maxTpos));
      } else {
        const possiblePrice: number[] = [];
        const possibleDist: number[] = [];
        for (let k = 0; k < tpoLength.length; k++) {
          if (tpoLength[k] === maxTpos) {
            possiblePrice.push(tpoPrice[k]);
            possibleDist.push(Math.abs(tpoPrice[k] - tpoMid));
          }
        }
        let counter = 0;
        const candidates = possiblePrice.length;
        for (let k = 0; k < candidates; k++) {
          if (possiblePrice.length > counter) {
            if (!eq(arrMin(possibleDist), possibleDist[counter])) {
              possibleDist.splice(counter, 1);
              possiblePrice.splice(counter, 1);
            } else {
              counter += 1;
            }
          }
        }
        // one candidate left or several at the same distance: the first one
        tpoPoc = get(possiblePrice, 0);
      }
      const pocIndex = indexOf(tpoPrice, tpoPoc);
      const [valIndex, vahIndex] = buildVA(pocIndex, tpoLength, valueAreaPct);
      const tpoVal = get(tpoPrice, valIndex);
      const tpoVah = get(tpoPrice, vahIndex);

      let lastBoxColor = cfg.outOfValueTpoColor;
      for (let r = 0; le(r, tpoRows); r++) {
        const priceTickMin = get(tpoPrice, r);
        const priceTickMax = priceTickMin + tick;
        // bars of the session in the row, as offsets from the session start (oldest first)
        const rowData: number[] = [];
        for (let k = sessStart; k >= 0; k--) if (ge(H(i - k), priceTickMin) && lt(L(i - k), priceTickMax)) rowData.push(sessStart - k);
        const numOfTpos = rowData.length;
        const leftSide = sessStartBar;
        const isPoc = eq(priceTickMin, tpoPoc);
        if (isPoc) {
          delLine(lineIDs[0]);
          lineIDs[0] = newLine(leftSide, priceTickMin + halfTick, i + 1, cfg.pocLineColor);
        }
        const rightSide = sessStartBar + numOfTpos;
        const isInValue = ge(priceTickMin, tpoVal) && le(priceTickMin, tpoVah);
        if (eq(priceTickMin, tpoVah)) {
          delLine(lineIDs[1]);
          lineIDs[1] = newLine(leftSide, priceTickMax, i + 1, cfg.inValueLineColor);
        }
        if (eq(priceTickMin, tpoVal)) {
          delLine(lineIDs[2]);
          lineIDs[2] = newLine(leftSide, priceTickMin, i + 1, cfg.inValueLineColor);
        }
        const boxColor = isPoc ? cfg.pocBoxColor : isInValue ? cfg.inValueBoxColor : cfg.outOfValueBoxColor;
        const transparency = isInValue ? cfg.inValueBoxTransparency : cfg.outOfValueBoxTransparency;
        const lastBox = boxIDs.length > 0 ? boxIDs[boxIDs.length - 1] : null;
        if (lastBox && rightSide === lastBox.right && !isPoc && !eq(lastBox.bottom, tpoPoc) && sameColor(lastBoxColor, boxColor)) {
          lastBox.top = priceTickMax;
        } else {
          if (boxIDs.length + lastBoxIDs.length > 499 && lastBoxIDs.length > 0) delBox(lastBoxIDs.shift());
          if (boxIDs.length + lastBoxIDs.length > 499 && boxIDs.length > 0) delBox(boxIDs.shift());
          const box: Bx = {
            left: leftSide, top: priceTickMax, right: rightSide, bottom: priceTickMin, bg: String(color.new(boxColor, transparency)),
          };
          boxes.add(box);
          boxIDs.push(box);
        }

        if (cfg.plotTpoLetters && i === last) {
          for (let k = 0; k < rowData.length; k++) {
            if (labelIds.length > 499) delLabel(labelIds.shift());
            const letterIndex = rowData[k];
            const openIdx = i - (sessStart - letterIndex);
            const atOpen = openIdx >= 0 && eq(priceTickMin, openTick[openIdx]);
            const tpoColor = isPoc ? cfg.pocTpoColor : atOpen ? cfg.openColor : isInValue ? cfg.inValueTpoColor : cfg.outOfValueTpoColor;
            const label: Lb = { x: leftSide + k, y: priceTickMin, text: cfg.tpoLetterSpace + get(tpoNames, letterIndex), textColor: tpoColor };
            labels.add(label);
            labelIds.push(label);
          }
        }
        lastBoxColor = boxColor;
      }

      const currPriceY = int(close / tick) * tick;
      const found = indexOf(tpoPrice, currPriceY);
      const currPriceYIndex = found >= 0 ? found : sessStartBar;
      const currPriceX = get(tpoLength, currPriceYIndex) + sessStartBar;
      redPill = { x: currPriceX, y: currPriceY, text: cfg.currPriceText, textColor: LABEL_TEXT };
      labels.add(redPill);
    }

    // barstate.islastconfirmedhistory: the last bar when it is closed and not live (on the bar before it otherwise, where
    // the label is deleted by the next bar anyway)
    if (!isInSession || (i === last && lastIsConfirmedHistory)) delLabel(redPill);

    lastTick = tick;
    lastSessStart = sessStart;
    lastInSession = isInSession;
    lastWhich = whichSess;
  }

  // Tables: the cells of the last bar
  const tables: TableData[] = [];
  if (n > 0) {
    const frame = { frameColor: BLACK, frameWidth: 2 };
    tables.push({ position: 'bottom_right', columns: 1, rows: 20, bgColor: cfg.infoTableColor, ...frame, cells: [] });
    const cells: TableCellData[] = [];
    if (cfg.showTpoInfo) {
      const currentSess = lastWhich === -4 ? 'Monthly' : lastWhich === -3 ? 'Weekly' : lastWhich === -2 ? 'Daily' : lastWhich === -1 ? '24Hr'
        : lastWhich >= 1 && lastWhich <= 4 ? sessions[lastWhich - 1].name : lastWhich === 5 ? '1 Hour' : lastWhich === 6 ? '1 Minute' : 'n/a';
      const currentBar = lastInSession ? get(tpoNames, lastSessStart) : 'n/a';
      const texts = [
        `Ticks: ${str.tostring(lastTick / mintick)}`,
        `Tick Size: $${str.tostring(lastTick)}`,
        `Total TPOs: ${str.tostring(totalTpoCount)}`,
        `Current Bar: ${currentBar}`,
        `Current Session: ${currentSess}`,
      ];
      texts.forEach((text, row) => cells.push({
        column: 0, row, text, textColor: row === 2 && totalTpoCount > 495 ? RED : cfg.infoTableTextColor, textSize: cfg.infoTableTxtSize,
      }));
    }
    tables.push({ position: 'top_right', columns: 1, rows: 5, bgColor: cfg.infoTableColor, ...frame, cells });
    const warning: TableCellData[] = totalTpoCount > 495 && cfg.showWarning
      ? [{ column: 0, row: 0, text: 'Please Increase Tick Size\nuntil under 500 Total TPOs', textColor: WHITE, textSize: 'large' }]
      : [];
    tables.push({ position: 'middle_right', columns: 1, rows: 1, bgColor: RED, ...frame, cells: warning });
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: [...lines].map((l) => ({ time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color })),
    boxes: [...boxes].map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg, borderColor: 'transparent',
    })),
    labels: [...labels].map((l) => ({
      time: T(l.x), price: l.y, text: l.text, textColor: l.textColor, style: 'none' as const, textAlign: 'left' as const, size: cfg.tpoTxtSize,
    })),
    tables,
  };
}

export const MarketProfileWithTpo = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
