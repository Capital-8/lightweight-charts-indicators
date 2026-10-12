/**
 * Candlestick Structure [LuxAlgo]
 *
 * Finds 16 candlestick patterns (hammer, inverted hammer, engulfing, rising / falling three, three white soldiers /
 * black crows, morning / evening star, harami, tweezers, hanging man, shooting star) from the shape of the candles
 * (body and wick shares of the bar range). A pattern counts as a reversal when it appears against the minor trend
 * (Donchian channel direction: up when the high touches the channel top, down when the low touches the bottom). A
 * reversal is labelled only when it goes with the major trend (EMA cross, change of character of the swing
 * structure, Supertrend or Donchian channel). The dashboard shows, per pattern, the share of the patterns that came
 * against the minor trend ("Alignment %") and their count (tooltip).
 *
 * Plots: the major trend line (Supertrend / Donchian band on its side, the close on the other side with a
 * transparent colour, both EMAs in "EMA" mode) with a gradient fill between them. The "ChoCh" mode draws a dashed
 * line and a "ChoCh" label at each change of character. Optional bar colours give the minor trend. At most 500
 * labels and 500 lines are kept.
 *
 * Chart context (optional third argument of calculate): the symbol tick (doji and tweezer prices rounded to the
 * tick) and the chart background colour (the transparent colour of the hidden side, alpha 0).
 *
 * Reference: "Candlestick Structure [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, Series, color, math, str, callsite, line, label, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type FillData,
} from 'oakscriptjs';
import type { BarColorData, LabelData, LineDrawingData, PineSize, TableCellData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { backgroundColorOf, mintickOf, type ChartContext } from '../chart-context';

type MajorTrend = 'EMA' | 'ChoCh' | 'SuperTrend' | 'Donchian Channel';

export interface CandlestickStructureInputs {
  hammerTog: boolean;
  ihammerTog: boolean;
  bulleTog: boolean;
  r3Tog: boolean;
  twsTog: boolean;
  mstarTog: boolean;
  bullhTog: boolean;
  btmTweezTog: boolean;
  hmanTog: boolean;
  sstarTog: boolean;
  beareTog: boolean;
  f3Tog: boolean;
  tbcTog: boolean;
  estarTog: boolean;
  bearhTog: boolean;
  topTweezTog: boolean;
  minorDCLength: number;
  majorTrendType: MajorTrend;
  majorSwingLength: number;
  majorEma1Length: number;
  majorEma2Length: number;
  majorSTFactor: number;
  majorSTLength: number;
  majorDCLength: number;
  bcTog: boolean;
  bullColor: string;
  bearColor: string;
  showFill: boolean;
  txtSize: 'tiny' | 'small' | 'normal' | 'large' | 'huge' | 'auto';
  showDash: boolean;
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  textSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: CandlestickStructureInputs = {
  hammerTog: true,
  ihammerTog: true,
  bulleTog: true,
  r3Tog: true,
  twsTog: true,
  mstarTog: true,
  bullhTog: true,
  btmTweezTog: true,
  hmanTog: true,
  sstarTog: true,
  beareTog: true,
  f3Tog: true,
  tbcTog: true,
  estarTog: true,
  bearhTog: true,
  topTweezTog: true,
  minorDCLength: 10,
  majorTrendType: 'SuperTrend',
  majorSwingLength: 20,
  majorEma1Length: 50,
  majorEma2Length: 200,
  majorSTFactor: 4,
  majorSTLength: 20,
  majorDCLength: 40,
  bcTog: false,
  bullColor: '#089981',
  bearColor: '#f23645',
  showFill: true,
  txtSize: 'tiny',
  showDash: true,
  dashLoc: 'Bottom Right',
  textSize: 'Tiny',
};

const G1 = '    Bullish Patterns               Bearish Patterns';

export const inputConfig: InputConfig[] = [
  { id: 'hammerTog', type: 'bool', title: 'Hammer                ', defval: true, group: G1, inline: '1' },
  { id: 'ihammerTog', type: 'bool', title: 'Inverted Hammer   ', defval: true, group: G1, inline: '2' },
  { id: 'bulleTog', type: 'bool', title: 'Bullish Engulfing    ', defval: true, group: G1, inline: '3' },
  { id: 'r3Tog', type: 'bool', title: 'Rising 3                  ', defval: true, group: G1, inline: '4' },
  { id: 'twsTog', type: 'bool', title: '3 White Soldiers     ', defval: true, group: G1, inline: '5' },
  { id: 'mstarTog', type: 'bool', title: 'Morning Star         ', defval: true, group: G1, inline: '6' },
  { id: 'bullhTog', type: 'bool', title: 'Bullish Harami      ', defval: true, group: G1, inline: '7' },
  { id: 'btmTweezTog', type: 'bool', title: 'Tweezer Bottom    ', defval: true, group: G1, inline: '8' },
  { id: 'hmanTog', type: 'bool', title: 'Hanging Man', defval: true, group: G1, inline: '1' },
  { id: 'sstarTog', type: 'bool', title: 'Shooting Star', defval: true, group: G1, inline: '2' },
  { id: 'beareTog', type: 'bool', title: 'Bearish Engulfing', defval: true, group: G1, inline: '3' },
  { id: 'f3Tog', type: 'bool', title: 'Falling 3', defval: true, group: G1, inline: '4' },
  { id: 'tbcTog', type: 'bool', title: '3 Black Crows', defval: true, group: G1, inline: '5' },
  { id: 'estarTog', type: 'bool', title: 'Evening Star', defval: true, group: G1, inline: '6' },
  { id: 'bearhTog', type: 'bool', title: 'Bearish Harami', defval: true, group: G1, inline: '7' },
  { id: 'topTweezTog', type: 'bool', title: 'Tweezer Top', defval: true, group: G1, inline: '8' },
  {
    id: 'minorDCLength', type: 'int', title: 'Minor Trend Length', defval: 10, group: 'Minor Trend',
    tooltip: 'Minor Trend determined by Donchian Channels.',
  },
  {
    id: 'majorTrendType', type: 'string', title: 'Major Trend Method', defval: 'SuperTrend',
    options: ['EMA', 'ChoCh', 'SuperTrend', 'Donchian Channel'], group: 'Major Trend',
  },
  { id: 'majorSwingLength', type: 'int', title: 'Swing Length', defval: 20, min: 2, group: 'ChoCh Parameters' },
  { id: 'majorEma1Length', type: 'int', title: 'Short EMA Length', defval: 50, min: 1, group: 'EMA Parameters' },
  { id: 'majorEma2Length', type: 'int', title: 'Long EMA Length', defval: 200, min: 1, group: 'EMA Parameters' },
  { id: 'majorSTFactor', type: 'float', title: 'Super Trend Factor', defval: 4, group: 'Super Trend Parameters' },
  { id: 'majorSTLength', type: 'int', title: 'Length', defval: 20, group: 'Super Trend Parameters' },
  { id: 'majorDCLength', type: 'int', title: 'Donchian Channel Length', defval: 40, group: 'Donchian Channel Parameters' },
  {
    id: 'bcTog', type: 'bool', title: 'Color Candles', defval: false, group: 'Style',
    tooltip: 'Color Candles to visualize minor trend.',
  },
  { id: 'bullColor', type: 'color', title: 'Bull Color  ', defval: '#089981', group: 'Style' },
  { id: 'bearColor', type: 'color', title: 'Bear Color', defval: '#f23645', group: 'Style' },
  { id: 'showFill', type: 'bool', title: 'Show Gradient', defval: true, group: 'Style' },
  {
    id: 'txtSize', type: 'string', title: 'Label Size', defval: 'tiny',
    options: ['tiny', 'small', 'normal', 'large', 'huge', 'auto'], group: 'Style', inline: '3',
  },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: true, group: 'Dashboard' },
  {
    id: 'dashLoc', type: 'string', title: 'Location', defval: 'Bottom Right',
    options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard',
  },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Tiny', options: ['Tiny', 'Small', 'Normal'], group: 'Dashboard' },
];

// plot(..., style = plot.style_linebr, editable = false)
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Major Uptrend', color: '#2962FF', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Major Downtrend', color: '#2962FF', lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Candlestick Structure [LuxAlgo]',
  shortTitle: 'LuxAlgo - Candlestick Structure',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
/** `a != b`: false when one side is na */
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

const TT = {
  hammer: 'The Hammer pattern appears at the bottom of a downtrend. It is identified by a small upper wick (or no upper wick) with a small body, and an elongated lower wick whose length is 2X greater than the candle body’s width.',
  ihammer: 'The Inverted Hammer pattern appears at the bottom of a downtrend. It is identified by a small lower wick (or no lower wick) with a small body, and an elongated upper wick whose length is 2X greater than the candle body’s width.',
  hman: 'The Hanging Man pattern appears at the top of an uptrend. It is identified by a small upper wick (or no upper wick) with a small body, and an elongated lower wick whose length is 2X greater than the candle body’s width.',
  sstar: 'The Shooting Star pattern appears at the top of an uptrend. It is identified by a small lower wick (or no lower wick) with a small body, and an elongated upper wick whose length is 2X greater than the candle body’s width.',
  bulle: 'The Bullish Engulfing pattern appear at the bottom of a downtrend. It is a 2 bar pattern, identified by a large bullish candle body fully encapsulating (opening lower and closing higher) the previous small (bearish) candle body.',
  beare: 'The Bearish Engulfing pattern appear at the top of a downtrend. It is a 2 bar pattern, identified by a large bearish candle body fully encapsulating (opening higher and closing lower) the previous small (bullish) candle body.',
  r3: 'The Rising Three Method Pattern is an indicator of continuation for the current trend. It is a 5 bar pattern, identified by an initial full-bodied bullish candle, followed by 3 bearish candles who trade within the high and low of the initial candle, followed by another full-bodied bullish candle closing above the high of the initial candle.',
  f3: 'The Falling Three Method Pattern is an indicator of continuation for the current trend. It is a 5 bar pattern, identified by an initial full-bodied bearish candle, followed by 3 bullish candles who trade within the high and low of the initial candle, followed by another full-bodied bearish candle closing below the low of the initial candle.',
  tws: 'The Three White Soldiers Pattern appears at the bottom of a downtrend. It is identified by 3 full-bodied bullish candles, each opening within the body and closing below the high, of the previous candle.',
  tbc: 'The Three Black Crows Pattern appears at the top of an uptrend. It is identified by 3 full-bodied bearish candles, each open within the body and closing below the low, of the previous candle.',
  mstar: 'The Morning Star Pattern appears at the bottom of a downtrend. It is a 3 bar pattern, identified by a full-bodied bearish candle, followed by a small-bodied bearish candle, followed by a full-bodied bullish candle that closes above the halfway point of the first candle.',
  estar: 'The Evening Star Pattern appears at the top of an uptrend. It is a 3 bar pattern, identified by a full-bodied bullish candle, followed by a small-bodied bullish candle, followed by a full-bodied bearish candle that closes below the halfway point of the first candle.',
  bullh: 'The Bullish Harami Pattern appears at the bottom of a downtrend. It is a 2 bar pattern, identified by an initial bearish candle, followed by a small bullish candle whose range is entirely contained within the body of the initial candle.',
  bearh: 'The Bearish Harami Pattern appears at the top of an uptrend. It is a 2 bar pattern, identified by an initial bullish candle, followed by a small bearish candle whose range is entirely contained within the body of the initial candle.',
  tweezerTop: 'The Tweezer Top bearish reversal candlestick pattern is identified by an initial bullish candle, followed by a bearish candle, both having equal highs.',
  tweezerBtm: 'The Tweezer Bottom bullish reversal candlestick pattern is identified by an initial bullish candle, followed by a bearish candle, both having equal lows.',
};

export function calculate(
  bars: Bar[],
  inputs: Partial<CandlestickStructureInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
  labels: LabelData[]; lines: LineDrawingData[]; tables: TableData[]; barColors: BarColorData[]; fills: FillData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const mintick = mintickOf(chart);
  // invis = color.new(chart.bg_color, 100)
  const invis = String(color.new(backgroundColorOf(chart), 100));
  const bullColor = cfg.bullColor;
  const bearColor = cfg.bearColor;
  const S = (f: (b: Bar) => number) => new Series(bars, f);
  const highS = S((b) => b.high);
  const lowS = S((b) => b.low);
  const closeS = S((b) => b.close);
  const o = bars.map((b) => b.open);
  const h = bars.map((b) => b.high);
  const l = bars.map((b) => b.low);
  const c = bars.map((b) => b.close);

  resetDrawings({ label: MAX_OBJECTS, line: MAX_OBJECTS });

  /** get_dc(_length): Donchian channel direction (one call site each) */
  const dcTrend = (length: number) => {
    const len = length > 0 ? length : 1;
    const upper = ta.highest(highS, len).toArray();
    const lower = ta.lowest(lowS, len).toArray();
    const dir = new Array<number>(n).fill(0);
    let sDir = 0;
    for (let i = 0; i < n; i++) {
      if (eq(h[i], upper[i]) && sDir !== 1) sDir = 1;
      if (eq(l[i], lower[i]) && sDir !== -1) sDir = -1;
      dir[i] = sDir;
    }
    return { v1: lower, v2: upper, dir };
  };

  // Minor trend: get_trend("Donchian Channel", ..., minorDCLength)
  const minorDir = dcTrend(cfg.minorDCLength).dir;

  // Major trend
  let majorV1: number[];
  let majorV2: number[];
  let majorDir: number[];
  // get_choch() runs on each bar in the bar loop below (it draws)
  let chochStep: ((i: number) => void) | null = null;
  if (cfg.majorTrendType === 'EMA') {
    // get_ema(): var s_dir = 0; 1 when the short EMA is above the long one, -1 below
    majorV1 = ta.ema(closeS, cfg.majorEma1Length).toArray();
    majorV2 = ta.ema(closeS, cfg.majorEma2Length).toArray();
    majorDir = new Array<number>(n).fill(0);
    let sDir = 0;
    for (let i = 0; i < n; i++) {
      if (gt(majorV1[i], majorV2[i])) sDir = 1;
      if (lt(majorV1[i], majorV2[i])) sDir = -1;
      majorDir[i] = sDir;
    }
  } else if (cfg.majorTrendType === 'SuperTrend') {
    // get_st(): [st, st, -direction]
    const [st, dir] = ta.supertrend(bars, cfg.majorSTFactor, cfg.majorSTLength);
    majorV1 = st.toArray();
    majorV2 = majorV1;
    majorDir = dir.toArray().map((d) => -d);
  } else if (cfg.majorTrendType === 'Donchian Channel') {
    const dc = dcTrend(cfg.majorDCLength);
    majorV1 = dc.v1;
    majorV2 = dc.v2;
    majorDir = dc.dir;
  } else {
    // get_choch(len): [na, na, s_dir]
    majorV1 = new Array<number>(n).fill(NaN);
    majorV2 = majorV1;
    majorDir = new Array<number>(n).fill(0);
    const len = cfg.majorSwingLength;
    const upper = ta.highest(highS, len).toArray();
    const lower = ta.lowest(lowS, len).toArray();
    let os = NaN; // os[1] is na on bar 0: os stays na until the first break
    let tVal = NaN;
    let bVal = NaN;
    let tBar = NaN;
    let bBar = NaN;
    let tCount = 1;
    let bCount = 1;
    let sDir = 0;
    const bullCross = callsite.crossover();
    const bearCross = callsite.crossunder();
    const dirs = majorDir;
    chochStep = (i: number) => {
      const hl = i >= len ? h[i - len] : NaN;
      const ll = i >= len ? l[i - len] : NaN;
      const prevOs = os;
      os = gt(hl, upper[i]) ? 0 : lt(ll, lower[i]) ? 1 : prevOs;
      const top = eq(os, 0) && ne(prevOs, 0) ? hl : NaN;
      const btm = eq(os, 1) && ne(prevOs, 1) ? ll : NaN;
      if (!isNaN(top)) {
        tBar = i - len;
        tVal = top;
        tCount = 1;
      }
      if (!isNaN(btm)) {
        bBar = i - len;
        bVal = btm;
        bCount = 1;
      }
      const bullChoch = bullCross(c[i], tVal) && tCount === 1;
      const bearChoch = bearCross(c[i], bVal) && bCount === 1;
      if (bullChoch && sDir !== 1) {
        line.new(tBar, tVal, i, tVal, 'bar_index', 'none', bullColor, 'dashed');
        label.new(Math.trunc((tBar + i) / 2), tVal, 'ChoCh', 'bar_index', 'price', invis, 'label_down', bullColor, 'tiny');
        tCount = 0;
        sDir = 1;
      }
      if (bearChoch && sDir !== -1) {
        line.new(bBar, bVal, i, bVal, 'bar_index', 'none', bearColor, 'dashed');
        label.new(Math.trunc((bBar + i) / 2), bVal, 'ChoCh', 'bar_index', 'price', invis, 'label_up', bearColor, 'tiny');
        bCount = 0;
        sDir = -1;
      }
      dirs[i] = sDir;
    };
  }

  // Candle shape
  const rc = c.map((v, i) => lt(v, o[i]));
  const gc = c.map((v, i) => gt(v, o[i]));
  const cTop = c.map((v, i) => Math.max(o[i], v));
  const cBot = c.map((v, i) => Math.min(o[i], v));
  const hlWidth = h.map((v, i) => v - l[i]);
  const bodWidth = cTop.map((v, i) => v - cBot[i]);
  const hwPer = h.map((v, i) => ((v - cTop[i]) / hlWidth[i]) * 100);
  const lwPer = l.map((v, i) => ((cBot[i] - v) / hlWidth[i]) * 100);
  const bPer = bodWidth.map((v, i) => (v / hlWidth[i]) * 100);
  const rt = (v: number) => math.round_to_mintick(v, mintick) as number;
  const doji = c.map((v, i) => eq(rt(v), rt(o[i])));
  const hl2 = h.map((v, i) => (v + l[i]) / 2);
  const minorBear = minorDir.map((d) => d < 0);
  const minorBull = minorDir.map((d) => d > 0);
  /** x[k] of a bool series (na = false before the first bar) */
  const at = (arr: boolean[], i: number) => i >= 0 && arr[i];
  const num = (arr: number[], i: number) => (i >= 0 ? arr[i] : NaN);

  /** count(condition, filter): reversals / total * 100 and total, one call site each */
  const counter = () => {
    let reversals = 0;
    let total = 0;
    return {
      step(condition: boolean, filter: boolean) {
        reversals += condition && filter ? 1 : 0;
        total += condition ? 1 : 0;
        return condition && filter;
      },
      get per() { return (reversals / total) * 100; },
      get total() { return total; },
    };
  };
  const cnt = {
    hammer: counter(), invHammer: counter(), rising3: counter(), bullEngulfing: counter(), soldiers: counter(),
    mStar: counter(), bullHarami: counter(), tweezerBtm: counter(), sStar: counter(), hMan: counter(),
    falling3: counter(), bearEngulfing: counter(), crows: counter(), eStar: counter(), bearHarami: counter(),
    tweezerTop: counter(),
  };

  const plot0: Array<{ time: number; value: number; color: string | null }> = [];
  const plot1: Array<{ time: number; value: number; color: string | null }> = [];
  const topValue: number[] = [];
  const bottomValue: number[] = [];
  const topColor: Array<string | null> = [];
  const bottomColor: Array<string | null> = [];
  const barColors: BarColorData[] = [];
  const isEma = cfg.majorTrendType === 'EMA';
  const size = cfg.txtSize;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    if (chochStep) chochStep(i);
    const majorBear = majorDir[i] < 0;
    const majorBull = majorDir[i] > 0;
    const majorColor = majorBear ? bearColor : majorBull ? bullColor : null;
    const minorColor = minorBear[i] ? bearColor : minorBull[i] ? bullColor : null;
    const majorUp = isEma ? majorV1[i] : majorBull ? majorV1[i] : c[i];
    const majorDown = isEma ? majorV2[i] : majorBear ? majorV2[i] : c[i];
    const majorUpCol = isEma ? majorColor : majorBull ? majorColor : invis;
    const majorDownCol = isEma ? majorColor : majorBear ? majorColor : invis;

    // Bullish patterns
    const hammerCond = gt(lwPer[i], bPer[i] * 2) && lt(bPer[i], 50) && lt(hwPer[i], 2) && !doji[i];
    const hammer = cnt.hammer.step(hammerCond, minorBear[i]);
    const ihCond = gt(hwPer[i], bPer[i] * 2) && lt(bPer[i], 50) && lt(lwPer[i], 2) && !doji[i];
    const invHammer = cnt.invHammer.step(ihCond, minorBear[i]);
    const inBar4 = (k: number) => le(num(cTop, i - k), num(h, i - 4)) && ge(num(cBot, i - k), num(l, i - 4));
    const rising3 = cnt.rising3.step(
      at(gc, i - 4) && gt(num(bPer, i - 4), 50)
        && at(rc, i - 3) && inBar4(3)
        && at(rc, i - 2) && inBar4(2)
        && at(rc, i - 1) && inBar4(1)
        && gc[i] && gt(c[i], num(h, i - 4)) && gt(bPer[i], 50),
      at(minorBull, i - 4),
    );
    const bullEngulfing = cnt.bullEngulfing.step(
      at(rc, i - 1) && gc[i] && gt(bodWidth[i], num(bodWidth, i - 1) / 2) && lt(o[i], num(c, i - 1))
        && gt(cTop[i], num(cTop, i - 1)) && !rising3 && i >= 1 && !doji[i - 1],
      minorBear[i],
    );
    const soldiers = cnt.soldiers.step(
      at(gc, i - 2) && gt(num(bPer, i - 2), 70)
        && at(gc, i - 1) && gt(num(bPer, i - 1), 70) && ge(num(cBot, i - 1), num(cBot, i - 2))
        && le(num(cBot, i - 1), num(cTop, i - 2)) && gt(num(c, i - 1), num(h, i - 2))
        && gc[i] && gt(bPer[i], 70) && ge(cBot[i], num(cBot, i - 1)) && le(cBot[i], num(cTop, i - 1))
        && gt(c[i], num(h, i - 1)),
      at(minorBear, i - 2),
    );
    const mStar = cnt.mStar.step(
      at(rc, i - 2) && gt(num(bPer, i - 2), 80)
        && at(rc, i - 1) && lt(num(bodWidth, i - 1), num(bodWidth, i - 2) / 2) && lt(num(o, i - 1), num(c, i - 2))
        && gc[i] && gt(c[i], num(hl2, i - 2)),
      at(minorBear, i - 2),
    );
    const bullHarami = cnt.bullHarami.step(
      gc[i] && le(h[i], num(cTop, i - 1)) && ge(l[i], num(cBot, i - 1)) && at(rc, i - 1),
      at(minorBear, i - 1),
    );
    const tweezerBtm = cnt.tweezerBtm.step(
      eq(rt(l[i]) - rt(num(l, i - 1)), 0) && gc[i] && at(rc, i - 1),
      at(minorBear, i - 1),
    );

    // Bearish patterns
    const sStar = cnt.sStar.step(ihCond, minorBull[i]);
    const hMan = cnt.hMan.step(hammerCond, minorBull[i]);
    const falling3 = cnt.falling3.step(
      at(rc, i - 4) && gt(num(bPer, i - 4), 50)
        && at(gc, i - 3) && inBar4(3)
        && at(gc, i - 2) && inBar4(2)
        && at(gc, i - 1) && inBar4(1)
        && rc[i] && lt(c[i], num(l, i - 4)) && gt(bPer[i], 50),
      at(minorBear, i - 4),
    );
    const bearEngulfing = cnt.bearEngulfing.step(
      at(gc, i - 1) && rc[i] && gt(bodWidth[i], num(bodWidth, i - 1) / 2) && gt(o[i], num(c, i - 1))
        && lt(cBot[i], num(cBot, i - 1)) && !falling3 && i >= 1 && !doji[i - 1],
      minorBull[i],
    );
    const crows = cnt.crows.step(
      at(rc, i - 2) && gt(num(bPer, i - 2), 70)
        && at(rc, i - 1) && gt(num(bPer, i - 1), 70) && le(num(cTop, i - 1), num(cTop, i - 2))
        && ge(num(cTop, i - 1), num(cBot, i - 2)) && lt(num(c, i - 1), num(l, i - 2))
        && rc[i] && gt(bPer[i], 70) && le(cTop[i], num(cTop, i - 1)) && ge(cTop[i], num(cBot, i - 1))
        && lt(c[i], num(l, i - 1)),
      at(minorBull, i - 2),
    );
    const eStar = cnt.eStar.step(
      at(gc, i - 2) && gt(num(bPer, i - 2), 80)
        && at(gc, i - 1) && lt(num(bodWidth, i - 1), num(bodWidth, i - 2) / 2) && gt(num(o, i - 1), num(c, i - 2))
        && rc[i] && lt(c[i], num(hl2, i - 2)),
      at(minorBull, i - 2),
    );
    const bearHarami = cnt.bearHarami.step(
      rc[i] && le(h[i], num(cTop, i - 1)) && ge(l[i], num(cBot, i - 1)) && at(gc, i - 1),
      at(minorBull, i - 1),
    );
    const tweezerTop = cnt.tweezerTop.step(
      eq(rt(h[i]) - rt(num(h, i - 1)), 0) && rc[i] && at(gc, i - 1),
      at(minorBull, i - 1),
    );

    // Labels (pattern shown when it goes with the major trend)
    const bull = (show: boolean, text: string, tooltip: string) => {
      if (show && majorBull) {
        label.new(i, l[i], text, 'bar_index', 'price', 'transparent', 'label_up', bullColor, size, 'center', tooltip);
      }
    };
    const bear = (show: boolean, text: string, tooltip: string) => {
      if (show && majorBear) {
        label.new(i, h[i], text, 'bar_index', 'price', 'transparent', 'label_down', bearColor, size, 'center', tooltip);
      }
    };
    bull(hammer && cfg.hammerTog, 'H', TT.hammer);
    bull(invHammer && cfg.ihammerTog, 'IH', TT.ihammer);
    bull(rising3 && cfg.r3Tog, 'R3', TT.r3);
    bull(bullEngulfing && cfg.bulleTog, 'EG▲', TT.bulle);
    bull(soldiers && cfg.twsTog, '3WS', TT.tws);
    bull(mStar && cfg.mstarTog, 'MS', TT.mstar);
    bull(bullHarami && cfg.bullhTog, 'H▲', TT.bullh);
    bull(tweezerBtm && cfg.btmTweezTog, 'TB', TT.tweezerBtm);
    bear(sStar && cfg.sstarTog, 'SS', TT.sstar);
    bear(hMan && cfg.hmanTog, 'HM', TT.hman);
    bear(falling3 && cfg.f3Tog, 'F3', TT.f3);
    // the original creates the bearish engulfing label twice
    bear(bearEngulfing && cfg.beareTog, 'EG▼', TT.beare);
    bear(bearEngulfing && cfg.beareTog, 'EG▼', TT.beare);
    bear(crows && cfg.tbcTog, '3BC', TT.tbc);
    bear(eStar && cfg.estarTog, 'ES', TT.estar);
    bear(bearHarami && cfg.bearhTog, 'H▼', TT.bearh);
    bear(tweezerTop && cfg.topTweezTog, 'TT', TT.tweezerTop);

    // Plots and fill
    const t = bars[i].time;
    plot0.push({ time: t, value: majorUp, color: majorUpCol });
    plot1.push({ time: t, value: majorDown, color: majorDownCol });
    topValue.push(Math.max(majorUp, majorDown));
    bottomValue.push(Math.min(majorUp, majorDown));
    topColor.push(majorBear && majorColor ? String(color.new(majorColor, 90)) : invis);
    bottomColor.push(majorBull && majorColor ? String(color.new(majorColor, 90)) : invis);
    if (cfg.bcTog && minorColor) barColors.push({ time: t, color: minorColor });
  }
  setDrawingBar(null);

  // Dashboard (cells set on the last bar)
  const tables: TableData[] = [];
  if (n > 0) {
    const position = cfg.dashLoc === 'Bottom Left' ? 'bottom_left' : cfg.dashLoc === 'Top Right' ? 'top_right' : 'bottom_right';
    const textSize = cfg.textSize.toLowerCase() as PineSize;
    const cells: TableCellData[] = [];
    if (cfg.showDash) {
      const cell = (column: number, row: number, text: string, extra: Partial<TableCellData> = {}) => {
        cells.push({ column, row, text, textColor: '#FFFFFF', textSize, ...extra });
      };
      cell(0, 0, 'Bullish', { bgColor: String(color.new(bullColor, 50)) });
      cell(2, 0, 'Bearish', { bgColor: String(color.new(bearColor, 50)) });
      cell(0, 1, 'Pattern');
      cell(1, 1, 'Alignment %');
      cell(2, 1, 'Pattern');
      cell(3, 1, 'Alignment %');
      const stat = (show: boolean, column: number, row: number, name: string, k: ReturnType<typeof counter>) => {
        if (!show) return;
        cell(column, row, name, { textHAlign: 'left' });
        const per = k.per;
        cell(column + 1, row, str.tostring(Number.isFinite(per) ? per : 0, 'percent'), {
          tooltip: 'Pattern Count:' + str.tostring(k.total),
        });
      };
      stat(cfg.hammerTog, 0, 2, 'Hammer (H)', cnt.hammer);
      stat(cfg.ihammerTog, 0, 3, 'Inverted Hammer (IH)', cnt.invHammer);
      stat(cfg.bulleTog, 0, 4, 'Bullish Engulfing (EG▲)', cnt.bullEngulfing);
      stat(cfg.r3Tog, 0, 5, 'Rising 3 (R3)', cnt.rising3);
      stat(cfg.twsTog, 0, 6, '3 White Soldiers (3WS)', cnt.soldiers);
      stat(cfg.mstarTog, 0, 7, 'Morning Star (MS)', cnt.mStar);
      stat(cfg.bullhTog, 0, 8, 'Bull Harami (H▲)', cnt.bullHarami);
      stat(cfg.btmTweezTog, 0, 9, 'Tweezer Bottom (TB)', cnt.tweezerBtm);
      stat(cfg.hmanTog, 2, 2, 'Hanging Man (HM)', cnt.hMan);
      stat(cfg.sstarTog, 2, 3, 'Shooting Star (SS)', cnt.sStar);
      stat(cfg.beareTog, 2, 4, 'Bear Engulfing (EG▼)', cnt.bearEngulfing);
      stat(cfg.f3Tog, 2, 5, 'Falling 3 (F3)', cnt.falling3);
      stat(cfg.tbcTog, 2, 6, '3 Black Crows (3BC)', cnt.crows);
      stat(cfg.estarTog, 2, 7, 'Evening Star (ES)', cnt.eStar);
      stat(cfg.bearhTog, 2, 8, 'Bear Harami (H▼)', cnt.bearHarami);
      stat(cfg.topTweezTog, 2, 9, 'Tweezer Top (TT)', cnt.tweezerTop);
    }
    tables.push({
      position, columns: 4, rows: 10, bgColor: '#1e222d', borderColor: '#373a46', borderWidth: 1,
      frameColor: '#373a46', frameWidth: 1, cells,
      ...(cfg.showDash ? {
        merges: [
          { startColumn: 0, startRow: 0, endColumn: 1, endRow: 0 },
          { startColumn: 2, startRow: 0, endColumn: 3, endRow: 0 },
        ],
      } : {}),
    });
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const fills: FillData[] = cfg.showFill
    ? [{ plot1: 'plot0', plot2: 'plot1', gradient: { topValue, bottomValue, topColor, bottomColor } }]
    : [];
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 } as unknown as IndicatorResult['plots'],
    fills,
    barColors,
    lines: line.all().map((ln) => ({
      time1: T(ln.x1), price1: ln.y1, time2: T(ln.x2), price2: ln.y2, color: String(ln.color), style: 'dashed' as const,
    })),
    labels: label.all().map((lb) => ({
      time: T(lb.x), price: lb.y, text: lb.text ?? '', color: String(lb.color ?? 'transparent'),
      textColor: String(lb.textcolor), style: lb.style as 'label_up' | 'label_down', size: lb.size as PineSize,
      ...(lb.tooltip ? { tooltip: lb.tooltip } : {}),
    })),
    tables,
  };
}

export const CandlestickStructure = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
