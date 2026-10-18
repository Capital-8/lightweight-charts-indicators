/**
 * Community ports re-ported from their originals (reports batch 5): rsi-histoalert, rsi-swing-signal, smi-ucs,
 * squeeze-momentum-v2. Outputs (plot ids / titles, marker ids, fills, levels) as the originals declare them; the main
 * series and the alert conditions re-computed here from the originals' formulas on a seeded random walk.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as histo from '../../src/community/rsi-histoalert';
import * as swing from '../../src/community/rsi-swing-signal';
import * as smi from '../../src/community/smi-ucs';
import * as sqz from '../../src/community/squeeze-momentum-v2';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of daily bars */
function walk(count: number, seed0: number, step = 86400, start = 1577836800): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4);
    out.push({ time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume: 1e6 });
  }
  return out;
}
const bars = walk(1500, 7);
const N = bars.length;

// ---- reference implementations (Pine semantics) ----

const isNa = (v: number) => v == null || Number.isNaN(v);

function sma(src: number[], len: number): number[] {
  return src.map((_v, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) { if (isNa(src[k])) return NaN; s += src[k]; }
    return s / len;
  });
}
function stdev(src: number[], len: number): number[] {
  const m = sma(src, len);
  return src.map((_v, i) => {
    if (isNa(m[i])) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += (src[k] - m[i]) ** 2;
    return Math.sqrt(s / len);
  });
}
/** ta.ema: seeded with the SMA of the first full window, then alpha = 2 / (len + 1) */
function ema(src: number[], len: number): number[] {
  const a = 2 / (len + 1);
  const s = sma(src, len);
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const prev = i > 0 ? out[i - 1] : NaN;
    out.push(isNa(prev) ? s[i] : a * src[i] + (1 - a) * prev);
  }
  return out;
}
/** ta.rma: seeded with the SMA, then alpha = 1 / len */
function rma(src: number[], len: number): number[] {
  const s = sma(src, len);
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const prev = i > 0 ? out[i - 1] : NaN;
    out.push(isNa(prev) ? s[i] : (src[i] + (len - 1) * prev) / len);
  }
  return out;
}
function rsi(src: number[], len: number): number[] {
  const ch = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const up = rma(ch.map((c) => (isNa(c) ? NaN : Math.max(c, 0))), len);
  const dn = rma(ch.map((c) => (isNa(c) ? NaN : -Math.min(c, 0))), len);
  return up.map((u, i) => (isNa(u) || isNa(dn[i]) ? NaN : dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / dn[i])));
}
function highest(src: number[], len: number): number[] {
  return src.map((_v, i) => (i < len - 1 ? NaN : Math.max(...src.slice(i - len + 1, i + 1))));
}
function lowest(src: number[], len: number): number[] {
  return src.map((_v, i) => (i < len - 1 ? NaN : Math.min(...src.slice(i - len + 1, i + 1))));
}
/** ta.linreg(src, len, 0): least squares line over the window, value at its last bar */
function linreg(src: number[], len: number): number[] {
  return src.map((_v, i) => {
    if (i < len - 1) return NaN;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = 0; k < len; k++) {
      const y = src[i - len + 1 + k];
      if (isNa(y)) return NaN;
      sx += k; sy += y; sxx += k * k; sxy += k * y;
    }
    const slope = (len * sxy - sx * sy) / (len * sxx - sx * sx);
    const icpt = (sy - slope * sx) / len;
    return icpt + slope * (len - 1);
  });
}
/** Pivot high (low): the value right bars back is above (below) the left and right neighbours (no ties here) */
function pivot(src: number[], left: number, right: number, high: boolean): number[] {
  return src.map((_v, i) => {
    const c = i - right;
    if (c - left < 0) return NaN;
    const v = src[c];
    if (isNa(v)) return NaN;
    for (let k = c - left; k <= i; k++) {
      if (k === c) continue;
      if (isNa(src[k]) || (high ? src[k] >= v : src[k] <= v)) return NaN;
    }
    return v;
  });
}

const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);

function expectClose(actual: number[], expected: number[], tol = 1e-8) {
  expect(actual.length).toBe(expected.length);
  let checked = 0;
  for (let i = 0; i < expected.length; i++) {
    if (isNa(expected[i])) { expect(isNa(actual[i])).toBe(true); continue; }
    expect(Math.abs(actual[i] - expected[i])).toBeLessThan(tol * Math.max(1, Math.abs(expected[i])));
    checked++;
  }
  expect(checked).toBeGreaterThan(expected.length / 2);
}
const values = (pts: { value: number }[]) => pts.map((p) => p.value);

// ---- RSI HistoAlert Strategy ----

describe('rsi-histoalert', () => {
  const res = histo.calculate(bars);
  it('declares the original outputs', () => {
    expect(histo.metadata).toMatchObject({ title: 'RSI HistoAlert Strategy', shortTitle: 'RSI HistoAlert Strategy', overlay: false });
    expect(histo.plotConfig.map((p) => [p.id, p.title, p.lineWidth, p.style ?? 'line'])).toEqual([
      ['plot0', 'RSI HistoAlert', 1, 'line'],
      ['plot1', 'Histogram', 1, 'histogram'],
    ]);
    expect(histo.plotConfig[0].color).toBe('#0000FF');
    expect(histo.inputConfig.map((c) => [c.id, c.title, c.defval])).toEqual([
      ['rsiLen', 'RSIPeriod', 13], ['buyAlertLevel', 'BuyAlertLevel', -10], ['sellAlertLevel', 'SellAlertLevel', 10], ['rsiHistoModify', 'RSIHistoModify', 1.5],
    ]);
    expect(res.hlines!.map((h) => [h.options?.title, h.value])).toEqual([['Level', 0], ['Level', -10], ['Level', 10]]);
    expect(res.barColors.every((b) => b.id === 'barcolor0')).toBe(true);
  });
  it('recomputes RSIMain, the histogram colours and the bar colours', () => {
    const main = rsi(close, 13).map((v) => (v - 50) * 1.5);
    expectClose(values(res.plots.plot0), main);
    expectClose(values(res.plots.plot1), main);
    res.plots.plot1.forEach((p, i) => { if (!isNa(main[i])) expect(p.color).toBe(main[i] >= 0 ? '#008000' : '#FF0000'); });
    let pos = 0;
    const expected = main.map((m) => {
      pos = gt(m, -10) ? 1 : lt(m, 10) ? -1 : pos;
      return pos === -1 ? '#FF0000' : pos === 1 ? '#008000' : '#0000FF';
    });
    expect(res.barColors.map((b) => b.color)).toEqual(expected);
    expect(res.barColors[0].color).toBe('#0000FF');
  });
  it('levels follow the inputs', () => {
    const r = histo.calculate(bars, { buyAlertLevel: -20, sellAlertLevel: 25 });
    expect(r.hlines!.map((h) => h.value)).toEqual([0, -20, 25]);
  });
});

// ---- RSI Swing Signal ----

function swingSignals(b: Bar[], lookback = 7, ob = 80, os = 20, len = 7) {
  const c = b.map((x) => x.close), o = b.map((x) => x.open), h = b.map((x) => x.high), l = b.map((x) => x.low);
  const r = rsi(c, len);
  const sh = highest(h, lookback), sl = lowest(l, lookback);
  const sell = r.map((v) => v > ob), buy = r.map((v) => v < os);
  const b1: boolean[] = [], b2: boolean[] = [], s1: boolean[] = [], s2: boolean[] = [];
  for (let i = 0; i < b.length; i++) {
    const bb = buy[i] || (i > 0 && buy[i - 1]);
    const ss = sell[i] || (i > 0 && sell[i - 1]);
    const ok = i >= 2;
    b1.push(ok && bb && c[i - 1] < o[i - 1] && c[i] > o[i - 1] && l[i] > l[i - 1] && l[i - 1] < l[i - 2] && l[i - 1] === sl[i] && o[i] <= c[i - 1]);
    b2.push(i >= 1 && bb && c[i - 1] < o[i - 1] && c[i] > o[i - 1] && l[i] < l[i - 1] && l[i] === sl[i] && o[i] <= c[i - 1]);
    s2.push(i >= 1 && ss && c[i - 1] > o[i - 1] && c[i] < o[i - 1] && h[i] > h[i - 1] && h[i] === sh[i] && o[i] >= c[i - 1]);
    s1.push(ok && ss && c[i - 1] > o[i - 1] && c[i] < o[i - 1] && h[i] < h[i - 1] && h[i - 1] > h[i - 2] && h[i - 1] === sh[i] && o[i] >= c[i - 1]);
  }
  return { r, b1, b2, s1, s2 };
}

describe('rsi-swing-signal', () => {
  const res = swing.calculate(bars);
  const ref = swingSignals(bars);
  it('declares the original outputs', () => {
    expect(swing.metadata).toMatchObject({ title: 'RSI Swing Signal', shortTitle: 'RSI+', overlay: false });
    expect(swing.plotConfig.map((p) => [p.id, p.title, p.lineWidth])).toEqual([['plot0', 'RSI', 2]]);
    expect(swing.inputConfig.map((c) => [c.id, c.title, c.defval])).toEqual([
      ['lookback', 'Lookback:', 7], ['rsiOB', 'RSI Overbought Level:', 80], ['rsiOS', 'RSI Oversold Level:', 20], ['rsiLen', 'RSI Length:', 7], ['src', 'RSI Source:', 'close'],
    ]);
    expect(res.hlines!.map((h) => [h.options?.title, h.value])).toEqual([['RSI Overbought', 80], ['RSI Oversold', 20], ['Midpoint', 50]]);
    expect(new Set(res.bgColors.map((b) => b.id))).toEqual(new Set(['bgcolor0', 'bgcolor1']));
    expect(swing.alertConditions).toEqual([{ id: 'alert0', title: 'RSI SIGNAL', message: 'RSI Exhaustion signal for {{ticker}}' }]);
  });
  it('recomputes the RSI and its colours', () => {
    expectClose(values(res.plots.plot0), ref.r);
    res.plots.plot0.forEach((p, i) => {
      if (!isNa(ref.r[i])) expect(p.color).toBe(ref.r[i] > 80 ? '#F23645' : ref.r[i] < 20 ? '#00E676' : '#4985e7');
    });
  });
  it('recomputes the backgrounds and the alert condition', () => {
    const t = (f: boolean[]) => bars.filter((_b, i) => f[i]).map((b) => b.time);
    expect(res.bgColors.filter((b) => b.id === 'bgcolor0').map((b) => b.time)).toEqual(t(ref.b1.map((v, i) => v || ref.s1[i])));
    expect(res.bgColors.filter((b) => b.id === 'bgcolor1').map((b) => b.time)).toEqual(t(ref.b2.map((v, i) => v || ref.s2[i])));
    const any = ref.b1.map((v, i) => v || ref.b2[i] || ref.s1[i] || ref.s2[i]);
    expect(any.filter(Boolean).length).toBeGreaterThan(3);
    expect(res.alerts[0].times).toEqual(t(any));
    expect(ref.b2.some(Boolean) || ref.b1.some(Boolean)).toBe(true);
    expect(ref.s2.some(Boolean) || ref.s1.some(Boolean)).toBe(true);
  });
});

// ---- UCS_Stochastic Momentum Index ----

describe('smi-ucs', () => {
  const res = smi.calculate(bars);
  it('declares the original outputs', () => {
    expect(smi.metadata).toMatchObject({ title: 'UCS_Stochastic Momentum Index', shortTitle: 'UCS_SMI', overlay: false });
    expect(smi.plotConfig.map((p) => [p.id, p.title, p.color])).toEqual([
      ['plot0', 'Stochastic Momentum Index', '#2962FF'], ['plot1', 'SMI Signal Line', '#FF0000'], ['plot2', 'Over Bought', '#FF0000'],
      ['plot3', 'Over Sold', '#008000'], ['plot4', 'Zero Line', '#0000FF'],
    ]);
    expect(smi.inputConfig.map((c) => [c.id, c.title, c.defval])).toEqual([['kLen', 'Percent K Length', 5], ['dLen', 'Percent D Length', 3]]);
    expect(res.hlines ?? []).toEqual([]);
    expect(values(res.plots.plot2).every((v) => v === 40)).toBe(true);
    expect(values(res.plots.plot3).every((v) => v === -40)).toBe(true);
    expect(values(res.plots.plot4).every((v) => v === 0)).toBe(true);
  });
  it('recomputes the SMI and its signal', () => {
    const hh = highest(high, 5), ll = lowest(low, 5);
    const diff = hh.map((h, i) => h - ll[i]);
    const rdiff = close.map((c, i) => c - (hh[i] + ll[i]) / 2);
    const avgrel = ema(ema(rdiff, 3), 3), avgdiff = ema(ema(diff, 3), 3);
    const s = avgdiff.map((d, i) => (!isNa(d) && d !== 0 ? avgrel[i] / (d / 2) * 100 : 0));
    expectClose(values(res.plots.plot0), s);
    expectClose(values(res.plots.plot1), ema(s, 3));
    expect(res.plots.plot0[0].value).toBe(0);
  });
});

// ---- Squeeze Momentum V2 with Divergence ----

describe('squeeze-momentum-v2', () => {
  // a longer walk: divergences of every kind
  const bars = walk(4000, 3);
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const res = sqz.calculate(bars);
  const L = 20;
  const basis = sma(close, L), dev = stdev(close, L).map((d) => d * 2);
  const ma = sma(close, L);
  const tr = bars.map((b, i) => (i === 0 ? NaN : Math.max(b.high - b.low, Math.abs(b.high - close[i - 1]), Math.abs(b.low - close[i - 1]))));
  const rangema = sma(tr, L);
  const sqzOn = basis.map((m, i) => gt(m - dev[i], ma[i] - rangema[i] * 1.5) && lt(m + dev[i], ma[i] + rangema[i] * 1.5));
  const sqzOff = basis.map((m, i) => lt(m - dev[i], ma[i] - rangema[i] * 1.5) && gt(m + dev[i], ma[i] + rangema[i] * 1.5));
  const hh = highest(high, L), ll = lowest(low, L), sc = sma(close, L);
  const val = linreg(close.map((c, i) => c - ((hh[i] + ll[i]) / 2 + sc[i]) / 2), L);

  it('declares the original outputs', () => {
    expect(sqz.metadata).toMatchObject({ title: 'Squeeze Momentum V2 with Divergence', shortTitle: 'SQZ Divergence', overlay: false });
    expect(sqz.plotConfig.map((p) => [p.id, p.title, p.lineWidth, p.style ?? 'line'])).toEqual([
      ['plot0', 'Squeeze Dots', 2, 'cross'], ['plot1', 'Momentum', 2, 'columns'], ['plot2', 'Zero Line', 1, 'line'], ['plot3', 'Signal', 1, 'line'],
    ]);
    expect(res.fills!.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([['plot1', 'plot2', 'Plots Background']]);
    expect(new Set(res.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1', 'shape2', 'shape3']));
    const byId = (id: string) => res.markers.filter((m) => m.id === id);
    expect(byId('shape0').every((m) => m.shape === 'labelUp' && m.text === 'Bull' && m.color === '#089981')).toBe(true);
    expect(byId('shape1').every((m) => m.shape === 'labelDown' && m.text === 'Bear' && m.color === '#f23645')).toBe(true);
    expect(byId('shape2').every((m) => m.shape === 'diamond' && m.text === 'H-Bull' && m.color === '#089981')).toBe(true);
    expect(byId('shape3').every((m) => m.shape === 'diamond' && m.text === 'H-Bear' && m.color === '#f23645')).toBe(true);
    expect(sqz.alertConditions.map((a) => [a.id, a.title, a.message])).toEqual([
      ['alert0', 'Regular Bullish Divergence', 'Bullish divergence detected on SQZ'],
      ['alert1', 'Regular Bearish Divergence', 'Bearish divergence detected on SQZ'],
      ['alert2', 'Squeeze Started', 'BB has entered KC'],
      ['alert3', 'Squeeze Released', 'BB has exited KC'],
    ]);
    expect(res.lines.length).toBeLessThanOrEqual(50);
    expect(res.labels.length).toBeLessThanOrEqual(50);
    expect(res.lines.some((l) => l.forceOverlay)).toBe(true);
    expect(res.lines.some((l) => !l.forceOverlay)).toBe(true);
  });

  it('recomputes the momentum, the signal and the squeeze dots', () => {
    expectClose(values(res.plots.plot1), val, 1e-7);
    expectClose(values(res.plots.plot3), sma(val, 5), 1e-7);
    res.plots.plot0.forEach((p, i) => {
      expect(p.value).toBe(0);
      expect(p.color).toBe(!sqzOn[i] && !sqzOff[i] ? '#2196f3' : sqzOn[i] ? '#000000' : '#787b86');
    });
  });

  it('recomputes the squeeze alerts', () => {
    const t = (f: boolean[]) => bars.filter((_b, i) => f[i]).map((b) => b.time);
    expect(sqzOn.some(Boolean) && sqzOff.some(Boolean)).toBe(true);
    expect(res.alerts[2].times).toEqual(t(sqzOn));
    expect(res.alerts[3].times).toEqual(t(sqzOff));
  });

  it('recomputes the divergences, their alerts and pane shapes', () => {
    const r = 5;
    const pTop = pivot(val, 5, r, true), pBot = pivot(val, 5, r, false);
    const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
    const find = (piv: number[], i: number, ok: (p: number, q: number) => boolean) => {
      if (isNa(piv[i])) return false;
      for (let k = 5; k <= 60; k++) if (!isNa(at(piv, i - k)) && ok(i - r, i - k - r)) return true;
      return false;
    };
    const bull = bars.map((_b, i) => find(pBot, i, (p, q) => gt(at(val, p), at(val, q)) && lt(at(low, p), at(low, q))));
    const bear = bars.map((_b, i) => find(pTop, i, (p, q) => lt(at(val, p), at(val, q)) && gt(at(high, p), at(high, q))));
    const hBull = bars.map((_b, i) => find(pBot, i, (p, q) => lt(at(val, p), at(val, q)) && gt(at(low, p), at(low, q))));
    const hBear = bars.map((_b, i) => find(pTop, i, (p, q) => gt(at(val, p), at(val, q)) && lt(at(high, p), at(high, q))));
    expect(bull.filter(Boolean).length).toBeGreaterThan(2);
    expect(bear.filter(Boolean).length).toBeGreaterThan(2);
    const t = (f: boolean[]) => bars.filter((_b, i) => f[i]).map((b) => b.time);
    expect(res.alerts[0].times).toEqual(t(bull));
    expect(res.alerts[1].times).toEqual(t(bear));
    // plotshape(..., offset = -lookbackRight): drawn r bars back, at val there
    const shifted = (f: boolean[]) => bars.filter((_b, i) => f[i]).map((_b) => _b.time - r * 86400);
    const mk = (id: string) => res.markers.filter((m) => m.id === id);
    expect(mk('shape0').map((m) => m.time)).toEqual(shifted(bull));
    expect(mk('shape1').map((m) => m.time)).toEqual(shifted(bear));
    expect(mk('shape2').map((m) => m.time)).toEqual(shifted(hBull));
    expect(mk('shape3').map((m) => m.time)).toEqual(shifted(hBear));
    for (const m of mk('shape0')) expect(m.price).toBeCloseTo(val[(m.time - bars[0].time) / 86400], 8);
  });

  it('switches the pane / price drawings with the inputs', () => {
    const off = sqz.calculate(bars, { showDiv: false, showPriceDiv: false });
    expect(off.markers).toEqual([]);
    expect(off.lines).toEqual([]);
    expect(off.labels).toEqual([]);
    expect(off.alerts[0].times).toEqual(res.alerts[0].times);
    const pane = sqz.calculate(bars, { showPriceDiv: false });
    expect(pane.lines.every((l) => !l.forceOverlay)).toBe(true);
    expect(pane.labels).toEqual([]);
  });
});
