/**
 * Community ports, batch 22: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the Style
 * ids on the emitted markers, the palette and the fills.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as lumina from '../../src/community/lumina-trend-channels';
import * as luminous from '../../src/community/luminous-mean-reversion-channels';
import * as luxy from '../../src/community/luxy-big-beautiful-dynamic-orb';
import * as ribbon from '../../src/community/ma-ribbon-5ema-20ema-50sma-200ema';
import * as sabres from '../../src/community/ma-sabres';
import * as adxPro from '../../src/community/macd-adx-pro-by-eternyworld';
import * as macdDiv from '../../src/community/macd-divergence';
import * as irtov from '../../src/community/macd-irtov';
import * as liq from '../../src/community/macd-liquidity-tracker-system';
import * as overlay from '../../src/community/macd-overlay-v1';
import * as pss from '../../src/community/macd-pseudo-super-smoother';
import * as reloaded from '../../src/community/macd-reloaded';
import * as rsiOverlay from '../../src/community/macd-rsi-overlay';
import * as sniper from '../../src/community/macd-sniper';
import * as macdSr from '../../src/community/macd-support-resistance';
import * as macdV from '../../src/community/macd-v';

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
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const specDecls = (titles: [string, string][]) => titles.map(([t, m], k) => [`alert${k}`, t, m]);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const idTimes = (items: { id?: string; time: unknown }[], id: string) => items.filter((m) => m.id === id).map((m) => m.time as number);
const sorted = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const hasIds = (items: { id?: string }[], ids: string[]) => items.every((m) => m.id !== undefined && ids.includes(m.id));

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
/** ta.ema with an SMA seed (na until `len` values) */
function ema(src: number[], len: number): number[] {
  const alpha = 2 / (len + 1);
  const out: number[] = [];
  let prev = NaN;
  let run: number[] = [];
  for (let i = 0; i < src.length; i++) {
    if (isNaN(prev)) {
      if (isNaN(src[i])) run = [];
      else run.push(src[i]);
      if (run.length >= len) prev = run.slice(-len).reduce((s, v) => s + v, 0) / len;
    } else if (!isNaN(src[i])) {
      prev = alpha * src[i] + (1 - alpha) * prev;
    }
    out.push(prev);
  }
  return out;
}
/** ta.atr: RMA of the true range, seeded with the SMA of the first `len` values */
function atr(list: Bar[], len: number): number[] {
  const tr = list.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - list[i - 1].close), Math.abs(b.low - list[i - 1].close))));
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < tr.length; i++) {
    if (i < len - 1) out.push(NaN);
    else if (i === len - 1) out.push((prev = tr.slice(0, len).reduce((s, v) => s + v, 0) / len));
    else out.push((prev = (prev * (len - 1) + tr[i]) / len));
  }
  return out;
}
/** Times of the bars after the bars of `times` by `k` */
const shifted = (list: Bar[], times: number[], k: number) => times.map((t) => list[list.findIndex((b) => b.time === t) + k].time as number);

describe('lumina-trend-channels', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(lumina)).toEqual(specDecls([
      ['Buy Signal', 'Lumina Channels: Bullish Entry Detected'],
      ['Sell Signal', 'Lumina Channels: Bearish Entry Detected'],
      ['Trend Change', 'Lumina Channels: Channel Trend Changed Color'],
    ]));
    expect(lumina.LuminaTrendChannels.alertConditions).toBe(lumina.alertConditions);
    const r = lumina.calculate(bars);
    const basis = ema(close, 21);
    // trend := rising(basis, 2) ? 1 : falling(basis, 2) ? -1 : trend (rising: two rises in a row)
    const trend: number[] = [];
    let tr = 1;
    basis.forEach((v, i) => {
      if (i >= 2 && gt(v, basis[i - 1]) && gt(basis[i - 1], basis[i - 2])) tr = 1;
      else if (i >= 2 && lt(v, basis[i - 1]) && lt(basis[i - 1], basis[i - 2])) tr = -1;
      trend.push(tr);
    });
    const buy = xover(close, basis).map((c, i) => c && trend[i] === 1);
    const sell = xunder(close, basis).map((c, i) => c && trend[i] === -1);
    const change = trend.map((v, i) => i > 0 && v !== trend[i - 1]);
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
    expect(r.alerts[2].times).toEqual(timeAt(bars, change));
    expect(r.alerts.every((a) => a.times.length > 0)).toBe(true);
  });
});

describe('luminous-mean-reversion-channels', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(luminous)).toEqual(specDecls([
      ['Bullish Mean Reversion', 'Price crossed back above the lower mean reversion band.'],
      ['Bearish Mean Reversion', 'Price crossed back below the upper mean reversion band.'],
    ]));
    expect(luminous.LuminousMeanReversionChannels.alertConditions).toBe(luminous.alertConditions);
    const length = 20, mult = 2;
    const r = luminous.calculate(bars, { length, mult });
    const a = atr(bars, length);
    const upper: number[] = [], lower: number[] = [];
    let avg = close[0], hold = 0, prev = NaN;
    close.forEach((src, i) => {
      const step = (isNaN(a[i]) ? 0 : a[i]) * mult;
      avg = gt(src - avg, step) ? avg + step : gt(avg - src, step) ? avg - step : avg;
      if (!isNaN(prev) && Math.abs(avg - prev) > EPS) hold = step / 2;
      prev = avg;
      upper.push(avg + hold * 2);
      lower.push(avg - hold * 2);
    });
    const buy = xover(close, lower), sell = xunder(close, upper);
    expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
  });
});

describe('ma-ribbon-5ema-20ema-50sma-200ema', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(ribbon)).toEqual(specDecls([
      ['Price Crossed Above 200 EMA', 'Price crossed ABOVE 200 EMA'],
      ['Price Crossed Below 200 EMA', 'Price crossed BELOW 200 EMA'],
      ['5 EMA Crossed Above 20 EMA', '5 EMA crossed ABOVE 20 EMA — Bullish'],
      ['5 EMA Crossed Below 20 EMA', '5 EMA crossed BELOW 20 EMA — Bearish'],
    ]));
    expect(ribbon.MaRibbon5ema20ema50sma200ema.alertConditions).toBe(ribbon.alertConditions);
    // the conditions do not depend on the lines shown
    const r = ribbon.calculate(bars, { show200ema: false, show5ema: false });
    const e5 = ema(close, 5), e20 = ema(close, 20), e200 = ema(close, 200);
    const exp = [xover(close, e200), xunder(close, e200), xover(e5, e20), xunder(e5, e20)];
    exp.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
  });
});

describe('ma-sabres', () => {
  it('gives the ids of the six plotshape outputs to the circles', () => {
    const r = sabres.calculate(bars, { count: 5, len: 20 });
    const ids = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5'];
    expect(r.markers.length).toBeGreaterThan(0);
    expect(hasIds(r.markers, ids)).toBe(true);
    // up: shape0-2 (tiny, small, normal) on the low of the bar before; down: shape3-5 on its high
    const size = { shape0: 'tiny', shape1: 'small', shape2: 'normal', shape3: 'tiny', shape4: 'small', shape5: 'normal' } as Record<string, string>;
    for (const m of r.markers) {
      expect(m.size).toBe(size[m.id!]);
      const b = bars.find((x) => x.time === m.time)!;
      expect(m.price).toBe(['shape0', 'shape1', 'shape2'].includes(m.id!) ? b.low : b.high);
    }
    expect(idTimes(r.markers, 'shape1')).toEqual(idTimes(r.markers, 'shape0'));
    expect(idTimes(r.markers, 'shape5')).toEqual(idTimes(r.markers, 'shape3'));
    expect(idTimes(r.markers, 'shape0').length + idTimes(r.markers, 'shape3').length).toBe(r.markers.length / 3);
  });
});

describe('macd-adx-pro-by-eternyworld', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(adxPro)).toEqual(specDecls([['Strong Buy', 'MACD Bullish Cross'], ['Strong Sell', 'MACD Bearish Cross']]));
    expect(adxPro.MacdAdxProByEternyworld.alertConditions).toBe(adxPro.alertConditions);
    const r = adxPro.calculate(bars);
    const macd = ema(close, 12).map((v, i) => v - ema(close, 26)[i]);
    const sig = ema(macd, 9);
    const hist = macd.map((v, i) => v - sig[i]);
    // Sensitive: hist > 0 and hist[1] <= 0 / hist < 0 and hist[1] >= 0
    const buy = hist.map((h, i) => i > 0 && gt(h, 0) && le(hist[i - 1], 0));
    const sell = hist.map((h, i) => i > 0 && lt(h, 0) && ge(hist[i - 1], 0));
    expect(buy.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
    // Filtered: the same crossings, only with the DI direction
    const f = adxPro.calculate(bars, { mode: 'Filtered' });
    expect(f.alerts[0].times.every((t) => r.alerts[0].times.includes(t))).toBe(true);
    expect(f.alerts[1].times.every((t) => r.alerts[1].times.includes(t))).toBe(true);
    expect(f.alerts[0].times.length).toBeLessThan(r.alerts[0].times.length);
  });
});

describe('macd-divergence', () => {
  it('declares the alertconditions and fires them on the bar that confirms each divergence label', () => {
    expect(decls(macdDiv)).toEqual(specDecls([
      ['Bull', 'Regular Bull Div {{ticker}} XXmin'],
      ['Bear', 'Regular Bear Div {{ticker}} XXmin'],
      ['H Bull', 'Hidden Bull Div {{ticker}} XXmin'],
      ['H Bear', 'Hidden Bear Div {{ticker}} XXmin'],
    ]));
    expect(macdDiv.MACDDivergence.alertConditions).toBe(macdDiv.alertConditions);
    const r = macdDiv.calculate(bars, { plotHiddenBull: true, plotHiddenBear: true, dontTouchZero: false, pivotLookback: 3, pivotLookbackLeft: 3, rangeLower: 2 });
    const ids = ['shape0', 'shape1', 'shape2', 'shape3'];
    expect(hasIds(r.markers, ids)).toBe(true);
    const text = { shape0: ' Bull ', shape1: ' H Bull ', shape2: ' Bear ', shape3: ' H Bear ' } as Record<string, string>;
    r.markers.forEach((m) => expect(m.text).toBe(text[m.id!]));
    // alert k: the label of shape (0, 2, 1, 3)[k] is drawn lbR = 3 bars back (offset = -lbR)
    expect(idTimes(r.markers, 'shape0').length * idTimes(r.markers, 'shape2').length * idTimes(r.markers, 'shape3').length).toBeGreaterThan(0);
    [0, 2, 1, 3].forEach((s, k) => {
      expect(r.alerts[k].times).toEqual(shifted(bars, idTimes(r.markers, `shape${s}`), 3));
    });
    // the hidden ones are off by default (constants of the original)
    const d = macdDiv.calculate(bars);
    expect(d.alerts[2].times).toEqual([]);
    expect(d.alerts[3].times).toEqual([]);
  });
});

describe('macd histogram turn alerts (macd-irtov, macd-pseudo-super-smoother, macd-v)', () => {
  const turns = (hist: number[]) => [
    hist.map((h, i) => i > 0 && ge(hist[i - 1], 0) && lt(h, 0)),
    hist.map((h, i) => i > 0 && le(hist[i - 1], 0) && gt(h, 0)),
  ];
  it('macd-irtov', () => {
    expect(decls(irtov)).toEqual(specDecls([
      ['Rising to falling', 'The MACD histogram switched from a rising to falling state'],
      ['Falling to rising', 'The MACD histogram switched from a falling to rising state'],
    ]));
    expect(irtov.MacdIrtov.alertConditions).toBe(irtov.alertConditions);
    const r = irtov.calculate(bars);
    const macd = ema(close, 12).map((v, i) => v - ema(close, 26)[i]);
    const sig = ema(macd, 9);
    const exp = turns(macd.map((v, i) => v - sig[i]));
    expect(exp[0].some(Boolean) && exp[1].some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, exp[0]));
    expect(r.alerts[1].times).toEqual(timeAt(bars, exp[1]));
  });
  it('macd-pseudo-super-smoother', () => {
    expect(decls(pss)).toEqual(specDecls([
      ['Rising to falling', 'The MACD histogram switched from a rising to falling state'],
      ['Falling to rising', 'The MACD histogram switched from a falling to rising state'],
    ]));
    expect(pss.MacdPseudoSuperSmoother.alertConditions).toBe(pss.alertConditions);
    const r = pss.calculate(bars);
    const exp = turns(vals(r.plots.plot0 as { value: number }[]));
    expect(exp[0].some(Boolean) && exp[1].some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, exp[0]));
    expect(r.alerts[1].times).toEqual(timeAt(bars, exp[1]));
  });
  it('macd-v', () => {
    expect(decls(macdV)).toEqual(specDecls([
      ['Rising to falling', 'MACD Volatility histogram switched from a rising to falling state'],
      ['Falling to rising', 'MACD Volatility histogram switched from a falling to rising state'],
    ]));
    expect(macdV.MACDV.alertConditions).toBe(macdV.alertConditions);
    const r = macdV.calculate(bars);
    const a = atr(bars, 26);
    const mv = ema(close, 12).map((v, i) => ((v - ema(close, 26)[i]) / a[i]) * 100);
    const sig = ema(mv, 9);
    const exp = turns(mv.map((v, i) => v - sig[i]));
    expect(exp[0].some(Boolean) && exp[1].some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, exp[0]));
    expect(r.alerts[1].times).toEqual(timeAt(bars, exp[1]));
  });
});

describe('macd-liquidity-tracker-system', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(liq)).toEqual(specDecls([
      ['Color: Dark Blue Transp', 'Dark Blue Transp color detected.'],
      ['Color: Dark Magenta Transp', 'Dark Magenta Transp color detected.'],
      ['Color: No Leverage Colors', 'Indicator shows Dark Blue T, Dark Magenta T, or Bright Magenta.'],
      ['Color: Bright Blue', 'Bright Blue (Leverage) color detected.'],
      ['Price Above MA', 'Price is above the selected MA.'],
      ['Price Below MA', 'Price is below the selected MA.'],
      ['Long Entry Signal Trigger', 'Long entry signal (triangle) detected.'],
      ['Short Entry Signal Trigger', 'Short entry signal (triangle) detected.'],
    ]));
    expect(liq.MacdLiquidityTrackerSystem.alertConditions).toBe(liq.alertConditions);
    const r = liq.calculate(bars, { signalDisplay: 'None' });
    expect(r.markers).toEqual([]);
    // MACD of the close and of the previous close (EMA 12 - EMA 26)
    const macdOf = (src: number[]) => ema(src, 12).map((v, i) => v - ema(src, 26)[i]);
    const cur = macdOf(close);
    const prev = macdOf(close.map((_c, i) => (i > 0 ? close[i - 1] : NaN)));
    const state = cur.map((m, i) => (gt(m, 0) ? (gt(m, prev[i]) ? 'BB' : 'DB') : le(m, 0) ? (lt(m, prev[i]) ? 'BM' : 'DM') : ''));
    const ma = ema(close, 50);
    const long = cur.map((m) => gt(m, 0)), short = cur.map((m) => lt(m, 0));
    const exp = [
      state.map((s) => s === 'DB'), state.map((s) => s === 'DM'), state.map((s) => s === 'DB' || s === 'DM' || s === 'BM'),
      state.map((s) => s === 'BB'), close.map((c, i) => gt(c, ma[i])), close.map((c, i) => lt(c, ma[i])),
      long.map((l, i) => l && !(i > 0 && long[i - 1])), short.map((s, i) => s && !(i > 0 && short[i - 1])),
    ];
    exp.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
  });
  it('gives the ids of the with / without text outputs to the triangles', () => {
    const withText = liq.calculate(bars);
    expect(withText.markers.length).toBeGreaterThan(0);
    expect(hasIds(withText.markers, ['shape0', 'shape1'])).toBe(true);
    expect(idTimes(withText.markers, 'shape0')).toEqual(withText.alerts[6].times);
    expect(idTimes(withText.markers, 'shape1')).toEqual(withText.alerts[7].times);
    const noText = liq.calculate(bars, { showText: false });
    expect(hasIds(noText.markers, ['shape2', 'shape3'])).toBe(true);
    expect(idTimes(noText.markers, 'shape2')).toEqual(withText.alerts[6].times);
  });
});

describe('macd-overlay-v1', () => {
  it('declares the alertconditions and gives the ids of the eight plotshape outputs', () => {
    expect(decls(overlay)).toEqual(specDecls([
      ['MACD Signal Cross Up', 'MACD crossed above Signal (primary).'],
      ['MACD Signal Cross Down', 'MACD crossed below Signal (primary).'],
      ['Weakness-Lite Flag', 'Weakness-Lite triggered on this bar.'],
    ]));
    expect(overlay.MacdOverlayV1.alertConditions).toBe(overlay.alertConditions);
    const ids = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7'];
    for (const inputs of [{}, { gateByWeak: false }, { gateByWeak: false, expansionOnlyOn: false }] as const) {
      const r = overlay.calculate(bars, inputs);
      expect(hasIds(r.markers, ids)).toBe(true);
      // every cross is one solid, faded or filtered (dot) shape: up = shape2 / shape4 / shape6, down = shape3 / 5 / 7
      const up = sorted(['shape2', 'shape4', 'shape6'].flatMap((id) => idTimes(r.markers, id)));
      const down = sorted(['shape3', 'shape5', 'shape7'].flatMap((id) => idTimes(r.markers, id)));
      expect(up.length).toBeGreaterThan(0);
      expect(r.alerts[0].times).toEqual(up);
      expect(r.alerts[1].times).toEqual(down);
      // Weakness-Lite bars: a circle above (up bar, shape0) or below (down bar, shape1)
      const weak = sorted(['shape0', 'shape1'].flatMap((id) => idTimes(r.markers, id)));
      expect(weak.length).toBeGreaterThan(0);
      expect(r.alerts[2].times).toEqual(weak);
    }
    // the cross conditions are false when the signals are hidden; the weakness flag is off with the sensitivity
    const hidden = overlay.calculate(bars, { showSignals: false, weakSensitivity: 'Off' });
    expect(hidden.alerts.map((a) => a.times)).toEqual([[], [], []]);
  });
});

describe('macd-reloaded', () => {
  it('colours the histogram with the palette of the original', () => {
    const r = reloaded.calculate(bars);
    const h = r.plots.histogram as { value: number; color: string }[];
    const hist = vals(h);
    const colours = new Set(h.slice(26).map((p) => p.color));
    expect([...colours].every((c) => ['#00E676', '#B2DFDB', '#FFCDD2', '#EF5350'].includes(c))).toBe(true);
    expect(colours.size).toBe(4);
    h.forEach((p, i) => {
      if (i <= 26) return;
      const rising = hist[i - 1] < hist[i];
      expect(p.color).toBe(hist[i] >= 0 ? (rising ? '#00E676' : '#B2DFDB') : rising ? '#FFCDD2' : '#EF5350');
    });
  });
});

describe('macd-rsi-overlay', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(rsiOverlay)).toEqual(specDecls([
      ['MACD Crosses Over Signal Line', 'MACD Crosses Over Signal Line'],
      ['MACD Crosses Under Signal Line', 'MACD Crosses Under Signal Line'],
      ['RSI Crosses Over Signal Line', 'RSI Crosses Over Signal Line'],
      ['RSI Crosses Under Signal Line', 'RSI Crosses Under Signal Line'],
      ['Close Crosses Over MACD', 'Close Crosses Over MACD'],
      ['Close Crosses Under MACD', 'Close Crosses Under MACD'],
      ['Close Crosses Over RSI', 'Close Crosses Over RSI'],
      ['Close Crosses Under RSI', 'Close Crosses Under RSI'],
      ['RSI Crosses Over MACD', 'RSI Crosses Over MACD'],
      ['RSI Crosses Under MACD', 'RSI Crosses Under MACD'],
    ]));
    expect(rsiOverlay.MacdRsiOverlay.alertConditions).toBe(rsiOverlay.alertConditions);
    const both = rsiOverlay.calculate(bars, { macdRsi: 'Both', scalingFactor: 1.2 });
    const macd = vals(both.plots.plot0 as { value: number }[]);
    const rsi = vals(both.plots.plot1 as { value: number }[]);
    const signal = vals(both.plots.plot2 as { value: number }[]);
    const exp = [xover(macd, signal), xunder(macd, signal), xover(rsi, signal), xunder(rsi, signal), xover(close, macd),
      xunder(close, macd), xover(close, rsi), xunder(close, rsi), xover(rsi, macd), xunder(rsi, macd)];
    // the conditions do not depend on the lines shown
    const r = rsiOverlay.calculate(bars, { macdRsi: 'MACD', scalingFactor: 1.2 });
    exp.forEach((f, k) => {
      expect(f.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, f));
    });
  });
});

describe('macd-sniper', () => {
  it('declares the alertconditions, fires them on the signals and gives the ids of the eight plotshape outputs', () => {
    expect(decls(sniper)).toEqual(specDecls([
      ['MACD Buy Signal', 'MACD Buy Signal Triggered'],
      ['MACD Sell Signal', 'MACD Sell Signal Triggered'],
    ]));
    expect(sniper.MacdSniper.alertConditions).toBe(sniper.alertConditions);
    const r = sniper.calculate(bars, { useRsiFilter: false, minBarsBetweenSignals: 2 });
    const ids = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7'];
    expect(hasIds(r.markers, ids)).toBe(true);
    const look = {
      shape0: ['belowBar', 'Buy'], shape1: ['aboveBar', 'Sell'], shape2: ['bottom', 'H'], shape3: ['top', 'H'],
      shape4: ['belowBar', 'Buy'], shape5: ['aboveBar', 'Sell'], shape6: ['bottom', 'MA'], shape7: ['top', 'MA'],
    } as Record<string, string[]>;
    r.markers.forEach((m) => expect([m.position, m.text]).toEqual(look[m.id!]));
    expect(idTimes(r.markers, 'shape2')).toEqual(idTimes(r.markers, 'shape0'));
    expect(idTimes(r.markers, 'shape6')).toEqual(idTimes(r.markers, 'shape4'));
    // final_buy_signal = hist buy or MA buy (both kinds on): the bars of shape0 and shape4
    const buy = sorted([...idTimes(r.markers, 'shape0'), ...idTimes(r.markers, 'shape4')]);
    const sell = sorted([...idTimes(r.markers, 'shape1'), ...idTimes(r.markers, 'shape5')]);
    expect(idTimes(r.markers, 'shape0').length).toBeGreaterThan(0);
    expect(idTimes(r.markers, 'shape4').length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
    // the connector plot agrees
    const conn = r.plots.plot4 as { time: number; value: number }[];
    expect(conn.filter((p) => p.value === 1).map((p) => p.time)).toEqual(buy);
  });
});

describe('macd-support-resistance', () => {
  it('draws the original diamonds with their ids and the fill between the hidden MACD and the signal', () => {
    const r = macdSr.calculate(bars);
    expect(hasIds(r.markers, ['shape0', 'shape1'])).toBe(true);
    const macd = vals(r.plots.macd as { value: number }[]);
    const signal = vals(r.plots.signal as { value: number }[]);
    const up = xover(macd, signal), dn = xunder(macd, signal);
    expect(idTimes(r.markers, 'shape0')).toEqual(timeAt(bars, up));
    expect(idTimes(r.markers, 'shape1')).toEqual(timeAt(bars, dn));
    for (const m of r.markers) {
      const i = bars.findIndex((b) => b.time === m.time);
      expect(m.position).toBe('atPriceMiddle');
      expect(m.price).toBe(signal[i]);
      expect(m.color).toBe(m.id === 'shape0' ? '#2962FF' : '#FF6D00');
    }
    expect(macdSr.plotConfig[0]).toMatchObject({ id: 'macd', title: 'MACD', display: 'none' });
    expect(r.fills).toHaveLength(1);
    expect(r.fills![0]).toMatchObject({ plot1: 'macd', plot2: 'signal', options: { title: 'Plots Background' } });
  });
});

describe('luxy-big-beautiful-dynamic-orb', () => {
  // 5-minute bars of the regular session (09:30-16:00 New York), 12 weekdays from Monday 02/06/2025
  const intraday: Bar[] = (() => {
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const out: Bar[] = [];
    let p = 100;
    const day0 = Date.UTC(2025, 5, 2, 13, 30) / 1000;
    for (let d = 0, days = 0; days < 12; d++) {
      const wd = new Date((day0 + d * 86400) * 1000).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      days++;
      const drift = (rnd() < 0.5 ? -1 : 1) * (0.15 + rnd() * 0.2); // out of the range and back
      for (let k = 0; k < 78; k++) {
        const o = p;
        p = Math.max(5, o + drift * Math.cos(k / 8) + (rnd() - 0.5) * 0.5);
        out.push({ time: day0 + d * 86400 + k * 300, open: o, high: Math.max(o, p) + rnd() * 0.3, low: Math.min(o, p) - rnd() * 0.3, close: p, volume: 1e5 * (0.5 + rnd()) });
      }
    }
    return out;
  })();
  const chart = { timezone: 'America/New_York', session: '0930-1600', tickerid: 'NASDAQ:TEST', symbolType: 'stock', timeframe: '5' };

  it('declares the 13 alertconditions of the original', () => {
    expect(decls(luxy)).toEqual(specDecls([
      ['🔼 ORB Breakout UP', '{{ticker}} - Breakout ABOVE ORB High @ ${{close}}'],
      ['🔽 ORB Breakout DOWN', '{{ticker}} - Breakout BELOW ORB Low @ ${{close}}'],
      ['🔁 ORB Retest UP', '{{ticker}} - Retesting ORB after breakout UP @ ${{close}}'],
      ['🔁 ORB Retest DOWN', '{{ticker}} - Retesting ORB after breakout DOWN @ ${{close}}'],
      ['⚠️ ORB Failed Break UP', '{{ticker}} - Failed breakout UP, back inside ORB @ ${{close}}'],
      ['⚠️ ORB Failed Break DOWN', '{{ticker}} - Failed breakout DOWN, back inside ORB @ ${{close}}'],
      ['✅ ORB Stage Complete', '{{ticker}} - ORB Stage completed'],
      ['🎯 ENTRY Triggered', '{{ticker}} - ENTRY @ ${{close}} | Trade setup activated'],
      ['❌ STOP LOSS Hit', '{{ticker}} - STOP LOSS HIT @ ${{close}} | Trade closed with loss'],
      ['✅ TP1 Hit (1R)', '{{ticker}} - TP1 HIT @ ${{close}} | 1R profit target reached'],
      ['✅ TP1.5 Hit (1.5R)', '{{ticker}} - TP1.5 HIT @ ${{close}} | 1.5R profit target reached'],
      ['✅ TP2 Hit (2R)', '{{ticker}} - TP2 HIT @ ${{close}} | 2R profit target reached'],
      ['✅ TP3 Hit (3R)', '{{ticker}} - TP3 HIT @ ${{close}} | 3R profit target reached'],
    ]));
    expect(luxy.LuxyBigBeautifulDynamicOrb.alertConditions).toBe(luxy.alertConditions);
    expect(luxy.hasAlertFunction).toBe(true);
    expect(luxy.LuxyBigBeautifulDynamicOrb.hasAlertFunction).toBe(true);
  });

  it('fires the conditions and the alert() calls on the bars of the breakouts, retests, failed breaks and stages', () => {
    const r = luxy.calculate(intraday, { showTP1_5: true, retestBuffer: 0.5 }, chart);
    const calls = r.alertCalls;
    expect(calls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    const callTimes = (re: RegExp) => calls.filter((c) => re.test(c.message)).map((c) => c.time);
    const labelTimes = (re: RegExp) => sorted(r.labels.filter((l) => re.test(l.text ?? '')).map((l) => l.time));
    // stages: 4 per day, message with the range
    const stageCalls = calls.filter((c) => c.message.includes('COMPLETE'));
    expect(stageCalls.length).toBe(12 * 4);
    for (const c of stageCalls) {
      expect(c.message).toMatch(/^✅ ORB(5|15|30|60) COMPLETE - TEST \| Range: \$\d+(\.\d{1,2})? - \$\d+(\.\d{1,2})? \(\d+(\.\d)?%\)$/);
    }
    expect(sorted(stageCalls.map((c) => c.time))).toEqual(r.alerts[6].times);
    // breakouts: alert, alert() call and label on the same bars
    const up = callTimes(/^🔼 BREAKOUT UP\d+ - TEST @ \d+(\.\d{1,2})? \| ORB(5|15|30|60)( \| ⚡\d+ (A\+|A|B|C|D))?$/);
    const down = callTimes(/^🔽 BREAKOUT DOWN #\d+ - TEST @ \d+(\.\d{1,2})? \| ORB(5|15|30|60)( \| ⚡\d+ (A\+|A|B|C|D))?$/);
    expect(up.length + down.length).toBeGreaterThan(0);
    expect(calls.filter((c) => c.message.includes('BREAKOUT')).length).toBe(up.length + down.length);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(down);
    // labels: the last 10 breakout / retest labels are kept
    const inAll = (sub: number[], all: number[]) => sub.every((x) => all.includes(x));
    expect(inAll(labelTimes(/^🔼 BREAKOUT UP/), up) && inAll(labelTimes(/^🔽 BREAKOUT DOWN/), down)).toBe(true);
    // retests: one call per retest label
    expect(r.alerts[2].times).toEqual(callTimes(/^🔁 RETEST UP #\d+ - TEST @ \$\d+(\.\d{1,2})? \| Back to ORB(5|15|30|60) range$/));
    expect(r.alerts[3].times).toEqual(callTimes(/^🔁 RETEST DOWN #\d+ - TEST @ \$\d+(\.\d{1,2})? \| Back to ORB(5|15|30|60) range$/));
    expect(inAll(labelTimes(/^🔁 RETEST UP/), r.alerts[2].times) && inAll(labelTimes(/^🔁 RETEST DOWN/), r.alerts[3].times)).toBe(true);
    // failed breaks
    expect(r.alerts[4].times).toEqual(callTimes(/^⚠️ FAILED BREAK UP - TEST @ \$\d+(\.\d{1,2})? \| ORB(5|15|30|60) - Price back inside range after [1-5] bars$/));
    expect(r.alerts[5].times).toEqual(callTimes(/^⚠️ FAILED BREAK DOWN - TEST @ \$\d+(\.\d{1,2})? \| ORB(5|15|30|60) - Price back inside range after [1-5] bars$/));
    expect(calls.length).toBe(stageCalls.length + up.length + down.length
      + r.alerts[2].times.length + r.alerts[3].times.length + r.alerts[4].times.length + r.alerts[5].times.length);
    // entry: the bar after each breakout (the next bar of the session)
    const t = intraday.map((b) => b.time as number);
    expect(r.alerts[7].times).toEqual(sorted([...up, ...down].map((x) => t[t.indexOf(x) + 1])));
    // stop and targets: after an entry, each target hit once per trade, a trade ends at the stop or the last target
    const entries = r.alerts[7].times;
    for (const k of [8, 9, 10, 11, 12]) {
      for (const x of r.alerts[k].times) expect(entries.some((e) => e <= x)).toBe(true);
    }
    expect(r.alerts[8].times.length + r.alerts[9].times.length).toBeGreaterThan(0);
    // conditions with targets off: no trade alerts; TP1.5 off: no TP1.5 alert
    const off = luxy.calculate(intraday, { enableTargets: false, minRetestDistancePct: 0.5 }, chart);
    for (const k of [7, 8, 9, 10, 11, 12]) expect(off.alerts[k].times).toEqual([]);
    expect(luxy.calculate(intraday, { minRetestDistancePct: 0.5 }, chart).alerts[10].times).toEqual([]);
  });

  it('makes no breakout on an open last bar', () => {
    const r = luxy.calculate(intraday, {}, chart);
    const lastT = intraday[intraday.length - 1].time as number;
    const open = luxy.calculate(intraday, {}, { ...chart, lastBarConfirmed: false });
    expect(open.alertCalls.filter((c) => c.time === lastT && /BREAKOUT|RETEST|FAILED/.test(c.message))).toEqual([]);
    expect(open.alertCalls.filter((c) => c.time < lastT)).toEqual(r.alertCalls.filter((c) => c.time < lastT));
  });
});
