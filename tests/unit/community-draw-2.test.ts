/**
 * Drawings of eight community ports checked against the originals' formulas, computed again in the test on
 * deterministic synthetic bars (seeded walks, crafted bars for the rare cases): divergence arrow lines, circle-style
 * plots in place of markers, markers removed where the original draws none, the GPR end point estimate, the swing
 * stop line with its labels / colours, and the AlphaTrend warm-up (previous value nz() = 0).
 */

import { describe, it, expect } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as rsiTB from '../../src/community/rsi-tops-bottoms';
import * as hullBO from '../../src/community/hull-butterfly-oscillator';
import * as renko from '../../src/community/renko-chart';
import * as stc from '../../src/community/schaff-trend-cycle';
import * as wto from '../../src/community/wavetrend-oscillator';
import * as mlma from '../../src/community/ml-moving-average';
import * as ast from '../../src/community/accurate-swing-trading';
import * as alpha from '../../src/community/alpha-trend';

const DAY = 86400;
const T0 = 1262304000;
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of daily bars (times in seconds), with volume */
function walk(count: number, seed = 11, vol = 4, drift = 0.3): Bar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = Math.max(1, open + Math.sin(i / 60) * drift + (rand() - 0.5) * vol);
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 2);
    bars.push({ time: T0 + i * DAY, open, high, low, close, volume: 1000 + Math.floor(rand() * 9000) });
    price = close;
  }
  return bars;
}

const nz = (v: number, d = 0) => (Number.isNaN(v) ? d : v);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
function expectSeries(actual: number[], expected: number[], tol = 1e-9) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i], a = actual[i];
    if (Number.isNaN(e)) expect(Number.isNaN(a), `bar ${i}: ${a} should be na`).toBe(true);
    else expect(Math.abs(a - e), `bar ${i}: ${a} vs ${e}`).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(e)));
  }
}

/** ta.rsi: RMA of the gains / losses, seeded with their SMA over the first `len` changes */
function rsi(src: number[], len: number): number[] {
  const out = new Array(src.length).fill(NaN);
  let up = NaN, dn = NaN, su = 0, sd = 0;
  for (let i = 1; i < src.length; i++) {
    const ch = src[i] - src[i - 1];
    const u = Math.max(ch, 0), d = Math.max(-ch, 0);
    if (i < len) { su += u; sd += d; continue; }
    if (i === len) { up = (su + u) / len; dn = (sd + d) / len; }
    else { up = (up * (len - 1) + u) / len; dn = (dn * (len - 1) + d) / len; }
    out[i] = dn === 0 ? 100 : up === 0 ? 0 : 100 - 100 / (1 + up / dn);
  }
  return out;
}
const sma = (a: number[], len: number) => a.map((_v, i) => {
  if (i < len - 1) return NaN;
  let s = 0;
  for (let k = 0; k < len; k++) s += a[i - k];
  return s / len;
});
const highest = (a: number[], len: number) => a.map((_v, i) => (i < len - 1 ? NaN : Math.max(...a.slice(i - len + 1, i + 1))));
const lowest = (a: number[], len: number) => a.map((_v, i) => (i < len - 1 ? NaN : Math.min(...a.slice(i - len + 1, i + 1))));
const crossover = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const crossunder = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);

describe('rsi-tops-bottoms: divergence arrow lines', () => {
  function expected(bars: Bar[], prd = 10, mindis = 5, maxdis = 100) {
    const r = rsi(bars.map((b) => b.close), 14);
    const lines: { t1: number; p1: number; t2: number; p2: number; top: boolean }[] = [];
    const up: boolean[] = [], down: boolean[] = [];
    for (const top of [false, true]) {
      const lvl = top ? 70 : 30;
      let inZone = false, count = 0;
      const zone: boolean[] = [], cnt: number[] = [], ext: number[] = [], price: number[] = [], bi: number[] = [], fine: boolean[] = [];
      let e = NaN, p = NaN, b = NaN, f = false;
      for (let i = 0; i < bars.length; i++) {
        const prev = i > 0 ? r[i - 1] : NaN;
        inZone = top
          ? (prev <= lvl && r[i] > lvl ? true : r[i] < lvl ? false : inZone)
          : (prev >= lvl && r[i] < lvl ? true : r[i] > lvl ? false : inZone);
        count = inZone ? count + 1 : 0;
        zone.push(inZone); cnt.push(count);
        if (i > 0 && zone[i - 1] && !inZone && nz(cnt[i - 1]) > 0) {
          e = top ? -1 : 101; b = i; f = true;
          for (let x = 1; x <= cnt[i - 1]; x++) {
            if (x > prd) f = false;
            if (top ? r[i - x] > e : r[i - x] < e) { e = r[i - x]; b = i - x; p = top ? bars[i - x].high : bars[i - x].low; }
          }
        }
        ext.push(e); price.push(p); bi.push(b); fine.push(f);
        let hit = false;
        if (i > 0) {
          const e1 = ext[i - 1], ch = e - e1;
          hit = !Number.isNaN(ch) && ch !== 0 && e !== 0 && e1 !== 0
            && (top ? e < e1 && p > price[i - 1] : e > e1 && p < price[i - 1])
            && i - bi[i - 1] < maxdis && f && fine[i - 1] && i - bi[i - 1] > mindis;
        }
        (top ? down : up)[i] = hit;
        if (hit) lines.push({ t1: bars[i].time as number, p1: e, t2: bars[bi[i - 1]].time as number, p2: ext[i - 1], top });
      }
    }
    return { lines, up, down };
  }

  it('draws the original line.new arrows (from the exit bar back to the previous extreme), no markers', () => {
    const bars = walk(2500, 7, 5, 1.2);
    const res = rsiTB.calculate(bars);
    const exp = expected(bars);
    expect(exp.lines.filter((l) => l.top).length).toBeGreaterThan(0);
    expect(exp.lines.filter((l) => !l.top).length).toBeGreaterThan(0);
    const key = (t1: number, t2: number) => `${t1}-${t2}`;
    const got = new Map(res.lines.map((l) => [key(l.time1, l.time2), l]));
    expect(res.lines.length).toBe(exp.lines.length);
    for (const l of exp.lines) {
      const g = got.get(key(l.t1, l.t2));
      expect(g, `line ${l.t1}`).toBeDefined();
      expect(g!.price1).toBeCloseTo(l.p1, 8);
      expect(g!.price2).toBeCloseTo(l.p2, 8);
      expect(g!.style).toBe('arrow_left');
      expect(g!.width).toBe(2);
      expect(g!.color).toBe(l.top ? '#FF5252' : '#00E676');
    }
    expect((res as { markers?: unknown[] }).markers ?? []).toHaveLength(0);
    // alerts follow the same bars
    const a0 = res.alerts.find((a) => a.id === 'alert0')!;
    const a1 = res.alerts.find((a) => a.id === 'alert1')!;
    expect(a0.times).toEqual(bars.filter((_b, i) => exp.up[i]).map((b) => b.time));
    expect(a1.times).toEqual(bars.filter((_b, i) => exp.down[i]).map((b) => b.time));
  });

  it('Line Colors / Line Width inputs', () => {
    const bars = walk(2500, 7, 5, 1.2);
    const res = rsiTB.calculate(bars, { topColor: '#111111', bottomColor: '#222222', lineWidth: 4 });
    expect(res.lines.length).toBeGreaterThan(0);
    for (const l of res.lines) {
      expect(['#111111', '#222222']).toContain(l.color);
      expect(l.width).toBe(4);
    }
    const ids = rsiTB.inputConfig.map((c) => c.id);
    expect(ids.indexOf('topColor')).toBe(ids.indexOf('maxDist') + 1);
    expect(rsiTB.inputConfig.find((c) => c.id === 'topColor')!.title).toBe('Line Colors');
    expect(rsiTB.inputConfig.find((c) => c.id === 'lineWidth')).toMatchObject({ title: 'Line Width', defval: 2, min: 1, max: 4 });
  });
});

describe('hull-butterfly-oscillator: Bullish / Bearish Dot circle plots', () => {
  function expected(bars: Bar[], length = 14, mult = 2) {
    const src = bars.map((b) => b.close);
    const sl = Math.trunc(length / 2), hl = Math.trunc(Math.sqrt(length));
    const den1 = sl * (sl + 1) / 2, den2 = length * (length + 1) / 2, den3 = hl * (hl + 1) / 2;
    // lcwa after the unshifts: hl - 1 zeros, the coefficients from i = length - 1 down to 0, hl zeros
    const coeffs: number[] = [];
    for (let i = length - 1; i >= 0; i--) coeffs.push(2 * (Math.max(sl - i, 0) / den1) - (length - i) / den2);
    const lcwa = [...new Array(hl - 1).fill(0), ...coeffs, ...new Array(hl).fill(0)];
    const conv: number[] = [];
    for (let i = hl; i <= lcwa.length - 1; i++) {
      let s3 = 0;
      for (let j = i - hl; j <= i - 1; j++) s3 += lcwa[j] * (i - j);
      conv.push(s3 / den3);
    }
    const hull = conv.reverse();
    const len = hull.length - 1;
    const hso = src.map((_v, t) => {
      if (t < len) return NaN;
      let h = 0, inv = 0;
      for (let i = 0; i <= len; i++) { h += src[t - i] * hull[i]; inv += src[t - (len - i)] * hull[i]; }
      return h - inv;
    });
    let cum = 0;
    const cmean = hso.map((v, t) => {
      if (Number.isNaN(v)) return NaN;
      cum += Math.abs(v);
      return t === 0 ? NaN : cum / t * mult;
    });
    // ta.cross: the side of the last bar strictly above / below is kept; a cross is a bar strictly on the other side
    const cross = (a: number[], b: number[]) => {
      let side = 0;
      return a.map((v, i) => {
        if (Number.isNaN(v) || Number.isNaN(b[i])) return false;
        const c = (side < 0 && v > b[i]) || (side > 0 && v < b[i]);
        if (v < b[i]) side = -1; else if (v > b[i]) side = 1;
        return c;
      });
    };
    const c1 = cross(hso, cmean), c2 = cross(hso, cmean.map((c) => -c));
    let os = 0;
    const osA = hso.map((v, t) => {
      const p = t > 0 ? hso[t - 1] : NaN;
      os = c1[t] || c2[t] ? 0 : v < p && v > cmean[t] ? -1 : v > p && v < -cmean[t] ? 1 : os;
      return os;
    });
    const bull = hso.map((v, t) => (t > 0 && osA[t] > osA[t - 1] && osA[t] === 1 ? v : NaN));
    const bear = hso.map((v, t) => (t > 0 && osA[t] < osA[t - 1] && osA[t] === -1 ? v : NaN));
    return { hso, cmean, bull, bear };
  }

  it('dots are plots (style circles, width 2) at hso where os turns to 1 / -1', () => {
    const bars = walk(1500, 3, 4, 0.8);
    const res = hullBO.calculate(bars);
    const exp = expected(bars);
    expectSeries(vals(res.plots.plot1), exp.hso);
    expectSeries(vals(res.plots.plot2), exp.cmean);
    expectSeries(vals(res.plots.bullDot), exp.bull);
    expectSeries(vals(res.plots.bearDot), exp.bear);
    expect(exp.bull.filter((v) => !Number.isNaN(v)).length).toBeGreaterThan(0);
    expect(exp.bear.filter((v) => !Number.isNaN(v)).length).toBeGreaterThan(0);
    expect(res.plots.bullDot.find((p) => !Number.isNaN(p.value))!.color).toBe('#0cb51a');
    expect(res.plots.bearDot.find((p) => !Number.isNaN(p.value))!.color).toBe('#ff1100');
    const cfg = hullBO.plotConfig.map((p) => p.id);
    expect(cfg.slice(0, 4)).toEqual(['plot0', 'plot1', 'bullDot', 'bearDot']);
    expect(hullBO.plotConfig.find((p) => p.id === 'bullDot')).toMatchObject({ title: 'Bullish Dot', style: 'circles', lineWidth: 2 });
    expect(hullBO.plotConfig.find((p) => p.id === 'bearDot')).toMatchObject({ title: 'Bearish Dot', style: 'circles', lineWidth: 2 });
    expect((res as { markers?: unknown[] }).markers ?? []).toHaveLength(0);
  });
});

describe('renko-chart: main trend change circle plot', () => {
  /** The original on Traditional bricks, source close (constant box) */
  function expected(bars: Bar[], box: number, cfg = { len: 34, whip: 3, th: 3, th2: 1.5 }) {
    const n = bars.length;
    const trend: number[] = [], icpA: number[] = [];
    let tr = 0, bp = NaN, pIop = 0, pIcp = 0;
    for (let i = 0; i < n; i++) {
      tr = i === 0 ? 0 : tr;
      const cp = bars[i].close;
      bp = i === 0 ? Math.floor(bars[i].open / box) * box : bp;
      let iop = 0, icp = 0;
      if (tr === 0 && box * 2 <= Math.abs(bp - cp)) {
        if (bp > cp) { iop = bp; icp = bp - Math.floor(Math.abs(bp - cp) / box) * box; tr = -1; }
        if (bp < cp) { iop = bp; icp = bp + Math.floor(Math.abs(bp - cp) / box) * box; tr = 1; }
      }
      const fillIn = () => { iop = iop === 0 ? pIop : iop; icp = icp === 0 ? pIcp : icp; };
      if (tr === -1) {
        let nok = true;
        if (bp > cp && box <= Math.abs(bp - cp)) { icp = bp - Math.floor(Math.abs(bp - cp) / box) * box; tr = -1; bp = icp; nok = false; } else fillIn();
        if (bp < cp && box * 2 <= Math.abs(bp - cp) && nok) { iop = bp + box; icp = bp + Math.floor(Math.abs(bp - cp) / box) * box; tr = 1; bp = icp; } else fillIn();
      } else if (tr === 1) {
        let nok = true;
        if (bp < cp && box <= Math.abs(bp - cp)) { icp = bp + Math.floor(Math.abs(bp - cp) / box) * box; tr = 1; bp = icp; nok = false; } else fillIn();
        if (bp > cp && box * 2 <= Math.abs(bp - cp) && nok) { iop = bp - box; icp = bp - Math.floor(Math.abs(bp - cp) / box) * box; tr = -1; bp = icp; } else fillIn();
      }
      trend.push(tr); icpA.push(icp); pIop = iop; pIcp = icp;
    }
    // main trend
    const ch = (a: number[], i: number) => (i > 0 ? a[i] - a[i - 1] : NaN);
    const T = (v: number) => !Number.isNaN(v) && v !== 0;
    const trcnt: number[] = [], countch: number[] = [], obox: number[] = [], em: number[] = [];
    const up: number[] = [], dn: number[] = [], mt: number[] = [], wt: number[] = [];
    for (let i = 0; i < n; i++) {
      const icp = icpA[i], cI = T(ch(icpA, i));
      trcnt[i] = Math.min(cI ? 1 : nz(trcnt[i - 1] ?? NaN) + 1, 4000);
      countch[i] = nz(countch[i - 1] ?? NaN) + (cI ? 1 : 0);
      const trch = T(ch(trend, i)) && cI;
      obox[i] = cI ? box : nz(obox[i - 1] ?? NaN);
      // myema
      let e = NaN;
      if (countch[i] <= cfg.len) {
        let sum = icp, nn = 1;
        for (let k = 0; k <= 4000; k++) {
          const a0 = nz(icpA[i - k] ?? NaN), a1 = nz(icpA[i - k - 1] ?? NaN);
          if (a0 === 0 || a1 === 0) break;
          if (icpA[i - k] !== a1) { nn++; sum += a1; if (nn === cfg.len) break; }
        }
        e = nn === cfg.len ? sum / cfg.len : NaN;
      }
      const back = icpA[i - trcnt[i]] ?? NaN;
      if (countch[i] > cfg.len && !Number.isNaN(back) && icp !== back) {
        const al = 2 / (cfg.len + 1), bb = icp > back ? 1 : -1;
        let st = back + bb * obox[i] * (trch ? 2 : 1);
        e = al * st + (1 - al) * nz(em[i - trcnt[i]] ?? NaN);
        st += bb * obox[i];
        while (!((st > icp && bb > 0) || (st < icp && bb < 0))) { e = al * st + (1 - al) * nz(e); st += bb * obox[i]; }
      }
      if (Number.isNaN(e)) e = em[i - 1] ?? NaN;
      em[i] = e;
      const tema = obox[i] === 0 ? NaN : icp - Math.floor((icp - e) / obox[i]) * obox[i];
      const upt = Math.min(tema - cfg.th * box, icp - 2 * box) , dnt = Math.max(tema + cfg.th * box, icp + 2 * box);
      const uptV = Number.isNaN(tema) ? NaN : upt, dntV = Number.isNaN(tema) ? NaN : dnt;
      const pU = up[i - 1] ?? NaN, pD = dn[i - 1] ?? NaN, pI = icpA[i - 1] ?? NaN, pM = mt[i - 1] ?? NaN;
      const mx = (x: number, y: number) => (Number.isNaN(x) || Number.isNaN(y) ? NaN : Math.max(x, y));
      const mn = (x: number, y: number) => (Number.isNaN(x) || Number.isNaN(y) ? NaN : Math.min(x, y));
      let w = nz(wt[i - 1] ?? NaN), m = nz(pM, 1);
      let u = cI && w === 0 ? (pI > pU ? mx(uptV, pU) : uptV) : nz(pU);
      if (m === 1 && u - pU < 0) u = nz(pU);
      let d = cI && w === 0 ? (pI < pD ? mn(dntV, pD) : dntV) : pD;
      if (m === -1 && d - pD > 0) d = nz(pD);
      if (w === 0) m = icp > pD ? 1 : icp < pU ? -1 : m;
      const cm = m - pM;
      if (!Number.isNaN(cm) && cm !== 0 && w === 0 && nz(wt[i - 2] ?? NaN) === 0) w = 1; else if (w !== 0) w++;
      if (w > 0) m = nz(pM);
      if (w > cfg.whip) {
        if (m === 1) {
          if (icp >= u + cfg.th2 * box) w = 0;
          if (icp <= u - cfg.th2 * box) { w = 0; m = -1; d = pI < pD ? mn(dntV, pD) : dntV; }
        } else {
          if (icp <= d - cfg.th2 * box) w = 0;
          if (icp >= d + cfg.th2 * box) { w = 0; m = 1; u = pI > pU ? mx(uptV, pU) : uptV; }
        }
      }
      up[i] = u; dn[i] = d; mt[i] = m; wt[i] = w;
    }
    const tsl = mt.map((m, i) => (m === 1 ? up[i] : dn[i]));
    const dot = tsl.map((v, i) => (i > 0 && mt[i] !== mt[i - 1] ? v : NaN));
    const colors = mt.map((m, i) => (i > 0 && m - mt[i - 1] > 0 ? '#4CAF50' : '#FF5252'));
    return { mt, dot, colors };
  }

  it('circle plot (width 6) at the trend line where the main trend turns, green up / red down', () => {
    const bars = walk(2000, 5, 3, 0.6);
    const res = renko.calculate(bars, { mode: 'Traditional', boxSize: 1, source: 'close' });
    const exp = expected(bars, 1);
    expect(exp.dot.filter((v) => !Number.isNaN(v)).length).toBeGreaterThan(3);
    expectSeries(vals(res.plots.trendChange), exp.dot);
    res.plots.trendChange.forEach((p, i) => { if (!Number.isNaN(exp.dot[i])) expect(p.color).toBe(exp.colors[i]); });
    expect(renko.plotConfig.find((p) => p.id === 'trendChange')).toMatchObject({ style: 'circles', lineWidth: 6 });
    expect((res as { markers?: unknown[] }).markers ?? []).toHaveLength(0);
    // Main Trend is Up / Down alerts follow the same main trend
    const upTimes = bars.filter((_b, i) => i > 0 && exp.mt[i] > exp.mt[i - 1]).map((b) => b.time);
    const dnTimes = bars.filter((_b, i) => i > 0 && exp.mt[i] < exp.mt[i - 1]).map((b) => b.time);
    expect(res.alerts.find((a) => a.id === 'alert2')!.times).toEqual(upTimes);
    expect(res.alerts.find((a) => a.id === 'alert3')!.times).toEqual(dnTimes);
  });

  it('Show Trend off: no dots', () => {
    const bars = walk(1200, 5, 3, 0.6);
    const res = renko.calculate(bars, { mode: 'Traditional', boxSize: 1, source: 'close', showTrend: false });
    expect(res.plots.trendChange.every((p) => Number.isNaN(p.value))).toBe(true);
  });
});

describe('schaff-trend-cycle / wavetrend-oscillator: no markers the originals do not draw', () => {
  it('schaff-trend-cycle: no markers', () => {
    const res = stc.calculate(walk(1300, 9));
    expect((res as { markers?: unknown[] }).markers ?? []).toHaveLength(0);
    expect(res.plots.plot0.some((p) => !Number.isNaN(p.value))).toBe(true);
  });
  it('wavetrend-oscillator: no Buy / Sell / divergence markers, no bar colours', () => {
    const res = wto.calculate(walk(1300, 9));
    const r = res as { markers?: unknown[]; barColors?: unknown[] };
    expect(r.markers ?? []).toHaveLength(0);
    expect(r.barColors ?? []).toHaveLength(0);
    expect(wto.inputConfig.find((c) => c.id === 'showDivergences')).toBeUndefined();
    expect(res.plots.wt1.some((p) => !Number.isNaN(p.value))).toBe(true);
  });
});

describe('ml-moving-average: GPR end point and Circle plot', () => {
  /** K_row = Ktrain^-1 k*, Ktrain = rbf(xtrain, xtrain) + sigma^2 I (Cholesky solve) */
  function kRow(win: number, forecast: number, sigma: number): number[] {
    const rbf = (a: number, b: number) => Math.exp(-((a - b) ** 2) / (2 * win * win));
    const A = Array.from({ length: win }, (_r, i) => Array.from({ length: win }, (_c, j) => rbf(i, j) + (i === j ? sigma * sigma : 0)));
    const k = Array.from({ length: win }, (_v, i) => rbf(i, win + forecast - 1));
    const L = A.map(() => new Array(win).fill(0));
    for (let i = 0; i < win; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i][j];
        for (let q = 0; q < j; q++) s -= L[i][q] * L[j][q];
        L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
      }
    }
    const y = new Array(win).fill(0);
    for (let i = 0; i < win; i++) { let s = k[i]; for (let q = 0; q < i; q++) s -= L[i][q] * y[q]; y[i] = s / L[i][i]; }
    const x = new Array(win).fill(0);
    for (let i = win - 1; i >= 0; i--) { let s = y[i]; for (let q = i + 1; q < win; q++) s -= L[q][i] * x[q]; x[i] = s / L[i][i]; }
    return x;
  }
  function expected(bars: Bar[], win: number, forecast: number, sigma: number, mult: number) {
    const src = bars.map((b) => b.close);
    const w = kRow(win, forecast, sigma);
    const mean = sma(src, win);
    const out = src.map((_v, t) => {
      if (t <= win) return NaN;
      let d = 0;
      for (let i = 0; i < win; i++) d += w[i] * (src[t - (win - 1 - i)] - mean[t]);
      return d + mean[t];
    });
    const absd = src.map((v, t) => Math.abs(v - out[t]));
    // ta.sma over the non-na values: out is na only before bar win + 1
    const mae = absd.map((_v, t) => (t < 2 * win ? NaN : sma(absd.slice(t - win + 1, t + 1), win)[win - 1] * mult));
    const upper = out.map((v, t) => v + mae[t]), lower = out.map((v, t) => v - mae[t]);
    let os = 0;
    const osA = out.map((v, t) => {
      const c = bars[t].close, p = t > 0 ? out[t - 1] : NaN;
      os = c > upper[t] && v > p ? 1 : c < lower[t] && v < p ? 0 : os;
      return os;
    });
    const circle = out.map((v, t) => (t > 0 && osA[t] !== osA[t - 1] ? v : NaN));
    return { out, upper, lower, osA, circle };
  }

  for (const [win, forecast, sigma] of [[100, 0, 0.01], [30, 5, 0.1]] as const) {
    it(`window ${win}, forecast ${forecast}, sigma ${sigma}`, () => {
      const bars = walk(1300, 21, 4, 1.5);
      const res = mlma.calculate(bars, { window: win, forecast, sigma });
      const exp = expected(bars, win, forecast, sigma, 2);
      expectSeries(vals(res.plots.plot0), exp.out, 1e-6);
      expectSeries(vals(res.plots.plot1), exp.upper, 1e-6);
      expectSeries(vals(res.plots.plot2), exp.lower, 1e-6);
      expectSeries(vals(res.plots.circle), exp.circle, 1e-6);
      expect(exp.circle.filter((v) => !Number.isNaN(v)).length).toBeGreaterThan(1);
      res.plots.circle.forEach((p, t) => { if (!Number.isNaN(p.value)) expect(p.color).toBe(exp.osA[t] ? '#3179f5' : '#e91e63'); });
    });
  }

  it('Circle plot declared as circles width 3; no markers / background colours', () => {
    expect(mlma.plotConfig.map((p) => p.id)).toEqual(['plot0', 'circle', 'plot1', 'plot2']);
    expect(mlma.plotConfig[1]).toMatchObject({ title: 'Circle', style: 'circles', lineWidth: 3 });
    const res = mlma.calculate(walk(400, 2), { window: 20 }) as { markers?: unknown[]; bgColors?: unknown[] };
    expect(res.markers ?? []).toHaveLength(0);
    expect(res.bgColors ?? []).toHaveLength(0);
    expect(mlma.defaultInputs).toMatchObject({ window: 100, forecast: 0, sigma: 0.01, mult: 2 });
  });
});

describe('accurate-swing-trading: TSL, BUY / SELL labels, bar / background colours', () => {
  it('as the original', () => {
    const bars = walk(1500, 13, 4, 0.5);
    const res = ast.calculate(bars, { showBgColor: true });
    const H = bars.map((b) => b.high), L = bars.map((b) => b.low), C = bars.map((b) => b.close);
    const res3 = highest(H, 3), sup = lowest(L, 3);
    let avn = NaN;
    const tsl = C.map((c, i) => {
      const avd = i > 0 && gt(c, res3[i - 1]) ? 1 : i > 0 && lt(c, sup[i - 1]) ? -1 : 0;
      if (avd !== 0) avn = avd;
      return avn === 1 ? sup[i] : res3[i];
    });
    const buy = crossover(C, tsl), sell = crossunder(C, tsl);
    const colr = C.map((c, i) => (Number.isNaN(tsl[i]) ? null : !lt(c, tsl[i]) ? '#4CAF50' : '#FF5252'));
    expectSeries(vals(res.plots.plot0), tsl);
    res.plots.plot0.forEach((p, i) => { if (colr[i]) expect(p.color).toBe(colr[i]); });
    const expMarkers = bars.flatMap((b, i) => [
      ...(buy[i] ? [{ id: 'shape0', time: b.time, position: 'belowBar', shape: 'labelUp', color: '#4CAF50', text: 'BUY', textColor: '#363A45' }] : []),
      ...(sell[i] ? [{ id: 'shape1', time: b.time, position: 'aboveBar', shape: 'labelDown', color: '#FF5252', text: 'SELL', textColor: '#363A45' }] : []),
    ]);
    expect(expMarkers.length).toBeGreaterThan(4);
    expect(res.markers).toEqual(expMarkers);
    expect(res.barColors).toEqual(bars.flatMap((b, i) => (colr[i] ? [{ id: 'barcolor0', time: b.time, color: colr[i] }] : [])));
    expect(res.bgColors.length).toBe(res.barColors.length);
    expect(res.bgColors.every((x) => x.id === 'bgcolor0')).toBe(true);
    expect(res.alerts.find((a) => a.id === 'alert0')!.times).toEqual(bars.filter((_b, i) => buy[i]).map((b) => b.time));
    expect(res.alerts.find((a) => a.id === 'alert1')!.times).toEqual(bars.filter((_b, i) => sell[i]).map((b) => b.time));
    expect(ast.plotConfig[0]).toMatchObject({ title: 'TSL', lineWidth: 3 });
  });

  it('Bgcolor off by default, Barcolor off', () => {
    const res = ast.calculate(walk(300, 13), { showBarColor: false });
    expect(res.barColors).toHaveLength(0);
    expect(res.bgColors).toHaveLength(0);
  });
});

describe('alpha-trend: warm-up with nz(AlphaTrend[1]) = 0, BUY / SELL labels', () => {
  function expected(bars: Bar[], period = 14, coeff = 1) {
    const n = bars.length;
    const tr = bars.map((b, i) => (i === 0 ? NaN : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
    const atr = tr.map((_v, i) => (i < period ? NaN : sma(tr.slice(i - period + 1, i + 1), period)[period - 1]));
    // ta.mfi(hlc3, AP): change na on bar 0 counts the value on both sides
    const src = bars.map((b) => (b.high + b.low + b.close) / 3);
    const upv = src.map((v, i) => (bars[i].volume ?? 0) * (i > 0 && v - src[i - 1] <= 0 ? 0 : v));
    const dnv = src.map((v, i) => (bars[i].volume ?? 0) * (i > 0 && v - src[i - 1] >= 0 ? 0 : v));
    const su = sma(upv, period), sd = sma(dnv, period);
    const mfi = su.map((u, i) => 100 - 100 / (1 + u / sd[i]));
    const AT: number[] = [];
    for (let i = 0; i < n; i++) {
      const upT = bars[i].low - atr[i] * coeff, downT = bars[i].high + atr[i] * coeff;
      const prev = nz(AT[i - 1] ?? NaN);
      AT[i] = mfi[i] >= 50 ? (upT < prev ? prev : upT) : (downT > prev ? prev : downT);
    }
    const AT2 = AT.map((_v, i) => (i >= 2 ? AT[i - 2] : NaN));
    const buyS = crossover(AT, AT2), sellS = crossunder(AT, AT2);
    const since = (c: boolean[]) => { let l = -1; return c.map((f, i) => { if (f) l = i; return l < 0 ? NaN : i - l; }); };
    const K1 = since(buyS), K2 = since(sellS);
    const O1 = since(buyS.map((_f, i) => i > 0 && buyS[i - 1])), O2 = since(sellS.map((_f, i) => i > 0 && sellS[i - 1]));
    const buy = buyS.map((f, i) => f && O1[i] > K2[i]);
    const sell = sellS.map((f, i) => f && O2[i] > K1[i]);
    return { AT, AT2, buy, sell };
  }

  it('the line starts on the first ATR bar from 0 when the filter is below 50', () => {
    // falling bars first: MFI below 50 on the first ATR bar
    const bars = walk(1300, 17, 4, 0.5).map((b, i) => (i < 30 ? { ...b, open: 200 - i * 2, close: 199 - i * 2, high: 201 - i * 2, low: 198 - i * 2 } : b));
    const res = alpha.calculate(bars);
    const exp = expected(bars);
    expectSeries(vals(res.plots.plot0), exp.AT);
    expectSeries(vals(res.plots.plot1), exp.AT2);
    expect(exp.AT[14]).toBe(0);
    expect(Number.isNaN(exp.AT[13])).toBe(true);
    const expMarkers = bars.flatMap((b, i) => [
      ...(exp.buy[i] && !Number.isNaN(exp.AT2[i]) ? [{ id: 'shape0', time: b.time, position: 'atPriceBottom', price: exp.AT2[i] * 0.9999, shape: 'labelUp', color: '#0022FC', text: 'BUY', textColor: '#FFFFFF', size: 'tiny' }] : []),
      ...(exp.sell[i] && !Number.isNaN(exp.AT2[i]) ? [{ id: 'shape1', time: b.time, position: 'atPriceTop', price: exp.AT2[i] * 1.0001, shape: 'labelDown', color: '#880E4F', text: 'SELL', textColor: '#FFFFFF', size: 'tiny' }] : []),
    ]);
    expect(expMarkers.length).toBeGreaterThan(4);
    expect(res.markers.length).toBe(expMarkers.length);
    res.markers.forEach((m, k) => {
      const { price, ...rest } = expMarkers[k];
      expect(m).toMatchObject(rest);
      expect(m.price!).toBeCloseTo(price, 8);
    });
    expect(res.alerts.find((a) => a.id === 'alert0')!.times).toEqual(bars.filter((_b, i) => exp.buy[i]).map((b) => b.time));
    expect(res.alerts.find((a) => a.id === 'alert1')!.times).toEqual(bars.filter((_b, i) => exp.sell[i]).map((b) => b.time));
  });

  it('Show Signals? off: no labels', () => {
    const res = alpha.calculate(walk(800, 17), { showSignals: false });
    expect(res.markers).toHaveLength(0);
    expect(alpha.inputConfig.find((c) => c.id === 'showSignals')).toMatchObject({ title: 'Show Signals?', defval: true });
  });
});
