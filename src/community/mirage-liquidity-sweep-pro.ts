/**
 * Mirage Liquidity Sweep Pro [WillyAlgoTrader]
 *
 * Liquidity sweeps of swing highs and lows, with a trade model and a dashboard.
 * - Swings: pivot highs and lows of the swing length; the last 25 of each side are kept. A swing is "used" when a
 *   close goes beyond it. A bar sweeps a swing low when its low is below the level and its close above it (a swing
 *   high: high above, close below), within the maximum distance in bars.
 * - Score (0 to 100) of a sweep: the wick and the reclaim against the ATR, the position of the close in the bar,
 *   the volume against its average and the bias of the higher timeframe (previous close against the previous EMA
 *   of that timeframe). A sweep qualifies from the minimum score, after the warm-up.
 * - Signal: on the sweep bar, or (default) when the close breaks the last minor pivot within the confirmation
 *   window (CHoCH). One position at a time: stop beyond the sweep wick with an ATR buffer (at least half an ATR from
 *   the entry), three targets in multiples of the risk, break-even after the first target, exit on the stop or on
 *   the third target. A trade is a win once the first target was touched.
 * - Outputs: a cross on each qualifying sweep, a label on each entry, the swept level and the wick beyond it,
 *   equal highs / lows, the resting liquidity levels of the last bar (BSL / SSL), the liquidity target, the entry /
 *   stop / target lines and labels of the latest trade, optional score labels, the dashboard and the watermark.
 *
 * Chart context (optional third argument):
 * - `chart.mintick`: the symbol tick of the price texts. Without it 0.01.
 * - `chart.backgroundColor`: theme "Auto" is dark when the red channel of the chart background is below 128.
 *   Without it the dark theme.
 * - `chart.lastBarConfirmed`: when the last bar is still open, it gives no sweep, no entry and no exit. Without it
 *   every bar is taken as closed.
 * - `chart.timeframe`: the chart timeframe (dashboard text). Without it, it is taken from the bars.
 * - `chart.timezone` and `chart.session`: the exchange calendar of the bars of the higher timeframe. Without them
 *   the UTC calendar and the bars (see anchor-period.ts).
 *
 * Limits of the port:
 * - The bars of the higher timeframe are built from the chart bars, so their EMA starts at the first chart bar.
 * - A higher timeframe input below the chart timeframe (the default "240" on a daily chart) needs data that the
 *   chart bars do not have: the port throws an Error when "Use HTF Bias (score)" is on.
 * - The alerts give no output.
 *
 * Reference: "Mirage Liquidity Sweep Pro [WillyAlgoTrader]" by WillyAlgoTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, str, color, timeframe, Series, barInterval, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type {
  LabelData, LabelStyle, LineDrawingData, MarkerData, PineSize, TableCellData, TableData, TableMergeData, TablePosition,
} from '../types';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import { backgroundColorOf, lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';

type LineStyleName = 'Solid' | 'Dashed' | 'Dotted';
type Corner = 'Top Left' | 'Top Right' | 'Bottom Left' | 'Bottom Right' | 'Middle Right';

export interface MirageLiquiditySweepProInputs {
  swingLen: number;
  lookbackBars: number;
  minScore: number;
  requireConfirm: boolean;
  minorLen: number;
  confirmWindow: number;
  useVolume: boolean;
  volLen: number;
  volMult: number;
  useHtf: boolean;
  htfTf: string;
  htfEmaLen: number;
  riskPreset: 'Conservative' | 'Balanced' | 'Aggressive' | 'Scalping' | 'Custom';
  atrLenRisk: number;
  slBuffer: number;
  tp1Mult: number;
  tp2Mult: number;
  tp3Mult: number;
  useBreakEven: boolean;
  showSlTp: boolean;
  showSlTpLabels: boolean;
  showPctOnLabels: boolean;
  entryLineStyle: LineStyleName;
  slLineStyle: LineStyleName;
  tpLineStyle: LineStyleName;
  showLiquidity: boolean;
  maxLiq: number;
  liqExtend: number;
  showLiqLabels: boolean;
  showEquals: boolean;
  eqTol: number;
  showTarget: boolean;
  theme: 'Auto' | 'Dark' | 'Light';
  showSweeps: boolean;
  showSweepLine: boolean;
  sweepLineExtend: number;
  showSweepPen: boolean;
  maxSweepVis: number;
  showSignals: boolean;
  showScoreLabels: boolean;
  showLevel: boolean;
  labelFontSize: 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  showWatermark: boolean;
  showDash: boolean;
  dashPos: Corner;
  dashFontSize: 'Small' | 'Normal' | 'Large' | 'Huge';
  showMarketSec: boolean;
  showTradeSec: boolean;
  showStatsSec: boolean;
  webhook: boolean;
  showSlHitAlert: boolean;
  alertTpHit: boolean;
  bullColor: string;
  bearColor: string;
}

export const defaultInputs: MirageLiquiditySweepProInputs = {
  swingLen: 21,
  lookbackBars: 80,
  minScore: 50,
  requireConfirm: true,
  minorLen: 8,
  confirmWindow: 13,
  useVolume: true,
  volLen: 21,
  volMult: 1.5,
  useHtf: true,
  htfTf: '240',
  htfEmaLen: 50,
  riskPreset: 'Balanced',
  atrLenRisk: 14,
  slBuffer: 0.25,
  tp1Mult: 1.0,
  tp2Mult: 2.0,
  tp3Mult: 3.0,
  useBreakEven: true,
  showSlTp: true,
  showSlTpLabels: true,
  showPctOnLabels: true,
  entryLineStyle: 'Dotted',
  slLineStyle: 'Solid',
  tpLineStyle: 'Dashed',
  showLiquidity: true,
  maxLiq: 6,
  liqExtend: 10,
  showLiqLabels: true,
  showEquals: true,
  eqTol: 0.15,
  showTarget: true,
  theme: 'Auto',
  showSweeps: true,
  showSweepLine: true,
  sweepLineExtend: 8,
  showSweepPen: true,
  maxSweepVis: 15,
  showSignals: true,
  showScoreLabels: false,
  showLevel: true,
  labelFontSize: 'Small',
  showWatermark: true,
  showDash: true,
  dashPos: 'Top Right',
  dashFontSize: 'Small',
  showMarketSec: true,
  showTradeSec: true,
  showStatsSec: true,
  webhook: false,
  showSlHitAlert: true,
  alertTpHit: false,
  bullColor: '#00E676',
  bearColor: '#FF5252',
};

const GRP_MAIN = '⚙️ Main Settings';
const GRP_CONFIRM = '🧩 Confirmation';
const GRP_FILTER = '🔍 Filters';
const GRP_RISK = '🛡️ Risk Management';
const GRP_LIQ = '💧 Liquidity';
const GRP_VISUAL = '🎨 Visual';
const GRP_DASH = '📊 Dashboard';
const GRP_ALERT = '🔔 Alerts';
const GRP_COLORS = '🎨 Colors';
const LINE_STYLES = ['Solid', 'Dashed', 'Dotted'];

export const inputConfig: InputConfig[] = [
  { id: 'swingLen', type: 'int', title: 'Swing Length', defval: 21, min: 3, max: 100, group: GRP_MAIN, tooltip: 'Pivot lookback for major swings to sweep.\n• Higher = bigger/cleaner liquidity pools\n• Lower = more frequent, smaller sweeps\n• Recommended: 10-25' },
  { id: 'lookbackBars', type: 'int', title: 'Max Sweep Distance (bars)', defval: 80, min: 5, max: 500, group: GRP_MAIN, tooltip: 'A swing can only be swept within this many bars of forming.' },
  { id: 'minScore', type: 'int', title: 'Min Sweep Score', defval: 50, min: 0, max: 100, group: GRP_MAIN, tooltip: 'Minimum 0-100 quality score for a sweep to qualify.\n• Higher = fewer, stronger sweeps\n• ~45-60 balanced, 65+ strict' },

  { id: 'requireConfirm', type: 'bool', title: 'Require CHoCH Confirmation', defval: true, group: GRP_CONFIRM, tooltip: 'OFF: signal fires on the sweep bar (responsive).\nON: sweep becomes a setup; signal fires only after price breaks recent market structure (CHoCH).' },
  { id: 'minorLen', type: 'int', title: 'Structure Pivot Length', defval: 8, min: 2, max: 30, group: GRP_CONFIRM, tooltip: 'Pivot length for the minor structure used to confirm CHoCH after a sweep.' },
  { id: 'confirmWindow', type: 'int', title: 'Confirmation Window (bars)', defval: 13, min: 1, max: 100, group: GRP_CONFIRM, tooltip: 'Max bars to wait for a CHoCH after a sweep before the setup expires.' },

  { id: 'useVolume', type: 'bool', title: 'Use Volume Filter', defval: true, group: GRP_FILTER, tooltip: 'Reward sweeps on above-average volume. Auto-bypassed on volume-less feeds.' },
  { id: 'volLen', type: 'int', title: 'Volume MA Length', defval: 21, min: 2, max: 200, group: GRP_FILTER, tooltip: 'Length of the volume moving average baseline.' },
  { id: 'volMult', type: 'float', title: 'Volume Spike (×MA)', defval: 1.5, min: 1.1, max: 5.0, step: 0.1, group: GRP_FILTER, tooltip: 'Volume multiple of its MA that counts as a full-strength spike.' },
  { id: 'useHtf', type: 'bool', title: 'Use HTF Bias (score)', defval: true, group: GRP_FILTER, tooltip: 'Reward sweeps aligned with the higher-timeframe EMA trend (soft, +10% of score).' },
  { id: 'htfTf', type: 'timeframe', title: 'HTF Timeframe', defval: '240', group: GRP_FILTER, tooltip: 'Higher timeframe for trend bias. Empty = current TF.' },
  { id: 'htfEmaLen', type: 'int', title: 'HTF EMA Length', defval: 50, min: 5, max: 400, group: GRP_FILTER, tooltip: 'EMA length on the HTF (close above = bullish bias).' },

  { id: 'riskPreset', type: 'string', title: 'Risk Preset', defval: 'Balanced', options: ['Conservative', 'Balanced', 'Aggressive', 'Scalping', 'Custom'], group: GRP_RISK, tooltip: 'Quick presets (SL buffer ×ATR beyond wick / TP1 / TP2 / TP3 in R):\n• Conservative: 0.5 / 1R / 2R / 4R\n• Balanced: 0.25 / 1R / 2R / 3R\n• Aggressive: 0.15 / 1.5R / 2.5R / 4R\n• Scalping: 0.1 / 0.8R / 1.5R / 2R\n• Custom: manual inputs below' },
  { id: 'atrLenRisk', type: 'int', title: 'ATR Length', defval: 14, min: 5, max: 50, group: GRP_RISK, tooltip: 'ATR period for the stop buffer and minimum-distance guard.' },
  { id: 'slBuffer', type: 'float', title: 'SL Buffer ×ATR (Custom)', defval: 0.25, min: 0.0, max: 3.0, step: 0.05, group: GRP_RISK, tooltip: 'Extra room beyond the sweep wick for the stop. Used when preset = Custom.' },
  { id: 'tp1Mult', type: 'float', title: 'TP1 ×Risk (Custom)', defval: 1.0, min: 0.5, max: 5.0, step: 0.1, group: GRP_RISK, tooltip: 'TP1 as multiple of risk. 1.0 = 1:1 R:R.' },
  { id: 'tp2Mult', type: 'float', title: 'TP2 ×Risk (Custom)', defval: 2.0, min: 1.0, max: 10.0, step: 0.1, group: GRP_RISK },
  { id: 'tp3Mult', type: 'float', title: 'TP3 ×Risk (Custom)', defval: 3.0, min: 1.5, max: 15.0, step: 0.1, group: GRP_RISK },
  { id: 'useBreakEven', type: 'bool', title: 'Break-Even After TP1', defval: true, group: GRP_RISK, tooltip: 'When TP1 is touched, move SL to entry. From the next bar, a wick to entry closes at break-even. (TP1 still counts as a WIN.)' },
  { id: 'showSlTp', type: 'bool', title: 'Show SL/TP Lines', defval: true, group: GRP_RISK },
  { id: 'showSlTpLabels', type: 'bool', title: 'Show SL/TP Labels', defval: true, group: GRP_RISK },
  { id: 'showPctOnLabels', type: 'bool', title: 'Show % Distance on Labels', defval: true, group: GRP_RISK, tooltip: "Append % distance from entry to SL/TP labels, e.g. 'SL 1.2300 (-0.36%)'." },
  { id: 'entryLineStyle', type: 'string', title: 'Entry Line Style', defval: 'Dotted', options: LINE_STYLES, group: GRP_RISK, tooltip: 'Entry is a reference, not an action level — keep it subtle.' },
  { id: 'slLineStyle', type: 'string', title: 'SL Line Style', defval: 'Solid', options: LINE_STYLES, group: GRP_RISK },
  { id: 'tpLineStyle', type: 'string', title: 'TP Line Style', defval: 'Dashed', options: LINE_STYLES, group: GRP_RISK, tooltip: 'Style for TP1/TP2/TP3. On hit, a TP line turns solid teal.' },

  { id: 'showLiquidity', type: 'bool', title: 'Show Resting Liquidity (BSL/SSL)', defval: true, group: GRP_LIQ, tooltip: 'Mark un-swept swing highs as Buy-Side Liquidity (BSL) and un-swept swing lows as Sell-Side Liquidity (SSL). A level disappears once it is swept.' },
  { id: 'maxLiq', type: 'int', title: 'Max Liquidity Levels / Side', defval: 6, min: 1, max: 25, group: GRP_LIQ, tooltip: 'Show only the N most recent un-swept levels per side (keeps the chart clean).' },
  { id: 'liqExtend', type: 'int', title: 'Liquidity Line Extend (bars)', defval: 10, min: 0, max: 100, group: GRP_LIQ, tooltip: 'How far past the current bar to project resting-liquidity lines.' },
  { id: 'showLiqLabels', type: 'bool', title: 'Show BSL/SSL Labels', defval: true, group: GRP_LIQ, tooltip: 'Tag each resting-liquidity line BSL / SSL.' },
  { id: 'showEquals', type: 'bool', title: 'Show Equal Highs/Lows (EQH/EQL)', defval: true, group: GRP_LIQ, tooltip: 'Connect consecutive near-equal swing highs/lows — prime liquidity magnets and the most common sweep targets.' },
  { id: 'eqTol', type: 'float', title: 'Equal H/L Tolerance (×ATR)', defval: 0.15, min: 0.02, max: 1.0, step: 0.01, group: GRP_LIQ, tooltip: "Two swings count as 'equal' if within this fraction of ATR.\nLower = stricter (only very tight equals)." },
  { id: 'showTarget', type: 'bool', title: 'Show Liquidity Target (on entry)', defval: true, group: GRP_LIQ, tooltip: 'On each entry, project a line to the nearest opposite un-swept liquidity — the logical draw-on-liquidity objective.' },

  { id: 'theme', type: 'string', title: 'Theme', defval: 'Auto', options: ['Auto', 'Dark', 'Light'], group: GRP_VISUAL, tooltip: 'Chart color theme.\n• Auto: detect from chart background\n• Dark / Light: force a palette' },
  { id: 'showSweeps', type: 'bool', title: 'Show Raw Sweep Marks', defval: true, group: GRP_VISUAL, tooltip: 'Small × at the wick where liquidity was grabbed (shown even while in a trade).' },
  { id: 'showSweepLine', type: 'bool', title: 'Show Swept Extremum Line', defval: true, group: GRP_VISUAL, tooltip: 'Horizontal line at the swing high/low that was swept, drawn from where that swing formed to the sweep bar.' },
  { id: 'sweepLineExtend', type: 'int', title: 'Swept Line Extend (bars)', defval: 8, min: 0, max: 100, group: GRP_VISUAL, tooltip: 'How many bars to extend the swept-level line past the sweep bar (swept liquidity often acts as future S/R).' },
  { id: 'showSweepPen', type: 'bool', title: 'Show Sweep Penetration', defval: true, group: GRP_VISUAL, tooltip: 'Highlight the wick segment that pierced beyond the level — the depth of the liquidity grab.' },
  { id: 'maxSweepVis', type: 'int', title: 'Max Sweep Drawings', defval: 15, min: 1, max: 60, group: GRP_VISUAL, tooltip: 'Cap on stored swept-level / penetration drawings. Oldest are removed first.' },
  { id: 'showSignals', type: 'bool', title: 'Show Buy/Sell Signals', defval: true, group: GRP_VISUAL, tooltip: 'Print Long ▲ / Short ▼ markers when a trade opens.' },
  { id: 'showScoreLabels', type: 'bool', title: 'Show Score Labels', defval: false, group: GRP_VISUAL, tooltip: 'Floating 0-100 score next to each qualifying sweep.' },
  { id: 'showLevel', type: 'bool', title: 'Show Swept Level Line', defval: true, group: GRP_VISUAL, tooltip: 'Line marking the liquidity level taken by the active trade.' },
  { id: 'labelFontSize', type: 'string', title: 'SL/TP Label Font Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: GRP_VISUAL, tooltip: 'Font size for SL/TP/Entry labels.' },
  { id: 'showWatermark', type: 'bool', title: 'Show Watermark', defval: true, group: GRP_VISUAL, tooltip: "Display 'WillyAlgoTrader' watermark on chart." },

  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: true, group: GRP_DASH },
  { id: 'dashPos', type: 'string', title: 'Dashboard Position', defval: 'Top Right', options: ['Top Left', 'Top Right', 'Bottom Left', 'Bottom Right', 'Middle Right'], group: GRP_DASH },
  { id: 'dashFontSize', type: 'string', title: 'Dashboard Font Size', defval: 'Small', options: ['Small', 'Normal', 'Large', 'Huge'], group: GRP_DASH, tooltip: 'Font size for the dashboard table. Section dividers and the\nversion footer render one step smaller to preserve hierarchy.' },
  { id: 'showMarketSec', type: 'bool', title: '  ├ Market section', defval: true, group: GRP_DASH, tooltip: 'Trend, HTF bias, Signal, Last sweep, Timeframe.' },
  { id: 'showTradeSec', type: 'bool', title: '  ├ Trade section', defval: true, group: GRP_DASH, tooltip: 'SL, TP1-3, R:R, SL distance. Collapses to one row when flat.' },
  { id: 'showStatsSec', type: 'bool', title: '  └ Stats section', defval: true, group: GRP_DASH, tooltip: 'Trades, W/L, Win Rate (+gauge), recent Form.' },

  { id: 'webhook', type: 'bool', title: 'Webhook JSON Format', defval: false, group: GRP_ALERT, tooltip: 'Send entry alerts as JSON for webhook / autotrading.' },
  { id: 'showSlHitAlert', type: 'bool', title: 'Alert on SL Hit', defval: true, group: GRP_ALERT, tooltip: 'Fire an alert when price hits the active stop-loss.' },
  { id: 'alertTpHit', type: 'bool', title: 'Alert on TP / Break-Even', defval: false, group: GRP_ALERT, tooltip: 'Fire alerts when TP1/TP2/TP3 are touched and on break-even.' },

  { id: 'bullColor', type: 'color', title: 'Bull', defval: '#00E676', inline: 'c', group: GRP_COLORS },
  { id: 'bearColor', type: 'color', title: 'Bear', defval: '#FF5252', inline: 'c', group: GRP_COLORS },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Mirage Liquidity Sweep Pro [WillyAlgoTrader]',
  shortTitle: 'Mirage LSP',
  overlay: true,
};

const INDICATOR_VERSION = 'v1.3.1';
const MAX_STORED = 25;
const MAX_SIG_LABELS = 50;
const LINE_FORWARD_BARS = 20;
const LINE_UPDATE_BARS = 5;
const LABEL_OFFSET_BARS = 1;
const BE_DIM_TRANSP = 70;
const FORM_LEN = 10;
const MAX_EQ_MARKS = 16;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

type DrawStyle = 'solid' | 'dashed' | 'dotted';
/** Drawings as the script handles them: x is a bar index */
interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; style: DrawStyle; width: number }
interface Lb { x: number; y: number; text: string; color: string; textColor: string; style: LabelStyle; size: PineSize; tooltip?: string }

const lineStyleFromString = (s: string): DrawStyle => (s === 'Dashed' ? 'dashed' : s === 'Dotted' ? 'dotted' : 'solid');
const sizeFromString = (s: string): PineSize =>
  (s === 'Tiny' ? 'tiny' : s === 'Small' ? 'small' : s === 'Normal' ? 'normal' : s === 'Large' ? 'large' : s === 'Huge' ? 'huge' : 'small');
/** One step smaller: the section dividers and the version footer */
const sizeDownFromString = (s: string): PineSize =>
  (s === 'Tiny' ? 'tiny' : s === 'Small' ? 'tiny' : s === 'Normal' ? 'small' : s === 'Large' ? 'normal' : s === 'Huge' ? 'large' : 'tiny');
const cornerOf = (s: string): TablePosition => {
  switch (s) {
    case 'Top Left': return 'top_left';
    case 'Bottom Left': return 'bottom_left';
    case 'Bottom Right': return 'bottom_right';
    case 'Middle Right': return 'middle_right';
    default: return 'top_right';
  }
};

function buildGauge(value: number, maxVal: number, width: number): string {
  const filled = le(maxVal, 0) ? 0 : Math.round(Math.min(width, Math.max(0.0, (value / maxVal) * width)));
  let result = '';
  for (let i = 0; i <= width - 1; i++) result += i < filled ? '▰' : '▱';
  return result;
}

/**
 * request.security(syminfo.tickerid, tf, [close[1], ta.ema(close, len)[1]], gaps_off, lookahead_on): for each chart
 * bar the close and the EMA of the bar of timeframe `tf` before the one that contains the chart bar.
 */
function previousHtfValues(bars: Bar[], tf: string, emaLen: number, context?: ChartContext): { close: number[]; ema: number[] } {
  const chart = chartTimeframe(bars, context);
  let htf: Bar[] = bars;
  let group: number[] = bars.map((_b, i) => i);
  if (!(tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart))) {
    if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
      throw new Error(`The HTF timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data (switch "Use HTF Bias (score)" off or choose a higher timeframe)`);
    }
    // With the exchange calendar of the chart context the periods come from the library rule (see anchor-period.ts)
    const exchange = securityBars(bars, tf, context);
    if (exchange) {
      htf = exchange.htf;
      group = exchange.group;
    } else {
      const starts = periodStarts(bars, tf);
      htf = [];
      group = [];
      bars.forEach((b, i) => {
        if (i === 0 || starts[i] !== starts[i - 1]) {
          htf.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
        } else {
          const last = htf[htf.length - 1];
          last.high = Math.max(last.high, b.high);
          last.low = Math.min(last.low, b.low);
          last.close = b.close;
          last.volume = (last.volume ?? NaN) + (b.volume ?? NaN);
        }
        group.push(htf.length - 1);
      });
    }
  }
  const emaArr = ta.ema(new Series(htf, (b) => b.close), emaLen).toArray().map((v) => v ?? NaN);
  return {
    close: group.map((g) => (g >= 1 ? htf[g - 1].close : NaN)),
    ema: group.map((g) => (g >= 1 ? emaArr[g - 1] : NaN)),
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MirageLiquiditySweepProInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const base = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
  };
  if (n === 0) return { ...base, markers: [], lines: [], labels: [], tables: [] };

  // syminfo.mintick, chart.bg_color, barstate.isconfirmed, timeframe.period
  const MINTICK = mintickOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const tickText = (v: number) => str.tostring(v, 'mintick', MINTICK);
  const fmtPrice = (v: number) => (Number.isNaN(v) ? '—' : tickText(v));
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // ── Theme and colours ──
  const isDark = cfg.theme === 'Dark' ? true : cfg.theme === 'Light' ? false : (color.r(backgroundColorOf(chart)) as number) < 128;
  const C = (c: string, t: number) => String(color.new(c, t));
  const BULL_COLOR = cfg.bullColor;
  const BEAR_COLOR = cfg.bearColor;
  const BULL_TEXT = isDark ? '#00E676' : '#00A152';
  const BEAR_TEXT = isDark ? '#FF5252' : '#D32F2F';
  const NEUTRAL_TEXT = isDark ? '#FFEB3B' : '#F57F17';
  const BULL_LABEL_TEXT = '#004D25';
  const BEAR_LABEL_TEXT = '#FFFFFF';
  const TEXT_COLOR = isDark ? '#E0E0E0' : '#1A1A1A';
  const TEXT_MUTED = isDark ? C('#9E9E9E', 0) : C('#757575', 0);
  const TABLE_BG = isDark ? C('#131722', 5) : C('#FFFFFF', 5);
  const TABLE_ROW_ALT = isDark ? C('#1C2030', 0) : C('#F0F4F8', 0);
  const TABLE_BORDER = isDark ? C('#2A2E39', 0) : C('#D0D0D0', 0);
  const HEADER_TEXT = '#FFFFFF';
  const WM_COLOR = isDark ? C('#FFFFFF', 80) : C('#000000', 80);
  const HEADER_BG_BULL = C('#0F6E56', 0);
  const HEADER_BG_BEAR = C('#A32D2D', 0);
  const HEADER_BG_FLAT = C('#2962FF', 0);
  const SL_COLOR = isDark ? C('#E57373', 0) : C('#B71C1C', 0);
  const TP1_COLOR = isDark ? C('#66BB6A', 30) : C('#388E3C', 30);
  const TP2_COLOR = isDark ? C('#66BB6A', 40) : C('#388E3C', 40);
  const TP3_COLOR = isDark ? C('#66BB6A', 0) : C('#388E3C', 0);
  const ENTRY_COLOR = isDark ? C('#5C8AAE', 0) : C('#34495E', 0);
  const TP_LABEL_COLOR = isDark ? C('#66BB6A', 0) : C('#388E3C', 0);
  const TP_HIT_COLOR = isDark ? C('#4DB6AC', 0) : C('#00695C', 0);
  const BE_COLOR = isDark ? C('#FFA726', 0) : C('#E65100', 0);
  const LABEL_TEXT = isDark ? '#1A1A1A' : '#FFFFFF';
  const FORM_COLOR = isDark ? '#5C8AAE' : '#34495E';
  const LEVEL_COLOR = isDark ? C('#B0BEC5', 30) : C('#546E7A', 30);
  const LIQ_COLOR = isDark ? C('#90A4AE', 40) : C('#607D8B', 40);
  const LIQ_TEXT = isDark ? '#B0BEC5' : '#455A64';
  const EQ_COLOR = isDark ? C('#B0BEC5', 0) : C('#455A64', 0);
  const EQ_TEXT = isDark ? '#ECEFF1' : '#263238';
  const TARGET_COLOR = isDark ? C('#FFCA28', 15) : C('#F9A825', 15);
  const TARGET_TEXT = isDark ? '#FFD54F' : '#F57F17';
  const CLEAR = C(String(color.black), 100);
  const BULL_SWEEP = C(BULL_COLOR, 35);
  const BEAR_SWEEP = C(BEAR_COLOR, 35);
  const BULL_LEVEL = C(BULL_COLOR, 45);
  const BEAR_LEVEL = C(BEAR_COLOR, 45);
  const SL_DIM = C(SL_COLOR, BE_DIM_TRANSP);

  const formatPctFromEntry = (level: number, entry: number): string => {
    if (cfg.showPctOnLabels && !Number.isNaN(level) && !Number.isNaN(entry) && ne(entry, 0)) {
      const pct = ((level - entry) / entry) * 100.0;
      return ' (' + (ge(pct, 0) ? '+' : '') + str.tostring(pct, '#.##') + '%)';
    }
    return '';
  };
  const entryLineStyle = lineStyleFromString(cfg.entryLineStyle);
  const slLineStyle = lineStyleFromString(cfg.slLineStyle);
  const tpLineStyle = lineStyleFromString(cfg.tpLineStyle);
  const labelSize = sizeFromString(cfg.labelFontSize);
  const dashFontSize = sizeFromString(cfg.dashFontSize);
  const dashFontSizeSub = sizeDownFromString(cfg.dashFontSize);

  // ── Warm-up and base calculations ──
  const WARMUP_BARS = Math.max(cfg.swingLen * 2, 50);
  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const riskAtrArr = A(ta.atr(bars, cfg.atrLenRisk)).map((v) => (Number.isNaN(v) ? 0.0 : v));
  const volume = bars.map((b) => b.volume ?? NaN);
  const volSmaRaw = A(ta.sma(Series.fromArray(bars, volume), cfg.volLen));

  // HTF bias: only the score and the dashboard read it, and only when "Use HTF Bias" is on
  const htf = cfg.useHtf ? previousHtfValues(bars, cfg.htfTf, cfg.htfEmaLen, chart) : null;

  // ── Swing memory and minor structure ──
  const ph = A(ta.pivothigh(highS, cfg.swingLen, cfg.swingLen));
  const pl = A(ta.pivotlow(lowS, cfg.swingLen, cfg.swingLen));
  const mph = A(ta.pivothigh(highS, cfg.minorLen, cfg.minorLen));
  const mpl = A(ta.pivotlow(lowS, cfg.minorLen, cfg.minorLen));
  const hiLvl: number[] = [];
  const hiBar: number[] = [];
  const hiUsed: boolean[] = [];
  const loLvl: number[] = [];
  const loBar: number[] = [];
  const loUsed: boolean[] = [];
  let lastMinorHigh = NaN;
  let lastMinorLow = NaN;

  // ── Drawings: the live objects in creation order. The script keeps far fewer than its limits (500 lines, 500
  // labels), so the count limit never deletes one. A deleted object stays in its variable (not na). ──
  const lines = new Set<Ln>();
  const labels = new Set<Lb>();
  const newLine = (x1: number, y1: number, x2: number, y2: number, lineColor: string, style: DrawStyle, width: number): Ln => {
    const l: Ln = { x1, y1, x2, y2, color: lineColor, style, width };
    lines.add(l);
    return l;
  };
  const newLabel = (x: number, y: number, text: string, bg: string, textColor: string, style: LabelStyle, size: PineSize, tooltip?: string): Lb => {
    const l: Lb = { x, y, text, color: bg, textColor, style, size, ...(tooltip !== undefined ? { tooltip } : {}) };
    labels.add(l);
    return l;
  };
  const delLine = (l: Ln | null): void => { if (l) lines.delete(l); };
  const delLabel = (l: Lb | null): void => { if (l) labels.delete(l); };

  const eqLines: Ln[] = [];
  const eqLabels: Array<Lb | null> = [];
  const sigLabels: Lb[] = [];
  const swpLvlLines: Array<Ln | null> = [];
  const swpPenLines: Array<Ln | null> = [];
  let levelLine: Ln | null = null;
  let targetLine: Ln | null = null;
  let targetLabel: Lb | null = null;
  let slLine: Ln | null = null;
  let tp1Line: Ln | null = null;
  let tp2Line: Ln | null = null;
  let tp3Line: Ln | null = null;
  let entryLine: Ln | null = null;
  let slLabel: Lb | null = null;
  let tp1Label: Lb | null = null;
  let tp2Label: Lb | null = null;
  let tp3Label: Lb | null = null;
  let entryLabel: Lb | null = null;

  // ── Signal and trade state ──
  let pendingDir = 0;
  let pendingStartBar = 0;
  let pendingLvl = NaN;
  let pendingWick = NaN;
  let pendingScore = NaN;

  const [effBuf, effTP1, effTP2, effTP3] = cfg.riskPreset === 'Conservative' ? [0.50, 1.0, 2.0, 4.0]
    : cfg.riskPreset === 'Aggressive' ? [0.15, 1.5, 2.5, 4.0]
      : cfg.riskPreset === 'Scalping' ? [0.10, 0.8, 1.5, 2.0]
        : cfg.riskPreset === 'Custom' ? [cfg.slBuffer, cfg.tp1Mult, cfg.tp2Mult, cfg.tp3Mult]
          : [0.25, 1.0, 2.0, 3.0];

  let activeEntry = NaN;
  let activeSL = NaN;
  let activeTP1 = NaN;
  let activeTP2 = NaN;
  let activeTP3 = NaN;
  let activeDir = 0;
  let entryBar = NaN;
  let tp1Reached = false;
  let tp2Reached = false;
  let tp3Reached = false;
  let beActive = false;
  let statWins = 0;
  let statLosses = 0;
  let formStr = '';
  let sweepTrend = 0;
  let lastSigType = '—';
  let lastSigScore = NaN;
  let htfBull = false;
  let htfBear = false;

  const markers: MarkerData[] = [];

  for (let i = 0; i < n; i++) {
    const { open, high, low, close, time } = bars[i];
    const confirmed = i < n - 1 || lastConfirmed;
    const isWarmedUp = i >= WARMUP_BARS;
    const riskAtr = riskAtrArr[i];

    const hasVolume = gt(Number.isNaN(volume[i]) ? 0 : volume[i], 0);
    const volSma = hasVolume ? volSmaRaw[i] : NaN;
    const volRatio = hasVolume && !Number.isNaN(volSma) && gt(volSma, 0) ? volume[i] / volSma : NaN;
    const volComp = cfg.useVolume
      ? (!Number.isNaN(volRatio) ? Math.min(Math.max((volRatio - 1.0) / Math.max(cfg.volMult - 1.0, 0.1), 0.0), 1.0) : 0.5)
      : 0.5;

    const htfClose = htf ? htf.close[i] : NaN;
    const htfEma = htf ? htf.ema[i] : NaN;
    const htfValid = !Number.isNaN(htfClose) && !Number.isNaN(htfEma);
    htfBull = htfValid && gt(htfClose, htfEma);
    htfBear = htfValid && lt(htfClose, htfEma);
    const htfCompBull = !cfg.useHtf ? 0.5 : (htfBull ? 1.0 : 0.0);
    const htfCompBear = !cfg.useHtf ? 0.5 : (htfBear ? 1.0 : 0.0);

    // Sweep quality score 0-100. dir: 1 = bullish (low swept), -1 = bearish (high swept)
    const score = (dir: number, lvl: number, htfComp: number): number => {
      const rng = high - low;
      if (gt(rng, 0) && gt(riskAtr, 0) && !Number.isNaN(lvl)) {
        const wick = dir === 1 ? Math.min(open, close) - low : high - Math.max(open, close);
        const reclaim = dir === 1 ? close - lvl : lvl - close;
        const closePos = (close - low) / rng;
        const cpComp = dir === 1 ? closePos : 1.0 - closePos;
        const wickComp = Math.min(Math.max(wick, 0.0) / riskAtr, 1.0);
        const rclComp = Math.min(Math.max(reclaim, 0.0) / riskAtr, 1.0);
        return (wickComp * 0.30 + rclComp * 0.25 + cpComp * 0.20 + volComp * 0.15 + htfComp * 0.10) * 100.0;
      }
      return 0.0;
    };

    // ── New swings, equal highs / lows ──
    const addSwing = (
      pivot: number, lvls: number[], barsOf: number[], used: boolean[], isHigh: boolean,
    ): void => {
      lvls.push(pivot);
      barsOf.push(i - cfg.swingLen);
      used.push(false);
      if (cfg.showEquals && gt(riskAtr, 0) && lvls.length >= 2) {
        const prev = lvls[lvls.length - 2];
        const prevBar = barsOf[lvls.length - 2];
        if (le(Math.abs(pivot - prev), riskAtr * cfg.eqTol)) {
          const eqLvl = isHigh ? Math.max(pivot, prev) : Math.min(pivot, prev);
          eqLines.push(newLine(prevBar, eqLvl, i - cfg.swingLen, eqLvl, EQ_COLOR, 'solid', 1));
          eqLabels.push(cfg.showLiqLabels
            ? newLabel(i - cfg.swingLen, eqLvl, isHigh ? 'EQH' : 'EQL', CLEAR, EQ_TEXT, isHigh ? 'label_left' : 'label_up', 'tiny')
            : null);
          if (eqLines.length > MAX_EQ_MARKS) {
            delLine(eqLines.shift() ?? null);
            delLabel(eqLabels.shift() ?? null);
          }
        }
      }
      if (lvls.length > MAX_STORED) {
        lvls.shift();
        barsOf.shift();
        used.shift();
      }
    };
    if (!Number.isNaN(ph[i])) addSwing(ph[i], hiLvl, hiBar, hiUsed, true);
    if (!Number.isNaN(pl[i])) addSwing(pl[i], loLvl, loBar, loUsed, false);
    if (!Number.isNaN(mph[i])) lastMinorHigh = mph[i];
    if (!Number.isNaN(mpl[i])) lastMinorLow = mpl[i];

    // ── Sweep detection: from the newest swing to the oldest ──
    let bullSweep = false;
    let bullLvl = NaN;
    let bullLvlBar = NaN;
    let bearSweep = false;
    let bearLvl = NaN;
    let bearLvlBar = NaN;
    for (let idx = loLvl.length - 1; idx >= 0; idx--) {
      if (loUsed[idx]) continue;
      const lvl = loLvl[idx];
      if (i - loBar[idx] <= cfg.lookbackBars) {
        if (lt(close, lvl)) {
          loUsed[idx] = true;
        } else if (lt(low, lvl) && gt(close, lvl)) {
          loUsed[idx] = true;
          if (!bullSweep) {
            bullSweep = true;
            bullLvl = lvl;
            bullLvlBar = loBar[idx];
          }
        }
      }
    }
    for (let idx = hiLvl.length - 1; idx >= 0; idx--) {
      if (hiUsed[idx]) continue;
      const lvl = hiLvl[idx];
      if (i - hiBar[idx] <= cfg.lookbackBars) {
        if (gt(close, lvl)) {
          hiUsed[idx] = true;
        } else if (gt(high, lvl) && lt(close, lvl)) {
          hiUsed[idx] = true;
          if (!bearSweep) {
            bearSweep = true;
            bearLvl = lvl;
            bearLvlBar = hiBar[idx];
          }
        }
      }
    }
    const bullScore = bullSweep ? score(1, bullLvl, htfCompBull) : 0.0;
    const bearScore = bearSweep ? score(-1, bearLvl, htfCompBear) : 0.0;
    const bullQ = bullSweep && ge(bullScore, cfg.minScore) && isWarmedUp && confirmed;
    const bearQ = bearSweep && ge(bearScore, cfg.minScore) && isWarmedUp && confirmed;

    // ── Signal resolution: immediate, or confirmed by a break of the minor structure ──
    let fireBull = false;
    let fireBear = false;
    let sigScore = NaN;
    let anchorExtreme = NaN;
    let sigLvl = NaN;
    if (cfg.requireConfirm) {
      if (pendingDir !== 0 && i - pendingStartBar > cfg.confirmWindow) pendingDir = 0;
      if (bullQ) {
        pendingDir = 1;
        pendingStartBar = i;
        pendingLvl = bullLvl;
        pendingWick = low;
        pendingScore = bullScore;
      }
      if (bearQ) {
        pendingDir = -1;
        pendingStartBar = i;
        pendingLvl = bearLvl;
        pendingWick = high;
        pendingScore = bearScore;
      }
      if (pendingDir === 1 && !Number.isNaN(lastMinorHigh) && gt(close, lastMinorHigh) && confirmed) {
        fireBull = true;
        sigScore = pendingScore;
        anchorExtreme = pendingWick;
        sigLvl = pendingLvl;
        pendingDir = 0;
      }
      if (pendingDir === -1 && !Number.isNaN(lastMinorLow) && lt(close, lastMinorLow) && confirmed) {
        fireBear = true;
        sigScore = pendingScore;
        anchorExtreme = pendingWick;
        sigLvl = pendingLvl;
        pendingDir = 0;
      }
    } else {
      if (bullQ) {
        fireBull = true;
        sigScore = bullScore;
        anchorExtreme = low;
        sigLvl = bullLvl;
      }
      if (bearQ) {
        fireBear = true;
        sigScore = bearScore;
        anchorExtreme = high;
        sigLvl = bearLvl;
      }
    }

    // ── Risk management: one position, stop beyond the wick, break-even, win rate ──
    const sigConflict = fireBull && fireBear;
    const canOpen = activeDir === 0;
    const openLong = fireBull && !sigConflict && gt(riskAtr, 0) && canOpen;
    const openShort = fireBear && !sigConflict && gt(riskAtr, 0) && canOpen;

    if (openLong || openShort) {
      const side = openLong ? 1 : -1;
      activeEntry = close;
      let rawSL = anchorExtreme - side * riskAtr * effBuf;
      let dist = Math.abs(activeEntry - rawSL);
      if (lt(dist, riskAtr * 0.5)) {
        rawSL = activeEntry - side * riskAtr * 0.5;
        dist = riskAtr * 0.5;
      }
      activeSL = rawSL;
      activeTP1 = activeEntry + side * dist * effTP1;
      activeTP2 = activeEntry + side * dist * effTP2;
      activeTP3 = activeEntry + side * dist * effTP3;
      activeDir = side;
      entryBar = i;
      tp1Reached = false;
      tp2Reached = false;
      tp3Reached = false;
      beActive = false;
      sweepTrend = side;
    }

    const effectiveSL = activeSL;
    const canCheckHit = activeDir !== 0 && !Number.isNaN(entryBar) && i > entryBar && confirmed;
    const slHit = canCheckHit && (activeDir === 1 ? le(low, effectiveSL) : ge(high, effectiveSL));
    const tp1Hit = canCheckHit && (activeDir === 1 ? ge(high, activeTP1) : le(low, activeTP1));
    const tp2Hit = canCheckHit && (activeDir === 1 ? ge(high, activeTP2) : le(low, activeTP2));
    const tp3Hit = canCheckHit && (activeDir === 1 ? ge(high, activeTP3) : le(low, activeTP3));
    const tp1FirstTouch = tp1Hit && !tp1Reached && !slHit;
    const tp2FirstTouch = tp2Hit && !tp2Reached && !slHit;
    const tp3FirstTouch = tp3Hit && !tp3Reached && !slHit;
    if (tp1FirstTouch) tp1Reached = true;
    if (tp2FirstTouch) tp2Reached = true;
    if (tp3FirstTouch) tp3Reached = true;
    if (cfg.useBreakEven && tp1FirstTouch && !beActive) {
      activeSL = activeEntry;
      beActive = true;
    }

    // Snapshot before the reset
    const exitEntry = activeEntry;
    const exitTP1 = activeTP1;
    const exitTP2 = activeTP2;
    const exitTP3 = activeTP3;
    const displayTp1Reached = tp1Reached;
    const displayTp2Reached = tp2Reached;
    const displayTp3Reached = tp3Reached;

    // Closure on the stop, the break-even stop or the third target
    if ((slHit || tp3Hit) && activeDir !== 0) {
      const tradeWin = tp1Reached;
      if (tradeWin) statWins += 1;
      else statLosses += 1;
      formStr += tradeWin ? '▰' : '▱';
      if (formStr.length > FORM_LEN) formStr = formStr.substring(formStr.length - FORM_LEN);
      activeDir = 0;
      activeSL = NaN;
      activeTP1 = NaN;
      activeTP2 = NaN;
      activeTP3 = NaN;
      activeEntry = NaN;
      entryBar = NaN;
      tp1Reached = false;
      tp2Reached = false;
      tp3Reached = false;
      beActive = false;
    }

    // Last sweep memory (dashboard)
    if (fireBull) {
      lastSigType = 'Bullish';
      lastSigScore = sigScore;
    }
    if (fireBear) {
      lastSigType = 'Bearish';
      lastSigScore = sigScore;
    }

    // ── Markers: sweep marks and entries (a price series at a bar location: na and 0 draw nothing) ──
    if (cfg.showSweeps && bullQ && low !== 0) markers.push({ time, position: 'belowBar', shape: 'xcross', color: BULL_SWEEP, size: 'tiny' });
    if (cfg.showSweeps && bearQ && high !== 0) markers.push({ time, position: 'aboveBar', shape: 'xcross', color: BEAR_SWEEP, size: 'tiny' });
    if (cfg.showSignals && openLong && low !== 0) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: BULL_COLOR, text: 'Long ▲', textColor: BULL_LABEL_TEXT, size: 'small' });
    }
    if (cfg.showSignals && openShort && high !== 0) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: BEAR_COLOR, text: 'Short ▼', textColor: BEAR_LABEL_TEXT, size: 'small' });
    }

    // Score labels
    if (cfg.showScoreLabels && (fireBull || fireBear)) {
      const lblTxt = str.tostring(sigScore, '#');
      const lblY = fireBull ? low - riskAtr * 0.6 : high + riskAtr * 0.6;
      sigLabels.push(newLabel(i, lblY, lblTxt, CLEAR, fireBull ? BULL_TEXT : BEAR_TEXT, 'none', 'small', 'Sweep quality: ' + lblTxt + '/100'));
      if (sigLabels.length > MAX_SIG_LABELS) delLabel(sigLabels.shift() ?? null);
    }

    // ── Swept level line of the active trade ──
    if ((openLong || openShort) && cfg.showLevel) {
      delLine(levelLine);
      if (!Number.isNaN(sigLvl)) levelLine = newLine(i - 1, sigLvl, i + LINE_UPDATE_BARS, sigLvl, LEVEL_COLOR, 'dotted', 1);
    }
    if (activeDir !== 0 && cfg.showLevel && levelLine) levelLine.x2 = i + LINE_UPDATE_BARS;
    if (activeDir === 0 && cfg.showLevel && levelLine) {
      delLine(levelLine);
      levelLine = null;
    }

    // ── Sweep visuals: the swept level from its swing, and the wick beyond it ──
    const sweepVisual = (lvl: number, lvlBar: number, extreme: number, base45: string, full: string): void => {
      const originBar = Number.isNaN(lvlBar) ? i : lvlBar;
      swpLvlLines.push(cfg.showSweepLine ? newLine(originBar, lvl, i + cfg.sweepLineExtend, lvl, base45, 'dashed', 1) : null);
      swpPenLines.push(cfg.showSweepPen ? newLine(i, lvl, i, extreme, full, 'solid', 3) : null);
    };
    if (bullQ && (cfg.showSweepLine || cfg.showSweepPen)) sweepVisual(bullLvl, bullLvlBar, low, BULL_LEVEL, BULL_COLOR);
    if (bearQ && (cfg.showSweepLine || cfg.showSweepPen)) sweepVisual(bearLvl, bearLvlBar, high, BEAR_LEVEL, BEAR_COLOR);
    if (swpLvlLines.length > cfg.maxSweepVis) {
      delLine(swpLvlLines.shift() ?? null);
      delLine(swpPenLines.shift() ?? null);
    }

    // ── Resting liquidity of the last bar (BSL / SSL) ──
    if (cfg.showLiquidity && i === n - 1) {
      const rx = i + cfg.liqExtend;
      const resting = (lvls: number[], barsOf: number[], used: boolean[], text: string): void => {
        let drawn = 0;
        for (let idx = lvls.length - 1; idx >= 0; idx--) {
          if (drawn < cfg.maxLiq && !used[idx]) {
            newLine(barsOf[idx], lvls[idx], rx, lvls[idx], LIQ_COLOR, 'dotted', 1);
            if (cfg.showLiqLabels) newLabel(rx, lvls[idx], text, CLEAR, LIQ_TEXT, 'label_left', 'tiny');
            drawn += 1;
          }
        }
      };
      resting(hiLvl, hiBar, hiUsed, 'BSL');
      resting(loLvl, loBar, loUsed, 'SSL');
    }

    // ── Target: the nearest opposite liquidity that is not swept, projected on the entry ──
    if (cfg.showTarget && (openLong || openShort)) {
      delLine(targetLine);
      delLabel(targetLabel);
      targetLine = null;
      targetLabel = null;
      let tgt = NaN;
      if (openLong) {
        let best = NaN;
        for (let k = 0; k < hiLvl.length; k++) {
          if (!hiUsed[k] && gt(hiLvl[k], activeEntry) && (Number.isNaN(best) || lt(hiLvl[k], best))) best = hiLvl[k];
        }
        tgt = best;
      }
      if (openShort) {
        let best = NaN;
        for (let k = 0; k < loLvl.length; k++) {
          if (!loUsed[k] && lt(loLvl[k], activeEntry) && (Number.isNaN(best) || gt(loLvl[k], best))) best = loLvl[k];
        }
        tgt = best;
      }
      if (!Number.isNaN(tgt)) {
        targetLine = newLine(i, tgt, i + LINE_FORWARD_BARS, tgt, TARGET_COLOR, 'dashed', 1);
        targetLabel = newLabel(i + LINE_FORWARD_BARS, tgt, '◎ Liquidity Target', CLEAR, TARGET_TEXT, 'label_left', 'small');
      }
    }
    if (cfg.showTarget && activeDir !== 0 && targetLine) {
      targetLine.x2 = i + LINE_UPDATE_BARS;
      if (targetLabel) targetLabel.x = i + LINE_UPDATE_BARS;
    }
    if (activeDir === 0 && targetLine) {
      delLine(targetLine);
      delLabel(targetLabel);
      targetLine = null;
      targetLabel = null;
    }

    // ── Stop / target lines and labels (kept until the next entry) ──
    if ((openLong || openShort) && cfg.showSlTp) {
      for (const l of [slLine, tp1Line, tp2Line, tp3Line, entryLine]) delLine(l);
      for (const l of [slLabel, tp1Label, tp2Label, tp3Label, entryLabel]) delLabel(l);
      const x1 = i;
      const x2 = i + LINE_FORWARD_BARS;
      entryLine = newLine(x1, activeEntry, x2, activeEntry, ENTRY_COLOR, entryLineStyle, 1);
      slLine = newLine(x1, activeSL, x2, activeSL, SL_COLOR, slLineStyle, 2);
      tp1Line = newLine(x1, activeTP1, x2, activeTP1, TP1_COLOR, tpLineStyle, 1);
      tp2Line = newLine(x1, activeTP2, x2, activeTP2, TP2_COLOR, tpLineStyle, 1);
      tp3Line = newLine(x1, activeTP3, x2, activeTP3, TP3_COLOR, tpLineStyle, 1);
      if (cfg.showSlTpLabels) {
        const lblX = x2 + LABEL_OFFSET_BARS;
        const levelText = (v: number) => fmtPrice(v) + formatPctFromEntry(v, activeEntry);
        entryLabel = newLabel(lblX, activeEntry, 'ENTRY ' + tickText(activeEntry), ENTRY_COLOR, LABEL_TEXT, 'label_left', labelSize);
        slLabel = newLabel(lblX, activeSL, 'SL ' + levelText(activeSL), SL_COLOR, LABEL_TEXT, 'label_left', labelSize);
        tp1Label = newLabel(lblX, activeTP1, 'TP1 ' + levelText(activeTP1), TP_LABEL_COLOR, LABEL_TEXT, 'label_left', labelSize);
        tp2Label = newLabel(lblX, activeTP2, 'TP2 ' + levelText(activeTP2), TP_LABEL_COLOR, LABEL_TEXT, 'label_left', labelSize);
        tp3Label = newLabel(lblX, activeTP3, 'TP3 ' + levelText(activeTP3), TP_LABEL_COLOR, LABEL_TEXT, 'label_left', labelSize);
      }
    }

    // A target that was touched: solid line in the hit colour, and a tick in the label
    const markHit = (line: Ln | null, label: Lb | null, reached: boolean, name: string, level: number): void => {
      if (cfg.showSlTp && line && reached) {
        line.color = TP_HIT_COLOR;
        line.style = 'solid';
        if (cfg.showSlTpLabels && label) {
          label.text = name + ' ✓ ' + fmtPrice(level) + formatPctFromEntry(level, exitEntry);
          label.color = TP_HIT_COLOR;
        }
      }
    };
    markHit(tp1Line, tp1Label, displayTp1Reached, 'TP1', exitTP1);
    markHit(tp2Line, tp2Label, displayTp2Reached, 'TP2', exitTP2);
    markHit(tp3Line, tp3Label, displayTp3Reached, 'TP3', exitTP3);

    // Break-even: the stop line and label are dimmed, the entry label says so
    if (cfg.showSlTp && beActive && activeDir !== 0) {
      if (slLine) slLine.color = SL_DIM;
      if (cfg.showSlTpLabels) {
        if (slLabel) slLabel.color = SL_DIM;
        if (entryLabel) {
          entryLabel.text = 'ENTRY ' + tickText(activeEntry) + '  → SL (BE)';
          entryLabel.color = BE_COLOR;
        }
      }
    }

    // The lines of the active trade follow the current bar
    if (activeDir !== 0 && cfg.showSlTp && slLine) {
      const newX2 = i + LINE_UPDATE_BARS;
      const newLblX = newX2 + LABEL_OFFSET_BARS;
      for (const l of [slLine, tp1Line, tp2Line, tp3Line, entryLine]) if (l) l.x2 = newX2;
      if (cfg.showSlTpLabels && slLabel) {
        for (const l of [slLabel, tp1Label, tp2Label, tp3Label, entryLabel]) if (l) l.x = newLblX;
      }
    }
  }

  // ── Dashboard of the last bar ──
  const tables: TableData[] = [];
  if (cfg.showDash) {
    const trendWord = sweepTrend === 1 ? 'Bullish' : sweepTrend === -1 ? 'Bearish' : 'Neutral';
    const trendCol = sweepTrend === 1 ? BULL_TEXT : sweepTrend === -1 ? BEAR_TEXT : NEUTRAL_TEXT;
    const headerBg = sweepTrend === 1 ? HEADER_BG_BULL : sweepTrend === -1 ? HEADER_BG_BEAR : HEADER_BG_FLAT;
    const biasStr = !cfg.useHtf ? 'Off' : (htfBull ? 'Bullish' : htfBear ? 'Bearish' : '—');
    const biasCol = !cfg.useHtf ? TEXT_MUTED : (htfBull ? BULL_TEXT : htfBear ? BEAR_TEXT : TEXT_MUTED);
    const signalStr = activeDir === 1 ? 'LONG' : activeDir === -1 ? 'SHORT' : 'Wait';
    const signalCol = activeDir === 1 ? BULL_TEXT : activeDir === -1 ? BEAR_TEXT : TEXT_MUTED;
    const lastSweepStr = lastSigType === '—' ? '—' : lastSigType + ' ' + (Number.isNaN(lastSigScore) ? '' : str.tostring(lastSigScore, '#'));
    const lastSweepCol = lastSigType === 'Bullish' ? BULL_TEXT : lastSigType === 'Bearish' ? BEAR_TEXT : TEXT_MUTED;

    const currentRR = activeDir !== 0 ? effTP1 : 0.0;
    const slDistPct = activeDir !== 0 && !Number.isNaN(activeEntry) && ne(activeEntry, 0)
      ? (Math.abs(activeEntry - activeSL) / activeEntry) * 100 : 0.0;
    const level = (v: number, reached: boolean, mark: string) => (activeDir !== 0 && !Number.isNaN(v) ? (reached ? mark : '') + tickText(v) : '—');
    const dashSL = level(activeSL, beActive, 'BE @ ');
    const dashTP1 = level(activeTP1, tp1Reached, '✓ ');
    const dashTP2 = level(activeTP2, tp2Reached, '✓ ');
    const dashTP3 = level(activeTP3, tp3Reached, '✓ ');
    const dashSlCol = beActive ? BE_COLOR : SL_COLOR;
    const tpCol = (reached: boolean) => (reached ? TP_HIT_COLOR : TP_LABEL_COLOR);
    const dashRR = str.tostring(currentRR, '#.#') + 'R';
    const dashDist = str.tostring(slDistPct, '#.##') + '%';
    const rrColor = ge(currentRR, 1.5) ? BULL_TEXT : ge(currentRR, 1.0) ? NEUTRAL_TEXT : BEAR_TEXT;
    const distColor = gt(slDistPct, 3.0) ? BEAR_TEXT : gt(slDistPct, 1.0) ? NEUTRAL_TEXT : BULL_TEXT;

    const closedTrades = statWins + statLosses;
    const winRate = closedTrades > 0 ? (statWins / closedTrades) * 100.0 : 0.0;
    const dashWL = str.tostring(statWins) + ' / ' + str.tostring(statLosses);
    const dashWR = closedTrades > 0 ? str.tostring(winRate, '#.#') + '%  ' + buildGauge(winRate, 100, 8) : '—';
    const wrCol = closedTrades === 0 ? TEXT_MUTED : ge(winRate, 55.0) ? BULL_TEXT : ge(winRate, 45.0) ? NEUTRAL_TEXT : BEAR_TEXT;
    const dashForm = formStr === '' ? '—' : formStr;

    const marketRows = cfg.showMarketSec ? 6 : 0;
    const tradeRows = cfg.showTradeSec ? (activeDir !== 0 ? 7 : 2) : 0;
    const statsRows = cfg.showStatsSec ? 5 : 0;
    const totalRows = 2 + marketRows + tradeRows + statsRows;

    const cells: TableCellData[] = [];
    const merges: TableMergeData[] = [];
    let r = 0;
    let zeb = false;
    // a cell over both columns: header, section divider, footer
    const wide = (text: string, textColor: string, textSize: PineSize, bgColor?: string): void => {
      cells.push({ column: 0, row: r, text, textColor, textSize, textHAlign: 'center', ...(bgColor !== undefined ? { bgColor } : {}) });
      merges.push({ startColumn: 0, startRow: r, endColumn: 1, endRow: r });
      r += 1;
    };
    // a name / value row with alternating background
    const row = (name: string, value: string, valueColor: string, tooltip?: string): void => {
      const bgColor = zeb ? TABLE_ROW_ALT : TABLE_BG;
      cells.push({ column: 0, row: r, text: name, textColor: TEXT_MUTED, textSize: dashFontSize, bgColor, ...(tooltip !== undefined ? { tooltip } : {}) });
      cells.push({ column: 1, row: r, text: value, textColor: valueColor, textSize: dashFontSize, bgColor });
      r += 1;
      zeb = !zeb;
    };

    wide('◆ Mirage · ' + trendWord, HEADER_TEXT, dashFontSize, headerBg);
    if (cfg.showMarketSec) {
      wide('— Market —', TEXT_MUTED, dashFontSizeSub, TABLE_ROW_ALT);
      row('Trend', trendWord, trendCol, 'Direction of the most recent qualifying sweep signal.');
      row('HTF Bias', biasStr, biasCol, 'Higher-timeframe EMA bias (soft score component).');
      row('Signal', signalStr, signalCol, 'Current position. A new trade opens only while flat.');
      row('Last sweep', lastSweepStr, lastSweepCol, 'Most recent qualifying sweep + its 0-100 score.');
      row('Timeframe', chartTimeframe(bars, chart), TEXT_COLOR);
    }
    if (cfg.showTradeSec) {
      wide('— Trade —', TEXT_MUTED, dashFontSizeSub, TABLE_ROW_ALT);
      if (activeDir !== 0) {
        row('SL', dashSL, dashSlCol, "Active stop. 'BE @' = moved to entry after TP1.");
        row('TP1', dashTP1, tpCol(tp1Reached), '✓ = touched (counts as a win).');
        row('TP2', dashTP2, tpCol(tp2Reached));
        row('TP3', dashTP3, tpCol(tp3Reached), 'Final target. Touching it closes the trade.');
        row('R:R (TP1)', dashRR, rrColor, 'Reward-to-risk at TP1.');
        row('SL Dist %', dashDist, distColor, 'Stop distance as % of entry (not position risk).');
      } else {
        wide('Flat · waiting for sweep', TEXT_MUTED, dashFontSize, zeb ? TABLE_ROW_ALT : TABLE_BG);
        zeb = !zeb;
      }
    }
    if (cfg.showStatsSec) {
      wide('— Stats —', TEXT_MUTED, dashFontSizeSub, TABLE_ROW_ALT);
      row('Trades', str.tostring(closedTrades), TEXT_COLOR, 'Closed trades this session (wins + losses).');
      row('W / L', dashWL, TEXT_COLOR);
      row('Win rate', dashWR, wrCol, 'Wins / closed. A trade is a WIN once TP1 is touched.');
      row('Form', dashForm, FORM_COLOR, 'Last ' + str.tostring(FORM_LEN) + ' closed trades.  ▰ = win · ▱ = loss (newest right).');
    }
    wide('Mirage LSP · ' + INDICATOR_VERSION, TEXT_MUTED, dashFontSizeSub);

    tables.push({
      position: cornerOf(cfg.dashPos), columns: 2, rows: totalRows, cells, merges,
      bgColor: TABLE_BG, borderColor: TABLE_BORDER, borderWidth: 1, frameColor: TABLE_BORDER, frameWidth: 1,
    });
  }

  // ── Watermark ──
  if (cfg.showWatermark) {
    tables.push({
      position: 'bottom_center', columns: 1, rows: 1,
      cells: [{ column: 0, row: 0, text: 'WillyAlgoTrader', textColor: WM_COLOR, textSize: 'normal', textHAlign: 'center', bgColor: CLEAR }],
      bgColor: CLEAR, borderColor: CLEAR, borderWidth: 0, frameColor: CLEAR, frameWidth: 0,
    });
  }

  // ── Output ──
  const interval = barInterval(bars);
  const X = (index: number) => barTime(bars, index, interval);
  return {
    ...base,
    markers,
    lines: [...lines].map((l) => ({ time1: X(l.x1), price1: l.y1, time2: X(l.x2), price2: l.y2, color: l.color, width: l.width, style: l.style })),
    labels: [...labels].map((l) => ({
      time: X(l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style, size: l.size,
      ...(l.tooltip !== undefined ? { tooltip: l.tooltip } : {}),
    })),
    tables,
  };
}

export const MirageLiquiditySweepPro = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
