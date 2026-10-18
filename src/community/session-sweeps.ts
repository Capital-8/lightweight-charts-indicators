/**
 * Session Sweeps [LuxAlgo]
 *
 * Four trading sessions (Asia, London, New York AM, New York PM) and the liquidity sweeps of their highs and lows.
 * The script only draws on intraday charts of 5 minutes or less; on other charts it shows a note.
 *
 * - Sessions: the hour of a bar is read in the fixed zone of each session (Asia UTC+9, London UTC+0, New York UTC-5;
 *   one more hour with the DST switches). During a session two lines follow its highest high and lowest low, with a
 *   fill between them and the session name below the low. When a session ends, three dotted lines (high, middle,
 *   low) continue to the right while that session is closed. The London levels also stay until the end of the New
 *   York PM session.
 * - Buyside sweep: a bar whose high goes above the high of the latest ended session while it opened below it starts
 *   a zone (a box from the level to the high, at most "Margin" x ATR(21) high). The zone grows while the price stays
 *   within the margin around the level. It turns grey ("fake sweep") when a close goes more than 1.5 margins above
 *   the level, or when the high is above the margin once the zone has not grown for "Sweep Margin Length" bars.
 *   Sellside sweeps mirror this on the session low. The London levels have their own zones during the New York
 *   sessions. As in the original, the sweep rules run once per session on every bar and share one state.
 * - Market structure shifts (optional): a close through the latest pivot high (low) after a bearish (bullish) shift
 *   draws a line from the pivot with the text "CHoCH".
 * - Fair value gaps (optional): the latest gap wider than "Width Filter" x ATR(144) is drawn as a box that follows
 *   the price until it is filled.
 * - Table: the date and time of each session zone, its status and a countdown to its open or close.
 * - Alerts (alert() calls, `alertCalls` of the result, once per bar): "<ticker> buyside / sellside session level
 *   breached, price <close>, timeframe <timeframe>" on each new sweep zone (`chart.ticker` and `chart.mintick`).
 *
 * At most 500 lines and 500 boxes are kept (the oldest are removed).
 *
 * Chart values (optional third argument of calculate): the chart timeframe (`timeframe`; without it: from the bar
 * spacing), the current time for the table (`now`; without it: the clock of the computer), the symbol type for the
 * "Hide if not Forex" switch (`symbolType`; without it the table is hidden when the switch is on) and the chart
 * foreground colour for the note (`foregroundColor`; without it: #DBDBDB, a dark chart).
 *
 * Reference: "Session Sweeps [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, str, color, time, timeframe, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { chartTimeframe } from '../anchor-period';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, mintickOf, nowOf, symbolTypeOf, tickerOf, type ChartContext } from '../chart-context';
import type { AlertCall, BoxData, LineDrawingData, LinefillData, TableCellData, TableData } from '../types';

export const hasAlertFunction = true;

export interface SessionSweepsInputs {
  swpBZ: boolean;
  swpBC: string;
  swpBM: number;
  swpSZ: boolean;
  swpSC: string;
  swpSM: number;
  swpML: number;
  swpDT: boolean;
  swpHF: boolean;
  swpFC: string;
  asSH: boolean;
  asST: string;
  asSRT: string;
  asEND: string;
  asC: string;
  asMMP: boolean;
  asSM: boolean;
  asBG: boolean;
  ldnSH: boolean;
  ldnST: string;
  ldnSRT: string;
  ldnEND: string;
  ldnC: string;
  ldnMMP: boolean;
  ldnSM: boolean;
  ldnBG: boolean;
  nyamSH: boolean;
  nyamST: string;
  nyamSRT: string;
  nyamEND: string;
  nyamC: string;
  nyamMMP: boolean;
  nyamSM: boolean;
  nyamBG: boolean;
  nypmSH: boolean;
  nypmST: string;
  nypmSRT: string;
  nypmEND: string;
  nypmC: string;
  nypmMMP: boolean;
  nypmSM: boolean;
  nypmBG: boolean;
  nyDST: boolean;
  ldnDST: boolean;
  sesDET: boolean;
  sesNM: boolean;
  sesLNW: number;
  sesFT: number;
  mssSH: boolean;
  mssLN: number;
  ppLCB: string;
  ppLCS: string;
  fvgSH: boolean;
  fvgTH: number;
  fvgBC: string;
  fvgSC: string;
  sesTSH: boolean;
  hIfN: boolean;
  sesTS: 'Tiny' | 'Small' | 'Normal';
  sesPOS: 'Top Left' | 'Top Center' | 'Top Right' | 'Middle Right' | 'Bottom Left' | 'Bottom Center';
}

export const defaultInputs: SessionSweepsInputs = {
  swpBZ: true,
  swpBC: 'rgba(255, 152, 0, 0.63)',
  swpBM: 1.3,
  swpSZ: true,
  swpSC: 'rgba(41, 98, 255, 0.63)',
  swpSM: 1.3,
  swpML: 5,
  swpDT: false,
  swpHF: false,
  swpFC: 'rgba(120, 123, 134, 0.27)',
  asSH: true,
  asST: 'Asia',
  asSRT: '09:00',
  asEND: '18:00',
  asC: '#FFEB3B',
  asMMP: true,
  asSM: false,
  asBG: true,
  ldnSH: true,
  ldnST: 'London',
  ldnSRT: '08:00',
  ldnEND: '17:00',
  ldnC: '#2962FF',
  ldnMMP: true,
  ldnSM: false,
  ldnBG: true,
  nyamSH: true,
  nyamST: 'NY AM',
  nyamSRT: '08:00',
  nyamEND: '13:00',
  nyamC: '#FF9800',
  nyamMMP: true,
  nyamSM: false,
  nyamBG: true,
  nypmSH: true,
  nypmST: 'NY PM',
  nypmSRT: '13:00',
  nypmEND: '19:00',
  nypmC: '#FF5252',
  nypmMMP: true,
  nypmSM: false,
  nypmBG: true,
  nyDST: false,
  ldnDST: false,
  sesDET: true,
  sesNM: true,
  sesLNW: 1,
  sesFT: 95,
  mssSH: false,
  mssLN: 8,
  ppLCB: '#00897B',
  ppLCS: '#FF5252',
  fvgSH: false,
  fvgTH: 1,
  fvgBC: 'rgba(0, 137, 123, 0.2)',
  fvgSC: 'rgba(255, 82, 82, 0.2)',
  sesTSH: true,
  hIfN: false,
  sesTS: 'Small',
  sesPOS: 'Top Right',
};

const SWP = 'Session Sweeps';
const SES = 'Sessions';
const MSS = 'Market Structure Shifts';
const FVGS = 'Fair Value Gaps';
const TAB = 'Sessions Tabular View';
const HOURS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

/** The 8 inputs of one session */
const sessionInputs = (
  p: 'as' | 'ldn' | 'nyam' | 'nypm', line: string, name: string, start: string, end: string, css: string,
): InputConfig[] => [
  { id: `${p}SH`, type: 'bool', title: '', defval: true, inline: line, group: SES },
  { id: `${p}ST`, type: 'string', title: '', defval: name, inline: line, group: SES },
  { id: `${p}SRT`, type: 'string', title: '', defval: start, options: HOURS, inline: line, group: SES },
  { id: `${p}END`, type: 'string', title: '-', defval: end, options: HOURS, inline: line, group: SES },
  { id: `${p}C`, type: 'color', title: '  ', defval: css, inline: `${line}1`, group: SES },
  { id: `${p}MMP`, type: 'bool', title: 'Extend : Max/Min | Mid', defval: true, inline: `${line}1`, group: SES },
  { id: `${p}SM`, type: 'bool', title: '', defval: false, inline: `${line}1`, group: SES },
  { id: `${p}BG`, type: 'bool', title: 'Fill', defval: true, inline: `${line}1`, group: SES },
];

export const inputConfig: InputConfig[] = [
  { id: 'swpBZ', type: 'bool', title: 'Buyside Sweep Zones', defval: true, inline: 'SWPB', group: SWP },
  { id: 'swpBC', type: 'color', title: '', defval: 'rgba(255, 152, 0, 0.63)', inline: 'SWPB', group: SWP },
  { id: 'swpBM', type: 'float', title: 'Margin', defval: 1.3, min: 0.5, max: 10, step: 0.1, inline: 'SWPB', group: SWP },
  { id: 'swpSZ', type: 'bool', title: 'Sellside Sweep Zones', defval: true, inline: 'SWPS', group: SWP },
  { id: 'swpSC', type: 'color', title: '', defval: 'rgba(41, 98, 255, 0.63)', inline: 'SWPS', group: SWP },
  { id: 'swpSM', type: 'float', title: 'Margin', defval: 1.3, min: 0.5, max: 10, step: 0.1, inline: 'SWPS', group: SWP },
  { id: 'swpML', type: 'int', title: '  Sweep Margin Length', defval: 5, min: 2, max: 10, group: SWP },
  { id: 'swpDT', type: 'bool', title: 'Detect Sweeps Once per Session', defval: false, group: SWP },
  { id: 'swpHF', type: 'bool', title: 'Hide Fake Sweep Zones', defval: false, inline: 'SWPF', group: SWP },
  { id: 'swpFC', type: 'color', title: '', defval: 'rgba(120, 123, 134, 0.27)', inline: 'SWPF', group: SWP },
  ...sessionInputs('as', 'AS', 'Asia', '09:00', '18:00', '#FFEB3B'),
  ...sessionInputs('ldn', 'LDN', 'London', '08:00', '17:00', '#2962FF'),
  ...sessionInputs('nyam', 'NYA', 'NY AM', '08:00', '13:00', '#FF9800'),
  ...sessionInputs('nypm', 'NYP', 'NY PM', '13:00', '19:00', '#FF5252'),
  {
    id: 'nyDST', type: 'bool', title: 'New York DST | London DST', defval: false, inline: 'DST', group: SES,
    tooltip: 'New York - Daylight Saving Time (DST)\n *DST Start : Second Sunday in March at 2:00\n *DST End : First Sunday in November at 2:00\n\nLondon - Daylight saving time (DST)\n *DST Start : Last Sunday in March at 1:00\n *DST End : Last Sunday in October at 1:00',
  },
  { id: 'ldnDST', type: 'bool', title: '', defval: false, inline: 'DST', group: SES },
  { id: 'sesDET', type: 'bool', title: 'Sessions Extreme Lines | Sessions Names', defval: true, inline: 'NAM', group: SES },
  { id: 'sesNM', type: 'bool', title: '', defval: true, inline: 'NAM', group: SES },
  { id: 'sesLNW', type: 'int', title: '  Session Lines Width', defval: 1, group: SES },
  { id: 'sesFT', type: 'int', title: '  Session Fill Transparency', defval: 95, min: 0, max: 100, group: SES },
  { id: 'mssSH', type: 'bool', title: 'Market Structure Shifts', defval: false, group: MSS },
  { id: 'mssLN', type: 'int', title: 'Detection Length', defval: 8, min: 1, group: MSS },
  { id: 'ppLCB', type: 'color', title: 'Market Structure Shifts : Bullish', defval: '#00897B', inline: 'MSS', group: MSS },
  { id: 'ppLCS', type: 'color', title: 'Bearish', defval: '#FF5252', inline: 'MSS', group: MSS },
  { id: 'fvgSH', type: 'bool', title: 'Fair Value Gaps', defval: false, group: FVGS },
  {
    id: 'fvgTH', type: 'float', title: 'Fair Value Gap Width Filter', defval: 1, min: 0, step: 0.1, group: FVGS,
    tooltip: "The script displays the fair value gaps whose width is larger than a fixed-length atr (average true range) value multiplied by the value of the option.\n\nThe option value set to 0 means no filtering is applied.\n\nRemark: no filtering will be applied for the first 144 (atr fixed-length) candles since the atr value won't be present",
  },
  { id: 'fvgBC', type: 'color', title: 'Bullish Imbalance', defval: 'rgba(0, 137, 123, 0.2)', inline: 'FVG', group: FVGS },
  { id: 'fvgSC', type: 'color', title: 'Bearish Imbalance', defval: 'rgba(255, 82, 82, 0.2)', inline: 'FVG', group: FVGS },
  {
    id: 'sesTSH', type: 'bool', title: 'Sessions Tabular View', defval: true, group: TAB,
    tooltip: 'Displays sessions tabular view\n - Date and Time,\n - Sessions Opening/Closing Countdown Timer and\n - Session Status',
  },
  { id: 'hIfN', type: 'bool', title: 'Hide if not Forex Market Instrument', defval: false, group: TAB },
  { id: 'sesTS', type: 'string', title: '  Table Text Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], inline: 'STAT', group: TAB },
  {
    id: 'sesPOS', type: 'string', title: '', defval: 'Top Right',
    options: ['Top Left', 'Top Center', 'Top Right', 'Middle Right', 'Bottom Left', 'Bottom Center'], inline: 'STAT', group: TAB,
  },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Session Sweeps [LuxAlgo]',
  shortTitle: 'LuxAlgo - Session Sweeps',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_lines_count = 500) */
const MAX_COUNT = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; style: 'solid' | 'dotted'; width: number; dead: boolean }
interface Bx {
  left: number; top: number; right: number; bottom: number; bg: string; dead: boolean;
  text?: string; textColor?: string; textVAlign?: 'top' | 'bottom';
}

/** Live drawings of one kind: above max + 5 objects the oldest are deleted until max remain */
class Live<T extends { dead: boolean }> {
  list: T[] = [];
  add(o: T): T {
    this.list.push(o);
    if (this.list.length > MAX_COUNT + 5) for (const old of this.list.splice(0, this.list.length - MAX_COUNT)) old.dead = true;
    return o;
  }
}

// Getters return na for a missing or deleted object; setters do nothing
const alive = <T extends { dead: boolean }>(o: T | null): o is T => o !== null && !o.dead;
const y1 = (l: Ln | null) => (alive(l) ? l.y1 : NaN);
const y2 = (l: Ln | null) => (alive(l) ? l.y2 : NaN);
const setX2 = (l: Ln | null, x: number) => { if (alive(l)) l.x2 = x; };
const top = (b: Bx | null) => (alive(b) ? b.top : NaN);
const bottom = (b: Bx | null) => (alive(b) ? b.bottom : NaN);
const right = (b: Bx | null) => (alive(b) ? b.right : NaN);

/** The variables that one call of f_pSWP() keeps from bar to bar */
interface Site { lnSHc: Ln | null; lnSLc: Ln | null; bxSTc: Bx | null; llnSHc: Ln | null; llnSLc: Ln | null; llnSMc: Ln | null; prev: boolean | null }
const newSite = (): Site => ({ lnSHc: null, lnSLc: null, bxSTc: null, llnSHc: null, llnSLc: null, llnSMc: null, prev: null });

const two = (v: number) => (v < 10 ? `0${str.tostring(v)}` : str.tostring(v));

export function calculate(
  bars: Bar[],
  inputs: Partial<SessionSweepsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines' | 'linefills' | 'tables'> & {
  lines: LineDrawingData[]; boxes: BoxData[]; linefills: LinefillData[]; tables: TableData[]; alertCalls: AlertCall[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const ms = n > 0 && bars[0].time >= 1e12;
  const { swpBM, swpSM, swpML, swpDT, sesLNW, sesFT, asST, ldnST, nyamST, nypmST } = cfg;
  const fakeCss = cfg.swpHF ? 'transparent' : cfg.swpFC;
  const mssLN = Math.trunc(cfg.mssLN);

  const swpATR = A(ta.atr(bars, 21));
  const fvgATR = A(ta.atr(bars, 144)).map((v) => (isNaN(v) ? 0 : v) * cfg.fvgTH);
  const ppH = cfg.mssSH ? A(ta.pivothigh(new Series(bars, (b) => b.high), mssLN, mssLN)) : [];
  const ppL = cfg.mssSH ? A(ta.pivotlow(new Series(bars, (b) => b.low), mssLN, mssLN)) : [];

  const lines = new Live<Ln>();
  const boxes = new Live<Bx>();
  const fills: Array<{ a: Ln; b: Ln; color: string }> = [];

  // session S: names, opening / closing hours and UTC offsets, the lines of the latest ended session, the sweep state
  const S = {
    s: ['Asia', 'London', 'NY AM', 'NY PM'],
    oH: [9, 5, 8, 13],
    cH: [14, 13, 13, 19],
    tO: [9, 0, -5, -5],
    lnSHp: null as Ln | null, lnSMp: null as Ln | null, lnSLp: null as Ln | null,
    fSHp: NaN, fSLp: NaN,
    bzBX: null as Bx | null, szBX: null as Bx | null, bzB: false, bsB: false, szB: false, ssB: false,
    lbzBX: null as Bx | null, lszBX: null as Bx | null, lbzB: false, lbsB: false, lszB: false, lssB: false,
  };
  const hourOf = (text: string) => Number(text.substring(0, text.indexOf(':')));
  /** The inputs written into S on every bar, in the order of the script */
  const setSessions = () => {
    S.s[0] = asST;
    S.oH[S.s.indexOf(asST)] = hourOf(cfg.asSRT);
    S.cH[S.s.indexOf(asST)] = hourOf(cfg.asEND);
    S.s[1] = ldnST;
    S.oH[S.s.indexOf(ldnST)] = hourOf(cfg.ldnSRT);
    S.cH[S.s.indexOf(ldnST)] = hourOf(cfg.ldnEND);
    S.s[2] = nyamST;
    S.oH[S.s.indexOf(nyamST)] = hourOf(cfg.nyamSRT);
    S.cH[S.s.indexOf(nyamST)] = hourOf(cfg.nyamEND);
    S.s[3] = nypmST;
    S.oH[S.s.indexOf(nypmST)] = hourOf(cfg.nypmSRT);
    S.cH[S.s.indexOf(nypmST)] = hourOf(cfg.nypmEND);
  };

  // alert(syminfo.ticker + ' buyside / sellside session level breached, price ' + str.tostring(close, format.mintick)
  //   + ', timeframe ' + timeframe.period, alert.freq_once_per_bar)
  const alertCalls: AlertCall[] = [];
  const TICKER = tickerOf(chart);
  const MINTICK = mintickOf(chart);
  const PERIOD = chartTimeframe(bars, chart);
  const breached = (i: number, side: 'buyside' | 'sellside') => alertCalls.push({
    time: bars[i].time,
    message: TICKER + ' ' + side + ' session level breached, price ' + str.tostring(bars[i].close, 'mintick', MINTICK)
      + ', timeframe ' + PERIOD,
    freq: 'once_per_bar',
  });

  // f_pSWP(): one session (its lines) and the sweep rules, which share S
  const pSWP = (i: number, site: Site, show: boolean, cSes: string, dst: boolean, cC: string, mm: boolean, bg: boolean, sM: boolean) => {
    const b = bars[i];
    const atr = swpATR[i];
    const isLondon = cSes === ldnST && cfg.nyamSH;

    if (show) {
      // f_gSesI()
      const k = S.s.indexOf(cSes);
      const utcTime = (S.tO[k] + (dst ? 1 : 0)) * 3600000 + (ms ? b.time : b.time * 1000);
      const h = Math.floor(utcTime / 3600000) % 24;
      const cSES = h >= S.oH[k] && h < S.cH[k];
      // cSES != cSES[1] is false on the first bar (no value before)
      const changed = site.prev !== null && cSES !== site.prev;

      if (cSES && changed) {
        const css = String(color.new(cC, cfg.sesDET ? 0 : sesFT));
        site.lnSHc = lines.add({ x1: i, y1: b.high, x2: i, y2: b.high, color: css, style: 'solid', width: sesLNW, dead: false });
        site.lnSLc = lines.add({ x1: i, y1: b.low, x2: i, y2: b.low, color: css, style: 'solid', width: sesLNW, dead: false });
        if (bg) fills.push({ a: site.lnSHc, b: site.lnSLc, color: String(color.new(cC, sesFT)) });
        if (cfg.sesNM) {
          site.bxSTc = boxes.add({
            left: i, top: b.low, right: i, bottom: b.low, bg: 'transparent', dead: false,
            text: cSes, textColor: String(color.new(cC, 25)), textVAlign: 'top',
          });
        }
      }

      if (cSES) {
        if (alive(site.lnSHc)) {
          site.lnSHc.y1 = Math.max(b.high, site.lnSHc.y1);
          site.lnSHc.y2 = Math.max(b.high, site.lnSHc.y2);
          site.lnSHc.x2 = i;
        }
        if (alive(site.lnSLc)) {
          site.lnSLc.y1 = Math.min(b.low, site.lnSLc.y1);
          site.lnSLc.y2 = Math.min(b.low, site.lnSLc.y2);
          site.lnSLc.x2 = i;
        }
        if (cfg.sesNM && alive(site.bxSTc)) {
          site.bxSTc.bottom = Math.min(b.low, y1(site.lnSLc));
          site.bxSTc.top = Math.min(b.low, y1(site.lnSLc));
        }
      }

      if (!cSES && changed) {
        const hi1 = y1(site.lnSHc);
        const hi2 = y2(site.lnSHc);
        const lo1 = y1(site.lnSLc);
        const lo2 = y2(site.lnSLc);
        const edge = mm ? cC : 'transparent';
        const mid = sM ? cC : 'transparent';
        S.lnSHp = lines.add({ x1: i - 1, y1: hi1, x2: i, y2: hi2, color: edge, style: 'dotted', width: sesLNW, dead: false });
        S.lnSMp = lines.add({ x1: i - 1, y1: (hi1 + lo1) / 2, x2: i, y2: (hi2 + lo2) / 2, color: mid, style: 'dotted', width: sesLNW, dead: false });
        S.lnSLp = lines.add({ x1: i - 1, y1: lo1, x2: i, y2: lo2, color: edge, style: 'dotted', width: sesLNW, dead: false });
        S.bsB = false;
        S.bzB = false;
        S.ssB = false;
        S.szB = false;

        if (isLondon) {
          S.fSHp = hi1;
          S.fSLp = lo1;
          site.llnSHc = lines.add({ x1: i - 1, y1: S.fSHp, x2: i, y2: S.fSHp, color: edge, style: 'dotted', width: sesLNW, dead: false });
          site.llnSMc = lines.add({ x1: i - 1, y1: (S.fSHp + S.fSLp) / 2, x2: i, y2: (S.fSHp + S.fSLp) / 2, color: mid, style: 'dotted', width: sesLNW, dead: false });
          site.llnSLc = lines.add({ x1: i - 1, y1: S.fSLp, x2: i, y2: S.fSLp, color: edge, style: 'dotted', width: sesLNW, dead: false });
          S.lbsB = false;
          S.lbzB = false;
          S.lssB = false;
          S.lszB = false;
        } else if (cSes === nypmST) {
          S.fSHp = 10e6;
          S.fSLp = 0;
        }
      }

      if (!cSES) {
        setX2(S.lnSHp, i - 1);
        setX2(S.lnSMp, i - 1);
        setX2(S.lnSLp, i - 1);
        // S.fSLp != 0 (false while it is na)
        if (isLondon && !isNaN(S.fSLp) && Math.abs(S.fSLp) > EPS) {
          setX2(site.llnSHc, i - 1);
          setX2(site.llnSMc, i - 1);
          setX2(site.llnSLc, i - 1);
        }
      }
      site.prev = cSES;
    }

    if (cfg.swpBZ) {
      const pSH = y1(S.lnSHp);
      const m = swpBM * atr;
      if (!S.bsB) {
        if (gt(b.high, pSH) && lt(b.open, pSH)) {
          breached(i, 'buyside');
          S.bzBX = boxes.add({ left: i - 1, top: Math.min(pSH + m, b.high), right: i + 1, bottom: pSH, bg: cfg.swpBC, dead: false });
          S.bzB = true;
          S.bsB = true;
        }
      } else if (S.bzB) {
        if (gt(b.low, pSH - m) && lt(b.high, pSH + m)) {
          if (alive(S.bzBX)) S.bzBX.top = Math.max(b.high, S.bzBX.top);
          if (gt(b.high, pSH) && alive(S.bzBX)) S.bzBX.right = i + 1;
        } else if (gt(b.close, pSH + m * 1.5)) {
          if (alive(S.bzBX)) {
            S.bzBX.bg = fakeCss;
            S.bzBX.right = i;
          }
          S.bzB = false;
        } else if (ge(i - right(S.bzBX), swpML)) {
          if (gt(b.high, pSH + m) && alive(S.bzBX)) {
            S.bzBX.bg = fakeCss;
            S.bzBX.right = i + 1;
          }
          S.bzB = false;
          if (!swpDT) S.bsB = false;
        }
      }

      if (isLondon) {
        const lpSH = S.fSHp;
        if (!S.lbsB) {
          if (gt(b.high, lpSH) && lt(b.open, lpSH)) {
            breached(i, 'buyside');
            S.lbzBX = boxes.add({ left: i - 1, top: Math.min(lpSH + m, b.high), right: i + 1, bottom: lpSH, bg: cfg.swpBC, dead: false });
            S.lbzB = true;
            S.lbsB = true;
          }
        } else if (S.lbzB) {
          if (gt(b.low, lpSH - m) && lt(b.high, lpSH + m)) {
            if (alive(S.lbzBX)) S.lbzBX.top = Math.max(b.high, S.lbzBX.top);
            if (gt(b.high, lpSH) && alive(S.lbzBX)) S.lbzBX.right = i + 1;
          } else if (gt(b.close, lpSH + m * 1.5)) {
            if (alive(S.lbzBX)) {
              S.lbzBX.bg = fakeCss;
              S.lbzBX.right = i;
            }
            S.lbzB = false;
          } else if (ge(i - right(S.lbzBX), swpML)) {
            if (gt(b.high, lpSH + m) && alive(S.lbzBX)) {
              S.lbzBX.bg = fakeCss;
              S.lbzBX.right = i + 1;
            }
            S.lbzB = false;
            if (!swpDT) S.lbsB = false;
          }
        }
      }
    }

    if (cfg.swpSZ) {
      const pSL = y1(S.lnSLp);
      const m = swpSM * atr;
      if (!S.ssB) {
        if (lt(b.low, pSL) && gt(b.open, pSL)) {
          breached(i, 'sellside');
          S.szBX = boxes.add({ left: i - 1, top: pSL, right: i + 1, bottom: Math.max(pSL - m, b.low), bg: cfg.swpSC, dead: false });
          S.szB = true;
          S.ssB = true;
        }
      } else if (S.szB) {
        if (gt(b.low, pSL - m) && lt(b.high, pSL + m)) {
          if (alive(S.szBX)) S.szBX.bottom = Math.min(b.low, S.szBX.bottom);
          if (lt(b.low, pSL) && alive(S.szBX)) S.szBX.right = i + 1;
        } else if (lt(b.close, pSL - m * 1.5)) {
          if (alive(S.szBX)) {
            S.szBX.bg = fakeCss;
            S.szBX.right = i + 1;
          }
          S.szB = false;
        } else if (ge(i - right(S.szBX), swpML)) {
          if (lt(b.low, pSL - m) && alive(S.szBX)) {
            S.szBX.bg = fakeCss;
            S.szBX.right = i + 1;
          }
          S.szB = false;
          if (!swpDT) S.ssB = false;
        }
      }

      if (isLondon) {
        const lpSL = S.fSLp;
        if (!S.lssB) {
          if (lt(b.low, lpSL) && gt(b.open, lpSL)) {
            breached(i, 'sellside');
            S.lszBX = boxes.add({ left: i - 1, top: lpSL, right: i + 1, bottom: Math.max(lpSL - m, b.low), bg: cfg.swpSC, dead: false });
            S.lszB = true;
            S.lssB = true;
          }
        } else if (S.lszB) {
          if (gt(b.low, lpSL - m) && lt(b.high, lpSL + m)) {
            if (alive(S.lszBX)) S.lszBX.bottom = Math.min(b.low, S.lszBX.bottom);
            if (lt(b.low, lpSL) && alive(S.lszBX)) S.lszBX.right = i + 1;
          } else if (lt(b.close, lpSL - m * 1.5)) {
            if (alive(S.lszBX)) {
              S.lszBX.bg = fakeCss;
              S.lszBX.right = i;
            }
            S.lszB = false;
          } else if (ge(i - right(S.lszBX), swpML)) {
            if (lt(b.low, lpSL - m) && alive(S.lszBX)) {
              S.lszBX.bg = fakeCss;
              S.lszBX.right = i + 1;
            }
            S.lszB = false;
            if (!swpDT) S.lssB = false;
          }
        }
      }
    }
  };

  // timeframe.isintraday and timeframe.multiplier <= 5
  const tf = chartTimeframe(bars, chart);
  const tfInfo = tf === '' ? null : timeframe.info(tf);
  const supported = tfInfo !== null && tfInfo.isintraday && tfInfo.multiplier <= 5;

  const sites = [newSite(), newSite(), newSite(), newSite()];
  // Market structure shifts
  const pp = { h: NaN, ht: NaN, hx: false, l: NaN, lt: NaN, lx: false };
  let shift = 0;
  // Fair value gaps: the open gap, and the direction of the latest one
  const uFVG: Bx[] = [];
  let last: boolean | null = null;
  let prevBullG = false;
  let prevBearG = false;
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    setSessions();

    if (supported) {
      pSWP(i, sites[0], cfg.asSH, asST, false, cfg.asC, cfg.asMMP, cfg.asBG, cfg.asSM);
      pSWP(i, sites[1], cfg.ldnSH, ldnST, cfg.ldnDST, cfg.ldnC, cfg.ldnMMP, cfg.ldnBG, cfg.ldnSM);
      pSWP(i, sites[2], cfg.nyamSH, nyamST, cfg.nyDST, cfg.nyamC, cfg.nyamMMP, cfg.nyamBG, cfg.nyamSM);
      pSWP(i, sites[3], cfg.nypmSH, nypmST, cfg.nyDST, cfg.nypmC, cfg.nypmMMP, cfg.nypmBG, cfg.nypmSM);
    }

    if (cfg.mssSH) {
      if (!isNaN(ppH[i])) {
        pp.h = ppH[i];
        pp.hx = false;
        pp.ht = i - mssLN;
      }
      if (!isNaN(ppL[i])) {
        pp.l = ppL[i];
        pp.lx = false;
        pp.lt = i - mssLN;
      }
      if (gt(b.close, pp.h) && !pp.hx) {
        pp.hx = true;
        if (shift === -1) {
          lines.add({ x1: pp.ht, y1: pp.h, x2: i, y2: pp.h, color: cfg.ppLCB, style: 'solid', width: 1, dead: false });
          boxes.add({
            left: pp.ht, top: pp.h, right: i, bottom: pp.h, bg: 'transparent', dead: false,
            text: 'CHoCH', textColor: cfg.ppLCB, textVAlign: 'bottom',
          });
        }
        shift = 1;
      }
      if (lt(b.close, pp.l) && !pp.lx) {
        pp.lx = true;
        if (shift === 1) {
          lines.add({ x1: pp.lt, y1: pp.l, x2: i, y2: pp.l, color: cfg.ppLCS, style: 'solid', width: 1, dead: false });
          boxes.add({
            left: pp.lt, top: pp.l, right: i, bottom: pp.l, bg: 'transparent', dead: false,
            text: 'CHoCH', textColor: cfg.ppLCS, textVAlign: 'top',
          });
        }
        shift = -1;
      }
    }

    if (cfg.fvgSH) {
      const bullG = gt(b.low, H(i - 1));
      const bearG = lt(b.high, L(i - 1));
      const bull = gt(b.low - H(i - 2), fvgATR[i]) && gt(b.low, H(i - 2)) && gt(C(i - 1), H(i - 2)) && !(bullG || prevBullG);
      if (bull) {
        if (uFVG.length > 0) uFVG.pop();
        uFVG.push(boxes.add({ left: i - 1, top: b.low, right: i, bottom: H(i - 2), bg: cfg.fvgBC, dead: false }));
        last = true;
      }
      const bear = gt(L(i - 2) - b.high, fvgATR[i]) && lt(b.high, L(i - 2)) && lt(C(i - 1), L(i - 2)) && !(bearG || prevBearG);
      if (bear) {
        if (uFVG.length > 0) uFVG.pop();
        uFVG.push(boxes.add({ left: i - 1, top: L(i - 2), right: i, bottom: b.high, bg: cfg.fvgSC, dead: false }));
        last = false;
      }
      if ((bullG || bearG) && uFVG.length > 0) uFVG.pop();
      if (uFVG.length > 0) {
        // fvgUpdate()
        const cUB = uFVG[0];
        const tUB = top(cUB);
        const bUB = bottom(cUB);
        if (gt(b.high, bUB) && lt(b.low, tUB)) {
          if (last) {
            if (!gt(b.low, bUB)) uFVG.pop();
          } else if (!lt(b.high, tUB)) {
            uFVG.pop();
          }
        }
        if (!cUB.dead) cUB.right = i;
      }
      prevBullG = bullG;
      prevBearG = bearG;
    }
  }

  // Tables (last bar)
  const tables: TableData[] = [];
  if (n > 0) {
    if (!supported) {
      tables.push({
        position: 'bottom_right', columns: 1, rows: 1,
        cells: [{
          column: 0, row: 0, text: 'Session Sweeps are supported on:       \n 1 min, 3 mins and 5 mins charts\n\n',
          textSize: 'small', textColor: foregroundColorOf(chart),
        }],
      });
    }
    const type = symbolTypeOf(chart);
    const hide = cfg.hIfN ? type === 'forex' || type === 'cfd' : true;
    if (cfg.sesTSH && hide) {
      const timenow = nowOf(chart);
      // f_sesDet()
      const sesDet = (ses: string, dst: boolean): string => {
        const k = S.s.indexOf(ses);
        const utcTime = (S.tO[k] + (dst ? 1 : 0)) * 3600000 + timenow;
        const h = Math.floor(utcTime / 3600000) % 24;
        const m = Math.floor(utcTime / 60000) % 60;
        const s = Math.floor(utcTime / 1000) % 60;
        const day = time.dayofmonth(Math.trunc(utcTime), 'Etc/UTC');
        const month = time.month(Math.trunc(utcTime), 'Etc/UTC');
        const year = time.year(Math.trunc(utcTime), 'Etc/UTC');
        const weekday = time.dayofweek(Math.trunc(utcTime), 'Etc/UTC');
        const dateTime = `${two(day)}/${two(month)}/${str.tostring(year)}-${two(h)}:${two(m)}:${two(s)}`;
        if (weekday === 1 || weekday === 7) return `${dateTime} 🟠 Weekend`;
        const SoH = S.oH[k];
        const ScH = S.cH[k];
        if (h >= SoH && h < ScH) {
          const hc = ScH - h - 1;
          const mc = 60 - m - 1;
          const sc = 60 - s;
          const closes = `${two(hc)}:${two(mc)}:${two(sc)}`;
          if (hc === 0) return sc % 2 === 0 ? `${dateTime} 🟢 Closes in ${closes}` : `${dateTime} 🔴 Closes in ${closes}`;
          return `${dateTime} 🟢 Closes in ${closes}`;
        }
        const ho = h < SoH ? SoH - h - 1 : 24 - h + SoH - 1;
        const mo = 60 - m - 1;
        const so = 60 - s;
        const opens = `${two(ho)}:${two(mo)}:${two(so)}`;
        if (h >= ScH && weekday === 6) return `${dateTime} 🟠 Weekend`;
        if (ho === 0) return so % 2 === 0 ? `${dateTime} 🔴 Opens in ${opens}` : `${dateTime} 🟢 Opens in ${opens}`;
        return `${dateTime} 🔴 Opens in ${opens}`;
      };
      const textSize = cfg.sesTS === 'Small' ? 'small' : cfg.sesTS === 'Normal' ? 'normal' : 'tiny';
      const position = cfg.sesPOS.toLowerCase().replace(' ', '_') as TableData['position'];
      const cells: TableCellData[] = [];
      const row = (r: number, name: string, css: string, dst: boolean) => {
        const ses = sesDet(name, dst);
        const sesC = ses.includes('Closes') ? '#26a69a' : '#ef5350';
        cells.push({ column: 0, row: r, text: '█', textSize, textColor: css });
        cells.push({ column: 1, row: r, text: name, textColor: css, bgColor: String(color.new(css, 75)), textHAlign: 'left', textSize });
        cells.push({ column: 2, row: r, text: ses, textColor: sesC, bgColor: String(color.new(sesC, 75)), textHAlign: 'left', textSize });
      };
      row(0, asST, cfg.asC, false);
      row(1, ldnST, cfg.ldnC, cfg.ldnDST);
      row(2, nyamST, cfg.nyamC, cfg.nyDST);
      row(3, nypmST, cfg.nypmC, cfg.nyDST);
      tables.push({ position, columns: 3, rows: 4, cells, borderWidth: 3 });
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  // an object with an na coordinate is not drawn
  const drawnLine = (l: Ln) => !l.dead && ![l.x1, l.y1, l.x2, l.y2].some((v) => isNaN(v));
  const toLine = (l: Ln): LineDrawingData => ({
    time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color, width: l.width,
    ...(l.style === 'dotted' ? { style: 'dotted' as const } : {}),
  });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: lines.list.filter(drawnLine).map(toLine),
    boxes: boxes.list.filter((b) => ![b.left, b.top, b.right, b.bottom].some((v) => isNaN(v))).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg, borderColor: 'transparent',
      ...(b.text !== undefined ? {
        text: b.text, textSize: 'tiny' as const, textHAlign: 'left' as const, textVAlign: b.textVAlign, textColor: b.textColor,
      } : {}),
    })),
    // a fill between two lines disappears with its lines
    linefills: fills.filter((f) => drawnLine(f.a) && drawnLine(f.b)).map((f) => ({ line1: toLine(f.a), line2: toLine(f.b), color: f.color })),
    tables,
    alertCalls,
  };
}

export const SessionSweeps = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
