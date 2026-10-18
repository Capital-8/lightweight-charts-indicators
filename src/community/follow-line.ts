/**
 * Follow Line Indicator
 *
 * Bollinger Bands breakout (SMA +/- stdev x "BB Deviations" of the close) sets the trend line: a close above the
 * upper band moves it to the low minus the ATR (the low without "ATR Filter"), never lower than before; a close below
 * the lower band moves it to the high plus the ATR (the high), never higher than before; inside the bands it stays.
 * The trend turns up when the line rises and down when it falls; the line is blue in an up trend, else red.
 * A bomb label below the line (line - ATR(8)) marks a turn up, a hammer label above it (line + ATR(8)) a turn down
 * ("Hide Labels" removes them).
 * As in the original, each ATR is computed only on the bars where the original calls it (its own history): the ATR of
 * the up move on the bars closing above the upper band, the one of the down move on the bars closing below the lower
 * band, the ATR(8) of a label on the bars of that label. An ATR with fewer calls than its length is na: the trend line
 * is na on such a breakout bar, and the first 7 labels of each kind have no price (not drawn).
 * Alerts (alertcondition, `alerts` of the result): 'Sell', 'Buy' and 'Buy/Sell' on the bars where the trend turns.
 *
 * Reference: "Follow Line Indicator" by Dreadblitz
 */

import { taCore, callsite, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FollowLineInputs {
  bbPeriod: number;
  bbDeviations: number;
  useATRFilter: boolean;
  atrPeriod: number;
  /** Hide Labels */
  hideLabels: boolean;
}

export const defaultInputs: FollowLineInputs = {
  bbPeriod: 21,
  bbDeviations: 1.0,
  useATRFilter: true,
  atrPeriod: 5,
  hideLabels: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'bbPeriod', type: 'int', title: 'BB Period', defval: 21, min: 1 },
  { id: 'bbDeviations', type: 'float', title: 'BB Deviations', defval: 1.0, min: 0.1, step: 0.05 },
  { id: 'useATRFilter', type: 'bool', title: 'ATR Filter', defval: true },
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 5, min: 1 },
  { id: 'hideLabels', type: 'bool', title: 'Hide Labels', defval: false },
];

// Colour constants of Pine version 4
const BLUE = '#2196F3';
const RED = '#FF5252';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend Line', color: BLUE, lineWidth: 2 },
];

export const metadata = {
  title: 'Follow Line',
  shortTitle: 'FLI',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** atr(length) called on the bars where `called` is true only: the RMA of the true range of those bars */
function atrWhen(called: boolean[], tr: number[], length: number): number[] {
  return callsite.whenCalled(called, (x) => taCore.rma(x, length) as ArrayLike<number>, tr) as number[];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<FollowLineInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { bbPeriod, bbDeviations, useATRFilter, atrPeriod, hideLabels } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  // BBUpper = sma(close, BBperiod) + stdev(close, BBperiod) * BBdeviations, BBLower: minus
  const sma = Array.from(taCore.sma(close, bbPeriod) as ArrayLike<number>, (v) => v ?? NaN);
  const sd = Array.from(taCore.stdev(close, bbPeriod) as ArrayLike<number>, (v) => v ?? NaN);
  // tr(true): high - low on the first bar
  const tr = Array.from(taCore.tr(true, high, low, close) as ArrayLike<number>, (v) => v ?? NaN);
  // BBSignal = close > BBUpper ? 1 : close < BBLower ? -1 : 0
  const sig = close.map((c, i) => (gt(c, sma[i] + sd[i] * bbDeviations) ? 1 : lt(c, sma[i] - sd[i] * bbDeviations) ? -1 : 0));
  // atr(ATRperiod) in `if BBSignal == 1 and UseATRfilter == 1` and in `if BBSignal == -1 and UseATRfilter == 1`
  const atrUp = atrWhen(sig.map((s) => useATRFilter && s === 1), tr, atrPeriod);
  const atrDown = atrWhen(sig.map((s) => useATRFilter && s === -1), tr, atrPeriod);

  const trendLine: number[] = new Array(n);
  const iTrend: number[] = new Array(n);
  const buy: boolean[] = new Array(n);
  const sell: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // TrendLine[1] / iTrend[1] are na on the first bar
    const prevTL = i > 0 ? trendLine[i - 1] : NaN;
    let tl = prevTL;
    if (sig[i] === 1) {
      tl = useATRFilter ? low[i] - atrUp[i] : low[i];
      if (lt(tl, prevTL)) tl = prevTL;
    } else if (sig[i] === -1) {
      tl = useATRFilter ? high[i] + atrDown[i] : high[i];
      if (gt(tl, prevTL)) tl = prevTL;
    }
    // iTrend := iTrend[1]; TrendLine > TrendLine[1] ? 1; TrendLine < TrendLine[1] ? -1
    const prevIt = i > 0 ? iTrend[i - 1] : NaN;
    let it = prevIt;
    if (gt(tl, prevTL)) it = 1;
    if (lt(tl, prevTL)) it = -1;
    trendLine[i] = tl;
    iTrend[i] = it;
    // buy := iTrend[1] == -1 and iTrend == 1 ? 1 : na; sell := iTrend[1] == 1 and iTrend == -1 ? 1 : na
    buy[i] = prevIt === -1 && it === 1;
    sell[i] = prevIt === 1 && it === -1;
  }

  // plot(TrendLine, color = iTrend > 0 ? color.blue : color.red, linewidth = 2, title = "Trend Line")
  const plot0 = trendLine.map((v, i) => ({ time: bars[i].time, value: v, color: gt(iTrend[i], 0) ? BLUE : RED }));

  // plotshape(buy == 1 and hl == false ? TrendLine - atr(8) : na, text = '💣', shape.labelup, location.absolute,
  // color.blue, textcolor = color.white, size.auto); the sell one: TrendLine + atr(8), '🔨', shape.labeldown, red.
  // Each atr(8) runs only on the bars of its ternary branch.
  const atrBuy = atrWhen(buy.map((b) => b && !hideLabels), tr, 8);
  const atrSell = atrWhen(sell.map((s) => s && !hideLabels), tr, 8);
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    if (buy[i] && !hideLabels) {
      const price = trendLine[i] - atrBuy[i];
      if (!isNaN(price)) {
        markers.push({ id: 'shape0', time: bars[i].time, position: 'atPriceBottom', price, shape: 'labelUp', color: BLUE,
          text: '💣', textColor: color.white, size: 'auto' });
      }
    }
    if (sell[i] && !hideLabels) {
      const price = trendLine[i] + atrSell[i];
      if (!isNaN(price)) {
        markers.push({ id: 'shape1', time: bars[i].time, position: 'atPriceTop', price, shape: 'labelDown', color: RED,
          text: '🔨', textColor: color.white, size: 'auto' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0 },
    markers,
    // alertcondition(sell == 1, "Sell") / (buy == 1, "Buy") / (buy == 1 or sell == 1, "Buy/Sell")
    alerts: alertStates(alertConditions, bars, [sell, buy, buy.map((b, i) => b || sell[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Sell', message: 'Sell' },
  { id: 'alert1', title: 'Buy', message: 'Buy' },
  { id: 'alert2', title: 'Buy/Sell', message: 'Buy/Sell' },
];

export const FollowLine = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
