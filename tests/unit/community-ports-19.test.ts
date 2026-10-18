/**
 * Alerts and Style ids of 16 community ports (batch 19): the alertcondition() declarations (ids, titles and messages
 * of the originals), the bars on which each condition is true (re-computed here from the original's expression), the
 * alert() calls (bars, messages, frequency), and the plotarrow outputs given as arrows with their ids.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as itsbb from '../../src/community/intraday-ts-bb';
import * as ivs from '../../src/community/intraday-volume-swings';
import * as idwma from '../../src/community/inverse-distance-weighted-moving-average';
import * as ifvg from '../../src/community/inversion-fair-value-gaps';
import * as ipo from '../../src/community/ipo-date-screener';
import * as iso from '../../src/community/isolated-peak-bottom';
import * as itg from '../../src/community/itg-scalper';
import * as iu from '../../src/community/iu-smart-flow-system';
import * as jma from '../../src/community/jurik-moving-average';
import * as kflow from '../../src/community/kalman-flow-lyro-rs';
import * as khb from '../../src/community/kalman-hull-bands-for-loop-rakoquant';
import * as khk from '../../src/community/kalman-hull-kijun';
import * as kvwap from '../../src/community/kalman-vwap-filter';
import * as kama from '../../src/community/kaufman-adaptive-ma';
import * as kd from '../../src/community/kd-newautotrade-for-future-trading-heikin-ashi-candles';
import * as kae from '../../src/community/keltner-aroon-efi-flow';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

/** Seeded random walk of bars (default daily) with a random volume */
function walk(count: number, seed0: number, step = 86400, start = 1577836800): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1200, 7);
const n = bars.length;
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const S = (list: Bar[], a: number[]) => Series.fromArray(list, a);

const over = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const under = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);
const roll = (src: number[], len: number, f: (w: number[]) => number) =>
  src.map((_, i) => (i < len - 1 ? NaN : f(src.slice(i - len + 1, i + 1))));
const sma = (src: number[], len: number) => roll(src, len, (w) => w.reduce((s, v) => s + v, 0) / len);

describe('intraday-ts-bb: plotarrow outputs as arrows', () => {
  const r = itsbb.calculate(bars);
  it('arrows carry the spec ids, values +1 / -1, and no arrow markers are left', () => {
    expect(r.arrows.length).toBeGreaterThan(0);
    for (const a of r.arrows) {
      expect(['arrow0', 'arrow1']).toContain(a.id);
      expect(a.value).toBe(a.id === 'arrow0' ? 1 : -1);
    }
    expect(r.markers.some((m) => m.shape === 'arrowUp' || m.shape === 'arrowDown')).toBe(false);
  });
  it('arrow bars: first bar above the upper band / below the lower band (codiff / codiff2)', () => {
    const basis = sma(close, 46);
    const dev = roll(close, 46, (w) => {
      const m = w.reduce((s, v) => s + v, 0) / w.length;
      return Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / w.length);
    });
    const upper = basis.map((v, i) => v + 0.35 * dev[i]);
    const lower = basis.map((v, i) => v - 0.35 * dev[i]);
    const isOver = bars.map((b, i) => b.low > upper[i]);
    const isUnder = bars.map((b, i) => b.high < lower[i]);
    let hr = NaN;
    let lr = NaN;
    const hrA: number[] = [];
    const lrA: number[] = [];
    bars.forEach((b, i) => {
      if (i > 0 && isOver[i] !== isOver[i - 1]) hr = b.high;
      if (i > 0 && isUnder[i] !== isUnder[i - 1]) lr = b.low;
      hrA.push(hr);
      lrA.push(lr);
    });
    const warm = 46;
    const up = bars.map((_, i) => i >= warm && isOver[i] && !(hrA[i] === hrA[i - 1] && !isNaN(hrA[i])));
    const dn = bars.map((_, i) => i >= warm && isUnder[i] && !(lrA[i] === lrA[i - 1] && !isNaN(lrA[i])));
    expect(r.arrows.filter((a) => a.id === 'arrow0').map((a) => a.time)).toEqual(timeAt(bars, up));
    expect(r.arrows.filter((a) => a.id === 'arrow1').map((a) => a.time)).toEqual(timeAt(bars, dn));
  });
});

describe('intraday-volume-swings: alert() calls', () => {
  const ib = walk(1500, 11, 900);
  const check = (mustClose: boolean) => {
    const r = ivs.calculate(ib, { plotCurrent: true, regionMustClose: mustClose });
    const v = (id: string) => r.plots[id].map((p) => p.value);
    const curLowTop = v('plot0');
    const curHighBot = v('plot3');
    const prevLowTop = v('plot4');
    const prevHighBot = v('plot7');
    const expected: { time: number; message: string }[] = [];
    ib.forEach((b, i) => {
      const p = i > 0 ? ib[i - 1] : undefined;
      const o1 = p ? p.open : NaN;
      const c1 = p ? p.close : NaN;
      const upInto = (x: number) => (mustClose ? o1 < x && c1 >= x : b.open < x && b.high >= x);
      const dnInto = (x: number) => (mustClose ? o1 > x && c1 <= x : b.open > x && b.low <= x);
      if (upInto(prevHighBot[i])) expected.push({ time: b.time, message: "Pushing up into yesterday's swing high region" });
      if (dnInto(prevLowTop[i])) expected.push({ time: b.time, message: "Pushing down into yesterday's swing low region" });
      if (upInto(curHighBot[i])) expected.push({ time: b.time, message: 'Pushing up into current swing high region' });
      if (dnInto(curLowTop[i])) expected.push({ time: b.time, message: 'Pushing down into current swing low region' });
    });
    return { r, expected };
  };
  it('hasAlertFunction, calls equal the recomputation (both region modes), once per bar', () => {
    expect(ivs.hasAlertFunction).toBe(true);
    for (const mustClose of [true, false]) {
      const { r, expected } = check(mustClose);
      expect(expected.length).toBeGreaterThan(0);
      expect(r.alertCalls.map((c) => ({ time: c.time, message: c.message }))).toEqual(expected);
      expect(r.alertCalls.every((c) => c.freq === 'once_per_bar')).toBe(true);
    }
    const msgs = new Set(check(false).r.alertCalls.map((c) => c.message));
    expect(msgs.size).toBe(4);
  });
});

describe('inverse-distance-weighted-moving-average: alerts', () => {
  const r = idwma.calculate(bars);
  it('declarations', () => {
    expect(decls(idwma)).toEqual([
      ['alert0', 'Bullish Color Change', 'IDWMA - Bullish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
      ['alert1', 'Bearish Color Change', 'IDWMA - Bearish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
      ['alert2', 'Any Color Change', 'IDWMA - Any Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
    ]);
  });
  it('times equal the recomputation', () => {
    const len = 14;
    const ma = bars.map((_, b) => {
      const at = (i: number) => (b - i >= 0 ? close[b - i] : close[b]);
      const w = new Array(len).fill(0);
      for (let i = 0; i < len - 1; i++) {
        for (let j = i + 1; j < len; j++) {
          const d = Math.abs(at(i) - at(j));
          w[i] += d;
          w[j] += d;
        }
      }
      let s = 0;
      let ws = 0;
      for (let i = 0; i < len; i++) {
        s += at(i) * w[i];
        ws += w[i];
      }
      return Math.abs(ws) > EPS ? s / ws : close[b];
    });
    const col = ma.map((v, i) => (i > 0 && gt(v, ma[i - 1]) ? 'bull' : 'bear'));
    const bull = col.map((c, i) => i > 0 && col[i - 1] !== 'bull' && c === 'bull');
    const bear = col.map((c, i) => i > 0 && col[i - 1] !== 'bear' && c === 'bear');
    const any = col.map((c, i) => i > 0 && c !== col[i - 1]);
    expect(bull.some(Boolean)).toBe(true);
    expect(r.alerts.map((a) => a.times)).toEqual([timeAt(bars, bull), timeAt(bars, bear), timeAt(bars, any)]);
  });
});

describe('inversion-fair-value-gaps: alerts', () => {
  it('declarations', () => {
    expect(decls(ifvg)).toEqual([
      ['alert0', 'Bullish Signal', 'Alert Fired!'],
      ['alert1', 'Bearish Signal', 'Alert Fired!'],
    ]);
  });
  // A bullish gap (bars 9-11), a body through its bottom (bar 13: inversion), a close back inside (bar 14) and a
  // close below the zone (bar 15): a bearish signal on bar 15 only. Mirrored prices give a bullish signal.
  const ohlc: [number, number, number, number][] = [
    ...Array.from({ length: 10 }, () => [100, 100.5, 99.5, 100] as [number, number, number, number]),
    [100, 104.2, 99.8, 104], [104.5, 105.5, 103, 105], [105, 105.2, 103.5, 104], [104, 104.2, 99.8, 100],
    [100, 101.8, 99.9, 101.5], [101.5, 101.6, 99.3, 99.5],
    ...Array.from({ length: 5 }, () => [99.5, 99.8, 99.2, 99.5] as [number, number, number, number]),
  ];
  const mk = (rows: [number, number, number, number][]) =>
    rows.map(([o, h, l, c], i) => ({ time: 1577836800 + i * 86400, open: o, high: h, low: l, close: c, volume: 1 }));
  const down = mk(ohlc);
  const up = mk(ohlc.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c]));
  it('fires on the crafted bars only, and the signal triangle is on that bar', () => {
    const rd = ifvg.calculate(down);
    expect(rd.alerts.map((a) => a.times)).toEqual([[], [down[15].time]]);
    expect(rd.labels.filter((l) => l.text === '▼\n').map((l) => l.time)).toEqual([down[15].time]);
    const ru = ifvg.calculate(up);
    expect(ru.alerts.map((a) => a.times)).toEqual([[up[15].time], []]);
    expect(ru.labels.filter((l) => l.text === '\n▲').map((l) => l.time)).toEqual([up[15].time]);
  });
  it('random bars: every drawn signal triangle is on a bar of the matching condition', () => {
    const r = ifvg.calculate(bars, { dispNum: 100, atrMulti: 0 });
    const [bull, bear] = r.alerts;
    expect(bull.times.length + bear.times.length).toBeGreaterThan(0);
    for (const l of r.labels) expect((l.text === '\n▲' ? bull : bear).times).toContain(l.time);
  });
});

describe('ipo-date-screener: alert', () => {
  it('declaration and times (bar count below the threshold)', () => {
    expect(decls(ipo)).toEqual([['alert0', 'IPO Date within IPO Days', 'This stock has fewer bars than the user-defined threshold.']]);
    const r = ipo.calculate(bars);
    expect(r.alerts[0].times).toEqual(timeAt(bars, bars.map((_, i) => i + 1 < 498)));
    expect(r.alerts[0].triggered).toBe(false);
  });
});

describe('isolated-peak-bottom: alerts', () => {
  const r = iso.calculate(bars);
  it('declarations', () => {
    expect(decls(iso)).toEqual([
      ['alert0', 'SELL Alarm', 'ISOPEAK 1!'],
      ['alert1', 'SELL Alarm', 'ISOPEAK 2!'],
      ['alert2', 'BUY Alarm', 'ISOBOTTOM 1!'],
      ['alert3', 'BUY Alarm', 'ISOBOTTOM 2!'],
    ]);
  });
  it('times equal the recomputation (ISOBOTTOM 2 uses izodip1 as the original)', () => {
    const h = (i: number) => (i >= 0 ? bars[i].high : NaN);
    const l = (i: number) => (i >= 0 ? bars[i].low : NaN);
    const t1 = bars.map((_, i) => h(i - 2) > h(i) && h(i - 2) >= h(i - 1) && h(i - 2) > h(i - 3) && h(i - 2) > h(i - 4)
      && l(i - 1) > Math.min(l(i - 3), l(i - 2)) && l(i) < Math.min(l(i - 3), l(i - 2)));
    const t2 = bars.map((_, i) => h(i - 1) > h(i) && h(i - 1) > h(i - 2) && h(i - 1) > h(i - 3) && l(i) < Math.min(l(i - 2), l(i - 1)));
    const d1 = bars.map((_, i) => l(i - 2) < l(i) && l(i - 2) < l(i - 1) && l(i - 2) < l(i - 3) && l(i - 2) < l(i - 4)
      && h(i - 1) < Math.max(h(i - 3), h(i - 2)) && h(i) > Math.max(h(i - 3), h(i - 2)));
    expect(t1.some(Boolean) && t2.some(Boolean) && d1.some(Boolean)).toBe(true);
    expect(r.alerts.map((a) => a.times)).toEqual([timeAt(bars, t1), timeAt(bars, t2), timeAt(bars, d1), timeAt(bars, d1)]);
  });
});

describe('itg-scalper: alerts', () => {
  it('declarations', () => {
    expect(decls(itg)).toEqual([['alert0', 'Buy alert', 'Buy alert'], ['alert1', 'Sell alert', 'Sell alert']]);
  });
  const recompute = (lastConfirmed: boolean) => {
    const c = S(bars, close);
    const e1 = ta.ema(c, 14);
    const e2 = ta.ema(e1, 14);
    const e3 = A(ta.ema(e2, 14));
    const a1 = A(e1);
    const a2 = A(e2);
    const out = a1.map((v, i) => 3 * (v - a2[i]) + e3[i]);
    const fast = A(ta.ema(c, 12));
    const slow = A(ta.ema(c, 26));
    const macd = fast.map((v, i) => v - slow[i]);
    const sig = A(ta.sma(S(bars, macd), 9));
    let last = false;
    const longs: boolean[] = [];
    const shorts: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const prev = i > 0 ? out[i - 1] : NaN;
      const up = ge(out[i], prev);
      const dn = lt(out[i], prev);
      const conf = i < n - 1 || lastConfirmed;
      const lg = up && !last && up !== dn && ge(macd[i], sig[i]) && conf;
      const sh = dn && last && up !== dn && lt(macd[i], sig[i]) && conf;
      if (lg) last = true;
      if (sh) last = false;
      longs.push(lg);
      shorts.push(sh);
    }
    return [timeAt(bars, longs), timeAt(bars, shorts)];
  };
  it('times equal the recomputation, nothing on an unconfirmed last bar', () => {
    const exp = recompute(true);
    expect(exp[0].length).toBeGreaterThan(0);
    expect(itg.calculate(bars).alerts.map((a) => a.times)).toEqual(exp);
    expect(itg.calculate(bars, {}, { lastBarConfirmed: false }).alerts.map((a) => a.times)).toEqual(recompute(false));
  });
});

describe('iu-smart-flow-system: alert() calls', () => {
  const r = iu.calculate(bars);
  it('calls on the Long / Short entries, once per bar', () => {
    expect(iu.hasAlertFunction).toBe(true);
    const c = S(bars, close);
    const hi = A(ta.highest(c, 10));
    const lo = A(ta.lowest(c, 10));
    const atr = A(ta.atr(bars, 14));
    const m = A(ta.sma(c, 50));
    const rsi = A(ta.rsi(c, 14));
    let inL = false;
    let inS = false;
    const exp: { time: number; message: string; freq: string }[] = [];
    for (let i = 0; i < n; i++) {
      const c10 = i >= 10 ? close[i - 10] : NaN;
      const score = (hi[i] - c10) - (c10 - lo[i]);
      let le = false;
      let se = false;
      if (gt(score, 0) && gt(close[i], m[i] + atr[i]) && gt(rsi[i], 50) && !inL) { le = true; inL = true; inS = false; }
      if (lt(score, 0) && lt(close[i], m[i] - atr[i]) && lt(rsi[i], 50) && !inS) { se = true; inS = true; inL = false; }
      if (le) exp.push({ time: bars[i].time, message: 'Long Entry Tiggered!', freq: 'once_per_bar' });
      if (se) exp.push({ time: bars[i].time, message: 'Short Entry Tiggered!', freq: 'once_per_bar' });
    }
    expect(exp.length).toBeGreaterThan(1);
    expect(r.alertCalls).toEqual(exp);
    expect(r.alertCalls.map((a) => a.time)).toEqual(r.markers.map((mk) => mk.time));
  });
});

describe('jurik-moving-average: alerts', () => {
  it('declarations', () => {
    expect(decls(jma)).toEqual([
      ['alert0', 'Bullish Color Change', 'JMA Surrogate - Bullish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
      ['alert1', 'Bearish Color Change', 'JMA Surrogate - Bearish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
      ['alert2', 'Any Color Change', 'JMA Surrogate - Any Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
    ]);
  });
  const recompute = (lastConfirmed: boolean) => {
    const beta = (0.45 * 6) / (0.45 * 6 + 2);
    const alpha = beta * beta;
    const pr = 2.5;
    let e0 = 0;
    let e1 = 0;
    let e2 = 0;
    let j = 0;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      e0 = (1 - alpha) * close[i] + alpha * e0;
      e1 = (1 - beta) * (close[i] - e0) + beta * e1;
      e2 = (1 - alpha) ** 2 * (e0 + pr * e1 - j) + alpha ** 2 * e2;
      j = e2 + j;
      out.push(j);
    }
    const col = out.map((v, i) => (i > 0 && v > out[i - 1] ? 'g' : 'p'));
    const aw = (i: number) => i < n - 1 || lastConfirmed;
    return [
      col.map((c, i) => i > 0 && c === 'g' && col[i - 1] !== 'g' && aw(i)),
      col.map((c, i) => i > 0 && c === 'p' && col[i - 1] !== 'p' && aw(i)),
      col.map((c, i) => i > 0 && c !== col[i - 1] && aw(i)),
    ].map((f) => timeAt(bars, f));
  };
  it('times equal the recomputation; await bar confirmation on the last bar', () => {
    expect(recompute(true)[0].length).toBeGreaterThan(0);
    expect(jma.calculate(bars).alerts.map((a) => a.times)).toEqual(recompute(true));
    expect(jma.calculate(bars, {}, { lastBarConfirmed: false }).alerts.map((a) => a.times)).toEqual(recompute(false));
    expect(jma.calculate(bars, { awaitBarConfirmation: false }, { lastBarConfirmed: false }).alerts.map((a) => a.times))
      .toEqual(recompute(true));
  });
});

describe('kalman-flow-lyro-rs: alerts', () => {
  it('declarations', () => {
    expect(decls(kflow)).toEqual([
      ['alert0', 'Bullish Trend Flip', 'Kalman Flow | Lyro RS: Bullish trend flip on {{ticker}} ({{interval}})'],
      ['alert1', 'Bearish Trend Flip', 'Kalman Flow | Lyro RS: Bearish trend flip on {{ticker}} ({{interval}})'],
      ['alert2', 'Any Trend Flip', 'Kalman Flow | Lyro RS: Trend flip on {{ticker}} ({{interval}})'],
    ]);
  });
  it('times equal the recomputation', () => {
    const q = Math.pow(10, 4 / 2 - 6);
    let lv = NaN;
    let ve = 0;
    let p11 = 1, p12 = 0, p21 = 0, p22 = 1;
    const level: number[] = [];
    const vel: number[] = [];
    for (let i = 0; i < n; i++) {
      if (isNaN(lv)) lv = close[i];
      else {
        const pl = lv + ve;
        const a = p11 + p12 + p21 + p22 + q, b = p12 + p22, c = p21 + p22, d = p22 + q;
        const k1 = a / (a + 1), k2 = c / (a + 1);
        const inn = close[i] - pl;
        lv = pl + k1 * inn;
        ve = ve + k2 * inn;
        p11 = (1 - k1) * a; p12 = (1 - k1) * b; p21 = c - k2 * a; p22 = d - k2 * b;
      }
      level.push(lv);
      vel.push(ve);
    }
    const err = sma(close.map((c, i) => Math.abs(c - level[i])), 50);
    let t = 0;
    const trend = close.map((c, i) => {
      if (gt(c, level[i] + 1.65 * err[i]) && gt(vel[i], 0)) t = 1;
      else if (lt(c, level[i] - err[i]) && lt(vel[i], 0)) t = -1;
      return t;
    });
    const up = trend.map((v, i) => i > 0 && v === 1 && trend[i - 1] !== 1);
    const dn = trend.map((v, i) => i > 0 && v === -1 && trend[i - 1] !== -1);
    expect(up.some(Boolean) && dn.some(Boolean)).toBe(true);
    const r = kflow.calculate(bars);
    expect(r.alerts.map((a) => a.times)).toEqual([timeAt(bars, up), timeAt(bars, dn), timeAt(bars, up.map((u, i) => u || dn[i]))]);
  });
});

describe('kalman-hull-bands-for-loop-rakoquant: alerts', () => {
  it('declarations', () => {
    expect(decls(khb)).toEqual([
      ['alert0', 'RakoQuant Bull Breakout', 'RakoQuant Kalman Hull Rail Bands turned BULL {{exchange}}:{{ticker}} (close={{close}})'],
      ['alert1', 'RakoQuant Bear Breakout', 'RakoQuant Kalman Hull Rail Bands turned BEAR {{exchange}}:{{ticker}} (close={{close}})'],
    ]);
  });
  it('times equal the recomputation; confirmed bars only', () => {
    const src = bars.map((b) => b.high);
    let xh = NaN;
    let P = NaN;
    const k = src.map((x) => {
      if (isNaN(xh)) { xh = x; P = 1; }
      const pm = P + 0.0005;
      const K = pm / (pm + 0.045);
      xh = xh + K * (x - xh);
      P = (1 - K) * pm;
      return xh;
    });
    const base = A(ta.hma(S(bars, k), 37));
    const dev = src.map((s, i) => s - base[i]);
    const sd = roll(dev, 16, (w) => {
      const m = w.reduce((s, v) => s + v, 0) / 16;
      return Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / 16);
    });
    const upper = base.map((v, i) => v + 2 * sd[i]);
    const lower = base.map((v, i) => v - 2 * sd[i]);
    const bull = over(close, upper);
    const bear = under(close, lower);
    expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
    expect(khb.calculate(bars).alerts.map((a) => a.times)).toEqual([timeAt(bars, bull), timeAt(bars, bear)]);
    // an unconfirmed last bar gives no alert
    const crafted = bars.slice(0, bull.lastIndexOf(true) + 1);
    const ra = khb.calculate(crafted, {}, { lastBarConfirmed: false }).alerts[0];
    expect(ra.times).toEqual(timeAt(crafted, bull.slice(0, crafted.length - 1)));
    expect(khb.calculate(crafted).alerts[0].triggered).toBe(true);
  });
});

describe('kalman-hull-kijun: alerts', () => {
  it('declarations and times', () => {
    expect(decls(khk)).toEqual([
      ['alert0', 'Kalman Hull Kijun Long', 'Kalman Hull Kijun Long {{exchange}}:{{ticker}}'],
      ['alert1', 'Kalman Hull Kijun Short', 'Kalman Hull Kijun Short {{exchange}}:{{ticker}}'],
    ]);
    let st = NaN;
    let cv = 100;
    const kf = (z: number, noise: number) => {
      const pc = cv + 0.01;
      const g = pc / (pc + noise);
      st = st + g * (z - st);
      cv = (1 - g) * pc;
      return st;
    };
    const h = close.map((p) => {
      if (isNaN(st)) { st = p; cv = 1; }
      kf(p, 3);
      const half = kf(p, 1.5);
      const full = kf(p, 3);
      return kf(2 * half - full, Math.round(Math.sqrt(3)));
    });
    const base = roll(h, 26, (w) => (Math.min(...w) + Math.max(...w)) / 2);
    const r = khk.calculate(bars);
    expect(r.alerts.map((a) => a.times)).toEqual([
      timeAt(bars, close.map((c, i) => gt(c, base[i]))),
      timeAt(bars, close.map((c, i) => lt(c, base[i]))),
    ]);
  });
});

describe('kalman-vwap-filter: alerts', () => {
  it('declarations', () => {
    expect(decls(kvwap)).toEqual([
      ['alert0', 'Kalman VWAP Slope Up', 'Kalman VWAP Slope Up {{exchange}}:{{ticker}}'],
      ['alert1', 'Kalman VWAP Slope Down', 'Kalman VWAP Slope Down {{exchange}}:{{ticker}}'],
      ['alert2', 'Price Crosses Above Kalman VWAP', 'Price > Kalman VWAP {{exchange}}:{{ticker}}'],
      ['alert3', 'Price Crosses Below Kalman VWAP', 'Price < Kalman VWAP {{exchange}}:{{ticker}}'],
      ['alert4', 'Kalman VWAP Crosses Above VWAP Base', 'Kalman VWAP > VWAP Base {{exchange}}:{{ticker}}'],
      ['alert5', 'Kalman VWAP Crosses Below VWAP Base', 'Kalman VWAP < VWAP Base {{exchange}}:{{ticker}}'],
    ]);
  });
  const recompute = (vwapBase: number[]) => {
    const meas = close.map((p, i) => 0.65 * p + 0.35 * vwapBase[i]);
    let x = NaN;
    let P = 100;
    const k = meas.map((z) => {
      if (!Number.isFinite(x)) { x = z; P = 1; }
      const p = P + 0.01;
      const g = p / (p + 3);
      x = x + g * (z - x);
      P = (1 - g) * p;
      return x;
    });
    const k1 = k.map((_, i) => (i > 0 ? k[i - 1] : NaN));
    return [over(k, k1), under(k, k1), over(close, k), under(close, k), over(k, vwapBase), under(k, vwapBase)].map((f) => timeAt(bars, f));
  };
  it('rolling VWAP: times equal the recomputation', () => {
    const vol = bars.map((b) => b.volume as number);
    const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
    const vn = sma(hlc3.map((p, i) => p * vol[i]), 50);
    const vd = sma(vol, 50);
    const exp = recompute(vn.map((v, i) => v / vd[i]));
    expect(exp.every((t) => t.length > 0)).toBe(true);
    expect(kvwap.calculate(bars, { vwapMode: 'Rolling' }).alerts.map((a) => a.times)).toEqual(exp);
  });
  it('session VWAP on daily bars (one bar per session: the VWAP is hlc3)', () => {
    const exp = recompute(bars.map((b) => (b.high + b.low + b.close) / 3));
    const got = kvwap.calculate(bars).alerts.map((a) => a.times);
    expect(got.slice(0, 4)).toEqual(exp.slice(0, 4));
    expect(got[4].length).toBeGreaterThan(0);
  });
});

describe('kaufman-adaptive-ma: alert', () => {
  it('declaration', () => {
    expect(decls(kama)).toEqual([['alert0', 'Color Change', 'KAMA has changed its color!']]);
  });
  const recompute = (lastConfirmed: boolean) => {
    const fa = 2 / 3;
    const sa = 2 / 31;
    const k: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i < 14) { k.push(close[i]); continue; }
      const mom = Math.abs(close[i] - close[i - 14]);
      let vol = 0;
      for (let j = 0; j < 14; j++) vol += Math.abs(close[i - j] - close[i - j - 1]);
      const er = vol !== 0 ? mom / vol : 0;
      const a = (er * (fa - sa) + sa) ** 2;
      k.push(a * close[i] + (1 - a) * k[i - 1]);
    }
    const col = k.map((v, i) => (i > 0 && v > k[i - 1] && (i < n - 1 || lastConfirmed) ? 'g' : 'r'));
    return timeAt(bars, col.map((c, i) => i > 0 && c !== col[i - 1]));
  };
  it('times equal the recomputation; unconfirmed last bar; no highlight = no change', () => {
    expect(recompute(true).length).toBeGreaterThan(0);
    expect(kama.calculate(bars).alerts[0].times).toEqual(recompute(true));
    expect(kama.calculate(bars, {}, { lastBarConfirmed: false }).alerts[0].times).toEqual(recompute(false));
    expect(kama.calculate(bars, { highlight: false }).alerts[0].times).toEqual([]);
  });
});

describe('kd-newautotrade: alerts', () => {
  it('declarations and times', () => {
    expect(decls(kd)).toEqual([
      ['alert0', 'BUY ALERT', 'BUY: EMA 10 crossed above EMA 20 with RSI & ADX confirmation.'],
      ['alert1', 'SELL ALERT', 'SELL: EMA 10 crossed below EMA 20 with RSI & ADX confirmation.'],
    ]);
    const c = S(bars, close);
    const f = A(ta.ema(c, 10));
    const s = A(ta.ema(c, 20));
    const rsi = A(ta.rsi(c, 14));
    const adx = A(ta.dmi(bars, 14, 14)[2]);
    const lg = over(f, s).map((x, i) => x && gt(rsi[i], 55) && gt(adx[i], 25));
    const sh = under(f, s).map((x, i) => x && lt(rsi[i], 45) && gt(adx[i], 25));
    const r = kd.calculate(bars);
    expect(r.alerts.map((a) => a.times)).toEqual([timeAt(bars, lg), timeAt(bars, sh)]);
    const r2 = kd.calculate(bars, { adxFilter: false });
    const lg2 = over(f, s).map((x, i) => x && gt(rsi[i], 55));
    expect(lg2.some(Boolean)).toBe(true);
    expect(r2.alerts[0].times).toEqual(timeAt(bars, lg2));
  });
});

describe('keltner-aroon-efi-flow: alerts', () => {
  it('declarations and times', () => {
    expect(decls(kae)).toEqual([
      ['alert0', 'KAE Long', 'KAE Flow turned Bullish'],
      ['alert1', 'KAE Short', 'KAE Flow turned Bearish'],
    ]);
    const c = S(bars, close);
    const ma = A(ta.ema(c, 54));
    const atr = A(ta.atr(bars, 10));
    const hb = A(ta.highestbars(S(bars, bars.map((b) => b.high)), 32));
    const lb = A(ta.lowestbars(S(bars, bars.map((b) => b.low)), 32));
    const raw = close.map((x, i) => {
      const k = gt(x, ma[i] + atr[i]) ? 1 : lt(x, ma[i] - atr[i]) ? -1 : 0;
      const up = (100 * (hb[i] + 32)) / 32;
      const lo = (100 * (lb[i] + 32)) / 32;
      let a = 0;
      if (gt(up, lo) && gt(up, 70)) a = 1;
      if (gt(lo, up) && gt(lo, 70)) a = -1;
      return (k + a) / 2;
    });
    const avg = A(ta.alma(S(bars, raw), 50, 0.95, 45));
    const longF = over(avg, avg.map(() => 0.1));
    const shortF = under(avg, avg.map(() => -0.1));
    expect(longF.some(Boolean) && shortF.some(Boolean)).toBe(true);
    expect(kae.calculate(bars).alerts.map((a) => a.times)).toEqual([timeAt(bars, longF), timeAt(bars, shortF)]);
  });
});
