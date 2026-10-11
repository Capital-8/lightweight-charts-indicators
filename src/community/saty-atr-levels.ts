/**
 * Saty ATR Levels
 *
 * Price levels around the close of the previous period, in steps of the ATR of that period: the trigger levels
 * (23.6 % by default), the Fibonacci levels up to +-100 % and, with "Show Extensions", up to +-300 %. The period is
 * the day ("Day"), the week ("Multiday"), the month ("Swing"), 3 months ("Position") or 12 months ("Long-term").
 * A table shows the range of the current period against the ATR, the trigger and +-1 ATR levels, and the trend of
 * the chart (the close and the 8 / 21 / 34 EMAs in order: green or red, else orange).
 *
 * Other timeframe: the bars of the period are built from the chart bars with the calendar rule of the period
 * helper (see anchor-period.ts for its limits), so the ATR starts at the first chart bar. The original reads the
 * period with lookahead: every chart bar of a period shows the close and the ATR of the period before it. It also
 * asks for the extended session of the symbol: the port uses the chart bars as they are. Limits on intraday charts:
 * the ATR needs about 110 periods of chart bars to reach the value of the full history, and on stocks the daily bar
 * of the exchange (official close) is not exactly the sum of the intraday bars, so the levels can differ slightly.
 * A period shorter than the chart timeframe needs data that the chart bars do not have: the port throws an Error.
 * "Level Size" is the plot width in the original; the plots are drawn with the default width 2.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Saty ATR Levels" by satymahajan
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (C) 2022 Saty Mahajan
 */

import { ta, Series, str, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { TableData, TableCellData } from '../types';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

type TradingType = 'Day' | 'Multiday' | 'Swing' | 'Position' | 'Long-term';

export interface SatyAtrLevelsInputs {
  tradingType: TradingType;
  useOptionsLabels: boolean;
  atrLength: number;
  triggerPercentage: number;
  previousCloseLevelColor: string;
  lowerTriggerLevelColor: string;
  upperTriggerLevelColor: string;
  keyTargetLevelColor: string;
  atrTargetLevelColor: string;
  intermediateTargetLevelColor: string;
  showAllFibonacciLevels: boolean;
  showExtensions: boolean;
  levelSize: number;
  showInfo: boolean;
  useCurrentClose: boolean;
  fastEma: number;
  pivotEma: number;
  slowEma: number;
}

export const defaultInputs: SatyAtrLevelsInputs = {
  tradingType: 'Day',
  useOptionsLabels: true,
  atrLength: 14,
  triggerPercentage: 0.236,
  previousCloseLevelColor: '#FFFFFF',
  lowerTriggerLevelColor: '#FFEB3B',
  upperTriggerLevelColor: '#00BCD4',
  keyTargetLevelColor: '#B2B5BE',
  atrTargetLevelColor: '#FFFFFF',
  intermediateTargetLevelColor: '#787B86',
  showAllFibonacciLevels: true,
  showExtensions: false,
  levelSize: 2,
  showInfo: true,
  useCurrentClose: false,
  fastEma: 8,
  pivotEma: 21,
  slowEma: 34,
};

export const inputConfig: InputConfig[] = [
  { id: 'tradingType', type: 'string', title: 'Trading Type', defval: 'Day', options: ['Day', 'Multiday', 'Swing', 'Position', 'Long-term'] },
  { id: 'useOptionsLabels', type: 'bool', title: 'Use Options Labels', defval: true },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'triggerPercentage', type: 'float', title: 'Trigger Percentage', defval: 0.236 },
  { id: 'previousCloseLevelColor', type: 'color', title: 'Previous Close Level Color', defval: '#FFFFFF' },
  { id: 'lowerTriggerLevelColor', type: 'color', title: 'Lower Trigger Level Color', defval: '#FFEB3B' },
  { id: 'upperTriggerLevelColor', type: 'color', title: 'Upper Trigger Level Color', defval: '#00BCD4' },
  { id: 'keyTargetLevelColor', type: 'color', title: 'Key Target Level Color', defval: '#B2B5BE' },
  { id: 'atrTargetLevelColor', type: 'color', title: 'ATR Target Level Color', defval: '#FFFFFF' },
  { id: 'intermediateTargetLevelColor', type: 'color', title: 'Intermediate Target Level Color', defval: '#787B86' },
  { id: 'showAllFibonacciLevels', type: 'bool', title: 'Show All Fibonacci Levels', defval: true },
  { id: 'showExtensions', type: 'bool', title: 'Show Extensions', defval: false },
  { id: 'levelSize', type: 'int', title: 'Level Size', defval: 2 },
  { id: 'showInfo', type: 'bool', title: 'Show Info Label', defval: true },
  { id: 'useCurrentClose', type: 'bool', title: 'Use Current Close', defval: false },
  { id: 'fastEma', type: 'int', title: 'Fast EMA', defval: 8 },
  { id: 'pivotEma', type: 'int', title: 'Pivot EMA', defval: 21 },
  { id: 'slowEma', type: 'int', title: 'Slow EMA', defval: 34 },
];

type LevelColor = 'atr' | 'key' | 'mid' | 'lowerTrigger' | 'previousClose' | 'upperTrigger';
type LevelShow = 'always' | 'extensions' | 'fibonacci' | 'fibonacciExtensions';
interface Level {
  title: string;
  /** -1 below the previous close, 1 above, 0 the previous close */
  side: -1 | 0 | 1;
  /** Whole ATRs between the previous close and the base of the level */
  base: 0 | 1 | 2;
  /** Distance from the base, in ATR (null: the trigger percentage) */
  frac: number | null;
  css: LevelColor;
  show: LevelShow;
}

const L = (title: string, side: -1 | 0 | 1, base: 0 | 1 | 2, frac: number | null, css: LevelColor, show: LevelShow): Level => ({
  title, side, base, frac, css, show,
});

/** The 31 plots, in the order of the original */
const LEVELS: Level[] = [
  L('-300.0%', -1, 2, 1, 'atr', 'extensions'),
  L('-261.8%', -1, 2, 0.618, 'key', 'extensions'),
  L('-223.6%', -1, 2, 0.236, 'key', 'extensions'),
  L('-200.0%', -1, 1, 1, 'atr', 'extensions'),
  L('-178.6%', -1, 1, 0.786, 'mid', 'fibonacciExtensions'),
  L('-161.8%', -1, 1, 0.618, 'key', 'extensions'),
  L('-150.0%', -1, 1, 0.5, 'mid', 'fibonacciExtensions'),
  L('-138.2%', -1, 1, 0.382, 'mid', 'fibonacciExtensions'),
  L('-123.6%', -1, 1, 0.236, 'key', 'extensions'),
  L('-100%', -1, 0, 1, 'atr', 'always'),
  L('-78.6%', -1, 0, 0.786, 'mid', 'fibonacci'),
  L('-61.8%', -1, 0, 0.618, 'key', 'always'),
  L('-50.0%', -1, 0, 0.5, 'mid', 'fibonacci'),
  L('-38.2%', -1, 0, 0.382, 'mid', 'fibonacci'),
  L('Lower Trigger', -1, 0, null, 'lowerTrigger', 'always'),
  L('Previous Close', 0, 0, 0, 'previousClose', 'always'),
  L('Upper Trigger', 1, 0, null, 'upperTrigger', 'always'),
  L('38.2%', 1, 0, 0.382, 'mid', 'fibonacci'),
  L('50.0%', 1, 0, 0.5, 'mid', 'fibonacci'),
  L('61.8%', 1, 0, 0.618, 'key', 'always'),
  L('78.6%', 1, 0, 0.786, 'mid', 'fibonacci'),
  L('100%', 1, 0, 1, 'atr', 'always'),
  L('123.6%', 1, 1, 0.236, 'key', 'extensions'),
  L('138.2%', 1, 1, 0.382, 'mid', 'fibonacciExtensions'),
  L('150.0%', 1, 1, 0.5, 'mid', 'fibonacciExtensions'),
  L('161.8%', 1, 1, 0.618, 'key', 'extensions'),
  L('178.6%', 1, 1, 0.786, 'mid', 'fibonacciExtensions'),
  L('200.0%', 1, 1, 1, 'atr', 'extensions'),
  L('223.6%', 1, 2, 0.236, 'key', 'extensions'),
  L('261.8%', 1, 2, 0.618, 'key', 'extensions'),
  L('300%', 1, 2, 1, 'atr', 'extensions'),
];

const levelCss = (cfg: SatyAtrLevelsInputs, css: LevelColor): string => {
  const base = css === 'atr' ? cfg.atrTargetLevelColor : css === 'key' ? cfg.keyTargetLevelColor
    : css === 'mid' ? cfg.intermediateTargetLevelColor : css === 'lowerTrigger' ? cfg.lowerTriggerLevelColor
      : css === 'previousClose' ? cfg.previousCloseLevelColor : cfg.upperTriggerLevelColor;
  return String(color.new(base, 40));
};

export const plotConfig: PlotConfig[] = LEVELS.map((level, k) => ({
  id: `plot${k}`, title: level.title, color: levelCss(defaultInputs, level.css), lineWidth: 2, style: 'stepline',
}));

export const metadata = {
  title: 'Saty ATR Levels',
  shortTitle: 'Saty ATR Levels',
  overlay: true,
};

const GREEN = '#4CAF50';
const RED = '#FF5252';
const ORANGE = '#FF9800';
/** Default text colour of a table cell (color.black) */
const BLACK = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => a - b > EPS || Math.abs(a - b) <= EPS;
const le = (a: number, b: number) => b - a > EPS || Math.abs(a - b) <= EPS;

const PERIOD: Record<TradingType, string> = { Day: 'D', Multiday: 'W', Swing: 'M', Position: '3M', 'Long-term': '12M' };

/**
 * request.security(ticker, tf, ..., lookahead = barmerge.lookahead_on): the bars of timeframe `tf` built from the
 * chart bars and for each chart bar the index of its bar of that timeframe.
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; group: number[] } {
  const chart = chartTimeframe(bars, context);
  if (chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, group: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`The period "${tf}" of the trading type is shorter than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods come from the library
  // rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, group: exchange.group };
  const starts = periodStarts(bars, tf);
  const htf: Bar[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
    } else {
      const last = htf[htf.length - 1];
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume = (last.volume ?? NaN) + (b.volume ?? NaN);
    }
    group.push(htf.length - 1);
  });
  return { htf, group };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SatyAtrLevelsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // Trend
  const price = Series.fromArray(bars, bars.map((b) => b.close));
  const fast = A(ta.ema(price, cfg.fastEma));
  const pivot = A(ta.ema(price, cfg.pivotEma));
  const slow = A(ta.ema(price, cfg.slowEma));

  // Data of the period: close[period_index], ta.atr(atr_length)[period_index], high, low
  const { htf, group } = timeframeBars(bars, PERIOD[cfg.tradingType] ?? 'D', chart);
  const atrHtf = A(ta.atr(htf, cfg.atrLength));
  const back = cfg.useCurrentClose ? 0 : 1;
  const previousClose = group.map((g) => (g - back >= 0 ? htf[g - back].close : NaN));
  const atr = group.map((g) => (g - back >= 0 ? atrHtf[g - back] : NaN));

  const shown = (show: LevelShow) => show === 'always' || (show === 'extensions' && cfg.showExtensions)
    || (show === 'fibonacci' && cfg.showAllFibonacciLevels)
    || (show === 'fibonacciExtensions' && cfg.showAllFibonacciLevels && cfg.showExtensions);
  const levelAt = (level: Level, i: number): number => {
    const pc = previousClose[i];
    const a = atr[i];
    if (level.side === 0) return pc;
    const s = level.side;
    // lower_1000 = previous_close - atr, lower_2000 = lower_1000 - atr (upper levels mirrored)
    let base = pc;
    for (let k = 0; k < level.base; k++) base += s * a;
    if (level.frac === null) return base + s * (cfg.triggerPercentage * a);
    return level.frac === 1 ? base + s * a : base + s * (a * level.frac);
  };

  const plots: Record<string, Array<{ time: number; value: number; color: string }>> = {};
  LEVELS.forEach((level, k) => {
    const css = levelCss(cfg, level.css);
    const show = shown(level.show);
    plots[`plot${k}`] = bars.map((b, i) => ({ time: b.time, value: show ? levelAt(level, i) : NaN, color: css }));
  });

  // var tbl = table.new(position.top_right, 1, 4); the cells are set on the last bar
  const cells: TableCellData[] = [];
  if (n > 0 && cfg.showInfo) {
    const i = n - 1;
    const g = group[i];
    const close = bars[i].close;
    const bullish = ge(close, fast[i]) && ge(fast[i], pivot[i]) && ge(pivot[i], slow[i]);
    const bearish = le(close, fast[i]) && le(fast[i], pivot[i]) && le(pivot[i], slow[i]);
    const trendColor = bullish ? GREEN : bearish ? RED : ORANGE;
    const range = htf[g].high - htf[g].low;
    const trPercentOfAtr = (range / atr[i]) * 100;
    const trVsAtrColor = le(trPercentOfAtr, 70) ? GREEN : ge(trPercentOfAtr, 90) ? RED : ORANGE;
    const longLabel = cfg.useOptionsLabels ? 'Calls' : 'Long';
    const shortLabel = cfg.useOptionsLabels ? 'Puts' : 'Short';
    const pc = previousClose[i];
    const a = atr[i];
    const f = (v: number) => str.tostring(v, '#.##');
    const cell = (row: number, text: string, bgColor: string) => {
      cells.push({ column: 0, row, text, bgColor, textColor: BLACK, textSize: 'auto' });
    };
    cell(0, 'Saty ATR Levels', trendColor);
    cell(1, `${cfg.tradingType} Range ($${f(range)}) is ${str.tostring(trPercentOfAtr, '#.#')}% of ATR ($${f(a)})`, trVsAtrColor);
    cell(2, `${longLabel} > $${f(pc + cfg.triggerPercentage * a)} | +1 ATR $${f(pc + a)}`, cfg.upperTriggerLevelColor);
    cell(3, `${shortLabel} < $${f(pc - cfg.triggerPercentage * a)} | -1 ATR: $${f(pc - a)}`, cfg.lowerTriggerLevelColor);
  }
  const tables: TableData[] = n > 0 ? [{ position: 'top_right', columns: 1, rows: 4, cells }] : [];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    tables,
  };
}

export const SatyAtrLevels = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
