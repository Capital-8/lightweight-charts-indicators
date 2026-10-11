/**
 * Market Structure Dashboard | Flux Charts
 *
 * A table that reads the market structure of up to seven timeframes of the chart symbol, and optional drawings on
 * the chart. For every timeframe that is not below the chart timeframe, on the bars of that timeframe:
 * - swing highs / lows = pivots of `swingLength` bars on each side; the position of the close inside the range of
 *   the last swing high and low, with the sweeps (a swing level passed by a wick and the close back inside)
 * - structure = the last three swing labels (HH / LH / HL / LL), with a close beyond the previous swing counted
 *   at once; bullish when the last high and the last low are both higher, bearish when both are lower
 * - order blocks = when the close crosses the last pivot, the lowest (highest) candle since that pivot (at most 50
 *   bars back); an order block is removed when the close passes it; the nearest one is shown with its distance
 * - fair value gaps = a three-candle gap; a gap is removed when a wick passes it; the nearest one is shown
 * - the distance of the close to its EMA
 * The lower part gives the volume against its 20-bar average, the swing range of the chart timeframe, the ATR(3)
 * against its average, the session and killzone of the current New York time, and a trend bias: the weighted sum of
 * the readings of the timeframes. Optional: rows for the previous day / week / month high and low, order block and
 * fair value gap boxes, swing labels, swing lines, previous day / week / month lines and the EMA.
 *
 * Other timeframes: the bars of a timeframe are built from the chart bars (periods from the exchange calendar of
 * the chart context, else from the UTC calendar and the bars, see src/anchor-period.ts), and a row shows the latest
 * completed bar of its timeframe, as the original on a calculation on history; with `realtime` in the chart context
 * (the last bar receives live updates) a row shows the bar in progress, as the original then does. The original reads the full history of every timeframe from its
 * data source; here a timeframe only has the periods covered by the chart bars, so a reading that depends on older
 * bars (an old order block or gap, the swings of a weekly row on a short intraday chart) can differ. A timeframe
 * without a completed period in the bars gives an empty reading ("NaN").
 * Session and killzone use the current time of the chart context (the clock of the computer without it); on a
 * chart whose last bar is older than one bar length they use the time of the last bar, as the original.
 * The previous day / week / month levels on a chart timeframe above theirs need lower-timeframe data: the port
 * throws an Error when such lines are switched on. The alert inputs are kept; alerts give no output.
 *
 * Reference: "Market Structure Dashboard | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import {
  ta, Series, color, math, str, timeframe, time as pineTime, barInterval,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { barTime } from '../bar-time';
import { chartTimeframe, hasCalendar, periodStarts, securityPeriods } from '../anchor-period';
import { mintickOf, nowOf, tickerOf, type ChartContext } from '../chart-context';
import type { BoxData, LabelData, LineDrawingData, TableCellData, TableData, TablePosition } from '../types';

type LineStyleOption = '────' | '- - -' | '····';

export interface MarketStructureDashboardFluxChartsInputs {
  tf1Enabled: boolean;
  tf1: string;
  tf1Weight: number;
  tf2Enabled: boolean;
  tf2: string;
  tf2Weight: number;
  tf3Enabled: boolean;
  tf3: string;
  tf3Weight: number;
  tf4Enabled: boolean;
  tf4: string;
  tf4Weight: number;
  tf5Enabled: boolean;
  tf5: string;
  tf5Weight: number;
  tf6Enabled: boolean;
  tf6: string;
  tf6Weight: number;
  tf7Enabled: boolean;
  tf7: string;
  tf7Weight: number;
  /** Market Structure Dashboard */
  showMSD: boolean;
  showColEma: boolean;
  showColSwing: boolean;
  showColStruct: boolean;
  showColOB: boolean;
  showColFVG: boolean;
  /** Current Timeframe Dashboard */
  showCurrTF: boolean;
  showCurrSwing: boolean;
  showCurrVol: boolean;
  showCurrAtr: boolean;
  /** Market Context Dashboard */
  showContext: boolean;
  showSession: boolean;
  showKillzone: boolean;
  showBias: boolean;
  /** HTF Levels Dashboard */
  showHTFLevels: boolean;
  showPDHL: boolean;
  showPWHL: boolean;
  showPMHL: boolean;
  /** Trend Bias Settings */
  biasUseStruct: boolean;
  biasUseOB: boolean;
  biasUseFVG: boolean;
  biasUseEMA: boolean;
  biasUseSwing: boolean;
  /** Visual Overlays */
  showOB: boolean;
  obBullColor: string;
  obBearColor: string;
  obLookback: number;
  obExtend: number;
  showOBLabels: boolean;
  showFVG: boolean;
  fvgBullColor: string;
  fvgBearColor: string;
  fvgLookback: number;
  fvgExtend: number;
  showFVGLabels: boolean;
  showSwingLabels: boolean;
  swingBullColor: string;
  swingBearColor: string;
  swingLabelLookback: number;
  showSwingLines: boolean;
  swingLineLowColor: string;
  swingLineHighColor: string;
  swingLineStyle: LineStyleOption;
  swingLinesExtend: number;
  plotPDHL: boolean;
  pdlColor: string;
  pdhColor: string;
  pdhlLineStyle: LineStyleOption;
  plotPWHL: boolean;
  pwlColor: string;
  pwhColor: string;
  pwhlLineStyle: LineStyleOption;
  plotPMHL: boolean;
  pmlColor: string;
  pmhColor: string;
  pmhlLineStyle: LineStyleOption;
  htfLevelExtend: number;
  showEMA: boolean;
  emaColor: string;
  /** Settings */
  emaLength: number;
  swingLength: number;
  atrAvgLength: number;
  distanceMode: 'Percent' | 'Price' | 'Pips';
  dashboardPos: 'Top Left' | 'Top Center' | 'Top Right' | 'Middle Left' | 'Middle Center' | 'Middle Right' | 'Bottom Left' | 'Bottom Center' | 'Bottom Right';
  dashboardTheme: 'Dark Mode' | 'Light Mode';
  bullColor: string;
  bearColor: string;
  neutColor: string;
  sessAsianColor: string;
  sessLondonColor: string;
  sessNyColor: string;
  kzAsianColor: string;
  kzLondonColor: string;
  kzNyAmColor: string;
  kzLunchColor: string;
  kzPmColor: string;
  /** Alerts (no output) */
  alertMsdSwingBreak: boolean;
  alertMsdSwingSweep: boolean;
  alertMsdStruct: boolean;
  alertMsdOBEnter: boolean;
  alertMsdOBChange: boolean;
  alertMsdFVGEnter: boolean;
  alertMsdFVGChange: boolean;
  alertMsdEma: boolean;
  alertCtfSwingBreak: boolean;
  alertCtfSwingSweep: boolean;
  alertCtfVolume: boolean;
  alertCtfVolatility: boolean;
  alertSession: boolean;
  alertKillzone: boolean;
  alertBiasChange: boolean;
  alertHtfPDBreak: boolean;
  alertHtfPDSweep: boolean;
  alertHtfPWBreak: boolean;
  alertHtfPWSweep: boolean;
  alertHtfPMBreak: boolean;
  alertHtfPMSweep: boolean;
}

// Base colours
const GRAY = '#787b86';
const ORANGE = '#f97316';
const YELLOW = '#fbbf24';
// Trend colours (defaults)
const BULL_COLOR = '#089981';
const BEAR_COLOR = '#f23645';
const NEUT_COLOR = '#b8b8b8';
// Session colours (defaults)
const SESSION_ASIAN = '#3b82f6';
const SESSION_LONDON = '#22c55e';
const SESSION_NY = '#f97316';
const SESSION_LUNCH = '#6b7280';
const SESSION_PM = '#a855f7';
// Dashboard theme colours
const BG_DARK_DARK = String(color.rgb(30, 30, 30));
const BG_DARK_LIGHT = String(color.rgb(245, 245, 245));
const BG_HEADER_DARK = String(color.rgb(30, 30, 40));
const BG_HEADER_LIGHT = String(color.rgb(230, 230, 240));
const BG_ROW_DARK = '#1a2332';
const BG_ROW_LIGHT = '#e8edf5';
const TEXT_DARK = '#FFFFFF';
const TEXT_LIGHT = String(color.rgb(30, 30, 30));
const TABLE_BORDER = '#3d3d3d';
/** Text colour of a table cell that sets none */
const CELL_TEXT_DEFAULT = '#363A45';

export const defaultInputs: MarketStructureDashboardFluxChartsInputs = {
  tf1Enabled: true, tf1: '1', tf1Weight: 1,
  tf2Enabled: true, tf2: '5', tf2Weight: 1,
  tf3Enabled: true, tf3: '15', tf3Weight: 2,
  tf4Enabled: true, tf4: '60', tf4Weight: 2,
  tf5Enabled: true, tf5: '240', tf5Weight: 2,
  tf6Enabled: true, tf6: 'D', tf6Weight: 3,
  tf7Enabled: true, tf7: 'W', tf7Weight: 4,
  showMSD: true,
  showColEma: true,
  showColSwing: true,
  showColStruct: true,
  showColOB: true,
  showColFVG: true,
  showCurrTF: true,
  showCurrSwing: true,
  showCurrVol: true,
  showCurrAtr: true,
  showContext: true,
  showSession: true,
  showKillzone: true,
  showBias: true,
  showHTFLevels: false,
  showPDHL: true,
  showPWHL: true,
  showPMHL: false,
  biasUseStruct: true,
  biasUseOB: true,
  biasUseFVG: true,
  biasUseEMA: false,
  biasUseSwing: true,
  showOB: false,
  obBullColor: BULL_COLOR,
  obBearColor: BEAR_COLOR,
  obLookback: 6,
  obExtend: 20,
  showOBLabels: false,
  showFVG: false,
  fvgBullColor: BULL_COLOR,
  fvgBearColor: BEAR_COLOR,
  fvgLookback: 6,
  fvgExtend: 20,
  showFVGLabels: false,
  showSwingLabels: false,
  swingBullColor: BULL_COLOR,
  swingBearColor: BEAR_COLOR,
  swingLabelLookback: 10,
  showSwingLines: false,
  swingLineLowColor: BULL_COLOR,
  swingLineHighColor: BEAR_COLOR,
  swingLineStyle: '- - -',
  swingLinesExtend: 20,
  plotPDHL: false,
  pdlColor: BULL_COLOR,
  pdhColor: BEAR_COLOR,
  pdhlLineStyle: '- - -',
  plotPWHL: false,
  pwlColor: BULL_COLOR,
  pwhColor: BEAR_COLOR,
  pwhlLineStyle: '- - -',
  plotPMHL: false,
  pmlColor: BULL_COLOR,
  pmhColor: BEAR_COLOR,
  pmhlLineStyle: '- - -',
  htfLevelExtend: 20,
  showEMA: false,
  emaColor: ORANGE,
  emaLength: 9,
  swingLength: 5,
  atrAvgLength: 20,
  distanceMode: 'Percent',
  dashboardPos: 'Top Right',
  dashboardTheme: 'Dark Mode',
  bullColor: BULL_COLOR,
  bearColor: BEAR_COLOR,
  neutColor: NEUT_COLOR,
  sessAsianColor: SESSION_ASIAN,
  sessLondonColor: SESSION_LONDON,
  sessNyColor: SESSION_NY,
  kzAsianColor: SESSION_ASIAN,
  kzLondonColor: SESSION_LONDON,
  kzNyAmColor: SESSION_NY,
  kzLunchColor: SESSION_LUNCH,
  kzPmColor: SESSION_PM,
  alertMsdSwingBreak: false,
  alertMsdSwingSweep: false,
  alertMsdStruct: false,
  alertMsdOBEnter: false,
  alertMsdOBChange: false,
  alertMsdFVGEnter: false,
  alertMsdFVGChange: false,
  alertMsdEma: false,
  alertCtfSwingBreak: false,
  alertCtfSwingSweep: false,
  alertCtfVolume: false,
  alertCtfVolatility: false,
  alertSession: false,
  alertKillzone: false,
  alertBiasChange: false,
  alertHtfPDBreak: false,
  alertHtfPDSweep: false,
  alertHtfPWBreak: false,
  alertHtfPWSweep: false,
  alertHtfPMBreak: false,
  alertHtfPMSweep: false,
};

const G_TF = 'Timeframes';
const G_MSD = 'Market Structure Dashboard';
const G_CTFD = 'Current Timeframe Dashboard';
const G_MCD = 'Market Context Dashboard';
const G_HTF = 'HTF Levels Dashboard';
const G_BIAS = 'Trend Bias Settings';
const G_VO = 'Visual Overlays';
const G_SETTINGS = 'Settings';
const G_ALERT_MSD = 'Alerts: Market Structure Dashboard';
const G_ALERT_CTF = 'Alerts: Current Timeframe';
const G_ALERT_CTX = 'Alerts: Market Context';
const G_ALERT_HTF = 'Alerts: HTF Levels';

const LINE_STYLE_OPTIONS = ['────', '- - -', '····'];
const POSITION_OPTIONS = ['Top Left', 'Top Center', 'Top Right', 'Middle Left', 'Middle Center', 'Middle Right', 'Bottom Left', 'Bottom Center', 'Bottom Right'];
const HTF_LINES_ON = { any: ['plotPDHL', 'plotPWHL', 'plotPMHL'] };

const timeframeInputs = (k: number, tf: string, weight: number): InputConfig[] => [
  { id: `tf${k}Enabled`, type: 'bool', title: '', defval: true, group: G_TF, inline: `tf${k}`, display: 'none' },
  { id: `tf${k}`, type: 'timeframe', title: '', defval: tf, group: G_TF, inline: `tf${k}`, display: 'none', active: `tf${k}Enabled` },
  { id: `tf${k}Weight`, type: 'int', title: 'Trend Weight', defval: weight, min: 0, max: 10, group: G_TF, inline: `tf${k}`, display: 'none', active: `tf${k}Enabled` },
];

// Some titles of the original end with en / thin / hair spaces (alignment of the settings): written as escapes
export const inputConfig: InputConfig[] = [
  ...timeframeInputs(1, '1', 1),
  ...timeframeInputs(2, '5', 1),
  ...timeframeInputs(3, '15', 2),
  ...timeframeInputs(4, '60', 2),
  ...timeframeInputs(5, '240', 2),
  ...timeframeInputs(6, 'D', 3),
  ...timeframeInputs(7, 'W', 4),

  { id: 'showMSD', type: 'bool', title: 'Enable', defval: true, group: G_MSD, display: 'none' },
  { id: 'showColEma', type: 'bool', title: 'EMA Trend', defval: true, group: G_MSD, inline: 'msdCols1', display: 'none', active: 'showMSD' },
  { id: 'showColSwing', type: 'bool', title: 'Swing H/L', defval: true, group: G_MSD, inline: 'msdCols1', display: 'none', active: 'showMSD' },
  { id: 'showColStruct', type: 'bool', title: 'Structure', defval: true, group: G_MSD, inline: 'msdCols1', display: 'none', active: 'showMSD' },
  { id: 'showColOB', type: 'bool', title: 'Order Block', defval: true, group: G_MSD, inline: 'msdCols2', display: 'none', active: 'showMSD' },
  { id: 'showColFVG', type: 'bool', title: 'FVG', defval: true, group: G_MSD, inline: 'msdCols2', display: 'none', active: 'showMSD' },

  { id: 'showCurrTF', type: 'bool', title: 'Enable', defval: true, group: G_CTFD, display: 'none' },
  { id: 'showCurrSwing', type: 'bool', title: 'Swing H/L', defval: true, group: G_CTFD, inline: 'currCols', display: 'none', active: 'showCurrTF' },
  { id: 'showCurrVol', type: 'bool', title: 'Volume', defval: true, group: G_CTFD, inline: 'currCols', display: 'none', active: 'showCurrTF' },
  { id: 'showCurrAtr', type: 'bool', title: 'Volatility', defval: true, group: G_CTFD, inline: 'currCols', display: 'none', active: 'showCurrTF' },

  { id: 'showContext', type: 'bool', title: 'Enable', defval: true, group: G_MCD, display: 'none' },
  { id: 'showSession', type: 'bool', title: 'Session', defval: true, group: G_MCD, inline: 'ctxCols', display: 'none', active: 'showContext' },
  { id: 'showKillzone', type: 'bool', title: 'Killzone', defval: true, group: G_MCD, inline: 'ctxCols', display: 'none', active: 'showContext' },
  { id: 'showBias', type: 'bool', title: 'Trend Bias', defval: true, group: G_MCD, inline: 'ctxCols', display: 'none', active: 'showContext' },

  { id: 'showHTFLevels', type: 'bool', title: 'Enable', defval: false, group: G_HTF, display: 'none' },
  { id: 'showPDHL', type: 'bool', title: 'PDH/L', defval: true, group: G_HTF, inline: 'htfCols', display: 'none', active: 'showHTFLevels' },
  { id: 'showPWHL', type: 'bool', title: 'PWH/L', defval: true, group: G_HTF, inline: 'htfCols', display: 'none', active: 'showHTFLevels' },
  { id: 'showPMHL', type: 'bool', title: 'PMH/L', defval: false, group: G_HTF, inline: 'htfCols', display: 'none', active: 'showHTFLevels' },

  { id: 'biasUseStruct', type: 'bool', title: 'Structure', defval: true, group: G_BIAS, inline: 'biasFactors1', display: 'none' },
  { id: 'biasUseOB', type: 'bool', title: 'Order Block', defval: true, group: G_BIAS, inline: 'biasFactors1', display: 'none' },
  { id: 'biasUseFVG', type: 'bool', title: 'FVG', defval: true, group: G_BIAS, inline: 'biasFactors1', display: 'none' },
  { id: 'biasUseEMA', type: 'bool', title: 'EMA Trend', defval: false, group: G_BIAS, inline: 'biasFactors2', display: 'none' },
  { id: 'biasUseSwing', type: 'bool', title: 'Swing H/L', defval: true, group: G_BIAS, inline: 'biasFactors2', display: 'none' },

  { id: 'emaLength', type: 'int', title: 'EMA Length', defval: 9, min: 1, group: G_SETTINGS, display: 'none' },
  { id: 'swingLength', type: 'int', title: 'Swing Length', defval: 5, min: 1, group: G_SETTINGS, tooltip: 'Used for Swing H/L detection, Order Blocks, and Structure', display: 'none' },
  { id: 'atrAvgLength', type: 'int', title: 'Volatility Lookback', defval: 20, min: 1, group: G_SETTINGS, tooltip: 'Period for averaging ATR to determine volatility state', display: 'none' },
  { id: 'distanceMode', type: 'string', title: 'Distance Display', defval: 'Percent', options: ['Percent', 'Price', 'Pips'], group: G_SETTINGS, tooltip: 'Show distances as percentage, price, or pips (forex)', display: 'none' },
  { id: 'dashboardPos', type: 'string', title: 'Dashboard Position', defval: 'Top Right', options: POSITION_OPTIONS, group: G_SETTINGS, display: 'none' },
  { id: 'dashboardTheme', type: 'string', title: 'Dashboard Colors', defval: 'Dark Mode', options: ['Dark Mode', 'Light Mode'], group: G_SETTINGS, display: 'none' },
  { id: 'bullColor', type: 'color', title: 'Trend Colors\u2002\u2002\u2009', defval: BULL_COLOR, group: G_SETTINGS, inline: 'trendColors', display: 'none' },
  { id: 'bearColor', type: 'color', title: '', defval: BEAR_COLOR, group: G_SETTINGS, inline: 'trendColors', display: 'none' },
  { id: 'neutColor', type: 'color', title: '', defval: NEUT_COLOR, group: G_SETTINGS, inline: 'trendColors', display: 'none' },
  { id: 'sessAsianColor', type: 'color', title: 'Session Colors\u2002', defval: SESSION_ASIAN, group: G_SETTINGS, inline: 'sessionColors', tooltip: 'Colors for Asian, London, NY sessions', display: 'none' },
  { id: 'sessLondonColor', type: 'color', title: '', defval: SESSION_LONDON, group: G_SETTINGS, inline: 'sessionColors', display: 'none' },
  { id: 'sessNyColor', type: 'color', title: '', defval: SESSION_NY, group: G_SETTINGS, inline: 'sessionColors', display: 'none' },
  { id: 'kzAsianColor', type: 'color', title: 'Killzone Colors\u200a', defval: SESSION_ASIAN, group: G_SETTINGS, inline: 'kzColors', tooltip: 'Colors for Asian, London, NY AM, NY Lunch, NY PM killzones', display: 'none' },
  { id: 'kzLondonColor', type: 'color', title: '', defval: SESSION_LONDON, group: G_SETTINGS, inline: 'kzColors', display: 'none' },
  { id: 'kzNyAmColor', type: 'color', title: '', defval: SESSION_NY, group: G_SETTINGS, inline: 'kzColors', display: 'none' },
  { id: 'kzLunchColor', type: 'color', title: '', defval: SESSION_LUNCH, group: G_SETTINGS, inline: 'kzColors', display: 'none' },
  { id: 'kzPmColor', type: 'color', title: '', defval: SESSION_PM, group: G_SETTINGS, inline: 'kzColors', display: 'none' },

  { id: 'showOB', type: 'bool', title: 'Order Blocks', defval: false, group: G_VO, inline: 'ob', tooltip: 'Display Order Block zones on chart', display: 'none' },
  { id: 'obBullColor', type: 'color', title: '', defval: BULL_COLOR, group: G_VO, inline: 'ob', display: 'none', active: 'showOB' },
  { id: 'obBearColor', type: 'color', title: '', defval: BEAR_COLOR, group: G_VO, inline: 'ob', display: 'none', active: 'showOB' },
  { id: 'obLookback', type: 'int', title: '└ Show Last', defval: 6, min: 1, max: 20, group: G_VO, inline: 'obOpts', tooltip: 'Number of recent Order Blocks to display', display: 'none', active: 'showOB' },
  { id: 'obExtend', type: 'int', title: 'Extend', defval: 20, min: 1, group: G_VO, inline: 'obOpts', tooltip: 'Bars to extend Order Block zones into the future', display: 'none', active: 'showOB' },
  { id: 'showOBLabels', type: 'bool', title: '└ Labels', defval: false, group: G_VO, tooltip: 'Show OB labels inside Order Block zones', display: 'none', active: 'showOB' },

  { id: 'showFVG', type: 'bool', title: 'FVGs\u2002\u2002\u2002\u2002\u2002\u2002\u2002', defval: false, group: G_VO, inline: 'fvg', tooltip: 'Display Fair Value Gap zones on chart', display: 'none' },
  { id: 'fvgBullColor', type: 'color', title: '', defval: BULL_COLOR, group: G_VO, inline: 'fvg', display: 'none', active: 'showFVG' },
  { id: 'fvgBearColor', type: 'color', title: '', defval: BEAR_COLOR, group: G_VO, inline: 'fvg', display: 'none', active: 'showFVG' },
  { id: 'fvgLookback', type: 'int', title: '└ Show Last', defval: 6, min: 1, max: 20, group: G_VO, inline: 'fvgOpts', tooltip: 'Number of recent FVGs to display', display: 'none', active: 'showFVG' },
  { id: 'fvgExtend', type: 'int', title: 'Extend', defval: 20, min: 1, group: G_VO, inline: 'fvgOpts', tooltip: 'Bars to extend FVG zones into the future', display: 'none', active: 'showFVG' },
  { id: 'showFVGLabels', type: 'bool', title: '└ Labels', defval: false, group: G_VO, tooltip: 'Show FVG labels inside Fair Value Gap zones', display: 'none', active: 'showFVG' },

  { id: 'showSwingLabels', type: 'bool', title: 'Swing Labels', defval: false, group: G_VO, inline: 'swingLabels', tooltip: 'Display HH/HL/LH/LL labels at swing points', display: 'none' },
  { id: 'swingBullColor', type: 'color', title: '', defval: BULL_COLOR, group: G_VO, inline: 'swingLabels', display: 'none', active: 'showSwingLabels' },
  { id: 'swingBearColor', type: 'color', title: '', defval: BEAR_COLOR, group: G_VO, inline: 'swingLabels', display: 'none', active: 'showSwingLabels' },
  { id: 'swingLabelLookback', type: 'int', title: '└ Show Last', defval: 10, min: 1, max: 500, group: G_VO, tooltip: 'Number of recent swing labels to display', display: 'none', active: 'showSwingLabels' },

  { id: 'showSwingLines', type: 'bool', title: 'Swing Lines\u2002', defval: false, group: G_VO, inline: 'swingLines', tooltip: 'Draw horizontal lines at recent swing high/low levels', display: 'none' },
  { id: 'swingLineLowColor', type: 'color', title: '', defval: BULL_COLOR, group: G_VO, inline: 'swingLines', display: 'none', active: 'showSwingLines' },
  { id: 'swingLineHighColor', type: 'color', title: '', defval: BEAR_COLOR, group: G_VO, inline: 'swingLines', display: 'none', active: 'showSwingLines' },
  { id: 'swingLineStyle', type: 'string', title: '', defval: '- - -', options: LINE_STYLE_OPTIONS, group: G_VO, inline: 'swingLines', display: 'none', active: 'showSwingLines' },
  { id: 'swingLinesExtend', type: 'int', title: '└ Extend', defval: 20, min: 1, group: G_VO, tooltip: 'Bars to extend swing lines into the future', display: 'none', active: 'showSwingLines' },

  { id: 'plotPDHL', type: 'bool', title: 'Previous Day High/Low\u2002\u2002', defval: false, group: G_VO, inline: 'pdhl', display: 'none' },
  { id: 'pdlColor', type: 'color', title: '', defval: BULL_COLOR, group: G_VO, inline: 'pdhl', display: 'none', active: 'plotPDHL' },
  { id: 'pdhColor', type: 'color', title: '', defval: BEAR_COLOR, group: G_VO, inline: 'pdhl', display: 'none', active: 'plotPDHL' },
  { id: 'pdhlLineStyle', type: 'string', title: '', defval: '- - -', options: LINE_STYLE_OPTIONS, group: G_VO, inline: 'pdhl', display: 'none', active: 'plotPDHL' },

  { id: 'plotPWHL', type: 'bool', title: 'Previous Week High/Low\u2009\u200a', defval: false, group: G_VO, inline: 'pwhl', display: 'none' },
  { id: 'pwlColor', type: 'color', title: '', defval: BULL_COLOR, group: G_VO, inline: 'pwhl', display: 'none', active: 'plotPWHL' },
  { id: 'pwhColor', type: 'color', title: '', defval: BEAR_COLOR, group: G_VO, inline: 'pwhl', display: 'none', active: 'plotPWHL' },
  { id: 'pwhlLineStyle', type: 'string', title: '', defval: '- - -', options: LINE_STYLE_OPTIONS, group: G_VO, inline: 'pwhl', display: 'none', active: 'plotPWHL' },

  { id: 'plotPMHL', type: 'bool', title: 'Previous Month High/Low', defval: false, group: G_VO, inline: 'pmhl', tooltip: 'Plot previous month high and low levels', display: 'none' },
  { id: 'pmlColor', type: 'color', title: '', defval: BULL_COLOR, group: G_VO, inline: 'pmhl', display: 'none', active: 'plotPMHL' },
  { id: 'pmhColor', type: 'color', title: '', defval: BEAR_COLOR, group: G_VO, inline: 'pmhl', display: 'none', active: 'plotPMHL' },
  { id: 'pmhlLineStyle', type: 'string', title: '', defval: '- - -', options: LINE_STYLE_OPTIONS, group: G_VO, inline: 'pmhl', display: 'none', active: 'plotPMHL' },

  { id: 'htfLevelExtend', type: 'int', title: '└ HTF Extend', defval: 20, min: 1, group: G_VO, tooltip: 'Bars to extend HTF level lines into the future. Labels auto-combine when levels are close.', display: 'none', active: HTF_LINES_ON },

  { id: 'showEMA', type: 'bool', title: 'EMA', defval: false, group: G_VO, inline: 'ema', display: 'none' },
  { id: 'emaColor', type: 'color', title: '', defval: ORANGE, group: G_VO, inline: 'ema', display: 'none', active: 'showEMA' },

  { id: 'alertMsdSwingBreak', type: 'bool', title: 'Swing Breaks', defval: false, group: G_ALERT_MSD, inline: 'aMsdSwing', display: 'none' },
  { id: 'alertMsdSwingSweep', type: 'bool', title: 'Swing Sweeps', defval: false, group: G_ALERT_MSD, inline: 'aMsdSwing', tooltip: 'Alert when swing high/low is broken or swept & reclaimed on any active timeframe', display: 'none' },
  { id: 'alertMsdStruct', type: 'bool', title: 'Structure Bias Change', defval: false, group: G_ALERT_MSD, tooltip: 'Alert when structure bias changes (Bullish/Bearish/Neutral) on any active timeframe', display: 'none' },
  { id: 'alertMsdOBEnter', type: 'bool', title: 'Price in OB', defval: false, group: G_ALERT_MSD, inline: 'aMsdOB', display: 'none' },
  { id: 'alertMsdOBChange', type: 'bool', title: 'OB Direction Change', defval: false, group: G_ALERT_MSD, inline: 'aMsdOB', tooltip: 'Alert when price enters an OB zone or nearest OB direction changes on any active timeframe', display: 'none' },
  { id: 'alertMsdFVGEnter', type: 'bool', title: 'Price in FVG', defval: false, group: G_ALERT_MSD, inline: 'aMsdFVG', display: 'none' },
  { id: 'alertMsdFVGChange', type: 'bool', title: 'FVG Direction Change', defval: false, group: G_ALERT_MSD, inline: 'aMsdFVG', tooltip: 'Alert when price enters an FVG zone or nearest FVG direction changes on any active timeframe', display: 'none' },
  { id: 'alertMsdEma', type: 'bool', title: 'EMA Trend Change', defval: false, group: G_ALERT_MSD, tooltip: 'Alert when EMA trend direction flips on any active timeframe', display: 'none' },

  { id: 'alertCtfSwingBreak', type: 'bool', title: 'Swing Breaks', defval: false, group: G_ALERT_CTF, inline: 'aCtfSwing', display: 'none' },
  { id: 'alertCtfSwingSweep', type: 'bool', title: 'Swing Sweeps', defval: false, group: G_ALERT_CTF, inline: 'aCtfSwing', tooltip: 'Alert when current TF swing high/low is broken or swept & reclaimed', display: 'none' },
  { id: 'alertCtfVolume', type: 'bool', title: 'Volume State Change', defval: false, group: G_ALERT_CTF, tooltip: 'Alert when volume state changes (Extreme/High/Normal/Low/Very Low)', display: 'none' },
  { id: 'alertCtfVolatility', type: 'bool', title: 'Volatility State Change', defval: false, group: G_ALERT_CTF, tooltip: 'Alert when volatility state changes (High/Normal/Low)', display: 'none' },

  { id: 'alertSession', type: 'bool', title: 'Session Change', defval: false, group: G_ALERT_CTX, inline: 'aCtxSessKz', display: 'none' },
  { id: 'alertKillzone', type: 'bool', title: 'Killzone Change', defval: false, group: G_ALERT_CTX, inline: 'aCtxSessKz', tooltip: 'Alert when trading session or killzone changes', display: 'none' },
  { id: 'alertBiasChange', type: 'bool', title: 'Bias State Change', defval: false, group: G_ALERT_CTX, tooltip: 'Alert when trend bias state changes (Bullish/Lean Bull/Neutral/Lean Bear/Bearish)', display: 'none' },

  { id: 'alertHtfPDBreak', type: 'bool', title: 'PDH/L Breaks', defval: false, group: G_ALERT_HTF, inline: 'aHtfPD', display: 'none' },
  { id: 'alertHtfPDSweep', type: 'bool', title: 'PDH/L Sweeps', defval: false, group: G_ALERT_HTF, inline: 'aHtfPD', tooltip: 'Alert when Previous Day High/Low is broken or swept & reclaimed', display: 'none' },
  { id: 'alertHtfPWBreak', type: 'bool', title: 'PWH/L Breaks', defval: false, group: G_ALERT_HTF, inline: 'aHtfPW', display: 'none' },
  { id: 'alertHtfPWSweep', type: 'bool', title: 'PWH/L Sweeps', defval: false, group: G_ALERT_HTF, inline: 'aHtfPW', tooltip: 'Alert when Previous Week High/Low is broken or swept & reclaimed', display: 'none' },
  { id: 'alertHtfPMBreak', type: 'bool', title: 'PMH/L Breaks', defval: false, group: G_ALERT_HTF, inline: 'aHtfPM', display: 'none' },
  { id: 'alertHtfPMSweep', type: 'bool', title: 'PMH/L Sweeps', defval: false, group: G_ALERT_HTF, inline: 'aHtfPM', tooltip: 'Alert when Previous Month High/Low is broken or swept & reclaimed', display: 'none' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA', color: ORANGE, lineWidth: 2 },
];

export const metadata = {
  title: 'Market Structure Dashboard | Flux Charts',
  shortTitle: 'Market Structure Dashboard | Flux Charts',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** str.repeat: a count of 0 or na gives na, which adds nothing to a text */
const rep = (s: string, count: number) => (count > 0 ? s.repeat(count) : '');

const ATR_LENGTH = 3;
const VOLUME_LENGTH = 20;
/** Start value of the nearest-zone search of the original */
const FAR = 100000.0;

const POSITIONS: Record<string, TablePosition> = {
  'Top Left': 'top_left',
  'Top Center': 'top_center',
  'Top Right': 'top_right',
  'Middle Left': 'middle_left',
  'Middle Center': 'middle_center',
  'Middle Right': 'middle_right',
  'Bottom Left': 'bottom_left',
  'Bottom Center': 'bottom_center',
  'Bottom Right': 'bottom_right',
};

const LINE_STYLES: Record<string, 'solid' | 'dashed' | 'dotted'> = { '────': 'solid', '- - -': 'dashed', '····': 'dotted' };

/** ZoneBlock: an order block or a fair value gap */
interface Zone { dir: number; top: number; bottom: number; barIdx: number }
interface SwingLabel { x: number; y: number; text: string; isHigh: boolean; bull: boolean }

/** calcAll(): what a row of the dashboard reads on one bar of a timeframe (all na without a completed bar) */
interface Reading {
  trendDir: number;
  trendDist: number;
  swingH: number;
  swingL: number;
  structBias: number;
  struct1: string;
  struct2: string;
  struct3: string;
  obNearDir: number;
  obNearDist: number;
  fvgNearDir: number;
  fvgNearDist: number;
  reclaimLow: boolean;
  reclaimHigh: boolean;
}

const NA_READING: Reading = {
  trendDir: NaN, trendDist: NaN, swingH: NaN, swingL: NaN, structBias: NaN, struct1: '', struct2: '', struct3: '',
  obNearDir: NaN, obNearDist: NaN, fvgNearDir: NaN, fvgNearDist: NaN, reclaimLow: false, reclaimHigh: false,
};

/** State of the structure functions after bar `upto` of a series of bars */
interface Analysis {
  reading: Reading;
  ema: number[];
  currH: number;
  currL: number;
  obs: Zone[];
  fvgs: Zone[];
  swingLabels: SwingLabel[];
  lastHBar: number;
  lastLBar: number;
}

interface AnalysisSettings { emaLength: number; swingLength: number; obMax: number; fvgMax: number; labelMax: number }

/** findNearestZone(): direction and signed distance of the zone nearest to the close */
function nearestZone(zones: Zone[], close: number): [number, number] {
  let nearestBull = FAR;
  let nearestBear = FAR;
  for (const zone of zones) {
    if (zone.dir === 1) {
      const dist = zone.top - close;
      if (lt(Math.abs(dist), Math.abs(nearestBull))) nearestBull = dist;
    } else {
      const dist = zone.bottom - close;
      if (lt(Math.abs(dist), Math.abs(nearestBear))) nearestBear = dist;
    }
  }
  if (lt(Math.abs(nearestBull), Math.abs(nearestBear)) && lt(Math.abs(nearestBull), FAR)) return [1, nearestBull];
  if (lt(Math.abs(nearestBear), FAR)) return [-1, nearestBear];
  return [0, 0];
}

/**
 * The swing, structure, order block and fair value gap functions of the original, run on bars 0 to `upto` of one
 * timeframe. Every call of these functions in the original keeps its own state with the same rules, so one run
 * gives the dashboard row of the timeframe and, on the chart bars, the drawings.
 */
function analyse(bars: Bar[], upto: number, cfg: AnalysisSettings): Analysis {
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const open = bars.map((b) => b.open);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const L = cfg.swingLength;
  const ema = A(ta.ema(Series.fromArray(bars, close), cfg.emaLength));
  const pivotHigh = A(ta.pivothigh(Series.fromArray(bars, high), L, L));
  const pivotLow = A(ta.pivotlow(Series.fromArray(bars, low), L, L));

  // _green / _red of bar j (false before the first bar)
  const green = (j: number) => j >= 0 && (gt(close[j], open[j]) || (j > 0 && gt(close[j], close[j - 1])));
  const red = (j: number) => j >= 0 && (lt(close[j], open[j]) || (j > 0 && lt(close[j], close[j - 1])));

  // SwingData (calcSwingHL and calcStructure keep the same values)
  let prevH = NaN;
  let currH = NaN;
  let prevL = NaN;
  let currL = NaN;
  let lowBroken = false;
  let highBroken = false;
  let reclaimLow = false;
  let reclaimHigh = false;
  // calcStructure
  let struct1 = '--';
  let struct2 = '--';
  let struct3 = '--';
  let highType = 0;
  let lowType = 0;
  // PivotData of the order blocks
  let lastPH = NaN;
  let lastPHBar = NaN;
  let lastPL = NaN;
  let lastPLBar = NaN;
  const obs: Zone[] = [];
  const fvgs: Zone[] = [];
  const swingLabels: SwingLabel[] = [];
  let lastHBar = NaN;
  let lastLBar = NaN;

  for (let i = 0; i <= upto; i++) {
    const c = close[i];
    const c1 = i > 0 ? close[i - 1] : NaN;
    const newSwingH = !isNaN(pivotHigh[i]);
    const newSwingL = !isNaN(pivotLow[i]);

    // calcSwingHL()
    if (newSwingH) {
      prevH = currH;
      currH = pivotHigh[i];
      highBroken = false;
    }
    if (newSwingL) {
      prevL = currL;
      currL = pivotLow[i];
      lowBroken = false;
    }
    if (lt(low[i], currL)) lowBroken = true;
    if (gt(high[i], currH)) highBroken = true;
    reclaimLow = lowBroken && gt(c, currL);
    reclaimHigh = highBroken && lt(c, currH);

    // Swing labels and the bars of the swing lines
    if (newSwingH) {
      lastHBar = i - L;
      const lower = !isNaN(prevH) && lt(currH, prevH);
      swingLabels.push({ x: i - L, y: currH, text: lower ? 'LH' : 'HH', isHigh: true, bull: !lower });
      if (swingLabels.length > cfg.labelMax) swingLabels.shift();
    }
    if (newSwingL) {
      lastLBar = i - L;
      const lower = !isNaN(prevL) && lt(currL, prevL);
      swingLabels.push({ x: i - L, y: currL, text: lower ? 'LL' : 'HL', isHigh: false, bull: !lower });
      if (swingLabels.length > cfg.labelMax) swingLabels.shift();
    }

    // calcStructure(): the last three swing labels
    if (newSwingH && !isNaN(prevH)) {
      highType = gt(currH, prevH) ? 1 : -1;
      struct3 = struct2;
      struct2 = struct1;
      struct1 = highType > 0 ? 'HH' : 'LH';
    }
    if (newSwingL && !isNaN(prevL)) {
      lowType = gt(currL, prevL) ? 1 : -1;
      struct3 = struct2;
      struct2 = struct1;
      struct1 = lowType > 0 ? 'HL' : 'LL';
    }

    // trackPivotBreaks(): the close crosses the last pivot
    if (newSwingH) {
      lastPH = pivotHigh[i];
      lastPHBar = i - L;
    }
    if (newSwingL) {
      lastPL = pivotLow[i];
      lastPLBar = i - L;
    }
    let bullBreak = false;
    let bearBreak = false;
    let bullBar = 0;
    let bearBar = 0;
    if (!isNaN(lastPH) && gt(c, lastPH) && le(c1, lastPH) && !isNaN(lastPHBar)) {
      bullBreak = true;
      bullBar = lastPHBar;
      lastPH = NaN;
      lastPHBar = NaN;
    }
    if (!isNaN(lastPL) && lt(c, lastPL) && ge(c1, lastPL) && !isNaN(lastPLBar)) {
      bearBreak = true;
      bearBar = lastPLBar;
      lastPL = NaN;
      lastPLBar = NaN;
    }

    // detectOB(): the lowest (highest) candle since the pivot, at most 50 bars back
    const detectOB = (dir: number, pivotBar: number): void => {
      const barsBack = i - pivotBar - 1;
      let price = dir > 0 ? low[i] : high[i];
      let otherPrice = dir > 0 ? high[i] : low[i];
      let barIdx = i;
      for (let k = 0; k <= Math.max(0, Math.min(barsBack, 50)); k++) {
        const j = i - k;
        if (j < 0) break;
        if (dir > 0 ? lt(low[j], price) : gt(high[j], price)) {
          price = dir > 0 ? low[j] : high[j];
          otherPrice = dir > 0 ? high[j] : low[j];
          barIdx = j;
        }
      }
      const top = dir > 0 ? otherPrice : price;
      const bottom = dir > 0 ? price : otherPrice;
      // hasOverlappingOB()
      if (obs.some((ob) => ob.dir === dir && ge(top, ob.bottom) && le(bottom, ob.top))) return;
      obs.unshift({ dir, top, bottom, barIdx });
      if (obs.length > cfg.obMax) obs.pop();
    };
    if (bullBreak) detectOB(1, bullBar);
    if (bearBreak) detectOB(-1, bearBar);
    // mitigateOBs()
    for (let k = obs.length - 1; k >= 0; k--) {
      const ob = obs[k];
      if ((ob.dir === 1 && lt(c, ob.bottom)) || (ob.dir === -1 && gt(c, ob.top))) obs.splice(k, 1);
    }

    // detectFVGSignal()
    if (i >= 3) {
      const bullFVG = gt(low[i - 1], high[i - 3]) && green(i - 2) && lt(low[i - 1], high[i - 2]) && lt(low[i - 2], high[i - 3]);
      const bearFVG = lt(high[i - 1], low[i - 3]) && red(i - 2) && gt(high[i - 1], low[i - 2]) && gt(high[i - 2], low[i - 3]);
      let zone: Zone | null = null;
      if (bullFVG) zone = { dir: 1, top: low[i - 1], bottom: high[i - 3], barIdx: i - 3 };
      if (bearFVG) zone = { dir: -1, top: low[i - 3], bottom: high[i - 1], barIdx: i - 3 };
      if (zone) {
        fvgs.unshift(zone);
        if (fvgs.length > cfg.fvgMax) fvgs.pop();
      }
    }
    // mitigateFVGs()
    for (let k = fvgs.length - 1; k >= 0; k--) {
      const fvg = fvgs[k];
      if ((fvg.dir === 1 && lt(low[i], fvg.bottom)) || (fvg.dir === -1 && gt(high[i], fvg.top))) fvgs.splice(k, 1);
    }
  }

  let reading = NA_READING;
  if (upto >= 0) {
    const c = close[upto];
    // Real-time structure override: a close beyond the previous swing
    let rtHighType = highType;
    let rtLowType = lowType;
    let rtStruct1 = struct1;
    let rtStruct2 = struct2;
    let rtStruct3 = struct3;
    if (!isNaN(prevL) && lt(c, prevL)) {
      rtLowType = -1;
      rtStruct3 = struct2;
      rtStruct2 = struct1;
      rtStruct1 = 'LL';
    }
    if (!isNaN(prevH) && gt(c, prevH)) {
      rtHighType = 1;
      rtStruct3 = struct2;
      rtStruct2 = struct1;
      rtStruct1 = 'HH';
    }
    const structBias = rtHighType === 1 && rtLowType === 1 ? 1 : rtHighType === -1 && rtLowType === -1 ? -1 : 0;
    const [obNearDir, obNearDist] = nearestZone(obs, c);
    const [fvgNearDir, fvgNearDist] = nearestZone(fvgs, c);
    reading = {
      trendDir: gt(c, ema[upto]) ? 1 : -1,
      trendDist: c - ema[upto],
      swingH: currH,
      swingL: currL,
      structBias,
      struct1: rtStruct1,
      struct2: rtStruct2,
      struct3: rtStruct3,
      obNearDir,
      obNearDist,
      fvgNearDir,
      fvgNearDist,
      reclaimLow,
      reclaimHigh,
    };
  }
  return { reading, ema, currH, currL, obs, fvgs, swingLabels, lastHBar, lastLBar };
}

/** The periods of a timeframe above the chart timeframe on the chart bars */
interface Periods {
  /** Index of the period of each chart bar */
  group: number[];
  /** Chart bars that show a period without being part of its bar (after the bar that completed it) */
  skip: boolean[];
  /** Index of the latest completed period at the last chart bar (-1: none) */
  done: number;
}

/**
 * request.security(syminfo.tickerid, tf, ...) on a timeframe above the chart timeframe: the periods of `tf` and the
 * latest completed one at the last bar (a bar completes its period when its close reaches the end of the period).
 * From the exchange calendar of the context; without it from the UTC calendar and the bars.
 */
function periodsOf(bars: Bar[], tf: string, chart?: ChartContext): Periods {
  const n = bars.length;
  if (hasCalendar(chart)) {
    const sp = securityPeriods(bars, tf, chart);
    if (sp) return { group: sp.group, skip: sp.after, done: n > 0 ? sp.latest[n - 1] : -1 };
  }
  const starts = periodStarts(bars, tf, chart);
  const group: number[] = [];
  for (let i = 0; i < n; i++) group.push(i === 0 ? 0 : group[i - 1] + (starts[i] !== starts[i - 1] ? 1 : 0));
  const skip = bars.map(() => false);
  if (n === 0) return { group, skip, done: -1 };

  // Symbols that trade every day follow the UTC calendar: the last bar completes its period when its close time is
  // in another period. Other symbols: when the next possible bar is in another period (the next bar is on the same
  // day while the bar is earlier in the day than the last bar of the trading day before; else on the next weekday).
  const ms = bars[0].time >= 1e12;
  const toMs = (t: number) => (ms ? t : t * 1000);
  const fromMs = (t: number) => (ms ? t : t / 1000);
  const weekend = (t: number) => {
    const wd = new Date(toMs(t)).getUTCDay();
    return wd === 0 || wd === 6;
  };
  const interval = barInterval(bars);
  const everyDay = bars.some((b) => weekend(b.time)) && bars.some((b) => weekend(b.time + interval));
  const DAY = 86400000;
  const lastMs = toMs(bars[n - 1].time);
  let next = lastMs + toMs(interval);
  if (!everyDay && n > 1) {
    const day = Math.floor(lastMs / DAY) * DAY;
    let sessionOver = true;
    if (toMs(interval) < DAY) {
      let j = n - 2;
      while (j >= 0 && toMs(bars[j].time) >= day) j--;
      sessionOver = j < 0 || lastMs - day >= toMs(bars[j].time) % DAY;
    }
    if (sessionOver) {
      next = day + DAY;
      while (weekend(fromMs(next))) next += DAY;
    }
  }
  const withNext = periodStarts([...bars.slice(Math.max(0, n - 3000)), { time: fromMs(next) }], tf, chart);
  const lastCompletes = withNext[withNext.length - 1] !== withNext[withNext.length - 2];
  return { group, skip, done: lastCompletes ? group[n - 1] : group[n - 1] - 1 };
}

/** The bars of the periods (open of the first chart bar, highest high, lowest low, close of the last chart bar) */
function periodBars(bars: Bar[], periods: Periods): Bar[] {
  const htf: Bar[] = [];
  bars.forEach((b, i) => {
    if (periods.skip[i]) return;
    const g = periods.group[i];
    const cur = htf[g];
    if (!cur) {
      htf[g] = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume = (cur.volume ?? NaN) + (b.volume ?? NaN);
    }
  });
  // a period that only has skipped bars cannot happen (its first bar is never after a completing bar)
  return htf;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketStructureDashboardFluxChartsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const lines: LineDrawingData[] = [];
  const boxes: BoxData[] = [];
  const labels: LabelData[] = [];
  const tables: TableData[] = [];
  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const result = () => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    lines,
    boxes,
    labels,
    tables,
  });
  if (n === 0) return result();

  const MINTICK = mintickOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const lastClose = close[last];
  const at = (index: number) => (index >= 0 && index <= last ? bars[index].time : barTime(bars, index));

  // Chart timeframe in seconds (timeframe.in_seconds()); na when the bars do not tell it
  const chartTf = chartTimeframe(bars, chart);
  const chartSeconds = chartTf === '' ? NaN : timeframe.in_seconds(chartTf);
  const secondsOf = (tf: string) => (tf.trim() === '' ? chartSeconds : timeframe.in_seconds(tf));

  // Dashboard theme colours
  const dark = cfg.dashboardTheme === 'Dark Mode';
  const bgDark = dark ? BG_DARK_DARK : BG_DARK_LIGHT;
  const bgHeader = dark ? BG_HEADER_DARK : BG_HEADER_LIGHT;
  const bgRow = dark ? BG_ROW_DARK : BG_ROW_LIGHT;
  const textCol = dark ? TEXT_DARK : TEXT_LIGHT;
  const rowLabelBg = String(color.new(bgRow, 15));
  const { bullColor, bearColor, neutColor } = cfg;

  const settings: AnalysisSettings = {
    emaLength: cfg.emaLength, swingLength: cfg.swingLength, obMax: cfg.obLookback, fvgMax: cfg.fvgLookback,
    labelMax: cfg.swingLabelLookback,
  };
  // The chart timeframe: the current swing range, the zones and the swing labels of the drawings
  const own = analyse(bars, last, settings);

  // tfActive(): an enabled timeframe that is not below the chart timeframe
  const timeframes = [
    { enabled: cfg.tf1Enabled, tf: cfg.tf1, weight: cfg.tf1Weight },
    { enabled: cfg.tf2Enabled, tf: cfg.tf2, weight: cfg.tf2Weight },
    { enabled: cfg.tf3Enabled, tf: cfg.tf3, weight: cfg.tf3Weight },
    { enabled: cfg.tf4Enabled, tf: cfg.tf4, weight: cfg.tf4Weight },
    { enabled: cfg.tf5Enabled, tf: cfg.tf5, weight: cfg.tf5Weight },
    { enabled: cfg.tf6Enabled, tf: cfg.tf6, weight: cfg.tf6Weight },
    { enabled: cfg.tf7Enabled, tf: cfg.tf7, weight: cfg.tf7Weight },
  ].map((t) => ({ ...t, active: t.enabled && chartSeconds <= secondsOf(t.tf) }));

  // MTF data requests: calcAll() on the latest completed bar of each active timeframe
  const readings = timeframes.map((t): Reading => {
    if (!t.active) return NA_READING;
    if (secondsOf(t.tf) === chartSeconds) return own.reading;
    const periods = periodsOf(bars, t.tf, chart);
    // On a last bar that receives live updates the request gives the bar in progress of the timeframe
    const shown = chart?.realtime ? periods.group[last] : periods.done;
    return analyse(periodBars(bars, periods), shown, settings).reading;
  });

  // Distances
  const pct = (value: number, base: number) => (value / base) * 100;
  const priceToPct = (priceVal: number) => (priceVal / lastClose) * 100;
  const pipSize = MINTICK * (tickerOf(chart).includes('JPY') ? 100 : 10);
  const priceToPips = (priceVal: number) => priceVal / pipSize;
  const dirColor = (dir: number) => (dir > 0 ? bullColor : dir < 0 ? bearColor : neutColor);

  const fmtTF = (tf: string): string => {
    switch (tf) {
      case '1': return '1M';
      case '3': return '3M';
      case '5': return '5M';
      case '15': return '15M';
      case '30': return '30M';
      case '45': return '45M';
      case '60': return '1H';
      case '120': return '2H';
      case '180': return '3H';
      case '240': return '4H';
      default: return tf;
    }
  };

  const fmtPct = (dir: number, priceDist: number): string => {
    const arrow = dir > 0 ? ' ↑' : ' ↓';
    switch (cfg.distanceMode) {
      case 'Price': return str.tostring(Math.abs(priceDist), '#.##') + arrow;
      case 'Pips': return `${str.tostring(Math.abs(priceToPips(priceDist)), '#.#')} pips${arrow}`;
      default: return `${str.tostring(priceToPct(priceDist), '#.##')}%${arrow}`;
    }
  };

  // The position of the close in a range, as a bar of 9 characters
  const fmtSwingBar = (swingH: number, swingL: number, reclaimLow: boolean, reclaimHigh: boolean): [string, string, number] => {
    const swingRange = Math.max(swingH - swingL, MINTICK);
    const rawPct = pct(lastClose - swingL, swingRange);
    const barCount = 9;
    const inside = () => {
      const pos = math.round(rawPct / 100 * (barCount - 1));
      return `${rep('─', pos)}⬤${rep('─', barCount - 1 - pos)}`;
    };
    if (lt(rawPct, 0)) return [`↓ L ${rep('─', barCount)} H  `, bearColor, rawPct];
    if (gt(rawPct, 100)) return [`  L ${rep('─', barCount)} H ↑`, bullColor, rawPct];
    if (reclaimLow) return [`⤴ L ${inside()} H  `, bullColor, rawPct];
    if (reclaimHigh) return [`  L ${inside()} H ⤵`, bearColor, rawPct];
    return [`  L ${inside()} H  `, ge(rawPct, 50) ? bearColor : bullColor, rawPct];
  };

  const fmtStructure = (r: Reading): string => {
    const arrow = r.structBias === 1 ? ' ↑' : r.structBias === -1 ? ' ↓' : ' →';
    return `${r.struct3}-${r.struct2}-${r.struct1}${arrow}`;
  };

  const distText = (dist: number, pattern: string): string => {
    switch (cfg.distanceMode) {
      case 'Price': return str.tostring(dist, '#.##');
      case 'Pips': return `${str.tostring(priceToPips(dist), '#.#')} pips`;
      default: return `${str.tostring(priceToPct(dist), pattern)}%`;
    }
  };

  const fmtZone = (zoneType: string, nearestDir: number, nearestDist: number): string => {
    if (nearestDir === 0) return 'NONE';
    if (nearestDir === 1) {
      if (ge(nearestDist, 0)) return `IN BULL ${zoneType} ↑`;
      return `BULL ${zoneType} (${distText(Math.abs(nearestDist), '#.#')}) ↑`;
    }
    if (le(nearestDist, 0)) return `IN BEAR ${zoneType} ↓`;
    return `BEAR ${zoneType} (+${distText(nearestDist, '#.#')}) ↓`;
  };

  const tipZone = (zoneType: string, nearestDir: number, nearestDist: number, tf: string): string => {
    const tfStr = fmtTF(tf);
    const distStr = distText(Math.abs(nearestDist), '#.##');
    if (nearestDir === 0) return `No unmitigated ${zoneType}s on ${tfStr}`;
    if (nearestDir === 1) {
      if (ge(nearestDist, 0)) return `Price is currently in bullish ${zoneType} on ${tfStr}`;
      return `Nearest ${zoneType} is bullish, ${distStr} away on ${tfStr}`;
    }
    if (le(nearestDist, 0)) return `Price is currently in bearish ${zoneType} on ${tfStr}`;
    return `Nearest ${zoneType} is bearish, ${distStr} away on ${tfStr}`;
  };

  const tipEma = (trendDir: number, trendDist: number, tf: string): string => {
    const tfStr = fmtTF(tf);
    const distStr = distText(Math.abs(trendDist), '#.##');
    if (trendDir > 0) return `Price is ${distStr} above EMA on ${tfStr}`;
    if (trendDir < 0) return `Price is ${distStr} below EMA on ${tfStr}`;
    return `Price is at EMA on ${tfStr}`;
  };

  const tipSwing = (swingPct: number, reclaimLow: boolean, reclaimHigh: boolean, tf: string): string => {
    const tfStr = fmtTF(tf);
    if (reclaimLow) return `Liquidity sweep - price swept swing low and reclaimed on ${tfStr}`;
    if (reclaimHigh) return `Liquidity sweep - price swept swing high and reclaimed on ${tfStr}`;
    if (lt(swingPct, 0)) return `Price below swing low on ${tfStr} - swing low broken`;
    if (gt(swingPct, 100)) return `Price above swing high on ${tfStr} - swing high broken`;
    if (le(swingPct, 30)) return `Price nearing swing low on ${tfStr}`;
    if (ge(swingPct, 70)) return `Price nearing swing high on ${tfStr}`;
    return `Price in mid-range on ${tfStr}`;
  };

  const tipStructure = (structBias: number, tf: string): string => {
    const tfStr = fmtTF(tf);
    if (structBias === 1) return `Bullish market structure on ${tfStr}`;
    if (structBias === -1) return `Bearish market structure on ${tfStr}`;
    return `Mixed market structure on ${tfStr}`;
  };

  // Sessions of the New York time
  const getSession = (hr: number): { name: string; color: string; start: number; duration: number } => {
    if (hr >= 19 || hr < 3) return { name: 'ASIAN', color: cfg.sessAsianColor, start: 19, duration: 8 };
    if (hr >= 8 && hr < 17) return { name: 'NEW YORK', color: cfg.sessNyColor, start: 8, duration: 9 };
    // 9 for visual purpose only
    if (hr >= 3 && hr < 8) return { name: 'LONDON', color: cfg.sessLondonColor, start: 3, duration: 9 };
    return { name: 'OFF HOURS', color: GRAY, start: 0, duration: 0 };
  };

  // ICT killzones of the New York time
  const getKillzone = (hr: number, mins: number): { name: string; color: string; nextText: string; nextColor: string } => {
    const currentMins = hr * 60 + mins;
    const asianKzStart = 20 * 60;
    const londonKzStart = 2 * 60;
    const londonKzEnd = 5 * 60;
    const nyAmKzStart = 9 * 60 + 30;
    const nyAmKzEnd = 11 * 60;
    const nyLunchStart = 12 * 60;
    const nyLunchEnd = 13 * 60;
    const nyPmKzStart = 13 * 60 + 30;
    const nyPmKzEnd = 16 * 60;
    const zone = (name: string, zoneColor: string) => ({ name, color: zoneColor, nextText: '', nextColor: zoneColor });
    if (currentMins >= asianKzStart || currentMins < 0) return zone('ASIAN KZ', cfg.kzAsianColor);
    if (currentMins >= londonKzStart && currentMins < londonKzEnd) return zone('LONDON KZ', cfg.kzLondonColor);
    if (currentMins >= nyAmKzStart && currentMins < nyAmKzEnd) return zone('NY AM KZ', cfg.kzNyAmColor);
    if (currentMins >= nyLunchStart && currentMins < nyLunchEnd) return zone('NY LUNCH', cfg.kzLunchColor);
    if (currentMins >= nyPmKzStart && currentMins < nyPmKzEnd) return zone('NY PM KZ', cfg.kzPmColor);

    let nextKzName = '';
    let minutesToNext = 0;
    let nextColor = neutColor;
    if (currentMins < londonKzStart) {
      nextKzName = 'LONDON KZ';
      minutesToNext = londonKzStart - currentMins;
      nextColor = cfg.kzLondonColor;
    } else if (currentMins < nyAmKzStart) {
      nextKzName = 'NY AM KZ';
      minutesToNext = nyAmKzStart - currentMins;
      nextColor = cfg.kzNyAmColor;
    } else if (currentMins < nyLunchStart) {
      nextKzName = 'NY LUNCH';
      minutesToNext = nyLunchStart - currentMins;
      nextColor = cfg.kzLunchColor;
    } else if (currentMins < nyPmKzStart) {
      nextKzName = 'NY PM KZ';
      minutesToNext = nyPmKzStart - currentMins;
      nextColor = cfg.kzPmColor;
    } else if (currentMins < asianKzStart) {
      nextKzName = 'ASIAN KZ';
      minutesToNext = asianKzStart - currentMins;
      nextColor = cfg.kzAsianColor;
    }
    const nextKzHours = Math.floor(minutesToNext / 60);
    const nextKzMins = minutesToNext % 60;
    return {
      name: 'NO KILLZONE',
      color: neutColor,
      nextText: `${nextKzName} in ${str.tostring(nextKzHours)}h:${str.tostring(nextKzMins, '00')}m`,
      nextColor,
    };
  };

  // Swing bars of the timeframes
  const swingBars = readings.map((r) => fmtSwingBar(r.swingH, r.swingL, r.reclaimLow, r.reclaimHigh));

  // Current timeframe swing bar
  const currSwingH = own.currH;
  const currSwingL = own.currL;
  const currReclaimLow = own.reading.reclaimLow;
  const currReclaimHigh = own.reading.reclaimHigh;
  const [currSwingBarText, currSwingBarColor, currSwingPct] = fmtSwingBar(currSwingH, currSwingL, currReclaimLow, currReclaimHigh);

  // Volume
  const volume = Series.fromArray(bars, bars.map((b) => b.volume ?? NaN));
  const avgVolume = A(ta.sma(volume, VOLUME_LENGTH))[last];
  const volumePct = pct(bars[last].volume ?? NaN, avgVolume);
  const volumeState = gt(volumePct, 200) ? 'EXTREME' : gt(volumePct, 120) ? 'HIGH' : gt(volumePct, 80) ? 'NORMAL' : gt(volumePct, 50) ? 'LOW' : 'VERY LOW';
  const volumeBars = gt(volumePct, 200) ? 5 : gt(volumePct, 120) ? 4 : gt(volumePct, 80) ? 3 : gt(volumePct, 50) ? 2 : 1;
  const volumeBarString = rep('█', volumeBars) + rep('░', Math.max(0, 5 - volumeBars));
  const volumeColor = gt(volumePct, 200) ? YELLOW : gt(volumePct, 120) ? ORANGE : neutColor;

  // Volatility
  const atrSeries = ta.atr(bars, ATR_LENGTH);
  const currentATR = A(atrSeries)[last];
  const avgATR = A(ta.sma(atrSeries, cfg.atrAvgLength))[last];
  const atrPct = pct(currentATR, avgATR);
  const volatilityState = gt(atrPct, 130) ? 'HIGH' : gt(atrPct, 70) ? 'NORMAL' : 'LOW';
  const volatilityColor = gt(atrPct, 130) ? bearColor : gt(atrPct, 70) ? neutColor : bullColor;

  // HTF levels (PDH/L, PWH/L, PMH/L): the high and low of the previous period, with the sweeps of the current one.
  // The dashboard rows only exist on a chart timeframe that is not above the level's timeframe.
  const showPDHL = cfg.showPDHL && chartSeconds <= 86400;
  const showPWHL = cfg.showPWHL && chartSeconds <= 86400 * 7;
  const showPMHL = cfg.showPMHL && chartSeconds <= 86400 * 31;
  interface Level { high: number; low: number; reclaimLow: boolean; reclaimHigh: boolean }
  const NA_LEVEL: Level = { high: NaN, low: NaN, reclaimLow: false, reclaimHigh: false };
  const levelOf = (tf: string, name: string, needed: boolean, drawn: boolean): Level => {
    if (!needed) return NA_LEVEL;
    const tfSeconds = timeframe.in_seconds(tf);
    if (!(chartSeconds <= tfSeconds)) {
      if (drawn) {
        throw new Error(`The previous ${name} high / low need bars of a timeframe below the chart timeframe "${chartTf}": the chart bars do not have that data`);
      }
      return NA_LEVEL;
    }
    // request.security(syminfo.tickerid, tf, [high[1], low[1]], lookahead = barmerge.lookahead_on)
    let levelHigh: number[];
    let levelLow: number[];
    if (tfSeconds === chartSeconds) {
      levelHigh = high.map((_v, i) => (i > 0 ? high[i - 1] : NaN));
      levelLow = low.map((_v, i) => (i > 0 ? low[i - 1] : NaN));
    } else {
      const periods = periodsOf(bars, tf, chart);
      const htf = periodBars(bars, periods);
      levelHigh = periods.group.map((g) => (g > 0 ? htf[g - 1].high : NaN));
      levelLow = periods.group.map((g) => (g > 0 ? htf[g - 1].low : NaN));
    }
    // trackHTFLevel(): breaks of the level since the start of the period, and the close back inside
    const starts = periodStarts(bars, tf, chart);
    let lowBroken = false;
    let highBroken = false;
    for (let i = 0; i < n; i++) {
      if (i > 0 && starts[i] !== starts[i - 1]) {
        lowBroken = false;
        highBroken = false;
      }
      if (lt(low[i], levelLow[i])) lowBroken = true;
      if (gt(high[i], levelHigh[i])) highBroken = true;
    }
    return {
      high: levelHigh[last],
      low: levelLow[last],
      reclaimLow: lowBroken && gt(lastClose, levelLow[last]),
      reclaimHigh: highBroken && lt(lastClose, levelHigh[last]),
    };
  };
  const pd = levelOf('D', 'day', cfg.plotPDHL || (cfg.showHTFLevels && showPDHL), cfg.plotPDHL);
  const pw = levelOf('W', 'week', cfg.plotPWHL || (cfg.showHTFLevels && showPWHL), cfg.plotPWHL);
  const pm = levelOf('M', 'month', cfg.plotPMHL || (cfg.showHTFLevels && showPMHL), cfg.plotPMHL);
  const levelTip = (level: Level, swingPct: number, lowName: string, highName: string, period: string): string => (
    level.reclaimLow ? `Liquidity sweep - price swept ${lowName} and reclaimed`
      : level.reclaimHigh ? `Liquidity sweep - price swept ${highName} and reclaimed`
        : lt(swingPct, 0) ? `Price below ${lowName} - previous ${period} low broken`
          : gt(swingPct, 100) ? `Price above ${highName} - previous ${period} high broken`
            : le(swingPct, 30) ? `Price nearing ${lowName}`
              : ge(swingPct, 70) ? `Price nearing ${highName}` : `Price in previous ${period} range`
  );

  // Session and killzone of the current time; of the last bar when it is older than one bar length (replay)
  const ms = bars[0].time >= 1e12;
  const lastTime = ms ? bars[last].time : bars[last].time * 1000;
  const timenow = nowOf(chart);
  const isReplay = timenow - lastTime > chartSeconds * 1000;
  const sessionTime = isReplay ? lastTime : timenow;
  const currentHour = pineTime.hour(sessionTime, 'America/New_York');
  const currentMinute = pineTime.minute(sessionTime, 'America/New_York');
  const session = getSession(currentHour);
  const killzone = getKillzone(currentHour, currentMinute);

  // Session progress bar (adds a block at the 30 minute mark)
  let hoursElapsed = 0;
  let sessionProgressBar = '';
  if (session.name !== 'OFF HOURS') {
    const minsIntoSession = session.name === 'ASIAN' && currentHour < 3
      ? (currentHour + 24 - session.start) * 60 + currentMinute
      : (currentHour - session.start) * 60 + currentMinute;
    hoursElapsed = Math.min(Math.floor((minsIntoSession + 30) / 60), session.duration);
    sessionProgressBar = rep('█', hoursElapsed) + rep('░', Math.max(0, session.duration - hoursElapsed));
  }

  // Trend bias (user weighted): the readings of the active timeframes
  const dirScore = (dir: number) => (dir > 0 ? 1 : dir < 0 ? -1 : 0);
  const swingBiasDir = (swingH: number, swingL: number): number => {
    const swingRange = Math.max(swingH - swingL, MINTICK);
    const swingPct = (lastClose - swingL) / swingRange * 100;
    return lt(swingPct, 0) ? -1 : gt(swingPct, 100) ? 1 : lt(swingPct, 30) ? 1 : gt(swingPct, 70) ? -1 : 0;
  };
  const factorCount = [cfg.biasUseStruct, cfg.biasUseOB, cfg.biasUseFVG, cfg.biasUseEMA, cfg.biasUseSwing].filter(Boolean).length;
  let maxScore = 0;
  let biasPoints = 0;
  timeframes.forEach((t, k) => {
    if (!(t.active && t.weight > 0)) return;
    const r = readings[k];
    let score = 0;
    if (cfg.biasUseStruct) score += dirScore(r.structBias);
    if (cfg.biasUseOB) score += dirScore(r.obNearDir);
    if (cfg.biasUseFVG) score += dirScore(r.fvgNearDir);
    if (cfg.biasUseEMA) score += dirScore(r.trendDir);
    if (cfg.biasUseSwing) score += swingBiasDir(r.swingH, r.swingL);
    maxScore += t.weight * factorCount;
    biasPoints += score * t.weight;
  });
  const biasPct = maxScore > 0 ? (biasPoints / maxScore) * 100 : 0;
  const biasLabel = maxScore === 0 ? 'N/A' : gt(biasPct, 50) ? 'BULLISH ↑' : gt(biasPct, 20) ? 'LEAN BULL ↑' : lt(biasPct, -50) ? 'BEARISH ↓' : lt(biasPct, -20) ? 'LEAN BEAR ↓' : 'NEUTRAL →';
  const biasScore = maxScore === 0 ? '--' : `${biasPoints >= 0 ? '+' : ''}${str.tostring(biasPoints)}/${str.tostring(maxScore)}`;
  const biasColor = maxScore === 0 ? neutColor : gt(biasPct, 20) ? bullColor : lt(biasPct, -20) ? bearColor : neutColor;

  // Dynamic tooltips
  const noKillzone = killzone.name === 'NO KILLZONE';
  const offHours = session.name === 'OFF HOURS';
  const tipKillzone = noKillzone ? 'No active killzone' : `Currently in ${killzone.name}`;
  const tipNextKz = noKillzone ? `Next killzone: ${killzone.nextText}` : `Currently in ${killzone.name}`;
  const tipSession = offHours ? 'Market is currently not in any session' : `Currently in ${session.name} session`;
  const tipSessionProg = offHours
    ? 'Market is currently not in any session'
    : `${str.tostring(hoursElapsed)} of ${str.tostring(session.duration)} hours elapsed in ${session.name} session`;
  const tipBiasLabel = `Current Trend Bias: ${gt(biasPct, 50) ? 'Bullish' : gt(biasPct, 20) ? 'Leaning Bullish' : lt(biasPct, -50) ? 'Bearish' : lt(biasPct, -20) ? 'Leaning Bearish' : 'Neutral'} based on HTF analysis`;
  const tipVolume = `Volume is currently at ${str.tostring(volumePct, '#')}% of average`;
  const tipVolatility = `Volatility is currently ${gt(atrPct, 130) ? 'high' : gt(atrPct, 70) ? 'normal' : 'low'}`;
  const tipCurrSwing = currReclaimLow ? 'Liquidity sweep - price swept swing low and reclaimed'
    : currReclaimHigh ? 'Liquidity sweep - price swept swing high and reclaimed'
      : lt(currSwingPct, 0) ? 'Price below swing low - swing low broken'
        : gt(currSwingPct, 100) ? 'Price above swing high - swing high broken'
          : le(currSwingPct, 30) ? 'Price is nearing swing low'
            : ge(currSwingPct, 70) ? 'Price is nearing swing high' : 'Price is in mid-range';

  // ---- Dashboard (drawn on the last bar) ----
  const cells: TableCellData[] = [];
  const merges: NonNullable<TableData['merges']> = [];
  const cell = (column: number, row: number, text: string, options: Partial<TableCellData> = {}): void => {
    const k = cells.findIndex((c) => c.column === column && c.row === row);
    if (k >= 0) cells.splice(k, 1);
    cells.push({ column, row, text, ...options });
  };
  const merge = (startColumn: number, startRow: number, endColumn: number, endRow: number): void => {
    merges.push({ startColumn, startRow, endColumn, endRow });
  };
  const header = { textColor: textCol, textSize: 'normal' as const };
  const small = 'small' as const;
  const tipOf = (tooltip: string) => (tooltip === '' ? {} : { tooltip });

  if (cfg.showMSD) {
    const msdCols = 1 + (cfg.showColEma ? 1 : 0) + (cfg.showColSwing ? 1 : 0) + (cfg.showColStruct ? 1 : 0) + (cfg.showColOB ? 1 : 0) + (cfg.showColFVG ? 1 : 0);
    cell(0, 0, 'MARKET STRUCTURE DASHBOARD', { ...header, bgColor: bgHeader, textHAlign: 'center' });
    if (msdCols > 1) merge(0, 0, msdCols - 1, 0);

    // Column headers (the EMA column is the last one)
    let col = 0;
    cell(col, 1, 'TF', { ...header, width: 3 });
    if (cfg.showColSwing) cell(++col, 1, 'SWING H/L', { ...header, tooltip: 'Price position within swing range' });
    if (cfg.showColStruct) cell(++col, 1, 'STRUCTURE', { ...header, tooltip: 'Last 3 swing patterns (HH/HL/LH/LL)' });
    if (cfg.showColOB) cell(++col, 1, 'ORDER BLOCK', { ...header, tooltip: 'Nearest unmitigated order block' });
    if (cfg.showColFVG) cell(++col, 1, 'FVG', { ...header, tooltip: 'Nearest unmitigated fair value gap' });
    if (cfg.showColEma) cell(++col, 1, `EMA-${str.tostring(cfg.emaLength)} TREND`, { ...header, tooltip: 'Distance from EMA as percentage' });

    // One row per active timeframe
    timeframes.forEach((t, k) => {
      if (!t.active) return;
      const row = 2 + k;
      const r = readings[k];
      const [swingBar, swingColor, swingPct] = swingBars[k];
      let c = 0;
      cell(c, row, fmtTF(t.tf), { textColor: textCol, textSize: small, bgColor: rowLabelBg });
      if (cfg.showColSwing) {
        cell(++c, row, swingBar, { textColor: swingColor, textSize: small, tooltip: tipSwing(swingPct, r.reclaimLow, r.reclaimHigh, t.tf) });
      }
      if (cfg.showColStruct) {
        cell(++c, row, fmtStructure(r), { textColor: dirColor(r.structBias), textSize: small, tooltip: tipStructure(r.structBias, t.tf) });
      }
      if (cfg.showColOB) {
        cell(++c, row, fmtZone('OB', r.obNearDir, r.obNearDist), { textColor: dirColor(r.obNearDir), textSize: small, tooltip: tipZone('OB', r.obNearDir, r.obNearDist, t.tf) });
      }
      if (cfg.showColFVG) {
        cell(++c, row, fmtZone('FVG', r.fvgNearDir, r.fvgNearDist), { textColor: dirColor(r.fvgNearDir), textSize: small, tooltip: tipZone('FVG', r.fvgNearDir, r.fvgNearDist, t.tf) });
      }
      if (cfg.showColEma) {
        cell(++c, row, fmtPct(r.trendDir, r.trendDist), { textColor: dirColor(r.trendDir), textSize: small, tooltip: tipEma(r.trendDir, r.trendDist, t.tf) });
      }
    });
  }

  // Current timeframe and market context sections
  if (cfg.showCurrTF || cfg.showContext) {
    const ctfCols = (cfg.showCurrVol ? 1 : 0) + (cfg.showCurrSwing ? 1 : 0) + (cfg.showCurrAtr ? 1 : 0);
    const ctxCols = (cfg.showSession ? 1 : 0) + (cfg.showKillzone ? 1 : 0) + (cfg.showBias ? 1 : 0);
    const bottomCols = (cfg.showCurrTF ? ctfCols : 0) + (cfg.showContext ? ctxCols : 0);

    // Row 9: empty separator (only with the market structure section)
    if (cfg.showMSD) {
      cell(0, 9, '', { bgColor: bgDark, textColor: CELL_TEXT_DEFAULT, textSize: 'auto' });
      if (bottomCols > 0) merge(0, 9, bottomCols - 1, 9);
    }

    // Row 10: section headers
    let col = 0;
    if (cfg.showCurrTF && ctfCols > 0) {
      cell(col, 10, 'CURRENT TIMEFRAME', { ...header, bgColor: bgHeader, textHAlign: 'center' });
      if (ctfCols > 1) merge(col, 10, col + ctfCols - 1, 10);
      col += ctfCols;
    }
    if (cfg.showContext && ctxCols > 0) {
      cell(col, 10, 'MARKET CONTEXT', { ...header, bgColor: bgHeader, textHAlign: 'center' });
      if (ctxCols > 1) merge(col, 10, col + ctxCols - 1, 10);
    }

    // Rows 11 to 13: column headers and two data rows
    const bottom: Array<{ head: string; headTip: string; data1: [string, string, string]; data2: [string, string, string] }> = [];
    if (cfg.showCurrTF) {
      if (cfg.showCurrVol) {
        bottom.push({ head: 'VOLUME', headTip: 'Current volume', data1: [volumeBarString, volumeColor, tipVolume], data2: [volumeState, volumeColor, ''] });
      }
      if (cfg.showCurrSwing) {
        bottom.push({ head: 'SWING H/L', headTip: 'Price position within current swing range', data1: [currSwingBarText, currSwingBarColor, tipCurrSwing], data2: ['', currSwingBarColor, ''] });
      }
      if (cfg.showCurrAtr) {
        bottom.push({ head: 'VOLATILITY', headTip: 'Current volatility', data1: [volatilityState, volatilityColor, tipVolatility], data2: ['', volumeColor, ''] });
      }
    }
    if (cfg.showContext) {
      if (cfg.showSession) {
        bottom.push({ head: 'SESSION', headTip: 'Current trading session', data1: [session.name, session.color, tipSession], data2: [sessionProgressBar, session.color, tipSessionProg] });
      }
      if (cfg.showKillzone) {
        bottom.push({ head: 'KILLZONE', headTip: 'Current killzone', data1: [killzone.name, killzone.color, tipKillzone], data2: [killzone.nextText, killzone.nextColor, tipNextKz] });
      }
      if (cfg.showBias) {
        bottom.push({ head: 'TREND BIAS', headTip: 'Current trend bias', data1: [biasLabel, biasColor, tipBiasLabel], data2: [biasScore, biasColor, ''] });
      }
    }
    bottom.forEach((b, c) => {
      cell(c, 11, b.head, { ...header, tooltip: b.headTip });
      cell(c, 12, b.data1[0], { textColor: b.data1[1], textSize: small, ...tipOf(b.data1[2]) });
      cell(c, 13, b.data2[0], { textColor: b.data2[1], textSize: small, ...tipOf(b.data2[2]) });
    });
  }

  // HTF levels section
  if (cfg.showHTFLevels) {
    const htfRows = (showPDHL ? 1 : 0) + (showPWHL ? 1 : 0) + (showPMHL ? 1 : 0);
    if (htfRows > 0) {
      cell(0, 14, 'HTF LEVELS', { ...header, bgColor: bgHeader, textHAlign: 'center' });
      merge(0, 14, 1, 14);
      let row = 15;
      const levelRow = (name: string, level: Level, lowName: string, highName: string, period: string): void => {
        const [bar, barColor, swingPct] = fmtSwingBar(level.high, level.low, level.reclaimLow, level.reclaimHigh);
        cell(0, row, name, { textColor: textCol, textSize: small, bgColor: rowLabelBg });
        cell(1, row, bar, { textColor: barColor, textSize: small, tooltip: levelTip(level, swingPct, lowName, highName, period) });
        row += 1;
      };
      if (showPDHL) levelRow('PDH/L', pd, 'PDL', 'PDH', 'day');
      if (showPWHL) levelRow('PWH/L', pw, 'PWL', 'PWH', 'week');
      if (showPMHL) levelRow('PMH/L', pm, 'PML', 'PMH', 'month');
    }
  }

  tables.push({
    position: POSITIONS[cfg.dashboardPos] ?? 'top_right',
    columns: 7,
    rows: 18,
    cells,
    ...(merges.length > 0 ? { merges } : {}),
    bgColor: bgDark,
    borderColor: TABLE_BORDER,
    borderWidth: 1,
  });

  // ---- EMA ----
  for (let i = 0; i < n; i++) {
    plot0.push({ time: bars[i].time, value: cfg.showEMA ? own.ema[i] : NaN, color: cfg.emaColor });
  }

  // ---- HTF level lines (drawn on the last bar) ----
  // Labels of levels in the same fiftieth of the range of the levels are combined on the highest timeframe
  const { plotPDHL, plotPWHL, plotPMHL } = cfg;
  const htfMaxHigh = Math.max(plotPDHL ? pd.high : 0, plotPWHL ? pw.high : 0, plotPMHL ? pm.high : 0);
  const htfMinLow = Math.min(plotPDHL ? pd.low : 10e10, plotPWHL ? pw.low : 10e10, plotPMHL ? pm.low : 10e10);
  const segmentSize = (htfMaxHigh - htfMinLow) / 50;
  const getSegment = (price: number) => (gt(segmentSize, 0) ? Math.floor((price - htfMinLow) / segmentSize) : 0);
  const sameSegment = (a: number, b: number) => a === b;
  const pdhSeg = plotPDHL ? getSegment(pd.high) : -1;
  const pdlSeg = plotPDHL ? getSegment(pd.low) : -1;
  const pwhSeg = plotPWHL ? getSegment(pw.high) : -2;
  const pwlSeg = plotPWHL ? getSegment(pw.low) : -2;
  const pmhSeg = plotPMHL ? getSegment(pm.high) : -3;
  const pmlSeg = plotPMHL ? getSegment(pm.low) : -3;
  const pdhInPwh = sameSegment(pdhSeg, pwhSeg) && plotPDHL && plotPWHL;
  const pdhInPmh = sameSegment(pdhSeg, pmhSeg) && plotPDHL && plotPMHL;
  const pwhInPmh = sameSegment(pwhSeg, pmhSeg) && plotPWHL && plotPMHL;
  const pmhLbl = `${pdhInPmh ? 'PDH/' : ''}${pwhInPmh ? 'PWH/' : ''}PMH`;
  const pwhLbl = `${pdhInPwh && !pdhInPmh ? 'PDH/' : ''}PWH`;
  const pdlInPwl = sameSegment(pdlSeg, pwlSeg) && plotPDHL && plotPWHL;
  const pdlInPml = sameSegment(pdlSeg, pmlSeg) && plotPDHL && plotPMHL;
  const pwlInPml = sameSegment(pwlSeg, pmlSeg) && plotPWHL && plotPMHL;
  const pmlLbl = `${pdlInPml ? 'PDL/' : ''}${pwlInPml ? 'PWL/' : ''}PML`;
  const pwlLbl = `${pdlInPwl && !pdlInPml ? 'PDL/' : ''}PWL`;

  // An object with an na price is not drawn
  const levelLine = (price: number, lineColor: string, style: LineStyleOption): void => {
    if (isNaN(price)) return;
    lines.push({
      time1: at(last - 1), price1: price, time2: at(last + cfg.htfLevelExtend), price2: price,
      color: lineColor, style: LINE_STYLES[style] ?? 'dashed', width: 1,
    });
  };
  const levelLabel = (price: number, text: string, labelColor: string): void => {
    if (isNaN(price)) return;
    labels.push({
      time: at(last + cfg.htfLevelExtend), price, text, color: String(color.new(labelColor, 100)), textColor: labelColor,
      style: 'label_left', size: 'small',
    });
  };
  if (plotPMHL) {
    levelLine(pm.high, cfg.pmhColor, cfg.pmhlLineStyle);
    levelLine(pm.low, cfg.pmlColor, cfg.pmhlLineStyle);
  }
  if (plotPWHL) {
    levelLine(pw.high, cfg.pwhColor, cfg.pwhlLineStyle);
    levelLine(pw.low, cfg.pwlColor, cfg.pwhlLineStyle);
  }
  if (plotPDHL) {
    levelLine(pd.high, cfg.pdhColor, cfg.pdhlLineStyle);
    levelLine(pd.low, cfg.pdlColor, cfg.pdhlLineStyle);
  }
  if (plotPMHL) {
    levelLabel(pm.high, pmhLbl, cfg.pmhColor);
    levelLabel(pm.low, pmlLbl, cfg.pmlColor);
  }
  if (plotPWHL && !pwhInPmh) levelLabel(pw.high, pwhLbl, cfg.pwhColor);
  if (plotPWHL && !pwlInPml) levelLabel(pw.low, pwlLbl, cfg.pwlColor);
  if (plotPDHL && !pdhInPmh && !pdhInPwh) levelLabel(pd.high, 'PDH', cfg.pdhColor);
  if (plotPDHL && !pdlInPml && !pdlInPwl) levelLabel(pd.low, 'PDL', cfg.pdlColor);

  // ---- Order blocks ----
  if (cfg.showOB) {
    // `for i = 0 to obCount - 1` reads the first order block even when there is none
    if (own.obs.length === 0) throw new Error('Index 0 is out of bounds, array size is 0');
    for (const ob of own.obs) {
      const obBorder = ob.dir > 0 ? cfg.obBullColor : cfg.obBearColor;
      boxes.push({
        time1: at(ob.barIdx), price1: ob.top, time2: at(last + cfg.obExtend), price2: ob.bottom,
        borderColor: obBorder, borderWidth: 1, bgColor: String(color.new(obBorder, 80)),
        text: cfg.showOBLabels ? (ob.dir > 0 ? 'OB ↑' : 'OB ↓') : '',
        textColor: obBorder, textHAlign: 'right', textVAlign: 'center', textSize: 'small',
      });
    }
  }

  // ---- Fair value gaps ----
  if (cfg.showFVG) {
    for (const fvg of own.fvgs) {
      const base = fvg.dir > 0 ? cfg.fvgBullColor : cfg.fvgBearColor;
      boxes.push({
        time1: at(fvg.barIdx), price1: fvg.top, time2: at(last + cfg.fvgExtend), price2: fvg.bottom,
        bgColor: String(color.new(base, 85)), borderWidth: 1, borderStyle: 'dashed', borderColor: String(color.new(base, 60)),
        text: cfg.showFVGLabels ? (fvg.dir > 0 ? 'FVG ↑' : 'FVG ↓') : '',
        textColor: base, textHAlign: 'right', textVAlign: 'center', textSize: 'small',
      });
    }
  }

  // ---- Swing labels ----
  if (cfg.showSwingLabels) {
    for (const lbl of own.swingLabels) {
      const base = lbl.bull ? cfg.swingBullColor : cfg.swingBearColor;
      labels.push({
        time: at(lbl.x), price: lbl.y, text: lbl.text, yloc: lbl.isHigh ? 'abovebar' : 'belowbar',
        color: String(color.new(base, 80)), style: lbl.isHigh ? 'label_down' : 'label_up', textColor: base, size: 'small',
      });
    }
  }

  // ---- Swing lines ----
  if (cfg.showSwingLines) {
    const style = LINE_STYLES[cfg.swingLineStyle] ?? 'dashed';
    if (!isNaN(currSwingH) && !isNaN(own.lastHBar)) {
      lines.push({
        time1: at(own.lastHBar), price1: currSwingH, time2: at(last + cfg.swingLinesExtend), price2: currSwingH,
        color: String(color.new(cfg.swingLineHighColor, 30)), style, width: 1,
      });
    }
    if (!isNaN(currSwingL) && !isNaN(own.lastLBar)) {
      lines.push({
        time1: at(own.lastLBar), price1: currSwingL, time2: at(last + cfg.swingLinesExtend), price2: currSwingL,
        color: String(color.new(cfg.swingLineLowColor, 30)), style, width: 1,
      });
    }
  }

  return result();
}

export const MarketStructureDashboardFluxCharts = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
