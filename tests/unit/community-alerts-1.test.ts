/**
 * Alerts of 9 community ports: the alertcondition() declarations (ids, titles and messages of the originals), the
 * bars on which each condition is true (re-computed here from the original's expression, or matched against the
 * port's own outputs of the same expression) and the alert() calls (bars, messages, frequency).
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as engulfing from '../../src/community/actually-engulfing-candlesticks';
import * as fans from '../../src/community/auto-fib-speed-resistance-fans-by-dgt';
import * as chandelier from '../../src/community/buy-sell-accurate-signals';
import * as fibs from '../../src/community/fibonacci-extension-retracement-pivot-points';
import * as johnWick from '../../src/community/john-wick-doji-indicator';
import * as hammer from '../../src/community/perfect-hammer-pattern-indicators-and-alerts';
import * as rsiMa from '../../src/community/rsi-ma-cross-divergence-signal';
import * as sweep from '../../src/community/sweep-engulf-2-candle';
import * as volumeAlert from '../../src/community/volume-alert';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of daily bars with a random volume */
function walk(count: number, seed0: number): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1500, 7);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const callTimes = (calls: { time: number; message: string }[], message: string) => calls.filter((c) => c.message === message).map((c) => c.time);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);

/** Independent SMA / Wilder RMA (na = NaN) */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
function rma(src: number[], len: number): number[] {
  const out: number[] = [];
  let prev = NaN;
  let start = src.findIndex((v) => !isNaN(v));
  for (let i = 0; i < src.length; i++) {
    if (start < 0 || i < start + len - 1) { out.push(NaN); continue; }
    if (i === start + len - 1) {
      let s = 0;
      for (let k = start; k <= i; k++) s += src[k];
      prev = s / len;
    } else prev = (prev * (len - 1) + src[i]) / len;
    out.push(prev);
  }
  return out;
}
function atr(list: Bar[], len: number): number[] {
  const tr = list.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - list[i - 1].close), Math.abs(b.low - list[i - 1].close))));
  return rma(tr, len);
}
const crossover = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);

describe('community alerts (1)', () => {
  it('Actually Engulfing Candlesticks: one alert() call per signal bar, once per bar close', () => {
    expect(engulfing.hasAlertFunction).toBe(true);
    expect(engulfing.ActuallyEngulfingCandlesticks.hasAlertFunction).toBe(true);
    const r = engulfing.calculate(bars);
    const bull = r.markers.filter((m) => m.position === 'belowBar').map((m) => m.time);
    const bear = r.markers.filter((m) => m.position === 'aboveBar').map((m) => m.time);
    expect(callTimes(r.alertCalls, 'Bullish Engulfing')).toEqual(bull);
    expect(callTimes(r.alertCalls, 'Bearish Engulfing')).toEqual(bear);
    expect(bull.length + bear.length).toBeGreaterThan(0);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    // independent parts of the condition on the call bars: volume above its SMA(5), close above / below the
    // highest high / lowest low of the 2 bars before
    const vAvg = sma(bars.map((b) => b.volume!), 5);
    const idx = new Map(bars.map((b, i) => [b.time as number, i]));
    for (const c of r.alertCalls) {
      const i = idx.get(c.time)!;
      expect(bars[i].volume! > vAvg[i]).toBe(true);
      if (c.message === 'Bullish Engulfing') expect(bars[i].close > Math.max(bars[i - 1].high, bars[i - 2].high)).toBe(true);
      else expect(bars[i].close < Math.min(bars[i - 1].low, bars[i - 2].low)).toBe(true);
    }
    // the switches of the original gate the calls
    const off = engulfing.calculate(bars, { useBullishEngulfing: false });
    expect(callTimes(off.alertCalls, 'Bullish Engulfing')).toEqual([]);
    expect(callTimes(off.alertCalls, 'Bearish Engulfing')).toEqual(bear);
  });

  it('Buy & Sell - Accurate Signals: CE Direction Change / Buy / Sell, with the bar confirmation option', () => {
    expect(decls(chandelier)).toEqual([
      ['alert0', 'CE Direction Change', 'Chandelier Exit has changed direction, {{exchange}}:{{ticker}}'],
      ['alert1', 'CE Buy', 'Chandelier Exit Buy, {{exchange}}:{{ticker}}'],
      ['alert2', 'CE Sell', 'Chandelier Exit Sell, {{exchange}}:{{ticker}}'],
    ]);
    expect(chandelier.BuySellAccurateSignals.alertConditions).toBe(chandelier.alertConditions);
    const r = chandelier.calculate(bars);
    // dir from the plots: the short stop is drawn only while dir == -1
    const dir = r.plots.plot1.map((p) => (isNaN(p.value as number) ? 1 : -1));
    const change = dir.map((d, i) => i > 0 && d !== dir[i - 1]);
    const buy = dir.map((d, i) => i > 0 && d === 1 && dir[i - 1] === -1);
    const sell = dir.map((d, i) => i > 0 && d === -1 && dir[i - 1] === 1);
    expect(r.alerts.map((a) => a.title)).toEqual(['CE Direction Change', 'CE Buy', 'CE Sell']);
    expect(r.alerts[0].times).toEqual(timeAt(bars, change));
    expect(r.alerts[1].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[2].times).toEqual(timeAt(bars, sell));
    expect(r.alerts[1].times.length).toBeGreaterThan(3);
    // on an open last bar the conditions wait for its close (Await Bar Confirmation), unless the option is off
    const k = bars.findIndex((b) => b.time === r.alerts[1].times[2]);
    const cut = bars.slice(0, k + 1);
    expect(chandelier.calculate(cut, {}, { lastBarConfirmed: true }).alerts[1].triggered).toBe(true);
    const open = chandelier.calculate(cut, {}, { lastBarConfirmed: false });
    expect(open.alerts[1].triggered).toBe(false);
    expect(open.alerts[0].triggered).toBe(false);
    expect(chandelier.calculate(cut, { awaitBarConfirmation: false }, { lastBarConfirmed: false }).alerts[1].triggered).toBe(true);
  });

  it('John Wick: condition on every John Wick candle, alert() call when they are shown', () => {
    expect(decls(johnWick)).toEqual([['alert0', 'John Wick Candle', '[CurrencyPair] [TimeFrame], John Wick candle']]);
    expect(johnWick.hasAlertFunction).toBe(true);
    const expected = (reverse: boolean) => bars.map((b) => {
      const body = Math.abs(b.close - b.open);
      const up = b.high - Math.max(b.open, b.close);
      const lo = Math.min(b.open, b.close) - b.low;
      const upPct = body !== 0 ? (up / body) * 100 : NaN;
      const loPct = body !== 0 ? (lo / body) * 100 : NaN;
      let bull = false;
      let bear = false;
      if (b.open < b.close && lo > up) bull = loPct > 60;
      if (b.open > b.close && up > lo) bear = upPct > 60;
      if (reverse && b.open > b.close && lo > up) bull = loPct > 60;
      if (reverse && b.open < b.close && up > lo) bear = upPct > 60;
      return bull || bear;
    });
    const r = johnWick.calculate(bars);
    expect(r.alerts[0].times).toEqual(timeAt(bars, expected(false)));
    expect(r.alerts[0].times.length).toBeGreaterThan(10);
    expect(callTimes(r.alertCalls, 'John Wick Candle')).toEqual(r.alerts[0].times);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    const rev = johnWick.calculate(bars, { showReverseJWic: true });
    expect(rev.alerts[0].times).toEqual(timeAt(bars, expected(true)));
    // showJWic off: the condition stays, the alert() call is not made
    const hidden = johnWick.calculate(bars, { showJWic: false });
    expect(hidden.alerts[0].times).toEqual(r.alerts[0].times);
    expect(hidden.alertCalls).toEqual([]);
  });

  it('Perfect Hammer Pattern: bullish / bearish pattern conditions on a crafted sequence', () => {
    expect(decls(hammer)).toEqual([
      ['alert0', 'Bullish Pattern Alert', 'Perfect Bullish Hammers Found!'],
      ['alert1', 'Bearish Pattern Alert', 'Perfect Bearish Hammers Found!'],
    ]);
    const t0 = 1700000000;
    const mk = (i: number, open: number, high: number, low: number, close: number): Bar => ({ time: t0 + i * 60, open, high, low, close, volume: 1 });
    const seq: Bar[] = [
      mk(0, 10, 10.5, 9.5, 10.2),
      mk(1, 10.2, 10.3, 9.6, 9.8), // red
      mk(2, 9.8, 10.4, 9.8, 10.2), // perfect bullish
      mk(3, 10.2, 10.9, 10.2, 10.6), // perfect bullish -> bullish pattern
      mk(4, 10.6, 10.8, 10.4, 10.7), // green
      mk(5, 10.7, 10.7, 10.1, 10.3), // perfect bearish
      mk(6, 10.3, 10.3, 9.7, 9.9), // perfect bearish -> bearish pattern
      mk(7, 9.9, 10.1, 9.9, 10.0), // perfect bullish after a red bar: a pattern of 1 only
      mk(8, 10.0, 10.0, 9.5, 9.6), // perfect bearish after a perfect bullish: no pattern of 2 (a pattern of 1)
    ];
    const r = hammer.calculate(seq);
    expect(r.alerts[0].times).toEqual([t0 + 3 * 60]);
    expect(r.alerts[1].times).toEqual([t0 + 6 * 60]);
    expect(r.alerts[0].times).toEqual(r.markers.filter((m) => m.position === 'belowBar').map((m) => m.time));
    expect(r.alerts[1].times).toEqual(r.markers.filter((m) => m.position === 'aboveBar').map((m) => m.time));
    // one perfect candle is enough with consecutivePatterns = 1: bar 7 follows a red bar, bar 8 a green one
    const one = hammer.calculate(seq, { consecutivePatterns: 1 });
    expect(one.alerts[0].times).toEqual([t0 + 2 * 60, t0 + 7 * 60]);
    expect(one.alerts[1].times).toEqual([t0 + 5 * 60, t0 + 8 * 60]);
  });

  it('RSI MA Cross + Divergence: long / short signal conditions, waiting for the bar close', () => {
    expect(decls(rsiMa)).toEqual([
      ['alert0', 'Bullish RSI Cross + Divergence', 'Bullish divergence + RSI crossed above MA'],
      ['alert1', 'Bearish RSI Cross + Divergence', 'Bearish divergence + RSI crossed below MA'],
    ]);
    const r = rsiMa.calculate(bars, { lookback: 3 });
    const longs = r.markers.filter((m) => m.shape === 'triangleUp').map((m) => m.time);
    const shorts = r.markers.filter((m) => m.shape === 'triangleDown').map((m) => m.time);
    expect(r.alerts[0].times).toEqual(longs);
    expect(r.alerts[1].times).toEqual(shorts);
    expect(longs.length + shorts.length).toBeGreaterThan(0);
    // the first signal, with the bars up to it: on an open last bar it waits for the close (Only signal on bar close)
    const first = longs.length ? longs[0] : shorts[0];
    const k = bars.findIndex((b) => b.time === first);
    const cut = bars.slice(0, k + 1);
    const which = longs.length ? 0 : 1;
    expect(rsiMa.calculate(cut, { lookback: 3 }).alerts[which].triggered).toBe(true);
    expect(rsiMa.calculate(cut, { lookback: 3 }, { lastBarConfirmed: false }).alerts[which].triggered).toBe(false);
    expect(rsiMa.calculate(cut, { lookback: 3, confirmClose: false }, { lastBarConfirmed: false }).alerts[which].triggered).toBe(true);
  });

  it('Sweep Engulf 2 Candle: conditions gated by the show switches, alert() calls by the notification switch', () => {
    expect(decls(sweep)).toEqual([
      ['alert0', 'Bullish Engulfing', 'Bullish Engulfing Terbentuk!'],
      ['alert1', 'Bearish Engulfing', 'Bearish Engulfing Terbentuk!'],
    ]);
    expect(sweep.hasAlertFunction).toBe(true);
    const bull = bars.map((b, i) => i > 0 && b.low < bars[i - 1].low
      && ((b.close > bars[i - 1].open && bars[i - 1].close < bars[i - 1].open) || (b.close > bars[i - 1].close && bars[i - 1].close > bars[i - 1].open)));
    const bear = bars.map((b, i) => i > 0 && b.high > bars[i - 1].high
      && ((b.close < bars[i - 1].close && bars[i - 1].close < bars[i - 1].open) || (b.close < bars[i - 1].open && bars[i - 1].close > bars[i - 1].open)));
    const r = sweep.calculate(bars);
    expect(r.alerts[0].times).toEqual(timeAt(bars, bull));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bear));
    expect(r.alerts[0].times.length).toBeGreaterThan(10);
    expect(callTimes(r.alertCalls, 'Bullish Engulfing Terbentuk!')).toEqual(timeAt(bars, bull));
    expect(callTimes(r.alertCalls, 'Bearish Engulfing Terbentuk!')).toEqual(timeAt(bars, bear));
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    // hidden bullish signals: no condition, the alert() calls stay; notifications off: no call
    const hidden = sweep.calculate(bars, { showBullish: false });
    expect(hidden.alerts[0].times).toEqual([]);
    expect(callTimes(hidden.alertCalls, 'Bullish Engulfing Terbentuk!')).toEqual(timeAt(bars, bull));
    expect(sweep.calculate(bars, { enableAlert: false }).alertCalls).toEqual([]);
  });

  it('Volume Alert: Volume Spike Alert on the signal bars, both volume types and comparison modes', () => {
    expect(decls(volumeAlert)).toEqual([['alert0', 'Volume Spike Alert', 'Volume has exceeded the configured factor!']]);
    for (const volumeType of ['Standard', 'Aggression'] as const) {
      for (const comparisonMode of ['Multiplier', 'Percentage'] as const) {
        const factor = comparisonMode === 'Multiplier' ? 3 : 150;
        const sel = bars.map((b) => {
          if (volumeType === 'Standard') return b.volume!;
          let range = b.high - b.low;
          if (range === 0) range = 0.0001;
          const dir = b.close > b.open ? 1 : b.close < b.open ? -1 : 0;
          return Math.abs(dir * b.volume! * (Math.abs(b.close - b.open) / range));
        });
        const want = sel.map((v, i) => i > 0 && sel[i - 1] > 0
          && (comparisonMode === 'Multiplier' ? v >= sel[i - 1] * factor : (v / sel[i - 1] - 1) * 100 >= factor));
        const r = volumeAlert.calculate(bars, { volumeType, comparisonMode, factor });
        expect(r.alerts[0].times, `${volumeType} ${comparisonMode}`).toEqual(timeAt(bars, want));
        expect(r.alerts[0].times.length).toBeGreaterThan(0);
      }
    }
  });

  it('Auto Fib Speed Resistance Fans: level crossing and new zigzag alert() calls', () => {
    expect(fans.hasAlertFunction).toBe(true);
    expect(fans.AutoFibSpeedResistanceFansByDgt.hasAlertFunction).toBe(true);
    const chart = { tickerid: 'NASDAQ:TEST' };
    const fewer = bars.slice(0, 700);
    const r = fans.calculate(fewer, {}, chart);
    const re = /^AutoFibFan: (new zigzag|TEST crossing (price|time|grid) level -?\d+(\.\d+)?)$/;
    expect(r.alertCalls.length).toBeGreaterThan(20);
    for (const c of r.alertCalls) {
      expect(c.message).toMatch(re);
      expect(c.freq).toBe('once_per_bar');
    }
    expect(r.alertCalls.some((c) => c.message === 'AutoFibFan: new zigzag')).toBe(true);
    expect(r.alertCalls.some((c) => c.message.includes(' crossing grid level '))).toBe(true);
    // on each bar the new zigzag call comes first, then the price levels, then the time levels
    const rank = (m: string) => (m.endsWith('new zigzag') ? 0 : m.includes(' time level ') ? 2 : 1);
    for (let k = 1; k < r.alertCalls.length; k++) {
      if (r.alertCalls[k].time === r.alertCalls[k - 1].time) {
        expect(rank(r.alertCalls[k].message)).toBeGreaterThanOrEqual(rank(r.alertCalls[k - 1].message));
      }
    }
    // the price grid of a level is horizontal at the price of its right label: a grid crossing call on bar k is
    // made exactly when that price is strictly between the close of k and of the bar before (checked on the bars
    // up to k, where the labels are those of bar k)
    const gridTimes = [...new Set(r.alertCalls.filter((c) => c.message.includes(' grid level ')).map((c) => c.time))].slice(0, 5);
    for (const t of gridTimes) {
      const k = fewer.findIndex((b) => b.time === t);
      const cut = fewer.slice(0, k + 1);
      const rk = fans.calculate(cut, {}, chart);
      expect(rk.alertCalls.filter((c) => c.time === t)).toEqual(r.alertCalls.filter((c) => c.time === t));
      const c0 = cut[k].close;
      const c1 = cut[k - 1].close;
      // right labels of the price levels (style label_left, text = the level); the grids of the time levels are
      // vertical (no price at a bar): they never cross
      const want = rk.labels
        .filter((l) => l.style === 'label_left')
        .filter((l) => (gt(l.price, c0) && lt(l.price, c1)) || (lt(l.price, c0) && gt(l.price, c1)))
        .map((l) => `AutoFibFan: TEST crossing grid level ${l.text}`);
      const got = rk.alertCalls.filter((c) => c.time === t && c.message.includes(' grid level ')).map((c) => c.message);
      expect(got).toEqual(want);
    }
  });

  it('Fibonacci Extension / Retracement / Pivot Points: Volume Spikes / High Volatility and the level alert() calls', () => {
    expect(decls(fibs)).toEqual([
      ['alert0', 'Volume Spikes', 'sign of exhaustion, huge volume increase detected\n{{exchange}}:{{ticker}}->\nOpen = {{open}}, Current = {{close}},\nTime = {{time}}'],
      ['alert1', 'High Volatility', 'high volatility detected\n{{exchange}}:{{ticker}}->\nOpen = {{open}}, Current = {{close}},\nTime = {{time}}'],
    ]);
    expect(fibs.FibonacciExtensionRetracementPivotPoints.hasAlertFunction).toBe(true);
    const chart = { tickerid: 'NASDAQ:TEST', timeframe: '1D' };
    // a wide bar every 97 bars for the volatility condition
    const wild = bars.map((b, i) => (i % 97 === 50 ? { ...b, high: b.high + 15, low: b.low - 15 } : b));
    const w = fibs.calculate(wild, {}, chart);
    const vol = wild.map((b) => b.volume!);
    const spike = crossover(vol, sma(vol, 89).map((v) => v * 4.669));
    const range = wild.map((b) => Math.abs(b.high - b.low));
    const volat = crossover(range, atr(wild, 13).map((v) => v * 2.718));
    expect(w.alerts[0].times).toEqual(timeAt(wild, spike));
    expect(w.alerts[1].times).toEqual(timeAt(wild, volat));
    expect(w.alerts[0].times.length).toBeGreaterThan(0);
    expect(w.alerts[1].times.length).toBeGreaterThan(5);

    const r = fibs.calculate(bars, {}, chart);

    // pivot points (default tool): support / resistance level calls
    const re = /^AutoFib PivotPoints : TEST crossing (support|resistance) level -?\d+(\.\d+)?$/;
    expect(r.alertCalls.length).toBeGreaterThan(20);
    for (const c of r.alertCalls) {
      expect(c.message).toMatch(re);
      expect(c.freq).toBe('once_per_bar');
    }
    // on a bar with calls (bars up to it: the pivot labels are those of that bar), the calls are the levels whose
    // label price is strictly between the close and the close before
    const times = [...new Set(r.alertCalls.map((c) => c.time))].slice(-4);
    for (const t of times) {
      const k = bars.findIndex((b) => b.time === t);
      const cut = bars.slice(0, k + 1);
      const rk = fibs.calculate(cut, {}, chart);
      expect(rk.alertCalls.filter((c) => c.time === t)).toEqual(r.alertCalls.filter((c) => c.time === t));
      const c0 = cut[k].close;
      const c1 = cut[k - 1].close;
      const pp = rk.labels.find((l) => l.text === 'PP')!;
      const crossing = (y: number) => (gt(y, c0) && lt(y, c1)) || (lt(y, c0) && gt(y, c1));
      const want = new Set<string>();
      for (const l of rk.labels.filter((x) => x.text.includes('PP') && x.text !== 'PP')) {
        const level = l.text.trim().split(' ').pop()!;
        if (crossing(l.price)) want.add(`AutoFib PivotPoints : TEST crossing ${l.price < pp.price ? 'support' : 'resistance'} level ${level}`);
      }
      if (crossing(pp.price)) {
        want.add('AutoFib PivotPoints : TEST crossing support level 0');
        want.add('AutoFib PivotPoints : TEST crossing resistance level 0');
      }
      expect(new Set(rk.alertCalls.filter((c) => c.time === t).map((c) => c.message))).toEqual(want);
    }

    // the extension / retracement tools have their own messages
    const ret = fibs.calculate(bars, { fibTool: 'Retracements' }, chart);
    expect(ret.alertCalls.length).toBeGreaterThan(0);
    expect(ret.alertCalls.every((c) => /^AutoFib Retracment : TEST crossing level -?\d+(\.\d+)?$/.test(c.message))).toBe(true);
    const ext = fibs.calculate(bars, { fibTool: 'Extensions + Pivot Points' }, chart);
    expect(ext.alertCalls.some((c) => /^AutoFib Extension : TEST crossing level -?\d+(\.\d+)?$/.test(c.message))).toBe(true);
    expect(ext.alertCalls.some((c) => c.message.startsWith('AutoFib PivotPoints : '))).toBe(true);
    // no tool: no level calls
    expect(fibs.calculate(bars, { isFib: false }, chart).alertCalls).toEqual([]);
  });
});
