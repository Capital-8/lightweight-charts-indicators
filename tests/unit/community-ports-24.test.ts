/**
 * Alerts and Style ids of community ports (batch 24): the alertcondition() declarations (ids, titles and messages of
 * the originals), the bars on which each condition is true (re-computed here from the original's expression), the
 * alert() calls (bars, messages, frequency), and the Style-settings ids on the emitted markers.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as mst from '../../src/community/market-structure-trend';
import * as martell from '../../src/community/martell-mnq-quantum-scalper-pro';
import * as maru from '../../src/community/marubozu-detector';
import * as mavw from '../../src/community/mavilimw';
import * as mechart from '../../src/community/mechart-moving-average-and-above-v1-1';
import * as mesa from '../../src/community/mesa-phase-adaptive-band-trend';
import * as nexus from '../../src/community/mfi-nexus-pro';
import * as mre from '../../src/community/mfi-rsi-ema-dynamic-signals';
import * as minervini from '../../src/community/minervini-trend-template-screener';
import * as mirage from '../../src/community/mirage-liquidity-sweep-pro';
import * as mix1 from '../../src/community/mix1-ema-cross-trend-channel';

/** Seeded random walk of daily bars with a random volume */
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
const bars = walk(1200, 11);
const n = bars.length;
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const markerIds = (r: { markers: { id?: string }[] }) => [...new Set(r.markers.map((m) => m.id))];
const timesOf = (r: { markers: { id?: string; time: unknown }[] }, ...ids: string[]) =>
  [...new Set(r.markers.filter((m) => ids.includes(m.id ?? '')).map((m) => m.time as number))].sort((a, b) => a - b);
const union = (...lists: number[][]) => [...new Set(lists.flat())].sort((a, b) => a - b);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const S = (list: Bar[], a: number[]) => Series.fromArray(list, a);

/** Independent crossover / crossunder (na = NaN compares false) */
const over = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const under = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);
const roll = (src: number[], len: number, f: (w: number[]) => number) =>
  src.map((_, i) => (i < len - 1 ? NaN : f(src.slice(i - len + 1, i + 1))));
const sma = (src: number[], len: number) => roll(src, len, (w) => w.reduce((s, v) => s + v, 0) / len);
const wma = (src: number[], len: number) =>
  roll(src, len, (w) => w.reduce((s, v, k) => s + v * (k + 1), 0) / ((len * (len + 1)) / 2));
const prev = (a: number[], k = 1) => a.map((_, i) => (i >= k ? a[i - k] : NaN));

describe('market-structure-trend', () => {
  const r = mst.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(mst)).toEqual([
      ['alert0', 'Bullish Structure Shift', 'Market Structure Trend: BULLISH structure shift confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert1', 'Bearish Structure Shift', 'Market Structure Trend: BEARISH structure shift confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert2', 'Any Structure Shift', 'Market Structure Trend: Market structure trend flipped on {{exchange}}:{{ticker}} - {{interval}}'],
    ]);
    expect(mst.MarketStructureTrend.alertConditions).toBe(mst.alertConditions);
  });
  it('fires on the structure flips', () => {
    const ph = A(ta.pivothigh(S(bars, bars.map((b) => b.high)), 5, 5));
    const pl = A(ta.pivotlow(S(bars, bars.map((b) => b.low)), 5, 5));
    let sh = NaN, sl = NaN, dir = 0;
    const dirs: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!isNaN(ph[i])) sh = ph[i];
      if (!isNaN(pl[i])) sl = pl[i];
      if (!isNaN(sh) && !isNaN(sl)) {
        if (dir === 0) dir = close[i] >= (sh + sl) / 2 ? 1 : -1;
        else if (dir === 1 && close[i] < sl) dir = -1;
        else if (dir === -1 && close[i] > sh) dir = 1;
      }
      dirs.push(dir);
    }
    const bull = dirs.map((d, i) => i > 0 && d === 1 && dirs[i - 1] === -1);
    const bear = dirs.map((d, i) => i > 0 && d === -1 && dirs[i - 1] === 1);
    expect(bull.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timeAt(bars, bull));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bear));
    expect(r.alerts[2].times).toEqual(timeAt(bars, bull.map((v, i) => v || bear[i])));
  });
  it('gives no flip on an open last bar', () => {
    const last = r.alerts[2].times.at(-1)!;
    const k = bars.findIndex((b) => b.time === last);
    const open = mst.calculate(bars.slice(0, k + 1), {}, { lastBarConfirmed: false });
    expect(open.alerts[2].times).not.toContain(last);
  });
  it('gives the circles the ids of their plotshape outputs', () => {
    expect(markerIds(r).sort()).toEqual(['shape0', 'shape1']);
    expect(timesOf(r, 'shape0')).toEqual(r.alerts[0].times);
    expect(timesOf(r, 'shape1')).toEqual(r.alerts[1].times);
  });
});

describe('martell-mnq-quantum-scalper-pro', () => {
  const r = martell.calculate(wave(1200, 7, 0.2, 6, 8, 1));
  it('declares alert() calls', () => {
    expect(martell.hasAlertFunction).toBe(true);
    expect(martell.MartellMnqQuantumScalperPro.hasAlertFunction).toBe(true);
  });
  it('calls alert() once per bar close on each entry', () => {
    const buy = '¡COMPRA MNQ! RR 1:1. Entrada detectada. Gestiona el riesgo.';
    const sell = '¡VENTA MNQ! RR 1:1. Entrada detectada. Gestiona el riesgo.';
    expect(r.alertCalls.length).toBeGreaterThan(0);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    const at = (text: string) => r.markers.filter((m) => m.text === text).map((m) => m.time as number);
    expect(r.alertCalls.filter((c) => c.message === buy).map((c) => c.time)).toEqual(at('BUY'));
    expect(r.alertCalls.filter((c) => c.message === sell).map((c) => c.time)).toEqual(at('SELL'));
    expect(r.alertCalls.every((c) => c.message === buy || c.message === sell)).toBe(true);
  });
});

describe('marubozu-detector', () => {
  // the walk plus crafted marubozu candles (bullish, bearish) and a near miss (shadow over 10 %)
  const crafted = bars.slice(0, 300).map((b) => ({ ...b }));
  const set = (i: number, o: number, h: number, l: number, c: number) => Object.assign(crafted[i], { open: o, high: h, low: l, close: c });
  set(100, 100, 110.5, 99.5, 110);
  set(150, 110, 110.4, 99.6, 100);
  set(200, 100, 112, 99.5, 110);
  const r = maru.calculate(crafted);
  it('declares the alertconditions of the original', () => {
    expect(decls(maru)).toEqual([
      ['alert0', 'Bullish Marubozu', 'Bullish Marubozu on {{ticker}}'],
      ['alert1', 'Bearish Marubozu', 'Bearish Marubozu on {{ticker}}'],
    ]);
    expect(maru.MarubozuDetector.alertConditions).toBe(maru.alertConditions);
  });
  it('fires on the marubozu candles', () => {
    const is = (b: Bar) => {
      const range = b.high - b.low;
      const body = Math.abs(b.close - b.open);
      return body >= 0.8 * range && b.high - Math.max(b.open, b.close) <= 0.1 * range && Math.min(b.open, b.close) - b.low <= 0.1 * range;
    };
    const bull = crafted.map((b) => is(b) && b.close > b.open);
    const bear = crafted.map((b) => is(b) && b.close < b.open);
    expect(r.alerts[0].times).toContain(crafted[100].time);
    expect(r.alerts[1].times).toContain(crafted[150].time);
    expect(r.alerts[0].times).not.toContain(crafted[200].time);
    expect(r.alerts[0].times).toEqual(timeAt(crafted, bull));
    expect(r.alerts[1].times).toEqual(timeAt(crafted, bear));
  });
});

describe('mavilimw', () => {
  const r = mavw.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(mavw)).toEqual([
      ['alert0', 'MAVW BUY', 'MAVW BUY!'],
      ['alert1', 'MAVW SELL', 'MAVW SELL!'],
      ['alert2', 'Color ALARM', 'MavilimW has changed color!'],
    ]);
    expect(mavw.MavilimW.alertConditions).toBe(mavw.alertConditions);
  });
  it('fires when MAVW crosses its previous value', () => {
    let m = close;
    for (const len of [3, 5, 8, 13, 21, 34]) m = wma(m, len);
    const up = over(m, prev(m));
    const dn = under(m, prev(m));
    expect(up.filter(Boolean).length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(timeAt(bars, up));
    expect(r.alerts[1].times).toEqual(timeAt(bars, dn));
    expect(r.alerts[2].times).toEqual(timeAt(bars, up.map((v, i) => v || dn[i])));
  });
});

describe('mechart-moving-average-and-above-v1-1', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(mechart)).toEqual([
      ['alert0', 'Price Above Target Price (Red)', 'Price is above the target price'],
      ['alert1', 'Price Below Moving Average (Green)', 'Price is below the moving average'],
    ]);
    expect(mechart.MechartMovingAverageAndAboveV11.alertConditions).toBe(mechart.alertConditions);
  });
  it('fires on the bars of the red and green backgrounds', () => {
    const r = mechart.calculate(bars, { percentage: 5 });
    const ma = sma(close, 200);
    const above = bars.map((b, i) => b.high > ma[i] * 1.05);
    const below = bars.map((b, i) => b.high < ma[i]);
    expect(above.filter(Boolean).length).toBeGreaterThan(5);
    expect(below.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timeAt(bars, above));
    expect(r.alerts[1].times).toEqual(timeAt(bars, below));
  });
});

describe('mesa-phase-adaptive-band-trend', () => {
  const r = mesa.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(mesa)).toEqual([
      ['alert0', 'Long Signal', 'Phase-Responsive Band Trend Long Signal on {{ticker}}'],
      ['alert1', 'Short Signal', 'Phase-Responsive Band Trend Short Signal on {{ticker}}'],
    ]);
    expect(mesa.MesaPhaseAdaptiveBandTrend.alertConditions).toBe(mesa.alertConditions);
  });
  it('fires on the regime changes (close beyond the bands)', () => {
    const upper = r.plots.plot1.map((p) => p.value as number);
    const lower = r.plots.plot2.map((p) => p.value as number);
    let sq = 0;
    const sqs: number[] = [];
    for (let i = 0; i < n; i++) {
      if (close[i] > upper[i]) sq = 1;
      else if (close[i] < lower[i]) sq = -1;
      sqs.push(sq);
    }
    const long = sqs.map((v, i) => i > 0 && v === 1 && sqs[i - 1] !== 1);
    const short = sqs.map((v, i) => i > 0 && v === -1 && sqs[i - 1] !== -1);
    expect(long.filter(Boolean).length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(timeAt(bars, long));
    expect(r.alerts[1].times).toEqual(timeAt(bars, short));
  });
});

describe('mfi-nexus-pro', () => {
  const r = nexus.calculate(bars, { mfiFilter: false, rsiFilter: false });
  it('declares the alertconditions of the original', () => {
    expect(decls(nexus)).toEqual([
      ['alert0', 'Buy Signal MA', 'Buy Signal MA: MFI crossed above the MA.'],
      ['alert1', 'Sell Signal MA', 'Sell Signal MA: MFI crossed below the MA.'],
      ['alert2', 'Buy Signal BB', 'Buy Signal BB: MFI crossed above the lower Bollinger Band.'],
      ['alert3', 'Sell Signal BB', 'Sell Signal BB: MFI crossed below the upper Bollinger Band.'],
      ['alert4', 'Buy Signal Div', 'Buy Signal Div: Bullish divergence detected.'],
      ['alert5', 'Sell Signal Div', 'Sell Signal Div: Bearish divergence detected.'],
      ['alert6', 'Buy OR Signal MA, BB, Div', 'Buy Signal: MFI crossed above the MA or BB or bullish divergence'],
      ['alert7', 'Sell OR Signal MA, BB, Div', 'Sell Signal: MFI crossed below the MA or BB or bearish divergence.'],
      ['alert8', 'Buy AND Signal MA, BB, Div', 'Buy Signal: MFI crossed above the MA or BB or bullish divergence'],
      ['alert9', 'Sell AND Signal MA, BB, Div', 'Sell Signal: MFI crossed below the MA or BB or bearish divergence.'],
    ]);
    expect(nexus.MfiNexusPro.alertConditions).toBe(nexus.alertConditions);
  });
  it('fires on the bars of the pane signals of each mode', () => {
    for (let k = 0; k < 6; k++) expect(r.alerts[k].times).toEqual(timesOf(r, `shape${k + 2}`));
    for (let k = 0; k < 6; k++) expect(r.alerts[k].times.length).toBeGreaterThan(0);
    expect(r.alerts[6].times).toEqual(union(r.alerts[0].times, r.alerts[2].times, r.alerts[4].times));
    expect(r.alerts[7].times).toEqual(union(r.alerts[1].times, r.alerts[3].times, r.alerts[5].times));
    // MA buy signals: the MFI crosses over its MA
    const mfi = r.plots.plot0.map((p) => p.value as number);
    const ma = r.plots.plot1.map((p) => p.value as number);
    const crossUp = timeAt(bars, over(mfi, ma));
    for (const t of r.alerts[0].times) expect(crossUp).toContain(t);
  });
  it('fires the AND / OR alerts on the chart signals of those modes', () => {
    const and = nexus.calculate(bars, { mfiFilter: false, rsiFilter: false, minBarsBetweenSignals: 0, andOrMode: 'MA and BB and Div' });
    expect(and.alerts[8].times).toEqual(timesOf(and, 'shape14', 'shape15', 'shape16', 'shape17'));
    expect(and.alerts[9].times).toEqual(timesOf(and, 'shape18', 'shape19', 'shape20', 'shape21'));
    expect(and.alerts[8].times.length + and.alerts[9].times.length).toBeGreaterThan(0);
    const or = nexus.calculate(bars, { mfiFilter: false, rsiFilter: false, andOrMode: 'MA or BB or Div' });
    expect(or.alerts[6].times).toEqual(timesOf(or, 'shape22'));
    expect(or.alerts[7].times).toEqual(timesOf(or, 'shape23'));
    // shape0 / shape1: the original's divergence triangles at the pivot (display.none, shown from the Style settings)
    expect(markerIds(or).sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape22', 'shape23', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7']);
  });
  it('gives each marker the id of its plotshape output', () => {
    const ids = markerIds(r);
    expect(ids.sort()).toEqual(['shape0', 'shape1', 'shape10', 'shape11', 'shape12', 'shape13', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7', 'shape8', 'shape9']);
    expect(timesOf(r, 'shape8')).toEqual(r.alerts[0].times);
    expect(timesOf(r, 'shape13')).toEqual(r.alerts[5].times);
  });
});

describe('mfi-rsi-ema-dynamic-signals', () => {
  const r = mre.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(mre)).toEqual([
      ['alert0', 'Buy Signal', 'MFI + RSI + EMA Buy Signal v6'],
      ['alert1', 'Sell Signal', 'MFI + RSI + EMA Sell Signal v6'],
    ]);
    expect(mre.MfiRsiEmaDynamicSignals.alertConditions).toBe(mre.alertConditions);
  });
  it('fires on the signal bars', () => {
    const cs = S(bars, close);
    const mfi = A(ta.mfi(cs, 14, S(bars, bars.map((b) => b.volume as number))));
    const rsi = A(ta.rsi(cs, 14));
    const fast = A(ta.ema(cs, 9));
    const slow = A(ta.ema(cs, 21));
    const near = fast.map((f, i) => Math.abs(((f - slow[i]) / slow[i]) * 100) <= 0.5);
    const xUp = over(fast, slow);
    const xDn = under(fast, slow);
    const mUp = over(prev(mfi), bars.map(() => 30));
    const mDn = under(prev(mfi), bars.map(() => 70));
    const buy = bars.map((_, i) => i > 0 && (mUp[i] || xUp[i - 1]) && (rsi[i - 1] > 45 || near[i - 1]));
    const sell = bars.map((_, i) => i > 0 && (mDn[i] || xDn[i - 1]) && (rsi[i - 1] < 55 || near[i - 1]));
    expect(buy.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
  });
});

describe('minervini-trend-template-screener', () => {
  const up = walk(900, 5, 1577836800, 86400, 0.35);
  const r = minervini.calculate(up);
  it('declares the alertconditions of the original', () => {
    expect(decls(minervini)).toEqual([['alert0', 'BUY', 'BUY: conditions met']]);
    expect(minervini.MinerviniTrendTemplateScreener.alertConditions).toBe(minervini.alertConditions);
  });
  it('fires on the BUY bars', () => {
    const c = up.map((b) => b.close);
    const s50 = sma(c, 50), s150 = sma(c, 150), s200 = sma(c, 200);
    const hi = roll(up.map((b) => b.high), 252, (w) => Math.max(...w));
    const lo = roll(up.map((b) => b.low), 252, (w) => Math.min(...w));
    const atr = A(ta.atr(up, 14));
    const atrPct = atr.map((v, i) => (v / c[i]) * 100);
    const aS = sma(atrPct, 10), aL = sma(atrPct, 50);
    const buy = c.map((x, i) => {
      const tt = x > s150[i] && x > s200[i] && s150[i] > s200[i] && i >= 20 && s200[i] > s200[i - 20]
        && s50[i] > s150[i] && s50[i] > s200[i] && x > s50[i] && x >= lo[i] * 1.3 && x >= hi[i] * 0.75;
      const mid = (x / (i >= 126 ? c[i - 126] : x) - 1) * 100 >= 20;
      const short = (x / (i >= 21 ? c[i - 21] : x) - 1) * 100 >= 5;
      return tt && mid && short && aS[i] < aL[i] * 0.9;
    });
    expect(buy.filter(Boolean).length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(timeAt(up, buy));
    expect(r.alerts[0].times).toEqual(r.markers.map((m) => m.time as number));
  });
});

describe('mirage-liquidity-sweep-pro', () => {
  const chart = { tickerid: 'NASDAQ:AAPL', mintick: 0.01, timeframe: '1D' };
  // immediate signals from any score (the defaults give no entry on these bars)
  const sig = { useHtf: false, requireConfirm: false, minScore: 0 };
  const mb = walk(1200, 5);
  const r = mirage.calculate(mb, { ...sig, alertTpHit: true }, chart);
  it('declares alert() calls', () => {
    expect(mirage.hasAlertFunction).toBe(true);
    expect(mirage.MirageLiquiditySweepPro.hasAlertFunction).toBe(true);
  });
  it('calls alert() once per bar close on entries, stops, break-even and targets', () => {
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    const P = '\\d+\\.\\d{2}';
    const entry = new RegExp(`^(🟢 LONG|🔴 SHORT) \\(Sweep\\) \\| NASDAQ:AAPL \\| TF: 1D \\| Score: \\d+ \\| Price: ${P} \\| SL: ${P} \\| TP1: ${P} \\| TP2: ${P} \\| TP3: ${P} \\| R:R: [\\d.]+$`);
    const stop = new RegExp(`^(🛡️ BE STOP-OUT|🛑 SL HIT) \\| NASDAQ:AAPL \\| Entry: ${P} \\| SL: ${P}$`);
    const be = new RegExp(`^🛡️ BREAK-EVEN \\| NASDAQ:AAPL \\| SL moved to ${P}$`);
    const tp = new RegExp(`^(🎯 TP1|🎯🎯 TP2|🏆 TP3) HIT \\| NASDAQ:AAPL \\| Price: ${P}$`);
    for (const c of r.alertCalls) expect([entry, stop, be, tp].some((re) => re.test(c.message))).toBe(true);
    const longs = r.alertCalls.filter((c) => c.message.startsWith('🟢 LONG')).map((c) => c.time);
    const shorts = r.alertCalls.filter((c) => c.message.startsWith('🔴 SHORT')).map((c) => c.time);
    expect(longs.length + shorts.length).toBeGreaterThan(0);
    expect(longs).toEqual(r.markers.filter((m) => m.text === 'Long ▲').map((m) => m.time as number));
    expect(shorts).toEqual(r.markers.filter((m) => m.text === 'Short ▼').map((m) => m.time as number));
    expect(r.alertCalls.some((c) => stop.test(c.message))).toBe(true);
    expect(r.alertCalls.some((c) => tp.test(c.message))).toBe(true);
    expect(r.alertCalls.some((c) => be.test(c.message))).toBe(true);
  });
  it('gives webhook JSON entries and keeps the TP / BE calls off by default', () => {
    const d = mirage.calculate(mb, { ...sig, webhook: true }, chart);
    const json = d.alertCalls.filter((c) => c.message.startsWith('{'));
    expect(json.length).toBe(r.alertCalls.filter((c) => /^(🟢|🔴)/u.test(c.message)).length);
    for (const c of json) {
      const o = JSON.parse(c.message);
      expect(['buy', 'sell']).toContain(o.action);
      expect(o.ticker).toBe('NASDAQ:AAPL');
    }
    expect(d.alertCalls.some((c) => /TP\d HIT|BREAK-EVEN/.test(c.message))).toBe(false);
  });
});

describe('mix1-ema-cross-trend-channel', () => {
  const r = mix1.calculate(bars, { goldenOn: true });
  it('declares the alertconditions of the original', () => {
    expect(decls(mix1)).toEqual([
      ['alert0', 'Any Alert', 'Any Alert'],
      ['alert1', 'Buy', 'Buy'],
      ['alert2', 'Sell', 'Sell'],
      ['alert3', 'Buy Close', 'Buy Close'],
      ['alert4', 'Sell Close', 'Sell Close'],
      ['alert5', 'Stop Loss Long', 'Stop Loss Long'],
      ['alert6', 'Stop Loss Short', 'Stop Loss Short'],
    ]);
    expect(mix1.Mix1EmaCrossTrendChannel.alertConditions).toBe(mix1.alertConditions);
  });
  it('fires on the entries and closes (Strategy 2, no stop loss)', () => {
    const f1 = A(ta.ema(S(bars, close), 26));
    const f2 = A(ta.ema(S(bars, close), 50));
    const mt = prev(sma(close, 200));
    const atr = A(ta.atr(bars, 200));
    let cond = 0;
    const buy: boolean[] = [], sell: boolean[] = [], bx: boolean[] = [], sx: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const maDir = f1[i] > f2[i] ? 1 : -1;
      const mtDir = close[i] >= mt[i] ? 1 : -1;
      const top = mt[i] + atr[i] * 0.618, bot = mt[i] - atr[i] * 0.618;
      const range = (b.open <= top || b.close <= top) && (b.open >= bot || b.close >= bot);
      const td = range ? 0 : mtDir === 1 && maDir === 1 ? 1 : mtDir === -1 && maDir === -1 ? -1 : 0;
      // condition[1] (na on the first bar: na != x is false)
      const p = i > 0 ? cond : NaN;
      const neq = (x: number) => !isNaN(p) && p !== x;
      const exitL = (td !== 1 || maDir === -1) && p === 1;
      const exitS = (td !== -1 || maDir === 1) && p === -1;
      const c = neq(1) && td === 1 ? 1 : neq(-1) && td === -1 ? -1 : neq(0) && (exitL || exitS) ? 0 : (isNaN(p) ? 0 : p);
      buy.push(neq(1) && c === 1);
      sell.push(neq(-1) && c === -1);
      bx.push(p === 1 && exitL);
      sx.push(p === -1 && exitS);
      cond = c;
    }
    expect(buy.filter(Boolean).length).toBeGreaterThan(3);
    expect(r.alerts[1].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[2].times).toEqual(timeAt(bars, sell));
    expect(r.alerts[3].times).toEqual(timeAt(bars, bx));
    expect(r.alerts[4].times).toEqual(timeAt(bars, sx));
    expect(r.alerts[5].times).toEqual([]);
    expect(r.alerts[0].times).toEqual(union(...r.alerts.slice(1).map((a) => a.times)));
  });
  it('gives each marker the id of its plotshape output and fires the stop loss alerts on the SL crosses', () => {
    expect(timesOf(r, 'shape0')).toEqual(r.alerts[1].times);
    expect(timesOf(r, 'shape1')).toEqual(r.alerts[2].times);
    expect(timesOf(r, 'shape2')).toEqual(union(r.alerts[3].times, r.alerts[4].times));
    expect(markerIds(r).sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape4', 'shape5']);
    const sl = mix1.calculate(bars, { slOn: true, sl: 1 });
    expect(sl.alerts[5].times.length + sl.alerts[6].times.length).toBeGreaterThan(0);
    expect(timesOf(sl, 'shape3')).toEqual(union(sl.alerts[5].times, sl.alerts[6].times));
    expect(sl.alerts[0].times).toEqual(union(...sl.alerts.slice(1).map((a) => a.times)));
    for (const m of [...r.markers, ...sl.markers]) expect(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']).toContain(m.id);
  });
});
