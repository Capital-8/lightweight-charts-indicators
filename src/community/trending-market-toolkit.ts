/**
 * Trending Market Toolkit [LuxAlgo]
 *
 * Swing points come from legs: a bar that makes the highest high of the last "Swing Length" bars starts an up leg, a
 * bar that makes the lowest low starts a down leg, and each change of leg gives a swing point at the extreme of the
 * leg that ended. The swings can be read on a higher timeframe ("Custom Timeframe"); the script sees a swing one bar
 * of that timeframe after the leg changed.
 *
 * - Reversal: five swings where the third is inside the first two, the second inside the third and fourth, and the
 *   third inside the last two. A line is drawn from the first swing through the third, up to the time of the fifth,
 *   and the reversal area is the second swing plus / minus "Reversal Area Threshold" times the 200-bar ATR.
 * - Trend continuation (only while no reversal area is being watched): four swings where the first and the last are
 *   inside the two middle ones. A line joins the second swing to the fourth, and the retracement area is the 0.5 to
 *   0.618 part of the move that follows the fourth swing (a box that follows the price).
 * - When price comes back into an area a box "Reversal" / "Continuation" is drawn, and the next close through the
 *   latest swing of the "Trade Trigger Length" legs opens a trade: entry at the close, stop one tick beyond the area
 *   (or beyond the extreme without "High Risk to Reward"), target at the extreme of the move (or one of the two
 *   extensions). The trade is only taken when its reward / risk ratio reaches the threshold. It is drawn with a
 *   risk box (with the ratio), a reward box and a dashed line from the swing that was crossed, and it ends when the
 *   stop or the target is touched. Nothing new is looked for while a trade is open.
 *
 * As in the original (calc_bars_count = 5000) only the last "Calculated bars" bars are calculated (0 = all bars); on
 * a custom timeframe the swings are computed on the same span of time. At most 500 lines and 500 boxes are kept.
 *
 * The bars of the custom timeframe are built from the chart bars (the original reads the bars of that timeframe: on
 * a stock, the real daily bars can differ by a tick from the days built from intraday bars). A timeframe below the
 * chart timeframe is an error, as in the original.
 *
 * Chart context: `chart.mintick` is the tick of the price levels (without it 0.01); `chart.lastBarConfirmed`: a last
 * bar that is still open is not processed; `chart.timeframe` is the chart timeframe (without it, it is taken from
 * the bars); the periods of the custom timeframe follow the exchange calendar when the context gives the time zone
 * and the session, else the UTC calendar.
 *
 * Reference: "Trending Market Toolkit [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, math, color, callsite, timeframe, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LineDrawingData } from '../types';
import { lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';

export interface TrendingMarketToolkitInputs {
  executionMode: 'Both' | 'Trends' | 'Reversals';
  pivotLength: number;
  /** Timeframe of the swings ("" = the chart timeframe) */
  customTimeframe: string;
  /** Half height of the reversal area, in 200-bar ATR */
  reversalAreaThreshold: number;
  internalLength: number;
  targetMode: '0' | '0.27' | '0.618';
  risk2RewardThreshold: number;
  highRisk2Reward: boolean;
  /** Calculated bars (Pine calc_bars_count): only the last bars are calculated */
  calcBarsCount: number;
}

export const defaultInputs: TrendingMarketToolkitInputs = {
  executionMode: 'Both',
  pivotLength: 5,
  customTimeframe: '',
  reversalAreaThreshold: 0.5,
  internalLength: 2,
  targetMode: '0',
  risk2RewardThreshold: 3.0,
  highRisk2Reward: true,
  calcBarsCount: 5000,
};

export const inputConfig: InputConfig[] = [
  { id: 'executionMode', type: 'string', title: 'Show', defval: 'Both', options: ['Both', 'Trends', 'Reversals'] },
  { id: 'pivotLength', type: 'int', title: 'Swing Length', defval: 5, min: 2, group: 'STRUCTURES',
    tooltip: 'Number of candles to confirm a swing high or swing low. A higher number detects larger swings.' },
  { id: 'customTimeframe', type: 'timeframe', title: 'Custom Timeframe', defval: '', group: 'STRUCTURES' },
  { id: 'reversalAreaThreshold', type: 'float', title: 'Reversal Area Threshold', defval: 0.5, group: 'STRUCTURES' },
  { id: 'internalLength', type: 'int', title: 'Trade Trigger Length', defval: 2, min: 2, group: 'TRADES',
    tooltip: 'Number of candles to confirm a internal high or internal low. A lower number detects smaller swings. It must be the same size or smaller than the swing length.' },
  { id: 'targetMode', type: 'string', title: 'Extension', defval: '0', options: ['0', '0.27', '0.618'], group: 'TRADES',
    tooltip: 'Traders can choose between the default target (0) or two extended targets (0.27 or 0.618)' },
  { id: 'risk2RewardThreshold', type: 'float', title: 'Risk to Reward Threshold', defval: 3.0, min: 0, step: 0.25, group: 'TRADES' },
  { id: 'highRisk2Reward', type: 'bool', title: 'High Risk to Reward', defval: true, group: 'TRADES' },
  { id: 'calcBarsCount', type: 'int', title: 'Calculated bars', defval: 5000, min: 0, group: 'Calculation' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Trending Market Toolkit [LuxAlgo]',
  shortTitle: 'LuxAlgo - Trending Market Toolkit',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;
const GREEN = '#089981';
const RED = '#F23645';
const HIGH = 1;
const LOW = 0;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** type swingPoint */
interface SwingPoint {
  time: number;
  index: number;
  price: number;
  swing: number;
}
/** type trendline: its points (chart.point: time, index, price) and its colour */
interface Trendline {
  points: SwingPoint[];
  color: string;
}
/** type retracement */
interface Retracement {
  trend: Trendline | null;
  retraced: boolean;
  checkable: boolean;
  trade: boolean;
  top: number;
  bottom: number;
  max: number;
  min: number;
  endIndex: number;
}
interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  border: string;
  bg: string;
  text: string;
  textColor: string | null;
  valign: 'top' | 'center' | 'bottom';
  extend: 'none' | 'right';
  deleted: boolean;
}
interface Ln {
  time1: number;
  price1: number;
  time2: number;
  price2: number;
  color: string;
  width: number;
  dashed: boolean;
  deleted: boolean;
}

/**
 * getPivots(length, size) on the bars of one timeframe: one call per bar, in order. `index` is the bar index of that
 * timeframe. Returns the list of the last `size` swing points (the same list on every call).
 */
function pivotTracker(context: Bar[], length: number, size: number) {
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const highest = A(ta.highest(new Series(context, (b) => b.high), length));
  const lowest = A(ta.lowest(new Series(context, (b) => b.low), length));
  const pivots: SwingPoint[] = [];
  let pivotHighPrice = 0;
  let pivotLowPrice = 0;
  let pivotIndex = 0;
  let pivotTime = 0;
  let currentLeg = 0;
  return (k: number, index: number, confirmed: boolean): SwingPoint[] => {
    const b = context[k];
    const legBefore = currentLeg;
    const newHigh = eq(b.high, highest[k]);
    const newLow = eq(b.low, lowest[k]);
    currentLeg = newHigh ? HIGH : newLow ? LOW : currentLeg;
    // ta.change(currentLeg): na on the first bar
    const change = k > 0 ? currentLeg - legBefore : NaN;
    const pivotLow = change === 1;
    const pivotHigh = change === -1;
    if (confirmed) {
      if (pivotLow || pivotHigh) {
        if (pivots.length >= size) pivots.shift();
        pivots.push({ time: pivotTime, index: pivotIndex, price: pivotLow ? pivotLowPrice : pivotHighPrice, swing: pivotLow ? LOW : HIGH });
      }
      pivotHighPrice = pivotLow ? b.high : Math.max(b.high, pivotHighPrice);
      pivotLowPrice = pivotHigh ? b.low : Math.min(b.low, pivotLowPrice);
      if ((currentLeg === HIGH && eq(pivotHighPrice, b.high)) || (currentLeg === LOW && eq(pivotLowPrice, b.low))) {
        pivotIndex = index;
        pivotTime = b.time;
      }
    }
    return pivots;
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendingMarketToolkitInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines'> & { boxes: BoxData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const total = bars.length;
  const MINTICK = mintickOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const roundToTick = (v: number) => math.round_to_mintick(v, MINTICK);
  const pivotLength = Math.trunc(cfg.pivotLength);
  const internalLength = Math.trunc(cfg.internalLength);
  const showTrends = cfg.executionMode === 'Both' || cfg.executionMode === 'Trends';
  const showReversals = cfg.executionMode === 'Both' || cfg.executionMode === 'Reversals';
  const BULLISH_BOX = String(color.new(GREEN, 90));
  const BEARISH_BOX = String(color.new(RED, 90));

  const chartTf = chartTimeframe(bars, chart);
  const tf = cfg.customTimeframe.trim();
  const chartSeconds = chartTf === '' ? NaN : timeframe.in_seconds(chartTf);
  const higher = tf !== '' && chartTf !== '' && timeframe.in_seconds(tf) !== chartSeconds;
  if (higher && timeframe.in_seconds(tf) < chartSeconds) {
    throw new Error('Select a `Custom Timeframe` on the settings panel equal or higher than the chart timaframe.');
  }

  // calc_bars_count: the script runs on the last bars only
  const start = Math.max(0, total - (cfg.calcBarsCount > 0 ? Math.trunc(cfg.calcBarsCount) : total));
  const calc = bars.slice(start);
  const n = calc.length;
  const ms = total > 0 && bars[0].time >= 1e12;
  // timeframe.in_seconds() * 1000, in the unit of the bar times
  const timeUnit = chartSeconds * (ms ? 1000 : 1);
  const lastBarTime = total > 0 ? bars[total - 1].time : NaN;

  // Swings of the custom timeframe, as request.security(..., getPivots(...)[1], lookahead_on) gives them: on each
  // chart bar the list as it was one bar of that timeframe before the bar of the timeframe that contains the chart bar
  const swingAt: Array<SwingPoint[] | null> = new Array(n).fill(null);
  {
    let context = calc;
    let group = calc.map((_, k) => k);
    if (higher) {
      // the bars of the timeframe, built from the chart bars
      const exchange = securityBars(bars, tf, chart);
      let htf: Bar[] = [];
      let groupAll: number[] = [];
      if (exchange) {
        htf = exchange.htf;
        groupAll = exchange.group;
      } else {
        const starts = periodStarts(bars, tf);
        bars.forEach((b, k) => {
          if (k === 0 || starts[k] !== starts[k - 1]) {
            htf.push({ time: starts[k], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
          } else {
            const last = htf[htf.length - 1];
            last.high = Math.max(last.high, b.high);
            last.low = Math.min(last.low, b.low);
            last.close = b.close;
          }
          groupAll.push(htf.length - 1);
        });
      }
      // calc_bars_count on the timeframe: the same span of time counted in bars of that timeframe (the last one
      // included), e.g. 5000 daily bars give the last 714 weekly bars
      const count = cfg.calcBarsCount > 0
        ? Math.floor((Math.trunc(cfg.calcBarsCount) * chartSeconds) / timeframe.in_seconds(tf))
        : htf.length;
      const first = Math.max(0, htf.length - count);
      context = htf.slice(first);
      group = calc.map((_, k) => groupAll[start + k] - first);
    }
    // bar_index counts from the first calculated bar, in the chart bars or in the bars of the timeframe
    const track = pivotTracker(context, pivotLength, 5);
    const after: SwingPoint[][] = [];
    let previous: SwingPoint[] = [];
    for (let g = 0; g < context.length; g++) {
      const list = track(g, g, true);
      const changed = list.length !== previous.length || list.some((p, k) => p !== previous[k]);
      if (changed) previous = list.slice();
      after.push(previous);
    }
    for (let k = 0; k < n; k++) swingAt[k] = group[k] > 0 ? after[group[k] - 1] : null;
  }

  // reversalAreaThresholdInput = input * ta.atr(200)
  const atr = ta.atr(calc, 200).toArray().map((v) => v ?? NaN);

  // Drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain. The box held by the `var box` variable (the retracement area) is never deleted by this limit.
  const lines: Ln[] = [];
  const boxes: Bx[] = [];
  const limit = <T extends { deleted: boolean }>(list: T[], keep: T | null) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (list[k] === keep) k++;
      else list.splice(k, 1)[0].deleted = true;
    }
  };
  let updatableBox: Bx | null = null;
  const newBox = (b: Omit<Bx, 'deleted'>): Bx => {
    const o = { ...b, deleted: false };
    boxes.push(o);
    limit(boxes, updatableBox);
    return o;
  };
  const newLine = (l: Omit<Ln, 'deleted'>) => {
    lines.push({ ...l, deleted: false });
    limit(lines, null);
  };
  const deleteBox = (b: Bx | null) => {
    if (!b || b.deleted) return;
    b.deleted = true;
    boxes.splice(boxes.indexOf(b), 1);
  };

  // var openTrade = trade.new()
  const openTrade = {
    active: false, bias: NaN, entryTime: NaN, exitTime: NaN, entry: NaN, stop: NaN, target: NaN,
    risk: null as Bx | null, reward: null as Bx | null,
  };
  const newRetracement = (): Retracement => ({
    trend: null, retraced: false, checkable: false, trade: false, top: 0, bottom: 0, max: 0, min: 0, endIndex: 0,
  });
  const potential = newRetracement();
  const reversal = newRetracement();
  const trendlines: Trendline[] = [];
  const reversals: Trendline[] = [];

  // newPivot(): ta.change(currentPivot.barIndex), from the first bar where the list has a swing
  let pivotIndexBefore = NaN;
  // One history per ta.crossover / ta.crossunder call: the bars where the call runs
  const reversalCrossUnder = callsite.crossunder();
  const reversalCrossOver = callsite.crossover();
  const reversalEntryOver = callsite.crossover();
  const reversalEntryUnder = callsite.crossunder();
  const trendCrossUnder = callsite.crossunder();
  const trendCrossOver = callsite.crossover();
  const entryOver = callsite.crossover();
  const entryUnder = callsite.crossunder();
  const internal = pivotTracker(calc, internalLength, pivotLength);

  const inside = (p: SwingPoint, top: SwingPoint, bottom: SwingPoint) => le(p.price, top.price) && ge(p.price, bottom.price);
  const isBullish = (t: Trendline) => gt(t.points[0].price, t.points[1].price);
  const getTarget = (max: number, min: number, long: boolean) => {
    const anchor = long ? max : min;
    const bias = long ? 1 : -1;
    if (cfg.targetMode === '0.27') return anchor + bias * 0.27 * (max - min);
    if (cfg.targetMode === '0.618') return anchor + bias * 0.618 * (max - min);
    return anchor;
  };

  for (let k = 0; k < n; k++) {
    if (k === n - 1 && !lastConfirmed) break;
    const b = calc[k];
    const time = b.time;
    if (k === 0) {
      // var box updatableBox = box.new(na, na, na, na, xloc = xloc.bar_time)
      updatableBox = newBox({
        left: NaN, top: NaN, right: NaN, bottom: NaN, border: '#2962FF', bg: '#2962FF', text: '', textColor: null,
        valign: 'center', extend: 'none',
      });
    }

    const closeOpenTrade = () => {
      if (!openTrade.active) return;
      openTrade.active = false;
      openTrade.exitTime = time;
      if (openTrade.exitTime === openTrade.entryTime) {
        deleteBox(openTrade.risk);
        deleteBox(openTrade.reward);
      } else {
        for (const box of [openTrade.risk, openTrade.reward]) {
          if (box && !box.deleted) {
            box.right = openTrade.exitTime;
            box.extend = 'none';
          }
        }
      }
    };
    const newOpenTrade = (entry: number, stop: number, target: number, bullish: boolean, lastIndex: number, point: SwingPoint) => {
      const riskReward = Math.abs(target - entry) / Math.abs(stop - entry);
      const goodTrade = (bullish && gt(entry, stop) && gt(target, entry)) || (!bullish && lt(entry, stop) && lt(target, entry));
      if (!(goodTrade && ge(riskReward, cfg.risk2RewardThreshold) && k > lastIndex)) return;
      openTrade.active = true;
      openTrade.bias = bullish ? 1 : 0;
      openTrade.entryTime = time;
      openTrade.exitTime = lastBarTime;
      openTrade.entry = entry;
      openTrade.stop = stop;
      openTrade.target = target;
      openTrade.risk = newBox({
        left: time, top: bullish ? entry : stop, right: lastBarTime, bottom: bullish ? stop : entry, border: RED,
        bg: BEARISH_BOX, text: `R : R\n1 : ${str.tostring(riskReward, '0.00')}`, textColor: '#FFFFFF',
        valign: bullish ? 'bottom' : 'top', extend: 'right',
      });
      openTrade.reward = newBox({
        left: time, top: bullish ? target : entry, right: lastBarTime, bottom: bullish ? entry : target, border: GREEN,
        bg: BULLISH_BOX, text: '', textColor: null, valign: 'center', extend: 'right',
      });
      // line.new(chartPoint(point), chart.point.now(point.priceLevel)) with the default xloc.bar_index
      newLine({
        time1: point.index >= 0 && point.index < n ? calc[point.index].time : NaN, price1: point.price, time2: time,
        price2: point.price, color: bullish ? GREEN : RED, width: 1, dashed: true,
      });
    };

    // swingPoints := getPivotsCustomTF(...); newPivot(swingPoints)
    const swingPoints = swingAt[k];
    let isNewPivot = false;
    if (swingPoints !== null && swingPoints.length > 0) {
      const current = swingPoints[swingPoints.length - 1].index;
      const change = current - pivotIndexBefore;
      isNewPivot = !isNaN(change) && change !== 0;
      pivotIndexBefore = current;
    }

    if (isNewPivot && !openTrade.active && swingPoints !== null) {
      const size = swingPoints.length;
      // getReversal()
      if (showReversals && size >= 5) {
        const [p1, p2, p3, p4, p5] = swingPoints.slice(size - 5);
        const bullishReversal = p1.swing === HIGH && inside(p3, p1, p2) && inside(p2, p3, p4) && inside(p3, p5, p4);
        const bearishReversal = p1.swing === LOW && inside(p3, p2, p1) && inside(p2, p4, p3) && inside(p3, p4, p5);
        if (bullishReversal || bearishReversal) {
          const trend: Trendline = { points: [p1, p2, p3, p4, p5], color: bullishReversal ? RED : GREEN };
          reversals.push(trend);
          // plotLastRevesal()
          const slope = (p3.price - p1.price) / (p3.index - p1.index);
          newLine({
            time1: p1.time, price1: p1.price, time2: p5.time, price2: p3.price + slope * (p5.index - p3.index),
            color: trend.color, width: 2, dashed: false,
          });
          // newReversalRetracement()
          reversal.trend = trend;
          reversal.retraced = false;
          reversal.trade = false;
          reversal.endIndex = p5.index;
          reversal.checkable = true;
          const threshold = cfg.reversalAreaThreshold * atr[k];
          reversal.top = roundToTick(p2.price + threshold);
          reversal.bottom = roundToTick(p2.price - threshold);
          const bullishRetracement = isBullish(trend);
          reversal.max = roundToTick(bullishRetracement ? p5.price : p4.price);
          reversal.min = roundToTick(bullishRetracement ? p4.price : p5.price);
        }
      }
      // getTrendContinuation()
      if (showTrends && !reversal.checkable && size >= 4) {
        const [p1, p2, p3, p4] = swingPoints.slice(size - 4);
        const bullishTrend = p1.swing === HIGH && inside(p1, p3, p2) && inside(p4, p3, p2);
        const bearishTrend = p1.swing === LOW && inside(p1, p2, p3) && inside(p4, p2, p3);
        if (bullishTrend || bearishTrend) {
          const trend: Trendline = { points: [p1, p2, p3, p4], color: bullishTrend ? GREEN : RED };
          trendlines.push(trend);
          // plotLastTrendline()
          newLine({ time1: p2.time, price1: p2.price, time2: p4.time, price2: p4.price, color: trend.color, width: 2, dashed: false });
          // newLastRetracement()
          potential.trend = trend;
          potential.retraced = false;
          potential.checkable = true;
          potential.trade = false;
          potential.top = NaN;
          potential.bottom = NaN;
          potential.max = p4.price;
          potential.min = p4.price;
          potential.endIndex = p4.index;
        }
      }
    }

    const internalPoints = internal(k, k, true);
    /** The latest swing high and swing low of the trade trigger legs */
    const internalHighLow = (): [SwingPoint, SwingPoint] => {
      const last = internalPoints[internalPoints.length - 1];
      const before = internalPoints[internalPoints.length - 2];
      return [last.swing === HIGH ? last : before, last.swing === LOW ? last : before];
    };

    if (showReversals && !openTrade.active) {
      // updateReversalRetracement()
      if (reversals.length > 0 && reversal.checkable && !reversal.retraced && reversal.trend) {
        reversal.endIndex = k;
        const bullish = isBullish(reversal.trend);
        const under = reversalCrossUnder(b.close, reversal.bottom);
        const over = reversalCrossOver(b.close, reversal.top);
        if (bullish && under) reversal.checkable = false;
        if (!bullish && over) reversal.checkable = false;
        if ((bullish && le(b.low, reversal.top)) || (!bullish && ge(b.high, reversal.bottom))) {
          reversal.retraced = true;
          newBox({
            left: reversal.trend.points[1].time, top: reversal.top, right: time + timeUnit, bottom: reversal.bottom,
            border: bullish ? GREEN : RED, bg: bullish ? BULLISH_BOX : BEARISH_BOX, text: 'Reversal',
            textColor: bullish ? GREEN : RED, valign: 'center', extend: 'none',
          });
        }
      }
      // getReversalEntry()
      if (internalPoints.length > 1 && reversals.length > 0 && reversal.retraced && reversal.checkable && !reversal.trade && reversal.trend) {
        const bullish = isBullish(reversal.trend);
        const [lastHigh, lastLow] = internalHighLow();
        const over = reversalEntryOver(b.close, lastHigh.price);
        const under = reversalEntryUnder(b.close, lastLow.price);
        if (bullish && over) {
          closeOpenTrade();
          const target = getTarget(reversal.max, reversal.min, true);
          newOpenTrade(b.close, (cfg.highRisk2Reward ? reversal.bottom : reversal.min) - MINTICK, target, bullish, reversal.endIndex, lastHigh);
          reversal.trade = true;
        }
        if (!bullish && under) {
          closeOpenTrade();
          const target = getTarget(reversal.max, reversal.min, false);
          newOpenTrade(b.close, (cfg.highRisk2Reward ? reversal.top : reversal.max) + MINTICK, target, bullish, reversal.endIndex, lastLow);
          reversal.trade = true;
        }
      }
    }

    if (showTrends && !openTrade.active && !reversal.checkable) {
      // updateLastRetracement()
      if (trendlines.length > 0 && !potential.retraced && potential.checkable && potential.trend) {
        potential.endIndex = k;
        const bullish = isBullish(potential.trend);
        const point4 = potential.trend.points[potential.trend.points.length - 1];
        if (bullish) {
          if (gt(b.high, point4.price)) {
            potential.max = Math.max(potential.max, b.high);
            potential.top = roundToTick(potential.max - 0.5 * (potential.max - potential.min));
            potential.bottom = roundToTick(potential.max - 0.618 * (potential.max - potential.min));
          }
        } else if (lt(b.low, point4.price)) {
          potential.min = Math.min(potential.min, b.low);
          potential.top = roundToTick(potential.min + 0.618 * (potential.max - potential.min));
          potential.bottom = roundToTick(potential.min + 0.5 * (potential.max - potential.min));
        }
        if (!isNaN(potential.top)) {
          const under = trendCrossUnder(b.close, potential.bottom);
          const over = trendCrossOver(b.close, potential.top);
          if (bullish && under) potential.checkable = false;
          if (!bullish && over) potential.checkable = false;

          if (updatableBox && !updatableBox.deleted) {
            updatableBox.top = potential.top;
            updatableBox.bottom = potential.bottom;
            updatableBox.left = point4.time;
            updatableBox.right = time + (time - (k > 0 ? calc[k - 1].time : NaN));
            updatableBox.border = bullish ? GREEN : RED;
            updatableBox.bg = bullish ? BULLISH_BOX : BEARISH_BOX;
          }

          if (
            (bullish && le(b.low, potential.top) && ge(b.close, potential.bottom)) ||
            (!bullish && ge(b.high, potential.bottom) && le(b.close, potential.top))
          ) {
            potential.retraced = true;
            newBox({
              left: point4.time, top: potential.top, right: time + timeUnit, bottom: potential.bottom,
              border: bullish ? GREEN : RED, bg: bullish ? BULLISH_BOX : BEARISH_BOX, text: 'Continuation',
              textColor: bullish ? GREEN : RED, valign: 'center', extend: 'none',
            });
          }
        }
      }
      // getEntry()
      if (internalPoints.length > 1 && trendlines.length > 0 && potential.retraced && potential.checkable && !potential.trade && potential.trend) {
        const bullish = isBullish(potential.trend);
        const points = potential.trend.points;
        const [lastHigh, lastLow] = internalHighLow();
        const over = entryOver(b.close, lastHigh.price);
        const under = entryUnder(b.close, lastLow.price);
        if (bullish && over) {
          closeOpenTrade();
          const target = getTarget(Math.max(potential.max, points[2].price), points[3].price, true);
          newOpenTrade(b.close, (cfg.highRisk2Reward ? potential.bottom : potential.min) - MINTICK, target, bullish, potential.endIndex, lastHigh);
          potential.trade = true;
        }
        if (!bullish && under) {
          closeOpenTrade();
          const target = getTarget(points[3].price, Math.min(potential.min, points[2].price), false);
          newOpenTrade(b.close, (cfg.highRisk2Reward ? potential.top : potential.max) + MINTICK, target, bullish, potential.endIndex, lastLow);
          potential.trade = true;
        }
      }
    }

    // updateOpenTrade()
    if (openTrade.active) {
      const bullish = openTrade.bias === 1;
      const stopHit = bullish ? le(b.low, openTrade.stop) : ge(b.high, openTrade.stop);
      const targetHit = bullish ? ge(b.high, openTrade.target) : le(b.low, openTrade.target);
      if (stopHit || targetHit) closeOpenTrade();
    }
  }

  const drawn = (...v: number[]) => v.every((x) => !isNaN(x));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // an object with an na coordinate is not drawn
    lines: lines.filter((l) => drawn(l.time1, l.price1, l.time2, l.price2)).map((l) => ({
      time1: l.time1, price1: l.price1, time2: l.time2, price2: l.price2, color: l.color, width: l.width,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
    })),
    boxes: boxes.filter((b) => drawn(b.left, b.top, b.right, b.bottom)).map((b) => ({
      time1: b.left, price1: b.top, time2: b.right, price2: b.bottom, bgColor: b.bg, borderColor: b.border,
      ...(b.text !== '' ? { text: b.text } : {}),
      ...(b.textColor !== null ? { textColor: b.textColor } : {}),
      ...(b.valign !== 'center' ? { textVAlign: b.valign } : {}),
      ...(b.extend === 'right' ? { extend: 'right' as const } : {}),
    })),
  };
}

export const TrendingMarketToolkit = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
