/**
 * SSL HYBRID Advanced
 *
 * The SSL Hybrid baseline (a moving average of the close with a channel of its smoothed true range; the bars are
 * coloured above / below / inside the channel), SSL1, SSL2 (continuation, circles) and exit lines built from the
 * averages of the high and the low, exit arrows when the close crosses the exit line, and optional ATR bands. Added
 * to it: two QQE MOD lines (QQE background colour, QQE up / down triangles, optional QQE line), the Waddah Attar
 * Explosion, the ADX / DMI (low-ADX background, DI cross diamonds on an EMA 200 of the open), a Hull trend and a
 * Supertrend of a selectable timeframe, MACD and EMA 20 / 50 crossing marks, Bollinger / Keltner bands with the
 * squeeze area, Buy / Sell labels from the SSL exit cross (optionally combined with QQE + WAE or the Supertrend and
 * filtered by the Supertrend or the Hull trend), a checklist table and a strength table (sum of ten bull / bear
 * votes: PSAR, SSL exit, QQE + WAE, WAE, ADX, EMA 20 / 50, stochastic, RSI, CCI, Supertrend), optional pivot marks
 * and pivot support / resistance levels (lines and labels).
 *
 * Timeframe inputs (Hull, Supertrend, EMA 1 / 2): "" is the chart timeframe; a higher timeframe is built from the
 * chart bars (see anchor-period.ts); a lower timeframe needs data the chart bars do not have: the port throws.
 * Chart values read: the symbol price tick (support / resistance levels are rounded to it; 0.01 without a chart
 * context), the chart timeframe and calendar for the higher timeframes.
 *
 * Reference: "SSL HYBRID Advanced" by traderharikrishna (after "SSL Hybrid" by Mihkel00)
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Advanced By Trader Hari Krishna; SSL HYBRID By Mihkel00; VAMA: Copyright © 2019 to present,
 * Joris Duyck (JD); JMA: Copyright © 2018 Alex Orekhov (everget), Copyright © 2017 Jurik Research and Consulting.
 */

import {
  ta, Series, color, str, math, callsite, getSourceSeries, timeframe, mapToChart, line, label,
  resetDrawings, setDrawingBar, drawingOutputs,
  type Bar, type IndicatorResult, type InputConfig, type PlotConfig, type SourceType, type Line, type Label,
} from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData, TableData, TableCellData, LabelData, LineDrawingData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';

type MaType =
  | 'ZLSMA' | 'SMA' | 'EMA' | 'DEMA' | 'TEMA' | 'LSMA' | 'WMA' | 'MF' | 'VAMA' | 'TMA' | 'HMA' | 'JMA' | 'Kijun v2'
  | 'EDSMA' | 'McGinley';

export interface SslHybridAdvancedInputs {
  sslsignals: 'SSL-HYBRID' | 'SSL+QQE+WAE' | 'SSL-HYBRID+SuperTrend';
  strend: 'NO-FILTER' | 'SUPERTREND' | 'HULL';
  squeezesignalfilter: boolean;
  adxsignalfilter: boolean;
  strengthtreshold: number;
  showtable: boolean;
  merget: boolean;
  showtable2: boolean;
  showEma200: boolean;
  showbbsqueeze: boolean;
  showadxbg: boolean;
  showadxcandles: boolean;
  showbb: '--' | 'BB' | 'Keltner';
  showmtfma: boolean;
  showqqedot: boolean;
  showbg: boolean;
  qqeline: boolean;
  showpp: boolean;
  showsr: boolean;
  showBaseline: boolean;
  showSsl1: boolean;
  showssl2: boolean;
  showAtr: boolean;
  atrlen: number;
  mult: number;
  smoothing: 'RMA' | 'SMA' | 'EMA' | 'WMA';
  maType: MaType;
  len: number;
  ssl2Type: MaType;
  len2: number;
  ssl3Type: MaType;
  len3: number;
  src: SourceType;
  kidiv: number;
  jurikPhase: number;
  jurikPower: number;
  volatilityLookback: number;
  beta: number;
  feedback: boolean;
  z: number;
  ssfLength: number;
  ssfPoles: number;
  useTrueRange: boolean;
  multy: number;
  showColorBar: boolean;
  atrCrit: number;
  rsiPeriod: number;
  sf: number;
  qqe: number;
  threshHold: number;
  qqsrc: SourceType;
  qqeBbLength: number;
  qqmult: number;
  rsiPeriod2: number;
  sf2: number;
  qqe2: number;
  threshHold2: number;
  src2: SourceType;
  sensitivity: number;
  fastLength: number;
  slowLength: number;
  channelLength: number;
  waeMult: number;
  adxl: number;
  adxs: number;
  adxtreshold: number;
  showhulltrend: boolean;
  showtrend: boolean;
  showstc: boolean;
  mtf4: string;
  stf4: string;
  maLength4: number;
  stFactor: number;
  stLength: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  bbMaType: 'EMA' | 'HMA' | 'SMA';
  kLength: number;
  kN: number;
  bbLength: number;
  bbN: number;
  mtf1: string;
  mtf2: string;
  maLength1: number;
  maLength2: number;
  rsiLength: number;
  rsiSmaLength: number;
  cciLength: number;
  cciSrc: SourceType;
  overBought: number;
  overSold: number;
  stochLength: number;
  stochK: number;
  stochD: number;
  psarStart: number;
  psarIncrement: number;
  psarMaximum: number;
  prd: number;
  ppsrc: 'High/Low' | 'Close/Open';
  maxnumpp: number;
  channelW: number;
  maxnumsr: number;
  minStrength: number;
  labelloc: number;
  linestyle: 'Solid' | 'Dotted' | 'Dashed';
  linewidth: number;
  resistancecolor: string;
  supportcolor: string;
}

// Colours of Pine v6: color.red, lime, green, purple, gray, white, black, blue, maroon, yellow
const RED = '#F23645';
const LIME = '#00E676';
const GREEN = '#4CAF50';
const PURPLE = '#9C27B0';
const GRAY = '#787B86';
const WHITE = '#FFFFFF';
const BLACK = '#363A45';
const BLUE = '#2962FF';
const MAROON = '#880E4F';
const YELLOW = '#FDD835';
const BULL = '#00c3ff';
const BEAR = '#ff0062';

export const defaultInputs: SslHybridAdvancedInputs = {
  sslsignals: 'SSL-HYBRID',
  strend: 'NO-FILTER',
  squeezesignalfilter: false,
  adxsignalfilter: false,
  strengthtreshold: 8,
  showtable: true,
  merget: true,
  showtable2: true,
  showEma200: false,
  showbbsqueeze: true,
  showadxbg: true,
  showadxcandles: true,
  showbb: 'BB',
  showmtfma: false,
  showqqedot: true,
  showbg: true,
  qqeline: false,
  showpp: false,
  showsr: false,
  showBaseline: true,
  showSsl1: false,
  showssl2: false,
  showAtr: false,
  atrlen: 14,
  mult: 1.5,
  smoothing: 'WMA',
  maType: 'HMA',
  len: 55,
  ssl2Type: 'JMA',
  len2: 5,
  ssl3Type: 'HMA',
  len3: 15,
  src: 'close',
  kidiv: 1,
  jurikPhase: 3,
  jurikPower: 1,
  volatilityLookback: 10,
  beta: 0.8,
  feedback: false,
  z: 0.5,
  ssfLength: 20,
  ssfPoles: 2,
  useTrueRange: true,
  multy: 0.2,
  showColorBar: true,
  atrCrit: 0.9,
  rsiPeriod: 6,
  sf: 5,
  qqe: 3,
  threshHold: 3,
  qqsrc: 'close',
  qqeBbLength: 50,
  qqmult: 0.35,
  rsiPeriod2: 6,
  sf2: 5,
  qqe2: 1.61,
  threshHold2: 3,
  src2: 'close',
  sensitivity: 150,
  fastLength: 20,
  slowLength: 40,
  channelLength: 20,
  waeMult: 2.0,
  adxl: 14,
  adxs: 14,
  adxtreshold: 20,
  showhulltrend: false,
  showtrend: false,
  showstc: true,
  mtf4: '',
  stf4: '',
  maLength4: 110,
  stFactor: 3,
  stLength: 10,
  macdFast: 5,
  macdSlow: 50,
  macdSignal: 30,
  bbMaType: 'SMA',
  kLength: 20,
  kN: 2,
  bbLength: 20,
  bbN: 2,
  mtf1: '',
  mtf2: '',
  maLength1: 20,
  maLength2: 50,
  rsiLength: 7,
  rsiSmaLength: 18,
  cciLength: 40,
  cciSrc: 'hlc3',
  overBought: 80,
  overSold: 20,
  stochLength: 14,
  stochK: 3,
  stochD: 3,
  psarStart: 0.02,
  psarIncrement: 0.02,
  psarMaximum: 0.2,
  prd: 10,
  ppsrc: 'High/Low',
  maxnumpp: 20,
  channelW: 10,
  maxnumsr: 5,
  minStrength: 2,
  labelloc: 20,
  linestyle: 'Solid',
  linewidth: 1,
  resistancecolor: RED,
  supportcolor: LIME,
};

const G_SIG = 'Settings: Signals';
const G_TAB = 'Strategy: Table Strength';
const G_IND = 'Settings: Indicators';
const G_CAN = 'Candles';
const G_ATR = 'Settings: ATR';
const G_SSL = 'Settings: SSL';
const G_QQE = 'Settings:QQE-MOD';
const G_WAE = 'Indicators: Waddah Attar Explosion';
const G_FIL = 'Settings: Filters';
const G_SR = 'S/R Settings';
const MA_ALL = ['ZLSMA', 'SMA', 'EMA', 'DEMA', 'TEMA', 'LSMA', 'WMA', 'MF', 'VAMA', 'TMA', 'HMA', 'JMA', 'Kijun v2', 'EDSMA', 'McGinley'];

export const inputConfig: InputConfig[] = [
  {
    id: 'sslsignals', type: 'string', title: 'Buy Sell Signals', defval: 'SSL-HYBRID',
    options: ['SSL-HYBRID', 'SSL+QQE+WAE', 'SSL-HYBRID+SuperTrend'], group: G_SIG, inline: 'Filter',
  },
  {
    id: 'strend', type: 'string', title: 'Filter Buy Sell Signals', defval: 'NO-FILTER',
    options: ['NO-FILTER', 'SUPERTREND', 'HULL'], group: G_SIG, inline: 'Filter',
  },
  { id: 'squeezesignalfilter', type: 'bool', title: 'Remove Alerts & Signals at BB-Squeeze', defval: false, group: G_SIG, inline: 'Filter' },
  { id: 'adxsignalfilter', type: 'bool', title: 'Remove Alerts & Signals at LOW ADX/SIDEWAYS', defval: false, group: G_SIG, inline: 'Filter' },
  { id: 'strengthtreshold', type: 'int', title: 'Table Alert Strength', defval: 8, group: G_TAB, inline: 'table' },
  { id: 'showtable', type: 'bool', title: 'Show SSL Table', defval: true, group: G_TAB, inline: 'table' },
  { id: 'merget', type: 'bool', title: 'Merge SSL Table', defval: true, group: G_TAB, inline: 'table' },
  { id: 'showtable2', type: 'bool', title: 'Show Strength Table', defval: true, group: G_TAB, inline: 'table' },
  { id: 'showEma200', type: 'bool', title: 'show Ema200 with ADX', defval: false, group: G_IND },
  { id: 'showbbsqueeze', type: 'bool', title: 'Show Bollinger Squeeze', defval: true, group: G_IND },
  { id: 'showadxbg', type: 'bool', title: 'show Low ADX as Background', defval: true, group: G_CAN },
  { id: 'showadxcandles', type: 'bool', title: 'show Low ADX Candles', defval: true, group: G_CAN },
  { id: 'showbb', type: 'string', title: 'Show Bollinger/Keltner Band', defval: 'BB', options: ['--', 'BB', 'Keltner'], group: G_IND },
  { id: 'showmtfma', type: 'bool', title: 'Show MTF EMA', defval: false, group: G_IND },
  { id: 'showqqedot', type: 'bool', title: 'Show QQE MOD Support', defval: true, group: G_IND },
  { id: 'showbg', type: 'bool', title: 'QQE Signal Background', defval: true, group: G_IND },
  { id: 'qqeline', type: 'bool', title: 'QQE Line', defval: false, group: G_IND },
  { id: 'showpp', type: 'bool', title: 'Show Pivot Points', defval: false, group: G_IND },
  { id: 'showsr', type: 'bool', title: 'Show Support Resistance', defval: false, group: G_IND },
  { id: 'showBaseline', type: 'bool', title: 'Show SSL Baseline', defval: true, group: 'SSL' },
  { id: 'showSsl1', type: 'bool', title: 'Show SSL1 Support', defval: false, group: 'SSL' },
  { id: 'showssl2', type: 'bool', title: 'Show SSL2 Support', defval: false, group: 'SSL' },
  { id: 'showAtr', type: 'bool', title: 'Show ATR bands', defval: false, group: G_ATR },
  { id: 'atrlen', type: 'int', title: 'ATR Period', defval: 14, group: G_ATR },
  { id: 'mult', type: 'float', title: 'ATR Multi', defval: 1.5, step: 0.1, group: G_ATR },
  { id: 'smoothing', type: 'string', title: 'ATR Smoothing', defval: 'WMA', options: ['RMA', 'SMA', 'EMA', 'WMA'], group: G_ATR },
  { id: 'maType', type: 'string', title: 'SSL1 / Baseline Type', defval: 'HMA', options: MA_ALL, group: G_SSL },
  { id: 'len', type: 'int', title: 'SSL1 / Baseline Length', defval: 55, group: G_SSL },
  {
    id: 'ssl2Type', type: 'string', title: 'SSL2 / Continuation Type', defval: 'JMA',
    options: ['SMA', 'EMA', 'DEMA', 'TEMA', 'WMA', 'MF', 'VAMA', 'TMA', 'HMA', 'JMA', 'McGinley'], group: G_SSL,
  },
  { id: 'len2', type: 'int', title: 'SSL 2 Length', defval: 5, group: G_SSL },
  {
    id: 'ssl3Type', type: 'string', title: 'EXIT Type', defval: 'HMA',
    options: ['DEMA', 'TEMA', 'LSMA', 'VAMA', 'TMA', 'HMA', 'JMA', 'Kijun v2', 'McGinley', 'MF'], group: G_SSL,
  },
  { id: 'len3', type: 'int', title: 'EXIT Length', defval: 15 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'kidiv', type: 'int', title: 'Kijun MOD Divider', defval: 1, max: 4, group: G_SSL },
  { id: 'jurikPhase', type: 'int', title: '* Jurik (JMA) Only - Phase', defval: 3, group: G_SSL },
  { id: 'jurikPower', type: 'int', title: '* Jurik (JMA) Only - Power', defval: 1, group: G_SSL },
  { id: 'volatilityLookback', type: 'int', title: '* Volatility Adjusted (VAMA) Only - Volatility lookback length', defval: 10, group: G_SSL },
  { id: 'beta', type: 'float', title: 'Modular Filter, General Filter Only - Beta', defval: 0.8, min: 0, max: 1, step: 0.1, group: G_SSL },
  { id: 'feedback', type: 'bool', title: 'Modular Filter Only - Feedback', defval: false, group: G_SSL },
  { id: 'z', type: 'float', title: 'Modular Filter Only - Feedback Weighting', defval: 0.5, min: 0, max: 1, step: 0.1, group: G_SSL },
  { id: 'ssfLength', type: 'int', title: 'EDSMA - Super Smoother Filter Length', defval: 20, min: 1, group: G_SSL },
  // input.int(2, options = [2, 3])
  { id: 'ssfPoles', type: 'int', title: 'EDSMA - Super Smoother Filter Poles', defval: 2, min: 2, max: 3, group: G_SSL },
  { id: 'useTrueRange', type: 'bool', title: 'useTrueRange', defval: true },
  { id: 'multy', type: 'float', title: 'Base Channel Multiplier', defval: 0.2, step: 0.05, group: G_SSL },
  { id: 'showColorBar', type: 'bool', title: 'Color Bars', defval: true, group: G_CAN },
  { id: 'atrCrit', type: 'float', title: 'Continuation ATR Criteria', defval: 0.9, step: 0.1, group: G_SSL },
  { id: 'rsiPeriod', type: 'int', title: 'RSI Length', defval: 6, group: G_QQE },
  { id: 'sf', type: 'int', title: 'RSI Smoothing', defval: 5, group: G_QQE },
  { id: 'qqe', type: 'float', title: 'Fast QQE Factor', defval: 3, step: 0.1, group: G_QQE },
  { id: 'threshHold', type: 'int', title: 'Thresh-hold', defval: 3, group: G_QQE },
  { id: 'qqsrc', type: 'source', title: 'RSI Source', defval: 'close', group: G_QQE },
  { id: 'qqeBbLength', type: 'int', title: 'Bollinger Length', defval: 50, min: 1, group: G_QQE },
  { id: 'qqmult', type: 'float', title: 'BB Multiplier', defval: 0.35, min: 0.001, max: 5, step: 0.1, group: G_QQE },
  { id: 'rsiPeriod2', type: 'int', title: 'RSI Length', defval: 6, group: G_QQE },
  { id: 'sf2', type: 'int', title: 'RSI Smoothing', defval: 5, group: G_QQE },
  { id: 'qqe2', type: 'float', title: 'Fast QQE2 Factor', defval: 1.61, step: 0.1, group: G_QQE },
  { id: 'threshHold2', type: 'int', title: 'Threshold', defval: 3, group: G_QQE },
  { id: 'src2', type: 'source', title: 'RSI Source', defval: 'close', group: G_QQE },
  { id: 'sensitivity', type: 'int', title: 'Sensitivity', defval: 150, group: G_WAE },
  { id: 'fastLength', type: 'int', title: 'FastEMA Length', defval: 20, group: G_WAE },
  { id: 'slowLength', type: 'int', title: 'SlowEMA Length', defval: 40, group: G_WAE },
  { id: 'channelLength', type: 'int', title: 'BB Channel Length', defval: 20, group: G_WAE },
  { id: 'waeMult', type: 'float', title: 'BB Stdev Multiplier', defval: 2.0, group: G_WAE },
  { id: 'adxl', type: 'int', title: 'ADX/DMI length', defval: 14, group: 'Settings: ADX' },
  { id: 'adxs', type: 'int', title: 'ADX/DMI smooth length', defval: 14, group: 'Settings: ADX' },
  { id: 'adxtreshold', type: 'int', title: 'ADX Treshold', defval: 20, group: 'Settings: ADX' },
  { id: 'showhulltrend', type: 'bool', title: 'Show HULL MTF', defval: false, group: G_FIL, inline: 'HULL' },
  { id: 'showtrend', type: 'bool', title: 'Show Supertrend', defval: false, group: G_FIL, inline: 'Supertrend' },
  { id: 'showstc', type: 'bool', title: 'SuperTrend Color/Hull Color', defval: true, group: G_FIL, inline: 'Supertrend' },
  { id: 'mtf4', type: 'timeframe', title: 'HULL TIME FRAME', defval: '', group: G_FIL, inline: 'HULL' },
  { id: 'stf4', type: 'timeframe', title: 'SUPER TREND TIME FRAME', defval: '', group: G_FIL, inline: 'Supertrend' },
  { id: 'maLength4', type: 'int', title: 'Hull TREND Length\n[Scalping:55,Floating S/R:100-300,]', defval: 110, group: G_FIL, inline: 'HULL' },
  { id: 'stFactor', type: 'float', title: 'Supertrend ATR Multiplier', defval: 3, step: 0.1, group: G_FIL, inline: 'Supertrend' },
  { id: 'stLength', type: 'int', title: 'Supertrend Length', defval: 10, group: G_FIL, inline: 'Supertrend' },
  { id: 'macdFast', type: 'int', title: 'FAST MACD', defval: 5, group: 'Settings: MACD' },
  { id: 'macdSlow', type: 'int', title: 'SLOW MACD', defval: 50, group: 'Settings: MACD' },
  { id: 'macdSignal', type: 'int', title: 'Signal', defval: 30, group: 'Settings: MACD' },
  { id: 'bbMaType', type: 'string', title: 'Bollinger MA type', defval: 'SMA', options: ['EMA', 'HMA', 'SMA'] },
  { id: 'kLength', type: 'int', title: 'Keltner Length', defval: 20 },
  { id: 'kN', type: 'int', title: 'Keltner Deviation', defval: 2 },
  { id: 'bbLength', type: 'int', title: 'Bollinger Length', defval: 20 },
  { id: 'bbN', type: 'int', title: 'Bollinger Deviation', defval: 2 },
  { id: 'mtf1', type: 'timeframe', title: 'EMA MTF1', defval: '', group: 'Settings: EMA' },
  { id: 'mtf2', type: 'timeframe', title: 'EMA MTF2', defval: '', group: 'Settings: EMA' },
  { id: 'maLength1', type: 'int', title: 'EMA Period-1', defval: 20, group: 'Settings: EMA' },
  { id: 'maLength2', type: 'int', title: 'EMA Period-2', defval: 50, group: 'Settings: EMA' },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 7, min: 1, group: 'RSI' },
  { id: 'rsiSmaLength', type: 'int', title: 'RSI SMA Length', defval: 18, min: 1, group: 'RSI' },
  { id: 'cciLength', type: 'int', title: 'CCI Length', defval: 40, min: 1, group: 'CCI' },
  { id: 'cciSrc', type: 'source', title: 'CCI Source', defval: 'hlc3', group: 'CCI' },
  { id: 'overBought', type: 'int', title: 'Stochastic OverBought Level', defval: 80, group: 'stochastic' },
  { id: 'overSold', type: 'int', title: 'Stochastic OverBought Level', defval: 20, group: 'stochastic' },
  { id: 'stochLength', type: 'int', title: 'Stochastic Length', defval: 14, min: 1, group: 'stochastic' },
  { id: 'stochK', type: 'int', title: 'Stochastic Smooth Length K', defval: 3, min: 1, group: 'stochastic' },
  { id: 'stochD', type: 'int', title: 'Stochastic Deviation Length D', defval: 3, min: 1, group: 'stochastic' },
  { id: 'psarStart', type: 'float', title: 'PSAR Start', defval: 0.02, step: 0.001, group: 'PSAR' },
  { id: 'psarIncrement', type: 'float', title: 'PSAR Increment', defval: 0.02, step: 0.001, group: 'PSAR' },
  { id: 'psarMaximum', type: 'float', title: 'PSAR Maximum', defval: 0.2, step: 0.01, group: 'PSAR' },
  { id: 'prd', type: 'int', title: 'Pivot Period', defval: 10, min: 4, max: 30, group: G_SR },
  { id: 'ppsrc', type: 'string', title: 'Source', defval: 'High/Low', options: ['High/Low', 'Close/Open'], group: G_SR },
  { id: 'maxnumpp', type: 'int', title: ' Maximum Number of Pivot', defval: 20, min: 5, max: 100, group: G_SR },
  { id: 'channelW', type: 'int', title: 'Maximum Channel Width %', defval: 10, min: 1, group: G_SR },
  { id: 'maxnumsr', type: 'int', title: ' Maximum Number of S/R', defval: 5, min: 1, max: 10, group: G_SR },
  { id: 'minStrength', type: 'int', title: ' Minimum Strength', defval: 2, min: 1, max: 10, group: G_SR },
  {
    id: 'labelloc', type: 'int', title: 'Label Location', defval: 20, group: G_SR,
    tooltip: 'Positive numbers reference future bars, negative numbers reference histical bars',
  },
  { id: 'linestyle', type: 'string', title: 'Line Style', defval: 'Solid', options: ['Solid', 'Dotted', 'Dashed'], group: G_SR },
  { id: 'linewidth', type: 'int', title: 'Line Width', defval: 1, min: 1, max: 4, group: G_SR },
  { id: 'resistancecolor', type: 'color', title: 'Resistance Color', defval: RED, group: G_SR },
  { id: 'supportcolor', type: 'color', title: 'Support Color', defval: LIME, group: G_SR },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SSL1', color: BULL, lineWidth: 3 },
  { id: 'plot1', title: 'SSL2', color: GREEN, lineWidth: 2, style: 'circles' },
  { id: 'plot2', title: '+ATR', color: 'rgba(0, 255, 0, 0.2)', lineWidth: 2 },
  { id: 'plot3', title: '-ATR', color: 'rgba(255, 0, 0, 0.2)', lineWidth: 2 },
  { id: 'plot4', title: 'QQE Line', color: BULL, lineWidth: 2 },
  { id: 'plot5', title: 'EMA200', color: LIME, lineWidth: 3 },
  { id: 'plot6', title: 'MTF HULL TREND', color: '#00ff00', lineWidth: 4 },
  { id: 'plot7', title: 'Supertrend Up', color: 'rgba(0, 195, 255, 0.5)', lineWidth: 4, style: 'linebr' },
  { id: 'plot8', title: 'Supertrend Down', color: 'rgba(255, 0, 98, 0.5)', lineWidth: 4, style: 'linebr' },
  { id: 'plot9', title: ' Upper Band', color: PURPLE, lineWidth: 1, style: 'linebr' },
  { id: 'plot10', title: ' Lower Band', color: PURPLE, lineWidth: 1, style: 'linebr' },
  { id: 'plot11', title: 'Squeezed Upper Band', color: 'transparent', lineWidth: 1, style: 'linebr' },
  { id: 'plot12', title: 'Squeezed Lower Band', color: 'transparent', lineWidth: 1, style: 'linebr' },
  { id: 'plot13', title: 'MTF EMA-1', color: PURPLE, lineWidth: 1 },
  { id: 'plot14', title: 'MTF EMA-2', color: 'rgba(255, 0, 0, 0.4)', lineWidth: 1 },
  { id: 'plot15', title: 'MA Baseline', color: BULL, lineWidth: 4 },
];

export const metadata = {
  title: 'SSL HYBRID ADVANCED',
  shortTitle: 'SSL HYBRID ADVANCED',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** Pine nz(x, y): na and the infinities are replaced */
const nz = (x: number, y = 0) => (Number.isFinite(x) ? x : y);
/** Pine bool(x) of a float: false for na and 0 */
const bool = (x: number) => Number.isFinite(x) && x !== 0;
/** Pine na(): na and the infinities */
const isNa = (x: number) => !Number.isFinite(x);

type Point = { time: number; value: number; color?: string };

/** The bars of a timeframe and the place of the chart bars in it (request.security without lookahead) */
interface Timeframe {
  htf: Bar[];
  group: number[];
  latest: number[];
  chart: boolean;
}

function timeframeOf(bars: Bar[], tf: string, context?: ChartContext): Timeframe {
  const chartTf = chartTimeframe(bars, context);
  if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) {
    const own = bars.map((_b, i) => i);
    return { htf: bars, group: own, latest: own, chart: true };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`SSL HYBRID Advanced: the timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
  }
  const { htf, group, latest, first } = higherTimeframeBars(bars, tf, context);
  return { htf: htf.map((b, k) => ({ ...b, time: bars[first[k]].time })), group, latest, chart: false };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SslHybridAdvancedInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'barColors' | 'bgColors' | 'tables' | 'labels' | 'lines'> & {
  markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[]; tables: TableData[];
  labels: LabelData[]; lines: LineDrawingData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));
  const S = (a: number[]) => Series.fromArray(bars, a);
  const open = bars.map((b) => b.open);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const prev = (a: number[], i: number, k = 1) => (i - k >= 0 ? a[i - k] : NaN);
  const ema = (src: number[], len: number) => A(ta.ema(S(src), len));
  const sma = (src: number[], len: number) => A(ta.sma(S(src), len));
  const wma = (src: number[], len: number) => A(ta.wma(S(src), len));
  const stdev = (src: number[], len: number) => A(ta.stdev(S(src), len));
  const crossover = (a: number[], b: number[]) => A(ta.crossover(S(a), S(b))).map((v) => v === 1);
  const crossunder = (a: number[], b: number[]) => A(ta.crossunder(S(a), S(b))).map((v) => v === 1);
  const cross = (a: number[], b: number[]) => A(ta.cross(S(a), S(b))).map((v) => v === 1);

  // ---- ATR of ma_function(ta.tr(true), atrlen)
  const tr = ta.tr(bars, true);
  const atrSlen = A(cfg.smoothing === 'RMA' ? ta.rma(tr, cfg.atrlen)
    : cfg.smoothing === 'SMA' ? ta.sma(tr, cfg.atrlen)
      : cfg.smoothing === 'EMA' ? ta.ema(tr, cfg.atrlen) : ta.wma(tr, cfg.atrlen));
  const upperBand = atrSlen.map((v, i) => v * cfg.mult + close[i]);
  const lowerBand = atrSlen.map((v, i) => close[i] - v * cfg.mult);

  // ---- ma(type, src, len): one call site per call
  const superSmoother = (src: number[]): number[] => {
    const PI = 2 * Math.asin(1);
    const out: number[] = new Array(n);
    if (cfg.ssfPoles === 2) {
      const arg = (Math.sqrt(2) * PI) / cfg.ssfLength;
      const a1 = Math.exp(-arg);
      const b1 = 2 * a1 * Math.cos(arg);
      const c2 = b1;
      const c3 = -Math.pow(a1, 2);
      const c1 = 1 - c2 - c3;
      for (let i = 0; i < n; i++) out[i] = c1 * src[i] + c2 * nz(prev(out, i)) + c3 * nz(prev(out, i, 2));
    } else {
      const arg = PI / cfg.ssfLength;
      const a1 = Math.exp(-arg);
      const b1 = 2 * a1 * Math.cos(1.738 * arg);
      const c1 = Math.pow(a1, 2);
      const coef2 = b1 + c1;
      const coef3 = -(c1 + b1 * c1);
      const coef4 = Math.pow(c1, 2);
      const coef1 = 1 - coef2 - coef3 - coef4;
      for (let i = 0; i < n; i++) {
        out[i] = coef1 * src[i] + coef2 * nz(prev(out, i)) + coef3 * nz(prev(out, i, 2)) + coef4 * nz(prev(out, i, 3));
      }
    }
    return out;
  };
  const lowSeries = S(low);
  const highSeries = S(high);
  const ma = (type: MaType, src: number[], len: number): number[] => {
    switch (type) {
      case 'TMA':
        return A(ta.sma(ta.sma(S(src), Math.ceil(len / 2)), Math.floor(len / 2) + 1));
      case 'MF': {
        const out: number[] = new Array(n);
        const alpha = 2 / (len + 1);
        let ts = NaN;
        let b = NaN;
        let c = NaN;
        let os = NaN;
        for (let i = 0; i < n; i++) {
          const a = cfg.feedback ? cfg.z * src[i] + (1 - cfg.z) * nz(ts, src[i]) : src[i];
          const up = alpha * a + (1 - alpha) * nz(b, a);
          b = gt(a, up) ? a : up;
          const dn = alpha * a + (1 - alpha) * nz(c, a);
          c = lt(a, dn) ? a : dn;
          os = eq(a, b) ? 1 : eq(a, c) ? 0 : os;
          const upper = cfg.beta * b + (1 - cfg.beta) * c;
          const lower = cfg.beta * c + (1 - cfg.beta) * b;
          ts = os * upper + (1 - os) * lower;
          out[i] = ts;
        }
        return out;
      }
      case 'LSMA':
        return A(ta.linreg(S(src), len, 0));
      case 'SMA':
        return sma(src, len);
      case 'EMA':
        return ema(src, len);
      case 'DEMA': {
        const e = ema(src, len);
        const e2 = ema(e, len);
        return e.map((v, i) => 2 * v - e2[i]);
      }
      case 'TEMA': {
        const e = ema(src, len);
        const e2 = ema(e, len);
        const e3 = ema(e2, len);
        return e.map((v, i) => 3 * (v - e2[i]) + e3[i]);
      }
      case 'WMA':
        return wma(src, len);
      case 'VAMA': {
        const mid = ema(src, len);
        const dev = S(src.map((v, i) => v - mid[i]));
        const volUp = A(ta.highest(dev, cfg.volatilityLookback));
        const volDown = A(ta.lowest(dev, cfg.volatilityLookback));
        return mid.map((v, i) => v + (volUp[i] + volDown[i]) / 2);
      }
      case 'HMA': {
        // len / 2 is a float in Pine v6 (27.5 for 55): the library takes the integer part of a length
        const half = wma(src, len / 2);
        const full = wma(src, len);
        return wma(half.map((v, i) => 2 * v - full[i]), Math.round(Math.sqrt(len)));
      }
      case 'JMA': {
        const phase = cfg.jurikPhase;
        const phaseRatio = phase < -100 ? 0.5 : phase > 100 ? 2.5 : phase / 100 + 1.5;
        const beta = (0.45 * (len - 1)) / (0.45 * (len - 1) + 2);
        const alpha = Math.pow(beta, cfg.jurikPower);
        const out: number[] = new Array(n);
        let e0 = NaN;
        let e1 = NaN;
        let e2 = NaN;
        let jma = NaN;
        for (let i = 0; i < n; i++) {
          e0 = (1 - alpha) * src[i] + alpha * nz(e0);
          e1 = (src[i] - e0) * (1 - beta) + beta * nz(e1);
          e2 = (e0 + phaseRatio * e1 - nz(jma)) * Math.pow(1 - alpha, 2) + Math.pow(alpha, 2) * nz(e2);
          jma = e2 + nz(jma);
          out[i] = jma;
        }
        return out;
      }
      case 'Kijun v2': {
        // ta.lowest(len) / ta.highest(len): the low and the high of the bars; len / kidiv is a float in Pine v6
        const kl = A(ta.lowest(lowSeries, len));
        const kh = A(ta.highest(highSeries, len));
        const cl = A(ta.lowest(lowSeries, len / cfg.kidiv));
        const ch = A(ta.highest(highSeries, len / cfg.kidiv));
        return kl.map((v, i) => ((v + kh[i]) / 2 + (cl[i] + ch[i]) / 2) / 2);
      }
      case 'McGinley': {
        // mg := na(mg[1]) ? ta.ema(src, len) : mg[1] + (src - mg[1]) / (len * math.pow(src / mg[1], 4))
        // ta.ema only runs on the bars where mg[1] is na: its history is the values of those bars
        const out: number[] = new Array(n);
        const full = ema(src, len);
        const called: number[] = [];
        const calledBars: Bar[] = [];
        let mg = NaN;
        for (let i = 0; i < n; i++) {
          if (isNa(mg)) {
            called.push(src[i]);
            calledBars.push(bars[i]);
            if (called.length === i + 1) mg = full[i];
            else {
              const part = A(ta.ema(Series.fromArray(calledBars, called), len));
              mg = part[part.length - 1];
            }
          } else {
            mg = mg + (src[i] - mg) / (len * Math.pow(src[i] / mg, 4));
          }
          out[i] = mg;
        }
        return out;
      }
      case 'EDSMA': {
        const zeros = src.map((v, i) => v - nz(prev(src, i, 2)));
        const avgZeros = zeros.map((v, i) => (v + prev(zeros, i)) / 2);
        const ssf = superSmoother(avgZeros);
        const sd = stdev(ssf, len);
        const out: number[] = new Array(n);
        let edsma = NaN;
        for (let i = 0; i < n; i++) {
          // stdev != 0 (false for na)
          const scaledFilter = !isNa(sd[i]) && !eq(sd[i], 0) ? ssf[i] / sd[i] : 0;
          const alpha = (5 * Math.abs(scaledFilter)) / len;
          edsma = alpha * src[i] + (1 - alpha) * nz(edsma);
          out[i] = edsma;
        }
        return out;
      }
      case 'ZLSMA': {
        const lsma = A(ta.linreg(S(src), len, 0));
        const lsma2 = A(ta.linreg(S(lsma), len, 0));
        return lsma.map((v, i) => v + (v - lsma2[i]));
      }
      default:
        return new Array(n).fill(0);
    }
  };

  // ---- SSL1 / SSL2 / exit / baseline / Keltner baseline channel
  const emaHigh = ma(cfg.maType, high, cfg.len);
  const emaLow = ma(cfg.maType, low, cfg.len);
  const maHigh = ma(cfg.ssl2Type, high, cfg.len2);
  const maLow = ma(cfg.ssl2Type, low, cfg.len2);
  const exitHigh = ma(cfg.ssl3Type, high, cfg.len3);
  const exitLow = ma(cfg.ssl3Type, low, cfg.len3);
  const bbmc = ma(cfg.maType, close, cfg.len);
  const srcArr = A(getSourceSeries(bars, cfg.src));
  const keltma = ma(cfg.maType, srcArr, cfg.len);
  const range1 = cfg.useTrueRange ? A(ta.tr(bars, false)) : bars.map((b) => b.high - b.low);
  const rangema = ema(range1, cfg.len);
  const upperk = keltma.map((v, i) => v + rangema[i] * cfg.multy);
  const lowerk = keltma.map((v, i) => v - rangema[i] * cfg.multy);
  /** Hlv := close > hi ? 1 : close < lo ? -1 : Hlv[1]; the line is hi while Hlv < 0, else lo */
  const sslLine = (hi: number[], lo: number[]): number[] => {
    const out: number[] = new Array(n);
    let hlv = NaN;
    for (let i = 0; i < n; i++) {
      hlv = gt(close[i], hi[i]) ? 1 : lt(close[i], lo[i]) ? -1 : hlv;
      out[i] = hlv < 0 ? hi[i] : lo[i];
    }
    return out;
  };
  const sslDown = sslLine(emaHigh, emaLow);
  const sslDown2 = sslLine(maHigh, maLow);
  const sslExit = sslLine(exitHigh, exitLow);
  const baseCrossLong = crossover(close, sslExit);
  const baseCrossShort = crossover(sslExit, close);

  // ---- QQE MOD (two sets)
  const qqeOf = (srcType: SourceType, rsiPeriod: number, sf: number, factor: number) => {
    const wilders = rsiPeriod * 2 - 1;
    const rsiMa = A(ta.ema(ta.rsi(getSourceSeries(bars, srcType), rsiPeriod), sf));
    const atrRsi = rsiMa.map((v, i) => Math.abs(prev(rsiMa, i) - v));
    const maAtrRsi = ema(atrRsi, wilders);
    const dar = ema(maAtrRsi, wilders).map((v) => v * factor);
    const longband: number[] = new Array(n);
    const shortband: number[] = new Array(n);
    const fastTL: number[] = new Array(n);
    const crossLong = callsite.cross(); // cross_1 = ta.cross(longband[1], RSIndex)
    const crossShort = callsite.cross(); // ta.cross(RSIndex, shortband[1])
    let trend = NaN;
    for (let i = 0; i < n; i++) {
      const r = rsiMa[i];
      const r1 = prev(rsiMa, i);
      const lb1 = prev(longband, i);
      const sb1 = prev(shortband, i);
      const newShort = r + dar[i];
      const newLong = r - dar[i];
      longband[i] = gt(r1, lb1) && gt(r, lb1) ? Math.max(lb1, newLong) : newLong;
      shortband[i] = lt(r1, sb1) && lt(r, sb1) ? Math.min(sb1, newShort) : newShort;
      const cross1 = crossLong(lb1, r);
      trend = crossShort(r, sb1) ? 1 : cross1 ? -1 : nz(trend, 1);
      fastTL[i] = trend === 1 ? longband[i] : shortband[i];
    }
    return { rsiMa, fastTL };
  };
  const q1 = qqeOf(cfg.qqsrc, cfg.rsiPeriod, cfg.sf, cfg.qqe);
  const rsiMa = q1.rsiMa;
  const fastTL = q1.fastTL;
  const tl50 = fastTL.map((v) => v - 50);
  const qBasis = sma(tl50, cfg.qqeBbLength);
  const qDev = stdev(tl50, cfg.qqeBbLength).map((v) => cfg.qqmult * v);
  const qUpper = qBasis.map((v, i) => v + qDev[i]);
  const qLower = qBasis.map((v, i) => v - qDev[i]);
  const q2 = qqeOf(cfg.src2, cfg.rsiPeriod2, cfg.sf2, cfg.qqe2);
  const rsiMa2 = q2.rsiMa;
  const fastTL2 = q2.fastTL;
  const qqeLine = cfg.qqeline ? ema(close.map((c, i) => c + (fastTL2[i] - 50) / 10000), 5) : null;

  // ---- Waddah Attar Explosion
  const close1 = close.map((_c, i) => prev(close, i));
  const macdOf = (src: number[]) => {
    const f = ema(src, cfg.fastLength);
    const s = ema(src, cfg.slowLength);
    return f.map((v, i) => v - s[i]);
  };
  const m0 = macdOf(close);
  const m1 = macdOf(close1);
  const t1 = m0.map((v, i) => (v - m1[i]) * cfg.sensitivity);
  const bbUpperOf = () => {
    const basis = sma(close, cfg.channelLength);
    const dev = stdev(close, cfg.channelLength);
    return basis.map((v, i) => v + cfg.waeMult * dev[i]);
  };
  const bbLowerOf = () => {
    const basis = sma(close, cfg.channelLength);
    const dev = stdev(close, cfg.channelLength);
    return basis.map((v, i) => v - cfg.waeMult * dev[i]);
  };
  const waeUp = bbUpperOf();
  const waeLo = bbLowerOf();
  const e1 = waeUp.map((v, i) => v - waeLo[i]);

  // ---- ADX: request.security(syminfo.tickerid, '', ta.dmi(adxl, adxs)) is the chart series
  const [plusS, minusS, adxS] = ta.dmi(bars, cfg.adxl, cfg.adxs);
  const plus = A(plusS);
  const minus = A(minusS);
  const adx = A(adxS);
  const em200 = A(ta.ema(S(open), 200));
  const diCross = cross(plus, minus);
  const diCrossover = crossover(plus, minus);
  const diCrossunder = callsite.crossunder(); // in the else branch of the ternary: runs when the crossover is false

  // ---- Hull trend and Supertrend of their timeframes
  const tfHull = timeframeOf(bars, cfg.mtf4, chart);
  const hullHtf = A(ta.hma(Series.fromArray(tfHull.htf, tfHull.htf.map((b) => b.close)), cfg.maLength4));
  const ma4 = tfHull.chart ? hullHtf : mapToChart(hullHtf, tfHull.group, tfHull.latest, false, true);
  const tfSt = timeframeOf(bars, cfg.stf4, chart);
  const [stS, dirS] = ta.supertrend(tfSt.htf, cfg.stFactor, cfg.stLength);
  const stHtf = A(stS);
  const dirHtf = A(dirS);
  const supertrend = tfSt.chart ? stHtf : mapToChart(stHtf, tfSt.group, tfSt.latest, false, false);
  const direction = tfSt.chart ? dirHtf : mapToChart(dirHtf, tfSt.group, tfSt.latest, false, false);

  // ---- MACD
  const [macdS, signalS] = ta.macd(S(close), cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
  const macdLine = A(macdS);
  const signalLine = A(signalS);
  const macdUp = crossover(macdLine, signalLine);
  const macdDn = crossunder(macdLine, signalLine);

  // ---- Bollinger / Keltner
  const maOfClose = (len: number) => (cfg.bbMaType === 'EMA' ? ema(close, len)
    : cfg.bbMaType === 'HMA' ? A(ta.hma(S(close), len)) : sma(close, len));
  const kma = maOfClose(cfg.kLength);
  const atrK = A(ta.atr(bars, cfg.kLength));
  const kUpper = kma.map((v, i) => v + cfg.kN * atrK[i]);
  const kLower = kma.map((v, i) => v - cfg.kN * atrK[i]);
  const bma = maOfClose(cfg.bbLength);
  const sdClose = stdev(close, cfg.bbLength);
  const bbUpper = bma.map((v, i) => v + cfg.bbN * sdClose[i]);
  const bbLower = bma.map((v, i) => v - cfg.bbN * sdClose[i]);
  const bbMiddle = bma;
  const squeeze = bbUpper.map((v, i) => le(v, kUpper[i]) && ge(bbLower[i], kLower[i]));

  // ---- EMAs of their timeframes (gaps on)
  const emaOfTf = (tf: string, len: number) => {
    const t = timeframeOf(bars, tf, chart);
    const v = A(ta.ema(Series.fromArray(t.htf, t.htf.map((b) => b.close)), len));
    return t.chart ? v : mapToChart(v, t.group, t.latest, false, true);
  };
  const ma1 = emaOfTf(cfg.mtf1, cfg.maLength1);
  const ma2 = emaOfTf(cfg.mtf2, cfg.maLength2);
  const emaUp = crossover(ma1, ma2);
  const emaDn = crossunder(ma1, ma2);

  // ---- rsi(), cci(), sto() of the tables
  const chg = A(ta.change(S(close)));
  const rUp = A(ta.rma(S(chg.map((v) => (isNaN(v) ? NaN : Math.max(v, 0)))), cfg.rsiLength));
  const rDown = A(ta.rma(S(chg.map((v) => (isNaN(v) ? NaN : -Math.min(v, 0)))), cfg.rsiLength));
  const rsiT = rUp.map((u, i) => (eq(rDown[i], 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / rDown[i])));
  const mr = ema(ema(ema(rsiT, cfg.rsiSmaLength), cfg.rsiSmaLength), cfg.rsiSmaLength);
  const cciSrc = A(getSourceSeries(bars, cfg.cciSrc));
  const ccima = sma(cciSrc, cfg.cciLength);
  const cciDev = A(ta.dev(S(cciSrc), cfg.cciLength));
  const cciV = cciSrc.map((v, i) => (v - ccima[i]) / (0.015 * cciDev[i]));
  const stK = sma(A(ta.stoch(S(close), S(high), S(low), cfg.stochLength)), cfg.stochK);
  const stD = sma(stK, cfg.stochD);
  const stCo = crossover(stK, stD);
  const stCu = crossunder(stK, stD);
  const psar = A(ta.sar(bars, cfg.psarStart, cfg.psarIncrement, cfg.psarMaximum));
  const emaColUnder = callsite.crossunder(); // emacol: ta.crossunder in the else branch
  const emaColnUnder = callsite.crossunder(); // emacoln: ta.crossunder in the else branch
  // strendup = direction < 0 and bool(ta.change(direction)): the change only runs when direction < 0 (lazy `and`)
  const changeSite = () => {
    let last = NaN;
    let called = false;
    return (x: number) => {
      const r = called ? x - last : NaN;
      last = x;
      called = true;
      return r;
    };
  };
  const stUpChange = changeSite();
  const stDnChange = changeSite();
  const sslup = crossover(close, sslExit);
  const ssldn = crossover(sslExit, close);
  const sslupSt = crossover(close, sslExit);
  const ssldnSt = crossover(sslExit, close);

  // ---- Pivots and support / resistance
  const prd = cfg.prd;
  const src1 = cfg.ppsrc === 'High/Low' ? high : bars.map((b) => Math.max(b.close, b.open));
  const src12 = cfg.ppsrc === 'High/Low' ? low : bars.map((b) => Math.min(b.close, b.open));
  const ph = A(ta.pivothigh(S(src1), prd, prd));
  const pl = A(ta.pivotlow(S(src12), prd, prd));
  const prdHighest = A(ta.highest(highSeries, 300));
  const prdLowest = A(ta.lowest(lowSeries, 300));
  const mintick = mintickOf(chart);
  const lstyle = cfg.linestyle === 'Dashed' ? 'dashed' : cfg.linestyle === 'Solid' ? 'solid' : 'dotted';
  resetDrawings();
  const pivotvals: number[] = [];
  let srUp: number[] = [];
  let srDn: number[] = [];
  const srLines: Array<Line | null> = new Array(11).fill(null);
  const srLabels: Array<Label | null> = new Array(11).fill(null);
  const labelY = (lb: Label | null) => (lb ? label.get_y(lb) : NaN);
  const lineY1 = (ln: Line | null) => (ln ? line.get_y1(ln) : NaN);

  // ---- Outputs
  const plotIds = Array.from({ length: 16 }, (_v, k) => `plot${k}`);
  const plots: Record<string, Point[]> = Object.fromEntries(plotIds.map((id) => [id, [] as Point[]]));
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const C = (c: string, t: number) => String(color.new(c, t));
  const bullC = C(BULL, 0);
  const bearC = C(BEAR, 0);
  const grayC = C(GRAY, 0);
  const atrUpC = C(String(color.rgb(0, 255, 0, 50)), 80);
  const atrDnC = C(String(color.rgb(255, 0, 0, 50)), 80);
  const squeezeFill: string[] = [];
  // qqeGreenBar[1] / qqeRedBar[1]
  let prevGreen = false;
  let prevRed = false;
  let last = {
    exitsig: grayC, colorBar: grayC, colorPsar: grayC, qqecolor: grayC, qqedot: grayC, sttrend: grayC, adxcol: grayC,
    emacol: grayC, stocol: grayC, rsicol: grayC, ccicol: grayC, waecol: grayC, strength: 0,
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const t = bars[i].time;
    const c = close[i];
    const colorBar = gt(c, upperk[i]) ? bullC : lt(c, lowerk[i]) ? bearC : grayC;
    const colorSsl1 = gt(c, sslDown[i]) ? bullC : lt(c, sslDown[i]) ? bearC : 'transparent';

    // plotarrow(codiff, colorup = color.new(#00c3ff, 20), colordown = color.new(#ff0062, 20), title = 'Exit Arrows')
    if (baseCrossLong[i]) markers.push({ time: t, position: 'belowBar', shape: 'arrowUp', color: C(BULL, 20) });
    else if (baseCrossShort[i]) markers.push({ time: t, position: 'aboveBar', shape: 'arrowDown', color: C(BEAR, 20) });

    // SSL2 continuation
    const upperHalf = atrSlen[i] * cfg.atrCrit + c;
    const lowerHalf = c - atrSlen[i] * cfg.atrCrit;
    const sellAtr = gt(upperHalf, sslDown2[i]) && lt(c, bbmc[i]) && lt(c, sslDown2[i]);
    const buyAtr = lt(lowerHalf, sslDown2[i]) && gt(c, bbmc[i]) && gt(c, sslDown2[i]);
    const atrFill = buyAtr ? C(GREEN, 0) : sellAtr ? C(PURPLE, 0) : C(WHITE, 0);

    plots.plot0.push({ time: t, value: cfg.showSsl1 ? sslDown[i] : NaN, color: colorSsl1 });
    plots.plot1.push({ time: t, value: cfg.showssl2 ? sslDown2[i] : NaN, color: atrFill });
    plots.plot2.push({ time: t, value: cfg.showAtr ? upperBand[i] : NaN, color: atrUpC });
    plots.plot3.push({ time: t, value: cfg.showAtr ? lowerBand[i] : NaN, color: atrDnC });

    // QQE
    const r50 = rsiMa[i] - 50;
    const r250 = rsiMa2[i] - 50;
    const tl = fastTL[i] - 50;
    const qqcolr = lt(tl, r50) ? C('#002734', 0) : gt(tl, r50) ? C('#3a0016', 0) : null;
    if (cfg.showbg && qqcolr) bgColors.push({ time: t, color: qqcolr });
    const greenbar1 = gt(r250, cfg.threshHold2);
    const greenbar2 = gt(r50, qUpper[i]);
    const redbar1 = lt(r250, 0 - cfg.threshHold2);
    const redbar2 = lt(r50, qLower[i]);
    const qqecolor = greenbar1 && greenbar2 && gt(r250, cfg.threshHold2) ? bullC
      : redbar1 && redbar2 && lt(r250, 0 - cfg.threshHold2) ? bearC : grayC;
    plots.plot4.push({ time: t, value: qqeLine ? qqeLine[i] : NaN, color: qqecolor });
    const qqxcolor = lt(tl, r50) ? C(GREEN, 0) : gt(tl, r50) ? C(RED, 0) : 'transparent';

    // WAE
    const trendUp = ge(t1[i], 0) ? t1[i] : 0;
    const trendDown = lt(t1[i], 0) ? -1 * t1[i] : 0;
    const waeBuy = gt(trendUp, 0) && gt(trendUp, e1[i]);
    const waeSell = gt(trendDown, 0) && gt(trendDown, e1[i]);
    const waecol = waeBuy ? bullC : waeSell ? bearC : grayC;

    // ADX
    const adxOver = gt(adx[i], cfg.adxtreshold);
    const adxem200color = adxOver && gt(plus[i], minus[i]) ? C(LIME, 0) : adxOver && lt(plus[i], minus[i]) ? C(MAROON, 0) : C(YELLOW, 0);
    plots.plot5.push({ time: t, value: cfg.showEma200 ? em200[i] : NaN, color: adxem200color });
    const adxcross = diCrossover[i] ? C(BLUE, 0) : diCrossunder(plus[i], minus[i]) ? C(RED, 0) : null;
    // plotshape(ta.cross(plus, minus) ? em200 : na, color = adxcross, location = location.absolute, style = shape.diamond)
    if (diCross[i] && !isNa(em200[i]) && adxcross) {
      markers.push({ time: t, position: 'atPriceMiddle', price: em200[i], shape: 'diamond', color: adxcross, size: 'tiny' });
    }

    // Hull and Supertrend
    const color4 = gt(open[i], ma4[i]) ? C('#00ff00', 0) : lt(open[i], ma4[i]) ? C('#ff0000', 0) : grayC;
    plots.plot6.push({ time: t, value: cfg.showhulltrend ? ma4[i] : NaN, color: color4 });
    const supertrendup = lt(direction[i], 0) ? supertrend[i] : NaN;
    const supertrenddn = gt(direction[i], 0) ? supertrend[i] : NaN;
    const stc = bool(supertrendup) ? C(BULL, 50) : C(BEAR, 50);
    const trendcolor = cfg.showstc ? stc : qqxcolor;
    plots.plot7.push({ time: t, value: cfg.showtrend ? supertrendup : NaN, color: trendcolor });
    plots.plot8.push({ time: t, value: cfg.showtrend ? supertrenddn : NaN, color: trendcolor });

    // MACD crossings: plotshape(ta.crossover(macd, signal) ? close : na, location.belowbar, shape.xcross)
    if (macdUp[i] && bool(c)) markers.push({ time: t, position: 'belowBar', shape: 'xcross', color: C('#00FF00', 20), size: 'tiny' });
    if (macdDn[i] && bool(c)) markers.push({ time: t, position: 'aboveBar', shape: 'xcross', color: C('#ff0000', 0), size: 'tiny' });

    // bgcolor(adx < adxtreshold ? color_bars : na)
    const lowAdx = lt(adx[i], cfg.adxtreshold);
    if (lowAdx && cfg.showadxbg) bgColors.push({ time: t, color: C(PURPLE, 90) });

    // Bollinger / Keltner
    plots.plot9.push({ time: t, value: cfg.showbb === 'BB' ? bbUpper[i] : cfg.showbb === 'Keltner' ? kUpper[i] : NaN, color: C(PURPLE, 0) });
    plots.plot10.push({ time: t, value: cfg.showbb === 'BB' ? bbLower[i] : cfg.showbb === 'Keltner' ? kLower[i] : NaN, color: C(PURPLE, 0) });
    // color = bool(bar_index) ? na : white: white on the first bar only
    const sqColor = i === 0 ? C(WHITE, 0) : 'transparent';
    plots.plot11.push({ time: t, value: squeeze[i] && cfg.showbbsqueeze ? bbUpper[i] : NaN, color: sqColor });
    plots.plot12.push({ time: t, value: squeeze[i] && cfg.showbbsqueeze ? bbLower[i] : NaN, color: sqColor });
    squeezeFill.push(C(PURPLE, 90));

    // EMAs
    const color1 = gt(open[i], ma1[i]) ? C('#00FF00', 60) : lt(open[i], ma1[i]) ? C('#00FF00', 60) : grayC;
    const color2 = gt(open[i], ma2[i]) ? C('#ff0000', 60) : lt(open[i], ma2[i]) ? C('#ff0000', 60) : grayC;
    plots.plot13.push({
      time: t,
      value: cfg.showmtfma ? ma1[i] : cfg.showbb === 'BB' ? bbMiddle[i] : cfg.showbb === 'Keltner' ? bbMiddle[i] : NaN,
      color: cfg.showmtfma && bool(ma1[i]) ? color1 : C(PURPLE, 0),
    });
    plots.plot14.push({ time: t, value: cfg.showmtfma ? ma2[i] : NaN, color: color2 });
    if (emaUp[i] && bool(c)) markers.push({ time: t, position: 'belowBar', shape: 'xcross', color: C('#00FF00', 20), size: 'tiny' });
    if (emaDn[i] && bool(c)) markers.push({ time: t, position: 'aboveBar', shape: 'xcross', color: C('#ff0000', 50), size: 'tiny' });

    // Table votes
    const rsiupdn = gt(rsiT[i], mr[i]) ? 1 : lt(rsiT[i], mr[i]) ? -1 : 0;
    const ccibg = gt(cciV[i], 100) ? 1 : lt(cciV[i], -100) ? -1 : 0;
    const k = stK[i];
    const sup = gt(k, cfg.overBought) || (stCu[i] && gt(k, cfg.overBought));
    const sdn = lt(k, cfg.overSold) || (stCo[i] && lt(k, cfg.overSold));
    const stobg = sup ? 1 : sdn ? -1 : stCo[i] ? 2 : stCu[i] ? -2 : 0;
    const psarDir = lt(psar[i], c) ? 1 : -1;
    const colorPsar = psarDir === 1 ? bullC : bearC;
    const exitsig = gt(c, upperk[i]) && gt(c, bbmc[i]) ? bullC : lt(c, lowerk[i]) && lt(c, bbmc[i]) ? bearC : grayC;
    const qqeGreenBar = greenbar1 && greenbar2;
    const qqeRedBar = redbar1 && redbar2;
    const qqedot = qqeGreenBar && waeBuy ? bullC : qqeRedBar && waeSell ? bearC : grayC;
    const adx20 = gt(adx[i], 20);
    const adxcol = adx20 && gt(plus[i], minus[i]) ? bullC : adx20 && gt(minus[i], plus[i]) ? bearC : grayC;
    const emacol = emaUp[i] || gt(c, ma2[i]) ? bullC
      : emaColUnder(ma1[i], ma2[i]) || lt(c, ma2[i]) ? bearC : grayC;
    const psarn = psarDir === 1 ? 1 : -1;
    const exitsign = gt(c, upperk[i]) && gt(c, 1) ? 1 : lt(c, lowerk[i]) && lt(c, bbmc[i]) ? -1 : 0;
    const qqedotn = qqeGreenBar && waeBuy ? 1 : qqeRedBar && waeSell ? -1 : 0;
    const adxcoln = adx20 && gt(plus[i], minus[i]) ? 1 : adx20 && gt(minus[i], plus[i]) ? -1 : 0;
    const emacoln = emaUp[i] || gt(c, ma2[i]) ? 1 : emaColnUnder(ma1[i], ma2[i]) || lt(c, ma2[i]) ? -1 : 0;
    const waen = waeBuy ? 1 : waeSell ? -1 : 0;
    const stval = lt(direction[i], 0) ? 1 : gt(direction[i], 0) ? -1 : 0;
    const stocol = stobg > 0 ? bullC : stobg < 0 ? bearC : grayC;
    const rsicol = rsiupdn > 0 ? bullC : rsiupdn < 0 ? bearC : grayC;
    const ccicol = ccibg > 0 ? bullC : ccibg < 0 ? bearC : grayC;
    const sttrend = lt(direction[i], 0) ? bullC : gt(direction[i], 0) ? bearC : grayC;

    // Strategy signals
    const qqeBuy = qqeGreenBar && !(i > 0 && prevGreen);
    const qqeSell = qqeRedBar && !(i > 0 && prevRed);
    prevGreen = qqeGreenBar;
    prevRed = qqeRedBar;
    plots.plot15.push({ time: t, value: cfg.showBaseline ? bbmc[i] : NaN, color: colorBar });
    if (cfg.showColorBar) barColors.push({ time: t, color: colorBar });
    if (cfg.showqqedot && qqeGreenBar) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: C('#00ff00', 20), size: 'auto' });
    if (cfg.showqqedot && qqeRedBar) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: C('#ff0000', 20), size: 'auto' });
    const sslBuy = gt(c, upperk[i]) && gt(c, bbmc[i]);
    const sslSell = lt(c, lowerk[i]) && lt(c, bbmc[i]);
    const stratsslupsig = waeBuy && qqeBuy && sslBuy;
    const stratssldnsig = waeSell && qqeSell && sslSell;
    const dir = direction[i];
    const strendup = lt(dir, 0) && bool(stUpChange(dir));
    const strenddn = gt(dir, 0) && bool(stDnChange(dir));
    const sslupst = sslupSt[i] || strendup;
    const ssldnst = ssldnSt[i] || strenddn;
    const hmadirection = gt(c, ma4[i]) ? 1 : lt(c, ma4[i]) ? -1 : 0;
    const sigMode = cfg.sslsignals;
    const pick = (hybrid: boolean, qqeWae: boolean, st: boolean) => (sigMode === 'SSL-HYBRID' ? hybrid
      : sigMode === 'SSL+QQE+WAE' ? qqeWae : st);
    let signalup: boolean;
    if (cfg.strend === 'NO-FILTER') signalup = pick(sslup[i], stratsslupsig, sslupst);
    else if (cfg.strend === 'SUPERTREND' && lt(dir, 0)) signalup = pick(sslup[i], stratsslupsig, sslupst);
    else if (cfg.strend === 'HULL' && hmadirection > 0) signalup = pick(sslup[i], stratsslupsig, sslupst);
    else signalup = sslup[i];
    if (cfg.squeezesignalfilter && squeeze[i]) signalup = sslup[i];
    if (cfg.adxsignalfilter && lt(adx[i], cfg.adxtreshold)) signalup = sslup[i];
    let signaldn: boolean;
    if (cfg.strend === 'NO-FILTER') signaldn = pick(ssldn[i], stratssldnsig, ssldnst);
    else if (cfg.strend === 'SUPERTREND' && gt(dir, 0)) signaldn = pick(ssldn[i], stratssldnsig, ssldnst);
    // the original takes the buy signals here
    else if (cfg.strend === 'HULL' && hmadirection < 0) signaldn = pick(sslup[i], stratsslupsig, sslupst);
    else signaldn = ssldn[i];
    if (cfg.squeezesignalfilter && squeeze[i]) signaldn = ssldn[i];
    if (cfg.adxsignalfilter && lt(adx[i], cfg.adxtreshold)) signaldn = ssldn[i];
    if (signalup) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: C(BULL, 50), text: 'Buy', textColor: C(WHITE, 0), size: 'tiny' });
    }
    if (signaldn) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: C(BEAR, 50), text: 'Sell', textColor: C(WHITE, 0), size: 'tiny' });
    }
    last = {
      exitsig, colorBar, colorPsar, qqecolor, qqedot, sttrend, adxcol, emacol, stocol, rsicol, ccicol, waecol,
      strength: psarn + exitsign + qqedotn + waen + adxcoln + emacoln + stobg + rsiupdn + ccibg + stval,
    };

    // Pivot marks: plotshape(bool(ph) and showpp, text = 'H', ..., offset = -prd)
    const isPh = bool(ph[i]);
    const isPl = bool(pl[i]);
    if (cfg.showpp && i - prd >= 0) {
      if (isPh) {
        markers.push({ time: bars[i - prd].time, position: 'aboveBar', shape: 'triangleDown', color: C(RED, 0), text: 'H', textColor: C(WHITE, 0), size: 'auto' });
      }
      if (isPl) {
        markers.push({ time: bars[i - prd].time, position: 'belowBar', shape: 'triangleUp', color: C(LIME, 0), text: 'L', textColor: C(WHITE, 0), size: 'auto' });
      }
    }

    // Support / resistance
    const cwidth = ((prdHighest[i] - prdLowest[i]) * cfg.channelW) / 100;
    if (isPh || isPl) {
      pivotvals.unshift(isPh ? ph[i] : pl[i]);
      if (pivotvals.length > cfg.maxnumpp) pivotvals.pop();
    }
    for (let x = 1; x <= 10; x++) {
      const lb = srLabels[x];
      const y = labelY(lb);
      if (lb) {
        const rate = (100 * (y - c)) / c;
        const above = ge(y, c);
        label.set_text(lb, str.tostring(y) + '(' + str.tostring(rate, '#.##') + '%)');
        label.set_x(lb, i + cfg.labelloc);
        label.set_color(lb, above ? C(RED, 0) : C(LIME, 0));
        label.set_textcolor(lb, above ? C(WHITE, 0) : C(BLACK, 0));
        label.set_style(lb, above ? 'label_down' : 'label_up');
      }
      const ln = srLines[x];
      if (ln) line.set_color(ln, ge(lineY1(ln), c) ? cfg.resistancecolor : cfg.supportcolor);
    }
    if (isPh || isPl) {
      srUp = [];
      srDn = [];
      const srStrength: number[] = [];
      for (let x = 0; x < pivotvals.length; x++) {
        // get_sr_vals(x): [na, na, na] when showsr is false
        let hi = NaN;
        let lo = NaN;
        let strength = NaN;
        if (cfg.showsr) {
          lo = pivotvals[x];
          hi = lo;
          strength = 0;
          for (let y = 0; y < pivotvals.length; y++) {
            const cpp = pivotvals[y];
            const wdth = le(cpp, lo) ? hi - cpp : cpp - lo;
            if (le(wdth, cwidth)) {
              lo = le(cpp, lo) ? cpp : lo;
              hi = gt(cpp, lo) ? cpp : hi;
              strength += 1;
            }
          }
        }
        // check_sr(hi, lo, strength)
        let keep = true;
        for (let k2 = 0; k2 < srUp.length; k2++) {
          if ((ge(srUp[k2], lo) && le(srUp[k2], hi)) || (ge(srDn[k2], lo) && le(srDn[k2], hi))) {
            if (ge(strength, srStrength[k2])) {
              srStrength.splice(k2, 1);
              srUp.splice(k2, 1);
              srDn.splice(k2, 1);
            } else {
              keep = false;
            }
            break;
          }
        }
        if (!keep) continue;
        // find_loc(strength): counts down from the last index
        let loc = srStrength.length;
        for (let k2 = srStrength.length - 1; k2 >= 0; k2--) {
          if (le(strength, srStrength[k2])) break;
          loc = k2;
        }
        if (loc < cfg.maxnumsr && ge(strength, cfg.minStrength)) {
          srStrength.splice(loc, 0, strength);
          srUp.splice(loc, 0, hi);
          srDn.splice(loc, 0, lo);
          if (srStrength.length > cfg.maxnumsr) {
            srStrength.pop();
            srUp.pop();
            srDn.pop();
          }
        }
      }
      for (let x = 1; x <= 10; x++) {
        const ln = srLines[x];
        if (ln) line.delete(ln);
        const lb = srLabels[x];
        if (lb) label.delete(lb);
      }
      for (let x = 0; x < srUp.length; x++) {
        const mid = math.round_to_mintick((srUp[x] + srDn[x]) / 2, mintick) as number;
        const rate = (100 * (mid - c)) / c;
        const above = ge(mid, c);
        srLabels[x + 1] = label.new(i + cfg.labelloc, mid, str.tostring(mid) + '(' + str.tostring(rate, '#.##') + '%)',
          'bar_index', 'price', above ? C(RED, 0) : C(LIME, 0), above ? 'label_down' : 'label_up',
          above ? C(WHITE, 0) : C(BLACK, 0));
        srLines[x + 1] = line.new(i, mid, i - 1, mid, 'bar_index', 'both', above ? cfg.resistancecolor : cfg.supportcolor,
          lstyle, cfg.linewidth);
      }
    }
  }
  setDrawingBar(null);

  // ---- Tables (set on the last bar)
  const tables: TableData[] = [];
  const white = C(WHITE, 0);
  const gray = grayC;
  const cells: TableCellData[] = [];
  if (n > 0 && cfg.showtable) {
    const L = last;
    const m = cfg.merget;
    const cell = (column: number, row: number, text: string, textSize: 'normal' | 'small', bgColor?: string) => {
      const idx = cells.findIndex((cl) => cl.column === column && cl.row === row);
      const entry: TableCellData = { column, row, text, textColor: white, textSize, ...(bgColor ? { bgColor } : {}) };
      if (idx >= 0) cells[idx] = entry;
      else cells.push(entry);
    };
    cell(0, 0, 'Checklist', 'normal');
    cell(0, 1, 'SSL/EMA Signal', 'small', m ? L.exitsig : gray);
    cell(0, 2, 'HMA open', 'small', m ? L.colorBar : gray);
    cell(0, 3, 'Candle Color', 'small', m ? L.colorPsar : gray);
    cell(0, 4, 'QQE Color', 'small', m ? L.qqecolor : gray);
    cell(0, 5, 'QQE WAE Dot', 'small', m ? L.qqedot : gray);
    cell(0, 6, 'Supertrend', 'small', m ? L.sttrend : gray);
    cell(0, 7, 'ADX Color', 'small', m ? L.adxcol : gray);
    cell(0, 8, 'WAE Color', 'small', m ? L.waecol : gray);
    cell(0, 8, 'EMA Color', 'small', m ? L.emacol : gray);
    cell(0, 9, 'STO Color', 'small', m ? L.stocol : gray);
    cell(0, 10, 'RSI Color', 'small', m ? L.rsicol : gray);
    cell(0, 11, 'CCI Color', 'small', m ? L.ccicol : gray);
    if (!m) {
      cell(1, 0, 'Up/Down', 'normal');
      cell(1, 1, 'Up/Down', 'small', L.exitsig);
      cell(1, 2, 'Above/Below', 'small', L.colorBar);
      cell(1, 3, 'Blue/Pink', 'small', L.colorPsar);
      cell(1, 4, 'Blue/Pink', 'small', L.qqecolor);
      cell(1, 5, 'Below/Above', 'small', L.qqedot);
      cell(1, 6, 'Above/Below', 'small', L.sttrend);
      cell(1, 7, 'Blue/Pink', 'small', L.adxcol);
      cell(1, 8, 'Blue/Pink', 'small', L.waecol);
      cell(1, 9, 'Blue/Pink', 'small', L.stocol);
      cell(1, 10, 'Green/Red', 'small', L.rsicol);
      cell(1, 11, 'Blue/Pink', 'small', L.ccicol);
    }
  }
  tables.push({
    position: 'top_right', columns: 2, rows: 15, cells, bgColor: C(BLACK, 0), borderColor: C('#333333', 0), borderWidth: 3,
  });
  const cells2: TableCellData[] = [];
  if (n > 0 && cfg.showtable2) {
    const s = last.strength;
    const strengthcol = s > cfg.strengthtreshold ? bullC : s < -1 * cfg.strengthtreshold ? bearC : grayC;
    const cell = (column: number, row: number, text: string, textSize: 'normal' | 'small', bgColor?: string) => {
      cells2.push({ column, row, text, textColor: white, textSize, ...(bgColor ? { bgColor } : {}) });
    };
    cell(0, 0, 'Strength', 'normal');
    cell(1, 0, 'Up/Down', 'normal');
    cell(0, 1, '10', 'small', gray);
    cell(1, 1, str.tostring(s), 'small', strengthcol);
    cell(0, 2, 'Signals', 'small', gray);
    cell(1, 2, cfg.sslsignals, 'small', gray);
    cell(0, 3, 'Filter', 'small', gray);
    cell(1, 3, cfg.strend, 'small', gray);
  }
  tables.push({
    position: 'top_center', columns: 2, rows: 15, cells: cells2, bgColor: C(BLACK, 0), borderColor: C('#333333', 0), borderWidth: 3,
  });

  const drawn = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    // fill(a, b, color = color.new(color.purple, 90), title = 'Bollinger Squeezed Area')
    fills: [{ plot1: 'plot11', plot2: 'plot12', options: { title: 'Bollinger Squeezed Area' }, colors: squeezeFill }],
    markers,
    barColors,
    bgColors,
    tables,
    labels: drawn.labels ?? [],
    lines: drawn.lines ?? [],
  };
}

export const SslHybridAdvanced = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
