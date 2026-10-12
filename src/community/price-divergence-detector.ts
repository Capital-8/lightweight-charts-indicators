/**
 * Price Divergence Detector V3.2
 *
 * An oscillator is computed twice, on the high and on the low (RSI, MACD histogram, Stochastic, volume SMA,
 * Accumulation/Distribution SMA, Fisher Transform, CCI, Bollinger %B with a 0.1 deviation, Ehlers "Ideal RSI" with a
 * Homodyne Discriminator length, Elders Force Index or Trend Accumulation Volume). A 5-bar fractal of the
 * oscillator (bar 2 above / below the two bars on each side) marks a top or a bottom, known 2 bars later. Each top
 * is compared with the top before: a higher price high with a lower oscillator is a regular bearish divergence, a
 * lower price high with a higher oscillator a hidden one (bottoms likewise). The fractal bars and the divergence
 * labels are drawn 2 bars back (plot offset -2): fractal lines and circles at the high / low, maroon (bearish) or
 * green (bullish) on a divergence, silver on the other fractals when "Show Channel" is on.
 *
 * Pine version 3: the colour constants of that version (maroon #800000, green #008000, silver #C0C0C0) and the
 * default plot / shape transparency of that version (35).
 *
 * Reference: "Price Divergence Detector V3.2 revised by JustUncleL" by JustUncleL (original author RicardoSantos)
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, math, Series, getSourceSeries, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';

export type DivergenceMethod = 'RSI' | 'MACD' | 'Stochastic' | 'Volume' | 'Accumulation/Distribution'
  | 'Fisher Transform' | 'CCI' | 'BB %B' | 'Ideal RSI' | 'Elders Force Index' | 'Trend Acc Volume';

export interface PriceDivergenceDetectorInputs {
  method: DivergenceMethod;
  showLabels: boolean;
  showChannel: boolean;
  showHidden: boolean;
  showRegular: boolean;
  /** Trend Acc Volume: direction from an EMA of the price instead of the candle colour */
  useTrendEma: boolean;
  /** Length of every method except MACD */
  length: number;
  macdSource: SourceType;
  macdFast: number;
  macdSlow: number;
  macdSmooth: number;
}

export const defaultInputs: PriceDivergenceDetectorInputs = {
  method: 'BB %B',
  showLabels: true,
  showChannel: false,
  showHidden: true,
  showRegular: true,
  useTrendEma: false,
  length: 20,
  macdSource: 'close',
  macdFast: 12,
  macdSlow: 26,
  macdSmooth: 9,
};

const METHODS: DivergenceMethod[] = ['RSI', 'MACD', 'Stochastic', 'Volume', 'Accumulation/Distribution',
  'Fisher Transform', 'CCI', 'BB %B', 'Ideal RSI', 'Elders Force Index', 'Trend Acc Volume'];

export const inputConfig: InputConfig[] = [
  { id: 'method', type: 'string', title: 'method', defval: 'BB %B', options: METHODS },
  { id: 'showLabels', type: 'bool', title: 'Show Labels', defval: true },
  { id: 'showChannel', type: 'bool', title: 'Show Channel', defval: false },
  { id: 'showHidden', type: 'bool', title: 'Show Hidden Divergence', defval: true },
  { id: 'showRegular', type: 'bool', title: 'Show Regular Divergence', defval: true },
  { id: 'useTrendEma', type: 'bool', title: 'Use EMA Trend direction for Trend Acc Volume', defval: false },
  { id: 'length', type: 'int', title: 'Length for Method (except MACD):', defval: 20 },
  { id: 'macdSource', type: 'source', title: 'MACD Source:', defval: 'close' },
  { id: 'macdFast', type: 'int', title: 'MACD Fast:', defval: 12 },
  { id: 'macdSlow', type: 'int', title: 'MACD Slow:', defval: 26 },
  { id: 'macdSmooth', type: 'int', title: 'MACD Smooth Signal:', defval: 9 },
];

// Pine version 3 colours; plots and shapes without transp have the transparency 35 of that version
const MAROON = String(color.new('#800000', 35));
const GREEN = String(color.new('#008000', 35));
const SILVER = String(color.new('#C0C0C0', 35));
const WHITE = '#FFFFFF';
const NA = 'transparent';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'H F', color: MAROON, lineWidth: 1 },
  { id: 'plot1', title: 'L F', color: GREEN, lineWidth: 1 },
  { id: 'plot2', title: 'H D', color: MAROON, lineWidth: 3, style: 'circles' },
  { id: 'plot3', title: 'L D', color: GREEN, lineWidth: 3, style: 'circles' },
];

export const metadata = {
  title: 'Price Divergence Detector V3.2 revised by JustUncleL',
  shortTitle: 'PDDR',
  overlay: true,
};

/** Pine comparisons: a > b only when a - b > 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** nz(): na and +-infinity give 0 */
const nz = (x: number) => (Number.isFinite(x) ? x : 0);
/** A number used as a condition (version 3): na and 0 are false */
const truthy = (x: number) => !isNaN(x) && x !== 0;
const arr = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));

/** Rolling moving average with a length per bar: irma := (nz(irma[1]) * (l - 1) + p) / l */
function irma(p: number[], l: number[]): number[] {
  const out = new Array<number>(p.length);
  let prev = NaN;
  for (let i = 0; i < p.length; i++) {
    out[i] = (nz(prev) * (l[i] - 1) + p[i]) / l[i];
    prev = out[i];
  }
  return out;
}

/** irsi(p, l): RSI of rolling averages with a length per bar */
function irsi(p: number[], l: number[]): number[] {
  const n = p.length;
  const ups = new Array<number>(n);
  const downs = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const ch = i > 0 ? p[i] - p[i - 1] : NaN;
    ups[i] = Math.max(ch, 0);
    downs[i] = -Math.min(ch, 0);
  }
  const up = irma(ups, l);
  const down = irma(downs, l);
  return up.map((u, i) => {
    const d = down[i];
    if (!isNaN(d) && !ne(d, 0)) return 100;
    if (!isNaN(u) && !ne(u, 0)) return 0;
    return 100 - 100 / (1 + u / d);
  });
}

/** RSI length of idealRSI(): Homodyne Discriminator period of hl2 (the same for the high and the low call) */
function idealRsiLength(bars: Bar[]): number[] {
  const n = bars.length;
  const C1 = 0.0962;
  const C2 = 0.5769;
  const Df = 0.5;
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const smooth = new Array<number>(n).fill(NaN);
  const det = new Array<number>(n).fill(NaN);
  const q1 = new Array<number>(n).fill(NaN);
  const i1 = new Array<number>(n).fill(NaN);
  const at = (a: number[], i: number, k: number) => (i - k >= 0 ? a[i - k] : NaN);
  const len = new Array<number>(n);
  let period = NaN;
  let i2 = NaN;
  let q2 = NaN;
  let re = NaN;
  let im = NaN;
  let smoothPeriod = NaN;
  for (let i = 0; i < n; i++) {
    const c3 = nz(period) * 0.075 + 0.54;
    smooth[i] = (hl2[i] * 4.0 + at(hl2, i, 1) * 3.0 + at(hl2, i, 2) * 2.0 + at(hl2, i, 3)) / 10.0;
    det[i] = (smooth[i] * C1 + nz(at(smooth, i, 2)) * C2 - nz(at(smooth, i, 4)) * C2 - nz(at(smooth, i, 6)) * C1) * c3;
    q1[i] = (det[i] * C1 + nz(at(det, i, 2)) * C2 - nz(at(det, i, 4)) * C2 - nz(at(det, i, 6)) * C1) * c3;
    i1[i] = nz(at(det, i, 3));
    const jI = (i1[i] * C1 + nz(at(i1, i, 2)) * C2 - nz(at(i1, i, 4)) * C2 - nz(at(i1, i, 6)) * C1) * c3;
    const jQ = (q1[i] * C1 + nz(at(q1, i, 2)) * C2 - nz(at(q1, i, 4)) * C2 - nz(at(q1, i, 6)) * C1) * c3;
    const i2n = 0.2 * (i1[i] - jQ) + 0.8 * nz(i2);
    const q2n = 0.2 * (q1[i] + jI) + 0.8 * nz(q2);
    const reN = 0.2 * (i2n * nz(i2) + q2n * nz(q2)) + 0.8 * nz(re);
    const imN = 0.2 * (i2n * nz(q2) - q2n * nz(i2)) + 0.8 * nz(im);
    i2 = i2n;
    q2 = q2n;
    re = reN;
    im = imN;
    // iff(Re != 0 and Im != 0, 6.28318 / atan(Im / Re), 0): na != 0 is false
    const dpRaw = !isNaN(re) && ne(re, 0) && !isNaN(im) && ne(im, 0) ? 6.28318 / Math.atan(im / re) : 0;
    const ii = nz(period);
    const dp = Math.max(Math.max(Math.min(Math.min(dpRaw, 1.5 * ii), 50), 0.6667 * ii), 6);
    period = dp * 0.2 + nz(period) * 0.8;
    smoothPeriod = 0.33 * period + nz(smoothPeriod) * 0.67;
    len[i] = math.round(smoothPeriod * Df - 1);
  }
  return len;
}

function oscillators(bars: Bar[], cfg: PriceDivergenceDetectorInputs): { oscHigh: number[]; oscLow: number[] } {
  const n = bars.length;
  const len = cfg.length;
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);
  const close = new Series(bars, (b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);
  switch (cfg.method) {
    case 'RSI':
      return { oscHigh: arr(ta.rsi(high, len)), oscLow: arr(ta.rsi(low, len)) };
    case 'MACD': {
      // f_macd(): SMA fast - SMA slow, EMA signal, histogram
      const src = getSourceSeries(bars, cfg.macdSource);
      const macd = ta.sma(src, cfg.macdFast).sub(ta.sma(src, cfg.macdSlow));
      const hist = arr(macd.sub(ta.ema(macd, cfg.macdSmooth)));
      return { oscHigh: hist, oscLow: hist };
    }
    case 'Stochastic': {
      const k = arr(ta.stoch(close, high, low, len));
      return { oscHigh: k, oscLow: k };
    }
    case 'Volume': {
      const v = arr(ta.sma(new Series(bars, (b) => b.volume ?? NaN), len));
      return { oscHigh: v, oscLow: v };
    }
    case 'Accumulation/Distribution': {
      // sma(cum(close == high and close == low or high == low ? 0 : (2 * close - low - high) / (high - low) * volume))
      const ad = bars.map((b, i) => ((!ne(b.close, b.high) && !ne(b.close, b.low)) || !ne(b.high, b.low)
        ? 0 : ((2 * b.close - b.low - b.high) / (b.high - b.low)) * volume[i]));
      const v = arr(ta.sma(ta.cum(Series.fromArray(bars, ad)), len));
      return { oscHigh: v, oscLow: v };
    }
    case 'Fisher Transform': {
      const fisher = (s: Series) => {
        const src = arr(s);
        const h = arr(ta.highest(s, len));
        const l = arr(ta.lowest(s, len));
        const out = new Array<number>(n);
        let v0 = NaN;
        let f = NaN;
        for (let i = 0; i < n; i++) {
          v0 = 0.66 * ((src[i] - l[i]) / Math.max(h[i] - l[i], 0.001) - 0.5) + 0.67 * nz(v0);
          const v1 = gt(v0, 0.99) ? 0.999 : lt(v0, -0.99) ? -0.999 : v0;
          f = 0.5 * Math.log((1 + v1) / Math.max(1 - v1, 0.001)) + 0.5 * nz(f);
          out[i] = f;
        }
        return out;
      };
      return { oscHigh: fisher(high), oscLow: fisher(low) };
    }
    case 'CCI':
      return { oscHigh: arr(ta.cci(high, len)), oscLow: arr(ta.cci(low, len)) };
    case 'BB %B': {
      // pcBB(): (p - lower) / (upper - lower) with basis sma(p, l) and deviation 0.1 * stdev(p, l)
      const pcBB = (s: Series) => {
        const p = arr(s);
        const basis = arr(ta.sma(s, len));
        const sd = arr(ta.stdev(s, len));
        return p.map((x, i) => {
          const dev = 0.1 * sd[i];
          const upper = basis[i] + dev;
          const lower = basis[i] - dev;
          return (x - lower) / (upper - lower);
        });
      };
      return { oscHigh: pcBB(high), oscLow: pcBB(low) };
    }
    case 'Ideal RSI': {
      const l = idealRsiLength(bars);
      return { oscHigh: irsi(arr(high), l), oscLow: irsi(arr(low), l) };
    }
    case 'Elders Force Index': {
      const force = (p: number[]) => p.map((x, i) => (i > 0 ? (x - p[i - 1]) * volume[i] : NaN));
      return { oscHigh: force(arr(high)), oscLow: force(arr(low)) };
    }
    case 'Trend Acc Volume': {
      // TVA(p, l): volume accumulated while the direction (candle colour, or a rising / falling EMA) stays the same
      const tva = (s: Series) => {
        const ma = ta.ema(s, len);
        const rising = cfg.useTrendEma ? arr(ta.rising(ma, 3)) : [];
        const falling = cfg.useTrendEma ? arr(ta.falling(ma, 3)) : [];
        const out = new Array<number>(n);
        let direction = NaN;
        let acc = NaN;
        for (let i = 0; i < n; i++) {
          const b = bars[i];
          direction = cfg.useTrendEma
            ? (truthy(rising[i]) ? 1 : truthy(falling[i]) ? -1 : nz(direction))
            : (lt(b.open, b.close) ? 1 : gt(b.open, b.close) ? -1 : nz(direction));
          const prev = nz(acc);
          acc = gt(direction, 0) ? (!lt(prev, 0) ? prev + volume[i] : volume[i])
            : lt(direction, 0) ? (!gt(prev, 0) ? prev - volume[i] : -volume[i]) : prev;
          out[i] = acc;
        }
        return out;
      };
      return { oscHigh: tva(high), oscLow: tva(low) };
    }
    default:
      return { oscHigh: new Array<number>(n).fill(NaN), oscLow: new Array<number>(n).fill(NaN) };
  }
}

/** f_top_fractal(_src): _src[4] < _src[2] and _src[3] < _src[2] and _src[2] > _src[1] and _src[2] > _src[0] */
const topFractal = (s: (k: number) => number) =>
  lt(s(4), s(2)) && lt(s(3), s(2)) && gt(s(2), s(1)) && gt(s(2), s(0));
const botFractal = (s: (k: number) => number) =>
  gt(s(4), s(2)) && gt(s(3), s(2)) && lt(s(2), s(1)) && lt(s(2), s(0));

export function calculate(
  bars: Bar[],
  inputs: Partial<PriceDivergenceDetectorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { oscHigh, oscLow } = oscillators(bars, cfg);
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  // f_fractalize(_src) = f_top_fractal(_src) ? 1 : f_bot_fractal(_src) ? -1 : 0, on the series of the caller
  // (measured: f_bot_fractal reads the full history of _src, also on the bars where it does not run)
  const fractalTop: number[] = new Array(n);
  const fractalBot: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    fractalTop[i] = topFractal((k) => at(oscHigh, i - k)) ? at(oscHigh, i - 2) : NaN;
    fractalBot[i] = !topFractal((k) => at(oscLow, i - k)) && botFractal((k) => at(oscLow, i - k))
      ? at(oscLow, i - 2) : NaN;
  }

  // valuewhen(fractal, x[2], 0)[2]
  const whenTopOsc = new Array<number>(n);
  const whenTopPrice = new Array<number>(n);
  const whenBotOsc = new Array<number>(n);
  const whenBotPrice = new Array<number>(n);
  let tOsc = NaN, tPrice = NaN, bOsc = NaN, bPrice = NaN;
  for (let i = 0; i < n; i++) {
    if (truthy(fractalTop[i])) {
      tOsc = at(oscHigh, i - 2);
      tPrice = i >= 2 ? bars[i - 2].high : NaN;
    }
    if (truthy(fractalBot[i])) {
      bOsc = at(oscLow, i - 2);
      bPrice = i >= 2 ? bars[i - 2].low : NaN;
    }
    whenTopOsc[i] = tOsc;
    whenTopPrice[i] = tPrice;
    whenBotOsc[i] = bOsc;
    whenBotPrice[i] = bPrice;
  }

  const hf: Array<{ time: number; value: number; color: string }> = [];
  const lf: Array<{ time: number; value: number; color: string }> = [];
  const hd: Array<{ time: number; value: number; color: string }> = [];
  const ld: Array<{ time: number; value: number; color: string }> = [];
  const markers: MarkerData[] = [];
  const other = cfg.showChannel ? SILVER : NA;

  for (let i = 2; i < n; i++) {
    const top = truthy(fractalTop[i]);
    const bot = truthy(fractalBot[i]);
    const h2 = bars[i - 2].high;
    const l2 = bars[i - 2].low;
    const highPrev = at(whenTopOsc, i - 2);
    const highPrice = at(whenTopPrice, i - 2);
    const lowPrev = at(whenBotOsc, i - 2);
    const lowPrice = at(whenBotPrice, i - 2);
    const regularBear = top && gt(h2, highPrice) && lt(oscHigh[i - 2], highPrev);
    const hiddenBear = top && lt(h2, highPrice) && gt(oscHigh[i - 2], highPrev);
    const regularBull = bot && lt(l2, lowPrice) && gt(oscLow[i - 2], lowPrev);
    const hiddenBull = bot && gt(l2, lowPrice) && lt(oscLow[i - 2], lowPrev);

    // offset = -2: the values of bar i are drawn on bar i - 2
    const time = bars[i - 2].time;
    const hColor = (regularBear && cfg.showRegular) || (hiddenBear && cfg.showHidden) ? MAROON : other;
    const lColor = (regularBull && cfg.showRegular) || (hiddenBull && cfg.showHidden) ? GREEN : other;
    const hv = top ? h2 : NaN;
    const lv = bot ? l2 : NaN;
    hf.push({ time, value: hv, color: hColor });
    lf.push({ time, value: lv, color: lColor });
    hd.push({ time, value: hv, color: hColor });
    ld.push({ time, value: lv, color: lColor });

    if (cfg.showLabels) {
      const shape = (on: boolean, text: string, bear: boolean) => {
        if (!on) return;
        markers.push(bear
          ? { time, position: 'atPriceTop', price: h2, shape: 'labelDown', color: MAROON, text, textColor: WHITE }
          : { time, position: 'atPriceBottom', price: l2, shape: 'labelUp', color: GREEN, text, textColor: WHITE });
      };
      // plotshape order: +RBD, +HBD, -RBD, -HBD
      shape(cfg.showRegular && regularBear, 'R', true);
      shape(cfg.showHidden && hiddenBear, 'H', true);
      shape(cfg.showRegular && regularBull, 'R', false);
      shape(cfg.showHidden && hiddenBull, 'H', false);
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: hf, plot1: lf, plot2: hd, plot3: ld },
    markers,
  };
}

export const PriceDivergenceDetector = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
