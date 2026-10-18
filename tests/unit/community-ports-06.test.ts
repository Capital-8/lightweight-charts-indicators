/**
 * Alerts and Style outputs of sixteen community ports (batch 06): the alertcondition() declarations and their
 * per-bar states (`alerts`), the alert() calls (`alertCalls`), checked against conditions computed again in the test
 * from the original expressions (or against the outputs that plot the same condition), and the output ids of the
 * markers of one port.
 */

import { describe, it, expect } from 'vitest';
import { ta, Series, str, math, type Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as breakerBlocks from '../../src/community/breaker-blocks-with-signals';
import * as breakoutRetest from '../../src/community/breakout-and-retest-signals';
import * as breakoutFinder from '../../src/community/breakout-finder';
import * as breakoutIndicator from '../../src/community/breakout-indicator';
import * as breakoutPattern from '../../src/community/breakout-pattern-setup';
import * as breakoutProbability from '../../src/community/breakout-probability';
import * as breakoutTargets from '../../src/community/breakout-targets';
import * as bullishVolumeAnomaly from '../../src/community/bullish-volume-anomaly';
import * as bullsVBears from '../../src/community/bulls-v-bears';
import * as buyOnVolume from '../../src/community/buy-on-volume';
import * as buySellAccurate from '../../src/community/buy-sell-accurate-signals';
import * as hullCrossover from '../../src/community/buy-sell-hull-crossover-signals';
import * as kelfry from '../../src/community/buy-sell-signal-kelfry98';
import * as buyTheDip from '../../src/community/buy-the-dip-sell-the-rip';
import * as buysideSellside from '../../src/community/buyside-sellside-liquidity';

const DAY = 86400;
const T0 = 1262304000;
const CHART: ChartContext = { tickerid: 'NASDAQ:AAPL', mintick: 0.01 };

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
    const close = Math.max(1, open + Math.sin(i / 120) * 0.3 + (rand() - 0.5) * vol);
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 2);
    const volume = 1000 + Math.floor(rand() * 1000) + (i % 7 === 0 ? 4000 : 0);
    bars.push({ time: T0 + i * step, open, high, low, close, volume });
    price = close;
  }
  return bars;
}

const A = (s: Series) => s.toArray().map((v) => (v ?? NaN) as number);
const S = (bars: Bar[], f: (b: Bar, i: number) => number) => new Series(bars, (b, i) => f(b, i as number));
const timesWhere = (bars: Bar[], f: (i: number) => boolean) => bars.filter((_, i) => f(i)).map((b) => b.time as number);
type Mk = { time: unknown; position?: string; shape?: string; text?: string; color?: string; id?: string };
const markerTimes = (markers: Mk[], f: (m: Mk) => boolean) => [...new Set(markers.filter(f).map((m) => m.time as number))];
const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
const crossOver = (a: number[], b: number[] | number, i: number) => {
  const bv = (k: number) => (typeof b === 'number' ? b : at(b, k));
  return a[i] > bv(i) && at(a, i - 1) <= bv(i - 1);
};
const crossUnder = (a: number[], b: number[] | number, i: number) => {
  const bv = (k: number) => (typeof b === 'number' ? b : at(b, k));
  return a[i] < bv(i) && at(a, i - 1) >= bv(i - 1);
};
const specDecl = (rows: [string, string][]) => rows.map(([title, message], k) => ({ id: `alert${k}`, title, message }));

// ---------------------------------------------------------------------------------------------------------------

describe('Breaker Blocks with Signals: alertconditions and alert() calls', () => {
  const titles = [
    ' 1. +BB', ' 2. signal UP', ' 3. TP UP 1', ' 3. TP UP 2', ' 3. TP UP 3', ' 4. cancel UP', ' 5. +BB Mitigated',
    ' 6. LL 1 Break', ' 6. LL 2 Break', ' 7. Swing UP 1 Break', ' 7. Swing UP 2 Break',
    '1. -BB', '2. signal DN', '3. TP DN 1', '3. TP DN 2', '3. TP DN 3', '4. cancel DN', '5. -BB Mitigated',
    '6. HH 1 Break', '6. HH 2 Break', '7. Swing DN 1 Break', '7. Swing DN 2 Break',
  ];
  /** The alert() messages of the original for each condition */
  const calls: string[][] = [
    ['+BB', '+BB (R)'], ['signal UP'], ['TP UP 1'], ['TP UP 2'], ['TP UP 3'], ['cancel UP'], ['+BB Mitigated'],
    ['LL 1 break'], ['LL 2 break'], ['Swing UP 1 break'], ['Swing UP 2 break'],
    ['-BB', '-BB (R)'], ['signal DN'], ['TP DN 1'], ['TP DN 2'], ['TP DN 3'], ['cancel DN'], ['-BB Mitigated'],
    ['HH 1 break'], ['HH 2 break'], ['Swing DN 1 break'], ['Swing DN 2 break'],
  ];
  const bars = walk(1500, 2);

  it('declares the 22 conditions of the original', () => {
    expect(breakerBlocks.alertConditions).toEqual(specDecl(titles.map((t) => [t, t.trim()])));
    expect(breakerBlocks.BreakerBlocksWithSignals.alertConditions).toBe(breakerBlocks.alertConditions);
    expect(breakerBlocks.hasAlertFunction).toBe(true);
  });

  for (const inputs of [{}, { iTP: true }, { iTP: true, tillFirstBreak: false }]) {
    it(`each condition is true on the bars of its alert() calls (${JSON.stringify(inputs)})`, () => {
      const res = breakerBlocks.calculate(bars, inputs);
      const known = new Set(calls.flat());
      for (const c of res.alertCalls) {
        expect(known.has(c.message)).toBe(true);
        expect(c.freq).toBe(c.message.startsWith('TP ') ? 'once_per_bar' : 'once_per_bar_close');
      }
      calls.forEach((messages, k) => {
        const expected = [...new Set(res.alertCalls.filter((c) => messages.includes(c.message)).map((c) => c.time))];
        expect(res.alerts[k].times).toEqual(expected);
      });
      // the main signals happen on this walk
      for (const k of [0, 1, 5, 6, 7, 11, 12, 16, 17, 18]) expect(res.alerts[k].times.length).toBeGreaterThan(0);
      if ('iTP' in inputs) for (const k of [2, 13]) expect(res.alerts[k].times.length).toBeGreaterThan(0);
      if ('tillFirstBreak' in inputs) expect(res.alertCalls.some((c) => c.message.endsWith('(R)'))).toBe(true);
      // signal UP: open below the block top and close above it; signal DN: the mirror
      const idx = new Map(bars.map((b, i) => [b.time as number, i]));
      for (const t of res.alerts[1].times) expect(bars[idx.get(t)!].close).toBeGreaterThan(bars[idx.get(t)!].open);
      for (const t of res.alerts[12].times) expect(bars[idx.get(t)!].close).toBeLessThan(bars[idx.get(t)!].open);
    });
  }
});

describe('Breakout and Retest Signals: alertconditions', () => {
  const bars = walk(1200, 5);
  const res = breakoutRetest.calculate(bars);

  it('declares the 2 conditions of the original', () => {
    expect(breakoutRetest.alertConditions).toEqual(specDecl([
      ['Bearish Breakout and Retest', 'Alert Fired!'], ['Bullish Breakout and Retest', 'Alert Fired!'],
    ]));
    expect(breakoutRetest.BreakoutAndRetestSignals.alertConditions).toBe(breakoutRetest.alertConditions);
  });

  it('fires on a pivot while the opposite swing list is not empty at the end of the bar', () => {
    const xr = Math.trunc(7 / 2);
    const ph = A(ta.pivothigh(S(bars, (b) => b.high), 7, xr));
    const pl = A(ta.pivotlow(S(bars, (b) => b.low), 7, xr));
    let highs = 0;
    let lows = 0;
    const bear: number[] = [];
    const bull: number[] = [];
    bars.forEach((b, i) => {
      if (!isNaN(ph[i])) highs = Math.min(highs + 1, 3);
      if (!isNaN(pl[i])) lows = Math.min(lows + 1, 3);
      if (!isNaN(ph[i]) && lows > 0) lows -= 1;
      if (!isNaN(pl[i]) && highs > 0) highs -= 1;
      if (!isNaN(ph[i]) && lows > 0) bear.push(b.time as number);
      if (!isNaN(pl[i]) && highs > 0) bull.push(b.time as number);
    });
    expect(bear.length).toBeGreaterThan(5);
    expect(bull.length).toBeGreaterThan(5);
    expect(res.alerts[0].times).toEqual(bear);
    expect(res.alerts[1].times).toEqual(bull);
  });
});

describe('Breakout Finder: alertconditions', () => {
  const bars = walk(1500, 1, 4);
  const res = breakoutFinder.calculate(bars);

  it('declares the 3 conditions of the original', () => {
    expect(breakoutFinder.alertConditions).toEqual(specDecl([
      ['Breakout', 'Breakout'], ['Breakdown', 'Breakdown'], ['Breakout or Breakdown', 'Breakout or Breakdown'],
    ]));
    expect(breakoutFinder.BreakoutFinder.alertConditions).toBe(breakoutFinder.alertConditions);
  });

  it('fires on the bars of the breakout / breakdown triangles', () => {
    const up = markerTimes(res.markers, (m) => m.shape === 'triangleUp');
    const down = markerTimes(res.markers, (m) => m.shape === 'triangleDown');
    expect(up.length).toBeGreaterThan(2);
    expect(down.length).toBeGreaterThan(2);
    expect(res.alerts[0].times).toEqual(up);
    expect(res.alerts[1].times).toEqual(down);
    expect(res.alerts[2].times).toEqual([...new Set([...up, ...down])].sort((a, b) => a - b));
  });
});

describe('Breakout Indicator: alertcondition', () => {
  const bars = walk(800, 9);

  it('declares the condition of the original', () => {
    expect(breakoutIndicator.alertConditions).toEqual(specDecl([['Breakout Alert!', 'Breakout signal for {{ticker}}']]));
    expect(breakoutIndicator.BreakoutIndicator.alertConditions).toBe(breakoutIndicator.alertConditions);
  });

  it('fires when the close is beyond a price from the breakout time', () => {
    const closes = bars.map((b) => b.close).sort((a, b) => a - b);
    const longBreakout = closes[Math.floor(closes.length * 0.8)];
    const shortBreakout = closes[Math.floor(closes.length * 0.2)];
    const timeBreakout = (bars[200].time as number) * 1000;
    const res = breakoutIndicator.calculate(bars, { longBreakout, shortBreakout, timeBreakout });
    const expected = timesWhere(bars, (i) => (bars[i].time as number) * 1000 >= timeBreakout
      && (bars[i].close > longBreakout || bars[i].close < shortBreakout));
    expect(expected.length).toBeGreaterThan(20);
    expect(res.alerts[0].times).toEqual(expected);
    // prices of 0: no line and no alert
    expect(breakoutIndicator.calculate(bars).alerts[0].times).toEqual([]);
  });
});

describe('Breakout Pattern Setup: alert() calls', () => {
  const bars = walk(1500, 3, 2);
  const chart: ChartContext = { ...CHART, timeframe: '1D' };
  const inputs = { historyMode: 'All' as const, maxChannelBars: 60, volContraction: false, convergenceMin: 0, minChannelWidthAtr: 0.1 };
  const res = breakoutPattern.calculate(bars, inputs, chart);
  const fmt = (x: number) => str.tostring(x, 'mintick', 0.01);
  const idx = new Map(bars.map((b, i) => [b.time as number, i]));

  it('declares alert() calls', () => {
    expect(breakoutPattern.hasAlertFunction).toBe(true);
    expect(breakoutPattern.BreakoutPatternSetup.hasAlertFunction).toBe(true);
  });

  it('formats the text messages as the original, once per bar close', () => {
    expect(res.alertCalls.length).toBeGreaterThan(0);
    const kinds = new Set<string>();
    for (const c of res.alertCalls) {
      expect(c.freq).toBe('once_per_bar_close');
      const close = fmt(bars[idx.get(c.time)!].close);
      const trade = /^(🟢 BUY|🔴 SELL) \[(Strong|Medium|Weak)\] \| NASDAQ:AAPL \| 1D \| Entry: (\S+) \| SL: \S+ \| TP1: \S+ \| TP2: \S+ \| TP3: \S+$/u.exec(c.message);
      const pattern = /^🟡 PATTERN DETECTED \| NASDAQ:AAPL \| TF: 1D \| Price: (\S+)$/u.exec(c.message);
      const event = /^(⌛ TRADE_TIMEOUT|🎯 TP1_HIT|🎯 TP2_HIT|🏆 TP3_HIT|🛑 SL_HIT|⚖️ BE_EXIT) \| NASDAQ:AAPL \| (\S+)$/u.exec(c.message);
      const m = trade ?? pattern ?? event;
      expect(m, c.message).not.toBeNull();
      expect(m![m!.length - 1]).toBe(close);
      if (trade) expect(trade[3]).toBe(close);
      kinds.add(trade ? trade[1] : pattern ? 'pattern' : event![1]);
    }
    expect([...kinds].sort()).toEqual(['pattern', '⚖️ BE_EXIT', '🎯 TP1_HIT', '🎯 TP2_HIT', '🏆 TP3_HIT', '🔴 SELL',
      '🛑 SL_HIT', '🟢 BUY'].sort());
    // a hit follows the BUY / SELL call of its trade
    let open = false;
    for (const c of res.alertCalls) {
      if (/^(🟢|🔴)/u.test(c.message)) open = true;
      else if (c.message.startsWith('🎯 TP1')) expect(open).toBe(true);
      else if (/^(🏆|🛑|⚖️|⌛)/u.test(c.message)) open = false;
    }
  });

  it('one PATTERN DETECTED call per pattern, one BUY / SELL call per signal label', () => {
    const patterns = res.alertCalls.filter((c) => c.message.startsWith('🟡')).length;
    const cell = res.tables!.flatMap((t) => t.cells).find((x) => x.column === 1 && x.row === 9);
    expect(String(patterns)).toBe(cell!.text);
    const longs = res.labels.filter((l) => l.text === 'Long').map((l) => l.time);
    const shorts = res.labels.filter((l) => l.text === 'Short').map((l) => l.time);
    expect(res.alertCalls.filter((c) => c.message.startsWith('🟢')).map((c) => c.time)).toEqual(longs);
    expect(res.alertCalls.filter((c) => c.message.startsWith('🔴')).map((c) => c.time)).toEqual(shorts);
  });

  it('gives JSON messages with "Webhook JSON Format"', () => {
    const json = breakoutPattern.calculate(bars, { ...inputs, webhook: true }, chart);
    expect(json.alertCalls.length).toBe(res.alertCalls.length);
    for (const c of json.alertCalls) {
      const o = JSON.parse(c.message);
      expect(o.ticker).toBe('NASDAQ:AAPL');
      expect(o.price).toBe(Number(fmt(bars[idx.get(c.time)!].close)));
      if (o.action === 'buy' || o.action === 'sell') expect(o.tf).toBe('1D');
    }
  });
});

describe('Breakout Probability (Expo): alert() calls', () => {
  const bars = walk(700, 13);

  /** The original's per-bar loop, again: one call per shown level */
  function expectedCalls(perc: number, nbr: number, disableZero: boolean, on: boolean[]) {
    const total = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
    const vals = Array.from({ length: 5 }, () => [0, 0, 0, 0]);
    const out: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      const p = i > 0 ? bars[i - 1] : undefined;
      const h1 = p ? p.high : NaN;
      const l1 = p ? p.low : NaN;
      const step = b.close * (perc / 100);
      const green = !!p && p.close > p.open;
      const red = !!p && p.close < p.open;
      if (green) total[5][0] += 1;
      if (red) total[5][1] += 1;
      for (let k = 0; k < 5; k++) {
        const x = step * k;
        const [ghh, gll, rhh, rll] = total[k];
        const hh = b.high >= h1 + x;
        const ll = b.low <= l1 - x;
        if (green && hh) { total[k][0] = ghh + 1; vals[k][0] = math.round(((ghh + 1) / total[5][0]) * 100, 2) as number; }
        if (green && ll) { total[k][1] = gll + 1; vals[k][1] = math.round(((gll + 1) / total[5][0]) * 100, 2) as number; }
        if (red && hh) { total[k][2] = rhh + 1; vals[k][2] = math.round(((rhh + 1) / total[5][1]) * 100, 2) as number; }
        if (red && ll) { total[k][3] = rll + 1; vals[k][3] = math.round(((rll + 1) / total[5][1]) * 100, 2) as number; }
      }
      const [a1, b1, a2, b2] = vals[0];
      for (let k = 0; k < nbr; k++) {
        const shown = !disableZero || (green ? Math.min(vals[k][0], vals[k][1]) > 0 : Math.min(vals[k][2], vals[k][3]) > 0);
        if (!shown || !on.includes(true)) continue;
        const rt = (v: number) => str.tostring(math.round_to_mintick(v, 0.01) as unknown as number);
        const s3 = green ? (Math.max(a1, b1) === a1 ? 'BULLISH' : 'BEARISH') : (Math.max(a2, b2) === a2 ? 'BULLISH' : 'BEARISH');
        const s4 = green ? (Math.max(a1, b1) === a1 ? a1 : b1) : (Math.min(a2, b2) === a2 ? a2 : b2);
        const s5 = red ? (Math.max(a2, b2) === a2 ? a2 : b2) : (Math.min(a1, b1) === a1 ? a1 : b1);
        const parts = ['AAPL', `High Price: ${rt(h1)} | Low Price: ${rt(l1)}`, `BIAS: ${s3}`,
          `Percentage: High: ${str.tostring(s4, 'percent')} | Low: ${str.tostring(s5, 'percent')}`];
        out.push({ time: b.time as number, message: parts.filter((_, x) => on[x]).join('\n'), freq: 'once_per_bar' });
      }
    });
    return out;
  }

  it('declares alert() calls', () => {
    expect(breakoutProbability.hasAlertFunction).toBe(true);
    expect(breakoutProbability.BreakoutProbability.hasAlertFunction).toBe(true);
  });

  it('makes one call per shown level on every bar, with the parts of the original', () => {
    const res = breakoutProbability.calculate(bars, {}, CHART);
    const expected = expectedCalls(1.0, 5, true, [true, true, true, true]);
    expect(expected.length).toBeGreaterThan(bars.length);
    expect(res.alertCalls).toEqual(expected);
    expect(res.alertCalls[res.alertCalls.length - 1].message).toMatch(/^AAPL\nHigh Price: [\d.]+ \| Low Price: [\d.]+\nBIAS: (BULLISH|BEARISH)\nPercentage: High: [\d.]+% \| Low: [\d.]+%$/);
  });

  it('keeps only the parts that are on, and no call with all parts off', () => {
    const some = breakoutProbability.calculate(bars, { alertTicker: false, alertBias: false, nbr: 3, disableZero: false, perc: 0.5 }, CHART);
    expect(some.alertCalls).toEqual(expectedCalls(0.5, 3, false, [false, true, false, true]));
    const none = breakoutProbability.calculate(bars, {
      alertTicker: false, alertPrice: false, alertBias: false, alertPercentage: false,
    }, CHART);
    expect(none.alertCalls).toEqual([]);
  });
});

describe('Breakout Targets: alertconditions', () => {
  const bars = walk(1500, 17, 3);
  const res = breakoutTargets.calculate(bars, { len: 20, slMultiplier: 1 });

  it('declares the 6 conditions of the original', () => {
    expect(breakoutTargets.alertConditions).toEqual(specDecl([
      ['Bullish Breakout', 'Bullish Breakout Detected'], ['Bearish Breakout', 'Bearish Breakout Detected'],
      ['TP1 Hit', 'Take Profit 1 Hit'], ['TP2 Hit', 'Take Profit 2 Hit'], ['TP3 Hit', 'Take Profit 3 Hit'],
      ['SL Hit', 'Stop Loss Hit'],
    ]));
    expect(breakoutTargets.BreakoutTargets.alertConditions).toBe(breakoutTargets.alertConditions);
  });

  it('breakouts fire on the bars of the breakout labels', () => {
    const up = markerTimes(res.markers, (m) => m.shape === 'labelUp');
    const down = markerTimes(res.markers, (m) => m.shape === 'labelDown');
    expect(up.length).toBeGreaterThan(3);
    expect(down.length).toBeGreaterThan(3);
    expect(res.alerts[0].times).toEqual(up);
    expect(res.alerts[1].times).toEqual(down);
  });

  it('target and stop hits: a level of the last trade reached on this bar and not on the bar before', () => {
    const atr = A(ta.atr(bars, 14));
    const up = new Set(res.alerts[0].times);
    const down = new Set(res.alerts[1].times);
    expect([...up].filter((t) => down.has(t))).toEqual([]);
    const mult = [0.5, 1.0, 1.5];
    const hits: number[][] = [[], [], [], []];
    let dir = 0;
    let sl = NaN;
    let tps = [NaN, NaN, NaN];
    bars.forEach((b, i) => {
      const t = b.time as number;
      if (up.has(t) || down.has(t)) {
        dir = up.has(t) ? 1 : -1;
        sl = dir === 1 ? b.low - atr[i] : b.high + atr[i];
        tps = mult.map((m) => b.close + dir * Math.abs(b.close - sl) * m);
      }
      if (dir === 0) return;
      const h1 = at(bars.map((x) => x.high), i - 1);
      const l1 = at(bars.map((x) => x.low), i - 1);
      [...tps, sl].forEach((lvl, k) => {
        const isSl = k === 3;
        const hitUp = b.high >= lvl && h1 < lvl;
        const hitDown = b.low <= lvl && l1 > lvl;
        if (dir === 1 ? (isSl ? hitDown : hitUp) : (isSl ? hitUp : hitDown)) hits[k].push(t);
      });
    });
    for (let k = 0; k < 4; k++) {
      expect(hits[k].length).toBeGreaterThan(0);
      expect(res.alerts[2 + k].times).toEqual(hits[k]);
    }
    // without the trade levels there are no hits
    const noTp = breakoutTargets.calculate(bars, { len: 20, slMultiplier: 1, showTp: false });
    for (let k = 2; k < 6; k++) expect(noTp.alerts[k].times).toEqual([]);
  });
});

describe('Bullish Volume Anomaly: alertcondition', () => {
  it('declares the condition of the original', () => {
    expect(bullishVolumeAnomaly.alertConditions).toEqual(specDecl([['{{ticker}}', 'Alert Fired!']]));
    expect(bullishVolumeAnomaly.BullishVolumeAnomaly.alertConditions).toBe(bullishVolumeAnomaly.alertConditions);
  });

  it('fires on the bars of the triangles: a slide with heavy volume on the up legs, not on the walk before it', () => {
    const bars = walk(700, 5);
    let price = bars[bars.length - 1].close + 80;
    for (let c = 0; c < 45; c++) {
      for (let k = 0; k < 18; k++) {
        const up = k >= 12;
        const open = price;
        const close = price + (up ? 1.0 : -0.8);
        bars.push({ time: T0 + bars.length * DAY, open, close, high: Math.max(open, close) + 0.3,
          low: Math.min(open, close) - 0.3, volume: up ? 50000 : 10 });
        price = close;
      }
    }
    const res = bullishVolumeAnomaly.calculate(bars);
    const triangles = markerTimes(res.markers, (m) => m.shape === 'triangleUp');
    expect(triangles.length).toBeGreaterThan(10);
    expect(res.alerts[0].times).toEqual(triangles);
    expect(triangles[0]).toBeGreaterThan(T0 + 700 * DAY);
  });
});

describe('Bulls v Bears: alertconditions', () => {
  const bars = walk(1000, 19);

  it('declares the 4 conditions of the original', () => {
    expect(bullsVBears.alertConditions).toEqual(specDecl([
      ['Bullish Crossover', 'Bullish overbought'], ['Bearish Crossover', 'Bearish oversold'],
      ['Total Crossover', 'BvB total crossover'], ['Bearish Zero Cross', 'Bulls v Bears: Bearish zero line cross'],
    ]));
    expect(bullsVBears.BullsVBears.alertConditions).toBe(bullsVBears.alertConditions);
  });

  for (const normType of ['Normalized', 'Raw'] as const) {
    it(`fires on the bars of the original expressions (${normType})`, () => {
      const res = bullsVBears.calculate(bars, { normType });
      const ma = A(ta.ema(S(bars, (b) => b.close), 14));
      const bulls = bars.map((b, i) => b.high - ma[i]);
      const bears = bars.map((b, i) => ma[i] - b.low);
      let total: number[];
      if (normType === 'Normalized') {
        const [mnB, mxB, mnR, mxR] = [ta.lowest, ta.highest, ta.lowest, ta.highest]
          .map((f, k) => A(f(Series.fromArray(bars, k < 2 ? bulls : bears), 120)));
        total = bars.map((_, i) => ((bulls[i] - mnB[i]) / (mxB[i] - mnB[i]) - 0.5) * 100
          - ((bears[i] - mnR[i]) / (mxR[i] - mnR[i]) - 0.5) * 100);
      } else {
        total = bulls.map((v, i) => v - bears[i]);
      }
      const hi = A(ta.highest(Series.fromArray(bars, total), 50));
      const lo = A(ta.lowest(Series.fromArray(bars, total), 50));
      const upper = normType === 'Normalized' ? bars.map(() => 80) : hi.map((h, i) => lo[i] + (h - lo[i]) * 0.95);
      const lower = normType === 'Normalized' ? bars.map(() => -80) : hi.map((h, i) => lo[i] + (h - lo[i]) * 0.05);
      const expected = [
        timesWhere(bars, (i) => total[i] > upper[i]),
        timesWhere(bars, (i) => total[i] < lower[i]),
        timesWhere(bars, (i) => crossOver(total, 0, i)),
        timesWhere(bars, (i) => crossUnder(total, 0, i)),
      ];
      expected.forEach((e, k) => {
        expect(e.length).toBeGreaterThan(3);
        expect(res.alerts[k].times).toEqual(e);
      });
    });
  }
});

describe('Buy on Volume: alertcondition', () => {
  const bars = walk(1200, 23);

  it('declares the condition of the original', () => {
    expect(buyOnVolume.alertConditions).toEqual(specDecl([
      ['Buy Signal', 'Buy Signal! DEMA crossed above Lorentzian Line, and volume is 50% higher than average.'],
    ]));
    expect(buyOnVolume.BuyOnVolume.alertConditions).toBe(buyOnVolume.alertConditions);
  });

  it('fires on DEMA crossovers of the line with volume above 1.3 x its average', () => {
    const res = buyOnVolume.calculate(bars);
    const close = S(bars, (b) => b.close);
    const e1 = A(ta.ema(close, 6));
    const e2 = A(ta.ema(Series.fromArray(bars, e1), 6));
    const dema = e1.map((v, i) => 2 * v - e2[i]);
    const line = A(ta.sma(close, 16));
    const avgVol = A(ta.sma(S(bars, (b) => b.volume ?? NaN), 20));
    const expected = timesWhere(bars, (i) => crossOver(dema, line, i) && (bars[i].volume ?? NaN) > avgVol[i] * 1.3);
    expect(expected.length).toBeGreaterThan(3);
    expect(res.alerts[0].times).toEqual(expected);
  });
});

describe('Buy & Sell - Accurate Signals: Style ids of the markers', () => {
  it('gives each marker the id of its plotshape output', () => {
    const bars = walk(1200, 29);
    const res = buySellAccurate.calculate(bars);
    expect(res.markers.length).toBeGreaterThan(10);
    const ids = new Set(['shape0', 'shape1', 'shape2', 'shape3']);
    for (const m of res.markers) {
      expect(ids.has(m.id!)).toBe(true);
      const expected = m.shape === 'circle' ? (m.color === '#4CAF50' ? 'shape0' : 'shape2')
        : m.shape === 'labelUp' ? 'shape1' : 'shape3';
      expect(m.id).toBe(expected);
    }
    for (const id of ids) expect(res.markers.some((m) => m.id === id)).toBe(true);
    // Buy / Sell labels off: only the circles
    const noLabels = buySellAccurate.calculate(bars, { showLabels: false });
    expect(new Set(noLabels.markers.map((m) => m.id))).toEqual(new Set(['shape0', 'shape2']));
  });
});

describe('Buy/Sell Hull Crossover Signals: alertconditions', () => {
  const bars = walk(1200, 31);

  it('declares the 2 conditions of the original', () => {
    expect(hullCrossover.alertConditions).toEqual(specDecl([
      ['Buy Signal', 'HMA fast crossed above slow — BUY'], ['Sell Signal', 'HMA fast crossed below slow — SELL'],
    ]));
    expect(hullCrossover.BuySellHullCrossoverSignals.alertConditions).toBe(hullCrossover.alertConditions);
  });

  it('fires on the HMA crosses, on confirmed bars only with "Confirm signals on bar close"', () => {
    const close = S(bars, (b) => b.close);
    const fast = A(ta.hma(close, 20));
    const slow = A(ta.hma(close, 55));
    const up = timesWhere(bars, (i) => crossOver(fast, slow, i));
    const down = timesWhere(bars, (i) => crossUnder(fast, slow, i));
    expect(up.length).toBeGreaterThan(5);
    expect(down.length).toBeGreaterThan(5);
    const res = hullCrossover.calculate(bars, { showLabels: false });
    expect(res.alerts[0].times).toEqual(up);
    expect(res.alerts[1].times).toEqual(down);
    // a cross on an open last bar waits for its close
    const lastT = bars[bars.length - 1].time as number;
    const cut = bars.slice(0, bars.findIndex((b) => b.time === up[up.length - 1]) + 1);
    const open = hullCrossover.calculate(cut, {}, { lastBarConfirmed: false });
    expect(open.alerts[0].times).toEqual(up.slice(0, -1));
    expect(open.alerts[0].triggered).toBe(false);
    const unconfirmed = hullCrossover.calculate(cut, { confirmOnClose: false }, { lastBarConfirmed: false });
    expect(unconfirmed.alerts[0].times).toEqual(up);
    expect(unconfirmed.alerts[0].triggered).toBe(true);
    expect(lastT).toBeGreaterThan(0);
  });
});

describe('Buy Sell Signal (kelfry98): alertconditions', () => {
  const bars = walk(1500, 37);
  const res = kelfry.calculate(bars);

  it('declares the 5 conditions of the original', () => {
    expect(kelfry.alertConditions).toEqual(specDecl([
      ['🟢 BUY Signal', '📈 BUY on {{ticker}} | Price: {{close}}'],
      ['🔴 SELL Signal', '📉 SELL on {{ticker}} | Price: {{close}}'],
      ['🎯 Final Take Profit', '✅ Final TP hit on {{ticker}} | Price: {{close}}'],
      ['❌ Stop Loss', '🛑 SL triggered on {{ticker}} | Price: {{close}}'],
      ['⚠️ Entry Invalidated', '⚠️ Previous entry invalidated on {{ticker}} | New signal detected'],
    ]));
    expect(kelfry.BuySellSignalKelfry98.alertConditions).toBe(kelfry.alertConditions);
  });

  it('fires on the bars of the shapes that plot the same conditions', () => {
    const expected = [
      markerTimes(res.markers, (m) => m.text === 'BUY'),
      markerTimes(res.markers, (m) => m.text === 'SELL'),
      markerTimes(res.markers, (m) => m.shape === 'circle'),
      markerTimes(res.markers, (m) => m.shape === 'xcross'),
      markerTimes(res.markers, (m) => m.shape === 'diamond'),
    ];
    expected.forEach((e, k) => {
      expect(e.length).toBeGreaterThan(2);
      expect(res.alerts[k].times).toEqual(e);
    });
  });

  it('BUY / SELL: the EMA trend changes on a candle in its direction', () => {
    const close = S(bars, (b) => b.close);
    const f = A(ta.ema(close, 5));
    const s = A(ta.ema(close, 13));
    const bull = f.map((v, i) => v > s[i]);
    const change = (i: number) => bull[i] !== (i > 0 ? bull[i - 1] : false);
    // a BUY needs no LONG position open: every BUY bar is a bullish trend change, not every change is a BUY
    const ups = new Set(timesWhere(bars, (i) => bull[i] && change(i) && bars[i].close > bars[i].open));
    const downs = new Set(timesWhere(bars, (i) => f[i] < s[i] && change(i) && bars[i].close < bars[i].open));
    for (const t of res.alerts[0].times) expect(ups.has(t)).toBe(true);
    for (const t of res.alerts[1].times) expect(downs.has(t)).toBe(true);
  });
});

describe('Buy the Dip & Sell the Rip: alert() calls', () => {
  it('calls "Buy the Dip!" / "Sell the Rip!" once per bar close on the RSI conditions', () => {
    expect(buyTheDip.hasAlertFunction).toBe(true);
    expect(buyTheDip.BuyTheDipSellTheRip.hasAlertFunction).toBe(true);
    const bars = walk(1200, 41);
    const res = buyTheDip.calculate(bars);
    const rsiS = ta.rsi(S(bars, (b) => b.close), 14);
    const rsi = A(rsiS);
    const sma = A(ta.sma(rsiS, 14));
    const expected: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      if (at(rsi, i - 1) < 30 && rsi[i] > rsi[i - 1]) expected.push({ time: b.time as number, message: 'Buy the Dip!', freq: 'once_per_bar_close' });
      if (rsi[i] > 70 && sma[i] > 70 && at(rsi, i - 1) > rsi[i]) expected.push({ time: b.time as number, message: 'Sell the Rip!', freq: 'once_per_bar_close' });
    });
    expect(expected.filter((c) => c.message === 'Buy the Dip!').length).toBeGreaterThan(3);
    expect(expected.filter((c) => c.message === 'Sell the Rip!').length).toBeGreaterThan(3);
    expect(res.alertCalls).toEqual(expected);
  });
});

describe('Buyside & Sellside Liquidity: alert() calls', () => {
  const bars = walk(1500, 43, 3);

  it('declares alert() calls', () => {
    expect(buysideSellside.hasAlertFunction).toBe(true);
    expect(buysideSellside.BuysideSellsideLiquidity.hasAlertFunction).toBe(true);
  });

  it('calls on each new level (the bar after the end of its solid line) and on each breach (end of its dotted line)', () => {
    const res = buysideSellside.calculate(bars, { mode: 'Historical', visLiq: 50, liqBuy: false, liqSel: false }, CHART);
    const messages = new Set([
      'buyside liquidity level detected/updated for AAPL', 'sellside liquidity level detected/updated for AAPL',
      'buyside liquidity level breached for AAPL', 'sellside liquidity level breached for AAPL',
    ]);
    for (const c of res.alertCalls) {
      expect(messages.has(c.message)).toBe(true);
      expect(c.freq).toBe('once_per_bar');
    }
    const lastT = bars[bars.length - 1].time as number;
    for (const [side, css] of [['buyside', 'rgb(76, 175, 80)'], ['sellside', 'rgb(242, 54, 69)']] as const) {
      const same = (c: string) => c === css;
      const solid = res.lines.filter((l) => l.style === 'solid' && same(String(l.color)));
      const dotted = res.lines.filter((l) => l.style === 'dotted' && same(String(l.color)));
      const detected = res.alertCalls.filter((c) => c.message.startsWith(`${side} liquidity level detected`)).map((c) => c.time);
      const breached = res.alertCalls.filter((c) => c.message.startsWith(`${side} liquidity level breached`)).map((c) => c.time);
      expect(detected.length).toBeGreaterThan(3);
      expect(breached.length).toBeGreaterThan(3);
      expect(detected).toEqual(solid.map((l) => (l.time2 as number) + DAY).sort((a, b) => a - b));
      // a breached level's dotted line ends on the breach bar; the others run to the last bar
      const ends = dotted.map((l) => l.time2 as number).filter((t) => t < lastT).sort((a, b) => a - b);
      expect(breached.filter((t) => t < lastT)).toEqual(ends);
    }
  });
});
