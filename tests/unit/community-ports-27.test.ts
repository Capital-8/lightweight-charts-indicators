/**
 * Community ports, batch 27: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers / background colours / bar colours.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as oisMfi from '../../src/community/open-interest-stochastic-money-flow-index';
import * as oiSuite from '../../src/community/open-interest-suite-by-leviathan';
import * as orb2 from '../../src/community/opening-range-breakout-with-2-profit-targets';
import * as ott from '../../src/community/optimized-trend-tracker';
import * as orbAlgo from '../../src/community/orb-algo-flux-charts';
import * as obDetector from '../../src/community/order-block-detector';
import * as obFinder from '../../src/community/order-block-finder';
import * as obSignals from '../../src/community/order-blocks-signals';
import * as obVd from '../../src/community/order-blocks-volume-delta-3d-flux-charts';
import * as oscMatrix from '../../src/community/oscillator-matrix';
import * as ottBands from '../../src/community/ott-bands';
import * as otto from '../../src/community/otto';
import * as pr2 from '../../src/community/peak-reversal-v2';
import * as pr3 from '../../src/community/peak-reversal-v3';
import * as pbb from '../../src/community/percentile-based-bb-trend-mattes';
import { makeBars } from './community-top100.helpers';
import { fixtureContext } from './community-other-symbols.helpers';

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
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const uniq = <T>(a: T[]) => [...new Set(a)];
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const idTimes = (items: { id?: string; time: unknown }[], id: string) => items.filter((m) => m.id === id).map((m) => m.time);
/** Times of `alerts[k]` from bar `from` on */
const from = (times: number[], list: Bar[], start: number) => times.filter((t) => t >= (list[start].time as number));

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
const lag = (a: number[], k: number) => a.map((_v, i) => (i >= k ? a[i - k] : NaN));

describe('Open Interest Stochastic Money Flow Index', () => {
  const fx = makeBars(1500, 86400);
  const r = oisMfi.calculate(fx as any, {}, fixtureContext(1500));
  it('declares the alertconditions of the original', () => {
    expect(decls(oisMfi)).toEqual([['alert0', 'Buy Signal', 'Buy Signal '], ['alert1', 'Sell Signal', 'Sell Signal ']]);
    expect(oisMfi.OpenInterestStochasticMoneyFlowIndex.alertConditions).toBe(oisMfi.alertConditions);
  });
  it('possig == 1 when K > D, possig == -1 otherwise', () => {
    const k = vals(r.plots.plot0), d = vals(r.plots.plot1);
    const buy = k.map((v, i) => gt(v, d[i]));
    expect(r.alerts[0].times).toEqual(timeAt(fx as any, buy));
    expect(r.alerts[1].times).toEqual(timeAt(fx as any, buy.map((x) => !x)));
    expect(r.alerts[0].times.length).toBeGreaterThan(100);
    expect(r.alerts[1].times.length).toBeGreaterThan(100);
  });
});

describe('Open Interest Suite: Style ids of the bgcolor / barcolor outputs', () => {
  const fx = makeBars(1500, 86400);
  const r = oiSuite.calculate(fx as any, { colBg: true, colCha: true, showLoi: true, showLod: true }, fixtureContext(1500));
  it('every background and bar colour has the id of its call', () => {
    expect(r.bgColors.length).toBeGreaterThan(0);
    expect(r.barColors.length).toBeGreaterThan(0);
    expect(uniq(r.bgColors.map((c) => c.id)).sort()).toEqual(['bgcolor0', 'bgcolor1']);
    expect(uniq(r.barColors.map((c) => c.id)).sort()).toEqual(['barcolor0', 'barcolor1']);
    // the same bars for the background and the bar colours of one side
    expect(idTimes(r.bgColors, 'bgcolor0')).toEqual(idTimes(r.barColors, 'barcolor0'));
    expect(idTimes(r.bgColors, 'bgcolor1')).toEqual(idTimes(r.barColors, 'barcolor1'));
  });
});

describe('Opening Range Breakout with 2 Profit Targets: Style ids of the plotchar outputs', () => {
  const fx = makeBars(4000, 900);
  const r = orb2.calculate(fx as any, { sessNum: 0 }, { timeframe: '15', timezone: 'Etc/UTC' });
  it('the "1" / "2" characters carry char0..char3 by side and target', () => {
    expect(r.markers.length).toBeGreaterThan(0);
    const want: Record<string, [string, string]> = {
      char0: ['aboveBar', '1'], char1: ['belowBar', '1'], char2: ['aboveBar', '2'], char3: ['belowBar', '2'],
    };
    for (const m of r.markers) {
      expect(Object.keys(want)).toContain(m.id);
      expect([m.position, m.text]).toEqual(want[m.id!]);
    }
    expect(uniq(r.markers.map((m) => m.id)).length).toBeGreaterThan(1);
  });
});

describe('Optimized Trend Tracker', () => {
  const r = ott.calculate(bars, { showSignalsC: true, showSignalsR: true });
  const mavg = vals(r.plots.plot0);
  const ott2 = vals(r.plots.plot1);
  const ott3 = lag(ott2, 1);
  // plotted from bar 11 (MAvg) / 13 (OTT[2]); the crosses below are complete from bar 15
  const S = 15;
  it('declares the 9 alertconditions of the original', () => {
    expect(decls(ott)).toEqual([
      ['alert0', 'Color ALARM', 'OTT Has Changed Color!'],
      ['alert1', 'GREEN ALERT', 'OTT GREEN BUY SIGNAL!'],
      ['alert2', 'RED ALERT', 'OTT RED SELL SIGNAL!'],
      ['alert3', 'Cross Alert', 'OTT - Support Line Crossing!'],
      ['alert4', 'Crossover Alarm', 'Support Line BUY SIGNAL!'],
      ['alert5', 'Crossunder Alarm', 'Support Line SELL SIGNAL!'],
      ['alert6', 'Price Cross Alert', 'OTT - Price Crossing!'],
      ['alert7', 'Price Crossover Alarm', 'PRICE OVER OTT - BUY SIGNAL!'],
      ['alert8', 'Price Crossunder Alarm', 'PRICE UNDER OTT - SELL SIGNAL!'],
    ]);
  });
  it('the conditions are the crosses of OTT[2] / OTT[3], MAvg / OTT[2] and close / OTT[2]', () => {
    const want = [
      or(xover(ott2, ott3), xunder(ott2, ott3)), xover(ott2, ott3), xunder(ott2, ott3),
      or(xover(mavg, ott2), xunder(mavg, ott2)), xover(mavg, ott2), xunder(mavg, ott2),
      or(xover(close, ott2), xunder(close, ott2)), xover(close, ott2), xunder(close, ott2),
    ];
    want.forEach((flags, k) => {
      expect(from(r.alerts[k].times, bars, S)).toEqual(from(timeAt(bars, flags), bars, S));
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
    });
  });
  it('the Buy / Sell labels carry the ids of their plotshape (support, price, colour change)', () => {
    const ids = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5'];
    for (const m of r.markers) expect(ids).toContain(m.id);
    const pairs: Array<[string, number]> = [['shape0', 4], ['shape1', 5], ['shape2', 7], ['shape3', 8], ['shape4', 1], ['shape5', 2]];
    for (const [id, k] of pairs) expect(from(idTimes(r.markers, id) as number[], bars, S)).toEqual(from(r.alerts[k].times, bars, S));
  });
  it('the two highlighter fills are between the OHLC4 plot and the OTT plot, with the titles of the original', () => {
    expect(r.fills!.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([
      ['plot2', 'plot1', 'UpTrend Highligter'], ['plot2', 'plot1', 'DownTrend Highligter'],
    ]);
    expect(ott.plotConfig.find((p) => p.id === 'plot2')!.display).toBe('none');
    expect(r.plots.plot2[5].value).toBeCloseTo((bars[5].open + bars[5].high + bars[5].low + bars[5].close) / 4, 10);
  });
});

describe('ORB Algo | Flux Charts', () => {
  const fx = makeBars(4000, 900);
  const r = orbAlgo.calculate(fx as any, {}, { timeframe: '15' });
  it('declares the alertconditions of the original', () => {
    expect(decls(orbAlgo)).toEqual([
      ['alert0', 'Buy / Sell', 'Alert Fired!'], ['alert1', 'Take Profit', 'Alert Fired!'], ['alert2', 'Stop Loss', 'Alert Fired!'],
    ]);
  });
  it('Buy / Sell on the entry bars, Take Profit on the TP markers, Stop Loss on the SL markers', () => {
    const entries = r.labels.filter((l) => l.text === 'Buy' || l.text === 'Sell').map((l) => l.time).sort((a, b) => a - b);
    expect(entries.length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(entries);
    const tp = uniq(r.markers.filter((m) => m.text!.startsWith('TP')).map((m) => m.time)).sort((a, b) => a - b);
    expect(tp.length).toBeGreaterThan(0);
    expect(r.alerts[1].times).toEqual(tp);
    const sl = r.markers.filter((m) => m.text === 'SL').map((m) => m.time);
    expect(sl.length).toBeGreaterThan(0);
    expect(r.alerts[2].times).toEqual(sl);
  });
  it('the markers carry the id of their plotshape (side by trade direction)', () => {
    const want: Record<string, [string, string]> = {
      shape0: ['TP 1', 'aboveBar'], shape1: ['TP 1', 'belowBar'], shape2: ['TP 2', 'aboveBar'], shape3: ['TP 2', 'belowBar'],
      shape4: ['TP 3', 'aboveBar'], shape5: ['TP 3', 'belowBar'], shape6: ['SL', 'belowBar'], shape7: ['SL', 'aboveBar'],
      shape8: ['Exit', 'belowBar'], shape9: ['Exit', 'aboveBar'],
    };
    expect(r.markers.length).toBeGreaterThan(0);
    for (const m of r.markers) {
      expect(Object.keys(want)).toContain(m.id);
      expect([m.text, m.position]).toEqual(want[m.id!]);
    }
  });
});

describe('Order Block Detector [LuxAlgo]', () => {
  const length = 5;
  const r = obDetector.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(obDetector)).toEqual([
      ['alert0', 'Bullish OB Formed', 'Bullish order block detected'],
      ['alert1', 'Bearish OB Formed', 'bearish order block detected'],
      ['alert2', 'Bullish OB Mitigated', 'Bullish order block mitigated'],
      ['alert3', 'Bearish OB Mitigated', 'bearish order block mitigated'],
    ]);
  });
  it('Formed on the bar that finds a block, Mitigated on the bar that removes one', () => {
    // plot(bull_ob, offset = -length): the value of bar i is drawn on bar i - length
    const n = bars.length;
    const bullOb = bars.map((_b, i) => (i - length >= 0 ? r.plots.plot0[i - length].value : NaN));
    const bearOb = bars.map((_b, i) => (i - length >= 0 ? r.plots.plot1[i - length].value : NaN));
    expect(r.alerts[0].times).toEqual(timeAt(bars, bullOb.map((v) => Number.isFinite(v) && v !== 0)));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bearOb.map((v) => Number.isFinite(v) && v !== 0)));
    // the blocks, removed by the loop `for element in target_array` (an element after a removed one is skipped)
    const lowest = (i: number) => (i < length - 1 ? NaN : Math.min(...bars.slice(i - length + 1, i + 1).map((b) => b.low)));
    const highest = (i: number) => (i < length - 1 ? NaN : Math.max(...bars.slice(i - length + 1, i + 1).map((b) => b.high)));
    const bullBtm: number[] = [], bearTop: number[] = [];
    const mitBull: boolean[] = [], mitBear: boolean[] = [];
    const sweep = (arr: number[], hit: (x: number) => boolean) => {
      let m = false;
      for (let k = 0; k < arr.length; k++) {
        const el = arr[k];
        if (hit(el)) {
          m = true;
          arr.splice(arr.findIndex((v) => Math.abs(v - el) <= EPS), 1);
        }
      }
      return m;
    };
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(bullOb[i]) && bullOb[i] !== 0) bullBtm.unshift(bars[i - length].low);
      if (Number.isFinite(bearOb[i]) && bearOb[i] !== 0) bearTop.unshift(bars[i - length].high);
      const tb = lowest(i), tr = highest(i);
      mitBull.push(sweep(bullBtm, (x) => gt(x, tb)));
      mitBear.push(sweep(bearTop, (x) => gt(tr, x)));
    }
    expect(r.alerts[2].times).toEqual(timeAt(bars, mitBull));
    expect(r.alerts[3].times).toEqual(timeAt(bars, mitBear));
    for (const a of r.alerts) expect(a.times.length).toBeGreaterThan(0);
  });
});

describe('Order Block Finder', () => {
  const periods = 3;
  const r = obFinder.calculate(bars, { periods });
  const ob = periods + 1;
  const bull = bars.map((_b, i) => {
    if (i < ob) return false;
    const c = bars[i - ob];
    let up = 0;
    for (let k = 1; k <= periods; k++) if (bars[i - k].close > bars[i - k].open) up++;
    const move = (Math.abs(c.close - bars[i - 1].close) / c.close) * 100;
    return c.close < c.open && up === periods && move >= 0;
  });
  const bear = bars.map((_b, i) => {
    if (i < ob) return false;
    const c = bars[i - ob];
    let down = 0;
    for (let k = 1; k <= periods; k++) if (bars[i - k].close < bars[i - k].open) down++;
    return c.close > c.open && down === periods;
  });
  it('declares the alertconditions of the original', () => {
    expect(decls(obFinder)).toEqual([
      ['alert0', 'New Bullish OB detected', 'New Bullish OB detected - This is NOT a BUY signal!'],
      ['alert1', 'New Bearish OB detected', 'New Bearish OB detected - This is NOT a SELL signal!'],
    ]);
  });
  it('OB_bull / OB_bear on the bar that finds the block', () => {
    expect(r.alerts[0].times).toEqual(timeAt(bars, bull));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bear));
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[1].times.length).toBeGreaterThan(0);
  });
  it('the triangles and crosses carry shape0..shape3, drawn on the block candle', () => {
    for (const m of r.markers) expect(['shape0', 'shape1', 'shape2', 'shape3']).toContain(m.id);
    const back = (flags: boolean[]) => bars.filter((_b, i) => flags[i]).map((_b) => _b.time - ob * 86400);
    expect(idTimes(r.markers, 'shape0')).toEqual(back(bull));
    expect(idTimes(r.markers, 'shape1')).toEqual(back(bull));
    expect(idTimes(r.markers, 'shape2')).toEqual(back(bear));
    expect(idTimes(r.markers, 'shape3')).toEqual(back(bear));
  });
});

describe('Order Blocks with signals: alert() calls', () => {
  const r = obSignals.calculate(bars, { sensitivity: 10 });
  it('has alert() calls once per bar, "Price inside Bearish OB" before "Price inside Bullish OB"', () => {
    expect(obSignals.hasAlertFunction).toBe(true);
    expect(obSignals.OrderBlocksSignals.hasAlertFunction).toBe(true);
    const sell = r.alertCalls.filter((c) => c.message === 'Price inside Bearish OB');
    const buy = r.alertCalls.filter((c) => c.message === 'Price inside Bullish OB');
    expect(sell.length).toBeGreaterThan(0);
    expect(buy.length).toBeGreaterThan(0);
    expect(sell.length + buy.length).toBe(r.alertCalls.length);
    for (const c of r.alertCalls) expect(c.freq).toBe('once_per_bar');
    // one call per message and bar
    expect(uniq(sell.map((c) => c.time)).length).toBe(sell.length);
    expect(uniq(buy.map((c) => c.time)).length).toBe(buy.length);
    for (let k = 1; k < r.alertCalls.length; k++) {
      const a = r.alertCalls[k - 1], b = r.alertCalls[k];
      expect(a.time < b.time || (a.time === b.time && a.message.includes('Bearish') && b.message.includes('Bullish'))).toBe(true);
    }
    // the port's Sell / Buy markers (inside a block that is not mitigated) are on bars with a call
    const sellTimes = new Set(sell.map((c) => c.time));
    const buyTimes = new Set(buy.map((c) => c.time));
    for (const m of r.markers) expect((m.text === 'Sell' ? sellTimes : buyTimes).has(m.time)).toBe(true);
  });
  it('the alert inputs turn the calls off', () => {
    expect(obSignals.calculate(bars, { sensitivity: 10, sellAlert: false }).alertCalls.every((c) => c.message.includes('Bullish'))).toBe(true);
    expect(obSignals.calculate(bars, { sensitivity: 10, buyAlert: false }).alertCalls.every((c) => c.message.includes('Bearish'))).toBe(true);
    expect(obSignals.calculate(bars, { sensitivity: 10 }).markers).toEqual(r.markers);
  });
});

describe('Order Blocks Volume Delta 3D | Flux Charts', () => {
  const r = obVd.calculate(bars, { swingLen: 3 });
  const messages = ['Bullish Order Block detected.', 'Bearish Order Block detected.', 'Bullish Order Block retest.', 'Bearish Order Block retest.'];
  it('declares the alertconditions of the original and its alert() calls', () => {
    expect(decls(obVd)).toEqual([
      ['alert0', 'Bullish Order Block', 'New Bullish Order Block detected.'],
      ['alert1', 'Bearish Order Block', 'Bearish Order Block detected.'],
      ['alert2', 'Bullish OB Retest', 'Bullish Order Block retest.'],
      ['alert3', 'Bearish OB Retest', 'Bearish Order Block retest.'],
    ]);
    expect(obVd.hasAlertFunction).toBe(true);
  });
  it('the alert() calls are made on the bars of the conditions, once per bar', () => {
    messages.forEach((msg, k) => {
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
      expect(r.alertCalls.filter((c) => c.message === msg).map((c) => c.time)).toEqual(r.alerts[k].times);
    });
    for (const c of r.alertCalls) expect(c.freq).toBe('once_per_bar');
    // a retest is logged one bar after the bar that touches the block, at least 4 bars after the last one of its side
    for (const k of [2, 3]) {
      const t = r.alerts[k].times;
      for (let j = 1; j < t.length; j++) expect(t[j] - t[j - 1]).toBeGreaterThanOrEqual(4 * 86400);
    }
  });
  it('each alert input turns its condition and calls off, and does not change the drawings', () => {
    const off = obVd.calculate(bars, { swingLen: 3, alBullOB: false, alBearRetest: false });
    expect(off.alerts[0].times).toEqual([]);
    expect(off.alerts[3].times).toEqual([]);
    expect(off.alerts[1].times).toEqual(r.alerts[1].times);
    expect(off.alerts[2].times).toEqual(r.alerts[2].times);
    expect(off.alertCalls.some((c) => c.message === messages[0] || c.message === messages[3])).toBe(false);
    expect(off.boxes).toEqual(r.boxes);
    expect(off.labels).toEqual(r.labels);
  });
});

describe('Oscillator Matrix', () => {
  const r = oscMatrix.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(oscMatrix)).toEqual([
      ['alert0', 'Strong Buy Signal', 'Oscillator Matrix: Strong Buy Signal Detected'],
      ['alert1', 'Strong Sell Signal', 'Oscillator Matrix: Strong Sell Signal Detected'],
    ]);
  });
  it('strong signals: Money Flow crosses -0.7 / 0.7 with Hyper Wave beyond -0.5 / 0.5', () => {
    const mf = vals(r.plots.plot10), hw = vals(r.plots.plot9);
    const buy = xover(mf, -0.7).map((x, i) => x && lt(hw[i], -0.5));
    const sell = xunder(mf, 0.7).map((x, i) => x && gt(hw[i], 0.5));
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
    expect(r.alerts[0].times.length + r.alerts[1].times.length).toBeGreaterThan(0);
  });
});

describe('OTT Bands', () => {
  const r = ottBands.calculate(bars, { showSupport: true });
  const mavg = vals(r.plots.support);
  const ott2 = vals(r.plots.ottMain);
  const S = 14;
  it('declares the alertconditions of the original', () => {
    expect(decls(ottBands)).toEqual([
      ['alert0', 'Cross Alert', 'OTT - Support Line Crossing!'],
      ['alert1', 'Crossover Alarm', 'Support Line BUY SIGNAL!'],
      ['alert2', 'Crossunder Alarm', 'Support Line SELL SIGNAL!'],
      ['alert3', 'Price Cross Alert', 'OTT - Price Crossing!'],
      ['alert4', 'Price Crossover Alarm', 'PRICE OVER OTT - BUY SIGNAL!'],
      ['alert5', 'Price Crossunder Alarm', 'PRICE UNDER OTT - SELL SIGNAL!'],
    ]);
  });
  it('the conditions are the crosses of MAvg and of the close with OTT[2]', () => {
    const want = [
      or(xover(mavg, ott2), xunder(mavg, ott2)), xover(mavg, ott2), xunder(mavg, ott2),
      or(xover(close, ott2), xunder(close, ott2)), xover(close, ott2), xunder(close, ott2),
    ];
    want.forEach((flags, k) => {
      expect(from(r.alerts[k].times, bars, S)).toEqual(from(timeAt(bars, flags), bars, S));
      expect(r.alerts[k].times.length).toBeGreaterThan(0);
    });
    // the support line input only shows the line
    expect(ottBands.calculate(bars).alerts).toEqual(r.alerts);
  });
});

describe('OTTO', () => {
  const r = otto.calculate(bars);
  const hott = vals(r.plots.hott);
  const lott = vals(r.plots.lott);
  const S = 14;
  it('declares the alertconditions of the original', () => {
    expect(decls(otto)).toEqual([['alert0', 'Crossover Alarm', 'OTTO - BUY SIGNAL!'], ['alert1', 'Crossunder Alarm', 'OTTO - SELL SIGNAL!']]);
  });
  it('Crossover Alarm: HOTT[2] crosses under LOTT; Crossunder Alarm: HOTT[2] crosses over LOTT', () => {
    expect(from(r.alerts[0].times, bars, S)).toEqual(from(timeAt(bars, xunder(hott, lott)), bars, S));
    expect(from(r.alerts[1].times, bars, S)).toEqual(from(timeAt(bars, xover(hott, lott)), bars, S));
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[1].times.length).toBeGreaterThan(0);
    expect(from(r.alerts[0].times, bars, S)).toEqual(from(r.markers.filter((m) => m.text === 'Buy').map((m) => m.time), bars, S));
  });
});

describe.each([['Peak Reversal v2', pr2], ['Peak Reversal v3', pr3]] as const)('%s: Style ids', (_name, mod) => {
  const r = (mod.calculate as (b: Bar[], i: object) => any)(bars, { showFreeBars: true });
  it('triangles shape0 / shape1, stars char2 / char3', () => {
    const want: Record<string, [string, string | undefined]> = {
      shape0: ['aboveBar', undefined], shape1: ['belowBar', undefined], char2: ['aboveBar', '★'], char3: ['belowBar', '★'],
    };
    for (const m of r.markers) {
      expect(Object.keys(want)).toContain(m.id);
      expect([m.position, m.text]).toEqual(want[m.id]);
    }
    expect(uniq(r.markers.map((m: any) => m.id)).sort()).toEqual(['char2', 'char3', 'shape0', 'shape1']);
  });
  it('one bar colour per barcolor call, Up before Down on the same bar', () => {
    expect(uniq(r.barColors.map((c: any) => c.id)).sort()).toEqual(['barcolor0', 'barcolor1']);
    for (let k = 1; k < r.barColors.length; k++) {
      const a = r.barColors[k - 1], b = r.barColors[k];
      expect(a.time < b.time || (a.time === b.time && a.id === 'barcolor0' && b.id === 'barcolor1')).toBe(true);
    }
  });
});

describe('Percentile-Based BB% Trend - Mattes', () => {
  const r = pbb.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(pbb)).toEqual([
      ['alert0', 'Bullish Trend Shift', 'PBB% Trend crossing above midline'],
      ['alert1', 'Bearish Trend Shift', 'PBB% Trend crossing below midline'],
    ]);
  });
  it('the trend crosses over / under 0', () => {
    const t = vals(r.plots.plot0);
    expect(r.alerts[0].times).toEqual(timeAt(bars, xover(t, 0)));
    expect(r.alerts[1].times).toEqual(timeAt(bars, xunder(t, 0)));
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[1].times.length).toBeGreaterThan(0);
  });
});
