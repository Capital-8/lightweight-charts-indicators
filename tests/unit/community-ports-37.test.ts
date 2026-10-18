/**
 * Community ports, batch 37: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers / arrows / bar and background colours.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as ssl from '../../src/community/ssl-hybrid-scalper';
import * as smh from '../../src/community/standardized-macd-ha';
import * as spdi from '../../src/community/statistical-price-deviation-index';
import * as stc from '../../src/community/stc-indicator-a-better-macd';
import * as sfg from '../../src/community/std-filtered-n-pole-gaussian-filter';
import * as svx from '../../src/community/stoch-vx3';
import * as sott from '../../src/community/stochastic-ott';
import * as sbf from '../../src/community/strong-burst-fader-projectsyndicate';
import * as sds from '../../src/community/strong-demands-supplies-liquidity-zonas-de';
import * as sg from '../../src/community/super-guppy';
import * as gmma from '../../src/community/gmma';
import * as sob from '../../src/community/super-orderblock-fvg-bos';
import * as ssma from '../../src/community/super-sma-5-8-13-ema-20-200-regime-filter';
import * as sst from '../../src/community/super-supertrend';
import * as sbt from '../../src/community/superbollingertrend';
import * as ssmo from '../../src/community/supersmoother-ma-oscillator';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'ssl-hybrid-scalper': [['alert0', 'Buy Alert', 'Bullish signal detected'], ['alert1', 'Sell Alert', 'Bearish signal detected']],
  'standardized-macd-ha': [
    ['alert0', 'Overbought', 'OB Signal'], ['alert1', 'Oversold  ', 'OS Signal'],
    ['alert2', 'Midline Crossover ', 'Bullish Trend'], ['alert3', 'Midline Crossunder', 'Bearish Trend'],
    ['alert4', 'Positive Heikin-Ashi', 'Heikin-Ashi Uptrend  '], ['alert5', 'Negative Heikin-Ashi', 'Heikin-Ashi Downtrend'],
    ['alert6', 'MACD Bull Cross', 'MACD Bullish Cross'], ['alert7', 'MACD Bear Cross', 'MACD Bearish Cross'],
  ],
  'statistical-price-deviation-index': [
    ['alert0', 'Price Top Alert', 'SPDI — Price MAD OSC entered TOP extreme'],
    ['alert1', 'Price Bot Alert', 'SPDI — Price MAD OSC entered BOTTOM extreme'],
    ['alert2', 'VWMA Top Alert', 'SPDI — VWMA DISP OSC entered TOP extreme'],
    ['alert3', 'VWMA Bot Alert', 'SPDI — VWMA DISP OSC entered BOTTOM extreme'],
    ['alert4', 'Confluence Top Alert', 'SPDI — BOTH Price MAD and VWMA DISP in TOP extreme (confluence).'],
    ['alert5', 'Confluence Bottom Alert', 'SPDI — BOTH Price MAD and VWMA DISP in BOTTOM extreme (confluence).'],
  ],
  'std-filtered-n-pole-gaussian-filter': [
    ['alert0', 'Long', 'STD-Filtered, N-Pole Gaussian Filter [Loxx]: Long\nSymbol: {{ticker}}\nPrice: {{close}}'],
    ['alert1', 'Short', 'STD-Filtered, N-Pole Gaussian Filter [Loxx]: Short\nSymbol: {{ticker}}\nPrice: {{close}}'],
  ],
  'stochastic-ott': [
    ['alert0', 'Price Cross Alert', 'OTT - Price Crossing!'],
    ['alert1', 'Price Crossover Alarm', 'PRICE OVER OTT - BUY SIGNAL!'],
    ['alert2', 'Price Crossunder Alarm', 'PRICE UNDER OTT - SELL SIGNAL!'],
  ],
  'strong-burst-fader-projectsyndicate': [
    ['alert0', 'Burst Fader — Up burst (fade short)', 'Up burst peaked above the band — fade-short candidate.'],
    ['alert1', 'Burst Fader — Down burst (fade long)', 'Down burst peaked below the band — fade-long candidate.'],
    ['alert2', 'Burst Fader — Extreme up', 'Up burst peaked at max stack — heavily over-extended.'],
    ['alert3', 'Burst Fader — Extreme down', 'Down burst peaked at max stack — heavily over-extended.'],
  ],
  'strong-demands-supplies-liquidity-zonas-de': [
    ['alert0', 'Bullish Engulfing', '[CurrencyPair] [TimeFrame], Bullish candle engulfing previous candle'],
    ['alert1', 'Bearish Engulfing', '[CurrencyPair] [TimeFrame], Bearish candle engulfing previous candle'],
  ],
  'super-sma-5-8-13-ema-20-200-regime-filter': [['alert0', 'Buy Condition', 'Buy Alert!'], ['alert1', 'Sell Condition', 'Sell Alert!']],
  superbollingertrend: [
    ['alert0', 'Long Alert', 'Long Signal'], ['alert1', 'Short Alert', 'Short Signal'],
    ['alert2', 'Long TP Alert', 'Long TP'], ['alert3', 'Short TP Alert', 'Short TP'],
  ],
};

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
const bars = walk(1200, 37);
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
/** times of `t` from bar index `from` on */
const from = (t: number[], k: number) => t.filter((x) => x >= (bars[k].time as number));

describe('declarations of the alertconditions', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'ssl-hybrid-scalper': ssl, 'standardized-macd-ha': smh, 'statistical-price-deviation-index': spdi,
    'std-filtered-n-pole-gaussian-filter': sfg, 'stochastic-ott': sott, 'strong-burst-fader-projectsyndicate': sbf,
    'strong-demands-supplies-liquidity-zonas-de': sds, 'super-sma-5-8-13-ema-20-200-regime-filter': ssma,
    superbollingertrend: sbt,
  };
  for (const [id, m] of Object.entries(mods)) {
    it(id, () => expect(decls(m)).toEqual(SPEC[id]));
  }
  it('alert() flags', () => {
    expect(smh.hasAlertFunction).toBe(true);
    expect(stc.hasAlertFunction).toBe(true);
    expect(sds.hasAlertFunction).toBe(true);
  });
});

describe('ssl-hybrid-scalper', () => {
  const r = ssl.calculate(bars);
  it('buy / sell alerts = crossover / crossunder of the EMAs with the RSI and trend filters', () => {
    const fast = A(ta.ema(S(close), 8));
    const slow = A(ta.ema(S(close), 21));
    const trend = A(ta.ema(S(close), 50));
    const rsi = A(ta.rsi(S(close), 14));
    const up = xover(fast, slow), dn = xunder(fast, slow);
    const buy = bars.map((b, i) => up[i] && lt(rsi[i], 70) && gt(b.close, trend[i]));
    const sell = bars.map((b, i) => dn[i] && gt(rsi[i], 30) && lt(b.close, trend[i]));
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    expect(times(r, 0).length + times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(r.markers.filter((m) => m.shape === 'labelUp').map((m) => m.time));
  });
});

describe('standardized-macd-ha', () => {
  const r = smh.calculate(bars);
  const c = r.plotCandles.candle0;
  const o = c.map((x) => x.open), h = c.map((x) => x.high), l = c.map((x) => x.low), cl = c.map((x) => x.close);
  const sig = vals(r.plots.signal as { value: number }[]);
  const cuo = xunder(cl, o), coo = xover(cl, o);
  const expected = [
    cuo.map((x, i) => x && h[i] > 100),
    coo.map((x, i) => x && l[i] < -100),
    xover(cl, 0),
    xunder(cl, 0),
    cuo.map((x, i) => x && !(h[i] > 100)),
    coo.map((x, i) => x && !(l[i] < -100)),
    xover(cl, sig),
    xunder(cl, sig),
  ];
  it('8 conditions = the crosses of the HA close (after the drawn warm-up)', () => {
    for (let k = 0; k < 8; k++) expect(from(times(r, k), 30)).toEqual(from(timeAt(bars, expected[k]), 30));
    expect(times(r, 2).length).toBeGreaterThan(0);
    expect(times(r, 6).length).toBeGreaterThan(0);
  });
  it('alert() calls: the message of the first true condition, once per bar close', () => {
    const want: { time: number; message: string; freq: string }[] = [];
    for (const b of bars) {
      const k = r.alerts.findIndex((a) => a.times.includes(b.time as number));
      if (k >= 0) want.push({ time: b.time as number, message: SPEC['standardized-macd-ha'][k][2], freq: 'once_per_bar_close' });
    }
    expect(r.alertCalls).toEqual(want);
    expect(want.length).toBeGreaterThan(0);
  });
});

describe('statistical-price-deviation-index', () => {
  it('single-series alerts off by default; confluence alerts on', () => {
    const r = spdi.calculate(bars);
    const p = vals(r.plots.plot0 as { value: number }[]), v = vals(r.plots.plot1 as { value: number }[]);
    for (let k = 0; k < 4; k++) expect(times(r, k)).toEqual([]);
    expect(times(r, 4)).toEqual(timeAt(bars, p.map((x, i) => ge(x, 0.8) && ge(v[i], 0.8))));
    expect(times(r, 5)).toEqual(timeAt(bars, p.map((x, i) => le(x, -0.8) && le(v[i], -0.8))));
    expect(times(r, 4).length + times(r, 5).length).toBeGreaterThan(0);
  });
  it('single-series alerts when enabled', () => {
    const r = spdi.calculate(bars, { alertsPriceOnly: true, alertsVwmaOnly: true });
    const p = vals(r.plots.plot0 as { value: number }[]), v = vals(r.plots.plot1 as { value: number }[]);
    expect(times(r, 0)).toEqual(timeAt(bars, p.map((x) => ge(x, 0.8))));
    expect(times(r, 1)).toEqual(timeAt(bars, p.map((x) => le(x, -0.8))));
    expect(times(r, 2)).toEqual(timeAt(bars, v.map((x) => ge(x, 0.8))));
    expect(times(r, 3)).toEqual(timeAt(bars, v.map((x) => le(x, -0.8))));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 3).length).toBeGreaterThan(0);
  });
});

describe('stc-indicator-a-better-macd', () => {
  it('alert() calls Red / Green on the turns beyond 75 / 25, once per bar', () => {
    const seen = new Set<string>();
    for (const list of [bars, walk(1200, 11), walk(1500, 3)]) {
      const r = stc.calculate(list);
      const m = vals(r.plots.plot0 as { value: number }[]);
      const at = (i: number) => (i >= 0 ? m[i] : NaN);
      const want: { time: number; message: string; freq: string }[] = [];
      list.forEach((b, i) => {
        if (le(at(i - 3), at(i - 2)) && gt(at(i - 2), at(i - 1)) && gt(at(i), 75)) want.push({ time: b.time as number, message: 'Red', freq: 'once_per_bar' });
        if (ge(at(i - 3), at(i - 2)) && lt(at(i - 2), at(i - 1)) && lt(at(i), 25)) want.push({ time: b.time as number, message: 'Green', freq: 'once_per_bar' });
      });
      expect(r.alertCalls).toEqual(want);
      want.forEach((c) => seen.add(c.message));
    }
    expect([...seen].sort()).toEqual(['Green', 'Red']);
  });
});

describe('std-filtered-n-pole-gaussian-filter', () => {
  const r = sfg.calculate(bars);
  it('Long / Short = the turns of the filter after an opposite turn', () => {
    const out = vals(r.plots.plot0 as { value: number }[]);
    const nz = (x: number) => (Number.isFinite(x) ? x : 0);
    const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
    let contsw = 0;
    const L: boolean[] = [], Sh: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const o = out[i], sg1 = nz(out[i - 1]), o1 = nz(out[i - 1]), s1 = nz(out[i - 2]);
      const pl = gt(o, sg1) && (lt(o1, s1) || eq(o1, s1));
      const ps = lt(o, sg1) && (gt(o1, s1) || eq(o1, s1));
      L.push(pl && contsw === -1);
      Sh.push(ps && contsw === 1);
      contsw = pl ? 1 : ps ? -1 : contsw;
    }
    expect(times(r, 0)).toEqual(timeAt(bars, L));
    expect(times(r, 1)).toEqual(timeAt(bars, Sh));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(r.markers.filter((m) => m.text === 'L').map((m) => m.time));
  });
});

describe('stoch-vx3 (style)', () => {
  const r = svx.calculate(bars) as { plots: Record<string, { time: number; value: number; color?: string }[]> } & { markers?: unknown };
  it('the cross circles are a plot (as the original), no markers', () => {
    expect(r.markers).toBeUndefined();
    // plot2 is the percentile rank line; the circles are the fourth plot (plot3), as in the original
    expect(svx.plotConfig.find((p) => p.id === 'plot3')?.style).toBe('circles');
    const k = vals(r.plots.plot0), d = vals(r.plots.plot1), c = vals(r.plots.plot3);
    const cross = xover(d, k).map((x, i) => x || xunder(d, k)[i]);
    c.forEach((v, i) => (cross[i] ? expect(v).toBe(d[i]) : expect(v).toBeNaN()));
    expect(cross.filter(Boolean).length).toBeGreaterThan(0);
  });
});

describe('stochastic-ott', () => {
  const r = sott.calculate(bars, { kLen: 50, kSmooth: 20 });
  it('cross / crossover / crossunder of %K + 1000 and OTT[2]', () => {
    const src = vals(r.plots.plot0 as { value: number }[]);
    const ott2 = vals(r.plots.plot1 as { value: number }[]);
    const up = xover(src, ott2), dn = xunder(src, ott2);
    const k0 = 75;
    expect(from(times(r, 1), k0)).toEqual(from(timeAt(bars, up), k0));
    expect(from(times(r, 2), k0)).toEqual(from(timeAt(bars, dn), k0));
    expect(from(times(r, 0), k0)).toEqual(from(timeAt(bars, up.map((u, i) => u || dn[i])), k0));
    expect(from(times(r, 1), k0).length).toBeGreaterThan(0);
  });
});

describe('strong-burst-fader-projectsyndicate', () => {
  const r = sbf.calculate(bars);
  const SHAPES = new Set(Array.from({ length: 14 }, (_, k) => `shape${k}`));
  it('peak / extreme alerts', () => {
    const basis = A(ta.ema(S(close), 20));
    const atr = A(ta.atr(bars, 14));
    const m0 = (side: 1 | -1) => bars.map((b, i) => {
      const ext = side === 1 ? b.high - (basis[i] + 2 * atr[i]) : basis[i] - 2 * atr[i] - b.low;
      const mag = gt(atr[i], 0) ? ext / atr[i] : 0;
      return gt(ext, 0) ? Math.max(0, mag) : 0;
    });
    const up = m0(1), dn = m0(-1);
    const peak = (m: number[]) => m.map((x, i) => i >= 2 && gt(m[i - 1], 0) && ge(m[i - 1], m[i - 2]) && gt(m[i - 1], x));
    const lvl = (m: number[], i: number) => Math.min(6, 1 + Math.trunc(m[i - 1] / 0.5));
    const upP = peak(up), dnP = peak(dn);
    expect(times(r, 0)).toEqual(timeAt(bars, upP));
    expect(times(r, 1)).toEqual(timeAt(bars, dnP));
    expect(times(r, 2)).toEqual(timeAt(bars, upP.map((p, i) => p && lvl(up, i) >= 6)));
    expect(times(r, 3)).toEqual(timeAt(bars, dnP.map((p, i) => p && lvl(dn, i) >= 6)));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });
  it('style ids on every marker: Up k / Dn k diamonds, fade triangles', () => {
    expect(r.markers.length).toBeGreaterThan(0);
    for (const m of r.markers) expect(SHAPES.has(m.id!)).toBe(true);
    // the up stack of each peak bar: shape0..shape(k-1); down: shape6..
    const byTime = new Map<number, string[]>();
    for (const m of r.markers) byTime.set(m.time, [...(byTime.get(m.time) ?? []), m.id!]);
    for (const m of r.markers) {
      const k = Number(m.id!.slice(5));
      if (m.shape === 'diamond') {
        const first = k < 6 ? 0 : 6;
        for (let j = first; j < k; j++) expect(byTime.get(m.time)).toContain(`shape${j}`);
      } else {
        expect(m.id).toBe(m.shape === 'triangleDown' ? 'shape12' : 'shape13');
      }
    }
    expect(r.markers.some((m) => m.id === 'shape6')).toBe(true);
  });
});

describe('strong-demands-supplies-liquidity-zonas-de', () => {
  const chart = { tickerid: 'NASDAQ:TEST' };
  const r = sds.calculate(bars, { showPreviousDayHighLow: false }, chart);
  it('engulfing alerts', () => {
    const bull = bars.map((b, i) => i > 0 && le(b.open, close[i - 1]) && lt(b.open, bars[i - 1].open) && gt(b.close, bars[i - 1].open));
    const bear = bars.map((b, i) => i > 0 && ge(b.open, close[i - 1]) && gt(b.open, bars[i - 1].open) && lt(b.close, bars[i - 1].open));
    expect(times(r, 0)).toEqual(timeAt(bars, bull));
    expect(times(r, 1)).toEqual(timeAt(bars, bear));
    expect(times(r, 0).length).toBeGreaterThan(0);
  });
  it('alert() calls: sell-side liquidity detected (with the ticker) and crossed, once per bar', () => {
    const r = sds.calculate(walk(1200, 7), { showPreviousDayHighLow: false }, chart);
    const msgs = new Set(r.alertCalls.map((c) => c.message));
    expect([...msgs].sort()).toEqual(['Price crossed sellside liquidity level', 'sellside liquidity level detected/updated for TEST']);
    for (const c of r.alertCalls) expect(c.freq).toBe('once_per_bar');
    const keys = r.alertCalls.map((c) => `${c.time}|${c.message}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('super-guppy (style)', () => {
  const r = sg.calculate(bars);
  it('plotarrow outputs as arrows with the spec ids, no markers', () => {
    expect((r as { markers?: unknown }).markers).toBeUndefined();
    expect(r.arrows.length).toBeGreaterThan(0);
    for (const a of r.arrows) {
      expect(['arrow0', 'arrow1', 'arrow2', 'arrow3']).toContain(a.id);
      expect(Math.sign(a.value)).toBe(a.id === 'arrow0' || a.id === 'arrow2' ? 1 : -1);
    }
    expect(new Set(r.arrows.map((a) => a.id)).size).toBe(4);
  });
  it('break arrows equal the Super Guppy break arrows of the GMMA port (same rules)', () => {
    const g = gmma.calculate(bars);
    const pick = (list: { time: unknown; id: string; value: number }[]) =>
      list.filter((a) => a.id === 'arrow2' || a.id === 'arrow3').map((a) => [a.time, a.id, a.value]);
    expect(pick(r.arrows)).toEqual(pick(g.arrows));
  });
});

describe('super-orderblock-fvg-bos (style)', () => {
  const r = sob.calculate(bars);
  it('HVB bar colours carry barcolor0 (bullish) / barcolor1 (bearish)', () => {
    expect(r.barColors.length).toBeGreaterThan(0);
    for (const c of r.barColors) {
      const b = bars.find((x) => x.time === c.time)!;
      expect(c.id).toBe(b.close > b.open ? 'barcolor0' : 'barcolor1');
    }
    expect(new Set(r.barColors.map((c) => c.id)).size).toBe(2);
  });
});

describe('super-sma-5-8-13-ema-20-200-regime-filter', () => {
  const r = ssma.calculate(bars);
  it('buy / sell alerts', () => {
    const m5 = A(ta.sma(S(close), 5)), m8 = A(ta.sma(S(close), 8)), m13 = A(ta.sma(S(close), 13));
    const cross = xover(m5, m13).map((x, i) => x || xunder(m5, m13)[i]);
    expect(times(r, 0)).toEqual(timeAt(bars, cross.map((c, i) => c && gt(m5[i], m13[i]))));
    expect(times(r, 1)).toEqual(timeAt(bars, cross.map((c, i) => c && lt(m5[i], m8[i]) && lt(m5[i], m13[i]))));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });
});

describe('super-supertrend (style)', () => {
  const r = sst.calculate(bars);
  it('trend flips as arrows (arrow0..arrow5), shapes at the bottom with shape0..shape5', () => {
    const flips: [number, string, number][] = [];
    ['plot0', 'plot1', 'plot2'].forEach((p, k) => {
      const pts = r.plots[p] as { time: number; value: number; color?: string }[];
      for (let i = 11; i < n; i++) {
        const up = pts[i].color === '#26A69A', wasUp = pts[i - 1].color === '#26A69A';
        if (up && !wasUp) flips.push([pts[i].time, `arrow${2 * k}`, 1]);
        if (!up && wasUp) flips.push([pts[i].time, `arrow${2 * k + 1}`, -1]);
      }
    });
    const got = r.arrows.map((a) => [a.time, a.id, a.value] as [number, string, number]);
    const key = (x: [number, string, number]) => `${x[0]}|${x[1]}`;
    expect(got.map(key).sort()).toEqual(flips.map(key).sort());
    for (const a of r.arrows) expect(Math.sign(a.value)).toBe(Number(a.id.slice(5)) % 2 === 0 ? 1 : -1);
    expect(r.markers.length).toBeGreaterThan(0);
    for (const m of r.markers) {
      expect(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']).toContain(m.id);
      expect(m.position).toBe('bottom');
    }
    // UpShape: close crossing over the line
    const st1 = vals(r.plots.plot0 as { value: number }[]);
    const up1 = xover(close, st1);
    expect(r.markers.filter((m) => m.id === 'shape0').map((m) => m.time)).toEqual(timeAt(bars, up1.map((x, i) => x && i > 10)));
  });
});

describe('superbollingertrend', () => {
  /** The original's line, zigzag and take-profit level, re-computed */
  function expected(showTP: boolean) {
    const sh = A(ta.sma(S(high), 12)), dh = A(ta.stdev(S(high), 12));
    const sl = A(ta.sma(S(low), 12)), dl = A(ta.stdev(S(low), 12));
    let s = 0;
    let p1c = NaN, p1s = NaN, p2c = NaN, p2s = NaN;
    const zzY: number[] = [], diff: number[] = [];
    const f: boolean[][] = [[], [], [], []];
    for (let i = 0; i < n; i++) {
      const c = close[i];
      const up = sh[i] + dh[i] * 2, dn = sl[i] - dl[i] * 2;
      const rule = () => { s = isNaN(dn) || isNaN(up) ? 0 : gt(c, s) ? Math.max(s, dn) : lt(c, s) ? Math.min(s, up) : 0; };
      let L = false, Sh = false, LT = false, ST = false;
      const zig = () => { if (zzY.length > 0) diff.unshift(Math.abs(s - zzY[0])); zzY.unshift(s); };
      const in1 = s; const x1 = c > in1 && p1c <= p1s; p1c = c; p1s = in1;
      rule();
      if (x1) { s = dn; zig(); L = true; Sh = false; }
      const in2 = s; const x2 = c < in2 && p2c >= p2s; p2c = c; p2s = in2;
      rule();
      if (x2) { s = up; zig(); L = false; Sh = true; }
      if (showTP && zzY.length > 0) {
        const sorted = [...diff].sort((a, b) => a - b);
        const m = sorted.length === 0 ? NaN : sorted.length % 2 ? sorted[(sorted.length - 1) / 2]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        const pos = gt(c, s);
        const y = pos ? zzY[0] + m : zzY[0] - m;
        LT = pos ? ge(high[i], y) && lt(high[i - 1], y) : false;
        ST = pos ? false : le(low[i], y) && gt(low[i - 1], y);
      }
      f[0].push(L); f[1].push(Sh); f[2].push(LT); f[3].push(ST);
    }
    return f;
  }
  it('Long / Short on the crosses of the line; no TP alerts without Take Profit', () => {
    const r = sbt.calculate(bars);
    const f = expected(false);
    expect(times(r, 0)).toEqual(timeAt(bars, f[0]));
    expect(times(r, 1)).toEqual(timeAt(bars, f[1]));
    expect(times(r, 2)).toEqual([]);
    expect(times(r, 3)).toEqual([]);
    expect(times(r, 0).length).toBeGreaterThan(0);
  });
  it('TP alerts with Take Profit on', () => {
    const r = sbt.calculate(bars, { showTP: true });
    const f = expected(true);
    for (let k = 0; k < 4; k++) expect(times(r, k)).toEqual(timeAt(bars, f[k]));
    expect(times(r, 2).length + times(r, 3).length).toBeGreaterThan(0);
  });
});

describe('supersmoother-ma-oscillator (style)', () => {
  const r = ssmo.calculate(bars);
  it('ids on markers, background and bar colours', () => {
    const ids = new Set(r.markers.map((m) => m.id));
    expect([...ids].sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    for (const m of r.markers) {
      if (m.id === 'shape0' || m.id === 'shape2') expect(m.shape).toBe('triangleUp');
      else expect(m.shape).toBe('triangleDown');
    }
    expect([...new Set(r.bgColors.map((c) => c.id))].sort()).toEqual(['bgcolor0', 'bgcolor1']);
    expect(r.barColors.length).toBe(n);
    for (const c of r.barColors) expect(c.id).toBe('barcolor0');
  });
});
