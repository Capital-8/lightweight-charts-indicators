/**
 * Self-Aware Trend System [WillyAlgoTrader]
 *
 * An adaptive SuperTrend with a trade model and two report tables.
 * - Trend Quality Index (TQI, 0..1) on every bar: a weighted mean of the efficiency ratio of the source, a
 *   volatility factor (ATR against its average, or the volume z-score), the position of the close in its recent
 *   range, and the share of bars that move with the change of the window.
 * - Bands: source -/+ multiplier x ATR (the ATR is scaled by 0.5 + 0.5 x efficiency ratio). The multiplier widens
 *   when the efficiency ratio and the TQI are low; the side of the trend is tighter and the other side wider; the
 *   multipliers are smoothed. The bands ratchet as a SuperTrend. The trend flips when the close breaks the band of
 *   the previous bar, or when the TQI collapses from above the high level to below the low level ("character flip").
 * - Trade model: one position at a time, opened on a flip after the warm-up. Stop behind the last pivot (buffer and
 *   cap in ATR), three targets in multiples of the risk (fixed, or scaled by TQI and volatility), one third closed at
 *   each target, exit on the stop (first on an ambiguous bar), on the opposite trend or on the timeout. The results
 *   feed the statistics and, when enabled, the auto-calibration of "Quality Influence".
 * - Outputs: the SuperTrend line (transparency from the TQI), the optional trend background, a label on each
 *   signal, the entry / stop / target lines and labels of the latest trade, the dashboard, the trader card and the
 *   watermark (tables of the last bar). At most 500 labels are kept.
 *
 * Chart context (optional third argument):
 * - `chart.mintick`: the symbol tick of the price levels and of the "mintick" texts. Without it 0.01. With another
 *   tick the stop, the targets, their texts and, on some bars, the trades differ.
 * - `chart.timezone`: the exchange time zone of the times of the trader card. Without it UTC.
 * - `chart.backgroundColor`: theme "Auto" is dark when the red channel of the chart background is below 128.
 *   Without it the dark theme.
 * - `chart.lastBarConfirmed`: when the last bar is still open, there is no exit and no entry on it and the trader
 *   card says "current bar provisional". Without it every bar is taken as closed.
 * - `chart.timeframe`: the chart timeframe, for the preset "Auto". Without it, it is taken from the bars.
 *
 * Limit of the port: the alerts (22 alert conditions, the event messages and their trade id) give no output.
 *
 * Reference: "Self-Aware Trend System [WillyAlgoTrader]" by WillyAlgoTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, math, str, color, timeframe, Series, getSourceSeries, barInterval, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData, LabelData, LabelStyle, LineDrawingData, TableCellData, TableData, TablePosition } from '../types';
import { chartTimeframe } from '../anchor-period';
import { backgroundColorOf, lastBarConfirmedOf, mintickOf, timezoneOf, type ChartContext } from '../chart-context';

type Preset = 'Auto' | 'Custom' | 'Scalping' | 'Default' | 'Swing' | 'Crypto 24/7';
type Corner = 'Top Left' | 'Top Right' | 'Bottom Left' | 'Bottom Right' | 'Middle Right';

export interface SelfAwareTrendSystemInputs {
  preset: Preset;
  atrLen: number;
  baseMult: number;
  source: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'hlcc4';
  useAdaptive: boolean;
  erLength: number;
  adaptStrength: number;
  atrBaselineLen: number;
  useTqi: boolean;
  qualityStrength: number;
  qualityCurve: number;
  multSmooth: boolean;
  useAsymBands: boolean;
  asymStrength: number;
  useEffAtr: boolean;
  useCharFlip: boolean;
  charFlipMinAge: number;
  charFlipHigh: number;
  charFlipLow: number;
  tqiWeightEr: number;
  tqiWeightVol: number;
  tqiWeightStruct: number;
  tqiWeightMom: number;
  tqiStructLen: number;
  tqiMomLen: number;
  useStructure: boolean;
  pivotLen: number;
  useRsi: boolean;
  rsiLen: number;
  rsiOB: number;
  rsiOS: number;
  rsiLookback: number;
  useVol: boolean;
  volLen: number;
  showRisk: boolean;
  slAtrMult: number;
  slMaxDist: number;
  tpMode: 'Fixed' | 'Dynamic';
  tp1R: number;
  tp2R: number;
  tp3R: number;
  dynTpTqiWeight: number;
  dynTpVolWeight: number;
  dynTpMinScale: number;
  dynTpMaxScale: number;
  dynTpFloorR1: number;
  dynTpCeilR3: number;
  labelOffset: number;
  showHits: boolean;
  tradeMaxAge: number;
  useAutoCalib: boolean;
  calibWindow: number;
  calibBadR: number;
  calibGoodR: number;
  calibStepQ: number;
  calibCooldown: number;
  calibMinQ: number;
  calibMaxQ: number;
  alertInstance: string;
  feePct: number;
  slippageTicks: number;
  minRiskTicks: number;
  pivotMaxAge: number;
  tqiVolMode: 'ATR regime' | 'Volume activity';
  showTraderCard: boolean;
  traderPos: Corner;
  lateEntryR: number;
  chopWindow: number;
  chopCount: number;
  theme: 'Auto' | 'Dark' | 'Light';
  showBands: boolean;
  showTqiColor: boolean;
  showSignals: boolean;
  showBg: boolean;
  showWatermark: boolean;
  showDash: boolean;
  showTqiBreakdown: boolean;
  showBreakdown: boolean;
  showPerf: boolean;
  dashPos: Corner;
  bullColor: string;
  bearColor: string;
  slColor: string;
  tpColor: string;
  enableAlerts: boolean;
  webhook: boolean;
}

export const defaultInputs: SelfAwareTrendSystemInputs = {
  preset: 'Auto',
  atrLen: 13,
  baseMult: 2.0,
  source: 'close',
  useAdaptive: true,
  erLength: 20,
  adaptStrength: 0.5,
  atrBaselineLen: 100,
  useTqi: true,
  qualityStrength: 0.4,
  qualityCurve: 1.5,
  multSmooth: true,
  useAsymBands: true,
  asymStrength: 0.5,
  useEffAtr: true,
  useCharFlip: true,
  charFlipMinAge: 5,
  charFlipHigh: 0.55,
  charFlipLow: 0.25,
  tqiWeightEr: 0.35,
  tqiWeightVol: 0.20,
  tqiWeightStruct: 0.25,
  tqiWeightMom: 0.20,
  tqiStructLen: 20,
  tqiMomLen: 10,
  useStructure: true,
  pivotLen: 3,
  useRsi: true,
  rsiLen: 14,
  rsiOB: 70,
  rsiOS: 30,
  rsiLookback: 20,
  useVol: true,
  volLen: 20,
  showRisk: true,
  slAtrMult: 1.5,
  slMaxDist: 4.0,
  tpMode: 'Fixed',
  tp1R: 1.0,
  tp2R: 2.0,
  tp3R: 3.0,
  dynTpTqiWeight: 0.6,
  dynTpVolWeight: 0.4,
  dynTpMinScale: 0.5,
  dynTpMaxScale: 2.0,
  dynTpFloorR1: 0.5,
  dynTpCeilR3: 8.0,
  labelOffset: 10,
  showHits: true,
  tradeMaxAge: 100,
  useAutoCalib: false,
  calibWindow: 20,
  calibBadR: 0.0,
  calibGoodR: 0.7,
  calibStepQ: 0.05,
  calibCooldown: 5,
  calibMinQ: 0.1,
  calibMaxQ: 0.9,
  alertInstance: 'default',
  feePct: 0.0,
  slippageTicks: 0,
  minRiskTicks: 2,
  pivotMaxAge: 100,
  tqiVolMode: 'ATR regime',
  showTraderCard: true,
  traderPos: 'Bottom Left',
  lateEntryR: 0.5,
  chopWindow: 20,
  chopCount: 4,
  theme: 'Auto',
  showBands: true,
  showTqiColor: true,
  showSignals: true,
  showBg: false,
  showWatermark: true,
  showDash: true,
  showTqiBreakdown: true,
  showBreakdown: false,
  showPerf: true,
  dashPos: 'Top Right',
  bullColor: '#00E676',
  bearColor: '#FF5252',
  slColor: '#FF1744',
  tpColor: '#00E676',
  enableAlerts: true,
  webhook: false,
};

const GRP_MAIN = '⚙️ Main Settings';
const GRP_ADAPT = '🧠 Adaptive Engine';
const GRP_TQI = '📐 Trend Quality Engine';
const GRP_FILTER = '🔍 Score Components (not entry filters)';
const GRP_RISK = '🎯 Risk Management';
const GRP_DYN_TP = '🎯 Dynamic TP Settings';
const GRP_LEARN = '🤖 Self-Learning';
const GRP_VISUAL = '🎨 Visual';
const GRP_DASH = '📊 Dashboard';
const GRP_ALERT = '🔔 Alerts';
const GRP_COLORS = '🎨 Colors';
const GRP_MODEL = '🧾 Model & Trader Card';
const CORNERS = ['Top Left', 'Top Right', 'Bottom Left', 'Bottom Right', 'Middle Right'];

export const inputConfig: InputConfig[] = [
  { id: 'preset', type: 'string', title: 'Preset', defval: 'Auto', options: ['Auto', 'Custom', 'Scalping', 'Default', 'Swing', 'Crypto 24/7'], group: GRP_MAIN, tooltip: 'Quick presets that override key parameters.' },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 13, min: 5, max: 100, group: GRP_MAIN },
  { id: 'baseMult', type: 'float', title: 'Base Band Width (xATR)', defval: 2.0, min: 0.5, max: 5.0, step: 0.1, group: GRP_MAIN },
  { id: 'source', type: 'source', title: 'Source', defval: 'close', group: GRP_MAIN },

  { id: 'useAdaptive', type: 'bool', title: 'Enable Vol-Adaptive Bands (legacy ER)', defval: true, group: GRP_ADAPT, tooltip: 'Legacy linear ER modulation. Kept for backwards compat — TQI Engine below is recommended.' },
  { id: 'erLength', type: 'int', title: 'Efficiency Window', defval: 20, min: 5, max: 100, group: GRP_ADAPT },
  { id: 'adaptStrength', type: 'float', title: 'Adaptation Strength', defval: 0.5, min: 0.0, max: 1.0, step: 0.05, group: GRP_ADAPT },
  { id: 'atrBaselineLen', type: 'int', title: 'ATR Baseline Length', defval: 100, min: 20, max: 500, group: GRP_ADAPT },

  { id: 'useTqi', type: 'bool', title: 'Enable Trend Quality Engine', defval: true, group: GRP_TQI, tooltip: 'Master switch. Computes continuous Trend Quality Index (TQI 0..1) each bar from 4 factors. Modulates band width non-linearly.' },
  { id: 'qualityStrength', type: 'float', title: 'Quality Influence', defval: 0.4, min: 0.0, max: 1.0, step: 0.05, group: GRP_TQI, tooltip: 'How aggressively TQI compresses/expands bands. 0 = no effect, 1 = maximum.' },
  { id: 'qualityCurve', type: 'float', title: 'Quality Curve Power', defval: 1.5, min: 1.0, max: 3.0, step: 0.1, group: GRP_TQI, tooltip: 'Non-linearity. 1.0 = linear, >1 = bands expand slowly for mild quality drops, rapidly for severe ones.' },
  { id: 'multSmooth', type: 'bool', title: 'Smooth Adaptive Multipliers', defval: true, group: GRP_TQI, tooltip: 'EMA-smooths band multipliers before applying ratchet logic. Reduces abrupt multiplier changes; the band ratchet still applies.' },
  { id: 'useAsymBands', type: 'bool', title: 'Asymmetric Bands', defval: true, group: GRP_TQI, tooltip: 'Active side (in direction of trend) tightens, passive side widens. Creates ratchet-with-leverage effect in strong trends.' },
  { id: 'asymStrength', type: 'float', title: 'Asymmetry Strength', defval: 0.5, min: 0.0, max: 1.0, step: 0.05, group: GRP_TQI },
  { id: 'useEffAtr', type: 'bool', title: 'Efficiency-Weighted ATR', defval: true, group: GRP_TQI, tooltip: 'Scale ATR by (0.5 + 0.5*ER). Clean trending volatility counts full; noisy volatility is halved.' },
  { id: 'useCharFlip', type: 'bool', title: 'Character-Flip Detection', defval: true, group: GRP_TQI, tooltip: 'Allow SuperTrend to flip on quality collapse, not just price break. TQI must collapse from above High threshold (anywhere within the lookback window) to below Low threshold, with price already moving against the trend.' },
  { id: 'charFlipMinAge', type: 'int', title: 'Char-Flip: Min Trend Age / Window', defval: 5, min: 1, max: 50, group: GRP_TQI, tooltip: 'Minimum bars current trend must hold before char-flip can fire. Also defines the TQI collapse lookback window (min 3 bars).' },
  { id: 'charFlipHigh', type: 'float', title: 'Char-Flip: High TQI', defval: 0.55, min: 0.3, max: 0.9, step: 0.05, group: GRP_TQI },
  { id: 'charFlipLow', type: 'float', title: 'Char-Flip: Low TQI', defval: 0.25, min: 0.0, max: 0.5, step: 0.05, group: GRP_TQI },
  { id: 'tqiWeightEr', type: 'float', title: 'Weight: Efficiency', defval: 0.35, min: 0.0, max: 1.0, step: 0.05, group: GRP_TQI },
  { id: 'tqiWeightVol', type: 'float', title: 'Weight: Selected Vol Factor', defval: 0.20, min: 0.0, max: 1.0, step: 0.05, group: GRP_TQI },
  { id: 'tqiWeightStruct', type: 'float', title: 'Weight: Structure', defval: 0.25, min: 0.0, max: 1.0, step: 0.05, group: GRP_TQI },
  { id: 'tqiWeightMom', type: 'float', title: 'Weight: Momentum Persist', defval: 0.20, min: 0.0, max: 1.0, step: 0.05, group: GRP_TQI },
  { id: 'tqiStructLen', type: 'int', title: 'Structure Window', defval: 20, min: 5, max: 100, group: GRP_TQI, tooltip: 'Lookback for structural price-position calculation.' },
  { id: 'tqiMomLen', type: 'int', title: 'Momentum Persist Window', defval: 10, min: 3, max: 50, group: GRP_TQI },

  { id: 'useStructure', type: 'bool', title: 'Use Structure in Score (display)', defval: true, group: GRP_FILTER },
  { id: 'pivotLen', type: 'int', title: 'Pivot Strength', defval: 3, min: 2, max: 10, group: GRP_FILTER },
  { id: 'useRsi', type: 'bool', title: 'Use RSI in Score (display)', defval: true, group: GRP_FILTER },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, min: 5, max: 50, group: GRP_FILTER },
  { id: 'rsiOB', type: 'int', title: 'RSI Overbought', defval: 70, min: 55, max: 90, group: GRP_FILTER },
  { id: 'rsiOS', type: 'int', title: 'RSI Oversold', defval: 30, min: 10, max: 45, group: GRP_FILTER },
  { id: 'rsiLookback', type: 'int', title: 'RSI Memory (bars)', defval: 20, min: 3, max: 100, group: GRP_FILTER },
  { id: 'useVol', type: 'bool', title: 'Use Volume in Score (display)', defval: true, group: GRP_FILTER },
  { id: 'volLen', type: 'int', title: 'Volume Z Window', defval: 20, min: 5, max: 100, group: GRP_FILTER },

  { id: 'showRisk', type: 'bool', title: 'Show TP/SL Levels', defval: true, group: GRP_RISK },
  { id: 'slAtrMult', type: 'float', title: 'SL Buffer (xATR)', defval: 1.5, min: 0.3, max: 5.0, step: 0.1, group: GRP_RISK },
  { id: 'slMaxDist', type: 'float', title: 'Max SL Distance (xATR)', defval: 4.0, min: 1.0, max: 15.0, step: 0.5, group: GRP_RISK, tooltip: 'Hard cap on stop distance from entry. Protects against stale/far pivots producing oversized risk per trade. The effective cap is never tighter than SL Buffer.' },
  { id: 'tpMode', type: 'string', title: 'TP Mode', defval: 'Fixed', options: ['Fixed', 'Dynamic'], group: GRP_RISK, tooltip: 'Fixed: classic fixed R-multiples.\nDynamic: TP levels adapt to TQI and volatility regime. High TQI + trending = wider targets; low TQI + choppy = tighter targets.' },
  { id: 'tp1R', type: 'float', title: 'TP1 (R-multiple)', defval: 1.0, min: 0.5, max: 10.0, step: 0.1, group: GRP_RISK },
  { id: 'tp2R', type: 'float', title: 'TP2 (R-multiple)', defval: 2.0, min: 0.5, max: 10.0, step: 0.1, group: GRP_RISK },
  { id: 'tp3R', type: 'float', title: 'TP3 (R-multiple)', defval: 3.0, min: 0.5, max: 10.0, step: 0.1, group: GRP_RISK },

  { id: 'dynTpTqiWeight', type: 'float', title: 'TQI Influence on TP', defval: 0.6, min: 0.0, max: 1.0, step: 0.05, group: GRP_DYN_TP, tooltip: '⚠ These settings only apply when TP Mode = Dynamic.\nHow much TQI affects target expansion. 0 = TQI ignored, 1 = full influence.' },
  { id: 'dynTpVolWeight', type: 'float', title: 'Volatility Influence on TP', defval: 0.4, min: 0.0, max: 1.0, step: 0.05, group: GRP_DYN_TP, tooltip: 'How much vol regime affects targets. High vol = wider targets.' },
  { id: 'dynTpMinScale', type: 'float', title: 'Min TP Scale', defval: 0.5, min: 0.2, max: 1.0, step: 0.05, group: GRP_DYN_TP, tooltip: 'Floor multiplier — TPs never shrink below base × this value. Prevents absurdly tight targets in chop.' },
  { id: 'dynTpMaxScale', type: 'float', title: 'Max TP Scale', defval: 2.0, min: 1.0, max: 4.0, step: 0.1, group: GRP_DYN_TP, tooltip: 'Ceiling multiplier — TPs never expand beyond base × this value. Prevents unreachable targets.' },
  { id: 'dynTpFloorR1', type: 'float', title: 'TP1 Absolute Floor (R)', defval: 0.5, min: 0.2, max: 2.0, step: 0.1, group: GRP_DYN_TP, tooltip: 'TP1 will never go below this R value regardless of scaling. TP2/TP3 floors scale proportionally and are capped by the absolute ceiling.' },
  { id: 'dynTpCeilR3', type: 'float', title: 'TP Absolute Ceiling (R)', defval: 8.0, min: 2.0, max: 20.0, step: 0.5, group: GRP_DYN_TP, tooltip: 'No TP level will ever exceed this R value regardless of scaling.' },

  { id: 'labelOffset', type: 'int', title: 'Label Offset (bars)', defval: 10, min: 10, max: 100, group: GRP_RISK },
  { id: 'showHits', type: 'bool', title: 'Mark TP Hits (visual)', defval: true, group: GRP_RISK },
  { id: 'tradeMaxAge', type: 'int', title: 'Trade Timeout (bars)', defval: 100, min: 10, max: 500, group: GRP_RISK },

  { id: 'useAutoCalib', type: 'bool', title: 'Enable Auto-Calibration (experimental)', defval: false, group: GRP_LEARN, tooltip: 'EXPERIMENTAL hill-climbing: on poor edge, Quality Influence is shifted by one step; if the previous shift made avgR worse, the direction is reversed. On good edge the search is frozen. Note: changing ANY input fully recalculates the script and resets learning memory.' },
  { id: 'calibWindow', type: 'int', title: 'Calibration Window', defval: 20, min: 5, max: 100, group: GRP_LEARN },
  { id: 'calibBadR', type: 'float', title: 'Bad-Edge Threshold (R)', defval: 0.0, min: -2.0, max: 1.0, step: 0.1, group: GRP_LEARN },
  { id: 'calibGoodR', type: 'float', title: 'Good-Edge Threshold (R)', defval: 0.7, min: 0.0, max: 5.0, step: 0.1, group: GRP_LEARN },
  { id: 'calibStepQ', type: 'float', title: 'Quality Step', defval: 0.05, min: 0.01, max: 0.3, step: 0.01, group: GRP_LEARN },
  { id: 'calibCooldown', type: 'int', title: 'Calibration Cooldown (signals)', defval: 5, min: 1, max: 50, group: GRP_LEARN },
  { id: 'calibMinQ', type: 'float', title: 'Quality Floor', defval: 0.1, min: 0.0, max: 1.0, step: 0.05, group: GRP_LEARN },
  { id: 'calibMaxQ', type: 'float', title: 'Quality Ceiling', defval: 0.9, min: 0.0, max: 1.0, step: 0.05, group: GRP_LEARN },

  { id: 'alertInstance', type: 'string', title: 'Alert instance ID', defval: 'default', group: GRP_ALERT, tooltip: 'Use a different ID for each running settings profile. Webhook schema v2 sends an ordered events array; update your receiver before enabling it.' },
  { id: 'feePct', type: 'float', title: 'Commission per fill (%)', defval: 0.0, min: 0.0, max: 5.0, step: 0.01, group: GRP_MODEL, tooltip: 'Applied to entry and each exited fraction. 0 = no commission. Linear price-return model; excludes funding and inverse contracts.' },
  { id: 'slippageTicks', type: 'int', title: 'Market slippage (ticks)', defval: 0, min: 0, max: 1000, group: GRP_MODEL, tooltip: 'Adverse slippage on entry, SL, flip and timeout. TP fills remain at their limit. Stop gaps fill at the worse of open and stop, plus slippage.' },
  { id: 'minRiskTicks', type: 'int', title: 'Minimum initial risk (ticks)', defval: 2, min: 1, max: 10000, group: GRP_MODEL },
  { id: 'pivotMaxAge', type: 'int', title: 'Maximum pivot age (bars)', defval: 100, min: 5, max: 5000, group: GRP_MODEL },
  { id: 'tqiVolMode', type: 'string', title: 'TQI volatility factor', defval: 'ATR regime', options: ['ATR regime', 'Volume activity'], group: GRP_TQI, tooltip: 'Explicit source; no silent switch between volume and volatility. Missing volume is excluded from TQI weights.' },
  { id: 'showTraderCard', type: 'bool', title: 'Show trader card', defval: true, group: GRP_MODEL },
  { id: 'traderPos', type: 'string', title: 'Trader card position', defval: 'Bottom Left', options: CORNERS, group: GRP_MODEL },
  { id: 'lateEntryR', type: 'float', title: 'Late entry warning (initial R)', defval: 0.5, min: 0.0, max: 10.0, step: 0.1, group: GRP_MODEL },
  { id: 'chopWindow', type: 'int', title: 'Flip count window', defval: 20, min: 5, max: 200, group: GRP_MODEL },
  { id: 'chopCount', type: 'int', title: 'Frequent flips warning', defval: 4, min: 2, max: 50, group: GRP_MODEL },

  { id: 'theme', type: 'string', title: 'Theme', defval: 'Auto', options: ['Auto', 'Dark', 'Light'], group: GRP_VISUAL },
  { id: 'showBands', type: 'bool', title: 'Show SuperTrend Bands', defval: true, group: GRP_VISUAL },
  { id: 'showTqiColor', type: 'bool', title: 'Color Line by TQI', defval: true, group: GRP_VISUAL, tooltip: 'Line transparency reflects current TQI. Bright = high quality, faded = low quality.' },
  { id: 'showSignals', type: 'bool', title: 'Show Signal Labels', defval: true, group: GRP_VISUAL },
  { id: 'showBg', type: 'bool', title: 'Show Trend Background', defval: false, group: GRP_VISUAL },
  { id: 'showWatermark', type: 'bool', title: 'Show Watermark', defval: true, group: GRP_VISUAL },

  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: true, group: GRP_DASH },
  { id: 'showTqiBreakdown', type: 'bool', title: 'Show TQI Breakdown', defval: true, group: GRP_DASH },
  { id: 'showBreakdown', type: 'bool', title: 'Show Score Breakdown (raw contributions)', defval: false, group: GRP_DASH },
  { id: 'showPerf', type: 'bool', title: 'Show Performance Stats', defval: true, group: GRP_DASH },
  { id: 'dashPos', type: 'string', title: 'Dashboard Position', defval: 'Top Right', options: CORNERS, group: GRP_DASH },

  { id: 'bullColor', type: 'color', title: 'Bull', defval: '#00E676', inline: 'c1', group: GRP_COLORS },
  { id: 'bearColor', type: 'color', title: 'Bear', defval: '#FF5252', inline: 'c1', group: GRP_COLORS },
  { id: 'slColor', type: 'color', title: 'SL', defval: '#FF1744', inline: 'c2', group: GRP_COLORS },
  { id: 'tpColor', type: 'color', title: 'TP', defval: '#00E676', inline: 'c2', group: GRP_COLORS },

  { id: 'enableAlerts', type: 'bool', title: 'Enable Alert Signals', defval: true, group: GRP_ALERT },
  { id: 'webhook', type: 'bool', title: 'Webhook JSON v2 (events array)', defval: false, group: GRP_ALERT, tooltip: 'Applies to combined alert() calls only.\nThe individual alertcondition() alerts (Buy/Sell variants, TP/SL events, timeout, flip-exit, char-flip)\nuse the message you type into the alert dialog.' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SuperTrend', color: '#00E676', lineWidth: 2 },
];

export const metadata = {
  title: 'Self-Aware Trend System [WillyAlgoTrader]',
  shortTitle: 'SATS',
  overlay: true,
};

const INDICATOR_VERSION = 'v1.13.1';
const WARMUP_FLOOR = 50;
const MAX_HISTORY_SIGS = 100;
const MAX_SCORE_REF = 100;
const ER_LOW_THRESH = 0.25;
const ER_HIGH_THRESH = 0.50;
const VOL_LOW_THRESH = 0.7;
const VOL_HIGH_THRESH = 1.3;
const EWMA_ALPHA = 0.2;
const MULT_SMOOTH_ALPHA = 0.15;
const TQI_MULT_FLOOR = 0.6;
const TQI_MULT_RANGE = 0.8;
const ASYM_TIGHTEN_MAX = 0.3;
const ASYM_WIDEN_MAX = 0.4;

/** max_labels_count of the script */
const MAX_LABELS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

const safeDiv = (num: number, den: number, fallback = 0.0) =>
  (ne(den, 0) && !Number.isNaN(num) && !Number.isNaN(den) ? num / den : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const mapClamp = (v: number, inLo: number, inHi: number, outLo: number, outHi: number) =>
  outLo + clamp(safeDiv(v - inLo, inHi - inLo, 0.0), 0.0, 1.0) * (outHi - outLo);
const mapClampInv = (v: number, inLo: number, inHi: number, outHigh: number, outLow: number) =>
  outHigh - clamp(safeDiv(v - inLo, inHi - inLo, 0.0), 0.0, 1.0) * (outHigh - outLow);
const signedR = (v: number) => (Number.isNaN(v) ? '—' : (gt(v, 0) ? '+' : '') + str.tostring(v, '0.00'));
const cornerOf = (s: string): TablePosition => {
  switch (s) {
    case 'Top Left': return 'top_left';
    case 'Top Right': return 'top_right';
    case 'Bottom Left': return 'bottom_left';
    case 'Bottom Right': return 'bottom_right';
    default: return 'middle_right';
  }
};

/** Drawings as the script handles them: x is a bar index */
interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; width: number; style: 'solid' | 'dashed' }
interface Lb { x: number; y: number; text: string; color: string; textColor: string; style: LabelStyle; tooltip?: string }

/**
 * Live labels in creation order. At most max objects are kept: a creation that brings the count above max + 5
 * deletes the oldest until max remain. A label that a `var` variable of the script still refers to (the five level
 * labels) is not deleted by this rule, but it counts.
 */
class LiveLabels {
  items: Lb[] = [];
  held = new Set<Lb>();
  add(o: Lb): Lb {
    this.items.push(o);
    if (this.items.length > MAX_LABELS + 5) {
      let excess = this.items.length - MAX_LABELS;
      this.items = this.items.filter((x) => this.held.has(x) || excess-- <= 0);
    }
    return o;
  }
  delete(o: Lb | null): void {
    if (!o) return;
    this.held.delete(o);
    const k = this.items.lastIndexOf(o);
    if (k >= 0) this.items.splice(k, 1);
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SelfAwareTrendSystemInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // syminfo.mintick, syminfo.timezone, chart.bg_color (dark: red channel below 128), barstate.isconfirmed
  const MINTICK = mintickOf(chart);
  const TIMEZONE = timezoneOf(chart);
  const CHART_IS_DARK = (color.r(backgroundColorOf(chart)) as number) < 128;
  const lastConfirmed = lastBarConfirmedOf(chart);
  const roundDownTick = (v: number) => Math.floor(v / MINTICK + 1e-9) * MINTICK;
  const roundUpTick = (v: number) => Math.ceil(v / MINTICK - 1e-9) * MINTICK;
  const roundTick = (v: number) => math.round_to_mintick(v, MINTICK) as number;
  const tickText = (v: number) => str.tostring(v, 'mintick', MINTICK);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // if barstate.isfirst: input checks (runtime.error)
  if (cfg.alertInstance.length === 0 || cfg.alertInstance.length > 64 || !/^[A-Za-z0-9_.-]+$/.test(cfg.alertInstance)) {
    throw new Error('Alert instance ID: use 1-64 ASCII letters, digits, underscore, dot or hyphen.');
  }
  if (cfg.useTqi && le(cfg.tqiWeightEr + cfg.tqiWeightVol + cfg.tqiWeightStruct + cfg.tqiWeightMom, 0)) {
    throw new Error('TQI requires at least one positive weight.');
  }
  if (cfg.useCharFlip && cfg.useTqi && ge(cfg.charFlipLow, cfg.charFlipHigh)) {
    throw new Error('Char-Flip Low must be below High.');
  }
  if (cfg.useAutoCalib && (ge(cfg.calibMinQ, cfg.calibMaxQ) || ge(cfg.calibBadR, cfg.calibGoodR))) {
    throw new Error('Calibration requires Min Q < Max Q and Bad R < Good R.');
  }

  // Preset resolution: tfMinutes = timeframe.in_seconds(timeframe.period) / 60
  const chartTf = chart?.timeframe ?? chartTimeframe(bars);
  const tfMinutes = chartTf === '' ? NaN : timeframe.in_seconds(chartTf) / 60.0;
  const resolvedPreset: Preset = cfg.preset === 'Auto' ? (tfMinutes <= 5 ? 'Scalping' : tfMinutes <= 240 ? 'Default' : 'Swing') : cfg.preset;
  const pick = <T,>(scalping: T, def: T, swing: T, crypto: T, custom: T): T => {
    switch (resolvedPreset) {
      case 'Scalping': return scalping;
      case 'Default': return def;
      case 'Swing': return swing;
      case 'Crypto 24/7': return crypto;
      default: return custom;
    }
  };
  const effectiveAtrLen = pick(10, 14, 21, 14, cfg.atrLen);
  const effectiveBaseMult = pick(1.5, 2.0, 2.5, 2.8, cfg.baseMult);
  const effectiveErLen = pick(14, 20, 30, 20, cfg.erLength);
  const effectiveRsiLen = pick(9, 14, 21, 14, cfg.rsiLen);
  const effectiveSlMult = pick(1.0, 1.5, 2.0, 2.5, cfg.slAtrMult);

  // Coincident targets are allowed: TP1 <= TP2 <= TP3
  const fixedTp1R = Math.min(cfg.tp1R, Math.min(cfg.tp2R, cfg.tp3R));
  const fixedTp3R = Math.max(cfg.tp1R, Math.max(cfg.tp2R, cfg.tp3R));
  const fixedTp2R = cfg.tp1R + cfg.tp2R + cfg.tp3R - fixedTp1R - fixedTp3R;

  // Theme and colours
  const isDark = cfg.theme === 'Dark' ? true : cfg.theme === 'Light' ? false : CHART_IS_DARK;
  const C = (c: string, t: number) => String(color.new(c, t));
  const TEXT_COLOR = isDark ? '#E0E0E0' : '#1A1A1A';
  const TEXT_MUTED = isDark ? C('#9E9E9E', 0) : C('#757575', 0);
  const TEXT_BRIGHT = isDark ? '#FFFFFF' : '#000000';
  const TABLE_BG = isDark ? C('#131722', 5) : C('#FFFFFF', 5);
  const TABLE_BORDER = isDark ? C('#2A2E39', 0) : C('#D0D0D0', 0);
  const TABLE_ROW_ALT = isDark ? C('#1C2030', 0) : C('#F0F4F8', 0);
  const HEADER_BG = C('#2962FF', 0);
  const HEADER_TEXT = '#FFFFFF';
  const LABEL_TEXT = '#FFFFFF';
  const WM_COLOR = isDark ? C('#FFFFFF', 80) : C('#000000', 80);
  const BULL_BG = C(cfg.bullColor, 92);
  const BEAR_BG = C(cfg.bearColor, 92);
  const NEUTRAL_YELLOW = C('#FFEB3B', 0);
  const HIT_COLOR = C('#40E0D0', 0);
  const GRAY = String(color.gray);
  const GRAY_0 = C(color.gray, 0);
  const GRAY_60 = C(color.gray, 60);

  const empty = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: [] }, lines: [], labels: [], tables: [], bgColors: [],
  };
  if (n === 0) return empty;

  // ── Base calculations ──
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);
  const src = A(getSourceSeries(bars, cfg.source));
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  const warmupBars = Math.max(WARMUP_FLOOR, Math.max(effectiveAtrLen + cfg.atrBaselineLen - 2,
    Math.max(effectiveRsiLen + cfg.rsiLookback - 1, Math.max(effectiveErLen, Math.max(cfg.tqiMomLen, cfg.tqiStructLen)))));
  const rawAtrS = ta.atr(bars, effectiveAtrLen);
  const rawAtr = A(rawAtrS);
  const atrBaseline = A(ta.sma(rawAtrS, cfg.atrBaselineLen));
  const rsiS = ta.rsi(S(close), effectiveRsiLen);
  const rsiVal = A(rsiS);
  const validSourcePairs = A(math.sum(S(src.map((v, i) => (!Number.isNaN(v) && !Number.isNaN(at(src, i - 1)) ? 1.0 : 0.0))), effectiveErLen));
  // calcEfficiencyRatio(sourceInput, effectiveErLen)
  const erVolatility = A(math.sum(S(src.map((v, i) => Math.abs(v - at(src, i - 1)))), effectiveErLen));
  const erValue = src.map((v, i) => safeDiv(Math.abs(v - at(src, i - effectiveErLen)), erVolatility[i], 0.0));
  const atrValue = rawAtr.map((v, i) => (cfg.useEffAtr ? v * (0.5 + 0.5 * erValue[i]) : v));
  const volRatio = rawAtr.map((v, i) => safeDiv(v, atrBaseline[i], 1.0));

  // ── Trend Quality Index ──
  const volumeS = S(volume);
  const volumeValidCount = A(math.sum(S(volume.map((v) => (!Number.isNaN(v) ? 1.0 : 0.0))), cfg.volLen));
  const volumeStd = A(ta.stdev(volumeS, cfg.volLen));
  const volumeMean = A(ta.sma(volumeS, cfg.volLen));
  const volZRaw = volume.map((v, i) => safeDiv(v - volumeMean[i], volumeStd[i], 0.0));
  const hasVolume = volume.map((_, i) => eq(volumeValidCount[i], cfg.volLen) && gt(volumeStd[i], 0));
  const atrRegime = cfg.tqiVolMode === 'ATR regime';
  const structHi = A(ta.highest(S(high), cfg.tqiStructLen));
  const structLo = A(ta.lowest(S(low), cfg.tqiStructLen));
  const upMoves = A(math.sum(S(close.map((v, i) => (gt(v, at(close, i - 1)) ? 1.0 : 0.0))), cfg.tqiMomLen));
  const downMoves = A(math.sum(S(close.map((v, i) => (lt(v, at(close, i - 1)) ? 1.0 : 0.0))), cfg.tqiMomLen));

  const tqiEr: number[] = new Array(n);
  const tqiVol: number[] = new Array(n);
  const tqiStruct: number[] = new Array(n);
  const tqiMom: number[] = new Array(n);
  const tqiVolAvailable: boolean[] = new Array(n);
  const tqiReady: boolean[] = new Array(n);
  const tqi: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    tqiEr[i] = clamp(erValue[i], 0.0, 1.0);
    tqiVolAvailable[i] = atrRegime || hasVolume[i];
    tqiVol[i] = atrRegime ? mapClamp(volRatio[i], 0.6, 1.8, 0.0, 1.0) : hasVolume[i] ? mapClamp(volZRaw[i], -1.0, 2.0, 0.0, 1.0) : 0.0;
    const pricePos = safeDiv(close[i] - structLo[i], structHi[i] - structLo[i], 0.5);
    tqiStruct[i] = clamp(Math.abs(pricePos - 0.5) * 2.0, 0.0, 1.0);
    const windowChange = close[i] - at(close, i - cfg.tqiMomLen);
    const up = Number.isNaN(upMoves[i]) ? 0.0 : upMoves[i];
    const down = Number.isNaN(downMoves[i]) ? 0.0 : downMoves[i];
    tqiMom[i] = gt(windowChange, 0) ? up / cfg.tqiMomLen : lt(windowChange, 0) ? down / cfg.tqiMomLen : 0.0;
    const availableVolWeight = tqiVolAvailable[i] ? cfg.tqiWeightVol : 0.0;
    const tqiWeightSum = cfg.tqiWeightEr + availableVolWeight + cfg.tqiWeightStruct + cfg.tqiWeightMom;
    tqiReady[i] = !cfg.useTqi || gt(tqiWeightSum, 0);
    const tqiWeightDenom = gt(tqiWeightSum, 0) ? tqiWeightSum : 1.0;
    const tqiRaw = cfg.useTqi
      ? (tqiEr[i] * cfg.tqiWeightEr + tqiVol[i] * availableVolWeight + tqiStruct[i] * cfg.tqiWeightStruct + tqiMom[i] * cfg.tqiWeightMom) / tqiWeightDenom
      : 0.5;
    tqi[i] = clamp(tqiRaw, 0.0, 1.0);
  }

  const charFlipWindow = Math.max(cfg.charFlipMinAge, 3);
  const tqiWindowHigh = A(ta.highest(S(tqi), charFlipWindow));
  const rsiLowestG = A(ta.lowest(rsiS, cfg.rsiLookback));
  const rsiHighestG = A(ta.highest(rsiS, cfg.rsiLookback));
  const pivotHigh = A(ta.pivothigh(S(high), cfg.pivotLen, cfg.pivotLen));
  const pivotLow = A(ta.pivotlow(S(low), cfg.pivotLen, cfg.pivotLen));

  // ── Dynamic TP floors ──
  const useDynTp = cfg.tpMode === 'Dynamic';
  const tp1Floor = Math.min(cfg.dynTpFloorR1, cfg.dynTpCeilR3);
  const tp2Floor = Math.min(cfg.dynTpFloorR1 * (fixedTp2R / Math.max(fixedTp1R, 0.01)), cfg.dynTpCeilR3);
  const tp3Floor = Math.min(cfg.dynTpFloorR1 * (fixedTp3R / Math.max(fixedTp1R, 0.01)), cfg.dynTpCeilR3);

  // ── Learning state (type LearnState, signalRBuffer, gridCount, gridEwmR) ──
  const signalRBuffer: number[] = [];
  const gridCount: number[] = new Array(9).fill(0);
  const gridEwmR: number[] = new Array(9).fill(0.0);
  const learn = {
    allTimeCount: 0, allTimePeak: 0.0, allTimeTrough: 0.0, allTimeCumR: 0.0,
    curWinStreak: 0, curLossStreak: 0, maxWinStreak: 0, maxLossStreak: 0,
    signalsSinceCalib: 0, breakEvenCount: 0, epoch: 0, epochSum: 0.0, calibStatus: 'Collecting epoch',
    effQ: NaN, lastShiftDir: 0, avgRAtLastShift: NaN,
  };
  const record = (r: number, cIdx: number, entryEpoch: number): void => {
    signalRBuffer.push(r);
    while (signalRBuffer.length > MAX_HISTORY_SIGS) signalRBuffer.shift();
    learn.allTimeCount += 1;
    learn.allTimeCumR += r;
    if (gt(learn.allTimeCumR, learn.allTimePeak)) learn.allTimePeak = learn.allTimeCumR;
    const curDD = learn.allTimeCumR - learn.allTimePeak;
    if (lt(curDD, learn.allTimeTrough)) learn.allTimeTrough = curDD;
    if (gt(r, 1e-8)) {
      learn.curWinStreak += 1;
      learn.curLossStreak = 0;
      if (learn.curWinStreak > learn.maxWinStreak) learn.maxWinStreak = learn.curWinStreak;
    } else if (lt(r, -1e-8)) {
      learn.curLossStreak += 1;
      learn.curWinStreak = 0;
      if (learn.curLossStreak > learn.maxLossStreak) learn.maxLossStreak = learn.curLossStreak;
    } else {
      learn.breakEvenCount += 1;
      learn.curWinStreak = 0;
      learn.curLossStreak = 0;
    }
    // updateGridCell(cIdx, r)
    if (cIdx >= 0 && cIdx < 9) {
      const c = gridCount[cIdx] + 1;
      gridEwmR[cIdx] = c === 1 ? r : gridEwmR[cIdx] * (1.0 - EWMA_ALPHA) + r * EWMA_ALPHA;
      gridCount[cIdx] = c;
    }
    // Non-overlapping epochs contain only trades entered under that Q
    if (cfg.useAutoCalib && cfg.useTqi && entryEpoch === learn.epoch) {
      learn.signalsSinceCalib += 1;
      learn.epochSum += r;
      const required = Math.max(cfg.calibWindow, cfg.calibCooldown);
      if (learn.signalsSinceCalib >= required) {
        const postAvgR = learn.epochSum / learn.signalsSinceCalib;
        if (lt(postAvgR, cfg.calibBadR)) {
          let dir = learn.lastShiftDir === 0 ? 1
            : (Number.isNaN(learn.avgRAtLastShift) || ge(postAvgR, learn.avgRAtLastShift) ? learn.lastShiftDir : -learn.lastShiftDir);
          if ((dir > 0 && ge(learn.effQ, cfg.calibMaxQ)) || (dir < 0 && le(learn.effQ, cfg.calibMinQ))) dir = -dir;
          const nextQ = clamp(learn.effQ + dir * cfg.calibStepQ, cfg.calibMinQ, cfg.calibMaxQ);
          learn.calibStatus = str.tostring(learn.effQ, '0.00') + ' -> ' + str.tostring(nextQ, '0.00') + ' (poor epoch)';
          learn.effQ = nextQ;
          learn.lastShiftDir = dir;
        } else {
          learn.calibStatus = gt(postAvgR, cfg.calibGoodR) ? 'Good epoch: hold Q' : 'Neutral epoch: hold Q';
          if (gt(postAvgR, cfg.calibGoodR)) learn.lastShiftDir = 0;
        }
        learn.avgRAtLastShift = postAvgR;
        learn.signalsSinceCalib = 0;
        learn.epochSum = 0.0;
        learn.epoch += 1;
      }
    }
  };

  // ── Trade model (type TradeState) ──
  const trade = {
    dir: 0, side: 0, entryBar: 0, entryTime: 0, cell: -1, epoch: 0,
    entry: NaN, sl: NaN, risk: NaN, tp1: NaN, tp2: NaN, tp3: NaN, r1: NaN, r2: NaN, r3: NaN,
    hit1: false, hit2: false, hit3: false, takenR: 0.0, costR: 0.0, remaining: 0.0,
    entryTqi: NaN, entryScore: NaN, signalPrice: NaN, reason: '', limitations: '',
  };
  const takeFill = (fill: number, fraction: number): void => {
    trade.takenR += fraction * trade.side * (fill - trade.entry) / trade.risk;
    trade.costR += fraction * Math.abs(fill) * cfg.feePct / 100.0 / trade.risk;
    trade.remaining = Math.max(0.0, trade.remaining - fraction);
  };
  let lastM = NaN;
  let lastE = NaN;
  let lastV = NaN;
  let lastR = NaN;
  let lastS = NaN;
  let lastB = NaN;
  let lastScoreMax = NaN;
  let lastDisplaySide = 0;
  let lastSignalBar = 0;
  let lastExitReason = 'No completed trade';
  let lastExitR = NaN;
  let lastExitTime = NaN;
  let lastRejected = '';
  const slipPrice = cfg.slippageTicks * MINTICK;
  const timeMs = (i: number) => (bars[i].time >= 1e12 ? bars[i].time : bars[i].time * 1000);

  // ── Drawings ──
  const labels = new LiveLabels();
  let lineEntry: Ln | null = null;
  let lineSL: Ln | null = null;
  let lineTp1: Ln | null = null;
  let lineTp2: Ln | null = null;
  let lineTp3: Ln | null = null;
  let lbEntry: Lb | null = null;
  let lbSL: Lb | null = null;
  let lbTp1: Lb | null = null;
  let lbTp2: Lb | null = null;
  let lbTp3: Lb | null = null;
  const scoreRefStr = '/' + str.tostring(MAX_SCORE_REF);

  // ── Bar loop ──
  const lowerBand: number[] = new Array(n);
  const upperBand: number[] = new Array(n);
  const stTrend: number[] = new Array(n);
  const flips: number[] = new Array(n);
  let activeMultSm = NaN;
  let passiveMultSm = NaN;
  let trendStartBar = 0;
  let lastPivotHigh = NaN;
  let lastPivotLow = NaN;
  let lastPivotHighBar = NaN;
  let lastPivotLowBar = NaN;
  const plot0: Array<{ time: number; value: number; color?: string }> = [];
  const bgColors: BgColorData[] = [];
  // values of the last bar, for the tables
  let isWarmedUp = false;
  let validLowPivot = false;
  let validHighPivot = false;
  let confirmedBuy = false;
  let confirmedSell = false;
  let dynScale = 1.0;
  let liveTp1R = fixedTp1R;
  let liveTp2R = fixedTp2R;
  let liveTp3R = fixedTp3R;
  let curCellIdx = 0;
  let volZ = 0.0;

  for (let i = 0; i < n; i++) {
    const c = close[i];
    isWarmedUp = i >= warmupBars && !Number.isNaN(atrBaseline[i]) && gt(rawAtr[i], 0) && gt(atrBaseline[i], 0)
      && !Number.isNaN(src[i]) && !Number.isNaN(at(src, i - effectiveErLen))
      && (!cfg.useRsi || !Number.isNaN(at(rsiVal, i - (cfg.rsiLookback - 1))));
    isWarmedUp = isWarmedUp && eq(validSourcePairs[i], effectiveErLen);
    isWarmedUp = isWarmedUp && tqiReady[i];

    // Adaptive multipliers
    const legacyAdaptFactor = cfg.useAdaptive ? 1.0 + cfg.adaptStrength * (0.5 - erValue[i]) : 1.0;
    if (i === 0) learn.effQ = cfg.useAutoCalib ? clamp(cfg.qualityStrength, cfg.calibMinQ, cfg.calibMaxQ) : cfg.qualityStrength;
    if (!cfg.useAutoCalib) learn.effQ = cfg.qualityStrength;
    const effectiveQualityStrength = learn.effQ;
    const qualityDeviation = cfg.useTqi ? math.pow(1.0 - tqi[i], cfg.qualityCurve) : 0.5;
    const tqiMult = 1.0 - effectiveQualityStrength + effectiveQualityStrength * (TQI_MULT_FLOOR + TQI_MULT_RANGE * qualityDeviation);
    const symMult = effectiveBaseMult * legacyAdaptFactor * tqiMult;
    let activeMultRaw = symMult;
    let passiveMultRaw = symMult;
    if (cfg.useTqi && cfg.useAsymBands) {
      activeMultRaw = symMult * (1.0 - cfg.asymStrength * tqi[i] * ASYM_TIGHTEN_MAX);
      passiveMultRaw = symMult * (1.0 + cfg.asymStrength * tqi[i] * ASYM_WIDEN_MAX);
    }
    activeMultSm = Number.isNaN(activeMultSm) ? activeMultRaw
      : cfg.multSmooth ? activeMultSm * (1.0 - MULT_SMOOTH_ALPHA) + activeMultRaw * MULT_SMOOTH_ALPHA : activeMultRaw;
    passiveMultSm = Number.isNaN(passiveMultSm) ? passiveMultRaw
      : cfg.multSmooth ? passiveMultSm * (1.0 - MULT_SMOOTH_ALPHA) + passiveMultRaw * MULT_SMOOTH_ALPHA : passiveMultRaw;

    // Adaptive SuperTrend
    const prevTrend = i === 0 ? 1 : stTrend[i - 1];
    const lowerMult = prevTrend === 1 ? activeMultSm : passiveMultSm;
    const upperMult = prevTrend === 1 ? passiveMultSm : activeMultSm;
    const lowerBandRaw = src[i] - lowerMult * atrValue[i];
    const upperBandRaw = src[i] + upperMult * atrValue[i];
    const lowerPrev = at(lowerBand, i - 1);
    const upperPrev = at(upperBand, i - 1);
    const closePrev = at(close, i - 1);
    lowerBand[i] = Number.isNaN(lowerPrev) ? lowerBandRaw : gt(closePrev, lowerPrev) ? Math.max(lowerBandRaw, lowerPrev) : lowerBandRaw;
    upperBand[i] = Number.isNaN(upperPrev) ? upperBandRaw : lt(closePrev, upperPrev) ? Math.min(upperBandRaw, upperPrev) : upperBandRaw;

    const priceFlipUp = prevTrend === -1 && gt(c, upperPrev);
    const priceFlipDown = prevTrend === 1 && lt(c, lowerPrev);
    const trendAge = i - trendStartBar;
    const charFlipCondBase = cfg.useCharFlip && cfg.useTqi && trendAge >= cfg.charFlipMinAge
      && gt(tqiWindowHigh[i], cfg.charFlipHigh) && lt(tqi[i], cfg.charFlipLow);
    const charFlipDown = charFlipCondBase && prevTrend === 1 && lt(c, at(close, i - charFlipWindow));
    const charFlipUp = charFlipCondBase && prevTrend === -1 && gt(c, at(close, i - charFlipWindow));
    const finalFlipUp = priceFlipUp || charFlipUp;
    const finalFlipDown = priceFlipDown || charFlipDown;
    stTrend[i] = i === 0 ? 1 : finalFlipUp ? 1 : finalFlipDown ? -1 : prevTrend;
    if (stTrend[i] !== prevTrend) trendStartBar = i;
    const trend = stTrend[i];
    const stLine = trend === 1 ? lowerBand[i] : upperBand[i];
    const flipUp = i > 0 && trend === 1 && stTrend[i - 1] === -1;
    const flipDown = i > 0 && trend === -1 && stTrend[i - 1] === 1;
    flips[i] = flipUp || flipDown ? 1 : 0;

    // Dynamic TP R-multiples
    if (useDynTp) {
      // calcDynTpScale(tqi, volRatio, ...)
      const tqiComp = clamp(tqi[i], 0.0, 1.0);
      const volComp = clamp(mapClamp(volRatio[i], 0.5, 2.0, 0.0, 1.0), 0.0, 1.0);
      const wSum = cfg.dynTpTqiWeight + cfg.dynTpVolWeight;
      const wDenom = gt(wSum, 0) ? wSum : 1.0;
      const rawScale = (tqiComp * cfg.dynTpTqiWeight + volComp * cfg.dynTpVolWeight) / wDenom;
      const finalScale = cfg.dynTpMinScale + rawScale * (cfg.dynTpMaxScale - cfg.dynTpMinScale);
      dynScale = gt(wSum, 0) ? finalScale : 1.0;
    } else {
      dynScale = 1.0;
    }
    const effTp1R = useDynTp ? clamp(fixedTp1R * dynScale, tp1Floor, cfg.dynTpCeilR3) : fixedTp1R;
    const effTp2R = useDynTp ? clamp(fixedTp2R * dynScale, tp2Floor, cfg.dynTpCeilR3) : fixedTp2R;
    const effTp3R = useDynTp ? clamp(fixedTp3R * dynScale, tp3Floor, cfg.dynTpCeilR3) : fixedTp3R;
    liveTp1R = Math.min(effTp1R, Math.min(effTp2R, effTp3R));
    liveTp3R = Math.max(effTp1R, Math.max(effTp2R, effTp3R));
    liveTp2R = effTp1R + effTp2R + effTp3R - liveTp1R - liveTp3R;

    // Display data and signal score
    volZ = hasVolume[i] ? volZRaw[i] : 0.0;
    if (!Number.isNaN(pivotHigh[i])) {
      lastPivotHigh = pivotHigh[i];
      lastPivotHighBar = i - cfg.pivotLen;
    }
    if (!Number.isNaN(pivotLow[i])) {
      lastPivotLow = pivotLow[i];
      lastPivotLowBar = i - cfg.pivotLen;
    }
    validLowPivot = !Number.isNaN(lastPivotLow) && i - lastPivotLowBar <= cfg.pivotMaxAge && lt(lastPivotLow, c);
    validHighPivot = !Number.isNaN(lastPivotHigh) && i - lastPivotHighBar <= cfg.pivotMaxAge && gt(lastPivotHigh, c);

    // calcScoreBreakdown(stTrend == 1, rsiLowestG, rsiHighestG)
    const isBuy = trend === 1;
    const close3 = at(close, i - 3);
    const dirMove = isBuy ? c - close3 : close3 - c;
    const bdMom = mapClamp(safeDiv(dirMove, atrValue[i], 0.0), 0.3, 2.0, 0.0, 17.0);
    const bdEr = mapClamp(erValue[i], 0.15, 0.7, 0.0, 17.0);
    const bdVol = cfg.useVol && hasVolume[i] ? mapClamp(volZ, 0.0, 3.0, 0.0, 17.0) : 0.0;
    const rsiDepth = isBuy ? Math.max(0.0, cfg.rsiOS - rsiLowestG[i]) : Math.max(0.0, rsiHighestG[i] - cfg.rsiOB);
    const bdRsi = cfg.useRsi ? mapClamp(rsiDepth, 0.0, 15.0, 0.0, 17.0) : 0.0;
    const pivDist = isBuy && !Number.isNaN(lastPivotLow) ? Math.abs(c - lastPivotLow)
      : !isBuy && !Number.isNaN(lastPivotHigh) ? Math.abs(lastPivotHigh - c) : 0.0;
    const pivotAvailable = isBuy ? validLowPivot : validHighPivot;
    const bdStruct = cfg.useStructure && pivotAvailable ? mapClampInv(safeDiv(pivDist, atrValue[i], 0.0), 0.0, 1.5, 16.0, 6.0) : 0.0;
    const breakDepth = isBuy ? Math.max(0.0, c - upperPrev) : Math.max(0.0, lowerPrev - c);
    const bdBreak = mapClamp(safeDiv(breakDepth, atrValue[i], 0.0), 0.0, 1.0, 0.0, 16.0);
    const scoreAvailableMax = 50.0 + (cfg.useVol && hasVolume[i] ? 17.0 : 0.0) + (cfg.useRsi ? 17.0 : 0.0)
      + (cfg.useStructure && pivotAvailable ? 16.0 : 0.0);
    const bdTotal = 100.0 * (bdMom + bdEr + bdVol + bdRsi + bdStruct + bdBreak) / scoreAvailableMax;

    // Regime bins
    const curErBin = lt(erValue[i], ER_LOW_THRESH) ? 0 : lt(erValue[i], ER_HIGH_THRESH) ? 1 : 2;
    const curVolBin = lt(volRatio[i], VOL_LOW_THRESH) ? 0 : lt(volRatio[i], VOL_HIGH_THRESH) ? 1 : 2;
    curCellIdx = curErBin * 3 + curVolBin;

    // ── Signal logic ──
    const buyScore = flipUp ? bdTotal : 0.0;
    const sellScore = flipDown ? bdTotal : 0.0;
    confirmedBuy = false;
    confirmedSell = false;
    let tp1Event = false;
    let tp2Event = false;
    let tp3Event = false;
    let closedThisBar = false;
    // barstate.isconfirmed: false on a last bar that is still open
    const isConfirmed = i < n - 1 || lastConfirmed;
    const rawBuy = flipUp && isConfirmed && isWarmedUp;
    const rawSell = flipDown && isConfirmed && isWarmedUp;
    const calculationEpoch = learn.epoch;

    // First settle the old trade with the full bar. The stop wins an ambiguous bar.
    if (trade.dir !== 0 && isConfirmed && i > trade.entryBar) {
      const stopHit = trade.side === 1 ? le(low[i], trade.sl) : ge(high[i], trade.sl);
      const opposite = trade.side !== trend;
      const timedOut = i - trade.entryBar >= cfg.tradeMaxAge;
      let exitReason = '';
      if (stopHit) {
        const exitFill = (trade.side === 1 ? Math.min(bars[i].open, trade.sl) : Math.max(bars[i].open, trade.sl)) - trade.side * slipPrice;
        takeFill(exitFill, trade.remaining);
        exitReason = 'SL';
      } else {
        if (!trade.hit1 && (trade.side === 1 ? ge(high[i], trade.tp1) : le(low[i], trade.tp1))) {
          trade.hit1 = true;
          takeFill(trade.tp1, 1.0 / 3.0);
          tp1Event = true;
        }
        if (!trade.hit2 && (trade.side === 1 ? ge(high[i], trade.tp2) : le(low[i], trade.tp2))) {
          trade.hit2 = true;
          takeFill(trade.tp2, 1.0 / 3.0);
          tp2Event = true;
        }
        if (!trade.hit3 && (trade.side === 1 ? ge(high[i], trade.tp3) : le(low[i], trade.tp3))) {
          trade.hit3 = true;
          takeFill(trade.tp3, trade.remaining);
          tp3Event = true;
          exitReason = 'TP3';
        } else if (opposite || timedOut) {
          const exitFill = c - trade.side * slipPrice;
          takeFill(exitFill, trade.remaining);
          exitReason = opposite ? 'FLIP' : 'TIMEOUT';
        }
      }
      if (exitReason !== '') {
        lastExitReason = exitReason;
        lastExitR = trade.takenR - trade.costR;
        lastExitTime = timeMs(i);
        // Never clip losses: a stop gap and costs may exceed one initial R
        record(lastExitR, trade.cell, trade.epoch);
        trade.dir = 0;
        closedThisBar = true;
      }
    }

    // Then validate and open the new position
    if ((rawBuy || rawSell) && trade.dir === 0) {
      const direction = rawBuy ? 1 : -1;
      const newEntry = roundTick(c + direction * slipPrice);
      const pivotUsable = direction === 1 ? validLowPivot : validHighPivot;
      const pivotBase = direction === 1 ? (pivotUsable ? lastPivotLow : low[i]) : (pivotUsable ? lastPivotHigh : high[i]);
      const buffer = effectiveSlMult * atrValue[i];
      const cap = Math.max(cfg.slMaxDist, effectiveSlMult) * atrValue[i];
      const rawStop = direction === 1
        ? Math.max(Math.min(pivotBase - buffer, newEntry - buffer), newEntry - cap)
        : Math.min(Math.max(pivotBase + buffer, newEntry + buffer), newEntry + cap);
      const newStop = direction === 1 ? roundDownTick(rawStop) : roundUpTick(rawStop);
      const newRisk = direction * (newEntry - newStop);
      // Tick distances preserve dynamic floors; reject if no tick fits the ceiling
      const distance1 = Math.max(MINTICK, Math.max(roundDownTick(newRisk * liveTp1R), useDynTp ? roundUpTick(newRisk * tp1Floor) : 0.0));
      const distance2 = Math.max(distance1, Math.max(roundDownTick(newRisk * liveTp2R), useDynTp ? roundUpTick(newRisk * tp2Floor) : 0.0));
      const distance3 = Math.max(distance2, Math.max(roundDownTick(newRisk * liveTp3R), useDynTp ? roundUpTick(newRisk * tp3Floor) : 0.0));
      const newTp1 = roundTick(newEntry + direction * distance1);
      const newTp2 = roundTick(newEntry + direction * distance2);
      const newTp3 = roundTick(newEntry + direction * distance3);
      const tickTolerance = MINTICK * 1e-6;
      const ceilingValid = !useDynTp || le(distance3, newRisk * cfg.dynTpCeilR3 + tickTolerance);
      const stopLive = !Number.isNaN(newStop) && gt(direction * (c - newStop), tickTolerance);
      const levelsValid = stopLive && !Number.isNaN(newRisk) && ge(newRisk, cfg.minRiskTicks * MINTICK - tickTolerance)
        && ge(direction * (newTp1 - newEntry), MINTICK - tickTolerance) && ge(direction * (newTp2 - newTp1), -tickTolerance)
        && ge(direction * (newTp3 - newTp2), -tickTolerance) && ceilingValid;
      if (levelsValid) {
        trade.dir = direction;
        trade.side = direction;
        trade.entryBar = i;
        trade.entryTime = timeMs(i);
        trade.entry = newEntry;
        trade.signalPrice = c;
        trade.sl = newStop;
        trade.risk = newRisk;
        trade.tp1 = newTp1;
        trade.tp2 = newTp2;
        trade.tp3 = newTp3;
        trade.r1 = direction * (newTp1 - newEntry) / newRisk;
        trade.r2 = direction * (newTp2 - newEntry) / newRisk;
        trade.r3 = direction * (newTp3 - newEntry) / newRisk;
        trade.hit1 = false;
        trade.hit2 = false;
        trade.hit3 = false;
        trade.takenR = 0.0;
        trade.costR = Math.abs(newEntry) * cfg.feePct / 100.0 / newRisk;
        trade.remaining = 1.0;
        trade.cell = curCellIdx;
        // These bands were calculated before an old-trade exit could change Q
        trade.epoch = calculationEpoch;
        trade.entryTqi = tqi[i];
        trade.entryScore = bdTotal;
        const viaPrice = direction === 1 ? priceFlipUp : priceFlipDown;
        const viaQuality = direction === 1 ? charFlipUp : charFlipDown;
        trade.reason = viaPrice && viaQuality ? 'Price break + quality collapse' : viaQuality ? 'Quality collapse' : 'Price band break';
        trade.limitations = (hasVolume[i] ? '' : 'Volume unavailable/flat; ') + (pivotUsable ? '' : 'No recent valid pivot; ')
          + (ge(newRisk, cap) ? 'SL capped/rounded; ' : '');
        confirmedBuy = direction === 1;
        confirmedSell = direction === -1;
        lastM = bdMom;
        lastE = bdEr;
        lastV = bdVol;
        lastR = bdRsi;
        lastS = bdStruct;
        lastB = bdBreak;
        lastScoreMax = scoreAvailableMax;
        lastDisplaySide = direction;
        lastSignalBar = i;
        lastRejected = '';
      } else {
        lastRejected = 'Rejected ' + (direction === 1 ? 'BUY' : 'SELL')
          + (!stopLive ? ': SL already breached at signal close after slippage' : ': invalid/sub-tick risk or targets');
      }
    } else if (rawBuy || rawSell) {
      lastRejected = 'Entry skipped: model position is still active';
    }

    // ── Plots ──
    const lineTransp = cfg.showTqiColor && cfg.useTqi
      ? Math.max(0, Math.min(100, Math.trunc(math.round(mapClampInv(tqi[i], 0.1, 0.9, 70.0, 0.0)) as number)))
      : 0;
    plot0.push({
      time: bars[i].time,
      value: cfg.showBands && isWarmedUp && Number.isFinite(stLine) ? stLine : NaN,
      color: trend === 1 ? C(cfg.bullColor, lineTransp) : C(cfg.bearColor, lineTransp),
    });
    if (cfg.showBg && isWarmedUp) bgColors.push({ time: bars[i].time, color: trend === 1 ? BULL_BG : BEAR_BG });

    // ── Signal labels ──
    if (cfg.showSignals && (confirmedBuy || confirmedSell)) {
      const score = confirmedBuy ? buyScore : sellScore;
      const tpModeTag = useDynTp ? 'Dynamic ×' + str.tostring(dynScale, '0.00') : 'Fixed';
      const tooltip = 'SATS — ' + (confirmedBuy ? 'BUY' : 'SELL') + '\nScore: ' + str.tostring(score, '#.0') + scoreRefStr
        + '\nTQI: ' + str.tostring(tqi[i], '0.00') + '\nER: ' + str.tostring(erValue[i], '0.00')
        + '\nRSI: ' + str.tostring(rsiVal[i], '#.0') + '\nVol Z: ' + str.tostring(volZ, '0.00') + '\nTP Mode: ' + tpModeTag
        + '\nR: ' + str.tostring(trade.r1, '0.00') + '/' + str.tostring(trade.r2, '0.00') + '/' + str.tostring(trade.r3, '0.00');
      labels.add(confirmedBuy
        ? { x: i, y: low[i], text: '▲ BUY  ' + str.tostring(score, '#'), color: cfg.bullColor, textColor: LABEL_TEXT, style: 'label_up', tooltip }
        : { x: i, y: high[i], text: '▼ SELL  ' + str.tostring(score, '#'), color: cfg.bearColor, textColor: LABEL_TEXT, style: 'label_down', tooltip });
    }

    // ── Entry / stop / target levels ──
    if (cfg.showRisk) {
      if ((confirmedBuy || confirmedSell) && !Number.isNaN(trade.sl)) {
        for (const old of [lbEntry, lbSL, lbTp1, lbTp2, lbTp3]) labels.delete(old);
        const lineEnd = i + cfg.labelOffset;
        const labelPos = i + cfg.labelOffset + 2;
        const rText = (r: number) => (useDynTp ? ' (' + str.tostring(r, '#.0') + 'R)' : '');
        const tp1Lbl = 'TP1 ' + tickText(trade.tp1) + rText(trade.r1);
        const tp2Lbl = 'TP2 ' + tickText(trade.tp2) + rText(trade.r2);
        const tp3Lbl = 'TP3 ' + tickText(trade.tp3) + rText(trade.r3);
        const ln = (y: number, col: string, width: number, style: 'solid' | 'dashed'): Ln => ({ x1: i, y1: y, x2: lineEnd, y2: y, color: col, width, style });
        lineEntry = ln(trade.entry, GRAY_0, 2, 'solid');
        lineSL = ln(trade.sl, cfg.slColor, 2, 'solid');
        lineTp1 = ln(trade.tp1, cfg.tpColor, 1, 'dashed');
        lineTp2 = ln(trade.tp2, cfg.tpColor, 1, 'dashed');
        lineTp3 = ln(trade.tp3, cfg.tpColor, 2, 'dashed');
        const lb = (y: number, text: string, col: string): Lb => {
          const o = labels.add({ x: labelPos, y, text, color: col, textColor: TEXT_BRIGHT, style: 'label_left' });
          labels.held.add(o);
          return o;
        };
        lbEntry = lb(trade.entry, 'ENTRY ' + tickText(trade.entry), GRAY_60);
        lbSL = lb(trade.sl, 'SL ' + tickText(trade.sl), C(cfg.slColor, 60));
        lbTp1 = lb(trade.tp1, tp1Lbl, C(cfg.tpColor, 60));
        lbTp2 = lb(trade.tp2, tp2Lbl, C(cfg.tpColor, 60));
        lbTp3 = lb(trade.tp3, tp3Lbl, C(cfg.tpColor, 60));
      } else if (trade.dir !== 0 && lineEntry && lineSL && lineTp1 && lineTp2 && lineTp3 && lbEntry && lbSL && lbTp1 && lbTp2 && lbTp3) {
        const newLineEnd = i + cfg.labelOffset;
        const newLabelPos = i + cfg.labelOffset + 2;
        for (const l of [lineEntry, lineSL, lineTp1, lineTp2, lineTp3]) l.x2 = newLineEnd;
        for (const l of [lbEntry, lbSL, lbTp1, lbTp2, lbTp3]) l.x = newLabelPos;
      }
      // Visuals consume the events after the engine
      if ((tp1Event || tp2Event || tp3Event) && !(confirmedBuy || confirmedSell)) {
        if (tp1Event && cfg.showHits && lineTp1 && lbTp1) {
          lineTp1.color = HIT_COLOR;
          lbTp1.text = 'TP1 HIT';
        }
        if (tp2Event && cfg.showHits && lineTp2 && lbTp2) {
          lineTp2.color = HIT_COLOR;
          lbTp2.text = 'TP2 HIT';
        }
        if (tp3Event && cfg.showHits && lineTp3 && lbTp3) {
          lineTp3.color = HIT_COLOR;
          lbTp3.text = 'TP3 HIT';
        }
      }
      if (closedThisBar && !(confirmedBuy || confirmedSell) && lbEntry) {
        lbEntry.text = lastExitReason + ' | ' + signedR(lastExitR) + 'R';
        lbEntry.color = GRAY_60;
        for (const l of [lineEntry, lineSL, lineTp1, lineTp2, lineTp3]) if (l) l.color = GRAY;
      }
    }
  }

  // ── Tables of the last bar ──
  const last = n - 1;
  const trend = stTrend[last];
  const tables: TableData[] = [];
  const small = 'small' as const;

  if (cfg.showDash) {
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string, textColor: string, bgColor?: string, center = false): void => {
      cells.push({ column, row, text, textColor, textSize: small, ...(bgColor ? { bgColor } : {}), ...(center ? { textHAlign: 'center' as const } : {}) });
    };
    // calcRollingStats(calibWindowInput)
    let dashWinRate = 0.0;
    let dashAvgR = 0.0;
    let dashWindowDD = 0.0;
    const sigCount = signalRBuffer.length;
    if (sigCount > 0) {
      const startIdx = Math.max(0, sigCount - cfg.calibWindow);
      let sumR = 0.0;
      let wins = 0;
      let runningR = 0.0;
      let minRun = 0.0;
      let peakRun = 0.0;
      for (let k = startIdx; k <= sigCount - 1; k++) {
        const r = signalRBuffer[k];
        sumR += r;
        if (gt(r, 1e-8)) wins += 1;
        runningR += r;
        peakRun = Math.max(peakRun, runningR);
        minRun = Math.min(minRun, runningR - peakRun);
      }
      const cnt = sigCount - startIdx;
      dashWinRate = cnt > 0 ? wins / cnt : 0.0;
      dashAvgR = cnt > 0 ? sumR / cnt : 0.0;
      dashWindowDD = minRun;
    }
    const curRegimeCount = gridCount[curCellIdx];
    const curRegimeEdge = gridEwmR[curCellIdx];
    const er = erValue[last];
    const effQ = learn.effQ;

    const trendStr = trend === 1 ? 'Bullish ▲' : 'Bearish ▼';
    const trendCol = trend === 1 ? cfg.bullColor : cfg.bearColor;
    const signalStr = confirmedBuy ? 'BUY' : confirmedSell ? 'SELL' : '—';
    const signalCol = confirmedBuy ? cfg.bullColor : confirmedSell ? cfg.bearColor : TEXT_MUTED;
    const regimeStr = ge(er, ER_HIGH_THRESH) ? 'Trending' : ge(er, ER_LOW_THRESH) ? 'Mixed' : 'Choppy';
    const regimeCol = ge(er, ER_HIGH_THRESH) ? cfg.bullColor : ge(er, ER_LOW_THRESH) ? NEUTRAL_YELLOW : cfg.bearColor;
    const volRegStr = lt(volRatio[last], VOL_LOW_THRESH) ? 'Low Vol' : lt(volRatio[last], VOL_HIGH_THRESH) ? 'Norm Vol' : 'High Vol';
    const tqiStr = cfg.useTqi ? str.tostring(tqi[last], '0.00') : 'off';
    const tqiCol = cfg.useTqi ? (gt(tqi[last], 0.6) ? cfg.bullColor : gt(tqi[last], 0.35) ? NEUTRAL_YELLOW : cfg.bearColor) : TEXT_MUTED;
    const qStrStr = cfg.useTqi ? str.tostring(effQ, '0.00') : 'off';
    const qStrCol = cfg.useTqi
      ? (gt(effQ, cfg.qualityStrength) ? NEUTRAL_YELLOW : lt(effQ, cfg.qualityStrength) ? cfg.bullColor : TEXT_COLOR)
      : TEXT_MUTED;
    const erStr = str.tostring(er, '0.00');
    const rsiStr = str.tostring(rsiVal[last], '#.0');
    const volStr = hasVolume[last] ? str.tostring(volZ, '0.00') + 'σ' : 'n/a';
    const warmStr = isWarmedUp ? 'Ready' : str.tostring(Math.max(0, warmupBars - last)) + ' bars / awaiting valid data';

    const barsAgo = last - lastSignalBar;
    const sideHdr = lastDisplaySide === 1 ? 'Last: BUY (' + str.tostring(barsAgo) + 'b ago)'
      : lastDisplaySide === -1 ? 'Last: SELL (' + str.tostring(barsAgo) + 'b ago)' : 'Last: —';
    const sideCol = lastDisplaySide === 1 ? cfg.bullColor : lastDisplaySide === -1 ? cfg.bearColor : TEXT_MUTED;
    const hasBreakdown = lastDisplaySide !== 0 && cfg.showBreakdown;
    const bd = (v: number) => (lastDisplaySide !== 0 && !Number.isNaN(v) ? str.tostring(v, '#.0') : '—');

    const tqiErStr = cfg.useTqi ? str.tostring(tqiEr[last], '0.00') : '—';
    const tqiVolStr = cfg.useTqi && tqiVolAvailable[last] ? str.tostring(tqiVol[last], '0.00') : 'n/a';
    const tqiStructStr = cfg.useTqi ? str.tostring(tqiStruct[last], '0.00') : '—';
    const tqiMomStr = cfg.useTqi ? str.tostring(tqiMom[last], '0.00') : '—';

    const winRateStr = sigCount === 0 ? '—' : str.tostring(dashWinRate * 100, '#.0') + '%';
    const avgRStr = sigCount === 0 ? '—' : signedR(dashAvgR) + 'R';
    const winDDStr = sigCount === 0 ? '—' : str.tostring(dashWindowDD, '0.00') + 'R';
    const allDDStr = learn.allTimeCount === 0 ? '—' : str.tostring(learn.allTimeTrough, '0.00') + 'R';
    const streakStr = learn.allTimeCount === 0 ? '—'
      : 'W:' + str.tostring(learn.curWinStreak) + '/' + str.tostring(learn.maxWinStreak)
        + ' L:' + str.tostring(learn.curLossStreak) + '/' + str.tostring(learn.maxLossStreak);
    const sampleStr = 'N=' + str.tostring(Math.min(sigCount, cfg.calibWindow)) + ' | all signals';
    const regimeEdgeStr = curRegimeCount === 0 ? '—' : signedR(curRegimeEdge) + 'R (' + str.tostring(curRegimeCount) + ')';
    const winRateCol = sigCount < 5 ? TEXT_MUTED : ge(dashWinRate, 0.5) ? cfg.bullColor : cfg.bearColor;
    const avgRCol = sigCount < 5 ? TEXT_MUTED : gt(dashAvgR, 0) ? cfg.bullColor : cfg.bearColor;
    const regEdgeCol = curRegimeCount < 5 ? TEXT_MUTED : gt(curRegimeEdge, 0) ? cfg.bullColor : cfg.bearColor;

    const tpModeStr = useDynTp ? 'Dynamic' : 'Fixed';
    const dynScaleStr = useDynTp ? '×' + str.tostring(dynScale, '0.00') : '—';
    const liveRStr = trade.dir !== 0
      ? str.tostring(trade.r1, '0.00') + ' / ' + str.tostring(trade.r2, '0.00') + ' / ' + str.tostring(trade.r3, '0.00')
      : str.tostring(liveTp1R, '0.0') + ' / ' + str.tostring(liveTp2R, '0.0') + ' / ' + str.tostring(liveTp3R, '0.0');
    const tpModeCol = useDynTp ? (gt(dynScale, 1.2) ? cfg.bullColor : lt(dynScale, 0.8) ? cfg.bearColor : TEXT_COLOR) : TEXT_COLOR;

    cell(0, 0, 'WillyAlgoTrader', HEADER_TEXT, HEADER_BG, true);
    cell(1, 0, 'SATS', HEADER_TEXT, HEADER_BG, true);
    cell(0, 1, 'Preset', TEXT_MUTED, TABLE_ROW_ALT);
    cell(1, 1, resolvedPreset, TEXT_COLOR, TABLE_ROW_ALT);
    cell(0, 2, 'Trend', TEXT_MUTED);
    cell(1, 2, trendStr, trendCol);
    cell(0, 3, 'TQI', TEXT_MUTED, TABLE_ROW_ALT);
    cell(1, 3, tqiStr, tqiCol, TABLE_ROW_ALT);
    cell(0, 4, 'Q.Strength', TEXT_MUTED);
    cell(1, 4, qStrStr, qStrCol);
    cell(0, 5, 'Signal', TEXT_MUTED, TABLE_ROW_ALT);
    cell(1, 5, signalStr, signalCol, TABLE_ROW_ALT);
    cell(0, 6, 'Regime', TEXT_MUTED);
    cell(1, 6, regimeStr + ' / ' + volRegStr, regimeCol);
    cell(0, 7, 'ER', TEXT_MUTED, TABLE_ROW_ALT);
    cell(1, 7, erStr, TEXT_COLOR, TABLE_ROW_ALT);
    cell(0, 8, 'RSI', TEXT_MUTED);
    cell(1, 8, rsiStr, TEXT_COLOR);
    cell(0, 9, 'Vol Z', TEXT_MUTED, TABLE_ROW_ALT);
    cell(1, 9, volStr, TEXT_COLOR, TABLE_ROW_ALT);
    cell(0, 10, 'TP Mode', TEXT_MUTED);
    cell(1, 10, tpModeStr, tpModeCol);
    cell(0, 11, 'Next TP Scale', TEXT_MUTED, TABLE_ROW_ALT);
    cell(1, 11, dynScaleStr, tpModeCol, TABLE_ROW_ALT);
    cell(0, 12, trade.dir !== 0 ? 'Active R' : 'Next R', TEXT_MUTED);
    cell(1, 12, liveRStr, TEXT_COLOR);
    cell(0, 13, 'Status', TEXT_MUTED, TABLE_ROW_ALT);
    cell(1, 13, warmStr, isWarmedUp ? cfg.bullColor : NEUTRAL_YELLOW, TABLE_ROW_ALT);
    cell(0, 14, 'Version', TEXT_MUTED);
    cell(1, 14, INDICATOR_VERSION, TEXT_MUTED);

    let row = 15;
    if (cfg.showTqiBreakdown && cfg.useTqi) {
      cell(0, row, 'TQI Components', HEADER_TEXT, HEADER_BG, true);
      cell(1, row, '0..1', HEADER_TEXT, HEADER_BG, true);
      row += 1;
      cell(0, row, 'Efficiency', TEXT_MUTED);
      cell(1, row, tqiErStr, TEXT_COLOR);
      row += 1;
      cell(0, row, cfg.tqiVolMode, TEXT_MUTED, TABLE_ROW_ALT);
      cell(1, row, tqiVolStr, TEXT_COLOR, TABLE_ROW_ALT);
      row += 1;
      cell(0, row, 'Structure', TEXT_MUTED);
      cell(1, row, tqiStructStr, TEXT_COLOR);
      row += 1;
      cell(0, row, 'Mom Persist', TEXT_MUTED, TABLE_ROW_ALT);
      cell(1, row, tqiMomStr, TEXT_COLOR, TABLE_ROW_ALT);
      row += 1;
    }
    if (cfg.showPerf) {
      cell(0, row, gt(cfg.feePct, 0) || cfg.slippageTicks > 0 ? 'Model net R' : 'Model gross R', HEADER_TEXT, HEADER_BG, true);
      cell(1, row, sampleStr, HEADER_TEXT, HEADER_BG, true);
      row += 1;
      cell(0, row, 'Win Rate', TEXT_MUTED);
      cell(1, row, winRateStr, winRateCol);
      row += 1;
      cell(0, row, 'Avg R', TEXT_MUTED, TABLE_ROW_ALT);
      cell(1, row, avgRStr, avgRCol, TABLE_ROW_ALT);
      row += 1;
      cell(0, row, 'Closed DD (window R)', TEXT_MUTED);
      cell(1, row, winDDStr, sigCount < 5 ? TEXT_MUTED : cfg.bearColor);
      row += 1;
      cell(0, row, 'Closed DD (loaded R)', TEXT_MUTED, TABLE_ROW_ALT);
      cell(1, row, allDDStr, learn.allTimeCount === 0 ? TEXT_MUTED : cfg.bearColor, TABLE_ROW_ALT);
      row += 1;
      cell(0, row, 'Streak W/L', TEXT_MUTED);
      cell(1, row, streakStr, TEXT_COLOR);
      row += 1;
      cell(0, row, 'Regime Edge', TEXT_MUTED, TABLE_ROW_ALT);
      cell(1, row, regimeEdgeStr, regEdgeCol, TABLE_ROW_ALT);
      row += 1;
    }
    if (hasBreakdown) {
      cell(0, row, sideHdr, sideCol, HEADER_BG, true);
      cell(1, row, '/' + str.tostring(lastScoreMax, '0') + ' raw', HEADER_TEXT, HEADER_BG, true);
      row += 1;
      cell(0, row, 'Momentum', TEXT_MUTED);
      cell(1, row, bd(lastM), TEXT_COLOR);
      row += 1;
      cell(0, row, 'Efficiency', TEXT_MUTED, TABLE_ROW_ALT);
      cell(1, row, bd(lastE), TEXT_COLOR, TABLE_ROW_ALT);
      row += 1;
      cell(0, row, 'Volume', TEXT_MUTED);
      cell(1, row, bd(lastV), TEXT_COLOR);
      row += 1;
      cell(0, row, 'RSI Depth', TEXT_MUTED, TABLE_ROW_ALT);
      cell(1, row, bd(lastR), TEXT_COLOR, TABLE_ROW_ALT);
      row += 1;
      cell(0, row, 'Structure', TEXT_MUTED);
      cell(1, row, bd(lastS), TEXT_COLOR);
      row += 1;
      cell(0, row, 'ST Break', TEXT_MUTED, TABLE_ROW_ALT);
      cell(1, row, bd(lastB), TEXT_COLOR, TABLE_ROW_ALT);
    }
    const dashCorner = cfg.showTraderCard && cfg.dashPos === cfg.traderPos ? (cfg.dashPos === 'Top Right' ? 'Top Left' : 'Top Right') : cfg.dashPos;
    tables.push({
      position: cornerOf(dashCorner), columns: 2, rows: 50, cells,
      bgColor: TABLE_BG, borderColor: TABLE_BORDER, borderWidth: 1, frameColor: TABLE_BORDER, frameWidth: 1,
    });
  }

  if (cfg.showWatermark) {
    const clear = C(color.black, 100);
    tables.push({
      position: 'bottom_center', columns: 1, rows: 1,
      cells: [{ column: 0, row: 0, text: 'WillyAlgoTrader', textColor: WM_COLOR, textSize: 'normal', textHAlign: 'center', bgColor: clear }],
      bgColor: clear, borderColor: clear, borderWidth: 0, frameColor: clear, frameWidth: 0,
    });
  }

  // Trader card: model position, initial-risk accounting and late-entry geometry
  if (cfg.showTraderCard) {
    const c = close[last];
    // recentFlipCount = math.sum((flipUp or flipDown) ? 1.0 : 0.0, chopWindowInput)
    const recentFlipCount = A(math.sum(S(flips), cfg.chopWindow))[last];
    const havePlan = !Number.isNaN(trade.entry);
    const active = trade.dir !== 0;
    const openR = active ? trade.remaining * trade.side * (c - trade.entry) / trade.risk : 0.0;
    const realized = havePlan ? trade.takenR - trade.costR : NaN;
    const totalR = havePlan ? realized + openR : NaN;
    const driftR = havePlan ? trade.side * (c - trade.signalPrice) / trade.risk : NaN;
    const insidePlan = active && !trade.hit2 && gt(trade.side * (c - trade.sl), 0) && gt(trade.side * (trade.tp2 - c), 0);
    const newRR = insidePlan ? Math.abs(trade.tp2 - c) / Math.abs(c - trade.sl) : NaN;
    const nextTarget = trade.hit1 ? (trade.hit2 ? trade.tp3 : trade.tp2) : trade.tp1;
    const stamp = (t: number) => str.format_time(t, 'MM-dd HH:mm', TIMEZONE);
    const stateText = active ? (trade.side === 1 ? 'LONG' : 'SHORT') + ' | confirmed ' + stamp(trade.entryTime)
      : havePlan ? 'CLOSED: ' + lastExitReason + ' ' + stamp(lastExitTime) : 'No model trade';
    let healthText = !isWarmedUp ? 'Warming up / missing data' : 'Data ready';
    healthText += !hasVolume[last] ? ' | volume n/a' : '';
    healthText += !(trend === 1 ? validLowPivot : validHighPivot) ? ' | no recent pivot' : '';
    healthText += ge(recentFlipCount, cfg.chopCount) ? ' | frequent flips' : '';
    healthText += !lastConfirmed ? ' | current bar provisional' : '';
    const planText = havePlan ? tickText(trade.entry) + ' / ' + tickText(trade.sl) : '—';
    const riskText = havePlan
      ? tickText(trade.risk) + ' | ' + str.tostring(trade.risk / MINTICK, '0') + ' ticks | '
        + str.tostring(safeDiv(trade.risk * 100, Math.abs(trade.entry)), '0.00') + '%'
      : '—';
    const targetsText = havePlan ? tickText(trade.tp1) + ' / ' + tickText(trade.tp2) + ' / ' + tickText(trade.tp3) : '—';
    const amountText = havePlan
      ? str.tostring(trade.remaining * 100, '0.0') + '% | TP ' + (trade.hit1 ? '1✓ ' : '1— ') + (trade.hit2 ? '2✓ ' : '2— ') + (trade.hit3 ? '3✓' : '3—')
      : '—';
    const pnlText = havePlan ? signedR(realized) + ' / ' + signedR(openR) + ' / ' + signedR(totalR) + ' R0' : '—';
    const distanceText = active
      ? str.tostring(trade.side * (c - trade.sl) / trade.risk, '0.00') + ' / ' + str.tostring(trade.side * (nextTarget - c) / trade.risk, '0.00') + ' R0'
      : '—';
    const ageText = active
      ? str.tostring(last - trade.entryBar) + ' bars | timeout in ' + str.tostring(Math.max(0, cfg.tradeMaxAge - (last - trade.entryBar)))
      : '—';
    const lateText = !active ? 'No active plan' : trade.hit2 ? 'TP2 already filled; re-entry not modeled'
      : !insidePlan ? 'SL breached / TP2 reached'
        : 'TP2 RR ' + str.tostring(newRR, '0.00') + ' | drift ' + signedR(driftR) + 'R0' + (gt(driftR, cfg.lateEntryR) ? ' | LATE' : '');
    const snapshotText = havePlan
      ? trade.reason + ' | score ' + str.tostring(trade.entryScore, '0') + ' | TQI ' + (cfg.useTqi ? str.tostring(trade.entryTqi, '0.00') : 'off')
      : '—';
    const calibText = !cfg.useAutoCalib || !cfg.useTqi ? 'Off'
      : 'Q ' + str.tostring(learn.effQ, '0.00') + ' | ' + learn.calibStatus + ' | n=' + str.tostring(learn.signalsSinceCalib);
    const names = ['SATS MODEL TRADE', 'State', 'Signal snapshot', 'Entry / SL', 'Initial risk', 'TP1 / TP2 / TP3', 'Remaining / hits',
      'Taken / open / total*', 'To SL / next TP', 'Age / timeout', 'Entry now (gross)', 'Data status', 'Signal limitations', 'Last rejected',
      'Calibration', 'Execution model'];
    const values = [INDICATOR_VERSION, stateText, snapshotText, planText, riskText, targetsText, amountText, pnlText, distanceText, ageText,
      lateText, healthText, havePlan ? (trade.limitations === '' ? 'No data limitations at entry' : trade.limitations) : '—',
      lastRejected === '' ? '—' : lastRejected, calibText,
      'Fee ' + str.tostring(cfg.feePct, '0.00') + '% / slip ' + str.tostring(cfg.slippageTicks) + 't; *open excludes exit costs'];
    const cells: TableCellData[] = [];
    for (let row = 0; row <= 15; row++) {
      const bgColor = row === 0 ? HEADER_BG : row % 2 === 0 ? TABLE_ROW_ALT : TABLE_BG;
      cells.push({ column: 0, row, text: names[row], textColor: row === 0 ? HEADER_TEXT : TEXT_MUTED, textSize: small, bgColor });
      cells.push({
        column: 1, row, text: values[row],
        textColor: row === 11 && (!isWarmedUp || !hasVolume[last]) ? NEUTRAL_YELLOW : TEXT_COLOR, textSize: small, bgColor,
      });
    }
    tables.push({ position: cornerOf(cfg.traderPos), columns: 2, rows: 16, cells, bgColor: TABLE_BG, borderColor: TABLE_BORDER, borderWidth: 1 });
  }

  // ── Output ──
  const interval = barInterval(bars);
  const X = (index: number) => barTime(bars, index, interval);
  const lines: LineDrawingData[] = [lineEntry, lineSL, lineTp1, lineTp2, lineTp3].filter((l): l is Ln => l !== null).map((l) => ({
    time1: X(l.x1), price1: l.y1, time2: X(l.x2), price2: l.y2, color: l.color, width: l.width, style: l.style,
  }));
  const outLabels: LabelData[] = labels.items.map((l) => ({
    time: X(l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style, size: small,
    ...(l.tooltip !== undefined ? { tooltip: l.tooltip } : {}),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    lines,
    labels: outLabels,
    tables,
    bgColors,
  };
}

export const SelfAwareTrendSystem = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
