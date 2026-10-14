import { describe, expect, it } from 'vitest';
import { indicatorRegistry, REFERENCE_NAMES } from '../../src';

const entry = (id: string) => indicatorRegistry.find((e) => e.id === id)!;

describe('reference names', () => {
  it('names the built-ins as the reference app does', () => {
    expect([entry('sma').name, entry('sma').shortName]).toEqual(['Simple moving average', 'SMA']);
    expect([entry('macd').metadata.title, entry('macd').metadata.shortTitle]).toEqual(['Moving average convergence divergence', 'MACD']);
    expect([entry('mass-index').name, entry('mass-index').metadata.shortTitle]).toEqual(['Mass index', 'Mass index']);
    expect([entry('elder-force').name]).toEqual(["Elder's force index"]);
    expect([entry('dark-cloud-cover').name, entry('dark-cloud-cover').shortName]).toEqual(['Dark cloud cover (bearish)', 'Dark cloud cover (bear)']);
    expect(entry('all-patterns').name).toBe('All candlestick patterns');
  });

  it('has an entry for every id in the table', () => {
    for (const id of Object.keys(REFERENCE_NAMES)) expect(indicatorRegistry.some((e) => e.id === id), id).toBe(true);
  });

  it('keeps the pattern alert texts', () => {
    const c = (entry('dark-cloud-cover') as { alertConditions?: { message?: string }[] }).alertConditions;
    expect(c?.[0]?.message).toBe('New Dark Cloud Cover – Bearish pattern detected');
  });

  it('leaves community scripts alone', () => {
    for (const e of indicatorRegistry.filter((x) => x.group === 'community')) expect(REFERENCE_NAMES[e.id]).toBeUndefined();
  });
});
