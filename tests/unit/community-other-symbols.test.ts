/**
 * Unit tests for the ports that read other symbols (request.security of another ticker). Without the bars of the
 * other symbols they throw a MissingSymbolDataError that lists the requests of `requiredSymbols`; with the fixture
 * context (seeded bars for every requested symbol) the counts of every output must stay the same.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { indicatorRegistry, MissingSymbolDataError } from '../../src/index';
import { makeBars, summarize, NOW } from './community-top100.helpers';
import { fixtureContext } from './community-other-symbols.helpers';

const expected: Record<string, Record<string, unknown>> = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'community-other-symbols.expected.json'), 'utf-8'),
);
const bars = makeBars(3200, 86400);
const key = (r: { symbol: string; timeframe: string }) => `${r.symbol}|${r.timeframe}`;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe.each(Object.keys(expected))('%s', (id) => {
  const entry = indicatorRegistry.find((e) => e.id === id)!;

  it('declares the symbols it reads', () => {
    expect(entry.requiredSymbols).toBeTypeOf('function');
    expect(Array.isArray(entry.requiredSymbols!(entry.defaultInputs, { timeframe: '1D' }))).toBe(true);
  });

  // with the default inputs a port may need no other bars (screener-mean-reversion-channel: no asset defined;
  // volume-open-interest-footprint-by-leviathan: chart volume)
  const needs = entry.requiredSymbols!(entry.defaultInputs, { timeframe: '1D' }).length > 0;
  it.skipIf(!needs)('throws a MissingSymbolDataError listing its requests without the other bars', () => {
    let error: unknown;
    try {
      entry.calculate(bars as any, {}, { timeframe: '1D' });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(MissingSymbolDataError);
    const declared = new Set(entry.requiredSymbols!(entry.defaultInputs, { timeframe: '1D' }).map(key));
    for (const r of (error as MissingSymbolDataError).requests) expect(declared.has(key(r))).toBe(true);
  });

  it('gives the same outputs with the bars of the other symbols', () => {
    const want = expected[id];
    if ('error' in want) {
      expect(() => entry.calculate(bars as any, {}, fixtureContext(3200))).toThrow(want.error as string);
      return;
    }
    expect(summarize(entry.calculate(bars as any, {}, fixtureContext(3200)))).toEqual(want);
  });
});
