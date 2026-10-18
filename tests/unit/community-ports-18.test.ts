/**
 * Alerts and Style ids of 16 community ports: the alertcondition() declarations (ids, titles and messages of the
 * originals), the bars on which each condition is true (re-computed here from the original's expression, or matched
 * against the port's own outputs of the same expression), the alert() calls (bars, messages, frequency), the
 * Style-settings ids on the emitted markers and the colours of a plot from the original's palette.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as macros from '../../src/community/ict-macros';
import * as po3 from '../../src/community/ict-power-of-three-flux-charts';
import * as silver from '../../src/community/ict-silver-bullet';
import * as turtle from '../../src/community/ict-turtle-soup-flux-charts';
import * as idealBb from '../../src/community/ideal-bb-ma';
import * as iir from '../../src/community/iir-one-pole-price-filter';
import * as imbalance from '../../src/community/imbalance-detector';
import * as impulse from '../../src/community/impulse-macd';
import * as millo from '../../src/community/indicador-millo-sma20-sma200-ao-rsi-m1';
import * as infEma from '../../src/community/infinite-ema-with-alpha-control';
import * as itl from '../../src/community/instantaneous-trendline-with-cloud';
import * as instMacd from '../../src/community/institutional-macd';
import * as iobp from '../../src/community/institutional-orderblock-pressure';
import * as ivRsi from '../../src/community/institutional-volume-rsi';
import * as imvl from '../../src/community/interpolated-median-volatility-lsma-otto';
import * as ibs from '../../src/community/intraday-buy-sell';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of bars (`step` seconds apart) with a random volume */
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
const bars = walk(1500, 7);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const closes = (list: Bar[]) => list.map((b) => b.close);

/** Independent Pine series functions (na = NaN) */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
function stdev(src: number[], len: number): number[] {
  const m = sma(src, len);
  return src.map((_, i) => {
    if (isNaN(m[i])) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += (src[k] - m[i]) ** 2;
    return Math.sqrt(s / len);
  });
}
function wma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0, w = 0;
    for (let k = 0; k < len; k++) { s += src[i - k] * (len - k); w += len - k; }
    return s / w;
  });
}
/** EMA / RMA seeded with the SMA of the first `len` values after the leading na values */
function seededMa(src: number[], len: number, alpha: number): number[] {
  const out: number[] = new Array(src.length).fill(NaN);
  let first = src.findIndex((v) => !isNaN(v));
  if (first < 0) return out;
  let prev = NaN;
  for (let i = first; i < src.length; i++) {
    if (i < first + len - 1) continue;
    if (isNaN(prev)) {
      let s = 0;
      for (let k = i - len + 1; k <= i; k++) s += src[k];
      prev = s / len;
    } else prev = alpha * src[i] + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}
const ema = (src: number[], len: number) => seededMa(src, len, 2 / (len + 1));
const rma = (src: number[], len: number) => seededMa(src, len, 1 / len);
function rsi(src: number[], len: number): number[] {
  const up = src.map((v, i) => (i === 0 ? NaN : Math.max(v - src[i - 1], 0)));
  const dn = src.map((v, i) => (i === 0 ? NaN : Math.max(src[i - 1] - v, 0)));
  const ru = rma(up, len), rd = rma(dn, len);
  return ru.map((u, i) => (isNaN(u) ? NaN : rd[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / rd[i])));
}
const over = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : b[i - 1];
  return i > 0 && v > w && a[i - 1] <= pw;
});
const under = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : b[i - 1];
  return i > 0 && v < w && a[i - 1] >= pw;
});
/** The times of the alerts of a result, per condition */
const alertTimes = (r: { alerts: { times: number[] }[] }) => r.alerts.map((a) => a.times);

describe('ICT Macros: alert() calls', () => {
  // 1-minute bars of two days from 00:00 UTC (New York with daylight saving time: UTC-4)
  const minute = walk(1440 * 2, 3, 60, Date.UTC(2024, 5, 3) / 1000);
  const chart = { timeframe: '1', tickerid: 'NASDAQ:AAPL' };
  const windows: [boolean, number, number, string][] = [
    [true, 7, 33, '02:33 AM - 03:00'], [true, 9, 3, '04:03 AM - 04:30'], [false, 8, 50, '08:50 AM - 09:10'],
    [false, 9, 50, '09:50 AM - 10:10'], [false, 10, 50, '10:50 AM - 11:10'], [false, 11, 50, '11:50 AM - 12:10'],
    [false, 13, 10, '01:10 PM - 01:40'], [false, 15, 15, '03:15 PM - 03:45'],
  ];
  const keys = ['m02', 'm04', 'm08', 'm09', 'm10', 'm11', 'm13', 'm15'] as const;
  const expected = (on: boolean[], ahead: number) => minute.flatMap((b) => {
    const out: { time: number; message: string; freq: string }[] = [];
    windows.forEach(([london, h, m, text], k) => {
      if (!on[k]) return;
      // London window clock: UTC + 1 (DST); New York: UTC - 4 (DST)
      const local = (london ? 1 : -4) * 3600000 + ahead * 60000 + (b.time as number) * 1000;
      if (Math.floor(local / 3600000) % 24 === h && Math.floor(local / 60000) % 60 === m) {
        out.push({ time: b.time as number, message: `${text} macro will be in play in ${ahead} minutes for instrument AAPL`, freq: 'once_per_bar' });
      }
    });
    return out;
  });

  it('declares the alert() calls', () => {
    expect(macros.hasAlertFunction).toBe(true);
    expect(macros.IctMacros.hasAlertFunction).toBe(true);
  });
  it('calls alert() mcAlertM minutes before each enabled window (default windows)', () => {
    const r = macros.calculate(minute, {}, chart);
    const on = keys.map((k) => macros.defaultInputs[k]);
    expect(r.alertCalls).toEqual(expected(on, 30));
    expect(r.alertCalls.length).toBe(8);
  });
  it('all windows, 15 minutes ahead, also without the advance line', () => {
    const all = Object.fromEntries(keys.map((k) => [k, true]));
    const r = macros.calculate(minute, { ...all, mcAlertM: 15, mcAlert: false }, chart);
    expect(r.alertCalls).toEqual(expected(keys.map(() => true), 15));
    expect(r.alertCalls.length).toBe(16);
    // without a ticker in the context: an empty ticker
    const r2 = macros.calculate(minute, {}, { timeframe: '1' });
    expect(r2.alertCalls[0].message.endsWith('for instrument ')).toBe(true);
  });
});

/**
 * The Flux Charts setups: the alerts are true on the last closed historical bar only. The bars are cut at each place
 * of a range; on each cut the alerts of its last bar are the entry label / exit marker the port draws on that bar.
 */
function fluxCuts(
  mod: typeof po3 | typeof turtle,
  list: Bar[],
  from: number,
  inputs: Record<string, unknown>,
  chart: Record<string, unknown>,
): number {
  let fired = 0;
  for (let i = from; i < list.length; i++) {
    const r = mod.calculate(list.slice(0, i + 1), inputs, chart);
    const t = list[i].time as number;
    for (const a of r.alerts) expect(a.times.every((x) => x === t)).toBe(true);
    const exitTp = r.markers.some((m) => m.time === t && m.text === 'TP');
    const exitSl = r.markers.some((m) => m.time === t && m.text === 'SL');
    // the entry of the last bar: the label of the trade opened on it
    const buy = r.labels.some((l) => l.time === t && l.text === 'Buy');
    const sell = r.labels.some((l) => l.time === t && l.text === 'Sell');
    const [b, s, tp, sl] = r.alerts.map((a) => a.triggered);
    expect(b).toBe(buy);
    expect(s).toBe(sell);
    // a take profit and a stop on one bar: the stop replaces it (SL marker), both alerts are true
    expect(sl).toBe(exitSl);
    if (exitTp) expect(tp).toBe(true);
    if (tp) expect(exitTp || exitSl).toBe(true);
    // alert() calls with the same names, once per bar
    const names = ['Buy Signal', 'Sell Signal', 'Take-Profit Signal', 'Stop-Loss Signal'].filter((_, k) => [b, s, tp, sl][k]);
    expect(r.alertCalls).toEqual(names.map((message) => ({ time: t, message, freq: 'once_per_bar' })));
    fired += names.length;
  }
  return fired;
}

describe('ICT Power Of Three | Flux Charts: alerts', () => {
  const list = walk(1100, 11);
  const inputs = { algorithmMode: 'Big Manipulation' };
  it('declarations', () => {
    expect(decls(po3)).toEqual([
      ['alert0', 'Buy Signal', ''], ['alert1', 'Sell Signal', ''], ['alert2', 'Take-Profit Signal', ''], ['alert3', 'Stop-Loss Signal', ''],
    ]);
    expect(po3.hasAlertFunction).toBe(true);
    expect(po3.IctPowerOfThreeFluxCharts.alertConditions).toBe(po3.alertConditions);
  });
  it('true on the last bar only, as the entries and exits of that bar', () => {
    expect(fluxCuts(po3, list, 750, inputs, {})).toBeGreaterThan(10);
  });
  it('an open last bar: the bar before it; the inputs only switch the calls', () => {
    const fires = list.map((_, i) => i).filter((i) => i > 750 && po3.calculate(list.slice(0, i + 1), inputs).alertCalls.length > 0);
    expect(fires.length).toBeGreaterThan(3);
    for (const i of fires.slice(0, 4)) {
      const closed = po3.calculate(list.slice(0, i + 1), inputs);
      const open = po3.calculate(list.slice(0, i + 2), inputs, { lastBarConfirmed: false });
      expect(open.alerts.map((a) => a.times)).toEqual(closed.alerts.map((a) => a.times));
      const off = po3.calculate(list.slice(0, i + 1), {
        ...inputs, buyAlertEnabled: false, sellAlertEnabled: false, tpAlertEnabled: false, slAlertEnabled: false,
      });
      expect(off.alertCalls).toEqual([]);
      expect(off.alerts.map((a) => a.times)).toEqual(closed.alerts.map((a) => a.times));
    }
  });
});

describe('ICT Turtle Soup | Flux Charts: alerts', () => {
  // more than the 4,900 bars the original reads, so that its first setup starts on a bar with a range
  const list = walk(5250, 5, 300, Date.UTC(2024, 0, 2) / 1000);
  const chart = { timeframe: '5' };
  it('declarations', () => {
    expect(decls(turtle)).toEqual([
      ['alert0', 'Buy Signal', ''], ['alert1', 'Sell Signal', ''], ['alert2', 'Take-Profit Signal', ''], ['alert3', 'Stop-Loss Signal', ''],
    ]);
    expect(turtle.hasAlertFunction).toBe(true);
    expect(turtle.IctTurtleSoupFluxCharts.hasAlertFunction).toBe(true);
  });
  it('true on the last bar only, as the entries and exits of that bar', () => {
    expect(fluxCuts(turtle, list, 4950, {}, chart)).toBeGreaterThan(10);
  }, 60000);
  it('an open last bar: the bar before it can fire too', () => {
    const r = turtle.calculate(list, {}, { ...chart, lastBarConfirmed: false });
    const last2 = [list[list.length - 2].time, list[list.length - 1].time];
    for (const a of r.alerts) expect(a.times.every((t) => last2.includes(t))).toBe(true);
  });
});

describe('ICT Silver Bullet: Style ids of the plotchar outputs', () => {
  const list = walk(1500, 9, 300, Date.UTC(2024, 2, 4) / 1000);
  it('every marker carries the id of its plotchar', () => {
    const r = silver.calculate(list, { choice: 'All FVG' }, { timeframe: '5' });
    const byText: Record<string, string> = { '3-4 AM\nNY': 'char0', '10-11 AM\nNY': 'char1', '2-3 PM\nNY': 'char2' };
    expect(r.markers.length).toBeGreaterThan(10);
    for (const m of r.markers) {
      expect(['char0', 'char1', 'char2', 'char3', 'char4']).toContain(m.id);
      if (m.text && byText[m.text]) expect(m.id).toBe(byText[m.text]);
      if (m.text === '•') expect(m.id).toBe(m.position === 'aboveBar' ? 'char3' : 'char4');
    }
    for (const id of ['char0', 'char1', 'char2']) expect(r.markers.some((m) => m.id === id)).toBe(true);
  });
});

describe('IDEAL BB with MA: alerts', () => {
  it('declarations', () => {
    expect(decls(idealBb)).toEqual([['alert0', 'Buy', 'Go Long'], ['alert1', 'Sell', 'Go Short']]);
  });
  it('the Hull crosses, recomputed', () => {
    const r = idealBb.calculate(bars, {});
    const hl2 = bars.map((b) => (b.high + b.low) / 2);
    const close = closes(bars);
    const len = 24;
    const w12 = wma(hl2, 12), w24 = wma(hl2, 24);
    const hma = wma(hl2.map((_, i) => 2 * w12[i] - w24[i]), Math.round(Math.sqrt(len)));
    const c4 = wma(close, 4), c6 = wma(close, 6), c12 = wma(close, 12);
    const hma3 = wma(close.map((_, i) => c4[i] * 3 - c6[i] - c12[i]), 12);
    const kahlman = (x: number[]) => {
      let kf = NaN, velo = NaN;
      return x.map((v) => {
        const prev = isNaN(kf) ? v : kf;
        const dk = v - prev;
        const smooth = prev + dk * Math.sqrt(2);
        velo = (isNaN(velo) ? 0 : velo) + dk;
        kf = smooth + velo;
        return kf;
      });
    };
    const a = kahlman(hma), b = kahlman(hma3);
    const up = a.map((_, i) => i > 0 && gt(b[i], a[i]) && lt(b[i - 1], a[i - 1]));
    const dn = a.map((_, i) => i > 0 && gt(a[i], b[i]) && lt(a[i - 1], b[i - 1]));
    const [buy, sell] = alertTimes(r);
    expect(buy).toEqual(timeAt(bars, up));
    expect(sell).toEqual(timeAt(bars, dn));
    expect(buy.length).toBeGreaterThan(10);
    // the markers (offset -1) after the warm-up stand for the same crosses
    const warm = bars[121].time as number;
    const shifted = (times: number[]) => times.filter((t) => t >= warm).map((t) => bars[bars.findIndex((x) => x.time === t) - 1].time);
    expect(r.markers.filter((m) => m.text === 'Buy').map((m) => m.time)).toEqual(shifted(buy));
    expect(r.markers.filter((m) => m.text === 'Sell').map((m) => m.time)).toEqual(shifted(sell));
  });
});

describe('IIR One-Pole Price Filter: alerts', () => {
  it('declarations', () => {
    expect(decls(iir)).toEqual([
      ['alert0', 'IIR One-Pole Long', 'IIR One-Pole Long {{exchange}}:{{ticker}}'],
      ['alert1', 'IIR One-Pole Short', 'IIR One-Pole Short {{exchange}}:{{ticker}}'],
    ]);
  });
  it('ta.crossover / crossunder(y, y[1]), recomputed', () => {
    for (const inputs of [{}, { mode: 'Half-Life' as const, HL: 7 }, { mode: 'Cutoff-Period' as const, Pc: 9 }]) {
      const r = iir.calculate(bars, inputs);
      const cfg = { ...iir.defaultInputs, ...inputs };
      const src = bars.map((b) => (b.high + b.low) / 2);
      const raw = cfg.mode === 'EMA-Length' ? 2 / (cfg.L + 1) : cfg.mode === 'Half-Life' ? 1 - Math.exp(-Math.log(2) / cfg.HL) : 1 - Math.exp(-2 * Math.PI / cfg.Pc);
      const alpha = Math.min(0.9999, Math.max(0.0001, raw));
      const y: number[] = [];
      src.forEach((s, i) => { const p = i === 0 ? s : y[i - 1]; y.push(p + alpha * (s - p)); });
      const y1 = y.map((_, i) => (i > 0 ? y[i - 1] : NaN));
      const [long, short] = alertTimes(r);
      expect(long).toEqual(timeAt(bars, over(y, y1)));
      expect(short).toEqual(timeAt(bars, under(y, y1)));
      expect(long.length).toBeGreaterThan(5);
    }
  });
});

describe('Imbalance Detector: alerts', () => {
  it('declarations', () => {
    expect(decls(imbalance)).toEqual([
      ['alert0', 'Bullish FVG', 'Bullish FVG detected'], ['alert1', 'Bearish FVG', 'Bearish FVG detected'],
      ['alert2', 'Bullish OG', 'Bullish OG detected'], ['alert3', 'Bearish OG', 'Bearish OG detected'],
      ['alert4', 'Bullish VI', 'Bullish VI detected'], ['alert5', 'Bearish VI', 'Bearish VI detected'],
    ]);
  });
  it('the six imbalances, recomputed (no width filter by default)', () => {
    const r = imbalance.calculate(bars, {});
    const n = bars.length;
    const f: boolean[][] = [[], [], [], [], [], []];
    for (let i = 0; i < n; i++) {
      const { open, high, low, close } = bars[i];
      const p1 = bars[i - 1], p2 = bars[i - 2];
      const bullTop = Math.min(close, open), bullBtm = p1 ? Math.max(p1.close, p1.open) : NaN;
      const bearBtm = Math.max(close, open);
      const bullVi = !!p1 && gt(open, p1.close) && gt(p1.high, low) && gt(close, p1.close) && gt(open, p1.open) && lt(p1.high, bullTop);
      const bearVi = !!p1 && lt(open, p1.close) && lt(p1.low, high) && lt(close, p1.close) && lt(open, p1.open) && gt(p1.low, bearBtm);
      const bullOg = !!p1 && gt(low, p1.high);
      const bearOg = !!p1 && lt(high, p1.low);
      const bullFvg = !!p2 && gt(low, p2.high) && gt(p1.close, p2.high) && !(bullOg || f[2][i - 1]);
      const bearFvg = !!p2 && lt(high, p2.low) && lt(p1.close, p2.low) && !(bearOg || f[3][i - 1]);
      void bullBtm;
      f[0].push(bullFvg); f[1].push(bearFvg); f[2].push(bullOg); f[3].push(bearOg); f[4].push(bullVi); f[5].push(bearVi);
    }
    expect(alertTimes(r)).toEqual(f.map((x) => timeAt(bars, x)));
    for (const t of alertTimes(r)) expect(t.length).toBeGreaterThan(3);
    // a kind switched off: no alert of that kind
    const off = imbalance.calculate(bars, { showOg: false });
    expect(off.alerts[2].times).toEqual([]);
    expect(off.alerts[3].times).toEqual([]);
  });
});

describe('Impulse MACD: plot0 colours of the original palette', () => {
  it('mdc = src>mi ? src>hi ? lime : green : src<lo ? red : orange', () => {
    const r = impulse.calculate(bars, {});
    const src = bars.map((b) => (b.high + b.low + b.close) / 3);
    // the port's own SMMA (rma) and ZLEMA: the colour rule is what this test checks
    const palette = ['#00FF00', '#008000', '#FF0000', '#FF7F00'];
    const drawn = new Set(r.plots.plot0.map((p) => (p as { color?: string }).color));
    for (const c of drawn) expect(palette).toContain(c);
    expect(drawn.size).toBe(4);
    const hi = rma(bars.map((b) => b.high), 34);
    const lo = rma(bars.map((b) => b.low), 34);
    const e1 = ema(src, 34);
    const e2 = ema(e1, 34);
    const mi = e1.map((v, i) => v + (v - e2[i]));
    let same = 0, total = 0;
    r.plots.plot0.forEach((p, i) => {
      if (i < 120) return;
      const s = src[i];
      const want = s > mi[i] ? (s > hi[i] ? '#00FF00' : '#008000') : (s < lo[i] ? '#FF0000' : '#FF7F00');
      total++;
      if ((p as { color?: string }).color === want) same++;
    });
    expect(same).toBe(total);
  });
});

describe('Indicador Millo SMA20-SMA200-AO-RSI M1: alerts', () => {
  it('declarations', () => {
    expect(decls(millo)).toEqual([
      ['alert0', 'Buy', 'BUY - Precio cruza SMA20, RSI>50 y AO 0 up dentro de la ventana (cooldown activo)'],
      ['alert1', 'Sell', 'SELL - Precio cruza SMA20, RSI<50 y AO 0 down dentro de la ventana (cooldown activo)'],
    ]);
  });
  it('buySignal / sellSignal, recomputed', () => {
    for (const inputs of [{}, { confirmBarsAO: 10, cooldownBars: 3, smaSlowLen: 50 }, { confirmBarsAO: 20, cooldownBars: 0, smaSlowLen: 20 }]) {
      const cfg = { ...millo.defaultInputs, ...inputs };
      const r = millo.calculate(bars, inputs);
      const close = closes(bars);
      const hl2 = bars.map((b) => (b.high + b.low) / 2);
      const s20 = sma(close, cfg.smaFastLen), s200 = sma(close, cfg.smaSlowLen), rs = rsi(close, cfg.rsiLen);
      const s5 = sma(hl2, 5), s34 = sma(hl2, 34);
      const ao = s5.map((v, i) => v - s34[i]);
      const pUp = over(close, s20), pDn = under(close, s20), aUp = over(ao, 0), aDn = under(ao, 0);
      let lastUp = NaN, lastDn = NaN, lastBuy = NaN, lastSell = NaN;
      const buy: boolean[] = [], sell: boolean[] = [];
      for (let i = 0; i < bars.length; i++) {
        if (pUp[i]) lastUp = i;
        if (pDn[i]) lastDn = i;
        const sinceUp = isNaN(lastUp) ? 1000000 : i - lastUp;
        const sinceDn = isNaN(lastDn) ? 1000000 : i - lastDn;
        const b = gt(close[i], s200[i]) && sinceUp <= cfg.confirmBarsAO && aUp[i] && gt(rs[i], cfg.rsiThresh)
          && (isNaN(lastBuy) || i - lastBuy >= cfg.cooldownBars);
        const s = lt(close[i], s200[i]) && sinceDn <= cfg.confirmBarsAO && aDn[i] && lt(rs[i], cfg.rsiThresh)
          && (isNaN(lastSell) || i - lastSell >= cfg.cooldownBars);
        if (b) lastBuy = i;
        if (s) lastSell = i;
        buy.push(b);
        sell.push(s);
      }
      const [bt, st] = alertTimes(r);
      expect(bt).toEqual(timeAt(bars, buy));
      expect(st).toEqual(timeAt(bars, sell));
      expect(bt.length + st.length).toBeGreaterThan(1);
      if (cfg.smaSlowLen === 20) expect(Math.min(bt.length, st.length)).toBeGreaterThan(10);
    }
  });
});

describe('Infinite EMA with Alpha Control: alerts and shape ids', () => {
  it('declarations', () => {
    expect(decls(infEma)).toEqual([
      ['alert0', 'Bullish EMA Crossover', 'Fast EMA crossed above Slow EMA - Bullish signal!'],
      ['alert1', 'Bearish EMA Crossover', 'Fast EMA crossed below Slow EMA - Bearish signal!'],
    ]);
  });
  it('the crosses of the fast EMA over / under the slow EMA, recomputed', () => {
    const r = infEma.calculate(bars, {});
    const close = closes(bars);
    const run = (len: number) => {
      const a = 2 / (len + 1);
      const out: number[] = [];
      close.forEach((x, i) => out.push(i === 0 ? x : a * x + (1 - a) * out[i - 1]));
      return out;
    };
    const slow = run(200), fast = run(50);
    const [bull, bear] = alertTimes(r);
    expect(bull).toEqual(timeAt(bars, over(fast, slow)));
    expect(bear).toEqual(timeAt(bars, under(fast, slow)));
    expect(bull.length).toBeGreaterThan(3);
    // without the fast EMA: no cross
    const off = infEma.calculate(bars, { enableFastEMA: false });
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
    // the signals hidden: the alerts stay
    expect(alertTimes(infEma.calculate(bars, { showCrossoverSignals: false }))).toEqual([bull, bear]);
  });
  it('the markers carry the id of the plotshape of their size', () => {
    const sizes = ['tiny', 'small', 'normal', 'large'] as const;
    sizes.forEach((signalSize, k) => {
      const r = infEma.calculate(bars, { signalSize });
      expect(r.markers.length).toBeGreaterThan(5);
      for (const m of r.markers) expect(m.id).toBe(m.shape === 'triangleUp' ? `shape${k}` : `shape${4 + k}`);
    });
  });
});

describe('Instantaneous Trendline with Cloud: alerts', () => {
  it('declarations', () => {
    expect(decls(itl)).toEqual([
      ['alert0', 'ITL Bullish Cross', 'Price crossed ABOVE Instantaneous Trendline (bullish signal).'],
      ['alert1', 'ITL Bearish Cross', 'Price crossed BELOW Instantaneous Trendline (bearish signal).'],
    ]);
  });
  it('the crosses of the source and the trendline, recomputed', () => {
    const r = itl.calculate(bars, {});
    const src = closes(bars);
    const it: number[] = [];
    src.forEach((s, i) => {
      if (i === 0) it.push(s);
      else it.push(0.2 * ((s + 2 * src[i - 1] + (i >= 2 ? src[i - 2] : 0)) / 4) + 0.8 * it[i - 1]);
    });
    const [bull, bear] = alertTimes(r);
    expect(bull).toEqual(timeAt(bars, over(src, it)));
    expect(bear).toEqual(timeAt(bars, under(src, it)));
    expect(bull.length).toBeGreaterThan(10);
  });
});

describe('Institutional MACD (Z-Score Edition): alerts', () => {
  it('declarations', () => {
    expect(decls(instMacd)).toEqual([
      ['alert0', 'Z-Score > Threshold', 'Z-Score is above threshold (Overbought)'],
      ['alert1', 'Z-Score < Threshold', 'Z-Score is below threshold (Oversold)'],
      ['alert2', 'Z-Score Bull Cross', 'Z-Score crossed above 0'],
      ['alert3', 'Z-Score Bear Cross', 'Z-Score crossed below 0'],
    ]);
  });
  it('the z-scored histogram against the threshold and 0, recomputed', () => {
    for (const inputs of [{}, { zScoreThreshold: 1.6 }]) {
      const cfg = { ...instMacd.defaultInputs, ...inputs };
      const r = instMacd.calculate(bars, inputs);
      const close = closes(bars);
      const f = ema(close, 12), s = ema(close, 26);
      const macd = f.map((v, i) => v - s[i]);
      const sig = ema(macd, 9);
      const hist = macd.map((v, i) => v - sig[i]);
      const m = sma(hist, 50), sd = stdev(hist, 50);
      const z = hist.map((v, i) => (v - m[i]) / sd[i]);
      const got = alertTimes(r);
      expect(got[0]).toEqual(timeAt(bars, z.map((v) => gt(v, cfg.zScoreThreshold))));
      expect(got[1]).toEqual(timeAt(bars, z.map((v) => lt(v, -cfg.zScoreThreshold))));
      expect(got[2]).toEqual(timeAt(bars, over(z, 0)));
      expect(got[3]).toEqual(timeAt(bars, under(z, 0)));
      for (const t of got) expect(t.length).toBeGreaterThan(5);
    }
  });
});

describe('Institutional OrderBlock Pressure: alerts', () => {
  it('declarations', () => {
    expect(decls(iobp)).toEqual([
      ['alert0', 'Bullish Order Block Alert', 'Bullish Order Block Detected!'],
      ['alert1', 'Bearish Order Block Alert', 'Bearish Order Block Detected!'],
      ['alert2', 'Bearish OB Line Crossed Up', 'Bearish OB line has been crossed up!'],
      ['alert3', 'Bearish OB Line Crossed Down', 'Bearish OB line has been crossed down!'],
      ['alert4', 'Bullish OB Line Crossed Up', 'Bullish OB line has been crossed up!'],
      ['alert5', 'Bullish OB Line Crossed Down', 'Bullish OB line has been crossed down!'],
    ]);
  });
  it('blocks and the shared crossing state, recomputed (Wick lines)', () => {
    const r = iobp.calculate(bars, {});
    const len = 5;
    const hh = bars.map((_, i) => (i < len - 1 ? NaN : Math.max(...bars.slice(i - len + 1, i + 1).map((b) => b.high))));
    const ll = bars.map((_, i) => (i < len - 1 ? NaN : Math.min(...bars.slice(i - len + 1, i + 1).map((b) => b.low))));
    const f: boolean[][] = [[], [], [], [], [], []];
    let last = NaN;
    // the loop over the zones of a side ends with its most recent zone: its wick line (bearish high / bullish low)
    let bearLevel = NaN, bullLevel = NaN;
    let up = false, down = false;
    bars.forEach((b, i) => {
      const p = bars[i - 1];
      const bull0 = !!p && b.high >= hh[i - 1] - EPS && b.high <= hh[i] + EPS && gt(b.close, p.close);
      const bear0 = !!p && b.low <= ll[i - 1] + EPS && b.low >= ll[i] - EPS && lt(b.close, p.close);
      const bull = bull0 && last !== 1;
      const bear = bear0 && last !== -1;
      if (bull) last = 1;
      else if (bear) last = -1;
      f[0].push(bull);
      f[1].push(bear);
      if (bear) bearLevel = b.high;
      if (!isNaN(bearLevel)) { up = gt(b.high, bearLevel); down = lt(b.low, bearLevel); }
      f[2].push(up);
      f[3].push(down);
      if (bull) bullLevel = b.low;
      if (!isNaN(bullLevel)) { up = gt(b.high, bullLevel); down = lt(b.low, bullLevel); }
      f[4].push(up);
      f[5].push(down);
    });
    expect(alertTimes(r)).toEqual(f.map((x) => timeAt(bars, x)));
    for (const t of alertTimes(r)) expect(t.length).toBeGreaterThan(10);
    // the circles stand for the same blocks
    expect(r.markers.filter((m) => m.position === 'belowBar').map((m) => m.time)).toEqual(r.alerts[0].times);
    expect(r.markers.filter((m) => m.position === 'aboveBar').map((m) => m.time)).toEqual(r.alerts[1].times);
  });
  it('Average lines: the bearish side has no high line, its crossing reads false', () => {
    const r = iobp.calculate(bars, { lineDisplayStyle: 'Average' });
    // Average style: the loops read the high / low lines, which are not drawn: false once a zone exists
    const firstBlock = Math.min(r.alerts[0].times[0], r.alerts[1].times[0]);
    for (const k of [2, 3, 4, 5]) expect(r.alerts[k].times.filter((t) => t >= firstBlock)).toEqual([]);
  });
});

describe('Institutional Volume RSI [Adaptive]: alerts', () => {
  it('declarations', () => {
    expect(decls(ivRsi)).toEqual([
      ['alert0', 'Bullish Volatility Breakout', 'IV-RSI broke above Upper Band'],
      ['alert1', 'Bearish Volatility Breakout', 'IV-RSI broke below Lower Band'],
    ]);
  });
  it('the RSI crossing out of its bands, recomputed', () => {
    for (const srcType of ['VWMA (Volume Weighted)', 'Close (Standard)'] as const) {
      const r = ivRsi.calculate(bars, { srcType });
      const close = closes(bars);
      const vol = bars.map((b) => b.volume ?? 0);
      const cv = sma(close.map((c, i) => c * vol[i]), 14), v = sma(vol, 14);
      const src = srcType === 'Close (Standard)' ? close : cv.map((x, i) => x / v[i]);
      const rs = rsi(src, 14);
      const basis = sma(rs, 20), dev = stdev(rs, 20);
      const upper = basis.map((b, i) => b + dev[i] * 2), lower = basis.map((b, i) => b - dev[i] * 2);
      const [bu, be] = alertTimes(r);
      expect(bu).toEqual(timeAt(bars, over(rs, upper)));
      expect(be).toEqual(timeAt(bars, under(rs, lower)));
      expect(bu.length + be.length).toBeGreaterThan(10);
    }
  });
});

describe('Interpolated Median Volatility LSMA | Otto: alerts', () => {
  it('declarations', () => {
    expect(decls(imvl)).toEqual([
      ['alert0', 'IMVL long', 'IMVL long {{exchange}}:{{ticker}}'],
      ['alert1', 'IMVL short', 'IMVL short {{exchange}}:{{ticker}}'],
    ]);
  });
  it('the trend signal crossing 0, from the port bands', () => {
    const r = imvl.calculate(bars, {});
    let signal = 0;
    const sig = bars.map((b, i) => {
      const up = r.plots.plot1[i].value as number, lo = r.plots.plot2[i].value as number;
      const long = gt(b.close, up), short = lt(b.close, lo);
      if (long && !short) signal = 1;
      if (short) signal = -1;
      return signal;
    });
    const [l, s] = alertTimes(r);
    expect(l).toEqual(timeAt(bars, over(sig, 0)));
    expect(s).toEqual(timeAt(bars, under(sig, 0)));
    expect(l.length).toBeGreaterThan(2);
    expect(s.length).toBeGreaterThan(2);
  });
});

describe('Intraday BUY_SELL: alerts', () => {
  it('declarations', () => {
    expect(decls(ibs)).toEqual([
      ['alert0', 'Both Reversal Signal', 'Reversal Alert'], ['alert1', 'Buy & Sell Signal Both', 'Buy/Sell Alert'],
      ['alert2', 'Only Buy Signal', 'Buy Alert'], ['alert3', 'Only Sell Signal', 'Sell Alert'],
      ['alert4', 'Reversal from Top', 'Down Reversal Alert'], ['alert5', 'Reversal from Down', 'Up Reversal Alert'],
    ]);
  });
  it('the original expressions, recomputed', () => {
    for (const inputs of [{}, { rsiHL: 65, rsiLL: 35, smaLength: 30 }]) {
      const cfg = { ...ibs.defaultInputs, ...inputs };
      const r = ibs.calculate(bars, inputs);
      const close = closes(bars);
      const rs = rsi(close, cfg.rsiLength), s1 = sma(close, cfg.smaLength);
      const c1 = close.map((_, i) => (i > 0 ? close[i - 1] : NaN));
      const l1 = bars.map((_, i) => (i > 0 ? bars[i - 1].low : NaN));
      const cu = over(c1, s1), ld = under(l1, s1), hr = under(rs, cfg.rsiHL), lr = over(rs, cfg.rsiLL);
      const buy = bars.map((b, i) => i > 0 && cu[i] && gt(bars[i - 1].close, bars[i - 1].open) && gt(b.high, bars[i - 1].high) && gt(b.close, b.open));
      const sell = bars.map((b, i) => i > 0 && ld[i] && lt(bars[i - 1].close, bars[i - 1].open) && lt(b.low, bars[i - 1].low) && lt(b.close, b.open));
      const hl = hr;
      const llr = lr.map((x, i) => x && lt(bars[i].open, bars[i].close));
      const got = alertTimes(r);
      expect(got[0]).toEqual(timeAt(bars, hl.map((x, i) => x || llr[i])));
      expect(got[1]).toEqual(timeAt(bars, sell.map((x, i) => x || buy[i])));
      expect(got[2]).toEqual(timeAt(bars, buy));
      expect(got[3]).toEqual(timeAt(bars, sell));
      expect(got[4]).toEqual(timeAt(bars, hl));
      expect(got[5]).toEqual(timeAt(bars, llr));
      for (const k of [2, 3, 4, 5]) expect(got[k].length).toBeGreaterThan(2);
      // after the warm-up the B / S markers are the same signals
      const warm = bars[Math.max(cfg.rsiLength, cfg.smaLength) + 1].time as number;
      expect(r.markers.filter((m) => m.text === 'B').map((m) => m.time)).toEqual(got[2].filter((t) => t >= warm));
      expect(r.markers.filter((m) => m.text === 'S').map((m) => m.time)).toEqual(got[3].filter((t) => t >= warm));
    }
  });
});
