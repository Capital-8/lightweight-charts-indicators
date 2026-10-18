/**
 * Community ports, batch 35: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression, or matched with the item the
 * original draws for the same event), the alert() calls, and the Style ids on the emitted markers.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, color, type Bar } from 'oakscriptjs';
import * as sexi from '../../src/community/sexi-super-exhaustion-indicator';
import * as shmma from '../../src/community/sharp-modified-moving-average';
import * as sharp30 from '../../src/community/sharpshooter-30-ema-distance';
import * as multicator from '../../src/community/signal-table-autofib-sma-ema-rsi-atr-vol';
import * as spc from '../../src/community/simplified-percentile-clustering';
import * as swma from '../../src/community/sine-weighted-moving-average';
import * as slowHa from '../../src/community/slow-heiken-ashi';
import * as smaAdx from '../../src/community/sma-adx-filter';
import * as smaAngle from '../../src/community/sma-angle-alerts';
import * as smaDma from '../../src/community/sma-dma-crossing-signal';
import * as squeeze from '../../src/community/sma-squeeze-oscillator';
import * as sbt from '../../src/community/smart-breakout-targets';
import * as smbc from '../../src/community/smart-money-breakout-channels';
import * as smbs from '../../src/community/smart-money-breakout-signals';
import * as smb from '../../src/community/smart-money-breakouts';
import * as smc from '../../src/community/smart-money-concepts-luxalgo';

const CC = '{{exchange}}:{{ticker}}';
/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'sexi-super-exhaustion-indicator': [
    ['alert0', 'SExI - Any Exhaustion Top or Bottom Triggered', '{{ticker}} {{interval}}: SExI - Any Exhaustion Top or Bottom Triggered'],
    ['alert1', 'SExI - Any Exhaustion Top Triggered', '{{ticker}} {{interval}}: SExI - Any Exhaustion Top Triggered'],
    ['alert2', 'SExI - Any Exhaustion Bottom Triggered', '{{ticker}} {{interval}}: SExI - Any Exhaustion Bottom Triggered'],
    ['alert3', 'SExI - Exhaustion Top', 'SExI - Exhaustion Top'],
    ['alert4', 'SExI - Exhaustion Bottom', 'SExI - Exhaustion Bottom'],
    ['alert5', 'SExI - Extreme Exhaustion Top', 'SExI - Extreme Exhaustion Top'],
    ['alert6', 'SExI - Extreme Exhaustion Bottom', 'SExI - Extreme Exhaustion Bottom'],
  ],
  'sharp-modified-moving-average': [
    ['alert0', 'Bullish Color Change', `SHMMA - Bullish Color Change\nSymbol: ${CC}\nPrice: {{close}}`],
    ['alert1', 'Bearish Color Change', `SHMMA - Bearish Color Change\nSymbol: ${CC}\nPrice: {{close}}`],
    ['alert2', 'Any Color Change', `SHMMA - Any Color Change\nSymbol: ${CC}\nPrice: {{close}}`],
  ],
  'sharpshooter-30-ema-distance': [
    ['alert0', 'BUY', 'BUY: One signal per death cross (fast MA below slow MA by set USD distance)'],
  ],
  'signal-table-autofib-sma-ema-rsi-atr-vol': [
    ['alert0', 'RSI >= 70', 'RSI overbought'],
    ['alert1', 'RSI <= 30', 'RSI oversold'],
    ['alert2', 'MACD cross up', 'MACD bullish cross'],
    ['alert3', 'MACD cross down', 'MACD bearish cross'],
    ['alert4', 'Close x EMA200 up', 'Price crossed above EMA200'],
    ['alert5', 'Close x EMA200 down', 'Price crossed below EMA200'],
  ],
  'sine-weighted-moving-average': [
    ['alert0', 'Bullish Color Change', `SWMA - Bullish Color Change\nSymbol: ${CC}\nPrice: {{close}}`],
    ['alert1', 'Bearish Color Change', `SWMA - Bearish Color Change\nSymbol: ${CC}\nPrice: {{close}}`],
    ['alert2', 'Any Color Change', `SWMA - Any Color Change\nSymbol: ${CC}\nPrice: {{close}}`],
  ],
  'sma-adx-filter': [['alert0', 'Buy Signal', 'Buy Signal'], ['alert1', 'Sell Signal', 'Sell Signal']],
  'sma-angle-alerts': [
    ['alert0', 'MA Angling Up', 'MA is angling up beyond threshold.'],
    ['alert1', 'MA Angling Down', 'MA is angling down beyond threshold.'],
  ],
  'sma-dma-crossing-signal': [
    ['alert0', 'BUY indication', '{{ticker}} | {{interval}} | BUY indication confirmed at candle close. Review trend/recovery conditions. Close: {{close}}'],
    ['alert1', 'SELL indication', '{{ticker}} | {{interval}} | SELL indication confirmed at candle close. Review price weakness/trend conditions. Close: {{close}}'],
  ],
  'sma-squeeze-oscillator': [
    ['alert0', 'Bull Cross Alert', 'Momentum crossed above zero'],
    ['alert1', 'Bear Cross Alert', 'Momentum crossed below zero'],
    ['alert2', '1st after Squeeze LONG Alert', 'First bullish momentum after squeeze'],
    ['alert3', '1st after Squeeze SHORT Alert', 'First bearish momentum after squeeze'],
    ['alert4', 'Bullish Divergence Alert', 'Bullish divergence detected on momentum'],
    ['alert5', 'Bearish Divergence Alert', 'Bearish divergence detected on momentum'],
  ],
  'smart-money-breakout-channels': [
    ['alert0', 'New Channel Formation', 'A new breakout channel has been formed'],
    ['alert1', 'Bullish Breakout', 'Price has broken out above the channel (bullish signal)'],
    ['alert2', 'Bearish Breakout', 'Price has broken out below the channel (bearish signal)'],
  ],
  'smart-money-breakout-signals': [['alert0', 'Bullish Signal', 'Alert Fired!'], ['alert1', 'Bearish Signal', 'Alert Fired!']],
  'smart-money-breakouts': [['alert0', 'BUY', 'Alert Fired!'], ['alert1', 'Sell', 'Alert Fired!']],
  'smart-money-concepts-luxalgo': [
    ['alert0', 'Internal Bullish BOS', 'Internal Bullish BOS formed'],
    ['alert1', 'Internal Bullish CHoCH', 'Internal Bullish CHoCH formed'],
    ['alert2', 'Internal Bearish BOS', 'Internal Bearish BOS formed'],
    ['alert3', 'Internal Bearish CHoCH', 'Internal Bearish CHoCH formed'],
    ['alert4', 'Bullish BOS', 'Internal Bullish BOS formed'],
    ['alert5', 'Bullish CHoCH', 'Internal Bullish CHoCH formed'],
    ['alert6', 'Bearish BOS', 'Bearish BOS formed'],
    ['alert7', 'Bearish CHoCH', 'Bearish CHoCH formed'],
    ['alert8', 'Bullish Internal OB Breakout', 'Price broke bullish internal OB'],
    ['alert9', 'Bearish Internal OB Breakout', 'Price broke bearish internal OB'],
    ['alert10', 'Bullish Swing OB Breakout', 'Price broke bullish swing OB'],
    ['alert11', 'Bearish Swing OB Breakout', 'Price broke bearish swing OB'],
    ['alert12', 'Equal Highs', 'Equal highs detected'],
    ['alert13', 'Equal Lows', 'Equal lows detected'],
    ['alert14', 'Bullish FVG', 'Bullish FVG formed'],
    ['alert15', 'Bearish FVG', 'Bearish FVG formed'],
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
/** Quiet ranges of 60 bars, then 20 bars of a strong move (alternately up and down) */
function squeezeBars(count: number, seed0: number): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const phase = i % 80;
    const vol = phase < 60 ? 0.15 : 3;
    const drift = phase >= 60 ? (Math.floor(i / 80) % 2 ? -1.5 : 1.5) : 0;
    const o = p;
    p = Math.max(5, o + drift + (rnd() - 0.5) * vol);
    out.push({
      time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * vol * 0.3, low: Math.min(o, p) - rnd() * vol * 0.3,
      close: p, volume: 1e6 * (phase >= 60 ? 3 : 1) * (0.5 + rnd()),
    });
  }
  return out;
}

const bars = walk(1200, 11);
const n = bars.length;
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
const S = (a: number[]) => Series.fromArray(bars, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const markerTimes = (ms: { time: unknown; id?: string }[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);
const sorted = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
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

describe('batch 35: alertcondition() declarations', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'sexi-super-exhaustion-indicator': sexi, 'sharp-modified-moving-average': shmma, 'sharpshooter-30-ema-distance': sharp30,
    'signal-table-autofib-sma-ema-rsi-atr-vol': multicator, 'sine-weighted-moving-average': swma, 'sma-adx-filter': smaAdx,
    'sma-angle-alerts': smaAngle, 'sma-dma-crossing-signal': smaDma, 'sma-squeeze-oscillator': squeeze,
    'smart-money-breakout-channels': smbc, 'smart-money-breakout-signals': smbs, 'smart-money-breakouts': smb,
    'smart-money-concepts-luxalgo': smc,
  };
  for (const [id, m] of Object.entries(mods)) {
    it(`${id}: ids, titles and messages of the original`, () => expect(decls(m)).toEqual(SPEC[id]));
  }
  it('the alert() ports say so', () => {
    expect(spc.hasAlertFunction).toBe(true);
    expect(sbt.hasAlertFunction).toBe(true);
    expect(smbs.hasAlertFunction).toBe(true);
  });
});

describe('sexi-super-exhaustion-indicator', () => {
  it('conditions from RSI and the Aroon drive counts', () => {
    const r = sexi.calculate(bars);
    const rsi = A(ta.rsi(S(close), 14));
    const hb = A(ta.highestbars(S(bars.map((b) => b.high)), 15));
    const aroon = hb.map((x) => (100 * (x + 14)) / 14);
    const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
    const topA: number[] = [];
    const bottomA: number[] = [];
    for (let i = 0; i < n; i++) {
      const pt = i > 0 ? topA[i - 1] : NaN, pb = i > 0 ? bottomA[i - 1] : NaN, pa = i > 0 ? aroon[i - 1] : NaN;
      topA.push(eq(aroon[i], 100) && lt(pa, 100) ? pt + 1 : eq(aroon[i], 0) ? 0 : pt);
      bottomA.push(eq(aroon[i], 0) && gt(pa, 0) ? pb + 1 : eq(aroon[i], 100) ? 0 : pb);
    }
    const top = rsi.map((v, i) => ge(v, 72) && topA[i] >= 5);
    const bottom = rsi.map((v, i) => le(v, 32) && bottomA[i] >= 5);
    const topX = rsi.map((v, i) => ge(v, 80) && topA[i] >= 5);
    const bottomX = rsi.map((v, i) => le(v, 25) && bottomA[i] >= 5);
    const anyTop = top.map((v, i) => v || topX[i]);
    const anyBottom = bottom.map((v, i) => v || bottomX[i]);
    const want = [anyTop.map((v, i) => v || anyBottom[i]), anyTop, anyBottom, top, bottom, topX, bottomX];
    want.forEach((f, k) => {
      expect(times(r, k)).toEqual(timeAt(bars, f));
      expect(times(r, k).length).toBeGreaterThan(0);
    });
  });
});

describe('everget moving averages: colour change alerts', () => {
  const check = (r: Alerts, ma: number[]) => {
    const col = ma.map((v, i) => (i > 0 && gt(v, ma[i - 1]) ? 'bull' : 'bear'));
    const bull = col.map((c, i) => i > 0 && col[i - 1] !== 'bull' && c === 'bull');
    const bear = col.map((c, i) => i > 0 && col[i - 1] !== 'bear' && c === 'bear');
    const any = col.map((c, i) => i > 0 && c !== col[i - 1]);
    [bull, bear, any].forEach((f, k) => {
      expect(times(r, k)).toEqual(timeAt(bars, f));
      expect(times(r, k).length).toBeGreaterThan(0);
    });
  };
  it('sharp-modified-moving-average: 3 * WMA - 2 * SMA', () => {
    const wma = A(ta.wma(S(close), 14));
    const sma = A(ta.sma(S(close), 14));
    check(shmma.calculate(bars), wma.map((w, i) => 3 * w - 2 * sma[i]));
  });
  it('sine-weighted-moving-average: sine kernel', () => {
    const w = Array.from({ length: 14 }, (_, i) => Math.sin(((i + 1) * Math.PI) / 15));
    const ws = w.reduce((a, b) => a + b, 0);
    const ma = close.map((c, b) => w.reduce((s, wi, i) => s + (b - i >= 0 ? close[b - i] : c) * wi, 0) / ws);
    check(swma.calculate(bars), ma);
  });
  it('highlight off: one colour, no change', () => {
    const r = shmma.calculate(bars, { highlightDirection: false });
    expect(r.alerts.map((a) => a.times.length)).toEqual([0, 0, 0]);
  });
});

describe('sharpshooter-30-ema-distance', () => {
  it('BUY once per death cross, on confirmed bars', () => {
    const inputs = { distUSD: 1 };
    const r = sharp30.calculate(bars, inputs);
    const fast = A(ta.ema(S(close), 7));
    const slow = A(ta.ema(S(close), 200));
    const death = xunder(fast, slow);
    let armed = false;
    const buy = fast.map((f, i) => {
      if (death[i]) armed = true;
      const s = armed && le(f, slow[i] - 1);
      if (s) armed = false;
      return s;
    });
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 0)).toEqual(r.markers.map((m) => m.time));
  });
});

describe('signal-table-autofib-sma-ema-rsi-atr-vol', () => {
  it('RSI levels, MACD and EMA 200 crosses', () => {
    const r = multicator.calculate(bars);
    const rsi = A(ta.rsi(S(close), 14));
    const [m, s] = ta.macd(S(close), 12, 26, 9).map(A);
    const ema = A(ta.ema(S(close), 200));
    const want = [rsi.map((v) => ge(v, 70)), rsi.map((v) => le(v, 30)), xover(m, s), xunder(m, s), xover(close, ema), xunder(close, ema)];
    want.forEach((f, k) => {
      expect(times(r, k)).toEqual(timeAt(bars, f));
      expect(times(r, k).length).toBeGreaterThan(0);
    });
  });
  it('Scalping preset: RSI 7, MACD 8 / 17 / 9', () => {
    const r = multicator.calculate(bars, { preset: 'Scalping' });
    const rsi = A(ta.rsi(S(close), 7));
    const [m, s] = ta.macd(S(close), 8, 17, 9).map(A);
    expect(times(r, 0)).toEqual(timeAt(bars, rsi.map((v) => ge(v, 70))));
    expect(times(r, 2)).toEqual(timeAt(bars, xover(m, s)));
  });
});

describe('simplified-percentile-clustering: alert() on a cluster change', () => {
  it('a call on bar 0 and on each change of the cluster, once per bar close', () => {
    const r = spc.calculate(bars, { lookback: 100 });
    const calls = r.alertCalls;
    expect(calls.length).toBeGreaterThan(5);
    expect(calls[0].time).toBe(bars[0].time);
    for (const c of calls) {
      expect(c.freq).toBe('once_per_bar_close');
      expect(c.message).toMatch(/^SPC: Market regime shifted → Now in cluster k[012]$/);
    }
    // consecutive calls name different clusters (a call is made on each change)
    for (let k = 1; k < calls.length; k++) expect(calls[k].message).not.toBe(calls[k - 1].message);
  });
  it('the cluster of each call is the one of the histogram drawn on that bar', () => {
    const r = spc.calculate(bars, { lookback: 100 });
    const byTime = new Map(r.alertCalls.map((c) => [c.time, Number(c.message.slice(-1))]));
    let seen = 0;
    for (const [t, k] of byTime) {
      const i = bars.findIndex((b) => b.time === t);
      const p = (r.plots as Record<string, { value: number }[]>)[`plot${4 + k}`][i];
      if (Number.isFinite(p.value)) {
        seen++;
        for (const other of [0, 1, 2].filter((x) => x !== k)) {
          expect(Number.isFinite((r.plots as Record<string, { value: number }[]>)[`plot${4 + other}`][i].value)).toBe(false);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('slow-heiken-ashi: plotchar ids', () => {
  it('every marker is char0 (▼ at the high) or char1 (▲ at the low), white', () => {
    const r = slowHa.calculate(bars);
    expect(r.markers.length).toBeGreaterThan(0);
    for (const m of r.markers) {
      expect(['char0', 'char1']).toContain(m.id);
      expect(m.char).toBe(m.id === 'char0' ? '▼' : '▲');
      expect(m.color).toBe('#FFFFFF');
      expect(m.position).toBe('atPriceMiddle');
      const c = r.plotCandles.candle0.find((x) => x.time === m.time)!;
      expect(m.price).toBe(m.id === 'char0' ? c.high : c.low);
    }
  });
});

describe('sma-adx-filter', () => {
  const run = (chart?: { lastBarConfirmed: boolean }) => smaAdx.calculate(bars, { useLongFilter: false, maLength: 10 }, chart);
  it('crosses of the close with the SMA, on closed bars', () => {
    const r = run();
    const sma = A(ta.sma(S(close), 10));
    expect(times(r, 0)).toEqual(timeAt(bars, xover(close, sma)));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(close, sma)));
    expect(times(r, 0).length).toBeGreaterThan(10);
  });
  it('the last bar still open: no alert on it, the label stays', () => {
    const sma = A(ta.sma(S(close), 10));
    const up = xover(close, sma), down = xunder(close, sma);
    let end = n;
    while (!(up[end - 1] || down[end - 1])) end--;
    const sub = bars.slice(0, end);
    const open = smaAdx.calculate(sub, { useLongFilter: false, maLength: 10 }, { lastBarConfirmed: false });
    const closed = smaAdx.calculate(sub, { useLongFilter: false, maLength: 10 }, { lastBarConfirmed: true });
    const lastT = sub[end - 1].time as number;
    expect([...times(closed, 0), ...times(closed, 1)]).toContain(lastT);
    expect([...times(open, 0), ...times(open, 1)]).not.toContain(lastT);
    expect(open.markers.map((m) => m.time)).toContain(lastT);
  });
});

describe('sma-angle-alerts', () => {
  it('first bar of the angle beyond the threshold', () => {
    const r = smaAngle.calculate(bars, { angleThreshold: 20 });
    const ma = A(ta.sma(S(close), 9));
    const ang = ma.map((v, i) => Math.atan((v - (i >= 5 ? ma[i - 5] : NaN)) / 5) * (180 / Math.PI));
    const up = ang.map((a) => gt(a, 20));
    const down = ang.map((a) => lt(a, -20));
    expect(times(r, 0)).toEqual(timeAt(bars, up.map((u, i) => u && !(i > 0 && up[i - 1]))));
    expect(times(r, 1)).toEqual(timeAt(bars, down.map((d, i) => d && !(i > 0 && down[i - 1]))));
    expect(times(r, 0).length).toBeGreaterThan(0);
  });
});

describe('sma-dma-crossing-signal', () => {
  it('BUY / SELL alerts on the label bars, also with the labels hidden', () => {
    const r = smaDma.calculate(bars);
    expect(times(r, 0)).toEqual(r.markers.filter((m) => m.text === 'BUY').map((m) => m.time));
    expect(times(r, 1)).toEqual(r.markers.filter((m) => m.text === 'SELL').map((m) => m.time));
    expect(times(r, 0).length).toBeGreaterThan(0);
    const hidden = smaDma.calculate(bars, { showLabels: false });
    expect(hidden.markers).toEqual([]);
    expect(hidden.alerts).toEqual(r.alerts);
  });
});

describe('sma-squeeze-oscillator', () => {
  const inputs = { useSmaFilter: false };
  it('alerts: momentum crosses, first bar after a squeeze, divergences', () => {
    const r = squeeze.calculate(bars, inputs);
    const sma = (l: number) => A(ta.sma(S(close), l));
    const s1 = sma(6), s2 = sma(18), s3 = sma(26);
    const atr = A(ta.atr(bars, 14));
    const isSq = s1.map((v, i) => lt(Math.max(v, s2[i], s3[i]) - Math.min(v, s2[i], s3[i]), atr[i] * 0.8));
    const mom = A(ta.sma(S(s1.map((v, i) => (v - s2[i] + v - s3[i]) / 2)), 3));
    const out = isSq.map((q, i) => !q && i > 0 && isSq[i - 1]);
    const want = [xover(mom, 0), xunder(mom, 0), out.map((o, i) => o && gt(mom[i], 0)), out.map((o, i) => o && lt(mom[i], 0))];
    want.forEach((f, k) => {
      expect(times(r, k)).toEqual(timeAt(bars, f));
      expect(times(r, k).length).toBeGreaterThan(0);
    });
    // divergences: the label of the pivot (offset -2) of each alert bar
    const lbTime = (t: number) => bars[bars.findIndex((b) => b.time === t) - 2].time;
    expect(times(r, 4).map(lbTime)).toEqual(markerTimes(r.markers, 'shape4'));
    expect(times(r, 5).map(lbTime)).toEqual(markerTimes(r.markers, 'shape5'));
    expect(times(r, 4).length + times(r, 5).length).toBeGreaterThan(0);
    // Enable Divergence off: no divergence alert
    const off = squeeze.calculate(bars, { ...inputs, calculateDivergence: false });
    expect(times(off, 4)).toEqual([]);
    expect(times(off, 5)).toEqual([]);
  });
  it('marker ids: one per plotshape output', () => {
    const r = squeeze.calculate(bars, inputs);
    expect(r.markers.every((m) => ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5'].includes(m.id!))).toBe(true);
    for (const [k, id] of ['shape0', 'shape1', 'shape2', 'shape3'].entries()) expect(markerTimes(r.markers, id)).toEqual(times(r, k));
    expect(r.markers.filter((m) => m.id === 'shape0').every((m) => m.shape === 'diamond')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape2').every((m) => m.shape === 'circle')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape4').every((m) => m.text === 'Bull')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape5').every((m) => m.text === 'Bear')).toBe(true);
  });
});

describe('smart-breakout-targets: alert() calls', () => {
  const sq = squeezeBars(1200, 7);
  const chart = { tickerid: 'NASDAQ:AAPL', ticker: 'AAPL', mintick: 0.01 };
  it('one call per event, on the bars of its label, once per bar close', () => {
    const r = sbt.calculate(sq, {}, chart);
    expect(r.alertCalls.length).toBeGreaterThan(5);
    const callTimes = (re: RegExp) => r.alertCalls.filter((c) => re.test(c.message)).map((c) => c.time);
    const labelTimes = (text: string) => r.labels.filter((l) => l.text === text).map((l) => l.time as number);
    expect(callTimes(/^🟢 BULL BREAKOUT/)).toEqual(labelTimes('Long'));
    expect(callTimes(/^🔴 BEAR BREAKOUT/)).toEqual(labelTimes('Short'));
    expect(callTimes(/^❌ SL HIT/)).toEqual(labelTimes('✘ SL'));
    expect(callTimes(/^✅ TP3 HIT/)).toEqual(labelTimes('✔ TP3'));
    expect(callTimes(/^◼ EARLY CLOSE/)).toEqual(labelTimes('◼ Exit'));
    expect(callTimes(/^🟢|^🔴/).length).toBeGreaterThan(0);
    for (const c of r.alertCalls) {
      expect(c.freq).toBe('once_per_bar_close');
      expect(c.message).toMatch(/ \| NASDAQ:AAPL \| TF: D \| /);
    }
    const entry = r.alertCalls.find((c) => /BREAKOUT/.test(c.message))!;
    expect(entry.message).toMatch(/^(🟢 BULL|🔴 BEAR) BREAKOUT \| NASDAQ:AAPL \| TF: D \| Price: \d+\.\d{2} \| SL: \d+\.\d{2} \| TP1: \d+\.\d{2} \| TP2: \d+\.\d{2} \| TP3: \d+\.\d{2}$/);
    const i = sq.findIndex((b) => b.time === entry.time);
    expect(entry.message).toContain(`Price: ${sq[i].close.toFixed(2)}`);
    // a TP1 / TP2 call between the entry and the close of a trade
    expect(r.alertCalls.some((c) => /^✅ TP1 HIT \| NASDAQ:AAPL \| TF: D \| Level: \d+\.\d{2}$/.test(c.message))).toBe(true);
  });
  it('Webhook JSON Format: JSON messages on the same bars', () => {
    const text = sbt.calculate(sq, {}, chart);
    const json = sbt.calculate(sq, { webhookInput: true }, chart);
    expect(json.alertCalls.map((c) => c.time)).toEqual(text.alertCalls.map((c) => c.time));
    for (const c of json.alertCalls) {
      const o = JSON.parse(c.message);
      expect(o.ticker).toBe('NASDAQ:AAPL');
      expect(o.tf).toBe('D');
      expect(['buy', 'sell', 'tp', 'close']).toContain(o.action);
    }
  });
  it('the last bar still open: no call on it', () => {
    const r = sbt.calculate(sq, {}, chart);
    const t = r.alertCalls[r.alertCalls.length - 1].time;
    const end = sq.findIndex((b) => b.time === t) + 1;
    const open = sbt.calculate(sq.slice(0, end), {}, { ...chart, lastBarConfirmed: false });
    expect(open.alertCalls.map((c) => c.time)).not.toContain(t);
  });
});

describe('smart-money-breakout-channels', () => {
  it('new channel / breakout alerts on the bars of the channels and of the breakout labels', () => {
    const r = smbc.calculate(bars);
    expect(times(r, 1)).toEqual(sorted(r.markers.filter((m) => m.text === '▲').map((m) => m.time as number)));
    expect(times(r, 2)).toEqual(sorted(r.markers.filter((m) => m.text === '▼').map((m) => m.time as number)));
    expect(times(r, 1).length).toBeGreaterThan(0);
    expect(times(r, 2).length).toBeGreaterThan(0);
    // each new channel: one grey channel box (chart foreground colour, 90 transparency)
    expect(times(r, 0).length).toBeGreaterThan(0);
    const grey = String(color.new('#DBDBDB', 90));
    expect(r.boxes.filter((b) => b.bgColor === grey).length).toBe(times(r, 0).length);
  });
});

describe('smart-money-breakout-signals', () => {
  it('alertconditions and alert() calls on the signal bars', () => {
    const r = smbs.calculate(bars);
    const up = r.markers.filter((m) => m.shape === 'labelUp').map((m) => m.time as number);
    const down = r.markers.filter((m) => m.shape === 'labelDown').map((m) => m.time as number);
    expect(times(r, 0)).toEqual(up);
    expect(times(r, 1)).toEqual(down);
    expect(up.length).toBeGreaterThan(0);
    expect(down.length).toBeGreaterThan(0);
    const calls = r.alertCalls;
    expect(calls.filter((c) => c.message === 'Bullish Breakout Detected').map((c) => c.time)).toEqual(up);
    expect(calls.filter((c) => c.message === 'Bearish Breakout Detected').map((c) => c.time)).toEqual(down);
    expect(calls.every((c) => c.freq === 'once_per_bar')).toBe(true);
    expect(calls.length).toBe(up.length + down.length);
  });
});

describe('smart-money-breakouts', () => {
  it('BUY / Sell on the breaks that open a trade (the small labels)', () => {
    const r = smb.calculate(bars);
    const up = r.labels.filter((l) => l.text === '' && l.style === 'label_up').map((l) => l.time as number);
    const down = r.labels.filter((l) => l.text === '' && l.style === 'label_down').map((l) => l.time as number);
    expect(times(r, 0)).toEqual(up);
    expect(times(r, 1)).toEqual(down);
    expect(up.length).toBeGreaterThan(0);
    expect(down.length).toBeGreaterThan(0);
    // a trade is open from each of these bars: the bar colour is the bull / bear colour there
    for (const t of up) expect(r.barColors.find((b) => b.time === t)!.color).not.toBe('#343436');
  });
});

describe('smart-money-concepts-luxalgo', () => {
  const all = { showSwingOrderBlocks: true, showInternalOrderBlocks: true, showEqualHighsLows: true, showFairValueGaps: true };
  it('internal and swing structure alerts on the bars of the structure lines', () => {
    const r = smc.calculate(bars, all);
    const union = (ks: number[]) => sorted(ks.flatMap((k) => times(r, k)));
    const lineEnds = (style: string) => sorted(r.lines.filter((l) => l.style === style).map((l) => l.time2 as number));
    // dashed lines: internal BOS / CHoCH; solid lines: swing BOS / CHoCH (and the strong / weak high and low lines)
    expect(union([0, 1, 2, 3])).toEqual(lineEnds('dashed'));
    const solid = new Set(r.lines.filter((l) => l.style === undefined || l.style === 'solid').map((l) => l.time2 as number));
    for (const t of union([4, 5, 6, 7])) expect(solid.has(t)).toBe(true);
    // equal highs / lows: the dotted line (the latest one is kept) ends on the pivot, `size` (3) bars before the alert
    const eqLast = union([12, 13]).at(-1)!;
    const dotted = r.lines.filter((l) => l.style === 'dotted');
    expect(dotted.length).toBe(1);
    expect(dotted[0].time2).toBe(bars[bars.findIndex((b) => b.time === eqLast) - 3].time);
    const choch = r.labels.filter((l) => l.text === 'CHoCH').length;
    expect(times(r, 1).length + times(r, 3).length + times(r, 5).length + times(r, 7).length).toBe(choch);
    const bos = r.labels.filter((l) => l.text === 'BOS').length;
    expect(times(r, 0).length + times(r, 2).length + times(r, 4).length + times(r, 6).length).toBe(bos);
    for (const k of [0, 1, 2, 3, 4, 6, 8, 9, 12]) expect(times(r, k).length).toBeGreaterThan(0);
  });
  it('order block and FVG alerts only with their parts on', () => {
    const off = smc.calculate(bars, { showSwingOrderBlocks: false, showInternalOrderBlocks: false, showEqualHighsLows: false, showFairValueGaps: false });
    for (const k of [8, 9, 10, 11, 12, 13, 14, 15]) expect(times(off, k)).toEqual([]);
    const sq = squeezeBars(1200, 7);
    const r = smc.calculate(sq, { ...all, fairValueGapsThreshold: false });
    expect(times(r, 14).length + times(r, 15).length).toBeGreaterThan(0);
  });
  it('the plotcandle output is always given (no candle while Color Candles is off)', () => {
    const r = smc.calculate(bars);
    expect(Object.keys(r.plotCandles)).toEqual(['trendCandles']);
    expect(r.plotCandles.trendCandles.length).toBe(n);
    expect(r.plotCandles.trendCandles.every((c) => Number.isNaN(c.open))).toBe(true);
    const on = smc.calculate(bars, { showTrend: true });
    expect(on.plotCandles.trendCandles.every((c, i) => c.open === bars[i].open)).toBe(true);
  });
});
