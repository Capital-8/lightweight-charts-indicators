/**
 * Community ports, batch 20: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), and the Style ids on the
 * emitted markers / background colours / bar colours / arrows / candles.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as kernel from '../../src/community/kernel-channel';
import * as kijun from '../../src/community/kijun-sen-with-buy-sell-labels-alerts-ichimoku-simplified';
import * as ksi from '../../src/community/kinetic-slippage-index';
import * as l1 from '../../src/community/l1-moving-average-fingerprint-for-long-entry';
import * as lagFilter from '../../src/community/laguerre-filter';
import * as lagKalman from '../../src/community/laguerre-kalman-adaptive-filter-alphanatt';
import * as leledc from '../../src/community/leledc-levels';
import * as linreg from '../../src/community/linear-regression';
import * as lrCandles from '../../src/community/linear-regression-candles';
import * as dgt from '../../src/community/linear-regression-channel-curve-slope-by-dgt';
import * as lro from '../../src/community/linear-regression-oscillator';
import * as lrv from '../../src/community/linear-regression-volume-lyro-rs';
import * as lvm from '../../src/community/linear-volume-macd-lyro-rs';
import * as aiLinreg from '../../src/community/linereg-candles-with-hma-filter';
import * as lrb from '../../src/community/liquid-reversal-bands';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** Seeded random walk of daily bars with a random volume */
function walk(count: number, seed0: number, step = 86400, start = 1577836800): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1200, 7);
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const uniq = <T>(a: T[]) => [...new Set(a)];
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const idTimes = (items: { id?: string; time: unknown }[], id: string) => items.filter((m) => m.id === id).map((m) => m.time);

/** ta.crossover / ta.crossunder with exact comparisons (na = false) */
const xover = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : b[i - 1];
  return i > 0 && v > w && a[i - 1] <= pw;
});
const xunder = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : b[i - 1];
  return i > 0 && v < w && a[i - 1] >= pw;
});
/** ta.highest / ta.lowest (na before `len` bars) */
const highest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.max(...src.slice(i - len + 1, i + 1))));
const lowest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.min(...src.slice(i - len + 1, i + 1))));
/** ta.ema with an SMA seed */
function ema(src: number[], len: number): number[] {
  const alpha = 2 / (len + 1);
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(prev)) {
      let s = 0, ok = i >= len - 1;
      for (let k = i - len + 1; ok && k <= i; k++) { if (isNaN(src[k])) ok = false; else s += src[k]; }
      prev = ok ? s / len : NaN;
    } else {
      prev = alpha * src[i] + (1 - alpha) * prev;
    }
    out.push(prev);
  }
  return out;
}
/** ta.linreg(src, len, offset): least squares line of the window (x = 0 for the oldest value) at x = len - 1 - offset */
function linregOf(src: number[], len: number, offset: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let x = 0; x < len; x++) {
      const y = src[i - len + 1 + x];
      sx += x; sy += y; sxy += x * y; sxx += x * x;
    }
    const slope = len > 1 ? (len * sxy - sx * sy) / (len * sxx - sx * sx) : 0;
    const intercept = (sy - slope * sx) / len;
    return intercept + slope * (len - 1 - offset);
  });
}
/** '#rrggbb' of a '#rrggbb' / 'rgb(r, g, b)' / 'rgba(r, g, b, 1)' colour */
const hex = (c: string) => {
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (!m) return c.toLowerCase().slice(0, 7);
  return '#' + m[1].split(',').slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('');
};
const close6 = (a: number[], b: number[]) => a.every((v, i) => (isNaN(v) && isNaN(b[i])) || Math.abs(v - b[i]) < 1e-6 * Math.max(1, Math.abs(v)));

describe('kernel-channel', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(kernel)).toEqual([
      ['alert0', 'Kernel Channel Long', 'Kernel Channel Long {{exchange}}:{{ticker}}'],
      ['alert1', 'Kernel Channel Short', 'Kernel Channel Short {{exchange}}:{{ticker}}'],
      ['alert2', 'Price Crossed Kernel Channel Midline', 'Price Crossed Kernel Channel Midline {{exchange}}:{{ticker}}'],
      ['alert3', 'Price Crossed Kernel Channel Midline', 'Price Crossed Kernel Channel Midline {{exchange}}:{{ticker}}'],
      ['alert4', 'Price Above Kernel Channel Upper', 'Price Above Kernel Channel Upper {{exchange}}:{{ticker}}'],
      ['alert5', 'Price Below Kernel Channel Lower', 'Price Below Kernel Channel Lower {{exchange}}:{{ticker}}'],
    ]);
    expect(kernel.KernelChannel.alertConditions).toBe(kernel.alertConditions);
    const len = 40;
    const r = kernel.calculate(bars, { winLength: len });
    // Epanechnikov midline of hlc3 (bars before the history count as 0)
    const src = bars.map((b) => (b.high + b.low + b.close) / 3);
    const w = Array.from({ length: len }, (_, k) => 1 - Math.min(1, k / (len - 1)) ** 2);
    const mid = src.map((_, i) => {
      let num = 0, den = 0;
      for (let k = 0; k < len; k++) { num += w[k] * (i - k >= 0 ? src[i - k] : 0); den += w[k]; }
      return num / den;
    });
    expect(close6(vals(r.plots.plot0 as { value: number }[]), mid)).toBe(true);
    const upper = vals(r.plots.plot1 as { value: number }[]);
    const lower = vals(r.plots.plot2 as { value: number }[]);
    const flags = [
      mid.map((m, i) => i > 0 && gt(m, mid[i - 1])),
      mid.map((m, i) => i > 0 && lt(m, mid[i - 1])),
      xover(close, mid),
      xunder(close, mid),
      close.map((c, i) => lt(c, upper[i])),
      close.map((c, i) => lt(c, lower[i])),
    ];
    flags.forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
  });
  it('gives the bgcolor ids and the plotcandle output', () => {
    const r = kernel.calculate(bars, { winLength: 40, highlightDev: true, useBarColor: true });
    for (const id of ['bgcolor0', 'bgcolor1', 'bgcolor2']) expect(idTimes(r.bgColors, id).length, id).toBeGreaterThan(0);
    expect(r.bgColors.every((c) => ['bgcolor0', 'bgcolor1', 'bgcolor2'].includes(c.id as string))).toBe(true);
    const upper = vals(r.plots.plot1 as { value: number }[]);
    expect(idTimes(r.bgColors, 'bgcolor1')).toEqual(timeAt(bars, close.map((c, i) => gt(c, upper[i]))));
    expect(kernel.plotCandleConfig).toEqual([{ id: 'barColoring', title: 'Bar Coloring' }]);
    expect(r.plotCandles.barColoring.length).toBe(bars.length);
    // display.none without useBarColor: the output is there, with no candle
    expect(kernel.calculate(bars, { winLength: 40 }).plotCandles).toEqual({ barColoring: [] });
  });
});

describe('kijun-sen-with-buy-sell-labels-alerts-ichimoku-simplified', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(kijun)).toEqual([
      ['alert0', 'Color Change Alert', 'Kijun-Sen Color Change: Trend Changed!'],
      ['alert1', 'Price Crosses Kijun Up', 'Price crossed Kijun-Sen upwards!'],
      ['alert2', 'Price Crosses Kijun Down', 'Price crossed Kijun-Sen downwards!'],
    ]);
    expect(kijun.KijunSenWithAlerts.alertConditions).toBe(kijun.alertConditions);
    const r = kijun.calculate(bars);
    const hh = highest(high, 26), ll = lowest(low, 26);
    const ks = hh.map((h, i) => (h + ll[i]) / 2);
    const up = close.map((c, i) => gt(c, ks[i]));
    const dn = close.map((c, i) => lt(c, ks[i]));
    const change = up.map((u, i) => (u && !(i > 0 && up[i - 1])) || (dn[i] && !(i > 0 && dn[i - 1])));
    const flags = [change, xover(close, ks), xunder(close, ks)];
    flags.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
  });
});

describe('kinetic-slippage-index', () => {
  it('declares and fires the alertcondition of the original', () => {
    expect(decls(ksi)).toEqual([[
      'alert0', 'KSI Anomalous Spike',
      'KSI Alert! Anomalous volume/range divergence detected on {{exchange}}:{{ticker}}, TF: {{interval}}. Potential trend exhaustion or false breakout.',
    ]]);
    expect(ksi.KineticSlippageIndex.alertConditions).toBe(ksi.alertConditions);
    const vol = bars.map((b) => b.volume as number);
    const tr = bars.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - close[i - 1]), Math.abs(b.low - close[i - 1]))));
    const ev = ema(vol, 20);
    const k = bars.map((_, i) => (gt(ev[i], 0) ? (tr[i] ** 2 / (vol[i] * ev[i])) * 1e6 : 0));
    for (const sigSpike of [0, 1e-6, 2e-6]) {
      const r = ksi.calculate(bars, { sigSpike });
      expect(close6(vals(r.plots.plot0 as { value: number }[]), k)).toBe(true);
      const f = xover(k, sigSpike);
      expect(f.some(Boolean), String(sigSpike)).toBe(true);
      expect(r.alerts[0].times).toEqual(timeAt(bars, f));
    }
  });
  it('takes tr^2 / 0 as +infinity (a spike) as the original', () => {
    const b2 = bars.slice(0, 200).map((b) => ({ ...b }));
    b2[100] = { ...b2[100], volume: 0 };
    const r = ksi.calculate(b2, { sigSpike: 1e9 });
    expect(r.alerts[0].times).toEqual([b2[100].time]);
  });
});

describe('l1-moving-average-fingerprint-for-long-entry', () => {
  it('gives the plotchar id of each order size', () => {
    const list = walk(1500, 3);
    const r = l1.calculate(list, { maGene1: 120, maGene2: 60, maGene3: 30 });
    const colors: Record<string, string> = { char0: 'rgb(255, 235, 59)', char1: 'rgb(0, 230, 118)', char2: 'rgb(76, 175, 80)' };
    expect(r.markers.length).toBeGreaterThan(0);
    expect(r.markers.every((m) => ['char0', 'char1', 'char2'].includes(m.id as string))).toBe(true);
    expect(uniq(r.markers.map((m) => m.id)).length).toBeGreaterThan(1);
    // the id follows the level: same colour for one id
    for (const id of Object.keys(colors)) expect(uniq(r.markers.filter((m) => m.id === id).map((m) => m.textColor)).length).toBeLessThanOrEqual(1);
    expect(uniq(r.markers.map((m) => `${m.id}|${m.textColor}`)).length).toBe(uniq(r.markers.map((m) => m.id)).length);
  });
});

describe('laguerre-filter', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(lagFilter)).toEqual([
      ['alert0', 'Laguerre Long', 'Laguerre Filter turned bullish {{exchange}}:{{ticker}}'],
      ['alert1', 'Laguerre Short', 'Laguerre Filter turned bearish {{exchange}}:{{ticker}}'],
      ['alert2', 'Price Cross', 'Price crossed Laguerre Filter {{exchange}}:{{ticker}}'],
    ]);
    expect(lagFilter.LaguerreFilter.alertConditions).toBe(lagFilter.alertConditions);
    const r = lagFilter.calculate(bars);
    // Laguerre filter of order 4, gamma 0.8, weights 1 2 2 1, elements starting at the first close
    const g = 0.8;
    let L = [close[0], close[0], close[0], close[0]];
    let val = close[0];
    let trend = 0;
    const value: number[] = [], tr: number[] = [];
    for (const c of close) {
      const p = L.slice();
      L = [(1 - g) * c + g * p[0], 0, 0, 0];
      for (let k = 1; k < 4; k++) L[k] = -g * L[k - 1] + p[k - 1] + g * p[k];
      const prev = val;
      val = (L[0] + 2 * L[1] + 2 * L[2] + L[3]) / 6;
      if (gt(val, prev)) trend = 1; else if (lt(val, prev)) trend = -1;
      value.push(val);
      tr.push(trend);
    }
    expect(close6(vals(r.plots.plot0 as { value: number }[]), value)).toBe(true);
    const cr = xover(close, value).map((v, i) => v || xunder(close, value)[i]);
    const flags = [
      tr.map((t, i) => t === 1 && !(i > 0 && tr[i - 1] === 1)),
      tr.map((t, i) => t === -1 && !(i > 0 && tr[i - 1] === -1)),
      cr,
    ];
    flags.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
  });
});

describe('laguerre-kalman-adaptive-filter-alphanatt', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(lagKalman)).toEqual([
      ['alert0', 'Filter Cross Up', 'Price crossed above Laguerre-Kalman Filter'],
      ['alert1', 'Filter Cross Down', 'Price crossed below Laguerre-Kalman Filter'],
    ]);
    expect(lagKalman.LaguerreKalmanAdaptiveFilterAlphanatt.alertConditions).toBe(lagKalman.alertConditions);
    const r = lagKalman.calculate(bars);
    const smoothed = vals(r.plots.plot0 as { value: number }[]);
    const flags = [xover(close, smoothed), xunder(close, smoothed)];
    flags.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
  });
});

describe('leledc-levels', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(leledc)).toEqual([['alert0', 'Up', 'Alert Fired!'], ['alert1', 'Down', 'Alert Fired!']]);
    expect(leledc.LeledcLevels.alertConditions).toBe(leledc.alertConditions);
    for (const [length, count] of [[40, 10], [10, 4]]) {
      const r = leledc.calculate(bars, { length, bars: count });
      // Lelec(bars, len) of the original
      const hh = highest(high, length), ll = lowest(low, length);
      let bi = 0, si = 0;
      const lelex = bars.map((b, i) => {
        const c4 = i >= 4 ? close[i - 4] : NaN;
        if (b.close > c4) bi++;
        if (b.close < c4) si++;
        if (bi > count && b.close < b.open && b.high >= hh[i]) { bi = 0; return -1; }
        if (si > count && b.close > b.open && b.low <= ll[i]) { si = 0; return 1; }
        return 0;
      });
      const up = lelex.map((v) => v === 1);
      const down = lelex.map((v) => v === -1);
      expect(up.some(Boolean) && down.some(Boolean)).toBe(true);
      expect(r.alerts[0].times).toEqual(timeAt(bars, up));
      expect(r.alerts[1].times).toEqual(timeAt(bars, down));
    }
  });
});

describe('linear-regression', () => {
  it('declares and fires the alertconditions of the original (all bars, not only the shown labels)', () => {
    expect(decls(linreg)).toEqual([
      ['alert0', 'Buy Lin Reg', 'Crossing On the Lower Regression Channel'],
      ['alert1', 'Sell Lin Reg', 'Crossing On the Higher Regression Channel'],
    ]);
    expect(linreg.LinearRegression.alertConditions).toBe(linreg.alertConditions);
    const len = 50;
    const r = linreg.calculate(bars, { length: len, deviation: 1 });
    const lr = linregOf(close, len, 0);
    const lrp = linregOf(close, len, 1);
    const dm: number[] = [], dp: number[] = [];
    for (let x = 0; x < bars.length; x++) {
      const slope = lr[x] - lrp[x];
      const intercept = lr[x] - x * slope;
      let sum = 0;
      for (let i = 0; i < len; i++) sum += ((x - i >= 0 ? close[x - i] : NaN) - (slope * (x - i) + intercept)) ** 2;
      const dev = Math.sqrt(sum / len);
      dm.push(-dev + lr[x]);
      dp.push(dev + lr[x]);
    }
    const buy = xunder(close, dm), sell = xover(close, dp);
    expect(buy.filter(Boolean).length).toBeGreaterThan(2);
    expect(sell.filter(Boolean).length).toBeGreaterThan(2);
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
    // the labels are only on the last `length` bars, the alerts on all of them
    expect(r.markers.length).toBeLessThan(r.alerts[0].times.length + r.alerts[1].times.length);
  });
});

describe('linear-regression-candles', () => {
  it('gives the two plotcandle outputs of the original', () => {
    expect(lrCandles.plotCandleConfig.map((c) => c.id)).toEqual(['candle0', 'candle1']);
    const r = lrCandles.calculate(bars);
    const up = r.plotCandles.candle0, dn = r.plotCandles.candle1;
    expect(up.length).toBe(bars.length);
    expect(dn.length).toBe(bars.length);
    const drawn = (c: { open: number }) => !isNaN(c.open);
    expect(up.filter(drawn).every((c) => c.open < c.close)).toBe(true);
    expect(dn.filter(drawn).every((c) => !(c.open < c.close))).toBe(true);
    expect(up.filter(drawn).length).toBeGreaterThan(0);
    expect(dn.filter(drawn).length).toBeGreaterThan(0);
    // one candle per bar with values, in one of the two outputs
    expect(up.every((c, i) => !(drawn(c) && drawn(dn[i])))).toBe(true);
    const lo = linregOf(bars.map((b) => b.open), 11, 0), lc = linregOf(close, 11, 0);
    up.forEach((c, i) => {
      if (drawn(c)) expect(Math.abs(c.open - lo[i]) < 1e-6 && Math.abs(c.close - lc[i]) < 1e-6).toBe(true);
    });
  });
});

describe('linear-regression-channel-curve-slope-by-dgt', () => {
  it('gives the plotarrow output as arrows with its id', () => {
    const r = dgt.calculate(bars, { showSlope: true });
    expect(r.arrows.length).toBeGreaterThan(0);
    expect(r.arrows.every((a) => a.id === 'arrow0' && a.value !== 0 && isFinite(a.value))).toBe(true);
    expect(r.arrows.every((a) => a.color === (a.value > 0 ? 'rgba(6,186,209,0.5)' : 'rgba(245,127,23,0.5)'))).toBe(true);
    expect(r.arrows.some((a) => a.value > 0) && r.arrows.some((a) => a.value < 0)).toBe(true);
    expect(r.markers.some((m) => m.shape === 'arrowUp' || m.shape === 'arrowDown')).toBe(false);
    // show_last = 3 x Count (200)
    const first = bars.length - 3 * 200;
    expect(r.arrows[0].time).toBe(bars[first].time);
    expect(r.arrows.every((a) => (a.time as number) >= (bars[first].time as number))).toBe(true);
    expect(dgt.calculate(bars).arrows).toEqual([]);
  });
});

describe('linear-regression-oscillator', () => {
  it('gives the plotchar id of each diamond', () => {
    const r = lro.calculate(bars);
    expect(r.markers.length).toBeGreaterThan(0);
    const look: Record<string, [string, string]> = {
      char0: ['◇', '#2962FF'], char1: ['◇', '#10cab8'], char2: ['◆', '#2962FF'], char3: ['◆', '#10cab8'],
    };
    for (const m of r.markers) {
      const l = look[m.id as string];
      expect(l, String(m.id)).toBeDefined();
      expect(m.text).toBe(l[0]);
      expect(hex(String(m.textColor))).toBe(l[1].toLowerCase());
    }
    expect(uniq(r.markers.map((m) => m.id)).sort()).toEqual(['char0', 'char1', 'char2', 'char3']);
    // the zero-line diamonds: one per zero cross of the oscillator, on the bar before
    const osc = vals(r.plots.plot0 as { value: number }[]);
    const cu = xunder(osc, 0);
    expect(idTimes(r.markers, 'char2')).toEqual(bars.filter((_, i) => cu[i + 1]).map((b) => b.time));
  });
});

describe('linear-regression-volume-lyro-rs', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(lrv)).toEqual([
      ['alert0', 'Linear Regression Volume - Long', 'Linear Regression Volume is Long {{exchange}}:{{ticker}}'],
      ['alert1', 'Linear Regression Volume - Short', 'Linear Regression Volume is Short {{exchange}}:{{ticker}}'],
    ]);
    expect(lrv.LinearRegressionVolumeLyroRs.alertConditions).toBe(lrv.alertConditions);
    const r = lrv.calculate(bars);
    // baseline = ta.linreg(ta.sma(close * volume, 35) / ta.sma(volume, 35), 35, 0)
    const len = 35;
    const sma = (s: number[]) => s.map((_, i) => (i < len - 1 ? NaN : s.slice(i - len + 1, i + 1).reduce((a, b) => a + b, 0) / len));
    const vol = bars.map((b) => b.volume as number);
    const num = sma(close.map((c, i) => c * vol[i])), den = sma(vol);
    const vw = num.map((v, i) => v / den[i]);
    const base = vw.map((_, i) => (i < 2 * len - 2 ? NaN : linregOf(vw.slice(i - len + 1, i + 1), len, 0)[len - 1]));
    expect(close6(vals(r.plots.plot0 as { value: number }[]), base)).toBe(true);
    const slope = base.map((b, i) => (i > 0 ? b - base[i - 1] : NaN));
    const flags = [slope.map((s) => gt(s, 0)), slope.map((s) => lt(s, 0))];
    flags.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
  });
});

describe('linear-volume-macd-lyro-rs', () => {
  it('declares and fires the alertconditions of the original (one var state per signal type)', () => {
    expect(decls(lvm)).toEqual([
      ['alert0', 'Linear Volume MACD - Linear Regression Bull', 'Linear Volume MACD, linear regression mode is bullish {{exchange}}:{{ticker}}'],
      ['alert1', 'Linear Volume MACD - Linear Regression Bearish', 'Linear Volume MACD, linear regression mode is bearish {{exchange}}:{{ticker}}'],
      ['alert2', 'Linear Volume MACD - Strong/Weak Trend Bull', 'Linear Volume MACD, strong/weak trend mode is bullish {{exchange}}:{{ticker}}'],
      ['alert3', 'Linear Volume MACD - Strong/Weak Trend Bearish', 'Linear Volume MACD, strong/weak trend mode is bearish {{exchange}}:{{ticker}}'],
      ['alert4', 'Linear Volume MACD - Volume MACD Bull', 'Linear Volume MACD, volume MACD mode is bullish {{exchange}}:{{ticker}}'],
      ['alert5', 'Linear Volume MACD - Volume MACD Bearish', 'Linear Volume MACD, volume MACD mode is bearish {{exchange}}:{{ticker}}'],
    ]);
    expect(lvm.LinearVolumeMacdLyroRs.alertConditions).toBe(lvm.alertConditions);
    const modes = ['Linear Regression', 'Strong/Weak Trend', 'Volume MACD'] as const;
    modes.forEach((sigType, m) => {
      const r = lvm.calculate(bars, { sigType });
      const h = vals(r.plots.plot1 as { value: number }[]);
      let st = 0;
      const state = h.map((v, i) => {
        if (m === 0) { if (gt(v, 0)) st = 1; if (lt(v, 0)) st = -1; }
        else if (m === 1) st = i > 0 && lt(h[i - 1], v) ? 1 : -1;
        else if (ge(v, 0)) st = 1;
        else if (!isNaN(v) && !gt(v, 0)) st = -1;
        return st;
      });
      for (let k = 0; k < 3; k++) {
        const bull = k === m ? state.map((s) => s === 1) : bars.map(() => false);
        const bear = k === m ? state.map((s) => s === -1) : bars.map(() => false);
        if (k === m) expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
        expect(r.alerts[2 * k].times, `${sigType} alert${2 * k}`).toEqual(timeAt(bars, bull));
        expect(r.alerts[2 * k + 1].times, `${sigType} alert${2 * k + 1}`).toEqual(timeAt(bars, bear));
      }
    });
  });
  it('gives the bgcolor and barcolor ids', () => {
    const r = lvm.calculate(bars);
    expect(r.barColors.length).toBeGreaterThan(0);
    expect(r.barColors.every((c) => c.id === 'barcolor0')).toBe(true);
    expect(r.bgColors.length).toBeGreaterThan(0);
    expect(r.bgColors.filter((c) => !c.forceOverlay).every((c) => c.id === 'bgcolor0')).toBe(true);
    expect(r.bgColors.filter((c) => c.forceOverlay).every((c) => c.id === 'bgcolor1')).toBe(true);
    expect(idTimes(r.bgColors, 'bgcolor0')).toEqual(idTimes(r.bgColors, 'bgcolor1'));
  });
});

describe('linereg-candles-with-hma-filter', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(aiLinreg)).toEqual([
      ['alert0', 'Buy Alert', 'LinReg Candles: Buy signal generated'],
      ['alert1', 'Sell Alert', 'LinReg Candles: Sell signal generated'],
      ['alert2', 'Bullish Divergence Alert', 'LinReg Candles: Bullish divergence detected'],
      ['alert3', 'Bearish Divergence Alert', 'LinReg Candles: Bearish divergence detected'],
    ]);
    expect(aiLinreg.AdvancedLinRegCandles.alertConditions).toBe(aiLinreg.alertConditions);
  });
  it('fires the buy / sell alerts with the re-arm bars, the divergence alerts with the markers', () => {
    for (const alertRearmBars of [2, 40]) {
      const r = aiLinreg.calculate(bars, { divergenceDetection: true, alertRearmBars });
      // buy / sell signals: the markers of the Buy / Sell Signal plotshapes; var last_*_alert_bar = 0
      const idx = (id: string) => idTimes(r.markers, id).map((t) => bars.findIndex((b) => b.time === t));
      const rearm = (sig: number[]) => {
        let last = 0;
        return sig.filter((i) => (i - last >= alertRearmBars ? ((last = i), true) : false)).map((i) => bars[i].time);
      };
      expect(idx('shape0').length).toBeGreaterThan(5);
      expect(r.alerts[0].times).toEqual(rearm(idx('shape0')));
      expect(r.alerts[1].times).toEqual(rearm(idx('shape1')));
      if (alertRearmBars === 40) expect(r.alerts[0].times.length).toBeLessThan(idx('shape0').length);
      expect(idTimes(r.markers, 'shape2').length + idTimes(r.markers, 'shape3').length).toBeGreaterThan(0);
      expect(r.alerts[2].times).toEqual(idTimes(r.markers, 'shape2'));
      expect(r.alerts[3].times).toEqual(idTimes(r.markers, 'shape3'));
    }
    const off = aiLinreg.calculate(bars, { divergenceDetection: true, alertEnabled: false });
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
    expect(aiLinreg.calculate(bars).alerts[2].times).toEqual([]);
  });
  it('gives the plotshape ids', () => {
    const r = aiLinreg.calculate(bars, { divergenceDetection: true });
    const look: Record<string, [string, string]> = { shape0: ['buy', 'circle'], shape1: ['sell', 'cross'], shape2: ['⋓', 'circle'], shape3: ['⋒', 'circle'] };
    expect(r.markers.every((m) => look[m.id as string]?.[0] === m.text && look[m.id as string][1] === m.shape)).toBe(true);
  });
});

describe('liquid-reversal-bands', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(lrb)).toEqual([
      ['alert0', 'Buy Signal', 'Uptrick LRB: Close crossed above lower band'],
      ['alert1', 'Sell Signal', 'Uptrick LRB: Close crossed below upper band'],
    ]);
    expect(lrb.LiquidReversalBands.alertConditions).toBe(lrb.alertConditions);
    for (const cooldownBars of [0, 15]) {
      const r = lrb.calculate(bars, { cooldownBars });
      const up = vals(r.plots.plot0 as { value: number }[]), lo = vals(r.plots.plot1 as { value: number }[]);
      // rawBuy = close[1] <= lowerBand[1] and close > lowerBand; barsOk = na(lastSignalBar) or bar_index - last >= cooldown
      let last = NaN;
      const buy: boolean[] = [], sell: boolean[] = [];
      bars.forEach((_, i) => {
        const rawBuy = i > 0 && close[i - 1] <= lo[i - 1] + EPS && gt(close[i], lo[i]);
        const rawSell = i > 0 && close[i - 1] >= up[i - 1] - EPS && lt(close[i], up[i]);
        const ok = isNaN(last) || i - last >= cooldownBars;
        buy.push(rawBuy && ok);
        sell.push(rawSell && ok);
        if (rawBuy && ok) last = i;
        if (rawSell && ok) last = i;
      });
      expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
      expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
      expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
      expect(r.markers.filter((m) => m.shape === 'labelUp').map((m) => m.time)).toEqual(r.alerts[0].times);
    }
  });
});
