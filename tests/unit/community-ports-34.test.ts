/**
 * Community ports, batch 34: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers / arrows.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as rsiZone from '../../src/community/rsi-zone-step-lines';
import * as srBreak from '../../src/community/s-r-breakout-atr-confirmation';
import * as sarEma from '../../src/community/sar-ema-macd';
import * as sfb from '../../src/community/savitzky-flow-bands';
import * as sgh from '../../src/community/savitzky-golay-hampel-filter-alphanatt';
import * as sli from '../../src/community/scalping-line';
import * as spt from '../../src/community/scalping-pullback-tool';
import * as sst from '../../src/community/scalping-swing-trading-tool-r1-4-by-justunclel';
import * as std from '../../src/community/scalping-tool-dynamic-tp-sl';
import * as scottgo from '../../src/community/scottgo-advanced-macd';
import * as sats from '../../src/community/self-aware-trend-system';
import * as sps from '../../src/community/sequential-pattern-strength';
import * as sweeps from '../../src/community/session-sweeps';
import * as sessions from '../../src/community/sessions-luxalgo';
import * as setup91 from '../../src/community/setup-9-1-ema-50';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);

/** Seeded random walk of bars with a random volume */
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
const bars = walk(1200, 7);
const close = bars.map((b) => b.close);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const S = (list: Bar[], a: number[]) => Series.fromArray(list, a);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const uniq = <T>(a: T[]) => [...new Set(a)];
const idTimes = (items: { id?: string; time: unknown }[], id: string) => items.filter((m) => m.id === id).map((m) => m.time);
const lag = (a: number[], k: number) => a.map((_v, i) => (i >= k ? a[i - k] : NaN));
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
const sma = (a: number[], len: number) => a.map((_v, i) => {
  if (i < len - 1) return NaN;
  let s = 0;
  for (let k = i - len + 1; k <= i; k++) s += a[k];
  return s / len;
});
const nonEmpty = (flags: boolean[]) => flags.filter(Boolean).length;

describe('RSI Zone Step Lines: Style ids', () => {
  const r = rsiZone.calculate(bars);
  it('the cross circles carry the ids of the two plotshape outputs', () => {
    expect(r.markers.length).toBeGreaterThan(0);
    expect(uniq(r.markers.map((m) => m.id)).sort()).toEqual(['shape0', 'shape1']);
    // shape0: RSI crosses above the upper threshold, the close takes the upper level (plot0)
    const up = r.markers.filter((m) => m.id === 'shape0');
    const upper = new Map(r.plots.plot0.map((p) => [p.time, p.value]));
    for (const m of up) expect(m.price).toBe(upper.get(m.time));
  });
});

describe('S&R Breakout ATR Confirmation', () => {
  const r = srBreak.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(srBreak)).toEqual([
      ['alert0', 'Bullish Breakout', 'Breakout Confirmation Pro BUY Signal'],
      ['alert1', 'Bearish Breakout', 'Breakout Confirmation Pro SELL Signal'],
    ]);
    expect(srBreak.SRBreakoutAtrConfirmation.alertConditions).toBe(srBreak.alertConditions);
  });
  it('bullBreakout / bearBreakout from the expression', () => {
    const high = bars.map((b) => b.high), low = bars.map((b) => b.low);
    const res = high.map((_v, i) => (i >= 20 ? Math.max(...high.slice(i - 20, i)) : NaN));
    const sup = low.map((_v, i) => (i >= 20 ? Math.min(...low.slice(i - 20, i)) : NaN));
    const atr = A(ta.atr(bars, 14));
    const vol = bars.map((b) => b.volume as number);
    const volMA = sma(vol, 20);
    const bull = bars.map((b, i) => gt(b.close, res[i]) && gt(b.close - b.open, atr[i]) && gt(vol[i], volMA[i]));
    const bear = bars.map((b, i) => lt(b.close, sup[i]) && gt(b.open - b.close, atr[i]) && gt(vol[i], volMA[i]));
    expect(nonEmpty(bull)).toBeGreaterThan(0);
    expect(nonEmpty(bear)).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(timeAt(bars, bull));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bear));
    // the same bars as the BUY / SELL labels
    expect(r.alerts[0].times).toEqual(r.markers.filter((m) => m.text === 'BUY').map((m) => m.time));
    expect(r.alerts[1].times).toEqual(r.markers.filter((m) => m.text === 'SELL').map((m) => m.time));
  });
});

describe('Parabolic SAR + EMA 200 + MACD Signals', () => {
  const list = walk(1500, 11);
  const r = sarEma.calculate(list);
  it('declares the alertconditions of the original', () => {
    expect(decls(sarEma)).toEqual([
      ['alert0', 'SAR EMA200 MACD Buy signal!', 'Buy signal'],
      ['alert1', 'SAR EMA200 MACD Sell signal!', 'Sell signal'],
    ]);
    expect(sarEma.SAREMAMACDSignals.alertConditions).toBe(sarEma.alertConditions);
  });
  it('buy_signal / sell_signal: SAR side, MACD histogram cross of 0, ohlc4 against EMA 200', () => {
    const c = list.map((b) => b.close);
    const cs = S(list, c);
    const sar = A(ta.sar(list, 0.02, 0.02, 0.2));
    const ema200 = A(ta.ema(cs, 200));
    const macd = A(ta.ema(cs, 12)).map((v, i) => v - A(ta.ema(cs, 26))[i]);
    const signal = A(ta.ema(S(list, macd), 9));
    const delta = macd.map((m, i) => m - signal[i]);
    const up = xover(delta, 0), down = xunder(delta, 0);
    const bearish = list.map((b, i) => lt((b.open + b.high + b.low + b.close) / 4, ema200[i]));
    const buy = list.map((b, i) => lt(sar[i], b.low) && up[i] && !bearish[i]);
    const sell = list.map((b, i) => gt(sar[i], b.high) && down[i] && bearish[i]);
    expect(nonEmpty(buy)).toBeGreaterThan(0);
    expect(nonEmpty(sell)).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(timeAt(list, buy));
    expect(r.alerts[1].times).toEqual(timeAt(list, sell));
  });
});

describe('Savitzky Flow Bands: Style ids', () => {
  const r = sfb.calculate(bars);
  it('the two diamonds of a change carry shape0 (tiny) and shape1 (small)', () => {
    expect(r.markers.length).toBeGreaterThan(0);
    for (const m of r.markers) expect(m.id).toBe(m.size === 'tiny' ? 'shape0' : 'shape1');
    expect(idTimes(r.markers, 'shape0')).toEqual(idTimes(r.markers, 'shape1'));
  });
});

describe('Savitzky-Golay Hampel Filter | AlphaNatt', () => {
  // A wide fast wave: the filter (weights over the sum of their absolute values) runs well below the walk bars
  const wave: Bar[] = Array.from({ length: 800 }, (_, i) => {
    const c = 100 + 60 * Math.sin(i / 10), o = 100 + 60 * Math.sin((i - 0.5) / 10);
    return { time: 1577836800 + i * 86400, open: o, high: Math.max(o, c) + 1, low: Math.min(o, c) - 1, close: c, volume: 1 };
  });
  const r = sgh.calculate(wave);
  it('declares the alertconditions of the original', () => {
    expect(decls(sgh)).toEqual([
      ['alert0', 'SG-Hampel Bull Cross', 'Price crossed above filter with strong trend'],
      ['alert1', 'SG-Hampel Bear Cross', 'Price crossed below filter with strong trend'],
    ]);
    expect(sgh.SavitzkyGolayHampelFilterAlphanatt.alertConditions).toBe(sgh.alertConditions);
  });
  it('ta.crossover / crossunder(close, finalFilter) and strongTrend', () => {
    const ff = vals(r.plots.plot0);
    const c = wave.map((b) => b.close);
    const atr = A(ta.atr(wave, 14));
    const strong = ff.map((v, i) => gt((Math.abs(v - lag(ff, 1)[i]) / atr[i]) * 100, 1.0));
    const bull = xover(c, ff).map((x, i) => x && strong[i]);
    const bear = xunder(c, ff).map((x, i) => x && strong[i]);
    expect(nonEmpty(bull)).toBeGreaterThan(0);
    expect(nonEmpty(bear)).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(timeAt(wave, bull));
    expect(r.alerts[1].times).toEqual(timeAt(wave, bear));
  });
});

describe('Scalping Line', () => {
  const r = sli.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(sli)).toEqual([['alert0', 'BUY ALARM!', 'SLI BUY Signal!'], ['alert1', 'SELL ALARM!', 'SLI SELL Signal!']]);
    expect(sli.ScalpingLine.alertConditions).toBe(sli.alertConditions);
  });
  it('crossover / crossunder(ScalpLine, 0) (ssMA = close while MA is na)', () => {
    const ma = sma(sma(close, 50), 51);
    const ss = ma.map((m, i) => (m > close[i] + m / 100 ? m : m < close[i] - m / 100 ? m : close[i]));
    const scalp = sma(close, 7).map((s, i) => s - ss[i]);
    const up = xover(scalp, 0), down = xunder(scalp, 0);
    expect(nonEmpty(up)).toBeGreaterThan(0);
    expect(nonEmpty(down)).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(timeAt(bars, up));
    expect(r.alerts[1].times).toEqual(timeAt(bars, down));
  });
});

describe('Scalping PullBack Tool: Style ids and plotarrow', () => {
  const inputs = { fastEMAlength: 20, mediumEMAlength: 50, slowEMAlength: 100, hiLoLen: 10 };
  const ids = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7'];
  it('every marker carries one of the plotshape ids; the HH / LH / HL / LL squares with ShowHHLL', () => {
    const r = spt.calculate(bars, { ...inputs, showHHLL: true });
    for (const m of r.markers) expect(ids).toContain(m.id);
    for (const id of ids) expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
    const texts: Record<string, string> = { shape2: '[HH]', shape3: '[LH]', shape4: '[HL]', shape5: '[LL]' };
    for (const [id, text] of Object.entries(texts)) for (const m of r.markers.filter((x) => x.id === id)) expect(m.text).toBe(text);
    // the bar counters have no colour, at the bottom
    for (const m of r.markers.filter((x) => x.id === 'shape6' || x.id === 'shape7')) {
      expect(m.color).toBe('transparent');
      expect(m.position).toBe('bottom');
      expect(m.shape).toBe('xcross');
    }
  });
  it('the recovery arrows are arrows (arrow0, +1 / -1) on the bars of the alerts, not markers', () => {
    for (const useHAcandles of [true, false]) {
      const r = spt.calculate(bars, { ...inputs, useHAcandles });
      expect(r.markers.some((m) => m.shape === 'arrowUp' || m.shape === 'arrowDown')).toBe(false);
      expect(r.arrows.length).toBeGreaterThan(0);
      for (const a of r.arrows) {
        expect(a.id).toBe('arrow0');
        expect(Math.abs(a.value)).toBe(1);
      }
      expect(r.arrows.filter((a) => a.value > 0).map((a) => a.time)).toEqual(r.alerts[0].times);
      expect(r.arrows.filter((a) => a.value < 0).map((a) => a.time)).toEqual(r.alerts[1].times);
      // the closed-candle delay draws the arrow of the previous bar
      const delayed = spt.calculate(bars, { ...inputs, useHAcandles, delayArrow: true });
      expect(delayed.arrows.map((a) => [a.time, a.value])).toEqual(
        r.arrows.filter((a) => a.time !== bars[bars.length - 1].time).map((a) => [a.time, a.value]));
    }
  });
});

describe('Scalping Swing Trading Tool R1-6: Style ids and plotarrow', () => {
  const pivotIds = ['shape6', 'shape8', 'shape10', 'shape12'];
  const plainIds = ['shape7', 'shape9', 'shape11', 'shape13'];
  const charIds = ['char14', 'char15', 'char16', 'char17', 'char18', 'char19', 'char20', 'char21'];
  it('pivots with labels (shape6 / 8 / 10 / 12) and the pattern digits (char14 - char21)', () => {
    const r = sst.calculate(bars);
    for (const m of r.markers) expect([...pivotIds, ...charIds]).toContain(m.id);
    for (const id of [...pivotIds, ...charIds]) expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
    const digit: Record<string, string> = { char14: '1', char15: '2', char16: '2', char17: '1', char18: '1', char19: '2', char20: '2', char21: '1' };
    for (const m of r.markers.filter((x) => x.id?.startsWith('char'))) expect(m.text).toBe(digit[m.id as string]);
  });
  it('pivots without labels are shape7 / 9 / 11 / 13 on the same bars', () => {
    const a = sst.calculate(bars);
    const b = sst.calculate(bars, { showPivotLabels: false });
    pivotIds.forEach((id, k) => expect(idTimes(b.markers, plainIds[k])).toEqual(idTimes(a.markers, id)));
    for (const m of b.markers.filter((x) => plainIds.includes(x.id as string))) expect(m.text).toBeUndefined();
  });
  it('without pivots: fractals (shape0 / 1) and HH / LH / HL / LL squares (shape2 - 5)', () => {
    const r = sst.calculate(bars, { showPivots: false, showHHLL: true });
    const ids = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5'];
    for (const m of r.markers) expect(ids).toContain(m.id);
    for (const id of ids) expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
  });
  it('swing alerts: BUY / SELL arrows shape22 / 23, or arrows arrow0 with big arrows, one bar after the alert', () => {
    const small = sst.calculate(bars, { showPacExit: true });
    const next = (times: number[]) => times.map((t) => bars.findIndex((b) => b.time === t) + 1)
      .filter((i) => i < bars.length).map((i) => bars[i].time);
    expect(small.alerts[0].times.length).toBeGreaterThan(0);
    expect(idTimes(small.markers, 'shape22')).toEqual(next(small.alerts[0].times));
    expect(idTimes(small.markers, 'shape23')).toEqual(next(small.alerts[1].times));
    expect(small.arrows).toEqual([]);
    const big = sst.calculate(bars, { showPacExit: true, useBigArrows: true });
    expect(big.markers.some((m) => m.id === 'shape22' || m.id === 'shape23' || m.shape === 'arrowUp')).toBe(false);
    for (const a of big.arrows) expect(a.id).toBe('arrow0');
    expect(big.arrows.filter((a) => a.value === 1).map((a) => a.time)).toEqual(next(big.alerts[0].times));
    expect(big.arrows.filter((a) => a.value === -1).map((a) => a.time)).toEqual(next(big.alerts[1].times));
  });
});

describe('Scalping Tool with Dynamic TP', () => {
  const r = std.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(std)).toEqual([['alert0', 'Buy Signal', 'Buy Signal'], ['alert1', 'Sell Signal', 'Sell Signal']]);
    expect(std.ScalpingToolDynamicTPSL.alertConditions).toBe(std.alertConditions);
  });
  it('long_signal = trend_up and not in_long_trade (the trade ends on the opposite cross)', () => {
    const cs = S(bars, close);
    const fast = A(ta.ema(cs, 5)), slow = A(ta.ema(cs, 13));
    const up = xover(fast, slow), down = xunder(fast, slow);
    let inLong = false, inShort = false;
    const long: boolean[] = [], short: boolean[] = [];
    for (let i = 0; i < bars.length; i++) {
      long.push(up[i] && !inLong);
      short.push(down[i] && !inShort);
      if (long[i]) inLong = true;
      if (short[i]) inShort = true;
      if (down[i] && inLong) inLong = false;
      if (up[i] && inShort) inShort = false;
    }
    expect(nonEmpty(long)).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(timeAt(bars, long));
    expect(r.alerts[1].times).toEqual(timeAt(bars, short));
    expect(r.alerts[0].times).toEqual(r.markers.filter((m) => m.text === 'BUY').map((m) => m.time));
  });
});

describe('SCOTTGO Advanced MACD', () => {
  const r = scottgo.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(scottgo)).toEqual([
      ['alert0', 'Rising to falling', 'MACD histogram switched from a rising to falling state'],
      ['alert1', 'Falling to rising', 'MACD histogram switched from a falling to rising state'],
    ]);
    expect(scottgo.ScottgoAdvancedMacd.alertConditions).toBe(scottgo.alertConditions);
  });
  it('hist[1] >= 0 and hist < 0 / hist[1] <= 0 and hist > 0', () => {
    const cs = S(bars, close);
    const macd = A(ta.ema(cs, 12)).map((v, i) => v - A(ta.ema(cs, 26))[i]);
    const signal = A(ta.ema(S(bars, macd), 9));
    const hist = macd.map((m, i) => m - signal[i]);
    const h1 = lag(hist, 1);
    const fall = hist.map((h, i) => ge(h1[i], 0) && lt(h, 0));
    const rise = hist.map((h, i) => le(h1[i], 0) && gt(h, 0));
    expect(nonEmpty(fall)).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(timeAt(bars, fall));
    expect(r.alerts[1].times).toEqual(timeAt(bars, rise));
  });
  it('the markers carry the ids of the five plotshape outputs', () => {
    const ids = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4'];
    for (const m of r.markers) expect(ids).toContain(m.id);
    for (const id of ids) expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
    // a dot on every MACD / signal cross, with an up or a down triangle
    expect(idTimes(r.markers, 'shape0').length).toBe(idTimes(r.markers, 'shape1').length + idTimes(r.markers, 'shape2').length);
    for (const m of r.markers.filter((x) => x.id === 'shape3')) expect(m.price).toBe(-0.01);
    for (const m of r.markers.filter((x) => x.id === 'shape4')) expect(m.price).toBe(0.01);
  });
});

describe('Self-Aware Trend System', () => {
  const list = walk(1500, 3);
  const chart = { tickerid: 'NASDAQ:TEST', timeframe: '1D' };
  const r = sats.calculate(list, {}, chart);
  const MSG = (what: string) => what + ' on {{ticker}} | TF: {{interval}} | Price: {{close}}';
  const has = (id: string) => r.alerts.find((a) => a.id === id)!.times;
  const callTimes = (needle: string) => r.alertCalls.filter((c) => c.message.includes(needle)).map((c) => c.time);
  it('declares the 22 alertconditions of the original', () => {
    expect(decls(sats)).toEqual([
      ['alert0', '🟢 Buy Signal', MSG('🟢 BUY')],
      ['alert1', '🔴 Sell Signal', MSG('🔴 SELL')],
      ['alert2', '🟢 Buy Signal (Score A+ only, ≥80)', MSG('🟢 BUY A+ (score)')],
      ['alert3', '🔴 Sell Signal (Score A+ only, ≥80)', MSG('🔴 SELL A+ (score)')],
      ['alert4', '🟢 Buy Signal (Score A+ and A, ≥60)', MSG('🟢 BUY A+/A (score)')],
      ['alert5', '🔴 Sell Signal (Score A+ and A, ≥60)', MSG('🔴 SELL A+/A (score)')],
      ['alert6', '🟢 Buy Signal (Score A+/A/B, ≥40)', MSG('🟢 BUY A+/A/B (score)')],
      ['alert7', '🔴 Sell Signal (Score A+/A/B, ≥40)', MSG('🔴 SELL A+/A/B (score)')],
      ['alert8', '🟢 Buy Signal (TQI A+ only, ≥0.70)', MSG('🟢 BUY A+ (TQI)')],
      ['alert9', '🔴 Sell Signal (TQI A+ only, ≥0.70)', MSG('🔴 SELL A+ (TQI)')],
      ['alert10', '🟢 Buy Signal (TQI A+ and A, ≥0.50)', MSG('🟢 BUY A+/A (TQI)')],
      ['alert11', '🔴 Sell Signal (TQI A+ and A, ≥0.50)', MSG('🔴 SELL A+/A (TQI)')],
      ['alert12', '🟢 Buy Signal (TQI A+/A/B, ≥0.35)', MSG('🟢 BUY A+/A/B (TQI)')],
      ['alert13', '🔴 Sell Signal (TQI A+/A/B, ≥0.35)', MSG('🔴 SELL A+/A/B (TQI)')],
      ['alert14', '🎯 TP1 Hit', MSG('🎯 TP1 HIT')],
      ['alert15', '🎯 TP2 Hit', MSG('🎯 TP2 HIT')],
      ['alert16', '🏆 TP3 Hit', MSG('🏆 TP3 HIT')],
      ['alert17', '🛑 SL Hit', MSG('🛑 SL HIT')],
      ['alert18', '⏱ Timeout Exit', MSG('⏱ TIMEOUT EXIT')],
      ['alert19', '🔁 Flip Exit', MSG('🔁 FLIP EXIT')],
      ['alert20', '🔄 Character-Flip', MSG('🔄 CHAR-FLIP') + ' (TQI collapsed)'],
      ['alert21', '⚡ Any Signal (Buy or Sell)', MSG('⚡ Signal')],
    ]);
    expect(sats.SelfAwareTrendSystem.alertConditions).toBe(sats.alertConditions);
    expect(sats.hasAlertFunction).toBe(true);
  });
  it('buy / sell signals are the bars of the BUY / SELL labels; grades are nested subsets', () => {
    const buys = r.labels.filter((l) => l.text.startsWith('▲ BUY')).map((l) => l.time);
    const sells = r.labels.filter((l) => l.text.startsWith('▼ SELL')).map((l) => l.time);
    expect(buys.length).toBeGreaterThan(0);
    expect(sells.length).toBeGreaterThan(0);
    expect(has('alert0')).toEqual(buys);
    expect(has('alert1')).toEqual(sells);
    expect(has('alert21')).toEqual([...buys, ...sells].sort((a, b) => a - b));
    const sub = (a: number[], b: number[]) => a.every((t) => b.includes(t));
    for (const [hi, mid, lo, all] of [['alert2', 'alert4', 'alert6', 'alert0'], ['alert3', 'alert5', 'alert7', 'alert1'],
      ['alert8', 'alert10', 'alert12', 'alert0'], ['alert9', 'alert11', 'alert13', 'alert1']]) {
      expect(sub(has(hi), has(mid)) && sub(has(mid), has(lo)) && sub(has(lo), has(all))).toBe(true);
    }
    // the score grade: the label shows the score rounded (str.tostring(score, '#'))
    const score = new Map(r.labels.filter((l) => /^[▲▼]/.test(l.text)).map((l) => [l.time, Number(l.text.split(/\s+/).pop())]));
    for (const t of has('alert6')) expect(score.get(t)!).toBeGreaterThanOrEqual(39.5);
    for (const t of buys.filter((x) => !has('alert6').includes(x))) expect(score.get(t)!).toBeLessThanOrEqual(40.5);
  });
  it('TP / SL / timeout / flip / char-flip conditions are the bars of the matching alert() events', () => {
    expect(r.alertCalls.length).toBeGreaterThan(0);
    expect(has('alert14')).toEqual(callTimes('tp1_hit'));
    expect(has('alert15')).toEqual(callTimes('tp2_hit'));
    expect(has('alert16')).toEqual(callTimes('tp3_hit'));
    expect(has('alert17')).toEqual(callTimes('sl_hit'));
    expect(has('alert18')).toEqual(callTimes('timeout_exit'));
    expect(has('alert19')).toEqual(callTimes('flip_exit'));
    expect(has('alert20')).toEqual(callTimes('Confirmed character flip'));
    expect(has('alert14').length + has('alert17').length + has('alert19').length).toBeGreaterThan(0);
  });
  it('alert(): readable text once per bar close, on the bars with events', () => {
    for (const c of r.alertCalls) {
      expect(c.freq).toBe('once_per_bar_close');
      expect(c.message.startsWith('SATS NASDAQ:TEST 1D | ')).toBe(true);
    }
    expect(uniq(r.alertCalls.map((c) => c.time)).length).toBe(r.alertCalls.length);
    const eventBars = uniq([...has('alert0'), ...has('alert1'), ...has('alert14'), ...has('alert15'), ...has('alert16'),
      ...has('alert17'), ...has('alert18'), ...has('alert19'), ...has('alert20')]).sort((a, b) => a - b);
    expect(r.alertCalls.map((c) => c.time)).toEqual(eventBars);
    // an entry note: "buy LONG @ <entry> (<reason>)"
    const t0 = has('alert0')[0];
    const call = r.alertCalls.find((c) => c.time === t0)!;
    expect(call.message).toMatch(/buy LONG @ \d+\.\d{2} \((Price band break|Quality collapse|Price break \+ quality collapse)\)/);
  });
  it('the webhook packet is JSON with the ordered events', () => {
    const w = sats.calculate(list, { webhook: true }, chart);
    expect(w.alertCalls.map((c) => c.time)).toEqual(r.alertCalls.map((c) => c.time));
    for (const c of w.alertCalls) {
      const p = JSON.parse(c.message);
      expect(p.schema).toBe('sats.events.v2');
      expect(p.ticker).toBe('NASDAQ:TEST');
      expect(p.tf).toBe('1D');
      expect(p.bar_time).toBe((c.time as number) * 1000);
      expect(p.events.length).toBeGreaterThan(0);
      for (const e of p.events) if (e.event !== 'char_flip') expect(e.trade_id).toMatch(/^default:NASDAQ:TEST:1D:\d+:-?1$/);
    }
  });
  it('no alerts with Enable Alert Signals off; no call on an open last bar', () => {
    const off = sats.calculate(list, { enableAlerts: false }, chart);
    expect(off.alertCalls).toEqual([]);
    for (const a of off.alerts) expect(a.times).toEqual([]);
    const open = sats.calculate(list, {}, { ...chart, lastBarConfirmed: false });
    expect(open.alertCalls.some((c) => c.time === list[list.length - 1].time)).toBe(false);
  });
});

describe('Sequential Pattern Strength', () => {
  const r = sps.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(sps)).toEqual([
      ['alert0', 'SPS Long', 'Sequential pattern strength turned positive'],
      ['alert1', 'SPS Short', 'Sequential pattern strength turned negative'],
      ['alert2', 'SPS Overbought', 'Sequential pattern strength crossed above overbought level'],
      ['alert3', 'SPS Oversold', 'Sequential pattern strength crossed below oversold level'],
    ]);
    expect(sps.SequentialPatternStrength.alertConditions).toBe(sps.alertConditions);
  });
  it('the four conditions on the signal (and on the previous bar with the confirmed bars option)', () => {
    const sig = vals(r.plots.plot1);
    for (const [res, k] of [[r, 0], [sps.calculate(bars, { useConfirmedBars: true }), 1]] as const) {
      const cs = lag(sig, k), cp = lag(sig, k + 1);
      const long = cs.map((v, i) => gt(v, 0) && le(cp[i], 0));
      const short = cs.map((v, i) => le(v, 0) && gt(cp[i], 0));
      const ob = cs.map((v, i) => gt(v, 18) && le(cp[i], 18));
      const os = cs.map((v, i) => lt(v, -18) && ge(cp[i], -18));
      expect(nonEmpty(long)).toBeGreaterThan(0);
      expect(nonEmpty(ob)).toBeGreaterThan(0);
      expect(nonEmpty(os)).toBeGreaterThan(0);
      expect(res.alerts.map((a) => a.times)).toEqual([long, short, ob, os].map((f) => timeAt(bars, f)));
    }
  });
});

describe('Session Sweeps [LuxAlgo]: alert() calls', () => {
  const list = walk(3000, 5, 300);
  const chart = { tickerid: 'FX:TEST', timeframe: '5' };
  const r = sweeps.calculate(list, {}, chart);
  it('one call per new sweep zone, with the original text, once per bar', () => {
    expect(sweeps.hasAlertFunction).toBe(true);
    expect(r.alertCalls.length).toBeGreaterThan(0);
    const index = new Map(list.map((b, i) => [b.time, i]));
    for (const c of r.alertCalls) {
      expect(c.freq).toBe('once_per_bar');
      const m = /^TEST (buyside|sellside) session level breached, price (\d+\.\d{2}), timeframe 5$/.exec(c.message);
      expect(m).not.toBeNull();
      const b = list[index.get(c.time as number)!];
      expect(m![2]).toBe(b.close.toFixed(2));
      // buyside: the high above the level with an open below it; sellside: the mirror
      if (m![1] === 'buyside') expect(b.high).toBeGreaterThan(b.open);
      else expect(b.low).toBeLessThan(b.open);
    }
    // the sweep zones (boxes without text) start one bar before the bar of their call
    const zoneCallTimes = r.boxes.filter((b) => b.text === undefined)
      .map((b) => list[index.get(b.time1 as number)! + 1].time).sort((a, b) => a - b);
    expect(r.alertCalls.map((c) => c.time).sort((a, b) => (a as number) - (b as number))).toEqual(zoneCallTimes);
  });
  it('no call with both sweep zone switches off', () => {
    expect(sweeps.calculate(list, { swpBZ: false, swpSZ: false }, chart).alertCalls).toEqual([]);
  });
});

describe('Sessions [LuxAlgo]: Style ids', () => {
  const list = walk(2000, 9, 900);
  const r = sessions.calculate(list, { showSessionDivider: true }, { timeframe: '15' });
  it('session dividers carry shape0 - shape7, day dividers shape8 (Sunday) - shape14 (Saturday)', () => {
    const ids = Array.from({ length: 15 }, (_, k) => `shape${k}`);
    for (const m of r.markers) expect(ids).toContain(m.id);
    for (const id of ids) expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const m of r.markers.filter((x) => Number(x.id!.slice(5)) >= 8)) expect(m.text).toBe(days[Number(m.id!.slice(5)) - 8]);
    for (const m of r.markers.filter((x) => Number(x.id!.slice(5)) < 8)) {
      expect(m.text).toBe(Number(m.id!.slice(5)) % 2 === 0 ? '.' : '❚');
    }
  });
});

describe('Setup 9.1 (Larry Williams) + EMA 50', () => {
  const r = setup91.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(setup91)).toEqual([
      ['alert0', '9.1 Buy Alert', '9.1 Setup - BUY Signal'],
      ['alert1', '9.1 Sell Alert', '9.1 Setup - SELL Signal'],
    ]);
    expect(setup91.Setup91Ema50.alertConditions).toBe(setup91.alertConditions);
  });
  it('buySignal = ma1up and not ma1up[1]; sellSignal = ma1down and not ma1down[1]', () => {
    const ma = A(ta.ema(S(bars, close), 9));
    const up = ma.map((v, i) => gt(v, lag(ma, 1)[i]));
    const down = ma.map((v, i) => lt(v, lag(ma, 1)[i]));
    const buy = up.map((u, i) => u && !(i > 0 && up[i - 1]));
    const sell = down.map((d, i) => d && !(i > 0 && down[i - 1]));
    expect(nonEmpty(buy)).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
  });
});
