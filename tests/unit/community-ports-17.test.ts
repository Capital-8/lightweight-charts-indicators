/**
 * Alerts and Style ids of community ports (batch 17): the alertcondition() declarations (ids, titles and messages of
 * the originals), the bars on which each condition is true (re-computed here from the original's expression, or
 * checked against the outputs that the same condition draws), the alert() calls (bars, messages, frequency), and the
 * Style-settings ids of the emitted items.
 */
import { describe, expect, it } from 'vitest';
import { str, type Bar } from 'oakscriptjs';
import * as hull from '../../src/community/hull-suite';
import * as hunters from '../../src/community/hunters-reversal-v2-3';
import * as ichiOsc from '../../src/community/ichimoku-oscillator';
import * as smc from '../../src/community/ict-auto-validated-smc';
import * as fvgSig from '../../src/community/ict-fvg-buy-sell-signals';
import * as ifvg from '../../src/community/ict-implied-fair-value-gap';
import * as htfRev from '../../src/community/htf-reversal-divergences';
import * as htfCandles from '../../src/community/htf-candles-mini-charts-by-dgt';
import * as tfo from '../../src/community/ict-killzones-pivots-tfo';
import * as everything from '../../src/community/ict-everything';
import * as concepts from '../../src/community/ict-concepts';
import * as killzones from '../../src/community/ict-killzones';
import * as rebalance from '../../src/community/ict-immediate-rebalance-toolkit';
import * as iof from '../../src/community/ict-institutional-order-flow';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk (bar length `step` seconds, from 01/01/2024 00:00 UTC) with a random volume */
function walk(count: number, seed0: number, step = 86400): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: 1704067200 + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const daily = walk(1200, 11);
const m15 = walk(1500, 23, 900);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const timesOf = (r: { alerts: { id: string; times: number[] }[] }, id: string) => r.alerts.find((a) => a.id === id)!.times;
const idsOf = (items: Array<{ id?: string }>) => [...new Set(items.map((m) => m.id).filter((x) => x !== undefined))].sort();

/** Independent WMA (na until the window is full of values) */
function wma(src: number[], len: number): number[] {
  const den = (len * (len + 1)) / 2;
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = 0; k < len; k++) s += src[i - k] * (len - k);
    return s / den;
  });
}
/** Independent RMA-based ATR (SMA seed of the true range) */
function atr(bars: Bar[], len: number): number[] {
  const tr = bars.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < tr.length; i++) {
    if (i < len - 1) out.push(NaN);
    else if (i === len - 1) { prev = tr.slice(0, len).reduce((a, b) => a + b, 0) / len; out.push(prev); }
    else { prev = (prev * (len - 1) + tr[i]) / len; out.push(prev); }
  }
  return out;
}
/** Independent pivot high / low (left = right = len; ties on the right side reject the pivot as Pine does) */
function pivots(values: number[], left: number, right: number, high: boolean): number[] {
  return values.map((_, i) => {
    const c = i - right;
    if (c - left < 0) return NaN;
    const v = values[c];
    for (let k = c - left; k <= c + right; k++) {
      if (k === c) continue;
      if (high ? (k < c ? values[k] > v : values[k] >= v) : (k < c ? values[k] < v : values[k] <= v)) return NaN;
    }
    return v;
  });
}

describe('hull-suite alerts', () => {
  it('declares the original conditions', () => {
    expect(decls(hull)).toEqual([
      ['alert0', 'Hull trending up.', 'Hull trending up.'],
      ['alert1', 'Hull trending down.', 'Hull trending down.'],
    ]);
  });
  it('fires on crossover(MHULL, SHULL) / crossover(SHULL, MHULL) of the HMA', () => {
    const r = hull.calculate(daily);
    const close = daily.map((b) => b.close);
    const len = 55;
    const full = wma(close, len);
    const diff = wma(close, Math.floor(len / 2)).map((v, i) => 2 * v - full[i]);
    // HULL = wma(diff, round(sqrt(len))) on the defined part of diff
    const first = diff.findIndex((v) => !isNaN(v));
    const hh = new Array(first).fill(NaN).concat(wma(diff.slice(first), Math.round(Math.sqrt(len))));
    const up: boolean[] = [], dn: boolean[] = [];
    for (let i = 0; i < daily.length; i++) {
      const m = hh[i], s = i >= 2 ? hh[i - 2] : NaN, pm = i >= 1 ? hh[i - 1] : NaN, ps = i >= 3 ? hh[i - 3] : NaN;
      up.push(m > s && pm <= ps);
      dn.push(s > m && ps <= pm);
    }
    expect(timesOf(r, 'alert0')).toEqual(timeAt(daily, up));
    expect(timesOf(r, 'alert1')).toEqual(timeAt(daily, dn));
    expect(timesOf(r, 'alert0').length).toBeGreaterThan(5);
    expect(timesOf(r, 'alert1').length).toBeGreaterThan(5);
  });
});

describe('hunters-reversal-v2-3 alerts and shape ids', () => {
  const r = hunters.calculate(daily);
  const idx = new Map(daily.map((b, i) => [b.time as number, i]));
  const markerTimes = (id: string) => r.markers.filter((m) => m.id === id).map((m) => m.time).sort((a, b) => a - b);
  it('declares the original conditions', () => {
    expect(decls(hunters)).toEqual([
      ['alert0', 'Bear Liquidity Sweep', 'HuntersRev v2.3: Bear Sweep on {{ticker}}'],
      ['alert1', 'Bull Liquidity Sweep', 'HuntersRev v2.3: Bull Sweep on {{ticker}}'],
      ['alert2', 'Bear Divergence', 'HuntersRev v2.3: Bear Divergence on {{ticker}}'],
      ['alert3', 'Bull Divergence', 'HuntersRev v2.3: Bull Divergence on {{ticker}}'],
      ['alert4', 'Bear Extension', 'HuntersRev v2.3: Bear Extension on {{ticker}}'],
      ['alert5', 'Bull Extension', 'HuntersRev v2.3: Bull Extension on {{ticker}}'],
      ['alert6', 'Bear BIG (cluster)', 'HuntersRev v2.3: BEAR CLUSTER on {{ticker}}'],
      ['alert7', 'Bull BIG (cluster)', 'HuntersRev v2.3: BULL CLUSTER on {{ticker}}'],
    ]);
  });
  it('gives each plotshape its id, with its look', () => {
    expect(idsOf(r.markers).every((id) => /^shape[0-9]$/.test(id!))).toBe(true);
    expect(r.markers.every((m) => m.id !== undefined)).toBe(true);
    const look: Record<string, [string, string]> = {
      shape0: ['triangleDown', 'aboveBar'], shape1: ['triangleUp', 'belowBar'], shape2: ['triangleDown', 'aboveBar'],
      shape3: ['triangleUp', 'belowBar'], shape4: ['triangleDown', 'aboveBar'], shape5: ['triangleUp', 'belowBar'],
      shape6: ['triangleDown', 'aboveBar'], shape7: ['triangleUp', 'belowBar'], shape8: ['xcross', 'aboveBar'],
      shape9: ['xcross', 'belowBar'],
    };
    for (const m of r.markers) expect([m.shape, m.position]).toEqual(look[m.id!]);
    for (const m of r.markers.filter((x) => x.id === 'shape6' || x.id === 'shape7')) expect(m.size).toBe('large');
  });
  it('fires on the bars whose shapes the original draws (before the plot offsets)', () => {
    // sweeps are drawn sweepConfirmBars (3) bars back, divergences and extensions pivotRight (5) bars back
    const shifted = (id: string, back: number) => timesOf(r, id).map((t) => daily[idx.get(t)! - back].time as number);
    expect(shifted('alert0', 3)).toEqual(markerTimes('shape0'));
    expect(shifted('alert1', 3)).toEqual(markerTimes('shape1'));
    expect(shifted('alert2', 5)).toEqual(markerTimes('shape2'));
    expect(shifted('alert3', 5)).toEqual(markerTimes('shape3'));
    expect(shifted('alert4', 5)).toEqual(markerTimes('shape4'));
    expect(shifted('alert5', 5)).toEqual(markerTimes('shape5'));
    expect(timesOf(r, 'alert6')).toEqual(markerTimes('shape6'));
    expect(timesOf(r, 'alert7')).toEqual(markerTimes('shape7'));
    const total = r.alerts.reduce((s, a) => s + a.times.length, 0);
    expect(total).toBeGreaterThan(5);
    // a BIG signal is a bar with a signal of the same side
    const bear = new Set([...timesOf(r, 'alert0'), ...timesOf(r, 'alert2'), ...timesOf(r, 'alert4')]);
    const bull = new Set([...timesOf(r, 'alert1'), ...timesOf(r, 'alert3'), ...timesOf(r, 'alert5')]);
    expect(timesOf(r, 'alert6').every((t) => bear.has(t))).toBe(true);
    expect(timesOf(r, 'alert7').every((t) => bull.has(t))).toBe(true);
  });
  it('keeps the alerts when the shapes are hidden', () => {
    const off = hunters.calculate(daily, { showSweep: false, showDiv: false, showExt: false, showBig: false });
    expect(off.alerts.map((a) => a.times)).toEqual(r.alerts.map((a) => a.times));
    expect(off.markers.filter((m) => m.id !== 'shape8' && m.id !== 'shape9')).toEqual([]);
  });
});

describe('ichimoku-oscillator alert() calls and shape ids', () => {
  const r = ichiOsc.calculate(daily);
  const byTime = new Map(daily.map((b) => [b.time as number, b]));
  it('declares alert() calls', () => {
    expect(ichiOsc.hasAlertFunction).toBe(true);
  });
  it('makes the original calls with the close in the message', () => {
    expect(r.alertCalls.length).toBeGreaterThan(5);
    for (const c of r.alertCalls) {
      const m = /^(Close Position|Buy \/ Main|Sell \/ Main|Take Partial Profit), Close = (.+)$/.exec(c.message);
      expect(m).not.toBeNull();
      expect(m![2]).toBe(str.tostring(byTime.get(c.time)!.close));
      expect(c.freq).toBe(m![1].includes('Main') ? 'once_per_bar_close' : 'once_per_bar');
    }
  });
  it('calls on the bars of the shapes (close position, new trend, partial profit)', () => {
    const calls = (prefix: string) => r.alertCalls.filter((c) => c.message.startsWith(prefix)).map((c) => c.time);
    const shapes = (id: string) => r.markers.filter((m) => m.id === id).map((m) => m.time);
    expect(calls('Close Position')).toEqual(shapes('shape0'));
    expect(calls('Buy / Main')).toEqual(shapes('shape1'));
    expect(calls('Sell / Main')).toEqual(shapes('shape3'));
    // the partial profit X is drawn only while the trade is profitable; the alert is made on every signal
    const part = new Set(calls('Take Partial Profit'));
    expect(shapes('shape5').every((t) => part.has(t))).toBe(true);
    expect(shapes('shape0').length).toBeGreaterThan(0);
    expect(shapes('shape1').length + shapes('shape3').length).toBeGreaterThan(0);
  });
  it('gives the shapes the ids of the original, at 0 / on the cloud layer', () => {
    expect(idsOf(r.markers).every((id) => ['shape0', 'shape1', 'shape3', 'shape5'].includes(id!))).toBe(true);
    expect(r.markers.every((m) => m.id !== undefined)).toBe(true);
    const cloud = new Map((r.plots.plot0 as Array<{ time: number; value: number }>).map((p) => [p.time, p.value]));
    for (const m of r.markers) {
      expect(m.position).toBe('atPriceMiddle');
      expect(m.price).toBe(m.id === 'shape1' || m.id === 'shape3' ? 0 : cloud.get(m.time));
    }
  });
  it('follows the alert switches and messages', () => {
    const off = ichiOsc.calculate(daily, { closeAlert: false, mainAlert: false, closePartAlert: false });
    expect(off.alertCalls).toEqual([]);
    const own = ichiOsc.calculate(daily, { alertLongMsg: 'long close at close', mainFrequency: 'once_per_bar' });
    const longs = own.alertCalls.filter((c) => c.message.startsWith('long'));
    expect(longs.length).toBe(r.alertCalls.filter((c) => c.message.startsWith('Buy')).length);
    for (const c of longs) {
      expect(c.message).toBe('long ' + str.tostring(byTime.get(c.time)!.close) + ' at close');
      expect(c.freq).toBe('once_per_bar');
    }
  });
});

describe('ict-auto-validated-smc alerts and shape ids', () => {
  const bars = walk(1200, 5, 900);
  const r = smc.calculate(bars, { useHTF: false });
  it('declares the original conditions', () => {
    expect(decls(smc)).toEqual([
      ['alert0', 'Bullish CHoCH', 'ICT-V: Bullish Change of Character detected'],
      ['alert1', 'Bearish CHoCH', 'ICT-V: Bearish Change of Character detected'],
      ['alert2', 'Bullish BOS', 'ICT-V: Bullish Break of Structure'],
      ['alert3', 'Bearish BOS', 'ICT-V: Bearish Break of Structure'],
      ['alert4', 'Bullish OB Formed', 'ICT-V: Validated Bullish Order Block detected — check confluence score'],
      ['alert5', 'Bearish OB Formed', 'ICT-V: Validated Bearish Order Block detected — check confluence score'],
      ['alert6', 'High-Score Bullish OB', 'ICT-V: High-confluence Bullish OB (5+ score) — strong setup'],
      ['alert7', 'High-Score Bearish OB', 'ICT-V: High-confluence Bearish OB (5+ score) — strong setup'],
      ['alert8', 'Bullish Breaker', 'ICT-V: Bullish Breaker Block formed — failed bearish OB flipped to support'],
      ['alert9', 'Bearish Breaker', 'ICT-V: Bearish Breaker Block formed — failed bullish OB flipped to resistance'],
      ['alert10', 'Inducement Swept', 'ICT-V: Inducement level swept — internal swing taken out while higher structure holds'],
      ['alert11', 'Bullish IFVG Formed', 'ICT-V: Bullish Inversion FVG formed — old bearish FVG flipped to support'],
      ['alert12', 'Bearish IFVG Formed', 'ICT-V: Bearish Inversion FVG formed — old bullish FVG flipped to resistance'],
      ['alert13', 'Validated Long Signal', 'ICT-V: Validated LONG signal — check panel for confluence score'],
      ['alert14', 'Validated Short Signal', 'ICT-V: Validated SHORT signal — check panel for confluence score'],
      ['alert15', 'Price Entered Bullish OTE', 'ICT-V: Price entered bullish OTE zone — watch for entry confirmation'],
      ['alert16', 'Price Entered Bearish OTE', 'ICT-V: Price entered bearish OTE zone — watch for entry confirmation'],
      ['alert17', 'Bullish OTE + FVG Entry', 'ICT-V: Price entered bullish OTE with FVG confluence — high-quality zone'],
      ['alert18', 'Bearish OTE + FVG Entry', 'ICT-V: Price entered bearish OTE with FVG confluence — high-quality zone'],
      ['alert19', 'Bullish IFVG Retest', 'ICT-V: Price retesting bullish IFVG — flipped FVG acting as support'],
      ['alert20', 'Bearish IFVG Retest', 'ICT-V: Price retesting bearish IFVG — flipped FVG acting as resistance'],
    ]);
  });
  it('fires the signal conditions on the bars of the signal triangles', () => {
    const shapes = (id: string) => r.markers.filter((m) => m.id === id).map((m) => m.time);
    expect(timesOf(r, 'alert13')).toEqual(shapes('shape0'));
    expect(timesOf(r, 'alert14')).toEqual(shapes('shape1'));
    expect(shapes('shape0').length + shapes('shape1').length).toBeGreaterThan(0);
    const longs = new Set(shapes('shape0'));
    const shorts = new Set(shapes('shape1'));
    expect(shapes('shape2').every((t) => longs.has(t))).toBe(true);
    expect(shapes('shape3').every((t) => shorts.has(t))).toBe(true);
    expect(r.markers.every((m) => ['shape0', 'shape1', 'shape2', 'shape3'].includes(m.id!))).toBe(true);
  });
  it('fires the structure conditions on the bars where a break is drawn', () => {
    // each swing break draws its line from the broken pivot to the break bar: dashed for a CHoCH, solid for a BOS,
    // in the bullish / bearish colour; the oldest lines are deleted, so the drawn ones are a subset
    const bull = smc.defaultInputs.bullColor, bear = smc.defaultInputs.bearColor;
    const structure = r.lines.filter((l) => l.width === 1 && (l.color === bull || l.color === bear)
      && (l.style === 'dashed' || l.style === 'solid') && l.price1 === l.price2);
    expect(structure.length).toBeGreaterThan(5);
    for (const l of structure) {
      const id = (l.style === 'dashed' ? (l.color === bull ? 'alert0' : 'alert1') : (l.color === bull ? 'alert2' : 'alert3'));
      expect(timesOf(r, id)).toContain(l.time2);
    }
    const all = ['alert0', 'alert1', 'alert2', 'alert3'].map((id) => timesOf(r, id));
    expect(all.every((t) => t.length > 0)).toBe(true);
  });
  it('fires the other conditions, each high-score / FVG one inside its plain one', () => {
    const sub = (a: string, b: string) => {
      const set = new Set(timesOf(r, b));
      expect(timesOf(r, a).every((t) => set.has(t))).toBe(true);
    };
    sub('alert6', 'alert4');
    sub('alert7', 'alert5');
    sub('alert17', 'alert15');
    sub('alert18', 'alert16');
    for (const id of ['alert4', 'alert5', 'alert8', 'alert9', 'alert10', 'alert15', 'alert16']) {
      expect(timesOf(r, id).length).toBeGreaterThan(0);
    }
  });
});

describe('ict-fvg-buy-sell-signals alerts', () => {
  it('declares the original conditions', () => {
    expect(decls(fvgSig)).toEqual([['alert0', 'ICT Buy', 'ICT Buy Signal'], ['alert1', 'ICT Sell', 'ICT Sell Signal']]);
  });
  it('fires on longSignal / shortSignal of the original', () => {
    const bars = daily;
    const r = fvgSig.calculate(bars);
    const a = atr(bars, 14);
    const ph = pivots(bars.map((b) => b.high), 5, 5, true);
    const pl = pivots(bars.map((b) => b.low), 5, 5, false);
    let drHigh = NaN, drLow = NaN;
    let bTop = NaN, bBot = NaN, bCE = NaN, sTop = NaN, sBot = NaN, sCE = NaN;
    const longs: boolean[] = [], shorts: boolean[] = [];
    bars.forEach((b, i) => {
      const ratio = Math.abs(b.close - b.open) / a[i];
      const bullDisp = ge(ratio, 0.6) && gt(b.close, b.open);
      const bearDisp = ge(ratio, 0.6) && lt(b.close, b.open);
      if (!isNaN(ph[i])) drHigh = ph[i];
      if (!isNaN(pl[i])) drLow = pl[i];
      const ready = !isNaN(drHigh) && !isNaN(drLow);
      const eq = (drHigh + drLow) / 2;
      const prem = ready && gt(b.close, eq), disc = ready && lt(b.close, eq);
      if (i >= 2 && gt(b.low, bars[i - 2].high)) { bTop = b.low; bBot = bars[i - 2].high; bCE = (bTop + bBot) / 2; }
      if (i >= 2 && lt(b.high, bars[i - 2].low)) { sTop = bars[i - 2].low; sBot = b.high; sCE = (sTop + sBot) / 2; }
      const inBull = !isNaN(bTop) && le(b.low, bTop) && ge(b.high, bBot);
      const inBear = !isNaN(sTop) && ge(b.high, sBot) && le(b.low, sTop);
      longs.push(inBull && disc && bullDisp && gt(b.close, isNaN(bCE) ? b.close : bCE));
      shorts.push(inBear && prem && bearDisp && lt(b.close, isNaN(sCE) ? b.close : sCE));
    });
    expect(timesOf(r, 'alert0')).toEqual(timeAt(bars, longs));
    expect(timesOf(r, 'alert1')).toEqual(timeAt(bars, shorts));
    expect(timesOf(r, 'alert0').length).toBeGreaterThan(2);
    expect(timesOf(r, 'alert1').length).toBeGreaterThan(2);
    // the BUY / SELL labels are on the same bars
    expect(r.markers.filter((m) => m.text === 'BUY').map((m) => m.time)).toEqual(timesOf(r, 'alert0'));
    expect(r.markers.filter((m) => m.text === 'SELL').map((m) => m.time)).toEqual(timesOf(r, 'alert1'));
  });
});

describe('ict-implied-fair-value-gap alerts', () => {
  it('declares the original conditions', () => {
    expect(decls(ifvg)).toEqual([
      ['alert0', 'Bullish IFVG', 'Bullish IFVG detected'], ['alert1', 'Bearish IFVG', 'Bearish IFVG detected'],
    ]);
  });
  it('fires on bull_ifvg / bear_ifvg of the original, also with the zones hidden', () => {
    const bars = daily;
    const thr = 0.3;
    const body = (i: number) => (i >= 0 ? Math.abs(bars[i].close - bars[i].open) : NaN);
    const at = (i: number, k: keyof Bar) => (i >= 0 ? (bars[i][k] as number) : NaN);
    const bull: boolean[] = [], bear: boolean[] = [];
    bars.forEach((b, i) => {
      const r = b.high - b.low;
      const mid = gt(body(i - 1), Math.max(body(i), body(i - 2)));
      const bullTop = (Math.min(b.close, b.open) + b.low) / 2;
      const bullBtm = (Math.max(at(i - 2, 'close'), at(i - 2, 'open')) + at(i - 2, 'high')) / 2;
      bull.push(mid && lt(b.low, at(i - 2, 'high')) && gt((Math.min(b.close, b.open) - b.low) / r, thr)
        && gt((at(i - 2, 'high') - Math.max(at(i - 2, 'close'), at(i - 2, 'open'))) / r, thr) && gt(bullTop, bullBtm));
      const bearTop = (Math.min(at(i - 2, 'close'), at(i - 2, 'open')) + at(i - 2, 'low')) / 2;
      const bearBtm = (Math.max(b.close, b.open) + b.high) / 2;
      bear.push(mid && gt(b.high, at(i - 2, 'low')) && gt((b.high - Math.max(b.close, b.open)) / r, thr)
        && gt((Math.min(at(i - 2, 'close'), at(i - 2, 'open')) - at(i - 2, 'low')) / r, thr) && gt(bearTop, bearBtm));
    });
    const r = ifvg.calculate(bars);
    expect(timesOf(r, 'alert0')).toEqual(timeAt(bars, bull));
    expect(timesOf(r, 'alert1')).toEqual(timeAt(bars, bear));
    expect(timesOf(r, 'alert0').length).toBeGreaterThan(2);
    expect(timesOf(r, 'alert1').length).toBeGreaterThan(2);
    const hidden = ifvg.calculate(bars, { showBull: false, showBear: false });
    expect(hidden.alerts.map((a) => a.times)).toEqual(r.alerts.map((a) => a.times));
  });
});

describe('htf-reversal-divergences alert() calls', () => {
  const bars = walk(700, 9, 900);
  const chart = { tickerid: 'NASDAQ:AAPL' };
  const r = htfRev.calculate(bars, {}, chart);
  const at = new Map(bars.map((b, i) => [b.time as number, i]));
  it('declares alert() calls with the ticker and once per bar close', () => {
    expect(htfRev.hasAlertFunction).toBe(true);
    expect(r.alertCalls.length).toBeGreaterThan(5);
    for (const c of r.alertCalls) {
      expect(c.message).toMatch(/^(Bullish RSI Divergence|Bearish RSI Divergence|HTF Bullish Engulfing|HTF Bearish Engulfing|HTF Hammer|HTF Shooting Star) on AAPL$/);
      expect(c.freq).toBe('once_per_bar_close');
    }
  });
  it('calls on confirmed divergences: the bar `lbR` bars after the "Bull Div" / "Bear Div" label', () => {
    const lbR = 5;
    const labelTimes = (text: string) => (r.labels ?? []).filter((l) => l.text === text).map((l) => bars[at.get(l.time)! + lbR].time);
    const calls = (msg: string) => r.alertCalls.filter((c) => c.message.startsWith(msg)).map((c) => c.time);
    expect(calls('Bullish RSI Divergence')).toEqual(labelTimes('Bull Div'));
    expect(calls('Bearish RSI Divergence')).toEqual(labelTimes('Bear Div'));
    expect(calls('Bullish RSI Divergence').length + calls('Bearish RSI Divergence').length).toBeGreaterThan(0);
  });
  it('calls on the HTF patterns of the bar before (timeframe 15 on 15-minute bars)', () => {
    const want: string[] = [];
    bars.forEach((b, i) => {
      if (i < 2) return;
      const p = bars[i - 1], q = bars[i - 2];
      const range = p.high - p.low;
      const eng = gt(p.close, p.open) && lt(q.close, q.open) && ge(p.close, q.open) && le(p.open, q.close);
      const bearEng = lt(p.close, p.open) && gt(q.close, q.open) && le(p.close, q.open) && ge(p.open, q.close);
      const hammer = gt(Math.min(p.open, p.close) - p.low, range * 0.6) && lt(Math.abs(p.close - p.open), range * 0.3);
      const star = gt(p.high - Math.max(p.open, p.close), range * 0.6) && lt(Math.abs(p.close - p.open), range * 0.3);
      if (eng) want.push(`${b.time} HTF Bullish Engulfing`);
      if (bearEng) want.push(`${b.time} HTF Bearish Engulfing`);
      if (hammer) want.push(`${b.time} HTF Hammer`);
      if (star) want.push(`${b.time} HTF Shooting Star`);
    });
    const got = r.alertCalls.filter((c) => c.message.startsWith('HTF')).map((c) => `${c.time} ${c.message.replace(' on AAPL', '')}`);
    expect(got).toEqual(want);
    expect(got.length).toBeGreaterThan(3);
  });
  it('follows the alert switches', () => {
    const off = htfRev.calculate(bars, {
      alertBullDivInput: false, alertBearDivInput: false, alertBullEngInput: false, alertBearEngInput: false,
      alertHammerInput: false, alertStarInput: false,
    }, chart);
    expect(off.alertCalls).toEqual([]);
  });
});

describe('htf-candles-mini-charts-by-dgt alert() calls', () => {
  it('declares alert() calls, none of them reached (every alarm() call of the original is commented out)', () => {
    expect(htfCandles.hasAlertFunction).toBe(true);
    expect(htfCandles.calculate(daily).alertCalls).toEqual([]);
  });
});

describe('ict-killzones-pivots-tfo alert() calls and day-of-week ids', () => {
  const bars = walk(1500, 31, 900);
  it('declares alert() calls: broken killzone pivots, once per bar', () => {
    expect(tfo.hasAlertFunction).toBe(true);
    const r = tfo.calculate(bars);
    const broke = r.alertCalls.filter((c) => c.message.startsWith('Broke'));
    expect(broke.length).toBeGreaterThan(5);
    for (const c of r.alertCalls) {
      expect(c.message).toMatch(/^Broke (ASIA|LNDN|NYAM|NYL|NYPM|RTH) (High|Low)$/);
      expect(c.freq).toBe('once_per_bar');
    }
    expect(tfo.calculate(bars, { use_alerts: false }).alertCalls).toEqual([]);
  });
  it('calls "Hit PDH / PDL" on the first bar of the day beyond the previous day high / low', () => {
    const r = tfo.calculate(bars, { use_alerts: false, alert_HL: true });
    expect(r.alertCalls.every((c) => /^Hit P[DWM][HL]$/.test(c.message) && c.freq === 'once_per_bar')).toBe(true);
    const day = (t: number) => Math.floor(t / 86400);
    const want: string[] = [];
    let prevH = NaN, prevL = NaN, curH = NaN, curL = NaN, hitH = false, hitL = false, days = 0;
    bars.forEach((b, i) => {
      if (i === 0 || day(b.time) !== day(bars[i - 1].time)) {
        days++;
        prevH = curH; prevL = curL; curH = b.high; curL = b.low; hitH = false; hitL = false;
      } else {
        curH = Math.max(curH, b.high); curL = Math.min(curL, b.low);
      }
      if (days < 3) return;
      if (!hitH && b.high > prevH) { hitH = true; want.push(`${b.time} Hit PDH`); }
      if (!hitL && b.low < prevL) { hitL = true; want.push(`${b.time} Hit PDL`); }
    });
    const firstCounted = bars.find((b, i) => i > 0 && day(b.time) === day(bars[0].time) + 2)!.time;
    const got = r.alertCalls.filter((c) => c.message.startsWith('Hit PD') && c.time >= firstCounted)
      .map((c) => `${c.time} ${c.message}`);
    expect(got).toEqual(want);
    expect(got.length).toBeGreaterThan(5);
  });
  it('gives each day name the id of its plotchar (char0 = Sunday .. char6 = Saturday)', () => {
    const r = tfo.calculate(bars, { dow_labels: true, dow_hide_wknd: false });
    const names = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const dow = r.markers.filter((m) => names.includes(m.text ?? ''));
    expect(dow.length).toBeGreaterThan(5);
    for (const m of dow) expect(m.id).toBe(`char${names.indexOf(m.text!)}`);
    expect(idsOf(r.markers).length).toBe(7);
  });
});

describe('ict-everything day-of-week ids', () => {
  const bars = walk(1500, 41, 900);
  const texts = ['M O N', 'T U E', 'W E D', 'T H U', 'F R I'];
  it('gives each day label the id of its plotchar (5 per group, char0 .. char14)', () => {
    // group 3 of the original: (not ShowTWO) and (not SL4W)
    const r = everything.calculate(bars, { ShowTWO: false, SL4W: false });
    const dow = r.markers.filter((m) => m.id !== undefined);
    expect(dow.length).toBeGreaterThan(5);
    for (const m of dow) expect(m.id).toBe(`char${10 + texts.indexOf(m.text!)}`);
    expect(idsOf(r.markers).every((id) => /^char1[0-4]$/.test(id!))).toBe(true);
  });
});

describe('bgcolor / barcolor ids', () => {
  const bars = walk(1500, 51, 900);
  const check = (items: Array<{ id?: string; color: string }>, want: Record<string, string>) => {
    expect(items.length).toBeGreaterThan(0);
    for (const x of items) {
      expect(x.id).toBeDefined();
      expect(x.color).toBe(want[x.id!]);
    }
    return idsOf(items);
  };
  it('ict-concepts: one id per killzone bgcolor()', () => {
    const cfg = concepts.defaultInputs;
    const r = concepts.calculate(bars, { showKZ: true });
    const ids = check(r.bgColors, { bgcolor0: cfg.nyCss, bgcolor1: cfg.ldnoCss, bgcolor2: cfg.ldncCss, bgcolor3: cfg.asiaCss });
    expect(ids.length).toBeGreaterThan(1);
  });
  it('ict-killzones: one id per killzone bgcolor()', () => {
    const cfg = killzones.defaultInputs;
    const r = killzones.calculate(bars);
    const ids = check(r.bgColors, { bgcolor0: cfg.nyCss, bgcolor1: cfg.ldnoCss, bgcolor2: cfg.ldncCss, bgcolor3: cfg.asiaCss });
    expect(ids.length).toBeGreaterThan(1);
  });
  it('ict-immediate-rebalance-toolkit: one id per macro bgcolor()', () => {
    const keys = ['m02330300', 'm04030430', 'm08500910', 'm09501010', 'm10501110', 'm11501210', 'm13101340', 'm15151545'];
    const colors = ['mcLDNC2', 'mcLDNC4', 'mcNYAMC8', 'mcNYAMC9', 'mcNYAMC10', 'mcNYLC', 'mcNYPMC13', 'mcNYPMC15'];
    const inputs: Record<string, unknown> = {};
    const want: Record<string, string> = {};
    keys.forEach((k, j) => {
      inputs[k] = true;
      inputs[colors[j]] = `rgba(${10 + j}, 20, 30, 0.5)`;
      want[`bgcolor${j}`] = `rgba(${10 + j}, 20, 30, 0.5)`;
    });
    const r = rebalance.calculate(bars, inputs as never);
    const ids = check(r.bgColors, want);
    expect(ids.length).toBeGreaterThan(4);
  });
  it('ict-institutional-order-flow: barcolor0 with "Require FVG", barcolor1 without', () => {
    const withFvg = iof.calculate(bars, { displacementShow: true, displacementFvg: true });
    for (const x of withFvg.barColors!) expect(x.id).toBe('barcolor0');
    const without = iof.calculate(bars, { displacementShow: true, displacementFvg: false });
    for (const x of without.barColors!) expect(x.id).toBe('barcolor1');
    expect(withFvg.barColors!.length).toBeGreaterThan(0);
    expect(without.barColors!.length).toBeGreaterThan(0);
  });
});
