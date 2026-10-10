/**
 * Bjorgum SuperScript
 *
 * Four bar colour strategies ('Select a Strategy') with their moving averages:
 * - "Bj Reversal": two Tilson T3 averages of the source (lengths 5 and 8, T3 = the generalised DEMA
 *   `ema * (1 + alpha) - ema(ema) * alpha` applied three times). Bars are the bull colour when the fast T3 is at or
 *   above the slow T3 and the close is above the slow T3, the bear colour in the opposite case, and the reversal
 *   colour when the close is on the other side of the slow T3. The two T3 lines and the fill between them are drawn.
 * - "MA": three moving averages (lengths 5, 9, 21; type "HEMA" = EMA of the Heikin-Ashi open, or SMA, EMA, T3, DEMA,
 *   TEMA, HMA, WMA, VWMA, SWMA, VWAP of the source). Bars are the bull colour when the close is above the first two
 *   averages, the bear colour when it is below both, else the hold colour. The three lines and the fills between
 *   them (and between the first one and hl2) are drawn.
 * - "TRM": TSI of the close with its EMA signal and RSI of the close ('TRM Speed Control': fast or slow lengths).
 *   Bars are the buy colour when TSI > signal and RSI > 50, the sell colour when TSI < signal and RSI < 50, else the
 *   hold colour.
 * - "RSI Color": one colour for each band of 5 RSI points.
 * Options: the lines of the other strategies, a parabolic SAR (circles), arrows when the TSI curls (TSI below its
 * signal and rising, or above it and falling), Heikin-Ashi candles or bars over the chart coloured by the strategy
 * (with the Heikin-Ashi close in the "Bj Reversal" rule), the real close as a line, and a rating table of 9 rows
 * (TRM, reversal, curl, RSI, TSI, the three averages, SAR) whose text colour goes from red (sum of the signals -6)
 * through grey (0) to green (+6).
 *
 * Notes:
 * - The RSI length follows 'TRM Speed Control' in the original ('RSI Bar Color Speed Control' is never reached in its
 *   length rule): the port keeps that rule.
 * - The rating table is created by the original also when it is not shown (it then has no cell): the port returns it
 *   in the same way.
 * - The Heikin-Ashi candles and bars are computed on every bar; without 'Overlays HA Plotcandle' their colours are
 *   na (returned as 'transparent').
 * - 'Real Close' is drawn with an offset of -9999 bars, as in the original.
 * - The type "VWAP" needs the trading day of the exchange on intraday bars: with it the port works on daily and
 *   higher bars (the value is the source of the bar, na without volume) and throws an Error on intraday bars.
 * - The alert inputs and the 20 alert conditions have no output.
 *
 * Reference: "Bjorgum SuperScript" by Bjorgum
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, str, array, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, MarkerData, PineSize, PlotBarData, PlotCandleData, TableCellData, TableData, TablePosition } from '../types';
import { barInterval } from '../bar-time';

type MaType = 'SMA' | 'EMA' | 'HEMA' | 'T3' | 'DEMA' | 'TEMA' | 'HMA' | 'WMA' | 'VWMA' | 'SWMA' | 'VWAP';

export interface BjorgumSuperScriptInputs {
  /** Select a Strategy */
  strat: 'Bj Reversal' | 'MA' | 'TRM' | 'RSI Color';
  /** MA source */
  source: SourceType;
  /** T3 Alpha */
  alphaInput: number;
  /** Show Tilson MA's */
  t3vis: boolean;
  /** Show HEMA MA's */
  hemavis: boolean;
  /** Show PSAR */
  psarvis: boolean;
  /** Show Arrows */
  arrowvis: boolean;
  /** Show Bjorgum Buy Rating */
  showTable: boolean;
  /** Disable Current MA */
  disable: boolean;
  /** TRM Speed Control */
  tsistrat: 'Fast' | 'Slow';
  /** RSI Bar Color Speed Control */
  rsistrat: 'Slow' | 'Fast';
  /** Candle Type */
  candleType: 'Hollow' | 'Bars' | 'Candles';
  /** Overlays HA Plotcandle */
  haover: boolean;
  /** Actual Close Value */
  rPrice: boolean;
  /** Alerts Mode (no output) */
  alertMode: 'once_per_bar' | 'once_per_bar_close';
  alertTrmBuy: boolean;
  alertTrmSell: boolean;
  alertRevUp: boolean;
  alertRevDown: boolean;
  alertMaCrossUp: boolean;
  alertMaCrossDown: boolean;
  alertRsiUp50: boolean;
  alertRsiDown50: boolean;
  alertRsiUp70: boolean;
  alertRsiDown30: boolean;
  alertRsiDown70: boolean;
  alertRsiUp30: boolean;
  alertTsiCurlUp: boolean;
  alertTsiCurlDown: boolean;
  alertSarUp: boolean;
  alertSarDown: boolean;
  /** Table text size */
  textSize: PineSize;
  tableYpos: 'top' | 'middle' | 'bottom';
  tableXpos: 'left' | 'center' | 'right';
  bullRev5: string;
  bearRev5: string;
  bullRev8: string;
  bearRev8: string;
  bullRevF: string;
  bearRevF: string;
  bullHema1: string;
  bearHema1: string;
  bullHema2: string;
  bearHema2: string;
  bullHema3: string;
  bearHema3: string;
  bullHema1F: string;
  bearHema1F: string;
  bullHema2F: string;
  bearHema2F: string;
  bullHema3F: string;
  bearHema3F: string;
  bullSar: string;
  bearSar: string;
  /** Length of the fast T3 */
  aLength: number;
  /** Length of the slow T3 */
  length: number;
  hemaslow: number;
  hemaslow2: number;
  hemaslow3: number;
  maType1: MaType;
  maType2: MaType;
  maType3: MaType;
  bullcol: string;
  bearcol: string;
  bullrev: string;
  bearrev: string;
  hemabull: string;
  hemabear: string;
  hemahold: string;
  trmbull: string;
  trmbear: string;
  trmhold: string;
  rsi5: string;
  rsi10: string;
  rsi15: string;
  rsi20: string;
  rsi25: string;
  rsi30: string;
  rsi35: string;
  rsi40: string;
  rsi45: string;
  rsi50: string;
  rsi55: string;
  rsi60: string;
  rsi65: string;
  rsi70: string;
  rsi75: string;
  rsi80: string;
  rsi85: string;
  rsi90: string;
  rsi95: string;
  rsi100: string;
  longf: number;
  shortf: number;
  signalf: number;
  lenf: number;
  longs: number;
  shorts: number;
  signals: number;
  lens: number;
  start: number;
  inc: number;
  max: number;
}

// Input colour defaults: the alpha byte is round(255 * (100 - transparency) / 100)
const BLUE = '#64b5f6';
const RED = '#ef5350';
const DARK_RED = '#d32f2f';

export const defaultInputs: BjorgumSuperScriptInputs = {
  strat: 'Bj Reversal',
  source: 'close',
  alphaInput: 0.7,
  t3vis: false,
  hemavis: false,
  psarvis: false,
  arrowvis: false,
  showTable: false,
  disable: false,
  tsistrat: 'Fast',
  rsistrat: 'Slow',
  candleType: 'Hollow',
  haover: false,
  rPrice: false,
  alertMode: 'once_per_bar_close',
  alertTrmBuy: false,
  alertTrmSell: false,
  alertRevUp: false,
  alertRevDown: false,
  alertMaCrossUp: false,
  alertMaCrossDown: false,
  alertRsiUp50: false,
  alertRsiDown50: false,
  alertRsiUp70: false,
  alertRsiDown30: false,
  alertRsiDown70: false,
  alertRsiUp30: false,
  alertTsiCurlUp: false,
  alertTsiCurlDown: false,
  alertSarUp: false,
  alertSarDown: false,
  textSize: 'small',
  tableYpos: 'bottom',
  tableXpos: 'right',
  bullRev5: BLUE,
  bearRev5: RED,
  bullRev8: BLUE,
  bearRev8: RED,
  bullRevF: `${BLUE}33`,
  bearRevF: `${RED}33`,
  bullHema1: `${BLUE}73`,
  bearHema1: `${DARK_RED}73`,
  bullHema2: `${BLUE}8c`,
  bearHema2: `${DARK_RED}8c`,
  bullHema3: `${BLUE}a6`,
  bearHema3: `${DARK_RED}a6`,
  bullHema1F: `${BLUE}26`,
  bearHema1F: `${DARK_RED}26`,
  bullHema2F: `${BLUE}33`,
  bearHema2F: `${DARK_RED}33`,
  bullHema3F: `${BLUE}40`,
  bearHema3F: `${DARK_RED}40`,
  bullSar: BLUE,
  bearSar: RED,
  aLength: 5,
  length: 8,
  hemaslow: 5,
  hemaslow2: 9,
  hemaslow3: 21,
  maType1: 'HEMA',
  maType2: 'HEMA',
  maType3: 'HEMA',
  bullcol: '#64b5f6',
  bearcol: '#ef5350',
  bullrev: '#fff176',
  bearrev: '#fff176',
  hemabull: '#64b5f6',
  hemabear: '#e91e63',
  hemahold: '#b2b5be',
  trmbull: '#3BB3E4',
  trmbear: '#ffeb3b',
  trmhold: '#b2b5be',
  rsi5: '#17ff00',
  rsi10: '#17ff00',
  rsi15: '#ffffff',
  rsi20: '#ffffff',
  rsi25: '#ffffff',
  rsi30: '#ffffff',
  rsi35: '#ffffff',
  rsi40: '#ffffff',
  rsi45: '#ffffff',
  rsi50: '#ffffff',
  rsi55: '#2196f3',
  rsi60: '#2196f3',
  rsi65: '#2196f3',
  rsi70: '#2196f3',
  rsi75: '#2196f3',
  rsi80: '#2196f3',
  rsi85: '#9c27b0',
  rsi90: '#9c27b0',
  rsi95: '#ff0000',
  rsi100: '#ff0000',
  longf: 25,
  shortf: 5,
  signalf: 14,
  lenf: 5,
  longs: 25,
  shorts: 13,
  signals: 13,
  lens: 14,
  start: 0.043,
  inc: 0.043,
  max: 0.34,
};

const G_STRAT = 'Strategy Selector';
const G_OVER = 'Strategy Overides';
const G_SPEED = 'Select a Speed';
const G_HA = 'Heikin-Ashi Overlay';
const G_ALERT = 'Variable Alerts';
const G_TABLE = 'Table';
const G_T3 = 'T3 MA (Bull, Bear, Fill, Length)';
const G_MA = 'MA (Bull, Bear, Fill, Length, Type)';
const G_SAR = 'SAR (Bull, Bear)';
const G_BAR = 'Bar Color';
const G_FAST = 'TSI Fast Settings';
const G_SLOW = 'TSI Slow Settings';
const G_PSAR = 'PSAR';
const MA_TYPES: MaType[] = ['SMA', 'EMA', 'HEMA', 'T3', 'DEMA', 'TEMA', 'HMA', 'WMA', 'VWMA', 'SWMA', 'VWAP'];

const d = defaultInputs;
const bool = (id: keyof BjorgumSuperScriptInputs, title: string, group: string): InputConfig => (
  { id, type: 'bool', title, defval: d[id], group });
const col = (id: keyof BjorgumSuperScriptInputs, title: string, group: string, inline?: string): InputConfig => (
  { id, type: 'color', title, defval: d[id], group, ...(inline ? { inline } : {}) });
const int = (id: keyof BjorgumSuperScriptInputs, title: string, group: string, inline?: string): InputConfig => (
  { id, type: 'int', title, defval: d[id], group, ...(inline ? { inline } : {}) });

export const inputConfig: InputConfig[] = [
  { id: 'strat', type: 'string', title: 'Select a Strategy', defval: d.strat, options: ['Bj Reversal', 'MA', 'TRM', 'RSI Color'], group: G_STRAT },
  { id: 'source', type: 'source', title: 'MA source', defval: d.source, group: G_STRAT },
  { id: 'alphaInput', type: 'float', title: 'T3 Alpha', defval: d.alphaInput, group: G_STRAT },
  bool('t3vis', "Show Tilson MA's", G_OVER),
  bool('hemavis', "Show HEMA MA's", G_OVER),
  bool('psarvis', 'Show PSAR', G_OVER),
  bool('arrowvis', 'Show Arrows', G_OVER),
  bool('showTable', 'Show Bjorgum Buy Rating', G_OVER),
  bool('disable', 'Disable Current MA', G_OVER),
  { id: 'tsistrat', type: 'string', title: 'TRM Speed Control', defval: d.tsistrat, options: ['Fast', 'Slow'], group: G_SPEED },
  { id: 'rsistrat', type: 'string', title: 'RSI Bar Color Speed Control', defval: d.rsistrat, options: ['Slow', 'Fast'], group: G_SPEED },
  { id: 'candleType', type: 'string', title: 'Candle Type', defval: d.candleType, options: ['Hollow', 'Bars', 'Candles'], group: G_HA },
  {
    id: 'haover', type: 'bool', title: 'Overlays HA Plotcandle', defval: d.haover, group: G_HA,
    tooltip: "(Must 'mute' main candle series while in use. Toggle '👁' symbol next to ticker name to hide candles)",
  },
  {
    id: 'rPrice', type: 'bool', title: 'Actual Close Value', defval: d.rPrice, group: G_HA,
    tooltip: 'Displays real close value - useful when using HA overlay',
  },
  {
    id: 'alertMode', type: 'string', title: 'Alerts Mode', defval: d.alertMode, options: ['once_per_bar', 'once_per_bar_close'], group: G_ALERT,
    tooltip: 'Using the alert() function call will allow use of only one alert for any of the following selected. Any current settings in the script will be what is saved at the time the alert is set',
  },
  bool('alertTrmBuy', 'TRM Buy', G_ALERT),
  bool('alertTrmSell', 'TRM Sell', G_ALERT),
  bool('alertRevUp', 'Reversal Up', G_ALERT),
  bool('alertRevDown', 'Reversal Down', G_ALERT),
  bool('alertMaCrossUp', 'MA Cross Up', G_ALERT),
  bool('alertMaCrossDown', 'MA Cross Down', G_ALERT),
  bool('alertRsiUp50', 'RSI Cross Up 50', G_ALERT),
  bool('alertRsiDown50', 'RSI Cross Down 50', G_ALERT),
  bool('alertRsiUp70', 'RSI Cross Up 70', G_ALERT),
  bool('alertRsiDown30', 'RSI Cross Down 30', G_ALERT),
  bool('alertRsiDown70', 'RSI Cross Down 70', G_ALERT),
  bool('alertRsiUp30', 'RSI Cross Up 30', G_ALERT),
  bool('alertTsiCurlUp', 'TSI Curl Up', G_ALERT),
  bool('alertTsiCurlDown', 'TSI Curl Down', G_ALERT),
  bool('alertSarUp', 'Sar Up', G_ALERT),
  bool('alertSarDown', 'Sar Down', G_ALERT),
  { id: 'textSize', type: 'string', title: 'Text Size', defval: d.textSize, options: ['tiny', 'small', 'normal', 'large', 'huge', 'auto'], group: G_TABLE },
  { id: 'tableYpos', type: 'string', title: 'Position', defval: d.tableYpos, options: ['top', 'middle', 'bottom'], group: G_TABLE },
  { id: 'tableXpos', type: 'string', title: '', defval: d.tableXpos, options: ['left', 'center', 'right'], group: G_TABLE },
  col('bullRev5', '', G_T3, '1'),
  col('bearRev5', '', G_T3, '1'),
  col('bullRev8', '', G_T3, '2'),
  col('bearRev8', '', G_T3, '2'),
  col('bullRevF', '', G_T3, '1'),
  col('bearRevF', '', G_T3, '2'),
  col('bullHema1', '', G_MA, '4'),
  col('bearHema1', '', G_MA, '4'),
  col('bullHema2', '', G_MA, '5'),
  col('bearHema2', '', G_MA, '5'),
  col('bullHema3', '', G_MA, '6'),
  col('bearHema3', '', G_MA, '6'),
  col('bullHema1F', '', G_MA, '4'),
  col('bearHema1F', '', G_MA, '4'),
  col('bullHema2F', '', G_MA, '5'),
  col('bearHema2F', '', G_MA, '5'),
  col('bullHema3F', '', G_MA, '6'),
  col('bearHema3F', '', G_MA, '6'),
  col('bullSar', '', G_SAR, '7'),
  col('bearSar', '', G_SAR, '7'),
  int('aLength', '', G_T3, '1'),
  int('length', '', G_T3, '2'),
  int('hemaslow', '', G_MA, '4'),
  int('hemaslow2', '', G_MA, '5'),
  int('hemaslow3', '', G_MA, '6'),
  { id: 'maType1', type: 'string', title: '', defval: d.maType1, options: MA_TYPES, group: G_MA, inline: '4' },
  { id: 'maType2', type: 'string', title: '', defval: d.maType2, options: MA_TYPES, group: G_MA, inline: '5' },
  { id: 'maType3', type: 'string', title: '', defval: d.maType3, options: MA_TYPES, group: G_MA, inline: '6' },
  col('bullcol', 'Bull Trend Color', G_BAR),
  col('bearcol', 'Bear Trend Color', G_BAR),
  col('bullrev', 'Bullish Reversal Color', G_BAR),
  col('bearrev', 'Bearish Reversal Color', G_BAR),
  col('hemabull', 'MA Bull Color', G_BAR),
  col('hemabear', 'MA Bear Color', G_BAR),
  col('hemahold', 'MA Hold Color', G_BAR),
  col('trmbull', 'TRM Buy', G_BAR),
  col('trmbear', 'TRM Sell', G_BAR),
  col('trmhold', 'TRM Hold', G_BAR),
  col('rsi5', 'RSI 0-5', G_BAR),
  col('rsi10', 'RSI 5-10', G_BAR),
  col('rsi15', 'RSI 10-15', G_BAR),
  col('rsi20', 'RSI 15-20', G_BAR),
  col('rsi25', 'RSI 20-25', G_BAR),
  col('rsi30', 'RSI 25-30', G_BAR),
  col('rsi35', 'RSI 30-35', G_BAR),
  col('rsi40', 'RSI 35-40', G_BAR),
  col('rsi45', 'RSI 40-45', G_BAR),
  col('rsi50', 'RSI 45-50', G_BAR),
  col('rsi55', 'RSI 50-55', G_BAR),
  col('rsi60', 'RSI 55-60', G_BAR),
  col('rsi65', 'RSI 60-65', G_BAR),
  col('rsi70', 'RSI 65-70', G_BAR),
  col('rsi75', 'RSI 70-75', G_BAR),
  col('rsi80', 'RSI 75-80', G_BAR),
  col('rsi85', 'RSI 80-85', G_BAR),
  col('rsi90', 'RSI 85-90', G_BAR),
  col('rsi95', 'RSI 90-95', G_BAR),
  col('rsi100', 'RSI 95-100', G_BAR),
  int('longf', 'Long Length', G_FAST),
  int('shortf', 'Short Length', G_FAST),
  int('signalf', 'Signal Length', G_FAST),
  int('lenf', 'RSI Length', G_FAST),
  int('longs', 'Long Length', G_SLOW),
  int('shorts', 'Short Length', G_SLOW),
  int('signals', 'Signal Length', G_SLOW),
  int('lens', 'RSI Length', G_SLOW),
  { id: 'start', type: 'float', title: 'Start', defval: d.start, group: G_PSAR },
  { id: 'inc', type: 'float', title: 'Increment', defval: d.inc, group: G_PSAR },
  { id: 'max', type: 'float', title: 'Max', defval: d.max, group: G_PSAR },
];

/** Default plot colour of the script version (v5 blue) */
const PLOT_BLUE = '#2962ff';
/** plotshape colours */
const CURL_UP = '#17ff00';
const CURL_DOWN = '#FFEB3B';
/** Wick colour of the Heikin-Ashi candles */
const WICK = '#b2b5be';
/** plot offset of 'Real Close' */
const REAL_CLOSE_OFFSET = -9999;

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'T3 Fast', color: PLOT_BLUE, lineWidth: 1 },
  { id: 'plot1', title: 'T3 Slow', color: PLOT_BLUE, lineWidth: 1 },
  { id: 'plot2', title: 'EMA 5', color: PLOT_BLUE, lineWidth: 1 },
  { id: 'plot3', title: 'EMA 9', color: PLOT_BLUE, lineWidth: 1 },
  { id: 'plot4', title: 'EMA 21', color: PLOT_BLUE, lineWidth: 1 },
  { id: 'plot5', title: 'EMA fast', color: '#FF000000', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'SAR', color: PLOT_BLUE, lineWidth: 1, style: 'circles' },
  { id: 'plot7', title: 'Real Close', color: PLOT_BLUE, lineWidth: 1, offset: REAL_CLOSE_OFFSET },
];

export const metadata = {
  title: 'Bjorgum SuperScript',
  shortTitle: 'Bj SuperScript',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b when a - b >= -1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

const DAY_SECONDS = 86400;

export function calculate(
  bars: Bar[],
  inputs: Partial<BjorgumSuperScriptInputs> = {},
): Omit<IndicatorResult, 'markers'> & {
    markers: MarkerData[];
    barColors: BarColorData[];
    plotCandles: Record<string, PlotCandleData[]>;
    plotBars: Record<string, PlotBarData[]>;
    tables: TableData[];
  } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const NA = 'transparent';

  const bjrev = cfg.strat === 'Bj Reversal';
  const hema = cfg.strat === 'MA';
  const trm = cfg.strat === 'TRM';
  const rsicol = cfg.strat === 'RSI Color';
  const tsifast = cfg.tsistrat === 'Fast';
  const tsislow = cfg.tsistrat === 'Slow';
  const rsifast = cfg.rsistrat === 'Fast';
  const rsislow = cfg.rsistrat === 'Slow';
  const hollow = cfg.candleType === 'Hollow';
  const barsType = cfg.candleType === 'Bars';
  const candle = cfg.candleType === 'Candles';

  const shortvar = tsifast ? cfg.shortf : cfg.shorts;
  const longvar = tsifast ? cfg.longf : cfg.longs;
  const signalvar = tsifast ? cfg.signalf : cfg.signals;
  // len = tsifast ? lenf : tsislow ? lens : rsifast ? lenf : rsislow ? lens : lens
  const len = tsifast ? cfg.lenf : tsislow ? cfg.lens : rsifast ? cfg.lenf : rsislow ? cfg.lens : cfg.lens;

  const close = bars.map((b) => b.close);
  const closeS = S(close);
  const source = getSourceSeries(bars, cfg.source);
  const volume = bars.map((b) => b.volume ?? NaN);

  // _gd(src, length, alpha) = ta.ema(src, length) * (1 + alpha) - ta.ema(ta.ema(src, length), length) * alpha
  const gd = (src: Series, length: number, alpha: number): Series => {
    const e1 = ta.ema(src, length);
    const e1a = A(e1);
    const e2 = A(ta.ema(e1, length));
    return S(e1a.map((v, i) => v * (1 + alpha) - e2[i] * alpha));
  };
  const t3 = (src: Series, length: number, alpha: number) => gd(gd(gd(src, length, alpha), length, alpha), length, alpha);

  // _haVal(): Heikin-Ashi values
  const haO: number[] = new Array(n);
  const haH: number[] = new Array(n);
  const haL: number[] = new Array(n);
  const haC: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    haC[i] = (b.open + b.high + b.low + b.close) / 4;
    // _o := na(_o[1]) ? (open + close) / 2 : (nz(_o[1]) + nz(_c[1])) / 2
    const prevO = i > 0 ? haO[i - 1] : NaN;
    const prevC = i > 0 ? haC[i - 1] : NaN;
    haO[i] = Number.isNaN(prevO) ? (b.open + b.close) / 2 : (prevO + (Number.isNaN(prevC) ? 0 : prevC)) / 2;
    haH[i] = Math.max(b.high, Math.max(haO[i], haC[i]));
    haL[i] = Math.min(b.low, Math.min(haO[i], haC[i]));
  }

  // _ma(src, type, length)
  const ma = (type: MaType, length: number): number[] => {
    switch (type) {
      case 'EMA': return A(ta.ema(source, length));
      case 'HEMA': return A(ta.ema(S(haO), length));
      case 'SMA': return A(ta.sma(source, length));
      case 'HMA': return A(ta.hma(source, length));
      case 'WMA': return A(ta.wma(source, length));
      case 'VWMA': return A(ta.vwma(source, length, S(volume)));
      case 'DEMA': {
        const ema1 = ta.ema(source, length);
        const ema2 = A(ta.ema(ema1, length));
        return A(ema1).map((v, i) => 2 * v - ema2[i]);
      }
      case 'TEMA': {
        const ema1 = ta.ema(source, length);
        const ema2 = ta.ema(ema1, length);
        const ema3 = A(ta.ema(ema2, length));
        const e1 = A(ema1);
        const e2 = A(ema2);
        return e1.map((v, i) => 3 * (v - e2[i]) + ema3[i]);
      }
      case 'T3': return A(t3(source, length, cfg.alphaInput));
      case 'SWMA': return A(ta.swma(source));
      case 'VWAP': {
        // ta.vwap(src), anchor timeframe.change("1D"): a new anchor on every daily or higher bar, so
        // sum(src * volume) / sum(volume) over the bar alone (0 / 0 = na without volume)
        const interval = barInterval(bars);
        if (interval > 0 && interval < DAY_SECONDS) {
          throw new Error(
            'Bjorgum SuperScript: the type "VWAP" works on daily and higher timeframes only: on intraday bars ta.vwap '
            + 'resets on each trading day, which needs the exchange time zone and session.',
          );
        }
        const src = A(source);
        return src.map((v, i) => (v * volume[i]) / volume[i]);
      }
      default: return new Array(n).fill(NaN); // a switch without a match gives na
    }
  };

  const tsi = A(ta.tsi(closeS, shortvar, longvar));
  const tsl = A(ta.ema(S(tsi), signalvar));
  const rsi = A(ta.rsi(closeS, len));

  const anT3 = A(t3(source, cfg.aLength, cfg.alphaInput));
  const nT3 = A(t3(source, cfg.length, cfg.alphaInput));

  const slow1 = ma(cfg.maType1, cfg.hemaslow);
  const slow2 = ma(cfg.maType2, cfg.hemaslow2);
  const slow3 = ma(cfg.maType3, cfg.hemaslow3);
  const fast = A(ta.ema(S(bars.map((b) => (b.high + b.low) / 2)), 1));
  const sar = A(ta.sar(bars, cfg.start, cfg.inc, cfg.max));

  const showT3 = cfg.t3vis || (!cfg.disable && bjrev);
  const showMa = cfg.hemavis || (!cfg.disable && hema);
  const fillMa = cfg.hemavis || hema;
  const fillT3 = cfg.t3vis || bjrev;

  const rsiBands = [
    cfg.rsi5, cfg.rsi10, cfg.rsi15, cfg.rsi20, cfg.rsi25, cfg.rsi30, cfg.rsi35, cfg.rsi40, cfg.rsi45, cfg.rsi50,
    cfg.rsi55, cfg.rsi60, cfg.rsi65, cfg.rsi70, cfg.rsi75, cfg.rsi80, cfg.rsi85, cfg.rsi90, cfg.rsi95, cfg.rsi100,
  ];

  const t3Fast: Array<{ time: number; value: number; color: string }> = [];
  const t3Slow: typeof t3Fast = [];
  const ma1: typeof t3Fast = [];
  const ma2: typeof t3Fast = [];
  const ma3: typeof t3Fast = [];
  const sarPlot: typeof t3Fast = [];
  const fill1: string[] = [];
  const fill2: string[] = [];
  const fill3: string[] = [];
  const fillRev: string[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const candles: PlotCandleData[] = [];
  const haBars: PlotBarData[] = [];
  /** habarColor of each bar (null: na), for the 'Real Close' plot */
  const haBarColor: Array<string | null> = new Array(n);
  const cells: TableCellData[] = [];
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const c = close[i];
    const prev = (a: number[]) => (i > 0 ? a[i - 1] : NaN);

    const buy = gt(tsi[i], tsl[i]) && gt(rsi[i], 50);
    const sell = gt(tsl[i], tsi[i]) && gt(50, rsi[i]);
    const data = gt(tsl[i], tsi[i]) && gt(tsi[i], prev(tsi));
    const dtat = gt(tsi[i], tsl[i]) && gt(prev(tsi), tsi[i]);

    const colOne = gt(anT3[i], prev(anT3));
    const upCol = gt(nT3[i], prev(nT3));
    const fillData = gt(anT3[i], nT3[i]);

    const fastAbove = ge(anT3[i], nT3[i]);
    const fastBelow = ge(nT3[i], anT3[i]);
    const uc = fastAbove && gt(c, nT3[i]);
    const dc = fastBelow && gt(nT3[i], c);
    const dr = fastAbove && gt(nT3[i], c);
    const ur = fastBelow && gt(c, nT3[i]);
    const hauc = fastAbove && gt(haC[i], nT3[i]);
    const hadc = fastBelow && gt(nT3[i], haC[i]);
    const hadr = fastAbove && gt(nT3[i], haC[i]);
    const haur = fastBelow && gt(haC[i], nT3[i]);

    const hemauc = gt(c, slow1[i]) && gt(c, slow2[i]);
    const hemadc = gt(slow1[i], c) && gt(slow2[i], c);
    const up = gt(slow1[i], prev(slow1));
    const up2 = gt(slow2[i], prev(slow2));
    const up3 = gt(slow3[i], prev(slow3));
    const hfillData = gt(fast[i], slow1[i]);
    const hfillDtat = gt(slow1[i], slow2[i]);
    const hfillDat = gt(slow2[i], slow3[i]);
    const ema1 = gt(c, slow1[i]);
    const ema2 = gt(c, slow2[i]);
    const ema3 = gt(c, slow3[i]);
    const sarUp = ge(c, sar[i]);
    const rsiUp = gt(rsi[i], 50);
    const tsiUp = gt(tsi[i], tsl[i]);
    const rsiH = ge(rsi[i], 90) || ge(10, rsi[i]);

    const hadefval = ge(haC[i], haO[i]) ? cfg.bullcol : cfg.bearcol;
    const trmcolor = buy ? cfg.trmbull : sell ? cfg.trmbear : cfg.trmhold;
    const hemabar = hemauc ? cfg.hemabull : hemadc ? cfg.hemabear : cfg.hemahold;
    // rsicon: rsi > 5 * k and rsi <= 5 * (k + 1) for k = 0..19, else hadefval
    let rsicon = hadefval;
    for (let k = 0; k < 20; k++) {
      if (gt(rsi[i], 5 * k) && ge(5 * (k + 1), rsi[i])) {
        rsicon = rsiBands[k];
        break;
      }
    }
    const bjrevcol = uc ? cfg.bullcol : dc ? cfg.bearcol : dr ? cfg.bearrev : ur ? cfg.bullrev : null;
    const habjrevcol = hauc ? cfg.bullcol : hadc ? cfg.bearcol : hadr ? cfg.bearrev : haur ? cfg.bullrev : hadefval;
    const barColor = trm ? trmcolor : bjrev ? bjrevcol : rsicol ? rsicon : hema ? hemabar : null;
    const habarColor = trm ? trmcolor : bjrev ? habjrevcol : rsicol ? rsicon : hema ? hemabar : null;
    haBarColor[i] = habarColor;

    t3Fast.push({ time, value: showT3 ? fin(anT3[i]) : NaN, color: colOne ? cfg.bullRev5 : cfg.bearRev5 });
    t3Slow.push({ time, value: showT3 ? fin(nT3[i]) : NaN, color: upCol ? cfg.bullRev8 : cfg.bearRev8 });
    ma1.push({ time, value: showMa ? fin(slow1[i]) : NaN, color: up ? cfg.bullHema1 : cfg.bearHema1 });
    ma2.push({ time, value: showMa ? fin(slow2[i]) : NaN, color: up2 ? cfg.bullHema2 : cfg.bearHema2 });
    ma3.push({ time, value: showMa ? fin(slow3[i]) : NaN, color: up3 ? cfg.bullHema3 : cfg.bearHema3 });
    sarPlot.push({ time, value: cfg.psarvis ? fin(sar[i]) : NaN, color: sarUp ? cfg.bullSar : cfg.bearSar });

    fill1.push(fillMa ? (hfillData ? cfg.bullHema1F : cfg.bearHema1F) : NA);
    fill2.push(fillMa ? (hfillDtat ? cfg.bullHema2F : cfg.bearHema2F) : NA);
    fill3.push(fillMa ? (hfillDat ? cfg.bullHema3F : cfg.bearHema3F) : NA);
    fillRev.push(fillT3 ? (fillData ? cfg.bullRevF : cfg.bearRevF) : NA);

    // plotshape(arrowvis ? data : na, triangleup, belowbar), plotshape(arrowvis ? dtat : na, triangledown, abovebar)
    if (cfg.arrowvis && data) markers.push({ time, position: 'belowBar', shape: 'triangleUp', color: CURL_UP });
    if (cfg.arrowvis && dtat) markers.push({ time, position: 'aboveBar', shape: 'triangleDown', color: CURL_DOWN });

    // plotcandle(o_, h_, l_, c_, "Hollow Candles", candleCol, wickCol, bordercolor = borderCol)
    const shown = cfg.haover && habarColor !== null;
    const candleCol = shown && hollow ? (gt(haO[i], haC[i]) ? habarColor : NA) : shown && candle ? habarColor : NA;
    candles.push({
      time, open: haO[i], high: haH[i], low: haL[i], close: haC[i],
      color: candleCol,
      wickColor: (hollow || candle) && cfg.haover ? WICK : NA,
      borderColor: (hollow || candle) && shown ? habarColor : NA,
    });
    // plotbar(o_, h_, l_, c_, 'Heikin-Ashi', barCol)
    haBars.push({ time, open: haO[i], high: haH[i], low: haL[i], close: haC[i], color: shown && barsType ? habarColor : NA });

    if (barColor !== null) barColors.push({ time, color: barColor });

    // _populate(stats, names, syms, tabCol, tabCol): the cells of the last bar stay
    if (cfg.showTable && i === n - 1) {
      const names = [
        'TRM', 'Rev', 'Curl', 'RSI', 'TSI',
        str.format('{0} {1}', cfg.maType1, cfg.hemaslow),
        str.format('{0} {1}', cfg.maType2, cfg.hemaslow2),
        str.format('{0} {1}', cfg.maType3, cfg.hemaslow3),
        'SAR',
      ];
      const yes = '✅';
      const no = '❌';
      const syms = [
        buy ? yes : sell ? no : '➖',
        uc ? yes : dc ? no : '🔸',
        data ? yes : dtat ? no : '➖',
        rsiH ? '🔥' : rsiUp ? yes : no,
        tsiUp ? yes : no,
        ema1 ? yes : no,
        ema2 ? yes : no,
        ema3 ? yes : no,
        sarUp ? yes : no,
      ];
      const sigs = [
        buy ? 1 : sell ? -1 : 0,
        uc ? 1 : dc ? -1 : 0,
        data ? 1 : dtat ? -1 : 0,
        rsiUp ? 1 : -1,
        tsiUp ? 1 : -1,
        ema1 ? 1 : -1,
        ema2 ? 1 : -1,
        ema3 ? 1 : -1,
        sarUp ? 1 : -1,
      ];
      const sigSum = array.sum(sigs);
      // _triGrad(sigSum, -6, 6, color.gray, #ff0000, color.green)
      const min = -6;
      const max = 6;
      const center = min + (max - min) / 2;
      const tabCol = String(ge(sigSum, center)
        ? color.from_gradient(sigSum, center, max, color.gray, color.green)
        : color.from_gradient(sigSum, min, center, '#ff0000', color.gray));
      const cell1 = String(color.new(color.silver, 80));
      names.forEach((name, row) => {
        cells.push({ column: 0, row, text: name, bgColor: cell1, textColor: tabCol, textSize: cfg.textSize });
        cells.push({ column: 1, row, text: syms[row], bgColor: NA, textColor: tabCol, textSize: cfg.textSize });
      });
    }
  }

  // plot(rPrice ? close : na, "Real Close", habarColor, trackprice = true, offset = -9999): bar i is drawn on bar i - 9999
  const realClose = bars.map((b, j) => {
    const i = j - REAL_CLOSE_OFFSET;
    return { time: b.time, value: cfg.rPrice && i < n ? close[i] : NaN, color: (i < n ? haBarColor[i] : null) ?? NA };
  });

  // var stats = table.new(tableYpos + "_" + tableXpos, columns = 2, rows = 9, border_color = color.new(color.gray, 60), border_width = 1)
  const tables: TableData[] = n > 0 ? [{
    position: `${cfg.tableYpos}_${cfg.tableXpos}` as TablePosition, columns: 2, rows: 9, cells,
    borderColor: String(color.new(color.gray, 60)), borderWidth: 1,
  }] : [];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: t3Fast,
      plot1: t3Slow,
      plot2: ma1,
      plot3: ma2,
      plot4: ma3,
      // plot(bjhemafast, 'EMA fast', #FF000000, display = display.none)
      plot5: bars.map((b, i) => ({ time: b.time, value: fin(fast[i]) })),
      plot6: sarPlot,
      plot7: realClose,
    },
    fills: [
      { plot1: 'plot2', plot2: 'plot5', colors: fill1 },
      { plot1: 'plot2', plot2: 'plot3', colors: fill2 },
      { plot1: 'plot3', plot2: 'plot4', colors: fill3 },
      { plot1: 'plot1', plot2: 'plot0', colors: fillRev },
    ],
    markers,
    barColors,
    plotCandles: { hollowCandles: candles },
    plotBars: { heikinAshi: haBars },
    tables,
  };
}

export const BjorgumSuperScript = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
