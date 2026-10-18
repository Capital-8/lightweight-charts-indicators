/**
 * Community ports, drawing pass 0: the shapes hidden by default in the originals are emitted with their ids (HaP
 * MACD crosses, the "Div" labels of MFI Nexus Pro / RSI BB StdDev Signal / Williams BBDiv Signal, the overall trend
 * marks of Reversal Signals), the Ichimoku Oscillator bounce triangles and the Ultimate Buy and Sell price / ATR
 * watch signals and bought / sold background (off by default) are drawn when switched on, and QQE MOD draws its plots
 * only. Each drawn part is recomputed here from the original's formulas on seeded random-walk bars.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as hap from '../../src/community/hap-macd';
import * as mfiNexus from '../../src/community/mfi-nexus-pro';
import * as reversal from '../../src/community/reversal-signals';
import * as rsiBb from '../../src/community/rsi-bb-stddev-signal';
import * as williams from '../../src/community/williams-bbdiv-signal';
import * as ichimoku from '../../src/community/ichimoku-oscillator';
import * as ubs from '../../src/community/ultimate-buy-sell';
import * as qqe from '../../src/community/qqe-mod';

/** Seeded random walk of daily bars with a random volume */
function walk(count: number, seed0: number): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4);
    const volume = 1e6 * (0.3 + rnd());
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}

const bars = walk(1500, 7);
const bars2 = walk(1300, 4242);
const closes = (b: Bar[]) => b.map((x) => x.close);
const highs = (b: Bar[]) => b.map((x) => x.high);
const lows = (b: Bar[]) => b.map((x) => x.low);

// --- Pine reference helpers (independent of the ports) ---
/** ta.ema: na until `len` valid values (seeded with their mean) */
function ema(src: number[], len: number): number[] {
  const out: number[] = [];
  const a = 2 / (len + 1);
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!Number.isFinite(v)) { out.push(isNaN(prev) ? NaN : prev); continue; }
    if (isNaN(prev)) {
      count++; sum += v;
      if (count === len) { prev = sum / len; out.push(prev); } else out.push(NaN);
    } else {
      prev = a * v + (1 - a) * prev;
      out.push(prev);
    }
  }
  return out;
}
/** ta.rma: na until `len` valid values (seeded with their mean) */
function rma(src: number[], len: number): number[] {
  const out: number[] = [];
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!Number.isFinite(v)) { out.push(NaN); continue; }
    if (isNaN(prev)) {
      count++; sum += v;
      if (count === len) { prev = sum / len; out.push(prev); } else out.push(NaN);
    } else {
      prev = (prev * (len - 1) + v) / len;
      out.push(prev);
    }
  }
  return out;
}
const windowOf = (src: number[], i: number, len: number) => (i < len - 1 ? null : src.slice(i - len + 1, i + 1));
const sma = (src: number[], len: number) => src.map((_, i) => {
  const w = windowOf(src, i, len);
  return w && w.every(Number.isFinite) ? w.reduce((s, v) => s + v, 0) / len : NaN;
});
const wma = (src: number[], len: number) => src.map((_, i) => {
  const w = windowOf(src, i, len);
  if (!w || !w.every(Number.isFinite)) return NaN;
  let num = 0, den = 0;
  w.forEach((v, k) => { num += v * (k + 1); den += k + 1; });
  return num / den;
});
/** ta.stdev (biased) */
const stdev = (src: number[], len: number) => src.map((_, i) => {
  const w = windowOf(src, i, len);
  if (!w || !w.every(Number.isFinite)) return NaN;
  const m = w.reduce((s, v) => s + v, 0) / len;
  return Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / len);
});
const highest = (src: number[], len: number) => src.map((_, i) => {
  const w = windowOf(src, i, len);
  return w ? Math.max(...w) : NaN;
});
const lowest = (src: number[], len: number) => src.map((_, i) => {
  const w = windowOf(src, i, len);
  return w ? Math.min(...w) : NaN;
});
/** ta.rsi / the RMA RSI of the originals: down == 0 ? 100 : up == 0 ? 0 : 100 - 100 / (1 + up / down) */
function rsiOf(src: number[], len: number): number[] {
  const ch = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const up = rma(ch.map((c) => (isNaN(c) ? NaN : Math.max(c, 0))), len);
  const dn = rma(ch.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0))), len);
  return up.map((u, i) => (isNaN(u) || isNaN(dn[i]) ? NaN : dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / dn[i])));
}
/** ta.atr: RMA of the true range (high - low on the first bar) */
function atrOf(b: Bar[], len: number): number[] {
  const tr = b.map((x, i) => (i === 0 ? x.high - x.low
    : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close))));
  return rma(tr, len);
}
const crossover = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
const crossunder = (a: number[], b: number[], i: number) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];

/**
 * Regular divergences of the trade_lexx scripts: pivots of `osc` (5 left, 1 right), oscLBR = osc[1],
 * `osc HL = oscLBR > valuewhen(plFound, oscLBR, 1) and _inRange(plFound[1])`, price LL = low[1] < valuewhen(plFound,
 * low[1], 1), bullCond = priceLL and oscHL and plFound (bearish mirror). `lazy`: the `and` of the script is lazy, so
 * the ta.barssince of _inRange only runs on the bars where its left side is true.
 */
function regularDivergences(b: Bar[], osc: number[], lazy: boolean) {
  const n = b.length;
  const L = 5, R = 1;
  // ta.pivotlow / ta.pivothigh(osc, 5, 1) found on bar i (bar index >= 6) for the pivot bar i - 1: the window is the
  // last 7 non-na values; the pivot may equal values on its left, it must be lower (higher) than those on its right
  const valid: number[] = [];
  const pivotAt: { low: boolean[]; high: boolean[] } = { low: [], high: [] };
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(osc[i])) valid.push(i);
    pivotAt.low[i] = false;
    pivotAt.high[i] = false;
    if (i < L + R || valid.length === 0 || valid[valid.length - 1] !== i) continue;
    const w = valid.slice(-(L + R + 1));
    const p = w.indexOf(i - R);
    if (p < 0) continue;
    const v = osc[i - R];
    const okLow = w.every((k, q) => (q < p ? v <= osc[k] : q > p ? v < osc[k] : true));
    const okHigh = w.every((k, q) => (q < p ? v >= osc[k] : q > p ? v > osc[k] : true));
    pivotAt.low[i] = okLow;
    pivotAt.high[i] = okHigh;
  }
  const pivot = (i: number, low: boolean) => (low ? pivotAt.low[i] : pivotAt.high[i]);
  const bull: boolean[] = new Array(n).fill(false);
  const bear: boolean[] = new Array(n).fill(false);
  const pl: boolean[] = [];
  const ph: boolean[] = [];
  const plOsc: number[] = [], plLow: number[] = [], phOsc: number[] = [], phHigh: number[] = [];
  let plSince = NaN, phSince = NaN;
  for (let i = 0; i < n; i++) {
    const o = i >= R ? osc[i - R] : NaN;
    const lowLBR = i >= R ? b[i - R].low : NaN;
    const highLBR = i >= R ? b[i - R].high : NaN;
    pl[i] = pivot(i, true);
    ph[i] = pivot(i, false);
    if (pl[i]) { plOsc.push(o); plLow.push(lowLBR); }
    if (ph[i]) { phOsc.push(o); phHigh.push(highLBR); }
    const vwPlOsc = plOsc.length >= 2 ? plOsc[plOsc.length - 2] : NaN;
    const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
    const vwPhOsc = phOsc.length >= 2 ? phOsc[phOsc.length - 2] : NaN;
    const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
    const stepSince = (since: number, prev: boolean) => (prev ? 0 : isNaN(since) ? NaN : since + 1);
    const inRange = (s: number) => 5 <= s && s <= 60;
    let oscHL: boolean;
    const leftHL = o > vwPlOsc;
    if (lazy) {
      if (leftHL) plSince = stepSince(plSince, i > 0 && pl[i - 1]);
      oscHL = leftHL && inRange(plSince);
    } else {
      plSince = stepSince(plSince, i > 0 && pl[i - 1]);
      oscHL = leftHL && inRange(plSince);
    }
    bull[i] = lowLBR < vwPlLow && oscHL && pl[i];
    let oscLH: boolean;
    const leftLH = o < vwPhOsc;
    if (lazy) {
      if (leftLH) phSince = stepSince(phSince, i > 0 && ph[i - 1]);
      oscLH = leftLH && inRange(phSince);
    } else {
      phSince = stepSince(phSince, i > 0 && ph[i - 1]);
      oscLH = leftLH && inRange(phSince);
    }
    bear[i] = highLBR > vwPhHigh && oscLH && ph[i];
  }
  return { bull, bear };
}

type Marker = { id?: string; time: number; price?: number; shape: string; color: string; text?: string; position: string; size?: unknown };
const withId = (markers: Marker[], id: string) => markers.filter((m) => m.id === id);
const timesOf = (markers: Marker[], id: string) => withId(markers, id).map((m) => m.time);
/** The "Div" labels: bullCond / bearCond of bar i drawn on bar i - 1 at osc[i - 1] (offset = -1) */
function expectDivLabels(b: Bar[], markers: Marker[], osc: number[], bull: boolean[], bear: boolean[]) {
  const exp = (flags: boolean[]) => flags.flatMap((f, i) => (f && i >= 1 && Number.isFinite(osc[i - 1]) ? [i - 1] : []));
  const bullIdx = exp(bull);
  const bearIdx = exp(bear);
  expect(timesOf(markers, 'shape0')).toEqual(bullIdx.map((j) => b[j].time));
  expect(timesOf(markers, 'shape1')).toEqual(bearIdx.map((j) => b[j].time));
  for (const m of withId(markers, 'shape0')) {
    const j = b.findIndex((x) => x.time === m.time);
    expect(m.price).toBeCloseTo(osc[j], 8);
    expect(m).toMatchObject({ shape: 'triangleUp', position: 'atPriceMiddle', text: 'Div' });
  }
  for (const m of withId(markers, 'shape1')) {
    const j = b.findIndex((x) => x.time === m.time);
    expect(m.price).toBeCloseTo(osc[j], 8);
    expect(m).toMatchObject({ shape: 'triangleDown', position: 'atPriceMiddle', text: 'Div' });
  }
  return { bull: bullIdx.length, bear: bearIdx.length };
}

describe('HaP MACD: MACD / signal cross triangles (hidden by default)', () => {
  for (const [name, b] of [['walk 7', bars], ['walk 4242', bars2]] as const) {
    it(`shape2 / shape3 on ta.crossover / ta.crossunder(macd, signal) at the MACD (${name})`, () => {
      const c = closes(b);
      const f = ema(c, 12), s = ema(c, 26);
      const macd = f.map((v, i) => v - s[i]);
      const sig = ema(macd, 9);
      const up = b.flatMap((_, i) => (crossover(macd, sig, i) ? [i] : []));
      const dn = b.flatMap((_, i) => (crossunder(macd, sig, i) ? [i] : []));
      expect(up.length).toBeGreaterThan(10);
      const res = hap.calculate(b);
      expect(timesOf(res.markers, 'shape2')).toEqual(up.map((i) => b[i].time));
      expect(timesOf(res.markers, 'shape3')).toEqual(dn.map((i) => b[i].time));
      withId(res.markers, 'shape2').forEach((m, k) => {
        expect(m.price).toBeCloseTo(macd[up[k]], 8);
        expect(m).toMatchObject({ shape: 'triangleUp', position: 'atPriceMiddle', color: '#00E676', size: 'small' });
      });
      withId(res.markers, 'shape3').forEach((m, k) => {
        expect(m.price).toBeCloseTo(macd[dn[k]], 8);
        expect(m).toMatchObject({ shape: 'triangleDown', position: 'atPriceMiddle', color: '#F23645', size: 'small' });
      });
      // the dots are kept
      expect(withId(res.markers, 'shape0').length).toBeGreaterThan(0);
      expect(withId(res.markers, 'shape1').length).toBeGreaterThan(0);
      expect(new Set(res.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1', 'shape2', 'shape3']));
    });
  }
});

/** MFI of hlc3 * volume over `len`: 100 - 100 / (1 + pos / max(neg, 0.000001)) */
function mfiOf(b: Bar[], len: number): number[] {
  const tp = b.map((x) => (x.high + x.low + x.close) / 3);
  const pos = tp.map((t, i) => (b[i].volume ?? NaN) * t * (i > 0 && t > tp[i - 1] ? 1 : 0));
  const neg = tp.map((t, i) => (b[i].volume ?? NaN) * t * (i > 0 && t < tp[i - 1] ? 1 : 0));
  const sum = (a: number[]) => a.map((_, i) => {
    const w = windowOf(a, i, len);
    return w ? w.reduce((s, v) => s + v, 0) : NaN;
  });
  const ps = sum(pos), ns = sum(neg);
  return ps.map((p, i) => 100 - 100 / (1 + p / Math.max(ns[i], 0.000001)));
}
const inZone = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

describe('MFI Nexus Pro: Regular Bullish / Bearish "Div" labels (hidden by default)', () => {
  const b = bars;
  const mfi = mfiOf(b, 14);
  const rsi = rsiOf(closes(b), 14);
  const div = regularDivergences(b, mfi, false);
  it('without the MFI / RSI filters: the divergences of the MFI pivots', () => {
    const res = mfiNexus.calculate(b, { mfiFilter: false, rsiFilter: false });
    const counts = expectDivLabels(b, res.markers, mfi, div.bull, div.bear);
    expect(counts.bull).toBeGreaterThan(5);
    expect(counts.bear).toBeGreaterThan(5);
  });
  it('defaults: filtered by the MFI zones (1-30 / 70-100) and the RSI zones (1-30 / 65-100)', () => {
    const bull = div.bull.map((f, i) => f && inZone(mfi[i], 1, 30) && inZone(rsi[i], 1, 30));
    const bear = div.bear.map((f, i) => f && inZone(mfi[i], 70, 100) && inZone(rsi[i], 65, 100));
    const res = mfiNexus.calculate(b);
    expectDivLabels(b, res.markers, mfi, bull, bear);
    // the other signal ids are kept
    expect(res.markers.every((m) => /^shape\d+$/.test(m.id ?? ''))).toBe(true);
  });
});

describe('RSI BB StdDev Signal: Regular Bullish / Bearish "Div" labels (hidden by default)', () => {
  const b = bars;
  const rsi = rsiOf(closes(b), 14);
  const div = regularDivergences(b, rsi, true);
  it('without the RSI filter: the divergences of the RSI pivots', () => {
    const res = rsiBb.calculate(b, { overboughtOversold: false });
    const counts = expectDivLabels(b, res.markers, rsi, div.bull, div.bear);
    expect(counts.bull).toBeGreaterThan(2);
    expect(counts.bear).toBeGreaterThan(2);
  });
  it('defaults: filtered by the RSI zones (20-40 for buys, 60-80 for sells)', () => {
    const bull = div.bull.map((f, i) => f && inZone(rsi[i], 20, 40));
    const bear = div.bear.map((f, i) => f && inZone(rsi[i], 60, 80));
    const res = rsiBb.calculate(b);
    const counts = expectDivLabels(b, res.markers, rsi, bull, bear);
    expect(counts.bull + counts.bear).toBeGreaterThan(0);
  });
});

describe('Williams BBDiv Signal: Regular Bullish / Bearish "Div" labels (hidden by default)', () => {
  const b = bars;
  const hh = highest(highs(b), 14), ll = lowest(lows(b), 14);
  const pr = b.map((x, i) => (100 * (x.close - hh[i])) / (hh[i] - ll[i]));
  const div = regularDivergences(b, pr, true);
  it('without the %R filter: the divergences of the %R pivots', () => {
    const res = williams.calculate(b, { wrFilterEnabled: false });
    const counts = expectDivLabels(b, res.markers, pr, div.bull, div.bear);
    expect(counts.bull).toBeGreaterThan(5);
    expect(counts.bear).toBeGreaterThan(5);
  });
  it('defaults: filtered by the %R zones (-95..-75 for buys, -35..-10 for sells)', () => {
    const bull = div.bull.map((f, i) => f && inZone(pr[i], -95, -75));
    const bear = div.bear.map((f, i) => f && inZone(pr[i], -35, -10));
    const res = williams.calculate(b);
    const counts = expectDivLabels(b, res.markers, pr, bull, bear);
    expect(counts.bull + counts.bear).toBeGreaterThan(0);
  });
});

describe('Reversal Signals: Overall Bearish / Bullish Trend Marks (hidden by default)', () => {
  /** bSR / sSS of the original (momentum phase counts from na fields, highest / lowest of 9 bars) */
  function levels(b: Bar[]) {
    const c = closes(b);
    const sR = highest(highs(b), 9);
    const sS = lowest(lows(b), 9);
    let bSC = NaN, sSC = NaN, bSR = NaN, sSS = NaN;
    const bearMarks: number[] = [], bullMarks: number[] = [];
    const bsrAt: number[] = [], sssAt: number[] = [];
    for (let i = 0; i < b.length; i++) {
      const pb = bSC, ps = sSC;
      const con = i >= 4 && c[i] < c[i - 4];
      if (con) { bSC = bSC === 9 ? 1 : bSC + 1; sSC = 0; } else { sSC = sSC === 9 ? 1 : sSC + 1; bSC = 0; }
      const bC8 = pb === 8 && sSC === 1;
      const sC8 = ps === 8 && bSC === 1;
      const pR = bSR, pS = sSS;
      bSR = bSC === 9 || bC8 ? sR[i] : c[i] > pR ? 0 : pR;
      sSS = sSC === 9 || sC8 ? sS[i] : c[i] < pS ? 0 : pS;
      if (bSR > 0 && pR === 0) bearMarks.push(i);
      if (sSS > 0 && pS === 0) bullMarks.push(i);
      bsrAt[i] = bSR;
      sssAt[i] = sSS;
    }
    return { bearMarks, bullMarks, bsrAt, sssAt };
  }
  for (const [name, b] of [['walk 7', bars], ['walk 4242', bars2]] as const) {
    it(`shape54 at bSR / shape55 at sSS on the first bar of a new level (${name})`, () => {
      const ref = levels(b);
      expect(ref.bearMarks.length).toBeGreaterThan(10);
      expect(ref.bullMarks.length).toBeGreaterThan(10);
      const res = reversal.calculate(b);
      const ms = res.markers as Marker[];
      expect(timesOf(ms, 'shape54')).toEqual(ref.bearMarks.map((i) => b[i].time));
      expect(timesOf(ms, 'shape55')).toEqual(ref.bullMarks.map((i) => b[i].time));
      withId(ms, 'shape54').forEach((m, k) => {
        expect(m.price).toBeCloseTo(ref.bsrAt[ref.bearMarks[k]], 8);
        expect(m).toMatchObject({ shape: 'labelDown', position: 'atPriceTop', text: '⇩', color: '#00000000', size: 'small' });
      });
      withId(ms, 'shape55').forEach((m, k) => {
        expect(m.price).toBeCloseTo(ref.sssAt[ref.bullMarks[k]], 8);
        expect(m).toMatchObject({ shape: 'labelUp', position: 'atPriceBottom', text: '⇧', color: '#00000000', size: 'small' });
      });
    });
  }
});

describe('Ichimoku Oscillator: bounce-off triangles (Bounce Off Support/Resistance, off by default)', () => {
  /**
   * bouncbackup = bounceoff and trend == 4 and close > CloudMax and inthecloud[1] (bouncbackdn mirrored), CloudMin /
   * CloudMax = min / max(leadLine1[displacement - 1], leadLine2[displacement - 1]) of the original's formulas. The
   * trend state is the port's: trend == 4 from a new-uptrend triangle (shape1) to the bar before the next close-trade
   * cross (shape0, long colour); trend == -4 from shape3 to the next short-colour shape0.
   */
  function reference(b: Bar[], cfg: { conversionPeriods: number; basePeriods: number; laggingSpan: number; displacement: number }, ms: Marker[]) {
    const n = b.length;
    const c = closes(b);
    const don = (len: number) => {
      const h = highest(highs(b), len), l = lowest(lows(b), len);
      return h.map((v, i) => (v + l[i]) / 2);
    };
    const conv = don(cfg.conversionPeriods), base = don(cfg.basePeriods);
    const lead1 = conv.map((v, i) => (v + base[i]) / 2);
    const lead2 = don(cfg.laggingSpan);
    const d = cfg.displacement - 1;
    const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
    const cMin = c.map((_, i) => Math.min(at(lead1, i - d), at(lead2, i - d)));
    const cMax = c.map((_, i) => Math.max(at(lead1, i - d), at(lead2, i - d)));
    const inCloud = c.map((v, i) => v >= cMin[i] && v <= cMax[i]);
    const index = new Map(b.map((x, i) => [x.time, i]));
    const trend: number[] = new Array(n).fill(0);
    const starts = (id: string) => new Set(withId(ms, id).map((m) => index.get(m.time)!));
    const upStart = starts('shape1'), dnStart = starts('shape3');
    const closeLong = new Set(withId(ms, 'shape0').filter((m) => m.color === '#FFFFFF').map((m) => index.get(m.time)!));
    const closeShort = new Set(withId(ms, 'shape0').filter((m) => m.color === '#FFEB3B').map((m) => index.get(m.time)!));
    let state = 0;
    for (let i = 0; i < n; i++) {
      if ((state === 4 && closeLong.has(i)) || (state === -4 && closeShort.has(i))) state = 0;
      if (upStart.has(i)) state = 4;
      if (dnStart.has(i)) state = -4;
      trend[i] = state;
    }
    const up = b.flatMap((_, i) => (trend[i] === 4 && c[i] > cMax[i] && i > 0 && inCloud[i - 1] ? [i] : []));
    const dn = b.flatMap((_, i) => (trend[i] === -4 && c[i] < cMin[i] && i > 0 && inCloud[i - 1] ? [i] : []));
    return { up, dn };
  }
  const cases = [
    ['defaults', {}],
    ["the original's lengths (8 / 13 / 26 / 13)", { conversionPeriods: 8, basePeriods: 13, laggingSpan: 26, displacement: 13 }],
  ] as const;
  for (const [label, extra] of cases) {
    for (const [name, b] of [['walk 7', walk(8000, 7)], ['walk 4242', walk(8000, 4242)]] as const) {
      it(`shape2 / shape4 at 0 and the additional alerts, ${label} (${name})`, () => {
        const cfg = { ...ichimoku.defaultInputs, ...extra };
        const res = ichimoku.calculate(b, { ...extra, bounceOff: true });
        const ms = res.markers as Marker[];
        const ref = reference(b, cfg, ms);
        expect(ref.up.length).toBeGreaterThan(1);
        expect(ref.dn.length).toBeGreaterThan(1);
        expect(timesOf(ms, 'shape2')).toEqual(ref.up.map((i) => b[i].time));
        expect(timesOf(ms, 'shape4')).toEqual(ref.dn.map((i) => b[i].time));
        for (const m of withId(ms, 'shape2')) expect(m).toMatchObject({ price: 0, shape: 'triangleUp', color: '#FFFFFF', size: 'tiny' });
        for (const m of withId(ms, 'shape4')) expect(m).toMatchObject({ price: 0, shape: 'triangleDown', color: '#FFEB3B', size: 'tiny' });
        // additional alerts (on by default), with the main frequency
        const longCalls = res.alertCalls.filter((a) => a.message.startsWith('Buy / Additonal, Close = ')).map((a) => a.time);
        const shortCalls = res.alertCalls.filter((a) => a.message.startsWith('Sell / Additonal, Close = ')).map((a) => a.time);
        expect(longCalls).toEqual(ref.up.map((i) => b[i].time));
        expect(shortCalls).toEqual(ref.dn.map((i) => b[i].time));
        expect(res.alertCalls.filter((a) => a.message.includes('Additonal')).every((a) => a.freq === 'once_per_bar_close')).toBe(true);
        const noAdd = ichimoku.calculate(b, { ...extra, bounceOff: true, addAlert: false });
        expect(noAdd.alertCalls.some((a) => a.message.includes('Additonal'))).toBe(false);
        // the other outputs do not change
        const off = ichimoku.calculate(b, extra);
        expect(off.markers.filter((m) => m.id !== 'shape2' && m.id !== 'shape4')).toEqual(ms.filter((m) => m.id !== 'shape2' && m.id !== 'shape4'));
      });
    }
  }
  it('off by default: no bounce triangles nor additional alerts', () => {
    const res = ichimoku.calculate(bars);
    expect(withId(res.markers as Marker[], 'shape2')).toEqual([]);
    expect(withId(res.markers as Marker[], 'shape4')).toEqual([]);
    expect(res.alertCalls.some((a) => a.message.includes('Additonal'))).toBe(false);
    expect(ichimoku.inputConfig.find((c) => c.id === 'bounceOff')).toMatchObject({ title: 'Bounce Off Support/Resistance', defval: false });
    expect(ichimoku.inputConfig.find((c) => c.id === 'addAlert')).toMatchObject({ title: 'Additional Buy/Sell Alert', defval: true });
  });
});

describe('Ultimate Buy and Sell: price / ATR watch signals and bought / sold background (off by default)', () => {
  const b = bars;
  const c = closes(b);
  // Price BB (SMA 20, outer 2.4 stdev) and ATR Bollinger Bands (WMA 20 +- (ATR 20 + 1.5 stdev 20))
  const basis = sma(c, 20), sd = stdev(c, 20);
  const upperOuter = basis.map((v, i) => v + 2.4 * sd[i]);
  const lowerOuter = basis.map((v, i) => v - 2.4 * sd[i]);
  const wm = wma(c, 20), atr = atrOf(b, 20);
  const upperBb = wm.map((v, i) => v + atr[i] + 1.5 * sd[i]);
  const lowerBb = wm.map((v, i) => v - atr[i] - 1.5 * sd[i]);
  const upperBand = wm.map((v, i) => v + atr[i] * 1.5);
  const lowerBand = wm.map((v, i) => v - atr[i] * 1.5);
  const idx = (f: (i: number) => boolean) => b.flatMap((_, i) => (f(i) ? [i] : []));
  const priceBuy = idx((i) => i > 0 && b[i].low < lowerOuter[i - 1]);
  const priceSell = idx((i) => i > 0 && b[i].high > upperOuter[i - 1]);
  const atrBuy = idx((i) => crossunder(c, lowerBb, i));
  const atrSell = idx((i) => crossover(c, upperBb, i));
  const T = (list: number[]) => list.map((i) => b[i].time);

  it('defaults: none of them drawn', () => {
    const res = ubs.calculate(b);
    for (const id of ['shape10', 'shape11', 'shape12', 'shape13']) expect(withId(res.markers, id)).toEqual([]);
    expect(res.bgColors.filter((g) => g.id === 'bgcolor2' || g.id === 'bgcolor3')).toEqual([]);
  });
  it('price watch diamonds (shape10 / shape11) and ATR watch circles (shape12 / shape13)', () => {
    expect(priceBuy.length).toBeGreaterThan(10);
    expect(atrBuy.length).toBeGreaterThan(2);
    const res = ubs.calculate(b, { usePriceBandWatchSignals: true, showPriceWatchPlot: true, useAtrWatchSignals: true, showAtrWatchPlot: true });
    expect(timesOf(res.markers, 'shape10')).toEqual(T(priceBuy));
    expect(timesOf(res.markers, 'shape11')).toEqual(T(priceSell));
    expect(timesOf(res.markers, 'shape12')).toEqual(T(atrBuy));
    expect(timesOf(res.markers, 'shape13')).toEqual(T(atrSell));
    for (const m of withId(res.markers, 'shape10')) expect(m).toMatchObject({ position: 'belowBar', shape: 'diamond', color: 'rgba(255,152,0,0.8)', size: 'tiny' });
    for (const m of withId(res.markers, 'shape11')) expect(m).toMatchObject({ position: 'aboveBar', shape: 'diamond', color: 'rgba(224,64,251,0.8)', size: 'tiny' });
    for (const m of withId(res.markers, 'shape12')) expect(m).toMatchObject({ position: 'belowBar', shape: 'circle', color: 'rgba(255,152,0,0.8)', size: 'tiny' });
    for (const m of withId(res.markers, 'shape13')) expect(m).toMatchObject({ position: 'aboveBar', shape: 'circle', color: 'rgba(224,64,251,0.8)', size: 'tiny' });
    // "Show?" off: used for the signals, not drawn
    const hidden = ubs.calculate(b, { usePriceBandWatchSignals: true, useAtrWatchSignals: true });
    for (const id of ['shape10', 'shape11', 'shape12', 'shape13']) expect(withId(hidden.markers, id)).toEqual([]);
  });
  it('ATR bands instead of ATR Bollinger Bands: both ATR watches cross under (as the original)', () => {
    const res = ubs.calculate(b, { useAtrWatchSignals: true, showAtrWatchPlot: true, atrBollingerBands: false });
    expect(timesOf(res.markers, 'shape12')).toEqual(T(idx((i) => crossunder(c, lowerBand, i))));
    expect(timesOf(res.markers, 'shape13')).toEqual(T(idx((i) => crossunder(c, upperBand, i))));
  });
  it('watch signals feed the watch quota: each buy / sell has a watch since the last signal within the lookback', () => {
    const res = ubs.calculate(b, { usePriceBandWatchSignals: true, showPriceWatchPlot: true });
    const at = (ids: string[]) => new Set(res.markers.filter((m) => ids.includes(m.id ?? '')).map((m) => m.time));
    const buyW = at(['shape8', 'shape10']);
    const sellW = at(['shape9', 'shape11']);
    const sig = res.markers.filter((m) => m.id === 'shape0' || m.id === 'shape1')
      .map((m) => ({ i: b.findIndex((x) => x.time === m.time), buy: m.id === 'shape0' }));
    expect(sig.length).toBeGreaterThan(5);
    const base = ubs.calculate(b);
    expect(res.markers.filter((m) => m.id === 'shape0').length).not.toBe(base.markers.filter((m) => m.id === 'shape0').length);
    let last = -1;
    for (const s of sig) {
      const from = Math.max(0, s.i - 35 + 1, last + 1);
      const watched = s.buy ? buyW : sellW;
      expect(b.slice(from, s.i + 1).some((x) => watched.has(x.time))).toBe(true);
      last = s.i;
    }
  });
  it('bought / sold background (bgcolor2 / bgcolor3): the state of the last buy / sell signal', () => {
    const res = ubs.calculate(b, { showBSBackground: true });
    const buys = new Set(timesOf(res.markers, 'shape0'));
    const sells = new Set(timesOf(res.markers, 'shape1'));
    expect(buys.size).toBeGreaterThan(5);
    let state = 0;
    const boughtT: number[] = [], soldT: number[] = [];
    for (const x of b) {
      if (buys.has(x.time)) state = 1;
      else if (sells.has(x.time)) state = -1;
      if (state === 1) boughtT.push(x.time);
      if (state === -1) soldT.push(x.time);
    }
    expect(res.bgColors.filter((g) => g.id === 'bgcolor2').map((g) => g.time)).toEqual(boughtT);
    expect(res.bgColors.filter((g) => g.id === 'bgcolor3').map((g) => g.time)).toEqual(soldT);
    expect(res.bgColors.filter((g) => g.id === 'bgcolor2').every((g) => g.color === 'rgba(76,175,80,0.1)')).toBe(true);
    expect(res.bgColors.filter((g) => g.id === 'bgcolor3').every((g) => g.color === 'rgba(242,54,69,0.1)')).toBe(true);
    // the signal warning background is kept
    expect(res.bgColors.some((g) => g.id === 'bgcolor0')).toBe(true);
  });
  it('inputs with the original titles and defaults', () => {
    const cfg = Object.fromEntries(ubs.inputConfig.map((c) => [c.id, [c.title, c.defval]]));
    expect(cfg.usePriceBandWatchSignals).toEqual(['Use Price Watch Signals', false]);
    expect(cfg.useAtrWatchSignals).toEqual(['Use ATR Watch Signals', false]);
    expect(cfg.showPriceWatchPlot).toEqual(['Show?', false]);
    expect(cfg.showAtrWatchPlot).toEqual(['Show?', false]);
    expect(cfg.showBSBackground).toEqual(['Bought/Sold Colored Background', false]);
    expect(cfg.atrBollingerBands).toEqual(['ATR Bollinger Bands', true]);
  });
});

describe('QQE MOD: plots only', () => {
  it('no markers nor bar colours; the 4 plots and the alerts are kept', () => {
    const res = qqe.calculate(bars) as Record<string, unknown> & ReturnType<typeof qqe.calculate>;
    expect(res.markers ?? []).toEqual([]);
    expect(res.barColors ?? []).toEqual([]);
    expect(Object.keys(res.plots)).toEqual(['plot0', 'plot1', 'plot2', 'plot3']);
    const up = (res.plots.plot2 as { value: number }[]).filter((p) => Number.isFinite(p.value)).length;
    expect(up).toBeGreaterThan(0);
    expect(res.alerts.map((a) => a.id)).toEqual(['alert0', 'alert1']);
  });
});
