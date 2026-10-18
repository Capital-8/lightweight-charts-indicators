/**
 * Divergence Indicator (any oscillator)
 *
 * Detects regular and hidden divergences between price and an oscillator source (pivots on the oscillator).
 * Since external indicator sourcing is not available, the oscillator is a price source (Pine default ohlc4).
 *
 * Regular Bullish: price makes lower low, oscillator makes higher low
 * Regular Bearish: price makes higher high, oscillator makes lower high
 * Hidden Bullish: price makes higher low, oscillator makes lower low
 * Hidden Bearish: price makes lower high, oscillator makes higher high
 *
 * Pine plots 4 lines through every oscillator pivot (value osc[lbR], or low/high with "Plot on price",
 * offset=-lbR) with a transparent colour unless a divergence is found there, and 4 plotshape labels.
 *
 * Last bar: with "Delay plot until candle is closed" a divergence is not drawn on an open bar. The port reads the
 * state of the last bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as
 * closed.
 *
 * Reference: "Divergence Indicator (any oscillator)" (community, Pine v4)
 */

import { ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface DivergenceIndicatorInputs {
  /** Pine overlay_main: "Plot on price (rather than on indicator)" */
  overlayMain: boolean;
  src: SourceType;
  pivotLookbackLeft: number;
  pivotLookbackRight: number;
  rangeUpper: number;
  rangeLower: number;
  plotBull: boolean;
  plotHiddenBull: boolean;
  plotBear: boolean;
  plotHiddenBear: boolean;
  /**
   * Pine delay_plot_til_closed. Pine: repaint = not delay_plot_til_closed or barstate.ishistory or
   * barstate.isconfirmed: it only changes the last bar, when that bar is still open (chart context).
   */
  delayPlotTilClosed: boolean;
}

export const defaultInputs: DivergenceIndicatorInputs = {
  overlayMain: false,
  src: 'ohlc4',
  pivotLookbackLeft: 5,
  pivotLookbackRight: 5,
  rangeUpper: 60,
  rangeLower: 5,
  plotBull: true,
  plotHiddenBull: false,
  plotBear: true,
  plotHiddenBear: false,
  delayPlotTilClosed: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'overlayMain', type: 'bool', title: 'Plot on price (rather than on indicator)', defval: false },
  { id: 'src', type: 'source', title: 'Indicator', defval: 'ohlc4' },
  { id: 'pivotLookbackRight', type: 'int', title: 'Pivot Lookback Right', defval: 5 },
  { id: 'pivotLookbackLeft', type: 'int', title: 'Pivot Lookback Left', defval: 5 },
  { id: 'rangeUpper', type: 'int', title: 'Max of Lookback Range', defval: 60 },
  { id: 'rangeLower', type: 'int', title: 'Min of Lookback Range', defval: 5 },
  { id: 'plotBull', type: 'bool', title: 'Plot Bullish', defval: true },
  { id: 'plotHiddenBull', type: 'bool', title: 'Plot Hidden Bullish', defval: false },
  { id: 'plotBear', type: 'bool', title: 'Plot Bearish', defval: true },
  { id: 'plotHiddenBear', type: 'bool', title: 'Plot Hidden Bearish', defval: false },
  { id: 'delayPlotTilClosed', type: 'bool', title: "Delay plot until candle is closed (don't repaint)", defval: false },
];

// Pine v4 colours: color.green #4CAF50, color.red #FF5252; hidden colours color.new(.., 80)
const BULL_COLOR = '#4CAF50';
const BEAR_COLOR = '#FF5252';
const HIDDEN_BULL_COLOR = 'rgba(76,175,80,0.20)';
const HIDDEN_BEAR_COLOR = 'rgba(255,82,82,0.20)';
// Pine noneColor = color.new(color.white, 100)
const NONE_COLOR = 'rgba(255,255,255,0)';
// Pine: textColor = color.white (text of the divergence labels, plotshape location.absolute at the plotted value)
const TEXT_COLOR = '#FFFFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'regBull', title: 'Regular Bullish', color: BULL_COLOR, lineWidth: 2 },
  { id: 'hidBull', title: 'Hidden Bullish', color: HIDDEN_BULL_COLOR, lineWidth: 2 },
  { id: 'regBear', title: 'Regular Bearish', color: BEAR_COLOR, lineWidth: 2 },
  { id: 'hidBear', title: 'Hidden Bearish', color: HIDDEN_BEAR_COLOR, lineWidth: 2 },
];

export const metadata = {
  title: 'Divergence Indicator',
  shortTitle: 'DivInd',
  overlay: true,
};

type PlotPoint = { time: number; value: number; color?: string };

export function calculate(bars: Bar[], inputs: Partial<DivergenceIndicatorInputs> = {}, chart?: ChartContext): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const {
    overlayMain, src, pivotLookbackLeft, pivotLookbackRight,
    rangeUpper, rangeLower, plotBull, plotHiddenBull, plotBear, plotHiddenBear, delayPlotTilClosed,
  } = { ...defaultInputs, ...inputs };

  const n = bars.length;
  const osc = getSourceSeries(bars, src);
  const oscArr = osc.toArray().map((v) => v ?? NaN);

  const lbL = pivotLookbackLeft;
  const lbR = pivotLookbackRight;

  // Pine: repaint = not delay_plot_til_closed or barstate.ishistory or barstate.isconfirmed.
  // The last bar, when it is still open, is the only bar that is neither historical nor confirmed.
  const repaintAt = (index: number) => !delayPlotTilClosed || barIsConfirmed(index);

  // plFound / phFound are true on the confirmation bar, lbR bars after the pivot bar.
  const plArr = ta.pivotlow(osc, lbL, lbR).toArray();
  const phArr = ta.pivothigh(osc, lbL, lbR).toArray();
  const plFound = plArr.map((v) => v != null && !Number.isNaN(v));
  const phFound = phArr.map((v) => v != null && !Number.isNaN(v));

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
  // Pine: valuewhen(plFound, osc[lbR], 1) and valuewhen(plFound, low[lbR], 1): on a pivot bar, the previous pivot
  let plLastOsc = NaN, plLastLow = NaN;
  let phLastOsc = NaN, phLastHigh = NaN;

  for (let i = 0; i < n; i++) {
    if (i > 0 && plFound[i - 1]) plBars = 0;
    else if (!Number.isNaN(plBars)) plBars++;
    if (i > 0 && phFound[i - 1]) phBars = 0;
    else if (!Number.isNaN(phBars)) phBars++;
    const plInRange = rangeLower <= plBars && plBars <= rangeUpper;
    const phInRange = rangeLower <= phBars && phBars <= rangeUpper;

    if (plFound[i]) {
      const p = i - lbR;
      const o = oscArr[p];
      const low = bars[p].low;
      const repaint = repaintAt(i);
      const bullCond = plotBull && low < plLastLow && o > plLastOsc && plInRange && repaint;
      const hiddenBullCond = plotHiddenBull && low > plLastLow && o < plLastOsc && plInRange && repaint;
      // Pine: plFound ? overlay_main ? low[lbR] : osc[lbR] : na
      const value = overlayMain ? low : o;
      regBullPlot[p] = { time: bars[p].time, value, color: bullCond ? BULL_COLOR : NONE_COLOR };
      hidBullPlot[p] = { time: bars[p].time, value, color: hiddenBullCond ? HIDDEN_BULL_COLOR : NONE_COLOR };
      if (bullCond) markers.push({ id: 'shape0', time: bars[p].time as number, position: 'atPriceBottom', price: value, shape: 'labelUp', color: BULL_COLOR, text: ' Bull ', textColor: TEXT_COLOR });
      if (hiddenBullCond) markers.push({ id: 'shape1', time: bars[p].time as number, position: 'atPriceBottom', price: value, shape: 'labelUp', color: BULL_COLOR, text: ' H Bull ', textColor: TEXT_COLOR });
      plLastOsc = o;
      plLastLow = low;
    }

    if (phFound[i]) {
      const p = i - lbR;
      const o = oscArr[p];
      const high = bars[p].high;
      const repaint = repaintAt(i);
      const bearCond = plotBear && high > phLastHigh && o < phLastOsc && phInRange && repaint;
      const hiddenBearCond = plotHiddenBear && high < phLastHigh && o > phLastOsc && phInRange && repaint;
      // Pine: phFound ? overlay_main ? high[lbR] : osc[lbR] : na
      const value = overlayMain ? high : o;
      regBearPlot[p] = { time: bars[p].time, value, color: bearCond ? BEAR_COLOR : NONE_COLOR };
      hidBearPlot[p] = { time: bars[p].time, value, color: hiddenBearCond ? HIDDEN_BEAR_COLOR : NONE_COLOR };
      if (bearCond) markers.push({ id: 'shape2', time: bars[p].time as number, position: 'atPriceTop', price: value, shape: 'labelDown', color: BEAR_COLOR, text: ' Bear ', textColor: TEXT_COLOR });
      if (hiddenBearCond) markers.push({ id: 'shape3', time: bars[p].time as number, position: 'atPriceTop', price: value, shape: 'labelDown', color: BEAR_COLOR, text: ' H Bear ', textColor: TEXT_COLOR });
      phLastOsc = o;
      phLastHigh = high;
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'regBull': regBullPlot,
      'hidBull': hidBullPlot,
      'regBear': regBearPlot,
      'hidBear': hidBearPlot,
    },
    markers,
  };
}

export const DivergenceIndicator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
