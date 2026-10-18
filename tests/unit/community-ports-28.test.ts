/**
 * Community ports, batch 28: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls of Precision
 * Sniper, and the Style ids on the emitted markers / arrows.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as pro from '../../src/community/percentile-rank-oscillator';
import * as perfectRsi from '../../src/community/perfect-rsi';
import * as phil from '../../src/community/philakone-ema-swing';
import * as pbhl from '../../src/community/pivot-breakout-high-low-signals';
import * as hhll from '../../src/community/pivot-hh-hl-lh-ll';
import * as hilo from '../../src/community/pivot-hilo-support-n-resistance-levels-r3-3';
import * as posc from '../../src/community/pivot-oscillator';
import * as ppst from '../../src/community/pivot-point-supertrend';
import * as ptl from '../../src/community/pivot-trendlines-with-breaks';
import * as pmaxT3 from '../../src/community/pmax-on-rsi-with-tillson-t3';
import * as pmaxRsi from '../../src/community/pmax-rsi-t3';
import * as pocket from '../../src/community/pocket-pivot-breakout';
import * as poly from '../../src/community/polyfilter';
import * as ptex from '../../src/community/polynomial-trend-exhaustion-divergence';
import * as ppo from '../../src/community/ppo-divergence';
import * as sniper from '../../src/community/precision-sniper';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

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
const open = bars.map((b) => b.open);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
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
const or = (a: boolean[], b: boolean[]) => a.map((v, i) => v || b[i]);
/** ta.ema with an SMA seed (the first `len` values without na) */
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
/** ta.rma with an SMA seed */
function rma(src: number[], len: number): number[] {
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(prev)) {
      let s = 0, ok = i >= len - 1;
      for (let k = i - len + 1; ok && k <= i; k++) { if (isNaN(src[k])) ok = false; else s += src[k]; }
      prev = ok ? s / len : NaN;
    } else {
      prev = (prev * (len - 1) + src[i]) / len;
    }
    out.push(prev);
  }
  return out;
}
/** ta.rsi: RMA of the gains / losses */
function rsi(src: number[], len: number): number[] {
  const up = src.map((v, i) => (i > 0 ? Math.max(v - src[i - 1], 0) : NaN));
  const dn = src.map((v, i) => (i > 0 ? Math.max(src[i - 1] - v, 0) : NaN));
  const u = rma(up, len), d = rma(dn, len);
  return u.map((x, i) => (isNaN(x) || isNaN(d[i]) ? NaN : d[i] === 0 ? 100 : x === 0 ? 0 : 100 - 100 / (1 + x / d[i])));
}
/** ta.atr: RMA of the true range */
const trueRange = (list: Bar[]) => list.map((b, i) => (i === 0 ? b.high - b.low
  : Math.max(b.high - b.low, Math.abs(b.high - list[i - 1].close), Math.abs(b.low - list[i - 1].close))));
/** ta.pivothigh / ta.pivotlow (strict on both sides): the value of bar i - right, on bar i */
const pivotHigh = (src: number[], left: number, right: number) => src.map((_, i) => {
  const c = i - right;
  if (c - left < 0) return NaN;
  for (let k = c - left; k <= i; k++) if (k !== c && !(src[c] > src[k])) return NaN;
  return src[c];
});
const pivotLow = (src: number[], left: number, right: number) => src.map((_, i) => {
  const c = i - right;
  if (c - left < 0) return NaN;
  for (let k = c - left; k <= i; k++) if (k !== c && !(src[c] < src[k])) return NaN;
  return src[c];
});

describe('percentile-rank-oscillator', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(pro)).toEqual([
      ['alert0', 'Price Percentile TOP', 'Price percentile reached TOP threshold'],
      ['alert1', 'Price Percentile BOTTOM', 'Price percentile reached BOTTOM threshold'],
      ['alert2', 'VWMA Percentile TOP', 'VWMA percentile reached TOP threshold'],
      ['alert3', 'VWMA Percentile BOTTOM', 'VWMA percentile reached BOTTOM threshold'],
      ['alert4', 'Confluence TOP', 'Price & VWMA percentiles both at TOP extreme'],
      ['alert5', 'Confluence BOTTOM', 'Price & VWMA percentiles both at BOTTOM extreme'],
    ]);
    expect(pro.PercentileRankOscillator.alertConditions).toBe(pro.alertConditions);
    const len = 100;
    const nz = (v: number) => (isNaN(v) ? 0 : v);
    // percentile rank of the current value among the last min(len, bar_index + 1) values (less + half the equal ones)
    const pct = (src: number[]) => src.map((_, i) => {
      const avail = Math.min(len, i + 1);
      const cur = nz(src[i]);
      let less = 0, equal = 0;
      for (let k = 0; k < avail; k++) {
        const v = nz(src[i - k]);
        if (lt(v, cur)) less++;
        else if (Math.abs(v - cur) <= EPS) equal++;
      }
      return ((less + 0.5 * equal) / avail) * 100;
    });
    const mid = bars.map((b) => (b.high + b.low) / 2);
    const vol = bars.map((b) => b.volume as number);
    const vwma = mid.map((_, i) => {
      if (i < len - 1) return NaN;
      let a = 0, v = 0;
      for (let k = i - len + 1; k <= i; k++) { a += mid[k] * vol[k]; v += vol[k]; }
      return a / v;
    });
    const p = pct(mid);
    const w = pct(mid.map((m, i) => m - vwma[i]));
    const pTop = p.map((x) => ge(x, 95)), pBot = p.map((x) => le(x, 5));
    const wTop = w.map((x) => ge(x, 95)), wBot = w.map((x) => le(x, 5));
    const flags = [pTop, pBot, wTop, wBot, pTop.map((x, i) => x && wTop[i]), pBot.map((x, i) => x && wBot[i])];
    const r = pro.calculate(bars);
    flags.forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
    // the alert switches and the VWMA switch turn their conditions off
    const off = pro.calculate(bars, { alertsPrice: false, enableVwmaPct: false });
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
  });
});

describe('perfect-rsi', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(perfectRsi)).toEqual([
      ['alert0', 'RSI Oversold', 'RSI is oversold!'],
      ['alert1', 'RSI Overbought', 'RSI is overbought!'],
    ]);
    expect(perfectRsi.PerfectRsi.alertConditions).toBe(perfectRsi.alertConditions);
    const r = perfectRsi.calculate(bars);
    const line = vals(r.plots.plot0 as { value: number }[]);
    // RSI of the TSI of the close (EMA 10 then EMA 5 of the change, over the same of its absolute value)
    const pc = close.map((c, i) => (i > 0 ? c - close[i - 1] : NaN));
    const num = ema(ema(pc, 10), 5), den = ema(ema(pc.map(Math.abs), 10), 5);
    const rsiTsi = rsi(num.map((v, i) => 100 * (v / den[i])), 5);
    const k = 0.972741476 - 0.95;
    const ob = line.map((v, i) => gt(v, Math.max(70 - Math.abs(v - rsiTsi[i]) * k, 0)));
    const os = line.map((v, i) => lt(v, Math.min(30 + Math.abs(v - rsiTsi[i]) * k, 100)));
    [os, ob].forEach((f, j) => {
      expect(f.some(Boolean), `alert${j}`).toBe(true);
      expect(r.alerts[j].times, `alert${j}`).toEqual(timeAt(bars, f));
    });
  });
});

describe('philakone-ema-swing', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(phil)).toEqual([
      ['alert0', 'Buy Condition', 'Buy Condition Alert'],
      ['alert1', 'Sell Condition', 'Sell Condition Alert'],
    ]);
    expect(phil.PhilakoneEMASwing.alertConditions).toBe(phil.alertConditions);
    const [m8, m13, m21, m55] = [8, 13, 21, 55].map((l) => ema(close, l));
    const cross = or(xover(m21, m55), xunder(m21, m55));
    const buy = cross.map((c, i) => c && m8[i] > m13[i] && m21[i] > m55[i]);
    const sell = cross.map((c, i) => c && m8[i] < m13[i] && m21[i] < m55[i]);
    const r = phil.calculate(bars);
    [buy, sell].forEach((f, j) => {
      expect(f.some(Boolean), `alert${j}`).toBe(true);
      expect(r.alerts[j].times, `alert${j}`).toEqual(timeAt(bars, f));
    });
  });
});

describe('pivot-breakout-high-low-signals', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(pbhl)).toEqual([
      ['alert0', 'Buy Alert', 'Pivot Breakout Retest BUY'],
      ['alert1', 'Sell Alert', 'Pivot Breakout Retest SELL'],
      ['alert2', 'Bullish Pivot Breakout', '🟢 [JPT] Bullish Pivot Breakout detected.\nPrice has broken above the previous Pivot High.'],
      ['alert3', 'Bearish Pivot Breakout', '🔴 [JPT] Bearish Pivot Breakout detected.\nPrice has broken below the previous Pivot Low.'],
      ['alert4', 'Bullish Retest Confirmed', '🟢 [JPT] Bullish Retest confirmed.\nPrice successfully retested the breakout level.'],
      ['alert5', 'Bearish Retest Confirmed', '🔴 [JPT] Bearish Retest confirmed.\nPrice successfully retested the breakout level.'],
      ['alert6', 'BUY Signal', '🚀 [JPT] BUY Signal\nPivot Breakout + Retest + EMA confirmation.'],
      ['alert7', 'SELL Signal', '📉 [JPT] SELL Signal\nPivot Breakdown + Retest + EMA confirmation.'],
      ['alert8', 'Bullish Trend Change', '📈 [JPT] Price crossed ABOVE the EMA.\nBullish trend bias detected.'],
      ['alert9', 'Bearish Trend Change', '📉 [JPT] Price crossed BELOW the EMA.\nBearish trend bias detected.'],
      ['alert10', 'New Pivot High', '🔺 [JPT] New Pivot High confirmed.'],
      ['alert11', 'New Pivot Low', '🔻 [JPT] New Pivot Low confirmed.'],
    ]);
    expect(pbhl.PivotBreakoutHighLowSignals.alertConditions).toBe(pbhl.alertConditions);
    for (const emaFilter of [true, false]) {
      const tol = 0.003;
      const e = ema(close, 200);
      const ph = pivotHigh(high, 5, 5), pl = pivotLow(low, 5, 5);
      let lastH = NaN, lastL = NaN, bullLevel = NaN, bearLevel = NaN, waitBull = false, waitBear = false;
      const lh: number[] = [], ll: number[] = [];
      const f: boolean[][] = Array.from({ length: 6 }, () => []);
      bars.forEach((b, i) => {
        if (!isNaN(ph[i])) lastH = ph[i];
        if (!isNaN(pl[i])) lastL = pl[i];
        lh.push(lastH); ll.push(lastL);
        const bullBo = i > 0 && b.close > lastH && close[i - 1] <= lh[i - 1];
        const bearBo = i > 0 && b.close < lastL && close[i - 1] >= ll[i - 1];
        if (bullBo) { bullLevel = lastH; waitBull = true; }
        if (bearBo) { bearLevel = lastL; waitBear = true; }
        const bullRt = waitBull && le(b.low, bullLevel * (1 + tol)) && ge(b.low, bullLevel * (1 - tol)) && gt(b.close, bullLevel);
        const bearRt = waitBear && ge(b.high, bearLevel * (1 - tol)) && le(b.high, bearLevel * (1 + tol)) && lt(b.close, bearLevel);
        const buy = bullRt && (!emaFilter || gt(b.close, e[i]));
        const sell = bearRt && (!emaFilter || lt(b.close, e[i]));
        if (buy) waitBull = false;
        if (sell) waitBear = false;
        [buy, sell, bullBo, bearBo, bullRt, bearRt].forEach((v, k) => f[k].push(v));
      });
      const flags = [
        f[0], f[1], f[2], f[3], f[4], f[5], f[0], f[1],
        xover(close, e).map((v) => v && emaFilter), xunder(close, e).map((v) => v && emaFilter),
        ph.map((v) => !isNaN(v)), pl.map((v) => !isNaN(v)),
      ];
      const r = pbhl.calculate(bars, { emaFilter });
      flags.forEach((fl, k) => {
        if (emaFilter || (k !== 8 && k !== 9)) expect(fl.some(Boolean), `alert${k}`).toBe(true);
        expect(r.alerts[k].times, `alert${k} ${emaFilter}`).toEqual(timeAt(bars, fl));
      });
      // 'Enable Alerts' off: only 'Buy Alert' / 'Sell Alert' stay
      const off = pbhl.calculate(bars, { emaFilter, enableAlerts: false });
      expect(off.alerts.slice(0, 2).map((a) => a.times)).toEqual(r.alerts.slice(0, 2).map((a) => a.times));
      expect(off.alerts.slice(2).every((a) => a.times.length === 0)).toBe(true);
    }
  });
});

/** Fractal break of the last pivot levels: close beyond the level with the open at or inside it */
function fractalBreaks(pvtH: number[], pvtL: number[]) {
  const buy = bars.map((b, i) => gt(b.close, pvtH[i]) && le(b.open, pvtH[i]));
  const sell = bars.map((b, i) => lt(b.close, pvtL[i]) && ge(b.open, pvtL[i]));
  return { buy, sell };
}
/** The last value set on the bars where `at` is not na, carried forward */
const carry = (at: number[], value: (i: number) => number) => {
  let v = NaN;
  return at.map((x, i) => (isNaN(x) ? v : (v = value(i))));
};

describe('pivot-hh-hl-lh-ll', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(hhll)).toEqual([
      ['alert0', 'Fractal Break Arrow', 'Alert'],
      ['alert1', 'Fractal Break Long', 'Long'],
      ['alert2', 'Fractal Break Short', 'Short'],
    ]);
    expect(hhll.PivotHhHlLhLl.alertConditions).toBe(hhll.alertConditions);
    const pvtH = carry(pivotHigh(high, 4, 2), (i) => high[i - 2]);
    const pvtL = carry(pivotLow(low, 4, 2), (i) => low[i - 2]);
    const { buy, sell } = fractalBreaks(pvtH, pvtL);
    const r = hhll.calculate(bars);
    [or(buy, sell), buy, sell].forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
  });
});

describe('pivot-hilo-support-n-resistance-levels-r3-3', () => {
  // default lengths 5 / 5, printed one bar later (Shunt 1): pivot bar = 6 bars back
  const ph = pivotHigh(high, 5, 5).map((_, i, a) => (i > 0 ? a[i - 1] : NaN));
  const pl = pivotLow(low, 5, 5).map((_, i, a) => (i > 0 ? a[i - 1] : NaN));
  const pvtH = carry(ph, (i) => high[i - 6]);
  const pvtL = carry(pl, (i) => low[i - 6]);
  const { buy, sell } = fractalBreaks(pvtH, pvtL);
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(hilo)).toEqual([
      ['alert0', 'Fractal Break Arrow', 'Alert'],
      ['alert1', 'Fractal Break Long', 'Long'],
      ['alert2', 'Fractal Break Short', 'Short'],
      ['alert3', 'Any Swing', 'AnySwing'],
    ]);
    expect(hilo.PivotHiloSupportNResistanceLevelsR33.alertConditions).toBe(hilo.alertConditions);
    // anySwing: a pivot high / low different from the pivot before it (HH / LH / HL / LL)
    const swing = (piv: number[], src: number[]) => {
      const seen: number[] = [];
      return piv.map((p, i) => {
        if (isNaN(p)) return false;
        seen.push(src[i - 6]);
        const n = seen.length;
        return n > 1 && (lt(seen[n - 2], seen[n - 1]) || gt(seen[n - 2], seen[n - 1]));
      });
    };
    const any = or(swing(ph, high), swing(pl, low));
    const r = hilo.calculate(bars);
    [or(buy, sell), buy, sell, any].forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
  });
  it('gives the fractal break arrows as plotarrow outputs', () => {
    expect(hilo.calculate(bars).arrows).toEqual([]);
    const r = hilo.calculate(bars, { ShowFB: true });
    expect(idTimes(r.arrows, 'arrow0')).toEqual(timeAt(bars, buy));
    expect(idTimes(r.arrows, 'arrow1')).toEqual(timeAt(bars, sell));
    expect(r.arrows.every((a) => (a.id === 'arrow0' ? a.value === 1 : a.id === 'arrow1' && a.value === -1))).toBe(true);
    // no arrow markers are left
    expect(r.markers.some((m) => m.shape === 'arrowUp' || m.shape === 'arrowDown')).toBe(false);
  });
});

describe('pivot-oscillator', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(posc)).toEqual([
      ['alert0', 'Buy (Oversold)', 'Oscillator crossed above oversold.'],
      ['alert1', 'Sell (Overbought)', 'Oscillator crossed below overbought.'],
    ]);
    expect(posc.PivotOscillator.alertConditions).toBe(posc.alertConditions);
    const r = posc.calculate(bars);
    const osc = vals(r.plots.plot2 as { value: number }[]);
    [xover(osc, 30), xunder(osc, 70)].forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
  });
});

describe('pivot-point-supertrend', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(ppst)).toEqual([
      ['alert0', 'Buy Signal', 'Buy Signal'],
      ['alert1', 'Sell Signal', 'Sell Signal'],
      ['alert2', 'Trend Changed', 'Trend Changed'],
    ]);
    expect(ppst.PivotPointSupertrend.alertConditions).toBe(ppst.alertConditions);
    const ph = pivotHigh(high, 2, 2), pl = pivotLow(low, 2, 2);
    const atr = rma(trueRange(bars), 10);
    let center = NaN, tUp = NaN, tDown = NaN;
    const trend: number[] = [];
    bars.forEach((b, i) => {
      const lastpp = !isNaN(ph[i]) ? ph[i] : !isNaN(pl[i]) ? pl[i] : NaN;
      if (!isNaN(lastpp)) center = isNaN(center) ? lastpp : (center * 2 + lastpp) / 3;
      const up = center - 3 * atr[i], dn = center + 3 * atr[i];
      const c1 = i > 0 ? close[i - 1] : NaN;
      const nUp = c1 > tUp ? Math.max(up, tUp) : up;
      const nDown = c1 < tDown ? Math.min(dn, tDown) : dn;
      trend.push(b.close > tDown ? 1 : b.close < tUp ? -1 : i > 0 ? trend[i - 1] : 1);
      tUp = nUp; tDown = nDown;
    });
    const buy = trend.map((t, i) => i > 0 && t === 1 && trend[i - 1] === -1);
    const sell = trend.map((t, i) => i > 0 && t === -1 && trend[i - 1] === 1);
    const r = ppst.calculate(bars);
    [buy, sell, or(buy, sell)].forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
    // the Buy / Sell labels are drawn on the same bars
    expect(r.markers.filter((m) => m.text === 'Buy').map((m) => m.time)).toEqual(r.alerts[0].times);
  });
});

describe('pivot-trendlines-with-breaks', () => {
  it('declares and fires the alertconditions of the original on the break bars', () => {
    expect(decls(ptl)).toEqual([
      ['alert0', 'Bearish Breakout', 'Alert Fired!'],
      ['alert1', 'Bullish Breakout', 'Alert Fired!'],
    ]);
    expect(ptl.PivotTrendlinesWithBreaks.alertConditions).toBe(ptl.alertConditions);
    for (const len of [5, 10, 20]) {
      const r = ptl.calculate(bars, { len });
      const bear = r.markers.filter((m) => m.shape === 'labelDown').map((m) => m.time);
      const bull = r.markers.filter((m) => m.shape === 'labelUp').map((m) => m.time);
      expect(bear.length + bull.length, String(len)).toBeGreaterThan(0);
      // ta.change(cu) and cu: the bar of each 'Br' label (the label is drawn when the line price is known)
      expect(r.alerts[0].times).toEqual(bear);
      expect(r.alerts[1].times).toEqual(bull);
    }
  });
});

describe('pmax-on-rsi-with-tillson-t3', () => {
  it('declares and fires the alertconditions of the original', () => {
    const expected = [
      ['alert0', 'Cross Alert', 'PMax - Moving Avg Crossing!'],
      ['alert1', 'Crossover Alarm', 'Moving Avg BUY SIGNAL!'],
      ['alert2', 'Crossunder Alarm', 'Moving Avg SELL SIGNAL!'],
      ['alert3', 'Price Cross Alert', 'PMax - Price Crossing!'],
      ['alert4', 'Price Crossover Alarm', 'PRICE OVER PMax - BUY SIGNAL!'],
      ['alert5', 'Price Crossunder Alarm', 'PRICE UNDER PMax - SELL SIGNAL!'],
    ];
    expect(decls(pmaxT3)).toEqual(expected);
    expect(decls(pmaxRsi)).toEqual(expected);
    expect(pmaxT3.PmaxOnRsiWithTillsonT3.alertConditions).toBe(pmaxT3.alertConditions);
    // the price (hl2, or close) is compared with PMax on the RSI scale: crafted bars around 50 make it cross
    const lowBars = bars.map((b) => ({ ...b, open: b.open / 2, high: b.high / 2, low: b.low / 2, close: b.close / 2 }));
    for (const list of [bars, lowBars]) {
      for (const src of ['hl2', 'close'] as const) {
        const r = pmaxT3.calculate(list, { src });
        const t3 = vals(r.plots.plot1 as { value: number }[]);
        const pm = vals(r.plots.plot2 as { value: number }[]);
        const s = list.map((b) => (src === 'hl2' ? (b.high + b.low) / 2 : b.close));
        const flags = [or(xover(t3, pm), xunder(t3, pm)), xover(t3, pm), xunder(t3, pm), or(xover(s, pm), xunder(s, pm)), xover(s, pm), xunder(s, pm)];
        flags.forEach((f, k) => {
          if (k < 3 || list === lowBars) expect(f.some(Boolean), `alert${k}`).toBe(true);
          expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(list, f));
        });
      }
    }
  });
});

describe('pmax-rsi-t3', () => {
  it('fires the alertconditions of the original on the drawn T3 / PMax lines', () => {
    expect(pmaxRsi.PMaxRSIT3.alertConditions).toBe(pmaxRsi.alertConditions);
    const lowBars = bars.map((b) => ({ ...b, open: b.open / 2, high: b.high / 2, low: b.low / 2, close: b.close / 2 }));
    for (const list of [bars, lowBars]) {
      const r = pmaxRsi.calculate(list);
      const t3 = vals(r.plots.plot0 as { value: number }[]);
      const pm = vals(r.plots.plot1 as { value: number }[]);
      const s = list.map((b) => (b.high + b.low) / 2);
      const flags = [or(xover(t3, pm), xunder(t3, pm)), xover(t3, pm), xunder(t3, pm), or(xover(s, pm), xunder(s, pm)), xover(s, pm), xunder(s, pm)];
      flags.forEach((f, k) => {
        if (k < 3 || list === lowBars) expect(f.some(Boolean), `alert${k}`).toBe(true);
        expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(list, f));
      });
      // the Buy / Sell markers are drawn on the T3 crosses
      expect(r.markers.filter((m) => m.text === 'Buy').map((m) => m.time)).toEqual(r.alerts[1].times);
    }
  });
});

describe('pocket-pivot-breakout', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(pocket)).toEqual([
      ['alert0', 'Pocket Pivot Breakout Alert', 'Pocket Pivot Breakout Alert'],
      ['alert1', 'Gap-Up Alert', 'Gap-Up Alert'],
    ]);
    expect(pocket.PocketPivotBreakout.alertConditions).toBe(pocket.alertConditions);
    // gaps and large green bodies: every 37th bar opens above the high before it and closes 4% higher
    const list = bars.map((b) => ({ ...b }));
    for (let i = 37; i < list.length; i += 37) {
      const o = list[i - 1].high * 1.01;
      list[i] = { ...list[i], open: o, low: o, close: o * 1.04, high: o * 1.05, volume: 2e7 };
    }
    const vol = list.map((b) => b.volume as number);
    const pp = list.map((b, i) => {
      const green = gt(b.close, b.open) && gt(((b.close - b.open) / b.close) * 100, 3);
      let chk = 0;
      for (let k = 1; k <= 10; k++) {
        const p = list[i - k];
        const v = p === undefined ? NaN : gt(p.close, p.open) ? 0 : (p.volume as number);
        if (lt(vol[i], v)) chk++;
      }
      return chk < 1 && green;
    });
    const gap = list.map((b, i) => i > 0 && gt(b.low, list[i - 1].high) && gt(((b.low - list[i - 1].high) / b.low) * 100, 0.5));
    const r = pocket.calculate(list, { gapcandle: true });
    [pp, gap].forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(list, f));
    });
    // gapup includes the 'Gap-up Bar' input, as in the original
    expect(pocket.calculate(list).alerts[1].times).toEqual([]);
  });
});

describe('polyfilter', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(poly)).toEqual([
      ['alert0', 'PolyFilter Trend Up', 'PolyFilter Trend Up - {{ticker}} - {{interval}}'],
      ['alert1', 'PolyFilter Trend Down', 'PolyFilter Trend Down - {{ticker}} - {{interval}}'],
      ['alert2', 'PolyFilter Above Price', 'PolyFilter Above Price - {{ticker}} - {{interval}}'],
      ['alert3', 'PolyFilter Below Price', 'PolyFilter Below Price - {{ticker}} - {{interval}}'],
    ]);
    expect(poly.PolyFilter.alertConditions).toBe(poly.alertConditions);
    // Ehlers 2-pole super smoother of hlc3, length 83
    const src = bars.map((b) => (b.high + b.low + b.close) / 3);
    const arg = (1.414 * 3.14159) / 83;
    const a1 = Math.exp(-arg), c2 = 2 * a1 * Math.cos(arg), c3 = -a1 * a1, c1 = 1 - c2 - c3;
    const f: number[] = [];
    src.forEach((s, i) => f.push((c1 * (s + (i > 0 ? src[i - 1] : 0))) / 2 + c2 * (i > 0 ? f[i - 1] : 0) + c3 * (i > 1 ? f[i - 2] : 0)));
    const prev = f.map((_, i) => (i > 0 ? f[i - 1] : NaN));
    const flags = [xover(f, prev), xunder(f, prev), xover(f, src), xunder(f, src)];
    const r = poly.calculate(bars);
    flags.forEach((fl, k) => {
      expect(fl.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, fl));
    });
  });
});

describe('polynomial-trend-exhaustion-divergence', () => {
  const ids = ['shape0', 'shape1', 'shape2', 'shape3'];
  it('declares the alertconditions of the original and fires them on the signal bars', () => {
    expect(decls(ptex)).toEqual([
      ['alert0', 'Bull Exhaustion', 'Exhaustion+Div → Bull Exhaustion Warning'],
      ['alert1', 'Bear Exhaustion', 'Exhaustion+Div → Bear Exhaustion Warning'],
      ['alert2', 'Bullish Divergence', 'Exhaustion+Div → Bullish Divergence'],
      ['alert3', 'Bearish Divergence', 'Exhaustion+Div → Bearish Divergence'],
    ]);
    expect(ptex.PolynomialTrendExhaustionDivergence.alertConditions).toBe(ptex.alertConditions);
    const r = ptex.calculate(bars);
    ids.forEach((id, k) => {
      // plotshape(cond ? price : na): the marker of each signal bar (the price is known after the ATR warm-up)
      const t = idTimes(r.markers, id);
      expect(t.length, id).toBeGreaterThan(0);
      expect(r.alerts[k].times.filter((x) => x >= (t[0] as number))).toEqual(t);
    });
    // the 'Show' inputs gate the conditions as in the original
    const off = ptex.calculate(bars, { showExhaustion: false, showDivergence: false });
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
  });
  it('gives the plotshape ids on every marker', () => {
    const r = ptex.calculate(bars);
    expect(r.markers.length).toBeGreaterThan(0);
    expect(r.markers.every((m) => ids.includes(m.id as string))).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape2').every((m) => m.shape === 'labelUp' && m.text === 'DIV')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape1').every((m) => m.shape === 'xcross')).toBe(true);
  });
});

describe('ppo-divergence', () => {
  it('has no alertconditions (the original declares none)', () => {
    expect('alertConditions' in ppo).toBe(false);
  });
});

describe('precision-sniper', () => {
  const list = walk(1500, 11);
  const chart = { tickerid: 'NASDAQ:AAPL', timeframe: '1D', lastBarConfirmed: true };
  it('declares the alertconditions of the original', () => {
    expect(decls(sniper)).toEqual([
      ['alert0', 'Buy Signal', 'Confirmed BUY {{ticker}} {{interval}} at {{close}}'],
      ['alert1', 'Sell Signal', 'Confirmed SELL {{ticker}} {{interval}} at {{close}}'],
      ['alert2', 'Buy A+ only', 'BUY A+ {{ticker}} {{interval}}'],
      ['alert3', 'Sell A+ only', 'SELL A+ {{ticker}} {{interval}}'],
      ['alert4', 'Buy A+ and A', 'BUY A+/A {{ticker}} {{interval}}'],
      ['alert5', 'Sell A+ and A', 'SELL A+/A {{ticker}} {{interval}}'],
      ['alert6', 'Buy B or better', 'BUY B+ {{ticker}} {{interval}}'],
      ['alert7', 'Sell B or better', 'SELL B+ {{ticker}} {{interval}}'],
      ['alert8', 'TP1 Hit', 'Model TP1 {{ticker}} {{interval}} (bar close {{close}} is not fill price)'],
      ['alert9', 'TP2 Hit', 'Model TP2 {{ticker}} {{interval}}'],
      ['alert10', 'TP3 Hit', 'Model TP3 {{ticker}} {{interval}}'],
      ['alert11', 'Stop Hit', 'Model stop exit {{ticker}} {{interval}}'],
      ['alert12', 'Position Closed', 'Model position closed {{ticker}} {{interval}}'],
      ['alert13', 'Stop Changed', 'Model stop changed for NEXT bar {{ticker}} {{interval}}'],
      ['alert14', 'Candidate Cancelled', 'Candidate expired/cancelled {{ticker}} {{interval}}'],
      ['alert15', 'Any Signal', 'Confirmed entry {{ticker}} {{interval}}'],
    ]);
    expect(sniper.PrecisionSniper.alertConditions).toBe(sniper.alertConditions);
    expect(sniper.hasAlertFunction).toBe(true);
    expect(sniper.PrecisionSniper.hasAlertFunction).toBe(true);
  });
  it('fires the entry conditions on the entry labels, by grade', () => {
    const r = sniper.calculate(list, { hideC: false, gradeFilter: 'All', confirmWindow: 0 }, chart);
    const entries = r.labels.filter((l) => /^(Long|Short) (A\+|A|B|C)$/.test(l.text));
    const of = (re: RegExp) => entries.filter((l) => re.test(l.text)).map((l) => l.time);
    const t = (k: number) => r.alerts[k].times;
    expect(t(0).length + t(1).length).toBeGreaterThan(1);
    expect(t(0)).toEqual(of(/^Long/));
    expect(t(1)).toEqual(of(/^Short/));
    expect(t(2)).toEqual(of(/^Long A\+$/));
    expect(t(3)).toEqual(of(/^Short A\+$/));
    expect(t(4)).toEqual(of(/^Long (A\+|A)$/));
    expect(t(5)).toEqual(of(/^Short (A\+|A)$/));
    expect(t(6)).toEqual(of(/^Long (A\+|A|B)$/));
    expect(t(7)).toEqual(of(/^Short (A\+|A|B)$/));
    expect(t(15)).toEqual([...t(0), ...t(1)].sort((a, b) => a - b));
    // exits: a stop exit closes the position; every exit label is a 'Position Closed' bar
    const exits = r.labels.filter((l) => /^(SL|Step stop|TP3|Reversal|Date end) -?[\d.]+R$/.test(l.text)).map((l) => l.time);
    expect(t(12)).toEqual(exits);
    expect(t(11).every((x) => t(12).includes(x))).toBe(true);
    expect(t(12).length).toBeGreaterThan(0);
    expect(t(13).length).toBeGreaterThan(0);
    expect(t(8).length).toBeGreaterThan(0);
    expect(t(14).length).toBeGreaterThan(0);
  });
  it('makes one alert() batch per closed bar with events, as text lines or JSON', () => {
    const inputs = { hideC: false, gradeFilter: 'All' as const, confirmWindow: 0, alertCandidate: true };
    const r = sniper.calculate(list, inputs, chart);
    expect(r.alertCalls.length).toBeGreaterThan(0);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    const t = (k: number) => r.alerts[k].times;
    // event bars: entries, targets, stop changes, exits, cancelled candidates
    const eventBars = [...new Set([...t(15), ...t(8), ...t(9), ...t(10), ...t(12), ...t(13), ...t(14)])].sort((a, b) => a - b);
    expect(r.alertCalls.map((c) => c.time)).toEqual(eventBars);
    const kinds = new Set<string>();
    for (const c of r.alertCalls) {
      for (const line of c.message.split('\n')) {
        const trade = /^NASDAQ:AAPL \| 1D \| (Long|Short) \| (entry|tp1_hit|tp2_hit|tp3_hit|stop_changed|exit) \| Level [\d.]+ \| Stop [\d.]+ \| Remaining [\d.]+% \| Model net -?[\d.]+R \| [^|]* \| \d{4}-\d\d-\d\d \d\d:\d\d$/.exec(line);
        const cand = /^NASDAQ:AAPL \| 1D \| (Long|Short) candidate cancelled \| .+$/.test(line);
        expect(trade !== null || cand, line).toBe(true);
        kinds.add(trade ? trade[2] : 'candidate');
      }
    }
    expect([...kinds].sort()).toEqual(['candidate', 'entry', 'exit', 'stop_changed', 'tp1_hit', 'tp2_hit', 'tp3_hit'].filter((k) => kinds.has(k)).sort());
    expect(kinds.has('entry') && kinds.has('exit') && kinds.has('candidate')).toBe(true);
    // entry lines on the entry bars
    const entryCalls = r.alertCalls.filter((c) => / \| entry \| /.test(c.message)).map((c) => c.time);
    expect(entryCalls).toEqual(t(15));
    // JSON batch: the same events, schema 2
    const j = sniper.calculate(list, { ...inputs, webhookInput: true }, chart);
    expect(j.alertCalls.map((c) => c.time)).toEqual(r.alertCalls.map((c) => c.time));
    j.alertCalls.forEach((c, k) => {
      const payload = JSON.parse(c.message);
      expect(payload).toMatchObject({ schema_version: 2, script_version: '2.1.0', instance: 'main', ticker: 'NASDAQ:AAPL', tf: '1D' });
      expect(payload.events.length).toBe(r.alertCalls[k].message.split('\n').length);
      for (const e of payload.events) {
        if (e.event_type === 'candidate_cancelled') expect(e.candidate_id).toMatch(/^main:NASDAQ:AAPL:1D:\d+$/);
        else expect(e.event_id).toBe(`${e.trade_id}:${e.time_close}:${e.event_type}`);
      }
    });
    // the event switches: no entry / exit lines
    const quiet = sniper.calculate(list, { ...inputs, alertEntry: false, alertExit: false, alertTargets: false, alertStopMove: false, alertCandidate: false }, chart);
    expect(quiet.alertCalls).toEqual([]);
    expect(quiet.alerts.map((a) => a.times)).toEqual(r.alerts.map((a) => a.times));
  });
  it('makes no alert on the open last bar', () => {
    const r = sniper.calculate(list, { hideC: false, confirmWindow: 0 }, chart);
    const last = r.alertCalls[r.alertCalls.length - 1].time as number;
    const cut = list.slice(0, list.findIndex((b) => b.time === last) + 1);
    const open = sniper.calculate(cut, { hideC: false, confirmWindow: 0 }, { ...chart, lastBarConfirmed: false });
    expect(open.alertCalls.some((c) => c.time === last)).toBe(false);
    expect(open.alerts.every((a) => !a.times.includes(last))).toBe(true);
  });
});
