/**
 * STD-Filtered, N-Pole Gaussian Filter
 *
 * An N-pole Gaussian filter of the source: filt = src * a^N + sum over r = 1..N of (-1)^(r+1) * C(N, r) *
 * (1 - a)^r * filt[r], with a from the period and the number of poles. A standard deviation filter can hold the
 * source and / or the output: a change smaller than `filter` standard deviations of the last `filterperiod` values
 * keeps the previous value. The line is green while it rises and red while it falls (bar colours too); "L" / "S"
 * triangles mark the turns from down to up and from up to down.
 * Alerts (alertcondition, `alerts` of the result): 'Long' and 'Short', true on the bars of the L / S turns.
 *
 * Sources: the chart bars, the Heikin Ashi bars of the chart (built from the chart bars) and the "Heiken-Ashi
 * Better" bars of the library loxxexpandedsourcetypes by loxx (its functions are ported in this file: AMA, T3 or
 * Kaufman smoothing of the better Heikin Ashi close).
 *
 * Reference: "STD-Filtered, N-Pole Gaussian Filter [Loxx]" by loxx
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © loxx
 */

import {
  ta, math, Series, heikinAshi,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type Smoothing = 'AMA' | 'T3' | 'Kaufman';
type FilterOption = 'Price' | 'Gaussian Filter' | 'Both' | 'None';

const SOURCES = [
  'Close', 'Open', 'High', 'Low', 'Median', 'Typical', 'Weighted', 'Average', 'Average Median Body', 'Trend Biased',
  'Trend Biased (Extreme)',
  'HA Close', 'HA Open', 'HA High', 'HA Low', 'HA Median', 'HA Typical', 'HA Weighted', 'HA Average',
  'HA Average Median Body', 'HA Trend Biased', 'HA Trend Biased (Extreme)',
  'HAB Close', 'HAB Open', 'HAB High', 'HAB Low', 'HAB Median', 'HAB Typical', 'HAB Weighted', 'HAB Average',
  'HAB Average Median Body', 'HAB Trend Biased', 'HAB Trend Biased (Extreme)',
] as const;
type SourceOption = typeof SOURCES[number];

export interface StdFilteredNPoleGaussianFilterInputs {
  /** Heiken-Ashi Better smoothing */
  smthtype: Smoothing;
  srcoption: SourceOption;
  period: number;
  order: number;
  filterop: FilterOption;
  /** Filter deviations */
  filter: number;
  filterperiod: number;
  colorbars: boolean;
  showSigs: boolean;
  /** Kaufman fast end */
  kfl: number;
  /** Kaufman slow end */
  ksl: number;
  /** AMA fast */
  amafl: number;
  /** AMA slow */
  amasl: number;
}

export const defaultInputs: StdFilteredNPoleGaussianFilterInputs = {
  smthtype: 'Kaufman',
  srcoption: 'Close',
  period: 25,
  order: 5,
  filterop: 'Gaussian Filter',
  filter: 1,
  filterperiod: 10,
  colorbars: true,
  showSigs: true,
  kfl: 0.666,
  ksl: 0.0645,
  amafl: 2,
  amasl: 30,
};

const G_SRC = 'Source Settings';
const G_BASIC = 'Basic Settings';
const G_FILTER = 'Filter Settings';
const G_UI = 'UI Options';
const G_MA = 'Moving Average Inputs';

export const inputConfig: InputConfig[] = [
  { id: 'smthtype', type: 'string', title: 'Heiken-Ashi Better Smoothing', defval: 'Kaufman', options: ['AMA', 'T3', 'Kaufman'], group: G_SRC },
  { id: 'srcoption', type: 'string', title: 'Source', defval: 'Close', options: [...SOURCES], group: G_SRC },
  { id: 'period', type: 'int', title: 'Period', defval: 25, group: G_BASIC },
  { id: 'order', type: 'int', title: 'Order', defval: 5, min: 1, group: G_BASIC },
  { id: 'filterop', type: 'string', title: 'Filter Options', defval: 'Gaussian Filter', options: ['Price', 'Gaussian Filter', 'Both', 'None'], group: G_FILTER },
  { id: 'filter', type: 'float', title: 'Filter Devaitions', defval: 1, min: 0, group: G_FILTER },
  { id: 'filterperiod', type: 'int', title: 'Filter Period', defval: 10, min: 0, group: G_FILTER },
  { id: 'colorbars', type: 'bool', title: 'Color bars?', defval: true, group: G_UI },
  { id: 'showSigs', type: 'bool', title: 'Show signals?', defval: true, group: G_UI },
  { id: 'kfl', type: 'float', title: "* Kaufman's Adaptive MA (KAMA) Only - Fast End", defval: 0.666, group: G_MA },
  { id: 'ksl', type: 'float', title: "* Kaufman's Adaptive MA (KAMA) Only - Slow End", defval: 0.0645, group: G_MA },
  { id: 'amafl', type: 'int', title: '* Adaptive Moving Average (AMA) Only - Fast', defval: 2, group: G_MA },
  { id: 'amasl', type: 'int', title: '* Adaptive Moving Average (AMA) Only - Slow', defval: 30, group: G_MA },
];

const GREEN = '#2DD204';
const RED = '#D2042D';
const YELLOW = '#FFEB3B';
const FUCHSIA = '#E040FB';
const TRANSPARENT_BLACK = '#00000000';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'N-Pole GF', color: '#2962FF', lineWidth: 3 },
];

export const metadata = {
  title: 'STD-Filtered, N-Pole Gaussian Filter [Loxx]',
  shortTitle: 'STDFNPGF [Loxx]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** nz(): na and +-infinity give the replacement */
const nz = (v: number, r = 0) => (Number.isFinite(v) ? v : r);

/** fact(n): a *= i for i = 1 to n (for n = 0 the loop counts down 1, 0, so fact(0) = 0 as in the original) */
function fact(n: number): number {
  let a = 1;
  if (n >= 1) for (let i = 1; i <= n; i++) a *= i;
  else for (let i = 1; i >= n; i--) a *= i;
  return a;
}

/** _alpha(period, poles) */
function alphaOf(period: number, poles: number): number {
  const w = (2.0 * Math.PI) / period;
  const b = (1.0 - Math.cos(w)) / (Math.pow(1.414, 2.0 / poles) - 1.0);
  return -b + Math.sqrt(b * b + 2.0 * b);
}

/** _npolegf(src, period, order) on every bar */
function nPoleGaussian(src: number[], period: number, order: number): number[] {
  const a = alphaOf(period, order);
  // _makeCoeffs: column 0 binomial (nz(..., 1)), column 1 a^r, column 2 (1 - a)^r
  const c0: number[] = [];
  const c1: number[] = [];
  const c2: number[] = [];
  for (let r = 0; r <= order; r++) {
    c0.push(nz(fact(order) / (fact(order - r) * fact(r)), 1));
    c1.push(Math.pow(a, r));
    c2.push(Math.pow(1.0 - a, r));
  }
  const filt: number[] = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let f = src[i] * c1[order];
    let sign = 1;
    for (let r = 1; r <= order; r++) {
      f += sign * c0[r] * c2[r] * nz(i - r >= 0 ? filt[i - r] : NaN);
      sign *= -1;
    }
    filt[i] = f;
  }
  return filt;
}

/** _filt(src, len, filter): a change smaller than filter * stdev(src, len) keeps the previous value */
function stdFilter(bars: Bar[], src: number[], len: number, filter: number): number[] {
  const sd = ta.stdev(Series.fromArray(bars, src), len).toArray().map((v) => v ?? NaN);
  const out: number[] = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const prev = nz(i > 0 ? out[i - 1] : NaN);
    const filtdev = filter * sd[i];
    out[i] = lt(Math.abs(src[i] - prev), filtdev) ? prev : src[i];
  }
  return out;
}

/** _trendreg(o, h, l, c) */
const trendReg = (o: number, h: number, l: number, c: number) => (gt(c, o) ? (h + c) / 2.0 : (l + c) / 2.0);
/** _trendext(o, h, l, c) */
const trendExt = (o: number, h: number, l: number, c: number) => (gt(c, o) ? h : lt(c, o) ? l : c);

/** habclose(smthtype, amafl, amasl, kfl, ksl) of the library, called on every bar */
function habClose(sub: Bar[], cfg: StdFilteredNPoleGaussianFilterInputs): number[] {
  const m = sub.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(sub, a);
  // _habingest(): (open + close) / 2 + ((close - open) / (high - low)) * |(close - open) / 2|, na -> close
  const ingest = sub.map((b) => {
    const v = (b.open + b.close) / 2 + ((b.close - b.open) / (b.high - b.low)) * Math.abs((b.close - b.open) / 2);
    return Number.isFinite(v) ? v : b.close;
  });

  let res: number[];
  if (cfg.smthtype === 'AMA') {
    // _ama(src, 2, fl, sl): ta.highest(3) / ta.lowest(3) of high / low
    const len = 2;
    const flout = 2 / (cfg.amafl + 1);
    const slout = 2 / (cfg.amasl + 1);
    const hhArr = A(ta.highest(S(sub.map((b) => b.high)), len + 1));
    const llArr = A(ta.lowest(S(sub.map((b) => b.low)), len + 1));
    res = new Array(m);
    let prev = NaN;
    for (let j = 0; j < m; j++) {
      const hh = hhArr[j];
      const ll = llArr[j];
      const range = hh - ll;
      const mltp = !Number.isNaN(range) && range !== 0 ? Math.abs(2 * ingest[j] - ll - hh) / range : 0;
      const ssc = mltp * (flout - slout) + slout;
      const ama = nz(prev) + Math.pow(ssc, 2) * (ingest[j] - nz(prev));
      res[j] = ama;
      prev = ama;
    }
  } else if (cfg.smthtype === 'T3') {
    // _t3(src, 3)
    const len = 3;
    const e1 = ta.ema(S(ingest), len);
    const e2 = ta.ema(e1, len);
    const e3 = ta.ema(e2, len);
    const e4 = ta.ema(e3, len);
    const e5 = ta.ema(e4, len);
    const x3 = A(e3);
    const x4 = A(e4);
    const x5 = A(e5);
    const x6 = A(ta.ema(e5, len));
    const b1 = 0.7;
    const k1 = -b1 * b1 * b1;
    const k2 = 3 * b1 * b1 + 3 * b1 * b1 * b1;
    const k3 = -6 * b1 * b1 - 3 * b1 - 3 * b1 * b1 * b1;
    const k4 = 1 + 3 * b1 + b1 * b1 * b1 + 3 * b1 * b1;
    res = x6.map((v, j) => k1 * v + k2 * x5[j] + k3 * x4[j] + k4 * x3[j]);
  } else {
    // _kama(src, 2, kfl, ksl)
    const len = 2;
    const noise = ingest.map((v, j) => (j > 0 ? Math.abs(v - ingest[j - 1]) : NaN));
    const nnoiseArr = A(math.sum(S(noise), len));
    res = new Array(m);
    let prev = NaN;
    for (let j = 0; j < m; j++) {
      const signal = Math.abs(ingest[j] - (j - len >= 0 ? ingest[j - len] : NaN));
      const nnoise = nnoiseArr[j];
      // nnoise != 0 is false when nnoise is na
      const ratio = !Number.isNaN(nnoise) && nnoise !== 0 ? signal / nnoise : 0;
      const smooth = Math.pow(ratio * (cfg.kfl - cfg.ksl) + cfg.ksl, 2);
      const v = nz(prev) + smooth * (ingest[j] - nz(prev));
      res[j] = v;
      prev = v;
    }
  }
  return res;
}

/** The source of the "Source" input */
function sourceOf(bars: Bar[], cfg: StdFilteredNPoleGaussianFilterInputs): number[] {
  const opt = cfg.srcoption;
  if (opt.startsWith('HAB ')) {
    // habopen := na(habopen[1]) ? (nz(habopen) + nz(habclose()[1])) / 2 : (nz(habopen[1]) + nz(habclose()[1])) / 2:
    // the habclose call with a history reference runs on every bar (measured: the branch does not limit it), so
    // habopen = 0 on bar 0, then (habopen[1] + nz(habclose[1])) / 2
    const hc = habClose(bars, cfg);
    const ho: number[] = new Array(bars.length);
    for (let i = 0; i < bars.length; i++) {
      ho[i] = i === 0 ? 0 : (nz(ho[i - 1]) + nz(hc[i - 1])) / 2;
    }
    const hh = bars.map((b, i) => (Number.isNaN(ho[i]) || Number.isNaN(hc[i]) ? NaN : Math.max(b.high, ho[i], hc[i])));
    const hl = bars.map((b, i) => (Number.isNaN(ho[i]) || Number.isNaN(hc[i]) ? NaN : Math.min(b.low, ho[i], hc[i])));
    return bars.map((_b, i) => {
      const o = ho[i];
      const c = hc[i];
      const h = hh[i];
      const l = hl[i];
      switch (opt) {
        case 'HAB Close': return c;
        case 'HAB Open': return o;
        case 'HAB High': return h;
        case 'HAB Low': return l;
        case 'HAB Median': return (h + l) / 2;
        case 'HAB Typical': return (h + l + c) / 3;
        case 'HAB Weighted': return (h + l + c + c) / 4;
        case 'HAB Average': return (o + h + l + c) / 4;
        case 'HAB Average Median Body': return (o + c) / 2;
        case 'HAB Trend Biased': return trendReg(o, h, l, c);
        default: return trendExt(o, h, l, c);
      }
    });
  }
  // HA options: request.security(ticker.heikinashi(syminfo.tickerid), timeframe.period, ...) on the chart timeframe;
  // any other value (the switch default) is the Heikin Ashi close
  const ha = opt.startsWith('HA ') || !SOURCES.includes(opt);
  const src = ha ? heikinAshi(bars) : bars;
  return src.map((b) => {
    const { open: o, high: h, low: l, close: c } = b;
    switch (ha ? opt.slice(3) : opt) {
      case 'Open': return o;
      case 'High': return h;
      case 'Low': return l;
      case 'Median': return (h + l) / 2;
      case 'Typical': return (h + l + c) / 3;
      case 'Weighted': return (h + l + c + c) / 4;
      case 'Average': return (o + h + l + c) / 4;
      case 'Average Median Body': return (o + c) / 2;
      case 'Trend Biased': return trendReg(o, h, l, c);
      case 'Trend Biased (Extreme)': return trendExt(o, h, l, c);
      default: return c;
    }
  });
}

export function calculate(
  bars: Bar[],
  inputs: Partial<StdFilteredNPoleGaussianFilterInputs> = {},
): IndicatorResult & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  let src = sourceOf(bars, cfg);
  // filterop == "Both" or filterop == "Price" and filter > 0
  if (cfg.filterop === 'Both' || (cfg.filterop === 'Price' && gt(cfg.filter, 0))) {
    src = stdFilter(bars, src, cfg.filterperiod, cfg.filter);
  }
  let out = nPoleGaussian(src, cfg.period, cfg.order);
  if (cfg.filterop === 'Both' || (cfg.filterop === 'Gaussian Filter' && gt(cfg.filter, 0))) {
    out = stdFilter(bars, out, cfg.filterperiod, cfg.filter);
  }

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const longFlags: boolean[] = [];
  const shortFlags: boolean[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  let contsw = 0;
  // var color colorout = na; colorout := ... : nz(colorout[1]): nz() of an na colour is a fully transparent black
  // (measured), so the line and the bars are invisible until the first rise or fall
  let colorout = 'transparent';
  for (let i = 0; i < n; i++) {
    const o = out[i];
    const sig = nz(i > 0 ? out[i - 1] : NaN);
    const o1 = nz(i > 0 ? out[i - 1] : NaN);
    const sig1 = nz(i > 1 ? out[i - 2] : NaN);
    let state = 0;
    if (gt(o, sig)) state = 1;
    if (lt(o, sig)) state = -1;
    const pregoLong = gt(o, sig) && (lt(o1, sig1) || eq(o1, sig1));
    const pregoShort = lt(o, sig) && (gt(o1, sig1) || eq(o1, sig1));
    const prevContsw = contsw;
    contsw = pregoLong ? 1 : pregoShort ? -1 : prevContsw;
    const goLong = pregoLong && prevContsw === -1;
    const goShort = pregoShort && prevContsw === 1;
    longFlags.push(goLong);
    shortFlags.push(goShort);
    colorout = state === -1 ? RED : state === 1 ? GREEN : colorout === 'transparent' ? TRANSPARENT_BLACK : colorout;

    const time = bars[i].time;
    plot0.push({ time, value: Number.isFinite(o) ? o : NaN, color: colorout });
    if (cfg.colorbars) barColors.push({ time, color: colorout });
    if (cfg.showSigs && goLong) {
      markers.push({ time, position: 'belowBar', shape: 'triangleUp', color: YELLOW, text: 'L', textColor: YELLOW, size: 'tiny' });
    }
    if (cfg.showSigs && goShort) {
      markers.push({ time, position: 'aboveBar', shape: 'triangleDown', color: FUCHSIA, text: 'S', textColor: FUCHSIA, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    barColors,
    // alertcondition(goLong, "Long") / alertcondition(goShort, "Short")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long', message: 'STD-Filtered, N-Pole Gaussian Filter [Loxx]: Long\nSymbol: {{ticker}}\nPrice: {{close}}' },
  { id: 'alert1', title: 'Short', message: 'STD-Filtered, N-Pole Gaussian Filter [Loxx]: Short\nSymbol: {{ticker}}\nPrice: {{close}}' },
];

export const StdFilteredNPoleGaussianFilter = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
