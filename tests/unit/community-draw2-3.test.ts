/**
 * Community ports, second drawing pass, batch 3: the parts named by each fix recomputed here from the original
 * scripts' formulas (Pine semantics: na compares false, history na on the first bars, ta.* na until their window is
 * full) on seeded random walks (1,300 bars) and crafted bars, with the output ids of the originals.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as svx from '../../src/community/stoch-vx3';
import * as ttm from '../../src/community/ttm-squeeze-pro';
import * as trf from '../../src/community/twin-range-filter';
import * as twb from '../../src/community/trendlines-with-breaks';
import * as vmc from '../../src/community/vumanchu-swing';
import * as ibs from '../../src/community/intraday-buy-sell';
import * as phil from '../../src/community/philakone-ema-swing';

/** Seeded random walk of daily bars; `tick` rounds the prices */
function walk(count: number, seed0: number, tick = 0): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const r = (v: number) => (tick > 0 ? Math.round(v / tick) * tick : v);
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = r(p + (rnd() - 0.5) * 1.5);
    p = r(Math.max(5, o + Math.sin(i / 17) * 1.1 + (rnd() - 0.5) * 4));
    const high = r(Math.max(o, p) + rnd() * 1.5);
    const low = r(Math.min(o, p) - rnd() * 1.5);
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(high, o, p), low: Math.min(low, o, p), close: p, volume: 1e6 });
  }
  return out;
}
const bars = walk(1300, 11);
const bars2 = walk(1300, 5150);
const ticked = walk(1300, 77, 1);
const constant: Bar[] = Array.from({ length: 200 }, (_, i) => ({ time: 1577836800 + i * 86400, open: 50, high: 50, low: 50, close: 50, volume: 1 }));

// --- Pine reference helpers (independent of the ports) ---
const fin = (v: number) => Number.isFinite(v);
const C = (b: Bar[]) => b.map((x) => x.close);
const H = (b: Bar[]) => b.map((x) => x.high);
const Lo = (b: Bar[]) => b.map((x) => x.low);
const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
/** ta.ema / ta.rma: seeded with the mean of the first len values once they exist, na before (na inputs at the start) */
function smooth(src: number[], len: number, alpha: number): number[] {
  const out: number[] = [];
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!fin(v)) { out.push(isNaN(prev) ? NaN : prev); continue; }
    if (isNaN(prev)) {
      count++; sum += v;
      if (count === len) { prev = sum / len; out.push(prev); } else out.push(NaN);
    } else {
      prev = alpha * v + (1 - alpha) * prev;
      out.push(prev);
    }
  }
  return out;
}
const ema = (src: number[], len: number) => smooth(src, len, 2 / (len + 1));
const rma = (src: number[], len: number) => smooth(src, len, 1 / len);
function rsi(src: number[], len: number): number[] {
  const ch = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const up = rma(ch.map((c) => (isNaN(c) ? NaN : Math.max(c, 0))), len);
  const dn = rma(ch.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0))), len);
  return up.map((u, i) => (isNaN(u) || isNaN(dn[i]) ? NaN : dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / dn[i])));
}
const highest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.max(...src.slice(i - len + 1, i + 1))));
const lowest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.min(...src.slice(i - len + 1, i + 1))));
/** ta.linreg(src, len, 0): least squares line over the last len values, at the newest bar */
function linreg(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let k = 0; k < len; k++) {
      const y = src[i - len + 1 + k];
      if (!fin(y)) return NaN;
      sx += k; sy += y; sxy += k * y; sxx += k * k;
    }
    const slope = (len * sxy - sx * sy) / (len * sxx - sx * sx);
    const icpt = (sy - slope * sx) / len;
    return icpt + slope * (len - 1);
  });
}
function atr(b: Bar[], len: number): number[] {
  const tr = b.map((x, i) => (i === 0 ? x.high - x.low
    : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close))));
  return rma(tr, len);
}
function variance(src: number[], len: number): number[] {
  const m = sma(src, len);
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += (src[k] - m[i]) ** 2;
    return s / len;
  });
}
/** ta.pivothigh / ta.pivotlow(src, L, R) on the confirming bar: equal values allowed on the left only */
function pivot(src: number[], L: number, R: number, high: boolean): number[] {
  return src.map((_, i) => {
    const p = i - R;
    if (p - L < 0) return NaN;
    const v = src[p];
    for (let k = p - L; k <= i; k++) {
      if (k === p) continue;
      if (high ? (k < p ? src[k] > v : src[k] >= v) : (k < p ? src[k] < v : src[k] <= v)) return NaN;
    }
    return v;
  });
}
const vals = (s: { value: number }[]) => s.map((p) => p.value);
const cols = (s: { color?: string }[]) => s.map((p) => p.color);
function expectSeries(actual: number[], expected: number[], label: string) {
  expect(actual.length, label).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (isNaN(expected[i])) expect(actual[i], `${label} @${i}`).toBeNaN();
    else expect(actual[i], `${label} @${i}`).toBeCloseTo(expected[i], 8);
  }
}
type Mk = { id?: string; time: unknown };
const timesOf = (ms: Mk[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number).sort((a, b) => a - b);
const timesAt = (b: Bar[], flags: boolean[]) => flags.flatMap((f, i) => (f ? [b[i].time as number] : []));

// --- Stoch VX3 ---
describe('stoch-vx3: hline(80 / 20, color = red, linewidth = 2)', () => {
  it('both levels red, width 2, in the default dashed style; fill and background kept', () => {
    const r = svx.calculate(bars);
    const h = r.hlines as { value: number; options: { color: string; linewidth: number; linestyle: string } }[];
    expect(h.map((x) => x.value)).toEqual([80, 20]);
    for (const x of h) expect([x.options.color, x.options.linewidth, x.options.linestyle]).toEqual(['#FF0000', 2, 'dashed']);
    expect(r.fills).toHaveLength(1);
    expect(r.bgColors).toHaveLength(bars.length);
    expect(r.bgColors.every((b) => b.id === 'bgcolor0')).toBe(true);
  });
});

// --- TTM Squeeze Pro ---
function ttmMom(b: Bar[], len = 20) {
  const c = C(b);
  const mid = highest(H(b), len).map((hh, i) => ((hh + lowest(Lo(b), len)[i]) / 2 + sma(c, len)[i]) / 2);
  return linreg(c.map((v, i) => v - mid[i]), len);
}
describe('ttm-squeeze-pro: momentum column colours', () => {
  const AQUA = '#00BCD4', BLUE = '#2962ff', RED = '#FF5252', YELLOW = '#FFEB3B';
  for (const [name, b] of [['walk', bars], ['walk 2', bars2], ['ticked', ticked]] as const) {
    it(`mom > 0 ? (mom > nz(mom[1]) ? aqua : #2962ff) : (mom < nz(mom[1]) ? red : yellow) (${name})`, () => {
      const mom = ttmMom(b);
      const r = ttm.calculate(b);
      expectSeries(vals(r.plots.plot0), mom, 'MOM');
      const c = cols(r.plots.plot0 as { color?: string }[]);
      const seen = new Set<string>();
      mom.forEach((m, i) => {
        if (!fin(m)) return;
        const p = fin(at(mom, i - 1)) ? mom[i - 1] : 0;
        const want = m > 0 ? (m > p ? AQUA : BLUE) : (m < p ? RED : YELLOW);
        expect(c[i], `colour @${i}`).toBe(want);
        seen.add(want);
      });
      expect(seen.size).toBeGreaterThanOrEqual(4);
    });
  }
  it('first momentum bar compares with 0 (nz of na), flat bars give yellow', () => {
    const mom = ttmMom(bars);
    const first = mom.findIndex(fin);
    expect(first).toBe(38);
    const c = cols(ttm.calculate(bars).plots.plot0 as { color?: string }[]);
    expect(c[first]).toBe(mom[first] > 0 ? AQUA : RED);
    const rc = ttm.calculate(constant);
    const v = vals(rc.plots.plot0);
    const cc = cols(rc.plots.plot0 as { color?: string }[]);
    for (let i = 38; i < constant.length; i++) {
      expect(v[i]).toBeCloseTo(0, 8);
      expect(cc[i]).toBe(Math.abs(v[i]) < 1e-10 ? YELLOW : cc[i]);
    }
  });
  it('alert() calls kept', () => {
    expect(ttm.hasAlertFunction).toBe(true);
    expect(Array.isArray(ttm.calculate(bars).alertCalls)).toBe(true);
  });
});

// --- Twin Range Filter ---
function trfRef(b: Bar[], p1 = 27, m1 = 1.6, p2 = 55, m2 = 2) {
  const x = C(b), n = b.length;
  const smr = (t: number, m: number) => ema(ema(x.map((v, i) => (i > 0 ? Math.abs(v - x[i - 1]) : NaN)), t), t * 2 - 1).map((v) => v * m);
  const s1 = smr(p1, m1), s2 = smr(p2, m2);
  const r = s1.map((v, i) => (v + s2[i]) / 2);
  const filt: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = fin(at(filt, i - 1)) ? filt[i - 1] : 0;
    const v = x[i] > prev ? (x[i] - r[i] < prev ? prev : x[i] - r[i]) : (x[i] + r[i] > prev ? prev : x[i] + r[i]);
    filt.push(fin(v) ? v : NaN);
  }
  let up = 0, dn = 0, ci = NaN;
  const long: boolean[] = [], short: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const f1 = at(filt, i - 1);
    up = filt[i] > f1 ? up + 1 : filt[i] < f1 ? 0 : up;
    dn = filt[i] < f1 ? dn + 1 : filt[i] > f1 ? 0 : dn;
    const s1v = at(x, i - 1);
    const lc = (x[i] > filt[i] && x[i] > s1v && up > 0) || (x[i] > filt[i] && x[i] < s1v && up > 0);
    const sc = (x[i] < filt[i] && x[i] < s1v && dn > 0) || (x[i] < filt[i] && x[i] > s1v && dn > 0);
    long.push(lc && ci === -1);
    short.push(sc && ci === 1);
    ci = lc ? 1 : sc ? -1 : ci;
  }
  return { long, short };
}
describe('twin-range-filter: only the Long / Short labels', () => {
  for (const [name, b] of [['walk', bars], ['ticked', ticked]] as const) {
    it(`no plots, fills or bar colours; labels shape0 / shape1 and alerts as the original (${name})`, () => {
      const r = trf.calculate(b) as Record<string, unknown> & ReturnType<typeof trf.calculate>;
      expect(trf.plotConfig).toEqual([]);
      expect(Object.keys(r.plots)).toEqual([]);
      expect(r.fills).toBeUndefined();
      expect(r.barColors).toBeUndefined();
      const ref = trfRef(b);
      expect(ref.long.some(Boolean) && ref.short.some(Boolean)).toBe(true);
      expect(timesOf(r.markers, 'shape0')).toEqual(timesAt(b, ref.long));
      expect(timesOf(r.markers, 'shape1')).toEqual(timesAt(b, ref.short));
      expect(r.markers.every((m) => (m.id === 'shape0' ? m.text === 'Long' && m.position === 'belowBar' : m.text === 'Short' && m.position === 'aboveBar'))).toBe(true);
      expect(r.alerts.map((a) => a.id)).toEqual(['alert0', 'alert1']);
      expect(r.alerts[0].times).toEqual(timesAt(b, ref.long));
      expect(r.alerts[1].times).toEqual(timesAt(b, ref.short));
    });
  }
});

// --- Trendlines with Breaks ---
function twbRef(b: Bar[], length = 14, mult = 1, method = 'Atr') {
  const c = C(b), n = b.length, idx = b.map((_, i) => i);
  let slope: number[];
  if (method === 'Atr') slope = atr(b, length).map((v) => v / length * mult);
  else if (method === 'Stdev') slope = variance(c, length).map((v) => Math.sqrt(v) / length * mult);
  else {
    const a = sma(c.map((v, i) => v * i), length), s = sma(c, length), m = sma(idx, length), v = variance(idx, length);
    slope = b.map((_, i) => Math.abs(a[i] - s[i] * m[i]) / v[i] / 2 * mult);
  }
  const ph = pivot(H(b), length, length, true), pl = pivot(Lo(b), length, length, false);
  const yes = (v: number) => fin(v) && v !== 0;
  let upper = 0, lower = 0, sph = 0, spl = 0, lastPh = -1, lastPl = -1;
  const U: number[] = [], L: number[] = [], SPH: number[] = [], SPL: number[] = [];
  for (let i = 0; i < n; i++) {
    sph = yes(ph[i]) ? slope[i] : sph;
    spl = yes(pl[i]) ? slope[i] : spl;
    upper = yes(ph[i]) ? ph[i] : upper - sph;
    lower = yes(pl[i]) ? pl[i] : lower + spl;
    if (yes(ph[i])) lastPh = i;
    if (yes(pl[i])) lastPl = i;
    U.push(upper); L.push(lower); SPH.push(sph); SPL.push(spl);
  }
  return { ph: ph.map(yes), pl: pl.map(yes), U, L, SPH, SPL, slope, lastPh, lastPl };
}
describe('trendlines-with-breaks: backpaint', () => {
  const TEAL = '#00897B', RED = '#FF5252';
  const cases: [string, Bar[], Partial<twb.TrendlinesWithBreaksInputs>][] = [
    ['Atr', bars, {}], ['Stdev', bars2, { calcMethod: 'Stdev' }], ['Linreg', bars, { calcMethod: 'Linreg', mult: 0.5 }],
    ['short', ticked, { length: 4 }],
  ];
  it('backpaint input: title, default on, tooltip', () => {
    expect(twb.defaultInputs.backpaint).toBe(true);
    const ic = twb.inputConfig.find((x) => x.id === 'backpaint')!;
    expect([ic.type, ic.title, ic.defval]).toEqual(['bool', 'backpaint', true]);
    expect(ic.tooltip).toContain('Backpainting offset displayed elements in the past');
  });
  for (const [name, b, inp] of cases) {
    for (const backpaint of [true, false]) {
      it(`plots and extended lines (${name}, backpaint ${backpaint ? 'on' : 'off'})`, () => {
        const cfg = { ...twb.defaultInputs, ...inp, backpaint };
        const len = cfg.length, n = b.length, off = backpaint ? len : 0;
        const ref = twbRef(b, len, cfg.mult, cfg.calcMethod);
        const r = twb.calculate(b, { ...inp, backpaint });
        const up = backpaint ? ref.U : ref.U.map((u, i) => u - ref.SPH[i] * len);
        const lo = backpaint ? ref.L : ref.L.map((l, i) => l + ref.SPL[i] * len);
        const wantU = b.map((_, j) => (j + off < n ? up[j + off] : NaN));
        const wantL = b.map((_, j) => (j + off < n ? lo[j + off] : NaN));
        expectSeries(vals(r.plots.plot0), wantU, 'Upper');
        expectSeries(vals(r.plots.plot1), wantL, 'Lower');
        const cu = cols(r.plots.plot0 as { color?: string }[]), cl = cols(r.plots.plot1 as { color?: string }[]);
        for (let j = 0; j + off < n; j++) {
          expect(cu[j], `Upper colour @${j}`).toBe(ref.ph[j + off] ? 'transparent' : TEAL);
          expect(cl[j], `Lower colour @${j}`).toBe(ref.pl[j + off] ? 'transparent' : RED);
        }
        // before the first pivot the var values are 0
        expect(vals(r.plots.plot0)[0]).toBe(0);
        expect(vals(r.plots.plot1)[0]).toBe(0);
        // extended lines of the last pivots
        const t = (k: number) => 1577836800 + k * 86400;
        expect(r.lines).toHaveLength(2);
        const [ul, dl] = r.lines;
        const p = ref.lastPh, q = ref.lastPl;
        expect([ul.time1, ul.time2, ul.color, ul.style, ul.extend]).toEqual([t(p - off), t(p - off + 1), TEAL, 'dashed', 'right']);
        expect(ul.price1).toBeCloseTo(backpaint ? ref.U[p] : ref.U[p] - ref.SPH[p] * len, 8);
        expect(ul.price2).toBeCloseTo(backpaint ? ref.U[p] - ref.slope[p] : ref.U[p] - ref.SPH[p] * (len + 1), 8);
        expect([dl.time1, dl.time2, dl.color, dl.style, dl.extend]).toEqual([t(q - off), t(q - off + 1), RED, 'dashed', 'right']);
        expect(dl.price1).toBeCloseTo(backpaint ? ref.L[q] : ref.L[q] + ref.SPL[q] * len, 8);
        expect(dl.price2).toBeCloseTo(backpaint ? ref.L[q] + ref.slope[q] : ref.L[q] + ref.SPL[q] * (len + 1), 8);
        // labels are not offset, coloured as the lines
        for (const m of r.markers) expect(m.color).toBe(m.id === 'shape0' ? TEAL : RED);
        expect(new Set(r.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1']));
      });
    }
  }
  it('a pivot on the last bar with backpaint off: line from the last bar to the next (future) bar', () => {
    // a high on bar n - 1 - L that is higher than all bars around: confirmed on the last bar
    const L = 3;
    const b: Bar[] = Array.from({ length: 30 }, (_, i) => {
      const hi = i === 26 ? 20 : 10 + (i % 2);
      return { time: 1577836800 + i * 86400, open: 9, high: hi, low: 8 - (i % 3 === 0 ? 1 : 0), close: 9.5, volume: 1 };
    });
    const r = twb.calculate(b, { length: L, backpaint: false });
    const ul = r.lines.find((x) => x.color === TEAL)!;
    expect(ul.time1).toBe(b[29].time);
    expect(ul.time2).toBe((b[29].time as number) + 86400);
    const rb = twb.calculate(b, { length: L });
    const ub = rb.lines.find((x) => x.color === TEAL)!;
    expect([ub.time1, ub.time2, ub.price1]).toEqual([b[26].time, b[27].time, 20]);
    expect(vals(rb.plots.plot0).slice(30 - L).every((v) => isNaN(v))).toBe(true);
  });
});

// --- VuManChu Swing ---
function vmcFdir(b: Bar[], per = 20, qty = 3.5) {
  const x = C(b), n = b.length;
  const r = ema(ema(x.map((v, i) => (i > 0 ? Math.abs(v - x[i - 1]) : NaN)), per), per * 2 - 1).map((v) => v * qty);
  const filt: number[] = [];
  let rf = x[0];
  for (let i = 0; i < n; i++) {
    const prev = rf;
    if (x[i] - r[i] > prev) rf = x[i] - r[i];
    if (x[i] + r[i] < prev) rf = x[i] + r[i];
    filt.push(rf);
  }
  let fdir = 0;
  return filt.map((f, i) => (fdir = f > at(filt, i - 1) ? 1 : f < at(filt, i - 1) ? -1 : fdir));
}
describe('vumanchu-swing: filter colour at transparency 67', () => {
  for (const [name, b] of [['walk', bars], ['ticked', ticked]] as const) {
    it(`#05ff9b / #ff0583 / #cccccc at 33 % opacity (${name})`, () => {
      const fdir = vmcFdir(b);
      const c = cols(vmc.calculate(b).plots.plot0 as { color?: string }[]);
      fdir.forEach((d, i) => expect(c[i], `@${i}`).toBe(d === 1 ? 'rgba(5,255,155,0.33)' : d === -1 ? 'rgba(255,5,131,0.33)' : 'rgba(204,204,204,0.33)'));
      expect(new Set(c).size).toBe(3);
    });
  }
  it('ids kept', () => {
    const r = vmc.calculate(bars, { useBarColor: true });
    expect(new Set(r.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1']));
    expect(r.barColors.every((x) => x.id === 'barcolor0')).toBe(true);
    expect(r.alerts.map((a) => a.id)).toEqual(['alert0', 'alert1']);
  });
});

// --- Intraday BUY_SELL ---
describe('intraday-buy-sell: SMA colour', () => {
  const YELLOW = 'rgba(255,235,59,0.7)', LIME = 'rgba(0,230,118,0.7)', RED = 'rgba(255,82,82,0.7)';
  const cases: [string, Bar[], Partial<ibs.IntradayBuySellInputs>][] = [
    ['default', bars, {}], ['short', bars2, { rsiLength: 3, smaLength: 5 }], ['ticked', ticked, { smaLength: 10 }],
  ];
  for (const [name, b, inp] of cases) {
    it(`rs >= hl or rs <= ll ? yellow : low > sma ? lime : high < sma ? red : yellow, transparency 30 (${name})`, () => {
      const cfg = { ...ibs.defaultInputs, ...inp };
      const s = sma(C(b), cfg.smaLength), rs = rsi(C(b), cfg.rsiLength);
      const r = ibs.calculate(b, inp);
      expectSeries(vals(r.plots.sma), s, 'SMA');
      const c = cols(r.plots.sma as { color?: string }[]);
      const seen = new Set<string>();
      s.forEach((v, i) => {
        if (!fin(v)) return;
        const want = rs[i] >= cfg.rsiHL || rs[i] <= cfg.rsiLL ? YELLOW : b[i].low > v ? LIME : b[i].high < v ? RED : YELLOW;
        expect(c[i], `@${i}`).toBe(want);
        seen.add(want);
      });
      expect(seen.size).toBe(3);
    });
  }
  it('ids kept', () => {
    const r = ibs.calculate(bars2, { rsiLength: 3, smaLength: 5 });
    expect(new Set(r.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1', 'shape2', 'shape3']));
    expect(r.barColors.every((x) => x.id === 'barcolor0')).toBe(true);
    expect(r.alerts.map((a) => a.id)).toEqual(['alert0', 'alert1', 'alert2', 'alert3', 'alert4', 'alert5']);
  });
});

// --- Philakone 55 EMA Swing ---
describe('philakone-ema-swing: MA colours', () => {
  it('red / orange / yellow / lime, widths 1 to 4', () => {
    expect(phil.plotConfig.map((p) => [p.color, p.lineWidth])).toEqual([['#FF5252', 1], ['#FF9800', 2], ['#FFEB3B', 3], ['#00E676', 4]]);
    const r = phil.calculate(bars);
    [8, 13, 21, 55].forEach((len, k) => expectSeries(vals(r.plots[`plot${k}`]), ema(C(bars), len), `EMA ${len}`));
    for (const k of [0, 1, 2, 3]) expect((r.plots[`plot${k}`] as { color?: string }[]).every((p) => p.color === undefined)).toBe(true);
    expect(new Set(r.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1']));
  });
});
