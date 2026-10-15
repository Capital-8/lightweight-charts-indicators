/**
 * The outputs of the built-ins with shapes / characters in the order alert messages number them, and their values.
 */
import { describe, it, expect } from 'vitest';
import type { Bar } from 'oakscriptjs';
import { indicatorRegistry } from '../../src/index';
import { WilliamsFractals } from '../../src/standard/williams-fractals';
import { MoonPhases } from '../../src/standard/moon-phases';
import { UpDownVolume } from '../../src/standard/up-down-volume';
import { RsiDivergenceIndicator } from '../../src/standard/rsi-divergence-indicator';
import { RSI } from '../../src/standard/rsi';

function generateBars(count: number): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    price = Math.max(10, price + (Math.sin(i * 0.1) + Math.cos(i * 0.07)) * 2 + Math.sin(i * 1.7) * 3);
    const high = price + Math.abs(Math.sin(i * 0.3)) * 3 + 0.5;
    const low = price - Math.abs(Math.cos(i * 0.3)) * 3 - 0.5;
    bars.push({ time: 1700000000 + i * 86400, open: price + (Math.sin(i * 0.5) > 0 ? 1 : -1), high, low, close: price, volume: 1000 + i });
  }
  return bars;
}

const bars = generateBars(400);
const titles = (id: string) => {
  const e = indicatorRegistry.find((x) => x.id === id)!;
  return e.outputs!.map((o) => (o.kind === 'plot' ? e.plotConfig.find((p) => p.id === o.id)!.title : o.title));
};

describe('alert outputs of the built-ins', () => {
  it('RSI numbers its outputs as the reference', () => {
    expect(titles('rsi')).toEqual([
      'RSI', 'Plot', 'RSI-based MA', 'Upper Bollinger Band', 'Lower Bollinger Band',
      'Regular Bullish', 'Regular Bullish Label', 'Regular Bearish', 'Regular Bearish Label',
    ]);
  });

  it('Williams Fractals: the down shape then the up shape, 1 on the bar a fractal is found', () => {
    expect(WilliamsFractals.outputs.map((o) => o.id)).toEqual(['downFractal', 'upFractal']);
    const r = WilliamsFractals.calculate(bars);
    const ups = r.outputValues.upFractal;
    expect(ups).toHaveLength(bars.length);
    const found = ups.filter((p) => p.value === 1).map((p) => p.time);
    expect(found.length).toBeGreaterThan(0);
    // each found bar is n (2) bars after a marker
    const markerTimes = new Set(r.markers.filter((m) => m.position === 'aboveBar').map((m) => m.time as number));
    for (const t of found) expect(markerTimes.has(t - 2 * 86400)).toBe(true);
  });

  it('Moon Phases: New Moon then Full Moon, 1 or 0 on each bar', () => {
    expect(MoonPhases.outputs.map((o) => o.title)).toEqual(['New Moon', 'Full Moon']);
    const r = MoonPhases.calculate(bars);
    expect(r.outputValues.newMoon).toHaveLength(bars.length);
    expect(r.outputValues.newMoon.some((p) => p.value === 1)).toBe(true);
    expect(r.outputValues.fullMoon.some((p) => p.value === 1)).toBe(true);
  });

  it('Up/Down Volume: the delta character after the two plots', () => {
    expect(UpDownVolume.outputs.map((o) => o.kind)).toEqual(['plot', 'plot', 'char']);
    const r = UpDownVolume.calculate(bars);
    expect(r.outputValues.delta.length).toBeGreaterThan(0);
  });

  it('RSI Divergence Indicator: each line followed by its label', () => {
    expect(titles('rsi-divergence-indicator')).toEqual([
      'RSI', 'Regular Bullish', 'Regular Bullish Label', 'Hidden Bullish', 'Hidden Bullish Label',
      'Regular Bearish', 'Regular Bearish Label', 'Hidden Bearish', 'Hidden Bearish Label',
    ]);
    const r = RsiDivergenceIndicator.calculate(bars);
    const labels = Object.values(r.outputValues).reduce((n, v) => n + v.length, 0);
    expect(labels).toBeGreaterThan(0);
    expect(labels).toBe(r.markers.length);
  });

  it('RSI with divergences draws the two lines and gives the labels', () => {
    const r = RSI.calculate(bars, { calculateDivergence: true } as never);
    const line = r.plots.plot4.filter((p) => Number.isFinite(p.value));
    expect(line.length).toBeGreaterThan(0);
    expect(r.outputValues.bullLabel.length + r.outputValues.bearLabel.length).toBe((r.markers ?? []).length);
  });
});
