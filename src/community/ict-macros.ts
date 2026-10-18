/**
 * ICT Macros [LuxAlgo]
 *
 * Marks the ICT "macro" time windows on 1-minute charts: two London windows (02:33 - 03:00 and 04:03 - 04:30 New
 * York time) and six New York windows (08:50, 09:50, 10:50, 11:50, 13:10 and 15:15). Each window is drawn with a
 * top, a bottom and a mid line that follow the highs and lows of its bars, dotted extensions that grow until the
 * next window starts, a filled area and a label. One bar after the window ends, the window is classified from the
 * last swing levels (pivots of the candle bodies or wicks) and its open and close: "Expansion", "Manipulation" or
 * "Accumulation"; the area takes the colour of the class and the label its name, with the window prices as tooltip.
 * A vertical line can announce the next window some minutes in advance. The two time zones are fixed offsets
 * (UTC-5 and UTC+0), each with a daylight saving switch.
 *
 * Chart values (third argument): the chart timeframe (without it: from the bar spacing), the chart foreground and
 * background colours (lines, label text, hidden lines; without them #DBDBDB and #0F0F0F) and the symbol tick for
 * the prices of the tooltip (without it 0.01).
 *
 * Port notes:
 * - The original reads the 1-minute bars inside each chart bar (the first minute of a window, its last minute and
 *   the swing levels). On a 1-minute chart these are the chart bars themselves: the port is complete there. On the
 *   other charts where the original draws windows (3 and 5 minutes) the 1-minute prices are not in the chart bars:
 *   the port throws an Error. Above 5 minutes the original only shows a note in a table, as the port does.
 * - Drawing limits as in the original: 500 lines and 100 labels. A filled area whose lines were deleted by the
 *   limit is not drawn and is left out.
 * - Alerts (alert() calls, `alertCalls` of the result, once per bar): on the bar `mcAlertM` minutes before each
 *   enabled window, "<window> macro will be in play in <minutes> minutes for instrument <ticker>" (ticker from the
 *   chart context), whether or not the vertical line is drawn.
 *
 * Reference: "ICT Macros [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, str, color, timeframe, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData, LabelData, LinefillData, TableData, AlertCall } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import { foregroundColorOf, backgroundColorOf, mintickOf, tickerOf, type ChartContext } from '../chart-context';

/** The eight windows: input prefix, start hour and minute in the time zone of the window, label text, group */
const MACROS = [
  { key: 'm02', hour: 7, minute: 33, text: '02:33 AM - 03:00', london: true, title: '02:33 AM 03:00', group: 'London 02:33 AM 03:00 Macro', on: false },
  { key: 'm04', hour: 9, minute: 3, text: '04:03 AM - 04:30', london: true, title: '04:03 AM 04:30', group: 'London 04:03 AM 04:30 Macro', on: false },
  { key: 'm08', hour: 8, minute: 50, text: '08:50 AM - 09:10', london: false, title: '08:50 AM 09:10', group: 'New York 08:50 AM 09:10 Macro', on: false },
  { key: 'm09', hour: 9, minute: 50, text: '09:50 AM - 10:10', london: false, title: '09:50 AM 10:10', group: 'New York 09:50 AM 10:10 Macro', on: true },
  { key: 'm10', hour: 10, minute: 50, text: '10:50 AM - 11:10', london: false, title: '10:50 AM 11:10', group: 'New York 10:50 AM 11:10 Macro', on: true },
  { key: 'm11', hour: 11, minute: 50, text: '11:50 AM - 12:10', london: false, title: '11:50 AM 12:10', group: 'New York 11:50 AM 12:10 Launch Macro', on: false },
  { key: 'm13', hour: 13, minute: 10, text: '01:10 PM - 01:40', london: false, title: '13:10 PM 13:40', group: 'New York 13:10 PM 13:40 Macro', on: true },
  { key: 'm15', hour: 15, minute: 15, text: '03:15 PM - 03:45', london: false, title: '15:15 PM 15:45', group: 'New York 15:15 PM 15:45 Macro', on: true },
] as const;
type MacroKey = typeof MACROS[number]['key'];
type MacroInputs = { [K in MacroKey | `${MacroKey}Top` | `${MacroKey}Mid` | `${MacroKey}Bot` | `${MacroKey}Ext`]: boolean };

export interface IctMacrosInputs extends MacroInputs {
  /** London daylight saving time: UTC+1 instead of UTC+0 */
  lnSummerTime: boolean;
  /** New York daylight saving time: UTC-4 instead of UTC-5 */
  nySummerTime: boolean;
  /** Pivot length of the swing levels (on 1-minute bars) */
  pLen: number;
  /** Swing levels from the candle wicks or bodies */
  pLoc: 'Wick' | 'Body';
  aColor: string;
  mColor: string;
  eColor: string;
  mcText: 'Tiny' | 'Small' | 'Normal' | 'None';
  /** Draw a vertical line at the next window, `mcAlertM` minutes before it */
  mcAlert: boolean;
  mcAlertM: number;
}

const macroDefaults = Object.fromEntries(MACROS.flatMap((m) => [
  [m.key, m.on], [`${m.key}Top`, true], [`${m.key}Mid`, true], [`${m.key}Bot`, true], [`${m.key}Ext`, true],
])) as MacroInputs;

export const defaultInputs: IctMacrosInputs = {
  lnSummerTime: true,
  nySummerTime: true,
  ...macroDefaults,
  pLen: 13,
  pLoc: 'Body',
  aColor: '#787B86',
  mColor: '#FF5252',
  eColor: '#2962FF',
  mcText: 'Small',
  mcAlert: true,
  mcAlertM: 30,
};

const macroConfig = (m: typeof MACROS[number]): InputConfig[] => [
  { id: m.key, type: 'bool', title: m.title, defval: m.on, group: m.group },
  { id: `${m.key}Top`, type: 'bool', title: 'Top Line', defval: true, group: m.group },
  { id: `${m.key}Mid`, type: 'bool', title: 'Mid Line', defval: true, group: m.group },
  { id: `${m.key}Bot`, type: 'bool', title: 'Bottom Line', defval: true, group: m.group },
  { id: `${m.key}Ext`, type: 'bool', title: 'Extending Lines', defval: true, group: m.group },
];

export const inputConfig: InputConfig[] = [
  { id: 'lnSummerTime', type: 'bool', title: 'London Daylight Saving Time (DST)', defval: true, group: 'London Time Settings' },
  ...MACROS.slice(0, 2).flatMap(macroConfig),
  { id: 'nySummerTime', type: 'bool', title: 'New York Daylight Saving Time (DST)', defval: true, group: 'New York Time Settings' },
  ...MACROS.slice(2).flatMap(macroConfig),
  { id: 'pLen', type: 'int', title: 'Length', defval: 13, min: 5, max: 20, group: 'Macro Classification' },
  { id: 'pLoc', type: 'string', title: 'Swing Area', defval: 'Body', options: ['Wick', 'Body'], group: 'Macro Classification' },
  { id: 'aColor', type: 'color', title: 'Accumulation', defval: '#787B86', group: 'Macro Classification' },
  { id: 'mColor', type: 'color', title: 'Manipulation', defval: '#FF5252', group: 'Macro Classification' },
  { id: 'eColor', type: 'color', title: 'Expansion', defval: '#2962FF', group: 'Macro Classification' },
  { id: 'mcText', type: 'string', title: 'Macro Texts', defval: 'Small', options: ['Tiny', 'Small', 'Normal', 'None'] },
  { id: 'mcAlert', type: 'bool', title: 'Alert Macro Times in Advance (Minutes)', defval: true },
  { id: 'mcAlertM', type: 'int', title: '', defval: 30, min: 5, max: 60, step: 5 },
];

export const plotConfig: PlotConfig[] = [];

/** The original makes alert() calls */
export const hasAlertFunction = true;

export const metadata = {
  title: 'ICT Macros [LuxAlgo]',
  shortTitle: 'ICT Macros [LuxAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** math.max / math.min: na when a value is na */
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));
/** A float read as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

const MAX_LINES = 500; // indicator(max_lines_count = 500)
const MAX_LABELS = 100; // indicator(max_labels_count = 100)

/** A line of the script: x in bar indexes, or in ms for the line that announces a window (`byTime`) */
interface Ln {
  x1: number; y1: number; x2: number; y2: number; color: string;
  style: 'solid' | 'dotted'; width: number; byTime?: boolean; dead: boolean;
}
interface Lb { x: number; y: number; text: string; tooltip: string; dead: boolean }
interface Lf { line1: Ln; line2: Ln; color: string }

/** Live drawings of one kind: above max + 5 objects the oldest are deleted until max remain */
class Live<T extends { dead: boolean }> {
  readonly list: T[] = [];

  constructor(private readonly limit: number) {}

  add(o: T): T {
    this.list.push(o);
    if (this.list.length > this.limit + 5) for (const old of this.list.splice(0, this.list.length - this.limit)) old.dead = true;
    return o;
  }

  delete(o: T | null): void {
    if (!o || o.dead) return;
    o.dead = true;
    const k = this.list.indexOf(o);
    if (k >= 0) this.list.splice(k, 1);
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<IctMacrosInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
  lines: LineDrawingData[]; labels: LabelData[]; linefills: LinefillData[]; tables: TableData[]; alertCalls: AlertCall[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const CHART_FG = foregroundColorOf(chart); // chart.fg_color
  const CHART_BG = backgroundColorOf(chart); // chart.bg_color
  const mintick = mintickOf(chart);
  const alertCalls: AlertCall[] = [];
  const result = (
    lines: LineDrawingData[], labels: LabelData[], linefills: LinefillData[], tables: TableData[],
  ) => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines,
    labels,
    linefills,
    tables,
    alertCalls,
  });

  // tf_m = timeframe.multiplier
  const tf = chartTimeframe(bars, chart);
  const info = tf === '' ? null : timeframe.info(tf);
  const tfM = info ? info.multiplier : 1;
  if (tfM > 5) {
    // var table note = table.new(position.bottom_right, 1, 1), filled on the last bar
    const cells = n === 0 ? [] : [{
      column: 0, row: 0, text: 'ICT Macros are supported on:\n 1 min, 3 mins and 5 mins charts\n\n',
      textSize: 'small' as const, textColor: CHART_FG,
    }];
    return result([], [], [], n === 0 ? [] : [{ position: 'bottom_right', columns: 1, rows: 1, cells }]);
  }
  // request.security_lower_tf(syminfo.tickerid, '1', ...): the 1-minute bars of a chart bar
  const oneMinute = info !== null && info.isminutes && tfM === 1;
  const needsLower = 'ICT Macros: this chart needs the 1-minute bars inside each chart bar (first and last minute of a '
    + 'macro, swing levels), which the chart bars do not have. Use a 1-minute chart.';
  if (info !== null && info.isintraday && !oneMinute) throw new Error(needsLower);

  const tMs = (i: number) => (bars[i].time as number) * 1000;
  const mcSize = cfg.mcText === 'Small' ? 'small' : cfg.mcText === 'Normal' ? 'normal' : 'tiny';

  // f_getPivotPoint(pLen, pLoc) on the 1-minute bars: pivots of the wicks, or the candle body at the pivot bar
  const len = cfg.pLen;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const pivotHigh = oneMinute ? A(ta.pivothigh(new Series(bars, (b) => b.high), len, len)) : [];
  const pivotLow = oneMinute ? A(ta.pivotlow(new Series(bars, (b) => b.low), len, len)) : [];
  const pivots = (i: number): { ph: number; pl: number; pht: number; plt: number } => {
    if (!oneMinute) return { ph: NaN, pl: NaN, pht: NaN, plt: NaN };
    let ph = pivotHigh[i];
    if (truthy(ph) && cfg.pLoc === 'Body') ph = Math.max(bars[i - len].open, bars[i - len].close);
    let pl = pivotLow[i];
    if (truthy(pl) && cfg.pLoc === 'Body') pl = Math.min(bars[i - len].open, bars[i - len].close);
    return { ph, pl, pht: truthy(ph) ? tMs(i - len) : NaN, plt: truthy(pl) ? tMs(i - len) : NaN };
  };

  const lines = new Live<Ln>(MAX_LINES);
  const labels = new Live<Lb>(MAX_LABELS);
  const linefills: Lf[] = [];
  // line getters and setters: na / nothing on a deleted line
  const y1 = (l: Ln | null) => (l && !l.dead ? l.y1 : NaN);
  const setY = (l: Ln | null, y: number) => {
    if (l && !l.dead) { l.y1 = y; l.y2 = y; }
  };
  const setX2 = (l: Ln | null, x: number) => {
    if (l && !l.dead) l.x2 = x;
  };

  // var macro mc = macro.new(); var pivotPoint p = pivotPoint.new()
  const mc = {
    t: NaN, x2: NaN, len: NaN, o: NaN, top: NaN, bottom: NaN, mid: NaN, co: NaN, ch: NaN, cl: NaN, cc: NaN,
    lnh: null as Ln | null, lnhe: null as Ln | null, lnl: null as Ln | null, lnle: null as Ln | null,
    lnm: null as Ln | null, lnme: null as Ln | null, lnf: null as Ln | null, lf: null as Lf | null, lb: null as Lb | null,
  };
  const p = { ht: NaN, lt: NaN, h: NaN, h1: NaN, l: NaN, l1: NaN };
  // `mc.t == mc.t[1]` of each call of processMacro: the value of mc.t at that place on the bar before (na when the
  // place did not run on that bar)
  const seen = MACROS.map(() => ({ bar: -2, t: NaN }));
  const avg = (a: number, b: number) => (a + b) / 2;
  const price = (v: number) => str.tostring(v, 'mintick', mintick);

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const time = tMs(i);
    const { ph, pl, pht, plt } = pivots(i);
    // if not na(array.min(a_pL)) ... / if not na(array.max(a_pH)) ...
    if (!isNaN(pl)) { p.l = pl; p.lt = plt; }
    if (!isNaN(ph)) { p.h = ph; p.ht = pht; }

    MACROS.forEach((m, k) => {
      if (!cfg[m.key]) return;
      const top = cfg[`${m.key}Top`];
      const bot = cfg[`${m.key}Bot`];
      const mid = cfg[`${m.key}Mid`];
      const ext = cfg[`${m.key}Ext`];
      // f_getBarTime: hour and minute of the bar in the fixed time zone of the window, `ahead` minutes later
      const offset = (m.london ? 0 : -5) + ((m.london ? cfg.lnSummerTime : cfg.nySummerTime) ? 1 : 0);
      const clock = (ahead: number) => {
        const local = offset * 3600000 + ahead * 60000 + time;
        return { h: Math.floor(local / 3600000) % 24, min: Math.floor(local / 60000) % 60 };
      };

      const soon = clock(cfg.mcAlertM);
      if (soon.h === m.hour && soon.min === m.minute) {
        // alert(_mt + ' macro will be in play in ' + str.tostring(_alertM) + ' minutes for instrument ' + syminfo.ticker)
        alertCalls.push({
          time: bar.time as number,
          message: `${m.text} macro will be in play in ${cfg.mcAlertM} minutes for instrument ${tickerOf(chart)}`,
          freq: 'once_per_bar',
        });
        if (cfg.mcAlert) {
          const at = time + cfg.mcAlertM * 60000;
          mc.lnf = lines.add({ x1: at, y1: bar.high, x2: at, y2: bar.low, color: CHART_FG, style: 'solid', width: 1, byTime: true, dead: false });
        }
      }

      const { h, min: minute } = clock(0);
      if (h === 8 || h === 9 || h === 10 || h === 11) mc.len = minute === 3 ? 27 : 20;
      else if (h === 7) mc.len = 27;
      else mc.len = 30;

      if (h === m.hour && minute === m.minute) {
        // the first 1-minute bar of the window and its swing levels come from the 1-minute bars
        if (!oneMinute) throw new Error(needsLower);
        lines.delete(mc.lnf);
        mc.t = time;
        mc.o = bar.open;
        mc.top = bar.high;
        mc.bottom = bar.low;
        mc.x2 = i + Math.round(mc.len / tfM);
        const shown = (on: boolean) => (on ? CHART_FG : CHART_BG);
        const line = (x1: number, y: number, on: boolean, style: 'solid' | 'dotted', width: number) => (
          lines.add({ x1, y1: y, x2: mc.x2, y2: y, color: shown(on), style, width, dead: false })
        );
        mc.lnh = line(i, mc.top, top, 'solid', 2);
        mc.lnhe = line(mc.x2, mc.top, ext && top, 'dotted', 2);
        mc.lnl = line(i, mc.bottom, bot, 'solid', 2);
        mc.lnle = line(mc.x2, mc.bottom, ext && bot, 'dotted', 2);
        mc.lnm = line(i, avg(mc.top, mc.bottom), mid, 'dotted', 1);
        mc.lnme = line(i, avg(mc.top, mc.bottom), ext && mid, 'dotted', 1);
        mc.lf = { line1: mc.lnh, line2: mc.lnl, color: String(color.new(color.gray, 100)) };
        linefills.push(mc.lf);
        mc.lb = labels.add({
          x: i + Math.trunc(mc.len / tfM / 2), y: mc.top, text: cfg.mcText !== 'None' ? `MACRO\n${m.text}` : '', tooltip: '', dead: false,
        });
        p.l1 = p.l;
        p.h1 = p.h;
      } else if (i < Math.trunc(mc.x2) && time >= mc.t) {
        mc.top = max(bar.high, y1(mc.lnh));
        setY(mc.lnh, mc.top);
        setY(mc.lnhe, mc.top);
        mc.bottom = min(bar.low, y1(mc.lnl));
        setY(mc.lnl, mc.bottom);
        setY(mc.lnle, mc.bottom);
        mc.mid = avg(max(bar.high, y1(mc.lnh)), min(bar.low, y1(mc.lnl)));
        setY(mc.lnm, mc.mid);
        setY(mc.lnme, mc.mid);
        if (mc.lb && !mc.lb.dead) mc.lb.y = max(bar.high, mc.lb.y);
        if (!isNaN(pl) && p.lt < mc.t) p.l1 = pl;
        if (!isNaN(ph) && p.ht < mc.t) p.h1 = ph;
      } else if (i === Math.trunc(mc.x2)) {
        // the last 1-minute bar of the window
        mc.co = bar.open;
        mc.ch = bar.high;
        mc.cl = bar.low;
        mc.cc = bar.close;
        mc.top = max(mc.ch, y1(mc.lnh));
        setY(mc.lnh, mc.top);
        setY(mc.lnhe, mc.top);
        mc.bottom = min(mc.cl, y1(mc.lnl));
        setY(mc.lnl, mc.bottom);
        setY(mc.lnle, mc.bottom);
        mc.mid = avg(max(mc.top, y1(mc.lnh)), min(mc.bottom, y1(mc.lnl)));
        setY(mc.lnm, mc.mid);
        setY(mc.lnme, mc.mid);
        if (mc.lb && !mc.lb.dead) mc.lb.y = max(mc.top, mc.lb.y);
        if (!isNaN(pl) && p.lt < mc.t) p.l1 = pl;
        if (!isNaN(ph) && p.ht < mc.t) p.h1 = ph;
      } else {
        // else if mc.t == mc.t[1]: the extensions follow the last bar
        const before = seen[k].bar === i - 1 ? seen[k].t : NaN;
        seen[k] = { bar: i, t: mc.t };
        if (eq(mc.t, before)) {
          setX2(mc.lnhe, i);
          setX2(mc.lnle, i);
          setX2(mc.lnme, i);
        }
      }

      // One bar after the window: its class ('on MACRO' is the end of the three class names before 'MACRO')
      const lb = mc.lb && !mc.lb.dead ? mc.lb : null;
      if (i === Math.trunc(mc.x2) + 1 && !(lb ? lb.text : '').includes('on MACRO')) {
        if (lb) {
          lb.tooltip = `mc open       : ${price(mc.o)}\nmc close      : ${price(mc.cc)}\nmc top         : ${price(mc.top)}`
            + `\nmc mid        : ${price(mc.mid)}\nmc bottom   : ${price(mc.bottom)}`;
        }
        const lowQuarter = avg(mc.bottom, mc.mid);
        const highQuarter = avg(mc.top, mc.mid);
        const through = (lt(mc.o, lowQuarter) && gt(mc.cc, highQuarter)) || (gt(mc.o, highQuarter) && lt(mc.cc, lowQuarter));
        let kind: 'Expansion' | 'Manipulation' | 'Accumulation';
        if (lt(mc.bottom, p.l1) && gt(mc.top, p.h1)) {
          kind = through ? 'Expansion' : 'Manipulation';
        } else if (lt(mc.bottom, p.l1) || gt(mc.top, p.h1)) {
          const sides = (gt(mc.co, mc.mid) && lt(mc.cc, mc.mid)) || (lt(mc.co, mc.mid) && gt(mc.cc, mc.mid))
            || (lt(mc.o, mc.mid) && lt(mc.cc, mc.mid)) || (gt(mc.o, mc.mid) && gt(mc.cc, mc.mid));
          kind = sides ? 'Accumulation' : 'Expansion';
        } else {
          const same = eq(p.l, p.l1) && eq(p.h, p.h1) && lt(mc.o, lowQuarter) && gt(mc.cc, highQuarter);
          kind = same || (gt(mc.o, highQuarter) && lt(mc.cc, lowQuarter)) ? 'Expansion' : 'Accumulation';
        }
        const base = kind === 'Expansion' ? cfg.eColor : kind === 'Manipulation' ? cfg.mColor : cfg.aColor;
        if (mc.lf) mc.lf.color = String(color.new(base, 73));
        if (cfg.mcText !== 'None' && lb) lb.text = `${kind} ${lb.text}`;
      }
    });
  }

  // The drawings alive after the last bar
  const step = barInterval(bars);
  // A time between two bars is drawn on the next bar; a time after the last bar is kept
  const drawnTime = (tm: number): number => {
    if (n === 0 || tm > tMs(n - 1)) return tm / 1000;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (tMs(m) >= tm) hi = m;
      else lo = m + 1;
    }
    return bars[lo].time as number;
  };
  const drawn = (l: Ln): LineDrawingData => ({
    time1: l.byTime ? drawnTime(l.x1) : barTime(bars, l.x1, step), price1: l.y1,
    time2: l.byTime ? drawnTime(l.x2) : barTime(bars, l.x2, step), price2: l.y2,
    color: l.color, style: l.style, width: l.width, ...(l.byTime ? { extend: 'both' as const } : {}),
  });
  const ok = (l: Ln) => !l.dead && ![l.x1, l.x2, l.y1, l.y2].some((v) => isNaN(v));
  return result(
    lines.list.filter(ok).map(drawn),
    labels.list.filter((l) => !isNaN(l.y)).map((l): LabelData => ({
      time: barTime(bars, l.x, step), price: l.y, text: l.text, color: '#00000000', style: 'label_down', textColor: CHART_FG,
      size: mcSize, textAlign: 'left', ...(l.tooltip ? { tooltip: l.tooltip } : {}),
    })),
    linefills.filter((f) => ok(f.line1) && ok(f.line2)).map((f) => ({ line1: drawn(f.line1), line2: drawn(f.line2), color: f.color })),
    [],
  );
}

export const IctMacros = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
