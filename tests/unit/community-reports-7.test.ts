/**
 * Re-ported community indicators (batch 7): the outputs match the originals' declarations, and the main series and
 * the alert conditions are recomputed here from the originals' formulas (plain Pine semantics, own averages) on
 * seeded random-walk bars.
 */

import { describe, it, expect } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as vst from '../../src/community/volume-supertrend-ai';
import * as dmi from '../../src/community/dmi-adx-levels';

const DAY = 86400;
const T0 = 1262304000;

/** Seeded random walk of daily bars with a slow sine drift (times in seconds) */
function walk(count: number, seed = 7, vol = 3): Bar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = Math.max(1, open + Math.sin(i / 60) * 1.2 + (rand() - 0.5) * vol);
    const high = Math.max(open, close) + rand() * 1.5;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 1.5);
    bars.push({ time: T0 + i * DAY, open, high, low, close, volume: 1000 + Math.floor(rand() * 9000) });
    price = close;
  }
  return bars;
}

// Pine averages, written again (na in the window -> na; ema / rma seeded with the SMA of the first full window)
const sma = (x: number[], len: number) => x.map((_v, i) => {
  if (i < len - 1) return NaN;
  let s = 0;
  for (let k = 0; k < len; k++) s += x[i - k];
  return s / len;
});
// Pine ta.wma: na on an na bar and until len values were received; an na inside the window takes the previous value
const wma = (x: number[], len: number) => {
  const filled: number[] = [];
  let last = NaN, count = 0;
  return x.map((v, i) => {
    if (!isNaN(v)) { last = v; count++; }
    filled.push(last);
    if (isNaN(v) || count < len) return NaN;
    let s = 0, w = 0;
    for (let k = 0; k < len; k++) { s += filled[i - k] * (len - k); w += len - k; }
    return s / w;
  });
};
function recursive(x: number[], len: number, alpha: number): number[] {
  const out: number[] = [];
  const seed = sma(x, len);
  let prev = NaN;
  for (let i = 0; i < x.length; i++) {
    prev = isNaN(prev) ? seed[i] : alpha * x[i] + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}
const rma = (x: number[], len: number) => recursive(x, len, 1 / len);
const ema = (x: number[], len: number) => recursive(x, len, 2 / (len + 1));
const trueRange = (bars: Bar[], handleNa: boolean) => bars.map((b, i) => (i === 0
  ? (handleNa ? b.high - b.low : NaN)
  : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));

const near = (a: number, b: number) => (isNaN(a) && isNaN(b)) || Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(b));
const values = (pts: { value: number }[]) => pts.map((p) => p.value);

/** The original's calculation, line by line */
function refVst(bars: Bar[], p: vst.VolumeSuperTrendAiInputs) {
  const nb = bars.length;
  const close = bars.map((b) => b.close);
  const v = bars.map((b) => b.volume as number);
  const cv = close.map((c, i) => c * v[i]);
  const len = p.atrLen;
  let num: number[], den: number[];
  if (p.maSrc === 'SMA') { num = sma(cv, len); den = sma(v, len); }
  else if (p.maSrc === 'EMA') { num = ema(cv, len); den = ema(v, len); }
  else if (p.maSrc === 'RMA') { num = rma(cv, len); den = rma(v, len); }
  else if (p.maSrc === 'VWMA') {
    const vw = (x: number[]) => { const a = sma(x.map((y, i) => y * v[i]), len); const b = sma(v, len); return a.map((y, i) => y / b[i]); };
    num = vw(cv); den = vw(v);
  } else { num = wma(cv, len); den = wma(v, len); }
  const vwma = num.map((x, i) => x / den[i]);
  const atr = rma(trueRange(bars, true), len);
  const lower: number[] = [], upper: number[] = [], dir: number[] = [], st: number[] = [];
  for (let i = 0; i < nb; i++) {
    let lb = vwma[i] - p.factor * atr[i];
    let ub = vwma[i] + p.factor * atr[i];
    const pl = i > 0 && !isNaN(lower[i - 1]) ? lower[i - 1] : 0;
    const pu = i > 0 && !isNaN(upper[i - 1]) ? upper[i - 1] : 0;
    const c1 = i > 0 ? close[i - 1] : NaN;
    lb = lb > pl || c1 < pl ? lb : pl;
    ub = ub < pu || c1 > pu ? ub : pu;
    lower.push(lb); upper.push(ub);
    const pst = i > 0 ? st[i - 1] : NaN;
    let d: number;
    if (i === 0 || isNaN(atr[i - 1])) d = 1;
    else if (pst === pu) d = close[i] > ub ? -1 : 1;
    else d = close[i] < lb ? 1 : -1;
    dir.push(d);
    st.push(d === -1 ? lb : ub);
  }
  const price = wma(close, p.knnPriceLen);
  const sT = wma(st, p.knnSTLen);
  const n = Math.max(p.k, p.n);
  const label: number[] = [];
  for (let b = 0; b < nb; b++) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = b - i >= 0 ? st[b - i] : NaN;
      const lbl = b - i >= 0 && price[b - i] > sT[b - i] ? 1 : 0;
      pts.push({ d: Math.abs(st[b] - x), lbl });
    }
    // bubble sort
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - i - 1; j++) {
      if (pts[j].d > pts[j + 1].d) { const t = pts[j]; pts[j] = pts[j + 1]; pts[j + 1] = t; }
    }
    let ws = 0, tw = 0;
    for (let i = 0; i < p.k; i++) { const w = 1 / (pts[i].d + 1e-6); ws += w * pts[i].lbl; tw += w; }
    label.push(ws / tw);
  }
  const col = label.map((l) => (l === 1 ? p.upCol : l === 0 ? p.dnCol : p.neCol));
  const startUp = col.map((c, i) => c === p.upCol && (i === 0 || col[i - 1] !== p.upCol || col[i - 1] === p.neCol) && p.aiSignals);
  const startDn = col.map((c, i) => c === p.dnCol && (i === 0 || col[i - 1] !== p.dnCol || col[i - 1] === p.neCol) && p.aiSignals);
  const trendUp = dir.map((d, i) => d === -1 && i > 0 && dir[i - 1] === 1 && label[i] === 1 && p.aiSignals);
  const trendDn = dir.map((d, i) => d === 1 && i > 0 && dir[i - 1] === -1 && label[i] === 0 && p.aiSignals);
  return { st, lower, upper, dir, label, col, startUp, startDn, trendUp, trendDn };
}

describe('volume-supertrend-ai (Volume SuperTrend AI (Expo))', () => {
  const bars = walk(1500);
  const res = vst.calculate(bars);
  const ref = refVst(bars, vst.defaultInputs);

  it('declares the original outputs', () => {
    expect(vst.metadata.title).toBe('Volume SuperTrend AI (Expo)');
    expect(vst.metadata.shortTitle).toBe('Volume SuperTrend AI (Expo)');
    expect(vst.metadata.overlay).toBe(true);
    expect(vst.plotConfig.map((p) => p.id)).toEqual(['plot0', 'plot1', 'plot2', 'plot3']);
    expect(vst.plotConfig.map((p) => p.title)).toEqual(['Volume Super Trend AI', 'Up Volume Super Trend AI', 'Plot', 'Down Volume Super Trend AI']);
    expect(vst.plotConfig.map((p) => p.style ?? 'line')).toEqual(['line', 'linebr', 'line', 'linebr']);
    expect(vst.plotConfig.map((p) => p.lineWidth)).toEqual([1, 1, 1, 1]);
    expect(vst.plotConfig[2]).toMatchObject({ editable: false, display: 'none' });
    expect(Object.keys(res.plots)).toEqual(['plot0', 'plot1', 'plot2', 'plot3']);
    expect(res.fills!.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([
      ['plot2', 'plot1', 'Up Volume Super Trend AI'],
      ['plot2', 'plot3', 'Down Volume Super Trend AI'],
    ]);
    const ids = new Set(res.markers.map((m) => m.id));
    for (const id of ids) expect(['shape0', 'shape1', 'shape2', 'shape3']).toContain(id);
    expect(vst.alertConditions).toEqual([
      { id: 'alert0', title: '1 Bullish Trend Start', message: 'AI Bullish Trend Start' },
      { id: 'alert1', title: '2 Bearish Trend Start', message: 'AI Bearish Trend Start' },
      { id: 'alert2', title: '3 Any Trend Start', message: 'Any AI Trend Start' },
      { id: 'alert3', title: '4 Bullish Trend Signal', message: 'AI Bullish Trend Signal' },
      { id: 'alert4', title: '5 Bearish Trend Signal', message: 'AI Bearish Trend Signal' },
      { id: 'alert5', title: '6 Any Trend Signal', message: 'Any AI Trend Signal' },
    ]);
    expect(vst.VolumeSuperTrendAi.alertConditions).toBe(vst.alertConditions);
  });

  it('declares the original inputs', () => {
    expect(vst.inputConfig.map((c) => [c.id, c.title, c.defval])).toEqual([
      ['k', 'Neighbors', 3], ['n', 'Data', 10], ['knnPriceLen', 'Price Trend', 20], ['knnSTLen', 'Prediction Trend', 100],
      ['aiSignals', 'AI Trend Signals', true], ['bullishCol', '', vst.defaultInputs.bullishCol], ['bearishCol', '', vst.defaultInputs.bearishCol],
      ['atrLen', 'Length', 10], ['factor', '', 3.0], ['maSrc', 'Moving Average Source', 'WMA'],
      ['upCol', 'Bullish Color', vst.defaultInputs.upCol], ['dnCol', 'Bearish Color', vst.defaultInputs.dnCol], ['neCol', 'Neutral Color', vst.defaultInputs.neCol],
    ]);
  });

  it('SuperTrend, up / down halves, middle and colours match the original formulas', () => {
    const p0 = values(res.plots.plot0);
    const p1 = values(res.plots.plot1);
    const p2 = values(res.plots.plot2);
    const p3 = values(res.plots.plot3);
    let valid = 0;
    for (let i = 0; i < bars.length; i++) {
      expect(near(p0[i], ref.st[i])).toBe(true);
      expect(near(p1[i], ref.st[i] === ref.lower[i] ? ref.st[i] : NaN)).toBe(true);
      expect(near(p3[i], ref.st[i] === ref.upper[i] ? ref.st[i] : NaN)).toBe(true);
      expect(p2[i]).toBeCloseTo((bars[i].open + bars[i].close) / 2, 10);
      expect(res.plots.plot0[i].color).toBe(ref.col[i]);
      if (!isNaN(p0[i])) valid++;
    }
    expect(valid).toBeGreaterThan(1400);
    // both trend halves and all three colours occur
    expect(p1.some((v) => !isNaN(v))).toBe(true);
    expect(p3.some((v) => !isNaN(v))).toBe(true);
    for (const c of [vst.defaultInputs.upCol, vst.defaultInputs.dnCol, vst.defaultInputs.neCol]) expect(ref.col).toContain(c);
  });

  it('the other moving-average sources follow the original', () => {
    for (const maSrc of ['SMA', 'EMA', 'RMA', 'VWMA'] as const) {
      const p = { ...vst.defaultInputs, maSrc, k: 4, n: 12 };
      const r = vst.calculate(bars, p);
      const e = refVst(bars, p);
      const v = values(r.plots.plot0);
      for (let i = 0; i < bars.length; i++) expect(near(v[i], e.st[i])).toBe(true);
      expect(r.plots.plot0.map((x) => x.color)).toEqual(e.col);
    }
  });

  it('shapes and alerts fire on the recomputed conditions', () => {
    // a narrow band (factor 0.5) flips inside the trends, where the vote is unanimous: all signals occur
    const p = { ...vst.defaultInputs, factor: 0.5 };
    const res = vst.calculate(bars, p);
    const ref = refVst(bars, p);
    const times = (f: boolean[]) => bars.filter((_b, i) => f[i]).map((b) => b.time);
    const flags = [
      ref.startUp, ref.startDn, ref.startUp.map((v, i) => v || ref.startDn[i]),
      ref.trendUp, ref.trendDn, ref.trendUp.map((v, i) => v || ref.trendDn[i]),
    ];
    flags.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(res.alerts[k].id).toBe(`alert${k}`);
      expect(res.alerts[k].times).toEqual(times(f));
    });
    const shapeFlags = [ref.startUp, ref.startDn, ref.trendUp, ref.trendDn];
    shapeFlags.forEach((f, k) => {
      const ms = res.markers.filter((m) => m.id === `shape${k}`);
      expect(ms.map((m) => m.time)).toEqual(times(f));
      for (const m of ms) {
        const i = bars.findIndex((b) => b.time === m.time);
        expect(m.position).toBe('atPriceMiddle');
        expect(m.price).toBeCloseTo(ref.st[i], 8);
      }
    });
    expect(res.markers.find((m) => m.id === 'shape0')).toMatchObject({ shape: 'circle', size: 'tiny', color: vst.defaultInputs.bullishCol });
    expect(res.markers.find((m) => m.id === 'shape1')).toMatchObject({ shape: 'circle', size: 'tiny', color: vst.defaultInputs.bearishCol });
    expect(res.markers.find((m) => m.id === 'shape2')).toMatchObject({ shape: 'triangleUp', size: 'small', color: vst.defaultInputs.bullishCol });
    expect(res.markers.find((m) => m.id === 'shape3')).toMatchObject({ shape: 'triangleDown', size: 'small', color: vst.defaultInputs.bearishCol });
  });

  it('AI Trend Signals off removes shapes and alerts', () => {
    const r = vst.calculate(bars, { aiSignals: false });
    expect(r.markers).toHaveLength(0);
    for (const a of r.alerts) expect(a.times).toHaveLength(0);
  });
});

describe('dmi-adx-levels (Directional Movement Index + ADX + Ploted KEYLEVEL)', () => {
  const bars = walk(1300, 23);
  const res = dmi.calculate(bars);

  it('declares the original outputs and inputs', () => {
    expect(dmi.metadata).toEqual({ title: 'Directional Movement Index + ADX + Ploted KEYLEVEL', shortTitle: 'DMI/ADX/KEYLEVEL', overlay: false });
    expect(dmi.plotConfig.map((p) => [p.id, p.title, p.color, p.lineWidth])).toEqual([
      ['plot0', 'ADX', '#FF0000', 1], ['plot1', '+DI', '#0000FF', 1], ['plot2', '-DI', '#808080', 1], ['plot3', 'Key Level', '#FFFFFF', 1],
    ]);
    expect(Object.keys(res.plots)).toEqual(['plot0', 'plot1', 'plot2', 'plot3']);
    expect(dmi.inputConfig.map((c) => [c.id, c.title, c.defval])).toEqual([
      ['adxLen', 'ADX Smoothing', 14], ['diLen', 'DI Length', 14], ['keyLevel', 'key level for ADX', 23],
    ]);
    expect(res.fills ?? []).toHaveLength(0);
  });

  it('ADX, +DI, -DI and the key level match the original formulas', () => {
    for (const [adxLen, diLen, keyLevel] of [[14, 14, 23], [9, 20, 30]]) {
      const r = dmi.calculate(bars, { adxLen, diLen, keyLevel });
      const up = bars.map((b, i) => (i > 0 ? b.high - bars[i - 1].high : NaN));
      const down = bars.map((b, i) => (i > 0 ? bars[i - 1].low - b.low : NaN));
      const tr = rma(trueRange(bars, false), diLen);
      const fix = (x: number[]) => { let l = NaN; return x.map((v) => (isNaN(v) ? l : (l = v))); };
      const plus = fix(rma(up.map((u, i) => (u > down[i] && u > 0 ? u : 0)), diLen).map((v, i) => 100 * v / tr[i]));
      const minus = fix(rma(down.map((d, i) => (d > up[i] && d > 0 ? d : 0)), diLen).map((v, i) => 100 * v / tr[i]));
      const adx = rma(plus.map((p, i) => { const s = p + minus[i]; return Math.abs(p - minus[i]) / (s === 0 ? 1 : s); }), adxLen).map((v) => 100 * v);
      const got = [values(r.plots.plot0), values(r.plots.plot1), values(r.plots.plot2)];
      [adx, plus, minus].forEach((e, k) => {
        for (let i = 0; i < bars.length; i++) expect(near(got[k][i], e[i])).toBe(true);
      });
      // first values: +DI on bar diLen (TR is na on bar 0), ADX diLen + adxLen - 1
      expect(isNaN(got[1][diLen - 1]) && !isNaN(got[1][diLen])).toBe(true);
      expect(isNaN(got[0][diLen + adxLen - 2]) && !isNaN(got[0][diLen + adxLen - 1])).toBe(true);
      expect(values(r.plots.plot3).every((v) => v === keyLevel)).toBe(true);
    }
  });
});
