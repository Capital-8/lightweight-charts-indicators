/**
 * Unit tests for the chart context: the optional third argument of calculate(bars, inputs, chart).
 */

import { describe, it, expect } from 'vitest';
import {
  indicatorRegistry, mintickOf, timezoneOf, tickeridOf, tickerOf, symbolTypeOf, currencyOf, foregroundColorOf,
  backgroundColorOf, lastBarConfirmedOf, nowOf,
} from '../../src/index';
import { makeBars } from './community-top100.helpers';

describe('chart context helpers', () => {
  it('give the fallbacks without a context', () => {
    expect(mintickOf()).toBe(0.01);
    expect(timezoneOf()).toBe('Etc/UTC');
    expect(tickeridOf()).toBe('');
    expect(tickerOf()).toBe('');
    expect(symbolTypeOf()).toBe('');
    expect(currencyOf()).toBe('USD');
    expect(foregroundColorOf()).toBe('#DBDBDB');
    expect(backgroundColorOf()).toBe('#0F0F0F');
    expect(lastBarConfirmedOf()).toBe(true);
    expect(Math.abs(nowOf() - Date.now())).toBeLessThan(1000);
  });

  it('give the values of the context', () => {
    const chart = {
      mintick: 1, timezone: 'America/New_York', tickerid: 'NASDAQ:AAPL', symbolType: 'stock', currency: 'EUR',
      foregroundColor: '#000000', backgroundColor: '#FFFFFF', lastBarConfirmed: false, now: 123,
    };
    expect(mintickOf(chart)).toBe(1);
    expect(timezoneOf(chart)).toBe('America/New_York');
    expect(tickeridOf(chart)).toBe('NASDAQ:AAPL');
    expect(tickerOf(chart)).toBe('AAPL');
    expect(symbolTypeOf(chart)).toBe('stock');
    expect(currencyOf(chart)).toBe('EUR');
    expect(foregroundColorOf(chart)).toBe('#000000');
    expect(backgroundColorOf(chart)).toBe('#FFFFFF');
    expect(lastBarConfirmedOf(chart)).toBe(false);
    expect(nowOf(chart)).toBe(123);
  });

  it('take the tick from minmove / pricescale', () => {
    expect(mintickOf({ minmove: 25, pricescale: 100 })).toBe(0.25);
  });
});

describe('calculate(bars, inputs, chart)', () => {
  const bars = makeBars(3200, 86400);
  const entry = indicatorRegistry.find((e) => e.id === 'volume-profile-fixed-range')!;
  const pocText = (result: any): string => result.labels[0].text;

  it('uses the fallback tick without a context, and an empty context changes nothing', () => {
    const plain = entry.calculate(bars, {});
    expect(pocText(plain)).toMatch(/^POC: \d+\.\d\d$/);
    expect(entry.calculate(bars, {}, {})).toEqual(plain);
  });

  it('writes prices with the symbol tick of the context', () => {
    expect(pocText(entry.calculate(bars, {}, { mintick: 1 }))).toMatch(/^POC: \d+$/);
  });

  it('accepts a context in every registry entry (the argument is optional)', () => {
    const sma = indicatorRegistry.find((e) => e.id === 'sma')!;
    expect(sma.calculate(bars, {}, { mintick: 1, timezone: 'America/New_York' })).toEqual(sma.calculate(bars, {}));
  });
});
