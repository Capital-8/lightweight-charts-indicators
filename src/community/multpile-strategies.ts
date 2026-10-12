/**
 * Multpile strategies [LUPOWN]
 *
 * Several oscillators in one pane, most of them scaled to the squeeze momentum: `ni` is the running maximum of the
 * momentum, and an oscillator value v is drawn as v * ni / "General scale".
 * - Squeeze momentum (LazyBear): linreg(source - avg(avg(highest high, lowest low), sma close), length), an area
 *   coloured by sign and slope; a cross line at 0 coloured by the squeeze state (Bollinger width with the KC factor
 *   inside / outside the Keltner channel of the true range).
 * - ADX and +DI / -DI (rma), drawn as (value - key level) * ni / scale * "ADX scale"; optional background colour
 *   when the ADX rises above the key level; optional "Punto 23" line.
 * - Whale detector (blackcat1404): a column series.
 * - RSI with its bands (two at the upper / lower levels drawn on every other bar, one at the middle level) and a
 *   purple background between them; without RSI the fast / slow RSI difference ("RSI DIVERGENCE").
 * - Stochastic %K / %D, Awesome Oscillator, MACD (lines and histogram, optionally moved below 0 with a band and a
 *   fill), Koncorde (lkdml: PVI, NVI, MFI, Bollinger oscillator, RSI and stochastic, with fills and diamonds on
 *   the crosses of its "marron" and "media" lines), CCI with its bands: all off by default.
 * - RSI+MFI area (VuManChu Cipher): sma((close - open) / (high - low) * multiplier, period) - Y position.
 * - Cipher dots: on each cross of the WaveTrend difference (wt1 - sma(wt1, smooth)) with 0, a circle on the
 *   momentum (or the AO / MACD).
 * - Status label: ADX slope and level, momentum direction and a summary (Spanish texts of the original), drawn
 *   "Distancia del monitor" bars after the last bar.
 * - Divergences of the momentum and of the scaled RSI: pivots with 1 bar on each side; regular and hidden, bullish
 *   and bearish (as Pine, all four series are titled "Regular Bullish"), drawn on the pivot bar.
 *
 * Plot styles chosen by inputs in the original ("AO": area when "Show ao away 0 point" is off; "Histogram": line
 * when the MACD and "Show MACD area away 0 point" are on) keep the default style here. The alert() call of the
 * original (status text) has no output.
 *
 * Reference: "Multpile strategies [LUPOWN]" by Lupown
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Lupown
 */

import {
  ta, Series, color, label, fixnan, resetDrawings, setDrawingBar, drawingOutputs,
  type FillData, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';

type Source = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'volume';

export interface MultpileStrategiesInputs {
  showMomen: boolean;
  lengthM: number;
  srcM: Source;
  /** SQZ Length (not used by the original) */
  length: number;
  src: Source;
  lengths: number;
  /** BB MultFactor (the Bollinger width of the squeeze uses the KC factor, as in the original) */
  mult: number;
  lengthKC: number;
  multKC: number;
  scale: number;
  showADX: boolean;
  scaleADX: number;
  showDi: boolean;
  showAa: boolean;
  far: number;
  adxlen: number;
  dilen: number;
  keyLevel: number;
  showBg: boolean;
  showWhale: boolean;
  showRsi: boolean;
  showRSIfondo: boolean;
  rsiApart: number;
  len: number;
  upperR: number;
  middleR: number;
  lowerR: number;
  showRsi2: boolean;
  farRSI: number;
  lenFast: number;
  lenSlow: number;
  showStoch: boolean;
  periodK: number;
  smoothK: number;
  periodD: number;
  upS: number;
  lowS: number;
  showAo: boolean;
  showAoF: boolean;
  farAO: number;
  fastLength: number;
  slowLength: number;
  showMacd: boolean;
  showMacdF: boolean;
  showMacdLF: boolean;
  macdF: number;
  showMacdL: boolean;
  fastLengthMacd: number;
  slowLengthMacd: number;
  signalLength: number;
  smaSource: 'SMA' | 'EMA';
  smaSignal: 'SMA' | 'EMA';
  macdScale: number;
  showK: boolean;
  scaleK: number;
  showKF: boolean;
  fark: number;
  showKD: boolean;
  konPos: number;
  konPosn: number;
  srcTprice: Source;
  srcMfi: Source;
  m: number;
  longitudPVI: number;
  longitudNVI: number;
  longitudMFI: number;
  /** Multiplicador para derivacion estandar (not used by the original: the Bollinger oscillator uses "BB MultFactor") */
  multK: number;
  boLength: number;
  showCci: boolean;
  cciLen: number;
  cciSrc: Source;
  upperCCI: number;
  lowerCCI: number;
  rsiMFIShow: boolean;
  rsiMFIperiod: number;
  rsiMFIMultiplier: number;
  rsiMFIPosY: number;
  showCphr: boolean;
  n1: number;
  n2: number;
  smooth: number;
  showStatus: boolean;
  dist: number;
  dashColor: string;
  dashTextColor: string;
  showDiv: boolean;
  lbR: number;
  lbL: number;
  rangeUpper: number;
  rangeLower: number;
  plotBull: boolean;
  plotHiddenBull: boolean;
  plotBear: boolean;
  plotHiddenBear: boolean;
}

export const defaultInputs: MultpileStrategiesInputs = {
  showMomen: true,
  lengthM: 20,
  srcM: 'close',
  length: 20,
  src: 'close',
  lengths: 20,
  mult: 2.0,
  lengthKC: 20,
  multKC: 1.5,
  scale: 75.0,
  showADX: true,
  scaleADX: 2.0,
  showDi: false,
  showAa: false,
  far: -7,
  adxlen: 14,
  dilen: 14,
  keyLevel: 23,
  showBg: false,
  showWhale: false,
  showRsi: true,
  showRSIfondo: true,
  rsiApart: 0,
  len: 14,
  upperR: 70,
  middleR: 50,
  lowerR: 30,
  showRsi2: true,
  farRSI: 70,
  lenFast: 5,
  lenSlow: 14,
  showStoch: false,
  periodK: 14,
  smoothK: 1,
  periodD: 3,
  upS: 80,
  lowS: 20,
  showAo: false,
  showAoF: true,
  farAO: -30,
  fastLength: 5,
  slowLength: 34,
  showMacd: false,
  showMacdF: true,
  showMacdLF: true,
  macdF: -30,
  showMacdL: false,
  fastLengthMacd: 12,
  slowLengthMacd: 26,
  signalLength: 9,
  smaSource: 'EMA',
  smaSignal: 'EMA',
  macdScale: 2,
  showK: false,
  scaleK: 8,
  showKF: true,
  fark: -30,
  showKD: false,
  konPos: 30,
  konPosn: -30,
  srcTprice: 'ohlc4',
  srcMfi: 'hlc3',
  m: 15,
  longitudPVI: 90,
  longitudNVI: 90,
  longitudMFI: 14,
  multK: 2.0,
  boLength: 25,
  showCci: false,
  cciLen: 14,
  cciSrc: 'close',
  upperCCI: 100,
  lowerCCI: -100,
  rsiMFIShow: true,
  rsiMFIperiod: 60,
  rsiMFIMultiplier: 150,
  rsiMFIPosY: 2.5,
  showCphr: true,
  n1: 9,
  n2: 12,
  smooth: 3,
  showStatus: true,
  dist: 10,
  dashColor: 'rgba(105, 105, 105, 0.1)',
  dashTextColor: '#FFFFFF',
  showDiv: true,
  lbR: 1,
  lbL: 1,
  rangeUpper: 60,
  rangeLower: 1,
  plotBull: true,
  plotHiddenBull: true,
  plotBear: true,
  plotHiddenBear: true,
};

const SOURCES: Source[] = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'volume'];
const d = defaultInputs;
const G_MFI = 'Money Flow Index';
const G_BO = 'Bollinger Oscillator';

export const inputConfig: InputConfig[] = [
  { id: 'showMomen', type: 'bool', title: '-----------Show squeeze momentum-------', defval: d.showMomen },
  { id: 'lengthM', type: 'int', title: 'MOM Length', defval: d.lengthM, min: 1, step: 1 },
  { id: 'srcM', type: 'source', title: 'MOM Source', defval: d.srcM, options: SOURCES },
  { id: 'length', type: 'int', title: 'SQZ Length', defval: d.length, min: 1, step: 1 },
  { id: 'src', type: 'source', title: 'SQZ Source', defval: d.src, options: SOURCES },
  { id: 'lengths', type: 'int', title: 'BB Length', defval: d.lengths },
  { id: 'mult', type: 'float', title: 'BB MultFactor', defval: d.mult },
  { id: 'lengthKC', type: 'int', title: 'KC Length', defval: d.lengthKC },
  { id: 'multKC', type: 'float', title: 'KC MultFactor', defval: d.multKC },
  { id: 'scale', type: 'float', title: 'General scale', defval: d.scale },
  { id: 'showADX', type: 'bool', title: '------------Show ADX------------', defval: d.showADX },
  { id: 'scaleADX', type: 'float', title: 'ADX scale', defval: d.scaleADX },
  { id: 'showDi', type: 'bool', title: '    Show +DI -DI', defval: d.showDi },
  { id: 'showAa', type: 'bool', title: 'Mostrar punto 23 aparte', defval: d.showAa, inline: 'adx line' },
  { id: 'far', type: 'int', title: 'Separacion', defval: d.far, inline: 'adx line' },
  { id: 'adxlen', type: 'int', title: 'ADX Smoothing', defval: d.adxlen },
  { id: 'dilen', type: 'int', title: 'DI Length', defval: d.dilen },
  { id: 'keyLevel', type: 'int', title: 'Key level for ADX', defval: d.keyLevel },
  { id: 'showBg', type: 'bool', title: 'Show bg color', defval: d.showBg },
  { id: 'showWhale', type: 'bool', title: 'Show Whale detector', defval: d.showWhale },
  { id: 'showRsi', type: 'bool', title: '------------Show RSI---------', defval: d.showRsi },
  { id: 'showRSIfondo', type: 'bool', title: 'Show RSI background', defval: d.showRSIfondo },
  { id: 'rsiApart', type: 'int', title: 'RSI separation', defval: d.rsiApart },
  { id: 'len', type: 'int', title: 'Length RSI ', defval: d.len, min: 1 },
  { id: 'upperR', type: 'int', title: 'Upper band', defval: d.upperR },
  { id: 'middleR', type: 'int', title: 'Middle band', defval: d.middleR },
  { id: 'lowerR', type: 'int', title: 'Lower band', defval: d.lowerR },
  { id: 'showRsi2', type: 'bool', title: 'Show RSI DIVERGENCE', defval: d.showRsi2 },
  { id: 'farRSI', type: 'int', title: 'Adjust RSI DIVERGENCE', defval: d.farRSI },
  { id: 'lenFast', type: 'int', title: 'Length Fast RSI', defval: d.lenFast, min: 1 },
  { id: 'lenSlow', type: 'int', title: 'Length Slow RSI', defval: d.lenSlow, min: 1 },
  { id: 'showStoch', type: 'bool', title: '-------Show Stochastic------', defval: d.showStoch },
  { id: 'periodK', type: 'int', title: '%K Length', defval: d.periodK, min: 1 },
  { id: 'smoothK', type: 'int', title: '%K Smoothing', defval: d.smoothK, min: 1 },
  { id: 'periodD', type: 'int', title: '%D Smoothing', defval: d.periodD, min: 1 },
  { id: 'upS', type: 'int', title: 'Upper band', defval: d.upS },
  { id: 'lowS', type: 'int', title: 'Lower band', defval: d.lowS },
  { id: 'showAo', type: 'bool', title: '-----------Show AO-------', defval: d.showAo },
  { id: 'showAoF', type: 'bool', title: 'Show ao away 0 point', defval: d.showAoF },
  { id: 'farAO', type: 'int', title: 'Away from 0 point', defval: d.farAO },
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: d.fastLength },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: d.slowLength },
  { id: 'showMacd', type: 'bool', title: '-----------Show MACD-------', defval: d.showMacd },
  { id: 'showMacdF', type: 'bool', title: 'Show MACD area away 0 point', defval: d.showMacdF },
  { id: 'showMacdLF', type: 'bool', title: 'Show MACD lines away 0 point', defval: d.showMacdLF },
  { id: 'macdF', type: 'int', title: 'Away 0 point', defval: d.macdF },
  { id: 'showMacdL', type: 'bool', title: 'Show MACD lines', defval: d.showMacdL },
  { id: 'fastLengthMacd', type: 'int', title: 'Fast Length', defval: d.fastLengthMacd },
  { id: 'slowLengthMacd', type: 'int', title: 'Slow Length', defval: d.slowLengthMacd },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: d.signalLength, min: 1, max: 50 },
  { id: 'smaSource', type: 'string', title: 'Oscillator MA Type', defval: d.smaSource, options: ['SMA', 'EMA'] },
  { id: 'smaSignal', type: 'string', title: 'Signal Line MA Type', defval: d.smaSignal, options: ['SMA', 'EMA'] },
  { id: 'macdScale', type: 'int', title: 'MACD scale', defval: d.macdScale },
  { id: 'showK', type: 'bool', title: '---------------Show Koncorde-------------', defval: d.showK },
  { id: 'scaleK', type: 'int', title: 'Koncorde scale', defval: d.scaleK },
  { id: 'showKF', type: 'bool', title: 'Show Koncorde away 0 point', defval: d.showKF },
  { id: 'fark', type: 'int', title: 'Away from 0 point', defval: d.fark },
  { id: 'showKD', type: 'bool', title: 'Show Koncorde Diamond', defval: d.showKD },
  { id: 'konPos', type: 'int', title: 'Position diamonds Bull', defval: d.konPos },
  { id: 'konPosn', type: 'int', title: 'Position diamonds Bear', defval: d.konPosn },
  { id: 'srcTprice', type: 'source', title: 'Fuente para Precio Total', defval: d.srcTprice, options: SOURCES },
  { id: 'srcMfi', type: 'source', title: 'Fuente MFI', defval: d.srcMfi, options: SOURCES, group: G_MFI },
  { id: 'm', type: 'int', title: 'Media Exponencial', defval: d.m },
  { id: 'longitudPVI', type: 'int', title: 'Longitud PVI', defval: d.longitudPVI },
  { id: 'longitudNVI', type: 'int', title: 'Longitud NVI', defval: d.longitudNVI },
  { id: 'longitudMFI', type: 'int', title: 'Longitud MFI', defval: d.longitudMFI },
  { id: 'multK', type: 'float', title: 'Multiplicador para derivacion estandar', defval: d.multK, group: G_BO },
  { id: 'boLength', type: 'int', title: 'Calculation length ', defval: d.boLength, group: G_BO },
  { id: 'showCci', type: 'bool', title: '------------Show CCI---------', defval: d.showCci },
  { id: 'cciLen', type: 'int', title: 'CCI length', defval: d.cciLen },
  { id: 'cciSrc', type: 'source', title: 'CCI source', defval: d.cciSrc, options: SOURCES },
  { id: 'upperCCI', type: 'int', title: 'CCI Upper band', defval: d.upperCCI },
  { id: 'lowerCCI', type: 'int', title: 'CCI lower band', defval: d.lowerCCI },
  { id: 'rsiMFIShow', type: 'bool', title: '----------Show MFI---------', defval: d.rsiMFIShow },
  { id: 'rsiMFIperiod', type: 'int', title: 'MFI Period', defval: d.rsiMFIperiod },
  { id: 'rsiMFIMultiplier', type: 'float', title: 'MFI Area multiplier', defval: d.rsiMFIMultiplier },
  { id: 'rsiMFIPosY', type: 'float', title: 'MFI Area Y Pos', defval: d.rsiMFIPosY },
  { id: 'showCphr', type: 'bool', title: '------------Show Cipher dots---------', defval: d.showCphr },
  { id: 'n1', type: 'int', title: 'Channel Length', defval: d.n1 },
  { id: 'n2', type: 'int', title: 'Average Length', defval: d.n2 },
  { id: 'smooth', type: 'int', title: 'Smooth Factor', defval: d.smooth },
  { id: 'showStatus', type: 'bool', title: '------Show STATUS----------', defval: d.showStatus },
  { id: 'dist', type: 'int', title: 'Distancia del monitor', defval: d.dist },
  { id: 'dashColor', type: 'color', title: 'label Color', defval: d.dashColor, inline: 'Dash Line' },
  { id: 'dashTextColor', type: 'color', title: 'Text Color', defval: d.dashTextColor, inline: 'Dash Line' },
  { id: 'showDiv', type: 'bool', title: '------Divergencias--------', defval: d.showDiv },
  { id: 'lbR', type: 'int', title: 'Pivot Lookback Right', defval: d.lbR },
  { id: 'lbL', type: 'int', title: 'Pivot Lookback Left', defval: d.lbL },
  { id: 'rangeUpper', type: 'int', title: 'Max of Lookback Range', defval: d.rangeUpper },
  { id: 'rangeLower', type: 'int', title: 'Min of Lookback Range', defval: d.rangeLower },
  { id: 'plotBull', type: 'bool', title: 'Plot Bullish', defval: d.plotBull },
  { id: 'plotHiddenBull', type: 'bool', title: 'Plot Hidden Bullish', defval: d.plotHiddenBull },
  { id: 'plotBear', type: 'bool', title: 'Plot Bearish', defval: d.plotBear },
  { id: 'plotHiddenBear', type: 'bool', title: 'Plot Hidden Bearish', defval: d.plotHiddenBear },
];

/** Pine v4 colour constants */
const GREEN = '#4CAF50';
const RED = '#FF5252';
const LIME = '#00E676';
const BLUE = '#2196F3';
const WHITE = '#FFFFFF';
const GRAY = '#787B86';
const YELLOW = '#FFEB3B';
const ORANGE = '#FF9800';
const PURPLE = '#9C27B0';
const MAROON = '#880E4F';
const BLACK = '#363A45';
/** #00000000 (a colour with its own transparency: the plot `transp` does not change it) */
const CLEAR = '#00000000';

/** plot(transp = t) on an opaque colour */
const tr = (c: string, t: number) => String(color.new(c, t));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Squeeze Momentum', color: BLUE, lineWidth: 1, style: 'area' },
  { id: 'plot1', title: 'Squeeze Zero Line', color: BLUE, lineWidth: 2, style: 'cross' },
  { id: 'plot2', title: 'DI+', color: GREEN, lineWidth: 1 },
  { id: 'plot3', title: 'DI-', color: RED, lineWidth: 1 },
  { id: 'plot4', title: 'whale', color: tr(YELLOW, 80), lineWidth: 1, style: 'columns' },
  { id: 'plot5', title: 'RSI', color: BLUE, lineWidth: 1 },
  { id: 'plot6', title: '%K', color: '#2962FF', lineWidth: 1 },
  { id: 'plot7', title: '%D', color: '#FF6D00', lineWidth: 1 },
  { id: 'plot8', title: 'AO', color: BLUE, lineWidth: 1 },
  { id: 'plot9', title: 'AO Band', color: tr(WHITE, 60), lineWidth: 1 },
  { id: 'plot10', title: 'Histogram', color: BLUE, lineWidth: 1, style: 'columns' },
  { id: 'plot11', title: 'MACD', color: BLUE, lineWidth: 1 },
  { id: 'plot12', title: 'Signal', color: ORANGE, lineWidth: 1 },
  { id: 'plot13', title: 'MACD Band', color: tr(WHITE, 60), lineWidth: 1 },
  { id: 'plot14', title: 'lmarron', color: '#330000', lineWidth: 3 },
  { id: 'plot15', title: 'lineav', color: '#006600', lineWidth: 3 },
  { id: 'plot16', title: 'lazul', color: '#000066', lineWidth: 1 },
  { id: 'plot17', title: 'media', color: RED, lineWidth: 2 },
  { id: 'plot18', title: 'cero', color: BLACK, lineWidth: 1 },
  { id: 'plot19', title: 'CCI', color: BLUE, lineWidth: 2 },
  { id: 'plot20', title: 'Upper Band', color: tr(BLUE, 60), lineWidth: 1 },
  { id: 'plot21', title: 'Lower Band', color: tr(BLUE, 60), lineWidth: 1 },
  { id: 'plot22', title: 'Middle Band', color: tr(BLUE, 70), lineWidth: 1 },
  { id: 'plot23', title: 'CCI Lower Band', color: tr(BLUE, 60), lineWidth: 1 },
  { id: 'plot24', title: 'RSI+MFI Area', color: tr(BLUE, 80), lineWidth: 1, style: 'area' },
  { id: 'plot25', title: 'Buy and sell circle', color: tr(BLUE, 15), lineWidth: 3, style: 'circles' },
  { id: 'plot26', title: 'Punto 23', color: WHITE, lineWidth: 1 },
  { id: 'plot27', title: 'ADX', color: BLUE, lineWidth: 2 },
  { id: 'plot28', title: 'Regular Bullish', color: BLUE, lineWidth: 1 },
  { id: 'plot29', title: 'Regular Bullish', color: BLUE, lineWidth: 1 },
  { id: 'plot30', title: 'Regular Bullish', color: BLUE, lineWidth: 1 },
  { id: 'plot31', title: 'Regular Bullish', color: BLUE, lineWidth: 1 },
];

export const metadata = {
  title: 'Multpile strategies [LUPOWN]',
  shortTitle: 'Multiple strategies [LPWN]',
  overlay: false,
};

const EPS = 1e-10;
/** Pine comparisons: within 1e-10 equal; na compares false */
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const nz = (v: number, r = 0) => (Number.isNaN(v) ? r : v);

const STATUS_TITLE = '\t Estatus segun estrategia\n\t';

export function calculate(
  bars: Bar[],
  inputs: Partial<MultpileStrategiesInputs> = {},
): IndicatorResult & { bgColors: BgColorData[]; markers: MarkerData[]; fills: FillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const S = (a: number[]) => Series.fromArray(bars, a);
  const field = (f: (b: Bar) => number) => bars.map(f);
  const sourceOf = (s: Source): number[] => {
    switch (s) {
      case 'open': return field((b) => b.open);
      case 'high': return field((b) => b.high);
      case 'low': return field((b) => b.low);
      case 'hl2': return field((b) => (b.high + b.low) / 2);
      case 'hlc3': return field((b) => (b.high + b.low + b.close) / 3);
      case 'ohlc4': return field((b) => (b.open + b.high + b.low + b.close) / 4);
      case 'volume': return field((b) => b.volume ?? NaN);
      default: return field((b) => b.close);
    }
  };
  /** x[k] of an array */
  const at = (a: number[], i: number, k: number) => (i - k >= 0 && i - k < n ? a[i - k] : NaN);
  const high = field((b) => b.high);
  const low = field((b) => b.low);
  const close = field((b) => b.close);
  const highS = S(high);
  const lowS = S(low);
  const closeS = S(close);
  const scale = cfg.scale;

  // ---- squeeze momentum
  const lengthM = Math.trunc(cfg.lengthM);
  const srcM = sourceOf(cfg.srcM);
  const hh = A(ta.highest(highS, lengthM));
  const ll = A(ta.lowest(lowS, lengthM));
  const smaM = A(ta.sma(closeS, lengthM));
  const szIn = srcM.map((v, i) => v - ((hh[i] + ll[i]) / 2 + smaM[i]) / 2);
  const sz = A(ta.linreg(S(szIn), lengthM, 0));
  const sc1 = (i: number) => ge(sz[i], 0);
  const sc2 = (i: number) => lt(sz[i], 0);
  const sc3 = (i: number) => ge(sz[i], at(sz, i, 1));
  const sc4 = (i: number) => lt(sz[i], at(sz, i, 1));
  const clr = (i: number) => (sc1(i) && sc3(i) ? '#00FF00' : sc1(i) && sc4(i) ? '#008000'
    : sc2(i) && sc4(i) ? '#FF0000' : sc2(i) && sc3(i) ? '#800000' : GRAY);

  // ---- squeeze (the Bollinger width uses the KC factor, as in the original)
  const basis = A(ta.sma(closeS, Math.trunc(cfg.lengths)));
  const dev = A(ta.stdev(closeS, Math.trunc(cfg.lengths))).map((v) => cfg.multKC * v);
  const ma = A(ta.sma(closeS, Math.trunc(cfg.lengthKC)));
  const trArr = A(ta.tr(bars, false));
  const rangema = A(ta.sma(S(trArr), Math.trunc(cfg.lengthKC)));
  const scolor = (i: number) => {
    const upperBB = basis[i] + dev[i];
    const lowerBB = basis[i] - dev[i];
    const upperKC = ma[i] + rangema[i] * cfg.multKC;
    const lowerKC = ma[i] - rangema[i] * cfg.multKC;
    const sqzOn = gt(lowerBB, lowerKC) && lt(upperBB, upperKC);
    const sqzOff = lt(lowerBB, lowerKC) && gt(upperBB, upperKC);
    const noSqz = !sqzOn && !sqzOff;
    return noSqz ? BLUE : sqzOn ? '#000000' : GRAY;
  };

  // ---- ADX (dirmov / adx of the original)
  const dilen = Math.trunc(cfg.dilen);
  const adxlen = Math.trunc(cfg.adxlen);
  const up = A(ta.change(highS));
  const down = A(ta.change(lowS)).map((v) => -v);
  const truerange = A(ta.rma(S(trArr), dilen));
  const plusRma = A(ta.rma(S(up.map((u, i) => (gt(u, down[i]) && gt(u, 0) ? u : 0))), dilen));
  const minusRma = A(ta.rma(S(down.map((v, i) => (gt(v, up[i]) && gt(v, 0) ? v : 0))), dilen));
  const plus = fixnan(plusRma.map((v, i) => 100 * v / truerange[i]));
  const minus = fixnan(minusRma.map((v, i) => 100 * v / truerange[i]));
  const adxIn = plus.map((p, i) => {
    const sum = p + minus[i];
    return Math.abs(p - minus[i]) / (eq(sum, 0) ? 1 : sum);
  });
  const adxValue = A(ta.rma(S(adxIn), adxlen)).map((v) => 100 * v);

  // biggest(sz): running maximum of the momentum (from its first value)
  const ni: number[] = [];
  for (let i = 0; i < n; i++) {
    let mx = nz(at(ni, i, 1), sz[i]);
    if (gt(sz[i], mx)) mx = sz[i];
    ni.push(mx);
  }
  /** x * ni / scale (the operation order of the original) */
  const sc = (x: number, i: number) => x * ni[i] / scale;
  const keyLevel = cfg.keyLevel;

  // ---- whale detector (blackcat1404)
  // xrf(low, 1): low of the bar before (the current low on the first bar)
  const var2 = low.map((v, i) => (i > 0 && !Number.isNaN(low[i - 1]) ? low[i - 1] : v));
  /** xsa(src, len, wei) */
  const xsa = (src: number[], len: number, wei: number) => {
    const out: number[] = [];
    let sumf = NaN;
    for (let i = 0; i < n; i++) {
      sumf = nz(sumf) - nz(at(src, i, len)) + src[i];
      const mav = Number.isNaN(at(src, i, len)) ? NaN : sumf / len;
      const prev = at(out, i, 1);
      out.push(Number.isNaN(prev) ? mav : (src[i] * wei + prev * (len - wei)) / len);
    }
    return out;
  };
  const xa = xsa(low.map((v, i) => Math.abs(v - var2[i])), 3, 1);
  const xb = xsa(low.map((v, i) => Math.max(v - var2[i], 0)), 3, 1);
  const var3 = xa.map((v, i) => v / xb[i] * 100);
  // iff(close * 1.2, var3 * 10, var3 / 10): the close is never 0
  const var4 = A(ta.ema(S(var3.map((v, i) => (close[i] * 1.2 !== 0 && !Number.isNaN(close[i]) ? v * 10 : v / 10))), 3));
  const var5 = A(ta.lowest(lowS, 30));
  const var6 = A(ta.highest(S(var4), 30));
  const low58 = A(ta.lowest(lowS, 58));
  const var7 = low58.map((v) => (!Number.isNaN(v) && v !== 0 ? 1 : 0));
  const var8 = A(ta.ema(S(low.map((v, i) => (le(v, var5[i]) ? (var4[i] + var6[i] * 2) / 2 : 0))), 3))
    .map((v, i) => v / 618 * var7[i]);

  // ---- RSI, RSI divergence (fast - slow)
  const src = sourceOf(cfg.src);
  const srcS = S(src);
  const rsi = A(ta.rsi(srcS, Math.trunc(cfg.len)));
  const rsiScale = rsi.map((v, i) => sc(v + cfg.rsiApart, i));
  const ownRsi = (length: number) => {
    const ch = A(ta.change(closeS));
    const upR = A(ta.rma(S(ch.map((v) => Math.max(v, 0))), length));
    const dnR = A(ta.rma(S(ch.map((v) => -Math.min(v, 0))), length));
    return upR.map((u, i) => (eq(dnR[i], 0) ? 100 : eq(u, 0) ? 0 : 100 - (100 / (1 + u / dnR[i]))));
  };
  const rsiFast = ownRsi(Math.trunc(cfg.lenFast));
  const rsiSlow = ownRsi(Math.trunc(cfg.lenSlow));
  const divergence = rsiFast.map((v, i) => v - rsiSlow[i]);

  // ---- stochastic
  const kSto = A(ta.sma(ta.stoch(closeS, highS, lowS, Math.trunc(cfg.periodK)), Math.trunc(cfg.smoothK)));
  const dSto = A(ta.sma(S(kSto), Math.trunc(cfg.periodD)));

  // ---- awesome oscillator
  const hl2S = S(sourceOf('hl2'));
  const aoSlow = A(ta.sma(hl2S, Math.trunc(cfg.slowLength)));
  const ao = A(ta.sma(hl2S, Math.trunc(cfg.fastLength))).map((v, i) => v - aoSlow[i]);
  const histColor = (h: number[], i: number) => {
    const prev = at(h, i, 1);
    return ge(h[i], 0) ? (lt(prev, h[i]) ? '#26A69A' : '#B2DFDB') : (lt(prev, h[i]) ? '#FFCDD2' : '#EF5350');
  };

  // ---- MACD
  const fl = Math.trunc(cfg.fastLengthMacd);
  const sl = Math.trunc(cfg.slowLengthMacd);
  const sigl = Math.trunc(cfg.signalLength);
  const fastMa = A(cfg.smaSource === 'SMA' ? ta.sma(srcS, fl) : ta.ema(srcS, fl));
  const slowMa = A(cfg.smaSource === 'SMA' ? ta.sma(srcS, sl) : ta.ema(srcS, sl));
  const macd1 = fastMa.map((v, i) => v - slowMa[i]);
  const signal = A(cfg.smaSignal === 'SMA' ? ta.sma(S(macd1), sigl) : ta.ema(S(macd1), sigl));
  const hist = macd1.map((v, i) => v - signal[i]);
  const histo = hist.map((v) => v * cfg.macdScale);
  const macd = macd1.map((v) => v * cfg.macdScale);
  const sign = signal.map((v) => v * cfg.macdScale);

  // ---- Koncorde (lkdml)
  const m = Math.trunc(cfg.m);
  const tprice = sourceOf(cfg.srcTprice);
  const tpriceS = S(tprice);
  const pvi = A(ta.pvi(bars));
  const pvim = A(ta.ema(S(pvi), m));
  const pvimax = A(ta.highest(S(pvim), Math.trunc(cfg.longitudPVI)));
  const pvimin = A(ta.lowest(S(pvim), Math.trunc(cfg.longitudPVI)));
  const oscp = pvi.map((v, i) => (v - pvim[i]) * 100 / (pvimax[i] - pvimin[i]));
  const nvi = A(ta.nvi(bars));
  const nvim = A(ta.ema(S(nvi), m));
  const nvimax = A(ta.highest(S(nvim), Math.trunc(cfg.longitudNVI)));
  const nvimin = A(ta.lowest(S(nvim), Math.trunc(cfg.longitudNVI)));
  const azul = nvi.map((v, i) => (v - nvim[i]) * 100 / (nvimax[i] - nvimin[i]));
  const xmf = A(ta.mfi(S(sourceOf(cfg.srcMfi)), Math.trunc(cfg.longitudMFI), S(field((b) => b.volume ?? NaN))));
  const boLength = Math.trunc(cfg.boLength);
  const basisK = A(ta.sma(tpriceS, boLength));
  const devK = A(ta.stdev(tpriceS, boLength)).map((v) => cfg.mult * v);
  const bollOsc = tprice.map((v, i) => {
    const upper = basisK[i] + devK[i];
    const lower = basisK[i] - devK[i];
    return ((v - (upper + lower) / 2.0) / (upper - lower)) * 100;
  });
  const xrsi = A(ta.rsi(tpriceS, 14));
  // calc_stoch(tprice, 21, 3)
  const ll21 = A(ta.lowest(lowS, 21));
  const hh21 = A(ta.highest(highS, 21));
  const stoc = A(ta.sma(S(tprice.map((v, i) => 100 * (v - ll21[i]) / (hh21[i] - ll21[i]))), 3));
  const marron = xrsi.map((v, i) => (v + xmf[i] + bollOsc[i] + (stoc[i] / 3)) / 2);
  const verde = marron.map((v, i) => v + oscp[i]);
  const media = A(ta.ema(S(marron), m));
  const konBull = A(ta.crossover(S(marron), S(media)));
  const konBear = A(ta.crossunder(S(marron), S(media)));

  // ---- CCI
  const cci = A(ta.cci(S(sourceOf(cfg.cciSrc)), Math.trunc(cfg.cciLen)));

  // ---- RSI+MFI area (security on the chart timeframe: the chart series)
  const rsiMFI = A(ta.sma(S(bars.map((b) => ((b.close - b.open) / (b.high - b.low)) * cfg.rsiMFIMultiplier)),
    Math.trunc(cfg.rsiMFIperiod))).map((v) => v - cfg.rsiMFIPosY);

  // ---- WaveTrend cipher dots
  const ap = sourceOf('hlc3');
  const esa = A(ta.ema(S(ap), Math.trunc(cfg.n1)));
  const dw = A(ta.ema(S(ap.map((v, i) => Math.abs(v - esa[i]))), Math.trunc(cfg.n1)));
  const ci = ap.map((v, i) => (v - esa[i]) / (0.015 * dw[i]));
  const wt1 = A(ta.ema(S(ci), Math.trunc(cfg.n2)));
  const wt2 = A(ta.sma(S(wt1), Math.trunc(cfg.smooth)));
  const wave = wt1.map((v, i) => v - wt2[i]);
  const condWt = A(ta.cross(S(wave), 0));

  // ---- divergences: pivots of the momentum and of the scaled RSI
  const lbR = Math.trunc(cfg.lbR);
  const lbL = Math.trunc(cfg.lbL);
  const lowR = low.map((_v, i) => at(low, i, lbR));
  const highR = high.map((_v, i) => at(high, i, lbR));
  const findDiv = (osc: number[]) => {
    const oscS = S(osc);
    const pl = A(ta.pivotlow(oscS, lbL, lbR)).map((v) => (Number.isNaN(v) ? 0 : 1));
    const ph = A(ta.pivothigh(oscS, lbL, lbR)).map((v) => (Number.isNaN(v) ? 0 : 1));
    const oscR = osc.map((_v, i) => at(osc, i, lbR));
    const inRange = (found: number[]) => {
      const bs = A(ta.barssince(S(found.map((_v, i) => (i > 0 ? found[i - 1] : 0)))));
      return bs.map((b) => !Number.isNaN(b) && cfg.rangeLower <= b && b <= cfg.rangeUpper);
    };
    const plRange = inRange(pl);
    const phRange = inRange(ph);
    const oscPl = A(ta.valuewhen(S(pl), S(oscR), 1));
    const lowPl = A(ta.valuewhen(S(pl), S(lowR), 1));
    const oscPh = A(ta.valuewhen(S(ph), S(oscR), 1));
    const highPh = A(ta.valuewhen(S(ph), S(highR), 1));
    const bull = osc.map((_v, i) => cfg.plotBull && lt(lowR[i], lowPl[i]) && gt(oscR[i], oscPl[i]) && plRange[i] && pl[i] === 1);
    const hiddenBull = osc.map((_v, i) => cfg.plotHiddenBull && gt(lowR[i], lowPl[i]) && lt(oscR[i], oscPl[i]) && plRange[i]
      && pl[i] === 1);
    const bear = osc.map((_v, i) => cfg.plotBear && gt(highR[i], highPh[i]) && lt(oscR[i], oscPh[i]) && phRange[i] && ph[i] === 1);
    const hiddenBear = osc.map((_v, i) => cfg.plotHiddenBear && lt(highR[i], highPh[i]) && gt(oscR[i], oscPh[i]) && phRange[i]
      && ph[i] === 1);
    return { pl, ph, oscR, bull, hiddenBull, bear, hiddenBear };
  };
  const divSz = findDiv(sz);
  const divRsi = findDiv(rsiScale);

  // ---- outputs
  const interval = barInterval(bars);
  const plots: Record<string, { time: number; value: number; color?: string }[]> = {};
  for (let p = 0; p < plotConfig.length; p++) plots[`plot${p}`] = [];
  const put = (p: number, i: number, value: number, col?: string) => {
    plots[`plot${p}`].push({ time: bars[i].time, value: Number.isFinite(value) ? value : NaN, ...(col ? { color: col } : {}) });
  };
  const fillAo: string[] = [];
  const fillMacd: string[] = [];
  const fillVerde: string[] = [];
  const fillMarron: string[] = [];
  const fillAzul: string[] = [];
  const fillRsi: string[] = [];
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const divPlot = (p: number, div: ReturnType<typeof findDiv>, osc: number[], show: boolean, lowSide: boolean) => {
    for (let i = 0; i < n; i++) {
      const found = (lowSide ? div.pl[i] : div.ph[i]) === 1 && show && cfg.showDiv;
      const col = lowSide
        ? (div.bull[i] ? '#1bff00' : div.hiddenBull[i] ? '#a4ff99' : 'rgba(255, 255, 255, 0)')
        : (div.bear[i] ? '#ff0000' : div.hiddenBear[i] ? '#ff9e9e' : 'rgba(255, 255, 255, 0)');
      const j = i - lbR;
      if (j < 0) continue;
      plots[`plot${p}`].push({ time: barTime(bars, j, interval), value: found ? fin(at(osc, i, lbR)) : NaN, color: col });
    }
  };

  resetDrawings();
  let prevLabel: ReturnType<typeof label.new> | undefined;
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const t = bars[i].time;
    const ki = ni[i] / scale;
    const adxUp = gt(adxValue[i], at(adxValue, i, 1));
    put(0, i, cfg.showMomen ? sz[i] : NaN, clr(i));
    put(1, i, cfg.showMomen ? 0 : NaN, scolor(i));
    put(2, i, cfg.showDi ? sc(plus[i] - keyLevel, i) * cfg.scaleADX : NaN);
    put(3, i, cfg.showDi ? sc(minus[i] - keyLevel, i) * cfg.scaleADX : NaN);
    if (adxUp && gt(adxValue[i], 23) && cfg.showMomen && cfg.showBg) bgColors.push({ time: t, color: tr(clr(i), 95) });
    put(4, i, cfg.showWhale ? var8[i] * ki : NaN);
    const rsiCol = le(rsi[i], cfg.lowerR) ? GREEN : ge(rsi[i], cfg.upperR) ? RED : '#da00ff';
    const rsiCol2 = gt(divergence[i], 0) ? LIME : RED;
    put(5, i, cfg.showRsi ? rsiScale[i] : cfg.showRsi2 ? divergence[i] * ki + sc(cfg.farRSI, i) : NaN,
      cfg.showRsi ? rsiCol : cfg.showRsi2 ? rsiCol2 : undefined);
    put(6, i, cfg.showStoch ? sc(kSto[i], i) : NaN);
    put(7, i, cfg.showStoch ? sc(dSto[i], i) : NaN);

    const aoCol = histColor(ao, i);
    const aoAway = cfg.showAoF && cfg.showAo;
    put(8, i, aoAway ? ao[i] + sc(cfg.farAO, i) : cfg.showAo ? ao[i] : NaN, aoCol);
    put(9, i, aoAway ? sc(cfg.farAO, i) : NaN);
    fillAo.push(aoAway ? tr(aoCol, 90) : 'transparent');

    const macdCol = histColor(hist, i);
    const macdAway = cfg.showMacdF && cfg.showMacd;
    const lineAway = cfg.showMacdLF && cfg.showMacdL;
    put(10, i, macdAway ? histo[i] + sc(cfg.macdF, i) : cfg.showMacd ? histo[i] : NaN, macdCol);
    put(11, i, lineAway ? macd[i] + sc(cfg.macdF, i) : cfg.showMacdL ? macd[i] : NaN, gt(macd[i], sign[i]) ? GREEN : RED);
    put(12, i, lineAway ? sign[i] + sc(cfg.macdF, i) : cfg.showMacdL ? sign[i] : NaN);
    put(13, i, macdAway ? sc(cfg.macdF, i) : NaN);
    fillMacd.push(macdAway ? tr(macdCol, 90) : 'transparent');

    const scaleK1 = ki / cfg.scaleK;
    const awayK = cfg.showK && cfg.showKF;
    const kon = (v: number) => (awayK ? (v * scaleK1) + sc(cfg.fark, i) : cfg.showK ? v * scaleK1 : NaN);
    put(14, i, kon(marron[i]));
    put(15, i, kon(verde[i]));
    put(16, i, kon(azul[i]));
    put(17, i, kon(media[i]));
    put(18, i, cfg.showK ? (cfg.showKF ? sc(cfg.fark, i) : 0) : NaN);
    fillVerde.push(cfg.showK ? 'rgba(102, 255, 102, 0.5)' : 'transparent');
    fillMarron.push(cfg.showK ? 'rgba(255, 204, 153, 0.5)' : 'transparent');
    fillAzul.push(cfg.showK ? 'rgba(0, 255, 255, 0.5)' : 'transparent');
    const bull = konBull[i] === 1 && cfg.showKD;
    const bear = konBear[i] === 1 && cfg.showKD;
    const konPrice = bull ? sc(cfg.konPos, i) : bear ? sc(cfg.konPosn, i) : NaN;
    if (Number.isFinite(konPrice)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: konPrice, shape: 'circle', color: 'transparent', text: '◆',
        textColor: bull ? LIME : bear ? MAROON : WHITE, size: 'tiny' });
    }

    put(19, i, cfg.showCci ? (30) * sc(cci[i], i) / 100 : NaN);
    const b1s = sc(cfg.rsiApart + cfg.upperR, i);
    const bm = sc(cfg.rsiApart + cfg.middleR, i);
    const b0s = sc(cfg.rsiApart + cfg.lowerR, i);
    const h1s = sc(cfg.upS, i);
    const h0s = sc(cfg.lowS, i);
    const b1cci = sc(cfg.upperCCI, i) * 30 / 100;
    const b0cci = sc(cfg.lowerCCI, i) * 30 / 100;
    const even = i % 2 === 0;
    put(20, i, cfg.showRsi ? b1s : cfg.showStoch ? h1s : NaN, even ? tr(WHITE, 60) : CLEAR);
    put(21, i, cfg.showRsi ? b0s : cfg.showStoch ? h0s : cfg.showCci ? b0cci : NaN, even ? tr(WHITE, 60) : CLEAR);
    put(22, i, cfg.showCci ? b1cci : cfg.showRsi ? bm : cfg.showRsi2 ? sc(cfg.farRSI, i) : NaN,
      even ? tr(cfg.showCci ? BLUE : WHITE, 70) : CLEAR);
    put(23, i, cfg.showCci ? b0cci : NaN, even ? tr(BLUE, 60) : CLEAR);
    fillRsi.push(cfg.showRsi && cfg.showRSIfondo ? tr(PURPLE, 90) : 'transparent');

    const mfiCol = ge(rsiMFI[i], 0) ? '#ffffff' : lt(rsiMFI[i], 0) ? '#d1d4dc' : undefined;
    put(24, i, cfg.rsiMFIShow ? sc(rsiMFI[i], i) : NaN, mfiCol ? tr(mfiCol, 80) : undefined);
    const wtjeje = cfg.showMomen ? sz[i] : cfg.showAo ? ao[i] : cfg.showMacd ? macd[i] : NaN;
    put(25, i, condWt[i] === 1 && cfg.showCphr ? wtjeje : NaN, tr(ge(wave[i], 0) ? LIME : RED, 15));
    put(26, i, cfg.showAa ? sc(cfg.far, i) * cfg.scaleADX : NaN);
    put(27, i, cfg.showAa ? sc(adxValue[i] - keyLevel + cfg.far, i) * cfg.scaleADX
      : cfg.showADX ? sc(adxValue[i] - keyLevel, i) * cfg.scaleADX : NaN, adxUp ? '#ffffff' : '#a09a9a');

    // status label: one per bar, the one of the bar before deleted
    if (cfg.showStatus) {
      const a1 = ge(adxValue[i], 23);
      const a2 = lt(adxValue[i], 23);
      const a3 = ge(adxValue[i], at(adxValue, i, 1));
      const a4 = lt(adxValue[i], at(adxValue, i, 1));
      const s1 = sc1(i);
      const s2 = sc2(i);
      const s3 = sc3(i);
      const s4 = sc4(i);
      const iAdx = a1 && a3 ? 'Pendiente positiva ↑ 23' : a1 && a4 ? 'Pendiente negativa ↑ 23'
        : a2 && a4 ? 'Pendiente negativa ↓ 23' : a2 && a3 ? 'Pendiente positiva ↓ 23' : '-';
      const iMom = s1 && s3 ? 'Direccionalidad alcista' : s1 && s4 ? 'Direccionalidad bajista'
        : s2 && s4 ? 'Direccionalidad bajista' : s2 && s3 ? 'Direccinalidad alcista' : '-';
      const igral = a1 && a3 && s1 && s3 ? 'Fuerte movimiento alcista'
        : a1 && a3 && s1 && s4 ? 'Monitor muestra rango-caida pero\nel movimiento tiene fuerza'
          : a1 && a3 && s2 && s4 ? 'Fuerte movimiento bajista'
            : a1 && a3 && s2 && s3 ? 'Monitor muestra rango-subida pero\nel movimiento tiene fuerza'
              : a1 && a4 && s1 && s3 ? 'Movimiento alcista sin fuerza'
                : a1 && a4 && s1 && s4 ? 'Monitor muestra rango-caida\n pendiente negativa en ADX '
                  : a1 && a4 && s2 && s4 ? 'Movimiento bajista sin fuerza'
                    : a1 && a4 && s2 && s3 ? 'Monitor muestra rango-subida con \npendiente negativa en ADX '
                      : a2 && a4 && s1 && s3 ? 'Movimiento alcista sin fuerza'
                        : a2 && a4 && s1 && s4 ? 'Monitor muestra rango-caida sin fuerza '
                          : a2 && a4 && s2 && s4 ? 'Movimiento bajista sin fuerza'
                            : a2 && a4 && s2 && s3 ? 'Monitor muestra rango-subida sin fuerza '
                              : a2 && a3 && s1 && s3 ? 'Movimiento alcista que \n quiere agarrar fuerza'
                                : a2 && a3 && s1 && s4 ? 'Monitor muestra rango-caida,\n el movimiento quiere agarrar fuerza'
                                  : a2 && a3 && s2 && s4 ? 'Movimiento bajista que \n quiere agarrar fuerza'
                                    : a2 && a3 && s2 && s3 ? 'Monitor muestra rango-subida,\n el movimiento quiere agarrar fuerza'
                                      : '-';
      const text = `Info ADX: ${iAdx}\nInfo monitor: ${iMom}\nInfo general:\n${igral}`;
      const lab = label.new(i + Math.trunc(cfg.dist), 0, STATUS_TITLE + text, 'bar_index', 'price', cfg.dashColor,
        'label_left', cfg.dashTextColor);
      if (prevLabel) label.delete(prevLabel);
      prevLabel = lab;
    }
  }
  setDrawingBar(null);
  divPlot(28, divSz, sz, cfg.showMomen, true);
  divPlot(29, divSz, sz, cfg.showMomen, false);
  divPlot(30, divRsi, rsiScale, cfg.showRsi, true);
  divPlot(31, divRsi, rsiScale, cfg.showRsi, false);

  const fills: FillData[] = [
    { plot1: 'plot8', plot2: 'plot9', options: { title: 'AO Fill', color: tr(BLUE, 90) }, colors: fillAo },
    { plot1: 'plot10', plot2: 'plot13', options: { title: 'MACD Fill', color: tr(BLUE, 90) }, colors: fillMacd },
    { plot1: 'plot15', plot2: 'plot18', options: { title: 'verde', color: tr(BLUE, 50) }, colors: fillVerde },
    { plot1: 'plot14', plot2: 'plot18', options: { title: 'marron', color: tr(BLUE, 50) }, colors: fillMarron },
    { plot1: 'plot16', plot2: 'plot18', options: { title: 'azul', color: tr(BLUE, 50) }, colors: fillAzul },
    { plot1: 'plot20', plot2: 'plot21', options: { title: 'RSI background', color: tr(BLUE, 90) }, colors: fillRsi },
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    bgColors,
    markers,
    ...drawingOutputs(bars),
  };
}

const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

export const MultpileStrategies = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
