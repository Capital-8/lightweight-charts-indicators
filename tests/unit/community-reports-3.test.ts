/**
 * Community ports re-ported from their originals (reports batch 3): outputs (plot ids / titles, marker ids, fills),
 * the main series recomputed from the original's formulas on a seeded walk, and the alert conditions.
 * forex-sessions and mfi-rsi-bb are not re-ported: the spec original is another script than the one they port.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as fx from '../../src/community/forex-sessions';
import * as gli from '../../src/community/global-liquidity-index';
import * as mfi from '../../src/community/mfi-rsi-bb';
import * as mlst from '../../src/community/ml-adaptive-supertrend';
import { makeBars } from './community-top100.helpers';
import { fixtureContext } from './community-other-symbols.helpers';

/** Seeded random walk of daily bars with a random volume */
function walk(count: number, seed0: number, step = 86400, start = 1577836800): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4 * (1 + Math.sin(i / 90)));
    const volume = 1e6 * (0.3 + rnd());
    out.push({ time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}

const timesOf = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const close6 = (a: number, b: number) => (Number.isNaN(a) ? Number.isNaN(b) : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a)));

function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
function ema(src: number[], len: number): number[] {
  const a = 2 / (len + 1);
  const out: number[] = [];
  const seed = sma(src, len);
  for (let i = 0; i < src.length; i++) {
    const prev = i > 0 ? out[i - 1] : NaN;
    out.push(Number.isNaN(prev) ? seed[i] : a * src[i] + (1 - a) * prev);
  }
  return out;
}
function rma(src: number[], len: number): number[] {
  const out: number[] = [];
  const seed = sma(src, len);
  for (let i = 0; i < src.length; i++) {
    const prev = i > 0 ? out[i - 1] : NaN;
    out.push(Number.isNaN(prev) ? seed[i] : (src[i] + (len - 1) * prev) / len);
  }
  return out;
}
function stdev(src: number[], len: number): number[] {
  const m = sma(src, len);
  return src.map((_, i) => {
    if (Number.isNaN(m[i])) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += (src[k] - m[i]) ** 2;
    return Math.sqrt(s / len);
  });
}
function atr(list: Bar[], len: number): number[] {
  const tr = list.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - list[i - 1].close), Math.abs(b.low - list[i - 1].close))));
  return rma(tr, len);
}

describe('forex-sessions', () => {
  it('is not re-ported: the spec original (CM_Forex-Sessions-Highlight_V1) is another script than the port', () => {
    expect(fx.metadata.title).not.toBe('CM_Forex-Sessions-Highlight_V1');
    expect((fx as Record<string, unknown>).alertConditions).toBeUndefined();
  });
});

describe('mfi-rsi-bb', () => {
  it('is not re-ported: the spec original (RSI/MFI with Volatility Bands [LazyBear]) is another script', () => {
    expect(mfi.metadata.title).not.toBe('RSI/MFI with Volatility Bands [LazyBear]');
  });
});

describe('global-liquidity-index', () => {
  const list = makeBars(1500, 86400);
  const ctx = fixtureContext(1500);
  const r = gli.calculate(list, {}, ctx);

  it('has the outputs of the original', () => {
    expect(gli.plotConfig.map((p) => [p.id, p.title, p.color, p.lineWidth])).toEqual([['plot0', 'GLI Line', '#FDD835', 2]]);
    expect(r.tables).toHaveLength(1);
    expect(r.tables[0].cells).toHaveLength(22);
    expect(gli.metadata.overlay).toBe(true);
  });

  it('declares the alert conditions of the original', () => {
    expect(decls(gli)).toEqual([
      ['alert0', 'Trend Bullish', 'Global Liquidity Bullish!'],
      ['alert1', 'Trend Bearish', 'Global Liquidity Bearish!'],
      ['alert2', 'Tracking Ahead', '{{ticker}} Leading Global Liquidity!'],
      ['alert3', 'Tracking Behind', '{{ticker}} Lagging Global Liquidity!'],
    ]);
    expect(gli.GlobalLiquidityIndex.alertConditions).toBe(gli.alertConditions);
  });

  it('fires the alerts on the changes of trend and tracking (recomputed from the total)', () => {
    // SMA Length 0 -> 1, ROC 0, offset 0: the line is the total
    const total = r.plots.plot0.map((p) => p.value);
    expect(total.filter(Number.isFinite).length).toBeGreaterThan(1000);
    const closes = list.map((b) => b.close);
    const fast = ema(total, 30);
    const slow = ema(total, 60);
    const bull = total.map((_, i) => fast[i] >= slow[i]);
    const bear = total.map((_, i) => fast[i] < slow[i]);
    const diff = (a: number[]) => a.map((v, i) => (i >= 30 ? v - a[i - 30] : NaN));
    const z = (a: number[]) => {
      const d = diff(a);
      const s = sma(d, 10);
      const sd = stdev(d, 30);
      return d.map((_, i) => s[i] / sd[i]);
    };
    const gz = z(total);
    const az = z(closes);
    const tracking = total.map((_, i) => az[i] - gz[i]);
    const ahead = tracking.map((v) => v >= 0);
    const behind = tracking.map((v) => v < 0);
    const starts = (f: boolean[]) => f.map((v, i) => v && !(i > 0 && f[i - 1]));
    const want = [bull, bear, ahead, behind].map((f) => timesOf(list, starts(f)));
    for (const w of want) expect(w.length).toBeGreaterThan(2);
    expect(r.alerts.map((a) => a.times)).toEqual(want);
  });
});

describe('ml-adaptive-supertrend', () => {
  const list = walk(1300, 4242);
  const n = list.length;
  const r = mlst.calculate(list);

  it('has the outputs of the original', () => {
    expect(mlst.plotConfig.map((p) => [p.id, p.title, p.style ?? 'line', p.display ?? 'all'])).toEqual([
      ['plot0', 'Plot', 'linebr', 'all'],
      ['plot1', 'Plot', 'linebr', 'all'],
      ['plot2', 'Body Middle', 'line', 'none'],
    ]);
    expect(Object.keys(r.plots)).toEqual(['plot0', 'plot1', 'plot2']);
    expect([...new Set(r.markers.map((m) => m.id))].sort()).toEqual(['shape0', 'shape1']);
    expect(r.markers.filter((m) => m.id === 'shape0').every((m) => m.shape === 'labelUp' && m.text === '▲')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape1').every((m) => m.shape === 'labelDown' && m.text === '▼')).toBe(true);
    expect(r.fills!.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([
      ['plot2', 'plot0', 'Plots Background'],
      ['plot2', 'plot1', 'Plots Background'],
    ]);
    expect(r.fills!.every((f) => f.gradient && f.gradient.topValue.length === n)).toBe(true);
    expect(r.labels.length).toBe(500);
    expect(r.tables[0].cells).toHaveLength(16);
    expect(mlst.metadata.overlay).toBe(true);
  });

  // the original's k-means and supertrend, written out again
  const vol = atr(list, 10);
  const hi = vol.map((_, i) => (i < 99 ? NaN : Math.max(...vol.slice(i - 99, i + 1).filter(Number.isFinite))));
  const lo = vol.map((_, i) => (i < 99 ? NaN : Math.min(...vol.slice(i - 99, i + 1).filter(Number.isFinite))));
  const cluster: number[] = [];
  const centroid: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = [0.75, 0.5, 0.25].map((p) => lo[i] + (hi[i] - lo[i]) * p);
    if ((vol[i] || 0) > 0 && i >= 99) {
      for (let it = 0; it < 1000; it++) {
        const groups: number[][] = [[], [], []];
        for (let k = 99; k >= 0; k--) {
          const d = m.map((c) => Math.abs(vol[i - k] - c));
          for (let g = 0; g < 3; g++) if (d.every((x, h) => h === g || d[g] < x)) groups[g].push(vol[i - k]);
        }
        const next = groups.map((g) => (g.length ? g.reduce((a, b) => a + b, 0) / g.length : NaN));
        const same = next.every((v, g) => Number.isNaN(v) || Number.isNaN(m[g]) || v === m[g]);
        m = next;
        if (same) break;
      }
    }
    const d = m.map((c) => Math.abs(vol[i] - c));
    const fin = d.filter(Number.isFinite);
    const c = fin.length ? d.indexOf(Math.min(...fin)) : -1;
    cluster.push(c);
    centroid.push(c === -1 ? NaN : m[c]);
  }
  const st: number[] = [];
  const dir: number[] = [];
  let pl = NaN, pu = NaN;
  for (let i = 0; i < n; i++) {
    const b = list[i];
    let up = (b.high + b.low) / 2 + 3 * centroid[i];
    let dn = (b.high + b.low) / 2 - 3 * centroid[i];
    const zl = Number.isNaN(pl) ? 0 : pl, zu = Number.isNaN(pu) ? 0 : pu;
    const c1 = i > 0 ? list[i - 1].close : NaN;
    dn = dn > zl || c1 < zl ? dn : zl;
    up = up < zu || c1 > zu ? up : zu;
    const d = i === 0 || Number.isNaN(centroid[i - 1]) ? 1 : st[i - 1] === zu ? (b.close > up ? -1 : 1) : (b.close < dn ? 1 : -1);
    dir.push(d);
    st.push(d === -1 ? dn : up);
    pl = dn; pu = up;
  }

  it('gives the SuperTrend of the original (k-means centroid as the ATR)', () => {
    const up = list.map((b, i) => (b.close > st[i] ? st[i] : NaN));
    const down = list.map((b, i) => (b.close < st[i] ? st[i] : NaN));
    expect(up.filter(Number.isFinite).length).toBeGreaterThan(300);
    expect(down.filter(Number.isFinite).length).toBeGreaterThan(300);
    const bad = (got: { value: number }[], want: number[]) => want.findIndex((v, i) => !close6(v, got[i].value));
    expect(bad(r.plots.plot0, up)).toBe(-1);
    expect(bad(r.plots.plot1, down)).toBe(-1);
    expect(bad(r.plots.plot2, list.map((b, i) => (i === 0 ? NaN : (b.open + b.close) / 2)))).toBe(-1);
    // labels: cluster number one ATR(7) beyond the SuperTrend
    const a7 = atr(list, 7);
    const last = r.labels[r.labels.length - 1];
    expect(last.text).toBe(String(3 - cluster[n - 1]));
    expect(close6(last.price, dir[n - 1] > 0 ? st[n - 1] + a7[n - 1] : st[n - 1] - a7[n - 1])).toBe(true);
    expect(new Set(cluster.slice(200)).size).toBe(3);
  });

  it('declares and fires the alert conditions of the original', () => {
    expect(decls(mlst)).toEqual([
      ['alert0', 'Bullish Trend Shift', 'Alert Fired!'],
      ['alert1', 'Bearish Trend Shift', 'Alert Fired!'],
      ['alert2', 'High Volatility', 'Alert Fired!'],
      ['alert3', 'Medium Volatility', 'Alert Fired!'],
      ['alert4', 'Low Volatility', 'Alert Fired!'],
      ['alert5', 'Low Volatility', 'Alert Fired!'],
    ]);
    const bull = dir.map((d, i) => i > 0 && d < 0 && dir[i - 1] >= 0);
    const bear = dir.map((d, i) => i > 0 && d > 0 && dir[i - 1] <= 0);
    const to = (k: number) => cluster.map((c, i) => i > 0 && c === k && cluster[i - 1] !== k);
    const want = [bull, bear, to(0), to(1), to(2), to(2)].map((f) => timesOf(list, f));
    for (const w of want) expect(w.length).toBeGreaterThan(2);
    expect(r.alerts.map((a) => a.times)).toEqual(want);
    expect(r.markers.filter((m) => m.id === 'shape0').map((m) => m.time)).toEqual(want[0]);
    expect(r.markers.filter((m) => m.id === 'shape1').map((m) => m.time)).toEqual(want[1]);
    // an open last bar does not fire (barstate.isconfirmed)
    const open = mlst.calculate(list, {}, { lastBarConfirmed: false });
    expect(open.alerts.every((a) => !a.times.includes(list[n - 1].time as number))).toBe(true);
  });
});
