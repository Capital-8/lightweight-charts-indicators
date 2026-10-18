/**
 * Community ports, drawing pass 7: the drawings named by each fix are recomputed here from the original scripts'
 * formulas (Pine semantics: na compares false, history na on the first bars, ta.* na until their window is full) on
 * seeded random walks (1,300 bars) and on crafted bars, with the output ids of the originals.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as ibs from '../../src/community/intraday-buy-sell';
import * as sli from '../../src/community/scalping-line';
import * as twb from '../../src/community/trendlines-with-breaks';
import * as vmc from '../../src/community/vumanchu-swing';
import * as iso from '../../src/community/isolated-peak-bottom';
import * as phil from '../../src/community/philakone-ema-swing';
import * as cdl from '../../src/community/all-candlestick-patterns';
import * as trm from '../../src/community/traders-reality-main';

/** Seeded random walk of daily bars with a random volume; `tick` rounds the prices */
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
    const volume = Math.round(1e6 * (0.3 + rnd() * rnd() * 4));
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(high, o, p), low: Math.min(low, o, p), close: p, volume });
  }
  return out;
}
const fromOhlc = (rows: number[][]): Bar[] => rows.map(([o, h, l, c], i) => ({ time: 1577836800 + i * 86400, open: o, high: h, low: l, close: c, volume: 1e6 }));

const bars = walk(1300, 7);
const bars2 = walk(1300, 4242);
const flat = walk(1300, 99, 1);

// --- Pine reference helpers (independent of the ports) ---
const fin = (v: number) => Number.isFinite(v);
/** ta.sma: na unless the last len values exist */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
/** ta.ema / ta.rma: na until the len-th valid value (seeded with their mean), na on na bars */
function smooth(src: number[], len: number, alpha: number): number[] {
  const out: number[] = [];
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!fin(v)) { out.push(NaN); continue; }
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
function atr(b: Bar[], len: number): number[] {
  const tr = b.map((x, i) => (i === 0 ? x.high - x.low
    : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close))));
  return rma(tr, len);
}
/** ta.variance (biased) / ta.stdev over the last len values */
function variance(src: number[], len: number): number[] {
  const m = sma(src, len);
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += (src[k] - m[i]) ** 2;
    return s / len;
  });
}
/** ta.pivothigh / ta.pivotlow(src, L, R) on the bar that confirms it: equal values allowed on the left only */
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
const crossover = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
const crossunder = (a: number[], b: number[], i: number) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];
const O = (b: Bar[]) => b.map((x) => x.open);
const H = (b: Bar[]) => b.map((x) => x.high);
const Lo = (b: Bar[]) => b.map((x) => x.low);
const C = (b: Bar[]) => b.map((x) => x.close);
const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
const vals = (s: { value: number }[]) => s.map((p) => p.value);
function expectSeries(actual: number[], expected: number[], label: string) {
  expect(actual.length, label).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (isNaN(expected[i])) expect(actual[i], `${label} @${i}`).toBeNaN();
    else expect(actual[i], `${label} @${i}`).toBeCloseTo(expected[i], 8);
  }
}
type Mk = { id?: string; time: unknown; price?: number };
const timesOf = (ms: Mk[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number).sort((a, b) => a - b);
const timesAt = (b: Bar[], flags: boolean[], offset = 0) =>
  flags.flatMap((f, i) => (f ? [b[i - offset].time as number] : [])).sort((a, b) => a - b);

// --- Intraday BUY_SELL ---
function ibsRef(b: Bar[], rsiLen = 14, hl = 80, ll = 20, smaLen = 70) {
  const c = C(b), o = O(b), h = H(b), l = Lo(b);
  const rs = rsi(c, rsiLen), s1 = sma(c, smaLen);
  const c1 = c.map((_, i) => at(c, i - 1)), l1 = l.map((_, i) => at(l, i - 1));
  const hlv = b.map(() => hl), llv = b.map(() => ll);
  const BUY = b.map((_, i) => crossover(c1, s1, i) && at(c, i - 1) > at(o, i - 1) && h[i] > at(h, i - 1) && c[i] > o[i]);
  const SELL = b.map((_, i) => crossunder(l1, s1, i) && at(c, i - 1) < at(o, i - 1) && l[i] < at(l, i - 1) && c[i] < o[i]);
  const hlrev = b.map((_, i) => crossunder(rs, hlv, i));
  const llrev = b.map((_, i) => crossover(rs, llv, i) && o[i] < c[i]);
  return { BUY, SELL, hlrev, llrev, s1 };
}
describe('intraday-buy-sell', () => {
  for (const [name, b, inp] of [['default', bars, {}], ['short lengths', bars2, { rsiLength: 3, smaLength: 5 }], ['flat', flat, {}]] as const) {
    it(`markers and bar colours on every bar of the original's conditions (${name})`, () => {
      const cfg = { ...ibs.defaultInputs, ...inp };
      const ref = ibsRef(b, cfg.rsiLength, cfg.rsiHL, cfg.rsiLL, cfg.smaLength);
      const r = ibs.calculate(b, inp);
      expect(timesOf(r.markers, 'shape0')).toEqual(timesAt(b, ref.SELL));
      expect(timesOf(r.markers, 'shape1')).toEqual(timesAt(b, ref.BUY));
      expect(timesOf(r.markers, 'shape2')).toEqual(timesAt(b, ref.hlrev));
      expect(timesOf(r.markers, 'shape3')).toEqual(timesAt(b, ref.llrev));
      expect(r.markers.every((m) => ['shape0', 'shape1', 'shape2', 'shape3'].includes(m.id as string))).toBe(true);
      const bc = b.map((_, i) => (ref.BUY[i] ? '#4CAF50' : ref.SELL[i] ? 'rgba(136,14,79,0.7)' : ref.hlrev[i] || ref.llrev[i] ? '#FFEB3B' : null));
      expect(r.barColors.map((x) => [x.time, x.color])).toEqual(bc.flatMap((x, i) => (x ? [[b[i].time, x]] : [])));
      expect(r.barColors.every((x) => x.id === 'barcolor0')).toBe(true);
      // the alerts follow the same flags
      expect(r.alerts[2].times).toEqual(timesAt(b, ref.BUY));
      expect(r.alerts[3].times).toEqual(timesAt(b, ref.SELL));
      // the SMA plot from bar smaLength - 1
      expectSeries(vals(r.plots.sma), ref.s1, 'sma');
    });
  }
  it('signals can show right after the SMA warm-up (before the old smaLength + 1 start)', () => {
    let found = false;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const b = walk(80, seed);
      const ref = ibsRef(b, 14, 80, 20, 5);
      const first = ref.BUY.findIndex((x, i) => x || ref.SELL[i]);
      if (first >= 0 && first < 6) {
        const r = ibs.calculate(b, { smaLength: 5 });
        expect(r.markers.some((m) => m.time === b[first].time && (m.id === 'shape0' || m.id === 'shape1'))).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

// --- Scalping Line ---
function sliRef(b: Bar[], percent = 1, mainPeriod = 100, signalPeriod = 7) {
  const c = C(b);
  const MA = sma(sma(c, Math.ceil(mainPeriod / 2)), Math.floor(mainPeriod / 2) + 1);
  const ssMA = MA.map((m, i) => (m > c[i] + m * percent / 100 ? m : m < c[i] - m * percent / 100 ? m : c[i]));
  const sig = sma(c, signalPeriod);
  return sig.map((s, i) => s - ssMA[i]);
}
describe('scalping-line', () => {
  for (const [name, b] of [['walk', bars], ['flat', flat]] as const) {
    it(`ScalpLine from bar signalPeriod - 1, zero line from bar 0 (${name})`, () => {
      const ref = sliRef(b);
      const r = sli.calculate(b);
      expectSeries(vals(r.plots.plot0), ref, 'SLI');
      expect(ref.findIndex((v) => fin(v))).toBe(6);
      expect(vals(r.plots.plot1).every((v) => v === 0)).toBe(true);
      const zero = b.map(() => 0);
      expect(r.alerts[0].times).toEqual(timesAt(b, b.map((_, i) => crossover(ref, zero, i))));
      expect(r.alerts[1].times).toEqual(timesAt(b, b.map((_, i) => crossunder(ref, zero, i))));
      const fc = (r.fills as { colors: string[] }[])[0].colors;
      ref.forEach((v, i) => expect(fc[i]).toBe(isNaN(v) ? 'transparent' : v >= 0 ? 'rgba(0,128,0,0.2)' : 'rgba(255,0,0,0.2)'));
    });
  }
});

// --- Trendlines with Breaks ---
function twbRef(b: Bar[], length = 14, mult = 1, method = 'Atr') {
  const c = C(b), n = b.length;
  const idx = b.map((_, i) => i);
  let slope: number[];
  if (method === 'Atr') slope = atr(b, length).map((v) => v / length * mult);
  else if (method === 'Stdev') slope = variance(c, length).map((v) => Math.sqrt(v) / length * mult);
  else {
    const a = sma(c.map((v, i) => v * i), length), s = sma(c, length), m = sma(idx, length), v = variance(idx, length);
    slope = b.map((_, i) => Math.abs(a[i] - s[i] * m[i]) / v[i] / 2 * mult);
  }
  const ph = pivot(H(b), length, length, true), pl = pivot(Lo(b), length, length, false);
  const yes = (v: number) => fin(v) && v !== 0;
  let upper = 0, lower = 0, sph = 0, spl = 0, upos = 0, dnos = 0;
  const up: boolean[] = [], dn: boolean[] = [];
  for (let i = 0; i < n; i++) {
    sph = yes(ph[i]) ? slope[i] : sph;
    spl = yes(pl[i]) ? slope[i] : spl;
    upper = yes(ph[i]) ? ph[i] : upper - sph;
    lower = yes(pl[i]) ? pl[i] : lower + spl;
    const pu = upos, pd = dnos;
    upos = yes(ph[i]) ? 0 : c[i] > upper - sph * length ? 1 : upos;
    dnos = yes(pl[i]) ? 0 : c[i] < lower + spl * length ? 1 : dnos;
    up.push(i > 0 && upos > pu);
    dn.push(i > 0 && dnos > pd);
  }
  return { up, dn };
}
describe('trendlines-with-breaks', () => {
  const cases: [string, Bar[], Partial<twb.TrendlinesWithBreaksInputs>][] = [
    ['Atr', bars, {}], ['Stdev', bars2, { calcMethod: 'Stdev' }], ['Linreg', bars, { calcMethod: 'Linreg' }],
    ['short Atr', flat, { length: 3 }], ['short Linreg', bars2, { length: 4, calcMethod: 'Linreg', mult: 0.5 }],
  ];
  for (const [name, b, inp] of cases) {
    it(`B labels at the low / high on every bar where upos / dnos rise (${name})`, () => {
      const cfg = { ...twb.defaultInputs, ...inp };
      const ref = twbRef(b, cfg.length, cfg.mult, cfg.calcMethod);
      const r = twb.calculate(b, inp);
      expect(timesOf(r.markers, 'shape0')).toEqual(timesAt(b, ref.up));
      expect(timesOf(r.markers, 'shape1')).toEqual(timesAt(b, ref.dn));
      expect(r.markers.length).toBe(ref.up.filter(Boolean).length + ref.dn.filter(Boolean).length);
      for (const m of r.markers) {
        const i = b.findIndex((x) => x.time === m.time);
        if (m.id === 'shape0') expect([m.position, m.price, m.shape, m.text]).toEqual(['atPriceBottom', b[i].low, 'labelUp', 'B']);
        else expect([m.position, m.price, m.shape, m.text]).toEqual(['atPriceTop', b[i].high, 'labelDown', 'B']);
      }
      expect(r.alerts[0].times).toEqual(timesAt(b, ref.up));
      expect(r.alerts[1].times).toEqual(timesAt(b, ref.dn));
    });
  }
  it('the first label can come on the bar after the first pivot (bar 2 x length + 1)', () => {
    const ref = twbRef(flat, 3);
    const r = twb.calculate(flat, { length: 3 });
    expect(ref.up.some(Boolean) || ref.dn.some(Boolean)).toBe(true);
    const first = Math.min(...[ref.up.indexOf(true), ref.dn.indexOf(true)].filter((x) => x >= 0));
    expect(first).toBeGreaterThan(6);
    expect(r.markers.some((m) => m.time === flat[first].time)).toBe(true);
  });
});

// --- VuManChu Swing (Range Filter - B&S Signals) ---
function vmcRef(b: Bar[], per = 20, qty = 3.5) {
  const x = C(b), n = b.length;
  const avrng = ema(x.map((v, i) => (i > 0 ? Math.abs(v - x[i - 1]) : NaN)), per);
  const r = ema(avrng, per * 2 - 1).map((v) => v * qty);
  const filt: number[] = [], hb: number[] = [], lb: number[] = [];
  let rf = x[0];
  for (let i = 0; i < n; i++) {
    const prev = rf;
    if (x[i] - r[i] > prev) rf = x[i] - r[i];
    if (x[i] + r[i] < prev) rf = x[i] + r[i];
    filt.push(rf); hb.push(rf + r[i]); lb.push(rf - r[i]);
  }
  let fdir = 0, condIni = 0;
  const long: boolean[] = [], short: boolean[] = [], up: boolean[] = [], dn: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const f1 = at(filt, i - 1), s1 = at(x, i - 1);
    fdir = filt[i] > f1 ? 1 : filt[i] < f1 ? -1 : fdir;
    const upward = fdir === 1 ? 1 : 0, downward = fdir === -1 ? 1 : 0;
    const lc = x[i] > filt[i] && x[i] > s1 && upward > 0 || x[i] > filt[i] && x[i] < s1 && upward > 0;
    const sc = x[i] < filt[i] && x[i] < s1 && downward > 0 || x[i] < filt[i] && x[i] > s1 && downward > 0;
    const prev = condIni;
    condIni = lc ? 1 : sc ? -1 : prev;
    long.push(lc && prev === -1);
    short.push(sc && prev === 1);
    up.push(upward > 0); dn.push(downward > 0);
  }
  return { filt, hb, lb, long, short, up, dn };
}
describe('vumanchu-swing', () => {
  for (const [name, b, inp] of [['walk', bars, {}], ['flat', flat, {}], ['short period', bars2, { swingPeriod: 5, swingMultiplier: 1.5 }]] as const) {
    it(`filter, bands and BUY / SELL labels as the original (${name})`, () => {
      const cfg = { ...vmc.defaultInputs, ...inp };
      const ref = vmcRef(b, cfg.swingPeriod, cfg.swingMultiplier);
      const r = vmc.calculate(b, inp);
      expectSeries(vals(r.plots.plot0), ref.filt, 'filter');
      expectSeries(vals(r.plots.plot1), ref.hb, 'high band');
      expectSeries(vals(r.plots.plot2), ref.lb, 'low band');
      expect(timesOf(r.markers, 'shape0')).toEqual(timesAt(b, ref.long));
      expect(timesOf(r.markers, 'shape1')).toEqual(timesAt(b, ref.short));
      expect(r.markers.length).toBe(ref.long.filter(Boolean).length + ref.short.filter(Boolean).length);
      expect(r.alerts[0].times).toEqual(timesAt(b, ref.long));
      expect(r.alerts[1].times).toEqual(timesAt(b, ref.short));
    });
  }
  it('the filter keeps the first close while the range size is na (until bar 3n - 2)', () => {
    const r = vmc.calculate(bars);
    const f = vals(r.plots.plot0);
    for (let i = 0; i < 58; i++) expect(f[i]).toBe(bars[0].close);
    expect(vals(r.plots.plot1)[57]).toBeNaN();
    expect(vals(r.plots.plot1)[58]).not.toBeNaN();
  });
  it('bar colours from the first bar with the bar colour input on (barcolor0)', () => {
    const ref = vmcRef(bars);
    const r = vmc.calculate(bars, { useBarColor: true });
    expect(r.barColors.length).toBe(bars.length);
    const x = C(bars);
    r.barColors.forEach((bc, i) => {
      expect(bc.id).toBe('barcolor0');
      const s1 = at(x, i - 1);
      const want = ref.up[i] && x[i] > ref.filt[i] ? (x[i] > s1 ? '#05ff9b' : '#00b36b')
        : ref.dn[i] && x[i] < ref.filt[i] ? (x[i] < s1 ? '#ff0583' : '#b8005d') : '#cccccc';
      expect(bc.color).toBe(want);
    });
  });
});

// --- Isolated Peak and Bottom ---
function isoRef(b: Bar[]) {
  const h = H(b), l = Lo(b);
  const hi = (i: number) => at(h, i), lo = (i: number) => at(l, i);
  const t1: boolean[] = [], t2: boolean[] = [], d1: boolean[] = [], d2: boolean[] = [];
  b.forEach((_, i) => {
    t1.push(hi(i - 2) > hi(i) && hi(i - 2) >= hi(i - 1) && hi(i - 2) > hi(i - 3) && hi(i - 2) > hi(i - 4)
      && lo(i - 1) > Math.min(lo(i - 3), lo(i - 2)) && lo(i) < Math.min(lo(i - 3), lo(i - 2)));
    t2.push(hi(i - 1) > hi(i) && hi(i - 1) > hi(i - 2) && hi(i - 1) > hi(i - 3) && lo(i) < Math.min(lo(i - 2), lo(i - 1)));
    d1.push(lo(i - 2) < lo(i) && lo(i - 2) < lo(i - 1) && lo(i - 2) < lo(i - 3) && lo(i - 2) < lo(i - 4)
      && hi(i - 1) < Math.max(hi(i - 3), hi(i - 2)) && hi(i) > Math.max(hi(i - 3), hi(i - 2)));
    d2.push(lo(i - 1) < lo(i) && lo(i - 1) < lo(i - 2) && lo(i - 1) < lo(i - 3) && hi(i) > Math.max(hi(i - 2), hi(i - 1)));
  });
  return { t1, t2, d1, d2 };
}
describe('isolated-peak-bottom', () => {
  for (const [name, b] of [['walk', bars], ['flat', flat]] as const) {
    it(`the 4 labels with their offsets (${name})`, () => {
      const ref = isoRef(b);
      const r = iso.calculate(b);
      expect(timesOf(r.markers, 'shape0')).toEqual(timesAt(b, ref.d1, 2));
      expect(timesOf(r.markers, 'shape1')).toEqual(timesAt(b, ref.d2, 1));
      expect(timesOf(r.markers, 'shape2')).toEqual(timesAt(b, ref.t1, 2));
      expect(timesOf(r.markers, 'shape3')).toEqual(timesAt(b, ref.t2, 1));
      expect(r.alerts.map((a) => a.times)).toEqual([timesAt(b, ref.t1), timesAt(b, ref.t2), timesAt(b, ref.d1), timesAt(b, ref.d1)]);
    });
  }
  it('PEAK1 and BOT1 can show from bar 3 (crafted bars)', () => {
    const peak = fromOhlc([[9.5, 10, 9, 9.6], [10, 11, 9.5, 10.5], [11, 15, 10, 12], [11, 12, 8, 8.5]]);
    const r1 = iso.calculate(peak);
    expect(r1.markers.filter((m) => m.id === 'shape3').map((m) => m.time)).toEqual([peak[2].time]);
    expect(r1.alerts[1].times).toEqual([peak[3].time]);
    const bot = fromOhlc([[10.5, 11, 10, 10.2], [10, 11, 9.5, 9.8], [9.5, 10, 8, 9], [9.5, 12, 9, 11.5]]);
    const r2 = iso.calculate(bot);
    expect(r2.markers.filter((m) => m.id === 'shape1').map((m) => m.time)).toEqual([bot[2].time]);
  });
});

// --- Philakone 55 EMA Swing ---
function philRef(b: Bar[], exponential = true) {
  const s = C(b);
  const ma = (len: number) => (exponential ? ema(s, len) : sma(s, len));
  const m8 = ma(8), m13 = ma(13), m21 = ma(21), m55 = ma(55);
  const cross = (i: number) => crossover(m21, m55, i) || crossunder(m21, m55, i);
  const buy = b.map((_, i) => cross(i) && m8[i] > m13[i] && m21[i] > m55[i]);
  const sell = b.map((_, i) => cross(i) && m8[i] < m13[i] && m21[i] < m55[i]);
  return { m8, m13, m21, m55, buy, sell };
}
describe('philakone-ema-swing', () => {
  for (const [name, b, inp] of [['ema', bars, {}], ['ema flat', flat, {}], ['sma', bars2, { exponential: false }]] as const) {
    it(`MA lines from their first value and markers on every bar (${name})`, () => {
      const ref = philRef(b, (inp as { exponential?: boolean }).exponential ?? true);
      const r = phil.calculate(b, inp);
      expectSeries(vals(r.plots.plot0), ref.m8, 'ma8');
      expectSeries(vals(r.plots.plot1), ref.m13, 'ma13');
      expectSeries(vals(r.plots.plot2), ref.m21, 'ma21');
      expectSeries(vals(r.plots.plot3), ref.m55, 'ma55');
      expect(timesOf(r.markers, 'shape0')).toEqual(timesAt(b, ref.buy));
      expect(timesOf(r.markers, 'shape1')).toEqual(timesAt(b, ref.sell));
      expect(r.markers.length).toBe(ref.buy.filter(Boolean).length + ref.sell.filter(Boolean).length);
      expect(r.alerts[0].times).toEqual(timesAt(b, ref.buy));
      expect(r.alerts[1].times).toEqual(timesAt(b, ref.sell));
    });
  }
  it('a cross on bar 55 (first bar with MA 55 on both sides) gets its marker', () => {
    let found = false;
    for (let seed = 1; seed < 3000 && !found; seed++) {
      const b = walk(60, seed);
      const ref = philRef(b);
      if (ref.buy[55] || ref.sell[55]) {
        expect(phil.calculate(b).markers.some((m) => m.time === b[55].time)).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
  it("has the original's 'Exponential MA' input", () => {
    expect(phil.inputConfig.find((x) => x.id === 'exponential')).toMatchObject({ title: 'Exponential MA', defval: true, type: 'bool' });
  });
});

// --- All Candlestick Patterns: the original (language version 1) reads `0.3 > x >= 0.1` as `(0.3 > x) >= 0.1`
// with the bool as 1 / 0; JavaScript evaluates the same text the same way, so the original's expressions run as is ---
const CDL: { defs: Record<string, string>; shapes: [string, string][] } = {"defs": {"data1": "close[1]>open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and close<open and abs(close-open)/(high-low)>=0.7 and open>=close[1] and close>open[1] and close<((open[1]+close[1])/2)", "data2": "abs(close-open)/(high-low)<0.1 and (high-max(close,open))>(3*abs(close-open)) and (min(close,open)-low)>(3*abs(close-open))", "data3": "close[1]>open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and abs(close-open)/(high-low)<0.1 and close[1]<close and close[1]<open and (high-max(close,open))>(3*abs(close-open)) and (min(close,open)-low)>(3*abs(close-open))", "data4": "abs(close-open)/(high-low)<0.1 and (min(close,open)-low)>(3*abs(close-open)) and (high-max(close,open))<abs(close-open)", "data5": "close[2]>open[2] and abs(close[2]-open[2])/(high[2]-low[2])>=0.7 and 0.3>abs(close[1]-open[1])/(high[1]-low[1])>=0.1 and close<open and abs(close-open)/(high-low)>=0.7 and close[2]<close[1] and close[2]<open[1] and close[1]>open and open[1]>open and close<close[2]", "data6": "close[2]>open[2] and abs(close[2]-open[2])/(high[2]-low[2])>=0.7 and abs(close[1]-open[1])/(high[1]-low[1])<0.1 and close<open and abs(close-open)/(high-low)>=0.7 and close[2]<close[1] and close[2]<open[1] and close[1]>open and open[1]>open and close<close[2] and (high[1]-max(close[1],open[1]))>(3*abs(close[1]-open[1])) and (min(close[1],open[1])-low[1])>(3*abs(close[1]-open[1]))", "data7": "abs(close-open)/(high-low)<0.1 and (high-max(close,open))>(3*abs(close-open)) and (min(close,open)-low)<=abs(close-open)", "data8": "close<open and 0.3>abs(close-open)/(high-low)>=0.1 and (min(close,open)-low)>=(2*abs(close-open)) and (high-max(close,open))>(0.25*abs(close-open))", "data9": "close>open and 0.3>abs(close-open)/(high-low)>=0.1 and (min(close,open)-low)>=(2*abs(close-open)) and (high-max(close,open))>(0.25*abs(close-open))", "data10": "close[2]<open[2] and abs(close[2]-open[2])/(high[2]-low[2])>=0.7 and 0.3>abs(close[1]-open[1])/(high[1]-low[1])>=0.1 and close>open and abs(close-open)/(high-low)>=0.7 and close[2]>close[1] and close[2]>open[1] and close[1]<open and open[1]<open and close>close[2]", "data11": "close[2]<open[2] and abs(close[2]-open[2])/(high[2]-low[2])>=0.7 and abs(close[1]-open[1])/(high[1]-low[1])<0.1 and close>open and abs(close-open)/(high-low)>=0.7 and close[2]>close[1] and close[2]>open[1] and close[1]<open and open[1]<open and close>close[2] and (high[1]-max(close[1],open[1]))>(3*abs(close[1]-open[1])) and (min(close[1],open[1])-low[1])>(3*abs(close[1]-open[1]))", "data12": "close[1]<open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and close>open and abs(close-open)/(high-low)>=0.7 and open<=close[1] and close<open[1] and close<((open[1]+close[1])/2)", "data13": "close[1]<open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and 0.3>abs(close-open)/(high-low)>=0.1 and close[1]>close and close[1]>open", "data14": "close[1]<open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and abs(close-open)/(high-low)<0.1 and close[1]>close and close[1]>open and (high-max(close,open))>(3*abs(close-open)) and (min(close,open)-low)>(3*abs(close-open))", "data15": "close<open and 0.3>abs(close-open)/(high-low)>=0.1 and (high-max(close,open))>=(2*abs(close-open)) and (min(close,open)-low)<=(0.25*abs(close-open))", "data16": "close>open and 0.3>abs(close-open)/(high-low)>=0.1 and (high-max(close,open))>=(2*abs(close-open)) and (min(close,open)-low)<=(0.25*abs(close-open))", "data17": "close[1]>open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and 0.3>abs(close-open)/(high-low)>=0.1 and close[1]<close and close[1]<open", "data18": "close[1]>open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and close<open and abs(close-open)/(high-low)>=0.7 and open>=close[1] and close<close[1] and close>=((open[1]+close[1])/2)", "data19": "close[1]<open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and close>open and abs(close-open)/(high-low)>=0.7 and open<=close[1] and close>close[1] and close<=((open[1]+close[1])/2)", "data20": "close[1]<open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and close<open and 0.3>abs(close-open)/(high-low)>=0.1 and abs(low/low[1]-1)<0.05 and abs(close-open)<2*(min(close,open)-low)", "data21": "close[1]>open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and close>open and 0.3>abs(close-open)/(high-low)>=0.1 and abs(high/high[1]-1)<0.05 and abs(close[1]-open[1])<2*(high[1]-max(close[1],open[1]))", "data22": "close[3]<open[3] and abs(close[3]-open[3])/(high[3]-low[3])>=0.7 and close[2]>open[2] and 0.3>abs(close[2]-open[2])/(high[2]-low[2])>=0.1 and close[1]>open[1] and 0.3>abs(close[1]-open[1])/(high[1]-low[1])>=0.1 and close>open and abs(close-open)/(high-low)>=0.7 and close[2]>close[1] and close[1]>close[3] and open[2]<close[3] and open[1]<close[3] and close>((open[3]+close[3])/2)", "data23": "close[3]>open[3] and abs(close[3]-open[3])/(high[3]-low[3])>=0.7 and close[2]<open[2] and 0.3>abs(close[2]-open[2])/(high[2]-low[2])>=0.1 and close[1]<open[1] and 0.3>abs(close[1]-open[1])/(high[1]-low[1])>=0.1 and close<open and abs(close-open)/(high-low)>=0.7 and close[2]<close[1] and close[1]<close[3] and open[2]>close[3] and open[1]>close[3] and close<((open[3]+close[3])/2)", "data24": "close[1]<open[1] and 0.7>abs(close[1]-open[1])/(high[1]-low[1])>=0.3 and close>open and 0.7>abs(close-open)/(high-low)>=0.3 and close<=close[1] and close>low[1]", "data25": "close[1]>open[1] and 0.7>abs(close[1]-open[1])/(high[1]-low[1])>=0.3 and close<open and 0.7>abs(close-open)/(high-low)>=0.3 and close>=close[1] and close<high[1]", "data26": "close[1]>open[1] and 0.7>abs(close[1]-open[1])/(high[1]-low[1])>=0.3 and close<open and 0.7>abs(close-open)/(high-low)>=0.3 and open<=open[1] and open>low[1]", "data27": "close[1]<open[1] and 0.7>abs(close[1]-open[1])/(high[1]-low[1])>=0.3 and close>open and 0.7>abs(close-open)/(high-low)>=0.3 and open>=open[1] and open<high[1]", "data28": "close[1]<open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and 0.3>abs(close-open)/(high-low)>=0.1 and high<open[1] and low>close[1]", "data29": "close[1]>open[1] and abs(close[1]-open[1])/(high[1]-low[1])>=0.7 and 0.3>abs(close-open)/(high-low)>=0.1 and high<close[1] and low>open[1]", "data30": "close[1]<open[1] and 0.3>abs(close[1]-open[1])/(high[1]-low[1])>=0.1 and close>open and abs(close-open)/(high-low)>=0.7 and high[1]<close and low[1]>open", "data31": "close[1]>open[1] and 0.3>abs(close[1]-open[1])/(high[1]-low[1])>=0.1 and close<open and abs(close-open)/(high-low)>=0.7 and high[1]<open and low[1]>close", "data32": "abs(close[1]-open[1])/(high[1]-low[1])<0.1 and close>open and abs(close-open)/(high-low)>=0.7 and high[1]<close and low[1]>open and (high[1]-max(close[1],open[1]))>(3*abs(close[1]-open[1])) and (min(close[1],open[1])-low[1])<=abs(close[1]-open[1])", "data33": "abs(close[1]-open[1])/(high[1]-low[1])<0.1 and close<open and abs(close-open)/(high-low)>=0.7 and high[1]<open and low[1]>close and (high[1]-max(close[1],open[1]))>(3*abs(close[1]-open[1])) and (min(close[1],open[1])-low[1])<=abs(close[1]-open[1])"}, "shapes": [["data1", "Dark Cloud Cover"], ["data2", "Doji"], ["data3", "Doji Star"], ["data4", "Dragonfly Doji"], ["data5", "Evening Star"], ["data6", "Evening Star Doji"], ["data7", "Gravestone Doji"], ["data8", "Hanging Man Red"], ["data9", "Hanging Man Green"], ["data10", "Morning Star"], ["data11", "Morning Star Doji"], ["data12", "Piercieng Pattern"], ["data13", "Raindrop"], ["data14", "Raindrop Doji"], ["data15", "Inverted Hammer Red"], ["data16", "Inverted Hammer Green"], ["data17", "Star"], ["data18", "Bearish Thrusting"], ["data19", "Bullish Thrusting Pattern"], ["data20", "Tweezers Bottom"], ["data21", "Tweezers Top"], ["data22", "Tower Bottom"], ["data23", "Tower Top"], ["data24", "Bullish In Neck"], ["data25", "Bearish In Neck"], ["data26", "Bullish Separating Lines"], ["data27", "Bearish Separating Lines"], ["data28", "Bullish Harami"], ["data29", "Bearish Harami"], ["data30", "Bullish Engulfing"], ["data31", "Bearish Engulfing"], ["data32", "Doji Bullish Engulfing"], ["data31", "Doji Bearish Engulfing"]]};
function cdlRef(b: Bar[]) {
  const fns: Record<string, (s: (f: string, k: number) => number) => boolean> = {};
  for (const [name, src] of Object.entries(CDL.defs)) {
    const js = src
      .replace(/\b(open|high|low|close)\[(\d)\]/g, 'S_$1_$2')
      .replace(/\b(open|high|low|close)\b/g, 'S_$1_0')
      .replace(/\bS_([a-z]+)_(\d)\b/g, 's("$1",$2)')
      .replace(/\babs\(/g, 'Math.abs(').replace(/\bmax\(/g, 'Math.max(').replace(/\bmin\(/g, 'Math.min(')
      .replace(/\band\b/g, '&&').replace(/\bor\b/g, '||');
    fns[name] = new Function('s', `return !!(${js});`) as (s: (f: string, k: number) => number) => boolean;
  }
  return CDL.shapes.map(([data]) => b.map((_, i) => fns[data]((f, k) => (i - k >= 0 ? (b[i - k] as unknown as Record<string, number>)[f] : NaN))));
}
describe('all-candlestick-patterns', () => {
  for (const [name, b] of [['walk', bars], ['walk 2', bars2], ['flat', flat]] as const) {
    it(`the 33 shapes as the original's expressions with left-to-right comparisons (${name})`, () => {
      const ref = cdlRef(b);
      const r = cdl.calculate(b);
      ref.forEach((flags, k) => expect(timesOf(r.markers, `shape${k}`), CDL.shapes[k][1]).toEqual(timesAt(b, flags)));
    });
  }
  it('a chained comparison keeps only its first test (crafted Hanging Man with a body of 4 % of the range)', () => {
    const b = fromOhlc([[10, 10.2, 9, 9.95]]);
    const ids = cdl.calculate(b).markers.map((m) => m.id);
    expect(ids).toContain('shape7');
    expect(cdlRef(b)[7][0]).toBe(true);
  });
});

// --- Traders Reality Main: calcPvsra() of Traders_Reality_Lib v2 ---
function pvsraRef(b: Bar[]) {
  const v = b.map((x) => x.volume ?? NaN);
  const v1 = v.map((_, i) => at(v, i - 1));
  const avg = sma(v1, 10); // math.sum(volume[1], 10) / 10
  const vs = b.map((x, i) => v[i] * (x.high - x.low));
  const vs1 = vs.map((_, i) => at(vs, i - 1));
  const hvs = vs1.map((_, i) => {
    if (i < 9) return NaN;
    let best = NaN;
    for (let k = i - 9; k <= i; k++) if (fin(vs1[k]) && (isNaN(best) || vs1[k] > best)) best = vs1[k];
    return best;
  });
  const kind: string[] = [];
  const flag: boolean[] = [];
  b.forEach((x, i) => {
    const up = x.close > x.open;
    if (v[i] >= 2 * avg[i] || vs[i] >= hvs[i]) { kind.push(up ? 'green' : 'red'); flag.push(true); }
    else if (v[i] >= 1.5 * avg[i]) { kind.push(up ? 'blue' : 'violet'); flag.push(true); }
    else { kind.push(up ? 'up' : 'down'); flag.push(false); }
  });
  return { kind, flag };
}
describe('traders-reality-main', () => {
  for (const [name, b] of [['walk', bars], ['flat', flat]] as const) {
    it(`'Alert on Any Vector Candle' is the library's alertFlag, bar colours its pvsraColor (${name})`, () => {
      const ref = pvsraRef(b);
      const r = trm.calculate(b) as unknown as { alerts: { id: string; times: number[] }[]; barColors: { time: number; color: string }[] };
      expect(r.alerts[0].id).toBe('alert0');
      expect(r.alerts[0].times).toEqual(timesAt(b, ref.flag));
      const d = trm.defaultInputs as unknown as Record<string, string>;
      const colourOf: Record<string, string> = {
        green: d.greenVectorColor, red: d.redVectorColor, blue: d.blueVectorColor, violet: d.violetVectorColor,
        up: d.regularCandleUpColor, down: d.regularCandleDownColor,
      };
      expect(r.barColors.map((x) => x.color)).toEqual(ref.kind.map((k) => colourOf[k]));
      const kinds = ['green', 'red', 'blue', 'violet'];
      kinds.forEach((k, j) => expect(r.alerts[1 + j].times).toEqual(timesAt(b, ref.kind.map((x) => x === k))));
      // Red/Green pattern: this bar green, the bar before red
      expect(r.alerts[5].times).toEqual(timesAt(b, ref.kind.map((x, i) => x === 'green' && ref.kind[i - 1] === 'red')));
      expect(ref.flag.some(Boolean) && ref.flag.some((f) => !f)).toBe(true);
      expect(ref.flag.slice(0, 9).every((f, i) => f === (ref.kind[i] !== 'up' && ref.kind[i] !== 'down'))).toBe(true);
    });
  }
});
