/**
 * Community ports, batch 47: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers / background colours.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, str, color, type Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as whale from '../../src/community/whale-volume-absorption-aggression-maxmaserati-3-0';
import * as wick from '../../src/community/wick-volume-alert';
import * as bbdiv from '../../src/community/williams-bbdiv-signal';
import * as xauAlerts from '../../src/community/xauusd-buy-sell-alerts-with-sl-tp';
import * as xauScalp from '../../src/community/xauusd-family-scalping';
import * as zscore from '../../src/community/z-score-oscillator';
import * as zlHma from '../../src/community/zero-lag-hma-trend-suite';
import * as zlLoop from '../../src/community/zero-lag-signals-for-loop';
import * as zlts from '../../src/community/zero-lag-trend-signals';
import * as zlma from '../../src/community/zlma-trend-levels';

const AF = 'Alert Fired!';
const ZLTS_SPEC: [string, string, string][] = [
  ['alert0', 'Bullish Entry Signal', 'Bullish Entry Signal detected. Consider entering a long position.'],
  ['alert1', 'Bearish Entry Signal', 'Bearish Entry Signal detected. Consider entering a short position.'],
  ['alert2', 'Bullish Trend', AF], ['alert3', 'Bearish Trend', AF], ['alert4', '(Bullish or Bearish) Trend', AF],
  ['alert5', 'Bullish Trend Time Frame 1', AF], ['alert6', 'Bearish Trend Time Frame 1', AF], ['alert7', '(Bullish or Bearish) Trend Time Frame 1', AF],
  ['alert8', 'Bullish Trend Time Frame 2', AF], ['alert9', 'Bearish Trend Time Frame 2', AF], ['alert10', '(Bullish or Bearish) Trend Time Frame 2', AF],
  ['alert11', 'Bullish Trend Time Frame 3', AF], ['alert12', 'Bearish Trend Time Frame 3', AF], ['alert13', '(Bullish or Bearish) Trend Time Frame 3', AF],
  ['alert14', 'Bullish Trend Time Frame 4', AF], ['alert15', 'Bearish Trend Time Frame 4', AF], ['alert16', '(Bullish or Bearish) Trend Time Frame 4', AF],
  ['alert17', 'Bullish Trend Time Frame 5', AF], ['alert18', 'Bearish Trend Time Frame 5', AF], ['alert19', '(Bullish or Bearish) Trend Time Frame 5', AF],
  ['alert20', 'Bullish Entry', AF], ['alert21', 'Bearish Entry', AF],
];

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'williams-bbdiv-signal': [['alert0', 'Buy Signal', 'Final Buy Signal Triggered'], ['alert1', 'Sell Signal', 'Final Sell Signal Triggered']],
  'xauusd-buy-sell-alerts-with-sl-tp': [['alert0', 'Buy Alert', 'XAUUSD BUY Signal'], ['alert1', 'Sell Alert', 'XAUUSD SELL Signal']],
  'xauusd-family-scalping': [['alert0', 'Buy Signal', 'BUY: Oscillator crossed above oversold (-58)'], ['alert1', 'Sell Signal', 'SELL: Oscillator crossed below overbought (58)']],
  'z-score-oscillator': [
    ['alert0', 'Cross Above Upper Band', 'Crossed above upper band'], ['alert1', 'Cross Below Lower Band', 'Crossed below lower band'],
    ['alert2', 'Return From Overbought', 'Returning from overbought'], ['alert3', 'Return From Oversold', 'Returning from oversold'],
    ['alert4', 'Zero Cross Up', 'Crossed above zero'], ['alert5', 'Zero Cross Down', 'Crossed below zero'],
    ['alert6', 'Regular Bullish Divergence', 'Regular bullish divergence detected'], ['alert7', 'Regular Bearish Divergence', 'Regular bearish divergence detected'],
    ['alert8', 'Hidden Bullish Divergence', 'Hidden bullish divergence detected'], ['alert9', 'Hidden Bearish Divergence', 'Hidden bearish divergence detected'],
  ],
  'zero-lag-hma-trend-suite': [
    ['alert0', 'Buy Signal', 'Buy Signal: Price crossed below Zero Lag HMA minus ATR threshold.'],
    ['alert1', 'Sell Signal', 'Sell Signal: Price crossed above Zero Lag HMA plus ATR threshold.'],
    ['alert2', 'Reversal Up Signal', 'Reversal Up Signal: Price crossed above Zero Lag HMA minus ATR threshold.'],
    ['alert3', 'Reversal Down Signal', 'Reversal Down Signal: Price crossed below Zero Lag HMA plus ATR threshold.'],
    ['alert4', 'Bullish Trend Start', 'Trend Shift: Bullish trend started.'],
    ['alert5', 'Bearish Trend Start', 'Trend Shift: Bearish trend started.'],
  ],
  'zero-lag-signals-for-loop': [['alert0', 'Zero Lag Signals Long', 'Zero Lag Signals Long {{exchange}}:{{ticker}}'], ['alert1', 'Zero Lag Signals Short', 'Zero Lag Signals Short {{exchange}}:{{ticker}}']],
  'zero-lag-trend-signals': ZLTS_SPEC,
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
const bars = walk(1200, 47);
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
type Marker = { id?: string; time: unknown; text?: string; shape?: string; position?: string; color?: string };
const idTimes = (ms: Marker[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);
const idsOf = (ms: { id?: string }[]) => [...new Set(ms.map((m) => m.id))].sort();

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'williams-bbdiv-signal': bbdiv, 'xauusd-buy-sell-alerts-with-sl-tp': xauAlerts, 'xauusd-family-scalping': xauScalp,
    'z-score-oscillator': zscore, 'zero-lag-hma-trend-suite': zlHma, 'zero-lag-signals-for-loop': zlLoop,
    'zero-lag-trend-signals': zlts,
  };
  for (const [id, mod] of Object.entries(mods)) {
    it(id, () => expect(decls(mod)).toEqual(SPEC[id]));
  }
  it('indicator objects carry the declarations', () => {
    expect(bbdiv.WilliamsBbdivSignal.alertConditions).toBe(bbdiv.alertConditions);
    expect(xauAlerts.XauusdBuySellAlertsWithSlTp.alertConditions).toBe(xauAlerts.alertConditions);
    expect(xauScalp.XauusdFamilyScalping.alertConditions).toBe(xauScalp.alertConditions);
    expect(zscore.ZScoreOscillator.alertConditions).toBe(zscore.alertConditions);
    expect(zlHma.ZeroLagHMATrendSuite.alertConditions).toBe(zlHma.alertConditions);
    expect(zlLoop.ZeroLagSignalsForLoop.alertConditions).toBe(zlLoop.alertConditions);
    expect(zlts.ZeroLagTrendSignals.alertConditions).toBe(zlts.alertConditions);
  });
  it('alert() ports flag hasAlertFunction', () => {
    expect(wick.hasAlertFunction).toBe(true);
    expect(wick.WickVolumeAlert.hasAlertFunction).toBe(true);
    expect(xauAlerts.hasAlertFunction).toBe(true);
    expect(xauAlerts.XauusdBuySellAlertsWithSlTp.hasAlertFunction).toBe(true);
  });
});

describe('alert conditions and alert() calls', () => {
  it('wick-volume-alert: alert() on closed long-wick bars with high volume', () => {
    const flags = bars.map((b, i) => {
      const body = Math.abs(b.close - b.open);
      const upper = (b.high - Math.max(b.open, b.close)) / body;
      const lower = (Math.min(b.open, b.close) - b.low) / body;
      const highVol = i > 0 && ge(b.volume as number, (bars[i - 1].volume as number) * 1.3);
      return highVol && (ge(upper, 1.8) || ge(lower, 1.8));
    });
    const r = wick.calculate(bars);
    expect(r.alertCalls).toEqual(timeAt(bars, flags).map((time) => ({ time, message: 'Long wick detected!', freq: 'once_per_bar_close' })));
    expect(r.alertCalls.length).toBeGreaterThan(10);
    // custom message, price limit
    const lim = wick.calculate(bars, { alertMessage: 'X', useUpperPriceLimit: true, upperPriceLimit: 100 });
    expect(lim.alertCalls).toEqual(timeAt(bars, flags.map((f, i) => f && gt(close[i], 100))).map((time) => ({ time, message: 'X', freq: 'once_per_bar_close' })));
    // an open last bar makes no call (barstate.isconfirmed)
    const k = flags.lastIndexOf(true);
    const part = bars.slice(0, k + 1);
    expect(wick.calculate(part, {}, { lastBarConfirmed: false } as ChartContext).alertCalls.some((c) => c.time === part[k].time)).toBe(false);
    expect(wick.calculate(part, {}, { lastBarConfirmed: true } as ChartContext).alertCalls.some((c) => c.time === part[k].time)).toBe(true);
  });

  it('williams-bbdiv-signal: final buy / sell (MA + BB signals, pause, %R zone)', () => {
    const hh = A(ta.highest(S(bars.map((b) => b.high)), 14));
    const ll = A(ta.lowest(S(bars.map((b) => b.low)), 14));
    const pr = close.map((c, i) => (100 * (c - hh[i])) / (hh[i] - ll[i]));
    const ma = A(ta.sma(S(pr), 14));
    const bb = A(ta.sma(S(pr), 14));
    const sd = A(ta.stdev(S(pr), 14)).map((v) => v * 2);
    const up = bb.map((v, i) => v + sd[i]);
    const lo = bb.map((v, i) => v - sd[i]);
    const cMA = crossP(pr, ma, true), uMA = crossP(pr, ma, false), cBB = crossP(pr, lo, true), uBB = crossP(pr, up, false);
    let lastBuy = NaN, lastSell = NaN;
    const buy: boolean[] = [], sell: boolean[] = [];
    for (let i = 0; i < bars.length; i++) {
      const bp = isNaN(lastBuy) || i - lastBuy >= 7;
      const sp = isNaN(lastSell) || i - lastSell >= 7;
      const inBuy = ge(pr[i], -95) && le(pr[i], -75);
      const inSell = ge(pr[i], -35) && le(pr[i], -10);
      const bMA = cMA[i] && bp && inBuy, sMA = uMA[i] && sp && inSell;
      const bBB = cBB[i] && bp && inBuy, sBB = uBB[i] && sp && inSell;
      if (bMA || bBB) lastBuy = i;
      if (sMA || sBB) lastSell = i;
      buy.push(bMA || bBB);
      sell.push(sMA || sBB);
    }
    const r = bbdiv.calculate(bars, { divergenceModeInput: false });
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    expect(buy.filter(Boolean).length).toBeGreaterThan(5);
    expect(sell.filter(Boolean).length).toBeGreaterThan(5);
    // default inputs (divergences on): the alerts are the Connector's 1 / -1
    const d = bbdiv.calculate(bars);
    const conn = vals(d.plots.plot6 as { value: number }[]);
    expect(times(d, 0)).toEqual(timeAt(bars, conn.map((v) => v === 1)));
    expect(times(d, 1)).toEqual(timeAt(bars, conn.map((v) => v === -1)));
  });

  it('xauusd-buy-sell-alerts-with-sl-tp: conditions and alert() calls with SL / TP', () => {
    const f = A(ta.ema(S(close), 9)), s = A(ta.ema(S(close), 21)), rsi = A(ta.rsi(S(close), 14));
    const buy = crossP(f, s, true).map((v, i) => v && lt(rsi[i], 60));
    const sell = crossP(f, s, false).map((v, i) => v && gt(rsi[i], 40));
    const r = xauAlerts.calculate(bars);
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
    const fmt = (x: number) => str.tostring(x, 'price');
    const expected: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      const c = b.close;
      if (buy[i]) expected.push({ time: b.time as number, freq: 'once_per_bar_close', message: `XAUUSD BUY\nEntry: ${fmt(c)}\nSL: ${fmt(c - 3)}\nTP: ${fmt(c + 10)}` });
      if (sell[i]) expected.push({ time: b.time as number, freq: 'once_per_bar_close', message: `XAUUSD SELL\nEntry: ${fmt(c)}\nSL: ${fmt(c + 3)}\nTP: ${fmt(c - 10)}` });
    });
    expect(r.alertCalls).toEqual(expected);
    expect(r.alertCalls[0].message).toMatch(/^XAUUSD (BUY|SELL)\nEntry: \S+\nSL: \S+\nTP: \S+$/);
  });

  it('xauusd-family-scalping: oscillator crosses of the levels', () => {
    const mid = A(ta.sma(S(bars.map((b) => (b.high + b.low) / 2)), 30));
    const rng = A(ta.sma(S(bars.map((b) => b.high - b.low)), 30));
    const body = A(ta.sma(S(bars.map((b) => Math.abs(b.close - b.open))), 30));
    const osc = close.map((c, i) => {
      const off = (rng[i] * 200) / 100 * (1 + body[i] / Math.max(rng[i], 1e-10));
      return (100 * (c - (mid[i] - off))) / Math.max(2 * off, 1e-10) - 50;
    });
    const r = xauScalp.calculate(bars, { overbought: 20, oversold: -20 });
    const buy = crossP(osc, -20, true), sell = crossP(osc, 20, false);
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
  });

  it('z-score-oscillator: band / zero crosses and divergences', () => {
    const r = zscore.calculate(bars, { divEnabled: true, divPlotHidBull: true, divPlotHidBear: true });
    const main = vals(r.plots.plot22 as { value: number }[]);
    const upper = vals(r.plots.plot17 as { value: number }[]);
    const lower = vals(r.plots.plot18 as { value: number }[]);
    const exp = [crossP(main, upper, true), crossP(main, lower, false), crossP(main, upper, false), crossP(main, lower, true),
      crossP(main, 0, true), crossP(main, 0, false)];
    exp.forEach((f, k) => {
      expect(times(r, k)).toEqual(timeAt(bars, f));
      expect(f.some(Boolean)).toBe(true);
    });
    // divergences from the displayed value (lookbacks 5 / 5, range 5..60)
    const n = bars.length;
    const pl = A(ta.pivotlow(S(main), 5, 5)).map((v) => !isNaN(v));
    const ph = A(ta.pivothigh(S(main), 5, 5)).map((v) => !isNaN(v));
    const since = (f: boolean[]) => {
      let c = NaN;
      return f.map((_v, i) => (c = i > 0 && f[i - 1] ? 0 : isNaN(c) ? NaN : c + 1));
    };
    const sPl = since(pl), sPh = since(ph);
    const valueWhen1 = (f: boolean[], x: number[]) => {
      const seen: number[] = [];
      return f.map((v, i) => { if (v) seen.push(x[i]); return seen.length >= 2 ? seen[seen.length - 2] : NaN; });
    };
    const mR = main.map((_v, i) => (i >= 5 ? main[i - 5] : NaN));
    const lowR = bars.map((_b, i) => (i >= 5 ? bars[i - 5].low : NaN));
    const highR = bars.map((_b, i) => (i >= 5 ? bars[i - 5].high : NaN));
    const pPlM = valueWhen1(pl, mR), pPlP = valueWhen1(pl, lowR), pPhM = valueWhen1(ph, mR), pPhP = valueWhen1(ph, highR);
    const inR = (b: number) => 5 <= b && b <= 60;
    const bull = [], bear = [], hBull = [], hBear = [];
    for (let i = 0; i < n; i++) {
      bull.push(pl[i] && gt(mR[i], pPlM[i]) && inR(sPl[i]) && lt(lowR[i], pPlP[i]));
      hBull.push(pl[i] && lt(mR[i], pPlM[i]) && inR(sPl[i]) && gt(lowR[i], pPlP[i]));
      bear.push(ph[i] && lt(mR[i], pPhM[i]) && inR(sPh[i]) && gt(highR[i], pPhP[i]));
      hBear.push(ph[i] && gt(mR[i], pPhM[i]) && inR(sPh[i]) && lt(highR[i], pPhP[i]));
    }
    [bull, bear, hBull, hBear].forEach((f, k) => {
      expect(times(r, 6 + k)).toEqual(timeAt(bars, f));
      expect(f.some(Boolean)).toBe(true);
    });
    // the labels: shape0..3 drawn 5 bars before the condition bar
    const back = (f: boolean[]) => timeAt(bars, f.map((_v, i) => i + 5 < n && f[i + 5]));
    expect(idTimes(r.markers, 'shape0')).toEqual(back(bull));
    expect(idTimes(r.markers, 'shape1')).toEqual(back(hBull));
    expect(idTimes(r.markers, 'shape2')).toEqual(back(bear));
    expect(idTimes(r.markers, 'shape3')).toEqual(back(hBear));
    expect(idsOf(r.markers)).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    // divergences off (default): no divergence alert
    const d = zscore.calculate(bars);
    for (let k = 6; k < 10; k++) expect(times(d, k)).toEqual([]);
  });

  it('zero-lag-hma-trend-suite: ATR crosses and trend starts', () => {
    const half = A(ta.wma(S(close), 11)), full = A(ta.wma(S(close), 21));
    const hma = A(ta.wma(S(half.map((v, i) => 2 * v - full[i])), 5));
    const atr = A(ta.atr(bars, 14));
    const lo = hma.map((v, i) => v - 1.5 * atr[i]), up = hma.map((v, i) => v + 1.5 * atr[i]);
    const bullish = hma.map((v, i) => gt(v, i > 0 ? hma[i - 1] : NaN));
    const bearish = hma.map((v, i) => lt(v, i > 0 ? hma[i - 1] : NaN));
    const start = (f: boolean[]) => f.map((v, i) => v && !(i > 0 && f[i - 1]));
    const exp = [crossP(close, lo, false), crossP(close, up, true), crossP(close, lo, true), crossP(close, up, false), start(bullish), start(bearish)];
    const r = zlHma.calculate(bars);
    exp.forEach((f, k) => {
      expect(times(r, k)).toEqual(timeAt(bars, f));
      expect(f.some(Boolean)).toBe(true);
    });
    expect(r.markers).toEqual([]); // the labels stay off by default; the alerts do not depend on them
  });

  it('zero-lag-signals-for-loop: trend crosses of 0', () => {
    const lag = 24;
    const basis = A(ta.ema(S(close.map((c, i) => (i >= lag ? 2 * c - close[i - lag] : NaN))), 50));
    const vol = A(ta.highest(ta.atr(bars, 50), 150)).map((v) => v * 1.5);
    const trend: number[] = [];
    let t = 0;
    for (let i = 0; i < bars.length; i++) {
      let score = 0;
      for (let k = 1; k <= 70; k++) score += basis[i] > (i - k >= 0 ? basis[i - k] : NaN) ? 1 : -1;
      if (score > 5 && close[i] > basis[i] + vol[i]) t = 1;
      else if (score < -5 && close[i] < basis[i] - vol[i]) t = -1;
      trend.push(t);
    }
    const r = zlLoop.calculate(bars);
    const long = crossP(trend, 0, true), short = crossP(trend, 0, false);
    expect(times(r, 0)).toEqual(timeAt(bars, long));
    expect(times(r, 1)).toEqual(timeAt(bars, short));
    expect(long.some(Boolean) && short.some(Boolean)).toBe(true);
  });

  it('zero-lag-trend-signals: entries, trend crosses of the chart and of the other timeframes', () => {
    const length = 20, mult = 1.2;
    const trendOf = (list: Bar[]) => {
      const c = list.map((b) => b.close);
      const lag = Math.floor((length - 1) / 2);
      const z = A(ta.ema(S(c.map((v, i) => (i >= lag ? 2 * v - c[i - lag] : NaN)), list), length));
      const v = A(ta.highest(ta.atr(list, length), length * 3)).map((x) => x * mult);
      const upX = crossP(c, z.map((x, i) => x + v[i]), true);
      const dnX = crossP(c, z.map((x, i) => x - v[i]), false);
      let st = 0;
      return { z, trend: c.map((_x, i) => (st = dnX[i] ? -1 : upX[i] ? 1 : st)) };
    };
    // weekly bars (weeks from Monday 00:00 UTC); the 7-day bars complete a week on its Sunday bar
    const week = (t: number) => Math.floor((t / 86400 + 3) / 7);
    const groups: Bar[][] = [];
    bars.forEach((b) => {
      const g = groups[groups.length - 1];
      if (g && week(g[0].time as number) === week(b.time as number)) g.push(b);
      else groups.push([b]);
    });
    const weekly: Bar[] = groups.map((g) => ({
      time: g[0].time, open: g[0].open, high: Math.max(...g.map((b) => b.high)), low: Math.min(...g.map((b) => b.low)),
      close: g[g.length - 1].close, volume: g.reduce((s, b) => s + (b.volume as number), 0),
    }));
    const wTrend = trendOf(weekly).trend;
    let done = -1;
    const sW = bars.map((b) => {
      if (week((b.time as number) + 86400) !== week(b.time as number)) done++;
      return done >= 0 ? wTrend[done] : NaN;
    });
    const { z, trend } = trendOf(bars);
    const tr1 = trend.map((_v, i) => (i > 0 ? trend[i - 1] : NaN));
    const bullE = crossP(close, z, true).map((v, i) => v && trend[i] === 1 && tr1[i] === 1);
    const bearE = crossP(close, z, false).map((v, i) => v && trend[i] === -1 && tr1[i] === -1);
    const three = (s: number[]) => {
      const o = crossP(s, 0, true), u = crossP(s, 0, false);
      return [o, u, o.map((v, i) => v || u[i])];
    };
    const r = zlts.calculate(bars, { length, mult, t1: '1D', t2: '1W', t3: '1D', t4: '1W', t5: '1D' });
    const exp = [bullE, bearE, ...three(trend), ...three(trend), ...three(sW), ...three(trend), ...three(sW), ...three(trend), bullE, bearE];
    expect(r.alerts.length).toBe(22);
    exp.forEach((f, k) => expect(times(r, k), `alert${k}`).toEqual(timeAt(bars, f)));
    expect(bullE.some(Boolean) && bearE.some(Boolean)).toBe(true);
    expect(three(sW)[0].some(Boolean) && three(sW)[1].some(Boolean)).toBe(true);
    // shape / char ids on the markers
    const n = bars.length;
    const lab = (f: boolean[]) => timeAt(bars, f);
    const v = A(ta.highest(ta.atr(bars, length), length * 3)).map((x) => x * mult);
    expect(idTimes(r.markers, 'shape0')).toEqual(lab(trend.map((t, i) => t < 0 && tr1[i] >= 0 && !isNaN(z[i] + v[i]))));
    expect(idTimes(r.markers, 'shape1')).toEqual(lab(trend.map((t, i) => t > 0 && tr1[i] <= 0 && !isNaN(z[i] - v[i]))));
    expect(idTimes(r.markers, 'char2')).toEqual(lab(bullE));
    expect(idTimes(r.markers, 'char3')).toEqual(lab(bearE));
    expect(idsOf(r.markers)).toEqual(['char2', 'char3', 'shape0', 'shape1']);
    expect(r.markers.filter((m) => m.id === 'char2').every((m) => m.char === '▲')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'char3').every((m) => m.char === '▼')).toBe(true);
    expect(n).toBe(1200);
  });
});

describe('style ids', () => {
  it('whale volume: bgcolor0..3 on the four highlights', () => {
    const sma = A(ta.sma(S(bars.map((b) => b.volume as number)), 20));
    const r = whale.calculate(bars, { whaleMult: 1.5, ultraMult: 5 });
    const cases: [string, (i: number) => boolean, string, number][] = [
      ['bgcolor0', (i) => lt(close[i], bars[i].open) && ge(bars[i].volume as number, 1.5 * sma[i]) && !ge(bars[i].volume as number, 5 * sma[i]), '#b71c1c', 90],
      ['bgcolor1', (i) => lt(close[i], bars[i].open) && ge(bars[i].volume as number, 5 * sma[i]), '#4a148c', 85],
      ['bgcolor2', (i) => ge(close[i], bars[i].open) && ge(bars[i].volume as number, 1.5 * sma[i]) && !ge(bars[i].volume as number, 5 * sma[i]), '#1b5e20', 90],
      ['bgcolor3', (i) => ge(close[i], bars[i].open) && ge(bars[i].volume as number, 5 * sma[i]), '#00bcd4', 85],
    ];
    for (const [id, f, col, tr] of cases) {
      const list = r.bgColors.filter((x) => x.id === id);
      expect(list.map((x) => x.time)).toEqual(timeAt(bars, bars.map((_b, i) => f(i))));
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((x) => x.color === String(color.new(col, tr)))).toBe(true);
    }
    expect(r.bgColors.every((x) => ['bgcolor0', 'bgcolor1', 'bgcolor2', 'bgcolor3'].includes(x.id as string))).toBe(true);
  });

  it('williams-bbdiv-signal: shape0..shape21 on the signal markers', () => {
    const spec = Array.from({ length: 22 }, (_v, k) => `shape${k}`);
    const r = bbdiv.calculate(bars);
    const and = bbdiv.calculate(bars, { andMode: true, minBarsBetweenSignals: 0, wrFilterEnabled: false });
    for (const res of [r, and]) {
      expect(res.markers.length).toBeGreaterThan(0);
      expect(res.markers.every((m) => spec.includes(m.id as string))).toBe(true);
    }
    // one look per id
    // shape0 / shape1: the original's Regular Bullish / Bearish Labels at the pivot (display.none)
    const look: Record<string, [string, string, string]> = {
      shape0: ['atPriceMiddle', 'triangleUp', 'Div'], shape1: ['atPriceMiddle', 'triangleDown', 'Div'],
      shape2: ['bottom', 'triangleUp', 'MA'], shape3: ['top', 'triangleDown', 'MA'], shape4: ['bottom', 'triangleUp', 'BB'],
      shape5: ['top', 'triangleDown', 'BB'], shape6: ['atPriceMiddle', 'triangleUp', 'Div'], shape7: ['atPriceMiddle', 'triangleDown', 'Div'],
      shape8: ['belowBar', 'triangleUp', 'Buy'], shape9: ['aboveBar', 'triangleDown', 'Sell'], shape10: ['belowBar', 'triangleUp', 'Buy'],
      shape11: ['aboveBar', 'triangleDown', 'Sell'], shape12: ['belowBar', 'triangleUp', 'Buy'], shape13: ['aboveBar', 'triangleDown', 'Sell'],
      shape14: ['belowBar', 'triangleUp', 'MA+BB'], shape15: ['belowBar', 'triangleUp', 'MA+Div'], shape16: ['belowBar', 'triangleUp', 'BB+Div'],
      shape17: ['belowBar', 'triangleUp', 'MA+BB+Div'], shape18: ['aboveBar', 'triangleDown', 'MA+BB'], shape19: ['aboveBar', 'triangleDown', 'MA+Div'],
      shape20: ['aboveBar', 'triangleDown', 'BB+Div'], shape21: ['aboveBar', 'triangleDown', 'MA+BB+Div'],
    };
    for (const m of [...r.markers, ...and.markers]) {
      expect([m.position, m.shape, m.text]).toEqual(look[m.id as string]);
    }
    // pane MA markers and price-chart MA markers are on the same bars (shape2 / shape8)
    expect(idTimes(r.markers, 'shape8')).toEqual(idTimes(r.markers, 'shape2'));
    expect(idTimes(r.markers, 'shape9')).toEqual(idTimes(r.markers, 'shape3'));
    expect(idsOf(r.markers).filter((id) => ['shape6', 'shape7', 'shape12', 'shape13'].includes(id as string)).length).toBeGreaterThan(0);
    expect(idsOf(and.markers).some((id) => Number(String(id).slice(5)) >= 14)).toBe(true);
    // the "Regular Bullish / Bearish Label" shapes (display.none in the original, shown from the Style settings) are
    // given at the pivot bar, lookbackRight bars before the confirming bar
    expect(r.markers.some((m) => m.id === 'shape0' || m.id === 'shape1')).toBe(true);
  });

  it('zlma-trend-levels: shape0 / shape1 on the diamonds', () => {
    const r = zlma.calculate(bars);
    const up = r.markers.filter((m) => m.id === 'shape0');
    const dn = r.markers.filter((m) => m.id === 'shape1');
    expect(up.length).toBeGreaterThan(0);
    expect(dn.length).toBeGreaterThan(0);
    expect(up.every((m) => m.color === '#30d453' && m.shape === 'diamond')).toBe(true);
    expect(dn.every((m) => m.color === '#4043f1' && m.shape === 'diamond')).toBe(true);
    expect(up.length + dn.length).toBe(r.markers.length);
  });
});
