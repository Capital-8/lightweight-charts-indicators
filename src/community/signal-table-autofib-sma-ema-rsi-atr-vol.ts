/**
 * Multicator Table
 *
 * A dashboard of classic indicators on the last bar, with optional overlays.
 * - Table (desktop 6 x 10 or mobile 2 x 22): open, close, change %, RSI, ATR, volume, three SMAs and three EMAs,
 *   ADX, momentum, MACD, +DI / -DI, a score (share of 9 bullish votes: close above the EMA 200, ADX above 25, MACD
 *   above its signal, RSI in 40..65, Supertrend up, Stochastic above 50, MFI above 50, relative volume at or above 1,
 *   close above the Donchian middle), the regime (range when the ADX is below 20 or the choppiness above 61.8),
 *   Stochastic, CCI, MFI, Williams %R, OBV, VWAP, Supertrend side, relative volume, the close of the bar with the
 *   highest volume of the lookback (HVN), choppiness, Parabolic SAR and MACD histogram.
 * - HUD: to the right of the last bar, one panel per oscillator (RSI with its average, MACD with its signal, ADX,
 *   momentum, ATR, and with the extra option Stochastic, CCI, MFI, %R): a box, the last "HUD bars" values as a
 *   polyline scaled to the panel, and a title label. The panels share the price range of the bars that are VISIBLE
 *   on the chart (highest high to lowest low; when that range is flatter than 2 ticks, the range of the last 100
 *   bars).
 * - Markers: RSI and MACD divergences between two consecutive pivots of the high (bearish) or of the low (bullish).
 * - Optional: EMA / SMA lines, Parabolic SAR, Bollinger bands, Ichimoku, VWAP, Supertrend, Donchian and Keltner
 *   channels, automatic Fibonacci levels of the highest high / lowest low of the lookback, the HVN line and pivot
 *   labels.
 *
 * Chart context (optional third argument):
 * - `chart.leftVisibleBarTime` / `chart.rightVisibleBarTime`: the visible range of the chart, for the HUD. Without
 *   them all the bars count as visible (the script looks back at most 5,000 bars). This indicator reads the visible
 *   range (`usesVisibleRange`): calculate it again when the user scrolls or zooms the chart.
 * - `chart.mintick`: the symbol tick of the rounded texts and of the smallest ranges. Without it 0.01.
 * - `chart.timezone` and `chart.session`: on intraday bars the VWAP restarts on each trading day of the exchange.
 *   Without them the VWAP is not known on intraday bars: its table cell shows "NaN", and "Show VWAP" throws.
 *   On daily and higher bars the VWAP is the hlc3 of the bar.
 *
 * Limits of the port: the 6 alert conditions give no output. The colour inputs of the script (EMA / SMA / RSI /
 * ATR / MOM / ADX / MACD / Fibonacci / pivot colours) are not read by the script itself: the colours come from the
 * theme.
 *
 * Reference: "Multicator Table" by only_fibonacci
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © only_fibonacci
 */

import {
  ta, math, str, color, Series, getSourceSeries, barInterval, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import { hasCalendar, periodChanges } from '../anchor-period';
import type {
  BoxData, LabelData, LineDrawingData, MarkerData, PineSize, PolylineData, TableCellData, TableData, TablePosition,
} from '../types';
import { mintickOf, visibleRangeOf, type ChartContext } from '../chart-context';

export interface MulticatorTableInputs {
  lang: 'EN' | 'TR';
  themeName: 'Dark' | 'Light';
  preset: 'Manual' | 'Scalping' | 'Swing';
  tableMode: 'Off' | 'Desktop' | 'Mobile';
  tablePos: 'Top Right' | 'Bottom Right' | 'Middle Right' | 'Bottom Center' | 'Bottom Left';
  tableSize: 'Small' | 'Large' | 'Normal';
  showHud: boolean;
  hudExtra: boolean;
  hudGap: number;
  hudBars: number;
  showFib: boolean;
  fibonacciExtendRight: boolean;
  fibShowData: boolean;
  fibLookback: number;
  fibColor: string;
  fib1: number;
  fib2: number;
  fib3: number;
  ema1: number;
  ema1Show: boolean;
  ema1Color: string;
  ema2: number;
  ema2Show: boolean;
  ema2Color: string;
  ema3: number;
  ema3Show: boolean;
  ema3Color: string;
  sma1: number;
  sma1Show: boolean;
  sma1Color: string;
  sma2: number;
  sma2Show: boolean;
  sma2Color: string;
  sma3: number;
  sma3Show: boolean;
  sma3Color: string;
  rsiPeriod: number;
  rsiShow: boolean;
  rsiColor: string;
  rsiMaPeriod: number;
  atrPeriod: number;
  atrShow: boolean;
  atrColor: string;
  momPeriod: number;
  momShow: boolean;
  momColor: string;
  diLen: number;
  lensig: number;
  adxShow: boolean;
  adxColor: string;
  ml: number;
  macdShow: boolean;
  sl: number;
  hl: number;
  macdLineColor: string;
  macdSignalColor: string;
  start: number;
  sarShow: boolean;
  increment: number;
  maximum: number;
  length: number;
  bbShow: boolean;
  maType: 'SMA' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';
  src: SourceType;
  mult: number;
  offset: number;
  conversionPeriods: number;
  ichShow: boolean;
  basePeriods: number;
  laggingSpan2Periods: number;
  displacement: number;
  vwapShow: boolean;
  stShow: boolean;
  stAtrIn: number;
  stFactorIn: number;
  donShow: boolean;
  donLenIn: number;
  kelShow: boolean;
  kelLenIn: number;
  kelMultIn: number;
  hvnShow: boolean;
  hvnLook: number;
  stochLenIn: number;
  cciLenIn: number;
  mfiLenIn: number;
  wprLenIn: number;
  chopLenIn: number;
  showDiv: boolean;
  divLook: number;
  pivotShow: boolean;
  leftLenH: number;
  rightLenH: number;
  textColorH: string;
  labelColorH: string;
  leftLenL: number;
  rightLenL: number;
  textColorL: string;
  labelColorL: string;
  pivotMax: number;
}

export const defaultInputs: MulticatorTableInputs = {
  lang: 'EN',
  themeName: 'Dark',
  preset: 'Manual',
  tableMode: 'Desktop',
  tablePos: 'Top Right',
  tableSize: 'Small',
  showHud: true,
  hudExtra: false,
  hudGap: 30,
  hudBars: 40,
  showFib: false,
  fibonacciExtendRight: true,
  fibShowData: true,
  fibLookback: 233,
  fibColor: '#787B86',
  fib1: 618,
  fib2: 382,
  fib3: 786,
  ema1: 50,
  ema1Show: false,
  ema1Color: '#F7C948',
  ema2: 100,
  ema2Show: false,
  ema2Color: '#61AFEF',
  ema3: 200,
  ema3Show: false,
  ema3Color: '#C678DD',
  sma1: 50,
  sma1Show: false,
  sma1Color: '#98C379',
  sma2: 100,
  sma2Show: false,
  sma2Color: '#56B6C2',
  sma3: 200,
  sma3Show: false,
  sma3Color: '#E06C75',
  rsiPeriod: 14,
  rsiShow: true,
  rsiColor: '#C678DD',
  rsiMaPeriod: 10,
  atrPeriod: 14,
  atrShow: true,
  atrColor: '#E06C75',
  momPeriod: 14,
  momShow: true,
  momColor: '#D19A66',
  diLen: 14,
  lensig: 14,
  adxShow: true,
  adxColor: '#98C379',
  ml: 12,
  macdShow: true,
  sl: 26,
  hl: 9,
  macdLineColor: '#61AFEF',
  macdSignalColor: '#D19A66',
  start: 0.02,
  sarShow: false,
  increment: 0.02,
  maximum: 0.2,
  length: 20,
  bbShow: false,
  maType: 'SMA',
  src: 'close',
  mult: 2.0,
  offset: 0,
  conversionPeriods: 9,
  ichShow: false,
  basePeriods: 26,
  laggingSpan2Periods: 52,
  displacement: 26,
  vwapShow: false,
  stShow: false,
  stAtrIn: 10,
  stFactorIn: 3.0,
  donShow: false,
  donLenIn: 20,
  kelShow: false,
  kelLenIn: 20,
  kelMultIn: 1.5,
  hvnShow: false,
  hvnLook: 50,
  stochLenIn: 14,
  cciLenIn: 20,
  mfiLenIn: 14,
  wprLenIn: 14,
  chopLenIn: 14,
  showDiv: true,
  divLook: 5,
  pivotShow: false,
  leftLenH: 10,
  rightLenH: 10,
  textColorH: '#363A45',
  labelColorH: '#FFFFFF',
  leftLenL: 10,
  rightLenL: 10,
  textColorL: '#363A45',
  labelColorL: '#FFFFFF',
  pivotMax: 24,
};

export const inputConfig: InputConfig[] = [
  { id: 'lang', type: 'string', title: 'Language', defval: 'EN', options: ['EN', 'TR'], group: 'General' },
  { id: 'themeName', type: 'string', title: 'Theme', defval: 'Dark', options: ['Dark', 'Light'], group: 'General' },
  { id: 'preset', type: 'string', title: 'Preset', defval: 'Manual', options: ['Manual', 'Scalping', 'Swing'], group: 'General' },

  { id: 'tableMode', type: 'string', title: 'Table', defval: 'Desktop', options: ['Off', 'Desktop', 'Mobile'], group: 'Table' },
  { id: 'tablePos', type: 'string', title: 'Position', defval: 'Top Right', options: ['Top Right', 'Bottom Right', 'Middle Right', 'Bottom Center', 'Bottom Left'], group: 'Table' },
  { id: 'tableSize', type: 'string', title: 'Size', defval: 'Small', options: ['Small', 'Large', 'Normal'], group: 'Table' },

  { id: 'showHud', type: 'bool', title: 'Show HUD', defval: true, group: 'HUD' },
  { id: 'hudExtra', type: 'bool', title: 'HUD extra osc (Stoch/CCI/MFI/%R)', defval: false, group: 'HUD' },
  { id: 'hudGap', type: 'int', title: 'Right gap (bars)', defval: 30, min: 30, max: 80, group: 'HUD', tooltip: 'HUD starts this many bars to the right of the last candle.' },
  { id: 'hudBars', type: 'int', title: 'HUD bars', defval: 40, min: 30, max: 50, group: 'HUD', tooltip: 'HUD panel width in bars (30–50).' },

  { id: 'showFib', type: 'bool', title: 'Show Fibonacci', defval: false, group: 'Fibonacci' },
  { id: 'fibonacciExtendRight', type: 'bool', title: 'Extend right', defval: true, group: 'Fibonacci', inline: 'FG' },
  { id: 'fibShowData', type: 'bool', title: 'Show labels', defval: true, group: 'Fibonacci', inline: 'FG' },
  { id: 'fibLookback', type: 'int', title: 'Fibonacci Distance', defval: 233, min: 8, group: 'Fibonacci' },
  { id: 'fibColor', type: 'color', title: 'Fibonacci Color', defval: '#787B86', group: 'Fibonacci' },
  { id: 'fib1', type: 'int', title: 'Fib Level 1', defval: 618, max: 1618, group: 'Fibonacci' },
  { id: 'fib2', type: 'int', title: 'Fib Level 2', defval: 382, max: 1618, group: 'Fibonacci' },
  { id: 'fib3', type: 'int', title: 'Fib Level 3', defval: 786, max: 1618, group: 'Fibonacci' },

  { id: 'ema1', type: 'int', title: 'EMA 1', defval: 50, group: 'MA', inline: 'E1' },
  { id: 'ema1Show', type: 'bool', title: '', defval: false, group: 'MA', inline: 'E1' },
  { id: 'ema1Color', type: 'color', title: 'EMA1 COLOR', defval: '#F7C948', group: 'MA' },
  { id: 'ema2', type: 'int', title: 'EMA 2', defval: 100, group: 'MA', inline: 'E2' },
  { id: 'ema2Show', type: 'bool', title: '', defval: false, group: 'MA', inline: 'E2' },
  { id: 'ema2Color', type: 'color', title: 'EMA2 COLOR', defval: '#61AFEF', group: 'MA' },
  { id: 'ema3', type: 'int', title: 'EMA 3', defval: 200, group: 'MA', inline: 'E3' },
  { id: 'ema3Show', type: 'bool', title: '', defval: false, group: 'MA', inline: 'E3' },
  { id: 'ema3Color', type: 'color', title: 'EMA3 COLOR', defval: '#C678DD', group: 'MA' },
  { id: 'sma1', type: 'int', title: 'SMA 1', defval: 50, group: 'MA', inline: 'S1' },
  { id: 'sma1Show', type: 'bool', title: '', defval: false, group: 'MA', inline: 'S1' },
  { id: 'sma1Color', type: 'color', title: 'SMA1 COLOR', defval: '#98C379', group: 'MA' },
  { id: 'sma2', type: 'int', title: 'SMA 2', defval: 100, group: 'MA', inline: 'S2' },
  { id: 'sma2Show', type: 'bool', title: '', defval: false, group: 'MA', inline: 'S2' },
  { id: 'sma2Color', type: 'color', title: 'SMA2 COLOR', defval: '#56B6C2', group: 'MA' },
  { id: 'sma3', type: 'int', title: 'SMA 3', defval: 200, group: 'MA', inline: 'S3' },
  { id: 'sma3Show', type: 'bool', title: '', defval: false, group: 'MA', inline: 'S3' },
  { id: 'sma3Color', type: 'color', title: 'SMA3 COLOR', defval: '#E06C75', group: 'MA' },

  { id: 'rsiPeriod', type: 'int', title: 'RSI Period', defval: 14, group: 'RSI', inline: 'RSI' },
  { id: 'rsiShow', type: 'bool', title: '', defval: true, group: 'RSI', inline: 'RSI' },
  { id: 'rsiColor', type: 'color', title: 'RSI COLOR', defval: '#C678DD', group: 'RSI' },
  { id: 'rsiMaPeriod', type: 'int', title: 'RSI MA Period', defval: 10, group: 'RSI' },

  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 14, group: 'ATR', inline: 'ATR' },
  { id: 'atrShow', type: 'bool', title: '', defval: true, group: 'ATR', inline: 'ATR' },
  { id: 'atrColor', type: 'color', title: 'ATR COLOR', defval: '#E06C75', group: 'ATR' },

  { id: 'momPeriod', type: 'int', title: 'MOM Period', defval: 14, group: 'MOM', inline: 'MOM' },
  { id: 'momShow', type: 'bool', title: '', defval: true, group: 'MOM', inline: 'MOM' },
  { id: 'momColor', type: 'color', title: 'MOM COLOR', defval: '#D19A66', group: 'MOM' },

  { id: 'diLen', type: 'int', title: 'DI Length', defval: 14, min: 1, max: 50, group: 'ADX', inline: 'ADX' },
  { id: 'lensig', type: 'int', title: 'ADX Smoothing', defval: 14, min: 1, max: 50, group: 'ADX', inline: 'ADX' },
  { id: 'adxShow', type: 'bool', title: '', defval: true, group: 'ADX', inline: 'ADX' },
  { id: 'adxColor', type: 'color', title: 'ADX COLOR', defval: '#98C379', group: 'ADX' },

  { id: 'ml', type: 'int', title: 'Macd Line', defval: 12, group: 'MACD', inline: 'MACD' },
  { id: 'macdShow', type: 'bool', title: '', defval: true, group: 'MACD', inline: 'MACD' },
  { id: 'sl', type: 'int', title: 'Signal Line', defval: 26, group: 'MACD' },
  { id: 'hl', type: 'int', title: 'Hist Line', defval: 9, group: 'MACD' },
  { id: 'macdLineColor', type: 'color', title: 'MACD LINE COLOR', defval: '#61AFEF', group: 'MACD' },
  { id: 'macdSignalColor', type: 'color', title: 'MACD SIGNAL COLOR', defval: '#D19A66', group: 'MACD' },

  { id: 'start', type: 'float', title: 'Start', defval: 0.02, group: 'P.SAR', inline: 'SAR' },
  { id: 'sarShow', type: 'bool', title: '', defval: false, group: 'P.SAR', inline: 'SAR' },
  { id: 'increment', type: 'float', title: 'Increment', defval: 0.02, group: 'P.SAR' },
  { id: 'maximum', type: 'float', title: 'Max Value', defval: 0.2, group: 'P.SAR' },

  { id: 'length', type: 'int', title: 'length', defval: 20, min: 1, group: 'BB', inline: 'BB' },
  { id: 'bbShow', type: 'bool', title: '', defval: false, group: 'BB', inline: 'BB' },
  { id: 'maType', type: 'string', title: 'Basis MA Type', defval: 'SMA', options: ['SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'], group: 'BB' },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: 'BB' },
  { id: 'mult', type: 'float', title: 'StdDev', defval: 2.0, min: 0.001, max: 50, group: 'BB' },
  { id: 'offset', type: 'int', title: 'Offset', defval: 0, min: -500, max: 500, group: 'BB' },

  { id: 'conversionPeriods', type: 'int', title: 'Conversion Line Length', defval: 9, min: 1, group: 'ICHIMOKU', inline: 'ICHIMOKU' },
  { id: 'ichShow', type: 'bool', title: '', defval: false, group: 'ICHIMOKU', inline: 'ICHIMOKU' },
  { id: 'basePeriods', type: 'int', title: 'Base Line Length', defval: 26, min: 1, group: 'ICHIMOKU' },
  { id: 'laggingSpan2Periods', type: 'int', title: 'Leading Span B Length', defval: 52, min: 1, group: 'ICHIMOKU' },
  { id: 'displacement', type: 'int', title: 'Lagging Span', defval: 26, min: 1, group: 'ICHIMOKU' },

  { id: 'vwapShow', type: 'bool', title: 'Show VWAP', defval: false, group: 'VWAP' },
  { id: 'stShow', type: 'bool', title: 'Show Supertrend', defval: false, group: 'Supertrend', inline: 'ST' },
  { id: 'stAtrIn', type: 'int', title: 'ST ATR', defval: 10, min: 1, group: 'Supertrend', inline: 'ST' },
  { id: 'stFactorIn', type: 'float', title: 'ST Factor', defval: 3.0, min: 0.1, group: 'Supertrend' },
  { id: 'donShow', type: 'bool', title: 'Show Donchian', defval: false, group: 'Donchian', inline: 'DON' },
  { id: 'donLenIn', type: 'int', title: 'Donchian Length', defval: 20, min: 1, group: 'Donchian', inline: 'DON' },
  { id: 'kelShow', type: 'bool', title: 'Show Keltner', defval: false, group: 'Keltner', inline: 'KEL' },
  { id: 'kelLenIn', type: 'int', title: 'Keltner Length', defval: 20, min: 1, group: 'Keltner', inline: 'KEL' },
  { id: 'kelMultIn', type: 'float', title: 'Keltner Mult', defval: 1.5, min: 0.1, group: 'Keltner' },
  { id: 'hvnShow', type: 'bool', title: 'Show HVN line', defval: false, group: 'Volume summary' },
  { id: 'hvnLook', type: 'int', title: 'HVN lookback', defval: 50, min: 10, max: 200, group: 'Volume summary' },

  { id: 'stochLenIn', type: 'int', title: 'Stoch Length', defval: 14, min: 1, group: 'Stoch' },
  { id: 'cciLenIn', type: 'int', title: 'CCI Length', defval: 20, min: 1, group: 'CCI' },
  { id: 'mfiLenIn', type: 'int', title: 'MFI Length', defval: 14, min: 1, group: 'MFI' },
  { id: 'wprLenIn', type: 'int', title: 'Williams %R', defval: 14, min: 1, group: 'WPR' },
  { id: 'chopLenIn', type: 'int', title: 'Chop Length', defval: 14, min: 2, group: 'Chop' },

  { id: 'showDiv', type: 'bool', title: 'Show divergence', defval: true, group: 'Divergence' },
  { id: 'divLook', type: 'int', title: 'Div pivot L/R', defval: 5, min: 2, max: 20, group: 'Divergence' },

  { id: 'pivotShow', type: 'bool', title: 'PIVOT SHOW', defval: false, group: 'PIVOT' },
  { id: 'leftLenH', type: 'int', title: 'Pivot High', defval: 10, min: 1, group: 'PIVOT', inline: 'Pivot High' },
  { id: 'rightLenH', type: 'int', title: '/', defval: 10, min: 1, group: 'PIVOT', inline: 'Pivot High' },
  { id: 'textColorH', type: 'color', title: 'High text', defval: '#363A45', group: 'PIVOT', inline: 'PHC' },
  { id: 'labelColorH', type: 'color', title: 'High fill', defval: '#FFFFFF', group: 'PIVOT', inline: 'PHC' },
  { id: 'leftLenL', type: 'int', title: 'Pivot Low', defval: 10, min: 1, group: 'PIVOT', inline: 'Pivot Low' },
  { id: 'rightLenL', type: 'int', title: '/', defval: 10, min: 1, group: 'PIVOT', inline: 'Pivot Low' },
  { id: 'textColorL', type: 'color', title: 'Low text', defval: '#363A45', group: 'PIVOT', inline: 'PLC' },
  { id: 'labelColorL', type: 'color', title: 'Low fill', defval: '#FFFFFF', group: 'PIVOT', inline: 'PLC' },
  { id: 'pivotMax', type: 'int', title: 'Max pivot labels', defval: 24, min: 4, max: 80, group: 'PIVOT' },
];

// Plot colours of the default (dark) theme; the light theme has its own (set per point)
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA1', color: '#F8FF32', lineWidth: 2 },
  { id: 'plot1', title: 'EMA2', color: '#00F3FF', lineWidth: 2 },
  { id: 'plot2', title: 'EMA3', color: '#FF4DFF', lineWidth: 2 },
  { id: 'plot3', title: 'SMA1', color: '#00FF9C', lineWidth: 2 },
  { id: 'plot4', title: 'SMA2', color: '#39FF14', lineWidth: 2 },
  { id: 'plot5', title: 'SMA3', color: '#FF2D6A', lineWidth: 2 },
  { id: 'plot6', title: 'ParabolicSAR', color: '#00F3FF', lineWidth: 2, style: 'cross' },
  { id: 'plot7', title: 'Basis', color: '#FFB800', lineWidth: 2 },
  { id: 'plot8', title: 'Upper', color: '#00F3FF', lineWidth: 2 },
  { id: 'plot9', title: 'Lower', color: '#00F3FF', lineWidth: 2 },
  { id: 'plot10', title: 'Conversion Line', color: '#00F3FF', lineWidth: 2 },
  { id: 'plot11', title: 'Base Line', color: '#FF2D6A', lineWidth: 2 },
  { id: 'plot12', title: 'Lagging Span', color: '#00FF9C', lineWidth: 2 },
  { id: 'plot13', title: 'Leading Span A', color: '#00FF9C', lineWidth: 2 },
  { id: 'plot14', title: 'Leading Span B', color: '#FF2D6A', lineWidth: 2 },
  { id: 'plot15', title: 'Kumo Cloud Upper Line', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot16', title: 'Kumo Cloud Lower Line', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot17', title: 'VWAP', color: '#FFB800', lineWidth: 2 },
  { id: 'plot18', title: 'Supertrend', color: '#00FF9C', lineWidth: 2 },
  { id: 'plot19', title: 'Donchian High', color: '#00F3FF', lineWidth: 2 },
  { id: 'plot20', title: 'Donchian Low', color: '#00F3FF', lineWidth: 2 },
  { id: 'plot21', title: 'Keltner Upper', color: '#FF4DFF', lineWidth: 2 },
  { id: 'plot22', title: 'Keltner Lower', color: '#FF4DFF', lineWidth: 2 },
  { id: 'plot23', title: 'Keltner Basis', color: '#FF4DFF', lineWidth: 1 },
];

export const metadata = {
  title: 'Multicator Table',
  shortTitle: 'Multicator Table',
  overlay: true,
};

/** The HUD is laid out from the visible range of the chart: calculate again when the user scrolls or zooms */
export const usesVisibleRange = true;

const DAY_SECONDS = 86400;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const nz = (v: number, d: number) => (Number.isNaN(v) ? d : v);

type Point = { time: number; value: number; color: string };
type Result = IndicatorResult & {
  markers: MarkerData[]; lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[]; polylines: PolylineData[];
  tables: TableData[];
};

export function calculate(bars: Bar[], inputs: Partial<MulticatorTableInputs> = {}, chart?: ChartContext): Result {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const MINTICK = mintickOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const C = (c: string, t: number) => String(color.new(c, t));

  // ── Theme ──
  const en = cfg.lang === 'EN';
  const isDark = cfg.themeName === 'Dark';
  const T = (dark: string, darkT: number, light: string, lightT = 0) => (isDark ? C(dark, darkT) : C(light, lightT));
  const theme = {
    tableBg: T('#070b14', 8, '#f4f7fb'),
    tableHeader: T('#031018', 0, '#e4eef5'),
    tableText: T('#eaffff', 0, '#0b1c28'),
    frame: T('#00f3ff', 20, '#0b4f6c'),
    bull: T('#00ff9c', 35, '#c8f7d6'),
    bear: T('#ff2d6a', 28, '#ffd0d6'),
    neutral: T('#0d1524', 0, '#e8eef4'),
    hudBg: T('#05080f', 18, '#dfe7ef', 8),
    hudBorder: T('#00f3ff', 25, '#0b4f6c'),
    hudText: T('#eaffff', 0, '#0b1c28'),
  };
  const colEma1 = T('#f8ff32', 0, '#7a5b00');
  const colEma2 = T('#00f3ff', 0, '#063a8c');
  const colEma3 = T('#ff4dff', 0, '#5b21b6');
  const colSma1 = T('#00ff9c', 0, '#14532d');
  const colSma2 = T('#39ff14', 0, '#0f766e');
  const colSma3 = T('#ff2d6a', 0, '#9f1239');
  const colRsi = T('#bf5af2', 0, '#6b21a8');
  const colRsiMa = T('#00f3ff', 0, '#1e3a5f');
  const colAtr = T('#ff2d6a', 0, '#9f1239');
  const colMom = T('#ffb800', 0, '#92400e');
  const colAdx = T('#00ff9c', 0, '#14532d');
  const colMacd = T('#00f3ff', 0, '#063a8c');
  const colMacdSig = T('#ffb800', 0, '#92400e');
  const colSar = T('#00f3ff', 0, '#063a8c');
  const colBbMid = T('#ffb800', 0, '#9a3412');
  const colBbBand = T('#00f3ff', 0, '#063a8c');
  const colIchTenkan = T('#00f3ff', 0, '#063a8c');
  const colIchKijun = T('#ff2d6a', 0, '#9f1239');
  const colIchChikou = T('#00ff9c', 0, '#14532d');
  const colFib = T('#00f3ff', 20, '#334155');
  const colVwap = T('#ffb800', 0, '#9a3412');
  const colSt = T('#00ff9c', 0, '#166534');
  const colDon = T('#00f3ff', 0, '#1e40af');
  const colKel = T('#ff4dff', 0, '#6b21a8');
  const colStoch = T('#39ff14', 0, '#3f6212');
  const colCci = T('#ffb800', 0, '#854d0e');
  const colMfi = T('#00f3ff', 0, '#0e7490');
  const colWpr = T('#ff2d6a', 0, '#9f1239');
  const neonHeaderText = T('#00f3ff', 0, '#0a6b7c');
  // Plots without a colour argument (the two hidden Kumo lines): the default plot colour
  const colDefault = '#2962FF';

  const plotIds = plotConfig.map((p) => p.id);
  const meta = { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay };
  if (n === 0) {
    return {
      metadata: meta, plots: Object.fromEntries(plotIds.map((id) => [id, []])), fills: [], markers: [], lines: [], labels: [],
      boxes: [], polylines: [], tables: [],
    };
  }

  // ── Presets ──
  const scalp = cfg.preset === 'Scalping';
  const swing = cfg.preset === 'Swing';
  const rsiLenK = scalp ? 7 : swing ? 21 : cfg.rsiPeriod;
  const macdFast = scalp ? 8 : cfg.ml;
  const macdSlow = scalp ? 17 : cfg.sl;
  const macdSignal = scalp ? 9 : cfg.hl;
  const adxDiK = scalp ? 10 : cfg.diLen;
  const stochLenK = scalp ? 8 : swing ? 14 : cfg.stochLenIn;
  const stAtrK = scalp ? 7 : swing ? 10 : cfg.stAtrIn;
  const stFactorK = scalp ? 2.5 : swing ? 3.0 : cfg.stFactorIn;

  const tablePlace: TablePosition = cfg.tablePos === 'Bottom Right' ? 'bottom_right'
    : cfg.tablePos === 'Middle Right' ? 'middle_right'
      : cfg.tablePos === 'Bottom Center' ? 'bottom_center'
        : cfg.tablePos === 'Bottom Left' ? 'bottom_left' : 'top_right';
  const textSz: PineSize = cfg.tableSize === 'Large' ? 'large' : cfg.tableSize === 'Normal' ? 'normal' : 'small';

  // ── Series ──
  const open = bars.map((b) => b.open);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);
  const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
  const closeS = S(close);
  const highS = S(high);
  const lowS = S(low);
  const volumeS = S(volume);
  const hlc3S = S(hlc3);
  const last = n - 1;

  const fibHigh = A(ta.highest(highS, cfg.fibLookback));
  const fibLow = A(ta.lowest(lowS, cfg.fibLookback));
  const distToHigh = A(ta.highestbars(highS, cfg.fibLookback)).map(Math.abs);
  const distToLow = A(ta.lowestbars(lowS, cfg.fibLookback)).map(Math.abs);

  const ema50 = A(ta.ema(closeS, cfg.ema1));
  const ema100 = A(ta.ema(closeS, cfg.ema2));
  const ema200 = A(ta.ema(closeS, cfg.ema3));
  const emaRegime = A(ta.ema(closeS, 200));
  const sma50 = A(ta.sma(closeS, cfg.sma1));
  const sma100 = A(ta.sma(closeS, cfg.sma2));
  const sma200 = A(ta.sma(closeS, cfg.sma3));

  const chg = close.map((c, i) => ((c - at(close, i - 1)) / at(close, i - 1)) * 100);
  const rsiS = ta.rsi(closeS, rsiLenK);
  const rsi = A(rsiS);
  const rsiMa = A(ta.sma(rsiS, cfg.rsiMaPeriod));
  const atr = A(ta.atr(bars, cfg.atrPeriod));
  const mom = A(ta.mom(closeS, cfg.momPeriod));
  const [diplusS, diminusS, adxS] = ta.dmi(bars, adxDiK, cfg.lensig);
  const diplus = A(diplusS);
  const diminus = A(diminusS);
  const adx = A(adxS);
  const [macdS, signalS, histS] = ta.macd(closeS, macdFast, macdSlow, macdSignal);
  const macdLine = A(macdS);
  const signalLine = A(signalS);
  const histLine = A(histS);
  const out = A(ta.sar(bars, cfg.start, cfg.increment, cfg.maximum));
  const volMa20 = A(ta.sma(volumeS, 20));
  const relVol = volume.map((v, i) => (eq(volMa20[i], 0) ? 1.0 : v / volMa20[i]));
  const stochKS = ta.stoch(closeS, highS, lowS, stochLenK);
  const stochK = A(stochKS);
  const stochD = A(ta.sma(stochKS, 3));
  const cci = A(ta.cci(hlc3S, cfg.cciLenIn));
  const mfi = A(ta.mfi(hlc3S, cfg.mfiLenIn, volumeS));
  const wpr = A(ta.wpr(bars, cfg.wprLenIn));
  const obv = A(ta.obv(bars));

  // vwapVal = ta.vwap(hlc3): anchor timeframe.change("1D"), the sums also start on the first bar (a day in progress)
  const interval = barInterval(bars);
  const intraday = interval > 0 && interval < DAY_SECONDS;
  // Intraday bars: the trading day of the exchange is not known without its time zone and session
  if (intraday && !hasCalendar(chart) && cfg.vwapShow) {
    throw new Error(
      'Multicator Table: on intraday bars "Show VWAP" needs the exchange time zone and session of the chart context '
      + '(ta.vwap restarts on each trading day).',
    );
  }
  // Daily and higher bars: each bar is its own day
  const newDay = intraday ? periodChanges(bars, '1D', chart).map((change, i) => (i === 0 || change ? 1 : 0)) : bars.map(() => 1);
  const vwapVal = intraday && !hasCalendar(chart) ? new Array<number>(n).fill(NaN) : A(ta.vwap(hlc3S, volumeS, S(newDay)));

  const [stLineS, stDirS] = ta.supertrend(bars, stFactorK, stAtrK);
  const stLine = A(stLineS);
  const stDir = A(stDirS);
  const donHigh = A(ta.highest(highS, cfg.donLenIn));
  const donLow = A(ta.lowest(lowS, cfg.donLenIn));
  const kelBasis = A(ta.ema(closeS, cfg.kelLenIn));
  const kelAtr = A(ta.atr(bars, cfg.kelLenIn));
  const kelUpper = kelBasis.map((v, i) => v + cfg.kelMultIn * kelAtr[i]);
  const kelLower = kelBasis.map((v, i) => v - cfg.kelMultIn * kelAtr[i]);
  const atr1S = ta.atr(bars, 1);
  const chopHigh = A(ta.highest(highS, cfg.chopLenIn));
  const chopLow = A(ta.lowest(lowS, cfg.chopLenIn));
  const atr1Sum = A(math.sum(atr1S, cfg.chopLenIn));

  const hud = (s: Series) => ({ lo: A(ta.lowest(s, cfg.hudBars))[last], hi: A(ta.highest(s, cfg.hudBars))[last] });
  const macdHud = hud(macdS);
  const signalHud = hud(signalS);
  const adxHud = hud(adxS);
  const momHud = hud(S(mom));
  const atrHud = hud(S(atr));
  const stochHud = hud(stochKS);
  const cciHud = hud(S(cci));
  const fallbackHigh = A(ta.highest(highS, 100))[last];
  const fallbackLow = A(ta.lowest(lowS, 100))[last];

  // Bollinger bands
  const srcS = getSourceSeries(bars, cfg.src);
  const basisS = cfg.maType === 'EMA' ? ta.ema(srcS, cfg.length)
    : cfg.maType === 'SMMA (RMA)' ? ta.rma(srcS, cfg.length)
      : cfg.maType === 'WMA' ? ta.wma(srcS, cfg.length)
        : cfg.maType === 'VWMA' ? ta.vwma(srcS, cfg.length, volumeS)
          : ta.sma(srcS, cfg.length);
  const basis = A(basisS);
  const dev = A(ta.stdev(srcS, cfg.length)).map((v) => cfg.mult * v);
  const upper = basis.map((v, i) => v + dev[i]);
  const lower = basis.map((v, i) => v - dev[i]);

  // Ichimoku: donchian(len) => math.avg(ta.lowest(len), ta.highest(len))
  const donchian = (len: number) => {
    const ll = A(ta.lowest(lowS, len));
    const hh = A(ta.highest(highS, len));
    return ll.map((l, i) => (l + hh[i]) / 2);
  };
  const conversionLine = donchian(cfg.conversionPeriods);
  const baseLine = donchian(cfg.basePeriods);
  const leadLine1 = conversionLine.map((v, i) => (v + baseLine[i]) / 2);
  const leadLine2 = donchian(cfg.laggingSpan2Periods);

  // ── Plots ──
  const X = (index: number) => barTime(bars, index, interval);
  // plot(show ? value : na, color, offset = k): the value of bar i is drawn on bar i + k (bars before the first one
  // are left out)
  const plot = (show: boolean, vals: number[], col: string | ((i: number) => string), k = 0): Point[] => {
    const pts: Point[] = [];
    for (let i = Math.max(0, -k); i < n; i++) {
      pts.push({
        time: k === 0 ? bars[i].time : X(i + k), value: show && Number.isFinite(vals[i]) ? vals[i] : NaN,
        color: typeof col === 'string' ? col : col(i),
      });
    }
    return pts;
  };
  const lead = cfg.displacement - 1;
  const plots: Record<string, Point[]> = {
    plot0: plot(cfg.ema1Show, ema50, colEma1),
    plot1: plot(cfg.ema2Show, ema100, colEma2),
    plot2: plot(cfg.ema3Show, ema200, colEma3),
    plot3: plot(cfg.sma1Show, sma50, colSma1),
    plot4: plot(cfg.sma2Show, sma100, colSma2),
    plot5: plot(cfg.sma3Show, sma200, colSma3),
    plot6: plot(cfg.sarShow, out, colSar),
    plot7: plot(cfg.bbShow, basis, colBbMid, cfg.offset),
    plot8: plot(cfg.bbShow, upper, colBbBand, cfg.offset),
    plot9: plot(cfg.bbShow, lower, colBbBand, cfg.offset),
    plot10: plot(cfg.ichShow, conversionLine, colIchTenkan),
    plot11: plot(cfg.ichShow, baseLine, colIchKijun),
    plot12: plot(cfg.ichShow, close, colIchChikou, -cfg.displacement + 1),
    plot13: plot(cfg.ichShow, leadLine1, colSma1, lead),
    plot14: plot(cfg.ichShow, leadLine2, colSma3, lead),
    plot15: plot(cfg.ichShow, leadLine1.map((a, i) => (gt(a, leadLine2[i]) ? a : leadLine2[i])), colDefault, lead),
    plot16: plot(cfg.ichShow, leadLine1.map((a, i) => (lt(a, leadLine2[i]) ? a : leadLine2[i])), colDefault, lead),
    plot17: plot(cfg.vwapShow, vwapVal, colVwap),
    plot18: plot(cfg.stShow, stLine, (i) => (lt(stDir[i], 0) ? colSt : colSma3)),
    plot19: plot(cfg.donShow, donHigh, colDon),
    plot20: plot(cfg.donShow, donLow, colDon),
    plot21: plot(cfg.kelShow, kelUpper, colKel),
    plot22: plot(cfg.kelShow, kelLower, colKel),
    plot23: plot(cfg.kelShow, kelBasis, colKel),
  };
  // The fill colour of bar i goes with the plot points of bar i
  const bbFill = T('#00f3ff', 88, '#063a8c', 88);
  const kumoUp = T('#00ff9c', 82, '#14532d', 85);
  const kumoDown = T('#ff2d6a', 82, '#9f1239', 85);
  const fills = [
    { plot1: 'plot8', plot2: 'plot9', colors: bars.map(() => (cfg.bbShow ? bbFill : 'transparent')).slice(Math.max(0, -cfg.offset)) },
    {
      plot1: 'plot13', plot2: 'plot14',
      colors: leadLine1.map((a, i) => (cfg.ichShow ? (gt(a, leadLine2[i]) ? kumoUp : kumoDown) : 'transparent')),
    },
  ];

  // ── Divergences and pivot labels ──
  const ph = A(ta.pivothigh(highS, cfg.leftLenH, cfg.rightLenH));
  const pl = A(ta.pivotlow(lowS, cfg.leftLenL, cfg.rightLenL));
  const phDiv = A(ta.pivothigh(highS, cfg.divLook, cfg.divLook));
  const plDiv = A(ta.pivotlow(lowS, cfg.divLook, cfg.divLook));
  const tickText = (v: number) => str.tostring(v, 'mintick', MINTICK);
  let lastPh = NaN;
  let lastPhRsi = NaN;
  let lastPhMacd = NaN;
  let lastPl = NaN;
  let lastPlRsi = NaN;
  let lastPlMacd = NaN;
  const markers: MarkerData[] = [];
  const bullRsiMarkers: MarkerData[] = [];
  const bearRsiMarkers: MarkerData[] = [];
  const bullMacdMarkers: MarkerData[] = [];
  const bearMacdMarkers: MarkerData[] = [];
  // var label[] pivotLabels: the newest "Max pivot labels" labels are kept
  const pivotLabels: LabelData[] = [];
  const addPivot = (lb: LabelData) => {
    pivotLabels.push(lb);
    if (pivotLabels.length > cfg.pivotMax) pivotLabels.shift();
  };
  for (let i = 0; i < n; i++) {
    let bearRsiDiv = false;
    let bullRsiDiv = false;
    let bearMacdDiv = false;
    let bullMacdDiv = false;
    if (!Number.isNaN(phDiv[i])) {
      const pr = at(rsi, i - cfg.divLook);
      const pm = at(macdLine, i - cfg.divLook);
      if (!Number.isNaN(lastPh)) {
        if (gt(phDiv[i], lastPh) && lt(pr, lastPhRsi)) bearRsiDiv = true;
        if (gt(phDiv[i], lastPh) && lt(pm, lastPhMacd)) bearMacdDiv = true;
      }
      lastPh = phDiv[i];
      lastPhRsi = pr;
      lastPhMacd = pm;
    }
    if (!Number.isNaN(plDiv[i])) {
      const lr = at(rsi, i - cfg.divLook);
      const lm = at(macdLine, i - cfg.divLook);
      if (!Number.isNaN(lastPl)) {
        if (lt(plDiv[i], lastPl) && gt(lr, lastPlRsi)) bullRsiDiv = true;
        if (lt(plDiv[i], lastPl) && gt(lm, lastPlMacd)) bullMacdDiv = true;
      }
      lastPl = plDiv[i];
      lastPlRsi = lr;
      lastPlMacd = lm;
    }
    const time = bars[i].time;
    if (cfg.showDiv && bullRsiDiv) bullRsiMarkers.push({ time, position: 'belowBar', shape: 'triangleUp', color: colSt, size: 'tiny' });
    if (cfg.showDiv && bearRsiDiv) bearRsiMarkers.push({ time, position: 'aboveBar', shape: 'triangleDown', color: colSma3, size: 'tiny' });
    if (cfg.showDiv && bullMacdDiv) bullMacdMarkers.push({ time, position: 'belowBar', shape: 'diamond', color: colMacd, size: 'tiny' });
    if (cfg.showDiv && bearMacdDiv) bearMacdMarkers.push({ time, position: 'aboveBar', shape: 'diamond', color: colMacdSig, size: 'tiny' });

    if (cfg.pivotShow) {
      if (!Number.isNaN(ph[i])) {
        addPivot({
          time: X(i - cfg.rightLenH), price: ph[i], text: tickText(ph[i]), style: 'label_down', color: theme.tableBg,
          textColor: theme.tableText,
        });
      }
      if (!Number.isNaN(pl[i])) {
        addPivot({
          time: X(i - cfg.rightLenL), price: pl[i], text: tickText(pl[i]), style: 'label_up', color: theme.tableBg,
          textColor: theme.tableText,
        });
      }
    }
  }
  markers.push(...bullRsiMarkers, ...bearRsiMarkers, ...bullMacdMarkers, ...bearMacdMarkers);

  // ── Last bar (barstate.islast) ──
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [...pivotLabels];
  const boxes: BoxData[] = [];
  const polylines: PolylineData[] = [];
  const roundTick = (v: number) => math.round_to_mintick(v, MINTICK) as number;
  const tick = (v: number) => str.tostring(roundTick(v));
  const finite = (...v: number[]) => v.every((x) => Number.isFinite(x));

  // Fibonacci levels of the highest high / lowest low of the lookback
  if (cfg.showFib) {
    const fh = fibHigh[last];
    const fl = fibLow[last];
    const fromHigh = gt(distToLow[last], distToHigh[last]);
    const level = (k: number) => (fromHigh ? fh - ((fh - fl) * k) / 1000 : fl + ((fh - fl) * k) / 1000);
    const fib618 = level(cfg.fib1);
    const fib50 = level(500);
    const fib382 = level(cfg.fib2);
    const fib786 = level(cfg.fib3);
    const xHigh = last - Math.trunc(distToHigh[last]);
    const xLow = last - Math.trunc(distToLow[last]);
    const xRight = last + 50;
    const xLbl = last + 55;
    const fibLine = (x1: number, y: number, style: 'solid' | 'dashed') => {
      // an object with an na coordinate is not drawn
      if (!finite(x1, y)) return;
      lines.push({
        time1: X(x1), price1: y, time2: X(xRight), price2: y, color: colFib, width: 1, style,
        extend: cfg.fibonacciExtendRight ? 'right' : 'none',
      });
    };
    fibLine(xHigh, fh, 'solid');
    fibLine(xLow, fl, 'solid');
    fibLine(last + 10, fib382, 'dashed');
    fibLine(last + 10, fib50, 'dashed');
    fibLine(last + 10, fib618, 'dashed');
    fibLine(last + 10, fib786, 'dashed');
    if (cfg.fibShowData) {
      const fibLabel = (y: number, text: string) => {
        if (!finite(y)) return;
        labels.push({ time: X(xLbl), price: y, text, color: C(color.gray, 100), style: 'none', textColor: theme.hudText });
      };
      fibLabel(fh, (en ? 'Top ( ' : 'Tepe ( ') + tick(fh) + ' )');
      fibLabel(fl, (en ? 'Bottom ( ' : 'Dip ( ') + tick(fl) + ' )');
      fibLabel(fib382, str.tostring(cfg.fib2 / 1000) + ' ( ' + tick(fib382) + ' )');
      fibLabel(fib618, str.tostring(cfg.fib1 / 1000) + ' ( ' + tick(fib618) + ' )');
      fibLabel(fib50, '% 50 ( ' + tick(fib50) + ' )');
      fibLabel(fib786, str.tostring(cfg.fib3 / 1000) + ' ( ' + tick(fib786) + ' )');
    }
  }

  // HVN: the close of the bar with the highest volume of the lookback (the newest one on a tie)
  let hvnPrice = close[last];
  let hvnVol = volume[last];
  for (let k = 1; k <= cfg.hvnLook - 1; k++) {
    if (gt(at(volume, last - k), hvnVol)) {
      hvnVol = at(volume, last - k);
      hvnPrice = at(close, last - k);
    }
  }
  if (cfg.hvnShow && finite(hvnPrice)) {
    // a horizontal line: a start before the first bar is drawn from the first bar
    lines.push({
      time1: X(Math.max(0, last - cfg.hvnLook)), price1: hvnPrice, time2: X(last + 10), price2: hvnPrice, color: colMom, style: 'dotted',
      extend: 'right',
    });
  }

  // HUD: the price range of the visible bars (the script looks back at most 5,000 bars from the last bar)
  const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
  const visible = visibleRangeOf(bars, chart);
  let visTop0 = high[last];
  let visBot0 = low[last];
  let started = false;
  for (let k = 0; k < 5000 && last - k >= 0; k++) {
    const t = bars[last - k].time * toMs;
    if (t >= visible.leftTime && t <= visible.rightTime) {
      if (!started) {
        visTop0 = high[last - k];
        visBot0 = low[last - k];
        started = true;
      } else {
        visTop0 = Math.max(visTop0, high[last - k]);
        visBot0 = Math.min(visBot0, low[last - k]);
      }
    }
    if (t < visible.leftTime) break;
  }
  const flat = lt(visTop0 - visBot0, MINTICK * 2);
  const geoTop = flat ? fallbackHigh : visTop0;
  const geoBot = flat ? fallbackLow : visBot0;
  const slotN = cfg.hudExtra ? 9 : 5;
  const hudGeometry = (slot: number): [number, number] => {
    const visSpan = Math.max(geoTop - geoBot, MINTICK);
    const gapY = visSpan * 0.04;
    const count = Math.max(slotN, 1);
    const usable = visSpan - gapY * (count + 1);
    const h = usable / count;
    const yTop = geoTop - gapY - slot * (h + gapY);
    return [yTop, yTop - h];
  };
  const x0Hud = last + cfg.hudGap;
  const lenHud = cfg.hudBars;
  // sparkPoints: the last lenHud values, scaled from [vmin, vmax] to [yBot, yTop]
  const sparkPoints = (vals: number[], yBot: number, yTop: number, vmin: number, vmax: number) => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= lenHud - 1; i++) {
      const rng = Math.max(vmax - vmin, MINTICK);
      pts.push({ x: x0Hud + i, y: yBot + ((nz(at(vals, last - (lenHud - 1 - i)), vmin) - vmin) / rng) * (yTop - yBot) });
    }
    return pts;
  };
  const drawHud = (
    slot: number, title: string, lo: number, hi: number, vals1: number[], col1: string, vals2?: number[], col2?: string,
  ) => {
    const [yTop, yBot] = hudGeometry(slot);
    // objects with na coordinates are not drawn
    if (finite(yTop, yBot)) {
      boxes.push({
        time1: X(x0Hud), price1: yTop, time2: X(x0Hud + (lenHud - 1)), price2: yBot, borderColor: theme.hudBorder,
        bgColor: theme.hudBg, extend: 'none',
      });
    }
    for (const [vals, col] of [[vals1, col1], [vals2, col2]] as Array<[number[] | undefined, string | undefined]>) {
      if (!vals || !col) continue;
      const points = sparkPoints(vals, yBot, yTop, lo, hi).filter((p) => Number.isFinite(p.y))
        .map((p) => ({ time: X(p.x), price: p.y }));
      if (points.length) polylines.push({ points, lineColor: col, fillColor: 'transparent', lineStyle: 'solid', lineWidth: 2 });
    }
    if (finite(yTop)) {
      labels.push({
        time: X(x0Hud), price: yTop, text: title, style: 'none', color: C(color.black, 100), textColor: theme.hudText,
        size: 'small', textAlign: 'left',
      });
    }
  };
  if (cfg.showHud) {
    if (cfg.rsiShow) drawHud(0, 'RSI ' + tick(rsi[last]), 0.0, 100.0, rsi, colRsi, rsiMa, colRsiMa);
    if (cfg.macdShow) {
      drawHud(1, 'MACD ' + str.tostring(math.round(macdLine[last], 4)), Math.min(macdHud.lo, signalHud.lo), Math.max(macdHud.hi, signalHud.hi),
        macdLine, colMacd, signalLine, colMacdSig);
    }
    if (cfg.adxShow) drawHud(2, 'ADX ' + tick(adx[last]), 0.0, Math.max(50.0, adxHud.hi), adx, colAdx);
    if (cfg.momShow) drawHud(3, 'MOM ' + tick(mom[last]), momHud.lo, momHud.hi, mom, colMom);
    if (cfg.atrShow) drawHud(4, 'ATR ' + tick(atr[last]), atrHud.lo, atrHud.hi, atr, colAtr);
    if (cfg.hudExtra) {
      drawHud(5, 'Stoch ' + tick(stochK[last]), stochHud.lo, stochHud.hi, stochK, colStoch, stochD, colMfi);
      drawHud(6, 'CCI ' + tick(cci[last]), cciHud.lo, cciHud.hi, cci, colCci);
      drawHud(7, 'MFI ' + tick(mfi[last]), 0.0, 100.0, mfi, colMfi);
      drawHud(8, '%R ' + tick(wpr[last]), -100.0, 0.0, wpr, colWpr);
    }
  }

  // ── Tables ──
  const c = close[last];
  const rsiL = rsi[last];
  const chgL = chg[last];
  const adxL = adx[last];
  const relVolL = relVol[last];
  const stDirL = stDir[last];
  const chopNum = Math.max(chopHigh[last] - chopLow[last], MINTICK);
  const chop = (100.0 * Math.log(Math.max(atr1Sum[last], MINTICK) / chopNum)) / Math.log(cfg.chopLenIn);
  const donMid = (donHigh[last] + donLow[last]) / 2;

  const grad = (v: number, lo: number, hi: number, from: string, to: string) => String(color.from_gradient(v, lo, hi, from, to));
  const rsiBg = ge(rsiL, 70) ? theme.bear : le(rsiL, 30) ? theme.bull
    : grad(rsiL, 30, 70, theme.neutral, C('#7c3aed', isDark ? 45 : 70));
  const chgBg = gt(chgL, 0) ? grad(Math.min(Math.abs(chgL), 3.0), 0.0, 3.0, theme.neutral, theme.bull)
    : lt(chgL, 0) ? grad(Math.min(Math.abs(chgL), 3.0), 0.0, 3.0, theme.neutral, theme.bear) : theme.neutral;
  const adxBg = grad(Math.min(adxL, 50.0), 15.0, 40.0, theme.neutral, theme.bull);
  const volBg = gt(relVolL, 1.5) ? theme.bull : lt(relVolL, 0.65) ? theme.neutral : theme.tableBg;

  const votes = (gt(c, emaRegime[last]) ? 1 : 0) + (gt(adxL, 25) ? 1 : 0) + (gt(macdLine[last], signalLine[last]) ? 1 : 0)
    + (ge(rsiL, 40) && le(rsiL, 65) ? 1 : 0) + (lt(stDirL, 0) ? 1 : 0) + (gt(stochK[last], 50) ? 1 : 0)
    + (gt(mfi[last], 50) ? 1 : 0) + (ge(relVolL, 1.0) ? 1 : 0) + (gt(c, donMid) ? 1 : 0);
  const score = Math.trunc(math.round((votes / 9.0) * 100.0) as number);
  const regimeRange = lt(adxL, 20) || gt(chop, 61.8);
  const regimeText = regimeRange ? (en ? 'Range' : 'Yatay')
    : gt(c, emaRegime[last]) ? (en ? 'Trend up' : 'Trend yukarı') : (en ? 'Trend down' : 'Trend aşağı');
  const regimeBg = regimeRange ? theme.neutral : gt(c, emaRegime[last]) ? theme.bull : theme.bear;
  const scoreBg = score >= 66 ? theme.bull : score <= 33 ? theme.bear : theme.neutral;
  const maColor = (maVal: number) => (gt(maVal, c) ? theme.bear : theme.bull);

  const g1 = en ? 'Open' : 'Açılış';
  const g2 = en ? 'Close' : 'Kapanış';
  const g3 = en ? 'Change' : 'Değişim';
  const g4 = 'RSI';
  const g5 = 'ATR';
  const g6 = en ? 'Volume' : 'Hacim';
  const tOpen = tick(open[last]);
  const tClose = tick(c);
  const tChg = (gt(chgL, 0) ? '▲ ' : lt(chgL, 0) ? '▼ ' : '') + tick(chgL) + '%';
  const tRsi = tick(rsiL);
  const tAtr = tick(atr[last]);
  const tVol = str.tostring(volume[last], 'volume');
  const stText = lt(stDirL, 0) ? (en ? 'UP' : 'YUKARI') : (en ? 'DOWN' : 'AŞAĞI');
  const tMacd = str.tostring(math.round(macdLine[last], 4));
  const macdBg = ge(macdLine[last], signalLine[last]) ? theme.bull : theme.bear;
  const stochBg = gt(stochK[last], 80) ? theme.bear : lt(stochK[last], 20) ? theme.bull : theme.tableBg;
  const vwapBg = ge(c, vwapVal[last]) ? theme.bull : theme.bear;
  const stBg = lt(stDirL, 0) ? theme.bull : theme.bear;
  const tRelVol = str.tostring(math.round(relVolL, 2)) + 'x';
  const tObv = str.tostring(obv[last], 'volume');

  const deskCells: TableCellData[] = [];
  const mobileCells: TableCellData[] = [];
  const cell = (cells: TableCellData[], column: number, row: number, text: string, bgColor: string) => {
    cells.push({ column, row, text, bgColor, textColor: theme.tableText, textSize: textSz, textHAlign: 'center' });
  };
  const headerCell = (cells: TableCellData[], column: number, row: number, text: string) => {
    cells.push({ column, row, text, bgColor: theme.tableHeader, textColor: neonHeaderText, textSize: textSz, textHAlign: 'center' });
  };

  if (cfg.tableMode === 'Desktop') {
    const t = deskCells;
    [g1, g2, g3, g4, g5, g6].forEach((g, col) => headerCell(t, col, 0, g));
    cell(t, 0, 1, tOpen, theme.tableBg);
    cell(t, 1, 1, tClose, theme.tableBg);
    cell(t, 2, 1, tChg, chgBg);
    cell(t, 3, 1, tRsi, rsiBg);
    cell(t, 4, 1, tAtr, theme.tableBg);
    cell(t, 5, 1, tVol, volBg);
    headerCell(t, 0, 2, 'SMA' + str.tostring(cfg.sma1));
    headerCell(t, 1, 2, 'SMA' + str.tostring(cfg.sma2));
    headerCell(t, 2, 2, 'SMA' + str.tostring(cfg.sma3));
    headerCell(t, 3, 2, 'EMA' + str.tostring(cfg.ema1));
    headerCell(t, 4, 2, 'EMA' + str.tostring(cfg.ema2));
    headerCell(t, 5, 2, 'EMA' + str.tostring(cfg.ema3));
    [sma50, sma100, sma200, ema50, ema100, ema200].forEach((ma, col) => cell(t, col, 3, tick(ma[last]), maColor(ma[last])));
    ['ADX', 'MOM', 'MACD', '+DI/-DI', en ? 'Score' : 'Skor', en ? 'Regime' : 'Rejim'].forEach((g, col) => headerCell(t, col, 4, g));
    cell(t, 0, 5, tick(adxL), adxBg);
    cell(t, 1, 5, tick(mom[last]), ge(mom[last], 0) ? theme.bull : theme.bear);
    cell(t, 2, 5, tMacd, macdBg);
    cell(t, 3, 5, tick(diplus[last]) + '/' + tick(diminus[last]), gt(diplus[last], diminus[last]) ? theme.bull : theme.bear);
    cell(t, 4, 5, str.tostring(score), scoreBg);
    cell(t, 5, 5, regimeText, regimeBg);
    ['Stoch', 'CCI', 'MFI', '%R', 'OBV', 'VWAP'].forEach((g, col) => headerCell(t, col, 6, g));
    cell(t, 0, 7, tick(stochK[last]), stochBg);
    cell(t, 1, 7, tick(cci[last]), gt(cci[last], 100) ? theme.bear : lt(cci[last], -100) ? theme.bull : theme.tableBg);
    cell(t, 2, 7, tick(mfi[last]), gt(mfi[last], 80) ? theme.bear : lt(mfi[last], 20) ? theme.bull : theme.tableBg);
    cell(t, 3, 7, tick(wpr[last]), gt(wpr[last], -20) ? theme.bear : lt(wpr[last], -80) ? theme.bull : theme.tableBg);
    cell(t, 4, 7, tObv, theme.tableBg);
    cell(t, 5, 7, tick(vwapVal[last]), vwapBg);
    ['ST', 'RelVol', 'HVN', 'Chop', 'SAR', 'Hist'].forEach((g, col) => headerCell(t, col, 8, g));
    cell(t, 0, 9, stText, stBg);
    cell(t, 1, 9, tRelVol, volBg);
    cell(t, 2, 9, tick(hvnPrice), theme.tableBg);
    cell(t, 3, 9, tick(chop), gt(chop, 61.8) ? theme.neutral : theme.bull);
    cell(t, 4, 9, tick(out[last]), ge(c, out[last]) ? theme.bull : theme.bear);
    cell(t, 5, 9, str.tostring(math.round(histLine[last], 4)), ge(histLine[last], 0) ? theme.bull : theme.bear);
  }

  if (cfg.tableMode === 'Mobile') {
    const t = mobileCells;
    const row = (r: number, header: string, text: string, bg: string) => {
      headerCell(t, 0, r, header);
      cell(t, 1, r, text, bg);
    };
    row(0, g1, tOpen, theme.tableBg);
    row(1, g2, tClose, theme.tableBg);
    row(2, g3, tChg, chgBg);
    row(3, g4, tRsi, rsiBg);
    row(4, en ? 'Score' : 'Skor', str.tostring(score), scoreBg);
    row(5, en ? 'Regime' : 'Rejim', regimeText, regimeBg);
    row(6, 'SMA' + str.tostring(cfg.sma1), tick(sma50[last]), maColor(sma50[last]));
    row(7, 'EMA' + str.tostring(cfg.ema1), tick(ema50[last]), maColor(ema50[last]));
    row(8, 'ADX', tick(adxL), adxBg);
    row(9, 'MACD', tMacd, macdBg);
    row(10, 'Stoch', tick(stochK[last]), stochBg);
    row(11, 'CCI', tick(cci[last]), theme.tableBg);
    row(12, 'MFI', tick(mfi[last]), theme.tableBg);
    row(13, '%R', tick(wpr[last]), theme.tableBg);
    row(14, 'VWAP', tick(vwapVal[last]), vwapBg);
    row(15, 'ST', stText, stBg);
    row(16, 'RelVol', tRelVol, volBg);
    row(17, 'HVN', tick(hvnPrice), theme.tableBg);
    row(18, 'Chop', tick(chop), theme.tableBg);
    row(19, 'OBV', tObv, theme.tableBg);
    row(20, g6, tVol, volBg);
    row(21, 'MOM', tick(mom[last]), ge(mom[last], 0) ? theme.bull : theme.bear);
  }

  // Two tables exist from the first bar: the mobile one (bottom right) and the desktop one, which is moved to the
  // chosen position on the last bar. A table moved onto the corner of another one replaces it: with the position
  // "Bottom Right" the mobile table is gone. A table without a cell draws nothing and is left out.
  const frame = { borderColor: theme.frame, borderWidth: 1, frameColor: theme.frame, frameWidth: 2 };
  const tables: TableData[] = [];
  if (mobileCells.length && tablePlace !== 'bottom_right') {
    tables.push({ position: 'bottom_right', columns: 2, rows: 22, cells: mobileCells, ...frame });
  }
  if (deskCells.length) tables.push({ position: tablePlace, columns: 6, rows: 10, cells: deskCells, ...frame });

  return { metadata: meta, plots, fills, markers, lines, labels, boxes, polylines, tables };
}

export const MulticatorTable = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
