/**
 * Alerts and Style ids of 16 community ports (batch 13): the alertcondition() declarations (ids, titles and messages
 * of the originals), the bars on which each condition is true (re-computed here from the original's expression), the
 * alert() calls (bars, messages, frequency), and the Style-settings ids on the emitted markers.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as vfi from '../../src/community/enhanced-vfi-buyer-seller-pressure';
import * as vsa from '../../src/community/enhanced-vsa-volume-candle-colors-with-ma-selection';
import * as bands from '../../src/community/entry-tp-sl-alert-bands';
import * as envRsi from '../../src/community/envelope-rsi';
import * as rci from '../../src/community/equalhigh-japanese-triple-rci';
import * as fvgLux from '../../src/community/fair-value-gap-luxalgo';
import * as fvgFlux from '../../src/community/fair-value-gaps-flux-charts';
import * as falseBo from '../../src/community/false-breakout';
import * as faraz from '../../src/community/faraz-perfect-structure-scalper-long-short';
import * as fastlane from '../../src/community/fastlane';
import * as fibExt from '../../src/community/fibonacci-extension-retracement-pivot-points';
import * as fibMa from '../../src/community/fibonacci-moving-averages';
import * as fibRanges from '../../src/community/fibonacci-ranges';
import * as fse from '../../src/community/fibonacci-structure-engine';
import * as fwma from '../../src/community/fibonacci-weighted-moving-average';
import * as fisher from '../../src/community/fisher-mpz';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** Seeded random walk of bars (`step` seconds apart) with a random volume */
function walk(count: number, seed0: number, step = 86400, scale = 1, base = 100): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = base;
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
const crossover = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v > (typeof b === 'number' ? b : b[i]) && a[i - 1] <= (typeof b === 'number' ? b : b[i - 1]));
const crossunder = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v < (typeof b === 'number' ? b : b[i]) && a[i - 1] >= (typeof b === 'number' ? b : b[i - 1]));
const idTimes = (markers: { id?: string; time: number }[], id: string) => markers.filter((m) => m.id === id).map((m) => m.time);
const boolTimes = (list: Bar[], flags: boolean[]) => timesWhere(list, (i) => flags[i]);
const sma = (a: number[], len: number) => a.map((_v, i) => {
  if (i < len - 1) return NaN;
  let s = 0;
  for (let k = 0; k < len; k++) s += a[i - k];
  return s / len;
});
const highest = (a: number[], len: number) => a.map((_v, i) => (i < len - 1 ? NaN : Math.max(...a.slice(i - len + 1, i + 1))));
const lowest = (a: number[], len: number) => a.map((_v, i) => (i < len - 1 ? NaN : Math.min(...a.slice(i - len + 1, i + 1))));
/** Pine ta.rma of a series that starts with na (seeded with the SMA of its first `len` values) */
function rma(a: number[], len: number): number[] {
  const out = new Array<number>(a.length).fill(NaN);
  let count = 0;
  let sum = 0;
  let prev = NaN;
  for (let i = 0; i < a.length; i++) {
    if (isNaN(a[i])) continue;
    if (isNaN(prev)) {
      sum += a[i];
      count += 1;
      if (count === len) prev = sum / len;
      else continue;
    } else {
      prev = (prev * (len - 1) + a[i]) / len;
    }
    out[i] = prev;
  }
  return out;
}

describe('Enhanced VFI Buyer/Seller Pressure', () => {
  const bars = walk(1200, 11);
  const r = vfi.calculate(bars);
  it('declares the five conditions of the original', () => {
    expect(decls(vfi)).toEqual([
      ['alert0', 'VFI Crossover', 'VFI has crossed above the EMA.'],
      ['alert1', 'VFI Crossunder', 'VFI has crossed below the EMA.'],
      ['alert2', 'Strong Buying Pressure', 'Buyer pressure exceeds the threshold.'],
      ['alert3', 'Strong Selling Pressure', 'Seller pressure exceeds the threshold.'],
      ['alert4', 'Neutral Zone', 'Buyer and seller pressures are in the neutral range.'],
    ]);
    expect(vfi.EnhancedVfiBuyerSellerPressure.alertConditions).toBe(vfi.alertConditions);
  });
  it('fires on the VFI / EMA crosses and on the pressure states', () => {
    const v = values(r.plots.plot2);
    const e = values(r.plots.plot3);
    const up = boolTimes(bars, crossover(v, e));
    const down = boolTimes(bars, crossunder(v, e));
    expect(up.length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(down);
    const bp = bars.map((b) => (b.close - b.open) / (b.high - b.low));
    const sp = bars.map((b) => (b.open - b.close) / (b.high - b.low));
    const buy = timesWhere(bars, (i) => gt(bp[i], 0.75));
    expect(buy.length).toBeGreaterThan(5);
    expect(r.alerts[2].times).toEqual(buy);
    expect(r.alerts[3].times).toEqual(timesWhere(bars, (i) => gt(sp[i], 0.75)));
    expect(r.alerts[4].times).toEqual(timesWhere(bars, (i) => !ge(bp[i], 0.75) && !ge(sp[i], 0.75)));
  });
  it('the cross circles carry shape0 (crossover) / shape1 (crossunder)', () => {
    expect(idTimes(r.markers, 'shape0')).toEqual(r.alerts[0].times);
    expect(idTimes(r.markers, 'shape1')).toEqual(r.alerts[1].times);
    expect(r.markers.every((m) => m.id === 'shape0' || m.id === 'shape1')).toBe(true);
  });
});

describe('Enhanced VSA Volume & Candle Colors', () => {
  const bars = walk(1200, 5);
  const len = 50;
  const r = vsa.calculate(bars, { length: len, highMult: 1.2 });
  it('declares the three conditions of the original', () => {
    expect(decls(vsa)).toEqual([
      ['alert0', 'Extreme Volume', 'Extreme volume spike detected!'],
      ['alert1', 'High Volume', 'High volume detected.'],
      ['alert2', 'Low Volume', 'Low volume detected.'],
    ]);
    expect(vsa.EnhancedVsaVolumeCandleColorsWithMaSelection.alertConditions).toBe(vsa.alertConditions);
  });
  it('fires on the extreme / high / low volume bars', () => {
    const vol = bars.map((b) => b.volume as number);
    const ma = sma(vol, len);
    // ta.percentile_nearest_rank(volume, length, 90)
    const pct = vol.map((_v, i) => {
      if (i < len - 1) return NaN;
      const w = vol.slice(i - len + 1, i + 1).sort((a, b) => a - b);
      return w[Math.ceil((90 / 100) * len) - 1];
    });
    const extreme = vol.map((v, i) => gt(v, pct[i]));
    const ext = boolTimes(bars, extreme);
    const high = timesWhere(bars, (i) => gt(vol[i], ma[i] * 1.2) && !extreme[i]);
    const low = timesWhere(bars, (i) => lt(vol[i], ma[i] * 0.5));
    expect(ext.length).toBeGreaterThan(20);
    expect(high.length).toBeGreaterThan(5);
    expect(low.length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(ext);
    expect(r.alerts[1].times).toEqual(high);
    expect(r.alerts[2].times).toEqual(low);
  });
});

describe('Entry / TP / SL Alert Bands', () => {
  const bars = walk(1200, 9);
  it('declares the three conditions of the original', () => {
    expect(decls(bands)).toEqual([
      ['alert0', 'Upper Alert Crossed', 'Price crossed ABOVE the upper alert band.'],
      ['alert1', 'Lower Alert Crossed', 'Price crossed BELOW the lower alert band.'],
      ['alert2', 'Any Alert Crossed', 'Price crossed an alert band (upper or lower).'],
    ]);
    expect(bands.EntryTpSlAlertBands.alertConditions).toBe(bands.alertConditions);
  });
  it('fires when the close crosses the bands (long and short)', () => {
    const close = bars.map((b) => b.close);
    // Long: upper = 100 + 10 * 50% = 105, lower = 100 - 10 * 50% = 95
    const r = bands.calculate(bars, { entry: 100, takeProfit: 110, stopLoss: 90 });
    const up = boolTimes(bars, crossover(close, 105));
    const down = boolTimes(bars, crossunder(close, 95));
    expect(up.length).toBeGreaterThan(3);
    expect(down.length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(down);
    expect(r.alerts[2].times).toEqual([...up, ...down].sort((a, b) => a - b));
    // Short: upper = 100 - 10 * 50% = 95, lower = 100 + 10 * 50% = 105
    const s = bands.calculate(bars, { entry: 100, takeProfit: 90, stopLoss: 110, dir: 'Short' });
    expect(s.alerts[0].times).toEqual(boolTimes(bars, crossover(close, 95)));
    expect(s.alerts[1].times).toEqual(boolTimes(bars, crossunder(close, 105)));
    // a band with a distance that is not positive is na: no cross
    const bad = bands.calculate(bars, { entry: 100, takeProfit: 90, stopLoss: 90 });
    expect(bad.alerts[0].times).toEqual([]);
  });
});

describe('Envelope RSI', () => {
  const bars = walk(1500, 21);
  it('declares the two conditions of the original', () => {
    expect(decls(envRsi)).toEqual([
      ['alert0', 'Envelope RSI Buy signal!', 'Buy signal'],
      ['alert1', 'Envelope RSI Sell signal!', 'Sell signal'],
    ]);
    expect(envRsi.EnvelopeRSI.alertConditions).toBe(envRsi.alertConditions);
  });
  it('fires on cross_buy and condition_buy / cross_sell and condition_sell', () => {
    const r = envRsi.calculate(bars);
    const hl2 = bars.map((b) => (b.high + b.low) / 2);
    const basis = sma(hl2, 8);
    const upper = basis.map((v) => v * (1 + 0.22 / 100));
    const lower = basis.map((v) => v * (1 - 0.22 / 100));
    const ch = hl2.map((v, i) => (i > 0 ? v - hl2[i - 1] : NaN));
    const up = rma(ch.map((c) => (isNaN(c) ? NaN : Math.max(c, 0))), 8);
    const dn = rma(ch.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0))), 8);
    const rsi = up.map((u, i) => (dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / dn[i])));
    const close = bars.map((b) => b.close);
    const cross = (a: number[], b: number[]) => a.map((_v, i) => crossover(a, b)[i] || crossunder(a, b)[i]);
    const series = (k: 'open' | 'high' | 'low' | 'close') => bars.map((b) => b[k]);
    const anyCross = (lvl: number[]) => {
      const c = (['low', 'close', 'high', 'open'] as const).map((k) => cross(series(k), lvl));
      return bars.map((_b, i) => c.some((x) => x[i]));
    };
    const crossLower = anyCross(lower);
    const crossUpper = anyCross(upper);
    const buy = timesWhere(bars, (i) => crossover(close, lower)[i] && rsi[i] < 25 && crossLower[i]);
    const sell = timesWhere(bars, (i) => crossunder(close, upper)[i] && rsi[i] > 80 && crossUpper[i]);
    expect(buy.length + sell.length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
  });
});

describe('Equalhigh JAPANESE TRIPLE RCI', () => {
  const bars = walk(900, 13);
  const close = bars.map((b) => b.close);
  const rciOf = (len: number) => close.map((_v, b) => {
    if (b < len - 1) return NaN;
    const at = (k: number) => close[b - k];
    const mean = (len + 1) / 2;
    let cov = 0;
    let tv = 0;
    let pv = 0;
    for (let i = 0; i < len; i++) {
      let rank = 1;
      let ties = 0;
      for (let j = 0; j < len; j++) {
        if (at(j) < at(i)) rank += 1;
        else if (at(j) === at(i) && j !== i) ties += 1;
      }
      rank += ties / 2;
      const td = len - i - mean;
      const pd = rank - mean;
      cov += td * pd;
      tv += td * td;
      pv += pd * pd;
    }
    const d = Math.sqrt(tv * pv);
    return d > 0 ? (100 * cov) / d : 0;
  });
  const s = rciOf(9);
  const m = rciOf(26);
  const l = rciOf(52);
  const expected = (lastOpen: boolean) => {
    const conf = (i: number) => !(lastOpen && i === bars.length - 1);
    const bull = s.map((v, i) => gt(v, 0) && gt(m[i], 0) && gt(l[i], 0));
    const bear = s.map((v, i) => lt(v, 0) && lt(m[i], 0) && lt(l[i], 0));
    return [
      timesWhere(bars, (i) => conf(i) && crossover(s, -80)[i] && gt(m[i], m[i - 1])),
      timesWhere(bars, (i) => conf(i) && crossunder(s, 80)[i] && lt(m[i], m[i - 1])),
      timesWhere(bars, (i) => conf(i) && bull[i] && !(i > 0 && bull[i - 1])),
      timesWhere(bars, (i) => conf(i) && bear[i] && !(i > 0 && bear[i - 1])),
    ];
  };
  it('declares the four conditions of the original (placeholders kept)', () => {
    expect(decls(rci)).toEqual([
      ['alert0', 'RCI — retournement haussier précoce', 'RCI 9 quitte la zone basse et RCI 26 remonte sur {{ticker}} ({{interval}}).'],
      ['alert1', 'RCI — retournement baissier précoce', 'RCI 9 quitte la zone haute et RCI 26 baisse sur {{ticker}} ({{interval}}).'],
      ['alert2', 'RCI — nouvel alignement haussier', 'Les RCI 9/26/52 passent en alignement haussier sur {{ticker}} ({{interval}}).'],
      ['alert3', 'RCI — nouvel alignement baissier', 'Les RCI 9/26/52 passent en alignement baissier sur {{ticker}} ({{interval}}).'],
    ]);
    expect(rci.EqualhighJapaneseTripleRci.alertConditions).toBe(rci.alertConditions);
  });
  it('fires on the reversals and the new alignments, also with hidden markers', () => {
    const exp = expected(false);
    for (const e of exp) expect(e.length).toBeGreaterThan(3);
    for (const opts of [{}, { showReversals: false, showAlignments: false }]) {
      const r = rci.calculate(bars, opts);
      for (let k = 0; k < 4; k++) expect(r.alerts[k].times, `alert${k}`).toEqual(exp[k]);
    }
  });
  it('an open last bar gives no signal with "confirm at close"', () => {
    const r = rci.calculate(bars, {}, { lastBarConfirmed: false } as ChartContext);
    const exp = expected(true);
    for (let k = 0; k < 4; k++) expect(r.alerts[k].times).toEqual(exp[k]);
  });
});

describe('Fair Value Gap [LuxAlgo]', () => {
  const bars = walk(1500, 17);
  it('declares the four conditions of the original', () => {
    expect(decls(fvgLux)).toEqual([
      ['alert0', 'Bullish FVG', 'Bullish FVG detected'],
      ['alert1', 'Bearish FVG', 'Bearish FVG detected'],
      ['alert2', 'Bullish FVG Mitigation', 'Bullish FVG mitigated'],
      ['alert3', 'Bearish FVG Mitigation', 'Bearish FVG mitigated'],
    ]);
    expect(fvgLux.FairValueGapLuxalgo.alertConditions).toBe(fvgLux.alertConditions);
  });
  it('fires on new gaps and on mitigated gaps', () => {
    const recs: { bull: boolean; min: number; max: number }[] = [];
    const flags: boolean[][] = [[], [], [], []];
    bars.forEach((b, i) => {
      const h2 = i >= 2 ? bars[i - 2].high : NaN;
      const l2 = i >= 2 ? bars[i - 2].low : NaN;
      const c1 = i >= 1 ? bars[i - 1].close : NaN;
      const bull = gt(b.low, h2) && gt(c1, h2) && gt((b.low - h2) / h2, 0);
      const bear = lt(b.high, l2) && lt(c1, l2) && gt((l2 - b.high) / b.high, 0);
      if (bull) recs.push({ bull: true, min: h2, max: b.low });
      else if (bear) recs.push({ bull: false, min: b.high, max: l2 });
      let bm = 0;
      let sm = 0;
      for (let k = recs.length - 1; k >= 0; k--) {
        const g = recs[k];
        if (g.bull ? lt(b.close, g.min) : gt(b.close, g.max)) {
          if (g.bull) bm++;
          else sm++;
          recs.splice(k, 1);
        }
      }
      [bull, bear && !bull, bm > 0, sm > 0].forEach((f, k) => flags[k].push(f));
    });
    const r = fvgLux.calculate(bars);
    for (let k = 0; k < 4; k++) {
      expect(flags[k].filter(Boolean).length, `alert${k}`).toBeGreaterThan(5);
      expect(r.alerts[k].times, `alert${k}`).toEqual(boolTimes(bars, flags[k]));
    }
  });
});

describe('Volumized Fair Value Gaps | Flux Charts', () => {
  const bars = walk(400, 23);
  // no size / bar-type / gap filter: a zone is added on every three-bar gap
  const open = { fvgSensEnabled: false, fvgBars: 'All' as const, allowGaps: true };
  const gapAt = (i: number) => i >= 2 && ((gt(bars[i].low, bars[i - 2].high) && gt(bars[i - 1].close, bars[i - 2].high))
    || (lt(bars[i].high, bars[i - 2].low) && lt(bars[i - 1].close, bars[i - 2].low)));
  it('declares the condition of the original', () => {
    expect(decls(fvgFlux)).toEqual([['alert0', 'New FVG @ {{ticker}}', '']]);
    expect(fvgFlux.FairValueGapsFluxCharts.alertConditions).toBe(fvgFlux.alertConditions);
  });
  it('is true on the last bar when a zone was added on the bar before', () => {
    let hits = 0;
    let misses = 0;
    for (let m = 3; m <= bars.length; m += 1) {
      const cut = bars.slice(0, m);
      const r = fvgFlux.calculate(cut, open);
      const want = gapAt(m - 2);
      expect(r.alerts[0].times).toEqual(want ? [cut[m - 1].time] : []);
      expect(r.alerts[0].triggered).toBe(want);
      if (want) hits++;
      else misses++;
    }
    expect(hits).toBeGreaterThan(10);
    expect(misses).toBeGreaterThan(10);
  });
  it('never fires before the last bar (default inputs)', () => {
    const r = fvgFlux.calculate(walk(1200, 3));
    expect(r.alerts[0].times.length).toBeLessThanOrEqual(1);
  });
});

describe('False Breakout (Expo)', () => {
  const bars = walk(1500, 29);
  /** The original's count / val / index logic, bar by bar */
  function expected(prd = 20, minperiod = 5, maxperiod = 5) {
    const hi = highest(bars.map((b) => b.high), prd);
    const lo = lowest(bars.map((b) => b.low), prd);
    let val = NaN;
    let prevVal = NaN;
    let count = 0;
    const index = [0, 0];
    const up: boolean[] = [];
    const down: boolean[] = [];
    bars.forEach((b, n) => {
      const condHi = n >= 2 && hi[n] > hi[n - 1] && hi[n - 1] <= hi[n - 2];
      const condLo = n >= 2 && lo[n] < lo[n - 1] && lo[n - 1] >= lo[n - 2];
      if (condHi) {
        if (count > 0) count = 0;
        count -= 1;
        val = b.low;
        index.unshift(n);
        index.pop();
      }
      if (condLo) {
        if (count < 0) count = 0;
        count += 1;
        val = b.high;
        index.unshift(n);
        index.pop();
      }
      const minbars = index[1] + minperiod < index[0];
      const maxvalid = n - maxperiod <= index[0];
      const c1 = n > 0 ? bars[n - 1].close : NaN;
      const breakdown = b.close < val && c1 >= prevVal;
      const breakup = b.close > val && c1 <= prevVal;
      const fu = count < -1 && breakdown && maxvalid && minbars;
      const fd = count > 1 && breakup && maxvalid && minbars;
      if (fu || fd) count = 0;
      up.push(fu);
      down.push(fd);
      prevVal = val;
    });
    return [boolTimes(bars, up), boolTimes(bars, down)];
  }
  it('declares the two conditions of the original', () => {
    expect(decls(falseBo)).toEqual([
      ['alert0', 'False Breakout Up', 'False Breakout Up'],
      ['alert1', 'False Breakout Down', 'False Breakout Down'],
    ]);
    expect(falseBo.FalseBreakout.alertConditions).toBe(falseBo.alertConditions);
  });
  it('fires on the false breakouts', () => {
    const [up, down] = expected();
    expect(up.length).toBeGreaterThan(3);
    expect(down.length).toBeGreaterThan(3);
    const r = falseBo.calculate(bars);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(down);
  });
});

describe('Faraz Perfect Structure XL / XS', () => {
  const bars = walk(1500, 31);
  const r = faraz.calculate(bars, { minSlopePts: 0.05 });
  const markerTimes = (text: string) => r.markers.filter((m) => m.text === text).map((m) => m.time);
  it('declares the six conditions of the original (placeholders kept)', () => {
    expect(decls(faraz)).toEqual([
      ['alert0', 'Faraz XL Long Signal', 'Faraz Perfect Structure: XL LONG signal on {{ticker}} ({{interval}}).'],
      ['alert1', 'Faraz XS Short Signal', 'Faraz Perfect Structure: XS SHORT signal on {{ticker}} ({{interval}}).'],
      ['alert2', 'Faraz Base Long', 'Faraz Structure: Base LONG signal on {{ticker}} ({{interval}}).'],
      ['alert3', 'Faraz Base Short', 'Faraz Structure: Base SHORT signal on {{ticker}} ({{interval}}).'],
      ['alert4', 'Faraz Buy Scalp', 'Faraz ITG-style BUY SCALP on {{ticker}} ({{interval}}).'],
      ['alert5', 'Faraz Sell Scalp', 'Faraz ITG-style SELL SCALP on {{ticker}} ({{interval}}).'],
    ]);
    expect(faraz.FarazPerfectStructureScalperLongShort.alertConditions).toBe(faraz.alertConditions);
  });
  it('fires on the bars of the plotshape outputs of the same conditions', () => {
    const texts = ['XL', 'XS', 'Long', 'Short', 'Buy\nScalp', 'Sell\nScalp'];
    texts.forEach((t, k) => {
      expect(r.alerts[k].times.length, t).toBeGreaterThan(0);
      expect(r.alerts[k].times, t).toEqual(markerTimes(t));
    });
    // XL / XS bars are the green / red bar colours
    const green = r.barColors.filter((c) => c.color === r.barColors.find((x) => r.alerts[0].times.includes(x.time))?.color);
    expect(green.map((c) => c.time)).toEqual(r.alerts[0].times);
  });
  it('base signals: breakout above the previous highs and the structure low, RSI and MACD filters', () => {
    const highs = highest(bars.map((b) => b.high), 10);
    const lows = lowest(bars.map((b) => b.low), 10);
    // every Base Long bar closes above the highest high of the 10 bars before; every Base Short below the lowest low
    for (const t of r.alerts[2].times) {
      const i = bars.findIndex((b) => b.time === t);
      expect(gt(bars[i].close, highs[i - 1])).toBe(true);
    }
    for (const t of r.alerts[3].times) {
      const i = bars.findIndex((b) => b.time === t);
      expect(lt(bars[i].close, lows[i - 1])).toBe(true);
    }
  });
});

describe('Fastlane', () => {
  const bars = walk(1200, 37, 86400, 2);
  const close = bars.map((b) => b.close);
  const roc = close.map((c, i) => (i > 0 ? Math.abs((100 * (c - close[i - 1])) / close[i - 1]) : NaN));
  const inputs = { vol: 1e6, per: 3 };
  const bigMove = (i: number) => ge(roc[i], 3);
  const bigVol = (i: number) => ge(bars[i].volume as number, 1e6);
  it('declares the condition of the original', () => {
    expect(decls(fastlane)).toEqual([['alert0', 'Fastlane', 'Fastlane']]);
    expect(fastlane.Fastlane.alertConditions).toBe(fastlane.alertConditions);
  });
  it('fires on the bars with a large move and a large volume (combined mode only)', () => {
    const want = timesWhere(bars, (i) => bigMove(i) && bigVol(i));
    expect(want.length).toBeGreaterThan(5);
    const r = fastlane.calculate(bars, inputs);
    expect(r.alerts[0].times).toEqual(want);
    expect(idTimes(r.markers, 'shape2')).toEqual(want);
    expect(r.markers.every((m) => m.id === 'shape2')).toBe(true);
    const sep = fastlane.calculate(bars, { ...inputs, use: false });
    expect(sep.alerts[0].times).toEqual([]);
    expect(idTimes(sep.markers, 'shape0')).toEqual(timesWhere(bars, bigMove));
    expect(idTimes(sep.markers, 'shape1')).toEqual(timesWhere(bars, bigVol));
    expect(sep.markers.every((m) => m.id === 'shape0' || m.id === 'shape1')).toBe(true);
  });
});

describe('Fibonacci Extension / Retracement / Pivot Points: palette left as it is', () => {
  it('the historical pivot plots draw the colours of the original levels and na (transparent)', () => {
    const bars = walk(600, 41, 3600);
    const r = fibExt.calculate(bars, { histPP: true } as never);
    const palette = ['#787b86', '#f44336', '#81c784', '#4caf50', '#009688', '#64b5f6', '#2196f3', '#9c27b0', '#e91e63', 'transparent'];
    for (const [id, pts] of Object.entries(r.plots)) {
      const cols = new Set((pts as { color?: string }[]).map((p) => (p.color ?? 'transparent').toLowerCase()));
      for (const c of cols) expect(palette, `${id} ${c}`).toContain(c);
    }
  });
});

describe('Fibonacci Moving Averages', () => {
  const bars = walk(1200, 43);
  it('makes the alert() calls of the original, off by default', () => {
    expect(fibMa.hasAlertFunction).toBe(true);
    expect(fibMa.FibonacciMovingAverages.hasAlertFunction).toBe(true);
    expect(fibMa.calculate(bars).alertCalls).toEqual([]);
  });
  it('one call per average crossed by the close, in the order 21, 34, 55, 89', () => {
    const r = fibMa.calculate(bars, { alert21: true, alert34: true, alert55: true, alert89: true });
    const close = bars.map((b) => b.close);
    const want: { time: number; message: string; freq: string }[] = [];
    const lens = [21, 34, 55, 89];
    const crosses = lens.map((len, k) => {
      const ma = values(r.plots[`plot${k + 3}`]);
      return close.map((_c, i) => crossover(close, ma)[i] || crossunder(close, ma)[i]);
    });
    bars.forEach((b, i) => lens.forEach((len, k) => {
      if (crosses[k][i]) want.push({ time: b.time as number, message: `Price has crossed ${len} Period MA`, freq: 'once_per_bar_close' });
    }));
    expect(want.length).toBeGreaterThan(40);
    expect(r.alertCalls).toEqual(want);
    const only55 = fibMa.calculate(bars, { alert55: true });
    expect(only55.alertCalls).toEqual(want.filter((c) => c.message.includes(' 55 ')));
  });
});

describe('Fibonacci Ranges (Real-Time) [LuxAlgo]', () => {
  const bars = walk(1500, 47);
  it('declares the two conditions of the original (message typo kept)', () => {
    expect(decls(fibRanges)).toEqual([
      ['alert0', 'break Up', 'break Up'],
      ['alert1', 'break Down', 'break Donw'],
    ]);
    expect(fibRanges.FibonacciRanges.alertConditions).toBe(fibRanges.alertConditions);
  });
  it('fires on the bars of the break labels (brokeU / brokeD and f.active[1]), also when they are hidden', () => {
    const r = fibRanges.calculate(bars);
    const up = r.markers.filter((m) => m.shape === 'labelDown').map((m) => m.time);
    const down = r.markers.filter((m) => m.shape === 'labelUp').map((m) => m.time);
    expect(up.length).toBeGreaterThan(3);
    expect(down.length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(down);
    const hidden = fibRanges.calculate(bars, { showBreaks: false });
    expect(hidden.markers).toEqual([]);
    expect(hidden.alerts[0].times).toEqual(up);
    expect(hidden.alerts[1].times).toEqual(down);
  });
  it('a break closes the channel: the closes leave the 0 / 1 levels for more than 2 bars', () => {
    const r = fibRanges.calculate(bars);
    const v0 = values(r.plots.plot1);
    const v1 = values(r.plots.plot7);
    for (const t of r.alerts[0].times) {
      const i = bars.findIndex((b) => b.time === t);
      // the levels of the bars before the break (na on a bar where the 0 level changed)
      let k = i - 1;
      while (k > 0 && isNaN(v0[k])) k--;
      expect(gt(bars[i].close, Math.max(v0[k], v1[k]))).toBe(true);
    }
  });
});

describe('Fibonacci Structure Engine', () => {
  const bars = walk(1500, 53, 3600);
  const chart = { tickerid: 'NASDAQ:AAPL', timeframe: '60', mintick: 0.01 } as ChartContext;
  const all = { alertApproach: true, alertStructure: true, alertLiquidity: true, showSignals: true, htf: '240' };
  it('makes the alert() calls of the original', () => {
    expect(fse.hasAlertFunction).toBe(true);
    expect(fse.FibonacciStructureEngine.hasAlertFunction).toBe(true);
  });
  it('one call per closed bar with events: the JSON payload of the original', () => {
    const r = fse.calculate(bars, all, chart);
    expect(r.alertCalls.length).toBeGreaterThan(20);
    const times = new Set<number>();
    const types = new Set<string>();
    for (const c of r.alertCalls) {
      expect(c.freq).toBe('once_per_bar_close');
      expect(times.has(c.time)).toBe(false);
      times.add(c.time);
      const p = JSON.parse(c.message);
      expect(p.schema_version).toBe(2);
      expect(p.indicator_version).toBe('2.1.0');
      expect(p.ticker).toBe('NASDAQ:AAPL');
      expect(p.tf).toBe('60');
      expect(p.bar_time).toBe(c.time * 1000);
      expect(p.bar_close_time).toBe(c.time * 1000 + 3600 * 1000);
      const bar = bars.find((b) => b.time === c.time)!;
      expect(p.price).toBeCloseTo(Math.round(bar.close * 100) / 100, 8);
      expect(p.events.length).toBeGreaterThan(0);
      for (const e of p.events) {
        types.add(e.type);
        expect(e.event_id).toBe(`NASDAQ:AAPL|60|${c.time * 1000}|${e.type}|${e.entity_id}`);
        if (['buy', 'sell', 'target', 'ambiguous', 'expired', 'replaced', 'invalidated', 'approach', 'touch'].includes(e.type)) {
          expect(e.scenario_id).not.toBeNull();
          expect(e.stop_model).toBe('Structure');
          expect(e.target_model).toBe('ATR');
        } else {
          expect(e.scenario_id).toBeNull();
        }
      }
    }
    for (const t of ['bos', 'sweep_high', 'sweep_low', 'touch']) expect(types.has(t), t).toBe(true);
    expect([...types].some((t) => ['initial', 'bos', 'choch'].includes(t))).toBe(true);
    // the BUY / SELL marks are the buy / sell events
    const buySell = r.alertCalls.filter((c) => JSON.parse(c.message).events.some((e: { type: string }) => e.type === 'buy' || e.type === 'sell'))
      .map((c) => c.time);
    expect((r.markers ?? []).map((m) => m.time)).toEqual(buySell);
  });
  it('defaults: confirmed signals and outcomes only; text lines without the JSON payload', () => {
    const r = fse.calculate(bars, {}, chart);
    const allowed = ['buy', 'sell', 'target', 'ambiguous', 'expired', 'replaced', 'invalidated'];
    expect(r.alertCalls.length).toBeGreaterThan(0);
    for (const c of r.alertCalls) {
      for (const e of JSON.parse(c.message).events) expect(allowed).toContain(e.type);
    }
    const text = fse.calculate(bars, { jsonAlerts: false }, chart);
    expect(text.alertCalls.map((c) => c.time)).toEqual(r.alertCalls.map((c) => c.time));
    for (const c of text.alertCalls) {
      const d = new Date(c.time * 1000).toISOString();
      expect(c.message.startsWith(`FSE 2.1.0 | NASDAQ:AAPL | 60 | ${d.slice(0, 10)} ${d.slice(11, 16)}\n`)).toBe(true);
      const lines = c.message.split('\n').slice(1);
      expect(lines.length).toBe(JSON.parse(r.alertCalls.find((x) => x.time === c.time)!.message).events.length);
      for (const l of lines) expect(l).toMatch(/^(BUY|SELL|TARGET|AMBIGUOUS|EXPIRED|REPLACED|INVALIDATED) · (LONG|SHORT) · [0-9.]+ \| /);
    }
    const none = fse.calculate(bars, { alertEntries: false, alertLifecycle: false }, chart);
    expect(none.alertCalls).toEqual([]);
  });
  it('no call on a last bar that is still open', () => {
    const r = fse.calculate(bars, all, chart);
    const last = r.alertCalls[r.alertCalls.length - 1];
    const cut = bars.slice(0, bars.findIndex((b) => b.time === last.time) + 1);
    const closed = fse.calculate(cut, all, chart);
    expect(closed.alertCalls[closed.alertCalls.length - 1].time).toBe(last.time);
    const open = fse.calculate(cut, all, { ...chart, lastBarConfirmed: false } as ChartContext);
    expect(open.alertCalls.some((c) => c.time === last.time)).toBe(false);
  });
});

describe('Fibonacci Weighted Moving Average', () => {
  const bars = walk(1200, 59);
  it('declares the three conditions of the original (placeholders kept)', () => {
    expect(decls(fwma)).toEqual([
      ['alert0', 'Bullish Color Change', 'FWMA - Bullish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
      ['alert1', 'Bearish Color Change', 'FWMA - Bearish Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
      ['alert2', 'Any Color Change', 'FWMA - Any Color Change\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}'],
    ]);
    expect(fwma.FibonacciWeightedMovingAverage.alertConditions).toBe(fwma.alertConditions);
  });
  it('fires when the FWMA turns up / down', () => {
    const len = 14;
    const w: number[] = [];
    let a = 0;
    let b = 1;
    for (let i = 1; i <= len; i++) {
      w.push(b);
      [a, b] = [b, a + b];
    }
    w.reverse();
    const wsum = w.reduce((x, y) => x + y, 0);
    const src = bars.map((x) => x.close);
    const ma = src.map((_v, i) => w.reduce((s, wk, k) => s + (i - k >= 0 ? src[i - k] : src[i]) * wk, 0) / wsum);
    const bull = ma.map((v, i) => i > 0 && gt(v, ma[i - 1]));
    const up = timesWhere(bars, (i) => i > 0 && bull[i] && !bull[i - 1]);
    const down = timesWhere(bars, (i) => i > 0 && !bull[i] && bull[i - 1]);
    expect(up.length).toBeGreaterThan(20);
    const r = fwma.calculate(bars);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(down);
    expect(r.alerts[2].times).toEqual([...up, ...down].sort((x, y) => x - y));
    // without the direction colours the line keeps one colour: no change
    const flat = fwma.calculate(bars, { highlightDirection: false });
    for (let k = 0; k < 3; k++) expect(flat.alerts[k].times).toEqual([]);
  });
});

describe('Fisher MPz', () => {
  const bars = walk(1200, 61);
  const BULL = 'Fisher MPz: Bullish Crossover - Composite crossed above Trigger';
  const BEAR = 'Fisher MPz: Bearish Crossover - Composite crossed below Trigger';
  it('makes the alert() calls of the original, off by default', () => {
    expect(fisher.hasAlertFunction).toBe(true);
    expect(fisher.FisherMPz.hasAlertFunction).toBe(true);
    expect(fisher.calculate(bars).alertCalls).toEqual([]);
    expect(fisher.calculate(bars, { alertOnBullish: true, alertOnBearish: true }).alertCalls).toEqual([]);
  });
  it('calls on the crosses of the composite and its trigger', () => {
    const r = fisher.calculate(bars, { enableAlerts: true, alertOnBullish: true, alertOnBearish: true });
    const c = values(r.plots.plot0);
    const t = values(r.plots.plot1);
    const up = crossover(c, t);
    const dn = crossunder(c, t);
    const want: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      if (up[i]) want.push({ time: b.time as number, message: BULL, freq: 'once_per_bar' });
      if (dn[i]) want.push({ time: b.time as number, message: BEAR, freq: 'once_per_bar' });
    });
    expect(want.length).toBeGreaterThan(20);
    expect(r.alertCalls).toEqual(want);
    const bullOnly = fisher.calculate(bars, { enableAlerts: true, alertOnBullish: true });
    expect(bullOnly.alertCalls).toEqual(want.filter((x) => x.message === BULL));
  });
});
