/**
 * One Shot One Kill ICT (Liquidity MMXM + CISD OTE)
 *
 * - Previous day high / low: lines and "PDH" / "PDL" labels at the high and low of the last completed daily bar,
 *   drawn again on each new day and extended to the last bar.
 * - Liquidity sweeps: major swing highs / lows (pivots of `SwingPeriod` bars on each side). A bar whose high goes
 *   above a swing high and closes below it, before any close above it, sweeps it ("Liquidity": a dashed line from
 *   the swing to the bar and a label); the same for swing lows.
 * - CISD: after a sweep of a swing high, the open of the most recent bearish bar among the last `BarBackCheck` bars
 *   (the lower open of it and the bar after) is the CISD level (dotted line, "CISD level" label). A close below the
 *   level within `CISDVal` bars confirms it: the line and its name turn red, and Fibonacci levels (0, 0.236, 0.382,
 *   0.5, 0.618, 0.786, 1) of the move are drawn 20 bars to the right. The same, mirrored, after a sweep of a swing
 *   low. A confirmation also colours the next liquidity line and label, as in the original.
 *
 * Previous day: `request.security(syminfo.tickerid, "1D", ...)` with the values of a confirmed daily bar; the daily
 * bars are built from the chart bars (src/anchor-period.ts, exchange calendar of the chart context when given); a
 * last bar that is still open (chart context `lastBarConfirmed` false) keeps the values of the bar before.
 *
 * Reference: "One Shot One Kill ICT [TradingFinder] Liquidity MMXM + CISD OTE" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import {
  ta, Series, timeframe, mapToChart, line, label, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type Label,
} from 'oakscriptjs';
import type { ChartContext } from '../chart-context';
import { lastBarConfirmedOf } from '../chart-context';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';

export interface OneShotOneKillIctLiquidityMmxmCisdOteInputs {
  BarBackCheck: number;
  CISDVal: number;
  SwingPeriod: number;
  MaxSwingBack_Method: 'All' | 'Custom';
  MaxSwingBack: number;
  CISD_AShow: boolean;
  CISD_HShow: boolean;
  CISD_LShow: boolean;
  CISD_HNColor: string;
  CISD_LNColor: string;
  CISD_HLColor: string;
  CISD_LLColor: string;
  Liquidity_AShow: boolean;
  Liquidity_HShow: boolean;
  Liquidity_LShow: boolean;
  Liquidity_HNColor: string;
  Liquidity_LNColor: string;
  Liquidity_HLColor: string;
  Liquidity_LLColor: string;
}

export const defaultInputs: OneShotOneKillIctLiquidityMmxmCisdOteInputs = {
  BarBackCheck: 5,
  CISDVal: 25,
  SwingPeriod: 50,
  MaxSwingBack_Method: 'All',
  MaxSwingBack: 100,
  CISD_AShow: true,
  CISD_HShow: true,
  CISD_LShow: true,
  CISD_HNColor: '#870505',
  CISD_LNColor: '#014f07',
  // #b90000b8 and #069206a7: an input colour keeps an alpha of 2 decimals
  CISD_HLColor: 'rgba(185, 0, 0, 0.72)',
  CISD_LLColor: 'rgba(6, 146, 6, 0.65)',
  Liquidity_AShow: true,
  Liquidity_HShow: true,
  Liquidity_LShow: true,
  Liquidity_HNColor: '#870505',
  Liquidity_LNColor: '#014f07',
  Liquidity_HLColor: 'rgba(185, 0, 0, 0.72)',
  Liquidity_LLColor: 'rgba(6, 146, 6, 0.65)',
};

const G_CISD = 'CISD Logical Setting';
const G_LIQ = 'Liquidity Logical Setting';
const G_CISD_D = 'CISD Display Setting';
const G_LIQ_D = 'Liquidity Display Setting';
const d = defaultInputs;

export const inputConfig: InputConfig[] = [
  { id: 'BarBackCheck', type: 'int', title: 'Bar Back Check', defval: d.BarBackCheck, min: 1, group: G_CISD },
  { id: 'CISDVal', type: 'int', title: 'CISD Level Validity', defval: d.CISDVal, min: 1, group: G_CISD },
  { id: 'SwingPeriod', type: 'int', title: 'Swing Period', defval: d.SwingPeriod, min: 1, group: G_LIQ },
  { id: 'MaxSwingBack_Method', type: 'string', title: 'Max Swing Back Method', defval: d.MaxSwingBack_Method, options: ['All', 'Custom'], group: G_LIQ },
  { id: 'MaxSwingBack', type: 'int', title: 'Swing Swing Back', defval: d.MaxSwingBack, min: 1, group: G_LIQ },
  { id: 'CISD_AShow', type: 'bool', title: 'Show All CISD', defval: true, group: G_CISD_D },
  { id: 'CISD_HShow', type: 'bool', title: 'Show High CISD', defval: true, group: G_CISD_D, inline: 'CH' },
  { id: 'CISD_LShow', type: 'bool', title: 'Show Low CISD', defval: true, group: G_CISD_D, inline: 'CL' },
  { id: 'CISD_HNColor', type: 'color', title: 'Name', defval: d.CISD_HNColor, group: G_CISD_D, inline: 'CH' },
  { id: 'CISD_LNColor', type: 'color', title: 'Name', defval: d.CISD_LNColor, group: G_CISD_D, inline: 'CL' },
  { id: 'CISD_HLColor', type: 'color', title: 'Line', defval: d.CISD_HLColor, group: G_CISD_D, inline: 'CH' },
  { id: 'CISD_LLColor', type: 'color', title: 'Line', defval: d.CISD_LLColor, group: G_CISD_D, inline: 'CL' },
  { id: 'Liquidity_AShow', type: 'bool', title: 'Show All Liquidity', defval: true, group: G_LIQ_D },
  { id: 'Liquidity_HShow', type: 'bool', title: 'Show High Liquidity', defval: true, group: G_LIQ_D, inline: 'SH' },
  { id: 'Liquidity_LShow', type: 'bool', title: 'Show Low Liquidity', defval: true, group: G_LIQ_D, inline: 'SL' },
  { id: 'Liquidity_HNColor', type: 'color', title: 'Name', defval: d.Liquidity_HNColor, group: G_LIQ_D, inline: 'SH' },
  { id: 'Liquidity_LNColor', type: 'color', title: 'Name', defval: d.Liquidity_LNColor, group: G_LIQ_D, inline: 'SL' },
  { id: 'Liquidity_HLColor', type: 'color', title: 'Line', defval: d.Liquidity_HLColor, group: G_LIQ_D, inline: 'SH' },
  { id: 'Liquidity_LLColor', type: 'color', title: 'Line', defval: d.Liquidity_LLColor, group: G_LIQ_D, inline: 'SL' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'One Shot One Kill ICT [TradingFinder] Liquidity MMXM + CISD OTE',
  shortTitle: 'TFlab One Shot One Kill',
  overlay: true,
};

/** Pine float comparisons within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && b - a <= EPS;
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && a - b <= EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !eq(a, b);
/** math.max / math.min: na when an argument is na */
const max = (...v: number[]) => (v.some(Number.isNaN) ? NaN : Math.max(...v));
const min = (...v: number[]) => (v.some(Number.isNaN) ? NaN : Math.min(...v));

/** color.black of Pine version 5, also the default label text colour */
const BLACK = '#363A45';
const CLEAR = '#ffffff00';
const NA = 'transparent';
const Z = 100000000000000000;
const FIBS = [0.236, 0.382, 0.5, 0.618, 0.786];

/** Previous day high / low / time of each chart bar: request.security(syminfo.tickerid, "1D", HTF_Info(0)) */
function previousDay(bars: Bar[], chart?: ChartContext): { H: number[]; L: number[]; T: number[] } {
  const n = bars.length;
  const chartTf = chartTimeframe(bars, chart);
  let H: number[];
  let L: number[];
  let T: number[];
  if (chartTf === '' || timeframe.in_seconds('1D') === timeframe.in_seconds(chartTf)) {
    H = bars.map((b) => b.high);
    L = bars.map((b) => b.low);
    T = bars.map((b) => b.time);
  } else {
    if (timeframe.in_seconds('1D') < timeframe.in_seconds(chartTf)) {
      throw new Error(`One Shot One Kill ICT: the timeframe "1D" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
    }
    const { htf, group, latest } = higherTimeframeBars(bars, '1D', chart);
    H = mapToChart(htf.map((b) => b.high), group, latest, false, false);
    L = mapToChart(htf.map((b) => b.low), group, latest, false, false);
    T = mapToChart(htf.map((b) => b.time), group, latest, false, false);
  }
  // if barstate.isconfirmed: a last bar still open keeps the values of the bar before
  if (!lastBarConfirmedOf(chart) && n > 1) {
    H[n - 1] = H[n - 2];
    L[n - 1] = L[n - 2];
    T[n - 1] = T[n - 2];
  }
  return { H, L, T };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<OneShotOneKillIctLiquidityMmxmCisdOteInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  resetDrawings({ line: 500, label: 500 });
  const result: IndicatorResult = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
  };
  if (n === 0) return result;

  const ms = bars[0].time >= 1e12;
  const tms = (i: number) => (i >= 0 && i < n ? (ms ? bars[i].time : bars[i].time * 1000) : NaN);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const open = bars.map((b) => b.open);
  const close = bars.map((b) => b.close);
  const at = (arr: number[], i: number) => (i >= 0 && i < n ? arr[i] : NaN);
  const atr = A(ta.atr(bars, 55));
  const SP = cfg.SwingPeriod;
  const msh = A(ta.pivothigh(Series.fromArray(bars, high), SP, SP));
  const msl = A(ta.pivotlow(Series.fromArray(bars, low), SP, SP));
  const pd = previousDay(bars, chart);

  // PD drawing (var line / label)
  const pdhLine = varDrawing<Line>();
  const pdlLine = varDrawing<Line>();
  const pdhLabel = varDrawing<Label>();
  const pdlLabel = varDrawing<Label>();
  // Liquidity_Detector state
  const mshP: number[] = [];
  const mshI: number[] = [];
  const mshPermit: boolean[] = [];
  const aoiMsh: number[] = [];
  const mslP: number[] = [];
  const mslI: number[] = [];
  const mslPermit: boolean[] = [];
  const aoiMsl: number[] = [];
  const mshLine = varDrawing<Line>();
  const mslLine = varDrawing<Line>();
  const mshLabel = varDrawing<Label>();
  const mslLabel = varDrawing<Label>();
  // global var bool Permit_HReset_LQ / Permit_LReset_LQ = na (null) and the argument of the call on the bar before
  const lq: { h: boolean | null; l: boolean | null; hPrev: boolean | null; lPrev: boolean | null } = {
    h: null, l: null, hPrev: null, lPrev: null,
  };
  // CISDLevelDetector state
  let bullHigh = 0.0;
  let bullLow = 0.0;
  let bearHigh = 0.0;
  let bearLow = 0.0;
  let cisdP_L = 0.0;
  let cisdP_H = 0.0;
  let bullBar = 0;
  let bearBar = 0;
  let permitHReset = true;
  let permitLReset = true;
  const cisdLineL = varDrawing<Line>();
  const cisdLineH = varDrawing<Line>();
  const cisdNameH = varDrawing<Label>();
  const cisdNameL = varDrawing<Label>();
  const beLines = Array.from({ length: 7 }, () => varDrawing<Line>());
  const beLabels = Array.from({ length: 7 }, () => varDrawing<Label>());
  const buLines = Array.from({ length: 7 }, () => varDrawing<Line>());
  const buLabels = Array.from({ length: 7 }, () => varDrawing<Label>());
  // the global [Permit_HReset, Permit_LReset] of the bar before
  let gH: boolean | null = null;
  let gL: boolean | null = null;

  const x1Of = (l: Line | undefined) => (l ? line.get_x1(l) : NaN);

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const time = tms(i);

    // PD drawing
    if (ne(pd.T[i], at(pd.T, i - 1))) {
      const oldH = pdhLine.value;
      const oldL = pdlLine.value;
      const oldHL = pdhLabel.value;
      const oldLL = pdlLabel.value;
      pdhLine.value = line.new(time, pd.H[i], time, pd.H[i], 'bar_time', 'none', BLACK, 'solid', 3);
      pdlLine.value = line.new(time, pd.L[i], time, pd.L[i], 'bar_time', 'none', BLACK, 'solid', 3);
      pdhLabel.value = label.new(time, pd.H[i], 'PDH', 'bar_time', 'price', CLEAR, 'label_left', BLACK);
      pdlLabel.value = label.new(time, pd.L[i], 'PDL', 'bar_time', 'price', CLEAR, 'label_left', BLACK);
      if (oldH) line.delete(oldH);
      if (oldL) line.delete(oldL);
      if (oldHL) label.delete(oldHL);
      if (oldLL) label.delete(oldLL);
    } else {
      if (pdhLine.value) line.set_x2(pdhLine.value, time);
      if (pdlLine.value) line.set_x2(pdlLine.value, time);
      if (pdhLabel.value) label.set_x(pdhLabel.value, time);
      if (pdlLabel.value) label.set_x(pdlLabel.value, time);
    }

    // Liquidity_Detector(..., 'Real Liquidity', 2, 'Liquidity', ..., Permit_HReset_LQ, Permit_LReset_LQ)
    const realLiquidity = true;
    const considerable = false;
    const backToBreak = 2;
    let hAlert = false;
    let lAlert = false;
    if (!Number.isNaN(msh[i]) && msh[i] !== 0) {
      mshP.push(at(high, i - SP));
      mshI.push(tms(i - SP));
      mshPermit.push(true);
      aoiMsh.push(Z);
    }
    if (!Number.isNaN(msl[i]) && msl[i] !== 0) {
      mslP.push(at(low, i - SP));
      mslI.push(tms(i - SP));
      mslPermit.push(true);
      aoiMsl.push(Z);
    }
    const all = cfg.MaxSwingBack_Method === 'All';
    const hBack = all ? mshP.length : cfg.MaxSwingBack;
    const lBack = all ? mslP.length : cfg.MaxSwingBack;

    if (mshP.length > (all ? 1 : hBack) && i > 0) {
      for (let k = 1; k <= hBack; k++) {
        const j = mshP.length - k;
        const p = mshP[j];
        if (mshPermit[j]) {
          if (i <= aoiMsh[j] + backToBreak) {
            if ((lt(p, high[i]) && gt(p, close[i]) && aoiMsh[j] === Z && realLiquidity)
              || (gt(p, close[i]) && lt(p, at(close, i - 1)) && lt(close[i], at(open, i - 1)) && lt(low[i], at(low, i - 1)) && considerable)) {
              mshPermit[j] = false;
              if (cfg.Liquidity_AShow && cfg.Liquidity_HShow) {
                mshLine.value = line.new(mshI[j], p, time, p, 'bar_time', 'none', NA, 'dashed');
                mshLabel.value = label.new(i, high[i] + 1.15 * atr[i], 'Liquidity', 'bar_index', 'price', CLEAR, 'label_down', NA, 'small');
              }
              hAlert = true;
            }
          }
          if (lt(p, close[i]) && aoiMsh[j] === Z) aoiMsh[j] = i;
        }
      }
    }
    // if Permit_HReset[1] and Permit_HReset == false (the argument of the call on the bar before and on this bar)
    if (lq.hPrev === true && lq.h === false) {
      if (mshLine.value) line.set_color(mshLine.value, cfg.Liquidity_HLColor);
      if (mshLabel.value) label.set_textcolor(mshLabel.value, cfg.Liquidity_HNColor);
    }

    if (mslP.length > (all ? 1 : lBack) && i > 0) {
      for (let k = 1; k <= lBack; k++) {
        const j = mslP.length - k;
        const p = mslP[j];
        if (mslPermit[j]) {
          if (i <= aoiMsl[j] + backToBreak) {
            if ((gt(p, low[i]) && lt(p, close[i]) && aoiMsl[j] === Z && realLiquidity)
              || (lt(p, close[i]) && gt(p, at(close, i - 1)) && gt(close[i], at(open, i - 1)) && gt(high[i], at(high, i - 1)) && considerable)) {
              mslPermit[j] = false;
              if (cfg.Liquidity_AShow && cfg.Liquidity_LShow) {
                mslLine.value = line.new(mslI[j], p, time, p, 'bar_time', 'none', NA, 'dashed');
                mslLabel.value = label.new(i, low[i] - 1.15 * atr[i], 'Liquidity', 'bar_index', 'price', CLEAR, 'label_up', NA, 'small');
              }
              lAlert = true;
            }
          }
          if (gt(p, close[i]) && aoiMsl[j] === Z) aoiMsl[j] = i;
        }
      }
    }
    if (lq.lPrev === true && lq.l === false) {
      if (mslLine.value) line.set_color(mslLine.value, cfg.Liquidity_LLColor);
      if (mslLabel.value) label.set_textcolor(mslLabel.value, cfg.Liquidity_LNColor);
    }
    lq.hPrev = lq.h;
    lq.lPrev = lq.l;

    // CISDLevelDetector(H, L, BarBackCheck, 'CISD level', ...)
    const prevHReset = permitHReset;
    const prevLReset = permitLReset;
    const bbc = cfg.BarBackCheck;
    const body = (k: number) => at(close, i - k) - at(open, i - k);
    const o = (k: number) => at(open, i - k);
    const later = time + 20 * (time - tms(i - 1));

    if (hAlert) {
      bearHigh = max(high[i], at(high, i - 1), at(high, i - 2));
      bearLow = low[i];
      bearBar = time;
      let permitHSet = true;
      for (let k = 1; k <= bbc; k++) {
        if (lt(body(k), 0) && permitHSet) {
          permitHReset = true;
          const two = bbc > 1 && k > 1;
          cisdP_H = two ? min(o(k - 1), o(k - 2)) : o(k - 1);
          const idx = two ? (eq(min(o(k - 1), o(k - 2)), o(k - 2)) ? i - (k - 2) : i - (k - 1)) : i - (k - 1);
          if (cfg.CISD_AShow && cfg.CISD_HShow) {
            cisdLineH.value = line.new(idx, cisdP_H, i, cisdP_H, 'bar_index', 'none', NA, 'dotted');
            cisdNameH.value = label.new(idx + 1, at(low, idx) - atr[i] * 0.3, 'CISD level', 'bar_index', 'price', NA,
              'label_upper_left', NA, 'small');
          }
          permitHSet = false;
        }
      }
    }
    if (permitHReset) {
      const within = le(i - x1Of(cisdLineH.value), cfg.CISDVal);
      if (ge(close[i], cisdP_H) && within && cisdLineH.value) line.set_x2(cisdLineH.value, i + 1);
      if (le(close[i], cisdP_H) && within) {
        permitHReset = false;
        if (cisdLineH.value) line.set_color(cisdLineH.value, '#890505');
        if (cisdNameH.value) label.set_textcolor(cisdNameH.value, '#890505');
      }
    }
    if (le(i - x1Of(cisdLineH.value), cfg.CISDVal)) {
      bearHigh = gt(high[i], bearHigh) ? high[i] : bearHigh;
      bearBar = ge(high[i], bearHigh) ? time : bearBar;
      bearLow = lt(low[i], bearLow) ? low[i] : bearLow;
    }
    if (prevHReset && !permitHReset) {
      // Fibo(Bear_Low, Bear_High): levels from the low; '1' at the high, '0' at the low
      const lv = [bearHigh, ...FIBS.map((f) => bearLow + (bearHigh - bearLow) * f), bearLow];
      const names = ['1', '0.236', '0.382', '0.5', '0.618', '0.786', '0'];
      lv.forEach((y, k) => {
        beLines[k].value = line.new(bearBar, y, later, y, 'bar_time', 'none', BLACK, 'dashed');
      });
      lv.forEach((y, k) => {
        beLabels[k].value = label.new(later, y, names[k], 'bar_time', 'price', CLEAR, 'label_left', BLACK);
      });
    }

    if (lAlert) {
      bullHigh = high[i];
      bullLow = min(low[i], at(low, i - 1), at(low, i - 2));
      bullBar = time;
      let permitLSet = true;
      for (let k = 1; k <= bbc; k++) {
        if (gt(body(k), 0) && permitLSet) {
          permitLReset = true;
          const two = bbc > 1 && k > 1;
          cisdP_L = two ? max(o(k - 1), o(k - 2)) : o(k - 1);
          const idx = two ? (eq(max(o(k - 1), o(k - 2)), o(k - 2)) ? i - (k - 2) : i - (k - 1)) : i - (k - 1);
          if (cfg.CISD_AShow && cfg.CISD_LShow) {
            cisdLineL.value = line.new(idx, cisdP_L, i, cisdP_L, 'bar_index', 'none', NA, 'dotted');
            cisdNameL.value = label.new(idx + 1, at(high, idx) + atr[i] * 0.6, 'CISD level', 'bar_index', 'price', NA,
              'label_lower_right', NA, 'small');
          }
          permitLSet = false;
        }
      }
    }
    if (permitLReset) {
      const within = le(i - x1Of(cisdLineL.value), cfg.CISDVal);
      if (le(close[i], cisdP_L) && within && cisdLineL.value) line.set_x2(cisdLineL.value, i + 1);
      if (ge(close[i], cisdP_L) && within) {
        permitLReset = false;
        if (cisdLineL.value) line.set_color(cisdLineL.value, '#016004');
        if (cisdNameL.value) label.set_textcolor(cisdNameL.value, '#016004');
      }
    }
    if (le(i - x1Of(cisdLineL.value), cfg.CISDVal)) {
      bullHigh = gt(high[i], bullHigh) ? high[i] : bullHigh;
      bullLow = lt(low[i], bullLow) ? low[i] : bullLow;
      bullBar = le(low[i], bullLow) ? time : bullBar;
    }
    if (prevLReset && !permitLReset) {
      // Fibo(Bull_High, Bull_Low): levels from the high; '0' at the high, '1' at the low
      const lv = [bullHigh, ...FIBS.map((f) => bullHigh + (bullLow - bullHigh) * f), bullLow];
      const names = ['0', '0.236', '0.382', '0.5', '0.618', '0.786', '1'];
      lv.forEach((y, k) => {
        buLines[k].value = line.new(bullBar, y, later, y, 'bar_time', 'none', BLACK, 'dashed');
      });
      lv.forEach((y, k) => {
        buLabels[k].value = label.new(later, y, names[k], 'bar_time', 'price', CLEAR, 'label_left', BLACK);
      });
    }

    // if Permit_HReset != Permit_HReset[1]: Permit_HReset_LQ := Permit_HReset (false on the first bar: na history)
    if (gH !== null && permitHReset !== gH) lq.h = permitHReset;
    if (gL !== null && permitLReset !== gL) lq.l = permitLReset;
    gH = permitHReset;
    gL = permitLReset;
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars, ms ? 'ms' : 's');
  return { ...result, lines: out.lines ?? [], labels: out.labels ?? [] };
}

export const OneShotOneKillIctLiquidityMmxmCisdOte = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
