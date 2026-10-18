/**
 * Community ports, drawing pass 4: the parts that differed from the originals, recomputed here independently from the
 * original formulas (Profit Maximizer, RedK RSS_WMA, Slow Heiken Ashi, Standardized MACD Heikin-Ashi, Stoch VX3,
 * TTM Squeeze Pro dots, Twin Range Filter, Weis Wave Volume), plus the output ids.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as pmax from '../../src/community/profit-maximizer';
import * as rss from '../../src/community/redk-rss-wma';
import * as sha from '../../src/community/slow-heiken-ashi';
import * as smacd from '../../src/community/standardized-macd-ha';
import * as svx from '../../src/community/stoch-vx3';
import * as ttm from '../../src/community/ttm-squeeze-pro';
import * as trf from '../../src/community/twin-range-filter';
import * as wwv from '../../src/community/weis-wave-volume';

/** Seeded random walk of daily bars with a random volume */
function walk(count: number, seed0: number, tick = 0): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const r = (v: number) => (tick > 0 ? Math.round(v / tick) * tick : v);
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = r(p + (rnd() - 0.5) * 1.5);
    p = r(Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4));
    const high = r(Math.max(o, p) + rnd() * 1.5);
    const low = r(Math.min(o, p) - rnd() * 1.5);
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(high, o, p), low: Math.min(low, o, p), close: p, volume: 1e6 * (0.3 + rnd()) });
  }
  return out;
}

const bars = walk(1300, 11);
const n = bars.length;
const O = bars.map((b) => b.open), H = bars.map((b) => b.high), L = bars.map((b) => b.low), C = bars.map((b) => b.close);
const HL2 = bars.map((b) => (b.high + b.low) / 2);

// --- Pine reference helpers (independent of the ports) ---
const fin = (v: number) => Number.isFinite(v);
const nz = (v: number, r = 0) => (fin(v) ? v : r);
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
/** ta.ema / ta.rma: seeded with the mean of the first len valid values, na values skipped */
function expAvg(src: number[], len: number, alpha: number): number[] {
  const out: number[] = [];
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!fin(v)) { out.push(NaN); continue; }
    if (!fin(prev)) {
      count++; sum += v;
      if (count === len) { prev = sum / len; out.push(prev); } else out.push(NaN);
    } else {
      prev = alpha * v + (1 - alpha) * prev;
      out.push(prev);
    }
  }
  return out;
}
const ema = (src: number[], len: number) => expAvg(src, len, 2 / (len + 1));
const rma = (src: number[], len: number) => expAvg(src, len, 1 / len);
/** ta.wma on a source that is na at the start only */
function wma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0, w = 0;
    for (let k = 0; k < len; k++) { s += src[i - k] * (len - k); w += len - k; }
    return s / w;
  });
}
const trueRange = (i: number, handleNa: boolean) => (i === 0
  ? (handleNa ? H[0] - L[0] : NaN)
  : Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
const TR = bars.map((_, i) => trueRange(i, false));
const atr = (len: number) => rma(bars.map((_, i) => trueRange(i, true)), len);
const over = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const under = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);
const times = (flags: boolean[]) => bars.filter((_, i) => flags[i]).map((b) => b.time as number);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const ofId = (r: { markers: { id?: string; time: unknown; price?: number }[] }, id: string) => r.markers.filter((m) => m.id === id);
const expectClose = (a: number[], b: number[], tol = 1e-8) => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => {
    if (!fin(b[i])) { if (fin(v)) throw new Error(`bar ${i}: ${v} instead of na`); return; }
    if (!(Math.abs(v - b[i]) <= tol * Math.max(1, Math.abs(b[i])))) throw new Error(`bar ${i}: ${v} instead of ${b[i]}`);
  });
};

describe('profit-maximizer: hl2 source, PMax and fills of the original', () => {
  /** The original's PMax on a given MA and ATR */
  function pmaxRef(ma: number[], atrArr: number[], mult: number): number[] {
    const out: number[] = [];
    let ls1 = NaN, ss1 = NaN, dir = 1;
    for (let i = 0; i < n; i++) {
      let ls = ma[i] - mult * atrArr[i];
      const lsp = fin(ls1) ? ls1 : ls;
      ls = ma[i] > lsp ? Math.max(ls, lsp) : ls;
      let ss = ma[i] + mult * atrArr[i];
      const ssp = fin(ss1) ? ss1 : ss;
      ss = ma[i] < ssp ? Math.min(ss, ssp) : ss;
      dir = dir === -1 && ma[i] > ssp ? 1 : dir === 1 && ma[i] < lsp ? -1 : dir;
      out.push(dir === 1 ? ls : ss);
      ls1 = ls; ss1 = ss;
    }
    return out;
  }
  const ma = ema(HL2, 10);
  const ref = pmaxRef(ma, atr(10), 3);
  const r = pmax.calculate(bars, { showSignalsC: true });

  it('plots the EMA of hl2 and PMax with the ATR of 10 bars', () => {
    expectClose(vals(r.plots.plot1), ma);
    expectClose(vals(r.plots.plot0), ref);
    expect(pmax.defaultInputs.src).toBe('hl2');
    expect(pmax.plotConfig.map((p) => p.title)).toEqual(['Moving Avg Line', 'PMax', '']);
    expect(pmax.plotConfig[2].display).toBe('none');
  });
  it('draws the Buy / Sell labels at PMax * 0.995 / 1.005 on the crosses (shape0-3)', () => {
    const pm = vals(r.plots.plot0);
    expect(ofId(r, 'shape0').map((m) => m.time)).toEqual(times(over(ma, ref)));
    expect(ofId(r, 'shape1').map((m) => m.time)).toEqual(times(under(ma, ref)));
    expect(ofId(r, 'shape2').map((m) => m.time)).toEqual(times(over(HL2, ref)));
    expect(ofId(r, 'shape3').map((m) => m.time)).toEqual(times(under(HL2, ref)));
    expect(ofId(r, 'shape0').length).toBeGreaterThan(3);
    for (const m of ofId(r, 'shape0')) {
      const i = bars.findIndex((b) => b.time === m.time);
      expect(m.price).toBeCloseTo(pm[i] * 0.995, 8);
    }
    for (const m of ofId(r, 'shape3')) {
      const i = bars.findIndex((b) => b.time === m.time);
      expect(m.price).toBeCloseTo(pm[i] * 1.005, 8);
    }
    expect([...new Set(pmax.calculate(bars).markers.map((m) => m.id))].sort()).toEqual(['shape0', 'shape1']);
  });
  it('fills ohlc4 to PMax, green while the MA is above PMax, red while below', () => {
    expect(r.fills!.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([
      ['plot2', 'plot0', 'UpTrend Highligter'], ['plot2', 'plot0', 'DownTrend Highligter']]);
    const [up, down] = r.fills!.map((f) => f.colors!);
    ma.forEach((m, i) => {
      expect(up[i] !== 'rgba(0,0,0,0)').toBe(m > ref[i]);
      expect(down[i] !== 'rgba(0,0,0,0)').toBe(m < ref[i]);
    });
    expectClose(vals(r.plots.plot2), bars.map((b) => (b.open + b.high + b.low + b.close) / 4));
  });
  it('follows the source in the price alerts', () => {
    expect(r.alerts[4].times).toEqual(times(over(HL2, ref)));
    expect(r.alerts[5].times).toEqual(times(under(HL2, ref)));
    expect(r.alerts[1].times).toEqual(times(over(ma, ref)));
  });
  it('SMA type with the SMA of the true range', () => {
    const r2 = pmax.calculate(bars, { maType: 'SMA', changeATR: false });
    const ma2 = sma(HL2, 10);
    expectClose(vals(r2.plots.plot0), pmaxRef(ma2, sma(TR, 10), 3));
  });
});

describe('redk-rss-wma: triple WMA of the original', () => {
  const lazy = (src: number[], len: number) => {
    const w2 = Math.round(len / 3), w1 = Math.round((len - w2) / 2), w3 = Math.trunc((len - w2) / 2);
    const l1 = wma(src, w1);
    const l2 = wma(l1.map((v) => v), w2).map((_, i) => {
      if (i < w1 - 1 + w2 - 1) return NaN;
      let s = 0, w = 0;
      for (let k = 0; k < w2; k++) { s += l1[i - k] * (w2 - k); w += w2 - k; }
      return s / w;
    });
    return l2.map((_, i) => {
      if (i < w1 + w2 + w3 - 3) return NaN;
      let s = 0, w = 0;
      for (let k = 0; k < w3; k++) { s += l2[i - k] * (w3 - k); w += w3 - k; }
      return s / w;
    });
  };
  it('combined smoothness 15 = WMA 5 / 5 / 5, 16 = 6 / 5 / 5', () => {
    expectClose(vals(rss.calculate(bars).plots.plot0), lazy(C, 15));
    expectClose(vals(rss.calculate(bars, { length: 16 }).plots.plot0), lazy(C, 16));
    expectClose(vals(rss.calculate(bars, { length: 2 }).plots.plot0), C);
    expectClose(vals(rss.calculate(bars).plots.plot1), wma(C, 15));
    expect(rss.plotConfig[1].display).toBe('none');
  });
  it('draws no swing triangles by default, at LL +/- 1 % with the signal on (shape0 / shape1)', () => {
    expect(rss.calculate(bars).markers).toEqual([]);
    const ll = lazy(C, 15);
    const upT = ll.map((v, i) => i > 0 && v > ll[i - 1]);
    const swUp = upT.map((u, i) => u && !(i > 0 && upT[i - 1]));
    const swDn = upT.map((u, i) => i > 0 && upT[i - 1] && !u);
    const r = rss.calculate(bars, { showSig: true });
    expect(ofId(r, 'shape0').map((m) => m.time)).toEqual(times(swDn));
    expect(ofId(r, 'shape1').map((m) => m.time)).toEqual(times(swUp));
    const m0 = ofId(r, 'shape0')[0];
    const i0 = bars.findIndex((b) => b.time === m0.time);
    expect(m0.price).toBeCloseTo(ll[i0] * 1.01, 8);
    expect(r.alerts[0].times).toEqual(times(swUp));
    expect(r.alerts[1].times).toEqual(times(swDn));
  });
});

describe('slow-heiken-ashi: SMA OHLC with a KAMA open', () => {
  it('candles and signal characters of the original', () => {
    const p = 6, s2 = 0.666 * 0.666; // hakamaper = 1/2 = 0: efratio 1, smooth = fastend^2
    const om = sma(O, p), hm = sma(H, p), lm = sma(L, p), cm = sma(C, p);
    const vc = om.map((v, i) => (v + hm[i] + lm[i] + cm[i]) / 4);
    const vo: number[] = [];
    let k = NaN;
    for (let i = 0; i < n; i++) {
      const x = i > 0 ? vc[i - 1] : NaN;
      const base = fin(k) ? k : x;
      k = base + s2 * (x - base);
      vo.push(k);
    }
    const vh = vc.map((c, i) => Math.max(hm[i], c, vo[i]));
    const vl = vc.map((c, i) => Math.min(lm[i], c, vo[i]));
    const r = sha.calculate(bars);
    const cd = r.plotCandles.candle0;
    expectClose(cd.map((x) => x.open), vo);
    expectClose(cd.map((x) => x.high), vh);
    expectClose(cd.map((x) => x.low), vl);
    expectClose(cd.map((x) => x.close), vc.map((v, i) => (fin(vo[i]) ? v : NaN))); // no candle without an open
    expect(fin(cd[p].open)).toBe(true);
    expect(fin(cd[p - 1].open)).toBe(false);
    cd.forEach((x, i) => { if (fin(x.open)) expect(x.color).toBe(vo[i] > vc[i] ? '#FF0000' : '#008000'); });
    const dn = vo.map((o, i) => i > 0 && o > vc[i] && vo[i - 1] < vc[i - 1]);
    const up = vo.map((o, i) => i > 0 && o < vc[i] && vo[i - 1] > vc[i - 1]);
    expect(ofId(r, 'char0').map((m) => m.time)).toEqual(times(dn));
    expect(ofId(r, 'char1').map((m) => m.time)).toEqual(times(up));
    expect(ofId(r, 'char0').length).toBeGreaterThan(3);
    const m = ofId(r, 'char1')[0];
    expect(m.price).toBe(vl[bars.findIndex((b) => b.time === m.time)]);
    expect(sha.calculate(bars, { signal: false }).markers).toEqual([]);
  });
});

describe('standardized-macd-ha: one Heikin-Ashi pass on (x[1], max, min, x)', () => {
  const x = ema(C, 12).map((f, i) => (f - ema(C, 26)[i]) / ema(bars.map((b) => b.high - b.low), 26)[i] * 100);
  // The original's ha method: persistent bar X; X.c := ohlc4(z) first; open = na(X.o) ? oc2(z) : nz(oc2(X)[1])
  // (oc2(X) evaluated only in that branch), high / low with the open of X (the HA bar before)
  const ho: number[] = [], hh: number[] = [], hl: number[] = [], hc: number[] = [];
  {
    let xo = NaN, oc2Prev = NaN;
    for (let i = 0; i < n; i++) {
      const z = [i > 0 ? x[i - 1] : NaN, Math.max(x[i], i > 0 ? x[i - 1] : NaN), Math.min(x[i], i > 0 ? x[i - 1] : NaN), x[i]];
      const c = (z[0] + z[1] + z[2] + z[3]) / 4;
      let o: number;
      if (!fin(xo)) { o = (z[0] + z[3]) / 2; oc2Prev = NaN; } else { o = nz(oc2Prev); oc2Prev = (xo + c) / 2; }
      ho.push(o); hh.push(Math.max(z[1], xo, c)); hl.push(Math.min(z[2], xo, c)); hc.push(c);
      xo = o;
    }
  }
  const sig = ema(hc, 9);
  const r = smacd.calculate(bars);
  it('candles, signal and histogram', () => {
    const cd = r.plotCandles.candle0;
    expectClose(cd.map((c) => c.close), hc.map((v, i) => (fin(ho[i]) && fin(hh[i]) ? v : NaN)));
    expectClose(cd.map((c) => c.open), ho.map((v, i) => (fin(hh[i]) ? v : NaN)));
    expectClose(cd.map((c) => c.high), hh);
    expectClose(cd.map((c) => c.low), hl);
    expectClose(vals(r.plots.signal), sig);
    expectClose(vals(r.plots.histogram), hc.map((c, i) => c - sig[i]));
    // first open from oc2 (bar 26), then nz(na) = 0 on bar 27, then the recursion
    expect(ho[26]).toBeCloseTo((x[25] + x[26]) / 2, 10);
    expect(ho[27]).toBe(0);
    expect(fin(cd[26].open)).toBe(false); // the high is na (no HA open before)
    // hollow rising candles
    cd.forEach((c, i) => { if (fin(c.open) && hc[i] > ho[i]) expect(c.color).toBe('transparent'); });
  });
  it('OB / OS triangles 40 beyond the HA high / low (shape0 / shape1), alerts and bar colours', () => {
    const ob = under(hc, ho).map((f, i) => f && hh[i] > 100);
    const os = over(hc, ho).map((f, i) => f && hl[i] < -100);
    expect(ofId(r, 'shape0').map((m) => m.time)).toEqual(times(ob));
    expect(ofId(r, 'shape1').map((m) => m.time)).toEqual(times(os));
    expect(ob.filter(Boolean).length + os.filter(Boolean).length).toBeGreaterThan(0);
    for (const m of ofId(r, 'shape0')) expect(m.price).toBeCloseTo(hh[bars.findIndex((b) => b.time === m.time)] + 40, 8);
    expect(r.alerts[0].times).toEqual(times(ob));
    expect(r.alerts[6].times).toEqual(times(over(hc, sig)));
    expect(r.barColors.every((b) => b.id === 'barcolor0')).toBe(true);
  });
});

describe('stoch-vx3: K / D 13 / 5 / 5 and the percentile rank of the Laguerre PPO', () => {
  const r = svx.calculate(bars);
  const stoch = C.map((c, i) => {
    if (i < 12) return NaN;
    const hi = Math.max(...H.slice(i - 12, i + 1)), lo = Math.min(...L.slice(i - 12, i + 1));
    return 100 * (c - lo) / (hi - lo);
  });
  const k = sma(stoch.map((v) => v), 5).map((_, i) => (i < 16 ? NaN : (stoch[i] + stoch[i - 1] + stoch[i - 2] + stoch[i - 3] + stoch[i - 4]) / 5));
  const d = k.map((_, i) => (i < 20 ? NaN : (k[i] + k[i - 1] + k[i - 2] + k[i - 3] + k[i - 4]) / 5));
  it('K, D and the circles where D crosses K', () => {
    expectClose(vals(r.plots.plot0), k);
    expectClose(vals(r.plots.plot1), d);
    const cross = d.map((v, i) => i > 0 && ((v > k[i] && d[i - 1] <= k[i - 1]) || (v < k[i] && d[i - 1] >= k[i - 1])));
    expectClose(vals(r.plots.plot3), d.map((v, i) => (cross[i] ? v : NaN)));
  });
  it('percentile rank over 144 bars of the Laguerre PPO', () => {
    const lag = (g: number) => {
      let a = 0, b = 0, c = 0, e = 0;
      return HL2.map((p) => {
        const a1 = (1 - g) * p + g * a;
        const b1 = -g * a1 + a + g * b;
        const c1 = -g * b1 + b + g * c;
        const e1 = -g * c1 + c + g * e;
        a = a1; b = b1; c = c1; e = e1;
        return (a1 + 2 * b1 + 2 * c1 + e1) / 6;
      });
    };
    const fast = lag(0.3), slow = lag(0.5);
    const ppo = fast.map((v, i) => (v - slow[i]) / slow[i] * 100);
    const rank = ppo.map((v, i) => {
      if (i < 144) return NaN;
      let cnt = 0;
      for (let j = 1; j <= 144; j++) if (ppo[i - j] <= v) cnt++;
      return cnt / 144 * 100;
    });
    expectClose(vals(r.plots.plot2), rank);
  });
  it('background black unless K >= D (bgcolor0)', () => {
    expect(r.bgColors.length).toBe(n);
    r.bgColors.forEach((b, i) => {
      expect(b.id).toBe('bgcolor0');
      expect(b.color).toBe(k[i] >= d[i] ? 'rgba(18, 142, 137, 0.20)' : 'rgba(0, 0, 0, 0.20)');
    });
  });
});

describe('ttm-squeeze-pro: squeeze dots of the original', () => {
  it('SMA basis, SMA of the true range, KC 1.0 / 1.5 / 2.0, OR of the two band tests', () => {
    const basis = sma(C, 20);
    const dev = C.map((_, i) => {
      if (i < 19) return NaN;
      const w = C.slice(i - 19, i + 1);
      const m = w.reduce((a, b) => a + b, 0) / 20;
      return 2 * Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / 20);
    });
    const devKC = sma(TR.map((v) => v), 20).map((_, i) => (i < 20 ? NaN : TR.slice(i - 19, i + 1).reduce((a, b) => a + b, 0) / 20));
    const sq = (i: number, m: number) => basis[i] - dev[i] >= basis[i] - devKC[i] * m || basis[i] + dev[i] <= basis[i] + devKC[i] * m;
    const expected = C.map((_, i) => (sq(i, 1) ? '#FF9800' : sq(i, 1.5) ? '#FF5252' : sq(i, 2) ? '#363A45' : '#4CAF50'));
    const r = ttm.calculate(bars);
    const dots = r.plots.plot1 as { value: number; color?: string }[];
    expect(dots.every((p) => p.value === 0)).toBe(true);
    expect(dots.map((p) => p.color)).toEqual(expected);
    expect(new Set(expected).size).toBeGreaterThanOrEqual(3);
    expect(dots[0].color).toBe('#4CAF50');
  });
});

describe('twin-range-filter: smooth average range of the source', () => {
  const smooth = (t: number, m: number) => ema(ema(C.map((v, i) => (i > 0 ? Math.abs(v - C[i - 1]) : NaN)), t), 2 * t - 1).map((v) => v * m);
  const s1 = smooth(27, 1.6), s2 = smooth(55, 2);
  const rng = s1.map((v, i) => (v + s2[i]) / 2);
  const filt: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = nz(i > 0 ? filt[i - 1] : NaN);
    const x = C[i], r = rng[i];
    const v = x > p ? (x - r < p ? p : x - r) : (x + r > p ? p : x + r);
    filt.push(fin(v) ? v : NaN);
  }
  it('filter and Long / Short labels (shape0 / shape1) with the defaults 27 / 1.6 / 55 / 2', () => {
    const r = trf.calculate(bars);
    // the original draws only the labels: the filter is not a plot (checked through the port's helpers)
    expect(Object.keys(r.plots)).toEqual([]);
    const s1p = trf.smoothRange(C, 27, 1.6), s2p = trf.smoothRange(C, 55, 2);
    expectClose(trf.rangeFilter(C, s1p.map((v, i) => (v + s2p[i]) / 2)), filt);
    expect(fin(filt[162])).toBe(false);
    expect(fin(filt[163])).toBe(true);
    const upw: number[] = [], dnw: number[] = [];
    filt.forEach((f, i) => {
      const f1 = i > 0 ? filt[i - 1] : NaN;
      const u = i > 0 ? upw[i - 1] : 0, d = i > 0 ? dnw[i - 1] : 0;
      upw.push(f > f1 ? u + 1 : f < f1 ? 0 : u);
      dnw.push(f < f1 ? d + 1 : f > f1 ? 0 : d);
    });
    const long: boolean[] = [], short: boolean[] = [];
    let ci = NaN;
    for (let i = 0; i < n; i++) {
      const s = C[i], s1p = i > 0 ? C[i - 1] : NaN;
      const lc = s > filt[i] && s !== s1p && fin(s1p) && upw[i] > 0;
      const sc = s < filt[i] && s !== s1p && fin(s1p) && dnw[i] > 0;
      long.push(lc && ci === -1);
      short.push(sc && ci === 1);
      ci = lc ? 1 : sc ? -1 : ci;
    }
    expect(ofId(r, 'shape0').map((m) => m.time)).toEqual(times(long));
    expect(ofId(r, 'shape1').map((m) => m.time)).toEqual(times(short));
    expect(long.filter(Boolean).length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(times(long));
    expect(r.alerts[1].times).toEqual(times(short));
  });
});

describe('weis-wave-volume: Renko wave of the original', () => {
  function ref(list: Bar[], opts: { atrLen?: number; box?: number; osc?: boolean }) {
    const hh = list.map((b) => b.high), ll = list.map((b) => b.low), cc = list.map((b) => b.close);
    const trh = list.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - cc[i - 1]), Math.abs(b.low - cc[i - 1]))));
    const atrArr = opts.atrLen ? rma(trh, opts.atrLen) : [];
    const out: number[] = [];
    let curr1 = NaN, dir1 = NaN, vol1 = NaN;
    for (let i = 0; i < list.length; i++) {
      const box = opts.atrLen ? atrArr[i] : opts.box!;
      const v0 = fin(list[i].volume as number) ? list[i].volume as number
        : (i > 0 ? Math.max(hh[i] - ll[i], Math.abs(hh[i] - cc[i - 1]), Math.abs(ll[i] - cc[i - 1])) : NaN);
      const pc = nz(curr1);
      const cur = cc[i] > pc + box ? cc[i] : cc[i] < pc - box ? cc[i] : pc;
      const dir = cur > pc ? 1 : cur < pc ? -1 : nz(dir1);
      const changed = i > 0 && dir !== dir1;
      const vol = changed ? v0 : vol1 + v0;
      out.push(opts.osc && dir < 0 ? -vol : vol);
      curr1 = cur; dir1 = dir; vol1 = vol;
    }
    return out;
  }
  it('ATR 14 box on the close, volume summed per wave', () => {
    const r = wwv.calculate(bars);
    const exp = ref(bars, { atrLen: 14 });
    expectClose(vals(r.plots.plot0), exp);
    expect(fin(exp[12])).toBe(false); // na until the first direction change
    expect(exp.filter(fin).length).toBeGreaterThan(n - 40);
    expectClose(vals(wwv.calculate(bars, { methodType: 'Traditional', methodValue: 2, isOscillating: true }).plots.plot0),
      ref(bars, { box: 2, osc: true }));
  });
  it('true range in place of a missing volume (Auto)', () => {
    const noVol = bars.slice(0, 300).map((b) => ({ ...b, volume: undefined as unknown as number }));
    expectClose(vals(wwv.calculate(noVol).plots.plot0), ref(noVol, { atrLen: 14 }));
  });
});
