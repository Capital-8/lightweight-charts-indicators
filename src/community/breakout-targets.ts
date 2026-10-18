/**
 * Breakout Targets [AlgoAlpha]
 *
 * A range is detected when the weighted average of the candle body size crosses under its exponential average
 * ('Range Detection Period'). The range starts at the most recent pivot (high or low, half the period on each
 * side): from a pivot high it spans down to the lowest low since that pivot, from a pivot low up to the highest
 * high. When the close is inside it, a channel is drawn: a grey box, a red box at its top and a green box at its
 * bottom (each half an ATR high) and a dashed mid line. With 'Prevent Overlap' a new channel must start after the
 * right edge of the newest channel.
 * A channel grows to the right until the close leaves it. On a breakout a label is plotted at the opposite side of
 * the channel and, with 'Show Take Profit Levels', a trade is drawn: entry at the close, stop loss at the low minus
 * (or the high plus) 'Stop Loss ATR Multiplier' times the ATR, and three targets at the entry plus (minus) the risk
 * times the three multipliers. The trade lines and labels follow the current bar until the third target is hit or
 * the next breakout replaces them.
 *
 * Drawings are kept up to 500 boxes and 50 lines (the oldest are removed; the lines of the current trade are kept).
 *
 * Chart values read: the chart foreground colour (channel box, mid line, breakout label texts; without a chart
 * context: the dark theme colour #DBDBDB) and the symbol tick (prices in the trade labels; without it: 0.01).
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Breakout' / 'Bearish Breakout' on the bars of the breakout
 * labels; 'TP1 Hit', 'TP2 Hit', 'TP3 Hit' and 'SL Hit' when the high (low) of the bar reaches a level of the current
 * trade that the previous high (low) had not reached (long trade; the mirror for a short one).
 *
 * Reference: "Breakout Targets [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import { ta, Series, color, str, barTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, LinefillData, MarkerData } from '../types';
import { foregroundColorOf, mintickOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Breakout', message: 'Bullish Breakout Detected' },
  { id: 'alert1', title: 'Bearish Breakout', message: 'Bearish Breakout Detected' },
  { id: 'alert2', title: 'TP1 Hit', message: 'Take Profit 1 Hit' },
  { id: 'alert3', title: 'TP2 Hit', message: 'Take Profit 2 Hit' },
  { id: 'alert4', title: 'TP3 Hit', message: 'Take Profit 3 Hit' },
  { id: 'alert5', title: 'SL Hit', message: 'Stop Loss Hit' },
];

export interface BreakoutTargetsInputs {
  /** Range Detection Period */
  len: number;
  /** Prevent Overlap */
  preventOverlap: boolean;
  /** Show Take Profit Levels */
  showTp: boolean;
  /** Volatility (ATR) period */
  atrPeriod: number;
  /** Stop Loss ATR Multiplier */
  slMultiplier: number;
  tp1Multiplier: number;
  tp2Multiplier: number;
  tp3Multiplier: number;
  /** Bullish Colour */
  green: string;
  /** Bearish Colour */
  red: string;
}

export const defaultInputs: BreakoutTargetsInputs = {
  len: 99,
  preventOverlap: true,
  showTp: true,
  atrPeriod: 14,
  slMultiplier: 5,
  tp1Multiplier: 0.5,
  tp2Multiplier: 1.0,
  tp3Multiplier: 1.5,
  green: '#00ffbb',
  red: '#ff1100',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'len', type: 'int', title: 'Range Detection Period', defval: 99, group: 'Main Settings',
    tooltip: 'The period used to calculate the range for breakout detection.',
  },
  {
    id: 'preventOverlap', type: 'bool', title: 'Prevent Overlap', defval: true, group: 'Main Settings',
    tooltip: 'If enabled, prevents new boxes from overlapping with existing ones.',
  },
  {
    id: 'showTp', type: 'bool', title: 'Show Take Profit Levels', defval: true, group: 'Targets',
    tooltip: 'Toggle visibility of take profit target levels.',
  },
  {
    id: 'atrPeriod', type: 'int', title: 'Volatility (ATR) period', defval: 14, min: 1, group: 'Targets',
    tooltip: 'Period for Average True Range (ATR) calculation used for volatility.',
  },
  {
    id: 'slMultiplier', type: 'float', title: 'Stop Loss ATR Multiplier', defval: 5, min: 0.1, step: 0.1, group: 'Targets',
    tooltip: 'Multiplier for ATR to calculate Stop Loss distance.',
  },
  {
    id: 'tp1Multiplier', type: 'float', title: 'TP1 Multiplier', defval: 0.5, min: 0.1, step: 0.1, group: 'Targets',
    tooltip: 'Multiplier for risk distance to calculate Take Profit 1.',
  },
  {
    id: 'tp2Multiplier', type: 'float', title: 'TP2 Multiplier', defval: 1.0, min: 0.1, step: 0.1, group: 'Targets',
    tooltip: 'Multiplier for risk distance to calculate Take Profit 2.',
  },
  {
    id: 'tp3Multiplier', type: 'float', title: 'TP3 Multiplier', defval: 1.5, min: 0.1, step: 0.1, group: 'Targets',
    tooltip: 'Multiplier for risk distance to calculate Take Profit 3.',
  },
  {
    id: 'green', type: 'color', title: 'Bullish Colour', defval: '#00ffbb', group: 'Appearance',
    tooltip: 'Color used for bullish visuals and positive sentiment texts.',
  },
  {
    id: 'red', type: 'color', title: 'Bearish Colour', defval: '#ff1100', group: 'Appearance',
    tooltip: 'Color used for bearish visuals and negative sentiment texts.',
  },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Breakout Targets [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - Breakout Targets',
  overlay: true,
};

/** indicator(max_boxes_count = 500); lines keep the default of 50 */
const MAX_BOXES = 500;
const MAX_LINES = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const lt = (a: number, b: number) => gt(b, a);
const le = (a: number, b: number) => ge(b, a);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** A drawing of the script (`dead` = deleted; `kept` = a `var` variable of the script refers to it) */
interface Obj {
  dead: boolean;
  kept?: boolean;
}
interface BoxObj extends Obj {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
}
interface LineObj extends Obj {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  style: 'solid' | 'dashed';
}
interface LabelObj extends Obj {
  x: number;
  y: number;
  text: string;
  color: string;
}

/**
 * The drawing count limit of Pine: when a creation brings the count of one kind above max + 5, the oldest objects
 * are deleted until max remain. An object that a `var` variable still refers to is not deleted, but it counts.
 */
function register<T extends Obj>(list: T[], obj: T, max: number): T {
  list.push(obj);
  if (list.length > max + 5) {
    let excess = list.length - max;
    for (let k = 0; k < list.length && excess > 0;) {
      if (list[k].kept) {
        k++;
      } else {
        list[k].dead = true;
        list.splice(k, 1);
        excess--;
      }
    }
  }
  return obj;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<BreakoutTargetsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { len, green, red } = cfg;
  // overlap = not input.bool(true, "Prevent Overlap")
  const overlap = !cfg.preventOverlap;
  // chart.fg_color, syminfo.mintick
  const chartFg = foregroundColorOf(chart);
  const mintick = mintickOf(chart);
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // len_ = int(len / 2)
  const half = Math.trunc(len / 2);
  const pivh = A(ta.pivothigh(S(bars.map((b) => b.high)), half, half));
  const pivl = A(ta.pivotlow(S(bars.map((b) => b.low)), half, half));
  const body = S(bars.map((b) => Math.abs(b.close - b.open)));
  const v1 = ta.wma(body, len);
  const v2 = ta.ema(body, len);
  const crossunder = ta.crossunder(v1, v2).toArray().map((v) => Boolean(v));
  const volatility = A(ta.atr(bars, cfg.atrPeriod));
  const atrLen = A(ta.atr(bars, len));

  const fg90 = String(color.new(chartFg, 90));
  const fg50 = String(color.new(chartFg, 50));
  const red70 = String(color.new(red, 70));
  const green70 = String(color.new(green, 70));
  const red80 = String(color.new(red, 80));
  const green80 = String(color.new(green, 80));
  const red95 = String(color.new(red, 95));
  const green95 = String(color.new(green, 95));
  const priceText = (v: number) => str.tostring(v, 'mintick', mintick);

  // All alive objects in creation order (count limit), and the arrays of the running channels (newest first)
  const allBoxes: BoxObj[] = [];
  const allLines: LineObj[] = [];
  const boxes: BoxObj[] = [];
  const boxesU: BoxObj[] = [];
  const boxesL: BoxObj[] = [];
  const centerLines: LineObj[] = [];
  const newBox = (left: number, top: number, right: number, bottom: number, bg: string) =>
    register<BoxObj>(allBoxes, { dead: false, left, top, right, bottom, bg }, MAX_BOXES);

  // The trade: entry, stop loss and three targets (lines and labels), and two linefills
  let tradeLines: LineObj[] = [];
  let tradeLabels: LabelObj[] = [];
  let fills: Array<{ line1: LineObj; line2: LineObj; color: string }> = [];
  let tradeDir = 0;
  let tp3Hit = false;

  const markers: MarkerData[] = [];
  // ta.valuewhen(not na(pivh), high[len_], 0) and the same for the bar index and the pivot lows
  let pivhLvl = NaN;
  let pivhIndex = NaN;
  let pivlLvl = NaN;
  let pivlIndex = NaN;
  let wede = 0;
  const flags: boolean[][] = [[], [], [], [], [], []];

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const { close } = bar;
    if (!Number.isNaN(pivh[i])) {
      pivhLvl = bars[i - half].high;
      pivhIndex = i - half;
    }
    if (!Number.isNaN(pivl[i])) {
      pivlLvl = bars[i - half].low;
      pivlIndex = i - half;
    }
    const vola = atrLen[i] / 2;

    // wede := boxes.first().get_right() (na when the box was deleted)
    if (boxes.length > 0) wede = boxes[0].dead ? NaN : boxes[0].right;

    if (crossunder[i]) {
      let h = NaN;
      let l = NaN;
      let startIdx: number;
      if (pivhIndex > pivlIndex) {
        // The pivot high is the closest: the lowest low since it
        h = pivhLvl;
        startIdx = pivhIndex;
        const dist = i - startIdx;
        if (dist > 0) {
          let minVal = bar.high;
          for (let k = 0; k <= dist - 1; k++) minVal = Math.min(minVal, bars[i - k].low);
          l = minVal;
        }
      } else {
        // The pivot low is the closest: the highest high since it
        l = pivlLvl;
        startIdx = pivlIndex;
        const dist = i - startIdx;
        if (dist > 0) {
          let maxVal = bar.low;
          for (let k = 0; k <= dist - 1; k++) maxVal = Math.max(maxVal, bars[i - k].high);
          h = maxVal;
        }
      }
      if (!Number.isNaN(h) && !Number.isNaN(l) && ge(h, close) && ge(close, l) && (overlap || startIdx > wede)) {
        boxes.unshift(newBox(startIdx, h, i, l, fg90));
        boxesU.unshift(newBox(startIdx, h, i, h - vola, red70));
        boxesL.unshift(newBox(startIdx, l + vola, i, l, green70));
        const centerY = (h + l) / 2;
        centerLines.unshift(register<LineObj>(
          allLines, { dead: false, x1: startIdx, y1: centerY, x2: i, y2: centerY, color: fg50, width: 1, style: 'dashed' }, MAX_LINES,
        ));
      }
    }

    let upbreak = 0;
    let downbreak = 0;
    let newBreakout = false;

    // Breakouts and running channels, from the oldest channel to the newest
    for (let k = boxes.length - 1; k >= 0; k--) {
      const b = boxes[k];
      // A deleted box has na coordinates
      const top = b.dead ? NaN : b.top;
      const bot = b.dead ? NaN : b.bottom;
      const isUp = gt(close, top);
      if (isUp || gt(bot, close)) {
        if (isUp) upbreak = bot;
        else downbreak = top;
        boxes.splice(k, 1);
        boxesU.splice(k, 1);
        boxesL.splice(k, 1);
        centerLines.splice(k, 1);

        if (cfg.showTp) {
          newBreakout = true;
          tradeDir = isUp ? 1 : -1;
          tp3Hit = false;
          const sl = isUp ? bar.low - volatility[i] * cfg.slMultiplier : bar.high + volatility[i] * cfg.slMultiplier;
          const risk = Math.abs(close - sl);
          const sign = isUp ? 1 : -1;
          const tp1 = close + sign * risk * cfg.tp1Multiplier;
          const tp2 = close + sign * risk * cfg.tp2Multiplier;
          const tp3 = close + sign * risk * cfg.tp3Multiplier;

          // line.delete() / label.delete() / linefill.delete() of the trade before
          for (const ln of tradeLines) {
            ln.dead = true;
            allLines.splice(allLines.indexOf(ln), 1);
          }
          const entryColor = isUp ? green : red;
          const levels: Array<[number, string, string]> = [
            [close, entryColor, 'Entry ▸ '],
            [sl, red80, '✘ SL ▸ '],
            [tp1, green80, ' ✔ TP1 ▸ '],
            [tp2, green80, ' ✔ TP2 ▸ '],
            [tp3, green80, ' ✔ TP3 ▸ '],
          ];
          tradeLines = [];
          tradeLabels = [];
          for (const [y, col, text] of levels) {
            tradeLines.push(register<LineObj>(
              allLines, { dead: false, kept: true, x1: i, y1: y, x2: i, y2: y, color: col, width: 3, style: 'solid' }, MAX_LINES,
            ));
            tradeLabels.push({ dead: false, x: i, y, text: text + priceText(y), color: col });
          }
          fills = [
            { line1: tradeLines[0], line2: tradeLines[1], color: red95 },
            { line1: tradeLines[0], line2: tradeLines[4], color: green95 },
          ];
        }
      } else {
        for (const box of [b, boxesU[k], boxesL[k]]) if (!box.dead) box.right = i;
        if (!centerLines[k].dead) centerLines[k].x2 = i;
      }
    }

    if (!newBreakout && !tp3Hit) {
      for (const ln of tradeLines) ln.x2 = i;
      for (const lb of tradeLabels) lb.x = i;
      // tp3_level = line.get_y1(tp3_line)
      const tp3Level = tradeLines.length > 0 ? tradeLines[4].y1 : NaN;
      if (!Number.isNaN(tp3Level)) {
        if (tradeDir === 1 && ge(bar.high, tp3Level)) tp3Hit = true;
        else if (tradeDir === -1 && ge(tp3Level, bar.low)) tp3Hit = true;
      }
    }

    // alertcondition(upbreak != 0, "Bullish Breakout") / alertcondition(downbreak != 0, "Bearish Breakout")
    const isUpbreak = !Number.isNaN(upbreak) && !eq(upbreak, 0);
    const isDownbreak = !Number.isNaN(downbreak) && !eq(downbreak, 0);
    flags[0].push(isUpbreak);
    flags[1].push(isDownbreak);
    // tp1_val .. sl_val = line.get_y1(...) of the current trade (na without a trade); levels crossed on this bar
    const [slVal, tp1Val, tp2Val, tp3Val] = tradeLines.length > 0
      ? [tradeLines[1].y1, tradeLines[2].y1, tradeLines[3].y1, tradeLines[4].y1] : [NaN, NaN, NaN, NaN];
    const high1 = i > 0 ? bars[i - 1].high : NaN;
    const low1 = i > 0 ? bars[i - 1].low : NaN;
    let tp1HitCond = false;
    let tp2HitCond = false;
    let tp3HitCondAlert = false;
    let slHitCond = false;
    if (!Number.isNaN(tp1Val)) {
      if (tradeDir === 1) {
        tp1HitCond = ge(bar.high, tp1Val) && lt(high1, tp1Val);
        tp2HitCond = ge(bar.high, tp2Val) && lt(high1, tp2Val);
        tp3HitCondAlert = ge(bar.high, tp3Val) && lt(high1, tp3Val);
        slHitCond = le(bar.low, slVal) && gt(low1, slVal);
      } else if (tradeDir === -1) {
        tp1HitCond = le(bar.low, tp1Val) && gt(low1, tp1Val);
        tp2HitCond = le(bar.low, tp2Val) && gt(low1, tp2Val);
        tp3HitCondAlert = le(bar.low, tp3Val) && gt(low1, tp3Val);
        slHitCond = ge(bar.high, slVal) && lt(high1, slVal);
      }
    }
    flags[2].push(tp1HitCond);
    flags[3].push(tp2HitCond);
    flags[4].push(tp3HitCondAlert);
    flags[5].push(slHitCond);

    // plotshape(upbreak != 0 ? upbreak : na, ...), plotshape(downbreak != 0 ? downbreak : na, ...)
    if (isUpbreak) {
      markers.push({
        time: bar.time, position: 'atPriceBottom', price: upbreak, shape: 'labelUp', color: green, text: '▲', textColor: chartFg,
      });
    }
    if (isDownbreak) {
      markers.push({
        time: bar.time, position: 'atPriceTop', price: downbreak, shape: 'labelDown', color: red, text: '▼', textColor: chartFg,
      });
    }
  }

  const time = (index: number) => barTime(bars, index);
  const lineOut = (ln: LineObj): LineDrawingData => ({
    time1: time(ln.x1), price1: ln.y1, time2: time(ln.x2), price2: ln.y2, color: ln.color, width: ln.width, style: ln.style,
  });
  // A box of a v6 script has a white text colour by default
  const boxOut: BoxData[] = allBoxes.map((b) => ({
    time1: time(b.left), price1: b.top, time2: time(b.right), price2: b.bottom, bgColor: b.bg, borderColor: 'transparent',
    textColor: '#FFFFFF',
  }));
  // A line or a label with an na price is not drawn
  const drawn = (ln: LineObj) => !Number.isNaN(ln.y1) && !Number.isNaN(ln.y2);
  const labels: LabelData[] = tradeLabels.filter((lb) => !Number.isNaN(lb.y)).map((lb) => ({
    time: time(lb.x), price: lb.y, text: lb.text, color: lb.color, textColor: '#FFFFFF', style: 'label_left',
  }));
  const linefills: LinefillData[] = fills.filter((f) => drawn(f.line1) && drawn(f.line2))
    .map((f) => ({ line1: lineOut(f.line1), line2: lineOut(f.line2), color: f.color }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    boxes: boxOut,
    lines: allLines.filter(drawn).map(lineOut),
    labels,
    linefills,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

export const BreakoutTargets = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
