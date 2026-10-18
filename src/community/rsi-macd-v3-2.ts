/**
 * RSI + MACD (RSI Divergence) V3.2
 *
 * The RSI centred on 0 (RSI - 50), orange in the overbought / oversold zones, with regular and hidden divergence
 * labels between price and the RSI pivots (pivot lookback left / right, previous pivot 5..60 bars back). The MACD,
 * its signal and the histogram are scaled into the RSI pane: they are multiplied by the range (highest - lowest) of
 * the centred RSI over the scale lookback divided by the largest of the ranges of the histogram, the MACD and the
 * signal over the same lookback. MACD and signal are drawn as columns; the histogram is hidden by default.
 * Horizontal lines at overbought - 45, oversold - 55 and 0.
 *
 * Reference: "RSI + MACD (RSI Divergence) V3.2" by MKhoa
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: M.Khoa
 */

import { ta, Series, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barTime, barInterval } from '../bar-time';

export interface RsiMacdV32Inputs {
  src: SourceType;
  len: number;
  /** Pivot lookback right */
  lbR: number;
  /** Pivot lookback left */
  lbL: number;
  rangeLower: number;
  rangeUpper: number;
  plotBull: boolean;
  plotHiddenBull: boolean;
  plotBear: boolean;
  plotHiddenBear: boolean;
  overbought: number;
  oversold: number;
  srcd: SourceType;
  fastLength: number;
  slowLength: number;
  signalLength: number;
  smaSource: boolean;
  smaSignal: boolean;
  scaleLb: number;
}

export const defaultInputs: RsiMacdV32Inputs = {
  src: 'close',
  len: 14,
  lbR: 5,
  lbL: 3,
  rangeLower: 5,
  rangeUpper: 60,
  plotBull: true,
  plotHiddenBull: false,
  plotBear: true,
  plotHiddenBear: false,
  overbought: 70,
  oversold: 30,
  srcd: 'close',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  smaSource: false,
  smaSignal: false,
  scaleLb: 200,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'len', type: 'int', title: 'RSI Period', defval: 14, min: 1 },
  { id: 'lbR', type: 'int', title: 'Pivot Lookback Right', defval: 5, min: 1 },
  { id: 'lbL', type: 'int', title: 'Pivot Lookback Left', defval: 3, min: 1 },
  { id: 'rangeLower', type: 'int', title: 'Min Lookback Range', defval: 5, min: 1 },
  { id: 'rangeUpper', type: 'int', title: 'Max Lookback Range', defval: 60, min: 10 },
  { id: 'plotBull', type: 'bool', title: 'Plot Regular Bullish', defval: true },
  { id: 'plotHiddenBull', type: 'bool', title: 'Plot Hidden Bullish', defval: false },
  { id: 'plotBear', type: 'bool', title: 'Plot Regular Bearish', defval: true },
  { id: 'plotHiddenBear', type: 'bool', title: 'Plot Hidden Bearish', defval: false },
  { id: 'overbought', type: 'int', title: 'Overbought Level', defval: 70 },
  { id: 'oversold', type: 'int', title: 'Oversold Level', defval: 30 },
  { id: 'srcd', type: 'source', title: 'MACD Source', defval: 'close' },
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26, min: 1 },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1 },
  { id: 'smaSource', type: 'bool', title: 'Simple MA (Oscillator)', defval: false },
  { id: 'smaSignal', type: 'bool', title: 'Simple MA (Signal Line)', defval: false },
  { id: 'scaleLb', type: 'int', title: 'Scale Lookback', defval: 200, min: 10 },
];

const BULL_COLOR = color.green;
const BEAR_COLOR = color.maroon;
const TEXT_COLOR = color.white;
const COL_GROW_ABOVE = '#26A69A';
const COL_GROW_BELOW = '#FFC1D5';
const COL_FALL_ABOVE = '#B2DFDB';
const COL_FALL_BELOW = '#EF5550';
const MACD_COLOR = String(color.new('#2962ff', 66));
const SIGNAL_COLOR = String(color.new('#e65100', 80));
const RSI_NORMAL_COLOR = String(color.new('#d1d4dc', 11));
const RSI_ZONE_COLOR = color.orange;

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: RSI_NORMAL_COLOR, lineWidth: 1 },
  { id: 'plot1', title: 'Histogram', color: COL_GROW_ABOVE, lineWidth: 1, style: 'columns', display: 'none' },
  { id: 'plot2', title: 'MACD', color: MACD_COLOR, lineWidth: 1, style: 'columns' },
  { id: 'plot3', title: 'Signal', color: SIGNAL_COLOR, lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'RSI + MACD (RSI Divergence)',
  shortTitle: 'RSI + MACD',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiMacdV32Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const { lbL, lbR, rangeLower, rangeUpper } = cfg;

  // RSI centred on 0
  const rsiRaw = A(ta.rsi(getSourceSeries(bars, cfg.src), cfg.len));
  const osc = rsiRaw.map((v) => v - 50);
  const oscLbr = (i: number) => (i - lbR >= 0 ? osc[i - lbR] : NaN);

  // Divergences
  const plFound = A(ta.pivotlow(S(osc), lbL, lbR)).map((v) => !isNaN(v));
  const phFound = A(ta.pivothigh(S(osc), lbL, lbR)).map((v) => !isNaN(v));
  const markers: MarkerData[] = [];
  const interval = barInterval(bars);
  // ta.barssince(plFound[1]) / ta.barssince(phFound[1]): run on every bar (assigned before the conditions)
  let barsSinceLow = NaN;
  let barsSinceHigh = NaN;
  // ta.valuewhen(found, x[lbR], 1): the value on the previous found bar, read on a found bar
  let plPrevOsc = NaN, plPrevLow = NaN;
  let phPrevOsc = NaN, phPrevHigh = NaN;
  for (let i = 0; i < n; i++) {
    if (i > 0 && plFound[i - 1]) barsSinceLow = 0;
    else if (!isNaN(barsSinceLow)) barsSinceLow++;
    if (i > 0 && phFound[i - 1]) barsSinceHigh = 0;
    else if (!isNaN(barsSinceHigh)) barsSinceHigh++;
    const inRangeLow = barsSinceLow >= rangeLower && barsSinceLow <= rangeUpper;
    const inRangeHigh = barsSinceHigh >= rangeLower && barsSinceHigh <= rangeUpper;
    const o = oscLbr(i);
    const low = i - lbR >= 0 ? bars[i - lbR].low : NaN;
    const high = i - lbR >= 0 ? bars[i - lbR].high : NaN;
    const t = i - lbR >= 0 ? barTime(bars, i - lbR, interval) : NaN;

    if (plFound[i]) {
      const bullCond = cfg.plotBull && lt(low, plPrevLow) && gt(o, plPrevOsc) && inRangeLow;
      const hiddenBullCond = cfg.plotHiddenBull && gt(low, plPrevLow) && lt(o, plPrevOsc) && inRangeLow;
      // plotshape(cond ? osc[lbR] : na, offset = -lbR, style = shape.labelup, location = location.absolute)
      if (bullCond && !isNaN(o)) {
        markers.push({ id: 'shape0', time: t, position: 'atPriceBottom', price: o, shape: 'labelUp', color: BULL_COLOR, text: ' Bull ', textColor: TEXT_COLOR });
      }
      if (hiddenBullCond && !isNaN(o)) {
        markers.push({ id: 'shape1', time: t, position: 'atPriceBottom', price: o, shape: 'labelUp', color: BULL_COLOR, text: ' Hidden Bull ', textColor: TEXT_COLOR });
      }
      plPrevOsc = o;
      plPrevLow = low;
    }
    if (phFound[i]) {
      const bearCond = cfg.plotBear && gt(high, phPrevHigh) && lt(o, phPrevOsc) && inRangeHigh;
      const hiddenBearCond = cfg.plotHiddenBear && lt(high, phPrevHigh) && gt(o, phPrevOsc) && inRangeHigh;
      if (bearCond && !isNaN(o)) {
        markers.push({ id: 'shape2', time: t, position: 'atPriceTop', price: o, shape: 'labelDown', color: BEAR_COLOR, text: ' Bear ', textColor: TEXT_COLOR });
      }
      if (hiddenBearCond && !isNaN(o)) {
        markers.push({ id: 'shape3', time: t, position: 'atPriceTop', price: o, shape: 'labelDown', color: BEAR_COLOR, text: ' Hidden Bear ', textColor: TEXT_COLOR });
      }
      phPrevOsc = o;
      phPrevHigh = high;
    }
  }

  // MACD scaled into the RSI pane
  const srcd = getSourceSeries(bars, cfg.srcd);
  const fastMa = A(cfg.smaSource ? ta.sma(srcd, cfg.fastLength) : ta.ema(srcd, cfg.fastLength));
  const slowMa = A(cfg.smaSource ? ta.sma(srcd, cfg.slowLength) : ta.ema(srcd, cfg.slowLength));
  const macd = fastMa.map((v, i) => v - slowMa[i]);
  const signal = A(cfg.smaSignal ? ta.sma(S(macd), cfg.signalLength) : ta.ema(S(macd), cfg.signalLength));
  const hist = macd.map((v, i) => v - signal[i]);
  const range = (x: number[]) => {
    const hi = A(ta.highest(S(x), cfg.scaleLb));
    const lo = A(ta.lowest(S(x), cfg.scaleLb));
    return hi.map((v, i) => v - lo[i]);
  };
  const rsiRange = range(osc);
  const histRange = range(hist);
  const macdRange = range(macd);
  const signalRange = range(signal);
  // math.max with an na argument is na
  const pineMax = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
  const scaledHist: number[] = new Array(n);
  const scaledMacd: number[] = new Array(n);
  const scaledSignal: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const rr = eq(rsiRange[i], 0) ? 0.0001 : rsiRange[i];
    let overall = pineMax(histRange[i], pineMax(macdRange[i], signalRange[i]));
    overall = eq(overall, 0) ? 0.0001 : overall;
    const scaleFactor = rr / overall;
    scaledHist[i] = hist[i] * scaleFactor;
    scaledMacd[i] = macd[i] * scaleFactor;
    scaledSignal[i] = signal[i] * scaleFactor;
  }

  const finite = (v: number) => (Number.isFinite(v) ? v : NaN);
  const plot0 = bars.map((b, i) => ({
    time: b.time,
    value: finite(osc[i]),
    color: ge(rsiRaw[i], cfg.overbought) ? RSI_ZONE_COLOR : le(rsiRaw[i], cfg.oversold) ? RSI_ZONE_COLOR : RSI_NORMAL_COLOR,
  }));
  const plot1 = bars.map((b, i) => {
    const h = scaledHist[i];
    const rising = i > 0 && lt(scaledHist[i - 1], h);
    const c = ge(h, 0) ? (rising ? COL_GROW_ABOVE : COL_FALL_ABOVE) : rising ? COL_GROW_BELOW : COL_FALL_BELOW;
    return { time: b.time, value: finite(h), color: c };
  });
  const plot2 = bars.map((b, i) => ({ time: b.time, value: finite(scaledMacd[i]) }));
  const plot3 = bars.map((b, i) => ({ time: b.time, value: finite(scaledSignal[i]) }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    hlines: [
      { value: cfg.overbought - 45, options: { title: 'Overbought', color: color.gray, linestyle: 'dashed' } },
      { value: cfg.oversold - 55, options: { title: 'Oversold', color: color.gray, linestyle: 'dashed' } },
      // hline(0, 'Middle Line', linestyle = hline.style_dotted): Pine default colour #787B86
      { value: 0, options: { title: 'Middle Line', color: '#787B86', linestyle: 'dotted' } },
    ],
    markers,
  };
}

export const RsiMacdV32 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
