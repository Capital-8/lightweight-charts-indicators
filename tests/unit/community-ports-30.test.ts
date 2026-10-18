/**
 * Community ports, batch 30: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers and the fills.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as qqeMod from '../../src/community/qqe-mod';
import * as qqeSig from '../../src/community/qqe-signals';
import * as qtech from '../../src/community/qtechlabs-machine-learning-logistic-regression-indicator';
import * as qvwap from '../../src/community/quant-vwap-system-3-8';
import * as qrb from '../../src/community/quantile-regression-bands';
import * as qro from '../../src/community/quantum-regression-oscillator';
import * as qts from '../../src/community/quantum-trend-signal';
import * as qtse from '../../src/community/quantumtrend-swiftedge';
import * as qfl from '../../src/community/quartile-for-loop';
import * as qm from '../../src/community/quasimodo-pattern';
import * as rte from '../../src/community/r-trend-exhaustion';
import * as radiant from '../../src/community/radiant-mean-reversion-channels';
import * as rf from '../../src/community/range-filter-buy-sell-5min';
import * as rid from '../../src/community/range-identifier';
import * as rti from '../../src/community/range-tightening-indicator';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {"qqe-mod": [["alert0", "Primary RSI Cross Above Zero", "Primary RSI crossed above zero"], ["alert1", "Primary RSI Cross Below Zero", "Primary RSI crossed below zero"]], "qqe-signals": [["alert0", "Long", "Long"], ["alert1", "Short", "Short"]], "qtechlabs-machine-learning-logistic-regression-indicator": [["alert0", "Buy Signal", "Q# Lite Buy Signal"], ["alert1", "Sell Signal", "Q# Lite Sell Signal"]], "quant-vwap-system-3-8": [["alert0", "Squeeze Fired", "Volatility Squeeze has fired!"]], "quantile-regression-bands": [["alert0", "Price Crosses Upper Outer Band", "{{exchange}}:{{ticker}} Crossed above the upper outer quantile band."], ["alert1", "Price Crosses Lower Outer Band", "{{exchange}}:{{ticker}} Crossed below the lower outer quantile band."]], "quantum-regression-oscillator": [["alert0", "Oversold Bounce", "QRO bounced from lower band"], ["alert1", "Overbought Rejection", "QRO rejected from upper band"], ["alert2", "Bullish Divergence", "Bullish Divergence Detected"], ["alert3", "Bearish Divergence", "Bearish Divergence Detected"]], "quantum-trend-signal": [["alert0", "Buy Alert", "Quantum Trend BUY"], ["alert1", "Sell Alert", "Quantum Trend SELL"]], "quantumtrend-swiftedge": [["alert0", "QuantumTrend SwiftEdge Buy", "QuantumTrend SwiftEdge Buy Signal!"], ["alert1", "QuantumTrend SwiftEdge Sell", "QuantumTrend SwiftEdge Sell Signal!"], ["alert2", "Trend Change", "QuantumTrend SwiftEdge Trend Change!"]], "quartile-for-loop": [["alert0", "Quartile For-Loop Postive Trend", "Quartile For-Loop Bullish Signal on: {{exchange}}:{{ticker}}"], ["alert1", "Quartile For-Loop Negative Trend", "Quartile For-Loop Bearish Signal on: {{exchange}}:{{ticker}}"]], "quasimodo-pattern": [["alert0", "Quasimodo Pattern", "A Quasimodo Pattern has appeared!"]], "r-trend-exhaustion": [["alert0", "Arrow Down (Bearish Reversal)", "Arrow Down: Overbought trend is exhausted"], ["alert1", "Arrow Up (Bullish Reversal)", "Arrow Up: Oversold trend is exhausted"], ["alert2", "Overbought Trend Started", "Warning: Possible overbought trend exhaustion"], ["alert3", "Oversold Trend Started", "Warning: Possible oversold trend exhaustion"], ["alert4", "Bullish Crossover", "Potential bullish crossover printed"], ["alert5", "Bearish Crossover", "Potential bearish crossover printed"]], "radiant-mean-reversion-channels": [["alert0", "Radiant Buy", "Price is reversing from oversold conditions"], ["alert1", "Radiant Sell", "Price is reversing from overbought conditions"]], "range-filter-buy-sell-5min": [["alert0", "Buy alert on Range Filter", "Buy alert on Range Filter"], ["alert1", "Sell alert on Range Filter", "Sell alert on Range Filter"], ["alert2", "Buy and Sell alert on Range Filter", "Buy and Sell alert on Range Filter"]], "range-tightening-indicator": [["alert0", "Orange Dot Triggered", "Orange Dot Condition Met!"], ["alert1", "RTI Below 20 Triggered", "RTI is Below 20!"], ["alert2", "Range Expansion Triggered", "RTI Range Expansion Condition Met!"]]};

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
const bars = walk(1200, 11);
const n = bars.length;
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
const S = (a: number[]) => Series.fromArray(bars, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const markerTimes = (ms: { time: unknown; text?: string; id?: string }[], f: (m: { text?: string; id?: string }) => boolean) =>
  ms.filter(f).map((m) => m.time as number);

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
const highest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.max(...src.slice(i - len + 1, i + 1))));
const lowest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.min(...src.slice(i - len + 1, i + 1))));
/** ta.pivotlow / ta.pivothigh(src, lb, lb) on the confirming bar: the value lb bars back is strictly beyond its neighbours */
const pivot = (src: number[], lb: number, isLow: boolean) => src.map((_, i) => {
  const c = i - lb;
  if (c - lb < 0) return false;
  const v = src[c];
  if (!Number.isFinite(v)) return false;
  for (let j = 1; j <= lb; j++) {
    const l = src[c - j];
    const r = src[c + j];
    if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
    if (isLow ? !(v < l && v < r) : !(v > l && v > r)) return false;
  }
  return true;
});

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'qqe-mod': qqeMod, 'qqe-signals': qqeSig, 'qtechlabs-machine-learning-logistic-regression-indicator': qtech,
    'quant-vwap-system-3-8': qvwap, 'quantile-regression-bands': qrb, 'quantum-regression-oscillator': qro,
    'quantum-trend-signal': qts, 'quantumtrend-swiftedge': qtse, 'quartile-for-loop': qfl, 'quasimodo-pattern': qm,
    'r-trend-exhaustion': rte, 'radiant-mean-reversion-channels': radiant, 'range-filter-buy-sell-5min': rf,
    'range-tightening-indicator': rti,
  };
  for (const [id, m] of Object.entries(mods)) it(id, () => expect(decls(m)).toEqual(SPEC[id]));
  it('exported objects carry the declarations', () => {
    expect(qqeMod.QQEMod.alertConditions).toBe(qqeMod.alertConditions);
    expect(qqeSig.QQESignals.alertConditions).toBe(qqeSig.alertConditions);
    expect(qtech.QtechlabsMachineLearningLogisticRegressionIndicator.alertConditions).toBe(qtech.alertConditions);
    expect(qvwap.QuantVwapSystem38.alertConditions).toBe(qvwap.alertConditions);
    expect(qrb.QuantileRegressionBands.alertConditions).toBe(qrb.alertConditions);
    expect(qro.QuantumRegressionOscillator.alertConditions).toBe(qro.alertConditions);
    expect(qts.QuantumTrendSignal.alertConditions).toBe(qts.alertConditions);
    expect(qtse.QuantumTrendSwiftEdge.alertConditions).toBe(qtse.alertConditions);
    expect(qfl.QuartileForLoop.alertConditions).toBe(qfl.alertConditions);
    expect(qm.QuasimodoPattern.alertConditions).toBe(qm.alertConditions);
    expect(rte.RTrendExhaustion.alertConditions).toBe(rte.alertConditions);
    expect(rte.RTrendExhaustion.hasAlertFunction).toBe(true);
    expect(radiant.RadiantMeanReversionChannels.alertConditions).toBe(radiant.alertConditions);
    expect(rf.RangeFilterBuySell5min.alertConditions).toBe(rf.alertConditions);
    expect(rti.RangeTighteningIndicator.alertConditions).toBe(rti.alertConditions);
  });
});

describe('alert conditions recomputed from the original expressions', () => {
  it('qqe-mod: the smoothed primary RSI crossing 50', () => {
    const r = qqeMod.calculate(bars);
    const primaryRsi = A(ta.ema(ta.rsi(S(close), 6), 5));
    expect(times(r, 0)).toEqual(timeAt(bars, xover(primaryRsi, 50)));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(primaryRsi, 50)));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
    // no cross from the na warm-up values
    expect(times(r, 0)[0]).toBeGreaterThan(bars[6].time as number);
  });

  it('qqe-signals: the bars of the Long / Short labels', () => {
    const r = qqeSig.calculate(bars);
    // qqeLong = QQExlong == 1 ? FastAtrRsiTL[1] - 50 : na: no alert on the first count while FastAtrRsiTL[1] is still
    // na (the port draws a label there: bar 71 of these bars), else the bars of the labels
    const longs = markerTimes(r.markers, (m) => m.text === 'Long');
    expect(longs.filter((t) => !times(r, 0).includes(t))).toEqual([bars[71].time]);
    expect(times(r, 0)).toEqual(longs.filter((t) => t !== bars[71].time));
    expect(times(r, 1)).toEqual(markerTimes(r.markers, (m) => m.text === 'Short'));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
  });

  it('qtechlabs: the signal changes to buy / sell', () => {
    for (const threshold of [0.6, 0.55]) {
      const r = qtech.calculate(bars, { threshold });
      const sprob = vals(r.plots.plot0);
      const signal = sprob.map((p) => (gt(p, threshold) ? 1 : lt(p, 1 - threshold) ? -1 : 0));
      const buy = signal.map((s, i) => i > 0 && s === 1 && s !== signal[i - 1]);
      const sell = signal.map((s, i) => i > 0 && s === -1 && s !== signal[i - 1]);
      expect(times(r, 0)).toEqual(timeAt(bars, buy));
      expect(times(r, 1)).toEqual(timeAt(bars, sell));
      expect(times(r, 0).length).toBeGreaterThan(0);
      expect(times(r, 1).length).toBeGreaterThan(0);
    }
  });

  it('quant-vwap-system-3-8: the first bar after a valid squeeze', () => {
    for (const squeezeMethod of ['Smart Hybrid (Universal)', 'Quant Z-Score (Swing)'] as const) {
      const r = qvwap.calculate(bars, { squeezeMethod, minSqueeze: 2 });
      const valid = vals(r.plots.plot2).map((v) => v === 0);
      const fired = valid.map((v, i) => i > 0 && valid[i - 1] && !v);
      expect(times(r, 0)).toEqual(timeAt(bars, fired));
      expect(times(r, 0).length).toBeGreaterThan(3);
      expect(times(r, 0)).toEqual(r.markers.map((m) => m.time));
    }
  });

  it('quantile-regression-bands: the source crossing the smoothed outer bands', () => {
    const r = qrb.calculate(bars);
    expect(times(r, 0)).toEqual(timeAt(bars, xover(close, vals(r.plots.plot4))));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(close, vals(r.plots.plot3))));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    // the alerts do not depend on the bands being shown
    expect(qrb.calculate(bars, { showOuterBands: false }).alerts).toEqual(r.alerts);
  });

  it('quantum-regression-oscillator: band crosses and divergences on the confirming bar', () => {
    for (const lb of [5, 2]) {
      const r = qro.calculate(bars, { divLook: lb });
      const q = vals(r.plots.plot0);
      const upper = vals(r.plots.plot1);
      const lower = vals(r.plots.plot2);
      expect(times(r, 0)).toEqual(timeAt(bars, xover(q, lower)));
      expect(times(r, 1)).toEqual(timeAt(bars, xunder(q, upper)));
      const plP = pivot(low, lb, true), plO = pivot(q, lb, true);
      const phP = pivot(high, lb, false), phO = pivot(q, lb, false);
      const back = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
      const bull = bars.map((_b, i) => plP[i] && plO[i] && lt(back(low, i - lb), back(low, i - lb - 5)) && gt(back(q, i - lb), back(q, i - lb - 5)));
      const bear = bars.map((_b, i) => phP[i] && phO[i] && gt(back(high, i - lb), back(high, i - lb - 5)) && lt(back(q, i - lb), back(q, i - lb - 5)));
      expect(times(r, 2)).toEqual(timeAt(bars, bull));
      expect(times(r, 3)).toEqual(timeAt(bars, bear));
      // divergences are rare with the default lookback 5 on these bars (both pivots on one bar): counted with 2
      for (let k = 0; k < 4; k++) if (k < 2 || lb === 2) expect(times(r, k).length).toBeGreaterThan(0);
      // the circles are the divergences drawn lb bars back; the alerts do not depend on "Show Divergences"
      const step = (bars[1].time as number) - (bars[0].time as number);
      expect(r.markers.filter((m) => m.position === 'bottom').map((m) => m.time + lb * step)).toEqual(times(r, 2));
      expect(r.markers.filter((m) => m.position === 'top').map((m) => m.time + lb * step)).toEqual(times(r, 3));
      expect(qro.calculate(bars, { divLook: lb, showDiv: false }).alerts).toEqual(r.alerts);
    }
  });

  it('quantum-trend-signal: EMA crosses with the RSI and ATR filters', () => {
    const r = qts.calculate(bars);
    const f = vals(r.plots.plot0);
    const s = vals(r.plots.plot1);
    const rsi = A(ta.rsi(S(close), 14));
    const atrS = ta.atr(bars, 14);
    const atr = A(atrS);
    const atrAvg = A(ta.sma(atrS, 20));
    const volOk = atr.map((a, i) => gt(a, atrAvg[i] * 0.8));
    const up = xover(f, s), dn = xunder(f, s);
    expect(times(r, 0)).toEqual(timeAt(bars, up.map((c, i) => c && gt(rsi[i], 55) && volOk[i])));
    expect(times(r, 1)).toEqual(timeAt(bars, dn.map((c, i) => c && lt(rsi[i], 45) && volOk[i])));
    expect(times(r, 0).length + times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(markerTimes(r.markers, (m) => m.text === 'BUY'));
    expect(times(r, 1)).toEqual(markerTimes(r.markers, (m) => m.text === 'SELL'));
  });

  it('quantumtrend-swiftedge: signals (also hidden) and trend changes', () => {
    const r = qtse.calculate(bars);
    expect(times(r, 0)).toEqual(markerTimes(r.markers, (m) => m.text === 'Buy'));
    expect(times(r, 1)).toEqual(markerTimes(r.markers, (m) => m.text === 'Sell'));
    expect(times(r, 0).length + times(r, 1).length).toBeGreaterThan(0);
    // trend from the EMA colour (green in an up trend, red in a down trend): ta.change(trend) != 0
    const trend = r.plots.plot4.map((p: { color?: string }) => p.color);
    const change = trend.map((c, i) => i > 0 && c !== trend[i - 1]);
    expect(times(r, 2)).toEqual(timeAt(bars, change));
    expect(times(r, 2).length).toBeGreaterThan(10);
    const hidden = qtse.calculate(bars, { showSignals: false });
    expect(hidden.markers.length).toBe(0);
    expect(hidden.alerts).toEqual(r.alerts);
  });

  it('quartile-for-loop: the signal state from the score', () => {
    for (const inputs of [{}, { typeSig: true }]) {
      const r = qfl.calculate(bars, inputs);
      const score = vals(r.plots.plot0);
      const signal: number[] = [];
      let sg = 0;
      for (const v of score) {
        const long = gt(v, 35), short = lt(v, -5);
        if (long && !short) sg = 1;
        if (short) sg = -1;
        signal.push(sg);
      }
      expect(times(r, 0)).toEqual(timeAt(bars, signal.map((v) => v === 1)));
      expect(times(r, 1)).toEqual(timeAt(bars, signal.map((v) => v === -1)));
      expect(times(r, 0).length).toBeGreaterThan(10);
      expect(times(r, 1).length).toBeGreaterThan(10);
    }
  });

  it('quasimodo-pattern: either pattern on its third bar', () => {
    const check = (list: Bar[]) => {
      const r = qm.calculate(list);
      const flags = list.map((b, i) => {
        if (i < 2) return false;
        const b1 = list[i - 1], b2 = list[i - 2];
        const bull = gt(b.low, b2.high) && gt(b1.close, b1.open) && lt(b2.close, b2.open) && gt(b2.low, b1.low);
        const bear = lt(b.high, b2.low) && lt(b1.close, b1.open) && gt(b2.close, b2.open) && gt(b1.high, b2.high);
        return bull || bear;
      });
      expect(times(r, 0)).toEqual(timeAt(list, flags));
      return r;
    };
    check(bars);
    // crafted bars: a bearish candle, a bullish candle with a lower low, a gap above the first high; then the mirror
    const t0 = 1700000000, d = 86400;
    const crafted: Bar[] = [
      { time: t0, open: 100, high: 101, low: 99, close: 100.5, volume: 1 },
      { time: t0 + d, open: 100, high: 101, low: 97, close: 98, volume: 1 },
      { time: t0 + 2 * d, open: 97, high: 99, low: 95, close: 98.5, volume: 1 },
      { time: t0 + 3 * d, open: 102, high: 104, low: 101.5, close: 103, volume: 1 },
      { time: t0 + 4 * d, open: 103, high: 104, low: 102, close: 103.5, volume: 1 },
      { time: t0 + 5 * d, open: 103.5, high: 106, low: 103, close: 103.2, volume: 1 },
      { time: t0 + 6 * d, open: 100, high: 101.5, low: 99, close: 100, volume: 1 },
    ];
    const r = check(crafted);
    expect(times(r, 0)).toEqual([t0 + 3 * d, t0 + 6 * d]);
    expect(r.barColors.map((c) => c.time)).toEqual([t0 + d, t0 + 4 * d]);
  });

  it('radiant-mean-reversion-channels: the oscillator crossing 20 / 80', () => {
    const r = radiant.calculate(bars);
    const osc = vals(r.plots.plot0);
    expect(times(r, 0)).toEqual(timeAt(bars, xover(osc, 20)));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(osc, 80)));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
  });

  it('range-filter-buy-sell-5min: the break outs from the filter direction', () => {
    const r = rf.calculate(bars, { per: 30 });
    const filt = vals(r.plots.plot0);
    const longF: boolean[] = [], shortF: boolean[] = [];
    let upward = 0, downward = 0, condIni = 0;
    for (let i = 0; i < n; i++) {
      const f1 = i > 0 ? filt[i - 1] : NaN;
      upward = gt(filt[i], f1) ? upward + 1 : lt(filt[i], f1) ? 0 : upward;
      downward = lt(filt[i], f1) ? downward + 1 : gt(filt[i], f1) ? 0 : downward;
      const s1 = i > 0 ? close[i - 1] : NaN;
      const x = close[i];
      const longCond = (gt(x, filt[i]) && gt(x, s1) && upward > 0) || (gt(x, filt[i]) && lt(x, s1) && upward > 0);
      const shortCond = (lt(x, filt[i]) && lt(x, s1) && downward > 0) || (lt(x, filt[i]) && gt(x, s1) && downward > 0);
      const prev = condIni;
      condIni = longCond ? 1 : shortCond ? -1 : prev;
      longF.push(longCond && prev === -1);
      shortF.push(shortCond && prev === 1);
    }
    expect(times(r, 0)).toEqual(timeAt(bars, longF));
    expect(times(r, 1)).toEqual(timeAt(bars, shortF));
    expect(times(r, 2)).toEqual(timeAt(bars, longF.map((f, i) => f || shortF[i])));
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
    expect(times(r, 0)).toEqual(markerTimes(r.markers, (m) => m.text === 'Buy'));
  });

  it('range-tightening-indicator: dots, RTI below 20 and range expansion', () => {
    for (const lookbackOption of ['5', '15'] as const) {
      const r = rti.calculate(bars, { lookbackOption });
      const len = lookbackOption === '5' ? 5 : 15;
      const vol = bars.map((b) => b.high - b.low);
      const mx = highest(vol, len), mn = lowest(vol, len);
      const v = vol.map((x, i) => (mx[i] - mn[i] === 0 || isNaN(mx[i]) ? NaN : (100 * (x - mn[i])) / (mx[i] - mn[i])));
      const below = v.map((x) => lt(x, 20));
      let count = 0;
      const dot = below.map((b) => (count = b ? count + 1 : 0) >= 2);
      const expansion = v.map((x, i) => i > 0 && le(v[i - 1], 20) && ge(x, 2 * v[i - 1]));
      expect(times(r, 0)).toEqual(timeAt(bars, dot));
      expect(times(r, 1)).toEqual(timeAt(bars, below));
      expect(times(r, 2)).toEqual(timeAt(bars, expansion));
      for (let k = 0; k < 3; k++) expect(times(r, k).length).toBeGreaterThan(10);
    }
  });
});

describe('r-trend-exhaustion: alert conditions, alert() calls and Style ids', () => {
  const SHAPE_IDS = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7', 'char8', 'char9', 'shape10', 'shape11'];

  /** overbought / oversold, reversals, trend starts and line crosses from the plotted fast / slow %R */
  function states(r: ReturnType<typeof rte.calculate>) {
    const s = vals(r.plots.plot0);
    const l = vals(r.plots.plot1);
    const ob = s.map((v, i) => ge(v, -20) && ge(l[i], -20));
    const os = s.map((v, i) => le(v, -80) && le(l[i], -80));
    const prev = (a: boolean[], i: number) => (i > 0 ? a[i - 1] : false);
    return {
      obRev: ob.map((v, i) => !v && prev(ob, i)),
      osRev: os.map((v, i) => !v && prev(os, i)),
      obStart: ob.map((v, i) => v && !prev(ob, i)),
      osStart: os.map((v, i) => v && !prev(os, i)),
      crossBull: xunder(l, s),
      crossBear: xover(l, s),
      ob, os,
    };
  }

  it('the 6 conditions', () => {
    const r = rte.calculate(bars);
    const st = states(r);
    const want = [st.obRev, st.osRev, st.obStart, st.osStart, st.crossBull, st.crossBear];
    want.forEach((f, k) => {
      expect(times(r, k)).toEqual(timeAt(bars, f));
      expect(times(r, k).length).toBeGreaterThan(2);
    });
  });

  it('alert() calls: once per bar close, the text inputs of the alerts that are on', () => {
    const r = rte.calculate(bars);
    const st = states(r);
    const expected: { time: number; message: string; freq: string }[] = [];
    const withCross: typeof expected = [];
    bars.forEach((b, i) => {
      const t = b.time as number;
      const add = (list: typeof expected, cond: boolean, message: string) => {
        if (cond) list.push({ time: t, message, freq: 'once_per_bar_close' });
      };
      for (const list of [expected, withCross]) {
        add(list, st.obStart[i], '%RTE bull trend start ⏹');
        add(list, st.osStart[i], '%RTE bear trend start ⏹');
        add(list, st.obRev[i], '%RTE bull trend break ▼');
        add(list, st.osRev[i], '%RTE bear trend break ▲');
      }
      add(withCross, st.crossBull[i], 'Bullish crossover');
      add(withCross, st.crossBear[i], 'Custom bear');
    });
    expect(r.alertCalls).toEqual(expected);
    expect(expected.length).toBeGreaterThan(8);
    expect(rte.calculate(bars, { bullCrossOn: true, bearCrossOn: true, bearCrossTxt: 'Custom bear' }).alertCalls).toEqual(withCross);
    const off = rte.calculate(bars, { bullStartOn: false, bearStartOn: false, bullReversalOn: false, bearReversalOn: false });
    expect(off.alertCalls).toEqual([]);
    // the alertconditions do not depend on the alert inputs
    expect(off.alerts).toEqual(r.alerts);
  });

  it('every marker has the id of its output', () => {
    const r = rte.calculate(bars, { plotZeroCrosses: true, plotStrategyEntry: true });
    const st = states(r);
    for (const m of r.markers) expect(SHAPE_IDS).toContain(m.id);
    const ids = new Set(r.markers.map((m) => m.id));
    for (const id of ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'char8', 'char9', 'shape10', 'shape11']) {
      expect(ids.has(id)).toBe(true);
    }
    const byId = (id: string) => r.markers.filter((m) => m.id === id);
    expect(byId('shape0').map((m) => m.time)).toEqual(timeAt(bars, st.obRev));
    expect(byId('shape1').map((m) => m.time)).toEqual(timeAt(bars, st.osRev));
    expect(byId('shape4').map((m) => m.time)).toEqual(timeAt(bars, st.ob));
    expect(byId('shape5').map((m) => m.time)).toEqual(timeAt(bars, st.os));
    expect(byId('char8').map((m) => m.time)).toEqual(timeAt(bars, st.obStart));
    expect(byId('char9').map((m) => m.time)).toEqual(timeAt(bars, st.osStart));
    expect(byId('char8').every((m) => m.text === '◡')).toBe(true);
    expect(byId('char9').every((m) => m.text === '◠')).toBe(true);
    expect(byId('shape2').every((m) => m.shape === 'triangleDown' && m.forceOverlay)).toBe(true);
    expect(byId('shape3').every((m) => m.shape === 'triangleUp' && m.forceOverlay)).toBe(true);
    expect(byId('shape6').every((m) => m.shape === 'triangleUp')).toBe(true);
    expect(byId('shape7').every((m) => m.shape === 'triangleDown')).toBe(true);
    expect(byId('shape10').every((m) => m.text === 'Long')).toBe(true);
    expect(byId('shape11').every((m) => m.text === 'Short')).toBe(true);
    // strategy 3: short on the overbought reversal, long on the oversold reversal
    expect(byId('shape11').map((m) => m.time)).toEqual(timeAt(bars, st.obRev));
    // the zero line cross triangles with both lines on the same side of -50 after a cross
    const s = vals(r.plots.plot0), l = vals(r.plots.plot1);
    const zl = s.map((v, i) => gt(v, -50) && gt(l[i], -50) && (xover(s, -50)[i] || xover(l, -50)[i]));
    expect(byId('shape6').map((m) => m.time)).toEqual(timeAt(bars, zl));
  });
});

describe('range-identifier: the two fills of the original', () => {
  it('fills between Up and Down titled as the original, one per side of the EMA', () => {
    const r = rid.calculate(bars);
    expect(r.fills?.length).toBe(2);
    for (const f of r.fills ?? []) {
      expect([f.plot1, f.plot2].sort()).toEqual(['plot0', 'plot1']);
      expect(f.options?.title).toBe('Plots Background');
      expect(f.colors?.length).toBe(n);
    }
    const [up, down] = r.fills ?? [];
    const ema = A(ta.ema(S(close), 34));
    for (let i = 34; i < n; i++) {
      const bull = close[i] > ema[i];
      expect(up.colors?.[i]).toBe(bull ? '#26A69A40' : 'transparent');
      expect(down.colors?.[i]).toBe(bull ? 'transparent' : '#EF535040');
    }
  });
});
