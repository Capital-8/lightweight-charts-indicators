/**
 * ICT Validated SMC
 *
 * Smart money concepts with a validation and a confluence score:
 * - Swing pivots (Swing Length bars on each side) set the swing high / low levels; a bar that crosses an unbroken
 *   level (its high / low, or its close with "Require Body Close") is a BOS (in the trend) or a CHoCH (against it),
 *   drawn as a line from the pivot to the bar with a label at its middle. Each break makes an OTE zone (61.8 % to
 *   78.6 % retracement of the leg from the opposite swing level to the extreme of the breaking bar) with its fib
 *   lines and a label telling whether an order block / FVG sits inside. The internal pivots do the same (optional).
 * - Inducement levels: internal pivots against the swing trend; a wick through with a close back marks "IDM".
 * - Fair value gaps whose middle candle is at least "Min Displacement" x ATR(14), with the 50 % line; a close
 *   through a gap makes an inversion FVG (IFVG); a bullish and a bearish gap that overlap make a BPR zone.
 * - Order blocks at each swing pivot: the opposite candle of the pivot bar, with a liquidity sweep of an earlier
 *   swing and an FVG after it (both required by default), scored 0 to 8 (sweep, displacement, killzone, premium /
 *   discount side, higher-timeframe alignment); a close through an order block makes a breaker block.
 * - Equal highs / lows, liquidity sweeps, premium / discount zones and the previous day / week high and low on the
 *   last bar, killzone background, long / short signals (confluence score, cooldown) with stop loss and take profit
 *   levels, and an information panel.
 *
 * Higher timeframe: the swing structure of the "HTF Timeframe" bars built from the chart bars (the latest completed
 * bar, without lookahead). A timeframe below the chart timeframe (the default "240" on a daily chart) needs the bars
 * of that lower timeframe, which the chart bars do not have: the port throws an Error for it while "Enable HTF
 * Structure Check" is on.
 * Chart values from the optional third argument (src/chart-context.ts): the state of the last bar (breaks and
 * signals are only detected on closed bars), the symbol tick (stop loss / take profit prices in the panel), and the
 * exchange calendar of the higher-timeframe, day and week periods. The killzones use their own time zone input.
 *
 * Reference: "ICT Validated SMC v1.8" by GoodBadBitcoin
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Validated ICT / Smart Money Concepts Indicator v1.8
 */

import {
  ta, str, color, timeframe, time as pineTime, Series, line, box, label, resetDrawings, setDrawingBar, varDrawing,
  drawingOutputs, type Line, type Label, type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData, BoxData, LabelData, LineDrawingData, MarkerData, PineSize, TableCellData, TableData } from '../types';
import { barInterval } from '../bar-time';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import { lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';

type SizeName = 'tiny' | 'small' | 'normal' | 'large';
type KzTimezone = 'America/New_York' | 'Europe/London' | 'Europe/Berlin' | 'Asia/Tokyo' | 'Asia/Singapore' | 'Australia/Sydney' | 'UTC';

export interface IctAutoValidatedSmcInputs {
  swingLen: number;
  internalLen: number;
  showSwings: boolean;
  showStructure: boolean;
  showInternalStructure: boolean;
  requireBodyClose: boolean;
  useHTF: boolean;
  htfTimeframe: string;
  htfSwingLen: number;
  showHTFStructure: boolean;
  showOB: boolean;
  obMaxCount: number;
  requireSweep: boolean;
  requireDisplacement: boolean;
  showMitigated: boolean;
  showBreakers: boolean;
  brkMaxCount: number;
  brkBullColor: string;
  brkBearColor: string;
  showFVG: boolean;
  fvgMaxCount: number;
  fvgMinATRMult: number;
  showCE: boolean;
  showMitigatedFVG: boolean;
  showIFVG: boolean;
  ifvgColor: string;
  showBPR: boolean;
  bprColor: string;
  showLiquidity: boolean;
  showEQHL: boolean;
  eqTolerance: number;
  showSweeps: boolean;
  sweepRequireWickReject: boolean;
  showIDM: boolean;
  idmColor: string;
  idmMaxCount: number;
  showPD: boolean;
  showEQ: boolean;
  showSessionLevels: boolean;
  showPDHL: boolean;
  showPWHL: boolean;
  slPDColor: string;
  slPWColor: string;
  showKZ: boolean;
  kzTimezone: KzTimezone;
  kzAsianOn: boolean;
  kzAsianSess: string;
  kzLondonOn: boolean;
  kzLondonSess: string;
  kzNYAMOn: boolean;
  kzNYAMSess: string;
  kzNYPMOn: boolean;
  kzNYPMSess: string;
  kzTransparency: number;
  showOTE: boolean;
  oteFibHigh: number;
  oteFibLow: number;
  showOTEFibs: boolean;
  oteMaxCount: number;
  oteBullColor: string;
  oteBearColor: string;
  enableSignals: boolean;
  minSigScore: number;
  requireHTFAlign: boolean;
  requireKZActive: boolean;
  requireCISD: boolean;
  showSigSL: boolean;
  showSigTP: boolean;
  sigLongColor: string;
  sigShortColor: string;
  sigCooldown: number;
  showConfluence: boolean;
  minScore: number;
  bullColor: string;
  bearColor: string;
  fvgBullColor: string;
  fvgBearColor: string;
  obBullColor: string;
  obBearColor: string;
  sweepColor: string;
  showInfoPanel: boolean;
  chartLabelSize: SizeName;
  panelTextSize: SizeName;
}

export const defaultInputs: IctAutoValidatedSmcInputs = {
  swingLen: 10,
  internalLen: 5,
  showSwings: true,
  showStructure: true,
  showInternalStructure: false,
  requireBodyClose: false,
  useHTF: true,
  htfTimeframe: '240',
  htfSwingLen: 10,
  showHTFStructure: true,
  showOB: true,
  obMaxCount: 5,
  requireSweep: true,
  requireDisplacement: true,
  showMitigated: false,
  showBreakers: true,
  brkMaxCount: 5,
  brkBullColor: 'rgba(0, 230, 118, 0.25)',
  brkBearColor: 'rgba(255, 109, 0, 0.25)',
  showFVG: true,
  fvgMaxCount: 5,
  fvgMinATRMult: 1.0,
  showCE: true,
  showMitigatedFVG: false,
  showIFVG: true,
  ifvgColor: 'rgba(255, 214, 0, 0.2)',
  showBPR: true,
  bprColor: 'rgba(224, 64, 251, 0.25)',
  showLiquidity: true,
  showEQHL: true,
  eqTolerance: 0.15,
  showSweeps: true,
  sweepRequireWickReject: false,
  showIDM: true,
  idmColor: '#FF6D00',
  idmMaxCount: 5,
  showPD: true,
  showEQ: true,
  showSessionLevels: true,
  showPDHL: true,
  showPWHL: true,
  slPDColor: 'rgba(33, 150, 243, 0.7)',
  slPWColor: 'rgba(224, 64, 251, 0.7)',
  showKZ: true,
  kzTimezone: 'America/New_York',
  kzAsianOn: false,
  kzAsianSess: '2000-0000',
  kzLondonOn: true,
  kzLondonSess: '0200-0500',
  kzNYAMOn: true,
  kzNYAMSess: '0830-1100',
  kzNYPMOn: false,
  kzNYPMSess: '1300-1600',
  kzTransparency: 92,
  showOTE: true,
  oteFibHigh: 0.786,
  oteFibLow: 0.618,
  showOTEFibs: true,
  oteMaxCount: 3,
  oteBullColor: 'rgba(0, 188, 212, 0.2)',
  oteBearColor: 'rgba(224, 64, 251, 0.2)',
  enableSignals: true,
  minSigScore: 4,
  requireHTFAlign: true,
  requireKZActive: false,
  requireCISD: false,
  showSigSL: true,
  showSigTP: true,
  sigLongColor: '#00E676',
  sigShortColor: '#FF1744',
  sigCooldown: 10,
  showConfluence: true,
  minScore: 3,
  bullColor: '#00C853',
  bearColor: '#FF1744',
  fvgBullColor: 'rgba(0, 200, 83, 0.15)',
  fvgBearColor: 'rgba(255, 23, 68, 0.15)',
  obBullColor: 'rgba(33, 150, 243, 0.2)',
  obBearColor: 'rgba(255, 152, 0, 0.2)',
  sweepColor: '#FFD600',
  showInfoPanel: true,
  chartLabelSize: 'small',
  panelTextSize: 'small',
};

const G_STRUCT = 'Market Structure';
const G_HTF = 'Higher Timeframe Alignment';
const G_OB = 'Order Blocks';
const G_BRK = 'Breaker Blocks';
const G_FVG = 'Fair Value Gaps';
const G_BPR = 'Balanced Price Range';
const G_LIQ = 'Liquidity';
const G_IDM = 'Inducement (IDM)';
const G_PD = 'Premium / Discount';
const G_SL = 'Session Levels';
const G_KZ = 'Killzones & Time';
const G_OTE = 'Optimal Trade Entry (OTE)';
const G_SIG = 'Signal Generation';
const G_CONF = 'Confluence Scoring';
const G_VIZ = 'Colors & Display';
const SIZES: SizeName[] = ['tiny', 'small', 'normal', 'large'];

export const inputConfig: InputConfig[] = [
  { id: 'swingLen', type: 'int', title: 'Swing Length', defval: 10, min: 3, max: 50, group: G_STRUCT, tooltip: 'Bars to confirm swing highs/lows. Lower = more sensitive' },
  { id: 'internalLen', type: 'int', title: 'Internal Structure Length', defval: 5, min: 2, max: 30, group: G_STRUCT, tooltip: 'For internal BOS/CHoCH detection' },
  { id: 'showSwings', type: 'bool', title: 'Show Swing Points', defval: true, group: G_STRUCT },
  { id: 'showStructure', type: 'bool', title: 'Show BOS / CHoCH', defval: true, group: G_STRUCT },
  { id: 'showInternalStructure', type: 'bool', title: 'Show Internal Structure', defval: false, group: G_STRUCT },
  { id: 'requireBodyClose', type: 'bool', title: 'Require Body Close for BOS/CHoCH', defval: false, group: G_STRUCT, tooltip: 'When enabled, structure breaks are only confirmed when the candle body closes beyond the level, not just wicks through. More conservative but higher conviction' },
  { id: 'useHTF', type: 'bool', title: 'Enable HTF Structure Check', defval: true, group: G_HTF, tooltip: 'Check higher timeframe structure to validate setups' },
  { id: 'htfTimeframe', type: 'timeframe', title: 'HTF Timeframe', defval: '240', group: G_HTF, tooltip: 'Higher timeframe for structure alignment (e.g. 240 = 4H, D = Daily)' },
  { id: 'htfSwingLen', type: 'int', title: 'HTF Swing Length', defval: 10, min: 3, max: 50, group: G_HTF },
  { id: 'showHTFStructure', type: 'bool', title: 'Show HTF Structure on Chart', defval: true, group: G_HTF, tooltip: 'Draw HTF swing levels and structure direction' },
  { id: 'showOB', type: 'bool', title: 'Show Order Blocks', defval: true, group: G_OB },
  { id: 'obMaxCount', type: 'int', title: 'Max Visible OBs', defval: 5, min: 1, max: 20, group: G_OB },
  { id: 'requireSweep', type: 'bool', title: 'Require Liquidity Sweep', defval: true, group: G_OB, tooltip: 'Only show OBs preceded by a candle sweep — strict ICT validation' },
  { id: 'requireDisplacement', type: 'bool', title: 'Require Displacement (FVG)', defval: true, group: G_OB, tooltip: 'Only show OBs followed by an impulsive move leaving an FVG' },
  { id: 'showMitigated', type: 'bool', title: 'Show Mitigated OBs', defval: false, group: G_OB, tooltip: 'Keep showing OBs after price trades through them' },
  { id: 'showBreakers', type: 'bool', title: 'Show Breaker Blocks', defval: true, group: G_BRK, tooltip: "Failed OBs that flip direction — one of ICT's strongest levels" },
  { id: 'brkMaxCount', type: 'int', title: 'Max Visible Breakers', defval: 5, min: 1, max: 15, group: G_BRK },
  { id: 'brkBullColor', type: 'color', title: 'Bullish Breaker Fill', defval: defaultInputs.brkBullColor, group: G_BRK },
  { id: 'brkBearColor', type: 'color', title: 'Bearish Breaker Fill', defval: defaultInputs.brkBearColor, group: G_BRK },
  { id: 'showFVG', type: 'bool', title: 'Show FVGs', defval: true, group: G_FVG },
  { id: 'fvgMaxCount', type: 'int', title: 'Max Visible FVGs', defval: 5, min: 1, max: 20, group: G_FVG },
  { id: 'fvgMinATRMult', type: 'float', title: 'Min Displacement (ATR Multiple)', defval: 1.0, min: 0.1, max: 5.0, step: 0.1, group: G_FVG, tooltip: 'Middle candle must be at least this * ATR to qualify as displacement' },
  { id: 'showCE', type: 'bool', title: 'Show Consequent Encroachment (50%)', defval: true, group: G_FVG },
  { id: 'showMitigatedFVG', type: 'bool', title: 'Show Mitigated FVGs', defval: false, group: G_FVG },
  { id: 'showIFVG', type: 'bool', title: 'Show Inversion FVGs (IFVGs)', defval: true, group: G_FVG, tooltip: 'Mitigated FVGs that flip direction — act as support/resistance from the other side' },
  { id: 'ifvgColor', type: 'color', title: 'IFVG Fill Color', defval: defaultInputs.ifvgColor, group: G_FVG },
  { id: 'showBPR', type: 'bool', title: 'Show BPR Zones', defval: true, group: G_BPR, tooltip: 'Where a bullish FVG and bearish FVG overlap — rare but extremely strong level' },
  { id: 'bprColor', type: 'color', title: 'BPR Fill Color', defval: defaultInputs.bprColor, group: G_BPR },
  { id: 'showLiquidity', type: 'bool', title: 'Show Liquidity Levels', defval: true, group: G_LIQ },
  { id: 'showEQHL', type: 'bool', title: 'Show Equal Highs / Lows', defval: true, group: G_LIQ },
  { id: 'eqTolerance', type: 'float', title: 'EQH/EQL Tolerance (%)', defval: 0.15, min: 0.01, max: 1.0, step: 0.01, group: G_LIQ, tooltip: "How close swing points must be to count as 'equal'" },
  { id: 'showSweeps', type: 'bool', title: 'Show Liquidity Sweeps', defval: true, group: G_LIQ },
  { id: 'sweepRequireWickReject', type: 'bool', title: 'Require Wick Rejection Before Sweep', defval: false, group: G_LIQ, tooltip: 'Stricter sweep mode: only fires when the previous candle had a rejection wick (long wick, closed away from the extreme) and the current candle sweeps that rejection low/high. Reduces noise significantly' },
  { id: 'showIDM', type: 'bool', title: 'Show Inducement Levels', defval: true, group: G_IDM, tooltip: 'Marks internal swing points that get swept while the higher swing structure remains intact — traps traders into the wrong side before the real move' },
  { id: 'idmColor', type: 'color', title: 'IDM Marker Color', defval: '#FF6D00', group: G_IDM },
  { id: 'idmMaxCount', type: 'int', title: 'Max Visible IDMs', defval: 5, min: 1, max: 15, group: G_IDM },
  { id: 'showPD', type: 'bool', title: 'Show Premium/Discount Zones', defval: true, group: G_PD },
  { id: 'showEQ', type: 'bool', title: 'Show Equilibrium Line', defval: true, group: G_PD },
  { id: 'showSessionLevels', type: 'bool', title: 'Show Session Levels', defval: true, group: G_SL, tooltip: 'Draw previous day and week highs/lows — key institutional reference levels' },
  { id: 'showPDHL', type: 'bool', title: 'Previous Day High / Low', defval: true, group: G_SL },
  { id: 'showPWHL', type: 'bool', title: 'Previous Week High / Low', defval: true, group: G_SL },
  { id: 'slPDColor', type: 'color', title: 'Previous Day Color', defval: defaultInputs.slPDColor, group: G_SL },
  { id: 'slPWColor', type: 'color', title: 'Previous Week Color', defval: defaultInputs.slPWColor, group: G_SL },
  { id: 'showKZ', type: 'bool', title: 'Show Killzones', defval: true, group: G_KZ },
  {
    id: 'kzTimezone', type: 'string', title: 'Killzone Timezone', defval: 'America/New_York', group: G_KZ,
    options: ['America/New_York', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney', 'UTC'],
    tooltip: 'Timezone the killzone times below are interpreted in. Default = classic ICT EST times',
  },
  { id: 'kzAsianOn', type: 'bool', title: 'Asian KZ', defval: false, group: G_KZ, inline: 'kz1' },
  { id: 'kzAsianSess', type: 'session', title: '', defval: '2000-0000', group: G_KZ, inline: 'kz1' },
  { id: 'kzLondonOn', type: 'bool', title: 'London KZ', defval: true, group: G_KZ, inline: 'kz2' },
  { id: 'kzLondonSess', type: 'session', title: '', defval: '0200-0500', group: G_KZ, inline: 'kz2' },
  { id: 'kzNYAMOn', type: 'bool', title: 'NY AM KZ', defval: true, group: G_KZ, inline: 'kz3' },
  { id: 'kzNYAMSess', type: 'session', title: '', defval: '0830-1100', group: G_KZ, inline: 'kz3' },
  { id: 'kzNYPMOn', type: 'bool', title: 'NY PM KZ', defval: false, group: G_KZ, inline: 'kz4' },
  { id: 'kzNYPMSess', type: 'session', title: '', defval: '1300-1600', group: G_KZ, inline: 'kz4' },
  { id: 'kzTransparency', type: 'int', title: 'Killzone Transparency', defval: 92, min: 70, max: 98, group: G_KZ },
  { id: 'showOTE', type: 'bool', title: 'Show OTE Zones', defval: true, group: G_OTE, tooltip: 'Fibonacci 61.8%–78.6% retracement zone after displacement — the ideal entry area' },
  { id: 'oteFibHigh', type: 'float', title: 'Upper Fib Level', defval: 0.786, min: 0.5, max: 0.9, step: 0.01, group: G_OTE },
  { id: 'oteFibLow', type: 'float', title: 'Lower Fib Level', defval: 0.618, min: 0.4, max: 0.85, step: 0.01, group: G_OTE },
  { id: 'showOTEFibs', type: 'bool', title: 'Show 50% / 61.8% / 78.6% Lines', defval: true, group: G_OTE },
  { id: 'oteMaxCount', type: 'int', title: 'Max Visible OTE Zones', defval: 3, min: 1, max: 10, group: G_OTE },
  { id: 'oteBullColor', type: 'color', title: 'Bullish OTE Fill', defval: defaultInputs.oteBullColor, group: G_OTE },
  { id: 'oteBearColor', type: 'color', title: 'Bearish OTE Fill', defval: defaultInputs.oteBearColor, group: G_OTE },
  { id: 'enableSignals', type: 'bool', title: 'Enable Trade Signals', defval: true, group: G_SIG, tooltip: 'Show buy/sell arrows when validated confluence aligns' },
  { id: 'minSigScore', type: 'int', title: 'Min Confluence Score for Signal', defval: 4, min: 2, max: 8, group: G_SIG, tooltip: 'How many factors must align before a signal fires' },
  { id: 'requireHTFAlign', type: 'bool', title: 'Require HTF Alignment', defval: true, group: G_SIG, tooltip: 'Only signal in the direction of the higher timeframe' },
  { id: 'requireKZActive', type: 'bool', title: 'Require Active Killzone', defval: false, group: G_SIG, tooltip: 'Only signal during London/NY sessions' },
  { id: 'requireCISD', type: 'bool', title: 'Require CISD Confirmation', defval: false, group: G_SIG, tooltip: "Change in State of Delivery — only fires signal when the candle confirms a shift in delivery direction within the zone. Bullish: close above last down-candle's open. Bearish: close below last up-candle's open. More precise entries but fewer signals" },
  { id: 'showSigSL', type: 'bool', title: 'Show Stop Loss Level', defval: true, group: G_SIG },
  { id: 'showSigTP', type: 'bool', title: 'Show Take Profit Level', defval: true, group: G_SIG },
  { id: 'sigLongColor', type: 'color', title: 'Long Signal Color', defval: '#00E676', group: G_SIG },
  { id: 'sigShortColor', type: 'color', title: 'Short Signal Color', defval: '#FF1744', group: G_SIG },
  { id: 'sigCooldown', type: 'int', title: 'Signal Cooldown (bars)', defval: 10, min: 3, max: 50, group: G_SIG, tooltip: 'Minimum bars between signals of the same direction — prevents repeated signals while price sits in a zone' },
  { id: 'showConfluence', type: 'bool', title: 'Show Confluence Score', defval: true, group: G_CONF },
  { id: 'minScore', type: 'int', title: 'Minimum Score to Display Setup', defval: 3, min: 1, max: 7, group: G_CONF, tooltip: 'Setups below this score are hidden' },
  { id: 'bullColor', type: 'color', title: 'Bullish', defval: '#00C853', group: G_VIZ },
  { id: 'bearColor', type: 'color', title: 'Bearish', defval: '#FF1744', group: G_VIZ },
  { id: 'fvgBullColor', type: 'color', title: 'Bullish FVG Fill', defval: defaultInputs.fvgBullColor, group: G_VIZ },
  { id: 'fvgBearColor', type: 'color', title: 'Bearish FVG Fill', defval: defaultInputs.fvgBearColor, group: G_VIZ },
  { id: 'obBullColor', type: 'color', title: 'Bullish OB Fill', defval: defaultInputs.obBullColor, group: G_VIZ },
  { id: 'obBearColor', type: 'color', title: 'Bearish OB Fill', defval: defaultInputs.obBearColor, group: G_VIZ },
  { id: 'sweepColor', type: 'color', title: 'Sweep Markers', defval: '#FFD600', group: G_VIZ },
  { id: 'showInfoPanel', type: 'bool', title: 'Show Info Panel', defval: true, group: G_VIZ },
  { id: 'chartLabelSize', type: 'string', title: 'Chart Label Size', defval: 'small', options: SIZES, group: G_VIZ, tooltip: 'Size of BOS, CHoCH, OB, EQH/EQL labels on chart' },
  { id: 'panelTextSize', type: 'string', title: 'Info Panel Text Size', defval: 'small', options: SIZES, group: G_VIZ },
];

/** plotshape outputs only (markers) */
export const plotConfig: PlotConfig[] = [];

const VERSION = 'v1.8';

export const metadata = {
  title: 'ICT Validated SMC ' + VERSION,
  shortTitle: 'ICT-V',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => ge(b, a);
const na = (x: number) => Number.isNaN(x);
const nz = (x: number, y: number) => (Number.isNaN(x) ? y : x);

interface Swing { idx: number; price: number; isHigh: boolean }
interface StructureBreak { breakType: string; isBullish: boolean; ln?: Line; lbl?: Label }
interface OrderBlock {
  startIdx: number; top: number; bottom: number; isBullish: boolean; mitigated: boolean; score: number;
  bx?: Box; lbl?: Label;
}
interface BreakerBlock {
  createdIdx: number; top: number; bottom: number; isBullish: boolean; retested: boolean; mitigated: boolean;
  bx?: Box; lbl?: Label;
}
interface OTEZone {
  legHigh: number; legLow: number; zoneTop: number; zoneBottom: number; isBullish: boolean; triggered: boolean;
  invalidated: boolean; hasOBOverlap: boolean; hasFVGOverlap: boolean;
  bx?: Box; fib50Line?: Line; fibHighLine?: Line; fibLowLine?: Line; lbl?: Label;
}
interface FVG { idx: number; top: number; bottom: number; isBullish: boolean; mitigated: boolean; bx?: Box; ceLine?: Line }
interface IFVG { idx: number; top: number; bottom: number; isBullish: boolean; retested: boolean; mitigated: boolean; bx?: Box; lbl?: Label }
interface BPR { top: number; bottom: number; mitigated: boolean; bx?: Box; lbl?: Label }
interface Inducement {
  price: number; isBullish: boolean; triggered: boolean; triggerIdx: number; expired: boolean; ln?: Line; lbl?: Label;
}

// delete of an na object does nothing
const delLine = (l?: Line) => { if (l) line.delete(l); };
const delLabel = (l?: Label) => { if (l) label.delete(l); };
const delBox = (b?: Box) => { if (b) box.delete(b); };

/** Higher-timeframe structure on each chart bar: calcHTFStructure() through request.security(lookahead_off). */
interface HtfValues { bull: boolean[]; brk: string[]; high: number[]; low: number[] }

function htfStructure(bars: Bar[], cfg: IctAutoValidatedSmcInputs, chart?: ChartContext): HtfValues {
  const n = bars.length;
  const tf = cfg.htfTimeframe;
  const chartTf = chartTimeframe(bars, chart);
  const same = tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf);
  if (!same && timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`ICT Validated SMC: the HTF timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the chart `
      + 'bars do not have that data (switch "Enable HTF Structure Check" off or choose a higher timeframe)');
  }
  let htf: Bar[];
  let latest: number[];
  if (same) {
    htf = bars;
    latest = bars.map((_b, i) => i);
  } else {
    const s = higherTimeframeBars(bars, tf, chart);
    htf = s.htf;
    latest = s.latest;
  }
  const len = Math.trunc(cfg.htfSwingLen);
  const ph = ta.pivothigh(new Series(htf, (b) => b.high), len, len).toArray();
  const pl = ta.pivotlow(new Series(htf, (b) => b.low), len, len).toArray();
  const m = htf.length;
  const bullH: boolean[] = new Array(m);
  const brkH: string[] = new Array(m);
  const hiH: number[] = new Array(m);
  const loH: number[] = new Array(m);
  let prevH = NaN;
  let prevL = NaN;
  let hBroken = false;
  let lBroken = false;
  let bull = true;
  let lastBrk = '—';
  for (let j = 0; j < m; j++) {
    const b = htf[j];
    const pivH = ph[j] ?? NaN;
    const pivL = pl[j] ?? NaN;
    if (!na(pivH)) {
      prevH = pivH;
      hBroken = false;
    }
    if (!na(pivL)) {
      prevL = pivL;
      lBroken = false;
    }
    const srcH = cfg.requireBodyClose ? b.close : b.high;
    const srcL = cfg.requireBodyClose ? b.close : b.low;
    let brokeH = !na(prevH) && !hBroken && gt(srcH, prevH);
    let brokeL = !na(prevL) && !lBroken && lt(srcL, prevL);
    if (brokeH && brokeL) {
      if (ge(b.close, b.open)) brokeL = false;
      else brokeH = false;
    }
    if (brokeH) {
      lastBrk = bull ? 'BOS ▲' : 'CHoCH ▲';
      bull = true;
      hBroken = true;
    }
    if (brokeL) {
      lastBrk = bull ? 'CHoCH ▼' : 'BOS ▼';
      bull = false;
      lBroken = true;
    }
    bullH[j] = bull;
    brkH[j] = lastBrk;
    hiH[j] = prevH;
    loH[j] = prevL;
  }
  // without lookahead: the latest completed bar of the timeframe (also on an open last bar, as measured)
  const out: HtfValues = { bull: new Array(n), brk: new Array(n), high: new Array(n), low: new Array(n) };
  for (let i = 0; i < n; i++) {
    const k = latest[i];
    // na bool of request.security is false
    out.bull[i] = k >= 0 ? bullH[k] : false;
    out.brk[i] = k >= 0 ? brkH[k] : '';
    out.high[i] = k >= 0 ? hiH[k] : NaN;
    out.low[i] = k >= 0 ? loH[k] : NaN;
  }
  return out;
}

/**
 * request.security(syminfo.tickerid, tf, [high[1], low[1]], lookahead = barmerge.lookahead_on) on the last bar: the
 * high and low of the period before the period of the last bar.
 */
function previousPeriodHighLow(bars: Bar[], tf: string, chart?: ChartContext): [number, number] {
  const n = bars.length;
  const chartTf = chartTimeframe(bars, chart);
  if (chartTf !== '' && timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`ICT Validated SMC: the session level timeframe "${tf}" is lower than the chart timeframe "${chartTf}": `
      + 'the chart bars do not have that data (switch that session level off)');
  }
  if (chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) {
    // the chart timeframe: the chart bar before
    return n >= 2 ? [bars[n - 2].high, bars[n - 2].low] : [NaN, NaN];
  }
  const s = higherTimeframeBars(bars, tf, chart);
  const g = s.group[n - 1] - 1;
  return g >= 0 ? [s.htf[g].high, s.htf[g].low] : [NaN, NaN];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<IctAutoValidatedSmcInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels' | 'boxes' | 'tables' | 'markers' | 'bgColors'> & {
  lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[]; tables: TableData[]; markers: MarkerData[];
  bgColors: BgColorData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const ms = n > 0 && bars[0].time >= 1e12;
  const toMs = (t: number) => (ms ? t : t * 1000);
  const liveLast = !lastBarConfirmedOf(chart);
  const swingLen = Math.trunc(cfg.swingLen);
  const internalLen = Math.trunc(cfg.internalLen);
  const chartSize = cfg.chartLabelSize as PineSize;
  const panelSize = cfg.panelTextSize as PineSize;
  const { bullColor, bearColor, sweepColor, idmColor, sigLongColor, sigShortColor } = cfg;

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const open = bars.map((b) => b.open);

  const atrVal = ta.atr(bars, 14).toArray().map((v) => v ?? NaN);
  const S = (fn: (b: Bar) => number) => new Series(bars, fn);
  const swingHighArr = ta.pivothigh(S((b) => b.high), swingLen, swingLen).toArray();
  const swingLowArr = ta.pivotlow(S((b) => b.low), swingLen, swingLen).toArray();
  const internalHighArr = ta.pivothigh(S((b) => b.high), internalLen, internalLen).toArray();
  const internalLowArr = ta.pivotlow(S((b) => b.low), internalLen, internalLen).toArray();

  // request.security(syminfo.tickerid, htfTimeframe, calcHTFStructure()): only read when useHTF is on
  const htf = cfg.useHTF && n > 0 ? htfStructure(bars, cfg, chart) : null;

  // Killzones: time(timeframe.period, session, kzTimezone) of each bar
  const barMs = toMs(barInterval(bars));
  const tz = cfg.kzTimezone;
  const inSess = (t: number, sess: string) => pineTime.inSession(toMs(t), sess, tz, barMs);

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS, box: MAX_OBJECTS });

  const swingPivots: Swing[] = [];
  const internalPivots: Swing[] = [];
  const structureBreaks: StructureBreak[] = [];
  const internalBreaks: StructureBreak[] = [];
  let orderBlocks: OrderBlock[] = [];
  let fvgList: FVG[] = [];
  let breakerBlocks: BreakerBlock[] = [];
  let oteZones: OTEZone[] = [];
  let ifvgList: IFVG[] = [];
  let bprList: BPR[] = [];
  let idmList: Inducement[] = [];
  const eqLines: Line[] = [];
  const eqLabels: Label[] = [];

  let swingBullish = true;
  let lastSwingHigh = NaN;
  let lastSwingLow = NaN;
  let lastSwingHighIdx = NaN;
  let lastSwingLowIdx = NaN;
  let swingHighBroken = false;
  let swingLowBroken = false;
  let internalBullish = true;
  let lastInternalHigh = NaN;
  let lastInternalLow = NaN;
  let lastInternalHighIdx = NaN;
  let lastInternalLowIdx = NaN;
  let internalHighBroken = false;
  let internalLowBroken = false;

  let lastBearishOpen = NaN;
  let lastBullishOpen = NaN;
  let lastSigDirection = 'NONE';
  let lastSigScore = 0;
  let lastSigSL = NaN;
  let lastSigTP = NaN;
  let lastSigBar = NaN;
  let lastLongBar = NaN;
  let lastShortBar = NaN;

  const htfHighLine = varDrawing<Line>();
  const htfLowLine = varDrawing<Line>();
  const htfHighLabel = varDrawing<Label>();
  const htfLowLabel = varDrawing<Label>();
  const pdPremiumBox = varDrawing<Box>();
  const pdDiscountBox = varDrawing<Box>();
  const pdEQLine = varDrawing<Line>();
  const pdEQLabel = varDrawing<Label>();
  const slPDHLine = varDrawing<Line>();
  const slPDLLine = varDrawing<Line>();
  const slPWHLine = varDrawing<Line>();
  const slPWLLine = varDrawing<Line>();
  const slPDHLabel = varDrawing<Label>();
  const slPDLLabel = varDrawing<Label>();
  const slPWHLabel = varDrawing<Label>();
  const slPWLLabel = varDrawing<Label>();

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const kzBg = String(color.new(color.blue, cfg.kzTransparency));
  const STAR = (s: number) => (s >= 5 ? '★★★★★' : s >= 4 ? '★★★★' : s >= 3 ? '★★★' : s >= 2 ? '★★' : '★');
  const starCountOf = (score: number) => (score >= 7 ? 5 : score >= 5 ? 4 : score >= 4 ? 3 : score >= 3 ? 2 : 1);
  // Pine v6 box text colour (no text is drawn)
  const newBox = (l: number, t: number, r: number, b: number, border: string, width: number,
    style: 'solid' | 'dashed', bg: string) => box.new(l, t, r, b, border, width, style, 'none', 'bar_index', bg, '', 'auto', '#FFFFFF');

  // final-bar values for the panel
  let currentlyInKZ = false;
  let inAsianKZ = false;
  let inLondonKZ = false;
  let inNYAMKZ = false;
  let inNYPMKZ = false;
  let bullishCISD = false;
  let bearishCISD = false;
  let htfStructureBullish = false;

  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const confirmed = !isLast || !liveLast;
    setDrawingBar(i, isLast);
    const t = bars[i].time;

    htfStructureBullish = cfg.useHTF ? htf!.bull[i] : swingBullish;
    const htfAligned = (setupBullish: boolean) => !cfg.useHTF || (setupBullish && htfStructureBullish)
      || (!setupBullish && !htfStructureBullish);

    // HTF levels on the last bar
    if (cfg.useHTF && cfg.showHTFStructure && isLast && !na(htf!.high[i]) && !na(htf!.low[i])) {
      const hH = htf!.high[i];
      const hL = htf!.low[i];
      delLine(htfHighLine.value);
      delLine(htfLowLine.value);
      delLabel(htfHighLabel.value);
      delLabel(htfLowLabel.value);
      htfHighLine.value = line.new(i - 60, hH, i + 10, hH, 'bar_index', 'none', color.new(bearColor, 40), 'dashed', 2);
      htfHighLabel.value = label.new(i + 10, hH, 'HTF High', 'bar_index', 'price', color.new(bearColor, 85),
        'label_left', bearColor, chartSize);
      htfLowLine.value = line.new(i - 60, hL, i + 10, hL, 'bar_index', 'none', color.new(bullColor, 40), 'dashed', 2);
      htfLowLabel.value = label.new(i + 10, hL, 'HTF Low', 'bar_index', 'price', color.new(bullColor, 85),
        'label_left', bullColor, chartSize);
    }

    inAsianKZ = cfg.kzAsianOn && inSess(t, cfg.kzAsianSess);
    inLondonKZ = cfg.kzLondonOn && inSess(t, cfg.kzLondonSess);
    inNYAMKZ = cfg.kzNYAMOn && inSess(t, cfg.kzNYAMSess);
    inNYPMKZ = cfg.kzNYPMOn && inSess(t, cfg.kzNYPMSess);
    const isInKillzone = inAsianKZ || inLondonKZ || inNYAMKZ || inNYPMKZ;

    // ---- swing detection
    const swingHighVal = swingHighArr[i] ?? NaN;
    const swingLowVal = swingLowArr[i] ?? NaN;
    const internalHighVal = internalHighArr[i] ?? NaN;
    const internalLowVal = internalLowArr[i] ?? NaN;
    if (!na(swingHighVal)) {
      swingPivots.push({ idx: i - swingLen, price: swingHighVal, isHigh: true });
      lastSwingHigh = swingHighVal;
      lastSwingHighIdx = i - swingLen;
      swingHighBroken = false;
      if (cfg.showSwings) {
        label.new(i - swingLen, swingHighVal, '▼', 'bar_index', 'price', color.new(bearColor, 80), 'label_down',
          color.new(bearColor, 30), 'tiny');
      }
    }
    if (!na(swingLowVal)) {
      swingPivots.push({ idx: i - swingLen, price: swingLowVal, isHigh: false });
      lastSwingLow = swingLowVal;
      lastSwingLowIdx = i - swingLen;
      swingLowBroken = false;
      if (cfg.showSwings) {
        label.new(i - swingLen, swingLowVal, '▲', 'bar_index', 'price', color.new(bullColor, 80), 'label_up',
          color.new(bullColor, 30), 'tiny');
      }
    }
    if (!na(internalHighVal)) {
      internalPivots.push({ idx: i - internalLen, price: internalHighVal, isHigh: true });
      lastInternalHigh = internalHighVal;
      lastInternalHighIdx = i - internalLen;
      internalHighBroken = false;
    }
    if (!na(internalLowVal)) {
      internalPivots.push({ idx: i - internalLen, price: internalLowVal, isHigh: false });
      lastInternalLow = internalLowVal;
      lastInternalLowIdx = i - internalLen;
      internalLowBroken = false;
    }
    while (swingPivots.length > 100) swingPivots.shift();
    while (internalPivots.length > 80) internalPivots.shift();

    // ---- market structure: real-time BOS / CHoCH
    let sBrkType = 'none';
    let sBrkBull = false;
    let sBrkPrice = NaN;
    let sBrkIdx = NaN;
    let sBrokenLevelIdx = NaN;
    if (confirmed) {
      const srcHigh = cfg.requireBodyClose ? close[i] : high[i];
      const srcLow = cfg.requireBodyClose ? close[i] : low[i];
      let brokeHigh = !na(lastSwingHigh) && !swingHighBroken && gt(srcHigh, lastSwingHigh);
      let brokeLow = !na(lastSwingLow) && !swingLowBroken && lt(srcLow, lastSwingLow);
      if (brokeHigh && brokeLow) {
        if (ge(close[i], open[i])) brokeLow = false;
        else brokeHigh = false;
      }
      if (brokeHigh) {
        sBrkType = swingBullish ? 'BOS' : 'CHoCH';
        sBrkBull = true;
        sBrkPrice = lastSwingHigh;
        sBrkIdx = i;
        sBrokenLevelIdx = lastSwingHighIdx;
        swingBullish = true;
        swingHighBroken = true;
      }
      if (brokeLow) {
        sBrkType = swingBullish ? 'CHoCH' : 'BOS';
        sBrkBull = false;
        sBrkPrice = lastSwingLow;
        sBrkIdx = i;
        sBrokenLevelIdx = lastSwingLowIdx;
        swingBullish = false;
        swingLowBroken = true;
      }
    }

    if (sBrkType !== 'none') {
      let structLine: Line | undefined;
      let structLabel: Label | undefined;
      const lineStartIdx = nz(sBrokenLevelIdx, sBrkIdx > 10 ? sBrkIdx - 10 : 0);
      if (cfg.showStructure) {
        const col = sBrkBull ? bullColor : bearColor;
        structLine = line.new(lineStartIdx, sBrkPrice, sBrkIdx, sBrkPrice, 'bar_index', 'none', col,
          sBrkType === 'CHoCH' ? 'dashed' : 'solid', 1);
        const labelIdx = Math.trunc((lineStartIdx + sBrkIdx) / 2);
        structLabel = label.new(labelIdx, sBrkPrice, sBrkType, 'bar_index', 'price', color.new(col, 90), 'label_center',
          col, chartSize);
      }
      structureBreaks.push({ breakType: sBrkType, isBullish: sBrkBull, ln: structLine, lbl: structLabel });
      while (structureBreaks.length > 50) {
        const oldest = structureBreaks.shift()!;
        delLine(oldest.ln);
        delLabel(oldest.lbl);
      }

      // OTE zone of the displacement leg
      const legH = sBrkBull ? high[i] : lastSwingHigh;
      const legL = sBrkBull ? lastSwingLow : low[i];
      if (!na(legH) && !na(legL) && gt(legH, legL)) {
        const legRange = legH - legL;
        const bull = sBrkBull;
        const zTop = bull ? legH - legRange * cfg.oteFibLow : legL + legRange * cfg.oteFibHigh;
        const zBot = bull ? legH - legRange * cfg.oteFibHigh : legL + legRange * cfg.oteFibLow;
        const f50 = bull ? legH - legRange * 0.5 : legL + legRange * 0.5;
        let obOverlap = false;
        if (orderBlocks.length > 0) {
          for (let j = orderBlocks.length - 1; j >= Math.max(orderBlocks.length - 10, 0); j--) {
            const ob = orderBlocks[j];
            if (!ob.mitigated && ob.isBullish === bull && ge(ob.top, zBot) && le(ob.bottom, zTop)) {
              obOverlap = true;
              break;
            }
          }
        }
        let fvgOverlap = false;
        if (fvgList.length > 0) {
          for (let j = fvgList.length - 1; j >= Math.max(fvgList.length - 10, 0); j--) {
            const f = fvgList[j];
            if (!f.mitigated && f.isBullish === bull && ge(f.top, zBot) && le(f.bottom, zTop)) {
              fvgOverlap = true;
              break;
            }
          }
        }
        const oteLabel = obOverlap && fvgOverlap ? 'OTE + OB + FVG' : obOverlap ? 'OTE + OB' : fvgOverlap ? 'OTE + FVG' : 'OTE';
        const base = bull ? '#00BCD4' : '#E040FB';
        const zone: OTEZone = {
          legHigh: legH, legLow: legL, zoneTop: zTop, zoneBottom: zBot, isBullish: bull, triggered: false,
          invalidated: false, hasOBOverlap: obOverlap, hasFVGOverlap: fvgOverlap,
        };
        if (cfg.showOTE) {
          zone.bx = newBox(sBrkIdx, zTop, i + 15, zBot, color.new(base, 40), 1, 'dashed',
            bull ? cfg.oteBullColor : cfg.oteBearColor);
          if (cfg.showOTEFibs) {
            zone.fib50Line = line.new(sBrkIdx, f50, i + 15, f50, 'bar_index', 'none', color.new(base, 50), 'dotted', 1);
            // bullish: the 78.6 % line is the zone bottom; bearish: the zone top
            const fHigh = bull ? zBot : zTop;
            const fLow = bull ? zTop : zBot;
            zone.fibHighLine = line.new(sBrkIdx, fHigh, i + 15, fHigh, 'bar_index', 'none', color.new(base, 60), 'dotted', 1);
            zone.fibLowLine = line.new(sBrkIdx, fLow, i + 15, fLow, 'bar_index', 'none', color.new(base, 60), 'dotted', 1);
          }
          zone.lbl = label.new(i + 15, bull ? zTop : zBot, oteLabel, 'bar_index', 'price', color.new(base, 85),
            'label_left', color.new(base, 0), chartSize);
        }
        oteZones.push(zone);
      }
    }

    // ---- internal structure
    if (cfg.showInternalStructure && confirmed) {
      const iSrcHigh = cfg.requireBodyClose ? close[i] : high[i];
      const iSrcLow = cfg.requireBodyClose ? close[i] : low[i];
      let iBrokeHigh = !na(lastInternalHigh) && !internalHighBroken && gt(iSrcHigh, lastInternalHigh);
      let iBrokeLow = !na(lastInternalLow) && !internalLowBroken && lt(iSrcLow, lastInternalLow);
      if (iBrokeHigh && iBrokeLow) {
        if (ge(close[i], open[i])) iBrokeLow = false;
        else iBrokeHigh = false;
      }
      let iBrkType = 'none';
      let iBrkBull = false;
      let iBrkPrice = NaN;
      const iBrkIdx = i;
      let iBrokenIdx = NaN;
      if (iBrokeHigh) {
        iBrkType = internalBullish ? 'BOS' : 'CHoCH';
        iBrkBull = true;
        iBrkPrice = lastInternalHigh;
        iBrokenIdx = lastInternalHighIdx;
        internalBullish = true;
        internalHighBroken = true;
      }
      if (iBrokeLow) {
        iBrkType = internalBullish ? 'CHoCH' : 'BOS';
        iBrkBull = false;
        iBrkPrice = lastInternalLow;
        iBrokenIdx = lastInternalLowIdx;
        internalBullish = false;
        internalLowBroken = true;
      }
      if (iBrkType !== 'none') {
        const iLineCol = iBrkBull ? color.new(bullColor, 50) : color.new(bearColor, 50);
        const iLineStart = nz(iBrokenIdx, iBrkIdx > 5 ? iBrkIdx - 5 : 0);
        const iLine = line.new(iLineStart, iBrkPrice, iBrkIdx, iBrkPrice, 'bar_index', 'none', iLineCol, 'dotted', 1);
        const iLabelIdx = Math.trunc((iLineStart + iBrkIdx) / 2);
        const iLbl = label.new(iLabelIdx, iBrkPrice, iBrkType, 'bar_index', 'price', color.new(iLineCol, 90), 'label_center',
          iLineCol, chartSize);
        internalBreaks.push({ breakType: iBrkType, isBullish: iBrkBull, ln: iLine, lbl: iLbl });
        while (internalBreaks.length > 30) {
          const oldest = internalBreaks.shift()!;
          delLine(oldest.ln);
          delLabel(oldest.lbl);
        }
      }
    }

    // ---- inducement (IDM)
    if (cfg.showIDM) {
      if (!na(internalLowVal) && swingBullish) {
        const idmPrice = internalLowVal;
        const idmIdx = i - internalLen;
        const tooClose = !na(lastSwingLow) && lt(Math.abs(idmPrice - lastSwingLow) / idmPrice * 100, 0.1);
        if (!tooClose) {
          const ln = line.new(idmIdx, idmPrice, i + 10, idmPrice, 'bar_index', 'none', color.new(idmColor, 50), 'dotted', 1);
          const lbl = label.new(idmIdx, idmPrice, 'IDM', 'bar_index', 'price', color.new(idmColor, 85), 'label_up',
            idmColor, chartSize);
          idmList.push({ price: idmPrice, isBullish: true, triggered: false, triggerIdx: NaN, expired: false, ln, lbl });
        }
      }
      if (!na(internalHighVal) && !swingBullish) {
        const idmPrice = internalHighVal;
        const idmIdx = i - internalLen;
        const tooClose = !na(lastSwingHigh) && lt(Math.abs(idmPrice - lastSwingHigh) / idmPrice * 100, 0.1);
        if (!tooClose) {
          const ln = line.new(idmIdx, idmPrice, i + 10, idmPrice, 'bar_index', 'none', color.new(idmColor, 50), 'dotted', 1);
          const lbl = label.new(idmIdx, idmPrice, 'IDM', 'bar_index', 'price', color.new(idmColor, 85), 'label_down',
            idmColor, chartSize);
          idmList.push({ price: idmPrice, isBullish: false, triggered: false, triggerIdx: NaN, expired: false, ln, lbl });
        }
      }
    }
    if (cfg.showIDM && idmList.length > 0) {
      for (let k = idmList.length - 1; k >= 0; k--) {
        const idm = idmList[k];
        if (!idm.expired && !idm.triggered) {
          if ((idm.isBullish && !swingBullish) || (!idm.isBullish && swingBullish)) {
            idm.expired = true;
            delLine(idm.ln);
            delLabel(idm.lbl);
          } else if (idm.isBullish ? lt(low[i], idm.price) && gt(close[i], idm.price)
            : gt(high[i], idm.price) && lt(close[i], idm.price)) {
            idm.triggered = true;
            idm.triggerIdx = i;
            delLabel(idm.lbl);
            idm.lbl = label.new(i, idm.isBullish ? low[i] : high[i], 'IDM ⚡', 'bar_index', 'price', color.new(idmColor, 70),
              idm.isBullish ? 'label_up' : 'label_down', idmColor, chartSize);
            if (idm.ln) {
              line.set_x2(idm.ln, i);
              line.set_style(idm.ln, 'solid');
              line.set_color(idm.ln, color.new(idmColor, 30));
            }
          }
        }
        if (idm.triggered && !idm.expired && i - idm.triggerIdx > 20) {
          idm.expired = true;
          delLine(idm.ln);
          delLabel(idm.lbl);
        }
        if (idm.expired) idmList.splice(k, 1);
      }
      while (idmList.length > cfg.idmMaxCount * 2) {
        const oldest = idmList.shift()!;
        delLine(oldest.ln);
        delLabel(oldest.lbl);
      }
    }

    // ---- fair value gaps with the displacement filter
    const midCandleSize = i >= 1 ? Math.abs(close[i - 1] - open[i - 1]) : NaN;
    const isDisplacement = i >= 1 && ge(midCandleSize, atrVal[i - 1] * cfg.fvgMinATRMult);
    if (i >= 2 && lt(high[i - 2], low[i]) && isDisplacement && gt(close[i - 1], open[i - 1])) {
      const top = low[i];
      const bot = high[i - 2];
      const f: FVG = { idx: i - 1, top, bottom: bot, isBullish: true, mitigated: false };
      if (cfg.showFVG) {
        f.bx = newBox(i - 2, top, i + 8, bot, bullColor, 1, 'solid', cfg.fvgBullColor);
        if (cfg.showCE) {
          const ce = (top + bot) / 2;
          f.ceLine = line.new(i - 2, ce, i + 8, ce, 'bar_index', 'none', color.new(bullColor, 60), 'dotted', 1);
        }
      }
      fvgList.push(f);
    }
    if (i >= 2 && gt(low[i - 2], high[i]) && isDisplacement && lt(close[i - 1], open[i - 1])) {
      const top = low[i - 2];
      const bot = high[i];
      const f: FVG = { idx: i - 1, top, bottom: bot, isBullish: false, mitigated: false };
      if (cfg.showFVG) {
        f.bx = newBox(i - 2, top, i + 8, bot, bearColor, 1, 'solid', cfg.fvgBearColor);
        if (cfg.showCE) {
          const ce = (top + bot) / 2;
          f.ceLine = line.new(i - 2, ce, i + 8, ce, 'bar_index', 'none', color.new(bearColor, 60), 'dotted', 1);
        }
      }
      fvgList.push(f);
    }

    // FVG mitigation and IFVGs
    if (fvgList.length > 0) {
      for (let k = fvgList.length - 1; k >= 0; k--) {
        const f = fvgList[k];
        if (f.mitigated) continue;
        const bullMit = f.isBullish && lt(close[i], f.bottom);
        const bearMit = !f.isBullish && gt(close[i], f.top);
        if (!bullMit && !bearMit) continue;
        f.mitigated = true;
        if (!cfg.showMitigatedFVG) {
          delBox(f.bx);
          delLine(f.ceLine);
        } else if (f.bx) {
          box.set_bgcolor(f.bx, color.new(color.gray, 92));
        }
        if (cfg.showIFVG) {
          const iv: IFVG = { idx: i, top: f.top, bottom: f.bottom, isBullish: bearMit, retested: false, mitigated: false };
          iv.bx = newBox(i, f.top, i + 15, f.bottom, color.new('#FFD600', 40), 1, 'dashed', cfg.ifvgColor);
          iv.lbl = bullMit
            ? label.new(i, f.top, 'IFVG ▼', 'bar_index', 'price', color.new('#FFD600', 85), 'label_down', color.new('#FFD600', 0), chartSize)
            : label.new(i, f.bottom, 'IFVG ▲', 'bar_index', 'price', color.new('#FFD600', 85), 'label_up', color.new('#FFD600', 0), chartSize);
          ifvgList.push(iv);
        }
      }
      while (fvgList.length > cfg.fvgMaxCount * 3) {
        const oldest = fvgList.shift()!;
        delBox(oldest.bx);
        delLine(oldest.ceLine);
      }
    }

    // IFVG management
    if (ifvgList.length > 0) {
      for (let k = ifvgList.length - 1; k >= 0; k--) {
        const iv = ifvgList[k];
        if (iv.mitigated) continue;
        const priceInZone = ge(high[i], iv.bottom) && le(low[i], iv.top);
        if (priceInZone && !iv.retested && i > iv.idx) {
          iv.retested = true;
          if (iv.bx) box.set_border_width(iv.bx, 2);
        } else if (iv.retested) {
          if ((iv.isBullish && lt(close[i], iv.bottom)) || (!iv.isBullish && gt(close[i], iv.top))) {
            iv.mitigated = true;
            delBox(iv.bx);
            delLabel(iv.lbl);
          }
        }
      }
      while (ifvgList.length > cfg.fvgMaxCount * 2) {
        const oldest = ifvgList.shift()!;
        delBox(oldest.bx);
        delLabel(oldest.lbl);
      }
    }

    // ---- balanced price range
    if (cfg.showBPR && fvgList.length >= 2) {
      for (let a = fvgList.length - 1; a >= Math.max(fvgList.length - 8, 1); a--) {
        const f1 = fvgList[a];
        if (f1.mitigated) continue;
        for (let b = a - 1; b >= Math.max(a - 6, 0); b--) {
          const f2 = fvgList[b];
          if (!f2.mitigated && f1.isBullish !== f2.isBullish) {
            const overlapTop = Math.min(f1.top, f2.top);
            const overlapBot = Math.max(f1.bottom, f2.bottom);
            if (gt(overlapTop, overlapBot)) {
              let alreadyExists = false;
              if (bprList.length > 0) {
                for (let k = bprList.length - 1; k >= Math.max(bprList.length - 5, 0); k--) {
                  const e = bprList[k];
                  if (lt(Math.abs(e.top - overlapTop), 1) && lt(Math.abs(e.bottom - overlapBot), 1)) {
                    alreadyExists = true;
                    break;
                  }
                }
              }
              if (!alreadyExists) {
                const bprIdx = Math.max(f1.idx, f2.idx);
                const bp: BPR = { top: overlapTop, bottom: overlapBot, mitigated: false };
                bp.bx = newBox(bprIdx, overlapTop, i + 15, overlapBot, color.new('#E040FB', 30), 2, 'solid', cfg.bprColor);
                bp.lbl = label.new(bprIdx, overlapTop, 'BPR ◆', 'bar_index', 'price', color.new('#E040FB', 80), 'label_down',
                  color.new('#E040FB', 0), chartSize);
                bprList.push(bp);
              }
            }
            break;
          }
        }
      }
    }
    if (bprList.length > 0) {
      for (let k = bprList.length - 1; k >= 0; k--) {
        const bp = bprList[k];
        if (bp.mitigated) continue;
        const h = bp.top - bp.bottom;
        if (gt(close[i], bp.top + h) || lt(close[i], bp.bottom - h)) {
          bp.mitigated = true;
          delBox(bp.bx);
          delLabel(bp.lbl);
        }
      }
      while (bprList.length > 5) {
        const oldest = bprList.shift()!;
        delBox(oldest.bx);
        delLabel(oldest.lbl);
      }
    }

    // ---- order blocks with validation
    if (swingPivots.length >= 2) {
      const sz = swingPivots.length;
      for (let k = sz - 2; k <= sz - 1; k++) {
        const latestPivot = swingPivots[k];
        if (latestPivot.idx !== i - swingLen) continue;
        const bull = !latestPivot.isHigh;
        const obBar = latestPivot.idx;
        const off = i - obBar;
        if (!(off > 0 && off < 500)) continue;
        const obHigh = high[i - off];
        const obLow = low[i - off];
        const oppositeCandle = bull ? lt(close[i - off], open[i - off]) : gt(close[i - off], open[i - off]);
        let hasSweep = false;
        for (let j = swingPivots.length - 1; j >= Math.max(0, swingPivots.length - 10); j--) {
          const sp = swingPivots[j];
          if (sp.isHigh !== bull && sp.idx < obBar && (bull ? lt(obLow, sp.price) : gt(obHigh, sp.price))) {
            hasSweep = true;
            break;
          }
        }
        let hasDisp = false;
        if (off >= 3) {
          for (let j = 0; j <= Math.min(off - 2, 5); j++) {
            // bullish: low[off - j - 2] > high[off - j]; bearish: high[off - j - 2] < low[off - j]
            const newer = i - (off - j - 2);
            const older = i - (off - j);
            if (bull ? gt(low[newer], high[older]) : lt(high[newer], low[older])) {
              hasDisp = true;
              break;
            }
          }
        }
        const inKZ = isInKillzone;
        let inCorrectZone = true;
        if (!na(lastSwingHigh) && !na(lastSwingLow)) {
          const eq = (lastSwingHigh + lastSwingLow) / 2;
          inCorrectZone = bull ? lt(obLow, eq) : gt(obHigh, eq);
        }
        const sweepOK = !cfg.requireSweep || hasSweep;
        const dispOK = !cfg.requireDisplacement || hasDisp;
        if (!(oppositeCandle && sweepOK && dispOK)) continue;
        let score = 0;
        if (hasSweep) score += 2;
        if (hasDisp) score += 2;
        if (inKZ) score += 1;
        if (inCorrectZone) score += 1;
        if (htfAligned(bull)) score += 2;
        if (score < cfg.minScore) continue;
        const ob: OrderBlock = { startIdx: obBar, top: obHigh, bottom: obLow, isBullish: bull, mitigated: false, score };
        if (cfg.showOB) {
          const col = bull ? bullColor : bearColor;
          ob.bx = newBox(obBar, obHigh, i + 5, obLow, col, 1, 'solid', bull ? cfg.obBullColor : cfg.obBearColor);
          ob.lbl = label.new(obBar, bull ? obLow : obHigh, 'OB ' + STAR(starCountOf(score)), 'bar_index', 'price',
            color.new(col, 80), bull ? 'label_up' : 'label_down', col, chartSize);
        }
        orderBlocks.push(ob);
      }
    }

    // OB mitigation -> breaker blocks
    if (orderBlocks.length > 0) {
      for (let k = orderBlocks.length - 1; k >= 0; k--) {
        const ob = orderBlocks[k];
        if (ob.mitigated) continue;
        const bullMit = ob.isBullish && lt(close[i], ob.bottom);
        const bearMit = !ob.isBullish && gt(close[i], ob.top);
        if (!bullMit && !bearMit) continue;
        ob.mitigated = true;
        if (!cfg.showMitigated) {
          delBox(ob.bx);
          delLabel(ob.lbl);
        } else if (ob.bx) {
          box.set_bgcolor(ob.bx, color.new(color.gray, 92));
        }
        // a failed bullish OB is a bearish breaker and the reverse
        const brk: BreakerBlock = {
          createdIdx: i, top: ob.top, bottom: ob.bottom, isBullish: bearMit, retested: false, mitigated: false,
        };
        if (cfg.showBreakers) {
          const base = bullMit ? '#FF6D00' : '#00E676';
          brk.bx = newBox(i, ob.top, i + 20, ob.bottom, color.new(base, 40), 2, 'dashed',
            bullMit ? cfg.brkBearColor : cfg.brkBullColor);
          brk.lbl = bullMit
            ? label.new(i, ob.top, 'BRK ▼', 'bar_index', 'price', color.new(base, 80), 'label_down', color.new(base, 0), chartSize)
            : label.new(i, ob.bottom, 'BRK ▲', 'bar_index', 'price', color.new(base, 80), 'label_up', color.new(base, 0), chartSize);
        }
        breakerBlocks.push(brk);
      }
      while (orderBlocks.length > cfg.obMaxCount * 3) {
        const oldest = orderBlocks.shift()!;
        delBox(oldest.bx);
        delLabel(oldest.lbl);
      }
    }

    // breaker management
    if (breakerBlocks.length > 0) {
      for (let k = breakerBlocks.length - 1; k >= 0; k--) {
        const brk = breakerBlocks[k];
        if (brk.mitigated) continue;
        const priceInZone = ge(high[i], brk.bottom) && le(low[i], brk.top);
        if (priceInZone && !brk.retested && i > brk.createdIdx) {
          brk.retested = true;
          if (brk.bx) box.set_border_width(brk.bx, 3);
        } else if (brk.retested) {
          if ((brk.isBullish && lt(close[i], brk.bottom)) || (!brk.isBullish && gt(close[i], brk.top))) {
            brk.mitigated = true;
            delBox(brk.bx);
            delLabel(brk.lbl);
          }
        }
      }
      while (breakerBlocks.length > cfg.brkMaxCount * 2) {
        const oldest = breakerBlocks.shift()!;
        delBox(oldest.bx);
        delLabel(oldest.lbl);
      }
    }

    // OTE zone management
    if (oteZones.length > 0) {
      for (let k = oteZones.length - 1; k >= 0; k--) {
        const ote = oteZones[k];
        if (ote.invalidated) continue;
        const entered = ote.isBullish
          ? le(low[i], ote.zoneTop) && gt(close[i], ote.zoneBottom)
          : ge(high[i], ote.zoneBottom) && lt(close[i], ote.zoneTop);
        if (entered && !ote.triggered) {
          ote.triggered = true;
          if (ote.bx) box.set_border_width(ote.bx, 2);
        }
        if (ote.isBullish ? lt(close[i], ote.legLow) : gt(close[i], ote.legHigh)) {
          ote.invalidated = true;
          delBox(ote.bx);
          delLine(ote.fib50Line);
          delLine(ote.fibHighLine);
          delLine(ote.fibLowLine);
          delLabel(ote.lbl);
        }
      }
      while (oteZones.length > cfg.oteMaxCount * 2) {
        const oldest = oteZones.shift()!;
        delBox(oldest.bx);
        delLine(oldest.fib50Line);
        delLine(oldest.fibHighLine);
        delLine(oldest.fibLowLine);
        delLabel(oldest.lbl);
      }
    }

    // ---- equal highs / lows
    if (cfg.showLiquidity && cfg.showEQHL && swingPivots.length >= 4) {
      const sz = swingPivots.length;
      for (let a = sz - 1; a >= Math.max(sz - 8, 1); a--) {
        const s1 = swingPivots[a];
        for (let b = a - 1; b >= Math.max(a - 6, 0); b--) {
          const s2 = swingPivots[b];
          if (s2.isHigh === s1.isHigh && s1.idx !== s2.idx) {
            const pctDiff = Math.abs(s1.price - s2.price) / s1.price * 100;
            if (le(pctDiff, cfg.eqTolerance)) {
              if (s1.idx === i - swingLen) {
                eqLines.push(line.new(s2.idx, s2.price, i + 10, s2.price, 'bar_index', 'none', color.new(sweepColor, 40),
                  'dotted', 1));
                eqLabels.push(label.new(i + 10, s2.price, s1.isHigh ? 'EQH' : 'EQL', 'bar_index', 'price',
                  color.new(sweepColor, 85), 'label_left', sweepColor, chartSize));
              }
              break;
            }
          }
        }
      }
      while (eqLines.length > 20) line.delete(eqLines.shift()!);
      while (eqLabels.length > 20) label.delete(eqLabels.shift()!);
    }

    // ---- liquidity sweeps
    if (cfg.showSweeps && swingPivots.length >= 2) {
      let prevHadUpperReject = false;
      let prevHadLowerReject = false;
      if (i >= 1) {
        const prevBody = Math.abs(close[i - 1] - open[i - 1]);
        const prevUpperWick = high[i - 1] - Math.max(open[i - 1], close[i - 1]);
        const prevLowerWick = Math.min(open[i - 1], close[i - 1]) - low[i - 1];
        prevHadUpperReject = gt(prevUpperWick, Math.max(prevBody, atrVal[i] * 0.1));
        prevHadLowerReject = gt(prevLowerWick, Math.max(prevBody, atrVal[i] * 0.1));
      }
      for (let k = swingPivots.length - 1; k >= Math.max(swingPivots.length - 10, 0); k--) {
        const s = swingPivots[k];
        if (s.isHigh && s.idx < i - 1 && gt(high[i], s.price) && lt(close[i], s.price)
          && (!cfg.sweepRequireWickReject || prevHadUpperReject)) {
          label.new(i, high[i], '⚡', 'bar_index', 'price', color.new(sweepColor, 100), 'label_down', sweepColor, chartSize);
          break;
        }
        if (!s.isHigh && s.idx < i - 1 && lt(low[i], s.price) && gt(close[i], s.price)
          && (!cfg.sweepRequireWickReject || prevHadLowerReject)) {
          label.new(i, low[i], '⚡', 'bar_index', 'price', color.new(sweepColor, 100), 'label_up', sweepColor, chartSize);
          break;
        }
      }
    }

    // ---- premium / discount zones on the last bar
    if (cfg.showPD && !na(lastSwingHigh) && !na(lastSwingLow) && isLast) {
      const eq = (lastSwingHigh + lastSwingLow) / 2;
      delBox(pdPremiumBox.value);
      delBox(pdDiscountBox.value);
      delLine(pdEQLine.value);
      delLabel(pdEQLabel.value);
      if (cfg.showEQ) {
        pdEQLine.value = line.new(i - 40, eq, i + 10, eq, 'bar_index', 'none', color.new(color.gray, 50), 'dotted', 1);
        pdEQLabel.value = label.new(i + 10, eq, 'EQ', 'bar_index', 'price', color.new(color.gray, 90), 'label_left',
          color.gray, 'tiny');
      }
      pdPremiumBox.value = newBox(i - 40, lastSwingHigh, i + 10, eq, color.new(bearColor, 95), 0, 'solid',
        color.new(bearColor, 95));
      pdDiscountBox.value = newBox(i - 40, eq, i + 10, lastSwingLow, color.new(bullColor, 95), 0, 'solid',
        color.new(bullColor, 95));
    }

    // ---- previous day / week high and low on the last bar
    if (cfg.showSessionLevels && isLast) {
      delLine(slPDHLine.value);
      delLine(slPDLLine.value);
      delLine(slPWHLine.value);
      delLine(slPWLLine.value);
      delLabel(slPDHLabel.value);
      delLabel(slPDLLabel.value);
      delLabel(slPWHLabel.value);
      delLabel(slPWLLabel.value);
      const level = (y: number, text: string, col: string, width: number) => [
        line.new(i - 60, y, i + 10, y, 'bar_index', 'none', col, 'dashed', width),
        label.new(i + 10, y, text, 'bar_index', 'price', color.new(col, 85), 'label_left', col, chartSize),
      ] as const;
      const [pdh, pdl] = cfg.showPDHL ? previousPeriodHighLow(bars, 'D', chart) : [NaN, NaN];
      if (cfg.showPDHL && !na(pdh) && !na(pdl)) {
        [slPDHLine.value, slPDHLabel.value] = level(pdh, 'PDH', cfg.slPDColor, 1);
        [slPDLLine.value, slPDLLabel.value] = level(pdl, 'PDL', cfg.slPDColor, 1);
      }
      const [pwh, pwl] = cfg.showPWHL ? previousPeriodHighLow(bars, 'W', chart) : [NaN, NaN];
      if (cfg.showPWHL && !na(pwh) && !na(pwl)) {
        [slPWHLine.value, slPWHLabel.value] = level(pwh, 'PWH', cfg.slPWColor, 2);
        [slPWLLine.value, slPWLLabel.value] = level(pwl, 'PWL', cfg.slPWColor, 2);
      }
    }

    // ---- killzone background
    currentlyInKZ = isInKillzone;
    if (cfg.showKZ && currentlyInKZ) bgColors.push({ time: t, color: kzBg });

    // ---- CISD
    if (lt(close[i], open[i])) lastBearishOpen = open[i];
    if (gt(close[i], open[i])) lastBullishOpen = open[i];
    bullishCISD = !na(lastBearishOpen) && gt(close[i], lastBearishOpen);
    bearishCISD = !na(lastBullishOpen) && lt(close[i], lastBullishOpen);

    // ---- signals
    let longSignal = false;
    let shortSignal = false;
    let sigLongSL = NaN;
    let sigShortSL = NaN;
    let sigLongTP = NaN;
    let sigShortTP = NaN;
    if (cfg.enableSignals && confirmed) {
      for (const bull of [true, false]) {
        let atOB = false;
        let atFVG = false;
        let atOTE = false;
        let atBreaker = false;
        const htfOK = htfAligned(bull);
        const kz = currentlyInKZ;
        let zoneSide = false;
        if (!na(lastSwingHigh) && !na(lastSwingLow)) {
          const eq = (lastSwingHigh + lastSwingLow) / 2;
          zoneSide = bull ? lt(close[i], eq) : gt(close[i], eq);
        }
        const structure = bull ? swingBullish : !swingBullish;
        let bestSL = NaN;
        // touching the zone: low <= top and close > bottom (long); high >= bottom and close < top (short)
        const touches = (top: number, bottom: number) => (bull
          ? le(low[i], top) && gt(close[i], bottom)
          : ge(high[i], bottom) && lt(close[i], top));
        for (let k = orderBlocks.length - 1; k >= Math.max(orderBlocks.length - 10, 0); k--) {
          const ob = orderBlocks[k];
          if (!ob.mitigated && ob.isBullish === bull && touches(ob.top, ob.bottom)) {
            atOB = true;
            bestSL = bull ? Math.min(nz(bestSL, ob.bottom), ob.bottom) : Math.max(nz(bestSL, ob.top), ob.top);
            break;
          }
        }
        for (let k = fvgList.length - 1; k >= Math.max(fvgList.length - 10, 0); k--) {
          const f = fvgList[k];
          if (!f.mitigated && f.isBullish === bull && touches(f.top, f.bottom)) {
            atFVG = true;
            if (na(bestSL)) bestSL = bull ? f.bottom : f.top;
            break;
          }
        }
        for (let k = oteZones.length - 1; k >= Math.max(oteZones.length - 5, 0); k--) {
          const ote = oteZones[k];
          if (!ote.invalidated && ote.isBullish === bull && touches(ote.zoneTop, ote.zoneBottom)) {
            atOTE = true;
            if (na(bestSL)) bestSL = bull ? ote.legLow : ote.legHigh;
            break;
          }
        }
        for (let k = breakerBlocks.length - 1; k >= Math.max(breakerBlocks.length - 5, 0); k--) {
          const brk = breakerBlocks[k];
          if (!brk.mitigated && brk.isBullish === bull && !brk.retested && touches(brk.top, brk.bottom)) {
            atBreaker = true;
            if (na(bestSL)) bestSL = bull ? brk.bottom : brk.top;
            break;
          }
        }
        let score = 0;
        if (atOB) score += 2;
        if (atFVG) score += 1;
        if (atOTE) score += 2;
        if (atBreaker) score += 1;
        if (htfOK) score += 1;
        if (kz) score += 1;
        if (zoneSide) score += 1;
        if (structure) score += 1;
        if (bull ? bullishCISD : bearishCISD) score += 1;

        const touching = atOB || atFVG || atOTE || atBreaker;
        const htfPass = !cfg.requireHTFAlign || htfOK;
        const kzPass = !cfg.requireKZActive || kz;
        const cisdPass = !cfg.requireCISD || (bull ? bullishCISD : bearishCISD);
        if (!(touching && score >= cfg.minSigScore && htfPass && kzPass && cisdPass)) continue;
        const lastBar = bull ? lastLongBar : lastShortBar;
        if (!(na(lastBar) || i - lastBar >= cfg.sigCooldown)) continue;
        let sl = bestSL;
        if (!na(sl) && (bull ? ge(sl, close[i]) : le(sl, close[i]))) sl = NaN;
        let tp = NaN;
        for (let j = swingPivots.length - 1; j >= Math.max(0, swingPivots.length - 20); j--) {
          const sp = swingPivots[j];
          if (bull ? sp.isHigh && gt(sp.price, close[i]) : !sp.isHigh && lt(sp.price, close[i])) {
            if (na(tp) || (bull ? lt(sp.price, tp) : gt(sp.price, tp))) tp = sp.price;
          }
        }
        if (bull) {
          longSignal = true;
          lastLongBar = i;
          sigLongSL = sl;
          sigLongTP = tp;
        } else {
          shortSignal = true;
          lastShortBar = i;
          sigShortSL = sl;
          sigShortTP = tp;
        }
        lastSigDirection = bull ? 'LONG' : 'SHORT';
        lastSigScore = score;
        lastSigSL = sl;
        lastSigTP = tp;
        lastSigBar = i;
      }
    }

    if (longSignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: sigLongColor, size: 'small' });
    }
    if (shortSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: sigShortColor, size: 'small' });
    }
    const slColor = String(color.new(sigShortColor, 30));
    if (longSignal && cfg.showSigSL && !na(sigLongSL)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: sigLongSL, shape: 'xcross', color: slColor, size: 'tiny' });
    }
    if (shortSignal && cfg.showSigSL && !na(sigShortSL)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: sigShortSL, shape: 'xcross', color: slColor, size: 'tiny' });
    }
    const levelLines = (y: number, text: string, col: string) => {
      line.new(i, y, i + 8, y, 'bar_index', 'none', color.new(col, 40), 'dotted', 1);
      label.new(i + 8, y, text, 'bar_index', 'price', color.new(col, 90), 'label_left', col, 'tiny');
    };
    if (longSignal && cfg.showSigSL && !na(sigLongSL)) levelLines(sigLongSL, 'SL', sigShortColor);
    if (longSignal && cfg.showSigTP && !na(sigLongTP)) levelLines(sigLongTP, 'TP', sigLongColor);
    if (shortSignal && cfg.showSigSL && !na(sigShortSL)) levelLines(sigShortSL, 'SL', sigShortColor);
    if (shortSignal && cfg.showSigTP && !na(sigShortTP)) levelLines(sigShortTP, 'TP', sigLongColor);
  }
  setDrawingBar(null);

  // ---- information panel (last bar)
  const tables: TableData[] = [];
  if (cfg.showInfoPanel && n > 0) {
    const i = n - 1;
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string, textColor?: string, textSize: PineSize = panelSize) => {
      cells.push({ column, row, text, ...(textColor !== undefined ? { textColor: String(textColor) } : {}), textSize });
    };
    const gray = color.gray;
    cell(0, 0, 'ICT Validated SMC', color.white, 'normal');
    cell(1, 0, VERSION, gray);
    cell(0, 1, 'Structure:', gray);
    cell(1, 1, swingBullish ? 'BULLISH' : 'BEARISH', swingBullish ? bullColor : bearColor);
    cell(0, 2, 'Last Break:', gray);
    let lastBreakText = '—';
    let lastBreakCol: string = gray;
    if (structureBreaks.length > 0) {
      const lastBrk = structureBreaks[structureBreaks.length - 1];
      lastBreakText = lastBrk.breakType + (lastBrk.isBullish ? ' ▲' : ' ▼');
      lastBreakCol = lastBrk.isBullish ? bullColor : bearColor;
    }
    cell(1, 2, lastBreakText, lastBreakCol);
    cell(0, 3, 'HTF (' + cfg.htfTimeframe + '):', gray);
    if (cfg.useHTF) cell(1, 3, htfStructureBullish ? 'BULLISH' : 'BEARISH', htfStructureBullish ? bullColor : bearColor);
    else cell(1, 3, 'DISABLED', gray);
    cell(0, 4, 'HTF Break:', gray);
    if (cfg.useHTF) {
      const s = htf!.brk[i];
      cell(1, 4, s, s.includes('▲') ? bullColor : s.includes('▼') ? bearColor : gray);
    } else {
      cell(1, 4, '—', gray);
    }
    cell(0, 5, 'Alignment:', gray);
    if (cfg.useHTF) {
      const aligned = (swingBullish && htfStructureBullish) || (!swingBullish && !htfStructureBullish);
      cell(1, 5, aligned ? '✓ ALIGNED' : '✗ COUNTER-TREND', aligned ? bullColor : bearColor);
    } else {
      cell(1, 5, '—', gray);
    }
    const activeOBs = orderBlocks.filter((ob) => !ob.mitigated).length;
    cell(0, 6, 'Active OBs:', gray);
    cell(1, 6, str.tostring(activeOBs), color.white);
    const activeBreakers = breakerBlocks.filter((b) => !b.mitigated).length;
    cell(0, 7, 'Breakers:', gray);
    cell(1, 7, str.tostring(activeBreakers), activeBreakers > 0 ? color.orange : color.white);
    cell(0, 8, 'OTE Zones:', gray);
    const activeOTEs = oteZones.filter((o) => !o.invalidated).length;
    const hasTriple = oteZones.some((o) => !o.invalidated && o.hasOBOverlap && o.hasFVGOverlap);
    cell(1, 8, str.tostring(activeOTEs) + (hasTriple ? ' ◆' : ''), hasTriple ? color.aqua : activeOTEs > 0 ? color.white : gray);
    cell(0, 9, 'Active FVGs:', gray);
    cell(1, 9, str.tostring(fvgList.filter((f) => !f.mitigated).length), color.white);
    cell(0, 10, 'IFVGs:', gray);
    const activeIFVGs = ifvgList.filter((v) => !v.mitigated).length;
    cell(1, 10, str.tostring(activeIFVGs), activeIFVGs > 0 ? color.new('#FFD600', 0) : color.white);
    cell(0, 11, 'BPRs:', gray);
    const activeBPRs = bprList.filter((b) => !b.mitigated).length;
    cell(1, 11, activeBPRs > 0 ? str.tostring(activeBPRs) + ' ◆' : '0', activeBPRs > 0 ? color.new('#E040FB', 0) : gray);
    cell(0, 12, 'IDMs:', gray);
    const activeIDMs = idmList.filter((d) => !d.expired).length;
    const triggeredIDMs = idmList.filter((d) => !d.expired && d.triggered).length;
    cell(1, 12, str.tostring(activeIDMs) + (triggeredIDMs > 0 ? ' (' + str.tostring(triggeredIDMs) + ' ⚡)' : ''),
      activeIDMs > 0 ? idmColor : gray);
    cell(0, 13, 'Zone:', gray);
    let zoneText = '—';
    let zoneCol: string = gray;
    if (!na(lastSwingHigh) && !na(lastSwingLow)) {
      const premium = gt(close[i], (lastSwingHigh + lastSwingLow) / 2);
      zoneText = premium ? 'PREMIUM' : 'DISCOUNT';
      zoneCol = premium ? bearColor : bullColor;
    }
    cell(1, 13, zoneText, zoneCol);
    cell(0, 14, 'Session:', gray);
    const kzName = inNYAMKZ ? 'NY AM' : inLondonKZ ? 'London' : inNYPMKZ ? 'NY PM' : inAsianKZ ? 'Asian' : 'Off-Session';
    cell(1, 14, kzName, currentlyInKZ ? color.aqua : gray);
    cell(0, 15, 'Killzone:', gray);
    cell(1, 15, currentlyInKZ ? 'ACTIVE' : 'INACTIVE', currentlyInKZ ? bullColor : gray);
    cell(0, 16, '─── VALIDATION ───', color.aqua);
    cell(1, 16, '');
    cell(0, 17, 'OB Sweep:', gray);
    cell(1, 17, cfg.requireSweep ? 'REQUIRED' : 'OPTIONAL', cfg.requireSweep ? bullColor : color.yellow);
    cell(0, 18, 'OB Displace:', gray);
    cell(1, 18, cfg.requireDisplacement ? 'REQUIRED' : 'OPTIONAL', cfg.requireDisplacement ? bullColor : color.yellow);
    cell(0, 19, 'HTF Check:', gray);
    cell(1, 19, cfg.useHTF ? cfg.htfTimeframe : 'OFF', cfg.useHTF ? bullColor : gray);
    cell(0, 20, 'FVG Filter:', gray);
    cell(1, 20, str.tostring(cfg.fvgMinATRMult, '#.#') + 'x ATR', color.white);
    cell(0, 21, 'Min Score:', gray);
    cell(1, 21, str.tostring(cfg.minScore) + ' / 8', color.white);
    cell(0, 22, 'Best OB:', gray);
    let bestScore = 0;
    for (const ob of orderBlocks) if (!ob.mitigated && ob.score > bestScore) bestScore = ob.score;
    const bestStars = bestScore >= 7 ? 5 : bestScore >= 5 ? 4 : bestScore >= 4 ? 3 : bestScore >= 3 ? 2 : bestScore > 0 ? 1 : 0;
    const bestStarStr = bestStars >= 5 ? '★★★★★' : bestStars >= 4 ? '★★★★☆' : bestStars >= 3 ? '★★★☆☆'
      : bestStars >= 2 ? '★★☆☆☆' : bestStars >= 1 ? '★☆☆☆☆' : '—';
    const starCol = bestStars >= 4 ? bullColor : bestStars >= 3 ? color.yellow : bestStars >= 1 ? bearColor : gray;
    cell(1, 22, bestStarStr, starCol);
    cell(0, 23, '─── SIGNALS ───', color.aqua);
    cell(1, 23, cfg.enableSignals ? 'ON' : 'OFF', cfg.enableSignals ? bullColor : gray);
    cell(0, 24, 'Signal:', gray);
    if ((lastSigDirection === 'LONG' || lastSigDirection === 'SHORT') && !na(lastSigBar)) {
      const barsAgo = i - lastSigBar;
      const agoStr = barsAgo === 0 ? ' (NOW)' : ' (' + str.tostring(barsAgo) + ' bars ago)';
      const long = lastSigDirection === 'LONG';
      cell(1, 24, (long ? '▲ LONG ' : '▼ SHORT ') + str.tostring(lastSigScore) + '/11' + agoStr, long ? sigLongColor : sigShortColor);
    } else {
      cell(1, 24, 'NO SIGNAL', gray);
    }
    cell(0, 25, 'SL / TP:', gray);
    if (lastSigDirection !== 'NONE' && !na(lastSigSL)) {
      const mintick = mintickOf(chart);
      const slStr = str.tostring(lastSigSL, 'mintick', mintick);
      const tpStr = !na(lastSigTP) ? str.tostring(lastSigTP, 'mintick', mintick) : '—';
      cell(1, 25, slStr + ' / ' + tpStr, color.white);
    } else {
      cell(1, 25, '— / —', gray);
    }
    cell(0, 26, 'CISD:', gray);
    if (bullishCISD && bearishCISD) cell(1, 26, '▲ BULL + ▼ BEAR', color.yellow);
    else if (bullishCISD) cell(1, 26, '▲ BULLISH', bullColor);
    else if (bearishCISD) cell(1, 26, '▼ BEARISH', bearColor);
    else cell(1, 26, '—', gray);
    tables.push({
      position: 'top_right', columns: 2, rows: 28, cells, bgColor: String(color.new(color.black, 85)), borderWidth: 1,
    });
  }

  const drawings = drawingOutputs(bars, ms ? 'ms' : 's');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: drawings.lines ?? [],
    labels: drawings.labels ?? [],
    boxes: drawings.boxes ?? [],
    tables,
    markers,
    bgColors,
  };
}

export const IctAutoValidatedSmc = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
