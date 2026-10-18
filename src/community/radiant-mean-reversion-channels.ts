/**
 * Radiant Mean Reversion Channels
 *
 * A channel around the HMA of the source with a half width of ATR * multiplier. The oscillator is the source
 * position in the channel, (src - lower) / (upper - lower) * 100, smoothed by a WMA and coloured by a gradient from
 * the bearish colour (0) to the bullish colour (100). Levels at 90 / 80 / 50 / 20 / 10 with fills of the bearish
 * (80-90) and bullish (10-20) zones; circles at the bottom when the oscillator crosses over 20 and at the top when it
 * crosses under 80.
 * Alerts (alertcondition, `alerts` of the result): 'Radiant Buy' and 'Radiant Sell', true on the bars of the circles.
 *
 * Reference: "Radiant Mean Reversion Channels [Pineify]" by Pineify
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Pineify
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Radiant Buy', message: 'Price is reversing from oversold conditions' },
  { id: 'alert1', title: 'Radiant Sell', message: 'Price is reversing from overbought conditions' },
];

export interface RadiantMeanReversionChannelsInputs {
  /** HMA / ATR length */
  len: number;
  /** ATR multiplier of the channel half width */
  mult: number;
  /** WMA length of the oscillator */
  smooth: number;
  src: SourceType;
  colBull: string;
  colBear: string;
  /** Neutral colour (an input of the script, not used by any output) */
  colNeu: string;
}

export const defaultInputs: RadiantMeanReversionChannelsInputs = {
  len: 21,
  mult: 2.0,
  smooth: 3,
  src: 'close',
  colBull: '#089981',
  colBear: '#f23645',
  colNeu: '#2962ff',
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Channel Length', defval: 21, min: 1 },
  { id: 'mult', type: 'float', title: 'Band Multiplier', defval: 2.0, step: 0.1 },
  { id: 'smooth', type: 'int', title: 'Oscillator Smoothing', defval: 3, min: 1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'colBull', type: 'color', title: 'Bullish Color', defval: '#089981' },
  { id: 'colBear', type: 'color', title: 'Bearish Color', defval: '#f23645' },
  { id: 'colNeu', type: 'color', title: 'Neutral Color', defval: '#2962ff' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Radiant Oscillator', color: '#089981', lineWidth: 2 },
];

/** The five hlines with the default colours (the result `hlines` carry the input colours) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_ob', price: 90, title: 'Extreme Overbought', color: String(color.new('#f23645', 50)), linestyle: 'dotted' },
  { id: 'hline_top', price: 80, title: 'Overbought', color: String(color.new('#f23645', 50)), linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'Mean (Equilibrium)', color: String(color.new(color.gray, 50)), linestyle: 'solid' },
  { id: 'hline_bot', price: 20, title: 'Oversold', color: String(color.new('#089981', 50)), linestyle: 'dashed' },
  { id: 'hline_os', price: 10, title: 'Extreme Oversold', color: String(color.new('#089981', 50)), linestyle: 'dotted' },
];

/** fill(h_top, h_ob) and fill(h_bot, h_os) with the default colours */
export const fillConfig: FillConfig[] = [
  { id: 'fill_bear', plot1: 'hline_top', plot2: 'hline_ob', color: String(color.new('#f23645', 85)), title: 'Bearish Zone' },
  { id: 'fill_bull', plot1: 'hline_bot', plot2: 'hline_os', color: String(color.new('#089981', 85)), title: 'Bullish Zone' },
];

export const metadata = {
  title: 'Radiant Mean Reversion Channels [Pineify]',
  shortTitle: 'Pineify - Radiant Channels',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<RadiantMeanReversionChannelsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const srcSeries = getSourceSeries(bars, cfg.src);
  const src = A(srcSeries);

  const mean = A(ta.hma(srcSeries, cfg.len));
  const atr = A(ta.atr(bars, cfg.len));
  const rawOsc = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const volatility = atr[i] * cfg.mult;
    const upper = mean[i] + volatility;
    const lower = mean[i] - volatility;
    // A plain division: x / 0 is +-infinity (0 / 0 NaN); ta.wma skips the infinite values as Pine
    rawOsc[i] = ((src[i] - lower) / (upper - lower)) * 100;
  }
  const oscSeries = ta.wma(Series.fromArray(bars, rawOsc), cfg.smooth);
  const osc = A(oscSeries);
  const longSignal = A(ta.crossover(oscSeries, 20));
  const shortSignal = A(ta.crossunder(oscSeries, 80));

  const plot0 = bars.map((b, i) => ({
    time: b.time as number,
    value: Number.isFinite(osc[i]) ? osc[i] : NaN,
    color: color.from_gradient(osc[i], 0, 100, cfg.colBear, cfg.colBull),
  }));

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    // plotshape(long_signal, "Buy Signal", shape.circle, location.bottom, color = col_bull, size = size.tiny)
    if (longSignal[i]) markers.push({ time: t, position: 'bottom', shape: 'circle', color: cfg.colBull, size: 'tiny' });
    // plotshape(short_signal, "Sell Signal", shape.circle, location.top, color = col_bear, size = size.tiny)
    if (shortSignal[i]) markers.push({ time: t, position: 'top', shape: 'circle', color: cfg.colBear, size: 'tiny' });
  }

  const bearLine = String(color.new(cfg.colBear, 50));
  const bullLine = String(color.new(cfg.colBull, 50));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines: [
      { value: 90, options: { title: 'Extreme Overbought', color: bearLine, linestyle: 'dotted' } },
      { value: 80, options: { title: 'Overbought', color: bearLine, linestyle: 'dashed' } },
      { value: 50, options: { title: 'Mean (Equilibrium)', color: String(color.new(color.gray, 50)), linestyle: 'solid' } },
      { value: 20, options: { title: 'Oversold', color: bullLine, linestyle: 'dashed' } },
      { value: 10, options: { title: 'Extreme Oversold', color: bullLine, linestyle: 'dotted' } },
    ],
    fills: [
      { plot1: 'hline_top', plot2: 'hline_ob', options: { title: 'Bearish Zone' },
        colors: new Array<string>(n).fill(String(color.new(cfg.colBear, 85))) },
      { plot1: 'hline_bot', plot2: 'hline_os', options: { title: 'Bullish Zone' },
        colors: new Array<string>(n).fill(String(color.new(cfg.colBull, 85))) },
    ],
    markers,
    // alertcondition(long_signal, "Radiant Buy") / alertcondition(short_signal, "Radiant Sell")
    alerts: alertStates(alertConditions, bars, [longSignal.map((v) => !!v), shortSignal.map((v) => !!v)]),
  };
}

export const RadiantMeanReversionChannels = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
