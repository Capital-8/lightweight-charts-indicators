/**
 * ICT Silver Bullet [LuxAlgo]
 *
 * Three one-hour 'Silver Bullet' sessions, read in the fixed time zone America/New_York: 3-4 AM, 10-11 AM, 2-3 PM.
 * - Session: a vertical line on its first bar and on the first bar after it, and a name text at the top of the pane.
 * - Trend: a zigzag of the pivot highs / lows (left bars from the input, 1 right bar). A close above the last
 *   zigzag high turns the trend bullish, a close below the last zigzag low turns it bearish.
 * - Fair value gaps made inside a session (bullish: low above the high of two bars back; bearish: the mirror), by
 *   default only in the direction of the trend. A gap becomes active when the price comes back into it; it is then
 *   extended to the current bar until the session ends. In the 'Strict' / 'Super-Strict' modes a close through the
 *   gap cancels it. A gap that is not active when the session ends is made invisible.
 * - Targets: when a session ends, the pivot highs above (pivot lows below) the active gaps of the session, made
 *   since the previous session (of the same kind by default), get a line from the pivot to the session end and a
 *   second line that goes on until the price reaches it. A dot above / below the bar marks a reached target.
 * - Optional: lines at the market structure shifts inside a session, the zigzag itself.
 * - A table text asks for a timeframe of 15 minutes or less on higher timeframes.
 *
 * Drawings are kept up to 500 lines and 500 boxes (the oldest are removed).
 *
 * Chart values read from the optional third argument:
 * - the symbol type and the symbol tick: the original adds a 'minimum trade framework' to the target threshold, of
 *   15 pips (150 ticks) on forex symbols and of 40 ticks on index and futures symbols. Without a symbol type the
 *   port uses 0, the value of the other symbol types (crypto, stocks, funds).
 * - the symbol tick: the session lines go from the close to close + tick. Without it the tick is 0.01 (the lines
 *   are vertical and extended both ways, so they look the same).
 * - the chart timeframe. Without it the timeframe is read from the bars (the most frequent gap between two bars).
 *
 * Reference: "ICT Silver Bullet [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: ©LuxAlgo
 */

import { ta, Series, color, timeframe, time as pineTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { chartTimeframe } from '../anchor-period';
import { barTime } from '../bar-time';
import { mintickOf, symbolTypeOf, type ChartContext } from '../chart-context';
import type { BoxData, LineDrawingData, MarkerData, TableData } from '../types';

type Choice = 'All FVG' | 'Only FVG in the same direction of trend' | 'Strict' | 'Super-Strict';
type TargetOpt = 'previous session (any)' | 'previous session (similar)';

export interface IctSilverBulletInputs {
  /** Swings settings (left) */
  left: number;
  /** Show SB session */
  showSB: boolean;
  col_SB: string;
  /** FVG mode */
  choice: Choice;
  cBullFVG: string;
  cBearFVG: string;
  /** extend */
  extend: boolean;
  /** Targets */
  opt: TargetOpt;
  cSupLine: string;
  cResLine: string;
  /** Keep lines (only in [super-]strict mode) */
  keep: boolean;
  /** MSS ~ session */
  showT: boolean;
  /** Trend */
  showZZ: boolean;
}

export const defaultInputs: IctSilverBulletInputs = {
  left: 5,
  showSB: true,
  col_SB: 'rgba(178, 181, 190, 0.31)',
  choice: 'Super-Strict',
  cBullFVG: 'rgba(77, 208, 225, 0.38)',
  cBearFVG: 'rgba(255, 193, 177, 0.38)',
  extend: true,
  opt: 'previous session (similar)',
  cSupLine: '#b22833',
  cResLine: '#3e89fa',
  keep: true,
  showT: false,
  showZZ: false,
};

const gSwings = 'Swings settings (left)';
const gSB = 'Silver Bullet session';
const gFVG = 'FVG';
const gTG = 'Targets \u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0-\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0 Support/Resistance';
const gShow = 'Show';

export const inputConfig: InputConfig[] = [
  { id: 'left', type: 'int', title: '', defval: 5, min: 1, max: 20, group: gSwings },
  { id: 'showSB', type: 'bool', title: 'Show SB session', defval: true, inline: 'SB', group: gSB },
  { id: 'col_SB', type: 'color', title: '     ', defval: 'rgba(178, 181, 190, 0.31)', inline: 'SB', group: gSB },
  { id: 'choice', type: 'string', title: '', defval: 'Super-Strict', options: ['All FVG', 'Only FVG in the same direction of trend', 'Strict', 'Super-Strict'], inline: 'fvg', group: gFVG },
  { id: 'cBullFVG', type: 'color', title: '', defval: 'rgba(77, 208, 225, 0.38)', inline: 'fvg', group: gFVG },
  { id: 'cBearFVG', type: 'color', title: '', defval: 'rgba(255, 193, 177, 0.38)', inline: 'fvg', group: gFVG },
  { id: 'extend', type: 'bool', title: 'extend', defval: true, inline: 'fvg', group: gFVG },
  { id: 'opt', type: 'string', title: '', defval: 'previous session (similar)', options: ['previous session (any)', 'previous session (similar)'], inline: 'TG', group: gTG },
  { id: 'cSupLine', type: 'color', title: '', defval: '#b22833', inline: 'TG', group: gTG },
  { id: 'cResLine', type: 'color', title: '', defval: '#3e89fa', inline: 'TG', group: gTG },
  { id: 'keep', type: 'bool', title: 'Keep lines (only in [super-]strict mode)', defval: true, group: gTG },
  { id: 'showT', type: 'bool', title: 'MSS ~ session', defval: false, group: gShow },
  { id: 'showZZ', type: 'bool', title: 'Trend', defval: false, group: gShow },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ICT Silver Bullet [LuxAlgo]',
  shortTitle: 'LuxAlgo - ICT Silver Bullet',
  overlay: true,
};

/** Time zone of the session hours */
const TZ = 'America/New_York';
/** max_lines_count, max_boxes_count */
const MAX_COUNT = 500;
/** Size of the zigzag arrays */
const MAX_SIZE = 250;
const NA_COLOR = 'transparent';

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b when a - b > -1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; width?: number; extend?: 'both'; dead: boolean }
interface Bx { left: number; top: number; right: number; bottom: number; border?: string; bg?: string; dead: boolean }

/** Live drawings of one kind: above max + 5 objects the oldest are deleted until max remain */
class Live<T extends { dead: boolean }> {
  readonly list: T[] = [];
  add(o: T): T {
    this.list.push(o);
    if (this.list.length > MAX_COUNT + 5) for (const old of this.list.splice(0, this.list.length - MAX_COUNT)) old.dead = true;
    return o;
  }
  del(o: T | null | undefined): void {
    if (!o || o.dead) return;
    o.dead = true;
    this.list.splice(this.list.indexOf(o), 1);
  }
}

/** Pine types */
interface Piv { b: number; p: number }
interface Fvg { box: Bx; active: boolean; current: boolean }
interface ActLine { ln: Ln; active: boolean }
/** Swings and target lines of one kind of session, and the `var` trend of its f_swings() call */
interface SessionSet { swingH: Piv[]; swingL: Piv[]; targHi: Ln[]; targLo: Ln[]; mssDir: number }

export function calculate(
  bars: Bar[],
  inputs: Partial<IctSilverBulletInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[]; markers: MarkerData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  // syminfo.mintick
  const MINTICK = mintickOf(chart);
  // minimum_trade_framework: 15 pips on forex, 40 ticks on index and futures symbols, else 0
  const symbolType = symbolTypeOf(chart);
  const MIN_TRADE_FRAMEWORK = symbolType === 'forex' ? MINTICK * 15 * 10
    : symbolType === 'index' || symbolType === 'futures' ? MINTICK * 40 : 0;
  const n = bars.length;
  const ms = n > 0 && bars[0].time >= 1e12;
  const tMs = bars.map((b) => (ms ? b.time : b.time * 1000));
  const tfName = chart?.timeframe ?? chartTimeframe(bars);
  const tfSeconds = tfName === '' ? NaN : timeframe.in_seconds(tfName);

  const superstrict = cfg.choice === 'Super-Strict';
  const iTrend = cfg.choice !== 'All FVG';
  const strict = cfg.choice === 'Strict';
  const stricty = superstrict || strict;
  const prev = cfg.opt === 'previous session (any)';
  const { showSB, showT, showZZ, keep, cSupLine, cResLine } = cfg;
  const col_SB = cfg.col_SB;
  const zzCss = String(color.new('#2962FF', 50));
  const hiddenCss = String(color.new('#2962FF', 100));

  const lines = new Live<Ln>();
  const boxes = new Live<Bx>();
  const markers: MarkerData[] = [];
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string, width?: number, extend?: 'both') =>
    lines.add({ x1, y1, x2, y2, color: css, width, extend, dead: false });

  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const phArr = ta.pivothigh(highS, cfg.left, 1).toArray().map((v) => v ?? NaN);
  const plArr = ta.pivotlow(lowS, cfg.left, 1).toArray().map((v) => v ?? NaN);

  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);

  // var aPiv a: the first swing of each array is piv.new(na, na)
  const set = (): SessionSet => ({ swingH: [{ b: NaN, p: NaN }], swingL: [{ b: NaN, p: NaN }], targHi: [], targLo: [], mssDir: 0 });
  const a = { GN: set(), LN: set(), AM: set(), PM: set() };
  // var ZZ aZZ
  const zzD: number[] = new Array(MAX_SIZE).fill(0);
  const zzX: number[] = new Array(MAX_SIZE).fill(0);
  const zzY: number[] = new Array(MAX_SIZE).fill(NaN);
  const zzL: (Ln | null)[] = new Array(MAX_SIZE).fill(null);
  // The first element of each gap array holds a box without coordinates (it counts in the box limit)
  const bFVGbull: Fvg[] = [{ box: boxes.add({ left: NaN, top: NaN, right: NaN, bottom: NaN, dead: false }), active: false, current: false }];
  const bFVGbear: Fvg[] = [{ box: boxes.add({ left: NaN, top: NaN, right: NaN, bottom: NaN, dead: false }), active: false, current: false }];
  let min = 10e6;
  let max = 0;
  const hilo = [0, 10e6];
  let aTrend = 0;
  const lSB: Ln[] = [];
  const highs: ActLine[] = [];
  const lows: ActLine[] = [];

  // plotchar offset: (60 / (seconds / 60)) / 2 with integer divisions
  const tfMinutes = Math.trunc(tfSeconds / 60);
  const tfs = tfMinutes > 0 ? Math.trunc(Math.trunc(60 / tfMinutes) / 2) : 0;
  const markerTime = (i: number) => (i < n ? bars[i].time : barTime(bars, i));

  let prevLN = false;
  let prevAM = false;
  let prevPM = false;
  let prevIn = false;
  let prevEndSB = false;
  // Gaps made before the last session start are locked: only the newer ones are visited on a session start
  let lockedBull = 0;
  let lockedBear = 0;

  const popDelete = (arr: Ln[]) => {
    while (arr.length > 0) lines.del(arr.pop());
  };

  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];
    const t = tMs[i];
    const ph = phArr[i];
    const pl = plArr[i];
    const hasPh = !Number.isNaN(ph) && ph !== 0;
    const hasPl = !Number.isNaN(pl) && pl !== 0;

    // Silver Bullet periods (on bar 0 the previous value is na: a session can start, not end)
    const inLN = pineTime.inSession(t, '0300-0400', TZ);
    const inAM = pineTime.inSession(t, '1000-1100', TZ);
    const inPM = pineTime.inSession(t, '1400-1500', TZ);
    const isInSB = inLN || inAM || inPM;
    const strSB = isInSB && !prevIn;
    const strLN = inLN && !prevLN;
    const strAM = inAM && !prevAM;
    const strPM = inPM && !prevPM;
    const endSB = !isInSB && prevIn;
    const endLN = !inLN && prevLN;
    const endAM = !inAM && prevAM;
    const endPM = !inPM && prevPM;

    // Index of the last zigzag high / low
    const zzIH = () => (zzD[2] === 1 ? 2 : 1);
    const zzIL = () => (zzD[2] === -1 ? 2 : 1);

    const inOut = (d: number, x1: number, y1: number, x2: number, y2: number) => {
      zzD.unshift(d);
      zzX.unshift(x2);
      zzY.unshift(y2);
      zzD.pop();
      zzX.pop();
      zzY.pop();
      if (showZZ) {
        zzL.unshift(newLine(x1, y1, x2, y2, zzCss));
        lines.del(zzL.pop());
      }
    };

    const fSwings = (start: boolean, end: boolean, str: 'GN' | 'LN' | 'AM' | 'PM', active: boolean) => {
      const s = a[str];
      const x2 = i - 1;
      if (start) {
        hilo[0] = 0;
        hilo[1] = 10e6;
        if (stricty ? !keep : true) {
          while (highs.length > 0) lines.del(highs.pop()!.ln);
          while (lows.length > 0) lines.del(lows.pop()!.ln);
          popDelete(s.targHi);
          popDelete(s.targLo);
          for (const k of ['GN', 'LN', 'AM', 'PM'] as const) popDelete(a[k].targHi);
          for (const k of ['GN', 'LN', 'AM', 'PM'] as const) popDelete(a[k].targLo);
        }
      }
      if (active) {
        hilo[0] = Math.max(hilo[0], high);
        hilo[1] = Math.min(hilo[1], low);
      }
      if (hasPh) {
        for (let k = s.swingH.length - 1; k >= 0; k--) if (ge(ph, s.swingH[k].p)) s.swingH.splice(k, 1);
        s.swingH.unshift({ b: i - 1, p: ph });
        if (str === 'GN' || str === 'LN') {
          const dir = zzD[0];
          const x1 = zzX[0];
          const y1 = zzY[0];
          const y2 = i > 0 ? H(i - 1) : 0;
          if (dir < 1) inOut(1, x1, y1, x2, y2);
          else if (dir === 1 && gt(ph, y1)) {
            zzX[0] = x2;
            zzY[0] = y2;
            const l0 = zzL[0];
            if (showZZ && l0 && !l0.dead) {
              l0.x2 = x2;
              l0.y2 = y2;
            }
          }
        }
      }
      if (hasPl) {
        for (let k = s.swingL.length - 1; k >= 0; k--) if (le(pl, s.swingL[k].p)) s.swingL.splice(k, 1);
        s.swingL.unshift({ b: i - 1, p: pl });
        if (str === 'GN' || str === 'LN') {
          const dir = zzD[0];
          const x1 = zzX[0];
          const y1 = zzY[0];
          const y2 = i > 0 ? L(i - 1) : 0;
          if (dir > -1) inOut(-1, x1, y1, x2, y2);
          else if (dir === -1 && lt(pl, y1)) {
            zzX[0] = x2;
            zzY[0] = y2;
            const l0 = zzL[0];
            if (showZZ && l0 && !l0.dead) {
              l0.x2 = x2;
              l0.y2 = y2;
            }
          }
        }
      }
      const iH = zzIH();
      const iL = zzIL();
      if (gt(close, zzY[iH]) && zzD[iH] === 1 && s.mssDir < 1) {
        // MSS bullish
        s.mssDir = 1;
        if (active && showT) newLine(zzX[iH], zzY[iH], i, zzY[iH], cResLine, 2);
      } else if (lt(close, zzY[iL]) && zzD[iL] === -1 && s.mssDir > -1) {
        // MSS bearish
        s.mssDir = -1;
        if (active && showT) newLine(zzX[iL], zzY[iL], i, zzY[iL], cSupLine, 2);
      }
      if (end) {
        const szH = s.swingH.length;
        for (let k = 0; k < szH; k++) {
          const y = s.swingH[k].p;
          if (gt(y, stricty ? min : hilo[0])) {
            s.targHi.unshift(newLine(s.swingH[k].b, y, i, y, cResLine));
            highs.unshift({ ln: newLine(i, y, i, y, cResLine), active: true });
          }
        }
        const szL = s.swingL.length;
        for (let k = 0; k < szL; k++) {
          const y = s.swingL[k].p;
          if (lt(y, stricty ? max : hilo[1])) {
            s.targLo.unshift(newLine(s.swingL[k].b, y, i, y, cSupLine));
            lows.unshift({ ln: newLine(i, y, i, y, cSupLine), active: true });
          }
        }
        s.swingH.length = 0;
        s.swingL.length = 0;
      }
      if (showZZ && (hasPh || hasPl)) {
        const l0 = zzL[0];
        if (l0 && !l0.dead) l0.color = s.mssDir === 1 ? cResLine : cSupLine;
      }
      aTrend = s.mssDir;
    };

    // f_setTrend()
    {
      const iH = zzIH();
      const iL = zzIL();
      if (gt(close, zzY[iH]) && zzD[iH] === 1 && aTrend < 1) aTrend = 1;
      else if (lt(close, zzY[iL]) && zzD[iL] === -1 && aTrend > -1) aTrend = -1;
    }

    // Targets
    let targetHi = false;
    let targetLo = false;
    if (highs.length > 200) lines.del(highs.pop()!.ln);
    for (const get of highs) {
      if (!get.active) continue;
      if (!get.ln.dead) get.ln.x2 = i;
      if (!get.ln.dead && gt(high, get.ln.y2)) {
        get.active = false;
        targetHi = true;
      }
    }
    if (lows.length > 200) lines.del(lows.pop()!.ln);
    for (const get of lows) {
      if (!get.active) continue;
      if (!get.ln.dead) get.ln.x2 = i;
      if (!get.ln.dead && lt(low, get.ln.y2)) {
        get.active = false;
        targetLo = true;
      }
    }
    if (lSB.length > 100) lines.del(lSB.pop());

    // Session start: vertical line, gaps of the previous sessions are locked
    if (strSB) {
      min = 10e6;
      max = 0;
      if (showSB) lSB.unshift(newLine(i, close, i, close + MINTICK, col_SB, undefined, 'both'));
      for (let k = 0; k < bFVGbull.length - lockedBull; k++) {
        const get = bFVGbull[k];
        if (!get.box.dead && i > get.box.right - 1 && get.current) get.current = false;
      }
      for (let k = 0; k < bFVGbear.length - lockedBear; k++) {
        const get = bFVGbear[k];
        if (!get.box.dead && i > get.box.right - 1 && get.current) get.current = false;
      }
      lockedBull = bFVGbull.length;
      lockedBear = bFVGbear.length;
    }

    // Fair value gaps
    if (isInSB) {
      const fvg = (left: number, top: number, bottom: number, css: string): Fvg => ({
        box: boxes.add({ left, top, right: i, bottom, border: NA_COLOR, bg: css, dead: false }),
        active: false,
        current: true,
      });
      if (iTrend) {
        if (aTrend === 1) {
          if (gt(low, H(i - 2))) bFVGbull.unshift(fvg(i - 2, low, H(i - 2), cfg.cBullFVG));
        } else if (lt(high, L(i - 2))) bFVGbear.unshift(fvg(i - 2, L(i - 2), high, cfg.cBearFVG));
      } else {
        if (gt(low, H(i - 2))) bFVGbull.unshift(fvg(i, low, H(i - 2), cfg.cBullFVG));
        if (lt(high, L(i - 2))) bFVGbear.unshift(fvg(i, L(i - 2), high, cfg.cBearFVG));
      }
    }

    if (endSB && showSB) lSB.unshift(newLine(i, close, i, close + MINTICK, col_SB, undefined, 'both'));

    // Gaps are made and deleted (count limit) oldest first: after a deleted box, or one that is 1000 bars old, all
    // the next ones of the array are skipped too
    const hide = (b: Bx, bLeft: number) => {
      b.bg = hiddenCss;
      b.right = bLeft;
    };
    for (const get of bFVGbull) {
      const b = get.box;
      if (b.dead) break;
      const bLeft = b.left;
      const bTop = b.top;
      const bBot = b.bottom;
      if (Number.isNaN(bLeft)) continue;
      if (!(i - bLeft < 1000)) break;
      if (!get.current) continue;
      if (isInSB) {
        if (lt(close, bBot)) {
          if (superstrict) {
            get.current = false;
            hide(b, bLeft);
          }
          if (superstrict || strict) get.active = false;
        } else if (cfg.extend && get.active) b.right = i;
        // Retrace: activated
        if (!get.active && lt(low, bTop) && gt(close, bBot)) {
          get.active = true;
          if (cfg.extend) b.right = i;
        }
      }
      // First bar after the session: no retrace or a close through the gap makes it invisible
      if (endSB) {
        if (get.active) {
          if (strict && lt(close, bBot)) get.active = false;
          if (superstrict && lt(close, bTop)) get.active = false;
        }
        if (!get.active) hide(b, bLeft);
        if (get.active) {
          min = Math.min(min, bBot + MIN_TRADE_FRAMEWORK);
          if (cfg.extend) b.right = i;
        }
      }
      if (prevEndSB) get.active = false;
    }
    for (const get of bFVGbear) {
      const b = get.box;
      if (b.dead) break;
      const bLeft = b.left;
      const bTop = b.top;
      const bBot = b.bottom;
      if (Number.isNaN(bLeft)) continue;
      if (!(i - bLeft < 1000)) break;
      if (!get.current) continue;
      if (isInSB) {
        if (gt(close, bTop)) {
          if (superstrict) {
            get.current = false;
            hide(b, bLeft);
          }
          if (superstrict || strict) get.active = false;
        } else if (cfg.extend && get.active) b.right = i;
        if (!get.active && gt(high, bBot) && lt(close, bTop)) {
          get.active = true;
          if (cfg.extend) b.right = i;
        }
      }
      if (endSB) {
        if (get.active) {
          if (strict && gt(close, bTop)) get.active = false;
          if (superstrict && gt(close, bBot)) get.active = false;
        }
        if (!get.active) hide(b, bLeft);
        if (get.active) {
          max = Math.max(max, bTop - MIN_TRADE_FRAMEWORK);
          if (cfg.extend) b.right = i;
        }
      }
      if (prevEndSB) get.active = false;
    }

    if (prev) fSwings(strSB, endSB, 'GN', isInSB);
    else {
      fSwings(strLN, endLN, 'LN', inLN);
      fSwings(strAM, endAM, 'AM', inAM);
      fSwings(strPM, endPM, 'PM', inPM);
    }

    // plotchar: session names (no character, a text), reached targets (a dot)
    if (showSB) {
      const name = (text: string) => markers.push({
        time: markerTime(i + tfs), position: 'top', shape: 'circle', color: NA_COLOR, text, textColor: col_SB,
      });
      if (inLN && !prevLN) name('3-4 AM\nNY');
      if (inAM && !prevAM) name('10-11 AM\nNY');
      if (inPM && !prevPM) name('2-3 PM\nNY');
    }
    if (targetHi) markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'circle', color: NA_COLOR, text: '•', textColor: cResLine, size: 'small' });
    if (targetLo) markers.push({ time: bars[i].time, position: 'belowBar', shape: 'circle', color: NA_COLOR, text: '•', textColor: cSupLine, size: 'small' });

    prevLN = inLN;
    prevAM = inAM;
    prevPM = inPM;
    prevIn = isInSB;
    prevEndSB = endSB;
  }

  // The table exists also when it has no cell
  const table: TableData = { position: 'top_right', columns: 1, rows: 1, cells: [], bgColor: NA_COLOR, borderWidth: 1 };
  if (tfSeconds > 15 * 60) table.cells.push({ column: 0, row: 0, text: 'Please use a timeframe <= 15 minutes', textColor: '#FF0000', textSize: 'auto' });

  const X = (x: number) => (x < n ? bars[x].time : barTime(bars, x));
  const drawn = (...v: number[]) => v.every((x) => !Number.isNaN(x));
  const outLines: LineDrawingData[] = lines.list.filter((l) => drawn(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
    time1: X(l.x1), price1: l.y1, time2: X(l.x2), price2: l.y2, color: l.color,
    ...(l.width !== undefined ? { width: l.width } : {}),
    ...(l.extend ? { extend: l.extend } : {}),
  }));
  const outBoxes: BoxData[] = boxes.list.filter((b) => drawn(b.left, b.top, b.right, b.bottom)).map((b) => ({
    time1: X(b.left), price1: b.top, time2: X(b.right), price2: b.bottom,
    ...(b.border !== undefined ? { borderColor: b.border } : {}),
    ...(b.bg !== undefined ? { bgColor: b.bg } : {}),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: outLines,
    boxes: outBoxes,
    markers,
    tables: n > 0 ? [table] : [],
  };
}

export const IctSilverBullet = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
