/**
 * Alerts of eight community ports: the alertcondition() declarations and their per-bar states (`alerts`), and the
 * alert() calls (`alertCalls`), checked against conditions computed again in the test from the original expressions
 * (or against the outputs that plot the same condition).
 */

import { describe, it, expect } from 'vitest';
import { str, type Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as strongEngulfing from '../../src/community/strong-engulfing-candlestick';
import * as insideBar from '../../src/community/inside-bar-ind-alert';
import * as tripleDoji from '../../src/community/triple-doji-sequence';
import * as erema from '../../src/community/erema-signals';
import * as renko from '../../src/community/renko-moving-average-rmi-alert-r3-by';
import * as autoFibChannels from '../../src/community/auto-fib-channels-by-dgt';
import * as orderBlocks from '../../src/community/order-blocks-w-realtime-fibs';
import * as bjorgum from '../../src/community/bjorgum-key-levels';

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
    bars.push({ time: T0 + i * step, open, high, low, close, volume: 1000 + Math.floor(rand() * 1000) });
    price = close;
  }
  return bars;
}

const timesWhere = (bars: Bar[], f: (i: number) => boolean) => bars.filter((_, i) => f(i)).map((b) => b.time as number);
const markerTimes = (markers: { time: unknown; position?: string; shape?: string }[], pos?: string, shape?: string) =>
  markers.filter((m) => (pos === undefined || m.position === pos) && (shape === undefined || m.shape === shape))
    .map((m) => m.time as number);
const uniq = (a: number[]) => [...new Set(a)];

describe('Strong Engulfing Candlestick: alertconditions', () => {
  const bars = walk(1500);
  // two crafted engulfings at the end
  const n = bars.length;
  bars[n - 4] = { ...bars[n - 4], open: 100, close: 98, high: 100.5, low: 97.5 };
  bars[n - 3] = { ...bars[n - 3], open: 97.8, close: 101, high: 101.5, low: 97.5 }; // bullish, equal low
  bars[n - 2] = { ...bars[n - 2], open: 100, close: 102, high: 102.5, low: 99.5 };
  bars[n - 1] = { ...bars[n - 1], open: 102.2, close: 99, high: 102.5, low: 99 }; // bearish, equal high
  const res = strongEngulfing.calculate(bars);

  it('declares the two conditions of the original', () => {
    expect(strongEngulfing.alertConditions).toEqual([
      { id: 'alert0', title: 'Bullish Engulfing Alert', message: 'Strong Bullish Engulfing detected!' },
      { id: 'alert1', title: 'Bearish Engulfing Alert', message: 'Strong Bearish Engulfing detected!' },
    ]);
    expect(strongEngulfing.StrongEngulfingCandlestick.alertConditions).toBe(strongEngulfing.alertConditions);
  });

  it('fires on the bars of the original expressions', () => {
    const bull = timesWhere(bars, (i) => i > 0 && gt(bars[i].close, bars[i].open) && lt(bars[i - 1].close, bars[i - 1].open)
      && ge(bars[i].high, bars[i - 1].high) && le(bars[i].low, bars[i - 1].low)
      && gt(bars[i].close - bars[i].open, bars[i - 1].open - bars[i - 1].close));
    const bear = timesWhere(bars, (i) => i > 0 && lt(bars[i].close, bars[i].open) && gt(bars[i - 1].close, bars[i - 1].open)
      && ge(bars[i].high, bars[i - 1].high) && le(bars[i].low, bars[i - 1].low)
      && gt(bars[i].open - bars[i].close, bars[i - 1].close - bars[i - 1].open));
    expect(bull.length).toBeGreaterThan(5);
    expect(bear.length).toBeGreaterThan(5);
    expect(res.alerts[0].times).toEqual(bull);
    expect(res.alerts[1].times).toEqual(bear);
    expect(bull).toContain(bars[n - 3].time);
    expect(res.alerts[1].triggered).toBe(true);
    expect(res.alerts[0].triggered).toBe(false);
  });
});

describe('Inside Bar (Body-based): alertconditions', () => {
  const bars = walk(1500, 5, 4, 3);
  const res = insideBar.calculate(bars);
  const hi = (i: number) => (i >= 0 ? Math.max(bars[i].open, bars[i].close) : NaN);
  const lo = (i: number) => (i >= 0 ? Math.min(bars[i].open, bars[i].close) : NaN);

  it('declares the two conditions of the original', () => {
    expect(insideBar.alertConditions).toEqual([
      { id: 'alert0', title: 'Inside Bar (Body)', message: 'Inside Bar (body) came up!' },
      { id: 'alert1', title: 'Next Candle Also Inside Bar (Body)', message: 'Two-in-a-row: current and previous bar inside mother body' },
    ]);
    expect(insideBar.InsideBarIndAlert.alertConditions).toBe(insideBar.alertConditions);
  });

  it('fires on inside bars and on two bars in a row inside the mother bar', () => {
    const inside = timesWhere(bars, (i) => lt(hi(i), hi(i - 1)) && gt(lo(i), lo(i - 1)));
    const double = timesWhere(bars, (i) => lt(hi(i), hi(i - 2)) && gt(lo(i), lo(i - 2)) && lt(hi(i - 1), hi(i - 2)) && gt(lo(i - 1), lo(i - 2)));
    expect(inside.length).toBeGreaterThan(50);
    expect(double.length).toBeGreaterThan(10);
    expect(res.alerts[0].times).toEqual(inside);
    expect(res.alerts[1].times).toEqual(double);
  });
});

describe('Triple Doji Sequence: alert() calls', () => {
  const bars = walk(1500, 3);
  // crafted dojis: tiny body, a long upper (sell) or lower (buy) wick
  const doji = (i: number, upper: boolean) => {
    const o = bars[i].open;
    bars[i] = { ...bars[i], close: o + 0.01, high: upper ? o + 15 : o + 0.02, low: upper ? o - 0.01 : o - 15 };
  };
  for (const i of [400, 401, 402, 700, 701, 1499]) doji(i, true);
  for (const i of [900, 901, 1200]) doji(i, false);

  const body = bars.map((b) => Math.abs(b.close - b.open));
  const uw = bars.map((b) => Math.abs(Math.max(b.open, b.close) - b.high));
  const lw = bars.map((b) => Math.abs(Math.min(b.open, b.close) - b.low));
  const sma = (a: number[], i: number) => (i < 199 ? NaN : a.slice(i - 199, i + 1).reduce((x, y) => x + y, 0) / 200);
  const up = bars.map((_, i) => gt(uw[i], body[i]) && gt(uw[i], sma(uw, i) * 3) && lt(body[i], sma(body, i) * 0.6) && lt(lw[i], sma(lw, i)));
  const dn = bars.map((_, i) => gt(lw[i], body[i]) && gt(lw[i], sma(lw, i) * 3) && lt(body[i], sma(body, i) * 0.6) && lt(uw[i], sma(uw, i)));
  const U = (i: number) => i >= 0 && up[i];
  const D = (i: number) => i >= 0 && dn[i];

  const expected = (seqLen: 1 | 2 | 3, lastOk = true) => {
    const out: { time: number; message: string; freq: string }[] = [];
    for (let i = 0; i < bars.length; i++) {
      const same = (k: number) => [0, 1, 2].slice(0, k).every((j) => U(i - j)) || [0, 1, 2].slice(0, k).every((j) => D(i - j));
      const ok = seqLen === 1 ? U(i) || D(i) : same(seqLen);
      if (!ok || (!lastOk && i === bars.length - 1)) continue;
      if (D(i)) out.push({ time: bars[i].time as number, message: 'Buy Doji Signal', freq: 'once_per_bar_close' });
      if (U(i)) out.push({ time: bars[i].time as number, message: 'Sell Doji Signal', freq: 'once_per_bar_close' });
    }
    return out;
  };

  it('declares the alert function', () => {
    expect(tripleDoji.hasAlertFunction).toBe(true);
    expect(tripleDoji.TripleDojiSequence.hasAlertFunction).toBe(true);
  });

  it('single doji: a buy / sell call on every confirmed signal bar', () => {
    const want = expected(1);
    expect(want.filter((c) => c.message.startsWith('Buy')).length).toBeGreaterThan(1);
    expect(want.filter((c) => c.message.startsWith('Sell')).length).toBeGreaterThan(3);
    expect(tripleDoji.calculate(bars).alertCalls).toEqual(want);
  });

  it('two and three dojis in a row of the same side', () => {
    const two = expected(2);
    const three = expected(3);
    expect(two.length).toBeGreaterThanOrEqual(3);
    expect(three.length).toBeGreaterThanOrEqual(1);
    expect(tripleDoji.calculate(bars, { doji2Enabled: true }).alertCalls).toEqual(two);
    expect(tripleDoji.calculate(bars, { doji3Enabled: true }).alertCalls).toEqual(three);
  });

  it('barstate.isconfirmed: no call on an open last bar', () => {
    const open = tripleDoji.calculate(bars, {}, { lastBarConfirmed: false } as ChartContext).alertCalls;
    expect(open).toEqual(expected(1, false));
    expect(open.some((c) => c.time === bars[bars.length - 1].time)).toBe(false);
    expect(tripleDoji.calculate(bars).alertCalls.some((c) => c.time === bars[bars.length - 1].time)).toBe(true);
  });
});

describe('EREMA Signals: alert() calls', () => {
  const bars = walk(1500, 9);

  /** Reverse EMA of the original, computed again */
  const reverseEma = (alpha: number) => {
    const d = 1 - alpha;
    let ema = NaN;
    const re1 = new Array(8).fill(0);
    return bars.map((b, i) => {
      const prev = ema;
      ema = alpha * b.close + d * (isNaN(prev) ? b.close : prev);
      const re0: number[] = [d * ema + (isNaN(prev) ? ema : prev)];
      for (let k = 1; k < 8; k++) re0.push(Math.pow(d, 2 ** k) * re0[k - 1] + re1[k - 1]);
      for (let k = 0; k < 8; k++) re1[k] = re0[k];
      return i > 75 ? ema - alpha * re0[7] : NaN;
    });
  };

  it('declares the alert function', () => {
    expect(erema.hasAlertFunction).toBe(true);
    expect(erema.EremaSignals.hasAlertFunction).toBe(true);
  });

  it('no call while "Enable Alerts" is off', () => {
    expect(erema.calculate(bars).alertCalls).toEqual([]);
  });

  it('Zero Cross: buy / sell calls on the crosses of zero', () => {
    const r = reverseEma(0.1);
    const want: { time: number; message: string; freq: string }[] = [];
    for (let i = 82; i < bars.length; i++) {
      if (gt(r[i], 0) && le(r[i - 1], 0)) want.push({ time: bars[i].time as number, message: 'Ehlers Reverse EMA: Buy Signal', freq: 'once_per_bar' });
      if (lt(r[i], 0) && ge(r[i - 1], 0)) want.push({ time: bars[i].time as number, message: 'Ehlers Reverse EMA: Sell Signal', freq: 'once_per_bar' });
    }
    expect(want.length).toBeGreaterThan(10);
    expect(erema.calculate(bars, { alertsOn: true }).alertCalls).toEqual(want);
  });

  it('MA Cross: the calls follow the signal triangles', () => {
    const res = erema.calculate(bars, { alertsOn: true, signalType: 'MA Cross' });
    const buys = res.alertCalls.filter((c) => c.message.endsWith('Buy Signal')).map((c) => c.time);
    const sells = res.alertCalls.filter((c) => c.message.endsWith('Sell Signal')).map((c) => c.time);
    expect(buys.length).toBeGreaterThan(10);
    expect(buys).toEqual(markerTimes(res.markers, 'belowBar', 'triangleUp'));
    expect(sells).toEqual(markerTimes(res.markers, 'aboveBar', 'triangleDown'));
  });
});

describe('Renko+Moving Average+RMI Alert R3: alertconditions', () => {
  const bars = walk(1500, 21, 6, 0, 3600);

  it('declares the four conditions of the original', () => {
    expect(renko.alertConditions).toEqual([
      { id: 'alert0', title: 'Swing BUY Alert', message: 'BUY' },
      { id: 'alert1', title: 'Swing SELL Alert', message: 'SELL' },
      { id: 'alert2', title: 'Swing BUY Exit Alert', message: 'BUY Exit' },
      { id: 'alert3', title: 'Swing SELL Exit Alert', message: 'SELL Exit' },
    ]);
    expect(renko.RenkoMovingAverageRmiAlertR3By.alertConditions).toBe(renko.alertConditions);
  });

  for (const inputs of [{}, { udOpen: false }, { exitFirst: true, udOpen: false }, { uRSI: true, udOpen: false }] as const) {
    it(`entries and exits on the bars of the arrows and exit crosses (${JSON.stringify(inputs)})`, () => {
      const res = renko.calculate(bars, inputs);
      const [buy, sell, buyExit, sellExit] = res.alerts.map((a) => a.times);
      // the BUY / SELL plotarrows: the result's arrows
      const arrows = (res as any).arrows as { time: number; id: string }[];
      expect(buy).toEqual(arrows.filter((a) => a.id === 'arrow0').map((a) => a.time));
      expect(sell).toEqual(arrows.filter((a) => a.id === 'arrow1').map((a) => a.time));
      expect(buyExit).toEqual(markerTimes(res.markers, 'belowBar', 'xcross'));
      expect(sellExit).toEqual(markerTimes(res.markers, 'aboveBar', 'xcross'));
      expect(buy.length).toBeGreaterThan(0);
      expect(sell.length).toBeGreaterThan(0);
      // olong[1] > 0 and olong == 0: an exit comes after an entry, never two exits without an entry between them
      const events = [...buy.map((t) => [t, 'b'] as const), ...buyExit.map((t) => [t, 'x'] as const)].sort((a, b) => a[0] - b[0]);
      expect(events[0][1]).toBe('b');
      for (let k = 1; k < events.length; k++) if (events[k][1] === 'x') expect(events[k - 1][1]).toBe('b');
    });
  }
});

describe('Auto Fib Channels by DGT: alert() calls', () => {
  const TICKER = 'TEST';
  const chart = { tickerid: `NASDAQ:${TICKER}`, mintick: 0.01 } as ChartContext;
  const bars = walk(700, 13, 5);
  const full = autoFibChannels.calculate(bars, {}, chart).alertCalls;

  it('declares the alert function', () => {
    expect(autoFibChannels.hasAlertFunction).toBe(true);
    expect(autoFibChannels.AutoFibChannelsByDgt.hasAlertFunction).toBe(true);
  });

  it('every bar: the channel and retracement levels of that bar crossed by the close, in the order of the levels', () => {
    const from = 400;
    const want: { time: number; message: string; freq: string }[] = [];
    for (let k = from; k < bars.length; k++) {
      // the channel ("CHL ") and retracement ("RET ") labels of bar k: level and price on that bar
      const labels = autoFibChannels.calculate(bars.slice(0, k + 1), {}, chart).labels
        .filter((l) => l.text.startsWith('CHL ') || l.text.startsWith('RET '));
      const c0 = bars[k - 1].close;
      const c1 = bars[k].close;
      for (const l of labels) {
        const r = l.price;
        if (!((gt(r, c1) && lt(r, c0)) || (lt(r, c1) && gt(r, c0)))) continue;
        const level = l.text.slice(4).split(' (')[0];
        const head = l.text.startsWith('CHL ') ? 'AutoFibChannel: ' : 'Autofib: ';
        want.push({ time: bars[k].time as number, message: `${head}${TICKER} crossing level ${level}`, freq: 'once_per_bar' });
      }
    }
    const got = full.filter((c) => c.time >= (bars[from].time as number));
    expect(want.filter((c) => c.message.startsWith('AutoFibChannel')).length).toBeGreaterThan(10);
    expect(want.filter((c) => c.message.startsWith('Autofib:')).length).toBeGreaterThan(10);
    expect(got).toEqual(want);
    expect(full.some((c) => c.message === `Autofib: ${TICKER} crossing level -0.618`)
      || full.some((c) => c.message === `AutoFibChannel: ${TICKER} crossing level -0.618`)).toBe(true);
  });

  it('without a chart context the ticker is empty', () => {
    const calls = autoFibChannels.calculate(bars).alertCalls;
    expect(calls.length).toBe(full.length);
    expect(calls[0].message).toMatch(/^(AutoFibChannel|Autofib): {2}crossing level /);
  });
});

describe('Order Blocks W/ Realtime Fibs: alert() calls', () => {
  const bars = walk(1000, 17, 5);
  const barsReq = 6;

  it('declares the alert function', () => {
    expect(orderBlocks.hasAlertFunction).toBe(true);
    expect(orderBlocks.OrderBlocksWRealtimeFibs.hasAlertFunction).toBe(true);
  });

  it('a new block call on the bars of the original block conditions', () => {
    const cond = (i: number, bull: boolean) => {
      if (i < barsReq) return false;
      const back = bars[i - barsReq];
      const c = bars[i].close;
      const gain = Math.abs(back.low - c) / back.low * 100 >= 0 || Math.abs(back.high - c) / back.high * 100 >= 0;
      const last = bull ? lt(back.close, back.open) : gt(back.close, back.open);
      let count = 0;
      for (let k = 0; k <= barsReq; k++) if (bull ? gt(bars[i - k].close, bars[i - k].open) : lt(bars[i - k].close, bars[i - k].open)) count++;
      return last && count >= barsReq && gain;
    };
    const calls = orderBlocks.calculate(bars).alertCalls;
    const bull = calls.filter((c) => c.message === 'New Bullish Order Block');
    const bear = calls.filter((c) => c.message === 'New Bearish Order Block');
    expect(bull.map((c) => c.time)).toEqual(timesWhere(bars, (i) => cond(i, true)));
    expect(bear.map((c) => c.time)).toEqual(timesWhere(bars, (i) => cond(i, false)));
    expect(bull.length).toBeGreaterThan(2);
    expect(bear.length).toBeGreaterThan(2);
    expect(new Set([...bull, ...bear].map((c) => c.freq))).toEqual(new Set(['once_per_bar_close']));
    // inside `if showOb`
    expect(orderBlocks.calculate(bars, { showOb: false }).alertCalls.filter((c) => c.message.startsWith('New '))).toEqual([]);
  });

  it('a retracement call for each retracement mark drawn on the bar', () => {
    const calls = orderBlocks.calculate(bars).alertCalls.filter((c) => c.message === 'Retracement Level Hit');
    expect(calls.length).toBeGreaterThan(2);
    expect(new Set(calls.map((c) => c.freq))).toEqual(new Set(['once_per_bar']));
    const want: number[] = [];
    for (let k = 300; k < bars.length; k++) {
      const t = bars[k].time as number;
      const marks = orderBlocks.calculate(bars.slice(0, k + 1)).labels.filter((l) => l.time === t && (l.text === '🔺' || l.text === '🔻'));
      for (let j = 0; j < marks.length; j++) want.push(t);
    }
    expect(calls.map((c) => c.time).filter((t) => t >= (bars[300].time as number))).toEqual(want);
    // the retracement calls do not depend on the boxes
    expect(orderBlocks.calculate(bars, { showOb: false }).alertCalls).toEqual(calls);
  });
});

describe('Bjorgum Key Levels: alertconditions and alert() calls', () => {
  const bars = walk(1200, 29, 5);
  const close = (t: number) => bars.find((b) => b.time === t)!.close;

  it('declares the eight conditions of the original and the alert function', () => {
    expect(bjorgum.alertConditions.map((a) => [a.id, a.title, a.message])).toEqual([
      ['alert0', 'Resistance break', 'Resistance broke on {{interval}} chart. Price is {{close}}'],
      ['alert1', 'Support break', 'Support broke on {{interval}} chart. Price is {{close}}'],
      ['alert2', 'Found support', 'Pushing Off Key Level Support on {{interval}} chart. Price is {{close}}'],
      ['alert3', 'Found resistance', 'Pushing Off Key Level Resistance on {{interval}} chart. Price is {{close}}'],
      ['alert4', 'False break down', 'False Break Down on {{interval}} chart. Price is {{close}}'],
      ['alert5', 'False break up', 'False Break Up on {{interval}} chart. Price is {{close}}'],
      ['alert6', 'Breakout', 'Breakout on {{interval}} chart. Price is {{close}}'],
      ['alert7', 'Breakdown', 'Breakdown on {{interval}} chart. Price is {{close}}'],
    ]);
    expect(bjorgum.hasAlertFunction).toBe(true);
    expect(bjorgum.BjorgumKeyLevels.alertConditions).toBe(bjorgum.alertConditions);
  });

  it('no signal shown: conditions still give states, no alert() call', () => {
    const res = bjorgum.calculate(bars);
    expect(res.alertCalls).toEqual([]);
    expect(res.alerts[0].times.length).toBeGreaterThan(5);
    expect(res.alerts[1].times.length).toBeGreaterThan(5);
  });

  // one signal at a time: its plotted condition is then the raw alertcondition, and its alert() call text
  const signals = [
    { input: 'breakUp', k: 0, text: 'Resistance broke on ', pos: 'belowBar', shape: 'arrowUp' },
    { input: 'breakDn', k: 1, text: 'Support break ', pos: 'aboveBar', shape: 'arrowDown' },
    { input: 'supPush', k: 2, text: 'Pushing off key level support on ', pos: 'belowBar', shape: 'triangleUp' },
    { input: 'resPush', k: 3, text: 'Pushing off key level resistance on ', pos: 'aboveBar', shape: 'triangleDown' },
    // false breaks are plotarrow outputs: the result's arrows (arrow1 down, arrow0 up)
    { input: 'falseBull', k: 4, text: 'False break down on ', pos: undefined, shape: undefined, arrow: 'arrow1' },
    { input: 'falseBear', k: 5, text: 'False break up on ', pos: undefined, shape: undefined, arrow: 'arrow0' },
    { input: 'detectBO', k: 6, text: 'Breakout on ', pos: 'belowBar', shape: 'arrowUp' },
    { input: 'detectBD', k: 7, text: 'Breakdown on ', pos: 'aboveBar', shape: 'arrowDown' },
  ] as const;
  for (const s of signals) {
    it(`${s.input}: alertcondition ${s.k} and the "${s.text.trim()}" calls on the signal bars`, () => {
      const res = bjorgum.calculate(bars, { [s.input]: true });
      const arrow = 'arrow' in s ? s.arrow : undefined;
      const marks = arrow
        ? uniq((res as any).arrows.filter((a: { id: string }) => a.id === arrow).map((a: { time: number }) => a.time))
        : uniq(markerTimes(res.markers, s.pos, s.shape));
      expect(marks.length).toBeGreaterThan(0);
      expect(res.alerts[s.k].times).toEqual(marks);
      expect(res.alertCalls.map((c) => c.time)).toEqual(marks);
      for (const c of res.alertCalls) {
        expect(c).toEqual({ time: c.time, message: `${s.text}D chart. Price is ${str.tostring(close(c.time))}`, freq: 'once_per_bar_close' });
      }
      // the raw condition does not depend on the input
      expect(res.alerts[s.k].times).toEqual(bjorgum.calculate(bars).alerts[s.k].times);
    });
  }

  it('several signals on: plotted priorities and declaration order of the calls', () => {
    const all = { breakUp: true, breakDn: true, supPush: true, resPush: true, falseBull: true, falseBear: true, detectBO: true, detectBD: true };
    const res = bjorgum.calculate(bars, all);
    const order = signals.map((s) => s.text);
    expect(res.alertCalls.length).toBeGreaterThan(10);
    for (let k = 1; k < res.alertCalls.length; k++) {
      const a = res.alertCalls[k - 1];
      const b = res.alertCalls[k];
      expect(a.time <= b.time).toBe(true);
      if (a.time === b.time) {
        const ia = order.findIndex((t) => a.message.startsWith(t));
        const ib = order.findIndex((t) => b.message.startsWith(t));
        expect(ia).toBeLessThan(ib);
      }
    }
    // a resistance break is not called on a breakout bar (plotResBreak = resBreak and not plotBreakOut ...)
    const breakouts = new Set(res.alertCalls.filter((c) => c.message.startsWith('Breakout on ')).map((c) => c.time));
    expect(res.alertCalls.some((c) => c.message.startsWith('Resistance broke on ') && breakouts.has(c.time))).toBe(false);
  });

  it('alerts mode and timeframe in the message', () => {
    const res = bjorgum.calculate(bars, { breakUp: true, alertMode: 'once_per_bar' }, { timeframe: '60' } as ChartContext);
    expect(res.alertCalls.length).toBeGreaterThan(0);
    for (const c of res.alertCalls) {
      expect(c.freq).toBe('once_per_bar');
      expect(c.message.startsWith('Resistance broke on 60 chart. Price is ')).toBe(true);
    }
  });

  it('candlestick patterns: one call per pattern label', () => {
    const patterns = {
      labels: true, detectDoji: true, detectEngulfing: true, detectHammerStar: true, detectDragonGrave: true,
      detectTweezers: true, detectSpinningTop: true, detectPiercingCloud: true, detectHarami: true, detectLongShadows: true,
    };
    const res = bjorgum.calculate(bars, patterns);
    const texts: Record<string, string[]> = {
      D: ['Doji at support on ', 'Doji at resistance on '], BE: ['Bullish Engulfing on ', 'Bearish Engulfing on '],
      H: ['Hammer candle on '], SS: ['Shooting star on '], DD: ['Dragonfly Doji on '], GD: ['Gravestone Doji on '],
      TB: ['Tweezer Bottom on '], TT: ['Tweezer Top on '], STW: ['White Spinning Top on '], STB: ['Black Spinning Top on '],
      P: ['Piercing on '], DCC: ['Dark Cloud Cover on '], HW: ['Bullish Harami on '], HB: ['Bearish Harami on '],
      LLS: ['Long Lower Shadow on '], LUS: ['Long Upper Shadow on '],
    };
    const patternLabels = res.labels.filter((l) => l.text in texts);
    expect(patternLabels.length).toBeGreaterThan(5);
    const callKeys = res.alertCalls.map((c) => `${c.time}|${Object.keys(texts).find((k) => texts[k].some((t) => c.message.startsWith(t)))}`);
    const labelKeys = patternLabels.map((l) => `${l.time}|${l.text}`);
    expect(callKeys.sort()).toEqual(labelKeys.sort());
    for (const c of res.alertCalls) expect(c.message).toMatch(/ on D chart\. Price is [0-9.]+$/);
  });
});
