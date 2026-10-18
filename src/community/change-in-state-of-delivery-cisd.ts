/**
 * Change in State of Delivery CISD [AlgoAlpha]
 *
 * Liquidity levels at swing points, and the change in state of delivery (CISD) that follows a sweep of them.
 * - Swing highs and lows (pivots with "Swing Period" bars on each side) are marked with a dot and give a level
 *   line. The line follows the current bar until the price touches the level (the level is mitigated and the line
 *   stops there) or until it is "Expiry Bars" old (it is then deleted when "Hide Expired Levels" is on).
 * - A bullish candle after a bearish one gives a potential bearish CISD level at its open; a bearish candle after a
 *   bullish one gives a potential bullish level. When the close goes back through the latest level, the move since
 *   the level is compared with the run of candles before it: the highest close since the level (lowest for a bullish
 *   level) minus the level, divided by the open of the first candle of the run before the level minus the level,
 *   must be above the noise filter. Then a thick line is drawn at the level from its bar to the current bar and the
 *   trend turns; else the level is dropped and the one before it is tested.
 * - A CISD within "Liquidity Lookback" bars of a mitigated swing level, with the close back on the other side of
 *   that level, is a strong CISD: a label with an arrow above or below the bar.
 * - The candles are drawn in the trend colour, mixed with the chart background colour.
 *
 * Drawings are kept up to 500 lines (the oldest are removed).
 *
 * Alerts (alertcondition, `alerts` of the result): swing high / low mitigation (a level touched on a closed bar),
 * bearish / bullish normal CISD and strong bearish / bullish CISD (the sweep labels), true on the bars of each event.
 *
 * Chart values (third argument): the port reads the chart foreground colour (level lines, arrow text; without it:
 * #DBDBDB, a dark chart), the chart background colour (candle colours; without it: #0F0F0F) and the state of the
 * last bar (a level is only mitigated by a closed bar; without it the last bar is taken as closed).
 *
 * Reference: "Change in State of Delivery CISD [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData, MarkerData, PlotCandleData } from '../types';
import { backgroundColorOf, foregroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ChangeInStateOfDeliveryCisdInputs {
  /** Noise Filter */
  tolerence: number;
  /** Swing Period */
  len: number;
  expiryBars: number;
  liquidityLookback: number;
  /** Bullish Colour */
  green: string;
  /** Bearish Colour */
  red: string;
  /** Candle Body Transperency */
  t1: number;
  /** Candle Wick/Border Transperency */
  t2: number;
  hideExpiredLevels: boolean;
  hideMitigatedLevels: boolean;
}

export const defaultInputs: ChangeInStateOfDeliveryCisdInputs = {
  tolerence: 0.7,
  len: 12,
  expiryBars: 100,
  liquidityLookback: 10,
  green: '#00ffbb',
  red: '#ff1100',
  t1: 90,
  t2: 40,
  hideExpiredLevels: true,
  hideMitigatedLevels: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'tolerence', type: 'float', title: 'Noise Filter', defval: 0.7, min: 0, max: 1, step: 0.1, group: 'Calculations',
    tooltip: 'Determines which levels to use as CSID triggers, a larger setting results in less noise' },
  { id: 'len', type: 'int', title: 'Swing Period', defval: 12, group: 'Calculations',
    tooltip: 'The period to detect swing points, a larger setting will detect longer term swings' },
  { id: 'expiryBars', type: 'int', title: 'Expiry Bars', defval: 100, group: 'Calculations',
    tooltip: 'Number of bars after which old liquidity lines stop updating' },
  { id: 'liquidityLookback', type: 'int', title: 'Liquidity Lookback', defval: 10, group: 'Calculations',
    tooltip: 'Lookback period to check if opposing liquidity was wicked before a CISD' },
  { id: 'green', type: 'color', title: 'Bullish Colour', defval: '#00ffbb', group: 'Appearance',
    tooltip: 'Color used for bullish visuals and positive sentiment texts.' },
  { id: 'red', type: 'color', title: 'Bearish Colour', defval: '#ff1100', group: 'Appearance',
    tooltip: 'Color used for bearish visuals and negative sentiment texts.' },
  { id: 't1', type: 'int', title: 'Candle Body Transperency', defval: 90, min: 0, max: 100, group: 'Appearance' },
  { id: 't2', type: 'int', title: 'Candle Wick/Border Transperency', defval: 40, min: 0, max: 100, group: 'Appearance' },
  { id: 'hideExpiredLevels', type: 'bool', title: 'Hide Expired Levels', defval: true, group: 'Appearance',
    tooltip: 'Delete liquidity levels once they exceed the expiry bar threshold.' },
  { id: 'hideMitigatedLevels', type: 'bool', title: 'Hide Mitigated Levels', defval: false, group: 'Appearance',
    tooltip: 'Delete liquidity levels from the chart as soon as price mitigates them.' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Change in State of Delivery CISD [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - CISD',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;
/** The script keeps at most 100 level lines per side */
const MAX_LEVELS = 100;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

interface Ln { x1: number; x2: number; y: number; color: string; width: number; dead: boolean }

export function calculate(
  bars: Bar[],
  inputs: Partial<ChangeInStateOfDeliveryCisdInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.len);
  const fg = foregroundColorOf(chart);
  const bg = backgroundColorOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const levelColor = String(color.new(fg, 50));

  const pivlow = ta.pivotlow(new Series(bars, (b) => b.low), len, len).toArray().map((v) => v ?? NaN);
  const pivhigh = ta.pivothigh(new Series(bars, (b) => b.high), len, len).toArray().map((v) => v ?? NaN);

  // Live lines: above max + 5 the oldest are deleted until max remain
  const lines: Ln[] = [];
  const newLine = (l: Omit<Ln, 'dead'>): Ln => {
    const o = { ...l, dead: false };
    lines.push(o);
    if (lines.length > MAX_LINES + 5) for (const old of lines.splice(0, lines.length - MAX_LINES)) old.dead = true;
    return o;
  };
  const deleteLine = (l: Ln) => {
    if (l.dead) return;
    l.dead = true;
    lines.splice(lines.indexOf(l), 1);
  };

  const swinghighs: Ln[] = [];
  const swinglows: Ln[] = [];
  let lastWickedHighLevel = NaN;
  let lastWickedLowLevel = NaN;
  let barsSinceHigh = NaN;
  let barsSinceLow = NaN;
  // [level, bar, level, bar, ...], the latest first
  const bearPotential: number[] = [];
  const bullPotential: number[] = [];
  let trend = 0;

  const markers: MarkerData[] = [];
  const flags: boolean[][] = [[], [], [], [], [], []];
  const candles: PlotCandleData[] = [];
  const bodyColor = (t: number) => String(color.from_gradient(cfg.t1, 0, 100, t > 0 ? cfg.green : cfg.red, bg));
  const wickColor = (t: number) => String(color.from_gradient(cfg.t2, 0, 100, t > 0 ? cfg.green : cfg.red, bg));
  const bodyUp = bodyColor(1);
  const bodyDown = bodyColor(0);
  const wickUp = wickColor(1);
  const wickDown = wickColor(0);

  // close[k] / open[k] on bar i (na before the first bar)
  const C = (i: number, k: number) => (k >= 0 && i - k >= 0 ? bars[i - k].close : NaN);
  const O = (i: number, k: number) => (k >= 0 && i - k >= 0 ? bars[i - k].open : NaN);

  /** The level lines of one side on bar i; returns the mitigated level, or na */
  const levels = (i: number, list: Ln[], touched: (lvl: number) => boolean): number => {
    let wicked = NaN;
    for (let k = list.length - 1; k >= 0; k--) {
      if (k >= list.length) continue;
      const l = list[k];
      // line.get_x1 of a deleted line is na: the comparison is false
      if (!l.dead && i - l.x1 < cfg.expiryBars) {
        const lvl = l.y;
        l.x2 = i;
        if (touched(lvl)) {
          if (cfg.hideMitigatedLevels) deleteLine(l);
          list.splice(k, 1);
          wicked = lvl;
        }
      } else if (cfg.hideExpiredLevels) {
        deleteLine(l);
        list.splice(k, 1);
      }
    }
    while (list.length > MAX_LEVELS) deleteLine(list.pop()!);
    return wicked;
  };

  for (let i = 0; i < n; i++) {
    const { open, high, low, close } = bars[i];
    const confirmed = i < n - 1 || lastConfirmed;
    const isPivHigh = !isNaN(pivhigh[i]);
    const isPivLow = !isNaN(pivlow[i]);

    if (isPivHigh) swinghighs.unshift(newLine({ x1: i - len, x2: i, y: bars[i - len].high, color: levelColor, width: 1 }));
    if (isPivLow) swinglows.unshift(newLine({ x1: i - len, x2: i, y: bars[i - len].low, color: levelColor, width: 1 }));

    const wickedHighLevel = levels(i, swinghighs, (lvl) => ge(high, lvl) && confirmed);
    const wickedLowLevel = levels(i, swinglows, (lvl) => le(low, lvl) && confirmed);
    const wickedHigh = !isNaN(wickedHighLevel);
    const wickedLow = !isNaN(wickedLowLevel);
    if (wickedHigh) lastWickedHighLevel = wickedHighLevel;
    if (wickedLow) lastWickedLowLevel = wickedLowLevel;
    // ta.barssince()
    barsSinceHigh = wickedHigh ? 0 : barsSinceHigh + 1;
    barsSinceLow = wickedLow ? 0 : barsSinceLow + 1;

    if (lt(C(i, 1), O(i, 1)) && gt(close, open)) bearPotential.unshift(open, i);
    if (gt(C(i, 1), O(i, 1)) && lt(close, open)) bullPotential.unshift(open, i);

    let cisd = 0;
    let originLvl = 0.0;
    let originIdx = 0.0;

    while (bearPotential.length > 0 && lt(close, bearPotential[0])) {
      const first = bearPotential[0];
      const back = i - bearPotential[1];
      let highest = 0.0;
      for (let k = 0; k <= back; k++) if (gt(C(i, k), highest)) highest = C(i, k);
      // The open of the first candle of the bearish run before the level
      let init = back + 1;
      let top = 0.0;
      while (lt(C(i, init), O(i, init))) {
        top = O(i, init);
        init++;
      }
      if (gt((highest - first) / (top - first), cfg.tolerence)) {
        originLvl = first;
        originIdx = bearPotential[1];
        bearPotential.length = 0;
        cisd = 1;
      } else {
        bearPotential.splice(0, 2);
      }
    }

    while (bullPotential.length > 0 && gt(close, bullPotential[0])) {
      const first = bullPotential[0];
      const back = i - bullPotential[1];
      let lowest = close;
      for (let k = 0; k <= back; k++) if (lt(C(i, k), lowest)) lowest = C(i, k);
      // The open of the first candle of the bullish run before the level
      let init = back + 1;
      let bottom = 0.0;
      while (gt(C(i, init), O(i, init))) {
        bottom = O(i, init);
        init++;
      }
      if (gt((first - lowest) / (first - bottom), cfg.tolerence)) {
        originLvl = first;
        originIdx = bullPotential[1];
        bullPotential.length = 0;
        cisd = 2;
      } else {
        bullPotential.splice(0, 2);
      }
    }

    let bearishSweep = false;
    let bullishSweep = false;
    if (cisd === 1) {
      trend = -1;
      newLine({ x1: Math.trunc(originIdx), x2: i, y: originLvl, color: cfg.red, width: 3 });
      if (barsSinceHigh <= cfg.liquidityLookback && lt(close, lastWickedHighLevel)) bearishSweep = true;
    }
    if (cisd === 2) {
      trend = 1;
      newLine({ x1: Math.trunc(originIdx), x2: i, y: originLvl, color: cfg.green, width: 3 });
      if (barsSinceLow <= cfg.liquidityLookback && gt(close, lastWickedLowLevel)) bullishSweep = true;
    }

    // alertcondition(wicked_high), (wicked_low), (cisd == 1), (cisd == 2), (bearish_sweep), (bullish_sweep)
    flags[0].push(wickedHigh);
    flags[1].push(wickedLow);
    flags[2].push(cisd === 1);
    flags[3].push(cisd === 2);
    flags[4].push(bearishSweep);
    flags[5].push(bullishSweep);

    const time = bars[i].time;
    // plotshape(bearish_sweep ? high : na, ..., shape.labeldown, location.abovebar): the value is read as a condition
    if (bearishSweep && high !== 0) {
      markers.push({ id: 'shape0', time, position: 'aboveBar', shape: 'labelDown', color: cfg.red, text: '▼', textColor: fg, size: 'small' });
    }
    if (bullishSweep && low !== 0) {
      markers.push({ id: 'shape1', time, position: 'belowBar', shape: 'labelUp', color: cfg.green, text: '▲', textColor: fg, size: 'small' });
    }
    // plotchar(not na(pivhigh) ? high[len] : na, "Swing High", "●", location.absolute, red, size.tiny, offset = -len)
    if (isPivHigh) {
      markers.push({
        id: 'char2', time: bars[i - len].time, position: 'atPriceMiddle', price: bars[i - len].high, shape: 'circle',
        color: 'transparent', text: '●', textColor: cfg.red, size: 'tiny',
      });
    }
    if (isPivLow) {
      markers.push({
        id: 'char3', time: bars[i - len].time, position: 'atPriceMiddle', price: bars[i - len].low, shape: 'circle',
        color: 'transparent', text: '●', textColor: cfg.green, size: 'tiny',
      });
    }

    // plotcandle(open, high, low, close, "Price Candles", candle_col, candle_col_, bordercolor = candle_col_)
    const wick = trend > 0 ? wickUp : wickDown;
    candles.push({ time, open, high, low, close, color: trend > 0 ? bodyUp : bodyDown, wickColor: wick, borderColor: wick });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    plotCandles: { priceCandles: candles },
    lines: lines.map((l) => ({
      time1: bars[l.x1].time, price1: l.y, time2: bars[l.x2].time, price2: l.y, color: l.color,
      ...(l.width !== 1 ? { width: l.width } : {}),
    })),
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Swing High Mitigation', message: 'Swing High Mitigated' },
  { id: 'alert1', title: 'Swing Low Mitigation', message: 'Swing Low Mitigated' },
  { id: 'alert2', title: 'Bearish Normal CISD', message: 'Bearish Normal CISD Detected' },
  { id: 'alert3', title: 'Bullish Normal CISD', message: 'Bullish Normal CISD Detected' },
  { id: 'alert4', title: 'Strong Bearish CISD', message: 'Strong Bearish CISD Detected' },
  { id: 'alert5', title: 'Strong Bullish CISD', message: 'Strong Bullish CISD Detected' },
];

export const ChangeInStateOfDeliveryCisd = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
