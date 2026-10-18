/**
 * Community ports, batch 33 (RSI ports): the alertcondition() declarations (ids, titles and messages of the
 * originals), the bars on which each condition is true (re-computed here from the original's expression), and the
 * Style ids on the emitted markers / arrows, plus the fill titles of the original.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as bbDisp from '../../src/community/rsi-bb-dispersion';
import * as bbStd from '../../src/community/rsi-bb-stddev-signal';
import * as mzones from '../../src/community/rsi-ema-mzones-with-divergences';
import * as entry from '../../src/community/rsi-entry-engine';
import * as flux from '../../src/community/rsi-flux-charts';
import * as games from '../../src/community/rsi-games-1-2';
import * as hash from '../../src/community/rsi-hash-capital';
import * as suite from '../../src/community/rsi-macd-suite';
import * as v32 from '../../src/community/rsi-macd-v3-2';
import * as multi from '../../src/community/rsi-multicolor-editable';
import * as flip from '../../src/community/rsi-perfect-flip-dots';
import * as sd from '../../src/community/rsi-supply-demand';
import * as tops from '../../src/community/rsi-tops-bottoms';
import * as nav from '../../src/community/rsi-trend-navigator';
import { makeBars } from './community-top100.helpers';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

/** Seeded random walk of daily bars with trending phases (RSI extremes) */
function walk(count: number, seed0: number, step = 86400, start = 1577836800): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 23) * 1.6 + (rnd() - 0.5) * 4);
    const volume = 1e6 * (0.3 + rnd());
    out.push({ time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1500, 11);
const close = bars.map((b) => b.close);
const A = (s: Series) => s.toArray().map((v) => (v ?? NaN) as number);
const S = (a: number[], list: Bar[] = bars) => Series.fromArray(list, a);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const uniq = <T>(a: T[]) => [...new Set(a)];
const idTimes = (items: { id?: string; time: unknown }[], id: string) => items.filter((m) => m.id === id).map((m) => m.time as number);
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
const or = (a: boolean[], b: boolean[]) => a.map((v, i) => v || b[i]);
/** RSI from RMAs of the up / down changes: down == 0 ? 100 : up == 0 ? 0 : 100 - 100 / (1 + up / down) */
function rmaRsi(src: number[], len: number, list: Bar[] = bars): number[] {
  const ch = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const up = A(ta.rma(S(ch.map((c) => (isNaN(c) ? NaN : Math.max(c, 0))), list), len));
  const down = A(ta.rma(S(ch.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0))), list), len));
  return up.map((u, i) => (eq(down[i], 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / down[i])));
}

/**
 * The classic pivot divergences of an oscillator: regular bull = price lower low + osc higher low, hidden bull =
 * price higher low + osc lower low (or `hiddenOscSame`: osc higher low as the regular one), likewise for the bears.
 * `lazy`: the ta.barssince of _inRange(found[1]) runs only on the bars where the osc comparison is true.
 */
function divergences(osc: number[], list: Bar[], lbL: number, lbR: number, rangeLower: number, rangeUpper: number,
  lazy: boolean, hiddenOscSame = false) {
  const n = list.length;
  const pl = A(ta.pivotlow(S(osc, list), lbL, lbR)).map((v) => !isNaN(v));
  const ph = A(ta.pivothigh(S(osc, list), lbL, lbR)).map((v) => !isNaN(v));
  const out = { bull: [] as boolean[], hBull: [] as boolean[], bear: [] as boolean[], hBear: [] as boolean[] };
  const vw: Record<string, number[]> = { plO: [], plL: [], phO: [], phH: [] };
  const second = (a: number[]) => (a.length >= 2 ? a[a.length - 2] : NaN);
  const counter = () => {
    let c = NaN;
    return (cond: boolean) => {
      if (cond) c = 0;
      else if (!isNaN(c)) c++;
      return rangeLower <= c && c <= rangeUpper;
    };
  };
  const plEvery = counter(), phEvery = counter(), plHL = counter(), plLL = counter(), phLH = counter(), phHH = counter();
  for (let i = 0; i < n; i++) {
    const o = i >= lbR ? osc[i - lbR] : NaN;
    const lo = i >= lbR ? list[i - lbR].low : NaN;
    const hi = i >= lbR ? list[i - lbR].high : NaN;
    if (pl[i]) { vw.plO.push(o); vw.plL.push(lo); }
    if (ph[i]) { vw.phO.push(o); vw.phH.push(hi); }
    const prevPl = i > 0 && pl[i - 1];
    const prevPh = i > 0 && ph[i - 1];
    const inPl = plEvery(prevPl);
    const inPh = phEvery(prevPh);
    const oHL = gt(o, second(vw.plO));
    const oLL = lt(o, second(vw.plO));
    const oLH = lt(o, second(vw.phO));
    const oHH = gt(o, second(vw.phO));
    // lazy call sites: one ta.barssince per `and` (each counts its own calls)
    const rHL = lazy ? (oHL ? plHL(prevPl) : false) : oHL && inPl;
    const rLL = lazy ? (oLL ? plLL(prevPl) : false) : oLL && inPl;
    const rLH = lazy ? (oLH ? phLH(prevPh) : false) : oLH && inPh;
    const rHH = lazy ? (oHH ? phHH(prevPh) : false) : oHH && inPh;
    out.bull.push(lt(lo, second(vw.plL)) && rHL && pl[i]);
    out.hBull.push(gt(lo, second(vw.plL)) && (hiddenOscSame ? rHL : rLL) && pl[i]);
    out.bear.push(gt(hi, second(vw.phH)) && rLH && ph[i]);
    out.hBear.push(lt(hi, second(vw.phH)) && (hiddenOscSame ? rLH : rHH) && ph[i]);
  }
  return out;
}

describe('RSI + BB (EMA) + Dispersion: fill titles', () => {
  const r = bbDisp.calculate(bars);
  it('the dispersion fill is the untitled plot fill of the original ("Plots Background")', () => {
    const f = r.fills!.find((x) => x.plot1 === 'dispUp' && x.plot2 === 'dispDown');
    expect(f?.options?.title).toBe('Plots Background');
  });
});

describe('RSI BB StdDev Signal', () => {
  const spec = ['shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7', 'shape8', 'shape9', 'shape10', 'shape11',
    'shape12', 'shape13', 'shape14', 'shape15', 'shape16', 'shape17', 'shape18', 'shape19', 'shape20', 'shape21'];
  it('declares the alertconditions of the original', () => {
    expect(decls(bbStd)).toEqual([['alert0', 'Buy Signal', 'Final Buy Signal Triggered'], ['alert1', 'Sell Signal', 'Final Sell Signal Triggered']]);
    expect(bbStd.RsiBbStddevSignal.alertConditions).toBe(bbStd.alertConditions);
  });
  it('MA mode alone, no filter: the alerts are the crosses of the RSI and its SMA', () => {
    const r = bbStd.calculate(bars, { bbModeInput: false, divergenceModeInput: false, overboughtOversold: false, minBarsBetweenSignals: 0 });
    const rsi = rmaRsi(close, 14);
    const ma = A(ta.sma(S(rsi), 14));
    expect(r.alerts[0].times).toEqual(timeAt(bars, xover(rsi, ma)));
    expect(r.alerts[1].times).toEqual(timeAt(bars, xunder(rsi, ma)));
    expect(r.alerts[0].times.length).toBeGreaterThan(20);
    // the markers: oscillator MA (shape2 / shape3) and chart MA (shape8 / shape9) on the same bars
    expect(idTimes(r.markers, 'shape2')).toEqual(r.alerts[0].times);
    expect(idTimes(r.markers, 'shape8')).toEqual(r.alerts[0].times);
    expect(idTimes(r.markers, 'shape3')).toEqual(r.alerts[1].times);
    expect(idTimes(r.markers, 'shape9')).toEqual(r.alerts[1].times);
  });
  it('default inputs: the alerts are the bars of the chart signals; every marker has a spec id', () => {
    const r = bbStd.calculate(bars);
    for (const m of r.markers) expect(spec).toContain(m.id);
    const buy = uniq([...idTimes(r.markers, 'shape8'), ...idTimes(r.markers, 'shape10'), ...idTimes(r.markers, 'shape12')]).sort((a, b) => a - b);
    const sell = uniq([...idTimes(r.markers, 'shape9'), ...idTimes(r.markers, 'shape11'), ...idTimes(r.markers, 'shape13')]).sort((a, b) => a - b);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
    expect(buy.length).toBeGreaterThan(0);
    expect(sell.length).toBeGreaterThan(0);
    const ids = uniq(r.markers.map((m) => m.id));
    for (const id of ['shape2', 'shape3', 'shape4', 'shape5', 'shape8', 'shape9', 'shape10', 'shape11']) expect(ids).toContain(id);
    // a Div marker sits at the RSI of the bar before
    for (const m of r.markers.filter((x) => x.id === 'shape6' || x.id === 'shape7')) expect(m.position).toBe('atPriceMiddle');
  });
  it('AND mode: the SaD markers carry shape14..shape21 and give the alerts', () => {
    const r = bbStd.calculate(bars, { andMode: true, overboughtOversold: false, minBarsBetweenSignals: 0 });
    for (const m of r.markers) expect(spec).toContain(m.id);
    const sadBuy = uniq(['shape14', 'shape15', 'shape16', 'shape17'].flatMap((id) => idTimes(r.markers, id))).sort((a, b) => a - b);
    const sadSell = uniq(['shape18', 'shape19', 'shape20', 'shape21'].flatMap((id) => idTimes(r.markers, id))).sort((a, b) => a - b);
    expect(r.alerts[0].times).toEqual(sadBuy);
    expect(r.alerts[1].times).toEqual(sadSell);
    const texts: Record<string, string> = { shape14: 'MA+BB', shape15: 'MA+Div', shape16: 'BB+Div', shape17: 'MA+BB+Div',
      shape18: 'MA+BB', shape19: 'MA+Div', shape20: 'BB+Div', shape21: 'MA+BB+Div' };
    for (const m of r.markers.filter((x) => texts[x.id!])) expect(m.text).toBe(texts[m.id!]);
  });
});

describe('RSI+EMA+MZONES with Divergences', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(mzones)).toEqual([
      ['alert0', 'Regular Bullish Divergence', 'Found a new Regular Bullish Divergence!'],
      ['alert1', 'Hidden Bullish Divergence', 'Found a new Hidden Bullish Divergence!'],
      ['alert2', 'Regular Bearish Divergence', 'Found a new Regular Bearish Divergence!'],
      ['alert3', 'Hidden Bearish Divergence', 'Found a new Hidden Bearish Divergence!'],
    ]);
    expect(mzones.RsiEmaMzonesWithDivergences.alertConditions).toBe(mzones.alertConditions);
  });
  const rsi = rmaRsi(close, 14);
  const d = divergences(rsi, bars, 5, 5, 5, 60, false);
  it('the four divergences (whatever the Plot options), on the confirming bar', () => {
    const r = mzones.calculate(bars, { plotBull: false, plotBear: false });
    [d.bull, d.hBull, d.bear, d.hBear].forEach((flags, k) => {
      expect(r.alerts[k].times).toEqual(timeAt(bars, flags));
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
    });
    expect(r.markers).toHaveLength(0);
  });
  it('the labels carry shape0..shape3, lbR bars before the alert bar', () => {
    const r = mzones.calculate(bars, { plotHiddenBull: true, plotHiddenBear: true });
    const lag = (flags: boolean[]) => timeAt(bars, flags.slice(5));
    expect(idTimes(r.markers, 'shape0')).toEqual(lag(d.bull));
    expect(idTimes(r.markers, 'shape1')).toEqual(lag(d.hBull));
    expect(idTimes(r.markers, 'shape2')).toEqual(lag(d.bear));
    expect(idTimes(r.markers, 'shape3')).toEqual(lag(d.hBear));
    for (const m of r.markers) expect(['shape0', 'shape1', 'shape2', 'shape3']).toContain(m.id);
  });
});

describe('RSI Entry Engine', () => {
  it('declares the 12 alertconditions of the original', () => {
    expect(decls(entry).map((x) => x[1])).toEqual([
      'RSI Bullish Cross', 'RSI Bearish Cross', 'RSI Oversold Reclaim', 'RSI Overbought Reject', 'RSI Centerline Bullish',
      'RSI Centerline Bearish', 'Long Entry Signal', 'Short Entry Signal', 'Long TP Hit', 'Long SL Hit', 'Short TP Hit', 'Short SL Hit',
    ]);
    expect(decls(entry)[0]).toEqual(['alert0', 'RSI Bullish Cross', 'RSI crossed above Signal']);
    expect(decls(entry)[11]).toEqual(['alert11', 'Short SL Hit', 'Short projected stop-loss reached']);
    expect(entry.RsiEntryEngine.alertConditions).toBe(entry.alertConditions);
  });
  const r = entry.calculate(bars, { rrTarget: 1.5 });
  const rsiSmoothS = ta.ema(ta.rsi(S(close), 14), 5);
  const rsiSmooth = A(rsiSmoothS);
  const signal = A(ta.ema(rsiSmoothS, 9));
  it('the crosses of the smoothed RSI (signal line, 30, 70, 50) and the entry signals (20 / 80)', () => {
    const want = [xover(rsiSmooth, signal), xunder(rsiSmooth, signal), xover(rsiSmooth, 30), xunder(rsiSmooth, 70),
      xover(rsiSmooth, 50), xunder(rsiSmooth, 50), xover(rsiSmooth, 20), xunder(rsiSmooth, 80)];
    want.forEach((flags, k) => {
      expect(r.alerts[k].times).toEqual(timeAt(bars, flags));
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
    });
  });
  it('the TP / SL hits are the bars of the TP HIT / SL HIT labels of each direction', () => {
    const hit = (text: string, dir: string) => r.labels.filter((l) => l.text === text && l.tooltip!.includes('Direction: ' + dir))
      .map((l) => l.time as number);
    const want = [hit('𝙏𝙋 𝙃𝙄𝙏', 'Long'), hit('𝙎𝙇 𝙃𝙄𝙏', 'Long'), hit('𝙏𝙋 𝙃𝙄𝙏', 'Short'), hit('𝙎𝙇 𝙃𝙄𝙏', 'Short')];
    want.forEach((times, k) => expect(r.alerts[8 + k].times).toEqual(uniq(times)));
    expect(want.flat().length).toBeGreaterThan(0);
  });
  it('the Enable inputs turn their alerts off', () => {
    const off = entry.calculate(bars, {
      enableCrossAlerts: false, enableZoneAlerts: false, enableCenterAlerts: false, enableSignalAlerts: false, enableTradeAlerts: false,
    });
    for (const a of off.alerts) expect(a.times).toEqual([]);
  });
});

describe('RSI (Kernel Optimized) | Flux Charts', () => {
  const r = flux.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(flux)).toEqual([['alert0', 'Possible Bullish Pivot', 'Alert Fired!'], ['alert1', 'Possible Bearish Pivot', 'Alert Fired!']]);
    expect(flux.RsiFluxCharts.alertConditions).toBe(flux.alertConditions);
  });
  it('the plotarrow outputs are arrows with the ids arrow0..arrow3 (no markers)', () => {
    expect((r as { markers?: unknown[] }).markers).toBeUndefined();
    expect(r.arrows.length).toBeGreaterThan(0);
    for (const a of r.arrows) expect(['arrow0', 'arrow1', 'arrow2', 'arrow3']).toContain(a.id);
    for (const a of r.arrows) expect(a.value).toBe(a.id === 'arrow0' || a.id === 'arrow2' ? 1 : -1);
    expect(uniq(r.arrows.map((a) => a.id)).sort()).toEqual(['arrow0', 'arrow1', 'arrow2', 'arrow3']);
  });
  it('a possible pivot follows a run of faint arrows of its side, on a bar with no faint arrow', () => {
    const index = new Map(bars.map((b, i) => [b.time as number, i]));
    const at = (id: string) => new Set(idTimes(r.arrows, id));
    const bull = at('arrow0'), bear = at('arrow1');
    for (const [pid, run] of [['arrow2', bull], ['arrow3', bear]] as const) {
      for (const t of idTimes(r.arrows, pid)) {
        const i = index.get(t)!;
        expect(run.has(bars[i - 1].time as number)).toBe(true);
        expect(bull.has(t) || bear.has(t)).toBe(false);
      }
    }
    expect(r.alerts[0].times).toEqual(idTimes(r.arrows, 'arrow2'));
    expect(r.alerts[1].times).toEqual(idTimes(r.arrows, 'arrow3'));
    expect(r.alerts[0].times.length + r.alerts[1].times.length).toBeGreaterThan(0);
  });
  it('the last bar has no arrow and no alert while it is open', () => {
    const open = flux.calculate(bars, {}, { lastBarConfirmed: false });
    const last = bars[bars.length - 1].time as number;
    expect(open.arrows.some((a) => a.time === last)).toBe(false);
    for (const a of open.alerts) expect(a.times.includes(last)).toBe(false);
  });
});

describe('RSI Games 1.2', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(games)).toEqual([
      ['alert0', 'Regular Bullish Divergence', 'Regular Bullish Divergence'],
      ['alert1', 'Regular Bearish Divergence', 'Regular Bearish Divergence'],
      ['alert2', 'Hidden Bullish Divergence', 'Hidden Bullish Divergence'],
      ['alert3', 'Hidden Bearish Divergence', 'Hidden Bearish Divergence'],
    ]);
    expect(games.RsiGames12.alertConditions).toBe(games.alertConditions);
  });
  it('the divergences of the original (hidden ones with the same RSI comparison as the regular ones)', () => {
    const r = games.calculate(bars);
    const d = divergences(rmaRsi(close, 14), bars, 5, 5, 5, 60, true, true);
    [d.bull, d.bear, d.hBull, d.hBear].forEach((flags, k) => {
      expect(r.alerts[k].times).toEqual(timeAt(bars, flags));
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
    });
    const off = games.calculate(bars, { calculateDivergence: false });
    for (const a of off.alerts) expect(a.times).toEqual([]);
  });
});

describe('RSI [Hash Capital Research]', () => {
  const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
  const rsi = A(ta.ema(ta.ema(ta.rsi(S(hlc3), 13), 3), 2));
  const mom = rsi.map((v, i) => (i > 0 ? v - rsi[i - 1] : NaN));
  const vel = mom.map((v, i) => (i > 0 ? v - mom[i - 1] : NaN));
  const momOver = xover(mom, 0), momUnder = xunder(mom, 0);
  const extremeOversold = rsi.map((_v, i) => i > 0 && lt(rsi[i - 1], 20) && momOver[i - 1]);
  const extremeOverbought = rsi.map((_v, i) => i > 0 && gt(rsi[i - 1], 80) && momUnder[i - 1]);
  const r = hash.calculate(bars, { calculateDivergence: true });
  it('declares the alertconditions of the original', () => {
    expect(decls(hash)).toEqual([
      ['alert0', 'RSI - Strong Buy', 'Extreme oversold reversal detected'],
      ['alert1', 'RSI - Strong Sell', 'Extreme overbought reversal detected'],
      ['alert2', 'RSI - Buy Signal', 'Oversold reversal with momentum'],
      ['alert3', 'RSI - Sell Signal', 'Overbought reversal with momentum'],
      ['alert4', 'RSI - Bullish Cross', 'RSI crossed above 50'],
      ['alert5', 'RSI - Bearish Cross', 'RSI crossed below 50'],
      ['alert6', 'RSI - Bullish Divergence', 'Found a new Regular Bullish Divergence'],
      ['alert7', 'RSI - Bearish Divergence', 'Found a new Regular Bearish Divergence'],
    ]);
    expect(hash.RsiHashCapital.alertConditions).toBe(hash.alertConditions);
  });
  it('the 8 conditions of the original', () => {
    const d = divergences(rsi, bars, 5, 5, 5, 60, true);
    const want = [
      extremeOversold, extremeOverbought,
      rsi.map((v, i) => lt(v, 30) && gt(mom[i], 0) && gt(vel[i], 0)),
      rsi.map((v, i) => gt(v, 70) && lt(mom[i], 0) && lt(vel[i], 0)),
      xover(rsi, 50), xunder(rsi, 50), d.bull, d.bear,
    ];
    want.forEach((flags, k) => {
      expect(r.alerts[k].times).toEqual(timeAt(bars, flags));
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
    });
  });
  it('the dots and divergence labels carry shape0..shape3 (dots one bar before the alert bar)', () => {
    for (const m of r.markers) expect(['shape0', 'shape1', 'shape2', 'shape3']).toContain(m.id);
    const before = (flags: boolean[]) => timeAt(bars, flags.slice(1));
    expect(idTimes(r.markers, 'shape0')).toEqual(before(extremeOversold));
    expect(idTimes(r.markers, 'shape1')).toEqual(before(extremeOverbought));
    const lag5 = (flags: boolean[]) => timeAt(bars, flags.slice(5));
    expect(idTimes(r.markers, 'shape2')).toEqual(lag5(divergences(rsi, bars, 5, 5, 5, 60, true).bull));
    expect(idTimes(r.markers, 'shape3').length).toBeGreaterThan(0);
  });
});

describe('RSI & MACD Suite', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(suite)).toEqual([
      ['alert0', 'RSI Overbought', 'RSI crossed above 70 (Overbought)'],
      ['alert1', 'RSI Oversold', 'RSI crossed below 30 (Oversold)'],
      ['alert2', 'RSI Midline Cross', 'RSI crossed the 50 midline'],
      ['alert3', 'MACD Bullish Cross', 'MACD line crossed above Signal line (Bullish)'],
      ['alert4', 'MACD Bearish Cross', 'MACD line crossed below Signal line (Bearish)'],
      ['alert5', 'MACD Histogram Bullish', 'MACD Histogram crossed above zero (Bullish momentum)'],
      ['alert6', 'MACD Histogram Bearish', 'MACD Histogram crossed below zero (Bearish momentum)'],
    ]);
    expect(suite.RsiMacdSuite.alertConditions).toBe(suite.alertConditions);
  });
  it('the crosses of the RSI and of the MACD', () => {
    const r = suite.calculate(bars);
    const rsi = rmaRsi(close, 14);
    const fast = A(ta.ema(S(close), 12)), slow = A(ta.ema(S(close), 26));
    const macd = fast.map((v, i) => v - slow[i]);
    const sig = A(ta.ema(S(macd), 9));
    const hist = macd.map((v, i) => v - sig[i]);
    const want = [xover(rsi, 70), xunder(rsi, 30), or(xover(rsi, 50), xunder(rsi, 50)), xover(macd, sig), xunder(macd, sig),
      xover(hist, 0), xunder(hist, 0)];
    want.forEach((flags, k) => {
      expect(r.alerts[k].times).toEqual(timeAt(bars, flags));
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
    });
  });
});

describe('RSI + MACD (RSI Divergence) V3.2: Style ids of the divergence labels', () => {
  const r = v32.calculate(bars, { plotHiddenBull: true, plotHiddenBear: true });
  it('the four label kinds carry shape0..shape3', () => {
    const want: Record<string, string> = { shape0: ' Bull ', shape1: ' Hidden Bull ', shape2: ' Bear ', shape3: ' Hidden Bear ' };
    expect(r.markers.length).toBeGreaterThan(0);
    for (const m of r.markers) {
      expect(Object.keys(want)).toContain(m.id);
      expect(m.text).toBe(want[m.id!]);
    }
    expect(uniq(r.markers.map((m) => m.id)).sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
  });
});

describe('RSI Multicolor editable', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(multi)).toEqual([
      ['alert0', '* Entry Into Overbought Area', 'Entry Into Overbought Area!'],
      ['alert1', '* Exit From Overbought Area', 'Exit From Overbought Area!'],
      ['alert2', '* Crossing Neutral Level', 'Crossing Neutral Level'],
      ['alert3', '* Entry Into Oversold Area', 'Entry Into Oversold Area!'],
      ['alert4', '* Exit From Oversold area', 'Exit From Oversold Area!'],
    ]);
    expect(multi.RsiMulticolorEditable.alertConditions).toBe(multi.alertConditions);
  });
  it('the crosses of the levels (first series) and the RSI, as written in the original', () => {
    const r = multi.calculate(bars);
    const rsi = rmaRsi(close, 14);
    const lvl = (v: number) => rsi.map(() => v);
    const want = [xover(lvl(70), rsi), xunder(lvl(70), rsi), or(xover(lvl(50), rsi), xunder(lvl(50), rsi)), xover(lvl(30), rsi), xunder(lvl(70), rsi)];
    want.forEach((flags, k) => {
      expect(r.alerts[k].times).toEqual(timeAt(bars, flags));
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
    });
  });
});

describe('RSI PERFECT Flip Dots: arrows and dots', () => {
  const r = flip.calculate(bars);
  const rsiS = ta.rsi(S(close), 14);
  const fast = A(ta.ema(rsiS, 5)), slow = A(ta.ema(rsiS, 14));
  it('the two plotarrow outputs are arrows (arrow0 = 1 while fast > slow, arrow1 = -1 while fast < slow)', () => {
    expect(idTimes(r.arrows, 'arrow0')).toEqual(timeAt(bars, fast.map((v, i) => gt(v, slow[i]))));
    expect(idTimes(r.arrows, 'arrow1')).toEqual(timeAt(bars, fast.map((v, i) => lt(v, slow[i]))));
    for (const a of r.arrows) expect(a.value).toBe(a.id === 'arrow0' ? 1 : -1);
    expect(r.arrows.length).toBeGreaterThan(0);
  });
  it('the markers are only the Buy / Sell dots, with shape0 / shape1', () => {
    expect(idTimes(r.markers, 'shape0')).toEqual(timeAt(bars, xover(fast, slow)));
    expect(idTimes(r.markers, 'shape1')).toEqual(timeAt(bars, xunder(fast, slow)));
    expect(r.markers).toHaveLength(idTimes(r.markers, 'shape0').length + idTimes(r.markers, 'shape1').length);
    expect(r.markers.length).toBeGreaterThan(0);
  });
});

describe('RSI Supply/Demand', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(sd)).toEqual([
      ['alert0', 'Alert - Price Enters S/D Zone 1', 'Price Enters S/D Zone 1 - RSI S/D'],
      ['alert1', 'Alert - Price Enters S/D Zone 2', 'Price Enters S/D Zone 2 - RSI S/D'],
      ['alert2', 'Alert - Price Enters S/D Zone 3', 'Price Enters S/D Zone 3 - RSI S/D'],
      ['alert3', 'Alert - Price Enters S/D Zone 4', 'Price Enters S/D Zone 4 - RSI S/D'],
      ['alert4', 'Alert - Price Enters Any S/D Zone', 'Price Enters Any S/D Zone - RSI S/D'],
    ]);
    expect(sd.RsiSupplyDemand.alertConditions).toBe(sd.alertConditions);
  });
  /** The original's zone k: fixnan of the high / low of the bars with `confirm` consecutive bars beyond 70 / 30 */
  const enters = (len: number) => {
    const rsi = A(ta.rsi(S(close), len));
    let count = 0;
    let rH = NaN, rL = NaN;
    const hs: number[] = [], ls: number[] = [];
    bars.forEach((b, i) => {
      count = rsi[i] > 70 || rsi[i] < 30 ? count + 1 : 0;
      if (count >= 3) { rH = b.high; rL = b.low; }
      hs[i] = rH; ls[i] = rL;
    });
    const inZone = bars.map((b, i) => le(b.close, hs[i]) && ge(b.close, ls[i]) && i > 0 && hs[i] === hs[i - 1]);
    return inZone.map((v, i) => v && !(i > 0 && inZone[i - 1]));
  };
  const r = sd.calculate(bars);
  it('price entering the S/D zone of RSI 7 / 14 / 21 / 28, and of any of them', () => {
    const want = [enters(7), enters(14), enters(21), enters(28)];
    want.forEach((flags, k) => {
      expect(r.alerts[k].times).toEqual(timeAt(bars, flags));
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
    });
    expect(r.alerts[4].times).toEqual(timeAt(bars, want[0].map((v, i) => v || want[1][i] || want[2][i] || want[3][i])));
  });
  it('the 12 fills of the original (titles and plots), only zone 2 drawn by default', () => {
    const titles = [1, 2, 3, 4].flatMap((k) => [`Support Zone - ${k} - Fill`, `Support Zone - ${k} - Fill`, `Supply Demand - ${k} - Fill`]);
    expect(r.fills!.map((f) => f.options?.title)).toEqual(titles);
    expect(r.fills!.slice(3, 6).map((f) => [f.plot1, f.plot2])).toEqual([
      ['resistanceHigh', 'resistanceLow'], ['supportHigh', 'supportLow'], ['sdHigh', 'sdLow'],
    ]);
    const drawn = Object.entries(r.plots).filter(([, p]) => (p as { value: number }[]).some((x) => !isNaN(x.value))).map(([id]) => id);
    expect(drawn.sort()).toEqual(['sdHigh', 'sdLow']);
    for (const f of r.fills!) expect(Object.keys(r.plots)).toContain(f.plot1);
    const z1 = sd.calculate(bars, { showSD1: true, showSupport3: true });
    expect(z1.plots.sd1High.some((x) => !isNaN(x.value))).toBe(true);
    expect(z1.plots.support3Low.some((x) => !isNaN(x.value))).toBe(true);
  });
});

describe('RSI Tops and Bottoms', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(tops)).toEqual([
      ['alert0', 'Divergence at Bottoms', 'Divergence at Bottom, Price may go UP'],
      ['alert1', 'Divergence at Tops', 'Divergence at Bottom, Price may go DOWN'],
    ]);
    expect(tops.RsiTopsBottoms.alertConditions).toBe(tops.alertConditions);
  });
  /** The original's script, bar by bar (var states, history references) */
  function original(list: Bar[], len = 14, ob = 70, os = 30, prd = 10, mindis = 5, maxdis = 100) {
    const rsi = A(ta.rsi(S(list.map((b) => b.close), list), len));
    const n = list.length;
    const side = (bottom: boolean) => {
      let inZone = false, count = 0, lastRsi = NaN, lastPrice = NaN, lastBi = NaN, fine = false;
      const hist: Array<{ inZone: boolean; count: number; rsi: number; price: number; bi: number; fine: boolean }> = [];
      const flags: boolean[] = [];
      for (let i = 0; i < n; i++) {
        const r0 = rsi[i], r1 = i > 0 ? rsi[i - 1] : NaN;
        if (bottom) inZone = r1 >= os && r0 < os ? true : r0 > os ? false : inZone;
        else inZone = r1 <= ob && r0 > ob ? true : r0 < ob ? false : inZone;
        count = inZone ? count + 1 : 0;
        const p = hist[i - 1];
        if (p && p.inZone && !inZone && p.count > 0) {
          lastRsi = bottom ? 101 : -1;
          lastBi = i;
          fine = true;
          for (let x = 1; x <= p.count; x++) {
            if (x > prd) fine = false;
            if (bottom ? rsi[i - x] < lastRsi : rsi[i - x] > lastRsi) {
              lastRsi = rsi[i - x];
              lastBi = i - x;
              lastPrice = bottom ? list[i - x].low : list[i - x].high;
            }
          }
        }
        const pr = p ? p.rsi : NaN;
        const truthy = (v: number) => !isNaN(v) && v !== 0;
        flags.push(!!p && lastRsi - pr !== 0 && !isNaN(lastRsi - pr) && truthy(lastRsi) && truthy(pr)
          && (bottom ? lastRsi > pr && lastPrice < p.price : lastRsi < pr && lastPrice > p.price)
          && i - p.bi < maxdis && fine && p.fine && i - p.bi > mindis);
        hist.push({ inZone, count, rsi: lastRsi, price: lastPrice, bi: lastBi, fine });
      }
      return flags;
    };
    return { up: side(true), down: side(false) };
  }
  it('maygoup / maygodown of the original, on the bar where the RSI leaves the zone', () => {
    for (const list of [bars, makeBars(3200, 86400) as unknown as Bar[]]) {
      const r = tops.calculate(list);
      const o = original(list);
      expect(r.alerts[0].times).toEqual(timeAt(list, o.up));
      expect(r.alerts[1].times).toEqual(timeAt(list, o.down));
      // one bar colour per divergence bar
      expect(r.barColors.map((c) => c.time)).toEqual(timeAt(list, or(o.up, o.down)));
    }
    const r = tops.calculate(makeBars(3200, 86400) as unknown as Bar[]);
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[1].times.length).toBeGreaterThan(0);
  });
});

describe('RSI Trend Navigator', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(nav)).toEqual([
      ['alert0', 'RSI Trend Bullish', 'RSI Trend Bullish Signal {{exchange}}:{{ticker}}'],
      ['alert1', 'RSI Trend Bearish', 'RSI Trend Bearish Signal {{exchange}}:{{ticker}}'],
    ]);
    expect(nav.RSITrendNavigator.alertConditions).toBe(nav.alertConditions);
  });
  it('isBullish and not isBullish[1] / isBearish and not isBearish[1], from the rises and falls of the trend line', () => {
    const r = nav.calculate(bars);
    const line = r.plots.plot0.map((p) => p.value as number);
    let bull = false, bear = false;
    const up: boolean[] = [], down: boolean[] = [];
    line.forEach((v, i) => {
      const pb = bull, pr = bear;
      if (i > 0 && gt(v, line[i - 1])) { bull = true; bear = false; } else if (i > 0 && lt(v, line[i - 1])) { bull = false; bear = true; }
      up.push(bull && !pb);
      down.push(bear && !pr);
    });
    expect(r.alerts[0].times).toEqual(timeAt(bars, up));
    expect(r.alerts[1].times).toEqual(timeAt(bars, down));
    expect(r.alerts[0].times.length).toBeGreaterThan(3);
    expect(r.alerts[1].times.length).toBeGreaterThan(3);
  });
});
