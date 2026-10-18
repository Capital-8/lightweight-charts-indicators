/**
 * Community ports, batch 07: the alertcondition() declarations and the bars on which each condition is true
 * (re-computed here from the original's expression), the alert() calls, and the Style ids on the emitted markers /
 * background colours / bar colours.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as breakoutOsc from '../../src/community/candle-breakout-oscillator';
import * as buySellSr from '../../src/community/candle-buy-sell-support-resistance';
import * as colorFlip from '../../src/community/candle-color-flip';
import * as countRsi from '../../src/community/candle-count-rsi';
import * as crtFlux from '../../src/community/candle-range-theory-flux-charts';
import * as crt from '../../src/community/candle-range-trading';
import * as spreadOsc from '../../src/community/candle-spread-oscillator';
import * as candleState from '../../src/community/candle-state';
import * as patterns from '../../src/community/candlestick-patterns-identified';
import * as reversal from '../../src/community/candlestick-reversal';
import * as trendInd from '../../src/community/candlestick-trend-indicator';
import * as cardwell from '../../src/community/cardwell-rsi-by-tq';
import * as cbc from '../../src/community/cbc-flip-with-volume';
import * as cciHash from '../../src/community/cci-hash-capital';
import * as cciStoch from '../../src/community/cci-stochastic';
import * as chandelier from '../../src/community/chandelier-exit';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

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
const crossover = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v > (typeof b === 'number' ? b : b[i]) && a[i - 1] <= (typeof b === 'number' ? b : b[i - 1]));
const crossunder = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v < (typeof b === 'number' ? b : b[i]) && a[i - 1] >= (typeof b === 'number' ? b : b[i - 1]));
const idTimes = (markers: { id?: string; time: number }[], id: string) => markers.filter((m) => m.id === id).map((m) => m.time);
const boolTimes = (list: Bar[], flags: boolean[]) => timesWhere(list, (i) => flags[i]);

describe('Candle Breakout Oscillator: Style ids', () => {
  const bars = walk(1200, 11);
  const r = breakoutOsc.calculate(bars);
  it('the cross circles carry shape0 (bullish) / shape1 (bearish)', () => {
    const bu = values(r.plots.plot0);
    const be = values(r.plots.plot1);
    const bull = timesWhere(bars, (i) => i > 0 && gt(bu[i], be[i]) && !gt(bu[i - 1], be[i - 1]) && !isNaN(bu[i - 1]) && !isNaN(be[i - 1]));
    const bear = timesWhere(bars, (i) => i > 0 && gt(be[i], bu[i]) && !gt(be[i - 1], bu[i - 1]) && !isNaN(bu[i - 1]) && !isNaN(be[i - 1]));
    expect(bull.length).toBeGreaterThan(5);
    expect(idTimes(r.markers, 'shape0')).toEqual(bull);
    expect(idTimes(r.markers, 'shape1')).toEqual(bear);
    expect(r.markers.every((m) => m.id === 'shape0' || m.id === 'shape1')).toBe(true);
  });
});

describe('Candle BUY SELL + Support Resistance: alertconditions', () => {
  const bars = walk(1500, 3);
  it('declares the two conditions of the original', () => {
    expect(decls(buySellSr)).toEqual([
      ['alert0', 'Candle BUY', 'Candle BUY signal detected.'],
      ['alert1', 'Candle SELL', 'Candle SELL signal detected.'],
    ]);
    expect(buySellSr.CandleBuySellSupportResistance.alertConditions).toBe(buySellSr.alertConditions);
  });
  it('fires on engulfing / hammer (buy) and engulfing / shooting star (sell) bars, also with hidden labels', () => {
    const f = (i: number) => {
      const b = bars[i];
      const body = Math.abs(b.close - b.open);
      const range = b.high - b.low;
      const uw = b.high - Math.max(b.open, b.close);
      const lw = Math.min(b.open, b.close) - b.low;
      const p = bars[i - 1];
      const bull = (x: Bar) => x.close > x.open;
      const bear = (x: Bar) => x.close < x.open;
      const be = i > 0 && bull(b) && bear(p) && b.open <= p.close && b.close >= p.open;
      const se = i > 0 && bear(b) && bull(p) && b.open >= p.close && b.close <= p.open;
      return { buy: be || (range > 0 && lw >= body * 2 && uw <= body), sell: se || (range > 0 && uw >= body * 2 && lw <= body) };
    };
    const buy = timesWhere(bars, (i) => f(i).buy);
    const sell = timesWhere(bars, (i) => f(i).sell);
    expect(buy.length).toBeGreaterThan(20);
    expect(sell.length).toBeGreaterThan(20);
    for (const showSignals of [true, false]) {
      const r = buySellSr.calculate(bars, { showSignals });
      expect(r.alerts[0].times).toEqual(buy);
      expect(r.alerts[1].times).toEqual(sell);
    }
  });
});

describe('Candle Color Flip: alertconditions', () => {
  const bars = walk(1500, 5);
  const expected = (lastOpen: boolean) => {
    const last = bars.length - 1;
    const conf = (i: number) => !(lastOpen && i === last);
    const bull = timesWhere(bars, (i) => i > 0 && conf(i) && bars[i - 1].close < bars[i - 1].open && bars[i].low >= bars[i - 1].low);
    const bear = timesWhere(bars, (i) => i > 0 && conf(i) && bars[i - 1].close > bars[i - 1].open && bars[i].high <= bars[i - 1].high);
    return [bull, bear];
  };
  it('declares the two conditions of the original (placeholders kept)', () => {
    expect(decls(colorFlip)).toEqual([
      ['alert0', 'Red to Green Candle Flip', '{{ticker}} {{interval}} – Candle failed to make a lower low after a red bar. Close: {{close}}'],
      ['alert1', 'Green to Red Candle Flip', '{{ticker}} {{interval}} – Candle failed to make a higher high after a green bar. Close: {{close}}'],
    ]);
    expect(colorFlip.CandleColorFlip.alertConditions).toBe(colorFlip.alertConditions);
  });
  it('fires on the flips of confirmed bars', () => {
    const [bull, bear] = expected(false);
    expect(bull.length).toBeGreaterThan(20);
    const r = colorFlip.calculate(bars);
    expect(r.alerts[0].times).toEqual(bull);
    expect(r.alerts[1].times).toEqual(bear);
  });
  it('an open last bar is not confirmed', () => {
    const cut = bars.slice(0, Math.max(...expected(false)[0].map((t) => bars.findIndex((b) => b.time === t))) + 1);
    expect(colorFlip.calculate(cut).alerts[0].triggered).toBe(true);
    const open = colorFlip.calculate(cut, {}, { lastBarConfirmed: false } as ChartContext);
    expect(open.alerts[0].triggered).toBe(false);
  });
});

describe('Candle Count RSI: Style ids of the backgrounds', () => {
  const bars = walk(1200, 7);
  it('each background carries the id of its bgcolor call; chart ones are forced on the price pane', () => {
    const r = countRsi.calculate(bars, { showChartGlow: true, showDivChart: true });
    const ids = new Set(r.bgColors.map((b) => b.id));
    expect([...ids].sort()).toEqual(['bgcolor0', 'bgcolor1', 'bgcolor2', 'bgcolor3', 'bgcolor4', 'bgcolor5', 'bgcolor6', 'bgcolor7']);
    for (const b of r.bgColors) {
      expect(!!b.forceOverlay).toBe(['bgcolor2', 'bgcolor3', 'bgcolor6', 'bgcolor7'].includes(b.id!));
    }
    // a subpane glow and its chart glow have the same colour on the same bars
    const sub = r.bgColors.filter((b) => b.id === 'bgcolor0').map((b) => [b.time, b.color]);
    const chart = r.bgColors.filter((b) => b.id === 'bgcolor2').map((b) => [b.time, b.color]);
    expect(sub.length).toBeGreaterThan(50);
    expect(chart).toEqual(sub);
  });
});

describe('Candle Range Theory | Flux Charts: alertconditions and alert() calls', () => {
  // 15-minute bars with calm and wide 4-hour candles (the default higher timeframe): bulky candles, breaks, gaps
  const bars = ((): Bar[] => {
    let seed = 8;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const out: Bar[] = [];
    let p = 100;
    let vol = 0.3;
    for (let i = 0; i < 1500; i++) {
      if (i % 16 === 0) vol = rnd() < 0.15 ? 1.5 + rnd() * 2 : 0.1 + rnd() * 0.3;
      const o = p + (rnd() - 0.5) * 0.3 * vol;
      p = Math.max(5, o + (rnd() - 0.5) * 2 * vol);
      out.push({ time: 1577836800 + i * 900, open: o, high: Math.max(o, p) + rnd() * 0.5 * vol, low: Math.min(o, p) - rnd() * 0.5 * vol, close: p, volume: 1e6 });
    }
    return out;
  })();
  const full = crtFlux.calculate(bars, { tpslMethod: 'Fixed' });
  const index = (t: number) => bars.findIndex((b) => b.time === t);
  const tpBars = full.markers.filter((m) => m.text === 'TP').map((m) => index(m.time));
  const slBars = full.markers.filter((m) => m.text === 'SL').map((m) => index(m.time));
  const buyBars = full.labels.filter((l) => l.text === 'Buy').map((l) => index(l.time));
  const sellBars = full.labels.filter((l) => l.text === 'Sell').map((l) => index(l.time));

  it('declares the four conditions and the alert function', () => {
    expect(decls(crtFlux)).toEqual([
      ['alert0', 'Buy Signal', ''], ['alert1', 'Sell Signal', ''], ['alert2', 'Take-Profit Signal', ''], ['alert3', 'Stop-Loss Signal', ''],
    ]);
    expect(crtFlux.hasAlertFunction).toBe(true);
    expect(crtFlux.CandleRangeTheoryFluxCharts.hasAlertFunction).toBe(true);
    expect(crtFlux.CandleRangeTheoryFluxCharts.alertConditions).toBe(crtFlux.alertConditions);
  });

  it('the history before the last closed bar is the initial run: no alert there', () => {
    expect(buyBars.length + sellBars.length).toBeGreaterThan(2);
    expect(tpBars.length + slBars.length).toBeGreaterThan(2);
    const last = bars[bars.length - 1].time;
    for (const a of full.alerts) expect(a.times.every((t) => t === last)).toBe(true);
    expect(full.alertCalls.every((c) => c.time === last)).toBe(true);
  });

  it('on the last closed bar: one condition and one call per event of the bar', () => {
    const events = [...new Set([...buyBars, ...sellBars, ...tpBars, ...slBars])].sort((a, b) => a - b).slice(0, 8);
    // the take profit test runs before the stop test: a bar that reaches both gives both conditions (the SL marker only)
    const tpReached = (k: number) => {
      const entry = Math.max(...[...buyBars, ...sellBars].filter((e) => e < k));
      const price = bars[entry].close;
      return buyBars.includes(entry) ? (bars[k].high / price - 1) * 100 >= 0.3 : (bars[k].low / price - 1) * 100 <= -0.3;
    };
    expect(slBars.some(tpReached)).toBe(true);
    for (const k of events) {
      const want = [buyBars.includes(k), sellBars.includes(k), tpBars.includes(k) || (slBars.includes(k) && tpReached(k)), slBars.includes(k)];
      const t = bars[k].time;
      const check = (r: ReturnType<typeof crtFlux.calculate>) => {
        r.alerts.forEach((a, j) => expect(a.times).toEqual(want[j] ? [t] : []));
        expect(r.alertCalls).toEqual(crtFlux.alertConditions.filter((_, j) => want[j]).map((d) => ({ time: t, message: d.title, freq: 'once_per_bar' })));
      };
      check(crtFlux.calculate(bars.slice(0, k + 1), { tpslMethod: 'Fixed' }));
      // last bar still open: the bar before it is the last confirmed bar of the history
      check(crtFlux.calculate(bars.slice(0, k + 2), { tpslMethod: 'Fixed' }, { lastBarConfirmed: false } as ChartContext));
      // the inputs of the alert() calls
      const off = crtFlux.calculate(bars.slice(0, k + 1), {
        tpslMethod: 'Fixed', buyAlertEnabled: false, sellAlertEnabled: false, tpAlertEnabled: false, slAlertEnabled: false,
      });
      expect(off.alertCalls).toEqual([]);
      expect(off.alerts.map((a) => a.triggered)).toEqual(want);
    }
  });
});

describe('Candle Range Trading (CRT): alertconditions', () => {
  const bars = walk(1500, 9);
  it('declares the two conditions of the original', () => {
    expect(decls(crt)).toEqual([
      ['alert0', 'Bullish CRT Alert', 'Bullish CRT Pattern Detected'],
      ['alert1', 'Bearish CRT Alert', 'Bearish CRT Pattern Detected'],
    ]);
    expect(crt.CandleRangeTrading.alertConditions).toBe(crt.alertConditions);
  });
  it('fires on the bullish / bearish CRT bars', () => {
    const p = (i: number) => bars[i - 1];
    const inside = (i: number) => bars[i].close <= p(i).high && bars[i].close >= p(i).low;
    const bear = timesWhere(bars, (i) => i > 0 && p(i).close > p(i).open && bars[i].close < bars[i].open && bars[i].high > p(i).high && inside(i));
    const bull = timesWhere(bars, (i) => i > 0 && p(i).close < p(i).open && bars[i].close > bars[i].open && bars[i].low < p(i).low && inside(i));
    expect(bull.length).toBeGreaterThan(10);
    expect(bear.length).toBeGreaterThan(10);
    const r = crt.calculate(bars, { showBox: false });
    expect(r.alerts[0].times).toEqual(bull);
    expect(r.alerts[1].times).toEqual(bear);
  });
});

describe('Candle Spread Oscillator: alertconditions', () => {
  const bars = walk(1500, 13);
  it('declares the two conditions of the original', () => {
    expect(decls(spreadOsc)).toEqual([
      ['alert0', 'Cross Up', 'Candle Spread Oscillator crossed above the midline.'],
      ['alert1', 'Cross Down', 'Candle Spread Oscillator crossed below the midline.'],
    ]);
    expect(spreadOsc.CandleSpreadOscillator.alertConditions).toBe(spreadOsc.alertConditions);
  });
  it('fires on the crosses of the midline', () => {
    const r = spreadOsc.calculate(bars, { lookbackPeriod: 20 });
    const v = values(r.plots.plot0);
    const up = boolTimes(bars, crossover(v, 0));
    const down = boolTimes(bars, crossunder(v, 0));
    expect(up.length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(down);
  });
});

describe('Candle State (The Strat): Style ids', () => {
  const bars = walk(1500, 17);
  it('every triangle carries the id of its plotshape', () => {
    const r = candleState.calculate(bars);
    const hh = (i: number) => i > 0 && bars[i].high > bars[i - 1].high;
    const ll = (i: number) => i > 0 && bars[i].low < bars[i - 1].low;
    const t3 = (i: number) => hh(i) && ll(i);
    const red = (i: number) => bars[i].close < bars[i].open;
    const green = (i: number) => bars[i].close > bars[i].open;
    const want: Record<string, number[]> = {
      shape0: timesWhere(bars, (i) => hh(i) && !t3(i)),
      shape1: timesWhere(bars, (i) => ll(i) && !t3(i)),
      shape2: timesWhere(bars, (i) => t3(i) && red(i)),
      shape3: timesWhere(bars, (i) => t3(i) && red(i)),
      shape4: timesWhere(bars, (i) => t3(i) && green(i)),
      shape5: timesWhere(bars, (i) => t3(i) && green(i)),
    };
    for (const [id, times] of Object.entries(want)) expect(idTimes(r.markers, id)).toEqual(times);
    expect(want.shape2.length).toBeGreaterThan(5);
    expect(want.shape4.length).toBeGreaterThan(5);
    const shapes: Record<string, string> = { shape0: 'triangleUp', shape1: 'triangleDown', shape2: 'triangleUp', shape3: 'triangleDown', shape4: 'triangleDown', shape5: 'triangleUp' };
    for (const m of r.markers) expect(m.shape).toBe(shapes[m.id!]);
  });
});

describe('Candlestick Patterns Identified: alertconditions and Style ids', () => {
  const bars = walk(1500, 19);
  // crafted Bullish Belt (open = low under the lowest low of 10 bars, falling opens before it) and a piercing line
  {
    const k = 800;
    const ref = Math.min(...bars.slice(k - 10, k).map((b) => b.low));
    for (let j = k - 5; j < k; j++) bars[j] = { ...bars[j], open: ref + 30 - (j - k + 5) * 2 };
    bars[k] = { ...bars[k], open: ref - 5, low: ref - 5, high: ref + 30, close: ref + 29 };
  }
  const titles = ['Doji', 'Bearish Harami', 'Bullish Harami', 'Bearish Engulfing', 'Bullish Engulfing', 'Piercing Line', 'Bullish Belt',
    'Bullish Kicker', 'Bearish Kicker', 'Hanging Man', 'Evening Star', 'Morning Star', 'Shooting Star', 'Hammer', 'Inverted Hammer'];

  it('declares the 15 conditions of the original', () => {
    expect(decls(patterns)).toEqual(titles.map((t, k) => [`alert${k}`, t, `${t} detected`]));
    expect(patterns.CandlestickPatternsIdentified.alertConditions).toBe(patterns.alertConditions);
  });

  it('each condition fires on its pattern bars, and the shape of the pattern carries its id', () => {
    const r = patterns.calculate(bars);
    const trend = 5;
    const lowest10 = bars.map((_, i) => (i < 9 ? NaN : Math.min(...bars.slice(i - 9, i + 1).map((b) => b.low))));
    const conds = (i: number): boolean[] => {
      const { open, high, low, close } = bars[i];
      const b1 = bars[i - 1] ?? { open: NaN, high: NaN, low: NaN, close: NaN };
      const b2 = bars[i - 2] ?? { open: NaN, high: NaN, low: NaN, close: NaN };
      const oT = i >= trend ? bars[i - trend].open : NaN;
      const lower = i >= 1 ? lowest10[i - 1] : NaN;
      return [
        Math.abs(open - close) <= (high - low) * 0.05,
        b1.close > b1.open && open > close && open <= b1.close && b1.open <= close && open - close < b1.close - b1.open && oT < open,
        b1.open > b1.close && close > open && close <= b1.open && b1.close <= open && close - open < b1.open - b1.close && oT > open,
        b1.close > b1.open && open > close && open >= b1.close && b1.open >= close && open - close > b1.close - b1.open && oT < open,
        b1.open > b1.close && close > open && close >= b1.open && b1.close >= open && close - open > b1.open - b1.close && oT > open,
        b1.close < b1.open && open < b1.low && close > b1.close + (b1.open - b1.close) / 2 && close < b1.open && oT > open,
        low === open && open < lower && open < close && close > (b1.high - b1.low) / 2 + b1.low && oT > open,
        b1.open > b1.close && open >= b1.open && close > open && oT > open,
        b1.open < b1.close && open <= b1.open && close <= open && oT < open,
        high - low > 4 * Math.abs(open - close) && (close - low) / (0.001 + high - low) >= 0.75 && (open - low) / (0.001 + high - low) >= 0.75
          && oT < open && b1.high < open && b2.high < open,
        b2.close > b2.open && Math.min(b1.open, b1.close) > b2.close && open < Math.min(b1.open, b1.close) && close < open,
        b2.close < b2.open && Math.max(b1.open, b1.close) < b2.close && open > Math.max(b1.open, b1.close) && close > open,
        b1.open < b1.close && open > b1.close && high - Math.max(open, close) >= Math.abs(open - close) * 3
          && Math.min(close, open) - low <= Math.abs(open - close),
        high - low > 3 * Math.abs(open - close) && (close - low) / (0.001 + high - low) > 0.6 && (open - low) / (0.001 + high - low) > 0.6,
        high - low > 3 * Math.abs(open - close) && (high - close) / (0.001 + high - low) > 0.6 && (high - open) / (0.001 + high - low) > 0.6,
      ];
    };
    const all = bars.map((_, i) => conds(i));
    titles.forEach((_, k) => {
      const want = timesWhere(bars, (i) => all[i][k]);
      expect(r.alerts[k].times).toEqual(want);
      expect(idTimes(r.markers, `shape${k}`)).toEqual(want);
    });
    expect(r.alerts[6].times).toContain(bars[800].time);
    // every pattern but the rare ones fires on the walk
    for (const k of [0, 1, 2, 3, 4, 7, 8, 10, 11, 12, 13, 14]) expect(r.alerts[k].times.length).toBeGreaterThan(0);
    expect(r.markers.every((m) => /^shape([0-9]|1[0-4])$/.test(m.id ?? ''))).toBe(true);
  });
});

describe('Candlestick Reversal System: alertconditions', () => {
  const bars = walk(1500, 23);
  it('declares the two conditions of the original', () => {
    expect(decls(reversal)).toEqual([['alert0', 'Long Signal', 'Long Signal'], ['alert1', 'Short Signal', 'Short Signal']]);
    expect(reversal.CandlestickReversal.alertConditions).toBe(reversal.alertConditions);
  });
  it('fires on the bars of the long / short triangles, and only on pivot bars', () => {
    const r = reversal.calculate(bars);
    const long = r.markers.filter((m) => m.shape === 'triangleUp').map((m) => m.time);
    const short = r.markers.filter((m) => m.shape === 'triangleDown').map((m) => m.time);
    expect(long.length).toBeGreaterThan(5);
    expect(short.length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(long);
    expect(r.alerts[1].times).toEqual(short);
    // pivotlow(5, 0): the low is the lowest of the last 6 bars (pivothigh: highest high)
    const idx = (t: number) => bars.findIndex((b) => b.time === t);
    for (const t of r.alerts[0].times) {
      const i = idx(t);
      expect(bars.slice(i - 5, i).every((b) => b.low > bars[i].low)).toBe(true);
    }
    for (const t of r.alerts[1].times) {
      const i = idx(t);
      expect(bars.slice(i - 5, i).every((b) => b.high < bars[i].high)).toBe(true);
    }
  });
});

describe('Candlestick Trend Indicator: Style ids', () => {
  const bars = walk(1500, 29);
  const r = trendInd.calculate(bars, { ufb: true, salc: true, urpb: true, usb: true, uob: true, uib: true });
  it('every marker carries the id of its plotshape', () => {
    const byText: Record<string, string[]> = {
      'Bearish\nPinBar': ['shape2'], 'Bullish\nPinBar': ['shape3'], 'DarkCloud\nCover': ['shape4'], 'Piercing\nLine': ['shape5'],
      'Bear\nHarami': ['shape6'], 'Bull\nHarami': ['shape7'], 'Bearish\nEngulf': ['shape8'], 'Bullish\nEngulf': ['shape9'],
      'Fractal\nCross': ['shape10', 'shape11'],
    };
    const ids = new Set<string>();
    for (const m of r.markers) {
      ids.add(m.id!);
      if (m.text) expect(byText[m.text]).toContain(m.id);
      else if (m.position === 'bottom') expect(m.id).toBe('shape12');
      else expect(m.id).toBe(m.shape === 'triangleUp' ? 'shape0' : 'shape1');
      if (m.id === 'shape10') expect(m.shape).toBe('arrowUp');
      if (m.id === 'shape11') expect(m.shape).toBe('arrowDown');
    }
    for (const id of ['shape0', 'shape1', 'shape2', 'shape3', 'shape8', 'shape9', 'shape12']) expect(ids).toContain(id);
    expect([...ids].every((id) => /^shape([0-9]|1[0-2])$/.test(id))).toBe(true);
  });
  it('every bar colour carries the id of the barcolor call that gives it', () => {
    const colorOf = new Map<string, string>();
    for (const b of r.barColors) {
      expect(b.id).toMatch(/^barcolor[0-8]$/);
      // one colour per call
      if (colorOf.has(b.id!)) expect(colorOf.get(b.id!)).toBe(b.color);
      colorOf.set(b.id!, b.color);
    }
    expect(colorOf.size).toBeGreaterThan(3);
    expect(new Set(colorOf.values()).size).toBe(colorOf.size);
  });
});

describe('Cardwell RSI by TQ: alertconditions', () => {
  const bars = walk(1500, 31);
  it('declares the six conditions of the original', () => {
    expect(decls(cardwell)).toEqual([
      ['alert0', 'RSI > Fast MA', 'RSI crossed above the Fast RSI MA.'],
      ['alert1', 'RSI < Fast MA', 'RSI crossed below the Fast RSI MA.'],
      ['alert2', 'RSI > Custom MA', 'RSI crossed above the Custom RSI MA.'],
      ['alert3', 'RSI < Custom MA', 'RSI crossed below the Custom RSI MA.'],
      ['alert4', 'RSI > Slow MA', 'RSI crossed above the Slow RSI MA.'],
      ['alert5', 'RSI < Slow MA', 'RSI crossed below the Slow RSI MA.'],
    ]);
    expect(cardwell.CardwellRsiByTq.alertConditions).toBe(cardwell.alertConditions);
  });
  it('fires on the crosses of the RSI with each moving average', () => {
    for (const maType of ['WMA', 'EMA'] as const) {
      const r = cardwell.calculate(bars, { maType });
      const rsi = values(r.plots.plot0);
      [r.plots.plot1, r.plots.plot2, r.plots.plot3].forEach((p, k) => {
        const m = values(p);
        const up = boolTimes(bars, crossover(rsi, m));
        expect(up.length).toBeGreaterThan(5);
        expect(r.alerts[2 * k].times).toEqual(up);
        expect(r.alerts[2 * k + 1].times).toEqual(boolTimes(bars, crossunder(rsi, m)));
      });
    }
  });
});

describe('CBC Flip with Volume: alertconditions and Style ids', () => {
  const bars = walk(1500, 37);
  it('declares the two conditions of the original', () => {
    expect(decls(cbc)).toEqual([['alert0', 'Bull Flip', 'CBC Flip: Bulls in control'], ['alert1', 'Bear Flip', 'CBC Flip: Bears in control']]);
    expect(cbc.CbcFlipWithVolume.alertConditions).toBe(cbc.alertConditions);
  });
  it('fires on the flips; normal / strong triangles carry their ids', () => {
    const r = cbc.calculate(bars);
    let state = false;
    const bull: boolean[] = [], bear: boolean[] = [], high: boolean[] = [];
    bars.forEach((b, i) => {
      const prev = state;
      const v = b.volume!;
      const pv = i > 0 ? bars[i - 1].volume! : NaN;
      if (state && i > 0 && b.close < bars[i - 1].low && b.close < b.open && v > pv) state = false;
      if (!state && i > 0 && b.close > bars[i - 1].high && b.close > b.open && v > pv) state = true;
      bull.push(state && !prev);
      bear.push(!state && prev);
      const avg = i < 49 ? NaN : bars.slice(i - 49, i + 1).reduce((s, x) => s + x.volume!, 0) / 50;
      high.push(v > avg);
    });
    expect(boolTimes(bars, bull).length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(boolTimes(bars, bull));
    expect(r.alerts[1].times).toEqual(boolTimes(bars, bear));
    expect(idTimes(r.markers, 'shape0')).toEqual(timesWhere(bars, (i) => bull[i] && !high[i]));
    expect(idTimes(r.markers, 'shape1')).toEqual(timesWhere(bars, (i) => bear[i] && !high[i]));
    expect(idTimes(r.markers, 'shape2')).toEqual(timesWhere(bars, (i) => bull[i] && high[i]));
    expect(idTimes(r.markers, 'shape3')).toEqual(timesWhere(bars, (i) => bear[i] && high[i]));
    expect(idTimes(r.markers, 'shape2').length + idTimes(r.markers, 'shape3').length).toBeGreaterThan(0);
  });
});

describe('CCI Pro [Hash Capital Research]: alertconditions', () => {
  const bars = walk(1500, 41);
  it('declares the six conditions of the original', () => {
    expect(decls(cciHash)).toEqual([
      ['alert0', 'Strong Buy', 'Extreme oversold reversal signal'],
      ['alert1', 'Strong Sell', 'Extreme overbought reversal signal'],
      ['alert2', 'Buy Signal', 'Oversold reversal detected'],
      ['alert3', 'Sell Signal', 'Overbought reversal detected'],
      ['alert4', 'Bullish Divergence', 'Bullish Divergence detected on CCI - Potential reversal UP'],
      ['alert5', 'Bearish Divergence', 'Bearish Divergence detected on CCI - Potential reversal DOWN'],
    ]);
    expect(cciHash.CciHashCapital.alertConditions).toBe(cciHash.alertConditions);
    expect(cciHash.defaultInputs.signalSensitivity).toBe(6);
  });
  it('reversal signals from the momentum, velocity and adaptive levels of the CCI', () => {
    for (const signalSensitivity of [6, 3]) {
      const r = cciHash.calculate(bars, { signalSensitivity });
      const cci = values(r.plots.plot0);
      const mom = cci.map((c, i) => (i > 0 ? c - cci[i - 1] : NaN));
      const vel = mom.map((m, i) => (i > 0 ? m - mom[i - 1] : NaN));
      const first = cci.findIndex((c) => !isNaN(c));
      const sd = cci.map((_, i) => {
        if (i < first + 29) return NaN;
        const w = cci.slice(i - 29, i + 1);
        const mean = w.reduce((s, x) => s + x, 0) / 30;
        return Math.sqrt(w.reduce((s, x) => s + (x - mean) ** 2, 0) / 30);
      });
      const up = (i: number) => 100 + sd[i] * 0.3;
      const dn = (i: number) => -100 - sd[i] * 0.3;
      const mult = signalSensitivity / 10;
      const cu = crossover(mom, 0);
      const cd = crossunder(mom, 0);
      const want = [
        timesWhere(bars, (i) => cci[i] < dn(i) * 1.3 * 0.8 && cu[i]),
        timesWhere(bars, (i) => cci[i] > up(i) * 1.3 * 0.8 && cd[i]),
        timesWhere(bars, (i) => cci[i] < dn(i) * mult && mom[i] > 0 && vel[i] > 0),
        timesWhere(bars, (i) => cci[i] > up(i) * mult && mom[i] < 0 && vel[i] < 0),
      ];
      want.forEach((w, k) => expect(r.alerts[k].times).toEqual(w));
      expect(want[2].length).toBeGreaterThan(5);
      expect(want[3].length).toBeGreaterThan(5);
      expect(want[0].length + want[1].length).toBeGreaterThan(0);
    }
  });
  it('divergences: only when they are calculated, 5 bars after the pivot of the Bull / Bear label', () => {
    expect(cciHash.calculate(bars).alerts[4].times).toEqual([]);
    const r = cciHash.calculate(bars, { calculateDivergence: true });
    const after5 = (t: number) => bars[bars.findIndex((b) => b.time === t) + 5].time;
    const bull = r.markers.filter((m) => m.text === ' Bull ').map((m) => after5(m.time));
    const bear = r.markers.filter((m) => m.text === ' Bear ').map((m) => after5(m.time));
    expect(bull.length).toBeGreaterThan(2);
    expect(bear.length).toBeGreaterThan(2);
    expect(r.alerts[4].times).toEqual(bull);
    expect(r.alerts[5].times).toEqual(bear);
  });
});

describe('CCI Stochastic: alertconditions and Style ids', () => {
  const bars = walk(1500, 43);
  const titles = ['Trend Enter Buy', 'Trend Enter Sell', 'Trend Center Buy', 'Trend Center Sell', 'Trend Exit Buy', 'Trend Exit Sell'];
  it('declares the six conditions of the original', () => {
    expect(decls(cciStoch)).toEqual(titles.map((t, k) => [`alert${k}`, t, t]));
    expect(cciStoch.CCIStochastic.alertConditions).toBe(cciStoch.alertConditions);
  });
  it('fires on the arrows (enter / center / exit crosses), each arrow with its id', () => {
    const r = cciStoch.calculate(bars, { showArrowsCenter: true });
    const ma = values(r.plots.plot0);
    const enterUp = crossunder(ma, 20), enterDn = crossover(ma, 80);
    const exitDn = crossunder(ma, 80), exitUp = crossover(ma, 20);
    const cDn = crossunder(ma, 50), cUp = crossover(ma, 50);
    const want = [
      boolTimes(bars, enterUp), boolTimes(bars, enterDn.map((x, i) => x && !enterUp[i])),
      boolTimes(bars, cUp.map((x, i) => x && !cDn[i])), boolTimes(bars, cDn),
      boolTimes(bars, exitUp.map((x, i) => x && !exitDn[i])), boolTimes(bars, exitDn),
    ];
    want.forEach((w, k) => {
      expect(w.length).toBeGreaterThan(3);
      expect(r.alerts[k].times).toEqual(w);
      expect(idTimes(r.markers, `shape${k}`)).toEqual(w);
    });
    // with the arrows off, no condition is true
    const off = cciStoch.calculate(bars, { showArrows: false, showArrowsCenter: true });
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
    // the default: no center arrows
    expect(cciStoch.calculate(bars).alerts[2].times).toEqual([]);
  });
});

describe('Chandelier Exit: alertconditions', () => {
  const bars = walk(1500, 47);
  /** The original's direction: ratcheted stops, ATR(22) x 3 from the highest / lowest close */
  const original = (list: Bar[], useClose = true) => {
    const len = 22, mult = 3;
    const tr = list.map((b, i) => (i === 0 ? b.high - b.low
      : Math.max(b.high - b.low, Math.abs(b.high - list[i - 1].close), Math.abs(b.low - list[i - 1].close))));
    let atr = NaN;
    const dirs: number[] = [];
    let ls = NaN, ss = NaN, dir = 1;
    list.forEach((b, i) => {
      if (i === len - 1) atr = tr.slice(0, len).reduce((s, x) => s + x, 0) / len;
      else if (i >= len) atr = (atr * (len - 1) + tr[i]) / len;
      const w = list.slice(Math.max(0, i - len + 1), i + 1);
      const hi = i < len - 1 ? NaN : Math.max(...w.map((x) => (useClose ? x.close : x.high)));
      const lo = i < len - 1 ? NaN : Math.min(...w.map((x) => (useClose ? x.close : x.low)));
      let l = hi - mult * atr;
      const lp = isNaN(ls) ? l : ls;
      if (i > 0 && list[i - 1].close > lp) l = Math.max(l, lp);
      let s = lo + mult * atr;
      const sp = isNaN(ss) ? s : ss;
      if (i > 0 && list[i - 1].close < sp) s = Math.min(s, sp);
      dir = b.close > sp ? 1 : b.close < lp ? -1 : dir;
      ls = l;
      ss = s;
      dirs.push(dir);
    });
    return dirs;
  };
  it('declares the three conditions of the original (placeholders kept)', () => {
    expect(decls(chandelier)).toEqual([
      ['alert0', 'CE Direction Change', 'Chandelier Exit has changed direction, {{exchange}}:{{ticker}}'],
      ['alert1', 'CE Buy', 'Chandelier Exit Buy, {{exchange}}:{{ticker}}'],
      ['alert2', 'CE Sell', 'Chandelier Exit Sell, {{exchange}}:{{ticker}}'],
    ]);
    expect(chandelier.ChandelierExit.alertConditions).toBe(chandelier.alertConditions);
  });
  it('fires on the direction changes of the original', () => {
    for (const useClose of [true, false]) {
      const d = original(bars, useClose);
      const r = chandelier.calculate(bars, { useClose });
      const buy = timesWhere(bars, (i) => i > 0 && d[i] === 1 && d[i - 1] === -1);
      const sell = timesWhere(bars, (i) => i > 0 && d[i] === -1 && d[i - 1] === 1);
      expect(buy.length).toBeGreaterThan(5);
      expect(r.alerts[0].times).toEqual(timesWhere(bars, (i) => i > 0 && d[i] !== d[i - 1]));
      expect(r.alerts[1].times).toEqual(buy);
      expect(r.alerts[2].times).toEqual(sell);
    }
  });
  it('Await Bar Confirmation: no alert on an open last bar', () => {
    const d = original(bars);
    const k = d.findIndex((x, i) => i > 300 && x === 1 && d[i - 1] === -1);
    const cut = bars.slice(0, k + 1);
    expect(chandelier.calculate(cut).alerts[1].triggered).toBe(true);
    const open = chandelier.calculate(cut, {}, { lastBarConfirmed: false } as ChartContext);
    expect(open.alerts[1].triggered).toBe(false);
    expect(open.alerts[0].triggered).toBe(false);
    expect(chandelier.calculate(cut, { awaitBarConfirmation: false }, { lastBarConfirmed: false } as ChartContext).alerts[1].triggered).toBe(true);
  });
});
