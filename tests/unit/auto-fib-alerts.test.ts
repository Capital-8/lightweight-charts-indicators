/**
 * alert() calls of Auto Fib Retracement and Auto Fib Extension: on a bar, each level switched on that the close crossed
 * since the previous close makes the call "Autofib: <ticker> crossing level <ratio>" (once per bar).
 *
 * The check is independent of the bar loop: the levels of bar k are the level labels drawn when the indicator runs on
 * the bars up to k (ratio and price in the label text), and the expected calls of bar k are the levels strictly
 * between the closes of bars k - 1 and k.
 */

import { describe, it, expect } from 'vitest';
import { indicatorRegistry, type AlertCall, type Bar, type ChartContext } from '../../src/index';
import { makeBars } from './community-top100.helpers';

const TICKER = 'TEST';
const chart = { tickerid: `NASDAQ:${TICKER}`, mintick: 0.01 } as ChartContext;
const bars = makeBars(1200, 86400);
const EPS = 1e-10;

/** Levels drawn on the last bar: [ratio, price] from the level labels ("0.618(123.45)"). */
function levelsOf(labels: { price: number; text: string }[]): [string, number][] {
  return labels.map((l) => [l.text.trim().split('(')[0]!, l.price]);
}

function expectedCalls(levels: [string, number][], c1: number, c0: number, time: number): AlertCall[] {
  return levels
    .filter(([, r]) => (r - c0 > EPS && c1 - r > EPS) || (c0 - r > EPS && r - c1 > EPS))
    .map(([ratio]) => ({ time, message: `Autofib: ${TICKER} crossing level ${ratio}`, freq: 'once_per_bar' }));
}

const sortCalls = (a: AlertCall[]) => [...a].sort((x, y) => x.time - y.time || x.message.localeCompare(y.message));

function run(id: string, b: Bar[]) {
  const entry = indicatorRegistry.find((e) => e.id === id)!;
  return entry.calculate(b, {}, chart) as { labels: { price: number; text: string }[]; alertCalls: AlertCall[] };
}

describe('Auto Fib alert() calls', () => {
  it('both entries declare the alert function', () => {
    for (const id of ['auto-fib-retracement', 'auto-fib-extension']) {
      expect(indicatorRegistry.find((e) => e.id === id)?.hasAlertFunction).toBe(true);
    }
  });

  it('Auto Fib Retracement: every bar, the levels of that bar crossed by the close', () => {
    const full = run('auto-fib-retracement', bars).alertCalls;
    const want: AlertCall[] = [];
    for (let k = 900; k < bars.length; k++) {
      const res = run('auto-fib-retracement', bars.slice(0, k + 1));
      want.push(...expectedCalls(levelsOf(res.labels), bars[k - 1]!.close, bars[k]!.close, bars[k]!.time));
    }
    const from = bars[900]!.time;
    expect(want.length).toBeGreaterThan(10);
    expect(sortCalls(full.filter((c) => c.time >= from))).toEqual(sortCalls(want));
    // Calls before the window exist too (the levels exist from the first leg on).
    expect(full.some((c) => c.time < from)).toBe(true);
  });

  it('Auto Fib Extension: the last bar only, the levels crossed by its close', () => {
    let total = 0;
    for (let k = 900; k < bars.length; k++) {
      const res = run('auto-fib-extension', bars.slice(0, k + 1));
      const want = expectedCalls(levelsOf(res.labels), bars[k - 1]!.close, bars[k]!.close, bars[k]!.time);
      expect(sortCalls(res.alertCalls)).toEqual(sortCalls(want));
      total += want.length;
    }
    expect(total).toBeGreaterThan(5);
  });
});
