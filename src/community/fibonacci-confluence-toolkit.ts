/**
 * Fibonacci Confluence Toolkit [LuxAlgo]
 *
 * Market structure on three levels: a short-term swing is a bar whose low (high) is below (above) its two
 * neighbours; an intermediate swing is a short-term swing that is lower (higher) than the swings around it; a
 * long-term swing is the same among the intermediate swings. A close through the last long-term swing against the
 * current structure is a change of character (CHoCH): the script draws a line at the broken level with a "CHoCH"
 * text, and an area of interest (box) between the broken level and the extreme reached before the break, extended
 * while the price stays inside the range.
 *
 * After a CHoCH, the next long-term swing gives the range of a Fibonacci retracement: a dashed reference line and
 * one line per enabled level (0, 0.236, 0.382, 0.5, 0.618, 0.65, 0.786, 1) with a price label, extended while the
 * area of interest is alive. Engulfing candle patterns are marked with a triangle label ("Structure Based": only
 * while an area of interest is alive and the close is inside it). Optional labels mark the long-term swings.
 *
 * At most 500 lines, 500 labels and 500 boxes are kept. Every short-term swing has a label without colour (it only
 * shows when it becomes a long-term swing and "Swing Levels" is on): these labels are part of the output.
 *
 * A disabled structure side is drawn in the chart background colour. A port has no chart theme: it uses the colour of
 * the reference run (dark theme, #0F0F0F). Price labels use a price tick of 0.01 (the port does not get the tick of
 * the symbol).
 *
 * Reference: "Fibonacci Confluence Toolkit [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, str, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

type SizeText = 'Tiny' | 'Small' | 'Normal' | 'Large';

export interface FibonacciConfluenceToolkitInputs {
  bullCHoCHs: boolean;
  ltBullMSColor: string;
  bearCHoCHs: boolean;
  ltBearMSColor: string;
  areaOfInt: 'Enabled' | 'Disabled';
  ltMSLineStyle: 'Solid' | 'Dashed' | 'Dotted';
  ltMSLineWidth: number;
  show0: boolean;
  value0: number;
  show0236: boolean;
  value0236: number;
  show0382: boolean;
  value0382: number;
  show05: boolean;
  value05: number;
  show0618: boolean;
  value0618: number;
  show065: boolean;
  value065: number;
  show0786: boolean;
  value0786: number;
  show1: boolean;
  value1: number;
  ltSwings: '◉' | '△▽' | 'H/L' | 'Disabled';
  ltSwingsSZ: SizeText;
  engulf: 'All' | 'Structure Based' | 'Disabled';
  engulfSZ: SizeText;
}

export const defaultInputs: FibonacciConfluenceToolkitInputs = {
  bullCHoCHs: true,
  ltBullMSColor: '#089981',
  bearCHoCHs: true,
  ltBearMSColor: '#f23645',
  areaOfInt: 'Enabled',
  ltMSLineStyle: 'Solid',
  ltMSLineWidth: 2,
  show0: true,
  value0: 0,
  show0236: false,
  value0236: 0.236,
  show0382: true,
  value0382: 0.382,
  show05: true,
  value05: 0.5,
  show0618: true,
  value0618: 0.618,
  show065: false,
  value065: 0.65,
  show0786: true,
  value0786: 0.786,
  show1: true,
  value1: 1,
  ltSwings: 'Disabled',
  ltSwingsSZ: 'Tiny',
  engulf: 'Structure Based',
  engulfSZ: 'Tiny',
};

const G_MS = 'Market Patterns';
const G_FIB = 'Retracement Levels';
const G_SW = 'Swing Levels & Engulfing Patterns';
const SIZES = ['Tiny', 'Small', 'Normal', 'Large'];

export const inputConfig: InputConfig[] = [
  { id: 'bullCHoCHs', type: 'bool', title: 'Bullish Structures', defval: true, inline: 'MS', group: G_MS },
  { id: 'ltBullMSColor', type: 'color', title: '', defval: '#089981', inline: 'MS', group: G_MS },
  { id: 'bearCHoCHs', type: 'bool', title: 'Bearish Structures', defval: true, inline: 'MS1', group: G_MS },
  { id: 'ltBearMSColor', type: 'color', title: '', defval: '#f23645', inline: 'MS1', group: G_MS },
  { id: 'areaOfInt', type: 'string', title: 'Highlight Area of Interest', defval: 'Enabled', options: ['Enabled', 'Disabled'], group: G_MS },
  { id: 'ltMSLineStyle', type: 'string', title: 'CHoCH Line', defval: 'Solid', options: ['Solid', 'Dashed', 'Dotted'], inline: 'LN', group: G_MS },
  { id: 'ltMSLineWidth', type: 'int', title: 'Width', defval: 2, min: 1, inline: 'LN', group: G_MS },
  { id: 'show0', type: 'bool', title: '', defval: true, inline: 'Level0', group: G_FIB },
  { id: 'value0', type: 'float', title: '', defval: 0, inline: 'Level0', group: G_FIB },
  { id: 'show0236', type: 'bool', title: '', defval: false, inline: 'Level0', group: G_FIB },
  { id: 'value0236', type: 'float', title: '', defval: 0.236, inline: 'Level0', group: G_FIB },
  { id: 'show0382', type: 'bool', title: '', defval: true, inline: 'Level1', group: G_FIB },
  { id: 'value0382', type: 'float', title: '', defval: 0.382, inline: 'Level1', group: G_FIB },
  { id: 'show05', type: 'bool', title: '', defval: true, inline: 'Level1', group: G_FIB },
  { id: 'value05', type: 'float', title: '', defval: 0.5, inline: 'Level1', group: G_FIB },
  { id: 'show0618', type: 'bool', title: '', defval: true, inline: 'Level2', group: G_FIB },
  { id: 'value0618', type: 'float', title: '', defval: 0.618, inline: 'Level2', group: G_FIB },
  { id: 'show065', type: 'bool', title: '', defval: false, inline: 'Level2', group: G_FIB },
  { id: 'value065', type: 'float', title: '', defval: 0.65, inline: 'Level2', group: G_FIB },
  { id: 'show0786', type: 'bool', title: '', defval: true, inline: 'Level3', group: G_FIB },
  { id: 'value0786', type: 'float', title: '', defval: 0.786, inline: 'Level3', group: G_FIB },
  { id: 'show1', type: 'bool', title: '', defval: true, inline: 'Level3', group: G_FIB },
  { id: 'value1', type: 'float', title: '', defval: 1, inline: 'Level3', group: G_FIB },
  { id: 'ltSwings', type: 'string', title: 'Swing Levels', defval: 'Disabled', options: ['◉', '△▽', 'H/L', 'Disabled'], inline: 'NA', group: G_SW },
  { id: 'ltSwingsSZ', type: 'string', title: 'Size', defval: 'Tiny', options: SIZES, inline: 'NA', group: G_SW },
  { id: 'engulf', type: 'string', title: 'Engulfing Candle Patterns', defval: 'Structure Based', options: ['All', 'Structure Based', 'Disabled'], inline: 'NA1', group: G_SW },
  { id: 'engulfSZ', type: 'string', title: '', defval: 'Tiny', options: SIZES, inline: 'NA1', group: G_SW },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Fibonacci Confluence Toolkit [LuxAlgo]',
  shortTitle: 'LuxAlgo - Fibonacci Confluence Toolkit',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_boxes_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;
/** chart.bg_color of the reference run (dark theme) */
const CHART_BG = '#0F0F0F';
/** syminfo.mintick is not available to the port (Bar has no symbol info) */
const MINTICK = 0.01;

const TT_BEAR = 'A bearish engulfing pattern is a two-candle reversal pattern that often signals a potential shift from an uptrend to a downtrend.';
const TT_BULL = 'A bullish engulfing pattern is a two-candle reversal pattern that typically signals a potential shift from a downtrend to an uptrend in price.';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

type Style = 'solid' | 'dashed' | 'dotted';
type Size = 'tiny' | 'small' | 'normal' | 'large';

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string | null;
  style: Style;
  width: number;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string | null;
  style: 'label_down' | 'label_up' | 'label_left';
  size: Size;
  tooltip: string;
  deleted: boolean;
}
interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string | null;
  text: string;
  textColor: string | null;
  textVAlign: 'top' | 'bottom' | null;
  deleted: boolean;
}

/** type ICTMS (fields are na until set) */
interface Structure {
  lastPrice: number;
  midPrice: number;
  prevPrice: number;
  lastIndex: number;
  midIndex: number;
  prevIndex: number;
  lastLabel: Lb | null;
  midLabel: Lb | null;
  prevLabel: Lb | null;
  isCrossed: boolean;
  isCHoCH: boolean;
  measure: boolean;
  lwest: number;
  hghst: number;
  zone: Bx | null;
}
const structure = (): Structure => ({
  lastPrice: NaN, midPrice: NaN, prevPrice: NaN, lastIndex: NaN, midIndex: NaN, prevIndex: NaN,
  lastLabel: null, midLabel: null, prevLabel: null, isCrossed: false, isCHoCH: false, measure: false,
  lwest: NaN, hghst: NaN, zone: null,
});

/** type FIB: the level lines and labels by level key, plus the reference line */
interface Fibs {
  lines: Record<string, Ln | null>;
  labels: Record<string, Lb | null>;
}

const textSize = (s: string): Size => (s === 'Tiny' ? 'tiny' : s === 'Small' ? 'small' : s === 'Normal' ? 'normal' : 'large');
const lineStyle = (s: string): Style => (s === 'Dotted' ? 'dotted' : s === 'Dashed' ? 'dashed' : 'solid');

export function calculate(
  bars: Bar[],
  inputs: Partial<FibonacciConfluenceToolkitInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const bullColor = cfg.bullCHoCHs ? cfg.ltBullMSColor : CHART_BG;
  const bearColor = cfg.bearCHoCHs ? cfg.ltBearMSColor : CHART_BG;
  const msStyle = lineStyle(cfg.ltMSLineStyle);
  const msWidth = Math.trunc(cfg.ltMSLineWidth);
  // the retracement levels between 0 and 1, in the order of the script
  const middle: Array<[string, boolean, number]> = [
    ['0_786', cfg.show0786, cfg.value0786],
    ['0_65', cfg.show065, cfg.value065],
    ['0_618', cfg.show0618, cfg.value0618],
    ['0_5', cfg.show05, cfg.value05],
    ['0_382', cfg.show0382, cfg.value0382],
    ['0_236', cfg.show0236, cfg.value0236],
  ];
  const anyShown = cfg.show1 || cfg.show0 || middle.some(([, show]) => show);

  // Drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain. A deleted object ignores later changes and its getters give na.
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length > MAX_OBJECTS + 5) for (const o of list.splice(0, list.length - MAX_OBJECTS)) o.deleted = true;
  };
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const boxes: Bx[] = [];
  const newLine = (x1: number, y1: number, x2: number, y2: number, lineColor: string | null, style: Style = 'solid', width = 1): Ln => {
    const o: Ln = { x1, y1, x2, y2, color: lineColor, style, width, deleted: false };
    lines.push(o);
    limit(lines);
    return o;
  };
  const newLabel = (l: Omit<Lb, 'deleted'>): Lb => {
    const o = { ...l, deleted: false };
    labels.push(o);
    limit(labels);
    return o;
  };
  const newBox = (b: Omit<Bx, 'deleted'>): Bx => {
    const o = { ...b, deleted: false };
    boxes.push(o);
    limit(boxes);
    return o;
  };
  const priceLabel = (x: number, y: number, level: number): Lb => {
    const text = str.tostring(level) + ' · ' + str.tostring(y, 'mintick', MINTICK);
    return newLabel({ x, y, text, textColor: null, style: 'label_left', size: 'small', tooltip: text });
  };
  const setX2 = (l: Ln | null, x: number) => {
    if (l && !l.deleted) l.x2 = x;
  };
  const setX = (l: Lb | null, x: number) => {
    if (l && !l.deleted) l.x = x;
  };

  const stLow = structure();
  const stHigh = structure();
  const itLow = structure();
  const itHigh = structure();
  const ltLow = structure();
  const ltHigh = structure();
  const ltMS = { lastType: 0, prevType: 0 };
  const bullFibs: Fibs = { lines: {}, labels: {} };
  const bearFibs: Fibs = { lines: {}, labels: {} };

  /** method queryPatterns(ICTMS this, isSwingHigh) */
  const query = (s: Structure, isSwingHigh: boolean) =>
    isSwingHigh ? lt(s.prevPrice, s.midPrice) && ge(s.midPrice, s.lastPrice) : gt(s.prevPrice, s.midPrice) && le(s.midPrice, s.lastPrice);
  /** method updatePattern(ICTMS this, price, index) */
  const update = (s: Structure, price: number, index: number) => {
    s.isCrossed = false;
    s.prevPrice = s.midPrice;
    s.midPrice = s.lastPrice;
    s.lastPrice = price;
    s.prevIndex = s.midIndex;
    s.midIndex = s.lastIndex;
    s.lastIndex = index;
    s.prevLabel = s.midLabel;
    s.midLabel = s.lastLabel;
  };

  /** method manageFibs(FIB this, render, isBullish, rHighI, rHighV, rLowI, rLowV, color) on bar i */
  const manageFibs = (
    f: Fibs, render: boolean, isBullish: boolean, rHighI: number, rHighV: number, rLowI: number, rLowV: number, c: string, i: number,
  ) => {
    if (render) {
      const range = Math.abs(rHighV - rLowV);
      const m = (rHighV - rLowV) / (rHighI - rLowI);
      const b = rLowV - m * rLowI;
      if (anyShown) f.lines.ref = newLine(rLowI, rLowV, rHighI, rHighV, c, 'dashed');
      if (cfg.show1) {
        const ln1 = f.lines['1'] ?? null;
        if (ln1 && !ln1.deleted) ln1.color = c;
        setX2(ln1, i + 1);
        setX(f.labels['1'] ?? null, i + 1);
      }
      for (const [key, show, level] of middle) {
        if (!show) continue;
        const value = isBullish ? rHighV - range * level : rLowV + range * level;
        f.lines[key] = newLine(Math.ceil((value - b) / m), value, i + 1, value, c, 'dotted');
        f.labels[key] = priceLabel(i + 1, value, level);
      }
      if (cfg.show0) {
        const value = isBullish ? rHighV : rLowV;
        f.lines['0'] = newLine(isBullish ? rHighI : rLowI, value, i + 1, value, c);
        f.labels['0'] = priceLabel(i + 1, value, cfg.value0);
      }
    } else {
      const shown: Array<[string, boolean]> = [['1', cfg.show1], ...middle.map(([key, show]): [string, boolean] => [key, show]), ['0', cfg.show0]];
      for (const [key, show] of shown) {
        if (!show) continue;
        setX2(f.lines[key] ?? null, i + 1);
        setX(f.labels[key] ?? null, i + 1);
      }
    }
  };

  /** method renderStructures(ICTMS this, isBullish, marketStructure, color, style, width) on bar i */
  const renderStructures = (s: Structure, isBullish: boolean, c: string, i: number) => {
    const bar = bars[i];
    const condition = isBullish ? gt(bar.close, s.lastPrice) : lt(bar.close, s.lastPrice);
    if (condition && !s.isCrossed) {
      s.isCrossed = true;
      if (ltMS.lastType === (isBullish ? -1 : 1)) {
        s.isCHoCH = true;
        s.measure = false;
        newLine(s.lastIndex, s.lastPrice, i, s.lastPrice, c, msStyle, msWidth);

        // the lowest low (highest high) since the broken swing; the most recent bar wins a tie
        let value = isBullish ? bar.low : bar.high;
        let index = i;
        for (let k = 1; k <= i - s.lastIndex; k++) {
          const past = bars[i - k];
          if (isBullish ? lt(past.low, value) : gt(past.high, value)) {
            value = isBullish ? past.low : past.high;
            index = i - k;
          }
        }
        const f = isBullish ? bullFibs : bearFibs;
        f.lines['1'] = newLine(index, value, i, value, null);
        f.labels['1'] = priceLabel(i, value, 1);
        // the label of level 1 always starts with "1" (it does not use the input value)
        const text = '1 · ' + str.tostring(value, 'mintick', MINTICK);
        f.labels['1'].text = text;
        f.labels['1'].tooltip = text;

        s.lwest = isBullish ? value : bar.low;
        s.hghst = isBullish ? bar.high : value;
        s.zone = newBox({
          left: i, top: isBullish ? s.lastPrice : value, right: i + 1, bottom: isBullish ? value : s.lastPrice,
          bg: cfg.areaOfInt === 'Enabled' ? String(color.new(c, 89)) : null, text: '', textColor: null, textVAlign: null,
        });
        newBox({
          left: s.lastIndex, top: s.lastPrice, right: i, bottom: s.lastPrice, bg: null, text: 'CHoCH',
          textColor: String(color.new(c, 17)), textVAlign: isBullish ? 'bottom' : 'top',
        });
      } else {
        s.isCHoCH = false;
      }
      ltMS.prevType = ltMS.lastType;
      ltMS.lastType = isBullish ? 1 : -1;
    } else if (s.isCHoCH) {
      if (isBullish ? gt(bar.low, s.lwest) : lt(bar.high, s.hghst)) {
        if (s.zone && !s.zone.deleted) s.zone.right = i + 1;
      } else {
        s.isCHoCH = false;
      }
    }
  };

  /** A long-term swing: the range of the retracement after a CHoCH, and the optional swing label */
  const longTerm = (lt_: Structure, it: Structure, isHigh: boolean, i: number) => {
    lt_.isCrossed = false;
    if (ltMS.lastType === (isHigh ? 1 : -1) && ltMS.prevType !== ltMS.lastType && !lt_.measure) {
      lt_.measure = true;
      const f = isHigh ? bullFibs : bearFibs;
      const ln1 = f.lines['1'] ?? null;
      const anchorX = ln1 && !ln1.deleted ? ln1.x1 : NaN;
      const zone = lt_.zone && !lt_.zone.deleted ? lt_.zone : null;
      if (isHigh) manageFibs(f, true, true, it.midIndex, it.midPrice, anchorX, zone ? Math.min(zone.top, zone.bottom) : NaN, bullColor, i);
      else manageFibs(f, true, false, anchorX, zone ? Math.max(zone.top, zone.bottom) : NaN, it.midIndex, it.midPrice, bearColor, i);
    }
    const tx = isHigh
      ? (cfg.ltSwings === '△▽' ? '▽' : cfg.ltSwings === '◉' ? '◉' : gt(lt_.lastPrice, it.midPrice) ? 'HL' : 'HH')
      : (cfg.ltSwings === '△▽' ? '△' : cfg.ltSwings === '◉' ? '◉' : gt(lt_.lastPrice, it.midPrice) ? 'LL' : 'LH');
    lt_.lastPrice = it.midPrice;
    lt_.lastIndex = it.midIndex;
    if (cfg.ltSwings !== 'Disabled' && it.midLabel && !it.midLabel.deleted) {
      it.midLabel.text = tx;
      it.midLabel.size = textSize(cfg.ltSwingsSZ);
      it.midLabel.textColor = isHigh ? bullColor : bearColor;
    }
  };

  // Engulfing candles
  const body = bars.map((b) => Math.max(b.close, b.open) - Math.min(b.close, b.open));
  const bodyAvg = ta.ema(Series.fromArray(bars, body), 14).toArray();
  const engulfOn = cfg.engulf !== 'Disabled';

  let prevITL = false;
  let prevITH = false;
  let prevLTL = false;
  let prevLTH = false;

  for (let i = 0; i < n; i++) {
    const bar = bars[i];

    // Short-term swings
    if (i >= 2) {
      const l1 = bars[i - 1].low;
      if (gt(bars[i - 2].low, l1) && le(l1, bar.low)) {
        update(stLow, l1, i - 1);
        stLow.lastLabel = newLabel({ x: i - 1, y: l1, text: '⦁', textColor: null, style: 'label_up', size: 'normal', tooltip: '' });
      }
      const h1 = bars[i - 1].high;
      if (lt(bars[i - 2].high, h1) && ge(h1, bar.high)) {
        update(stHigh, h1, i - 1);
        stHigh.lastLabel = newLabel({ x: i - 1, y: h1, text: '⦁', textColor: null, style: 'label_down', size: 'normal', tooltip: '' });
      }
    }

    // Intermediate swings
    const cITL = query(stLow, false);
    if (cITL && !prevITL && i > 0) {
      update(itLow, stLow.midPrice, stLow.midIndex);
      itLow.lastLabel = stLow.midLabel;
    }
    prevITL = cITL;
    const cITH = query(stHigh, true);
    if (cITH && !prevITH && i > 0) {
      update(itHigh, stHigh.midPrice, stHigh.midIndex);
      itHigh.lastLabel = stHigh.midLabel;
    }
    prevITH = cITH;

    // Long-term swings
    const cLTL = query(itLow, false);
    if (cLTL && !prevLTL && i > 0) longTerm(ltLow, itLow, false, i);
    prevLTL = cLTL;
    if (ltLow.isCHoCH && ltLow.measure && lt(bar.high, ltLow.hghst)) manageFibs(bearFibs, false, false, 0, 0, 0, 0, '', i);

    const cLTH = query(itHigh, true);
    if (cLTH && !prevLTH && i > 0) longTerm(ltHigh, itHigh, true, i);
    prevLTH = cLTH;
    if (ltHigh.isCHoCH && ltHigh.measure && gt(bar.low, ltHigh.lwest)) manageFibs(bullFibs, false, true, 0, 0, 0, 0, '', i);

    renderStructures(ltLow, false, bearColor, i);
    renderStructures(ltHigh, true, bullColor, i);

    // Engulfing candle patterns
    if (engulfOn && i > 0) {
      const p = bars[i - 1];
      const avg = bodyAvg[i] ?? NaN;
      const prevAvg = bodyAvg[i - 1] ?? NaN;
      const longBody = gt(body[i], avg);
      const prevSmall = lt(body[i - 1], prevAvg);
      const white = lt(bar.open, bar.close);
      const black = gt(bar.open, bar.close);
      const bearish = black && longBody && lt(p.open, p.close) && prevSmall && le(bar.close, p.open) && ge(bar.open, p.close)
        && (lt(bar.close, p.open) || gt(bar.open, p.close));
      const bullish = white && longBody && gt(p.open, p.close) && prevSmall && ge(bar.close, p.open) && le(bar.open, p.close)
        && (gt(bar.close, p.open) || lt(bar.open, p.close));
      const all = cfg.engulf === 'All';
      const zoneEdge = (s: Structure, top: boolean) =>
        (s.zone && !s.zone.deleted ? (top ? Math.max(s.zone.top, s.zone.bottom) : Math.min(s.zone.top, s.zone.bottom)) : NaN);
      if (bearish && (all || (ltLow.isCHoCH && ltLow.measure && gt(bar.close, zoneEdge(ltLow, false))))) {
        newLabel({ x: i, y: bar.high, text: '▼', textColor: bearColor, style: 'label_down', size: textSize(cfg.engulfSZ), tooltip: TT_BEAR });
      }
      if (bullish && (all || (ltHigh.isCHoCH && ltHigh.measure && lt(bar.close, zoneEdge(ltHigh, true))))) {
        newLabel({ x: i, y: bar.low, text: '▲', textColor: bullColor, style: 'label_up', size: textSize(cfg.engulfSZ), tooltip: TT_BULL });
      }
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const ok = (...v: number[]) => v.every((x) => Number.isFinite(x));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // an object with an na coordinate is not drawn
    lines: lines.filter((l) => ok(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color ?? 'transparent',
      ...(l.width !== 1 ? { width: l.width } : {}),
      ...(l.style !== 'solid' ? { style: l.style } : {}),
    })),
    labels: labels.filter((l) => ok(l.x, l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor ?? 'transparent',
      ...(l.style !== 'label_down' ? { style: l.style } : {}),
      ...(l.size !== 'normal' ? { size: l.size } : {}),
      ...(l.tooltip ? { tooltip: l.tooltip } : {}),
    })),
    boxes: boxes.filter((b) => ok(b.left, b.top, b.right, b.bottom)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg ?? 'transparent', borderColor: 'transparent',
      ...(b.text ? { text: b.text, textSize: 'tiny' as const, textHAlign: 'left' as const, textVAlign: b.textVAlign ?? undefined, textColor: b.textColor ?? undefined } : {}),
    })),
  };
}

export const FibonacciConfluenceToolkit = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
