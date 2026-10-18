/**
 * Alerts and Style ids of community ports (batch 12): the alertcondition() declarations (ids, titles and messages of
 * the originals), the bars on which each condition is true (re-computed here from the original's expression), the
 * alert() calls (bars, messages, frequency), and the Style-settings ids / fills of the emitted items.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as erema from '../../src/community/ehlers-reverse-ema';
import * as escg from '../../src/community/ehlers-stochastic-cg';
import * as elite from '../../src/community/elite-oscillator-pro';
import * as ew from '../../src/community/elliott-wave';
import * as x926 from '../../src/community/ema-9-26-cross';
import * as cloud from '../../src/community/ema-cloud-trend';
import * as emacd from '../../src/community/ema-macd-strategy-with-sl-tp';
import * as eosc from '../../src/community/ema-oscillator';
import * as varun from '../../src/community/ema-rsi-autotrade-webhook-varun';
import * as est from '../../src/community/ema-supertrend';
import * as zeng from '../../src/community/ema-vwma-atr-smoothed-buysell-tom-zeng-202509';
import * as e21 from '../../src/community/ema21-pullback-buy';
import * as esv6 from '../../src/community/engulfing-sweep-v6-bars-only';
import * as milana from '../../src/community/engulfing-sweeps-milana-trades';
import * as klse from '../../src/community/enhanced-klse-banker-flow-oscillator';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of daily bars with a random volume */
function walk(count: number, seed0: number, vol = 4): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * vol);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1200, 11);
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

/** Independent SMA / EMA (SMA seed) / RMA (SMA seed) / RSI / stdev / ATR (na = NaN) */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
function smoothed(src: number[], len: number, alpha: number): number[] {
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
const ema = (src: number[], len: number) => smoothed(src, len, 2 / (len + 1));
const rma = (src: number[], len: number) => smoothed(src, len, 1 / len);
function rsi(src: number[], len: number): number[] {
  const ch = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const up = rma(ch.map((c) => (isNaN(c) ? NaN : Math.max(c, 0))), len);
  const dn = rma(ch.map((c) => (isNaN(c) ? NaN : Math.max(-c, 0))), len);
  return up.map((u, i) => (dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / dn[i])));
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
function atr(list: Bar[], len: number): number[] {
  const tr = list.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - list[i - 1].close), Math.abs(b.low - list[i - 1].close))));
  return rma(tr, len);
}
/** ta.highest over the last len bars, na values skipped (na when all are na) */
function highest(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let h = NaN;
    for (let k = i - len + 1; k <= i; k++) if (!isNaN(src[k]) && !(src[k] <= h)) h = src[k];
    return h;
  });
}
/** ta.barssince(cond): na until the condition is first true */
function barssince(cond: boolean[]): number[] {
  let last = -1;
  return cond.map((c, i) => {
    if (c) last = i;
    return last < 0 ? NaN : i - last;
  });
}
/** ta.crossover / ta.crossunder (exact comparisons; na compares false) */
const over = (a: number[], b: number[] | number) => a.map((v, i) => {
  const B = (k: number) => (typeof b === 'number' ? b : at(b, k));
  return i > 0 && v > B(i) && a[i - 1] <= B(i - 1);
});
const under = (a: number[], b: number[] | number) => a.map((v, i) => {
  const B = (k: number) => (typeof b === 'number' ? b : at(b, k));
  return i > 0 && v < B(i) && a[i - 1] >= B(i - 1);
});
const ids = (items: { id?: string }[]) => [...new Set(items.map((m) => m.id))];

describe('ehlers-reverse-ema', () => {
  it('has the alert() calls of the original', () => {
    expect(erema.hasAlertFunction).toBe(true);
    expect(erema.EhlersReverseEma.hasAlertFunction).toBe(true);
    const r = erema.calculate(bars, { showSignals: true, alertsOn: true });
    // ema := alpha * close + delta * nz(ema[1], close); eight reverse stages; reverseEma from bar 76
    const alpha = 0.1, d = 1 - alpha;
    const re = new Array(bars.length).fill(NaN);
    let e1 = NaN;
    const prev = new Array(8).fill(0);
    for (let i = 0; i < bars.length; i++) {
      const e = alpha * close[i] + d * (isNaN(e1) ? close[i] : e1);
      const cur = [d * e + (isNaN(e1) ? e : e1)];
      for (let k = 1; k < 8; k++) cur.push(Math.pow(d, 2 ** k) * cur[k - 1] + prev[k - 1]);
      for (let k = 0; k < 8; k++) prev[k] = cur[k];
      e1 = e;
      if (i > 75) re[i] = e - alpha * cur[7];
    }
    const want: string[] = [];
    for (let i = 82; i < bars.length; i++) {
      if (gt(re[i], 0) && le(re[i - 1], 0)) want.push(`${bars[i].time}|Ehlers Reverse EMA: Buy Signal`);
      if (lt(re[i], 0) && ge(re[i - 1], 0)) want.push(`${bars[i].time}|Ehlers Reverse EMA: Sell Signal`);
    }
    expect(want.length).toBeGreaterThan(4);
    expect(r.alertCalls.map((c) => `${c.time}|${c.message}`)).toEqual(want);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar')).toBe(true);
    // no call when the alerts or the signals are off
    expect(erema.calculate(bars, { showSignals: true }).alertCalls).toEqual([]);
    expect(erema.calculate(bars, { alertsOn: true }).alertCalls).toEqual([]);
  });
});

describe('ehlers-stochastic-cg', () => {
  it('gives the two fills of the original with their titles', () => {
    const r = escg.calculate(bars);
    const fills = r.fills ?? [];
    expect(fills.map((f) => f.options?.title)).toEqual(['NegativeFill', 'PositiveFill']);
    const [neg, pos] = fills.map((f) => (f as { colors: string[] }).colors);
    const cg = (r.plots.plot1 as { value: number }[]).map((p) => p.value);
    const trig = (r.plots.plot0 as { value: number }[]).map((p) => p.value);
    for (let i = 0; i < bars.length; i++) {
      if (isNaN(cg[i])) {
        expect(neg[i]).toBe('transparent');
        expect(pos[i]).toBe('transparent');
      } else {
        expect(neg[i] !== 'transparent').toBe(cg[i] < trig[i]);
        expect(pos[i] !== 'transparent').toBe(cg[i] >= trig[i]);
      }
    }
  });
});

describe('elite-oscillator-pro', () => {
  const r = elite.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(elite)).toEqual([
      ['alert0', 'Overbought', 'Elite Oscillator: entered overbought zone'],
      ['alert1', 'Oversold', 'Elite Oscillator: entered oversold zone'],
      ['alert2', 'Exit Overbought', 'Elite Oscillator: exited overbought zone'],
      ['alert3', 'Exit Oversold', 'Elite Oscillator: exited oversold zone'],
      ['alert4', 'Bullish Momentum', 'Elite Oscillator: bullish momentum cross above midline'],
      ['alert5', 'Bearish Momentum', 'Elite Oscillator: bearish momentum cross below midline'],
    ]);
    expect(elite.EliteOscillatorPro.alertConditions).toBe(elite.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const osc = (r.plots.plot9 as { value: number }[]).map((p) => p.value);
    // signal = clamp(ta.ema(osc, 9), 0, 101)
    const signal = ema(osc, 9).map((v) => (isNaN(v) ? NaN : Math.max(0, Math.min(101, v))));
    const crossUp = over(osc, signal);
    const crossDn = under(osc, signal);
    const want = [
      over(osc, 70), under(osc, 30), under(osc, 70), over(osc, 30),
      crossUp.map((c, i) => c && gt(osc[i], 50)), crossDn.map((c, i) => c && lt(osc[i], 50)),
    ];
    want.forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
  });
});

describe('elliott-wave', () => {
  const MESSAGES = [
    'New EW Motive Bullish Pattern found', 'Invalidated EW Motive Bullish Pattern', 'New EW Corrective Bullish Pattern found',
    'Invalidated EW Corrective Bullish Pattern', 'Possible new start of EW Motive Bullish Wave', 'New EW Motive Bearish Pattern found',
    'Invalidated EW Motive Bearish Pattern', 'New EW Corrective Bearish Pattern found', 'Possible new start of EW Motive Bearish Wave',
  ];
  it('has the alert() calls of the original, on pivot bars', () => {
    expect(ew.hasAlertFunction).toBe(true);
    expect(ew.ElliottWave.hasAlertFunction).toBe(true);
    const list = walk(1200, 7);
    const r = ew.calculate(list);
    expect(r.alertCalls.length).toBeGreaterThan(10);
    expect(r.alertCalls.every((c) => MESSAGES.includes(c.message) && c.freq === 'once_per_bar_close')).toBe(true);
    // every message is given on one of a few walks
    const all = [r, ...[1, 5, 18].map((s) => ew.calculate(walk(1500, s, 8)))].flatMap((x) => x.alertCalls);
    for (const m of MESSAGES) expect(all.some((c) => c.message === m), m).toBe(true);
    // every call is on a bar with a pivot of one of the three zig-zags: a bullish message (except the invalidated
    // corrective one, given for both directions) on a pivot high, a bearish one on a pivot low
    const piv = (lens: number[], f: typeof ta.pivothigh, src: number[]) => {
      const out = new Set<number>();
      for (const len of lens) {
        f(Series.fromArray(list, src), len, 1).toArray().forEach((v, i) => {
          if (v != null && !isNaN(v)) out.add(list[i].time as number);
        });
      }
      return out;
    };
    const ph = piv([4, 8, 16], ta.pivothigh, list.map((b) => b.high));
    const pl = piv([4, 8, 16], ta.pivotlow, list.map((b) => b.low));
    for (const c of r.alertCalls) {
      if (c.message === 'Invalidated EW Corrective Bullish Pattern') expect(ph.has(c.time) || pl.has(c.time)).toBe(true);
      else if (c.message.includes('Bullish')) expect(ph.has(c.time), c.message).toBe(true);
      else expect(pl.has(c.time), c.message).toBe(true);
    }
    // one zig-zag on a short series (nothing deleted): one new motive pattern call per (1) label
    const few = list.slice(0, 200);
    const one = ew.calculate(few, { s2: false, s3: false });
    const firsts = one.labels.filter((l) => l.text === '(1)' || l.text === '(5) (1)');
    const motive = one.alertCalls.filter((c) => c.message.startsWith('New EW Motive'));
    expect(motive.length).toBeGreaterThan(0);
    expect(motive.map((c) => c.message.includes('Bullish'))).toEqual(firsts.map((l) => l.style === 'label_down'));
  });
});

describe('ema-9-26-cross', () => {
  const r = x926.calculate(bars);
  const f = ema(close, 9), s = ema(close, 26);
  const bull = over(f, s), bear = under(f, s);
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(x926)).toEqual([
      ['alert0', 'Bullish Cross', 'EMA 9 crossed above EMA 26'],
      ['alert1', 'Bearish Cross', 'EMA 9 crossed below EMA 26'],
    ]);
    expect(x926.Ema926Cross.alertConditions).toBe(x926.alertConditions);
    expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, bull));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bear));
  });
  it('gives the Style ids of the two shapes', () => {
    expect(r.markers.filter((m) => m.id === 'shape0').map((m) => m.time)).toEqual(timeAt(bars, bull));
    expect(r.markers.filter((m) => m.id === 'shape1').map((m) => m.time)).toEqual(timeAt(bars, bear));
    expect(ids(r.markers).every((id) => id === 'shape0' || id === 'shape1')).toBe(true);
  });
});

describe('ema-cloud-trend', () => {
  it('declares and fires the alertconditions of the original (closed bars)', () => {
    expect(decls(cloud)).toEqual([
      ['alert0', 'BUY Signal', 'EMA Cloud → Strong BUY!'],
      ['alert1', 'SELL Signal', 'EMA Cloud → Strong SELL!'],
      ['alert2', 'Trend Change', "EMA Cloud Trend Changed → {{ema8 > ema36 ? 'BUY' : 'SELL'}}"],
    ]);
    expect(cloud.EmaCloudTrend.alertConditions).toBe(cloud.alertConditions);
    const run = (list: Bar[], lastConfirmed: boolean) => {
      const c = list.map((b) => b.close);
      const f = ema(c, 8), s = ema(c, 36);
      const want: boolean[][] = [[], [], []];
      let last = NaN;
      for (let i = 0; i < list.length; i++) {
        const up = gt(f[i], s[i]), dn = lt(f[i], s[i]);
        const changed = !isNaN(last) && ((last === -1 && up) || (last === 1 && dn));
        const conf = i < list.length - 1 || lastConfirmed;
        if (conf) last = up ? 1 : -1;
        want[0].push(changed && up && conf);
        want[1].push(changed && dn && conf);
        want[2].push(changed && conf);
      }
      return want;
    };
    const r = cloud.calculate(bars);
    const want = run(bars, true);
    want.forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
    // a last bar still open fires nothing: cut the series at a trend change
    const cut = bars.indexOf(bars.find((b) => r.alerts[2].times.includes(b.time as number) && bars.indexOf(b) > 300)!);
    const part = bars.slice(0, cut + 1);
    const closed = cloud.calculate(part, {}, { lastBarConfirmed: true });
    const open = cloud.calculate(part, {}, { lastBarConfirmed: false });
    expect(closed.alerts[2].times.at(-1)).toBe(part[cut].time);
    expect(open.alerts[2].times.includes(part[cut].time as number)).toBe(false);
    expect(open.alerts[2].times).toEqual(timeAt(part, run(part, false)[2]));
  });
});

describe('ema-macd-strategy-with-sl-tp', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(emacd)).toEqual([
      ['alert0', 'Buy Alert', 'EMAチャネル: 買いサイン (SL: {{plot_4}}, TP: {{plot_5}})'],
      ['alert1', 'Sell Alert', 'EMAチャネル: 売りサイン (SL: {{plot_4}}, TP: {{plot_5}})'],
    ]);
    expect(emacd.EmaMacdStrategyWithSlTp.alertConditions).toBe(emacd.alertConditions);
    // a more volatile walk: the signals are rare
    const list = walk(1500, 3, 8);
    const close = list.map((b) => b.close);
    const r = emacd.calculate(list);
    const eh = ema(list.map((b) => b.high), 15), el = ema(list.map((b) => b.low), 15), e200 = ema(close, 200);
    const macd = ema(close, 12).map((v, i) => v - ema(close, 26)[i]);
    const sig = ema(macd, 9);
    const hist = macd.map((v, i) => v - sig[i]);
    const pcl = under(close, el), pch = over(close, eh), hcu = under(hist, 0), hco = over(hist, 0);
    const [bpl, bph, bhl, bhh] = [pcl, pch, hcu, hco].map(barssince);
    const lb = 3;
    const long = list.map((_, i) => gt(el[i], e200[i]) && gt(hist[i], 0) && le(bph[i], lb) && le(bhh[i], lb) && (pch[i] || hco[i]));
    const short = list.map((_, i) => lt(eh[i], e200[i]) && lt(hist[i], 0) && le(bpl[i], lb) && le(bhl[i], lb) && (pcl[i] || hcu[i]));
    expect(long.some(Boolean) && short.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(list, long));
    expect(r.alerts[1].times).toEqual(timeAt(list, short));
  });
});

describe('ema-oscillator', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(eosc)).toEqual([
      ['alert0', 'Extremely Overbought Alert', 'EMA Oscillator reached extremely overbought levels'],
      ['alert1', 'Extremely Oversold Alert', 'EMA Oscillator reached extremely oversold levels'],
      ['alert2', 'Overbought Alert', 'EMA Oscillator reached overbought levels'],
      ['alert3', 'Oversold Alert', 'EMA Oscillator reached oversold levels'],
    ]);
    expect(eosc.EMAOscillator.alertConditions).toBe(eosc.alertConditions);
    const e50 = ema(close, 50);
    const osc = close.map((c, i) => c - e50[i]);
    const sd = stdev(osc, 50);
    const z = osc.map((o, i) => o / sd[i]);
    const hi = highest(z.map(Math.abs), 43);
    const ext = hi.map((h) => h * 0.95), mod = hi.map((h) => h * 0.5);
    const want = [over(z, ext), under(z, ext.map((v) => -v)), over(z, mod), under(z, mod.map((v) => -v))];
    // the conditions do not depend on "Show Buy/Sell Signals"
    for (const r of [eosc.calculate(bars), eosc.calculate(bars, { showSignals: false })]) {
      want.forEach((f, k) => {
        expect(f.some(Boolean), `alert${k}`).toBe(true);
        expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
      });
    }
  });
});

describe('ema-rsi-autotrade-webhook-varun', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(varun)).toEqual([
      ['alert0', 'LONG Entry', 'Entry LONG {{ticker}} @ {{close}}'],
      ['alert1', 'SHORT Entry', 'Entry SHORT {{ticker}} @ {{close}}'],
    ]);
    expect(varun.EmaRsiAutotradeWebhookVarun.alertConditions).toBe(varun.alertConditions);
    const r = varun.calculate(bars);
    const f = ema(close, 9), s = ema(close, 21), rs = rsi(close, 14);
    const long = over(f, s).map((c, i) => c && gt(rs[i], 52));
    const short = under(f, s).map((c, i) => c && lt(rs[i], 48));
    expect(long.some(Boolean) && short.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, long));
    expect(r.alerts[1].times).toEqual(timeAt(bars, short));
  });
});

describe('ema-supertrend', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(est)).toEqual([
      ['alert0', 'Buy Signal', 'BUY signal: Fast EMA crossed above Slow EMA'],
      ['alert1', 'Sell Signal', 'SELL signal: Fast EMA crossed below Slow EMA'],
    ]);
    expect(est.EMASupertrend.alertConditions).toBe(est.alertConditions);
    const r = est.calculate(bars);
    const f = ema(close, 9), s = ema(close, 21);
    const buy = over(f, s), sell = under(f, s);
    expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
  });
});

describe('ema-vwma-atr-smoothed-buysell-tom-zeng-202509', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(zeng)).toEqual([
      ['alert0', 'Buy Signal', 'Buy'],
      ['alert1', 'Sell Signal', 'Sell'],
    ]);
    expect(zeng.EmaVwmaAtrSmoothedBuysellTomZeng202509.alertConditions).toBe(zeng.alertConditions);
    const r = zeng.calculate(bars);
    const a = atr(bars, 21);
    const stop: number[] = [];
    const L: boolean[] = [], S: boolean[] = [];
    let pos = 0, isLong = false, isShort = false;
    for (let i = 0; i < bars.length; i++) {
      const c = close[i], c1 = at(close, i - 1), loss = 6.3 * a[i];
      const ps = isNaN(at(stop, i - 1)) ? c1 : stop[i - 1];
      let s: number;
      if (gt(c, ps) && gt(c1, ps)) s = Math.max(ps, c - loss);
      else if (lt(c, ps) && lt(c1, ps)) s = Math.min(ps, c + loss);
      else s = gt(c, ps) ? c - loss : c + loss;
      stop.push(s);
      if (lt(c1, ps) && gt(c, s)) pos = 1;
      else if (gt(c1, ps) && lt(c, s)) pos = -1;
      const long = !isLong && pos === 1, short = !isShort && pos === -1;
      if (long) { isLong = true; isShort = false; }
      if (short) { isLong = false; isShort = true; }
      L.push(long);
      S.push(short);
    }
    expect(L.some(Boolean) && S.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, L));
    expect(r.alerts[1].times).toEqual(timeAt(bars, S));
  });
});

describe('ema21-pullback-buy', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(e21)).toEqual([
      ['alert0', 'EMA21 test', 'EMA21 test in strong uptrend, price went below ema21 and closed back above.'],
      ['alert1', 'Buy bullish reversal', 'First bullish reversal that takes out high of latest EMA21 test candle in strong uptrend.'],
    ]);
    expect(e21.Ema21PullbackBuy.alertConditions).toBe(e21.alertConditions);
    // a trending walk so that strict uptrends happen
    const list = walk(1500, 3).map((b, i) => {
      const d = i * 0.08;
      return { ...b, open: b.open + d, high: b.high + d, low: b.low + d, close: b.close + d };
    });
    const c = list.map((b) => b.close);
    const run = (sens: 'Strict' | 'Loose') => {
      const em = ema(c, 21), sm = sma(c, 50), e10 = ema(c, 10);
      const bsSma = barssince(sm.map((v, i) => !gt(v, at(sm, i - 1))));
      const bsEma = barssince(c.map((v, i) => lt(v, em[i])));
      const T: boolean[] = [], B: boolean[] = [];
      let count = 0, lastHigh = NaN, lastBar = NaN, triggered = false;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const ready = !isNaN(em[i]) && !isNaN(sm[i]);
        const strict = ready && gt(b.close, em[i]) && gt(b.close, sm[i]) && gt(em[i], sm[i] * 1.01) && gt(em[i], at(em, i - 1) * 1.001)
          && ge(bsSma[i], 5) && ge(bsEma[i], 5);
        void e10;
        const trend = sens === 'Strict' ? strict : ready && gt(b.close, em[i]);
        const cand = trend && ready && gt(at(c, i - 1), at(em, i - 1)) && le(b.low, em[i]) && gt(b.close, em[i]);
        if (!trend) count = 0;
        else if (cand) count += 1;
        const test = cand && count <= 6;
        if (test) { lastHigh = b.high; lastBar = i; triggered = false; }
        if (!trend || lt(b.close, em[i]) || lt(b.close, sm[i])) { lastHigh = NaN; lastBar = NaN; triggered = false; }
        const has = !isNaN(lastHigh);
        const buy = has && trend && !triggered && gt(b.high, lastHigh) && i > lastBar
          && gt(b.close, b.open) && gt(b.open, em[i]) && gt(b.close, em[i]);
        if (buy) triggered = true;
        T.push(test);
        B.push(buy);
      }
      return [T, B];
    };
    for (const sens of ['Strict', 'Loose'] as const) {
      const r = e21.calculate(list, { trendSensitivity: sens });
      const want = run(sens);
      want.forEach((f, k) => {
        expect(f.some(Boolean), `${sens} alert${k}`).toBe(true);
        expect(r.alerts[k].times, `${sens} alert${k}`).toEqual(timeAt(list, f));
      });
    }
  });
});

describe('engulfing-sweep-v6-bars-only', () => {
  const want = (list: Bar[], lastConfirmed: boolean) => {
    const bull: boolean[] = [], bear: boolean[] = [];
    const eng = (i: number, up: boolean) => {
      if (i < 1) return false;
      const b = list[i], p = list[i - 1];
      return up
        ? gt(b.close, b.open) && gt(b.close, Math.max(p.open, p.close)) && lt(b.low, p.low) && lt(p.close, p.open)
        : lt(b.close, b.open) && lt(b.close, Math.min(p.open, p.close)) && gt(b.high, p.high) && gt(p.close, p.open);
    };
    for (let i = 0; i < list.length; i++) {
      const conf = i < list.length - 1 || lastConfirmed;
      bull.push(eng(i - 1, true) && conf && gt(list[i].close, list[i].open));
      bear.push(eng(i - 1, false) && conf && lt(list[i].close, list[i].open));
    }
    return [bull, bear];
  };
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(esv6)).toEqual([
      ['alert0', 'Confirmed Bullish Engulfing + Low Sweep', 'Confirmed Bullish Engulfing + Low Sweep on {{ticker}} @ {{interval}}'],
      ['alert1', 'Confirmed Bearish Engulfing + High Sweep', 'Confirmed Bearish Engulfing + High Sweep on {{ticker}} @ {{interval}}'],
    ]);
    expect(esv6.EngulfingSweepV6BarsOnly.alertConditions).toBe(esv6.alertConditions);
    const r = esv6.calculate(bars);
    want(bars, true).forEach((f, k) => {
      expect(f.some(Boolean), `alert${k}`).toBe(true);
      expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f));
    });
    // the alert is on the confirmation bar, the bar colour on the bar before it
    expect(r.barColors.map((c) => c.time).sort()).toEqual(
      [...r.alerts[0].times, ...r.alerts[1].times].map((t) => t - 86400).sort(),
    );
  });
  it('waits for a closed confirmation bar on the last bar', () => {
    const t0 = 1700000000;
    const crafted: Bar[] = [
      { time: t0, open: 10, high: 10.5, low: 9.5, close: 10.2 },
      { time: t0 + 60, open: 10.2, high: 10.4, low: 9.6, close: 9.8 }, // bearish
      { time: t0 + 120, open: 9.7, high: 10.6, low: 9.4, close: 10.5 }, // bullish engulfing, lower low
      { time: t0 + 180, open: 10.5, high: 10.9, low: 10.4, close: 10.8 }, // bullish confirmation
    ];
    expect(esv6.calculate(crafted, {}, { lastBarConfirmed: true }).alerts[0].times).toEqual([t0 + 180]);
    expect(esv6.calculate(crafted, {}, { lastBarConfirmed: false }).alerts[0].times).toEqual([]);
    expect(esv6.calculate(crafted).alerts[1].times).toEqual([]);
  });
});

describe('engulfing-sweeps-milana-trades', () => {
  it('declares and fires the alertconditions and alert() calls of the original', () => {
    expect(decls(milana)).toEqual([
      ['alert0', 'Bullish Engulfing Alert', 'Bullish Engulfing pattern detected!'],
      ['alert1', 'Bearish Engulfing Alert', 'Bearish Engulfing pattern detected!'],
    ]);
    expect(milana.EngulfingSweepsMilanaTrades.alertConditions).toBe(milana.alertConditions);
    expect(milana.hasAlertFunction).toBe(true);
    expect(milana.EngulfingSweepsMilanaTrades.hasAlertFunction).toBe(true);
    for (const useVolumeFilter of [false, true]) {
      const r = milana.calculate(bars, { useVolumeFilter });
      const av = sma(bars.map((b) => b.volume ?? NaN), 20);
      const huge = bars.map((b, i) => gt(b.volume ?? NaN, av[i] * 1.5));
      const bull = bars.map((b, i) => i > 0 && lt(b.low, low[i - 1]) && gt(b.close, bars[i - 1].open) && (!useVolumeFilter || huge[i]));
      const bear = bars.map((b, i) => i > 0 && gt(b.high, high[i - 1]) && lt(b.close, bars[i - 1].open) && (!useVolumeFilter || huge[i]));
      expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
      expect(r.alerts[0].times).toEqual(timeAt(bars, bull));
      expect(r.alerts[1].times).toEqual(timeAt(bars, bear));
      const calls: string[] = [];
      bars.forEach((b, i) => {
        if (bull[i]) calls.push(`${b.time}|Bullish Engulfing pattern detected!`);
        if (bear[i]) calls.push(`${b.time}|Bearish Engulfing pattern detected!`);
      });
      expect(r.alertCalls.map((c) => `${c.time}|${c.message}`)).toEqual(calls);
      expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    }
  });
});

describe('enhanced-klse-banker-flow-oscillator', () => {
  it('declares and fires the alertconditions of the original', () => {
    expect(decls(klse)).toEqual([
      ['alert0', 'Strong Banker Entry Signal', 'Strong Banker Entry Signal with volume confirmation! Consider long position.'],
      ['alert1', 'Position Increase Detected', 'Banker Increasing Position with momentum confirmation! Add to existing position.'],
      ['alert2', 'Position Decrease Detected', 'Banker Decreasing Position with volume confirmation! Consider partial profit taking.'],
      ['alert3', 'Exit Signal Detected', 'Banker Exit Signal with downward momentum! Consider closing long positions.'],
      ['alert4', 'Weak Rebound Detected', 'Banker Weak Rebound Signal - potential reversal point! Watch for confirmation.'],
      ['alert5', 'Overbought Warning', 'Market reaching overbought levels! Consider taking profits.'],
      ['alert6', 'Oversold Opportunity', 'Market reaching oversold levels! Look for entry signals.'],
    ]);
    expect(klse.EnhancedKLSEBankerFlowOscillator.alertConditions).toBe(klse.alertConditions);
    const r = klse.calculate(bars);
    // the five signals are the ones drawn by the original's plotcandle() outputs (coloured on their bars); the banker
    // entry (a cross in the low zone with a positive momentum) did not happen on the test bars
    const coloured = (k: string) => r.plotCandles[k].filter((c) => c.color !== 'transparent').map((c) => c.time);
    ['bankerEntry', 'positionIncrease', 'positionDecrease', 'exitSignal', 'weakRebound'].forEach((k, j) => {
      if (j > 0) expect(coloured(k).length, k).toBeGreaterThan(0);
      expect(r.alerts[j].times, k).toEqual(coloured(k));
    });
    // and the markers of the entry / increase / exit plotshapes
    const mk = (shape: string) => r.markers.filter((m) => m.shape === shape).map((m) => m.time);
    expect(mk('triangleUp')).toEqual(r.alerts[0].times);
    expect(mk('square')).toEqual(r.alerts[1].times);
    expect(mk('triangleDown')).toEqual(r.alerts[3].times);
    // fundtrend > 80 and ta.crossunder(fundtrend, 80) (fundtrend < 20 and ta.crossover(fundtrend, 20)) is never true
    const ft = (r.plots.plot0 as { value: number }[]).map((p) => p.value);
    expect(under(ft, 80).some(Boolean) && over(ft, 20).some(Boolean)).toBe(true);
    expect(r.alerts[5].times).toEqual([]);
    expect(r.alerts[6].times).toEqual([]);
  });
});
