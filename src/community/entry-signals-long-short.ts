/**
 * Entry Signals (Long/Short)
 *
 * RSI crossing its SMA signal line arms a pending long (RSI crosses up) or a pending short (RSI crosses down). A
 * pending long gives a Long signal when the fast EMA crosses above the slow EMA; it is cancelled by an RSI cross down
 * or an EMA cross down. The short side is the mirror. The two EMAs are plotted on the price chart.
 * A signal needs a closed bar (barstate.isconfirmed). The port reads the state of the last bar from the optional
 * third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Entry Signals (Long/Short)" by tradegear9
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface EntrySignalsLongShortInputs {
  /** RSI period; also the length of the RSI signal SMA */
  rsiLength: number;
  /** Fast EMA length */
  emaFastLength: number;
  /** Slow EMA length */
  emaSlowLength: number;
}

export const defaultInputs: EntrySignalsLongShortInputs = {
  rsiLength: 14,
  emaFastLength: 5,
  emaSlowLength: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Period', defval: 14, min: 2 },
  { id: 'emaFastLength', type: 'int', title: 'Fast EMA (Short-Term)', defval: 5, min: 1 },
  { id: 'emaSlowLength', type: 'int', title: 'Slow EMA (Long-Term)', defval: 20, min: 2 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast EMA (5)', color: color.black, lineWidth: 1 },
  { id: 'plot1', title: 'Slow EMA (20)', color: color.blue, lineWidth: 1 },
];

export const metadata = {
  title: 'Entry Signals (Long/Short)',
  shortTitle: 'Entry Signals',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<EntrySignalsLongShortInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const { rsiLength, emaFastLength, emaSlowLength } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const close = new Series(bars, (b) => b.close);
  const rsi = ta.rsi(close, rsiLength).toArray();
  const rsiSignal = ta.sma(Series.fromArray(bars, rsi), rsiLength).toArray();
  const emaFast = ta.ema(close, emaFastLength).toArray();
  const emaSlow = ta.ema(close, emaSlowLength).toArray();

  // ta.crossover(a, b): a > b and a[1] <= b[1] (false when a value is na)
  const crossover = (a: number[], b: number[], i: number) =>
    i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
  const crossunder = (a: number[], b: number[], i: number) =>
    i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];

  const markers: MarkerData[] = [];
  let pendingLong = false;
  let pendingShort = false;

  for (let i = 0; i < n; i++) {
    const bullishRsiCross = crossover(rsi, rsiSignal, i);
    const bearishRsiCross = crossunder(rsi, rsiSignal, i);
    const bullishEmaCross = crossover(emaFast, emaSlow, i);
    const bearishEmaCross = crossunder(emaFast, emaSlow, i);

    // Long signal
    if (bullishRsiCross) pendingLong = true;
    if (pendingLong && (bearishRsiCross || bearishEmaCross)) pendingLong = false;
    const longSignal = pendingLong && bullishEmaCross && barIsConfirmed(i); // and barstate.isconfirmed
    if (longSignal) pendingLong = false;

    // Short signal
    if (bearishRsiCross) pendingShort = true;
    if (pendingShort && (bullishRsiCross || bullishEmaCross)) pendingShort = false;
    const shortSignal = pendingShort && bearishEmaCross && barIsConfirmed(i);
    if (shortSignal) pendingShort = false;

    // plotshape(long_signal, 'Long Signal', location.belowbar, shape.triangleup, size.small, color.green,
    //   text = 'Long', textcolor = color.green)
    if (longSignal) {
      markers.push({
        time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: color.green,
        text: 'Long', textColor: color.green, size: 'small',
      });
    }
    // plotshape(short_signal, 'Short Signal', location.abovebar, shape.triangledown, size.small, color.red,
    //   text = 'Short', textcolor = color.red)
    if (shortSignal) {
      markers.push({
        time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: color.red,
        text: 'Short', textColor: color.red, size: 'small',
      });
    }
  }

  const plotOf = (vals: number[]) => vals.map((v, i) => ({ time: bars[i].time, value: v ?? NaN }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: plotOf(emaFast), plot1: plotOf(emaSlow) },
    markers,
  };
}

export const EntrySignalsLongShort = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
