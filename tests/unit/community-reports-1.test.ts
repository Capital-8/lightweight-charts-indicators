/**
 * Re-ports of 4 community indicators after their originals: CCI Stochastic, CM_Gann Swing HighLow V2,
 * _CM_RSI_2_Strat_Low and _CM_RSI_2_HB_MA. Outputs (plot ids / titles, marker ids, fills, bar / background colours)
 * against the originals' declarations, the main series and the conditions re-computed here from the originals'
 * formulas on seeded random walks.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as cciStoch from '../../src/community/cci-stochastic';
import * as gann from '../../src/community/cm-gann-swing';
import * as rsiLower from '../../src/community/cm-rsi-2-lower';
import * as rsiUpper from '../../src/community/cm-rsi-2-upper';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => b - a <= EPS;

/** Seeded random walk of daily bars */
function walk(count: number, seed0: number, drift = 0): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 37) * 1.5 + drift + (rnd() - 0.5) * 4);
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume: 1e6 });
  }
  return out;
}
const bars = walk(1500, 11);
const timesOf = (flags: boolean[], list: Bar[] = bars) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const values = (pts: { value: number }[]) => pts.map((p) => p.value);

/** Plain SMA (na until `len` values, na inside the window gives na) */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}

function expectClose(actual: number[], expected: number[], digits = 8, minCompared = 1000) {
  expect(actual.length).toBe(expected.length);
  let compared = 0;
  for (let i = 0; i < expected.length; i++) {
    if (Number.isNaN(expected[i])) {
      expect(Number.isNaN(actual[i]), `bar ${i}`).toBe(true);
    } else {
      expect(actual[i], `bar ${i}`).toBeCloseTo(expected[i], digits);
      compared++;
    }
  }
  expect(compared).toBeGreaterThan(minCompared);
}

describe('cci-stochastic', () => {
  const r = cciStoch.calculate(bars) as any;

  it('outputs as the original declares them', () => {
    expect(cciStoch.metadata).toMatchObject({ title: 'CCI Stochastic', shortTitle: 'CCI_S', overlay: false });
    expect(cciStoch.plotConfig.map((p) => [p.id, p.title, p.lineWidth])).toEqual([['plot0', 'Moving Average', 3]]);
    expect(r.hlines.map((h: any) => [h.options.title, h.value])).toEqual([
      ['Upper Line', 80], ['Lower Line', 20], ['Mid Line', 50], ['Max Level', 100], ['Min Level', 0],
    ]);
    expect(cciStoch.hlineConfig.map((h) => h.title)).toEqual(['Upper Line', 'Lower Line', 'Mid Line', 'Max Level', 'Min Level']);
    // fill(maxLevelPlot, overbought) / fill(minLevelPlot, oversold)
    expect(r.fills.map((f: any) => [f.plot1, f.plot2, f.options.title])).toEqual([
      ['hline_max', 'hline_ob', 'Hlines Background'], ['hline_min', 'hline_os', 'Hlines Background'],
    ]);
    expect(cciStoch.fillConfig.map((f) => f.title)).toEqual(['Hlines Background', 'Hlines Background']);
    const all = cciStoch.calculate(bars, { showArrowsCenter: true });
    expect([...new Set(all.markers.map((m) => m.id))].sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']);
    const byId = (id: string) => all.markers.filter((m) => m.id === id);
    expect(byId('shape0').every((m) => m.shape === 'arrowUp' && m.price === 0 && m.position === 'atPriceMiddle')).toBe(true);
    expect(byId('shape1').every((m) => m.shape === 'arrowDown' && m.price === 100)).toBe(true);
    expect(byId('shape2').every((m) => m.shape === 'arrowUp' && m.price === 35)).toBe(true);
    expect(byId('shape3').every((m) => m.shape === 'arrowDown' && m.price === 65)).toBe(true);
    expect(byId('shape4').every((m) => m.shape === 'arrowUp' && m.price === 0)).toBe(true);
    expect(byId('shape5').every((m) => m.shape === 'arrowDown' && m.price === 100)).toBe(true);
    expect(cciStoch.alertConditions.map((a) => [a.id, a.title, a.message])).toEqual(
      ['Trend Enter Buy', 'Trend Enter Sell', 'Trend Center Buy', 'Trend Center Sell', 'Trend Exit Buy', 'Trend Exit Sell']
        .map((t, k) => [`alert${k}`, t, t]),
    );
    expect(cciStoch.CCIStochastic.alertConditions).toBe(cciStoch.alertConditions);
  });

  // cci(close, 28) -> stoch(cci, cci, cci, 28) -> sma 3 (K) -> sma 3 (D)
  const close = bars.map((b) => b.close);
  const mean = sma(close, 28);
  const cci = close.map((c, i) => {
    if (Number.isNaN(mean[i])) return NaN;
    let dev = 0;
    for (let k = i - 27; k <= i; k++) dev += Math.abs(close[k] - mean[i]);
    return (c - mean[i]) / (0.015 * (dev / 28));
  });
  // highest / lowest of the last 28 non-na values (all of them when fewer); a na stoch keeps the previous value
  let prevStoch = NaN;
  const stoch = cci.map((_, i) => {
    if (i < 27) return NaN;
    const seen: number[] = [];
    for (let k = i; k >= 0 && seen.length < 28; k--) if (!Number.isNaN(cci[k])) seen.push(cci[k]);
    if (!seen.length) return NaN;
    const hi = Math.max(...seen), lo = Math.min(...seen);
    const v = (100 * (cci[i] - lo)) / (hi - lo);
    if (!Number.isNaN(v)) prevStoch = v;
    return prevStoch;
  });
  const kLine = sma(stoch, 3);
  const dLine = sma(kLine, 3);

  it('the D line (default) and the K line', () => {
    expectClose(values(r.plots.plot0), dLine, 6);
    expectClose(values(cciStoch.calculate(bars, { dOrK: 'K' }).plots.plot0 as any), kLine, 6);
    // ma_color = ma > OB ? red : ma < OS ? green : gray
    r.plots.plot0.forEach((p: any, i: number) => {
      expect(p.color).toBe(gt(dLine[i], 80) ? '#FF5252' : lt(dLine[i], 20) ? '#4CAF50' : '#787B86');
    });
  });

  it('alert conditions as the original computes them (crossings run only in their branch)', () => {
    /** ta.crossover / crossunder called only on some bars: compares with the values of its previous call */
    const cross = (over: boolean) => {
      let pa = NaN, pb = NaN;
      return (a: number, b: number) => {
        const res = over ? a > b && pa <= pb : a < b && pa >= pb;
        pa = a; pb = b;
        return res;
      };
    };
    const ma = dLine;
    const eu = cross(false), eo = cross(true), xu = cross(false), xo = cross(true), cu = cross(false), co = cross(true);
    const flags: boolean[][] = [[], [], [], [], [], []];
    for (let i = 0; i < ma.length; i++) {
      const enter = eu(ma[i], 20) ? 1 : eo(ma[i], 80) ? -1 : NaN;
      const exit = xu(ma[i], 80) ? -1 : xo(ma[i], 20) ? 1 : NaN;
      const center = cu(ma[i], 50) ? -1 : co(ma[i], 50) ? 1 : NaN;
      [enter === 1, enter === -1, center === 1, center === -1, exit === 1, exit === -1].forEach((f, k) => flags[k].push(f));
    }
    const all = cciStoch.calculate(bars, { showArrowsCenter: true });
    all.alerts.forEach((a, k) => {
      expect(a.times, a.title).toEqual(timesOf(flags[k]));
      expect(a.times.length, a.title).toBeGreaterThan(0);
      expect(all.markers.filter((m) => m.id === `shape${k}`).map((m) => m.time)).toEqual(a.times);
    });
    // Center zone off by default: no center arrows / alerts
    expect(r.alerts[2].times).toEqual([]);
    expect(r.alerts[3].times).toEqual([]);
    expect(r.markers.some((m: any) => m.id === 'shape2' || m.id === 'shape3')).toBe(false);
    // Show Arrows off: no arrows, no alerts
    const off = cciStoch.calculate(bars, { showArrows: false });
    expect(off.markers).toEqual([]);
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
  });
});

describe('cm-gann-swing', () => {
  it('inputs and outputs as the original declares them', () => {
    expect(gann.metadata).toMatchObject({ title: 'CM_Gann Swing HighLow V2', shortTitle: 'CM_Gann_Swing_HL_V2', overlay: true });
    expect(gann.inputConfig.map((c) => [c.id, c.title, c.defval])).toEqual([
      ['length', 'Moving Average Period', 3],
      ['pt', 'Plot Up/Down Triangles at Top and Bottom of Candles/Bars?', false],
      ['pc', 'Plot Circles at Top and Bottom of Candles/Bars?', true],
      ['pttb', 'Plot Triangles at Top and Bottom of Screen?', true],
      ['shb', 'Show Highlight Bars on Cross Up or Cross Down?', false],
      ['sbh', 'Show Background Highlights at Cross Up or Cross Down?', true],
    ]);
    expect(gann.plotConfig.map((p) => [p.id, p.title, p.color, p.lineWidth, p.style])).toEqual([
      ['plot0', 'Gann Swing High Plots-Circles', '#FF00FF', 4, 'linebr'],
      ['plot1', 'Gann Swing Low Plots-Circles', '#00FF00', 4, 'linebr'],
    ]);
  });

  // hld = close > sma(high)[1] ? 1 : close < sma(low)[1] ? -1 : 0; hlv = valuewhen(hld != 0, hld, 1)
  const sh = sma(bars.map((b) => b.high), 3);
  const sl = sma(bars.map((b) => b.low), 3);
  const hld = bars.map((b, i) => (i > 0 && gt(b.close, sh[i - 1]) ? 1 : i > 0 && lt(b.close, sl[i - 1]) ? -1 : 0));
  const hlv = hld.map((_, i) => {
    let seen = 0;
    for (let j = i; j >= 0; j--) if (hld[j] !== 0 && seen++ === 1) return hld[j];
    return NaN;
  });
  const hi = hlv.map((v, i) => (v === -1 ? sh[i] : NaN));
  const lo = hlv.map((v, i) => (v === 1 ? sl[i] : NaN));
  const above = bars.map((b, i) => i > 0 && gt(b.close, hi[i]) && lt(bars[i - 1].close, hi[i]));
  const below = bars.map((b, i) => i > 0 && lt(b.close, lo[i]) && gt(bars[i - 1].close, lo[i]));

  it('swing high / low lines', () => {
    const r = gann.calculate(bars);
    expectClose(values(r.plots.plot0 as any), hi, 10, 400);
    expectClose(values(r.plots.plot1 as any), lo, 10, 400);
    expect(gann.calculate(bars, { pc: false }).plots.plot0.every((p: any) => Number.isNaN(p.value))).toBe(true);
  });

  it('markers, background and bar colours', () => {
    const r = gann.calculate(bars, { pt: true, shb: true });
    const at = (id: string) => r.markers.filter((m) => m.id === id);
    expect(at('shape0').map((m) => m.time)).toEqual(timesOf(hi.map((v) => !Number.isNaN(v))));
    expect(at('shape1').map((m) => m.time)).toEqual(timesOf(lo.map((v) => !Number.isNaN(v))));
    expect(at('shape2').map((m) => m.time)).toEqual(at('shape0').map((m) => m.time));
    expect(at('shape3').map((m) => m.time)).toEqual(at('shape1').map((m) => m.time));
    expect(at('shape0').every((m) => m.position === 'aboveBar' && m.shape === 'triangleDown' && m.color === '#FF00FF')).toBe(true);
    expect(at('shape1').every((m) => m.position === 'belowBar' && m.shape === 'triangleUp' && m.color === '#00FF00')).toBe(true);
    expect(at('shape2').every((m) => m.position === 'top' && m.shape === 'triangleDown' && m.color === '#FF0000')).toBe(true);
    expect(at('shape3').every((m) => m.position === 'bottom' && m.shape === 'triangleUp' && m.color === '#00FF00')).toBe(true);
    const bg = (id: string) => r.bgColors.filter((c) => c.id === id).map((c) => c.time);
    const bc = (id: string) => r.barColors.filter((c) => c.id === id).map((c) => c.time);
    expect(bg('bgcolor0')).toEqual(timesOf(above));
    expect(bg('bgcolor1')).toEqual(timesOf(below));
    expect(bc('barcolor0')).toEqual(timesOf(above));
    expect(bc('barcolor1')).toEqual(timesOf(below));
    expect(bg('bgcolor0').length).toBeGreaterThan(0);
    expect(bg('bgcolor1').length).toBeGreaterThan(0);
    expect(r.barColors.every((c) => c.color === '#FFFF00')).toBe(true);
    // defaults: no triangles on the bars, no bar colours
    const d = gann.calculate(bars);
    expect(d.markers.some((m) => m.id === 'shape0' || m.id === 'shape1')).toBe(false);
    expect(d.barColors).toEqual([]);
    expect(d.bgColors.length).toBe(r.bgColors.length);
  });
});

/** RSI-2 of the originals: rma (seeded by the SMA of the first 2 values) of the gains and the losses */
function rsi2(list: Bar[]): number[] {
  const ch = list.map((b, i) => (i > 0 ? b.close - list[i - 1].close : NaN));
  const rma = (src: number[]) => {
    const out: number[] = [];
    let prev = NaN;
    for (let i = 0; i < src.length; i++) {
      if (i < 2) out.push(NaN);
      else if (i === 2) out.push((prev = (src[1] + src[2]) / 2));
      else out.push((prev = (src[i] + prev) / 2));
    }
    return out;
  };
  const up = rma(ch.map((c) => Math.max(c, 0)));
  const down = rma(ch.map((c) => -Math.min(c, 0)));
  return up.map((u, i) => {
    const d = down[i];
    if (Number.isNaN(u) || Number.isNaN(d)) return NaN;
    return Math.abs(d) <= EPS ? 100 : Math.abs(u) <= EPS ? 0 : 100 - 100 / (1 + u / d);
  });
}

describe('cm-rsi-2-lower', () => {
  const r = rsiLower.calculate(bars) as any;
  it('outputs as the original declares them (no inputs)', () => {
    expect(rsiLower.metadata).toMatchObject({ title: '_CM_RSI_2_Strat_Low', shortTitle: '_CM_RSI_2_Strategy_Lower', overlay: false });
    expect(rsiLower.inputConfig).toEqual([]);
    expect(rsiLower.plotConfig.map((p) => [p.id, p.title, p.color, p.lineWidth])).toEqual([
      ['plot0', 'RSI', '#C0C0C0', 4],
      ['plot1', 'Upper Line 100', '#00FFFF', 3],
      ['plot2', 'Lower Line 0', '#00FFFF', 3],
      ['plot3', 'Upper Line 90', '#00FFFF', 3],
      ['plot4', 'Lower Line 10', '#00FFFF', 3],
    ]);
    expect(Object.keys(r.plots)).toEqual(['plot0', 'plot1', 'plot2', 'plot3', 'plot4']);
    expect(values(r.plots.plot3).every((v) => v === 90)).toBe(true);
    expect(r.fills.map((f: any) => [f.plot1, f.plot2, f.options.title])).toEqual([['plot3', 'plot4', 'Plots Background']]);
    expect(r.hlines ?? []).toEqual([]);
  });

  it('RSI-2 and its colours', () => {
    const rsi = rsi2(bars);
    expectClose(values(r.plots.plot0), rsi, 8);
    const close = bars.map((b) => b.close);
    const m5 = sma(close, 5), m200 = sma(close, 200);
    const cols = close.map((c, i) => (gt(c, m200[i]) && lt(c, m5[i]) && lt(rsi[i], 10) ? '#00FF00'
      : lt(c, m200[i]) && gt(c, m5[i]) && gt(rsi[i], 90) ? '#FF0000' : '#C0C0C0'));
    expect(r.plots.plot0.map((p: any) => p.color)).toEqual(cols);
    expect(cols.filter((c) => c === '#00FF00').length).toBeGreaterThan(0);
    expect(cols.filter((c) => c === '#FF0000').length).toBeGreaterThan(0);
  });
});

describe('cm-rsi-2-upper', () => {
  const r = rsiUpper.calculate(bars);
  it('outputs as the original declares them (no inputs)', () => {
    expect(rsiUpper.metadata).toMatchObject({ title: '_CM_RSI_2_HB_MA', shortTitle: '_CM_RSI_2_HB_MA', overlay: true });
    expect(rsiUpper.inputConfig).toEqual([]);
    expect(rsiUpper.plotConfig.map((p) => [p.id, p.title, p.lineWidth, p.style ?? 'line'])).toEqual([
      ['plot0', '5 SMA', 3, 'line'],
      ['plot1', '200 SMA', 3, 'circles'],
    ]);
    expect([...new Set(r.barColors.map((c) => c.id))].sort()).toEqual(['barcolor0', 'barcolor1', 'barcolor2', 'barcolor3']);
  });

  const close = bars.map((b) => b.close);
  const m5 = sma(close, 5), m200 = sma(close, 200);
  const rsi = rsi2(bars);

  it('5 / 200 SMAs and their colour', () => {
    expectClose(values(r.plots.plot0), m5, 10);
    expectClose(values(r.plots.plot1), m200, 10);
    const col = m5.map((v, i) => (ge(v, m200[i]) ? '#00FF00' : lt(v, m200[i]) ? '#FF0000' : 'transparent'));
    expect(r.plots.plot0.map((p: any) => p.color)).toEqual(col);
    expect(r.plots.plot1.map((p: any) => p.color)).toEqual(col);
  });

  it('bar colours of the entries and exits', () => {
    const v = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
    const longSetup = (i: number) => gt(v(close, i), v(m200, i)) && lt(v(close, i), v(m5, i)) && lt(v(rsi, i), 10);
    const shortSetup = (i: number) => lt(v(close, i), v(m200, i)) && gt(v(close, i), v(m5, i)) && gt(v(rsi, i), 90);
    const longExit = bars.map((b, i) => gt(close[i], m200[i]) && lt(v(close, i - 1), v(m5, i - 1)) && gt(b.high, m5[i])
      && [1, 2, 3, 4].some((k) => longSetup(i - k)));
    const shortExit = bars.map((b, i) => lt(close[i], m200[i]) && gt(v(close, i - 1), v(m5, i - 1)) && lt(b.low, m5[i])
      && [1, 2, 3, 4].some((k) => shortSetup(i - k)));
    const of = (id: string) => r.barColors.filter((c) => c.id === id);
    expect(of('barcolor0').map((c) => c.time)).toEqual(timesOf(bars.map((_, i) => longSetup(i))));
    expect(of('barcolor1').map((c) => c.time)).toEqual(timesOf(longExit));
    expect(of('barcolor2').map((c) => c.time)).toEqual(timesOf(bars.map((_, i) => shortSetup(i))));
    expect(of('barcolor3').map((c) => c.time)).toEqual(timesOf(shortExit));
    for (const id of ['barcolor0', 'barcolor1', 'barcolor2', 'barcolor3']) expect(of(id).length, id).toBeGreaterThan(0);
    expect(of('barcolor0').every((c) => c.color === '#00FF00')).toBe(true);
    expect(of('barcolor2').every((c) => c.color === '#FF0000')).toBe(true);
    expect([...of('barcolor1'), ...of('barcolor3')].every((c) => c.color === '#FFFF00')).toBe(true);
  });
});
