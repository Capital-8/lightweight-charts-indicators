/**
 * SwingArm ATR Trend Indicator (Blackflag FTS)
 *
 * An ATR trailing stop: the true range ("modified": the bar range capped at 1.5 times its average, with half of a
 * gap added to the distances to the previous close; or the usual true range) is smoothed with a Wilder average, and
 * the stop is the close minus (uptrend) or plus (downtrend) "ATR Factor" times that average, moved only in the
 * direction of the trend. The trend turns up when the close goes above the previous down stop and down when it goes
 * below the previous up stop. The extremum is the highest high of the uptrend (lowest low of the downtrend). Three
 * Fibonacci levels (61.8 %, 78.6 %, 88.6 %) between the extremum and the stop are filled in the trend colour.
 * Triangles mark a close that crosses back over a level of the bar before, in the direction against the trend
 * ("Show Fib Entries?"); the triangles of the three levels are spaced by 1, 1.5 and 2 times the 14-bar average of the
 * true range.
 *
 * Reference: "SwingArm ATR Trend Indicator" by vsnfnd (script title "Blackflag FTS")
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Duyck
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface SwingarmAtrTrendIndicatorInputs {
  trailType: 'modified' | 'unmodified';
  atrPeriod: number;
  atrFactor: number;
  showFibEntries: boolean;
}

export const defaultInputs: SwingarmAtrTrendIndicatorInputs = {
  trailType: 'modified',
  atrPeriod: 28,
  atrFactor: 5,
  showFibEntries: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'trailType', type: 'string', title: 'Trailtype', defval: 'modified', options: ['modified', 'unmodified'] },
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 28 },
  { id: 'atrFactor', type: 'int', title: 'ATR Factor', defval: 5 },
  { id: 'showFibEntries', type: 'bool', title: 'Show Fib Entries?', defval: true },
];

/** Colour constants of this version of the language */
const GREEN = '#4CAF50';
const RED = '#FF5252';
const LIME = '#00E676';
const FUCHSIA = '#E040FB';
const BLACK = '#363A45';
const YELLOW = '#FFEB3B';
const PURPLE = '#9C27B0';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trailingstop', color: GREEN, lineWidth: 1 },
  { id: 'plot1', title: 'Extremum', color: LIME, lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'Fib 1', color: BLACK, lineWidth: 1 },
  { id: 'plot3', title: 'Fib 2', color: BLACK, lineWidth: 1 },
  { id: 'plot4', title: 'Fib 3', color: BLACK, lineWidth: 1 },
  { id: 'plot5', title: 'l100', color: BLACK, lineWidth: 1 },
];

export const metadata = {
  title: 'Blackflag FTS',
  shortTitle: 'Blackflag FTS',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** Pine max / min: na when an argument is na */
const max = (...v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.max(...v));
const min = (...v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.min(...v));
const nz = (x: number, r = 0) => (isNaN(x) ? r : x);

export function calculate(bars: Bar[], inputs: Partial<SwingarmAtrTrendIndicatorInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  // security(tickerid(syminfo.prefix, syminfo.ticker), timeframe.period, x): the chart series
  const h = bars.map((b) => b.high);
  const l = bars.map((b) => b.low);
  const c = bars.map((b) => b.close);
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  // HiLo = min(h - l, 1.5 * nz(sma(h - l, ATRPeriod)))
  const rangeSma = A(ta.sma(S(bars.map((b) => b.high - b.low)), cfg.atrPeriod));
  const trueRange: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (cfg.trailType === 'modified') {
      const hiLo = min(h[i] - l[i], 1.5 * nz(rangeSma[i]));
      const hRef = le(l[i], at(h, i - 1)) ? h[i] - at(c, i - 1) : h[i] - at(c, i - 1) - 0.5 * (l[i] - at(h, i - 1));
      const lRef = ge(h[i], at(l, i - 1)) ? at(c, i - 1) - l[i] : at(c, i - 1) - l[i] - 0.5 * (at(l, i - 1) - h[i]);
      trueRange[i] = max(hiLo, hRef, lRef);
    } else {
      trueRange[i] = max(h[i] - l[i], Math.abs(h[i] - at(c, i - 1)), Math.abs(l[i] - at(c, i - 1)));
    }
  }

  const trail: number[] = new Array(n);
  const ex: number[] = new Array(n);
  const trend: number[] = new Array(n);
  let wild = NaN; // Wild_ma history (_wild[1])
  let trendUpPrev = NaN;
  let trendDownPrev = NaN;
  let trendPrev = NaN;
  let exPrev = NaN;
  for (let i = 0; i < n; i++) {
    // Wild_ma(_src, _malength): _wild := nz(_wild[1]) + (_src - nz(_wild[1])) / _malength
    wild = nz(wild) + (trueRange[i] - nz(wild)) / cfg.atrPeriod;
    const loss = cfg.atrFactor * wild;
    const up = c[i] - loss;
    const dn = c[i] + loss;
    const cPrev = at(c, i - 1);
    const trendUp = gt(cPrev, trendUpPrev) ? max(up, trendUpPrev) : up;
    const trendDown = lt(cPrev, trendDownPrev) ? min(dn, trendDownPrev) : dn;
    const t = gt(c[i], trendDownPrev) ? 1 : lt(c[i], trendUpPrev) ? -1 : nz(trendPrev, 1);
    trail[i] = t === 1 ? trendUp : trendDown;
    // crossover(Trend, 0) / crossunder(Trend, 0): Trend is never na
    const crossUp = t > 0 && trendPrev <= 0;
    const crossDown = t < 0 && trendPrev >= 0;
    ex[i] = crossUp ? h[i] : crossDown ? l[i] : t === 1 ? max(exPrev, h[i]) : t === -1 ? min(exPrev, l[i]) : exPrev;
    trend[i] = t;
    trendUpPrev = trendUp;
    trendDownPrev = trendDown;
    trendPrev = t;
    exPrev = ex[i];
  }

  const f1 = ex.map((e, i) => e + ((trail[i] - e) * 61.8) / 100);
  const f2 = ex.map((e, i) => e + ((trail[i] - e) * 78.6) / 100);
  const f3 = ex.map((e, i) => e + ((trail[i] - e) * 88.6) / 100);
  const l100 = trail.map((v) => v + 0);

  const time = (i: number) => bars[i].time;
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const plots = {
    plot0: trail.map((v, i) => ({ time: time(i), value: fin(v), color: trend[i] === 1 ? GREEN : RED })),
    plot1: ex.map((v, i) => ({ time: time(i), value: fin(v), color: trend[i] === 1 ? LIME : FUCHSIA })),
    plot2: f1.map((v, i) => ({ time: time(i), value: fin(v) })),
    plot3: f2.map((v, i) => ({ time: time(i), value: fin(v) })),
    plot4: f3.map((v, i) => ({ time: time(i), value: fin(v) })),
    plot5: l100.map((v, i) => ({ time: time(i), value: fin(v) })),
  };

  // state = Trend == 1 ? "long" : "short"
  const long = trend.map((t) => t === 1);
  const fills = [
    { plot1: 'plot2', plot2: 'plot3', colors: long.map((s) => (s ? GREEN : RED)) },
    { plot1: 'plot3', plot2: 'plot4', colors: long.map((s) => (s ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 82, 82, 0.3)')) },
    { plot1: 'plot4', plot2: 'plot5', colors: long.map((s) => (s ? 'rgba(76, 175, 80, 0.4)' : 'rgba(255, 82, 82, 0.4)')) },
  ];

  // l1 = state[1] == "long" and crossunder(norm_c, f1[1]) ...: both sides run on every bar (Pine v4)
  const close = S(c);
  const prevOf = (a: number[]) => S(a.map((_v, i) => at(a, i - 1)));
  const under = [f1, f2, f3].map((f) => ta.crossunder(close, prevOf(f)).toArray());
  const over = [f1, f2, f3].map((f) => ta.crossover(close, prevOf(f)).toArray());
  // atr = sma(trueRange, 14)
  const atr = A(ta.sma(S(trueRange), 14));
  const k = [1, 1.5, 2];
  const markers: MarkerData[] = [];
  for (let i = 1; i < n; i++) {
    if (!cfg.showFibEntries) break;
    // plotshape(cond ? low - k * atr : na, location.belowbar): an na or 0 value draws no shape
    for (let j = 0; j < 3; j++) {
      const v = l[i] - k[j] * atr[i];
      if (long[i - 1] && under[j][i] && !isNaN(v) && v !== 0) {
        markers.push({ time: time(i), position: 'belowBar', shape: 'triangleUp', color: YELLOW, size: 'tiny' });
      }
    }
    for (let j = 0; j < 3; j++) {
      const v = h[i] + k[j] * atr[i];
      if (!long[i - 1] && over[j][i] && !isNaN(v) && v !== 0) {
        markers.push({ time: time(i), position: 'aboveBar', shape: 'triangleDown', color: PURPLE, size: 'tiny' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
  };
}

export const SwingarmAtrTrendIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
