/**
 * Breakout Pattern Setup [WillyAlgoTrader]
 *
 * Finds converging channels (wedges / triangles) on swing pivots and trades their breakout:
 * - Pivots: highs and lows with `Pivot Detection Length` bars on each side (the last 60 of each are kept).
 * - Scan (on a new pivot or every 10th bar, when no channel or trade is open and after the warm-up of
 *   2 x pivot length + max channel width bars, at least 50): from the latest 16 pivots of each side inside the last
 *   `Max Channel Width` bars, the upper line is the pair of pivot highs whose line has no pivot more than
 *   `Max Deviation` x ATR(20) above it and the most pivots within `Touch Tolerance` x ATR (at least `Min Touches`);
 *   the lower line likewise on the pivot lows. A channel is kept when it narrows by at least `Min Convergence Rate`
 *   from its first pivot to the current bar, its width now is between `Min Channel Width` and 10 ATR, the previous
 *   close is inside it, and (filter) the mean volume inside the pattern is below 85 % of the mean volume of the same
 *   number of bars before it.
 * - The channel is drawn with two lines (the line colour at 50 % transparency) and a linefill (90 %), extended to the
 *   current bar; it expires after `Max Channel Width` bars without a breakout.
 * - Breakout (closed bars): a close above the upper line (Long) or below the lower line (Short). A strength score
 *   (penetration in ATR, body ratio, body beyond the line, volume above `Volume Spike Mult` x SMA(20), RSI(14) on
 *   the side of 50) gives Strong / Medium / Weak. The channel takes the bull / bear colour.
 * - Trade levels: entry at the close, SL at the opposite line (+ `SL Padding` x ATR), target = break line + the
 *   widest channel height, TP1 / TP2 / TP3 at 1/3, 2/3 and 3/3 of the move. Lines and labels (`Label Offset` bars to
 *   the right) follow the current bar while the trade is open. TP1 moves the stop to the entry (a later stop is a
 *   "BE Exit"); TP3, SL, BE exit or a timeout of 3 x max channel width bars closes the trade.
 * - "Last Only" keeps the drawings of the latest pattern and trade; "All" keeps up to 400 lines, 200 linefills and
 *   200 labels of history.
 * - Dashboard (14 rows) and a watermark table on the last bar; a background while a channel waits for its breakout
 *   (off by default).
 * - Alerts (alert() calls, `alertCalls` of the result, once per bar close), text or webhook JSON as the "Webhook JSON
 *   Format" input says: trade timeout, BUY / SELL on a confirmed breakout (strength, entry, SL, TP1-3), PATTERN
 *   DETECTED on a new channel, and TP1 / TP2 / TP3 hit, SL hit and BE exit on the bar they first happen.
 *
 * Chart context: `syminfo.mintick` (price texts, ATR fallback), `chart.bg_color` (theme "Auto"),
 * `timeframe.period` (dashboard) and the state of the last bar (`barstate.isconfirmed`).
 *
 * Reference: "Breakout Pattern Setup [WillyAlgoTrader]" by WillyAlgoTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, str, color, Series, line, label, linefill, table, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type Label, type Linefill,
  type Table, type BgColorData,
} from 'oakscriptjs';
import {
  mintickOf, backgroundColorOf, lastBarConfirmedOf, tickeridOf, type ChartContext,
} from '../chart-context';
import type { AlertCall } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;
import { chartTimeframe } from '../anchor-period';

export interface BreakoutPatternSetupInputs {
  pivotLen: number;
  minTouches: number;
  maxChannelBars: number;
  convergenceMin: number;
  touchTolerance: number;
  deviationMax: number;
  minChannelWidthAtr: number;
  volConfirm: number;
  volContraction: boolean;
  momentumFilter: boolean;
  showPatterns: boolean;
  showSignals: boolean;
  showBg: boolean;
  historyMode: 'All' | 'Last Only';
  labelSize: 'Tiny' | 'Small' | 'Normal';
  showWatermark: boolean;
  showFill: boolean;
  lineColor: string;
  lineWidth: number;
  showLevels: boolean;
  slPadding: number;
  labelOffset: number;
  showDash: boolean;
  dashPos: 'Top Left' | 'Top Right' | 'Bottom Left' | 'Bottom Right';
  dashSize: 'Tiny' | 'Small' | 'Normal';
  theme: 'Auto' | 'Dark' | 'Light';
  bullColor: string;
  bearColor: string;
  /** Alert message format (no output) */
  webhook: boolean;
}

export const defaultInputs: BreakoutPatternSetupInputs = {
  pivotLen: 5,
  minTouches: 2,
  maxChannelBars: 120,
  convergenceMin: 0.02,
  touchTolerance: 0.15,
  deviationMax: 0.3,
  minChannelWidthAtr: 0.5,
  volConfirm: 1.2,
  volContraction: true,
  momentumFilter: true,
  showPatterns: true,
  showSignals: true,
  showBg: false,
  historyMode: 'Last Only',
  labelSize: 'Small',
  showWatermark: true,
  showFill: true,
  lineColor: '#FFEB3B',
  lineWidth: 2,
  showLevels: true,
  slPadding: 0,
  labelOffset: 20,
  showDash: true,
  dashPos: 'Top Right',
  dashSize: 'Small',
  theme: 'Auto',
  bullColor: '#00E676',
  bearColor: '#FF5252',
  webhook: false,
};

const GRP_MAIN = '⚙️ Main Settings';
const GRP_FILTER = '🔍 Filters';
const GRP_VISUAL = '🎨 Visual';
const GRP_RISK = '🛡️ Risk Management';
const GRP_LINES = '📐 Channel Lines';
const GRP_DASH = '📊 Dashboard';
const GRP_ALERT = '🔔 Alerts';
const GRP_COLORS = '🎨 Colors';
const GRP_ADV = '🔧 Advanced';

export const inputConfig: InputConfig[] = [
  { id: 'pivotLen', type: 'int', title: 'Pivot Detection Length', defval: 5, min: 2, max: 30, group: GRP_MAIN,
    tooltip: 'Bars left/right for swing pivot detection.\n• Recommended: 3–10' },
  { id: 'minTouches', type: 'int', title: 'Min Touches per Boundary', defval: 2, min: 2, max: 6, group: GRP_MAIN,
    tooltip: 'Minimum pivot touches per trendline.\n• Recommended: 2–3' },
  { id: 'maxChannelBars', type: 'int', title: 'Max Channel Width (bars)', defval: 120, min: 20, max: 500, step: 10,
    group: GRP_MAIN, tooltip: 'Maximum lookback.\n• Recommended: 60–150' },
  { id: 'convergenceMin', type: 'float', title: 'Min Convergence Rate', defval: 0.02, min: 0, max: 0.5, step: 0.01,
    group: GRP_MAIN, tooltip: 'Min narrowing rate (0–1).\n• Recommended: 0.02–0.15' },
  { id: 'touchTolerance', type: 'float', title: 'Touch Tolerance (ATR)', defval: 0.15, min: 0.01, max: 0.5, step: 0.01,
    group: GRP_ADV, tooltip: 'Pivot distance to count as touch.\n• Recommended: 0.10–0.25' },
  { id: 'deviationMax', type: 'float', title: 'Max Deviation (ATR)', defval: 0.3, min: 0.05, max: 1, step: 0.05,
    group: GRP_ADV, tooltip: 'Max pivot overshoot.\n• Recommended: 0.2–0.5' },
  { id: 'minChannelWidthAtr', type: 'float', title: 'Min Channel Width (ATR)', defval: 0.5, min: 0.1, max: 3, step: 0.1,
    group: GRP_ADV, tooltip: 'Min width filter.\n• Recommended: 0.3–1.0' },
  { id: 'volConfirm', type: 'float', title: 'Volume Spike Mult', defval: 1.2, min: 0.5, max: 3, step: 0.1,
    group: GRP_FILTER, tooltip: 'Volume vs SMA(20).\n• Set 0.5 to disable on forex' },
  { id: 'volContraction', type: 'bool', title: 'Volume Contraction Filter', defval: true, group: GRP_FILTER,
    tooltip: 'Require volume decline inside channel' },
  { id: 'momentumFilter', type: 'bool', title: 'Momentum Confirmation', defval: true, group: GRP_FILTER,
    tooltip: 'RSI > 50 for bull, < 50 for bear' },
  { id: 'showPatterns', type: 'bool', title: 'Show Channel Patterns', defval: true, group: GRP_VISUAL },
  { id: 'showSignals', type: 'bool', title: 'Show Breakout Signals', defval: true, group: GRP_VISUAL },
  { id: 'showBg', type: 'bool', title: 'Show Pattern Background', defval: false, group: GRP_VISUAL,
    tooltip: 'Subtle bgcolor while price is inside channel' },
  { id: 'historyMode', type: 'string', title: 'Pattern History', defval: 'Last Only', options: ['All', 'Last Only'],
    group: GRP_VISUAL, tooltip: 'All: full history | Last Only: clean chart' },
  { id: 'labelSize', type: 'string', title: 'Label Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'],
    group: GRP_VISUAL, tooltip: 'Size of ▲ ▼ ✗ labels' },
  { id: 'showWatermark', type: 'bool', title: 'Show Watermark', defval: true, group: GRP_VISUAL },
  { id: 'showFill', type: 'bool', title: 'Show Channel Fill', defval: true, group: GRP_LINES,
    tooltip: 'Show/hide the shaded area between channel boundaries' },
  { id: 'lineColor', type: 'color', title: 'Line Color', defval: '#FFEB3B', group: GRP_LINES,
    tooltip: 'Color of channel boundary lines (before breakout)' },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 2, min: 1, max: 4, group: GRP_LINES,
    tooltip: 'Thickness of channel boundary lines.\n• 1 = thin\n• 2 = default\n• 3–4 = bold' },
  { id: 'showLevels', type: 'bool', title: 'Show Trade Levels', defval: true, group: GRP_RISK,
    tooltip: 'Display Entry / SL / TP1 / TP2 / TP3 lines and labels' },
  { id: 'slPadding', type: 'float', title: 'SL Padding (ATR)', defval: 0, min: 0, max: 1, step: 0.05, group: GRP_RISK,
    tooltip: 'Extra buffer beyond opposite boundary for SL.\n• 0 = exactly at boundary\n• 0.2 = boundary + 0.2×ATR\n• Recommended: 0.1–0.3' },
  { id: 'labelOffset', type: 'int', title: 'Label Offset (bars)', defval: 20, min: 5, max: 50, group: GRP_RISK,
    tooltip: 'How far right of last candle to place level labels.\n• Recommended: 15–25' },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: true, group: GRP_DASH },
  { id: 'dashPos', type: 'string', title: 'Position', defval: 'Top Right',
    options: ['Top Left', 'Top Right', 'Bottom Left', 'Bottom Right'], group: GRP_DASH },
  { id: 'dashSize', type: 'string', title: 'Font Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'],
    group: GRP_DASH, tooltip: 'Dashboard text size.\n• Tiny: compact\n• Small: default\n• Normal: larger, easier to read' },
  { id: 'theme', type: 'string', title: 'Theme', defval: 'Auto', options: ['Auto', 'Dark', 'Light'], group: GRP_VISUAL },
  { id: 'bullColor', type: 'color', title: 'Bull', defval: '#00E676', inline: 'colors', group: GRP_COLORS },
  { id: 'bearColor', type: 'color', title: 'Bear', defval: '#FF5252', inline: 'colors', group: GRP_COLORS },
  { id: 'webhook', type: 'bool', title: 'Webhook JSON Format', defval: false, group: GRP_ALERT },
];

// No plot(): bgcolor, drawings and tables
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Breakout Pattern Setup [WillyAlgoTrader]',
  shortTitle: 'BPS',
  overlay: true,
};

const INDICATOR_VERSION = 'v1.7.2';
const MAX_PIVOTS = 60;
const RESCAN_INTERVAL = 10;
const MAX_PIVOT_SCAN = 15;
const WARMUP_MINIMUM = 50;
const LINE_EPSILON = 1e-10;
const MAX_WIDTH_MULT = 10.0;
const VOL_CONTR_THRESH = 0.85;
const BG_TRANSPARENCY = 90.0;
const MAX_HIST_LINES = 400;
const MAX_HIST_FILLS = 200;
const MAX_HIST_LABELS = 200;
const TRADE_TIMEOUT_MULT = 3;
const DASH = '—';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
const nz = (v: number, r = 0) => (isNaN(v) ? r : v);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

/** safeDiv(num, den, fallback) */
const safeDiv = (num: number, den: number, fallback = 0.0) => (ne(den, 0) && !isNaN(num) && !isNaN(den) ? num / den : fallback);

/** lineAt(x1, y1, x2, y2, x) */
const lineAt = (x1: number, y1: number, x2: number, y2: number, x: number) => {
  const dx = x2 - x1;
  return gt(Math.abs(dx), LINE_EPSILON) ? y1 + (y2 - y1) * (x - x1) / dx : y1;
};

/** Red channel of a colour string (#RRGGBB[AA] or rgb[a](...)) */
const redOf = (c: string) => {
  const s = String(c).trim();
  if (s.startsWith('#')) return parseInt(s.slice(1, 3), 16);
  const m = /\(([^,]+),/.exec(s);
  return m ? Math.trunc(Number(m[1])) : 0;
};

const SIZES = { Tiny: 'tiny', Small: 'small', Normal: 'normal' } as const;
const POSITIONS = {
  'Top Left': 'top_left', 'Top Right': 'top_right', 'Bottom Left': 'bottom_left', 'Bottom Right': 'bottom_right',
} as const;

export function calculate(
  bars: Bar[],
  inputs: Partial<BreakoutPatternSetupInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const mintick = mintickOf(chart);
  const fmt = (x: number) => str.tostring(x, 'mintick', mintick);
  const pct = (x: number) => `${str.tostring(x, '#.##')}%`;

  // Theme
  const isDark = cfg.theme === 'Dark' ? true : cfg.theme === 'Light' ? false : redOf(backgroundColorOf(chart)) < 128;
  const TEXT_COLOR = isDark ? '#E0E0E0' : '#1A1A1A';
  const TEXT_MUTED = isDark ? String(color.new('#9E9E9E', 0)) : String(color.new('#757575', 0));
  const TEXT_BRIGHT = isDark ? '#FFFFFF' : '#000000';
  const TABLE_BG = isDark ? String(color.new('#131722', 5)) : String(color.new('#FFFFFF', 5));
  const TABLE_BORDER = isDark ? String(color.new('#2A2E39', 0)) : String(color.new('#D0D0D0', 0));
  const TABLE_ROW_ALT = isDark ? String(color.new('#1C2030', 0)) : String(color.new('#F0F4F8', 0));
  const HEADER_BG = String(color.new('#2962FF', 0));
  const WM_COLOR = isDark ? String(color.new('#FFFFFF', 80)) : String(color.new('#000000', 80));
  const DASH_GREEN = isDark ? String(color.new('#00E676', 0)) : String(color.new('#1B8A2A', 0));
  const DASH_RED = isDark ? String(color.new('#FF5252', 0)) : String(color.new('#CC1A1A', 0));
  const DASH_CYAN = isDark ? String(color.new('#40E0D0', 0)) : String(color.new('#0E8C7F', 0));
  const BULL_BG = String(color.new(cfg.bullColor, 88));
  const BEAR_BG = String(color.new(cfg.bearColor, 88));
  const CHANNEL_LINE_COLOR = String(color.new(cfg.lineColor, 50));
  const SL_COLOR = String(color.new('#FF1744', 0));
  const TP_COLOR = String(color.new('#00E676', 0));
  const ENTRY_COLOR = String(color.new('#2979FF', 0));
  const TP_HIT_COLOR = String(color.new('#40E0D0', 0));
  const CHANNEL_FILL_COLOR = cfg.showFill ? String(color.new(cfg.lineColor, 90)) : String(color.new(cfg.lineColor, 100));
  const white = '#FFFFFF';
  const dashSize = SIZES[cfg.dashSize] ?? 'small';
  const lblSize = SIZES[cfg.labelSize] ?? 'small';
  const dashPos = POSITIONS[cfg.dashPos] ?? 'top_right';

  // Core calculations
  const close = new Series(bars, (b) => b.close);
  const vols = bars.map((b) => nz(b.volume ?? NaN));
  const atr20 = A(ta.atr(bars, 20)).map((v) => nz(v, mintick * 10));
  const rsiVal = A(ta.rsi(close, 14)).map((v) => nz(v, 50.0));
  const volSma = A(ta.sma(new Series(bars, (b) => b.volume ?? NaN), 20)).map((v) => nz(v, 0.0));
  const cumVol: number[] = [];
  vols.forEach((v, i) => cumVol.push((i > 0 ? cumVol[i - 1] : 0) + v));
  const cumAt = (i: number, k: number) => (i - k >= 0 ? cumVol[i - k] : NaN);

  const pivotLen = cfg.pivotLen;
  const maxCh = cfg.maxChannelBars;
  const WARMUP_BARS = Math.max(pivotLen * 2 + maxCh, WARMUP_MINIMUM);
  const showLastOnly = cfg.historyMode === 'Last Only';

  const pivHigh = A(ta.pivothigh(new Series(bars, (b) => b.high), pivotLen, pivotLen));
  const pivLow = A(ta.pivotlow(new Series(bars, (b) => b.low), pivotLen, pivotLen));

  resetDrawings({ line: 500, label: 500 });

  const hiPrices: number[] = [];
  const hiBars: number[] = [];
  const loPrices: number[] = [];
  const loBars: number[] = [];

  // Channel state
  let channelActive = false;
  let hiX1 = 0.0, hiY1 = 0.0, hiX2 = 0.0, hiY2 = 0.0;
  let loX1 = 0.0, loY1 = 0.0, loX2 = 0.0, loY2 = 0.0;
  let chHiTouches = 0;
  let chLoTouches = 0;
  let chConvergence = 0.0;
  let chMaxWidth = 0.0;
  let chDetectBar = 0;
  const chHiLine = varDrawing<Line>();
  const chLoLine = varDrawing<Line>();
  const chFill = varDrawing<Linefill>();

  let breakoutDir = 0;
  let breakoutBar = 0;
  let breakStrength = DASH;
  let volContraction = 0.0;
  let entryPrice = 0.0;
  let slPrice = 0.0;
  let slPriceOrig = 0.0;
  let tp1Price = 0.0, tp2Price = 0.0, tp3Price = 0.0;
  let tp1Hit = false, tp2Hit = false, tp3Hit = false, slHit = false, beExit = false;
  let tradeOpen = false;
  let lastTradeResult = DASH;

  let totalPatterns = 0;
  let bullBreaks = 0;
  let bearBreaks = 0;
  let winCount = 0;
  let lossCount = 0;
  let timeoutCount = 0;
  let lastSignalBar = 0;
  let lastSignalType = DASH;
  let dirScore = 50.0;

  const histLines: Line[] = [];
  const histFills: Linefill[] = [];
  const histLabels: Label[] = [];

  const lineEntry = varDrawing<Line>();
  const lineSL = varDrawing<Line>();
  const lineTP1 = varDrawing<Line>();
  const lineTP2 = varDrawing<Line>();
  const lineTP3 = varDrawing<Line>();
  const lbEntry = varDrawing<Label>();
  const lbSL = varDrawing<Label>();
  const lbTP1 = varDrawing<Label>();
  const lbTP2 = varDrawing<Label>();
  const lbTP3 = varDrawing<Label>();
  let hasTradeDrawings = false;
  const dashTable = varDrawing<Table>();
  const wmTable = varDrawing<Table>();

  const deleteTradeDrawings = () => {
    for (const l of [lineEntry, lineSL, lineTP1, lineTP2, lineTP3]) if (l.value) line.delete(l.value);
    for (const l of [lbEntry, lbSL, lbTP1, lbTP2, lbTP3]) if (l.value) label.delete(l.value);
  };

  const bgColors: BgColorData[] = [];
  const lastConfirmed = lastBarConfirmedOf(chart);
  const tfPeriod = chartTimeframe(bars, chart);
  let prevTp1 = false, prevTp2 = false, prevTp3 = false, prevSl = false, prevBe = false;

  // Alert messages: formatAlertMsg() / formatEventMsg() of the original
  const alertCalls: AlertCall[] = [];
  const tickerStr = tickeridOf(chart);
  const pushAlert = (time: number, message: string) => alertCalls.push({ time, message, freq: 'once_per_bar_close' });
  const formatAlertMsg = (action: string, emoji: string, strLbl: string, close: number, sl: number, tp1: number,
    tp2: number, tp3: number) => {
    const priceStr = fmt(close);
    const slAlStr = fmt(sl);
    const t1Str = fmt(tp1);
    const t2Str = fmt(tp2);
    const t3Str = fmt(tp3);
    const jsonMsg = '{"action":"' + action + '","ticker":"' + tickerStr + '","price":' + priceStr + ',"sl":' + slAlStr
      + ',"tp1":' + t1Str + ',"tp2":' + t2Str + ',"tp3":' + t3Str + ',"strength":"' + strLbl + '","tf":"' + tfPeriod + '"}';
    const textMsg = emoji + ' ' + action.toUpperCase() + ' [' + strLbl + '] | ' + tickerStr + ' | ' + tfPeriod
      + ' | Entry: ' + priceStr + ' | SL: ' + slAlStr + ' | TP1: ' + t1Str + ' | TP2: ' + t2Str + ' | TP3: ' + t3Str;
    return cfg.webhook ? jsonMsg : textMsg;
  };
  const formatEventMsg = (eventName: string, emoji: string, close: number) => {
    const pStr = fmt(close);
    return cfg.webhook ? '{"event":"' + eventName + '","ticker":"' + tickerStr + '","price":' + pStr + '}'
      : emoji + ' ' + eventName.toUpperCase() + ' | ' + tickerStr + ' | ' + pStr;
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const isWarmedUp = i >= WARMUP_BARS;
    const atr = atr20[i];
    const hasVolume = nz(b.volume ?? NaN, 0) > 0;

    // Pivot detection
    if (!isNaN(pivHigh[i])) {
      hiPrices.unshift(pivHigh[i]);
      hiBars.unshift(i - pivotLen);
    }
    if (!isNaN(pivLow[i])) {
      loPrices.unshift(pivLow[i]);
      loBars.unshift(i - pivotLen);
    }
    while (hiPrices.length > MAX_PIVOTS) {
      hiPrices.pop();
      hiBars.pop();
    }
    while (loPrices.length > MAX_PIVOTS) {
      loPrices.pop();
      loBars.pop();
    }

    // Boundary-fit channel detection
    const newPivot = !isNaN(pivHigh[i]) || !isNaN(pivLow[i]);
    const rescanDue = i % RESCAN_INTERVAL === 0;
    const shouldScan = (newPivot || rescanDue) && !channelActive && !tradeOpen && isWarmedUp
      && hiPrices.length >= cfg.minTouches && loPrices.length >= cfg.minTouches;
    let channelJustDetected = false;

    if (shouldScan) {
      const hX: number[] = [];
      const hY: number[] = [];
      const lX: number[] = [];
      const lY: number[] = [];
      for (let k = 0; k <= Math.min(hiPrices.length - 1, MAX_PIVOT_SCAN); k++) {
        if (i - hiBars[k] <= maxCh) {
          hX.push(hiBars[k]);
          hY.push(hiPrices[k]);
        }
      }
      for (let k = 0; k <= Math.min(loPrices.length - 1, MAX_PIVOT_SCAN); k++) {
        if (i - loBars[k] <= maxCh) {
          lX.push(loBars[k]);
          lY.push(loPrices[k]);
        }
      }
      const devTol = atr * cfg.deviationMax;
      const touchTol = atr * cfg.touchTolerance;

      /** Best line through two pivots of one side (upper: no pivot above it; lower: no pivot below it) */
      const fit = (X: number[], Y: number[], upper: boolean) => {
        const cnt = X.length;
        let best = { x1: 0.0, y1: 0.0, x2: 0.0, y2: 0.0, touches: 0, found: false };
        if (cnt >= cfg.minTouches) {
          for (let a = 0; a <= cnt - 2; a++) {
            for (let c = a + 1; c <= cnt - 1; c++) {
              const ax = X[a], ay = Y[a], bx = X[c], by = Y[c];
              if (ge(Math.abs(bx - ax), 1.0)) {
                let ok = true;
                let touches = 0;
                for (let k = 0; k <= cnt - 1; k++) {
                  const diff = Y[k] - lineAt(ax, ay, bx, by, X[k]);
                  if (upper ? gt(diff, devTol) : lt(diff, -devTol)) {
                    ok = false;
                    break;
                  }
                  if (le(Math.abs(diff), touchTol)) touches += 1;
                }
                if (ok && touches >= cfg.minTouches && touches > best.touches) {
                  best = { x1: ax, y1: ay, x2: bx, y2: by, touches, found: true };
                }
              }
            }
          }
        }
        return best;
      };
      const hi = fit(hX, hY, true);
      const lo = fit(lX, lY, false);

      if (hi.found && lo.found) {
        const hiMinX = Math.min(hi.x1, hi.x2);
        const hiMaxX = Math.max(hi.x1, hi.x2);
        const loMinX = Math.min(lo.x1, lo.x2);
        const loMaxX = Math.max(lo.x1, lo.x2);
        const overlapStart = Math.max(hiMinX, loMinX);
        const overlapEnd = Math.min(hiMaxX, loMaxX);
        let maxH = 0.0;
        if (gt(overlapEnd, overlapStart)) {
          const samples = Math.max(Math.trunc((overlapEnd - overlapStart) / 5.0), 2);
          for (let s = 0; s <= samples; s++) {
            const sx = overlapStart + (overlapEnd - overlapStart) * s / samples;
            const hu = lineAt(hi.x1, hi.y1, hi.x2, hi.y2, sx);
            const lw = lineAt(lo.x1, lo.y1, lo.x2, lo.y2, sx);
            if (gt(hu - lw, maxH)) maxH = hu - lw;
          }
        } else {
          const midX = (hiMinX + hiMaxX + loMinX + loMaxX) / 4.0;
          maxH = Math.abs(lineAt(hi.x1, hi.y1, hi.x2, hi.y2, midX) - lineAt(lo.x1, lo.y1, lo.x2, lo.y2, midX));
        }

        const startX = Math.min(Math.min(hi.x1, hi.x2), Math.min(lo.x1, lo.x2));
        const endX = i;
        const upperNow = lineAt(hi.x1, hi.y1, hi.x2, hi.y2, endX);
        const lowerNow = lineAt(lo.x1, lo.y1, lo.x2, lo.y2, endX);
        const widthNow = upperNow - lowerNow;
        const upperStart = lineAt(hi.x1, hi.y1, hi.x2, hi.y2, startX);
        const lowerStart = lineAt(lo.x1, lo.y1, lo.x2, lo.y2, startX);
        const widthStart = upperStart - lowerStart;
        const convRate = gt(widthStart, 0) ? 1.0 - safeDiv(widthNow, widthStart, 1.0) : 0.0;
        const notInv = gt(widthNow, 0);
        const isConv = ge(convRate, cfg.convergenceMin);
        const widthOk = ge(widthNow, atr * cfg.minChannelWidthAtr) && lt(widthNow, atr * MAX_WIDTH_MULT);
        const prevClose = i > 0 ? bars[i - 1].close : NaN;
        const isInside = notInv && le(prevClose, upperNow) && ge(prevClose, lowerNow);

        const patStartIdx = Math.trunc(startX);
        const patBars = Math.max(i - patStartIdx, 1);
        const safPatBars = Math.min(patBars, i);
        const preBars = Math.min(safPatBars, patStartIdx);
        const volInPat = hasVolume && safPatBars > 0
          ? safeDiv(cumVol[i] - nz(cumAt(i, safPatBars), 0.0), safPatBars, volSma[i]) : volSma[i];
        const volPrePat = hasVolume && preBars > 0
          ? safeDiv(nz(cumAt(i, safPatBars), 0.0) - nz(cumAt(i, safPatBars + preBars), 0.0), preBars, volSma[i])
          : volSma[i];
        const volContRatio = safeDiv(volInPat, volPrePat, 1.0);
        const volContOk = cfg.volContraction ? (!hasVolume || lt(volContRatio, VOL_CONTR_THRESH)) : true;

        if (notInv && isConv && widthOk && isInside && volContOk) {
          if (showLastOnly) {
            for (const ln of histLines) line.delete(ln);
            histLines.length = 0;
            for (const fl of histFills) linefill.delete(fl);
            histFills.length = 0;
            for (const lb of histLabels) label.delete(lb);
            histLabels.length = 0;
            hasTradeDrawings = false;
          }
          channelActive = true;
          hiX1 = hi.x1; hiY1 = hi.y1; hiX2 = hi.x2; hiY2 = hi.y2;
          loX1 = lo.x1; loY1 = lo.y1; loX2 = lo.x2; loY2 = lo.y2;
          chHiTouches = hi.touches;
          chLoTouches = lo.touches;
          chConvergence = convRate;
          chMaxWidth = maxH;
          chDetectBar = i;
          breakoutDir = 0;
          breakStrength = DASH;
          volContraction = volContRatio;
          channelJustDetected = true;
          totalPatterns += 1;
          lastTradeResult = DASH;
        }
      }
    }

    // Trim the history arrays
    while (histLines.length > MAX_HIST_LINES) line.delete(histLines.shift()!);
    while (histFills.length > MAX_HIST_FILLS) linefill.delete(histFills.shift()!);
    while (histLabels.length > MAX_HIST_LABELS) label.delete(histLabels.shift()!);

    // Draw / extend the active channel
    if (channelActive && cfg.showPatterns) {
      const hiProjNow = lineAt(hiX1, hiY1, hiX2, hiY2, i);
      const loProjNow = lineAt(loX1, loY1, loX2, loY2, i);
      if (channelJustDetected) {
        const drawStart = Math.trunc(Math.min(Math.min(hiX1, hiX2), Math.min(loX1, loX2)));
        const hiStartY = lineAt(hiX1, hiY1, hiX2, hiY2, drawStart);
        const loStartY = lineAt(loX1, loY1, loX2, loY2, drawStart);
        if (showLastOnly) {
          if (chHiLine.value) line.delete(chHiLine.value);
          if (chLoLine.value) line.delete(chLoLine.value);
          if (chFill.value) linefill.delete(chFill.value);
        }
        chHiLine.value = line.new(drawStart, hiStartY, i, hiProjNow, 'bar_index', 'none', CHANNEL_LINE_COLOR, 'solid', cfg.lineWidth);
        chLoLine.value = line.new(drawStart, loStartY, i, loProjNow, 'bar_index', 'none', CHANNEL_LINE_COLOR, 'solid', cfg.lineWidth);
        chFill.value = linefill.new(chHiLine.value, chLoLine.value, CHANNEL_FILL_COLOR);
        histLines.push(chHiLine.value, chLoLine.value);
        histFills.push(chFill.value);
      } else {
        if (chHiLine.value) {
          line.set_x2(chHiLine.value, i);
          line.set_y2(chHiLine.value, hiProjNow);
        }
        if (chLoLine.value) {
          line.set_x2(chLoLine.value, i);
          line.set_y2(chLoLine.value, loProjNow);
        }
      }
    }

    // Breakout detection and strength
    let rawBullBreak = false;
    let rawBearBreak = false;
    let strengthScore = 0.0;
    let breakBoundary = 0.0;
    let oppBoundary = 0.0;
    const channelMature = channelActive && breakoutDir === 0;
    const confirmed = i < n - 1 || lastConfirmed;
    if (channelMature && confirmed && isWarmedUp) {
      const upper = lineAt(hiX1, hiY1, hiX2, hiY2, i);
      const lower = lineAt(loX1, loY1, loX2, loY2, i);
      const bodyLen = Math.abs(b.close - b.open);
      const candleLen = b.high - b.low;
      const bodyRatio = gt(candleLen, 0) ? bodyLen / candleLen : 0.0;
      const bodyMid = (b.open + b.close) / 2.0;
      const volOk = hasVolume ? gt(b.volume ?? NaN, volSma[i] * cfg.volConfirm) : true;
      const momOk = cfg.momentumFilter ? (gt(b.close, upper) ? gt(rsiVal[i], 50) : lt(rsiVal[i], 50)) : true;
      const score = (penetration: number, bodyCommit: number) => (penetration * 0.25 + bodyRatio * 0.15
        + bodyCommit * 0.15 + (volOk ? 1.0 : 0.4) * 0.25 + (momOk ? 1.0 : 0.4) * 0.20) * 100;
      if (gt(b.close, upper)) {
        rawBullBreak = true;
        breakBoundary = upper;
        oppBoundary = lower;
        const penetration = gt(atr, 0) ? Math.min((b.close - upper) / atr, 2.0) / 2.0 : 0.5;
        strengthScore = score(penetration, gt(bodyMid, upper) ? 1.0 : 0.3);
      }
      if (lt(b.close, lower)) {
        rawBearBreak = true;
        breakBoundary = lower;
        oppBoundary = upper;
        const penetration = gt(atr, 0) ? Math.min((lower - b.close) / atr, 2.0) / 2.0 : 0.5;
        strengthScore = score(penetration, lt(bodyMid, lower) ? 1.0 : 0.3);
      }
    }

    // Directional scoring
    if (channelActive && breakoutDir === 0) {
      const upperNow = lineAt(hiX1, hiY1, hiX2, hiY2, i);
      const lowerNow = lineAt(loX1, loY1, loX2, loY2, i);
      const upperPrev = lineAt(hiX1, hiY1, hiX2, hiY2, i - 1);
      const lowerPrev = lineAt(loX1, loY1, loX2, loY2, i - 1);
      const midSlope = ((upperNow + lowerNow) - (upperPrev + lowerPrev)) / 2.0;
      const slopeBias = gt(midSlope, 0) ? Math.min(midSlope / (atr * 0.01), 1.0) : Math.max(midSlope / (atr * 0.01), -1.0);
      const rsiBias = (rsiVal[i] - 50.0) / 50.0;
      const chRange = upperNow - lowerNow;
      const posInCh = gt(chRange, 0) ? (b.close - lowerNow) / chRange : 0.5;
      const posBias = (posInCh - 0.5) * 2.0;
      const combined = slopeBias * 0.35 + rsiBias * 0.35 + posBias * 0.30;
      dirScore = Math.max(0.0, Math.min(100.0, 50.0 + combined * 50.0));
    }
    if (!channelActive) dirScore = 50.0;

    // Signal processing and targets
    const confirmedBullBreak = rawBullBreak;
    const confirmedBearBreak = rawBearBreak;
    const strengthOf = () => (ge(strengthScore, 65) ? 'Strong' : ge(strengthScore, 35) ? 'Medium' : 'Weak');
    const colourChannel = (c: string, bg: string) => {
      if (chHiLine.value) {
        line.set_color(chHiLine.value, String(color.new(c, 40)));
        line.set_width(chHiLine.value, cfg.lineWidth);
      }
      if (chLoLine.value) {
        line.set_color(chLoLine.value, String(color.new(c, 40)));
        line.set_width(chLoLine.value, cfg.lineWidth);
      }
      if (chFill.value) linefill.set_color(chFill.value, cfg.showFill ? bg : String(color.new(c, 100)));
    };
    const openTrade = (dir: number) => {
      breakoutDir = dir;
      breakoutBar = i;
      entryPrice = b.close;
      slPrice = oppBoundary - dir * atr * cfg.slPadding;
      slPriceOrig = slPrice;
      const targetPrice = breakBoundary + dir * chMaxWidth;
      const fullMove = Math.abs(dir === 1 ? targetPrice - entryPrice : entryPrice - targetPrice);
      tp1Price = entryPrice + dir * fullMove / 3.0;
      tp2Price = entryPrice + dir * fullMove * 2.0 / 3.0;
      tp3Price = entryPrice + dir * fullMove;
      tp1Hit = false;
      tp2Hit = false;
      tp3Hit = false;
      slHit = false;
      beExit = false;
      tradeOpen = true;
      breakStrength = strengthOf();
      lastSignalBar = i;
    };
    if (confirmedBullBreak) {
      openTrade(1);
      bullBreaks += 1;
      lastSignalType = 'Bull Break';
      colourChannel(cfg.bullColor, BULL_BG);
    }
    if (confirmedBearBreak) {
      openTrade(-1);
      bearBreaks += 1;
      lastSignalType = 'Bear Break';
      colourChannel(cfg.bearColor, BEAR_BG);
    }

    // Channel timeout
    if (channelActive && breakoutDir === 0 && i - chDetectBar > maxCh) channelActive = false;

    // TP / SL / BE hits
    if (tradeOpen && breakoutDir !== 0 && !slHit && !beExit && i > breakoutBar) {
      const long = breakoutDir === 1;
      const tpSide = long ? ge(b.high, tp1Price) : le(b.low, tp1Price);
      const tp2Side = long ? ge(b.high, tp2Price) : le(b.low, tp2Price);
      const tp3Side = long ? ge(b.high, tp3Price) : le(b.low, tp3Price);
      const slSide = long ? le(b.low, slPrice) : ge(b.high, slPrice);
      if (slSide) {
        if (tp1Hit) {
          beExit = true;
          lastTradeResult = 'BE Exit';
          if (lbEntry.value) {
            label.set_text(lbEntry.value, `ENTRY ${fmt(entryPrice)} — BE EXIT`);
            label.set_color(lbEntry.value, String(color.new(TP_HIT_COLOR, 60)));
          }
        } else {
          slHit = true;
          lossCount += 1;
          lastTradeResult = 'SL Hit';
        }
      } else {
        if (tpSide && !tp1Hit) {
          tp1Hit = true;
          winCount += 1;
          slPrice = entryPrice;
          if (lbEntry.value) label.set_text(lbEntry.value, `ENTRY ${fmt(entryPrice)} (SL → BE)`);
          if (lbSL.value) {
            const slPctUpd = pct(Math.abs(slPriceOrig - entryPrice) / entryPrice * 100);
            label.set_text(lbSL.value, `SL orig ${fmt(slPriceOrig)} (−${slPctUpd})`);
            label.set_color(lbSL.value, String(color.new(SL_COLOR, 75)));
          }
        }
        if (tp2Side && !tp2Hit) tp2Hit = true;
        if (tp3Side && !tp3Hit) {
          tp3Hit = true;
          lastTradeResult = 'TP3 ✓';
        }
      }
    }

    // Trade timeout (not on the bar where the trade already closed)
    const tradeTimedOut = tradeOpen && breakoutDir !== 0 && !(tp3Hit || slHit || beExit)
      && i - breakoutBar > maxCh * TRADE_TIMEOUT_MULT;
    if (tradeTimedOut) {
      timeoutCount += 1;
      lastTradeResult = tp1Hit ? 'Timeout (TP1 ✓)' : 'Timeout';
      // alert(formatEventMsg("trade_timeout", "⌛"), alert.freq_once_per_bar_close)
      pushAlert(b.time, formatEventMsg('trade_timeout', '⌛', b.close));
    }

    // Close the trade
    if (tradeOpen && (tp3Hit || slHit || beExit || tradeTimedOut)) {
      tradeOpen = false;
      channelActive = false;
      breakoutDir = 0;
      if (!showLastOnly && hasTradeDrawings) {
        if (lineEntry.value) histLines.push(lineEntry.value, lineSL.value!, lineTP1.value!, lineTP2.value!, lineTP3.value!);
        if (lbEntry.value) histLabels.push(lbEntry.value, lbSL.value!, lbTP1.value!, lbTP2.value!, lbTP3.value!);
      }
      hasTradeDrawings = false;
    }

    // Trade level lines and labels
    const anyBreak = confirmedBullBreak || confirmedBearBreak;
    if (anyBreak && cfg.showLevels) {
      if (showLastOnly) deleteTradeDrawings();
      const lineEnd = i + cfg.labelOffset;
      const labelPos = i + cfg.labelOffset + 2;
      lineEntry.value = line.new(i, entryPrice, lineEnd, entryPrice, 'bar_index', 'none', ENTRY_COLOR, 'solid', 2);
      lineSL.value = line.new(i, slPrice, lineEnd, slPrice, 'bar_index', 'none', SL_COLOR, 'solid', 2);
      lineTP1.value = line.new(i, tp1Price, lineEnd, tp1Price, 'bar_index', 'none', TP_COLOR, 'dashed', 1);
      lineTP2.value = line.new(i, tp2Price, lineEnd, tp2Price, 'bar_index', 'none', TP_COLOR, 'dashed', 1);
      lineTP3.value = line.new(i, tp3Price, lineEnd, tp3Price, 'bar_index', 'none', TP_COLOR, 'dashed', 2);
      const pctOf = (p: number) => pct(Math.abs(p - entryPrice) / entryPrice * 100);
      const lev = (y: number, text: string, c: string) => label.new(labelPos, y, text, 'bar_index', 'price',
        String(color.new(c, 60)), 'label_left', TEXT_BRIGHT, 'small');
      lbEntry.value = lev(entryPrice, `ENTRY ${fmt(entryPrice)}`, ENTRY_COLOR);
      lbSL.value = lev(slPrice, `SL ${fmt(slPrice)} (−${pctOf(slPrice)})`, SL_COLOR);
      lbTP1.value = lev(tp1Price, `TP1 ${fmt(tp1Price)} (+${pctOf(tp1Price)})`, TP_COLOR);
      lbTP2.value = lev(tp2Price, `TP2 ${fmt(tp2Price)} (+${pctOf(tp2Price)})`, TP_COLOR);
      lbTP3.value = lev(tp3Price, `TP3 ${fmt(tp3Price)} (+${pctOf(tp3Price)})`, TP_COLOR);
      hasTradeDrawings = true;
      if (showLastOnly) {
        histLines.push(lineEntry.value, lineSL.value, lineTP1.value, lineTP2.value, lineTP3.value);
        histLabels.push(lbEntry.value, lbSL.value, lbTP1.value, lbTP2.value, lbTP3.value);
      }
    }

    // Extend the lines and move the labels while the trade is open
    if (cfg.showLevels && hasTradeDrawings && !anyBreak && tradeOpen) {
      const newLineEnd = i + cfg.labelOffset;
      const newLabelPos = i + cfg.labelOffset + 2;
      for (const l of [lineEntry, lineSL, lineTP1, lineTP2, lineTP3]) if (l.value) line.set_x2(l.value, newLineEnd);
      for (const l of [lbEntry, lbSL, lbTP1, lbTP2, lbTP3]) if (l.value) label.set_x(l.value, newLabelPos);
    }

    // Colour the reached targets and mark their labels
    const tpUpdate = (hit: boolean, prev: boolean, ln: Line | undefined, lb: Label | undefined, name: string, price: number) => {
      if (!cfg.showLevels || !ln || !hit) return;
      line.set_color(ln, TP_HIT_COLOR);
      line.set_style(ln, 'solid');
      if (lb && !prev) {
        label.set_text(lb, `${name} ✓ ${fmt(price)} (+${pct(Math.abs(price - entryPrice) / entryPrice * 100)})`);
        label.set_color(lb, String(color.new(TP_HIT_COLOR, 60)));
      }
    };
    tpUpdate(tp1Hit, prevTp1, lineTP1.value, lbTP1.value, 'TP1', tp1Price);
    tpUpdate(tp2Hit, prevTp2, lineTP2.value, lbTP2.value, 'TP2', tp2Price);
    tpUpdate(tp3Hit, prevTp3, lineTP3.value, lbTP3.value, 'TP3', tp3Price);
    if (cfg.showLevels && lbSL.value && slHit && !prevSl) {
      const slPctUpd = pct(Math.abs(slPriceOrig - entryPrice) / entryPrice * 100);
      label.set_text(lbSL.value, `SL ✗ ${fmt(slPriceOrig)} (−${slPctUpd})`);
    }

    // Alerts at the end of the bar: breakouts, new pattern, and the hits of this bar (`x and not x[1]`)
    if (confirmedBullBreak) {
      pushAlert(b.time, formatAlertMsg('buy', '🟢', breakStrength, b.close, slPrice, tp1Price, tp2Price, tp3Price));
    }
    if (confirmedBearBreak) {
      pushAlert(b.time, formatAlertMsg('sell', '🔴', breakStrength, b.close, slPrice, tp1Price, tp2Price, tp3Price));
    }
    if (channelJustDetected) {
      const priceStr = fmt(b.close);
      const jsonMsg = '{"action":"pattern","ticker":"' + tickerStr + '","price":' + priceStr + ',"tf":"' + tfPeriod + '"}';
      const textMsg = '🟡 PATTERN DETECTED | ' + tickerStr + ' | TF: ' + tfPeriod + ' | Price: ' + priceStr;
      pushAlert(b.time, cfg.webhook ? jsonMsg : textMsg);
    }
    if (tp1Hit && !prevTp1) pushAlert(b.time, formatEventMsg('tp1_hit', '🎯', b.close));
    if (tp2Hit && !prevTp2) pushAlert(b.time, formatEventMsg('tp2_hit', '🎯', b.close));
    if (tp3Hit && !prevTp3) pushAlert(b.time, formatEventMsg('tp3_hit', '🏆', b.close));
    if (slHit && !prevSl) pushAlert(b.time, formatEventMsg('sl_hit', '🛑', b.close));
    if (beExit && !prevBe) pushAlert(b.time, formatEventMsg('be_exit', '⚖️', b.close));

    prevTp1 = tp1Hit;
    prevTp2 = tp2Hit;
    prevTp3 = tp3Hit;
    prevSl = slHit;
    prevBe = beExit;

    // Signal labels
    if (cfg.showSignals && confirmedBullBreak) {
      histLabels.push(label.new(i, b.low, 'Long', 'bar_index', 'price', cfg.bullColor, 'label_up', white, lblSize,
        undefined, `Bull Breakout [${breakStrength}]`));
    }
    if (cfg.showSignals && confirmedBearBreak) {
      histLabels.push(label.new(i, b.high, 'Short', 'bar_index', 'price', cfg.bearColor, 'label_down', white, lblSize,
        undefined, `Bear Breakout [${breakStrength}]`));
    }

    // bgcolor(showBgInput and channelActive and breakoutDir == 0 ? color.new(lineColorInput, 90) : na)
    if (cfg.showBg && channelActive && breakoutDir === 0) {
      bgColors.push({ time: b.time, color: String(color.new(cfg.lineColor, BG_TRANSPARENCY)) });
    }

    // Dashboard
    if (cfg.showDash && i === n - 1) {
      if (!dashTable.value) {
        dashTable.value = table.new(dashPos, 2, 14, TABLE_BG, TABLE_BORDER, 1, TABLE_BORDER, 1);
      }
      const t = dashTable.value;
      const row = (r: number, name: string, value: string, valueColor: string, bg?: string) => {
        table.cell(t, 0, r, name, 0, 0, TEXT_MUTED, 'left', undefined, dashSize, bg);
        table.cell(t, 1, r, value, 0, 0, valueColor, 'right', undefined, dashSize, bg);
      };
      table.cell(t, 0, 0, 'WillyAlgoTrader', 0, 0, white, 'center', undefined, 'small', HEADER_BG);
      table.merge_cells(t, 0, 0, 1, 0);

      const patternStr = channelActive ? (breakoutDir === 0 ? 'Active' : breakoutDir === 1 ? 'Bull Break' : 'Bear Break')
        : tradeOpen ? (breakoutDir === 1 ? 'Bull Trade' : 'Bear Trade') : 'Scanning';
      const patternColor = channelActive ? (breakoutDir === 0 ? TEXT_COLOR : breakoutDir === 1 ? DASH_GREEN : DASH_RED)
        : tradeOpen ? (breakoutDir === 1 ? DASH_GREEN : DASH_RED) : TEXT_MUTED;
      row(1, 'Pattern', patternStr, patternColor);

      const strengthColor = breakStrength === 'Strong' ? DASH_GREEN : breakStrength === 'Medium' ? TEXT_COLOR
        : breakStrength === 'Weak' ? DASH_RED : TEXT_MUTED;
      const strengthDisp = breakStrength !== DASH ? breakStrength : DASH;
      row(2, 'Strength', strengthDisp, strengthDisp !== DASH ? strengthColor : TEXT_MUTED);

      const tradeStr = tradeOpen ? (tp2Hit ? 'TP2 ✓' : tp1Hit ? 'TP1 ✓ (BE)' : 'Active')
        : lastTradeResult !== DASH ? lastTradeResult : 'No Trade';
      const tradeCol = tradeOpen ? (tp1Hit ? DASH_GREEN : TEXT_COLOR) : lastTradeResult === 'TP3 ✓' ? DASH_CYAN
        : lastTradeResult === 'SL Hit' ? DASH_RED : lastTradeResult === 'BE Exit' ? DASH_CYAN
          : str.contains(lastTradeResult, 'Timeout') ? TEXT_COLOR : TEXT_MUTED;
      row(3, 'Trade', tradeStr, tradeCol);

      const waiting = channelActive && breakoutDir === 0;
      const scoreStr = waiting ? `${str.tostring(dirScore, '#.0')}%` : DASH;
      const scoreColor = gt(dirScore, 60) ? DASH_GREEN : lt(dirScore, 40) ? DASH_RED : TEXT_COLOR;
      row(4, 'Bull Prob', scoreStr, waiting ? scoreColor : TEXT_MUTED);

      const rrRatio = tradeOpen ? safeDiv(Math.abs(tp1Price - entryPrice), Math.abs(slPriceOrig - entryPrice), 0.0) : 0.0;
      const rrStr = gt(rrRatio, 0) ? `1:${str.tostring(rrRatio, '#.##')}` : DASH;
      const rrColor = ge(rrRatio, 2.0) ? DASH_GREEN : ge(rrRatio, 1.0) ? TEXT_COLOR : gt(rrRatio, 0) ? DASH_RED : TEXT_MUTED;
      row(5, 'R:R (TP1)', rrStr, rrColor);

      const touchStr = channelActive ? `${str.tostring(chHiTouches)}H / ${str.tostring(chLoTouches)}L` : DASH;
      row(6, 'Touches', touchStr, channelActive ? TEXT_COLOR : TEXT_MUTED);

      const volCStr = channelActive ? `${str.tostring(volContraction * 100, '#.0')}%` : DASH;
      const volCColor = lt(volContraction, 0.7) ? DASH_GREEN : lt(volContraction, VOL_CONTR_THRESH) ? TEXT_COLOR : DASH_RED;
      row(7, 'Vol Contr', channelActive ? volCStr : DASH, channelActive ? volCColor : TEXT_MUTED);

      const convStr = channelActive ? `${str.tostring(chConvergence * 100, '#.0')}%` : DASH;
      row(8, 'Converge', convStr, channelActive ? TEXT_COLOR : TEXT_MUTED);

      row(9, 'Patterns', str.tostring(totalPatterns), TEXT_COLOR);
      row(10, 'Breaks', `${str.tostring(bullBreaks)}▲ ${str.tostring(bearBreaks)}▼`, TEXT_COLOR);

      const totalClosed = winCount + lossCount;
      const winRate = safeDiv(winCount, totalClosed, 0.0);
      const wrStr = totalClosed > 0 ? `${str.tostring(winRate * 100, '#.0')}%` : DASH;
      const wrDisp = wrStr + (timeoutCount > 0 ? ` (${str.tostring(timeoutCount)} t/o)` : '');
      const wrColor = totalClosed > 0 ? (ge(winRate, 0.5) ? DASH_GREEN : DASH_RED) : TEXT_MUTED;
      row(11, 'Win Rate', wrDisp, wrColor);

      const sigAgoStr = lastSignalBar > 0 ? `${str.tostring(i - lastSignalBar)} bars` : DASH;
      const sigDisplay = lastSignalType !== DASH ? `${lastSignalType} (${sigAgoStr})` : DASH;
      const sigColor = lastSignalType === 'Bull Break' ? DASH_GREEN : lastSignalType === 'Bear Break' ? DASH_RED : TEXT_MUTED;
      row(12, 'Last Sig', sigDisplay, sigColor);

      table.cell(t, 0, 13, tfPeriod, 0, 0, TEXT_MUTED, 'left', undefined, dashSize, TABLE_ROW_ALT);
      table.cell(t, 1, 13, INDICATOR_VERSION, 0, 0, TEXT_MUTED, 'right', undefined, dashSize, TABLE_ROW_ALT);
    }

    // Watermark
    if (i === n - 1 && cfg.showWatermark) {
      const clear = String(color.new(color.black, 100));
      if (!wmTable.value) wmTable.value = table.new('bottom_center', 1, 1, clear, clear, 0, clear, 0);
      table.cell(wmTable.value, 0, 0, 'WillyAlgoTrader', 0, 0, WM_COLOR, 'center', undefined, 'normal', clear);
    }
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    bgColors,
    lines: out.lines ?? [],
    labels: out.labels ?? [],
    linefills: out.linefills ?? [],
    tables: out.tables ?? [],
    alertCalls,
  };
}

export const BreakoutPatternSetup = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
