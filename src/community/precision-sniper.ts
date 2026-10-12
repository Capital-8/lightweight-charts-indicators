/**
 * Precision Sniper [WillyAlgoTrader]
 *
 * A crossover model with a trade simulation. Three EMAs of the price source (fast, slow, trend), RSI, the MACD
 * histogram (12, 26, 9), DMI / ADX (14, 14), ATR and its 42-bar mean, the 20-bar volume mean and, on intraday bars,
 * the session VWAP. The lengths come from the preset ('Auto': Scalping up to 5 minutes, Default up to 1 hour,
 * Conservative below 4 hours, else Swing).
 *
 * A cross of the fast EMA over / under the slow EMA makes one candidate. It becomes an entry when the gates pass:
 * data ready, date window, session, volatility, close beyond both EMAs, RSI not extreme, higher timeframe (hard
 * filter), evidence score (trend EMA, RSI side, MACD sign, MACD acceleration, ADX with DI side, volume spike, VWAP
 * side, soft higher timeframe) at or above the required share, a valid plan, structure cap and EMA distance.
 * The plan: entry at the close, stop at the ATR distance widened by the lowest low / highest high of the structure
 * window (capped at 1.5 times the ATR distance), three targets in multiples of the risk. The open trade is followed
 * bar by bar: old stop first, then targets (partial closes), full close at TP3, reversal, date end, and the stop
 * stepped to entry / TP1 / TP2 after each target (from the next bar).
 *
 * Outputs: the EMA ribbon with its fill, the trend EMA, the nearest known level above and below the close (previous
 * day high / low, running session high / low, last confirmed pivot), an optional trend background, entry and exit
 * labels (with tooltips), the six level lines and labels of the last trade, the dashboard table (market, signal,
 * trade, sizing, statistics, diagnostics), the journal table and the watermark.
 *
 * Chart context (third argument), all optional:
 * - State of the last bar: the original skips the model on the last bar while that bar is open. Without the value
 *   every bar is a closed bar and the model also runs on the last bar.
 * - Price tick of the symbol (rounding of the entry, stop and targets, minimum risk, price texts): 0.01 without it.
 * - Chart background and foreground colours (theme 'Auto'): without them the colours of a dark chart (background
 *   #0F0F0F, foreground #DBDBDB).
 * - Quote currency of the symbol: the position estimate compares it with the account currency once the linear
 *   contract is confirmed. Without it the port throws an Error for that combination of inputs.
 * - Session of the symbol and exchange time zone (with its corrections and holidays when given): the close time of a
 *   bar (`time_close`) and of a bar of the higher timeframe come from the exchange calendar (the end of the session
 *   of the day on daily bars, of the last trading day of the period on weekly and monthly bars), and the level lines
 *   that end after the last bar are placed on the trading calendar (closed days skipped).
 *
 * Limits:
 * - Without the session and the time zone, the close time of a bar is its time plus the chart timeframe (taken from
 *   the bar times): exact on symbols that trade around the clock and on intraday bars; else the entry / exit dates
 *   in texts can differ. The close time of a higher-timeframe bar is then its start plus the timeframe length, and a
 *   time after the last bar is placed on bar slots of the chart timeframe.
 * - A time between two bars is given as the time of the next bar, where it is drawn.
 * - Days (previous day high / low, session VWAP anchor) and the bars of the higher timeframe are built from the chart
 *   bars with the calendar rule of src/anchor-period.ts.
 * - The alert inputs are kept but alerts (alert() calls and 16 alert conditions) have no output.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Precision Sniper [WillyAlgoTrader]" by WillyAlgoTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, math, str, timeframe, time as pineTime, label, resetDrawings, setDrawingBar, resample, periodClose, periodTime, barsUntil,
  chartSessions, type Label, type SessionContext, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData, LabelData, LabelStyle, LineDrawingData, PineSize, TableCellData, TableData, TableMergeData, TablePosition } from '../types';
import { periodStarts, securityStarts, chartTimeframe, hasCalendar } from '../anchor-period';
import {
  backgroundColorOf, currencyOf, foregroundColorOf, lastBarConfirmedOf, mintickOf, type ChartContext,
} from '../chart-context';

type Corner = 'Top Right' | 'Top Left' | 'Middle Right' | 'Middle Left' | 'Bottom Right' | 'Bottom Left';

export interface PrecisionSniperInputs {
  sourceChoice: 'Close' | 'HL2' | 'HLC3' | 'OHLC4';
  presetInput: 'Auto' | 'Conservative' | 'Default' | 'Aggressive' | 'Scalping' | 'Swing' | 'Crypto 24/7' | 'Custom';
  htfMode: 'Off' | 'Soft score' | 'Hard filter';
  /** Higher timeframe (empty = off) */
  htfInput: string;
  vwapMode: 'Auto' | 'On' | 'Off';
  warmupMult: number;
  /** Entry / statistics start (UNIX ms) */
  startInput: number;
  /** Entry / statistics end (UNIX ms) */
  endInput: number;
  emaFastInput: number;
  emaSlowInput: number;
  emaTrendInput: number;
  rsiLenInput: number;
  scoreInput: number;
  gradeFilter: 'All' | 'A+ and A' | 'A+ Only';
  hideC: boolean;
  volMode: 'Off' | 'Skip Signals' | 'Widen SL';
  volThreshold: number;
  volWiden: number;
  confirmWindow: number;
  maxExtension: number;
  atrLenInput: number;
  slMultInput: number;
  tp1Mult: number;
  tp2Mult: number;
  tp3Mult: number;
  tp1Pct: number;
  tp2Pct: number;
  trailInput: boolean;
  fullTP3: boolean;
  structureInput: boolean;
  swingLookback: number;
  structurePolicy: 'Cap and flag' | 'Skip entry';
  minRiskTicks: number;
  commissionPct: number;
  spreadTicks: number;
  slipTicks: number;
  costWarningR: number;
  positiveOnly: boolean;
  sessionMode: 'Off' | 'Info only' | 'Filter entries';
  sessionHours: string;
  sessionDays: string;
  sessionTZ: string;
  showLevels: boolean;
  pivotLen: number;
  lateR: number;
  sizeEnabled: boolean;
  linearConfirmed: boolean;
  accountCurrency: string;
  equityInput: number;
  riskMode: 'Percent' | 'Cash';
  riskPct: number;
  riskCash: number;
  pointValueInput: number;
  lotStep: number;
  minQty: number;
  manualEntry: number;
  showDash: boolean;
  dashPos: Corner;
  showMarketSec: boolean;
  showSignalSec: boolean;
  showTradeSec: boolean;
  showStats: boolean;
  showDiagSec: boolean;
  textSize: 'Tiny' | 'Small' | 'Normal';
  panelAlpha: number;
  theme: 'Auto' | 'Dark' | 'Light';
  showJournal: boolean;
  journalRows: number;
  journalPos: Corner;
  showSignals: boolean;
  signalSizeInput: 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  showGradeInput: boolean;
  neutralColorInput: string;
  showExits: boolean;
  showRibbon: boolean;
  showTPSL: boolean;
  showTrail: boolean;
  showBg: boolean;
  showWatermark: boolean;
  labelOffset: number;
  bullColor: string;
  bearColor: string;
  /** Alert inputs: kept, without output */
  webhookInput: boolean;
  alertEntry: boolean;
  alertTargets: boolean;
  alertStopMove: boolean;
  alertExit: boolean;
  alertCandidate: boolean;
  instanceTag: string;
}

export const defaultInputs: PrecisionSniperInputs = {
  sourceChoice: 'Close',
  presetInput: 'Auto',
  htfMode: 'Soft score',
  htfInput: '',
  vwapMode: 'Auto',
  warmupMult: 3,
  startInput: Date.UTC(2020, 0, 1),
  endInput: Date.UTC(2100, 0, 1),
  emaFastInput: 9,
  emaSlowInput: 21,
  emaTrendInput: 55,
  rsiLenInput: 13,
  scoreInput: 5,
  gradeFilter: 'All',
  hideC: true,
  volMode: 'Skip Signals',
  volThreshold: 1.3,
  volWiden: 1.5,
  confirmWindow: 0,
  maxExtension: 0,
  atrLenInput: 14,
  slMultInput: 1.5,
  tp1Mult: 1,
  tp2Mult: 2,
  tp3Mult: 3,
  tp1Pct: 0,
  tp2Pct: 0,
  trailInput: true,
  fullTP3: true,
  structureInput: true,
  swingLookback: 10,
  structurePolicy: 'Cap and flag',
  minRiskTicks: 2,
  commissionPct: 0,
  spreadTicks: 0,
  slipTicks: 0,
  costWarningR: 0.2,
  positiveOnly: true,
  sessionMode: 'Info only',
  sessionHours: '0000-0000',
  sessionDays: '1234567',
  sessionTZ: 'Etc/UTC',
  showLevels: true,
  pivotLen: 3,
  lateR: 0.5,
  sizeEnabled: false,
  linearConfirmed: false,
  accountCurrency: 'USD',
  equityInput: 10000,
  riskMode: 'Percent',
  riskPct: 1,
  riskCash: 100,
  pointValueInput: 1,
  lotStep: 1,
  minQty: 1,
  manualEntry: 0,
  showDash: true,
  dashPos: 'Top Right',
  showMarketSec: true,
  showSignalSec: true,
  showTradeSec: true,
  showStats: true,
  showDiagSec: false,
  textSize: 'Small',
  panelAlpha: 8,
  theme: 'Auto',
  showJournal: false,
  journalRows: 5,
  journalPos: 'Bottom Left',
  showSignals: true,
  signalSizeInput: 'Small',
  showGradeInput: true,
  neutralColorInput: '#FFEB3B',
  showExits: true,
  showRibbon: true,
  showTPSL: true,
  showTrail: true,
  showBg: false,
  showWatermark: true,
  labelOffset: 20,
  bullColor: '#00B876',
  bearColor: '#E34850',
  webhookInput: false,
  alertEntry: true,
  alertTargets: true,
  alertStopMove: true,
  alertExit: true,
  alertCandidate: false,
  instanceTag: 'main',
};

const MAIN = 'Main / data';
const ENGINE = 'Entry engine';
const RISK = 'Risk / execution model';
const CONTEXT = 'Context / session';
const SIZE = 'Position estimate — linear instruments only';
const VIEW = 'Display';
const ALERTS = 'Alerts';
const CORNERS = ['Top Right', 'Top Left', 'Middle Right', 'Middle Left', 'Bottom Right', 'Bottom Left'];

export const inputConfig: InputConfig[] = [
  {
    id: 'sourceChoice', type: 'string', title: 'Price source', defval: 'Close', options: ['Close', 'HL2', 'HLC3', 'OHLC4'], group: MAIN,
    tooltip: 'EMA / RSI / MACD only. Momentum and execution use actual OHLC. External indicator sources are intentionally unsupported.',
  },
  {
    id: 'presetInput', type: 'string', title: 'Preset', defval: 'Auto',
    options: ['Auto', 'Conservative', 'Default', 'Aggressive', 'Scalping', 'Swing', 'Crypto 24/7', 'Custom'], group: MAIN,
    tooltip: 'Parameter profiles, not validated profitability rankings. Auto: <=5m Scalping; <=1h Default; <4h Conservative; otherwise Swing.',
  },
  { id: 'htfMode', type: 'string', title: 'HTF mode', defval: 'Soft score', options: ['Off', 'Soft score', 'Hard filter'], group: MAIN },
  {
    id: 'htfInput', type: 'timeframe', title: 'Higher timeframe (empty = OFF)', defval: '', group: MAIN,
    tooltip: 'Must be strictly higher when enabled. Uses the last closed HTF bar. Empty means OFF, no unavailable score weight.',
  },
  {
    id: 'vwapMode', type: 'string', title: 'Session VWAP', defval: 'Auto', options: ['Auto', 'On', 'Off'], group: MAIN,
    tooltip: 'Auto disables VWAP for Crypto 24/7. On intraday only, with volume data.',
  },
  { id: 'warmupMult', type: 'int', title: 'Warmup periods', defval: 3, min: 2, max: 10, group: MAIN },
  { id: 'startInput', type: 'time', title: 'Entry/statistics start', defval: Date.UTC(2020, 0, 1), group: MAIN },
  {
    id: 'endInput', type: 'time', title: 'Entry/statistics end', defval: Date.UTC(2100, 0, 1), group: MAIN,
    tooltip: 'No new entries at/after end; an open model position closes at the first available confirmed close at/after end. Includes that closing bar.',
  },
  { id: 'emaFastInput', type: 'int', title: 'EMA fast (Custom)', defval: 9, min: 3, max: 50, group: ENGINE },
  { id: 'emaSlowInput', type: 'int', title: 'EMA slow (Custom)', defval: 21, min: 10, max: 100, group: ENGINE },
  { id: 'emaTrendInput', type: 'int', title: 'EMA trend (Custom)', defval: 55, min: 20, max: 200, group: ENGINE },
  { id: 'rsiLenInput', type: 'int', title: 'RSI length (Custom)', defval: 13, min: 5, max: 30, group: ENGINE },
  {
    id: 'scoreInput', type: 'int', title: 'Minimum score / 10 (Custom)', defval: 5, min: 1, max: 10, group: ENGINE,
    tooltip: 'Normalized OPTIONAL evidence. Mandatory crossover and price momentum do not add free points. v1 scores are not comparable.',
  },
  { id: 'gradeFilter', type: 'string', title: 'Grade filter', defval: 'All', options: ['All', 'A+ and A', 'A+ Only'], group: ENGINE },
  {
    id: 'hideC', type: 'bool', title: 'Hide C grade', defval: true, group: ENGINE,
    tooltip: 'Raises the required evidence ratio to 0.5 regardless of preset. Scalping (0.4) and Aggressive (0.3) only apply their lower thresholds when this is off.',
  },
  { id: 'volMode', type: 'string', title: 'High volatility', defval: 'Skip Signals', options: ['Off', 'Skip Signals', 'Widen SL'], group: ENGINE },
  { id: 'volThreshold', type: 'float', title: 'High ATR / mean ATR', defval: 1.3, min: 1.05, max: 3, step: 0.05, group: ENGINE },
  { id: 'volWiden', type: 'float', title: 'High-vol stop multiplier', defval: 1.5, min: 1, max: 3, step: 0.1, group: ENGINE },
  {
    id: 'confirmWindow', type: 'int', title: 'Extra confirmation bars after crossover', defval: 0, min: 0, max: 10, group: ENGINE,
    tooltip: '0 preserves crossover-only entries. Optional research feature: one candidate, at most one entry; expires on opposite cross, loss of price momentum, or timeout.',
  },
  { id: 'maxExtension', type: 'float', title: 'Maximum distance to fast EMA / ATR (0 = off)', defval: 0, min: 0, max: 10, step: 0.1, group: ENGINE },
  { id: 'atrLenInput', type: 'int', title: 'ATR length (Custom)', defval: 14, min: 5, max: 50, group: RISK },
  { id: 'slMultInput', type: 'float', title: 'ATR stop multiplier (Custom)', defval: 1.5, min: 0.5, max: 5, step: 0.1, group: RISK },
  { id: 'tp1Mult', type: 'float', title: 'TP1 R', defval: 1, min: 0.5, max: 5, step: 0.1, group: RISK },
  { id: 'tp2Mult', type: 'float', title: 'TP2 R', defval: 2, min: 1, max: 8, step: 0.1, group: RISK },
  { id: 'tp3Mult', type: 'float', title: 'TP3 R', defval: 3, min: 1.5, max: 12, step: 0.5, group: RISK },
  { id: 'tp1Pct', type: 'float', title: 'Close original position at TP1 (%)', defval: 0, min: 0, max: 99, group: RISK },
  {
    id: 'tp2Pct', type: 'float', title: 'Close original position at TP2 (%)', defval: 0, min: 0, max: 99, group: RISK,
    tooltip: 'TP1 + TP2 must be < 100%. Defaults 0: whole-position model.',
  },
  {
    id: 'trailInput', type: 'bool', title: 'Step stop after targets', defval: true, group: RISK,
    tooltip: 'TP1 -> entry; TP2 -> TP1; TP3 -> TP2. Effective NEXT bar. Entry-price stop is not net breakeven after costs. No continuous trailing beyond TP3.',
  },
  { id: 'fullTP3', type: 'bool', title: 'Close remaining position at TP3', defval: true, group: RISK },
  { id: 'structureInput', type: 'bool', title: 'Use window structure', defval: true, group: RISK },
  { id: 'swingLookback', type: 'int', title: 'Previous bars for structure (+ current)', defval: 10, min: 3, max: 30, group: RISK },
  {
    id: 'structurePolicy', type: 'string', title: 'Structure beyond 1.5x ATR stop', defval: 'Cap and flag',
    options: ['Cap and flag', 'Skip entry'], group: RISK,
  },
  { id: 'minRiskTicks', type: 'int', title: 'Minimum initial risk (ticks)', defval: 2, min: 1, max: 1000, group: RISK },
  {
    id: 'commissionPct', type: 'float', title: 'Commission per side (%)', defval: 0, min: 0, max: 5, step: 0.01, group: RISK,
    tooltip: 'Manual proportional cost per fill. Zero means costs excluded. Fixed fees/funding are not modeled.',
  },
  { id: 'spreadTicks', type: 'float', title: 'Estimated round-trip spread (ticks)', defval: 0, min: 0, max: 1000, group: RISK },
  {
    id: 'slipTicks', type: 'float', title: 'Adverse slippage per side (ticks)', defval: 0, min: 0, max: 1000, group: RISK,
    tooltip: 'A cost deduction for every fill, including target fills. Stop gaps are handled separately by open vs stop.',
  },
  { id: 'costWarningR', type: 'float', title: 'Cost warning / initial R', defval: 0.2, min: 0.01, max: 2, step: 0.01, group: RISK },
  { id: 'positiveOnly', type: 'bool', title: 'Require positive trade prices', defval: true, group: RISK },
  { id: 'sessionMode', type: 'string', title: 'Trading window', defval: 'Info only', options: ['Off', 'Info only', 'Filter entries'], group: CONTEXT },
  { id: 'sessionHours', type: 'session', title: 'Session hours', defval: '0000-0000', group: CONTEXT },
  { id: 'sessionDays', type: 'string', title: 'Session days (1=Sun ... 7=Sat)', defval: '1234567', group: CONTEXT },
  {
    id: 'sessionTZ', type: 'string', title: 'Session timezone (IANA)', defval: 'Etc/UTC', group: CONTEXT,
    tooltip: 'For example America/New_York. Independent of chart display timezone.',
  },
  { id: 'showLevels', type: 'bool', title: 'Show nearest known levels', defval: true, group: CONTEXT },
  { id: 'pivotLen', type: 'int', title: 'Confirmed pivot bars left/right', defval: 3, min: 1, max: 20, group: CONTEXT },
  { id: 'lateR', type: 'float', title: 'Signal extension warning (R)', defval: 0.5, min: 0.1, max: 5, step: 0.1, group: CONTEXT },
  { id: 'sizeEnabled', type: 'bool', title: 'Enable manual position estimate', defval: false, group: SIZE },
  {
    id: 'linearConfirmed', type: 'bool', title: 'I verified linear contract, point value and account currency', defval: false, group: SIZE,
    tooltip: 'Only linear P/L with account and quote currency matching. Inverse contracts / FX conversion / liquidation are not modeled.',
  },
  { id: 'accountCurrency', type: 'string', title: 'Account currency (must equal quote currency)', defval: 'USD', group: SIZE },
  { id: 'equityInput', type: 'float', title: 'Account equity (manual)', defval: 10000, min: 0.01, group: SIZE },
  { id: 'riskMode', type: 'string', title: 'Risk budget mode', defval: 'Percent', options: ['Percent', 'Cash'], group: SIZE },
  { id: 'riskPct', type: 'float', title: 'Risk budget (%)', defval: 1, min: 0.01, max: 100, group: SIZE },
  { id: 'riskCash', type: 'float', title: 'Risk budget (cash)', defval: 100, min: 0.01, group: SIZE },
  { id: 'pointValueInput', type: 'float', title: 'Cash per price point per unit (manual)', defval: 1, min: 0.00000001, group: SIZE },
  { id: 'lotStep', type: 'float', title: 'Quantity step', defval: 1, min: 0.00000001, group: SIZE },
  { id: 'minQty', type: 'float', title: 'Minimum quantity', defval: 1, min: 0.00000001, group: SIZE },
  {
    id: 'manualEntry', type: 'float', title: 'Hypothetical entry override (0 = live close)', defval: 0, min: 0, group: SIZE,
    tooltip: 'Only changes the calculator. It never rewrites the model trade.',
  },
  { id: 'showDash', type: 'bool', title: 'Dashboard', defval: true, group: VIEW, tooltip: 'Master toggle for the dashboard table.' },
  { id: 'dashPos', type: 'string', title: 'Dashboard position', defval: 'Top Right', options: CORNERS, group: VIEW },
  {
    id: 'showMarketSec', type: 'bool', title: '  ├ Market section', defval: true, group: VIEW,
    tooltip: 'Regime, HTF, volatility, session, data status, profile.',
  },
  {
    id: 'showSignalSec', type: 'bool', title: '  ├ Signal section', defval: true, group: VIEW,
    tooltip: 'Candidate state, evidence gauge, plan, estimated cost, last decision.',
  },
  {
    id: 'showTradeSec', type: 'bool', title: '  ├ Trade section', defval: true, group: VIEW,
    tooltip: 'Open model position: entry, stop, targets, P/L, distances. Collapses to one row when flat.',
  },
  {
    id: 'showStats', type: 'bool', title: '  ├ Stats section', defval: true, group: VIEW,
    tooltip: 'Closed-trade statistics and the recent-form strip.',
  },
  {
    id: 'showDiagSec', type: 'bool', title: '  └ Diagnostics section', defval: false, group: VIEW,
    tooltip: 'Evidence factors, candidate funnel, rejection reasons, group breakdowns.',
  },
  { id: 'textSize', type: 'string', title: 'Text size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], group: VIEW },
  { id: 'panelAlpha', type: 'int', title: 'Panel transparency', defval: 8, min: 0, max: 90, group: VIEW },
  { id: 'theme', type: 'string', title: 'Theme', defval: 'Auto', options: ['Auto', 'Dark', 'Light'], group: VIEW },
  { id: 'showJournal', type: 'bool', title: 'Recent trades table', defval: false, group: VIEW },
  { id: 'journalRows', type: 'int', title: 'Recent trades shown', defval: 5, min: 1, max: 15, group: VIEW },
  { id: 'journalPos', type: 'string', title: 'Journal position', defval: 'Bottom Left', options: CORNERS, group: VIEW },
  { id: 'showSignals', type: 'bool', title: 'Entry markers', defval: true, group: VIEW },
  {
    id: 'signalSizeInput', type: 'string', title: 'Signal size', defval: 'Small', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: VIEW,
  },
  { id: 'showGradeInput', type: 'bool', title: 'Show grade on entry markers', defval: true, group: VIEW },
  { id: 'neutralColorInput', type: 'color', title: 'Neutral', defval: '#FFEB3B', group: VIEW },
  { id: 'showExits', type: 'bool', title: 'Exit markers', defval: true, group: VIEW },
  { id: 'showRibbon', type: 'bool', title: 'EMA ribbon', defval: true, group: VIEW },
  { id: 'showTPSL', type: 'bool', title: 'Trade levels', defval: true, group: VIEW },
  { id: 'showTrail', type: 'bool', title: 'Effective step stop', defval: true, group: VIEW },
  { id: 'showBg', type: 'bool', title: 'Trend background', defval: false, group: VIEW },
  { id: 'showWatermark', type: 'bool', title: 'Watermark', defval: true, group: VIEW },
  { id: 'labelOffset', type: 'int', title: 'Level label offset', defval: 20, min: 5, max: 50, group: VIEW },
  { id: 'bullColor', type: 'color', title: 'Bull', defval: '#00B876', group: VIEW },
  { id: 'bearColor', type: 'color', title: 'Bear', defval: '#E34850', group: VIEW },
  {
    id: 'webhookInput', type: 'bool', title: 'JSON event batch', defval: false, group: ALERTS,
    tooltip: 'Schema v2; one batch at bar close, distinct events with trade_id/event_id. Existing v1 receivers must be updated. Recreate alerts after updating.',
  },
  { id: 'alertEntry', type: 'bool', title: 'Entry events', defval: true, group: ALERTS },
  { id: 'alertTargets', type: 'bool', title: 'Target events', defval: true, group: ALERTS },
  { id: 'alertStopMove', type: 'bool', title: 'Stop changes', defval: true, group: ALERTS },
  { id: 'alertExit', type: 'bool', title: 'Full exit events', defval: true, group: ALERTS },
  { id: 'alertCandidate', type: 'bool', title: 'Candidate expiry / cancellation', defval: false, group: ALERTS },
  {
    id: 'instanceTag', type: 'string', title: 'Alert instance tag', defval: 'main', group: ALERTS,
    tooltip: 'Use a distinct tag per concurrently running configuration on the same symbol/timeframe.',
  },
];

const VERSION = '2.1.0';
const ADX_TREND = 20;
const ATR_MEAN_LEN = 42;
const VOLUME_MEAN_LEN = 20;
const VOLUME_SPIKE = 1.2;
const STRUCTURE_BUFFER = 0.2;
const STRUCTURE_CAP = 1.5;
const RSI_UPPER = 75;
const RSI_LOWER = 25;
const LOW_VOL_RATIO = 0.7;
const JOURNAL_MAX = 50;
const FORM_LEN = 10;
/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA Fast', color: String(color.new(defaultInputs.bullColor, 20)), lineWidth: 2 },
  { id: 'plot1', title: 'EMA Slow', color: String(color.new(defaultInputs.bearColor, 20)), lineWidth: 2 },
  { id: 'plot2', title: 'EMA Trend', color: '#9E9E9E' },
  { id: 'plot3', title: 'Nearest resistance (known now)', color: String(color.new(defaultInputs.bearColor, 35)), style: 'linebr' },
  { id: 'plot4', title: 'Nearest support (known now)', color: String(color.new(defaultInputs.bullColor, 35)), style: 'linebr' },
];

export const metadata = {
  title: 'Precision Sniper [WillyAlgoTrader]',
  shortTitle: 'PrecSniper',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const na = (x: number) => !Number.isFinite(x);

const fmt = (x: number) => (na(x) ? 'N/A' : str.tostring(x, '#.##'));
const qtyFmt = (x: number) => (na(x) ? 'N/A' : str.tostring(x, '#.################'));
const gradeOf = (ratio: number) => (ge(ratio, 0.8) ? 'A+' : ge(ratio, 0.65) ? 'A' : ge(ratio, 0.5) ? 'B' : 'C');
const gradeIndex = (g: string) => (g === 'A+' ? 0 : g === 'A' ? 1 : g === 'B' ? 2 : 3);
const directionName = (d: number) => (d === 1 ? 'Long' : d === -1 ? 'Short' : 'None');
const pos = (p: string): TablePosition => (p === 'Top Left' ? 'top_left' : p === 'Middle Left' ? 'middle_left'
  : p === 'Middle Right' ? 'middle_right' : p === 'Bottom Left' ? 'bottom_left' : p === 'Bottom Right' ? 'bottom_right' : 'top_right');
/** Block gauge: filled cells in proportion to value / maxVal over `width` cells */
function buildGauge(value: number, maxVal: number, width: number): string {
  const filled = na(value) || !gt(maxVal, 0) ? 0 : (math.round(Math.min(width, Math.max(0, (value / maxVal) * width))) as number);
  let result = '';
  for (let i = 0; i <= width - 1; i++) result += i < filled ? '▰' : '▱';
  return result;
}

function rejectReason(code: number): string {
  switch (code) {
    case 1: return 'Data not ready / warmup';
    case 2: return 'Outside date window';
    case 3: return 'Outside trading session';
    case 4: return 'High volatility blocks entry';
    case 5: return 'Price momentum lost';
    case 6: return 'RSI extreme';
    case 7: return 'HTF opposes / neutral';
    case 8: return 'Insufficient score';
    case 9: return 'Invalid tick/risk/target geometry';
    case 10: return 'Structure exceeds cap';
    case 11: return 'Too far from fast EMA';
    default: return 'Accepted';
  }
}

/** One model trade (closed trades are kept in the journal and never changed) */
interface Trade {
  active: boolean;
  dir: number;
  entryBar: number;
  entryTime: number;
  entry: number;
  initialStop: number;
  stop: number;
  risk: number;
  tp1: number;
  tp2: number;
  tp3: number;
  hit1: boolean;
  hit2: boolean;
  hit3: boolean;
  remaining: number;
  grossR: number;
  costR: number;
  score: number;
  maxScore: number;
  grade: string;
  regime: number;
  origin: string;
  exitBar: number;
  exitTime: number;
  exitPrice: number;
  reason: string;
  ambiguous: boolean;
  mfe: number;
  mae: number;
}

const newTrade = (): Trade => ({
  active: false, dir: 0, entryBar: NaN, entryTime: NaN, entry: NaN, initialStop: NaN, stop: NaN, risk: NaN, tp1: NaN, tp2: NaN,
  tp3: NaN, hit1: false, hit2: false, hit3: false, remaining: 1, grossR: 0, costR: 0, score: NaN, maxScore: NaN, grade: '',
  regime: 0, origin: '', exitBar: NaN, exitTime: NaN, exitPrice: NaN, reason: '', ambiguous: false, mfe: 0, mae: 0,
});

interface Plan {
  e: number;
  stop: number;
  risk: number;
  p1: number;
  p2: number;
  p3: number;
  capped: boolean;
  valid: boolean;
  origin: string;
}

/** A label of the script (times in ms) */
interface LabelObj {
  /** The object of the drawing registry (count limit, deletes) */
  ref: Label;
  time: number;
  price: number;
  text: string;
  style: LabelStyle;
  color: string;
  textColor: string;
  size: PineSize;
  tooltip?: string;
}
interface LineObj {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: 'solid' | 'dashed';
}
/** Dashboard row: 0 data, 1 section, 2 note (merged), 3 header, 4 footer */
interface Row {
  kind: number;
  key: string;
  value: string;
  col: string;
  tip: string;
}

/** End (ms) of the timeframe period that starts at `start` (ms) */
function periodEnd(start: number, tf: string): number {
  const info = timeframe.info(tf);
  if (info.ismonthly) {
    const d = new Date(start);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + info.multiplier, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
  }
  return start + timeframe.in_seconds(tf) * 1000;
}

export function calculate(bars: Bar[], inputs: Partial<PrecisionSniperInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  // Values of the chart context (fallbacks: dark chart colours, tick 0.01, every bar closed)
  const CHART_BG = backgroundColorOf(chart);
  const CHART_FG = foregroundColorOf(chart);
  const MINTICK = mintickOf(chart);
  const LAST_BAR_CLOSED = lastBarConfirmedOf(chart);
  const price = (x: number) => (na(x) ? 'N/A' : str.tostring(x, 'mintick', MINTICK));
  const roundToTick = (x: number) => math.round_to_mintick(x, MINTICK) as number;
  const roundDown = (x: number) => roundToTick(Math.floor(x / MINTICK + 1e-8) * MINTICK);
  const roundUp = (x: number) => roundToTick(Math.ceil(x / MINTICK - 1e-8) * MINTICK);
  const { bullColor, bearColor, neutralColorInput, sessionTZ } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const ms = n > 0 && bars[0].time >= 1e12;
  const tMs = (i: number) => (ms ? bars[i].time : bars[i].time * 1000);
  const fromMs = (t: number) => (ms ? t : t / 1000);

  // Preset profiles: EMA lengths, RSI, ATR, minimum score (out of 10) and ATR stop multiplier
  const chartTf = chartTimeframe(bars, chart);
  const tfSeconds = chartTf === '' ? 0 : timeframe.in_seconds(chartTf);
  const isIntraday = chartTf !== '' && timeframe.info(chartTf).isintraday;
  const preset = cfg.presetInput === 'Auto'
    ? (tfSeconds <= 300 ? 'Scalping' : tfSeconds <= 3600 ? 'Default' : tfSeconds < 14400 ? 'Conservative' : 'Swing')
    : cfg.presetInput;
  const profiles: Record<string, [number, number, number, number, number, number, number]> = {
    Scalping: [5, 13, 34, 8, 10, 4, 0.8],
    Aggressive: [8, 18, 50, 11, 12, 3, 1.2],
    Default: [9, 21, 55, 13, 14, 5, 1.5],
    Conservative: [12, 26, 89, 14, 14, 7, 2.0],
    Swing: [13, 34, 89, 21, 20, 6, 2.5],
    'Crypto 24/7': [9, 21, 55, 14, 20, 5, 2.0],
  };
  const [fastLen, slowLen, trendLen, rsiLen, atrLen, minScore, slMult] = profiles[preset]
    ?? [cfg.emaFastInput, cfg.emaSlowInput, cfg.emaTrendInput, cfg.rsiLenInput, cfg.atrLenInput, cfg.scoreInput, cfg.slMultInput];
  const htfEnabled = cfg.htfMode !== 'Off' && cfg.htfInput !== '';

  // Checks of the first bar (runtime errors of the script)
  if (MINTICK * 1e9 < 10) {
    throw new Error('Minimum supported price tick is 0.00000001 (1e-8). Smaller ticks require a separate precision model.');
  }
  if (!(fastLen < slowLen && slowLen < trendLen)) throw new Error('EMA periods must satisfy Fast < Slow < Trend.');
  if (!(lt(cfg.tp1Mult, cfg.tp2Mult) && lt(cfg.tp2Mult, cfg.tp3Mult))) throw new Error('TP multipliers must satisfy TP1 < TP2 < TP3.');
  if (ge(cfg.tp1Pct + cfg.tp2Pct, 100)) throw new Error('TP1 + TP2 partial fractions must be less than 100%.');
  if (cfg.startInput >= cfg.endInput) throw new Error('Statistics start must precede end.');
  if (htfEnabled && chartTf !== '' && timeframe.in_seconds(cfg.htfInput) <= tfSeconds) {
    throw new Error('Enabled HTF must be strictly higher; use empty/Off to disable.');
  }
  if (!/^[1-7]+$/.test(cfg.sessionDays)) throw new Error('Session days must contain digits 1 to 7.');
  if (cfg.showDash && cfg.showJournal && cfg.dashPos === cfg.journalPos) {
    throw new Error('Select different corners for the dashboard and trade journal.');
  }
  // The position estimate compares the account currency with the quote currency of the symbol (chart context)
  if (cfg.sizeEnabled && cfg.linearConfirmed && chart?.currency === undefined) {
    throw new Error('The position estimate needs the quote currency of the symbol (syminfo.currency), which the bars do not carry.');
  }

  const txtSize: PineSize = cfg.textSize === 'Tiny' ? 'tiny' : cfg.textSize === 'Normal' ? 'normal' : 'small';
  const signalSize: PineSize = cfg.signalSizeInput === 'Tiny' ? 'tiny' : cfg.signalSizeInput === 'Normal' ? 'normal'
    : cfg.signalSizeInput === 'Large' ? 'large' : cfg.signalSizeInput === 'Huge' ? 'huge' : 'small';
  const sideCost = (fillPrice: number) => (Math.abs(fillPrice) * cfg.commissionPct) / 100 + (cfg.spreadTicks * 0.5 + cfg.slipTicks) * MINTICK;

  // Series of every bar
  const sourceOf = (b: Bar) => (cfg.sourceChoice === 'HL2' ? (b.high + b.low) / 2
    : cfg.sourceChoice === 'HLC3' ? (b.high + b.low + b.close) / 3
      : cfg.sourceChoice === 'OHLC4' ? (b.open + b.high + b.low + b.close) / 4 : b.close);
  const source = S(bars.map(sourceOf));
  const emaFast = A(ta.ema(source, fastLen));
  const emaSlow = A(ta.ema(source, slowLen));
  const emaTrend = A(ta.ema(source, trendLen));
  const atrSeries = ta.atr(bars, atrLen);
  const atr = A(atrSeries);
  const atrMean = A(ta.sma(atrSeries, ATR_MEAN_LEN));
  const rsi = A(ta.rsi(source, rsiLen));
  const hist = A(ta.macd(source, 12, 26, 9)[2]);
  const [diPlusS, diMinusS, adxS] = ta.dmi(bars, 14, 14);
  const diPlus = A(diPlusS);
  const diMinus = A(diMinusS);
  const adx = A(adxS);
  const volume = bars.map((b) => b.volume ?? NaN);
  const volMean = A(ta.sma(S(volume), VOLUME_MEAN_LEN));
  const vwapEnabled = isIntraday && (cfg.vwapMode === 'On' || (cfg.vwapMode === 'Auto' && preset !== 'Crypto 24/7'));

  // Days of the chart bars: session VWAP anchor and previous day high / low (intraday bars only)
  const priorDayHigh: number[] = new Array(n).fill(NaN);
  const priorDayLow: number[] = new Array(n).fill(NaN);
  let vwap: number[] = new Array(n).fill(NaN);
  if (isIntraday) {
    const days = periodStarts(bars, 'D', chart);
    const newDay = days.map((d, i) => i === 0 || d !== days[i - 1]);
    if (vwapEnabled) vwap = A(ta.vwap(S(bars.map((b) => (b.high + b.low + b.close) / 3)), S(volume), S(newDay.map(Number))));
    // request.security(tickerid, "1D", [high[1], low[1]], lookahead on): the high / low of the previous day
    let prevHigh = NaN;
    let prevLow = NaN;
    let dayHigh = NaN;
    let dayLow = NaN;
    for (let i = 0; i < n; i++) {
      if (newDay[i]) {
        prevHigh = dayHigh;
        prevLow = dayLow;
        dayHigh = bars[i].high;
        dayLow = bars[i].low;
      } else {
        dayHigh = Math.max(dayHigh, bars[i].high);
        dayLow = Math.min(dayLow, bars[i].low);
      }
      priorDayHigh[i] = prevHigh;
      priorDayLow[i] = prevLow;
    }
  }

  // The exchange calendar of the chart context (session and time zone), null without it or when the library cannot
  // read them
  let calendar: SessionContext | null = null;
  if (hasCalendar(chart) && chartTf !== '' && n > 0) {
    calendar = { timeframe: chartTf, timezone: chart!.timezone, session: chart!.session, regularSession: chart!.regularSession, timeUnit: ms ? 'ms' : 's' };
    try {
      chartSessions(calendar);
    } catch {
      calendar = null;
    }
  }
  // time_close: from the exchange calendar; without it (or without a period for the bar) the bar time plus the chart
  // timeframe
  const closeMs = (i: number) => {
    const t = calendar ? periodClose(bars[i].time, chartTf, calendar) : NaN;
    return Number.isNaN(t) ? tMs(i) + tfSeconds * 1000 : t;
  };

  // Higher timeframe: EMAs, close time and warm-up of its last closed bar (ema[1], time_close[1], bar_index[1])
  const htfFast: number[] = new Array(n).fill(NaN);
  const htfSlow: number[] = new Array(n).fill(NaN);
  const htfClosedAt: number[] = new Array(n).fill(NaN);
  const htfReady: boolean[] = new Array(n).fill(false);
  if (htfEnabled && n > 0) {
    const starts = securityStarts(bars, cfg.htfInput, chart);
    const { bars: htf, group } = resample(bars, starts);
    /** Last chart bar of each bar of the higher timeframe */
    const lastOf: number[] = [];
    group.forEach((g, i) => {
      lastOf[g] = i;
    });
    const htfSource = Series.fromArray(htf, htf.map(sourceOf));
    const fast = A(ta.ema(htfSource, fastLen));
    const slow = A(ta.ema(htfSource, slowLen));
    for (let i = 0; i < n; i++) {
      const g = group[i] - 1;
      if (g < 0) continue;
      htfFast[i] = fast[g];
      htfSlow[i] = slow[g];
      // time_close of the period: from the exchange calendar, else its start plus the timeframe
      const closed = calendar ? periodClose(bars[lastOf[g]].time, cfg.htfInput, calendar) : NaN;
      htfClosedAt[i] = Number.isNaN(closed) ? periodEnd(ms ? htf[g].time : htf[g].time * 1000, cfg.htfInput) : closed;
      htfReady[i] = g >= slowLen * cfg.warmupMult;
    }
  }

  const warmupBars = Math.max(trendLen * cfg.warmupMult, atrLen + ATR_MEAN_LEN);
  const bullCross = A(ta.crossover(S(emaFast), S(emaSlow)) as unknown as Series).map((v) => Boolean(v));
  const bearCross = A(ta.crossunder(S(emaFast), S(emaSlow)) as unknown as Series).map((v) => Boolean(v));
  const requiredRatio = Math.max(minScore / 10.0, Math.max(cfg.hideC ? 0.5 : 0, cfg.gradeFilter === 'A+ Only' ? 0.8 : cfg.gradeFilter === 'A+ and A' ? 0.65 : 0));
  const swingLow = A(ta.lowest(S(bars.map((b) => b.low)), cfg.swingLookback + 1));
  const swingHigh = A(ta.highest(S(bars.map((b) => b.high)), cfg.swingLookback + 1));
  const pivotHigh = A(ta.pivothigh(S(bars.map((b) => b.high)), cfg.pivotLen, cfg.pivotLen));
  const pivotLow = A(ta.pivotlow(S(bars.map((b) => b.low)), cfg.pivotLen, cfg.pivotLen));
  const sessionSpec = `${cfg.sessionHours}:${cfg.sessionDays}`;
  /** time("1D", session, time zone) of the library (the chart session of the context is not read) */
  const sessionCtx: SessionContext = { timeframe: chartTf || '1D', timezone: sessionTZ, session: sessionSpec, timeUnit: 'ms' };
  const dayStart = (t: number) => periodTime(t, '1D', sessionCtx, sessionSpec, sessionTZ);

  // Theme palette of the dashboard, journal and watermark
  const luminance = 0.2126 * (color.r(CHART_BG) as number) + 0.7152 * (color.g(CHART_BG) as number) + 0.0722 * (color.b(CHART_BG) as number);
  const dark = cfg.theme === 'Dark' || (cfg.theme === 'Auto' && luminance < 128);
  const textColor = cfg.theme === 'Auto' ? CHART_FG : dark ? '#E0E0E0' : '#1A1A1A';
  const textMuted = dark ? '#9E9E9E' : '#757575';
  const tableBg = String(color.new(dark ? '#131722' : '#FFFFFF', cfg.panelAlpha));
  const tableRowAlt = String(color.new(dark ? '#1C2030' : '#F0F4F8', cfg.panelAlpha));
  const tableBorder = dark ? '#2A2E39' : '#D0D0D0';
  const headerText = '#FFFFFF';
  const bullText = dark ? bullColor : '#006B45';
  const bearText = dark ? bearColor : '#A32330';
  const neutralText = dark ? neutralColorInput : '#F57F17';
  const wmColor = String(color.new(textColor, 80));

  // Model state
  let hasVolume = false;
  let sessionHigh = NaN;
  let sessionLow = NaN;
  let prevInSession = false;
  let prevSessionKey = NaN;
  let knownHigh = NaN;
  let knownLow = NaN;
  let trade = newTrade();
  const journal: Trade[] = [];
  const rejected: number[] = new Array(12).fill(0);
  const groupN: number[] = new Array(9).fill(0);
  const groupR: number[] = new Array(9).fill(0);
  let candidates = 0;
  let accepted = 0;
  let pendingDir = 0;
  let pendingBar = NaN;
  let lastDecision = 'Waiting for crossover';
  let total = 0;
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let lossStreak = 0;
  let maxLossStreak = 0;
  let totalR = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let peakR = 0;
  let maxDrawdownR = 0;
  let totalDuration = 0;
  let ambiguousTrades = 0;
  let reachedTP1 = 0;
  let reachedTP2 = 0;
  let totalMFE = 0;
  let totalMAE = 0;
  let firstEntryAt = NaN;
  let lastExitAt = NaN;

  const netR = (t: Trade) => t.grossR - t.costR;
  const takePartial = (t: Trade, px: number, requestedFraction: number) => {
    const fraction = Math.min(t.remaining, Math.max(0, requestedFraction));
    t.grossR += (fraction * t.dir * (px - t.entry)) / t.risk;
    t.costR += (fraction * sideCost(px)) / t.risk;
    t.remaining = Math.max(0, t.remaining - fraction);
  };
  const observe = (t: Trade, favorable: number, adverse: number) => {
    t.mfe = Math.max(t.mfe, Math.max(0, (t.dir * (favorable - t.entry)) / t.risk));
    t.mae = Math.max(t.mae, Math.max(0, (-t.dir * (adverse - t.entry)) / t.risk));
  };

  // Drawings. Labels in the drawing registry of the library, with the label limit of indicator(); the properties of
  // each label are kept here (texts and times are set on the last bar)
  resetDrawings({ label: MAX_LABELS });
  const labelData = new Map<Label, LabelObj>();
  const newLabel = (data: Omit<LabelObj, 'ref'>): LabelObj => {
    const obj = { ...data, ref: label.new(data.time, data.price, data.text, 'bar_time') };
    labelData.set(obj.ref, obj);
    return obj;
  };
  const deleteLabel = (obj: LabelObj) => label.delete(obj.ref);
  let levelLines: LineObj[] = [];
  let levelLabels: LabelObj[] = [];
  const tables: TableData[] = [];

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const plot3: typeof plot0 = [];
  const plot4: typeof plot0 = [];
  const fillColors: string[] = [];
  const bgColors: BgColorData[] = [];
  const fastColor = String(color.new(bullColor, 20));
  const slowColor = String(color.new(bearColor, 20));
  const resistanceColor = String(color.new(bearColor, 35));
  const supportColor = String(color.new(bullColor, 35));
  const fillBull = String(color.new(bullColor, 88));
  const fillBear = String(color.new(bearColor, 88));

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const bar = bars[i];
    const { open, high, low, close } = bar;
    const time = tMs(i);
    const timeClose = closeMs(i);
    const confirmed = LAST_BAR_CLOSED || i < n - 1;
    const last = i === n - 1;

    if (confirmed && gt(volume[i], 0)) hasVolume = true;
    const volumeReady = !hasVolume || (!na(volume[i]) && ge(volume[i], 0) && !na(volMean[i]) && gt(volMean[i], 0));
    const vwapReady = !(vwapEnabled && hasVolume) || !na(vwap[i]);
    const volAbove = hasVolume && volumeReady && gt(volume[i], volMean[i] * VOLUME_SPIKE);
    const htfBias = htfEnabled && htfReady[i] ? (gt(htfFast[i], htfSlow[i]) ? 1 : lt(htfFast[i], htfSlow[i]) ? -1 : 0) : 0;
    const warmed = i >= warmupBars;
    const histPrev = i > 0 ? hist[i - 1] : NaN;
    const ready = warmed && !na(atr[i]) && gt(atr[i], 0) && !na(atrMean[i]) && gt(atrMean[i], 0) && !na(rsi[i]) && !na(histPrev)
      && !na(adx[i]) && volumeReady && vwapReady && (!htfEnabled || (htfReady[i] && !na(htfFast[i]) && !na(htfSlow[i])));
    const volRatio = gt(atrMean[i], 0) ? atr[i] / atrMean[i] : NaN;
    const highVol = !na(volRatio) && gt(volRatio, cfg.volThreshold);
    const volatility = na(volRatio) ? 'N/A' : highVol ? 'High' : lt(volRatio, LOW_VOL_RATIO) ? 'Low' : 'Normal';
    const stopMultiplier = cfg.volMode === 'Widen SL' && highVol ? cfg.volWiden : 1;
    // Mandatory price momentum
    const bullMomentum = gt(close, emaFast[i]) && gt(close, emaSlow[i]);
    const bearMomentum = lt(close, emaFast[i]) && lt(close, emaSlow[i]);
    const trendDir = gt(emaFast[i], emaSlow[i]) && gt(close, emaTrend[i]) ? 1 : lt(emaFast[i], emaSlow[i]) && lt(close, emaTrend[i]) ? -1 : 0;
    const trending = ge(adx[i], ADX_TREND);
    const regime = !trending ? 0 : trendDir !== 0 ? 1 : 2;
    const regimeName = regime === 0 ? `Range (ADX<${ADX_TREND})` : regime === 1 ? `Trend ${directionName(trendDir)}` : 'Mixed';
    const softHtf = htfEnabled && cfg.htfMode === 'Soft score';
    const scoreMax = 5 + (hasVolume ? 1 : 0) + (vwapEnabled && hasVolume ? 1 : 0) + (softHtf ? 1.5 : 0);
    const bullScore = (gt(close, emaTrend[i]) ? 1 : 0) + (gt(rsi[i], 50) && lt(rsi[i], RSI_UPPER) ? 1 : 0) + (gt(hist[i], 0) ? 1 : 0)
      + (gt(hist[i], histPrev) ? 1 : 0) + (trending && gt(diPlus[i], diMinus[i]) ? 1 : 0) + (volAbove ? 1 : 0)
      + (vwapEnabled && hasVolume && gt(close, vwap[i]) ? 1 : 0) + (softHtf && htfBias === 1 ? 1.5 : 0);
    const bearScore = (lt(close, emaTrend[i]) ? 1 : 0) + (lt(rsi[i], 50) && gt(rsi[i], RSI_LOWER) ? 1 : 0) + (lt(hist[i], 0) ? 1 : 0)
      + (lt(hist[i], histPrev) ? 1 : 0) + (trending && gt(diMinus[i], diPlus[i]) ? 1 : 0) + (volAbove ? 1 : 0)
      + (vwapEnabled && hasVolume && lt(close, vwap[i]) ? 1 : 0) + (softHtf && htfBias === -1 ? 1.5 : 0);

    const makePlan = (d: number): Plan => {
      const e = roundToTick(close);
      const atrDistance = atr[i] * slMult * stopMultiplier;
      const atrStop = e - d * atrDistance;
      const structStop = d === 1 ? swingLow[i] - atr[i] * STRUCTURE_BUFFER : swingHigh[i] + atr[i] * STRUCTURE_BUFFER;
      // Structure only widens the stop (never tightens), then the cap bounds the widening
      const rawStop = cfg.structureInput ? (d === 1 ? Math.min(atrStop, structStop) : Math.max(atrStop, structStop)) : atrStop;
      const capped = cfg.structureInput && gt(Math.abs(e - rawStop), atrDistance * STRUCTURE_CAP);
      const bounded = capped ? e - d * atrDistance * STRUCTURE_CAP : rawStop;
      const stop = d === 1 ? roundDown(bounded) : roundUp(bounded);
      const risk = Math.abs(e - stop);
      const p1 = roundToTick(e + d * risk * cfg.tp1Mult);
      const p2 = roundToTick(e + d * risk * cfg.tp2Mult);
      const p3 = roundToTick(e + d * risk * cfg.tp3Mult);
      const valid = !na(risk) && ge(risk, cfg.minRiskTicks * MINTICK - MINTICK * 1e-6) && gt(d * (e - stop), 0) && gt(d * (p1 - e), 0)
        && gt(d * (p2 - p1), 0) && gt(d * (p3 - p2), 0)
        && (!cfg.positiveOnly || gt(Math.min(Math.min(e, stop), Math.min(p1, Math.min(p2, p3))), 0));
      const origin = !cfg.structureInput ? 'ATR' : capped ? 'ATR capped (inside structure possible)' : ne(rawStop, atrStop) ? 'Structure' : 'ATR';
      return { e, stop, risk, p1, p2, p3, capped, valid, origin };
    };

    // time() with a session spec gives the bar time inside the session, na outside
    const inSession = pineTime.inSession(time, sessionSpec, sessionTZ, isIntraday ? tfSeconds * 1000 : undefined);
    const sessionAllowed = cfg.sessionMode !== 'Filter entries' || inSession;
    const dateAllowed = time >= cfg.startInput && timeClose < cfg.endInput;
    // A session with a gap starts when the gap ends; a whole-day session rolls on the calendar day of its time zone
    const wholeDay = cfg.sessionHours === '0000-0000';
    const sessionKey = wholeDay && inSession ? dayStart(time) : NaN;
    const sessionStart = inSession && (!prevInSession || (wholeDay && !Number.isNaN(sessionKey) && !Number.isNaN(prevSessionKey) && sessionKey !== prevSessionKey));
    if (inSession) {
      sessionHigh = sessionStart || na(sessionHigh) ? high : Math.max(sessionHigh, high);
      sessionLow = sessionStart || na(sessionLow) ? low : Math.min(sessionLow, low);
    }
    prevInSession = inSession;
    prevSessionKey = sessionKey;
    if (confirmed) {
      if (!na(pivotHigh[i])) knownHigh = pivotHigh[i];
      if (!na(pivotLow[i])) knownLow = pivotLow[i];
    }

    const gate = (d: number, planValid: boolean, capped: boolean): number => {
      const evidence = d === 1 ? bullScore : bearScore;
      const momentum = d === 1 ? bullMomentum : bearMomentum;
      if (!ready) return 1;
      if (!dateAllowed) return 2;
      if (!sessionAllowed) return 3;
      if (cfg.volMode === 'Skip Signals' && highVol) return 4;
      if (!momentum) return 5;
      if (d === 1 ? ge(rsi[i], RSI_UPPER) : le(rsi[i], RSI_LOWER)) return 6;
      if (htfEnabled && cfg.htfMode === 'Hard filter' && htfBias !== d) return 7;
      if (lt(evidence + 1e-9, requiredRatio * scoreMax)) return 8;
      if (!planValid) return 9;
      if (cfg.structurePolicy === 'Skip entry' && capped) return 10;
      if (gt(cfg.maxExtension, 0) && gt(Math.abs(close - emaFast[i]) / atr[i], cfg.maxExtension)) return 11;
      return 0;
    };

    let confirmedBuy = false;
    let confirmedSell = false;
    let stopEvent = false;

    if (confirmed) {
      // Candidate lifecycle, counted once per crossover
      if ((bullCross[i] || bearCross[i]) && dateAllowed && warmed) {
        if (pendingDir !== 0) rejected[0] += 1;
        pendingDir = bullCross[i] ? 1 : -1;
        pendingBar = i;
        candidates += 1;
      }
      let signal = 0;
      if (pendingDir !== 0) {
        const plan = makePlan(pendingDir);
        let code = gate(pendingDir, plan.valid, plan.capped);
        // A higher-priority temporary gate must never keep a broken candidate alive
        if (!(pendingDir === 1 ? bullMomentum : bearMomentum)) code = 5;
        // The last bar of the candidate is confirmWindow bars after the crossover
        const lastChance = i - pendingBar >= cfg.confirmWindow;
        const alreadyOpen = trade.active && trade.dir === pendingDir;
        if (code === 0 && !alreadyOpen) {
          signal = pendingDir;
          lastDecision = `${directionName(signal)} accepted`;
          accepted += 1;
          pendingDir = 0;
        } else {
          lastDecision = alreadyOpen ? 'Same direction already open' : rejectReason(code);
          const terminal = lastChance || code === 5 || alreadyOpen || !dateAllowed;
          if (terminal) {
            rejected[alreadyOpen ? 0 : code] += 1;
            pendingDir = 0;
          }
        }
      }

      // The old position is processed before a new entry
      if (trade.active && i > trade.entryBar) {
        const oldStop = trade.stop;
        const stopped = trade.dir === 1 ? le(low, oldStop) : ge(high, oldStop);
        const touch1 = !trade.hit1 && (trade.dir === 1 ? ge(high, trade.tp1) : le(low, trade.tp1));
        const touch2 = !trade.hit2 && (trade.dir === 1 ? ge(high, trade.tp2) : le(low, trade.tp2));
        const touch3 = !trade.hit3 && (trade.dir === 1 ? ge(high, trade.tp3) : le(low, trade.tp3));
        const finish = (px: number, why: string) => {
          takePartial(trade, px, trade.remaining);
          trade.active = false;
          trade.exitPrice = px;
          trade.exitBar = i;
          trade.exitTime = timeClose;
          trade.reason = why;
        };
        if (stopped) {
          const fillPrice = trade.dir === 1 ? Math.min(open, oldStop) : Math.max(open, oldStop);
          trade.ambiguous = trade.ambiguous || touch1 || touch2 || touch3;
          observe(trade, open, open);
          observe(trade, fillPrice, fillPrice);
          finish(fillPrice, !ne(oldStop, trade.initialStop) ? 'SL' : 'Step stop');
        } else {
          if (touch1) {
            trade.hit1 = true;
            takePartial(trade, trade.tp1, cfg.tp1Pct / 100);
          }
          if (touch2) {
            trade.hit2 = true;
            takePartial(trade, trade.tp2, cfg.tp2Pct / 100);
          }
          if (touch3) {
            trade.hit3 = true;
            if (cfg.fullTP3) {
              observe(trade, open, open);
              observe(trade, trade.tp3, trade.tp3);
              finish(trade.tp3, 'TP3');
            }
          }
          if (trade.active) {
            observe(trade, trade.dir === 1 ? high : low, trade.dir === 1 ? low : high);
            if (signal === -trade.dir) {
              finish(close, 'Reversal');
            } else if (timeClose >= cfg.endInput) {
              finish(close, 'Date end');
            } else if (cfg.trailInput) {
              const nextStop = trade.hit3 ? trade.tp2 : trade.hit2 ? trade.tp1 : trade.hit1 ? trade.entry : trade.stop;
              if (gt(trade.dir * (nextStop - trade.stop), MINTICK * 0.1)) {
                trade.stop = nextStop;
                stopEvent = true;
              }
            }
          }
        }

        if (!trade.active) {
          // Single accounting path for every complete exit, after all partial fills
          const realized = netR(trade);
          total += 1;
          totalR += realized;
          peakR = Math.max(peakR, totalR);
          maxDrawdownR = Math.max(maxDrawdownR, peakR - totalR);
          totalDuration += i - trade.entryBar;
          lastExitAt = timeClose;
          totalMFE += trade.mfe;
          totalMAE += trade.mae;
          reachedTP1 += trade.hit1 ? 1 : 0;
          reachedTP2 += trade.hit2 ? 1 : 0;
          ambiguousTrades += trade.ambiguous ? 1 : 0;
          if (gt(realized, 1e-8)) {
            wins += 1;
            grossWin += realized;
            lossStreak = 0;
          } else if (lt(realized, -1e-8)) {
            losses += 1;
            grossLoss += -realized;
            lossStreak += 1;
            maxLossStreak = Math.max(maxLossStreak, lossStreak);
          } else {
            breakevens += 1;
            lossStreak = 0;
          }
          for (const bucket of [trade.dir === 1 ? 0 : 1, 2 + gradeIndex(trade.grade), 6 + trade.regime]) {
            groupN[bucket] += 1;
            groupR[bucket] += realized;
          }
          journal.unshift(trade);
          if (journal.length > JOURNAL_MAX) journal.pop();
          if (cfg.showExits) {
            newLabel({
              time, price: trade.exitPrice, text: `${trade.reason} ${fmt(realized)}R`,
              style: trade.dir === 1 ? 'label_down' : 'label_up',
              color: gt(realized, 0) ? bullColor : lt(realized, 0) ? bearColor : neutralColorInput, textColor: '#FFFFFF', size: 'tiny',
              tooltip: `Model exit ${price(trade.exitPrice)}\nGross ${fmt(trade.grossR)}R / costs ${fmt(trade.costR)}R\n`
                + `MFE/MAE lower bounds ${fmt(trade.mfe)}/${fmt(trade.mae)}R\n`
                + (trade.ambiguous ? 'Ambiguous OHLC: old stop first' : 'Confirmed bar model'),
            });
          }
        }
      }

      if (signal !== 0 && !trade.active) {
        const plan = makePlan(signal);
        const score = signal === 1 ? bullScore : bearScore;
        trade = {
          ...newTrade(), active: true, dir: signal, entryBar: i, entryTime: timeClose, entry: plan.e, initialStop: plan.stop,
          stop: plan.stop, risk: plan.risk, tp1: plan.p1, tp2: plan.p2, tp3: plan.p3, score, maxScore: scoreMax,
          grade: gradeOf(score / scoreMax), regime, origin: plan.origin,
        };
        trade.costR = sideCost(plan.e) / plan.risk;
        firstEntryAt = Number.isNaN(firstEntryAt) ? timeClose : firstEntryAt;
        confirmedBuy = signal === 1;
        confirmedSell = signal === -1;
        if (cfg.showSignals) {
          newLabel({
            time, price: signal === 1 ? low : high, text: directionName(signal) + (cfg.showGradeInput ? ` ${trade.grade}` : ''),
            style: signal === 1 ? 'label_up' : 'label_down', color: signal === 1 ? bullColor : bearColor, textColor: '#FFFFFF',
            size: signalSize,
            tooltip: `Entry ${price(plan.e)} | risk ${price(plan.risk)}\nEvidence ${fmt(trade.score)}/${fmt(scoreMax)}\n${plan.origin}\n`
              + `${regimeName}\nPartial TP1/2: ${fmt(cfg.tp1Pct)}% / ${fmt(cfg.tp2Pct)}%`,
          });
        }
      }
    }

    // Plots
    const t = bar.time;
    plot0.push({ time: t, value: cfg.showRibbon ? emaFast[i] : NaN, color: fastColor });
    plot1.push({ time: t, value: cfg.showRibbon ? emaSlow[i] : NaN, color: slowColor });
    fillColors.push(gt(emaFast[i], emaSlow[i]) ? fillBull : fillBear);
    plot2.push({ time: t, value: cfg.showRibbon ? emaTrend[i] : NaN, color: textMuted });
    if (cfg.showBg) {
      bgColors.push({ time: t, color: String(color.new(trendDir === 1 ? bullColor : trendDir === -1 ? bearColor : neutralColorInput, 94)) });
    }
    let above = NaN;
    for (const level of [isIntraday ? priorDayHigh[i] : NaN, isIntraday && inSession ? sessionHigh : NaN, knownHigh]) {
      if (!na(level) && gt(level, close) && (na(above) || lt(level, above))) above = level;
    }
    let below = NaN;
    for (const level of [isIntraday ? priorDayLow[i] : NaN, isIntraday && inSession ? sessionLow : NaN, knownLow]) {
      if (!na(level) && lt(level, close) && (na(below) || gt(level, below))) below = level;
    }
    plot3.push({ time: t, value: cfg.showLevels ? above : NaN, color: resistanceColor });
    plot4.push({ time: t, value: cfg.showLevels ? below : NaN, color: supportColor });

    // Level lines and labels of the last trade (time coordinates; the forward offset is nominal timeframe time)
    const levelRightTime = trade.active ? timeClose + Math.trunc(tfSeconds * 1000) * cfg.labelOffset : trade.exitTime;
    const levelOf = (k: number) => (k === 0 ? trade.entry : k === 1 ? trade.initialStop : k === 2 ? trade.tp1 : k === 3 ? trade.tp2
      : k === 4 ? trade.tp3 : trade.stop);
    if (confirmedBuy || confirmedSell) {
      for (const lb of levelLabels) deleteLabel(lb);
      levelLines = [];
      levelLabels = [];
      if (cfg.showTPSL) {
        for (let k = 0; k <= 5; k++) {
          const level = levelOf(k);
          const col = k === 0 ? '#2979FF' : k === 1 ? bearColor : k === 5 ? String(color.orange) : bullColor;
          levelLines.push({
            x1: trade.entryTime, y1: level, x2: levelRightTime, y2: level, color: k === 5 && !cfg.showTrail ? 'transparent' : col,
            style: k === 0 || k === 1 ? 'solid' : 'dashed',
          });
          levelLabels.push(newLabel({
            time: levelRightTime, price: level, text: '', style: 'label_left', color: String(color.new(col, 25)), textColor: '#FFFFFF',
            size: 'tiny',
          }));
        }
      }
    }
    if (last && levelLines.length > 0) {
      for (let k = 0; k <= 5; k++) {
        const ln = levelLines[k];
        const lb = levelLabels[k];
        const level = levelOf(k);
        const name = k === 0 ? 'ENTRY' : k === 1 ? 'INITIAL SL' : k === 5 ? `STEP SL${stopEvent ? ' (next bar)' : ''}` : `TP${k - 1}`;
        const hit = k === 2 ? trade.hit1 : k === 3 ? trade.hit2 : k === 4 ? trade.hit3 : false;
        ln.x2 = levelRightTime;
        ln.y2 = level;
        if (k === 5) ln.y1 = level;
        if (hit) ln.style = 'solid';
        lb.time = levelRightTime;
        lb.price = level;
        lb.text = k === 5 && !cfg.showTrail ? '' : `${name}${hit ? ' ✓ ' : ' '}${price(level)}${trade.active ? '' : ' [closed]'}`;
        if (k === 5 && !cfg.showTrail) lb.color = 'transparent';
      }
    }

    // Dashboard, journal and watermark: the last bar only
    if (!last) continue;
    const watermark: TableData = { position: 'bottom_center', columns: 1, rows: 1, cells: [] };
    const focusDir = pendingDir !== 0 ? pendingDir : trade.active ? trade.dir : trendDir !== 0 ? trendDir : ge(bullScore, bearScore) ? 1 : -1;
    const focusPlan = makePlan(focusDir);
    const liveGate = gate(focusDir, focusPlan.valid, focusPlan.capped);
    const liveScore = focusDir === 1 ? bullScore : bearScore;
    const dataStatus = !warmed ? `Warmup ${i}/${warmupBars}` : !volumeReady ? 'Volume data missing — blocked'
      : !vwapReady ? 'VWAP unavailable — blocked'
        : htfEnabled && (!htfReady[i] || na(htfFast[i]) || na(htfSlow[i])) ? 'HTF warmup/missing — blocked'
          : !ready ? 'Missing/invalid price indicators — blocked' : !hasVolume ? 'Ready; no volume weights' : 'Ready';
    // The current status must not reuse a historical acceptance for an ignored crossover
    let signalStatus = 'No new crossover';
    if (confirmedBuy || confirmedSell) {
      signalStatus = lastDecision;
    } else if (pendingDir !== 0) {
      signalStatus = `${directionName(pendingDir)}: ${liveGate === 0 ? 'Conditions met; awaiting bar close' : rejectReason(liveGate)}`;
    } else if (bullCross[i] || bearCross[i]) {
      signalStatus = !confirmed ? 'Unconfirmed crossover' : !dateAllowed ? 'Outside date window' : !warmed ? 'Data not ready / warmup' : lastDecision;
    }
    const nextTP = !trade.hit1 ? trade.tp1 : !trade.hit2 ? trade.tp2 : !trade.hit3 ? trade.tp3 : NaN;
    const unrealizedR = trade.active ? (trade.remaining * trade.dir * (close - trade.entry)) / trade.risk : NaN;
    // Room belongs to the active position first
    const roomDir = trade.active ? trade.dir : focusDir;
    const roomLevel = roomDir === 1 ? above : below;
    const refRisk = trade.active ? trade.risk : focusPlan.risk;
    const roomR = !na(roomLevel) && gt(refRisk, 0) ? Math.abs(roomLevel - close) / refRisk : NaN;
    const estimateEntry = gt(cfg.manualEntry, 0) ? cfg.manualEntry : close;
    const estimateStop = trade.active ? trade.stop : focusPlan.stop;
    const estimateDir = trade.active ? trade.dir : focusDir;
    const estimateRisk = estimateDir * (estimateEntry - estimateStop);
    const estimatedCosts = sideCost(estimateEntry) + sideCost(estimateStop);
    const estimatedCostR = gt(estimateRisk, 0) ? estimatedCosts / estimateRisk : NaN;
    const drift = gt(trade.risk, 0) ? (trade.dir * (close - trade.entry)) / trade.risk : NaN;
    const remainingRR = trade.active && gt(estimateRisk, 0) && !na(nextTP) && gt(trade.dir * (nextTP - estimateEntry), 0)
      ? (trade.dir * (nextTP - estimateEntry)) / estimateRisk : NaN;
    const stopDistance = trade.active ? trade.dir * (close - trade.stop) : NaN;
    const targetDistance = trade.active && !na(nextTP) ? trade.dir * (nextTP - close) : NaN;
    const trendWord = trendDir === 1 ? 'Bullish' : trendDir === -1 ? 'Bearish' : 'Neutral';
    const trendCol = trendDir === 1 ? bullText : trendDir === -1 ? bearText : neutralText;
    const headerBg = trendDir === 1 ? '#0F6E56' : trendDir === -1 ? '#A32D2D' : '#2962FF';
    const formatTime = (tm: number, pattern: string) => str.format_time(tm, pattern, sessionTZ);

    if (cfg.showDash) {
      const rows: Row[] = [];
      const addData = (key: string, value: string, col: string, tip: string) => rows.push({ kind: 0, key, value, col, tip });
      const addSection = (title: string) => rows.push({ kind: 1, key: title, value: '', col: '', tip: '' });
      const addNote = (note: string, col: string) => rows.push({ kind: 2, key: '', value: note, col, tip: '' });
      rows.push({ kind: 3, key: '', value: `◆ PrecSniper · ${trendWord}`, col: '', tip: '' });

      if (cfg.showMarketSec) {
        addSection('— Market —');
        addData('Regime', regimeName, trendCol, 'ADX regime and EMA alignment on the current bar.');
        addData('HTF', htfEnabled
          ? `${cfg.htfInput} ${directionName(htfBias)} · ${cfg.htfMode}${Number.isNaN(htfClosedAt[i]) ? '' : ` · closed ${formatTime(htfClosedAt[i], 'MM-dd HH:mm')}`}`
          : 'Off', htfBias === 1 ? bullText : htfBias === -1 ? bearText : textColor,
        'Bias of the last CLOSED higher-timeframe bar. Soft score adds 1.5 points; Hard filter blocks opposing entries.');
        addData('Volatility', `${volatility} ${fmt(volRatio)}x · ATR ${fmt(ne(close, 0) ? (atr[i] / Math.abs(close)) * 100 : NaN)}% · ${cfg.volMode}`,
          highVol ? bearText : textColor, `ATR relative to its ${ATR_MEAN_LEN}-bar mean, ATR as % of price, and the high-volatility action.`);
        addData('Session', cfg.sessionMode === 'Off' ? 'Off' : `${inSession ? 'Inside' : 'Outside'} · ${sessionTZ} · ${cfg.sessionMode}`, textColor,
          'Trading window state in the session timezone.');
        addData('Data', dataStatus + (trade.ambiguous ? ' · last trade OHLC ambiguity' : ''), ready ? textColor : bearText,
          'Warmup and data readiness. Entries are blocked until Ready.');
        addData('Profile', `${preset} · EMA ${fastLen}/${slowLen}/${trendLen} · RSI ${rsiLen} · ATR ${atrLen} · SL ${fmt(slMult)}x`, textMuted,
          'Effective parameter profile after preset resolution.');
      }

      if (cfg.showSignalSec) {
        addSection('— Signal —');
        const requiredPts = requiredRatio * scoreMax;
        addData('Candidate', signalStatus, liveGate === 0 ? bullText : textMuted, 'Crossover candidate state and the first failing gate, evaluated live.');
        addData('Evidence', `${fmt(liveScore)}/${fmt(scoreMax)}  ${buildGauge(liveScore, scoreMax, 8)} · need ${fmt(requiredPts)}${confirmed ? ' [closed]' : ' [live]'}`,
          ge(liveScore + 1e-9, requiredPts) ? bullText : neutralText,
          'Optional evidence for the focused side vs the required minimum. Grade thresholds: A+ 80%, A 65%, B 50%.');
        addData('Plan', `${directionName(focusDir)} · SL ${price(focusPlan.stop)} · risk ${price(focusPlan.risk)} · ${focusPlan.origin}`,
          focusPlan.valid ? textColor : bearText, 'Stop, initial risk and stop origin the model would use for an entry at the current close.');
        addData('Est. cost', `${fmt(estimatedCostR)}R${ge(estimatedCostR, cfg.costWarningR) ? ' [high vs stop]' : ''} · manual inputs`,
          ge(estimatedCostR, cfg.costWarningR) ? bearText : textColor, 'Round-trip commission, spread and slippage as a fraction of initial risk.');
        addData('Last decision', lastDecision, textMuted, 'Outcome of the most recent candidate.');
      }

      // Trade section (collapses when flat)
      if (cfg.showTradeSec) {
        addSection('— Trade —');
        if (trade.active) {
          const stepped = ne(trade.stop, trade.initialStop);
          addData('Position', `${directionName(trade.dir)} · ${i - trade.entryBar} bars · ${fmt(trade.remaining * 100)}% left`,
            trade.dir === 1 ? bullText : bearText, 'Open model position and the remaining fraction after partial exits.');
          addData('Entry', `${price(trade.entry)} · ${trade.grade} · ${fmt(trade.score)}/${fmt(trade.maxScore)} · ${trade.origin}`, textColor,
            `Entry price, grade, evidence and stop origin at entry. ${Number.isNaN(trade.entryTime) ? '' : `${formatTime(trade.entryTime, 'yyyy-MM-dd HH:mm')} ${sessionTZ}`}`);
          addData('Stop', `${stepped ? 'Step @ ' : ''}${price(trade.stop)}${stopEvent ? ' (next bar)' : ''} · initial ${price(trade.initialStop)}${cfg.trailInput ? ' · step ON' : ' · step OFF'}`,
            stepped ? neutralText : bearText, 'Effective stop. Step changes apply from the NEXT bar. Entry-price stop is not net breakeven after costs.');
          addData('TP1', `${trade.hit1 ? '✓ ' : ''}${price(trade.tp1)} · ${fmt(cfg.tp1Pct)}%`, trade.hit1 ? bullText : textColor,
            '✓ = touched. Percent = partial close of the original position.');
          addData('TP2', `${trade.hit2 ? '✓ ' : ''}${price(trade.tp2)} · ${fmt(cfg.tp2Pct)}%`, trade.hit2 ? bullText : textColor,
            '✓ = touched. Percent = partial close of the original position.');
          addData('TP3', `${trade.hit3 ? '✓ ' : ''}${price(trade.tp3)}${cfg.fullTP3 ? ' · closes rest' : ' · holds rest'}`, trade.hit3 ? bullText : textColor,
            "Final target. With 'Close remaining position at TP3' the trade ends here.");
          addData('Unrealized', `${fmt(unrealizedR)}R gross · realized ${fmt(netR(trade))}R net`,
            gt(unrealizedR, 0) ? bullText : lt(unrealizedR, 0) ? bearText : textColor,
            'Open P/L in R on the remaining fraction, and realized net R from partial fills.');
          addData('Distances', `${price(stopDistance)} / ${price(targetDistance)} · ${fmt(stopDistance / trade.risk)}R / ${fmt(targetDistance / trade.risk)}R · `
            + `${fmt(ne(close, 0) ? (stopDistance / Math.abs(close)) * 100 : NaN)}% / ${fmt(ne(close, 0) ? (targetDistance / Math.abs(close)) * 100 : NaN)}%`,
          textColor, 'Live distance to the stop / to the next target: price, R, percent.');
          addData('Room', `${directionName(roomDir)} · ${price(roomLevel)} · ${fmt(roomR)}R${na(roomLevel) ? ' (none tracked)' : ''}`, textColor,
            'Nearest known level in the trade direction and its distance in R from live price.');
          addData('Drift', `${fmt(drift)}R${ge(drift, cfg.lateR) ? ' [extended]' : ''} · hyp. R:R ${fmt(remainingRR)}`, ge(drift, cfg.lateR) ? neutralText : textColor,
            'Price drift from entry in R. Hypothetical R:R = next target vs stop for an entry at the live price, not the original trade R.');
        } else {
          addNote('Flat · waiting for a crossover', textMuted);
          if (trade.dir !== 0) {
            const lastR = netR(trade);
            addData('Last trade', `${directionName(trade.dir)} · ${trade.reason} · ${fmt(lastR)}R${trade.ambiguous ? ' [amb]' : ''}`,
              gt(lastR, 0) ? bullText : lt(lastR, 0) ? bearText : textColor, 'Most recent closed model trade.');
          }
          addData('Room', `${directionName(roomDir)} [plan] · ${price(roomLevel)} · ${fmt(roomR)}R${na(roomLevel) ? ' (none tracked)' : ''}`, textColor,
            'Nearest known level for the planned side and its distance in planned R.');
        }
      }

      // Sizing (manual estimate, only when enabled)
      if (cfg.sizeEnabled) {
        addSection('— Sizing —');
        // syminfo.currency (with the linear contract confirmed and no currency in the chart context, calculate() throws above)
        const symbolCurrency = currencyOf(chart);
        const riskBudget = cfg.riskMode === 'Cash' ? cfg.riskCash : (cfg.equityInput * cfg.riskPct) / 100;
        const calcValid = cfg.linearConfirmed && cfg.accountCurrency === symbolCurrency && ge(estimateRisk, MINTICK)
          && (!cfg.positiveOnly || gt(Math.min(estimateEntry, estimateStop), 0)) && (trade.active || (ready && focusPlan.valid));
        const quantity = calcValid
          ? Math.floor(riskBudget / ((estimateRisk + estimatedCosts) * cfg.pointValueInput) / cfg.lotStep) * cfg.lotStep : NaN;
        const calcStatus = !cfg.linearConfirmed ? 'Verify linear contract first'
          : cfg.accountCurrency !== symbolCurrency ? `Currency mismatch: ${symbolCurrency}`
            : !calcValid ? 'Invalid plan / stop side'
              : lt(quantity, cfg.minQty) ? 'Below minimum quantity'
                : `${qtyFmt(quantity)} units; risk ${fmt(quantity * (estimateRisk + estimatedCosts) * cfg.pointValueInput)} ${cfg.accountCurrency}`;
        addData('Estimate', calcStatus, calcValid ? textColor : textMuted, 'Manual position estimate for linear instruments. Never rewrites the model trade.');
        addData('Size / notional', calcValid && ge(quantity, cfg.minQty)
          ? `${qtyFmt(quantity)} / ${fmt(quantity * Math.abs(estimateEntry) * cfg.pointValueInput)} ${cfg.accountCurrency} (not margin)` : 'N/A',
        textMuted, 'Quantity from the risk budget, and notional value at the estimate entry.');
      }

      if (cfg.showStats) {
        addSection('— Stats —');
        const winRate = total > 0 ? (100.0 * wins) / total : NaN;
        // Recent-form strip from the journal, newest on the right
        let form = '';
        for (let j = Math.min(FORM_LEN, journal.length) - 1; j >= 0; j--) {
          const r = netR(journal[j]);
          form += gt(r, 1e-8) ? '▰' : lt(r, -1e-8) ? '▱' : '▫';
        }
        addData('Closed', `${total} · ${wins}W / ${losses}L / ${breakevens}BE`, textColor, 'Closed model trades in the requested window.');
        addData('Win rate', total > 0 ? `${fmt(winRate)}%  ${buildGauge(winRate, 100, 8)}` : 'N/A',
          total === 0 ? textMuted : ge(winRate, 55) ? bullText : ge(winRate, 45) ? neutralText : bearText,
          'Wins / closed trades. Net R above zero counts as a win.');
        addData('Expectancy / PF', total > 0 ? `${fmt(totalR / total)}R / ${gt(grossLoss, 0) ? fmt(grossWin / grossLoss) : gt(grossWin, 0) ? 'no losses' : 'N/A'}` : 'N/A',
          total === 0 ? textMuted : gt(totalR, 0) ? bullText : lt(totalR, 0) ? bearText : textColor,
          'Average net R per closed trade, and gross profit / gross loss.');
        addData('Net / max DD', `${fmt(totalR)}R / ${fmt(maxDrawdownR)}R`, gt(totalR, 0) ? bullText : lt(totalR, 0) ? bearText : textColor,
          'Net total R and the largest peak-to-trough drop of closed-trade equity.');
        addData('Avg win / loss / streak', `${fmt(wins > 0 ? grossWin / wins : NaN)}R / ${fmt(losses > 0 ? grossLoss / losses : NaN)}R / ${maxLossStreak}`, textColor,
          'Average winning R, average losing R, longest losing streak.');
        addData('Duration / ambiguous', `${fmt(total > 0 ? (1.0 * totalDuration) / total : NaN)} bars / ${ambiguousTrades}`, textColor,
          'Average bars per trade, and trades where stop and target touched on the same bar (old stop first).');
        addData('TP1 / TP2 reach', `${fmt(total > 0 ? (100.0 * reachedTP1) / total : NaN)}% / ${fmt(total > 0 ? (100.0 * reachedTP2) / total : NaN)}%`, textColor,
          'Share of closed trades that touched TP1 / TP2.');
        addData('MFE / MAE', `${fmt(total > 0 ? totalMFE / total : NaN)}R / ${fmt(total > 0 ? totalMAE / total : NaN)}R`, textMuted,
          'Average maximum favorable / adverse excursion, lower bounds from OHLC.');
        addData('Form', form === '' ? 'N/A' : form, textColor, `Last ${FORM_LEN} closed trades, newest on the right. ▰ win · ▱ loss · ▫ break-even.`);
        addData('Window / costs', `${formatTime(cfg.startInput, 'yyyy-MM-dd')}..${formatTime(cfg.endInput, 'yyyy-MM-dd')} · `
          + (gt(cfg.commissionPct + cfg.spreadTicks + cfg.slipTicks, 0) ? 'manual costs ON' : 'costs OFF'), textMuted,
        'Requested statistics window and whether manual costs are applied.');
      }

      if (cfg.showDiagSec) {
        const groupText = (index: number) => {
          const count = groupN[index];
          return `${count} trades / ${count > 0 ? `${fmt(groupR[index] / count)}R` : 'N/A'}${count < 30 ? ' [small N]' : ''}`;
        };
        addSection('— Diagnostics —');
        addData('Factors', 'Trend/RSI/MACD/Accel/ADX = 1 each · Vol/VWAP = 1 · soft HTF = 1.5', textMuted,
          'Weights of the optional evidence factors for the focused side.');
        addData('Trend / RSI / MACD / accel', `${gt(focusDir * (close - emaTrend[i]), 0) ? '1' : '0'} / `
          + `${(focusDir === 1 ? gt(rsi[i], 50) && lt(rsi[i], RSI_UPPER) : lt(rsi[i], 50) && gt(rsi[i], RSI_LOWER)) ? '1' : '0'} / `
          + `${gt(focusDir * hist[i], 0) ? '1' : '0'} / ${gt(focusDir * (hist[i] - histPrev), 0) ? '1' : '0'}`, textColor,
        'Live factor states for the focused side.');
        addData('ADX / volume / VWAP / HTF', `${trending && gt(focusDir * (diPlus[i] - diMinus[i]), 0) ? '1' : '0'} / `
          + `${hasVolume ? (volAbove ? '1' : '0') : 'N/A'} / ${vwapEnabled && hasVolume ? (gt(focusDir * (close - vwap[i]), 0) ? '1' : '0') : 'OFF'} / `
          + `${htfEnabled ? directionName(htfBias) : 'OFF'}`, textColor, 'Live factor states for the focused side.');
        addData('Candidates / accepted / pending', `${candidates} / ${accepted} / ${pendingDir !== 0 ? '1' : '0'}`, textColor,
          'Crossover candidates seen, entries accepted, candidate pending now.');
        let reasons = '';
        for (let k = 0; k <= 11; k++) {
          if (rejected[k] > 0) reasons += `${reasons === '' ? '' : '; '}${k === 0 ? 'opposite cross/already open' : rejectReason(k)}=${rejected[k]}`;
        }
        addData('Rejections', reasons === '' ? 'None' : reasons, textMuted, 'One final rejection reason per candidate.');
        addData('Long / Short', `${groupText(0)} | ${groupText(1)}`, textColor, 'Count and average net R by direction.');
        addData('A+ / A', `${groupText(2)} | ${groupText(3)}`, textColor, 'Count and average net R by grade.');
        addData('B / C', `${groupText(4)} | ${groupText(5)}`, textColor, 'Count and average net R by grade.');
        addData('Range / Trend / Mixed', `${groupText(6)} | ${groupText(7)} | ${groupText(8)}`, textColor, 'Count and average net R by regime at entry.');
        addData('First entry / last exit', `${Number.isNaN(firstEntryAt) ? 'N/A' : formatTime(firstEntryAt, 'yyyy-MM-dd')} / `
          + `${Number.isNaN(lastExitAt) ? 'N/A' : formatTime(lastExitAt, 'yyyy-MM-dd')}`, textMuted, 'Observed span of model trades on the loaded history.');
      }

      rows.push({ kind: 4, key: '', value: `Precision Sniper · ${VERSION} · model, not broker fills`, col: '', tip: '' });

      // renderRows(): a table sized to the rows
      const cells: TableCellData[] = [];
      const merges: TableMergeData[] = [];
      let dataIdx = 0;
      rows.forEach((it, r) => {
        const merged = (text: string, textCol: string, bg: string, size: PineSize) => {
          cells.push({ column: 0, row: r, text, textColor: textCol, bgColor: bg, textSize: size, textHAlign: 'center' });
          merges.push({ startColumn: 0, startRow: r, endColumn: 1, endRow: r });
        };
        if (it.kind === 3) {
          merged(it.value, headerText, headerBg, txtSize);
        } else if (it.kind === 1) {
          merged(it.key, textMuted, tableRowAlt, 'tiny');
        } else if (it.kind === 4) {
          merged(it.value, textMuted, tableBg, 'tiny');
        } else {
          const rb = dataIdx % 2 === 1 ? tableRowAlt : tableBg;
          dataIdx += 1;
          if (it.kind === 2) {
            merged(it.value, it.col, rb, txtSize);
          } else {
            cells.push({ column: 0, row: r, text: it.key, textColor: textMuted, bgColor: rb, textSize: txtSize, textHAlign: 'left', tooltip: it.tip });
            cells.push({ column: 1, row: r, text: it.value, textColor: it.col, bgColor: rb, textSize: txtSize, textHAlign: 'left', tooltip: it.tip });
          }
        }
      });
      tables.push({
        position: pos(cfg.dashPos), columns: 2, rows: Math.max(rows.length, 1), bgColor: tableBg, borderColor: tableBorder, borderWidth: 1,
        frameColor: tableBorder, frameWidth: 1, cells, merges,
      });
    }

    // Journal (same palette: tinted header, zebra rows, frame)
    if (cfg.showJournal) {
      const shown = Math.min(cfg.journalRows, journal.length);
      const cells: TableCellData[] = [];
      const merges: TableMergeData[] = [];
      cells.push({ column: 0, row: 0, text: '◆ Recent model trades', textColor: headerText, bgColor: headerBg, textSize: txtSize, textHAlign: 'center' });
      merges.push({ startColumn: 0, startRow: 0, endColumn: 6, endRow: 0 });
      [`Entry ${sessionTZ}`, 'Side / grade', 'Entry', 'Exit', 'Reason', 'Bars', 'Net R'].forEach((header, col) => {
        cells.push({ column: col, row: 1, text: header, bgColor: tableRowAlt, textColor: textMuted, textSize: 'tiny', textHAlign: 'center' });
      });
      if (shown === 0) {
        cells.push({ column: 0, row: 2, text: 'No closed model trades yet', bgColor: tableBg, textColor: textMuted, textSize: txtSize, textHAlign: 'center' });
        merges.push({ startColumn: 0, startRow: 2, endColumn: 6, endRow: 2 });
      } else {
        for (let j = 0; j <= shown - 1; j++) {
          const item = journal[j];
          const itemR = netR(item);
          const rb = j % 2 === 1 ? tableRowAlt : tableBg;
          const rc = gt(itemR, 0) ? bullText : lt(itemR, 0) ? bearText : textColor;
          [formatTime(item.entryTime, 'MM-dd HH:mm'), `${directionName(item.dir)} ${item.grade}`, price(item.entry), price(item.exitPrice),
            item.reason + (item.ambiguous ? ' [amb]' : ''), String(item.exitBar - item.entryBar), `${fmt(itemR)}R`].forEach((text, col) => {
            cells.push({
              column: col, row: j + 2, text, bgColor: rb, textColor: col === 6 ? rc : textColor, textSize: txtSize,
              textHAlign: col === 0 || col === 4 ? 'left' : 'right',
            });
          });
        }
      }
      tables.push({
        position: pos(cfg.journalPos), columns: 7, rows: shown + (shown === 0 ? 3 : 2), bgColor: tableBg, borderColor: tableBorder,
        borderWidth: 1, frameColor: tableBorder, frameWidth: 1, cells, merges,
      });
    }
    if (cfg.showWatermark) {
      watermark.cells.push({
        column: 0, row: 0, text: `WillyAlgoTrader · ${VERSION} · model, not broker fills`, textColor: wmColor, textSize: 'normal',
        textHAlign: 'center',
      });
      tables.unshift(watermark);
    }
  }

  setDrawingBar(null);

  // A time between two bars is drawn on the next bar; a time after the last bar is on the future bar slots: the bar of
  // that time on the trading calendar of the exchange, else slots of the chart timeframe
  const interval = tfSeconds * 1000;
  const drawnTime = (tm: number): number => {
    const lastTime = tMs(n - 1);
    if (tm > lastTime) {
      const slots = calendar ? barsUntil(bars[n - 1].time, fromMs(tm), calendar) : NaN;
      if (!Number.isNaN(slots) && interval > 0) return fromMs(lastTime + slots * interval);
      return fromMs(interval > 0 ? lastTime + Math.ceil((tm - lastTime) / interval) * interval : tm);
    }
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tMs(mid) >= tm) hi = mid;
      else lo = mid + 1;
    }
    return bars[lo].time;
  };
  const lines: LineDrawingData[] = levelLines.map((ln) => ({
    time1: drawnTime(ln.x1), price1: ln.y1, time2: drawnTime(ln.x2), price2: ln.y2, color: ln.color, style: ln.style,
  }));
  const labels: LabelData[] = label.all().map((ref) => labelData.get(ref)!).map((lb) => ({
    time: drawnTime(lb.time), price: lb.price, text: lb.text, color: lb.color, textColor: lb.textColor, style: lb.style, size: lb.size,
    ...(lb.tooltip !== undefined ? { tooltip: lb.tooltip } : {}),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    fills: [{ plot1: 'plot0', plot2: 'plot1', colors: fillColors }],
    bgColors,
    lines,
    labels,
    tables,
  };
}

export const PrecisionSniper = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
