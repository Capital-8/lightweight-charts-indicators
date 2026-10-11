/**
 * Universal Signal Backtester [LuxAlgo]
 *
 * A trade simulation of long / short signals with up to three take profits and three stop losses, and a dashboard
 * of the results.
 * - Signals: a cross of two moving averages (9 / 21 EMA, 12 / 26 EMA or 50 / 200 SMA, drawn with a ribbon of nine
 *   averages between them), a cross of two sources, or a trigger read from two sources. An optional filter keeps
 *   the signals where ATR(14) is above its average.
 * - Trade: one at a time, entered at the close of the signal bar. The targets and stops are at multiples of the
 *   ATR (or ticks, or points) from the entry. A stop closes the whole trade (stops are read first); each take
 *   profit closes an equal part; an opposite signal closes what is left at the close. The result is counted in
 *   ticks, less the optional spread and commission.
 * - Drawings: on each entry a dashed marker line with a circle and the suggested take profit (the one with the best
 *   metric so far), and one line and label per target / stop, extended until it is hit ("✓" / "✗"). Crosses mark
 *   the bars where a trade closes with a gain or a loss. The candles are coloured by the distance between the two
 *   averages. At most 500 lines and 500 labels are kept.
 * - Dashboard (table of the last bar): trades, win rate, profit factor, total result, Sharpe ratio, recovery factor,
 *   longest time without a new equity high, target hits, the equity curve as block characters, the result by hour
 *   of the entry and a heat map by day of the week (last 10 weeks) or by month (last 10 years).
 *
 * Chart context (optional third argument):
 * - `chart.mintick`: the symbol tick: results are in ticks, and the "Ticks" distance and the spread use it. Without
 *   it 0.01.
 * - `chart.timezone`: the exchange time zone of the hour, day, week, month and year of an entry. Without it UTC.
 *
 * Limits of the port: the four source inputs take the price sources of the chart (the original can also read the
 * output of another indicator).
 *
 * Reference: "Universal Signal Backtester [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, math, str, color, array, Series, getSourceSeries, barInterval, barTime, time as pineTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type {
  BarColorData, LabelData, LabelStyle, LineDrawingData, MarkerData, PineSize, TableCellData, TableData, TableMergeData,
  TablePosition,
} from '../types';
import { mintickOf, timezoneOf, type ChartContext } from '../chart-context';

type Source = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'hlcc4';

export interface UniversalSignalBacktesterInputs {
  sourceMode: 'Predefined Crosses' | 'External Sources (Crossovers)' | 'External Signals (Triggers)';
  predefCross: '9/21 EMA Cross' | '12/26 EMA Cross' | 'Golden/Death Cross (50/200 SMA)';
  fastSource: Source;
  slowSource: Source;
  extLongSignal: Source;
  extShortSignal: Source;
  signalLogic: 'Not NA (Plotshape/Markers)' | 'Crosses Over 0' | 'Crosses Under 0' | 'Value Changes' | 'Greater Than 0' | 'Less Than 0';
  tradeDirection: 'Both' | 'Long Only' | 'Short Only';
  useAtrFilter: boolean;
  atrFilterLen: number;
  distType: 'ATR' | 'Ticks' | 'Points/Fiat';
  atrLen: number;
  useTp1: boolean;
  tp1Val: number;
  useTp2: boolean;
  tp2Val: number;
  useTp3: boolean;
  tp3Val: number;
  useSl1: boolean;
  sl1Val: number;
  useSl2: boolean;
  sl2Val: number;
  useSl3: boolean;
  sl3Val: number;
  showDash: boolean;
  dashPos: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  dashSize: 'Tiny' | 'Small' | 'Normal' | 'Large';
  heatmapPeriod: 'Days of Week' | 'Months';
  suggestMetric: 'Hit Rate' | 'Expected Profit' | 'Total Profit' | 'Risk/Reward';
  useCandleColor: boolean;
  useCosts: boolean;
  costProfile: 'Manual' | 'Forex (Avg)' | 'Crypto (Tier 1)' | 'Stocks (US)';
  manualSpread: number;
  manualComm: number;
}

export const defaultInputs: UniversalSignalBacktesterInputs = {
  sourceMode: 'Predefined Crosses',
  predefCross: '9/21 EMA Cross',
  fastSource: 'close',
  slowSource: 'open',
  extLongSignal: 'close',
  extShortSignal: 'close',
  signalLogic: 'Not NA (Plotshape/Markers)',
  tradeDirection: 'Both',
  useAtrFilter: false,
  atrFilterLen: 50,
  distType: 'ATR',
  atrLen: 14,
  useTp1: true,
  tp1Val: 1.0,
  useTp2: true,
  tp2Val: 2.0,
  useTp3: true,
  tp3Val: 3.0,
  useSl1: true,
  sl1Val: 1.5,
  useSl2: true,
  sl2Val: 2.5,
  useSl3: true,
  sl3Val: 3.5,
  showDash: true,
  dashPos: 'Top Right',
  dashSize: 'Small',
  heatmapPeriod: 'Days of Week',
  suggestMetric: 'Hit Rate',
  useCandleColor: true,
  useCosts: false,
  costProfile: 'Manual',
  manualSpread: 1.0,
  manualComm: 0.01,
};

const G_SRC = 'Source Settings';
const G_FILTER = 'Filters';
const G_TARGET = 'Target Settings';
const G_TP = 'Take Profit';
const G_SL = 'Stop Loss';
const G_DASH = 'Dashboard';
const G_COSTS = 'Costs';

export const inputConfig: InputConfig[] = [
  { id: 'sourceMode', type: 'string', title: 'Source Mode', defval: 'Predefined Crosses', options: ['Predefined Crosses', 'External Sources (Crossovers)', 'External Signals (Triggers)'], group: G_SRC },
  { id: 'predefCross', type: 'string', title: 'Predefined Cross', defval: '9/21 EMA Cross', options: ['9/21 EMA Cross', '12/26 EMA Cross', 'Golden/Death Cross (50/200 SMA)'], tooltip: 'Used if Source Mode is Predefined Crosses.', group: G_SRC },
  { id: 'fastSource', type: 'source', title: 'External Fast Source', defval: 'close', tooltip: 'Only used if Source Mode is External Sources (Crossovers).', group: G_SRC },
  { id: 'slowSource', type: 'source', title: 'External Slow Source', defval: 'open', tooltip: 'Only used if Source Mode is External Sources (Crossovers).', group: G_SRC },
  { id: 'extLongSignal', type: 'source', title: 'External Long Signal', defval: 'close', tooltip: 'Only used if Source Mode is External Signals (Triggers).', group: G_SRC },
  { id: 'extShortSignal', type: 'source', title: 'External Short Signal', defval: 'close', tooltip: 'Only used if Source Mode is External Signals (Triggers).', group: G_SRC },
  { id: 'signalLogic', type: 'string', title: 'External Signal Logic', defval: 'Not NA (Plotshape/Markers)', options: ['Not NA (Plotshape/Markers)', 'Crosses Over 0', 'Crosses Under 0', 'Value Changes', 'Greater Than 0', 'Less Than 0'], tooltip: 'How should the script interpret the external signal?', group: G_SRC },
  { id: 'tradeDirection', type: 'string', title: 'Trade Direction', defval: 'Both', options: ['Both', 'Long Only', 'Short Only'] },
  { id: 'useAtrFilter', type: 'bool', title: 'Use ATR Choppiness Filter', defval: false, group: G_FILTER, tooltip: 'Ignores signals when volatility (ATR) is below its average, helping to avoid choppy clustering.' },
  { id: 'atrFilterLen', type: 'int', title: 'ATR Smoothing Length', defval: 50, group: G_FILTER },
  { id: 'distType', type: 'string', title: 'Distance Type', defval: 'ATR', options: ['ATR', 'Ticks', 'Points/Fiat'], group: G_TARGET },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14, tooltip: 'Only used if Distance Type is ATR', group: G_TARGET },
  { id: 'useTp1', type: 'bool', title: 'Take Profit 1', defval: true, inline: 'tp1', group: G_TP },
  { id: 'tp1Val', type: 'float', title: '', defval: 1.0, step: 0.5, inline: 'tp1', group: G_TP },
  { id: 'useTp2', type: 'bool', title: 'Take Profit 2', defval: true, inline: 'tp2', group: G_TP },
  { id: 'tp2Val', type: 'float', title: '', defval: 2.0, step: 0.5, inline: 'tp2', group: G_TP },
  { id: 'useTp3', type: 'bool', title: 'Take Profit 3', defval: true, inline: 'tp3', group: G_TP },
  { id: 'tp3Val', type: 'float', title: '', defval: 3.0, step: 0.5, inline: 'tp3', group: G_TP },
  { id: 'useSl1', type: 'bool', title: 'Stop Loss 1', defval: true, inline: 'sl1', group: G_SL },
  { id: 'sl1Val', type: 'float', title: '', defval: 1.5, step: 0.5, inline: 'sl1', group: G_SL },
  { id: 'useSl2', type: 'bool', title: 'Stop Loss 2', defval: true, inline: 'sl2', group: G_SL },
  { id: 'sl2Val', type: 'float', title: '', defval: 2.5, step: 0.5, inline: 'sl2', group: G_SL },
  { id: 'useSl3', type: 'bool', title: 'Stop Loss 3', defval: true, inline: 'sl3', group: G_SL },
  { id: 'sl3Val', type: 'float', title: '', defval: 3.5, step: 0.5, inline: 'sl3', group: G_SL },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: true, group: G_DASH },
  { id: 'dashPos', type: 'string', title: 'Dashboard Position', defval: 'Top Right', options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: G_DASH },
  { id: 'dashSize', type: 'string', title: 'Dashboard Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal', 'Large'], group: G_DASH },
  { id: 'heatmapPeriod', type: 'string', title: 'Heatmap Period', defval: 'Days of Week', options: ['Days of Week', 'Months'], group: G_DASH },
  { id: 'suggestMetric', type: 'string', title: 'Suggested TP Metric', defval: 'Hit Rate', options: ['Hit Rate', 'Expected Profit', 'Total Profit', 'Risk/Reward'], group: G_DASH },
  { id: 'useCandleColor', type: 'bool', title: 'Gradient Candle Coloring', defval: true, group: 'Visuals' },
  { id: 'useCosts', type: 'bool', title: 'Simulate Spread & Commission', defval: false, group: G_COSTS },
  { id: 'costProfile', type: 'string', title: 'Cost Profile', defval: 'Manual', options: ['Manual', 'Forex (Avg)', 'Crypto (Tier 1)', 'Stocks (US)'], group: G_COSTS },
  { id: 'manualSpread', type: 'float', title: 'Manual Spread (Ticks)', defval: 1.0, group: G_COSTS, tooltip: 'Spread applied per round trip in ticks' },
  { id: 'manualComm', type: 'float', title: 'Manual Commission (%)', defval: 0.01, group: G_COSTS, tooltip: 'Commission applied per round trip as a % of position value' },
];

const TEAL = '#089981';
const RED = '#F23645';
const DATA = '#DBDBDB';
const HEADERS = '#808080';
const BACKGROUND = '#161616';
const BORDERS = '#2E2E2E';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast Source', color: '#2962FF', lineWidth: 1 },
  { id: 'plot1', title: 'Ribbon 1', color: '#2962FF', lineWidth: 1 },
  { id: 'plot2', title: 'Ribbon 2', color: '#2962FF', lineWidth: 1 },
  { id: 'plot3', title: 'Ribbon 3', color: '#2962FF', lineWidth: 1 },
  { id: 'plot4', title: 'Ribbon 4', color: '#2962FF', lineWidth: 1 },
  { id: 'plot5', title: 'Ribbon 5', color: '#2962FF', lineWidth: 1 },
  { id: 'plot6', title: 'Ribbon 6', color: '#2962FF', lineWidth: 1 },
  { id: 'plot7', title: 'Ribbon 7', color: '#2962FF', lineWidth: 1 },
  { id: 'plot8', title: 'Ribbon 8', color: '#2962FF', lineWidth: 1 },
  { id: 'plot9', title: 'Ribbon 9', color: '#2962FF', lineWidth: 1 },
  { id: 'plot10', title: 'Slow Source', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'Universal Signal Backtester [LuxAlgo]',
  shortTitle: 'LuxAlgo - Universal Signal Backtester',
  overlay: true,
};

/** max_lines_count / max_labels_count of the script */
const MAX_OBJECTS = 500;
const DIVIDER = '━'.repeat(52);
const BLOCKS = ['▂', '▃', '▄', '▅', '▆', '▇'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const nz = (v: number) => (Number.isFinite(v) ? v : 0);

/** The block character of a ratio (0 to 1): a space below 0.125, then one step per 0.125 up to the full block */
const blockOf = (ratio: number): string => {
  if (lt(ratio, 0.125)) return ' ';
  for (let k = 0; k < BLOCKS.length; k++) if (lt(ratio, 0.25 + 0.125 * k)) return BLOCKS[k];
  return '█';
};

/** get_block_char() */
const blockChar = (val: number, maxVal: number): string => (eq(maxVal, 0) || eq(val, 0) ? ' ' : blockOf(Math.abs(val) / maxVal));

/** get_heatmap_color() */
const heatmapColor = (val: number, maxV: number, minV: number): string => {
  if (gt(val, 0) && gt(maxV, 0)) return String(color.from_gradient(val, 0, maxV, color.new(TEAL, 80), color.new(TEAL, 10)));
  if (lt(val, 0) && lt(minV, 0)) return String(color.from_gradient(val, minV, 0, color.new(RED, 10), color.new(RED, 80)));
  return BACKGROUND;
};

/** Drawings as the script handles them: x is a bar index */
interface Ln { x1: number; y1: number; x2: number; y2: number; color: string }
interface Lb { x: number; y: number; text: string; color: string; textColor?: string; style: LabelStyle; size: PineSize }

/** One take profit or stop loss level of the trade */
interface Level { active: boolean; px: number; hit: boolean; line: Ln | null; label: Lb | null }

/**
 * Adds an object; at most max objects are kept: a creation that brings the count above max + 5 deletes the oldest
 * until max remain.
 */
function addLive<T>(items: T[], o: T): T {
  items.push(o);
  if (items.length > MAX_OBJECTS + 5) items.splice(0, items.length - MAX_OBJECTS);
  return o;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<UniversalSignalBacktesterInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
  markers: MarkerData[]; barColors: BarColorData[]; lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // syminfo.mintick; syminfo.timezone (hour(), year(), month(), weekofyear(), dayofweek() of the entry time)
  const MINTICK = mintickOf(chart);
  const TIMEZONE = timezoneOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const timeMs = (i: number) => (bars[i].time >= 1e12 ? bars[i].time : bars[i].time * 1000);

  // ── Strategy logic ──
  let fastLen = 9;
  let slowLen = 21;
  let isEma = true;
  if (cfg.predefCross === '12/26 EMA Cross') {
    fastLen = 12;
    slowLen = 26;
  } else if (cfg.predefCross === 'Golden/Death Cross (50/200 SMA)') {
    fastLen = 50;
    slowLen = 200;
    isEma = false;
  }
  const closeS = getSourceSeries(bars, 'close');
  // get_ribbon_ma(is_ema, len): the length is rounded
  const ribbonMa = (len: number): number[] => {
    const l = math.round(len) as number;
    return A(isEma ? ta.ema(closeS, l) : ta.sma(closeS, l));
  };
  const builtInFast = ribbonMa(fastLen);
  const builtInSlow = ribbonMa(slowLen);
  const stepLen = (slowLen - fastLen) / 10;
  const ribbon: number[][] = [];
  for (let k = 1; k <= 9; k++) ribbon.push(ribbonMa(fastLen + stepLen * k));

  const isPredef = cfg.sourceMode === 'Predefined Crosses';
  const isExtCross = cfg.sourceMode === 'External Sources (Crossovers)';
  const isExtSig = cfg.sourceMode === 'External Signals (Triggers)';
  const activeFast = isPredef ? builtInFast : A(getSourceSeries(bars, cfg.fastSource));
  const activeSlow = isPredef ? builtInSlow : A(getSourceSeries(bars, cfg.slowSource));

  const atrFilterVal = A(ta.atr(bars, 14)).map(nz);
  const atrFilterAvg = cfg.useAtrFilter ? A(ta.sma(S(atrFilterVal), cfg.atrFilterLen)) : [];
  const atrFilter = (i: number) => (cfg.useAtrFilter ? gt(atrFilterVal[i], atrFilterAvg[i]) : true);

  const B = (s: Series) => s.toArray().map((v) => Boolean(v));
  let baseLong: boolean[] = new Array(n).fill(false);
  let baseShort: boolean[] = new Array(n).fill(false);
  if (isPredef || isExtCross) {
    baseLong = B(ta.crossover(S(activeFast), S(activeSlow)));
    baseShort = B(ta.crossunder(S(activeFast), S(activeSlow)));
  } else if (isExtSig) {
    const longSig = A(getSourceSeries(bars, cfg.extLongSignal));
    const shortSig = A(getSourceSeries(bars, cfg.extShortSignal));
    const zero = S(new Array(n).fill(0));
    const prev = (a: number[], i: number) => (i >= 1 ? a[i - 1] : NaN);
    switch (cfg.signalLogic) {
      case 'Not NA (Plotshape/Markers)':
        baseLong = longSig.map((v, i) => !Number.isNaN(v) && Number.isNaN(prev(longSig, i)));
        baseShort = shortSig.map((v, i) => !Number.isNaN(v) && Number.isNaN(prev(shortSig, i)));
        break;
      case 'Crosses Over 0':
        baseLong = B(ta.crossover(S(longSig), zero));
        baseShort = B(ta.crossover(S(shortSig), zero));
        break;
      case 'Crosses Under 0':
        baseLong = B(ta.crossunder(S(longSig), zero));
        baseShort = B(ta.crossunder(S(shortSig), zero));
        break;
      case 'Value Changes':
        baseLong = longSig.map((v, i) => ne(v - prev(longSig, i), 0));
        baseShort = shortSig.map((v, i) => ne(v - prev(shortSig, i), 0));
        break;
      case 'Greater Than 0':
        baseLong = longSig.map((v) => gt(v, 0));
        baseShort = shortSig.map((v) => gt(v, 0));
        break;
      default:
        baseLong = longSig.map((v) => lt(v, 0));
        baseShort = shortSig.map((v) => lt(v, 0));
    }
  }
  const canLong = cfg.tradeDirection === 'Both' || cfg.tradeDirection === 'Long Only';
  const canShort = cfg.tradeDirection === 'Both' || cfg.tradeDirection === 'Short Only';
  const atrVal = A(ta.atr(bars, cfg.atrLen)).map(nz);

  // ── Simulation ──
  let spreadTicks = 0.0;
  let commPerc = 0.0;
  if (cfg.useCosts) {
    switch (cfg.costProfile) {
      case 'Forex (Avg)': spreadTicks = 1.0; commPerc = 0.005; break;
      case 'Crypto (Tier 1)': spreadTicks = 1.0; commPerc = 0.12; break;
      case 'Stocks (US)': spreadTicks = 2.0; commPerc = 0.0; break;
      default: spreadTicks = cfg.manualSpread; commPerc = cfg.manualComm;
    }
  }

  let isActive = false;
  let tradeDir = 0;
  let entryPx = 0.0;
  let entryTime = 0;
  let qtyLeft = 0.0;
  let tradePnl = 0.0;
  const newLevel = (): Level => ({ active: false, px: 0.0, hit: false, line: null, label: null });
  const tps: Level[] = [newLevel(), newLevel(), newLevel()];
  const sls: Level[] = [newLevel(), newLevel(), newLevel()];
  const useTp = [cfg.useTp1, cfg.useTp2, cfg.useTp3];
  const useSl = [cfg.useSl1, cfg.useSl2, cfg.useSl3];
  const tpVal = [cfg.tp1Val, cfg.tp2Val, cfg.tp3Val];
  const slVal = [cfg.sl1Val, cfg.sl2Val, cfg.sl3Val];

  const hourlyPnL: number[] = new Array(24).fill(0.0);
  const activeYears: number[] = [];
  const activeWeeks: number[] = [];
  const monthlyMap = new Map<number, number>();
  const dailyMap = new Map<number, number>();
  const allTradePnL: number[] = [];
  const equityCurve: number[] = [];
  let totalTrades = 0;
  let wins = 0;
  let losses = 0;
  let grossWin = 0.0;
  let grossLoss = 0.0;
  let maxEq = 0.0;
  let currentEq = 0.0;
  let maxDd = 0.0;
  let lastHighTime = n > 0 ? timeMs(0) : 0; // var int lastHighTime = time
  let maxStagMs = 0;
  const tpHits = [0, 0, 0];

  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const plotIds = plotConfig.map((p) => p.id);
  const plots: Record<string, Array<{ time: number; value: number; color?: string }>> = {};
  for (const id of plotIds) plots[id] = [];
  const cDistAbs = activeFast.map((v, i) => Math.abs(v - activeSlow[i]));
  const maxDistA = A(ta.sma(S(cDistAbs), 100)).map((v) => nz(v) * 2);

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const h = bar.high;
    const l = bar.low;
    const c = bar.close;
    const t = timeMs(i);
    const longCond = baseLong[i] && atrFilter(i);
    const shortCond = baseShort[i] && atrFilter(i);
    const multi = cfg.distType === 'ATR' ? atrVal[i] : cfg.distType === 'Ticks' ? MINTICK : 1.0;
    let isLongWin = false;
    let isLongLoss = false;
    let isShortWin = false;
    let isShortLoss = false;

    // The lines follow the bars until they are hit or a new signal comes
    for (const lv of [...tps, ...sls]) {
      if (lv.active && !lv.hit && lv.line && lv.label) {
        lv.line.x2 = i;
        lv.label.x = i;
      }
    }
    const tpReached = (lv: Level) => lv.active && !lv.hit && ((tradeDir === 1 && ge(h, lv.px)) || (tradeDir === -1 && le(l, lv.px)));
    const slReached = (lv: Level) => lv.active && !lv.hit && ((tradeDir === 1 && le(l, lv.px)) || (tradeDir === -1 && ge(h, lv.px)));
    const mark = (lv: Level, text: string) => {
      lv.hit = true;
      if (lv.label) lv.label.text = text;
    };
    const costOf = (qty: number) => (spreadTicks + (entryPx * (commPerc / 100)) / MINTICK) * qty;

    // Exits of the active trade
    if (isActive) {
      let closedThisBar = false;
      // 1. the stops first
      sls.forEach((lv, k) => {
        if (slReached(lv)) mark(lv, `SL ${k + 1} ✗`);
      });
      if (sls[0].hit || sls[1].hit || sls[2].hit) {
        const exitPx = sls[0].hit ? sls[0].px : sls[1].hit ? sls[1].px : sls[2].px;
        const rawPnl = (((exitPx - entryPx) * tradeDir) / MINTICK) * qtyLeft;
        tradePnl += rawPnl - costOf(qtyLeft);
        qtyLeft = 0.0;
        closedThisBar = true;
      }
      // 2. the take profits (partial exits)
      if (!closedThisBar) {
        const tpQty = 1.0 / Math.max(1, (tps[0].active ? 1 : 0) + (tps[1].active ? 1 : 0) + (tps[2].active ? 1 : 0));
        tps.forEach((lv, k) => {
          if (!tpReached(lv)) return;
          tpHits[k] += 1;
          const rawPnl = (((lv.px - entryPx) * tradeDir) / MINTICK) * tpQty;
          tradePnl += rawPnl - costOf(tpQty);
          qtyLeft -= tpQty;
          mark(lv, `TP ${k + 1} ✓`);
        });
        if (le(qtyLeft, 0.001)) closedThisBar = true;
      }
      // 3. the opposite signal
      if (!closedThisBar) {
        if ((tradeDir === 1 && shortCond) || (tradeDir === -1 && longCond)) {
          const rawPnl = (((c - entryPx) * tradeDir) / MINTICK) * qtyLeft;
          tradePnl += rawPnl - costOf(qtyLeft);
          qtyLeft = 0.0;
          closedThisBar = true;
        }
      }
      if (closedThisBar) {
        isActive = false;
        totalTrades += 1;
        allTradePnL.push(tradePnl);
        if (gt(tradePnl, 0)) {
          wins += 1;
          grossWin += tradePnl;
          if (tradeDir === 1) isLongWin = true;
          else isShortWin = true;
        } else if (lt(tradePnl, 0)) {
          losses += 1;
          grossLoss += Math.abs(tradePnl);
          if (tradeDir === 1) isLongLoss = true;
          else isShortLoss = true;
        }
        currentEq += tradePnl;
        equityCurve.push(currentEq);
        if (gt(currentEq, maxEq)) {
          maxEq = currentEq;
          lastHighTime = t;
        }
        const stag = t - lastHighTime;
        if (stag > maxStagMs) maxStagMs = stag;
        const dd = maxEq - currentEq;
        if (gt(dd, maxDd)) maxDd = dd;

        const hr = pineTime.hour(entryTime, TIMEZONE);
        hourlyPnL[hr] += tradePnl;
        const y = pineTime.year(entryTime, TIMEZONE);
        const m = pineTime.month(entryTime, TIMEZONE) - 1;
        const ym = y * 100 + m;
        if (!activeYears.includes(y)) activeYears.push(y);
        monthlyMap.set(ym, nz(monthlyMap.get(ym) ?? NaN) + tradePnl);
        const w = pineTime.weekofyear(entryTime, TIMEZONE);
        const d = pineTime.dayofweek(entryTime, TIMEZONE) - 1;
        const yw = y * 100 + w;
        const ywd = yw * 100 + d;
        if (!activeWeeks.includes(yw)) activeWeeks.push(yw);
        dailyMap.set(ywd, nz(dailyMap.get(ywd) ?? NaN) + tradePnl);
      }
    }

    // Levels of a closed trade that are still drawn
    if (!isActive) {
      tps.forEach((lv, k) => {
        if (tpReached(lv)) mark(lv, `TP ${k + 1} ✓`);
      });
      sls.forEach((lv, k) => {
        if (slReached(lv)) mark(lv, `SL ${k + 1} ✗`);
      });
    }

    // Time without a new equity high
    const currentStag = t - lastHighTime;
    if (currentStag > maxStagMs) maxStagMs = currentStag;

    // New entries
    if (!isActive) {
      const newDir = longCond && canLong ? 1 : shortCond && canShort ? -1 : 0;
      if (newDir !== 0) {
        isActive = true;
        tradeDir = newDir;
        entryPx = c;
        entryTime = t;
        qtyLeft = 1.0;
        tradePnl = 0.0;

        const tr = Math.max(1, totalTrades);
        const rate = tpHits.map((v) => v / tr);
        const dTp = tpVal.map((v) => v * multi);
        const dSl = slVal.map((v) => v * multi);
        const slDist = Math.max(MINTICK, dSl[0]);
        const metric = (k: number): number => {
          switch (cfg.suggestMetric) {
            case 'Expected Profit': return rate[k] * dTp[k];
            case 'Total Profit': return tpHits[k] * dTp[k];
            case 'Risk/Reward': return dTp[k] / slDist;
            default: return rate[k] * 100;
          }
        };
        let bestV = metric(0);
        let bestTp = 1;
        let bestRate = rate[0] * 100;
        if (gt(metric(1), bestV) && cfg.useTp2) {
          bestV = metric(1);
          bestTp = 2;
          bestRate = rate[1] * 100;
        }
        if (gt(metric(2), bestV) && cfg.useTp3) {
          bestV = metric(2);
          bestTp = 3;
          bestRate = rate[2] * 100;
        }
        const lblText = 'TP' + str.tostring(bestTp) + ' ' + str.tostring(bestRate, '#.#') + '%';
        const offset = ne(atrVal[i], 0) ? atrVal[i] : h - l;
        const col = newDir === 1 ? TEAL : RED;
        const y1 = newDir === 1 ? l : h;
        const y2 = newDir === 1 ? l - offset * 1.5 : h + offset * 1.5;
        addLive(lines, { x1: i, y1, x2: i, y2, color: col });
        addLive(labels, { x: i, y: y2, text: '', color: String(color.new(col, 80)), style: 'circle', size: 'huge' });
        addLive(labels, { x: i, y: y2, text: lblText, color: '#363A45', textColor: '#FFFFFF', style: 'label_center', size: 'small' });

        tps.forEach((lv, k) => {
          lv.active = useTp[k];
          lv.px = c + newDir * dTp[k];
          lv.hit = false;
        });
        sls.forEach((lv, k) => {
          lv.active = useSl[k];
          lv.px = c - newDir * dSl[k];
          lv.hit = false;
        });
        const draw = (lv: Level, text: string, levelColor: string) => {
          if (!lv.active) return;
          lv.line = addLive(lines, { x1: i, y1: lv.px, x2: i, y2: lv.px, color: levelColor });
          lv.label = addLive(labels, { x: i, y: lv.px, text, color: '#00000000', textColor: levelColor, style: 'label_left', size: 'tiny' });
        };
        tps.forEach((lv, k) => draw(lv, `TP ${k + 1}`, TEAL));
        sls.forEach((lv, k) => draw(lv, `SL ${k + 1}`, RED));
      }
    }

    // ── Visuals ──
    // rColor(idx): color.new(activeFast > activeSlow ? teal : red, idx * 8)
    const baseC = gt(activeFast[i], activeSlow[i]) ? TEAL : RED;
    const rColor = (idx: number) => String(color.new(baseC, idx * 8));
    const cDist = activeFast[i] - activeSlow[i];
    if (cfg.useCandleColor) {
      const candleColor = color.from_gradient(cDist, -maxDistA[i], maxDistA[i], RED, TEAL);
      barColors.push({ time: bar.time, color: String(candleColor) });
    }
    plots.plot0.push({ time: bar.time, value: activeFast[i], color: isPredef ? rColor(0) : '#2962FF' });
    for (let k = 1; k <= 9; k++) {
      plots[`plot${k}`].push({ time: bar.time, value: isPredef ? ribbon[k - 1][i] : NaN, color: rColor(k) });
    }
    plots.plot10.push({ time: bar.time, value: activeSlow[i], color: isPredef ? rColor(10) : '#FF6D00' });

    const shape = (on: boolean, position: 'aboveBar' | 'belowBar', shapeColor: string) => {
      if (on) markers.push({ time: bar.time, position, shape: 'xcross', color: shapeColor, size: 'tiny' });
    };
    shape(isLongWin, 'aboveBar', TEAL);
    shape(isLongLoss, 'aboveBar', RED);
    shape(isShortWin, 'belowBar', TEAL);
    shape(isShortLoss, 'belowBar', RED);
  }

  // ── Dashboard: var table dash = table.new(position, 24, 30, ...), written on the last bar ──
  const position: TablePosition = cfg.dashPos === 'Top Right' ? 'top_right' : cfg.dashPos === 'Bottom Right' ? 'bottom_right' : 'bottom_left';
  const dashSize = cfg.dashSize.toLowerCase() as PineSize;
  const cells: TableCellData[] = [];
  const merges: TableMergeData[] = [];
  const tables: TableData[] = [];

  if (n > 0) {
    if (cfg.showDash) {
      const merge = (startColumn: number, startRow: number, endColumn: number, endRow: number) => {
        merges.push({ startColumn, startRow, endColumn, endRow });
      };
      const cell = (column: number, row: number, text: string, textColor: string, extra: Partial<TableCellData> = {}) => {
        cells.push({ column, row, text, textColor, textSize: dashSize, ...extra });
      };
      const tinyCell = (column: number, row: number, text: string, textColor: string, bgColor?: string) => {
        cells.push({ column, row, text, textColor, textSize: 'tiny', textHAlign: 'center', ...(bgColor !== undefined ? { bgColor } : {}) });
      };
      activeYears.sort((a, b) => a - b);
      activeWeeks.sort((a, b) => a - b);

      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
      const pf = gt(grossLoss, 0) ? grossWin / grossLoss : gt(grossWin, 0) ? 99.9 : 0;
      const netProfit = grossWin - grossLoss;
      const recoveryFactor = gt(maxDd, 0) ? netProfit / maxDd : gt(netProfit, 0) ? 99.9 : 0;
      const count = allTradePnL.length;
      const meanPnL = count > 0 ? (array.sum(allTradePnL) as number) / count : 0;
      let devSum = 0.0;
      for (const p of allTradePnL) devSum += math.pow(p - meanPnL, 2) as number;
      const stdDev = count > 0 ? Math.sqrt(devSum / count) : 0;
      const sharpe = gt(stdDev, 0) ? meanPnL / stdDev : 0;

      // Equity curve as 24 block characters
      let eqStr = '';
      const eqSize = equityCurve.length;
      if (eqSize > 0) {
        const bins = 24;
        const step = eqSize / bins;
        const minE = array.min(equityCurve) as number;
        const maxE = array.max(equityCurve) as number;
        const rangeE = Math.max(0.0001, maxE - minE);
        for (let k = 0; k < bins; k++) {
          let idx = Math.floor(k * step);
          if (idx >= eqSize) idx = eqSize - 1;
          eqStr += blockOf((equityCurve[idx] - minE) / rangeE);
        }
      }
      const hitsText = (k: number) => {
        const perc = totalTrades > 0 ? (tpHits[k] / totalTrades) * 100 : 0;
        return str.tostring(tpHits[k]) + ' (' + str.tostring(perc, '#.#') + '%)';
      };

      merge(0, 0, 23, 0);
      cell(0, 0, 'Advanced Backtest Analytics', DATA, { textHAlign: 'center', bgColor: BORDERS });

      const head4 = ['Total Trades', 'Win Rate', 'Profit Factor', 'Total PnL (Ticks)'];
      const data4: Array<[string, string]> = [
        [str.tostring(totalTrades), DATA],
        [str.tostring(winRate, '#.#') + '%', ge(winRate, 50) ? TEAL : RED],
        [str.tostring(pf, '#.##'), ge(pf, 1) ? TEAL : RED],
        [str.tostring(currentEq, '#.##'), ge(currentEq, 0) ? TEAL : RED],
      ];
      head4.forEach((text, k) => {
        merge(k * 6, 1, k * 6 + 5, 1);
        cell(k * 6, 1, text, HEADERS);
      });
      data4.forEach(([text, textColor], k) => {
        merge(k * 6, 2, k * 6 + 5, 2);
        cell(k * 6, 2, text, textColor);
      });
      const row3 = (row: number, texts: string[], textColor: string) => {
        texts.forEach((text, k) => {
          merge(k * 8, row, k * 8 + 7, row);
          cell(k * 8, row, text, textColor);
        });
      };
      row3(3, ['Sharpe Ratio', 'Recovery Factor', 'Max Stagnation'], HEADERS);
      // format_time(): the days, rounded
      row3(4, [str.tostring(sharpe, '#.##'), str.tostring(recoveryFactor, '#.##'),
        str.tostring(math.round(maxStagMs / 86400000.0) as number) + 'd'], DATA);
      row3(5, ['TP 1 Hits', 'TP 2 Hits', 'TP 3 Hits'], HEADERS);
      row3(6, [hitsText(0), hitsText(1), hitsText(2)], DATA);

      merge(0, 7, 23, 7);
      cell(0, 7, 'Equity Curve  ' + eqStr, TEAL, { textHAlign: 'left' });
      merge(0, 8, 23, 8);
      cell(0, 8, DIVIDER, BORDERS, { height: 0.5 });
      merge(0, 9, 23, 9);
      cell(0, 9, 'Performance by Hour of Day', HEADERS);

      const maxH = array.max(hourlyPnL) as number;
      const minH = array.min(hourlyPnL) as number;
      const absMaxH = Math.max(Math.abs(maxH), Math.abs(minH));
      for (let k = 0; k <= 23; k++) {
        const val = hourlyPnL[k];
        cell(k, 10, blockChar(val, absMaxH), ge(val, 0) ? TEAL : RED);
        cells.push({ column: k, row: 11, text: str.tostring(k), textColor: HEADERS, textSize: 'tiny' });
      }
      merge(0, 12, 23, 12);
      cell(0, 12, DIVIDER, BORDERS, { height: 0.5 });
      merge(0, 13, 23, 13);
      cell(0, 13, 'Performance by ' + cfg.heatmapPeriod, HEADERS);

      let startRow = 14;
      const fmt = (v: number) => str.tostring(v, '#.#');
      if (cfg.heatmapPeriod === 'Months') {
        const allMonths = [...monthlyMap.values()];
        const maxM = allMonths.length > 0 ? (array.max(allMonths) as number) : 0.0;
        const minM = allMonths.length > 0 ? (array.min(allMonths) as number) : 0.0;
        merge(4, startRow, 5, startRow);
        tinyCell(4, startRow, 'Year', HEADERS);
        for (let k = 0; k <= 11; k++) tinyCell(6 + k, startRow, MONTHS[k], HEADERS);
        merge(18, startRow, 19, startRow);
        tinyCell(18, startRow, 'Total', HEADERS);
        startRow += 1;
        const nYears = activeYears.length;
        const drawYears = Math.min(nYears, 10);
        for (let k = 0; k < drawYears; k++) {
          const rOffset = startRow + k;
          const y = activeYears[nYears - drawYears + k];
          merge(4, rOffset, 5, rOffset);
          tinyCell(4, rOffset, str.tostring(y), DATA);
          let rowTotal = 0.0;
          for (let m = 0; m <= 11; m++) {
            const val = nz(monthlyMap.get(y * 100 + m) ?? NaN);
            rowTotal += val;
            tinyCell(6 + m, rOffset, eq(val, 0) ? '-' : fmt(val), DATA, eq(val, 0) ? BACKGROUND : heatmapColor(val, maxM, minM));
          }
          merge(18, rOffset, 19, rOffset);
          tinyCell(18, rOffset, fmt(rowTotal), DATA, eq(rowTotal, 0) ? BACKGROUND : heatmapColor(rowTotal, maxM * 3, minM * 3));
        }
      } else {
        const allDays = [...dailyMap.values()];
        const maxD = allDays.length > 0 ? (array.max(allDays) as number) : 0.0;
        const minD = allDays.length > 0 ? (array.min(allDays) as number) : 0.0;
        merge(3, startRow, 5, startRow);
        tinyCell(3, startRow, 'Week', HEADERS);
        for (let k = 0; k <= 6; k++) {
          merge(6 + k * 2, startRow, 7 + k * 2, startRow);
          tinyCell(6 + k * 2, startRow, DAYS[k], HEADERS);
        }
        merge(20, startRow, 22, startRow);
        tinyCell(20, startRow, 'Total', HEADERS);
        startRow += 1;
        const nWeeks = activeWeeks.length;
        const drawWeeks = Math.min(nWeeks, 10);
        for (let k = 0; k < drawWeeks; k++) {
          const rOffset = startRow + k;
          const yw = activeWeeks[nWeeks - drawWeeks + k];
          const y = Math.floor(yw / 100);
          const w = yw % 100;
          merge(3, rOffset, 5, rOffset);
          tinyCell(3, rOffset, str.tostring(y) + '-W' + str.tostring(w), DATA);
          let rowTotal = 0.0;
          for (let d = 0; d <= 6; d++) {
            const val = nz(dailyMap.get(yw * 100 + d) ?? NaN);
            rowTotal += val;
            const column = 6 + d * 2;
            merge(column, rOffset, column + 1, rOffset);
            tinyCell(column, rOffset, eq(val, 0) ? '-' : fmt(val), DATA, eq(val, 0) ? BACKGROUND : heatmapColor(val, maxD, minD));
          }
          merge(20, rOffset, 22, rOffset);
          tinyCell(20, rOffset, fmt(rowTotal), DATA, eq(rowTotal, 0) ? BACKGROUND : heatmapColor(rowTotal, maxD * 3, minD * 3));
        }
      }
    }
    tables.push({
      position, columns: 24, rows: 30, cells, merges,
      bgColor: BACKGROUND, borderColor: BACKGROUND, borderWidth: 1, frameColor: BORDERS, frameWidth: 1,
    });
  }

  const interval = barInterval(bars);
  const X = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    barColors,
    lines: lines.map((ln) => ({ time1: X(ln.x1), price1: ln.y1, time2: X(ln.x2), price2: ln.y2, color: ln.color, style: 'dashed' as const })),
    labels: labels.map((lb) => ({
      time: X(lb.x), price: lb.y, text: lb.text, color: lb.color, style: lb.style, size: lb.size,
      ...(lb.textColor !== undefined ? { textColor: lb.textColor } : {}),
    })),
    tables,
  };
}

export const UniversalSignalBacktester = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
