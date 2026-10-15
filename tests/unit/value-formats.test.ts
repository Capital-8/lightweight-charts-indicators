import { describe, it, expect } from 'vitest';
import { indicatorRegistry } from '../../src/index';

const fmt = (id: string) => indicatorRegistry.find((e) => e.id === id)?.format;

describe('value formats of the built-ins', () => {
  it('follow the reference declarations', () => {
    expect(fmt('rsi')).toEqual({ type: 'price', precision: 2 });
    expect(fmt('williams-fractals')).toEqual({ type: 'price', precision: 0 });
    expect(fmt('obv')).toEqual({ type: 'volume' });
    expect(fmt('aroon')).toEqual({ type: 'percent', precision: 2 });
    expect(fmt('tsi')).toEqual({ type: 'price', precision: 4 });
  });

  it('a study in the symbol price format has none', () => {
    expect(fmt('sma')).toBeUndefined();
    expect(fmt('moon-phases')).toBeUndefined();
  });
});
