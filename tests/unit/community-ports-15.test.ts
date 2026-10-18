/**
 * Alerts and Style ids of 16 community ports (batch 15): the alertcondition() declarations (ids, titles and messages
 * of the originals), the bars on which each condition is true (re-computed here from the original's expression), and
 * the Style-settings ids on the emitted markers, background colours and arrows.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as fxn from '../../src/community/fxn-week-and-day-separator';
import * as andean from '../../src/community/gabriel-s-andean-oscillator';
import * as gamma from '../../src/community/gamma-hedging-pressure';
import * as gann from '../../src/community/gann-high-low';
import * as gauss from '../../src/community/gaussian-filter-trend';
import * as gli from '../../src/community/global-liquidity-index';
import * as gmma from '../../src/community/gmma';
import * as gold from '../../src/community/gold-trend-signal-indicator';
import * as gdc from '../../src/community/golden-death-cross-highlighter';
import * as gorgo from '../../src/community/gorgo-s-hybrid-oscillator-strategy';
import * as gtf from '../../src/community/gradient-trend-filter';
import * as granville from '../../src/community/granville-entry-guide';
import * as gravity from '../../src/community/gravity-well-trend-lyro-rs';
import * as grid from '../../src/community/gridbot-ping-pong';
import * as guppy from '../../src/community/guppy-mma';
import * as hinf from '../../src/community/h-infinity-volatility-filter';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of daily bars with a random volume */
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
const bars = walk(1200, 11);
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const uniq = <T>(a: T[]) => [...new Set(a)];
const vals = (p: { value: number }[]) => p.map((x) => x.value);

/** ta.crossover / ta.crossunder with exact comparisons (na = false) */
const xover = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : b[i - 1];
  return i > 0 && v > w && a[i - 1] <= pw;
});
const xunder = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : b[i - 1];
  return i > 0 && v < w && a[i - 1] >= pw;
});

/** Independent SMA / EMA (SMA seed) */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
function ema(src: number[], len: number): number[] {
  const alpha = 2 / (len + 1);
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(prev)) {
      let s = 0, ok = i >= len - 1;
      for (let k = i - len + 1; ok && k <= i; k++) { if (isNaN(src[k])) ok = false; else s += src[k]; }
      prev = ok ? s / len : NaN;
    } else {
      prev = alpha * src[i] + (1 - alpha) * prev;
    }
    out.push(prev);
  }
  return out;
}
const close6 = (a: number[], b: number[]) => a.every((v, i) => (isNaN(v) && isNaN(b[i])) || Math.abs(v - b[i]) < 1e-6);

describe('fxn-week-and-day-separator', () => {
  // 30-minute bars from Monday 06/01/2020 (UTC: day names at 06:00, separators at 22:00)
  const intraday = walk(48 * 30, 3, 1800, 1578268800);
  const shortIds: Record<string, string> = { Mon: 'shape0', Tues: 'shape1', Wed: 'shape2', Thu: 'shape3', Fri: 'shape4' };
  const longIds: Record<string, string> = { Monday: 'shape5', Tuesday: 'shape6', Wednesday: 'shape7', Thursday: 'shape8', Friday: 'shape9' };
  it('gives the plotshape id of each day name', () => {
    const long = fxn.calculate(intraday);
    expect(long.markers.length).toBeGreaterThan(0);
    expect(long.markers.every((m) => m.id === longIds[m.text as string])).toBe(true);
    expect(uniq(long.markers.map((m) => m.id)).sort()).toEqual(['shape5', 'shape6', 'shape7', 'shape8', 'shape9']);
    const short = fxn.calculate(intraday, { shortDayLabel: true });
    expect(short.markers.length).toBeGreaterThan(0);
    expect(short.markers.every((m) => m.id === shortIds[m.text as string])).toBe(true);
    expect(uniq(short.markers.map((m) => m.id)).sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4']);
  });
  it('gives the bgcolor id of each separator', () => {
    const r = fxn.calculate(intraday, { showAsBackground: true, dayToggle: true });
    expect(r.bgColors.length).toBeGreaterThan(0);
    expect(uniq(r.bgColors.map((c) => c.id)).sort()).toEqual(['bgcolor0', 'bgcolor1', 'bgcolor2', 'bgcolor3', 'bgcolor4']);
    expect(r.bgColors.filter((c) => c.id === 'bgcolor0').every((c) => c.color === 'rgba(244, 212, 21, 0.4)')).toBe(true);
    // the four day separators on the same bars
    const dayTimes = (id: string) => r.bgColors.filter((c) => c.id === id).map((c) => c.time);
    expect(dayTimes('bgcolor1').length).toBeGreaterThan(0);
    for (const id of ['bgcolor2', 'bgcolor3', 'bgcolor4']) expect(dayTimes(id)).toEqual(dayTimes('bgcolor1'));
  });
});

describe('gabriel-s-andean-oscillator', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(andean)).toEqual([
      ['alert0', 'Andean • Bullish Regime Flip', '{{ticker}} {{interval}} • Andean Oscillator: Bull crossed ABOVE Bear (Bullish regime flip).'],
      ['alert1', 'Andean • Bearish Regime Flip', '{{ticker}} {{interval}} • Andean Oscillator: Bull crossed BELOW Bear (Bearish regime flip).'],
      ['alert2', 'Andean • Signal Cross Up', '{{ticker}} {{interval}} • Andean Oscillator: Driver crossed ABOVE Signal (bullish thrust).'],
      ['alert3', 'Andean • Signal Cross Down', '{{ticker}} {{interval}} • Andean Oscillator: Driver crossed BELOW Signal (bearish thrust).'],
      ['alert4', 'Andean • Break Turned Positive', '{{ticker}} {{interval}} • Andean Oscillator: Break turned POSITIVE (bull > bear).'],
      ['alert5', 'Andean • Break Turned Negative', '{{ticker}} {{interval}} • Andean Oscillator: Break turned NEGATIVE (bear > bull).'],
      ['alert6', 'Andean • Bullish Regime Flip (Hi/Lo Confirmed)', '{{ticker}} {{interval}} • Andean Oscillator: Bullish flip CONFIRMED by High/Low envelopes.'],
      ['alert7', 'Andean • Bearish Regime Flip (Hi/Lo Confirmed)', '{{ticker}} {{interval}} • Andean Oscillator: Bearish flip CONFIRMED by High/Low envelopes.'],
    ]);
    expect(andean.GabrielsAndeanOscillator.alertConditions).toBe(andean.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const bars = walk(1200, 23); // a walk on which the confirmed flips occur
    // Envelopes of the original (Regular, length 50), recomputed here
    const alpha = 2 / 51;
    let up1 = NaN, up2 = NaN, dn1 = NaN, dn2 = NaN, up12 = 0, up22 = 0, dn12 = 0, dn22 = 0;
    const bull: number[] = [], bear: number[] = [], bull2: number[] = [], bear2: number[] = [];
    const mx = (...a: number[]) => (a.some(isNaN) ? NaN : Math.max(...a));
    const mn = (...a: number[]) => (a.some(isNaN) ? NaN : Math.min(...a));
    const nz = (x: number, y: number) => (isNaN(x) ? y : x);
    for (const b of bars) {
      const C = b.close, O = b.open, H = b.high, L = b.low;
      up1 = nz(mx(C, O, up1 - (up1 - C) * alpha), C);
      up2 = nz(mx(C * C, O * O, up2 - (up2 - C * C) * alpha), C * C);
      dn1 = nz(mn(C, O, dn1 + (C - dn1) * alpha), C);
      dn2 = nz(mn(C * C, O * O, dn2 + (C * C - dn2) * alpha), C * C);
      up12 = mx(H, L, up12 - (up12 - H) * alpha);
      up22 = mx(H * H, L * L, up22 - (up22 - H * H) * alpha);
      dn12 = mn(H, L, dn12 + (H - dn12) * alpha);
      dn22 = mn(H * H, L * L, dn22 + (H * H - dn22) * alpha);
      bull.push(Math.sqrt(dn2 - dn1 * dn1));
      bear.push(Math.sqrt(up2 - up1 * up1));
      bull2.push(Math.sqrt(dn22 - dn12 * dn12));
      bear2.push(Math.sqrt(up22 - up12 * up12));
    }
    const driver = bull.map((v, i) => mx(v, bear[i]));
    const signal = ema(driver, 9);
    const diff = bull.map((v, i) => v - bear[i]);
    const r = andean.calculate(bars, { hilow: true });
    const bu = xover(bull, bear), bd = xunder(bull, bear);
    const expected = [
      bu, bd, xover(driver, signal), xunder(driver, signal), xover(diff, 0), xunder(diff, 0),
      bu.map((f, i) => f && gt(bull[i], bull2[i])), bd.map((f, i) => f && gt(bear[i], bear2[i])),
    ];
    expected.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
    // without the high / low components the confirmations never fire; without breaks the break turns never fire
    const d = andean.calculate(bars, { breakOn: false });
    expect(d.alerts[6].times).toEqual([]);
    expect(d.alerts[7].times).toEqual([]);
    expect(d.alerts[4].times).toEqual([]);
    expect(d.alerts[5].times).toEqual([]);
    expect(d.alerts[0].times).toEqual(r.alerts[0].times);
  });
});

describe('gamma-hedging-pressure', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(gamma)).toEqual([
      ['alert0', 'Extreme Bullish Gamma', 'Bullish Gamma Pressure above threshold'],
      ['alert1', 'Extreme Bearish Gamma', 'Bearish Gamma Pressure above threshold'],
      ['alert2', 'Bullish Pressure Rising', 'Bullish Gamma crossing extreme level'],
      ['alert3', 'Bearish Pressure Rising', 'Bearish Gamma crossing extreme level'],
    ]);
    expect(gamma.GammaHedgingPressure.alertConditions).toBe(gamma.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    // gammaRaw = momentum / max(stdev, 1e-5), normalised over 100 bars to -100..100, EMA 5, split in two
    const L = 20, N = 100;
    const raw = close.map((c, i) => {
      if (i < L) return NaN;
      let m = 0;
      for (let k = i - L + 1; k <= i; k++) m += close[k];
      m /= L;
      let v = 0;
      for (let k = i - L + 1; k <= i; k++) v += (close[k] - m) ** 2;
      return (c - close[i - L]) / Math.max(Math.sqrt(v / L), 0.00001);
    });
    const norm = raw.map((g, i) => {
      if (i < N - 1) return NaN;
      // ta.lowest / ta.highest skip na values
      const w = raw.slice(i - N + 1, i + 1).filter((v) => !isNaN(v));
      if (!w.length) return NaN;
      const lo = Math.min(...w), hi = Math.max(...w);
      return (200 * (g - lo)) / Math.max(hi - lo, 0.00001) - 100;
    });
    const fin = ema(norm, 5);
    const bull = fin.map((g) => (isNaN(g) ? NaN : Math.max(g, 0)));
    const bear = fin.map((g) => (isNaN(g) ? NaN : Math.abs(Math.min(g, 0))));
    const r = gamma.calculate(bars);
    const expected = [bull.map((v) => gt(v, 70)), bear.map((v) => gt(v, 70)), xover(bull, 70), xover(bear, 70)];
    expected.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
  });
});

describe('gann-high-low', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(gann)).toEqual([
      ['alert0', 'Price Cross Alert', 'Price - HiLo Crossing!'],
      ['alert1', 'PRICE CrossOver Alarm', 'LAST PRICE is ABOVE HiLo'],
      ['alert2', 'PRICE CrossUnder Alarm', 'LAST PRICE is BELOW HiLo!'],
    ]);
    expect(gann.GannHighLow.alertConditions).toBe(gann.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const sh = sma(bars.map((b) => b.high), 13);
    const sl = sma(bars.map((b) => b.low), 21);
    const nz = (v: number) => (isNaN(v) ? 0 : v);
    let hlv = NaN;
    const hilo = close.map((c, i) => {
      const hld = i > 0 && gt(c, nz(sh[i - 1])) ? 1 : i > 0 && lt(c, nz(sl[i - 1])) ? -1 : 0;
      if (hld !== 0) hlv = hld;
      return hlv === -1 ? sh[i] : sl[i];
    });
    const up = xover(close, hilo), dn = xunder(close, hilo);
    const r = gann.calculate(bars);
    [up.map((f, i) => f || dn[i]), up, dn].forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
  });
});

describe('gaussian-filter-trend', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(gauss)).toEqual([
      ['alert0', 'Bullish Trend Signal', 'Gaussian Filter Trend: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert1', 'Bearish Trend Signal', 'Gaussian Filter Trend: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert2', 'Any Trend Change', 'Gaussian Filter Trend: Trend state changed on {{exchange}}:{{ticker}} - {{interval}}'],
    ]);
    expect(gauss.GaussianFilterTrend.alertConditions).toBe(gauss.alertConditions);
  });
  it('fires when the trend direction of the stepped line turns', () => {
    const r = gauss.calculate(bars);
    // trend_dir from the steps of the trend line, turned_bull = trend_dir == 1 and trend_dir[1] != 1
    const tl = vals(r.plots.plot0 as { value: number }[]);
    let dir = 0;
    const dirs = tl.map((v, i) => {
      const p = i > 0 ? tl[i - 1] : NaN;
      if (gt(v, p)) dir = 1;
      else if (lt(v, p)) dir = -1;
      return dir;
    });
    const tb = dirs.map((d, i) => i > 0 && d === 1 && dirs[i - 1] !== 1);
    const td = dirs.map((d, i) => i > 0 && d === -1 && dirs[i - 1] !== -1);
    [tb, td, tb.map((f, i) => f || td[i])].forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
  });
});

describe('global-liquidity-index', () => {
  it('is skipped: the spec original is another version of the script (no alerts added)', () => {
    expect((gli as Record<string, unknown>).alertConditions).toBeUndefined();
  });
});

describe('gmma', () => {
  it('gives the four alert arrows of the original', () => {
    const r = gmma.calculate(bars);
    const fast = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23].map((l) => ema(close, l));
    const slow = [25, 28, 31, 34, 37, 40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70].map((l) => ema(close, l));
    const ord = (list: number[][], i: number, cmp: (a: number, b: number) => boolean) =>
      list.slice(1).every((e, k) => cmp(list[k][i], e[i]));
    const buy: number[] = [], sell: number[] = [], bb: number[] = [], sb: number[] = [];
    const ex: { time: number; id: string; value: number }[] = [];
    const lastOne = [NaN, NaN, NaN, NaN]; // index of the last bar where x[1] (nz 1) == 1
    for (let i = 0; i < bars.length; i++) {
      const ef = fast.reduce((s, e) => s + e[i], 0) / 11;
      const es = slow.reduce((s, e) => s + e[i], 0) / 16;
      const fL = ord(fast, i, gt), fS = ord(fast, i, lt), sL = ord(slow, i, gt), sS = ord(slow, i, lt);
      const prv = (a: number[]) => (i > 0 ? a[i - 1] : NaN);
      const cnt = (cond: boolean, a: number[]) => (cond ? (prv(a) > 0 ? prv(a) + 1 : 1) : 0);
      buy.push(cnt(gt(ef, es) && !sS && fL, buy));
      sell.push(cnt(lt(ef, es) && !sL && fS, sell));
      bb.push(cnt(gt(ef, es) && !sS, bb));
      sb.push(cnt(lt(ef, es) && !sL, sb));
      [buy, sell, bb, sb].forEach((a, k) => { if ((i > 0 ? a[i - 1] : 1) === 1) lastOne[k] = i; });
      const since = (k: number) => i - lastOne[k];
      const t = bars[i].time as number;
      if (buy[i] === 1 && since(0) > 6) ex.push({ time: t, id: 'arrow0', value: 1 });
      if (sell[i] === 1 && since(1) > 6) ex.push({ time: t, id: 'arrow1', value: -1 });
      if (bb[i] === 1 && since(3) > 6 && since(2) > 6) ex.push({ time: t, id: 'arrow2', value: 1 });
      if (sb[i] === 1 && since(2) > 6 && since(3) > 6) ex.push({ time: t, id: 'arrow3', value: -1 });
    }
    expect(r.arrows.map((a) => ({ time: a.time, id: a.id, value: a.value }))).toEqual(ex);
    expect(uniq(r.arrows.map((a) => a.id)).sort()).toEqual(['arrow0', 'arrow1', 'arrow2', 'arrow3']);
    const col: Record<string, string> = {
      arrow0: 'rgba(0, 255, 0, 0.8)', arrow1: 'rgba(255, 0, 0, 0.8)', arrow2: 'rgba(0, 255, 255, 0.8)', arrow3: 'rgba(0, 0, 255, 0.8)',
    };
    expect(r.arrows.every((a) => a.color.replace(/\s/g, '') === col[a.id].replace(/\s/g, ''))).toBe(true);
    expect(gmma.calculate(bars, { showSwing: false, showBreak: false }).arrows).toEqual([]);
    expect((r as { markers?: unknown[] }).markers ?? []).toEqual([]);
  });
});

describe('gold-trend-signal-indicator', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(gold)).toEqual([
      ['alert0', 'Gold Long Signal', 'Gold Long Entry Triggered!'],
      ['alert1', 'Gold Short Signal', 'Gold Short Entry Triggered!'],
    ]);
    expect(gold.GoldTrendSignalIndicator.alertConditions).toBe(gold.alertConditions);
  });
  it('fires on the EMA crosses', () => {
    const f = ema(close, 20), s = ema(close, 50);
    const r = gold.calculate(bars);
    [xover(f, s), xunder(f, s)].forEach((x, k) => {
      expect(x.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, x));
    });
  });
});

describe('golden-death-cross-highlighter', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(gdc)).toEqual([
      ['alert0', 'Golden Cross', 'Golden Cross Detected!'],
      ['alert1', 'Death Cross', 'Death Cross Detected!'],
    ]);
    expect(gdc.GoldenDeathCrossHighlighter.alertConditions).toBe(gdc.alertConditions);
  });
  it('fires on the SMA crosses', () => {
    const f = sma(close, 50), s = sma(close, 200);
    const r = gdc.calculate(bars);
    [xover(f, s), xunder(f, s)].forEach((x, k) => {
      expect(x.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, x));
    });
  });
});

describe('gorgo-s-hybrid-oscillator-strategy', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(gorgo)).toEqual([
      ['alert0', 'BUY', '00_buy signal @ {{close}}'],
      ['alert1', 'SELL', '00_sell signal @ {{close}}'],
    ]);
    expect(gorgo.GorgosHybridOscillatorStrategy.alertConditions).toBe(gorgo.alertConditions);
  });
  it('fires on the buy / sell bars of the background', () => {
    const r = gorgo.calculate(bars);
    const buyBg = 'rgba(255, 0, 0, 0.25)';
    const bgTimes = (c: string) => r.bgColors.filter((x) => x.color.replace(/\s/g, '') === c.replace(/\s/g, '')).map((x) => x.time);
    const [buy, sell] = r.alerts;
    expect(buy.times.length).toBeGreaterThan(0);
    expect(sell.times.length).toBeGreaterThan(0);
    // the background is white on the sell bars, red on the buy bars that are not sell bars
    expect(bgTimes('rgba(255, 255, 255, 0.25)')).toEqual(sell.times);
    expect(bgTimes(buyBg)).toEqual(buy.times.filter((t) => !sell.times.includes(t)));
    // second buy rule: volume >= eccesso_volumetrico[1] and osc <= osc[1] and osc <= 40 (osc from the plot)
    const osc = vals(r.plots.plot1 as { value: number }[]);
    const vol = bars.map((b) => b.volume as number);
    const ecc = sma(vol, 9).map((v) => v * 2.7);
    const rule2 = bars.map((_, i) => i > 0 && !(ecc[i - 1] - vol[i] > EPS) && !isNaN(ecc[i - 1])
      && !(osc[i] - osc[i - 1] > EPS) && !isNaN(osc[i - 1]) && !(osc[i] - 40 > EPS) && !isNaN(osc[i]));
    expect(rule2.some(Boolean)).toBe(true);
    for (const t of timeAt(bars, rule2)) expect(buy.times).toContain(t);
  });
});

describe('gradient-trend-filter', () => {
  it('gives the plotshape id of each diamond', () => {
    const r = gtf.calculate(bars);
    const base = vals(r.plots.plot0 as { value: number }[]);
    const diff = base.map((b, i) => (i >= 2 ? b - base[i - 2] : NaN));
    const ex: { time: number; id: string }[] = [];
    xover(diff, 0).forEach((f, i) => { if (f) ex.push({ time: bars[i - 1].time as number, id: 'shape0' }); });
    xunder(diff, 0).forEach((f, i) => { if (f) ex.push({ time: bars[i - 1].time as number, id: 'shape1' }); });
    ex.sort((a, b) => a.time - b.time);
    expect(r.markers.map((m) => ({ time: m.time, id: m.id }))).toEqual(ex);
    expect(uniq(r.markers.map((m) => m.id)).sort()).toEqual(['shape0', 'shape1']);
  });
});

describe('granville-entry-guide', () => {
  it('gives the bgcolor id of each trend background', () => {
    const r = granville.calculate(bars, { startDate: 0 });
    expect(uniq(r.bgColors.map((c) => c.id)).sort()).toEqual(['bgcolor0', 'bgcolor1']);
    expect(r.bgColors.filter((c) => c.id === 'bgcolor0').every((c) => c.color.replace(/\s/g, '').replace(/0\.0?9999+\d*/, '0.1') === 'rgba(242,54,69,0.1)')).toBe(true);
    expect(r.bgColors.filter((c) => c.id === 'bgcolor1').every((c) => c.color.replace(/\s/g, '').replace(/0\.0?9999+\d*/, '0.1') === 'rgba(41,98,255,0.1)')).toBe(true);
    // uptrend = ma2 > ma3 and both rising
    const m2 = sma(close, 25), m3 = sma(close, 75);
    const up = bars.map((_, i) => i > 0 && gt(m2[i], m3[i]) && gt(m2[i] - m2[i - 1], 0) && gt(m3[i] - m3[i - 1], 0));
    expect(r.bgColors.filter((c) => c.id === 'bgcolor0').map((c) => c.time)).toEqual(timeAt(bars, up));
  });
});

describe('gravity-well-trend-lyro-rs', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(gravity)).toEqual([
      ['alert0', 'Bullish Signal', 'Gravity Well | Lyro RS: Bullish signal on {{ticker}} ({{interval}})'],
      ['alert1', 'Bearish Signal', 'Gravity Well | Lyro RS: Bearish signal on {{ticker}} ({{interval}})'],
      ['alert2', 'Any Signal', 'Gravity Well | Lyro RS: Signal flip on {{ticker}} ({{interval}})'],
    ]);
    expect(gravity.GravityWellTrend.alertConditions).toBe(gravity.alertConditions);
  });
  it('fires on the trend flips (Midline mode recomputed)', () => {
    const r = gravity.calculate(bars, { sigMode: 'Midline' });
    const vol = bars.map((b) => b.volume as number);
    const num = sma(close.map((c, i) => c * vol[i]), 50), den = sma(vol, 50);
    const center = num.map((v, i) => v / den[i]);
    let trend = 0;
    const tr = close.map((c, i) => (trend = gt(c, center[i]) ? 1 : lt(c, center[i]) ? -1 : trend));
    const up = tr.map((t, i) => i > 0 && t === 1 && tr[i - 1] !== 1);
    const dn = tr.map((t, i) => i > 0 && t === -1 && tr[i - 1] !== -1);
    [up, dn, up.map((f, i) => f || dn[i])].forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
    // default mode: the alerts are on the bars of the flip labels
    const d = gravity.calculate(bars);
    expect(d.alerts[0].times).toEqual(d.markers.filter((m) => m.shape === 'labelUp').map((m) => m.time));
    expect(d.alerts[1].times).toEqual(d.markers.filter((m) => m.shape === 'labelDown').map((m) => m.time));
  });
});

describe('gridbot-ping-pong', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(grid)).toEqual([
      ['alert0', 'Buy', 'Buy'], ['alert1', 'Sell', 'Sell'], ['alert2', 'Buy TP', 'Buy TP'],
      ['alert3', 'Sell TP', 'Sell TP'], ['alert4', 'Buy Stop', 'Buy Stop'], ['alert5', 'Sell Stop', 'Sell Stop'],
    ]);
    expect(grid.GridbotPingPong.alertConditions).toBe(grid.alertConditions);
  });
  it('fires on the bars of the plotchar signals', () => {
    const r = grid.calculate(bars);
    const sig = (text: string, below: boolean) =>
      r.markers.filter((m) => m.text === text && (m.position === 'belowBar') === below).map((m) => m.time);
    const ex = [sig('▲', true), sig('▼', false), sig('△', true), sig('▽', false), sig('⦿', true), sig('⦿', false)];
    ex.forEach((t, k) => expect(r.alerts[k].times).toEqual(t));
    expect(r.alerts.every((a) => a.times.length > 0)).toBe(true);
  });
});

describe('guppy-mma', () => {
  it('colours the smoothed average with the original palette only', () => {
    const r = guppy.calculate(bars);
    const p = r.plots.plot22 as { value: number; color?: string }[];
    expect(p.filter((x) => isNaN(x.value)).every((x) => x.color === undefined)).toBe(true);
    const palette = uniq(p.filter((x) => !isNaN(x.value)).map((x) => x.color));
    expect(palette.every((c) => ['#787B86', '#00e908', 'rgb(255, 0, 0)'].includes(c as string))).toBe(true);
    expect(palette.length).toBe(3);
  });
});

describe('h-infinity-volatility-filter', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(hinf)).toEqual([
      ['alert0', 'Bullish Trend', 'H∞ Filter: Bullish Trend Detected'],
      ['alert1', 'Bearish Trend', 'H∞ Filter: Bearish Trend Detected'],
    ]);
    expect(hinf.HInfinityVolatilityFilter.alertConditions).toBe(hinf.alertConditions);
  });
  it('fires when the trend of the filter crosses 0', () => {
    const state = new Array(5).fill(close[0]);
    const error = new Array(5).fill(1);
    const filt = close.map((p) => {
      for (let k = 0; k < 5; k++) {
        const e = error[k] + 0.02, g = e / (e + 3);
        state[k] += g * (p - state[k]);
        error[k] = (1 - g) * e;
      }
      return state[0];
    });
    expect(close6(filt, vals(hinf.calculate(bars).plots.plot0 as { value: number }[]))).toBe(true);
    let tr = NaN;
    const trend = filt.map((v, i) => (tr = i > 0 && gt(v, filt[i - 1]) ? 1 : i > 0 && lt(v, filt[i - 1]) ? -1 : tr));
    const r = hinf.calculate(bars);
    [xover(trend, 0), xunder(trend, 0)].forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
  });
});
