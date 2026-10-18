/**
 * MACD Divergences by @DaviddTech
 *
 * MACD with regular (and hidden) divergence detection on the MACD line.
 * Alerts (alertcondition, `alerts` of the result): 'Bull', 'Bear', 'H Bull' and 'H Bear', true on the bar that confirms
 * the pivot of each divergence (lbR bars after the pivot, where the label is drawn).
 *
 * Reference: "MACD Divergences by @DaviddTech" (community, Pine v4)
 */

import { ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MACDDivergenceInputs {
  fastLength: number;
  slowLength: number;
  signalLength: number;
  /** Pine sma_source: "Oscillator MA Type" */
  oscMaType: 'SMA' | 'EMA';
  /** Pine sma_signal: "Signal Line MA Type" */
  signalMaType: 'SMA' | 'EMA';
  /** Pine lbR: "Pivot Lookback Right" */
  pivotLookback: number;
  /** Pine lbL: "Pivot Lookback Left" */
  pivotLookbackLeft: number;
  rangeUpper: number;
  rangeLower: number;
  dontTouchZero: boolean;
  plotBull: boolean;
  plotBear: boolean;
  /** Pine constant plotHiddenBull = false (not an input in Pine) */
  plotHiddenBull: boolean;
  /** Pine constant plotHiddenBear = false (not an input in Pine) */
  plotHiddenBear: boolean;
  src: SourceType;
}

export const defaultInputs: MACDDivergenceInputs = {
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  oscMaType: 'EMA',
  signalMaType: 'EMA',
  pivotLookback: 5,
  pivotLookbackLeft: 5,
  rangeUpper: 60,
  rangeLower: 5,
  dontTouchZero: true,
  plotBull: true,
  plotBear: true,
  plotHiddenBull: false,
  plotHiddenBear: false,
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1, max: 50 },
  { id: 'oscMaType', type: 'string', title: 'Oscillator MA Type', defval: 'EMA', options: ['SMA', 'EMA'] },
  { id: 'signalMaType', type: 'string', title: 'Signal Line MA Type', defval: 'EMA', options: ['SMA', 'EMA'] },
  { id: 'dontTouchZero', type: 'bool', title: "Don't touch the zero line?", defval: true },
  { id: 'pivotLookback', type: 'int', title: 'Pivot Lookback Right', defval: 5 },
  { id: 'pivotLookbackLeft', type: 'int', title: 'Pivot Lookback Left', defval: 5 },
  { id: 'rangeUpper', type: 'int', title: 'Max of Lookback Range', defval: 60 },
  { id: 'rangeLower', type: 'int', title: 'Min of Lookback Range', defval: 5 },
  { id: 'plotBull', type: 'bool', title: 'Plot Bullish', defval: true },
  { id: 'plotBear', type: 'bool', title: 'Plot Bearish', defval: true },
  { id: 'plotHiddenBull', type: 'bool', title: 'Plot Hidden Bullish', defval: false },
  { id: 'plotHiddenBear', type: 'bool', title: 'Plot Hidden Bearish', defval: false },
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
  { id: 'plot0', title: 'MACD', color: '#2962FF', lineWidth: 1 },
  { id: 'plot1', title: 'Signal', color: '#FF6D00', lineWidth: 1 },
  { id: 'plot2', title: 'Histogram', color: '#26A69A', lineWidth: 4, style: 'columns' },
  { id: 'regBull', title: 'Regular Bullish', color: BULL_COLOR, lineWidth: 2 },
  { id: 'regBear', title: 'Regular Bearish', color: BEAR_COLOR, lineWidth: 2 },
  { id: 'hidBull', title: 'Hidden Bullish', color: HIDDEN_BULL_COLOR, lineWidth: 2 },
  { id: 'hidBear', title: 'Hidden Bearish', color: HIDDEN_BEAR_COLOR, lineWidth: 2 },
];

export const metadata = {
  title: 'MACD Divergence',
  shortTitle: 'MACDDiv',
  overlay: false,
};

type PlotPoint = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<MACDDivergenceInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { fastLength, slowLength, signalLength, oscMaType, signalMaType, pivotLookback, pivotLookbackLeft,
    rangeUpper, rangeLower, dontTouchZero, plotBull, plotBear, plotHiddenBull, plotHiddenBear, src } = { ...defaultInputs, ...inputs };
  const source = getSourceSeries(bars, src);
  const n = bars.length;
  const lbR = pivotLookback;
  const lbL = pivotLookbackLeft;

  // Pine: fast_ma / slow_ma with sma_source, signal with sma_signal
  const fastMA = oscMaType === 'SMA' ? ta.sma(source, fastLength) : ta.ema(source, fastLength);
  const slowMA = oscMaType === 'SMA' ? ta.sma(source, slowLength) : ta.ema(source, slowLength);
  const macdLine = fastMA.sub(slowMA);
  const signalLine = signalMaType === 'SMA' ? ta.sma(macdLine, signalLength) : ta.ema(macdLine, signalLength);
  const histogram = macdLine.sub(signalLine);

  const macdArr = macdLine.toArray().map((v) => v ?? NaN);
  const sigArr = signalLine.toArray().map((v) => v ?? NaN);
  const histArr = histogram.toArray().map((v) => v ?? NaN);

  const toPlot = (arr: number[]) => arr.map((v, i) => ({ time: bars[i].time, value: v }));

  // Pine: hist>=0 ? (hist[1] < hist ? col_grow_above : col_fall_above) : (hist[1] < hist ? col_grow_below : col_fall_below)
  const histPlot = histArr.map((v, i) => {
    const prev = i > 0 ? histArr[i - 1] : NaN;
    const grow = prev < v;
    const color = v >= 0 ? (grow ? '#26A69A' : '#B2DFDB') : (grow ? '#FFCDD2' : '#FF5252');
    return { time: bars[i].time, value: v, color };
  });

  // osc = macd. plFound / phFound are true on the confirmation bar, lbR bars after the pivot bar.
  const plArr = ta.pivotlow(macdLine, lbL, lbR).toArray();
  const phArr = ta.pivothigh(macdLine, lbL, lbR).toArray();
  const plFound = plArr.map((v) => v != null && !Number.isNaN(v));
  const phFound = phArr.map((v) => v != null && !Number.isNaN(v));

  // Pine: priceHHZero = highest(osc, lbL+lbR+5), priceLLZero = lowest(osc, lbL+lbR+5)
  const hhZero = ta.highest(macdLine, lbL + lbR + 5).toArray();
  const llZero = ta.lowest(macdLine, lbL + lbR + 5).toArray();

  // Pine plots every pivot (value osc[lbR], offset=-lbR) and hides it with noneColor when there is no divergence.
  const na = (i: number): PlotPoint => ({ time: bars[i].time, value: NaN });
  const regBullPlot = bars.map((_, i) => na(i));
  const regBearPlot = bars.map((_, i) => na(i));
  const hidBullPlot = bars.map((_, i) => na(i));
  const hidBearPlot = bars.map((_, i) => na(i));

  const markers: MarkerData[] = [];
  const flags: boolean[][] = [0, 1, 2, 3].map(() => new Array(n).fill(false)); // bull, bear, hidden bull, hidden bear

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
      const osc = macdArr[p];
      const low = bars[p].low;
      const oscHL = osc > plLastOsc && plInRange && osc < 0;
      const priceLL = low < plLastLow;
      const blowzero = dontTouchZero ? hhZero[i] < 0 : true;
      const bullCond = plotBull && priceLL && oscHL && blowzero;
      const oscLL = osc < plLastOsc && plInRange;
      const priceHL = low > plLastLow;
      const hiddenBullCond = plotHiddenBull && priceHL && oscLL;

      regBullPlot[p] = { time: bars[p].time, value: osc, color: bullCond ? BULL_COLOR : NONE_COLOR };
      hidBullPlot[p] = { time: bars[p].time, value: osc, color: hiddenBullCond ? HIDDEN_BULL_COLOR : NONE_COLOR };
      // ids: plotshape outputs "Regular Bullish Label" (shape0) and "Hidden Bullish Label" (shape1)
      if (bullCond) markers.push({ time: bars[p].time as number, position: 'atPriceBottom', price: osc, shape: 'labelUp', color: BULL_COLOR, text: ' Bull ', textColor: TEXT_COLOR, id: 'shape0' });
      if (hiddenBullCond) markers.push({ time: bars[p].time as number, position: 'atPriceBottom', price: osc, shape: 'labelUp', color: BULL_COLOR, text: ' H Bull ', textColor: TEXT_COLOR, id: 'shape1' });
      flags[0][i] = bullCond;
      flags[2][i] = hiddenBullCond;

      plLastOsc = osc;
      plLastLow = low;
    }

    if (phFound[i]) {
      const p = i - lbR;
      const osc = macdArr[p];
      const high = bars[p].high;
      const oscLH = osc < phLastOsc && phInRange && osc > 0;
      const priceHH = high > phLastHigh;
      const bearzero = dontTouchZero ? llZero[i] > 0 : true;
      const bearCond = plotBear && priceHH && oscLH && bearzero;
      const oscHH = osc > phLastOsc && phInRange;
      const priceLH = high < phLastHigh;
      const hiddenBearCond = plotHiddenBear && priceLH && oscHH;

      regBearPlot[p] = { time: bars[p].time, value: osc, color: bearCond ? BEAR_COLOR : NONE_COLOR };
      hidBearPlot[p] = { time: bars[p].time, value: osc, color: hiddenBearCond ? HIDDEN_BEAR_COLOR : NONE_COLOR };
      // ids: plotshape outputs "Regular Bearish Label" (shape2) and "Hidden Bearish Label" (shape3)
      if (bearCond) markers.push({ time: bars[p].time as number, position: 'atPriceTop', price: osc, shape: 'labelDown', color: BEAR_COLOR, text: ' Bear ', textColor: TEXT_COLOR, id: 'shape2' });
      if (hiddenBearCond) markers.push({ time: bars[p].time as number, position: 'atPriceTop', price: osc, shape: 'labelDown', color: BEAR_COLOR, text: ' H Bear ', textColor: TEXT_COLOR, id: 'shape3' });
      flags[1][i] = bearCond;
      flags[3][i] = hiddenBearCond;

      phLastOsc = osc;
      phLastHigh = high;
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'plot0': toPlot(macdArr),
      'plot1': toPlot(sigArr),
      'plot2': histPlot,
      'regBull': regBullPlot,
      'regBear': regBearPlot,
      'hidBull': hidBullPlot,
      'hidBear': hidBearPlot,
    },
    markers,
    // alertcondition(bullCond / bearCond / hiddenBullCond / hiddenBearCond)
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bull', message: 'Regular Bull Div {{ticker}} XXmin' },
  { id: 'alert1', title: 'Bear', message: 'Regular Bear Div {{ticker}} XXmin' },
  { id: 'alert2', title: 'H Bull', message: 'Hidden Bull Div {{ticker}} XXmin' },
  { id: 'alert3', title: 'H Bear', message: 'Hidden Bear Div {{ticker}} XXmin' },
];

export const MACDDivergence = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
