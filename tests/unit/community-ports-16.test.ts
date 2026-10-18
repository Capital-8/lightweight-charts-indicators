/**
 * Alerts and Style ids of 16 community ports (batch 16): the alertcondition() declarations (ids, titles and messages
 * of the originals), the bars on which each condition is true (re-computed here from the original's expression), the
 * alert() calls (bars, messages, frequency), and the Style-settings ids on the emitted markers, background colours,
 * fills and candles.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, str, type Bar } from 'oakscriptjs';
import * as halfTrend from '../../src/community/half-trend';
import * as hapMacd from '../../src/community/hap-macd';
import * as hpd from '../../src/community/harmonic-pattern-detection';
import * as hpdp from '../../src/community/harmonic-pattern-detection-prediction-and';
import * as hpm from '../../src/community/harmonic-periodicity-matrix';
import * as sniper from '../../src/community/harmonic-sniper-trigger-pyratime';
import * as harsi from '../../src/community/harsi-cbc';
import * as hash from '../../src/community/hash-ribbons';
import * as heatmap from '../../src/community/heatmap-volume';
import * as haRev from '../../src/community/heikin-ashi-reversals-with-region-dots';
import * as haRsi from '../../src/community/heikin-ashi-rsi-oscillator';
import * as hema from '../../src/community/hema-trend-levels';
import * as hwma from '../../src/community/henderson-weighted-moving-average';
import * as hoob from '../../src/community/higher-order-orderblocks-breakerblocks-range';
import * as hmaB from '../../src/community/hma-breakdown';
import * as hott from '../../src/community/hott-lott';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of daily bars with a random volume (spikes on 5 % of the bars) */
function walk(count: number, seed0: number, start = 1577836800): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: start + i * 86400, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1200, 7);
const n = bars.length;
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const markerIds = (r: { markers: { id?: string }[] }) => [...new Set(r.markers.map((m) => m.id))];

/** Independent crossover / crossunder (na = NaN compares false) */
const over = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const under = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);
/** Rolling window helpers (na before the window is full) */
const roll = (src: number[], len: number, f: (w: number[]) => number) =>
  src.map((_, i) => (i < len - 1 ? NaN : f(src.slice(i - len + 1, i + 1))));
const sma = (src: number[], len: number) => roll(src, len, (w) => w.reduce((s, v) => s + v, 0) / len);
const wma = (src: number[], len: number) =>
  roll(src, len, (w) => w.reduce((s, v, k) => s + v * (k + 1), 0) / ((len * (len + 1)) / 2));
const stdev = (src: number[], len: number) => roll(src, len, (w) => {
  const m = w.reduce((s, v) => s + v, 0) / len;
  return Math.sqrt(w.reduce((s, v) => s + (v - m) * (v - m), 0) / len);
});
/** EMA seeded with the SMA of the first full window */
function ema(src: number[], len: number): number[] {
  const out: number[] = [];
  const alpha = 2 / (len + 1);
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(prev)) {
      let ok = i >= len - 1;
      let s = 0;
      for (let k = i - len + 1; ok && k <= i; k++) {
        if (isNaN(src[k])) ok = false;
        else s += src[k];
      }
      prev = ok ? s / len : NaN;
    } else {
      prev = alpha * src[i] + (1 - alpha) * prev;
    }
    out.push(prev);
  }
  return out;
}

describe('half-trend', () => {
  const r = halfTrend.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(halfTrend)).toEqual([
      ['alert0', 'HalfTrend Buy', 'HalfTrend Buy, {{exchange}}:{{ticker}}'],
      ['alert1', 'HalfTrend Sell', 'HalfTrend Sell, {{exchange}}:{{ticker}}'],
    ]);
    expect(halfTrend.HalfTrend.alertConditions).toBe(halfTrend.alertConditions);
  });
  it('fires on the trend flips (from the first bar with an ATR)', () => {
    const amp = 2;
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const highma = sma(highs, amp);
    const lowma = sma(lows, amp);
    const atr = ta.atr(bars, 100).toArray();
    let trend = 0, next = 0, maxLow = bars[0].low, minHigh = bars[0].high;
    const trendArr: number[] = [];
    for (let i = 0; i < n; i++) {
      let hb = 0, lb = 0;
      if (i >= amp - 1) {
        for (let k = 1; k < amp; k++) {
          if (highs[i - k] > highs[i - hb]) hb = k;
          if (lows[i - k] < lows[i - lb]) lb = k;
        }
      }
      const highPrice = highs[i - hb];
      const lowPrice = lows[i - lb];
      const hma = isNaN(highma[i]) ? highs[i] : highma[i];
      const lma = isNaN(lowma[i]) ? lows[i] : lowma[i];
      const prevLow = i > 0 ? lows[i - 1] : lows[i];
      const prevHigh = i > 0 ? highs[i - 1] : highs[i];
      if (next === 1) {
        maxLow = Math.max(lowPrice, maxLow);
        if (hma < maxLow && close[i] < prevLow) { trend = 1; next = 0; minHigh = highPrice; }
      } else {
        minHigh = Math.min(highPrice, minHigh);
        if (lma > minHigh && close[i] > prevHigh) { trend = 0; next = 1; maxLow = lowPrice; }
      }
      trendArr.push(trend);
    }
    const hasAtr = (i: number) => atr[i] != null && !isNaN(atr[i] as number);
    const buy = trendArr.map((t, i) => i > 0 && hasAtr(i) && t === 0 && trendArr[i - 1] === 1);
    const sell = trendArr.map((t, i) => i > 0 && hasAtr(i) && t === 1 && trendArr[i - 1] === 0);
    expect(buy.filter(Boolean).length).toBeGreaterThan(5);
    expect(sell.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
  });
});

describe('hap-macd', () => {
  const r = hapMacd.calculate(bars);
  it('gives the dots the ids of their plotshape outputs', () => {
    expect(r.markers.length).toBeGreaterThan(0);
    // dots (shape0), exit dots (shape1) and the MACD / signal cross triangles (shape2 / shape3, hidden by default)
    expect(markerIds(r).sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    // the exit dot (shape1) is red, on the bar after the last dot of a run
    for (const m of r.markers.filter((m) => m.id === 'shape1')) expect(m.color).toBe('#F23645');
    for (const m of r.markers.filter((m) => m.id === 'shape2')) expect(m.shape).toBe('triangleUp');
    for (const m of r.markers.filter((m) => m.id === 'shape3')) expect(m.shape).toBe('triangleDown');
  });
});

describe('harmonic-pattern-detection', () => {
  const [xi, ai, bi, ci, di] = [300, 330, 360, 390, 430];
  const ms = (i: number) => (bars[i].time as number) * 1000;
  const r = hpd.calculate(bars, { x: ms(xi), a: ms(ai), b: ms(bi), c: ms(ci), d: ms(di) });
  it('declares the alertconditions of the original', () => {
    expect(decls(hpd)).toEqual([
      ['alert0', 'Price Enter PRZ', 'Price entered the PRZ'],
      ['alert1', 'Price Cross D', 'Price crossed point D'],
    ]);
    expect(hpd.HarmonicPatternDetection.alertConditions).toBe(hpd.alertConditions);
  });
  it('fires when the close enters the PRZ and when it crosses D', () => {
    const [xy, ay, cy] = [close[xi], close[ai], close[ci]];
    const dLabel = r.labels.find((l) => l.text === 'D')!;
    const dy = dLabel.price;
    const upper = dy + 0.382 * Math.abs(dy - xy);
    const lower = dy - 0.382 * Math.abs(dy - xy);
    expect(Number.isFinite(dy) && Number.isFinite(ay) && Number.isFinite(cy)).toBe(true);
    // var float upper_prz / lower_prz / d_y: na until the bar of C (the last of X, A, B, C), then fixed
    const up = bars.map((_, i) => (i >= ci ? upper : NaN));
    const lo = bars.map((_, i) => (i >= ci ? lower : NaN));
    const d = bars.map((_, i) => (i >= ci ? dy : NaN));
    const enter = over(close, lo).map((v, i) => v || under(close, up)[i]);
    const cross = over(close, d).map((v, i) => v || under(close, d)[i]);
    expect(enter.some(Boolean) || cross.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, enter));
    expect(r.alerts[1].times).toEqual(timeAt(bars, cross));
  });
  it('fires nothing with the default anchors', () => {
    const r0 = hpd.calculate(bars);
    expect(r0.alerts.map((a) => a.times.length)).toEqual([0, 0]);
  });
});

describe('harmonic-pattern-detection-prediction-and', () => {
  const r = hpdp.calculate(bars);
  const NAME = '(Bullish|Bearish) (Gartley|Bat|Butterfly|Crab|Shark|Cypher)';
  const potential = new RegExp(`^Potential ${NAME} is forming\\.$`);
  const formed = new RegExp(`^${NAME} has formed\\.$`);
  it('declares alert() calls', () => {
    expect(hpdp.hasAlertFunction).toBe(true);
    expect(hpdp.HarmonicPatternDetectionPredictionAnd.hasAlertFunction).toBe(true);
  });
  it('calls alert() once per bar close for potential and complete patterns ("Both")', () => {
    expect(r.alertCalls.length).toBeGreaterThan(0);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    expect(r.alertCalls.every((c) => potential.test(c.message) || formed.test(c.message))).toBe(true);
    expect(r.alertCalls.some((c) => potential.test(c.message))).toBe(true);
    expect(r.alertCalls.some((c) => formed.test(c.message))).toBe(true);
    const times = new Set(bars.map((b) => b.time as number));
    expect(r.alertCalls.every((c) => times.has(c.time))).toBe(true);
  });
  it('keeps only the calls selected by "Alert for"', () => {
    const p = hpdp.calculate(bars, { alertType: 'Potential patterns' });
    const c = hpdp.calculate(bars, { alertType: 'Complete patterns' });
    expect(p.alertCalls).toEqual(r.alertCalls.filter((a) => potential.test(a.message)));
    expect(c.alertCalls).toEqual(r.alertCalls.filter((a) => formed.test(a.message)));
  });
});

describe('harmonic-periodicity-matrix', () => {
  const r = hpm.calculate(bars);
  it('gives the buy / sell circles the ids of their plotshape outputs', () => {
    expect(markerIds(r).sort()).toEqual(['shape0', 'shape1']);
    for (const m of r.markers) expect(m.id === 'shape0' ? m.color === hpm.defaultInputs.upColor : m.color === hpm.defaultInputs.dnColor).toBe(true);
  });
});

describe('harmonic-sniper-trigger-pyratime', () => {
  const r = sniper.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(sniper)).toEqual([
      ['alert0', 'Fisher Buy Signal', 'Fisher Cross UP (Green) - Check for GPM Time Line!'],
      ['alert1', 'Fisher Sell Signal', 'Fisher Cross DOWN (Red) - Check for GPM Time Line!'],
    ]);
    expect(sniper.HarmonicSniperTriggerPyratime.alertConditions).toBe(sniper.alertConditions);
  });
  it('fires on the crosses of the fisher and its trigger', () => {
    const len = 9;
    const hh = roll(bars.map((b) => b.high), len, (w) => Math.max(...w));
    const ll = roll(bars.map((b) => b.low), len, (w) => Math.min(...w));
    const nz = (x: number) => (Number.isFinite(x) ? x : 0);
    const fish: number[] = [];
    let pv = NaN, pf = NaN;
    for (let i = 0; i < n; i++) {
      const hl2 = (bars[i].high + bars[i].low) / 2;
      let v = 0.66 * ((hl2 - ll[i]) / (hh[i] - ll[i]) - 0.5) + 0.67 * nz(pv);
      v = gt(v, 0.99) ? 0.999 : lt(v, -0.99) ? -0.999 : v;
      const f = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * nz(pf);
      fish.push(f);
      pv = v;
      pf = f;
    }
    const trig = fish.map((_, i) => (i > 0 ? fish[i - 1] : NaN));
    const up = over(fish, trig);
    const dn = under(fish, trig);
    expect(up.filter(Boolean).length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(timeAt(bars, up));
    expect(r.alerts[1].times).toEqual(timeAt(bars, dn));
  });
});

describe('harsi-cbc', () => {
  const r = harsi.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(harsi)).toEqual([
      ['alert0', 'Bears', 'Bears in Control'],
      ['alert1', 'Bulls', 'Bulls in Control'],
    ]);
    expect(harsi.HarsiCbc.alertConditions).toBe(harsi.alertConditions);
  });
  it('fires on the CBC flips', () => {
    const cbc: boolean[] = [];
    let s = false;
    for (let i = 0; i < n; i++) {
      if (s && i > 0 && close[i] < bars[i - 1].low) s = false;
      else if (!s && i > 0 && close[i] > bars[i - 1].high) s = true;
      cbc.push(s);
    }
    const bears = cbc.map((c, i) => !c && i > 0 && cbc[i - 1]);
    const bulls = cbc.map((c, i) => c && !(i > 0 && cbc[i - 1]));
    expect(bears.filter(Boolean).length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(timeAt(bars, bears));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bulls));
  });
});

describe('hash-ribbons', () => {
  // Daily chart from 01/01/2012 over the three halvings, the hash rate on the same days
  const chartBars = walk(3200, 11, 1325376000);
  const hrBars = walk(3200, 23, 1325376000).map((b) => ({ ...b, close: b.close * 1e3 }));
  const chart = {
    timeframe: '1D', timezone: 'Etc/UTC', session: '24x7',
    bars: () => hrBars, symbolInfo: () => ({ timezone: 'Etc/UTC', session: '24x7' }),
  };
  const r = hash.calculate(chartBars, {}, chart);
  it('declares the alertconditions of the original', () => {
    expect(decls(hash)).toEqual([
      ['alert0', 'Alert - Capitulation', 'Alert Fired!'],
      ['alert1', 'Alert - Recovered', 'Alert Fired!'],
      ['alert2', 'Alert - Buy', 'Alert Fired!'],
    ]);
    expect(hash.HashRibbons.alertConditions).toBe(hash.alertConditions);
  });
  it('fires on capitulation, recovery and the first bar of a buy', () => {
    const short = r.plots.plot2.map((p) => p.value);
    const long = r.plots.plot1.map((p) => p.value);
    const cap = under(short, long);
    const rec = over(short, long);
    expect(cap.filter(Boolean).length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(timeAt(chartBars, cap));
    expect(r.alerts[1].times).toEqual(timeAt(chartBars, rec));
    // buy and not buy[1]: the buy signal is the "Buy" circle (shape4)
    const buyTimes = new Set(r.markers.filter((m) => m.id === 'shape4').map((m) => m.time));
    const buy = chartBars.map((b) => buyTimes.has(b.time as number));
    expect(buy.some(Boolean)).toBe(true);
    expect(r.alerts[2].times).toEqual(timeAt(chartBars, buy.map((b, i) => b && !(i > 0 && buy[i - 1]))));
  });
  it('gives the circles and the halving backgrounds the ids of their outputs', () => {
    expect(markerIds(r).sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4']);
    expect(r.markers.filter((m) => m.id === 'shape0').every((m) => m.text === 'Capitulation')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape4').every((m) => m.text === 'Buy')).toBe(true);
    const day = (id: string) => r.bgColors.filter((c) => c.id === id).map((c) => new Date(c.time * 1000).toISOString().slice(0, 10));
    expect(r.bgColors.every((c) => ['bgcolor0', 'bgcolor1', 'bgcolor2'].includes(c.id!))).toBe(true);
    expect(day('bgcolor0')).toEqual(['2012-11-26', '2012-11-27', '2012-11-28', '2012-11-29', '2012-11-30']);
    expect(day('bgcolor1')).toContain('2016-07-09');
    expect(day('bgcolor2')).toContain('2020-05-12');
  });
});

describe('heatmap-volume', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(heatmap).map((d) => d[1])).toEqual([
      'Any Extra High Vol', 'Up Extra High', 'Down Extra High', 'Any High Vol', 'Up High Vol', 'Down High Vol',
      'Any Medium Vol', 'Up Medium Vol', 'Down Medium Vol',
    ]);
    expect(decls(heatmap)[4]).toEqual(['alert4', 'Up High Vol', 'Up Bar High Volume Threshold']);
    expect(decls(heatmap)[8]).toEqual(['alert8', 'Down Medium Vol', 'Down Bar Medium Volume Threshold']);
    expect(heatmap.HeatmapVolume.alertConditions).toBe(heatmap.alertConditions);
  });
  it.each([610, 100])('fires on the volume tiers (length %i)', (len) => {
    const r = heatmap.calculate(bars, { maLength: len, stdLength: len });
    const vol = bars.map((b) => b.volume ?? 0);
    // length := min(length, bar_index + 1): the mean / stdev of all bars so far on the early bars
    const win = (i: number) => vol.slice(Math.max(0, i - len + 1), i + 1);
    const mean = vol.map((_, i) => { const w = win(i); return w.reduce((a, v) => a + v, 0) / w.length; });
    const sd = vol.map((_, i) => { const w = win(i); return Math.sqrt(w.reduce((a, v) => a + (v - mean[i]) ** 2, 0) / w.length); });
    const sb = vol.map((v, i) => (sd[i] !== 0 ? (v - mean[i]) / sd[i] : NaN));
    // a stdbar on a threshold up to rounding (bar 1: two values give +/-1 exactly) is left out on both sides
    const onEdge = new Set(timeAt(bars, sb.map((x) => [4, 2.5, 1].some((t) => Math.abs(x - t) < 1e-9))));
    const clean = (times: number[]) => times.filter((t) => !onEdge.has(t));
    const tiers = [sb.map((s) => s > 4), sb.map((s) => s <= 4 && s > 2.5), sb.map((s) => s <= 2.5 && s > 1)];
    const upBar = bars.map((b) => b.open < b.close);
    const dnBar = bars.map((b) => b.open > b.close);
    tiers.forEach((t, k) => {
      expect(clean(r.alerts[3 * k].times)).toEqual(clean(timeAt(bars, t)));
      expect(clean(r.alerts[3 * k + 1].times)).toEqual(clean(timeAt(bars, t.map((c, i) => c && upBar[i]))));
      expect(clean(r.alerts[3 * k + 2].times)).toEqual(clean(timeAt(bars, t.map((c, i) => c && dnBar[i]))));
    });
    expect(onEdge.size).toBeLessThanOrEqual(2);
    expect(r.alerts[3].times.length).toBeGreaterThan(0);
  });
  it('fills the heatmap zones between the hidden level plots, with the titles of the original', () => {
    const r = heatmap.calculate(bars, { maLength: 100, stdLength: 100 });
    expect(r.fills!.map((f) => f.options?.title)).toEqual([
      'Extra High heatmap zone', 'High heatmap zone', 'Medium heatmap zone', 'Normal heatmap zone', 'Low heatmap zone',
    ]);
    const ids = new Set(heatmap.plotConfig.map((p) => p.id));
    for (const f of r.fills!) {
      expect(ids.has(f.plot1 as string) && ids.has(f.plot2 as string)).toBe(true);
      expect(r.plots[f.plot1 as string].some((p) => Number.isFinite(p.value))).toBe(true);
    }
    const i = 500;
    expect(r.plots.zone0[i].value).toBe(0);
    const ts1 = r.plots.zone1[i].value, ts2 = r.plots.zone2[i].value;
    expect(r.plots.zoneTop[i].value).toBeCloseTo(2 * ts1 - ts2, 6);
    // hidden plots (display.none, editable = false)
    expect(heatmap.plotConfig.filter((p) => p.id.startsWith('zone')).every((p) => p.display === 'none' && p.editable === false)).toBe(true);
    expect(heatmap.calculate(bars, { displayZones: 'Lines' }).fills).toEqual([]);
  });
});

describe('heikin-ashi-reversals-with-region-dots', () => {
  const r = haRev.calculate(bars);
  it('gives the dots the ids of their plotshape outputs', () => {
    expect(markerIds(r).sort()).toEqual(['shape0', 'shape1', 'shape2']);
    expect(r.markers.filter((m) => m.id === 'shape0').every((m) => m.size === 'tiny')).toBe(true);
    expect(r.markers.filter((m) => m.id !== 'shape0').every((m) => m.size === 'small')).toBe(true);
  });
});

describe('heikin-ashi-rsi-oscillator', () => {
  it('gives the stochastic ribbon fill ("Plots Background") between the Stoch K and D plots', () => {
    const r = haRsi.calculate(bars, { showStoch: true });
    const f = r.fills!.find((x) => x.options?.title === 'Plots Background')!;
    expect([f.plot1, f.plot2]).toEqual(['plot6', 'plot7']);
    expect(haRsi.plotConfig.map((p) => p.id)).toContain('plot7');
    const k = r.plots.plot6.map((p) => p.value);
    const d = r.plots.plot7.map((p) => p.value);
    expect(k.filter(Number.isFinite).length).toBeGreaterThan(n - 60);
    // StochD = sma(StochK, 3); the ribbon takes the K colour when K >= D
    expect(d[600]).toBeCloseTo((k[598] + k[599] + k[600]) / 3, 9);
    expect(f.colors![600]).toBe(k[600] >= d[600] ? 'rgba(0, 148, 255, 0.5)' : 'rgba(255, 106, 0, 0.5)');
    // hidden by default (Show Stoch RSI off), as the original
    expect(haRsi.calculate(bars).plots.plot6.every((p) => !Number.isFinite(p.value))).toBe(true);
  });
});

describe('hema-trend-levels', () => {
  const r = hema.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(hema)).toEqual([
      ['alert0', 'Bullish Crossover', 'HEMA 20 crossed above HEMA 40 - Bullish Trend'],
      ['alert1', 'Bearish Crossunder', 'HEMA 20 crossed below HEMA 40 - Bearish Trend'],
      ['alert2', 'Bullish Test', 'Price tested bullish box support'],
      ['alert3', 'Bearish Test', 'Price tested bearish box resistance'],
    ]);
    expect(hema.HemaTrendLevels.alertConditions).toBe(hema.alertConditions);
  });
  it('fires on the HEMA crosses and the box tests', () => {
    const f = (len: number) => {
      const half = Math.max(1, Math.round(len / 2));
      const sq = Math.max(1, Math.round(Math.sqrt(len)));
      const eh = ema(close, half), ef = ema(close, len);
      return ema(eh.map((v, i) => 2 * v - ef[i]), sq);
    };
    const h1 = f(20), h2 = f(40);
    const up = over(h1, h2), dn = under(h1, h2);
    const atr = ta.atr(bars, 14).toArray().map((v) => (v == null ? 0 : v));
    // bull box: top = low + vola; bear box: top = high - vola (box.new(..., high - vola, ..., high))
    let bullTop = NaN, bearTop = NaN;
    const lowTest: boolean[] = [], highTest: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const vola = atr[i] / 2;
      if (up[i]) bullTop = b.low + vola;
      else if (dn[i]) bearTop = b.high - vola;
      lowTest.push(b.low < bullTop && b.high > bullTop && b.open > bullTop && b.close > bullTop);
      highTest.push(b.high > bearTop && b.low < bearTop && b.open < bearTop && b.close < bearTop);
    }
    expect(up.filter(Boolean).length).toBeGreaterThan(5);
    expect(lowTest.some(Boolean) && highTest.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, up));
    expect(r.alerts[1].times).toEqual(timeAt(bars, dn));
    expect(r.alerts[2].times).toEqual(timeAt(bars, lowTest));
    expect(r.alerts[3].times).toEqual(timeAt(bars, highTest));
  });
});

describe('henderson-weighted-moving-average', () => {
  const r = hwma.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(hwma)).toEqual([
      ['alert0', 'Bullish Color Change', 'HWMA - Bullish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
      ['alert1', 'Bearish Color Change', 'HWMA - Bearish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
      ['alert2', 'Any Color Change', 'HWMA - Any Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
    ]);
    expect(hwma.HendersonWeightedMovingAverage.alertConditions).toBe(hwma.alertConditions);
  });
  it('fires when the slope colour changes', () => {
    const ma = r.plots.plot0.map((p) => p.value);
    const bull = ma.map((v, i) => i > 0 && gt(v, ma[i - 1]));
    const toBull = bull.map((b, i) => i > 0 && b && !bull[i - 1]);
    const toBear = bull.map((b, i) => i > 0 && !b && bull[i - 1]);
    expect(toBull.filter(Boolean).length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(timeAt(bars, toBull));
    expect(r.alerts[1].times).toEqual(timeAt(bars, toBear));
    expect(r.alerts[2].times).toEqual(timeAt(bars, toBull.map((v, i) => v || toBear[i])));
    // without the direction colours the line never changes colour
    expect(hwma.calculate(bars, { highlightDirection: false }).alerts.map((a) => a.times.length)).toEqual([0, 0, 0]);
  });
});

describe('higher-order-orderblocks-breakerblocks-range', () => {
  const r = hoob.calculate(bars);
  const EVENT = /^(Bearish MSB @ [-\d.]+\nNew Supply Zone : [-\d.]+ - [-\d.]+\n|Bullish MSB @ [-\d.]+\nNew Demand Zone : [-\d.]+ - [-\d.]+\n|(Supply Zone|Demand Zone|Breakerblock) Test( Up| Down)? @ [-\d.]+ \(age = \d+ bars\) \n|New Range : [-\d.]+ - [-\d.]+\. Mean = [-\d.]+\n|Range (High|Low) Test @ [-\d.]+ \n)/;
  it('declares alert() calls', () => {
    expect(hoob.hasAlertFunction).toBe(true);
    expect(hoob.HigherOrderOrderblocksBreakerblocksRange.hasAlertFunction).toBe(true);
  });
  it('calls alert() once per bar close with the events of the bar and the current price', () => {
    expect(r.alertCalls.length).toBeGreaterThan(10);
    const byTime = new Map(bars.map((b) => [b.time as number, b]));
    expect(new Set(r.alertCalls.map((c) => c.time)).size).toBe(r.alertCalls.length);
    for (const c of r.alertCalls) {
      expect(c.freq).toBe('once_per_bar_close');
      const tail = 'Current price = ' + str.tostring(byTime.get(c.time)!.close) + '\n';
      expect(c.message.endsWith(tail)).toBe(true);
      let body = c.message.slice(0, -tail.length);
      expect(body.length).toBeGreaterThan(0);
      while (body.length) {
        const m = EVENT.exec(body);
        expect(m, body).not.toBeNull();
        body = body.slice(m![0].length);
      }
    }
    for (const kind of ['Bearish MSB', 'Bullish MSB', 'Supply Zone Test', 'Demand Zone Test', 'New Range']) {
      expect(r.alertCalls.some((c) => c.message.includes(kind)), kind).toBe(true);
    }
  });
  it('makes only the calls of the alert inputs that are on', () => {
    const off = { msbASv: false, obASv: false, bbASv: false, rASv: false, rtASv: false };
    expect(hoob.calculate(bars, off).alertCalls).toEqual([]);
    const ranges = hoob.calculate(bars, { ...off, rASv: true }).alertCalls;
    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges.every((c) => /^New Range : [^\n]+\nCurrent price = [^\n]+\n$/.test(c.message))).toBe(true);
    // the same bars as the range events of the full set
    expect(ranges.map((c) => c.time)).toEqual(r.alertCalls.filter((c) => c.message.includes('New Range')).map((c) => c.time));
  });
  it('does not call alert() on an open last bar', () => {
    const last = bars[n - 1].time as number;
    const open = hoob.calculate(bars, {}, { lastBarConfirmed: false });
    expect(open.alertCalls.some((c) => c.time === last)).toBe(false);
  });
});

describe('hma-breakdown', () => {
  const r = hmaB.calculate(bars);
  it('gives the "TMA Candle" plotcandle of the original (hidden by default)', () => {
    expect(hmaB.plotCandleConfig).toEqual([{ id: 'tmaCandle', title: 'TMA Candle', display: 'none' }]);
    const half = wma(close, 25);
    const tma = wma(half, 25);
    const want = bars.flatMap((b, i) => (i >= 1 && Number.isFinite(tma[i - 1]) && Number.isFinite(tma[i])
      ? [{ time: b.time, open: tma[i - 1], close: tma[i], up: tma[i] > tma[i - 1] }] : []));
    const got = r.plotCandles.tmaCandle;
    expect(got.length).toBe(want.length);
    got.forEach((c, k) => {
      expect(c.time).toBe(want[k].time);
      expect(c.open).toBeCloseTo(want[k].open, 8);
      expect(c.close).toBeCloseTo(want[k].close, 8);
      expect(c.low).toBe(c.open);
      expect(c.high).toBe(c.close);
      expect(c.color).toBe(want[k].up ? hmaB.defaultInputs.up : hmaB.defaultInputs.down);
    });
    // Candle Lookback: the open is tma[gap]
    const g3 = hmaB.calculate(bars, { candleGap: 3 }).plotCandles.tmaCandle;
    const at = g3.findIndex((c) => c.time === bars[700].time);
    expect(g3[at].open).toBeCloseTo(tma[697], 8);
  });
});

describe('hott-lott', () => {
  const r = hott.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(hott)).toEqual([
      ['alert0', 'Price Crossover Alarm', 'PRICE OVER HOTT - BUY SIGNAL!'],
      ['alert1', 'Price Crossunder Alarm', 'PRICE UNDER LOTT - SELL SIGNAL!'],
    ]);
    expect(hott.HottLott.alertConditions).toBe(hott.alertConditions);
  });
  it('fires when the close crosses HOTT[2] / LOTT[2]', () => {
    // the plots are nz(HOTT[2]) / nz(LOTT[2]) from bar 14 on: compare from bar 15
    const from = 15;
    const h = r.plots.hott.map((p) => p.value);
    const l = r.plots.lott.map((p) => p.value);
    const up = over(close, h);
    const dn = under(close, l);
    const after = (times: number[]) => times.filter((t) => t >= (bars[from].time as number));
    expect(up.filter(Boolean).length).toBeGreaterThan(10);
    expect(after(r.alerts[0].times)).toEqual(after(timeAt(bars, up)));
    expect(after(r.alerts[1].times)).toEqual(after(timeAt(bars, dn)));
  });
});
