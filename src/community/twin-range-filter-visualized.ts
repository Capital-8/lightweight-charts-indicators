/**
 * Twin Range Filter Visualized
 *
 * Two smoothed ranges of the source: ema(ema(|x - x[1]|, period), 2 * period - 1) * range factor, for a fast and a
 * slow period; their average is the range. A range filter follows the source by at most that range. An upper band
 * (filter + range) and a lower band (filter - range) are trailed, and the Twin Range Filter line takes the upper or
 * the lower band, depending on the side of the close. BUY / SELL labels mark the crosses of the close and the line,
 * and the area between ohlc4 and the line is green when the close is above the line, red below.
 *
 * Reference: "Twin Range Filter" by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface TwinRangeFilterVisualizedInputs {
  source: SourceType;
  /** Show the BUY / SELL labels */
  showsignals: boolean;
  /** Fast period */
  per1: number;
  /** Fast range */
  mult1: number;
  /** Slow period */
  per2: number;
  /** Slow range */
  mult2: number;
}

export const defaultInputs: TwinRangeFilterVisualizedInputs = {
  source: 'close',
  showsignals: true,
  per1: 27,
  mult1: 1.6,
  per2: 55,
  mult2: 2,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'showsignals', type: 'bool', title: 'Show Buy/Sell Signals ?', defval: true },
  { id: 'per1', type: 'int', title: 'Fast period', defval: 27, min: 1 },
  { id: 'mult1', type: 'float', title: 'Fast range', defval: 1.6, min: 0.1 },
  { id: 'per2', type: 'int', title: 'Slow period', defval: 55, min: 1 },
  { id: 'mult2', type: 'float', title: 'Slow range', defval: 2, min: 0.1 },
];

const BLUE = '#2962FF';
const SIGNAL = 'rgb(0, 19, 230)';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: BLUE, lineWidth: 1 },
  { id: 'plot1', title: 'OHLC4', color: BLUE, lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'Twin Range Filter',
  shortTitle: 'Twin Range Filter',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
const nz = (v: number) => (isNaN(v) ? 0 : v);

export function calculate(
  bars: Bar[],
  inputs: Partial<TwinRangeFilterVisualizedInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const x = A(getSourceSeries(bars, cfg.source));

  // smoothrng(x, t, m) = ema(ema(abs(x - x[1]), t), t * 2 - 1) * m
  const change = Series.fromArray(bars, x.map((v, i) => (i > 0 ? Math.abs(v - x[i - 1]) : NaN)));
  const smoothrng = (t: number, m: number) => A(ta.ema(Series.fromArray(bars, A(ta.ema(change, t))), t * 2 - 1)).map((v) => v * m);
  const smrng1 = smoothrng(cfg.per1, cfg.mult1);
  const smrng2 = smoothrng(cfg.per2, cfg.mult2);
  const smrng = smrng1.map((v, i) => (v + smrng2[i]) / 2);

  const filt = new Array<number>(n);
  const fub = new Array<number>(n);
  const flb = new Array<number>(n);
  const trf = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    // rngfilt(x, r)
    const xi = x[i];
    const r = smrng[i];
    const prev = nz(i > 0 ? filt[i - 1] : NaN);
    filt[i] = gt(xi, prev) ? (lt(xi - r, prev) ? prev : xi - r) : (gt(xi + r, prev) ? prev : xi + r);
    const str = filt[i] + r;
    const sts = filt[i] - r;
    const close = bars[i].close;
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    const fub1 = i > 0 ? fub[i - 1] : NaN;
    const flb1 = i > 0 ? flb[i - 1] : NaN;
    fub[i] = lt(str, nz(fub1)) || gt(close1, nz(fub1)) ? str : nz(fub1);
    flb[i] = gt(sts, nz(flb1)) || lt(close1, nz(flb1)) ? sts : nz(flb1);
    const t1 = nz(i > 0 ? trf[i - 1] : NaN);
    trf[i] = eq(t1, fub1) && le(close, fub[i]) ? fub[i]
      : eq(t1, fub1) && ge(close, fub[i]) ? flb[i]
        : eq(t1, flb1) && ge(close, flb[i]) ? flb[i]
          : eq(t1, flb1) && le(close, flb[i]) ? fub[i]
            : fub[i];
  }

  const closeS = new Series(bars, (b) => b.close);
  const trfS = Series.fromArray(bars, trf);
  const long = ta.crossover(closeS, trfS).toArray();
  const short = ta.crossunder(closeS, trfS).toArray();

  const markers: MarkerData[] = [];
  if (cfg.showsignals) {
    for (let i = 0; i < n; i++) {
      const time = bars[i].time;
      if (long[i]) {
        markers.push({ time, position: 'belowBar', shape: 'labelUp', color: SIGNAL, text: 'BUY', textColor: '#FFFFFF', size: 'tiny' });
      }
      if (short[i]) {
        markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: SIGNAL, text: 'SELL', textColor: '#FFFFFF', size: 'tiny' });
      }
    }
  }

  // fill(mPlot, Trfff, color = close > TRF ? color.green : na, transp = 90), and the same in red below the line
  const green = String(color.new(color.green, 90));
  const red = String(color.new('#FF5252', 90)); // color.red of Pine v5
  const upColors = bars.map((b, i) => (gt(b.close, trf[i]) ? green : 'transparent'));
  const downColors = bars.map((b, i) => (lt(b.close, trf[i]) ? red : 'transparent'));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: Number.isFinite(trf[i]) ? trf[i] : NaN, color: BLUE })),
      plot1: bars.map((b) => ({ time: b.time, value: (b.open + b.high + b.low + b.close) / 4, color: BLUE })),
    },
    markers,
    fills: [
      { plot1: 'plot1', plot2: 'plot0', options: { title: 'UpTrend Highligter' }, colors: upColors },
      { plot1: 'plot1', plot2: 'plot0', options: { title: 'DownTrend Highligter' }, colors: downColors },
    ],
  };
}

export const TwinRangeFilterVisualized = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
