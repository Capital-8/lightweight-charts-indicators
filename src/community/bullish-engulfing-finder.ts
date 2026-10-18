/**
 * Bullish Engulfing
 *
 * Colours yellow the bars that complete a bullish engulfing: the bar before is a down bar (open[1] > close[1]), this
 * bar is an up bar (close > open) whose body contains the body before (close >= open[1], close[1] >= open) and is
 * longer than it (close - open > open[1] - close[1]).
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): "Bullish Engulfing Formed" on each such bar.
 *
 * Reference: "Bullish Engulfing" by HPotter
 * Original notice: Copyright by HPotter v1.0 01/04/2014
 */

import { type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BarColorData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface BullishEngulfingFinderInputs {}

export const defaultInputs: BullishEngulfingFinderInputs = {};

export const inputConfig: InputConfig[] = [];

// No plot(): the output is the bar colour
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Bullish Engulfing',
  shortTitle: 'Bullish Engulfing',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  _inputs: Partial<BullishEngulfingFinderInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; alertCalls: AlertCall[] } {
  const barColors: BarColorData[] = [];
  const alertCalls: AlertCall[] = [];

  // bar 0: open[1] / close[1] are na, the signal is false
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1];
    const b = bars[i];
    const signal = p.open > p.close && b.close > b.open && b.close >= p.open && p.close >= b.open
      && b.close - b.open > p.open - p.close;
    if (!signal) continue;
    // if signal: alert("Bullish Engulfing Formed", alert.freq_once_per_bar_close)
    alertCalls.push({ time: b.time, message: 'Bullish Engulfing Formed', freq: 'once_per_bar_close' });
    // barcolor(signal ? color.yellow : na)
    barColors.push({ id: 'barcolor0', time: b.time, color: '#FFEB3B' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    barColors,
    alertCalls,
  };
}

export const BullishEngulfingFinder = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
