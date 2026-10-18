/**
 * Community ports, drawing batch 3: the drawn parts fixed to follow the originals, re-computed here from the
 * original's formulas (own reference implementations of sma / ema / rma / atr / stdev / rsi, Pine semantics) on
 * seeded bars, plus the output ids.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as autoFib from '../../src/community/auto-fib';
import * as ce from '../../src/community/chandelier-exit';
import * as fli from '../../src/community/follow-line';
import * as dsi from '../../src/community/dynamic-structure-indicator';
import * as emaSt from '../../src/community/ema-supertrend';
import * as gann from '../../src/community/gann-high-low';
import * as gmma from '../../src/community/gmma';
import * as qqe from '../../src/community/qqe';

/** Seeded random walk */
function makeBars(count: number, seed: number, swing = 90, amp = 0.004, step = 86400, start = 1_600_000_000): Bar[] {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / swing) * amp;
    const open = price;
    const close = Math.max(1, open * (1 + drift + (rnd() - 0.5) * 0.04));
    const high = Math.max(open, close) * (1 + rnd() * 0.015);
    const low = Math.min(open, close) * (1 - rnd() * 0.015);
    bars.push({ time: start + i * step, open, high, low, close, volume: 1000 + Math.round(rnd() * 9000) });
    price = close;
  }
  return bars;
}

// ---- Reference implementations (Pine semantics) ----
const nz = (v: number) => (Number.isNaN(v) ? 0 : v);
function sma(x: number[], len: number): number[] {
  return x.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let j = i - len + 1; j <= i; j++) s += x[j];
    return s / len;
  });
}
function stdev(x: number[], len: number): number[] {
  const m = sma(x, len);
  return x.map((_, i) => {
    if (Number.isNaN(m[i])) return NaN;
    let s = 0;
    for (let j = i - len + 1; j <= i; j++) s += (x[j] - m[i]) ** 2;
    return Math.sqrt(s / len);
  });
}
/** Recursive average seeded with the SMA of the first `len` non-na values */
function seeded(x: number[], len: number, alpha: number): number[] {
  const out: number[] = [];
  let prev = NaN;
  const win: number[] = [];
  for (const v of x) {
    if (Number.isNaN(prev)) {
      if (Number.isNaN(v)) { win.length = 0; out.push(NaN); continue; }
      win.push(v);
      if (win.length === len) prev = win.reduce((a, b) => a + b, 0) / len;
      out.push(prev);
    } else {
      prev = Number.isNaN(v) ? NaN : alpha * v + (1 - alpha) * prev;
      out.push(prev);
    }
  }
  return out;
}
const ema = (x: number[], len: number) => seeded(x, len, 2 / (len + 1));
const rma = (x: number[], len: number) => seeded(x, len, 1 / len);
function trueRange(bars: Bar[]): number[] {
  return bars.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
}
const atr = (bars: Bar[], len: number) => rma(trueRange(bars), len);
/** rma of the values on the called bars only (a call in a conditional block); na on the other bars */
function rmaWhen(called: boolean[], x: number[], len: number): number[] {
  const idx = called.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const r = rma(idx.map((i) => x[i]), len);
  const out = new Array<number>(x.length).fill(NaN);
  idx.forEach((i, k) => { out[i] = r[k]; });
  return out;
}
function highest(x: number[], len: number): number[] {
  return x.map((_, i) => (i < len - 1 ? NaN : Math.max(...x.slice(i - len + 1, i + 1))));
}
function lowest(x: number[], len: number): number[] {
  return x.map((_, i) => (i < len - 1 ? NaN : Math.min(...x.slice(i - len + 1, i + 1))));
}
function rsi(x: number[], len: number): number[] {
  const up = x.map((v, i) => (i === 0 ? NaN : Math.max(v - x[i - 1], 0)));
  const dn = x.map((v, i) => (i === 0 ? NaN : Math.max(x[i - 1] - v, 0)));
  const u = rma(up, len), d = rma(dn, len);
  return u.map((a, i) => (Number.isNaN(a) || Number.isNaN(d[i]) ? NaN : d[i] === 0 ? 100 : a === 0 ? 0 : 100 - 100 / (1 + a / d[i])));
}
const crossover = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const crossunder = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);

type Pt = { time: number; value: number; color?: string };
const values = (p: Pt[]) => p.map((q) => q.value);
function expectSeries(got: number[], want: number[], digits = 8) {
  expect(got.length).toBe(want.length);
  got.forEach((g, i) => {
    if (Number.isNaN(want[i])) expect(Number.isNaN(g), `bar ${i}: ${g} should be na`).toBe(true);
    else expect(g, `bar ${i}`).toBeCloseTo(want[i], digits);
  });
}

const BARS = makeBars(1300, 11);
/** Faster swings: many trend turns */
const SWING = makeBars(1500, 5, 8, 0.03);

describe('auto-fib: Fibo Period 144, direction, 1.618 level, show_last = 1 plots with price lines', () => {
  it('inputs as the original', () => {
    expect(autoFib.defaultInputs.length).toBe(144);
    expect(autoFib.inputConfig.find((c) => c.id === 'length')?.title).toBe('Fibo Period');
    expect(autoFib.plotConfig.map((p) => p.title)).toEqual(['0', '0.236', '0.382', '0.5', '0.618', '0.786', '1', '1.618']);
    expect(autoFib.plotConfig.map((p) => p.lineWidth)).toEqual([2, 1, 1, 2, 1, 1, 2, 3]);
  });

  it('levels of the last bar, from the low up (downward leg) or the high down', () => {
    const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
    const dirs = new Set<boolean>();
    for (let k = 400; k <= BARS.length; k += 37) {
      const b = BARS.slice(0, k);
      const last = k - 1;
      const win = b.slice(k - 144);
      const hi = Math.max(...win.map((x) => x.high)), lo = Math.min(...win.map((x) => x.low));
      const fh = win.findIndex((x) => x.high === hi) - 143, fl = win.findIndex((x) => x.low === lo) - 143;
      const down = fh < fl;
      dirs.add(down);
      const want = ratios.map((r) => (down ? (hi - lo) * r + lo : hi - (hi - lo) * r));
      const res = autoFib.calculate(b);
      ratios.forEach((_, j) => {
        const p = res.plots[`plot${j}`] as Pt[];
        expect(p.slice(0, last).every((q) => Number.isNaN(q.value))).toBe(true);
        expect(p[last].value).toBeCloseTo(want[j], 9);
        expect(p[last].color).toBe(down ? '#00cc00' : '#E41019');
      });
      expect(res.lines.map((l) => l.price1)).toEqual(res.lines.map((l) => l.price2));
      res.lines.forEach((l, j) => expect(l.price1).toBeCloseTo(want[j], 9));
      expect(res.lines.length).toBe(8);
      expect(res.fills ?? []).toEqual([]);
      const ids = res.markers.map((m) => m.id);
      expect(ids).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7', 'shape8', 'shape9']);
    }
    expect(dirs.size).toBe(2);
  });

  it('1.618 off; na before 144 bars', () => {
    const off = autoFib.calculate(BARS, { plotF1618: false });
    expect(values(off.plots.plot7 as Pt[]).every(Number.isNaN)).toBe(true);
    expect(off.lines.length).toBe(7);
    expect(off.markers.some((m) => m.id === 'shape7')).toBe(false);
    const short = autoFib.calculate(BARS.slice(0, 143));
    expect(values(short.plots.plot0 as Pt[]).every(Number.isNaN)).toBe(true);
    expect(short.lines.length).toBe(0);
    expect(autoFib.calculate(BARS.slice(0, 144)).lines.length).toBe(8);
  });
});

/** Chandelier Exit reference: stops, direction, plots and signals of the original */
function ceRef(bars: Bar[], len = 22, mult = 3, useClose = true) {
  const a = atr(bars, len).map((v) => v * mult);
  const hi = highest(bars.map((b) => (useClose ? b.close : b.high)), len);
  const lo = lowest(bars.map((b) => (useClose ? b.close : b.low)), len);
  const ls: number[] = [], ss: number[] = [], dir: number[] = [];
  let d = 1;
  bars.forEach((b, i) => {
    let l = hi[i] - a[i];
    const lp = i > 0 && !Number.isNaN(ls[i - 1]) ? ls[i - 1] : l;
    if (i > 0 && bars[i - 1].close > lp) l = Math.max(l, lp);
    let s = lo[i] + a[i];
    const sp = i > 0 && !Number.isNaN(ss[i - 1]) ? ss[i - 1] : s;
    if (i > 0 && bars[i - 1].close < sp) s = Math.min(s, sp);
    d = b.close > sp ? 1 : b.close < lp ? -1 : d;
    ls.push(l); ss.push(s); dir.push(d);
  });
  return { ls, ss, dir };
}

describe('chandelier-exit: lines and markers on the direction of the original', () => {
  it('long stop while long, short stop while short; circle + label on the turn', () => {
    const { ls, ss, dir } = ceRef(BARS);
    const res = ce.calculate(BARS);
    expectSeries(values(res.plots.plot0 as Pt[]), ls.map((v, i) => (dir[i] === 1 ? v : NaN)));
    expectSeries(values(res.plots.plot1 as Pt[]), ss.map((v, i) => (dir[i] === 1 ? NaN : v)));
    expectSeries(values(res.plots.plot2 as Pt[]), BARS.map((b) => (b.open + b.high + b.low + b.close) / 4));
    const want: { id: string; time: number; price: number }[] = [];
    dir.forEach((d, i) => {
      if (i === 0) return;
      if (d === 1 && dir[i - 1] === -1) want.push({ id: 'shape0', time: BARS[i].time, price: ls[i] }, { id: 'shape1', time: BARS[i].time, price: ls[i] });
      if (d === -1 && dir[i - 1] === 1) want.push({ id: 'shape2', time: BARS[i].time, price: ss[i] }, { id: 'shape3', time: BARS[i].time, price: ss[i] });
    });
    expect(want.length).toBeGreaterThan(20);
    expect(res.markers.map((m) => [m.id, m.time])).toEqual(want.map((m) => [m.id, m.time]));
    res.markers.forEach((m, k) => expect(m.price).toBeCloseTo(want[k].price, 8));
    expect(res.markers.filter((m) => m.id === 'shape1').every((m) => m.text === 'Buy' && m.position === 'atPriceBottom')).toBe(true);
    expect(res.markers.filter((m) => m.id === 'shape3').every((m) => m.text === 'Sell' && m.position === 'atPriceTop')).toBe(true);
    // fills: 85 % transparent green / red by the direction
    const [lf, sf] = res.fills!;
    expect(lf.colors!.map((c) => c !== 'transparent')).toEqual(dir.map((d) => d === 1));
    expect(sf.colors!.map((c) => c !== 'transparent')).toEqual(dir.map((d) => d === -1));
    // the alerts read the same direction
    expect(res.alerts[1].times).toEqual(want.filter((m) => m.id === 'shape1').map((m) => m.time));
  });

  it('Show Buy/Sell Labels and Highlight State', () => {
    const res = ce.calculate(BARS, { showLabels: false, highlightState: false });
    expect(res.markers.some((m) => m.id === 'shape1' || m.id === 'shape3')).toBe(false);
    expect(res.markers.some((m) => m.id === 'shape0')).toBe(true);
    expect(res.fills!.every((f) => f.colors!.every((c) => c === 'transparent'))).toBe(true);
  });
});

/** Follow Line reference: v4 script, atr() in its conditional blocks / ternary branches keep their own history */
function fliRef(bars: Bar[], per = 21, dev = 1, useAtr = true, atrPer = 5, hl = false) {
  const close = bars.map((b) => b.close);
  const m = sma(close, per), sd = stdev(close, per);
  const tr = trueRange(bars);
  const sig = close.map((c, i) => (c > m[i] + sd[i] * dev ? 1 : c < m[i] - sd[i] * dev ? -1 : 0));
  const atrA = rmaWhen(sig.map((s) => useAtr && s === 1), tr, atrPer);
  const atrB = rmaWhen(sig.map((s) => useAtr && s === -1), tr, atrPer);
  const tl: number[] = [], it: number[] = [], buy: boolean[] = [], sell: boolean[] = [];
  bars.forEach((b, i) => {
    const p = i > 0 ? tl[i - 1] : NaN;
    let t = p;
    if (sig[i] === 1) { t = useAtr ? b.low - atrA[i] : b.low; if (t < p) t = p; }
    if (sig[i] === -1) { t = useAtr ? b.high + atrB[i] : b.high; if (t > p) t = p; }
    const pi = i > 0 ? it[i - 1] : NaN;
    let v = pi;
    if (t > p) v = 1;
    if (t < p) v = -1;
    tl.push(t); it.push(v);
    buy.push(pi === -1 && v === 1);
    sell.push(pi === 1 && v === -1);
  });
  const atrBuy = rmaWhen(buy.map((x) => x && !hl), tr, 8);
  const atrSell = rmaWhen(sell.map((x) => x && !hl), tr, 8);
  return { tl, it, buy, sell, atrBuy, atrSell };
}

describe('follow-line: trend line, colours and labels of the original', () => {
  it('trend line, blue / red, bomb / hammer labels at line -/+ ATR(8) of their own calls', () => {
    const r = fliRef(SWING);
    const res = fli.calculate(SWING);
    expectSeries(values(res.plots.plot0 as Pt[]), r.tl);
    (res.plots.plot0 as Pt[]).forEach((p, i) => expect(p.color).toBe(r.it[i] > 0 ? '#2196F3' : '#FF5252'));
    const want: { id: string; time: number; price: number }[] = [];
    SWING.forEach((b, i) => {
      if (r.buy[i] && !Number.isNaN(r.tl[i] - r.atrBuy[i])) want.push({ id: 'shape0', time: b.time, price: r.tl[i] - r.atrBuy[i] });
      if (r.sell[i] && !Number.isNaN(r.tl[i] + r.atrSell[i])) want.push({ id: 'shape1', time: b.time, price: r.tl[i] + r.atrSell[i] });
    });
    const nBuy = r.buy.filter(Boolean).length;
    expect(nBuy).toBeGreaterThan(10);
    // the first 7 calls of each atr(8) are na: no label
    expect(want.filter((m) => m.id === 'shape0').length).toBe(nBuy - 7);
    expect(res.markers.map((m) => [m.id, m.time])).toEqual(want.map((m) => [m.id, m.time]));
    res.markers.forEach((m, k) => expect(m.price).toBeCloseTo(want[k].price, 8));
    expect(res.markers.every((m) => (m.id === 'shape0' ? m.text === '💣' : m.text === '🔨'))).toBe(true);
    // no bar / background colours in the original
    expect((res as Record<string, unknown>).barColors).toBeUndefined();
    expect((res as Record<string, unknown>).bgColors).toBeUndefined();
    // alerts on the same turns
    expect(res.alerts[1].times).toEqual(SWING.filter((_, i) => r.buy[i]).map((b) => b.time));
    expect(res.alerts[0].times).toEqual(SWING.filter((_, i) => r.sell[i]).map((b) => b.time));
  });

  it('without the ATR filter; Hide Labels', () => {
    const r = fliRef(SWING, 21, 1, false);
    const res = fli.calculate(SWING, { useATRFilter: false, hideLabels: true });
    expectSeries(values(res.plots.plot0 as Pt[]), r.tl);
    expect(res.markers).toEqual([]);
  });
});

/** Dynamic Structure Indicator reference (all bars confirmed) */
function dsiRef(bars: Bar[], atrMove = 1, look = 25, maxZone = 2.5, reset = 25) {
  const a = atr(bars, 14);
  const hb = bars.map((b) => Math.max(b.open, b.close));
  const lbd = bars.map((b) => Math.min(b.open, b.close));
  const hh = highest(bars.map((b) => b.high), look), ll = lowest(bars.map((b) => b.low), look);
  const g = (x: number[], i: number) => (i >= 0 ? x[i] : NaN);
  let res1 = 0, res2 = 0, sup1 = 0, sup2 = 0, lookR = true, lookS = true;
  let pR1 = 0, pR2 = 0, pS1 = 0, pS2 = 0, saved = 0, poR1 = 0, poR2 = 0, poS1 = 0, poS2 = 0, supC = 0, resC = 0;
  const out = { res1: [] as number[], res2: [] as number[], sup1: [] as number[], sup2: [] as number[],
    pR1: [] as number[], pR2: [] as number[], pS1: [] as number[], pS2: [] as number[] };
  bars.forEach((b, i) => {
    const h1 = g(bars.map((x) => x.high), i - 1), l1 = g(bars.map((x) => x.low), i - 1);
    if (h1 === hh[i] && b.high < h1 && lookR) {
      const r2 = g(hb, i - 2) > g(hb, i - 1) ? g(hb, i - 2) : hb[i] > g(hb, i - 1) ? hb[i] : g(hb, i - 1);
      if ((h1 - r2) / a[i] <= maxZone) { lookR = false; poR1 = h1; poR2 = r2; saved = a[i]; }
    }
    if (l1 === ll[i] && b.low > l1 && lookS) {
      const s2 = g(lbd, i - 2) < g(lbd, i - 1) ? g(lbd, i - 2) : lbd[i] < g(lbd, i - 1) ? lbd[i] : g(lbd, i - 1);
      if ((s2 - l1) / a[i] <= maxZone) { lookS = false; poS1 = l1; poS2 = s2; saved = a[i]; }
    }
    if (b.close > poR1) { poR1 = NaN; poR2 = NaN; }
    if (b.close < poS1) { poS1 = NaN; poS2 = NaN; }
    if (poR1 - b.low >= saved * atrMove) {
      pR1 = Number.isNaN(pR1) ? poR1 : pR1; pR2 = Number.isNaN(pR2) ? poR2 : pR2;
      res1 = poR1; res2 = poR2; poR1 = NaN; poR2 = NaN;
    }
    if (b.high - poS1 >= saved * atrMove) {
      pS1 = Number.isNaN(pS1) ? poS1 : pS1; pS2 = Number.isNaN(pS2) ? poS2 : pS2;
      sup1 = poS1; sup2 = poS2; poS1 = NaN; poS2 = NaN;
    }
    if (b.close >= res1) { lookR = true; lookS = true; resC++; }
    if (b.close <= sup1) { lookS = true; lookR = true; supC++; }
    if ((b.close > res1 && Number.isNaN(pR1)) || pR1 === 0 || supC >= reset) { pR1 = res1; pR2 = res2; supC = 0; }
    if ((b.close < sup1 && Number.isNaN(pS1)) || pS1 === 0 || resC >= reset) { pS1 = sup1; pS2 = sup2; resC = 0; }
    if (b.close < pR2) { pR1 = NaN; pR2 = NaN; }
    if (b.close > pS2) { pS1 = NaN; pS2 = NaN; }
    out.res1.push(res1); out.res2.push(res2); out.sup1.push(sup1); out.sup2.push(sup2);
    out.pR1.push(pR1); out.pR2.push(pR2); out.pS1.push(pS1); out.pS2.push(pS2);
  });
  return out;
}

describe('dynamic-structure-indicator: the original zones', () => {
  it('R / S / PS / PR plots, colours and fills', () => {
    const r = dsiRef(BARS);
    const res = dsi.calculate(BARS);
    const same = (x: number[], i: number) => i > 0 && x[i] === x[i - 1];
    const ne = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && a !== b;
    const rOn = BARS.map((_, i) => same(r.res1, i));
    const sOn = BARS.map((_, i) => same(r.sup1, i));
    const psOn = BARS.map((_, i) => same(r.pS1, i) && ne(r.pS1[i], r.sup1[i]));
    const prOn = BARS.map((_, i) => same(r.pR1, i) && ne(r.pR1[i], r.res1[i]));
    expectSeries(values(res.plots.r1 as Pt[]), r.res1.map((v, i) => (rOn[i] ? v : NaN)));
    expectSeries(values(res.plots.r2 as Pt[]), r.res2.map((v, i) => (rOn[i] ? v : NaN)));
    expectSeries(values(res.plots.s1 as Pt[]), r.sup1.map((v, i) => (sOn[i] ? v : NaN)));
    expectSeries(values(res.plots.s2 as Pt[]), r.sup2.map((v, i) => (sOn[i] ? v : NaN)));
    expectSeries(values(res.plots.ps1 as Pt[]), r.pS1.map((v, i) => (psOn[i] ? v : NaN)));
    expectSeries(values(res.plots.ps2 as Pt[]), r.pS2.map((v, i) => (psOn[i] ? v : NaN)));
    expectSeries(values(res.plots.pr1 as Pt[]), r.pR1.map((v, i) => (prOn[i] ? v : NaN)));
    expectSeries(values(res.plots.pr2 as Pt[]), r.pR2.map((v, i) => (prOn[i] ? v : NaN)));
    // zones were found and the previous zones drawn
    expect(new Set(r.res1).size).toBeGreaterThan(5);
    expect(psOn.some(Boolean) && prOn.some(Boolean)).toBe(true);
    // the levels start at 0: drawn at 0 before the first zone, as the original
    expect((res.plots.r1 as Pt[])[1].value).toBe(0);
    (res.plots.r1 as Pt[]).forEach((p, i) => expect(p.color).toBe(BARS[i].close >= r.res1[i] ? '#4CAF50' : '#F23645'));
    (res.plots.s1 as Pt[]).forEach((p, i) => expect(p.color).toBe(BARS[i].close < r.sup1[i] ? '#F23645' : '#4CAF50'));
    const [rf, sf] = res.fills!;
    rf.colors!.forEach((c, i) => expect(c).toBe(BARS[i].close > r.res1[i] ? '#4CAF50' : 'rgba(242, 54, 69, 0.5)'));
    sf.colors!.forEach((c, i) => expect(c).toBe(BARS[i].close < r.sup1[i] ? '#F23645' : 'rgba(76, 175, 80, 0.5)'));
    expect(res.fills!.map((f) => [f.plot1, f.plot2])).toEqual([['r1', 'r2'], ['s1', 's2'], ['ps1', 'ps2'], ['pr1', 'pr2']]);
    // alerts on the same levels
    expect(res.alerts[3].times).toEqual(BARS.filter((b, i) => b.close >= r.res1[i]).map((b) => b.time));
    // Draw Previous Structure off
    const off = dsi.calculate(BARS, { drawPreviousStructure: false });
    expect(values(off.plots.ps1 as Pt[]).every(Number.isNaN) && values(off.plots.pr1 as Pt[]).every(Number.isNaN)).toBe(true);
  });
});

describe('ema-supertrend: BUY / SELL labels on every NovaWave crossing', () => {
  it('all crossings (newest 50), at the low / high', () => {
    const close = SWING.map((b) => b.close);
    const f = ema(close, 9), s = ema(close, 21);
    const up = crossover(f, s), dn = crossunder(f, s);
    const want: { time: number; text: string; price: number }[] = [];
    SWING.forEach((b, i) => {
      if (up[i]) want.push({ time: b.time, text: 'BUY', price: b.low });
      if (dn[i]) want.push({ time: b.time, text: 'SELL', price: b.high });
    });
    expect(want.length).toBeGreaterThan(50);
    const res = emaSt.calculate(SWING);
    expect(res.markers.map((m) => [m.time, m.text, m.price])).toEqual(want.slice(-50).map((m) => [m.time, m.text, m.price]));
    expect(res.markers.every((m) => (m.text === 'BUY' ? m.position === 'atPriceBottom' && m.shape === 'labelUp'
      : m.position === 'atPriceTop' && m.shape === 'labelDown'))).toBe(true);
  });

  it('a crossing on the first bar where it is possible (bar 21)', () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 40; i++) {
      const c = i < 21 ? 100 - i : i === 21 ? 200 : 200 + i;
      bars.push({ time: 1_600_000_000 + i * 86400, open: c, high: c + 1, low: c - 1, close: c, volume: 1 });
    }
    const res = emaSt.calculate(bars);
    expect(res.markers[0]).toMatchObject({ time: bars[21].time, text: 'BUY', price: bars[21].low });
    expect(res.alerts[0].times[0]).toBe(bars[21].time);
  });
});

describe('gann-high-low: line from the first SMA bar, maroon / blue', () => {
  it('HiLo and its colour', () => {
    const hs = sma(BARS.map((b) => b.high), 13), ls = sma(BARS.map((b) => b.low), 21);
    let hlv = NaN;
    const want: number[] = [], col: string[] = [];
    BARS.forEach((b, i) => {
      const ph = i > 0 ? nz(hs[i - 1]) : NaN, pl = i > 0 ? nz(ls[i - 1]) : NaN;
      const hld = b.close > ph ? 1 : b.close < pl ? -1 : 0;
      if (hld !== 0) hlv = hld;
      want.push(hlv === -1 ? hs[i] : ls[i]);
      col.push(hlv === -1 ? '#880E4F' : '#2962FF');
    });
    const res = gann.calculate(BARS);
    const p = res.plots.plot0 as Pt[];
    expectSeries(values(p), want);
    expect(Number.isNaN(p[19].value) && !Number.isNaN(p[20].value)).toBe(true);
    p.forEach((q, i) => expect(q.color).toBe(col[i]));
    expect(col.includes('#880E4F') && col.includes('#2962FF')).toBe(true);
  });
});

/** GMMA Super Guppy arrows of the original (v3), lengths x mult */
function gmmaArrows(bars: Bar[], mult: number, lookback = 6) {
  const close = bars.map((b) => b.close);
  const F = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23].map((l) => ema(close, l * mult));
  const S = [25, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70].map((l) => ema(close, l * mult));
  const ord = (L: number[][], i: number, up: boolean) => L.every((e, k) => k === 0 || (up ? L[k - 1][i] > e[i] : L[k - 1][i] < e[i]));
  const buy: number[] = [], sell: number[] = [], bb: number[] = [], sb: number[] = [];
  const since = [NaN, NaN, NaN, NaN];
  const out: { id: string; time: number; value: number }[] = [];
  bars.forEach((b, i) => {
    const fast = F.reduce((s, e) => s + e[i], 0) / 11, slow = S.reduce((s, e) => s + e[i], 0) / 16;
    const fL = ord(F, i, true), fS = ord(F, i, false), sL = ord(S, i, true), sS = ord(S, i, false);
    const p = (x: number[]) => (i > 0 ? x[i - 1] : NaN);
    const by = fast > slow && !sS && fL ? (nz(p(buy)) > 0 ? p(buy) + 1 : 1) : 0;
    const sl = fast < slow && !sL && fS ? (nz(p(sell)) > 0 ? p(sell) + 1 : 1) : 0;
    const bbv = fast > slow && !sS ? (nz(p(bb)) > 0 ? p(bb) + 1 : 1) : 0;
    const sbv = fast < slow && !sL ? (nz(p(sb)) > 0 ? p(sb) + 1 : 1) : 0;
    [p(buy), p(sell), p(bb), p(sb)].forEach((v, k) => { since[k] = (Number.isNaN(v) ? 1 : v) === 1 ? 0 : since[k] + 1; });
    buy.push(by); sell.push(sl); bb.push(bbv); sb.push(sbv);
    if (by === 1 && since[0] > lookback) out.push({ id: 'arrow0', time: b.time, value: 1 });
    if (sl === 1 && since[1] > lookback) out.push({ id: 'arrow1', time: b.time, value: -1 });
    if (bbv === 1 && since[3] > lookback && since[2] > lookback) out.push({ id: 'arrow2', time: b.time, value: 1 });
    if (sbv === 1 && since[2] > lookback && since[3] > lookback) out.push({ id: 'arrow3', time: b.time, value: -1 });
  });
  return out;
}

describe('gmma: alternate anchor timeframe multiplies the Super Guppy lengths', () => {
  const cases: [string, number, number][] = [
    ['60', 0, 1], ['60', 240, 4], ['60', 30, 1], ['15', 60, 4], ['1D', 5, 5], ['1D', 60, 1], ['1W', 4, 4], ['5', 1440, 288],
  ];
  for (const [tf, anchor, mult] of cases) {
    it(`timeframe ${tf}, anchor ${anchor}: multiplier ${mult}`, () => {
      const res = gmma.calculate(BARS, { anchor }, { timeframe: tf } as ChartContext);
      const want = gmmaArrows(BARS, mult);
      expect(res.arrows.map((a) => [a.id, a.time, a.value])).toEqual(want.map((a) => [a.id, a.time, a.value]));
      if (mult <= 5) expect(want.length).toBeGreaterThan(3);
    });
  }
  it('anchor input as the original', () => {
    expect(gmma.inputConfig.find((c) => c.id === 'anchor')).toMatchObject({ defval: 0, min: 0, max: 1440 });
    const a = gmma.calculate(BARS, { anchor: 240 }, { timeframe: '60' } as ChartContext).arrows;
    const b = gmma.calculate(BARS, {}, { timeframe: '60' } as ChartContext).arrows;
    expect(a).not.toEqual(b);
  });
});

describe('qqe: SLOW trailing line of the original crosses FAST', () => {
  it('FAST, SLOW, 50 circles, Buy / Sell labels, fills', () => {
    const fast = ema(rsi(BARS.map((b) => b.close), 14), 5);
    const alpha = 1 / 14;
    let ww = NaN, at = NaN;
    const slow: number[] = [];
    fast.forEach((f, i) => {
      const f1 = i > 0 ? fast[i - 1] : NaN;
      ww = alpha * Math.abs(f - f1) + (1 - alpha) * nz(ww);
      at = alpha * ww + (1 - alpha) * nz(at);
      const up = f + at * 4.236, dn = f - at * 4.236, s1 = nz(i > 0 ? slow[i - 1] : NaN);
      slow.push(up < s1 ? up : f > s1 && f1 < s1 ? dn : dn > s1 ? dn : f < s1 && f1 > s1 ? up : s1);
    });
    const res = qqe.calculate(BARS);
    expectSeries(values(res.plots.plot0 as Pt[]), fast);
    expectSeries(values(res.plots.plot1 as Pt[]), slow);
    expect(values(res.plots.plot2 as Pt[]).every((v) => v === 50)).toBe(true);
    expect(qqe.plotConfig.find((p) => p.id === 'plot2')?.style).toBe('circles');
    const up = crossover(fast, slow), dn = crossunder(fast, slow);
    const want: [string, number, number][] = [];
    BARS.forEach((b, i) => {
      if (up[i]) want.push(['shape0', b.time, slow[i] * 0.995]);
      if (dn[i]) want.push(['shape1', b.time, slow[i] * 1.005]);
    });
    expect(want.filter((w) => w[0] === 'shape0').length).toBeGreaterThan(10);
    expect(want.filter((w) => w[0] === 'shape1').length).toBeGreaterThan(10);
    expect(res.markers.map((m) => [m.id, m.time])).toEqual(want.map((w) => [w[0], w[1]]));
    res.markers.forEach((m, k) => expect(m.price).toBeCloseTo(want[k][2], 8));
    const [uf, df] = res.fills!;
    expect(uf.colors!.map((c) => c !== 'transparent')).toEqual(fast.map((f, i) => f > slow[i]));
    expect(df.colors!.map((c) => c !== 'transparent')).toEqual(fast.map((f, i) => f < slow[i]));
    expect(res.alerts[1].times).toEqual(BARS.filter((_, i) => up[i]).map((b) => b.time));
    const off = qqe.calculate(BARS, { showSignals: false, highlighting: false });
    expect(off.markers).toEqual([]);
    expect(off.fills!.every((f) => f.colors!.every((c) => c === 'transparent'))).toBe(true);
  });
});
