/**
 * Unit tests for the standard indicators added for the built-in list (24-hour Volume ... Visible Average Price).
 * Each one runs on 3,200 daily bars (context with every requested symbol) and on 4,000 60-minute bars (context
 * without other bars): the counts of every output must stay the same, and an indicator that stops with the runtime
 * error of its original must keep throwing it.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { indicatorRegistry } from '../../src/index';
import { summarize, NOW } from './community-top100.helpers';
import { fixtures, STANDARD_ISSUE6_IDS } from './standard-issue6.helpers';

type Expected = Record<string, Record<'daily' | 'm60', Record<string, unknown>>>;
const expected: Expected = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'standard-issue6.expected.json'), 'utf-8'),
);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

it('covers every added indicator', () => {
  expect(Object.keys(expected).sort()).toEqual([...STANDARD_ISSUE6_IDS].sort());
});

describe.each(STANDARD_ISSUE6_IDS)('%s', (id) => {
  const entry = indicatorRegistry.find((e) => e.id === id);

  it('is a standard registry entry with the overlay of its port', () => {
    expect(entry).toBeDefined();
    expect(entry!.group).toBe('standard');
    expect(entry!.overlay).toBe(entry!.metadata.overlay);
  });

  it.each(['daily', 'm60'] as const)('gives the same outputs on the %s bars', (name) => {
    const want = expected[id][name];
    const { bars, chart } = fixtures[name];
    if ('error' in want) {
      expect(() => entry!.calculate(bars as any, {}, chart)).toThrow(want.error as string);
      return;
    }
    const result: any = entry!.calculate(bars as any, {}, chart);
    expect(summarize(result)).toEqual(want);
    for (const points of Object.values(result.plots as Record<string, Array<{ time: number }>>)) {
      for (let i = 1; i < points.length; i++) expect(points[i].time).toBeGreaterThan(points[i - 1].time);
    }
  });
});
