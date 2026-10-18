/**
 * Batch 05 of the community ports: alertcondition() declarations and their per-bar states (`alerts`), alert() calls
 * (`alertCalls`), checked against conditions computed again in the test from the original expressions; Style ids of
 * the emitted items (markers, arrows, background and bar colours) against the outputs of the original.
 */

import { describe, it, expect } from 'vitest';
import { ta, Series, str, heikinAshi, type Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as bigHf from '../../src/community/big-trades-detector-by-hf';
import * as bigHk from '../../src/community/big-trades-whale-detector-by-hk';
import * as biggestVolume from '../../src/community/biggest-volume';
import * as bilateral from '../../src/community/bilateral-filter-for-loop';
import * as btc2y from '../../src/community/bitcoin-2y-sma-bands-astral-vision';
import * as autotrail from '../../src/community/bjorgum-autotrail';
import * as keyLevels from '../../src/community/bjorgum-key-levels';
import * as mtfMa from '../../src/community/bjorgum-mtf-ma';
import * as superscript from '../../src/community/bjorgum-superscript';
import * as tripleEma from '../../src/community/bjorgum-triple-ema';
import * as bjTsi from '../../src/community/bjorgum-tsi';
import * as blacklab from '../../src/community/blacklab84-panel';
import * as bnf from '../../src/community/bnf-25-50-ma-pullback-screener';
import * as batn from '../../src/community/bollinger-adaptive-trend-navigator';
import * as bbawe from '../../src/community/bollinger-awesome-alert';
import * as boom from '../../src/community/boom-hunter-pro';

const DAY = 86400;
const T0 = 1262304000;
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of daily bars (times in seconds) */
function walk(count: number, seed = 11, vol = 4, gap = 0, step = DAY): Bar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = Math.max(1, price + (rand() - 0.5) * gap);
    const close = Math.max(1, open + Math.sin(i / 120) * 0.3 + (rand() - 0.5) * vol);
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 2);
    const spike = rand() < 0.03 ? 8 : 1;
    bars.push({ time: T0 + i * step, open, high, low, close, volume: (1000 + Math.floor(rand() * 1000)) * spike });
    price = close;
  }
  return bars;
}

const timesWhere = (bars: Bar[], f: (i: number) => boolean) => bars.filter((_, i) => f(i)).map((b) => b.time as number);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const values = (pts: { value: number }[]) => pts.map((p) => p.value);
/** ta.crossover / ta.crossunder (exact comparisons, na false) */
const xover = (a: number[], b: number[] | number, i: number) => {
  const bb = (k: number) => (typeof b === 'number' ? b : b[k]);
  return i > 0 && a[i] > bb(i) && a[i - 1] <= bb(i - 1);
};
const xunder = (a: number[], b: number[] | number, i: number) => {
  const bb = (k: number) => (typeof b === 'number' ? b : b[k]);
  return i > 0 && a[i] < bb(i) && a[i - 1] >= bb(i - 1);
};
const xany = (a: number[], b: number[] | number, i: number) => xover(a, b, i) || xunder(a, b, i);
const idsOf = (items: { id?: string }[]) => [...new Set(items.map((m) => m.id))].sort();

describe('Big Trades Detector By HF / Whale Detector By HK: shape ids', () => {
  const bars = walk(1500, 7);
  const spec = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5'];
  const sizes = ['small', 'normal', 'large'];
  for (const [name, mod] of [['HF', bigHf], ['HK', bigHk]] as const) {
    it(`${name}: every circle has the id of its output (buy / sell by price, tier by size)`, () => {
      const res = mod.calculate(bars);
      expect(res.markers.length).toBeGreaterThan(20);
      for (const m of res.markers) {
        const b = bars.find((x) => x.time === m.time)!;
        const buy = Math.abs((m.price as number) - (b.close + b.low) / 2) < 1e-9;
        expect(m.id).toBe(`shape${(buy ? 0 : 3) + sizes.indexOf(m.size as string)}`);
        expect(spec).toContain(m.id);
      }
      expect(idsOf(res.markers).length).toBeGreaterThanOrEqual(4);
    });
  }
});

describe('Biggest Volume: alertcondition', () => {
  const bars = walk(1200, 3);
  it('declares the condition of the original', () => {
    expect(biggestVolume.alertConditions).toEqual([{ id: 'alert0', title: 'Big Volume', message: 'Big Volume' }]);
    expect(biggestVolume.BiggestVolume.alertConditions).toBe(biggestVolume.alertConditions);
  });
  it('fires where the volume is the highest of the last 14 bars, and never with the switch off', () => {
    const vol = bars.map((b) => b.volume as number);
    const exp = timesWhere(bars, (i) => i >= 13 && vol[i] === Math.max(...vol.slice(i - 13, i + 1)));
    expect(exp.length).toBeGreaterThan(50);
    expect(biggestVolume.calculate(bars).alerts[0].times).toEqual(exp);
    expect(biggestVolume.calculate(bars, { alertSwitch: false }).alerts[0].times).toEqual([]);
  });
});

describe('Bilateral Filter For Loop: alertconditions', () => {
  const bars = walk(1200, 5);
  const res = bilateral.calculate(bars);
  it('declares the two conditions of the original', () => {
    expect(bilateral.alertConditions).toEqual([
      { id: 'alert0', title: 'Bilateral Filter FL Long', message: 'Bilateral Filter FL Long - {{ticker}} - {{interval}}' },
      { id: 'alert1', title: 'Bilateral Filter FL Short', message: 'Bilateral Filter FL Short - {{ticker}} - {{interval}}' },
    ]);
    expect(bilateral.BilateralFilterForLoop.alertConditions).toBe(bilateral.alertConditions);
  });
  it('L and not S / S = crossunder(score, lower) on the score line', () => {
    const score = values(res.plots.plot0);
    const S = (i: number) => xunder(score, -10, i);
    const longT = timesWhere(bars, (i) => gt(score[i], 40) && !S(i));
    const shortT = timesWhere(bars, S);
    expect(longT.length).toBeGreaterThan(20);
    expect(shortT.length).toBeGreaterThan(5);
    expect(res.alerts[0].times).toEqual(longT);
    expect(res.alerts[1].times).toEqual(shortT);
  });
});

describe('Bitcoin 2Y-SMA Bands: bgcolor ids', () => {
  // 730 bars at 100, then 450 (above the top band), then 30 (below the bottom band)
  const bars = walk(1100, 9, 0.5).map((b, i) => {
    const p = i < 730 ? 100 : i < 900 ? 450 : 30;
    return { ...b, open: p, close: p, high: p + 1, low: p - 1 };
  });
  it('bgcolor0 below the investor bottom, bgcolor1 above the top', () => {
    const res = btc2y.calculate(bars);
    const close = bars.map((b) => b.close);
    const sma = A(ta.sma(Series.fromArray(bars, close), 730));
    const ratio = close.map((c, i) => c / (sma[i] * 0.6));
    const bg0 = res.bgColors.filter((b) => b.id === 'bgcolor0').map((b) => b.time);
    const bg1 = res.bgColors.filter((b) => b.id === 'bgcolor1').map((b) => b.time);
    expect(bg0).toEqual(timesWhere(bars, (i) => lt(ratio[i], 1)));
    expect(bg1).toEqual(timesWhere(bars, (i) => gt(ratio[i], 6.5)));
    expect(bg0.length).toBeGreaterThan(20);
    expect(bg1.length).toBeGreaterThan(20);
    expect(res.bgColors.every((b) => b.id === 'bgcolor0' || b.id === 'bgcolor1')).toBe(true);
  });
});

describe('Bjorgum AutoTrail: alertconditions and alert() calls', () => {
  const bars = walk(1200, 13, 5);
  it('declares the two conditions of the original and the alert function', () => {
    expect(autotrail.alertConditions).toEqual([
      { id: 'alert0', title: 'Long Trail', message: 'Long  Trail Trigger on {{interval}} chart. Price is {{close}}' },
      { id: 'alert1', title: 'Short Trail', message: 'Short Trail Trigger on {{interval}} chart. Price is {{close}}' },
    ]);
    expect(autotrail.hasAlertFunction).toBe(true);
    expect(autotrail.BjorgumAutoTrail.alertConditions).toBe(autotrail.alertConditions);
  });
  it('Long Trail on the long stop crosses, Short Trail on the short stop crosses', () => {
    const res = autotrail.calculate(bars);
    const longT = res.markers.filter((m) => m.position === 'aboveBar').map((m) => m.time);
    const shortT = res.markers.filter((m) => m.position === 'belowBar').map((m) => m.time);
    // independent: the trail direction flips (plot colour #2962FF long, #FF0000 short)
    const dir = res.plots.plot0.map((p) => (p.color === '#2962FF' ? 1 : p.color === '#FF0000' ? -1 : 0));
    expect(longT).toEqual(timesWhere(bars, (i) => i > 0 && dir[i - 1] === 1 && dir[i] === -1));
    expect(shortT).toEqual(timesWhere(bars, (i) => i > 0 && dir[i - 1] === -1 && dir[i] === 1));
    expect(longT.length).toBeGreaterThan(5);
    expect(res.alerts[0].times).toEqual(longT);
    expect(res.alerts[1].times).toEqual(shortT);
    expect(res.alertCalls).toEqual([]);
  });
  it('one alert() call on the first stop, crypto and forex messages', () => {
    const base = autotrail.calculate(bars);
    const first = Math.min(base.alerts[0].times[0], base.alerts[1].times[0]);
    const action = base.alerts[0].times[0] === first ? 'sell' : 'buy';
    const crypto = autotrail.calculate(bars, {}, { symbolType: 'crypto', tickerid: 'BINANCE:BTCUSDT', currency: 'USDT' } as ChartContext);
    expect(crypto.alertCalls).toEqual([{ time: first, message: `${action} BTCUSDT q=0.001 a=usdm`, freq: 'once_per_bar' }]);
    const fx = autotrail.calculate(bars, { quantity: 1000, broker: 'B' }, { symbolType: 'forex', tickerid: 'FX:EURUSD', currency: 'USD' } as ChartContext);
    expect(fx.alertCalls).toEqual([{ time: first, message: `e=B s=EUR/USD b=${action} q=1000`, freq: 'once_per_bar' }]);
    expect(autotrail.calculate(bars, {}, { symbolType: 'stock', tickerid: 'NASDAQ:AAPL' } as ChartContext).alertCalls).toEqual([]);
  });
});

describe('Bjorgum Key Levels: shape and arrow ids', () => {
  const bars = walk(1200, 29, 5);
  const all = { breakUp: true, breakDn: true, supPush: true, resPush: true, falseBull: true, falseBear: true, detectBO: true, detectBD: true, curl: true };
  const res = keyLevels.calculate(bars, all);
  const d = keyLevels.defaultInputs;
  it('every marker has the id of its plotshape (position, shape, colour)', () => {
    const look: Record<string, [string, string, string]> = {
      shape0: ['belowBar', 'arrowUp', d.upCol], shape1: ['aboveBar', 'arrowDown', d.dnCol],
      shape2: ['belowBar', 'arrowUp', d.supCol], shape3: ['aboveBar', 'arrowDown', d.resCol],
      shape4: ['belowBar', 'triangleUp', d.moveBullCol], shape5: ['aboveBar', 'triangleDown', d.moveBearCol],
      shape6: ['belowBar', 'triangleUp', d.curlBullCol], shape7: ['aboveBar', 'triangleDown', d.curlBearCol],
    };
    expect(res.markers.length).toBeGreaterThan(10);
    for (const m of res.markers) {
      expect(Object.keys(look)).toContain(m.id);
      expect([m.position, m.shape, m.color]).toEqual(look[m.id as string]);
    }
    // one detection on: its markers have its id only
    const only = keyLevels.calculate(bars, { breakUp: true }).markers;
    expect(only.length).toBeGreaterThan(0);
    expect(idsOf(only)).toEqual(['shape2']);
    expect(idsOf(res.markers).length).toBeGreaterThanOrEqual(6);
  });
  it('false breaks are plotarrow outputs: arrow0 (false break up), arrow1 (false break down), value close - open', () => {
    expect(idsOf(res.arrows)).toEqual(['arrow0', 'arrow1']);
    const coDiff = (t: number) => { const b = bars.find((x) => x.time === t)!; return b.close - b.open; };
    for (const a of res.arrows) {
      expect(a.value).toBeCloseTo(coDiff(a.time), 12);
      expect(a.color).toBe(a.value > 0 ? d.fBull : d.fBear);
    }
    // the raw conditions (alerts 4 / 5) are the arrows when only that detection is on
    const dn = keyLevels.calculate(bars, { falseBull: true });
    const up = keyLevels.calculate(bars, { falseBear: true });
    expect(dn.arrows.map((a) => a.time)).toEqual(dn.alerts[4].times.filter((t) => coDiff(t) !== 0));
    expect(up.arrows.map((a) => a.time)).toEqual(up.alerts[5].times.filter((t) => coDiff(t) !== 0));
    expect(dn.arrows.every((a) => a.id === 'arrow1')).toBe(true);
    expect(up.arrows.every((a) => a.id === 'arrow0')).toBe(true);
    expect(dn.arrows.length + up.arrows.length).toBeGreaterThan(0);
  });
});

describe('Bjorgum MTF MA: alertconditions', () => {
  const bars = walk(1500, 17);
  it('declares the 12 conditions of the original', () => {
    expect(mtfMa.alertConditions.length).toBe(12);
    expect(mtfMa.alertConditions[0]).toEqual({ id: 'alert0', title: 'Close crossed above MA 1', message: 'Close crossed above MA 1 on {{interval}} chart. Price is {{close}}' });
    expect(mtfMa.alertConditions[11]).toEqual({ id: 'alert11', title: 'MA 2 crossed below MA 3', message: "MA 2 crossed below MA 3 on {{interval}} chart. Price is {{close}}'" });
    expect(mtfMa.alertConditions.map((a) => a.title)).toEqual([
      'Close crossed above MA 1', 'Close crossed below MA 1', 'Close crossed above MA 2', 'Close crossed below MA 2',
      'Close crossed above MA 3', 'Close crossed below MA 3', 'MA 1 crossed above MA 2', 'MA 1 crossed below MA 2',
      'MA 1 crossed above MA 3', 'MA 1 crossed below MA 3', 'MA 2 crossed above MA 3', 'MA 2 crossed below MA 3',
    ]);
    expect(mtfMa.BjorgumMtfMa.alertConditions).toBe(mtfMa.alertConditions);
  });
  const check = (inputs: Partial<mtfMa.BjorgumMtfMaInputs>) => {
    const res = mtfMa.calculate(bars, inputs);
    const close = bars.map((b) => b.close);
    const [m1, m2, m3] = [res.plots.plot0, res.plots.plot1, res.plots.plot2].map(values);
    const exp = [
      (i: number) => xover(close, m1, i), (i: number) => xunder(close, m1, i),
      (i: number) => xover(close, m2, i), (i: number) => xunder(close, m2, i),
      (i: number) => xover(close, m3, i), (i: number) => xunder(close, m3, i),
      (i: number) => xover(m1, m2, i), (i: number) => xunder(m1, m2, i),
      (i: number) => xover(m1, m3, i), (i: number) => xunder(m1, m3, i),
      (i: number) => xover(m2, m3, i), (i: number) => xunder(m2, m3, i),
    ];
    exp.forEach((f, k) => {
      const t = timesWhere(bars, f);
      expect(t.length, `alert${k}`).toBeGreaterThan(0);
      expect(res.alerts[k].times, `alert${k}`).toEqual(t);
    });
  };
  it('crosses of the close and of the averages on the chart timeframe', () => check({ maLength2: 20, maLength3: 100, maType3: 'SMA' }));
  it('crosses of the step values of a higher timeframe', () => check({ maLength1: 10, maLength2: 20, maLength3: 5, tf1: '1W', tf3: '1W', smooth: false }));
});

describe('Bjorgum SuperScript: alertconditions and alert() calls', () => {
  const bars = walk(1500, 19);
  const inputs = { hemavis: true, psarvis: true } as const;
  const res = superscript.calculate(bars, inputs);
  const close = bars.map((b) => b.close);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const tsi = A(ta.tsi(S(close), 5, 25));
  const tsl = A(ta.ema(S(tsi), 14));
  const rsi = A(ta.rsi(S(close), 5));
  const [anT3, nT3, s1, s2, , , sar] = ['plot0', 'plot1', 'plot2', 'plot3', 'plot4', 'plot5', 'plot6'].map((k) => values(res.plots[k]));
  const tsiOver = (i: number) => xover(tsi, tsl, i);
  const tsiUnder = (i: number) => xunder(tsi, tsl, i);
  const data = (i: number) => gt(tsl[i], tsi[i]) && i > 0 && gt(tsi[i], tsi[i - 1]);
  const dtat = (i: number) => gt(tsi[i], tsl[i]) && i > 0 && gt(tsi[i - 1], tsi[i]);
  const conds: Array<(i: number) => boolean> = [
    (i) => (tsiOver(i) && gt(rsi[i], 50)) || (xover(rsi, 50, i) && gt(tsi[i], tsl[i])) || (tsiOver(i) && xover(rsi, 50, i)),
    (i) => (tsiUnder(i) && lt(rsi[i], 50)) || (xunder(rsi, 50, i) && lt(tsi[i], tsl[i])) || (tsiUnder(i) && xunder(rsi, 50, i)),
    (i) => xany(close, nT3, i),
    (i) => xany(nT3, anT3, i),
    (i) => xover(close, nT3, i),
    (i) => xunder(close, nT3, i),
    (i) => xany(close, s1, i) && xany(close, s2, i),
    (i) => (xover(close, s1, i) && gt(close[i], s2[i])) || (xover(close, s2, i) && gt(close[i], s1[i])) || (xover(close, s2, i) && xover(close, s1, i)),
    (i) => (xunder(close, s1, i) && lt(close[i], s2[i])) || (xunder(close, s2, i) && lt(close[i], s1[i])) || (xunder(close, s2, i) && xunder(close, s1, i)),
    (i) => xany(rsi, 50, i),
    (i) => xover(rsi, 50, i),
    (i) => xunder(rsi, 50, i),
    (i) => xover(rsi, 70, i),
    (i) => xunder(rsi, 30, i),
    (i) => xunder(rsi, 70, i),
    (i) => xover(rsi, 30, i),
    data,
    dtat,
    (i) => xover(close, sar, i),
    (i) => xunder(close, sar, i),
  ];
  it('declares the 20 conditions of the original and the alert function', () => {
    expect(superscript.alertConditions.map((a) => a.id)).toEqual(conds.map((_c, k) => `alert${k}`));
    expect(superscript.alertConditions[2]).toEqual({ id: 'alert2', title: 'Bj Reversal', message: 'Reversal candle is forming on {{interval}} chart. Price is {{close}}' });
    expect(superscript.alertConditions[18]).toEqual({ id: 'alert18', title: 'Sar Up', message: 'SAR triggered up {{interval}} chart. Price is {{close}}' });
    expect(superscript.hasAlertFunction).toBe(true);
    expect(superscript.BjorgumSuperScript.alertConditions).toBe(superscript.alertConditions);
  });
  it('each condition fires on the bars of the original expression', () => {
    conds.forEach((f, k) => {
      const t = timesWhere(bars, f);
      expect(t.length, `alert${k}`).toBeGreaterThan(0);
      expect(res.alerts[k].times, `alert${k}`).toEqual(t);
    });
    expect(res.alertCalls).toEqual([]);
  });
  it('alert() calls of the selected conditions, in the original order, "Alerts Mode" frequency', () => {
    const on = {
      alertTrmBuy: true, alertTrmSell: true, alertRevUp: true, alertRevDown: true, alertMaCrossUp: true, alertMaCrossDown: true,
      alertRsiUp50: true, alertRsiDown50: true, alertRsiUp70: true, alertRsiDown30: true, alertRsiDown70: true, alertRsiUp30: true,
      alertTsiCurlUp: true, alertTsiCurlDown: true, alertSarUp: true, alertSarDown: true,
    };
    const r = superscript.calculate(bars, { ...inputs, ...on, alertMode: 'once_per_bar' });
    const texts: Array<[number, string]> = [
      [0, 'TRM Buy on '], [1, 'TRM Sell on '], [4, 'Reversal up on '], [5, 'Reversal down on '], [7, 'MA crossed up on '],
      [8, 'MA crossed down on '], [10, 'RSI crossed up 50 on '], [11, 'RSI crossed down 50 on '], [12, 'RSI crossed up 70 on '],
      [13, 'RSI crossed down 30 on '], [14, 'RSI crossed down 70 on '], [15, 'RSI crossed up 30 on '], [16, 'TSI curled up on '],
      [17, 'TSI curled down on '], [18, 'SAR triggered up '], [19, 'SAR triggered down '],
    ];
    const exp: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      for (const [k, txt] of texts) {
        if (conds[k](i)) exp.push({ time: b.time as number, message: `${txt}D chart. Price is ${str.tostring(b.close)}`, freq: 'once_per_bar' });
      }
    });
    expect(r.alertCalls).toEqual(exp);
    const one = superscript.calculate(bars, { ...inputs, alertSarUp: true }, { timeframe: '60' } as ChartContext);
    expect(one.alertCalls.map((c) => c.time)).toEqual(res.alerts[18].times);
    expect(one.alertCalls[0].message.startsWith('SAR triggered up 60 chart. Price is ')).toBe(true);
    expect(one.alertCalls[0].freq).toBe('once_per_bar_close');
  });
});

describe('Bjorgum Triple EMA: alertcondition', () => {
  const bars = walk(1500, 23);
  it('declares the condition of the original', () => {
    expect(tripleEma.alertConditions).toEqual([{ id: 'alert0', title: 'Alert Signal', message: 'Price is crossing EMAs' }]);
    expect(tripleEma.BjorgumTripleEma.alertConditions).toBe(tripleEma.alertConditions);
  });
  it('the close crosses EMA 5 and EMA 9 of the Heikin Ashi open on the same bar', () => {
    const haOpen = heikinAshi(bars).map((b) => b.open);
    const e5 = A(ta.ema(Series.fromArray(bars, haOpen), 5));
    const e9 = A(ta.ema(Series.fromArray(bars, haOpen), 9));
    const close = bars.map((b) => b.close);
    const exp = timesWhere(bars, (i) => xany(close, e5, i) && xany(close, e9, i));
    expect(exp.length).toBeGreaterThan(20);
    expect(tripleEma.calculate(bars).alerts[0].times).toEqual(exp);
  });
});

describe('Bjorgum TSI: alertconditions, candles, bar and background colours', () => {
  const bars = walk(1500, 31);
  const res = bjTsi.calculate(bars);
  const close = bars.map((b) => b.close);
  const tsi = A(ta.tsi(Series.fromArray(bars, close), 5, 25)).map((v) => v * 100);
  const tsl = A(ta.ema(Series.fromArray(bars, tsi), 14));
  const p = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);
  const conds: Array<(i: number) => boolean> = [
    (i) => xover(tsi, tsl, i),
    (i) => xunder(tsi, tsl, i),
    (i) => xany(tsi, tsl, i),
    (i) => tsi[i] > p(tsi, i) && tsi[i] < tsl[i],
    (i) => tsi[i] < p(tsi, i) && tsi[i] > tsl[i],
    (i) => xover(tsi, 30, i),
    (i) => xunder(tsi, -30, i),
    (i) => tsi[i] > 30 && tsi[i] < p(tsi, i) && p(tsi, i) > p(tsl, i),
    (i) => tsi[i] < -30 && tsi[i] > p(tsi, i) && p(tsi, i) < p(tsl, i),
    (i) => xunder(tsi, tsl, i) && tsi[i] >= 30,
    (i) => xover(tsi, tsl, i) && tsi[i] <= -30,
  ];
  it('declares the 11 conditions of the original', () => {
    expect(bjTsi.alertConditions.map((a) => a.title)).toEqual([
      'TSI cross up', 'TSI cross down', 'TSI cross', 'TSI Curl Up', 'TSI Curl Down', 'TSI Overbought', 'TSI Oversold',
      'TSI Curl Overbought', 'TSI Curl Oversold', 'TSI Cross Down Overbought', 'TSI Cross Up Oversold',
    ]);
    expect(bjTsi.alertConditions[7]).toEqual({ id: 'alert7', title: 'TSI Curl Overbought', message: 'TSI Curled Down In Overbought on {{interval}} chart. Price is {{close}}' });
    expect(bjTsi.BjorgumTSI.alertConditions).toBe(bjTsi.alertConditions);
  });
  it('each condition fires on the bars of the original expression', () => {
    conds.forEach((f, k) => {
      const t = timesWhere(bars, f);
      expect(t.length, `alert${k}`).toBeGreaterThan(0);
      expect(res.alerts[k].times, `alert${k}`).toEqual(t);
    });
  });
  it('plotcandle(barLo, barLo, barHi, barHi), uncoloured in the classic theme', () => {
    const c = res.plotCandles.candle;
    const valid = timesWhere(bars, (i) => !isNaN(tsi[i] - tsl[i]));
    expect(c.map((x) => x.time)).toEqual(valid);
    for (const x of c) {
      const i = bars.findIndex((b) => b.time === x.time);
      expect(x.open).toBeCloseTo(Math.min(0, tsi[i] - tsl[i]), 9);
      expect(x.high).toBe(x.open);
      expect(x.low).toBeCloseTo(Math.max(0, tsi[i] - tsl[i]), 9);
      expect(x.close).toBe(x.low);
      expect(x.color).toBe('transparent');
    }
  });
  it('barcolor0 on curls in overbought / oversold, bgcolor0 / bgcolor1 on crosses in oversold / overbought', () => {
    expect(res.barColors).toEqual([]);
    expect(res.bgColors).toEqual([]);
    const r = bjTsi.calculate(bars, { showCurl: true, showHiLo: true });
    expect(r.barColors.map((b) => b.time)).toEqual(timesWhere(bars, (i) => conds[7](i) || conds[8](i)));
    expect(r.barColors.every((b) => b.id === 'barcolor0')).toBe(true);
    expect(r.bgColors.filter((b) => b.id === 'bgcolor0').map((b) => b.time)).toEqual(res.alerts[10].times);
    expect(r.bgColors.filter((b) => b.id === 'bgcolor1').map((b) => b.time)).toEqual(res.alerts[9].times);
    expect(r.bgColors.length).toBeGreaterThan(0);
    expect(bjTsi.calculate(bars, { showCurl: true, blankBars: true }).barColors.length).toBe(bars.length);
  });
  it('fills carry the original title', () => {
    expect(res.fills!.map((f) => f.options?.title)).toEqual(new Array(5).fill('Plots Background'));
  });
});

describe('EDGE Panel (blacklab84): alertconditions', () => {
  const bars = walk(1500, 37);
  const res = blacklab.calculate(bars);
  it('declares the 8 conditions of the original', () => {
    expect(blacklab.alertConditions.map((a) => [a.id, a.title])).toEqual([
      ['alert0', 'CMO Cross OS Up'], ['alert1', 'CMO Cross OB Down'], ['alert2', 'CMO Bull Cross'], ['alert3', 'CMO Bear Cross'],
      ['alert4', 'CMO Bull Divergence'], ['alert5', 'CMO Bear Divergence'], ['alert6', 'Trend Starting'], ['alert7', 'Trend Weakening'],
    ]);
    expect(blacklab.alertConditions[0].message).toBe('EDGE Panel: CMO crossed above oversold — bullish momentum!');
    expect(blacklab.Blacklab84Panel.alertConditions).toBe(blacklab.alertConditions);
  });
  it('each condition fires on the bars of the original expression', () => {
    const cmo = values(res.plots.plot2);
    const sig = values(res.plots.plot3);
    const adx = values(res.plots.plot8).map((v) => ((v - 85) / 15) * 100);
    // the divergence dots are drawn 10 bars back (offset = -10) at -97 (bull) / 97 (bear)
    const divAt = (key: string, level: number) => {
      const set = new Set(res.plots[key].filter((pt) => pt.value === level).map((pt) => pt.time));
      return timesWhere(bars, (i) => i >= 10 && set.has(bars[i - 10].time));
    };
    const exp = [
      timesWhere(bars, (i) => xover(cmo, -50, i)),
      timesWhere(bars, (i) => xunder(cmo, 50, i)),
      timesWhere(bars, (i) => xover(cmo, sig, i) && lt(cmo[i], 0)),
      timesWhere(bars, (i) => xunder(cmo, sig, i) && gt(cmo[i], 0)),
      divAt('plot5', -97),
      divAt('plot4', 97),
      timesWhere(bars, (i) => xover(adx, 25, i)),
      timesWhere(bars, (i) => xunder(adx, 25, i)),
    ];
    exp.forEach((t, k) => {
      expect(t.length, `alert${k}`).toBeGreaterThan(0);
      expect(res.alerts[k].times, `alert${k}`).toEqual(t);
    });
  });
});

describe('BNF 25/50 MA Pullback: alertconditions', () => {
  const bars = walk(1500, 41, 6);
  const inputs = { thLongPct: 1, thShortPct: 1 };
  it('declares the two conditions of the original', () => {
    expect(bnf.alertConditions).toEqual([
      { id: 'alert0', title: 'BNF Long Entry', message: 'Uptrend + price below threshold for longs.' },
      { id: 'alert1', title: 'BNF Short Entry', message: 'Downtrend + price above threshold for shorts.' },
    ]);
    expect(bnf.Bnf2550MaPullbackScreener.alertConditions).toBe(bnf.alertConditions);
  });
  it('sigLong / sigShort of the original, and not on an open last bar', () => {
    const close = bars.map((b) => b.close);
    const f = A(ta.sma(Series.fromArray(bars, close), 25));
    const s = A(ta.sma(Series.fromArray(bars, close), 50));
    const sl = (a: number[], i: number) => (i >= 5 ? a[i] - a[i - 5] : NaN);
    const up = (i: number) => gt(f[i], s[i]) && gt(sl(f, i), 0) && gt(sl(s, i), 0);
    const dn = (i: number) => lt(f[i], s[i]) && lt(sl(f, i), 0) && lt(sl(s, i), 0);
    const longT = timesWhere(bars, (i) => up(i) && le(close[i], f[i] * 0.99) && le(close[i], s[i] * 0.99));
    const shortT = timesWhere(bars, (i) => dn(i) && ge(close[i], f[i] * 1.01) && ge(close[i], s[i] * 1.01));
    expect(longT.length).toBeGreaterThan(3);
    expect(shortT.length).toBeGreaterThan(3);
    const res = bnf.calculate(bars, inputs);
    expect(res.alerts[0].times).toEqual(longT);
    expect(res.alerts[1].times).toEqual(shortT);
    // a signal on the last bar needs a closed bar
    const lastL = longT.findIndex((t) => t === bars[bars.length - 1].time);
    const cut = bars.slice(0, bars.findIndex((b) => b.time === longT[longT.length - 1]) + 1);
    expect(lastL).toBe(-1);
    expect(bnf.calculate(cut, inputs).alerts[0].triggered).toBe(true);
    expect(bnf.calculate(cut, inputs, { lastBarConfirmed: false } as ChartContext).alerts[0].triggered).toBe(false);
  });
});

describe('Bollinger Adaptive Trend Navigator: alertconditions', () => {
  const bars = walk(1500, 43);
  const res = batn.calculate(bars);
  it('declares the two conditions of the original', () => {
    expect(batn.alertConditions).toEqual([
      { id: 'alert0', title: 'Bollinger Adaptive Trend Bullish', message: 'Bollinger Adaptive Trend Bullish Signal {{exchange}}:{{ticker}}' },
      { id: 'alert1', title: 'Bollinger Adaptive Trend Bearish', message: 'Bollinger Adaptive Trend Bearish Signal {{exchange}}:{{ticker}}' },
    ]);
    expect(batn.BollingerAdaptiveTrendNavigator.alertConditions).toBe(batn.alertConditions);
  });
  it('isBullish and not isBullish[1] / isBearish and not isBearish[1] from the trend line', () => {
    const tl = values(res.plots.plot0);
    const bull: boolean[] = [];
    const bear: boolean[] = [];
    let b = false;
    let s = false;
    tl.forEach((v, i) => {
      if (i > 0 && gt(v, tl[i - 1])) { b = true; s = false; } else if (i > 0 && lt(v, tl[i - 1])) { b = false; s = true; }
      bull.push(b);
      bear.push(s);
    });
    const up = timesWhere(bars, (i) => bull[i] && !(i > 0 && bull[i - 1]));
    const dn = timesWhere(bars, (i) => bear[i] && !(i > 0 && bear[i - 1]));
    expect(up.length).toBeGreaterThan(1);
    expect(dn.length).toBeGreaterThan(1);
    expect(res.alerts[0].times).toEqual(up);
    expect(res.alerts[1].times).toEqual(dn);
  });
});

describe('Bollinger Awesome Alert: alertconditions', () => {
  const bars = walk(1500, 47);
  it('declares the three conditions of the original', () => {
    expect(bbawe.alertConditions).toEqual([
      { id: 'alert0', title: 'BBAWE Alert', message: 'BBAWE Alert close={{close}}' },
      { id: 'alert1', title: 'BBAWE Sell', message: 'SELL close={{close}}' },
      { id: 'alert2', title: 'BBAWE Buy', message: 'BUY close={{close}}' },
    ]);
    expect(bbawe.BollingerAwesomeAlert.alertConditions).toBe(bbawe.alertConditions);
  });
  for (const inputs of [{}, { bbFilter: true, sqzFilter: true }]) {
    it(`break_down / break_up of the original ${JSON.stringify(inputs)}`, () => {
      const res = bbawe.calculate(bars, inputs);
      const close = bars.map((b) => b.close);
      const cs = Series.fromArray(bars, close);
      const basis = A(ta.sma(cs, 20));
      const dev = A(ta.stdev(cs, 20));
      const upper = basis.map((m, i) => m + 2 * dev[i]);
      const lower = basis.map((m, i) => m - 2 * dev[i]);
      const fast = A(ta.ema(cs, 3));
      const hl2 = Series.fromArray(bars, bars.map((b) => (b.high + b.low) / 2));
      const ao = A(ta.sma(hl2, 5)).map((v, i) => v - A(ta.sma(hl2, 34))[i]);
      const aoDir = (i: number) => (isNaN(ao[i]) ? NaN : ao[i] >= 0 ? (i > 0 && ao[i] > ao[i - 1] ? 1 : 2) : (i > 0 && ao[i] > ao[i - 1] ? -1 : -2));
      const spread = upper.map((u, i) => u - lower[i]);
      const avg = A(ta.sma(Series.fromArray(bars, spread), 100));
      const f = inputs as { bbFilter?: boolean; sqzFilter?: boolean };
      const sq = (i: number) => !f.sqzFilter || (spread[i] / avg[i]) * 100 > 50;
      const dn = timesWhere(bars, (i) => xunder(fast, basis, i) && close[i] < basis[i] && Math.abs(aoDir(i)) === 2
        && (!f.bbFilter || close[i] > lower[i]) && sq(i));
      const up = timesWhere(bars, (i) => xover(fast, basis, i) && close[i] > basis[i] && Math.abs(aoDir(i)) === 1
        && (!f.bbFilter || close[i] < upper[i]) && sq(i));
      expect(dn.length).toBeGreaterThan(3);
      expect(up.length).toBeGreaterThan(3);
      expect(res.alerts[1].times).toEqual(dn);
      expect(res.alerts[2].times).toEqual(up);
      expect(res.alerts[0].times).toEqual([...dn, ...up].sort((a, b) => a - b));
    });
  }
});

describe('Boom Hunter Pro: alertconditions, shape ids, fill', () => {
  const bars = walk(1500, 53, 5);
  const res = boom.calculate(bars);
  const spec = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7', 'shape8', 'shape9'];
  const at = (id: string) => [...new Set(res.markers.filter((m) => m.id === id).map((m) => m.time))];
  it('declares the 16 conditions of the original', () => {
    expect(boom.alertConditions.map((a) => a.title)).toEqual([
      'Crossover', 'Crossunder', 'Long', 'Entry Zone', 'Break Resistance', 'Break Support', 'Crossover - Market Low',
      'Crossunder - Market High', 'Crossover With Pressure', 'Crossunder With Pressure', 'Continuation',
      'Orange - Overbought', 'Red - Overbought', 'Bounce down', 'Bounce up', 'Short',
    ]);
    expect(boom.alertConditions.every((a, k) => a.id === `alert${k}` && a.message === 'Alert Fired!')).toBe(true);
    expect(boom.BoomHunterPro.alertConditions).toBe(boom.alertConditions);
  });
  it('conditions on the oscillator lines', () => {
    const q1 = values(res.plots.plot0);
    const trig = values(res.plots.plot1);
    const Q = (k: string) => values(res.plots[k]).map((v) => (v - 50) / 60);
    const [Q1, Q3, Q5, Q6, Q4] = ['plot0', 'plot2', 'plot3', 'plot4', 'plot5'].map(Q);
    const from = 6; // the plots start at bar 5
    const exp: Array<[number, (i: number) => boolean]> = [
      [0, (i) => xover(q1, trig, i)],
      [1, (i) => xunder(q1, trig, i)],
      [3, (i) => xunder(Q5, -0.9, i)],
      [6, (i) => Q1[i] <= -0.9 && xover(q1, trig, i)],
      [7, (i) => Q1[i] >= 0.9 && xunder(q1, trig, i)],
      [11, (i) => xany(Q5, Q6, i) && Q5[i] > 0.5],
      [12, (i) => xany(Q3, Q4, i) && Q3[i] > 0],
    ];
    for (const [k, f] of exp) {
      const t = timesWhere(bars, (i) => i >= from && f(i));
      expect(t.length, `alert${k}`).toBeGreaterThan(0);
      expect(res.alerts[k].times.filter((x) => x >= bars[from].time), `alert${k}`).toEqual(t);
    }
  });
  it('every marker has the id of its plotshape, on the bars of its condition', () => {
    expect(res.markers.length).toBeGreaterThan(20);
    expect(res.markers.every((m) => spec.includes(m.id as string))).toBe(true);
    expect(at('shape0')).toEqual(res.alerts[11].times);
    expect(at('shape1')).toEqual(res.alerts[12].times);
    expect(at('shape6')).toEqual(res.alerts[15].times);
    expect(at('shape7')).toEqual(res.alerts[10].times);
    expect(at('shape8')).toEqual(res.alerts[13].times);
    expect(at('shape9')).toEqual(res.alerts[14].times);
    const longs = new Set(res.alerts[2].times);
    for (const id of ['shape2', 'shape3', 'shape4', 'shape5']) expect(at(id).every((t) => longs.has(t)), id).toBe(true);
    // 'Long' = enter6 or enter7 or enter5 or enter3; the gray label also needs q1 <= 60
    const q1 = values(res.plots.plot0);
    const shown = new Set([...at('shape3'), ...at('shape4'), ...at('shape5')]);
    for (const t of res.alerts[2].times.filter((x) => !shown.has(x))) {
      const i = bars.findIndex((b) => b.time === t);
      expect(at('shape2').includes(t)).toBe(q1[i] <= 60);
    }
    for (const id of ['shape0', 'shape2', 'shape3', 'shape8', 'shape9']) expect(at(id).length, id).toBeGreaterThan(0);
    const labels = res.markers.filter((m) => m.shape === 'labelDown');
    expect(labels.every((m) => m.position === 'top' && m.size === 'tiny')).toBe(true);
    expect(res.markers.find((m) => m.id === 'shape3')!.color).toBe('rgba(255, 235, 59, 0.8)');
    const none = boom.calculate(bars, { showLongs: false, showShorts: false, showEntry: false });
    expect(idsOf(none.markers).every((id) => ['shape7', 'shape8', 'shape9'].includes(id as string))).toBe(true);
  });
  it('fill between the two red wave lines, with the original title', () => {
    expect(res.fills).toEqual([{ plot1: 'plot2', plot2: 'plot5', options: { color: expect.any(String), title: 'Plots Background' } }]);
    expect(res.plots.plot5.length).toBe(bars.length);
  });
});
