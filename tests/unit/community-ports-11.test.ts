/**
 * Community ports, batch 11: the alertcondition() declarations and the bars on which each condition is true
 * (re-computed here from the original's expression), and the Style ids / fills of the emitted outputs.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as bayes from '../../src/community/dual-bayesian-for-loop';
import * as maSd from '../../src/community/dual-ma-sd-oscillator';
import * as rsiSm from '../../src/community/dual-rsi-smoother';
import * as psar from '../../src/community/dynamic-score-psar';
import * as dsi from '../../src/community/dynamic-structure-indicator';
import * as sdz from '../../src/community/dynamic-supply-and-demand-zones';
import * as dsr from '../../src/community/dynamic-support-resistance';
import * as dtc from '../../src/community/dynamic-trend-channel';
import * as dvf from '../../src/community/dynamic-volatility-filter';
import * as dvc from '../../src/community/dynamic-volume-clusters';
import * as vwap from '../../src/community/dynamic-vwap-fair-value-divergence-suite';
import * as epa from '../../src/community/early-pivot-alert-v1a';
import * as edward from '../../src/community/edward-smart-channel-reversal';
import * as eati from '../../src/community/ehlers-adaptive-trend-indicator';
import * as eit from '../../src/community/ehlers-instantaneous-trend';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

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
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const values = (pts: { value: number }[]) => pts.map((p) => p.value);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const S = (bars: Bar[], a: number[]) => Series.fromArray(bars, a);
const crossover = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v > (typeof b === 'number' ? b : b[i]) && a[i - 1] <= (typeof b === 'number' ? b : b[i - 1]));
const crossunder = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v < (typeof b === 'number' ? b : b[i]) && a[i - 1] >= (typeof b === 'number' ? b : b[i - 1]));
const idTimes = (items: { id?: string; time: number }[], id: string) => items.filter((m) => m.id === id).map((m) => m.time);
const boolTimes = (list: Bar[], flags: boolean[]) => timesWhere(list, (i) => flags[i]);

describe('Dual Bayesian For Loop: alertconditions', () => {
  const bars = walk(1200, 3);
  it('declares the two conditions of the original', () => {
    expect(decls(bayes)).toEqual([
      ['alert0', 'Dual Bayesian Bullish Cross', 'Dual Bayesian Bullish Cross {{exchange}}:{{ticker}}'],
      ['alert1', 'Dual Bayesian Bearish Cross', 'Dual Bayesian Bearish Cross {{exchange}}:{{ticker}}'],
    ]);
    expect(bayes.DualBayesianForLoop.alertConditions).toBe(bayes.alertConditions);
  });
  it('fires on the crosses of zero of the binary signal', () => {
    const r = bayes.calculate(bars);
    const sig = values(r.plots.plot2);
    const up = boolTimes(bars, crossover(sig, 0));
    const down = boolTimes(bars, crossunder(sig, 0));
    expect(up.length).toBeGreaterThan(5);
    expect(down.length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(down);
  });
});

describe('Dual MA SD Oscillator: alertconditions', () => {
  const bars = walk(1500, 5);
  it('declares the two conditions of the original', () => {
    expect(decls(maSd)).toEqual([
      ['alert0', 'Bull Signal', 'Dual MA SD Oscillator Bull Signal on {{ticker}}'],
      ['alert1', 'Bear Signal', 'Dual MA SD Oscillator Bear Signal on {{ticker}}'],
    ]);
    expect(maSd.DualMaSdOscillator.alertConditions).toBe(maSd.alertConditions);
  });
  it('fires on the first bar of a new state, also with the signals hidden', () => {
    const r0 = maSd.calculate(bars);
    const sm = values(r0.plots.plot2), up = values(r0.plots.plot0), lo = values(r0.plots.plot1);
    let sq = 0;
    const sqs = sm.map((v, i) => {
      if (gt(v, up[i])) sq = 1;
      if (lt(v, lo[i])) sq = -1;
      return sq;
    });
    const bull = timesWhere(bars, (i) => i > 0 && sqs[i] === 1 && sqs[i - 1] !== 1);
    const bear = timesWhere(bars, (i) => i > 0 && sqs[i] === -1 && sqs[i - 1] !== -1);
    expect(bull.length).toBeGreaterThan(5);
    expect(bear.length).toBeGreaterThan(5);
    for (const showSignals of [true, false]) {
      const r = maSd.calculate(bars, { showSignals });
      expect(r.alerts[0].times).toEqual(bull);
      expect(r.alerts[1].times).toEqual(bear);
    }
  });
});

describe('Dual RSI Smoother: alertconditions and Style ids', () => {
  const bars = walk(1500, 7);
  const r = rsiSm.calculate(bars);
  const a1 = values(r.plots.plot0), a2 = values(r.plots.plot1);
  const hb = (i: number) => (lt(a1[i], 30) && lt(a2[i], 35)) || gt(a2[i] - a1[i], 30);
  const h3 = (i: number) => lt(a2[i], 25) && lt(a1[i], 22);
  const t1 = (i: number) => gt(a1[i], 75) && gt(a1[i] - a2[i], 12);
  const t2 = (i: number) => gt(a1[i], 95);
  it('declares the two conditions of the original', () => {
    expect(decls(rsiSm)).toEqual([
      ['alert0', 'Green Dot Alert', 'Green Dot (Buy) condition triggered'],
      ['alert1', 'Red Dot Alert', 'Red Dot (Sell) condition triggered'],
    ]);
    expect(rsiSm.DualRsiSmoother.alertConditions).toBe(rsiSm.alertConditions);
  });
  it('fires on the bars with a buy / sell dot', () => {
    const green = timesWhere(bars, (i) => hb(i) || h3(i));
    const red = timesWhere(bars, (i) => t1(i) || t2(i));
    expect(green.length).toBeGreaterThan(10);
    expect(red.length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(green);
    expect(r.alerts[1].times).toEqual(red);
  });
  it('each dot carries the id of its plotchar (char0..char3)', () => {
    expect(idTimes(r.markers, 'char0')).toEqual(timesWhere(bars, hb));
    expect(idTimes(r.markers, 'char1')).toEqual(timesWhere(bars, h3));
    expect(idTimes(r.markers, 'char2')).toEqual(timesWhere(bars, t1));
    expect(idTimes(r.markers, 'char3')).toEqual(timesWhere(bars, t2));
    expect(r.markers.every((m) => ['char0', 'char1', 'char2', 'char3'].includes(m.id!))).toBe(true);
  });
});

describe('Dynamic Score PSAR: alertconditions and Style ids', () => {
  const bars = walk(1500, 11);
  const r = psar.calculate(bars);
  const v = values(r.plots.plot0);
  const W = 60;
  const score = v.map((x, i) => {
    let s = 0;
    for (let k = 0; k < W; k++) s += gt(x, i - k - 1 >= 0 ? v[i - k - 1] : NaN) ? 1 : -1;
    return s;
  });
  const long = v.map((x, i) => gt(x, 0) && gt(score[i], 30));
  const short = v.map((x, i) => lt(x, 0) && lt(score[i], -20));
  const bull = crossover(v, 0).map((c, i) => c && long[i]);
  const bear = crossunder(v, 0).map((c, i) => c && short[i]);
  it('declares the five conditions of the original', () => {
    expect(decls(psar)).toEqual([
      ['alert0', 'Bullish Reversal', 'Dynamic Score PSAR crossed above zero line with bullish confirmation'],
      ['alert1', 'Bearish Reversal', 'Dynamic Score PSAR crossed below zero line with bearish confirmation'],
      ['alert2', 'Histogram Turned Bullish', 'Dynamic Score PSAR histogram turned bullish (green)'],
      ['alert3', 'Histogram Turned Bearish', 'Dynamic Score PSAR histogram turned bearish (red)'],
      ['alert4', 'Histogram Turned Neutral', 'Dynamic Score PSAR histogram turned neutral (grey)'],
    ]);
    expect(psar.DynamicScorePsar.alertConditions).toBe(psar.alertConditions);
  });
  it('fires on the signals and the state turns', () => {
    const p = (a: boolean[], i: number) => (i > 0 ? a[i - 1] : false);
    expect(v.every((x, i) => i < 21 || Number.isFinite(x))).toBe(true);
    const want = [
      boolTimes(bars, bull), boolTimes(bars, bear),
      timesWhere(bars, (i) => long[i] && !p(long, i)),
      timesWhere(bars, (i) => short[i] && !p(short, i)),
      timesWhere(bars, (i) => !long[i] && !short[i] && (p(long, i) || p(short, i))),
    ];
    expect(want[0].length).toBeGreaterThan(3);
    expect(want[1].length).toBeGreaterThan(3);
    expect(want[2].length).toBeGreaterThan(10);
    expect(want[4].length).toBeGreaterThan(10);
    r.alerts.forEach((a, k) => expect(a.times).toEqual(want[k]));
  });
  it('the backgrounds carry bgcolor0 / bgcolor1, the bar colours barcolor0', () => {
    expect(idTimes(r.bgColors, 'bgcolor0')).toEqual(boolTimes(bars, bull));
    expect(idTimes(r.bgColors, 'bgcolor1')).toEqual(boolTimes(bars, bear));
    expect(r.bgColors.every((b) => b.id === 'bgcolor0' || b.id === 'bgcolor1')).toBe(true);
    expect(r.barColors.length).toBe(bars.length);
    expect(r.barColors.every((b) => b.id === 'barcolor0')).toBe(true);
  });
});

describe('Dynamic Structure Indicator: alertconditions', () => {
  const bars = walk(1500, 13);
  /** The original's res1 / res2 / sup1 / sup2, written from its Pine code */
  const levels = (list: Bar[], lastOpen: boolean) => {
    const atr = A(ta.atr(list, 14));
    const lookback = 25, maxZone = 2.5, move = 1.0, reset = 25;
    const hb = list.map((b) => (b.open > b.close ? b.open : b.close));
    const lb = list.map((b) => (b.open > b.close ? b.close : b.open));
    const x = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
    let res1 = 0, res2 = 0, sup1 = 0, sup2 = 0, lookR = true, lookS = true;
    let pRes1 = 0, pRes2 = 0, pSup1 = 0, pSup2 = 0, atrSaved = 0, pr1 = 0, pr2 = 0, ps1 = 0, ps2 = 0, supCount = 0, resCount = 0;
    const out: number[][] = [];
    list.forEach((b, i) => {
      const conf = !(lastOpen && i === list.length - 1);
      const win = i >= lookback - 1 ? list.slice(i - lookback + 1, i + 1) : [];
      const hh = win.length ? Math.max(...win.map((w) => w.high)) : NaN;
      const ll = win.length ? Math.min(...win.map((w) => w.low)) : NaN;
      const h1 = i > 0 ? list[i - 1].high : NaN, l1 = i > 0 ? list[i - 1].low : NaN;
      if (h1 === hh && b.high < h1 && lookR) {
        const r2 = x(hb, i - 2) > x(hb, i - 1) ? x(hb, i - 2) : hb[i] > x(hb, i - 1) ? hb[i] : x(hb, i - 1);
        if ((h1 - r2) / atr[i] <= maxZone) { lookR = false; pr1 = h1; pr2 = r2; atrSaved = atr[i]; }
      }
      if (l1 === ll && b.low > l1 && lookS) {
        const s2 = x(lb, i - 2) < x(lb, i - 1) ? x(lb, i - 2) : lb[i] < x(lb, i - 1) ? lb[i] : x(lb, i - 1);
        if ((s2 - l1) / atr[i] <= maxZone) { lookS = false; ps1 = l1; ps2 = s2; atrSaved = atr[i]; }
      }
      if (b.close > pr1 && conf) { pr1 = NaN; pr2 = NaN; }
      if (b.close < ps1 && conf) { ps1 = NaN; ps2 = NaN; }
      if (pr1 - b.low >= atrSaved * move) {
        if (isNaN(pRes1)) pRes1 = pr1;
        if (isNaN(pRes2)) pRes2 = pr2;
        res1 = pr1; res2 = pr2; pr1 = NaN; pr2 = NaN;
      }
      if (b.high - ps1 >= atrSaved * move) {
        if (isNaN(pSup1)) pSup1 = ps1;
        if (isNaN(pSup2)) pSup2 = ps2;
        sup1 = ps1; sup2 = ps2; ps1 = NaN; ps2 = NaN;
      }
      if (b.close >= res1 && conf) { lookR = true; lookS = true; resCount++; }
      if (b.close <= sup1 && conf) { lookS = true; lookR = true; supCount++; }
      if ((b.close > res1 && isNaN(pRes1) && conf) || pRes1 === 0 || supCount >= reset) { pRes1 = res1; pRes2 = res2; supCount = 0; }
      if ((b.close < sup1 && isNaN(pSup1) && conf) || pSup1 === 0 || resCount >= reset) { pSup1 = sup1; pSup2 = sup2; resCount = 0; }
      if (b.close < pRes2 && conf) { pRes1 = NaN; pRes2 = NaN; }
      if (b.close > pSup2 && conf) { pSup1 = NaN; pSup2 = NaN; }
      out.push([res1, res2, sup1, sup2]);
    });
    return out;
  };
  const expected = (list: Bar[], lastOpen: boolean) => {
    const lv = levels(list, lastOpen);
    const rA = list.map((b, i) => b.high >= lv[i][1]);
    const sA = list.map((b, i) => b.low <= lv[i][3]);
    const rB = list.map((b, i) => b.close >= lv[i][0]);
    const sB = list.map((b, i) => b.close <= lv[i][2]);
    return [list.map((_, i) => rA[i] || sA[i] || rB[i] || sB[i]), rA, sA, rB, sB].map((f) => boolTimes(list, f));
  };
  it('declares the five conditions of the original', () => {
    expect(decls(dsi)).toEqual([
      ['alert0', '[DSI] Alert!', 'DSI alert for {{ticker}}'],
      ['alert1', '[DSI] Resistance Alert', 'Price has entered current potential resistance zone for {{ticker}}'],
      ['alert2', '[DSI] Support Alert', 'Price has entered current potential support zone for {{ticker}}'],
      ['alert3', '[DSI] Resistance Breakout', 'Price has broken past potential resistance zone for {{ticker}}'],
      ['alert4', '[DSI] Support Breakout', 'Price has broken past potential support zone for {{ticker}}'],
    ]);
    expect(dsi.DynamicStructureIndicator.alertConditions).toBe(dsi.alertConditions);
  });
  it("fires on the bars of the original's zone rules", () => {
    const want = expected(bars, false);
    // zones are found and the conditions change over the history (not only the 0 start levels)
    expect(new Set(levels(bars, false).map((l) => l[0])).size).toBeGreaterThan(10);
    for (const k of [1, 2, 3, 4]) {
      expect(want[k].length).toBeGreaterThan(20);
      expect(want[k].length).toBeLessThan(bars.length - 20);
    }
    const r = dsi.calculate(bars);
    r.alerts.forEach((a, k) => expect(a.times).toEqual(want[k]));
  });
  it('an open last bar is not confirmed', () => {
    for (const cut of [700, 901, 1100, 1350]) {
      const list = bars.slice(0, cut);
      const r = dsi.calculate(list, {}, { lastBarConfirmed: false } as ChartContext);
      const want = expected(list, true);
      r.alerts.forEach((a, k) => expect(a.times).toEqual(want[k]));
    }
  });
});

describe('Dynamic Supply and Demand Zones: alertcondition', () => {
  const bars = walk(900, 17);
  it('declares the condition of the original (default message)', () => {
    expect(decls(sdz)).toEqual([['alert0', 'New Pivot Detected!', 'Alert Fired!']]);
    expect(sdz.DynamicSupplyAndDemandZones.alertConditions).toBe(sdz.alertConditions);
  });
  it('fires on the bars that confirm a pivot high or low', () => {
    const plen = 20;
    const hi = bars.map((b) => b.high), lo = bars.map((b) => b.low);
    // a pivot high: the bar plen back is above the plen bars on each side (pivot low: below)
    const piv = (i: number, a: number[], sign: number) => {
      const c = i - plen;
      if (c - plen < 0) return false;
      for (let k = c - plen; k <= i; k++) if (k !== c && sign * (a[k] - a[c]) >= 0) return false;
      return true;
    };
    const want = timesWhere(bars, (i) => piv(i, hi, 1) || piv(i, lo, -1));
    expect(want.length).toBeGreaterThan(10);
    const r = sdz.calculate(bars, { plen });
    expect(r.alerts[0].times).toEqual(want);
  });
});

describe('Dynamic Support & Resistance: palette issues left as they are', () => {
  it('the EMA 200 plots draw only the colours of the original and na', () => {
    const r = dsr.calculate(walk(1200, 19));
    const uniq = (a: unknown[]) => [...new Set(a)];
    expect(uniq(r.plots.plot2.map((p: any) => p.color)).sort()).toEqual(['#F23645', 'transparent'].sort());
    expect(uniq(r.plots.plot3.map((p: any) => p.color)).sort()).toEqual(['#4CAF50', 'transparent'].sort());
  });
});

describe('Dynamic Trend Channel: alertconditions', () => {
  const bars = walk(1500, 23);
  it('declares the two conditions of the original', () => {
    expect(decls(dtc)).toEqual([
      ['alert0', 'Buy Alert', 'Dynamic Trend Channel Buy'],
      ['alert1', 'Sell Alert', 'Dynamic Trend Channel Sell'],
    ]);
    expect(dtc.DynamicTrendChannel.alertConditions).toBe(dtc.alertConditions);
  });
  it('fires on the close crossing the bands', () => {
    const close = bars.map((b) => b.close);
    const basis = A(ta.ema(S(bars, close), 30));
    const atr = A(ta.atr(bars, 14));
    const buy = boolTimes(bars, crossover(close, basis.map((b, i) => b + atr[i] * 1.5)));
    const sell = boolTimes(bars, crossunder(close, basis.map((b, i) => b - atr[i] * 1.5)));
    expect(buy.length).toBeGreaterThan(5);
    expect(sell.length).toBeGreaterThan(5);
    const r = dtc.calculate(bars);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
  });
});

describe('Dynamic Volatility Filter: alertconditions', () => {
  const bars = walk(1500, 29);
  it('declares the three conditions of the original', () => {
    expect(decls(dvf)).toEqual([
      ['alert0', 'Bullish Trend Signal', 'Dynamic Volatility Filter: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert1', 'Bearish Trend Signal', 'Dynamic Volatility Filter: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['alert2', 'Any Trend Change', 'Dynamic Volatility Filter: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}'],
    ]);
    expect(dvf.DynamicVolatilityFilter.alertConditions).toBe(dvf.alertConditions);
  });
  it('fires when the trend of the line turns', () => {
    for (const showNeutral of [false, true]) {
      const r = dvf.calculate(bars, { showNeutral });
      const line = values(r.plots.plot0);
      let dir = 0;
      const dirs = line.map((v, i) => {
        const p = i > 0 ? line[i - 1] : NaN;
        dir = gt(v, p) ? 1 : gt(p, v) ? -1 : showNeutral ? 0 : dir;
        return dir;
      });
      const bull = timesWhere(bars, (i) => i > 0 && dirs[i] === 1 && dirs[i - 1] !== 1);
      const bear = timesWhere(bars, (i) => i > 0 && dirs[i] === -1 && dirs[i - 1] !== -1);
      expect(bull.length).toBeGreaterThan(5);
      expect(bear.length).toBeGreaterThan(5);
      expect(r.alerts[0].times).toEqual(bull);
      expect(r.alerts[1].times).toEqual(bear);
      expect(r.alerts[2].times).toEqual([...bull, ...bear].sort((a, b) => a - b));
    }
  });
});

describe('Dynamic Volume Clusters: Style ids', () => {
  const bars = walk(1500, 31);
  it('the retest triangles carry shape0..shape3 (tiny and UI-only copies)', () => {
    const r = dvc.calculate(bars, { len: 100 });
    const down = r.markers.filter((m) => m.shape === 'triangleDown');
    const up = r.markers.filter((m) => m.shape === 'triangleUp');
    expect(down.length).toBeGreaterThan(2);
    expect(up.length).toBeGreaterThan(2);
    expect(r.markers.every((m) => ['shape0', 'shape1', 'shape2', 'shape3'].includes(m.id!))).toBe(true);
    const tiny = (list: typeof down) => list.filter((m) => m.size === 'tiny').map((m) => m.time);
    const normal = (list: typeof down) => list.filter((m) => m.size === 'normal').map((m) => m.time);
    expect(idTimes(r.markers, 'shape0')).toEqual(tiny(down));
    expect(idTimes(r.markers, 'shape2')).toEqual(normal(down));
    expect(idTimes(r.markers, 'shape1')).toEqual(tiny(up));
    expect(idTimes(r.markers, 'shape3')).toEqual(normal(up));
    expect(idTimes(r.markers, 'shape0')).toEqual(idTimes(r.markers, 'shape2'));
  });
});

describe('Dynamic VWAP: Fair Value & Divergence Suite: alertconditions', () => {
  // with a few one-bar spikes (low volume) for the deviation failures
  const bars = walk(1500, 37).map((b, i) => (i % 150 === 75
    ? { ...b, close: b.close + 30, high: Math.max(b.high, b.close + 30), volume: 1e5 } : b));
  it('declares the three conditions of the original', () => {
    expect(decls(vwap)).toEqual([
      ['alert0', 'VWAP Slope Divergence', 'VWAP slope divergence detected.'],
      ['alert1', 'Low Volume Retest', 'Price crossed VWAP on low volume.'],
      ['alert2', 'Deviation Failure', 'Deviation failure detected (mean reversion signal).'],
    ]);
    expect(vwap.DynamicVwapFairValueDivergenceSuite.alertConditions).toBe(vwap.alertConditions);
  });
  it('fires on the divergence, retest and failure bars, also with detection off', () => {
    const r0 = vwap.calculate(bars);
    const vw = values(r0.plots.plot0), u1 = values(r0.plots.plot1), u3 = values(r0.plots.plot4);
    const close = bars.map((b) => b.close), high = bars.map((b) => b.high), vol = bars.map((b) => b.volume as number);
    const L = 20;
    const now = A(ta.linreg(S(bars, vw), L, 0));
    const prev = A(ta.linreg(S(bars, vw.map((_, i) => (i >= L ? vw[i - L] : NaN))), L, 0));
    const slope = now.map((v, i) => (v - prev[i]) / L);
    const hh = A(ta.highest(S(bars, high), L));
    const volMA = A(ta.sma(S(bars, vol), 20));
    const cross = crossover(close, vw);
    const want = [
      timesWhere(bars, (i) => i > 0 && gt(high[i], hh[i - 1]) && lt(slope[i], slope[i - 1])),
      timesWhere(bars, (i) => cross[i] && lt(vol[i], volMA[i])),
      timesWhere(bars, (i) => i > 0 && gt(close[i - 1], u3[i - 1]) && lt(close[i], u1[i])),
    ];
    expect(want[0].length).toBeGreaterThan(5);
    expect(want[1].length).toBeGreaterThan(2);
    expect(want[2].length).toBeGreaterThan(0);
    for (const detect of [true, false]) {
      const r = vwap.calculate(bars, { detect });
      r.alerts.forEach((a, k) => expect(a.times).toEqual(want[k]));
    }
  });
});

describe('Early Pivot Alert v1a: alertconditions', () => {
  const bars = walk(1500, 41);
  /** The original's signals (Percent method, defaults), written from its Pine code */
  const expected = (list: Bar[], lastOpen: boolean) => {
    let dir = 0, lastHigh = NaN, lastLow = NaN, lastSig = NaN;
    const nz = (x: number, y: number) => (isNaN(x) ? y : x);
    const th = (ref: number) => ref * (0.5 / 100);
    const up: boolean[] = [], down: boolean[] = [];
    list.forEach((b, i) => {
      if (i === 0) { dir = ge(b.close, b.open) ? 1 : -1; lastHigh = b.high; lastLow = b.low; }
      if (dir >= 0) { if (gt(b.high, nz(lastHigh, b.high))) lastHigh = b.high; } else if (lt(b.low, nz(lastLow, b.low))) lastLow = b.low;
      const tUp = dir <= 0 && ge(b.close, nz(lastLow, b.low) + th(nz(lastLow, b.low)));
      const tDown = dir >= 0 && le(b.close, nz(lastHigh, b.high) - th(nz(lastHigh, b.high)));
      const gap = isNaN(lastSig) || i - lastSig >= 3;
      const conf = !(lastOpen && i === list.length - 1);
      const l = conf && gap && tUp, s = conf && gap && tDown;
      if (l) { dir = 1; lastHigh = b.high; lastSig = i; }
      if (s) { dir = -1; lastLow = b.low; lastSig = i; }
      up.push(l); down.push(s);
    });
    return [boolTimes(list, up), boolTimes(list, down)];
  };
  it('declares the two conditions of the original', () => {
    expect(decls(epa)).toEqual([
      ['alert0', 'Early Pivot UP', '[{ticker}] Early Pivot UP: koers draaide +drempel tegen downtrend in.'],
      ['alert1', 'Early Pivot DOWN', '[{ticker}] Early Pivot DOWN: koers draaide -drempel tegen uptrend in.'],
    ]);
    expect(epa.EarlyPivotAlertV1a.alertConditions).toBe(epa.alertConditions);
  });
  it('fires on the UP / DOWN signals, also with the arrows hidden', () => {
    const want = expected(bars, false);
    expect(want[0].length).toBeGreaterThan(20);
    expect(want[1].length).toBeGreaterThan(20);
    for (const showArrows of [true, false]) {
      const r = epa.calculate(bars, { showArrows });
      expect(r.alerts[0].times).toEqual(want[0]);
      expect(r.alerts[1].times).toEqual(want[1]);
    }
  });
  it('an open last bar gives no signal with "signals on bar close"', () => {
    const k = bars.findIndex((b) => b.time === expected(bars, false)[0][10]);
    const list = bars.slice(0, k + 1);
    expect(epa.calculate(list).alerts[0].triggered).toBe(true);
    const open = epa.calculate(list, {}, { lastBarConfirmed: false } as ChartContext);
    expect(open.alerts[0].triggered).toBe(false);
    expect(open.alerts.map((a) => a.times)).toEqual(expected(list, true));
  });
});

describe('Edward Smart Channel Reversal: alertconditions', () => {
  // a walk, then crafted swings: a long rise and a sharp drop ending on a green bar at a new low (above the EMA, low
  // RSI), and the mirror (a red bar at a new high after a fall and a sharp rally)
  const bars = ((): Bar[] => {
    const out = walk(600, 43);
    let p = out[out.length - 1].close;
    const push = (o: number, c: number, lo?: number, hi?: number) => {
      out.push({ time: (out[out.length - 1].time as number) + 86400, open: o, close: c,
        high: hi ?? Math.max(o, c) + 0.3, low: lo ?? Math.min(o, c) - 0.3, volume: 1e6 });
      p = c;
    };
    for (let rep = 0; rep < 2; rep++) {
      for (let k = 0; k < 150; k++) push(p, p + 1);
      for (let k = 0; k < 10; k++) push(p, p - 3);
      push(p - 1, p + 1, p - 6);
      for (let k = 0; k < 10; k++) push(p, p + 0.2);
      for (let k = 0; k < 150; k++) push(p, Math.max(20, p - 1));
      for (let k = 0; k < 10; k++) push(p, p + 3);
      push(p + 1, p - 1, undefined, p + 6);
      for (let k = 0; k < 10; k++) push(p, p - 0.2);
    }
    return out;
  })();
  it('declares the two conditions of the original', () => {
    expect(decls(edward)).toEqual([
      ['alert0', 'Buy Alert', 'Edward Smart Channel Reversal BUY'],
      ['alert1', 'Sell Alert', 'Edward Smart Channel Reversal SELL'],
    ]);
    expect(edward.EdwardSmartChannelReversal.alertConditions).toBe(edward.alertConditions);
  });
  it('fires on the BUY / SELL bars', () => {
    const r = edward.calculate(bars);
    const up = values(r.plots.plot0), lo = values(r.plots.plot1), ema = values(r.plots.plot3);
    const rsi = A(ta.rsi(S(bars, bars.map((b) => b.close)), 14));
    const buy = timesWhere(bars, (i) => {
      const b = bars[i];
      return le(b.low, lo[i]) && gt(b.close, b.open) && gt(b.close, lo[i]) && lt(rsi[i], 40) && gt(b.close, ema[i]);
    });
    const sell = timesWhere(bars, (i) => {
      const b = bars[i];
      return ge(b.high, up[i]) && lt(b.close, b.open) && lt(b.close, up[i]) && gt(rsi[i], 60) && lt(b.close, ema[i]);
    });
    expect(buy.length).toBeGreaterThan(1);
    expect(sell.length).toBeGreaterThan(1);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
  });
});

describe('Ehlers Adaptive Trend Indicator: alertconditions', () => {
  const bars = walk(1500, 47);
  it('declares the two conditions of the original', () => {
    expect(decls(eati)).toEqual([
      ['alert0', 'Buy Signal', 'Buy Signal triggered'],
      ['alert1', 'Sell Signal', 'Sell Signal triggered'],
    ]);
    expect(eati.EhlersAdaptiveTrendIndicator.alertConditions).toBe(eati.alertConditions);
  });
  it('is true on every bar of an up / down trend', () => {
    const r = eati.calculate(bars);
    const basis = values(r.plots.plot0);
    const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
    const sv = A(ta.ema(ta.stdev(S(bars, hlc3), 30), 10));
    let trend = 0, level = NaN;
    const trends = bars.map((b, i) => {
      const upper = basis[i] + sv[i], lower = basis[i] - sv[i];
      if (isNaN(level)) { trend = ge(b.close, basis[i]) ? 1 : -1; level = basis[i]; }
      else if (trend === 1 && lt(b.close, lower)) { trend = -1; level = lower; }
      else if (trend === -1 && gt(b.close, upper)) { trend = 1; level = upper; }
      else level = trend === 1 ? Math.max(level, lower) : Math.min(level, upper);
      return trend;
    });
    const buy = timesWhere(bars, (i) => trends[i] === 1);
    const sell = timesWhere(bars, (i) => trends[i] === -1);
    expect(buy.length).toBeGreaterThan(100);
    expect(sell.length).toBeGreaterThan(100);
    expect(buy.length + sell.length).toBe(bars.length);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
  });
});

describe('Ehlers Instantaneous Trend: fills', () => {
  it("gives the original's UpTrend / DownTrend fills between the trigger and the trend", () => {
    const bars = walk(1000, 53);
    const r = eit.calculate(bars);
    expect(r.fills!.map((f: any) => [f.plot1, f.plot2, f.options.title])).toEqual([
      ['plot0', 'plot1', 'UpTrend'], ['plot0', 'plot1', 'DownTrend'],
    ]);
    const [up, down] = r.fills!.map((f: any) => f.colors as string[]);
    const lag = values(r.plots.plot0), itv = values(r.plots.plot1);
    let ups = 0;
    bars.forEach((_, i) => {
      if (isNaN(lag[i])) return expect([up[i], down[i]]).toEqual(['transparent', 'transparent']);
      expect(up[i] !== 'transparent').toBe(lag[i] > itv[i]);
      expect(down[i] !== 'transparent').toBe(!(lag[i] > itv[i]));
      if (lag[i] > itv[i]) ups++;
    });
    expect(ups).toBeGreaterThan(100);
    expect(ups).toBeLessThan(900);
  });
});
