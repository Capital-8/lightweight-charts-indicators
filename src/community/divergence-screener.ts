/**
 * Divergence Screener [Trendoscope®]
 *
 * An oscillator (RSI 14 by default; CCI, CMO, COG, MFI, ROC, stochastic, Williams %R, or an external source) is
 * plotted, and a zigzag of length `Length` is built on it: a pivot high when the oscillator is the highest of the last
 * `Length` bars, a pivot low for the lowest, alternating; the last pivot moves while the oscillator extends, and a
 * pivot is forced at the extreme of the last `Length` bars when no pivot was made for `Length` bars. Each pivot keeps
 * the close, the moving average ("MA Filter", SMA 200 by default) and the external trend signal of its bar, and the
 * ratios of its move to the move before (oscillator and close, 3 decimals).
 *
 * On a new pivot (with "Repaint" the last pivot, else the one before it), the pivot and the pivot two places back
 * (same direction) are compared: when the close and the oscillator do not make the same kind of pivot (higher high /
 * lower high, lower low / higher low), the trend at the older pivot (zigzag: its own direction; MA Difference: the
 * moving average falling or rising between the two pivots; External: the sign of the external signal) gives a
 * divergence (trend with the pivot and the oscillator ratio below the price ratio) or a hidden divergence (against the
 * trend and the oscillator ratio above). It is drawn when no close between the two pivots is beyond the line joining
 * the two closes and no oscillator value is beyond the line joining the two oscillator values: a line and a label
 * ("D" / "H", tooltip with the type, the prices, the ratios and the directions) on the price pane and on the
 * oscillator pane, green / red for bullish / bearish divergences, lime / orange for the hidden ones. A divergence on
 * the same older pivot is replaced when the newer pivot moves. A divergence is broken when a close goes beyond its
 * pivot close.
 *
 * Eight data-window plots give 1 when a divergence of each type was found on the bar (Current; also when it was not
 * drawn) and the type of the last drawn divergence while it is not broken (Last). The alerts of the script
 * (`alert()`, chosen with the four "Alerts" inputs) have no output.
 *
 * As the original (`calc_bars_count = 500`), only the last 500 bars are calculated: the bars before have no values
 * and every function starts on the first of these bars.
 *
 * The zigzag is the library "Zigzag" (version 11), the drawing types "Drawing" (version 3) and the moving averages
 * "oota" (version 1) by Trendoscope; the functions used are written in this file.
 *
 * Chart values read: the chart background colour (label text). Without a chart context: the dark theme colour.
 *
 * Reference: "Divergence Screener [Trendoscope®]" by Trendoscope
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Trendoscope
 */

import {
  ta, Series, math, str, compare, line, label, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type Label,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { backgroundColorOf, type ChartContext } from '../chart-context';

type OscillatorType = 'rsi' | 'cci' | 'cmo' | 'cog' | 'mfi' | 'roc' | 'stoch' | 'wpr';
type SourceName = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'hlcc4' | 'ohlc4' | 'volume';
type MaType = 'EMA' | 'SMA' | 'RMA' | 'HMA' | 'WMA' | 'VWMA' | 'SWMA' | 'LINREG' | 'MEDIAN' | 'MOM' | 'HIGH' | 'LOW'
  | 'MEDIAN_HIGH' | 'MEDIAN_LOW' | 'PERCENTRANK' | 'HIGHLOW';

export interface DivergenceScreenerInputs {
  oscillatorType: OscillatorType;
  /** Oscillator length */
  length: number;
  useExternalOscillator: boolean;
  externalOscillator: SourceName;
  trendMethod: 'Zigzag' | 'MA Difference' | 'External';
  maType: MaType;
  maLength: number;
  externalTrendSignal: SourceName;
  zigzagLength: number;
  repaint: boolean;
  /** Alert on bullish divergence (alerts only: no output) */
  bullishDivergenceAlert: boolean;
  bullishHiddenDivergenceAlert: boolean;
  bearishDivergenceAlert: boolean;
  bearishHiddenDivergenceAlert: boolean;
}

export const defaultInputs: DivergenceScreenerInputs = {
  oscillatorType: 'rsi',
  length: 14,
  useExternalOscillator: false,
  externalOscillator: 'close',
  trendMethod: 'Zigzag',
  maType: 'SMA',
  maLength: 200,
  externalTrendSignal: 'close',
  zigzagLength: 13,
  repaint: true,
  bullishDivergenceAlert: true,
  bullishHiddenDivergenceAlert: true,
  bearishDivergenceAlert: true,
  bearishHiddenDivergenceAlert: true,
};

const SOURCES: SourceName[] = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'hlcc4', 'ohlc4', 'volume'];
const MA_TYPES: MaType[] = ['EMA', 'SMA', 'RMA', 'HMA', 'WMA', 'VWMA', 'SWMA', 'LINREG', 'MEDIAN', 'MOM', 'HIGH', 'LOW',
  'MEDIAN_HIGH', 'MEDIAN_LOW', 'PERCENTRANK', 'HIGHLOW'];

export const inputConfig: InputConfig[] = [
  { id: 'oscillatorType', type: 'string', title: 'Oscillator', defval: 'rsi', options: ['rsi', 'cci', 'cmo', 'cog', 'mfi', 'roc', 'stoch', 'wpr'], inline: 'osc', group: 'Oscillator', display: 'none' },
  { id: 'length', type: 'int', title: '', defval: 14, group: 'Oscillator', inline: 'osc', tooltip: 'Built in Oscillator Type and Length', display: 'none' },
  { id: 'useExternalOscillator', type: 'bool', title: 'Use External Oscillator', defval: false, inline: 'eosc', group: 'Oscillator', display: 'none' },
  { id: 'externalOscillator', type: 'source', title: '', defval: 'close', options: SOURCES, tooltip: 'Use external oscillator instead of the built ins', inline: 'eosc', group: 'Oscillator', display: 'none' },
  {
    id: 'trendMethod', type: 'string', title: 'Trend Detection Method', defval: 'Zigzag', options: ['Zigzag', 'MA Difference', 'External'], group: 'Trend', display: 'none',
    tooltip: 'Method to identify trend. \n\tZigzag - HH, HL on the starting pivot of divergence line is considered as uptrend and LL, LH on the starting pivot of divergence line is considered as downtrend\n\tMA Difference - Difference between moving average of divergence line pivot will define the trend\n\tExternal - Use External Oscillator Input',
  },
  { id: 'maType', type: 'string', title: 'MA Filter', defval: 'SMA', options: MA_TYPES, inline: 'ma', group: 'Trend', display: 'none' },
  { id: 'maLength', type: 'int', title: '', defval: 200, min: 5, step: 50, inline: 'ma', group: 'Trend', display: 'none', tooltip: 'Moving Average to identify trend. Direction of moving average between the divergence pivots identify trend' },
  { id: 'externalTrendSignal', type: 'source', title: 'External Trend Signal', defval: 'close', options: SOURCES, tooltip: 'Use External trend signal instead of the built in. The external indicator should return positive value for uptrend and negative value for downtrend', group: 'Trend', display: 'none' },
  { id: 'zigzagLength', type: 'int', title: 'Length', defval: 13, group: 'Zigzag', tooltip: 'Zigzag Length', display: 'none' },
  {
    id: 'repaint', type: 'bool', title: 'Repaint', defval: true, group: 'Miscellaneous', display: 'none',
    tooltip: 'If selected, divergence lines repaint as per the latest info. If repaint is disabled, then the divergence is calculated based on confirmed pivots only. Hence, the signals will be delayed till the pivot is confirmed.',
  },
  { id: 'bullishDivergenceAlert', type: 'bool', title: 'Bullish Divergence', defval: true, tooltip: 'Alert on bullish divergence', group: 'Alerts', display: 'none' },
  { id: 'bullishHiddenDivergenceAlert', type: 'bool', title: 'Bullish Hidden Divergence', defval: true, tooltip: 'Alert on bullish hidden divergence', group: 'Alerts', display: 'none' },
  { id: 'bearishDivergenceAlert', type: 'bool', title: 'Bearish Divergence', defval: true, tooltip: 'Alert on bearish divergence', group: 'Alerts', display: 'none' },
  { id: 'bearishHiddenDivergenceAlert', type: 'bool', title: 'Bearish Hidden Divergence', defval: true, tooltip: 'Alert on bearish hidden divergence', group: 'Alerts', display: 'none' },
];

const GREEN = '#4CAF50';
const RED = '#F23645';
const LIME = '#00E676';
const ORANGE = '#FF9800';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Oscillator', color: '#2962FF', lineWidth: 1 },
  { id: 'plot1', title: 'Bullish Divergence (Current)', color: GREEN, lineWidth: 1, display: 'data_window' },
  { id: 'plot2', title: 'Bearish Divergence (Current)', color: RED, lineWidth: 1, display: 'data_window' },
  { id: 'plot3', title: 'Bullish Hidden Divergence (Current)', color: LIME, lineWidth: 1, display: 'data_window' },
  { id: 'plot4', title: 'Bearish Hidden Divergence (Current)', color: RED, lineWidth: 1, display: 'data_window' },
  { id: 'plot5', title: 'Bullish Divergence (Last)', color: GREEN, lineWidth: 1, display: 'data_window' },
  { id: 'plot6', title: 'Bearish Divergence (Last)', color: RED, lineWidth: 1, display: 'data_window' },
  { id: 'plot7', title: 'Bullish Hidden Divergence (Last)', color: LIME, lineWidth: 1, display: 'data_window' },
  { id: 'plot8', title: 'Bearish Hidden Divergence (Last)', color: RED, lineWidth: 1, display: 'data_window' },
];

export const metadata = {
  title: 'Divergence Screener [Trendoscope®]',
  shortTitle: 'DS1.1[Trendoscope®]',
  overlay: false,
};

/** indicator(calc_bars_count = 500, max_lines_count = 500, max_labels_count = 500, max_polylines_count = 100) */
const CALC_BARS = 500;
const MAX_LINES = 500;
const MAX_LABELS = 500;
const MAX_POLYLINES = 100;
/** Zigzag.new(zigzagLength, 300, 0): pivots kept */
const MAX_PIVOTS = 300;

enum DivergenceType {
  BullishDivergence = 'Bullish Divergence',
  BearishDivergence = 'Bearish Divergence',
  BullishHiddenDivergence = 'Bullish Hidden Divergence',
  BearishHiddenDivergence = 'Bearish Hidden Divergence',
  None = 'None',
}

const TYPE_COLOR: Record<string, string> = {
  [DivergenceType.BullishDivergence]: GREEN,
  [DivergenceType.BearishDivergence]: RED,
  [DivergenceType.BullishHiddenDivergence]: LIME,
  [DivergenceType.BearishHiddenDivergence]: ORANGE,
};

/** Zigzag library: a pivot (chart point, direction 1 / -1 / 2 / -2, ratios, indicator values and ratios) */
interface Pivot {
  index: number;
  /** Bar time in ms (chart.point time) */
  time: number;
  price: number;
  dir: number;
  ratio: number;
  sizeRatio: number;
  barRatio: number;
  indicatorValues: number[];
  indicatorRatios: number[];
}

interface Point { index: number; time: number; price: number }

/** Drawing library: Line / Label wrappers with their chart object */
interface DivergenceObject {
  priceStart: Point;
  priceEnd: Point;
  lines: Line[];
  labels: Label[];
  pricePoint: Point;
  divergenceType: DivergenceType;
  broken: boolean;
}

function sourceValues(bars: Bar[], src: SourceName): number[] {
  return bars.map((b) => {
    switch (src) {
      case 'open': return b.open;
      case 'high': return b.high;
      case 'low': return b.low;
      case 'hl2': return (b.high + b.low) / 2;
      case 'hlc3': return (b.high + b.low + b.close) / 3;
      case 'hlcc4': return (b.high + b.low + 2 * b.close) / 4;
      case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
      case 'volume': return b.volume ?? NaN;
      default: return b.close;
    }
  });
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DivergenceScreenerInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels'> & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { gt, ge, lt } = compare;
  const n = bars.length;
  // calc_bars_count: the script runs on the last 500 bars; bar_index is 0 on the first of them
  const start = Math.max(0, n - CALC_BARS);
  const cb = bars.slice(start);
  const m = cb.length;
  const ms = n > 0 && bars[0].time >= 1e12;
  const timeMs = (j: number) => (ms ? cb[j].time : cb[j].time * 1000);
  const bgColor = backgroundColorOf(chart);
  const length = Math.trunc(cfg.length);
  const zigzagLength = Math.trunc(cfg.zigzagLength);
  const maLength = Math.trunc(cfg.maLength);

  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const S = (a: number[]) => Series.fromArray(cb, a);
  const close = cb.map((b) => b.close);
  const closeS = S(close);
  const volumeS = S(cb.map((b) => b.volume ?? NaN));

  // oscillator(type, length) or the external source
  let osc: number[];
  if (cfg.useExternalOscillator) {
    osc = sourceValues(cb, cfg.externalOscillator);
  } else {
    switch (cfg.oscillatorType) {
      case 'cci': osc = A(ta.cci(closeS, length)); break;
      case 'cmo': osc = A(ta.cmo(closeS, length)); break;
      case 'cog': osc = A(ta.cog(closeS, length)); break;
      case 'mfi': osc = A(ta.mfi(closeS, length, volumeS)); break;
      case 'roc': osc = A(ta.roc(closeS, length)); break;
      case 'stoch': osc = A(ta.stoch(closeS, S(cb.map((b) => b.high)), S(cb.map((b) => b.low)), length)); break;
      case 'wpr': osc = A(ta.wpr(cb, length)); break;
      default: osc = A(ta.rsi(closeS, length));
    }
  }

  // maType.ma(maLength): custom series of the close (oota)
  const maOf = (): number[] => {
    switch (cfg.maType) {
      case 'EMA': return A(ta.ema(closeS, maLength));
      case 'RMA': return A(ta.rma(closeS, maLength));
      case 'HMA': return A(ta.hma(closeS, maLength));
      case 'WMA': return A(ta.wma(closeS, maLength));
      case 'VWMA': return A(ta.vwma(closeS, maLength, volumeS));
      case 'SWMA': return A(ta.swma(closeS));
      case 'LINREG': return A(ta.linreg(closeS, maLength, 0));
      case 'MEDIAN': return A(ta.median(closeS, maLength));
      case 'MOM': return A(ta.mom(closeS, maLength));
      case 'HIGH': return A(ta.highest(closeS, maLength));
      case 'LOW': return A(ta.lowest(closeS, maLength));
      case 'MEDIAN_HIGH': return A(ta.median(ta.highest(closeS, maLength), maLength));
      case 'MEDIAN_LOW': return A(ta.median(ta.lowest(closeS, maLength), maLength));
      case 'PERCENTRANK': return A(ta.percentrank(closeS, maLength));
      case 'HIGHLOW': {
        const h = A(ta.highest(S(cb.map((b) => b.high)), maLength));
        const l = A(ta.lowest(S(cb.map((b) => b.low)), maLength));
        return h.map((v, j) => (v + l[j]) / 2);
      }
      default: return A(ta.sma(closeS, maLength));
    }
  };
  const ma = maOf();
  const external = sourceValues(cb, cfg.externalTrendSignal);
  // the indicator matrix of each bar: close, moving average, external trend signal
  const indicatorsAt = (j: number) => [close[j], ma[j], external[j]];

  // PivotCandle.init(): highestbars / lowestbars / highest / lowest of the oscillator, every bar
  const oscS = S(osc);
  const pHighBar = A(ta.highestbars(oscS, zigzagLength));
  const pLowBar = A(ta.lowestbars(oscS, zigzagLength));
  const pHigh = A(ta.highest(oscS, zigzagLength));
  const pLow = A(ta.lowest(oscS, zigzagLength));

  // Zigzag state
  const pivots: Pivot[] = [];
  const flags = { newPivot: false, doublePivot: false, updateLastPivot: false };
  const ratio3 = (a: number, b: number) => math.round(Math.abs(a) / Math.abs(b), 3);

  /** Zigzag addnewpivot(pivot, candle, names): indicator values of the candle bar, ratios to the pivots before */
  const addNewPivot = (pivot: Pivot, candleBar: number) => {
    const dir = Math.sign(pivot.dir);
    pivot.indicatorValues = indicatorsAt(candleBar);
    pivot.indicatorRatios = [];
    if (pivots.length >= 1) {
      const lastPivot = pivots[0];
      const lastValue = lastPivot.price;
      if (Math.sign(lastPivot.dir) === Math.sign(dir)) throw new Error('Direction mismatch');
      if (pivots.length >= 2) {
        const llastPivot = pivots[1];
        const value = pivot.price;
        const llastValue = llastPivot.price;
        pivot.dir = gt(dir * value, dir * llastValue) ? dir * 2 : dir;
        pivot.ratio = ratio3(lastValue - value, llastValue - lastValue);
        pivot.barRatio = ratio3(lastPivot.index - pivot.index, llastPivot.index - lastPivot.index);
        if (pivots.length >= 3) pivot.sizeRatio = ratio3(lastValue - value, pivots[2].price - llastValue);
        const llastIndicators = llastPivot.indicatorValues;
        const lastIndicators = lastPivot.indicatorValues;
        pivot.indicatorValues.forEach((v, k) => {
          pivot.indicatorRatios.push(ratio3(lastIndicators[k] - v, llastIndicators[k] - lastIndicators[k]));
        });
      }
    }
    pivots.unshift(pivot);
    if (pivots.length > MAX_PIVOTS) pivots.pop();
  };
  const newPivotAt = (index: number, price: number, dir: number): Pivot => ({
    index, time: timeMs(index), price, dir, ratio: 1, sizeRatio: 1, barRatio: 1, indicatorValues: [], indicatorRatios: [],
  });

  /** Zigzag calculate(array.from(oscillator), indicators, names) on bar j */
  const zigzagCalculate = (j: number) => {
    let pDir = 1;
    let lastPivot: Pivot | null = null;
    flags.updateLastPivot = false;
    flags.newPivot = false;
    flags.doublePivot = false;
    let distanceFromLastPivot = 0;
    let forceDoublePivot = false;
    const hBar = pHighBar[j];
    const lBar = pLowBar[j];
    if (pivots.length > 0) {
      lastPivot = pivots[0];
      pDir = Math.sign(lastPivot.dir);
      distanceFromLastPivot = j - lastPivot.index;
    }
    if (pivots.length > 1) {
      const llastPivot = pivots[1];
      forceDoublePivot = pDir === 1 && lBar === 0 ? lt(pLow[j], llastPivot.price)
        : pDir === -1 && hBar === 0 ? gt(pHigh[j], llastPivot.price) : false;
    }
    const overflow = distanceFromLastPivot >= zigzagLength;

    if (((pDir === 1 && hBar === 0) || (pDir === -1 && lBar === 0)) && pivots.length >= 1) {
      const value = pDir === 1 ? pHigh[j] : pLow[j];
      const last = lastPivot as Pivot;
      const removeOld = ge(value * last.dir, last.price * last.dir);
      if (removeOld) {
        flags.updateLastPivot = true;
        flags.newPivot = true;
        pivots.shift();
        addNewPivot(newPivotAt(j, value, pDir), j);
      }
    }
    if ((pDir === 1 && lBar === 0) || (pDir === -1 && hBar === 0 && (!flags.newPivot || forceDoublePivot))) {
      const value = pDir === 1 ? pLow[j] : pHigh[j];
      addNewPivot(newPivotAt(j, value, -pDir), j);
      flags.doublePivot = flags.newPivot;
      flags.newPivot = true;
    }
    if (overflow && !flags.newPivot) {
      const ipivot = pDir === 1 ? pLow[j] : pHigh[j];
      const ipivotbar = j + (pDir === 1 ? lBar : hBar);
      // iCandle = candle[newBar - ipivotbar]: the indicator values of the pivot bar
      addNewPivot(newPivotAt(ipivotbar, ipivot, -pDir), ipivotbar);
      flags.newPivot = true;
    }
  };

  const divergenceTypeOf = (direction: number, divergence: number): DivergenceType => (direction > 0
    ? (divergence > 0 ? DivergenceType.BearishDivergence : DivergenceType.BearishHiddenDivergence)
    : (divergence > 0 ? DivergenceType.BullishDivergence : DivergenceType.BullishHiddenDivergence));
  const pivotDirection = (dir: number, ratio: number) => (dir > 0
    ? (gt(ratio, 1) ? 'Higher High' : 'Lower High')
    : gt(ratio, 1) ? 'Lower Low' : 'Higher Low');
  /** Drawing library Line.get_price(bar): the line through the two points (no bounds) */
  const priceOnLine = (a: Point, b: Point, bar: number) => a.price + (bar - a.index) * ((b.price - a.price) / (b.index - a.index));

  const deleteObject = (o: DivergenceObject) => {
    for (const l of o.lines) line.delete(l);
    for (const l of o.labels) label.delete(l);
  };

  const trendMethodInt = cfg.trendMethod === 'Zigzag' ? 1 : cfg.trendMethod === 'External' ? 3 : 2;
  const startIndex = cfg.repaint ? 0 : 1;
  const divergenceObjects: DivergenceObject[] = [];

  /** divergence(zigzag, divergenceObjects, properties): the divergence type found on the bar */
  const divergence = (): DivergenceType => {
    let divergenceType = DivergenceType.None;
    if (pivots.length > 2 + startIndex) {
      const lastPivot = pivots[startIndex];
      const llastPivot = pivots[startIndex + 2];
      let skip = false;
      if (flags.updateLastPivot && divergenceObjects.length > 0) {
        const lastDivergence = divergenceObjects[divergenceObjects.length - 1];
        const divergenceStartBar = lastDivergence.priceStart.index;
        const llastPivotBar = llastPivot.index;
        const divergenceEndBar = lastDivergence.priceEnd.index;
        const lastPivotBar = lastPivot.index;
        if (llastPivotBar === divergenceStartBar && lastPivotBar > divergenceEndBar) {
          deleteObject(divergenceObjects.pop() as DivergenceObject);
        }
        skip = llastPivotBar === divergenceStartBar && lastPivotBar === divergenceEndBar;
      }
      if (flags.newPivot && !skip) {
        const dir = Math.sign(lastPivot.dir);
        if (lastPivot.indicatorRatios.length === 0) throw new Error('Index 0 is out of bounds, array size is 0');
        const lastPrice = lastPivot.indicatorValues[0];
        const oscRatio = lastPivot.ratio;
        const priceRatio = lastPivot.indicatorRatios[0];
        const priceDirection = pivotDirection(lastPivot.dir, priceRatio);
        const oscillatorDirection = pivotDirection(lastPivot.dir, oscRatio);
        const lastTrend = lastPivot.indicatorValues[2];
        const lastMa = lastPivot.indicatorValues[1];
        const pricePoint: Point = { time: lastPivot.time, index: lastPivot.index, price: lastPrice };
        const oscillatorPoint: Point = { time: lastPivot.time, index: lastPivot.index, price: lastPivot.price };

        if (priceDirection !== oscillatorDirection && llastPivot.indicatorRatios.length > 0) {
          const llastPrice = llastPivot.indicatorValues[0];
          const llastRatio = llastPivot.indicatorRatios[0];
          const llastMa = llastPivot.indicatorValues[1];
          const lastPricePoint: Point = { time: llastPivot.time, index: llastPivot.index, price: llastPrice };
          const llastOscillatorPoint: Point = { time: llastPivot.time, index: llastPivot.index, price: llastPivot.price };

          const sentiment = Math.sign(oscRatio - priceRatio);
          const trend = trendMethodInt === 3 ? Math.sign(lastTrend)
            : trendMethodInt === 1 ? Math.sign(dir * (llastRatio - 1)) : Math.sign(llastMa - lastMa);
          // na compares false (== and !=)
          const div = !isNaN(trend) && trend === dir && sentiment < 0 ? 1
            : !isNaN(trend) && trend !== dir && sentiment > 0 ? -1 : 0;
          if (div !== 0) {
            divergenceType = divergenceTypeOf(dir, div);
            let validDivergence = true;
            // for bar = lastPricePoint.index + 1 to pricePoint.index - 1 by 1 (counts down when from > to)
            const from = lastPricePoint.index + 1;
            const to = pricePoint.index - 1;
            const step = from <= to ? 1 : -1;
            for (let bar = from; step > 0 ? bar <= to : bar >= to; bar += step) {
              const priceAtBar = bar >= 0 && bar < m ? close[bar] : NaN;
              const oscillatorAtBar = bar >= 0 && bar < m ? osc[bar] : NaN;
              if (gt(priceAtBar * dir, priceOnLine(lastPricePoint, pricePoint, bar) * dir)
                || gt(oscillatorAtBar * dir, priceOnLine(llastOscillatorPoint, oscillatorPoint, bar) * dir)) {
                validDivergence = false;
                break;
              }
            }
            if (validDivergence) {
              const regular = divergenceType === DivergenceType.BullishDivergence
                || divergenceType === DivergenceType.BearishDivergence;
              const text = regular ? 'D' : 'H';
              const tooltip = `${divergenceType}\nPrice : ${str.tostring(lastPrice)} ( ${str.tostring(priceRatio)} ) - ${priceDirection}\n`
                + `Oscillator :${str.tostring(lastMa)} ( ${str.tostring(oscRatio)} ) - ${oscillatorDirection}`;
              const css = TYPE_COLOR[divergenceType];
              const bullish = divergenceType === DivergenceType.BullishDivergence
                || divergenceType === DivergenceType.BullishHiddenDivergence;
              const style = bullish ? 'label_up' : 'label_down';
              // DivergenceObject.draw(): price line, oscillator line, price label, oscillator label
              const lines = [
                line.new(lastPricePoint.time, lastPricePoint.price, pricePoint.time, pricePoint.price, 'bar_time', 'none', css, 'solid', 1, true),
                line.new(llastOscillatorPoint.time, llastOscillatorPoint.price, oscillatorPoint.time, oscillatorPoint.price, 'bar_time', 'none', css, 'solid', 1, false),
              ];
              const labels = [
                label.new(pricePoint.time, pricePoint.price, text, 'bar_time', 'price', css, style, bgColor, 'small', 'center', tooltip, 'default', true),
                label.new(oscillatorPoint.time, oscillatorPoint.price, text, 'bar_time', 'price', css, style, bgColor, 'small', 'center', tooltip, 'default', false),
              ];
              divergenceObjects.push({
                priceStart: lastPricePoint, priceEnd: pricePoint, lines, labels, pricePoint, divergenceType, broken: false,
              });
            }
          }
        }
      }
    }
    return divergenceType;
  };

  resetDrawings({ line: MAX_LINES, label: MAX_LABELS, polyline: MAX_POLYLINES });
  const plots: number[][] = Array.from({ length: 9 }, () => new Array<number>(n).fill(NaN));
  const current = [DivergenceType.BullishDivergence, DivergenceType.BearishDivergence,
    DivergenceType.BullishHiddenDivergence, DivergenceType.BearishHiddenDivergence];

  for (let j = 0; j < m; j++) {
    setDrawingBar(j, j === m - 1);
    const i = start + j;
    plots[0][i] = osc[j];
    zigzagCalculate(j);
    const currentDivergence = divergence();

    for (const d of divergenceObjects) {
      const direction = d.divergenceType === DivergenceType.BullishDivergence
        || d.divergenceType === DivergenceType.BullishHiddenDivergence ? 1 : -1;
      if (!d.broken && gt(d.pricePoint.price * direction, close[j] * direction)) d.broken = true;
    }
    const lastObject = divergenceObjects.length > 0 ? divergenceObjects[divergenceObjects.length - 1] : null;
    const lastDivergence = lastObject === null || lastObject.broken ? DivergenceType.None : lastObject.divergenceType;
    current.forEach((t, k) => {
      plots[1 + k][i] = currentDivergence === t ? 1 : 0;
      plots[5 + k][i] = lastDivergence === t ? 1 : 0;
    });
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars, ms ? 'ms' : 's');
  const plotData: IndicatorResult['plots'] = {};
  plots.forEach((values, k) => {
    plotData[`plot${k}`] = values.map((v, i) => ({ time: bars[i].time, value: v }));
  });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: plotData,
    lines: (out.lines ?? []) as LineDrawingData[],
    labels: (out.labels ?? []) as LabelData[],
  };
}

export const DivergenceScreener = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
