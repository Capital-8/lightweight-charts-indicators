/**
 * Pivot Hilo Support n Resistance Levels R5.4
 *
 * Pivot highs and lows ('Pivot Length Left Hand Side' bars before and 'Pivot Length Right Hand Side' bars after the
 * pivot bar) are marked with a dot on the pivot bar. The price of the latest pivot high and of the latest pivot low
 * are drawn as support / resistance levels (a line on the bars where the level does not change, and a line object
 * for the most recent levels), or as a stepped "fractal chaos" channel.
 *
 * Options: a pivot is printed when it is complete, or one bar later (the default, 'wait for candle close'); "auto
 * strength" adds one bar to the left length when the close is not above its 21-bar EMA and one bar to the right
 * length when it is not below it; "Renko style" takes the candle body for the highs and lows; "ideal" pivots need
 * strictly rising then strictly falling bars; HH / LH / HL / LL marks compare a pivot with the pivot before (or the
 * three pivots before); the pivot bar can be coloured; arrows mark a bar that opens at or below the top level and
 * closes above it (and the reverse for the bottom level); two moving averages can filter the pivots and the arrows.
 *
 * Plot offsets: the dots, levels, marks and bar colours are drawn on the pivot bar, that is right length + wait
 * bars before the bar where the pivot is known. With "auto strength" the right length changes from bar to bar: the
 * port moves each bar by its own length.
 *
 * MA filter on the pivots: the pivot functions then run only on the bars that pass the filter and keep the values
 * of those bars only (the rule of a call inside a branch).
 *
 * At most 50 level lines are kept (the default of the platform). The fractal break arrows are the original's
 * plotarrow outputs (`arrows` of the result). Alerts (alertcondition, `alerts` of the result): 'Fractal Break Arrow'
 * (either break), 'Fractal Break Long', 'Fractal Break Short' and 'Any Swing' (a HH / LH / HL / LL pivot).
 * The two moving average plots are circles joined by a line in the original; the port gives circles.
 *
 * Reference: "Pivot Hilo Support n Resistance Levels R5.4" by JustUncleL
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright 2017,2018 JustUncleL. SuperSmoother filter © 2013 John F. Ehlers
 */

import {
  ta, Series, getSourceSeries, color, callsite, line, resetDrawings, setDrawingBar, varDrawing,
  type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { ArrowData } from 'oakscriptjs';
import type { BarColorData, LineDrawingData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type MaType = 'SMA' | 'EMA' | 'WMA' | 'VWMA' | 'Smooth SMA' | 'DEMA' | 'TEMA' | 'Hull MA' | 'ZeroLag EMA' | 'Triangular MA' | 'SuperSmooth MA';

export interface PivotHiloSupportNResistanceLevelsR33Inputs {
  ShowPivots: boolean;
  /** Use Auto Strength Pivots Points */
  uAuto: boolean;
  left: number;
  right: number;
  ShowSRLevels: boolean;
  ShowChannel: boolean;
  /** When to start Printing Pivot (0 = no wait, 1 = wait for candle close) */
  Shunt: number;
  /** Maximum S/R Level Extension Length (0: no limit) */
  maxLvlLen: number;
  uRenko: boolean;
  sIdeal: boolean;
  ShowHHLL: boolean;
  swing3Levels: boolean;
  clrPivot: boolean;
  ShowFB: boolean;
  filterFB: boolean;
  uMAf: boolean;
  fast_ma_type: MaType;
  fast_ma_len: number;
  fast_ma_src: SourceType;
  slow_ma_type: MaType;
  slow_ma_len: number;
  slow_ma_src: SourceType;
  sMAs: boolean;
}

export const defaultInputs: PivotHiloSupportNResistanceLevelsR33Inputs = {
  ShowPivots: true,
  uAuto: false,
  left: 5,
  right: 5,
  ShowSRLevels: true,
  ShowChannel: false,
  Shunt: 1,
  maxLvlLen: 0,
  uRenko: false,
  sIdeal: false,
  ShowHHLL: false,
  swing3Levels: false,
  clrPivot: false,
  ShowFB: false,
  filterFB: false,
  uMAf: false,
  fast_ma_type: 'EMA',
  fast_ma_len: 21,
  fast_ma_src: 'close',
  slow_ma_type: 'EMA',
  slow_ma_len: 55,
  slow_ma_src: 'close',
  sMAs: false,
};

const MA_TYPES = ['SMA', 'EMA', 'WMA', 'VWMA', 'Smooth SMA', 'DEMA', 'TEMA', 'Hull MA', 'ZeroLag EMA', 'Triangular MA', 'SuperSmooth MA'];

export const inputConfig: InputConfig[] = [
  { id: 'ShowPivots', type: 'bool', title: 'Show Pivot Points', defval: true },
  { id: 'uAuto', type: 'bool', title: 'Use Auto Strength Pivots Points', defval: false },
  { id: 'left', type: 'int', title: 'Pivot Length Left Hand Side', defval: 5, min: 1 },
  { id: 'right', type: 'int', title: 'Pivot Length Right Hand Side', defval: 5, min: 1 },
  { id: 'ShowSRLevels', type: 'bool', title: 'Show S/R Level Extensions', defval: true },
  { id: 'ShowChannel', type: 'bool', title: 'Show Levels as a Fractal Chaos Channel', defval: false },
  { id: 'Shunt', type: 'int', title: 'When to start Printing Pivot (0 = no wait, 1 = wait for candle close)', defval: 1, min: 0, max: 1 },
  { id: 'maxLvlLen', type: 'int', title: 'Maximum S/R Level Extension Length', defval: 0, min: 0 },
  { id: 'uRenko', type: 'bool', title: 'Use Renko Style Pivots (open/close for high/low)', defval: false },
  { id: 'sIdeal', type: 'bool', title: 'Show Only Ideal Pivots (handy for Renko and HA)', defval: false },
  { id: 'ShowHHLL', type: 'bool', title: 'Show HH,LL,LH,HL markers on Pivots Points', defval: false },
  { id: 'swing3Levels', type: 'bool', title: 'Filter HH,LL,LH,HL to Third Level Swings', defval: false },
  { id: 'clrPivot', type: 'bool', title: 'Highlight Pivot with Coloured Bar', defval: false },
  { id: 'ShowFB', type: 'bool', title: 'Show Fractal Break Alert Arrows', defval: false },
  { id: 'filterFB', type: 'bool', title: 'Apply MA Filter to Fractal Break Alerts', defval: false },
  { id: 'uMAf', type: 'bool', title: 'Use MA Filter on Pivots', defval: false },
  { id: 'fast_ma_type', type: 'string', title: 'Fast MA Type ', defval: 'EMA', options: MA_TYPES },
  { id: 'fast_ma_len', type: 'int', title: 'Fast MA - Length', defval: 21, min: 1 },
  { id: 'fast_ma_src', type: 'source', title: 'Fast MA - Source', defval: 'close' },
  { id: 'slow_ma_type', type: 'string', title: 'Slow MA Type ', defval: 'EMA', options: MA_TYPES },
  { id: 'slow_ma_len', type: 'int', title: 'Slow MA - Length', defval: 55, min: 1 },
  { id: 'slow_ma_src', type: 'source', title: 'Slow MA - Source', defval: 'close' },
  { id: 'sMAs', type: 'bool', title: 'Show MA Lines', defval: false },
];

// Colour constants of Pine version 4
const LIME = '#00E676';
const GRAY = '#787B86';
const GREEN = '#4CAF50';
const MAROON = '#880E4F';
const WHITE = '#FFFFFF';
const RED = '#FF5252';
const ORANGE = '#FFA500';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast MA', color: String(color.new(LIME, 15)), lineWidth: 2, style: 'circles' },
  { id: 'plot1', title: 'Slow MA', color: String(color.new(GRAY, 15)), lineWidth: 2, style: 'circles' },
  { id: 'plot2', title: 'High Pivot *', color: String(color.new(WHITE, 50)), lineWidth: 3, style: 'circles' },
  { id: 'plot3', title: 'Low Pivot *', color: String(color.new(WHITE, 50)), lineWidth: 3, style: 'circles' },
  { id: 'plot4', title: 'High Pivot *', color: GREEN, lineWidth: 2, style: 'circles' },
  { id: 'plot5', title: 'Low Pivot *', color: MAROON, lineWidth: 2, style: 'circles' },
  { id: 'plot6', title: 'Top Levels', color: MAROON, lineWidth: 1 },
  { id: 'plot7', title: 'Bottom Levels', color: GREEN, lineWidth: 1 },
  { id: 'plot8', title: 'Top Chaos Channel', color: GREEN, lineWidth: 1, style: 'stepline' },
  { id: 'plot9', title: 'Bottom Chaos Channel', color: MAROON, lineWidth: 1, style: 'stepline' },
];

export const metadata = {
  title: 'Pivot Hilo Support n Resistance Levels R5.4',
  shortTitle: 'PVTLVLS R5.4',
  overlay: true,
};

/** Lines kept by Pine (the default of study()) */
const MAX_LINES = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const nz = (v: number) => (Number.isNaN(v) ? 0 : v);
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !Number.isNaN(v) && v !== 0;

export function calculate(
  bars: Bar[],
  inputs: Partial<PivotHiloSupportNResistanceLevelsR33Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; lines: LineDrawingData[]; arrows: ArrowData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { left, right, Shunt } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const at = (a: number[], i: number) => (i >= 0 && i < a.length ? a[i] : NaN);

  // variant(type, src, len): every type is computed on each bar in the original, so the lengths of all of them
  // are checked whatever the type
  const variant = (type: MaType, source: SourceType, len: number): number[] => {
    if (Math.trunc(len / 2) < 1) {
      throw new Error("Invalid value of the 'length' argument (0.0) in the 'wma' function. It must be > 0.");
    }
    const src = getSourceSeries(bars, source);
    const s = A(src);
    switch (type) {
      case 'EMA':
        return A(ta.ema(src, len));
      case 'WMA':
        return A(ta.wma(src, len));
      case 'VWMA':
        return A(ta.vwma(src, len, S(bars.map((b) => b.volume ?? NaN))));
      case 'Smooth SMA': {
        // v5 := na(v5[1]) ? sma(src, len) : (v5[1] * (len - 1) + src) / len
        const sma = A(ta.sma(src, len));
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          const prev = i > 0 ? out[i - 1] : NaN;
          out.push(Number.isNaN(prev) ? sma[i] : (prev * (len - 1) + s[i]) / len);
        }
        return out;
      }
      case 'DEMA': {
        const v2 = ta.ema(src, len);
        const e = A(ta.ema(v2, len));
        return A(v2).map((v, i) => 2 * v - e[i]);
      }
      case 'TEMA': {
        const v2 = ta.ema(src, len);
        const e2 = ta.ema(v2, len);
        const e3 = A(ta.ema(e2, len));
        const b = A(e2);
        return A(v2).map((v, i) => 3 * (v - b[i]) + e3[i]);
      }
      case 'Hull MA': {
        const half = A(ta.wma(src, Math.trunc(len / 2)));
        const full = A(ta.wma(src, len));
        return A(ta.wma(S(half.map((v, i) => 2 * v - full[i])), Math.round(Math.sqrt(len))));
      }
      case 'SuperSmooth MA': {
        const a1 = Math.exp((-1.414 * 3.14159) / len);
        const b1 = 2 * a1 * Math.cos((1.414 * 3.14159) / len);
        const c2 = b1;
        const c3 = -a1 * a1;
        const c1 = 1 - c2 - c3;
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          out.push((c1 * (s[i] + nz(at(s, i - 1)))) / 2 + c2 * nz(at(out, i - 1)) + c3 * nz(at(out, i - 2)));
        }
        return out;
      }
      case 'ZeroLag EMA': {
        // xLag = (len - 1) / 2: a history index, truncated
        const lag = Math.trunc((len - 1) / 2);
        return A(ta.ema(S(s.map((v, i) => v + (v - at(s, i - lag)))), len));
      }
      case 'Triangular MA':
        return A(ta.sma(ta.sma(src, len), len));
      default:
        return A(ta.sma(src, len));
    }
  };
  const fastMa = variant(cfg.fast_ma_type, cfg.fast_ma_src, cfg.fast_ma_len);
  const slowMa = variant(cfg.slow_ma_type, cfg.slow_ma_src, cfg.slow_ma_len);
  const fastLonger = cfg.fast_ma_len > cfg.slow_ma_len;

  const high_ = bars.map((b) => (cfg.uRenko ? Math.max(b.close, b.open) : b.high));
  const low_ = bars.map((b) => (cfg.uRenko ? Math.min(b.close, b.open) : b.low));

  // Pivot lengths of each bar
  const ema21 = A(ta.ema(S(bars.map((b) => b.close)), 21));
  const lenL = bars.map((b, i) => (cfg.uAuto ? (gt(b.close, ema21[i]) ? left : left + 1) : left));
  const lenR = bars.map((b, i) => (cfg.uAuto ? (lt(b.close, ema21[i]) ? right : right + 1) : right));

  // Bars where the pivot calls run: with the MA filter they are in a branch that is skipped on the other bars
  const hiCalled = bars.map((_b, i) => !(cfg.uMAf && (fastLonger || lt(fastMa[i], slowMa[i]))));
  const loCalled = bars.map((_b, i) => !(cfg.uMAf && (fastLonger || gt(fastMa[i], slowMa[i]))));

  // pivothigh() / pivotlow(): one call site each, called on the bars where the call runs with the lengths of the bar
  const pivotHighSite = callsite.pivothigh();
  const pivotLowSite = callsite.pivotlow();
  // ipivothigh() / ipivotlow(): strictly rising to the pivot then strictly falling (the reverse for a low).
  // `src[k]` inside a function that does not run on every bar: the value of its last call at bar i - k or before
  const ideal = (src: number[], isHigh: boolean, called: boolean[], lastCall: number[], i: number): number => {
    const L = lenL[i];
    const R = lenR[i];
    const hist = (k: number) => (i - k >= 0 && (called[i - k] || lastCall[i - k] >= 0) ? src[called[i - k] ? i - k : lastCall[i - k]] : NaN);
    const before = (a: number, b: number) => (isHigh ? gt(a, b) : lt(a, b));
    for (let k = R; k <= L + R - 1; k++) if (!before(hist(k), hist(k + 1))) return NaN;
    for (let k = 0; k <= R - 1; k++) if (!before(hist(k + 1), hist(k))) return NaN;
    return hist(R);
  };
  // index of the last bar at or before each bar where the call ran (-1: none)
  const lastOf = (called: boolean[]) => {
    let last = -1;
    return called.map((c, i) => {
      if (c) last = i;
      return last;
    });
  };
  const hiLast = lastOf(hiCalled.map((c) => c && cfg.sIdeal));
  const loLast = lastOf(loCalled.map((c) => c && cfg.sIdeal));
  const pvthiRaw: number[] = [];
  const pvtloRaw: number[] = [];
  for (let i = 0; i < n; i++) {
    pvthiRaw.push(!hiCalled[i] ? NaN : cfg.sIdeal ? ideal(high_, true, hiCalled, hiLast, i) : pivotHighSite(i, high_[i], lenL[i], lenR[i]));
    pvtloRaw.push(!loCalled[i] ? NaN : cfg.sIdeal ? ideal(low_, false, loCalled, loLast, i) : pivotLowSite(i, low_[i], lenL[i], lenR[i]));
  }

  const plotIds = ['plot0', 'plot1', 'plot2', 'plot3', 'plot4', 'plot5', 'plot6', 'plot7', 'plot8', 'plot9'] as const;
  const values = Object.fromEntries(plotIds.map((id) => [id, new Array<number>(n).fill(NaN)])) as Record<typeof plotIds[number], number[]>;
  const colors: Record<'plot6' | 'plot7', Array<string | undefined>> = { plot6: new Array(n), plot7: new Array(n) };
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const arrows: ArrowData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [], swingFlags: boolean[] = [];
  // Level lines in the drawing registry of the library (line limit of the script); `var line pvthiLine / pvtloLine`
  resetDrawings({ line: MAX_LINES });
  const pvthiLine = varDrawing<Line>();
  const pvtloLine = varDrawing<Line>();
  const newLine = (x1: number, x2: number, y: number, col: string): Line => line.new(x1, y, x2, y, 'bar_index', 'none', col, 'solid', 1);

  // valuewhen(pvthi, high_[pvtLenR + Shunt], k): the values kept on the bars with a pivot
  const highsAt: number[] = [];
  const lowsAt: number[] = [];
  const back = (list: number[], k: number) => (list.length > k ? list[list.length - 1 - k] : NaN);
  let counthi = 0;
  let countlo = 0;
  let pvthis = NaN;
  let pvtlos = NaN;
  const hhColor = GREEN;
  const lhColor = MAROON;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const bar = bars[i];
    const pvthi = at(pvthiRaw, i - Shunt);
    const pvtlo = at(pvtloRaw, i - Shunt);
    const off = lenR[i] + Shunt;
    // the bar where the outputs of this bar are drawn (offset = -pvtLenR - Shunt)
    const target = i - off;

    if (truthy(pvthi)) highsAt.push(at(high_, i - off));
    if (truthy(pvtlo)) lowsAt.push(at(low_, i - off));
    const [h0, h1, h2, h3] = [0, 1, 2, 3].map((k) => back(highsAt, k));
    const [l0, l1, l2, l3] = [0, 1, 2, 3].map((k) => back(lowsAt, k));
    const hasHi = !Number.isNaN(pvthi);
    const hasLo = !Number.isNaN(pvtlo);
    const three = cfg.swing3Levels;
    const higherhigh = hasHi && lt(h1, h0) && (!three || (lt(h2, h0) && lt(h3, h0))) ? pvthi : NaN;
    const lowerhigh = hasHi && gt(h1, h0) && (!three || (gt(h2, h0) && gt(h3, h0))) ? pvthi : NaN;
    const higherlow = hasLo && lt(l1, l0) && (!three || (lt(l2, l0) && lt(l3, l0))) ? pvtlo : NaN;
    const lowerlow = hasLo && gt(l1, l0) && (!three || (gt(l2, l0) && gt(l3, l0))) ? pvtlo : NaN;
    // anySwing = not (na(higherhigh) and na(lowerhigh) and na(higherlow) and na(lowerlow))
    swingFlags.push(![higherhigh, lowerhigh, higherlow, lowerlow].every((v) => Number.isNaN(v)));

    if (target >= 0) {
      const time = bars[target].time;
      if (cfg.ShowHHLL) {
        if (truthy(higherhigh)) markers.push({ time, position: 'aboveBar', shape: 'triangleUp', color: hhColor, text: 'HH' });
        if (truthy(higherlow)) markers.push({ time, position: 'belowBar', shape: 'triangleUp', color: hhColor, text: 'HL' });
        if (truthy(lowerhigh)) markers.push({ time, position: 'aboveBar', shape: 'triangleDown', color: lhColor, text: 'LH' });
        if (truthy(lowerlow)) markers.push({ time, position: 'belowBar', shape: 'triangleDown', color: lhColor, text: 'LL' });
      }
      if (cfg.ShowPivots && !cfg.ShowHHLL) {
        if (hasHi) {
          values.plot2[target] = pvthi;
          values.plot4[target] = pvthi;
        }
        if (hasLo) {
          values.plot3[target] = pvtlo;
          values.plot5[target] = pvtlo;
        }
      }
      // barcolor(clrPivot and (pvthi or pvtlo) ? ORANGE : na)
      if (cfg.clrPivot && (truthy(pvthi) || truthy(pvtlo))) barColors.push({ time, color: ORANGE });
    }

    counthi = hasHi ? 0 : counthi + 1;
    countlo = hasLo ? 0 : countlo + 1;
    const pvthisPrev = pvthis;
    const pvtlosPrev = pvtlos;
    if (hasHi) pvthis = at(bars.map((b) => b.high), i - off);
    if (hasLo) pvtlos = at(bars.map((b) => b.low), i - off);
    // hipc = pvthis != pvthis[1] ? na : color.maroon
    const hipc = ne(pvthis, pvthisPrev) ? undefined : MAROON;
    const lopc = ne(pvtlos, pvtlosPrev) ? undefined : GREEN;

    // Level lines
    if (!cfg.ShowChannel && cfg.ShowSRLevels) {
      if (!Number.isNaN(pvthis) && ne(nz(pvthisPrev), pvthis)) pvthiLine.value = newLine(i - off, i, pvthis, MAROON);
      if (pvthiLine.value && !Number.isNaN(pvthis)) line.set_x2(pvthiLine.value, i);
      if (!Number.isNaN(pvtlos) && ne(nz(pvtlosPrev), pvtlos)) pvtloLine.value = newLine(i - off, i, pvtlos, GREEN);
      if (pvtloLine.value && !Number.isNaN(pvtlos)) line.set_x2(pvtloLine.value, i);
    }

    if (target >= 0 && cfg.ShowSRLevels && !cfg.ShowChannel) {
      if ((cfg.maxLvlLen === 0 || counthi < cfg.maxLvlLen) && !Number.isNaN(pvthis)) {
        values.plot6[target] = pvthis;
        colors.plot6[target] = hipc ?? 'transparent';
      }
      if ((cfg.maxLvlLen === 0 || countlo < cfg.maxLvlLen) && !Number.isNaN(pvtlos)) {
        values.plot7[target] = pvtlos;
        colors.plot7[target] = lopc ?? 'transparent';
      }
    }
    if (cfg.ShowSRLevels && cfg.ShowChannel) {
      values.plot8[i] = pvthis;
      values.plot9[i] = pvtlos;
    }
    if (cfg.sMAs) {
      values.plot0[i] = fastMa[i];
      if (cfg.fast_ma_len <= cfg.slow_ma_len) values.plot1[i] = slowMa[i];
    }

    // Fractal break arrows
    const buy = gt(bar.close, pvthis) && le(bar.open, pvthis)
      && (!cfg.filterFB || ((fastLonger || gt(fastMa[i], slowMa[i])) && gt(bar.close, fastMa[i])));
    const sell = lt(bar.close, pvtlos) && ge(bar.open, pvtlos)
      && (!cfg.filterFB || ((fastLonger || lt(fastMa[i], slowMa[i])) && lt(bar.close, fastMa[i])));
    buyFlags.push(buy);
    sellFlags.push(sell);
    // plotarrow(ShowFB and buy ? 1 : na, 'BUY Arrow', colorup = color.lime, transp = 20)
    if (cfg.ShowFB && buy) arrows.push({ time: bar.time, id: 'arrow0', value: 1, color: String(color.new(LIME, 20)) });
    // plotarrow(ShowFB and sell ? -1 : na, 'SELL Arrow', colordown = color.red, transp = 20)
    if (cfg.ShowFB && sell) arrows.push({ time: bar.time, id: 'arrow1', value: -1, color: String(color.new(RED, 20)) });
  }

  setDrawingBar(null);

  const plots: IndicatorResult['plots'] = {};
  for (const id of plotIds) {
    const cols = id === 'plot6' || id === 'plot7' ? colors[id] : undefined;
    plots[id] = bars.map((b, i) => (cols && cols[i] !== undefined
      ? { time: b.time, value: values[id][i], color: cols[i] }
      : { time: b.time, value: values[id][i] }));
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    barColors,
    arrows,
    lines: line.all().map((l) => ({
      time1: bars[l.x1].time, price1: l.y1, time2: bars[l.x2].time, price2: l.y2, color: String(l.color), width: 1, style: 'solid' as const,
    })),
    // alertcondition(buy or sell) / (buy) / (sell) / (anySwing)
    alerts: alertStates(alertConditions, bars, [buyFlags.map((b, i) => b || sellFlags[i]), buyFlags, sellFlags, swingFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Fractal Break Arrow', message: 'Alert' },
  { id: 'alert1', title: 'Fractal Break Long', message: 'Long' },
  { id: 'alert2', title: 'Fractal Break Short', message: 'Short' },
  { id: 'alert3', title: 'Any Swing', message: 'AnySwing' },
];

export const PivotHiloSupportNResistanceLevelsR33 = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
