/**
 * Turtle Soup ICT Strategy [TradingFinder] FVG + CHoCH/CSD
 *
 * Higher timeframe liquidity sweeps ("turtle soup"): on the bars of the "Higher TimeFrame Levels" timeframe (60
 * minutes by default), swing highs and lows (pivots with "Swing Period" bars on each side) are kept as levels. A level
 * is swept when a bar of that timeframe trades through it (high above a swing high) but closes back on the other
 * side, before any close beyond it. A sweep draws a dashed line from the swing to the current bar with an "HTF
 * Liquidity Sweep" label and a triangle.
 *
 * After a high sweep, the market structure shift (MSS) level is the last chart pivot low (2 bars left, 1 right): a
 * dotted line and an "MSS" label; the line extends while the closes stay above it (for "MSS Length" bars), and a
 * close below it confirms the shift (a triangle). The bearish fair value gaps found since the sweep are kept (a gap
 * is dropped when a high goes above its distal edge); on the confirmation the latest one is drawn as a supply zone
 * (two dashed edges, a dotted middle line and a fill) that extends until the price reaches the mitigation level or
 * for "FVG Length" bars. Low sweeps are the mirror (demand zones).
 *
 * Higher timeframe: the values of each completed bar of the timeframe, built from the chart bars, on the chart bar
 * that completes it (`request.security` with gaps on); the chart timeframe itself when it is the same. A timeframe
 * below the chart timeframe (the default 60 minutes on daily bars) throws: the chart bars do not have that data.
 *
 * Imported libraries, written in this file: FVGDetectorLibrary (version 3, `FVGDetector`; its drawings are off in
 * this script) and OrderBlockDrawing_TradingFinder (version 4, `OBDrawing`; the breaker block part is off and has no
 * output). OrderBlockRefiner_TradingFinder is imported but not used.
 *
 * Reference: "Turtle Soup ICT Strategy [TradingFinder] FVG + CHoCH/CSD" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import {
  ta, timeframe, Series, line, label, linefill, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type Line, type Label, type Linefill, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

type FilterType = 'Very Aggressive' | 'Aggressive' | 'Defensive' | 'Very Defensive';
type MitigationLevel = 'Proximal' | '50 % OB' | 'Distal';

export interface TurtleSoupIctStrategyFvgChochCsdInputs {
  /** Higher TimeFrame Levels */
  TF: string;
  SwingPeriod: number;
  MaxSwingBack_Method: 'All' | 'Custom';
  MaxSwingBack: number;
  FVG_Length: number;
  MSS_Length: number;
  PFVGFilter: boolean;
  PFVGFilterType: FilterType;
  MLFVG: MitigationLevel;
  DFVGShow: boolean;
  DFVGColor: string;
  SFVGShow: boolean;
  SFVGColor: string;
  AShow: boolean;
  HShow: boolean;
  LShow: boolean;
  HNColor: string;
  LNColor: string;
  HLColor: string;
  LLColor: string;
  AShow_MSS: boolean;
  HShow_MSS: boolean;
  LShow_MSS: boolean;
  HNColor_MSS: string;
  LNColor_MSS: string;
  HLColor_MSS: string;
  LLColor_MSS: string;
}

export const defaultInputs: TurtleSoupIctStrategyFvgChochCsdInputs = {
  TF: '60',
  SwingPeriod: 50,
  MaxSwingBack_Method: 'All',
  MaxSwingBack: 100,
  FVG_Length: 120,
  MSS_Length: 80,
  PFVGFilter: false,
  PFVGFilterType: 'Defensive',
  MLFVG: 'Proximal',
  DFVGShow: true,
  // input colours with the alpha of the input (2 decimals): #2195f36c -> 0.42 (byte 107), #ff990070 -> 0.44
  DFVGColor: '#2195F36B',
  SFVGShow: true,
  SFVGColor: '#FF990070',
  AShow: true,
  HShow: true,
  LShow: true,
  HNColor: '#870505',
  LNColor: '#014F07',
  // #b90000b8 -> 0.72 (byte 184), #069206a7 -> 0.65 (byte 166)
  HLColor: '#B90000B8',
  LLColor: '#069206A6',
  AShow_MSS: true,
  HShow_MSS: true,
  LShow_MSS: true,
  HNColor_MSS: '#870505',
  LNColor_MSS: '#014F07',
  HLColor_MSS: '#B90000B8',
  LLColor_MSS: '#069206A6',
};

const G_LOG = 'Logical Setting';
const G_FVG = 'FVG Logical Setting';
const G_FVGD = 'FVG Display Setting';
const G_DIS = 'Display Setting';

export const inputConfig: InputConfig[] = [
  { id: 'TF', type: 'timeframe', title: 'Higher TimeFrame Levels', defval: '60', group: G_LOG },
  { id: 'SwingPeriod', type: 'int', title: 'Swing Period', defval: 50, min: 1, group: G_LOG },
  { id: 'MaxSwingBack_Method', type: 'string', title: 'Max Swing Back Method', defval: 'All', options: ['All', 'Custom'], group: G_LOG },
  { id: 'MaxSwingBack', type: 'int', title: 'Max Swing Back', defval: 100, min: 1, group: G_LOG },
  { id: 'FVG_Length', type: 'int', title: 'FVG Length', defval: 120, min: 1, group: G_LOG },
  { id: 'MSS_Length', type: 'int', title: 'MSS Length', defval: 80, min: 1, group: G_LOG },
  { id: 'PFVGFilter', type: 'bool', title: 'FVG Filter ............', defval: false, group: G_FVG, inline: 'FVG Filter' },
  {
    id: 'PFVGFilterType', type: 'string', title: '', defval: 'Defensive', options: ['Very Aggressive', 'Aggressive', 'Defensive', 'Very Defensive'],
    group: G_FVG, inline: 'FVG Filter',
    tooltip: 'If it is "On", this filter will filter "FVGs" based on the width of the Zone.From "Very Aggressive" to "Very Defensive" the width of the "FVG" decreases.',
  },
  {
    id: 'MLFVG', type: 'string', title: 'Mitigation Level FVG', defval: 'Proximal', options: ['Proximal', '50 % OB', 'Distal'],
    tooltip: 'Using this entry, you can determine which level the price reacts to in a FVG.', group: G_FVG,
  },
  { id: 'DFVGShow', type: 'bool', title: 'Demand FVG', defval: true, inline: 'DFVG', group: G_FVGD },
  { id: 'DFVGColor', type: 'color', title: '', defval: '#2195F36B', inline: 'DFVG', group: G_FVGD },
  { id: 'SFVGShow', type: 'bool', title: 'Supply FVG', defval: true, inline: 'SFVG', group: G_FVGD },
  { id: 'SFVGColor', type: 'color', title: '', defval: '#FF990070', inline: 'SFVG', group: G_FVGD },
  { id: 'AShow', type: 'bool', title: 'Show All HTF LvL', defval: true, group: G_DIS },
  { id: 'HShow', type: 'bool', title: 'Show High HTF LvL', defval: true, group: G_DIS, inline: 'H' },
  { id: 'LShow', type: 'bool', title: 'Show Low HTF LvL', defval: true, group: G_DIS, inline: 'L' },
  { id: 'HNColor', type: 'color', title: 'Name', defval: '#870505', group: G_DIS, inline: 'H' },
  { id: 'LNColor', type: 'color', title: 'Name', defval: '#014F07', group: G_DIS, inline: 'L' },
  { id: 'HLColor', type: 'color', title: 'Line', defval: '#B90000B8', group: G_DIS, inline: 'H' },
  { id: 'LLColor', type: 'color', title: 'Line', defval: '#069206A6', group: G_DIS, inline: 'L' },
  { id: 'AShow_MSS', type: 'bool', title: 'Show All MSS', defval: true, group: G_DIS },
  { id: 'HShow_MSS', type: 'bool', title: 'Show High MSS', defval: true, group: G_DIS, inline: 'HMSS' },
  { id: 'LShow_MSS', type: 'bool', title: 'Show Low MSS', defval: true, group: G_DIS, inline: 'LMSS' },
  { id: 'HNColor_MSS', type: 'color', title: 'Name', defval: '#870505', group: G_DIS, inline: 'HMSS' },
  { id: 'LNColor_MSS', type: 'color', title: 'Name', defval: '#014F07', group: G_DIS, inline: 'LMSS' },
  { id: 'HLColor_MSS', type: 'color', title: 'Line', defval: '#B90000B8', group: G_DIS, inline: 'HMSS' },
  { id: 'LLColor_MSS', type: 'color', title: 'Line', defval: '#069206A6', group: G_DIS, inline: 'LMSS' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Turtle Soup ICT Strategy [TradingFinder] FVG + CHoCH/CSD',
  shortTitle: 'TFlab Turtle Soup',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => b - a <= EPS;
const le = (a: number, b: number) => a - b <= EPS;

/** Text colour of a label without `textcolor` in a v5 script */
const V5_LABEL_TEXT = '#363A45';
/** HTF_Detector: `const int Z = 100000000000000000` */
const Z = 100000000000000000;

/** Outputs of HTF_Detector() on one bar of the higher timeframe */
interface HtfResult {
  hAlert: boolean;
  hIndex: number;
  hPrice: number;
  lAlert: boolean;
  lIndex: number;
  lPrice: number;
}

/**
 * HTF_Detector(SwingPeriod, MaxSwingBack_Method, MaxSwingBack) run on the bars of the timeframe: swing levels, swept
 * when a high (low) goes beyond the level and the close stays on this side before any close beyond it.
 */
function htfDetector(htf: Bar[], swingPeriod: number, method: 'All' | 'Custom', maxSwingBack: number): HtfResult[] {
  const msOf = (t: number) => (t < 1e12 ? t * 1000 : t);
  const ph = ta.pivothigh(new Series(htf, (b) => b.high), swingPeriod, swingPeriod).toArray();
  const pl = ta.pivotlow(new Series(htf, (b) => b.low), swingPeriod, swingPeriod).toArray();
  const mshP: number[] = [];
  const mshI: number[] = [];
  const mshPermit: boolean[] = [];
  const aoiMsh: number[] = [];
  const mslP: number[] = [];
  const mslI: number[] = [];
  const mslPermit: boolean[] = [];
  const aoiMsl: number[] = [];
  let hIndex = 0;
  let hPrice = 0.0;
  let lIndex = 0;
  let lPrice = 0.0;
  const out: HtfResult[] = [];
  const isPivot = (v: number | null | undefined) => v != null && !Number.isNaN(v) && v !== 0;

  for (let k = 0; k < htf.length; k++) {
    const { high, low, close } = htf[k];
    let hAlert = false;
    let lAlert = false;
    // if not (not MSH): a pivot (na and 0 are false)
    if (isPivot(ph[k])) {
      mshP.push(htf[k - swingPeriod].high);
      mshI.push(msOf(htf[k - swingPeriod].time));
      mshPermit.push(true);
      aoiMsh.push(Z);
    }
    if (isPivot(pl[k])) {
      mslP.push(htf[k - swingPeriod].low);
      mslI.push(msOf(htf[k - swingPeriod].time));
      mslPermit.push(true);
      aoiMsl.push(Z);
    }
    const hBack = method === 'All' ? mshP.length : maxSwingBack;
    const lBack = method === 'All' ? mslP.length : maxSwingBack;

    if (mshP.length > (method === 'All' ? 1 : hBack)) {
      for (let i = 1; i <= hBack; i++) {
        const j = mshP.length - i;
        if (mshPermit[j]) {
          if (k <= aoiMsh[j]) {
            if (lt(mshP[j], high) && gt(mshP[j], close) && aoiMsh[j] === Z) {
              mshPermit[j] = false;
              hIndex = mshI[j];
              hPrice = mshP[j];
              hAlert = true;
            }
          }
          if (lt(mshP[j], close) && aoiMsh[j] === Z) aoiMsh[j] = k;
        }
      }
    }
    if (mslP.length > (method === 'All' ? 1 : lBack)) {
      for (let i = 1; i <= lBack; i++) {
        const j = mslP.length - i;
        if (mslPermit[j]) {
          if (k <= aoiMsl[j]) {
            if (gt(mslP[j], low) && lt(mslP[j], close) && aoiMsl[j] === Z) {
              mslPermit[j] = false;
              lIndex = mslI[j];
              lPrice = mslP[j];
              lAlert = true;
            }
          }
          if (gt(mslP[j], close) && aoiMsl[j] === Z) aoiMsl[j] = k;
        }
      }
    }
    out.push({ hAlert, hIndex, hPrice, lAlert, lIndex, lPrice });
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TurtleSoupIctStrategyFvgChochCsdInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const msOf = (t: number) => (t < 1e12 ? t * 1000 : t);

  // request.security(syminfo.tickerid, TF, HTF_Detector(...), gaps = barmerge.gaps_on)
  const chartTf = chartTimeframe(bars, chart);
  const tf = cfg.TF.trim();
  let htfOf: (i: number) => number;
  let htfBars: Bar[] = bars;
  if (tf === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) {
    htfOf = (i) => i;
  } else if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`Turtle Soup ICT Strategy: the "Higher TimeFrame Levels" timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data (choose a timeframe equal to or above the chart timeframe)`);
  } else {
    const sec = higherTimeframeBars(bars, tf, chart);
    htfBars = sec.htf;
    // gaps on: a value only on the chart bar that completes a bar of the timeframe
    htfOf = (i) => (sec.latest[i] >= 0 && (i === 0 || sec.latest[i] !== sec.latest[i - 1]) ? sec.latest[i] : -1);
  }
  const htf = htfDetector(htfBars, cfg.SwingPeriod, cfg.MaxSwingBack_Method, cfg.MaxSwingBack);

  const atr200 = ta.atr(bars, 200).toArray();
  const atr55 = ta.atr(bars, 55).toArray();
  const ph21 = ta.pivothigh(new Series(bars, (b) => b.high), 2, 1).toArray();
  const pl21 = ta.pivotlow(new Series(bars, (b) => b.low), 2, 1).toArray();
  const num = (v: number | null | undefined) => (v == null ? NaN : v);

  // indicator(max_lines_count = 500, max_labels_count = 500)
  resetDrawings({ line: 500, label: 500 });

  // ---- global HTF values (var)
  let hAlertG = false;
  let hIndexG = NaN;
  let hPriceG = NaN;
  let lAlertG = false;
  let lIndexG = NaN;
  let lPriceG = NaN;
  let prevHIndexG = NaN;
  let prevLIndexG = NaN;

  // ---- Drawing(): var lines / labels, permits
  const mshLine = varDrawing<Line>();
  const mshLabel = varDrawing<Label>();
  const mshShap = varDrawing<Label>();
  const mslLine = varDrawing<Line>();
  const mslLabel = varDrawing<Label>();
  const mslShap = varDrawing<Label>();
  let hPermit = true;
  let lPermit = true;

  // ---- FVGDetector(): var values
  let ddfvg = 0.0;
  let dpfvg = 0.0;
  let barDfvg = 0;
  let sdfvg = 0.0;
  let spfvg = 0.0;
  let barSfvg = 0;

  // ---- MSSLevelDetector(): var state
  let mssLvlPL = 0.0;
  let mssLvlPH = 0.0;
  let mssLvlIL = 0;
  let mssLvlIH = 0;
  let permitHReset = true;
  let permitLReset = true;
  let prevPermitHReset: boolean | null = null;
  let prevPermitLReset: boolean | null = null;
  const mssLineL = varDrawing<Line>();
  const mssLineH = varDrawing<Line>();
  const mssNameH = varDrawing<Label>();
  const mssNameL = varDrawing<Label>();
  const mssShapH = varDrawing<Label>();
  const mssShapL = varDrawing<Label>();
  let bearFvg = 0;
  let bearFvgD = 0.0;
  let bearFvgP = 0.0;
  let bullFvg = 0;
  let bullFvgD = 0.0;
  let bullFvgP = 0.0;
  const fvgBearD: number[] = [];
  const fvgBearP: number[] = [];
  const fvgBearI: number[] = [];
  const fvgBullD: number[] = [];
  const fvgBullP: number[] = [];
  const fvgBullI: number[] = [];
  let hP = 0.0;
  let hI = 0;
  let lP = 0.0;
  let lI = 0;

  /** OrderBlockDrawing_TradingFinder: OBDrawing() with Show_BB = false (the breaker block part draws nothing) */
  const obDrawing = (demand: boolean, show: boolean, colorZone: string) => {
    let distalPrice = 0.0;
    let proximalPrice = 0.0;
    let check = true;
    const distal = varDrawing<Line>();
    const proximal = varDrawing<Line>();
    const line50 = varDrawing<Line>();
    const fill = varDrawing<Linefill>();
    return (i: number, trigger: boolean, distalIn: number, proximalIn: number, index: number) => {
      const { high, low } = bars[i];
      if (trigger) {
        distalPrice = distalIn;
        proximalPrice = proximalIn;
      }
      const ml = cfg.MLFVG === 'Proximal' ? proximalPrice : cfg.MLFVG === 'Distal' ? distalPrice
        : (proximalPrice + distalPrice) / 2;
      if (trigger && show) {
        distal.value = line.new(index, distalPrice, i, distalPrice, 'bar_index', undefined, '#0000008C', 'dashed', 1);
        proximal.value = line.new(index, proximalPrice, i, proximalPrice, 'bar_index', undefined, '#0000008C', 'dashed', 1);
        line50.value = line.new(index, (proximalPrice + distalPrice) / 2, i, (proximalPrice + distalPrice) / 2,
          'bar_index', undefined, '#000000', 'dotted', 1);
        fill.value = linefill.new(distal.value, proximal.value, colorZone);
      }
      if (check) {
        for (const l of [distal.value, proximal.value, line50.value]) if (l) line.set_x2(l, i + 1);
      }
      if ((demand ? lt(low, ml) : gt(high, ml)) || i - index >= cfg.FVG_Length) check = false;
      if (trigger) check = true;
    };
  };
  const demandDrawing = obDrawing(true, cfg.DFVGShow, cfg.DFVGColor);
  const supplyDrawing = obDrawing(false, cfg.SFVGShow, cfg.SFVGColor);

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const time = msOf(b.time);

    // ---- HTF values of this bar (na without a new bar of the timeframe)
    const k = htfOf(i);
    const res = k >= 0 ? htf[k] : null;
    if (res && res.hAlert) {
      hAlertG = true;
      hIndexG = res.hIndex;
      hPriceG = res.hPrice;
    } else {
      hAlertG = false;
    }
    if (res && res.lAlert) {
      lAlertG = true;
      lIndexG = res.lIndex;
      lPriceG = res.lPrice;
    } else {
      lAlertG = false;
    }

    // ---- Drawing(HAlert, H_Index_HTFLvL, H_Price_HTFLvL, LAlert, L_Index_HTFLvL, L_Price_HTFLvL)
    const atr = num(atr200[i]);
    if (hAlertG && hPermit) {
      hPermit = false;
      if (cfg.AShow && cfg.HShow) {
        mshLine.value = line.new(hIndexG, hPriceG, time, hPriceG, 'bar_time', undefined, cfg.HLColor, 'dashed');
        mshLabel.value = label.new(i, b.high + 1.15 * atr, 'HTF Liquidity Sweep', 'bar_index', 'price', '#FFFFFF00',
          'label_down', cfg.HNColor, 'small');
        mshShap.value = label.new(i, b.high + 1.05 * atr, '', 'bar_index', 'price', cfg.HNColor, 'triangledown',
          '#FFFFFF00', 'tiny');
      }
    }
    if (!hAlertG) hPermit = true;
    if (lAlertG && lPermit) {
      lPermit = false;
      if (cfg.AShow && cfg.LShow) {
        mslLine.value = line.new(lIndexG, lPriceG, time, lPriceG, 'bar_time', undefined, cfg.LLColor, 'dashed');
        mslLabel.value = label.new(i, b.low - 1.15 * atr, 'HTF Liquidity Sweep', 'bar_index', 'price', '#FFFFFF00',
          'label_up', cfg.LNColor, 'small');
        mslShap.value = label.new(i, b.low - 1.05 * atr, '', 'bar_index', 'price', cfg.LNColor, 'triangleup',
          '#FFFFFF00', 'tiny');
      }
    }
    if (!lAlertG) lPermit = true;

    // ---- FVG.FVGDetector(PFVGFilter ? 'On' : 'Off', PFVGFilterType, false, false)
    const h1 = i >= 1 ? bars[i - 1].high : NaN;
    const l1 = i >= 1 ? bars[i - 1].low : NaN;
    const o1 = i >= 1 ? bars[i - 1].open : NaN;
    const c1 = i >= 1 ? bars[i - 1].close : NaN;
    const h2 = i >= 2 ? bars[i - 2].high : NaN;
    const l2 = i >= 2 ? bars[i - 2].low : NaN;
    const o2 = i >= 2 ? bars[i - 2].open : NaN;
    const c2 = i >= 2 ? bars[i - 2].close : NaN;
    const a55 = num(atr55[i]);
    let dCond: boolean;
    let sCond: boolean;
    if (!cfg.PFVGFilter) {
      dCond = gt(b.low, h2);
      sCond = lt(b.high, l2);
    } else {
      const body1 = Math.abs((c1 - o1) / (h1 - l1));
      const t = cfg.PFVGFilterType;
      if (t === 'Very Aggressive') dCond = gt(b.low, h2) && gt(b.high, h1);
      else if (t === 'Aggressive') dCond = gt(b.low, h2) && ge(h1 - l1, 1.0 * a55) && gt(b.high, h1);
      else if (t === 'Defensive') {
        dCond = gt(b.low, h2) && ge(h1 - l1, 1.5 * a55) && gt(b.high, h1)
          && ((gt(c2 - o2, 0) && gt(c1 - o1, 0)) || gt(body1, 0.7));
      } else {
        dCond = gt(b.low, h2) && ge(h1 - l1, 1.5 * a55) && gt(b.high, h1)
          && (gt(c2 - o2, 0) && gt(c1 - o1, 0) && gt(body1, 0.7))
          && gt(Math.abs((c2 - o2) / (h2 - l2)), 0.35) && gt(Math.abs((b.close - b.open) / (b.high - b.low)), 0.35);
      }
      if (t === 'Very Aggressive') sCond = lt(b.high, l2) && gt(l1, b.low);
      else if (t === 'Aggressive') sCond = lt(b.high, l2) && ge(h1 - l1, 1.0 * a55) && gt(l1, b.low);
      else if (t === 'Defensive') {
        sCond = lt(b.high, l2) && ge(h1 - l1, 1.5 * a55) && gt(l1, b.low)
          && ((lt(c2 - o2, 0) && lt(c1 - o1, 0)) || gt(body1, 0.7));
      } else {
        sCond = lt(b.high, l2) && ge(h1 - l1, 1.5 * a55) && gt(l1, b.low)
          && (lt(c2 - o2, 0) && lt(c1 - o1, 0) && gt(body1, 0.7))
          && gt(Math.abs((c2 - o2) / (h2 - l2)), 0.35) && gt(Math.abs((b.close - b.open) / (b.high - b.low)), 0.35);
      }
    }
    if (dCond) {
      ddfvg = h2;
      dpfvg = b.low;
      barDfvg = i;
    }
    if (sCond) {
      sdfvg = l2;
      spfvg = b.high;
      barSfvg = i;
    }

    // ---- MSSLevelDetector(HAlert, LAlert, ..., 'MSS')
    const mssAtr = num(atr55[i]);
    if (!Number.isNaN(num(ph21[i])) && num(ph21[i]) !== 0) {
      hP = bars[i - 1].high;
      hI = i - 1;
    }
    if (!Number.isNaN(num(pl21[i])) && num(pl21[i]) !== 0) {
      lP = bars[i - 1].low;
      lI = i - 1;
    }

    if (hAlertG) {
      // H_Index_HTFLvL != H_Index_HTFLvL[1]: false when one of them is na
      if (!Number.isNaN(hIndexG) && !Number.isNaN(prevHIndexG) && hIndexG !== prevHIndexG) {
        permitHReset = true;
        mssLvlPH = lP;
        mssLvlIH = lI;
        if (cfg.AShow_MSS && cfg.HShow_MSS) {
          mssLineH.value = line.new(mssLvlIH, mssLvlPH, i, mssLvlPH, 'bar_index', undefined, cfg.HLColor_MSS, 'dotted');
          mssNameH.value = label.new(mssLvlIH + 1, bars[mssLvlIH].low - mssAtr * 0.3, 'MSS', 'bar_index', 'price',
            'transparent', 'label_upper_left', cfg.HNColor_MSS, 'small');
        }
      }
    }
    if (permitHReset) {
      if (sCond) {
        fvgBearI.push(barSfvg);
        fvgBearD.push(sdfvg);
        fvgBearP.push(spfvg);
      }
      if (fvgBearI.length > 0 && gt(b.high, fvgBearD[fvgBearI.length - 1])) {
        fvgBearI.pop();
        fvgBearD.pop();
        fvgBearP.pop();
      }
      if (ge(c1, mssLvlPH) && i - 1 - mssLvlIH <= cfg.MSS_Length) {
        if (mssLineH.value) line.set_x2(mssLineH.value, i + 1);
      }
      if (le(c1, mssLvlPH) && i - 1 - mssLvlIH <= cfg.MSS_Length) {
        permitHReset = false;
        if (cfg.AShow_MSS && cfg.HShow_MSS) {
          mssShapH.value = label.new(i, b.high + mssAtr * 0.6, '', 'bar_index', 'price', cfg.HNColor_MSS,
            'triangledown', V5_LABEL_TEXT, 'tiny');
        }
      }
    }

    if (lAlertG) {
      if (!Number.isNaN(lIndexG) && !Number.isNaN(prevLIndexG) && lIndexG !== prevLIndexG) {
        permitLReset = true;
        mssLvlPL = hP;
        mssLvlIL = hI;
        if (cfg.AShow_MSS && cfg.LShow_MSS) {
          mssLineL.value = line.new(mssLvlIL, mssLvlPL, i, mssLvlPL, 'bar_index', undefined, cfg.LLColor_MSS, 'dotted');
          mssNameL.value = label.new(mssLvlIL + 1, bars[mssLvlIL].high + mssAtr * 0.6, 'MSS', 'bar_index', 'price',
            'transparent', 'label_lower_right', cfg.LNColor_MSS, 'small');
        }
      }
    }
    if (permitLReset) {
      if (dCond) {
        fvgBullI.push(barDfvg);
        fvgBullD.push(ddfvg);
        fvgBullP.push(dpfvg);
      }
      if (fvgBullI.length > 0 && lt(b.low, fvgBullD[fvgBullI.length - 1])) {
        fvgBullI.pop();
        fvgBullD.pop();
        fvgBullP.pop();
      }
      if (le(b.close, mssLvlPL) && i - mssLvlIL <= cfg.MSS_Length) {
        if (mssLineL.value) line.set_x2(mssLineL.value, i + 1);
      }
      if (ge(b.close, mssLvlPL) && i - mssLvlIL <= cfg.MSS_Length) {
        permitLReset = false;
        if (cfg.AShow_MSS && cfg.LShow_MSS) {
          mssShapL.value = label.new(i, b.low - mssAtr * 0.6, '', 'bar_index', 'price', cfg.LNColor_MSS,
            'triangleup', V5_LABEL_TEXT, 'tiny');
        }
      }
    }

    // Set FVG
    if (fvgBullI.length > 0) {
      bullFvg = fvgBullI[fvgBullI.length - 1];
      bullFvgD = fvgBullD[fvgBullD.length - 1];
      bullFvgP = fvgBullP[fvgBullP.length - 1];
    }
    if (fvgBearI.length > 0) {
      bearFvg = fvgBearI[fvgBearI.length - 1];
      bearFvgD = fvgBearD[fvgBearD.length - 1];
      bearFvgP = fvgBearP[fvgBearP.length - 1];
    }
    let fvgBearTrigger = false;
    let fvgBullTrigger = false;
    if (prevPermitHReset === true && !permitHReset) fvgBearTrigger = fvgBearI.length > 0 && bearFvg !== 0;
    if (prevPermitLReset === true && !permitLReset) fvgBullTrigger = fvgBullI.length > 0 && bullFvg !== 0;
    // Reset FVG
    if (hAlertG) {
      bearFvg = 0;
      bearFvgD = 0.0;
      bearFvgP = 0.0;
      fvgBearD.length = 0;
      fvgBearP.length = 0;
      fvgBearI.length = 0;
    }
    if (lAlertG) {
      fvgBullD.length = 0;
      fvgBullP.length = 0;
      fvgBullI.length = 0;
      bullFvg = 0;
      bullFvgD = 0.0;
      bullFvgP = 0.0;
    }
    prevPermitHReset = permitHReset;
    prevPermitLReset = permitLReset;
    prevHIndexG = hIndexG;
    prevLIndexG = lIndexG;

    // ---- Drawing.OBDrawing of the demand and supply gaps (called only within 500 bars of the gap)
    if (i - bullFvg < 500) demandDrawing(i, fvgBullTrigger, bullFvgD, bullFvgP, bullFvg);
    if (i - bearFvg < 500) supplyDrawing(i, fvgBearTrigger, bearFvgD, bearFvgP, bearFvg);
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const TurtleSoupIctStrategyFvgChochCsd = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
