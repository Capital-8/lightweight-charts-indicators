/**
 * Trading Toolkit (Michaël van de Poppe) [BigBeluga]
 *
 * A pane with the RSI of the close (length 24) between the oversold / overbought levels (30 / 70, filled), a 50
 * level, and gradient fills below the oversold level (red) and above the overbought level (lime).
 *
 * Support & Resistance (price pane): a pivot high / low of `Support/Resistance` bars on each side whose pivot candle
 * is large (its range is more than 1 standard deviation of the 200-bar range: dashed line; more than 1.5: solid)
 * gives a level line (extended right) and a zone box of +- 0.3 ATR(200) around it. The box of a level runs 10 bars
 * past the current bar; a bar whose high falls back under the level (high[1] above it) or whose low rises over it
 * (low[1] below it) moves the box to that bar (5 bars wide, the resistance or support colour). At most 6 levels are
 * kept (one is removed per bar when there are more).
 *
 * Divergence (hidden by default): regular bullish / bearish RSI divergences on pivots of the RSI (`Divergence` bars
 * on each side, 5 to 60 bars from the previous pivot), drawn on the pivot bars of the RSI and of the price.
 *
 * Correction (off by default): a box from the last bar where the 15-bar rate of change crossed 0 (at its high) to
 * the next bar, down to the low of a bar where the rate of change crosses under -`Correction %`. Boxes with the same
 * left side as the next box of the list (the last one: the first) are deleted, and so are boxes of 10 bars or more.
 *
 * `chart.fg_color` (RSI, levels, level lines) comes from the chart context (foregroundColorOf; a dark theme value
 * without it).
 *
 * Reference: "Comprehensive Trading Toolkit [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, color, Series, line, box, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type Box,
  type Line,
} from 'oakscriptjs';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface ComprehensiveTradingToolkitInputs {
  /** Show the support / resistance levels */
  showSr: boolean;
  /** Support/Resistance: pivot bars on each side */
  len: number;
  /** Support zone colour */
  bulCol: string;
  /** Resistance zone colour */
  berCol: string;
  /** RSI length */
  length: number;
  /** Oversold level */
  overs: number;
  /** Overbought level */
  overb: number;
  /** Show the divergences */
  showDiv: boolean;
  /** Divergence: pivot bars on each side */
  divLen: number;
  /** Bullish divergence colour */
  bullCol: string;
  /** Bearish divergence colour */
  bearCol: string;
  /** Show the correction boxes */
  showCor: boolean;
  /** Correction % */
  correction: number;
  /** Correction box colour */
  corrCol: string;
}

export const defaultInputs: ComprehensiveTradingToolkitInputs = {
  showSr: true,
  len: 30,
  bulCol: 'rgba(0, 230, 119, 0.3)',
  berCol: 'rgba(255, 82, 82, 0.3)',
  length: 24,
  overs: 30,
  overb: 70,
  showDiv: false,
  divLen: 10,
  bullCol: 'rgba(0, 230, 211, 0.8)',
  bearCol: 'rgba(255, 82, 82, 0.8)',
  showCor: false,
  correction: 5,
  corrCol: 'rgba(33, 149, 243, 0.18)',
};

export const inputConfig: InputConfig[] = [
  { id: 'showSr', type: 'bool', title: '', defval: true, group: 'Support & Resistance', inline: 'sr' },
  { id: 'len', type: 'int', title: 'Support/Resistance', defval: 30, group: 'Support & Resistance', inline: 'sr' },
  { id: 'bulCol', type: 'color', title: '', defval: 'rgba(0, 230, 119, 0.3)', inline: 'sr' },
  { id: 'berCol', type: 'color', title: '', defval: 'rgba(255, 82, 82, 0.3)', inline: 'sr' },
  { id: 'length', type: 'int', title: 'RSI', defval: 24, group: 'Rsi', inline: 'lvl' },
  { id: 'overs', type: 'int', title: 'OS/OB', defval: 30, group: 'Rsi', inline: 'lvl' },
  { id: 'overb', type: 'int', title: '', defval: 70, group: 'Rsi', inline: 'lvl' },
  { id: 'showDiv', type: 'bool', title: '', defval: false, inline: 'div' },
  { id: 'divLen', type: 'int', title: 'Divergence', defval: 10, inline: 'div' },
  { id: 'bullCol', type: 'color', title: '', defval: 'rgba(0, 230, 211, 0.8)', inline: 'div' },
  { id: 'bearCol', type: 'color', title: '', defval: 'rgba(255, 82, 82, 0.8)', inline: 'div' },
  { id: 'showCor', type: 'bool', title: '', defval: false, group: 'correction', inline: 'cor' },
  { id: 'correction', type: 'int', title: 'Correction %', defval: 5, group: 'correction', inline: 'cor' },
  { id: 'corrCol', type: 'color', title: '', defval: 'rgba(33, 149, 243, 0.18)', group: 'correction', inline: 'cor' },
];

/** Chart foreground colour without a chart context (the RSI and the levels follow the chart context) */
const FG = foregroundColorOf();

// The divergence plots have display = show_div ? display.pane : display.none
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: FG, lineWidth: 1 },
  { id: 'plot1', title: 'Overbought Anchor', color: FG, lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Oversold Anchor', color: FG, lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Regular Bullish', color: '#00E6D3', lineWidth: 2, visible: 'showDiv' },
  { id: 'plot4', title: 'Regular Bearish', color: '#FF5252', lineWidth: 2, visible: 'showDiv' },
  { id: 'plot5', title: 'Regular Bullish', color: '#00E6D3', lineWidth: 1, visible: 'showDiv', forceOverlay: true },
  { id: 'plot6', title: 'Regular Bearish', color: '#FF5252', lineWidth: 1, visible: 'showDiv', forceOverlay: true },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_os', price: 30, title: 'Oversold', color: FG, linestyle: 'dashed' },
  { id: 'hline_ob', price: 70, title: 'OverBought', color: FG, linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'Level', color: String(color.new(FG, 50)), linestyle: 'dashed' },
];

/** fill(h1, h2, color.new(m_col, 85)) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_levels', plot1: 'hline_ob', plot2: 'hline_os', color: String(color.new(FG, 85)) },
];

export const metadata = {
  title: 'Trading Toolkit (Michaël van de Poppe) [BigBeluga]',
  shortTitle: 'Trading Toolkit (Michaël van de Poppe) [BigBeluga]',
  overlay: false,
};

/** indicator(max_boxes_count = 500); lines keep the default 50 */
const MAX_BOXES = 500;
const MAX_LINES = 50;
/** Divergence: bars between two pivots */
const RANGE_UPPER = 60;
const RANGE_LOWER = 5;
/** Box text colour of Pine version 6 (no text is drawn) */
const BOX_TEXT = '#FFFFFF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

type Point = { time: number; value: number; color: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<ComprehensiveTradingToolkitInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const interval = barInterval(bars);
  const mCol = foregroundColorOf(chart);
  const noneColor = String(color.new(color.white, 100));
  const close = new Series(bars, (b) => b.close);
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  const rsi = A(ta.rsi(close, cfg.length));

  // rsi_divergence()
  const lb = cfg.divLen;
  const rsiS = Series.fromArray(bars, rsi);
  const pl = A(ta.pivotlow(rsiS, lb, lb));
  const ph = A(ta.pivothigh(rsiS, lb, lb));
  const back = (a: number[], i: number) => (i - lb >= 0 ? a[i - lb] : NaN);
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const rsiLBR: number[] = new Array(n).fill(NaN);
  // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
  const plRsi: number[] = [];
  const plLow: number[] = [];
  const phRsi: number[] = [];
  const phHigh: number[] = [];
  let bsPl = NaN; // ta.barssince(plFound[1])
  let bsPh = NaN; // ta.barssince(phFound[1])
  for (let i = 0; i < n; i++) {
    const r = back(rsi, i);
    rsiLBR[i] = r;
    bsPl = i > 0 && plFound[i - 1] ? 0 : isNaN(bsPl) ? NaN : bsPl + 1;
    bsPh = i > 0 && phFound[i - 1] ? 0 : isNaN(bsPh) ? NaN : bsPh + 1;
    const inRangePl = RANGE_LOWER <= bsPl && bsPl <= RANGE_UPPER;
    const inRangePh = RANGE_LOWER <= bsPh && bsPh <= RANGE_UPPER;

    plFound[i] = !isNaN(pl[i]);
    const lowLBR = back(lows, i);
    if (plFound[i]) {
      plRsi.push(r);
      plLow.push(lowLBR);
    }
    const rsiHL = gt(r, plRsi.length >= 2 ? plRsi[plRsi.length - 2] : NaN) && inRangePl;
    const priceLL = lt(lowLBR, plLow.length >= 2 ? plLow[plLow.length - 2] : NaN);
    bullCond[i] = priceLL && rsiHL && plFound[i];

    phFound[i] = !isNaN(ph[i]);
    const highLBR = back(highs, i);
    if (phFound[i]) {
      phRsi.push(r);
      phHigh.push(highLBR);
    }
    const rsiLH = lt(r, phRsi.length >= 2 ? phRsi[phRsi.length - 2] : NaN) && inRangePh;
    const priceHH = gt(highLBR, phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN);
    bearCond[i] = priceHH && rsiLH && phFound[i];
  }

  resetDrawings({ line: MAX_LINES, box: MAX_BOXES });

  // draw_levels()
  const len = cfg.len;
  const PH = A(ta.pivothigh(high, len, len));
  const PL = A(ta.pivotlow(low, len, len));
  const atr = A(ta.atr(bars, 200)).map((v) => v * 0.3);
  const range = bars.map((b) => b.high - b.low);
  const rangeStdev = A(ta.stdev(Series.fromArray(bars, range), 200));
  const candleSize = range.map((r, i) => r / rangeStdev[i]);
  const levelLines: Line[] = [];
  const levelBoxes: Box[] = [];
  const drawLevels = (i: number) => {
    const size = i >= len ? candleSize[i - len] : NaN;
    const bigCandle = gt(size, 1);
    const style = gt(size, 1.5) ? 'solid' : 'dashed';
    const Atr = atr[i];
    if (bigCandle) {
      if (!isNaN(PH[i])) {
        levelLines.push(line.new(i - len, PH[i], i, PH[i], 'bar_index', 'right', mCol, style, 1, true));
        levelBoxes.push(box.new(i - len, PH[i] + Atr, i + 5, PH[i] - Atr, 'transparent', 0, undefined, undefined,
          undefined, cfg.berCol, undefined, undefined, BOX_TEXT, undefined, undefined, undefined, undefined, true));
      }
      if (!isNaN(PL[i])) {
        levelLines.push(line.new(i - len, PL[i], i, PL[i], 'bar_index', 'right', mCol, style, 1, true));
        levelBoxes.push(box.new(i - len, PL[i] + Atr, i + 5, PL[i] - Atr, 'transparent', 0, undefined, undefined,
          undefined, cfg.bulCol, undefined, undefined, BOX_TEXT, undefined, undefined, undefined, undefined, true));
      }
    }
    for (const lineId of [...levelLines]) {
      const level = line.get_y1(lineId);
      const boxId = levelBoxes[levelLines.indexOf(lineId)];
      box.set_right(boxId, i + 10);
      if (i > 0 && gt(highs[i - 1], level) && lt(highs[i], level)) {
        box.set_lefttop(boxId, i, level + Atr);
        box.set_rightbottom(boxId, i + 5, level - Atr);
        box.set_bgcolor(boxId, cfg.berCol);
      }
      if (i > 0 && lt(lows[i - 1], level) && gt(lows[i], level)) {
        box.set_lefttop(boxId, i, level + Atr);
        box.set_rightbottom(boxId, i + 5, level - Atr);
        box.set_bgcolor(boxId, cfg.bulCol);
      }
    }
    if (levelLines.length > 6) {
      line.delete(levelLines.shift()!);
      box.delete(levelBoxes.shift()!);
    }
  };

  // correction(correction)
  const roc = ta.roc(close, 15);
  const rocCross = cfg.showCor ? ta.cross(roc, 0).toArray() : [];
  const rocUnder = cfg.showCor ? ta.crossunder(roc, -cfg.correction).toArray() : [];
  const corrBoxes: Box[] = [];
  let rocIndx = NaN;
  let rocSrc = NaN;
  const correctionBoxes = (i: number) => {
    if (rocCross[i]) {
      rocIndx = i;
      rocSrc = highs[i];
    }
    if (rocUnder[i]) {
      corrBoxes.push(box.new(rocIndx, rocSrc, i + 1, lows[i], 'transparent', 0, undefined, undefined, undefined,
        cfg.corrCol, undefined, undefined, BOX_TEXT, undefined, undefined, undefined, undefined, true));
    }
    if (corrBoxes.length > 1) {
      for (let k = 0; k <= corrBoxes.length - 1; k++) {
        const boxId = corrBoxes[k];
        const boxId1 = corrBoxes[k < corrBoxes.length - 1 ? k + 1 : 0];
        // box_id.get_left() == box_id_1.get_left() (Pine ==: within 1e-10, na is never equal)
        if (ge(box.get_left(boxId), box.get_left(boxId1)) && le(box.get_left(boxId), box.get_left(boxId1))) {
          box.delete(boxId1);
        }
        if (ge(box.get_right(boxId) - box.get_left(boxId), 10)) box.delete(boxId);
      }
    }
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    if (cfg.showSr) drawLevels(i);
    if (cfg.showCor) correctionBoxes(i);
  }
  setDrawingBar(null);

  const T = (i: number) => barTime(bars, i, interval);
  // plot(..., offset = -lookbackRight): the value of bar i is drawn on bar i - lookbackRight
  const divPlot = (found: boolean[], value: (i: number) => number, cond: boolean[], col: string): Point[] => {
    const out: Point[] = [];
    for (let i = lb; i < n; i++) {
      out.push({ time: T(i - lb), value: found[i] ? value(i) : NaN, color: cond[i] ? col : noneColor });
    }
    return out;
  };

  const red = '#F23645';
  const lime = '#00E676';
  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: rsi[i], color: mCol })),
      // p7 = plot(overb, display = display.none), p3 = plot(overs, display = display.none): fill anchors
      plot1: bars.map((b) => ({ time: b.time, value: cfg.overb })),
      plot2: bars.map((b) => ({ time: b.time, value: cfg.overs })),
      plot3: divPlot(plFound, (i) => rsiLBR[i], bullCond, cfg.bullCol),
      plot4: divPlot(phFound, (i) => rsiLBR[i], bearCond, cfg.bearCol),
      plot5: divPlot(plFound, (i) => back(lows, i), bullCond, cfg.bullCol),
      plot6: divPlot(phFound, (i) => back(highs, i), bearCond, cfg.bearCol),
    },
    hlines: [
      { value: cfg.overs, options: { title: 'Oversold', color: mCol, linestyle: 'dashed' } },
      { value: cfg.overb, options: { title: 'OverBought', color: mCol, linestyle: 'dashed' } },
      { value: 50, options: { title: 'Level', color: String(color.new(mCol, 50)), linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_ob', plot2: 'hline_os', colors: new Array<string>(n).fill(String(color.new(mCol, 85))) },
      // fill(p3, pr, overs, 20, na, rsi < overs ? color.red : na)
      { plot1: 'plot2', plot2: 'plot0',
        gradient: { topValue: new Array(n).fill(cfg.overs), bottomValue: new Array(n).fill(20),
          topColor: new Array(n).fill(null), bottomColor: rsi.map((r) => (lt(r, cfg.overs) ? red : null)) } },
      // fill(p7, pr, overb, 85, na, rsi > overb ? color.lime : na)
      { plot1: 'plot1', plot2: 'plot0',
        gradient: { topValue: new Array(n).fill(cfg.overb), bottomValue: new Array(n).fill(85),
          topColor: new Array(n).fill(null), bottomColor: rsi.map((r) => (gt(r, cfg.overb) ? lime : null)) } },
    ],
    lines: out.lines ?? [],
    boxes: out.boxes ?? [],
  };
}

export const ComprehensiveTradingToolkit = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig, fillConfig,
};
