/**
 * Community ports, batch 26: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers / background colours and the fills.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as multpile from '../../src/community/multpile-strategies';
import * as muses from '../../src/community/muses-afl-script';
import * as nwt from '../../src/community/nadaraya-watson-trend';
import * as ncme from '../../src/community/navier-cauchy-market-elasticity';
import * as nexus from '../../src/community/nexus-sentiment-risk-matrix';
import * as nlms from '../../src/community/nlms-volatility-trail';
import * as ncrsi from '../../src/community/normalized-candles-rsi';
import * as nqqe from '../../src/community/normalized-qqe';
import * as nqqe2 from '../../src/community/normalized-quantitative-qualitative';
import * as nova from '../../src/community/nova-statistical-filtering-oscillator';
import * as nrtr from '../../src/community/nrtr';
import * as oaSmes from '../../src/community/oa-smes';
import * as obvAd from '../../src/community/obv-ad-oscillators-with-dual-smoothing-options';
import * as obvMa from '../../src/community/obv-custom-ma-strategy';
import * as occ from '../../src/community/open-close-cross';
import * as occNrp from '../../src/community/open-close-cross-alerts-norepaint-version-by';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = { "muses-afl-script": [ [ "alert0", "Buy Alert", "L1 Filter BUY Signal!" ], [ "alert1", "Sell Alert", "L1 Filter SELL Signal!" ] ], "nadaraya-watson-trend": [ [ "alert0", "Bullish Kernel Reversal", "Nadaraya-Watson Trend: BULLISH kernel reversal on {{exchange}}:{{ticker}} - {{interval}}" ], [ "alert1", "Bearish Kernel Reversal", "Nadaraya-Watson Trend: BEARISH kernel reversal on {{exchange}}:{{ticker}} - {{interval}}" ], [ "alert2", "Any Kernel Reversal", "Nadaraya-Watson Trend: Kernel path direction changed on {{exchange}}:{{ticker}} - {{interval}}" ], [ "alert3", "Source Cross Above Upper Band", "Nadaraya-Watson Trend: Source crossed above upper residual band on {{exchange}}:{{ticker}} - {{interval}}" ], [ "alert4", "Source Cross Below Lower Band", "Nadaraya-Watson Trend: Source crossed below lower residual band on {{exchange}}:{{ticker}} - {{interval}}" ] ], "navier-cauchy-market-elasticity": [ [ "alert0", "High Stress", "Market under high tension" ], [ "alert1", "High Compression", "Market under high compression" ], [ "alert2", "Extreme High Stress", "Market under extreme tension" ], [ "alert3", "Extreme Compression", "Market under extreme compression" ] ], "nexus-sentiment-risk-matrix": [ [ "alert0", "Nexus Buy Signal", "Risk-On: Bullish Sentiment & Risk metrics aligned." ], [ "alert1", "Nexus Sell Signal", "Risk-Off: Bearish Sentiment & Risk metrics aligned." ] ], "nlms-volatility-trail": [ [ "alert0", "NLMS ATR Bullish", "NLMS ATR Trend turned bullish on {{ticker}}" ], [ "alert1", "NLMS ATR Bearish", "NLMS ATR Trend turned bearish on {{ticker}}" ] ], "normalized-candles-rsi": [ [ "alert0", "Regular Bullish Divergence", "Found a new Regular Bullish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar." ], [ "alert1", "Regular Bearish Divergence", "Found a new Regular Bearish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar." ], [ "alert2", "Norm Close Cross Above 50", "FFD Normalized Close crossed above 50 — bullish regime shift." ], [ "alert3", "Norm Close Cross Below 50", "FFD Normalized Close crossed below 50 — bearish regime shift." ], [ "alert4", "Norm Close Cross Above 70", "FFD Normalized Close crossed above 70 — overbought." ], [ "alert5", "Norm Close Cross Below 30", "FFD Normalized Close crossed below 30 — oversold." ] ], "normalized-qqe": [ [ "alert0", "Cross Alert", "QQE Crossing Signal!" ], [ "alert1", "Crossover Alarm", "QQE BUY SIGNAL!" ], [ "alert2", "Crossunder Alarm", "QQE SELL SIGNAL!" ], [ "alert3", "Cross 0 Up Alert", "QQE FAST Crossing 0 UP!" ], [ "alert4", "Cross 0 Down Alert", "QQE FAST Crossing 0 DOWN!" ], [ "alert5", "Cross 10 Up Alert", "QQE Above 10 UPTREND SIGNAL!" ], [ "alert6", "Cross -10 Down Alert", "QQE Below -10 DOWNTREND SIGNAL!" ], [ "alert7", "SIDEWAYS", "QQE Entering Sideways Market!" ] ], "nova-statistical-filtering-oscillator": [ [ "alert0", "Buy Signal", "Bullish momentum is returning from an oversold statistical extreme." ], [ "alert1", "Sell Signal", "Bearish momentum is returning from an overbought statistical extreme." ] ], "nrtr": [ [ "alert0", "NRTR Direction Change", "NRTR has changed direction, {{exchange}}:{{ticker}}" ], [ "alert1", "NRTR Buy", "NRTR Buy, {{exchange}}:{{ticker}}" ], [ "alert2", "NRTR Sell", "NRTR Sell, {{exchange}}:{{ticker}}" ] ], "obv-custom-ma-strategy": [ [ "alert0", "Bullish Signal (MA Crossover)", "Bullish signal: Short-term MA crosses above long-term MA" ], [ "alert1", "Bearish Signal (MA Crossover)", "Bearish signal: Short-term MA crosses below long-term MA" ], [ "alert2", "Bullish Signal (OBV Crossover)", "Bullish signal: OBV crosses above short-term MA" ], [ "alert3", "Bearish Signal (OBV Crossover)", "Bearish signal: OBV crosses below short-term MA" ] ], "open-close-cross": [ [ "alert0", "OCC BothCond", "OCC BothCond" ], [ "alert1", "OCC LongCond", "OCC LongCond" ], [ "alert2", "OCC ShortCond", "OCC ShortCond" ] ] };

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

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
const bars = walk(1200, 7);
const n = bars.length;
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const idTimes = (items: { id?: string; time: unknown }[], id: string) => items.filter((m) => m.id === id).map((m) => m.time);
const idsOf = (items: { id?: string }[]) => [...new Set(items.map((m) => m.id))];
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;

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
const or = (a: boolean[], b: boolean[]) => a.map((f, i) => f || b[i]);
/** ta.rma with an SMA seed */
function rma(src: number[], len: number): number[] {
  const out: number[] = [];
  let prev = NaN;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(prev)) {
      if (!isNaN(src[i])) { sum += src[i]; count++; }
      prev = count === len ? sum / len : NaN;
    } else {
      prev = (prev * (len - 1) + src[i]) / len;
    }
    out.push(prev);
  }
  return out;
}
const highest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.max(...src.slice(i - len + 1, i + 1))));
const lowest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.min(...src.slice(i - len + 1, i + 1))));

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'muses-afl-script': muses, 'nadaraya-watson-trend': nwt, 'navier-cauchy-market-elasticity': ncme,
    'nexus-sentiment-risk-matrix': nexus, 'nlms-volatility-trail': nlms, 'normalized-candles-rsi': ncrsi,
    'normalized-qqe': nqqe, 'nova-statistical-filtering-oscillator': nova, nrtr, 'obv-custom-ma-strategy': obvMa,
    'open-close-cross': occ,
  };
  for (const [id, m] of Object.entries(mods)) it(id, () => expect(decls(m)).toEqual(SPEC[id]));
  it('normalized-quantitative-qualitative (same original as normalized-qqe)', () => expect(decls(nqqe2)).toEqual(SPEC['normalized-qqe']));
  it('open-close-cross-alerts-norepaint-version-by (same original as open-close-cross)', () =>
    expect(decls(occNrp)).toEqual(SPEC['open-close-cross']));
  it('exported objects carry the declarations', () => {
    expect(muses.MusesAflScript.alertConditions).toBe(muses.alertConditions);
    expect(nwt.NadarayaWatsonTrend.alertConditions).toBe(nwt.alertConditions);
    expect(ncme.NavierCauchyMarketElasticity.alertConditions).toBe(ncme.alertConditions);
    expect(nexus.NexusSentimentRiskMatrix.alertConditions).toBe(nexus.alertConditions);
    expect(nlms.NlmsVolatilityTrail.alertConditions).toBe(nlms.alertConditions);
    expect(ncrsi.NormalizedCandlesRsi.alertConditions).toBe(ncrsi.alertConditions);
    expect(nqqe.NormalizedQQE.alertConditions).toBe(nqqe.alertConditions);
    expect(nqqe2.NormalizedQuantitativeQualitative.alertConditions).toBe(nqqe2.alertConditions);
    expect(nova.NovaStatisticalFilteringOscillator.alertConditions).toBe(nova.alertConditions);
    expect(nrtr.NRTR.alertConditions).toBe(nrtr.alertConditions);
    expect(obvMa.ObvCustomMaStrategy.alertConditions).toBe(obvMa.alertConditions);
    expect(occ.OpenCloseCross.alertConditions).toBe(occ.alertConditions);
    expect(occNrp.OpenCloseCrossAlertsNRP.alertConditions).toBe(occNrp.alertConditions);
    expect(multpile.MultpileStrategies.hasAlertFunction).toBe(true);
  });
});

describe('multpile-strategies alert() calls', () => {
  it('one once_per_bar_close call per bar with the status text, also without the status label', () => {
    for (const showStatus of [true, false]) {
      const r = multpile.calculate(bars, { showStatus });
      expect(r.alertCalls.map((c) => c.time)).toEqual(bars.map((b) => b.time));
      expect(new Set(r.alertCalls.map((c) => c.freq))).toEqual(new Set(['once_per_bar_close']));
      for (const c of r.alertCalls) {
        expect(c.message).toMatch(/^Estatus segun estrategia\nInfo ADX: .*\nInfo monitor: .*\nInfo general:\n/s);
      }
    }
    // the message of the last bar is the text of the status label (label title '\t Estatus segun estrategia\n\t')
    const r = multpile.calculate(bars, {}) as ReturnType<typeof multpile.calculate> & { labels?: { text: string }[] };
    const last = r.alertCalls[n - 1].message.replace('Estatus segun estrategia\n', '');
    expect(r.labels?.some((l) => l.text === '\t Estatus segun estrategia\n\t' + last)).toBe(true);
  });
});

describe('alert conditions recomputed from the original expressions', () => {
  it('muses-afl-script: trend changes of the filter', () => {
    const r = muses.calculate(bars);
    const z = vals(r.plots.plot0);
    const trend: number[] = [];
    let t = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0 && gt(z[i], z[i - 1])) t = 1;
      else if (i > 0 && lt(z[i], z[i - 1])) t = -1;
      trend.push(t);
    }
    const up = trend.map((v, i) => i > 0 && v === 1 && trend[i - 1] === -1);
    const dn = trend.map((v, i) => i > 0 && v === -1 && trend[i - 1] === 1);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(muses.calculate(bars, { showSignals: false }).alerts.every((a) => a.times.length === 0)).toBe(true);
  });

  it('nadaraya-watson-trend: kernel reversals and band crosses', () => {
    const r = nwt.calculate(bars, { showBands: true });
    const nw = vals(r.plots.plot0);
    const up = vals(r.plots.plot7);
    const dn = vals(r.plots.plot8);
    const valid = (i: number) => i > 1 && !isNaN(nw[i]) && !isNaN(nw[i - 1]) && !isNaN(nw[i - 2]);
    const bull = nw.map((v, i) => valid(i) && nw[i - 1] < nw[i - 2] && v > nw[i - 1]);
    const bear = nw.map((v, i) => valid(i) && nw[i - 1] > nw[i - 2] && v < nw[i - 1]);
    expect(times(r, 0)).toEqual(timeAt(bars, bull));
    expect(times(r, 1)).toEqual(timeAt(bars, bear));
    expect(times(r, 2)).toEqual(timeAt(bars, or(bull, bear)));
    expect(times(r, 3)).toEqual(timeAt(bars, xover(close, up)));
    expect(times(r, 4)).toEqual(timeAt(bars, xunder(close, dn)));
    for (let k = 0; k < 5; k++) expect(times(r, k).length).toBeGreaterThan(0);
    // the band crosses do not depend on the bands being shown
    expect(nwt.calculate(bars).alerts).toEqual(r.alerts);
  });

  it('navier-cauchy-market-elasticity: stress crossing the bands', () => {
    const r = ncme.calculate(bars);
    const s = vals(r.plots.plot1);
    const ub = vals(r.plots.plot3);
    const lb = vals(r.plots.plot4);
    const ub2 = vals(r.plots.plot5);
    const lb2 = vals(r.plots.plot6);
    expect(times(r, 0)).toEqual(timeAt(bars, xover(s, ub)));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(s, lb)));
    expect(times(r, 2)).toEqual(timeAt(bars, xover(s, ub2)));
    expect(times(r, 3)).toEqual(timeAt(bars, xunder(s, lb2)));
    for (let k = 0; k < 4; k++) expect(times(r, k).length).toBeGreaterThan(0);
  });

  it('nexus-sentiment-risk-matrix: risk flip with the sentiment on the same side of 50', () => {
    const r = nexus.calculate(bars);
    const sentiment = vals(r.plots.plot1);
    const len = 22;
    const tr = bars.map((b, i) => (i === 0 ? b.high - b.low
      : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
    const atr = rma(tr, len);
    const hh = highest(high, len);
    const ll = lowest(low, len);
    const dir: number[] = [];
    let d = 1;
    for (let i = 0; i < n; i++) {
      const chandLong = hh[i] - atr[i] * 3;
      const chandShort = ll[i] + atr[i] * 3;
      d = gt(close[i], isNaN(chandShort) ? high[i] : chandShort) ? 1 : lt(close[i], isNaN(chandLong) ? low[i] : chandLong) ? -1 : d;
      dir.push(d);
    }
    const buy = dir.map((v, i) => i > 0 && gt(v - dir[i - 1], 0) && gt(sentiment[i], 50));
    const sell = dir.map((v, i) => i > 0 && lt(v - dir[i - 1], 0) && lt(sentiment[i], 50));
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });

  it('nlms-volatility-trail: trail crossing its previous value', () => {
    const r = nlms.calculate(bars);
    const trail = vals(r.plots.plot0);
    const prev = trail.map((_, i) => (i > 0 ? trail[i - 1] : NaN));
    expect(times(r, 0)).toEqual(timeAt(bars, xover(trail, prev)));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(trail, prev)));
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
  });

  it('normalized-candles-rsi: normalised close crossings and divergences', () => {
    const r = ncrsi.calculate(bars, { calculateDivergence: true });
    const byTime = new Map(r.plotCandles.ffdNormalizedCandles.map((c) => [c.time, c.close]));
    const nc = bars.map((b) => byTime.get(b.time) ?? NaN);
    expect(times(r, 2)).toEqual(timeAt(bars, xover(nc, 50)));
    expect(times(r, 3)).toEqual(timeAt(bars, xunder(nc, 50)));
    expect(times(r, 4)).toEqual(timeAt(bars, xover(nc, 70)));
    expect(times(r, 5)).toEqual(timeAt(bars, xunder(nc, 30)));
    for (let k = 2; k < 6; k++) expect(times(r, k).length).toBeGreaterThan(0);
    // bullCond / bearCond: the bars whose Bull / Bear label is drawn 5 bars back (offset = -lookbackRight)
    const idx = new Map(bars.map((b, i) => [b.time, i]));
    const back5 = (ts: number[]) => ts.map((t) => bars[(idx.get(t) as number) - 5].time);
    expect(back5(times(r, 0))).toEqual(r.markers.filter((m) => m.text === ' Bull ').map((m) => m.time));
    expect(back5(times(r, 1))).toEqual(r.markers.filter((m) => m.text === ' Bear ').map((m) => m.time));
    expect(times(r, 0).length + times(r, 1).length).toBeGreaterThan(0);
    // without "Calculate Divergence" the divergence conditions never fire
    const off = ncrsi.calculate(bars);
    expect(times(off, 0)).toEqual([]);
    expect(times(off, 1)).toEqual([]);
    expect(times(off, 2)).toEqual(times(r, 2));
  });

  const qqeFlags = (f: number[], s: number[]) => [
    or(xover(f, s), xunder(f, s)), xover(f, s), xunder(f, s), xover(f, 50), xunder(f, 50), xover(f, 60), xunder(f, 40),
    or(xunder(f, 60), xover(f, 40)),
  ];
  it('normalized-quantitative-qualitative: the 8 QQE conditions', () => {
    const r = nqqe2.calculate(bars);
    const f = vals(r.plots.plot0).map((v) => v + 50);
    const s = vals(r.plots.plot2).map((v) => v + 50);
    const flags = qqeFlags(f, s);
    for (let k = 0; k < 8; k++) {
      expect(times(r, k)).toEqual(timeAt(bars, flags[k]));
      expect(times(r, k).length).toBeGreaterThan(0);
    }
  });
  it('normalized-qqe: the 8 QQE conditions (after the drawn warm-up)', () => {
    const r = nqqe.calculate(bars);
    const warmup = 14 + 5;
    const f = vals(r.plots.plot0).map((v) => v + 50);
    const s = vals(r.plots.plot1).map((v) => v + 50);
    const flags = qqeFlags(f, s);
    const after = (ts: number[]) => ts.filter((t) => t > (bars[warmup].time as number));
    for (let k = 0; k < 8; k++) {
      expect(after(times(r, k))).toEqual(after(timeAt(bars, flags[k])));
      expect(times(r, k).length).toBeGreaterThan(0);
    }
    // the slow line follows the original (nz of the smoothed ranges): the same as the other port of this original
    const s2 = vals(nqqe2.calculate(bars).plots.plot2);
    for (let i = 100; i < n; i++) expect(s[i] - 50).toBeCloseTo(s2[i], 8);
  });

  it('nova-statistical-filtering-oscillator: crosses of the bands', () => {
    const r = nova.calculate(bars);
    const sm = vals(r.plots.plot3);
    expect(times(r, 0)).toEqual(timeAt(bars, xover(sm, vals(r.plots.plot1))));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(sm, vals(r.plots.plot0))));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });

  it('nrtr: direction changes', () => {
    const r = nrtr.calculate(bars);
    const warmup = 14;
    const up = vals(r.plots.plot0);
    const dir = up.map((v, i) => (i < warmup ? 0 : Number.isFinite(v) ? 1 : -1));
    const buy = dir.map((d, i) => i > warmup && d === 1 && dir[i - 1] === -1);
    const sell = dir.map((d, i) => i > warmup && d === -1 && dir[i - 1] === 1);
    const after = (ts: number[]) => ts.filter((t) => t > (bars[warmup].time as number));
    expect(after(times(r, 1))).toEqual(timeAt(bars, buy));
    expect(after(times(r, 2))).toEqual(timeAt(bars, sell));
    expect(times(r, 0)).toEqual([...times(r, 1), ...times(r, 2)].sort((a, b) => a - b));
    expect(times(r, 1).length).toBeGreaterThan(3);
    // the Buy / Sell markers are on the same bars
    expect(times(r, 1)).toEqual(r.markers.filter((m) => m.text === 'Buy').map((m) => m.time));
    expect(times(r, 2)).toEqual(r.markers.filter((m) => m.text === 'Sell').map((m) => m.time));
  });

  it('obv-custom-ma-strategy: MA and OBV crosses', () => {
    for (const maType of ['EMA', 'SMA', 'WMA'] as const) {
      const r = obvMa.calculate(bars, { maType });
      const obv = vals(r.plots.plot0);
      const s = vals(r.plots.plot1);
      const l = vals(r.plots.plot2);
      expect(times(r, 0)).toEqual(timeAt(bars, xover(s, l)));
      expect(times(r, 1)).toEqual(timeAt(bars, xunder(s, l)));
      expect(times(r, 2)).toEqual(timeAt(bars, xover(obv, s)));
      expect(times(r, 3)).toEqual(timeAt(bars, xunder(obv, s)));
      for (let k = 0; k < 4; k++) expect(times(r, k).length).toBeGreaterThan(0);
    }
  });

  it('open-close-cross-alerts-norepaint-version-by: crosses of the close / open averages', () => {
    const r = occNrp.calculate(bars);
    // pcd = 50000 * (closeAlt - openAlt) / avg (avg > 0): same sign as the difference of the two averages
    const pcd = vals(r.plots.plot1);
    const long = xover(pcd, 0);
    const short = xunder(pcd, 0);
    expect(times(r, 1)).toEqual(timeAt(bars, long));
    expect(times(r, 2)).toEqual(timeAt(bars, short));
    expect(times(r, 0)).toEqual(timeAt(bars, or(long, short)));
    expect(times(r, 1).length).toBeGreaterThan(3);
  });

  it('open-close-cross: crosses of the close / open MAs (after the drawn warm-up)', () => {
    const r = occ.calculate(bars);
    const warmup = 8 * 6;
    const pcd = vals(r.plots.pcdLine);
    const after = (ts: number[]) => ts.filter((t) => t > (bars[warmup].time as number));
    const long = xover(pcd, 0);
    const short = xunder(pcd, 0);
    expect(after(times(r, 1))).toEqual(after(timeAt(bars, long)));
    expect(after(times(r, 2))).toEqual(after(timeAt(bars, short)));
    expect(times(r, 0)).toEqual([...times(r, 1), ...times(r, 2)].sort((a, b) => a - b));
    expect(times(r, 1).length).toBeGreaterThan(3);
  });
});

describe('Style ids', () => {
  it('navier-cauchy-market-elasticity: extreme dots', () => {
    const r = ncme.calculate(bars);
    const s = vals(r.plots.plot1);
    const ub2 = vals(r.plots.plot5);
    const lb2 = vals(r.plots.plot6);
    expect(idsOf(r.markers).sort()).toEqual(['shape0', 'shape1']);
    expect(idTimes(r.markers, 'shape0')).toEqual(timeAt(bars, s.map((v, i) => gt(v, ub2[i]))));
    expect(idTimes(r.markers, 'shape1')).toEqual(timeAt(bars, s.map((v, i) => lt(v, lb2[i]))));
  });

  it('nova-statistical-filtering-oscillator: buy / sell circles', () => {
    const r = nova.calculate(bars);
    expect(idsOf(r.markers).sort()).toEqual(['shape0', 'shape1']);
    expect(idTimes(r.markers, 'shape0')).toEqual(times(r, 0));
    expect(idTimes(r.markers, 'shape1')).toEqual(times(r, 1));
  });

  it('oa-smes: entry / filtered entry / exit circles and their glows', () => {
    const r = oaSmes.calculate(bars);
    const smf = vals(r.plots.plot0);
    const entry = xover(smf, 0);
    const exit = xunder(smf, 100);
    const filtered = bars.map((b, i) => i > 0 && entry[i - 1] && gt(b.close, bars[i - 1].close));
    expect(idsOf(r.markers).sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']);
    expect(idTimes(r.markers, 'shape0')).toEqual(timeAt(bars, entry));
    expect(idTimes(r.markers, 'shape1')).toEqual(timeAt(bars, entry));
    expect(idTimes(r.markers, 'shape2')).toEqual(timeAt(bars, filtered));
    expect(idTimes(r.markers, 'shape3')).toEqual(timeAt(bars, filtered));
    expect(idTimes(r.markers, 'shape4')).toEqual(timeAt(bars, exit));
    expect(idTimes(r.markers, 'shape5')).toEqual(timeAt(bars, exit));
    const noGlow = oaSmes.calculate(bars, { showGlow: false });
    expect(idsOf(noGlow.markers).sort()).toEqual(['shape0', 'shape2', 'shape4']);
  });

  it('obv-ad-oscillators-with-dual-smoothing-options: the 4 bgcolor() calls', () => {
    const r = obvAd.calculate(bars, { showOBVJerkBG: true, showCDVJerkBG: true, stackBG: true });
    const ids = idsOf(r.bgColors);
    for (const id of ids) expect(['bgcolor0', 'bgcolor1', 'bgcolor2', 'bgcolor3']).toContain(id);
    expect(ids).toContain('bgcolor0');
    expect(ids).toContain('bgcolor1');
    // the stacked backgrounds: green (long) = bgcolor2, red (short) = bgcolor3
    const stacked = r.bgColors.filter((b) => b.id === 'bgcolor2' || b.id === 'bgcolor3');
    expect(new Set(stacked.filter((b) => b.id === 'bgcolor2').map((b) => b.color)).size).toBeLessThanOrEqual(1);
    const off = obvAd.calculate(bars, { showOBVJerkBG: false, showCDVJerkBG: true, stackBG: false });
    expect(idsOf(off.bgColors)).toEqual(['bgcolor1']);
  });

  it('nrtr: fills between ohlc4 and the long / short stop', () => {
    const r = nrtr.calculate(bars);
    expect(r.fills?.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([
      ['plot2', 'plot0', 'Long State Filling'],
      ['plot2', 'plot1', 'Short State Filling'],
    ]);
    expect(vals(r.plots.plot2)).toEqual(bars.map((b) => (b.open + b.high + b.low + b.close) / 4));
    expect(nrtr.plotConfig.find((p) => p.id === 'plot2')?.display).toBe('none');
    // each fill is coloured only while its trend is on
    const up = vals(r.plots.plot0);
    const longCols = (r.fills as { colors: string[] }[])[0].colors;
    const shortCols = (r.fills as { colors: string[] }[])[1].colors;
    for (let i = 14; i < n; i++) {
      expect(longCols[i] !== 'rgba(0,0,0,0)').toBe(Number.isFinite(up[i]));
      expect(shortCols[i] !== 'rgba(0,0,0,0)').toBe(!Number.isFinite(up[i]));
    }
  });

  it('open-close-cross-alerts-norepaint-version-by: alert circle and divergence labels', () => {
    const r = occNrp.calculate(bars, { showRegular: true, showHidden: true });
    const ids = idsOf(r.markers);
    for (const id of ids) expect(['shape0', 'shape1', 'shape2', 'shape3', 'shape4']).toContain(id);
    expect(idTimes(r.markers, 'shape0')).toEqual(times(r, 0));
    const look = (id: string) => r.markers.filter((m) => m.id === id).map((m) => [m.shape, m.text]);
    for (const [id, shape, text] of [['shape1', 'labelDown', 'Regular'], ['shape2', 'labelDown', 'hidden'],
      ['shape3', 'labelUp', 'Regular'], ['shape4', 'labelUp', 'hidden']]) {
      for (const x of look(id)) expect(x).toEqual([shape, text]);
    }
    expect(ids.length).toBeGreaterThan(2);
  });

  it('open-close-cross: alert circles and divergence markers', () => {
    const r = occ.calculate(bars, { showDivergence: true });
    const ids = idsOf(r.markers);
    for (const id of ids) expect(['shape0', 'shape1', 'shape2', 'shape3', 'shape4']).toContain(id);
    expect(idTimes(r.markers, 'shape0')).toEqual(times(r, 0));
    const textOf: Record<string, string> = { shape1: 'Bear Div', shape2: 'H.Bear', shape3: 'Bull Div', shape4: 'H.Bull' };
    for (const m of r.markers) if (m.id !== 'shape0') expect(m.text).toBe(textOf[m.id as string]);
    expect(ids.length).toBeGreaterThan(2);
  });
});
