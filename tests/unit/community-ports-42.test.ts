/**
 * Community ports, batch 42: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression, or from the outputs that draw the
 * same condition), the alert() calls, and the Style ids on the emitted markers and background colours.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, color, type Bar } from 'oakscriptjs';
import * as adxEma from '../../src/community/trend-with-adx-ema-buy-sell-signals';
import * as cylinder from '../../src/community/trendcylinder';
import * as jd from '../../src/community/trendlines-jd';
import * as twb from '../../src/community/trendlines-with-breaks';
import * as trendshift from '../../src/community/trendshift';
import * as trendsync from '../../src/community/trendsync-buy-sell-by-simply-dante-fx';
import * as trendwave from '../../src/community/trendwave-bands';
import * as tmo from '../../src/community/triangular-momentum-osc';
import * as doji from '../../src/community/triple-doji-sequence';
import * as gauss from '../../src/community/triple-gaussian-smoothed-ribbon';
import * as trsi from '../../src/community/triple-rsi-misinkomaster';
import * as ttm from '../../src/community/ttm-squeeze-pro';
import * as ttrades from '../../src/community/ttrades-daily-bias';
import * as tweezers from '../../src/community/tweezers-kangaroo-tail';
import * as trf from '../../src/community/twin-range-filter';
import * as trfv from '../../src/community/twin-range-filter-visualized';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'trend-with-adx-ema-buy-sell-signals': [
    ['alert0', 'Trend Green Alert', 'Trend Green Alert'],
    ['alert1', 'Trend Red Alert', 'Trend Red Alert'],
    ['alert2', 'Buy Alert', 'Buy Alert'],
    ['alert3', 'Sell Alert', 'Sell Alert'],
  ],
  trendcylinder: [
    ['alert0', 'Bullish Trend Shift', 'Trend Cylinder: Bullish trend shift detected'],
    ['alert1', 'Bearish Trend Shift', 'Trend Cylinder: Bearish trend shift detected'],
  ],
  'trendlines-jd': [
    ['alert0', 'trendline break', 'trendline break: {{close}}'],
    ['alert1', 'trendline break up', 'trendline break up: {{close}}'],
    ['alert2', 'trendline break down', 'trendline break down: {{close}}'],
  ],
  'trendlines-with-breaks': [
    ['alert0', 'Upward Breakout', 'Price broke the down-trendline upward'],
    ['alert1', 'Downward Breakout', 'Price broke the up-trendline downward'],
  ],
  'trendsync-buy-sell-by-simply-dante-fx': [
    ['alert0', 'Unified Buy/Sell Alert', 'Unified Signal Triggered (Buy/Sell)'],
  ],
  'triple-gaussian-smoothed-ribbon': [
    ['alert0', 'Bullish Signal', 'Alert Fired!'],
    ['alert1', 'Bearish Signal', 'Alert Fired!'],
  ],
  'ttrades-daily-bias': [
    ['alert0', 'Bias PDH', 'Bias PDH'],
    ['alert1', 'Bias PDL', 'Bias PDL'],
    ['alert2', 'No Daily Bias', 'No Daily Bias'],
    ['alert3', 'Bias PWH', 'Bias PWH'],
    ['alert4', 'Bias PWL', 'Bias PWL'],
    ['alert5', 'No Weekly Bias', 'No Weekly Bias'],
    ['alert6', 'Hit PDH', 'Hit PDH'],
    ['alert7', 'Hit PDL', 'Hit PDL'],
    ['alert8', 'Hit PWH', 'Hit PWH'],
    ['alert9', 'Hit PWL', 'Hit PWL'],
  ],
  'tweezers-kangaroo-tail': [
    ['alert0', 'Kangaroo Tail Bearish', 'Kangaroo Tail Bearish'],
    ['alert1', 'Kangaroo Tail Bullish', 'Kangaroo Tail Bullish'],
    ['alert2', 'Tweezers Bearish', 'Tweezers Bearish'],
    ['alert3', 'Tweezers Bullish', 'Tweezers Bullish'],
  ],
  'twin-range-filter': [
    ['alert0', 'Long', 'Long'],
    ['alert1', 'Short', 'Short'],
  ],
  'twin-range-filter-visualized': [
    ['alert0', 'Long', 'Long'],
    ['alert1', 'Short', 'Short'],
  ],
};

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of bars with a random volume */
function walk(count: number, seed0: number, step = 86400, start = 1577836800, vol = 4): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * vol);
    const volume = 1e6 * (0.3 + rnd());
    out.push({ time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1200, 42);
const n = bars.length;
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));
const S = (a: number[], list: Bar[] = bars) => Series.fromArray(list, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
type M = { time: unknown; id?: string; text?: string; position?: string; shape?: string; price?: number; color?: string; size?: string };
const idTimes = (ms: M[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);
const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const xOver = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
const xUnder = (a: number[], b: number[], i: number) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];

describe('declarations', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'trend-with-adx-ema-buy-sell-signals': adxEma,
    trendcylinder: cylinder,
    'trendlines-jd': jd,
    'trendlines-with-breaks': twb,
    'trendsync-buy-sell-by-simply-dante-fx': trendsync,
    'triple-gaussian-smoothed-ribbon': gauss,
    'ttrades-daily-bias': ttrades,
    'tweezers-kangaroo-tail': tweezers,
    'twin-range-filter': trf,
    'twin-range-filter-visualized': trfv,
  };
  for (const [id, m] of Object.entries(mods)) {
    it(`${id}: the original's alertconditions`, () => expect(decls(m)).toEqual(SPEC[id]));
  }
  it('the indicator objects carry the new exports', () => {
    expect(adxEma.TrendWithAdxEmaBuySellSignals.alertConditions).toBe(adxEma.alertConditions);
    expect(cylinder.TrendCylinder.alertConditions).toBe(cylinder.alertConditions);
    expect(jd.TrendlinesJd.alertConditions).toBe(jd.alertConditions);
    expect(twb.TrendlinesWithBreaks.alertConditions).toBe(twb.alertConditions);
    expect(trendsync.TrendsyncBuySell.alertConditions).toBe(trendsync.alertConditions);
    expect(gauss.TripleGaussianSmoothedRibbon.alertConditions).toBe(gauss.alertConditions);
    expect(ttrades.TtradesDailyBias.alertConditions).toBe(ttrades.alertConditions);
    expect(ttrades.hasAlertFunction).toBe(true);
    expect(ttrades.TtradesDailyBias.hasAlertFunction).toBe(true);
    expect(tweezers.TweezersKangarooTail.alertConditions).toBe(tweezers.alertConditions);
    expect(trf.TwinRangeFilter.alertConditions).toBe(trf.alertConditions);
    expect(trfv.TwinRangeFilterVisualized.alertConditions).toBe(trfv.alertConditions);
    expect(ttm.hasAlertFunction).toBe(true);
    expect(ttm.TTMSqueezePro.hasAlertFunction).toBe(true);
  });
});

describe('Trend with ADX - Buy & Sell', () => {
  const r = adxEma.calculate(bars);
  const nz = (v: number) => (Number.isNaN(v) ? 0 : v);
  const tr = bars.map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - nz(i > 0 ? close[i - 1] : NaN)), Math.abs(b.low - nz(i > 0 ? close[i - 1] : NaN))));
  const ph = (i: number) => nz(i > 0 ? high[i - 1] : NaN);
  const pl = (i: number) => nz(i > 0 ? low[i - 1] : NaN);
  const dmp = bars.map((b, i) => (b.high - ph(i) > pl(i) - b.low ? Math.max(b.high - ph(i), 0) : 0));
  const dmm = bars.map((b, i) => (pl(i) - b.low > b.high - ph(i) ? Math.max(pl(i) - b.low, 0) : 0));
  const str = A(ta.rma(S(tr), 14));
  const sp = A(ta.rma(S(dmp), 14));
  const sm = A(ta.rma(S(dmm), 14));
  const diP = sp.map((v, i) => (v / str[i]) * 100);
  const diM = sm.map((v, i) => (v / str[i]) * 100);
  const e1 = A(ta.ema(S(close), 5));
  const e2 = A(ta.ema(S(close), 8));
  const buy: boolean[] = [], sell: boolean[] = [];
  let ci = NaN;
  for (let i = 0; i < n; i++) {
    const lc = xOver(e1, e2, i), sc = xUnder(e1, e2, i);
    const prev = ci;
    ci = lc ? 1 : sc ? -1 : prev;
    buy.push(lc && prev === -1);
    sell.push(sc && prev === 1);
  }
  it('Trend Green / Red on +DI above / below -DI', () => {
    expect(times(r, 0)).toEqual(timeAt(bars, diP.map((v, i) => gt(v, diM[i]))));
    expect(times(r, 1)).toEqual(timeAt(bars, diM.map((v, i) => gt(v, diP[i]))));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });
  it('Buy / Sell alerts: EMA cross after the opposite cross, on the label bars', () => {
    expect(times(r, 2)).toEqual(timeAt(bars, buy));
    expect(times(r, 3)).toEqual(timeAt(bars, sell));
    expect(times(r, 2).length).toBeGreaterThan(0);
    expect(times(r, 2)).toEqual(uniq((r.markers as M[]).filter((m) => m.text === 'Buy').map((m) => m.time as number)));
    expect(times(r, 3)).toEqual(uniq((r.markers as M[]).filter((m) => m.text === 'Sell').map((m) => m.time as number)));
  });
});

describe('Trend Cylinder', () => {
  // Calm walk, then alternating jumps of the close (the trend line follows each jump)
  const list = walk(700, 7, 86400, 1577836800, 1);
  for (let k = 0; k < 6; k++) {
    const last = list[list.length - 1];
    const c = last.close + (k % 2 === 0 ? 60 : -60);
    list.push({ time: (last.time as number) + 86400, open: last.close, high: Math.max(last.close, c) + 0.5, low: Math.min(last.close, c) - 0.5, close: c, volume: 1e6 });
  }
  const r = cylinder.calculate(list);
  // Independent loop of the original: currentTrend, trendDirection, isBullishTrend / isBearishTrend
  const atr = A(ta.rma(ta.atr(list, 200), 10));
  let cur = 0, argPrev = NaN;
  const trend: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const sd = (Number.isNaN(atr[i]) ? 0 : atr[i]) * 9;
    const d = cur - argPrev;
    const dir = gt(d, 0) ? 1 : lt(d, 0) ? -1 : 0;
    argPrev = cur;
    const diff = Math.abs(list[i].close - cur);
    cur = gt(diff, sd * 0.7) ? (list[i].close + cur) / 2 : dir * (sd * (1 / 9)) / Math.pow(2, 100) + cur;
    trend.push(cur);
  }
  const bull = trend.map((v, i) => i > 0 && gt(v, trend[i - 1]));
  const bear = trend.map((v, i) => i > 0 && lt(v, trend[i - 1]));
  const bullShift = bull.map((v, i) => v && i > 0 && bear[i - 1]);
  const bearShift = bear.map((v, i) => v && i > 0 && bull[i - 1]);
  it('Bullish / Bearish Trend Shift: a rise after a fall / a fall after a rise of the trend line', () => {
    expect(times(r, 0)).toEqual(timeAt(list, bullShift));
    expect(times(r, 1)).toEqual(timeAt(list, bearShift));
    const tail = list.slice(-5).map((b) => b.time as number);
    // the crafted jumps alternate: shifts on the last bars
    expect(times(r, 0).filter((t) => tail.includes(t)).length).toBeGreaterThan(0);
    expect(times(r, 1).filter((t) => tail.includes(t)).length).toBeGreaterThan(0);
  });
});

describe('Trendlines - JD', () => {
  it('break alerts on the bars of the break triangles / bar colours, whatever "show trendline breaks"', () => {
    for (const inp of [{}, { len: 10 }, { len: 14, trendlineCheckNr: 3, dispSelect: false }]) {
      const r = jd.calculate(bars, inp);
      const ms = r.markers as M[];
      const up = uniq(ms.filter((m) => m.position === 'belowBar').map((m) => m.time as number));
      const dn = uniq(ms.filter((m) => m.position === 'aboveBar').map((m) => m.time as number));
      expect(times(r, 1)).toEqual(up);
      expect(times(r, 2)).toEqual(dn);
      expect(times(r, 0)).toEqual(uniq(r.barColors.map((b) => b.time as number)));
      const off = jd.calculate(bars, { ...inp, doAlerts: false });
      expect(off.markers).toEqual([]);
      expect(off.alerts).toEqual(r.alerts);
    }
    const r = jd.calculate(bars, { len: 10 });
    expect(times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 2).length).toBeGreaterThan(0);
  });
});

describe('Trendlines with Breaks', () => {
  it('Upward / Downward Breakout on the B labels (after the warm-up the port draws)', () => {
    for (const inp of [{}, { length: 7 }]) {
      const r = twb.calculate(bars, inp);
      const warm = 2 * (inp.length ?? 14);
      const late = (t: number) => bars.findIndex((b) => b.time === t) > warm;
      const ms = r.markers as M[];
      expect(times(r, 0).filter(late)).toEqual(ms.filter((m) => m.shape === 'labelUp').map((m) => m.time as number));
      expect(times(r, 1).filter(late)).toEqual(ms.filter((m) => m.shape === 'labelDown').map((m) => m.time as number));
      expect(times(r, 0).length).toBeGreaterThan(0);
      expect(times(r, 1).length).toBeGreaterThan(0);
    }
  });
});

describe('Trendshift (Style ids)', () => {
  it('discount tint = bgcolor0, premium tint = bgcolor1', () => {
    const r = trendshift.calculate(bars);
    expect(r.bgColors.length).toBeGreaterThan(0);
    const discount = 'bgcolor0', premium = 'bgcolor1';
    const ids = new Set(r.bgColors.map((b) => b.id));
    expect(ids).toEqual(new Set([discount, premium]));
    const colorOf = (id: string) => new Set(r.bgColors.filter((b) => b.id === id).map((b) => b.color));
    expect(colorOf(discount).size).toBe(1);
    expect(colorOf(premium).size).toBe(1);
    expect([...colorOf(discount)][0]).not.toBe([...colorOf(premium)][0]);
  });
});

describe('TrendSync Buy/Sell', () => {
  const inputs = { smaLength: 50, rangeThreshold: 1.0 };
  const r = trendsync.calculate(bars, inputs);
  const sma = A(ta.sma(S(close), 50));
  const atr = A(ta.atr(bars, 14));
  const rsi = A(ta.rsi(S(close), 14));
  const hh = A(ta.highest(S(bars.map((_b, i) => (i > 0 ? high[i - 1] : NaN))), 3));
  const ll = A(ta.lowest(S(bars.map((_b, i) => (i > 0 ? low[i - 1] : NaN))), 3));
  const sig = (k: number) => bars.map((b, i) => {
    const rf = gt(b.high - b.low, atr[i]);
    const up = gt(b.close, sma[i]), dn = gt(sma[i], b.close);
    return [
      up && gt(b.low, ll[i]) && rf && gt(rsi[i], 50),
      up && gt(b.high, hh[i]) && rf && gt(50, rsi[i]),
      dn && gt(ll[i], b.low) && rf && gt(rsi[i], 50),
      dn && gt(hh[i], b.high) && rf && gt(50, rsi[i]),
    ][k];
  });
  const first = (f: boolean[]) => f.map((v, i) => v && !(i > 0 && f[i - 1]));
  const [b1, s1, b2, s2] = [0, 1, 2, 3].map((k) => first(sig(k)));
  it('Unified alert on every first buy / sell bar', () => {
    const unified = bars.map((_b, i) => b1[i] || s1[i] || b2[i] || s2[i]);
    expect(times(r, 0)).toEqual(timeAt(bars, unified));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(uniq((r.markers as M[]).map((m) => m.time as number)));
  });
});

describe('TrendWave Bands (Style ids)', () => {
  it('trend circles carry shape0..shape3 (up tiny / up small / down tiny / down small)', () => {
    const r = trendwave.calculate(bars, { length: 20 });
    const ms = r.markers as M[];
    expect(ms.length).toBeGreaterThan(0);
    const { colUp, colDn } = trendwave.defaultInputs;
    const want: Record<string, string> = {
      [colUp]: 'shape0', [String(color.new(colUp, 70))]: 'shape1', [colDn]: 'shape2', [String(color.new(colDn, 70))]: 'shape3',
    };
    for (const m of ms) expect(m.id).toBe(want[m.color!]);
    expect(idTimes(ms, 'shape0')).toEqual(idTimes(ms, 'shape1'));
    expect(idTimes(ms, 'shape2')).toEqual(idTimes(ms, 'shape3'));
    expect(idTimes(ms, 'shape0').length).toBeGreaterThan(0);
    expect(idTimes(ms, 'shape2').length).toBeGreaterThan(0);
  });
});

describe('Triangular Momentum Oscillator (Style ids)', () => {
  it('bullish circle / bearish circle / Buy label / Sell label = shape0 / shape1 / shape2 / shape3', () => {
    const r = tmo.calculate(bars);
    const ms = r.markers as M[];
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) {
      const want = m.shape === 'circle' ? (m.color === '#00c42b' ? 'shape0' : 'shape1') : m.shape === 'labelUp' ? 'shape2' : 'shape3';
      expect(m.id).toBe(want);
    }
    expect(idTimes(ms, 'shape0')).toEqual(idTimes(ms, 'shape2'));
    expect(idTimes(ms, 'shape1')).toEqual(idTimes(ms, 'shape3'));
  });
});

describe('Triple Doji Sequence (Style ids)', () => {
  it('sell stars = char0, buy stars = char1', () => {
    const r = doji.calculate(bars, { dominantWickMultiple: 1.2, bodyMultiple: 1.5, recessiveWickMultiple: 1.5 });
    const ms = r.markers as M[];
    expect(idTimes(ms, 'char0').length).toBeGreaterThan(0);
    expect(idTimes(ms, 'char1').length).toBeGreaterThan(0);
    for (const m of ms) expect(m.id).toBe(m.position === 'aboveBar' ? 'char0' : 'char1');
  });
});

describe('Triple Gaussian Smoothed Ribbon', () => {
  it('Bullish / Bearish Signal on the bars of the triangles', () => {
    for (const inp of [{}, { minSeparation: 0 }]) {
      const r = gauss.calculate(bars, inp);
      const ms = r.markers as M[];
      expect(times(r, 0)).toEqual(ms.filter((m) => m.shape === 'triangleUp').map((m) => m.time as number));
      expect(times(r, 1)).toEqual(ms.filter((m) => m.shape === 'triangleDown').map((m) => m.time as number));
      expect(times(r, 0).length).toBeGreaterThan(0);
      expect(times(r, 1).length).toBeGreaterThan(0);
    }
  });
  it('consolidation filter: a higher minimum separation removes signals', () => {
    const all = gauss.calculate(bars, { minSeparation: 0 });
    const few = gauss.calculate(bars, { minSeparation: 0.2 });
    expect(times(few, 0).every((t) => times(all, 0).includes(t))).toBe(true);
    expect(times(few, 0).length + times(few, 1).length).toBeLessThan(times(all, 0).length + times(all, 1).length);
  });
});

describe('Triple RSI (Style ids)', () => {
  it('pane background = bgcolor0, price pane background (force_overlay) = bgcolor1', () => {
    const r = trsi.calculate(bars);
    expect(r.bgColors.length).toBeGreaterThan(0);
    for (const b of r.bgColors) expect(b.id).toBe((b as { forceOverlay?: boolean }).forceOverlay ? 'bgcolor1' : 'bgcolor0');
    expect(idTimes(r.bgColors as M[], 'bgcolor0')).toEqual(idTimes(r.bgColors as M[], 'bgcolor1'));
  });
});

describe('TTM Squeeze Pro (alert() calls)', () => {
  const sma = A(ta.sma(S(close), 20));
  const sd = A(ta.stdev(S(close), 20));
  const tr = bars.map((b, i) => (i > 0 ? Math.max(b.high - b.low, Math.abs(b.high - close[i - 1]), Math.abs(b.low - close[i - 1])) : NaN));
  const dev = A(ta.sma(S(tr), 20));
  const noSqz = bars.map((_b, i) => lt(sma[i] - 2 * sd[i], sma[i] - dev[i] * 2) || gt(sma[i] + 2 * sd[i], sma[i] + dev[i] * 2));
  const expected = (start: boolean, fire: boolean) => {
    const out: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      const p = i > 0 && noSqz[i - 1];
      if (start && p && !noSqz[i]) out.push({ time: b.time as number, message: 'Squeeze Started', freq: 'once_per_bar' });
      else if (fire && noSqz[i] && !p) out.push({ time: b.time as number, message: 'Squeeze Fired', freq: 'once_per_bar' });
    });
    return out;
  };
  it('Squeeze Started / Squeeze Fired on the changes of the no-squeeze state', () => {
    const r = ttm.calculate(bars);
    expect(r.alertCalls).toEqual(expected(true, true));
    expect(r.alertCalls.filter((c) => c.message === 'Squeeze Started').length).toBeGreaterThan(0);
    expect(r.alertCalls.filter((c) => c.message === 'Squeeze Fired').length).toBeGreaterThan(0);
  });
  it('the two inputs switch the calls off', () => {
    expect(ttm.calculate(bars, { detectSqzStart: false }).alertCalls).toEqual(expected(false, true));
    expect(ttm.calculate(bars, { detectSqzFire: false }).alertCalls).toEqual(expected(true, false));
    expect(ttm.calculate(bars, { detectSqzStart: false, detectSqzFire: false }).alertCalls).toEqual([]);
  });
});

describe('TTrades Daily Bias', () => {
  // Hourly bars, UTC calendar (no chart context)
  const hourly = walk(1500, 11, 3600, 1577836800, 1.5);
  const r = ttrades.calculate(hourly, { wStats: true });
  const day = (t: number) => Math.floor(t / 86400);
  // the weeks of the calendar start on Monday 00:00 UTC (1970-01-01 is a Thursday)
  const week = (t: number) => Math.floor((t / 86400 + 3) / 7);
  const newDay = hourly.map((b, i) => i > 0 && day(b.time as number) !== day(hourly[i - 1].time as number));
  const newWeek = hourly.map((b, i) => i > 0 && week(b.time as number) !== week(hourly[i - 1].time as number));
  const dBias = r.plots.plot0.map((p) => p.value);
  const wBias = r.plots.plot1.map((p) => p.value);
  const ms = r.markers as M[];
  it('bias alerts on the first bar of the day / week, by the bias of the new period', () => {
    expect(times(r, 0)).toEqual(timeAt(hourly, newDay.map((v, i) => v && dBias[i] === 1)));
    expect(times(r, 1)).toEqual(timeAt(hourly, newDay.map((v, i) => v && dBias[i] === -1)));
    expect(times(r, 2)).toEqual(timeAt(hourly, newDay.map((v, i) => v && dBias[i] === 0)));
    expect(times(r, 3)).toEqual(timeAt(hourly, newWeek.map((v, i) => v && wBias[i] === 1)));
    expect(times(r, 4)).toEqual(timeAt(hourly, newWeek.map((v, i) => v && wBias[i] === -1)));
    expect(times(r, 5)).toEqual(timeAt(hourly, newWeek.map((v, i) => v && wBias[i] === 0)));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 3).length + times(r, 4).length).toBeGreaterThan(0);
  });
  it('hit alerts on the bars of the raid triangles (shape0..shape3)', () => {
    [6, 7, 8, 9].forEach((k, j) => {
      expect(times(r, k)).toEqual(idTimes(ms, `shape${j}`));
      expect(times(r, k).length).toBeGreaterThan(0);
    });
  });
  it('No Daily Bias fires on each new day when the daily bias is off (bias stays 0)', () => {
    const off = ttrades.calculate(hourly, { dStats: false });
    expect(times(off, 2)).toEqual(timeAt(hourly, newDay));
    expect(times(off, 0)).toEqual([]);
  });
  it('alert() calls: Bias P<D|W>H / L on new periods with a bias, Hit P<D|W>H / L on the hits', () => {
    const exp: { time: number; message: string; freq: string }[] = [];
    hourly.forEach((b, i) => {
      const t = b.time as number;
      const add = (m: string) => exp.push({ time: t, message: m, freq: 'once_per_bar' });
      if (newDay[i] && dBias[i] === 1) add('Bias PDH');
      if (newDay[i] && dBias[i] === -1) add('Bias PDL');
      if (idTimes(ms, 'shape0').includes(t)) add('Hit PDH');
      if (idTimes(ms, 'shape1').includes(t)) add('Hit PDL');
      if (newWeek[i] && wBias[i] === 1) add('Bias PWH');
      if (newWeek[i] && wBias[i] === -1) add('Bias PWL');
      if (idTimes(ms, 'shape2').includes(t)) add('Hit PWH');
      if (idTimes(ms, 'shape3').includes(t)) add('Hit PWL');
    });
    expect(r.alertCalls).toEqual(exp);
  });
  it('Style ids: raids shape0..shape3, daily bias squares shape4 (top), weekly shape5 (bottom)', () => {
    for (const m of ms) expect(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']).toContain(m.id);
    for (const m of ms.filter((x) => x.shape === 'square')) expect(m.id).toBe(m.position === 'top' ? 'shape4' : 'shape5');
    expect(idTimes(ms, 'shape4').length).toBeGreaterThan(0);
    expect(idTimes(ms, 'shape5').length).toBeGreaterThan(0);
  });
});

describe('Tweezers and Kangaroo Tail', () => {
  it('the 4 conditions on the bars of their K / T labels', () => {
    let kTop = 0, kBottom = 0;
    for (const inp of [{}, { atrMult: 2, kangMinPrd: 2, wickMult: 1.5, wickMultAvg: 1 }]) {
      const r = tweezers.calculate(bars, inp);
      const ms = r.markers as M[];
      const of = (text: string, pos: string) => ms.filter((m) => m.text === text && m.position === pos).map((m) => m.time as number);
      expect(times(r, 0)).toEqual(of('K', 'aboveBar'));
      expect(times(r, 1)).toEqual(of('K', 'belowBar'));
      expect(times(r, 2)).toEqual(of('T', 'aboveBar'));
      expect(times(r, 3)).toEqual(of('T', 'belowBar'));
      expect(times(r, 2).length).toBeGreaterThan(0);
      expect(times(r, 3).length).toBeGreaterThan(0);
      kTop += times(r, 0).length;
      kBottom += times(r, 1).length;
    }
    expect(kTop + kBottom).toBeGreaterThan(0);
  });
});

describe('Twin Range Filter', () => {
  it("Long / Short with the original's conditions on the original's range filter", () => {
    const r = trf.calculate(bars);
    // the original draws only the labels (no filter line)
    expect(r.plots).toEqual({});
    /** ta.ema: na until the length-th value, seeded with the mean of the first ones */
    const ema = (x: number[], len: number) => {
      const out: number[] = [];
      let cnt = 0, sum = 0, prev = NaN;
      for (const v of x) {
        if (Number.isNaN(v)) { out.push(NaN); continue; }
        if (Number.isNaN(prev)) { cnt++; sum += v; if (cnt === len) prev = sum / len; } else prev = (2 / (len + 1)) * v + (1 - 2 / (len + 1)) * prev;
        out.push(prev);
      }
      return out;
    };
    // smoothrng(x, t, m) = ema(ema(abs(x - x[1]), t), 2 t - 1) * m; smrng = average of the fast / slow ranges
    const absChg = close.map((v, i) => (i > 0 ? Math.abs(v - close[i - 1]) : NaN));
    const sm = (t: number, m: number) => ema(ema(absChg, t), 2 * t - 1).map((v) => v * m);
    const s1 = sm(27, 1.6), s2 = sm(55, 2);
    const rng = s1.map((v, i) => (v + s2[i]) / 2);
    // rngfilt(x, r): x > nz(rngfilt[1]) ? max(nz(rngfilt[1]), x - r) : min(nz(rngfilt[1]), x + r) (na while r is na)
    const filt: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = i > 0 && !Number.isNaN(filt[i - 1]) ? filt[i - 1] : 0;
      const x = close[i], rr = rng[i];
      const v = x > p ? (x - rr < p ? p : x - rr) : (x + rr > p ? p : x + rr);
      filt.push(Number.isFinite(v) ? v : NaN);
    }
    let up = 0, dn = 0, ci = NaN;
    const longF: boolean[] = [], shortF: boolean[] = [];
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        up = filt[i] > filt[i - 1] ? up + 1 : filt[i] < filt[i - 1] ? 0 : up;
        dn = filt[i] < filt[i - 1] ? dn + 1 : filt[i] > filt[i - 1] ? 0 : dn;
      }
      const c1 = i > 0 ? close[i - 1] : NaN;
      const lc = (close[i] > filt[i] && close[i] > c1 && up > 0) || (close[i] > filt[i] && close[i] < c1 && up > 0);
      const sc = (close[i] < filt[i] && close[i] < c1 && dn > 0) || (close[i] < filt[i] && close[i] > c1 && dn > 0);
      longF.push(lc && ci === -1);
      shortF.push(sc && ci === 1);
      ci = lc ? 1 : sc ? -1 : ci;
    }
    expect(times(r, 0)).toEqual(timeAt(bars, longF));
    expect(times(r, 1)).toEqual(timeAt(bars, shortF));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    // the Long / Short labels are on the alert bars
    expect((r.markers as M[]).filter((m) => m.text === 'Long').map((m) => m.time as number)).toEqual(times(r, 0));
    expect((r.markers as M[]).filter((m) => m.text === 'Short').map((m) => m.time as number)).toEqual(times(r, 1));
  });
});

describe('Twin Range Filter Visualized', () => {
  it('Long / Short on the crosses of the close and the line, whatever Show signals', () => {
    for (const inp of [{}, { showsignals: false }]) {
      const r = trfv.calculate(bars, inp);
      const line = r.plots.plot0.map((p) => p.value as number);
      expect(times(r, 0)).toEqual(timeAt(bars, bars.map((_b, i) => xOver(close, line, i))));
      expect(times(r, 1)).toEqual(timeAt(bars, bars.map((_b, i) => xUnder(close, line, i))));
      expect(times(r, 0).length).toBeGreaterThan(0);
      expect(times(r, 1).length).toBeGreaterThan(0);
    }
    const shown = trfv.calculate(bars);
    expect(times(shown, 0)).toEqual((shown.markers as M[]).filter((m) => m.text === 'BUY').map((m) => m.time as number));
    expect(times(shown, 1)).toEqual((shown.markers as M[]).filter((m) => m.text === 'SELL').map((m) => m.time as number));
  });
});
