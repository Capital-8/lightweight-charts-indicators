/**
 * Alerts and Style output ids of sixteen community ports (batch 04): the alertcondition() declarations and their
 * per-bar states (`alerts`), checked against conditions computed again in the test from the original expressions
 * (or against the outputs that draw the same condition), and the ids of the markers / background and bar colours /
 * arrows / candles that the host's Style settings look up.
 */

import { describe, it, expect } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as auraSentiment from '../../src/community/aura-sentiment-risk-flow';
import * as auraMatrix from '../../src/community/aura-trend-candlestick-matrix';
import * as auraVortex from '../../src/community/aura-vortex-oscillator';
import * as autoFib from '../../src/community/auto-fib';
import * as autoFibRetr from '../../src/community/auto-fib-retracement-alerts';
import * as autoTrendline from '../../src/community/auto-trendline';
import * as autoTrendSR from '../../src/community/auto-trendlines-support-resistance-signal';
import * as avgBullBear from '../../src/community/average-bullish-bearish-percentage-change';
import * as acbr from '../../src/community/average-candle-bodies-range';
import * as bad from '../../src/community/b-a-d-v0-4';
import * as banker from '../../src/community/banker-fund-flow';
import * as bbStoch from '../../src/community/bb-stoch-rsi';
import * as bernoulli from '../../src/community/bernoulli-process-entropy';
import * as snapper from '../../src/community/big-snapper-alerts';
import * as bubbles from '../../src/community/big-trades-bubbles';

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
    const open = Math.max(1, price + (rand() - 0.5) * 0.5);
    const close = Math.max(1, open + Math.sin(i / 60) * 0.6 + (rand() - 0.5) * vol);
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 2);
    bars.push({ time: T0 + i * step, open, high, low, close, volume: 1000 + Math.floor(rand() * 3000) });
    price = close;
  }
  return bars;
}

type M = { time: unknown; id?: string; position?: string; shape?: string; text?: string; price?: number; color?: string };
const timesWhere = (bars: Bar[], f: (i: number) => boolean) => bars.filter((_, i) => f(i)).map((b) => b.time as number);
const uniqSorted = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const idTimes = (markers: M[], ...ids: string[]) => uniqSorted(markers.filter((m) => ids.includes(m.id ?? '')).map((m) => m.time as number));
const values = (pts: { value: number }[]) => pts.map((p) => p.value);
/** PineScript ta.crossover / ta.crossunder of two series (exact comparisons, na false) */
const xover = (a: number[], b: number[] | number, i: number) => {
  const B = (k: number) => (typeof b === 'number' ? b : b[k]);
  return i > 0 && a[i] > B(i) && a[i - 1] <= B(i - 1);
};
const xunder = (a: number[], b: number[] | number, i: number) => {
  const B = (k: number) => (typeof b === 'number' ? b : b[k]);
  return i > 0 && a[i] < B(i) && a[i - 1] >= B(i - 1);
};
const decls = (list: [string, string][]) => list.map(([title, message], k) => ({ id: `alert${k}`, title, message }));

describe('Aura Sentiment & Risk Flow: alertconditions', () => {
  const bars = walk(1200);
  const res = auraSentiment.calculate(bars);
  const s = values(res.plots.plot0 as { value: number }[]);

  it('declares the three conditions of the original', () => {
    expect(auraSentiment.alertConditions).toEqual(decls([
      ['Aura Buy Signal', 'Aura Flow: BUY Signal - Bullish Sentiment Crossing Up'],
      ['Aura Sell Signal', 'Aura Flow: SELL Signal - Bearish Sentiment Crossing Down'],
      ['Aura Extreme Risk', 'Aura Flow: Extreme Risk Zone - Sentiment at extremes'],
    ]));
    expect(auraSentiment.AuraSentimentRiskFlow.alertConditions).toBe(auraSentiment.alertConditions);
  });

  it('fires on the crosses of the sentiment with 0 and when |sentiment| > 40', () => {
    const buy = timesWhere(bars, (i) => xover(s, 0, i));
    const sell = timesWhere(bars, (i) => xunder(s, 0, i));
    const extreme = timesWhere(bars, (i) => gt(Math.abs(s[i]), 40));
    expect(buy.length).toBeGreaterThan(5);
    expect(sell.length).toBeGreaterThan(5);
    expect(extreme.length).toBeGreaterThan(0);
    expect(res.alerts[0].times).toEqual(buy);
    expect(res.alerts[1].times).toEqual(sell);
    expect(res.alerts[2].times).toEqual(extreme);
    expect(res.alerts[0].times).toEqual(uniqSorted(res.markers.filter((m) => m.text === 'BUY').map((m) => m.time as number)));
  });
});

describe('Aura Trend & Candlestick Matrix: alertconditions', () => {
  const bars = walk(1500, 5);
  const res = auraMatrix.calculate(bars);

  it('declares the two conditions of the original', () => {
    expect(auraMatrix.alertConditions).toEqual(decls([
      ['Bullish Setup', 'Aura Matrix: Bullish Pattern detected aligned with the Trend Cloud!'],
      ['Bearish Setup', 'Aura Matrix: Bearish Pattern detected aligned with the Trend Cloud!'],
    ]));
    expect(auraMatrix.AuraTrendCandlestickMatrix.alertConditions).toBe(auraMatrix.alertConditions);
  });

  it('fires on the bars of the aligned bullish / bearish patterns', () => {
    const bull = uniqSorted(res.markers.filter((m) => m.position === 'belowBar').map((m) => m.time as number));
    const bear = uniqSorted(res.markers.filter((m) => m.position === 'aboveBar').map((m) => m.time as number));
    expect(bull.length).toBeGreaterThan(3);
    expect(bear.length).toBeGreaterThan(3);
    expect(res.alerts[0].times).toEqual(bull);
    expect(res.alerts[1].times).toEqual(bear);
  });
});

describe('Aura Vortex Oscillator: shape ids', () => {
  const res = auraVortex.calculate(walk(1000));
  it('the reversal circles carry shape0 / shape1', () => {
    const bull = res.markers.filter((m) => m.id === 'shape0');
    const bear = res.markers.filter((m) => m.id === 'shape1');
    expect(bull.length).toBeGreaterThan(3);
    expect(bear.length).toBeGreaterThan(3);
    expect(bull.length + bear.length).toBe(res.markers.length);
    expect(bull.every((m) => m.color === auraVortex.defaultInputs.bullColor)).toBe(true);
    expect(bear.every((m) => m.color === auraVortex.defaultInputs.bearColor)).toBe(true);
  });
});

describe('Auto Fibonacci: alertconditions and level labels', () => {
  const bars = walk(1500, 3);
  const n = bars.length;
  const len = autoFib.defaultInputs.length;
  const res = autoFib.calculate(bars);
  // ta.highest / ta.lowest and ta.highestbars / ta.lowestbars (offsets <= 0) of the last `len` bars
  const hb: number[] = [], lb: number[] = [], hi: number[] = [], lo: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < len - 1) { hb.push(NaN); lb.push(NaN); hi.push(NaN); lo.push(NaN); continue; }
    let h = -Infinity, l = Infinity, hk = 0, lk = 0;
    for (let k = 0; k < len; k++) {
      const b = bars[i - k];
      if (b.high > h) { h = b.high; hk = -k; }
      if (b.low < l) { l = b.low; lk = -k; }
    }
    hb.push(hk); lb.push(lk); hi.push(h); lo.push(l);
  }
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const F = ratios.map((r) => bars.map((_, i) => (hb[i] < lb[i] ? (hi[i] - lo[i]) * r + lo[i] : hi[i] - (hi[i] - lo[i]) * r)));
  const close = bars.map((b) => b.close);

  it('declares the twenty conditions of the original', () => {
    const titles = ['Upward Buy', 'Upward Sell', 'Downward Buy', 'Downward Sell']
      .flatMap((k) => ['F236', 'F382', 'F500', 'F618', 'F786'].map((l) => `${k} ${l}`));
    expect(autoFib.alertConditions).toEqual(titles.map((t, k) => ({ id: `alert${k}`, title: `${t} Signal`, message: t })));
    expect(autoFib.AutoFib.alertConditions).toBe(autoFib.alertConditions);
  });

  it('fires on the crosses of the close with the levels, by direction', () => {
    let total = 0;
    ratios.forEach((_, k) => {
      const upBuy = timesWhere(bars, (i) => hb[i] > lb[i] && xover(close, F[k], i));
      const upSell = timesWhere(bars, (i) => hb[i] > lb[i] && xunder(close, F[k], i));
      const dnBuy = timesWhere(bars, (i) => hb[i] < lb[i] && xover(close, F[k], i));
      const dnSell = timesWhere(bars, (i) => hb[i] < lb[i] && xunder(close, F[k], i));
      expect(res.alerts[k].times).toEqual(upBuy);
      expect(res.alerts[5 + k].times).toEqual(upSell);
      expect(res.alerts[10 + k].times).toEqual(dnBuy);
      expect(res.alerts[15 + k].times).toEqual(dnSell);
      total += upBuy.length + upSell.length + dnBuy.length + dnSell.length;
      expect(upBuy.length + dnBuy.length).toBeGreaterThan(2);
    });
    expect(total).toBeGreaterThan(50);
  });

  it('draws the ten labels of the original on the last bar, with their ids', () => {
    expect(res.markers.map((m) => m.id)).toEqual(Array.from({ length: 10 }, (_, k) => `shape${k}`));
    const last = n - 1;
    const future = T0 + (last + 15) * DAY;
    expect(res.markers.slice(0, 8).every((m) => m.time === future && m.shape === 'labelDown')).toBe(true);
    expect(res.markers.slice(0, 8).map((m) => m.text)).toEqual(['%0', '%23.6', '%38.2', '%50', '%61.8', '%78.6', '%100', '%161.8']);
    expect(res.markers[1].price).toBeCloseTo(F[0][last], 8);
    expect(res.markers[8]).toMatchObject({ text: 'Low', shape: 'labelUp', price: lo[last], time: bars[last + lb[last]].time });
    expect(res.markers[9]).toMatchObject({ text: 'High', shape: 'labelDown', price: hi[last], time: bars[last + hb[last]].time });
    expect(autoFib.calculate(bars, { plotF1618: false }).markers.map((m) => m.id)).not.toContain('shape7');
  });
});

describe('Auto Fib Retracement Alerts: alertconditions', () => {
  const bars = walk(1500, 9, 6);
  const res = autoFibRetr.calculate(bars);
  it('declares the two conditions of the original (default message)', () => {
    expect(autoFibRetr.alertConditions).toEqual(decls([['Buy Retrace', 'Alert Fired!'], ['Sell Retrace', 'Alert Fired!']]));
    expect(autoFibRetr.AutoFibRetracementAlerts.alertConditions).toBe(autoFibRetr.alertConditions);
  });
  it('fires on the bars of the retrace signals', () => {
    const buy = uniqSorted(res.markers.filter((m) => m.text === 'Buy Retrace').map((m) => m.time as number));
    const sell = uniqSorted(res.markers.filter((m) => m.text === 'Sell Retrace').map((m) => m.time as number));
    expect(buy.length + sell.length).toBeGreaterThan(3);
    expect(res.alerts[0].times).toEqual(buy);
    expect(res.alerts[1].times).toEqual(sell);
  });
});

describe('Auto Trendline: alertconditions and shape ids', () => {
  const bars = walk(1500, 21);
  const n = bars.length;
  const p = 10;
  const res = autoTrendline.calculate(bars);
  // ph = ta.pivothigh(n, n)[1], pl = ta.pivotlow(n, n)[1]
  const phRaw = ta.pivothigh(new Series(bars, (b) => b.high), p, p).toArray();
  const plRaw = ta.pivotlow(new Series(bars, (b) => b.low), p, p).toArray();
  const fin = (v: number | null | undefined) => v != null && !Number.isNaN(v);
  const up = bars.map((_, t) => t >= 1 && fin(phRaw[t - 1]));
  const dn = bars.map((_, t) => t >= 1 && fin(plRaw[t - 1]));
  // the lines through the two most recent up / down fractals, at the current bar
  const yUp: number[] = [], yDn: number[] = [];
  let u1 = NaN, iu1 = NaN, u2 = NaN, iu2 = NaN, d1 = NaN, id1 = NaN, d2 = NaN, id2 = NaN;
  for (let t = 0; t < n; t++) {
    if (dn[t]) { d2 = d1; id2 = id1; d1 = bars[t - p - 1].low; id1 = t - p - 1; }
    if (up[t]) { u2 = u1; iu2 = iu1; u1 = bars[t - p - 1].high; iu1 = t - p - 1; }
    const mD = (d2 - d1) / (id2 - id1), mU = (u2 - u1) / (iu2 - iu1);
    yDn.push(mD * t + d1 - mD * id1);
    yUp.push(mU * t + u1 - mU * iu1);
  }
  const close = bars.map((b) => b.close);
  const cross = (y: number[], t: number) => xover(close, y, t) || xunder(close, y, t);

  it('declares the two conditions of the original', () => {
    expect(autoTrendline.alertConditions).toEqual(decls([
      ['New trendline formed', 'New trendline formed'],
      ['Upper/lower trendline crossed', 'Upper/lower trendline crossed'],
    ]));
    expect(autoTrendline.AutoTrendline.alertConditions).toBe(autoTrendline.alertConditions);
  });

  it('fires on new fractals and on the crosses of the close with the trendlines', () => {
    const fresh = timesWhere(bars, (t) => up[t] || dn[t]);
    const crossed = timesWhere(bars, (t) => cross(yUp, t) || cross(yDn, t));
    expect(fresh.length).toBeGreaterThan(20);
    expect(crossed.length).toBeGreaterThan(10);
    expect(res.alerts[0].times).toEqual(fresh);
    expect(res.alerts[1].times).toEqual(crossed);
    // the crosses fire whether they are shown or not; shown, they carry shape4 / shape5
    const shown = autoTrendline.calculate(bars, { showCrosses: true });
    expect(shown.alerts[1].times).toEqual(crossed);
    expect(uniqSorted([...idTimes(shown.markers, 'shape4'), ...idTimes(shown.markers, 'shape5')])).toEqual(crossed);
    expect(idTimes(shown.markers, 'shape4')).toEqual(timesWhere(bars, (t) => cross(yUp, t)));
  });

  it('the fractal markers carry the ids of HH / LH / LL / HL', () => {
    const all = autoTrendline.calculate(bars, { showHH: true, showLL: true });
    const byText: Record<string, string> = { HH: 'shape0', LH: 'shape1', LL: 'shape2', HL: 'shape3' };
    expect(all.markers.length).toBeGreaterThan(20);
    for (const m of all.markers) expect(m.id).toBe(byText[m.text!]);
    expect(new Set(all.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape1', 'shape2', 'shape3']));
  });
});

describe('Auto TrendLines Support Resistance: shape ids', () => {
  const res = autoTrendSR.calculate(walk(1500, 17, 5));
  it('every signal triangle carries the id of its Break / React output', () => {
    expect(res.markers.length).toBeGreaterThan(5);
    for (const m of res.markers) {
      const k = Number(/^shape(\d+)$/.exec(m.id ?? '')?.[1]);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(16);
      const upLine = Math.floor(k / 2) % 2 === 0;
      const isBreak = k % 2 === 0;
      expect(m.shape).toBe(upLine === isBreak ? 'triangleDown' : 'triangleUp');
      expect(m.position).toBe(upLine === isBreak ? 'aboveBar' : 'belowBar');
    }
  });
});

describe('Average Bullish & Bearish Percentage Change: alertconditions', () => {
  const bars = walk(1200, 4);
  const count = 10;
  const res = avgBullBear.calculate(bars, { avgType: 'Simple' });
  // simple averages of the last 10 bullish / bearish percentage moves (Net Move)
  const bull: number[] = [], bear: number[] = [];
  const bavg: number[] = [], savg: number[] = [];
  bars.forEach((b, i) => {
    if (i > 0) {
      const d = b.close - bars[i - 1].close;
      if (d >= 0) { bull.push((d / bars[i - 1].close) * 100); if (bull.length > count) bull.shift(); }
      else { bear.push((Math.abs(d) / bars[i - 1].close) * 100); if (bear.length > count) bear.shift(); }
    }
    bavg.push(bull.length ? bull.reduce((a, v) => a + v, 0) / bull.length : NaN);
    savg.push(bear.length ? bear.reduce((a, v) => a + v, 0) / bear.length : NaN);
  });

  it('declares the two conditions of the original (default message)', () => {
    expect(avgBullBear.alertConditions).toEqual(decls([
      ['Bullish %\u{1D71F} > Bearish %\u{1D71F}', 'Alert Fired!'],
      ['Bearish %\u{1D71F} > Bullish %\u{1D71F}', 'Alert Fired!'],
    ]));
    expect(avgBullBear.AverageBullishBearishPercentageChange.alertConditions).toBe(avgBullBear.alertConditions);
  });

  it('fires on the crosses of the two averages', () => {
    const over = timesWhere(bars, (i) => xover(bavg, savg, i));
    const under = timesWhere(bars, (i) => xover(savg, bavg, i));
    expect(over.length).toBeGreaterThan(5);
    expect(under.length).toBeGreaterThan(5);
    expect(res.alerts[0].times).toEqual(over);
    expect(res.alerts[1].times).toEqual(under);
  });
});

describe('+ Average Candle Bodies Range: alertconditions and output ids', () => {
  const bars = walk(1500, 8);
  const res = acbr.calculate(bars);
  const a = values(res.plots.plot0 as { value: number }[]);
  const s = values(res.plots.plot1 as { value: number }[]);
  const up = values(res.plots.plot2 as { value: number }[]);
  const lo = values(res.plots.plot3 as { value: number }[]);

  it('declares the ten conditions of the original', () => {
    expect(acbr.alertConditions).toEqual(decls([
      ['Continuation Trade - Bullish', 'Bullish continuation trade by ACBR.'],
      ['Continuation Trade - Bearish', 'Bearish continuation trade by ACBR.'],
      ['Exit Long Quickly', 'Exit long trade, by ACBR.'],
      ['Exit Long Slowly', 'Exit long trade, by ACBR.'],
      ['Exit Short Quickly', 'Exit short trade, by ACBR.'],
      ['Exit Short Slowly', 'Exit short trade, by ACBR.'],
      ['ACBR Crossing Above Upper Baseline', 'ACBR has crossed above the upper baseline.'],
      ['ACBR Crossing Below Lower Baseline', 'ACBR has crossed below the lower baseline.'],
      ['ACBR Crossing Above Signal Line Trade Entry', 'ACBR has crossed above the signal line. Possible trade entry.'],
      ['ACBR Crossing Below Signal Line Trade Entry', 'ACBR has crossed below the signal line. Possible trade entry.'],
    ]));
    expect(acbr.AverageCandleBodiesRange.alertConditions).toBe(acbr.alertConditions);
  });

  it('fires on the bars of the original expressions', () => {
    const sx = (i: number) => xover(a, s, i), su = (i: number) => xunder(a, s, i);
    const expected = [
      (i: number) => gt(a[i], 0) && i > 0 && lt(a[i - 1], s[i]) && sx(i),
      (i: number) => lt(a[i], 0) && i > 0 && gt(a[i - 1], s[i]) && su(i),
      (i: number) => gt(s[i], 0) && su(i),
      (i: number) => xunder(a, up, i),
      (i: number) => lt(s[i], 0) && sx(i),
      (i: number) => xover(a, lo, i),
      (i: number) => (gt(up[i], 0) && xover(a, up, i)) || (gt(lo[i], 0) && xover(a, lo, i)),
      (i: number) => (lt(up[i], 0) && xunder(a, up, i)) || (lt(lo[i], 0) && xunder(a, lo, i)),
      (i: number) => gt(a[i], 0) && sx(i),
      (i: number) => lt(a[i], 0) && su(i),
    ].map((f) => timesWhere(bars, f));
    expected.forEach((t, k) => expect(res.alerts[k].times).toEqual(t));
    expect(expected.filter((t) => t.length > 0).length).toBeGreaterThanOrEqual(8);
  });

  it('markers, background and bar colours carry the ids of their outputs', () => {
    expect(idTimes(res.markers, 'shape0')).toEqual(res.alerts[0].times);
    expect(idTimes(res.markers, 'shape1')).toEqual(res.alerts[1].times);
    expect(idTimes(res.markers, 'shape5')).toEqual(res.alerts[3].times);
    expect(idTimes(res.markers, 'shape3')).toEqual(res.alerts[5].times);
    expect(res.markers.every((m) => ['shape0', 'shape1', 'shape3', 'shape5'].includes(m.id!))).toBe(true);
    const opts = { signalBgInput: true, signalBarcolorInput: true, blineStrongXInput: true, blineWeakXInput: true,
      signalStrongXInput: true, signalWeakXInput: true };
    for (const r of [res, acbr.calculate(bars, opts), acbr.calculate(bars, { ...opts, signalLineStrongInput: false })]) {
      expect(r.bgColors.length).toBeGreaterThan(0);
      expect(r.barColors.length).toBeGreaterThan(0);
      expect(r.bgColors.every((c) => /^bgcolor[0-3]$/.test(c.id ?? ''))).toBe(true);
      expect(r.barColors.every((c) => /^barcolor[0-7]$/.test(c.id ?? ''))).toBe(true);
    }
    const ids = new Set([...acbr.calculate(bars, opts).barColors, ...acbr.calculate(bars, { ...opts, signalLineStrongInput: false }).barColors].map((c) => c.id));
    expect(ids.size).toBeGreaterThanOrEqual(4);
  });
});

describe('B + A + D: alertcondition and output ids', () => {
  const bars = walk(1500, 13);
  const res = bad.calculate(bars);
  it('declares the condition of the original', () => {
    expect(bad.alertConditions).toEqual(decls([['Signal Confirmed', 'HISTOGRAM CONFIRMED: {{ticker}} - {{interval}}']]));
    expect(bad.BadV04.alertConditions).toBe(bad.alertConditions);
  });
  it('fires on the bull / bear reversal bars, which carry shape0 / shape1', () => {
    const t = idTimes(res.markers, 'shape0', 'shape1');
    expect(idTimes(res.markers, 'shape0').length).toBeGreaterThan(3);
    expect(idTimes(res.markers, 'shape1').length).toBeGreaterThan(3);
    expect(res.alerts[0].times).toEqual(t);
    expect(res.markers.every((m) => m.id === 'shape0' || m.id === 'shape1')).toBe(true);
    expect(res.bgColors.length).toBeGreaterThan(0);
    expect(new Set(res.bgColors.map((c) => c.id))).toEqual(new Set(['bgcolor0', 'bgcolor1']));
  });
});

describe('Banker Fund Flow: alertconditions and the five candle outputs', () => {
  const bars = walk(1500, 23);
  const res = banker.calculate(bars);
  const fft = values(res.plots.plot0 as { value: number }[]);
  const bbl = values(res.plots.plot1 as { value: number }[]);

  it('declares the five conditions of the original', () => {
    expect(banker.alertConditions).toEqual(decls([
      ['Alert on Yellow Candle', 'Yellow Candle!'], ['Alert on Green Candle', 'Green Candle!'],
      ['Alert on White Candle', 'White Candle!'], ['Alert on Red Candle', 'Red Candle!'], ['Alert on Blue Candle', 'Blue Candle!'],
    ]));
    expect(banker.BankerFundFlow.alertConditions).toBe(banker.alertConditions);
  });

  it('draws the five candle outputs in the original order, each on the bars of its alert', () => {
    const keys = Object.keys(res.plotCandles);
    expect(keys).toHaveLength(5);
    // (the fund flow candles need both values: compared from the first bar where both are plotted)
    const start = bars[bars.findIndex((_, i) => !isNaN(fft[i]) && !isNaN(bbl[i]))].time as number;
    keys.forEach((k, j) => {
      const from = (t: number[]) => t.filter((x) => x >= start);
      expect(from(res.plotCandles[k].map((c) => c.time as number))).toEqual(from(res.alerts[j].times));
      expect(new Set(res.plotCandles[k].map((c) => c.color)).size).toBeLessThanOrEqual(1);
    });
    expect(res.plotCandles[keys[0]].every((c) => c.open === 0 && c.close === 50)).toBe(true);
    expect(res.alerts.every((a) => a.times.length > 0)).toBe(true);
  });

  it('fires on the bars of the original expressions (bars with plotted values)', () => {
    const from = bars.findIndex((_, i) => !isNaN(fft[i]) && !isNaN(bbl[i])) + 1;
    const inRange = (k: number) => res.alerts[k].times.filter((t) => t >= (bars[from].time as number));
    const r95 = (i: number) => fft[i - 1] * 0.95;
    const exp = [
      (i: number) => fft[i] > bbl[i] && fft[i - 1] <= bbl[i - 1] && bbl[i] < 25,
      (i: number) => fft[i] > bbl[i],
      (i: number) => fft[i] < r95(i),
      (i: number) => fft[i] < bbl[i],
      (i: number) => fft[i] < bbl[i] && fft[i] > r95(i),
    ].map((f) => timesWhere(bars, (i) => i >= from && f(i)));
    exp.forEach((t, k) => expect(inRange(k)).toEqual(t));
  });
});

describe('BB Stochastic RSI Extreme Signal: alertconditions', () => {
  const bars = walk(1500, 31, 3);
  const res = bbStoch.calculate(bars);
  const upper = values(res.plots.plot1 as { value: number }[]);
  const lower = values(res.plots.plot2 as { value: number }[]);
  // k / d of the stochastic RSI, recomputed
  const close = new Series(bars, (b) => b.close);
  const rsi = ta.rsi(close, 14).toArray().map((v) => v ?? NaN);
  const stoch = rsi.map((r, i) => {
    if (i < 13) return NaN;
    const w = rsi.slice(i - 13, i + 1);
    const h = Math.max(...w), l = Math.min(...w);
    return w.some((v) => isNaN(v)) || h === l ? NaN : ((r - l) / (h - l)) * 100;
  });
  const sma = (a: number[], len: number) => a.map((_, i) => (i < len - 1 ? NaN : a.slice(i - len + 1, i + 1).reduce((x, v) => x + v, 0) / len));
  const k = sma(stoch, 3);
  const d = sma(k, 3);
  const c = bars.map((b) => b.close);

  it('declares the three conditions of the original', () => {
    expect(bbStoch.alertConditions).toEqual(decls([
      ['Any Signal', '{{exchange}}:{{ticker}} {{interval}} BB Stochastic Extreme!'],
      ['Bearish Signal', '{{exchange}}:{{ticker}} {{interval}} Bearish BB Stochastic Extreme!'],
      ['Bullish Signal', '{{exchange}}:{{ticker}} {{interval}} Bullish BB Stochastic Extreme!'],
    ]));
    expect(bbStoch.BBStochRSI.alertConditions).toBe(bbStoch.alertConditions);
  });

  it('fires on the bars of the original expressions', () => {
    const bear = timesWhere(bars, (i) => i > 20 && c[i - 1] > upper[i - 1] && c[i] < upper[i] && k[i - 1] > 90 && d[i - 1] > 90);
    const bull = timesWhere(bars, (i) => i > 20 && c[i - 1] < lower[i - 1] && c[i] > lower[i] && k[i - 1] < 10 && d[i - 1] < 10);
    expect(bear.length).toBeGreaterThan(0);
    expect(bull.length).toBeGreaterThan(0);
    expect(res.alerts[1].times).toEqual(bear);
    expect(res.alerts[2].times).toEqual(bull);
    expect(res.alerts[0].times).toEqual(uniqSorted([...bear, ...bull]));
    expect(uniqSorted(res.markers.map((m) => m.time as number))).toEqual(res.alerts[0].times);
  });
});

describe('Bernoulli Process: alertconditions', () => {
  const bars = walk(1500, 41);
  const res = bernoulli.calculate(bars);
  const info2 = values(res.plots.plot1 as { value: number }[]);
  const hvp = ta.percentrank(Series.fromArray(bars, info2), 88).toArray().map((v) => v ?? NaN);

  it('declares the two conditions of the original', () => {
    expect(bernoulli.alertConditions).toEqual(decls([
      ['Alert on Down Triangle', 'Bernoulli Down Triangle!'], ['Alert on Up Triangle', 'Bernoulli Up Triangle!'],
    ]));
    expect(bernoulli.BernoulliProcessEntropy.alertConditions).toBe(bernoulli.alertConditions);
  });

  it('fires when the percent rank crosses 95 upwards / 5 downwards', () => {
    const down = timesWhere(bars, (i) => i > 0 && hvp[i - 1] < 95 && hvp[i] > 95);
    const up = timesWhere(bars, (i) => i > 0 && hvp[i - 1] > 5 && hvp[i] < 5);
    expect(down.length).toBeGreaterThan(3);
    expect(up.length).toBeGreaterThan(3);
    expect(res.alerts[0].times).toEqual(down);
    expect(res.alerts[1].times).toEqual(up);
  });
});

describe('Big Snapper Alerts: arrows and BB fill', () => {
  const bars = walk(1500, 51);
  it('the ColouredMA signals are arrows (arrow0), not markers', () => {
    const res = snapper.calculate(bars, { filterOption: 'ColouredMA' });
    const cols = (res.plots.colouredMA as { color: string }[]).map((p) => p.color);
    const warmup = Math.max(18, 21, 55, 89, 5, 20) + 5;
    const bull = '#1E90FF';
    const upT = timesWhere(bars, (i) => i >= warmup && cols[i] === bull && cols[i - 1] !== bull);
    const dnT = timesWhere(bars, (i) => i >= warmup && cols[i] !== bull && cols[i - 1] === bull);
    expect(upT.length).toBeGreaterThan(5);
    expect(res.markers).toHaveLength(0);
    expect(res.arrows.every((a) => a.id === 'arrow0')).toBe(true);
    expect(res.arrows.filter((a) => a.value === 1).map((a) => a.time)).toEqual(upT);
    expect(res.arrows.filter((a) => a.value === -1).map((a) => a.time)).toEqual(dnT);
  });
  it('the MACross signals are arrows; the filtered signals stay markers', () => {
    const cross = snapper.calculate(bars, { filterOption: 'MACross' });
    expect(cross.arrows.length).toBeGreaterThan(5);
    expect(cross.markers).toHaveLength(0);
    const st = snapper.calculate(bars);
    expect(st.arrows).toHaveLength(0);
    expect(st.markers.length).toBeGreaterThan(5);
  });
  it('fills between the Bollinger Bands with the original title', () => {
    const res = snapper.calculate(bars, { showBollingerBands: true });
    expect(res.fills).toEqual([{ plot1: 'bbUpper', plot2: 'bbLower', options: { title: 'BB fill', color: 'rgba(30, 144, 255, 0.04)' } }]);
    expect((res.plots.bbUpper as { value: number }[]).some((p) => !isNaN(p.value))).toBe(true);
    expect((snapper.calculate(bars).plots.bbUpper as { value: number }[]).every((p) => isNaN(p.value))).toBe(true);
  });
});

describe('Big Trades Bubbles: alertconditions and shape ids', () => {
  const bars = walk(1500, 61);
  const res = bubbles.calculate(bars);
  const lookback = 2, sigma = 1.5;
  const buyProxy = bars.map((b) => (b.high - b.low > 0 ? ((b.close - b.low) / (b.high - b.low)) * b.volume! : 0));
  const sellProxy = bars.map((b) => (b.high - b.low > 0 ? ((b.high - b.close) / (b.high - b.low)) * b.volume! : 0));
  // z-score against the mean / population stdev of the `lookback` bars before
  const z = (p: number[], i: number) => {
    if (i < lookback) return 0;
    const w = p.slice(i - lookback, i);
    const m = w.reduce((a, v) => a + v, 0) / lookback;
    const sd = Math.sqrt(w.reduce((a, v) => a + (v - m) ** 2, 0) / lookback);
    return sd > 0 ? (p[i] - m) / sd : 0;
  };
  const loc = (b: Bar) => (b.high - b.low > 0 ? (b.close - b.low) / (b.high - b.low) : 0.5);
  const body = (b: Bar) => (b.high - b.low > 0 ? Math.abs(b.close - b.open) / (b.high - b.low) : 0);

  it('declares the six conditions of the original', () => {
    expect(bubbles.alertConditions).toEqual(decls([
      ['Big Buy', 'Big Buy pressure detected'], ['Big Sell', 'Big Sell pressure detected'],
      ['Bull Absorption', 'Bull absorption detected'], ['Bear Absorption', 'Bear absorption detected'],
      ['Deep Buy Pressure', 'Deep buy pressure detected'], ['Deep Sell Pressure', 'Deep sell pressure detected'],
    ]));
    expect(bubbles.BigTradesBubbles.alertConditions).toBe(bubbles.alertConditions);
  });

  it('fires on big buys / sells of the original expressions', () => {
    const buy = timesWhere(bars, (i) => gt(z(buyProxy, i), sigma) && gt(loc(bars[i]), 0.55) && body(bars[i]) >= 0.15);
    const sell = timesWhere(bars, (i) => gt(z(sellProxy, i), sigma) && lt(loc(bars[i]), 0.45) && body(bars[i]) >= 0.15);
    const bull = timesWhere(bars, (i) => gt(z(buyProxy, i), sigma) && body(bars[i]) <= 0.55 && lt(loc(bars[i]), 0.7));
    expect(buy.length).toBeGreaterThan(5);
    expect(sell.length).toBeGreaterThan(5);
    expect(res.alerts[0].times).toEqual(buy);
    expect(res.alerts[1].times).toEqual(sell);
    expect(res.alerts[2].times).toEqual(bull);
  });

  it('the markers carry the ids of their outputs and match the alerts', () => {
    expect(res.markers.every((m) => /^shape[0-9]$/.test(m.id ?? ''))).toBe(true);
    expect(idTimes(res.markers, 'shape0', 'shape1', 'shape2')).toEqual(res.alerts[0].times);
    expect(idTimes(res.markers, 'shape3', 'shape4', 'shape5')).toEqual(res.alerts[1].times);
    const after = (k: number) => res.alerts[k].times.filter((t) => t >= (bars[14].time as number));
    expect(idTimes(res.markers, 'shape6')).toEqual(after(2));
    expect(idTimes(res.markers, 'shape7')).toEqual(after(3));
    expect(idTimes(res.markers, 'shape8')).toEqual(after(4));
    expect(idTimes(res.markers, 'shape9')).toEqual(after(5));
    expect(res.markers.filter((m) => m.id === 'shape6').every((m) => m.shape === 'diamond')).toBe(true);
    expect(new Set(res.markers.map((m) => m.id)).size).toBeGreaterThanOrEqual(8);
  });
});
