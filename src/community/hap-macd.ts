/**
 * HaP MACD
 *
 * Standard MACD (EMA or SMA oscillator and signal) with signal dots from a DEMA MACD: a dot on the MACD line while
 * the DEMA MACD is above its DEMA signal and that signal rises (blue on the first bar, then green when the MACD
 * rises, orange otherwise), and a red exit dot on the first bar after. The histogram and the MACD / signal cross
 * triangles are hidden in Pine (display.none).
 *
 * Reference: "HaP MACD" by agahakanaga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface HaPMACDInputs {
  src: SourceType;
  fastLength: number;
  slowLength: number;
  signalLength: number;
  /** Oscillator MA type */
  oscType: 'EMA' | 'SMA';
  /** Signal MA type */
  sigType: 'EMA' | 'SMA';
}

export const defaultInputs: HaPMACDInputs = {
  src: 'close',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  oscType: 'EMA',
  sigType: 'EMA',
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26, min: 1 },
  { id: 'signalLength', type: 'int', title: 'Signal Length', defval: 9, min: 1 },
  { id: 'oscType', type: 'string', title: 'Oscillator MA Type', defval: 'EMA', options: ['EMA', 'SMA'] },
  { id: 'sigType', type: 'string', title: 'Signal MA Type', defval: 'EMA', options: ['EMA', 'SMA'] },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Histogram', color: '#26a69a', lineWidth: 1, style: 'columns', display: 'none' },
  { id: 'plot1', title: 'MACD', color: '#363A45', lineWidth: 1 },
  { id: 'plot2', title: 'Signal', color: '#ff6d00', lineWidth: 1 },
];

export const metadata = {
  title: 'HaP MACD',
  shortTitle: 'HaP MACD',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<HaPMACDInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const { src, fastLength, slowLength, signalLength, oscType, sigType } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const source = getSourceSeries(bars, src);

  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const ma = (s: Series, length: number, type: string) => arr(type === 'SMA' ? ta.sma(s, length) : ta.ema(s, length));
  // f_dema(source, length) = 2 * ema(source) - ema(ema(source))
  const dema = (s: Series, length: number) => {
    const e1 = ta.ema(s, length);
    const a1 = arr(e1);
    const a2 = arr(ta.ema(e1, length));
    return a1.map((v, i) => 2 * v - a2[i]);
  };

  const maFast = ma(source, fastLength, oscType);
  const maSlow = ma(source, slowLength, oscType);
  const macd = maFast.map((v, i) => v - maSlow[i]);
  const signal = ma(Series.fromArray(bars, macd), signalLength, sigType);
  const hist = macd.map((v, i) => v - signal[i]);

  const demaFast = dema(source, fastLength);
  const demaSlow = dema(source, slowLength);
  const demaMacd = demaFast.map((v, i) => v - demaSlow[i]);
  const demaSignal = dema(Series.fromArray(bars, demaMacd), signalLength);

  // buy_condition = dema_macd_line > dema_signal_line and dema_signal_line > dema_signal_line[1]
  // (a comparison with na is false; a bool history before the first bar is false)
  const buy: boolean[] = demaMacd.map((v, i) => v > demaSignal[i] && i > 0 && demaSignal[i] > demaSignal[i - 1]);

  const markers: MarkerData[] = [];
  const histPlot: { time: number; value: number; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const prevBuy = i > 0 && buy[i - 1];
    // hColor = hist >= 0 ? (hist > hist[1] ? #26a69a : #b2dfdb) : (hist > hist[1] ? #ffcdd2 : #ff5252)
    const rising = i > 0 && hist[i] > hist[i - 1];
    histPlot.push({ time: t, value: hist[i], color: hist[i] >= 0 ? (rising ? '#26a69a' : '#b2dfdb') : (rising ? '#ffcdd2' : '#ff5252') });
    // plotshape(buy_condition ? macd : na, shape.circle, location.absolute, color = dot_color, size.tiny)
    // dot_color: blue on the first signal bar, else green when macd > macd[1], else orange
    if (buy[i] && !isNaN(macd[i])) {
      const dot = !prevBuy ? color.blue : i > 0 && macd[i] > macd[i - 1] ? color.green : color.orange;
      markers.push({ time: t, position: 'atPriceMiddle', price: macd[i], shape: 'circle', color: dot, size: 'tiny', id: 'shape0' });
    }
    // plotshape(buy_condition[1] and not buy_condition ? macd : na, shape.circle, color.red, size.tiny)
    if (prevBuy && !buy[i] && !isNaN(macd[i])) {
      markers.push({ time: t, position: 'atPriceMiddle', price: macd[i], shape: 'circle', color: color.red, size: 'tiny', id: 'shape1' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: histPlot,
      plot1: bars.map((b, i) => ({ time: b.time, value: macd[i] })),
      plot2: bars.map((b, i) => ({ time: b.time, value: signal[i] })),
    },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: String(color.new(color.gray, 50)), linestyle: 'dashed' } }],
    markers,
  };
}

export const HaPMACD = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
