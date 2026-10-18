/**
 * Re-ports of 4 community indicators (reports batch 0): their outputs against the original's declarations (plots,
 * arrows, background / bar colours, hlines, alerts), the main series recomputed here from the original's formulas on a
 * seeded random walk, and the alert conditions / alert() calls.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as atrTrail from '../../src/community/atr-trailing-stops';
import * as boa from '../../src/community/binary-option-arrows';
import * as engulf from '../../src/community/bullish-engulfing-finder';
import * as bulls from '../../src/community/bulls-bears-control';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk with volatility regimes */
function walk(count: number, seed0: number, step = 86400): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const vol = Math.floor(i / 60) % 3 === 0 ? 0.3 : 1.5;
    const o = p + (rnd() - 0.5) * vol;
    p = Math.max(5, o + Math.sin(i / 17) * 0.8 * vol + (rnd() - 0.5) * 3 * vol);
    out.push({ time: 1577836800 + i * step, open: o, high: Math.max(o, p) + rnd() * vol, low: Math.min(o, p) - rnd() * vol, close: p, volume: 1e6 });
  }
  return out;
}
const bars = walk(1500, 7);
const vals = (pts: { value: number }[]) => pts.map((p) => p.value);
const timesOf = (flags: boolean[]) => bars.filter((_, i) => flags[i]).map((b) => b.time as number);
const norm = (c: string) => c.replace(/\s+/g, '').toLowerCase();
/** rgb part of '#rrggbb' or 'rgba(r,g,b,a)' */
const rgb = (c: string) => {
  const s = norm(c);
  if (s.startsWith('#')) return [1, 3, 5].map((k) => parseInt(s.slice(k, k + 2), 16)).join(',');
  return s.replace(/^rgba?\(/, '').split(',').slice(0, 3).join(',');
};
const expectSeries = (got: number[], want: number[]) => {
  expect(got.length).toBe(want.length);
  for (let i = 0; i < want.length; i++) {
    if (isNaN(want[i])) expect(got[i], `bar ${i}`).toBeNaN();
    else expect(got[i], `bar ${i}`).toBeCloseTo(want[i], 9);
  }
};

const STYLE: Record<number, string | undefined> = { 0: undefined, 1: 'histogram', 7: 'linebr' };

// ---------------------------------------------------------------------------------------------------------------
// ATR + Trailing Stops
// ---------------------------------------------------------------------------------------------------------------

function refMa(src: number[], len: number, mode: string): number[] {
  const n = src.length;
  const out = new Array<number>(n).fill(NaN);
  const smaAt = (i: number) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  };
  if (mode === 'SMA') return src.map((_, i) => smaAt(i));
  if (mode === 'WMA') {
    return src.map((_, i) => {
      if (i < len - 1) return NaN;
      let s = 0;
      let w = 0;
      for (let k = 0; k < len; k++) { s += src[i - k] * (len - k); w += len - k; }
      return s / w;
    });
  }
  const alpha = mode === 'EMA' ? 2 / (len + 1) : 1 / len;
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    prev = isNaN(prev) ? smaAt(i) : alpha * src[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/** The original line by line: f_trail, f_flip (with its var states), the plots and the alert conditions */
function refAtrTrail(list: Bar[], o: typeof atrTrail.defaultInputs) {
  const n = list.length;
  const tr = list.map((b, i) =>
    i === 0 ? NaN
      : Math.max(Math.abs(b.open - b.close), Math.abs(b.open - list[i - 1].close), Math.abs(b.close - list[i - 1].close)) * (o.bodyPercent / 100)
        + (b.high - Math.max(b.open, b.close) + Math.min(b.open, b.close) - b.low) * (o.wickPercent / 100));
  // tr is na only on bar 0: shift the MA by one bar so its window never holds the na
  const ma = [NaN, ...refMa(tr.slice(1), o.atrPeriod, o.smoothing)];
  const low = list.map((b, i) => b.low - ma[i] * o.atrMultiplier);
  const high = list.map((b, i) => b.high + ma[i] * o.atrMultiplier);
  const longSrc = list.map((b) => (o.flipOn === 'Close' ? b.close : b.high));
  const shortSrc = list.map((b) => (o.flipOn === 'Close' ? b.close : b.low));
  const longPlot: number[] = [];
  const shortPlot: number[] = [];
  let tl = NaN;
  let ts = NaN;
  const isLongH: (boolean | undefined)[] = [];
  const isShortH: (boolean | undefined)[] = [];
  for (let i = 0; i < n; i++) {
    tl = le(low[i], tl) ? tl : low[i];
    ts = ge(high[i], ts) ? ts : high[i];
    const l1 = i > 0 ? isLongH[i - 1] : undefined;
    const s1 = i > 0 ? isShortH[i - 1] : undefined;
    let fl = s1 === true && gt(longSrc[i], ts);
    let fs = l1 === true && lt(shortSrc[i], tl);
    const c = list[i].close;
    fl = fs && fl && gt(c, tl) ? true : fs && fl && le(c, tl) ? false : fl;
    fs = fl && fs && lt(c, ts) ? true : fs && fl && ge(c, ts) ? false : fs;
    const isLong = fl ? true : fs ? false : l1 === undefined ? true : l1;
    const isShort = fs ? true : fl ? false : s1 === undefined ? true : s1;
    isLongH.push(isLong);
    isShortH.push(isShort);
    if (isLong && l1 === false) tl = low[i];
    if (isShort && s1 === false) ts = high[i];
    longPlot.push(isLong ? tl : NaN);
    shortPlot.push(isShort ? ts : NaN);
  }
  const g = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const up = list.map((_, i) => gt(longSrc[i], g(shortPlot, i - 1)) && le(g(longSrc, i - 1), g(shortPlot, i - 2)));
  const down = list.map((_, i) => lt(shortSrc[i], g(longPlot, i - 1)) && ge(g(shortSrc, i - 1), g(longPlot, i - 2)));
  return { low, high, longPlot, shortPlot, up, down };
}

describe('atr-trailing-stops: ATR + Trailing Stops', () => {
  const spec = {
    plots: [
      ['Running ATR Low', 0, 'rgba(255,255,255,0.4)', 1],
      ['Running ATR High', 0, 'rgba(255,255,255,0.4)', 1],
      ['Trailing ATR Long Stop', 7, 'rgba(49,27,146,0.5)', 3],
      ['Trailing ATR Long Stop Highlight', 7, '#00897B', 1],
      ['Trailing ATR Short Stop', 7, 'rgba(136,14,79,0.5)', 3],
      ['Trailing ATR Short Stop Highlight', 7, '#FF5252', 1],
    ] as const,
  };

  it('declares the original plots, inputs and alerts', () => {
    expect(atrTrail.plotConfig.map((p) => [p.title, p.style, norm(p.color), p.lineWidth])).toEqual(
      spec.plots.map(([t, s, c, w]) => [t, STYLE[s], norm(c), w]));
    expect(atrTrail.plotConfig.map((p) => p.id)).toEqual(['plot0', 'plot1', 'plot2', 'plot3', 'plot4', 'plot5']);
    expect(atrTrail.metadata).toEqual({ title: 'ATR + Trailing Stops', shortTitle: 'ATR Trail', overlay: true });
    expect(atrTrail.inputConfig.map((i) => [i.id, i.title, i.defval])).toEqual([
      ['atrPeriod', 'ATR Lookback Period', 14],
      ['atrMultiplier', 'ATR Multiplier', 3],
      ['trailMode', 'Trail Mode', 'Trailing'],
      ['flipOn', 'Flip Trail on:', 'Close'],
      ['bodyPercent', 'Percentage of Body to Include', 100],
      ['wickPercent', 'Percentage of Wick to Include', 100],
      ['smoothing', 'ATR Smoothing Mode', 'RMA'],
    ]);
    expect(atrTrail.alertConditions.map((d) => [d.id, d.title, d.message])).toEqual([
      ['alert0', 'Long: Price crossed ATR up', 'Price crossed the trailing ATR short stop (bullish)'],
      ['alert1', 'Short: Price crossed ATR down', 'Price crossed trailing ATR long stop (bearish)'],
    ]);
  });

  it('trailing stops and alerts at the defaults match the original', () => {
    const r = atrTrail.calculate(bars);
    const ref = refAtrTrail(bars, atrTrail.defaultInputs);
    expectSeries(vals(r.plots.plot0), bars.map(() => NaN));
    expectSeries(vals(r.plots.plot1), bars.map(() => NaN));
    expectSeries(vals(r.plots.plot2), ref.longPlot);
    expectSeries(vals(r.plots.plot3), ref.longPlot);
    expectSeries(vals(r.plots.plot4), ref.shortPlot);
    expectSeries(vals(r.plots.plot5), ref.shortPlot);
    // both stops until the first flip, then one side at a time; flips happen
    const both = ref.longPlot.filter((v, i) => !isNaN(v) && !isNaN(ref.shortPlot[i])).length;
    expect(both).toBeGreaterThan(0);
    expect(ref.longPlot.filter((v, i) => !isNaN(v) && isNaN(ref.shortPlot[i])).length).toBeGreaterThan(100);
    expect(ref.shortPlot.filter((v, i) => !isNaN(v) && isNaN(ref.longPlot[i])).length).toBeGreaterThan(100);
    expect(r.alerts.map((a) => a.times)).toEqual([timesOf(ref.up), timesOf(ref.down)]);
    expect(r.alerts[0].times.length).toBeGreaterThan(5);
    expect(r.alerts[1].times.length).toBeGreaterThan(5);
  });

  it('long stop only rises while long, short stop only falls while short', () => {
    const r = atrTrail.calculate(bars);
    const l = vals(r.plots.plot2);
    const s = vals(r.plots.plot4);
    for (let i = 1; i < l.length; i++) {
      if (!isNaN(l[i]) && !isNaN(l[i - 1])) expect(l[i]).toBeGreaterThanOrEqual(l[i - 1] - 1e-9);
      if (!isNaN(s[i]) && !isNaN(s[i - 1])) expect(s[i]).toBeLessThanOrEqual(s[i - 1] + 1e-9);
    }
  });

  for (const o of [
    { trailMode: 'Running' as const },
    { smoothing: 'SMA' as const, atrPeriod: 10 },
    { smoothing: 'EMA' as const, atrMultiplier: 2.4 },
    { smoothing: 'WMA' as const, flipOn: 'Wick' as const },
    { bodyPercent: 150, wickPercent: 30, flipOn: 'Wick' as const },
  ]) {
    it(`matches the original with ${JSON.stringify(o)}`, () => {
      const cfg = { ...atrTrail.defaultInputs, ...o };
      const r = atrTrail.calculate(bars, o);
      const ref = refAtrTrail(bars, cfg);
      const run = cfg.trailMode === 'Running';
      const na = bars.map(() => NaN);
      expectSeries(vals(r.plots.plot0), run ? ref.low : na);
      expectSeries(vals(r.plots.plot1), run ? ref.high : na);
      expectSeries(vals(r.plots.plot2), run ? na : ref.longPlot);
      expectSeries(vals(r.plots.plot5), run ? na : ref.shortPlot);
      // the alerts use the trailing plots in both modes
      expect(r.alerts.map((a) => a.times)).toEqual([timesOf(ref.up), timesOf(ref.down)]);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Binary Options Arrows (example)
// ---------------------------------------------------------------------------------------------------------------

describe('binary-option-arrows: Binary Options Arrows (example)', () => {
  const refSignals = (list: Bar[]) => {
    const o = (i: number) => (i >= 0 ? list[i].open : NaN);
    const c = (i: number) => (i >= 0 ? list[i].close : NaN);
    const bear = list.map((_, i) => c(i - 1) > o(i - 1) && o(i) > c(i) && o(i) <= c(i - 1) && o(i - 1) <= c(i)
      && o(i) - c(i) < c(i - 1) - o(i - 1) && o(i - 5) < o(i));
    const bull = list.map((_, i) => o(i - 1) > c(i - 1) && c(i) > o(i) && c(i) <= o(i - 1) && c(i - 1) <= o(i)
      && c(i) - o(i) < o(i - 1) - c(i - 1) && o(i - 5) > o(i));
    return { bull, bear };
  };

  it('declares the plotarrow and the background of the original', () => {
    expect(boa.plotConfig).toEqual([]);
    expect(boa.arrowConfig).toEqual([{ id: 'arrow0', title: 'Arrows', colorup: '#00FF00', colordown: '#FF0000', minheight: 10, maxheight: 10 }]);
    expect(boa.metadata).toEqual({ title: 'Binary Options Arrows (example) [TheMightyChicken]', shortTitle: 'BOA', overlay: true });
    expect(boa.inputConfig.map((i) => [i.id, i.title, i.defval])).toEqual([['expiry', 'Expiry', 1]]);
  });

  for (const expiry of [1, 3]) {
    it(`arrows and WIN / LOSE backgrounds match the original (expiry ${expiry})`, () => {
      const r = boa.calculate(bars, { expiry });
      const { bull, bear } = refSignals(bars);
      const wantArrows = bars.flatMap((b, i) => {
        const v = (bull[i] ? 1 : 0) - (bear[i] ? 1 : 0);
        return v === 0 ? [] : [{ time: b.time, id: 'arrow0', value: v, color: v > 0 ? '#00FF00' : '#FF0000' }];
      });
      expect(r.arrows).toEqual(wantArrows);
      expect(wantArrows.filter((a) => a.value > 0).length).toBeGreaterThan(3);
      expect(wantArrows.filter((a) => a.value < 0).length).toBeGreaterThan(3);
      const wantBg = bars.flatMap((b, i) => {
        if (i < expiry) return [];
        const cE = bars[i - expiry].close;
        const win = (bull[i - expiry] && cE < b.close) || (bear[i - expiry] && cE > b.close);
        const lose = (bull[i - expiry] && cE >= b.close) || (bear[i - expiry] && cE <= b.close);
        return win ? [{ id: 'bgcolor0', time: b.time, c: 'rgba(0,255,0,0.3)' }]
          : lose ? [{ id: 'bgcolor0', time: b.time, c: 'rgba(255,0,0,0.3)' }] : [];
      });
      expect(r.bgColors.map((g) => ({ id: g.id, time: g.time, c: norm(g.color) }))).toEqual(wantBg);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Bullish Engulfing
// ---------------------------------------------------------------------------------------------------------------

describe('bullish-engulfing-finder: Bullish Engulfing', () => {
  it('declares a bar colour and alert() calls', () => {
    expect(engulf.plotConfig).toEqual([]);
    expect(engulf.hasAlertFunction).toBe(true);
    expect(engulf.metadata).toEqual({ title: 'Bullish Engulfing', shortTitle: 'Bullish Engulfing', overlay: true });
  });

  it('bar colours and alert() calls on the engulfing bars of the original', () => {
    const r = engulf.calculate(bars);
    const signal = bars.map((b, i) => {
      if (i === 0) return false;
      const p = bars[i - 1];
      return p.open > p.close ? (b.close > b.open ? (b.close >= p.open ? (p.close >= b.open ? b.close - b.open > p.open - p.close : false) : false) : false) : false;
    });
    const times = timesOf(signal);
    expect(times.length).toBeGreaterThan(5);
    expect(r.barColors).toEqual(times.map((time) => ({ id: 'barcolor0', time, color: '#FFEB3B' })));
    expect(r.alertCalls).toEqual(times.map((time) => ({ time, message: 'Bullish Engulfing Formed', freq: 'once_per_bar_close' })));
  });

  it('fires on a crafted engulfing bar', () => {
    const list: Bar[] = [
      { time: 1, open: 10, high: 10.5, low: 8.5, close: 9, volume: 1 },
      { time: 2, open: 8.8, high: 11, low: 8.7, close: 10.4, volume: 1 },
      { time: 3, open: 10.4, high: 10.6, low: 10, close: 10.2, volume: 1 },
    ];
    const r = engulf.calculate(list);
    expect(r.alertCalls.map((c) => c.time)).toEqual([2]);
    expect(r.barColors.map((c) => c.time)).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// CM_TotalConsecutive_Up_Down_V2
// ---------------------------------------------------------------------------------------------------------------

describe('bulls-bears-control: CM_TotalConsecutive_Up_Down_V2', () => {
  const titles = [
    'Price Down Based On Midpoint or Close', 'Price Up Based On Midpoint or Close',
    'Highest Down Bar Lookback - Midpoint', 'Highest Up Bar Lookback - Midpoint',
    'Highest Down Bar Lookback - Close', 'Highest Up Bar Lookback - Close',
    'StdDev of Down Bars - Midpoint', 'StdDev of Up Bars - Midpoint',
    'StdDev of Down Bars - Close', 'StdDev of Up Bars - Close',
    'MA of Down Bars - Midpoint', 'MA of Up Bars - Midpoint',
    'MA of Down Bars - Close', 'MA of Up Bars - Close',
  ];

  it('declares the 14 plots and the hline of the original', () => {
    expect(bulls.plotConfig.map((p) => p.title)).toEqual(titles);
    expect(bulls.plotConfig.map((p) => p.id)).toEqual(titles.map((_, k) => `plot${k}`));
    expect(bulls.plotConfig.map((p) => rgb(p.color))).toEqual(titles.map((_, k) => (k % 2 === 0 ? '255,0,0' : '0,255,0')));
    expect(bulls.plotConfig.map((p) => p.lineWidth)).toEqual(titles.map((_, k) => (k < 2 ? 3 : 4)));
    expect(bulls.plotConfig.map((p) => p.style)).toEqual(titles.map((_, k) => (k < 2 ? 'histogram' : undefined)));
    expect(bulls.metadata).toEqual({ title: 'CM_TotalConsecutive_Up_Down_V2', shortTitle: 'CM_TotalConsec_Up_Down_V2', overlay: false });
    const r = bulls.calculate(bars);
    expect(r.hlines).toEqual([{ value: 4, options: { color: '#FFFF00', linestyle: 'dashed', linewidth: 4, title: 'Horizontal Line' } }]);
  });

  /** The original's series, written out with plain loops */
  function ref(list: Bar[], o: typeof bulls.defaultInputs) {
    const bs = (cond: (i: number) => boolean) => {
      const out: number[] = [];
      let last = -1;
      for (let i = 0; i < list.length; i++) { if (cond(i)) last = i; out.push(last < 0 ? NaN : i - last); }
      return out;
    };
    const hl2 = (i: number) => (list[i].high + list[i].low) / 2;
    const dM = bs((i) => i > 0 && list[i].close > hl2(i - 1));
    const uM = bs((i) => i > 0 && list[i].close < hl2(i - 1));
    const dC = bs((i) => i > 0 && list[i].close > list[i - 1].close);
    const uC = bs((i) => i > 0 && list[i].close < list[i - 1].close);
    /** the last `len` non-na values (na while fewer) */
    const win = (a: number[], i: number, len: number) => {
      const w: number[] = [];
      for (let k = i; k >= 0 && w.length < len; k--) if (!isNaN(a[k])) w.push(a[k]);
      return w;
    };
    const sma = (a: number[]) => a.map((_, i) => { const w = win(a, i, o.maLength); return w.length < o.maLength ? NaN : w.reduce((s, v) => s + v, 0) / w.length; });
    const sd = (a: number[]) => a.map((_, i) => {
      const w = win(a, i, o.stdevLength);
      if (w.length < o.stdevLength) return NaN;
      const m = w.reduce((s, v) => s + v, 0) / w.length;
      return Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / w.length) * o.stdevMult;
    });
    /** highest: na on the first length - 1 bars, then the highest non-na value of the window */
    const hi = (a: number[]) => a.map((_, i) => {
      if (i < o.lookbackLength - 1) return NaN;
      let m = NaN;
      for (let k = i; k > i - o.lookbackLength && k >= 0; k--) if (!isNaN(a[k]) && !(a[k] <= m)) m = a[k];
      return m;
    });
    const t = (v: number) => !isNaN(v) && v !== 0;
    const gate = (on: boolean, a: number[]) => a.map((v) => (on && t(v) ? v : NaN));
    return [
      dM.map((v, i) => (o.useMidpoint && t(v) ? v : dC[i])),
      uM.map((v, i) => (o.useMidpoint && t(v) ? v : uC[i])),
      gate(o.showHighestMidpoint, hi(dM)), gate(o.showHighestMidpoint, hi(uM)),
      gate(o.showHighestClose, hi(dC)), gate(o.showHighestClose, hi(uC)),
      gate(o.showStdevMidpoint, sd(dM)), gate(o.showStdevMidpoint, sd(uM)),
      gate(o.showStdevClose, sd(dC)), gate(o.showStdevClose, sd(uC)),
      gate(o.showMaMidpoint, sma(dM)), gate(o.showMaMidpoint, sma(uM)),
      gate(o.showMaClose, sma(dC)), gate(o.showMaClose, sma(uC)),
    ];
  }

  const allOn = {
    showHighestMidpoint: true, showHighestClose: true, showStdevMidpoint: true,
    showStdevClose: true, showMaMidpoint: true, showMaClose: true,
  };
  for (const o of [{}, allOn, { ...allOn, useMidpoint: false, lookbackLength: 30, stdevLength: 20, stdevMult: 1, maLength: 10, hlength: 7 }]) {
    it(`all 14 plots match the original with ${JSON.stringify(o)}`, () => {
      const cfg = { ...bulls.defaultInputs, ...o };
      const r = bulls.calculate(bars, o);
      const want = ref(bars, cfg);
      for (let k = 0; k < 14; k++) expectSeries(vals(r.plots[`plot${k}`]), want[k]);
      expect(r.hlines?.[0].value).toBe(cfg.hlength);
      // the counts reach past 0 (the histograms draw)
      expect(Math.max(...want[0].filter((v) => !isNaN(v)))).toBeGreaterThan(1);
    });
  }
});
