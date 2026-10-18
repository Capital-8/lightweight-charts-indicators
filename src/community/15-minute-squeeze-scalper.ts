/**
 * Squeeze Momentum Scalper
 *
 * Bollinger Bands (SMA +- mult * stdev of the close) against Keltner Channels (SMA of the close +- mult * SMA of the
 * true range, or of high - low). Squeeze on (red cross at 0): the Bollinger Bands are inside the Keltner Channels;
 * squeeze off (green): they are outside; else no squeeze (blue). The momentum histogram is the linear regression of
 * close - average(average(highest high, lowest low), SMA of the close) over the KC length: lime / green above zero
 * (rising / falling), red / maroon below zero (falling / rising).
 * Alerts (alertcondition, `alerts` of the result): 'Squeeze Fired' (squeeze on the bar before, not on this bar),
 * 'Long Momentum' / 'Short Momentum' (the momentum crosses above / below zero).
 *
 * Reference: "15-Minute Squeeze Scalper (Traffic Light Edition)" by Universal_Scalper_Pro
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import {
  alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState,
} from '../alert-states';

export interface SqueezeMomentumScalperInputs {
  /** Bollinger Bands length */
  lengthBB: number;
  /** Bollinger Bands standard deviation factor */
  multBB: number;
  /** Keltner Channels length (also the momentum length) */
  lengthKC: number;
  /** Keltner Channels range factor */
  multKC: number;
  /** Keltner Channels range: true range (true) or high - low (false) */
  useTrueRange: boolean;
}

export const defaultInputs: SqueezeMomentumScalperInputs = {
  lengthBB: 20,
  multBB: 2.0,
  lengthKC: 20,
  multKC: 1.5,
  useTrueRange: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'lengthBB', type: 'int', title: 'BB Length', defval: 20 },
  { id: 'multBB', type: 'float', title: 'BB MultFactor', defval: 2.0 },
  { id: 'lengthKC', type: 'int', title: 'KC Length', defval: 20 },
  { id: 'multKC', type: 'float', title: 'KC MultFactor', defval: 1.5 },
  { id: 'useTrueRange', type: 'bool', title: 'Use TrueRange (KC)', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Momentum Histogram', color: color.lime, lineWidth: 4, style: 'histogram' },
  { id: 'plot1', title: 'Squeeze Status', color: color.blue, lineWidth: 2, style: 'cross' },
];

export const metadata = {
  title: 'Squeeze Momentum Scalper [15m]',
  shortTitle: 'SQZ_Scalp',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SqueezeMomentumScalperInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const closeArr = bars.map((b) => b.close);
  const close = S(closeArr);

  // Bollinger Bands
  const basis = A(ta.sma(close, cfg.lengthBB));
  const sd = A(ta.stdev(close, cfg.lengthBB));
  const upperBB = basis.map((v, i) => v + cfg.multBB * sd[i]);
  const lowerBB = basis.map((v, i) => v - cfg.multBB * sd[i]);

  // Keltner Channels: range_val = useTrueRange ? ta.tr : high - low (ta.tr is na on the first bar)
  const ma = A(ta.sma(close, cfg.lengthKC));
  const rangeVal = cfg.useTrueRange ? A(ta.tr(bars)) : bars.map((b) => b.high - b.low);
  const rangema = A(ta.sma(S(rangeVal), cfg.lengthKC));
  const upperKC = ma.map((v, i) => v + rangema[i] * cfg.multKC);
  const lowerKC = ma.map((v, i) => v - rangema[i] * cfg.multKC);

  // Momentum: ta.linreg(close - avg(avg(highest(high), lowest(low)), sma(close)), lengthKC, 0)
  const hh = A(ta.highest(S(bars.map((b) => b.high)), cfg.lengthKC));
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), cfg.lengthKC));
  const momSource = closeArr.map((c, i) => c - ((hh[i] + ll[i]) / 2 + ma[i]) / 2);
  const val = A(ta.linreg(S(momSource), cfg.lengthKC, 0));

  const nz = (v: number) => (Number.isFinite(v) ? v : 0);
  const sqzOnAt = (i: number) => gt(lowerBB[i], lowerKC[i]) && lt(upperBB[i], upperKC[i]);

  // squeezeFired = sqzOn[1] and not sqzOn; longEntry = ta.crossover(val, 0); shortEntry = ta.crossunder(val, 0)
  const squeezeFired = bars.map((_, i) => i > 0 && sqzOnAt(i - 1) && !sqzOnAt(i));
  const longEntry = crossedOver(val, 0);
  const shortEntry = crossedUnder(val, 0);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // bcolor = val > 0 ? (val > nz(val[1]) ? lime : green) : (val < nz(val[1]) ? red : maroon)
      plot0: bars.map((b, i) => {
        const prev = i > 0 ? nz(val[i - 1]) : 0;
        const c = gt(val[i], 0) ? (gt(val[i], prev) ? color.lime : color.green) : (lt(val[i], prev) ? color.red : color.maroon);
        return { time: b.time, value: val[i], color: c };
      }),
      // scolor = noSqz ? blue : sqzOn ? red : green
      plot1: bars.map((b, i) => {
        const sqzOn = sqzOnAt(i);
        const sqzOff = lt(lowerBB[i], lowerKC[i]) && gt(upperBB[i], upperKC[i]);
        const noSqz = !sqzOn && !sqzOff;
        return { time: b.time, value: 0, color: noSqz ? color.blue : sqzOn ? color.red : color.green };
      }),
    },
    alerts: alertStates(alertConditions, bars, [squeezeFired, longEntry, shortEntry]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Squeeze Fired', message: 'Volatility Squeeze has FIRED! Check histogram for direction.' },
  { id: 'alert1', title: 'Long Momentum', message: 'Momentum has crossed bullish.' },
  { id: 'alert2', title: 'Short Momentum', message: 'Momentum has crossed bearish.' },
];

export const SqueezeMomentumScalper = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
