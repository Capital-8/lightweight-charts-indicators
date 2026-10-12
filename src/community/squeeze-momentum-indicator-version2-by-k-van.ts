/**
 * Squeeze Momentum Indicator Version2
 *
 * Bollinger Bands (SMA of the close +- KC MultFactor * stdev of the close: the original uses the KC factor for the
 * bands, the BB MultFactor input is not used) against Keltner Channels (SMA of the close +- KC MultFactor * SMA of
 * the true range, or of high - low). The momentum line is the linear regression of
 * close - avg(avg(highest high, lowest low), SMA of the close) over the KC length; the signal line is its SMA over
 * the signal length. The cross line at 0 is blue without squeeze, black when the bands are inside the channels and
 * gray when they are outside.
 *
 * Reference: "Squeeze Momentum Indicator [LazyBear] Version2 by KıvanÇ fr3762" by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: @author LazyBear, modified by KıvanÇ @fr3762 on twitter
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface SqueezeMomentumIndicatorVersion2Inputs {
  /** BB Length */
  length: number;
  /** BB MultFactor (not used by the original computation) */
  mult: number;
  /** KC Length */
  lengthKC: number;
  /** KC MultFactor */
  multKC: number;
  /** Signal Length */
  signalPeriod: number;
  /** Use TrueRange (KC) */
  useTrueRange: boolean;
}

export const defaultInputs: SqueezeMomentumIndicatorVersion2Inputs = {
  length: 20,
  mult: 2.0,
  lengthKC: 20,
  multKC: 1.5,
  signalPeriod: 5,
  useTrueRange: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'BB Length', defval: 20 },
  { id: 'mult', type: 'float', title: 'BB MultFactor', defval: 2.0 },
  { id: 'lengthKC', type: 'int', title: 'KC Length', defval: 20 },
  { id: 'multKC', type: 'float', title: 'KC MultFactor', defval: 1.5 },
  { id: 'signalPeriod', type: 'int', title: 'Signal Length', defval: 5 },
  { id: 'useTrueRange', type: 'bool', title: 'Use TrueRange (KC)', defval: true },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const BLUE = V1('#0000FF');
const BLACK = V1('#000000');
const GRAY = V1('#808080');
const RED = V1('#FF0000');

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: BLUE, lineWidth: 2 },
  { id: 'plot1', title: 'Plot', color: BLUE, lineWidth: 2, style: 'cross' },
  { id: 'plot2', title: 'Plot', color: RED, lineWidth: 2 },
];

export const metadata = {
  title: 'Squeeze Momentum Indicator [LazyBear] Version2 by KıvanÇ fr3762',
  shortTitle: 'SQZMOMv2',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(bars: Bar[], inputs: Partial<SqueezeMomentumIndicatorVersion2Inputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const { length, lengthKC, multKC, signalPeriod, useTrueRange } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const closeArr = bars.map((b) => b.close);
  const close = S(closeArr);

  // BB: basis = sma(close, length), dev = multKC * stdev(close, length)
  const basis = A(ta.sma(close, length));
  const sd = A(ta.stdev(close, length));
  const upperBB = basis.map((v, i) => v + multKC * sd[i]);
  const lowerBB = basis.map((v, i) => v - multKC * sd[i]);

  // KC: range = useTrueRange ? tr : high - low (tr is na on the first bar)
  const ma = A(ta.sma(close, lengthKC));
  const range = useTrueRange ? A(ta.tr(bars)) : bars.map((b) => b.high - b.low);
  const rangema = A(ta.sma(S(range), lengthKC));
  const upperKC = ma.map((v, i) => v + rangema[i] * multKC);
  const lowerKC = ma.map((v, i) => v - rangema[i] * multKC);

  // val = linreg(close - avg(avg(highest(high, lengthKC), lowest(low, lengthKC)), sma(close, lengthKC)), lengthKC, 0)
  const hh = A(ta.highest(S(bars.map((b) => b.high)), lengthKC));
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), lengthKC));
  const src = closeArr.map((c, i) => c - ((hh[i] + ll[i]) / 2 + ma[i]) / 2);
  const val = A(ta.linreg(S(src), lengthKC, 0));
  const signal = A(ta.sma(S(val), signalPeriod));

  const num = (v: number) => (Number.isFinite(v) ? v : NaN);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: num(val[i]) })),
      // scolor = noSqz ? blue : sqzOn ? black : gray
      plot1: bars.map((b, i) => {
        const sqzOn = gt(lowerBB[i], lowerKC[i]) && lt(upperBB[i], upperKC[i]);
        const sqzOff = lt(lowerBB[i], lowerKC[i]) && gt(upperBB[i], upperKC[i]);
        const noSqz = !sqzOn && !sqzOff;
        return { time: b.time, value: 0, color: noSqz ? BLUE : sqzOn ? BLACK : GRAY };
      }),
      plot2: bars.map((b, i) => ({ time: b.time, value: num(signal[i]) })),
    },
  };
}

export const SqueezeMomentumIndicatorVersion2 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
