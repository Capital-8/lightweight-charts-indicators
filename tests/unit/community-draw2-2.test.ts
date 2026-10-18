/**
 * Community ports, second drawing pass 2: the parts named by the review recomputed here from the originals'
 * formulas (independent of the ports) on seeded walks and crafted bars: Market Cipher A (EMA lines from their first
 * bar, RSI+MFI na on bars whose high equals the low, Blood Diamond without text, color.yellow), Multiple Divergences
 * (the original's per-oscillator counting), Zero-Lag MA (zlma line with its na colour), OTT (lines from bar 0,
 * highlight off, support line crossing input), VWAP/MVWAP/EMA (green bars #008000), Technical Ratings (v3 inputs,
 * colours, levels), Standardized MACD HA (Bar Coloring None by default and its modes, histogram colours).
 */
import { describe, expect, it } from 'vitest';
import { color as pineColor, type Bar } from 'oakscriptjs';
import * as mca from '../../src/community/market-cipher-a';
import * as mdiv from '../../src/community/multiple-divergences';
import * as zlma from '../../src/community/zlma-trend-levels';
import * as ott from '../../src/community/optimized-trend-tracker';
import * as vwapx from '../../src/community/vwap-mvwap-ema-crossover';
import * as tr from '../../src/community/technical-ratings';
import * as smacd from '../../src/community/standardized-macd-ha';

/** Seeded random walk of daily bars with a varying volume; `flatEvery` > 0 makes every such bar flat (high = low) */
function walk(count: number, seed0: number, flatEvery = 0, drift = 0): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + drift + (rnd() - 0.5) * 4);
    let high = Math.max(o, p) + rnd() * 1.5 + 0.01;
    let low = Math.min(o, p) - rnd() * 1.5 - 0.01;
    const volume = Math.round(1e6 * (0.3 + rnd() * 1.4) * (rnd() < 0.03 ? 5 : 1));
    if (flatEvery > 0 && i % flatEvery === flatEvery - 1) {
      high = low = p;
      out.push({ time: 1577836800 + i * 86400, open: p, high, low, close: p, volume });
      continue;
    }
    out.push({ time: 1577836800 + i * 86400, open: o, high, low, close: p, volume });
  }
  return out;
}

const bars = walk(1300, 11);
const bars2 = walk(1250, 4242);

// --- Pine reference helpers (independent of the ports) ---
const fin = Number.isFinite;
/** x / 0 is na */
const div = (a: number, b: number) => (b === 0 ? NaN : a / b);
/** ta.ema: na until the length-th valid value (seeded with their mean), na on na bars */
function ema(src: number[], len: number): number[] {
  const out: number[] = [];
  const a = 2 / (len + 1);
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!fin(v)) { out.push(NaN); continue; }
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
/** ta.rma: as ta.ema with alpha 1 / len */
function rma(src: number[], len: number): number[] {
  const out: number[] = [];
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!fin(v)) { out.push(NaN); continue; }
    if (isNaN(prev)) {
      count++; sum += v;
      if (count === len) { prev = sum / len; out.push(prev); } else out.push(NaN);
    } else {
      prev = (v + (len - 1) * prev) / len;
      out.push(prev);
    }
  }
  return out;
}
/** ta.sma: na unless the last len values exist */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
function extreme(src: number[], len: number, low: boolean): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let best = src[i];
    for (let k = i - len + 1; k <= i; k++) best = low ? Math.min(best, src[k]) : Math.max(best, src[k]);
    return best;
  });
}
/** ta.rsi */
function rsi(src: number[], len: number): number[] {
  const ch = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const up = rma(ch.map((c) => (isNaN(c) ? NaN : Math.max(c, 0))), len);
  const dn = rma(ch.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0))), len);
  return up.map((u, i) => {
    const d = dn[i];
    if (isNaN(u) || isNaN(d)) return NaN;
    return d === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / d);
  });
}
const xover = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
const xunder = (a: number[], b: number[], i: number) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];
const O = (b: Bar[]) => b.map((x) => x.open);
const H = (b: Bar[]) => b.map((x) => x.high);
const L = (b: Bar[]) => b.map((x) => x.low);
const C = (b: Bar[]) => b.map((x) => x.close);
const V = (b: Bar[]) => b.map((x) => x.volume ?? 0);
const vals = (s: { value: number }[]) => s.map((p) => p.value);
const near = (a: number, b: number) => (isNaN(a) && isNaN(b)) || Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));

type M = { id?: string; time: number; position: string; price?: number; color?: string; text?: string; shape?: string; textColor?: string };
const key = (m: M) => `${m.id}@${m.time}:${m.position}:${m.text ?? ''}`;
function expectSameMarkers(got: M[], want: M[]) {
  const sort = (a: M[]) => [...a].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  const g = sort(got), w = sort(want);
  expect(g.map(key)).toEqual(w.map(key));
  g.forEach((m, k) => {
    if (w[k].price !== undefined) expect(m.price).toBeCloseTo(w[k].price!, 8);
  });
}

// ─── Market Cipher A ────────────────────────────────────────────────────────────────────────────────────────────
describe('Market Cipher A: EMA lines, RSI+MFI na, Blood Diamond, yellow', () => {
  /** The 8 shapes of the original, with RSI+MFI na (or 0) on bars whose high equals the low */
  function expected(b: Bar[], mfiZero: boolean): M[] {
    const o = O(b), h = H(b), l = L(b), c = C(b);
    const [e1, e2, e3, , , , , e8] = [5, 11, 15, 18, 21, 24, 28, 34].map((len) => ema(c, len));
    const src = b.map((x) => (x.high + x.low + x.close) / 3);
    const esa = ema(src, 9);
    const de = ema(src.map((v, i) => Math.abs(v - esa[i])), 9);
    const ci = src.map((v, i) => div(v - esa[i], 0.015 * de[i]));
    const wt1 = ema(ci, 13);
    const wt2 = sma(wt1, 3);
    const r = rsi(c, 14);
    const mfi = sma(c.map((v, i) => (h[i] === l[i] ? (mfiZero ? 0 : NaN) : ((v - o[i]) / (h[i] - l[i])) * 150)), 60);
    const want: M[] = [];
    for (let i = 0; i < b.length; i++) {
      const t = b[i].time as number;
      const redCross = xunder(e1, e2, i);
      const redDiamond = (xover(wt1, wt2, i) || xunder(wt1, wt2, i)) && wt2[i] - wt1[i] >= 0;
      const yellowCross = redDiamond && wt2[i] < 45 && wt2[i] > -80 && r[i] < 30 && r[i] > 15 && mfi[i] < -5;
      const bullCandle = o[i] > e2[i] && o[i] > e8[i] && i > 0 && c[i - 1] > o[i - 1] && c[i] > o[i] && !redDiamond && !redCross;
      [xover(e2, e8, i), xover(e8, e2, i), redCross, xover(e2, e3, i), redDiamond, bullCandle, redDiamond && redCross, yellowCross]
        .forEach((f, k) => { if (f) want.push({ id: `shape${k}`, time: t, position: 'aboveBar', text: '' }); });
    }
    return want;
  }
  // a slowly falling walk with a flat bar every 120 bars: the 60-bar RSI+MFI is na after each of them
  const flat = walk(1400, 99, 120, -0.1);

  it('EMA lines exist from bar length - 1 and follow ta.ema', () => {
    const res = mca.calculate(bars);
    const c = C(bars);
    [5, 11, 15, 18, 21, 24, 28, 34].forEach((len, k) => {
      const want = ema(c, len);
      const got = vals(res.plots[`ema${k + 1}`] as { value: number }[]);
      expect(got.findIndex(fin)).toBe(len - 1);
      got.forEach((v, i) => expect(near(v, want[i])).toBe(true));
    });
  });

  it('every shape as the original on a walk and on bars with flat bars (RSI+MFI na there)', () => {
    expectSameMarkers(mca.calculate(bars).markers as M[], expected(bars, false));
    const want = expected(flat, false);
    expect(want.filter((m) => m.id === 'shape7').length).toBeGreaterThan(3);
    // the na rule matters here: RSI+MFI read as 0 on the flat bars gives other Yellow Crosses
    const zero = expected(flat, true).filter((m) => m.id === 'shape7').map(key);
    expect(zero).not.toEqual(want.filter((m) => m.id === 'shape7').map(key));
    expectSameMarkers(mca.calculate(flat).markers as M[], want);
  });

  it('Blood Diamond has no text; Bull candle / Yellow Cross in color.yellow #FFEB3B', () => {
    const res = mca.calculate(flat);
    const blood = res.markers.filter((m) => m.id === 'shape6');
    expect(blood.length).toBeGreaterThan(0);
    expect(blood.every((m) => m.text === '' && m.shape === 'diamond')).toBe(true);
    const bull = res.markers.filter((m) => m.id === 'shape5');
    const yellow = res.markers.filter((m) => m.id === 'shape7');
    expect(bull.length).toBeGreaterThan(0);
    expect(bull.every((m) => m.color === 'rgba(255,235,59,0.25)')).toBe(true);
    expect(yellow.every((m) => m.color === 'rgba(255,235,59,0.75)' && m.shape === 'xcross')).toBe(true);
  });

  it('keeps the shape ids and the alerts on the signals', () => {
    const res = mca.calculate(flat);
    expect(new Set(res.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7']));
    const yx = res.alerts.find((a) => a.id === 'alert2')!;
    expect(yx).toBeDefined();
    // alertcondition(yellowCross, "YellowX") follows the RSI+MFI na rule too
    const want = expected(flat, false).filter((m) => m.id === 'shape7').map((m) => m.time).sort((x, y) => x - y);
    expect(want.length).toBeGreaterThan(3);
    expect(yx.times).toEqual(want);
  });
});

// ─── Multiple Divergences ───────────────────────────────────────────────────────────────────────────────────────
describe('Multiple Divergences: the original counting', () => {
  /** ta.pivotlow / pivothigh(src, L, R) found on bar i: window of the last L + R + 1 non-na values, the pivot (bar
   * i - R) may equal values on its left, lower (higher) than those on its right */
  function pivots(src: number[], Lb: number, Rb: number) {
    const n = src.length;
    const valid: number[] = [];
    const low: boolean[] = new Array(n).fill(false), high: boolean[] = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (fin(src[i])) valid.push(i);
      if (i < Lb + Rb || valid.length === 0 || valid[valid.length - 1] !== i) continue;
      const w = valid.slice(-(Lb + Rb + 1));
      const p = w.indexOf(i - Rb);
      if (p < 0) continue;
      const v = src[i - Rb];
      low[i] = w.every((k, q) => (q < p ? v <= src[k] : q > p ? v < src[k] : true));
      high[i] = w.every((k, q) => (q < p ? v >= src[k] : q > p ? v > src[k] : true));
    }
    return { low, high };
  }
  function oscillators(b: Bar[]): Record<string, number[]> {
    const n = b.length;
    const c = C(b), h = H(b), l = L(b), v = V(b);
    const e12 = ema(c, 12), e26 = ema(c, 26);
    const macd = e12.map((x, i) => x - e26[i]);
    const sig = ema(macd, 9);
    const mom = c.map((x, i) => (i >= 10 ? x - c[i - 10] : NaN));
    const ma10 = sma(c, 10);
    const cci = c.map((x, i) => {
      if (i < 9) return NaN;
      let dev = 0;
      for (let k = i - 9; k <= i; k++) dev += Math.abs(c[k] - ma10[i]);
      return div(x - ma10[i], 0.015 * (dev / 10));
    });
    const obv: number[] = [];
    for (let i = 0; i < n; i++) obv.push((i ? obv[i - 1] : 0) + (i && c[i] > c[i - 1] ? v[i] : i && c[i] < c[i - 1] ? -v[i] : 0));
    const hh = extreme(h, 14, false), ll = extreme(l, 14, true);
    const stoch = c.map((x, i) => div(100 * (x - ll[i]), hh[i] - ll[i]));
    const stk = sma(stoch, 3);
    const DI = h.map((x, i) => (i ? (x - h[i - 1]) + (l[i] - l[i - 1]) : NaN));
    const trv = h.map((x, i) => (i ? Math.max(x - l[i], Math.abs(x - c[i - 1]), Math.abs(l[i] - c[i - 1])) : NaN));
    const rDI = rma(DI, 14), trur = rma(trv, 14);
    let last = NaN;
    const diosc = rDI.map((x, i) => { const q = div(100 * x, trur[i]); if (fin(q)) last = q; return last; });
    const cv = c.map((x, i) => x * v[i]);
    const vw = (len: number) => sma(cv, len).map((x, i) => div(x, sma(v, len)[i]));
    const vw12 = vw(12), vw26 = vw(26);
    const vwmacd = vw12.map((x, i) => x - vw26[i]);
    const cmfv = c.map((x, i) => div((x - l[i]) - (h[i] - x), h[i] - l[i]) * v[i]);
    const s21 = sma(v, 21);
    const cmf = sma(cmfv, 21).map((x, i) => div(x, s21[i]));
    return {
      calcrsi: rsi(c, 14), calcmacd: macd, calcmacda: macd.map((x, i) => x - sig[i]), calcmom: mom, calccci: cci,
      calcobv: obv, calcstoc: stk, calcdi: diosc, calcvwmacd: vwmacd, calccmf: cmf,
    };
  }
  function expected(b: Bar[], inp: Partial<mdiv.MultipleDivergencesInputs>, mintick: number): M[] {
    const cfg = { ...mdiv.defaultInputs, ...inp };
    const n = b.length, lbR = cfg.lbR, lbL = cfg.lbL;
    const low = L(b), high = H(b);
    const counts = [0, 1, 2, 3].map(() => new Array(n).fill(0));
    const oscs = oscillators(b);
    for (const [id, osc] of Object.entries(oscs)) {
      if (!(cfg as unknown as Record<string, boolean>)[id]) continue;
      const pv = pivots(osc, lbL, lbR);
      const back = (a: number[], i: number) => (i - lbR >= 0 ? a[i - lbR] : NaN);
      // valuewhen(found, x, 1) and barssince(found[1])
      const vw = (found: boolean[], x: (i: number) => number, i: number) => {
        let seen = 0;
        for (let k = i; k >= 0; k--) if (found[k]) { if (seen === 1) return x(k); seen++; }
        return NaN;
      };
      const since = (found: boolean[], i: number) => {
        for (let j = i; j >= 1; j--) if (found[j - 1]) return i - j;
        return NaN;
      };
      for (let i = 0; i < n; i++) {
        const oR = back(osc, i), lR = back(low, i), hR = back(high, i);
        const inPl = cfg.rangeLower <= since(pv.low, i) && since(pv.low, i) <= cfg.rangeUpper;
        const inPh = cfg.rangeLower <= since(pv.high, i) && since(pv.high, i) <= cfg.rangeUpper;
        const pOsc = vw(pv.low, (k) => back(osc, k), i), pLow = vw(pv.low, (k) => back(low, k), i);
        const hOsc = vw(pv.high, (k) => back(osc, k), i), hHigh = vw(pv.high, (k) => back(high, k), i);
        if (cfg.plotBull && lR < pLow && oR > pOsc && inPl && pv.low[i]) counts[0][i]++;
        if (cfg.plotBear && hR > hHigh && oR < hOsc && inPh && pv.high[i]) counts[1][i]++;
        if (cfg.plotHiddenBull && lR > pLow && oR < pOsc && inPl && pv.low[i]) counts[2][i]++;
        if (cfg.plotHiddenBear && hR < hHigh && oR > hOsc && inPh && pv.high[i]) counts[3][i]++;
      }
    }
    const off = cfg.offset ? lbR : 0;
    const want: M[] = [];
    const voff = 5 * mintick;
    for (let i = 0; i < n; i++) {
      if (i - lbR < 0 || i - off < 0) continue;
      const t = b[i - off].time as number;
      [0, 1, 2, 3].forEach((kind) => {
        const cnt = counts[kind][i];
        // plotshape k (1..8): count == k and mindivcount < k + 1; "8+": count > 8 and mindivcount < 11
        const show = cnt > 8 ? cfg.minDivCount < 11 : cnt >= 1 && cfg.minDivCount < cnt + 1;
        if (!show) return;
        const bull = kind === 0 || kind === 2;
        want.push({
          id: `shape${[0, 9, 18, 27][kind] + Math.min(cnt, 9) - 1}`, time: t, position: bull ? 'atPriceBottom' : 'atPriceTop',
          price: bull ? low[i - lbR] - voff : high[i - lbR] + voff, text: cnt > 8 ? '8+' : String(cnt),
        });
      });
    }
    return want;
  }

  it('default inputs: the counts of the 10 oscillators (2 and more)', () => {
    const want = expected(bars, {}, 0.01);
    expect(want.length).toBeGreaterThan(20);
    expect(new Set(want.map((m) => m.text)).size).toBeGreaterThan(2);
    expectSameMarkers(mdiv.calculate(bars).markers as M[], want);
  });

  it('minimum count 1, wider pivots, another tick', () => {
    const inp = { minDivCount: 1, lbL: 5, lbR: 2 };
    const want = expected(bars2, inp, 0.25);
    expect(want.filter((m) => m.text === '1').length).toBeGreaterThan(10);
    expectSameMarkers(mdiv.calculate(bars2, inp, { mintick: 0.25 } as never).markers as M[], want);
  });

  it('oscillator check boxes, kinds off, repaint offset', () => {
    const inp = { minDivCount: 1, calcmacd: false, calcobv: false, calccmf: false, plotHiddenBear: false, offset: true };
    const want = expected(bars, inp, 0.01);
    expect(want.some((m) => m.id!.startsWith('shape2') && Number(m.id!.slice(5)) >= 27)).toBe(false);
    expectSameMarkers(mdiv.calculate(bars, inp).markers as M[], want);
  });

  it('new inputs with the original titles and defaults', () => {
    const t = Object.fromEntries(mdiv.inputConfig.map((c) => [c.id, [c.title, c.defval]]));
    expect(t.offset).toEqual(['Repaint or not?', false]);
    expect(t.calcmacda).toEqual(['MACD Histogram', true]);
    expect(t.calcdi).toEqual(['Diosc', true]);
    expect(t.calccmf).toEqual(['Chaikin Money Flow', true]);
    expect(t.minDivCount).toEqual(['Minimum Div Count to Display', 2]);
  });
});

// ─── Zero-Lag MA Trend Levels ───────────────────────────────────────────────────────────────────────────────────
describe('Zero-Lag MA Trend Levels: the zero-lag line', () => {
  // 80 flat bars (zlma == zlma[3]: na colour), then a walk
  const flat: Bar[] = Array.from({ length: 80 }, (_, i) => ({ time: 1500000000 + i * 86400, open: 100, high: 101, low: 99, close: 100, volume: 1e6 }));
  const b = flat.concat(walk(1200, 5).map((x, i) => ({ ...x, time: 1500000000 + (80 + i) * 86400 })));
  const res = zlma.calculate(b);
  const c = C(b);
  const e = ema(c, 15);
  const z = ema(c.map((v, i) => v + (v - e[i])), 15);

  it('plot0 is the zlma, coloured up / dn by zlma[3], no segment (transparent) where that colour is na', () => {
    const p0 = res.plots.plot0 as { value: number; color?: string }[];
    expect(p0.findIndex((p) => fin(p.value))).toBe(28);
    let na = 0;
    p0.forEach((p, i) => {
      expect(near(p.value, z[i])).toBe(true);
      const z3 = i >= 3 ? z[i - 3] : NaN;
      const want = z[i] > z3 ? '#30d453' : z[i] < z3 ? '#4043f1' : 'transparent';
      if (want === 'transparent') na++;
      expect(p.color).toBe(want);
    });
    expect(na).toBeGreaterThan(40);
    expect(p0.filter((p) => p.color === '#30d453').length).toBeGreaterThan(200);
    expect(p0.filter((p) => p.color === '#4043f1').length).toBeGreaterThan(200);
  });

  it('plot1 is the EMA coloured by ema < zlma', () => {
    const p1 = res.plots.plot1 as { value: number; color?: string }[];
    p1.forEach((p, i) => {
      expect(near(p.value, e[i])).toBe(true);
      expect(p.color).toBe(e[i] < z[i] ? '#30d453' : '#4043f1');
    });
  });

  it('keeps the diamonds shape0 / shape1', () => {
    expect(new Set(res.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1']));
  });
});

// ─── Optimized Trend Tracker ────────────────────────────────────────────────────────────────────────────────────
describe('Optimized Trend Tracker: lines from bar 0, highlight off, support line signals input', () => {
  const period = 2, percent = 1.4;
  const src = C(bars);
  const n = bars.length;
  const a = 2 / (period + 1);
  const vud = src.map((v, i) => (i > 0 && v > src[i - 1] ? v - src[i - 1] : 0));
  const vdd = src.map((v, i) => (i > 0 && v < src[i - 1] ? src[i - 1] - v : 0));
  const mavg: number[] = [];
  for (let i = 0; i < n; i++) {
    let cmo = 0;
    if (i >= 8) {
      let u = 0, d = 0;
      for (let k = i - 8; k <= i; k++) { u += vud[k]; d += vdd[k]; }
      const x = (u - d) / (u + d);
      cmo = Number.isNaN(x) ? 0 : x;
    }
    mavg.push(a * Math.abs(cmo) * src[i] + (1 - a * Math.abs(cmo)) * (i > 0 ? mavg[i - 1] : 0));
  }
  const ls: number[] = [], ss: number[] = [], dir: number[] = [], OTT: number[] = [];
  for (let i = 0; i < n; i++) {
    const fark = mavg[i] * percent * 0.01;
    const lsPrev = i > 0 ? ls[i - 1] : mavg[i] - fark;
    const ssPrev = i > 0 ? ss[i - 1] : mavg[i] + fark;
    ls.push(mavg[i] > lsPrev ? Math.max(mavg[i] - fark, lsPrev) : mavg[i] - fark);
    ss.push(mavg[i] < ssPrev ? Math.min(mavg[i] + fark, ssPrev) : mavg[i] + fark);
    const d0 = i > 0 ? dir[i - 1] : 1;
    dir.push(d0 === -1 && mavg[i] > ssPrev ? 1 : d0 === 1 && mavg[i] < lsPrev ? -1 : d0);
    const mt = dir[i] === 1 ? ls[i] : ss[i];
    OTT.push(mavg[i] > mt ? (mt * (200 + percent)) / 200 : (mt * (200 - percent)) / 200);
  }
  const ott2 = OTT.map((_, i) => (i >= 2 ? OTT[i - 2] : NaN));
  const ott3 = OTT.map((_, i) => (i >= 3 ? OTT[i - 3] : NaN));

  it('defaults and inputs as the original', () => {
    expect(ott.defaultInputs.highlight).toBe(false);
    expect(ott.defaultInputs.showSignalsK).toBe(true);
    const t = Object.fromEntries(ott.inputConfig.map((c) => [c.id, [c.title, c.defval]]));
    expect(t.showSupport).toEqual(['Show Support Line?', true]);
    expect(t.showSignalsK).toEqual(['Show Support Line Crossing Signals?', true]);
    expect(t.highlight).toEqual(['Show OTT Color Changes?', false]);
    expect(t.highlighting).toEqual(['Highlighter On/Off ?', true]);
  });

  it('support line = VAR from bar 0, OTT = nz(OTT[2]) from bar 0 in #B800D9', () => {
    const res = ott.calculate(bars);
    const p0 = res.plots.plot0 as { value: number }[];
    const p1 = res.plots.plot1 as { value: number; color?: string }[];
    expect(p0[0].value).toBe(0);
    p0.forEach((p, i) => expect(near(p.value, mavg[i])).toBe(true));
    expect([p1[0].value, p1[1].value]).toEqual([0, 0]);
    p1.forEach((p, i) => {
      expect(near(p.value, fin(ott2[i]) ? ott2[i] : 0)).toBe(true);
      expect(p.color).toBe('#B800D9');
    });
  });

  it('Show OTT Color Changes: green / red by OTT[2] > OTT[3] (na: red)', () => {
    const p1 = ott.calculate(bars, { highlight: true }).plots.plot1 as { color?: string }[];
    p1.forEach((p, i) => expect(p.color).toBe(ott2[i] > ott3[i] ? '#4CAF50' : '#FF5252'));
  });

  it('support line off; highlighter fills off; support crossing labels behind their input', () => {
    const off = ott.calculate(bars, { showSupport: false, highlighting: false, showSignalsK: false });
    expect((off.plots.plot0 as { value: number }[]).every((p) => Number.isNaN(p.value))).toBe(true);
    for (const f of off.fills as Array<{ colors: string[] }>) expect(f.colors.every((x) => x === 'transparent')).toBe(true);
    expect(off.markers.filter((m) => m.id === 'shape0' || m.id === 'shape1')).toEqual([]);
    const on = ott.calculate(bars);
    const want: M[] = [];
    for (let i = 0; i < n; i++) {
      const t = bars[i].time as number;
      if (xover(mavg, ott2, i)) want.push({ id: 'shape0', time: t, position: 'atPriceBottom', price: OTT[i] * 0.995, text: 'Buy' });
      if (xunder(mavg, ott2, i)) want.push({ id: 'shape1', time: t, position: 'atPriceTop', price: OTT[i] * 1.005, text: 'Sell' });
    }
    expect(want.length).toBeGreaterThan(20);
    expectSameMarkers(on.markers as M[], want);
    const fills = on.fills as Array<{ colors: string[] }>;
    fills[0].colors.forEach((x, i) => expect(x).toBe(mavg[i] > OTT[i] ? 'rgba(76,175,80,0.15)' : 'transparent'));
    fills[1].colors.forEach((x, i) => expect(x).toBe(mavg[i] < OTT[i] ? 'rgba(255,82,82,0.15)' : 'transparent'));
  });
});

// ─── VWAP/MVWAP/EMA CROSSOVER ───────────────────────────────────────────────────────────────────────────────────
describe('VWAP/MVWAP/EMA CROSSOVER: bar colours green #008000 / red #FF0000', () => {
  it('green on the Long bars (Buy, the "Buy Alert" shape), red elsewhere, id barcolor0', () => {
    const res = vwapx.calculate(bars);
    const buy = new Set(res.markers.filter((m) => m.id === 'shape2').map((m) => m.time));
    expect(buy.size).toBeGreaterThan(20);
    expect(res.barColors.length).toBe(bars.length);
    res.barColors.forEach((bc) => {
      expect(bc.id).toBe('barcolor0');
      expect(bc.color).toBe(buy.has(bc.time) ? '#008000' : '#FF0000');
    });
  });
});

// ─── Technical Ratings ──────────────────────────────────────────────────────────────────────────────────────────
describe('Technical Ratings: inputs, colours and levels of the original v3', () => {
  const cn = (c: string, t: number) => String(pineColor.new(c, t));
  const LIME = '#00FF00', PINK = '#FF0080', NEUTRAL = '#434650';

  it('inputs: titles, groups, colour check boxes, neutral #434650', () => {
    const t = Object.fromEntries(tr.inputConfig.map((c) => [c.id, c]));
    expect(t.tfInput.title).toBe('Higher timeframe');
    expect([t.colorInput1.title, t.colorInput1.defval, t.colorInput1.inline]).toEqual(['Bull  ', LIME, '02']);
    expect([t.colorInput4.title, t.colorInput4.defval, t.colorInput4.inline]).toEqual(['Bear   ', PINK, '03']);
    expect(['showColorInput1', 'showColorInput2', 'showColorInput3', 'showColorInput4', 'showColorInput5', 'showColorInput6'].map((k) => t[k].defval))
      .toEqual([true, false, false, true, false, false]);
    expect([t.neutColorInput.title, t.neutColorInput.defval]).toEqual(['Neutral', NEUTRAL]);
    expect(t.styleInput.group).toBe('Calculations');
    expect(t.dirInput.group).toBe('Alert Markers (non-repainting)');
    expect([t.altInput.title, t.levelUpInput.title, t.levelDnInput.title, t.alertDnInput.title])
      .toEqual(['Alternate Longs & Shorts', 'Longs Level', 'Shorts Level', 'Short']);
    expect(tr.inputConfig.some((c) => c.id.startsWith('preset'))).toBe(false);
    expect(tr.hlineConfig.map((h) => h.title)).toEqual(['Strong Buy Level', 'Buy Level', '0.0 Level', 'Sell Level', 'Strong Sell Level']);
  });

  /** colorFromRating() of the original */
  const fromRating = (r: number, bull: string, bear: string) => (r > 0.5 ? cn(bull, 20) : r > 0.1 ? cn(bull, 50)
    : r < -0.5 ? cn(bear, 20) : r < -0.1 ? cn(bear, 50) : NEUTRAL);
  /** signalColor() of the original */
  const signal = (g: number, bull: string, bear: string) => {
    const col = g > 0 ? bull : g < 0 ? bear : NEUTRAL;
    let tp = 100 - Math.abs(g) * 20;
    tp = tp === 80 ? 75 : tp;
    return col === NEUTRAL ? col : cn(col, tp);
  };

  for (const [name, inp, bull, bear] of [
    ['default colours', {}, LIME, PINK],
    ['second bull / third bear checked', { showColorInput1: false, showColorInput2: true, showColorInput4: false, showColorInput6: true }, '#CCCC00', '#013BCA'],
    ['none checked: first colours', { showColorInput1: false, showColorInput4: false }, LIME, PINK],
  ] as const) {
    it(`${name}: plot, data window and level colours`, () => {
      const res = tr.calculate(bars, { ...inp, dirInput: 'Longs and Shorts' }, { timeframe: '1D' } as never);
      const p = res.plots as Record<string, { value: number; color: string }[]>;
      let counted = 0;
      p.plot0.forEach((pt, i) => {
        const g = p.plot5[i].value;
        if (g !== 0) counted++;
        expect(pt.color).toBe(signal(g, bull, bear));
        for (const id of ['plot1', 'plot2', 'plot3']) {
          const q = p[id][i];
          if (fin(q.value)) expect(q.color).toBe(fromRating(q.value, bull, bear));
        }
      });
      expect(counted).toBeGreaterThan(100);
      expect(p.plot0.some((pt) => pt.color === NEUTRAL)).toBe(true);
      const hl = res.hlines!.map((h) => [h.options?.title, h.options?.color]);
      expect(hl).toEqual([
        ['Strong Buy Level', cn(bull, 50)], ['Buy Level', cn(bull, 65)], ['0.0 Level', cn('#787b86', 50)],
        ['Sell Level', cn(bear, 75)], ['Strong Sell Level', cn(bear, 50)], ['Long Level', bull], ['Short Level', bear],
      ]);
      expect(res.markers.every((m) => (m.id === 'char0' ? m.textColor === cn(bull, 0) : m.textColor === cn(bear, 0)))).toBe(true);
    });
  }

  it('labels: rating states coloured by colorFromRating (neutral as is)', () => {
    const res = tr.calculate(bars2, {}, { timeframe: '1D' } as never);
    const p = res.plots as Record<string, { value: number }[]>;
    const last = bars2.length - 1;
    const states = res.labels.slice(3);
    const ratings = [p.plot1[last].value, p.plot2[last].value, p.plot3[last].value];
    states.forEach((lb, k) => expect(lb.textColor).toBe(fromRating(ratings[k], LIME, PINK)));
  });
});

// ─── Standardized MACD Heikin-Ashi Transformed ──────────────────────────────────────────────────────────────────
describe('Standardized MACD HA: Bar Coloring (None by default), histogram colours', () => {
  const up = '#00bcd4', dn = '#fc1f1f';
  /** The original: x = (ema(close, 12) - ema(close, 26)) / ema(high - low, 26) * 100, bar z = (x[1], max, min, x),
   * z.ha() with the persistent bar, signal = ema(HA close, 9), H = HA close - signal */
  function model(b: Bar[]) {
    const n = b.length;
    const c = C(b);
    const ef = ema(c, 12), es = ema(c, 26), er = ema(b.map((x) => x.high - x.low), 26);
    const x = ef.map((f, i) => div(f - es[i], er[i]) * 100);
    const o: number[] = [], h: number[] = [], l: number[] = [], cl: number[] = [];
    let prevO = NaN; // x.o[1]: open of the HA bar before (na before the first)
    let execOc2 = NaN; // x.src('oc2') on the last bar the nz(...) branch ran
    for (let i = 0; i < n; i++) {
      const zo = i > 0 ? x[i - 1] : NaN, zc = x[i];
      const zh = Math.max(zc, zo), zl = Math.min(zc, zo);
      const c4 = (zo + zh + zl + zc) / 4;
      let open: number;
      if (!fin(prevO)) open = (zo + zc) / 2;
      else {
        open = fin(execOc2) ? execOc2 : 0;
        execOc2 = (prevO + c4) / 2;
      }
      o.push(open);
      h.push(Math.max(zh, Math.max(prevO, c4)));
      l.push(Math.min(zl, Math.min(prevO, c4)));
      cl.push(c4);
      prevO = open;
    }
    const s = ema(cl, 9);
    const hist = cl.map((v, i) => v - s[i]);
    return { o, h, l, c: cl, s, hist };
  }
  const m = model(bars);

  it('default: no bar colour; Bar Coloring input as the original', () => {
    expect(smacd.calculate(bars).barColors).toEqual([]);
    const cfg = smacd.inputConfig.find((c) => c.id === 'barColoring')!;
    expect([cfg.title, cfg.defval, cfg.options]).toEqual(['Bar Coloring', 'None', ['None', 'MidLine', 'Candles', 'Sig Cross', 'Extremities', 'Reversions']]);
  });

  it('HA candle values and the signal / histogram as the original', () => {
    const res = smacd.calculate(bars);
    const cd = res.plotCandles.candle0;
    let ok = 0;
    cd.forEach((k, i) => {
      if (![m.o[i], m.h[i], m.l[i], m.c[i]].every(fin)) return;
      ok++;
      expect([near(k.open, m.o[i]), near(k.high, m.h[i]), near(k.low, m.l[i]), near(k.close, m.c[i])]).toEqual([true, true, true, true]);
    });
    expect(ok).toBeGreaterThan(1200);
    vals(res.plots.signal as { value: number }[]).forEach((v, i) => expect(near(v, m.s[i])).toBe(true));
  });

  it('histogram: columns, #8ac3f5 above 0 / #ffa7b6 below, transparency 20 rising, 30 else', () => {
    expect(smacd.plotConfig.find((p) => p.id === 'histogram')!.style).toBe('columns');
    const hp = smacd.calculate(bars).plots.histogram as { value: number; color: string }[];
    const seen = new Set<string>();
    hp.forEach((p, i) => {
      expect(near(p.value, m.hist[i])).toBe(true);
      if (!fin(m.hist[i])) return;
      const rising = i > 0 && m.hist[i] > m.hist[i - 1];
      const want = String(pineColor.new(m.hist[i] > 0 ? '#8ac3f5' : '#ffa7b6', rising ? 20 : 30));
      seen.add(want);
      expect(p.color).toBe(want);
    });
    expect(seen.size).toBe(4);
  });

  it('every Bar Coloring mode as the original (na compares false), barcolor0', () => {
    const revt = 100;
    const fg = '#123456';
    const neutral = String(pineColor.new(fg, 25));
    const ob = m.c.map((v, i) => xunder(m.c, m.o, i) && m.h[i] > revt);
    const os = m.c.map((v, i) => xover(m.c, m.o, i) && m.l[i] < -revt);
    const rules: Record<string, (i: number) => string> = {
      MidLine: (i) => (m.c[i] > 0 ? up : dn),
      Candles: (i) => (m.c[i] > m.o[i] ? up : dn),
      'Sig Cross': (i) => (m.s[i] > m.c[i] ? dn : up),
      Extremities: (i) => (m.c[i] > revt ? dn : m.c[i] < -revt ? up : neutral),
      Reversions: (i) => (os[i] ? dn : ob[i] ? up : neutral),
    };
    expect(os.some(Boolean) && ob.some(Boolean)).toBe(true);
    for (const [mode, rule] of Object.entries(rules)) {
      const bc = smacd.calculate(bars, { barColoring: mode as never }, { foregroundColor: fg } as never).barColors;
      expect(bc.length).toBe(bars.length);
      bc.forEach((x, i) => {
        expect(x.id).toBe('barcolor0');
        expect(x.color).toBe(rule(i));
      });
      expect(new Set(bc.map((x) => x.color)).size).toBeGreaterThan(1);
    }
  });

  it('keeps the OB / OS shapes and the alerts', () => {
    const res = smacd.calculate(bars);
    expect(new Set(res.markers.map((x) => x.id))).toEqual(new Set(['shape0', 'shape1']));
    expect(res.alerts.map((a) => a.id)).toEqual(['alert0', 'alert1', 'alert2', 'alert3', 'alert4', 'alert5', 'alert6', 'alert7']);
  });
});
