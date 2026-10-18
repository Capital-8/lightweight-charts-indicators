/**
 * Community re-ports, batch 6 (st0p, supertrend-ladder, tdi-rsi, trend-trader): the outputs match the originals'
 * declarations (plot ids / titles, marker ids, fills, hlines, alerts), the main lines recomputed here from the
 * originals' formulas on a seeded random walk, and the alert conditions / alert() calls recomputed.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as st0p from '../../src/community/st0p';
import * as ladder from '../../src/community/supertrend-ladder';
import * as tdi from '../../src/community/tdi-rsi';
import * as trader from '../../src/community/trend-trader';

function walk(n: number, seed: number): Bar[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(1, open + (rnd() - 0.5) * 3);
    const high = Math.max(open, close) + rnd() * 1.5;
    const low = Math.min(open, close) - rnd() * 1.5;
    bars.push({ time: 1600000000 + i * 3600, open, high, low, close, volume: 1000 + Math.floor(rnd() * 1000) });
    price = close;
  }
  return bars;
}

const bars = walk(1500, 7);
const close = bars.map((b) => b.close);
const vals = (pts: { value: number }[]) => pts.map((p) => p.value);
const near = (a: number[], b: number[], from = 0) => {
  expect(a.length).toBe(b.length);
  for (let i = from; i < a.length; i++) {
    if (isNaN(b[i])) expect(a[i]).toBeNaN();
    else expect(a[i]).toBeCloseTo(b[i], 8);
  }
};
const timesOf = (f: boolean[]) => bars.filter((_, i) => f[i]).map((b) => b.time);
const crossOver = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const crossUnder = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);

describe('st0p', () => {
  /** SUB / SLB of the original */
  const stops = (list: Bar[], pct: number, unit: number) => {
    const sub: number[] = [], slb: number[] = [], SH: number[] = [], LG: number[] = [];
    let ps = 0, pl = 0;
    list.forEach((b, i) => {
      const s = b.close, s1 = i > 0 ? list[i - 1].close : NaN;
      const SHORT = s + unit + s * pct / 100, LONG = s - unit - s * pct / 100;
      ps = SHORT < ps || s1 > ps ? SHORT : ps;
      pl = LONG > pl || s1 < pl ? LONG : pl;
      sub.push(ps); slb.push(pl); SH.push(SHORT); LG.push(LONG);
    });
    return { sub, slb, SH, LG };
  };

  it('declares the original outputs', () => {
    expect(st0p.plotConfig.map((p) => [p.id, p.title])).toEqual([['plot0', ''], ['plot1', 'Plot'], ['plot2', ''], ['plot3', 'Plot']]);
    expect(st0p.metadata).toMatchObject({ title: 'ST0P', shortTitle: 'ST0P', overlay: true });
    expect(st0p.alertConditions).toEqual([
      { id: 'alert0', title: 'LONG POSITION ST0P!', message: 'SELL!' },
      { id: 'alert1', title: 'SHORT POSITION ST0P!', message: 'BUY!' },
    ]);
    expect(st0p.ST0P.alertConditions).toBe(st0p.alertConditions);
    const r = st0p.calculate(bars);
    expect(r.fills?.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([
      ['plot0', 'plot1', 'LONG Highligter'], ['plot2', 'plot3', 'SHORT Highligter'],
    ]);
  });

  it('long and short stops follow the original and the labels / alerts are its crosses', () => {
    for (const [mode, unit] of [[1, 0], [2, 0], [1, 0.5], [2, 0.3]]) {
      const r = st0p.calculate(bars, { changeLongShort: mode, unit, percent: 2 });
      const { sub, slb, SH, LG } = stops(bars, 2, unit);
      const exp = mode === 1 ? slb : sub;
      near(vals(r.plots.plot1), exp);
      near(vals(r.plots.plot3), exp);
      near(vals(r.plots.plot0), bars.map((b) => (b.open + b.high + b.low + b.close) / 4));
      const up = crossOver(close, exp), dn = crossUnder(close, exp);
      const a0 = dn.map((c) => mode === 1 && c), a1 = up.map((c) => mode === 2 && c);
      expect(r.alerts[0].times).toEqual(timesOf(a0));
      expect(r.alerts[1].times).toEqual(timesOf(a1));
      expect(a0.some(Boolean) || a1.some(Boolean)).toBe(true);
      const buy = r.markers.filter((m) => m.id === 'shape0'), sell = r.markers.filter((m) => m.id === 'shape1');
      expect(buy.map((m) => m.time)).toEqual(timesOf(a1));
      expect(sell.map((m) => m.time)).toEqual(timesOf(a0));
      buy.forEach((m) => expect(m.price).toBeCloseTo(SH[bars.findIndex((b) => b.time === m.time)], 8));
      sell.forEach((m) => expect(m.price).toBeCloseTo(LG[bars.findIndex((b) => b.time === m.time)], 8));
      expect(r.markers.every((m) => m.text === 'ST0P')).toBe(true);
    }
    expect(st0p.calculate(bars, { showSignals: false }).markers).toHaveLength(0);
  });
});

describe('trend-trader', () => {
  it('declares the original outputs', () => {
    expect(trader.plotConfig.map((p) => [p.id, p.title])).toEqual([['plot0', 'Trend Trader Strategy']]);
    expect(trader.hasAlertFunction).toBe(true);
    expect(trader.TrendTrader.hasAlertFunction).toBe(true);
    const r = trader.calculate(bars);
    expect(r.barColors.every((c) => c.id === 'barcolor0')).toBe(true);
    expect(r.barColors).toHaveLength(bars.length);
  });

  it('line, bar colours and alert() calls follow the original', () => {
    const L = 21, M = 3;
    const tr = bars.map((b, i) => (i === 0 ? b.high - b.low
      : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
    const wma = tr.map((_, i) => {
      if (i < L - 1) return NaN;
      let s = 0;
      for (let k = 0; k < L; k++) s += tr[i - k] * (L - k);
      return s / (L * (L + 1) / 2);
    });
    const hh = bars.map((_, i) => (i < L - 1 ? NaN : Math.max(...bars.slice(i - L + 1, i + 1).map((b) => b.high))));
    const ll = bars.map((_, i) => (i < L - 1 ? NaN : Math.min(...bars.slice(i - L + 1, i + 1).map((b) => b.low))));
    const ret: number[] = [];
    const pos: number[] = [];
    const calls: { time: number; message: string }[] = [];
    bars.forEach((b, i) => {
      const hi = i > 0 ? hh[i - 1] - wma[i - 1] * M : NaN, lo = i > 0 ? ll[i - 1] + wma[i - 1] * M : NaN;
      const c = b.close;
      const prev = i > 0 ? ret[i - 1] : NaN;
      ret.push(c > hi && c > lo ? hi : c < lo && c < hi ? lo : isNaN(prev) ? c : prev);
      const pp = i > 0 ? pos[i - 1] : NaN;
      const p = c > ret[i] ? 1 : c < ret[i] ? -1 : isNaN(pp) ? 0 : pp;
      pos.push(p);
      if (i > 0 && p !== pp && p === 1) calls.push({ time: b.time, message: 'Color changed - Buy' });
      if (i > 0 && p !== pp && p === -1) calls.push({ time: b.time, message: 'Color changed - Sell' });
    });
    const r = trader.calculate(bars);
    near(vals(r.plots.plot0), ret);
    expect(r.barColors.map((c) => c.color)).toEqual(pos.map((p) => (p === -1 ? '#F23645' : p === 1 ? '#4CAF50' : '#2962FF')));
    expect(r.alertCalls.map((c) => ({ time: c.time, message: c.message }))).toEqual(calls);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    expect(calls.length).toBeGreaterThan(4);
  });
});

describe('supertrend-ladder', () => {
  it('declares the original outputs', () => {
    expect(ladder.plotConfig.map((p) => [p.id, p.title, p.display])).toEqual([
      ['plot0', 'Supertrend Stop', undefined], ['plot1', 'Direction', 'data_window'],
    ]);
    expect(ladder.metadata).toMatchObject({ title: 'Supertrend - Ladder ATR - 1909Capital [Trendoscope®]', shortTitle: 'SLA [Trendoscope®]', overlay: true });
    expect(ladder.alertConditions.map((a) => [a.id, a.title])).toEqual([
      ['alert0', 'Supertrend Bullish Alert'], ['alert1', 'Supertrend Bearish Alert'],
    ]);
    expect(ladder.SupertrendLadder.hasAlertFunction).toBe(true);
  });

  /** The original with matype = 'sma' (array.avg of the last `len` true ranges of each side) */
  const reference = (list: Bar[], len: number, mult: number, waitForClose: boolean, delayed: boolean) => {
    const pos: number[] = [], neg: number[] = [];
    let pma = NaN, nma = NaN, dir = 1, bs = NaN, ss = NaN, bdp = NaN, sdp = NaN;
    const dirs: number[] = [], st: number[] = [];
    const avg = (a: number[]) => { const v = a.filter((x) => !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; };
    list.forEach((b, i) => {
      const tr = i === 0 ? NaN : Math.max(b.high - b.low, Math.abs(b.high - list[i - 1].close), Math.abs(b.low - list[i - 1].close));
      const arr = b.open < b.close ? pos : neg;
      arr.push(tr);
      if (arr.length > len) arr.shift();
      if (pos.length === len) pma = avg(pos);
      if (neg.length === len) nma = avg(neg);
      let bd = nma * mult, sd = pma * mult;
      const mn = (a: number, c: number) => (isNaN(a) || isNaN(c) ? NaN : Math.min(a, c));
      const mx = (a: number, c: number) => (isNaN(a) || isNaN(c) ? NaN : Math.max(a, c));
      if (dir === 1) bd = mn(bd, isNaN(bdp) ? bd : bdp);
      if (dir === -1) sd = mn(sd, isNaN(sdp) ? sd : sdp);
      if (i === 0) { bs = b.low - bd; ss = b.high + sd; }
      const p = i > 0 ? list[i - 1] : undefined;
      const hc1 = p ? (waitForClose ? p.close : p.high) : NaN, lc1 = p ? (waitForClose ? p.close : p.low) : NaN;
      const bs1 = i > 0 ? bs : NaN, ss1 = i > 0 ? ss : NaN;
      dir = dir === 1 && lc1 < bs1 ? -1 : dir === -1 && hc1 > ss1 ? 1 : dir;
      const z = (v: number) => (isNaN(v) ? 0 : v);
      const tgt = (dir === 1 && z(hc1) >= z(ss1)) || (dir === -1 && z(lc1) <= z(bs1)) || !delayed;
      const bc = b.low - bd, sc = b.high + sd, bi = b.low - bd / 2, si = b.high + sd / 2;
      bs = dir === 1 ? (tgt ? mx(isNaN(bs) ? bc : bs, bc) : bs) : (tgt ? bc : mx(isNaN(bs) ? bi : bs, bi));
      ss = dir === -1 ? (tgt ? mn(isNaN(ss) ? sc : ss, sc) : ss) : (tgt ? sc : mn(isNaN(ss) ? si : ss, si));
      bdp = bd; sdp = sd;
      dirs.push(dir);
      st.push(dir > 0 ? bs : ss);
    });
    return { dirs, st };
  };

  it('stop and direction follow the original (sma lists), alerts on the direction changes', () => {
    for (const [wfc, del] of [[false, false], [true, false], [false, true], [true, true]]) {
      const r = ladder.calculate(bars, { matype: 'sma', waitForClose: wfc, delayed: del });
      const { dirs, st } = reference(bars, 7, 4, wfc, del);
      near(vals(r.plots.plot0), st);
      expect(vals(r.plots.plot1)).toEqual(dirs);
      const up = dirs.map((d, i) => i > 0 && d > dirs[i - 1]);
      const dn = dirs.map((d, i) => i > 0 && d < dirs[i - 1]);
      expect(r.alerts[0].times).toEqual(timesOf(up));
      expect(r.alerts[1].times).toEqual(timesOf(dn));
      expect(up.some(Boolean) && dn.some(Boolean)).toBe(true);
      const calls = bars.flatMap((b, i) => (up[i] ? [{ time: b.time, message: 'Supertrend Bullish' }] : dn[i] ? [{ time: b.time, message: 'Supertrend Bearish' }] : []));
      expect(r.alertCalls.map((c) => ({ time: c.time, message: c.message }))).toEqual(calls);
    }
  });

  it('every moving average type gives a stop once the lists are full', () => {
    for (const matype of ['sma', 'ema', 'rma', 'wma', 'hma'] as const) {
      const r = ladder.calculate(bars, { matype });
      const st = vals(r.plots.plot0);
      expect(st.slice(100).every((v) => Number.isFinite(v))).toBe(true);
      expect(vals(r.plots.plot1).every((d) => d === 1 || d === -1)).toBe(true);
      r.plots.plot0.forEach((p, i) => expect((p as { color?: string }).color).toBe(r.plots.plot1[i].value > 0 ? 'rgb(83, 195, 189)' : '#E040FB'));
    }
  });
});

describe('tdi-rsi', () => {
  it('declares the original outputs', () => {
    expect(tdi.plotConfig.map((p) => p.title)).toEqual([
      'Upper Band', 'Lower Band', 'Middle of Bands', 'Slow MA', 'Fast MA',
      'Regular Bullish', 'Hidden Bullish', 'Regular Bearish', 'Hidden Bearish',
    ]);
    expect(tdi.hlineConfig.map((h) => [h.price, h.title])).toEqual([[20, 'Level'], [80, 'Level'], [50, 'Middle Line'], [70, 'Overbought'], [30, 'Oversold']]);
    expect(tdi.fillConfig.map((f) => [f.plot1, f.plot2, f.title])).toEqual([['hline_ob', 'hline_os', 'Background']]);
    expect(tdi.metadata).toMatchObject({ title: 'TDI - Traders Dynamic Index [Goldminds]', shortTitle: 'TDIGM DIV Alerts', overlay: false });
    expect(tdi.alertConditions.map((a) => [a.id, a.title, a.message])).toEqual([
      ['alert0', 'Regular Bullish', 'Long  @ {{close}}'], ['alert1', 'Hidden Bullish', 'Long  @ {{close}}'],
      ['alert2', 'Regular Bearish', 'Short  @ {{close}}'], ['alert3', 'Hidden Bearish', 'Short  @ {{close}}'],
    ]);
    expect(tdi.TdiRsi.hasAlertFunction).toBe(true);
  });

  it('bands and RSI lines follow the original', () => {
    const P = 21, B = 34;
    // rsi: rma of gains / losses
    const rsi: number[] = new Array(bars.length).fill(NaN);
    let ag = NaN, al = NaN;
    for (let i = 1; i < bars.length; i++) {
      const d = close[i] - close[i - 1], g = Math.max(d, 0), l = Math.max(-d, 0);
      if (i < P) continue;
      if (i === P) {
        let sg = 0, sl = 0;
        for (let k = 1; k <= P; k++) { const dd = close[k] - close[k - 1]; sg += Math.max(dd, 0); sl += Math.max(-dd, 0); }
        ag = sg / P; al = sl / P;
      } else { ag = (ag * (P - 1) + g) / P; al = (al * (P - 1) + l) / P; }
      rsi[i] = al === 0 ? 100 : ag === 0 ? 0 : 100 - 100 / (1 + ag / al);
    }
    const sma = (a: number[], L: number) => a.map((_, i) => (i < L - 1 ? NaN : a.slice(i - L + 1, i + 1).reduce((s, x) => s + x, 0) / L));
    const sd = (a: number[], L: number) => a.map((_, i) => {
      if (i < L - 1) return NaN;
      const w = a.slice(i - L + 1, i + 1), m = w.reduce((s, x) => s + x, 0) / L;
      return Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / L);
    });
    const ma = sma(rsi, B), dev = sd(rsi, B);
    const up = ma.map((m, i) => m + 1.6185 * dev[i]), dn = ma.map((m, i) => m - 1.6185 * dev[i]);
    const r = tdi.calculate(bars);
    near(vals(r.plots.plot0), up, 100);
    near(vals(r.plots.plot1), dn, 100);
    near(vals(r.plots.plot2), up.map((u, i) => (u + dn[i]) / 2), 100);
    near(vals(r.plots.plot3), sma(rsi, 2), 30);
    near(vals(r.plots.plot4), sma(rsi, 7), 30);
  });

  it('divergences: labels at the pivot, alerts and alert() calls on the confirmation bar', () => {
    const lbR = 5;
    const all = { plotHiddenBull: true, plotHiddenBear: true };
    let fired = [0, 0, 0, 0];
    for (const list of [bars, walk(2000, 99)]) {
      const r = tdi.calculate(list, all);
      const osc = vals(r.plots.plot3);
      const ids = ['shape0', 'shape1', 'shape2', 'shape3'];
      const names = ['Regular Bullish', 'Hidden Bullish', 'Regular Bearish', 'Hidden Bearish'];
      ids.forEach((id, k) => {
        const ms = r.markers.filter((m) => m.id === id);
        const confirm = r.alerts[k].times.map((t) => list.findIndex((b) => b.time === t));
        expect(ms.map((m) => m.time)).toEqual(confirm.map((i) => list[i - lbR].time));
        ms.forEach((m, j) => expect(m.price).toBeCloseTo(osc[confirm[j] - lbR], 10));
        expect(r.alertCalls.filter((c) => c.message.startsWith(names[k] + '. Price ')).map((c) => c.time)).toEqual(r.alerts[k].times);
        fired[k] += ms.length;
      });
      // a regular bullish divergence: lower low of the price, higher low of the slow line at two pivot lows
      const pl = r.plots.plot5.map((p, i) => [i, p.value] as const).filter(([, v]) => !isNaN(v));
      for (let j = 1; j < pl.length; j++) {
        const [i, v] = pl[j], [pi, pv] = pl[j - 1];
        const isBull = r.markers.some((m) => m.id === 'shape0' && m.time === list[i].time);
        if (isBull) {
          expect(v).toBeGreaterThan(pv);
          expect(list[i].low).toBeLessThan(list[pi].low);
        }
      }
    }
    fired.forEach((f) => expect(f).toBeGreaterThan(0));
    // hidden divergences off by default
    const r = tdi.calculate(bars);
    expect(r.markers.filter((m) => m.id === 'shape1' || m.id === 'shape3')).toHaveLength(0);
  });
});
