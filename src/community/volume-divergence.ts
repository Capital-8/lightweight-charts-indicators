/**
 * VolumeDivergence
 *
 * Detects 4 divergence types between price and a custom weighted-MA volume oscillator.
 * Custom WMA weights by candle direction, pivot detection on volume to find divergences.
 *
 * Reference: "Volume Divergence by MM" by baymucuk
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface VolumeDivergenceInputs {
  vl1: number;
  vl2: number;
  pivotLookbackRight: number;
  pivotLookbackLeft: number;
  maxLookbackRange: number;
  minLookbackRange: number;
  plotBull: boolean;
  plotHiddenBull: boolean;
  plotBear: boolean;
  plotHiddenBear: boolean;
}

export const defaultInputs: VolumeDivergenceInputs = {
  vl1: 5,
  vl2: 8,
  pivotLookbackRight: 5,
  pivotLookbackLeft: 5,
  maxLookbackRange: 60,
  minLookbackRange: 5,
  plotBull: true,
  plotHiddenBull: false,
  plotBear: true,
  plotHiddenBear: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'vl1', type: 'int', title: 'First Moving Average length', defval: 5, min: 1 },
  { id: 'vl2', type: 'int', title: 'Second Moving Average length', defval: 8, min: 1 },
  { id: 'pivotLookbackRight', type: 'int', title: 'Pivot Lookback Right', defval: 5, min: 1 },
  { id: 'pivotLookbackLeft', type: 'int', title: 'Pivot Lookback Left', defval: 5, min: 1 },
  { id: 'maxLookbackRange', type: 'int', title: 'Max of Lookback Range', defval: 60, min: 1 },
  { id: 'minLookbackRange', type: 'int', title: 'Min of Lookback Range', defval: 5, min: 1 },
  { id: 'plotBull', type: 'bool', title: 'Plot Bullish', defval: true },
  { id: 'plotHiddenBull', type: 'bool', title: 'Plot Hidden Bullish', defval: false },
  { id: 'plotBear', type: 'bool', title: 'Plot Bearish', defval: true },
  { id: 'plotHiddenBear', type: 'bool', title: 'Plot Hidden Bearish', defval: false },
];

// Pine v4 colours: color.green #4CAF50, color.red #FF5252; hidden colours color.new(.., 25)
const BULL_COLOR = '#4CAF50';
const BEAR_COLOR = '#FF5252';
const HIDDEN_BULL_COLOR = 'rgba(76,175,80,0.75)';
const HIDDEN_BEAR_COLOR = 'rgba(255,82,82,0.75)';
// Pine noneColor = color.new(color.white, 100)
const NONE_COLOR = 'rgba(255,255,255,0)';
// Pine: textColor = color.white (text of the divergence labels, plotshape location.absolute at the plotted value)
const TEXT_COLOR = '#FFFFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'vol', title: 'Volume', color: BULL_COLOR, lineWidth: 2 },
  { id: 'regBull', title: 'Regular Bullish', color: BULL_COLOR, lineWidth: 2 },
  { id: 'hidBull', title: 'Hidden Bullish', color: HIDDEN_BULL_COLOR, lineWidth: 2 },
  { id: 'regBear', title: 'Regular Bearish', color: BEAR_COLOR, lineWidth: 2 },
  { id: 'hidBear', title: 'Hidden Bearish', color: HIDDEN_BEAR_COLOR, lineWidth: 2 },
];

type PlotPoint = { time: number; value: number; color?: string };

export const metadata = {
  title: 'Volume Divergence',
  shortTitle: 'VolDiv',
  overlay: false,
};

/**
 * Custom WMA from Pine: weights volume by candle direction (positive for bullish, negative for bearish).
 * pine_wma(x, y) =>
 *   for i = 0 to y - 1
 *     weight = (y - i) * y
 *     factor = close[i] < open[i] ? -1 : 1
 *     sum += x[i] * weight * factor
 *   sum / norm
 */
function pineWma(xArr: number[], bars: Bar[], period: number): number[] {
  const n = xArr.length;
  const out: number[] = new Array(n).fill(NaN);

  for (let i = period - 1; i < n; i++) {
    let norm = 0;
    let sum = 0;
    for (let j = 0; j < period; j++) {
      const weight = (period - j) * period;
      norm += weight;
      const factor = bars[i - j].close < bars[i - j].open ? -1 : 1;
      sum += xArr[i - j] * weight * factor;
    }
    out[i] = norm === 0 ? 0 : sum / norm;
  }

  return out;
}

export function calculate(bars: Bar[], inputs: Partial<VolumeDivergenceInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lbR = cfg.pivotLookbackRight;
  const lbL = cfg.pivotLookbackLeft;

  // Chain of custom WMAs
  const volArr = bars.map(b => b.volume ?? 0);
  const vl3 = cfg.vl1 + cfg.vl2;
  const vl4 = cfg.vl2 + vl3;
  const vl5 = vl3 + vl4;

  const w1 = pineWma(volArr, bars, cfg.vl1);
  const w2 = pineWma(w1, bars, cfg.vl2);
  const w3 = pineWma(w2, bars, vl3);
  const w4 = pineWma(w3, bars, vl4);
  const vol = pineWma(w4, bars, vl5);

  // Pivot detection on vol: plFound / phFound are true on the confirmation bar, lbR bars after the pivot bar
  const volSeries = Series.fromArray(bars, vol);
  const plArr = ta.pivotlow(volSeries, lbL, lbR).toArray();
  const phArr = ta.pivothigh(volSeries, lbL, lbR).toArray();
  const plFound = plArr.map((v) => v != null && !Number.isNaN(v));
  const phFound = phArr.map((v) => v != null && !Number.isNaN(v));

  // Pine plots every pivot (value vol[lbR], offset=-lbR) and hides it with noneColor when there is no divergence.
  const na = (i: number): PlotPoint => ({ time: bars[i].time, value: NaN });
  const regBullPlot = bars.map((_, i) => na(i));
  const hidBullPlot = bars.map((_, i) => na(i));
  const regBearPlot = bars.map((_, i) => na(i));
  const hidBearPlot = bars.map((_, i) => na(i));

  const markers: MarkerData[] = [];

  // Pine: _inRange(cond) => bars = barssince(cond == true); rangeLower <= bars and bars <= rangeUpper,
  // called with plFound[1] / phFound[1]. Pine v4 `and` evaluates both sides, so barssince runs on every bar.
  let plBars = NaN;
  let phBars = NaN;
  // Pine: valuewhen(plFound, vol[lbR], 1) and valuewhen(plFound, low[lbR], 1): on a pivot bar, the previous pivot
  let lastPlVol = NaN, lastPlLow = NaN;
  let lastPhVol = NaN, lastPhHigh = NaN;

  for (let i = 0; i < n; i++) {
    if (i > 0 && plFound[i - 1]) plBars = 0;
    else if (!Number.isNaN(plBars)) plBars++;
    if (i > 0 && phFound[i - 1]) phBars = 0;
    else if (!Number.isNaN(phBars)) phBars++;
    const plInRange = cfg.minLookbackRange <= plBars && plBars <= cfg.maxLookbackRange;
    const phInRange = cfg.minLookbackRange <= phBars && phBars <= cfg.maxLookbackRange;

    if (plFound[i]) {
      const p = i - lbR;
      const curVol = vol[p];
      const curLow = bars[p].low;
      // Regular Bullish: vol higher low, price lower low
      const bullCond = cfg.plotBull && curLow < lastPlLow && curVol > lastPlVol && plInRange;
      // Hidden Bullish: vol lower low, price higher low
      const hiddenBullCond = cfg.plotHiddenBull && curLow > lastPlLow && curVol < lastPlVol && plInRange;
      regBullPlot[p] = { time: bars[p].time, value: curVol, color: bullCond ? BULL_COLOR : NONE_COLOR };
      hidBullPlot[p] = { time: bars[p].time, value: curVol, color: hiddenBullCond ? HIDDEN_BULL_COLOR : NONE_COLOR };
      if (bullCond) markers.push({ time: bars[p].time, position: 'atPriceBottom', price: curVol, shape: 'labelUp', color: BULL_COLOR, text: ' Bull ', textColor: TEXT_COLOR, id: 'shape0' });
      if (hiddenBullCond) markers.push({ time: bars[p].time, position: 'atPriceBottom', price: curVol, shape: 'labelUp', color: BULL_COLOR, text: ' H Bull ', textColor: TEXT_COLOR, id: 'shape1' });
      lastPlVol = curVol;
      lastPlLow = curLow;
    }

    if (phFound[i]) {
      const p = i - lbR;
      const curVol = vol[p];
      const curHigh = bars[p].high;
      // Regular Bearish: vol lower high, price higher high
      const bearCond = cfg.plotBear && curHigh > lastPhHigh && curVol < lastPhVol && phInRange;
      // Hidden Bearish: vol higher high, price lower high
      const hiddenBearCond = cfg.plotHiddenBear && curHigh < lastPhHigh && curVol > lastPhVol && phInRange;
      regBearPlot[p] = { time: bars[p].time, value: curVol, color: bearCond ? BEAR_COLOR : NONE_COLOR };
      hidBearPlot[p] = { time: bars[p].time, value: curVol, color: hiddenBearCond ? HIDDEN_BEAR_COLOR : NONE_COLOR };
      if (bearCond) markers.push({ time: bars[p].time, position: 'atPriceTop', price: curVol, shape: 'labelDown', color: BEAR_COLOR, text: ' Bear ', textColor: TEXT_COLOR, id: 'shape2' });
      if (hiddenBearCond) markers.push({ time: bars[p].time, position: 'atPriceTop', price: curVol, shape: 'labelDown', color: BEAR_COLOR, text: ' H Bear ', textColor: TEXT_COLOR, id: 'shape3' });
      lastPhVol = curVol;
      lastPhHigh = curHigh;
    }
  }

  // Volume plot colored green/red based on sign
  const volPlot = vol.map((v, i) => ({
    time: bars[i].time,
    value: v,
    // Pine: vol_color = vol > 0 ? color.green : color.red
    color: v > 0 ? BULL_COLOR : BEAR_COLOR,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { vol: volPlot, regBull: regBullPlot, hidBull: hidBullPlot, regBear: regBearPlot, hidBear: hidBearPlot },
    hlines: [
      { value: 0, options: { color: '#B2B5BE', linestyle: 'solid' as const, title: 'Baseline' } },
    ],
    markers,
  };
}

export const VolumeDivergence = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
