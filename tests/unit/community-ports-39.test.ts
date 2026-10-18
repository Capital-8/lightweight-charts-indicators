/**
 * Community ports, batch 39: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression, or from the outputs that draw the
 * same condition), the alert() calls, the Style ids on the emitted markers and the plotbar output.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as suppot from '../../src/community/suppot-and-resistance-buy-sell-signals';
import * as sweepCandle from '../../src/community/sweep-candle';
import * as sweepChoch from '../../src/community/sweep-engulf-choch';
import * as s2t from '../../src/community/sweep2trade-pro';
import * as sfs from '../../src/community/swing-failure-signals';
import * as leviathan from '../../src/community/swing-levels-and-liquidity-by-leviathan';
import * as swingPoints from '../../src/community/swing-points';
import * as swingSr from '../../src/community/swing-support-and-resistance';
import * as swingTrade from '../../src/community/swing-trade-signals';
import * as svp from '../../src/community/swing-volume-profiles';
import * as swingarm from '../../src/community/swingarm-atr-trend-indicator';
import * as wyckoff from '../../src/community/t1-wyckoff-aggressive-a-d-setup';
import * as t3psar from '../../src/community/t3-psar';
import * as taTrend from '../../src/community/ta-adaptive-trend';
import * as targetTrend from '../../src/community/target-trend';
import * as targets from '../../src/community/targets-for-many-indicators';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'suppot-and-resistance-buy-sell-signals': [
    ['alert0', 'BUY Signal', 'BUY signal detected!'],
    ['alert1', 'SELL Signal', 'SELL signal detected!'],
  ],
  'sweep-candle': [
    ['alert0', 'All-Candles', 'Candles detected!'],
    ['alert1', 'All-Sweep Candles', 'Sweep Candle detected!'],
    ['alert2', 'All-Standard Candles', 'Standard Candle detected!'],
    ['alert3', 'Sweep-Engulfing', 'Sweep Engulfing detected!'],
    ['alert4', 'Sweep-Momentum', 'Sweep Momentum detected!'],
    ['alert5', 'Standard-Engulfing', 'Standard Engulfing detected!'],
    ['alert6', ' Standard-Momentum', 'Standard Momentum detected!'],
  ],
  'sweep-engulf-choch': [
    ['alert0', 'Bullish Entry', 'Bullish Entry Signal Detected!'],
    ['alert1', 'Bearish Entry', 'Bearish Entry Signal Detected!'],
  ],
  'sweep2trade-pro': [
    ['alert0', 'S2T Pro [CHE] BUY: Sequence complete', 'S2T Pro [CHE] – BUY: Bullish sweep → T3↑ → confirmation (trend filter possibly active).'],
    ['alert1', 'S2T Pro [CHE] SWEEP Long (bullish)', 'S2T Pro [CHE] – SWEEP LONG (bullish) cleared (T3 rising).'],
    ['alert2', 'S2T Pro [CHE] SELL: Sequence complete', 'S2T Pro [CHE] – SELL: Bearish sweep → T3↓ → confirmation (trend filter possibly active).'],
    ['alert3', 'S2T Pro [CHE] SWEEP Short (bearish)', 'S2T Pro [CHE] – SWEEP SHORT (bearish) cleared (T3 falling).'],
  ],
  'swing-failure-signals': [
    ['alert0', 'Bullish SFP', 'Bullish Swing Failure Pattern Detected'],
    ['alert1', 'Bearish SFP', 'Bearish Swing Failure Pattern Detected'],
  ],
  'swing-points': [
    ['alert0', 'Swing High Break', 'Swing High Break Detected'],
    ['alert1', 'Swing Low Break', 'Swing Low Break Detected'],
    ['alert2', 'Bar Up', 'Center line flipped to Green'],
    ['alert3', 'Bar Down', 'Center line flipped to Red'],
    ['alert4', 'New H', 'New Swing High detected — BUY signal'],
    ['alert5', 'New L', 'New Swing Low detected — SELL signal'],
  ],
  'swing-support-and-resistance': [
    ['alert0', 'Buy Alert', 'Buy: Price broke above resistance'],
    ['alert1', 'Sell Alert', 'Sell: Price broke below support'],
  ],
  'swing-trade-signals': [
    ['alert0', 'Reversal', 'Possible Reversal on Swing Signal Alert'],
    ['alert1', 'Buy/Sale Swing Signal', 'Swing Signal Entry Alert'],
  ],
  'swingarm-atr-trend-indicator': [
    ['alert0', 'cross over Fib1', 'Price crossed below Fib1 level in long trend'],
    ['alert1', 'cross over Fib2', 'Price crossed below Fib2 level in long trend'],
    ['alert2', 'cross over Fib3', 'Price crossed below Fib3 level in long trend'],
    ['alert3', 'cross under Fib1', 'Price crossed above Fib1 level in short trend'],
    ['alert4', 'cross under Fib2', 'Price crossed above Fib2 level in short trend'],
    ['alert5', 'cross under Fib3', 'Price crossed above Fib3 level in short trend'],
    ['alert6', 'Stop Line Change', 'Stop Line Change'],
  ],
  't3-psar': [
    ['alert0', 'Close crosses T3', 'Reversal candle is forming!'],
    ['alert1', 'T3 crossing T3', 'A new trend may be forming!'],
  ],
  'ta-adaptive-trend': [
    ['alert0', 'Bullish EMA cross', 'TA Adaptive Trend: fast EMA crossed above slow EMA on {{ticker}} ({{interval}})'],
    ['alert1', 'Bearish EMA cross', 'TA Adaptive Trend: fast EMA crossed below slow EMA on {{ticker}} ({{interval}})'],
  ],
  'targets-for-many-indicators': [
    ['alert0', 'Target 1 New', 'Target 1 New'],
    ['alert1', 'Target 1 Reached', 'Target 1 Reached'],
    ['alert2', 'Target 2 New', 'Target 2 New'],
    ['alert3', 'Target 2 Reached', 'Target 2 Reached'],
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
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1200, 39);
const n = bars.length;
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));
const S = (a: number[]) => Series.fromArray(bars, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
type M = { time: unknown; id?: string; text?: string; position?: string; shape?: string; price?: number; color?: string; size?: string };
const idTimes = (ms: M[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);
const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const textTimes = (ms: M[], text: string) => uniq(ms.filter((m) => m.text === text).map((m) => m.time as number));
const chart = { tickerid: 'NASDAQ:TEST', mintick: 0.01 } as ChartContext;
/** Exact crosses (PineScript ta.crossover / ta.crossunder), na is false */
const xOver = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
const xUnder = (a: number[], b: number[], i: number) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];
const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

describe('declarations', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'suppot-and-resistance-buy-sell-signals': suppot,
    'sweep-candle': sweepCandle,
    'sweep-engulf-choch': sweepChoch,
    'sweep2trade-pro': s2t,
    'swing-failure-signals': sfs,
    'swing-points': swingPoints,
    'swing-support-and-resistance': swingSr,
    'swing-trade-signals': swingTrade,
    'swingarm-atr-trend-indicator': swingarm,
    't3-psar': t3psar,
    'ta-adaptive-trend': taTrend,
    'targets-for-many-indicators': targets,
  };
  for (const [id, m] of Object.entries(mods)) {
    it(`${id}: the original's alertconditions`, () => expect(decls(m)).toEqual(SPEC[id]));
  }
  it('the indicator objects carry the new exports', () => {
    expect(suppot.SuppotAndResistanceBuySellSignals.alertConditions).toBe(suppot.alertConditions);
    expect(sweepCandle.SweepCandle.alertConditions).toBe(sweepCandle.alertConditions);
    expect(sweepChoch.SweepEngulfChoch.alertConditions).toBe(sweepChoch.alertConditions);
    expect(sweepChoch.hasAlertFunction).toBe(true);
    expect(sweepChoch.SweepEngulfChoch.hasAlertFunction).toBe(true);
    expect(s2t.Sweep2TradePro.alertConditions).toBe(s2t.alertConditions);
    expect(sfs.SwingFailureSignals.alertConditions).toBe(sfs.alertConditions);
    expect(swingPoints.SwingPoints.alertConditions).toBe(swingPoints.alertConditions);
    expect(swingSr.SwingSupportAndResistance.alertConditions).toBe(swingSr.alertConditions);
    expect(swingTrade.SwingTradeSignals.alertConditions).toBe(swingTrade.alertConditions);
    expect(svp.hasAlertFunction).toBe(true);
    expect(svp.SwingVolumeProfiles.hasAlertFunction).toBe(true);
    expect(swingarm.SwingarmAtrTrendIndicator.alertConditions).toBe(swingarm.alertConditions);
    expect(t3psar.T3Psar.alertConditions).toBe(t3psar.alertConditions);
    expect(taTrend.TaAdaptiveTrend.alertConditions).toBe(taTrend.alertConditions);
    expect(targets.TargetsForManyIndicators.alertConditions).toBe(targets.alertConditions);
  });
});

describe('Suppot and resistance & BUY SELL SIGNALS', () => {
  const inputs = { length: 20, wickThreshold: 0.3, volumeMultiplier: 1.2, rsiOversoldLevel: 45, rsiOverboughtLevel: 55, adxTrendThreshold: 15 };
  const r = suppot.calculate(bars, inputs);
  it('BUY / SELL alerts on the bars of the labels', () => {
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(textTimes(r.markers, 'BUY'));
    expect(times(r, 1)).toEqual(textTimes(r.markers, 'SELL'));
  });
  it('each alert bar meets the touch / candle / volume / wick / RSI parts of the expression', () => {
    const volume = bars.map((b) => b.volume as number);
    const volAvg = A(ta.sma(S(volume), 20));
    const dpsar = A(ta.lowest(S(close), 20));
    const ypsar = A(ta.highest(S(close), 20));
    const rsi = A(ta.rsi(S(close), 14));
    const idx = new Map(bars.map((b, i) => [b.time as number, i]));
    const wick = (b: Bar) => (b.high - Math.max(b.open, b.close)) / (b.high - b.low) > 0.3 || (Math.min(b.open, b.close) - b.low) / (b.high - b.low) > 0.3;
    for (const t of times(r, 0)) {
      const i = idx.get(t)!, b = bars[i];
      expect(b.low < dpsar[i] && b.close > dpsar[i] && b.close > b.open && volume[i] > 1.2 * volAvg[i] && wick(b) && rsi[i] < 45).toBe(true);
    }
    for (const t of times(r, 1)) {
      const i = idx.get(t)!, b = bars[i];
      expect(b.high > ypsar[i] && b.close < ypsar[i] && b.close < b.open && volume[i] > 1.2 * volAvg[i] && wick(b) && rsi[i] > 55).toBe(true);
    }
  });
});

describe('Sweep Candle', () => {
  const p = (i: number) => (i > 0 ? bars[i - 1] : undefined);
  const enBullStd = bars.map((b, i) => !!p(i) && b.close > b.open && p(i)!.high < b.close && p(i)!.open > p(i)!.close);
  const enBearStd = bars.map((b, i) => !!p(i) && b.close < b.open && p(i)!.low > b.close && p(i)!.open < p(i)!.close);
  const enBullSw = bars.map((b, i) => enBullStd[i] && b.low < p(i)!.low);
  const enBearSw = bars.map((b, i) => enBearStd[i] && b.high > p(i)!.high);
  const moBullStd = bars.map((b, i) => !!p(i) && p(i)!.high < b.close && p(i)!.close > p(i)!.open && b.close > b.open);
  const moBearStd = bars.map((b, i) => !!p(i) && p(i)!.low > b.close && p(i)!.close < p(i)!.open && b.close < b.open);
  const moBullSw = bars.map((b, i) => moBullStd[i] && p(i)!.low > b.low);
  const moBearSw = bars.map((b, i) => moBearStd[i] && p(i)!.high < b.high);
  const or = (...f: boolean[][]) => bars.map((_b, i) => f.some((x) => x[i]));
  const expected = [
    or(enBullSw, enBearSw, moBullSw, moBearSw, enBullStd, enBearStd, moBullStd, moBearStd),
    or(enBullSw, enBearSw, moBullSw, moBearSw),
    or(enBullStd, enBearStd, moBullStd, moBearStd),
    or(enBullSw, enBearSw),
    or(moBullSw, moBearSw),
    or(enBullStd, enBearStd),
    or(moBullStd, moBearStd),
  ];
  it('the 7 conditions, whatever the selected types', () => {
    for (const inp of [{}, { engulfingType: 'Standard' as const, momentumType: 'Standard' as const }]) {
      const r = sweepCandle.calculate(bars, inp);
      expected.forEach((f, k) => {
        expect(times(r, k).length).toBeGreaterThan(0);
        expect(times(r, k)).toEqual(timeAt(bars, f));
      });
    }
  });
});

describe('Sweep Engulf CHoCH', () => {
  const b2 = (i: number) => bars[i - 2];
  const bull = bars.map((b, i) => i >= 2 && b2(i).close < b2(i).open && bars[i - 1].low < b2(i).low && bars[i - 1].close > b2(i).close && b.close > b2(i).open);
  const bear = bars.map((b, i) => i >= 2 && b2(i).close > b2(i).open && bars[i - 1].high > b2(i).high && bars[i - 1].close > b2(i).open && b.close < b2(i).open);
  it('alertconditions with the Show inputs', () => {
    const r = sweepChoch.calculate(bars);
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(timeAt(bars, bull));
    expect(times(r, 1)).toEqual(timeAt(bars, bear));
    const off = sweepChoch.calculate(bars, { showBullish: false });
    expect(times(off, 0)).toEqual([]);
    expect(times(off, 1)).toEqual(timeAt(bars, bear));
  });
  it('alert() calls once per bar close on every entry (Show inputs ignored), off with Enable Alerts', () => {
    const r = sweepChoch.calculate(bars, { showBullish: false });
    const exp: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      if (bull[i]) exp.push({ time: b.time as number, message: 'Bullish Entry Signal Detected!', freq: 'once_per_bar_close' });
      if (bear[i]) exp.push({ time: b.time as number, message: 'Bearish Entry Signal Detected!', freq: 'once_per_bar_close' });
    });
    expect(r.alertCalls).toEqual(exp);
    expect(sweepChoch.calculate(bars, { enableAlert: false }).alertCalls).toEqual([]);
  });
});

describe('Sweep2Trade Pro', () => {
  it('the 4 conditions on the bars of their markers', () => {
    for (const inp of [{}, { useTrendFilter: false }]) {
      const r = s2t.calculate(bars, inp);
      const ex = [textTimes(r.markers, 'BUY'), textTimes(r.markers, 'SWEEP L OK'), textTimes(r.markers, 'SELL'), textTimes(r.markers, 'SWEEP S OK')];
      ex.forEach((e, k) => expect(times(r, k)).toEqual(e));
      expect(times(r, 1).length).toBeGreaterThan(0);
      expect(times(r, 3).length).toBeGreaterThan(0);
    }
    const r = s2t.calculate(bars, { useTrendFilter: false });
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 2).length).toBeGreaterThan(0);
  });
  it('a sweep signal needs a bullish sweep before it and a rising T3 on its bar', () => {
    const r = s2t.calculate(bars);
    const t3 = r.plots.plot0.map((p) => p.value as number);
    const idx = new Map(bars.map((b, i) => [b.time as number, i]));
    for (const t of times(r, 1)) {
      const i = idx.get(t)!;
      expect(t3[i] > t3[i - 1]).toBe(true);
    }
    for (const t of times(r, 3)) {
      const i = idx.get(t)!;
      expect(t3[i] < t3[i - 1]).toBe(true);
    }
  });
});

describe('Swing Failure Signals', () => {
  it('Bullish / Bearish SFP on the bars of the signal shapes', () => {
    for (const inp of [{}, { len: 5, patience: 12 }]) {
      const r = sfs.calculate(bars, inp);
      expect(times(r, 0)).toEqual(textTimes(r.markers as M[], '▲'));
      expect(times(r, 1)).toEqual(textTimes(r.markers as M[], '▼'));
      expect(times(r, 0).length + times(r, 1).length).toBeGreaterThan(0);
    }
  });
});

describe('Swing Levels and Liquidity (Style ids)', () => {
  it('the swing dots carry shape0 (highs) / shape1 (lows)', () => {
    const r = leviathan.calculate(bars);
    const ms = r.markers as M[];
    expect(ms.length).toBeGreaterThan(0);
    const byTime = new Map(bars.map((b) => [b.time as number, b]));
    for (const m of ms) {
      expect(['shape0', 'shape1']).toContain(m.id);
      const b = byTime.get(m.time as number)!;
      expect(m.price).toBe(m.id === 'shape0' ? b.high : b.low);
    }
    expect(idTimes(ms, 'shape0').length).toBeGreaterThan(0);
    expect(idTimes(ms, 'shape1').length).toBeGreaterThan(0);
  });
});

describe('Swing Points', () => {
  const prd = 5;
  const ph = A(ta.pivothigh(S(high), prd, prd));
  const pl = A(ta.pivotlow(S(low), prd, prd));
  const lastH: number[] = [], lastL: number[] = [];
  let h = NaN, l = NaN;
  for (let i = 0; i < n; i++) {
    if (!isNaN(ph[i])) h = ph[i];
    if (!isNaN(pl[i])) l = pl[i];
    lastH.push(h);
    lastL.push(l);
  }
  // center line and its colour flips
  const up: boolean[] = [], dn: boolean[] = [];
  let center = NaN, prev: boolean | null = null;
  for (let i = 0; i < n; i++) {
    const piv = !isNaN(ph[i]) ? ph[i] : pl[i];
    if (!isNaN(piv)) center = isNaN(center) ? piv : (center * 2 + piv) / 3;
    const green = gt(close[i], center);
    const changed = prev !== null && green !== prev;
    up.push(changed && green);
    dn.push(changed && !green);
    prev = green;
  }
  it('breaks, colour flips and new pivots', () => {
    const r = swingPoints.calculate(bars);
    const ex = [
      bars.map((_b, i) => xOver(close, lastH, i)),
      bars.map((_b, i) => xUnder(close, lastL, i)),
      up, dn,
      ph.map((v) => !isNaN(v)),
      pl.map((v) => !isNaN(v)),
    ];
    ex.forEach((f, k) => {
      expect(times(r, k).length).toBeGreaterThan(0);
      expect(times(r, k)).toEqual(timeAt(bars, f));
    });
    // the flips are the bar colours
    expect(uniq([...times(r, 2), ...times(r, 3)])).toEqual(r.barColors.map((c) => c.time as number));
  });
  it('break / new pivot alerts wait for a closed last bar', () => {
    // the bars up to a break of the last pivot high: the break is on the last bar
    const full = swingPoints.calculate(bars);
    const tBreak = full.alerts[0].times[3];
    const crafted = bars.filter((b) => (b.time as number) <= tBreak);
    const k = crafted.length - 1;
    const open = swingPoints.calculate(crafted, {}, { lastBarConfirmed: false } as ChartContext);
    const closed = swingPoints.calculate(crafted, {}, { lastBarConfirmed: true } as ChartContext);
    const t = crafted[k].time as number;
    expect(closed.alerts[0].times).toContain(t);
    expect(closed.alerts[0].triggered).toBe(true);
    expect(open.alerts[0].times).not.toContain(t);
    expect(open.alerts[0].triggered).toBe(false);
    expect(open.alerts[0].times).toEqual(closed.alerts[0].times.filter((x) => x !== t));
  });
});

describe('Swing Support and Resistance', () => {
  it('Buy / Sell alerts: close crossing the last pivot high / low', () => {
    const len = 10;
    const ph = A(ta.pivothigh(S(high), len, len));
    const pl = A(ta.pivotlow(S(low), len, len));
    const res: number[] = [], sup: number[] = [];
    let a = NaN, b = NaN;
    for (let i = 0; i < n; i++) {
      if (!isNaN(ph[i])) a = ph[i];
      if (!isNaN(pl[i])) b = pl[i];
      res.push(a);
      sup.push(b);
    }
    const r = swingSr.calculate(bars);
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(timeAt(bars, bars.map((_b, i) => xOver(close, res, i))));
    expect(times(r, 1)).toEqual(timeAt(bars, bars.map((_b, i) => xUnder(close, sup, i))));
    expect(times(r, 0)).toEqual(textTimes(r.markers, 'Buy'));
    expect(times(r, 1)).toEqual(textTimes(r.markers, 'Sell'));
  });
});

describe('Swing Trade Signals', () => {
  it('Reversal / Buy-Sale from the original expressions', () => {
    const rs = A(ta.rsi(S(close), 14));
    const ema1 = A(ta.ema(S(close), 5));
    const sma2 = A(ta.sma(S(close), 50));
    const hl = bars.map(() => 80), ll = bars.map(() => 20);
    const rev = bars.map((_b, i) => xUnder(rs, hl, i) || xOver(rs, ll, i));
    const entry = bars.map((b, i) => (xOver(sma2, ema1, i) && gt(b.open, b.close)) || (xUnder(sma2, ema1, i) && gt(b.high, sma2[i])));
    const r = swingTrade.calculate(bars);
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(timeAt(bars, rev));
    expect(times(r, 1)).toEqual(timeAt(bars, entry));
  });
});

describe('Swing Volume Profiles alert() calls', () => {
  const vbars = walk(900, 7);
  const r = svp.calculate(vbars, { mode: 'Historical' }, chart);
  const re = /^TEST : Swings Volume Profile : Price touches\/crosses (Point Of Control|Value Area High|Value Area Low) Line, price (\d+\.\d\d)$/;
  it('message format, price of the bar, once per bar', () => {
    expect(r.alertCalls.length).toBeGreaterThan(0);
    const byTime = new Map(vbars.map((b) => [b.time as number, b]));
    for (const c of r.alertCalls) {
      expect(c.freq).toBe('once_per_bar');
      const m = re.exec(c.message);
      expect(m).not.toBeNull();
      expect(m![2]).toBe(byTime.get(c.time)!.close.toFixed(2));
    }
    const kinds = new Set(r.alertCalls.map((c) => re.exec(c.message)![1]));
    expect(kinds.size).toBe(3);
  });
  it('POC calls before the last bar: close crossing the 2-bar range at row 0 (dpcL is set on the last bar only)', () => {
    const vpLev = 27;
    const c = vbars.map((b) => b.close);
    const hi = A(ta.highest(Series.fromArray(vbars, vbars.map((b) => b.high)), 2));
    const lo = A(ta.lowest(Series.fromArray(vbars, vbars.map((b) => b.low)), 2));
    const lvl = lo.map((l, i) => l + 0.5 * ((hi[i] - l) / vpLev));
    const last = vbars.length - 1;
    const exp = vbars.map((_b, i) => i < last && (xOver(c, lvl, i) || xUnder(c, lvl, i)));
    const got = r.alertCalls.filter((x) => x.message.includes('Point Of Control') && x.time !== vbars[last].time).map((x) => x.time);
    expect(got.length).toBeGreaterThan(0);
    expect(got).toEqual(timeAt(vbars, exp));
  });
  it('the Show inputs switch the calls off', () => {
    const off = svp.calculate(vbars, { mode: 'Historical', pcShw: false, vhShw: false }, chart);
    expect(off.alertCalls.every((x) => x.message.includes('Value Area Low'))).toBe(true);
    expect(off.alertCalls.length).toBe(r.alertCalls.filter((x) => x.message.includes('Value Area Low')).length);
  });
});

describe('SwingArm ATR Trend', () => {
  const r = swingarm.calculate(bars);
  const f = [r.plots.plot2, r.plots.plot3, r.plots.plot4].map((p) => p.map((x) => x.value as number));
  const long = r.plots.plot0.map((p) => p.color === '#4CAF50');
  it('level crosses against the trend of the bar before', () => {
    for (let j = 0; j < 3; j++) {
      const prevF = f[j].map((_v, i) => at(f[j], i - 1));
      const lj = bars.map((_b, i) => i > 0 && long[i - 1] && xUnder(close, prevF, i));
      const sj = bars.map((_b, i) => i > 0 && !long[i - 1] && xOver(close, prevF, i));
      expect(times(r, j)).toEqual(timeAt(bars, lj));
      expect(times(r, j + 3)).toEqual(timeAt(bars, sj));
      expect(times(r, j).length + times(r, j + 3).length).toBeGreaterThan(0);
    }
  });
  it('Stop Line Change: fixnan(f1) differs from the bar before', () => {
    const fixed: number[] = [];
    let last = NaN;
    for (const v of f[0]) {
      if (!isNaN(v)) last = v;
      fixed.push(last);
    }
    const ch = fixed.map((v, i) => i > 0 && !isNaN(v) && !isNaN(fixed[i - 1]) && Math.abs(v - fixed[i - 1]) > EPS);
    expect(times(r, 6).length).toBeGreaterThan(0);
    expect(times(r, 6)).toEqual(timeAt(bars, ch));
  });
  it('the triangles carry the ids of LS1..LS3 / SS1..SS3 on the bars of their conditions', () => {
    const ms = r.markers as M[];
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) expect(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']).toContain(m.id);
    const t20 = bars[20].time as number;
    for (let k = 0; k < 6; k++) {
      expect(idTimes(ms, `shape${k}`).filter((t) => t > t20)).toEqual(times(r, k).filter((t) => t > t20));
    }
    expect(ms.filter((m) => m.shape === 'triangleUp').every((m) => ['shape0', 'shape1', 'shape2'].includes(m.id!))).toBe(true);
    expect(swingarm.calculate(bars, { showFibEntries: false }).alerts).toEqual(r.alerts);
  });
});

describe('T1 Wyckoff (Style ids)', () => {
  it('Long labels carry shape0, Short labels shape1', () => {
    let count = 0;
    for (const inp of [{}, { signalOption: 'Trend Following' as const }, { wickThresh: 0.2, closeThresh: 0.45 }]) {
      for (const seed of [3, 39, 101]) {
        const ms = wyckoff.calculate(walk(1500, seed)).markers as M[];
        const ms2 = wyckoff.calculate(walk(1500, seed), inp).markers as M[];
        for (const m of [...ms, ...ms2]) {
          count++;
          expect(m.id).toBe(m.text === 'Long' ? 'shape0' : 'shape1');
        }
      }
    }
    expect(count).toBeGreaterThan(0);
  });
});

describe('T3 PSAR', () => {
  const t3 = (len: number) => {
    const e1 = ta.ema(S(close), len), e2 = ta.ema(e1, len), e3 = ta.ema(e2, len), e4 = ta.ema(e3, len), e5 = ta.ema(e4, len), e6 = ta.ema(e5, len);
    const a = 0.7;
    const c1 = -a * a * a, c2 = 3 * a * a + 3 * a * a * a, c3 = -6 * a * a - 3 * a - 3 * a * a * a, c4 = 1 + 3 * a + a * a * a + 3 * a * a;
    const [x3, x4, x5, x6] = [A(e3), A(e4), A(e5), A(e6)];
    return x6.map((v, i) => c1 * v + c2 * x5[i] + c3 * x4[i] + c4 * x3[i]);
  };
  it('cross(close, T3 slow) / cross(T3 slow, T3 fast)', () => {
    const slow = t3(8), fast = t3(5);
    const r = t3psar.calculate(bars);
    const c = bars.map((_b, i) => xOver(close, slow, i) || xUnder(close, slow, i));
    const d = bars.map((_b, i) => xOver(slow, fast, i) || xUnder(slow, fast, i));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(timeAt(bars, c));
    expect(times(r, 1)).toEqual(timeAt(bars, d));
  });
  it('the Heikin-Ashi plotbar is given on every bar, coloured only with the overlay input', () => {
    const r = t3psar.calculate(bars);
    expect((r as Record<string, unknown>).plotCandles).toBeUndefined();
    expect(Object.keys(r.plotBars)).toEqual(['ha']);
    expect(r.plotBars.ha.length).toBe(n);
    expect(r.plotBars.ha.every((b) => b.color === 'transparent')).toBe(true);
    expect(r.plotBars.ha[0].open).toBeCloseTo((bars[0].open + bars[0].close) / 2, 10);
    const on = t3psar.calculate(bars, { showHA: true });
    expect(on.plotBars.ha.every((b) => b.color !== 'transparent')).toBe(true);
    expect(on.plotBars.ha.map((b) => [b.open, b.high, b.low, b.close])).toEqual(r.plotBars.ha.map((b) => [b.open, b.high, b.low, b.close]));
  });
});

describe('TA Adaptive Trend', () => {
  it('fast EMA crossing the slow EMA, whatever the markers input', () => {
    const fast = A(ta.ema(S(close), 21)), slow = A(ta.ema(S(close), 55));
    for (const inp of [{}, { showFlips: false }]) {
      const r = taTrend.calculate(bars, inp);
      expect(times(r, 0).length).toBeGreaterThan(0);
      expect(times(r, 0)).toEqual(timeAt(bars, bars.map((_b, i) => xOver(fast, slow, i))));
      expect(times(r, 1)).toEqual(timeAt(bars, bars.map((_b, i) => xUnder(fast, slow, i))));
    }
  });
});

describe('Target Trend (Style ids)', () => {
  it('each trend change has its tiny + small triangles with the ids of the 4 plotshapes', () => {
    const r = targetTrend.calculate(bars);
    const ms = r.markers as M[];
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) expect(['shape0', 'shape1', 'shape2', 'shape3']).toContain(m.id);
    for (const m of ms) {
      const k = m.shape === 'triangleUp' ? (m.size === 'tiny' ? 'shape0' : 'shape1') : (m.size === 'tiny' ? 'shape2' : 'shape3');
      expect(m.id).toBe(k);
    }
    expect(idTimes(ms, 'shape0')).toEqual(idTimes(ms, 'shape1'));
    expect(idTimes(ms, 'shape2')).toEqual(idTimes(ms, 'shape3'));
    expect(idTimes(ms, 'shape0').length).toBeGreaterThan(0);
    expect(idTimes(ms, 'shape2').length).toBeGreaterThan(0);
  });
});

describe('Targets For Many Indicators', () => {
  const level = [...close].sort((a, b) => a - b)[Math.floor(n / 2)];
  const inputs = {
    targetSource1B: 'Value', targetValue1B: level, distOptions1: 'Currencies', distTarget1: 2,
    targetSource2B: 'Value', targetValue2B: level, distOptions2: 'Currencies', distTarget2: 2,
  } as Partial<typeof targets.defaultInputs>;
  const lv = bars.map(() => level);
  /** The target state machine of the original */
  const run = (isLong: boolean, cond: boolean[], wait = false, newTarget = false) => {
    let value = NaN, reached = true, active = false;
    const isNew: boolean[] = [], isReached: boolean[] = [];
    bars.forEach((b, i) => {
      let rr = false, nn = false;
      if ((isLong ? b.high > value : b.low < value) && active) {
        reached = true;
        active = false;
        rr = true;
      }
      if ((cond[i] && (wait ? reached : true)) || (newTarget && reached)) {
        value = b.close + (isLong ? 2 : -2);
        reached = false;
        active = true;
        nn = true;
      }
      isNew.push(nn);
      isReached.push(rr);
    });
    return [isNew, isReached];
  };
  it('new / reached targets of both setups', () => {
    const r = targets.calculate(bars, inputs, chart);
    const [n1, r1] = run(true, bars.map((_b, i) => xOver(close, lv, i)));
    const [n2, r2] = run(false, bars.map((_b, i) => xUnder(close, lv, i)));
    [n1, r1, n2, r2].forEach((f, k) => {
      expect(times(r, k).length).toBeGreaterThan(0);
      expect(times(r, k)).toEqual(timeAt(bars, f));
    });
  });
  it('wait for the target / new target when reached', () => {
    const r = targets.calculate(bars, { ...inputs, waitTarget1: true, newTarget2: true }, chart);
    const [n1, r1] = run(true, bars.map((_b, i) => xOver(close, lv, i)), true);
    const [n2, r2] = run(false, bars.map((_b, i) => xUnder(close, lv, i)), false, true);
    [n1, r1, n2, r2].forEach((f, k) => expect(times(r, k)).toEqual(timeAt(bars, f)));
    expect(targets.calculate(bars, { ...inputs, enableTarget2: false }, chart).alerts[2].times).toEqual([]);
  });
});
