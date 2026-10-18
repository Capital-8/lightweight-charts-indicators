/**
 * Community ports, batch 41: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression, or checked against the drawings
 * that stand for the same event), and the Style ids on the emitted markers / arrows.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as abc from '../../src/community/trading-abc';
import * as gaul from '../../src/community/trading-gaul';
import * as tz from '../../src/community/transient-zones';
import * as tdh from '../../src/community/trend-direction-helper';
import * as tdz from '../../src/community/trend-direction-zone';
import * as tdp from '../../src/community/trend-double-pullback-v1-0';
import * as tf from '../../src/community/trend-filter';
import * as tic from '../../src/community/trend-impulse-channels';
import * as tla from '../../src/community/trend-line-auto';
import * as tpo from '../../src/community/trend-pulse-oscillator';
import * as tss from '../../src/community/trend-state-signals';
import * as tsd from '../../src/community/trend-strength-direction';
import * as tt from '../../src/community/trend-targets';
import * as trader from '../../src/community/trend-trader';
import * as trm from '../../src/community/traders-reality-main';
import * as tmeter from '../../src/community/trend-meter';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'trading-abc': [['alert0', 'ABC Long', 'ABC Long'], ['alert1', 'ABC Short', 'ABC Short']],
  'trading-gaul': [
    ['alert0', 'CE Direction Change', 'Chandelier Exit has changed direction, {{exchange}}:{{ticker}}'],
    ['alert1', 'CE Buy', 'Chandelier Exit Buy, {{exchange}}:{{ticker}}'],
    ['alert2', 'CE Sell', 'Chandelier Exit Sell, {{exchange}}:{{ticker}}'],
  ],
  'trend-direction-zone': [
    ['alert0', 'Bullish Direction', 'Trend Direction Zone: bullish direction confirmed'],
    ['alert1', 'Bearish Direction', 'Trend Direction Zone: bearish direction confirmed'],
  ],
  'trend-double-pullback-v1-0': [
    ['alert0', '[Alert] Buy Signal', 'Stable Trend Buy: Double pullback 🚀'],
    ['alert1', '[Alert] Sell Signal', 'Stable Trend Sell: Double pullback 🩸'],
  ],
  'trend-line-auto': [['alert0', 'HarryBot Alert', 'Defense line is being crossed']],
  'trend-pulse-oscillator': [
    ['alert0', 'Osc Cross Up Signal', 'TPO: Osc crossed ABOVE Signal (bull)'],
    ['alert1', 'Osc Cross Down Signal', 'TPO: Osc crossed BELOW Signal (bear)'],
    ['alert2', 'Osc Cross Up 50', 'TPO: Osc crossed ABOVE 50'],
    ['alert3', 'Osc Cross Down 50', 'TPO: Osc crossed BELOW 50'],
    ['alert4', 'Osc Cross Up OB', 'TPO: Osc crossed ABOVE Overbought'],
    ['alert5', 'Osc Cross Down OS', 'TPO: Osc crossed BELOW Oversold'],
  ],
  'trend-state-signals': [
    ['alert0', 'Trend State Bullish', 'Trend State Signals: bullish state confirmed on {{exchange}}:{{ticker}} at {{close}}'],
    ['alert1', 'Trend State Bearish', 'Trend State Signals: bearish state confirmed on {{exchange}}:{{ticker}} at {{close}}'],
  ],
  'trend-strength-direction': [
    ['alert0', 'HMA1 Above Upper Angle Level', 'HMA Angle 1 is above the upper angle level'],
    ['alert1', 'HMA1 Below Lower Angle Level', 'HMA Angle 1 is below the lower angle level'],
  ],
  'trend-targets': [
    ['alert0', 'Trend Change: Bullish', 'Price crossed above SL - Potential Bullish Trend'],
    ['alert1', 'Trend Change: Bearish', 'Price crossed below SL - Potential Bearish Trend'],
    ['alert2', 'Rejection: Bearish', 'Price rejected at SL - Bearish Rejection'],
    ['alert3', 'Rejection: Bullish', 'Price rejected at SL - Bullish Rejection'],
    ['alert4', 'TP1 Hit', 'Price reached TP1 level'],
    ['alert5', 'TP2 Hit', 'Price reached TP2 level'],
    ['alert6', 'TP3 Hit', 'Price reached TP3 level'],
  ],
};

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of daily bars with a random volume */
function walk(count: number, seed0: number, step = 86400, start = 1577836800, vol = 4): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * vol);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1200, 11);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
const S = (a: number[], list: Bar[] = bars) => Series.fromArray(list, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const prev = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);
/** ta.crossover / ta.crossunder with exact comparisons (na = false) */
const xover = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v > b[i] && a[i - 1] <= b[i - 1]);
const xunder = (a: number[], b: number[]) => a.map((v, i) => i > 0 && v < b[i] && a[i - 1] >= b[i - 1]);
type Mk = { time: unknown; shape?: string; text?: string; id?: string; position?: string; price?: number; size?: unknown; color?: string };
const markerTimes = (ms: Mk[], pred: (m: Mk) => boolean) => uniq(ms.filter(pred).map((m) => m.time as number));

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'trading-abc': abc, 'trading-gaul': gaul, 'trend-direction-zone': tdz, 'trend-double-pullback-v1-0': tdp,
    'trend-line-auto': tla, 'trend-pulse-oscillator': tpo, 'trend-state-signals': tss, 'trend-strength-direction': tsd,
    'trend-targets': tt,
  };
  for (const [id, m] of Object.entries(mods)) it(id, () => expect(decls(m)).toEqual(SPEC[id]));
  it('exported objects carry the declarations', () => {
    expect(abc.TradingAbc.alertConditions).toBe(abc.alertConditions);
    expect(gaul.TradingGaul.alertConditions).toBe(gaul.alertConditions);
    expect(tdz.TrendDirectionZone.alertConditions).toBe(tdz.alertConditions);
    expect(tdp.TrendDoublePullbackV10.alertConditions).toBe(tdp.alertConditions);
    expect(tla.TrendLineAuto.alertConditions).toBe(tla.alertConditions);
    expect(tpo.TrendPulseOscillator.alertConditions).toBe(tpo.alertConditions);
    expect(tss.TrendStateSignals.alertConditions).toBe(tss.alertConditions);
    expect(tsd.TrendStrengthDirection.alertConditions).toBe(tsd.alertConditions);
    expect(tt.TrendTargets.alertConditions).toBe(tt.alertConditions);
  });
  it('trend-trader: re-ported to the original, which makes alert() calls', () => {
    expect(trader.hasAlertFunction).toBe(true);
    expect(trader.TrendTrader.hasAlertFunction).toBe(true);
  });
});

describe('alert conditions', () => {
  it('trading-abc: long / short are the bars of the plotshape triangles of the same condition', () => {
    let fired = [0, 0];
    for (const [list, inp] of [[bars, {}], [walk(1500, 5), { prd: 5 }], [walk(1500, 29, 86400, 1577836800, 2), { prd: 4 }]] as const) {
      const r = abc.calculate(list as Bar[], inp);
      const up = markerTimes(r.markers, (m) => m.shape === 'triangleUp');
      const dn = markerTimes(r.markers, (m) => m.shape === 'triangleDown');
      expect(times(r, 0)).toEqual(up);
      expect(times(r, 1)).toEqual(dn);
      fired = [fired[0] + up.length, fired[1] + dn.length];
    }
    expect(fired[0]).toBeGreaterThan(0);
    expect(fired[1]).toBeGreaterThan(0);
  });

  it('trading-gaul: direction change / buy / sell from the Chandelier Exit, with bar confirmation', () => {
    const len = 22, mult = 3;
    const close = bars.map((b) => b.close);
    const atr = A(ta.atr(bars, len)).map((v) => v * mult);
    const hi = A(ta.highest(S(close), len)), lo = A(ta.lowest(S(close), len));
    const dir: number[] = [];
    const ls: number[] = [], ss: number[] = [];
    let d = 1;
    for (let i = 0; i < bars.length; i++) {
      let l = hi[i] - atr[i];
      const lp = i > 0 && !isNaN(ls[i - 1]) ? ls[i - 1] : l;
      if (gt(prev(close, i), lp)) l = Math.max(l, lp);
      let s = lo[i] + atr[i];
      const sp = i > 0 && !isNaN(ss[i - 1]) ? ss[i - 1] : s;
      if (lt(prev(close, i), sp)) s = Math.min(s, sp);
      d = gt(close[i], sp) ? 1 : lt(close[i], lp) ? -1 : d;
      ls.push(l); ss.push(s); dir.push(d);
    }
    const change = dir.map((v, i) => i > 0 && v !== dir[i - 1]);
    const buy = dir.map((v, i) => i > 0 && v === 1 && dir[i - 1] === -1);
    const sell = dir.map((v, i) => i > 0 && v === -1 && dir[i - 1] === 1);
    const r = gaul.calculate(bars);
    expect(times(r, 0)).toEqual(timeAt(bars, change));
    expect(times(r, 1)).toEqual(timeAt(bars, buy));
    expect(times(r, 2)).toEqual(timeAt(bars, sell));
    expect(times(r, 1).length).toBeGreaterThan(3);
    expect(times(r, 2).length).toBeGreaterThan(3);
    // await = barstate.isconfirmed: an open last bar is left out, unless "Await Bar Confirmation" is off
    const k = bars.findIndex((_b, i) => i > 50 && change[i]);
    const cut = bars.slice(0, k + 1);
    expect(gaul.calculate(cut).alerts[0].triggered).toBe(true);
    expect(gaul.calculate(cut, {}, { lastBarConfirmed: false }).alerts[0].triggered).toBe(false);
    expect(gaul.calculate(cut, { awaitBarConfirmation: false }, { lastBarConfirmed: false }).alerts[0].triggered).toBe(true);
  });

  it('trend-direction-zone: bullish / bearish direction are the bars of the direction triangles', () => {
    for (const list of [bars, walk(900, 3)]) {
      const r = tdz.calculate(list);
      const up = markerTimes(r.markers, (m) => m.shape === 'triangleUp');
      const dn = markerTimes(r.markers, (m) => m.shape === 'triangleDown');
      expect(times(r, 0)).toEqual(up);
      expect(times(r, 1)).toEqual(dn);
      expect(up.length).toBeGreaterThan(2);
      expect(dn.length).toBeGreaterThan(2);
      // the alerts do not depend on "Show Direction Signals"
      const hidden = tdz.calculate(list, { showSignals: false });
      expect(hidden.markers).toEqual([]);
      expect(times(hidden, 0)).toEqual(up);
      expect(times(hidden, 1)).toEqual(dn);
    }
    // an open last bar gives no signal (barstate.isconfirmed)
    const r = tdz.calculate(bars);
    const t = times(r, 0)[1];
    const cut = bars.filter((b) => (b.time as number) <= t);
    expect(tdz.calculate(cut).alerts[0].triggered).toBe(true);
    expect(tdz.calculate(cut, {}, { lastBarConfirmed: false }).alerts[0].triggered).toBe(false);
  });

  it('trend-double-pullback-v1-0: buy / sell are the bars of the 买入 / 卖出 triangles', () => {
    let fired = [0, 0];
    for (const [list, inp] of [[bars, {}], [walk(1500, 7, 86400, 1577836800, 2), { trendStability: 10, signalCooldown: 3 }],
      [walk(1500, 41, 86400, 1577836800, 1.5), { trendStability: 5, signalCooldown: 2, breakoutTolerance: 3 }]] as const) {
      const r = tdp.calculate(list as Bar[], inp);
      const buy = markerTimes(r.markers, (m) => m.text === '买入');
      const sell = markerTimes(r.markers, (m) => m.text === '卖出');
      expect(times(r, 0)).toEqual(buy);
      expect(times(r, 1)).toEqual(sell);
      fired = [fired[0] + buy.length, fired[1] + sell.length];
    }
    expect(fired[0]).toBeGreaterThan(0);
    expect(fired[1]).toBeGreaterThan(0);
  });

  it('trend-line-auto: the close crossing the oldest top / bottom line, on the last bar only', () => {
    const term = 15, segment = 55, limit = 100, mid = Math.floor(term / 2) + 1;
    /** up_lim / dn_lim of the original: care() of the lines drawn on the last `limit` bars (the oldest one's price) */
    const levels = (list: Bar[], nowMs: number) => {
      const n = list.length;
      const hh = A(ta.highest(S(list.map((b) => b.high), list), term));
      const ll = A(ta.lowest(S(list.map((b) => b.low), list), term));
      const fu = list.map((_, i) => (i >= mid && hh[i] === list[i - mid].high ? list[i - mid].high : NaN));
      const fd = list.map((_, i) => (i >= mid && ll[i] === list[i - mid].low ? list[i - mid].low : NaN));
      type L = { x1: number; y1: number; x2: number; y2: number; del: boolean };
      const all: L[] = [];
      // lines only on the bars within `limit` daily intervals of timenow; at most 50 lines
      const draw = (dat: number[], i: number, up: boolean): L | null => {
        if (!((list[i].time as number) * 1000 > nowMs - limit * 86400 * 1000)) return null;
        let maxv = 90, maxk = 0;
        for (let k = 0; k < segment; k++) {
          if (i - k < 0 || isNaN(dat[i - k])) continue;
          const a = (Math.atan((dat[i] - dat[i - k]) / k) / (355 / 113)) * 180;
          if ((up ? a : -a) < maxv) { maxk = k; maxv = up ? a : -a; }
        }
        if (maxk <= 0) return null;
        const l = { x1: i - maxk - mid, y1: dat[i - maxk], x2: i - mid, y2: dat[i], del: false };
        all.push(l);
        const live = all.filter((x) => !x.del);
        if (live.length > 50) live[0].del = true;
        return l;
      };
      const upL: (L | null)[] = [], dnL: (L | null)[] = [];
      for (let i = 0; i < n; i++) { upL.push(draw(fu, i, true)); dnL.push(draw(fd, i, false)); }
      const last = n - 1;
      const care = (lin: (L | null)[]) => {
        let ref = 0;
        for (let k = 0; k < limit; k++) {
          const l = lin[last - k];
          if (!l) continue;
          ref = l.del ? NaN : l.y1 + ((l.y2 - l.y1) * (last - l.x1)) / (l.x2 - l.x1);
          const gap = Math.abs(list[last].close - ref) / (hh[last] - ll[last]);
          if (gap > 2 || Math.abs(l.x1 - l.x2) < term) l.del = true;
        }
        return ref;
      };
      const up = care(upL);
      return [up, care(dnL)];
    };
    let fired = 0;
    for (let n = 300; n <= 1200; n += 3) {
      const list = bars.slice(0, n);
      // timenow just after the last bar (daily chart): the lines of the last `limit` bars exist
      const nowMs = ((list[n - 1].time as number) + 3600) * 1000;
      const r = tla.calculate(list, {}, { timeframe: '1D', now: nowMs } as never);
      const [u, d] = levels(list, nowMs);
      const c = list[n - 1].close, c1 = list[n - 2].close;
      const exp = (c1 < u && c > u) || (c1 > d && c < d) || (c1 > u && c < u) || (c1 < d && c > d);
      expect(times(r, 0)).toEqual(exp ? [list[n - 1].time] : []);
      if (exp) fired++;
    }
    expect(fired).toBeGreaterThan(3);
  });

  it('trend-pulse-oscillator: crosses of the oscillator with the signal, 50, overbought and oversold', () => {
    const close = S(bars.map((b) => b.close));
    const fast = A(ta.ema(close, 9)), slow = A(ta.ema(close, 21)), atr = A(ta.atr(bars, 14));
    const osc = fast.map((f, i) => 50 + 50 * (2 / Math.PI) * Math.atan((atr[i] > 0 ? (f - slow[i]) / atr[i] : 0) * 2));
    const sig = A(ta.ema(S(osc), 9));
    const k = (v: number) => osc.map(() => v);
    const exp = [xover(osc, sig), xunder(osc, sig), xover(osc, k(50)), xunder(osc, k(50)), xover(osc, k(80)), xunder(osc, k(20))];
    const r = tpo.calculate(bars);
    exp.forEach((f, j) => {
      expect(times(r, j)).toEqual(timeAt(bars, f));
      expect(times(r, j).length).toBeGreaterThan(2);
    });
    // other levels from the inputs
    const r2 = tpo.calculate(bars, { ob: 70, os: 30 });
    expect(times(r2, 4)).toEqual(timeAt(bars, xover(osc, k(70))));
    expect(times(r2, 5)).toEqual(timeAt(bars, xunder(osc, k(30))));
  });

  it('trend-state-signals: bullish / bearish are the bars of the BULLISH / BEARISH labels', () => {
    const r = tss.calculate(bars);
    const bull = markerTimes(r.markers, (m) => m.text === 'BULLISH');
    const bear = markerTimes(r.markers, (m) => m.text === 'BEARISH');
    expect(times(r, 0)).toEqual(bull);
    expect(times(r, 1)).toEqual(bear);
    expect(bull.length).toBeGreaterThan(3);
    expect(bear.length).toBeGreaterThan(3);
    const hidden = tss.calculate(bars, { showLabels: false });
    expect(times(hidden, 0)).toEqual(bull);
    expect(times(hidden, 1)).toEqual(bear);
    // confirm on close: an open last bar gives no signal
    const cut = bars.filter((b) => (b.time as number) <= bull[1]);
    expect(tss.calculate(cut).alerts[0].triggered).toBe(true);
    expect(tss.calculate(cut, {}, { lastBarConfirmed: false }).alerts[0].triggered).toBe(false);
    expect(tss.calculate(cut, { confirmOnClose: false }, { lastBarConfirmed: false }).alerts[0].triggered).toBe(true);
  });

  it('trend-strength-direction: the HMA 1 angle above 45 / below -45', () => {
    const list = walk(1000, 13, 86400, 1577836800, 6);
    const close = S(list.map((b) => b.close), list);
    const w1 = A(ta.wma(close, 10)), w2 = A(ta.wma(close, 20));
    const hma = A(ta.wma(S(w1.map((v, i) => 2 * v - w2[i]), list), Math.round(Math.sqrt(20))));
    const ang = hma.map((v, i) => (Math.atan(v - prev(hma, i)) * 180) / Math.PI);
    const r = tsd.calculate(list);
    expect(times(r, 0)).toEqual(timeAt(list, ang.map((v) => v > 45)));
    expect(times(r, 1)).toEqual(timeAt(list, ang.map((v) => v < -45)));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
  });

  it('trend-targets: crosses of the stop loss and the targets set on each trend change', () => {
    const cfgs = [{}, { stFactor: 4, stAtrPeriod: 30, wmaLength: 10, emaLength: 5 }];
    const fired = new Array(7).fill(0);
    for (const inp of cfgs) {
      const r = tt.calculate(bars, inp);
      // trend from the trend-change labels (labelUp: up, labelDown: down)
      const ups = new Set(markerTimes(r.markers, (m) => m.shape === 'labelUp'));
      const dns = new Set(markerTimes(r.markers, (m) => m.shape === 'labelDown'));
      const vol = A(ta.atr(bars, 14));
      let trend = 0, sl = 0, tp = [0, 0, 0];
      const slA: number[] = [], tpA: number[][] = [[], [], []];
      bars.forEach((b, i) => {
        const prevTrend = trend;
        if (ups.has(b.time as number)) trend = 1;
        if (dns.has(b.time as number)) trend = -1;
        // longSignal = ta.crossover(trend, 0), shortSignal = ta.crossunder(trend, 0)
        const long = i > 0 && trend > 0 && prevTrend <= 0;
        const short = i > 0 && trend < 0 && prevTrend >= 0;
        if (long || short) {
          sl = long ? b.low - vol[i] * 5 : b.high + vol[i] * 5;
          const d = Math.abs(b.close - sl) * (long ? 1 : -1);
          tp = [0.5, 1.0, 1.5].map((m) => b.close + d * m);
        }
        slA.push(sl);
        for (let k = 0; k < 3; k++) tpA[k].push(tp[k]);
      });
      const close = bars.map((b) => b.close), high = bars.map((b) => b.high), low = bars.map((b) => b.low);
      const exp = [
        xover(close, slA), xunder(close, slA),
        xover(high, slA).map((x, i) => x && close[i] < slA[i]),
        xunder(low, slA).map((x, i) => x && close[i] > slA[i]),
        xover(close, tpA[0]), xover(close, tpA[1]), xover(close, tpA[2]),
      ];
      exp.forEach((f, k) => {
        expect(times(r, k)).toEqual(timeAt(bars, f));
        fired[k] += times(r, k).length;
      });
      // the last levels are the ones drawn
      const slLabel = r.labels.find((l) => l.text.startsWith('✘ SL'));
      if (slLabel) expect(slLabel.price).toBeCloseTo(slA[slA.length - 1], 8);
    }
    fired.forEach((c) => expect(c).toBeGreaterThan(0));
    // without "Show Take Profit Levels" the levels stay at 0
    const off = tt.calculate(bars, { showTp: false });
    for (let k = 0; k < 7; k++) expect(times(off, k)).toEqual([]);
  });
});

describe('Style ids', () => {
  const idsOf = (ms: Mk[]) => [...new Set(ms.map((m) => m.id as string))].sort();
  it('trading-gaul: circles and Buy / Sell labels', () => {
    const r = gaul.calculate(bars);
    for (const m of r.markers) {
      expect(['shape0', 'shape1', 'shape2', 'shape3']).toContain(m.id);
      const want = m.shape === 'labelUp' ? 'shape1' : m.shape === 'labelDown' ? 'shape3'
        : times(r, 1).includes(m.time as number) ? 'shape0' : 'shape2';
      expect(m.id).toBe(want);
    }
    expect(new Set(r.markers.map((m) => m.id)).size).toBe(4);
  });

  it('transient-zones: plotarrow outputs as arrows on the central bar', () => {
    const hL = 10, hR = 10, w = hL + hR + 1;
    const r = tz.calculate(bars);
    expect(r.markers.some((m) => m.shape === 'arrowUp' || m.shape === 'arrowDown')).toBe(false);
    const hiT: number[] = [], loT: number[] = [];
    for (let i = w - 1; i < bars.length; i++) {
      const c = i - hR - 1;
      const win = bars.slice(i - w + 1, i + 1);
      if (bars[c].high >= Math.max(...win.map((b) => b.high))) hiT.push(bars[c].time as number);
      if (bars[c].low <= Math.min(...win.map((b) => b.low))) loT.push(bars[c].time as number);
    }
    const a0 = r.arrows.filter((a) => a.id === 'arrow0');
    const a1 = r.arrows.filter((a) => a.id === 'arrow1');
    expect(a0.map((a) => a.time)).toEqual(hiT);
    expect(a1.map((a) => a.time)).toEqual(loT);
    expect(a0.every((a) => a.value === -1)).toBe(true);
    expect(a1.every((a) => a.value === 1)).toBe(true);
    expect(hiT.length).toBeGreaterThan(5);
    expect(r.arrows.every((a) => ['arrow0', 'arrow1'].includes(a.id))).toBe(true);
  });

  it('trend-direction-helper: HH / LH / HL / LL squares', () => {
    const r = tdh.calculate(bars, { showHHLL: true });
    const want: Record<string, string> = { '[HH]': 'shape0', '[LH]': 'shape1', '[HL]': 'shape2', '[LL]': 'shape3' };
    expect(r.markers.length).toBeGreaterThan(10);
    for (const m of r.markers) expect(m.id).toBe(want[m.text as string]);
    expect(idsOf(r.markers)).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
  });

  it('trend-filter: circles and signal triangles', () => {
    const r = tf.calculate(bars, { signals: true });
    const want = (m: Mk) => (m.shape === 'triangleDown' ? 'shape2' : m.shape === 'triangleUp' ? 'shape3' : null);
    for (const m of r.markers) {
      expect(['shape0', 'shape1', 'shape2', 'shape3']).toContain(m.id);
      if (want(m)) expect(m.id).toBe(want(m));
    }
    expect(idsOf(r.markers)).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    // circles: Falling above the filter, Rising below it
    const line = new Map(r.plots.plot0.map((p) => [p.time, p.value as number]));
    for (const m of r.markers.filter((x) => x.shape === 'circle')) {
      expect(m.id).toBe((m.price as number) > (line.get(m.time) as number) ? 'shape0' : 'shape1');
    }
  });

  it('trend-impulse-channels: retest triangles and the two step circles of each step', () => {
    const list = walk(1500, 17);
    const r = tic.calculate(list, { showStepSignals: true });
    for (const m of r.markers) expect(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']).toContain(m.id);
    expect(r.markers.filter((m) => m.shape === 'triangleUp').every((m) => m.id === 'shape0')).toBe(true);
    expect(r.markers.filter((m) => m.shape === 'triangleDown').every((m) => m.id === 'shape1')).toBe(true);
    const byId = (id: string) => r.markers.filter((m) => m.id === id);
    expect(byId('shape2').length).toBeGreaterThan(0);
    expect(byId('shape3').length).toBeGreaterThan(0);
    expect(byId('shape2').map((m) => [m.time, m.price])).toEqual(byId('shape4').map((m) => [m.time, m.price]));
    expect(byId('shape3').map((m) => [m.time, m.price])).toEqual(byId('shape5').map((m) => [m.time, m.price]));
    const hiAt = new Map(list.map((b) => [b.time, b.high]));
    const loAt = new Map(list.map((b) => [b.time, b.low]));
    expect(byId('shape2').every((m) => m.price === hiAt.get(m.time) && m.size === 'tiny')).toBe(true);
    expect(byId('shape5').every((m) => m.price === loAt.get(m.time) && m.size === 'small')).toBe(true);
    expect(byId('shape0').length + byId('shape1').length).toBeGreaterThan(0);
  });
});

describe('traders-reality-main', () => {
  const SPEC: Array<[string, string]> = [
    ['Alert on Any Vector Candle', '{{ticker}} Vector Candle on the {{interval}}'],
    ['Green Vector Candle', '{{ticker}} Green Vector Candle on the {{interval}} Note: alert triggers in real time before the candle is closed unless you choose "once per bar close" option - ie the alert might trigger at some point and the pa after that could change the vector color completely. Use with caution.'],
    ['Red Vector Candle', '{{ticker}} Red Vector Candle on the {{interval}} Note: alert triggers in real time before the candle is closed unless you choose "once per bar close" option- ie the alert might trigger at some point and the pa after that could change the vector color completely. Use with caution.'],
    ['Blue Vector Candle', '{{ticker}} Blue Vector Candle on the {{interval}} Note: alert triggers in real time before the candle is closed unless you choose "once per bar close" option- ie the alert might trigger at some point and the pa after that could change the vector color completely. Use with caution.'],
    ['Purple Vector Candle', '{{ticker}} Purple Vector Candle on the {{interval}} Note: alert triggers in real time before the candle is closed unless you choose "once per bar close" option- ie the alert might trigger at some point and the pa after that could change the vector color completely. Use with caution.'],
    ['Red/Green Vector Candle Pattern', '{{ticker}} Red/Green Vector Candle Pattern on the {{interval}}'],
    ['Green/Red Vector Candle Pattern', '{{ticker}} Green/Red Vector Candle Pattern on the {{interval}}'],
    ['Red/Blue Vector Candle Pattern', '{{ticker}} Red/Blue Vector Candle Pattern on the {{interval}}'],
    ['Blue/Red Vector Candle Pattern', '{{ticker}} Blue/Red Vector Candle Pattern on the {{interval}}'],
    ['Green/Purple Vector Candle Pattern', '{{ticker}} Green/Purple Vector Candle Pattern on the {{interval}}'],
    ['Purple/Green Vector Candle Pattern', '{{ticker}} Purple/Green Vector Candle Pattern on the {{interval}}'],
    ['Blue/Purple Vector Candle Pattern', '{{ticker}} Blue/Purple Vector Candle Pattern on the {{interval}}'],
    ['Purple/Blue Vector Candle Pattern', '{{ticker}} Purple/Blue Vector Candle Pattern on the {{interval}}'],
    ['ADR High reached', 'PA has reached the calculated ADR High'],
    ['ADR Low reached', 'PA has reached the calculated ADR Low'],
    ['50% of ADR High reached', 'PA has reached 50% of the calculated ADR High'],
    ['50% ADR Low reached', 'PA has reached 50% the calculated ADR Low'],
    ['AWR High reached', 'PA has reached the calculated AWR High'],
    ['AWR Low reached', 'PA has reached the calculated AWR Low'],
    ['50% of AWR High reached', 'PA has reached 50% of the calculated AWR High'],
    ['50% AWR Low reached', 'PA has reached 50% of the calculated AWR Low'],
    ['AMR High reached', 'PA has reached the calculated AMR High'],
    ['AMR Low reached', 'PA has reached the calculated AMR Low'],
    ['50% of AMR High reached', 'PA has reached 50% of the calculated AMR High'],
    ['50% of AMR Low reached', 'PA has reached 50% of the calculated AMR Low'],
    ['Range Daily High reached', 'PA has reached the calculated Range Daily High'],
    ['Range Daily Low reached', 'PA has reached the calculated Range Daily Low'],
    ['50% of Range Daily High reached', 'PA has reached 50% of the calculated Range Daily High'],
    ['50% of Range Daily Low reached', 'PA has reached 50% of the calculated Range Daily Low'],
    ['Range Weekly High reached', 'PA has reached the calculated Range Weekly High'],
    ['Range Weekly Low reached', 'PA has reached the calculated Range Weekly Low'],
    ['50% of Range Weekly High reached', 'PA has reached 50% of the calculated Range Weekly High'],
    ['50% of Range Weekly Low reached', 'PA has reached 50% of the calculated Range Weekly Low'],
    ['PA crossed under Psy Hi', 'PA has crossed under the Psy Hi'],
    ['PA crossed over Psy Hi', 'PA has crossed over the Psy Hi'],
    ['PA crossed under Psy Lo', 'PA has crossed under the Psy Lo'],
    ['PA crossed over Psy Lo', 'PA has crossed over the Psy Lo'],
    ['PA crossed Daily open', 'PA has crossed the Daily open'],
  ];

  const DAY_S = 86400;
  const START = Date.UTC(2024, 0, 1) / 1000; // a Monday, 00:00 UTC

  /** Seeded random walk (mulberry32) of hourly bars on every day, with volume and some volume spikes */
  const walk = (count: number, seed: number, regimes = false): Bar[] => {
    let st = seed >>> 0;
    const rnd = () => {
      st = (st + 0x6d2b79f5) >>> 0;
      let x = st;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const out: Bar[] = [];
    let price = 100;
    let scale = 1;
    let drift = 0;
    for (let i = 0; i < count; i++) {
      // with regimes: volatility and drift change every week (rare range breaks of the week levels)
      if (regimes && i % 168 === 0) {
        scale = 0.4 + 1.6 * rnd();
        drift = (rnd() - 0.4) * 0.5;
      }
      const open = price;
      const close = open + ((rnd() - 0.5) * 1.6 + drift) * scale;
      const high = Math.max(open, close) + rnd() * 0.6 * scale;
      const low = Math.min(open, close) - rnd() * 0.6 * scale;
      const spike = rnd();
      const volume = 1000 * (0.5 + rnd()) * (spike > 0.93 ? 2.6 : spike > 0.85 ? 1.7 : 1);
      out.push({ time: START + i * 3600, open, high, low, close, volume });
      price = close;
    }
    return out;
  };

  const baseBars = walk(1500, 41);
  // the helpers below read these: the bars of the running case
  let bars = baseBars;
  let n = bars.length;
  let close = bars.map((b) => b.close);
  const useBars = (data: Bar[]) => {
    bars = data;
    n = data.length;
    close = data.map((b) => b.close);
  };
  const timesOf = (flags: boolean[]) => bars.filter((_, i) => flags[i]).map((b) => b.time as number);

  // ta.crossover / ta.crossunder (na: false)
  const xover = (lvl: number[]) => close.map((c, i) => i > 0 && c > lvl[i] && close[i - 1] <= lvl[i - 1]);
  const xunder = (lvl: number[]) => close.map((c, i) => i > 0 && c < lvl[i] && close[i - 1] >= lvl[i - 1]);
  const nz0 = (flags: boolean[], lvl: number[]) => flags.map((f, i) => f && !Number.isNaN(lvl[i]) && lvl[i] !== 0);

  // PVSRA class: 3 / -3 (green / red), 2 / -2 (blue / violet), 0 regular
  const pvsraClass = (): number[] => bars.map((b, i) => {
    let sum = 0;
    let hiSpread = -Infinity;
    for (let k = i - 10; k < i; k++) {
      if (k < 0) {
        sum = NaN;
        hiSpread = NaN;
        break;
      }
      sum += bars[k].volume!;
      hiSpread = Math.max(hiSpread, bars[k].volume! * (bars[k].high - bars[k].low));
    }
    const avg = sum / 10;
    const up = b.close > b.open;
    if (b.volume! >= 2 * avg || b.volume! * (b.high - b.low) >= hiSpread) return up ? 3 : -3;
    if (b.volume! >= 1.5 * avg) return up ? 2 : -2;
    return 0;
  });

  /** Higher-timeframe periods of the UTC calendar: key of each bar */
  const dayKey = (t: number) => Math.floor(t / DAY_S);
  const weekKey = (t: number) => {
    const d = Math.floor(t / DAY_S);
    return d - ((new Date(d * DAY_S * 1000).getUTCDay() + 6) % 7);
  };
  const monthKey = (t: number) => {
    const d = new Date(t * 1000);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };

  /** adrHiLo(length, 1, fromDO) of the periods, read with lookahead (the current period) on each chart bar */
  const rangeLevels = (key: (t: number) => number, length: number, fromDO: boolean) => {
    const group: number[] = [];
    const htf: Array<{ open: number; high: number; low: number; close: number }> = [];
    let prev = NaN;
    for (const b of bars) {
      const k = key(b.time as number);
      if (k !== prev) htf.push({ open: b.open, high: b.high, low: b.low, close: b.close });
      else {
        const h = htf[htf.length - 1];
        h.high = Math.max(h.high, b.high);
        h.low = Math.min(h.low, b.low);
        h.close = b.close;
      }
      prev = k;
      group.push(htf.length - 1);
    }
    const tr = htf.map((h, j) => (j === 0 ? h.high - h.low
      : Math.max(h.high - h.low, Math.abs(h.high - htf[j - 1].close), Math.abs(h.low - htf[j - 1].close))));
    // ta.sma(tr[1], length)
    const adr = htf.map((_, j) => {
      if (j < length) return NaN;
      let s = 0;
      for (let k = j - length; k < j; k++) s += tr[k];
      return s / length;
    });
    const hi = htf.map((h, j) => (fromDO ? h.open + adr[j]
      : h.high - h.low < adr[j] ? h.low + adr[j] : h.close >= h.open ? h.low + adr[j] : h.high));
    const lo = htf.map((h, j) => (fromDO ? h.open - adr[j]
      : h.high - h.low < adr[j] ? h.high - adr[j] : h.close >= h.open ? h.low : h.high - adr[j]));
    const high = group.map((g) => hi[g]);
    const low = group.map((g) => lo[g]);
    const high50 = group.map((g) => hi[g] - adr[g] / 2);
    const low50 = group.map((g) => lo[g] + adr[g] / 2);
    return [
      nz0(xover(high), high), nz0(xunder(low), low), nz0(xover(high50), high50), nz0(xunder(low50), low50),
    ];
  };

  /** All 38 conditions, recomputed from the original's expressions */
  const expected = (inp: Partial<trm.TradersRealityMainInputs>, res: ReturnType<typeof trm.calculate>): boolean[][] => {
    const cfg = { ...trm.defaultInputs, ...inp };
    const cls = pvsraClass();
    const is = (c: number) => cls.map((v) => v === c);
    const pair = (now: number, before: number) => cls.map((v, i) => v === now && i > 0 && cls[i - 1] === before);
    // psy levels: read from the port's historical plots (showAllPsy on), the cross logic is the test's
    const psyHi = res.plots.plot11.map((p) => (p.value == null ? NaN : (p.value as number)));
    const psyLo = res.plots.plot12.map((p) => (p.value == null ? NaN : (p.value as number)));
    // getdayOpen(): open of the first bar of each day after the first bar of the chart
    const dOpen: number[] = [];
    let o = NaN;
    bars.forEach((b, i) => {
      if (i > 0 && dayKey(b.time as number) !== dayKey(bars[i - 1].time as number)) o = b.open;
      dOpen.push(o);
    });
    const cross = xover(dOpen).map((v, i) => v || xunder(dOpen)[i]);
    return [
      cls.map((v) => v !== 0),
      is(3), is(-3), is(2), is(-2),
      pair(3, -3), pair(-3, 3), pair(2, -3), pair(-3, 2),
      pair(-2, 3), pair(3, -2), pair(-2, 2), pair(2, -2),
      ...rangeLevels(dayKey, cfg.adrRange, cfg.showADRDO),
      ...rangeLevels(weekKey, cfg.awrRange, cfg.showAWRWO),
      ...rangeLevels(monthKey, cfg.amrRange, cfg.showAMRMO),
      ...rangeLevels(dayKey, cfg.rdRange, cfg.showRDDO),
      ...rangeLevels(weekKey, cfg.rwRange, cfg.showRWWO),
      nz0(xunder(psyHi), psyHi), nz0(xover(psyHi), psyHi), nz0(xunder(psyLo), psyLo), nz0(xover(psyLo), psyLo),
      nz0(cross, dOpen),
    ];
  };

  it('declares the 38 alert conditions of the original', () => {
    expect(trm.alertConditions).toEqual(SPEC.map(([title, message], k) => ({ id: `alert${k}`, title, message })));
    expect(trm.TradersRealityMain.alertConditions).toBe(trm.alertConditions);
  });

  const cases: Array<[string, Partial<trm.TradersRealityMainInputs>]> = [
    ['defaults (historical psy levels on to read them)', { showAllPsy: true }],
    ['short lengths, ranges from the open', {
      showAllPsy: true, adrRange: 3, awrRange: 2, amrRange: 1, rdRange: 5, rwRange: 3, showADRDO: true, showAWRWO: true,
      showAMRMO: true,
    }],
    ['short lengths, ranges from high / low', { showAllPsy: true, awrRange: 1, amrRange: 1, rwRange: 2, rdRange: 2 }],
  ];
  // bars with weekly volatility / drift regimes, for the week levels
  const regimeBars = walk(1500, 7, true);
  const datasets: Array<[string, Bar[]]> = [['random walk', baseBars], ['walk with regimes', regimeBars]];
  for (const [dataName, data] of datasets) {
    for (const [name, inp] of cases) {
      it(`alert times equal the recomputation: ${dataName}, ${name}`, () => {
        useBars(data);
        try {
          const res = trm.calculate(bars, inp);
          const exp = expected(inp, res);
          expect(res.alerts).toHaveLength(38);
          res.alerts.forEach((a, k) => {
            expect(a.id).toBe(`alert${k}`);
            expect({ k, times: a.times }).toEqual({ k, times: timesOf(exp[k]) });
            expect(a.triggered).toBe(!!exp[k][n - 1]);
          });
        } finally {
          useBars(baseBars);
        }
      });
    }
  }

  it('conditions fire on the synthetic bars', () => {
    const a = trm.calculate(bars, cases[0][1]).alerts;
    const b = trm.calculate(bars, cases[1][1]).alerts;
    // vector candles, colours and the frequent patterns
    for (const k of [0, 1, 2, 3, 4]) expect(a[k].times.length).toBeGreaterThan(5);
    expect(a.slice(5, 13).filter((s) => s.times.length > 0).length).toBeGreaterThanOrEqual(6);
    // ADR / RD crosses with the defaults, every range with the short lengths
    for (const k of [13, 14, 15, 16, 25, 26, 27, 28]) expect(a[k].times.length).toBeGreaterThan(0);
    const c = trm.calculate(bars, cases[2][1]).alerts;
    const r = trm.calculate(regimeBars, cases[2][1]).alerts;
    for (let k = 13; k <= 32; k++) {
      expect({ k, n: b[k].times.length + c[k].times.length + r[k].times.length }).not.toEqual({ k, n: 0 });
    }
    // AMR needs 6 months of bars with the default length
    for (let k = 21; k <= 24; k++) expect(a[k].times).toEqual([]);
    // psy and daily open
    for (let k = 33; k <= 37; k++) expect(a[k].times.length).toBeGreaterThan(0);
  });

  it('psy alerts follow the psy levels being on, the other outputs are unchanged by showAllPsy', () => {
    const off = trm.calculate(bars, { showPsyLevels: false });
    for (let k = 33; k <= 36; k++) expect(off.alerts[k].times).toEqual([]);
    const on = trm.calculate(bars, { showAllPsy: true });
    const def = trm.calculate(bars);
    for (let k = 33; k <= 36; k++) expect(def.alerts[k].times).toEqual(on.alerts[k].times);
  });

  it('colour conditions compare colours, not their text', () => {
    const base = trm.calculate(bars).alerts;
    const res = trm.calculate(bars, { greenVectorColor: 'rgb(0, 230, 118)', redVectorColor: '#ff5252' }).alerts;
    for (let k = 0; k < 13; k++) expect(res[k].times).toEqual(base[k].times);
  });
});

describe('trend-meter', () => {
  const SPEC = [
    [' -   Pos / Neg Pressure', 'Pos / Neg Pressure - Trend Meter'],
    [' --  3 TMs Turn Green', 'All 3 Trend Meters Turn  Green - Trend Meter'],
    [' --  3 TMs Turn Red', 'All 3 Trend Meters Turn  Red - Trend Meter'],
    [' -- 3 TMs Change to Same Color', 'All 3 Trend Meters Change to Same Color - Trend Meter'],
    ['--- 3 TMs Turn Green & WaveTrend X', 'Green - Wave Trend Signal - Aligns with 3 Trend Meters - Trend Meter'],
    ['--- 3 TMs Turn Red & WaveTrend X', 'Red - Wave Trend Signal - Aligns with 3 Trend Meters - Trend Meter'],
    ['--- 3 TMs Change to Same Color & WT X', 'Red / Green - Wave Trend Signal - Aligns with 3 Trend Meters - Trend Meter'],
    ['---- 3 Trend Meters No Longer Align', '3 Trend Meters No Longer Align - Trend Meter'],
    ['All 3 TMs Rapid Change Red to Green', 'All 3 Trend Meters Rapid Change Red to Green - Trend Meter'],
    ['All 3 TMs Rapid Change Green to Red', 'All 3 Trend Meters Rapid Change Green to Red - Trend Meter'],
    ['All 3 TMs Rapid Change to Same Color', 'All 3 Trend Meters Rapid Change to Same Color - Trend Meter'],
    ['TB 1 Turns Green', 'Trend Bar 1 - Turns Green - Trend Meter'],
    ['TB 1 Turns Red', 'Trend Bar 1 - Turns Red - Trend Meter'],
    ['TB 1 Color Change', 'Trend Bar 1 - Color Change - Trend Meter'],
    ['TB 2 Turns Green', 'Trend Bar 2 - Turns Green - Trend Meter'],
    ['TB 2 Turns Red', 'Trend Bar 2 - Turns Red - Trend Meter'],
    ['TB 2 Color Change', 'Trend Bar 2 - Color Change - Trend Meter'],
    ['TBs 1+2 Turn Green', 'Trend Bars 1+2 - Turn Green - Trend Meter'],
    ['TBs 1+2 Turn Red', 'Trend Bars 1+2 - Turn Red - Trend Meter'],
    ['TBs 1+2 Change to Same Color', 'Trend Bars 1+2 - Change to Same Color - MAs Crossing - Trend Meter'],
    ['TBs 1+2 Turn Green with 3 TMs', 'Trend Bars 1+2 - Turn Green with 3 TMs - Trend Meter'],
    ['TBs 1+2 Turn Red with 3 TMs', 'Trend Bars 1+2 - Turn Red with 3 TMs- Trend Meter'],
    ['TBs 1+2 Change to Same Color with 3 TMs', 'Trend Bars 1+2 - Change to Same Color with 3 TMs - Trend Meter'],
    ['TB 1 Turns Green with 3 TMs', 'Trend Bar 1 - Turn Green with 3 TMs - Trend Meter'],
    ['TB 1 Turns Red with 3 TMs', 'Trend Bar 1 - Turn Red with 3 TMs- Trend Meter'],
    ['TB 1 Change to Same Color with 3 TMs', 'Trend Bar 1 - Change to Same Color with 3 TMs - Trend Meter'],
    ['TB 2 Turns Green with 3 TMs', 'Trend Bar 2 - Turn Green with 3 TMs - Trend Meter'],
    ['TB 2 Turns Red with 3 TMs', 'Trend Bar 2 - Turn Red with 3 TMs- Trend Meter'],
    ['TB 2 Change to Same Color with 3 TMs', 'Trend Bar 2 - Change to Same Color with 3 TMs - Trend Meter'],
    ['3 TMs Turn Green with TB 1', 'All 3 Trend Meters Turn  Green with TB 1 - Trend Meter'],
    ['3 TMs Turn Red with TB 1', 'All 3 Trend Meters Turn  Red with TB 1 - Trend Meter'],
    ['3 TMs Change Color with TB 1', 'All 3 Trend Meters Change Color with TB 1 - Trend Meter'],
    ['3 TMs Turn Green with TB 2', 'All 3 Trend Meters Turn  Green with TB 2 - Trend Meter'],
    ['3 TMs Turn Red with TB 2', 'All 3 Trend Meters Turn  Red with TB 2 - Trend Meter'],
    ['3 TMs Change Color with TB 2', 'All 3 Trend Meters Change Color with TB 2 - Trend Meter'],
    ['3 TMs Turn Green with TBs 1+2', 'All 3 Trend Meters Turn  Green with Trend Bar 1+2 - Trend Meter'],
    ['3 TMs Turn Red with TBs 1+2', 'All 3 Trend Meters Turn  Red with Trend Bar 1+2 - Trend Meter'],
    ['3 TMs Change Color with TBs 1+2', 'All 3 Trend Meters Change Color with Trend Bar 1+2 - Trend Meter'],
  ];

  /** Seeded random walk (mulberry32), with slow regime changes so that the meters align for a while */
  const walk = (count: number, seed: number, vol = 1): Bar[] => {
    let st = seed >>> 0;
    const rnd = () => {
      st = (st + 0x6d2b79f5) >>> 0;
      let x = st;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const out: Bar[] = [];
    let price = 100;
    let drift = 0;
    for (let i = 0; i < count; i++) {
      if (i % 40 === 0) drift = (rnd() - 0.5) * 1.2;
      const open = price;
      const close = Math.max(1, open + drift + (rnd() - 0.5) * 2 * vol);
      const high = Math.max(open, close) + rnd() * vol;
      const low = Math.max(0.5, Math.min(open, close) - rnd() * vol);
      out.push({ time: 1_600_000_000 + i * 86400, open, high, low, close, volume: 1000 });
      price = close;
    }
    return out;
  };

  const arr = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));

  /** The original's conditions, written again from its source (only these meter sources are supported here) */
  const reference = (bars: Bar[], m: [string, string, string], ma: Array<['EMA' | 'SMA', number]>): boolean[][] => {
    const n = bars.length;
    const S = (a: number[]) => Series.fromArray(bars, a);
    const closeS = S(bars.map((b) => b.close));
    const ema = (s: Series, l: number) => arr(ta.ema(s, l));
    const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
    const h = (a: number[], i: number, k = 1) => (i - k >= 0 ? a[i - k] : NaN);

    const ap = bars.map((b) => (b.high + b.low + b.close) / 3);
    const esa = ema(S(ap), 9);
    const de = ema(S(ap.map((x, i) => Math.abs(x - esa[i]))), 9);
    const wt1 = ema(S(ap.map((x, i) => (x - esa[i]) / (0.015 * de[i]))), 12);
    const wt2 = arr(ta.sma(S(wt1), 3));
    const yw = sub(wt1, wt2);
    const rsi14 = arr(ta.rsi(closeS, 14));
    const rsi13 = arr(ta.rsi(closeS, 13));
    const rsi5 = arr(ta.rsi(closeS, 5));
    const macdLine = sub(ema(closeS, 12), ema(closeS, 26));
    const macdH = sub(macdLine, ema(S(macdLine), 9));
    const fastLine = sub(ema(closeS, 8), ema(closeS, 21));
    const fastH = sub(fastLine, ema(S(fastLine), 5));
    const mom = sub(ema(closeS, 5), ema(closeS, 20));
    const dad = ema(S(mom), 30);
    const MA = ma.map(([type, len]) => (type === 'SMA' ? arr(ta.sma(closeS, len)) : ema(closeS, len)));
    const [ma1, ma2, ma3, ma4] = MA;

    const res = (src: string, i: number): number => {
      if (src === 'MACD Crossover - 12, 26, 9') return macdH[i] > 0 ? 1 : 0;
      if (src === 'MACD Crossover - Fast - 8, 21, 5') return fastH[i] > 0 ? 1 : 0;
      if (src === 'Mom Dad Cross (Top Dog Trading)') return mom[i] > dad[i] ? 1 : 0;
      if (src === 'RSI 13: > or < 50') return rsi13[i] > 50 ? 1 : 0;
      if (src === 'RSI 5: > or < 50') return rsi5[i] > 50 ? 1 : 0;
      return NaN; // 'N/A' -> na
    };
    const b = (x: number) => !isNaN(x) && x !== 0;
    const P = new Array<boolean>(n), N = new Array<boolean>(n);
    for (let i = 0; i < n; i++) {
      const r = m.map((s) => b(res(s, i)));
      P[i] = r[0] && r[1] && r[2];
      N[i] = !r[0] && !r[1] && !r[2];
    }
    const bh = (a: boolean[], i: number, k: number) => i - k >= 0 && a[i - k];
    const xover = (a: number[], c: number[], i: number) => a[i] > c[i] && h(a, i) <= h(c, i);
    const xunder = (a: number[], c: number[], i: number) => a[i] < c[i] && h(a, i) >= h(c, i);

    const out: boolean[][] = SPEC.map(() => []);
    for (let i = 0; i < n; i++) {
      const ob = (rsi14[i] > 70 || h(rsi14, i) > 70) && wt1[i] > 60 && !(yw[i] > h(yw, i));
      const os = (rsi14[i] < 30 || h(rsi14, i) < 30) && wt1[i] < -60 && yw[i] > h(yw, i);
      const bgP = P[i] && !bh(P, i, 1);
      const bgN = N[i] && !bh(N, i, 1);
      const wtCross = xover(wt1, wt2, i) || xunder(wt1, wt2, i);
      const pwt = wtCross && wt2[i] - wt1[i] <= 0;
      const nwt = wtCross && wt2[i] - wt1[i] >= 0;
      const noLonger = ((!P[i] || !N[i]) && bh(P, i, 1)) || ((!P[i] || !N[i]) && bh(N, i, 1));
      const rp = P[i] && (bh(N, i, 1) || bh(N, i, 2));
      const rn = N[i] && (bh(P, i, 1) || bh(P, i, 2));
      const u1 = xover(ma1, ma2, i), d1 = xunder(ma1, ma2, i);
      const u2 = xover(ma3, ma4, i), d2 = xunder(ma3, ma4, i);
      const g1 = ma1[i] > ma2[i], r1 = ma1[i] < ma2[i], g2 = ma3[i] > ma4[i], r2 = ma3[i] < ma4[i];
      const g12 = g1 && g2 && (u1 || u2), r12 = r1 && r2 && (d1 || d2);
      const vals = [
        ob || os, bgP, bgN, bgP || bgN,
        pwt && P[i], nwt && N[i], (pwt && P[i]) || (nwt && N[i]),
        noLonger, rp, rn, rp || rn,
        u1, d1, u1 || d1, u2, d2, u2 || d2,
        g12, r12, g12 || r12,
        g12 && P[i], r12 && N[i], (g12 && P[i]) || (r12 && N[i]),
        g1 && P[i], r1 && N[i], (g1 && P[i]) || (r1 && N[i]),
        g2 && P[i], r2 && N[i], (g2 && P[i]) || (r2 && N[i]),
        bgP && g1, bgN && r1, (bgP && g1) || (bgN && r1),
        bgP && g2, bgN && r2, (bgP && g2) || (bgN && r2),
        bgP && g1 && g2, bgN && r1 && r2, (bgP && g1 && g2) || (bgN && r1 && r2),
      ];
      vals.forEach((v, k) => out[k].push(v));
    }
    return out;
  };

  const timesOf = (bars: Bar[], f: boolean[]) => bars.filter((_b, i) => f[i]).map((b) => b.time as number);

  it('declares the original alert conditions', () => {
    expect(tmeter.alertConditions).toEqual(SPEC.map(([title, message], k) => ({ id: `alert${k}`, title, message })));
    expect(tmeter.TrendMeter.alertConditions).toBe(tmeter.alertConditions);
  });

  const defaultsMeters: [string, string, string] = ['MACD Crossover - Fast - 8, 21, 5', 'RSI 13: > or < 50', 'RSI 5: > or < 50'];
  const defaultsMa: Array<['EMA' | 'SMA', number]> = [['EMA', 5], ['EMA', 11], ['EMA', 13], ['SMA', 36]];

  it.each([
    [1200, 7, 1],
    [900, 4242, 2.5],
  ])('alerts with the default inputs equal the recomputation (%i bars, seed %i)', (count, seed, vol) => {
    const bars = walk(count, seed, vol);
    const r = tmeter.calculate(bars);
    const ref = reference(bars, defaultsMeters, defaultsMa);
    expect(r.alerts.length).toBe(38);
    r.alerts.forEach((a, k) => {
      expect(a.times, a.title).toEqual(timesOf(bars, ref[k]));
      expect(a.triggered).toBe(!!ref[k][bars.length - 1]);
    });
    // most conditions fire on these bars
    const fired = r.alerts.filter((a) => a.times.length > 0).length;
    expect(fired).toBeGreaterThanOrEqual(34);
  });

  it('alerts follow the chosen meters and averages (MACD 12/26/9, Mom Dad, N/A; SMA trend bars)', () => {
    const bars = walk(1000, 99, 1.5);
    const inputs = {
      trendBar1: 'MACD Crossover - 12, 26, 9', trendBar2: 'Mom Dad Cross (Top Dog Trading)', trendBar3: 'RSI 5: > or < 50',
      ma1Type: 'SMA', ma1Length: 4, ma2Type: 'SMA', ma2Length: 9, ma3Type: 'EMA', ma3Length: 10, ma4Type: 'EMA', ma4Length: 30,
    } as const;
    const r = tmeter.calculate(bars, inputs);
    const ref = reference(bars, [inputs.trendBar1, inputs.trendBar2, inputs.trendBar3],
      [['SMA', 4], ['SMA', 9], ['EMA', 10], ['EMA', 30]]);
    r.alerts.forEach((a, k) => expect(a.times, a.title).toEqual(timesOf(bars, ref[k])));

    // a meter on N/A is na: never green, so the three meters never turn green together
    const na = tmeter.calculate(bars, { trendBar3: 'N/A' });
    const refNa = reference(bars, [defaultsMeters[0], defaultsMeters[1], 'N/A'], defaultsMa);
    na.alerts.forEach((a, k) => expect(a.times, a.title).toEqual(timesOf(bars, refNa[k])));
    expect(na.alerts[1].times).toEqual([]);
  });

  it('pressure alert fires on a crafted plunge and rally, regardless of the plot toggle', () => {
    const base = walk(300, 5, 0.3);
    const bars: Bar[] = [];
    let p = 100;
    for (let i = 0; i < 300; i++) {
      // flat, then a steep fall, a bounce, a steep rise and a pullback
      const step = i < 100 ? 0 : i < 130 ? -1.5 : i < 140 ? 1 : i < 200 ? 0 : i < 230 ? 1.5 : i < 240 ? -1 : 0;
      const o = p;
      const c = o + step + (base[i].close - base[i].open) * 0.2;
      bars.push({ time: base[i].time, open: o, high: Math.max(o, c) + 0.2, low: Math.min(o, c) - 0.2, close: c, volume: 1 });
      p = c;
    }
    const r = tmeter.calculate(bars, { posNegPressure: false });
    const ref = reference(bars, defaultsMeters, defaultsMa);
    expect(r.alerts[0].times).toEqual(timesOf(bars, ref[0]));
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    // the plots themselves are hidden by the toggle
    expect(r.plots.plot0.every((pt) => isNaN((pt as { value: number }).value))).toBe(true);
  });
});
