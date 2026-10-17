/**
 * Style-settings declarations of the built-ins (style-outputs.ts applied by style-apply.ts): every declared output
 * exists in the entry or its result, the ids reach the result, the outputs the reference does not list are marked.
 */
import { describe, expect, it } from 'vitest';
import { indicatorRegistry, STYLE_OUTPUTS } from '../../src/index';
import type { Bar } from 'oakscriptjs';

const bars: Bar[] = [];
let p = 100;
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 1500; i++) {
  const o = p;
  p = Math.max(5, p + Math.sin(i / 7) * 2 + (rnd() - 0.5) * 3);
  bars.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * 2, low: Math.min(o, p) - rnd() * 2, close: p, volume: 1e6 + rnd() * 1e6 });
}
const entry = (id: string) => indicatorRegistry.find((e) => e.id === id)!;
const run = (id: string) => entry(id).calculate(bars, { ...entry(id).defaultInputs });

describe('style declarations', () => {
  it('every declared entry exists and its declarations name outputs of the entry', () => {
    for (const [id, decl] of Object.entries(STYLE_OUTPUTS)) {
      const e = entry(id);
      expect(e, id).toBeDefined();
      const plots = new Set(e.plotConfig.map((x) => x.id));
      const hlines = new Set((e.hlineConfig ?? []).map((x) => x.id));
      for (const h of decl.hiddenPlots ?? []) expect(plots.has(h), `${id} ${h}`).toBe(true);
      for (const h of Object.keys(decl.hlines ?? {})) expect(hlines.has(h), `${id} ${h}`).toBe(true);
      for (const f of decl.fills ?? []) {
        for (const side of [f.plot1, f.plot2]) expect(plots.has(side) || hlines.has(side), `${id} ${f.id} ${side}`).toBe(true);
      }
      const candles = new Set((e.plotCandleConfig ?? []).map((x) => x.id));
      for (const c of Object.keys(decl.candles ?? {})) expect(candles.has(c), `${id} ${c}`).toBe(true);
    }
  });

  it('plots the reference does not list are not editable', () => {
    const sma = entry('sma');
    expect(sma.plotConfig.filter((x) => x.editable !== false).map((x) => x.title)).toEqual(['MA']);
    const rsi = entry('rsi');
    expect(rsi.plotConfig.filter((x) => x.editable !== false && x.display !== 'none').map((x) => x.title)).toEqual(['RSI', 'RSI-based MA']);
  });

  it('shape outputs: the markers carry the id of their declaration', () => {
    for (const id of ['williams-fractals', 'moon-phases', 'rsi-divergence-indicator', 'up-down-volume']) {
      const ids = new Set(entry(id).shapeConfig!.map((s) => s.id));
      const markers = run(id).markers ?? [];
      expect(markers.length, id).toBeGreaterThan(0);
      for (const m of markers) expect(ids.has(m.id), `${id} ${m.id}`).toBe(true);
    }
    expect(entry('williams-fractals').shapeConfig).toEqual([
      { id: 'downFractal', kind: 'shape', title: 'Shapes', location: 'belowbar', style: 'triangledown', color: '#F44336' },
      { id: 'upFractal', kind: 'shape', title: 'Shapes', location: 'abovebar', style: 'triangleup', color: '#009688' },
    ]);
  });

  it('the up / down volume delta is a character with a palette', () => {
    const m = run('up-down-volume').markers![0];
    expect(m).toMatchObject({ char: '—', id: 'delta' });
    expect(['#4CAF50', '#F23645']).toContain(m.color);
    expect(entry('up-down-volume').shapeConfig![0].palette).toEqual(['#4CAF50', '#F23645']);
  });

  it('fills between plots get the id of their declaration; fills between hlines keep theirs', () => {
    const r = run('bb');
    expect(r.fills.map((f: { id?: string }) => f.id)).toEqual(['fill_0']);
    expect(entry('bb').fillConfig!.find((f) => f.id === 'fill_0')).toMatchObject({ title: 'Background', plot1: 'plot1', plot2: 'plot2' });
    const rsi = run('rsi');
    expect(rsi.fills.map((f: { id?: string }) => f.id)).toEqual(['fill_1', 'fill_2']);
    expect(entry('rsi').fillConfig!.map((f) => f.title)).toEqual(['RSI Background Fill', 'Overbought Gradient Fill', 'Oversold Gradient Fill']);
  });

  it('background colours carry the id of their declaration', () => {
    const doji = run('doji');
    expect(doji.bgColors.length).toBeGreaterThan(0);
    expect(doji.bgColors.every((b: { id?: string }) => b.id === 'bgcolor0')).toBe(true);
    expect(entry('doji').barColorConfig).toEqual([
      { id: 'bgcolor0', kind: 'bgcolor', title: 'Background Color', palette: [doji.bgColors[0].color] },
    ]);
    expect(entry('doji').markerDrawing).toBe('label');
    expect(entry('doji').drawingKinds).toEqual(['label']);
  });

  it('hidden hlines and hline titles', () => {
    const b = entry('bb-percent-b').hlineConfig!;
    expect(b.filter((h) => h.editable === false).map((h) => h.id)).toEqual(['hline_top', 'hline_bottom']);
  });

  it('candles: palettes of the body, wick and border', () => {
    expect(entry('volume-delta').plotCandleConfig![0]).toMatchObject({
      id: 'delta',
      title: 'Volume Delta',
      palettes: { color: ['#089981', '#F23645'], wickColor: ['#089981', '#F23645'], borderColor: ['#089981', '#F23645'] },
    });
  });
});

describe('levels and fills of the reference (#11)', () => {
  it('Relative volatility index: dashed levels 80 / 50 / 20 and the Background fill', () => {
    const e = entry('rvol');
    expect(e.hlineConfig!.map((h) => [h.price, h.title, h.linestyle])).toEqual([
      [80, 'Upper Band', 'dashed'],
      [50, 'Middle Band', 'dashed'],
      [20, 'Lower Band', 'dashed'],
    ]);
    expect(e.fillConfig!.find((f) => f.id === 'fill_band')).toMatchObject({ plot1: 'hline_upper', plot2: 'hline_lower', title: 'Background' });
  });

  it('Ulcer index: Zero level, hidden zero plot and the Plots Background fill', () => {
    const e = entry('ulcer-index');
    expect(e.hlineConfig).toEqual([{ id: 'hline_zero', price: 0, title: 'Zero', color: '#808080', linestyle: 'dashed', linewidth: 1 }]);
    expect(e.plotConfig.map((p) => [p.id, p.color, p.editable])).toEqual([['plot0', '#2962FF', undefined], ['plot1', '#2962FF', false]]);
    const r = run('ulcer-index');
    expect(r.plots.plot1.every((p: { value: number }) => p.value === 0)).toBe(true);
    expect(r.fills).toEqual([{ id: 'fill_0', plot1: 'plot0', plot2: 'plot1', options: { color: 'rgba(33,150,243,0.1)', title: 'Plots Background' } }]);
  });
});
