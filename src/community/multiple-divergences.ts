/**
 * Multiple Divergences NON-REPAINT
 *
 * Counts, as the original, how many of 10 oscillators show each kind of divergence on the bar: RSI 14, MACD
 * 12 / 26 / 9 line and histogram, Momentum 10, CCI 10, OBV, Stochastic 14 smoothed by an SMA 3, DI oscillator
 * (fixnan(100 * rma(change(high) + change(low), 14) / rma(tr, 14))), volume weighted MACD (VWMA 12 - VWMA 26) and
 * Chaikin Money Flow 21, each with its check box. Per oscillator (each from the first bar where it exists, na where
 * it divides by zero):
 * - plFound / phFound: pivotlow / pivothigh of the oscillator (lbL left, lbR right; found on the bar lbR bars after
 *   the pivot, na values skipped);
 * - regular bullish: plFound, low[lbR] below and osc[lbR] above their values on the pivot low found before
 *   (valuewhen(plFound, x, 1)), and barssince(plFound[1]) between the min and max of the lookback range;
 *   hidden bullish: low[lbR] above and osc[lbR] below; regular / hidden bearish: the same on the pivot highs (high
 *   higher and osc lower / high lower and osc higher).
 *
 * Markers (plotshape, location absolute, as the original): one label per kind and count, "1" to "8" and "8+" for
 * more than 8 (a count above 8 is shown whatever the minimum count), under the pivot low (low[lbR] - 5 ticks) for
 * the bullish kinds and over the pivot high (high[lbR] + 5 ticks) for the bearish kinds, on the bar that confirms
 * the pivot (lbR bars earlier with "Repaint or not?"); teal regular bullish, red regular bearish, green hidden
 * bullish, orange hidden bearish. The symbol tick (`syminfo.mintick`) comes from the chart context.
 *
 * Reference: "Multiple Divergences NON-REPAINT" by PeterO
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';

export interface MultipleDivergencesInputs {
  /** Repaint or not? (the shapes lbR bars back) */
  offset: boolean;
  minDivCount: number;
  lbR: number;
  lbL: number;
  rangeUpper: number;
  rangeLower: number;
  plotBull: boolean;
  plotHiddenBull: boolean;
  plotBear: boolean;
  plotHiddenBear: boolean;
  calcmacd: boolean;
  calcmacda: boolean;
  calcrsi: boolean;
  calcstoc: boolean;
  calccci: boolean;
  calcmom: boolean;
  calcobv: boolean;
  calcdi: boolean;
  calcvwmacd: boolean;
  calccmf: boolean;
}

export const defaultInputs: MultipleDivergencesInputs = {
  offset: false,
  minDivCount: 2,
  lbR: 1,
  lbL: 3,
  rangeUpper: 60,
  rangeLower: 1,
  plotBull: true,
  plotHiddenBull: true,
  plotBear: true,
  plotHiddenBear: true,
  calcmacd: true,
  calcmacda: true,
  calcrsi: true,
  calcstoc: true,
  calccci: true,
  calcmom: true,
  calcobv: true,
  calcdi: true,
  calcvwmacd: true,
  calccmf: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'offset', type: 'bool', title: 'Repaint or not?', defval: false },
  { id: 'minDivCount', type: 'int', title: 'Minimum Div Count to Display', defval: 2, min: 1, max: 10 },
  { id: 'lbR', type: 'int', title: 'Pivot Lookback Right', defval: 1, min: 1 },
  { id: 'lbL', type: 'int', title: 'Pivot Lookback Left', defval: 3, min: 1 },
  { id: 'rangeUpper', type: 'int', title: 'Max of Lookback Range', defval: 60, min: 1 },
  { id: 'rangeLower', type: 'int', title: 'Min of Lookback Range', defval: 1, min: 1 },
  { id: 'plotBull', type: 'bool', title: 'Plot Bullish', defval: true },
  { id: 'plotHiddenBull', type: 'bool', title: 'Plot Hidden Bullish', defval: true },
  { id: 'plotBear', type: 'bool', title: 'Plot Bearish', defval: true },
  { id: 'plotHiddenBear', type: 'bool', title: 'Plot Hidden Bearish', defval: true },
  { id: 'calcmacd', type: 'bool', title: 'MACD', defval: true },
  { id: 'calcmacda', type: 'bool', title: 'MACD Histogram', defval: true },
  { id: 'calcrsi', type: 'bool', title: 'RSI', defval: true },
  { id: 'calcstoc', type: 'bool', title: 'Stochastic', defval: true },
  { id: 'calccci', type: 'bool', title: 'CCI', defval: true },
  { id: 'calcmom', type: 'bool', title: 'Momentum', defval: true },
  { id: 'calcobv', type: 'bool', title: 'OBV', defval: true },
  { id: 'calcdi', type: 'bool', title: 'Diosc', defval: true },
  { id: 'calcvwmacd', type: 'bool', title: 'VWmacd', defval: true },
  { id: 'calccmf', type: 'bool', title: 'Chaikin Money Flow', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Dummy', color: 'transparent', lineWidth: 0 },
];

export const metadata = {
  title: 'Multiple Divergences',
  shortTitle: 'Multi Div',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<MultipleDivergencesInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { minDivCount, lbR, lbL, rangeUpper, rangeLower, plotBull, plotHiddenBull, plotBear, plotHiddenBear } = cfg;

  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v == null ? NaN : v));
  const closeSeries = new Series(bars, (b) => b.close);
  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  const volume = bars.map((b) => b.volume ?? 0);
  const volumeSeries = Series.fromArray(bars, volume);
  const div = (a: number, b: number) => (b === 0 ? NaN : a / b); // x / 0 is na in Pine

  // ---- The 10 oscillators of the original (na until their windows are full) ----
  // rsi = rsi(close, 14)
  const rsi = A(ta.rsi(closeSeries, 14));
  // [macd, signal, deltamacd] = macd(close, 12, 26, 9)
  const ema12 = A(ta.ema(closeSeries, 12));
  const ema26 = A(ta.ema(closeSeries, 26));
  const macd = ema12.map((v, i) => v - ema26[i]);
  const signal = A(ta.ema(Series.fromArray(bars, macd), 9));
  const deltamacd = macd.map((v, i) => v - signal[i]);
  // moment = mom(close, 10)
  const moment = A(ta.mom(closeSeries, 10));
  // cci = cci(close, 10)
  const cci = A(ta.cci(closeSeries, 10));
  // obv = cum(change(close) > 0 ? volume : change(close) < 0 ? -volume : 0 * volume)
  const obv: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ch = i > 0 ? bars[i].close - bars[i - 1].close : NaN;
    obv[i] = (i > 0 ? obv[i - 1] : 0) + (ch > 0 ? volume[i] : ch < 0 ? -volume[i] : 0);
  }
  // stk = sma(stoch(close, high, low, 14), 3)
  const stk = A(ta.sma(ta.stoch(closeSeries, highSeries, lowSeries, 14), 3));
  // DI = change(high) - (-change(low)), trur = rma(tr, 14), diosc = fixnan(100 * rma(DI, 14) / trur)
  const di = bars.map((b, i) => (i > 0 ? (b.high - bars[i - 1].high) + (b.low - bars[i - 1].low) : NaN));
  const rmaDi = A(ta.rma(Series.fromArray(bars, di), 14));
  const trur = A(ta.rma(ta.tr(bars), 14));
  const diosc: number[] = new Array(n);
  {
    let last = NaN;
    for (let i = 0; i < n; i++) {
      const v = div(100 * rmaDi[i], trur[i]);
      if (Number.isFinite(v)) last = v;
      diosc[i] = last;
    }
  }
  // vwmacd = vwma(close, 12) - vwma(close, 26)
  const vwma12 = A(ta.vwma(closeSeries, 12, volumeSeries));
  const vwma26 = A(ta.vwma(closeSeries, 26, volumeSeries));
  const vwmacd = vwma12.map((v, i) => v - vwma26[i]);
  // Cmfm = ((close - low) - (high - close)) / (high - low), Cmfv = Cmfm * volume, cmf = sma(Cmfv, 21) / sma(volume, 21)
  const cmfv = bars.map((b, i) => div((b.close - b.low) - (b.high - b.close), b.high - b.low) * volume[i]);
  const cmfNum = A(ta.sma(Series.fromArray(bars, cmfv), 21));
  const cmfDen = A(ta.sma(volumeSeries, 21));
  const cmf = cmfNum.map((v, i) => div(v, cmfDen[i]));

  // In the order of the original's counting: rsi, macd, deltamacd, moment, cci, obv, stk, diosc, vwmacd, cmf
  const oscillators: Array<{ on: boolean; values: number[] }> = [
    { on: cfg.calcrsi, values: rsi },
    { on: cfg.calcmacd, values: macd },
    { on: cfg.calcmacda, values: deltamacd },
    { on: cfg.calcmom, values: moment },
    { on: cfg.calccci, values: cci },
    { on: cfg.calcobv, values: obv },
    { on: cfg.calcstoc, values: stk },
    { on: cfg.calcdi, values: diosc },
    { on: cfg.calcvwmacd, values: vwmacd },
    { on: cfg.calccmf, values: cmf },
  ];

  const lowArr = bars.map((b) => b.low);
  const highArr = bars.map((b) => b.high);
  const at = (arr: number[], i: number) => (i >= 0 ? arr[i] : NaN);

  // Per-bar counts: posdivergence, negdivergence, posdivergencehidden, negdivergencehidden
  const regBullCount: number[] = new Array(n).fill(0);
  const regBearCount: number[] = new Array(n).fill(0);
  const hidBullCount: number[] = new Array(n).fill(0);
  const hidBearCount: number[] = new Array(n).fill(0);

  for (const { on, values: osc } of oscillators) {
    if (!on) continue;
    // plFound(_osc) = not na(pivotlow(_osc, lbL, lbR)), phFound(_osc) = not na(pivothigh(_osc, lbL, lbR))
    const pl = A(ta.pivotlow(Series.fromArray(bars, osc), lbL, lbR)).map((v) => !Number.isNaN(v));
    const ph = A(ta.pivothigh(Series.fromArray(bars, osc), lbL, lbR)).map((v) => !Number.isNaN(v));
    // valuewhen(found, x, 1): x on the found bar before the latest one (the latest is the current bar when found)
    let plOsc = [NaN, NaN], plLow = [NaN, NaN], phOsc = [NaN, NaN], phHigh = [NaN, NaN];
    // barssince(found[1] == true): bars since the bar after the last found bar
    let lastPl = -1, lastPh = -1;
    for (let i = 0; i < n; i++) {
      const oscR = at(osc, i - lbR);
      const lowR = at(lowArr, i - lbR);
      const highR = at(highArr, i - lbR);
      const plSince = i > 0 && lastPl >= 0 ? i - (lastPl + 1) : NaN;
      const phSince = i > 0 && lastPh >= 0 ? i - (lastPh + 1) : NaN;
      if (pl[i]) { plOsc = [plOsc[1], oscR]; plLow = [plLow[1], lowR]; }
      if (ph[i]) { phOsc = [phOsc[1], oscR]; phHigh = [phHigh[1], highR]; }
      const plRange = rangeLower <= plSince && plSince <= rangeUpper;
      const phRange = rangeLower <= phSince && phSince <= rangeUpper;
      // valuewhen(..., 1): the value one occurrence back (na until two occurrences)
      const vwPlOsc = plOsc[0], vwPlLow = plLow[0], vwPhOsc = phOsc[0], vwPhHigh = phHigh[0];
      // bullCond: priceLL and oscHL and plFound
      if (plotBull && lowR < vwPlLow && oscR > vwPlOsc && plRange && pl[i]) regBullCount[i]++;
      // bearCond: priceHH and oscLH and phFound
      if (plotBear && highR > vwPhHigh && oscR < vwPhOsc && phRange && ph[i]) regBearCount[i]++;
      // hiddenBullCond: priceHL and oscLL and plFound
      if (plotHiddenBull && lowR > vwPlLow && oscR < vwPlOsc && plRange && pl[i]) hidBullCount[i]++;
      // hiddenBearCond: priceLH and oscHH and phFound
      if (plotHiddenBear && highR < vwPhHigh && oscR > vwPhOsc && phRange && ph[i]) hidBearCount[i]++;
      if (pl[i]) lastPl = i;
      if (ph[i]) lastPh = i;
    }
  }

  // ---- Generate markers ----
  // The original has one plotshape per kind and count: "1" to "8" and "8+" (more than 8) for the regular bullish
  // (shape0-shape8), regular bearish (shape9-shape17), hidden bullish (shape18-shape26) and hidden bearish
  // (shape27-shape35) divergences. Shape k (1-8) shows when count == k and mindivcount < k + 1; "8+" when
  // count > 8 and mindivcount < 11 (always: mindivcount is at most 10). Price: low[lbR] - voffset (labelup) /
  // high[lbR] + voffset (labeldown), voffset = 5 * syminfo.mintick; offset = -off (lbR bars back with "Repaint or
  // not?" on)
  const voffset = 5 * mintickOf(chart);
  const off = cfg.offset ? lbR : 0;
  const shown = (count: number) => count > 8 || (count >= 1 && count >= minDivCount);
  const label = (count: number) => (count > 8 ? '8+' : String(count));
  const shapeId = (first: number, count: number) => `shape${first + Math.min(count, 9) - 1}`;
  const teal = '#00897B', red = '#FF5252', green = '#4CAF50', orange = '#FF9800';
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const p = i - lbR; // the pivot bar
    const t = i - off; // the bar the shape is drawn on
    if (p < 0 || t < 0) continue;
    const time = bars[t].time;
    if (shown(regBullCount[i])) {
      markers.push({ time, position: 'atPriceBottom', price: lowArr[p] - voffset, shape: 'labelUp', color: teal,
        textColor: '#FFFFFF', text: label(regBullCount[i]), id: shapeId(0, regBullCount[i]) });
    }
    if (shown(regBearCount[i])) {
      markers.push({ time, position: 'atPriceTop', price: highArr[p] + voffset, shape: 'labelDown', color: red,
        textColor: '#FFFFFF', text: label(regBearCount[i]), id: shapeId(9, regBearCount[i]) });
    }
    if (shown(hidBullCount[i])) {
      markers.push({ time, position: 'atPriceBottom', price: lowArr[p] - voffset, shape: 'labelUp', color: green,
        textColor: '#FFFFFF', text: label(hidBullCount[i]), id: shapeId(18, hidBullCount[i]) });
    }
    if (shown(hidBearCount[i])) {
      markers.push({ time, position: 'atPriceTop', price: highArr[p] + voffset, shape: 'labelDown', color: orange,
        textColor: '#FFFFFF', text: label(hidBearCount[i]), id: shapeId(27, hidBearCount[i]) });
    }
  }

  // Dummy plot (overlay indicator needs at least one plot)
  const plot0 = bars.map((b) => ({ time: b.time, value: NaN }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0 },
    markers,
  };
}

export const MultipleDivergences = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
