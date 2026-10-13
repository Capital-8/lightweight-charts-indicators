/**
 * Unit tests for the candlestick pattern port: the 44 single-pattern scripts and the
 * "*All Candlestick Patterns*" composite. Values were compared with the reference outputs separately.
 */

import { describe, it, expect } from 'vitest';
import { AllPatterns, KickingBearish, candlestickPortEntries, indicatorRegistry } from '../../src/index';

type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

/** 3200 daily bars (seeded random walk with up and down phases, frequent small bodies and gaps) */
function makeFixture(): Bar[] {
  const bars: Bar[] = [];
  let seed = 11;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let price = 100;
  for (let i = 0; i < 3200; i++) {
    const drift = Math.sin(i / 120) * 0.5;
    const open = Math.max(1, price + (rand() - 0.5) * 3);
    const close = Math.max(1, open + drift + (rand() - 0.5) * (rand() < 0.2 ? 0.2 : 5));
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 2);
    bars.push({ time: 1262304000 + i * 86400, open, high, low, close, volume: 1000 });
    price = close;
  }
  return bars;
}

const bars = makeFixture();
const key = (m: { time: number; text?: string; shape: string }) => `${m.time}|${m.text}|${m.shape}`;
const allOn = Object.fromEntries(AllPatterns.inputConfig.filter((c) => c.type === 'bool').map((c) => [c.id, true]));

describe('candlestick port registry', () => {
  it('registers the 44 patterns and the composite', () => {
    const ids = indicatorRegistry.filter((e) => e.group === 'candlestick').map((e) => e.id);
    expect(ids).toHaveLength(45);
    expect(ids).toContain('all-patterns');
    expect(new Set(ids).size).toBe(45);
  });
});

describe('All Candlestick Patterns composite', () => {
  it('declares the inputs of the Pine script with its defaults', () => {
    const cfg = AllPatterns.inputConfig;
    expect(AllPatterns.metadata).toMatchObject({ title: '*All Candlestick Patterns*', shortTitle: 'All Patterns', overlay: true });
    expect(cfg).toHaveLength(42);
    expect(cfg.slice(0, 5).map((c) => c.title)).toEqual([
      'Detect Trend Based On',
      'Label Color Bullish',
      'Label Color Bearish',
      'Label Color Neutral',
      'Pattern Type',
    ]);
    const on = cfg.filter((c) => c.type === 'bool' && c.defval === true).map((c) => c.title);
    expect(on).toEqual(['Abandoned Baby', 'Doji', 'Dragonfly Doji', 'Engulfing', 'Hammer']);
  });

  it('with every toggle on, shows the markers of the 44 single scripts and no background', () => {
    const res = AllPatterns.calculate(bars, allOn);
    expect(res.bgColors).toHaveLength(0);
    const single = new Set<string>();
    for (const e of candlestickPortEntries) for (const m of e.indicator.calculate(bars).markers) single.add(key(m));
    const composite = new Set(res.markers.filter((m) => m.text !== 'Collection').map(key));
    expect(composite.size).toBeGreaterThan(100);
    expect(composite).toEqual(single);
  });

  it('Pattern Type filters bullish and bearish labels, not the neutral ones', () => {
    const both = AllPatterns.calculate(bars, allOn).markers;
    const bull = AllPatterns.calculate(bars, { ...allOn, pattern_type: 'Bullish' }).markers;
    const bear = AllPatterns.calculate(bars, { ...allOn, pattern_type: 'Bearish' }).markers;
    const neutral = (ms: typeof both) => ms.filter((m) => m.color === '#787B86').map(key);
    expect(bull.some((m) => m.color === '#F23645')).toBe(false);
    expect(bear.some((m) => m.color === '#2962FF')).toBe(false);
    expect(neutral(bull)).toEqual(neutral(both));
    expect(neutral(bear)).toEqual(neutral(both));
    expect(bull.length + bear.length - neutral(both).length).toBe(both.length);
  });

  it('adds the "Collection" label with each bearish Kicking label', () => {
    // 20 quiet bars, then a white marubozu and a black marubozu that opens below its low
    const k: Bar[] = [];
    for (let i = 0; i < 20; i++) k.push({ time: 1e9 + i * 86400, open: 100, high: 101, low: 99, close: 100.5, volume: 1 });
    k.push({ time: 1e9 + 20 * 86400, open: 100, high: 110, low: 100, close: 110, volume: 1 });
    k.push({ time: 1e9 + 21 * 86400, open: 98, high: 98, low: 88, close: 88, volume: 1 });
    expect(KickingBearish.calculate(k).markers.map((m) => m.time)).toEqual([k[21].time]);
    const res = AllPatterns.calculate(k, { kicking: true });
    const last = res.markers.filter((m) => m.time === k[21].time);
    expect(last.map((m) => [m.text, m.shape, m.position])).toEqual([
      ['K', 'labelDown', 'aboveBar'],
      ['Collection', 'labelUp', 'belowBar'],
    ]);
  });
});

describe('candlestick port alert conditions', () => {
  const entries = indicatorRegistry.filter((e) => e.group === 'candlestick');

  it('every pattern declares its "New pattern detected" condition', () => {
    for (const e of entries.filter((x) => x.id !== 'all-patterns')) {
      expect(e.alertConditions, e.id).toHaveLength(1);
      expect(e.alertConditions![0]).toMatchObject({ id: 'alert0', title: 'New pattern detected' });
      expect(e.alertConditions![0].message).toMatch(/^New .+ pattern detected$/);
    }
    const byId = (id: string) => entries.find((x) => x.id === id)!.alertConditions![0].message;
    expect(byId('engulfing-bullish')).toBe('New Engulfing – Bullish pattern detected');
    expect(byId('doji')).toBe('New Doji pattern detected');
    expect(byId('spinning-top-white')).toBe('New Spinning Top White pattern detected');
  });

  it('the composite declares one condition per pattern', () => {
    const all = entries.find((x) => x.id === 'all-patterns')!;
    expect(all.alertConditions).toHaveLength(44);
    expect(all.alertConditions!.map((c) => c.title)).toContain('Engulfing – Bullish');
  });

  it('the result gives the bars on which a condition is true, matching the pattern labels', () => {
    const e = entries.find((x) => x.id === 'engulfing-bullish')!;
    const r = e.calculate(bars, e.defaultInputs);
    const times: number[] = r.alerts[0].times;
    expect(times.length).toBeGreaterThan(0);
    expect(times).toEqual([...new Set(r.markers.map((m: { time: number }) => m.time))]);
  });
});
