/**
 * MOST on RSI
 *
 * OTT-style trailing stop applied to an RSI moving average instead of price.
 * Includes RSI, RSI-based MA, MOST line, regular divergence detection on the RSI,
 * OB/OS gradient fills, and Bollinger Bands when the MA type is "Bollinger Bands".
 *
 * Alerts (alertcondition, `alerts` of the result): 'BUY' / 'SELL' (the RSI MA crossing the MOST line) and 'Regular
 * Bullish Divergence' / 'Regular Bearish Divergence' (on the bar the divergence is found, whether or not divergences
 * are shown).
 *
 * Reference: "MOST on RSI" (community, Pine v5)
 */

import { ta, getSourceSeries, Series, type IndicatorResult, type InputConfig, type PlotConfig, type FillData, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type MOSTRSIMaType = 'SMA' | 'Bollinger Bands' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA' | 'VAR';

export interface MOSTRSIInputs {
  rsiLen: number;
  /** Pine rsiSourceInput: "Source" */
  src: SourceType;
  /** Pine maTypeInput: "MA Type" */
  maType: MOSTRSIMaType;
  maLen: number;
  percent: number;
  bbMult: number;
  showDivergence: boolean;
  showSignals: boolean;
}

export const defaultInputs: MOSTRSIInputs = {
  rsiLen: 14,
  src: 'close',
  maType: 'VAR',
  maLen: 5,
  percent: 9.0,
  bbMult: 2.0,
  showDivergence: true,
  showSignals: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'VAR', options: ['SMA', 'Bollinger Bands', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA', 'VAR'] },
  { id: 'maLen', type: 'int', title: 'MA Length', defval: 5 },
  { id: 'percent', type: 'float', title: 'STOP LOSS Percent', defval: 9.0, min: 0, step: 0.1 },
  { id: 'bbMult', type: 'float', title: 'BB StdDev', defval: 2.0, min: 0.001, max: 50 },
  { id: 'showDivergence', type: 'bool', title: 'Show Divergence', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Signals?', defval: false },
];

// Pine v5 colours: color.green #4CAF50, color.red #FF5252, color.maroon #880E4F, color.yellow #FFEB3B
const BULL_COLOR = '#4CAF50';
const BEAR_COLOR = '#FF5252';
// Pine noneColor = color.new(color.white, 100)
const NONE_COLOR = 'rgba(255,255,255,0)';
// Pine: textColor = color.white (text of the divergence labels, plotshape location.absolute at the plotted value)
const TEXT_COLOR = '#FFFFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'rsi', title: 'RSI', color: '#7E57C2', lineWidth: 1 },
  { id: 'rsiMa', title: 'RSI-based MA', color: '#FFEB3B', lineWidth: 1 },
  { id: 'most', title: 'MOST', color: '#880E4F', lineWidth: 3 },
  { id: 'bullDiv', title: 'Regular Bullish', color: BULL_COLOR, lineWidth: 2 },
  { id: 'bearDiv', title: 'Regular Bearish', color: BEAR_COLOR, lineWidth: 2 },
  { id: 'midline', title: 'Middle Line', color: 'transparent', lineWidth: 0, display: 'none' },
  { id: 'bbUpper', title: 'Upper Bollinger Band', color: '#4CAF50', lineWidth: 1 },
  { id: 'bbLower', title: 'Lower Bollinger Band', color: '#4CAF50', lineWidth: 1 },
  { id: 'hline70', title: 'RSI Upper Band', color: '#787B86', lineWidth: 1, display: 'none' },
  { id: 'hline30', title: 'RSI Lower Band', color: '#787B86', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'MOST on RSI',
  shortTitle: 'MOST-RSI',
  overlay: false,
};

type PlotPoint = { time: number; value: number; color?: string };

/**
 * Pine Var_Func(source, length): VAR (variable index dynamic average) with a 9-bar CMO.
 * vud1/vdd1 are 0 where source or source[1] is na; math.sum(.., 9) is na on the first 8 bars; vCMO = nz(..);
 * VAR := nz(valpha * abs(vCMO) * source) + (1 - valpha * abs(vCMO)) * nz(VAR[1]), so VAR starts at 0.
 */
function computeVAR(values: number[], length: number): number[] {
  const n = values.length;
  const result = new Array<number>(n).fill(NaN);
  const valpha = 2 / (length + 1);
  const vud1 = new Array<number>(n).fill(0);
  const vdd1 = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const cur = values[i];
    const prev = i > 0 ? values[i - 1] : NaN;
    vud1[i] = cur > prev ? cur - prev : 0;
    vdd1[i] = cur < prev ? prev - cur : 0;
    let vCMO = 0;
    if (i >= 8) {
      let vUD = 0, vDD = 0;
      for (let j = i - 8; j <= i; j++) { vUD += vud1[j]; vDD += vdd1[j]; }
      const c = (vUD - vDD) / (vUD + vDD);
      vCMO = Number.isNaN(c) ? 0 : c;
    }
    const k = valpha * Math.abs(vCMO);
    const a = k * cur;
    const prevVar = i > 0 ? result[i - 1] : NaN;
    result[i] = (Number.isNaN(a) ? 0 : a) + (1 - k) * (Number.isNaN(prevVar) ? 0 : prevVar);
  }
  return result;
}

export function calculate(bars: Bar[], inputs: Partial<MOSTRSIInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { rsiLen, src, maType, maLen, percent, bbMult, showDivergence, showSignals } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const source = getSourceSeries(bars, src);
  const rsiSeries = ta.rsi(source, rsiLen);
  const rsiArr = rsiSeries.toArray().map((v) => v ?? NaN);

  // Pine: rsiMA = ma(rsi, maLengthInput, maTypeInput)
  let rsiMaArr: number[];
  switch (maType) {
    case 'SMA':
    case 'Bollinger Bands': rsiMaArr = ta.sma(rsiSeries, maLen).toArray().map((v) => v ?? NaN); break;
    case 'EMA': rsiMaArr = ta.ema(rsiSeries, maLen).toArray().map((v) => v ?? NaN); break;
    case 'SMMA (RMA)': rsiMaArr = ta.rma(rsiSeries, maLen).toArray().map((v) => v ?? NaN); break;
    case 'WMA': rsiMaArr = ta.wma(rsiSeries, maLen).toArray().map((v) => v ?? NaN); break;
    case 'VWMA': {
      const volSeries = new Series(bars, (b) => b.volume ?? NaN);
      rsiMaArr = ta.vwma(rsiSeries, maLen, volSeries).toArray().map((v) => v ?? NaN);
      break;
    }
    default: rsiMaArr = computeVAR(rsiArr, maLen);
  }
  const isBB = maType === 'Bollinger Bands';

  // MOST (OTT-style trailing stop) on the RSI MA
  const longStop: number[] = new Array(n);
  const shortStop: number[] = new Array(n);
  const dir: number[] = new Array(n);
  const most: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const val = rsiMaArr[i];
    const fark = val * percent * 0.01;

    longStop[i] = val - fark;
    shortStop[i] = val + fark;

    if (i > 0) {
      if (val > longStop[i - 1]) longStop[i] = Math.max(longStop[i], longStop[i - 1]);
      if (val < shortStop[i - 1]) shortStop[i] = Math.min(shortStop[i], shortStop[i - 1]);

      dir[i] = dir[i - 1];
      if (dir[i - 1] === -1 && val > shortStop[i - 1]) dir[i] = 1;
      else if (dir[i - 1] === 1 && val < longStop[i - 1]) dir[i] = -1;
    } else {
      dir[i] = 1;
    }

    most[i] = dir[i] === 1 ? longStop[i] : shortStop[i];
  }

  // Pine: plot(rsi, "RSI", color=#7E57C2)
  const rsiPlot = rsiArr.map((v, i) => ({ time: bars[i].time, value: v }));
  // Pine: plot(rsiMA, "RSI-based MA", color=color.yellow)
  const rsiMaPlot = rsiMaArr.map((v, i) => ({ time: bars[i].time, value: v }));
  // Pine: plot(MOST, color=color.new(color.maroon, 0), linewidth=3, title='MOST')
  const mostPlot = most.map((v, i) => ({ time: bars[i].time, value: v }));

  // Pine (v5 colours): midLinePlot = plot(50, display = display.none)
  //   fill(rsiPlot, midLinePlot, 100, 70, top_color = color.new(color.green, 0), bottom_color = color.new(color.green, 100))
  //   fill(rsiPlot, midLinePlot, 30, 0, top_color = color.new(color.red, 100), bottom_color = color.new(color.red, 0))
  const midlinePlot = bars.map(b => ({ time: b.time, value: 50 }));
  const constant = <T>(v: T): T[] => new Array(n).fill(v);

  // Pine: bbUpperBand = plot(isBB ? rsiMA + ta.stdev(rsi, maLengthInput) * bbMultInput : na)
  const stdevArr = ta.stdev(rsiSeries, maLen).toArray().map((v) => v ?? NaN);
  const bbUpperPlot = rsiMaArr.map((v, i) => ({ time: bars[i].time, value: isBB ? v + stdevArr[i] * bbMult : NaN }));
  const bbLowerPlot = rsiMaArr.map((v, i) => ({ time: bars[i].time, value: isBB ? v - stdevArr[i] * bbMult : NaN }));

  // Constant hline plots for 70/30 fill
  const hline70Plot = bars.map(b => ({ time: b.time, value: 70 }));
  const hline30Plot = bars.map(b => ({ time: b.time, value: 30 }));

  const fills: FillData[] = [
    // Pine: fill(rsiUpperBand, rsiLowerBand, color=color.rgb(126,87,194,90)) - purple fill between 70/30
    { plot1: 'hline70', plot2: 'hline30', options: { color: 'rgba(126,87,194,0.10)', title: 'RSI Background Fill' } },
    {
      plot1: 'rsi', plot2: 'midline', options: { title: 'Overbought Gradient Fill' },
      gradient: { topValue: constant(100), bottomValue: constant(70), topColor: constant('#4CAF50'), bottomColor: constant('#4CAF5000') },
    },
    {
      plot1: 'rsi', plot2: 'midline', options: { title: 'Oversold Gradient Fill' },
      gradient: { topValue: constant(30), bottomValue: constant(0), topColor: constant('#FF525200'), bottomColor: constant('#FF5252') },
    },
    // Pine: fill(bbUpperBand, bbLowerBand, color= isBB ? color.new(color.green, 90) : na)
    { plot1: 'bbUpper', plot2: 'bbLower', options: { color: 'rgba(76,175,80,0.10)', title: 'Bollinger Bands Background Fill' } },
  ];

  // BUY/SELL markers. Pine: cro = ta.crossover(exMov, MOST), cru = ta.crossunder(exMov, MOST);
  // plotshape(..., location.bottom / location.top, shape.labelup / labeldown, size.tiny, color #0F18BF,
  // textcolor white). MarkerData has no pane top / bottom position: below / above the bar.
  const markers: MarkerData[] = [];
  const croFlags = new Array<boolean>(n).fill(false);
  const cruFlags = new Array<boolean>(n).fill(false);
  for (let i = 1; i < n; i++) {
    const cro = rsiMaArr[i] > most[i] && rsiMaArr[i - 1] <= most[i - 1];
    const cru = rsiMaArr[i] < most[i] && rsiMaArr[i - 1] >= most[i - 1];
    croFlags[i] = cro;
    cruFlags[i] = cru;
    if (showSignals && cro) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#0F18BF', text: 'BUY', textColor: '#FFFFFF', size: 'tiny' });
    }
    if (showSignals && cru) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#0F18BF', text: 'SELL', textColor: '#FFFFFF', size: 'tiny' });
    }
  }

  // Divergence (Pine constants: lookbackLeft=5, lookbackRight=5, rangeUpper=60, rangeLower=5)
  const lookbackLeft = 5;
  const lookbackRight = 5;
  const rangeUpper = 60;
  const rangeLower = 5;

  // plFound / phFound are true on the confirmation bar, lookbackRight bars after the pivot bar
  const plArr = ta.pivotlow(rsiSeries, lookbackLeft, lookbackRight).toArray();
  const phArr = ta.pivothigh(rsiSeries, lookbackLeft, lookbackRight).toArray();
  const plFound = plArr.map((v) => v != null && !Number.isNaN(v));
  const phFound = phArr.map((v) => v != null && !Number.isNaN(v));

  // Pine plots every pivot (value rsi[lookbackRight], offset=-lookbackRight) and hides it with noneColor when
  // there is no divergence (or showDivergence is off).
  const na = (i: number): PlotPoint => ({ time: bars[i].time, value: NaN });
  const bullDivPlot = bars.map((_, i) => na(i));
  const bearDivPlot = bars.map((_, i) => na(i));

  // Pine: _inRange(cond) => bars = ta.barssince(cond == true); rangeLower <= bars and bars <= rangeUpper,
  // called with plFound[1] / phFound[1]. Pine v5 `and` evaluates both sides, so barssince runs on every bar.
  let plBars = NaN;
  let phBars = NaN;
  // Pine: ta.valuewhen(plFound, rsi[lookbackRight], 1): on a pivot bar, the previous pivot
  let lastPLRsi = NaN, lastPLPrice = NaN;
  let lastPHRsi = NaN, lastPHPrice = NaN;
  // bullCondAlert / bearCondAlert: the divergence without showDivergence
  const bullAlert = new Array<boolean>(n).fill(false);
  const bearAlert = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    if (i > 0 && plFound[i - 1]) plBars = 0;
    else if (!Number.isNaN(plBars)) plBars++;
    if (i > 0 && phFound[i - 1]) phBars = 0;
    else if (!Number.isNaN(phBars)) phBars++;
    const plInRange = rangeLower <= plBars && plBars <= rangeUpper;
    const phInRange = rangeLower <= phBars && phBars <= rangeUpper;

    if (plFound[i]) {
      const p = i - lookbackRight;
      const pivotRsi = rsiArr[p];
      const pivotPrice = bars[p].low;
      // Regular Bullish: RSI higher low, price lower low
      bullAlert[i] = pivotPrice < lastPLPrice && pivotRsi > lastPLRsi && plInRange;
      const bullCond = showDivergence && bullAlert[i];
      bullDivPlot[p] = { time: bars[p].time, value: pivotRsi, color: bullCond ? BULL_COLOR : NONE_COLOR };
      if (bullCond) markers.push({ time: bars[p].time, position: 'atPriceBottom', price: pivotRsi, shape: 'labelUp', color: BULL_COLOR, text: ' Bull ', textColor: TEXT_COLOR });
      lastPLRsi = pivotRsi;
      lastPLPrice = pivotPrice;
    }

    if (phFound[i]) {
      const p = i - lookbackRight;
      const pivotRsi = rsiArr[p];
      const pivotPrice = bars[p].high;
      // Regular Bearish: RSI lower high, price higher high
      bearAlert[i] = pivotPrice > lastPHPrice && pivotRsi < lastPHRsi && phInRange;
      const bearCond = showDivergence && bearAlert[i];
      bearDivPlot[p] = { time: bars[p].time, value: pivotRsi, color: bearCond ? BEAR_COLOR : NONE_COLOR };
      if (bearCond) markers.push({ time: bars[p].time, position: 'atPriceTop', price: pivotRsi, shape: 'labelDown', color: BEAR_COLOR, text: ' Bear ', textColor: TEXT_COLOR });
      lastPHRsi = pivotRsi;
      lastPHPrice = pivotPrice;
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'rsi': rsiPlot,
      'rsiMa': rsiMaPlot,
      'most': mostPlot,
      'bullDiv': bullDivPlot,
      'bearDiv': bearDivPlot,
      'midline': midlinePlot,
      'bbUpper': bbUpperPlot,
      'bbLower': bbLowerPlot,
      'hline70': hline70Plot,
      'hline30': hline30Plot,
    },
    hlines: [
      { value: 70, options: { color: '#787B86', linestyle: 'dashed' as const, title: 'RSI Upper Band' } },
      { value: 50, options: { color: 'rgba(120,123,134,0.5)', linestyle: 'dashed' as const, title: 'RSI Middle Band' } },
      { value: 30, options: { color: '#787B86', linestyle: 'dashed' as const, title: 'RSI Lower Band' } },
    ],
    fills,
    markers,
    // alertcondition(cro, 'BUY') / (cru, 'SELL') / (bullCondAlert, ...) / (bearCondAlert, ...)
    alerts: alertStates(alertConditions, bars, [croFlags, cruFlags, bullAlert, bearAlert]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY', message: 'BUY SIGNAL!' },
  { id: 'alert1', title: 'SELL', message: 'SELL SIGNAL!' },
  { id: 'alert2', title: 'Regular Bullish Divergence', message: 'Found a new Regular Bullish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.' },
  { id: 'alert3', title: 'Regular Bearish Divergence', message: 'Found a new Regular Bearish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.' },
];

export const MOSTRSI = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
