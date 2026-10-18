/**
 * Re-ported community indicators (reports batch 2): outputs as their originals declare them, main series recomputed
 * independently from the originals' formulas on a seeded random walk.
 */

import { describe, it, expect } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as toolkit from '../../src/community/comprehensive-trading-toolkit';
import * as drsiMod from '../../src/community/delta-rsi-oscillator';
import * as donchian from '../../src/community/donchian-custom';
import * as evwmaMod from '../../src/community/evwma-envelope';

function walk(count: number, seed0 = 12345): Bar[] {
  let seed = seed0;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let price = 100;
  const start = 1600000000;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = Math.max(1, open + Math.sin(i / 90) * 0.3 + (rand() - 0.5) * 3);
    const high = Math.max(open, close) + rand() * 1.5;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 1.5);
    const volume = 1000 + Math.floor(rand() * 5000) + (i % 37 === 0 ? 40000 : 0);
    bars.push({ time: start + i * 86400, open, high, low, close, volume });
    price = close;
  }
  return bars;
}

const bars = walk(1500);
const vals = (r: any, id: string): number[] => r.plots[id].map((p: { value: number }) => p.value);

function expectClose(actual: number[], expected: number[], tol: number) {
  expect(actual.length).toBe(expected.length);
  let compared = 0;
  for (let i = 0; i < expected.length; i++) {
    if (isNaN(expected[i])) {
      expect(isNaN(actual[i]), `bar ${i}: ${actual[i]} should be na`).toBe(true);
    } else {
      expect(Math.abs(actual[i] - expected[i]), `bar ${i}: ${actual[i]} vs ${expected[i]}`).toBeLessThanOrEqual(
        tol * Math.max(1, Math.abs(expected[i])));
      compared++;
    }
  }
  expect(compared).toBeGreaterThan(expected.length / 2);
}

/** Wilder RSI: na on the first `len` bars */
function rsiRef(src: number[], len: number): number[] {
  const out = new Array(src.length).fill(NaN);
  let up = 0;
  let dn = 0;
  for (let i = 1; i < src.length; i++) {
    const ch = src[i] - src[i - 1];
    const u = Math.max(ch, 0);
    const d = Math.max(-ch, 0);
    if (i < len) { up += u; dn += d; continue; }
    if (i === len) { up = (up + u) / len; dn = (dn + d) / len; } else {
      up = (up * (len - 1) + u) / len;
      dn = (dn * (len - 1) + d) / len;
    }
    out[i] = dn === 0 ? 100 : up === 0 ? 0 : 100 - 100 / (1 + up / dn);
  }
  return out;
}

/** EMA seeded with the SMA of the first `len` values that are not na */
function emaRef(src: number[], len: number): number[] {
  const out = new Array(src.length).fill(NaN);
  const alpha = 2 / (len + 1);
  let count = 0;
  let sum = 0;
  let ema = NaN;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (isNaN(ema)) {
      if (isNaN(v)) continue;
      sum += v;
      if (++count === len) { ema = sum / len; out[i] = ema; }
      continue;
    }
    if (!isNaN(v)) ema = alpha * v + (1 - alpha) * ema;
    out[i] = ema;
  }
  return out;
}

/** Least-squares polynomial fit by the normal equations (Gaussian elimination), derivative at z = window - 1 */
function polyDerivRef(src: number[], window: number, degree: number): number[] {
  const m = degree + 1;
  return src.map((_v, bar) => {
    if (bar < window - 1) return NaN;
    const y: number[] = [];
    for (let z = 0; z < window; z++) y.push(src[bar - (window - 1) + z]);
    if (y.some((v) => isNaN(v))) return NaN;
    const A = Array.from({ length: m }, (_r, r) => Array.from({ length: m + 1 }, (_c, c) => {
      let s = 0;
      for (let z = 0; z < window; z++) s += c < m ? z ** (r + c) : z ** r * y[z];
      return s;
    }));
    for (let p = 0; p < m; p++) {
      let best = p;
      for (let r = p + 1; r < m; r++) if (Math.abs(A[r][p]) > Math.abs(A[best][p])) best = r;
      [A[p], A[best]] = [A[best], A[p]];
      for (let r = 0; r < m; r++) {
        if (r === p) continue;
        const f = A[r][p] / A[p][p];
        for (let c = p; c <= m; c++) A[r][c] -= f * A[p][c];
      }
    }
    const a = A.map((row, r) => row[m] / row[r]);
    let d = 0;
    for (let k = 1; k <= degree; k++) d += k * a[k] * (window - 1) ** (k - 1);
    return d;
  });
}

describe('comprehensive-trading-toolkit', () => {
  const r: any = toolkit.calculate(bars);

  it('declares the outputs of the original', () => {
    expect(toolkit.plotConfig.map((p) => [p.id, p.title, p.lineWidth])).toEqual([
      ['plot0', 'Plot', 1], ['plot1', 'Plot', 1], ['plot2', 'Plot', 1],
      ['plot3', 'Regular Bullish', 2], ['plot4', 'Regular Bearish', 2],
      ['plot5', 'Regular Bullish', 1], ['plot6', 'Regular Bearish', 1],
    ]);
    // p7 / p3: display none, editable false
    for (const id of ['plot1', 'plot2']) {
      const p = toolkit.plotConfig.find((c) => c.id === id)!;
      expect(p.display).toBe('none');
      expect(p.editable).toBe(false);
    }
    // the divergence plots follow show_div (off by default)
    for (const id of ['plot3', 'plot4', 'plot5', 'plot6']) {
      expect(toolkit.plotConfig.find((c) => c.id === id)!.visible).toBe('showDiv');
    }
    expect(toolkit.defaultInputs.showDiv).toBe(false);
    expect(Object.keys(r.plots)).toEqual(['plot0', 'plot1', 'plot2', 'plot3', 'plot4', 'plot5', 'plot6']);
    expect(r.hlines.map((h: any) => [h.value, h.options.title])).toEqual([[30, 'Oversold'], [70, 'OverBought'], [50, 'Level']]);
    expect(r.fills.map((f: any) => [f.plot1, f.plot2, f.options.title])).toEqual([
      ['hline_ob', 'hline_os', 'Hlines Background'],
      ['plot2', 'plot0', 'Plots Background'],
      ['plot1', 'plot0', 'Plots Background'],
    ]);
    expect(toolkit.fillConfig[0].title).toBe('Hlines Background');
    expect(toolkit.metadata).toEqual({
      title: 'Trading Toolkit (Michaël van de Poppe) [BigBeluga]',
      shortTitle: 'Trading Toolkit (Michaël van de Poppe) [BigBeluga]',
      overlay: false,
    });
  });

  it('plots the RSI of the close (length 24) and the level anchors', () => {
    expectClose(vals(r, 'plot0'), rsiRef(bars.map((b) => b.close), 24), 1e-9);
    expect(vals(r, 'plot1').every((v) => v === 70)).toBe(true);
    expect(vals(r, 'plot2').every((v) => v === 30)).toBe(true);
  });

  it('draws support / resistance levels and zones on the price pane', () => {
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.lines.length).toBeLessThanOrEqual(6);
    expect(r.boxes.length).toBe(r.lines.length);
  });
});

describe('delta-rsi-oscillator', () => {
  const r: any = drsiMod.calculate(bars);
  const rsi = rsiRef(bars.map((b) => b.close), 14);
  const drsi = polyDerivRef(rsi, 18, 2);

  it('declares the outputs and inputs of the original', () => {
    expect(drsiMod.plotConfig.map((p) => [p.id, p.title, p.lineWidth, p.style ?? 'line'])).toEqual([
      ['plot0', 'D-RSI', 2, 'columns'], ['plot1', 'Signal Line', 2, 'line'], ['plot2', 'Zero Line', 1, 'line'],
    ]);
    expect(drsiMod.plotConfig[1].color).toBe('#B2B5BE');
    expect(drsiMod.plotConfig[2].color).toBe('#B2B5BE');
    expect(drsiMod.inputConfig.map((c) => [c.id, c.title, c.defval])).toEqual([
      ['src', 'RSI Source', 'close'], ['rsiLength', 'RSI Length', 14], ['degree', 'Polynomial Order', 2],
      ['window', 'Frame Length (must be greater than Order)', 18], ['showSignal', 'Show D-RSI Signal Line', true],
      ['signalLength', 'D-RSI Signal Length', 9],
    ]);
    expect(drsiMod.metadata).toEqual({ title: 'Delta-RSI Oscillator', shortTitle: 'D-RSI', overlay: false });
    expect(Object.keys(r.plots)).toEqual(['plot0', 'plot1', 'plot2']);
    expect(r.markers ?? []).toEqual([]);
    expect(r.fills ?? []).toEqual([]);
  });

  it('D-RSI = derivative of the least-squares polynomial of the RSI frame', () => {
    expectClose(vals(r, 'plot0'), drsi, 1e-7);
    // first value: bar rsiLength + window - 1
    const first = vals(r, 'plot0').findIndex((v) => !isNaN(v));
    expect(first).toBe(14 + 18 - 1);
  });

  it('order 1 gives the linear regression slope', () => {
    const r1: any = drsiMod.calculate(bars, { degree: 1, window: 10 });
    const slope = rsi.map((_v, i) => {
      if (i < 9 || rsi.slice(i - 9, i + 1).some(isNaN)) return NaN;
      const y = rsi.slice(i - 9, i + 1);
      const mx = 4.5;
      const my = y.reduce((a, b) => a + b, 0) / 10;
      let num = 0;
      let den = 0;
      y.forEach((v, z) => { num += (z - mx) * (v - my); den += (z - mx) ** 2; });
      return num / den;
    });
    expectClose(vals(r1, 'plot0'), slope, 1e-7);
  });

  it('signal line = EMA 9 of D-RSI, hidden with the input off; zero line', () => {
    expectClose(vals(r, 'plot1'), emaRef(drsi, 9), 1e-7);
    const off: any = drsiMod.calculate(bars, { showSignal: false });
    expect(vals(off, 'plot1').every((v) => isNaN(v))).toBe(true);
    expect(vals(r, 'plot2').every((v) => v === 0)).toBe(true);
  });

  it('colours the columns by sign and direction', () => {
    const d = vals(r, 'plot0');
    for (let i = 40; i < d.length; i++) {
      const want = d[i] >= 0 ? (d[i - 1] < d[i] ? '#26A748' : '#C1E5CB') : (d[i - 1] < d[i] ? '#FBBEC2' : '#BA3840');
      expect(r.plots.plot0[i].color).toBe(want);
    }
  });
});

describe('donchian-custom', () => {
  const r: any = donchian.calculate(bars);

  it('declares the outputs of the original', () => {
    expect(donchian.plotConfig.map((p) => [p.id, p.title, p.color, p.lineWidth])).toEqual([
      ['plot0', 'Plot', '#FF0000', 4], ['plot1', 'Plot', '#00FF00', 4], ['plot2', 'Mid-Line Average', '#FFFF00', 1],
    ]);
    expect(donchian.inputConfig.map((c) => [c.id, c.title, c.defval])).toEqual([
      ['upperLen', 'Upper Channel', 4], ['lowerLen', 'Lower Channel', 60],
    ]);
    expect(r.fills.map((f: any) => [f.plot1, f.plot2, f.options.title])).toEqual([['plot1', 'plot0', 'Fill']]);
    expect(donchian.metadata).toEqual({ title: 'CM_Donchian Channels Modified', shortTitle: 'CM_DC Modified', overlay: true });
  });

  it('lower = lowest low (60), upper = highest high (4), mid = their average', () => {
    const hh = bars.map((_b, i) => (i < 3 ? NaN : Math.max(...bars.slice(i - 3, i + 1).map((b) => b.high))));
    const ll = bars.map((_b, i) => (i < 59 ? NaN : Math.min(...bars.slice(i - 59, i + 1).map((b) => b.low))));
    expectClose(vals(r, 'plot0'), ll, 1e-12);
    expectClose(vals(r, 'plot1'), hh, 1e-12);
    expectClose(vals(r, 'plot2'), hh.map((h, i) => (h + ll[i]) / 2), 1e-12);
  });
});

describe('evwma-envelope', () => {
  const r: any = evwmaMod.calculate(bars);

  function ref(price: (b: Bar) => number, length: number, useCV: boolean): number[] {
    let cum = 0;
    let prev = NaN;
    return bars.map((b, i) => {
      cum += b.volume!;
      let shares = NaN;
      if (useCV) shares = cum;
      else if (i >= length - 1) shares = bars.slice(i - length + 1, i + 1).reduce((a, x) => a + x.volume!, 0);
      const v = b.volume!;
      const data = ((isNaN(prev) ? 0 : prev) * (shares - v)) / shares + (v * price(b)) / shares;
      prev = data;
      return data;
    });
  }

  it('declares the outputs and inputs of the original', () => {
    expect(evwmaMod.plotConfig.map((p) => [p.id, p.title, p.color, p.lineWidth])).toEqual([
      ['plot0', 'evwma', '#800000', 2], ['plot1', 'evwma+', '#FF0000', 2], ['plot2', 'evwma-', '#008000', 2],
    ]);
    expect(evwmaMod.inputConfig.map((c) => [c.id, c.title, c.defval])).toEqual([
      ['length', 'length', 20], ['useCV', 'Use Cumulative Volume', false], ['renderBands', 'Draw Envelope', false],
    ]);
    expect(evwmaMod.metadata).toEqual({
      title: 'Elastic Volume Weighted Moving Average [LazyBear]', shortTitle: 'EVWMA_LB', overlay: true,
    });
    expect(r.fills ?? []).toEqual([]);
  });

  it('evwma of the close over the 20-bar volume; no envelope by default', () => {
    expectClose(vals(r, 'plot0'), ref((b) => b.close, 20, false), 1e-9);
    expect(vals(r, 'plot1').every((v) => isNaN(v))).toBe(true);
    expect(vals(r, 'plot2').every((v) => isNaN(v))).toBe(true);
  });

  it('envelope of the high / low and the cumulative volume option', () => {
    const e: any = evwmaMod.calculate(bars, { renderBands: true, length: 14 });
    expectClose(vals(e, 'plot0'), ref((b) => b.close, 14, false), 1e-9);
    expectClose(vals(e, 'plot1'), ref((b) => b.high, 14, false), 1e-9);
    expectClose(vals(e, 'plot2'), ref((b) => b.low, 14, false), 1e-9);
    const c: any = evwmaMod.calculate(bars, { useCV: true });
    expectClose(vals(c, 'plot0'), ref((b) => b.close, 20, true), 1e-9);
  });
});
