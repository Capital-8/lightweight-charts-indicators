/**
 * Alerts and Style ids of 16 community ports (batch 03): the alertcondition() declarations (ids, titles and messages
 * of the originals), the bars on which each condition is true (re-computed here from the original's expression with
 * the library's ta primitives, or matched against the port's outputs of the same condition), the alert() calls
 * (bars, messages, frequency) and the ids of the drawn shape outputs.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as alphaSignal from '../../src/community/alpha-trading-signal-up-side-down';
import * as alphaTrend from '../../src/community/alpha-trend';
import * as amd from '../../src/community/amd-po3-with-live-edge-stats';
import * as andromeda from '../../src/community/andromeda-trendsync';
import * as angle from '../../src/community/angle-attack-follow-line-indicator';
import * as apex from '../../src/community/apex-volatility-squeeze-breakout';
import * as alma from '../../src/community/arnaud-legoux-gaussian-flow-alphanatt';
import * as purple from '../../src/community/asdqwe123-2-0';
import * as asym from '../../src/community/asymmetric-volatility-trend-line';
import * as hema from '../../src/community/atr-hema';
import * as devOsc from '../../src/community/atr-scaled-deviation-oscillator';
import * as trailColored from '../../src/community/atr-trailing-colored';
import * as targets from '../../src/community/atr-trailing-stop-with-atr-targets';
import * as trailStops from '../../src/community/atr-trailing-stops';
import * as volTrend from '../../src/community/atr-volatility-and-trend-analysis';
import * as zlema from '../../src/community/atr-zlema';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk with volatility regimes (quiet stretches and swings), a random volume */
function walk(count: number, seed0: number, step = 86400): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const vol = Math.floor(i / 60) % 3 === 0 ? 0.3 : 1.5;
    const o = p + (rnd() - 0.5) * vol;
    p = Math.max(5, o + Math.sin(i / 17) * 0.8 * vol + (rnd() - 0.5) * 3 * vol);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: 1577836800 + i * step, open: o, high: Math.max(o, p) + rnd() * vol, low: Math.min(o, p) - rnd() * vol, close: p, volume });
  }
  return out;
}
const bars = walk(1200, 11);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const S = (list: Bar[], a: number[]) => Series.fromArray(list, a);
const timesOf = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const alertTimes = (r: { alerts: { times: number[] }[] }) => r.alerts.map((a) => a.times);
const callTimes = (calls: { time: number; message: string }[], message: string | RegExp) =>
  calls.filter((c) => (typeof message === 'string' ? c.message === message : message.test(c.message))).map((c) => c.time);
/** ta.crossover / ta.crossunder (exact comparisons, na false) */
const xover = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const xunder = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);
const shift = <T,>(a: T[], k: number, na: T) => a.map((_, i) => (i >= k ? a[i - k] : na));
const markerIds = (markers: { id?: string }[]) => [...new Set(markers.map((m) => m.id))].sort();
const idsWithin = (markers: { id?: string }[], ids: string[]) => markers.every((m) => m.id !== undefined && ids.includes(m.id));

describe('community ports 03: alerts and style ids', () => {
  it('Alpha Trading Signal (Up side Down): SuperTrend alerts and the four shape ids', () => {
    expect(decls(alphaSignal)).toEqual([
      ['alert0', 'SuperTrend Buy', 'SuperTrend Buy!'],
      ['alert1', 'SuperTrend Sell', 'SuperTrend Sell!'],
      ['alert2', 'SuperTrend Direction Change', 'SuperTrend has changed direction!'],
    ]);
    const r = alphaSignal.calculate(bars);
    const src = bars.map((b) => (b.high + b.low) / 2);
    const atr = A(ta.atr(bars, 10));
    const trend: number[] = [];
    let upPrev = NaN, dnPrev = NaN, tr = 1;
    bars.forEach((b, i) => {
      let up = src[i] - 3 * atr[i];
      const up1 = isNaN(upPrev) ? up : upPrev;
      up = i > 0 && gt(bars[i - 1].close, up1) ? Math.max(up, up1) : up;
      let dn = src[i] + 3 * atr[i];
      const dn1 = isNaN(dnPrev) ? dn : dnPrev;
      dn = i > 0 && lt(bars[i - 1].close, dn1) ? Math.min(dn, dn1) : dn;
      tr = tr === -1 && gt(b.close, dn1) ? 1 : tr === 1 && lt(b.close, up1) ? -1 : tr;
      trend.push(tr);
      upPrev = up;
      dnPrev = dn;
    });
    const buy = trend.map((t, i) => i > 0 && t === 1 && trend[i - 1] === -1);
    const sell = trend.map((t, i) => i > 0 && t === -1 && trend[i - 1] === 1);
    const change = trend.map((t, i) => i > 0 && t !== trend[i - 1]);
    expect(alertTimes(r)).toEqual([timesOf(bars, buy), timesOf(bars, sell), timesOf(bars, change)]);
    expect(r.alerts[0].times.length).toBeGreaterThan(3);
    expect(markerIds(r.markers)).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    const byId = (id: string) => r.markers.filter((m) => m.id === id);
    expect(byId('shape0').every((m) => m.shape === 'circle' && r.alerts[0].times.includes(m.time as number))).toBe(true);
    expect(byId('shape1').every((m) => m.text === 'Buy')).toBe(true);
    expect(byId('shape2').every((m) => m.shape === 'circle' && r.alerts[1].times.includes(m.time as number))).toBe(true);
    expect(byId('shape3').every((m) => m.text === 'Sell')).toBe(true);
  });

  it('AlphaTrend: the ten alertconditions on the original AlphaTrend series', () => {
    expect(decls(alphaTrend)).toEqual([
      ['alert0', 'Potential BUY Alarm', 'BUY SIGNAL!'],
      ['alert1', 'Potential SELL Alarm', 'SELL SIGNAL!'],
      ['alert2', 'Confirmed BUY Alarm', 'BUY SIGNAL APPROVED!'],
      ['alert3', 'Confirmed SELL Alarm', 'SELL SIGNAL APPROVED!'],
      ['alert4', 'Price Cross Alert', 'Price - AlphaTrend Crossing!'],
      ['alert5', 'Candle CrossOver Alarm', 'LAST BAR is ABOVE ALPHATREND'],
      ['alert6', 'Candle CrossUnder Alarm', 'LAST BAR is BELOW ALPHATREND!'],
      ['alert7', 'Price Cross Alert After Bar Close', 'Price - AlphaTrend Crossing!'],
      ['alert8', 'Candle CrossOver Alarm After Bar Close', 'LAST BAR is ABOVE ALPHATREND!'],
      ['alert9', 'Candle CrossUnder Alarm After Bar Close', 'LAST BAR is BELOW ALPHATREND!'],
    ]);
    for (const useRSI of [false, true]) {
      const r = alphaTrend.calculate(bars, { useRSI });
      const close = bars.map((b) => b.close), low = bars.map((b) => b.low), high = bars.map((b) => b.high);
      const atr = A(ta.sma(ta.tr(bars), 14));
      const filt = useRSI ? A(ta.rsi(S(bars, close), 14))
        : A(ta.mfi(S(bars, bars.map((b) => (b.high + b.low + b.close) / 3)), 14, S(bars, bars.map((b) => b.volume ?? NaN))));
      const at: number[] = [];
      bars.forEach((b, i) => {
        const prev = i > 0 && !isNaN(at[i - 1]) ? at[i - 1] : 0; // nz(AlphaTrend[1])
        const upT = b.low - atr[i], downT = b.high + atr[i];
        at.push(filt[i] >= 50 ? (upT < prev ? prev : upT) : (downT > prev ? prev : downT));
      });
      const at2 = shift(at, 2, NaN);
      const buyK = xover(at, at2), sellK = xunder(at, at2);
      const since = (c: boolean[]) => { let l = -1; return c.map((f, i) => { if (f) l = i; return l < 0 ? NaN : i - l; }); };
      const K1 = since(buyK), K2 = since(sellK), O1 = since(shift(buyK, 1, false)), O2 = since(shift(sellK, 1, false));
      const cross = xover(close, at).map((f, i) => f || xunder(close, at)[i]);
      const expected = [
        buyK.map((f, i) => f && O1[i] > K2[i]),
        sellK.map((f, i) => f && O2[i] > K1[i]),
        bars.map((_, i) => i > 0 && buyK[i - 1] && O1[i - 1] > K2[i]),
        bars.map((_, i) => i > 0 && sellK[i - 1] && O2[i - 1] > K1[i]),
        cross,
        xover(low, at),
        xunder(high, at),
        xover(shift(close, 1, NaN), shift(at, 1, NaN)).map((f, i) => f || xunder(shift(close, 1, NaN), shift(at, 1, NaN))[i]),
        xover(shift(low, 1, NaN), shift(at, 1, NaN)),
        xunder(shift(high, 1, NaN), shift(at, 1, NaN)),
      ];
      expect(alertTimes(r)).toEqual(expected.map((f) => timesOf(bars, f)));
      for (let k = 0; k < 10; k++) expect(r.alerts[k].times.length).toBeGreaterThan(0);
    }
  });

  it('AMD Po3: alert() calls of the state machine (sweep / dist / outcome / canceled), formats and switches', () => {
    expect(amd.hasAlertFunction).toBe(true);
    expect(amd.AmdPo3WithLiveEdgeStats.hasAlertFunction).toBe(true);
    const intraday = walk(3000, 5, 900);
    const chart = { tickerid: 'NASDAQ:TEST', timeframe: '15', timezone: 'Etc/UTC' };
    const inputs = { cancelAlert: true, showLastCycles: 1000, historyStyle: 'outline' as const };
    const r = amd.calculate(intraday, inputs, chart);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    const labelTimes = (re: RegExp) => r.labels.filter((l) => re.test(l.text)).map((l) => l.time as number);
    const sweeps = callTimes(r.alertCalls, /^🌀 SWEEP (HIGH|LOW) \| NASDAQ:TEST \| TF: 15 \| Price: \d+\.\d{2} \| Time: \d{4}-\d\d-\d\d \d\d:\d\d \| cycle \d+$/);
    const dists = callTimes(r.alertCalls, /^(🟢 DIST ▲ UP|🔴 DIST ▼ DOWN) \(manip (HIGH|LOW)\) \| NASDAQ:TEST \| TF: 15 \| Entry: [\d.]+ \| Stop: [\d.]+ \| Target: [\d.]+ \| R:R: [\d.]+ \| Time: /);
    const outcomes = r.alertCalls.filter((c) => /^(🎯 TARGET REACHED|🛑 STOP HIT|🛑 STOP \(AMBIGUOUS\)|⏱ TIMEOUT) \| NASDAQ:TEST \| TF: 15 \| .+ \| Ref entry: [\d.]+ \| cycle \d+$/.test(c.message));
    expect(sweeps.length).toBeGreaterThan(2);
    expect(dists.length).toBeGreaterThan(1);
    expect(outcomes.length).toBeGreaterThan(1);
    // the DIST calls are on the D labels, the OUTCOME calls on the outcome labels (same bar and text)
    expect(dists).toEqual(labelTimes(/^D [▲▼]$/));
    expect(outcomes.map((c) => c.time)).toEqual(labelTimes(/^(AMB ✗|✓ \+|✗ -?|◌ )/));
    for (const c of outcomes) {
      const label = r.labels.find((l) => l.time === c.time && /^(AMB|✓|✗|◌)/.test(l.text));
      expect(c.message).toContain(` | ${label!.text} | `);
    }
    for (const [why, re] of [['EXPIRED', /^EXPIRED$/], ['2-SIDE', /^2-SIDE$/], ['TOO DEEP', /^TOO DEEP$/], ['BREAKOUT', /^BREAKOUT$/]] as const) {
      expect(callTimes(r.alertCalls, new RegExp(`^⚪ CANCELED \\(${why}\\) \\| NASDAQ:TEST \\| TF: 15 \\| cycle \\d+$`))).toEqual(labelTimes(re));
    }
    expect(r.alertCalls.length).toBe(sweeps.length + dists.length + outcomes.length
      + callTimes(r.alertCalls, /^⚪ CANCELED/).length);
    // at most one sweep per side and cycle
    const perCycle = new Map<string, number>();
    for (const c of r.alertCalls.filter((x) => x.message.startsWith('🌀'))) {
      const key = c.message.replace(/ \| Price.*cycle /, '|');
      perCycle.set(key, (perCycle.get(key) ?? 0) + 1);
    }
    expect([...perCycle.values()].every((v) => v === 1)).toBe(true);
    // the other outputs do not depend on the alert inputs; the switches
    const plain = amd.calculate(intraday, { showLastCycles: 1000, historyStyle: 'outline' }, chart);
    expect(plain.labels).toEqual(r.labels);
    expect(callTimes(plain.alertCalls, /^⚪ CANCELED/)).toEqual([]);
    expect(amd.calculate(intraday, { alertsOn: false }, chart).alertCalls).toEqual([]);
    expect(amd.calculate(intraday, { sweepAlert: false, distAlert: false }, chart).alertCalls
      .every((c) => !c.message.startsWith('🌀') && !c.message.includes('DIST'))).toBe(true);
    // webhook JSON
    const hook = amd.calculate(intraday, { ...inputs, webhook: true }, chart);
    expect(hook.alertCalls.map((c) => c.time)).toEqual(r.alertCalls.map((c) => c.time));
    const parsed = hook.alertCalls.filter((c) => c.message.startsWith('{')).map((c) => JSON.parse(c.message));
    expect(parsed.map((p) => p.event)).toEqual(expect.arrayContaining(['sweep', 'dist_confirmed', 'outcome']));
    expect(parsed.every((p) => p.schema === 1 && p.ind === 'v2.4.0' && p.ticker === 'NASDAQ:TEST' && p.tf === '15')).toBe(true);
  });

  it('ANDROMEDA - TrendSync: alert() calls on the buy / sell signals, once per bar', () => {
    expect(andromeda.hasAlertFunction).toBe(true);
    expect(andromeda.AndromedaTrendSync.hasAlertFunction).toBe(true);
    const r = andromeda.calculate(bars);
    const buy = r.markers.filter((m) => m.position === 'belowBar').map((m) => m.time);
    const sell = r.markers.filter((m) => m.position === 'aboveBar').map((m) => m.time);
    expect(buy.length).toBeGreaterThan(0);
    expect(sell.length).toBeGreaterThan(0);
    expect(callTimes(r.alertCalls, 'ALERTA DE COMPRA')).toEqual(buy);
    expect(callTimes(r.alertCalls, 'ALERTA DE VENDA')).toEqual(sell);
    expect(r.alertCalls.length).toBe(buy.length + sell.length);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar')).toBe(true);
  });

  it('Angle Attack Follow Line: seven alertconditions and the 14 shape ids', () => {
    expect(decls(angle)).toEqual([
      ['alert0', 'Sell', 'Sell'], ['alert1', 'Buy', 'Buy'], ['alert2', 'Add Sell', 'Add Sell'], ['alert3', 'Add Buy', 'Add Buy'],
      ['alert4', 'Reduce Buy', 'Reduce Buy'], ['alert5', 'Reduce Sell', 'Reduce Sell'],
      ['alert6', 'Buy/Sell/Add/Reduce', 'Buy/Sell/Add/Reduce'],
    ]);
    const all = Array.from({ length: 14 }, (_, k) => `shape${k}`);
    for (const opts of [{ aib: false }, { aib: false, addBuy1: true, addSell1: true, redBuy2: true, redSell4: true }]) {
      const r = angle.calculate(bars, opts);
      expect(idsWithin(r.markers, all)).toBe(true);
      const at = (ids: string[]) => [...new Set(r.markers.filter((m) => ids.includes(m.id!)).map((m) => m.time as number))]
        .sort((a, b) => a - b);
      expect(alertTimes(r)).toEqual([
        at(['shape0']), at(['shape1']), at(['shape2']), at(['shape3']),
        at(all.slice(4, 9)), at(all.slice(9, 14)), at(all),
      ]);
      for (let k = 0; k < 7; k++) expect(r.alerts[k].times.length).toBeGreaterThan(0);
      // text / colour of each id as the original's plotshape
      const texts: Record<string, string> = { shape0: 'Sell', shape1: 'Buy', shape2: 'Add', shape3: 'Add' };
      expect(r.markers.every((m) => m.text === (texts[m.id!] ?? 'Red'))).toBe(true);
      // the alerts do not depend on the labels being hidden
      const hidden = angle.calculate(bars, { ...opts, hideLabels: true });
      expect(hidden.markers).toEqual([]);
      expect(alertTimes(hidden)).toEqual(alertTimes(r));
    }
  });

  it('Apex Volatility Squeeze & Breakout: declarations; the conditions never hold, as in the original', () => {
    expect(decls(apex)).toEqual([
      ['alert0', 'Bullish Volatility Breakout', 'Price broke out of the squeeze upwards. Buy Signal.'],
      ['alert1', 'Bearish Volatility Breakout', 'Price broke out of the squeeze downwards. Sell Signal.'],
    ]);
    const r = apex.calculate(bars);
    expect(alertTimes(r)).toEqual([[], []]);
    expect(r.alerts.every((a) => !a.triggered)).toBe(true);
  });

  it('Arnaud Legoux Gaussian Flow: six alertconditions', () => {
    expect(decls(alma)).toEqual([
      ['alert0', 'ALMA Trend Long', 'Price crossed above ALMA in strong uptrend'],
      ['alert1', 'ALMA Trend Short', 'Price crossed below ALMA in strong downtrend'],
      ['alert2', 'ALMA Mean Reversion Long', 'Price in lower Gaussian zone - potential bounce'],
      ['alert3', 'ALMA Mean Reversion Short', 'Price in upper Gaussian zone - potential pullback'],
      ['alert4', 'ALMA Strong Uptrend', 'Strong uptrend detected'],
      ['alert5', 'ALMA Strong Downtrend', 'Strong downtrend detected'],
    ]);
    for (const envelopeMode of ['Adaptive', 'Fixed', 'Hybrid'] as const) {
      const r = alma.calculate(bars, { envelopeMode });
      const close = bars.map((b) => b.close);
      const m = 0.85 * 20, s = 21 / 6;
      const w = Array.from({ length: 21 }, (_, k) => Math.exp(-((k - m) ** 2) / (2 * s * s)));
      const raw = close.map((_, i) => w.reduce((acc, x, k) => acc + (i - k >= 0 ? close[i - k] : NaN) * x, 0) / w.reduce((a, x) => a + x, 0));
      const sm = A(ta.ema(S(bars, raw), 3));
      const atr = A(ta.atr(bars, 20));
      let base: number[];
      if (envelopeMode === 'Adaptive') {
        const accel = sm.map((v, i) => Math.abs(v - (i > 0 ? sm[i - 1] : NaN)));
        const avg = A(ta.sma(S(bars, accel), 20));
        base = atr.map((a, i) => a * 1.5 * (1 + accel[i] / avg[i]));
      } else if (envelopeMode === 'Hybrid') {
        const sd = A(ta.stdev(S(bars, close.map((c, i) => c - sm[i])), 20));
        base = atr.map((a, i) => ((a + sd[i]) / 2) * 1.5);
      } else base = atr.map((a) => a * 1.5);
      const mom = sm.map((v, i) => v - (i >= 14 ? sm[i - 14] : NaN));
      const momN = A(ta.ema(S(bars, mom), 5));
      const env = base.map((b, i) => b * Math.exp(-0.25 / 0.18) * (1 + (Math.abs(momN[i]) / sm[i]) * 10));
      const trendMA = A(ta.ema(S(bars, mom.map((v, i) => (v / sm[i]) * 100)), 5));
      const strongUp = close.map((c, i) => gt(trendMA[i], 0.5) && gt(c, sm[i]));
      const strongDn = close.map((c, i) => lt(trendMA[i], -0.5) && lt(c, sm[i]));
      const expected = [
        xover(close, sm).map((f, i) => f && strongUp[i]),
        xunder(close, sm).map((f, i) => f && strongDn[i]),
        close.map((c, i) => lt(c, sm[i] - env[i] * 0.95) && gt(trendMA[i], -0.5)),
        close.map((c, i) => gt(c, sm[i] + env[i] * 0.95) && lt(trendMA[i], 0.5)),
        strongUp.map((f, i) => f && !(i > 0 && strongUp[i - 1])),
        strongDn.map((f, i) => f && !(i > 0 && strongDn[i - 1])),
      ];
      expect(alertTimes(r)).toEqual(expected.map((f) => timesOf(bars, f)));
      for (let k = 2; k < 6; k++) expect(r.alerts[k].times.length).toBeGreaterThan(0);
    }
    // the trend continuation signals on crafted bars: a steady rise with a dip under the average (and the mirror)
    const craft = (f: (i: number) => number): Bar[] => Array.from({ length: 200 }, (_, i) => {
      const c = f(i);
      return { time: 1577836800 + i * 86400, open: c, high: c * 1.002, low: c * 0.998, close: c, volume: 1e6 };
    });
    const rise = craft((i) => 100 * Math.pow(1.01, i) * (i === 120 ? 0.8 : 1));
    expect(alma.calculate(rise).alerts[0].times).toEqual([rise[121].time]);
    const fall = craft((i) => 1000 * Math.pow(0.99, i) * (i === 120 ? 1.25 : 1));
    expect(alma.calculate(fall).alerts[1].times).toEqual([fall[121].time]);
  });

  it('Purple Cloud 2.0: PC Long / PC Short on the label bars, re-computed from the original expression', () => {
    expect(decls(purple)).toEqual([['alert0', 'PC Long', 'PC Long'], ['alert1', 'PC Short', 'PC Short']]);
    const r = purple.calculate(bars, { x1: 10, alpha: 0.3 });
    const close = bars.map((b) => b.close);
    const vol = S(bars, bars.map((b) => b.volume ?? NaN));
    const hv = S(bars, bars.map((b) => ((b.high + b.low) / 2) * (b.volume ?? NaN)));
    const x2 = A(ta.atr(bars, 10)).map((v) => v * 0.3);
    const a1 = A(ta.vwma(hv, 3, vol)).map((v, i) => v / A(ta.vwma(vol, 3, vol))[i]);
    const a2v = A(ta.vwma(hv, 5, vol)), a2d = A(ta.vwma(vol, 5, vol));
    const a4 = A(ta.vwma(S(bars, a1.map((v, i) => 2 * v - a2v[i] / a2d[i])), 10, vol));
    const sma = A(ta.sma(S(bars, close), 10));
    const long: boolean[] = [], short: boolean[] = [];
    let b1 = NaN, xs = NaN;
    bars.forEach((b, i) => {
      b1 = isNaN(b1) ? sma[i] : (b1 * 9 + b.close) / 10;
      const buy = le(a4[i], b.close - x2[i]) && gt(b.close, b1);
      const sell = ge(a4[i], b.close + x2[i]) && lt(b.close, b1);
      const nx = buy ? 1 : sell ? -1 : xs;
      const changed = !isNaN(nx) && !isNaN(xs) && nx !== xs;
      long.push(buy && changed);
      short.push(sell && changed);
      xs = nx;
    });
    expect(alertTimes(r)).toEqual([timesOf(bars, long), timesOf(bars, short)]);
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[1].times.length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(r.markers.filter((m) => m.text === 'BUY').map((m) => m.time));
  });

  it('Asymmetric Volatility Trend Line: bullish / bearish / any trend change', () => {
    expect(decls(asym)).toEqual([
      ['alert0', 'Bullish Trend Signal', 'Asymmetric Volatility Trend Line: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert1', 'Bearish Trend Signal', 'Asymmetric Volatility Trend Line: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert2', 'Any Trend Change', 'Asymmetric Volatility Trend Line: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}'],
    ]);
    const r = asym.calculate(bars);
    const close = bars.map((b) => b.close);
    const sd = A(ta.stdev(S(bars, close), 20));
    const dirs: number[] = [];
    let line = NaN, dir = 0;
    close.forEach((s, i) => {
      const v = sd[i] * 1.5;
      if (isNaN(line)) line = s;
      else if (dir >= 0) {
        if (gt(s, line + v * 0.5)) { line = Math.max(line, s - v * 0.25); dir = 1; } else if (lt(s, line - v)) { line = s + v * 0.25; dir = -1; }
      } else if (lt(s, line - v * 0.5)) { line = Math.min(line, s + v * 0.25); dir = -1; } else if (gt(s, line + v)) { line = s - v * 0.25; dir = 1; }
      dirs.push(dir);
    });
    const bull = dirs.map((d, i) => i > 0 && d === 1 && dirs[i - 1] === -1);
    const bear = dirs.map((d, i) => i > 0 && d === -1 && dirs[i - 1] === 1);
    expect(alertTimes(r)).toEqual([timesOf(bars, bull), timesOf(bars, bear), timesOf(bars, bull.map((f, i) => f || bear[i]))]);
    expect(r.alerts[0].times.length).toBeGreaterThan(2);
  });

  it('ATR HEMA: positive / negative trend on the L / S triangles', () => {
    expect(decls(hema)).toEqual([
      ['alert0', 'ATR HEMA Postive Trend', 'ATR HEMA Bullish Signal on: {{exchange}}:{{ticker}}'],
      ['alert1', 'ATR HEMA Negative Trend', 'ATR HEMA Bearish Signal on: {{exchange}}:{{ticker}}'],
    ]);
    const r = hema.calculate(bars);
    const src = bars.map((b) => (b.high + b.low) / 2);
    const atr = A(ta.atr(bars, 14));
    const a = 2 / 21, g = 2 / 21;
    let h1 = NaN, b1 = NaN, prevCol = 0;
    const long: boolean[] = [], short: boolean[] = [];
    src.forEach((s, i) => {
      const h = (1 - a) * ((isNaN(h1) ? 0 : h1) + (isNaN(b1) ? s : b1)) + a * s;
      const bb = (1 - g) * (isNaN(b1) ? 0 : b1) + g * (h - (isNaN(h1) ? 0 : h1));
      const ch = h - h1;
      const col = lt(Math.abs(ch), atr[i] * 0.04) ? prevCol : gt(ch, 0) ? 1 : -1;
      long.push(col === 1 && prevCol === -1);
      short.push(col === -1 && prevCol === 1);
      prevCol = col;
      h1 = h;
      b1 = bb;
    });
    expect(alertTimes(r)).toEqual([timesOf(bars, long), timesOf(bars, short)]);
    expect(r.alerts[0].times.length).toBeGreaterThan(2);
    expect(r.alerts[0].times).toEqual(r.markers.filter((m) => m.position === 'belowBar').map((m) => m.time));
  });

  it('ATR-Scaled Deviation Oscillator: long / short threshold crosses', () => {
    expect(decls(devOsc)).toEqual([
      ['alert0', 'ATR-DevOsc Long', 'ATR-DevOsc: Long signal on {{ticker}} at {{close}}'],
      ['alert1', 'ATR-DevOsc Short', 'ATR-DevOsc: Short signal on {{ticker}} at {{close}}'],
    ]);
    const r = devOsc.calculate(bars);
    const c = (i: number) => (i >= 0 ? bars[i].close : NaN);
    const atr = A(ta.atr(bars, 14));
    const avg = A(ta.sma(S(bars, atr), 14));
    const osc = bars.map((_, i) => {
      let sum = 0;
      for (let k = 0; k < 20; k++) sum += (c(i - k) - c(i - k - 20)) ** 2;
      const ratio = Math.abs(avg[i]) <= 1e-10 ? 1 : (atr[i] / avg[i]) * 1.5;
      const adj = Math.sqrt(sum / 20) / ratio;
      return (c(i) - c(i - 20)) / (Math.abs(adj) <= 1e-10 ? 1 : adj);
    });
    const sm = A(ta.ema(S(bars, osc), 2));
    expect(alertTimes(r)).toEqual([timesOf(bars, xover(sm, sm.map(() => 1))), timesOf(bars, xunder(sm, sm.map(() => -1)))]);
    expect(r.alerts[0].times.length).toBeGreaterThan(2);
    expect(r.alerts[1].times.length).toBeGreaterThan(2);
  });

  it('ATR Trailing Stops Colored: no alerts and no shape in the original (markers left as they are)', () => {
    const r = trailColored.calculate(bars) as unknown as { markers: unknown[] };
    expect('alertConditions' in trailColored).toBe(false);
    expect(Array.isArray(r.markers)).toBe(true);
  });

  it('ATR Trailing Stop with ATR Targets: flip buy / sell', () => {
    expect(decls(targets)).toEqual([
      ['alert0', 'ATR Flip Buy', 'ATR trailing stop flipped bullish — BUY'],
      ['alert1', 'ATR Flip Sell', 'ATR trailing stop flipped bearish — SELL'],
    ]);
    for (const initialTrend of ['Bullish', 'Bearish'] as const) {
      const r = targets.calculate(bars, { initialTrend, showSignals: false });
      const atr = A(ta.atr(bars, 14));
      let trend = initialTrend === 'Bullish' ? 1 : -1, hh = NaN, ll = NaN;
      const buy: boolean[] = [], sell: boolean[] = [];
      bars.forEach((b, i) => {
        if (i === 0) { hh = b.high; ll = b.low; }
        let bs = false, ss = false;
        if (trend === 1) {
          hh = isNaN(hh) ? b.high : Math.max(hh, b.high);
          if (lt(b.close, hh - atr[i] * 2)) { trend = -1; hh = NaN; ll = b.low; ss = true; }
        } else {
          ll = isNaN(ll) ? b.low : Math.min(ll, b.low);
          if (gt(b.close, ll + atr[i] * 2)) { trend = 1; ll = NaN; hh = b.high; bs = true; }
        }
        buy.push(bs);
        sell.push(ss);
      });
      expect(r.markers).toEqual([]);
      expect(alertTimes(r)).toEqual([timesOf(bars, buy), timesOf(bars, sell)]);
      expect(r.alerts[0].times.length).toBeGreaterThan(2);
    }
  });

  it('ATR + Trailing Stops: the original crosses of the trailing short / long stop', () => {
    expect(decls(trailStops)).toEqual([
      ['alert0', 'Long: Price crossed ATR up', 'Price crossed the trailing ATR short stop (bullish)'],
      ['alert1', 'Short: Price crossed ATR down', 'Price crossed trailing ATR long stop (bearish)'],
    ]);
    const len = 14, mult = 3;
    const r = trailStops.calculate(bars, { atrPeriod: len, atrMultiplier: mult });
    // the original, line by line (bar 0: close[1] is na, so the adjusted true range is na)
    const adj = bars.map((b, i) => (i === 0 ? NaN
      : Math.max(Math.abs(b.open - b.close), Math.abs(b.open - bars[i - 1].close), Math.abs(b.close - bars[i - 1].close))
        + (b.high - Math.max(b.open, b.close) + Math.min(b.open, b.close) - b.low)));
    const atrV = A(ta.rma(S(bars, adj), len));
    let tl = NaN, ts = NaN;
    const isLongH: (boolean | null)[] = [], isShortH: (boolean | null)[] = [];
    const lp: number[] = [], sp: number[] = [];
    bars.forEach((b, i) => {
      const lo = b.low - atrV[i] * mult, hi = b.high + atrV[i] * mult;
      tl = le(lo, tl) ? tl : lo; // f_trail(atrLow, trailAtrLong, 'up')
      ts = ge(hi, ts) ? ts : hi; // f_trail(atrHigh, trailAtrShort, 'down')
      const pl = i > 0 ? isLongH[i - 1] : null, ps = i > 0 ? isShortH[i - 1] : null;
      let fl = !!ps && gt(b.close, ts);
      let fs = !!pl && lt(b.close, tl);
      fl = fs && fl && gt(b.close, tl) ? true : fs && fl && le(b.close, tl) ? false : fl;
      fs = fl && fs && lt(b.close, ts) ? true : fs && fl && ge(b.close, ts) ? false : fs;
      const il = fl ? true : fs ? false : pl === null ? true : pl;
      const is = fs ? true : fl ? false : ps === null ? true : ps;
      if (il && pl === false) tl = lo;
      if (is && ps === false) ts = hi;
      isLongH.push(il);
      isShortH.push(is);
      lp.push(il ? tl : NaN);
      sp.push(is ? ts : NaN);
    });
    const c = bars.map((b) => b.close);
    const up = c.map((v, i) => i >= 2 && gt(v, sp[i - 1]) && le(c[i - 1], sp[i - 2]));
    const down = c.map((v, i) => i >= 2 && lt(v, lp[i - 1]) && ge(c[i - 1], lp[i - 2]));
    expect(alertTimes(r)).toEqual([timesOf(bars, up), timesOf(bars, down)]);
    expect(r.alerts[0].times.length).toBeGreaterThan(2);
    expect(r.alerts[1].times.length).toBeGreaterThan(2);
  });

  it('ATR Volatility and Trend Analysis: the five alert() calls, once per bar close', () => {
    expect(volTrend.hasAlertFunction).toBe(true);
    expect(volTrend.AtrVolatilityAndTrendAnalysis.hasAlertFunction).toBe(true);
    const r = volTrend.calculate(bars, { showVolSignals: false, showTrend: false });
    expect(r.markers).toEqual([]);
    const close = bars.map((b) => b.close);
    const atr = A(ta.atr(bars, 14));
    const atrSma = A(ta.sma(S(bars, atr), 14));
    const srcSma = A(ta.sma(S(bars, close), 21));
    const atrSma21 = A(ta.sma(S(bars, atr), 21));
    const brk = atr.map((v, i) => gt(v, atrSma[i] * 1.5));
    const trend = close.map((v, i) => (gt(atr[i], atrSma21[i]) ? (gt(v, srcSma[i]) ? 1 : -1) : 0));
    const vol = brk.map((f, i) => f && !(i > 0 && brk[i - 1]));
    const bull = trend.map((t, i) => i > 0 && t === 1 && trend[i - 1] !== 1);
    const bear = trend.map((t, i) => i > 0 && t === -1 && trend[i - 1] !== -1);
    expect(callTimes(r.alertCalls, 'ATR Volatility Breakout')).toEqual(timesOf(bars, vol));
    expect(callTimes(r.alertCalls, 'ATR Bullish Trend Signal')).toEqual(timesOf(bars, bull));
    expect(callTimes(r.alertCalls, 'ATR Bearish Trend Signal')).toEqual(timesOf(bars, bear));
    expect(callTimes(r.alertCalls, 'Price Above ATR Band 1')).toEqual(timesOf(bars, xover(close, close.map((v, i) => v + atr[i]))));
    expect(callTimes(r.alertCalls, 'Price Below ATR Band 1')).toEqual(timesOf(bars, xunder(close, close.map((v, i) => v - atr[i]))));
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    for (const m of ['ATR Volatility Breakout', 'ATR Bullish Trend Signal', 'ATR Bearish Trend Signal']) {
      expect(callTimes(r.alertCalls, m).length).toBeGreaterThan(0);
    }
    // the bands are close +- ATR: the close never crosses them (as in the original, these two calls never run)
    expect(callTimes(r.alertCalls, /ATR Band 1/)).toEqual([]);
  });

  it('ATR ZLEMA: trend alerts and the four shape ids (core and glow)', () => {
    expect(decls(zlema)).toEqual([
      ['alert0', 'Bullish Trend', 'ATR ZLEMA: BULLISH trend detected on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert1', 'Bearish Trend', 'ATR ZLEMA: BEARISH trend detected on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert2', 'Any Trend Change', 'ATR ZLEMA: Trend reversal detected! Check chart {{exchange}}:{{ticker}} - {{interval}}'],
    ]);
    const r = zlema.calculate(bars);
    const close = bars.map((b) => b.close);
    const atr = A(ta.rma(ta.tr(bars, true), 14));
    const raw = A(ta.ema(S(bars, close.map((v, i) => (i >= 6 ? 2 * v - close[i - 6] : NaN))), 14));
    let z = NaN, zl = NaN, trend = 1;
    const tr: number[] = [];
    bars.forEach((_, i) => {
      if (isNaN(z)) z = raw[i];
      else if (gt(Math.abs(raw[i] - z), atr[i] * 0.3)) z = raw[i];
      const band = atr[i] * 3.5;
      if (isNaN(zl)) zl = z - band;
      if (trend === 1) { if (lt(z, zl)) { trend = -1; zl = z + band; } else zl = Math.max(zl, z - band); } else if (gt(z, zl)) { trend = 1; zl = z - band; } else zl = Math.min(zl, z + band);
      tr.push(trend);
    });
    const bull = tr.map((t, i) => i > 0 && t === 1 && tr[i - 1] === -1);
    const bear = tr.map((t, i) => i > 0 && t === -1 && tr[i - 1] === 1);
    expect(alertTimes(r)).toEqual([timesOf(bars, bull), timesOf(bars, bear), timesOf(bars, bull.map((f, i) => f || bear[i]))]);
    expect(r.alerts[0].times.length).toBeGreaterThan(1);
    expect(markerIds(r.markers)).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    const of = (id: string) => r.markers.filter((m) => m.id === id);
    expect(of('shape0').map((m) => m.time)).toEqual(r.alerts[0].times);
    expect(of('shape1').map((m) => m.time)).toEqual(r.alerts[0].times);
    expect(of('shape0').every((m) => m.size === 'tiny') && of('shape1').every((m) => m.size === 'small')).toBe(true);
    expect(of('shape2').map((m) => m.time)).toEqual(r.alerts[1].times);
    expect(of('shape3').every((m) => m.shape === 'triangleDown' && m.size === 'small')).toBe(true);
  });
});
