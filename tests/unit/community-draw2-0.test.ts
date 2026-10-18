/**
 * Community ports, drawing pass 2 (batch 0): ATR Trailing Stops (original stop / position colours, defaults 5 / 3.5,
 * no bar colours), Matrix Series (warm-up of the smoothing and of the zones, no S/R fill), PPO Divergence (no zero
 * line), UCS Top & Bottom Candle (plots from their first bar), Banker Fund Flow (no line plots), Sonarlab Order Blocks
 * (mitigated boxes deleted, extended right, max 20 boxes) and Ichimoku Oscillator (trend state of the original).
 * Each fixed part is recomputed here from the original's formulas on seeded random-walk bars.
 */
import { describe, expect, it } from 'vitest';
import { color, type Bar } from 'oakscriptjs';
import * as atrColored from '../../src/community/atr-trailing-colored';
import * as matrix from '../../src/community/matrix-series';
import * as ppo from '../../src/community/ppo-divergence';
import * as tbc from '../../src/community/top-bottom-candle';
import * as banker from '../../src/community/banker-fund-flow';
import * as obs from '../../src/community/order-blocks-signals';
import * as ichimoku from '../../src/community/ichimoku-oscillator';

/** Seeded random walk of daily bars; `tick` rounds the prices (plateaus); `vol` scales the moves */
function walk(count: number, seed0: number, tick = 0, vol = 1): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const r = (v: number) => (tick > 0 ? Math.round(v / tick) * tick : v);
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = r(p + (rnd() - 0.5) * 1.5 * vol);
    p = r(Math.max(5, o + Math.sin(i / 13) * 1.2 * vol + (rnd() - 0.5) * 4 * vol));
    const high = r(Math.max(o, p) + rnd() * 1.5 * vol);
    const low = r(Math.min(o, p) - rnd() * 1.5 * vol);
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(high, o, p), low: Math.min(low, o, p), close: p, volume: 1e6 });
  }
  return out;
}

const bars = walk(1300, 7);
const bars2 = walk(1500, 4242);
const flat = walk(1300, 99, 1);

// --- Pine reference helpers (independent of the ports) ---
const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
const nz = (v: number, r = 0) => (isNaN(v) ? r : v);
/** ta.ema: na until the length-th valid value (seeded with their mean) */
function ema(src: number[], len: number): number[] {
  const out: number[] = [];
  const a = 2 / (len + 1);
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (isNaN(v)) { out.push(NaN); continue; }
    if (isNaN(prev)) {
      count++; sum += v;
      if (count === len) { prev = sum / len; out.push(prev); } else out.push(NaN);
    } else {
      prev = a * v + (1 - a) * prev;
      out.push(prev);
    }
  }
  return out;
}
/** ta.rma: na until the length-th valid value (seeded with their mean) */
function rma(src: number[], len: number): number[] {
  const out: number[] = [];
  let count = 0, sum = 0, prev = NaN;
  for (const v of src) {
    if (isNaN(prev)) {
      count++; sum += v;
      if (count === len) { prev = sum / len; out.push(prev); } else out.push(NaN);
    } else {
      prev = (prev * (len - 1) + v) / len;
      out.push(prev);
    }
  }
  return out;
}
/** ta.atr: rma of the true range (high - low on bar 0) */
function atr(b: Bar[], len: number): number[] {
  const tr = b.map((x, i) => (i === 0 ? x.high - x.low
    : Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close))));
  return rma(tr, len);
}
const win = (src: number[], i: number, len: number) => src.slice(i - len + 1, i + 1);
/** ta.sma / ta.stdev (biased) / ta.cci: na until the window is full of values */
const sma = (src: number[], len: number) => src.map((_, i) => {
  if (i < len - 1) return NaN;
  const w = win(src, i, len);
  return w.some(isNaN) ? NaN : w.reduce((s, v) => s + v, 0) / len;
});
const stdev = (src: number[], len: number) => src.map((_, i) => {
  if (i < len - 1) return NaN;
  const w = win(src, i, len);
  const m = w.reduce((s, v) => s + v, 0) / len;
  return Math.sqrt(w.reduce((s, v) => s + (v - m) * (v - m), 0) / len);
});
const cci = (src: number[], len: number) => src.map((v, i) => {
  if (i < len - 1) return NaN;
  const w = win(src, i, len);
  const m = w.reduce((s, x) => s + x, 0) / len;
  const dev = w.reduce((s, x) => s + Math.abs(x - m), 0) / len;
  return (v - m) / (0.015 * dev);
});
/** ta.highest / ta.lowest of a series: best non-na value of the window, na before the window is full */
const extreme = (src: number[], len: number, low: boolean) => src.map((_, i) => {
  if (i < len - 1) return NaN;
  const w = win(src, i, len).filter((v) => !isNaN(v));
  return w.length === 0 ? NaN : low ? Math.min(...w) : Math.max(...w);
});

const vals = (s: { value: number }[]) => s.map((p) => p.value);
function expectSeries(actual: number[], expected: number[], label: string, digits = 8) {
  expect(actual.length, label).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (isNaN(expected[i])) expect(actual[i], `${label} @${i}`).toBeNaN();
    else expect(actual[i], `${label} @${i}`).toBeCloseTo(expected[i], digits);
  }
}
const firstValid = (a: number[]) => a.findIndex((v) => !isNaN(v));

// ---------------------------------------------------------------------------------------------------------------
describe('atr-trailing-colored: the original stop, its position colours, defaults 5 / 3.5, no bar colours', () => {
  function reference(b: Bar[], period: number, mult: number) {
    const a = atr(b, period);
    const stop: number[] = [], pos: number[] = [];
    for (let i = 0; i < b.length; i++) {
      const c = b[i].close, c1 = i > 0 ? b[i - 1].close : NaN;
      const p = nz(at(stop, i - 1));
      const loss = mult * a[i];
      // Math.max / Math.min propagate NaN like the original's max / min with na
      stop.push(c > p && c1 > p ? Math.max(p, c - loss) : c < p && c1 < p ? Math.min(p, c + loss) : c > p ? c - loss : c + loss);
      pos.push(c1 < p && c > p ? 1 : c1 > p && c < p ? -1 : nz(at(pos, i - 1)));
    }
    return { stop, pos };
  }
  const RED = String(color.new('#FF0000', 35)), GREEN = String(color.new('#008000', 35)), BLUE = String(color.new('#0000FF', 35));
  it('declares the inputs with the original defaults and one plot "ATR Trailing Stop" (width 1)', () => {
    expect(atrColored.defaultInputs).toEqual({ length: 5, mult: 3.5 });
    expect(atrColored.inputConfig.map((c) => c.defval)).toEqual([5, 3.5]);
    expect(atrColored.plotConfig).toHaveLength(1);
    expect(atrColored.plotConfig[0]).toMatchObject({ id: 'plot0', title: 'ATR Trailing Stop', lineWidth: 1 });
  });
  for (const [name, list, inputs] of [['walk', bars, {}], ['walk 4242, 10 / 2', bars2, { length: 10, mult: 2 }], ['plateaus', flat, {}]] as const) {
    it(`stop values and red / green / blue position colours as the original (${name})`, () => {
      const cfg = { ...atrColored.defaultInputs, ...inputs };
      const r = atrColored.calculate(list, inputs) as Record<string, unknown> & { plots: Record<string, { value: number; color?: string }[]> };
      expect(r.barColors).toBeUndefined();
      expect(r.markers).toBeUndefined();
      const ref = reference(list, cfg.length, cfg.mult);
      expectSeries(vals(r.plots.plot0), ref.stop, 'stop');
      expect(firstValid(ref.stop)).toBe(cfg.length - 1);
      const colours = r.plots.plot0.map((p, i) => (isNaN(p.value) ? undefined : p.color));
      const want = ref.stop.map((v, i) => (isNaN(v) ? undefined : ref.pos[i] === -1 ? RED : ref.pos[i] === 1 ? GREEN : BLUE));
      expect(colours).toEqual(want);
      // blue until the first cross, then both trend colours
      expect(colours[cfg.length - 1]).toBe(BLUE);
      expect(colours.filter((c) => c === RED).length).toBeGreaterThan(20);
      expect(colours.filter((c) => c === GREEN).length).toBeGreaterThan(20);
    });
  }
});

// ---------------------------------------------------------------------------------------------------------------
describe('matrix-series: smoothing and zones from their first bars, no S/R fill', () => {
  function reference(b: Bar[], nn: number, pds: number, look: number, pct: number) {
    const ys1 = b.map((x) => (x.high + x.low + x.close * 2) / 4);
    const rk3 = ema(ys1, nn), rk4 = stdev(ys1, nn);
    const rk5 = ys1.map((v, i) => (rk4[i] === 0 ? NaN : ((v - rk3[i]) * 200) / rk4[i]));
    const rk6 = ema(rk5, nn);
    const up = ema(rk6, nn);
    const down = ema(up, nn);
    const c3 = cci(b.map((x) => x.close), pds);
    const v2 = extreme(c3, look, false), v3 = extreme(c3, look, true);
    const v5 = v2.map((v, i) => (v - v3[i]) * (pct / 100));
    return { up, down, res: v3.map((v, i) => v + v5[i]), sup: v2.map((v, i) => v - v5[i]) };
  }
  for (const [name, list, inputs] of [['walk', bars, {}], ['walk 4242, smoother 3', bars2, { smoother: 3, pricePeriod: 10, supResPeriod: 30, supResPercentage: 80 }]] as const) {
    it(`candles from bar 4 x (Smoother - 1), S/R lines from the zone window (${name})`, () => {
      const cfg = { ...matrix.defaultInputs, ...inputs };
      const r = matrix.calculate(list, inputs) as ReturnType<typeof matrix.calculate> & Record<string, unknown>;
      const ref = reference(list, cfg.smoother, cfg.pricePeriod, cfg.supResPeriod, cfg.supResPercentage);
      // Oo = iff(up < down, up, down), Ll = iff(up < down, down, up); a candle with a na value is not drawn
      const lo = ref.up.map((u, i) => (isNaN(u) || isNaN(ref.down[i]) ? NaN : u < ref.down[i] ? u : ref.down[i]));
      const hi = ref.up.map((u, i) => (isNaN(u) || isNaN(ref.down[i]) ? NaN : u < ref.down[i] ? ref.down[i] : u));
      const candles = r.plotCandles.candle0;
      // rk5 divides by a small stdev: compare to 4 decimals (values in the hundreds)
      expectSeries(candles.map((c) => c.open), lo, 'Oo', 4);
      expectSeries(candles.map((c) => c.high), lo, 'Hh', 4);
      expectSeries(candles.map((c) => c.low), hi, 'Ll', 4);
      expectSeries(candles.map((c) => c.close), hi, 'Cc', 4);
      expect(firstValid(candles.map((c) => c.open))).toBe(4 * (cfg.smoother - 1));
      expectSeries(vals(r.plots.resistance), ref.res, 'ResistanceLine');
      expectSeries(vals(r.plots.support), ref.sup, 'SupportLine');
      expect(firstValid(vals(r.plots.resistance))).toBe(cfg.supResPeriod - 1);
      // the OB / OS crosses follow the candles from their first bar
      const ob = ref.up.map((u, i) => (u > cfg.ob && u > ref.down[i] ? u + 20 : u > cfg.ob && u < ref.down[i] ? ref.down[i] + 20 : NaN));
      expectSeries(vals(r.plots.obMarker), ob, 'UPshape', 4);
      expect(r.fills === undefined || (r.fills as unknown[]).length === 0).toBe(true);
    });
  }
  it('Dynamic zones off: no S/R lines', () => {
    const r = matrix.calculate(bars, { dynamic: false });
    expect(vals(r.plots.resistance).every(isNaN)).toBe(true);
    expect(vals(r.plots.support).every(isNaN)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('ppo-divergence: no zero line', () => {
  it('draws no hline (the original has none); the 11 plots stay', () => {
    const r = ppo.calculate(bars) as Record<string, unknown> & { plots: Record<string, unknown[]> };
    expect(r.hlines === undefined || (r.hlines as unknown[]).length === 0).toBe(true);
    expect(Object.keys(r.plots)).toHaveLength(11);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('top-bottom-candle: plots from their first bars', () => {
  for (const [name, list, inputs] of [['walk', bars, {}], ['walk 4242, 7 / 4', bars2, { percentKLength: 7, percentDLength: 4 }]] as const) {
    it(`Momentum, SMI and its signal as the original (${name})`, () => {
      const cfg = { ...tbc.defaultInputs, ...inputs };
      const a = cfg.percentKLength, bb = cfg.percentDLength;
      const r = tbc.calculate(list, inputs);
      const close = list.map((x) => x.close);
      const ll = extreme(list.map((x) => x.low), a, true), hh = extreme(list.map((x) => x.high), a, false);
      const diff = hh.map((h, i) => h - ll[i]);
      const rdiff = close.map((c, i) => c - (hh[i] + ll[i]) / 2);
      const avgrel = ema(ema(rdiff, bb), bb), avgdiff = ema(ema(diff, bb), bb);
      const mom = close.map((c, i) => ((c - at(close, i - bb)) / at(close, i - bb)) * 1000);
      const smi = avgdiff.map((d, i) => (isNaN(d) ? NaN : d !== 0 ? (avgrel[i] / (d / 2)) * 100 : 0));
      const sig = ema(smi, bb);
      expectSeries(vals(r.plots.momentum), mom, 'Momentum');
      expectSeries(vals(r.plots.smi), smi, 'SMI');
      expectSeries(vals(r.plots.smiSignal), sig, 'SMIsignal');
      expect(firstValid(vals(r.plots.momentum))).toBe(bb);
      expect(firstValid(vals(r.plots.smi))).toBe(a - 1 + 2 * (bb - 1));
      expect(firstValid(vals(r.plots.smiSignal))).toBe(a - 1 + 3 * (bb - 1));
    });
  }
  it('defaults: Momentum from bar 3, SMI from bar 8', () => {
    const r = tbc.calculate(bars);
    expect(firstValid(vals(r.plots.momentum))).toBe(3);
    expect(firstValid(vals(r.plots.smi))).toBe(8);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('banker-fund-flow: no line plots', () => {
  it('declares and returns no plot; the five candle sets and alerts stay', () => {
    expect(banker.plotConfig).toEqual([]);
    const r = banker.calculate(bars);
    expect(Object.keys(r.plots)).toEqual([]);
    expect(Object.keys(r.plotCandles)).toEqual(['entrySignal', 'green', 'white', 'red', 'blue']);
    expect(r.plotCandles.green.length).toBeGreaterThan(0);
    expect(r.alerts.map((x) => x.id)).toEqual(['alert0', 'alert1', 'alert2', 'alert3', 'alert4']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('order-blocks-signals: mitigated boxes deleted, boxes extended right', () => {
  /** The original, bar by bar: box objects in two arrays, deleted on mitigation, max_boxes_count = 20 */
  function reference(b: Bar[], sensitivity = 28, mitigation: 'Close' | 'Wick' = 'Close') {
    const sens = sensitivity / 100;
    const n = b.length;
    const open = b.map((x) => x.open);
    const pc = open.map((o, i) => ((o - at(open, i - 4)) / at(open, i - 4)) * 100);
    type Box = { id: number; left: number; top: number; bottom: number; bull: boolean; deleted: boolean };
    const all: Box[] = [];
    const longBoxes: Box[] = [], shortBoxes: Box[] = [];
    const crossIdx: number[] = [];
    const alerts: { time: number; message: string }[] = [];
    const make = (i: number, bull: boolean) => {
      let last = 0;
      for (let k = 4; k <= 15; k++) {
        const cc = i - k >= 0 ? b[i - k].close : NaN, oo = i - k >= 0 ? b[i - k].open : NaN;
        if (bull ? cc < oo : cc > oo) { last = k; break; }
      }
      const bx: Box = { id: all.length, left: i - last, top: b[i - last].high, bottom: b[i - last].low, bull, deleted: false };
      all.push(bx);
      const live = all.filter((x) => !x.deleted);
      if (live.length > 20) live[0].deleted = true;
      return bx;
    };
    for (let i = 0; i < n; i++) {
      const prev = at(crossIdx, i - 1);
      let ci = isNaN(prev) ? NaN : prev;
      const under = pc[i] < -sens && at(pc, i - 1) >= -sens;
      const over = pc[i] > sens && at(pc, i - 1) <= sens;
      if (under || over) ci = i;
      crossIdx.push(ci);
      if (under && ci - prev > 5) shortBoxes.push(make(i, false));
      if (over && ci - prev > 5) longBoxes.push(make(i, true));
      const close1 = i > 0 ? b[i - 1].close : NaN;
      const bearMit = mitigation === 'Close' ? close1 : b[i].high;
      const bullMit = mitigation === 'Close' ? close1 : b[i].low;
      let bear = false, bull = false;
      for (let k = shortBoxes.length - 1; k >= 0; k--) {
        const bx = shortBoxes[k];
        const top = bx.deleted ? NaN : bx.top, bot = bx.deleted ? NaN : bx.bottom;
        if (bearMit > top) { shortBoxes.splice(k, 1); bx.deleted = true; }
        if (b[i].high > bot) bear = true;
      }
      for (let k = longBoxes.length - 1; k >= 0; k--) {
        const bx = longBoxes[k];
        const top = bx.deleted ? NaN : bx.top, bot = bx.deleted ? NaN : bx.bottom;
        if (bullMit < bot) { longBoxes.splice(k, 1); bx.deleted = true; }
        if (b[i].low < top) bull = true;
      }
      if (bear) alerts.push({ time: b[i].time, message: 'Price inside Bearish OB' });
      if (bull) alerts.push({ time: b[i].time, message: 'Price inside Bullish OB' });
    }
    return { boxes: all.filter((x) => !x.deleted), created: all.length, alerts };
  }
  for (const [name, list, inputs] of [
    ['walk', bars, {}], ['walk 4242', bars2, {}], ['plateaus', flat, {}], ['walk, Wick, sensitivity 10', bars, { mitigationType: 'Wick' as const, sensitivity: 10 }],
  ] as const) {
    it(`draws only the boxes not yet mitigated, from their candle to the right (${name})`, () => {
      const cfg = { ...obs.defaultInputs, ...inputs };
      const ref = reference(list, cfg.sensitivity, cfg.mitigationType);
      expect(ref.created).toBeGreaterThan(20);
      const r = obs.calculate(list, inputs);
      expect(r.boxes.map((x) => [x.time1, x.time2, x.price1, x.price2])).toEqual(
        ref.boxes.map((x) => [list[x.left].time, list[x.left].time, x.top, x.bottom]));
      for (const [k, box] of r.boxes.entries()) {
        const bull = ref.boxes[k].bull;
        expect(box).toMatchObject({
          extend: 'right', borderWidth: 1,
          bgColor: bull ? 'rgba(100,196,172,0.15)' : 'rgba(80,108,211,0.15)', borderColor: bull ? '#5db49e' : '#4760bb',
        });
      }
      expect(r.boxes.length).toBeLessThan(ref.created);
      expect(r.alertCalls.map((x) => ({ time: x.time, message: x.message }))).toEqual(ref.alerts);
      expect(r.alertCalls.every((x) => x.freq === 'once_per_bar')).toBe(true);
    });
  }
  it('no OB on the first cross; the current bar when no candle of the colour is 4..15 bars back; deleted on mitigation', () => {
    // flat opens, then a jump of the open (ROC cross over) twice, far apart; all candles green (close > open)
    const mk = (i: number, o: number, c: number, h = Math.max(o, c) + 0.5, l = Math.min(o, c) - 0.5): Bar =>
      ({ time: 1e9 + i * 86400, open: o, high: h, low: l, close: c, volume: 1 });
    const list: Bar[] = [];
    for (let i = 0; i < 20; i++) list.push(mk(i, 100, 100.2));
    list.push(mk(20, 102, 102.2)); // first cross over: cross_index[1] is na, no OB
    for (let i = 21; i < 39; i++) list.push(mk(i, 102, 102.2));
    list.push(mk(39, 102, 103.9)); // previous close above the box bottom (Close mitigation reads close[1])
    list.push(mk(40, 104, 104.2)); // second cross over: no red candle 4..15 back, box on this bar
    for (let i = 41; i < 50; i++) list.push(mk(i, 104, 104.2, 105, 103.5));
    const r = obs.calculate(list);
    expect(r.boxes).toEqual([{
      time1: list[40].time, price1: 104.7, time2: list[40].time, price2: 103.5,
      bgColor: 'rgba(100,196,172,0.15)', borderColor: '#5db49e', borderWidth: 1, extend: 'right',
    }]);
    // a close below the bottom (the previous close, Close mitigation) deletes it
    list.push(mk(50, 104, 103), mk(51, 104, 103)); // no ROC change
    expect(obs.calculate(list).boxes).toEqual([]);
    expect(obs.calculate(list.slice(0, 51)).boxes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('ichimoku-oscillator: trend state of the original', () => {
  type Cfg = typeof ichimoku.defaultInputs;
  function reference(b: Bar[], cfg: Cfg) {
    const n = b.length;
    const close = b.map((x) => x.close), high = b.map((x) => x.high), low = b.map((x) => x.low);
    const don = (len: number) => {
      const h = extreme(high, len, false), l = extreme(low, len, true);
      return h.map((v, i) => (l[i] + v) / 2);
    };
    const conv = don(cfg.conversionPeriods), base = don(cfg.basePeriods);
    const lead1 = conv.map((v, i) => (v + base[i]) / 2), lead2 = don(cfg.laggingSpan);
    const d = cfg.displacement - 1;
    const mn = (x: number, y: number) => (isNaN(x) || isNaN(y) ? NaN : Math.min(x, y));
    const mx = (x: number, y: number) => (isNaN(x) || isNaN(y) ? NaN : Math.max(x, y));
    const cMin = close.map((_, i) => mn(at(lead1, i - d), at(lead2, i - d)));
    const cMax = close.map((_, i) => mx(at(lead1, i - d), at(lead2, i - d)));
    const tole = atr(b, cfg.atrLen).map((v) => (cfg.useAtr ? v * cfg.atrMult : 0));
    const mtrend: number[] = [], trend: number[] = [], entry: number[] = [];
    const osc: number[] = [], lag: number[] = [], cb: number[] = [], cloud: number[] = [];
    let m = 0, t = 0, e = NaN;
    for (let i = 0; i < n; i++) {
      const c = close[i];
      const m1 = i > 0 ? mtrend[i - 1] : NaN;
      m = c > cMax[i] ? 1 : c < cMin[i] ? -1 : m;
      mtrend.push(m);
      osc.push(m === 1 ? c - cMin[i] : c - cMax[i]);
      lag.push(osc[i] + (m === 1 ? mx(c - at(cMax, i - d), 0) : mn(c - at(cMin, i - d), 0)));
      cb.push(lag[i] + (m === 1 ? mx(conv[i] - base[i], 0) : mn(conv[i] - base[i], 0)));
      cloud.push(cb[i] + (m === 1 ? mx(lead1[i] - lead2[i], 0) : mn(lead1[i] - lead2[i], 0)));
      const rising = conv[i] - at(conv, i - 1) > 0 || base[i] - at(base, i - 1) > 0;
      const falling = conv[i] - at(conv, i - 1) < 0 || base[i] - at(base, i - 1) < 0;
      if (m === 1) {
        if (m1 === -1) t = 0;
        if (t < 4 && c > cMax[i]) {
          t = (lag[i] > osc[i] ? 1 : 0) + (conv[i] >= base[i] && rising ? 1 : 0) + (lead1[i] >= lead2[i] ? 1 : 0) + 1;
          if (t === 4) e = c;
        } else if (conv[i] < base[i] - tole[i]) t = 0;
      } else if (m === -1) {
        if (m1 === 1) t = 0;
        if (t > -4 && c < cMin[i]) {
          t = (lag[i] < osc[i] ? -1 : 0) - (conv[i] <= base[i] && falling ? 1 : 0) - (lead1[i] <= lead2[i] ? 1 : 0) - 1;
          if (t === -4) e = c;
        } else if (conv[i] > base[i] + tole[i]) t = 0;
      }
      trend.push(t);
      entry.push(e);
    }
    return { mtrend, trend, entry, osc, lag, cb, cloud, ema: ema(cloud, cfg.emaLen), cMin, cMax, conv, base };
  }
  const idx = (n: number, f: (i: number) => boolean) => Array.from({ length: n }, (_, i) => i).filter((i) => i > 0 && f(i));

  it("declares the original's lengths and the ATR inputs", () => {
    expect(ichimoku.defaultInputs).toMatchObject({ conversionPeriods: 8, basePeriods: 13, laggingSpan: 26, displacement: 13, useAtr: true, atrLen: 9, atrMult: 2 });
    const byId = (id: string) => ichimoku.inputConfig.find((c) => c.id === id);
    expect(byId('conversionPeriods')).toMatchObject({ title: 'Conversion Line Length', defval: 8 });
    expect(byId('basePeriods')).toMatchObject({ title: 'Base Line Length', defval: 13 });
    expect(byId('laggingSpan')).toMatchObject({ title: 'Leading Span B Length', defval: 26 });
    expect(byId('displacement')).toMatchObject({ title: 'Lagging Span', defval: 13 });
    expect(byId('useAtr')).toMatchObject({ title: 'Use ATR', defval: true });
    expect(byId('atrLen')).toMatchObject({ title: ' Length', defval: 9 });
    expect(byId('atrMult')).toMatchObject({ title: ' Mult', defval: 2 });
  });

  const cases = [
    ['defaults, walk', bars, {}],
    ['defaults, walk 4242', bars2, {}],
    ['plateaus', flat, {}],
    ['9 / 26 / 52 / 26, no ATR', bars2, { conversionPeriods: 9, basePeriods: 26, laggingSpan: 52, displacement: 26, useAtr: false }],
    ['ATR 5 x 1', bars, { atrLen: 5, atrMult: 1 }],
  ] as const;
  for (const [name, list, inputs] of cases) {
    it(`layers, trend background, entries / exits and alerts as the original (${name})`, () => {
      const cfg = { ...ichimoku.defaultInputs, ...inputs } as Cfg;
      const ref = reference(list, cfg);
      const r = ichimoku.calculate(list, inputs);
      expectSeries(vals(r.plots.plot0), ref.cloud, 'cloud');
      expectSeries(vals(r.plots.plot1), ref.cb, 'ConvBase');
      expectSeries(vals(r.plots.plot2), ref.lag, 'Lagging');
      expectSeries(vals(r.plots.plot3), ref.osc, 'Oscline');
      expectSeries(vals(r.plots.plot4), ref.ema, 'emaline');
      // Lagging reads the cloud two displacements back
      const lead2Start = Math.max(cfg.laggingSpan, cfg.conversionPeriods, cfg.basePeriods) - 1;
      expect(firstValid(ref.osc)).toBe(lead2Start + cfg.displacement - 1);
      expect(firstValid(ref.lag)).toBe(lead2Start + 2 * (cfg.displacement - 1));
      // background on every bar from the trend (the zone colour inSRcolor has no transparency)
      const bg = ref.trend.map((t) => (t > 0 ? `rgba(0, ${159 + t ** 3}, 0, 0.4)` : t < 0 ? `rgba(0, 0, ${159 - t ** 3}, 0.4)` : '#d1d4dc'));
      expect(r.bgColors.map((g) => g.color)).toEqual(bg);
      expect(r.bgColors.map((g) => g.time)).toEqual(list.map((x) => x.time));
      expect(r.bgColors.every((g) => g.id === 'bgcolor0')).toBe(true);
      expect(ref.trend.filter((t) => t === 4).length).toBeGreaterThan(20);
      expect(ref.trend.filter((t) => t === -4).length).toBeGreaterThan(20);
      // shapes
      const T = ref.trend, n = list.length;
      const changed = (i: number) => T[i] !== T[i - 1];
      const closeTrade = idx(n, (i) => changed(i) && Math.abs(T[i - 1]) === 4);
      const upT = idx(n, (i) => T[i] === 4 && changed(i)), dnT = idx(n, (i) => T[i] === -4 && changed(i));
      const timesOf = (id: string) => r.markers.filter((mk) => mk.id === id).map((mk) => mk.time);
      expect(timesOf('shape0')).toEqual(closeTrade.map((i) => list[i].time));
      r.markers.filter((mk) => mk.id === 'shape0').forEach((mk, k) => {
        const i = closeTrade[k];
        expect(mk.price).toBeCloseTo(ref.cloud[i], 8);
        expect(mk.color).toBe(T[i - 1] > 0 ? '#FFFFFF' : '#FFEB3B');
      });
      expect(timesOf('shape1')).toEqual(upT.map((i) => list[i].time));
      expect(timesOf('shape3')).toEqual(dnT.map((i) => list[i].time));
      // partial take profit: shape5 at the cloud, coloured by the first matching cross, and its alert
      const cross = (a: number[], bb: number[], i: number) => a[i] > bb[i] && a[i - 1] <= bb[i - 1];
      const prof = (i: number) => (T[i] === 4 && list[i].close > ref.entry[i]) || (T[i] === -4 && list[i].close < ref.entry[i]);
      const exitCol = (i: number) => {
        if (!prof(i)) return null;
        if (T[i] === 4 && cross(ref.base, ref.conv, i)) return '#FFFFFF';
        if (T[i] === 4 && cross(ref.ema, ref.cloud, i)) return '#d1c4e9';
        if (T[i] === -4 && cross(ref.conv, ref.base, i)) return '#FFEB3B';
        if (T[i] === -4 && cross(ref.cloud, ref.ema, i)) return '#d1c4e9';
        return null;
      };
      const part = idx(n, (i) => exitCol(i) !== null);
      expect(r.markers.filter((mk) => mk.id === 'shape5').map((mk) => [mk.time, mk.color])).toEqual(part.map((i) => [list[i].time, exitCol(i)]));
      const partClose = idx(n, (i) => (T[i] === 4 && (cross(ref.base, ref.conv, i) || cross(ref.ema, ref.cloud, i)))
        || (T[i] === -4 && (cross(ref.conv, ref.base, i) || cross(ref.cloud, ref.ema, i))));
      const msgP = r.alertCalls.filter((x) => x.message.startsWith('Take Partial Profit')).map((x) => x.time);
      expect(msgP).toEqual(partClose.map((i) => list[i].time));
      // alerts follow the trend
      const msg = (p: string) => r.alertCalls.filter((x) => x.message.startsWith(p)).map((x) => x.time);
      expect(msg('Close Position')).toEqual(closeTrade.map((i) => list[i].time));
      expect(msg('Buy / Main')).toEqual(upT.map((i) => list[i].time));
      expect(msg('Sell / Main')).toEqual(dnT.map((i) => list[i].time));
    });
  }
  it('bounce-off triangles (shape2 / shape4) and the additional alerts follow the trend of the original', () => {
    const list = walk(6000, 31);
    const cfg = ichimoku.defaultInputs;
    const ref = reference(list, cfg);
    const n = list.length, T = ref.trend, c = list.map((x) => x.close);
    const inCloud = (i: number) => c[i] >= ref.cMin[i] && c[i] <= ref.cMax[i];
    const up = idx(n, (i) => T[i] === 4 && c[i] > ref.cMax[i] && inCloud(i - 1));
    const dn = idx(n, (i) => T[i] === -4 && c[i] < ref.cMin[i] && inCloud(i - 1));
    expect(up.length).toBeGreaterThan(2);
    expect(dn.length).toBeGreaterThan(2);
    const r = ichimoku.calculate(list, { bounceOff: true });
    const timesOf = (id: string) => r.markers.filter((mk) => mk.id === id).map((mk) => mk.time);
    expect(timesOf('shape2')).toEqual(up.map((i) => list[i].time));
    expect(timesOf('shape4')).toEqual(dn.map((i) => list[i].time));
    const msg = (p: string) => r.alertCalls.filter((x) => x.message.startsWith(p)).map((x) => x.time);
    expect(msg('Buy / Additonal')).toEqual(up.map((i) => list[i].time));
    expect(msg('Sell / Additonal')).toEqual(dn.map((i) => list[i].time));
  });
  it('trend 0 (zone colour) while the cloud warms up, ATR from bar atrLen - 1', () => {
    const cfg = ichimoku.defaultInputs;
    const r = ichimoku.calculate(bars);
    expect(firstValid(atr(bars, cfg.atrLen))).toBe(cfg.atrLen - 1);
    // CloudMax exists from bar 25 + 12 = 37: no trend before
    expect(r.bgColors.slice(0, 37).every((g) => g.color === '#d1d4dc')).toBe(true);
    expect(vals(r.plots.plot3).slice(0, 37).every(isNaN)).toBe(true);
    expect(vals(r.plots.plot3)[37]).not.toBeNaN();
  });
});
