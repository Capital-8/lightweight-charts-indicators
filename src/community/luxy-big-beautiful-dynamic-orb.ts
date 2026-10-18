/**
 * Luxy BIG beautiful Dynamic ORB - v5
 *
 * Opening range breakout with four stages (the first 5, 15, 30 and 60 minutes of the session).
 * - Session: the native session of the symbol ("Auto-Detect"), the extended hours of a stock, or a custom session.
 *   A crypto symbol with its native session restarts on each new day of the exchange time zone; other symbols on a
 *   new session or a new day of the week. E-mini futures (ES, NQ, RTY, YM) use the "Futures Trading Hours" setting.
 * - Each stage builds its high / low from the session start until its length; a stage that starts without a value
 *   takes the range of the previous enabled stage once that one is complete. The largest completed stage is the
 *   active one. The plots draw each stage (high, low, mid and the fill between high and low) while it is the stage
 *   shown for the chart timeframe; on charts of 1 day or more there is no stage.
 * - Breakout: a close above the active high (below the low) plus a buffer (Breakout Buffer %, or 10 % of the ATR
 *   when "Adaptive Buffer" gives more), with optional volume and trend filters, once per direction until a retest,
 *   a failed break or a stop. A label shows the stage, the volume ratio and the GOD MODE quality score (volume,
 *   higher timeframe bias, opening range against the daily ATR, opening gap, confluence with the previous day high /
 *   low or the pre-session high / low, earlier breakouts of the session, capped at 40 on a chop day of two failed
 *   breaks).
 * - On the next bar: entry at the open, stop (ATR, ORB %, Swing, Safer, % Based, Smart Adaptive, Scaled ATR, with a
 *   minimum distance) and targets 1R / 1.5R / 2R / 3R (the nearer of the ORB width and the risk multiple), drawn as
 *   lines and labels until the last enabled target, the stop or the session end. Retests after a committed breakout
 *   and failed breaks are tracked; the last 10 breakout / retest labels are kept.
 * - Fair value gaps (three-bar gaps) while a stage is active, the last "Max FVG" kept; a filled gap is dashed and
 *   removed when it is more than 10 bars old.
 * - Edge labels with the active stage name at its high and low, 2 bars after the last bar.
 * - The dashboard (a table of the last bar): stage, range, volatility, GOD MODE score and day context, trend, higher
 *   timeframe bias, stage status, position size, trade levels, last trade and session statistics.
 *
 * Chart context (optional third argument): the chart timeframe; the exchange time zone and session (new days, the
 * daily and higher timeframe bars, custom sessions); the symbol type, ticker and currency; the state of the last bar
 * (no breakout, retest or failed break on an open last bar, and the higher timeframe values of the period in
 * progress there); the current time (timenow) for the market status of the dashboard. Without a context: UTC, no
 * symbol type, "USD", the last bar closed and the computer clock.
 *
 * Limits of the port:
 * - The daily values of GOD MODE (previous day high / low / close, daily ATR) and the higher timeframe bias are
 *   computed from the chart bars grouped by period: the first periods of the bars (and a daily close or volume that
 *   the exchange gives apart from its intraday bars) can differ.
 * - "Live Exchange Rates" with an account currency other than USD reads another symbol: the port throws an Error.
 *   A higher timeframe below the chart timeframe reads lower timeframe bars: the port throws an Error.
 * - Trend mode with VWAP on intraday bars needs the exchange time zone and session of the context (else an Error).
 *
 * Alerts: the 13 alert conditions (`alerts` of the result: breakout up / down, retest up / down, failed break up /
 * down, stage complete, entry, stop loss hit, TP1 / TP1.5 / TP2 / TP3 hit; the trade ones only with targets on and
 * the TP ones only for the targets shown) and the alert() messages (`alertCalls`, once per bar close) of a completed
 * stage, a breakout, a failed break and a shown retest.
 *
 * Reference: "Luxy BIG beautiful Dynamic ORB" by orenluxy
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, taCore, str, color, timeframe, time as ptime, callsite, line, label, box, resetDrawings, setDrawingBar,
  varDrawing, drawingOutputs, Series,
  type Box, type Label, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import { executeScript, ta as scriptTa } from 'oakscriptjs/script';
import type {
  AlertCall, BoxData, LabelData, LineDrawingData, TableCellData, TableData, TableMergeData, TablePosition,
} from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { chartTimeframe, higherTimeframeBars, periodStarts, timeAfterLastBar, type SecurityBars } from '../anchor-period';
import {
  currencyOf, lastBarConfirmedOf, nowOf, symbolTypeOf, tickerOf, timezoneOf, type ChartContext,
} from '../chart-context';

type LabelSizeName = 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
type StopMode = 'ATR' | 'ORB %' | 'Swing' | 'Safer' | 'Scaled ATR' | '% Based' | 'Smart Adaptive';
type TrendMode = 'VWAP' | 'EMA' | 'Custom EMA' | 'SuperTrend' | 'VWAP+EMA' | 'VWAP+SuperTrend';

export interface LuxyBigBeautifulDynamicOrbInputs {
  showEdgeLabels: boolean;
  labelFormat: 'Simple' | 'Detailed';
  labelSize: LabelSizeName;
  showBG: boolean;
  fillTransparency: number;
  enableORB5Signals: boolean;
  orb5LineColor: string;
  enableORB15Signals: boolean;
  orb15LineColor: string;
  enableORB30Signals: boolean;
  orb30LineColor: string;
  enableORB60Signals: boolean;
  orb60LineColor: string;
  showMidLine: boolean;
  sessionMode: 'Auto-Detect' | 'Custom';
  customSession: string;
  enableExtendedHours: boolean;
  extendedPreMarket: string;
  extendedAfterHours: string;
  futuresTradingHours: 'Auto-Detect' | 'RTH Only (9:30-16:00)' | 'Electronic Full Day (24hr)';
  enableBreakout: boolean;
  showBreakLabels: boolean;
  enableRetest: boolean;
  signalMode: 'First Only' | 'Track Cycles';
  maxCycles: number;
  breakoutBuffer: number;
  retestBuffer: number;
  minRetestDistancePct: number;
  minBarsOutside: number;
  /** Not used by the calculation of the original */
  minPullbackPct: number;
  /** Not used by the calculation of the original */
  enableFVGFilter: boolean;
  showFVG: boolean;
  maxFVGtoKeep: number;
  /** Not used by the calculation of the original */
  fvgProximity: number;
  fvgTransparency: number;
  fvgBullColor: string;
  fvgBearColor: string;
  /** Not used by the calculation of the original */
  enablePullbackFilter: boolean;
  /** Not used by the calculation of the original */
  pullbackPercent: number;
  /** Not used by the calculation of the original */
  pullbackTimeout: number;
  enableVolumeFilter: boolean;
  volumeMaLength: number;
  volumeMultiplier: number;
  strongVolumeMultiplier: number;
  enableTrendFilter: boolean;
  trendMode: TrendMode;
  customEmaLength: number;
  supertrendPeriod: number;
  supertrendMult: number;
  enableTargets: boolean;
  showTP1: boolean;
  showTP1_5: boolean;
  showTP2: boolean;
  showTP3: boolean;
  stopMode: StopMode;
  atrLength: number;
  atrMultiplier: number;
  percentBasedStop: number;
  stopOrbFraction: number;
  swingBars: number;
  showTPSLLines: boolean;
  freezeOnEOD: boolean;
  showDashboard: boolean;
  dashTheme: 'Dark' | 'Light';
  dashPos: 'Top Left' | 'Top Right' | 'Bottom Left' | 'Bottom Right' | 'Middle Right';
  dashSize: 'Auto' | 'Small' | 'Normal' | 'Large';
  showStage: boolean;
  showRange: boolean;
  showStatus: boolean;
  showVol: boolean;
  showTrend: boolean;
  showRisk: boolean;
  showVolatilityMeter: boolean;
  enablePosSizing: boolean;
  riskMode: '$ Amount' | '% of Account';
  fixedRisk: number;
  accountSize: number;
  riskPct: number;
  maxPositionPct: number;
  accountCurrency: 'USD' | 'EUR' | 'GBP' | 'JPY' | 'INR' | 'CAD' | 'AUD' | 'CHF';
  useDynamicRates: boolean;
  manualRate: number;
  enableHTF: boolean;
  htfTF: '15' | '30' | '60' | '120' | '240' | 'D' | 'W' | 'M';
  htfMethod: 'Price vs MA' | 'Candle Direction';
  htfEMA: number;
  htfMinStrength: number;
  godModeEnabled: boolean;
  godAdaptiveBuffer: boolean;
  godChopGuard: boolean;
  godShowScore: boolean;
}

export const defaultInputs: LuxyBigBeautifulDynamicOrbInputs = {
  showEdgeLabels: true,
  labelFormat: 'Detailed',
  labelSize: 'Small',
  showBG: true,
  fillTransparency: 95,
  enableORB5Signals: true,
  orb5LineColor: '#FDD835',
  enableORB15Signals: true,
  orb15LineColor: '#4CAF50',
  enableORB30Signals: true,
  orb30LineColor: '#2962FF',
  enableORB60Signals: true,
  orb60LineColor: '#9C27B0',
  showMidLine: true,
  sessionMode: 'Auto-Detect',
  customSession: '0930-1600',
  enableExtendedHours: false,
  extendedPreMarket: '0400-0930',
  extendedAfterHours: '1600-2000',
  futuresTradingHours: 'Auto-Detect',
  enableBreakout: true,
  showBreakLabels: true,
  enableRetest: true,
  signalMode: 'Track Cycles',
  maxCycles: 6,
  breakoutBuffer: 0.2,
  retestBuffer: 0.0,
  minRetestDistancePct: 0.5,
  minBarsOutside: 2,
  minPullbackPct: 0.3,
  enableFVGFilter: false,
  showFVG: true,
  maxFVGtoKeep: 5,
  fvgProximity: 2.0,
  fvgTransparency: 90,
  fvgBullColor: '#4CAF50',
  fvgBearColor: '#FF9800',
  enablePullbackFilter: false,
  pullbackPercent: 0.3,
  pullbackTimeout: 10,
  enableVolumeFilter: false,
  volumeMaLength: 20,
  volumeMultiplier: 1.5,
  strongVolumeMultiplier: 2.0,
  enableTrendFilter: false,
  trendMode: 'VWAP',
  customEmaLength: 50,
  supertrendPeriod: 10,
  supertrendMult: 3.0,
  enableTargets: true,
  showTP1: true,
  showTP1_5: false,
  showTP2: true,
  showTP3: false,
  stopMode: 'ATR',
  atrLength: 14,
  atrMultiplier: 1.5,
  percentBasedStop: 1.0,
  stopOrbFraction: 20,
  swingBars: 3,
  showTPSLLines: true,
  freezeOnEOD: true,
  showDashboard: true,
  dashTheme: 'Dark',
  dashPos: 'Bottom Left',
  dashSize: 'Auto',
  showStage: true,
  showRange: true,
  showStatus: true,
  showVol: true,
  showTrend: true,
  showRisk: true,
  showVolatilityMeter: true,
  enablePosSizing: true,
  riskMode: '$ Amount',
  fixedRisk: 150,
  accountSize: 25000,
  riskPct: 0.5,
  maxPositionPct: 25.0,
  accountCurrency: 'USD',
  useDynamicRates: true,
  manualRate: 1.0,
  enableHTF: true,
  htfTF: 'D',
  htfMethod: 'Price vs MA',
  htfEMA: 20,
  htfMinStrength: 2.0,
  godModeEnabled: true,
  godAdaptiveBuffer: true,
  godChopGuard: true,
  godShowScore: true,
};

const GRP_COLORS = '🎨 ORB COLORS ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_SESSION = '⏰ SESSION SETTINGS ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_BREAKOUT = '⚡ BREAKOUT DETECTION ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_TARGETS = '🎯 TARGETS & RISK ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_FVG = '↩️ FVG FILTER ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_LINES = '📍 TP/SL LINES ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_PULLBACK = '↩️ PULLBACK FILTER ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_VOLUME = '📊 VOLUME FILTER ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_TREND = '📈 TREND FILTER ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_DASH = '📊 DASHBOARD ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_HTF = '📈 HIGHER TIMEFRAME ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
const GRP_GOD = '⚡ GOD MODE ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';

export const inputConfig: InputConfig[] = [
  { id: 'showEdgeLabels', type: 'bool', title: 'Show Edge Labels', defval: true, inline: 'core', group: GRP_COLORS },
  { id: 'labelFormat', type: 'string', title: 'Label Format', defval: 'Detailed', options: ['Simple', 'Detailed'], group: GRP_COLORS, inline: 'core1' },
  { id: 'labelSize', type: 'string', title: 'All Label Size', defval: 'Small', inline: 'core1', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: GRP_COLORS },
  { id: 'showBG', type: 'bool', title: 'Show Background', defval: true, inline: 'BG', group: GRP_COLORS },
  { id: 'fillTransparency', type: 'int', title: '  | Transparency', defval: 95, inline: 'BG', min: 0, max: 100, step: 5, group: GRP_COLORS },
  { id: 'enableORB5Signals', type: 'bool', title: 'Enable ORB 5', defval: true, group: GRP_COLORS, inline: '5-15' },
  { id: 'orb5LineColor', type: 'color', title: '', defval: '#FDD835', inline: '5-15', group: GRP_COLORS },
  { id: 'enableORB15Signals', type: 'bool', title: 'Enable ORB15', defval: true, group: GRP_COLORS, inline: '5-15' },
  { id: 'orb15LineColor', type: 'color', title: '', defval: '#4CAF50', inline: '5-15', group: GRP_COLORS },
  { id: 'enableORB30Signals', type: 'bool', title: 'Enable ORB30', defval: true, group: GRP_COLORS, inline: '30-60' },
  { id: 'orb30LineColor', type: 'color', title: '', defval: '#2962FF', inline: '30-60', group: GRP_COLORS },
  { id: 'enableORB60Signals', type: 'bool', title: 'Enable ORB60', defval: true, group: GRP_COLORS, inline: '30-60' },
  { id: 'orb60LineColor', type: 'color', title: '', defval: '#9C27B0', inline: '30-60', group: GRP_COLORS },
  { id: 'showMidLine', type: 'bool', title: 'Mid-Range Line', defval: true, group: GRP_COLORS },
  { id: 'sessionMode', type: 'string', title: 'Session Mode', defval: 'Auto-Detect', options: ['Auto-Detect', 'Custom'], group: GRP_SESSION },
  { id: 'customSession', type: 'session', title: 'Custom Session Hours', defval: '0930-1600', group: GRP_SESSION },
  { id: 'enableExtendedHours', type: 'bool', title: 'Include Extended Hours', defval: false, group: GRP_SESSION, inline: 'ext1' },
  { id: 'extendedPreMarket', type: 'session', title: 'Pre-Market', defval: '0400-0930', group: GRP_SESSION, inline: 'ext2' },
  { id: 'extendedAfterHours', type: 'session', title: 'After-Hours', defval: '1600-2000', group: GRP_SESSION, inline: 'ext3' },
  { id: 'futuresTradingHours', type: 'string', title: 'Futures Trading Hours', defval: 'Auto-Detect', options: ['Auto-Detect', 'RTH Only (9:30-16:00)', 'Electronic Full Day (24hr)'], group: GRP_SESSION },
  { id: 'enableBreakout', type: 'bool', title: 'Enable Breakout Detection', defval: true, inline: 'Show', group: GRP_BREAKOUT },
  { id: 'showBreakLabels', type: 'bool', title: 'Show Breakout Labels', defval: true, group: GRP_BREAKOUT, inline: 'Show' },
  { id: 'enableRetest', type: 'bool', title: 'Show Retest Labels', defval: true, group: GRP_BREAKOUT, inline: 'retest' },
  { id: 'signalMode', type: 'string', title: 'Signal Mode', defval: 'Track Cycles', options: ['First Only', 'Track Cycles'], group: GRP_BREAKOUT, inline: 'mode' },
  { id: 'maxCycles', type: 'int', title: 'Max Cycles', defval: 6, min: 1, max: 10, group: GRP_BREAKOUT, inline: 'mode' },
  { id: 'breakoutBuffer', type: 'float', title: 'Breakout Buffer (%)', defval: 0.2, min: 0, max: 5, step: 0.1, group: GRP_BREAKOUT, inline: 'buffer' },
  { id: 'retestBuffer', type: 'float', title: 'Retest Buffer (%)', defval: 0.0, min: 0, max: 5, step: 0.1, group: GRP_BREAKOUT, inline: 'buffer' },
  { id: 'minRetestDistancePct', type: 'float', title: 'Min Distance for Retest (%)', defval: 0.5, min: 0.5, max: 10, step: 0.5, group: GRP_BREAKOUT },
  { id: 'minBarsOutside', type: 'int', title: 'Min Bars Outside ORB', defval: 2, min: 1, max: 10, group: GRP_BREAKOUT },
  { id: 'minPullbackPct', type: 'float', title: 'Min Pullback for Re-break (%)', defval: 0.3, min: 0.1, max: 2, step: 0.1, group: GRP_BREAKOUT },
  { id: 'enableFVGFilter', type: 'bool', title: 'Enable FVG Filter  | ', defval: false, group: GRP_FVG, inline: 'fvg1' },
  { id: 'showFVG', type: 'bool', title: 'Show FVG Boxes', defval: true, group: GRP_FVG, inline: 'fvg1' },
  { id: 'maxFVGtoKeep', type: 'int', title: 'Max FVG', defval: 5, min: 1, max: 20, inline: 'fvg2', group: GRP_FVG },
  { id: 'fvgProximity', type: 'float', title: 'FVG Proximity', defval: 2.0, min: 0.5, max: 5.0, inline: 'fvg2', step: 0.5, group: GRP_FVG },
  { id: 'fvgTransparency', type: 'int', title: 'Transparency', defval: 90, min: 0, max: 100, step: 5, inline: 'fvgcolor', group: GRP_FVG },
  { id: 'fvgBullColor', type: 'color', title: 'Bullish FVG', defval: '#4CAF50', inline: 'fvgcolor', group: GRP_FVG },
  { id: 'fvgBearColor', type: 'color', title: 'Bearish FVG', defval: '#FF9800', inline: 'fvgcolor', group: GRP_FVG },
  { id: 'enablePullbackFilter', type: 'bool', title: 'Enable Pullback Filter', defval: false, group: GRP_PULLBACK },
  { id: 'pullbackPercent', type: 'float', title: 'Pullback Required (%)', defval: 0.3, min: 0.1, max: 2.0, step: 0.1, group: GRP_PULLBACK, inline: 'pb' },
  { id: 'pullbackTimeout', type: 'int', title: 'Timeout (bars)', defval: 10, min: 3, max: 30, group: GRP_PULLBACK, inline: 'pb' },
  { id: 'enableVolumeFilter', type: 'bool', title: 'Enable Volume Filter', defval: false, group: GRP_VOLUME, inline: 'enable' },
  { id: 'volumeMaLength', type: 'int', title: '| MA Length', defval: 20, min: 1, group: GRP_VOLUME, inline: 'enable' },
  { id: 'volumeMultiplier', type: 'float', title: 'Min Volume ×', defval: 1.5, min: 0.5, step: 0.1, group: GRP_VOLUME, inline: 'mult' },
  { id: 'strongVolumeMultiplier', type: 'float', title: 'Strong ×', defval: 2.0, min: 1.0, step: 0.1, group: GRP_VOLUME, inline: 'mult' },
  { id: 'enableTrendFilter', type: 'bool', title: 'Enable Trend Filter', defval: false, group: GRP_TREND, inline: 'FILTER' },
  { id: 'trendMode', type: 'string', title: '| Trend Mode', defval: 'VWAP', inline: 'FILTER', options: ['VWAP', 'EMA', 'Custom EMA', 'SuperTrend', 'VWAP+EMA', 'VWAP+SuperTrend'], group: GRP_TREND },
  { id: 'customEmaLength', type: 'int', title: 'Custom EMA Length', defval: 50, min: 1, group: GRP_TREND, inline: 'ema' },
  { id: 'supertrendPeriod', type: 'int', title: 'SuperTrend Period', defval: 10, min: 1, group: GRP_TREND, inline: 'st' },
  { id: 'supertrendMult', type: 'float', title: 'Mult', defval: 3.0, min: 0.1, step: 0.1, group: GRP_TREND, inline: 'st' },
  { id: 'enableTargets', type: 'bool', title: 'Enable Targets & Stop-Loss', defval: true, group: GRP_TARGETS },
  { id: 'showTP1', type: 'bool', title: 'TP1 (1R)', defval: true, group: GRP_TARGETS, inline: 'show' },
  { id: 'showTP1_5', type: 'bool', title: 'TP1.5 (1.5R)', defval: false, group: GRP_TARGETS, inline: 'show' },
  { id: 'showTP2', type: 'bool', title: 'TP2 (2R)', defval: true, group: GRP_TARGETS, inline: 'show' },
  { id: 'showTP3', type: 'bool', title: 'TP3 (3R)', defval: false, group: GRP_TARGETS, inline: 'show' },
  { id: 'stopMode', type: 'string', title: 'Stop Method', defval: 'ATR', options: ['ATR', 'ORB %', 'Swing', 'Safer', 'Scaled ATR', '% Based', 'Smart Adaptive'], group: GRP_TARGETS, inline: 'tgt' },
  { id: 'atrLength', type: 'int', title: 'ATR', defval: 14, min: 5, max: 50, group: GRP_TARGETS, inline: 'atr2' },
  { id: 'atrMultiplier', type: 'float', title: '×', defval: 1.5, min: 0.5, max: 3, step: 0.1, group: GRP_TARGETS, inline: 'atr2' },
  { id: 'percentBasedStop', type: 'float', title: '% Based Stop', defval: 1.0, min: 0.1, max: 5.0, step: 0.1, group: GRP_TARGETS, inline: 'pct' },
  { id: 'stopOrbFraction', type: 'float', title: 'ORB Stop %', defval: 20, min: 10, max: 50, step: 5, group: GRP_TARGETS, inline: 'stop' },
  { id: 'swingBars', type: 'int', title: 'Swing Bars', defval: 3, min: 1, max: 10, group: GRP_TARGETS, inline: 'stop' },
  { id: 'showTPSLLines', type: 'bool', title: 'Show TP/SL Lines on Chart', defval: true, group: GRP_LINES },
  { id: 'freezeOnEOD', type: 'bool', title: 'Freeze Lines at End of Day', defval: true, group: GRP_LINES, inline: 'freeze' },
  { id: 'showDashboard', type: 'bool', title: 'Show Info Panel', defval: true, group: GRP_DASH, inline: 'theme' },
  { id: 'dashTheme', type: 'string', title: '| Theme', defval: 'Dark', options: ['Dark', 'Light'], group: GRP_DASH, inline: 'theme' },
  { id: 'dashPos', type: 'string', title: 'Position', defval: 'Bottom Left', options: ['Top Left', 'Top Right', 'Bottom Left', 'Bottom Right', 'Middle Right'], group: GRP_DASH, inline: 'pos' },
  { id: 'dashSize', type: 'string', title: 'Text Size', defval: 'Auto', options: ['Auto', 'Small', 'Normal', 'Large'], group: GRP_DASH, inline: 'pos' },
  { id: 'showStage', type: 'bool', title: 'Show Stage', defval: true, group: GRP_DASH, inline: 'rows1' },
  { id: 'showRange', type: 'bool', title: 'Show Range', defval: true, group: GRP_DASH, inline: 'rows1' },
  { id: 'showStatus', type: 'bool', title: 'Show Status', defval: true, group: GRP_DASH, inline: 'rows1' },
  { id: 'showVol', type: 'bool', title: 'Show Volume', defval: true, group: GRP_DASH, inline: 'rows2' },
  { id: 'showTrend', type: 'bool', title: 'Show Trend', defval: true, group: GRP_DASH, inline: 'rows2' },
  { id: 'showRisk', type: 'bool', title: 'Show Risk/Reward', defval: true, group: GRP_DASH, inline: 'rows2' },
  { id: 'showVolatilityMeter', type: 'bool', title: 'Show Volatility Meter', defval: true, group: GRP_DASH, inline: 'rows3' },
  { id: 'enablePosSizing', type: 'bool', title: 'Calculate Position Size', defval: true, group: GRP_DASH },
  { id: 'riskMode', type: 'string', title: 'Risk', defval: '$ Amount', options: ['$ Amount', '% of Account'], group: GRP_DASH, inline: 'risk' },
  { id: 'fixedRisk', type: 'float', title: '$', defval: 150, min: 10, max: 10000, group: GRP_DASH, inline: 'risk' },
  { id: 'accountSize', type: 'float', title: 'Account $', defval: 25000, min: 1000, group: GRP_DASH, inline: 'acct' },
  { id: 'riskPct', type: 'float', title: 'Risk %', defval: 0.5, min: 0.1, max: 5, step: 0.1, group: GRP_DASH, inline: 'acct' },
  { id: 'maxPositionPct', type: 'float', title: 'Max Position %', defval: 25.0, min: 5, max: 100, step: 5, group: GRP_DASH, inline: 'poslimit' },
  { id: 'accountCurrency', type: 'string', title: 'Account Currency', defval: 'USD', options: ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD', 'CHF'], group: GRP_DASH, inline: 'currency' },
  { id: 'useDynamicRates', type: 'bool', title: 'Live Exchange Rates', defval: true, group: GRP_DASH, inline: 'exchange' },
  { id: 'manualRate', type: 'float', title: '/ Or set manual Rate: $1=', defval: 1.0, min: 0.001, max: 10000, step: 0.1, group: GRP_DASH, inline: 'exchange' },
  { id: 'enableHTF', type: 'bool', title: 'Check Daily Trend', defval: true, group: GRP_HTF },
  { id: 'htfTF', type: 'string', title: 'Timeframe', defval: 'D', options: ['15', '30', '60', '120', '240', 'D', 'W', 'M'], group: GRP_HTF, inline: 'htf' },
  { id: 'htfMethod', type: 'string', title: 'Method', defval: 'Price vs MA', options: ['Price vs MA', 'Candle Direction'], group: GRP_HTF, inline: 'htf' },
  { id: 'htfEMA', type: 'int', title: 'MA', defval: 20, min: 5, max: 200, group: GRP_HTF, inline: 'htf2' },
  { id: 'htfMinStrength', type: 'float', title: 'Min Distance %', defval: 2.0, min: 0.0, max: 10.0, step: 0.5, group: GRP_HTF, inline: 'htf2' },
  { id: 'godModeEnabled', type: 'bool', title: 'Enable GOD MODE', defval: true, group: GRP_GOD },
  { id: 'godAdaptiveBuffer', type: 'bool', title: 'Adaptive Buffer', defval: true, group: GRP_GOD, inline: 'god1' },
  { id: 'godChopGuard', type: 'bool', title: 'Chop-Day Guard', defval: true, group: GRP_GOD, inline: 'god1' },
  { id: 'godShowScore', type: 'bool', title: 'Score on Labels', defval: true, group: GRP_GOD, inline: 'god1' },
];

const STAGE_NAMES = ['ORB5', 'ORB15', 'ORB30', 'ORB60'] as const;

export const plotConfig: PlotConfig[] = STAGE_NAMES.flatMap((name, k) => {
  const c = [defaultInputs.orb5LineColor, defaultInputs.orb15LineColor, defaultInputs.orb30LineColor, defaultInputs.orb60LineColor][k];
  return [
    { id: `plot${3 * k}`, title: `${name} High`, color: String(color.new(c, 0)), lineWidth: 1, style: 'linebr' as const },
    { id: `plot${3 * k + 1}`, title: `${name} Low`, color: String(color.new(c, 0)), lineWidth: 1, style: 'linebr' as const },
    { id: `plot${3 * k + 2}`, title: `${name} Mid`, color: String(color.new(c, 30)), lineWidth: 1, style: 'linebr' as const },
  ];
});

export const fillConfig: FillConfig[] = STAGE_NAMES.map((name, k) => {
  const c = [defaultInputs.orb5LineColor, defaultInputs.orb15LineColor, defaultInputs.orb30LineColor, defaultInputs.orb60LineColor][k];
  return { id: `fill${k}`, plot1: `plot${3 * k}`, plot2: `plot${3 * k + 1}`, color: String(color.new(c, 95)), title: `${name} Fill` };
});

export const metadata = {
  title: 'Luxy BIG beautiful Dynamic ORB - v5',
  shortTitle: 'Luxy Big Beautiful ORB',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500, max_boxes_count = 300) */
const LIMITS = { line: 500, label: 500, box: 300 };
const LABEL_OFFSET_ATR_MULTIPLIER = 0.8;
const LABEL_OFFSET_BARS = 2;
const MAX_BARS_FAILED_BREAK = 5;
const MAX_LABELS_TO_KEEP = 10;
const MAX_LINES_TO_KEEP = 20;

/** Pine float comparisons: a > b only when a - b > 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a - b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a - b) && !(a - b > EPS);
const ne = (a: number, b: number) => !Number.isNaN(a - b) && Math.abs(a - b) > EPS;
const isNa = (v: number) => Number.isNaN(v);
const nz = (v: number, d = 0) => (Number.isNaN(v) ? d : v);
const pmax = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.max(a, b));
const pmin = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.min(a, b));

// Pine v6 colour constants
const C_AQUA = '#00BCD4';
const C_ORANGE = '#FF9800';
const C_RED = '#F23645';
const C_GREEN = '#4CAF50';
const C_WHITE = '#FFFFFF';
const C_BLACK = '#363A45';
const C_GRAY = '#787B86';
const C_SILVER = '#B2B5BE';
const C_LIME = '#00E676';
const C_YELLOW = '#FDD835';
const C_BLUE = '#2962FF';
/** Default text colour of a table cell */
const CELL_TEXT = '#363A45';

const cnew = (c: string, t: number) => String(color.new(c, t));

interface OrbData {
  name: string;
  minutes: number;
  high: number;
  low: number;
  mid: number;
  orbRange: number;
  isEnabled: boolean;
  isBuilding: boolean;
  isComplete: boolean;
  completionBar: number;
  breakoutUp: boolean;
  breakoutDown: boolean;
  breakoutBar: number;
  breakoutLevel: number;
  cyclesUp: number;
  cyclesDown: number;
  orbColor: string;
}

const STOCK_TYPES = ['stock', 'fund', 'index', 'dr', 'etf'];

export function calculate(
  bars: Bar[],
  inputs: Partial<LuxyBigBeautifulDynamicOrbInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[]; tables: TableData[] }
  & { alerts: AlertConditionState[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const ms = n > 0 && bars[0].time >= 1e12;
  const T = (i: number) => (ms ? bars[i].time : bars[i].time * 1000);

  // ---------------------------------------------------------------- input validation (runtime.error)
  const num = (v: number) => str.tostring(v);
  if (cfg.breakoutBuffer < 0 || cfg.breakoutBuffer > 5) throw new Error(`❌ Breakout Buffer must be between 0-5%. Current value: ${num(cfg.breakoutBuffer)}`);
  if (cfg.minRetestDistancePct < 0.5) throw new Error(`❌ Min Retest Distance too low. Must be >= 0.5% to prevent false signals. Current: ${num(cfg.minRetestDistancePct)}`);
  if (cfg.minBarsOutside < 1) throw new Error(`❌ Min Bars Outside must be >= 1. Current: ${num(cfg.minBarsOutside)}`);
  if (cfg.maxCycles < 1 || cfg.maxCycles > 10) throw new Error(`❌ Max Cycles must be between 1-10. Current: ${num(cfg.maxCycles)}`);
  if (cfg.enableVolumeFilter) {
    if (cfg.volumeMultiplier < 0.5) throw new Error(`❌ Volume Multiplier too low. Must be >= 0.5x. Current: ${num(cfg.volumeMultiplier)}`);
    if (cfg.strongVolumeMultiplier < cfg.volumeMultiplier) throw new Error(`❌ Strong Volume Multiplier must be >= Min Volume Multiplier. Strong: ${num(cfg.strongVolumeMultiplier)}, Min: ${num(cfg.volumeMultiplier)}`);
    if (cfg.volumeMaLength < 1) throw new Error(`❌ Volume MA Length must be >= 1. Current: ${num(cfg.volumeMaLength)}`);
  }
  if (cfg.enableTargets) {
    if (cfg.atrLength < 5 || cfg.atrLength > 50) throw new Error(`❌ ATR Length must be between 5-50. Current: ${num(cfg.atrLength)}`);
    if (cfg.atrMultiplier < 0.5 || cfg.atrMultiplier > 5) throw new Error(`❌ ATR Multiplier must be between 0.5-5. Current: ${num(cfg.atrMultiplier)}`);
    if (cfg.stopOrbFraction < 10 || cfg.stopOrbFraction > 100) throw new Error(`❌ ORB Stop % must be between 10-100%. Current: ${num(cfg.stopOrbFraction)}`);
    if (cfg.swingBars < 1 || cfg.swingBars > 20) throw new Error(`❌ Swing Bars must be between 1-20. Current: ${num(cfg.swingBars)}`);
  }
  if (cfg.enablePosSizing) {
    if (cfg.riskMode === '$ Amount' && cfg.fixedRisk < 10) throw new Error(`❌ Fixed Risk too low. Must be >= $10. Current: $${num(cfg.fixedRisk)}`);
    if (cfg.riskMode === '% of Account') {
      if (cfg.riskPct < 0.1 || cfg.riskPct > 10) throw new Error(`❌ Risk % must be between 0.1-10%. Current: ${num(cfg.riskPct)}%`);
      if (cfg.accountSize < 100) throw new Error(`❌ Account Size too low. Must be >= $100. Current: $${num(cfg.accountSize)}`);
    }
  }
  if (cfg.fillTransparency < 0 || cfg.fillTransparency > 100) throw new Error(`❌ Fill Transparency must be between 0-100%. Current: ${num(cfg.fillTransparency)}`);
  if (cfg.enableHTF && (cfg.htfEMA < 5 || cfg.htfEMA > 200)) throw new Error(`❌ HTF EMA period must be between 5-200. Current: ${num(cfg.htfEMA)}`);
  if (cfg.enableTrendFilter) {
    if (cfg.customEmaLength < 1 || cfg.customEmaLength > 500) throw new Error(`❌ Custom EMA Length must be between 1-500. Current: ${num(cfg.customEmaLength)}`);
    if (cfg.supertrendPeriod < 1 || cfg.supertrendPeriod > 50) throw new Error(`❌ SuperTrend Period must be between 1-50. Current: ${num(cfg.supertrendPeriod)}`);
    if (cfg.supertrendMult < 0.1 || cfg.supertrendMult > 10) throw new Error(`❌ SuperTrend Multiplier must be between 0.1-10. Current: ${num(cfg.supertrendMult)}`);
  }

  // ---------------------------------------------------------------- symbol and chart
  const tz = timezoneOf(chart);
  const symType = symbolTypeOf(chart);
  const ticker = tickerOf(chart);
  const symbolCurrency = currencyOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const timenow = nowOf(chart);
  const isStockType = STOCK_TYPES.includes(symType);
  const isStockOrFutures = isStockType || symType === 'futures';
  const tfStr = n > 0 ? chartTimeframe(bars, chart) : '';
  const tfSec = tfStr === '' ? NaN : timeframe.in_seconds(tfStr);
  const currentTFMinutes = tfSec / 60;
  const isHTF = tfSec >= 86400;
  const barMs = tfSec * 1000;
  const last = n - 1;

  // exchange rate: request.security(currencyPair, "D", close) reads another symbol
  if (cfg.useDynamicRates && cfg.accountCurrency !== 'USD') {
    throw new Error('Luxy BIG beautiful Dynamic ORB: "Live Exchange Rates" reads the rate of another symbol, which the chart bars do not have; switch it off and set the manual rate');
  }
  const exchangeRate = cfg.accountCurrency === 'USD' ? 1.0 : cfg.manualRate;

  // ---------------------------------------------------------------- session string (inputs)
  let baseSession = '0930-1600:23456';
  if (cfg.sessionMode === 'Auto-Detect') {
    if (symType === 'futures') baseSession = '';
    else if (isStockType) {
      baseSession = cfg.enableExtendedHours
        ? `${cfg.extendedPreMarket.split('-')[0]}-${cfg.extendedAfterHours.split('-')[1]}:23456`
        : '';
    } else baseSession = '';
  } else if (cfg.sessionMode === 'Custom') {
    baseSession = cfg.customSession.includes(':') ? cfg.customSession : `${cfg.customSession}:23456`;
  }
  let sessionStartHour = NaN;
  let sessionStartMinute = NaN;
  let sessionEndHour = NaN;
  let sessionEndMinute = NaN;
  if (baseSession !== '') {
    const timeOnly = baseSession.includes(':') ? baseSession.split(':')[0] : baseSession;
    const parts = timeOnly.split('-');
    if (parts.length === 2) {
      const toInt = (s: string) => {
        const v = Number(s);
        return s.trim() === '' || Number.isNaN(v) ? NaN : Math.trunc(v);
      };
      if (parts[0].length === 4) {
        sessionStartHour = toInt(parts[0].substring(0, 2));
        sessionStartMinute = toInt(parts[0].substring(2, 4));
      }
      if (parts[1].length === 4) {
        sessionEndHour = toInt(parts[1].substring(0, 2));
        sessionEndMinute = toInt(parts[1].substring(2, 4));
      }
    }
  }
  const isEmini = symType === 'futures' && ['ES', 'NQ', 'RTY', 'YM'].some((s) => ticker.includes(s));

  // ---------------------------------------------------------------- series
  const closeS = new Series(bars, (b) => b.close);
  const volArr = bars.map((b) => b.volume ?? NaN);
  const volumeMAArr = ta.sma(new Series(bars, (b) => b.volume ?? NaN), cfg.volumeMaLength).toArray().map((v) => v ?? NaN);
  const trArr = ta.tr(bars, true).toArray().map((v) => v ?? NaN);
  // time("D"): a new day of the exchange calendar
  const dayStarts = n > 0 && !isHTF ? periodStarts(bars, 'D', chart) : [];

  // trend values (computed on every bar when the filter is on)
  const wantVwap = cfg.enableTrendFilter && cfg.trendMode.includes('VWAP');
  const wantEma12 = cfg.enableTrendFilter && (cfg.trendMode === 'EMA' || cfg.trendMode === 'VWAP+EMA');
  const wantEmaCustom = cfg.enableTrendFilter && cfg.trendMode === 'Custom EMA';
  const wantST = cfg.enableTrendFilter && cfg.trendMode.includes('SuperTrend');
  let vwapArr: number[] = [];
  if (wantVwap && n > 0) {
    if (!isHTF) {
      if (chart?.timezone === undefined || chart.session === undefined) {
        throw new Error('Luxy BIG beautiful Dynamic ORB: the trend mode VWAP restarts on each trading day on intraday bars, which needs the exchange time zone and session of the chart context');
      }
      executeScript(() => { vwapArr = scriptTa.vwap(closeS).toArray().map((v) => v ?? NaN); }, bars, {}, chart);
    } else {
      // daily and higher bars: a new anchor on every bar
      vwapArr = bars.map((b) => (b.close * (b.volume ?? NaN)) / (b.volume ?? NaN));
    }
  }
  const ema12Arr = wantEma12 ? ta.ema(closeS, 12).toArray().map((v) => v ?? NaN) : [];
  const emaCustomArr = wantEmaCustom ? ta.ema(closeS, cfg.customEmaLength).toArray().map((v) => v ?? NaN) : [];
  // calcSuperTrend(supertrendPeriod, supertrendMult), called on every bar (barstate.isnew)
  const stDirArr: number[] = new Array(n).fill(0);
  const stLowerArr: number[] = new Array(n).fill(NaN);
  if (wantST) {
    const atrST = ta.atr(bars, cfg.supertrendPeriod).toArray().map((v) => v ?? NaN);
    let fu = NaN;
    let fl = NaN;
    let dir = NaN;
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const hl2 = (b.high + b.low) / 2;
      const bu = hl2 + cfg.supertrendMult * atrST[i];
      const bl = hl2 - cfg.supertrendMult * atrST[i];
      const prevClose = i > 0 ? bars[i - 1].close : NaN;
      const fuPrev = fu;
      const flPrev = fl;
      fu = isNa(fuPrev) || lt(bu, fuPrev) || gt(prevClose, fuPrev) ? bu : fuPrev;
      fl = isNa(flPrev) || gt(bl, flPrev) || lt(prevClose, flPrev) ? bl : flPrev;
      dir = isNa(dir) ? 1 : gt(b.close, fuPrev) ? 1 : lt(b.close, flPrev) ? -1 : dir;
      stDirArr[i] = dir;
      stLowerArr[i] = fl;
    }
  }

  // request.security(syminfo.tickerid, "D", [high[1], low[1], close[1], ta.atr(14)[1]]): the latest completed day,
  // and on an open last bar the day in progress
  const lastLive = !lastConfirmed;
  const secIndex = (sec: SecurityBars, i: number) => (i === last && lastLive ? sec.group[i] : sec.latest[i]);
  const prevDayHigh: number[] = new Array(n).fill(NaN);
  const prevDayLow: number[] = new Array(n).fill(NaN);
  const prevDayClose: number[] = new Array(n).fill(NaN);
  const dailyAtr: number[] = new Array(n).fill(NaN);
  if (!isHTF && n > 1) {
    const sec = higherTimeframeBars(bars, 'D', chart);
    const atr14 = ta.atr(sec.htf, 14).toArray().map((v) => v ?? NaN);
    for (let i = 0; i < n; i++) {
      const g = secIndex(sec, i);
      if (g >= 1) {
        prevDayHigh[i] = sec.htf[g - 1].high;
        prevDayLow[i] = sec.htf[g - 1].low;
        prevDayClose[i] = sec.htf[g - 1].close;
        dailyAtr[i] = atr14[g - 1];
      }
    }
  }

  // Higher timeframe bias of the dashboard (computed on the last bar)
  const htfBiasOfLastBar = (): { bullish: boolean; bearish: boolean; text: string; strength: number } | null => {
    // request.security(syminfo.tickerid, htfTF, [ta.change(time) != 0]) and the values of checkHTFBias()
    const htfSec = timeframe.in_seconds(cfg.htfTF);
    let hClose = NaN;
    let hOpen = NaN;
    let hMA = NaN;
    let changed = false;
    if (htfSec < tfSec) {
      throw new Error(`Luxy BIG beautiful Dynamic ORB: the higher timeframe "${cfg.htfTF}" is below the chart timeframe: it reads lower timeframe bars, which the chart bars do not have`);
    }
    if (htfSec === tfSec) {
      const ema = ta.ema(closeS, cfg.htfEMA).toArray();
      hClose = bars[last].close;
      hOpen = bars[last].open;
      hMA = ema[last] ?? NaN;
      changed = last > 0;
    } else {
      const sec = higherTimeframeBars(bars, cfg.htfTF, chart);
      const g = secIndex(sec, last);
      changed = g > 0;
      if (g >= 0) {
        const ema = ta.ema(new Series(sec.htf, (b) => b.close), cfg.htfEMA).toArray();
        hClose = sec.htf[g].close;
        hOpen = sec.htf[g].open;
        hMA = ema[g] ?? NaN;
      }
    }
    if (!changed) return null;
    let bullish = false;
    let bearish = false;
    let strength = 0;
    if (cfg.htfMethod === 'Price vs MA') {
      const distancePct = gt(hMA, 0) ? ((hClose - hMA) / hMA) * 100 : 0;
      strength = Math.abs(distancePct);
      const strongEnough = ge(strength, cfg.htfMinStrength);
      bullish = gt(hClose, hMA) && strongEnough;
      bearish = lt(hClose, hMA) && strongEnough;
    } else {
      const bodySize = Math.abs(hClose - hOpen);
      strength = gt(hClose, 0) ? (bodySize / hClose) * 100 : 0;
      bullish = gt(hClose, hOpen);
      bearish = lt(hClose, hOpen);
    }
    const text = bullish ? (gt(strength, cfg.htfMinStrength * 2) ? '✅✅ Strong Aligned' : '✅ Aligned')
      : bearish ? (gt(strength, cfg.htfMinStrength * 2) ? '⚠️ Strong Counter ⚠️' : '⚠️ Counter-Trend')
        : '➖ Neutral/Weak';
    return { bullish, bearish, text, strength };
  };

  const labelSize = cfg.labelSize === 'Tiny' ? 'tiny' : cfg.labelSize === 'Small' ? 'small' : cfg.labelSize === 'Normal' ? 'normal'
    : cfg.labelSize === 'Large' ? 'large' : 'huge';
  const fmt = (v: number, f: string) => str.tostring(v, f);

  // ta.atr(atrLength) runs on the bars where the cache needs it: on every bar with the dashboard, else while a
  // stage is active (a first pass finds these bars, whose list does not depend on the ATR values)
  const fullAtr = ta.atr(bars, cfg.atrLength).toArray().map((v) => v ?? NaN);

  const simulate = (atrArr: number[] | null) => {
    const needAtrFlags: boolean[] = new Array(n).fill(false);
    // alertcondition flags (index = declaration order of alertConditions) and the alert() calls
    const alertFlags: boolean[][] = Array.from({ length: 13 }, () => new Array<boolean>(n).fill(false));
    const alertCalls: AlertCall[] = [];
    // sendAlert(message) => alert(message, alert.freq_once_per_bar_close) (enableAlerts is a constant true)
    const sendAlert = (i: number, message: string) => {
      alertCalls.push({ time: bars[i].time as number, message, freq: 'once_per_bar_close' });
    };
    resetDrawings(LIMITS);

    // ORB objects
    const orbColors = [cfg.orb5LineColor, cfg.orb15LineColor, cfg.orb30LineColor, cfg.orb60LineColor];
    const enabled = [cfg.enableORB5Signals, cfg.enableORB15Signals, cfg.enableORB30Signals, cfg.enableORB60Signals];
    const allORBs: OrbData[] = [5, 15, 30, 60].map((m, k) => ({
      name: STAGE_NAMES[k], minutes: m, high: NaN, low: NaN, mid: NaN, orbRange: NaN, isEnabled: false,
      isBuilding: false, isComplete: false, completionBar: 0, breakoutUp: false, breakoutDown: false, breakoutBar: 0,
      breakoutLevel: NaN, cyclesUp: 0, cyclesDown: 0, orbColor: [C_BLUE, C_GREEN, C_ORANGE, C_RED][k],
    }));
    const getPreviousEnabledORB = (cur: OrbData): OrbData | null => {
      let prev: OrbData | null = null;
      for (const o of allORBs) if (o.isEnabled && o.minutes < cur.minutes && (prev === null || o.minutes > prev.minutes)) prev = o;
      return prev;
    };
    const getNextEnabledORB = (cur: OrbData): OrbData | null => {
      let next: OrbData | null = null;
      for (const o of allORBs) if (o.isEnabled && o.minutes > cur.minutes && (next === null || o.minutes < next.minutes)) next = o;
      return next;
    };
    let cachedNext0: OrbData | null = null;
    let orbNavigationCached = false;

    // state (var variables)
    const labH = varDrawing<Label>();
    const labL = varDrawing<Label>();
    let cachedLineColor = '';
    let lastLabelH = NaN;
    let lastLabelL = NaN;
    let cachedStageName = '';
    let hadSessionToday = false;
    let hadBreakUp = false;
    let hadBreakDown = false;
    let everHadBreakUp = false;
    let everHadBreakDown = false;
    let cyclesUp = 0;
    let cyclesDown = 0;
    let retestCyclesUp = 0;
    let retestCyclesDown = 0;
    let sessionBreakoutsUp = 0;
    let sessionBreakoutsDown = 0;
    let sessionRetestsUp = 0;
    let sessionRetestsDown = 0;
    let barsOutsideAfterBreakUp = 0;
    let barsOutsideAfterBreakDown = 0;
    let lastLabelStage = NaN;
    let breakUpBarIndex = 0;
    let breakDownBarIndex = 0;
    let pendingLongEntry = false;
    let pendingShortEntry = false;
    let pendingLongBar = NaN;
    let pendingShortBar = NaN;
    const breakoutLabels: Label[] = [];
    const tpslLines: Line[] = [];
    let cachedATR = NaN;
    let cachedVolumeMA = NaN;
    const fvgBoxes: Array<Box | null> = [];
    const fvgTops: number[] = [];
    const fvgBottoms: number[] = [];
    const fvgIsBullish: boolean[] = [];
    const fvgIsActive: boolean[] = [];
    const fvgStartBar: number[] = [];
    let hadRetestUp = false;
    let hadRetestDown = false;
    let wentFarEnoughUp = false;
    let wentFarEnoughDown = false;
    let sessionStartTime = NaN;
    let htfBullish = false;
    let htfBearish = false;
    let actH = NaN;
    let actL = NaN;
    let tradeOrbHigh = NaN;
    let tradeOrbLow = NaN;
    let haveRange = false;
    let haveDisplayRange = false;
    let stage = 0;
    let displayH = NaN;
    let displayL = NaN;
    const orbEntryLine = varDrawing<Line>();
    const orbEntryLabel = varDrawing<Label>();
    const orbSLLine = varDrawing<Line>();
    const orbSLLabel = varDrawing<Label>();
    const tpLines = [varDrawing<Line>(), varDrawing<Line>(), varDrawing<Line>(), varDrawing<Line>()];
    const tpLabels = [varDrawing<Label>(), varDrawing<Label>(), varDrawing<Label>(), varDrawing<Label>()];
    let orbEntryPrice = NaN;
    let orbEntryBar = NaN;
    let orbLineColor = '';
    let orbSLPrice = NaN;
    const tpPrices = [NaN, NaN, NaN, NaN];
    const tpHit = [false, false, false, false];
    let orbLinesFrozen = false;
    let orbTradeDirection = 0;
    let orbSLHit = false;
    let sessionWins = 0;
    let sessionLosses = 0;
    let sessionTotalRR = 0.0;
    let sessionTrades = 0;
    let sessionBestR = 0.0;
    let sessionWorstR = 0.0;
    let tradeClosed = false;
    let lastTradeResult = '';
    let currentTradeR = 0.0;
    let maxShares = NaN;
    let positionValue = NaN;
    let maxLoss = NaN;
    let prevOrbEntryBar = NaN;
    let prevCyclesUp = 0;
    let prevCyclesDown = 0;
    let sessionFirstBarTime = NaN;
    let activeORB: OrbData | null = null;
    let godPmHigh = NaN;
    let godPmLow = NaN;
    let godSessionOpen = NaN;
    let godFailedBreaks = 0;
    let godLastScore = NaN;
    let godLastScoreDir = '';
    // dashboard state
    let lastDashUpdateBar = -1;
    let lastDashStage = -1;
    let lastDashBreakUp = false;
    let lastDashBreakDown = false;
    let lastDashOrbHigh = NaN;
    let lastDashOrbLow = NaN;
    const lastDashHits = [false, false, false, false];
    let lastDashSLHit = false;
    let cachedHTFBiasText = '';
    let cachedHTFBullish = false;
    let cachedHTFBearish = false;
    let table: TableData | null = null;

    // per-call history of ta.change(dayofweek) (only called when the session is not 24/7 nor electronic)
    let lastDow = NaN;
    let prevInSession = false;
    // ta.lowest / ta.highest of the Swing and Safer stops (called on entry bars only)
    const sites: StopSites = {
      swingLow: callsite.lowestByBar(), saferLow: callsite.lowestByBar(),
      swingHigh: callsite.highestByBar(), saferHigh: callsite.highestByBar(),
    };
    const showTPs = [cfg.showTP1, cfg.showTP1_5, cfg.showTP2, cfg.showTP3];
    const tpNames = ['TP1', 'TP1.5', 'TP2', 'TP3'];

    const plotVals: number[][] = Array.from({ length: 12 }, () => new Array(n).fill(NaN));

    const cleanupLine = (l: Line | undefined) => {
      if (!l) return;
      tpslLines.push(l);
      if (tpslLines.length > MAX_LINES_TO_KEEP) line.delete(tpslLines.shift()!);
    };
    const cleanupLabel = (l: Label) => {
      breakoutLabels.push(l);
      if (breakoutLabels.length > MAX_LABELS_TO_KEEP) label.delete(breakoutLabels.shift()!);
    };
    const cleanupOldFVG = () => {
      while (fvgBoxes.length > cfg.maxFVGtoKeep) {
        const old = fvgBoxes.shift();
        fvgTops.shift();
        fvgBottoms.shift();
        fvgIsBullish.shift();
        fvgIsActive.shift();
        fvgStartBar.shift();
        if (old) box.delete(old);
      }
    };
    const deleteTradeDrawings = () => {
      for (const v of [orbEntryLine, orbSLLine, ...tpLines]) {
        if (v.value) { line.delete(v.value); v.value = undefined; }
      }
      for (const v of [orbEntryLabel, orbSLLabel, ...tpLabels]) {
        if (v.value) { label.delete(v.value); v.value = undefined; }
      }
    };

    for (let i = 0; i < n; i++) {
      setDrawingBar(i, i === last);
      const b = bars[i];
      const t = T(i);
      const isLast = i === last;
      const confirmed = !isLast || lastConfirmed;
      const volume = volArr[i];

      if (i === 0) {
        allORBs.forEach((o, k) => {
          o.isEnabled = enabled[k];
          o.orbColor = orbColors[k];
        });
      }

      // E-mini futures override of the session
      let tradingSession = baseSession;
      let sessionTimezone = tz;
      let useElectronicFullDay = false;
      if (isEmini) {
        sessionTimezone = 'America/New_York';
        if (cfg.futuresTradingHours === 'Electronic Full Day (24hr)') {
          tradingSession = '';
          useElectronicFullDay = true;
        } else if (cfg.futuresTradingHours === 'RTH Only (9:30-16:00)') {
          tradingSession = '0930-1600:23456';
        } else {
          const h = ptime.hour(t, sessionTimezone);
          const m = ptime.minute(t, sessionTimezone);
          const outsideRTH = h < 9 || (h === 9 && m < 30) || h >= 16;
          if (outsideRTH && gt(volume, 0)) {
            tradingSession = '';
            useElectronicFullDay = true;
          } else {
            tradingSession = '0930-1600:23456';
          }
        }
      }
      const useNativeSession = tradingSession === '';
      const is24_7Market = symType === 'crypto' && (useNativeSession || tradingSession === '0000-2359:1234567');
      let inSession = false;
      if (useNativeSession) inSession = true; // not na(time(timeframe.period))
      else if (symType === 'crypto' && is24_7Market) inSession = true;
      else inSession = ptime.inSession(t, tradingSession, sessionTimezone, barMs);

      // new day / session
      let isNewSession = false;
      let isNewDay = false;
      if (useElectronicFullDay) {
        const cur = ptime.hour(t, sessionTimezone) * 60 + ptime.minute(t, sessionTimezone);
        const prev = i > 0 ? ptime.hour(T(i - 1), sessionTimezone) * 60 + ptime.minute(T(i - 1), sessionTimezone) : NaN;
        isNewSession = cur >= 570 && prev < 570;
      } else if (is24_7Market) {
        isNewDay = i > 0 && ptime.dayofmonth(t, tz) !== ptime.dayofmonth(T(i - 1), tz);
      } else {
        isNewSession = inSession && !prevInSession;
        const dow = ptime.dayofweek(t, tz);
        isNewDay = !isNa(lastDow) && dow !== lastDow;
        lastDow = dow;
      }
      const shouldReset = isNewSession || isNewDay;

      if (shouldReset) {
        hadSessionToday = false;
        orbNavigationCached = false;
        wentFarEnoughUp = false;
        wentFarEnoughDown = false;
        for (const o of allORBs) {
          if (o.minutes === 5) {
            o.high = b.high;
            o.low = b.low;
            o.mid = (b.high + b.low) / 2;
          } else {
            o.high = NaN;
            o.low = NaN;
            o.mid = NaN;
          }
          o.orbRange = 0;
          o.isBuilding = true;
          o.isComplete = false;
          o.completionBar = 0;
          o.breakoutUp = false;
          o.breakoutDown = false;
          o.breakoutBar = 0;
          o.breakoutLevel = NaN;
          o.cyclesUp = 0;
          o.cyclesDown = 0;
        }
        activeORB = null;
        actH = NaN;
        actL = NaN;
        tradeOrbHigh = NaN;
        tradeOrbLow = NaN;
        haveRange = false;
        haveDisplayRange = false;
        stage = 0;
        displayH = NaN;
        displayL = NaN;
        breakUpBarIndex = 0;
        breakDownBarIndex = 0;
        cyclesUp = 0;
        cyclesDown = 0;
        retestCyclesUp = 0;
        retestCyclesDown = 0;
        barsOutsideAfterBreakUp = 0;
        barsOutsideAfterBreakDown = 0;
        sessionBreakoutsUp = 0;
        sessionBreakoutsDown = 0;
        sessionRetestsUp = 0;
        sessionRetestsDown = 0;
        sessionWins = 0;
        sessionLosses = 0;
        sessionTotalRR = 0;
        sessionTrades = 0;
        sessionBestR = 0;
        sessionWorstR = 0;
        tradeClosed = false;
        lastTradeResult = '';
        currentTradeR = 0;
        prevOrbEntryBar = NaN;
        sessionStartTime = NaN;
        cachedLineColor = '';
        cachedStageName = '';
        lastLabelH = NaN;
        lastLabelL = NaN;
        lastLabelStage = NaN;
        if (labH.value) { label.delete(labH.value); labH.value = undefined; }
        if (labL.value) { label.delete(labL.value); labL.value = undefined; }
        hadBreakUp = false;
        hadBreakDown = false;
        everHadBreakUp = false;
        everHadBreakDown = false;
        hadRetestUp = false;
        hadRetestDown = false;
        pendingLongEntry = false;
        pendingShortEntry = false;
        pendingLongBar = NaN;
        pendingShortBar = NaN;
        deleteTradeDrawings();
        orbEntryPrice = NaN;
        orbEntryBar = NaN;
        orbLineColor = '';
        orbSLPrice = NaN;
        tpPrices.fill(NaN);
        orbLinesFrozen = false;
        tpHit.fill(false);
        orbSLHit = false;
        orbTradeDirection = 0;
        maxShares = NaN;
        positionValue = NaN;
        maxLoss = NaN;
        lastDashUpdateBar = i - 100;
      }

      // time from the session open
      if (inSession && isNa(sessionStartTime)) {
        sessionStartTime = t;
        sessionFirstBarTime = t;
        hadSessionToday = true;
      }
      if (isNewSession) {
        sessionStartTime = t;
        sessionFirstBarTime = t;
        hadSessionToday = true;
      }
      let minsFromOpen = -1.0;
      if (!isNa(sessionFirstBarTime) && inSession) {
        minsFromOpen = (t - sessionFirstBarTime) / 60000;
        if (minsFromOpen > 480) minsFromOpen = 480;
        if (minsFromOpen < 0) minsFromOpen = 0;
      }

      // global cache: ta.atr(atrLength) when needed, ta.sma(volume, volumeMaLength) on every bar
      const needATR = everHadBreakUp || everHadBreakDown || cfg.showDashboard || activeORB !== null;
      needAtrFlags[i] = needATR;
      if (needATR) cachedATR = atrArr ? atrArr[i] : NaN;
      cachedVolumeMA = volumeMAArr[i];

      // GOD MODE context
      const godPrevDayHigh = prevDayHigh[i];
      const godPrevDayLow = prevDayLow[i];
      const godPrevDayClose = prevDayClose[i];
      const godDailyATR = dailyAtr[i];
      if (shouldReset) {
        godSessionOpen = b.open;
        godFailedBreaks = 0;
        godLastScore = NaN;
        godLastScoreDir = '';
      }
      if (cfg.godModeEnabled && !isHTF) {
        // ta.change(time("D")) != 0
        if (i > 0 && dayStarts[i] !== dayStarts[i - 1]) {
          godPmHigh = NaN;
          godPmLow = NaN;
        }
        if (!inSession) {
          godPmHigh = Math.max(nz(godPmHigh, b.high), b.high);
          godPmLow = Math.min(nz(godPmLow, b.low), b.low);
        }
      }
      const godGapPct = cfg.godModeEnabled && !isNa(godSessionOpen) && !isNa(godPrevDayClose) && gt(godPrevDayClose, 0)
        ? ((godSessionOpen - godPrevDayClose) / godPrevDayClose) * 100 : NaN;
      const godChopDay = cfg.godModeEnabled && cfg.godChopGuard && godFailedBreaks >= 2;

      // ORB level building
      if (!isHTF && ge(minsFromOpen, 0) && inSession) {
        for (const o of allORBs) {
          if (!(o.isEnabled && o.isBuilding)) continue;
          if (gt(minsFromOpen, o.minutes)) {
            o.isBuilding = false;
            o.isComplete = true;
            o.completionBar = i;
            if (activeORB === null || o.minutes > activeORB.minutes) {
              activeORB = o;
              actH = o.high;
              actL = o.low;
              haveRange = true;
              haveDisplayRange = true;
              stage = o.minutes;
              displayH = o.high;
              displayL = o.low;
              cachedStageName = o.name;
              cachedLineColor = o.orbColor;
            }
          } else {
            if (isNa(o.high)) {
              const prev = getPreviousEnabledORB(o);
              if (prev !== null && prev.isComplete) {
                o.high = prev.high;
                o.low = prev.low;
                o.mid = prev.mid;
                o.orbRange = prev.orbRange;
              }
            }
            if (lt(minsFromOpen, o.minutes)) {
              o.high = Math.max(nz(o.high, b.high), b.high);
              o.low = Math.min(nz(o.low, b.low), b.low);
              o.mid = (o.high + o.low) / 2;
              o.orbRange = o.high - o.low;
              if (ge(minsFromOpen, o.minutes - 1) && !o.isComplete) {
                o.isBuilding = false;
                o.isComplete = true;
                o.completionBar = i;
                activeORB = o;
                actH = o.high;
                actL = o.low;
                haveRange = true;
                haveDisplayRange = true;
                stage = o.minutes;
                displayH = o.high;
                displayL = o.low;
                cachedStageName = o.name;
                cachedLineColor = o.orbColor;
              }
            }
          }
        }
      }

      // navigation cache of the first stage (its previous / next enabled stage)
      if (!orbNavigationCached && !isHTF) {
        cachedNext0 = getNextEnabledORB(allORBs[0]);
        orbNavigationCached = true;
      }

      // stage complete: alert of every stage completed on this bar
      for (const o of allORBs) {
        if (o.isEnabled && o.isComplete && o.completionBar === i) {
          const rangePct = ((o.high - o.low) / o.low) * 100;
          sendAlert(i, `✅ ${o.name} COMPLETE - ${ticker} | Range: $${fmt(o.high, '#.##')} - $${fmt(o.low, '#.##')} (${fmt(rangePct, '#.#')}%)`);
          alertFlags[6][i] = true;
        }
      }

      // trend values of the bar (var floats assigned while the filter is on)
      const trendVWAP = wantVwap ? vwapArr[i] : NaN;
      const trendEMA12 = wantEma12 ? ema12Arr[i] : NaN;
      const trendEMACustom = wantEmaCustom ? emaCustomArr[i] : NaN;
      const trendSTDirection = wantST ? stDirArr[i] : 0;
      const isTrendUp = (close: number) => {
        switch (cfg.trendMode) {
          case 'VWAP': return gt(close, trendVWAP);
          case 'EMA': return gt(close, trendEMA12);
          case 'Custom EMA': return gt(close, trendEMACustom);
          case 'SuperTrend': return trendSTDirection === 1;
          case 'VWAP+EMA': return gt(close, trendVWAP) && gt(close, trendEMA12);
          case 'VWAP+SuperTrend': return gt(close, trendVWAP) && trendSTDirection === 1;
          default: return true;
        }
      };
      const isTrendDown = (close: number) => {
        switch (cfg.trendMode) {
          case 'VWAP': return lt(close, trendVWAP);
          case 'EMA': return lt(close, trendEMA12);
          case 'Custom EMA': return lt(close, trendEMACustom);
          case 'SuperTrend': return trendSTDirection === -1;
          case 'VWAP+EMA': return lt(close, trendVWAP) && lt(close, trendEMA12);
          case 'VWAP+SuperTrend': return lt(close, trendVWAP) && trendSTDirection === -1;
          default: return true;
        }
      };

      // GOD MODE scoring
      const near = (lvl: number, ref: number, tol: number) => !isNa(lvl) && !isNa(ref) && le(Math.abs(lvl - ref), tol);
      const godLvlTol = nz(cachedATR) * 0.25;
      const godHighConfluence = cfg.godModeEnabled && haveRange && (near(actH, godPrevDayHigh, godLvlTol) || near(actH, godPmHigh, godLvlTol));
      const godLowConfluence = cfg.godModeEnabled && haveRange && (near(actL, godPrevDayLow, godLvlTol) || near(actL, godPmLow, godLvlTol));
      const godScore = (isUp: boolean) => {
        let score = 50.0;
        const volRatio = gt(nz(cachedVolumeMA), 0) ? volume / cachedVolumeMA : 1.0;
        score += ge(volRatio, cfg.strongVolumeMultiplier) ? 20 : ge(volRatio, cfg.volumeMultiplier) ? 12 : ge(volRatio, 1.0) ? 4 : -10;
        score += isUp ? (htfBullish ? 15 : htfBearish ? -15 : 0) : (htfBearish ? 15 : htfBullish ? -15 : 0);
        const orVsAtr = !isNa(godDailyATR) && gt(godDailyATR, 0) && activeORB !== null ? activeORB.orbRange / godDailyATR : NaN;
        score += isNa(orVsAtr) ? 0 : le(orVsAtr, 0.25) ? 10 : le(orVsAtr, 0.5) ? 5 : le(orVsAtr, 0.75) ? 0 : -10;
        const gapAligned = isNa(godGapPct) ? NaN : isUp ? godGapPct : -godGapPct;
        score += isNa(gapAligned) ? 0 : ge(gapAligned, 0.5) ? 8 : le(gapAligned, -0.5) ? -8 : 0;
        score += (isUp ? godHighConfluence : godLowConfluence) ? 12 : 0;
        const priorBreaks = (isUp ? sessionBreakoutsUp : sessionBreakoutsDown) - 1;
        score -= Math.min(Math.max(priorBreaks, 0) * 5, 15);
        if (godChopDay) score = Math.min(score, 40);
        return Math.max(0.0, Math.min(100.0, score));
      };
      const godGrade = (s: number) => (ge(s, 85) ? 'A+' : ge(s, 70) ? 'A' : ge(s, 55) ? 'B' : ge(s, 40) ? 'C' : 'D');

      const volumeMA = cachedVolumeMA;

      // pending entry (the bar after a breakout): trade levels, lines and labels
      const pendingLongDue = pendingLongEntry && i > pendingLongBar;
      const pendingShortDue = pendingShortEntry && i > pendingShortBar;
      const entryIsLong = pendingLongDue && !pendingShortDue;
      if (pendingLongDue || pendingShortDue) {
        if (cfg.enableTargets) {
          const activeHigh = activeORB !== null ? activeORB.high : NaN;
          const activeLow = activeORB !== null ? activeORB.low : NaN;
          if (!isNa(activeHigh) && !isNa(activeLow)) {
            deleteTradeDrawings();
            const entry = b.open;
            const sl = stopLoss(sites, i, entry, activeHigh, activeLow, activeHigh - activeLow, cachedATR, entryIsLong);
            const tps = targets(entry, sl, entryIsLong, actH - actL);
            const [shares, posValue, maxLossCalc] = positionSize(entry, sl);
            orbEntryPrice = entry;
            orbEntryBar = i;
            orbLineColor = entryIsLong ? cnew(C_AQUA, 0) : cnew(C_ORANGE, 0);
            orbSLPrice = sl;
            for (let k = 0; k < 4; k++) tpPrices[k] = tps[k];
            orbLinesFrozen = false;
            tpHit.fill(false);
            orbSLHit = false;
            orbTradeDirection = entryIsLong ? 1 : -1;
            maxShares = shares;
            positionValue = posValue;
            maxLoss = maxLossCalc;

            orbEntryLine.value = line.new(orbEntryBar, orbEntryPrice, i, orbEntryPrice, 'bar_index', 'none', orbLineColor, 'solid', 1);
            cleanupLine(orbEntryLine.value);
            const entryText = cfg.labelFormat === 'Simple' ? 'ENTRY' : str.format('ENTRY: ${0}', fmt(orbEntryPrice, '#.##'));
            orbEntryLabel.value = label.new(orbEntryBar, orbEntryPrice, entryText, 'bar_index', 'price', orbLineColor, 'label_left', C_WHITE, labelSize);
            if (cfg.showTPSLLines) {
              const red = cnew(C_RED, 0);
              orbSLLine.value = line.new(orbEntryBar, orbSLPrice, i, orbSLPrice, 'bar_index', 'none', red, 'solid', 1);
              cleanupLine(orbSLLine.value);
              const slText = cfg.labelFormat === 'Simple' ? 'SL' : str.format('SL: ${0}', fmt(orbSLPrice, '#.##'));
              orbSLLabel.value = label.new(orbEntryBar, orbSLPrice, slText, 'bar_index', 'price', red, 'label_left', C_WHITE, labelSize);
              const green = cnew(C_GREEN, 0);
              for (let k = 0; k < 4; k++) {
                if (!showTPs[k]) continue;
                const p = tpPrices[k];
                tpLines[k].value = line.new(orbEntryBar, p, i, p, 'bar_index', 'none', green, 'solid', 1);
                cleanupLine(tpLines[k].value);
                const pct = ((entryIsLong ? p - entry : entry - p) / entry) * 100;
                const text = cfg.labelFormat === 'Simple' ? tpNames[k]
                  : str.format(`${tpNames[k]}: \${0} +{1}%`, fmt(p, '#.##'), fmt(pct, '#.#'));
                tpLabels[k].value = label.new(orbEntryBar, p, text, 'bar_index', 'price', green, 'label_left', C_WHITE, labelSize);
              }
            }
          }
        }
        // alertEntryTriggered := true (the condition also needs enableTargets)
        alertFlags[7][i] = cfg.enableTargets;
        if (pendingLongDue) {
          pendingLongEntry = false;
          pendingLongBar = NaN;
        }
        if (pendingShortDue) {
          pendingShortEntry = false;
          pendingShortBar = NaN;
        }
      }

      // fair value gaps
      const bullFVG = i >= 2 && lt(bars[i - 2].high, b.low);
      const bearFVG = i >= 2 && gt(bars[i - 2].low, b.high);
      const addFVG = (top: number, bottom: number, isBull: boolean) => {
        const c = isBull ? cfg.fvgBullColor : cfg.fvgBearColor;
        const bx = box.new(i - 2, top, i, bottom, cnew(c, 0), 1, 'solid', 'none', 'bar_index', cnew(c, cfg.fvgTransparency),
          '', 'auto', C_WHITE);
        fvgBoxes.push(bx);
        fvgTops.push(top);
        fvgBottoms.push(bottom);
        fvgIsBullish.push(isBull);
        fvgIsActive.push(true);
        fvgStartBar.push(i - 2);
        cleanupOldFVG();
      };
      if (bullFVG && cfg.showFVG && activeORB !== null) addFVG(b.low, bars[i - 2].high, true);
      if (bearFVG && cfg.showFVG && activeORB !== null) addFVG(bars[i - 2].low, b.high, false);
      if (cfg.showFVG && fvgBoxes.length > 0) {
        for (let k = 0; k < fvgBoxes.length; k++) {
          if (!fvgIsActive[k]) continue;
          const filled = fvgIsBullish[k] ? lt(b.close, fvgBottoms[k]) : gt(b.close, fvgTops[k]);
          const bx = fvgBoxes[k];
          if (bx) {
            box.set_right(bx, i);
            if (filled) {
              box.set_border_style(bx, 'dashed');
              fvgIsActive[k] = false;
              if (i - fvgStartBar[k] > 10) {
                box.delete(bx);
                fvgBoxes[k] = null;
              }
            }
          }
        }
      }

      // breakout detection on the active stage
      if (activeORB !== null && activeORB.isComplete && inSession && cfg.enableBreakout && confirmed) {
        const ao: OrbData = activeORB;
        const activeHigh = ao.high;
        const activeLow = ao.low;
        const effBuffer = cfg.godModeEnabled && cfg.godAdaptiveBuffer && gt(nz(cachedATR), 0) && gt(b.close, 0)
          ? Math.max(cfg.breakoutBuffer, (cachedATR * 0.10 / b.close) * 100) : cfg.breakoutBuffer;
        const bufUp = activeHigh * (effBuffer / 100);
        const bufDown = activeLow * (effBuffer / 100);
        const volumeOK = !cfg.enableVolumeFilter || (isNa(volumeMA) || Math.abs(volumeMA) <= EPS
          ? true
          : (gt(cfg.strongVolumeMultiplier, 0) && ge(volume, volumeMA * cfg.strongVolumeMultiplier)) || ge(volume, volumeMA * cfg.volumeMultiplier));
        const trendOKUp = !cfg.enableTrendFilter || isTrendUp(b.close);
        const trendOKDown = !cfg.enableTrendFilter || isTrendDown(b.close);
        const prevClose = i > 0 ? bars[i - 1].close : NaN;
        const volText = () => {
          const volRatio = gt(volumeMA, 0) ? volume / volumeMA : 0;
          return ge(volRatio, cfg.strongVolumeMultiplier) ? `${fmt(volRatio, '#.#')}x ⚡`
            : ge(volRatio, cfg.volumeMultiplier) ? `${fmt(volRatio, '#.#')}x` : `${fmt(volRatio, '#.#')}x ⚠️`;
        };

        const crossedAbove = gt(b.close, activeHigh + bufUp) && le(prevClose, activeHigh + bufUp);
        if (crossedAbove && volumeOK && trendOKUp && !ao.breakoutUp) {
          ao.breakoutUp = true;
          ao.breakoutBar = i;
          ao.breakoutLevel = activeHigh;
          ao.cyclesUp += 1;
          cyclesUp += 1;
          hadRetestUp = false;
          wentFarEnoughUp = false;
          sessionBreakoutsUp += 1;
          if (cfg.godModeEnabled) {
            godLastScore = godScore(true);
            godLastScoreDir = 'UP';
          }
          everHadBreakUp = true;
          hadBreakUp = true;
          breakUpBarIndex = i;
          tradeOrbHigh = ao.high;
          tradeOrbLow = ao.low;
          if (cfg.showBreakLabels) {
            let text = cfg.labelFormat === 'Simple'
              ? `🔼 BREAKOUT UP #${str.tostring(sessionBreakoutsUp)}`
              : `🔼 BREAKOUT UP\n${ao.name} #${str.tostring(sessionBreakoutsUp)}\nVol: ${volText()}`;
            if (cfg.godModeEnabled && cfg.godShowScore && !isNa(godLastScore)) {
              text += `\n⚡ ${fmt(godLastScore, '#')} (${godGrade(godLastScore)})${godHighConfluence ? ' 🏆' : ''}`;
            }
            const y = b.high + cachedATR * LABEL_OFFSET_ATR_MULTIPLIER;
            cleanupLabel(label.new(i, y, text, 'bar_index', 'price', cnew(C_GREEN, 0), 'label_down', C_WHITE, labelSize, 'center'));
          }
          sendAlert(i, `🔼 BREAKOUT UP${str.tostring(sessionBreakoutsUp)} - ${ticker} @ ${fmt(b.close, '#.##')} | ${ao.name}`
            + (cfg.godModeEnabled && !isNa(godLastScore) ? ` | ⚡${fmt(godLastScore, '#')} ${godGrade(godLastScore)}` : ''));
          alertFlags[0][i] = true;
          pendingLongEntry = true;
          pendingLongBar = i;
        }

        const crossedBelow = lt(b.close, activeLow - bufDown) && ge(prevClose, activeLow - bufDown);
        if (crossedBelow && volumeOK && trendOKDown && !ao.breakoutDown) {
          ao.breakoutDown = true;
          ao.breakoutBar = i;
          ao.breakoutLevel = activeLow;
          ao.cyclesDown += 1;
          cyclesDown += 1;
          hadRetestDown = false;
          wentFarEnoughDown = false;
          sessionBreakoutsDown += 1;
          if (cfg.godModeEnabled) {
            godLastScore = godScore(false);
            godLastScoreDir = 'DOWN';
          }
          everHadBreakDown = true;
          hadBreakDown = true;
          breakDownBarIndex = i;
          tradeOrbHigh = ao.high;
          tradeOrbLow = ao.low;
          if (cfg.showBreakLabels) {
            let text = cfg.labelFormat === 'Simple'
              ? `🔽 BREAKOUT DOWN #${str.tostring(sessionBreakoutsDown)}`
              : `🔽 BREAKOUT DOWN\n${ao.name} | #${str.tostring(sessionBreakoutsDown)}\nVol: ${volText()}`;
            if (cfg.godModeEnabled && cfg.godShowScore && !isNa(godLastScore)) {
              text += `\n⚡ ${fmt(godLastScore, '#')} (${godGrade(godLastScore)})${godLowConfluence ? ' 🏆' : ''}`;
            }
            const y = b.low - cachedATR * LABEL_OFFSET_ATR_MULTIPLIER;
            cleanupLabel(label.new(i, y, text, 'bar_index', 'price', cnew(C_RED, 0), 'label_up', C_WHITE, labelSize, 'center'));
          }
          sendAlert(i, `🔽 BREAKOUT DOWN #${str.tostring(sessionBreakoutsDown)} - ${ticker} @ ${fmt(b.close, '#.##')} | ${ao.name}`
            + (cfg.godModeEnabled && !isNa(godLastScore) ? ` | ⚡${fmt(godLastScore, '#')} ${godGrade(godLastScore)}` : ''));
          alertFlags[1][i] = true;
          pendingShortEntry = true;
          pendingShortBar = i;
        }
      }

      // bars outside the range after a breakout
      if (!isHTF && confirmed) {
        if (hadBreakUp && i > breakUpBarIndex) {
          if (gt(b.close, tradeOrbHigh)) {
            barsOutsideAfterBreakUp += 1;
            const minDist = tradeOrbHigh * (cfg.minRetestDistancePct / 100);
            if (gt(b.close, tradeOrbHigh + minDist)) wentFarEnoughUp = true;
          } else barsOutsideAfterBreakUp = 0;
        }
        if (hadBreakDown && i > breakDownBarIndex) {
          if (lt(b.close, tradeOrbLow)) {
            barsOutsideAfterBreakDown += 1;
            const minDist = tradeOrbLow * (cfg.minRetestDistancePct / 100);
            if (lt(b.close, tradeOrbLow - minDist)) wentFarEnoughDown = true;
          } else barsOutsideAfterBreakDown = 0;
        }
      }

      // retests and failed breaks
      if (!isHTF && cfg.enableRetest && haveRange && confirmed) {
        const rb = actH * (cfg.retestBuffer / 100);
        if (hadBreakUp && !hadRetestUp) {
          const isCommitted = barsOutsideAfterBreakUp >= cfg.minBarsOutside;
          const backInside = lt(b.close, tradeOrbHigh + rb) && gt(b.close, tradeOrbLow - rb);
          const since = i - breakUpBarIndex;
          const isFailed = everHadBreakUp && since > 0 && since <= MAX_BARS_FAILED_BREAK && backInside && !isCommitted;
          if (isFailed) {
            const orbStageName = activeORB !== null ? activeORB.name : 'None';
            sendAlert(i, `⚠️ FAILED BREAK UP - ${ticker} @ $${fmt(b.close, '#.##')} | ${orbStageName} - Price back inside range after ${str.tostring(since)} bars`);
            alertFlags[4][i] = true;
            if (cyclesUp > 0) cyclesUp -= 1;
            godFailedBreaks += 1;
            hadBreakUp = false;
            barsOutsideAfterBreakUp = 0;
            if (activeORB !== null) activeORB.breakoutUp = false;
          } else if (wentFarEnoughUp && backInside && isCommitted) {
            hadRetestUp = true;
            barsOutsideAfterBreakUp = 0;
            if (cfg.signalMode === 'Track Cycles') {
              hadBreakUp = false;
              if (activeORB !== null) activeORB.breakoutUp = false;
            }
            const show = cfg.signalMode === 'Track Cycles' ? retestCyclesUp < cfg.maxCycles : true;
            if (show) {
              retestCyclesUp += 1;
              sessionRetestsUp += 1;
              const text = str.format('🔁 RETEST UP #{0}', str.tostring(sessionRetestsUp));
              const y = b.high + cachedATR * LABEL_OFFSET_ATR_MULTIPLIER;
              cleanupLabel(label.new(i, y, text, 'bar_index', 'price', cnew(C_ORANGE, 20), 'label_down', C_WHITE, labelSize));
              const orbStageName = activeORB !== null ? activeORB.name : 'None';
              sendAlert(i, `🔁 RETEST UP #${str.tostring(retestCyclesUp)} - ${ticker} @ $${fmt(b.close, '#.##')} | Back to ${orbStageName} range`);
              alertFlags[2][i] = true;
            }
          }
        }
        if (hadBreakDown && !hadRetestDown) {
          const isCommitted = barsOutsideAfterBreakDown >= cfg.minBarsOutside;
          const backInside = gt(b.close, tradeOrbLow - rb) && lt(b.close, tradeOrbHigh + rb);
          const since = i - breakDownBarIndex;
          const isFailed = everHadBreakDown && since > 0 && since <= MAX_BARS_FAILED_BREAK && backInside && !isCommitted;
          if (isFailed) {
            const orbStageName = activeORB !== null ? activeORB.name : 'None';
            sendAlert(i, `⚠️ FAILED BREAK DOWN - ${ticker} @ $${fmt(b.close, '#.##')} | ${orbStageName} - Price back inside range after ${str.tostring(since)} bars`);
            alertFlags[5][i] = true;
            if (cyclesDown > 0) cyclesDown -= 1;
            godFailedBreaks += 1;
            hadBreakDown = false;
            barsOutsideAfterBreakDown = 0;
            if (activeORB !== null) activeORB.breakoutDown = false;
          } else if (wentFarEnoughDown && backInside && isCommitted) {
            hadRetestDown = true;
            barsOutsideAfterBreakDown = 0;
            if (cfg.signalMode === 'Track Cycles') {
              hadBreakDown = false;
              if (activeORB !== null) activeORB.breakoutDown = false;
            }
            const show = cfg.signalMode === 'Track Cycles' ? retestCyclesDown < cfg.maxCycles : true;
            if (show) {
              retestCyclesDown += 1;
              sessionRetestsDown += 1;
              const text = str.format('🔁 RETEST DOWN #{0}', str.tostring(sessionRetestsDown));
              const y = b.low - cachedATR * LABEL_OFFSET_ATR_MULTIPLIER;
              cleanupLabel(label.new(i, y, text, 'bar_index', 'price', cnew(C_ORANGE, 20), 'label_up', C_WHITE, labelSize));
              const orbStageName = activeORB !== null ? activeORB.name : 'None';
              sendAlert(i, `🔁 RETEST DOWN #${str.tostring(retestCyclesDown)} - ${ticker} @ $${fmt(b.close, '#.##')} | Back to ${orbStageName} range`);
              alertFlags[3][i] = true;
            }
          }
        }
      }

      const entryG = orbEntryPrice;
      const slG = orbSLPrice;

      // edge labels
      if (!isHTF && cfg.showEdgeLabels && haveDisplayRange) {
        const stageChanged = ne(stage, lastLabelStage);
        const needsUpdate = stageChanged || ne(displayH, lastLabelH) || ne(displayL, lastLabelL) || !(labH.value && labL.value);
        if (needsUpdate) {
          const labelColor = cnew(cachedLineColor, 0);
          for (const [v, y] of [[labH, displayH], [labL, displayL]] as const) {
            if (!v.value) {
              v.value = label.new(i + LABEL_OFFSET_BARS, y, cachedStageName, 'bar_index', 'price', labelColor, 'label_left', C_WHITE, labelSize);
            } else {
              label.set_y(v.value, y);
              if (stageChanged) {
                label.set_text(v.value, cachedStageName);
                label.set_color(v.value, labelColor);
              }
            }
          }
          lastLabelH = displayH;
          lastLabelL = displayL;
          lastLabelStage = stage;
        }
        if (isLast) {
          if (labH.value) label.set_x(labH.value, i + LABEL_OFFSET_BARS);
          if (labL.value) label.set_x(labL.value, i + LABEL_OFFSET_BARS);
        }
      }

      // TP / SL lines follow the bars until they freeze
      if (!orbLinesFrozen && !isNa(orbEntryBar) && i >= orbEntryBar) {
        for (const v of [orbEntryLine, orbSLLine, ...tpLines]) if (v.value) line.set_x2(v.value, i);
        for (const v of [orbEntryLabel, orbSLLabel, ...tpLabels]) if (v.value) label.set_x(v.value, i);
      }
      if (!orbLinesFrozen && !isNa(orbEntryPrice)) {
        const isLong = orbTradeDirection === 1;
        for (let k = 0; k < 4; k++) {
          const p = tpPrices[k];
          if (!tpHit[k] && !isNa(p) && showTPs[k] && i >= orbEntryBar && (isLong ? ge(b.high, p) : le(b.low, p))) {
            tpHit[k] = true;
            alertFlags[9 + k][i] = cfg.enableTargets; // alertTP<k>Triggered (showTP<k> is checked above)
            const lab = tpLabels[k].value;
            if (lab) {
              label.set_text(lab, cfg.labelFormat === 'Simple' ? `✅ ${tpNames[k]}` : str.format(`✅ ${tpNames[k]}: \${0}`, fmt(p, '#.##')));
              label.set_color(lab, cnew(C_GREEN, 0));
            }
            if (tpLines[k].value) line.set_color(tpLines[k].value!, cnew(C_GREEN, 0));
          }
        }
        let lastTPHit = false;
        if (cfg.showTP3 && tpHit[3]) lastTPHit = true;
        else if (!cfg.showTP3 && cfg.showTP2 && tpHit[2]) lastTPHit = true;
        else if (!cfg.showTP3 && !cfg.showTP2 && cfg.showTP1_5 && tpHit[1]) lastTPHit = true;
        else if (!cfg.showTP3 && !cfg.showTP2 && !cfg.showTP1_5 && cfg.showTP1 && tpHit[0]) lastTPHit = true;
        if (lastTPHit) orbLinesFrozen = true;
        if (!orbSLHit && !isNa(orbSLPrice) && i >= orbEntryBar && (isLong ? le(b.low, orbSLPrice) : ge(b.high, orbSLPrice))) {
          orbSLHit = true;
          alertFlags[8][i] = cfg.enableTargets; // alertSLTriggered
          orbLinesFrozen = true;
          if (activeORB !== null) {
            if (isLong) activeORB.breakoutUp = false;
            else activeORB.breakoutDown = false;
          }
          if (orbSLLabel.value) {
            label.set_text(orbSLLabel.value, cfg.labelFormat === 'Simple' ? '❌ SL' : str.format('❌ SL: ${0}', fmt(orbSLPrice, '#.##')));
          }
        }
        if (cfg.freezeOnEOD && !inSession && prevInSession) orbLinesFrozen = true;
      }

      // trade close and session statistics
      const cyclesChanged = cyclesUp !== prevCyclesUp || cyclesDown !== prevCyclesDown;
      const newBreakoutDetected = !isNa(orbEntryBar) && (isNa(prevOrbEntryBar) || orbEntryBar !== prevOrbEntryBar || cyclesChanged);
      if (newBreakoutDetected) {
        tradeClosed = false;
        prevOrbEntryBar = orbEntryBar;
        prevCyclesUp = cyclesUp;
        prevCyclesDown = cyclesDown;
        currentTradeR = 0.0;
      }
      if ((everHadBreakUp || everHadBreakDown) && !isNa(orbEntryBar) && !tradeClosed) {
        currentTradeR = 0.0;
        if (tpHit[3] && cfg.showTP3) currentTradeR = 3.0;
        else if (tpHit[2] && cfg.showTP2) currentTradeR = 2.0;
        else if (tpHit[1] && cfg.showTP1_5) currentTradeR = 1.5;
        else if (tpHit[0] && cfg.showTP1) currentTradeR = 1.0;
        const lastIs3 = cfg.showTP3;
        const lastIs2 = cfg.showTP2 && !cfg.showTP3;
        const lastIs15 = cfg.showTP1_5 && !cfg.showTP2 && !cfg.showTP3;
        const lastIs1 = cfg.showTP1 && !cfg.showTP1_5 && !cfg.showTP2 && !cfg.showTP3;
        let shouldClose = false;
        let resultText = '';
        let isWin = false;
        if (orbSLHit) {
          shouldClose = true;
          currentTradeR = -1.0;
          resultText = '❌ SL Hit (-1R)';
        } else if ((tpHit[3] && lastIs3) || (tpHit[2] && lastIs2) || (tpHit[1] && lastIs15) || (tpHit[0] && lastIs1)) {
          shouldClose = true;
          isWin = true;
          if (tpHit[3] && lastIs3) resultText = '✅ TP3 Hit (+3R)';
          else if (tpHit[2] && lastIs2) resultText = '✅ TP2 Hit (+2R)';
          else if (tpHit[1] && lastIs15) resultText = '✅ TP1.5 Hit (+1.5R)';
          else if (tpHit[0] && lastIs1) resultText = '✅ TP1 Hit (+1R)';
        } else if (cfg.freezeOnEOD && !inSession && prevInSession) {
          shouldClose = true;
          if (orbTradeDirection === 1) {
            const riskDist = entryG - slG;
            currentTradeR = gt(riskDist, 0) ? (b.close - entryG) / riskDist : 0.0;
          } else if (orbTradeDirection === -1) {
            const riskDist = slG - entryG;
            currentTradeR = gt(riskDist, 0) ? (entryG - b.close) / riskDist : 0.0;
          }
          isWin = gt(currentTradeR, 0);
          const icon = gt(currentTradeR, 0) ? '✅' : lt(currentTradeR, 0) ? '❌' : '⚖️';
          resultText = str.format('{0} EOD Close: {1}R', icon, fmt(currentTradeR, '#.#'));
        }
        if (shouldClose && !tradeClosed) {
          tradeClosed = true;
          sessionTrades += 1;
          sessionTotalRR += currentTradeR;
          if (isWin) {
            sessionWins += 1;
            sessionBestR = Math.max(sessionBestR, currentTradeR);
          } else {
            sessionLosses += 1;
            sessionWorstR = Math.min(sessionWorstR, currentTradeR);
          }
          lastTradeResult = resultText;
        }
      }

      // plots of the stages while they are shown
      if (!isHTF && inSession) {
        const minsToEndOfBar = !isNa(sessionFirstBarTime) ? (t + tfSec * 1000 - sessionFirstBarTime) / 60000 : -1;
        allORBs.forEach((o, k) => {
          if (!(o.isEnabled && ge(o.minutes, currentTFMinutes))) return;
          let inWindow: boolean;
          if (k === 0) {
            const endMin = cachedNext0 === null ? 9999.0 : o.minutes - 1;
            inWindow = gt(minsFromOpen, -1.0) && le(minsFromOpen, endMin);
          } else {
            const prev = getPreviousEnabledORB(o);
            const next = getNextEnabledORB(o);
            const prevVisible = prev === null ? false : ge(prev.minutes, currentTFMinutes);
            const startMin = prev === null || !prevVisible ? 0.0 : prev.minutes - 1;
            const endMin = k === 3 || next === null ? 9999.0 : o.minutes;
            inWindow = lt(minsFromOpen, endMin) && gt(minsToEndOfBar, startMin);
          }
          if (inWindow && !isNa(o.high) && !isNa(o.low)) {
            plotVals[3 * k][i] = o.high;
            plotVals[3 * k + 1][i] = o.low;
            plotVals[3 * k + 2][i] = cfg.showMidLine ? o.mid : NaN;
          }
        });
      }

      // dashboard: state of every bar, table of the last bar
      if (cfg.showDashboard && cfg.enableHTF) {
        if (isLast && !isHTF) {
          const bias = htfBiasOfLastBar();
          if (bias !== null) {
            cachedHTFBiasText = bias.text;
            cachedHTFBullish = bias.bullish;
            cachedHTFBearish = bias.bearish;
          }
        }
        htfBullish = cachedHTFBullish;
        htfBearish = cachedHTFBearish;
        const stageChanged = stage !== lastDashStage;
        const breakStateChanged = hadBreakUp !== lastDashBreakUp || hadBreakDown !== lastDashBreakDown;
        const orbLevelsChanged = activeORB !== null && (ne(activeORB.high, lastDashOrbHigh) || ne(activeORB.low, lastDashOrbLow));
        const targetHitStateChanged = tpHit.some((h, k) => h !== lastDashHits[k]) || orbSLHit !== lastDashSLHit;
        const forceUpdate = i - lastDashUpdateBar >= 20;
        const dashDataChanged = isLast && (stageChanged || breakStateChanged || orbLevelsChanged || targetHitStateChanged || forceUpdate);
        lastDashUpdateBar = i;
        lastDashStage = stage;
        lastDashBreakUp = hadBreakUp;
        lastDashBreakDown = hadBreakDown;
        if (activeORB !== null) {
          lastDashOrbHigh = activeORB.high;
          lastDashOrbLow = activeORB.low;
        }
        tpHit.forEach((h, k) => { lastDashHits[k] = h; });
        lastDashSLHit = orbSLHit;
        if (isLast) {
          table = dashboard({
            i, t, inSession, useNativeSession, tradingSession, is24_7Market, hadSessionToday, activeORB, allORBs,
            everHadBreakUp, everHadBreakDown, orbEntryPrice, orbEntryBar, tradeClosed, sessionStartTime,
            sessionFirstBarTime, minsFromOpen, cachedATR, volumeMA, godLastScore, godLastScoreDir, godHighConfluence,
            godLowConfluence, godGapPct, godDailyATR, godChopDay, godFailedBreaks, cachedHTFBiasText, maxShares,
            positionValue, maxLoss, orbSLPrice, tpPrices, tpHit, lastTradeResult, sessionTrades, sessionWins,
            sessionLosses, sessionTotalRR, sessionBestR, sessionWorstR, dashDataChanged, forceUpdate,
            trendUp: isTrendUp(b.close), trendDown: isTrendDown(b.close), volume,
          });
        }
      }

      prevInSession = inSession;
    }
    setDrawingBar(null);
    return { needAtrFlags, plotVals, table, alertFlags, alertCalls };
  };

  // ---------------------------------------------------------------- stop, targets, position size
  interface StopSites {
    swingLow: (barIndex: number, value: number, length: number) => number;
    saferLow: (barIndex: number, value: number, length: number) => number;
    swingHigh: (barIndex: number, value: number, length: number) => number;
    saferHigh: (barIndex: number, value: number, length: number) => number;
  }
  function stopLoss(swingSites: StopSites, i: number, entry: number, orbHigh: number, orbLow: number, orbRange: number, atr: number, isBullish: boolean): number {
    let sl = NaN;
    const orbFraction = cfg.stopOrbFraction / 100;
    const validATR = isNa(atr) || Math.abs(atr) <= EPS ? orbRange * 0.5 : atr;
    const atrPercent = (validATR / entry) * 100;
    const minStopMultiplier = symType === 'crypto' ? 1.0 : symType === 'forex' ? 0.3
      : gt(atrPercent, 5) ? 1.5 : gt(atrPercent, 3) ? 1.0 : gt(atrPercent, 1.5) ? 0.7 : 0.5;
    let minStopDistance = validATR * minStopMultiplier;
    const absoluteMin = symType === 'crypto' ? entry * 0.01 : symType === 'forex' ? entry * 0.002 : entry * 0.003;
    minStopDistance = pmax(minStopDistance, absoluteMin);
    const mode = cfg.stopMode;
    if (isBullish) {
      if (mode === 'ATR') {
        const priceAdjust = lt(entry, 1000) ? 1.0 : lt(entry, 5000) ? 0.7 : 0.5;
        sl = entry - validATR * cfg.atrMultiplier * priceAdjust;
      } else if (mode === 'ORB %') sl = orbLow - orbRange * orbFraction;
      else if (mode === 'Swing') sl = swingSites.swingLow(i, bars[i].low, cfg.swingBars);
      else if (mode === 'Safer') {
        const atrSL = entry - validATR * cfg.atrMultiplier * 2;
        const swingSL = swingSites.saferLow(i, bars[i].low, cfg.swingBars);
        const orbSL = orbLow - orbRange * orbFraction * 1.5;
        sl = pmin(swingSL, pmin(atrSL, orbSL));
      } else if (mode === '% Based') sl = entry * (1 - cfg.percentBasedStop / 100);
      else if (mode === 'Smart Adaptive') {
        const smart = gt(atrPercent, 3) ? 1.5 : gt(atrPercent, 1.5) ? 1.0 : 0.7;
        sl = pmin(entry - validATR * smart, orbLow - orbRange * 0.3);
      } else if (mode === 'Scaled ATR') {
        const scaled = gt(atrPercent, 5) ? 2.5 : gt(atrPercent, 3) ? 2.0 : gt(atrPercent, 1.5) ? 1.5 : 1.2;
        sl = entry - validATR * scaled;
      }
    } else if (mode === 'ATR') {
      const volAdjust = gt(atrPercent, 3) ? 1.2 : gt(atrPercent, 1.5) ? 1.0 : 0.8;
      sl = entry + validATR * cfg.atrMultiplier * volAdjust;
    } else if (mode === 'ORB %') sl = orbHigh + orbRange * orbFraction;
    else if (mode === 'Swing') sl = swingSites.swingHigh(i, bars[i].high, cfg.swingBars);
    else if (mode === 'Safer') {
      const atrSL = entry + validATR * cfg.atrMultiplier * 2;
      const swingSL = swingSites.saferHigh(i, bars[i].high, cfg.swingBars);
      const orbSL = orbHigh + orbRange * orbFraction * 1.5;
      sl = pmax(swingSL, pmax(atrSL, orbSL));
    } else if (mode === '% Based') sl = entry * (1 + cfg.percentBasedStop / 100);
    else if (mode === 'Smart Adaptive') {
      const smart = gt(atrPercent, 3) ? 1.5 : gt(atrPercent, 1.5) ? 1.0 : 0.7;
      sl = pmax(entry + validATR * smart, orbHigh + orbRange * 0.3);
    } else if (mode === 'Scaled ATR') {
      const scaled = gt(atrPercent, 5) ? 2.5 : gt(atrPercent, 3) ? 2.0 : gt(atrPercent, 1.5) ? 1.5 : 1.2;
      sl = entry + validATR * scaled;
    }
    return isBullish ? pmin(sl, entry - minStopDistance) : pmax(sl, entry + minStopDistance);
  }
  function targets(entry: number, sl: number, isBullish: boolean, orbWidth: number): number[] {
    const risk = Math.abs(entry - sl);
    const riskAdjustment = lt(entry, 1000) ? 1.0 : lt(entry, 5000) ? 0.8 : 0.6;
    return [1.0, 1.5, 2.0, 3.0].map((m) => {
      const byOrb = isBullish ? entry + orbWidth * m : entry - orbWidth * m;
      const byRisk = isBullish ? entry + risk * m * riskAdjustment : entry - risk * m * riskAdjustment;
      return isBullish ? pmin(byOrb, byRisk) : pmax(byOrb, byRisk);
    });
  }
  function positionSize(entry: number, sl: number): [number, number, number] {
    let riskAmount = cfg.riskMode === '% of Account' ? cfg.accountSize * (cfg.riskPct / 100) : cfg.fixedRisk;
    if (symbolCurrency !== cfg.accountCurrency) riskAmount *= exchangeRate;
    const riskPerShare = Math.abs(entry - sl);
    const sharesFromRisk = gt(riskPerShare, 0) ? Math.floor(riskAmount / riskPerShare) : 0;
    let maxPositionValue = cfg.accountSize * (cfg.maxPositionPct / 100);
    if (symbolCurrency !== cfg.accountCurrency) maxPositionValue *= exchangeRate;
    const maxSharesFromLimit = gt(entry, 0) ? Math.floor(maxPositionValue / entry) : 0;
    let shares = pmin(sharesFromRisk, maxSharesFromLimit);
    const posValue = shares * entry;
    shares = Math.floor(shares);
    return [shares, posValue, shares * riskPerShare];
  }

  // ---------------------------------------------------------------- dashboard (table of the last bar)
  interface DashState {
    i: number; t: number; inSession: boolean; useNativeSession: boolean; tradingSession: string; is24_7Market: boolean;
    hadSessionToday: boolean; activeORB: OrbData | null; allORBs: OrbData[]; everHadBreakUp: boolean;
    everHadBreakDown: boolean; orbEntryPrice: number; orbEntryBar: number; tradeClosed: boolean; sessionStartTime: number;
    sessionFirstBarTime: number; minsFromOpen: number; cachedATR: number; volumeMA: number; godLastScore: number;
    godLastScoreDir: string; godHighConfluence: boolean; godLowConfluence: boolean; godGapPct: number; godDailyATR: number;
    godChopDay: boolean; godFailedBreaks: number; cachedHTFBiasText: string; maxShares: number; positionValue: number;
    maxLoss: number; orbSLPrice: number; tpPrices: number[]; tpHit: boolean[]; lastTradeResult: string;
    sessionTrades: number; sessionWins: number; sessionLosses: number; sessionTotalRR: number; sessionBestR: number;
    sessionWorstR: number; dashDataChanged: boolean; forceUpdate: boolean; trendUp: boolean; trendDown: boolean;
    volume: number;
  }
  function dashboard(s: DashState): TableData {
    const b = bars[s.i];
    const isDark = cfg.dashTheme === 'Dark';
    const bgColor = isDark ? cnew(C_BLACK, 0) : cnew(C_WHITE, 10);
    const txtColor = isDark ? C_WHITE : C_BLACK;
    const headerColor = isDark ? cnew(C_AQUA, 30) : cnew(C_SILVER, 30);
    const tablePos: TablePosition = cfg.dashPos === 'Top Left' ? 'top_left' : cfg.dashPos === 'Top Right' ? 'top_right'
      : cfg.dashPos === 'Bottom Left' ? 'bottom_left' : cfg.dashPos === 'Bottom Right' ? 'bottom_right' : 'middle_right';
    const txtSize = cfg.dashSize === 'Small' ? 'small' : cfg.dashSize === 'Normal' ? 'normal' : cfg.dashSize === 'Large' ? 'large' : 'auto';
    const cells = new Map<string, TableCellData>();
    const merges: TableMergeData[] = [];
    const cell = (column: number, row: number, text: string, o: {
      textColor?: string; size?: string; halign?: 'left' | 'center' | 'right'; bg?: string; tooltip?: string; height?: number;
    } = {}) => {
      const c: TableCellData = {
        column, row, text, textColor: o.textColor ?? CELL_TEXT, textSize: (o.size ?? 'auto') as TableCellData['textSize'],
        textHAlign: o.halign ?? 'center', textVAlign: 'center',
      };
      if (o.bg !== undefined) c.bgColor = o.bg;
      if (o.tooltip) c.tooltip = o.tooltip;
      if (o.height !== undefined) c.height = o.height;
      cells.set(`${column},${row}`, c);
    };
    const setHeight = (column: number, row: number, h: number) => {
      const c = cells.get(`${column},${row}`);
      if (c) c.height = h;
    };
    const merge = (row: number) => merges.push({ startColumn: 0, startRow: row, endColumn: 1, endRow: row });

    // timenow helpers (exchange time zone)
    const dow = (ms: number) => ptime.dayofweek(ms, tz);
    const isTradingDay = () => {
      if (isStockOrFutures) {
        const d = dow(timenow);
        return d >= 2 && d <= 6;
      }
      if (symType === 'crypto') return true;
      if (symType === 'forex') {
        const d = dow(timenow);
        return d >= 1 && d <= 6;
      }
      return true;
    };
    const timeClose = s.t + tfSec * 1000;
    const isReplayMode = () => {
      const diff = Math.trunc((timenow - timeClose) / 60000);
      const cur = dow(timenow);
      const barDay = dow(timeClose);
      if ((cur === 7 || cur === 1) && barDay === 6) return false;
      if (cur === 2 && barDay === 6) return false;
      return diff > 1440;
    };
    const minutesOfDay = (ms: number) => ptime.hour(ms, tz) * 60 + ptime.minute(ms, tz);
    const isWithinSessionHours = () => {
      if (s.useNativeSession) return s.inSession;
      const check = isReplayMode() ? s.t : timenow;
      const d = dow(check);
      const tradingDay = symType === 'stock' ? d >= 2 && d <= 6 : true;
      if (!tradingDay && symType === 'stock') return false;
      if (!isNa(sessionStartHour) && !isNa(sessionEndHour)) {
        const cur = minutesOfDay(check);
        return cur >= sessionStartHour * 60 + sessionStartMinute && cur <= sessionEndHour * 60 + sessionEndMinute;
      }
      return false;
    };
    const isWithinDisplayHours = () => {
      const check = isReplayMode() ? s.t : timenow;
      if (isStockOrFutures) {
        const d = dow(check);
        if (!(d >= 2 && d <= 6)) return false;
        const cur = minutesOfDay(check);
        return cur >= 240 && cur < 1200;
      }
      return true;
    };
    const isInRegularHours = () => {
      const check = isReplayMode() ? s.t : timenow;
      if (isStockOrFutures) {
        const d = dow(check);
        if (!(d >= 2 && d <= 6)) return false;
        const cur = minutesOfDay(check);
        let start = 9 * 60 + 30;
        let end = 16 * 60;
        if (!s.useNativeSession && !isNa(sessionStartHour) && !isNa(sessionEndHour) && !cfg.enableExtendedHours) {
          start = sessionStartHour * 60 + sessionStartMinute;
          end = sessionEndHour * 60 + sessionEndMinute;
        }
        return cur >= start && cur <= end;
      }
      return true;
    };

    let row = 0;
    let showFullDashboard = false;
    let sessionIcon = '';
    let sessionStatusText = '';
    const isMarketOpen = isTradingDay() && isWithinSessionHours();
    const isDisplayWindow = isWithinDisplayHours();
    const hasValidOrbData = s.activeORB !== null || s.everHadBreakUp || s.everHadBreakDown || !isNa(s.orbEntryPrice);
    if (isHTF) {
      sessionIcon = '⚠️';
      sessionStatusText = 'HTF MODE - Use 5-60min timeframe';
    } else if (isMarketOpen) {
      const regular = isInRegularHours();
      sessionIcon = regular ? '☀️' : '💤';
      sessionStatusText = regular ? 'MARKET OPEN' : 'EXTENDED HOURS';
      showFullDashboard = true;
    } else if (s.hadSessionToday && hasValidOrbData && isDisplayWindow && !isMarketOpen) {
      sessionIcon = '🌙';
      const check = isReplayMode() ? s.t : timenow;
      const sessionDate = !isNa(s.sessionStartTime) ? str.format_time(Math.trunc(s.sessionStartTime), 'MM/dd', tz) : 'N/A';
      const currentDate = str.format_time(check, 'MM/dd', tz);
      sessionStatusText = sessionDate === currentDate
        ? `AFTER HOURS - Today's Data (${sessionDate})` : `AFTER HOURS - Yesterday's Data (${sessionDate})`;
      showFullDashboard = true;
    } else if (!s.hadSessionToday && isDisplayWindow && isTradingDay() && cfg.enableExtendedHours) {
      sessionIcon = '⏰';
      sessionStatusText = 'PRE-MARKET - Waiting for ORB';
    } else {
      sessionIcon = '🌙';
      sessionStatusText = 'MARKET CLOSED';
    }

    if (!showFullDashboard && (s.dashDataChanged || s.forceUpdate)) {
      const statusBg = isDark ? cnew(C_GRAY, 20) : cnew(C_GRAY, 80);
      const statusTooltip = isHTF
        ? 'ORB works only on timeframes 1-60 minutes.\n\nPlease switch to a lower timeframe to use ORB.'
        : !s.hadSessionToday && isDisplayWindow && isTradingDay() && cfg.enableExtendedHours
          ? 'Waiting for market open to build ORB.\n\nExtended hours trading is enabled.\nORB will start building at session start.'
          : 'Market is closed.\n\nORB will activate during market hours.';
      cell(0, 0, `${sessionIcon} ${sessionStatusText}`, { textColor: txtColor, size: txtSize, halign: 'center', bg: statusBg, tooltip: statusTooltip });
      cell(1, 0, '', { bg: statusBg });
      merge(0);
    } else if (showFullDashboard) {
      const ao = s.activeORB;
      let headerTitle = `${sessionIcon} ORB DASHBOARD`;
      let headerBg = headerColor;
      let headerTooltip = `ORB Dashboard - ${sessionStatusText}\n\n`;
      if (isWithinDisplayHours() && isInRegularHours()) {
        headerTooltip += '☀️ REGULAR HOURS (09:30-16:00)\n';
        headerTooltip += 'Market is open for trading.\n\n';
      } else if (isWithinDisplayHours() && !isInRegularHours()) {
        headerTooltip += '🌙 EXTENDED HOURS\n';
        headerTooltip += 'Pre-market (04:00-09:30) or After-hours (16:00-20:00)\n';
        headerTooltip += 'Showing data from extended session.\n\n';
      }
      if (s.everHadBreakUp) {
        headerTitle += ' ⬆️';
        headerBg = cnew(C_GREEN, 10);
        headerTooltip += '⬆️ BREAKOUT UP active\n';
      } else if (s.everHadBreakDown) {
        headerTitle += ' ⬇️';
        headerBg = cnew(C_RED, 10);
        headerTooltip += '⬇️ BREAKOUT DOWN active\n';
      }
      headerTooltip += '\n━━━━━━━━━━━━━━━━━━━━━\n';
      headerTooltip += 'Shows Opening Range Breakout status and trade setup.\n';
      headerTooltip += 'The dashboard displays active breakout trade parameters including entry, targets, and stop loss.';
      cell(0, row, headerTitle, { textColor: txtColor, size: txtSize, halign: 'center', bg: headerBg, tooltip: headerTooltip });
      cell(1, row, '', { halign: 'center', bg: headerBg });
      merge(row);
      row += 1;

      if (cfg.showStage && ao !== null) {
        const isMarketNow = isTradingDay() && isWithinSessionHours();
        const showingPastData = s.hadSessionToday && !isMarketNow;
        const activeOrbText = showingPastData ? `📊 Last: ${ao.name}` : `🎯 Active: ${ao.name}`;
        const replay = isReplayMode();
        const check = replay ? s.t : timenow;
        const currentTime = str.format_time(check, 'HH:mm:ss', tz) + (replay ? ' [REPLAY]' : ' [LIVE]');
        const currentDate = str.format_time(check, 'yyyy-MM-dd', tz);
        const barTimeText = str.format_time(s.t, 'HH:mm:ss', tz);
        let sessionDescription = '';
        if (cfg.sessionMode === 'Auto-Detect') {
          sessionDescription = isStockOrFutures ? `Exchange Hours (Auto-detected for ${ticker})`
            : symType === 'crypto' ? '24/7 Trading' : 'Auto-detected Session';
        } else if (cfg.sessionMode === 'Custom') {
          sessionDescription = `Custom Session (${s.tradingSession.replace(':23456', '')})`;
        }
        const withinSessionHours = isWithinSessionHours();
        const sessionStatus = withinSessionHours ? '✅ OPEN' : '❌ CLOSED';
        let timeFromOpen = 'N/A';
        if (withinSessionHours && !isNa(s.sessionStartTime)) {
          const minutesElapsed = Math.trunc((s.t - s.sessionStartTime) / 60000);
          timeFromOpen = str.format('{0}h {1}m (OPEN)', Math.trunc(minutesElapsed / 60), minutesElapsed % 60);
        } else if (!isNa(s.sessionStartTime)) timeFromOpen = 'Session Closed';
        const is24_7 = symType === 'crypto' || s.tradingSession.includes('0000-2359');
        const tooltip = 'Currently Active ORB\n\n'
          + 'This is the ORB period being used for breakout detection.\n\n'
          + '• Breakouts are checked against THIS ORB only\n'
          + '• When a new ORB completes, it becomes active\n'
          + '• Priority: ORB60 > ORB30 > ORB15 > ORB5\n\n'
          + '─────────────────\n'
          + '⏰ CHART TIME DISPLAY\n'
          + '─────────────────\n'
          + `Date: ${currentDate}\n`
          + `Current Bar: ${currentTime}\n`
          + `Bar Open: ${barTimeText}\n\n`
          + 'ℹ️ If time seems wrong:\n'
          + 'Your chart may be set to UTC, EST, or another timezone.\n'
          + 'To change: Right-click chart → Settings → Timezone\n\n'
          + '─────────────────\n'
          + '📊 SESSION STATUS\n'
          + '─────────────────\n'
          + `Status: ${sessionStatus}\n`
          + (is24_7 ? '' : `Time from session open: ${timeFromOpen}\n\n`
            + `Session Definition: ${sessionDescription}\n`
            + `Raw Session String: ${s.tradingSession}\n\n`);
        const blue = cnew(C_BLUE, 20);
        cell(0, row, activeOrbText, { textColor: cnew(C_YELLOW, 0), size: txtSize, halign: 'center', bg: blue, tooltip });
        cell(1, row, '', { bg: blue });
        merge(row);
        row += 1;
      }

      if (cfg.showRange && !isHTF && ao !== null) {
        const orbRange = ao.high - ao.low;
        const rangePct = gt(ao.low, 0) ? (orbRange / ao.low) * 100 : 0;
        cell(0, row, 'Range:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: 'ORB Range Size\n\nShows the width of the Opening Range in both dollars and percentage.\n\n• Large range (>1.5%) = High volatility\n• Medium range (0.5-1.5%) = Normal volatility\n• Small range (<0.5%) = Low volatility\n\nLarger ranges may require wider stops and smaller position sizes.' });
        cell(1, row, str.format('${0} ({1}% width)', fmt(orbRange, '#.##'), fmt(rangePct, '#.#')), { textColor: txtColor, size: txtSize, halign: 'right' });
        row += 1;
      }

      if (cfg.showVolatilityMeter && !isHTF) {
        const atrPct = gt(s.cachedATR, 0) && gt(b.close, 0) ? (s.cachedATR / b.close) * 100 : 0;
        const volIcon = gt(atrPct, 3.0) ? '🔥🔥🔥' : gt(atrPct, 2.0) ? '🔥🔥' : gt(atrPct, 1.0) ? '🔥' : '⚪';
        const volText = gt(atrPct, 3.0) ? 'Extreme' : gt(atrPct, 2.0) ? 'High' : gt(atrPct, 1.0) ? 'Medium' : 'Low';
        const volTooltip = `Market Volatility Level\n\nMeasures current volatility using ATR percentage of price.\n\nCurrent ATR: ${fmt(atrPct, '#.##')}%\n\nLEVELS:\n🔥🔥🔥 EXTREME (>3%)\n• Very volatile conditions\n• Wider stops recommended\n• Smaller position sizes\n• Larger potential moves\n\n🔥🔥 HIGH (2-3%)\n• Active price movement\n• Standard stops work well\n• Normal position sizing\n• Good trading conditions\n\n🔥 MEDIUM (1-2%)\n• Normal trading range\n• Standard risk management\n• Typical daily movement\n\n⚪ LOW (<1%)\n• Quiet market\n• Tighter stops possible\n• Limited movement expected\n• May have smaller ORB ranges\n\nIMPLICATIONS:\nHigher volatility = Bigger potential profit BUT more risk of stop-out`;
        cell(0, row, '📊 Volatility:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: volTooltip });
        cell(1, row, `${volIcon} ${volText}`, { textColor: txtColor, size: txtSize, halign: 'right' });
        row += 1;
      }

      if (cfg.godModeEnabled && !isHTF) {
        const score = s.godLastScore;
        const grade = (v: number) => (ge(v, 85) ? 'A+' : ge(v, 70) ? 'A' : ge(v, 55) ? 'B' : ge(v, 40) ? 'C' : 'D');
        const trophy = (s.godLastScoreDir === 'UP' && s.godHighConfluence) || (s.godLastScoreDir === 'DOWN' && s.godLowConfluence);
        const scoreText = isNa(score) ? '—' : `⚡ ${fmt(score, '#')} (${grade(score)}) ${s.godLastScoreDir}${trophy ? ' 🏆' : ''}`;
        const scoreColor = isNa(score) ? txtColor : ge(score, 70) ? cnew(C_LIME, 0) : ge(score, 55) ? cnew(C_YELLOW, 0) : cnew(C_ORANGE, 0);
        cell(0, row, '⚡ GOD Score:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: 'GOD MODE Breakout Quality Score\n\nGrades the most recent breakout 0-100:\n• Volume strength vs average\n• HTF bias alignment\n• ORB width vs daily ATR (narrow = better)\n• Gap direction alignment\n• PDH/PDL/premarket level confluence (🏆)\n• Breakout cycle number (first = best)\n\nGRADES:\nA+ (85+) = Exceptional setup\nA (70-84) = Strong setup\nB (55-69) = Decent setup\nC (40-54) = Weak setup\nD (<40) = Avoid\n\nCHOP DAY caps the score at 40.' });
        cell(1, row, scoreText, { textColor: scoreColor, size: txtSize, halign: 'right' });
        row += 1;
        const gapText = isNa(s.godGapPct) ? '' : `Gap ${ge(s.godGapPct, 0) ? '+' : ''}${fmt(s.godGapPct, '#.#')}%`;
        const orText = !isNa(s.godDailyATR) && gt(s.godDailyATR, 0) && ao !== null ? `OR ${fmt(ao.orbRange / s.godDailyATR, '#.##')}×dATR` : '';
        const ctxText = s.godChopDay ? `⚠️ CHOP DAY (${str.tostring(s.godFailedBreaks)} fails)`
          : gapText + (gapText !== '' && orText !== '' ? ' | ' : '') + orText;
        cell(0, row, '🌅 Day Context:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: "GOD MODE Day Context\n\nGAP: Today's open vs yesterday's close\n• Breakouts aligned with the gap direction score higher\n\nOR vs dATR: ORB width as a fraction of daily ATR\n• ≤0.25× = Compressed range, high expansion odds (best)\n• 0.25-0.5× = Normal\n• >0.75× = Range already used up, poor R/R\n\n⚠️ CHOP DAY: 2+ failed breaks this session\n• Quality Score capped at 40\n• Whipsaw conditions - trade with caution" });
        cell(1, row, ctxText, { textColor: s.godChopDay ? cnew(C_ORANGE, 0) : txtColor, size: txtSize, halign: 'right' });
        row += 1;
      }

      if (cfg.showVol && cfg.enableVolumeFilter && !isHTF) {
        const volRatio = gt(s.volumeMA, 0) ? s.volume / s.volumeMA : 0;
        const volStatus = ge(volRatio, cfg.strongVolumeMultiplier) ? '✅ Strong' : ge(volRatio, cfg.volumeMultiplier) ? '✅ Good' : '⚠️ Weak';
        cell(0, row, 'Volume:', { textColor: txtColor, size: txtSize, halign: 'left' });
        cell(1, row, str.format('{0}× {1}', fmt(volRatio, '#.#'), volStatus), { textColor: txtColor, size: txtSize, halign: 'right' });
        row += 1;
      }

      if (cfg.showTrend && !isHTF) {
        const trendStatus = s.trendUp ? '✅ Bullish' : s.trendDown ? '⚠️ Bearish' : '➖ Neutral';
        cell(0, row, 'Trend:', { textColor: txtColor, size: txtSize, halign: 'left' });
        cell(1, row, trendStatus + (cfg.enableTrendFilter ? ' (Filtered)' : ''), { textColor: txtColor, size: txtSize, halign: 'right' });
        row += 1;
      }

      if (cfg.enableHTF) {
        cell(0, row, 'HTF Bias:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: 'Higher Timeframe Bias\n\nShows if the broader market trend supports your breakout direction.\n\n✅ Aligned: HTF trend matches breakout direction (good)\n⚠️ Counter-Trend: HTF trend opposes breakout (risky)\n➖ Neutral: No clear HTF trend\n\nBreakouts WITH HTF trend have higher success rates.' });
        cell(1, row, s.cachedHTFBiasText, { textColor: txtColor, size: txtSize, halign: 'right' });
        row += 1;
      }

      const spacer = (h: number) => {
        cell(0, row, '', { textColor: txtColor, size: 'tiny' });
        cell(1, row, '', { textColor: txtColor, size: 'tiny' });
        setHeight(0, row, h);
        setHeight(1, row, h);
        row += 1;
      };
      spacer(0.1);

      if (cfg.showStatus && !isHTF) {
        cell(0, row, '📈 ORB STATUS', { textColor: txtColor, size: txtSize, halign: 'center', bg: headerColor });
        cell(1, row, '', { bg: headerColor });
        merge(row);
        row += 1;
        const minsToEnd = !isNa(s.sessionFirstBarTime) ? (s.t + tfSec * 1000 - s.sessionFirstBarTime) / 60000 : -1;
        for (const o of s.allORBs) {
          if (!o.isEnabled) continue;
          let status = '';
          let icon = '';
          let tooltip = '';
          const covers = ge(s.minsFromOpen, 0) && lt(s.minsFromOpen, o.minutes) && ge(minsToEnd, o.minutes);
          if (o.isBuilding) {
            if (covers) {
              status = '✅ Complete (This Bar)';
              tooltip = `${o.name} Status\n\nShowing COMPLETE because current bar covers the ${str.tostring(o.minutes)}-minute period.\n\nBar timeframe: ${timeframe.info(tfStr).period}\nBar covers: ${fmt(s.minsFromOpen, '#')}-${fmt(minsToEnd, '#')} minutes from open\n\nInternal state: Still building (will finalize next bar)\nDisplay: Complete (user-friendly)`;
            } else {
              status = '🔨 Building...';
              tooltip = `${o.name} Status\n\nCurrently building the ${str.tostring(o.minutes)}-minute range.\n\nTime elapsed: ${fmt(s.minsFromOpen, '#')} minutes\nCompletion at: ${str.tostring(o.minutes)} minutes\n\nThe range is updating with each bar until completion.`;
            }
          } else if (o.isComplete) {
            const cycleText = o.cyclesUp > 0 || o.cyclesDown > 0 ? str.format(' | {0}↑/{1}↓', o.cyclesUp, o.cyclesDown) : '';
            const range = `Range: $${fmt(o.low, '#.##')} - $${fmt(o.high, '#.##')}\nBreakouts: ${str.tostring(o.cyclesUp)} UP | ${str.tostring(o.cyclesDown)} DOWN`;
            if (ao !== null && o.name === ao.name) {
              status = `✅ Complete${cycleText}`;
              icon = ' ⭐';
              tooltip = `${o.name} Status\n\n✅ COMPLETE and ACTIVE\n\nThis is the current ORB being used for breakout detection.\n\n${range}`;
            } else {
              status = `📌 Complete${cycleText}`;
              tooltip = `${o.name} Status\n\n📌 COMPLETE (not active)\n\nThis ORB completed but a larger ORB is now active.\n\n${range}`;
            }
          }
          cell(0, row, `${o.name}${icon}:`, { textColor: txtColor, size: txtSize, halign: 'left', tooltip });
          cell(1, row, status, { textColor: txtColor, size: txtSize, halign: 'right' });
          row += 1;
        }
      }

      if (cfg.enableTargets && !isNa(s.orbEntryBar) && !s.tradeClosed) {
        spacer(0.1);
        const entry = s.orbEntryPrice;
        const sl = s.orbSLPrice;
        const [tp1, tp15, tp2, tp3] = s.tpPrices;
        const [hit1, hit15, hit2, hit3] = s.tpHit;
        if (cfg.enablePosSizing) {
          if (isNa(s.maxShares) || isNa(s.positionValue) || isNa(s.maxLoss)) {
            cell(0, row, '⚠️ Position Error:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: 'Position size calculation failed. Check Entry/SL values.' });
            cell(1, row, 'Invalid Data', { textColor: cnew(C_RED, 0), size: txtSize, halign: 'right' });
            row += 1;
          } else {
            cell(0, row, 'Position Size:', { textColor: txtColor, size: txtSize, halign: 'center', bg: headerColor });
            cell(1, row, '', { bg: headerColor });
            merge(row);
            row += 1;
            const cur = cfg.accountCurrency;
            const sym = cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur === 'JPY' ? '¥' : cur === 'INR' ? '₹' : cur === 'CAD' ? 'C$'
              : cur === 'AUD' ? 'A$' : cur === 'CHF' ? 'Fr.' : '$';
            const sharesTooltip = `Maximum Position Size in ${cur}\n\nNumber of shares you can buy while staying within your risk limits.\n\nCALCULATED BY:\nRisk Amount ÷ Distance to Stop Loss\n\nEXAMPLE:\n• Risk: ${sym}150\n• Entry: ${sym}10.00\n• Stop: ${sym}9.50 (50¢ distance)\n• Max Shares: 300 shares (${sym}150 ÷ ${sym}0.50)\n• Position Value: ${sym}3,000\n\nThis ensures consistent risk management across all trades.\n\n⚠️ FIXED at breakout - does not change with price!`;
            cell(0, row, 'Max Shares:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: sharesTooltip });
            const divisor = cur === 'INR' ? exchangeRate : 1;
            const posInAcct = s.positionValue / divisor;
            cell(1, row, `${fmt(s.maxShares, '#')} (${sym}${isNa(posInAcct) ? 'N/A' : fmt(posInAcct, '#,###')})`, { textColor: txtColor, size: txtSize, halign: 'right' });
            row += 1;
            const riskPctOfAcct = (s.maxLoss / cfg.accountSize) * 100;
            const riskTooltip = `Risk Amount in ${cur}\n\nTotal amount you'll lose if stop loss is hit.\n\nSHOWS:\n• ${cur} amount at risk\n• Percentage of total account\n\nRECOMMENDED RISK LEVELS:\n• 0.5-1% of account (conservative)\n• 1-2% of account (balanced)\n• 2-3% of account (aggressive)\n\nNEVER risk more than 3% on a single trade.\n\nThis is your MAXIMUM LOSS - stick to it!\n\n⚠️ FIXED at breakout - does not change!`;
            cell(0, row, 'Risk:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: riskTooltip });
            cell(1, row, str.format('{0}{1} ({2}%)', sym, fmt(s.maxLoss / divisor, '#'), fmt(riskPctOfAcct, '#.#')), { textColor: cnew(C_ORANGE, 0), size: txtSize, halign: 'right' });
            row += 1;
            cell(0, row, '', { textColor: txtColor, size: 'tiny', height: 0.5 });
            cell(1, row, '', { textColor: txtColor, size: 'tiny', height: 0.5 });
            row += 1;
          }
        }
        const validTrade = !isNa(entry) && !isNa(sl) && gt(entry, 0) && gt(sl, 0);
        if (validTrade) {
          cell(0, row, 'Entry:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: 'Entry Price\n\nYour suggested entry point for the trade.\n\nFOR LONG: ORB High level (where breakout occurred)\nFOR SHORT: ORB Low level (where breakdown occurred)\n\nThis is where you would buy/sell to enter the position.\n\nNOTE: Market entry may differ slightly due to slippage.' });
          cell(1, row, str.format('${0}', fmt(entry, '#.##')), { textColor: txtColor, size: txtSize, halign: 'right' });
        } else {
          cell(0, row, '⚠️ Trade Data:', { textColor: txtColor, size: txtSize, halign: 'left' });
          cell(1, row, 'Calculating...', { textColor: cnew(C_ORANGE, 0), size: txtSize, halign: 'right' });
        }
        row += 1;
        const slPct = (Math.abs(entry - sl) / entry) * 100;
        cell(0, row, 'Stop:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: `Stop Loss\n\nYour exit price if trade goes against you. Limits maximum loss per trade.\n\nCALCULATED BY: ${cfg.stopMode} method\n\nDISTANCE: Shows $ distance and % from entry\n\nIMPORTANT: Always use a stop loss to protect your capital. Never hold a losing position hoping it will recover.` });
        cell(1, row, str.format('${0} ({1}%)', fmt(sl, '#.##'), fmt(slPct, '#.#')), { textColor: txtColor, size: txtSize, halign: 'right' });
        row += 1;
        const tpRow = (p: number, hitK: boolean, name: string, tooltip: string) => {
          const pct = (Math.abs(p - entry) / entry) * 100;
          cell(0, row, hitK ? `✅ ${name}:` : `${name}:`, { textColor: txtColor, size: txtSize, halign: 'left', tooltip });
          cell(1, row, str.format('${0} (+{1}%)', fmt(p, '#.##'), fmt(pct, '#.#')), { textColor: txtColor, size: txtSize, halign: 'right' });
          row += 1;
        };
        if (cfg.showTP1) tpRow(tp1, hit1, 'TP1', "Take Profit 1 (1R)\n\nFirst profit target at 1× Risk distance.\n\n1R = Risk/Reward ratio of 1:1\n\nIf you risk $100, TP1 gives you $100 profit.\n\nSTRATEGY:\n• Conservative: Exit full position at TP1\n• Balanced: Take 50% profit, hold rest for TP2\n• Aggressive: Hold through for higher targets\n\n✅ = Target hit");
        if (cfg.showTP1_5) tpRow(tp15, hit15, 'TP1.5', 'Take Profit 1.5 (1.5R)\n\nIntermediate target at 1.5× Risk distance.\n\n1.5R = Risk/Reward ratio of 1:1.5\n\nIf you risk $100, TP1.5 gives you $150 profit.\n\nUSEFUL FOR:\n• Scaling out of positions gradually\n• Capturing middle-ground profits\n• Adjusting to market volatility\n\n✅ = Target hit');
        if (cfg.showTP2) tpRow(tp2, hit2, 'TP2', 'Take Profit 2 (2R)\n\nMain profit target at 2× Risk distance.\n\n2R = Risk/Reward ratio of 1:2\n\nIf you risk $100, TP2 gives you $200 profit.\n\nThis is the STANDARD target for most ORB traders.\n\nSTRATEGY:\n• Exit remaining position at TP2\n• Move stop to breakeven after TP1 hit\n• Let runners go to TP3 if strong momentum\n\n✅ = Target hit');
        if (cfg.showTP3) tpRow(tp3, hit3, 'TP3', "Take Profit 3 (3R)\n\nExtended profit target at 3× Risk distance.\n\n3R = Risk/Reward ratio of 1:3\n\nIf you risk $100, TP3 gives you $300 profit.\n\nONLY FOR:\n• Strong trending days\n• High momentum breakouts\n• Extended runners\n\nMOST TRADES won't reach TP3.\n\nSTRATEGY: Trail stop or use for 'lottery tickets'\n\n✅ = Target hit");
        if (cfg.showRisk) {
          const riskDist = Math.abs(entry - sl);
          const rrTarget = hit3 && cfg.showTP3 ? tp3 : hit2 && cfg.showTP2 ? tp2 : hit15 && cfg.showTP1_5 ? tp15 : hit1 && cfg.showTP1 ? tp1
            : cfg.showTP3 ? tp3 : cfg.showTP2 ? tp2 : cfg.showTP1_5 ? tp15 : cfg.showTP1 ? tp1 : tp2;
          const anyHit = hit3 || hit2 || hit15 || hit1;
          const rrRatio = gt(riskDist, 0) ? Math.abs(rrTarget - entry) / riskDist : 0;
          const rrStatus = anyHit ? '✅' : ge(rrRatio, 2.0) ? '⭐' : ge(rrRatio, 1.5) ? '⚠️' : '❌';
          cell(0, row, 'R/R Ratio:', { textColor: txtColor, size: txtSize, halign: 'left' });
          cell(1, row, str.format('1:{0} {1}', fmt(rrRatio, '#.#'), rrStatus), { textColor: txtColor, size: txtSize, halign: 'right' });
          row += 1;
        }
      }

      if (cfg.enableTargets && (s.everHadBreakUp || s.everHadBreakDown) && s.tradeClosed && s.lastTradeResult !== '') {
        spacer(0.1);
        cells.delete(`0,${row}`);
        cells.delete(`1,${row}`);
        cell(0, row, 'Last Trade:', { textColor: txtColor, size: txtSize, halign: 'left', tooltip: 'Last Trade Result\n\nShows the outcome of the most recent trade.\n\n✅ = Target hit (profit)\n❌ = Stop loss hit (loss)\n\nR = Risk/Reward ratio\n+2R means you made 2x your risk\n-1R means you lost your risk amount' });
        cell(1, row, s.lastTradeResult, { textColor: txtColor, size: txtSize, halign: 'right' });
        row += 1;
      }
    } else {
      const headerTitle = `${sessionIcon} ORB DASHBOARD`;
      const headerTooltip = `ORB Dashboard\n\n${sessionStatusText}\n\nMarket is currently closed.\n\nDisplay hours: 04:00-20:00\nCurrent time is outside this window.\n\nThe indicator will resume when the next session begins.`;
      cell(0, row, headerTitle, { textColor: txtColor, size: txtSize, halign: 'center', bg: headerColor, tooltip: headerTooltip });
      cell(1, row, '', { bg: headerColor });
      merge(row);
      row += 1;
      const tooltip = sessionStatusText === 'PRE-MARKET - Waiting for ORB'
        ? 'Pre-Market Session\n\n📍 Trading day has started\n⏰ ORB will begin building at 09:30\n\nCurrent status:\n• Pre-market trading active (04:00-09:30)\n• Regular session starts at 09:30\n• ORB periods will track first 5, 15, 30, 60 minutes\n\nThe dashboard will show full data once ORB begins.'
        : 'Market Closed\n\nCurrent time is outside display hours (04:00-20:00).\n\nORB tracking will resume at next session open.\n\nTo see data from the last session, scroll back to regular or extended trading hours on the chart.';
      const gray = cnew(C_GRAY, 90);
      cell(0, row, sessionStatusText, { textColor: txtColor, size: txtSize, halign: 'center', bg: gray, tooltip });
      cell(1, row, '', { bg: gray });
      merge(row);
      row += 1;
    }

    if (s.sessionTrades > 0 && showFullDashboard) {
      const winRate = (s.sessionWins / s.sessionTrades) * 100;
      const statsText = str.format('Stats: {0}✅ | {1}❌ | {2}R | WR: {3}%', str.tostring(s.sessionWins), str.tostring(s.sessionLosses),
        fmt(s.sessionTotalRR, '#.#'), fmt(winRate, '#'));
      const bar30 = '══════════════════════════════';
      let tip = `${bar30}\n`;
      tip += '📊 SESSION STATISTICS - Detailed View\n';
      tip += `${bar30}\n\n`;
      tip += `TRADES TODAY: ${str.tostring(s.sessionTrades)}\n`;
      tip += `├─ ✅ Wins: ${str.tostring(s.sessionWins)} (${fmt(winRate, '#.#')}%)\n`;
      tip += `├─ ❌ Losses: ${str.tostring(s.sessionLosses)} (${fmt(100 - winRate, '#.#')}%)\n`;
      tip += `└─ ⚖️ Win Rate: ${fmt(winRate, '#.#')}%\n\n`;
      tip += `${bar30}\n`;
      tip += 'R PERFORMANCE:\n';
      tip += `├─ 💰 Total R: ${fmt(s.sessionTotalRR, '#.##')}R\n`;
      if (s.sessionWins > 0) {
        const avgWin = gt(s.sessionTotalRR, 0) ? (s.sessionTotalRR + s.sessionLosses) / s.sessionWins : 0.0;
        if (gt(avgWin, 0)) tip += `├─ 📈 Avg Win: ${fmt(avgWin, '#.##')}R\n`;
      }
      if (s.sessionLosses > 0) tip += `├─ 📉 Avg Loss: ${fmt(-1.0, '#.##')}R\n`;
      tip += `├─ 🏆 Best Trade: ${fmt(s.sessionBestR, '#.##')}R\n`;
      if (lt(s.sessionWorstR, 0)) tip += `└─ 💀 Worst Trade: ${fmt(s.sessionWorstR, '#.##')}R\n`;
      tip += `${bar30}\n`;
      tip += '💡 TIP: Target 2:1 R/R minimum\n';
      if (gt(s.sessionTotalRR, 0)) tip += '    Current session: PROFITABLE ⭐\n';
      else if (Math.abs(s.sessionTotalRR) <= EPS) tip += '    Current session: BREAKEVEN ⚖️\n';
      else tip += '    Current session: NEGATIVE ⚠️\n';
      const rowColor = gt(s.sessionTotalRR, 0) ? cnew(C_GREEN, 92) : lt(s.sessionTotalRR, 0) ? cnew(C_RED, 92) : cnew(C_GRAY, 92);
      cell(0, row, statsText, { textColor: cnew(C_WHITE, 0), size: txtSize, halign: 'center', bg: rowColor, tooltip: tip });
      cell(1, row, '', { bg: rowColor });
      merge(row);
      row += 1;
    }

    return {
      position: tablePos, columns: 2, rows: 28, cells: [...cells.values()], merges, bgColor, frameWidth: 1, borderWidth: 0,
    };
  }

  // ---------------------------------------------------------------- run
  let atrUse = fullAtr;
  if (!cfg.showDashboard) {
    const flags = simulate(null).needAtrFlags;
    atrUse = callsite.whenCalled(flags, (x) => taCore.rma(x, cfg.atrLength), trArr).map((v) => v ?? NaN);
  }
  const { plotVals, table, alertFlags, alertCalls } = simulate(atrUse);

  const drawings = drawingOutputs(bars, ms ? 'ms' : 's');
  // a label on a bar after the last bar (bar_index + 2): the time of that bar
  const lastTime = n > 0 ? bars[last].time : 0;
  const unit = ms ? 1 : 1000;
  const labels = (drawings.labels ?? []).map((l) => {
    if (l.time <= lastTime || n < 2) return l;
    const k = Math.round(((l.time - lastTime) * unit) / barMs);
    return { ...l, time: timeAfterLastBar(bars, k, chart) };
  });

  // plot colours: color.new(orbNLineColor, 0) for high and low, color.new(orbNLineColor, 30) for the mid line
  const lineColors = [cfg.orb5LineColor, cfg.orb15LineColor, cfg.orb30LineColor, cfg.orb60LineColor];
  const plots: Record<string, Array<{ time: number; value: number; color: string }>> = {};
  for (let k = 0; k < 12; k++) {
    const c = cnew(lineColors[Math.floor(k / 3)], k % 3 === 2 ? 30 : 0);
    plots[`plot${k}`] = bars.map((b, i) => ({ time: b.time, value: plotVals[k][i], color: c }));
  }
  const fills = [0, 1, 2, 3].map((k) => {
    const c = [cfg.orb5LineColor, cfg.orb15LineColor, cfg.orb30LineColor, cfg.orb60LineColor][k];
    const fillColor = cnew(c, cfg.showBG ? cfg.fillTransparency : 100);
    return { plot1: `plot${3 * k}`, plot2: `plot${3 * k + 1}`, options: { color: fillColor, title: `${STAGE_NAMES[k]} Fill` }, colors: new Array(n).fill(fillColor) };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    lines: drawings.lines ?? [],
    labels,
    boxes: drawings.boxes ?? [],
    tables: table ? [table] : [],
    alerts: alertStates(alertConditions, bars, alertFlags),
    alertCalls,
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '🔼 ORB Breakout UP', message: '{{ticker}} - Breakout ABOVE ORB High @ ${{close}}' },
  { id: 'alert1', title: '🔽 ORB Breakout DOWN', message: '{{ticker}} - Breakout BELOW ORB Low @ ${{close}}' },
  { id: 'alert2', title: '🔁 ORB Retest UP', message: '{{ticker}} - Retesting ORB after breakout UP @ ${{close}}' },
  { id: 'alert3', title: '🔁 ORB Retest DOWN', message: '{{ticker}} - Retesting ORB after breakout DOWN @ ${{close}}' },
  { id: 'alert4', title: '⚠️ ORB Failed Break UP', message: '{{ticker}} - Failed breakout UP, back inside ORB @ ${{close}}' },
  { id: 'alert5', title: '⚠️ ORB Failed Break DOWN', message: '{{ticker}} - Failed breakout DOWN, back inside ORB @ ${{close}}' },
  { id: 'alert6', title: '✅ ORB Stage Complete', message: '{{ticker}} - ORB Stage completed' },
  { id: 'alert7', title: '🎯 ENTRY Triggered', message: '{{ticker}} - ENTRY @ ${{close}} | Trade setup activated' },
  { id: 'alert8', title: '❌ STOP LOSS Hit', message: '{{ticker}} - STOP LOSS HIT @ ${{close}} | Trade closed with loss' },
  { id: 'alert9', title: '✅ TP1 Hit (1R)', message: '{{ticker}} - TP1 HIT @ ${{close}} | 1R profit target reached' },
  { id: 'alert10', title: '✅ TP1.5 Hit (1.5R)', message: '{{ticker}} - TP1.5 HIT @ ${{close}} | 1.5R profit target reached' },
  { id: 'alert11', title: '✅ TP2 Hit (2R)', message: '{{ticker}} - TP2 HIT @ ${{close}} | 2R profit target reached' },
  { id: 'alert12', title: '✅ TP3 Hit (3R)', message: '{{ticker}} - TP3 HIT @ ${{close}} | 3R profit target reached' },
];

/** The original calls alert() */
export const hasAlertFunction = true;

export const LuxyBigBeautifulDynamicOrb = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  fillConfig,
  alertConditions,
  hasAlertFunction,
};
