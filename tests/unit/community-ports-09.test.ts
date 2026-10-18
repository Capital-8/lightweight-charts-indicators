/**
 * Community ports, batch 09: the alertcondition() declarations and the bars on which each condition is true
 * (re-computed here from the original's expression), the alert() calls, and the Style ids on the emitted markers.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as vixFix from '../../src/community/cm-vix-fix-v3-upper-text-plots';
import * as combined from '../../src/community/combined-up-down-with-volume';
import * as combo from '../../src/community/combo-oscillator-macd-stoch-rsi-ema';
import * as consecutive from '../../src/community/consecutive-higher-lower-closings';
import * as consolidation from '../../src/community/consolidation-zones';
import * as cma from '../../src/community/corrected-moving-average';
import * as emmm from '../../src/community/crossover-emmm';
import * as crt from '../../src/community/crt-indicator';
import * as flux from '../../src/community/cumulative-volume-delta-strategy-flux-charts';
import * as cup from '../../src/community/cup-finder';
import * as bigTrade from '../../src/community/cvd-big-trade-detector-by-hk';
import * as cvdRupward from '../../src/community/cvd-rupward';
import * as cycleFlow from '../../src/community/cycle-flow-indicator-d-quant';
import * as cycleLow from '../../src/community/cycle-low-v5-john-k';
import * as cycleSynced from '../../src/community/cycle-synced-channel-breakout';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** Seeded random walk of bars (`step` seconds apart) with a random volume */
function walk(count: number, seed0: number, step = 86400, scale = 1): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5 * scale;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 * scale + (rnd() - 0.5) * 4 * scale);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({
      time: 1577836800 + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5 * scale,
      low: Math.min(o, p) - rnd() * 1.5 * scale, close: p, volume,
    });
  }
  return out;
}
const timesWhere = (list: Bar[], f: (i: number) => boolean) => list.filter((_, i) => f(i)).map((b) => b.time as number);
const boolTimes = (list: Bar[], flags: boolean[]) => timesWhere(list, (i) => flags[i]);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const values = (pts: { value: number }[]) => pts.map((p) => p.value);
const crossover = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v > (typeof b === 'number' ? b : b[i]) && a[i - 1] <= (typeof b === 'number' ? b : b[i - 1]));
const crossunder = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v < (typeof b === 'number' ? b : b[i]) && a[i - 1] >= (typeof b === 'number' ? b : b[i - 1]));
const idTimes = (markers: { id?: string; time: number }[], id: string) => markers.filter((m) => m.id === id).map((m) => m.time);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

describe('CM_Williams_Vix_Fix_V3_Upper_Text-Plots: Style ids', () => {
  const bars = walk(1500, 7, 86400, 2);
  const r = vixFix.calculate(bars, { sbc: true, sbcc: true });
  it('each text marker carries the id of its plotshape (shape0..shape3)', () => {
    const idOf: Record<string, string> = {
      WVF: 'shape0', 'WVF Was True\nNow False': 'shape1', 'Aggressive\nEntry': 'shape2', 'Filtered\nEntry': 'shape3',
    };
    expect(idTimes(r.markers, 'shape0').length).toBeGreaterThan(10);
    expect(idTimes(r.markers, 'shape1').length).toBeGreaterThan(5);
    for (const m of r.markers) expect(m.id).toBe(idOf[m.text!]);
    // the shapes follow their alert lines (1 on the same bars when the alert inputs are on)
    const all = vixFix.calculate(bars, { sbc: true, sbcc: true, sa1: true, sa2: true, sa3: true, sa4: true });
    const on = (k: string) => timesWhere(bars, (i) => all.plots[k][i].value === 1);
    expect(idTimes(all.markers, 'shape0')).toEqual(on('plot0'));
    expect(idTimes(all.markers, 'shape1')).toEqual(on('plot1'));
    expect(idTimes(all.markers, 'shape3')).toEqual(on('plot2'));
    expect(idTimes(all.markers, 'shape2')).toEqual(on('plot3'));
  });
});

describe('Combined Up down with volume: Style ids', () => {
  const bars = walk(1500, 13, 86400, 3);
  it('the circles carry shape0 (move), shape1 (volume) and shape2 (both)', () => {
    const roc = bars.map((b, i) => (i > 0 ? (100 * (b.close - bars[i - 1].close)) / bars[i - 1].close : NaN));
    const move = (i: number) => ge(Math.abs(roc[i]), 5);
    const vol = (i: number) => ge(bars[i].volume!, 1000000);
    const sep = combined.calculate(bars, { use: false });
    expect(idTimes(sep.markers, 'shape0')).toEqual(timesWhere(bars, move));
    expect(idTimes(sep.markers, 'shape1')).toEqual(timesWhere(bars, vol));
    expect(idTimes(sep.markers, 'shape0').length).toBeGreaterThan(10);
    expect(sep.markers.every((m) => m.id === 'shape0' || m.id === 'shape1')).toBe(true);
    const both = combined.calculate(bars, { use: true });
    expect(idTimes(both.markers, 'shape2')).toEqual(timesWhere(bars, (i) => move(i) && vol(i)));
    expect(both.markers.length).toBeGreaterThan(3);
    expect(both.markers.every((m) => m.id === 'shape2')).toBe(true);
  });
});

describe('Combo Oscillator: alertconditions', () => {
  const bars = walk(1200, 5);
  it('declares the two conditions of the original', () => {
    expect(decls(combo)).toEqual([
      ['alert0', 'Combo Bullish Cross', 'Combo Oscillator crossed above zero.'],
      ['alert1', 'Combo Bearish Cross', 'Combo Oscillator crossed below zero.'],
    ]);
    expect(combo.ComboOscillatorMacdStochRsiEma.alertConditions).toBe(combo.alertConditions);
  });
  it('fires on the crosses of the combo line with 0, also with the signals hidden', () => {
    for (const showSignals of [true, false]) {
      const r = combo.calculate(bars, { showSignals });
      const line = values(r.plots.plot0);
      const up = boolTimes(bars, crossover(line, 0));
      const down = boolTimes(bars, crossunder(line, 0));
      expect(up.length).toBeGreaterThan(10);
      expect(r.alerts[0].times).toEqual(up);
      expect(r.alerts[1].times).toEqual(down);
    }
  });
});

describe('Consecutive Higher/Lower Closings: alertconditions', () => {
  const bars = walk(1500, 9);
  it('declares the two conditions of the original', () => {
    expect(decls(consecutive)).toEqual([
      ['alert0', 'Buy Alert', 'BUY Signal'],
      ['alert1', 'Sell Alert', 'SELL Signal'],
    ]);
    expect(consecutive.ConsecutiveHigherLowerClosings.alertConditions).toBe(consecutive.alertConditions);
  });
  it('fires on the alternating BUY / SELL signals', () => {
    for (const [up, down] of [[3, 3], [2, 4]]) {
      let upCount = 0, downCount = 0, last = 0;
      const buy: boolean[] = [], sell: boolean[] = [];
      bars.forEach((b, i) => {
        const diff = i > 0 ? b.close - bars[i - 1].close : NaN;
        if (diff > 0) { upCount++; downCount = 0; } else if (diff < 0) { downCount++; upCount = 0; } else { upCount = 0; downCount = 0; }
        let bu = false, se = false;
        if (upCount === up && last !== 1) { bu = true; last = 1; }
        if (downCount === down && last !== -1) { se = true; last = -1; }
        buy.push(bu);
        sell.push(se);
      });
      const r = consecutive.calculate(bars, { consecutiveHigherValues: up, consecutiveLowerValues: down });
      expect(boolTimes(bars, buy).length).toBeGreaterThan(20);
      expect(r.alerts[0].times).toEqual(boolTimes(bars, buy));
      expect(r.alerts[1].times).toEqual(boolTimes(bars, sell));
    }
  });
});

describe('Consolidation Zones - Live: alertconditions', () => {
  it('declares the two conditions of the original', () => {
    expect(decls(consolidation)).toEqual([
      ['alert0', 'Breakout Up', 'Breakout Up'],
      ['alert1', 'Breakout Down', 'Breakout Down'],
    ]);
    expect(consolidation.ConsolidationZones.alertConditions).toBe(consolidation.alertConditions);
  });
  it('fires when the pivot leaves the zone after a consolidation longer than the minimum', () => {
    const expected = (bars: Bar[], prd: number, conslen: number) => {
      const n = bars.length;
      const dirs: number[] = [], zzs: number[] = [];
      let dir = 0, ppPrev = NaN, cnt = 0, ch = NaN, cl = NaN;
      const up: boolean[] = [], down: boolean[] = [];
      const truthy = (x: number) => !isNaN(x) && x !== 0;
      for (let i = 0; i < n; i++) {
        let hb = NaN, lb = NaN;
        if (i >= prd - 1) {
          const w = bars.slice(i - prd + 1, i + 1);
          if (bars[i].high >= Math.max(...w.map((b) => b.high))) hb = bars[i].high;
          if (bars[i].low <= Math.min(...w.map((b) => b.low))) lb = bars[i].low;
        }
        if (truthy(hb) && isNaN(lb)) dir = 1;
        else if (truthy(lb) && isNaN(hb)) dir = -1;
        dirs.push(dir);
        zzs.push(truthy(hb) && truthy(lb) ? (dir === 1 ? hb : lb) : truthy(hb) ? hb : truthy(lb) ? lb : NaN);
        let pp = NaN;
        for (let x = 0; x <= Math.min(1000, i); x++) {
          if (dirs[i - x] !== dir) break;
          const z = zzs[i - x];
          if (!truthy(z)) continue;
          if (isNaN(pp)) pp = z;
          else if ((dirs[i - x] === 1 && z > pp) || (dirs[i - x] === -1 && z < pp)) pp = z;
        }
        let bu = false, bd = false;
        if (truthy(pp - ppPrev)) {
          if (cnt > conslen) { bu = pp > ch; bd = pp < cl; }
          cnt = cnt > 0 && pp <= ch && pp >= cl ? cnt + 1 : 0;
        } else cnt++;
        ppPrev = pp;
        if (cnt >= conslen) {
          const w = bars.slice(Math.max(0, i - conslen + 1), i + 1);
          if (cnt === conslen) {
            ch = i >= conslen - 1 ? Math.max(...w.map((b) => b.high)) : NaN;
            cl = i >= conslen - 1 ? Math.min(...w.map((b) => b.low)) : NaN;
          } else { ch = Math.max(ch, bars[i].high); cl = Math.min(cl, bars[i].low); }
        }
        up.push(bu);
        down.push(bd);
      }
      return [boolTimes(bars, up), boolTimes(bars, down)];
    };
    for (const [seed, prd, conslen] of [[3, 10, 5], [17, 6, 3]]) {
      const bars = walk(1500, seed, 86400, 0.5);
      const [up, down] = expected(bars, prd, conslen);
      expect(up.length).toBeGreaterThan(3);
      expect(down.length).toBeGreaterThan(3);
      const r = consolidation.calculate(bars, { period: prd, consLen: conslen });
      expect(r.alerts[0].times).toEqual(up);
      expect(r.alerts[1].times).toEqual(down);
    }
  });
});

describe('Corrected Moving Average: alertconditions', () => {
  const bars = walk(1500, 21);
  it('declares the two conditions of the original (placeholders and line feeds kept)', () => {
    expect(decls(cma)).toEqual([
      ['alert0', 'Long Signal', 'Enter Long\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
      ['alert1', 'Short Signal', 'Enter Short\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
    ]);
    expect(cma.CorrectedMovingAverage.alertConditions).toBe(cma.alertConditions);
  });
  it('fires on the crosses of the SMA with the CMA', () => {
    const r = cma.calculate(bars, { length: 20 });
    const sma = values(r.plots.plot1);
    const c = values(r.plots.plot0);
    const long = boolTimes(bars, crossover(sma, c));
    expect(long.length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(long);
    expect(r.alerts[1].times).toEqual(boolTimes(bars, crossunder(sma, c)));
  });
});

describe('Crossover EMMM: alert() calls', () => {
  const bars = walk(1500, 25);
  const expected = (lastConfirmed: boolean) => {
    const r = emmm.calculate(bars);
    const m1 = values(r.plots.plot0);
    const m2 = values(r.plots.plot1);
    const col = (a: number[], i: number) => (i > 0 && gt(a[i], a[i - 1]) ? 'g' : i > 0 && lt(a[i], a[i - 1]) ? 'r' : null);
    const co = crossover(m1, m2);
    const cu = crossunder(m1, m2);
    const out: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      if (i === 0 || (i === bars.length - 1 && !lastConfirmed)) return;
      const red = col(m1, i - 1) === 'g' && col(m1, i) === 'r' && col(m2, i) === 'r';
      const green = col(m1, i - 1) === 'r' && col(m1, i) === 'g' && col(m2, i) === 'g';
      const message = co[i] ? 'BUY EMM' : cu[i] ? 'SELL EMM' : green ? 'Point Buy' : red ? 'Point Sell' : null;
      if (message) out.push({ time: b.time as number, message, freq: 'once_per_bar_close' });
    });
    return out;
  };
  it('declares alert() calls', () => {
    expect(emmm.hasAlertFunction).toBe(true);
    expect(emmm.CrossoverEmmm.hasAlertFunction).toBe(true);
  });
  it('calls alert() once per bar close with the first matching message, on confirmed bars', () => {
    const want = expected(true);
    for (const m of ['BUY EMM', 'SELL EMM', 'Point Buy', 'Point Sell']) {
      expect(want.filter((c) => c.message === m).length).toBeGreaterThan(3);
    }
    expect(emmm.calculate(bars).alertCalls).toEqual(want);
    expect(emmm.calculate(bars, {}, { lastBarConfirmed: true }).alertCalls).toEqual(want);
    // an open last bar: barstate.isconfirmed is false there
    const open = emmm.calculate(bars, {}, { lastBarConfirmed: false }).alertCalls;
    expect(open).toEqual(expected(false));
    // a last bar with a message
    const k = want[want.length - 1].time;
    const cut = bars.filter((b) => (b.time as number) <= k);
    expect(emmm.calculate(cut).alertCalls.at(-1)?.time).toBe(k);
    expect(emmm.calculate(cut, {}, { lastBarConfirmed: false }).alertCalls.at(-1)?.time ?? 0).toBeLessThan(k);
  });
});

describe('CRT indicator: alertconditions', () => {
  const bars = walk(1500, 29);
  it('declares the two conditions of the original', () => {
    expect(decls(crt)).toEqual([
      ['alert0', 'Bullish CRT Alert', 'Bullish CRT Pattern Detected'],
      ['alert1', 'Bearish CRT Alert', 'Bearish CRT Pattern Detected'],
    ]);
    expect(crt.CrtIndicator.alertConditions).toBe(crt.alertConditions);
  });
  it('fires on the two-candle patterns, also without the box plots', () => {
    const bull = timesWhere(bars, (i) => {
      if (i === 0) return false;
      const p = bars[i - 1], b = bars[i];
      return lt(p.close, p.open) && gt(b.close, b.open) && lt(b.low, p.low) && ge(b.close, p.low) && lt(b.close, p.open);
    });
    const bear = timesWhere(bars, (i) => {
      if (i === 0) return false;
      const p = bars[i - 1], b = bars[i];
      return gt(p.close, p.open) && lt(b.close, b.open) && gt(b.high, p.high) && lt(b.close, p.high) && gt(b.close, p.open) && gt(b.low, p.low);
    });
    expect(bull.length).toBeGreaterThan(5);
    expect(bear.length).toBeGreaterThan(5);
    for (const showBox of [true, false]) {
      const r = crt.calculate(bars, { showBox });
      expect(r.alerts[0].times).toEqual(bull);
      expect(r.alerts[1].times).toEqual(bear);
    }
  });
});

describe('Cumulative Volume Delta Strategy | Flux Charts: alertconditions and alert() calls', () => {
  const bars = walk(1500, 3, 900, 0.3);
  const chart = { timeframe: '15' };
  const full = flux.calculate(bars, {}, chart);
  // entries: the Buy / Sell labels at the entry bar; exits: the TP / SL markers at the exit bar
  const index = (t: number) => bars.findIndex((b) => b.time === t);
  const events = [
    ...full.labels.filter((l) => l.text === 'Buy').map((l) => ({ i: index(l.time), k: 0 })),
    ...full.labels.filter((l) => l.text === 'Sell').map((l) => ({ i: index(l.time), k: 1 })),
    ...full.markers.filter((m) => m.text === 'TP').map((m) => ({ i: index(m.time), k: 2 })),
    ...full.markers.filter((m) => m.text === 'SL').map((m) => ({ i: index(m.time), k: 3 })),
  ];
  const NAMES = ['Buy Signal', 'Sell Signal', 'Take-Profit Signal', 'Stop-Loss Signal'];
  it('declares the four conditions of the original and alert() calls', () => {
    expect(decls(flux)).toEqual(NAMES.map((t, k) => [`alert${k}`, t, '']));
    expect(flux.CumulativeVolumeDeltaStrategyFluxCharts.alertConditions).toBe(flux.alertConditions);
    expect(flux.hasAlertFunction).toBe(true);
    expect(flux.CumulativeVolumeDeltaStrategyFluxCharts.hasAlertFunction).toBe(true);
  });
  it('fires on the last closed bar only (initRun), with the entries and exits of the strategy', () => {
    expect(new Set(events.map((e) => e.k)).size).toBeGreaterThanOrEqual(3);
    expect(events.length).toBeGreaterThan(8);
    // on the full set: nothing (no event on the last bar)
    expect(events.some((e) => e.i === bars.length - 1)).toBe(false);
    expect(full.alerts.every((a) => a.times.length === 0)).toBe(true);
    expect(full.alertCalls).toEqual([]);
    for (const e of events) {
      const t = bars[e.i].time;
      const kinds = new Set(events.filter((x) => x.i === e.i).map((x) => x.k));
      // the event bar is the last bar
      const r = flux.calculate(bars.slice(0, e.i + 1), {}, chart);
      r.alerts.forEach((a, k) => expect(a.times).toEqual(kinds.has(k) ? [t] : []));
      expect(r.alertCalls).toEqual(NAMES.filter((_, k) => kinds.has(k)).map((message) => ({ time: t, message, freq: 'once_per_bar' })));
      // the event bar is the bar before an open last bar: still fires there
      const o = flux.calculate(bars.slice(0, e.i + 2), {}, { ...chart, lastBarConfirmed: false });
      o.alerts.forEach((a, k) => expect(a.times).toEqual(kinds.has(k) ? [t] : []));
      // one closed bar later: initRun is still true on the event bar
      const later = flux.calculate(bars.slice(0, e.i + 2), {}, chart);
      later.alerts.forEach((a, k) => expect(a.times.includes(t)).toBe(false));
      // an open last bar is not read
      const openLast = flux.calculate(bars.slice(0, e.i + 1), {}, { ...chart, lastBarConfirmed: false });
      expect(openLast.alerts.every((a) => a.times.length === 0)).toBe(true);
    }
  });
  it('the alert() call of a signal needs its input; the condition does not', () => {
    const e = events.find((x) => x.k === 0)!;
    const r = flux.calculate(bars.slice(0, e.i + 1), { buyAlertEnabled: false }, chart);
    expect(r.alerts[0].times).toEqual([bars[e.i].time]);
    expect(r.alertCalls.some((c) => c.message === 'Buy Signal')).toBe(false);
  });
});

describe('Cup Finder: alertconditions', () => {
  it('declares the three conditions of the original (plot placeholder kept)', () => {
    expect(decls(cup)).toEqual([
      ['alert0', 'Bullish Cup Found', 'Bullish Cup Found, Included:{{plot("included")}}'],
      ['alert1', 'Bearish Cup Found', 'Bearish Cup Found, Included:{{plot("included")}}'],
      ['alert2', 'Cup Found', 'Cup Found, Included:{{plot("included")}}'],
    ]);
    expect(cup.CupFinder.alertConditions).toBe(cup.alertConditions);
  });
  it('fires on the bars of a cup (the included plot), bullish or bearish by the cup label', () => {
    const bars = walk(1500, 3, 86400, 0.3);
    const r = cup.calculate(bars, { includeRate: 40, widthr: 10 });
    const found = timesWhere(bars, (i) => !isNaN(r.plots.plot0[i].value));
    expect(found.length).toBeGreaterThan(5);
    expect(r.alerts[2].times).toEqual(found);
    expect([...r.alerts[0].times, ...r.alerts[1].times].sort((a, b) => a - b)).toEqual(found);
    const bullLabels = r.labels.filter((l) => l.color === cup.defaultInputs.bullColor).map((l) => l.time);
    const bearLabels = r.labels.filter((l) => l.color === cup.defaultInputs.bearColor).map((l) => l.time);
    expect(bullLabels.length + bearLabels.length).toBe(found.length);
    expect(bullLabels.length).toBeGreaterThan(0);
    expect(bearLabels.length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(bullLabels);
    expect(r.alerts[1].times).toEqual(bearLabels);
  });
});

describe('CVD & Big Trade Detector: Style ids', () => {
  const bars = walk(1500, 43);
  it('the whale circles carry shape0 (buy) / shape1 (sell)', () => {
    const r = bigTrade.calculate(bars);
    const buy = r.markers.filter((m) => m.color === bigTrade.defaultInputs.btBuyColor);
    const sell = r.markers.filter((m) => m.color === bigTrade.defaultInputs.btSellColor);
    expect(buy.length).toBeGreaterThan(5);
    expect(sell.length).toBeGreaterThan(5);
    expect(buy.length + sell.length).toBe(r.markers.length);
    expect(buy.every((m) => m.id === 'shape0')).toBe(true);
    expect(sell.every((m) => m.id === 'shape1')).toBe(true);
  });
});

describe('CVD (Cumulative Volume Delta): alertconditions', () => {
  const bars = walk(1500, 47);
  it('declares the five conditions of the original', () => {
    expect(decls(cvdRupward)).toEqual([
      ['alert0', 'CVD Long Signal Alert', 'CVD Long Signal'],
      ['alert1', 'CVD Short Signal Alert', 'CVD Short Signal'],
      ['alert2', 'CVD Cross Up MA B Alert', 'MA Cross Up MA'],
      ['alert3', 'CVD Cross Down MA B Alert', 'CVD Cross Down MA'],
      ['alert4', 'Volume Delta Alert', 'Volume Delta exceeds threshold!'],
    ]);
    expect(cvdRupward.CvdRupward.alertConditions).toBe(cvdRupward.alertConditions);
  });
  it('fires on the crosses of the CVD with MA A / MA B and on large volume deltas', () => {
    const delta = bars.map((b) => (b.close > b.open ? b.volume! : 0) - (b.close < b.open ? b.volume! : 0));
    let sum = 0;
    const cvd = delta.map((d) => (sum += d));
    const r = cvdRupward.calculate(bars, { alertThreshold: 3000000 });
    expect(values(r.plots.plot0)).toEqual(cvd);
    const maA = values(r.plots.plot1);
    const maB = values(r.plots.plot2);
    const flags = [crossover(cvd, maA), crossunder(cvd, maA), crossover(cvd, maB), crossunder(cvd, maB),
      delta.map((d) => Math.abs(d) >= 3000000)];
    flags.forEach((f, k) => {
      expect(boolTimes(bars, f).length).toBeGreaterThan(5);
      expect(r.alerts[k].times).toEqual(boolTimes(bars, f));
    });
    // the MA crosses do not depend on the lines being shown
    const hidden = cvdRupward.calculate(bars, { alertThreshold: 3000000, showMovingAvg: false });
    expect(hidden.alerts.map((a) => a.times)).toEqual(r.alerts.map((a) => a.times));
  });
});

describe('Cycle & Flow Indicator - D_Quant: alertconditions', () => {
  const bars = walk(1500, 53);
  it('declares the two conditions of the original', () => {
    expect(decls(cycleFlow)).toEqual([
      ['alert0', 'CFA Bullish Cycle', 'Cycle Flow: Bullish Trend Started'],
      ['alert1', 'CFA Bearish Cycle', 'Cycle Flow: Bearish Trend Started'],
    ]);
    expect(cycleFlow.CycleFlowIndicatorDQuant.alertConditions).toBe(cycleFlow.alertConditions);
  });
  it('fires on the crosses of the trend state with 0', () => {
    const r = cycleFlow.calculate(bars);
    // the state from the candle colour: bull #089981, bear #f23645, else neutral
    const state = r.plotCandles.quantCandles.map((c) => (c.color === '#089981' ? 1 : c.color === '#f23645' ? -1 : 0));
    const up = boolTimes(bars, crossover(state, 0));
    const down = boolTimes(bars, crossunder(state, 0));
    expect(up.length).toBeGreaterThan(10);
    expect(down.length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(down);
  });
});

describe('Cycle Low (RSI + StochRSI): alertconditions', () => {
  const bars = walk(1500, 59, 86400, 2);
  it('declares the condition of the original (placeholders kept)', () => {
    expect(decls(cycleLow)).toEqual([['alert0', 'Cycle Low', 'Cycle Low on {{ticker}} {{interval}}']]);
    expect(cycleLow.CycleLowRsiStochRsi.alertConditions).toBe(cycleLow.alertConditions);
  });
  it('fires on the cycle low signals, also with the markers hidden', () => {
    const close = new Series(bars, (b) => b.close);
    const rsi = A(ta.rsi(close, 14));
    const n = bars.length;
    const stoch = rsi.map((r, i) => {
      if (i < 13) return NaN;
      const w = rsi.slice(i - 13, i + 1);
      const hh = Math.max(...w), ll = Math.min(...w);
      return Math.abs(hh - ll) <= EPS ? 50 : ((r - ll) / (hh - ll)) * 100;
    });
    const sma = (a: number[], len: number) => a.map((_, i) => (i < len - 1 ? NaN : a.slice(i - len + 1, i + 1).reduce((s, v) => s + v, 0) / len));
    const k = sma(stoch, 3);
    const d = sma(k, 3);
    const rsiUp = crossover(rsi, 33);
    const stUp = crossover(k, d);
    const flags: boolean[] = [];
    let bR = NaN, bS = NaN;
    for (let i = 0; i < n; i++) {
      bR = rsiUp[i] ? 0 : isNaN(bR) ? NaN : bR + 1;
      bS = stUp[i] ? 0 : isNaN(bS) ? NaN : bS + 1;
      const crossOk = (isNaN(bR) ? 1e6 : bR) <= 1 && (isNaN(bS) ? 1e6 : bS) <= 1;
      const rPrev = i > 0 && lt(rsi[i - 1], 33);
      const sPrev = i > 0 && lt(Math.min(k[i - 1], d[i - 1]), 20);
      const score = +rsiUp[i] + +stUp[i] + +rPrev + +sPrev;
      flags.push(crossOk && (rPrev || sPrev) && score >= 3);
    }
    const want = boolTimes(bars, flags);
    expect(want.length).toBeGreaterThan(5);
    const r = cycleLow.calculate(bars);
    expect(r.alerts[0].times).toEqual(want);
    expect(r.markers.map((m) => m.time)).toEqual(want);
    const hidden = cycleLow.calculate(bars, { plotLabels: false });
    expect(hidden.markers).toEqual([]);
    expect(hidden.alerts[0].times).toEqual(want);
  });
});

describe('Cycle-Synced Channel Breakout: alertconditions', () => {
  const bars = walk(1500, 61);
  it('declares the two conditions of the original', () => {
    expect(decls(cycleSynced)).toEqual([
      ['alert0', 'Cycle Breakout BUY', 'Cycle-Synced Channel Breakout: BUY'],
      ['alert1', 'Cycle Breakout SELL', 'Cycle-Synced Channel Breakout: SELL'],
    ]);
    expect(cycleSynced.CycleSyncedChannelBreakout.alertConditions).toBe(cycleSynced.alertConditions);
  });
  it('fires on the buy / sell signals after the cooldown, also with the signals hidden', () => {
    const r = cycleSynced.calculate(bars);
    const upper = values(r.plots.plot0);
    const lower = values(r.plots.plot1);
    const price = bars.map((b) => (b.high + b.low) / 2);
    const priceSma = A(ta.sma(Series.fromArray(bars, price), 20));
    const hp = A(ta.ema(Series.fromArray(bars, price.map((p, i) => p - priceSma[i])), 3));
    const power = A(ta.ema(Series.fromArray(bars, hp.map((v) => v * v)), 5));
    const body = bars.map((b) => Math.abs(b.close - b.open));
    const avgBody = A(ta.sma(Series.fromArray(bars, body), 20));
    const buy: boolean[] = [], sell: boolean[] = [];
    let last = NaN;
    bars.forEach((b, i) => {
      const p = bars[i - 1];
      const bullE = !!p && lt(p.close, p.open) && gt(b.close, b.open) && gt(b.close, p.open) && lt(b.open, p.close);
      const bearE = !!p && gt(p.close, p.open) && lt(b.close, b.open) && lt(b.close, p.open) && gt(b.open, p.close);
      const strong = gt(body[i], 1.2 * avgBody[i]);
      const rising = i > 0 && gt(power[i], power[i - 1]);
      const ok = isNaN(last) || i - last > 5;
      const bu = (bullE || strong) && gt(b.close, upper[i]) && rising && ok;
      const be = (bearE || strong) && lt(b.close, lower[i]) && rising && ok;
      if (bu || be) last = i;
      buy.push(bu);
      sell.push(be);
    });
    expect(boolTimes(bars, buy).length).toBeGreaterThan(5);
    expect(boolTimes(bars, sell).length).toBeGreaterThan(5);
    for (const showBreakout of [true, false]) {
      const q = cycleSynced.calculate(bars, { showBreakout });
      expect(q.alerts[0].times).toEqual(boolTimes(bars, buy));
      expect(q.alerts[1].times).toEqual(boolTimes(bars, sell));
    }
  });
});
