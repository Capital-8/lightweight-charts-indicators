/**
 * Fibonacci Structure Engine 2.1 [WillyAlgoTrader]
 *
 * Market structure with a Fibonacci grid and a setup model. Confirmed pivots (optionally at least a share of the
 * ATR away from the opposite swing) give the swing high and low. A close beyond the unbroken swing is a structure
 * break: the first one (initial), then BOS with the bias or CHoCH against it. The break starts a Fibonacci leg from
 * the opposite swing to the break candle; with 'Adaptive (original)' the leg follows the live extreme and the
 * accepted pivots, with the other modes it is frozen at the break or at the matching pivot.
 *
 * Each pivot is also a liquidity level (a pivot within the EQ tolerance of an active level of the same side makes an
 * equal high / low zone). A candle that crosses a zone and closes back is a sweep, a close beyond it takes the zone.
 * When a leg is ready, a scenario waits for the price in the setup zone of the leg. It becomes a confirmed signal
 * when the zone was touched, the structure agrees, the location rule passes (zone half and / or the weight of the
 * Fibonacci level reclaimed by the candle), one trigger fires (sweep, engulfing candle, CHoCH retest), the signal
 * distance is respected, and the higher timeframe, the risk geometry and the room to the next obstacle pass.
 * A scenario ends as invalidated, expired, replaced, target reached or ambiguous.
 *
 * Outputs: swing labels (HH, HL, LH, LL, EQ), structure lines and labels, sweep and engulfing marks, the Fibonacci
 * grid with its two zones and the anchor line on the last bar, the nearest active liquidity levels, the scenario
 * zone and risk levels, the panel table (Classic or Detailed), the table of the last outcomes, the watermark, BUY /
 * SELL marks, five values for the data window and the previous day / previous session levels.
 *
 * Chart values (third argument of calculate):
 * - Symbol tick: rounding of entry, stop and target, tolerances, price texts. Without it: 0.01.
 * - State of the last bar: the model does not run on a last bar that is still open (the panel then says "Last
 *   closed state", and the adaptive grid follows the open bar). Without it: the last bar is closed.
 * - Exchange time zone: the dates of the Detailed panel and of the outcome table. Without it: UTC.
 * - Session hours of the symbol ("0930-1600"): the close time of the last higher-timeframe bar in the Detailed
 *   panel is the close of its last chart bar (intraday and daily charts). Without them, and for a symbol that
 *   trades around the clock: the end of the period.
 * - Chart background colour (theme 'Auto': dark below 128 of red). Without it: #0F0F0F, a dark chart.
 *
 * Limits of the port:
 * - The bars of the higher timeframe and the days (previous day high / low) are built from the chart bars with the
 *   UTC calendar rule of src/anchor-period.ts. The close time of a chart bar is its time plus its timeframe (exact
 *   on symbols that trade around the clock and on intraday bars). A timeframe at or below the chart timeframe is
 *   not used by the script.
 * - Session levels: one session period ("HHmm-HHmm") in the session time zone; several periods throw an Error when
 *   the session is used.
 * - A time between two bars is given as the time of the next bar, where it is drawn. Objects without a price and
 *   tables without a cell are not returned (nothing is drawn).
 * - The alert inputs are kept but alerts have no output.
 *
 * Reference: "Fibonacci Structure Engine 2.1 [WillyAlgoTrader]" by WillyAlgoTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, math, str, timeframe, time as pineTime, barTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LabelStyle, LineDrawingData, MarkerData, PineSize, TableCellData, TableData, TablePosition } from '../types';
import { periodStarts, chartTimeframe } from '../anchor-period';
import { backgroundColorOf, lastBarConfirmedOf, mintickOf, timezoneOf, type ChartContext } from '../chart-context';

export interface FibonacciStructureEngineInputs {
  swingLen: number;
  atrFilter: boolean;
  atrMult: number;
  breakBuffer: number;
  anchorMode: 'Adaptive (original)' | 'Break candle' | 'Confirmed pivot';
  use236: boolean;
  confAtr: number;
  zoneRatioA: number;
  zoneRatioB: number;
  showFib: boolean;
  show236: boolean;
  show382: boolean;
  show500: boolean;
  show618: boolean;
  show786: boolean;
  showT50: boolean;
  showT618: boolean;
  extendBars: number;
  eqAtr: number;
  liqExpiry: number;
  zonesPerSide: number;
  showLiquidity: boolean;
  showSweeps: boolean;
  sweepBonus: boolean;
  cooldown: number;
  scenarioExpiry: number;
  allowInitial: boolean;
  enableSweep: boolean;
  enableEngulf: boolean;
  enableRetest: boolean;
  strictEngulf: boolean;
  zonePolicy: 'Zone AND Fib' | 'Zone OR Fib' | 'Fib only';
  minFibWeight: number;
  nearAtr: number;
  stopModel: 'Structure' | 'ATR';
  stopAtr: number;
  stopBuffer: number;
  targetModel: 'ATR' | 'Fib -.618' | 'Nearest obstacle';
  targetAtr: number;
  requireRoom: boolean;
  minimumRoom: number;
  useHtf: boolean;
  htf: string;
  requireHtf: boolean;
  useDay: boolean;
  showDay: boolean;
  useSession: boolean;
  showSession: boolean;
  sessionHours: string;
  sessionDays: string;
  sessionTz: string;
  wideBarAtr: number;
  viewMode: 'Trading' | 'Review';
  showSignals: boolean;
  showStructure: boolean;
  showSwings: boolean;
  showEngulf: boolean;
  showPanel: boolean;
  showHistory: boolean;
  panelPosition: 'Top Right' | 'Top Left' | 'Bottom Right' | 'Bottom Left';
  fontSize: 'Tiny' | 'Small' | 'Normal';
  themeInput: 'Auto' | 'Dark' | 'Light';
  dashboardMode: 'Classic' | 'Detailed';
  structLineStyle: 'Solid' | 'Dashed' | 'Dotted';
  structLineWidth: number;
  showRisk: boolean;
  showSingles: boolean;
  eqExtendBars: number;
  sweepColor: string;
  showWatermark: boolean;
  bullColor: string;
  bearColor: string;
  fibColor: string;
  zoneColor: string;
  liqColor: string;
  /** Alert inputs: kept, without output */
  jsonAlerts: boolean;
  alertEntries: boolean;
  alertLifecycle: boolean;
  alertApproach: boolean;
  alertStructure: boolean;
  alertLiquidity: boolean;
}

export const defaultInputs: FibonacciStructureEngineInputs = {
  swingLen: 10,
  atrFilter: true,
  atrMult: 0.5,
  breakBuffer: 0.0,
  anchorMode: 'Adaptive (original)',
  use236: false,
  confAtr: 0.3,
  zoneRatioA: 0.5,
  zoneRatioB: 0.786,
  showFib: true,
  show236: false,
  show382: true,
  show500: true,
  show618: true,
  show786: true,
  showT50: true,
  showT618: true,
  extendBars: 20,
  eqAtr: 0.1,
  liqExpiry: 0,
  zonesPerSide: 1,
  showLiquidity: true,
  showSweeps: true,
  sweepBonus: true,
  cooldown: 5,
  scenarioExpiry: 80,
  allowInitial: false,
  enableSweep: true,
  enableEngulf: true,
  enableRetest: true,
  strictEngulf: false,
  zonePolicy: 'Zone AND Fib',
  minFibWeight: 1.5,
  nearAtr: 0.3,
  stopModel: 'Structure',
  stopAtr: 1.5,
  stopBuffer: 0.1,
  targetModel: 'ATR',
  targetAtr: 2.5,
  requireRoom: false,
  minimumRoom: 1,
  useHtf: true,
  htf: '60',
  requireHtf: false,
  useDay: true,
  showDay: false,
  useSession: false,
  showSession: false,
  sessionHours: '0800-1700',
  sessionDays: '23456',
  sessionTz: 'Etc/UTC',
  wideBarAtr: 2,
  viewMode: 'Review',
  showSignals: false,
  showStructure: true,
  showSwings: true,
  showEngulf: true,
  showPanel: true,
  showHistory: false,
  panelPosition: 'Top Right',
  fontSize: 'Tiny',
  themeInput: 'Auto',
  dashboardMode: 'Classic',
  structLineStyle: 'Dashed',
  structLineWidth: 2,
  showRisk: false,
  showSingles: false,
  eqExtendBars: 50,
  sweepColor: '#FF9100',
  showWatermark: true,
  bullColor: '#00E676',
  bearColor: '#FF5252',
  fibColor: '#42A5F5',
  zoneColor: '#FFD600',
  liqColor: '#B388FF',
  jsonAlerts: true,
  alertEntries: true,
  alertLifecycle: true,
  alertApproach: false,
  alertStructure: false,
  alertLiquidity: false,
};

const G_CORE = '01 · Structure';
const G_FIB = '02 · Fibonacci';
const G_LIQ = '03 · Liquidity';
const G_SIG = '04 · Setups';
const G_RISK = '05 · Risk model';
const G_CTX = '06 · Context';
const G_VIEW = '07 · Display';
const G_ALERT = '08 · Alerts';

export const inputConfig: InputConfig[] = [
  { id: 'swingLen', type: 'int', title: 'Pivot length', defval: 10, min: 3, max: 50, group: G_CORE },
  { id: 'atrFilter', type: 'bool', title: 'ATR swing filter', defval: true, group: G_CORE },
  { id: 'atrMult', type: 'float', title: 'Minimum swing, ATR', defval: 0.5, min: 0.1, max: 3.0, step: 0.1, group: G_CORE },
  { id: 'breakBuffer', type: 'float', title: 'Close break buffer, ATR', defval: 0.0, min: 0, max: 1, step: 0.05, group: G_CORE },
  {
    id: 'anchorMode', type: 'string', title: 'Impulse end', defval: 'Adaptive (original)',
    options: ['Adaptive (original)', 'Break candle', 'Confirmed pivot'], group: G_FIB,
    tooltip: 'Adaptive (original): trail the live extreme and update both anchors on accepted pivots, as in v1.5.2. Pending setups restart when the range changes; confirmed signal levels never move. Break candle: freeze at the break. Confirmed pivot: freeze once the matching end pivot is confirmed.',
  },
  { id: 'use236', type: 'bool', title: 'Use .236 in signal calculation', defval: false, group: G_FIB },
  { id: 'confAtr', type: 'float', title: 'Touch tolerance, ATR', defval: 0.3, min: 0.01, max: 1, step: 0.01, group: G_FIB },
  { id: 'zoneRatioA', type: 'float', title: 'Setup zone start ratio', defval: 0.5, min: 0.236, max: 0.786, step: 0.001, group: G_FIB },
  { id: 'zoneRatioB', type: 'float', title: 'Setup zone end ratio', defval: 0.786, min: 0.236, max: 0.886, step: 0.001, group: G_FIB },
  { id: 'showFib', type: 'bool', title: 'Show Fib grid', defval: true, group: G_FIB },
  { id: 'show236', type: 'bool', title: 'Show .236', defval: false, group: G_FIB, inline: 'fib1' },
  { id: 'show382', type: 'bool', title: 'Show .382', defval: true, group: G_FIB, inline: 'fib1' },
  { id: 'show500', type: 'bool', title: 'Show .500', defval: true, group: G_FIB, inline: 'fib2' },
  { id: 'show618', type: 'bool', title: 'Show .618', defval: true, group: G_FIB, inline: 'fib2' },
  { id: 'show786', type: 'bool', title: 'Show .786', defval: true, group: G_FIB, inline: 'fib3' },
  { id: 'showT50', type: 'bool', title: 'Show -.500', defval: true, group: G_FIB, inline: 'fib3' },
  { id: 'showT618', type: 'bool', title: 'Show -.618', defval: true, group: G_FIB, inline: 'fib4' },
  { id: 'extendBars', type: 'int', title: 'Drawing extension from current bar', defval: 20, min: 5, max: 100, group: G_FIB },
  { id: 'eqAtr', type: 'float', title: 'EQ tolerance, pivot ATR', defval: 0.1, min: 0.01, max: 0.5, step: 0.01, group: G_LIQ },
  { id: 'liqExpiry', type: 'int', title: 'Liquidity expiry, bars (0 = no age expiry)', defval: 0, min: 0, max: 10000, group: G_LIQ },
  { id: 'zonesPerSide', type: 'int', title: 'Visible active zones per side', defval: 1, min: 1, max: 3, group: G_LIQ },
  { id: 'showLiquidity', type: 'bool', title: 'Show active liquidity map', defval: true, group: G_LIQ },
  { id: 'showSweeps', type: 'bool', title: 'Show sweep markers', defval: true, group: G_LIQ },
  { id: 'sweepBonus', type: 'bool', title: 'Sweep bonus in displayed score only', defval: true, group: G_LIQ },
  { id: 'cooldown', type: 'int', title: 'Signal distance, bars', defval: 5, min: 1, max: 50, group: G_SIG },
  { id: 'scenarioExpiry', type: 'int', title: 'Candidate / observation expiry, bars', defval: 80, min: 5, max: 500, group: G_SIG },
  { id: 'allowInitial', type: 'bool', title: 'Allow setups from initial break', defval: false, group: G_SIG },
  { id: 'enableSweep', type: 'bool', title: 'Sweep entry trigger', defval: true, group: G_SIG },
  { id: 'enableEngulf', type: 'bool', title: 'Engulf entry trigger', defval: true, group: G_SIG },
  { id: 'enableRetest', type: 'bool', title: 'CHoCH retest entry trigger', defval: true, group: G_SIG },
  { id: 'strictEngulf', type: 'bool', title: 'Strict engulf (requires opening gap)', defval: false, group: G_SIG },
  { id: 'zonePolicy', type: 'string', title: 'Location rule', defval: 'Zone AND Fib', options: ['Zone AND Fib', 'Zone OR Fib', 'Fib only'], group: G_SIG },
  { id: 'minFibWeight', type: 'float', title: 'Minimum independent Fib weight', defval: 1.5, min: 1, max: 2.5, step: 0.5, group: G_SIG },
  { id: 'nearAtr', type: 'float', title: 'Approach distance, ATR', defval: 0.3, min: 0.05, max: 2, step: 0.05, group: G_SIG },
  { id: 'stopModel', type: 'string', title: 'Stop model', defval: 'Structure', options: ['Structure', 'ATR'], group: G_RISK },
  { id: 'stopAtr', type: 'float', title: 'ATR stop multiplier', defval: 1.5, min: 0.1, max: 10, step: 0.1, group: G_RISK },
  { id: 'stopBuffer', type: 'float', title: 'Structural stop buffer, ATR', defval: 0.1, min: 0, max: 2, step: 0.05, group: G_RISK },
  { id: 'targetModel', type: 'string', title: 'Target model', defval: 'ATR', options: ['ATR', 'Fib -.618', 'Nearest obstacle'], group: G_RISK },
  { id: 'targetAtr', type: 'float', title: 'ATR target multiplier', defval: 2.5, min: 0.1, max: 20, step: 0.1, group: G_RISK },
  { id: 'requireRoom', type: 'bool', title: 'Filter by room to obstacle (default: information only)', defval: false, group: G_RISK },
  { id: 'minimumRoom', type: 'float', title: 'Minimum room, R', defval: 1, min: 0.1, max: 5, step: 0.1, group: G_RISK },
  { id: 'useHtf', type: 'bool', title: 'Show confirmed higher timeframe', defval: true, group: G_CTX },
  { id: 'htf', type: 'timeframe', title: 'Higher timeframe', defval: '60', group: G_CTX },
  { id: 'requireHtf', type: 'bool', title: 'Require HTF agreement', defval: false, group: G_CTX },
  { id: 'useDay', type: 'bool', title: 'Use previous exchange day as obstacle context', defval: true, group: G_CTX },
  { id: 'showDay', type: 'bool', title: 'Show previous day H/L (exchange day)', defval: false, group: G_CTX },
  { id: 'useSession', type: 'bool', title: 'Use completed session as obstacle context', defval: false, group: G_CTX },
  { id: 'showSession', type: 'bool', title: 'Show session levels', defval: false, group: G_CTX },
  { id: 'sessionHours', type: 'session', title: 'Session hours', defval: '0800-1700', group: G_CTX },
  { id: 'sessionDays', type: 'string', title: 'Session days (1=Sun … 7=Sat)', defval: '23456', group: G_CTX },
  { id: 'sessionTz', type: 'string', title: 'Session timezone (IANA)', defval: 'Etc/UTC', group: G_CTX },
  { id: 'wideBarAtr', type: 'float', title: 'Unusual candle range / previous ATR', defval: 2, min: 1, max: 5, step: 0.1, group: G_CTX },
  { id: 'viewMode', type: 'string', title: 'View mode', defval: 'Review', options: ['Trading', 'Review'], group: G_VIEW },
  { id: 'showSignals', type: 'bool', title: 'Show confirmed BUY / SELL', defval: false, group: G_VIEW },
  { id: 'showStructure', type: 'bool', title: 'Show structure events (Review)', defval: true, group: G_VIEW },
  { id: 'showSwings', type: 'bool', title: 'Show swing labels (Review)', defval: true, group: G_VIEW },
  { id: 'showEngulf', type: 'bool', title: 'Show engulf patterns (Review)', defval: true, group: G_VIEW },
  { id: 'showPanel', type: 'bool', title: 'Show scenario panel', defval: true, group: G_VIEW },
  { id: 'showHistory', type: 'bool', title: 'Show last scenario outcomes', defval: false, group: G_VIEW },
  {
    id: 'panelPosition', type: 'string', title: 'Panel position', defval: 'Top Right',
    options: ['Top Right', 'Top Left', 'Bottom Right', 'Bottom Left'], group: G_VIEW,
  },
  { id: 'fontSize', type: 'string', title: 'Panel text size', defval: 'Tiny', options: ['Tiny', 'Small', 'Normal'], group: G_VIEW },
  { id: 'themeInput', type: 'string', title: 'Theme', defval: 'Auto', options: ['Auto', 'Dark', 'Light'], group: G_VIEW },
  { id: 'dashboardMode', type: 'string', title: 'Dashboard layout', defval: 'Classic', options: ['Classic', 'Detailed'], group: G_VIEW },
  { id: 'structLineStyle', type: 'string', title: 'Structure Line Style', defval: 'Dashed', options: ['Solid', 'Dashed', 'Dotted'], group: G_VIEW },
  { id: 'structLineWidth', type: 'int', title: 'Structure Line Width', defval: 2, min: 1, max: 4, group: G_VIEW },
  { id: 'showRisk', type: 'bool', title: 'Show scenario zone / risk levels', defval: false, group: G_VIEW },
  { id: 'showSingles', type: 'bool', title: 'Show single SH / SL levels', defval: false, group: G_VIEW },
  { id: 'eqExtendBars', type: 'int', title: 'EQ Line Extension (bars)', defval: 50, min: 5, max: 500, step: 5, group: G_VIEW },
  { id: 'sweepColor', type: 'color', title: 'Sweep', defval: '#FF9100', group: G_VIEW },
  { id: 'showWatermark', type: 'bool', title: 'Watermark', defval: true, group: G_VIEW },
  { id: 'bullColor', type: 'color', title: 'Bull', defval: '#00E676', group: G_VIEW, inline: 'col' },
  { id: 'bearColor', type: 'color', title: 'Bear', defval: '#FF5252', group: G_VIEW, inline: 'col' },
  { id: 'fibColor', type: 'color', title: 'Fib', defval: '#42A5F5', group: G_VIEW, inline: 'col2' },
  { id: 'zoneColor', type: 'color', title: 'Setup zone', defval: '#FFD600', group: G_VIEW, inline: 'col2' },
  { id: 'liqColor', type: 'color', title: 'Liquidity', defval: '#B388FF', group: G_VIEW, inline: 'col3' },
  { id: 'jsonAlerts', type: 'bool', title: 'Structured JSON payload', defval: true, group: G_ALERT },
  { id: 'alertEntries', type: 'bool', title: 'Confirmed signals', defval: true, group: G_ALERT },
  { id: 'alertLifecycle', type: 'bool', title: 'Scenario cancellation / outcome', defval: true, group: G_ALERT },
  { id: 'alertApproach', type: 'bool', title: 'Approach / touch (closed-bar observations)', defval: false, group: G_ALERT },
  { id: 'alertStructure', type: 'bool', title: 'Structure events', defval: false, group: G_ALERT },
  { id: 'alertLiquidity', type: 'bool', title: 'Liquidity sweep events', defval: false, group: G_ALERT },
];

const VERSION = '2.1.0';
const BLUE = '#2962FF';
const RATIOS = [0.236, 0.382, 0.5, 0.618, 0.786, -0.5, -0.618];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'FSE signal', color: BLUE, display: 'data_window' },
  { id: 'plot1', title: 'FSE bias', color: BLUE, display: 'data_window' },
  { id: 'plot2', title: 'Long evidence points', color: BLUE, display: 'data_window' },
  { id: 'plot3', title: 'Short evidence points', color: BLUE, display: 'data_window' },
  { id: 'plot4', title: 'FSE scenario state', color: BLUE, display: 'data_window' },
  { id: 'plot5', title: 'Previous day high', color: String(color.new(defaultInputs.bearColor, 50)), style: 'linebr' },
  { id: 'plot6', title: 'Previous day low', color: String(color.new(defaultInputs.bullColor, 50)), style: 'linebr' },
  { id: 'plot7', title: 'Previous session high', color: String(color.new(defaultInputs.liqColor, 40)), style: 'linebr' },
  { id: 'plot8', title: 'Previous session low', color: String(color.new(defaultInputs.liqColor, 40)), style: 'linebr' },
];

export const metadata = {
  title: 'Fibonacci Structure Engine 2.1 [WillyAlgoTrader]',
  shortTitle: 'FibStruct',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const na = (x: number) => !Number.isFinite(x);

const fib = (hi: number, lo: number, ratio: number, direction: number) => (direction === 1 ? hi - (hi - lo) * ratio : lo + (hi - lo) * ratio);
const zoneState = (side: number, lo: number, hi: number, o: number, h: number, l: number, c: number) => (side === 1
  ? (gt(c, hi) ? 2 : gt(h, hi) && lt(c, lo) && le(o, hi) ? 1 : 0)
  : (lt(c, lo) ? 2 : lt(l, lo) && gt(c, hi) && ge(o, lo) ? 1 : 0));
const reclaim = (level: number, direction: number, o: number, h: number, l: number, c: number, tolerance: number) => !na(level)
  && le(l, level + tolerance) && ge(h, level - tolerance) && (direction === 1 ? gt(c, level) && ge(c, o) : lt(c, level) && le(c, o));
const outcome = (direction: number, stop: number, target: number, h: number, l: number) => {
  const hitStop = direction === 1 ? le(l, stop) : ge(h, stop);
  const hitTarget = direction === 1 ? ge(h, target) : le(l, target);
  return hitStop && hitTarget ? 7 : hitStop ? 4 : hitTarget ? 6 : 0;
};
const engulfBounds = (strict: boolean, o: number, c: number, po: number, pc: number, direction: number) => (direction === 1
  ? gt(c, o) && lt(pc, po) && (strict ? lt(o, pc) && gt(c, po) : le(o, pc) && ge(c, po) && (lt(o, pc) || gt(c, po)))
  : lt(c, o) && gt(pc, po) && (strict ? gt(o, pc) && lt(c, po) : ge(o, pc) && le(c, po) && (gt(o, pc) || lt(c, po))));
const rrText = (value: number) => (na(value) ? '—' : `${str.tostring(value, '0.00')}R`);
function stateText(state: number): string {
  switch (state) {
    case 0: return 'Waiting for zone';
    case 1: return 'Approaching';
    case 2: return 'Waiting for trigger';
    case 3: return 'Signal confirmed';
    case 4: return 'Invalidated';
    case 5: return 'Expired';
    case 6: return 'Target reached';
    case 7: return 'Ambiguous bar';
    case 8: return 'Grid replaced';
    default: return '—';
  }
}
const dirText = (direction: number) => (direction === 1 ? 'LONG' : direction === -1 ? 'SHORT' : 'Neutral');

interface Swing {
  price: number;
  idx: number;
  stamp: number;
  broken: boolean;
}
interface Liquidity {
  side: number;
  lo: number;
  hi: number;
  startTime: number;
  born: number;
  kind: string;
  state: number;
}
interface FibLeg {
  id: number;
  direction: number;
  hi: number;
  lo: number;
  startTime: number;
  endTime: number;
  endIdx: number;
  hiIdx: number;
  loIdx: number;
  hiTime: number;
  loTime: number;
  born: number;
  origin: string;
  live: boolean;
  valid: boolean;
}
interface Scenario {
  id: number;
  direction: number;
  born: number;
  stamp: number;
  state: number;
  hi: number;
  lo: number;
  zoneLo: number;
  zoneHi: number;
  invalid: number;
  entry: number;
  stop: number;
  target: number;
  obstacle: number;
  rr: number;
  room: number;
  signalBar: number;
  origin: string;
  trigger: string;
  reason: string;
  touched: boolean;
  independent: number;
  referenceAtr: number;
}
/** Drawings of the structure history; x values are times in ms */
interface HistoryLabel {
  time: number;
  price: number;
  text: string;
  style: LabelStyle;
  color: string;
  textColor: string;
  size: PineSize;
  tooltip: string;
}
interface HistoryLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  width: number;
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

export function calculate(bars: Bar[], inputs: Partial<FibonacciStructureEngineInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  // syminfo.mintick, barstate.isconfirmed on the last bar, syminfo.timezone (date texts), chart.bg_color
  const MINTICK = mintickOf(chart);
  const LAST_BAR_CLOSED = lastBarConfirmedOf(chart);
  const TEXT_TZ = timezoneOf(chart);
  const CHART_BG = backgroundColorOf(chart);
  const px = (value: number) => (na(value) ? '—' : str.tostring(value, 'mintick', MINTICK));
  const { swingLen, bullColor, bearColor, fibColor, zoneColor, liqColor } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const ms = n > 0 && bars[0].time >= 1e12;
  const tMs = (i: number) => (ms ? bars[i].time : bars[i].time * 1000);
  const chartTf = chartTimeframe(bars);
  const tfSeconds = chartTf === '' ? 0 : timeframe.in_seconds(chartTf);
  const isIntraday = chartTf !== '' && timeframe.info(chartTf).isintraday;
  const closeMs = (i: number) => tMs(i) + tfSeconds * 1000;
  const review = cfg.viewMode === 'Review';
  const adaptive = cfg.anchorMode === 'Adaptive (original)';

  const positionValue: TablePosition = cfg.panelPosition === 'Top Left' ? 'top_left' : cfg.panelPosition === 'Bottom Right' ? 'bottom_right'
    : cfg.panelPosition === 'Bottom Left' ? 'bottom_left' : 'top_right';
  const textSize: PineSize = cfg.fontSize === 'Tiny' ? 'tiny' : cfg.fontSize === 'Normal' ? 'normal' : 'small';
  const dark = cfg.themeInput === 'Dark' ? true : cfg.themeInput === 'Light' ? false : (color.r(CHART_BG) as number) < 128;
  const textColor = dark ? '#E0E0E0' : '#1A1A1A';
  const textMuted = dark ? '#9E9E9E' : '#757575';
  const panelBg = String(color.new(dark ? '#131722' : '#FFFFFF', 5));
  const panelBorder = dark ? '#2A2E39' : '#D0D0D0';
  const panelAlt = dark ? '#1C2030' : '#F0F4F8';
  const headerBg = BLUE;
  const watermarkColor = String(color.new(dark ? '#FFFFFF' : '#000000', 80));
  const structureStyle = cfg.structLineStyle === 'Solid' ? 'solid' : cfg.structLineStyle === 'Dotted' ? 'dotted' : 'dashed';

  const atr = A(ta.atr(bars, 14));
  const pivotHigh = A(ta.pivothigh(S(bars.map((b) => b.high)), swingLen, swingLen));
  const pivotLow = A(ta.pivotlow(S(bars.map((b) => b.low)), swingLen, swingLen));
  const body = bars.map((b) => Math.abs(b.close - b.open));
  const bodyAvg = A(ta.ema(S(body), 14));

  // Higher timeframe structure of its last closed bar: [bias[1], time_close[1]] with lookahead on. Only a timeframe
  // above the chart timeframe is used by the script.
  const htfValid = chartTf !== '' && timeframe.in_seconds(cfg.htf) > tfSeconds;
  const htfBias: number[] = new Array(n).fill(NaN);
  const htfCloseTime: number[] = new Array(n).fill(NaN);
  if (htfValid && n > 0) {
    const starts = periodStarts(bars, cfg.htf);
    const htf: Bar[] = [];
    const group: number[] = [];
    const lastOf: number[] = [];
    bars.forEach((b, i) => {
      if (i === 0 || starts[i] !== starts[i - 1]) {
        htf.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
      } else {
        const last = htf[htf.length - 1];
        last.high = Math.max(last.high, b.high);
        last.low = Math.min(last.low, b.low);
        last.close = b.close;
      }
      group.push(htf.length - 1);
      lastOf[htf.length - 1] = i;
    });
    // time_close of a bar of the higher timeframe. With the session hours of the symbol (a symbol that does not
    // trade around the clock) it is the close of its last chart bar: the end of an intraday bar, the end of the
    // session of a daily bar. Without them: the end of the period.
    const symbolSession = typeof chart?.session === 'string' ? chart.session : chart?.session?.session ?? '';
    const sessionHours = /^(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(symbolSession);
    const sessionEnd = sessionHours && sessionHours[1] + sessionHours[2] !== sessionHours[3] + sessionHours[4]
      ? { hour: Number(sessionHours[3]), minute: Number(sessionHours[4]) } : null;
    const htfClose = (g: number): number => {
      const last = lastOf[g];
      if (sessionEnd !== null && isIntraday) return closeMs(last);
      if (sessionEnd !== null && chartTf !== '' && timeframe.in_seconds(chartTf) === 86400) {
        const t = tMs(last);
        const at = (shift: number) => pineTime.timestamp(
          TEXT_TZ, pineTime.year(t, TEXT_TZ), pineTime.month(t, TEXT_TZ), pineTime.dayofmonth(t, TEXT_TZ) + shift, sessionEnd.hour, sessionEnd.minute,
        );
        return at(0) > t ? at(0) : at(1);
      }
      return periodEnd(ms ? htf[g].time : htf[g].time * 1000, cfg.htf);
    };
    const ph = A(ta.pivothigh(Series.fromArray(htf, htf.map((b) => b.high)), swingLen, swingLen));
    const pl = A(ta.pivotlow(Series.fromArray(htf, htf.map((b) => b.low)), swingLen, swingLen));
    let lastHigh = NaN;
    let lastLow = NaN;
    let bias = 0;
    const biasOf: number[] = [];
    htf.forEach((b, g) => {
      if (!na(ph[g])) lastHigh = ph[g];
      if (!na(pl[g])) lastLow = pl[g];
      if (!na(lastHigh) && gt(b.close, lastHigh)) {
        bias = 1;
        lastHigh = NaN;
      } else if (!na(lastLow) && lt(b.close, lastLow)) {
        bias = -1;
        lastLow = NaN;
      }
      biasOf.push(bias);
    });
    for (let i = 0; i < n; i++) {
      const g = group[i] - 1;
      if (g < 0) continue;
      htfBias[i] = biasOf[g];
      htfCloseTime[i] = htfClose(g);
    }
  }

  // request.security(tickerid, "D", [high[1], low[1]], lookahead on): the high / low of the previous day
  const dayValid = isIntraday;
  const prevDayH: number[] = new Array(n).fill(NaN);
  const prevDayL: number[] = new Array(n).fill(NaN);
  if (dayValid) {
    const days = periodStarts(bars, 'D');
    let prevHigh = NaN;
    let prevLow = NaN;
    let dayHigh = NaN;
    let dayLow = NaN;
    for (let i = 0; i < n; i++) {
      if (i === 0 || days[i] !== days[i - 1]) {
        prevHigh = dayHigh;
        prevLow = dayLow;
        dayHigh = bars[i].high;
        dayLow = bars[i].low;
      } else {
        dayHigh = Math.max(dayHigh, bars[i].high);
        dayLow = Math.min(dayLow, bars[i].low);
      }
      prevDayH[i] = prevHigh;
      prevDayL[i] = prevLow;
    }
  }

  // Session: time("1D", session, time zone) is the start of the session of the bar, time_close("1D", ...) its end
  const sessionUsed = isIntraday && (cfg.useSession || cfg.showSession);
  const sessionSpec = `${cfg.sessionHours}:${cfg.sessionDays}`;
  const sessionPeriod = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(cfg.sessionHours.trim());
  if (sessionUsed && !sessionPeriod) {
    throw new Error(`Session "${cfg.sessionHours}": the session levels are supported for one period "HHmm-HHmm" only.`);
  }
  const sessionBounds = (t: number): [number, number] => {
    const tz = cfg.sessionTz;
    const [startMin, endMin] = sessionPeriod
      ? [Number(sessionPeriod[1]) * 60 + Number(sessionPeriod[2]), Number(sessionPeriod[3]) * 60 + Number(sessionPeriod[4])] : [0, 0];
    const y = pineTime.year(t, tz);
    const mo = pineTime.month(t, tz);
    const d = pineTime.dayofmonth(t, tz);
    const minutes = pineTime.hour(t, tz) * 60 + pineTime.minute(t, tz);
    const at = (day: number, m: number) => pineTime.timestamp(tz, y, mo, day, Math.floor(m / 60), m % 60);
    if (startMin < endMin) return [at(d, startMin), at(d, endMin)];
    // A period over midnight (or the whole day)
    return minutes >= startMin ? [at(d, startMin), at(d + 1, endMin)] : [at(d - 1, startMin), at(d, endMin)];
  };

  // State of the model
  let currentSessionH = NaN;
  let currentSessionL = NaN;
  let previousSessionH = NaN;
  let previousSessionL = NaN;
  let sessionCompleteStart = false;
  let previousSessionStart = NaN;
  let trackedSessionEnd = NaN;
  let lastSessionBarClose = NaN;
  let prevInSession = false;

  let swingHigh: Swing = { price: NaN, idx: NaN, stamp: NaN, broken: false };
  let swingLow: Swing = { price: NaN, idx: NaN, stamp: NaN, broken: false };
  let leg: FibLeg = {
    id: NaN, direction: 0, hi: NaN, lo: NaN, startTime: NaN, endTime: NaN, endIdx: NaN, hiIdx: NaN, loIdx: NaN, hiTime: NaN, loTime: NaN,
    born: NaN, origin: '', live: false, valid: false,
  };
  let scenario: Scenario | null = null;
  let lastSignal: Scenario | null = null;
  let bias = 0;
  let lastSignalBar = NaN;
  let lastCandidateLeg = NaN;
  let lastFlip = NaN;
  let totalConfirmed = 0;
  let targetCount = 0;
  let invalidCount = 0;
  let ambiguousCount = 0;
  let expiredCount = 0;
  let firstObserved = NaN;
  let blockReason = '';
  let lastEvent = '—';
  let lastEventBar = NaN;
  let longWeight = 0;
  let shortWeight = 0;
  let longScore = 0;
  let shortScore = 0;
  let candleAtr = NaN;
  const liquidity: Liquidity[] = [];
  const history: Scenario[] = [];
  const historyLabels: HistoryLabel[] = [];
  const historyLines: HistoryLine[] = [];

  const plot0: Array<{ time: number; value: number }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const plot3: typeof plot0 = [];
  const plot4: typeof plot0 = [];
  const plot5: Array<{ time: number; value: number; color: string }> = [];
  const plot6: typeof plot5 = [];
  const plot7: typeof plot5 = [];
  const plot8: typeof plot5 = [];
  const dayHighColor = String(color.new(bearColor, 50));
  const dayLowColor = String(color.new(bullColor, 50));
  const sessionColor = String(color.new(liqColor, 40));
  const markers: MarkerData[] = [];
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const boxes: BoxData[] = [];
  const tables: TableData[] = [];

  // A time between two bars is drawn on the next bar
  const drawnTime = (tm: number): number => {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tMs(mid) >= tm) hi = mid;
      else lo = mid + 1;
    }
    return bars[lo].time;
  };

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const { open, high, low, close } = bar;
    const time = tMs(i);
    const confirmed = LAST_BAR_CLOSED || i < n - 1;
    const sizePattern = gt(body[i], bodyAvg[i]) && i > 0 && lt(body[i - 1], bodyAvg[i - 1]);
    const bullEngulf = sizePattern && engulfBounds(cfg.strictEngulf, open, close, bars[i - 1].open, bars[i - 1].close, 1);
    const bearEngulf = sizePattern && engulfBounds(cfg.strictEngulf, open, close, bars[i - 1].open, bars[i - 1].close, -1);
    // chart.is_standard is true: the bars are standard candles
    const ready = i >= Math.max(3 * swingLen, 50) && !na(atr[i]) && gt(atr[i], 0);
    const inSession = sessionUsed && pineTime.inSession(time, sessionSpec, cfg.sessionTz);
    const [sessionStartTime, sessionEndTime] = inSession ? sessionBounds(time) : [NaN, NaN];
    const sessionBarAligned = inSession && closeMs(i) <= sessionEndTime;

    let confirmedBuy = false;
    let confirmedSell = false;
    let sweepHigh = false;
    let sweepLow = false;
    let sweepHighPrice = NaN;
    let sweepLowPrice = NaN;
    let breakKind = '';
    let breakDirection = 0;
    let structureConflict = false;

    const mark = (stamp: number, value: number, title: string, side: number, col: string, tooltip: string) => {
      while (historyLabels.length >= 150) historyLabels.shift();
      historyLabels.push({
        time: stamp, price: value, text: title, style: side === 1 ? 'label_down' : 'label_up', color: String(color.new(col, 100)),
        textColor: col, size: ['✗', '▲', '▼', 'BOS', 'CHoCH', 'INITIAL'].includes(title) ? 'small' : 'tiny', tooltip,
      });
    };
    const segment = (stamp: number, value: number, col: string, structural = false) => {
      while (historyLines.length >= 110) historyLines.shift();
      historyLines.push({
        x1: stamp, y1: value, x2: time, y2: value, color: col, style: structural ? structureStyle : 'dashed',
        width: structural ? cfg.structLineWidth : 1,
      });
    };
    const addZone = (side: number, price: number, stamp: number, tolerance: number) => {
      let mergeAt = -1;
      liquidity.forEach((z, k) => {
        if (z.side === side && z.state === 0 && le(Math.abs(price - (side === 1 ? z.hi : z.lo)), tolerance)) mergeAt = k;
      });
      let lo = price;
      let hi = price;
      let firstTime = stamp;
      let kind = side === 1 ? 'SH' : 'SL';
      if (mergeAt >= 0) {
        const old = liquidity[mergeAt];
        lo = Math.min(old.lo, price);
        hi = Math.max(old.hi, price);
        firstTime = old.startTime;
        old.state = 3;
        kind = side === 1 ? 'EQH' : 'EQL';
      }
      if (liquidity.length >= 64) {
        const removable = liquidity.findIndex((z) => z.state !== 0);
        liquidity.splice(removable >= 0 ? removable : 0, 1);
      }
      liquidity.push({ side, lo, hi, startTime: firstTime, born: i, kind, state: 0 });
    };

    if (confirmed) {
      if (sessionUsed) {
        const newSession = inSession && (!prevInSession || Number.isNaN(previousSessionStart) || sessionStartTime !== previousSessionStart);
        if (newSession) {
          if (!na(currentSessionH)) {
            const complete = sessionCompleteStart && lastSessionBarClose === trackedSessionEnd;
            previousSessionH = complete ? currentSessionH : NaN;
            previousSessionL = complete ? currentSessionL : NaN;
          }
          currentSessionH = high;
          currentSessionL = low;
          sessionCompleteStart = time === sessionStartTime && sessionBarAligned;
          trackedSessionEnd = sessionEndTime;
        } else if (inSession) {
          currentSessionH = na(currentSessionH) ? high : Math.max(currentSessionH, high);
          currentSessionL = na(currentSessionL) ? low : Math.min(currentSessionL, low);
        }
        if (inSession) {
          sessionCompleteStart = sessionCompleteStart && sessionBarAligned;
          lastSessionBarClose = closeMs(i);
          previousSessionStart = sessionStartTime;
        }
        if (!inSession && prevInSession) {
          const complete = sessionCompleteStart && lastSessionBarClose === trackedSessionEnd;
          previousSessionH = complete ? currentSessionH : NaN;
          previousSessionL = complete ? currentSessionL : NaN;
        }
      }
      const atrPrev = i > 0 ? atr[i - 1] : NaN;
      candleAtr = !na(atrPrev) && gt(atrPrev, 0) ? (high - low) / atrPrev : NaN;

      // Swings: confirmed pivots, optionally filtered by their distance to the opposite swing
      const oldHigh = swingHigh.price;
      const oldLow = swingLow.price;
      const pivotAtr = i - swingLen >= 0 ? atr[i - swingLen] : NaN;
      const swingAtr = na(pivotAtr) ? atr[i] : pivotAtr;
      const acceptSwing = (price: number, opposite: number, threshold: number, side: number) => !cfg.atrFilter || na(opposite)
        || ge(side === 1 ? price - opposite : opposite - price, threshold);
      const newHigh = !na(pivotHigh[i]) && acceptSwing(pivotHigh[i], oldLow, swingAtr * cfg.atrMult, 1);
      const newLow = !na(pivotLow[i]) && acceptSwing(pivotLow[i], oldHigh, swingAtr * cfg.atrMult, -1);
      const confirmedAfter = `Confirmed after ${swingLen} bars`;
      if (newHigh) {
        swingHigh = { price: pivotHigh[i], idx: i - swingLen, stamp: tMs(i - swingLen), broken: false };
        if (ready) {
          addZone(1, pivotHigh[i], swingHigh.stamp, Math.max(MINTICK, swingAtr * cfg.eqAtr));
          if (review && cfg.showSwings && !na(oldHigh)) {
            const txt = le(Math.abs(pivotHigh[i] - oldHigh), MINTICK / 2) ? 'EQ' : gt(pivotHigh[i], oldHigh) ? 'HH' : 'LH';
            mark(swingHigh.stamp, pivotHigh[i], txt, 1, gt(pivotHigh[i], oldHigh) ? bullColor : bearColor, confirmedAfter);
          }
        }
      }
      if (newLow) {
        swingLow = { price: pivotLow[i], idx: i - swingLen, stamp: tMs(i - swingLen), broken: false };
        if (ready) {
          addZone(-1, pivotLow[i], swingLow.stamp, Math.max(MINTICK, swingAtr * cfg.eqAtr));
          if (review && cfg.showSwings && !na(oldLow)) {
            const txt = le(Math.abs(pivotLow[i] - oldLow), MINTICK / 2) ? 'EQ' : gt(pivotLow[i], oldLow) ? 'HL' : 'LL';
            mark(swingLow.stamp, pivotLow[i], txt, -1, gt(pivotLow[i], oldLow) ? bullColor : bearColor, confirmedAfter);
          }
        }
      }

      // Liquidity zones: sweep (cross and close back) or taken (close beyond)
      if (ready) {
        for (const z of liquidity) {
          if (z.state !== 0) continue;
          const nextState = zoneState(z.side, z.lo, z.hi, open, high, low, close);
          if (cfg.liqExpiry > 0 && i - z.born > cfg.liqExpiry) {
            z.state = 4;
          } else if (nextState !== 0) {
            z.state = nextState;
            if (review && cfg.showLiquidity && (cfg.showSingles || z.kind === 'EQH' || z.kind === 'EQL')) {
              segment(z.startTime, z.side === 1 ? z.hi : z.lo, String(color.new(liqColor, 50)));
            }
            if (nextState === 1) {
              sweepHigh = sweepHigh || z.side === 1;
              sweepLow = sweepLow || z.side === -1;
              if (z.side === 1) sweepHighPrice = na(sweepHighPrice) ? z.hi : Math.max(sweepHighPrice, z.hi);
              else sweepLowPrice = na(sweepLowPrice) ? z.lo : Math.min(sweepLowPrice, z.lo);
            }
          }
        }
      }
      if (sweepHigh || sweepLow) {
        lastEvent = sweepHigh && sweepLow ? 'SWEEP BOTH' : sweepHigh ? 'SWEEP HIGH' : 'SWEEP LOW';
        lastEventBar = i;
      }
      if (cfg.showSweeps && sweepHigh) mark(time, high, '✗', 1, cfg.sweepColor, `Sweep high · ${px(sweepHighPrice)}`);
      if (cfg.showSweeps && sweepLow) mark(time, low, '✗', -1, cfg.sweepColor, `Sweep low · ${px(sweepLowPrice)}`);

      // Structure breaks
      const upBreak = ready && !na(swingHigh.price) && !swingHigh.broken && gt(close, swingHigh.price + atr[i] * cfg.breakBuffer);
      const downBreak = ready && !na(swingLow.price) && !swingLow.broken && lt(close, swingLow.price - atr[i] * cfg.breakBuffer);
      structureConflict = upBreak && downBreak;
      if (structureConflict) {
        blockReason = 'Crossed structure range';
      } else if (upBreak || downBreak) {
        breakDirection = upBreak ? 1 : -1;
        breakKind = bias === 0 ? 'initial' : bias === breakDirection ? 'bos' : 'choch';
        if (breakKind === 'choch') lastFlip = i;
        bias = breakDirection;
        const anchor = upBreak ? swingLow : swingHigh;
        const broken = upBreak ? swingHigh : swingLow;
        broken.broken = true;
        const legHigh = upBreak ? high : anchor.price;
        const legLow = upBreak ? anchor.price : low;
        const anchorsOk = !Number.isNaN(anchor.idx) && anchor.idx < i && ge(legHigh - legLow, MINTICK);
        leg = {
          id: time, direction: breakDirection, hi: legHigh, lo: legLow, startTime: anchor.stamp, endTime: time, endIdx: i, born: i,
          origin: breakKind, live: cfg.anchorMode !== 'Break candle', valid: anchorsOk, hiIdx: upBreak ? i : anchor.idx,
          loIdx: upBreak ? anchor.idx : i, hiTime: upBreak ? time : anchor.stamp, loTime: upBreak ? anchor.stamp : time,
        };
        lastEvent = breakKind.toUpperCase() + (upBreak ? ' ↑' : ' ↓');
        lastEventBar = i;
        if (cfg.showStructure && review) {
          segment(broken.stamp, broken.price, upBreak ? bullColor : bearColor, true);
          mark(Math.trunc((broken.stamp + time) / 2), broken.price, breakKind === 'choch' ? 'CHoCH' : breakKind.toUpperCase(), upBreak ? 1 : -1,
            upBreak ? bullColor : bearColor, 'Close-confirmed structure');
        }
      }

      // Fibonacci leg
      if (adaptive && leg.direction !== 0) {
        const priorHi = leg.hi;
        const priorLo = leg.lo;
        const priorValid = leg.valid;
        if (breakDirection === 0 && leg.live) {
          if (leg.direction === 1 && gt(high, leg.hi)) {
            leg.hi = high;
            leg.hiIdx = i;
            leg.hiTime = time;
          }
          if (leg.direction === -1 && lt(low, leg.lo)) {
            leg.lo = low;
            leg.loIdx = i;
            leg.loTime = time;
          }
        }
        if (newHigh && leg.live && leg.direction === 1) {
          leg.hi = swingHigh.price;
          leg.hiIdx = swingHigh.idx;
          leg.hiTime = swingHigh.stamp;
          leg.live = false;
        }
        if (newLow && leg.live && leg.direction === -1) {
          leg.lo = swingLow.price;
          leg.loIdx = swingLow.idx;
          leg.loTime = swingLow.stamp;
          leg.live = false;
        }
        if (newHigh && !(leg.live && leg.direction === 1) && !na(leg.hi) && ne(swingHigh.price, leg.hi)) {
          leg.hi = swingHigh.price;
          leg.hiIdx = swingHigh.idx;
          leg.hiTime = swingHigh.stamp;
        }
        if (newLow && !(leg.live && leg.direction === -1) && !na(leg.lo) && ne(swingLow.price, leg.lo)) {
          leg.lo = swingLow.price;
          leg.loIdx = swingLow.idx;
          leg.loTime = swingLow.stamp;
        }
        leg.startTime = leg.direction === 1 ? leg.loTime : leg.hiTime;
        leg.endTime = leg.direction === 1 ? leg.hiTime : leg.loTime;
        leg.endIdx = leg.direction === 1 ? leg.hiIdx : leg.loIdx;
        leg.valid = !na(leg.hi) && !na(leg.lo) && gt(leg.hi, leg.lo);
        if (ne(leg.hi, priorHi) || ne(leg.lo, priorLo) || leg.valid !== priorValid) {
          leg.id = time;
          leg.born = i;
        }
      } else if (leg.valid) {
        if (leg.direction === 1 ? lt(close, leg.lo) : gt(close, leg.hi)) {
          leg.valid = false;
        } else if (leg.live) {
          if (leg.direction === 1 && ge(high, leg.hi)) {
            leg.hi = high;
            leg.endIdx = i;
            leg.endTime = time;
          }
          if (leg.direction === -1 && le(low, leg.lo)) {
            leg.lo = low;
            leg.endIdx = i;
            leg.endTime = time;
          }
          const lockHigh = leg.direction === 1 && newHigh && swingHigh.idx === leg.endIdx && eq(swingHigh.price, leg.hi);
          const lockLow = leg.direction === -1 && newLow && swingLow.idx === leg.endIdx && eq(swingLow.price, leg.lo);
          if (lockHigh || lockLow) leg.live = false;
        }
      }

      // Outcome of the running scenario
      if (scenario !== null && scenario.state <= 3) {
        let resolved = 0;
        if (scenario.state === 3 && i > scenario.signalBar) {
          resolved = outcome(scenario.direction, scenario.stop, scenario.target, high, low);
        } else if (scenario.state < 3 && (scenario.direction === 1 ? lt(close, scenario.invalid) : gt(close, scenario.invalid))) {
          resolved = 4;
        }
        const ageBase = scenario.state === 3 ? scenario.signalBar : scenario.born;
        if (resolved === 0 && i - ageBase >= cfg.scenarioExpiry) resolved = 5;
        if (resolved === 0 && scenario.state < 3
          && ((leg.valid && !Number.isNaN(leg.id) && leg.id !== scenario.id) || (adaptive && !leg.valid))) {
          resolved = 8;
        }
        if (resolved !== 0) {
          const observed = scenario.state === 3;
          scenario.state = resolved;
          scenario.reason = stateText(resolved);
          if (observed) {
            targetCount += resolved === 6 ? 1 : 0;
            invalidCount += resolved === 4 ? 1 : 0;
            ambiguousCount += resolved === 7 ? 1 : 0;
            expiredCount += resolved === 5 ? 1 : 0;
          }
          history.unshift({ ...scenario });
          if (history.length > 8) history.pop();
        }
      }

      // New scenario on a ready leg
      const freeSlot = scenario === null || scenario.state > 3;
      if (ready && freeSlot && leg.valid && !leg.live && (Number.isNaN(lastCandidateLeg) || (!Number.isNaN(leg.id) && lastCandidateLeg !== leg.id))
        && (leg.origin !== 'initial' || cfg.allowInitial)) {
        const za = fib(leg.hi, leg.lo, cfg.zoneRatioA, leg.direction);
        const zb = fib(leg.hi, leg.lo, cfg.zoneRatioB, leg.direction);
        scenario = {
          id: leg.id, direction: leg.direction, born: i, stamp: time, state: 0, hi: leg.hi, lo: leg.lo, zoneLo: Math.min(za, zb),
          zoneHi: Math.max(za, zb), invalid: leg.direction === 1 ? leg.lo : leg.hi, entry: NaN, stop: NaN, target: NaN, obstacle: NaN,
          rr: NaN, room: NaN, signalBar: NaN, trigger: '', reason: '', touched: false, independent: 0, referenceAtr: NaN,
          origin: leg.origin,
        };
        lastCandidateLeg = leg.id;
      }

      longWeight = 0;
      shortWeight = 0;
      blockReason = !ready ? 'Warming up / ATR unavailable' : leg.live ? 'Waiting for end pivot' : 'No active candidate';
      if (scenario !== null && scenario.state < 3 && ready) {
        const sc: Scenario = scenario;
        const direction = sc.direction;
        const tolerance = Math.max(MINTICK, atr[i] * cfg.confAtr);
        // fibWeight(): the weight of the Fibonacci level reclaimed by the candle
        let weight = 0;
        if (!na(sc.hi) && !na(sc.lo) && gt(sc.hi, sc.lo)) {
          const reclaimed = (ratio: number) => reclaim(fib(sc.hi, sc.lo, ratio, direction), direction, open, high, low, close, tolerance);
          if (cfg.use236 && reclaimed(0.236)) weight = 1;
          if (reclaimed(0.382)) weight = Math.max(weight, 1.5);
          if (reclaimed(0.5)) weight = Math.max(weight, 2);
          if (reclaimed(0.618)) weight = Math.max(weight, 2.5);
          if (reclaimed(0.786)) weight = Math.max(weight, 1.5);
        }
        sc.independent = weight;
        sc.referenceAtr = atr[i];
        longWeight = direction === 1 ? weight : 0;
        shortWeight = direction === -1 ? weight : 0;
        const touch = le(low, sc.zoneHi) && ge(high, sc.zoneLo);
        const distance = lt(close, sc.zoneLo) ? sc.zoneLo - close : gt(close, sc.zoneHi) ? close - sc.zoneHi : 0;
        if (i > sc.born) {
          sc.touched = sc.touched || touch;
          sc.state = sc.touched ? 2 : le(distance, atr[i] * cfg.nearAtr) ? 1 : 0;
        }
        const midpoint = (sc.hi + sc.lo) / 2;
        const priceInRange = ge(close, sc.lo) && le(close, sc.hi);
        const zoneOk = priceInRange && (direction === 1 ? lt(close, midpoint) : gt(close, midpoint));
        const fibOk = ge(weight, cfg.minFibWeight);
        const locationOk = cfg.zonePolicy === 'Zone AND Fib' ? zoneOk && fibOk : cfg.zonePolicy === 'Zone OR Fib' ? zoneOk || fibOk : fibOk;
        const trendOk = bias === direction && !structureConflict;
        const sweepTrigger = cfg.enableSweep && (direction === 1 ? sweepLow : sweepHigh);
        const engulfTrigger = cfg.enableEngulf && (direction === 1 ? bullEngulf : bearEngulf);
        const retestTrigger = cfg.enableRetest && sc.origin === 'choch' && ge(weight, cfg.minFibWeight) && (direction === 1 ? gt(close, open) : lt(close, open));
        const anyTrigger = sweepTrigger || engulfTrigger || retestTrigger;
        const conflict = (sweepHigh && sweepLow) || (direction === 1 ? sweepHigh && bullEngulf : sweepLow && bearEngulf);
        const cooled = Number.isNaN(lastSignalBar) || i - lastSignalBar >= cfg.cooldown;
        const htfOk = !cfg.requireHtf || (htfValid && htfBias[i] === direction);
        const entry = math.round_to_mintick(close, MINTICK) as number;
        let stop = cfg.stopModel === 'ATR' ? entry - direction * atr[i] * cfg.stopAtr
          : direction === 1 ? Math.min(sc.invalid, low) - atr[i] * cfg.stopBuffer : Math.max(sc.invalid, high) + atr[i] * cfg.stopBuffer;
        stop = direction === 1 ? Math.floor(stop / MINTICK) * MINTICK : Math.ceil(stop / MINTICK) * MINTICK;
        // nearestObstacle(): active zones of the trade side, then the day and session levels
        let obstacle = NaN;
        for (const z of liquidity) {
          const level = direction === 1 ? Math.max(entry, z.lo) : Math.min(entry, z.hi);
          if (z.state === 0 && z.side === direction && (direction === 1 ? ge(z.hi, entry) : le(z.lo, entry))) {
            if (na(obstacle) || lt(Math.abs(level - entry), Math.abs(obstacle - entry))) obstacle = level;
          }
        }
        for (const level of [cfg.useDay && dayValid ? prevDayH[i] : NaN, cfg.useDay && dayValid ? prevDayL[i] : NaN,
          cfg.useSession ? previousSessionH : NaN, cfg.useSession ? previousSessionL : NaN]) {
          if (!na(level) && (direction === 1 ? ge(level, entry) : le(level, entry))) {
            if (na(obstacle) || lt(Math.abs(level - entry), Math.abs(obstacle - entry))) obstacle = level;
          }
        }
        let target = cfg.targetModel === 'ATR' ? entry + direction * atr[i] * cfg.targetAtr
          : cfg.targetModel === 'Fib -.618' ? fib(sc.hi, sc.lo, -0.618, direction) : obstacle;
        target = math.round_to_mintick(target, MINTICK) as number;
        // validRisk()
        const minimum = MINTICK * (1 - 1e-8);
        let riskOk = !na(entry) && !na(stop) && !na(target) && (direction === 1
          ? ge(entry - stop, minimum) && ge(target - entry, minimum) : ge(stop - entry, minimum) && ge(entry - target, minimum));
        riskOk = riskOk && (le(entry, 0) || (gt(stop, 0) && gt(target, 0)));
        const risk = Math.abs(entry - stop);
        const room = gt(risk, 0) && !na(obstacle) ? Math.abs(obstacle - entry) / risk : NaN;
        const roomOk = !cfg.requireRoom || (!na(room) && ge(room, cfg.minimumRoom));
        sc.entry = entry;
        sc.stop = stop;
        sc.target = target;
        sc.obstacle = obstacle;
        sc.rr = riskOk ? Math.abs(target - entry) / risk : NaN;
        sc.room = room;
        blockReason = i <= sc.born ? 'New zone: wait next bar' : !sc.touched ? 'No zone retest' : !trendOk ? 'Structure conflict'
          : conflict ? 'Directional conflict' : !locationOk ? 'Location confirmation missing'
            : !anyTrigger ? 'Waiting for sweep / engulf / CHoCH retest' : !cooled ? `Cooldown: ${cfg.cooldown - (i - lastSignalBar)}`
              : !htfOk ? 'HTF disagrees / unavailable' : !riskOk ? 'Invalid risk / target' : !roomOk ? 'Insufficient / unknown room' : 'Confirmed';
        if (i > sc.born && sc.touched && trendOk && !conflict && locationOk && anyTrigger && cooled && htfOk && riskOk && roomOk) {
          sc.state = 3;
          sc.signalBar = i;
          sc.trigger = (sweepTrigger ? 'sweep' : '') + (engulfTrigger ? (sweepTrigger ? '+engulf' : 'engulf') : '')
            + (retestTrigger ? (sweepTrigger || engulfTrigger ? '+choch_retest' : 'choch_retest') : '');
          lastSignalBar = i;
          lastSignal = sc;
          totalConfirmed += 1;
          firstObserved = Number.isNaN(firstObserved) ? time : firstObserved;
          confirmedBuy = direction === 1;
          confirmedSell = direction === -1;
        }
        sc.reason = blockReason;
      }
      if (structureConflict) blockReason = 'Crossed structure range';
      longScore = Math.min(100, ((longWeight + (bias === 1 ? 1 : 0) + (cfg.sweepBonus && sweepLow ? 2 : 0) + (bullEngulf ? 1 : 0)) / 6.5) * 100);
      shortScore = Math.min(100, ((shortWeight + (bias === -1 ? 1 : 0) + (cfg.sweepBonus && sweepHigh ? 2 : 0) + (bearEngulf ? 1 : 0)) / 6.5) * 100);
      if (review && cfg.showEngulf && ready && (bullEngulf || bearEngulf)) {
        mark(time, bullEngulf ? low : high, bullEngulf ? '▲' : '▼', bullEngulf ? -1 : 1, bullEngulf ? bullColor : bearColor,
          'Pattern, not a standalone entry');
      }
    }
    prevInSession = inSession;

    // Plots and BUY / SELL marks
    const t = bar.time;
    if (cfg.showSignals && confirmedBuy) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: bullColor, text: 'BUY', textColor: '#FFFFFF', size: 'small' });
    }
    if (cfg.showSignals && confirmedSell) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: bearColor, text: 'SELL', textColor: '#FFFFFF', size: 'small' });
    }
    plot0.push({ time: t, value: confirmedBuy ? 1 : confirmedSell ? -1 : 0 });
    plot1.push({ time: t, value: bias });
    plot2.push({ time: t, value: longScore });
    plot3.push({ time: t, value: shortScore });
    plot4.push({ time: t, value: scenario !== null ? scenario.state : NaN });
    plot5.push({ time: t, value: cfg.showDay && dayValid ? prevDayH[i] : NaN, color: dayHighColor });
    plot6.push({ time: t, value: cfg.showDay && dayValid ? prevDayL[i] : NaN, color: dayLowColor });
    plot7.push({ time: t, value: cfg.showSession && isIntraday ? previousSessionH : NaN, color: sessionColor });
    plot8.push({ time: t, value: cfg.showSession && isIntraday ? previousSessionL : NaN, color: sessionColor });

    // Grid, liquidity map, risk levels and tables: the last bar only
    if (i !== n - 1) continue;
    const drawLeg = { ...leg };
    if (adaptive && !confirmed && drawLeg.live) {
      if (drawLeg.direction === 1 && gt(high, drawLeg.hi)) {
        drawLeg.hi = high;
        drawLeg.endTime = time;
      }
      if (drawLeg.direction === -1 && lt(low, drawLeg.lo)) {
        drawLeg.lo = low;
        drawLeg.endTime = time;
      }
      drawLeg.valid = !na(drawLeg.hi) && !na(drawLeg.lo) && gt(drawLeg.hi, drawLeg.lo);
    }
    const rightEdge = barTime(bars, i + cfg.extendBars);
    const visible = [cfg.show236, cfg.show382, cfg.show500, cfg.show618, cfg.show786, cfg.showT50, cfg.showT618];
    const legState = adaptive ? (drawLeg.live ? ' · ADAPT LIVE' : ' · ADAPT PIVOT') : drawLeg.live ? ' · LIVE' : ' · LOCK';
    const fibLevel = (ratio: number) => (drawLeg.valid ? fib(drawLeg.hi, drawLeg.lo, ratio, drawLeg.direction) : NaN);
    let nearestName = '—';
    let nearestDistance = NaN;

    // Anchor line of the leg (time coordinates)
    if (cfg.showFib && drawLeg.valid) {
      lines.push({
        time1: drawnTime(drawLeg.startTime), price1: drawLeg.direction === 1 ? drawLeg.lo : drawLeg.hi, time2: drawnTime(drawLeg.endTime),
        price2: drawLeg.direction === 1 ? drawLeg.hi : drawLeg.lo, color: String(color.new(fibColor, 60)), style: 'dotted',
      });
    }
    for (let k = 0; k <= 6; k++) {
      const ratio = RATIOS[k];
      const level = fibLevel(ratio);
      const draw = cfg.showFib && drawLeg.valid && visible[k];
      const levelColor = k >= 5 ? (drawLeg.direction === 1 ? bullColor : bearColor) : fibColor;
      const fade = k === 0 || k === 5 ? 40 : k === 1 || k === 4 ? 30 : k === 2 ? 20 : k === 3 ? 10 : 0;
      if (draw) {
        lines.push({
          time1: t, price1: level, time2: rightEdge, price2: level, color: String(color.new(levelColor, fade)),
          style: k === 3 ? 'solid' : k === 2 || k === 6 ? 'dashed' : 'dotted', width: k === 2 || k === 3 || k === 6 ? 2 : 1,
        });
        labels.push({
          time: rightEdge, price: level,
          text: k === 6 ? (drawLeg.direction === 1 ? 'Target ↑' : 'Target ↓') : k === 5 ? (drawLeg.direction === 1 ? '-0.5 ↑' : '-0.5 ↓') : str.tostring(ratio, '0.000'),
          style: 'label_left', color: String(color.new(fibColor, 100)),
          textColor: String(color.new(levelColor, k === 0 ? 20 : k === 1 || k === 4 ? 10 : k === 5 ? 40 : 0)), size: k === 3 || k === 6 ? 'small' : 'tiny',
          tooltip: `Fib ${str.tostring(ratio)}: ${px(level)}${k >= 5 ? ' · grid projection, not signal target' : ''}${legState}`,
        });
        if (na(nearestDistance) || lt(Math.abs(close - level), nearestDistance)) {
          nearestDistance = Math.abs(close - level);
          nearestName = str.tostring(ratio, '0.000');
        }
      }
    }
    // Zone of the grid (.5 to .786) and target zone (-.5 to -.618)
    if (cfg.showFib && drawLeg.valid) {
      const gzA = fibLevel(0.5);
      const gzB = fibLevel(0.786);
      boxes.push({
        time1: t, price1: Math.max(gzA, gzB), time2: rightEdge, price2: Math.min(gzA, gzB), borderColor: String(color.new('#FFD600', 70)),
        bgColor: String(color.new('#FFD600', 88)), borderWidth: 0,
      });
      if (cfg.showT50 || cfg.showT618) {
        const t50 = fibLevel(-0.5);
        const t618 = fibLevel(-0.618);
        const targetColor = drawLeg.direction === 1 ? bullColor : bearColor;
        boxes.push({
          time1: t, price1: Math.max(t50, t618), time2: rightEdge, price2: Math.min(t50, t618), borderColor: String(color.new(targetColor, 70)),
          bgColor: String(color.new(targetColor, 88)), borderWidth: 0,
        });
      }
    }
    // Scenario zone and risk levels
    const activeScenario = cfg.showRisk && scenario !== null && scenario.state <= 3 ? scenario : null;
    if (activeScenario !== null) {
      if (!na(activeScenario.zoneHi) && !na(activeScenario.zoneLo)) {
        boxes.push({
          time1: t, price1: activeScenario.zoneHi, time2: rightEdge, price2: activeScenario.zoneLo, borderColor: zoneColor,
          bgColor: String(color.new(zoneColor, 92)),
        });
      }
      const riskEdge = barTime(bars, i + cfg.extendBars + 5);
      const riskPrices = [activeScenario.entry, activeScenario.invalid, activeScenario.stop, activeScenario.target, activeScenario.obstacle];
      ['Model entry', 'Structure invalidation', 'Stop', 'Target', 'Obstacle'].forEach((name, k) => {
        const value = riskPrices[k];
        if (na(value)) return;
        const delta = !na(activeScenario.entry) ? Math.abs(value - activeScenario.entry) : NaN;
        let riskTip = `${name} · ${px(value)}`;
        if (!na(delta)) {
          riskTip += `\nFrom entry: ${px(delta)} · ${str.tostring(delta / MINTICK, '0')} ticks`
            + (gt(activeScenario.referenceAtr, 0) ? ` · ${str.tostring(delta / activeScenario.referenceAtr, '0.00')} ATR` : '');
        }
        lines.push({ time1: t, price1: value, time2: riskEdge, price2: value, color: zoneColor });
        labels.push({
          time: riskEdge, price: value, text: `${name} ${px(value)}`, style: 'label_left', color: String(color.new(zoneColor, 100)),
          textColor: zoneColor, size: 'tiny', tooltip: riskTip,
        });
      });
    }
    // Liquidity map: the nearest active zones of each side
    const selected: boolean[] = new Array(liquidity.length).fill(false);
    for (let slot = 0; slot <= 5; slot++) {
      const side = slot < 3 ? 1 : -1;
      let candidate = -1;
      let distance = NaN;
      if (cfg.showLiquidity && slot % 3 < cfg.zonesPerSide) {
        liquidity.forEach((z, k) => {
          const price = side === 1 ? z.hi : z.lo;
          if (z.state === 0 && z.side === side && (cfg.showSingles || z.kind === 'EQH' || z.kind === 'EQL') && !selected[k]) {
            const d = Math.abs(close - price);
            if (na(distance) || lt(d, distance)) {
              candidate = k;
              distance = d;
            }
          }
        });
      }
      if (candidate < 0) continue;
      const z = liquidity[candidate];
      selected[candidate] = true;
      const level = side === 1 ? z.hi : z.lo;
      lines.push({ time1: t, price1: level, time2: barTime(bars, i + cfg.eqExtendBars), price2: level, color: liqColor, style: 'dashed' });
      labels.push({
        time: t, price: level, text: z.kind, style: side === 1 ? 'label_down' : 'label_up', color: String(color.new(liqColor, 100)),
        textColor: liqColor, size: 'tiny', tooltip: 'Active price zone; resting order size is unknown',
      });
    }
    // Structure history
    for (const ln of historyLines) {
      lines.push({ time1: drawnTime(ln.x1), price1: ln.y1, time2: drawnTime(ln.x2), price2: ln.y2, color: ln.color, style: ln.style, width: ln.width });
    }
    for (const lb of historyLabels) {
      labels.push({
        time: drawnTime(lb.time), price: lb.price, text: lb.text, style: lb.style, color: lb.color, textColor: lb.textColor, size: lb.size,
        tooltip: lb.tooltip,
      });
    }

    // Panel
    const panelCells: TableCellData[] = [];
    const row = (index: number, name: string, value: string, col: string, tooltip?: string) => {
      const bg = index % 2 === 0 ? panelAlt : panelBg;
      panelCells.push({ column: 0, row: index, text: name, textColor: textMuted, textSize, bgColor: bg });
      panelCells.push({ column: 1, row: index, text: value, textColor: col, textSize, bgColor: bg, ...(tooltip !== undefined ? { tooltip } : {}) });
    };
    const formatTime = (tm: number, pattern: string) => str.format_time(tm, pattern, TEXT_TZ);
    if (cfg.showPanel && cfg.dashboardMode === 'Detailed') {
      panelCells.push({
        column: 0, row: 0, text: `FSE ${VERSION} · ${confirmed ? 'Closed' : 'Last closed state'}`, textColor: '#FFFFFF', textSize: 'small',
        bgColor: headerBg, textHAlign: 'center',
      });
      const hb = htfBias[i];
      const htfText = !cfg.useHtf ? 'OFF' : !htfValid ? 'select higher TF'
        : dirText(hb) + (!Number.isNaN(hb) && hb !== 0 && hb !== bias ? ' ≠' : '');
      row(1, 'Structure / HTF', `${dirText(bias)} / ${htfText}`, bias === 1 ? bullColor : bias === -1 ? bearColor : textColor);
      row(2, 'Scenario', scenario === null ? '—' : `${dirText(scenario.direction)} · ${stateText(scenario.state)}`, zoneColor);
      row(3, 'Reason / waiting', scenario !== null && scenario.state >= 3 ? scenario.reason : blockReason, textColor);
      row(4, 'Zone · age', scenario === null ? '—' : `${px(scenario.zoneLo)}–${px(scenario.zoneHi)} · ${i - scenario.born}b`, zoneColor);
      row(5, 'Evidence', `L ${str.tostring(longScore, '0')} / S ${str.tostring(shortScore, '0')} · points, not %`, textColor);
      row(6, 'Independent Fib', `L ${str.tostring(longWeight, '0.0')} / S ${str.tostring(shortWeight, '0.0')} · min ${str.tostring(cfg.minFibWeight)}`, fibColor);
      row(7, 'Entry / stop / target', scenario === null ? '—' : `${px(scenario.entry)} / ${px(scenario.stop)} / ${px(scenario.target)}`, textColor);
      row(8, 'Room / target R', scenario === null ? '—' : `${rrText(scenario.room)} / ${rrText(scenario.rr)}`,
        scenario !== null && !na(scenario.room) && lt(scenario.room, cfg.minimumRoom) ? bearColor : textColor);
      const mid = drawLeg.valid ? (drawLeg.hi + drawLeg.lo) / 2 : NaN;
      const zoneText = na(mid) ? '—' : gt(close, drawLeg.hi) ? 'Above range' : lt(close, drawLeg.lo) ? 'Below range'
        : gt(close, mid) ? 'Premium' : lt(close, mid) ? 'Discount' : 'Equilibrium';
      row(9, 'Live price / Fib', zoneText + legState, fibColor);
      row(10, 'Nearest visible Fib', nearestName + (!na(nearestDistance) && gt(atr[i], 0) ? ` · ${str.tostring(nearestDistance / atr[i], '0.00')} ATR` : ''), fibColor);
      const regime = Number.isNaN(lastFlip) ? 'Undetermined' : i - lastFlip < swingLen * 2 ? 'Transition' : 'Directional structure';
      row(11, 'Regime / bar range', `${regime} · ${str.tostring(candleAtr, '0.0')} ATR${ge(candleAtr, cfg.wideBarAtr) ? ' !' : ''}`,
        ge(candleAtr, cfg.wideBarAtr) ? zoneColor : textColor);
      row(12, 'Last confirmed signal', lastSignal === null ? '—'
        : `${dirText(lastSignal.direction)} · ${lastSignal.trigger} · ${i - lastSignal.signalBar}b · ${stateText(lastSignal.state)}`, textColor);
      row(13, 'Last event', lastEvent + (!Number.isNaN(lastEventBar) ? ` · ${i - lastEventBar}b` : ''), textColor);
      row(14, 'HTF closed', cfg.useHtf && htfValid && !Number.isNaN(htfCloseTime[i]) ? formatTime(htfCloseTime[i], 'dd.MM HH:mm') : '—', textColor);
      row(15, 'Session', !cfg.useSession ? 'OFF' : !isIntraday ? 'Intraday only'
        : (na(previousSessionH) ? 'No complete session · ' : inSession ? 'Inside · ' : 'Outside · ') + cfg.sessionTz, textColor);
      row(16, 'Observations · not trades', `N=${totalConfirmed} T=${targetCount} X=${invalidCount} ?=${ambiguousCount} E=${expiredCount}`, textColor);
      row(17, 'Observations since', Number.isNaN(firstObserved) ? '—' : formatTime(firstObserved, 'dd.MM.yyyy'), textColor);
    }
    if (cfg.showPanel && cfg.dashboardMode === 'Classic') {
      panelCells.push({ column: 0, row: 0, text: 'FibStruct', textColor: '#FFFFFF', bgColor: headerBg, textSize: 'small', textHAlign: 'center' });
      row(1, 'Trend', bias > 0 ? 'Bullish' : bias < 0 ? 'Bearish' : 'Neutral', bias > 0 ? bullColor : bias < 0 ? bearColor : textMuted);
      row(2, 'Fib Dir', !drawLeg.valid ? '—' : drawLeg.direction > 0 ? 'Long ↑' : 'Short ↓', !drawLeg.valid ? textMuted : drawLeg.direction > 0 ? bullColor : bearColor);
      row(3, 'Signal', confirmedBuy ? 'BUY' : confirmedSell ? 'SELL' : '—', confirmedBuy ? bullColor : confirmedSell ? bearColor : textMuted);
      const evidenceScore = Math.max(longScore, shortScore);
      const evidenceName = ge(evidenceScore, 60) ? 'Strong' : ge(evidenceScore, 30) ? 'Moderate' : gt(evidenceScore, 0) ? 'Weak' : 'None';
      row(4, 'Confluence', `${evidenceName} (${str.tostring(evidenceScore, '#')})`,
        ge(evidenceScore, 60) ? bullColor : ge(evidenceScore, 30) ? zoneColor : gt(evidenceScore, 0) ? String(color.new(zoneColor, 50)) : textMuted,
        `Evidence points, not probability. L ${str.tostring(longScore, '#')} / S ${str.tostring(shortScore, '#')}`);
      const inRange = drawLeg.valid && ge(close, drawLeg.lo) && le(close, drawLeg.hi);
      const premium = inRange && gt(close, (drawLeg.hi + drawLeg.lo) / 2);
      const discount = inRange && lt(close, (drawLeg.hi + drawLeg.lo) / 2);
      row(5, 'Zone', premium ? 'Premium' : discount ? 'Discount' : '—', premium ? bearColor : discount ? bullColor : textMuted);
      const eqh = liquidity.some((z) => z.state === 0 && z.kind === 'EQH');
      const eql = liquidity.some((z) => z.state === 0 && z.kind === 'EQL');
      row(6, 'Liquidity', eqh && eql ? 'EQH+EQL' : eqh ? 'EQH ↑' : eql ? 'EQL ↓' : '—', eqh || eql ? liqColor : textMuted);
      row(7, 'Fib .618', drawLeg.valid ? px(fibLevel(0.618)) : '—', fibColor);
      row(8, 'ATR(14)', px(atr[i]), textColor);
      const distAtr = gt(atr[i], 0) ? nearestDistance / atr[i] : NaN;
      row(9, 'Near Fib', na(distAtr) ? '—' : `${nearestName} (${str.tostring(distAtr, '0.00')} ATR)`,
        na(distAtr) ? textMuted : le(distAtr, cfg.confAtr) ? zoneColor : fibColor);
      row(10, 'TF', chartTf, textColor);
      row(11, 'Version', `v${VERSION}`, textMuted);
    }
    if (panelCells.length > 0) {
      tables.push({
        position: positionValue, columns: 2, rows: cfg.dashboardMode === 'Classic' ? 12 : 18, bgColor: panelBg, frameColor: panelBorder,
        frameWidth: 1, borderColor: panelBorder, borderWidth: 1, cells: panelCells, merges: [{ startColumn: 0, startRow: 0, endColumn: 1, endRow: 0 }],
      });
    }
    // Last scenario outcomes
    if (cfg.showHistory) {
      const cells: TableCellData[] = [];
      ['Scenario', 'Trigger', 'Observation outcome'].forEach((text, col) => cells.push({ column: col, row: 0, text, textColor, textSize: 'auto' }));
      history.forEach((s, k) => {
        cells.push({ column: 0, row: k + 1, text: `${dirText(s.direction)} ${formatTime(s.stamp, 'dd.MM HH:mm')}`, textColor, textSize: 'tiny' });
        cells.push({ column: 1, row: k + 1, text: s.trigger === '' ? 'No signal' : s.trigger, textColor, textSize: 'tiny' });
        cells.push({ column: 2, row: k + 1, text: stateText(s.state), textColor, textSize: 'tiny' });
      });
      tables.push({ position: 'middle_left', columns: 3, rows: 10, bgColor: panelBg, borderColor: panelBorder, borderWidth: 1, cells });
    }
    const transparentBlack = String(color.new(color.black, 100));
    tables.push({
      position: 'bottom_center', columns: 1, rows: 1, bgColor: transparentBlack,
      cells: [{
        column: 0, row: 0, text: cfg.showWatermark ? 'WillyAlgoTrader' : '', textColor: watermarkColor, textSize: 'normal', textHAlign: 'center',
        bgColor: transparentBlack,
      }],
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5, plot6, plot7, plot8 },
    markers,
    lines,
    labels,
    boxes,
    tables,
  };
}

export const FibonacciStructureEngine = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
