/**
 * Elliott Wave Oscillator Signals by DGT
 *
 * Elliott Wave Oscillator: the 5-bar moving average of the close over its 34-bar average, less 1, in percent
 * (EMA or SMA). Its signal line is the moving average of the oscillator over "Signal Delay" bars.
 * - Signals: the oscillator crossing above its signal line is a long signal (a strong one when the oscillator is
 *   below minus the threshold), crossing below is a short signal (strong when above the threshold). Label shapes
 *   below / above the bars, on the last "Plotting Length" bars.
 * - Histogram: on the last bar, the difference of the two averages of each of the last "Plotting Length" bars is
 *   drawn as a vertical line on the price chart, from the lowest low (or the highest high) of that window, scaled
 *   by the highest difference and the price range of the window.
 * - Backtest framework (off by default): simulates trades of the signals over the last "Period (Years)", entered at
 *   the open two bars after the signal (one bar with "Next Bar Mode"), with long / short / both modes, reversal on
 *   the opposite signal, an optional stop loss and candle confirmations. Entry / exit labels with tooltips, an early
 *   warning label, a statistics label 5 bars after the last bar and the plot "Entry / Exit Price".
 * - Keltner Channels (off by default): a moving average (DEMA / EMA / HMA / SMA / WMA) with up to three bands at
 *   multiples of the ATR, of the smoothed true range or of the smoothed range, and optional fills between the bands;
 *   on the last "Plotting Length" bars.
 * A small logo table is drawn at the bottom right.
 *
 * Alerts as the original's: the alert conditions long / short early warning (the oscillator crossing its signal
 * line) and trading opportunity (the same cross one bar before), and the close crossing above the upper Keltner
 * bands 3 / 2 or below the lower bands 2 / 3 (computed whether the channels are displayed or not); the alert() calls
 * of the backtest framework (long / short entry, stop loss, long / short early warning; once per bar), in
 * `alertCalls`.
 *
 * Chart context (optional third argument), read by the backtest framework only:
 * - `chart.now`: the current time, start of the backtest period. Without it the clock of the computer.
 * - `chart.mintick`: the symbol tick (smallest price in the profit ratio). Without it 0.01.
 * - `chart.timeframe`: the chart timeframe in the statistics text. Without it, from the gaps between the bars.
 * - `chart.tickerid`: the ticker id in the messages of the alert() calls. Without it an empty string.
 *
 * Reference: "Elliott Wave Oscillator Signals by DGT" by dgtrd
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © dgtrd
 */

import { ta, str, color, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { AlertCall, LabelData, LineDrawingData, MarkerData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import { mintickOf, nowOf, tickeridOf, type ChartContext } from '../chart-context';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ElliottWaveOscillatorSignalsByDgtInputs {
  /** Elliott Wave Oscillator Signals */
  ew: boolean;
  /** Smoothing */
  e: 'SMA' | 'EMA';
  /** Signal Delay */
  d: number;
  /** Signal Strength Threshold */
  t: number;
  /** Show EWO Histogram */
  h: boolean;
  oscPlacement: 'Top' | 'Bottom';
  /** Height (1 to 10) */
  oscHeight: number;
  /** Plotting Length */
  p: number;
  isBackTest: boolean;
  tradeMode: 'Long Only' | 'Short Only' | 'Both';
  reverseOnSignal: boolean;
  dasCapital: number;
  /** Period (Years) */
  lenBckTst: number;
  isStopLoss: boolean;
  /** Stop loss in % */
  stopLoss: number;
  useCandleL: boolean;
  useCandleS: boolean;
  isSudden: boolean;
  isTest: boolean;
  lblInOutSL: boolean;
  lblWarnings: boolean;
  lblTrdStat: boolean;
  /** Display Keltner Channel's Clouds */
  k: boolean;
  kcSource: SourceType;
  kcMaType: 'DEMA' | 'EMA' | 'HMA' | 'SMA' | 'WMA';
  kcLength: number;
  bandsStyle: 'Average True Range' | 'True Range' | 'Range';
  atrlength: number;
  isBand1: boolean;
  kcMult1: number;
  colorK1: string;
  widthK1: number;
  isBand2: boolean;
  kcMult2: number;
  colorK2: string;
  widthK2: number;
  isBand3: boolean;
  kcMult3: number;
  colorK3: string;
  widthK3: number;
  bandsFill: boolean;
}

export const defaultInputs: ElliottWaveOscillatorSignalsByDgtInputs = {
  ew: true,
  e: 'EMA',
  d: 5,
  t: 13,
  h: true,
  oscPlacement: 'Bottom',
  oscHeight: 7,
  p: 233,
  isBackTest: false,
  tradeMode: 'Both',
  reverseOnSignal: true,
  dasCapital: 1000,
  lenBckTst: 1,
  isStopLoss: false,
  stopLoss: 1,
  useCandleL: false,
  useCandleS: false,
  isSudden: true,
  isTest: false,
  lblInOutSL: true,
  lblWarnings: true,
  lblTrdStat: true,
  k: false,
  kcSource: 'close',
  kcMaType: 'EMA',
  kcLength: 20,
  bandsStyle: 'Average True Range',
  atrlength: 10,
  isBand1: false,
  kcMult1: 1,
  colorK1: '#B2B5BE',
  widthK1: 1,
  isBand2: true,
  kcMult2: 2,
  colorK2: '#FF9800',
  widthK2: 2,
  isBand3: true,
  kcMult3: 3,
  colorK3: '#F23645',
  widthK3: 3,
  bandsFill: false,
};

const G = 'Elliott Wave Oscillator';
const BT = '=============   Backtest Framework   =============';
const KC = 'Keltner Channels';

export const inputConfig: InputConfig[] = [
  {
    id: 'ew', type: 'bool', title: 'Elliott Wave Oscillator Signals', defval: true, group: G,
    tooltip: 'Enables or disables plotting of EWOˢ signals and labels.\n• Enabled → Signals and shapes are plotted on the chart.\n• Disabled → Signals are hidden, but calculations remain active.',
  },
  {
    id: 'e', type: 'string', title: '  Smoothing', defval: 'EMA', options: ['SMA', 'EMA'], group: G,
    tooltip: 'Selects the smoothing method used in the oscillator.\n• EMA → Exponential Moving Average, faster response to recent price changes\n• SMA → Simple Moving Average, smoother, more stable signals',
  },
  {
    id: 'd', type: 'int', title: '  Signal Delay', defval: 5, min: 2, group: G,
    tooltip: 'Controls how many bars the EWO signal is delayed.\n• Lower values → earlier, more reactive signals\n• Higher values → slower, more confirmed signals\nUseful for filtering noise in lower timeframes.',
  },
  {
    id: 't', type: 'int', title: '  Signal Strength Threshold', defval: 13, min: 1, group: G,
    tooltip: 'Minimum oscillator strength required to validate a signal.\n• Higher values → fewer but stronger signals\n• Lower values → more frequent, weaker signals\nActs as a quality filter for EWOˢ signals.',
  },
  {
    id: 'h', type: 'bool', title: 'Show EWO Histogram', defval: true, group: G,
    tooltip: 'Plots the Elliott Wave Oscillator histogram as an overlay on the price chart.\nUseful for visualizing momentum strength relative to price action and wave structure.',
  },
  { id: 'oscPlacement', type: 'string', title: '  Placement', defval: 'Bottom', options: ['Top', 'Bottom'], inline: 'VOL', group: G },
  {
    id: 'oscHeight', type: 'int', title: 'Height', defval: 7, min: 1, max: 10, inline: 'VOL', group: G,
    tooltip: 'Histogram Placement\nDetermines where the EWO histogram is plotted.\n• Top → plotted above the price bar range\n• Bottom → plotted below the price bar range\n\nHistogram Height\nControls the vertical scaling of the EWO histogram overlay.\n• Higher values → taller histogram bars\n• Lower values → shorter histogram bars',
  },
  {
    id: 'p', type: 'int', title: 'Plotting Length', defval: 233, group: 'Display Settings',
    tooltip: 'Specifies how many historical bars are used for plotting.\n• Higher values → longer historical context\n• Lower values → lighter load and cleaner display',
  },
  {
    id: 'isBackTest', type: 'bool', title: 'Enable Backtest', defval: false, group: BT,
    tooltip: 'Enable or disable the backtest framework.\n• ON  → trades simulated using the rules below\n• OFF → only live signals shown',
  },
  {
    id: 'tradeMode', type: 'string', title: 'Trade Mode', defval: 'Both', options: ['Long Only', 'Short Only', 'Both'], group: BT,
    tooltip: 'Defines which trade directions are simulated.\n\n• Long Only  — enters on long signal, exits on short signal or stop loss\n• Short Only — enters on short signal, exits on long signal or stop loss\n• Both       — enters on either signal, optionally reverses on the opposite',
  },
  {
    id: 'reverseOnSignal', type: 'bool', title: 'Reverse on Opposite Signal', defval: true, group: BT,
    tooltip: 'Only applies when Trade Mode is Both.\nWhen enabled, an opposite signal immediately closes the current trade\nand opens a new one in the other direction — always in trade once started.\nWhen disabled, opposite signal exits only — no new trade until next entry signal.',
  },
  {
    id: 'dasCapital', type: 'float', title: 'Initial Capital', defval: 1000, group: BT,
    tooltip: 'Starting capital for the simulation.\nUsed to calculate compounding PnL and final equity.',
  },
  {
    id: 'lenBckTst', type: 'float', title: 'Period (Years)', defval: 1, min: 0, step: 0.1, group: BT,
    tooltip: 'Lookback window for the simulation in years.\nCapped automatically if the selected timeframe has insufficient history.',
  },
  {
    id: 'isStopLoss', type: 'bool', title: 'Apply Stop Loss', defval: false, inline: 'sl', group: BT,
    tooltip: 'Exits the trade if price moves against the position intrabar.\nLong SL : low  reaches entry × (1 − %)\nShort SL: high reaches entry × (1 + %)',
  },
  { id: 'stopLoss', type: 'float', title: '  %', defval: 1, step: 0.1, min: 0, inline: 'sl', group: BT },
  {
    id: 'useCandleL', type: 'bool', title: 'Long Candle Confirmation', defval: false, group: BT,
    tooltip: 'Long entries only taken on bullish bars (close > open).',
  },
  {
    id: 'useCandleS', type: 'bool', title: 'Short Candle Confirmation', defval: false, group: BT,
    tooltip: 'Short entries only taken on bearish bars (close < open).',
  },
  {
    id: 'isSudden', type: 'bool', title: 'Avoid Same-Bar Conflicts', defval: true, group: BT,
    tooltip: 'Skips entries when both long and short signals fire on the same bar.\nReduces false entries from volatile spikes.',
  },
  {
    id: 'isTest', type: 'bool', title: '❗ Next Bar Mode (Repaints)', defval: false, group: BT,
    tooltip: 'Uses the next bar\'s open for simulation instead of the confirmed bar open.\nProduces earlier entries but signals will repaint.\nFor testing and comparison only — do not use for live alerts.',
  },
  {
    id: 'lblInOutSL', type: 'bool', title: 'Show Entry / Exit Labels', defval: true, group: BT,
    tooltip: 'Displays L / S / SL / TP labels at entry and exit bars with tooltips showing direction, price, change, and capital.',
  },
  {
    id: 'lblWarnings', type: 'bool', title: 'Show Early Warnings', defval: true, group: BT,
    tooltip: 'Shows a ⚠️ label when a signal fires but has not yet been confirmed.\nLabel is deleted on the following bar regardless of outcome.',
  },
  {
    id: 'lblTrdStat', type: 'bool', title: 'Show Trade Statistics', defval: true, group: BT,
    tooltip: 'Displays a floating label with full trade summary.\nIncludes win rate, PnL, long/short breakdown, and current trade status.',
  },
  {
    id: 'k', type: 'bool', title: 'Display Keltner Channel\'s Clouds', defval: false, group: KC,
    tooltip: 'Toggle the visibility of Keltner Channel lines and clouds on the chart.',
  },
  { id: 'kcSource', type: 'source', title: 'Source', defval: 'close', inline: 'KC1', group: KC },
  { id: 'kcMaType', type: 'string', title: '', defval: 'EMA', options: ['DEMA', 'EMA', 'HMA', 'SMA', 'WMA'], inline: 'KC1', group: KC },
  { id: 'kcLength', type: 'int', title: '', defval: 20, min: 1, inline: 'KC1', group: KC },
  {
    id: 'bandsStyle', type: 'string', title: 'Bands', defval: 'Average True Range', options: ['Average True Range', 'True Range', 'Range'],
    inline: 'BAND0', group: KC,
    tooltip: 'Method used to calculate channel width.\n\n• Average True Range (ATR)\n• True Range (TR) smoothed\n• High-Low Range',
  },
  { id: 'atrlength', type: 'int', title: 'ATR Length', defval: 10, inline: 'BAND0', group: KC },
  { id: 'isBand1', type: 'bool', title: '1st Multiplier', defval: false, inline: 'BAND1', group: KC },
  { id: 'kcMult1', type: 'float', title: '', defval: 1, min: 1, step: 0.1, inline: 'BAND1', group: KC },
  { id: 'colorK1', type: 'color', title: '', defval: '#B2B5BE', inline: 'BAND1', group: KC },
  { id: 'widthK1', type: 'int', title: '', defval: 1, inline: 'BAND1', group: KC },
  { id: 'isBand2', type: 'bool', title: '2nd Multiplier', defval: true, inline: 'BAND2', group: KC },
  { id: 'kcMult2', type: 'float', title: '', defval: 2, min: 1, step: 0.1, inline: 'BAND2', group: KC },
  { id: 'colorK2', type: 'color', title: '', defval: '#FF9800', inline: 'BAND2', group: KC },
  { id: 'widthK2', type: 'int', title: '', defval: 2, inline: 'BAND2', group: KC },
  { id: 'isBand3', type: 'bool', title: '3rd Multiplier', defval: true, inline: 'BAND3', group: KC },
  { id: 'kcMult3', type: 'float', title: '', defval: 3, min: 1, step: 0.1, inline: 'BAND3', group: KC },
  { id: 'colorK3', type: 'color', title: '', defval: '#F23645', inline: 'BAND3', group: KC },
  { id: 'widthK3', type: 'int', title: '', defval: 3, inline: 'BAND3', group: KC },
  {
    id: 'bandsFill', type: 'bool', title: 'Background Fill', defval: false, group: KC,
    tooltip: 'Fill the area between Keltner Channel bands to create cloud visuals.',
  },
];

/** Colour constants of the original Pine version */
const BLUE = '#2962FF';
const GREEN = '#4CAF50';
const RED = '#F23645';
const TEAL = '#089981';
const GRAY = '#787B86';
const WHITE = '#FFFFFF';
const DARK_GREEN = '#006400';
const DARK_RED = '#910000';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Entry / Exit Price', color: BLUE, lineWidth: 1, style: 'circles', forceOverlay: true },
  { id: 'plot1', title: 'KC Middle', color: BLUE, lineWidth: 1 },
  { id: 'plot2', title: 'KC Upper Band 3', color: String(color.new('#F23645', 73)), lineWidth: 3 },
  { id: 'plot3', title: 'KC Upper Band 2', color: String(color.new('#FF9800', 73)), lineWidth: 2 },
  { id: 'plot4', title: 'KC Upper Band 1', color: String(color.new('#B2B5BE', 73)), lineWidth: 1 },
  { id: 'plot5', title: 'KC Lower Band 1', color: String(color.new('#B2B5BE', 73)), lineWidth: 1 },
  { id: 'plot6', title: 'KC Lower Band 2', color: String(color.new('#FF9800', 73)), lineWidth: 2 },
  { id: 'plot7', title: 'KC Lower Band 3', color: String(color.new('#F23645', 73)), lineWidth: 3 },
];

export const metadata = {
  title: 'Elliott Wave Oscillator Signals by DGT',
  shortTitle: 'EWOˢ ☼☾',
  overlay: true,
};

export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long : Early Warning', message: 'EWOˢ - Probable Long Trade (Not Confirmed)\n{{exchange}}:{{ticker}}\nPrice = {{close}}\nTime = {{time}}' },
  { id: 'alert1', title: 'Long : Trading Opportunity', message: 'EWOˢ - Probable Long Trade Opportunity\n{{exchange}}:{{ticker}}\nPrice = {{close}}\nTime = {{time}}' },
  { id: 'alert2', title: 'Short : Early Warning', message: 'EWOˢ - Probable Short Trade (Not Confirmed)\n{{exchange}}:{{ticker}}\nPrice = {{close}}\nTime = {{time}}' },
  { id: 'alert3', title: 'Short : Trading Opportunity', message: 'EWOˢ - Probable Short Trade Opportunity\n{{exchange}}:{{ticker}}\nPrice = {{close}}\nTime = {{time}}' },
  { id: 'alert4', title: 'Crossover Upper High KC', message: 'Crossover Upper High KC Band\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}' },
  { id: 'alert5', title: 'Crossover Upper Mid KC', message: 'Crossover Upper Mid KC Band\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}' },
  { id: 'alert6', title: 'Crossunder Lower Mid KC', message: 'Crossunder Lower Mid KC Band\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}' },
  { id: 'alert7', title: 'Crossunder Lower Low KC', message: 'Crossunder Lower Low KC Band\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}' },
];

/** The script calls alert() (backtest framework entries, stop loss and early warnings) */
export const hasAlertFunction = true;

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;
/** Milliseconds of a year in the script */
const YEAR_MS = 31556952000;

/** Pine float comparisons: a > b only when a - b > 1e-10 (a == b within 1e-10; na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

type Lb = LabelData & { deleted?: boolean };

export function calculate(
  bars: Bar[],
  inputs: Partial<ElliottWaveOscillatorSignalsByDgtInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
  markers: MarkerData[]; lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[];
  alerts: AlertConditionState[]; alertCalls: AlertCall[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const p = Math.trunc(cfg.p);
  const d = Math.trunc(cfg.d);
  const t = cfg.t;
  const useEma = cfg.e === 'EMA';
  const oscHeight = 21 - Math.trunc(cfg.oscHeight) * 2;
  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const closeS = new Series(bars, (b) => b.close);
  const ma = (s: Series, len: number) => (useEma ? ta.ema(s, len) : ta.sma(s, len));
  // show_last = Plotting Length: only the last bars are drawn
  const shown = (i: number) => i >= n - p;

  // Elliott Wave Oscillator and its signal line
  const fast = ma(closeS, 5);
  const slow = ma(closeS, 34);
  const fastArr = arr(fast);
  const slowArr = arr(slow);
  const ewoS = Series.fromArray(bars, fastArr.map((v, i) => (v / slowArr[i] - 1) * 100));
  const ewo = arr(ewoS);
  const ewoSignalS = ma(ewoS, d);
  const crossUp = ta.crossover(ewoS, ewoSignalS).toArray().map((v) => !!v);
  const crossDown = ta.crossunder(ewoS, ewoSignalS).toArray().map((v) => !!v);

  const markers: MarkerData[] = [];
  if (cfg.ew) {
    for (let i = Math.max(0, n - p); i < n; i++) {
      const time = bars[i].time;
      if (crossUp[i] && lt(ewo[i], -t)) markers.push({ time, position: 'belowBar', shape: 'labelUp', color: String(color.new(DARK_GREEN, 0)), size: 'small', id: 'shape0' });
      if (crossUp[i] && ge(ewo[i], -t)) markers.push({ time, position: 'belowBar', shape: 'labelUp', color: String(color.new(GREEN, 0)), size: 'tiny', id: 'shape1' });
      if (crossDown[i] && gt(ewo[i], t)) markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: String(color.new(DARK_RED, 0)), size: 'small', id: 'shape2' });
      if (crossDown[i] && le(ewo[i], t)) markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: String(color.new(RED, 0)), size: 'tiny', id: 'shape3' });
    }
  }

  // EWO histogram, drawn with lines on the last bar
  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lines: LineDrawingData[] = [];
  if (cfg.h && n > 0) {
    const hist = fastArr.map((v, i) => v - slowArr[i]);
    const priceHighest = arr(ta.highest(new Series(bars, (b) => b.high), p))[last];
    const priceLowest = arr(ta.lowest(new Series(bars, (b) => b.low), p))[last];
    const ewoHighest = arr(ta.highest(Series.fromArray(bars, hist), p))[last];
    const priceChangeRate = (priceHighest - priceLowest) / priceHighest / oscHeight;
    const base = cfg.oscPlacement === 'Top' ? priceHighest : priceLowest;
    const all: Array<LineDrawingData | null> = [];
    for (let k = 0; k <= p - 1; k++) {
      const i = last - k;
      let ln: LineDrawingData | null = null;
      if (i >= 0) {
        const prev = i > 0 && !isNaN(hist[i - 1]) ? hist[i - 1] : 0;
        const rising = lt(prev, hist[i]);
        const css = ge(hist[i], 0) ? (rising ? DARK_GREEN : GREEN) : (rising ? RED : DARK_RED);
        const y2 = base * (1 + (hist[i] / ewoHighest) * priceChangeRate);
        // a line with an na coordinate is not drawn (it still counts)
        if (Number.isFinite(base) && Number.isFinite(y2)) {
          ln = { time1: T(i), price1: base, time2: T(i), price2: y2, color: css, style: 'solid', width: 2, extend: 'none' };
        }
      }
      all.push(ln);
      // at most 500 lines: above 505 the oldest are deleted until 500 remain
      if (all.length > MAX_OBJECTS + 5) all.splice(0, all.length - MAX_OBJECTS);
    }
    for (const ln of all) if (ln !== null) lines.push(ln);
  }

  // Backtest framework
  const labels: Lb[] = [];
  const alertCalls: AlertCall[] = [];
  const tickerid = tickeridOf(chart);
  const plot0: Array<{ time: number; value: number; color: string }> = [];
  {
    const { isBackTest, tradeMode, dasCapital, lenBckTst, isTest } = cfg;
    const stopLoss = cfg.stopLoss / 100;
    const mintick = mintickOf(chart);
    const now = nowOf(chart);
    let dir = 0;
    let entry = 0;
    let exit = 0;
    let cap = dasCapital;
    let trades = 0;
    let winL = 0;
    let lossL = 0;
    let winS = 0;
    let lossS = 0;
    let wLabel: Lb | null = null;
    let statLbl: Lb | null = null;
    let years = NaN;
    // timeframe.period ("1D", "60")
    const period = n > 0 ? chartTimeframe(bars, chart) : '';
    // Labels alive in creation order: above 505 the oldest are deleted until 500 remain; a label held by a `var`
    // variable (the warning and the statistics label) is never deleted by this limit
    const newLabel = (l: Lb): Lb => {
      labels.push(l);
      if (labels.length > MAX_OBJECTS + 5) {
        for (let k = 0; k < labels.length && labels.length > MAX_OBJECTS;) {
          if (labels[k] === wLabel || labels[k] === statLbl || labels[k] === l) k++;
          else labels.splice(k, 1)[0].deleted = true;
        }
      }
      return l;
    };
    const deleteLabel = (l: Lb | null) => {
      if (l === null || l.deleted) return;
      l.deleted = true;
      labels.splice(labels.indexOf(l), 1);
    };

    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const timeMs = b.time * 1000;
      // alert(message, alert.freq_once_per_bar) with the close in str.tostring's default format
      const call = (what: string) => alertCalls.push({
        time: b.time, message: `${what} — ${tickerid} | Price: ${str.tostring(b.close)}`, freq: 'once_per_bar',
      });
      const fOpen = (dd: number, lbl: boolean) => {
        entry = b.open;
        dir = dd;
        trades += 1;
        if (lbl) {
          newLabel({
            time: b.time, price: dd === 1 ? b.low : b.high, text: dd === 1 ? 'L' : 'S',
            tooltip: `Direction .... : ${dd === 1 ? 'Long' : 'Short'}\nEntry price .. : ${str.tostring(b.open)}\nCapital ...... : ${str.tostring(cap, '#.##')}`,
            style: dd === 1 ? 'label_up' : 'label_down', color: dd === 1 ? TEAL : RED, textColor: WHITE, size: 'tiny', forceOverlay: true,
          });
        }
      };
      const fClose = (isSL: boolean, lbl: boolean) => {
        const dd = dir;
        const ep = entry;
        const xp = isSL ? b.close : b.open;
        exit = xp;
        const entrySafe = Math.max(ep, mintick);
        const exitSafe = Math.max(xp, mintick);
        const pnl = dd === 1 ? exitSafe / entrySafe : entrySafe / exitSafe;
        const newCap = cap * pnl;
        const profit = gt(pnl, 1);
        cap = newCap;
        if (dd === 1) {
          winL += profit ? 1 : 0;
          lossL += profit ? 0 : 1;
        } else {
          winS += profit ? 1 : 0;
          lossS += profit ? 0 : 1;
        }
        if (lbl) {
          newLabel({
            time: b.time, price: dd === 1 ? b.high : b.low, text: isSL ? 'SL' : 'TP',
            tooltip: `Exit type .... : ${isSL ? 'Stop Loss' : 'Take Profit'}\nDirection .... : ${dd === 1 ? 'Long' : 'Short'}\n`
              + `Entry / Exit . : ${str.tostring(ep)} / ${str.tostring(xp)}\nChange ....... : ${str.tostring((pnl - 1) * 100, '#.##')}%\n`
              + `Capital ...... : ${str.tostring(newCap, '#.##')}`,
            style: dd === 1 ? 'label_down' : 'label_up', color: profit ? TEAL : RED, textColor: WHITE, size: 'tiny', forceOverlay: true,
          });
        }
        dir = 0;
      };

      if (isBackTest) {
        const at = (a: boolean[], k: number) => (i - k >= 0 ? a[i - k] : false);
        const sigL = isTest ? at(crossUp, 1) : at(crossUp, 2);
        const sigS = isTest ? at(crossDown, 1) : at(crossDown, 2);
        const candleRef = isTest ? 0 : 1;
        const conflict = at(crossUp, candleRef) && at(crossDown, candleRef);
        const ref = i - candleRef >= 0 ? bars[i - candleRef] : null;
        const okL = (!cfg.useCandleL || (ref !== null && gt(ref.close, ref.open))) && (!cfg.isSudden || !conflict);
        const okS = (!cfg.useCandleS || (ref !== null && lt(ref.close, ref.open))) && (!cfg.isSudden || !conflict);
        const longCond = sigL && okL;
        const shortCond = sigS && okS;
        const canLong = tradeMode !== 'Short Only';
        const canShort = tradeMode !== 'Long Only';
        const slL = cfg.isStopLoss && dir === 1 && le(b.low, entry * (1 - stopLoss));
        const slS = cfg.isStopLoss && dir === -1 && ge(b.high, entry * (1 + stopLoss));
        const slHit = slL || slS;

        // Backtest period
        if (timeMs > now - lenBckTst * YEAR_MS) {
          let reversed = false;
          if (cfg.reverseOnSignal && tradeMode === 'Both') {
            if (dir === 1 && shortCond) {
              fClose(false, cfg.lblInOutSL);
              if (canShort) fOpen(-1, cfg.lblInOutSL);
              reversed = true;
            } else if (dir === -1 && longCond) {
              fClose(false, cfg.lblInOutSL);
              if (canLong) fOpen(1, cfg.lblInOutSL);
              reversed = true;
            }
          }
          if (!reversed) {
            const exitL = dir === 1 && (shortCond || slHit);
            const exitS = dir === -1 && (longCond || slHit);
            if (exitL || exitS) fClose(slHit, cfg.lblInOutSL);
          }
          if (dir === 0) {
            if (longCond && canLong) {
              fOpen(1, cfg.lblInOutSL);
              call('Long entry');
            }
            if (shortCond && canShort) {
              fOpen(-1, cfg.lblInOutSL);
              call('Short entry');
            }
          }
          if (slHit) call('Stop loss');
        }

        // Early warnings: the label lives one bar
        if (cfg.lblWarnings) {
          const before: Lb | null = wLabel; // wLabel[1]
          if (canLong && dir !== 1 && at(crossUp, 1) && !crossDown[i]) {
            wLabel = null; // released before the creation: the new label takes its place
            wLabel = newLabel({
              time: b.time, price: b.low, text: '⚠️',
              tooltip: 'Probable long entry — awaiting confirmation\nIf confirmed, trade executes at next bar open.',
              color: TEAL, style: 'none', textColor: WHITE, size: 'large', forceOverlay: true,
            });
            deleteLabel(before);
            call('Long early warning');
          }
          if (canShort && dir !== -1 && at(crossDown, 1) && !crossUp[i]) {
            wLabel = newLabel({
              time: b.time, price: b.high, text: '⚠️',
              tooltip: 'Probable short entry — awaiting confirmation\nIf confirmed, trade executes at next bar open.',
              color: RED, style: 'none', textColor: WHITE, size: 'large', forceOverlay: true,
            });
            deleteLabel(before);
            call('Short early warning');
          }
          // bool(ta.change(time))
          if (i > 0 && timeMs !== bars[i - 1].time * 1000) deleteLabel(before);
        }

        // Trade statistics
        if (cfg.lblTrdStat) {
          if (i === 0) years = (now - timeMs) / YEAR_MS;
          const totalWin = winL + winS;
          const totalLoss = lossL + lossS;
          const estimated = dir === 1 ? cap * (b.close / entry) : dir === -1 ? cap * (entry / b.close) : cap;
          const winRate = trades > 0 ? (totalWin / trades) * 100 : 0;
          const gainPct = (estimated / dasCapital - 1) * 100;
          const tradeDirTxt = dir === 1 ? 'Long' : dir === -1 ? 'Short' : 'Flat';
          const short = lt(years, lenBckTst);
          const perTxt = short
            ? `${str.tostring(lenBckTst, '#.##')} Yrs *** (${str.tostring(i)} bars max)`
            : `${str.tostring(lenBckTst, '#.##')} Year(s)`;
          const slTxt = cfg.isStopLoss
            ? `${str.tostring(stopLoss * 100, '#.#')}% — level: ${str.tostring(dir === 1 ? entry * (1 - stopLoss) : dir === -1 ? entry * (1 + stopLoss) : 0, '#.##')}`
            : 'Off';
          const sep = '\n═════════════════════════════════════';
          const txt = `☼☾ Trade Statistics | ${period} | ${perTxt} | Trade Mode : ${tradeMode}${sep}`
            + `\nWin Rate : ${str.tostring(winRate, '#.#')}% | Trades : ${str.tostring(trades)}`
            + `\nWin/Loss : ${str.tostring(totalWin)}/${str.tostring(totalLoss)}`
            + ` | Long  W/L : ${str.tostring(winL)}/${str.tostring(lossL)}`
            + ` | Short W/L : ${str.tostring(winS)}/${str.tostring(lossS)}${sep}`
            + `\nGain/Loss : ${str.tostring(gainPct, '#.##')}%`
            + ` | Initial/Final Capital : ${str.tostring(dasCapital, '#.##')}/${str.tostring(estimated, '#.##')}${sep}`
            + `\nStatus : ${tradeDirTxt}`
            + (dir !== 0
              ? ` | Entry Price : ${str.tostring(entry)} | Unrealized : ${str.tostring((estimated / cap - 1) * 100, '#.##')}%\nStop Loss : ${slTxt}`
              : '')
            + (short ? '\n*** max available history for this timeframe' : '');
          const statCol = gt(gainPct, 0) ? TEAL : lt(gainPct, 0) ? RED : GRAY;
          deleteLabel(statLbl);
          statLbl = null;
          statLbl = newLabel({
            time: T(i + 5), price: b.close, text: txt, color: statCol, style: 'label_left', textColor: WHITE, textAlign: 'left',
            size: 'small', forceOverlay: true,
          });
        }
      }

      // Entry / exit price line
      plot0.push({
        time: b.time,
        value: dir !== 0 ? entry : gt(exit, 0) ? exit : NaN,
        color: dir === 1 ? TEAL : dir === -1 ? RED : GRAY,
      });
    }
  }

  // Keltner Channels
  const src = getSourceSeries(bars, cfg.kcSource);
  const kcLength = Math.trunc(cfg.kcLength);
  const nan = () => new Array<number>(n).fill(NaN);
  // Computed whether the channels are displayed or not: the alert conditions read the bands
  let middle = nan();
  switch (cfg.kcMaType) {
    case 'DEMA': {
      const ema1 = ta.ema(src, kcLength);
      const e1 = arr(ema1);
      const e2 = arr(ta.ema(ema1, kcLength));
      middle = e1.map((v, i) => 2 * v - e2[i]);
      break;
    }
    case 'EMA': middle = arr(ta.ema(src, kcLength)); break;
    case 'HMA': middle = arr(ta.hma(src, kcLength)); break;
    case 'SMA': middle = arr(ta.sma(src, kcLength)); break;
    case 'WMA': middle = arr(ta.wma(src, kcLength)); break;
    default: break;
  }
  const range = cfg.bandsStyle === 'True Range' ? arr(ta.rma(ta.tr(bars, true), kcLength))
    : cfg.bandsStyle === 'Average True Range' ? arr(ta.atr(bars, Math.trunc(cfg.atrlength)))
      : cfg.bandsStyle === 'Range' ? arr(ta.rma(new Series(bars, (b) => b.high - b.low), kcLength)) : new Array<number>(n).fill(0);
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const band = (on: boolean, mult: number, sign: number, css: string) => bars.map((b, i) => ({
    time: b.time,
    value: cfg.k && on && shown(i) ? fin(middle[i] + sign * mult * range[i]) : NaN,
    color: String(color.new(css, 73)),
  }));
  const plots = {
    plot0,
    plot1: bars.map((b, i) => ({ time: b.time, value: cfg.k && shown(i) ? fin(middle[i]) : NaN })),
    plot2: band(cfg.isBand3, cfg.kcMult3, 1, cfg.colorK3),
    plot3: band(cfg.isBand2, cfg.kcMult2, 1, cfg.colorK2),
    plot4: band(cfg.isBand1, cfg.kcMult1, 1, cfg.colorK1),
    plot5: band(cfg.isBand1, cfg.kcMult1, -1, cfg.colorK1),
    plot6: band(cfg.isBand2, cfg.kcMult2, -1, cfg.colorK2),
    plot7: band(cfg.isBand3, cfg.kcMult3, -1, cfg.colorK3),
  };
  // fill(..., bandsFill ? colour : na, show_last = Plotting Length)
  const cloud = (css: string) => bars.map((_b, i) => (cfg.bandsFill && shown(i) ? css : 'transparent'));
  const fills = [
    { plot1: 'plot6', plot2: 'plot7', options: { title: 'KC Cloud Low' }, colors: cloud(String(color.new(GREEN, 89))) },
    { plot1: 'plot5', plot2: 'plot6', options: { title: 'KC Cloud Lower' }, colors: cloud(String(color.new('#9ef2e8', 89))) },
    { plot1: 'plot4', plot2: 'plot3', options: { title: 'KC Cloud Higher' }, colors: cloud(String(color.new('#fa8072', 89))) },
    { plot1: 'plot3', plot2: 'plot2', options: { title: 'KC Cloud High' }, colors: cloud(String(color.new(RED, 89))) },
  ];

  // Alert conditions, in the original's order
  const closeArr = bars.map((b) => b.close);
  const bandArr = (mult: number, sign: number) => middle.map((v, i) => v + sign * mult * range[i]);
  const prevFlag = (a: boolean[]) => a.map((_v, i) => i > 0 && a[i - 1]);
  const alerts = alertStates(alertConditions, bars, [
    crossUp, prevFlag(crossUp), crossDown, prevFlag(crossDown),
    crossedOver(closeArr, bandArr(cfg.kcMult3, 1)),
    crossedOver(closeArr, bandArr(cfg.kcMult2, 1)),
    crossedUnder(closeArr, bandArr(cfg.kcMult2, -1)),
    crossedUnder(closeArr, bandArr(cfg.kcMult3, -1)),
  ]);

  // Logo
  const tables: TableData[] = n === 0 ? [] : [{
    position: 'bottom_right', columns: 1, rows: 1,
    cells: [{ column: 0, row: 0, text: '☼☾  ', textSize: 'normal', textColor: TEAL, tooltip: 'SoleMare Analytics' }],
  }];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    lines,
    labels: labels.map(({ deleted: _deleted, ...l }) => l),
    tables,
    alerts,
    alertCalls,
  };
}

export const ElliottWaveOscillatorSignalsByDgt = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
  hasAlertFunction,
};
