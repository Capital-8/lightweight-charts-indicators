/**
 * Support and Resistance Levels with Breaks
 *
 * Pivot-based S/R with break detection.
 * Resistance = fixnan(pivothigh(leftBars, rightBars)[1]), Support = fixnan(pivotlow(leftBars, rightBars)[1]).
 * Breaks: crossover(close, resistance) / crossunder(close, support). The volume filter
 * (osc > volumeThresh) applies only to the 'B' labels; the wick labels have no volume filter.
 * Alerts (alertcondition, `alerts` of the result): 'Support Broken' (crossunder(close, support) and osc > volumeThresh)
 * and 'Resistance Broken' (crossover(close, resistance) and osc > volumeThresh), not gated by Show Breaks.
 *
 * Reference: "Support and Resistance Levels with Breaks" [LuxAlgo] (community)
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SRLevelsBreaksInputs {
  toggleBreaks: boolean;
  leftBars: number;
  rightBars: number;
  volumeThresh: number;
}

export const defaultInputs: SRLevelsBreaksInputs = {
  toggleBreaks: true,
  leftBars: 15,
  rightBars: 15,
  volumeThresh: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'toggleBreaks', type: 'bool', title: 'Show Breaks', defval: true },
  { id: 'leftBars', type: 'int', title: 'Left Bars ', defval: 15 },
  { id: 'rightBars', type: 'int', title: 'Right Bars', defval: 15 },
  { id: 'volumeThresh', type: 'int', title: 'Volume Threshold', defval: 20 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Resistance', color: '#FF0000', lineWidth: 3 },
  { id: 'plot1', title: 'Support', color: '#233dee', lineWidth: 3 },
];

export const metadata = {
  title: 'Support and Resistance Levels with Breaks',
  shortTitle: 'S/R Breaks',
  overlay: true,
};

// Pine v4 color constants
const RED = '#FF5252';
const GREEN = '#4CAF50';

export function calculate(bars: Bar[], inputs: Partial<SRLevelsBreaksInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { toggleBreaks, leftBars, rightBars, volumeThresh } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);

  // Pine: osc = 100 * (ema(volume, 5) - ema(volume, 10)) / ema(volume, 10)  (na while the emas are na)
  const volSeries = new Series(bars, (b) => b.volume ?? NaN);
  const volEma5 = ta.ema(volSeries, 5).toArray();
  const volEma10 = ta.ema(volSeries, 10).toArray();
  const osc: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const e5 = volEma5[i] ?? NaN;
    const e10 = volEma10[i] ?? NaN;
    osc[i] = 100 * (e5 - e10) / e10;
  }

  const phArr = ta.pivothigh(highSeries, leftBars, rightBars).toArray();
  const plArr = ta.pivotlow(lowSeries, leftBars, rightBars).toArray();

  // Pine: highUsePivot = fixnan(pivothigh(leftBars, rightBars)[1]); lowUsePivot = fixnan(pivotlow(leftBars, rightBars)[1])
  const highUse: number[] = new Array(n);
  const lowUse: number[] = new Array(n);
  let lastHigh = NaN;
  let lastLow = NaN;
  for (let i = 0; i < n; i++) {
    const ph = i > 0 ? phArr[i - 1] : NaN;
    const pl = i > 0 ? plArr[i - 1] : NaN;
    if (ph != null && !isNaN(ph)) lastHigh = ph;
    if (pl != null && !isNaN(pl)) lastLow = pl;
    highUse[i] = lastHigh;
    lowUse[i] = lastLow;
  }

  const markers: MarkerData[] = [];
  const supportBroken: boolean[] = new Array(n).fill(false);
  const resistanceBroken: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const { open, high, low, close } = bars[i];
    const prevClose = bars[i - 1].close;
    // Pine crossover / crossunder: false when a value is na
    const crossOver = close > highUse[i] && prevClose <= highUse[i - 1];
    const crossUnder = close < lowUse[i] && prevClose >= lowUse[i - 1];
    const volPass = osc[i] > volumeThresh;
    // alertcondition(crossunder(close, lowUsePivot) and osc > volumeThresh, "Support Broken")
    // alertcondition(crossover(close, highUsePivot) and osc > volumeThresh, "Resistance Broken")
    supportBroken[i] = crossUnder && volPass;
    resistanceBroken[i] = crossOver && volPass;
    if (!toggleBreaks) continue;

    // Pine plotshape(..., style = shape.labeldown / labelup, color = color.red / color.green,
    //   textcolor = color.white, size = size.tiny)
    // For breaks with volume
    if (crossUnder && !(open - close < high - open) && volPass) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'B', id: 'shape0', textColor: '#FFFFFF', size: 'tiny' });
    }
    if (crossOver && !(open - low > close - open) && volPass) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: GREEN, text: 'B', id: 'shape1', textColor: '#FFFFFF', size: 'tiny' });
    }
    // For bull / bear wicks (no volume filter)
    if (crossOver && open - low > close - open) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: GREEN, text: 'Bull Wick', id: 'shape2', textColor: '#FFFFFF', size: 'tiny' });
    }
    if (crossUnder && open - close < high - open) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'Bear Wick', id: 'shape3', textColor: '#FFFFFF', size: 'tiny' });
    }
  }

  // Pine: plot(level, color = change(level) ? na : col, offset = -(rightBars + 1)).
  // The value of bar j is drawn at bar j - (rightBars + 1); on the bars where the level changes the colour is na
  // (value kept, drawn transparent).
  const shift = rightBars + 1;
  const levelPlot = (level: number[], col: string) =>
    bars.map((b, i) => {
      const j = i + shift;
      if (j >= n) return { time: b.time, value: NaN };
      const changed = j > 0 && level[j] - level[j - 1] !== 0 && !isNaN(level[j] - level[j - 1]);
      return { time: b.time, value: level[j], color: changed ? 'transparent' : col };
    });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': levelPlot(highUse, '#FF0000'), 'plot1': levelPlot(lowUse, '#233dee') },
    markers,
    alerts: alertStates(alertConditions, bars, [supportBroken, resistanceBroken]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Support Broken', message: 'Support Broken' },
  { id: 'alert1', title: 'Resistance Broken', message: 'Resistance Broken' },
];

export const SRLevelsBreaks = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
