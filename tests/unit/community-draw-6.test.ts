/**
 * Community ports, drawing pass 6: the drawn parts named by the fixes, recomputed here from the originals' formulas
 * (independent of the ports) on seeded walks: Market Cipher A markers (Blue Triangle above the bar, no warm-up),
 * Multiple Divergences labels (count text, own colours, absolute positions), Triangular Momentum Oscillator markers
 * at the oscillator, Zero-Lag MA diamonds at the moving average, OTT Buy / Sell labels at OTT * 0.995 / 1.005,
 * VWAP/MVWAP/EMA "Long" colour, Impulse MACD bar colours behind "Enable bar colors", Heatmap Volume averages on the
 * shortened early windows.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as mca from '../../src/community/market-cipher-a';
import * as mdiv from '../../src/community/multiple-divergences';
import * as tmo from '../../src/community/triangular-momentum-osc';
import * as zlma from '../../src/community/zlma-trend-levels';
import * as ott from '../../src/community/optimized-trend-tracker';
import * as vwapx from '../../src/community/vwap-mvwap-ema-crossover';
import * as imacd from '../../src/community/impulse-macd';
import * as hmv from '../../src/community/heatmap-volume';

/** Seeded random walk of daily bars with a varying volume (spikes now and then) */
function walk(count: number, seed0: number): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4);
    const high = Math.max(o, p) + rnd() * 1.5 + 0.01;
    const low = Math.min(o, p) - rnd() * 1.5 - 0.01;
    const spike = rnd() < 0.03 ? 4 + rnd() * 6 : 1;
    out.push({ time: 1577836800 + i * 86400, open: o, high, low, close: p, volume: Math.round(1e6 * (0.3 + rnd() * 1.4) * spike) });
  }
  return out;
}

const bars = walk(1300, 11);
const bars2 = walk(1250, 4242);
const N = (v: number | null | undefined) => (v == null ? NaN : v);
const closeOf = (b: Bar[]) => b.map((x) => x.close);
const hlc3Of = (b: Bar[]) => b.map((x) => (x.high + x.low + x.close) / 3);
const idxOf = (b: Bar[]) => new Map(b.map((x, i) => [x.time as number, i]));

// --- Pine reference helpers (independent of the ports) ---
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
/** ta.rma: as ta.ema with alpha 1 / len */
function rma(src: number[], len: number): number[] {
  const out: number[] = [];
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!Number.isFinite(v)) { out.push(NaN); continue; }
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
function extreme(src: number[], len: number, low: boolean): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let best = NaN;
    for (let k = i - len + 1; k <= i; k++) if (isNaN(best) || (low ? src[k] < best : src[k] > best)) best = src[k];
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
const xover = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
const xunder = (a: number[], b: number[], i: number) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);

type M = { id?: string; time: number; position: string; price?: number; color?: string; text?: string; shape?: string; textColor?: string };
const key = (m: M) => `${m.id}@${m.time}:${m.position}`;
function expectSameMarkers(got: M[], want: M[]) {
  expect(got.map(key)).toEqual(want.map(key));
  got.forEach((m, k) => {
    if (want[k].price !== undefined) expect(m.price).toBeCloseTo(want[k].price!, 8);
  });
}

describe('Market Cipher A: markers above the bar, no extra warm-up', () => {
  const res = mca.calculate(bars);
  const o = bars.map((b) => b.open), h = bars.map((b) => b.high), l = bars.map((b) => b.low);
  const c = closeOf(bars);
  const [e1, e2, e3, , , , , e8] = [5, 11, 15, 18, 21, 24, 28, 34].map((len) => ema(c, len));
  const src = hlc3Of(bars);
  const esa = ema(src, 9);
  const de = ema(src.map((v, i) => Math.abs(v - esa[i])), 9);
  const ci = src.map((v, i) => (v - esa[i]) / (0.015 * de[i]));
  const wt1 = ema(ci, 13);
  const wt2 = sma(wt1, 3);
  const r = rsi(c, 14);
  const mfi = sma(c.map((v, i) => ((v - o[i]) / (h[i] - l[i])) * 150), 60);
  const want: M[] = [];
  const firstIdx: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].time as number;
    const longEma = xover(e2, e8, i), shortEma = xover(e8, e2, i);
    const redCross = xunder(e1, e2, i), blueTriangle = xover(e2, e3, i);
    const redDiamond = (xover(wt1, wt2, i) || xunder(wt1, wt2, i)) && wt2[i] - wt1[i] >= 0;
    const yellowCross = redDiamond && wt2[i] < 45 && wt2[i] > -80 && r[i] < 30 && r[i] > 15 && mfi[i] < -5;
    const bloodDiamond = redDiamond && redCross;
    const bullCandle = o[i] > e2[i] && o[i] > e8[i] && i > 0 && c[i - 1] > o[i - 1] && c[i] > o[i] && !redDiamond && !redCross;
    [longEma, shortEma, redCross, blueTriangle, redDiamond, bullCandle, bloodDiamond, yellowCross].forEach((f, k) => {
      if (f) { want.push({ id: `shape${k}`, time: t, position: 'aboveBar' }); firstIdx.push(i); }
    });
  }

  it('draws every marker of the original, Blue Triangle (shape3) above the bar', () => {
    expect(want.filter((m) => m.id === 'shape3').length).toBeGreaterThan(10);
    expectSameMarkers(res.markers as M[], want);
    expect(res.markers.filter((m) => m.id === 'shape3').every((m) => m.position === 'aboveBar' && m.shape === 'triangleUp')).toBe(true);
  });

  it('draws markers before bar 60 (the series exist earlier)', () => {
    expect(Math.min(...firstIdx)).toBeLessThan(60);
  });

  it('keeps its alerts (Bluetriangle on the triangle bars)', () => {
    const blue = res.alerts.find((a) => a.title === 'Bluetriangle')!;
    expect(blue.times).toEqual(want.filter((m) => m.id === 'shape3').map((m) => m.time));
  });
});

describe('Multiple Divergences: count labels, own colours, absolute positions', () => {
  const mintick = 0.25;
  const res = mdiv.calculate(bars, {}, { mintick });
  const res1 = mdiv.calculate(bars, { minDivCount: 1 }, { mintick });
  const ix = idxOf(bars);
  const kinds = [
    { first: 0, color: '#00897B', up: true },
    { first: 9, color: '#FF5252', up: false },
    { first: 18, color: '#4CAF50', up: true },
    { first: 27, color: '#FF9800', up: false },
  ];

  it('labels: text of the count ("8+" above 8), id of that count, colour and price of the kind', () => {
    expect(res1.markers.length).toBeGreaterThan(20);
    for (const m of res1.markers) {
      const k = Number(m.id!.slice(5));
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(36);
      const kind = kinds[Math.floor(k / 9)];
      const slot = k - kind.first; // 0..7: counts 1..8, 8: more than 8
      expect(m.text).toBe(slot === 8 ? '8+' : String(slot + 1));
      expect(m.color).toBe(kind.color);
      expect(m.textColor).toBe('#FFFFFF');
      const i = ix.get(m.time as number)!;
      const p = i - 1; // lbR = 1
      if (kind.up) {
        expect([m.shape, m.position]).toEqual(['labelUp', 'atPriceBottom']);
        expect(m.price).toBeCloseTo(bars[p].low - 5 * mintick, 10);
      } else {
        expect([m.shape, m.position]).toEqual(['labelDown', 'atPriceTop']);
        expect(m.price).toBeCloseTo(bars[p].high + 5 * mintick, 10);
      }
    }
  });

  it('minimum count: counts below it are not drawn', () => {
    expect(res1.markers.some((m) => m.text === '1')).toBe(true);
    expect(res.markers.some((m) => m.text === '1')).toBe(false);
    expect(res.markers.map(key)).toEqual(res1.markers.filter((m) => m.text !== '1').map(key));
  });
});

describe('Triangular Momentum Oscillator: markers at the oscillator value', () => {
  const res = tmo.calculate(bars);
  const L = 7;
  const c = closeOf(bars);
  const s2 = sma(sma(c, L), L);
  const osc = s2.map((v, i) => (i >= L ? v - s2[i - L] : NaN));
  const ch = osc.map((v, i) => (i > 0 ? v - osc[i - 1] : NaN));
  const zero = ch.map(() => 0);
  const ph = ch.map((_, i) => xunder(ch, zero, i));
  const pl = ch.map((_, i) => xover(ch, zero, i));
  const up = extreme(c, L, false), dn = extreme(c, L, true);
  const [ph0, ph1, phU0, phU1] = [valuewhen(ph, osc, 0), valuewhen(ph, osc, 1), valuewhen(ph, up, 0), valuewhen(ph, up, 1)];
  const [pl0, pl1, plD0, plD1] = [valuewhen(pl, osc, 0), valuewhen(pl, osc, 1), valuewhen(pl, dn, 0), valuewhen(pl, dn, 1)];
  const want: M[] = [];
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].time as number;
    const bear = osc[i] > 0 && ph[i] && ph0[i] < ph1[i] && phU0[i] > phU1[i];
    const bull = osc[i] < 0 && pl[i] && pl0[i] > pl1[i] && plD0[i] < plD1[i];
    if (bull) want.push({ id: 'shape0', time: t, position: 'atPriceMiddle', price: osc[i] }, { id: 'shape2', time: t, position: 'atPriceBottom', price: osc[i] });
    if (bear) want.push({ id: 'shape1', time: t, position: 'atPriceMiddle', price: osc[i] }, { id: 'shape3', time: t, position: 'atPriceTop', price: osc[i] });
  }

  it('circles centred on the oscillator, Buy / Sell labels pointing at it', () => {
    expect(want.length).toBeGreaterThan(20);
    expectSameMarkers(res.markers as M[], want);
    const sell = res.markers.find((m) => m.id === 'shape3')!;
    expect([sell.shape, sell.text, sell.textColor]).toEqual(['labelDown', 'Sell', '#FFFFFF']);
  });
});

describe('Zero-Lag MA Trend Levels: diamonds at the moving average', () => {
  const res = zlma.calculate(bars);
  const c = closeOf(bars);
  const e = ema(c, 15);
  const z = ema(c.map((v, i) => v + (v - e[i])), 15);
  const want: M[] = [];
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].time as number;
    if (xover(z, e, i)) want.push({ id: 'shape0', time: t, position: 'atPriceMiddle', price: z[i] });
    if (xunder(z, e, i)) want.push({ id: 'shape1', time: t, position: 'atPriceMiddle', price: z[i] });
  }

  it('diamonds of both crosses at the zlma price', () => {
    expect(want.length).toBeGreaterThan(20);
    expectSameMarkers(res.markers as M[], want);
    expect(res.markers.every((m) => m.shape === 'diamond')).toBe(true);
  });

  it('zlma and ema exist from their first bar (14 / 28)', () => {
    const p0 = res.plots.plot0 as { value: number }[], p1 = res.plots.plot1 as { value: number }[];
    expect([isNaN(p1[13].value), isNaN(p1[14].value)]).toEqual([true, false]);
    expect([isNaN(p0[27].value), isNaN(p0[28].value)]).toEqual([true, false]);
    expect(p0[100].value).toBeCloseTo(z[100], 8);
  });
});

describe('Optimized Trend Tracker: Buy / Sell labels at OTT * 0.995 / 1.005', () => {
  const period = 2, percent = 1.4;
  const src = closeOf(bars);
  const n = bars.length;
  // Var_Func
  const a = 2 / (period + 1);
  const vud = src.map((v, i) => (i > 0 && v > src[i - 1] ? v - src[i - 1] : 0));
  const vdd = src.map((v, i) => (i > 0 && v < src[i - 1] ? src[i - 1] - v : 0));
  const M: number[] = [];
  for (let i = 0; i < n; i++) {
    let cmo = 0;
    if (i >= 8) {
      let u = 0, d = 0;
      for (let k = i - 8; k <= i; k++) { u += vud[k]; d += vdd[k]; }
      const x = (u - d) / (u + d);
      cmo = Number.isNaN(x) ? 0 : x;
    }
    M.push(a * Math.abs(cmo) * src[i] + (1 - a * Math.abs(cmo)) * (i > 0 ? M[i - 1] : 0));
  }
  const ls: number[] = [], ss: number[] = [], dir: number[] = [], OTT: number[] = [];
  for (let i = 0; i < n; i++) {
    const fark = M[i] * percent * 0.01;
    const lsPrev = i > 0 ? ls[i - 1] : M[i] - fark;
    const ssPrev = i > 0 ? ss[i - 1] : M[i] + fark;
    ls.push(M[i] > lsPrev ? Math.max(M[i] - fark, lsPrev) : M[i] - fark);
    ss.push(M[i] < ssPrev ? Math.min(M[i] + fark, ssPrev) : M[i] + fark);
    const d0 = i > 0 ? dir[i - 1] : 1;
    dir.push(d0 === -1 && M[i] > ssPrev ? 1 : d0 === 1 && M[i] < lsPrev ? -1 : d0);
    const mt = dir[i] === 1 ? ls[i] : ss[i];
    OTT.push(M[i] > mt ? (mt * (200 + percent)) / 200 : (mt * (200 - percent)) / 200);
  }
  const o2 = OTT.map((_, i) => (i >= 2 ? OTT[i - 2] : NaN));
  const o3 = OTT.map((_, i) => (i >= 3 ? OTT[i - 3] : NaN));
  const want: M[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    const buy = (id: string) => want.push({ id, time: t, position: 'atPriceBottom', price: OTT[i] * 0.995 });
    const sell = (id: string) => want.push({ id, time: t, position: 'atPriceTop', price: OTT[i] * 1.005 });
    if (xover(M, o2, i)) buy('shape0');
    if (xunder(M, o2, i)) sell('shape1');
    if (xover(src, o2, i)) buy('shape2');
    if (xunder(src, o2, i)) sell('shape3');
    if (xover(o2, o3, i)) buy('shape4');
    if (xunder(o2, o3, i)) sell('shape5');
  }
  const res = ott.calculate(bars, { showSignalsC: true, showSignalsR: true });

  it('labels of the three signal pairs at the original prices, green / red', () => {
    expect(want.length).toBeGreaterThan(50);
    expectSameMarkers(res.markers as M[], want);
    for (const m of res.markers) {
      const isBuy = m.text === 'Buy';
      expect([m.shape, m.color, m.textColor]).toEqual(isBuy ? ['labelUp', '#4CAF50', '#FFFFFF'] : ['labelDown', '#FF5252', '#FFFFFF']);
    }
  });

  it('default: support line labels only; alerts on the same crosses', () => {
    const def = ott.calculate(bars);
    expectSameMarkers(def.markers as M[], want.filter((m) => m.id === 'shape0' || m.id === 'shape1'));
    const buyTimes = want.filter((m) => m.id === 'shape0').map((m) => m.time);
    expect(def.alerts.find((x) => x.title === 'Crossover Alarm')!.times).toEqual(buyTimes);
    expect(def.alerts.find((x) => x.title === 'GREEN ALERT')!.times).toEqual(want.filter((m) => m.id === 'shape4').map((m) => m.time));
  });
});

describe('VWAP/MVWAP/EMA CROSSOVER: Long marker colour', () => {
  const res = vwapx.calculate(bars);
  // daily bars, one session each: vwap = hlc3 of the bar
  const vw = hlc3Of(bars);
  const c = closeOf(bars);
  const mv = ema(vw, 21), cv = ema(vw, 1), e1 = ema(c, 7), e2 = ema(c, 25), r = rsi(c, 14);
  const long = c.map((_, i) => (e1[i] >= mv[i] && e2[i] >= mv[i] && cv[i] >= mv[i] && Number.isFinite(r[i]) && r[i] !== 0 ? 1 : 0));
  const half = long.map(() => 0.5);
  const wantTimes = long.map((_, i) => i).filter((i) => xover(long, half, i)).map((i) => bars[i].time);

  it('Long triangles: green #008000, below the bar, on the Long triggers', () => {
    const longs = res.markers.filter((m) => m.id === 'shape0');
    expect(longs.length).toBeGreaterThan(5);
    expect(longs.map((m) => m.time)).toEqual(wantTimes);
    expect(longs.every((m) => m.color === '#008000' && m.position === 'belowBar' && m.text === 'Long')).toBe(true);
  });

  it('ids: shape0..shape5, barcolor0', () => {
    expect(new Set(res.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']));
    expect(res.barColors.every((b) => b.id === 'barcolor0')).toBe(true);
  });
});

describe('Impulse MACD: bar colours only with "Enable bar colors"', () => {
  it('has the input, off by default: no bar colours', () => {
    const cfg = imacd.inputConfig.find((x) => x.id === 'ebc')!;
    expect([cfg.title, cfg.defval]).toEqual(['Enable bar colors', false]);
    expect(imacd.calculate(bars).barColors).toEqual([]);
  });

  it('enabled: every bar in the colour of the histogram (mdc)', () => {
    const res = imacd.calculate(bars2, { ebc: true });
    const s = hlc3Of(bars2);
    const hi = rma(bars2.map((b) => b.high), 34), lo = rma(bars2.map((b) => b.low), 34);
    const m1 = ema(s, 34), m2 = ema(m1, 34);
    const mi = m1.map((v, i) => v + (v - m2[i]));
    const want = s.map((v, i) => (v > mi[i] ? (v > hi[i] ? '#00FF00' : '#008000') : v < lo[i] ? '#FF0000' : '#FF7F00'));
    expect(res.barColors.map((b) => b.time)).toEqual(bars2.map((b) => b.time));
    expect(res.barColors.map((b) => b.color)).toEqual(want);
    expect(res.barColors.every((b) => b.id === 'barcolor0')).toBe(true);
    expect(new Set(want).size).toBe(4);
  });
});

describe('Heatmap Volume: windows cut to the bars so far', () => {
  const vol = bars.map((b) => b.volume as number);
  const L = 610;
  const mean: number[] = [], std: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const len = Math.min(L, i + 1);
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += vol[k];
    const m = s / len;
    let q = 0;
    for (let k = i - len + 1; k <= i; k++) q += (vol[k] - m) ** 2;
    mean.push(m);
    std.push(Math.sqrt(q / len));
  }
  const stdbar = vol.map((v, i) => (v - mean[i]) / std[i]); // bar 0: 0 / 0 = na
  const hm = (x: number) => (x > 4 ? '#ff0000' : x > 2.5 ? '#ff7800' : x > 1 ? '#ffcf03' : x > -0.5 ? '#a0d6dc' : '#1f9cac');
  const res = hmv.calculate(bars);

  it('mean and bar colours from the first bar', () => {
    const ma = res.plots.ma as { value: number }[];
    [0, 1, 5, 100, 609, 610, 1299].forEach((i) => expect(ma[i].value / mean[i]).toBeCloseTo(1, 9));
    expect(res.barColors.map((b) => b.time)).toEqual(bars.map((b) => b.time));
    expect(res.barColors.map((b) => b.color)).toEqual(stdbar.map(hm));
    expect(res.barColors[0].color).toBe('#1f9cac'); // na stdbar: the Low colour
    expect(res.barColors.every((b) => b.id === 'barcolor0')).toBe(true);
    expect(stdbar.slice(1, 610).some((x) => x > 4)).toBe(true);
    const volPlot = res.plots.volume as { value: number; color?: string }[];
    expect(volPlot[0].value).toBe(vol[0]);
    expect(volPlot.map((p) => p.color)).toEqual(stdbar.map(hm));
  });

  it('zone levels and alerts on the same stdev', () => {
    const z1 = res.plots.zone1 as { value: number }[];
    [1, 50, 700].forEach((i) => expect(z1[i].value / (std[i] * 4 + mean[i])).toBeCloseTo(1, 9));
    const any = res.alerts.find((a) => a.title === 'Any Extra High Vol')!;
    expect(any.times).toEqual(bars.filter((_, i) => stdbar[i] > 4).map((b) => b.time));
    const lines = hmv.calculate(bars, { displayZones: 'Lines' }).plots.tsHigh as { value: number }[];
    expect(lines[3].value / (std[3] * 2.5 + mean[3])).toBeCloseTo(1, 9);
  });
});
