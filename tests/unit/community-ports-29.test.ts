/**
 * Alerts and Style ids of community ports (batch 29): the alertcondition() declarations (ids, titles and messages of
 * the originals), the bars on which each condition is true (re-computed here from the original's expression), and
 * the Style-settings ids on the emitted markers / arrows / fills.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as pabt from '../../src/community/price-action-breakout-trend';
import * as pring from '../../src/community/pring-special-k-a2m';
import * as pmax from '../../src/community/profit-maximizer';
import * as pct from '../../src/community/projected-crossover-trend';
import * as phl from '../../src/community/protected-highs-lows';
import * as psar from '../../src/community/pullback-sar';
import * as pbt from '../../src/community/pullback-trading-tool-alt-r1-0-by-justunclel';
import * as pulse from '../../src/community/pulse-rsi-lyro-rs';
import * as pwave from '../../src/community/pulsewave-divergence';
import * as pump from '../../src/community/pump-dump-detector';
import * as qie from '../../src/community/q-impulse-entry';
import * as qkama from '../../src/community/q-kama-clarity-trend';
import * as qqe from '../../src/community/qqe';
import * as qqeCross from '../../src/community/qqe-cross';
import * as qqeK from '../../src/community/qqe-kivanc';

/** Seeded random walk of daily bars with a random volume (5 % of the bars with a spike) */
function walk(count: number, seed0: number, start = 1577836800, step = 86400, drift = 0): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4 + drift);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
/** Up / down legs of 300 bars with a sine wave and a little noise (trending bars) */
function wave(count: number, seed0: number, drift: number, amp: number, per: number, noise: number): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let prevClose = 100;
  for (let i = 0; i < count; i++) {
    const sign = Math.floor(i / 300) % 2 === 0 ? 1 : -1;
    const c = Math.max(5, 100 + drift * (i % 300) * sign + amp * Math.sin(i / per) + (rnd() - 0.5) * noise);
    const o = prevClose;
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(o, c) + rnd() * noise * 0.3, low: Math.min(o, c) - rnd() * noise * 0.3, close: c, volume: 1e6 * (0.5 + rnd()) });
    prevClose = c;
  }
  return out;
}
const bars = walk(1200, 29);
const n = bars.length;
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const markerIds = (r: { markers: { id?: string }[] }) => [...new Set(r.markers.map((m) => m.id))].sort();
const timesOf = (r: { markers: { id?: string; time: unknown }[] }, ...ids: string[]) =>
  [...new Set(r.markers.filter((m) => ids.includes(m.id ?? '')).map((m) => m.time as number))].sort((a, b) => a - b);
const union = (...lists: number[][]) => [...new Set(lists.flat())].sort((a, b) => a - b);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const S = (list: Bar[], a: number[]) => Series.fromArray(list, a);
const vals = (p: { value: number }[]) => p.map((x) => x.value ?? NaN);

/** Independent crossover / crossunder (na = NaN compares false) */
const over = (a: number[], b: number[] | number) => a.map((v, i) => {
  const B = (k: number) => (typeof b === 'number' ? b : b[k]);
  return i > 0 && v > B(i) && a[i - 1] <= B(i - 1);
});
const under = (a: number[], b: number[] | number) => a.map((v, i) => {
  const B = (k: number) => (typeof b === 'number' ? b : b[k]);
  return i > 0 && v < B(i) && a[i - 1] >= B(i - 1);
});
const or = (a: boolean[], b: boolean[]) => a.map((v, i) => v || b[i]);
const roll = (src: number[], len: number, f: (w: number[]) => number) =>
  src.map((_, i) => (i < len - 1 ? NaN : f(src.slice(i - len + 1, i + 1))));
const sma = (src: number[], len: number) => roll(src, len, (w) => w.reduce((s, v) => s + v, 0) / len);
const prev = (a: number[], k = 1) => a.map((_, i) => (i >= k ? a[i - k] : NaN));

describe('price-action-breakout-trend', () => {
  const r = pabt.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(pabt)).toEqual([
      ['alert0', 'Bullish Breakout Signal', 'Price Action Breakout Trend: BULLISH breakout confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert1', 'Bearish Breakout Signal', 'Price Action Breakout Trend: BEARISH breakout confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert2', 'Any Breakout Signal', 'Price Action Breakout Trend: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}'],
    ]);
    expect(pabt.PriceActionBreakoutTrend.alertConditions).toBe(pabt.alertConditions);
  });
  it('fires on the trend flips', () => {
    const L = 10;
    const hh = prev(roll(bars.map((b) => b.high), L, (w) => Math.max(...w)));
    const ll = prev(roll(bars.map((b) => b.low), L, (w) => Math.min(...w)));
    let trail = NaN, trend = 0;
    const trends: number[] = [];
    for (let i = 0; i < n; i++) {
      if (isNaN(trail) && !isNaN(ll[i])) { trail = ll[i]; trend = 1; }
      if (trend === 1) {
        trail = Math.max(trail, ll[i]);
        if (close[i] < trail) { trend = -1; trail = hh[i]; }
      } else if (trend === -1) {
        trail = Math.min(trail, hh[i]);
        if (close[i] > trail) { trend = 1; trail = ll[i]; }
      }
      trends.push(trend);
    }
    const bull = trends.map((t, i) => i > 0 && t === 1 && trends[i - 1] === -1);
    const bear = trends.map((t, i) => i > 0 && t === -1 && trends[i - 1] === 1);
    expect(bull.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timeAt(bars, bull));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bear));
    expect(r.alerts[2].times).toEqual(timeAt(bars, or(bull, bear)));
  });
});

describe('pring-special-k-a2m', () => {
  it('declares the "BB Fill" fill with or without the bands', () => {
    const plain = pring.calculate(bars);
    expect(plain.fills?.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([['plot2', 'plot3', 'BB Fill']]);
    expect(plain.fills![0].colors!.every((c) => c === 'transparent')).toBe(true);
    const bb = pring.calculate(bars, { maType: 'SMA + Bollinger Bands' });
    expect(bb.fills?.map((f) => f.options?.title)).toEqual(['BB Fill']);
    expect(bb.fills![0].colors!.every((c) => c !== 'transparent')).toBe(true);
  });
});

describe('profit-maximizer', () => {
  const r = pmax.calculate(bars, { showSignalsC: true });
  const ma = vals(r.plots.plot1);
  const pm = vals(r.plots.plot0);
  it('declares the alertconditions of the original', () => {
    expect(decls(pmax)).toEqual([
      ['alert0', 'Cross Alert', 'PMax - Moving Avg Crossing!'],
      ['alert1', 'Crossover Alarm', 'Moving Avg BUY SIGNAL!'],
      ['alert2', 'Crossunder Alarm', 'Moving Avg SELL SIGNAL!'],
      ['alert3', 'Price Cross Alert', 'PMax - Price Crossing!'],
      ['alert4', 'Price Crossover Alarm', 'PRICE OVER PMax - BUY SIGNAL!'],
      ['alert5', 'Price Crossunder Alarm', 'PRICE UNDER PMax - SELL SIGNAL!'],
    ]);
    expect(pmax.ProfitMaximizer.alertConditions).toBe(pmax.alertConditions);
  });
  it('fires on the crosses of the MA and of the price with PMax', () => {
    // the price crosses of the original read its source (hl2 by default), not the close
    const hl2 = bars.map((b) => (b.high + b.low) / 2);
    const mo = over(ma, pm), mu = under(ma, pm), po = over(hl2, pm), pu = under(hl2, pm);
    expect(mo.filter(Boolean).length).toBeGreaterThan(3);
    expect(po.filter(Boolean).length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(timeAt(bars, or(mo, mu)));
    expect(r.alerts[1].times).toEqual(timeAt(bars, mo));
    expect(r.alerts[2].times).toEqual(timeAt(bars, mu));
    expect(r.alerts[3].times).toEqual(timeAt(bars, or(po, pu)));
    expect(r.alerts[4].times).toEqual(timeAt(bars, po));
    expect(r.alerts[5].times).toEqual(timeAt(bars, pu));
  });
  it('gives the Buy / Sell labels the ids of their plotshape outputs', () => {
    expect(markerIds(r)).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    expect(timesOf(r, 'shape0')).toEqual(r.alerts[1].times);
    expect(timesOf(r, 'shape1')).toEqual(r.alerts[2].times);
    expect(timesOf(r, 'shape2')).toEqual(r.alerts[4].times);
    expect(timesOf(r, 'shape3')).toEqual(r.alerts[5].times);
    expect(markerIds(pmax.calculate(bars))).toEqual(['shape0', 'shape1']);
  });
  it('gives the two highlighter fills of the original', () => {
    expect(r.fills?.map((f) => f.options?.title)).toEqual(['UpTrend Highligter', 'DownTrend Highligter']);
    const [up, down] = r.fills!.map((f) => f.colors!);
    // one of them per bar after the warm-up
    up.forEach((c, i) => expect(c === 'rgba(0,0,0,0)' || down[i] === 'rgba(0,0,0,0)').toBe(true));
  });
});

describe('projected-crossover-trend', () => {
  const r = pct.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(pct)).toEqual([
      ['alert0', 'Long Signal', 'Projected Crossover Trend LONG Signal on {{ticker}}'],
      ['alert1', 'Short Signal', 'Projected Crossover Trend SHORT Signal on {{ticker}}'],
    ]);
    expect(pct.ProjectedCrossoverTrend.alertConditions).toBe(pct.alertConditions);
  });
  it('fires when the trend state turns', () => {
    const cs = S(bars, close);
    const fast = A(ta.ema(cs, 10));
    const slow = sma(close, 30);
    const proj = fast.map((f, i) => 10 * (f - slow[i]));
    const raw = proj.map((p, i) => (i > 0 ? (100 * (p - proj[i - 1])) / close[i] : NaN));
    const mdi = A(ta.ema(S(bars, raw), 5));
    let sq = 0;
    const sqs: number[] = [];
    for (let i = 0; i < n; i++) {
      const back = i >= 30 ? close[i - 30] : NaN;
      if (mdi[i] > 0 && close[i] > back) sq = 1;
      if (mdi[i] < 0 && close[i] < back) sq = -1;
      sqs.push(sq);
    }
    const long = sqs.map((v, i) => i > 0 && v === 1 && sqs[i - 1] !== 1);
    const short = sqs.map((v, i) => i > 0 && v === -1 && sqs[i - 1] !== -1);
    expect(long.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timeAt(bars, long));
    expect(r.alerts[1].times).toEqual(timeAt(bars, short));
  });
});

describe('protected-highs-lows', () => {
  const list = walk(400, 5);
  const r = phl.calculate(list, { showPhl: false, labelType: 'All' });
  const lastTime = list[list.length - 1].time as number;
  const next = (t: number) => list[list.findIndex((b) => b.time === t) + 1].time as number;
  it('declares the alertconditions of the original', () => {
    expect(decls(phl)).toEqual([
      ['alert0', 'BOS Any', 'Alert Fired!'], ['alert1', 'MSS Any', 'Alert Fired!'],
      ['alert2', 'BOS Bear', 'Alert Fired!'], ['alert3', 'BOS Bull', 'Alert Fired!'],
      ['alert4', 'MSS Bear', 'Alert Fired!'], ['alert5', 'MSS Bull', 'Alert Fired!'],
    ]);
    expect(phl.ProtectedHighsLows.alertConditions).toBe(phl.alertConditions);
  });
  it('fires on the bar after each break', () => {
    // every break draws a dashed line ending on the break bar
    const breaks = [...new Set(r.lines.map((l) => l.time2 as number))].sort((a, b) => a - b);
    expect(breaks).not.toContain(lastTime);
    expect(breaks.length).toBeGreaterThan(10);
    const [bos, mss, bosBear, bosBull, mssBear, mssBull] = r.alerts.map((a) => a.times);
    expect(union(bos, mss)).toEqual(breaks.map(next));
    expect(bos).toEqual(union(bosBear, bosBull));
    expect(mss).toEqual(union(mssBear, mssBull));
    // one structure label per break: BOS / MSS, label_down for a bullish break (close above the swing high)
    const count = (text: string, style: string) => r.labels.filter((l) => l.text === text && l.style === style).length;
    expect(bosBull.length).toBe(count('BOS', 'label_down'));
    expect(mssBull.length).toBe(count('MSS', 'label_down'));
    expect(bosBear.length).toBe(count('BOS', 'label_up'));
    expect(mssBear.length).toBe(count('MSS', 'label_up'));
    expect(mssBull.length).toBeGreaterThan(2);
  });
});

describe('pullback-sar', () => {
  const r = psar.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(psar)).toEqual([
      ['alert0', 'Alert Long', 'Pullback SAR: LONG signal'],
      ['alert1', 'Alert Short', 'Pullback SAR: SHORT signal'],
    ]);
    expect(psar.PullbackSar.alertConditions).toBe(psar.alertConditions);
  });
  it('fires on the re-entries', () => {
    const sar = A(ta.sar(bars, 0.01, 0.01, 0.1));
    const bull = close.map((c, i) => c > sar[i]);
    const bear = close.map((c, i) => c < sar[i]);
    const pbUp = bars.map((b, i) => i > 0 && bull[i - 1] && b.close < close[i - 1] && b.low < bars[i - 1].low);
    const pbDn = bars.map((b, i) => i > 0 && bear[i - 1] && b.close > close[i - 1] && b.high > bars[i - 1].high);
    const long = bars.map((_b, i) => i > 0 && pbUp[i - 1] && bull[i] && close[i] > close[i - 1]);
    const short = bars.map((_b, i) => i > 0 && pbDn[i - 1] && bear[i] && close[i] < close[i - 1]);
    expect(long.filter(Boolean).length).toBeGreaterThan(5);
    expect(short.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timeAt(bars, long));
    expect(r.alerts[1].times).toEqual(timeAt(bars, short));
  });
});

describe('pullback-trading-tool-alt-r1-0-by-justunclel', () => {
  const list = wave(1500, 3, 0.15, 5, 9, 2);
  const r = pbt.calculate(list, { showBreak: true, showPB: true, showHHLL: true });
  it('gives the entry arrows as plotarrow outputs', () => {
    expect(r.markers.some((m) => m.shape === 'arrowUp' || m.shape === 'arrowDown')).toBe(false);
    const ids = [...new Set(r.arrows.map((a) => a.id))].sort();
    expect(ids).toEqual(['arrow0', 'arrow1', 'arrow2', 'arrow3']);
    const colour: Record<string, string> = { arrow0: '#00FFFF', arrow1: '#0000FF', arrow2: '#00FF00', arrow3: '#FF0000' };
    for (const a of r.arrows) {
      expect(a.color).toBe(colour[a.id]);
      expect(a.value).toBe(a.id === 'arrow0' || a.id === 'arrow2' ? 1 : -1);
    }
    expect(pbt.calculate(list).arrows).toEqual([]);
  });
  it('gives the HH / LH / HL / LL marks the ids of their plotshape outputs', () => {
    expect(markerIds(r)).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    const text: Record<string, string> = { shape0: 'HH', shape1: 'LH', shape2: 'HL', shape3: 'LL' };
    for (const m of r.markers) expect(m.text).toBe(text[m.id!]);
  });
});

describe('pulse-rsi-lyro-rs', () => {
  const all = { sigType1Enable: true, sigType2Enable: true, sigType3Enable: true, sigType4Enable: true, thresholdLong: 40, thresholdShort: 60 };
  const r = pulse.calculate(bars, all);
  const res = vals(r.plots.plot0);
  it('declares the alertconditions of the original', () => {
    expect(decls(pulse)).toEqual([
      ['alert0', 'Pulse RSI Long / Type 1-Trend', 'Pulse RSI Trend is Long {{exchange}}:{{ticker}}'],
      ['alert1', 'Pulse RSI Short / Type 1-Trend', 'Pulse RSI Trend is Short {{exchange}}:{{ticker}}'],
      ['alert2', 'Pulse RSI Long / Type 2-Trend', 'Pulse RSI Trend is Long {{exchange}}:{{ticker}}'],
      ['alert3', 'Pulse RSI Short / Type 2-Trend', 'Pulse RSI Trend is Short {{exchange}}:{{ticker}}'],
      ['alert4', 'Pulse RSI Long / Type 3-Oversold/Overbought', 'Pulse RSI Oversold is Long {{exchange}}:{{ticker}}'],
      ['alert5', 'Pulse RSI Short / Type 3-Oversold/Overbought', 'Pulse RSI Overbought is Short {{exchange}}:{{ticker}}'],
      ['alert6', 'Pulse RSI Long / Type 4-Custom Threshold L/S', 'Pulse RSI Threshold HIT Long {{exchange}}:{{ticker}}'],
      ['alert7', 'Pulse RSI Short / Type 4-Custom Threshold L/S', 'Pulse RSI Threshold HIT Short {{exchange}}:{{ticker}}'],
    ]);
    expect(pulse.PulseRsiLyroRs.alertConditions).toBe(pulse.alertConditions);
  });
  it('fires on every bar where its comparison holds', () => {
    const r1 = prev(res);
    expect(res.filter((v) => !isNaN(v)).length).toBeGreaterThan(900);
    expect(r.alerts[0].times).toEqual(timeAt(bars, res.map((v, i) => v > r1[i])));
    expect(r.alerts[1].times).toEqual(timeAt(bars, res.map((v, i) => v < r1[i])));
    expect(r.alerts[2].times).toEqual(timeAt(bars, res.map((v) => v > 50)));
    expect(r.alerts[3].times).toEqual(timeAt(bars, res.map((v) => v < 50)));
    expect(r.alerts[4].times).toEqual(timeAt(bars, res.map((v) => v > 30)));
    expect(r.alerts[5].times).toEqual(timeAt(bars, res.map((v) => v < 70)));
    expect(r.alerts[6].times).toEqual(timeAt(bars, res.map((v) => v > 40)));
    expect(r.alerts[7].times).toEqual(timeAt(bars, res.map((v) => v < 60)));
  });
  it('gives the signal marks the ids of their plotshape outputs', () => {
    expect(markerIds(r)).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7']);
    expect(timesOf(r, 'shape2')).toEqual(timeAt(bars, over(res, 50)));
    expect(timesOf(r, 'shape3')).toEqual(timeAt(bars, under(res, 50)));
    expect(timesOf(r, 'shape4')).toEqual(timeAt(bars, over(res, 30)));
    expect(timesOf(r, 'shape5')).toEqual(timeAt(bars, under(res, 70)));
    expect(timesOf(r, 'shape6')).toEqual(timeAt(bars, over(res, 40)));
    expect(timesOf(r, 'shape7')).toEqual(timeAt(bars, under(res, 60)));
  });
});

describe('pulsewave-divergence', () => {
  const r = pwave.calculate(bars, { signalType: 'Both' });
  const lb = 5;
  const shiftBack = (times: number[]) => times.map((t) => bars[bars.findIndex((b) => b.time === t) - lb].time as number);
  it('declares the alertconditions of the original', () => {
    expect(decls(pwave)).toEqual([
      ['alert0', 'Bullish Divergence', 'New bullish divergence detected, Pivot Lookback Right bars to the left of current bar.'],
      ['alert1', 'Bearish Divergence', 'New bearish divergence detected, Pivot Lookback Right bars to the left of current bar.'],
    ]);
    expect(pwave.PulsewaveDivergence.alertConditions).toBe(pwave.alertConditions);
  });
  it('fires on the bars that confirm a divergence (its label is drawn on the pivot bar)', () => {
    expect(r.alerts[0].times.length).toBeGreaterThan(2);
    expect(r.alerts[1].times.length).toBeGreaterThan(2);
    expect(shiftBack(r.alerts[0].times)).toEqual(timesOf(r, 'shape0'));
    expect(shiftBack(r.alerts[1].times)).toEqual(timesOf(r, 'shape1'));
    const off = pwave.calculate(bars, { calculateDivergence: false });
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
  });
  it('gives the labels and triangles the ids of their plotshape outputs', () => {
    expect(markerIds(r)).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']);
    const osc = vals(r.plots.plot0);
    expect(timesOf(r, 'shape2')).toEqual(timeAt(bars, over(osc, -12)));
    expect(timesOf(r, 'shape3')).toEqual(timeAt(bars, under(osc, 12)));
    expect(timesOf(r, 'shape4')).toEqual(timeAt(bars, over(osc, 0)));
    expect(timesOf(r, 'shape5')).toEqual(timeAt(bars, under(osc, 0)));
  });
});

describe('pump-dump-detector', () => {
  // the walk plus crafted spikes: a big up bar and a big down bar with a high volume
  const list = bars.slice(0, 700).map((b) => ({ ...b }));
  const spike = (i: number, up: boolean) => {
    const c0 = list[i - 1].close;
    const c = up ? c0 * 1.06 : c0 * 0.94;
    Object.assign(list[i], { open: c0, close: c, high: Math.max(c0, c) + 5, low: Math.min(c0, c) - 5, volume: 3e7 });
  };
  spike(200, true);
  spike(400, false);
  const r = pump.calculate(list);
  it('declares the alertconditions of the original', () => {
    expect(decls(pump)).toEqual([
      ['alert0', '\u{1F6A8} Early Pump', 'EARLY PUMP signal on {{ticker}}'],
      ['alert1', '\u{1F4A5} Confirmed Pump', 'CONFIRMED PUMP on {{ticker}}'],
      ['alert2', '\u{1F53B} Early Dump', 'EARLY DUMP signal on {{ticker}}'],
      ['alert3', '\u{1F525} Confirmed Dump', 'CONFIRMED DUMP on {{ticker}}'],
    ]);
    expect(pump.PumpDumpDetector.alertConditions).toBe(pump.alertConditions);
  });
  it('fires on the early and confirmed signals', () => {
    const c = list.map((b) => b.close);
    const vol = list.map((b) => b.volume ?? NaN);
    const range = list.map((b) => b.high - b.low);
    const atr = A(ta.atr(list, 7));
    const natr = atr.map((a, i) => (a / c[i]) * 100);
    const vAvg = sma(vol, 5), rAvg = sma(range, 5), nAvg = sma(natr, 5);
    const base = list.map((_b, i) => vol[i] > 10000 && vol[i] > vAvg[i] * 1.8 && range[i] > rAvg[i] * 1.4 && natr[i] > nAvg[i] * 1.2);
    const chg = c.map((v, i) => (i > 0 ? ((v - c[i - 1]) / c[i - 1]) * 100 : NaN));
    const ep = base.map((v, i) => v && i > 0 && c[i] > c[i - 1]);
    const ed = base.map((v, i) => v && i > 0 && c[i] < c[i - 1]);
    const cp = ep.map((v, i) => v && chg[i] >= 2.5);
    const cd = ed.map((v, i) => v && chg[i] <= -2.5);
    expect(cp[200] && cd[400]).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(list, ep));
    expect(r.alerts[1].times).toEqual(timeAt(list, cp));
    expect(r.alerts[2].times).toEqual(timeAt(list, ed));
    expect(r.alerts[3].times).toEqual(timeAt(list, cd));
  });
});

describe('q-impulse-entry', () => {
  const list = wave(1500, 9, 0.2, 6, 10, 2);
  const r = qie.calculate(list);
  it('declares the alertconditions of the original', () => {
    expect(decls(qie)).toEqual([
      ['alert0', 'BUY ALERT', 'BUY: Impulse trend ON'],
      ['alert1', 'SELL ALERT', 'SELL: Impulse trend OFF'],
    ]);
    expect(qie.QImpulseEntry.alertConditions).toBe(qie.alertConditions);
  });
  it('fires on the buy / sell signals', () => {
    const c = list.map((b) => b.close);
    const cs = S(list, c);
    const atrRange = A(ta.sma(ta.atr(list, 10), 10));
    const hiB = sma(list.map((b) => b.high), 20).map((v, i) => v + atrRange[i]);
    const loB = sma(list.map((b) => b.low), 20).map((v, i) => v - atrRange[i]);
    const up = over(c, hiB), dn = under(c, loB);
    const ema = A(ta.ema(cs, 13));
    const [m, sg] = ta.macd(cs, 12, 26, 9).map(A);
    const adx = A(ta.dmi(list, 14, 14)[2]);
    let trend = false, prevTrend = false, since = 9999, last = 0;
    const buy: boolean[] = [], sell: boolean[] = [];
    for (let i = 0; i < list.length; i++) {
      if (up[i]) trend = true;
      else if (dn[i]) trend = false;
      const changed = trend !== prevTrend;
      prevTrend = trend;
      const h = m[i] - sg[i];
      since += 1;
      const b = changed && trend && since >= 30 && last !== 1 && c[i] > ema[i] && h > 0 && adx[i] > 20;
      const s = changed && !trend && since >= 30 && last !== -1 && c[i] < ema[i] && h < 0 && adx[i] > 20;
      if (b) { last = 1; since = 0; } else if (s) { last = -1; since = 0; }
      buy.push(b);
      sell.push(s);
    }
    expect(buy.filter(Boolean).length).toBeGreaterThan(0);
    expect(sell.filter(Boolean).length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(timeAt(list, buy));
    expect(r.alerts[1].times).toEqual(timeAt(list, sell));
  });
});

describe('q-kama-clarity-trend', () => {
  const r = qkama.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(qkama)).toEqual([
      ['alert0', 'Uptrend Started', 'Uptrend started on {{ticker}}'],
      ['alert1', 'Downtrend Started', 'Downtrend started on {{ticker}}'],
    ]);
    expect(qkama.QKamaClarityTrend.alertConditions).toBe(qkama.alertConditions);
  });
  it('fires on the trend changes', () => {
    const kama = vals(r.plots.plot0);
    const atr = A(ta.atr(bars, 14)).map((v) => v * 1.5);
    const trend: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = i > 0 ? trend[i - 1] : 0;
      trend.push(close[i] > kama[i] + atr[i] ? 1 : close[i] < kama[i] - atr[i] ? -1 : p);
    }
    const ch = trend.map((t, i) => i > 0 && t !== trend[i - 1]);
    const upF = ch.map((v, i) => v && trend[i] === 1);
    const dnF = ch.map((v, i) => v && trend[i] === -1);
    expect(upF.filter(Boolean).length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(timeAt(bars, upF));
    expect(r.alerts[1].times).toEqual(timeAt(bars, dnF));
  });
});

const qqeDecls = [
  ['alert0', 'Cross Alert', 'QQE Crossing Signal!'],
  ['alert1', 'Crossover Alarm', 'QQE BUY SIGNAL!'],
  ['alert2', 'Crossunder Alarm', 'QQE SELL SIGNAL!'],
  ['alert3', 'Cross 50 Up Alert', 'QQE FAST Crossing 50 UP!'],
  ['alert4', 'Cross 50 Down Alert', 'QQE FAST Crossing 50 DOWN!'],
];
const checkQqe = (r: { alerts: { times: number[] }[] }, fast: number[], slow: number[]) => {
  const o = over(fast, slow), u = under(fast, slow);
  expect(r.alerts[0].times).toEqual(timeAt(bars, or(o, u)));
  expect(r.alerts[1].times).toEqual(timeAt(bars, o));
  expect(r.alerts[2].times).toEqual(timeAt(bars, u));
  expect(r.alerts[3].times).toEqual(timeAt(bars, over(fast, 50)));
  expect(r.alerts[4].times).toEqual(timeAt(bars, under(fast, 50)));
  expect(r.alerts[3].times.length).toBeGreaterThan(5);
};

describe('qqe', () => {
  const r = qqe.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(qqe)).toEqual(qqeDecls);
    expect(qqe.QQE.alertConditions).toBe(qqe.alertConditions);
  });
  // the port's trailing line stays on one side of the smoothed RSI on these bars: the line crosses do not fire
  it('fires on the crosses of the two lines and of 50', () => checkQqe(r, vals(r.plots.plot0), vals(r.plots.plot1)));
  it('gives the two highlighter fills of the original', () => {
    expect(r.fills?.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([
      ['plot0', 'plot1', 'UpTrend Highligter'], ['plot0', 'plot1', 'DownTrend Highligter'],
    ]);
  });
});

describe('qqe-kivanc', () => {
  const r = qqeK.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(qqeK)).toEqual(qqeDecls);
    expect(qqeK.QqeKivanc.alertConditions).toBe(qqeK.alertConditions);
  });
  it('fires on the crosses of FAST and SLOW and of 50', () => {
    checkQqe(r, vals(r.plots.plot0), vals(r.plots.plot1));
    expect(r.alerts[1].times.length).toBeGreaterThan(10);
    // the Buy / Sell labels stand on the same crosses
    expect(r.markers.filter((m) => m.text === 'Buy').map((m) => m.time)).toEqual(r.alerts[1].times);
  });
});

describe('qqe-cross', () => {
  // with the MA filter a channel exit without the filter is an XC mark, not a BUY / SELL
  const r = qqeCross.calculate(bars, { useFilter: true });
  const spec = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7', 'shape8'];
  const plain = qqeCross.calculate(bars);
  it('gives every mark the id of its plotshape output', () => {
    expect(markerIds({ markers: [...r.markers, ...plain.markers] })).toEqual(spec);
    expect(markerIds(plain)).toEqual(['shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7', 'shape8']);
    const look: Record<string, [string, string]> = {
      shape0: ['XC', 'triangleUp'], shape1: ['XC', 'triangleDown'], shape2: ['XQ', 'triangleUp'], shape3: ['XQ', 'triangleDown'],
      shape4: ['XZ', 'triangleUp'], shape5: ['XZ', 'triangleDown'], shape6: ['BUY', 'arrowUp'], shape7: ['SELL', 'arrowDown'],
    };
    for (const m of [...r.markers, ...plain.markers]) {
      if (m.id === 'shape8') expect([m.shape, m.position, m.text]).toEqual(['circle', 'bottom', undefined]);
      else expect([m.text, m.shape]).toEqual(look[m.id!]);
    }
  });
  it('marks each BUY / SELL bar with a circle once the next bar exists', () => {
    const signals = timesOf(r, 'shape6', 'shape7').filter((t) => t !== bars[n - 1].time);
    expect(timesOf(r, 'shape8')).toEqual(signals);
    for (const m of r.markers.filter((x) => x.id === 'shape8')) {
      const sell = r.markers.some((x) => x.id === 'shape7' && x.time === m.time);
      expect(m.color).toBe(sell ? '#FF0000' : '#008000');
    }
  });
  it('marks the zero crosses that have no other mark of their side', () => {
    const at = (id: string) => new Set(timesOf(r, id));
    for (const t of at('shape4')) for (const id of ['shape0', 'shape2', 'shape6']) expect(at(id).has(t)).toBe(false);
    for (const t of at('shape5')) for (const id of ['shape1', 'shape3', 'shape7']) expect(at(id).has(t)).toBe(false);
  });
});
