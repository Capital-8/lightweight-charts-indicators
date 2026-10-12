/**
 * Smart Breakout Targets [WillyAlgoTrader]
 *
 * Volatility squeeze ranges and their breakouts, with a simple trade model.
 * - Squeeze: the Bollinger Band width (length "Squeeze Detection Length", multiplier "BB Multiplier") below
 *   "Squeeze Threshold" times its average AND the ATR (length max(length / 2, 7)) below "ATR Compression Ratio"
 *   times its average, after a warm-up of max(length, 50) bars. The high and the low of the squeeze bars are kept.
 * - Range: when a squeeze of at least "Min Squeeze Bars" bars ends (on a closed bar), a range box is drawn from the
 *   first squeeze bar to the current bar between that high and low (capped at 3 ATR around its centre), with a red
 *   zone (half an ATR) at its top, a green zone at its bottom and a dashed centre line. With "Prevent Overlap" a
 *   range whose prices overlap a tracked range is skipped. At most 50 ranges are tracked (the oldest is deleted).
 * - Breakout: the first close beyond a tracked range decides. With an impulse candle (body above "Impulse Body
 *   Threshold" x ATR, in the direction of the break) and the optional volume and higher-timeframe filters, it is a
 *   Long / Short signal: entry at the close, stop beyond the other side of the range (plus "SL ATR Buffer" x ATR),
 *   three targets at multiples of the risk, drawn as lines and labels that follow the bars, with two fills. Without
 *   an impulse the range is only consumed. A new signal closes an open trade early ("Exit" label).
 * - Trade close: the stop is checked first on each closed bar, then TP1, TP2 (marked once) and TP3 (closes the
 *   trade): "SL" / "TP3" labels. The dashboard (last bar) shows the trend, the higher-timeframe bias, the last
 *   signal and its strength (0-4), the squeeze state, the open trade or the last result and the statistics; a
 *   watermark table is drawn at the bottom.
 *
 * Higher timeframe ("Higher Timeframe", default D): the simple average of the close (length "HTF MA Length") and
 * the close of the previous completed bar of that timeframe, on every chart bar of its period (no repainting). It is
 * used by the optional filter and, always, by the signal strength. The bars of that timeframe are built from the
 * chart bars (periods from the UTC calendar and the bars, or the exchange calendar of the chart context, see
 * src/anchor-period.ts), so its average starts at the first chart bar. A timeframe below the chart timeframe needs
 * data that the bars do not carry: the port throws an Error.
 *
 * Chart context (optional third argument):
 * - `chart.mintick`: the tick of the "mintick" texts (labels, tooltips, dashboard). Without it 0.01.
 * - `chart.backgroundColor`: theme "Auto" is dark when the red channel of the chart background is below 128.
 *   Without it the dark theme.
 * - `chart.lastBarConfirmed`: when the last bar is still open, no range, breakout or trade close is made on it.
 *   Without it every bar is taken as closed.
 * - `chart.timeframe`: the chart timeframe of the dashboard and of the higher timeframe; else read from the bars.
 *   `timezone` / `session`: the periods of the higher timeframe follow the exchange calendar.
 *
 * Limit of the port: the alerts (6 alert() calls, text or JSON messages) give no output.
 *
 * Reference: "Smart Breakout Targets [WillyAlgoTrader]" by WillyAlgoTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, math, str, color, timeframe, Series, mapToChart, box, line, label, linefill, table, resetDrawings, setDrawingBar,
  varDrawing, drawingOutputs,
  type Box, type Label, type Line, type Linefill, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData, BoxData, LabelData, LineDrawingData, LinefillData, TableData, TablePosition } from '../types';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import { backgroundColorOf, lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';

type SizeName = 'Auto' | 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';

export interface SmartBreakoutTargetsInputs {
  squeezeLengthInput: number;
  bbMultInput: number;
  squeezeThreshInput: number;
  atrCompressInput: number;
  minSqueezeInput: number;
  impulseMultInput: number;
  preventOverlapInput: boolean;
  showTargetsInput: boolean;
  slBufferInput: number;
  tp1RRInput: number;
  tp2RRInput: number;
  tp3RRInput: number;
  useVolFilterInput: boolean;
  volMultInput: number;
  useHtfInput: boolean;
  htfInput: string;
  htfMaLenInput: number;
  showBoxesInput: boolean;
  showSignalsInput: boolean;
  showCenterInput: boolean;
  showBgInput: boolean;
  showCloseLabelsInput: boolean;
  signalSizeInput: SizeName;
  targetSizeInput: SizeName;
  closeSizeInput: SizeName;
  showWatermarkInput: boolean;
  themeInput: 'Auto' | 'Dark' | 'Light';
  showDashInput: boolean;
  dashPosStr: 'Top Left' | 'Top Right' | 'Bottom Left' | 'Bottom Right' | 'Middle Right';
  dashFontSizeInput: 'Small' | 'Normal' | 'Large' | 'Huge';
  showMarketSecInput: boolean;
  showTradeSecInput: boolean;
  showStatsSecInput: boolean;
  webhookInput: boolean;
  bullColorInput: string;
  bearColorInput: string;
  neutralColorInput: string;
}

export const defaultInputs: SmartBreakoutTargetsInputs = {
  squeezeLengthInput: 20,
  bbMultInput: 2.0,
  squeezeThreshInput: 0.6,
  atrCompressInput: 0.75,
  minSqueezeInput: 5,
  impulseMultInput: 0.8,
  preventOverlapInput: true,
  showTargetsInput: true,
  slBufferInput: 0.5,
  tp1RRInput: 1.0,
  tp2RRInput: 2.0,
  tp3RRInput: 3.0,
  useVolFilterInput: false,
  volMultInput: 1.5,
  useHtfInput: false,
  htfInput: 'D',
  htfMaLenInput: 50,
  showBoxesInput: true,
  showSignalsInput: true,
  showCenterInput: true,
  showBgInput: false,
  showCloseLabelsInput: true,
  signalSizeInput: 'Small',
  targetSizeInput: 'Small',
  closeSizeInput: 'Small',
  showWatermarkInput: true,
  themeInput: 'Auto',
  showDashInput: true,
  dashPosStr: 'Top Right',
  dashFontSizeInput: 'Small',
  showMarketSecInput: true,
  showTradeSecInput: true,
  showStatsSecInput: true,
  webhookInput: false,
  bullColorInput: '#00E676',
  bearColorInput: '#FF5252',
  neutralColorInput: '#FFEB3B',
};

const GRP_MAIN = '⚙️ Main Settings';
const GRP_TARGETS = '🎯 Targets';
const GRP_FILTER = '🔍 Filters';
const GRP_VISUAL = '🎨 Visual Settings';
const GRP_DASH = '📊 Dashboard';
const GRP_ALERT = '🔔 Alerts';
const GRP_COLORS = '🎨 Colors';
const SIZES = ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge'];

export const inputConfig: InputConfig[] = [
  { id: 'squeezeLengthInput', type: 'int', title: 'Squeeze Detection Length', defval: 20, min: 10, max: 100, group: GRP_MAIN,
    tooltip: 'Lookback period for Bollinger Band Width and ATR compression detection.\n• Higher = detects longer consolidations, fewer signals\n• Lower = catches short squeezes, more signals\n• Recommended: 15–30' },
  { id: 'bbMultInput', type: 'float', title: 'BB Multiplier', defval: 2.0, min: 1.0, max: 4.0, step: 0.1, group: GRP_MAIN,
    tooltip: 'Bollinger Band standard deviation multiplier.\n• Higher = wider bands, stricter squeeze detection\n• Lower = tighter bands, more squeezes detected\n• Recommended: 1.5–2.5' },
  { id: 'squeezeThreshInput', type: 'float', title: 'Squeeze Threshold', defval: 0.6, min: 0.1, max: 1.0, step: 0.05, group: GRP_MAIN,
    tooltip: 'BB Width percentile threshold for squeeze detection.\nWhen BB Width falls below this fraction of its SMA, a squeeze is active.\n• Lower = stricter, catches only tight squeezes\n• Higher = looser, more ranges detected\n• Recommended: 0.4–0.7' },
  { id: 'atrCompressInput', type: 'float', title: 'ATR Compression Ratio', defval: 0.75, min: 0.3, max: 1.0, step: 0.05, group: GRP_MAIN,
    tooltip: 'ATR must be below this fraction of its SMA for squeeze confirmation.\nDual-engine: both BB squeeze AND ATR compression must agree.\n• Lower = stricter compression filter\n• Higher = allows moderate volatility squeezes\n• Recommended: 0.6–0.85' },
  { id: 'minSqueezeInput', type: 'int', title: 'Min Squeeze Bars', defval: 5, min: 2, max: 50, group: GRP_MAIN,
    tooltip: 'Minimum consecutive bars in squeeze to form a valid range.\nFilters out momentary dips in volatility.\n• Higher = only well-established ranges\n• Lower = catches quick consolidations\n• Recommended: 4–10' },
  { id: 'impulseMultInput', type: 'float', title: 'Impulse Body Threshold', defval: 0.8, min: 0.2, max: 3.0, step: 0.1, group: GRP_MAIN,
    tooltip: 'Breakout candle body must exceed ATR × this multiplier.\nConfirms the breakout has genuine momentum.\nNOTE: a close beyond a range boundary WITHOUT impulse consumes the range silently — a breakout must be fresh.\n• Higher = stricter, fewer but stronger breakouts\n• Lower = more breakouts, includes weaker ones\n• Recommended: 0.5–1.2' },
  { id: 'preventOverlapInput', type: 'bool', title: 'Prevent Overlap', defval: true, group: GRP_MAIN,
    tooltip: 'If enabled, a new range box is skipped when its PRICE span intersects an existing (unbroken) range box.\nKeeps the chart clean and avoids duplicate signals from nested ranges.' },
  { id: 'showTargetsInput', type: 'bool', title: 'Show Entry/SL/TP Levels', defval: true, group: GRP_TARGETS,
    tooltip: 'Toggle visibility of entry, stop loss, and take profit levels after breakout.' },
  { id: 'slBufferInput', type: 'float', title: 'SL ATR Buffer', defval: 0.5, min: 0.0, max: 3.0, step: 0.1, group: GRP_TARGETS,
    tooltip: 'Extra ATR-based buffer added beyond the opposite range boundary for SL.\n• Higher = wider stop, more room to breathe\n• Lower = tighter stop, better R:R but more stops\n• Recommended: 0.3–1.0' },
  { id: 'tp1RRInput', type: 'float', title: 'TP1 Risk:Reward', defval: 1.0, min: 0.1, max: 5.0, step: 0.1, group: GRP_TARGETS,
    tooltip: 'TP1 = Entry + Risk × this multiplier.\n• 1.0 = 1:1 R:R\n• Recommended: 0.75–1.5' },
  { id: 'tp2RRInput', type: 'float', title: 'TP2 Risk:Reward', defval: 2.0, min: 0.5, max: 10.0, step: 0.1, group: GRP_TARGETS,
    tooltip: 'TP2 = Entry + Risk × this multiplier.\n• 2.0 = 1:2 R:R\n• Recommended: 1.5–3.0' },
  { id: 'tp3RRInput', type: 'float', title: 'TP3 Risk:Reward', defval: 3.0, min: 1.0, max: 15.0, step: 0.1, group: GRP_TARGETS,
    tooltip: 'TP3 = Entry + Risk × this multiplier.\n• 3.0 = 1:3 R:R\n• Recommended: 2.5–5.0' },
  { id: 'useVolFilterInput', type: 'bool', title: 'Volume Breakout Filter', defval: false, group: GRP_FILTER,
    tooltip: 'Require above-average volume on breakout candle.\nDisabled by default (works on forex where volume = 0).\nEnable for stocks/crypto for cleaner signals.' },
  { id: 'volMultInput', type: 'float', title: 'Volume Surge Multiplier', defval: 1.5, min: 1.0, max: 5.0, step: 0.1, group: GRP_FILTER,
    tooltip: 'Breakout bar volume must exceed SMA(volume,20) × this multiplier.\n• Higher = stricter volume confirmation\n• Recommended: 1.2–2.0' },
  { id: 'useHtfInput', type: 'bool', title: 'HTF Trend Filter', defval: false, group: GRP_FILTER,
    tooltip: 'Only take breakouts aligned with the higher timeframe trend.\nBullish breakout = HTF uptrend, Bearish breakout = HTF downtrend.' },
  { id: 'htfInput', type: 'timeframe', title: 'Higher Timeframe', defval: 'D', group: GRP_FILTER,
    tooltip: "Timeframe for trend bias filter.\nLeave at 'D' for daily trend on intraday charts.\n• Use 4H on 15M chart, D on 1H chart, W on D chart" },
  { id: 'htfMaLenInput', type: 'int', title: 'HTF MA Length', defval: 50, min: 10, max: 200, group: GRP_FILTER,
    tooltip: 'Moving average length on the HTF for trend determination.\n• Recommended: 50 (standard)' },
  { id: 'showBoxesInput', type: 'bool', title: 'Show Range Boxes', defval: true, group: GRP_VISUAL,
    tooltip: 'Show consolidation range boxes on chart.' },
  { id: 'showSignalsInput', type: 'bool', title: 'Show Breakout Signals', defval: true, group: GRP_VISUAL,
    tooltip: 'Show breakout arrow labels.' },
  { id: 'showCenterInput', type: 'bool', title: 'Show Range Centerline', defval: true, group: GRP_VISUAL,
    tooltip: 'Show dashed centerline inside range boxes.' },
  { id: 'showBgInput', type: 'bool', title: 'Show Squeeze Background', defval: false, group: GRP_VISUAL,
    tooltip: 'Highlight background when squeeze is active.' },
  { id: 'showCloseLabelsInput', type: 'bool', title: 'Show Close Labels', defval: true, group: GRP_VISUAL,
    tooltip: 'Show ✔/✘/◼ labels when trade closes at TP3, SL, or by a new signal.' },
  { id: 'signalSizeInput', type: 'string', title: 'Signal Label Size', defval: 'Small', options: SIZES, group: GRP_VISUAL,
    tooltip: 'Size of Long/Short breakout labels on chart.\n• Small: compact, good for lower TFs with many signals\n• Normal: balanced visibility\n• Large: easy to spot on higher TFs' },
  { id: 'targetSizeInput', type: 'string', title: 'Target Label Size', defval: 'Small', options: SIZES, group: GRP_VISUAL,
    tooltip: 'Size of Entry/SL/TP labels on target lines.\n• Small: minimal, keeps chart clean\n• Normal: easy to read prices\n• Tiny: maximum compactness' },
  { id: 'closeSizeInput', type: 'string', title: 'Close Label Size', defval: 'Small', options: SIZES, group: GRP_VISUAL,
    tooltip: 'Size of ✔ TP3 / ✘ SL / ◼ Exit close labels.\n• Matches signal labels by default' },
  { id: 'showWatermarkInput', type: 'bool', title: 'Show Watermark', defval: true, group: GRP_VISUAL,
    tooltip: "Display 'WillyAlgoTrader - by Willy' watermark on chart." },
  { id: 'themeInput', type: 'string', title: 'Theme', defval: 'Auto', options: ['Auto', 'Dark', 'Light'], group: GRP_VISUAL,
    tooltip: 'Chart color theme.\n• Auto: detects from chart background\n• Dark: optimized for dark backgrounds\n• Light: optimized for light/white backgrounds' },
  { id: 'showDashInput', type: 'bool', title: 'Show Dashboard', defval: true, group: GRP_DASH },
  { id: 'dashPosStr', type: 'string', title: 'Dashboard Position', defval: 'Top Right',
    options: ['Top Left', 'Top Right', 'Bottom Left', 'Bottom Right', 'Middle Right'], group: GRP_DASH },
  { id: 'dashFontSizeInput', type: 'string', title: 'Dashboard Font Size', defval: 'Small', options: ['Small', 'Normal', 'Large', 'Huge'],
    group: GRP_DASH,
    tooltip: 'Font size for the dashboard table. Section dividers and the\nversion footer render one step smaller to preserve hierarchy.' },
  { id: 'showMarketSecInput', type: 'bool', title: '  ├ Market section', defval: true, group: GRP_DASH,
    tooltip: 'Trend, HTF bias, Signal, Strength, Squeeze, Timeframe.' },
  { id: 'showTradeSecInput', type: 'bool', title: '  ├ Trade section', defval: true, group: GRP_DASH,
    tooltip: 'Entry, SL, TP1-3, R:R, SL distance. Collapses to one row when flat.' },
  { id: 'showStatsSecInput', type: 'bool', title: '  └ Stats section', defval: true, group: GRP_DASH,
    tooltip: 'Trades, W/L (+Early), Win Rate (+gauge), Last P&L, recent Form.\nHonest methodology: Win Rate = TP3 wins ÷ (TP3 wins + SL losses).\nEarly closes (trade replaced by a new signal) are EXCLUDED.' },
  { id: 'webhookInput', type: 'bool', title: 'Webhook JSON Format', defval: false, group: GRP_ALERT,
    tooltip: 'Send ALL alerts (entries, TP1/TP2/TP3, SL, early close) in JSON format for webhook integrations (3Commas, Autoview, etc.)' },
  { id: 'bullColorInput', type: 'color', title: 'Bull', defval: '#00E676', inline: 'colors', group: GRP_COLORS,
    tooltip: 'Color for bullish breakouts and targets.' },
  { id: 'bearColorInput', type: 'color', title: 'Bear', defval: '#FF5252', inline: 'colors', group: GRP_COLORS,
    tooltip: 'Color for bearish breakouts and targets.' },
  { id: 'neutralColorInput', type: 'color', title: 'Neutral', defval: '#FFEB3B', inline: 'colors', group: GRP_COLORS,
    tooltip: 'Color for neutral/squeeze state.' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Smart Breakout Targets [WillyAlgoTrader]',
  shortTitle: 'Smart Breakout',
  overlay: true,
};

const INDICATOR_VERSION = 'v1.5.0';
const FORM_LEN = 10;
const MAX_TRACKED_BOXES = 50;
/** indicator(max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
const nz = (v: number, d = 0) => (Number.isFinite(v) ? v : d);

/** toSize(): the size names of the inputs */
const toSize = (s: string) => (s === 'Tiny' ? 'tiny' : s === 'Small' ? 'small' : s === 'Normal' ? 'normal'
  : s === 'Large' ? 'large' : s === 'Huge' ? 'huge' : 'auto');
/** sizeDownFromString(): one step smaller */
const sizeDown = (s: string) => (s === 'Small' ? 'tiny' : s === 'Normal' ? 'small' : s === 'Large' ? 'normal'
  : s === 'Huge' ? 'large' : 'tiny');
const POSITIONS: Record<string, TablePosition> = {
  'Top Left': 'top_left', 'Top Right': 'top_right', 'Bottom Left': 'bottom_left', 'Bottom Right': 'bottom_right',
  'Middle Right': 'middle_right',
};

/** buildGauge(value, maxVal, width) */
function buildGauge(value: number, maxVal: number, width: number): string {
  const filled = maxVal <= 0 ? 0 : (math.round(Math.min(width, Math.max(0.0, value / maxVal * width))) as number);
  let result = '';
  for (let i = 0; i <= width - 1; i++) result += i < filled ? '▰' : '▱';
  return result;
}

/**
 * request.security(syminfo.tickerid, tf, expr[1], gaps_off, lookahead_on): every chart bar of a period of `tf`
 * gets the value of the previous completed period. Returns the close and the sma of the close of that period.
 */
function higherTimeframe(bars: Bar[], tf: string, maLen: number, chart?: ChartContext): { ma: number[]; close: number[] } {
  const chartTf = chartTimeframe(bars, chart);
  const prev = (a: number[]) => a.map((_, i) => (i > 0 ? a[i - 1] : NaN));
  const smaOf = (src: Bar[]) => ta.sma(Series.fromArray(src, src.map((b) => b.close)), maLen).toArray().map((v) => v ?? NaN);
  if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) {
    return { ma: prev(smaOf(bars)), close: prev(bars.map((b) => b.close)) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the bars do not carry that data.`);
  }
  const { htf, group, latest } = higherTimeframeBars(bars, tf, chart);
  const ma = prev(smaOf(htf));
  const close = prev(htf.map((b) => b.close));
  return { ma: mapToChart(ma, group, latest, true, false), close: mapToChart(close, group, latest, true, false) };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SmartBreakoutTargetsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
  boxes: BoxData[]; lines: LineDrawingData[]; labels: LabelData[]; linefills: LinefillData[]; tables: TableData[];
  bgColors: BgColorData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const MINTICK = mintickOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const tick = (v: number) => str.tostring(v, 'mintick', MINTICK);

  // Theme detection & colours
  const isDark = cfg.themeInput === 'Dark' ? true : cfg.themeInput === 'Light' ? false
    : (color.r(backgroundColorOf(chart)) as number) < 128;
  const C = (c: string, t: number) => String(color.new(c, t));
  const TEXT_COLOR = isDark ? '#E0E0E0' : '#1A1A1A';
  const TEXT_MUTED = isDark ? C('#9E9E9E', 0) : C('#757575', 0);
  const TABLE_BG = isDark ? C('#131722', 5) : C('#FFFFFF', 5);
  const TABLE_BORDER = isDark ? C('#2A2E39', 0) : C('#D0D0D0', 0);
  const TABLE_ROW_ALT = isDark ? C('#1C2030', 0) : C('#F0F4F8', 0);
  const LINE_SUBTLE = isDark ? C('#555555', 0) : C('#AAAAAA', 0);
  const RANGE_BG = isDark ? C('#FFFFFF', 92) : C('#000000', 92);
  const WM_COLOR = isDark ? C('#FFFFFF', 80) : C('#000000', 80);
  const LABEL_TEXT = '#FFFFFF';
  const BULL_TEXT = isDark ? '#00E676' : '#00A152';
  const BEAR_TEXT = isDark ? '#FF5252' : '#D32F2F';
  const NEUTRAL_TEXT = isDark ? '#FFEB3B' : '#F57F17';
  const HEADER_TEXT = '#FFFFFF';
  const FORM_COLOR = isDark ? '#5C8AAE' : '#34495E';
  const HEADER_BG_BULL = C('#0F6E56', 0);
  const HEADER_BG_BEAR = C('#A32D2D', 0);
  const HEADER_BG_FLAT = C('#2962FF', 0);
  const GRAY = String(color.gray);
  const NA = 'transparent';
  /** the default box text colour of a version 6 script, given explicitly */
  const BOX_TEXT = '#FFFFFF';
  const bull = cfg.bullColorInput;
  const bear = cfg.bearColorInput;

  const SIGNAL_SIZE = toSize(cfg.signalSizeInput);
  const TARGET_SIZE = toSize(cfg.targetSizeInput);
  const CLOSE_SIZE = toSize(cfg.closeSizeInput);
  const dashFontSize = toSize(cfg.dashFontSizeInput);
  const dashFontSizeSub = sizeDown(cfg.dashFontSizeInput);
  const dashPos = POSITIONS[cfg.dashPosStr] ?? 'top_right';
  const chartTf = chartTimeframe(bars, chart);

  // ── Calculations ──
  const len = cfg.squeezeLengthInput;
  const WARMUP_BARS = Math.max(len, 50);
  const atrPeriod = Math.max(len / 2, 7);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);
  const rawAtrS = ta.atr(bars, atrPeriod);
  const rawAtr = A(rawAtrS);
  const atrSmaRaw = A(ta.sma(rawAtrS, len));
  const smaClose = A(ta.sma(S(close), len));
  const stdevClose = A(ta.stdev(S(close), len));
  const bbWidth: number[] = [];
  for (let i = 0; i < n; i++) {
    const basis = nz(smaClose[i], close[i]);
    const dev = nz(stdevClose[i], 0.0);
    const upper = basis + cfg.bbMultInput * dev;
    const lower = basis - cfg.bbMultInput * dev;
    // safeDiv(upper - lower, basis)
    const num = upper - lower;
    bbWidth.push(ne(basis, 0) && !isNaN(num) ? num / basis : 0.0);
  }
  const bbWidthSmaRaw = A(ta.sma(S(bbWidth), len));
  const volSmaRaw = A(ta.sma(S(volume), 20));
  const htf = higherTimeframe(bars, cfg.htfInput, cfg.htfMaLenInput, chart);

  // ── Drawings ──
  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS, box: MAX_OBJECTS });
  const rangeBoxes: Box[] = [];
  const resistBoxes: Box[] = [];
  const supportBoxes: Box[] = [];
  const centerLines: Line[] = [];
  const rangeSqzLen: number[] = [];

  const entryLine = varDrawing<Line>();
  const slLine = varDrawing<Line>();
  const tp1Line = varDrawing<Line>();
  const tp2Line = varDrawing<Line>();
  const tp3Line = varDrawing<Line>();
  const entryLbl = varDrawing<Label>();
  const slLbl = varDrawing<Label>();
  const tp1Lbl = varDrawing<Label>();
  const tp2Lbl = varDrawing<Label>();
  const tp3Lbl = varDrawing<Label>();
  const lfRisk = varDrawing<Linefill>();
  const lfReward = varDrawing<Linefill>();
  const targetLines = [entryLine, slLine, tp1Line, tp2Line, tp3Line];
  const targetLabels = [entryLbl, slLbl, tp1Lbl, tp2Lbl, tp3Lbl];
  const deleteTargets = () => {
    for (const v of targetLines) if (v.value) line.delete(v.value);
    for (const v of targetLabels) if (v.value) label.delete(v.value);
    if (lfRisk.value) linefill.delete(lfRisk.value);
    if (lfReward.value) linefill.delete(lfReward.value);
  };

  // ── State ──
  let squeezeBars = 0;
  let squeezeHigh = NaN;
  let squeezeLow = NaN;
  let squeezeStartBar = NaN;
  let prevIsSqueeze = false;
  let prevSqueezeBars = 0;
  let prevSqueezeHigh = NaN;
  let prevSqueezeLow = NaN;
  let prevSqueezeStartBar = NaN;

  let tradeDir = 0;
  let tradeActive = false;
  let lastEntry = NaN;
  let lastSL = NaN;
  let lastTP1 = NaN;
  let lastTP2 = NaN;
  let lastTP3 = NaN;
  let tp1Done = false;
  let tp2Done = false;
  let lastResult = '—';
  let lastResultClr = GRAY;
  let lastPnl = NaN;
  let winCount = 0;
  let lossCount = 0;
  let earlyCount = 0;
  let formStr = '';
  let lastSignalStr = 'Wait';
  let lastSignalClr = GRAY;
  let barsSinceSignal = 0;
  let signalTrend = 0;
  let signalStrength = 0;

  const bgColors: BgColorData[] = [];

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const isLast = i === n - 1;
    const confirmed = !isLast || lastConfirmed;
    const isWarmedUp = i >= WARMUP_BARS;

    const atrVal = nz(rawAtr[i], 0.0);
    const atrSma = nz(atrSmaRaw[i], atrVal);
    const bbWidthSma = nz(bbWidthSmaRaw[i], bbWidth[i]);
    const bbSqueeze = lt(bbWidth[i], bbWidthSma * cfg.squeezeThreshInput);
    const atrCompress = ne(atrSma, 0) ? lt(atrVal, atrSma * cfg.atrCompressInput) : false;
    const isSqueeze = bbSqueeze && atrCompress && isWarmedUp;

    squeezeBars = isSqueeze ? squeezeBars + 1 : 0;
    // validSqueeze[1]
    const prevValidSqueeze = prevSqueezeBars >= cfg.minSqueezeInput;

    if (isSqueeze && !prevIsSqueeze) {
      squeezeHigh = b.high;
      squeezeLow = b.low;
      squeezeStartBar = i;
    }
    if (isSqueeze) {
      squeezeHigh = Math.max(nz(squeezeHigh, b.high), b.high);
      squeezeLow = Math.min(nz(squeezeLow, b.low), b.low);
    }
    if (!isSqueeze && prevIsSqueeze) {
      squeezeHigh = NaN;
      squeezeLow = NaN;
    }

    // Volume data
    const vol = volume[i];
    const hasVolume = gt(nz(vol, 0), 0);
    const volSma = hasVolume ? nz(volSmaRaw[i], vol) : 0.0;
    const volSurge = hasVolume && gt(volSma, 0) && gt(vol, volSma * cfg.volMultInput);
    const volConfirm = cfg.useVolFilterInput ? (hasVolume ? volSurge : true) : true;

    // HTF trend filter
    const safeHtfMa = nz(htf.ma[i], b.close);
    const safeHtfClose = nz(htf.close[i], b.close);
    const htfBullish = gt(safeHtfClose, safeHtfMa);
    const htfBearish = lt(safeHtfClose, safeHtfMa);
    const htfBullOk = cfg.useHtfInput ? htfBullish : true;
    const htfBearOk = cfg.useHtfInput ? htfBearish : true;

    // Impulse candle
    const bodySize = Math.abs(b.close - b.open);
    const impulseUp = gt(b.close, b.open) && gt(bodySize, atrVal * cfg.impulseMultInput);
    const impulseDown = lt(b.close, b.open) && gt(bodySize, atrVal * cfg.impulseMultInput);

    // ── Create a range box when a squeeze ends ──
    const squeezeEnd = !isSqueeze && prevIsSqueeze && prevValidSqueeze && isWarmedUp && confirmed;
    const sqzHighSnap = prevSqueezeHigh;
    const sqzLowSnap = prevSqueezeLow;
    if (squeezeEnd && !isNaN(sqzHighSnap) && !isNaN(sqzLowSnap) && gt(sqzHighSnap, sqzLowSnap)) {
      const startBar = nz(prevSqueezeStartBar, i - cfg.minSqueezeInput);
      const rangeSpan = sqzHighSnap - sqzLowSnap;
      const rangeCenterV = (sqzHighSnap + sqzLowSnap) / 2.0;
      const maxRangeSpan = atrVal * 6.0;
      const capped = gt(rangeSpan, maxRangeSpan) && gt(atrVal, 0);
      const fHigh = capped ? rangeCenterV + atrVal * 3.0 : sqzHighSnap;
      const fLow = capped ? rangeCenterV - atrVal * 3.0 : sqzLowSnap;

      let overlapsExisting = false;
      if (cfg.preventOverlapInput && rangeBoxes.length > 0) {
        for (let k = 0; k <= rangeBoxes.length - 1; k++) {
          const eb = rangeBoxes[k];
          if (!(lt(fHigh, box.get_bottom(eb)) || gt(fLow, box.get_top(eb)))) {
            overlapsExisting = true;
            break;
          }
        }
      }
      if (!overlapsExisting) {
        const show = cfg.showBoxesInput;
        rangeBoxes.unshift(box.new(startBar, fHigh, i, fLow, show ? LINE_SUBTLE : NA, show ? 1 : 0, undefined, undefined,
          undefined, show ? RANGE_BG : NA, '', undefined, BOX_TEXT));
        const rZoneBot = fHigh - atrVal * 0.5;
        resistBoxes.unshift(box.new(startBar, fHigh, i, rZoneBot, NA, undefined, undefined, undefined, undefined,
          show ? C(bear, 85) : NA, '', undefined, BOX_TEXT));
        const sZoneTop = fLow + atrVal * 0.5;
        supportBoxes.unshift(box.new(startBar, sZoneTop, i, fLow, NA, undefined, undefined, undefined, undefined,
          show ? C(bull, 85) : NA, '', undefined, BOX_TEXT));
        const mid = (fHigh + fLow) / 2.0;
        centerLines.unshift(line.new(startBar, mid, i, mid, 'bar_index', 'none', show && cfg.showCenterInput ? LINE_SUBTLE : NA,
          'dashed', 1));
        rangeSqzLen.unshift(prevSqueezeBars);
      }
    }

    // ── Breakout detection ──
    let bullBreak = false;
    let bearBreak = false;
    let earlyClose = false;
    let earlyPnl = NaN;
    let sigSqzLen = 0;
    const removeRange = (k: number) => {
      rangeBoxes.splice(k, 1);
      resistBoxes.splice(k, 1);
      supportBoxes.splice(k, 1);
      centerLines.splice(k, 1);
      rangeSqzLen.splice(k, 1);
    };
    const openTrade = (dir: 1 | -1, k: number, entryPrice: number, slPrice: number) => {
      if (tradeActive) {
        earlyClose = true;
        earlyPnl = tradeDir === 1 ? b.close - lastEntry : lastEntry - b.close;
        earlyCount += 1;
      }
      if (dir === 1) bullBreak = true;
      else bearBreak = true;
      tradeDir = dir;
      tradeActive = true;
      tp1Done = false;
      tp2Done = false;
      sigSqzLen = rangeSqzLen[k];
      const risk = Math.abs(entryPrice - slPrice);
      const tp1Price = entryPrice + dir * risk * cfg.tp1RRInput;
      const tp2Price = entryPrice + dir * risk * cfg.tp2RRInput;
      const tp3Price = entryPrice + dir * risk * cfg.tp3RRInput;
      lastEntry = entryPrice;
      lastSL = slPrice;
      lastTP1 = tp1Price;
      lastTP2 = tp2Price;
      lastTP3 = tp3Price;
      lastPnl = NaN;
      removeRange(k);
      deleteTargets();
      if (cfg.showTargetsInput) {
        const entryColor = dir === 1 ? bull : bear;
        const lv = (v: { value: Line | undefined }, lb: { value: Label | undefined }, price: number, css: string,
          width: number, style: 'solid' | 'dashed' | 'dotted', text: string) => {
          v.value = line.new(i, price, i, price, 'bar_index', 'none', css, style, width);
          lb.value = label.new(i, price, `${text} ${tick(price)}`, 'bar_index', 'price', css, 'label_left', LABEL_TEXT,
            TARGET_SIZE);
        };
        lv(entryLine, entryLbl, entryPrice, entryColor, 2, 'solid', 'Entry');
        lv(slLine, slLbl, slPrice, C(bear, 50), 2, 'dashed', 'SL');
        lv(tp1Line, tp1Lbl, tp1Price, C(bull, 60), 1, 'dotted', 'TP1');
        lv(tp2Line, tp2Lbl, tp2Price, C(bull, 50), 1, 'dotted', 'TP2');
        lv(tp3Line, tp3Lbl, tp3Price, C(bull, 40), 1, 'dotted', 'TP3');
        lfRisk.value = linefill.new(entryLine.value!, slLine.value!, C(bear, 93));
        lfReward.value = linefill.new(entryLine.value!, tp3Line.value!, C(bull, 93));
      }
    };

    if (rangeBoxes.length > 0 && confirmed && isWarmedUp) {
      for (let k = rangeBoxes.length - 1; k >= 0; k--) {
        const rb = rangeBoxes[k];
        const bTop = box.get_top(rb);
        const bBot = box.get_bottom(rb);
        const brokeUp = gt(b.close, bTop);
        const brokeDn = lt(b.close, bBot);
        if (brokeUp && impulseUp && volConfirm && htfBullOk) {
          openTrade(1, k, b.close, bBot - atrVal * cfg.slBufferInput);
          break;
        } else if (brokeDn && impulseDown && volConfirm && htfBearOk) {
          openTrade(-1, k, b.close, bTop + atrVal * cfg.slBufferInput);
          break;
        } else if (brokeUp || brokeDn) {
          removeRange(k);
        } else {
          box.set_right(rb, i);
          box.set_right(resistBoxes[k], i);
          box.set_right(supportBoxes[k], i);
          line.set_x2(centerLines[k], i);
        }
      }
    }

    // Extend the remaining boxes after a breakout
    if ((bullBreak || bearBreak) && rangeBoxes.length > 0) {
      for (let j = 0; j <= rangeBoxes.length - 1; j++) {
        box.set_right(rangeBoxes[j], i);
        box.set_right(resistBoxes[j], i);
        box.set_right(supportBoxes[j], i);
        line.set_x2(centerLines[j], i);
      }
    }

    // Early close label
    if (earlyClose && cfg.showCloseLabelsInput) {
      label.new(i, b.close, '◼ Exit', 'bar_index', 'price', C(cfg.neutralColorInput, 20), 'label_left', '#1A1A1A', CLOSE_SIZE,
        undefined, `Trade closed early: replaced by a new breakout signal\nP&L at close: ${tick(nz(earlyPnl, 0.0))}\nExcluded from Win Rate stats`);
    }

    // ── TP / SL hit detection ──
    let tp3HitCond = false;
    let slHitCond = false;
    let tradeClosed = false;
    if (tradeActive && !bullBreak && !bearBreak && confirmed) {
      if (tradeDir === 1) {
        if (!isNaN(lastSL) && le(b.low, lastSL)) {
          slHitCond = true;
          tradeClosed = true;
          lastResult = 'Loss (SL)';
          lastResultClr = BEAR_TEXT;
          lastPnl = lastSL - lastEntry;
          lossCount += 1;
        }
        if (!tradeClosed) {
          if (!tp1Done && !isNaN(lastTP1) && ge(b.high, lastTP1)) tp1Done = true;
          if (!tp2Done && !isNaN(lastTP2) && ge(b.high, lastTP2)) tp2Done = true;
          if (!isNaN(lastTP3) && ge(b.high, lastTP3)) {
            tp3HitCond = true;
            tradeClosed = true;
            lastResult = 'Win (TP3)';
            lastResultClr = BULL_TEXT;
            lastPnl = lastTP3 - lastEntry;
            winCount += 1;
          }
        }
      }
      if (tradeDir === -1) {
        if (!isNaN(lastSL) && ge(b.high, lastSL)) {
          slHitCond = true;
          tradeClosed = true;
          lastResult = 'Loss (SL)';
          lastResultClr = BEAR_TEXT;
          lastPnl = lastEntry - lastSL;
          lossCount += 1;
        }
        if (!tradeClosed) {
          if (!tp1Done && !isNaN(lastTP1) && le(b.low, lastTP1)) tp1Done = true;
          if (!tp2Done && !isNaN(lastTP2) && le(b.low, lastTP2)) tp2Done = true;
          if (!isNaN(lastTP3) && le(b.low, lastTP3)) {
            tp3HitCond = true;
            tradeClosed = true;
            lastResult = 'Win (TP3)';
            lastResultClr = BULL_TEXT;
            lastPnl = lastEntry - lastTP3;
            winCount += 1;
          }
        }
      }
    }

    if (tradeClosed) {
      formStr = formStr + (tp3HitCond ? '▰' : '▱');
      if (formStr.length > FORM_LEN) formStr = formStr.substring(formStr.length - FORM_LEN);
      deleteTargets();
      for (const v of targetLines) v.value = undefined;
      for (const v of targetLabels) v.value = undefined;
      lfRisk.value = undefined;
      lfReward.value = undefined;
      if (cfg.showCloseLabelsInput) {
        if (slHitCond) {
          label.new(i, tradeDir === 1 ? b.low : b.high, '✘ SL', 'bar_index', 'price', bear,
            tradeDir === 1 ? 'label_up' : 'label_down', LABEL_TEXT, CLOSE_SIZE, undefined,
            `Trade stopped out\nEntry: ${tick(lastEntry)}\nSL: ${tick(lastSL)}\nP&L: ${tick(nz(lastPnl, 0.0))}`);
        } else if (tp3HitCond) {
          label.new(i, tradeDir === 1 ? b.high : b.low, '✔ TP3', 'bar_index', 'price', bull,
            tradeDir === 1 ? 'label_down' : 'label_up', LABEL_TEXT, CLOSE_SIZE, undefined,
            `Trade closed at TP3\nEntry: ${tick(lastEntry)}\nTP3: ${tick(lastTP3)}\nP&L: ${tick(nz(lastPnl, 0.0))}`);
        }
      }
      tradeActive = false;
      tradeDir = 0;
      tp1Done = false;
      tp2Done = false;
    }

    // Extend the target lines while a trade is active
    if (tradeActive && !bullBreak && !bearBreak && cfg.showTargetsInput && entryLine.value) {
      for (let k = 0; k < targetLines.length; k++) {
        line.set_x2(targetLines[k].value!, i);
        label.set_x(targetLabels[k].value!, i);
      }
    }

    // Clean up old objects
    if (rangeBoxes.length > MAX_TRACKED_BOXES) {
      box.delete(rangeBoxes.pop()!);
      box.delete(resistBoxes.pop()!);
      box.delete(supportBoxes.pop()!);
      line.delete(centerLines.pop()!);
      rangeSqzLen.pop();
    }

    // Squeeze background
    if (cfg.showBgInput && isSqueeze) bgColors.push({ time: b.time, color: C(cfg.neutralColorInput, 92) });

    // Signal labels
    if (cfg.showSignalsInput && bullBreak) {
      label.new(i, b.low, 'Long', 'bar_index', 'price', bull, 'label_up', LABEL_TEXT, SIGNAL_SIZE, undefined,
        `Bullish Breakout\nEntry: ${tick(b.close)}`);
    }
    if (cfg.showSignalsInput && bearBreak) {
      label.new(i, b.high, 'Short', 'bar_index', 'price', bear, 'label_down', LABEL_TEXT, SIGNAL_SIZE, undefined,
        `Bearish Breakout\nEntry: ${tick(b.close)}`);
    }

    // Dashboard status tracking
    if (bullBreak) {
      lastSignalStr = 'Buy';
      lastSignalClr = BULL_TEXT;
      barsSinceSignal = 0;
      signalTrend = 1;
    } else if (bearBreak) {
      lastSignalStr = 'Sell';
      lastSignalClr = BEAR_TEXT;
      barsSinceSignal = 0;
      signalTrend = -1;
    } else {
      barsSinceSignal += 1;
    }
    if (bullBreak || bearBreak) {
      signalStrength = 0;
      if (gt(bodySize, atrVal * cfg.impulseMultInput * 1.5)) signalStrength += 1;
      if (volSurge) signalStrength += 1;
      if ((bullBreak && htfBullish) || (bearBreak && htfBearish)) signalStrength += 1;
      if (sigSqzLen >= cfg.minSqueezeInput * 2) signalStrength += 1;
    }

    // ── Dashboard and watermark (last bar) ──
    if (cfg.showDashInput && isLast) {
      const strengthStr = signalStrength >= 3 ? 'Strong' : signalStrength >= 2 ? 'Medium' : 'Normal';
      const strengthClr = signalStrength >= 3 ? BULL_TEXT : signalStrength >= 2 ? NEUTRAL_TEXT : TEXT_MUTED;
      const headTrend = tradeActive ? tradeDir : signalTrend;
      const trendWord = headTrend === 1 ? 'Bullish' : headTrend === -1 ? 'Bearish' : 'Neutral';
      const trendCol = headTrend === 1 ? BULL_TEXT : headTrend === -1 ? BEAR_TEXT : NEUTRAL_TEXT;
      const headerBg = headTrend === 1 ? HEADER_BG_BULL : headTrend === -1 ? HEADER_BG_BEAR : HEADER_BG_FLAT;
      const biasStr = !cfg.useHtfInput ? 'Off' : htfBullish ? 'Bullish' : htfBearish ? 'Bearish' : '—';
      const biasCol = !cfg.useHtfInput ? TEXT_MUTED : htfBullish ? BULL_TEXT : htfBearish ? BEAR_TEXT : TEXT_MUTED;
      const sigDashStr = lastSignalStr + (lastSignalStr !== 'Wait' && barsSinceSignal > 0 ? ` (${str.tostring(barsSinceSignal)} ago)` : '');
      const sqzStr = isSqueeze ? `ACTIVE (${str.tostring(squeezeBars)})` : 'None';
      const sqzCol = isSqueeze ? NEUTRAL_TEXT : TEXT_MUTED;
      const fmtPrice = (v: number) => (isNaN(v) ? '—' : tick(v));
      const dashEntry = tradeActive ? fmtPrice(lastEntry) : '—';
      const dashSL = tradeActive ? fmtPrice(lastSL) : '—';
      const dashTP1 = tradeActive ? (tp1Done ? '✓ ' : '') + fmtPrice(lastTP1) : '—';
      const dashTP2 = tradeActive ? (tp2Done ? '✓ ' : '') + fmtPrice(lastTP2) : '—';
      const dashTP3 = tradeActive ? fmtPrice(lastTP3) : '—';
      const dashTp1Col = tp1Done ? BULL_TEXT : TEXT_COLOR;
      const dashTp2Col = tp2Done ? BULL_TEXT : TEXT_COLOR;
      const slDistPct = tradeActive && !isNaN(lastEntry) && ne(lastEntry, 0) ? Math.abs(lastEntry - lastSL) / lastEntry * 100 : 0.0;
      const dashRR = str.tostring(cfg.tp1RRInput, '#.#') + 'R';
      const dashDist = str.tostring(slDistPct, '#.##') + '%';
      const rrColor = ge(cfg.tp1RRInput, 1.5) ? BULL_TEXT : ge(cfg.tp1RRInput, 1.0) ? NEUTRAL_TEXT : BEAR_TEXT;
      const distColor = gt(slDistPct, 3.0) ? BEAR_TEXT : gt(slDistPct, 1.0) ? NEUTRAL_TEXT : BULL_TEXT;
      const flatStr = lastResult === '—' ? 'Flat · waiting for breakout' : `Flat · last: ${lastResult}`;
      const flatCol = lastResult === '—' ? TEXT_MUTED : lastResultClr;
      const resolvedTrades = winCount + lossCount;
      const winRate = resolvedTrades > 0 ? winCount / resolvedTrades * 100.0 : 0.0;
      const dashWL = `${str.tostring(winCount)} / ${str.tostring(lossCount)}` + (earlyCount > 0 ? ` (+${str.tostring(earlyCount)}E)` : '');
      const dashWR = resolvedTrades > 0 ? `${str.tostring(winRate, '#.#')}%  ${buildGauge(winRate, 100, 8)}` : '—';
      const wrCol = resolvedTrades === 0 ? TEXT_MUTED : ge(winRate, 55.0) ? BULL_TEXT : ge(winRate, 45.0) ? NEUTRAL_TEXT : BEAR_TEXT;
      const dashForm = formStr === '' ? '—' : formStr;
      const pnlStr = isNaN(lastPnl) ? '—' : (ge(lastPnl, 0) ? '+' : '') + tick(lastPnl);
      const pnlClr = isNaN(lastPnl) ? TEXT_MUTED : ge(lastPnl, 0) ? BULL_TEXT : BEAR_TEXT;

      const marketRows = cfg.showMarketSecInput ? 7 : 0;
      const tradeRows = cfg.showTradeSecInput ? (tradeActive ? 8 : 2) : 0;
      const statsRows = cfg.showStatsSecInput ? 6 : 0;
      const totalRows = 2 + marketRows + tradeRows + statsRows;
      const dash = table.new(dashPos, 2, totalRows, TABLE_BG, TABLE_BORDER, 1, TABLE_BORDER, 1);
      let r = 0;
      let zeb = false;
      /** table.cell(dashTable, column, r, text, text_color, text_size, bgcolor, tooltip, text_halign) */
      const cell = (column: number, text: string, textColor: string, size: string, bg: string | undefined,
        tooltip?: string, halign?: 'center') => {
        table.cell(dash, column, r, text, undefined, undefined, textColor, halign, undefined, size, bg, tooltip);
      };
      const divider = (text: string) => {
        cell(0, text, TEXT_MUTED, dashFontSizeSub, TABLE_ROW_ALT, undefined, 'center');
        table.merge_cells(dash, 0, r, 1, r);
        r += 1;
      };
      const row = (name: string, value: string, valueColor: string, tooltip?: string) => {
        const rb = zeb ? TABLE_ROW_ALT : TABLE_BG;
        cell(0, name, TEXT_MUTED, dashFontSize, rb, tooltip);
        cell(1, value, valueColor, dashFontSize, rb);
        r += 1;
        zeb = !zeb;
      };

      cell(0, `◆ Breakout · ${trendWord}`, HEADER_TEXT, dashFontSize, headerBg, undefined, 'center');
      table.merge_cells(dash, 0, r, 1, r);
      r += 1;

      if (cfg.showMarketSecInput) {
        divider('— Market —');
        row('Trend', trendWord, trendCol, 'Direction of the active trade, or the most recent breakout signal when flat.');
        row('HTF Bias', biasStr, biasCol, 'Higher-timeframe MA bias (breakout direction filter).');
        row('Signal', sigDashStr, lastSignalClr, 'Most recent breakout signal and how many bars ago it fired.');
        row('Strength', strengthStr, strengthClr, 'Quality of the last breakout (0-4):\nextra-large body, volume surge, HTF alignment, extended squeeze.');
        row('Squeeze', sqzStr, sqzCol, `Volatility compression state (bars in squeeze).\nA valid range forms after ${str.tostring(cfg.minSqueezeInput)}+ bars.`);
        row('Timeframe', chartTf, TEXT_COLOR);
      }

      if (cfg.showTradeSecInput) {
        divider('— Trade —');
        if (tradeActive) {
          row('Entry', dashEntry, TEXT_COLOR);
          row('SL', dashSL, BEAR_TEXT, 'Active stop-loss.');
          row('TP1', dashTP1, dashTp1Col, '✓ = touched.');
          row('TP2', dashTP2, dashTp2Col, '✓ = touched.');
          row('TP3', dashTP3, TEXT_COLOR, 'Final target. Touching it closes the trade (Win).');
          row('R:R (TP1)', dashRR, rrColor, 'Reward-to-risk at TP1.');
          row('SL Dist %', dashDist, distColor, 'Stop distance as % of entry (not position risk).');
        } else {
          const rb = zeb ? TABLE_ROW_ALT : TABLE_BG;
          cell(0, flatStr, flatCol, dashFontSize, rb, undefined, 'center');
          table.merge_cells(dash, 0, r, 1, r);
          r += 1;
          zeb = !zeb;
        }
      }

      if (cfg.showStatsSecInput) {
        divider('— Stats —');
        row('Trades', str.tostring(resolvedTrades), TEXT_COLOR, 'Resolved trades this session (TP3 wins + SL losses).');
        row('W / L', dashWL, TEXT_COLOR, 'W = closed at TP3, L = closed at SL.\n+E = early closes (replaced by a new signal, excluded from Win Rate).\nSame-bar TP3+SL ambiguity is always counted as LOSS.');
        row('Win rate', dashWR, wrCol, 'Win Rate = TP3 wins ÷ (TP3 wins + SL losses).\nFull TP3-or-SL methodology — no partial-TP win counting,\nno stat padding, early closes excluded.');
        row('Last P&L', pnlStr, pnlClr, 'P&L of the last resolved trade, in price units.');
        row('Form', dashForm, FORM_COLOR, `Last ${str.tostring(FORM_LEN)} resolved trades.  ▰ = win · ▱ = loss (newest right).`);
      }

      cell(0, `Smart Breakout · ${INDICATOR_VERSION}`, TEXT_MUTED, dashFontSizeSub, undefined, undefined, 'center');
      table.merge_cells(dash, 0, r, 1, r);
    }
    if (isLast && cfg.showWatermarkInput) {
      const clear = C('#000000', 100);
      const wm = table.new('bottom_center', 1, 1, clear, clear, 0, clear, 0);
      table.cell(wm, 0, 0, 'WillyAlgoTrader', undefined, undefined, WM_COLOR, 'center', undefined, 'normal', clear);
    }

    // history of the bar for the next one
    prevIsSqueeze = isSqueeze;
    prevSqueezeBars = squeezeBars;
    prevSqueezeHigh = squeezeHigh;
    prevSqueezeLow = squeezeLow;
    prevSqueezeStartBar = squeezeStartBar;
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars, n > 0 && bars[0].time >= 1e12 ? 'ms' : 's');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: out.boxes ?? [],
    lines: out.lines ?? [],
    labels: out.labels ?? [],
    linefills: out.linefills ?? [],
    tables: out.tables ?? [],
    bgColors,
  };
}

export const SmartBreakoutTargets = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
