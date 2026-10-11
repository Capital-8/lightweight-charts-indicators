/**
 * AMD Po3 with Live Edge Stats
 *
 * A state machine that follows the "power of three" cycle: accumulation, manipulation, distribution.
 * - Accumulation: when the 20-bar high / low channel is narrow (its width is in the lowest percentiles of the last
 *   bars) a range is anchored on the last bars, with the oldest bars dropped while they widen it too much, and its
 *   boundaries taken from the confirmed pivots inside it ("pivot") or from the window ("absolute").
 * - Manipulation: a bar that goes beyond a boundary by more than the tolerance is a sweep; the close has to come
 *   back inside the range within a few bars, else the cycle ends as a breakout.
 * - Distribution: on the return bar a reference trade opens against the sweep: entry at the close, stop beyond the
 *   sweep extreme with an ATR buffer, target at a Fibonacci extension of the manipulation leg. The cycle ends on the
 *   target, the stop, both (counted as a stop) or a timeout.
 * Boxes show the three phases, labels the events (M, D, outcome, EXPIRED, BREAKOUT ...), lines and labels the entry,
 * stop and target. Only the last cycles keep their colours; older ones are dimmed or removed. A dashboard gives the
 * phase, the compression, the levels of the open trade and the statistics of the closed cycles.
 * Optional filters: killzone sessions (in the time zone given as an input) and a higher-timeframe bias (close of the
 * last closed bar of that timeframe against its EMA 50).
 *
 * Chart context (optional third argument of calculate): the symbol tick (`mintick`) rounds the stop and the target
 * and formats the prices; the chart background (`backgroundColor`) chooses the dark or light palette of the theme
 * "Auto"; `timeframe` is shown in the dashboard; `lastBarConfirmed` = false leaves the state machine out of the last
 * bar (a bar that is still open); with the time zone and the session of the symbol, the periods of the bias timeframe
 * and the bar close times of the "24 Hours" / "30 Days" statistics follow the exchange calendar. Without a context:
 * tick 0.01, dark palette, timeframe from the bar spacing, last bar closed, UTC calendar and bars.
 * The bars of the bias timeframe are built from the chart bars, so its EMA starts at the first chart bar. A bias
 * timeframe below the chart timeframe is an error, as in the original. The alerts of the original have no output.
 * At most 500 boxes, lines and labels are kept in the original; the trimming of old cycles keeps the counts far below.
 *
 * Reference: "AMD Po3 with Live Edge Stats [WillyAlgoTrader]" by WillyAlgoTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, str, math as pineMath, time as pineTime, timeframe, barInterval,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { executeScript, time_close as scriptTimeClose } from 'oakscriptjs/script';
import type {
  BgColorData, BoxData, LabelData, LabelStyle, LineDrawingData, PineSize, TableCellData, TableData, TableMergeData,
  TablePosition,
} from '../types';
import { barTime } from '../bar-time';
import { periodStarts, chartTimeframe, securityBars, hasCalendar } from '../anchor-period';
import { backgroundColorOf, lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';

type LineStyleName = 'Solid' | 'Dashed' | 'Dotted';
type FontSize = 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';

export interface AmdPo3WithLiveEdgeStatsInputs {
  /** Minimum length of the accumulation window, in bars */
  minRangeBars: number;
  /** Ranges older than this expire */
  maxRangeBars: number;
  /** The channel width must be in the lowest N % of its distribution */
  compressionPct: number;
  /** Window of the width and true range percentiles, in bars */
  statWindow: number;
  /** Fraction of the range width that the boundaries may move without a reset */
  rangeTolerance: number;
  /** Minimum range width, in % of the price */
  minRangeWidthP: number;
  boundaryMode: 'pivot' | 'absolute';
  /** The oldest window bars are dropped when that narrows the range by more than N % (0 = off) */
  trimTailPct: number;
  /** The close must return inside the range within this number of bars */
  sweepReturnBars: number;
  /** A sweep needs two confirmed pivots near the boundary and near each other */
  requireLiquidity: boolean;
  /** Maximum sweep depth as a true range percentile (100 = off) */
  sweepDepthPct: number;
  /** A direction rejected by the bias filter gives the range a second sweep */
  allowRearm: boolean;
  distTimeoutBars: number;
  /** Stop buffer beyond the sweep, in ATR */
  stopBufAtr: number;
  /** Fibonacci extension of the manipulation leg used as the target */
  fibExt: number;
  showLevels: boolean;
  showLevelLabels: boolean;
  showPctOnLabels: boolean;
  entryLineStyle: LineStyleName;
  stopLineStyle: LineStyleName;
  tgtLineStyle: LineStyleName;
  useKillzones: boolean;
  /** Time zone of the killzone sessions */
  kzTz: string;
  kzLdn: string;
  kzNy: string;
  useHtfBias: boolean;
  htfTf: string;
  theme: 'Auto' | 'Dark' | 'Light';
  showBoxes: boolean;
  showLabels: boolean;
  signalFontSize: FontSize;
  labelFontSize: FontSize;
  showLastCycles: number;
  minSampleN: number;
  historyStyle: 'hide' | 'outline';
  showSessions: boolean;
  showWatermark: boolean;
  showDash: boolean;
  dashPosStr: 'Top Left' | 'Top Right' | 'Bottom Left' | 'Bottom Right' | 'Middle Right';
  dashFontSize: 'Small' | 'Normal' | 'Large' | 'Huge';
  showMarketSec: boolean;
  showCycleSec: boolean;
  showStatsSec: boolean;
  statsPeriod: '24 Hours' | '30 Days' | 'All-Time';
  /** Alert inputs of the original (alerts have no output here) */
  alertsOn: boolean;
  webhook: boolean;
  sweepAlert: boolean;
  distAlert: boolean;
  outcomeAlert: boolean;
  cancelAlert: boolean;
  colAcc: string;
  colMan: string;
  colStop: string;
  colTgt: string;
  colDst: string;
}

export const defaultInputs: AmdPo3WithLiveEdgeStatsInputs = {
  minRangeBars: 12,
  maxRangeBars: 96,
  compressionPct: 25,
  statWindow: 200,
  rangeTolerance: 0.10,
  minRangeWidthP: 0.15,
  boundaryMode: 'pivot',
  trimTailPct: 15,
  sweepReturnBars: 6,
  requireLiquidity: false,
  sweepDepthPct: 100,
  allowRearm: true,
  distTimeoutBars: 64,
  stopBufAtr: 0.4,
  fibExt: 1.5,
  showLevels: true,
  showLevelLabels: true,
  showPctOnLabels: true,
  entryLineStyle: 'Dotted',
  stopLineStyle: 'Solid',
  tgtLineStyle: 'Dashed',
  useKillzones: false,
  kzTz: 'UTC',
  kzLdn: '0700-1000',
  kzNy: '1330-1600',
  useHtfBias: false,
  htfTf: '240',
  theme: 'Auto',
  showBoxes: true,
  showLabels: true,
  signalFontSize: 'Small',
  labelFontSize: 'Small',
  showLastCycles: 3,
  minSampleN: 10,
  historyStyle: 'outline',
  showSessions: false,
  showWatermark: true,
  showDash: true,
  dashPosStr: 'Top Right',
  dashFontSize: 'Small',
  showMarketSec: true,
  showCycleSec: true,
  showStatsSec: true,
  statsPeriod: 'All-Time',
  alertsOn: true,
  webhook: false,
  sweepAlert: true,
  distAlert: true,
  outcomeAlert: true,
  cancelAlert: false,
  colAcc: 'rgba(91, 127, 166, 0.2)',
  colMan: 'rgba(226, 150, 58, 0.45)',
  colStop: '#c94f4f',
  colTgt: '#3aa66b',
  colDst: 'rgba(58, 166, 107, 0.18)',
};

const GRP_RANGE = '⚙️ Range (Accumulation)';
const GRP_SWEEP = '🌀 Manipulation (Sweep)';
const GRP_DIST = '🚀 Distribution';
const GRP_MODEL = '🎯 Reference Model & Stats';
const GRP_FILTER = '🔍 Filters';
const GRP_VISUAL = '🎨 Visual';
const GRP_DASH = '📊 Dashboard';
const GRP_ALERT = '🔔 Alerts';
const GRP_COLORS = '🎨 Colors';
const STYLES: LineStyleName[] = ['Solid', 'Dashed', 'Dotted'];
const SIZES: FontSize[] = ['Tiny', 'Small', 'Normal', 'Large', 'Huge'];
const d = defaultInputs;

export const inputConfig: InputConfig[] = [
  {
    id: 'minRangeBars', type: 'int', title: 'Min range maturity, bars', defval: d.minRangeBars, min: 8, max: 40, group: GRP_RANGE,
    tooltip: 'Minimum RETROSPECTIVE length of the accumulation window\n(the anchoring window already counts toward it). A breach\nbefore this age = reset, not a sweep.\n• Lower = more cycles, more noise\n• Higher = more reliable, fewer cycles',
  },
  {
    id: 'maxRangeBars', type: 'int', title: 'Max range age, bars', defval: d.maxRangeBars, min: 48, max: 192, group: GRP_RANGE,
    tooltip: 'Time budget for the sweep. Ranges older than this expire.\nRe-arm gets a fresh budget from the re-arm bar',
  },
  {
    id: 'compressionPct', type: 'int', title: 'Compression threshold, percentile', defval: d.compressionPct, min: 10, max: 50, group: GRP_RANGE,
    tooltip: 'Donchian(20) width must sit in the bottom N% of its\ndistribution over the stats window.\n• Lower = only strong compression, fewer cycles\n• Higher = looser criterion',
  },
  {
    id: 'statWindow', type: 'int', title: 'Distribution window, bars', defval: d.statWindow, min: 100, max: 500, group: GRP_RANGE,
    tooltip: 'Window for width and True Range percentiles.\nLarger = more stable thresholds, longer warm-up',
  },
  {
    id: 'rangeTolerance', type: 'float', title: 'Boundary expansion tolerance', defval: d.rangeTolerance, min: 0.0, max: 0.30, step: 0.01, group: GRP_RANGE,
    tooltip: "Fraction of range width the boundaries may 'breathe'\nwithout a reset. A breach beyond the tolerance is a\nsweep candidate",
  },
  {
    id: 'minRangeWidthP', type: 'float', title: 'Min range width, % of price', defval: d.minRangeWidthP, min: 0.05, max: 1.0, step: 0.05, group: GRP_RANGE,
    tooltip: 'Filters out microscopic ranges where stop and target\nare indistinguishable from the spread. In % of price',
  },
  {
    id: 'boundaryMode', type: 'string', title: 'Boundary method', defval: d.boundaryMode, options: ['pivot', 'absolute'], group: GRP_RANGE,
    tooltip: '• pivot: boundaries from confirmed pivots (cleaner)\n• absolute: raw window high/low (more aggressive)',
  },
  {
    id: 'trimTailPct', type: 'int', title: 'Impulse-tail trim, % of width', defval: d.trimTailPct, min: 0, max: 40, group: GRP_RANGE,
    tooltip: 'When anchoring the range, the oldest window bars are dropped if removing them shrinks the width by more than N% — so the tail of the preceding impulse leg does not contaminate the boundaries.\n0 = off (v1.1.1 behavior)',
  },
  {
    id: 'sweepReturnBars', type: 'int', title: 'Max bars until return', defval: d.sweepReturnBars, min: 2, max: 16, group: GRP_SWEEP,
    tooltip: 'Close must return inside the range within this many bars,\notherwise the move is a BREAKOUT.\nThe key manipulation criterion is the RETURN',
  },
  {
    id: 'requireLiquidity', type: 'bool', title: 'Require liquidity beyond boundary (EQH/EQL)', defval: d.requireLiquidity, group: GRP_SWEEP,
    tooltip: 'Sweep counts only if a genuine equal-highs/lows cluster sat\nnear the boundary: min 2 confirmed pivots within 0.1×width\nof the boundary AND of each other (96-bar lookback)',
  },
  {
    id: 'sweepDepthPct', type: 'int', title: 'Soft depth cap, percentile (100 = off)', defval: d.sweepDepthPct, min: 80, max: 100, group: GRP_SWEEP,
    tooltip: 'Excursion beyond the boundary no deeper than the N-th\nTrue Range percentile (frozen at the breach bar) — the cap\nis re-checked against the CUMULATIVE extreme on every bar\nof the sweep. Violations reject as TOO DEEP',
  },
  {
    id: 'allowRearm', type: 'bool', title: 'Allow re-arm (double sweep)', defval: d.allowRearm, group: GRP_SWEEP,
    tooltip: 'If the HTF-bias filter rejects the projected direction at\nmanipulation confirmation, the range gets a second chance:\nwaiting for a sweep of the opposite side.\nInert while the HTF-bias filter is off (v2.0.0)',
  },
  {
    id: 'distTimeoutBars', type: 'int', title: 'Distribution timeout, bars', defval: d.distTimeoutBars, min: 24, max: 128, group: GRP_DIST,
    tooltip: 'If neither the target nor the stop is reached within\nN bars from the open (the M/D bar), the cycle closes as\nTIMEOUT with the actual R from the close',
  },
  {
    id: 'stopBufAtr', type: 'float', title: 'Stop buffer past sweep, × ATR anchor', defval: d.stopBufAtr, min: 0.0, max: 1.5, step: 0.05, group: GRP_MODEL,
    tooltip: 'The reference stop sits BEYOND the swept liquidity, not at its tip — a retest of the wick does not knock the model out.\nRisk and R are honestly computed from the buffered stop.\n0 = stop exactly at the extreme (v1.0 behavior)',
  },
  {
    id: 'fibExt', type: 'float', title: 'Fib extension target', defval: d.fibExt, min: 1.0, max: 3.0, step: 0.001, group: GRP_MODEL,
    tooltip: 'Fibonacci extension of the manipulation leg.\nGrid anchors: 0 = manipulation extreme (sweep tip),\n1 = the OPPOSITE accumulation boundary.\nTarget = this level. Default 1.5; common: 1.272 / 1.618 / 2.0.\nNOT a take-profit — the expected distribution reach.\nWalk-forward stats anchor to this level and the stop',
  },
  {
    id: 'showLevels', type: 'bool', title: 'Show Entry / Stop / Target lines', defval: d.showLevels, group: GRP_MODEL,
    tooltip: 'Reference entry, stop and distribution-target lines\non the active distribution',
  },
  {
    id: 'showLevelLabels', type: 'bool', title: 'Show level price labels', defval: d.showLevelLabels, group: GRP_MODEL,
    tooltip: 'Price labels to the right of the lines — the exact levels\nare visible at a glance',
  },
  {
    id: 'showPctOnLabels', type: 'bool', title: 'Show % Distance on Labels', defval: d.showPctOnLabels, group: GRP_MODEL,
    tooltip: "Append % distance from the reference entry to the Stop and\nTarget labels, e.g. 'Target 1.2300 (+0.86%)'",
  },
  {
    id: 'entryLineStyle', type: 'string', title: 'Entry Line Style', defval: d.entryLineStyle, options: STYLES, group: GRP_MODEL,
    tooltip: 'Entry is a reference, not an action level — keep it subtle',
  },
  {
    id: 'stopLineStyle', type: 'string', title: 'Stop Line Style', defval: d.stopLineStyle, options: STYLES, group: GRP_MODEL,
    tooltip: 'The stop is an action level — solid and prominent by default',
  },
  {
    id: 'tgtLineStyle', type: 'string', title: 'Target Line Style', defval: d.tgtLineStyle, options: STYLES, group: GRP_MODEL,
    tooltip: 'Style for the distribution target. On hit the line turns\nsolid teal',
  },
  {
    id: 'useKillzones', type: 'bool', title: 'Killzones (sweep only in sessions)', defval: d.useKillzones, group: GRP_FILTER,
    tooltip: 'Sweeps count only inside the London / New York killzones.\nOutside the sessions a breach closing outside kills the\nrange',
  },
  {
    id: 'kzTz', type: 'string', title: 'Killzone timezone', defval: d.kzTz, group: GRP_FILTER,
    tooltip: 'Timezone the killzone sessions are defined in.\nExamples: UTC, America/New_York, Europe/London',
  },
  {
    id: 'kzLdn', type: 'session', title: 'London killzone', defval: d.kzLdn, group: GRP_FILTER,
    tooltip: 'London killzone session in the selected timezone',
  },
  {
    id: 'kzNy', type: 'session', title: 'New York killzone', defval: d.kzNy, group: GRP_FILTER,
    tooltip: 'New York killzone session in the selected timezone',
  },
  {
    id: 'useHtfBias', type: 'bool', title: 'HTF bias (EMA50)', defval: d.useHtfBias, group: GRP_FILTER,
    tooltip: 'The reference trade opens only in the direction of the\nhigher timeframe trend (HTF close vs EMA50). A rejected\nprojection re-arms the range (if allowed) or fails the cycle',
  },
  {
    id: 'htfTf', type: 'timeframe', title: 'HTF bias timeframe', defval: d.htfTf, group: GRP_FILTER,
    tooltip: 'Higher timeframe for the bias filter.\nData is fetched repaint-free ([1] + lookahead_on)',
  },
  {
    id: 'theme', type: 'string', title: 'Theme', defval: d.theme, options: ['Auto', 'Dark', 'Light'], group: GRP_VISUAL,
    tooltip: 'Chart color theme.\n• Auto: detects from chart background\n• Dark: optimized for dark backgrounds\n• Light: optimized for light/white backgrounds',
  },
  {
    id: 'showBoxes', type: 'bool', title: 'Show cycle boxes', defval: d.showBoxes, group: GRP_VISUAL,
    tooltip: 'Accumulation, sweep and distribution boxes',
  },
  {
    id: 'showLabels', type: 'bool', title: 'Show event labels', defval: d.showLabels, group: GRP_VISUAL,
    tooltip: 'M / D / outcome / EXPIRED / BREAKOUT labels',
  },
  {
    id: 'signalFontSize', type: 'string', title: 'Event Label Size', defval: d.signalFontSize, options: SIZES, group: GRP_VISUAL,
    tooltip: 'Font size for M / D / outcome / EXPIRED / BREAKOUT labels',
  },
  {
    id: 'labelFontSize', type: 'string', title: 'Level Label Font Size', defval: d.labelFontSize, options: SIZES, group: GRP_VISUAL,
    tooltip: 'Font size for Entry / Stop / Target price labels',
  },
  {
    id: 'showLastCycles', type: 'int', title: 'Show last N cycles', defval: d.showLastCycles, min: 1, max: 10, group: GRP_VISUAL,
    tooltip: "Older cycles are dimmed or removed\n(see 'Older cycles')",
  },
  {
    id: 'minSampleN', type: 'int', title: 'Min sample for % and Avg R', defval: d.minSampleN, min: 1, max: 50, group: GRP_VISUAL,
    tooltip: 'Until N closed cycles are collected the dashboard shows raw counters without percentages or average R — percentages on 2-3 cycles create a false impression',
  },
  {
    id: 'historyStyle', type: 'string', title: 'Older cycles', defval: d.historyStyle, options: ['hide', 'outline'], group: GRP_VISUAL,
    tooltip: '• outline: dim fills, lines and labels of older cycles\n• hide: delete them entirely',
  },
  {
    id: 'showSessions', type: 'bool', title: 'Highlight killzones', defval: d.showSessions, group: GRP_VISUAL,
    tooltip: 'Background highlight for bars inside the killzones',
  },
  {
    id: 'showWatermark', type: 'bool', title: 'Show Watermark', defval: d.showWatermark, group: GRP_VISUAL,
    tooltip: "Display 'WillyAlgoTrader' watermark on chart",
  },
  {
    id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: d.showDash, group: GRP_DASH,
    tooltip: 'FSM phase, walk-forward statistics and active reference\nmodel levels',
  },
  {
    id: 'dashPosStr', type: 'string', title: 'Dashboard Position', defval: d.dashPosStr, group: GRP_DASH,
    options: ['Top Left', 'Top Right', 'Bottom Left', 'Bottom Right', 'Middle Right'], tooltip: 'Dashboard placement on the chart',
  },
  {
    id: 'dashFontSize', type: 'string', title: 'Dashboard Font Size', defval: d.dashFontSize, options: ['Small', 'Normal', 'Large', 'Huge'], group: GRP_DASH,
    tooltip: 'Font size for the dashboard table. Section dividers and the\nversion footer render one step smaller to preserve hierarchy',
  },
  {
    id: 'showMarketSec', type: 'bool', title: '  ├ Market section', defval: d.showMarketSec, group: GRP_DASH,
    tooltip: 'Phase / Compression / Range / HTF bias / TF',
  },
  {
    id: 'showCycleSec', type: 'bool', title: '  ├ Cycle section', defval: d.showCycleSec, group: GRP_DASH,
    tooltip: 'Entry / Stop / Target / R:R / Risk % / Age.\nCollapses to one action row when no cycle is live',
  },
  {
    id: 'showStatsSec', type: 'bool', title: '  └ Stats section', defval: d.showStatsSec, group: GRP_DASH,
    tooltip: 'Walk-forward statistics: cycles, target, stop, timeout,\ntarget rate, avg R, form, failed/breakout',
  },
  {
    id: 'statsPeriod', type: 'string', title: 'Stats Period', defval: d.statsPeriod, options: ['24 Hours', '30 Days', 'All-Time'], group: GRP_DASH,
    tooltip: 'Time window for the Stats section:\n• 24 Hours: cycles closed in the last 24h (vs latest bar)\n• 30 Days: cycles closed in the last 30 days\n• All-Time: all cycles on the loaded chart history\nForm strip always shows the last cycles regardless of period.\nPeriod stats live in a rolling 31-day buffer',
  },
  {
    id: 'alertsOn', type: 'bool', title: 'Enable Alerts', defval: d.alertsOn, group: GRP_ALERT,
    tooltip: 'Master switch for all alert() events:\nsweep, manipulation, distribution, cycle outcome',
  },
  {
    id: 'webhook', type: 'bool', title: 'Webhook JSON Format', defval: d.webhook, group: GRP_ALERT,
    tooltip: 'Send alerts in JSON format for webhook integrations\ninstead of the text format',
  },
  {
    id: 'sweepAlert', type: 'bool', title: '  ├ SWEEP events', defval: d.sweepAlert, group: GRP_ALERT,
    tooltip: 'Boundary sweep detected (possible manipulation)',
  },
  {
    id: 'distAlert', type: 'bool', title: '  ├ DIST events', defval: d.distAlert, group: GRP_ALERT,
    tooltip: 'Manipulation confirmed, reference trade opened — the\nworking signal',
  },
  {
    id: 'outcomeAlert', type: 'bool', title: '  ├ OUTCOME events', defval: d.outcomeAlert, group: GRP_ALERT,
    tooltip: 'Cycle closed: target / stop / ambiguous / timeout',
  },
  {
    id: 'cancelAlert', type: 'bool', title: '  └ CANCELED events', defval: d.cancelAlert, group: GRP_ALERT,
    tooltip: 'Lifecycle terminations without a trade: EXPIRED, BREAKOUT,\nTOO DEEP, 2-SIDE, FAILED. For consumers tracking the full\ncycle lifecycle — after SWEEP there may otherwise be\nneither DIST nor OUTCOME',
  },
  { id: 'colAcc', type: 'color', title: 'Accumulation', defval: d.colAcc, group: GRP_COLORS, tooltip: 'Accumulation box fill' },
  { id: 'colMan', type: 'color', title: 'Manipulation', defval: d.colMan, group: GRP_COLORS, tooltip: 'Sweep box and the M label' },
  { id: 'colStop', type: 'color', title: 'Stop', defval: d.colStop, group: GRP_COLORS, tooltip: 'Reference stop line and negative outcomes' },
  { id: 'colTgt', type: 'color', title: 'Target', defval: d.colTgt, group: GRP_COLORS, tooltip: 'Distribution-target line and positive outcomes' },
  { id: 'colDst', type: 'color', title: 'Distribution box', defval: d.colDst, group: GRP_COLORS, tooltip: 'Distribution box fill' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'AMD Po3 with Live Edge Stats [WillyAlgoTrader]',
  shortTitle: 'AMD Po3 Stats',
  overlay: true,
};

const INDICATOR_VERSION = 'v2.4.0';
const LINE_UPDATE_BARS = 5; // forward projection of the level lines
const LABEL_OFFSET_BARS = 1; // label offset past the line end
const FORM_LEN = 10; // form strip length (last N cycles)
const MS_DAY = 86400000;
const STATS_PRUNE_DAYS = 31; // horizon of the timestamped statistics
const COOLDOWN_BARS = 10; // bars between a cycle end and the next range
const RANGE_WIN = 20; // window of the high / low channel and of the range anchoring
const PIVOT_LR = 3; // pivot left / right strength
const PIVOT_CAP = 60; // stored confirmed pivots per side
const EQ_LOOKBACK = 96; // search depth of the equal highs / lows, in bars

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const na = (v: number) => Number.isNaN(v);

const C = (c: string, transp: number) => String(color.new(c, transp));
const GRAY = String(color.gray);

/** f_textOn: dark text on a light background, white on a dark one (the transparency is not counted) */
function textOn(bg: string): string {
  const lum = 0.299 * color.r(bg) + 0.587 * color.g(bg) + 0.114 * color.b(bg);
  return gt(lum, 145) ? String(color.rgb(17, 24, 39)) : String(color.white);
}

const lineStyleOf = (s: LineStyleName): 'solid' | 'dashed' | 'dotted' => (s === 'Dashed' ? 'dashed' : s === 'Dotted' ? 'dotted' : 'solid');
const sizeOf = (s: string): PineSize => (s === 'Tiny' ? 'tiny' : s === 'Normal' ? 'normal' : s === 'Large' ? 'large' : s === 'Huge' ? 'huge' : 'small');
const sizeDownOf = (s: string): PineSize => (s === 'Normal' ? 'small' : s === 'Large' ? 'normal' : s === 'Huge' ? 'large' : 'tiny');

interface BoxObj {
  x1: number; top: number; x2: number; bottom: number;
  border: string; borderStyle: 'solid' | 'dashed' | 'dotted'; bg: string | null; deleted: boolean;
}
interface LineObj { x1: number; y: number; x2: number; color: string; style: 'solid' | 'dashed' | 'dotted'; width: number; deleted: boolean }
interface LabelObj {
  x: number; y: number; text: string; style: LabelStyle; color: string; textColor: string; size: PineSize;
  tooltip?: string; deleted: boolean;
}
interface Registered<T> { obj: T; cycle: number }

/**
 * request.security(syminfo.tickerid, tf, ...) on the chart symbol: the bars of timeframe `tf` built from the chart
 * bars and, for each chart bar, the index of its bar of that timeframe.
 */
function timeframeBars(bars: Bar[], tf: string, chartTf: string, context?: ChartContext): { htf: Bar[]; group: number[] } {
  if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) {
    return { htf: bars, group: bars.map((_b, i) => i) };
  }
  // With the exchange calendar of the chart context (time zone and session): the periods come from the library rule
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

/**
 * nz(time_close, time) of each bar, in ms: with the exchange calendar of the context the close time of the library;
 * else the bar time plus the bar interval.
 */
function closeTimes(bars: Bar[], chartTf: string, chart?: ChartContext): number[] {
  const unit = bars.length > 0 && bars[0].time >= 1e12 ? 1 : 1000;
  const interval = barInterval(bars) * unit;
  const fallback = bars.map((b) => b.time * unit + interval);
  if (!chart || !hasCalendar(chart) || chartTf === '') return fallback;
  try {
    let out: number[] = [];
    executeScript(() => { out = Array.from(scriptTimeClose.toArray(), (v) => v ?? NaN); }, bars, {}, {
      timeframe: chartTf, timezone: chart.timezone, session: chart.session, regularSession: chart.regularSession,
      sessionType: chart.sessionType, timeUnit: unit === 1 ? 'ms' : 's',
    });
    return out.map((v, i) => (na(v) ? bars[i].time * unit : v));
  } catch {
    return fallback;
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AmdPo3WithLiveEdgeStatsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
    boxes: BoxData[]; lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[]; bgColors: BgColorData[];
  } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const mintick = mintickOf(chart);
  const chartTf = chartTimeframe(bars, chart);
  const timeUnit = n > 0 && bars[0].time >= 1e12 ? 1 : 1000;
  const timeMs = (i: number) => bars[i].time * timeUnit;

  // Input validation
  if (cfg.useHtfBias && cfg.htfTf !== '' && chartTf !== '' && timeframe.in_seconds(cfg.htfTf) < timeframe.in_seconds(chartTf)) {
    throw new Error('HTF bias timeframe must be greater than or equal to the chart timeframe');
  }

  // Theme and colours
  const bg = backgroundColorOf(chart);
  const isDark = cfg.theme === 'Dark' ? true : cfg.theme === 'Light' ? false
    : lt(0.299 * color.r(bg) + 0.587 * color.g(bg) + 0.114 * color.b(bg), 128);
  const TEXT_COLOR = isDark ? '#E0E0E0' : '#1A1A1A';
  const TEXT_MUTED = isDark ? '#9E9E9E' : '#757575';
  const TABLE_BG = isDark ? C('#131722', 5) : C('#FFFFFF', 5);
  const TABLE_BORDER = isDark ? '#2A2E39' : '#D0D0D0';
  const TABLE_ROW_ALT = isDark ? C('#1C2030', 0) : C('#F0F4F8', 0);
  const HEADER_BG = isDark ? '#0D47A1' : '#1565C0';
  const HEADER_BG_BULL = C('#0F6E56', 0);
  const HEADER_BG_BEAR = C('#A32D2D', 0);
  const HEADER_TEXT = '#FFFFFF';
  const ENTRY_COLOR = isDark ? C('#5C8AAE', 0) : C('#34495E', 0);
  const TGT_HIT_COLOR = isDark ? C('#4DB6AC', 0) : C('#00695C', 0);
  const WM_COLOR = isDark ? C('#FFFFFF', 80) : C('#000000', 80);
  const BULL_TEXT = isDark ? '#00E676' : '#00A152';
  const BEAR_TEXT = isDark ? '#FF5252' : '#D32F2F';
  const NEUTRAL_TEXT = isDark ? '#FFEB3B' : '#F57F17';

  const fmtPrice = (v: number) => (na(v) ? '—' : str.tostring(v, 'mintick', mintick));
  const tickRound = (p: number) => pineMath.round(p / mintick) * mintick;
  const tickOut = (p: number, roundUp: boolean) => (roundUp ? Math.ceil(p / mintick) : Math.floor(p / mintick)) * mintick;
  const formatPctFromEntry = (level: number, entry: number) => {
    if (!(cfg.showPctOnLabels && !na(level) && !na(entry) && ne(entry, 0))) return '';
    const pct = ((level - entry) / entry) * 100.0;
    return ` (${ge(pct, 0) ? '+' : ''}${str.tostring(pct, '#.##')}%)`;
  };
  const buildGauge = (value: number, maxVal: number, width: number) => {
    const filled = maxVal <= 0 ? 0 : pineMath.round(Math.min(width, Math.max(0.0, (value / maxVal) * width)));
    let result = '';
    for (let i = 0; i <= width - 1; i++) result += i < filled ? '▰' : '▱';
    return result;
  };

  const entryLineStyle = lineStyleOf(cfg.entryLineStyle);
  const stopLineStyle = lineStyleOf(cfg.stopLineStyle);
  const tgtLineStyle = lineStyleOf(cfg.tgtLineStyle);
  const signalSize = sizeOf(cfg.signalFontSize);
  const slTpLabelSize = sizeOf(cfg.labelFontSize);
  const dashFontSize = sizeOf(cfg.dashFontSize);
  const dashFontSizeSub = sizeDownOf(cfg.dashFontSize);

  // Base series
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const atrRaw = A(ta.atr(bars, 14));
  const trTrue = A(ta.tr(bars, true));
  // atr14 = math.max(nz(ta.atr(14), ta.tr(true)), syminfo.mintick)
  const atr14 = atrRaw.map((v, i) => Math.max(na(v) ? trTrue[i] : v, mintick));
  const hi20 = A(ta.highest(S(high), RANGE_WIN));
  const lo20 = A(ta.lowest(S(low), RANGE_WIN));
  const chW = hi20.map((v, i) => v - lo20[i]);
  const pctRank = A(ta.percentrank(S(chW), cfg.statWindow));
  const trThr = A(ta.percentile_nearest_rank(ta.tr(bars, false), cfg.statWindow, cfg.sweepDepthPct));
  const ph = A(ta.pivothigh(S(high), PIVOT_LR, PIVOT_LR));
  const pl = A(ta.pivotlow(S(low), PIVOT_LR, PIVOT_LR));

  // Killzones: time(timeframe.period, session + ":1234567", time zone)
  const needKz = cfg.useKillzones || cfg.showSessions;
  const inKZ = bars.map((_b, i) => needKz && (pineTime.inSession(timeMs(i), `${cfg.kzLdn}:1234567`, cfg.kzTz)
    || pineTime.inSession(timeMs(i), `${cfg.kzNy}:1234567`, cfg.kzTz)));

  // HTF bias: request.security(tickerid, tf, [close[1], ta.ema(close, 50)[1]], lookahead_on): the bar of the
  // timeframe before the one of the chart bar
  let htfC: number[] = [];
  let htfE: number[] = [];
  if (cfg.useHtfBias) {
    const { htf, group } = timeframeBars(bars, cfg.htfTf, chartTf, chart);
    const ema = A(ta.ema(Series.fromArray(htf, htf.map((b) => b.close)), 50));
    htfC = group.map((g) => (g > 0 ? htf[g - 1].close : NaN));
    htfE = group.map((g) => (g > 0 ? ema[g - 1] : NaN));
  }

  // Registry of confirmed pivots
  const pivHiV: number[] = [];
  const pivHiB: number[] = [];
  const pivLoV: number[] = [];
  const pivLoB: number[] = [];

  // State machine
  type Phase = 'idle' | 'accum' | 'sweepPending' | 'manip' | 'dist';
  let state: Phase = 'idle';
  let cycleId = 0;
  let lastEndBar = -100;
  let rangeHigh = NaN;
  let rangeLow = NaN;
  let rangeMid = NaN;
  let rangeWidth = NaN;
  let tolPx = NaN;
  let rangeStartBar = NaN;
  let expiryAnchor = NaN;
  let rangeAge = 0;
  let atrAnchor = NaN;
  let sweepSide = 0;
  let firstSweepSide = 0;
  let sweepExtreme = NaN;
  let sweepBar = NaN;
  let depthCapPx = NaN;
  let sweepExtremeBar = NaN;
  let rearmUsed = false;
  let distDir = 0;
  let entryPrice = NaN;
  let stopPrice = NaN;
  let tgtPrice = NaN;
  let riskR = NaN;
  let distStartBar = NaN;
  let distHi = NaN;
  let distLo = NaN;

  // Statistics
  let tgtN = 0;
  let stopN = 0;
  let timeoutN = 0;
  let ambigN = 0;
  let failN = 0;
  let brkN = 0;
  let expN = 0;
  let newsN = 0;
  let earlyN = 0;
  let filtN = 0;
  let sumR = 0.0;
  let dsN = 0;
  let dsSumR = 0.0;
  const cycTimes: number[] = [];
  const cycOutc: number[] = [];
  const cycR: number[] = [];
  let formStr = '';
  let barClose: number[] | null = null; // nz(time_close, time), computed on the first closed cycle
  const closeOfBar = (i: number) => {
    barClose ??= closeTimes(bars, chartTf, chart);
    return barClose[i];
  };

  // Drawing objects, in creation order, and their registries by cycle
  const allBoxes: BoxObj[] = [];
  const allLines: LineObj[] = [];
  const allLabels: LabelObj[] = [];
  const regBoxes: Array<Registered<BoxObj>> = [];
  const regLines: Array<Registered<LineObj>> = [];
  const regLabs: Array<Registered<LabelObj>> = [];
  const newBox = (x1: number, top: number, x2: number, bottom: number, border: string, borderStyle: BoxObj['borderStyle'], bgColor: string) => {
    const b: BoxObj = { x1, top, x2, bottom, border, borderStyle, bg: bgColor, deleted: false };
    allBoxes.push(b);
    regBoxes.push({ obj: b, cycle: cycleId });
    return b;
  };
  const newLine = (x1: number, y: number, x2: number, col: string, style: LineObj['style'], width: number) => {
    const l: LineObj = { x1, y, x2, color: col, style, width, deleted: false };
    allLines.push(l);
    regLines.push({ obj: l, cycle: cycleId });
    return l;
  };
  const newLabel = (x: number, y: number, text: string, style: LabelStyle, col: string, textColor: string, size: PineSize, tooltip?: string) => {
    const l: LabelObj = { x, y, text, style, color: col, textColor, size, tooltip, deleted: false };
    allLabels.push(l);
    regLabs.push({ obj: l, cycle: cycleId });
    return l;
  };

  // f_trim: older than showLastCycles: dimmed (outline) or deleted (hide); older than 3 x showLastCycles: deleted
  const trimRegistry = <T extends { deleted: boolean }>(reg: Array<Registered<T>>, dim: (o: T) => void) => {
    const cutoff = cycleId - cfg.showLastCycles;
    const hardCut = cycleId - cfg.showLastCycles * 3;
    let k = 0;
    while (k < reg.length) {
      const c = reg[k].cycle;
      if (c <= hardCut || (c <= cutoff && cfg.historyStyle === 'hide')) {
        reg[k].obj.deleted = true;
        reg.splice(k, 1);
      } else {
        if (c <= cutoff) dim(reg[k].obj);
        k += 1;
      }
    }
  };
  const lineDim = C(GRAY, 70);
  const labelDim = C(GRAY, 85);
  const labelTextDim = C(GRAY, 55);
  const trim = () => {
    trimRegistry(regBoxes, (b) => { b.bg = null; });
    trimRegistry(regLines, (l) => { l.color = lineDim; });
    trimRegistry(regLabs, (l) => { l.color = labelDim; l.textColor = labelTextDim; });
  };

  // f_liquidityBeyond: at least 2 confirmed pivots near the boundary that are also near each other
  const liquidityBeyond = (side: number, barIndex: number) => {
    let cnt = 0;
    const tol = 0.10 * rangeWidth;
    let minV = NaN;
    let maxV = NaN;
    const scan = (vals: number[], idx: number[], boundary: number) => {
      for (let j = 0; j < vals.length; j++) {
        if (idx[j] >= barIndex - EQ_LOOKBACK && le(Math.abs(vals[j] - boundary), tol)) {
          const v = vals[j];
          cnt += 1;
          minV = na(minV) ? v : Math.min(minV, v);
          maxV = na(maxV) ? v : Math.max(maxV, v);
        }
      }
    };
    if (side === 1) scan(pivHiV, pivHiB, rangeHigh);
    if (side === -1) scan(pivLoV, pivLoB, rangeLow);
    return cnt >= 2 && !na(minV) && le(maxV - minV, tol);
  };

  // Objects of the current cycle
  let accBox: BoxObj | null = null;
  let swBox: BoxObj | null = null;
  let manLab: LabelObj | null = null;
  let dstBox: BoxObj | null = null;
  let stopLn: LineObj | null = null;
  let tgtLn: LineObj | null = null;
  let entLn: LineObj | null = null;
  let entLab: LabelObj | null = null;
  let stopLab: LabelObj | null = null;
  let tgtLab: LabelObj | null = null;

  const mutedLabel = C(GRAY, 70);
  const grayLabel = C(GRAY, 30);
  const manBorder = C(cfg.colMan, 20);
  const manPending = C(cfg.colMan, 75);
  const manDone = C(cfg.colMan, 55);
  const manText = textOn(cfg.colMan);
  const endCycle = (i: number) => {
    state = 'idle';
    lastEndBar = i;
    trim();
  };
  const manipulationLabel = () => {
    manLab = null;
    if (cfg.showLabels) {
      manLab = newLabel(sweepExtremeBar, sweepExtreme, 'M', sweepSide === 1 ? 'label_down' : 'label_up', manBorder, manText, signalSize);
    }
  };

  const bgColors: BgColorData[] = [];
  const kzColor = C(String(color.blue), 94);
  const lastConfirmed = lastBarConfirmedOf(chart);

  for (let i = 0; i < n; i++) {
    const hi = high[i];
    const lo = low[i];
    const cl = close[i];
    if (!na(ph[i])) {
      pivHiV.push(ph[i]);
      pivHiB.push(i - PIVOT_LR);
      if (pivHiV.length > PIVOT_CAP) { pivHiV.shift(); pivHiB.shift(); }
    }
    if (!na(pl[i])) {
      pivLoV.push(pl[i]);
      pivLoB.push(i - PIVOT_LR);
      if (pivLoV.length > PIVOT_CAP) { pivLoV.shift(); pivLoB.shift(); }
    }
    const warmedUp = i >= cfg.statWindow + RANGE_WIN;
    const tolBand = na(tolPx) ? 0 : tolPx;
    const insideRng = !na(rangeHigh) && le(cl, rangeHigh) && ge(cl, rangeLow);
    const breachHigh = !na(rangeHigh) && gt(hi, rangeHigh + tolBand);
    const breachLow = !na(rangeLow) && lt(lo, rangeLow - tolBand);
    const confirmed = i < n - 1 || lastConfirmed;

    if (confirmed) {
      if (state === 'idle') {
        // T1: idle -> accumulation
        if (warmedUp && gt(cl, 0) && le(pctRank[i], cfg.compressionPct) && ge(chW[i], (cfg.minRangeWidthP / 100) * cl)
          && i - lastEndBar >= COOLDOWN_BARS) {
          // impulse-tail trim: the oldest window bars are dropped while each of them dominates the width
          let winLast = RANGE_WIN - 1;
          let tHi = hi20[i];
          let tLo = lo20[i];
          if (cfg.trimTailPct > 0) {
            let keepTrim = true;
            while (keepTrim && winLast > cfg.minRangeBars) {
              let hi2 = hi;
              let lo2 = lo;
              for (let k = 0; k <= winLast - 1; k++) {
                hi2 = Math.max(hi2, i - k >= 0 ? high[i - k] : NaN);
                lo2 = Math.min(lo2, i - k >= 0 ? low[i - k] : NaN);
              }
              if (gt((tHi - tLo) - (hi2 - lo2), (cfg.trimTailPct / 100.0) * (tHi - tLo))) {
                winLast -= 1;
                tHi = hi2;
                tLo = lo2;
              } else {
                keepTrim = false;
              }
            }
          }
          const candStart = i - winLast;
          let candHigh = tHi;
          let candLow = tLo;
          if (cfg.boundaryMode === 'pivot') {
            let bestHi = NaN;
            let bestLo = NaN;
            for (let j = 0; j < pivHiV.length; j++) {
              if (pivHiB[j] >= candStart) bestHi = na(bestHi) ? pivHiV[j] : Math.max(bestHi, pivHiV[j]);
            }
            for (let j = 0; j < pivLoV.length; j++) {
              if (pivLoB[j] >= candStart) bestLo = na(bestLo) ? pivLoV[j] : Math.min(bestLo, pivLoV[j]);
            }
            // the window values when no pivot is inside the window
            candHigh = na(bestHi) ? candHigh : bestHi;
            candLow = na(bestLo) ? candLow : bestLo;
          }
          const candW = candHigh - candLow;
          // a range born with the price already outside is rejected
          if (ge(candW, (cfg.minRangeWidthP / 100) * cl) && le(cl, candHigh) && ge(cl, candLow)) {
            rangeStartBar = candStart;
            expiryAnchor = candStart;
            rangeHigh = candHigh;
            rangeLow = candLow;
            rangeWidth = candW;
            tolPx = candW * cfg.rangeTolerance;
            rangeMid = (candHigh + candLow) / 2;
            rangeAge = winLast;
            atrAnchor = i - (winLast + 1) >= 0 ? atr14[i - (winLast + 1)] : NaN; // the bar before the window
            rearmUsed = false;
            firstSweepSide = 0;
            cycleId += 1;
            trim();
            accBox = null;
            if (cfg.showBoxes) accBox = newBox(rangeStartBar, rangeHigh, i, rangeLow, C(cfg.colAcc, 0), 'dashed', cfg.colAcc);
            state = 'accum';
          }
        }
      } else if (state === 'accum') {
        // T2 / T3: accumulation
        rangeAge = i - rangeStartBar;
        if (i - expiryAnchor > cfg.maxRangeBars) {
          expN += 1;
          if (accBox) {
            accBox.x2 = i;
            accBox.border = C(GRAY, 40);
          }
          if (cfg.showLabels) newLabel(i, rangeMid, 'EXPIRED', 'label_left', mutedLabel, TEXT_MUTED, signalSize);
          endCycle(i);
        } else if (breachHigh && breachLow) {
          // a bar that breaches both boundaries: reset
          newsN += 1;
          if (accBox) accBox.x2 = i;
          if (cfg.showLabels) newLabel(i, cl, 'NEWS BAR', 'label_left', mutedLabel, TEXT_MUTED, signalSize);
          endCycle(i);
        } else if (breachHigh || breachLow) {
          const side = breachHigh ? 1 : -1;
          if (rangeAge < cfg.minRangeBars) {
            // a breach of a range that is too young is an early break, not a sweep
            earlyN += 1;
            if (accBox) accBox.x2 = i;
            endCycle(i);
          } else {
            const sameSideBlock = rearmUsed && side === firstSweepSide;
            const kzOK = !cfg.useKillzones || inKZ[i];
            // the percentile of the bar before (of this bar on the first bar)
            const capPx = cfg.sweepDepthPct >= 100 ? NaN : (i > 0 && !na(trThr[i - 1]) ? trThr[i - 1] : trThr[i]);
            const excurs = side === 1 ? hi - rangeHigh : rangeLow - lo;
            const dpOK = na(capPx) || le(excurs, capPx);
            const liqOK = !cfg.requireLiquidity || liquidityBeyond(side, i);
            if (kzOK && dpOK && liqOK && !sameSideBlock) {
              // T3: -> sweep pending
              if (accBox) accBox.x2 = i;
              sweepSide = side;
              sweepBar = i;
              sweepExtreme = side === 1 ? hi : lo;
              sweepExtremeBar = i;
              depthCapPx = capPx;
              if (firstSweepSide === 0) firstSweepSide = side;
              swBox = null;
              if (cfg.showBoxes) {
                swBox = newBox(sweepBar, side === 1 ? sweepExtreme : rangeLow, i, side === 1 ? rangeHigh : sweepExtreme,
                  manBorder, 'dashed', manPending);
              }
              state = 'sweepPending';
              // the close is back inside on the same bar (a wick sweep)
              if (insideRng) {
                state = 'manip';
                if (swBox) {
                  swBox.borderStyle = 'solid';
                  swBox.bg = manDone;
                }
                manipulationLabel();
              }
            } else if (!insideRng) {
              // a filtered breach that closes outside ends the range
              filtN += 1;
              if (accBox) accBox.x2 = i;
              endCycle(i);
            }
          }
        } else if (cfg.boundaryMode === 'absolute') {
          // the boundaries follow the bars inside the tolerance
          const newHi = Math.min(Math.max(rangeHigh, hi), rangeHigh + tolBand);
          const newLo = Math.max(Math.min(rangeLow, lo), rangeLow - tolBand);
          if (ne(newHi, rangeHigh) || ne(newLo, rangeLow)) {
            rangeHigh = newHi;
            rangeLow = newLo;
            rangeWidth = rangeHigh - rangeLow;
            rangeMid = (rangeHigh + rangeLow) / 2;
            if (accBox) {
              accBox.top = rangeHigh;
              accBox.bottom = rangeLow;
            }
          }
        } else {
          // pivot mode: only a new confirmed pivot inside the tolerance moves a boundary
          if (!na(ph[i]) && i - PIVOT_LR >= rangeStartBar && gt(ph[i], rangeHigh) && le(ph[i], rangeHigh + tolBand)) {
            rangeHigh = ph[i];
            rangeWidth = rangeHigh - rangeLow;
            rangeMid = (rangeHigh + rangeLow) / 2;
            if (accBox) accBox.top = rangeHigh;
          }
          if (!na(pl[i]) && i - PIVOT_LR >= rangeStartBar && lt(pl[i], rangeLow) && ge(pl[i], rangeLow - tolBand)) {
            rangeLow = pl[i];
            rangeWidth = rangeHigh - rangeLow;
            rangeMid = (rangeHigh + rangeLow) / 2;
            if (accBox) accBox.bottom = rangeLow;
          }
        }
      } else if (state === 'sweepPending') {
        // T4: the sweep deepens; the reference stop follows its extreme
        const prevExtreme = sweepExtreme;
        sweepExtreme = sweepSide === 1 ? Math.max(sweepExtreme, hi) : Math.min(sweepExtreme, lo);
        if (ne(sweepExtreme, prevExtreme)) sweepExtremeBar = i;
        if (swBox) {
          if (sweepSide === 1) swBox.top = sweepExtreme;
          else swBox.bottom = sweepExtreme;
        }
        const oppBreach = sweepSide === 1 ? lt(lo, rangeLow - tolBand) : gt(hi, rangeHigh + tolBand);
        const curExc = sweepSide === 1 ? sweepExtreme - rangeHigh : rangeLow - sweepExtreme;
        const depthBust = !na(depthCapPx) && gt(curExc, depthCapPx);
        const sideStyle: LabelStyle = sweepSide === 1 ? 'label_down' : 'label_up';
        if (oppBreach) {
          newsN += 1;
          if (swBox) swBox.x2 = i;
          if (cfg.showLabels) newLabel(i, cl, '2-SIDE', 'label_left', mutedLabel, TEXT_MUTED, signalSize);
          endCycle(i);
        } else if (depthBust) {
          brkN += 1;
          if (swBox) swBox.x2 = i;
          if (cfg.showLabels) newLabel(i, sweepExtreme, 'TOO DEEP', sideStyle, grayLabel, textOn(GRAY), signalSize);
          endCycle(i);
        } else if (i - sweepBar > cfg.sweepReturnBars) {
          // the deadline is over: a breakout, whatever the close
          brkN += 1;
          if (swBox) swBox.x2 = i;
          if (cfg.showLabels) newLabel(i, sweepExtreme, 'BREAKOUT', sideStyle, grayLabel, textOn(GRAY), signalSize);
          endCycle(i);
        } else if (insideRng) {
          // the close is back inside in time: the manipulation is confirmed
          state = 'manip';
          if (swBox) {
            swBox.x2 = i;
            swBox.borderStyle = 'solid';
            swBox.bg = manDone;
          }
          manipulationLabel();
        }
      } else if (state === 'dist') {
        // T7: distribution -> outcome, from the bar after the opening
        if (i - distStartBar >= 1) {
          const hitT = distDir === 1 ? ge(hi, tgtPrice) : le(lo, tgtPrice);
          const hitS = distDir === 1 ? le(lo, stopPrice) : ge(hi, stopPrice);
          const timedOut = i - distStartBar >= cfg.distTimeoutBars;
          if (hitT || hitS || timedOut) {
            let outcome = '';
            let rr = 0.0;
            const open = bars[i].open;
            if (hitT && hitS) {
              // both sides touched: counted as a stop
              ambigN += 1;
              stopN += 1;
              rr = -1.0;
              outcome = 'AMB ✗';
            } else if (hitT) {
              tgtN += 1;
              // a gap through the target exits at the open
              const exitT = distDir === 1 ? Math.max(tgtPrice, open) : Math.min(tgtPrice, open);
              rr = Math.abs(exitT - entryPrice) / riskR;
              outcome = `✓ +${str.tostring(rr, '#.##')}R`;
            } else if (hitS) {
              stopN += 1;
              // a gap through the stop exits at the open
              const exitS = distDir === 1 ? Math.min(stopPrice, open) : Math.max(stopPrice, open);
              rr = distDir === 1 ? (exitS - entryPrice) / riskR : (entryPrice - exitS) / riskR;
              outcome = `✗ ${str.tostring(rr, '#.##')}R`;
            } else {
              timeoutN += 1;
              rr = distDir === 1 ? (cl - entryPrice) / riskR : (entryPrice - cl) / riskR;
              outcome = `◌ ${str.tostring(rr, '#.##')}R`;
            }
            if (dstBox) {
              distHi = Math.max(distHi, hi);
              distLo = Math.min(distLo, lo);
              dstBox.top = distHi;
              dstBox.bottom = distLo;
              dstBox.x2 = i;
            }
            sumR += rr;
            if (rearmUsed) {
              dsN += 1;
              dsSumR += rr;
            }
            // timestamped buffer and form strip
            const outcCode = hitT && hitS ? 0 : hitT ? 1 : hitS ? 0 : 2;
            cycTimes.push(closeOfBar(i));
            cycOutc.push(outcCode);
            cycR.push(rr);
            while (cycTimes.length > 0 && cycTimes[0] < timeMs(i) - MS_DAY * STATS_PRUNE_DAYS) {
              cycTimes.shift();
              cycOutc.shift();
              cycR.shift();
            }
            formStr += outcCode === 1 ? '▰' : outcCode === 0 ? '▱' : '◌';
            if (formStr.length > FORM_LEN) formStr = formStr.substring(formStr.length - FORM_LEN);
            // the levels change with the outcome
            if (hitT && !hitS) {
              if (tgtLn) {
                tgtLn.color = TGT_HIT_COLOR;
                tgtLn.style = 'solid';
              }
              if (tgtLab) {
                tgtLab.text = `Target ✓ ${fmtPrice(tgtPrice)}`;
                tgtLab.color = TGT_HIT_COLOR;
                tgtLab.textColor = textOn(TGT_HIT_COLOR);
              }
            } else if (hitS) {
              if (stopLab) stopLab.text = `Stop ✗ ${fmtPrice(stopPrice)}`;
            } else {
              if (tgtLn) tgtLn.color = C(GRAY, 60);
              if (tgtLab) tgtLab.color = C(GRAY, 70);
            }
            if (cfg.showLabels) {
              const oBase = hitT && !hitS ? cfg.colTgt : timedOut && !hitS && !hitT ? GRAY : cfg.colStop;
              newLabel(i, distDir === 1 ? hi : lo, outcome, distDir === 1 ? 'label_down' : 'label_up', C(oBase, 20), textOn(oBase), signalSize);
            }
            endCycle(i);
          }
        }
      }

      // T5: manipulation confirmed -> the distribution opens on the same bar
      if ((state as Phase) === 'manip') {
        const dir = sweepSide === -1 ? 1 : -1;
        const htfNa = cfg.useHtfBias && (na(htfC[i]) || na(htfE[i]));
        const htfOK = !cfg.useHtfBias || (!htfNa && (dir === 1 ? gt(htfC[i], htfE[i]) : lt(htfC[i], htfE[i])));
        if (htfOK) {
          distDir = dir;
          entryPrice = cl;
          // target: extension of the leg from the sweep extreme (0) to the opposite boundary (1)
          const fibLeg = dir === 1 ? rangeHigh - sweepExtreme : sweepExtreme - rangeLow;
          tgtPrice = tickRound(dir === 1 ? rangeHigh + (cfg.fibExt - 1.0) * fibLeg : rangeLow - (cfg.fibExt - 1.0) * fibLeg);
          const stopRaw = dir === 1 ? sweepExtreme - cfg.stopBufAtr * atrAnchor : sweepExtreme + cfg.stopBufAtr * atrAnchor;
          stopPrice = tickOut(stopRaw, dir === -1);
          riskR = Math.max(Math.abs(entryPrice - stopPrice), mintick);
          // at least one tick of reward in the direction of the trade
          const rewardOK = dir === 1 ? ge(tgtPrice - entryPrice, mintick) : ge(entryPrice - tgtPrice, mintick);
          if (!rewardOK) {
            failN += 1;
            if (manLab) {
              (manLab as LabelObj).text = 'M ✗';
              (manLab as LabelObj).color = C(GRAY, 40);
            }
            endCycle(i);
          } else {
            distStartBar = i;
            distHi = hi;
            distLo = lo;
            dstBox = null;
            if (cfg.showBoxes) dstBox = newBox(i, distHi, i, distLo, C(cfg.colTgt, 30), 'solid', cfg.colDst);
            const entPxStr = str.tostring(entryPrice, 'mintick', mintick);
            const stpPxStr = str.tostring(stopPrice, 'mintick', mintick);
            const tgtPxStr = str.tostring(tgtPrice, 'mintick', mintick);
            entLn = null;
            stopLn = null;
            tgtLn = null;
            entLab = null;
            stopLab = null;
            tgtLab = null;
            const dRrStr = str.tostring(Math.abs(tgtPrice - entryPrice) / riskR, '#.##');
            if (cfg.showLabels) {
              const dTip = `${dir === 1 ? 'Distribution UP' : 'Distribution DOWN'}\nSweep: ${sweepSide === 1 ? 'HIGH' : 'LOW'}`
                + `${rearmUsed ? ' (double sweep)' : ''}\nEntry: ${entPxStr} | Stop: ${stpPxStr}\nTarget: ${tgtPxStr} | R:R: ${dRrStr}`;
              newLabel(i, dir === 1 ? lo : hi, dir === 1 ? 'D ▲' : 'D ▼', dir === 1 ? 'label_up' : 'label_down',
                C(cfg.colTgt, 20), textOn(cfg.colTgt), signalSize, dTip);
            }
            if (cfg.showLevels) {
              entLn = newLine(i, entryPrice, i + LINE_UPDATE_BARS, ENTRY_COLOR, entryLineStyle, 1);
              stopLn = newLine(i, stopPrice, i + LINE_UPDATE_BARS, cfg.colStop, stopLineStyle, 2);
              tgtLn = newLine(i, tgtPrice, i + LINE_UPDATE_BARS, cfg.colTgt, tgtLineStyle, 2);
              if (cfg.showLevelLabels) {
                const lx = i + LINE_UPDATE_BARS + LABEL_OFFSET_BARS;
                entLab = newLabel(lx, entryPrice, `Entry ${entPxStr}`, 'label_left', ENTRY_COLOR, textOn(ENTRY_COLOR), slTpLabelSize);
                stopLab = newLabel(lx, stopPrice, `Stop ${stpPxStr}${formatPctFromEntry(stopPrice, entryPrice)}`, 'label_left',
                  cfg.colStop, textOn(cfg.colStop), slTpLabelSize);
                tgtLab = newLabel(lx, tgtPrice, `Target ${tgtPxStr}${formatPctFromEntry(tgtPrice, entryPrice)}`, 'label_left',
                  cfg.colTgt, textOn(cfg.colTgt), slTpLabelSize);
              }
            }
            state = 'dist';
          }
        } else if (htfNa) {
          // no data of the bias timeframe: reset without using the second sweep and without a failure
          if (manLab) {
            (manLab as LabelObj).text = 'M · HTF n/a';
            (manLab as LabelObj).color = C(GRAY, 40);
          }
          endCycle(i);
        } else if (cfg.allowRearm && !rearmUsed) {
          rearmUsed = true;
          expiryAnchor = i; // a new time budget for the second sweep
          if (manLab) (manLab as LabelObj).text = 'M ↻';
          if (swBox) swBox.bg = C(GRAY, 80);
          state = 'accum'; // the same range waits for a sweep of the other side
        } else {
          failN += 1;
          if (manLab) {
            (manLab as LabelObj).text = 'M ✗';
            (manLab as LabelObj).color = C(GRAY, 40);
          }
          endCycle(i);
        }
      }
    }

    // Extension of the active objects, on every bar
    if ((state as Phase) === 'accum' && accBox) accBox.x2 = i;
    if ((state as Phase) === 'sweepPending' && swBox) swBox.x2 = i;
    if ((state as Phase) === 'dist') {
      if (entLn) entLn.x2 = i + LINE_UPDATE_BARS;
      if (stopLn) stopLn.x2 = i + LINE_UPDATE_BARS;
      if (tgtLn) tgtLn.x2 = i + LINE_UPDATE_BARS;
      if (entLab) entLab.x = i + LINE_UPDATE_BARS + LABEL_OFFSET_BARS;
      if (stopLab) stopLab.x = i + LINE_UPDATE_BARS + LABEL_OFFSET_BARS;
      if (tgtLab) tgtLab.x = i + LINE_UPDATE_BARS + LABEL_OFFSET_BARS;
      if (dstBox) {
        distHi = Math.max(distHi, hi);
        distLo = Math.min(distLo, lo);
        dstBox.top = distHi;
        dstBox.bottom = distLo;
        dstBox.x2 = i;
      }
    }

    // bgcolor(showSessionsInput and inKZ ? color.new(color.blue, 94) : na)
    if (cfg.showSessions && inKZ[i]) bgColors.push({ time: bars[i].time, color: kzColor });
  }

  // Dashboard and watermark, on the last bar
  const tables: TableData[] = [];
  const last = n - 1;
  const finalState = state as Phase;
  if (cfg.showDash && n > 0) {
    const marketRows = cfg.showMarketSec ? 6 : 0;
    const cycleRows = cfg.showCycleSec ? (finalState === 'dist' ? 8 : 2) : 0;
    const statsRows = cfg.showStatsSec ? 10 : 0;
    const totalRows = 2 + marketRows + cycleRows + statsRows;
    const cells: TableCellData[] = [];
    const merges: TableMergeData[] = [];
    const cell = (column: number, row: number, text: string, textColor: string, textSize: PineSize, bgColor?: string, tooltip?: string) => {
      const c: TableCellData = { column, row, text, textColor, textSize };
      if (bgColor !== undefined) c.bgColor = bgColor;
      if (tooltip !== undefined) c.tooltip = tooltip;
      cells.push(c);
    };
    const merged = (row: number, text: string, textColor: string, textSize: PineSize, bgColor?: string) => {
      cell(0, row, text, textColor, textSize, bgColor);
      merges.push({ startColumn: 0, startRow: row, endColumn: 1, endRow: row });
    };
    const warmedUp = last >= cfg.statWindow + RANGE_WIN;
    const cl = close[last];
    const phaseName = finalState === 'idle' ? 'IDLE' : finalState === 'accum' ? 'ACCUMULATION' : finalState === 'sweepPending' ? 'SWEEP?'
      : finalState === 'dist' ? 'DISTRIBUTION' : '?';
    const phaseBars = finalState === 'accum' ? last - rangeStartBar : finalState === 'sweepPending' ? last - sweepBar
      : finalState === 'dist' ? last - distStartBar : 0;
    let r = 0;
    let zeb = false;
    const rowBg = () => (zeb ? TABLE_ROW_ALT : TABLE_BG);
    const row = (name: string, tooltip: string, value: string, valueColor: string, nameText = name) => {
      const rb = rowBg();
      cell(0, r, nameText, TEXT_MUTED, dashFontSize, rb, tooltip);
      cell(1, r, value, valueColor, dashFontSize, rb);
      r += 1;
      zeb = !zeb;
    };

    // Header, coloured by the phase
    const headerBg = finalState === 'dist' ? (distDir === 1 ? HEADER_BG_BULL : HEADER_BG_BEAR) : HEADER_BG;
    const headerDir = finalState === 'dist' ? (distDir === 1 ? ' ▲' : ' ▼') : '';
    merged(r, `◆ Po3 · ${phaseName}${headerDir}`, HEADER_TEXT, dashFontSize, headerBg);
    r += 1;

    if (cfg.showMarketSec) {
      merged(r, '— Market —', TEXT_MUTED, dashFontSizeSub, TABLE_ROW_ALT);
      r += 1;
      const phaseStr = !warmedUp ? 'Warming up' : phaseName + (finalState !== 'idle' ? ` (${str.tostring(phaseBars)}b)` : '');
      const phaseClr = !warmedUp ? TEXT_MUTED : finalState === 'dist' ? (distDir === 1 ? BULL_TEXT : BEAR_TEXT)
        : finalState === 'idle' ? TEXT_MUTED : NEUTRAL_TEXT;
      row('Phase', 'FSM phase and bars spent in it', phaseStr, phaseClr);

      const rank = pctRank[last];
      const cmpStr = !warmedUp ? '—' : `${str.tostring(rank, '#')}p  ${buildGauge(100 - rank, 100, 6)}`;
      const cmpClr = !warmedUp ? TEXT_MUTED : le(rank, cfg.compressionPct) ? BULL_TEXT : TEXT_COLOR;
      row('Compression', 'Donchian(20) width percentile (lower = tighter).\nGauge fills as compression tightens; green = below the\nrange-detection threshold', cmpStr, cmpClr);

      const rngStr = finalState !== 'idle' && !na(rangeLow) && !na(rangeHigh) ? `${fmtPrice(rangeLow)} – ${fmtPrice(rangeHigh)}` : '—';
      row('Range', 'Active accumulation range boundaries', rngStr, TEXT_COLOR);

      const hC = cfg.useHtfBias ? htfC[last] : NaN;
      const hE = cfg.useHtfBias ? htfE[last] : NaN;
      const htfStr = !cfg.useHtfBias ? 'Off' : na(hC) || na(hE) ? '…' : gt(hC, hE) ? 'Bullish' : lt(hC, hE) ? 'Bearish' : 'Flat';
      const htfClr = !cfg.useHtfBias || na(hC) || na(hE) ? TEXT_MUTED : gt(hC, hE) ? BULL_TEXT : lt(hC, hE) ? BEAR_TEXT : NEUTRAL_TEXT;
      row('HTF Bias', 'Higher-timeframe trend filter (close vs EMA50, last closed\nHTF bar). Off = every confirmed manipulation opens', htfStr, htfClr);

      // the chart types that are not standard (Heikin Ashi, Renko ...) are not known here: a standard chart
      const tfWarn = chartTf !== '15' ? ' ⚠ (opt: 15M)' : '';
      row('TF', 'Chart timeframe. The model is tuned for 15M', chartTf + tfWarn, chartTf !== '15' ? NEUTRAL_TEXT : TEXT_COLOR);
    }

    if (cfg.showCycleSec) {
      merged(r, '— Cycle —', TEXT_MUTED, dashFontSizeSub, TABLE_ROW_ALT);
      r += 1;
      if (finalState === 'dist') {
        const dirWord = distDir === 1 ? 'Long' : 'Short';
        const dirClr = distDir === 1 ? BULL_TEXT : BEAR_TEXT;
        const curRR = gt(riskR, 0) ? Math.abs(tgtPrice - entryPrice) / riskR : NaN;
        const rrClr = na(curRR) ? TEXT_MUTED : ge(curRR, 1.5) ? BULL_TEXT : ge(curRR, 1.0) ? NEUTRAL_TEXT : BEAR_TEXT;
        const riskPct = !na(entryPrice) && ne(entryPrice, 0) ? (Math.abs(entryPrice - stopPrice) / Math.abs(entryPrice)) * 100 : NaN;
        const rkClr = na(riskPct) ? TEXT_MUTED : gt(riskPct, 3.0) ? BEAR_TEXT : gt(riskPct, 1.0) ? NEUTRAL_TEXT : BULL_TEXT;
        row('Entry', 'Reference entry = the D-bar close (statistics anchor)', `${dirWord} @ ${fmtPrice(entryPrice)}`, dirClr);
        row('Stop', 'Reference stop: beyond the full sweep excursion + ATR buffer', fmtPrice(stopPrice), cfg.colStop);
        row('Target', `Fib-extension distribution target: level ${str.tostring(cfg.fibExt, '#.###')} of the\nmanipulation leg (0 = sweep tip, 1 = opposite boundary).\nNOT a take-profit`,
          fmtPrice(tgtPrice), cfg.colTgt);
        row('R:R', 'Risk:Reward of the reference model at the target', na(curRR) ? '—' : `${str.tostring(curRR, '#.##')}R`, rrClr);
        row('Risk', 'Distance from entry to stop in % of entry price', na(riskPct) ? '—' : `${str.tostring(riskPct, '#.##')}%`, rkClr);
        // remaining reward : risk from the current price
        const rrLeftNum = distDir === 1 ? tgtPrice - cl : cl - tgtPrice;
        const rrLeftDen = distDir === 1 ? cl - stopPrice : stopPrice - cl;
        const rrLeft = gt(rrLeftNum, 0) && gt(rrLeftDen, 0) ? rrLeftNum / rrLeftDen : NaN;
        const rrLeftStr = na(rrLeft) ? (le(rrLeftNum, 0) ? 'past target' : 'past stop') : `${str.tostring(rrLeft, '#.##')}R`;
        const rrLeftClr = na(rrLeft) ? TEXT_MUTED : ge(rrLeft, 1.0) ? BULL_TEXT : ge(rrLeft, 0.5) ? NEUTRAL_TEXT : BEAR_TEXT;
        row('RR left', 'Reward:risk remaining from the CURRENT price.\nAnswers: is it too late to enter now?\nThe original signal R:R is one row above', rrLeftStr, rrLeftClr);
        row('Age', `Bars since the distribution opened (timeout at ${str.tostring(cfg.distTimeoutBars)})`, `${str.tostring(last - distStartBar)} bars`, TEXT_COLOR);
      } else {
        const action = finalState === 'idle' ? (warmedUp ? 'Scanning for compression' : 'Warming up')
          : finalState === 'accum' ? (rearmUsed ? 'Re-arm: awaiting 2nd-side sweep' : last - rangeStartBar < cfg.minRangeBars ? 'Range maturing' : 'Awaiting boundary sweep')
            : finalState === 'sweepPending' ? 'Sweep! Awaiting return inside' : '—';
        merged(r, action, TEXT_MUTED, dashFontSize);
        r += 1;
      }
    }

    if (cfg.showStatsSec) {
      const allTime = cfg.statsPeriod === 'All-Time';
      let pT = tgtN;
      let pS = stopN;
      let pTo = timeoutN;
      let pSum = sumR;
      if (!allTime) {
        // cycles closed inside the period, from the rolling buffer
        const nowMs = closeOfBar(last);
        const cutoff = cfg.statsPeriod === '24 Hours' ? nowMs - MS_DAY : nowMs - MS_DAY * 30;
        pT = 0;
        pS = 0;
        pTo = 0;
        pSum = 0.0;
        for (let k = 0; k < cycTimes.length; k++) {
          if (cycTimes[k] >= cutoff) {
            if (cycOutc[k] === 1) pT += 1;
            else if (cycOutc[k] === 0) pS += 1;
            else pTo += 1;
            pSum += cycR[k];
          }
        }
      }
      const pTotal = pT + pS + pTo;
      const pctOK = pTotal >= cfg.minSampleN;
      const pTgtRate = pTotal > 0 ? (pT / pTotal) * 100.0 : 0.0;
      const periodTag = cfg.statsPeriod === '24 Hours' ? '24H' : cfg.statsPeriod === '30 Days' ? '30D' : 'All-Time';
      const share = (count: number) => (pTotal > 0
        ? str.tostring(count) + (pctOK ? ` (${str.tostring((100.0 * count) / pTotal, '#.#')}%)` : '') : '—');
      const collecting = `collecting (${str.tostring(pTotal)}/${str.tostring(cfg.minSampleN)})`;

      merged(r, `— Stats · ${periodTag} —`, TEXT_MUTED, dashFontSizeSub, TABLE_ROW_ALT);
      r += 1;
      row('Cycles', 'Closed cycles within the selected period.\n(ds N) = double-sweep cycles, All-Time only.\nResets on chart reload',
        pTotal > 0 ? str.tostring(pTotal) + (allTime && dsN > 0 ? ` (ds ${str.tostring(dsN)})` : '') : '—', TEXT_COLOR);
      row('Target', 'Cycles that reached the fib-extension target', share(pT), pTotal > 0 ? BULL_TEXT : TEXT_MUTED);
      row('Stop', 'Cycles stopped out. Ambiguous bars (target + stop on one\nbar) count as STOP — conservative model', share(pS),
        pTotal > 0 ? BEAR_TEXT : TEXT_MUTED, `Stop${allTime && ambigN > 0 ? ` (amb ${str.tostring(ambigN)})` : ''}`);
      row('Timeout', `Neither level reached within ${str.tostring(cfg.distTimeoutBars)} bars; closed at the\nactual R from the close`, share(pTo), TEXT_MUTED);

      const trStr = pTotal === 0 ? '—' : pctOK ? `${str.tostring(pTgtRate, '#.#')}%  ${buildGauge(pTgtRate, 100, 8)}` : collecting;
      const trClr = pTotal === 0 || !pctOK ? TEXT_MUTED : ge(pTgtRate, 55.0) ? BULL_TEXT : ge(pTgtRate, 45.0) ? NEUTRAL_TEXT : BEAR_TEXT;
      row('Target rate', 'Share of cycles reaching the target within the period.\nNOT a probability of profit: the breakeven rate depends on\nR:R — judge the edge by Avg R. Hidden until the minimum\nsample is collected', trStr, trClr);

      const pAvg = pTotal > 0 ? pSum / pTotal : NaN;
      const avgStr = pTotal === 0 ? '—' : pctOK
        ? `${str.tostring(pAvg, '#.##')}R${allTime && dsN >= cfg.minSampleN ? ` (ds ${str.tostring(dsSumR / dsN, '#.##')})` : ''}` : collecting;
      const avgClr = pTotal === 0 || !pctOK ? TEXT_MUTED : ge(pAvg, 0.2) ? BULL_TEXT : ge(pAvg, -0.2) ? NEUTRAL_TEXT : BEAR_TEXT;
      row('Avg R', 'Average R per closed cycle for the period.\n(ds …) = average R of double-sweep cycles, All-Time only', avgStr, avgClr);
      row('Form', 'Last cycles regardless of period (newest right):\n▰ = target · ▱ = stop · ◌ = timeout', formStr === '' ? '—' : formStr, TEXT_COLOR);
      row('Failed / Breakout · All-Time', 'Always All-Time regardless of the stats period.\nFailed = HTF filter rejected without re-arm.\nBreakout = no return in time or too deep',
        `${str.tostring(failN)} / ${str.tostring(brkN)}`, TEXT_MUTED);
      row('Resets (e/n/y/f) · All-Time', 'Range resets before any sweep resolved (All-Time):\ne = expired · n = news bar / 2-side · y = too young\n(immature breach) · f = filtered breach closing outside.\nFilter-quality diagnostics (audit S04)',
        `${str.tostring(expN)} / ${str.tostring(newsN)} / ${str.tostring(earlyN)} / ${str.tostring(filtN)}`, TEXT_MUTED);
    }

    // Footer
    merged(r, `Po3 · ${INDICATOR_VERSION}`, TEXT_MUTED, dashFontSizeSub);

    const positions: Record<AmdPo3WithLiveEdgeStatsInputs['dashPosStr'], TablePosition> = {
      'Top Left': 'top_left', 'Top Right': 'top_right', 'Bottom Left': 'bottom_left', 'Bottom Right': 'bottom_right',
      'Middle Right': 'middle_right',
    };
    tables.push({
      position: positions[cfg.dashPosStr] ?? 'top_right', columns: 2, rows: totalRows, cells, merges,
      bgColor: TABLE_BG, borderColor: TABLE_BORDER, borderWidth: 1, frameColor: TABLE_BORDER, frameWidth: 1,
    });
  }
  if (cfg.showWatermark && n > 0) {
    const none = C(String(color.black), 100);
    tables.push({
      position: 'bottom_center', columns: 1, rows: 1,
      cells: [{ column: 0, row: 0, text: 'WillyAlgoTrader', textColor: WM_COLOR, textSize: 'normal', bgColor: none }],
      bgColor: none, borderColor: none, borderWidth: 0, frameColor: none, frameWidth: 0,
    });
  }

  const t = (index: number) => barTime(bars, index);
  const boxes: BoxData[] = allBoxes.filter((b) => !b.deleted).map((b) => ({
    time1: t(b.x1), price1: b.top, time2: t(b.x2), price2: b.bottom,
    borderColor: b.border, borderStyle: b.borderStyle, borderWidth: 1, bgColor: b.bg ?? 'transparent',
  }));
  const lines: LineDrawingData[] = allLines.filter((l) => !l.deleted).map((l) => ({
    time1: t(l.x1), price1: l.y, time2: t(l.x2), price2: l.y, color: l.color, style: l.style, width: l.width,
  }));
  const labels: LabelData[] = allLabels.filter((l) => !l.deleted).map((l) => ({
    time: t(l.x), price: l.y, text: l.text, style: l.style, color: l.color, textColor: l.textColor, size: l.size,
    ...(l.tooltip !== undefined ? { tooltip: l.tooltip } : {}),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
    lines,
    labels,
    tables,
    bgColors,
  };
}

export const AmdPo3WithLiveEdgeStats = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
