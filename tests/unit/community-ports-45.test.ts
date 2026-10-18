/**
 * Community ports, batch 45: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as vsbc from '../../src/community/volume-sentiment-breakout-channels';
import * as spike from '../../src/community/volume-spike-and-contraction-indicator';
import * as surge from '../../src/community/volume-surge-detector';
import * as vwmaX from '../../src/community/volume-weighted-ma-crossover';
import * as vwmf from '../../src/community/volume-weighted-money-flow';
import * as pivots from '../../src/community/volume-weighted-pivot-bands';
import * as zscore from '../../src/community/volume-weighted-price-z-score';
import * as vwRsi from '../../src/community/volume-weighted-rsi';
import * as vwTrend from '../../src/community/volume-weighted-trend';
import * as volAlert from '../../src/community/volume-with-alert';
import * as vcma from '../../src/community/volumetric-compressed-ma';
import * as vei from '../../src/community/volumetric-entropy-index';
import * as voss from '../../src/community/voss-predictive-filter';
import * as vpci from '../../src/community/vpci';
import * as vpsa from '../../src/community/vpsa-vtd';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'volume-sentiment-breakout-channels': [['alert0', 'Channel Formed', 'A new channel has formed.'], ['alert1', 'Bullish Channel Break', 'Price broke above the channel.'], ['alert2', 'Bearish Channel Break', 'Price broke below the channel.']],
  'volume-spike-and-contraction-indicator': [['alert0', 'Volume Spike', 'Alert Fired!'], ['alert1', 'Volume Contraction', 'Alert Fired!']],
  'volume-surge-detector': [['alert0', 'Volume Surge Trigger1', 'Volume Surge Level 1 Detected 📊（成交量放量 Level 1 )'], ['alert1', 'Volume Surge Trigger2', 'Volume Surge Level 2 Detected 🚀(成交量放量 Level 2) ']],
  'volume-weighted-ma-crossover': [['alert0', 'VWMA Crossover Long', 'VWMA Crossover Long {{exchange}}:{{ticker}}'], ['alert1', 'VWMA Crossover Short', 'VWMA Crossover Short {{exchange}}:{{ticker}}']],
  'volume-weighted-money-flow': [['alert0', 'VWMF Cross Above 50', '{{ticker}}: Volume-Weighted Money Flow crossed above 50. Possible bullish momentum shift.'], ['alert1', 'VWMF Cross Below 50', '{{ticker}}: Volume-Weighted Money Flow crossed below 50. Possible bearish momentum shift.'], ['alert2', 'Bullish Strength: High But Not Absolute Consensus', '{{ticker}}: Bullish strength is high (between 60% and 80% consensus).'], ['alert3', 'Bullish Strength: Absolute Consensus (100%)', '{{ticker}}: All 5 indicators show bullish strength.'], ['alert4', 'Bearish Strength: High But Not Absolute Consensus', '{{ticker}}: Bearish strength is high (between 60% and 80% consensus).'], ['alert5', 'Bearish Strength: Absolute Consensus (100%)', '{{ticker}}: All 5 indicators show bearish strength.']],
  'volume-weighted-pivot-bands': [['alert0', 'Cross Above R1', 'Price crossed above R1'], ['alert1', 'Cross Above R2', 'Price crossed above R2'], ['alert2', 'Cross Above R3', 'Price crossed above R3'], ['alert3', 'Cross Above R4', 'Price crossed above R4'], ['alert4', 'Cross Above R5', 'Price crossed above R5'], ['alert5', 'Cross Below S1', 'Price crossed below S1'], ['alert6', 'Cross Below S2', 'Price crossed below S2'], ['alert7', 'Cross Below S3', 'Price crossed below S3'], ['alert8', 'Cross Below S4', 'Price crossed below S4'], ['alert9', 'Cross Below S5', 'Price crossed below S5']],
  'volume-weighted-price-z-score': [['alert0', 'Extreme Overbought', 'VWPZ: Extreme OVERBOUGHT condition detected! {{exchange}}:{{ticker}} - {{interval}}'], ['alert1', 'Extreme Oversold', 'VWPZ: Extreme OVERSOLD condition detected! {{exchange}}:{{ticker}} - {{interval}}'], ['alert2', 'Exit Extreme Overbought', 'VWPZ: Exiting extreme overbought zone {{exchange}}:{{ticker}} - {{interval}}'], ['alert3', 'Exit Extreme Oversold', 'VWPZ: Exiting extreme oversold zone {{exchange}}:{{ticker}} - {{interval}}'], ['alert4', 'Bullish Mean Reversion', 'VWPZ: Crossed above zero - Bullish momentum {{exchange}}:{{ticker}} - {{interval}}'], ['alert5', 'Bearish Mean Reversion', 'VWPZ: Crossed below zero - Bearish momentum {{exchange}}:{{ticker}} - {{interval}}'], ['alert6', 'Any Extreme Level', 'VWPZ: Extreme deviation detected! Check chart {{exchange}}:{{ticker}} - {{interval}}']],
  'volume-weighted-trend': [['alert0', 'Bullish Trend Signal', 'Volume Weighted Trend: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'], ['alert1', 'Bearish Trend Signal', 'Volume Weighted Trend: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'], ['alert2', 'Trend Direction Changed', 'Volume Weighted Trend: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}']],
  'volume-with-alert': [['alert0', 'Volume exceeds threshold', 'High volume on {{ticker}} ({{interval}}): exceeds the configured threshold.']],
  'volumetric-compressed-ma': [['alert0', 'Bullish Cross', 'Bullish Crossover Happened'], ['alert1', 'Bearish Cross', 'Bearish Crossunder Happened']],
  'volumetric-entropy-index': [['alert0', 'Drift Agreement Up', 'Both drift directions rising (Green Background)'], ['alert1', 'Drift Agreement Down', 'Both drift directions falling (Red Background)'], ['alert2', 'EMA DNA Bull Cross', 'EMA Up crossed above EMA Down'], ['alert3', 'EMA DNA Bear Cross', 'EMA Up crossed below EMA Down'], ['alert4', 'Net Drift Bullish', 'Smoothed Net Drift crossed above 0'], ['alert5', 'Net Drift Bearish', 'Smoothed Net Drift crossed below 0'], ['alert6', 'Drift Strength Spike', 'Drift Strength is spiking above 50-bar high']],
  'voss-predictive-filter': [['alert0', 'Voss Predictive Filter: Above +Threshold', 'VPF: voss crossed above +threshold'], ['alert1', 'Voss Predictive Filter: Below -Threshold', 'VPF: voss crossed below -threshold'], ['alert2', 'Voss Predictive Filter: Above Zero', 'VPF: voss crossed above zero'], ['alert3', 'Voss Predictive Filter: Below Zero', 'VPF: voss crossed below zero']],
};

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of daily bars with a random volume (5 % of the bars with a large volume) */
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
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
const S = (a: number[], list: Bar[] = bars) => Series.fromArray(list, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const vals = (p: { value: number }[]) => p.map((x) => x.value);
/** Pine ta.crossover / ta.crossunder: now and on the bar before (na compares false) */
const crossP = (a: number[], b: number[] | number, up: boolean) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pv = i > 0 ? a[i - 1] : NaN;
  const pw = i > 0 ? (typeof b === 'number' ? b : b[i - 1]) : NaN;
  return up ? v > w && pv <= pw : v < w && pv >= pw;
});
/** ta.crossover / ta.crossunder as the library runs them: the previous values are the last pair without na */
const crossKeep = (a: number[], b: number[], up: boolean) => {
  let pa = NaN, pb = NaN;
  return a.map((v, i) => {
    const w = b[i];
    const res = up ? v > w && pa <= pb : v < w && pa >= pb;
    if (!isNaN(v) && !isNaN(w)) { pa = v; pb = w; }
    return res;
  });
};
type Marker = { id?: string; time: unknown };
const idTimes = (ms: Marker[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'volume-sentiment-breakout-channels': vsbc, 'volume-spike-and-contraction-indicator': spike,
    'volume-surge-detector': surge, 'volume-weighted-ma-crossover': vwmaX, 'volume-weighted-money-flow': vwmf,
    'volume-weighted-pivot-bands': pivots, 'volume-weighted-price-z-score': zscore, 'volume-weighted-trend': vwTrend,
    'volume-with-alert': volAlert, 'volumetric-compressed-ma': vcma, 'volumetric-entropy-index': vei,
    'voss-predictive-filter': voss,
  };
  for (const [id, mod] of Object.entries(mods)) {
    it(id, () => expect(decls(mod)).toEqual(SPEC[id]));
  }
  it('alert() ports flag hasAlertFunction', () => {
    expect(vwRsi.hasAlertFunction).toBe(true);
    expect(vpsa.hasAlertFunction).toBe(true);
    expect(vwRsi.VolumeWeightedRsi.hasAlertFunction).toBe(true);
    expect(vpsa.VpsaVtd.hasAlertFunction).toBe(true);
  });
});

describe('alert conditions', () => {
  it('volume-sentiment-breakout-channels: channels formed and broken', () => {
    let r: ReturnType<typeof vsbc.calculate> | undefined;
    let list: Bar[] = [];
    // The original stops with an error on some price paths (see the port header): take a seed without it
    for (const seed of [3, 5, 7, 11, 13, 17, 19, 23, 29, 31]) {
      list = walk(1200, seed);
      try { r = vsbc.calculate(list); break; } catch { r = undefined; }
    }
    expect(r).toBeDefined();
    const res = r!;
    // ta.crossover(upper, lower) and duration > 10, with upper = stdev(normalised close, 14), lower = wma(upper, 14)
    const lo = A(ta.lowest(S(list.map((b) => b.low), list), 100));
    const hi = A(ta.highest(S(list.map((b) => b.high), list), 100));
    const norm = list.map((b, i) => (b.close - lo[i]) / (hi[i] - lo[i]));
    const upper = A(ta.stdev(S(norm, list), 14));
    const lower = A(ta.wma(S(upper, list), 14));
    const lowerOver = crossP(lower, upper, true);
    let last = -1;
    const duration = list.map((_b, i) => { if (lowerOver[i]) last = i; return last < 0 ? 1 : Math.max(i - last, 1); });
    const candidates = timeAt(list, crossP(upper, lower, true).map((v, i) => v && duration[i] > 10));
    expect(times(res, 0).length).toBeGreaterThan(0);
    expect(times(res, 0).every((t) => candidates.includes(t))).toBe(true);
    // the breaks: the ▲ / ▼ characters (from the third bar)
    const up = res.markers.filter((m) => m.text === '▲').map((m) => m.time as number);
    const down = res.markers.filter((m) => m.text === '▼').map((m) => m.time as number);
    expect(times(res, 1).length + times(res, 2).length).toBeGreaterThan(0);
    expect(times(res, 1).filter((t) => t >= (list[2].time as number))).toEqual(up);
    expect(times(res, 2).filter((t) => t >= (list[2].time as number))).toEqual(down);
  });

  it('volume-spike-and-contraction-indicator: spikes and contractions, marker ids', () => {
    const r = spike.calculate(bars);
    const vol = bars.map((b) => b.volume as number);
    const ma = A(ta.sma(S(vol), 20));
    const sd = A(ta.stdev(S(vol), 20));
    const sp = crossKeep(vol, ma.map((m, i) => m + 3 * sd[i]), true);
    const co = crossKeep(vol, ma.map((m, i) => m - 1 * sd[i]), false);
    expect(times(r, 0)).toEqual(timeAt(bars, sp));
    expect(times(r, 1)).toEqual(timeAt(bars, co));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    const bull = bars.map((b) => gt(b.close, b.open));
    expect(idTimes(r.markers, 'char0')).toEqual(timeAt(bars, sp.map((v, i) => v && bull[i])));
    expect(idTimes(r.markers, 'char1')).toEqual(timeAt(bars, sp.map((v, i) => v && !bull[i])));
    expect(idTimes(r.markers, 'char2')).toEqual(timeAt(bars, co.map((v, i) => v && bull[i])));
    expect(idTimes(r.markers, 'char3')).toEqual(timeAt(bars, co.map((v, i) => v && !bull[i])));
    expect(r.markers.every((m) => ['char0', 'char1', 'char2', 'char3'].includes(m.id as string))).toBe(true);
    // barstate.isconfirmed: no contraction on an open last bar
    const lastCo = co.lastIndexOf(true);
    const cut = bars.slice(0, lastCo + 1);
    expect(spike.calculate(cut).alerts[1].triggered).toBe(true);
    expect(spike.calculate(cut, {}, { lastBarConfirmed: false }).alerts[1].triggered).toBe(false);
  });

  it('volume-surge-detector: ratio above the surge levels', () => {
    const r = surge.calculate(bars, { trigger1: 3, trigger2: 6 });
    const vol = bars.map((b) => b.volume as number);
    const ma = A(ta.sma(S(vol), 14));
    expect(times(r, 0)).toEqual(timeAt(bars, vol.map((v, i) => v / ma[i] > 3)));
    expect(times(r, 1)).toEqual(timeAt(bars, vol.map((v, i) => v / ma[i] > 6)));
    expect(times(r, 1).length).toBeGreaterThan(0);
  });

  it('volume-weighted-ma-crossover: VWMA crossing the SMA', () => {
    const r = vwmaX.calculate(bars);
    const vw = A(ta.vwma(S(close), 20, S(bars.map((b) => b.volume as number))));
    const sma = A(ta.sma(S(close), 50));
    expect(times(r, 0)).toEqual(timeAt(bars, crossKeep(vw, sma, true)));
    expect(times(r, 1)).toEqual(timeAt(bars, crossKeep(vw, sma, false)));
    expect(times(r, 0).length).toBeGreaterThan(3);
  });

  it('volume-weighted-money-flow: 50 crosses and strength bands', () => {
    const r = vwmf.calculate(bars);
    const c = vals(r.plots.plot0 as { value: number }[]);
    const bull = vals(r.plots.plot1 as { value: number }[]);
    const bear = vals(r.plots.plot2 as { value: number }[]);
    const pc = (i: number) => (i > 0 ? c[i - 1] : NaN);
    expect(times(r, 0)).toEqual(timeAt(bars, c.map((v, i) => gt(v, 50) && le(pc(i), 50))));
    expect(times(r, 1)).toEqual(timeAt(bars, c.map((v, i) => lt(v, 50) && ge(pc(i), 50))));
    expect(times(r, 2)).toEqual(timeAt(bars, bull.map((v) => v >= 60 && v < 100)));
    expect(times(r, 3)).toEqual(timeAt(bars, bull.map((v) => v >= 100)));
    expect(times(r, 4)).toEqual(timeAt(bars, bear.map((v) => v >= 60 && v < 100)));
    expect(times(r, 5)).toEqual(timeAt(bars, bear.map((v) => v >= 100)));
    for (const k of [0, 1, 2, 3, 4, 5]) expect(times(r, k).length).toBeGreaterThan(0);
  });

  it('volume-weighted-pivot-bands: close crossing the R / S bands', () => {
    const r = pivots.calculate(bars, { multR: 0.1, multS: 0.1 });
    for (let k = 0; k < 5; k++) {
      expect(times(r, k)).toEqual(timeAt(bars, crossP(close, vals(r.plots[`plot${k}`] as { value: number }[]), true)));
      expect(times(r, k + 5)).toEqual(timeAt(bars, crossP(close, vals(r.plots[`plot${k + 5}`] as { value: number }[]), false)));
    }
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 5).length).toBeGreaterThan(0);
    // with an offset the alerts keep the unshifted bands
    expect(pivots.calculate(bars, { multR: 0.1, multS: 0.1, offsetPivots: 3 }).alerts).toEqual(r.alerts);
  });

  it('volume-weighted-price-z-score: extreme zones and zero crosses', () => {
    const r = zscore.calculate(bars, { extremeThreshold: 1.5 });
    const z = vals(r.plots.plot0 as { value: number }[]);
    const thr = 1.5;
    const enterPos = crossP(z, thr, true);
    const enterNeg = crossP(z, -thr, false);
    expect(times(r, 0)).toEqual(timeAt(bars, enterPos));
    expect(times(r, 1)).toEqual(timeAt(bars, enterNeg));
    expect(times(r, 2)).toEqual(timeAt(bars, crossP(z, thr, false)));
    expect(times(r, 3)).toEqual(timeAt(bars, crossP(z, -thr, true)));
    expect(times(r, 4)).toEqual(timeAt(bars, crossP(z, 0, true)));
    expect(times(r, 5)).toEqual(timeAt(bars, crossP(z, 0, false)));
    expect(times(r, 6)).toEqual(timeAt(bars, enterPos.map((v, i) => v || enterNeg[i])));
    for (const k of [0, 1, 2, 3, 4, 5]) expect(times(r, k).length).toBeGreaterThan(0);
  });

  it('volume-weighted-trend: trend turns', () => {
    const r = vwTrend.calculate(bars);
    const up = vals(r.plots.plot3 as { value: number }[]);
    const lo = vals(r.plots.plot5 as { value: number }[]);
    let dir = 0;
    const d = bars.map((b, i) => { if (b.close > up[i]) dir = 1; else if (b.close < lo[i]) dir = -1; return dir; });
    const bull = d.map((v, i) => i > 0 && v === 1 && d[i - 1] !== 1);
    const bear = d.map((v, i) => i > 0 && v === -1 && d[i - 1] !== -1);
    expect(times(r, 0)).toEqual(timeAt(bars, bull));
    expect(times(r, 1)).toEqual(timeAt(bars, bear));
    expect(times(r, 2)).toEqual(timeAt(bars, bull.map((v, i) => v || bear[i])));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });

  it('volume-with-alert: volume at or above the threshold', () => {
    const r = volAlert.calculate(bars, { threshold: 3e6 });
    expect(times(r, 0)).toEqual(timeAt(bars, bars.map((b) => (b.volume as number) >= 3e6)));
    expect(times(r, 0).length).toBeGreaterThan(10);
  });

  it('volumetric-compressed-ma: crosses of the two lines, marker ids', () => {
    const r = vcma.calculate(bars);
    const a = vals(r.plots.plot0 as { value: number }[]);
    const b = vals(r.plots.plot1 as { value: number }[]);
    const over = crossKeep(a, b, true);
    const under = crossKeep(a, b, false);
    expect(times(r, 0)).toEqual(timeAt(bars, over));
    expect(times(r, 1)).toEqual(timeAt(bars, under));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(idTimes(r.markers, 'shape0')).toEqual(times(r, 0));
    expect(idTimes(r.markers, 'shape1')).toEqual(times(r, 1));
    expect(r.markers.every((m) => ['shape0', 'shape1'].includes(m.id as string))).toBe(true);
  });

  it('volumetric-entropy-index: agreement, EMA and net drift crosses', () => {
    const r = vei.calculate(bars, { showNetDrift: true });
    const up = vals(r.plots.plot0 as { value: number }[]);
    const dn = vals(r.plots.plot1 as { value: number }[]);
    const net = vals(r.plots.plot2 as { value: number }[]);
    // the background: color.new(green, 70) when both drifts rise, color.new(red, 70) when neither does
    const green = new Set(r.bgColors.filter((c) => c.color === r.bgColors.find((x) => x.time === times(r, 0)[0])?.color).map((c) => c.time as number));
    expect(times(r, 0)).toEqual([...green]);
    expect(times(r, 0).length + times(r, 1).length).toBe(r.bgColors.length);
    expect(times(r, 2)).toEqual(timeAt(bars, crossP(up, dn, true)));
    expect(times(r, 3)).toEqual(timeAt(bars, crossP(up, dn, false)));
    expect(times(r, 4)).toEqual(timeAt(bars, crossP(net, 0, true)));
    expect(times(r, 5)).toEqual(timeAt(bars, crossP(net, 0, false)));
    // ta.crossover(x, ta.highest(x, 50)): the high includes the bar, never true
    expect(times(r, 6)).toEqual([]);
    for (const k of [0, 1, 2, 3, 4, 5]) expect(times(r, k).length).toBeGreaterThan(0);
  });

  it('voss-predictive-filter: threshold and zero crosses', () => {
    const r = voss.calculate(bars);
    const v = vals(r.plots.plot0 as { value: number }[]);
    const th = vals(r.plots.plot2 as { value: number }[]);
    expect(times(r, 0)).toEqual(timeAt(bars, crossP(v, th, true)));
    expect(times(r, 1)).toEqual(timeAt(bars, crossP(v, th.map((x) => -x), false)));
    expect(times(r, 2)).toEqual(timeAt(bars, crossP(v, 0, true)));
    expect(times(r, 3)).toEqual(timeAt(bars, crossP(v, 0, false)));
    for (const k of [0, 1, 2, 3]) expect(times(r, k).length).toBeGreaterThan(0);
    const off = voss.calculate(bars, { showThreshold: false });
    expect(times(off, 0)).toEqual([]);
    expect(times(off, 1)).toEqual([]);
    expect(times(off, 2)).toEqual(times(r, 2));
  });
});

describe('alert() calls', () => {
  it('volume-weighted-rsi: crosses of 50 and of the levels, once per bar', () => {
    const r = vwRsi.calculate(bars, { overbought: 62.5, oversold: 38 });
    const vol = bars.map((b) => b.volume as number);
    const upV = bars.map((b, i) => (i > 0 && b.close > bars[i - 1].close ? vol[i] : 0));
    const dnV = bars.map((b, i) => (i > 0 && b.close < bars[i - 1].close ? vol[i] : 0));
    const au = A(ta.rma(S(upV), 14));
    const ad = A(ta.rma(S(dnV), 14));
    const rsi = au.map((u, i) => 100 - 100 / (1 + u / ad[i]));
    const expected: { time: number; message: string; freq: string }[] = [];
    const lists: [boolean[], string][] = [
      [crossP(rsi, 50, true), 'VW RSI Bullish: Crossed above 50'],
      [crossP(rsi, 50, false), 'VW RSI Bearish: Crossed below 50'],
      [crossP(rsi, 62.5, true), 'VW RSI Overbought: Crossed above 62.5'],
      [crossP(rsi, 38, false), 'VW RSI Oversold: Crossed below 38'],
    ];
    bars.forEach((b, i) => {
      for (const [f, message] of lists) if (f[i]) expected.push({ time: b.time as number, message, freq: 'once_per_bar' });
    });
    expect(r.alertCalls).toEqual(expected);
    for (const [, m] of lists) expect(r.alertCalls.some((c) => c.message === m)).toBe(true);
  });

  it('vpsa-vtd: combined and separate alerts, marker ids', () => {
    const vol = bars.map((b) => b.volume as number);
    const spread = bars.map((b) => b.high - b.low);
    const norm = (src: number[]) => {
      const lo = A(ta.lowest(S(src), 14));
      const hi = A(ta.highest(S(src), 14));
      return src.map((v, i) => (Math.abs(hi[i] - lo[i]) > EPS ? (v - lo[i]) / (hi[i] - lo[i]) : 0));
    };
    const z = (src: number[]) => {
      const m = A(ta.ema(S(src), 14));
      const sd = A(ta.stdev(S(src), 14));
      return src.map((v, i) => (v - m[i]) / sd[i]);
    };
    const sn = norm(spread), vn = norm(vol), sz = z(spread), vz = z(vol);
    // sma_last > sma_first ('SMA', 'Upward', any bar), from bar 14
    const sma = A(ta.sma(S(vol), 14));
    const vtd = bars.map((_b, i) => i >= 14 && gt(sma[i], sma[i - 13]));
    const r = vpsa.calculate(bars);
    expect(idTimes(r.markers, 'shape2')).toEqual(timeAt(bars, vtd));
    expect(r.markers.every((m) => m.id === 'shape2')).toBe(true);
    expect(r.alertCalls).toEqual(timeAt(bars, vtd.map((v, i) => v && ge(sn[i], 0.2)))
      .map((time) => ({ time, message: 'Conditions met: Spread, Volume & Volume Trend Detector.', freq: 'once_per_bar' })));
    expect(r.alertCalls.length).toBeGreaterThan(0);

    const sep = vpsa.calculate(bars, { enableCombinedAlert: false, spreadSigmaCondition: 'less than or equal to' });
    const four = bars.map((_b, i) => ge(sn[i], 0.2) && le(sz[i], 1) && ge(vn[i], 0.2) && ge(vz[i], 1));
    const expected: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      if (four[i]) expected.push({ time: b.time as number, message: 'Conditions met: Spread & Volume.', freq: 'once_per_bar' });
      if (vtd[i]) expected.push({ time: b.time as number, message: 'Condition met: Volume Trend Detector', freq: 'once_per_bar' });
    });
    expect(sep.alertCalls).toEqual(expected);
    expect(four.some(Boolean)).toBe(true);

    // the other label outputs carry their ids
    const ids = (inp: Partial<vpsa.VpsaVtdInputs>) => [...new Set(vpsa.calculate(bars, inp).markers.map((m) => m.id))];
    expect(ids({ trendType: 'Step By Step', voldecPeriod: 2 })).toEqual(['shape0']);
    expect(ids({ trendType: 'Step By Step', trendDirection: 'Downward', voldecPeriod: 2 })).toEqual(['shape1']);
    expect(ids({ trendDirection: 'Downward' })).toEqual(['shape3']);
  });
});

describe('style', () => {
  it('vpci: no markers (the original draws the breaches as a cross plot)', () => {
    const r = vpci.calculate(bars) as { markers?: unknown[]; plots: Record<string, { value: number }[]> };
    expect(r.markers ?? []).toEqual([]);
    expect(r.plots.plot5.some((p) => Number.isFinite(p.value))).toBe(true);
  });
});
