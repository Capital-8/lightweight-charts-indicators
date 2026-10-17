/**
 * Alerts of community ports (batch 2): alertcondition() declarations and per-bar states, alert() calls.
 *
 * Each condition is computed again here from the expression of the original (or, for the large ports, checked
 * against the outputs that show the same condition), on a seeded random walk and on hand-crafted bars.
 */

import { describe, it, expect } from 'vitest';
import type { Bar } from 'oakscriptjs';
import type { AlertCall } from '../../src/types';
import type { ChartContext } from '../../src/chart-context';
import type { AlertConditionState } from '../../src/alert-states';
import * as alBrooks from '../../src/community/al-brooks-ii-ioi-oo';
import * as pitchfan from '../../src/community/auto-pitchfan-fib-extension-retracement-and';
import * as deadSimple from '../../src/community/dead-simple-reversal';
import * as haDoji from '../../src/community/heikin-ashi-doji-with-high-volume';
import * as jopa from '../../src/community/jopa-channel-v1';
import * as priceFlow from '../../src/community/price-flow-buy-sell';
import * as scalping from '../../src/community/scalping-pullback-tool';
import * as threeBar from '../../src/community/three-bar-reversal-continuation';
import * as zigzag from '../../src/community/zigzag-trend-divergence-detector';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk (daily bars, times in seconds) */
function walk(count: number, seed = 11): Bar[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = Math.max(1, open + Math.sin(i / 120) * 0.3 + (rand() - 0.5) * 3);
    const high = Math.max(open, close) + rand() * 1.5;
    const low = Math.max(0.5, Math.min(open, close) - rand() * 1.5);
    const volume = rand() < 0.08 ? 5000 + Math.floor(rand() * 5000) : 500 + Math.floor(rand() * 1000);
    bars.push({ time: 1262304000 + i * 86400, open, high, low, close, volume });
    price = close;
  }
  return bars;
}

/** Bars from [open, high, low, close] rows (volume 1000) */
const fromRows = (rows: number[][], vol?: number[]): Bar[] =>
  rows.map(([open, high, low, close], i) => ({ time: 1262304000 + i * 86400, open, high, low, close, volume: vol?.[i] ?? 1000 }));

const timesOf = (bars: Bar[], flags: boolean[]) => bars.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (a: AlertConditionState[]) => a.map(({ id, title, message }) => ({ id, title, message }));

const BARS = walk(1500);
const TICKER = 'TEST';
const chart = { tickerid: `NASDAQ:${TICKER}`, mintick: 0.01 } as ChartContext;

describe('Al Brooks II.IOI.OO alerts', () => {
  const expected = (bars: Bar[]) => {
    const h = (i: number) => (i >= 0 ? bars[i].high : NaN);
    const l = (i: number) => (i >= 0 ? bars[i].low : NaN);
    const inside = (i: number) => lt(h(i), h(i - 1)) && gt(l(i), l(i - 1));
    const outside = (i: number) => gt(h(i), h(i - 1)) && lt(l(i), l(i - 1));
    return [
      bars.map((_, i) => inside(i) && inside(i - 1)),
      bars.map((_, i) => outside(i) && outside(i - 1)),
      bars.map((_, i) => inside(i) && outside(i - 1) && inside(i - 2)),
    ];
  };

  it('declares the three conditions of the original', () => {
    expect(alBrooks.alertConditions).toEqual([
      { id: 'alert0', title: 'ii Pattern Alert', message: '连续两根Inside Bar出现在 {{ticker}}' },
      { id: 'alert1', title: 'OO Pattern Alert', message: '连续两根Outside Bar出现在 {{ticker}}' },
      { id: 'alert2', title: 'ioi Pattern Alert', message: 'ioi模式出现在 {{ticker}}' },
    ]);
    expect(alBrooks.AlBrooksIiIoiOo.alertConditions).toBe(alBrooks.alertConditions);
  });

  it('states equal the Pine expressions, whatever the show inputs', () => {
    const want = expected(BARS);
    for (const inputs of [{}, { showIi: false, showOo: false, showIoi: false }]) {
      const res = alBrooks.calculate(BARS, inputs);
      expect(decls(res.alerts)).toEqual(alBrooks.alertConditions);
      want.forEach((f, k) => expect(res.alerts[k].times).toEqual(timesOf(BARS, f)));
    }
    want.forEach((f) => expect(f.some(Boolean)).toBe(true));
  });

  it('fires on crafted patterns', () => {
    // bar 1 outside? no: 0 base, 1 inside, 2 inside (ii on 2), 3 outside, 4 outside (OO on 4), 5 inside, 6 outside,
    // 7 inside (ioi on 7)
    const bars = fromRows([
      [10, 20, 0, 10], [10, 18, 2, 10], [10, 16, 4, 10], [10, 30, -5, 10], [10, 40, -10, 10],
      [10, 35, -5, 10], [10, 50, -20, 10], [10, 45, -15, 10],
    ]);
    const res = alBrooks.calculate(bars);
    expect(res.alerts.map((a) => a.times)).toEqual([[bars[2].time], [bars[4].time], [bars[7].time]]);
    expect(res.alerts[2].triggered).toBe(true);
    expect(res.alerts[0].triggered).toBe(false);
  });
});

describe('Dead Simple Reversal alerts', () => {
  const expected = (bars: Bar[], near = 3, long = 50) => {
    const lowest = (i: number, len: number) => (i < len - 1 ? NaN : Math.min(...bars.slice(i - len + 1, i + 1).map((b) => b.low)));
    const highest = (i: number, len: number) => (i < len - 1 ? NaN : Math.max(...bars.slice(i - len + 1, i + 1).map((b) => b.high)));
    const ll = (i: number) => (i >= 0 ? lowest(i, long) : NaN);
    const lh = (i: number) => (i >= 0 ? highest(i, long) : NaN);
    const buy: boolean[] = [];
    const sell: boolean[] = [];
    bars.forEach((b, i) => {
      const p = bars[i - 1];
      const c1 = p ? p.close : NaN, o1 = p ? p.open : NaN;
      const nl = lowest(i, near), nh = highest(i, near);
      buy.push(lt(c1, o1) && gt(b.close, b.open) && gt(b.close, o1) && [1, 2, 3, 4].some((k) => gt(ll(i - k), nl)));
      sell.push(gt(c1, o1) && lt(b.close, b.open) && lt(b.close, o1) && [1, 2, 3, 4].some((k) => lt(lh(i - k), nh)));
    });
    return [buy, sell];
  };

  it('declares Buy Signal and Sell Signal', () => {
    expect(deadSimple.alertConditions).toEqual([
      { id: 'alert0', title: 'Buy Signal', message: 'Dead Simple Reversal — Buy' },
      { id: 'alert1', title: 'Sell Signal', message: 'Dead Simple Reversal — Sell' },
    ]);
    expect(deadSimple.DeadSimpleReversal.alertConditions).toBe(deadSimple.alertConditions);
  });

  it('states equal the Pine expressions and the triangles', () => {
    const res = deadSimple.calculate(BARS);
    const [buy, sell] = expected(BARS);
    expect(res.alerts[0].times).toEqual(timesOf(BARS, buy));
    expect(res.alerts[1].times).toEqual(timesOf(BARS, sell));
    expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
    expect(res.alerts[0].times).toEqual(res.markers.filter((m) => m.shape === 'triangleUp').map((m) => m.time));
    const small = expected(BARS, 5, 20);
    const res2 = deadSimple.calculate(BARS, { nearTerm: 5, longTerm: 20 });
    expect(res2.alerts[0].times).toEqual(timesOf(BARS, small[0]));
    expect(res2.alerts[1].times).toEqual(timesOf(BARS, small[1]));
  });
});

describe('Heikin Ashi Doji with High Volume alerts', () => {
  const expected = (bars: Bar[], pct: number, len = 20, mult = 1.5) => {
    let haO = NaN, haC = NaN;
    return bars.map((b, i) => {
      const c = (b.open + b.high + b.low + b.close) / 4;
      const o = isNaN(haO) ? (b.open + b.close) / 2 : (haO + haC) / 2;
      haO = o;
      haC = c;
      const hi = Math.max(b.high, o, c), lo = Math.min(b.low, o, c);
      const range = hi - lo;
      const body = range !== 0 ? (Math.abs(c - o) / range) * 100 : 0;
      const ma = i < len - 1 ? NaN : bars.slice(i - len + 1, i + 1).reduce((s, x) => s + (x.volume ?? 0), 0) / len;
      return le(body, pct) && ge(b.volume ?? NaN, ma * mult);
    });
  };

  it('declares the condition of the original', () => {
    expect(haDoji.alertConditions).toEqual([
      { id: 'alert0', title: 'Doji + High Volume', message: 'Heikin Ashi Doji with High Volume detected' },
    ]);
    expect(haDoji.HeikinAshiDojiHighVolume.alertConditions).toBe(haDoji.alertConditions);
  });

  it('state equals the Pine expression', () => {
    for (const pct of [10, 40]) {
      const res = haDoji.calculate(BARS, { bodyThresholdPct: pct });
      const want = expected(BARS, pct);
      expect(want.some(Boolean)).toBe(true);
      expect(res.alerts[0].times).toEqual(timesOf(BARS, want));
      expect(res.alerts[0].times).toEqual(res.markers.map((m) => m.time));
    }
  });
});

describe('JOPA Channel v1 alerts', () => {
  it('declares the four conditions', () => {
    expect(jopa.alertConditions.map((d) => [d.id, d.title, d.message])).toEqual([
      ['alert0', 'DVWAP Breakout Long (Value Bands)', 'Breakout above inner value band [JopAlgo]'],
      ['alert1', 'DVWAP Breakout Short (Value Bands)', 'Breakout below inner value band [JopAlgo]'],
      ['alert2', 'Top Zone (Containment/Value)', 'Price in top 20% of channel [JopAlgo]'],
      ['alert3', 'Bottom Zone (Containment/Value)', 'Price in bottom 20% of channel [JopAlgo]'],
    ]);
    expect(jopa.JopaChannelV1.alertConditions).toBe(jopa.alertConditions);
  });

  it('states follow the value bands, the relative volume and the 20 / 80 % guides', () => {
    const lenVol = 50;
    const rvol = BARS.map((b, i) => (i < lenVol - 1 ? NaN
      : b.volume! / (BARS.slice(i - lenVol + 1, i + 1).reduce((s, x) => s + x.volume!, 0) / lenVol)));
    for (const extra of [{}, { useContain: false }, { rvolMinBr: 1.5 }]) {
      const shown = jopa.calculate(BARS, { showValueRails: true, ...extra });
      const hidden = jopa.calculate(BARS, extra);
      const minBr = (extra as { rvolMinBr?: number }).rvolMinBr ?? 1;
      const up = shown.plots.plot1.map((p) => p.value as number);
      const dn = shown.plots.plot2.map((p) => p.value as number);
      const g20 = shown.plots.plot5.map((p) => p.value as number);
      const g80 = shown.plots.plot6.map((p) => p.value as number);
      const want = [
        BARS.map((b, i) => gt(b.close, up[i]) && ge(rvol[i], minBr)),
        BARS.map((b, i) => lt(b.close, dn[i]) && ge(rvol[i], minBr)),
        BARS.map((b, i) => !isNaN(g80[i]) && ge(b.close, g80[i])),
        BARS.map((b, i) => !isNaN(g20[i]) && le(b.close, g20[i])),
      ];
      want.forEach((f, k) => {
        expect(f.some(Boolean)).toBe(true);
        expect(shown.alerts[k].times).toEqual(timesOf(BARS, f));
        expect(hidden.alerts[k].times).toEqual(shown.alerts[k].times);
      });
    }
    // without the guides there is no zone alert
    const noGuides = jopa.calculate(BARS, { showGuides: false });
    expect(noGuides.alerts[2].times).toEqual([]);
    expect(noGuides.alerts[3].times).toEqual([]);
    expect(noGuides.alerts[0].times.length).toBeGreaterThan(0);
  });
});

describe('Price Flow - Buy Sell alerts', () => {
  it('declares BUY Alert and SELL Alert', () => {
    expect(priceFlow.alertConditions).toEqual([
      { id: 'alert0', title: 'BUY Alert', message: 'BUY signal on {{ticker}} at {{close}}' },
      { id: 'alert1', title: 'SELL Alert', message: 'SELL signal on {{ticker}} at {{close}}' },
    ]);
    expect(priceFlow.PriceFlowBuySell.alertConditions).toBe(priceFlow.alertConditions);
  });

  it('states are the bars of the BUY / SELL labels, whatever the label input', () => {
    for (const inputs of [{}, { strictAlternation: true }, { filterRng: false }]) {
      const res = priceFlow.calculate(BARS, inputs);
      const buys = res.markers.filter((m) => m.text === 'BUY').map((m) => m.time);
      const sells = res.markers.filter((m) => m.text === 'SELL').map((m) => m.time);
      expect(buys.length).toBeGreaterThan(0);
      expect(sells.length).toBeGreaterThan(0);
      expect(res.alerts[0].times).toEqual(buys);
      expect(res.alerts[1].times).toEqual(sells);
      const off = priceFlow.calculate(BARS, { ...inputs, showBuySell: false });
      expect(off.markers).toEqual([]);
      expect(off.alerts).toEqual(res.alerts);
    }
  });
});

describe('Scalping PullBack Tool alerts', () => {
  it('declares Buy Condition and Sell Condition', () => {
    expect(scalping.alertConditions).toEqual([
      { id: 'alert0', title: 'Buy Condition', message: 'BUY' },
      { id: 'alert1', title: 'Sell Condition', message: 'SELL' },
    ]);
    expect(scalping.ScalpingPullbackTool.alertConditions).toBe(scalping.alertConditions);
  });

  it('states are the bars on which the trading state leaves 0 (the arrows without delay)', () => {
    const inputs = { fastEMAlength: 20, mediumEMAlength: 50, slowEMAlength: 100, hiLoLen: 10 };
    for (const useHAcandles of [true, false]) {
      const res = scalping.calculate(BARS, { ...inputs, useHAcandles });
      const ups = (res.markers ?? []).filter((m) => m.shape === 'arrowUp').map((m) => m.time);
      const downs = (res.markers ?? []).filter((m) => m.shape === 'arrowDown').map((m) => m.time);
      expect(ups.length).toBeGreaterThan(0);
      expect(downs.length).toBeGreaterThan(0);
      expect(res.alerts[0].times).toEqual(ups);
      expect(res.alerts[1].times).toEqual(downs);
      // the closed-candle delay and the arrow switch only change the arrows
      const delayed = scalping.calculate(BARS, { ...inputs, useHAcandles, delayArrow: true, showBuySell: false });
      expect(delayed.alerts).toEqual(res.alerts);
    }
  });
});

describe('Three-Bar Reversal/Continuation alert() calls', () => {
  it('declares the alert function', () => {
    expect(threeBar.hasAlertFunction).toBe(true);
    expect(threeBar.ThreeBarReversalContinuation.hasAlertFunction).toBe(true);
  });

  it('one call per signal bar, frequency from the volume / range confirmation', () => {
    for (const inputs of [{ coeff: 1.2, detectLevel: 2 }, { coeff: 1.0, detectLevel: 1, showCont: false }]) {
      const res = threeBar.calculate(BARS, inputs);
      const len = 10;
      const avg = (i: number, f: (b: Bar) => number) =>
        (i < len - 1 ? NaN : BARS.slice(i - len + 1, i + 1).reduce((s, b) => s + f(b), 0) / len);
      const idx = new Map(BARS.map((b, i) => [b.time, i]));
      const bull = new Set(res.markers.filter((m) => m.position === 'belowBar').map((m) => m.time));
      const bear = new Set(res.markers.filter((m) => m.position === 'aboveBar').map((m) => m.time));
      const want: AlertCall[] = [];
      for (const b of BARS) {
        const i = idx.get(b.time)!;
        const confirm = gt(b.volume!, avg(i, (x) => x.volume!)) && gt(b.high - b.low, avg(i, (x) => x.high - x.low));
        const freq = confirm ? 'once_per_bar' : 'once_per_bar_close';
        if (bull.has(b.time)) want.push({ time: b.time as number, message: 'Bullish R/C Detected', freq });
        else if (bear.has(b.time)) want.push({ time: b.time as number, message: 'Bearish R/C Detected', freq });
      }
      expect(want.some((c) => c.message.startsWith('Bullish'))).toBe(true);
      expect(want.some((c) => c.message.startsWith('Bearish'))).toBe(true);
      expect(res.alertCalls).toEqual(want);
    }
  });

  it('crafted bars: strong bar, quiet bar, then a bullish bar', () => {
    // 10 calm bars, then a strong bar (range and volume x 5), a quiet bar (strength 0), and a bullish bar
    const rows: number[][] = [];
    const vol: number[] = [];
    for (let i = 0; i < 12; i++) {
      rows.push([100, 101, 99, 100.5]);
      vol.push(1000);
    }
    rows.push([100, 110, 95, 96]); vol.push(10000); // strong bearish bar
    rows.push([96, 97, 95.5, 96.5]); vol.push(900); // quiet
    rows.push([96.5, 99, 96, 98.8]); vol.push(2500); // bullish, wider range and more volume than the quiet bar
    const bars = fromRows(rows, vol);
    const res = threeBar.calculate(bars, { coeff: 2, detectLevel: 3 });
    expect(res.alertCalls).toEqual([{ time: bars[14].time, message: 'Bullish R/C Detected', freq: 'once_per_bar_close' }]);
  });
});

describe('Auto PitchFan, Fib Extension/Retracement and ZigZag alert() calls', () => {
  const bars = walk(700, 5);
  const levelRank = (key: string) => key === 'M' ? -1 : Number(key);

  /**
   * Expected calls of bar k from the run on the bars up to k: the pitchfan labels ("PF M (...)", "PF 0.5 R (...)")
   * and the Fibonacci labels ("RET 0.5 (...)") sit at the levels of bar k; a level strictly between the closes of
   * bars k - 1 and k makes the call
   */
  const expectedAt = (k: number, inputs: Partial<pitchfan.AutoPitchfanFibExtensionRetracementAndInputs>): AlertCall[] => {
    const res = pitchfan.calculate(bars.slice(0, k + 1), inputs, chart);
    const c0 = bars[k].close, c1 = bars[k - 1].close;
    const crossing = (p: number) => (gt(p, c0) && lt(p, c1)) || (lt(p, c0) && gt(p, c1));
    const pitch: { level: string; side: string; price: number }[] = [];
    const fib: { level: number; text: string; price: number }[] = [];
    for (const l of res.labels) {
      const t = l.text.trim();
      let m = /^PF (M|[\d.]+)(?: ([RS]))? \(/.exec(t);
      if (m) pitch.push({ level: m[1], side: m[2] ?? '', price: l.price });
      m = /^(RET|EXT) (-?[\d.]+) \(/.exec(t);
      if (m) fib.push({ level: Number(m[2]), text: m[2], price: l.price });
    }
    pitch.sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.side.localeCompare(b.side));
    const out: AlertCall[] = [];
    const time = bars[k].time as number;
    for (const p of pitch) {
      if (!crossing(p.price)) continue;
      const message = p.level === 'M' ? `AutoPitchFan: ${TICKER} crossing median level`
        : `AutoPitchFan: ${TICKER} crossing ${p.side === 'R' ? 'resistance' : 'support'} level ${p.level}`;
      out.push({ time, message, freq: 'once_per_bar' });
    }
    const ext = inputs.fibTool === 'Extentions';
    const order = pitchfan.inputConfig.filter((c) => /^value/.test(c.id)).map((c) => c.defval as number);
    fib.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
    for (const f of fib) {
      if (!crossing(f.price)) continue;
      out.push({ time, message: `AutoFib ${ext ? 'Extention : ' : 'Retracment : '}${TICKER} crossing level ${f.text}`, freq: 'once_per_bar' });
    }
    return out;
  };

  it('declares the alert function', () => {
    expect(pitchfan.hasAlertFunction).toBe(true);
    expect(pitchfan.AutoPitchfanFibExtensionRetracementAnd.hasAlertFunction).toBe(true);
  });

  for (const [name, inputs] of [
    ['pitchfan levels', {}],
    ['pitchfan + retracements', { isFib: true, levels: 'Levels (Prices)' }],
    ['extensions, all pitch levels', { isFib: true, fibTool: 'Extentions', levels: 'Levels (Prices)', pshow025: true, pshow2: true }],
  ] as [string, Partial<pitchfan.AutoPitchfanFibExtensionRetracementAndInputs>][]) {
    it(`every bar, the levels crossed by the close (${name})`, () => {
      const full = pitchfan.calculate(bars, inputs, chart).alertCalls;
      const from = 400;
      const want: AlertCall[] = [];
      for (let k = from; k < bars.length; k++) want.push(...expectedAt(k, inputs));
      expect(want.length).toBeGreaterThan(5);
      expect(full.filter((c) => c.time >= (bars[from].time as number))).toEqual(want);
      expect(full.some((c) => c.time < (bars[from].time as number))).toBe(true);
      if (inputs.isFib) expect(want.some((c) => c.message.startsWith('AutoFib '))).toBe(true);
    }, 60000);
  }

  it('no ticker without a chart context', () => {
    const calls = pitchfan.calculate(bars).alertCalls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.message.startsWith('AutoPitchFan:  crossing'))).toBe(true);
  });
});

describe('Zigzag Trend/Divergence Detector alert() calls', () => {
  const bars = walk(600, 3);
  const all = { alertContinuation: true, alertIndeterminate: true, alertDivergence: true, alertHiddenDivergence: true };
  const LIME = '#00E676', GREEN = '#4CAF50';

  /** The sentiment of the label of the newest zigzag point, when it was made on the last bar */
  const labelSentiment = (k: number): string | undefined => {
    const res = zigzag.calculate(bars.slice(0, k + 1), {}, chart) as { labels: { time: number; text: string; color: string }[] };
    const own = res.labels.filter((l) => l.time === bars[k].time);
    const l = own[own.length - 1];
    if (!l) return undefined;
    const bull = l.color.toUpperCase() === LIME || l.color.toUpperCase() === GREEN;
    switch (l.text) {
      case 'C': return bull ? 'Bullish Continuation' : 'Bearish Continuation';
      case 'D': return bull ? 'Bullish Divergence' : 'Bearish Divergence';
      case 'H': return bull ? 'Bullish Hidden Divergence' : 'Bearish Hidden Divergence';
      default: return 'Indeterminate';
    }
  };

  it('declares the alert function', () => {
    expect(zigzag.hasAlertFunction).toBe(true);
    expect(zigzag.ZigzagTrendDivergenceDetector.hasAlertFunction).toBe(true);
  });

  it('a call on the bar of a new last point, with its sentiment, for the sentiments switched on', () => {
    const from = 400;
    const want: { time: number; sentiment: string }[] = [];
    for (let k = from; k < bars.length; k++) {
      const s = labelSentiment(k);
      if (s) want.push({ time: bars[k].time as number, sentiment: s });
    }
    const message = (s: string) => `Sentiment alert on NASDAQ:${TICKER} :: ${s}`;
    const after = (c: AlertCall[]) => c.filter((x) => x.time >= (bars[from].time as number));

    const allCalls = after(zigzag.calculate(bars, all, chart).alertCalls);
    expect(allCalls).toEqual(want.map((w) => ({ time: w.time, message: message(w.sentiment), freq: 'once_per_bar' })));
    expect(new Set(want.map((w) => w.sentiment.replace(/^(Bullish|Bearish) /, ''))).size).toBeGreaterThan(2);

    // defaults: divergence and hidden divergence only
    const defCalls = after(zigzag.calculate(bars, {}, chart).alertCalls);
    expect(defCalls).toEqual(want.filter((w) => /Divergence$/.test(w.sentiment))
      .map((w) => ({ time: w.time, message: message(w.sentiment), freq: 'once_per_bar' })));
    expect(defCalls.length).toBeGreaterThan(0);
  }, 60000);

  it('confirmed pivots: a call when the confirmed point changes', () => {
    const res = zigzag.calculate(bars, { ...all, waitForConfirmation: true }, chart);
    const plain = zigzag.calculate(bars, all, chart);
    expect(res.alertCalls.length).toBeGreaterThan(0);
    expect(res.alertCalls.every((c) => /^Sentiment alert on NASDAQ:TEST :: (Bullish |Bearish )?\w/.test(c.message))).toBe(true);
    // a point is confirmed when the next point appears: no call on the bar the first point appears
    expect(res.alertCalls.map((c) => c.time)).not.toEqual(plain.alertCalls.map((c) => c.time));
  });
});
