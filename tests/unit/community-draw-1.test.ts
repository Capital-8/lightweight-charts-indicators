/**
 * Community ports, drawing pass 1: markers the originals do not draw are gone, PPO Divergence draws its 8 divergence
 * circle plots as the original (recomputed here from the original's formulas), UCS Top & Bottom Candle colours its
 * bars with the barcolor ids, and the outputs the originals do draw are kept.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as atrColored from '../../src/community/atr-trailing-colored';
import * as matrix from '../../src/community/matrix-series';
import * as ppo from '../../src/community/ppo-divergence';
import * as tbc from '../../src/community/top-bottom-candle';
import * as banker from '../../src/community/banker-fund-flow';
import * as tpx from '../../src/community/redk-tpx';
import * as obs from '../../src/community/order-blocks-signals';
import * as rsd from '../../src/community/rsi-supply-demand';

/** Seeded random walk of daily bars; `tick` rounds the prices (equal highs / lows: plateaus) */
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
const flat = walk(1300, 99, 1); // whole-number prices: many equal highs / lows

// --- Pine reference helpers (independent of the port) ---
const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
/** ta.ema: na until the length-th valid value (seeded with their mean), na on na bars */
function ema(src: number[], len: number): number[] {
  const out: number[] = [];
  const a = 2 / (len + 1);
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!Number.isFinite(v)) { out.push(NaN); continue; }
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
/** ta.sma: na unless the last len values exist */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
/** ta.highest / ta.lowest: best of the last len non-na values, na before bar len - 1 */
function extreme(src: number[], len: number, low: boolean): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let best = NaN, seen = 0;
    for (let k = i; k >= 0 && seen < len; k--) {
      if (isNaN(src[k])) continue;
      seen++;
      if (isNaN(best) || (low ? src[k] < best : src[k] > best)) best = src[k];
    }
    return best;
  });
}
function valuewhen(cond: boolean[], src: number[], occ: number): number[] {
  return cond.map((_, i) => {
    let c = 0;
    for (let k = i; k >= 0; k--) if (cond[k]) { if (c === occ) return src[k]; c++; }
    return NaN;
  });
}
function barssince(cond: boolean[]): number[] {
  return cond.map((_, i) => {
    for (let k = i; k >= 0; k--) if (cond[k]) return i - k;
    return NaN;
  });
}

const vals = (s: { value: number }[]) => s.map((p) => p.value);
function expectSeries(actual: number[], expected: number[], label: string) {
  expect(actual.length, label).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (isNaN(expected[i])) expect(actual[i], `${label} @${i}`).toBeNaN();
    else expect(actual[i], `${label} @${i}`).toBeCloseTo(expected[i], 8);
  }
}

describe('atr-trailing-colored', () => {
  it('draws no buy / sell markers (the original plots only the stop)', () => {
    const r = atrColored.calculate(bars) as Record<string, unknown>;
    expect(r.markers).toBeUndefined();
    expect((r.plots as Record<string, unknown[]>).plot0.length).toBe(bars.length);
  });
});

describe('matrix-series', () => {
  const r = matrix.calculate(bars);
  it('draws no cross markers, only the two cross plots', () => {
    expect((r as Record<string, unknown>).markers).toBeUndefined();
    expect(matrix.plotConfig.filter((p) => p.style === 'cross').map((p) => p.id)).toEqual(['obMarker', 'osMarker']);
  });
  it('keeps UPshape / DOWNshape on the cross plots', () => {
    const { ob, os } = matrix.defaultInputs;
    const candles = r.plotCandles.candle0;
    const up: number[] = [], dn: number[] = [];
    for (const c of candles) {
      const green = c.color === '#008000';
      up.push(green ? c.close : c.open);
      dn.push(green ? c.open : c.close);
    }
    // UPshape = up > ob and up > down ? up + 20 : up > ob and up < down ? down + 20 : na
    const upShape = up.map((u, i) => (u > ob && u > dn[i] ? u + 20 : u > ob && u < dn[i] ? dn[i] + 20 : NaN));
    const dnShape = up.map((u, i) => (dn[i] < os && u > dn[i] ? dn[i] - 20 : dn[i] < os && u < dn[i] ? u - 20 : NaN));
    expectSeries(vals(r.plots.obMarker), upShape, 'UPshape');
    expectSeries(vals(r.plots.osMarker), dnShape, 'DOWNshape');
    expect(upShape.some((v) => !isNaN(v)) || dnShape.some((v) => !isNaN(v))).toBe(true);
  });
});

/** The original's PPO divergence script, bar by bar */
function ppoReference(list: Bar[], longTermDiv = true, look = 55) {
  const close = list.map((b) => b.close), low = list.map((b) => b.low), high = list.map((b) => b.high);
  const fast = ema(close, 12), slow = ema(close, 26);
  const macd2 = close.map((_, i) => ((fast[i] - slow[i]) / slow[i]) * 100);
  const d = sma(macd2, 2);
  const n = list.length;
  const L = (i: number, k: number) => at(low, i - k), H = (i: number, k: number) => at(high, i - k), D = (i: number, k: number) => at(d, i - k);
  const priceMins = d.map((_, i) => (L(i, 0) > L(i, 1) && L(i, 1) < L(i, 2))
    || (L(i, 1) === L(i, 2) && L(i, 1) < L(i, 0) && L(i, 1) < L(i, 3))
    || (L(i, 1) === L(i, 2) && L(i, 1) === L(i, 3) && L(i, 1) < L(i, 0) && L(i, 1) < L(i, 4))
    || (L(i, 1) === L(i, 2) && L(i, 1) === L(i, 3) && !!L(i, 1) && L(i, 1) === L(i, 4) && L(i, 1) < L(i, 0) && L(i, 1) < L(i, 5)));
  const priceMax = d.map((_, i) => (H(i, 0) < H(i, 1) && H(i, 1) > H(i, 2))
    || (H(i, 1) === H(i, 2) && H(i, 1) > H(i, 0) && H(i, 1) > H(i, 3))
    || (H(i, 1) === H(i, 2) && H(i, 1) === H(i, 3) && H(i, 1) > H(i, 0) && H(i, 1) > H(i, 4))
    || (H(i, 1) === H(i, 2) && H(i, 1) === H(i, 3) && !!H(i, 1) && H(i, 1) === H(i, 4) && H(i, 1) > H(i, 0) && H(i, 1) > H(i, 5)));
  const oscMins = d.map((_, i) => D(i, 0) > D(i, 1) && D(i, 1) < D(i, 2));
  const oscMax = d.map((_, i) => D(i, 0) < D(i, 1) && D(i, 1) > D(i, 2));
  const d1 = d.map((_, i) => D(i, 1)), low1 = low.map((_, i) => L(i, 1)), high1 = high.map((_, i) => H(i, 1));
  const ct4 = valuewhen(oscMins, d1, 0), ct5 = valuewhen(oscMax, d1, 0);
  const ct6 = valuewhen(priceMins, low1, 0), ct7 = valuewhen(priceMax, high1, 0);
  const bsOMin = barssince(oscMins), bsOMax = barssince(oscMax), bsPMin = barssince(priceMins), bsPMax = barssince(priceMax);
  const delayedlow = d.map((_, i) => (priceMins[i] && bsOMin[i] < 3 ? low1[i] : NaN));
  const delayedhigh = d.map((_, i) => (priceMax[i] && bsOMax[i] < 3 ? high1[i] : NaN));
  const l6 = extreme(ct6, 4, true), h7 = extreme(ct7, 4, false);
  const filter = d.map((_, i) => (bsPMin[i] < 5 ? l6[i] : NaN));
  const filter2 = d.map((_, i) => (bsPMax[i] < 5 ? h7[i] : NaN));
  const y2 = valuewhen(oscMax, filter2, 1), y6 = valuewhen(oscMins, filter, 1);
  const ltBull = valuewhen(priceMins, extreme(low, look, true), 1);
  const ltBear = valuewhen(priceMax, extreme(high, look, false), 1);
  const y3 = valuewhen(oscMax, ct5, 0), y4 = valuewhen(oscMax, ct5, 1);
  const y7 = valuewhen(oscMins, ct4, 0), y8 = valuewhen(oscMins, ct4, 1);
  const y9 = valuewhen(oscMins, ct6, 0), y10 = valuewhen(oscMax, ct7, 0);
  const hd = extreme(d, look, false), ld = extreme(d, look, true);
  const bulldiv = d.map((_, i) => (oscMins[i] ? d1[i] : NaN));
  const beardiv = d.map((_, i) => (oscMax[i] ? d1[i] : NaN));
  const shiftBack = (s: number[]) => s.map((_, i) => (i + 1 < n ? s[i + 1] : NaN)); // offset = -1
  const div: boolean[][] = [[], [], [], [], [], [], [], []];
  for (let i = 0; i < n; i++) {
    const iB = ct5[i] < hd[i], i2 = y10[i] > ltBear[i], i3 = delayedhigh[i] > ltBear[i];
    const i4 = ct4[i] > ld[i], i5 = y9[i] < ltBull[i], i6 = delayedlow[i] < ltBull[i];
    div[0].push(y10[i] > y2[i] && oscMax[i] && y3[i] < y4[i]);
    div[1].push(y9[i] < y6[i] && oscMins[i] && y7[i] > y8[i]);
    div[2].push(delayedlow[i] < y6[i] && y7[i] > y8[i]);
    div[3].push(delayedhigh[i] > y2[i] && y3[i] < y4[i]);
    div[4].push(longTermDiv && oscMax[i] && iB && i2);
    div[5].push(longTermDiv && oscMins[i] && i4 && i5);
    div[6].push(longTermDiv && iB && i3);
    div[7].push(longTermDiv && i4 && i6);
  }
  return [d, shiftBack(bulldiv), shiftBack(beardiv), ...div.map((c) => c.map((f, i) => (f ? d[i] : NaN)))];
}

describe('ppo-divergence', () => {
  const ids = ['plot0', 'plot1', 'plot2', 'plot3', 'plot4', 'plot5', 'plot6', 'plot7', 'plot8', 'plot9', 'plot10'];
  it('declares the 11 plots of the original, in its order (8 divergence circle plots)', () => {
    expect(ppo.plotConfig.map((p) => p.id)).toEqual(ids);
    expect(ppo.plotConfig.map((p) => p.title)).toEqual(['Plot', 'Tops', 'Bottoms', 'Bearish Divergence2', 'Bullish Divergence2',
      'Bullish Divergence2', 'Bearish Divergence2', 'Bearish Divergence2', 'Bullish Divergence2', 'Bearish Divergence2', 'Bullish Divergence2']);
    expect(ppo.plotConfig.slice(1).every((p) => p.style === 'circles' && p.lineWidth === 4)).toBe(true);
    expect(ppo.plotConfig.map((p) => p.color)).toEqual(['#FFFFFF', '#00FFFF', '#FF0000', '#FF7F00', '#800080', '#800080',
      '#FF7F00', '#FF7F00', '#800080', '#FF7F00', '#800080']);
  });
  for (const [name, list] of [['walk', bars], ['plateaus', flat]] as const) {
    it(`draws every plot as the original (${name}), no markers`, () => {
      const r = ppo.calculate(list);
      expect((r as Record<string, unknown>).markers).toBeUndefined();
      const ref = ppoReference(list);
      ids.forEach((id, k) => expectSeries(vals(r.plots[id]), ref[k], id));
      // every divergence plot fires on these bars
      for (let k = 3; k < 11; k++) expect(ref[k].some((v) => !isNaN(v)), ids[k]).toBe(true);
      // d exists from the bar of the first sma(ppo, 2) (ema 26 seeded on bar 25)
      expect(ref[0].findIndex((v) => !isNaN(v))).toBe(26);
    });
  }
  it('long term divergence plots are na with "Use long term Divergences?" off', () => {
    const r = ppo.calculate(bars, { longTermDiv: false });
    const ref = ppoReference(bars, false);
    ids.forEach((id, k) => expectSeries(vals(r.plots[id]), ref[k], id));
    for (const id of ['plot7', 'plot8', 'plot9', 'plot10']) expect(vals(r.plots[id]).every((v) => isNaN(v))).toBe(true);
  });
});

describe('top-bottom-candle', () => {
  it('colours the bars (barcolor0 lime / barcolor1 red) and draws no Top / Bot markers', () => {
    const r = tbc.calculate(bars);
    expect((r as Record<string, unknown>).markers).toBeUndefined();
    const close = bars.map((b) => b.close);
    const ll = extreme(bars.map((b) => b.low), 5, true), hh = extreme(bars.map((b) => b.high), 5, false);
    const diff = hh.map((h, i) => h - ll[i]);
    const rdiff = close.map((c, i) => c - (hh[i] + ll[i]) / 2);
    const avgrel = ema(ema(rdiff, 3), 3), avgdiff = ema(ema(diff, 3), 3);
    const mom = close.map((c, i) => ((c - at(close, i - 3)) / at(close, i - 3)) * 1000);
    const smi = avgdiff.map((a, i) => (isNaN(a) ? NaN : a !== 0 ? (avgrel[i] / (a / 2)) * 100 : 0));
    const long = bars.filter((_, i) => smi[i] < -35 && mom[i] > 0 && at(mom, i - 1) < 0).map((b) => b.time);
    const short = bars.filter((_, i) => smi[i] > 35 && mom[i] < 0 && at(mom, i - 1) > 0).map((b) => b.time);
    expect(long.length).toBeGreaterThan(0);
    expect(short.length).toBeGreaterThan(0);
    expect(r.barColors.filter((c) => c.id === 'barcolor0').map((c) => c.time)).toEqual(long);
    expect(r.barColors.filter((c) => c.id === 'barcolor1').map((c) => c.time)).toEqual(short);
    expect(r.barColors.every((c) => (c.id === 'barcolor0' ? c.color === '#00E676' : c.color === '#EF5350'))).toBe(true);
  });
});

describe('banker-fund-flow', () => {
  it('draws no entry markers; the entry is the yellow candle (and its alert)', () => {
    const r = banker.calculate(bars);
    expect((r as Record<string, unknown>).markers).toBeUndefined();
    const entry = r.plotCandles.entrySignal.map((c) => c.time);
    expect(entry.length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(entry);
  });
});

describe('redk-tpx', () => {
  it('draws no swing markers; the Net Pressure Swing alert stays', () => {
    const r = tpx.calculate(bars);
    expect((r as Record<string, unknown>).markers).toBeUndefined();
    expect(r.alerts.map((a) => a.id)).toEqual(['alert0', 'alert1', 'alert2']);
    expect(r.alerts[2].times.length).toBeGreaterThan(0);
  });
});

describe('order-blocks-signals', () => {
  it('draws no Buy / Sell markers; boxes and alert() calls stay', () => {
    const r = obs.calculate(bars);
    expect((r as Record<string, unknown>).markers).toBeUndefined();
    expect(r.boxes.length).toBeGreaterThan(0);
    expect(r.alertCalls.length).toBeGreaterThan(0);
    expect(obs.hasAlertFunction).toBe(true);
  });
});

describe('rsi-supply-demand', () => {
  it('draws no S/D diamond markers; the zone alerts stay', () => {
    const r = rsd.calculate(bars);
    expect((r as Record<string, unknown>).markers).toBeUndefined();
    expect(r.alerts.map((a) => a.id)).toEqual(['alert0', 'alert1', 'alert2', 'alert3', 'alert4']);
    expect(r.alerts[1].times.length).toBeGreaterThan(0);
  });
});
