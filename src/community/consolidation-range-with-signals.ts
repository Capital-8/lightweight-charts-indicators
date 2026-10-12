/**
 * Consolidation Range with Signals (Zeiierman)
 *
 * Detects ranging conditions with the ADX (ADX of "Range Period" bars, smoothing "ADX Smoothing", below the
 * threshold) or with volatility compression (standard deviation and variance of the log returns and the ATR all
 * below a multiple of their own average). A range filter follows the close: it moves only when the close is more
 * than r away, r = sma(2.618 * |high - low[1]|, 2000) * multiplier, so it is na for the first 2,000 bars.
 *
 * While a range is shown (from a detection until a close leaves the bands of the last detected bar) the filter is
 * drawn with four step lines at 1/3 and 2/3 of the bands on each side and gradient fills; otherwise the plots sit
 * on the close and are transparent. A step of the filter while the range is shown gives an entry with stop-loss and
 * take-profit lines 20 bars long and labels, at most one every "SL/TP Cooldown" bars. At most 500 lines and 500
 * labels are kept.
 *
 * Reference: "Consolidation Range with Signals (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import {
  ta, Series, color, line, label, resetDrawings, setDrawingBar, barInterval, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';

export interface ConsolidationRangeWithSignalsInputs {
  method: 'ADX' | 'Volatility';
  /** Range Period */
  len: number;
  /** Range Multiplier */
  bandMult: number;
  upperCol: string;
  lowerCol: string;
  posCol: string;
  negCol: string;
  /** Show SL/TP Levels */
  showTP: boolean;
  /** SL/TP Cooldown (Bars) */
  cooldown: number;
  slMult: number;
  showSl: boolean;
  tp1Mult: number;
  showTp1: boolean;
  tp2Mult: number;
  showTp2: boolean;
  tp3Mult: number;
  showTp3: boolean;
  entryCol: string;
  slCol: string;
  bullColor: string;
  bearColor: string;
  adxThresh: number;
  adxSmooth: number;
  volMultStd: number;
  volMultVar: number;
  volMultAtr: number;
}

export const defaultInputs: ConsolidationRangeWithSignalsInputs = {
  method: 'ADX',
  len: 10,
  bandMult: 1.8,
  upperCol: '#0060e6',
  lowerCol: '#29fafa',
  posCol: '#0060e6',
  negCol: '#29fafa',
  showTP: true,
  cooldown: 20,
  slMult: 0.4,
  showSl: true,
  tp1Mult: 0.5,
  showTp1: true,
  tp2Mult: 1.0,
  showTp2: false,
  tp3Mult: 2.0,
  showTp3: false,
  entryCol: '#2962ff',
  slCol: '#ff0000',
  bullColor: '#09c10f',
  bearColor: '#ff69cb',
  adxThresh: 17,
  adxSmooth: 10,
  volMultStd: 0.8,
  volMultVar: 0.8,
  volMultAtr: 0.9,
};

const T1 = 'Select the method used for detecting ranging market conditions.\n\n'
  + ' ADX: Uses the Average Directional Index to identify non-trending periods when ADX is below a set threshold.\n\n'
  + ' Volatility: Detects ranges by identifying periods of compression in volatility using standard deviation, variance, and ATR filters.\n\n'
  + ' Price Action: Confirms range by measuring the high-low percentage contraction and requiring a minimum number of DMI crosses, suggesting indecision or balance in price action.';
const T6 = 'Stop Loss multiplier from the filtered base value.';
const T7 = 'Take Profit 1 multiplier from the filtered base value.';
const T8 = 'Take Profit 2 multiplier from the filtered base value.';
const T9 = 'Take Profit 3 multiplier from the filtered base value.';
const RD = 'Range Detection';

export const inputConfig: InputConfig[] = [
  { id: 'method', type: 'string', title: 'Range Detection Method', defval: 'ADX', options: ['ADX', 'Volatility'], group: RD, tooltip: T1 },
  { id: 'len', type: 'int', title: 'Range Period', defval: 10, min: 2, group: RD, tooltip: 'Length or period used for detecting the range.' },
  { id: 'bandMult', type: 'float', title: 'Range Multiplier', defval: 1.8, min: 0.01, step: 0.1, group: RD, tooltip: 'Multiplier applied to the calculated band distance.' },
  { id: 'upperCol', type: 'color', title: 'Range', defval: '#0060e6', group: RD, inline: 'bandcol' },
  { id: 'lowerCol', type: 'color', title: '', defval: '#29fafa', group: RD, inline: 'bandcol' },
  { id: 'posCol', type: 'color', title: 'Trend', defval: '#0060e6', group: RD, inline: 'trendcol' },
  { id: 'negCol', type: 'color', title: '', defval: '#29fafa', group: RD, inline: 'trendcol' },
  { id: 'showTP', type: 'bool', title: 'Show SL/TP Levels', defval: true, group: 'Targets', tooltip: 'Toggle to display Take Profit and Stop Loss levels on the chart.' },
  { id: 'cooldown', type: 'int', title: 'SL/TP Cooldown (Bars)', defval: 20, group: 'Targets', tooltip: 'Minimum number of bars between two consecutive SL/TP entries.' },
  { id: 'slMult', type: 'float', title: 'SL', defval: 0.4, min: 0.01, step: 0.1, group: 'Targets', inline: 'sl', tooltip: T6 },
  { id: 'showSl', type: 'bool', title: '', defval: true, group: 'Targets', inline: 'sl', tooltip: T6 },
  { id: 'tp1Mult', type: 'float', title: 'TP1', defval: 0.5, min: 0.01, step: 0.1, group: 'Targets', inline: 'tp1', tooltip: T7 },
  { id: 'showTp1', type: 'bool', title: '', defval: true, group: 'Targets', inline: 'tp1', tooltip: T7 },
  { id: 'tp2Mult', type: 'float', title: 'TP2', defval: 1.0, min: 0.01, step: 0.1, group: 'Targets', inline: 'tp2', tooltip: T8 },
  { id: 'showTp2', type: 'bool', title: '', defval: false, group: 'Targets', inline: 'tp2', tooltip: T8 },
  { id: 'tp3Mult', type: 'float', title: 'TP3', defval: 2.0, min: 0.01, step: 0.1, group: 'Targets', inline: 'tp3', tooltip: T9 },
  { id: 'showTp3', type: 'bool', title: '', defval: false, group: 'Targets', inline: 'tp3', tooltip: T9 },
  { id: 'entryCol', type: 'color', title: 'Entry', defval: '#2962ff', group: 'Targets', inline: 'tpcol' },
  { id: 'slCol', type: 'color', title: 'SL', defval: '#ff0000', group: 'Targets', inline: 'tpcol' },
  { id: 'bullColor', type: 'color', title: 'TP', defval: '#09c10f', group: 'Targets', inline: 'tpcol' },
  { id: 'bearColor', type: 'color', title: '', defval: '#ff69cb', group: 'Targets', inline: 'tpcol' },
  { id: 'adxThresh', type: 'int', title: 'ADX Threshold', defval: 17, min: 0, step: 1, group: 'ADX', tooltip: 'ADX threshold under which the market is considered ranging.' },
  { id: 'adxSmooth', type: 'int', title: 'ADX Smoothing', defval: 10, min: 0, step: 1, group: 'ADX', tooltip: 'Smoothing period used for the ADX calculation.' },
  { id: 'volMultStd', type: 'float', title: 'StdDev Multiplier', defval: 0.8, min: 0.001, step: 0.1, group: 'Volatility', tooltip: 'Standard deviation compression threshold used to detect low volatility.' },
  { id: 'volMultVar', type: 'float', title: 'Variance Multiplier', defval: 0.8, min: 0.001, step: 0.1, group: 'Volatility', tooltip: 'Variance compression threshold used to detect low volatility.' },
  { id: 'volMultAtr', type: 'float', title: 'ATR Multiplier', defval: 0.9, min: 0.001, step: 0.1, group: 'Volatility', tooltip: 'ATR compression threshold used to detect low volatility.' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend', color: '#2962ff', lineWidth: 1 },
  { id: 'plot1', title: 'MID1', color: '#2962ff', lineWidth: 1, style: 'stepline' },
  { id: 'plot2', title: 'MID2', color: '#2962ff', lineWidth: 1, style: 'stepline' },
  { id: 'plot3', title: 'MID3', color: '#2962ff', lineWidth: 1, style: 'stepline' },
  { id: 'plot4', title: 'MID4', color: '#2962ff', lineWidth: 1, style: 'stepline' },
];

export const metadata = {
  title: 'Consolidation Range with Signals (Zeiierman)',
  shortTitle: 'Consolidation Range with Signals (Zeiierman)',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const nz = (x: number) => (Number.isNaN(x) ? 0 : x);

export function calculate(
  bars: Bar[],
  inputs: Partial<ConsolidationRangeWithSignalsInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.len;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);

  // ADX
  const adx = A(ta.dmi(bars, len, cfg.adxSmooth)[2]);
  // Volatility compression
  const logret = bars.map((b, i) => (i > 0 ? Math.log(b.close / bars[i - 1].close) : NaN));
  const logS = Series.fromArray(bars, logret);
  const stdNowS = ta.stdev(logS, len);
  const stdNow = A(stdNowS);
  const stdAvg = A(ta.sma(stdNowS, len));
  const atrNowS = ta.atr(bars, len);
  const atrNow = A(atrNowS);
  const atrAvg = A(ta.sma(atrNowS, len));
  const varNowS = ta.variance(logS, len);
  const varNow = A(varNowS);
  const varAvg = A(ta.sma(varNowS, len));
  // r = ta.sma(2.618 * |high - low[1]|, 2000) * band_mult
  const diff = bars.map((b, i) => (i > 0 ? 2.618 * Math.abs(b.high - bars[i - 1].low) : NaN));
  const rArr = A(ta.sma(Series.fromArray(bars, diff), 2000)).map((v) => v * cfg.bandMult);

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });

  const rngfilt: number[] = new Array(n).fill(NaN);
  const trendFast: number[] = new Array(n).fill(NaN);
  const mid1: number[] = new Array(n).fill(NaN);
  const mid2: number[] = new Array(n).fill(NaN);
  const mid3: number[] = new Array(n).fill(NaN);
  const mid4: number[] = new Array(n).fill(NaN);
  const plots: Record<string, Array<{ time: number; value: number; color?: string }>> = {
    plot0: [], plot1: [], plot2: [], plot3: [], plot4: [],
  };

  let rangeVisible = false;
  let prevHi = NaN;
  let prevLo = NaN;
  let rangeStartBar = NaN;
  let lastBreakoutBar = NaN;
  let trendColor: string | null = null;

  const upper50 = String(color.new(cfg.upperCol, 50));
  const upper100 = String(color.new(cfg.upperCol, 100));
  const lower50 = String(color.new(cfg.lowerCol, 50));
  const lower100 = String(color.new(cfg.lowerCol, 100));

  const drawLevels = (i: number, entry: number, sl: number, tp1: number, tp2: number, tp3: number, col: string) => {
    if (!cfg.showTP) return;
    const c0 = String(color.new(col, 0));
    const slc = String(color.new(cfg.slCol, 0));
    line.new(i, entry, i + 20, entry, 'bar_index', undefined, cfg.entryCol, undefined, 2);
    if (cfg.showSl) line.new(i, sl, i + 20, sl, 'bar_index', undefined, slc, undefined, 2);
    if (cfg.showTp1) line.new(i, tp1, i + 20, tp1, 'bar_index', undefined, c0, undefined, 2);
    if (cfg.showTp2) line.new(i, tp2, i + 20, tp2, 'bar_index', undefined, c0, undefined, 2);
    if (cfg.showTp3) line.new(i, tp3, i + 20, tp3, 'bar_index', undefined, c0, undefined, 2);
    const lb = (y: number, text: string, c: string) =>
      label.new(i + 20, y, text, 'bar_index', undefined, c, 'label_left', '#ffffff', 'tiny');
    lb(entry, 'Entry', cfg.entryCol);
    if (cfg.showSl) lb(sl, 'SL', slc);
    if (cfg.showTp1) lb(tp1, 'TP 1', c0);
    if (cfg.showTp2) lb(tp2, 'TP 2', c0);
    if (cfg.showTp3) lb(tp3, 'TP 3', c0);
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const t = bars[i].time;
    const c = close[i];
    const r = rArr[i];

    const isADX = lt(adx[i], cfg.adxThresh);
    const isVolatility = lt(stdNow[i], stdAvg[i] * cfg.volMultStd) && lt(varNow[i], varAvg[i] * cfg.volMultVar)
      && lt(atrNow[i], atrAvg[i] * cfg.volMultAtr);
    const methodDetected = (cfg.method === 'ADX' && isADX) || (cfg.method === 'Volatility' && isVolatility);

    if (methodDetected && Number.isNaN(rangeStartBar)) rangeStartBar = i;
    else if (!methodDetected) rangeStartBar = NaN;
    if (methodDetected) rangeVisible = true;

    // var float rngfilt = close: the value before the first bar's update is the first close
    const prev = i > 0 ? nz(rngfilt[i - 1]) : 0;
    const highJump = prev + Math.abs(c - prev) / r * r;
    const lowJump = prev - Math.abs(c - prev) / r * r;
    const hhBreak = gt(c, prev);
    const hhTooClose = lt(c - r, prev);
    const hhShift = c - r;
    const llTooClose = gt(c + r, prev);
    const llShift = c + r;
    const step1 = hhBreak ? (hhTooClose ? prev : hhShift) : (llTooClose ? prev : llShift);
    const hhAbove = ge(c, prev + r);
    const llBelow = le(c, prev - r);
    const filt = hhAbove ? highJump : llBelow ? lowJump : step1;
    rngfilt[i] = filt;
    const prevRngfilt = i > 0 ? nz(rngfilt[i - 1]) : 0;
    const stepUp = gt(filt, prevRngfilt);
    const stepDown = lt(filt, prevRngfilt);

    const hiband = filt + r;
    const loband = filt - r;
    const up = stepUp;
    const down = stepDown;
    trendFast[i] = filt;

    if (methodDetected) {
      prevHi = hiband;
      prevLo = loband;
    }
    if (!methodDetected && i > 0 && (gt(close[i - 1], prevHi) || lt(close[i - 1], prevLo))) rangeVisible = false;

    const midx1 = (hiband - filt) / 3;
    mid1[i] = filt + midx1;
    mid2[i] = mid1[i] + midx1;
    const midx2 = (filt - loband) / 3;
    mid3[i] = filt - midx2;
    mid4[i] = mid3[i] - midx2;

    trendColor = up ? cfg.posCol : down ? cfg.negCol : trendColor;
    const P = (v: number) => (Number.isFinite(v) ? v : NaN);
    const trendCol = rangeVisible
      ? (trendColor === null ? 'transparent' : trendColor)
      : String(color.new(trendColor ?? '#000000', 100));
    plots.plot0.push({ time: t, value: P(rangeVisible ? filt : c), color: trendCol });
    plots.plot1.push({ time: t, value: P(rangeVisible ? mid1[i] : c), color: rangeVisible ? upper50 : upper100 });
    plots.plot2.push({ time: t, value: P(rangeVisible ? mid2[i] : c), color: rangeVisible ? upper50 : upper100 });
    plots.plot3.push({ time: t, value: P(rangeVisible ? mid3[i] : c), color: rangeVisible ? lower50 : lower100 });
    plots.plot4.push({ time: t, value: P(rangeVisible ? mid4[i] : c), color: rangeVisible ? lower50 : lower100 });

    // TP and SL
    const canTrigger = Number.isNaN(lastBreakoutBar) || i - lastBreakoutBar >= cfg.cooldown;
    const enterLong = rangeVisible && stepUp && canTrigger;
    const enterShort = rangeVisible && stepDown && canTrigger;
    const calc = (isLong: boolean) => {
      const offset = r * cfg.slMult;
      const tp1off = r * cfg.tp1Mult;
      const tp2off = r * cfg.tp2Mult;
      const tp3off = r * cfg.tp3Mult;
      return isLong
        ? [filt - offset, filt + tp1off, filt + tp2off, filt + tp3off]
        : [filt + offset, filt - tp1off, filt - tp2off, filt - tp3off];
    };
    if (enterLong && cfg.showTP && (Number.isNaN(lastBreakoutBar) || i - lastBreakoutBar >= cfg.cooldown)) {
      const [s, t1, t2, t3] = calc(true);
      drawLevels(i, c, s, t1, t2, t3, cfg.bullColor);
      lastBreakoutBar = i;
    }
    if (enterShort && cfg.showTP && (Number.isNaN(lastBreakoutBar) || i - lastBreakoutBar >= cfg.cooldown)) {
      const [s, t1, t2, t3] = calc(false);
      drawLevels(i, c, s, t1, t2, t3, cfg.bearColor);
      lastBreakoutBar = i;
    }
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const upperFill = String(color.new(cfg.upperCol, 60));
  const lowerFill = String(color.new(cfg.lowerCol, 60));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      // fill(plotMid2, plotTrend, MID2, TrendFast, color.new(upper_col, 60), na)
      { plot1: 'plot2', plot2: 'plot0', gradient: { topValue: mid2, bottomValue: trendFast,
        topColor: new Array(n).fill(upperFill), bottomColor: new Array(n).fill(null) } },
      // fill(plotMid4, plotTrend, MID4, TrendFast, color.new(lower_col, 60), na)
      { plot1: 'plot4', plot2: 'plot0', gradient: { topValue: mid4, bottomValue: trendFast,
        topColor: new Array(n).fill(lowerFill), bottomColor: new Array(n).fill(null) } },
    ],
    lines: line.all().map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), width: 2,
    })),
    labels: label.all().map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: String(l.color), textColor: '#ffffff',
      style: 'label_left' as const, size: 'tiny' as const,
    })),
  };
}

export const ConsolidationRangeWithSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
