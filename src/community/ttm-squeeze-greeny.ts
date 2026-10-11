/**
 * TTM Squeeze
 *
 * Momentum histogram and squeeze dots. The oscillator is the linear regression (end value, `length` bars) of
 * close - e1 / 2, where e1 = (highest high + lowest low) / 2 + sma(close), all over `length` bars. Its bars are
 * bright when the oscillator rises and dark when it falls (cyan shades at or above zero, magenta shades below).
 * The dots on the zero line compare the upper Bollinger band (sma + 2 stdev) with the upper Keltner band
 * (ema(close) + ema(true range)): green when the Bollinger band is at or above the Keltner band, red when it is
 * inside (the squeeze).
 *
 * Reference: "TTM Squeeze" by Greeny
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface TtmSqueezeGreenyInputs {
  length: number;
}

export const defaultInputs: TtmSqueezeGreenyInputs = {
  length: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 20, min: 0 },
];

// Colours of the script (green and red are the colour constants of Pine version 1), with the default plot
// transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const RISE_POS = V1('#00FFFF');
const RISE_NEG = V1('#CC00CC');
const FALL_POS = V1('#009B9B');
const FALL_NEG = V1('#FF9BFF');
const GREEN = V1('#008000');
const RED = V1('#FF0000');

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Oscillator', color: RISE_POS, lineWidth: 2, style: 'histogram' },
  { id: 'plot1', title: 'Squeeze', color: GREEN, lineWidth: 3, style: 'circles' },
];

export const metadata = {
  title: 'TTM Squeeze',
  shortTitle: 'TTM Squeeze',
  overlay: false,
};

/** Pine float comparisons: a < b only when b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(bars: Bar[], inputs: Partial<TtmSqueezeGreenyInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const length = cfg.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (values: number[]) => Series.fromArray(bars, values);

  const close = new Series(bars, (b) => b.close);
  const sma = A(ta.sma(close, length));
  const hh = A(ta.highest(new Series(bars, (b) => b.high), length));
  const ll = A(ta.lowest(new Series(bars, (b) => b.low), length));

  // e1 = (highest(high, length) + lowest(low, length)) / 2 + sma(close, length)
  // osc = linreg(close - e1 / 2, length, 0)
  const oscSource = bars.map((b, i) => b.close - ((hh[i] + ll[i]) / 2 + sma[i]) / 2);
  const osc = A(ta.linreg(S(oscSource), length, 0));

  // diff = (sma + 2 * stdev) - (ema(close) + ema(tr))
  const dev = A(ta.stdev(close, length));
  const emaClose = A(ta.ema(close, length));
  const emaTr = A(ta.ema(ta.tr(bars), length));

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: typeof plot0 = [];
  for (let i = 0; i < bars.length; i++) {
    const o = osc[i];
    const prev = i > 0 ? osc[i - 1] : NaN;
    const oscColor = lt(prev, o) ? (ge(o, 0) ? RISE_POS : RISE_NEG) : ge(o, 0) ? FALL_POS : FALL_NEG;
    const diff = sma[i] + 2 * dev[i] - (emaClose[i] + emaTr[i]);
    plot0.push({ time: bars[i].time, value: o, color: oscColor });
    plot1.push({ time: bars[i].time, value: 0, color: ge(diff, 0) ? GREEN : RED });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
  };
}

export const TtmSqueezeGreeny = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
