/**
 * Community ports, drawing pass 5: the parts named by the review recomputed here from the originals' formulas on
 * seeded bars: SAR + EMA + MACD Buy / Sell labels, Liquidity Grabs bubbles, Technical Ratings markers, Trend Line Auto
 * lines, Ehlers MESA MAMA / FAMA (arrows, fills, bar colours), CM Sling Shot entries, MACD ReLoaded (no Zero line) and
 * MACD Support and Resistance (Zero Line).
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as sem from '../../src/community/sar-ema-macd';
import * as liq from '../../src/community/liquidity-grabs';
import * as tr from '../../src/community/technical-ratings';
import * as tla from '../../src/community/trend-line-auto';
import * as mesa from '../../src/community/ehlers-mesa-ma';
import * as sling from '../../src/community/cm-sling-shot';
import * as macdRe from '../../src/community/macd-reloaded';
import * as macdSr from '../../src/community/macd-support-resistance';

/** Seeded random walk of daily bars (times in seconds) */
function walk(count: number, seed0: number, vol = 4): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * vol);
    const high = Math.max(o, p) + rnd() * 1.5;
    const low = Math.min(o, p) - rnd() * 1.5;
    out.push({ time: 1577836800 + i * 86400, open: o, high, low, close: p, volume: 1e6 });
  }
  return out;
}

const bars = walk(1300, 7);
const bars2 = walk(1500, 4242);

// --- Pine reference helpers (independent of the ports) ---
const back = (a: number[], i: number, k = 1) => (i - k >= 0 ? a[i - k] : NaN);
const nz = (v: number) => (Number.isFinite(v) ? v : 0);
/** ta.ema: na until the length-th valid value (seeded with their mean) */
function ema(src: number[], len: number): number[] {
  const out: number[] = [];
  const a = 2 / (len + 1);
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (!Number.isFinite(v)) { out.push(isNaN(prev) ? NaN : prev); continue; }
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
function highest(src: number[], len: number): number[] {
  return src.map((_, i) => (i < len - 1 ? NaN : Math.max(...src.slice(i - len + 1, i + 1))));
}
function lowest(src: number[], len: number): number[] {
  return src.map((_, i) => (i < len - 1 ? NaN : Math.min(...src.slice(i - len + 1, i + 1))));
}
/** ta.sar as its reference implementation */
function sar(b: Bar[], start: number, inc: number, max: number): number[] {
  const out: number[] = [];
  let result = NaN, maxMin = NaN, acc = NaN, isBelow = false;
  for (let i = 0; i < b.length; i++) {
    let first = false;
    if (i === 1) {
      if (b[i].close > b[i - 1].close) { isBelow = true; maxMin = b[i].high; result = b[i - 1].low; }
      else { isBelow = false; maxMin = b[i].low; result = b[i - 1].high; }
      first = true;
      acc = start;
    }
    result = result + acc * (maxMin - result);
    if (isBelow) {
      if (result > b[i].low) { first = true; isBelow = false; result = Math.max(b[i].high, maxMin); maxMin = b[i].low; acc = start; }
    } else if (result < b[i].high) {
      first = true; isBelow = true; result = Math.min(b[i].low, maxMin); maxMin = b[i].high; acc = start;
    }
    if (!first) {
      if (isBelow) { if (b[i].high > maxMin) { maxMin = b[i].high; acc = Math.min(acc + inc, max); } }
      else if (b[i].low < maxMin) { maxMin = b[i].low; acc = Math.min(acc + inc, max); }
    }
    if (i >= 1) {
      if (isBelow) { result = Math.min(result, b[i - 1].low); if (i > 1) result = Math.min(result, b[i - 2].low); }
      else { result = Math.max(result, b[i - 1].high); if (i > 1) result = Math.max(result, b[i - 2].high); }
    }
    out.push(result);
  }
  return out;
}
const timesOf = (list: Array<{ time: unknown; id?: string }>, id: string) => list.filter((m) => m.id === id).map((m) => m.time);

describe('SAR + EMA 200 + MACD Signals: Buy / Sell labels on the original rule', () => {
  function expected(b: Bar[]) {
    const close = b.map((x) => x.close);
    const s = sar(b, 0.02, 0.02, 0.2);
    const e200 = ema(close, 200);
    const e12 = ema(close, 12), e26 = ema(close, 26);
    const macd = e12.map((v, i) => v - e26[i]);
    const sig = ema(macd, 9);
    const delta = macd.map((v, i) => v - sig[i]);
    const buy: number[] = [], sell: number[] = [];
    for (let i = 1; i < b.length; i++) {
      const bearish = (b[i].open + b[i].high + b[i].low + b[i].close) / 4 < e200[i];
      const up = delta[i] > 0 && delta[i - 1] <= 0;
      const dn = delta[i] < 0 && delta[i - 1] >= 0;
      if (s[i] < b[i].low && up && !bearish) buy.push(b[i].time);
      if (s[i] > b[i].high && dn && bearish) sell.push(b[i].time);
    }
    return { buy, sell };
  }
  for (const [name, b] of [['walk 7', bars], ['walk 4242', bars2]] as const) {
    it(`labels = the original's buy / sell signals (${name})`, () => {
      const r = sem.calculate(b);
      const { buy, sell } = expected(b);
      expect(buy.length + sell.length).toBeGreaterThan(0);
      expect(timesOf(r.markers, 'shape0')).toEqual(buy);
      expect(timesOf(r.markers, 'shape1')).toEqual(sell);
      expect(r.markers.length).toBe(buy.length + sell.length);
      // the alerts read the same series
      expect(r.alerts[0].times).toEqual(buy);
      expect(r.alerts[1].times).toEqual(sell);
      for (const m of r.markers) {
        if (m.id === 'shape0') expect(m).toMatchObject({ position: 'belowBar', shape: 'labelUp', color: '#4CAF50', text: 'Buy', textColor: '#FFFFFF', size: 'tiny' });
        else expect(m).toMatchObject({ position: 'aboveBar', shape: 'labelDown', color: '#FF5252', text: 'Sell', textColor: '#FFFFFF', size: 'tiny' });
      }
    });
  }
});

describe('Liquidity Grabs: bubbles on the original rule', () => {
  /** the original's detection, wick / body a plain division, on the confirmed bars of the last 5000 */
  function expected(b: Bar[], lastConfirmed = true) {
    const n = b.length, len = 25, WBR = 0.5;
    const hs = b.map((x) => x.high), ls = b.map((x) => x.low);
    const ph = new Array(n).fill(NaN), pl = new Array(n).fill(NaN);
    for (let i = 2 * len; i < n; i++) {
      const c = i - len;
      let isH = true, isL = true;
      for (let j = 1; j <= len; j++) {
        if (!(hs[c] >= hs[c - j] && hs[c] > hs[c + j])) isH = false;
        if (!(ls[c] <= ls[c - j] && ls[c] < ls[c + j])) isL = false;
      }
      if (isH) ph[i] = hs[c];
      if (isL) pl[i] = ls[c];
    }
    const plots: Record<string, number[]> = {};
    for (const k of ['buySm', 'buyMd', 'buyLg', 'sellSm', 'sellMd', 'sellLg']) plots[k] = new Array(n).fill(NaN);
    const buyL: number[] = [], sellL: number[] = [];
    const buyA: number[] = [], sellA: number[] = [];
    let lastB = 0, lastS = 0;
    for (let i = 0; i < n; i++) {
      if (!(n - 1 - i < 5000 && (i < n - 1 || lastConfirmed))) continue;
      if (!isNaN(ph[i])) { buyL.push(ph[i]); if (buyL.length > 5) buyL.shift(); }
      if (!isNaN(pl[i])) { sellL.push(pl[i]); if (sellL.length > 5) sellL.shift(); }
      const x = b[i];
      const top = Math.max(x.close, x.open), bot = Math.min(x.close, x.open);
      let found = false, buyside = true, size = 1;
      const rem: number[] = [];
      for (const l of buyL) {
        if (x.high > l && top < l) {
          found = true; buyside = true; size = Math.floor(Math.min((x.high - top) / Math.abs(x.close - x.open) / WBR, 3));
          rem.push(l); break;
        }
        if (top > l) { rem.push(l); break; }
      }
      if (!found) {
        for (const l of sellL) {
          if (x.low < l && bot > l) {
            found = true; buyside = false; size = Math.floor(Math.min((bot - x.low) / Math.abs(x.close - x.open) / WBR, 3));
            rem.push(l); break;
          }
          if (bot < l) { rem.push(l); break; }
        }
      }
      for (const l of rem) {
        const bi = buyL.indexOf(l);
        if (bi !== -1) { buyL.splice(bi, 1); continue; }
        const si = sellL.indexOf(l);
        if (si !== -1) sellL.splice(si, 1);
      }
      const ok = (buyside && i - lastB > 3) || (!buyside && i - lastS > 3);
      if (found && size > 0) {
        (buyside ? buyA : sellA).push(x.time);
        if (ok) {
          if (buyside) lastB = i; else lastS = i;
          const key = (buyside ? 'buy' : 'sell') + ['Sm', 'Md', 'Lg'][size - 1];
          plots[key][i] = buyside ? x.high : x.low;
        }
      }
    }
    return { plots, buyA, sellA };
  }
  const big = walk(5400, 31, 6);
  // bars with no body (open = close) on every 3rd bar
  const noBody = walk(1400, 77, 6).map((x, i) => (i % 3 === 0 ? { ...x, open: x.close } : x));
  for (const [name, b, conf] of [['walk 7', bars, true], ['5400 bars', big, true], ['no-body bars', noBody, true],
    ['last bar open', bars2, false]] as const) {
    it(`bubbles and alerts (${name})`, () => {
      const r = liq.calculate(b, {}, { lastBarConfirmed: conf } as never);
      const e = expected(b, conf);
      let drawn = 0;
      for (const k of Object.keys(e.plots)) {
        const got = (r.plots[k] as Array<{ value: number }>).map((p) => p.value);
        expect(got).toEqual(e.plots[k]);
        drawn += e.plots[k].filter((v) => !isNaN(v)).length;
      }
      expect(drawn).toBeGreaterThan(0);
      expect(r.alerts[0].times).toEqual(e.buyA);
      expect(r.alerts[1].times).toEqual(e.sellA);
    });
  }
  it('no grab before the last 5000 bars, large bubbles on no-body grab bars', () => {
    const r = liq.calculate(big);
    for (const k of Object.keys(r.plots)) {
      const vals = (r.plots[k] as Array<{ value: number }>).slice(0, 400).map((p) => p.value);
      expect(vals.every((v) => isNaN(v))).toBe(true);
    }
    const rn = liq.calculate(noBody);
    const lg = [...(rn.plots.buyLg as Array<{ value: number }>), ...(rn.plots.sellLg as Array<{ value: number }>)];
    const noBodyLarge = lg.filter((p, j) => !isNaN(p.value) && (j % noBody.length) % 3 === 0);
    expect(noBodyLarge.length).toBeGreaterThan(0);
    expect(liq.plotConfig.map((p) => p.style)).toEqual(new Array(6).fill('circles'));
  });
});

describe('Technical Ratings: markers on the bars of the alert triggers', () => {
  const inputs = { dirInput: 'Longs and Shorts' as const, levelUpInput: 0.1, levelDnInput: -0.1 };
  function expected(rating: number[], delay: boolean, alt: boolean) {
    const longs: number[] = [], shorts: number[] = [];
    let lastUp: boolean | null = null;
    let prevL = false, prevS = false;
    for (let i = 0; i < rating.length; i++) {
      const xUp = rating[i] > 0.1 && back(rating, i) <= 0.1;
      const xDn = rating[i] < -0.1 && back(rating, i) >= -0.1;
      const rawL = xUp && (!alt || lastUp === null || !lastUp);
      const rawS = xDn && (!alt || lastUp === null || lastUp);
      const tL = delay ? prevL : rawL;
      const tS = delay ? prevS : rawS;
      prevL = rawL; prevS = rawS;
      if (tL) { longs.push(bars[i].time); lastUp = true; }
      else if (tS) { shorts.push(bars[i].time); lastUp = false; }
      // the markers: both plotchar series
      if (tL && tS) shorts.push(bars[i].time);
    }
    return { longs, shorts };
  }
  for (const [rep, alt] of [['On', 'On'], ['Off', 'On'], ['On', 'Off']] as const) {
    it(`Repainting ${rep}, alternate ${alt}`, () => {
      const r = tr.calculate(bars, { ...inputs, repaintInput: rep, altInput: alt }, { timeframe: '1D' } as never);
      const rating = (r.plots.plot0 as Array<{ value: number }>).map((p) => p.value);
      const e = expected(rating, rep === 'On', alt === 'On');
      expect(e.longs.length).toBeGreaterThan(0);
      expect(timesOf(r.markers, 'char0')).toEqual(e.longs);
      expect(timesOf(r.markers, 'char1')).toEqual(e.shorts);
      // markers and alert() calls on the same bars
      expect(r.alertCalls.filter((c) => c.message === 'Long').map((c) => c.time)).toEqual(e.longs);
      for (const m of r.markers) expect(m.text).toBe(m.id === 'char0' ? '▲' : '▼');
    });
  }
});

describe('Trend Line Auto: lines as the original', () => {
  type L = { x1: number; y1: number; x2: number; y2: number; up: boolean; dotted: boolean; del: boolean };
  function expected(b: Bar[], limit: number, segment: number, term: number, nowMs: number) {
    const n = b.length, mid = Math.trunc(term / 2) + 1;
    const hh = highest(b.map((x) => x.high), term), ll = lowest(b.map((x) => x.low), term);
    const fu = new Array(n).fill(NaN), fd = new Array(n).fill(NaN);
    for (let i = mid; i < n; i++) {
      if (hh[i] === b[i - mid].high) fu[i] = b[i - mid].high;
      if (ll[i] === b[i - mid].low) fd[i] = b[i - mid].low;
    }
    const all: L[] = [];
    const upL: (L | null)[] = [], dnL: (L | null)[] = [];
    const draw = (dat: number[], i: number, up: boolean) => {
      if (!(b[i].time * 1000 > nowMs - limit * 86400 * 1000)) return null;
      let maxv = 90, maxk = 0;
      for (let k = 0; k < segment; k++) {
        if (i - k < 0 || isNaN(dat[i - k])) continue;
        let ang = Math.atan((dat[i] - dat[i - k]) / k) / (355 / 113) * 180;
        if (!up) ang = -ang;
        if (ang < maxv) { maxk = k; maxv = ang; }
      }
      if (maxk <= 0) return null;
      const l: L = { x1: i - maxk - mid, y1: dat[i - maxk], x2: i - mid, y2: dat[i], up, dotted: false, del: false };
      all.push(l);
      const live = all.filter((x) => !x.del);
      if (live.length > 50) live[0].del = true;
      return l;
    };
    for (let i = 0; i < n; i++) { upL.push(draw(fu, i, true)); dnL.push(draw(fd, i, false)); }
    const last = n - 1;
    const care = (lin: (L | null)[]) => {
      let ref = 0;
      for (let k = 0; k < limit; k++) {
        const l = lin[last - k];
        if (!l) continue;
        ref = l.del ? NaN : l.y1 + (l.y2 - l.y1) * (last - l.x1) / (l.x2 - l.x1);
        const gap = Math.abs(b[last].close - ref) / (hh[last] - ll[last]);
        if (gap > 2 || Math.abs(l.x1 - l.x2) < term) l.del = true;
        if (gap > 1) l.dotted = true;
      }
      return ref;
    };
    const up = care(upL), dn = care(dnL);
    const c = b[last].close, c1 = b[last - 1].close;
    const alert = (c1 < up && c > up) || (c1 > dn && c < dn) || (c1 > up && c < up) || (c1 < dn && c > dn);
    return {
      lines: all.filter((l) => !l.del).map((l) => ({ time1: b[l.x1].time, price1: l.y1, time2: b[l.x2].time, price2: l.y2,
        color: l.up ? '#00FF00' : '#FFFF00', style: l.dotted ? 'dotted' : 'solid' })),
      created: all.length,
      alert,
    };
  }
  for (const [name, b, cfg] of [
    ['defaults', walk(1300, 4242), { limit: 100, segment: 55, term: 15 }],
    ['limit 500 (line limit)', bars2, { limit: 500, segment: 200, term: 5 }],
    ['term 9', bars, { limit: 300, segment: 30, term: 9 }],
  ] as const) {
    it(`lines (${name})`, () => {
      const nowMs = (b[b.length - 1].time + 3600) * 1000;
      const r = tla.calculate(b, cfg, { timeframe: '1D', now: nowMs } as never);
      const e = expected(b, cfg.limit, cfg.segment, cfg.term, nowMs);
      expect(e.lines.length).toBeGreaterThan(0);
      if (name.startsWith('limit 500')) expect(e.created).toBeGreaterThan(50);
      expect(r.lines.map((l) => ({ time1: l.time1, price1: l.price1, time2: l.time2, price2: l.price2, color: l.color, style: l.style })))
        .toEqual(e.lines);
      expect(r.lines.every((l) => l.extend === 'right')).toBe(true);
      expect(r.alerts[0].triggered).toBe(e.alert);
    });
  }
  it('no line on bars older than limit intervals before now', () => {
    const r = tla.calculate(bars, {}, { timeframe: '1D', now: (bars[bars.length - 1].time + 400 * 86400) * 1000 } as never);
    expect(r.lines.length).toBe(0);
  });
});

describe('Ehlers MESA Adaptive Moving Average: the original formulas', () => {
  function expected(b: Bar[], fl = 0.5, sl = 0.05) {
    const n = b.length;
    const s = b.map((x) => (x.high + x.low) / 2);
    const sp: number[] = [], dt: number[] = [], q1: number[] = [], i1: number[] = [], i2: number[] = [], q2: number[] = [];
    const re: number[] = [], im: number[] = [], p1: number[] = [], p3: number[] = [], p: number[] = [], ph: number[] = [];
    const mama: number[] = [], fama: number[] = [];
    const h = (x: number[], i: number) =>
      (0.0962 * x[i] + 0.5769 * nz(back(x, i, 2)) - 0.5769 * nz(back(x, i, 4)) - 0.0962 * nz(back(x, i, 6))) * (0.075 * nz(back(p, i)) + 0.54);
    for (let i = 0; i < n; i++) {
      sp[i] = (4 * s[i] + 3 * back(s, i, 1) + 2 * back(s, i, 2) + back(s, i, 3)) / 10;
      dt[i] = h(sp, i);
      q1[i] = h(dt, i);
      i1[i] = nz(back(dt, i, 3));
      const jI = h(i1, i), jq = h(q1, i);
      i2[i] = 0.2 * (i1[i] - jq) + 0.8 * nz(back(i2, i));
      q2[i] = 0.2 * (q1[i] + jI) + 0.8 * nz(back(q2, i));
      re[i] = 0.2 * (i2[i] * nz(back(i2, i)) + q2[i] * nz(back(q2, i))) + 0.8 * nz(back(re, i));
      im[i] = 0.2 * (i2[i] * nz(back(q2, i)) - q2[i] * nz(back(i2, i))) + 0.8 * nz(back(im, i));
      p1[i] = !isNaN(im[i]) && !isNaN(re[i]) && im[i] !== 0 && re[i] !== 0 ? 360 / Math.atan(im[i] / re[i]) : nz(back(p, i));
      const pp = nz(back(p1, i));
      const p2 = p1[i] > 1.5 * pp ? 1.5 * pp : p1[i] < 0.67 * pp ? 0.67 * pp : p1[i];
      p3[i] = p2 < 6 ? 6 : p2 > 50 ? 50 : p2;
      p[i] = 0.2 * p3[i] + 0.8 * nz(back(p3, i));
      ph[i] = Math.atan(q1[i] / i1[i]);
      const d_ = nz(back(ph, i)) - ph[i];
      const d = d_ < 1 ? 1 : d_;
      const a_ = fl / d;
      const a = a_ < sl ? sl : a_ > fl ? fl : a_;
      mama[i] = a * s[i] + (1 - a) * nz(back(mama, i));
      fama[i] = 0.5 * a * mama[i] + (1 - 0.5 * a) * nz(back(fama, i));
    }
    return { mama, fama };
  }
  const close = (a: number[], b: number[]) => {
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(b[i])) expect(Number.isFinite(a[i])).toBe(false);
      else expect(a[i]).toBeCloseTo(b[i], 8);
    }
  };
  it('MAMA / FAMA, nothing optional by default', () => {
    const r = mesa.calculate(bars);
    const e = expected(bars);
    close((r.plots.plot0 as Array<{ value: number }>).map((x) => x.value), e.mama);
    close((r.plots.plot1 as Array<{ value: number }>).map((x) => x.value), e.fama);
    expect((r.plots.duml as Array<{ value: number }>).every((x) => isNaN(x.value))).toBe(true);
    expect(r.arrows.length).toBe(0);
    expect(r.barColors.length).toBe(0);
    expect(mesa.defaultInputs.src).toBe('hl2');
    expect(mesa.plotConfig.map((x) => [x.title, x.color])).toEqual([['DummyL', '#808080'], ['MAMA', '#FF0000'], ['FAMA', '#008000']]);
  });
  it('crossover arrows, region fill and bar colours when switched on', () => {
    const r = mesa.calculate(bars2, { markCrossovers: true, fillRegion: true, barColorsOn: true });
    const { mama, fama } = expected(bars2);
    const arrows: Array<{ time: number; value: number }> = [];
    let side = 0;
    for (let i = 0; i < bars2.length; i++) {
      const a = mama[i], b = fama[i];
      if (isNaN(a) || isNaN(b)) continue;
      if ((side < 0 && a > b) || (side > 0 && a < b)) arrows.push({ time: bars2[i].time, value: a < b ? -1 : 1 });
      if (a < b) side = -1; else if (a > b) side = 1;
    }
    expect(arrows.length).toBeGreaterThan(5);
    expect(r.arrows.map((a) => ({ time: a.time, value: a.value }))).toEqual(arrows);
    expect(r.arrows.every((a) => a.id === 'arrow0' && a.color === (a.value > 0 ? '#00FF00' : '#FF0000'))).toBe(true);
    close((r.plots.duml as Array<{ value: number }>).map((x) => x.value), mama.map((v, i) => (v > fama[i] ? v : fama[i])));
    expect(r.barColors.map((c) => c.color)).toEqual(mama.map((v, i) => (v > fama[i] ? '#00FF00' : '#FF0000')));
    expect(r.barColors.every((c) => c.id === 'barcolor0')).toBe(true);
    expect(r.fills?.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([['duml', 'plot0', 'NegativeFill'], ['duml', 'plot1', 'PositiveFill']]);
  });
});

describe('CM Sling Shot System: entries on the current fast EMA', () => {
  for (const [name, b] of [['walk 7', bars], ['walk 4242', bars2]] as const) {
    it(`arrows, letters and bar colours (${name})`, () => {
      const r = sling.calculate(b, { showLetters: true });
      const close = b.map((x) => x.close);
      const f = ema(close, 38), s = ema(close, 62);
      const up: number[] = [], dn: number[] = [], aqua: number[] = [], yellow: number[] = [];
      for (let i = 0; i < b.length; i++) {
        const c1 = back(close, i);
        const eu = f[i] > s[i] && c1 < f[i] && close[i] > f[i];
        const ed = f[i] < s[i] && c1 > f[i] && close[i] < f[i];
        if (eu) up.push(b[i].time);
        if (ed) dn.push(b[i].time);
        if (eu || ed) aqua.push(b[i].time);
        else if ((f[i] > s[i] && close[i] < f[i]) || (f[i] < s[i] && close[i] > f[i])) yellow.push(b[i].time);
      }
      expect(up.length).toBeGreaterThan(0);
      expect(dn.length).toBeGreaterThan(0);
      expect(r.arrows.filter((a) => a.id === 'arrow0').map((a) => a.time)).toEqual(up);
      expect(r.arrows.filter((a) => a.id === 'arrow1').map((a) => a.time)).toEqual(dn);
      expect(timesOf(r.markers, 'char2')).toEqual(up);
      expect(timesOf(r.markers, 'char3')).toEqual(dn);
      expect(r.barColors.filter((c) => c.id === 'barcolor1').map((c) => c.time)).toEqual(aqua);
      expect(r.barColors.filter((c) => c.id === 'barcolor0').map((c) => c.time)).toEqual(yellow);
      expect(timesOf(r.markers, 'shape0')).toEqual(b.filter((_, i) => f[i] >= s[i]).map((x) => x.time));
      expect(timesOf(r.markers, 'shape1')).toEqual(b.filter((_, i) => f[i] < s[i]).map((x) => x.time));
    });
  }
});

describe('MACD ReLoaded / MACD Support and Resistance: horizontal lines', () => {
  it('MACD ReLoaded draws no horizontal line', () => {
    const r = macdRe.calculate(bars);
    expect(r.hlines ?? []).toEqual([]);
  });
  it('MACD Support and Resistance draws the dashed Zero Line', () => {
    const r = macdSr.calculate(bars);
    expect(r.hlines).toHaveLength(1);
    expect(r.hlines![0].value).toBe(0);
    expect(r.hlines![0].options).toMatchObject({ title: 'Zero Line', linestyle: 'dashed', linewidth: 1 });
    expect(String(r.hlines![0].options?.color).replace(/\s/g, '')).toMatch(/^rgba\(120,123,134,0\.7\d*\)$/);
  });
});
