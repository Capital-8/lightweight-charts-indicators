/**
 * Community ports, drawing pass 3: Ichimoku Oscillator (no zero line, the original's colour rules of the ConvBase /
 * Lagging / Oscline layers, opaque in-zone background), Matrix Series (green #008000 / red #FF0000 candles and
 * lines of the original's Pine version) and Schaff Trend Cycle (an overlay, as the original's study(overlay=true)).
 * Each fixed part is recomputed here from the original's formulas on seeded random-walk bars.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import { indicatorRegistry } from '../../src/index';
import * as ichimoku from '../../src/community/ichimoku-oscillator';
import * as matrix from '../../src/community/matrix-series';
import * as stc from '../../src/community/schaff-trend-cycle';

/** Seeded random walk of daily bars; `tick` rounds the prices (plateaus) */
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
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(high, o, p), low: Math.min(low, o, p), close: p, volume: 1e6 });
  }
  return out;
}

const bars = walk(1300, 7);
const bars2 = walk(1500, 4242);
const flat = walk(1300, 99, 1);

// --- Pine reference helpers (independent of the ports) ---
const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
/** Recursive average seeded with the mean of the first `len` non-na values (ta.ema / ta.rma) */
function seeded(src: number[], len: number, alpha: number): number[] {
  const out: number[] = [];
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (isNaN(v)) { out.push(NaN); continue; }
    if (isNaN(prev)) {
      count++; sum += v;
      if (count === len) prev = sum / len;
      out.push(prev);
    } else {
      prev = alpha * v + (1 - alpha) * prev;
      out.push(prev);
    }
  }
  return out;
}
const ema = (src: number[], len: number) => seeded(src, len, 2 / (len + 1));
const rma = (src: number[], len: number) => seeded(src, len, 1 / len);
function atr(b: Bar[], len: number): number[] {
  const tr = b.map((x, i) => (i === 0 ? x.high - x.low
    : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close))));
  return rma(tr, len);
}
const win = (src: number[], i: number, len: number) => src.slice(i - len + 1, i + 1);
/** ta.stdev (biased): na until the window is full */
const stdev = (src: number[], len: number) => src.map((_, i) => {
  if (i < len - 1) return NaN;
  const w = win(src, i, len);
  const m = w.reduce((s, v) => s + v, 0) / len;
  return Math.sqrt(w.reduce((s, v) => s + (v - m) * (v - m), 0) / len);
});
/** ta.highest / ta.lowest: na until the window is full and while it holds a na */
const extreme = (src: number[], len: number, low: boolean) => src.map((_, i) => {
  if (i < len - 1) return NaN;
  const w = win(src, i, len);
  if (w.some(isNaN)) return NaN;
  return low ? Math.min(...w) : Math.max(...w);
});
const vals = (s: { value: number }[]) => s.map((p) => p.value);
function expectSeries(actual: number[], expected: number[], label: string, digits = 8) {
  expect(actual.length, label).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (isNaN(expected[i])) expect(actual[i], `${label} @${i}`).toBeNaN();
    else expect(actual[i], `${label} @${i}`).toBeCloseTo(expected[i], digits);
  }
}

// ---------------------------------------------------------------------------------------------------------------
describe('ichimoku-oscillator: no zero line, layer colours and opaque zone background of the original', () => {
  type Cfg = typeof ichimoku.defaultInputs;
  const UP = ['#00FA00', '#00BE00', '#008200', '#004600'];
  const DN = ['#FA0000', '#BE0000', '#820000', '#460000'];
  const IN_SR = '#d1d4dc';
  function reference(b: Bar[], cfg: Cfg) {
    const n = b.length;
    const close = b.map((x) => x.close), high = b.map((x) => x.high), low = b.map((x) => x.low);
    const don = (len: number) => {
      const h = extreme(high, len, false), l = extreme(low, len, true);
      return h.map((v, i) => (l[i] + v) / 2);
    };
    const conv = don(cfg.conversionPeriods), base = don(cfg.basePeriods);
    const lead1 = conv.map((v, i) => (v + base[i]) / 2), lead2 = don(cfg.laggingSpan);
    const d = cfg.displacement - 1;
    const mn = (x: number, y: number) => (isNaN(x) || isNaN(y) ? NaN : Math.min(x, y));
    const mx = (x: number, y: number) => (isNaN(x) || isNaN(y) ? NaN : Math.max(x, y));
    const cMin = close.map((_, i) => mn(at(lead1, i - d), at(lead2, i - d)));
    const cMax = close.map((_, i) => mx(at(lead1, i - d), at(lead2, i - d)));
    const tole = atr(b, cfg.atrLen).map((v) => (cfg.useAtr ? v * cfg.atrMult : 0));
    const mtrend: number[] = [], trend: number[] = [];
    const osc: number[] = [], lag: number[] = [], cb: number[] = [], cloud: number[] = [];
    let m = 0, t = 0;
    for (let i = 0; i < n; i++) {
      const c = close[i];
      const m1 = i > 0 ? mtrend[i - 1] : NaN;
      m = c > cMax[i] ? 1 : c < cMin[i] ? -1 : m;
      mtrend.push(m);
      osc.push(m === 1 ? c - cMin[i] : c - cMax[i]);
      lag.push(osc[i] + (m === 1 ? mx(c - at(cMax, i - d), 0) : mn(c - at(cMin, i - d), 0)));
      cb.push(lag[i] + (m === 1 ? mx(conv[i] - base[i], 0) : mn(conv[i] - base[i], 0)));
      cloud.push(cb[i] + (m === 1 ? mx(lead1[i] - lead2[i], 0) : mn(lead1[i] - lead2[i], 0)));
      const rising = conv[i] - at(conv, i - 1) > 0 || base[i] - at(base, i - 1) > 0;
      const falling = conv[i] - at(conv, i - 1) < 0 || base[i] - at(base, i - 1) < 0;
      if (m === 1) {
        if (m1 === -1) t = 0;
        if (t < 4 && c > cMax[i]) {
          t = (lag[i] > osc[i] ? 1 : 0) + (conv[i] >= base[i] && rising ? 1 : 0) + (lead1[i] >= lead2[i] ? 1 : 0) + 1;
        } else if (conv[i] < base[i] - tole[i]) t = 0;
      } else if (m === -1) {
        if (m1 === 1) t = 0;
        if (t > -4 && c < cMin[i]) {
          t = (lag[i] < osc[i] ? -1 : 0) - (conv[i] <= base[i] && falling ? 1 : 0) - (lead1[i] <= lead2[i] ? 1 : 0) - 1;
        } else if (conv[i] > base[i] + tole[i]) t = 0;
      }
      trend.push(t);
    }
    // plot colours of the original (a comparison with a na value is false)
    const cloudCol = mtrend.map((v) => (v === 1 ? UP[3] : DN[3]));
    const cbCol = conv.map((v, i) => (v >= base[i] ? UP[2] : DN[2]));
    const lagCol = close.map((c, i) => (c > cMax[i] ? UP[1] : c < cMin[i] ? DN[1] : 'transparent'));
    const oscCol = close.map((c, i) => (c >= cMin[i] && c <= cMax[i] ? IN_SR : c > cMax[i] ? UP[0] : DN[0]));
    return { mtrend, trend, osc, lag, cb, cloud, cloudCol, cbCol, lagCol, oscCol };
  }
  /** colours of the drawn points (na points carry no colour) */
  const colours = (s: { value: number; color?: string }[]) => s.map((p) => (isNaN(p.value) ? null : p.color));
  const expected = (values: number[], cols: string[]) => values.map((v, i) => (isNaN(v) ? null : cols[i]));
  const drawn = (a: number[]) => a.map((_, i) => i).filter((i) => !isNaN(a[i]));

  const cases = [
    ['defaults, walk', bars, {}],
    ['defaults, walk 4242', bars2, {}],
    ['plateaus', flat, {}],
    ['9 / 26 / 52 / 26, no ATR', bars2, { conversionPeriods: 9, basePeriods: 26, laggingSpan: 52, displacement: 26, useAtr: false }],
  ] as const;
  for (const [name, list, inputs] of cases) {
    it(`draws no zero line; layer colours and background as the original (${name})`, () => {
      const cfg = { ...ichimoku.defaultInputs, ...inputs } as Cfg;
      const ref = reference(list, cfg);
      const r = ichimoku.calculate(list, inputs);
      // the original has no hline
      expect(r.hlines === undefined || r.hlines.length === 0).toBe(true);
      expectSeries(vals(r.plots.plot1), ref.cb, 'ConvBase');
      expect(colours(r.plots.plot0)).toEqual(expected(ref.cloud, ref.cloudCol));
      expect(colours(r.plots.plot1)).toEqual(expected(ref.cb, ref.cbCol));
      expect(colours(r.plots.plot2)).toEqual(expected(ref.lag, ref.lagCol));
      expect(colours(r.plots.plot3)).toEqual(expected(ref.osc, ref.oscCol));
      // the rules differ from the mtrend side: each case is reached on these walks
      expect(drawn(ref.cb).some((i) => ref.mtrend[i] === 1 && ref.cbCol[i] === DN[2])).toBe(true);
      expect(drawn(ref.lag).some((i) => ref.lagCol[i] === 'transparent')).toBe(true);
      expect(drawn(ref.osc).some((i) => ref.oscCol[i] === IN_SR)).toBe(true);
      // background: rgb(0, 159 + trend^3, 0, 60) / rgb(0, 0, 159 - trend^3, 60), the zone colour without transparency
      const bg = ref.trend.map((t) => (t > 0 ? `rgba(0, ${159 + t ** 3}, 0, 0.4)` : t < 0 ? `rgba(0, 0, ${159 - t ** 3}, 0.4)` : IN_SR));
      expect(r.bgColors.map((g) => g.color)).toEqual(bg);
      // no trend (zone colour, opaque) before the cloud exists
      const cloudStart = Math.max(cfg.laggingSpan, cfg.conversionPeriods, cfg.basePeriods) - 1 + cfg.displacement - 1;
      expect(r.bgColors.slice(0, cloudStart).every((g) => g.color === IN_SR)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
describe('matrix-series: green #008000 / red #FF0000 of the original', () => {
  function reference(b: Bar[], nn: number) {
    const ys1 = b.map((x) => (x.high + x.low + x.close * 2) / 4);
    const rk3 = ema(ys1, nn), rk4 = stdev(ys1, nn);
    const rk5 = ys1.map((v, i) => (rk4[i] === 0 ? NaN : ((v - rk3[i]) * 200) / rk4[i]));
    const up = ema(ema(rk5, nn), nn);
    const down = ema(up, nn);
    return { up, down };
  }
  for (const [name, list, inputs] of [['walk', bars, {}], ['walk 4242, smoother 3', bars2, { smoother: 3 }]] as const) {
    it(`candles coloured green when up > down, else red (${name})`, () => {
      const cfg = { ...matrix.defaultInputs, ...inputs };
      const ref = reference(list, cfg.smoother);
      const candles = matrix.calculate(list, inputs).plotCandles.candle0;
      // vcolor = Oo > Cc ? red : up > down ? green : red (Oo is the smaller value: never above Cc)
      const want = ref.up.map((u, i) => (isNaN(u) || isNaN(ref.down[i]) ? null : u > ref.down[i] ? '#008000' : '#FF0000'));
      const got = candles.map((c) => (isNaN(c.open) ? null : c.color));
      expect(got).toEqual(want);
      expect(want.filter((c) => c === '#008000').length).toBeGreaterThan(50);
      expect(want.filter((c) => c === '#FF0000').length).toBeGreaterThan(50);
    });
  }
  it('resistance line green, support line red, no other colour of the port', () => {
    const byId = (id: string) => matrix.plotConfig.find((p) => p.id === id);
    expect(byId('resistance')?.color).toBe('#008000');
    expect(byId('support')?.color).toBe('#FF0000');
    const r = matrix.calculate(bars);
    const used = new Set([
      ...r.plotCandles.candle0.map((c) => c.color).filter(Boolean),
      ...Object.values(r.plots).flat().map((p) => (p as { color?: string }).color).filter(Boolean),
    ]);
    expect([...used].sort()).toEqual(['#008000', '#FF0000']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('schaff-trend-cycle: an overlay as the original', () => {
  function reference(b: Bar[], length: number, fast: number, slow: number, factor: number) {
    const close = b.map((x) => x.close);
    const f = ema(close, fast), s = ema(close, slow);
    const m = f.map((v, i) => v - s[i]);
    const v1 = extreme(m, length, true), hm = extreme(m, length, false);
    const pf: number[] = [], out: number[] = [];
    let f1 = 0, f2 = 0;
    for (let i = 0; i < b.length; i++) {
      // f1 = v2 > 0 ? ... : nz(f1[1]); pf = na(pf[1]) ? f1 : pf[1] + factor * (f1 - pf[1])
      const v2 = hm[i] - v1[i];
      f1 = v2 > 0 ? ((m[i] - v1[i]) / v2) * 100 : f1;
      pf.push(isNaN(at(pf, i - 1)) ? f1 : pf[i - 1] + factor * (f1 - pf[i - 1]));
      const w = i < length - 1 ? [NaN] : win(pf, i, length);
      const v3 = w.some(isNaN) ? NaN : Math.min(...w);
      const v4 = (w.some(isNaN) ? NaN : Math.max(...w)) - v3;
      f2 = v4 > 0 ? ((pf[i] - v3) / v4) * 100 : f2;
      out.push(isNaN(at(out, i - 1)) ? f2 : out[i - 1] + factor * (f2 - out[i - 1]));
    }
    return out;
  }
  it('metadata, result and registry entry draw on the price chart', () => {
    expect(stc.metadata.overlay).toBe(true);
    expect(stc.calculate(bars).metadata.overlay).toBe(true);
    const entry = indicatorRegistry.find((e) => e.id === 'schaff-trend-cycle');
    expect(entry?.overlay).toBe(true);
    expect(entry?.metadata?.overlay).toBe(true);
  });
  it('still draws the one Schaff_TC plot of the original', () => {
    const d = stc.defaultInputs;
    const r = stc.calculate(bars2);
    expect(Object.keys(r.plots)).toEqual(['plot0']);
    expectSeries(vals(r.plots.plot0), reference(bars2, d.length, d.fastLength, d.slowLength, d.factor), 'STC', 6);
  });
});
