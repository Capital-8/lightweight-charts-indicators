/**
 * HTF Candles & Mini Charts by DGT
 *
 * Shows the candles of up to two higher timeframes on the chart and in "mini charts" to the right of the last bar.
 *
 * - Higher-timeframe candles on the chart: one box from the high to the low of each period and one from its open to
 *   its close, in the bull / bear colour (or by volume against its average: "Volume-Weighted Candles"). The values
 *   are those of completed periods: a box shows the period before until the last bar of its own period.
 * - Mini chart (drawn on the last bar): the last "Mini Chart Bars" candles of the timeframe as lines on future
 *   bars, with an overlay (Supertrend with a dot at each change of direction, Bollinger Bands or a moving average),
 *   an oscillator below (RSI with its signal line, or Stochastic %K and %D, scaled into the price range under the
 *   lowest low), reference levels (highest high, lowest low, quartiles) and text labels.
 * - On the chart itself: Supertrend, Bollinger Bands or a ribbon of four moving averages (20, 50, 100, 200), an
 *   oscillator drawn under the price, and bars coloured by volume against its average.
 * - Statistic panel (table): returns since the start of the day, week, month, quarters and years, distance of the
 *   close to the moving averages on the three timeframes, and volume against its average.
 *
 * The timeframe data are those of the chart symbol, built from the chart bars ("Heikin Ashi" candles are computed
 * from them too): a higher timeframe needs enough chart bars for its last "lookback + 1" bars, else its indicators
 * start later than in the original. As in the original, each timeframe is computed on its last "lookback + 1" bars only (lookback =
 * the mini chart bars in chart bars, at least the mini chart bars + the longest indicator length + 1), and when one
 * of the two timeframes is the chart timeframe with regular candles the whole script runs on the last
 * "lookback + 1" chart bars only: bars before have no output and the returns of the panel start there.
 *
 * Chart context: the chart timeframe text, the symbol tick (label prices), the exchange time zone and session
 * (periods, month and year), the chart foreground and background colours. The chart is taken as a standard chart
 * (regular candles).
 *
 * Reference: "HTF Candles by DGT" by dgtrd
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © dgtrd
 */

import {
  ta, str, color, array, time, timeframe, Series, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BarColorData, BoxData, LabelData, LineDrawingData, PolylineData, TableCellData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import { backgroundColorOf, foregroundColorOf, mintickOf, timezoneOf, type ChartContext } from '../chart-context';

type TimeframeOption = 'Chart' | '1 Minute' | '3 Minutes' | '5 Minutes' | '15 Minutes' | '30 Minutes' | '1 Hour' | '2 Hours'
  | '4 Hours' | '12 Hours' | '1 Day' | '1 Week' | '1 Month';
type ChartType = 'Candles' | 'High-Low' | 'Heikin Ashi';
type OnOff = 'On' | 'Off';
type MiniOverlay = 'None' | 'Bollinger Bands' | 'Moving Average' | 'Supertrend';
type Oscillator = 'None' | 'RSI' | 'Stochastic';
type ReferenceLevels = 'None' | 'Range Extremes' | 'Range Quartiles';
type MaType = 'SMA' | 'EMA' | 'HMA' | 'RMA' | 'WMA' | 'VWMA';

export interface HtfCandlesMiniChartsByDgtInputs {
  htf1SH: boolean;
  htf1TF: TimeframeOption;
  htf1CT: ChartType;
  htf1VWs: OnOff;
  htf1BLClr: string;
  htf1BRClr: string;
  htf1ClrT: number;
  htf1SHm: boolean;
  htf1NB: number;
  htf1TI: MiniOverlay;
  htf1OI: Oscillator;
  htf1RL: ReferenceLevels;
  htf1VWms: OnOff;
  htf1LBs: OnOff;
  htf1SZ: number;
  htf2SH: boolean;
  htf2TF: TimeframeOption;
  htf2CT: ChartType;
  htf2VWs: OnOff;
  htf2BLClr: string;
  htf2BRClr: string;
  htf2ClrT: number;
  htf2SHm: boolean;
  htf2NB: number;
  htf2TI: MiniOverlay;
  htf2OI: Oscillator;
  htf2RL: ReferenceLevels;
  htf2VWms: OnOff;
  htf2LBs: OnOff;
  htf2SZ: number;
  chartTI: 'None' | 'Bollinger Bands' | 'Moving Average Ribbon' | 'Supertrend';
  chartOI: Oscillator;
  chartVWs: OnOff;
  chgStat: boolean;
  pmaStat: boolean;
  volStat: boolean;
  statSize: 'Tiny' | 'Small' | 'Normal';
  bbType: MaType;
  bbSource: SourceType;
  bbLength: number;
  bbMult: number;
  bbbColor: string;
  bbuColor: string;
  maType: MaType;
  maSource: SourceType;
  maLength: number;
  maColor: string;
  ma20Color: string;
  ma50Color: string;
  ma100Color: string;
  ma200Color: string;
  stLength: number;
  stFactor: number;
  stColor: string;
  rsiLength: number;
  rsiSource: SourceType;
  rsiSmoothing: boolean;
  rsiMaType: 'SMA' | 'EMA' | 'RMA' | 'WMA' | 'VWMA';
  rsiMaLength: number;
  stochPeriodK: number;
  stochSmoothK: number;
  stochPeriodD: number;
  vMaLen: number;
  vwcbHigh: number;
  vwHBLClr: string;
  vwHBRClr: string;
  vwcbLow: number;
  vwLBLClr: string;
  vwLBRClr: string;
  oscVerticalOffset: number;
  oscHeight: number;
}

const TEAL = '#089981';
const RED = '#F23645';
const BLUE = '#2962FF';
const GRAY = '#787B86';
const GREEN = '#4CAF50';
const NO_COLOR = '#00000000';

export const defaultInputs: HtfCandlesMiniChartsByDgtInputs = {
  htf1SH: true,
  htf1TF: 'Chart',
  htf1CT: 'Candles',
  htf1VWs: 'Off',
  htf1BLClr: TEAL,
  htf1BRClr: RED,
  htf1ClrT: 85,
  htf1SHm: true,
  htf1NB: 41,
  htf1TI: 'Supertrend',
  htf1OI: 'RSI',
  htf1RL: 'Range Quartiles',
  htf1VWms: 'Off',
  htf1LBs: 'On',
  htf1SZ: 13,
  htf2SH: false,
  htf2TF: 'Chart',
  htf2CT: 'Candles',
  htf2VWs: 'Off',
  htf2BLClr: TEAL,
  htf2BRClr: RED,
  htf2ClrT: 90,
  htf2SHm: false,
  htf2NB: 21,
  htf2TI: 'Moving Average',
  htf2OI: 'Stochastic',
  htf2RL: 'Range Extremes',
  htf2VWms: 'Off',
  htf2LBs: 'On',
  htf2SZ: 13,
  chartTI: 'None',
  chartOI: 'None',
  chartVWs: 'Off',
  chgStat: true,
  pmaStat: true,
  volStat: true,
  statSize: 'Small',
  bbType: 'SMA',
  bbSource: 'close',
  bbLength: 20,
  bbMult: 2.0,
  bbbColor: 'rgba(255, 152, 0, 0.5)',
  bbuColor: BLUE,
  maType: 'SMA',
  maSource: 'close',
  maLength: 5,
  maColor: BLUE,
  ma20Color: '#00C8FF',
  ma50Color: 'rgba(0, 160, 220, 0.95)',
  ma100Color: 'rgba(0, 120, 190, 0.9)',
  ma200Color: 'rgba(0, 80, 150, 0.85)',
  stLength: 10,
  stFactor: 3,
  stColor: BLUE,
  rsiLength: 14,
  rsiSource: 'close',
  rsiSmoothing: true,
  rsiMaType: 'EMA',
  rsiMaLength: 14,
  stochPeriodK: 14,
  stochSmoothK: 1,
  stochPeriodD: 3,
  vMaLen: 89,
  vwcbHigh: 1.618,
  vwHBLClr: '#006400',
  vwHBRClr: '#910000',
  vwcbLow: 0.618,
  vwLBLClr: '#7FFFD4',
  vwLBRClr: '#FF9800',
  oscVerticalOffset: 9,
  oscHeight: 10,
};

const TF_OPTIONS = ['Chart', '1 Minute', '3 Minutes', '5 Minutes', '15 Minutes', '30 Minutes', '1 Hour', '2 Hours', '4 Hours',
  '12 Hours', '1 Day', '1 Week', '1 Month'];
const CT_OPTIONS = ['Candles', 'High-Low', 'Heikin Ashi'];
const ON_OFF = ['On', 'Off'];
const MA_OPTIONS = ['SMA', 'EMA', 'HMA', 'RMA', 'WMA', 'VWMA'];
const SHOWN = 'data_window' as const; // display.all - display.status_line

const TF_TOOLTIP = 'Select the timeframe used to construct the higher-timeframe chart.\n\n'
  + '"Chart" uses the current chart timeframe.\n\n'
  + 'If the selected timeframe is lower than the chart timeframe, the effective timeframe automatically defaults to the chart timeframe.';
const CT_TOOLTIP = 'Select how the HTF candles are rendered.\n\nHeikin Ashi uses synthetic candles derived from price data.';
const RL_TOOLTIP = 'Displays statistical reference levels derived from the mini chart range.\n\n'
  + 'Range Extremes → Highest high and lowest low\n'
  + 'Range Quartiles → Adds 25%, 50%, and 75% levels';

function htfInputs(k: 1 | 2, group: string, d: HtfCandlesMiniChartsByDgtInputs): InputConfig[] {
  const id = (name: string) => `htf${k}${name}`;
  const v = (name: string) => (d as unknown as Record<string, unknown>)[id(name)];
  const ordinal = k === 1 ? 'first' : 'second';
  return [
    { id: id('SH'), type: 'bool', title: `${k === 1 ? 'First' : 'Second'} HTF on Main Chart`, defval: v('SH'), group,
      tooltip: `Displays the ${ordinal} higher-timeframe (HTF) chart overlaid on the main price chart.` },
    { id: id('TF'), type: 'string', title: '  Timeframe', defval: v('TF'), options: TF_OPTIONS, group, display: SHOWN, tooltip: TF_TOOLTIP },
    { id: id('CT'), type: 'string', title: '  Chart Type', defval: v('CT'), options: CT_OPTIONS, group, display: SHOWN, tooltip: CT_TOOLTIP },
    { id: id('VWs'), type: 'string', title: '  Volume-Weighted Candles', defval: v('VWs'), options: ON_OFF, group, display: SHOWN,
      tooltip: 'Colors higher-timeframe candles based on volume relative to its moving average.' },
    { id: id('BLClr'), type: 'color', title: '  ', defval: v('BLClr'), inline: `tf${k}`, group },
    { id: id('BRClr'), type: 'color', title: '', defval: v('BRClr'), inline: `tf${k}`, group },
    { id: id('ClrT'), type: 'int', title: 'Transparency', defval: v('ClrT'), min: 0, max: 100, inline: `tf${k}`, group, display: SHOWN },
    { id: id('SHm'), type: 'bool', title: 'Mini HTF Chart', defval: v('SHm'), group,
      tooltip: 'Displays a miniature higher-timeframe chart to the right of the current chart.' },
    { id: id('NB'), type: 'int', title: '  Mini Chart Bars', defval: v('NB'), min: 1, max: 73, group, display: SHOWN,
      tooltip: 'Number of higher-timeframe bars displayed in the mini chart.\n\nMaximum supported value is 73.' },
    { id: id('TI'), type: 'string', title: '  Mini Chart Overlay', defval: v('TI'), group, display: SHOWN,
      options: ['None', 'Bollinger Bands', 'Moving Average', 'Supertrend'],
      tooltip: 'Technical indicator displayed on the mini HTF chart.' },
    { id: id('OI'), type: 'string', title: '  Mini Chart Oscillator', defval: v('OI'), group, display: SHOWN,
      options: ['None', 'RSI', 'Stochastic'], tooltip: 'Momentum oscillator displayed beneath the mini HTF chart.' },
    { id: id('RL'), type: 'string', title: '  Reference Levels', defval: v('RL'), group, display: SHOWN,
      options: ['None', 'Range Extremes', 'Range Quartiles'], tooltip: RL_TOOLTIP },
    { id: id('VWms'), type: 'string', title: '  Volume-Weighted Candles', defval: v('VWms'), options: ON_OFF, group, display: SHOWN,
      tooltip: 'Applies volume-weighted coloring to candles in the mini HTF chart.' },
    { id: id('LBs'), type: 'string', title: '  Mini Chart Labels', defval: v('LBs'), options: ON_OFF, group, display: SHOWN,
      tooltip: 'Displays descriptive labels for the mini chart and reference levels.' },
    { id: id('SZ'), type: 'int', title: '  Mini Chart Offset', defval: v('SZ'), min: 10, max: 100, group, display: SHOWN,
      tooltip: 'Horizontal offset used to position the mini chart to the right of the price chart.' },
  ];
}

const CHART_GR = 'Main Chart Indicators';
const STAT_GR = 'Statistic Panel';
const BB_GR = 'Bollinger Bands (Chart + Mini Charts)';
const MA_GR = 'Moving Average (Chart + Mini Charts)';
const ST_GR = 'Supertrend (Chart + Mini Charts)';
const RSI_GR = 'RSI (Chart + Mini Charts)';
const STOCH_GR = 'Stochastic (Chart + Mini Charts)';
const VW_GR = 'Volume-Weighted Candle Coloring (Chart + Mini Charts)';
const MISC_GR = 'Oscillator Layout (Chart + Mini Charts)';

export const inputConfig: InputConfig[] = [
  ...htfInputs(1, 'First HTF Chart', defaultInputs),
  ...htfInputs(2, 'Second HTF Chart', defaultInputs),
  { id: 'chartTI', type: 'string', title: '  Chart Overlay', defval: 'None', group: CHART_GR, display: SHOWN,
    options: ['None', 'Bollinger Bands', 'Moving Average Ribbon', 'Supertrend'],
    tooltip: 'Select a technical indicator to display directly on the main chart.' },
  { id: 'chartOI', type: 'string', title: '  Chart Oscillator', defval: 'None', group: CHART_GR, display: SHOWN,
    options: ['None', 'RSI', 'Stochastic'], tooltip: 'Select a momentum oscillator to display beneath the main chart.' },
  { id: 'chartVWs', type: 'string', title: '  Volume-Weighted Candles', defval: 'Off', options: ON_OFF, group: CHART_GR, display: SHOWN,
    tooltip: 'Colors price bars based on current volume relative to its moving average.\n\n'
      + 'Highlights conviction-driven activity and abnormal participation shifts.' },
  { id: 'chgStat', type: 'bool', title: 'Performance Metrics', defval: true, group: STAT_GR,
    tooltip: 'Displays performance metrics such as returns from the start of the day, week, month, and year.' },
  { id: 'pmaStat', type: 'bool', title: 'Price Distance to MA', defval: true, group: STAT_GR,
    tooltip: 'Shows the multi-timeframe distance between price and its moving averages.' },
  { id: 'volStat', type: 'bool', title: 'Volume Statistics', defval: true, inline: 'VOL', group: STAT_GR,
    tooltip: 'Displays volume statistics including relative activity and volume behavior across timeframes.' },
  { id: 'statSize', type: 'string', title: '  Panel Text Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], group: STAT_GR, display: SHOWN },
  { id: 'bbType', type: 'string', title: '  Basis Type', defval: 'SMA', options: MA_OPTIONS, group: BB_GR, display: SHOWN },
  { id: 'bbSource', type: 'source', title: '  Source', defval: 'close', group: BB_GR, display: SHOWN },
  { id: 'bbLength', type: 'int', title: '  Length', defval: 20, min: 1, group: BB_GR, display: SHOWN },
  { id: 'bbMult', type: 'float', title: '  Standard Deviation', defval: 2.0, min: 0.01, max: 50, group: BB_GR, display: SHOWN },
  { id: 'bbbColor', type: 'color', title: '  Color Basis', defval: 'rgba(255, 152, 0, 0.5)', inline: 'BB', group: BB_GR },
  { id: 'bbuColor', type: 'color', title: 'Bands', defval: BLUE, inline: 'BB', group: BB_GR },
  { id: 'maType', type: 'string', title: '  Type', defval: 'SMA', options: MA_OPTIONS, group: MA_GR, display: SHOWN,
    tooltip: 'Select the moving average type used across overlays and mini charts.' },
  { id: 'maSource', type: 'source', title: '  Source', defval: 'close', group: MA_GR, display: SHOWN },
  { id: 'maLength', type: 'int', title: '  Length', defval: 5, min: 1, group: MA_GR, display: SHOWN,
    tooltip: 'Length used for moving averages displayed in mini charts.' },
  { id: 'maColor', type: 'color', title: '  Color', defval: BLUE, group: MA_GR },
  { id: 'ma20Color', type: 'color', title: '  Ribbon', defval: '#00C8FF', inline: 'RIB', group: MA_GR,
    tooltip: 'Colors used for the moving average ribbon displayed on the main chart.\n\nRibbon lengths are fixed at 20, 50, 100, and 200.' },
  { id: 'ma50Color', type: 'color', title: '', defval: 'rgba(0, 160, 220, 0.95)', inline: 'RIB', group: MA_GR },
  { id: 'ma100Color', type: 'color', title: '', defval: 'rgba(0, 120, 190, 0.9)', inline: 'RIB', group: MA_GR },
  { id: 'ma200Color', type: 'color', title: '', defval: 'rgba(0, 80, 150, 0.85)', inline: 'RIB', group: MA_GR },
  { id: 'stLength', type: 'int', title: '  ATR Length', defval: 10, min: 1, group: ST_GR, display: SHOWN },
  { id: 'stFactor', type: 'float', title: '  Factor', defval: 3, min: 0.1, step: 0.1, group: ST_GR, display: SHOWN },
  { id: 'stColor', type: 'color', title: '  Color', defval: BLUE, group: ST_GR },
  { id: 'rsiLength', type: 'int', title: '  Length', defval: 14, min: 1, group: RSI_GR, display: SHOWN },
  { id: 'rsiSource', type: 'source', title: '  Source', defval: 'close', group: RSI_GR, display: SHOWN },
  { id: 'rsiSmoothing', type: 'bool', title: 'Signal Line       ', defval: true, inline: 'RSI', group: RSI_GR },
  { id: 'rsiMaType', type: 'string', title: '', defval: 'EMA', options: ['SMA', 'EMA', 'RMA', 'WMA', 'VWMA'], inline: 'RSI', group: RSI_GR, display: SHOWN },
  { id: 'rsiMaLength', type: 'int', title: '  Signal Line Length', defval: 14, group: RSI_GR, display: SHOWN },
  { id: 'stochPeriodK', type: 'int', title: '  %K Length', defval: 14, min: 1, group: STOCH_GR, display: SHOWN },
  { id: 'stochSmoothK', type: 'int', title: '  %K Smoothing', defval: 1, min: 1, group: STOCH_GR, display: SHOWN },
  { id: 'stochPeriodD', type: 'int', title: '  %D Smoothing', defval: 3, min: 1, group: STOCH_GR, display: SHOWN },
  { id: 'vMaLen', type: 'int', title: '  Volume MA Length', defval: 89, group: VW_GR, display: SHOWN,
    tooltip: 'Length of the moving average used to normalize volume activity.' },
  { id: 'vwcbHigh', type: 'float', title: '  High Thresh', defval: 1.618, min: 1, step: 0.1, inline: 'H', group: VW_GR, display: SHOWN },
  { id: 'vwHBLClr', type: 'color', title: '', defval: '#006400', inline: 'H', group: VW_GR },
  { id: 'vwHBRClr', type: 'color', title: '', defval: '#910000', inline: 'H', group: VW_GR },
  { id: 'vwcbLow', type: 'float', title: '  Low Thresh', defval: 0.618, min: 0.1, step: 0.1, inline: 'L', group: VW_GR, display: SHOWN },
  { id: 'vwLBLClr', type: 'color', title: '', defval: '#7FFFD4', inline: 'L', group: VW_GR },
  { id: 'vwLBRClr', type: 'color', title: '', defval: '#FF9800', inline: 'L', group: VW_GR },
  { id: 'oscVerticalOffset', type: 'int', title: '  Oscillator Offset', defval: 9, min: 0, max: 17, group: MISC_GR, display: SHOWN,
    tooltip: 'Vertical offset of the oscillator relative to the price chart.\n\nIncrease if the oscillator overlaps price.' },
  { id: 'oscHeight', type: 'int', title: '  Oscillator Height', defval: 10, min: 1, max: 10, group: MISC_GR, display: SHOWN,
    tooltip: 'Controls the vertical scaling of the oscillator display.' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ST Up Trend', color: GREEN, lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'ST Down Trend', color: RED, lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Body Middle', color: BLUE, lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'BB Basis', color: BLUE, lineWidth: 1 },
  { id: 'plot4', title: 'BB Upper', color: BLUE, lineWidth: 1 },
  { id: 'plot5', title: 'BB Lower', color: BLUE, lineWidth: 1 },
  { id: 'plot6', title: 'MA (20)', color: BLUE, lineWidth: 1 },
  { id: 'plot7', title: 'MA (50)', color: BLUE, lineWidth: 1 },
  { id: 'plot8', title: 'MA (100)', color: BLUE, lineWidth: 2 },
  { id: 'plot9', title: 'MA (200)', color: BLUE, lineWidth: 2 },
];

export const metadata = {
  title: 'HTF Candles by DGT',
  shortTitle: 'HTF+ ☼☾',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500) */
const MAX_BOXES = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** Pine na(): an infinite value counts as na */
const na = (v: number) => !Number.isFinite(v);
const nz = (v: number | undefined | null) => (v === undefined || v === null || Number.isNaN(v) ? 0 : v);

const arr = (s: { toArray(): ArrayLike<number | null | undefined> }): number[] => Array.from(s.toArray(), (v) => v ?? NaN);

/** ticker.heikinashi: Heikin Ashi bars of the bars (the volume is kept) */
function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({ time: b.time, open, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), close, volume: b.volume });
  }
  return out;
}

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars, and for each chart bar the index of the latest completed bar of that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, sameAsChart: boolean, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  if (sameAsChart) return { htf: bars, latest: bars.map((_b, i) => i) };
  // With the exchange calendar of the chart context (time zone and session): the periods and the bars that
  // complete them come from the library rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, latest: exchange.latest };
  const n = bars.length;
  const starts = periodStarts(bars, tf);
  const htf: Bar[] = [];
  const group: number[] = [];
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
  // A bar completes its period when its close reaches the end of the period. Symbols that trade every day follow
  // the UTC calendar: the period of the close time is another period. Other symbols: the last bar of a period.
  const ms = n > 0 && bars[0].time >= 1e12;
  const weekend = (t: number) => {
    const wd = new Date(ms ? t : t * 1000).getUTCDay();
    return wd === 0 || wd === 6;
  };
  const interval = barInterval(bars);
  const closes = bars.map((b) => ({ time: b.time + interval }));
  const calendar = bars.some((b) => weekend(b.time)) && closes.some((b) => weekend(b.time));
  const closeStarts = calendar ? periodStarts(closes, tf) : [];
  // The last bar of a symbol that does not trade every day: its period is complete when the next possible bar is in
  // another period (the next weekday, or the same day while the bar is earlier than the last bar of the day before)
  let lastEnds = true;
  if (!calendar && n > 1) {
    const DAY = 86400000;
    const toMs = (t: number) => (ms ? t : t * 1000);
    const lastMs = toMs(bars[n - 1].time);
    const day = Math.floor(lastMs / DAY) * DAY;
    let next = lastMs + toMs(interval);
    let sessionOver = true;
    if (toMs(interval) < DAY) {
      let j = n - 2;
      while (j >= 0 && toMs(bars[j].time) >= day) j--;
      sessionOver = j < 0 || lastMs - day >= toMs(bars[j].time) % DAY;
    }
    if (sessionOver) {
      next = day + DAY;
      while (weekend(ms ? next : next / 1000)) next += DAY;
    }
    const withNext = periodStarts([...bars, { time: ms ? next : next / 1000 }], tf);
    lastEnds = withNext[n] !== withNext[n - 1];
  }
  const latest: number[] = [];
  for (let i = 0; i < n; i++) {
    let done = i === 0 ? -1 : latest[i - 1];
    if (i > 0 && group[i] !== group[i - 1]) done = Math.max(done, group[i] - 1);
    const ends = i === n - 1 ? lastEnds : starts[i + 1] !== starts[i];
    const reaches = !calendar || closeStarts[i] !== starts[i];
    if (ends && reaches) done = Math.max(done, group[i]);
    latest.push(done);
  }
  return { htf, latest };
}

interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
  border: string;
  deleted: boolean;
}

export function calculate(
  allBars: Bar[],
  inputs: Partial<HtfCandlesMiniChartsByDgtInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines' | 'polylines' | 'tables' | 'barColors'> & {
    boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[]; polylines: PolylineData[]; tables: TableData[];
    barColors: BarColorData[];
  } {
  const cfg = { ...defaultInputs, ...inputs };
  const mintick = mintickOf(chart);
  const tz = timezoneOf(chart);
  const fg = foregroundColorOf(chart);
  const bg = backgroundColorOf(chart);
  const oscVerticalOffset = cfg.oscVerticalOffset / 10;
  const oscHight = 11 - cfg.oscHeight;
  const OSC_HST = 100;
  const textSize = cfg.statSize === 'Small' ? 'small' : cfg.statSize === 'Normal' ? 'normal' : 'tiny';

  const sides = ([1, 2] as const).map((k) => {
    const v = <T,>(name: string) => (cfg as unknown as Record<string, T>)[`htf${k}${name}`];
    return {
      first: k === 1,
      show: v<boolean>('SH'), userTf: v<TimeframeOption>('TF'), type: v<ChartType>('CT'), vw: v<OnOff>('VWs') === 'On',
      bull: v<string>('BLClr'), bear: v<string>('BRClr'), transp: v<number>('ClrT'), mini: v<boolean>('SHm'),
      nb: Math.trunc(v<number>('NB')), ti: v<MiniOverlay>('TI'), oi: v<Oscillator>('OI'), rl: v<ReferenceLevels>('RL'),
      vwMini: v<OnOff>('VWms') === 'On', labels: v<OnOff>('LBs') === 'On', offset: Math.trunc(v<number>('SZ')),
    };
  });
  const [side1, side2] = sides;

  // ---- timeframes ----------------------------------------------------------------------------------------------
  // timeframe.period: the text of the chart context, else from the bar spacing
  const chartTf = chart?.timeframe ?? chartTimeframe(allBars);
  const chartInfo = chartTf === '' ? null : timeframe.info(chartTf);
  const chartMinutes = chartTf === '' ? NaN : timeframe.in_seconds(chartTf) / 60;
  const intraday = !!chartInfo?.isintraday;
  const daily = !!chartInfo?.isdaily;
  const weekly = !!chartInfo?.isweekly;
  const monthly = !!chartInfo?.ismonthly;
  /** timeframe(userTimeframe): the timeframe of the option when it is not below the chart timeframe */
  const effectiveTf = (user: TimeframeOption): string => {
    const minutes: Partial<Record<TimeframeOption, number>> = {
      '1 Minute': 1, '3 Minutes': 3, '5 Minutes': 5, '15 Minutes': 15, '30 Minutes': 30, '1 Hour': 60, '2 Hours': 120,
      '4 Hours': 240, '12 Hours': 720,
    };
    const m = minutes[user];
    if (m !== undefined && chartMinutes <= m) return String(m);
    if (user === '1 Day' && intraday) return 'D';
    if (user === '1 Week' && (daily || intraday)) return 'W';
    if (user === '1 Month' && (weekly || daily || intraday)) return 'M';
    return chartTf;
  };
  const tfStringToMinutes = (tf: string): number => {
    switch (tf) {
      case '1': return 1;
      case '3': return 3;
      case '5': return 5;
      case '15': return 15;
      case '30': return 30;
      case '60': return 60;
      case '120': return 120;
      case '240': return 240;
      case '720': return 720;
      case 'D': return 24 * 60;
      case 'W': return 7 * 24 * 60;
      case 'M': return 30 * 24 * 60;
      default: return chartMinutes;
    }
  };
  const tfToBars = (user: TimeframeOption) => Math.max(1, Math.trunc(tfStringToMinutes(effectiveTf(user)) / chartMinutes) || 1);
  const timeframeText = (user: TimeframeOption): string => {
    const tf = effectiveTf(user);
    if (!/[DWMS]/.test(tf)) {
      const num = Number(tf);
      return num < 60 ? `${tf}m` : `${str.tostring(num / 60)}H`;
    }
    return tf;
  };

  const maxNb = Math.max(side1.nb, side2.nb);
  const lookbackRange = Math.min(Math.trunc(Math.max(
    (side1.mini ? side1.nb : 1) * (side1.mini ? tfToBars(side1.userTf) : 1),
    (side2.mini ? side2.nb : 1) * (side2.mini ? tfToBars(side2.userTf) : 1),
  )), 15000);
  const rangeLength = Math.max(lookbackRange, maxNb);
  const tiMaxLength = Math.max(cfg.stLength, cfg.maLength, cfg.bbLength, cfg.rsiLength + cfg.rsiMaLength,
    cfg.stochPeriodK + cfg.stochSmoothK + cfg.stochPeriodD, cfg.vMaLen, 200);
  const lookbackBars = Math.max(lookbackRange, maxNb + tiMaxLength + 1);
  /** calc_bars_count of the two timeframe requests */
  const calcBars = lookbackBars + 1;

  const sameTf = (tf: string) => chartTf === '' || tf === chartTf || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf);
  const tfs = sides.map((s) => effectiveTf(s.userTf));
  // A request for the chart symbol and the chart timeframe with a bar limit also limits the bars of the script
  const limited = sides.some((s, k) => sameTf(tfs[k]) && s.type !== 'Heikin Ashi');
  const off = limited ? Math.max(0, allBars.length - calcBars) : 0;
  const bars = off > 0 ? allBars.slice(off) : allBars;
  const n = bars.length;
  const last = n - 1;

  // ---- indicators of one bar series (the chart bars or the bars of a timeframe) -----------------------------------
  const S = (list: Bar[], f: (b: Bar) => number) => new Series(list, f);
  const movingAverage = (list: Bar[], source: Series, length: number, type: string): Series => {
    switch (type) {
      case 'SMA': return ta.sma(source, length);
      case 'EMA': return ta.ema(source, length);
      case 'HMA': return ta.hma(source, length);
      case 'RMA': return ta.rma(source, length);
      case 'WMA': return ta.wma(source, length);
      case 'VWMA': return ta.vwma(source, length, S(list, (b) => b.volume ?? NaN));
      default: return S(list, () => NaN);
    }
  };
  const rsi = (list: Bar[]) => {
    const oscS = ta.rsi(getSourceSeries(list, cfg.rsiSource), cfg.rsiLength);
    const osc = arr(oscS);
    const sig = cfg.rsiSmoothing ? arr(movingAverage(list, oscS, cfg.rsiMaLength, cfg.rsiMaType)) : osc.map(() => NaN);
    const stat = osc.map((v) => {
      const state = gt(v, 70) ? '▲ Overbought' : ge(v, 60) ? '▲ Bullish' : gt(v, 40) ? 'Neutral' : gt(v, 30) ? '▼ Bearish' : '▼ Oversold';
      return `\nRSI(${str.tostring(v, '#.#')}) · ${state}`;
    });
    return { osc, sig, stat };
  };
  const stochastic = (list: Bar[]) => {
    const k = ta.stoch(S(list, (b) => b.close), S(list, (b) => b.high), S(list, (b) => b.low), cfg.stochPeriodK);
    const oscS = ta.sma(k, cfg.stochSmoothK);
    const osc = arr(oscS);
    const sig = arr(ta.sma(oscS, cfg.stochPeriodD));
    const stat = osc.map((v) => {
      const state = gt(v, 80) ? '▲ Overbought' : ge(v, 60) ? '▲ Bullish' : gt(v, 40) ? 'Neutral' : gt(v, 20) ? '▼ Bearish' : '▼ Oversold';
      return `\nStochastic(${str.tostring(v, '#.#')}) · ${state}`;
    });
    return { osc, sig, stat };
  };
  const supertrend = (list: Bar[]) => {
    const [st, dir] = ta.supertrend(list, cfg.stFactor, cfg.stLength);
    return { st: arr(st), dir: arr(dir) };
  };
  const bollinger = (list: Bar[]) => {
    const source = getSourceSeries(list, cfg.bbSource);
    const basis = arr(movingAverage(list, source, cfg.bbLength, cfg.bbType));
    const dev = arr(ta.stdev(source, cfg.bbLength)).map((v) => cfg.bbMult * v);
    return { basis, dev };
  };
  const ribbon = (list: Bar[]) => {
    const source = getSourceSeries(list, cfg.maSource);
    return [20, 50, 100, 200].map((len) => arr(movingAverage(list, source, len, cfg.maType)));
  };
  const volumeStats = (list: Bar[]) => {
    const vol = list.map((b) => nz(b.volume));
    const volMa = arr(ta.sma(Series.fromArray(list, vol), cfg.vMaLen));
    return { vol, volMa };
  };

  // ---- the two timeframe requests: collectData() on the last calcBars bars of the timeframe ----------------------
  const requests = sides.map((s, k) => {
    const collect = s.show || s.mini || cfg.volStat || cfg.pmaStat;
    const same = sameTf(tfs[k]);
    const built = timeframeBars(allBars, tfs[k], same, chart);
    const htf = s.type === 'Heikin Ashi' ? heikinAshi(built.htf) : built.htf;
    const start = Math.max(0, htf.length - calcBars);
    const win = htf.slice(start);
    const { vol, volMa } = volumeStats(win);
    const volState = vol.map((v, i) => (gt(v, volMa[i] * cfg.vwcbHigh) ? 1 : lt(v, volMa[i] * cfg.vwcbLow) ? -1 : 0));
    const mas = ribbon(win);
    let tiBasis: number[] = [];
    let tiComponent: number[] = [];
    let tiHigh: number[] = [];
    let osc: number[] = [];
    let sig: number[] = [];
    let stat: string[] = [];
    if (collect && s.mini) {
      const closes = win.map((b) => b.close);
      if (s.ti === 'Supertrend') {
        const r = supertrend(win);
        tiBasis = r.st;
        tiComponent = r.dir;
        tiHigh = r.st;
      } else if (s.ti === 'Bollinger Bands') {
        const r = bollinger(win);
        tiBasis = r.basis;
        tiComponent = r.dev;
        tiHigh = r.basis.map((v, i) => v + r.dev[i]);
      } else if (s.ti === 'Moving Average') {
        tiBasis = arr(movingAverage(win, getSourceSeries(win, cfg.maSource), cfg.maLength, cfg.maType));
        tiComponent = tiBasis.map(() => 1);
        tiHigh = tiBasis;
      } else {
        tiBasis = closes;
        tiComponent = closes;
        tiHigh = closes;
      }
      if (s.oi === 'RSI') ({ osc, sig, stat } = rsi(win));
      else if (s.oi === 'Stochastic') ({ osc, sig, stat } = stochastic(win));
      else {
        osc = closes;
        sig = closes;
        stat = closes.map(() => '');
      }
    }
    /** Index in the window of the timeframe bar that chart bar `f` (index in all the bars) shows; -1: no data */
    const at = (f: number) => (collect && built.latest[f] >= start ? built.latest[f] - start : -1);
    return { collect, win, at, vol, volMa, volState, mas, tiBasis, tiComponent, tiHigh, osc, sig, stat };
  });

  // ---- the chart bars ---------------------------------------------------------------------------------------------
  const { vol: nzVolume, volMa: vSMA } = volumeStats(bars);
  const pLSTArr = arr(ta.lowest(S(bars, (b) => b.low), rangeLength));
  const pHSTArr = arr(ta.highest(S(bars, (b) => b.high), rangeLength));
  const pLST = n > 0 ? pLSTArr[last] : NaN;
  const pHST = n > 0 ? pHSTArr[last] : NaN;
  const pCHR = ne(pHST, 0) ? (pHST - pLST) / pHST : 0;
  const oscBase = pLST * (1 - pCHR * oscVerticalOffset);
  const oscY = (v: number) => oscBase * (1 + v / OSC_HST * pCHR / oscHight);

  const interval = barInterval(allBars);
  /** Time of the bar with index `x` of the script (after the last bar: future bar times) */
  const T = (x: number) => barTime(allBars, off + x, interval);

  /** timeframe.change(tf) on the chart bars: false on the first bar */
  const changes = (tf: string): boolean[] => {
    if (sameTf(tf)) return bars.map((_b, i) => i > 0);
    const starts = periodStarts(allBars, tf, chart);
    return bars.map((_b, i) => i > 0 && starts[off + i] !== starts[off + i - 1]);
  };

  // ---- drawings -----------------------------------------------------------------------------------------------------
  // Boxes in creation order: when a creation brings the count above max + 5, the oldest are deleted until max remain.
  // A box held by a `var` variable of the script (the two boxes of the current period of each timeframe) is never
  // deleted by this limit, but it counts.
  const boxes: Bx[] = [];
  const held = new Set<Bx>();
  const newBox = (b: Omit<Bx, 'deleted'>, before: Bx | null): Bx => {
    const o = { ...b, deleted: false };
    if (before) held.delete(before);
    held.add(o);
    boxes.push(o);
    if (boxes.length > MAX_BOXES + 5) {
      for (let k = 0; k < boxes.length && boxes.length > MAX_BOXES;) {
        if (held.has(boxes[k])) k++;
        else boxes.splice(k, 1)[0].deleted = true;
      }
    }
    return o;
  };
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const polylines: PolylineData[] = [];
  const addLine = (x1: number, y1: number, x2: number, y2: number, css: string, style: 'solid' | 'dashed' | 'dotted', width: number) => {
    // a line with an na coordinate is not drawn
    if ([x1, y1, x2, y2].some((v) => Number.isNaN(v))) return;
    lines.push({
      time1: T(x1), price1: y1, time2: T(x2), price2: y2, color: css,
      ...(style !== 'solid' ? { style } : {}), ...(width !== 1 ? { width } : {}),
    });
  };
  const addLabel = (x: number, y: number, l: Omit<LabelData, 'time' | 'price'>) => {
    if (Number.isNaN(x) || Number.isNaN(y)) return;
    labels.push({ time: T(x), price: y, ...l });
  };
  const addPolyline = (points: Array<[number, number]>, lineColor: string, width: number, withFill: boolean) => {
    // points with an na coordinate are left out; a polyline without points is not drawn
    const pts = points.filter(([x, y]) => !Number.isNaN(x) && !Number.isNaN(y)).map(([x, y]) => ({ time: T(x), price: y }));
    if (pts.length === 0) return;
    polylines.push({ points: pts, lineColor, ...(withFill ? { fillColor: NO_COLOR } : {}), ...(width !== 1 ? { lineWidth: width } : {}) });
  };
  const half = (c: string) => String(color.new(c, 50));
  const oscStyle = (kind: Oscillator) => (kind === 'RSI'
    ? { oscColor: '#7E57C2', sigColor: '#FDD835', upper: 70, lower: 30 }
    : { oscColor: '#2962FF', sigColor: '#FF6D00', upper: 80, lower: 20 });

  // processMini(): on the last bar
  const miniReady = n > 0 && last > maxNb + tiMaxLength - 1;
  sides.forEach((s, k) => {
    if (!(s.mini && miniReady)) return;
    const r = requests[k];
    const w = r.at(off + last);
    if (w < 0) return;
    const hOffset = s.first ? s.offset : side1.mini ? side1.offset + s.offset + side1.nb : s.offset;
    const from = Math.max(0, w - s.nb + 1);
    const x = (j: number) => hOffset + last + (j - from);
    const highLow = s.type === 'High-Low';

    const basisPoints: Array<[number, number]> = [];
    const upperPoints: Array<[number, number]> = [];
    const lowerPoints: Array<[number, number]> = [];
    const oscPoints: Array<[number, number]> = [];
    const sigPoints: Array<[number, number]> = [];
    for (let j = from; j <= w; j++) {
      const b = r.win[j];
      const bearCandle = gt(b.open, b.close);
      const state = r.volState[j];
      const barColor = highLow ? BLUE
        : s.vwMini && state === 1 ? (bearCandle ? cfg.vwHBRClr : cfg.vwHBLClr)
          : s.vwMini && state === -1 ? (bearCandle ? cfg.vwLBRClr : cfg.vwLBLClr)
            : bearCandle ? s.bear : s.bull;
      if (!highLow) addLine(x(j), b.open, x(j), b.close, barColor, 'solid', 3);
      addLine(x(j), b.high, x(j), b.low, barColor, 'solid', highLow ? 3 : 1);
      if (s.ti !== 'None' && gt(r.tiBasis[j], 0)) {
        if (s.ti === 'Bollinger Bands') {
          upperPoints.push([x(j), r.tiBasis[j] + r.tiComponent[j]]);
          basisPoints.push([x(j), r.tiBasis[j]]);
          lowerPoints.push([x(j), r.tiBasis[j] - r.tiComponent[j]]);
        } else {
          basisPoints.push([x(j), r.tiBasis[j]]);
        }
      }
      if (s.oi !== 'None' && gt(r.osc[j], 0)) {
        oscPoints.push([x(j), oscY(r.osc[j])]);
        sigPoints.push([x(j), oscY(r.sig[j])]);
      }
    }

    if (s.ti === 'Supertrend') {
      addPolyline(basisPoints, cfg.stColor, 1, true);
      for (let j = from + 1; j <= w; j++) {
        if (ne(r.tiComponent[j], r.tiComponent[j - 1])) {
          addPolyline([[x(j) - 1, r.tiBasis[j - 1]], [x(j), r.tiBasis[j]]], bg, 2, true);
          addLabel(x(j), r.tiBasis[j], { text: '', color: cfg.stColor, style: 'circle', size: 'auto' });
        }
      }
    } else if (s.ti === 'Bollinger Bands') {
      addPolyline(upperPoints, cfg.bbuColor, 1, true);
      addPolyline(basisPoints, cfg.bbbColor, 1, true);
      addPolyline(lowerPoints, cfg.bbuColor, 1, true);
    } else if (s.ti === 'Moving Average') {
      addPolyline(basisPoints, cfg.maColor, 1, true);
    }

    if (s.oi !== 'None') {
      const { oscColor, sigColor, upper, lower } = oscStyle(s.oi);
      addPolyline(oscPoints, oscColor, 1, true);
      addPolyline(sigPoints, sigColor, 1, true);
      if (oscPoints.length === 0) {
        // oscPoints.first() of the original: a runtime error
        throw new Error(`Index 0 is out of bounds, array size is 0 (the mini chart oscillator has no value on the bars of timeframe "${tfs[k]}")`);
      }
      const x1 = oscPoints[0][0];
      const x2 = oscPoints[oscPoints.length - 1][0];
      addLine(x1, oscY(upper), x2, oscY(upper), half(RED), 'solid', 2);
      addLine(x1, oscY(50), x2, oscY(50), half(GRAY), 'dotted', 2);
      addLine(x1, oscY(lower), x2, oscY(lower), half(TEAL), 'solid', 2);
    }

    if (s.rl === 'Range Extremes' || s.rl === 'Range Quartiles') {
      const back = Math.min(tfToBars(s.userTf) * (s.nb - 1), 5000);
      const sIdx = back <= last ? last - back : NaN;
      const eIdx = hOffset + last + s.nb;
      const window = r.win.slice(from, w + 1);
      const hst = array.max(window.map((b) => b.high));
      const lst = array.min(window.map((b) => b.low));
      const tick = (v: number) => str.tostring(v, 'mintick', mintick);
      const text = { color: NO_COLOR, textColor: fg, size: 'small' as const };
      addLine(sIdx, hst, eIdx, hst, half(GRAY), 'solid', 1);
      addLine(sIdx, lst, eIdx, lst, half(GRAY), 'solid', 1);
      if (s.labels) {
        addLabel(eIdx - 1, hst, { text: `H · ${tick(hst)}`, style: 'label_lower_left', ...text });
        addLabel(eIdx - 1, lst, { text: `L · ${tick(lst)}`, style: 'label_upper_left', ...text });
      }
      if (s.rl === 'Range Quartiles') {
        const q = (hst - lst) / 4;
        addLine(sIdx, lst + 3 * q, eIdx, lst + 3 * q, half(GRAY), 'dashed', 1);
        addLine(sIdx, lst + 2 * q, eIdx, lst + 2 * q, half(GRAY), 'dotted', 1);
        addLine(sIdx, lst + 1 * q, eIdx, lst + 1 * q, half(GRAY), 'dashed', 1);
        if (s.labels) {
          addLabel(eIdx, lst + 3 * q, { text: `75% · ${tick(lst + 3 * q)}`, style: 'label_left', ...text });
          addLabel(eIdx, lst + 2 * q, { text: `50% · ${tick(lst + 2 * q)}`, style: 'label_left', ...text });
          addLabel(eIdx, lst + 1 * q, { text: `25% · ${tick(lst + 1 * q)}`, style: 'label_left', ...text });
        }
      }
    }

    if (s.labels) {
      const window = r.win.slice(from, w + 1);
      const highest = array.max(window.map((b) => b.high));
      const tiHighest = array.max(r.tiHigh.slice(from, w + 1));
      const htfHST = Number.isNaN(highest) || Number.isNaN(tiHighest) ? NaN : Math.max(highest, tiHighest);
      const overlay = s.ti === 'None' ? '' : s.ti === 'Moving Average' ? `\n${s.ti} (${cfg.maType})` : `\n${s.ti}`;
      const xMid = hOffset + Math.trunc(s.nb / 2) + last;
      addLabel(xMid, htfHST, {
        text: `${timeframeText(s.userTf)} · ${s.type}${overlay}`, color: NO_COLOR, textColor: fg, style: 'label_down', textAlign: 'left',
      });
      if (s.oi !== 'None') {
        addLabel(xMid, oscBase, { text: r.stat[w], color: NO_COLOR, textColor: fg, style: 'label_up', textAlign: 'left' });
      }
    }
  });

  // processHTF(): the candles of the timeframe on the chart
  const candles = sides.map((s, k) => ({
    s, r: requests[k], changed: s.show ? changes(tfs[k]) : [], hl: null as Bx | null, oc: null as Bx | null, ran: false,
  })).filter((c) => c.s.show);
  for (let i = 0; i < n; i++) {
    for (const c of candles) {
      const { s, r } = c;
      const w = r.at(off + i);
      if (w < 0) continue;
      const b = r.win[w];
      const bearCandle = lt(b.close, b.open);
      const state = r.volState[w];
      const bxColor = s.vw && state === 1 ? (bearCandle ? cfg.vwHBRClr : cfg.vwHBLClr)
        : s.vw && state === -1 ? (bearCandle ? cfg.vwLBRClr : cfg.vwLBLClr)
          : bearCandle ? s.bear : s.bull;
      const border = String(color.new(bxColor, 70));
      const fill = String(color.new(bxColor, s.transp));
      // timeframe.change() is false on the first bar where this block runs
      if (c.ran && c.changed[i]) {
        c.hl = newBox({ left: i, top: b.high, right: i, bottom: b.low, bg: fill, border }, c.hl);
        // the original tests the chart type of the first timeframe here
        if (side1.type !== 'High-Low') c.oc = newBox({ left: i, top: b.open, right: i, bottom: b.close, bg: fill, border }, c.oc);
      } else {
        if (c.hl && !c.hl.deleted) {
          c.hl.top = b.high;
          c.hl.right = i;
          c.hl.bottom = b.low;
          c.hl.bg = fill;
          c.hl.border = border;
        }
        if (s.type !== 'High-Low' && c.oc && !c.oc.deleted) {
          c.oc.top = b.open;
          c.oc.right = i;
          c.oc.bottom = b.close;
          c.oc.bg = fill;
          c.oc.border = border;
        }
      }
      c.ran = true;
    }
  }

  // ---- plots: the chart overlay -------------------------------------------------------------------------------------
  const nAll = allBars.length;
  const series = (f: (i: number) => number, css?: (i: number) => string) => allBars.map((b, a) => {
    const i = a - off;
    const value = i < 0 ? NaN : f(i);
    return css && i >= 0 ? { time: b.time, value: na(value) ? NaN : value, color: css(i) } : { time: b.time, value: na(value) ? NaN : value };
  });
  const st = cfg.chartTI === 'Supertrend' ? supertrend(bars) : null;
  const bb = cfg.chartTI === 'Bollinger Bands' ? bollinger(bars) : null;
  const mas = ribbon(bars);
  const showRibbon = cfg.chartTI === 'Moving Average Ribbon';
  const plots = {
    plot0: series((i) => (st && i > 0 && lt(st.dir[i], 0) ? st.st[i] : NaN)),
    plot1: series((i) => (st && i > 0 && !lt(st.dir[i], 0) ? st.st[i] : NaN)),
    plot2: series((i) => (st && i > 0 ? (bars[i].open + bars[i].close) / 2 : NaN)),
    plot3: series((i) => (bb ? bb.basis[i] : NaN), () => cfg.bbbColor),
    plot4: series((i) => (bb ? bb.basis[i] + bb.dev[i] : NaN), () => cfg.bbuColor),
    plot5: series((i) => (bb ? bb.basis[i] - bb.dev[i] : NaN), () => cfg.bbuColor),
    plot6: series((i) => (showRibbon ? mas[0][i] : NaN), () => cfg.ma20Color),
    plot7: series((i) => (showRibbon ? mas[1][i] : NaN), () => cfg.ma50Color),
    plot8: series((i) => (showRibbon ? mas[2][i] : NaN), () => cfg.ma100Color),
    plot9: series((i) => (showRibbon ? mas[3][i] : NaN), () => cfg.ma200Color),
  };

  // ---- the chart oscillator (on the last bar) -----------------------------------------------------------------------
  if (n > 0 && cfg.chartOI !== 'None') {
    const { osc, sig, stat } = cfg.chartOI === 'RSI' ? rsi(bars) : stochastic(bars);
    const { oscColor, sigColor, upper, lower } = oscStyle(cfg.chartOI);
    const back = (k: number) => (k <= last ? last - k : NaN);
    addLine(back(maxNb), oscY(upper), last, oscY(upper), half(RED), 'solid', 2);
    addLine(back(maxNb), oscY(50), last, oscY(50), half(GRAY), 'dotted', 2);
    addLine(back(maxNb), oscY(lower), last, oscY(lower), half(TEAL), 'solid', 2);
    addLabel(back(Math.trunc(maxNb / 2)), oscBase, { text: stat[last], color: NO_COLOR, textColor: fg, style: 'label_up', textAlign: 'left' });
    const oscPoints: Array<[number, number]> = [];
    const sigPoints: Array<[number, number]> = [];
    for (let k = 0; k < maxNb; k++) {
      const i = back(k);
      if (!Number.isNaN(i) && gt(osc[i], 0)) oscPoints.push([i, oscY(osc[i])]);
      if (cfg.rsiSmoothing) sigPoints.push([i, Number.isNaN(i) ? NaN : oscY(sig[i])]);
    }
    addPolyline(oscPoints, oscColor, 1, false);
    addPolyline(sigPoints, sigColor, 1, false);
  }

  // ---- bar colours: volume against its average ------------------------------------------------------------------------
  const barColors: BarColorData[] = [];
  if (cfg.chartVWs === 'On') {
    for (let i = 0; i < n; i++) {
      const v = nzVolume[i];
      if (v === 0) continue;
      const bull = gt(bars[i].close, bars[i].open);
      if (gt(v, vSMA[i] * cfg.vwcbHigh)) barColors.push({ time: bars[i].time, color: bull ? cfg.vwHBLClr : cfg.vwHBRClr });
      else if (lt(v, vSMA[i] * cfg.vwcbLow)) barColors.push({ time: bars[i].time, color: bull ? cfg.vwLBLClr : cfg.vwLBRClr });
    }
  }

  // ---- statistic panel --------------------------------------------------------------------------------------------------
  const UP = '#22AB94';
  const DOWN = '#F23645';
  const NA_COLOR = '#9AA0A6';
  const TRANSP = 89;
  const cells: TableCellData[] = [];
  const cell = (column: number, row: number, text: string, textColor: string, bgColor: string, more: Partial<TableCellData> = {}) => {
    const c: TableCellData = { column, row, text, textColor, bgColor, textSize, fontFamily: 'monospace', ...more };
    const k = cells.findIndex((o) => o.column === column && o.row === row);
    if (k >= 0) cells[k] = c;
    else cells.push(c);
  };
  const soft = (c: string) => String(color.new(c, TRANSP));
  const header = String(color.new(NA_COLOR, 81));
  /** A value cell: "-" style when na, else green above 0 and red otherwise */
  const tone = (v: number) => (na(v) ? NA_COLOR : gt(v, 0) ? UP : DOWN);
  const pct = (v: number) => str.tostring(v, '#.##');

  if (n > 0) {
    const ms = allBars[0].time >= 1e12;
    const tMs = (i: number) => (ms ? bars[i].time : bars[i].time * 1000);
    const monthOf = bars.map((_b, i) => time.month(tMs(i), tz));
    const yearOf = bars.map((_b, i) => time.year(tMs(i), tz));
    // getPriceValue(tf): the close of the bar before the latest start of a period (0 until the first one)
    const ror = (tf: string): number[] => {
      const changed = changes(tf);
      let value = 0;
      return bars.map((b, i) => {
        if (changed[i]) value = bars[i - 1].close;
        return (b.close / value - 1) * 100;
      });
    };
    const dROR = ror('D');
    const wROR = ror('W');
    const mROR = ror('M');
    const qROR = ror('3M');
    const yROR = ror('12M');
    const yearChange = changes('12M');
    let q1 = NaN;
    let q2 = NaN;
    let q3 = NaN;
    let q4 = NaN;
    let yROR1 = NaN;
    let yROR2 = NaN;
    let yROR3 = NaN;
    let yr1 = NaN;
    let yr2 = NaN;
    let yr3 = NaN;
    for (let i = 0; i < n; i++) {
      const m = monthOf[i];
      if (m < 4) {
        q1 = qROR[i];
        q2 = NaN;
        q3 = NaN;
        q4 = NaN;
      } else if (m < 7) q2 = qROR[i];
      else if (m < 10) q3 = qROR[i];
      else q4 = qROR[i];
      if (yearChange[i]) {
        yROR3 = yROR2;
        yr3 = yr2;
        yROR2 = yROR1;
        yr2 = yr1;
        yROR1 = yROR[i - 1];
        yr1 = yearOf[i - 1];
      }
    }
    const c = bars[last].close;
    const yearText = str.tostring(yearOf[last]);

    if (cfg.chgStat) {
      if (!weekly && !monthly && !na(dROR[last])) {
        const d = dROR[last];
        cell(1, 0, `${pct(d)}%\nDTD`, gt(d, 0) ? UP : DOWN, soft(gt(d, 0) ? UP : DOWN), { tooltip: 'Day to Date' });
        const w = wROR[last];
        cell(2, 0, na(w) ? '-\nWTD' : `${pct(w)}%\nWTD`, tone(w), soft(tone(w)), { tooltip: 'Week to Date' });
        const m = mROR[last];
        cell(3, 0, na(m) ? '-\nMTD' : `${pct(m)}%\nMTD`, tone(m), soft(tone(m)), { tooltip: 'Month to Date' });
      }
      if (!na(q1)) {
        const names = ['1st', '2nd', '3rd', '4th'];
        [q1, q2, q3, q4].forEach((q, k) => {
          cell(k, 1, na(q) ? `-\nQ${k + 1}` : `${pct(q)}%\nQ${k + 1}`, tone(q), soft(tone(q)), { tooltip: `${names[k]} Quarter of ${yearText}` });
        });
      }
      if (!na(yROR[last])) {
        const y = yROR[last];
        cell(3, 2, `${pct(y)}%\n${yearText}`, gt(y, 0) ? UP : DOWN, soft(gt(y, 0) ? UP : DOWN), { tooltip: `${yearText} Year to Date` });
        ([[2, yROR1, yr1], [1, yROR2, yr2], [0, yROR3, yr3]] as const).forEach(([column, y1, yr]) => {
          cell(column, 2, na(y1) ? '-\n-' : `${pct(y1)}%\n${str.tostring(yr)}`, tone(y1), soft(tone(y1)),
            { tooltip: na(y1) && na(yr) ? '' : `${str.tostring(yr)} Rate of Return` });
        });
      }
    }

    const at1 = requests[0].at(off + last);
    const at2 = requests[1].at(off + last);
    if (cfg.pmaStat) {
      cell(1, 3, 'Chart', NA_COLOR, header);
      cell(2, 3, timeframeText(side1.userTf), NA_COLOR, header);
      cell(3, 3, timeframeText(side2.userTf), NA_COLOR, header);
      const pma = (ma: number) => (c / ma - 1) * 100;
      [20, 50, 100, 200].forEach((len, k) => {
        const own = pma(mas[k][last]);
        if (k > 0 && na(own)) return;
        const row = 4 + k;
        cell(0, row, `MA${len}`, NA_COLOR, header, { textHAlign: 'left' });
        const values = [own, pma(at1 < 0 ? NaN : requests[0].mas[k][at1]), pma(at2 < 0 ? NaN : requests[1].mas[k][at2])];
        values.forEach((v, j) => cell(1 + j, row, na(v) ? '-' : `${pct(v)}%`, tone(v), soft(tone(v))));
      });
    }
    if (cfg.volStat) {
      cell(1, 8, 'Chart', NA_COLOR, header);
      cell(2, 8, timeframeText(side1.userTf), NA_COLOR, header);
      cell(3, 8, timeframeText(side2.userTf), NA_COLOR, header);
      cell(0, 9, `VOLUME\nAVG(${str.tostring(cfg.vMaLen)})`, NA_COLOR, header, { textHAlign: 'left' });
      const volText = (v: number) => (na(v) ? '-' : str.tostring(v, 'volume'));
      const above = gt(nzVolume[last], vSMA[last]);
      cell(1, 9, `${str.tostring(nzVolume[last], 'volume')}\n${volText(vSMA[last])}`, above ? UP : NA_COLOR, soft(above ? UP : NA_COLOR));
      [at1, at2].forEach((w, j) => {
        const v = w < 0 ? NaN : requests[j].vol[w];
        const a = w < 0 ? NaN : requests[j].volMa[w];
        cell(2 + j, 9, `${volText(v)}\n${volText(a)}`, gt(v, a) ? UP : NA_COLOR, soft(gt(v, a) ? UP : NA_COLOR));
      });
    }
  }

  const tables: TableData[] = [{ position: 'top_right', columns: 4, rows: 10, borderWidth: 3, cells }];
  if (n > 0) {
    tables.push({
      position: 'bottom_right', columns: 1, rows: 1,
      cells: [{ column: 0, row: 0, text: '☼☾  ', textSize: 'normal', textColor: TEAL, tooltip: 'SoleMare Analytics' }],
    });
  } else {
    tables.push({ position: 'bottom_right', columns: 1, rows: 1, cells: [] });
  }

  const fillOn = cfg.chartTI === 'Supertrend';
  const fillColors = (css: string) => new Array<string>(nAll).fill(fillOn ? css : 'transparent');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'ST Uptrend Fill', fillgaps: false }, colors: fillColors(String(color.new(GREEN, 90))) },
      { plot1: 'plot2', plot2: 'plot1', options: { title: 'ST Downtrend Fill', fillgaps: false }, colors: fillColors(String(color.new(RED, 90))) },
    ],
    barColors,
    boxes: boxes.map((b) => ({ time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg, borderColor: b.border })),
    lines,
    labels,
    polylines,
    tables,
  };
}

export const HtfCandlesMiniChartsByDgt = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
