/**
 * Community ports, batch 25: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, str, type Bar } from 'oakscriptjs';
import * as mzz from '../../src/community/momentum-zigzag';
import * as mfe from '../../src/community/money-flow-extended';
import * as moneyball from '../../src/community/moneyball-ema-macd-indicator';
import * as mtc from '../../src/community/monotonic-trend-consensus';
import * as most from '../../src/community/most-moving-average-screener';
import * as mostRsi from '../../src/community/most-rsi';
import * as maCross from '../../src/community/moving-average-crossover-with-shading-signals';
import * as vwapKama from '../../src/community/moving-vwap-kama-cloud';
import * as mpo4 from '../../src/community/mpo4-lines-modal-engine';
import * as msl from '../../src/community/msl-squeeze-pulse';
import * as bos from '../../src/community/mtf-break-of-structure-market-structure-shift';
import * as obf from '../../src/community/mtf-order-block-finder';
import * as mbt from '../../src/community/multi-band-trend-line';
import * as mtfc from '../../src/community/multi-time-frame-candles-with-volume-info-3d';
import * as mdiv from '../../src/community/multiple-divergences';

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
const n = bars.length;
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const S = (a: number[]) => Series.fromArray(bars, a);
const timeAt = (flags: boolean[]) => bars.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const at = (a: number[], i: number) => (i >= 0 && i < a.length ? a[i] : NaN);

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
/** ta.barssince(cond) on bar i (NaN when never) */
const barssince = (cond: boolean[], i: number) => {
  for (let j = i; j >= 0; j--) if (cond[j]) return i - j;
  return NaN;
};
/** ta.valuewhen(cond, src, occurrence) on bar i */
const valuewhen = (cond: boolean[], src: (j: number) => number, i: number, occ: number) => {
  let k = 0;
  for (let j = i; j >= 0; j--) {
    if (cond[j]) {
      if (k === occ) return src(j);
      k++;
    }
  }
  return NaN;
};

describe('momentum-zigzag', () => {
  it('makes the alert() calls of the original on each LONG / SHORT signal', () => {
    expect(mzz.hasAlertFunction).toBe(true);
    expect(mzz.MomentumZigZag.hasAlertFunction).toBe(true);
    const r = mzz.calculate(bars, { momentumSelect: 'MovingAverage', maType: 'SMA', maLength: 5 });
    const ma = A(ta.sma(S(close), 5));
    const up = ma.map((v, i) => v > at(ma, i - 1) && at(ma, i - 2) > at(ma, i - 1));
    const down = ma.map((v, i) => v < at(ma, i - 1) && at(ma, i - 2) < at(ma, i - 1));
    const rsi5 = A(ta.rsi(S(close), 5));
    const ob = rsi5.map((v) => v > 80);
    const os = rsi5.map((v) => v < 20);
    // momentum_direction and the zigzag function of the original
    let dir = 0;
    let peak = NaN, bottom = NaN, prevDir = NaN;
    let slLong = low[0], slShort = high[0];
    const expected: { time: number; message: string }[] = [];
    for (let i = 0; i < n; i++) {
      dir = up[i] ? 1 : down[i] ? -1 : dir;
      const gu = dir === 1, gd = dir === -1, pgu = prevDir === 1, pgd = prevDir === -1;
      const pPeak = peak, pBottom = bottom;
      peak = (high[i] > pPeak && gu) || (pgd && gu) ? high[i] : isNaN(pPeak) ? 0 : pPeak;
      bottom = (low[i] < pBottom && gd) || (pgu && gd) ? low[i] : isNaN(pBottom) ? 0 : pBottom;
      const zz = gu && pgd ? pBottom : pgu && gd ? pPeak : NaN;
      prevDir = dir;
      const forceUp = down[i] && i > 0 && barssince(up, i - 1) >= barssince(ob, i - 1);
      const forceDown = up[i] && i > 0 && barssince(down, i - 1) >= barssince(os, i - 1);
      const goShort = down[i] && !forceUp;
      const goLong = up[i] && !forceDown;
      if (goLong) slLong = low[i] < zz ? low[i] : zz;
      if (goShort) slShort = high[i] > zz ? high[i] : zz;
      if (goLong) expected.push({ time: bars[i].time as number, message: 'long slprice=' + str.tostring(slLong) + ' tp=200' });
      if (goShort) expected.push({ time: bars[i].time as number, message: 'short slprice=' + str.tostring(slShort) + ' tp=200' });
    }
    expect(expected.length).toBeGreaterThan(10);
    // before the first momentum signal of each direction and the first swing the port differs from the original
    // (barssince of a condition never true, zigzag extremes starting from 0): compare from bar 60 on
    const t60 = bars[60].time as number;
    const got = r.alertCalls.map((c) => ({ time: c.time, message: c.message }));
    expect(got.filter((c) => c.time >= t60)).toEqual(expected.filter((c) => c.time >= t60));
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    // the take profit level is written as given
    const r2 = mzz.calculate(bars, { momentumSelect: 'MovingAverage', maLength: 5, takeProfitLevel: 150 });
    expect(r2.alertCalls.length).toBe(r.alertCalls.length);
    expect(r2.alertCalls.every((c) => / tp=150$/.test(c.message))).toBe(true);
    // QQE (default): one call per LONG / SHORT label
    const r3 = mzz.calculate(bars);
    expect(r3.alertCalls.map((c) => c.time)).toEqual(r3.markers.map((m) => m.time));
    expect(r3.alertCalls.map((c) => c.message.split(' ')[0])).toEqual(r3.markers.map((m) => (m.text!.startsWith('LONG') ? 'long' : 'short')));
  });
});

describe('money-flow-extended', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(mfe)).toEqual([
      ['alert0', 'Regular Bullish Divergence', 'Found a new Regular Bullish Divergence, `Pivot Lookback` number of bars to the left of the current bar.'],
      ['alert1', 'Regular Bearish Divergence', 'Found a new Regular Bearish Divergence, `Pivot Lookback` number of bars to the left of the current bar.'],
    ]);
    expect(mfe.MoneyFlowExtended.alertConditions).toBe(mfe.alertConditions);
    const r = mfe.calculate(bars);
    const mf = vals(r.plots.plot0 as { value: number }[]);
    const lb = 5;
    const pl = A(ta.pivotlow(S(mf), 5, lb)).map((v) => !isNaN(v));
    const ph = A(ta.pivothigh(S(mf), 5, lb)).map((v) => !isNaN(v));
    const plPrev = pl.map((_, i) => i > 0 && pl[i - 1]);
    const bull: boolean[] = [], bear: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const bs = barssince(plPrev, i);
      const inRange = 5 <= bs && bs <= 60;
      const m = (j: number) => at(mf, j - lb);
      bull[i] = pl[i] && at(low, i - lb) < valuewhen(pl, (j) => at(low, j - lb), i, 1) && m(i) > valuewhen(pl, m, i, 1) && inRange;
      // phInRange = _inRange(plFound[1]) in the original
      bear[i] = ph[i] && at(high, i - lb) > valuewhen(ph, (j) => at(high, j - lb), i, 1) && m(i) < valuewhen(ph, m, i, 1) && inRange;
    }
    expect(bull.filter(Boolean).length).toBeGreaterThan(3);
    expect(bear.filter(Boolean).length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(timeAt(bull));
    expect(r.alerts[1].times).toEqual(timeAt(bear));
  });
});

describe('moneyball-ema-macd-indicator', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(moneyball).map((d) => d[1])).toEqual([
      'MACD Crossed Above Zero', 'MACD Crossed Below Zero', 'Signal Line Crossed Above Zero', 'Signal Line Crossed Below Zero',
      'MACD New High Above Zero Line', 'MACD New Low Below Zero Line', 'MACD Orange bar', 'MACD Green bar', 'MACD White bar',
      'MACD Red bar', 'MACD Fuchsia bar',
    ]);
    expect(decls(moneyball)[0]).toEqual(['alert0', 'MACD Crossed Above Zero', 'MACD has crossed above the zero line']);
    expect(decls(moneyball)[10]).toEqual(['alert10', 'MACD Fuchsia bar', 'MACD Fuchsia bar condition']);
    expect(moneyball.MoneyballEmaMacd.alertConditions).toBe(moneyball.alertConditions);
    const r = moneyball.calculate(bars);
    const ema = (x: number[], l: number) => A(ta.ema(S(x), l));
    const macd = ema(close, 9).map((v, i) => v - ema(close, 50)[i]);
    const signal = A(ta.sma(S(macd), 16));
    const e3 = ema(close, 3), e9 = ema(close, 9), e20 = ema(close, 20), e50 = ema(close, 50);
    const above = macd.map((v) => v > 0), below = macd.map((v) => v < 0);
    const mas = macd.map((v, i) => v > signal[i]), mbs = macd.map((v, i) => v < signal[i]);
    const ch = macd.map((v, i) => v - at(macd, i - 1));
    const flags = [
      xover(macd, 0), xunder(macd, 0), xover(signal, 0), xunder(signal, 0),
      macd.map((_, i) => above[i] && mas[i] && ch[i] > 0), macd.map((_, i) => below[i] && mbs[i] && ch[i] < 0),
      macd.map((_, i) => below[i] && mas[i]), macd.map((_, i) => above[i] && mas[i]), mbs,
      macd.map((_, i) => below[i] && mbs[i]),
      macd.map((v, i) => e3[i] > e9[i] && close[i] < e20[i] && close[i] < e50[i] && v < 0),
    ];
    flags.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(f));
    });
  });
});

describe('monotonic-trend-consensus', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(mtc)).toEqual([
      ['alert0', 'Bullish Trend Signal', 'Monotonic Trend Consensus: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert1', 'Bearish Trend Signal', 'Monotonic Trend Consensus: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert2', 'Trend Lost / Neutral', 'Monotonic Trend Consensus: trend lost, consensus flat on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert3', 'Any Trend Change', 'Monotonic Trend Consensus: trend direction changed on {{exchange}}:{{ticker}} - {{interval}}'],
    ]);
    expect(mtc.MonotonicTrendConsensus.alertConditions).toBe(mtc.alertConditions);
    for (const showNeutral of [true, false]) {
      const r = mtc.calculate(bars, { showNeutral });
      // trend_dir from the line colour (bullish / bearish / neutral colour)
      const dir = (r.plots.plot0 as { color: string }[]).map((p) => (p.color === '#00ffaa' ? 1 : p.color === '#ff0000' ? -1 : 0));
      const turned = (d: number) => dir.map((v, i) => i > 0 && v === d && dir[i - 1] !== d);
      const bull = turned(1), bear = turned(-1), neutral = turned(0);
      expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
      expect(r.alerts[0].times).toEqual(timeAt(bull));
      expect(r.alerts[1].times).toEqual(timeAt(bear));
      expect(r.alerts[2].times).toEqual(timeAt(neutral));
      expect(r.alerts[3].times).toEqual(timeAt(bull.map((v, i) => v || bear[i])));
      if (!showNeutral) expect(r.alerts[2].times.length).toBe(0);
    }
  });
});

describe('most-moving-average-screener', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(most)).toEqual([['alert0', 'MBUY', 'BUY SIGNAL!'], ['alert1', 'SELL', 'SELL SIGNAL!']]);
    expect(most.MOSTScreener.alertConditions).toBe(most.alertConditions);
    const off = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`sh${String(i + 1).padStart(2, '0')}`, false]));
    const r = most.calculate(bars, off);
    const mostLine = vals(r.plots.plot0 as { value: number }[]);
    const exMov = vals(r.plots.plot1 as { value: number }[]);
    expect(xover(exMov, mostLine).some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(xover(exMov, mostLine)));
    expect(r.alerts[1].times).toEqual(timeAt(xunder(exMov, mostLine)));
    // Moving Average Screening Mode: the close crossing the average
    const r2 = most.calculate(bars, { ...off, maScreening: true });
    const ex2 = vals(r2.plots.plot1 as { value: number }[]);
    expect(r2.alerts[0].times).toEqual(timeAt(xover(close, ex2)));
    expect(r2.alerts[1].times).toEqual(timeAt(xunder(close, ex2)));
  });
});

describe('most-rsi', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(mostRsi)).toEqual([
      ['alert0', 'BUY', 'BUY SIGNAL!'],
      ['alert1', 'SELL', 'SELL SIGNAL!'],
      ['alert2', 'Regular Bullish Divergence', 'Found a new Regular Bullish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.'],
      ['alert3', 'Regular Bearish Divergence', 'Found a new Regular Bearish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.'],
    ]);
    expect(mostRsi.MOSTRSI.alertConditions).toBe(mostRsi.alertConditions);
    // the divergence alerts do not depend on Show Divergence
    for (const showDivergence of [true, false]) {
      const r = mostRsi.calculate(bars, { showDivergence });
      const rsiMa = vals(r.plots.rsiMa as { value: number }[]);
      const mostLine = vals(r.plots.most as { value: number }[]);
      expect(r.alerts[0].times).toEqual(timeAt(xover(rsiMa, mostLine)));
      expect(r.alerts[1].times).toEqual(timeAt(xunder(rsiMa, mostLine)));
      const rsi = vals(r.plots.rsi as { value: number }[]);
      const lb = 5;
      const pl = A(ta.pivotlow(S(rsi), 5, lb)).map((v) => !isNaN(v));
      const ph = A(ta.pivothigh(S(rsi), 5, lb)).map((v) => !isNaN(v));
      const plPrev = pl.map((_, i) => i > 0 && pl[i - 1]);
      const phPrev = ph.map((_, i) => i > 0 && ph[i - 1]);
      const m = (j: number) => at(rsi, j - lb);
      const bull: boolean[] = [], bear: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const bsl = barssince(plPrev, i), bsh = barssince(phPrev, i);
        bull[i] = pl[i] && m(i) > valuewhen(pl, m, i, 1) && 5 <= bsl && bsl <= 60
          && at(low, i - lb) < valuewhen(pl, (j) => at(low, j - lb), i, 1);
        bear[i] = ph[i] && m(i) < valuewhen(ph, m, i, 1) && 5 <= bsh && bsh <= 60
          && at(high, i - lb) > valuewhen(ph, (j) => at(high, j - lb), i, 1);
      }
      expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
      expect(r.alerts[2].times).toEqual(timeAt(bull));
      expect(r.alerts[3].times).toEqual(timeAt(bear));
    }
  });
});

describe('moving-average-crossover-with-shading-signals', () => {
  it('declares and fires the alertconditions of the original and gives the shape ids', () => {
    expect(decls(maCross)).toEqual([
      ['alert0', 'Long Entry', 'Buy'], ['alert1', 'Short Entry', 'Sell'],
      ['alert2', 'Exit Long', 'Exit Long'], ['alert3', 'Exit Short', 'Exit Short'],
    ]);
    expect(maCross.MovingAverageCrossoverWithShadingSignals.alertConditions).toBe(maCross.alertConditions);
    const r = maCross.calculate(bars);
    const fast = vals(r.plots.plot0 as { value: number }[]);
    const slow = vals(r.plots.plot1 as { value: number }[]);
    const trend = vals(r.plots.plot2 as { value: number }[]);
    const up = fast.map((f, i) => f >= slow[i] && slow[i] >= trend[i]);
    const down = fast.map((f, i) => f <= slow[i] && slow[i] <= trend[i]);
    // ta.cross(Fast, Slow) or ta.cross(Slow, Trend): the second call only runs when the first is false
    const p = [NaN, NaN, NaN, NaN];
    const crossed = fast.map((f, i) => {
      const call = (a: number, b: number, k: number) => {
        const res = (a > b && p[k] <= p[k + 1]) || (a < b && p[k] >= p[k + 1]);
        if (!isNaN(a) && !isNaN(b)) { p[k] = a; p[k + 1] = b; }
        return res;
      };
      return call(f, slow[i], 0) || call(slow[i], trend[i], 2);
    });
    const long = up.map((u, i) => u && crossed[i]);
    const short = down.map((d, i) => d && crossed[i]);
    const exitLong = up.map((u, i) => i > 0 && up[i - 1] && !u);
    const exitShort = down.map((d, i) => i > 0 && down[i - 1] && !d);
    [long, short, exitLong, exitShort].forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(f));
      expect(r.markers.filter((m) => m.id === `shape${k}`).map((m) => m.time)).toEqual(timeAt(f));
    });
    expect(r.markers.every((m) => ['shape0', 'shape1', 'shape2', 'shape3'].includes(m.id as string))).toBe(true);
  });
});

describe('moving-vwap-kama-cloud', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(vwapKama)).toEqual([
      ['alert0', 'Price Above MVWAP', 'Price crossed above Moving VWAP'],
      ['alert1', 'Price Below MVWAP', 'Price crossed below Moving VWAP'],
      ['alert2', 'MVWAP Above KAMA', 'Moving VWAP crossed above KAMA'],
      ['alert3', 'MVWAP Below KAMA', 'Moving VWAP crossed below KAMA'],
      ['alert4', 'Price Above KAMA', 'Price crossed above KAMA'],
      ['alert5', 'Price Below KAMA', 'Price crossed below KAMA'],
    ]);
    expect(vwapKama.MovingVwapKamaCloud.alertConditions).toBe(vwapKama.alertConditions);
    const r = vwapKama.calculate(bars);
    const mv = vals(r.plots.plot0 as { value: number }[]);
    const kama = vals(r.plots.plot1 as { value: number }[]);
    const flags = [xover(close, mv), xunder(close, mv), xover(mv, kama), xunder(mv, kama), xover(close, kama), xunder(close, kama)];
    flags.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(f));
    });
  });
});

describe('mpo4-lines-modal-engine', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(mpo4)).toEqual([
      ['alert0', 'Buy: Fast A Return from Oversold', 'Fast Line A crossed above oversold level.'],
      ['alert1', 'Sell: Fast A Return from Overbought', 'Fast Line A crossed below overbought level.'],
      ['alert2', 'Slow Line Color Change (Direction Mode)', 'Slow Line changed direction.'],
      ['alert3', 'Slow Line Color Change (Position vs Zero Mode)', 'Slow Line crossed zero level.'],
      ['alert4', 'Bullish Divergence (Fast A)', 'Bullish divergence detected on Fast Line A.'],
      ['alert5', 'Bearish Divergence (Fast A)', 'Bearish divergence detected on Fast Line A.'],
    ]);
    expect(mpo4.Mpo4LinesModalEngine.alertConditions).toBe(mpo4.alertConditions);
    const r = mpo4.calculate(bars);
    const line1 = vals(r.plots.plot0 as { value: number }[]);
    const line2 = vals(r.plots.plot1 as { value: number }[]);
    expect(r.alerts[0].times).toEqual(timeAt(xover(line2, -30)));
    expect(r.alerts[1].times).toEqual(timeAt(xunder(line2, 30)));
    const gtx = (a: number, b: number) => a > b;
    const dirChange = line1.map((v, i) => gtx(v, at(line1, i - 1)) !== gtx(at(line1, i - 1), at(line1, i - 2)));
    expect(r.alerts[2].times).toEqual(timeAt(dirChange));
    expect(r.alerts[3].times).toEqual([]);
    // the divergences: the Bull / Bear labels are drawn pivotLength (2) bars before the bar of the condition
    const idx = new Map(bars.map((b, i) => [b.time as number, i]));
    const shifted = (text: string) => r.markers.filter((m) => m.text === text).map((m) => bars[idx.get(m.time as number)! + 2].time);
    expect(r.alerts[4].times.length).toBeGreaterThan(2);
    expect(r.alerts[4].times).toEqual(shifted(' Bull '));
    expect(r.alerts[5].times).toEqual(shifted(' Bear '));
    // Position vs Zero mode
    const r2 = mpo4.calculate(bars, { slowColorMode: 'Position vs Zero' });
    const l1b = vals(r2.plots.plot0 as { value: number }[]);
    const pos = l1b.map((v, i) => (v >= 0) !== (at(l1b, i - 1) >= 0));
    expect(r2.alerts[2].times).toEqual([]);
    expect(r2.alerts[3].times).toEqual(timeAt(pos));
    // the return signals need "Show Fast A OB/OS Return Signals"
    const r3 = mpo4.calculate(bars, { showObosSignals: false });
    expect(r3.alerts[0].times).toEqual([]);
  });
});

describe('msl-squeeze-pulse', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(msl)).toEqual([
      ['alert0', 'Coil On', '{{ticker}} compression ratio entered its coiled percentile on {{interval}}'],
      ['alert1', 'Coil Released', '{{ticker}} compression ratio left its coiled percentile on {{interval}}'],
      ['alert2', 'Pulse Flip Up', '{{ticker}} pulse flipped positive on {{interval}}'],
      ['alert3', 'Pulse Flip Down', '{{ticker}} pulse flipped negative on {{interval}}'],
    ]);
    expect(msl.MslSqueezePulse.alertConditions).toBe(msl.alertConditions);
    const r = msl.calculate(bars);
    const coiled = (r.plots.plot0 as { color: string }[]).map((p) => p.color === 'rgb(245, 158, 11)');
    const pulse = r.plotCandles.pulse.map((c) => c.close);
    const nz = (v: number) => (isNaN(v) ? 0 : v);
    const on = coiled.map((c, i) => c && !(i > 0 && coiled[i - 1]));
    const off = coiled.map((c, i) => !c && i > 0 && coiled[i - 1]);
    const flipUp = pulse.map((v, i) => v > 0 && nz(at(pulse, i - 1)) <= 0);
    const flipDown = pulse.map((v, i) => v < 0 && nz(at(pulse, i - 1)) >= 0);
    [on, off, flipUp, flipDown].forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(f));
    });
  });
});

describe('mtf-break-of-structure-market-structure-shift', () => {
  it('makes the alert() calls of the original on each drawn break', () => {
    expect(bos.hasAlertFunction).toBe(true);
    expect(bos.MtfBreakOfStructureMarketStructureShift.hasAlertFunction).toBe(true);
    const chart = { timeframe: '1D' };
    const r = bos.calculate(bars, {}, chart);
    // timeframe 2 is the chart timeframe; timeframes 1 and 3 (hours) draw nothing on a daily chart. Every break after
    // the first one draws a line ending on the breaking bar and a BOS / MSS label (the lines and labels in the same
    // order) and gives one alert
    expect(r.lines.length).toBeGreaterThan(10);
    expect(r.lines.length).toBe(r.labels.length);
    const expected = r.lines.map((l, k) => {
      const kind = r.labels[k].text.startsWith('BOS') ? 'BOS' : 'MSS';
      const dir = l.color === '#4CAF50' ? 'bullish' : 'bearish';
      return { time: l.time2, message: `New ${dir} ${kind} formed on 1D`, freq: 'once_per_bar_close' };
    });
    expect(r.alertCalls).toEqual(expected);
    expect(r.alertCalls.some((c) => c.message.includes('BOS')) && r.alertCalls.some((c) => c.message.includes('MSS'))).toBe(true);
    // the alert inputs switch them off one kind at a time
    const r2 = bos.calculate(bars, { tf2MssAlert: false }, chart);
    expect(r2.alertCalls).toEqual(expected.filter((c) => c.message.includes('BOS')));
    const r3 = bos.calculate(bars, { tf2BosAlert: false, tf2MssAlert: false }, chart);
    expect(r3.alertCalls).toEqual([]);
  });
});

describe('mtf-order-block-finder', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(obf)).toEqual([
      ['alert0', 'New Order Block', 'Alert Fired!'],
      ['alert1', 'New Bullish Order Block', 'Alert Fired!'],
      ['alert2', 'New Bearish Order Block', 'Alert Fired!'],
    ]);
    expect(obf.MtfOrderBlockFinder.alertConditions).toBe(obf.alertConditions);
    const r = obf.calculate(bars, { threshold: 0.1, obPeriod: 3 }, { timeframe: '1D' });
    // on the chart timeframe each order block gets a label (no limit reached here) on the bar
    // (length + 1 - shift) = 3 bars before the bar where the pattern is found
    const idx = new Map(bars.map((b, i) => [b.time as number, i]));
    const found = (text: string) => r.labels.filter((l) => l.text === text).map((l) => bars[idx.get(l.time as number)! + 3].time);
    const bull = found('Bull OB');
    const bear = found('Bear OB');
    expect(bull.length).toBeGreaterThan(2);
    expect(bear.length).toBeGreaterThan(2);
    expect(r.alerts[1].times).toEqual(bull);
    expect(r.alerts[2].times).toEqual(bear);
    expect(r.alerts[0].times).toEqual([...new Set([...bull, ...bear])].sort((a, b) => (a as number) - (b as number)));
  });
});

describe('multi-band-trend-line', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(mbt)).toEqual([['alert0', 'Buy Alert', 'Buy Signal Generated'], ['alert1', 'Sell Alert', 'Sell Signal Generated']]);
    expect(mbt.MultiBandTrendLine.alertConditions).toBe(mbt.alertConditions);
    for (const bandType of ['Bollinger Bands', 'Donchian Channels'] as const) {
      const r = mbt.calculate(bars, { bandType });
      // trend from the trend line: up when it rises, down when it falls, else unchanged
      const tl = vals(r.plots.plot2 as { value: number }[]);
      let trend = 0;
      const tr = tl.map((v, i) => {
        const prev = i > 0 && !isNaN(tl[i - 1]) ? tl[i - 1] : 0;
        if (v > prev) trend = 1;
        else if (v < prev) trend = -1;
        return trend;
      });
      const buy = tr.map((t, i) => i > 0 && tr[i - 1] < 0 && t > 0);
      const sell = tr.map((t, i) => i > 0 && tr[i - 1] > 0 && t < 0);
      expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
      expect(r.alerts[0].times).toEqual(timeAt(buy));
      expect(r.alerts[1].times).toEqual(timeAt(sell));
    }
  });
});

describe('multi-time-frame-candles-with-volume-info-3d', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(mtfc)).toEqual([['alert0', 'New High', 'New High'], ['alert1', 'New Low', 'New Low']]);
    expect(mtfc.MultiTimeFrameCandlesWithVolumeInfo3d.alertConditions).toBe(mtfc.alertConditions);
    // daily candles on daily bars: the candles are the last 8 bars (na before 8 of them)
    const r = mtfc.calculate(bars, {}, { timeframe: '1D' });
    const hh = A(ta.highest(S(high), 8));
    const ll = A(ta.lowest(S(low), 8));
    // (the first bar does not start a candle: the oldest candle is na until the 9th bar)
    const newHigh = high.map((h, i) => i >= 8 && h === hh[i]);
    const newLow = low.map((l, i) => i >= 8 && l === ll[i]);
    expect(newHigh.some(Boolean) && newLow.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(newHigh));
    expect(r.alerts[1].times).toEqual(timeAt(newLow));
    // weekly candles: a high is new when it is the highest of the current and the 7 weeks before
    const r2 = mtfc.calculate(bars, { timeframe: 'W' }, { timeframe: '1D' });
    expect(r2.alerts[0].times.length).toBeGreaterThan(5);
    expect(r2.alerts[0].times.length).toBeLessThan(r.alerts[0].times.length);
  });
});

describe('multiple-divergences', () => {
  it('gives the id of the plotshape of each kind and count on the markers', () => {
    const r = mdiv.calculate(bars, { minDivCount: 1 });
    expect(r.markers.length).toBeGreaterThan(5);
    // teal regular bullish, red regular bearish, green hidden bullish, orange hidden bearish (Pine v4 colours)
    const first: Record<string, number> = { '#00897B': 0, '#FF5252': 9, '#4CAF50': 18, '#FF9800': 27 };
    for (const m of r.markers) {
      // "1" .. "8", "8+" above 8 (the ninth shape of the kind)
      const count = m.text === '8+' ? 9 : Number(m.text);
      expect(m.id).toBe(`shape${first[m.color as string] + Math.min(count, 9) - 1}`);
    }
    const ids = new Set(r.markers.map((m) => m.id));
    expect([...ids].every((id) => /^shape([0-9]|[12][0-9]|3[0-5])$/.test(id as string))).toBe(true);
    expect(ids.size).toBeGreaterThan(2);
  });
});
