/**
 * Re-ports of 4 community indicators (reports batch 4): ml-knn-strategy, ml-momentum-index, rci-3lines, redk-everex.
 * The outputs (plot ids / titles, marker ids, fills, hlines, candles) as the originals declare them, the main series
 * re-computed here from the originals' formulas on a seeded random walk, and the alert conditions.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as knn from '../../src/community/ml-knn-strategy';
import * as mlmi from '../../src/community/ml-momentum-index';
import * as rci from '../../src/community/rci-3lines';
import * as everex from '../../src/community/redk-everex';

/** Seeded random walk of bars with a random volume (spikes on 5 % of the bars), daily from 01/01/2020 */
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

// ── independent helpers (na = NaN; a window with an na value gives na) ──
const win = (a: number[], i: number, len: number) => (i - len + 1 < 0 ? null : a.slice(i - len + 1, i + 1));
const sma = (a: number[], len: number) => a.map((_, i) => {
  const w = win(a, i, len);
  return !w || w.some(isNaN) ? NaN : w.reduce((s, x) => s + x, 0) / len;
});
const wma = (a: number[], len: number) => a.map((_, i) => {
  const w = win(a, i, len);
  if (!w || w.some(isNaN)) return NaN;
  let s = 0;
  let d = 0;
  w.forEach((x, j) => { s += x * (j + 1); d += j + 1; });
  return s / d;
});
const rma = (a: number[], len: number) => {
  const out: number[] = [];
  const seed = sma(a, len);
  let prev = NaN;
  for (let i = 0; i < a.length; i++) {
    prev = isNaN(prev) ? seed[i] : (a[i] + (len - 1) * prev) / len;
    out.push(prev);
  }
  return out;
};
const rsi = (c: number[], len: number) => {
  const up = c.map((x, i) => (i ? Math.max(x - c[i - 1], 0) : NaN));
  const dn = c.map((x, i) => (i ? Math.max(c[i - 1] - x, 0) : NaN));
  const u = rma(up, len);
  const d = rma(dn, len);
  return u.map((x, i) => (isNaN(x) || isNaN(d[i]) ? NaN : d[i] === 0 ? 100 : x === 0 ? 0 : 100 - 100 / (1 + x / d[i])));
};
const cci = (c: number[], len: number) => {
  const m = sma(c, len);
  return c.map((x, i) => {
    const w = win(c, i, len);
    if (!w || isNaN(m[i])) return NaN;
    const dev = w.reduce((s, y) => s + Math.abs(y - m[i]), 0) / len;
    return (x - m[i]) / (0.015 * dev);
  });
};
const roc = (c: number[], len: number) => c.map((x, i) => (i < len ? NaN : (100 * (x - c[i - len])) / c[i - len]));
const extreme = (a: number[], len: number, max: boolean) => a.map((_, i) => {
  const w = win(a, i, len);
  if (!w) return NaN;
  const v = w.filter((x) => !isNaN(x));
  return v.length ? (max ? Math.max(...v) : Math.min(...v)) : NaN;
});
const over = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = (k: number) => (typeof b === 'number' ? b : b[k]);
  return i > 0 && v > w(i) && a[i - 1] <= w(i - 1);
});
const under = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = (k: number) => (typeof b === 'number' ? b : b[k]);
  return i > 0 && v < w(i) && a[i - 1] >= w(i - 1);
});
const timesOf = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const values = (pts: { value: number }[]) => pts.map((p) => p.value);
const close = (list: Bar[]) => list.map((b) => b.close);
const expectSeries = (got: number[], want: number[], digits = 8) => {
  expect(got.length).toBe(want.length);
  got.forEach((g, i) => {
    if (isNaN(want[i])) expect(g, `bar ${i}`).toBeNaN();
    else expect(g, `bar ${i}`).toBeCloseTo(want[i], digits);
  });
};
const alertOf = (r: { alerts: { id: string; times: number[] }[] }, id: string) => r.alerts.find((a) => a.id === id)!.times;

describe('ml-knn-strategy (Machine Learning: kNN-based Strategy)', () => {
  const bars = walk(1300, 11);
  const r = knn.calculate(bars);

  it('declares the outputs and alerts of the original', () => {
    expect(knn.metadata).toEqual({ title: 'Machine Learning: kNN-based Strategy', shortTitle: 'ML-kNN', overlay: true });
    expect(knn.plotConfig.map((p) => [p.id, p.title, p.color, p.lineWidth, p.style])).toEqual([['plot0', 'ClearPos', '#FFEB3B', 4, 'cross']]);
    expect(knn.alertConditions.map((d) => [d.id, d.title, d.message])).toEqual([['alert0', 'Buy', 'Go long!'], ['alert1', 'Sell', 'Go short!']]);
    expect(knn.inputConfig.map((c) => c.title)).toEqual(['Start Date', 'Stop Date', 'Indicator', 'Short Period [1..n]',
      'Long Period [2..n]', 'Base No. of Neighbours (K) [5..n]', 'Volatility Filter', 'Bar Threshold [2..5000]']);
    expect(new Date(knn.defaultInputs.startDate).toISOString()).toBe('1999-12-31T14:00:00.000Z');
    expect(new Date(knn.defaultInputs.stopDate).toISOString()).toBe('2025-12-31T13:45:00.000Z');
    expect([...new Set(r.markers.map((m) => m.id))].sort()).toEqual(['shape0', 'shape1']);
  });

  /** The original's algorithm, written out again */
  const reference = (list: Bar[], stopIndex = Infinity) => {
    const c = close(list);
    const vol = list.map((b) => b.volume!);
    const minimax = (x: number[], p: number) => {
      const hi = extreme(x, p, true);
      const lo = extreme(x, p, false);
      return x.map((v, i) => (99 * (v - lo[i])) / (hi[i] - lo[i]));
    };
    const [rs, rf, cs, cf, os, of] = [rsi(c, 28), rsi(c, 14), cci(c, 28), cci(c, 14), roc(c, 28), roc(c, 14)];
    const vs = minimax(vol, 28);
    const vf = minimax(vol, 14);
    const f1 = c.map((_, i) => (rs[i] + cs[i] + os[i] + vs[i]) / 4);
    const f2 = c.map((_, i) => (rf[i] + cf[i] + of[i] + vf[i]) / 4);
    const F1: number[] = [];
    const F2: number[] = [];
    const D: number[] = [];
    const preds: number[] = [];
    const k = Math.floor(Math.sqrt(252));
    const signal: number[] = [];
    const prediction: number[] = [];
    for (let i = 0; i < c.length; i++) {
      if (i <= stopIndex) {
        F1.push(f1[i]);
        F2.push(f2[i]);
        D.push(i ? Math.sign(c[i - 1] - c[i]) : NaN);
      }
      let maxdist = -999;
      for (let j = 0; j < D.length; j++) {
        const d = Math.sqrt((f1[i] - F1[j]) ** 2 + (f2[i] - F2[j]) ** 2);
        if (d > maxdist) {
          maxdist = d;
          if (preds.length >= k) preds.shift();
          preds.push(D[j]);
        }
      }
      const valid = preds.filter((x) => !isNaN(x));
      const p = valid.length ? valid.reduce((s, x) => s + x, 0) : NaN;
      prediction.push(p);
      signal.push(p > 0 ? 1 : p < 0 ? -1 : 0);
    }
    const changed = signal.map((s, i) => i > 0 && s !== signal[i - 1]);
    return {
      prediction,
      long: changed.map((ch, i) => ch && signal[i] === 1),
      short: changed.map((ch, i) => ch && signal[i] === -1),
      clear: changed.map((ch, i) => ch && signal[i] === 0),
    };
  };

  it('Buy / Sell labels, ClearPos crosses and alerts follow the kNN prediction', () => {
    const ref = reference(bars);
    const lows = extreme(bars.map((b) => b.low), 10, false);
    const longs = ref.long.map((f, i) => f && !isNaN(lows[i]));
    expect(longs.filter(Boolean).length).toBeGreaterThan(3);
    expect(ref.short.filter(Boolean).length).toBeGreaterThan(3);
    const buy = r.markers.filter((m) => m.id === 'shape0');
    const sell = r.markers.filter((m) => m.id === 'shape1');
    expect(buy.map((m) => m.time)).toEqual(timesOf(bars, longs));
    expect(sell.map((m) => m.time)).toEqual(timesOf(bars, ref.short));
    buy.forEach((m) => {
      const i = bars.findIndex((b) => b.time === m.time);
      expect(m).toMatchObject({ position: 'belowBar', shape: 'labelUp', size: 'small', color: knn.cAqua(Math.trunc(ref.prediction[i] * 5)) });
    });
    sell.forEach((m) => {
      const i = bars.findIndex((b) => b.time === m.time);
      expect(m).toMatchObject({ position: 'aboveBar', shape: 'labelDown', size: 'small', color: knn.cPink(Math.trunc(-ref.prediction[i] * 5)) });
    });
    expectSeries(values(r.plots.plot0), bars.map((b, i) => (ref.clear[i] ? b.close : NaN)));
    expect(alertOf(r, 'alert0')).toEqual(timesOf(bars, ref.long));
    expect(alertOf(r, 'alert1')).toEqual(timesOf(bars, ref.short));
  });

  it('stores only the bars inside the training window', () => {
    const stop = 700;
    const r2 = knn.calculate(bars, { stopDate: (bars[stop].time as number) * 1000 });
    const ref = reference(bars, stop);
    expect(alertOf(r2, 'alert0')).toEqual(timesOf(bars, ref.long));
    expect(alertOf(r2, 'alert1')).toEqual(timesOf(bars, ref.short));
    expect(alertOf(r2, 'alert0')).not.toEqual(alertOf(r, 'alert0'));
  });

  it('the cAqua / cPink intensity palettes', () => {
    expect([10, 9, 5, 2, 1, 0, -3].map(knn.cAqua)).toEqual(['#0080FFff', '#0080FFe5', '#0080FF7f', '#0080FF33', '#00C0FF19', '#00C0FF19', '#00C0FF19']);
    expect([10, 7, 3].map(knn.cPink)).toEqual(['#FF0080ff', '#FF0080b2', '#FF00804c']);
  });
});

describe('ml-momentum-index (MLMI)', () => {
  const bars = walk(2400, 5);
  const n = bars.length;
  const r = mlmi.calculate(bars);

  it('declares the outputs, fills, level and alerts of the original', () => {
    expect(mlmi.metadata).toEqual({ title: 'Machine Learning Momentum Index (MLMI) [Zeiierman]',
      shortTitle: 'Machine Learning Momentum Index (MLMI)', overlay: false });
    expect(mlmi.plotConfig.map((p) => [p.id, p.title, p.lineWidth, p.editable, p.display])).toEqual([
      ['plot0', 'MLMI Prediction', 1, undefined, undefined],
      ['plot1', 'WMA of MLMI Prediction', 1, undefined, undefined],
      ['plot2', 'Plot', 1, false, 'none'],
      ['plot3', 'Plot', 1, false, 'none'],
      ['plot4', 'Plot', 1, false, 'none'],
    ]);
    expect(mlmi.plotConfig[0].color).toBe('#426eff');
    expect(mlmi.plotConfig[1].color).toBe('#31ffc8');
    expect(r.fills!.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([
      ['plot4', 'plot2', 'Channel Gradient Fill'],
      ['plot4', 'plot3', 'Channel Gradient Fill'],
      ['plot0', 'plot4', 'Overbought Gradient Fill'],
      ['plot0', 'plot4', 'Oversold Gradient Fill'],
    ]);
    expect(r.hlines!.map((h) => [h.value, h.options?.title])).toEqual([[0, 'Mid Level']]);
    expect(mlmi.alertConditions.map((d) => d.id)).toEqual(['alert0', 'alert1', 'alert2', 'alert3', 'alert4', 'alert5', 'alert6', 'alert7']);
    expect(mlmi.alertConditions.map((d) => d.title)).toEqual(['MLMI Crossover OB', 'MLMI Crossunder OB', 'MLMI Crossover OS',
      'MLMI Crossunder OS', 'MLMI Crossover 50', 'MLMI Crossunder 50', 'MLMI Crossover Ma', 'MLMI Crossunder Ma']);
    mlmi.alertConditions.forEach((d) => expect(d.message).toBe(d.title));
  });

  // The original's storePreviousTrade / knnPredict, written out again
  const c = close(bars);
  const maQ = wma(c, 5);
  const maS = wma(c, 20);
  const rq = wma(rsi(c, 5), 20);
  const rsl = wma(rsi(c, 20), 20);
  const pos = over(maQ, maS);
  const neg = under(maQ, maS);
  const predict = (k: number) => {
  const P1 = [0];
  const P2 = [0];
  const PR = [0];
  const RE = [0];
  const pred: number[] = [];
  for (let i = 0; i < n; i++) {
    if (pos[i] || neg[i]) {
      P1.push(P1[P1.length - 1]);
      P2.push(P2[P2.length - 1]);
      PR.push(PR[PR.length - 1]);
      RE.push(c[i] >= PR[PR.length - 1] ? 1 : -1);
      P1[P1.length - 1] = rsl[i];
      P2[P2.length - 1] = rq[i];
      PR[PR.length - 1] = c[i];
    }
    const dist = P1.map((v, j) => Math.sqrt((rsl[i] - v) ** 2 + (rq[i] - P2[j]) ** 2));
    const sorted = [...dist.filter((d) => !isNaN(d)).sort((a, b) => a - b), ...dist.filter((d) => isNaN(d))];
    const sel = sorted.slice(0, Math.min(k, sorted.length)).filter((d) => !isNaN(d));
    const maxD = sel.length ? Math.max(...sel) : NaN;
    const nb = RE.filter((_, j) => dist[j] <= maxD);
    pred.push(nb.length ? nb.reduce((s, x) => s + x, 0) : NaN);
  }
  return { pred, trades: P1.length };
  };
  const { pred, trades } = predict(200);
  const pred20 = () => predict(20).pred;

  it('prediction (kNN vote) and its WMA', () => {
    expect(trades).toBeGreaterThan(50);
    expectSeries(values(r.plots.plot0), pred);
    expectSeries(values(r.plots.plot1), wma(pred, 20));
    expect(values(r.plots.plot4).every((v) => v === 0)).toBe(true);
  });

  it('with fewer neighbours than stored trades (k = 20)', () => {
    const r20 = mlmi.calculate(bars, { k: 20 });
    const want = pred20();
    expectSeries(values(r20.plots.plot0), want);
    expect(want.some((v, i) => v !== pred[i] && !isNaN(v))).toBe(true);
  });

  it('channel 2000 bars back and the gradient fills', () => {
    const up = extreme(pred, 2000, true);
    const lo = extreme(pred, 2000, false);
    expectSeries(values(r.plots.plot2), up);
    expectSeries(values(r.plots.plot3), lo);
    expect(up.filter((v) => !isNaN(v)).length).toBe(n - 1999);
    const g = r.fills!.map((f) => f.gradient!);
    expectSeries(g[0].topValue, up);
    expect(g[0].bottomColor[n - 1]).toBeNull();
    expect(g[1].topColor[n - 1]).toBeNull();
    expectSeries(g[1].bottomValue, lo);
    expectSeries(g[2].topValue, up);
    expectSeries(g[3].bottomValue, lo);
  });

  it('alert conditions: crosses of the OB / OS edges, zero and the WMA', () => {
    const s = Series.fromArray(bars, pred);
    const dev = ta.ema(ta.stdev(s, 20), 20).toArray().map((v) => v ?? NaN);
    const up = extreme(pred, 2000, true).map((v, i) => v - dev[i]);
    const lo = extreme(pred, 2000, false).map((v, i) => v + dev[i]);
    const ma = wma(pred, 20);
    const want = [over(pred, up), under(pred, up), over(pred, lo), under(pred, lo), over(pred, 0), under(pred, 0), over(pred, ma), under(pred, ma)];
    want.forEach((f, k) => expect(alertOf(r, `alert${k}`), `alert${k}`).toEqual(timesOf(bars, f)));
    expect(alertOf(r, 'alert4').length).toBeGreaterThan(0);
    expect(alertOf(r, 'alert6').length).toBeGreaterThan(0);
  });
});

describe('rci-3lines (RCI3lines)', () => {
  const bars = walk(1300, 3);
  const r = rci.calculate(bars);

  it('declares the outputs and levels of the original', () => {
    expect(rci.metadata).toEqual({ title: 'RCI3lines', shortTitle: 'RCI3lines', overlay: false });
    expect(rci.plotConfig.map((p) => [p.id, p.title, p.color, p.lineWidth])).toEqual([
      ['plot0', 'RCI short', '#F23645', 1], ['plot1', 'RCI middle', '#2962FF', 1], ['plot2', 'RCI long', '#4CAF50', 1],
    ]);
    expect(rci.defaultInputs).toMatchObject({ shortLen: 9, midLen: 36, longLen: 52, upperBand: 80, lowerBand: -80 });
    expect(r.hlines!.map((h) => [h.value, h.options?.title, h.options?.linestyle])).toEqual([[80, 'Level', 'dashed'], [-80, 'Level', 'dashed']]);
  });

  /** Spearman rank correlation (average ranks) of the close against time, * 100; first value on bar `len` */
  const spearman = (c: number[], len: number) => c.map((_, i) => {
    if (i < len) return NaN;
    const w = c.slice(i - len + 1, i + 1);
    const order = w.map((_, j) => j).sort((a, b) => w[a] - w[b]);
    const pr = new Array(len);
    order.forEach((j, rank) => (pr[j] = rank + 1));
    let d2 = 0;
    for (let j = 0; j < len; j++) d2 += (pr[j] - (j + 1)) ** 2;
    return (1 - (6 * d2) / (len * (len * len - 1))) * 100;
  });

  it('the three RCI lines', () => {
    const c = close(bars);
    expectSeries(values(r.plots.plot0), spearman(c, 9), 6);
    expectSeries(values(r.plots.plot1), spearman(c, 36), 6);
    expectSeries(values(r.plots.plot2), spearman(c, 52), 6);
  });
});

describe('redk-everex (RedK EVEREX v3.0)', () => {
  const bars = walk(1300, 9);
  const n = bars.length;
  const r = everex.calculate(bars);

  it('declares the outputs, candles, levels and alerts of the original', () => {
    expect(everex.metadata).toEqual({ title: 'RedK Effort Versus Results Explorer v3.0', shortTitle: 'RedK EVEREX v3.0', overlay: false });
    expect(everex.plotConfig.map((p) => [p.id, p.title, p.lineWidth, p.style, p.display])).toEqual([
      ['plot0', 'Bulls', 2, undefined, 'none'],
      ['plot1', 'Bears', 2, undefined, 'none'],
      ['plot2', 'Bias / Sentiment', 4, 'area', undefined],
      ['plot3', 'RROF Raw', 1, undefined, 'none'],
      ['plot4', 'Signal Line', 2, undefined, undefined],
      ['plot5', 'RROF Smooth', 3, undefined, undefined],
    ]);
    // Bias / Sentiment: display = showBias ? pane : none, off by default
    expect(everex.plotConfig[2].visible).toBe('showBias');
    expect(everex.defaultInputs.showBias).toBe(false);
    expect(everex.plotConfig[0].color).toBe('#11ff20');
    expect(everex.plotConfig[1].color).toBe('#d5180b');
    expect(everex.plotCandleConfig.map((c) => c.title)).toEqual(['Volume Band', 'Price Band']);
    expect(Object.keys(r.plotCandles)).toEqual(['candle0', 'candle1']);
    expect(Object.keys(r.outputValues)).toEqual(['char0', 'char1']);
    expect([...new Set(r.markers.map((m) => m.id))].sort()).toEqual(['shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7']);
    expect(r.hlines!.map((h) => [h.value, h.options?.title])).toEqual([
      [0, 'Zero Line'], [25, '1/4 Level'], [50, '2/4 Level'], [75, '3/4 Level'], [100, '4/4 Level'], [25, 'Level'], [-25, 'Level'],
    ]);
    expect(everex.alertConditions.map((d) => [d.id, d.title, d.message])).toEqual([
      ['alert0', '.   RROF Crossing 0 Up', 'RROF Up - Buying Action Detected!'],
      ['alert1', '..  RROF Crossing 0 Down', 'RROF Down - Selling Action Detected!'],
      ['alert2', '... RROF Crossing 0', 'RROF Swing - Possible Reversal'],
    ]);
    const off = everex.calculate(bars, { showEverex: false, showLevels: false, bandScale: '200' });
    expect(off.hlines!.map((h) => h.id)).toEqual(['hline0']);
    expect(off.plotCandles.candle0.length).toBe(0);
    const scaled = everex.calculate(bars, { bandScale: '400' });
    expect(scaled.hlines!.slice(1, 5).map((h) => h.value)).toEqual([100, 200, 300, 400]);
  });

  // The original's formulas with the default inputs (WMA averages, 'Simple' lookback = SMA), written out again
  const norm = (v: number, a: number) => {
    const x = v / a;
    return x > 1.5 ? 1 : x > 1.2 ? 0.9 : x > 1 ? 0.8 : x > 0.8 ? 0.7 : x > 0.6 ? 0.6 : x > 0.4 ? 0.5 : x > 0.2 ? 0.25 : 0.1;
  };
  const c = close(bars);
  const vol = bars.map((b) => b.volume!);
  const volaN = vol.map((v, i) => norm(v, sma(vol, 20)[i]) * 100);
  const hh2 = extreme(bars.map((b) => b.high), 2, true);
  const ll2 = extreme(bars.map((b) => b.low), 2, false);
  const shift = c.map((x, i) => (i ? x - c[i - 1] : NaN));
  const spreadAbs = bars.map((b) => Math.abs(b.close - b.open));
  const spreadAvg = sma(spreadAbs, 20);
  const shiftAvg = sma(shift.map(Math.abs), 20);
  const priceN = bars.map((b, i) => {
    const range = b.high - b.low;
    const r2 = hh2[i] - ll2[i];
    const sp = b.close - b.open;
    return ((2 * (b.close - b.low)) / range * 100 - 100
      + (sp / range) * 100
      + norm(Math.abs(sp), spreadAvg[i]) * 100 * Math.sign(sp)
      + (2 * (b.close - ll2[i])) / r2 * 100 - 100
      + (shift[i] / r2) * 100
      + norm(Math.abs(shift[i]), shiftAvg[i]) * 100 * Math.sign(shift[i])) / 6;
  });
  const flow = priceN.map((p, i) => (p * volaN[i]) / 100);
  const bullsAvg = wma(flow.map((f) => Math.max(f, 0)), 10);
  const bearsAvg = wma(flow.map((f) => -Math.min(f, 0)), 10);
  const rrof = bullsAvg.map((b, i) => 2 * (100 - 100 / (1 + b / bearsAvg[i])) - 100);
  const rrofS = wma(rrof, 3);

  it('RROF raw / smooth, the signal line and bulls / bears', () => {
    expectSeries(values(r.plots.plot3), rrof);
    expectSeries(values(r.plots.plot5), rrofS);
    expectSeries(values(r.plots.plot4), wma(rrofS, 5));
    expectSeries(values(r.plots.plot0), wma(bullsAvg, 3));
    expectSeries(values(r.plots.plot1), wma(bearsAvg, 3));
    const bulls30 = wma(flow.map((f) => Math.max(f, 0)), 30);
    const bears30 = wma(flow.map((f) => -Math.min(f, 0)), 30);
    expectSeries(values(r.plots.plot2), wma(bulls30.map((b, i) => 2 * (100 - 100 / (1 + b / bears30[i])) - 100), 3));
    expect(r.plots.plot5[n - 1].color).toBe(rrofS[n - 1] >= 0 ? '#00BCD4' : '#FF9800');
  });

  it('equalizer candles and the normalized values', () => {
    const i = n - 1;
    const nV = Math.max(Math.min(volaN[i], 100), -100);
    const nP = Math.max(Math.min(priceN[i], 100), -100);
    const vb = r.plotCandles.candle0.find((x) => x.time === bars[i].time)!;
    const pb = r.plotCandles.candle1.find((x) => x.time === bars[i].time)!;
    expect([vb.open, vb.low]).toEqual([0, 0]);
    expect(vb.high).toBeCloseTo(nV / 2, 10);
    expect(vb.close).toBeCloseTo(nV / 2, 10);
    expect(pb.open).toBeCloseTo(nV / 2, 10);
    expect(pb.high).toBeCloseTo(nV / 2 + Math.abs(nP) / 2, 10);
    expect(r.outputValues.char0.at(-1)!.value).toBeCloseTo(nV, 10);
    expect(r.outputValues.char1.at(-1)!.value).toBeCloseTo(nP, 10);
    const sep = everex.calculate(bars, { bandOption: 'Separate' });
    expect(sep.plotCandles.candle1.at(-1)!.open).toBe(50);
  });

  it('EoM / Compression / MegaBar markers at zero', () => {
    const want: Record<string, boolean[]> = { shape2: [], shape3: [], shape4: [], shape5: [], shape6: [], shape7: [] };
    for (let i = 0; i < n; i++) {
      const nV = Math.max(Math.min(volaN[i], 100), -100);
      const nP = Math.max(Math.min(priceN[i], 100), -100);
      const ev = (100 * Math.abs(nP)) / nV;
      const posi = nP > 0;
      const mega = Math.abs(nP) >= 80 && nV >= 80;
      const comp = ev <= 50;
      const eom = ev >= 120 && !mega;
      want.shape2.push(eom && posi);
      want.shape3.push(eom && !posi);
      want.shape4.push(comp && posi);
      want.shape5.push(comp && !posi);
      want.shape6.push(mega && posi);
      want.shape7.push(mega && !posi);
    }
    for (const [id, f] of Object.entries(want)) {
      expect(r.markers.filter((m) => m.id === id).map((m) => m.time), id).toEqual(timesOf(bars, f));
      expect(f.some(Boolean), id).toBe(true);
    }
    expect(r.markers.every((m) => m.position === 'atPriceMiddle' && m.price === 0)).toBe(true);
    expect(everex.calculate(bars, { showMarkers: false }).markers.length).toBe(0);
  });

  it('alert conditions: RROF Smooth crossing 0', () => {
    const up = over(rrofS, 0);
    const dn = under(rrofS, 0);
    expect(alertOf(r, 'alert0')).toEqual(timesOf(bars, up));
    expect(alertOf(r, 'alert1')).toEqual(timesOf(bars, dn));
    expect(alertOf(r, 'alert2')).toEqual(timesOf(bars, up.map((u, i) => u || dn[i])));
    expect(alertOf(r, 'alert0').length).toBeGreaterThan(0);
  });
});
