/**
 * Community ports, batch 01: the alertconditions (`alerts`) and alert() calls (`alertCalls`) of their originals,
 * checked against the original expressions computed again here on seeded synthetic bars (or against the outputs that
 * draw the same condition), and the Style output ids on the emitted markers / background colours.
 */

import { describe, it, expect } from 'vitest';
import { str, ta, Series, type Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as acd from '../../src/community/adaptive-convergence-divergence';
import * as aefp from '../../src/community/adaptive-ehlers-filtered-percentile';
import * as aet from '../../src/community/adaptive-entropy-trend';
import * as aff from '../../src/community/adaptive-friction-filter';
import * as ahma from '../../src/community/adaptive-hull-ma';
import * as akr from '../../src/community/adaptive-kinetic-ribbon';
import * as amts from '../../src/community/adaptive-ml-trailing-stop';
import * as apz from '../../src/community/adaptive-pivot-zones';
import * as azs from '../../src/community/adaptive-rolling-z-score-channel';
import * as atc from '../../src/community/adaptive-trend-channel';
import * as atf from '../../src/community/adaptive-trend-flow';
import * as avs from '../../src/community/adaptive-volatility-scaled-oscillator';
import * as adh from '../../src/community/advanced-dual-hull-cross-suite-v6-precision-signals';
import * as amp from '../../src/community/advanced-macd-pro-t3-themed';
import * as avd from '../../src/community/advanced-volume-driven-breakout-signals';
import * as adx from '../../src/community/adx-di-gu5';

/** The alertconditions of the originals (id, title, message) */
const SPEC: Record<string, { id: string; title: string; message: string }[]> = {
 "adaptive-convergence-divergence": [
  {
   "id": "alert0",
   "title": "Bullish 🐂",
   "message": "Alert Fired!"
  },
  {
   "id": "alert1",
   "title": "Bearish 🐻",
   "message": "Alert Fired!"
  },
  {
   "id": "alert2",
   "title": "🐂 Bulls ⚔️ Bears 🐻",
   "message": "Alert Fired!"
  }
 ],
 "adaptive-ehlers-filtered-percentile": [
  {
   "id": "alert0",
   "title": "Long Signal",
   "message": "Adaptive Ehlers Filtered Percentile Long Signal on {{ticker}}"
  },
  {
   "id": "alert1",
   "title": "Short Signal",
   "message": "Adaptive Ehlers Filtered Percentile Short Signal on {{ticker}}"
  }
 ],
 "adaptive-entropy-trend": [
  {
   "id": "alert0",
   "title": "Bullish Trend Signal",
   "message": "Adaptive Entropy Trend: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert1",
   "title": "Bearish Trend Signal",
   "message": "Adaptive Entropy Trend: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert2",
   "title": "Trend Direction Changed",
   "message": "Adaptive Entropy Trend: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}"
  }
 ],
 "adaptive-friction-filter": [
  {
   "id": "alert0",
   "title": "Bullish Trend Signal",
   "message": "Adaptive Friction Filter: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert1",
   "title": "Bearish Trend Signal",
   "message": "Adaptive Friction Filter: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert2",
   "title": "Any Trend Change",
   "message": "Adaptive Friction Filter: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}"
  }
 ],
 "adaptive-kinetic-ribbon": [
  {
   "id": "alert0",
   "title": "Bullish Crossover",
   "message": "Adaptive Kinetic Ribbon: BULLISH crossover on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert1",
   "title": "Bearish Crossover",
   "message": "Adaptive Kinetic Ribbon: BEARISH crossover on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert2",
   "title": "Any Ribbon Crossover",
   "message": "Adaptive Kinetic Ribbon: Crossover detected! Check chart {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert3",
   "title": "Bullish Acceleration",
   "message": "Adaptive Kinetic Ribbon: BULLISH ACCELERATION on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert4",
   "title": "Bullish Deceleration",
   "message": "Adaptive Kinetic Ribbon: BULLISH DECELERATION on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert5",
   "title": "Bearish Acceleration",
   "message": "Adaptive Kinetic Ribbon: BEARISH ACCELERATION on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert6",
   "title": "Bearish Deceleration",
   "message": "Adaptive Kinetic Ribbon: BEARISH DECELERATION on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert7",
   "title": "Any Acceleration",
   "message": "Adaptive Kinetic Ribbon: ACCELERATION state entered on {{exchange}}:{{ticker}} - {{interval}}"
  },
  {
   "id": "alert8",
   "title": "Any Deceleration",
   "message": "Adaptive Kinetic Ribbon: DECELERATION state entered on {{exchange}}:{{ticker}} - {{interval}}"
  }
 ],
 "adaptive-ml-trailing-stop": [
  {
   "id": "alert0",
   "title": "Long Signal",
   "message": "KNN-KAMA Trailing Stop: Long Entry"
  },
  {
   "id": "alert1",
   "title": "Short Signal",
   "message": "KNN-KAMA Trailing Stop: Short Entry"
  }
 ],
 "adaptive-pivot-zones": [
  {
   "id": "alert0",
   "title": "Bullish Trend Change",
   "message": "Price crossed ABOVE mid pivot → Bullish bias"
  },
  {
   "id": "alert1",
   "title": "Bearish Trend Change",
   "message": "Price crossed BELOW mid pivot → Bearish bias"
  }
 ],
 "adaptive-rolling-z-score-channel": [
  {
   "id": "alert0",
   "title": "Break Above Upper",
   "message": "Closed above upper band"
  },
  {
   "id": "alert1",
   "title": "Break Below Lower",
   "message": "Closed below lower band"
  },
  {
   "id": "alert2",
   "title": "Re-Entry From Above",
   "message": "Closed back inside from above"
  },
  {
   "id": "alert3",
   "title": "Re-Entry From Below",
   "message": "Closed back inside from below"
  },
  {
   "id": "alert4",
   "title": "Basis Cross Up",
   "message": "Crossed above basis"
  },
  {
   "id": "alert5",
   "title": "Basis Cross Down",
   "message": "Crossed below basis"
  }
 ],
 "adaptive-trend-flow": [
  {
   "id": "alert0",
   "title": "Adaptive Trend Flow Long",
   "message": "Adaptive Trend Flow Long {{exchange}}:{{ticker}}"
  },
  {
   "id": "alert1",
   "title": "Adaptive Trend Flow Short",
   "message": "Adaptive Trend Flow Short {{exchange}}:{{ticker}}"
  }
 ],
 "advanced-macd-pro-t3-themed": [
  {
   "id": "alert0",
   "title": "MACD Crossed Above Signal",
   "message": "MACD ({{plot(\"MACD Line\")}}) crossed above signal line ({{plot(\"Signal Line\")}}). Value: {{plot(\"MACD Line\")[\"0\"]}}"
  },
  {
   "id": "alert1",
   "title": "MACD Crossed Below Signal",
   "message": "MACD ({{plot(\"MACD Line\")}}) crossed below signal line ({{plot(\"Signal Line\")}}). Value: {{plot(\"MACD Line\")[\"0\"]}}"
  },
  {
   "id": "alert2",
   "title": "MACD Histogram Crossed Above Zero",
   "message": "MACD Histogram ({{plot(\"MACD Histogram\")}}) crossed above zero line. Value: {{plot(\"MACD Histogram\")[\"0\"]}}"
  },
  {
   "id": "alert3",
   "title": "MACD Histogram Crossed Below Zero",
   "message": "MACD Histogram ({{plot(\"MACD Histogram\")}}) crossed below zero line. Value: {{plot(\"MACD Histogram\")[\"0\"]}}"
  },
  {
   "id": "alert4",
   "title": "MACD Crossed Above Zero",
   "message": "MACD Line ({{plot(\"MACD Line\")}}) crossed above zero line. Value: {{plot(\"MACD Line\")[\"0\"]}}"
  },
  {
   "id": "alert5",
   "title": "MACD Crossed Below Zero",
   "message": "MACD Line ({{plot(\"MACD Line\")}}) crossed below zero line. Value: {{plot(\"MACD Line\")[\"0\"]}}"
  },
  {
   "id": "alert6",
   "title": "MACD Crossed Above Extra T3 Signal",
   "message": "MACD ({{plot(\"MACD Line\")}}) crossed above extra T3 signal line ({{plot(\"Extra T3 Signal Line\")}}). Value: {{plot(\"MACD Line\")[\"0\"]}}"
  },
  {
   "id": "alert7",
   "title": "MACD Crossed Below Extra T3 Signal",
   "message": "MACD ({{plot(\"MACD Line\")}}) crossed below extra T3 signal line ({{plot(\"Extra T3 Signal Line\")}}). Value: {{plot(\"MACD Line\")[\"0\"]}}"
  },
  {
   "id": "alert8",
   "title": "Bullish MACD Divergence Detected",
   "message": "Bullish Divergence detected between Price (LL) and MACD Line (HL)."
  },
  {
   "id": "alert9",
   "title": "Bearish MACD Divergence Detected",
   "message": "Bearish Divergence detected between Price (HH) and MACD Line (LH)."
  },
  {
   "id": "alert10",
   "title": "Bullish Bar/Price Disagreement (MACD)",
   "message": "Price bar is bullish while MACD momentum is bearish (MACD<Signal)."
  },
  {
   "id": "alert11",
   "title": "Bearish Bar/Price Disagreement (MACD)",
   "message": "Price bar is bearish while MACD momentum is bullish (MACD>Signal)."
  }
 ],
 "advanced-volume-driven-breakout-signals": [
  {
   "id": "alert0",
   "title": "Volume Vigilante | AVDBS | Buy Volume",
   "message": "VV AVDBS: Buy Volume signal detected on {{ticker}}."
  },
  {
   "id": "alert1",
   "title": "Volume Vigilante | AVDBS | Sell Volume",
   "message": "VV AVDBS: Sell Volume signal detected on {{ticker}}."
  },
  {
   "id": "alert2",
   "title": "Volume Vigilante | AVDBS | Bullish Overextension",
   "message": "VV AVDBS: Bullish overextension detected on {{ticker}}."
  },
  {
   "id": "alert3",
   "title": "Volume Vigilante | AVDBS | Bearish Overextension",
   "message": "VV AVDBS: Bearish overextension detected on {{ticker}}."
  }
 ],
 "adx-di-gu5": [
  {
   "id": "alert0",
   "title": "Any Alert",
   "message": "Any Alert"
  },
  {
   "id": "alert1",
   "title": "Buy Weak Alert",
   "message": "Buy Weak Alert"
  },
  {
   "id": "alert2",
   "title": "Sell Weak Alert",
   "message": "Sell Weak Alert"
  },
  {
   "id": "alert3",
   "title": "Buy Strong Alert",
   "message": "Buy Strong Alert"
  },
  {
   "id": "alert4",
   "title": "Sell Strong Alert",
   "message": "Sell Strong Alert"
  },
  {
   "id": "alert5",
   "title": "Buy Close Alert",
   "message": "Buy Close Alert"
  },
  {
   "id": "alert6",
   "title": "Sell Close Alert",
   "message": "Sell Close Alert"
  }
 ]
};

/** The Style output ids of the originals */
const STYLE_IDS: Record<string, string[]> = {"adaptive-hull-ma": ["char0", "char1", "char2", "char3"], "adaptive-trend-channel": ["shape0", "shape1"], "adaptive-volatility-scaled-oscillator": ["bgcolor0", "bgcolor1"]};

const DAY = 86400;
const T0 = 1262304000;
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of daily bars (times in seconds) */
function walk(count: number, seed = 11, vol = 4, step = DAY): Bar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = Math.max(1, open + Math.sin(i / 120) * 0.3 + (rand() - 0.5) * vol);
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 2);
    bars.push({ time: T0 + i * step, open, high, low, close, volume: 1000 + Math.floor(rand() * 1000) });
    price = close;
  }
  return bars;
}

type Pt = { time: unknown; value: number };
const vals = (p: Pt[]) => p.map((x) => (Number.isFinite(x.value) ? x.value : NaN));
const timesWhere = (bars: Bar[], f: (i: number) => boolean) => bars.filter((_, i) => f(i)).map((b) => b.time as number);
const timesOf = (flags: boolean[], bars: Bar[]) => timesWhere(bars, (i) => flags[i]);
/** ta.crossover / ta.crossunder (exact comparisons; na on either bar gives false) */
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
const or = (...f: boolean[][]) => f[0].map((_v, i) => f.some((x) => x[i]));
const markerTimes = (markers: { time: unknown; position?: string; shape?: string }[], pos?: string, shape?: string) =>
  markers.filter((m) => (pos === undefined || m.position === pos) && (shape === undefined || m.shape === shape))
    .map((m) => m.time as number);
const close = (bars: Bar[]) => bars.map((b) => b.close);

/** Declarations equal to the spec, and on the exported indicator object */
function checkDecls(id: string, mod: { alertConditions: unknown }, obj: { alertConditions?: unknown }) {
  expect(mod.alertConditions).toEqual(SPEC[id]);
  expect(obj.alertConditions).toBe(mod.alertConditions);
}

describe('Adaptive Convergence Divergence: alertconditions', () => {
  const bars = walk(1200, 3);
  const res = acd.calculate(bars);
  it('declarations', () => checkDecls('adaptive-convergence-divergence', acd, acd.AdaptiveConvergenceDivergence));
  it('co, cu, co or cu', () => {
    const osc = vals(res.plots.plot0 as Pt[]);
    const sig = vals(res.plots.plot1 as Pt[]);
    const co = xover(osc, sig);
    const cu = xunder(osc, sig);
    expect(co.filter(Boolean).length).toBeGreaterThan(10);
    expect(res.alerts[0].times).toEqual(timesOf(co, bars));
    expect(res.alerts[1].times).toEqual(timesOf(cu, bars));
    expect(res.alerts[2].times).toEqual(timesOf(or(co, cu), bars));
  });
});

describe('Adaptive Ehlers Filtered Percentile: alertconditions', () => {
  const bars = walk(1200, 5);
  const res = aefp.calculate(bars);
  it('declarations', () => checkDecls('adaptive-ehlers-filtered-percentile', aefp, aefp.AdaptiveEhlersFilteredPercentile));
  it('regime changes of SQ', () => {
    const up = vals(res.plots.plot1 as Pt[]);
    const lo = vals(res.plots.plot2 as Pt[]);
    const c = close(bars);
    const sq: number[] = [];
    let s = 0;
    c.forEach((v, i) => {
      if (gt(v, up[i])) s = 1;
      else if (lt(v, lo[i])) s = -1;
      sq.push(s);
    });
    const long = sq.map((v, i) => v === 1 && i > 0 && sq[i - 1] !== 1);
    const short = sq.map((v, i) => v === -1 && i > 0 && sq[i - 1] !== -1);
    expect(long.filter(Boolean).length).toBeGreaterThan(5);
    expect(res.alerts[0].times).toEqual(timesOf(long, bars));
    expect(res.alerts[1].times).toEqual(timesOf(short, bars));
    expect(res.alerts[0].times).toEqual(markerTimes(res.markers, 'belowBar', 'triangleUp'));
    expect(res.alerts[1].times).toEqual(markerTimes(res.markers, 'aboveBar', 'triangleDown'));
  });
});

describe('Adaptive Entropy Trend: alertconditions', () => {
  const bars = walk(1200, 7);
  const res = aet.calculate(bars);
  it('declarations', () => checkDecls('adaptive-entropy-trend', aet, aet.AdaptiveEntropyTrend));
  it('trend turns of the inner bands', () => {
    const iu = vals(res.plots.plot1 as Pt[]);
    const il = vals(res.plots.plot3 as Pt[]);
    const d: number[] = [];
    let t = 0;
    bars.forEach((b, i) => {
      if (gt(b.close, iu[i])) t = 1;
      else if (lt(b.close, il[i])) t = -1;
      d.push(t);
    });
    const bull = d.map((v, i) => v === 1 && i > 0 && d[i - 1] !== 1);
    const bear = d.map((v, i) => v === -1 && i > 0 && d[i - 1] !== -1);
    expect(bull.filter(Boolean).length).toBeGreaterThan(3);
    expect(bear.filter(Boolean).length).toBeGreaterThan(3);
    expect(res.alerts[0].times).toEqual(timesOf(bull, bars));
    expect(res.alerts[1].times).toEqual(timesOf(bear, bars));
    expect(res.alerts[2].times).toEqual(timesOf(or(bull, bear), bars));
  });
});

describe('Adaptive Friction Filter: alertconditions', () => {
  const bars = walk(1200, 9);
  const res = aff.calculate(bars);
  it('declarations', () => checkDecls('adaptive-friction-filter', aff, aff.AdaptiveFrictionFilter));
  it('trend_dir turns from -1 to 1 and back', () => {
    const line = vals(res.plots.plot0 as Pt[]);
    const d: number[] = [];
    let t = 0;
    line.forEach((v, i) => {
      const p = i > 0 ? line[i - 1] : NaN;
      t = gt(v, p) ? 1 : lt(v, p) ? -1 : t;
      d.push(t);
    });
    const bull = d.map((v, i) => v === 1 && i > 0 && d[i - 1] === -1);
    const bear = d.map((v, i) => v === -1 && i > 0 && d[i - 1] === 1);
    expect(bull.filter(Boolean).length).toBeGreaterThan(5);
    expect(res.alerts[0].times).toEqual(timesOf(bull, bars));
    expect(res.alerts[1].times).toEqual(timesOf(bear, bars));
    expect(res.alerts[2].times).toEqual(timesOf(or(bull, bear), bars));
  });
});

describe('72s Adaptive HMA+: alert() calls and Style ids', () => {
  const bars = walk(1500, 13, 6);
  const res = ahma.calculate(bars);
  it('has alert() calls', () => {
    expect(ahma.hasAlertFunction).toBe(true);
    expect(ahma.AdaptiveHullMA.hasAlertFunction).toBe(true);
  });
  it('one call per signal character, message and freq of the original', () => {
    const byId = (id: string) => res.markers.filter((m) => m.id === id);
    expect(byId('char0').length).toBeGreaterThan(0);
    expect(byId('char1').length).toBeGreaterThan(0);
    expect(byId('char2').length).toBeGreaterThan(0);
    expect(byId('char3').length).toBeGreaterThan(0);
    const closeAt = (t: number) => bars.find((b) => b.time === t)!.close;
    for (const c of res.alertCalls) expect(c.freq).toBe('once_per_bar_close');
    const calls = (prefix: string) => res.alertCalls.filter((c) => c.message.startsWith(prefix));
    expect(calls('Possible Buy Signal at').map((c) => c.time)).toEqual(byId('char0').map((m) => m.time));
    expect(calls('Possible Sell Signal at').map((c) => c.time)).toEqual(byId('char1').map((m) => m.time));
    for (const c of calls('Possible Buy Signal at')) expect(c.message).toBe('Possible Buy Signal at' + str.tostring(closeAt(c.time)));
    const exits = [...calls('Price has just crossed down minor'), ...calls('Price has just crossed up minor')];
    expect(uniq(exits.map((c) => c.time)).sort((a, b) => a - b)).toEqual(byId('char2').map((m) => m.time));
    for (const c of exits) expect(c.message).toMatch(/^Price has just crossed (down|up) minor xHMA\+ at/);
    for (const c of exits) expect(c.message.endsWith(' at' + str.tostring(closeAt(c.time)))).toBe(true);
    const warns = [...calls('Price has just crossed above top'), ...calls('Price has just crossed below bottom')];
    expect(uniq(warns.map((c) => c.time)).sort((a, b) => a - b)).toEqual(byId('char3').map((m) => m.time));
  });
  it('warnings: high above / low below the outer zone, first bar', () => {
    const z = ahma.calculate(bars, { showZone: true });
    const top = vals(z.plots.topTL as Pt[]);
    const bot = vals(z.plots.botTL as Pt[]);
    const first = top.findIndex((v) => !isNaN(v)) + 1;
    const topW = (i: number) => bars[i].high > top[i];
    const botW = (i: number) => bars[i].low < bot[i];
    const want = timesWhere(bars, (i) => i >= first && ((topW(i) && !topW(i - 1)) || (botW(i) && !botW(i - 1))));
    expect(want.length).toBeGreaterThan(0);
    expect(z.markers.filter((m) => m.id === 'char3' && (m.time as number) >= (bars[first].time as number)).map((m) => m.time)).toEqual(want);
  });
  it('characters: ids of the spec, absolute price, character of the original', () => {
    const chars: Record<string, string> = { char0: '⬆', char1: '⬇', char2: 'ⓧ', char3: '⚠' };
    expect(res.markers.length).toBeGreaterThan(0);
    for (const m of res.markers) {
      expect(STYLE_IDS['adaptive-hull-ma']).toContain(m.id);
      expect(m.position).toBe('atPriceMiddle');
      expect(Number.isFinite(m.price)).toBe(true);
      expect(m.char).toBe(chars[m.id!]);
    }
  });
  it('fill "Plots Background" between the stop zone lines', () => {
    expect(res.fills![0]).toMatchObject({ plot1: 'stopupperTL', plot2: 'stoplowerTL', options: { title: 'Plots Background' } });
  });
});

describe('Adaptive Kinetic Ribbon: alertconditions', () => {
  const bars = walk(1200, 15);
  const res = akr.calculate(bars);
  it('declarations', () => checkDecls('adaptive-kinetic-ribbon', akr, akr.AdaptiveKineticRibbon));
  it('crosses and state triggers', () => {
    const f = vals(res.plots.plot0 as Pt[]);
    const s = vals(res.plots.plot1 as Pt[]);
    const up = f.map((v, i) => gt(v, s[i]));
    const acc = f.map((v, i) => i > 0 && gt(v, f[i - 1]));
    const trig = (st: (i: number) => boolean) => f.map((_v, i) => st(i) && !(i > 0 && st(i - 1)));
    const ba = trig((i) => up[i] && acc[i]);
    const bd = trig((i) => up[i] && !acc[i]);
    const ra = trig((i) => !up[i] && !acc[i]);
    const rd = trig((i) => !up[i] && acc[i]);
    const bc = xover(f, s);
    const rc = xunder(f, s);
    const want = [bc, rc, or(bc, rc), ba, bd, ra, rd, or(ba, ra), or(bd, rd)];
    want.forEach((w, k) => {
      expect(w.filter(Boolean).length).toBeGreaterThan(3);
      expect(res.alerts[k].times).toEqual(timesOf(w, bars));
    });
  });
});

describe('Adaptive ML Trailing Stop: alertconditions', () => {
  // swings of +-25 around the walk, so that the wide adaptive stop is crossed
  const bars = walk(800, 3).map((b, i) => {
    const d = 25 * Math.sin(i / 30);
    return { ...b, open: b.open + d, high: b.high + d, low: b.low + d, close: b.close + d };
  });
  const res = amts.calculate(bars);
  it('declarations', () => checkDecls('adaptive-ml-trailing-stop', amts, amts.AdaptiveMLTrailingStop));
  it('trend changes (the stop drawn on each bar)', () => {
    const ls = vals(res.plots.plot0 as Pt[]);
    const ss = vals(res.plots.plot1 as Pt[]);
    const tr = ls.map((v, i) => (!isNaN(v) ? 1 : !isNaN(ss[i]) ? -1 : 0));
    const long = tr.map((v, i) => v === 1 && i > 0 && tr[i - 1] === -1);
    const short = tr.map((v, i) => v === -1 && i > 0 && tr[i - 1] === 1);
    expect(long.filter(Boolean).length).toBeGreaterThan(1);
    expect(short.filter(Boolean).length).toBeGreaterThan(1);
    expect(res.alerts[0].times).toEqual(timesOf(long, bars));
    expect(res.alerts[1].times).toEqual(timesOf(short, bars));
    expect(res.alerts[0].times).toEqual(markerTimes(res.markers, 'belowBar', 'circle'));
    expect(res.alerts[1].times).toEqual(markerTimes(res.markers, 'aboveBar', 'circle'));
  });
});

describe('Adaptive Pivot Zones: alertconditions', () => {
  const bars = walk(1200, 19);
  const res = apz.calculate(bars);
  it('declarations', () => checkDecls('adaptive-pivot-zones', apz, apz.AdaptivePivotZones));
  it('close crosses the middle level', () => {
    const mid = vals(res.plots.plot1 as Pt[]);
    const c = close(bars);
    const up = xover(c, mid).map((v, i) => v && !isNaN(mid[i]));
    const dn = xunder(c, mid).map((v, i) => v && !isNaN(mid[i]));
    expect(up.filter(Boolean).length).toBeGreaterThan(10);
    expect(res.alerts[0].times).toEqual(timesOf(up, bars));
    expect(res.alerts[1].times).toEqual(timesOf(dn, bars));
  });
});

describe('Rolling Z-Score Channel: alertconditions', () => {
  const bars = walk(1200, 21);
  const res = azs.calculate(bars);
  it('declarations', () => checkDecls('adaptive-rolling-z-score-channel', azs, azs.AdaptiveRollingZScoreChannel));
  it('crosses of the bands and of the basis', () => {
    const up = vals(res.plots.plot9 as Pt[]);
    const lo = vals(res.plots.plot10 as Pt[]);
    const basis = vals(res.plots.plot13 as Pt[]);
    const c = close(bars);
    const want = [xover(c, up), xunder(c, lo), xunder(c, up), xover(c, lo), xover(c, basis), xunder(c, basis)];
    want.forEach((w, k) => {
      expect(w.filter(Boolean).length).toBeGreaterThan(2);
      expect(res.alerts[k].times).toEqual(timesOf(w, bars));
    });
    // the re-entry triangles are the same crosses
    expect(res.alerts[3].times).toEqual(markerTimes(res.markers, 'belowBar', 'triangleUp'));
    expect(res.alerts[2].times).toEqual(markerTimes(res.markers, 'aboveBar', 'triangleDown'));
  });
});

describe('Adaptive Trend Flow: alertconditions', () => {
  const bars = walk(1200, 23);
  const res = atf.calculate(bars);
  it('declarations', () => checkDecls('adaptive-trend-flow', atf, atf.AdaptiveTrendFlow));
  it("trend of the original's get_trend_state", () => {
    const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
    const typ = new Series(bars, (b) => (b.high + b.low + b.close) / 3);
    const fast = A(ta.ema(typ, 10));
    const slow = A(ta.ema(typ, 20));
    const sv = A(ta.ema(Series.fromArray(bars, A(ta.stdev(typ, 10))), 14));
    let lvl = NaN;
    let t = 0;
    const tr: number[] = [];
    bars.forEach((b, i) => {
      const basis = (fast[i] + slow[i]) / 2;
      const upper = basis + sv[i] * 2;
      const lower = basis - sv[i] * 2;
      if (isNaN(lvl)) {
        t = b.close > basis ? 1 : -1;
        lvl = t === 1 ? lower : upper;
      }
      if (t === 1) {
        if (b.close < lower) { t = -1; lvl = upper; } else lvl = lower;
      } else if (b.close > upper) { t = 1; lvl = lower; } else lvl = upper;
      tr.push(t);
    });
    const long = tr.map((v, i) => v === 1 && i > 0 && tr[i - 1] === -1);
    const short = tr.map((v, i) => v === -1 && i > 0 && tr[i - 1] === 1);
    expect(long.filter(Boolean).length).toBeGreaterThan(5);
    expect(res.alerts[0].times).toEqual(timesOf(long, bars));
    expect(res.alerts[1].times).toEqual(timesOf(short, bars));
  });
});

describe('Advanced Dual Hull Cross Suite: alert() calls', () => {
  const bars = walk(1200, 25);
  const res = adh.calculate(bars);
  it('has alert() calls', () => {
    expect(adh.hasAlertFunction).toBe(true);
    expect(adh.AdvancedDualHullCrossSuite.hasAlertFunction).toBe(true);
  });
  it('one call per cross, at the suite 2 line, once per bar close', () => {
    const h1 = vals(res.plots.plot0 as Pt[]);
    const h2 = vals(res.plots.plot1 as Pt[]);
    const want = bars.flatMap((b, i) => [
      ...(xover(h2, h1)[i] ? [{ time: b.time, message: 'Bullish Cross at ' + str.tostring(h2[i]), freq: 'once_per_bar_close' }] : []),
      ...(xunder(h2, h1)[i] ? [{ time: b.time, message: 'Bearish Cross at ' + str.tostring(h2[i]), freq: 'once_per_bar_close' }] : []),
    ]);
    expect(want.length).toBeGreaterThan(20);
    expect(res.alertCalls).toEqual(want);
  });
});

describe('Advanced MACD Pro T3: alertconditions', () => {
  const bars = walk(1200, 27);
  const all = {
    showSignalLine: true, alertSignalCross: true, alertHistZeroCross: true, alertMacdZeroCross: true, alertBullDiv: true,
    alertBearDiv: true, alertDisagreement: true, alertT3SignalCrossMacd: true,
  };
  const res = amp.calculate(bars, all);
  it('declarations', () => checkDecls('advanced-macd-pro-t3-themed', amp, amp.AdvancedMacdProT3Themed));
  it('every condition with its alert input on', () => {
    const macd = vals(res.plots.plot0 as Pt[]);
    const sig = vals(res.plots.plot1 as Pt[]);
    const t3 = vals(res.plots.plot2 as Pt[]);
    const hist = vals(res.plots.plot3 as Pt[]);
    const bullDis = bars.map((b, i) => gt(sig[i], macd[i]) && gt(b.close, b.open));
    const bearDis = bars.map((b, i) => gt(macd[i], sig[i]) && gt(b.open, b.close));
    const want = [xover(macd, sig), xunder(macd, sig), xover(hist, 0), xunder(hist, 0), xover(macd, 0), xunder(macd, 0),
      xover(macd, t3), xunder(macd, t3)];
    want.forEach((w, k) => {
      expect(w.filter(Boolean).length).toBeGreaterThan(3);
      expect(res.alerts[k].times).toEqual(timesOf(w, bars));
    });
    // divergences: the Bull / Bear labels; disagreements: the bottom / top circles
    expect(res.alerts[8].times.length).toBeGreaterThan(0);
    expect(res.alerts[9].times.length).toBeGreaterThan(0);
    expect(res.alerts[8].times).toEqual(markerTimes(res.markers, 'bottom', 'labelUp'));
    expect(res.alerts[9].times).toEqual(markerTimes(res.markers, 'top', 'labelDown'));
    expect(res.alerts[10].times).toEqual(timesOf(bullDis, bars));
    expect(res.alerts[11].times).toEqual(timesOf(bearDis, bars));
    expect(res.alerts[10].times).toEqual(markerTimes(res.markers, 'bottom', 'circle'));
  });
  it('default inputs: hidden signal line and the alerts that are off give no bar', () => {
    const def = amp.calculate(bars);
    for (const k of [0, 1, 4, 5, 6, 7, 10, 11]) expect(def.alerts[k].times).toEqual([]);
    for (const k of [2, 3, 8, 9]) expect(def.alerts[k].times).toEqual(res.alerts[k].times);
  });
});

describe('Advanced Volume-Driven Breakout Signals: alertconditions', () => {
  const bars = walk(1200, 7);
  // volume spikes on up and down candles (above 4 x and 2 x the volume VWMA)
  for (let i = 100; i < bars.length; i += 37) bars[i] = { ...bars[i], volume: 9000 + i };
  for (let i = 120; i < bars.length; i += 41) bars[i] = { ...bars[i], volume: 4000 + i };
  const on = {
    enableBuyVolumeAlerts: true, enableSellVolumeAlerts: true, enableBullishOverextensionAlerts: true,
    enableBearishOverextensionAlerts: true, showOverextensionSignals: true,
  };
  const res = avd.calculate(bars, on);
  it('declarations', () => checkDecls('advanced-volume-driven-breakout-signals', avd, avd.AdvancedVolumeDrivenBreakoutSignals));
  it('the bars of the signal markers', () => {
    const want = [
      markerTimes(res.markers, 'belowBar', 'labelUp'), markerTimes(res.markers, 'aboveBar', 'labelDown'),
      markerTimes(res.markers, 'aboveBar', 'arrowDown'), markerTimes(res.markers, 'belowBar', 'arrowUp'),
    ];
    want.forEach((w, k) => {
      expect(w.length).toBeGreaterThan(2);
      expect(res.alerts[k].times).toEqual(w);
    });
  });
  it('buy / sell volume: breakout of the split volume above 2 x its VWMA, no spike', () => {
    const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
    const v = bars.map((b) => b.volume as number);
    const vS = Series.fromArray(bars, v);
    const bull = bars.map((b, i) => (gt(b.close, b.open) ? v[i] : 0));
    const bear = bars.map((b, i) => (gt(b.open, b.close) ? v[i] : 0));
    const vwma = (x: number[]) => A(ta.vwma(Series.fromArray(bars, x), 20, vS));
    const vsMa = vwma(v);
    const spike = or(xover(v, vsMa.map((x) => x * 4)), xover(v, vsMa.map((x) => x * 2)));
    const buy = xover(bull, vwma(bull).map((x) => x * 2)).map((x, i) => x && !spike[i]);
    const sell = xover(bear, vwma(bear).map((x) => x * 2)).map((x, i) => x && !spike[i]);
    expect(res.alerts[0].times).toEqual(timesOf(buy, bars));
    expect(res.alerts[1].times).toEqual(timesOf(sell, bars));
  });
  it('default inputs: overextension alerts off', () => {
    const def = avd.calculate(bars);
    expect(def.alerts[2].times).toEqual([]);
    expect(def.alerts[3].times).toEqual([]);
    expect(def.alerts[0].times).toEqual(res.alerts[0].times);
  });
});

describe('ADX Di+ Di- [Gu5]: alertconditions', () => {
  const bars = walk(1500, 5, 8);
  const res = adx.calculate(bars);
  /** The original's rules on the plotted ADX / DI */
  function expected(lastConfirmed = true) {
    const sig = vals(res.plots.adx as Pt[]);
    const dp = vals(res.plots.diPlus as Pt[]);
    const dm = vals(res.plots.diMinus as Pt[]);
    const n = bars.length;
    const rng = sig.map((v) => v <= 20);
    const up = dp.map((v, i) => v >= dm[i]);
    const dn = dm.map((v, i) => v > dp[i]);
    const p = (a: boolean[], i: number) => i > 0 && a[i - 1];
    const out: boolean[][] = [[], [], [], [], [], [], []];
    let prev = NaN;
    for (let i = 0; i < n; i++) {
      const sUp = i > 0 && sig[i] > sig[i - 1];
      const cross = xover(dp, dm)[i] || xunder(dp, dm)[i];
      const eL = (!rng[i] && up[i] && sUp && !p(up, i)) || (!rng[i] && up[i] && sUp && sig[i] > 20 && p(rng, i));
      const eS = (!rng[i] && dn[i] && sUp && !p(dn, i)) || (!rng[i] && dn[i] && sUp && sig[i] > 20 && p(rng, i));
      const eLS = !rng[i] && up[i] && sUp && dp[i] >= 35;
      const eSS = !rng[i] && dn[i] && sUp && dm[i] > 35;
      const xL = (cross && p(up, i)) || (rng[i] && !p(rng, i));
      const xS = (cross && p(dn, i)) || (rng[i] && !p(rng, i));
      const ne = (v: number) => !isNaN(prev) && prev !== v;
      let c = isNaN(prev) ? 0 : prev;
      if (ne(1) && eLS) c = 1;
      else if (ne(-1) && eSS) c = -1;
      else if (ne(0.5) && eL) c = 0.5;
      else if (ne(-0.5) && eS) c = -0.5;
      else if (ne(0) && (xL || xS)) c = 0;
      const conf = i < n - 1 || lastConfirmed;
      const f = [
        conf && ne(0.5) && c === 0.5, conf && ne(-0.5) && c === -0.5, conf && ne(1) && c === 1, conf && ne(-1) && c === -1,
        conf && (prev === 0.5 || prev === 1) && c === 0, conf && (prev === -0.5 || prev === -1) && c === 0,
      ];
      prev = c;
      out[0].push(f.some(Boolean));
      f.forEach((x, k) => out[k + 1].push(x));
    }
    return out.map((f) => timesOf(f, bars));
  }
  it('declarations', () => checkDecls('adx-di-gu5', adx, adx.ADXDiGu5));
  it('trend state changes', () => {
    const want = expected();
    want.forEach((w, k) => {
      expect(w.length).toBeGreaterThan(2);
      expect(res.alerts[k].times).toEqual(w);
    });
  });
  it('barstate.isconfirmed: nothing on an open last bar', () => {
    // bars up to an alert bar: it fires there when the last bar is closed, not while it is open
    const at = bars.findIndex((b) => b.time === res.alerts[1].times[3]);
    const cut = bars.slice(0, at + 1);
    const last = cut[cut.length - 1].time as number;
    const closed = adx.calculate(cut);
    expect(closed.alerts[1].times.includes(last)).toBe(true);
    expect(closed.alerts[1].triggered).toBe(true);
    const open = adx.calculate(cut, {}, { lastBarConfirmed: false } as ChartContext);
    for (const a of open.alerts) expect(a.times.includes(last)).toBe(false);
    for (const a of open.alerts) expect(a.triggered).toBe(false);
    expect(open.alerts[1].times).toEqual(closed.alerts[1].times.slice(0, -1));
  });
});

describe('Style ids of the originals', () => {
  it('Adaptive Trend Channel: shape0 on the bearish flips, shape1 on the bullish flips', () => {
    const bars = walk(1500, 33, 6);
    const res = atc.calculate(bars);
    const ids = res.markers.map((m) => m.id);
    expect(ids.filter((x) => x === 'shape0').length).toBeGreaterThan(0);
    expect(ids.filter((x) => x === 'shape1').length).toBeGreaterThan(0);
    for (const m of res.markers) expect(STYLE_IDS['adaptive-trend-channel']).toContain(m.id);
    for (const m of res.markers) expect(m.color).toBe(m.id === 'shape0' ? atc.defaultInputs.downtrendPaint : atc.defaultInputs.uptrendPaint);
  });
  it('Adaptive Volatility Scaled Oscillator: bgcolor0 above z = 2, bgcolor1 below z = -2', () => {
    const bars = walk(1500, 35, 6);
    for (let i = 300; i < bars.length; i += 97) bars[i] = { ...bars[i], volume: 40000 };
    for (let i = 350; i < bars.length; i += 97) bars[i] = { ...bars[i], volume: 20 };
    const res = avs.calculate(bars, { metricMeasure: 'Volume' } as Partial<avs.AdaptiveVolatilityScaledOscillatorInputs>);
    const z = vals(res.plots.plot0 as Pt[]);
    const hi = res.bgColors.filter((b) => b.id === 'bgcolor0');
    const lo = res.bgColors.filter((b) => b.id === 'bgcolor1');
    expect(hi.length).toBeGreaterThan(0);
    expect(lo.length).toBeGreaterThan(0);
    for (const b of res.bgColors) expect(STYLE_IDS['adaptive-volatility-scaled-oscillator']).toContain(b.id);
    expect(hi.map((b) => b.time)).toEqual(timesWhere(bars, (i) => gt(z[i], 2)));
    expect(lo.map((b) => b.time)).toEqual(timesWhere(bars, (i) => lt(z[i], -2)));
  });
});

const uniq = (a: number[]) => [...new Set(a)];
