/**
 * Volume bar range
 *
 * Keeps the high and the low of the last bar whose volume equals the highest volume of the last `lookback` bars
 * (the "volume bar"), and fills the range between them (aqua while the high does not change, white on a change).
 * Signals need a volume above its SMA and above the previous volume, and a close in the right half of the bar:
 * a breakout is a close crossing over the range high, a breakdown a close crossing under the range low; a reversal
 * breakout is a close crossing back over the range low (previous close below it), a reversal breakdown a close
 * crossing back under the range high (previous close above it). The signal text style is an input.
 *
 * Reference: "Volume bar range" by pandorid
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © tradeswithashish
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface VolumeBarRangeInputs {
  /** Number of bars to look back for the highest volume */
  lookback: number;
  /** Period of the volume moving average */
  volMaPeriod: number;
  /** Show the reversal breakout / breakdown signals */
  showReversalSignals: boolean;
  /** Text style of the buy / sell signals */
  signalText: '买/卖' | 'B/S' | 'BUY/SELL';
}

export const defaultInputs: VolumeBarRangeInputs = {
  lookback: 55,
  volMaPeriod: 21,
  showReversalSignals: true,
  signalText: '买/卖',
};

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Lookback Period', defval: 55, min: 10, max: 200, step: 5 },
  { id: 'volMaPeriod', type: 'int', title: 'Volume MA Period', defval: 21, min: 5, max: 50, step: 1 },
  { id: 'showReversalSignals', type: 'bool', title: 'Show Reversal Signals', defval: true },
  { id: 'signalText', type: 'string', title: 'Signal Text', defval: '买/卖', options: ['买/卖', 'B/S', 'BUY/SELL'] },
];

const INVISIBLE = String(color.new(color.white, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Candle high', color: INVISIBLE, lineWidth: 1 },
  { id: 'plot1', title: 'Candle low', color: INVISIBLE, lineWidth: 1 },
];

export const metadata = {
  title: 'Volume bar range',
  shortTitle: 'VBR',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeBarRangeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const volume = bars.map((b) => b.volume ?? NaN);
  const close = bars.map((b) => b.close);
  const highestVol = A(ta.highest(S(volume), cfg.lookback));
  const volMa = A(ta.sma(S(volume), cfg.volMaPeriod));

  // var highVB = high, var lowVB = low: the high / low of bar 0, then of the last bar with the highest volume
  const highVB: number[] = new Array(n);
  const lowVB: number[] = new Array(n);
  let hi = n > 0 ? bars[0].high : NaN;
  let lo = n > 0 ? bars[0].low : NaN;
  for (let i = 0; i < n; i++) {
    if (eq(volume[i], highestVol[i])) {
      hi = bars[i].high;
      lo = bars[i].low;
    }
    highVB[i] = hi;
    lowVB[i] = lo;
  }

  // ta.crossover / ta.crossunder (exact comparisons, last bar where both values were not na)
  const closeS = S(close);
  const crossOverHigh = A(ta.crossover(closeS, S(highVB)));
  const crossUnderLow = A(ta.crossunder(closeS, S(lowVB)));
  const crossOverLow = A(ta.crossover(closeS, S(lowVB)));
  const crossUnderHigh = A(ta.crossunder(closeS, S(highVB)));

  const plot0: { time: number; value: number }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const fillColors: string[] = [];
  const aquaFill = String(color.new(color.aqua, 80));
  const whiteFill = String(color.new(color.white, 80));
  const markers: MarkerData[] = [];
  const [buyText, sellText] = cfg.signalText === 'B/S' ? ['B', 'S']
    : cfg.signalText === 'BUY/SELL' ? ['BUY', 'SELL'] : ['买', '卖'];
  const known = cfg.signalText === '买/卖' || cfg.signalText === 'B/S' || cfg.signalText === 'BUY/SELL';
  // Style ids: shape0 .. shape3 for 买/卖, shape4 .. shape7 for B/S, shape8 .. shape11 for BUY/SELL
  const idBase = cfg.signalText === 'B/S' ? 4 : cfg.signalText === 'BUY/SELL' ? 8 : 0;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    plot0.push({ time: t, value: highVB[i] });
    plot1.push({ time: t, value: lowVB[i] });
    // colfill = highVB == highVB[1] ? color.new(color.aqua, 80) : color.new(color.white, 80)
    fillColors.push(i > 0 && eq(highVB[i], highVB[i - 1]) ? aquaFill : whiteFill);

    const range = b.high - b.low;
    const volOk = gt(volume[i], volMa[i]) && i > 0 && gt(volume[i], volume[i - 1]) && gt(range, 0);
    const upperClose = gt((b.close - b.low) / range, 0.5);
    const lowerClose = gt((b.high - b.close) / range, 0.5);
    const prevClose = i > 0 ? close[i - 1] : NaN;
    const breakout = crossOverHigh[i] === 1 && volOk && upperClose;
    const breakdown = crossUnderLow[i] === 1 && volOk && lowerClose;
    const reversalBreakout = crossOverLow[i] === 1 && volOk && upperClose && lt(prevClose, lowVB[i]);
    const reversalBreakdown = crossUnderHigh[i] === 1 && volOk && lowerClose && gt(prevClose, highVB[i]);
    if (!known) continue;

    // plotshape(..., style = shape.labelup / labeldown, size = size.tiny, location.belowbar / abovebar,
    //   textcolor = color.white); one group of four plotshape calls per signal text style
    const buy = (on: boolean, c: string, k: number) => {
      if (on) markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: c, size: 'tiny', text: buyText, textColor: color.white, id: `shape${idBase + k}` });
    };
    const sell = (on: boolean, c: string, k: number) => {
      if (on) markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: c, size: 'tiny', text: sellText, textColor: color.white, id: `shape${idBase + k}` });
    };
    buy(breakout, color.blue, 0);
    sell(breakdown, color.black, 1);
    buy(cfg.showReversalSignals && reversalBreakout, color.purple, 2);
    sell(cfg.showReversalSignals && reversalBreakdown, color.orange, 3);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Range of Volume bar' }, colors: fillColors }],
    markers,
  };
}

export const VolumeBarRange = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
