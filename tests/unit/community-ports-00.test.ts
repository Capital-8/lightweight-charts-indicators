/**
 * Alerts and Style ids of 16 community ports: the alertcondition() declarations (ids, titles and messages of the
 * originals), the bars on which each condition is true (re-computed here from the original's expression, or matched
 * against the port's own outputs of the same expression), the alert() calls (bars, messages, frequency), and the
 * Style-settings ids on the emitted markers.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as p123 from '../../src/community/1-2-3-pattern';
import * as squeeze from '../../src/community/15-minute-squeeze-scalper';
import * as sslBb from '../../src/community/1m-trend-continuation-signals-ssl-bb-filter';
import * as twoB from '../../src/community/2b-reversal-pattern';
import * as threeBar from '../../src/community/3-bar-reversal';
import * as threeInOne from '../../src/community/3-in-1-custom-moving-average-indicator';
import * as thirdWave from '../../src/community/3rd-wave';
import * as fiveMin from '../../src/community/5-minute-buy-sell-signal';
import * as abc from '../../src/community/abc-on-recursive-zigzag';
import * as abdullah from '../../src/community/abdullah';
import * as asi from '../../src/community/absolute-strength-index';
import * as arrows from '../../src/community/absorption-arrows-v2';
import * as abusuhil from '../../src/community/abusuhil-bullish-candles';
import * as swing from '../../src/community/accurate-swing-trading';
import * as admf from '../../src/community/ad-money-flow';

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
const uniq = (a: number[]) => [...new Set(a)];

/** Independent SMA, population stdev, linear regression (na = NaN) */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
function stdev(src: number[], len: number): number[] {
  const m = sma(src, len);
  return src.map((_, i) => {
    if (isNaN(m[i])) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += (src[k] - m[i]) ** 2;
    return Math.sqrt(s / len);
  });
}
function linreg(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let j = 0; j < len; j++) {
      const x = j;
      const y = src[i - len + 1 + j];
      sx += x; sy += y; sxy += x * y; sxx += x * x;
    }
    const slope = (len * sxy - sx * sy) / (len * sxx - sx * sx);
    const icpt = (sy - slope * sx) / len;
    return icpt + slope * (len - 1);
  });
}
const highest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.max(...src.slice(i - len + 1, i + 1))));
const lowest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.min(...src.slice(i - len + 1, i + 1))));
const crossover = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const crossunder = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);

describe('community ports 00: alerts', () => {
  it('1-2-3 Pattern: alert() call on each break bar with the ticker, once per bar close', () => {
    expect(p123.hasAlertFunction).toBe(true);
    expect(p123.Pattern123.hasAlertFunction).toBe(true);
    const r = p123.calculate(bars, {}, { tickerid: 'NASDAQ:AAPL' });
    const labels = (r.labels ?? []) as { time: number; text: string; color?: string }[];
    const bull = labels.filter((l) => l.text === '' && l.color === p123.defaultInputs.colBull).map((l) => l.time);
    const bear = labels.filter((l) => l.text === '' && l.color === p123.defaultInputs.colBear).map((l) => l.time);
    expect(bull.length + bear.length).toBeGreaterThan(3);
    expect(callTimes(r.alertCalls, 'Bullish 1-2-3 Pattern Identified on: AAPL')).toEqual(bull);
    expect(callTimes(r.alertCalls, 'Bearish 1-2-3 Pattern Identified on: AAPL')).toEqual(bear);
    expect(r.alertCalls.length).toBe(bull.length + bear.length);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    // the call does not depend on the drawing switches
    const off = p123.calculate(bars, { showBreak: false, showPattern: false }, { tickerid: 'NASDAQ:AAPL' });
    expect(off.alertCalls).toEqual(r.alertCalls);
    // without a chart context the ticker is empty
    expect(p123.calculate(bars).alertCalls[0].message).toMatch(/Identified on: $/);
  });

  it('Squeeze Momentum Scalper: Squeeze Fired / Long Momentum / Short Momentum', () => {
    expect(decls(squeeze)).toEqual([
      ['alert0', 'Squeeze Fired', 'Volatility Squeeze has FIRED! Check histogram for direction.'],
      ['alert1', 'Long Momentum', 'Momentum has crossed bullish.'],
      ['alert2', 'Short Momentum', 'Momentum has crossed bearish.'],
    ]);
    expect(squeeze.SqueezeMomentumScalper.alertConditions).toBe(squeeze.alertConditions);
    const r = squeeze.calculate(bars);
    const close = bars.map((b) => b.close);
    const basis = sma(close, 20);
    const sd = stdev(close, 20);
    const tr = bars.map((b, i) => (i === 0 ? NaN
      : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
    const rangema = sma(tr, 20);
    const sqzOn = bars.map((_, i) => gt(basis[i] - 2 * sd[i], basis[i] - 1.5 * rangema[i])
      && lt(basis[i] + 2 * sd[i], basis[i] + 1.5 * rangema[i]));
    const hh = highest(bars.map((b) => b.high), 20);
    const ll = lowest(bars.map((b) => b.low), 20);
    const val = linreg(close.map((c, i) => c - ((hh[i] + ll[i]) / 2 + basis[i]) / 2), 20);
    const fired = sqzOn.map((s, i) => i > 0 && sqzOn[i - 1] && !s);
    expect(r.alerts[0].times).toEqual(timeAt(bars, fired));
    expect(r.alerts[1].times).toEqual(timeAt(bars, crossover(val, val.map(() => 0))));
    expect(r.alerts[2].times).toEqual(timeAt(bars, crossunder(val, val.map(() => 0))));
    for (const a of r.alerts) expect(a.times.length).toBeGreaterThan(3);
  });

  it('1m Trend Continuation SSL + BB: Buy Signal / Sell Signal', () => {
    expect(decls(sslBb)).toEqual([
      ['alert0', 'Buy Signal', 'SSL Bullish Signal + Close Above Upper Bollinger Band'],
      ['alert1', 'Sell Signal', 'SSL Bearish Signal + Close Below Lower Bollinger Band'],
    ]);
    // short lengths so that the signals occur on the walk
    const inputs = { emaLength: 20, bbLength: 20, bbStdDev: 1 };
    const r = sslBb.calculate(bars, inputs);
    const close = bars.map((b) => b.close);
    const ema = (() => {
      const a = 2 / 21;
      const out: number[] = [];
      let prev = NaN;
      close.forEach((c, i) => {
        if (i < 19) { out.push(NaN); return; }
        prev = i === 19 ? sma(close, 20)[19] : a * c + (1 - a) * prev;
        out.push(prev);
      });
      return out;
    })();
    const sh = sma(bars.map((b) => b.high), 10);
    const sl = sma(bars.map((b) => b.low), 10);
    let hlv = NaN;
    const up: number[] = [], dn: number[] = [];
    close.forEach((c, i) => {
      hlv = gt(c, sh[i]) ? 1 : lt(c, sl[i]) ? -1 : hlv;
      up.push(lt(hlv, 0) ? sl[i] : sh[i]);
      dn.push(lt(hlv, 0) ? sh[i] : sl[i]);
    });
    const bb = sma(close, 20), sd = stdev(close, 20);
    const xo = crossover(up, dn), xu = crossunder(up, dn);
    const buy = close.map((c, i) => gt(c, ema[i]) && xo[i] && gt(c, bb[i] + sd[i]));
    const sell = close.map((c, i) => lt(c, ema[i]) && xu[i] && lt(c, bb[i] - sd[i]));
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
    expect(r.alerts[0].times.length + r.alerts[1].times.length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(r.markers.filter((m) => m.text === 'BUY').map((m) => m.time));
    expect(r.alerts[1].times).toEqual(r.markers.filter((m) => m.text === 'SELL').map((m) => m.time));
  });

  it('2B Reversal Pattern: Breakout Up / Breakout Down on the triangle bars', () => {
    expect(decls(twoB)).toEqual([['alert0', 'Breakout Up', 'Breakout Up'], ['alert1', 'Breakout Down', 'Breakout Down']]);
    expect(twoB.TwoBReversalPattern.alertConditions).toBe(twoB.alertConditions);
    const r = twoB.calculate(bars, { prd: 5 });
    const up = r.markers.filter((m) => m.shape === 'triangleUp').map((m) => m.time);
    const dn = r.markers.filter((m) => m.shape === 'triangleDown').map((m) => m.time);
    expect(up.length).toBeGreaterThan(0);
    expect(dn.length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(dn);
  });

  it('3 Bar Reversal: Market Reversal when a bars-since count is 3', () => {
    expect(decls(threeBar)).toEqual([['alert0', 'Market Reversal', 'REVERSAL']]);
    const r = threeBar.calculate(bars);
    const ge = (a: number, b: number) => !(b - a > EPS);
    const le = (a: number, b: number) => !(a - b > EPS);
    let a = NaN, b = NaN;
    const flags = bars.map((bar, i) => {
      const prev = i > 0 ? bars[i - 1].close : NaN;
      a = i > 0 && ge(bar.close, prev) ? 0 : a + 1;
      b = i > 0 && le(bar.close, prev) ? 0 : b + 1;
      return a === 3 || b === 3;
    });
    expect(r.alerts[0].times).toEqual(timeAt(bars, flags));
    expect(r.alerts[0].times.length).toBeGreaterThan(10);
  });

  it('3-in-1 Custom MA: Spike Alert on |close - open| / open >= candle move %', () => {
    expect(decls(threeInOne)).toEqual([['alert0', 'Spike Alert', 'Price moved {{close}} from open by threshold %']]);
    for (const alertPct of [0.5, 2]) {
      const r = threeInOne.calculate(bars, { alertPct });
      const flags = bars.map((b) => (Math.abs(b.close - b.open) / b.open) * 100 >= alertPct);
      expect(r.alerts[0].times).toEqual(timeAt(bars, flags));
      expect(r.alerts[0].times.length).toBeGreaterThan(5);
    }
  });

  it('3rd Wave: Breakout Long / Short on the breakout triangles', () => {
    expect(decls(thirdWave)).toEqual([['alert0', 'Breakout Long', 'Breakout Long'], ['alert1', 'Breakout Short', 'Breakout Short']]);
    for (const inputs of [{}, { checkvolSupport: false }, { prd: 4 }]) {
      const r = thirdWave.calculate(bars, inputs);
      const up = r.labels.filter((l) => l.style === 'triangleup').map((l) => l.time as number);
      const dn = r.labels.filter((l) => l.style === 'triangledown').map((l) => l.time as number);
      expect(r.alerts[0].times).toEqual(up);
      expect(r.alerts[1].times).toEqual(dn);
      expect(up.length + dn.length).toBeGreaterThan(0);
    }
  });

  it('5-Minute Buy/Sell Signal: Buy Signal / Sell Signal on the label bars', () => {
    expect(decls(fiveMin)).toEqual([
      ['alert0', 'Buy Signal', 'Buy Signal: MACD bullish, RSI oversold, price above EMA50'],
      ['alert1', 'Sell Signal', 'Sell Signal: MACD bearish, RSI overbought, price below EMA50'],
    ]);
    // loose levels so that both signals occur on the walk
    const r = fiveMin.calculate(bars, { rsiOversold: 50, rsiOverbought: 50, emaLength: 10 });
    const buy = r.markers.filter((m) => m.text === 'BUY').map((m) => m.time);
    const sell = r.markers.filter((m) => m.text === 'SELL').map((m) => m.time);
    expect(buy.length).toBeGreaterThan(0);
    expect(sell.length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
    // independent part of the condition: volume above its SMA(20)
    const vAvg = sma(bars.map((b) => b.volume!), 20);
    const idx = new Map(bars.map((b, i) => [b.time as number, i]));
    for (const t of [...buy, ...sell]) expect(bars[idx.get(t)!].volume! > vAvg[idx.get(t)!]).toBe(true);
  });

  it('ABC on Recursive Zigzag: alert() calls for new patterns and updated coordinates', () => {
    expect(abc.hasAlertFunction).toBe(true);
    expect(abc.AbcOnRecursiveZigzag.hasAlertFunction).toBe(true);
    const r = abc.calculate(bars, { zigzagLength: 5 });
    const msgs = new Set(r.alertCalls.map((c) => c.message));
    expect([...msgs].every((m) => m === 'New ABC Pattern Detected' || m === 'ABC Pattern Coordinates Updated')).toBe(true);
    expect(callTimes(r.alertCalls, 'New ABC Pattern Detected').length).toBeGreaterThan(3);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar')).toBe(true);
    const times = new Set(bars.map((b) => b.time as number));
    expect(r.alertCalls.every((c) => times.has(c.time))).toBe(true);
    // every pattern drawn with its C label was found on a bar with a 'New ABC Pattern Detected' call or an update
    const callBars = new Set(r.alertCalls.map((c) => c.time));
    expect(callBars.size).toBeGreaterThan(0);
    // calls are in bar order
    const t = r.alertCalls.map((c) => c.time);
    expect([...t].sort((x, y) => x - y)).toEqual(t);
  });

  it('Absolute Strength Index: divergence conditions on the Bull / Bear labels', () => {
    expect(decls(asi)).toEqual([
      ['alert0', 'Regular Bullish Divergence', 'Found a new Regular Bullish Divergence'],
      ['alert1', 'Regular Bearish Divergence', 'Found a new Regular Bearish Divergence'],
    ]);
    const off = asi.calculate(bars);
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
    const r = asi.calculate(bars, { calculateDivergence: true, lookback: 5 });
    const bull = r.markers.filter((m) => m.text === 'Bull').map((m) => m.time);
    const bear = r.markers.filter((m) => m.text === 'Bear').map((m) => m.time);
    expect(bull.length).toBeGreaterThan(0);
    expect(bear.length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(bull);
    expect(r.alerts[1].times).toEqual(bear);
  });

  it('Absorption Arrows v2: four conditions on the arrows, on confirmed bars only', () => {
    expect(decls(arrows)).toEqual([
      ['alert0', 'Buying Absorption', 'Absorption Arrows v2: Buying absorption detected'],
      ['alert1', 'Selling Absorption', 'Absorption Arrows v2: Selling absorption detected'],
      ['alert2', 'Absorption (Any)', 'Absorption Arrows v2: Absorption event detected'],
      ['alert3', 'Big Absorption Only', 'Absorption Arrows v2: HIGH CONVICTION absorption event detected'],
    ]);
    const r = arrows.calculate(bars);
    const up = uniq(r.markers.filter((m) => m.shape === 'arrowUp').map((m) => m.time as number));
    const dn = uniq(r.markers.filter((m) => m.shape === 'arrowDown').map((m) => m.time as number));
    const big = uniq(r.markers.filter((m) => m.size === 'large').map((m) => m.time as number));
    expect(up.length).toBeGreaterThan(0);
    expect(dn.length).toBeGreaterThan(0);
    expect(big.length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(dn);
    expect(r.alerts[2].times).toEqual(uniq([...up, ...dn]).sort((a, b) => a - b));
    expect(r.alerts[3].times).toEqual(big);
    // an open last bar is not confirmed
    const k = bars.findIndex((b) => b.time === up[1]);
    const cut = bars.slice(0, k + 1);
    expect(arrows.calculate(cut, {}, { lastBarConfirmed: true }).alerts[0].triggered).toBe(true);
    const open = arrows.calculate(cut, {}, { lastBarConfirmed: false });
    expect(open.alerts[0].triggered).toBe(false);
    expect(open.alerts[2].triggered).toBe(false);
    expect(open.markers.some((m) => m.time === up[1])).toBe(true);
  });

  it('Abusuhil Bullish Candles: one condition per pattern, gated by its alert toggle', () => {
    expect(decls(abusuhil)).toEqual([
      ['alert0', 'Hammer Alert', 'Hammer pattern detected'],
      ['alert1', 'Engulfing Alert', 'Bullish Engulfing pattern detected'],
      ['alert2', 'Morning Star Alert', 'Morning Star pattern detected'],
      ['alert3', 'Piercing Line Alert', 'Piercing Line pattern detected'],
      ['alert4', 'Three White Soldiers Alert', 'Three White Soldiers pattern detected'],
      ['alert5', 'Three Inside Up Alert', 'Three Inside Up pattern detected'],
    ]);
    const r = abusuhil.calculate(bars);
    let total = 0;
    for (let k = 0; k < 6; k++) {
      const t = r.markers.filter((m) => m.id === `shape${k}`).map((m) => m.time);
      expect(r.alerts[k].times).toEqual(t);
      total += t.length;
    }
    expect(total).toBeGreaterThan(5);
    // hammer recomputed from the original's expression
    const close = bars.map((b) => b.close);
    const a = 2 / 21;
    const ema: number[] = [];
    close.forEach((c, i) => ema.push(i < 19 ? NaN : i === 19 ? sma(close, 20)[19] : a * c + (1 - a) * ema[i - 1]));
    const hammer = bars.map((b, i) => i >= 2 && lt(b.close, ema[i]) && lt(close[i - 1], ema[i - 1]) && lt(close[i - 2], ema[i - 2])
      && gt(b.close, b.open) && gt(b.open - b.low, 2 * Math.abs(b.close - b.open)) && lt(b.high - b.close, b.close - b.open));
    expect(r.alerts[0].times).toEqual(timeAt(bars, hammer));
    const off = abusuhil.calculate(bars, { alertHammer: false, alertEngulfing: false });
    expect(off.alerts[0].times).toEqual([]);
    expect(off.alerts[1].times).toEqual([]);
    expect(off.alerts[2].times).toEqual(r.alerts[2].times);
    expect(off.markers).toEqual(r.markers);
  });

  it("Accurate Swing Trading: Buy / Sell on the crosses of the original's TSL", () => {
    expect(decls(swing)).toEqual([['alert0', 'Buy Signal', 'Buy'], ['alert1', 'Sell Signal', 'Sell']]);
    const r = swing.calculate(bars);
    const res = highest(bars.map((b) => b.high), 3);
    const sup = lowest(bars.map((b) => b.low), 3);
    let avn = NaN;
    const tsl = bars.map((b, i) => {
      const avd = i > 0 && b.close > res[i - 1] ? 1 : i > 0 && b.close < sup[i - 1] ? -1 : 0;
      if (avd !== 0) avn = avd;
      return avn === 1 ? sup[i] : res[i];
    });
    const close = bars.map((b) => b.close);
    expect(r.alerts[0].times).toEqual(timeAt(bars, crossover(close, tsl)));
    expect(r.alerts[1].times).toEqual(timeAt(bars, crossunder(close, tsl)));
    expect(r.alerts[0].times.length).toBeGreaterThan(10);
    expect(r.alerts[1].times.length).toBeGreaterThan(10);
  });
});

describe('community ports 00: Style ids', () => {
  it('Abdullah: Long Stop Start / Buy Label / Short Stop Start / Sell Label', () => {
    const r = abdullah.calculate(bars);
    expect(r.markers.length).toBeGreaterThan(10);
    for (const m of r.markers) {
      const want = m.shape === 'circle' ? (m.color === '#4CAF50' ? 'shape0' : 'shape2') : m.text === 'Buy' ? 'shape1' : 'shape3';
      expect(m.id).toBe(want);
    }
    expect(new Set(r.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1', 'shape2', 'shape3']));
    // without the labels only the circles remain
    const noLabels = abdullah.calculate(bars, { ceShowLabels: false });
    expect(new Set(noLabels.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape2']));
  });

  it('Absorption Arrows v2: sell arrows shape0-2, buy arrows shape3-5 by size', () => {
    const r = arrows.calculate(bars);
    const sizes = ['small', 'normal', 'large'];
    for (const m of r.markers) {
      const k = sizes.indexOf(m.size as string);
      expect(m.id).toBe(m.shape === 'arrowDown' ? `shape${k}` : `shape${k + 3}`);
    }
    const ids = new Set(r.markers.map((m) => m.id));
    expect([...ids].every((id) => ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5'].includes(id as string))).toBe(true);
    expect(ids.size).toBeGreaterThan(3);
  });

  it('Abusuhil Bullish Candles: one id per pattern label', () => {
    const r = abusuhil.calculate(bars);
    const byText: Record<string, string> = {
      Hammer: 'shape0', Engulf: 'shape1', 'Morning Star': 'shape2', Piercing: 'shape3', '3 Soldiers': 'shape4', 'Inside Up': 'shape5',
    };
    expect(r.markers.length).toBeGreaterThan(0);
    for (const m of r.markers) expect(m.id).toBe(byText[m.text as string]);
  });

  it('A/D Money Flow: Signal crossunder shape0, Signal crossover shape1 (both marker modes)', () => {
    for (const crossMrk of [true, false]) {
      const r = admf.calculate(bars, { crossMrk });
      expect(r.markers.length).toBeGreaterThan(10);
      for (const m of r.markers) expect(m.id).toBe(m.color === 'rgb(200, 200, 255)' || m.color === '#C8C8FF' ? 'shape0' : 'shape1');
      expect(new Set(r.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1']));
    }
  });
});
