/**
 * Community ports, batch 40: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers / bar colours / background colours.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as targets from '../../src/community/targets-for-overlay-indicators';
import * as ratings from '../../src/community/technical-ratings';
import * as tvs from '../../src/community/terminal-velocity-stop-lyro-rs';
import * as tfo from '../../src/community/tfo-adx-with-histogram-signal';
import * as jewel from '../../src/community/the-jewel';
import * as strat from '../../src/community/the-strat';
import * as theil from '../../src/community/theil-sen-line-filter';
import * as threeBar from '../../src/community/three-bar-reversal-continuation';
import * as t3 from '../../src/community/tillson-t3';
import * as timeAlerts from '../../src/community/time-based-alerts-for-trading-windows';
import * as tma from '../../src/community/tma-overlay';
import * as trMeter from '../../src/community/tr-high-low-meter';
import * as fluid from '../../src/community/trade-prime-fluid-trend-indicator';
import * as xo from '../../src/community/trader-xo';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'targets-for-overlay-indicators': [
    ['alert0', 'Target 1 New', 'Target 1 New'],
    ['alert1', 'Target 1 Reached', 'Target 1 Reached'],
    ['alert2', 'Target 2 New', 'Target 2 New'],
    ['alert3', 'Target 2 Reached', 'Target 2 Reached'],
  ],
  'terminal-velocity-stop-lyro-rs': [
    ['alert0', 'Bullish Flip', 'TVS | Lyro RS: Bullish stop flip on {{ticker}} ({{interval}})'],
    ['alert1', 'Bearish Flip', 'TVS | Lyro RS: Bearish stop flip on {{ticker}} ({{interval}})'],
  ],
  'tfo-adx-with-histogram-signal': [
    ['alert0', 'Bullish Hist Cross', 'TFO Hist Bullish Cross!'],
    ['alert1', 'Bearish Hist Cross', 'TFO Hist Bearish Cross!'],
    ['alert2', 'Extreme High Alert', 'TFO Extreme High - Potential Reversal!'],
    ['alert3', 'Extreme Low Alert', 'TFO Extreme Low - Potential Reversal!'],
  ],
  'the-jewel': [
    ['alert0', 'Buy Signal', 'Buy: Stoch cross up + RSI > level + (Optional ADX/EMA confirm)'],
    ['alert1', 'Sell Signal', 'Sell: Stoch cross down + RSI < level + (Optional ADX/EMA confirm)'],
    ['alert2', 'Caution Signal', 'Caution: RSI & Stoch both at extreme levels'],
  ],
  'theil-sen-line-filter': [
    ['alert0', 'Theil-Sen Up Slope', 'Theil-Sen slope turned up {{exchange}}:{{ticker}}'],
    ['alert1', 'Theil-Sen Down Slope', 'Theil-Sen slope turned down {{exchange}}:{{ticker}}'],
  ],
  'tillson-t3': [
    ['alert0', 'T3 BUY', 'T3 BUY!'],
    ['alert1', 'T3 SELL', 'T3 SELL!'],
    ['alert2', 'Color ALARM', 'T3 has changed color!'],
  ],
  'time-based-alerts-for-trading-windows': [
    ['alert0', 'Odd Time-based Alert (Green)', 'Odd time-based alert triggered! (Green)'],
    ['alert1', 'Even Time-based Alert (Red)', 'Even time-based alert triggered! (Red)'],
    ...Array.from({ length: 12 }, (_, k): [string, string, string] => [`alert${k + 2}`, `Alert ${k + 1}`, `Alert ${k + 1} triggered!`]),
  ],
  'tma-overlay': [
    ['alert0', 'Bullish Engulfing', '[CurrencyPair] [TimeFrame], Bullish candle engulfing previous candle'],
    ['alert1', 'Bearish Engulfing', '[CurrencyPair] [TimeFrame], Bearish candle engulfing previous candle'],
  ],
  'tr-high-low-meter': [
    ['alert0', 'Buy Signal', 'Buy Signal'],
    ['alert1', 'Sell Signal', 'Sell Signal'],
    ['alert2', 'Neutral Signal', 'Neutral Signal'],
  ],
  'trade-prime-fluid-trend-indicator': [
    ['alert0', 'TP Fluid Buy', 'Fluid Buy, {{exchange}}:{{ticker}}'],
    ['alert1', 'TP Fluid Sell', 'Fluid Sell, {{exchange}}:{{ticker}}'],
  ],
  'trader-xo': [
    ['alert0', 'Bullish EMA Cross', 'Bullish EMA crossover'],
    ['alert1', 'Bearish EMA Cross', 'Bearish EMA Crossover'],
    ['alert2', 'Stoch RSI Crossover', 'STOCH RSI CROSSOVER'],
  ],
};

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of bars with a random volume */
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
const n = bars.length;
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
const S = (a: number[], list: Bar[] = bars) => Series.fromArray(list, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
type M = { time: unknown; id?: string; text?: string; position?: string; shape?: string; textColor?: string };
const idTimes = (ms: M[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);
/** ta.crossover / ta.crossunder (exact comparisons, na false) */
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

describe('declarations', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'targets-for-overlay-indicators': targets,
    'terminal-velocity-stop-lyro-rs': tvs,
    'tfo-adx-with-histogram-signal': tfo,
    'the-jewel': jewel,
    'theil-sen-line-filter': theil,
    'tillson-t3': t3,
    'time-based-alerts-for-trading-windows': timeAlerts,
    'tma-overlay': tma,
    'tr-high-low-meter': trMeter,
    'trade-prime-fluid-trend-indicator': fluid,
    'trader-xo': xo,
  };
  for (const [id, m] of Object.entries(mods)) {
    it(`${id}: the original's alertconditions`, () => expect(decls(m)).toEqual(SPEC[id]));
  }
  it('the indicator objects carry the new exports', () => {
    expect(targets.TargetsForOverlayIndicators.alertConditions).toBe(targets.alertConditions);
    expect(tvs.TerminalVelocityStopLyroRs.alertConditions).toBe(tvs.alertConditions);
    expect(tfo.TfoAdxWithHistogramSignal.alertConditions).toBe(tfo.alertConditions);
    expect(jewel.TheJewel.alertConditions).toBe(jewel.alertConditions);
    expect(theil.TheilSenLineFilter.alertConditions).toBe(theil.alertConditions);
    expect(t3.TillsonT3.alertConditions).toBe(t3.alertConditions);
    expect(timeAlerts.TimeBasedAlertsForTradingWindows.alertConditions).toBe(timeAlerts.alertConditions);
    expect(tma.TmaOverlay.alertConditions).toBe(tma.alertConditions);
    expect(trMeter.TrHighLowMeter.alertConditions).toBe(trMeter.alertConditions);
    expect(fluid.TradePrimeFluidTrendIndicator.alertConditions).toBe(fluid.alertConditions);
    expect(xo.TraderXO.alertConditions).toBe(xo.alertConditions);
    expect(ratings.hasAlertFunction).toBe(true);
    expect(ratings.TechnicalRatings.hasAlertFunction).toBe(true);
  });
});

describe('Targets For Overlay Indicators', () => {
  it('new / reached targets of both setups', () => {
    const dist = 2;
    const r = targets.calculate(bars, { source: 'open', distOptions1: 'Currencies', distOptions2: 'Currencies', distTarget1: dist, distTarget2: dist });
    const open = bars.map((b) => b.open);
    const cond = [xover(close, open), xunder(close, open)];
    const flags = [0, 1, 2, 3].map(() => new Array<boolean>(n).fill(false));
    const obj = [{ value: NaN, active: false }, { value: NaN, active: false }];
    for (let i = 0; i < n; i++) {
      for (const k of [0, 1]) {
        const isLong = k === 0;
        const o = obj[k];
        if (o.active && (isLong ? gt(bars[i].high, o.value) : lt(bars[i].low, o.value))) {
          o.active = false;
          flags[2 * k + 1][i] = true;
        }
        if (cond[k][i]) {
          obj[k] = { value: close[i] + (isLong ? dist : -dist), active: true };
          flags[2 * k][i] = true;
        }
      }
    }
    for (let k = 0; k < 4; k++) {
      expect(flags[k].some(Boolean)).toBe(true);
      expect(times(r, k)).toEqual(timeAt(bars, flags[k]));
    }
  });
  it('no target with the close as source', () => {
    const r = targets.calculate(bars);
    expect(r.alerts.every((a) => a.times.length === 0)).toBe(true);
  });
});

describe('Technical Ratings', () => {
  /** The original's triggers from the plotted rating: ((xUp or gUp) and alternation and dir)[idx] */
  const expected = (rating: number[], idx: number, alt: boolean, up: number, dn: number) => {
    const xUp = xover(rating, up);
    const xDn = xunder(rating, dn);
    const calls: { i: number; long: boolean }[] = [];
    let last: boolean | null = null;
    let pl = false;
    let ps = false;
    for (let i = 0; i < rating.length; i++) {
      const rl = xUp[i] && (!alt || last === null || !last);
      const rs = xDn[i] && (!alt || last === null || last);
      const tl = idx === 1 ? pl : rl;
      const ts = idx === 1 ? ps : rs;
      pl = rl;
      ps = rs;
      if (tl) { calls.push({ i, long: true }); last = true; } else if (ts) { calls.push({ i, long: false }); last = false; }
    }
    return calls.map((c) => ({ time: bars[c.i].time, message: c.long ? 'Up!' : 'Down!', freq: 'once_per_bar' }));
  };
  const base = { dirInput: 'Longs and Shorts' as const, levelUpInput: 0.3, levelDnInput: -0.3, alertUpInput: 'Up!', alertDnInput: 'Down!' };
  it('repainting On: the trigger of the bar before, alternating', () => {
    const r = ratings.calculate(bars, base);
    const exp = expected(vals(r.plots.plot0), 1, true, 0.3, -0.3);
    expect(exp.length).toBeGreaterThan(4);
    expect(r.alertCalls).toEqual(exp);
  });
  it('repainting Off, no alternation: the trigger of the bar', () => {
    const r = ratings.calculate(bars, { ...base, repaintInput: 'Off', altInput: 'Off' });
    const exp = expected(vals(r.plots.plot0), 0, false, 0.3, -0.3);
    expect(exp.length).toBeGreaterThan(4);
    expect(r.alertCalls).toEqual(exp);
  });
  it('no calls without a direction', () => {
    expect(ratings.calculate(bars).alertCalls).toEqual([]);
  });
});

describe('Terminal Velocity Stop', () => {
  it('bullish / bearish flips', () => {
    const r = tvs.calculate(bars);
    const atr = A(ta.atr(bars, 14));
    const dir: number[] = [];
    let stop = NaN;
    let d = 1;
    for (let i = 0; i < n; i++) {
      const c = close[i];
      const target = d === 1 ? c - 3 * atr[i] : c + 3 * atr[i];
      if (isNaN(stop)) stop = target;
      else {
        const step = Math.max(Math.min(target - stop, 0.3 * atr[i]), -0.3 * atr[i]);
        if (d === 1) {
          stop = Math.max(stop, stop + step);
          if (lt(c, stop)) { d = -1; stop = c + 3 * atr[i]; }
        } else {
          stop = Math.min(stop, stop + step);
          if (gt(c, stop)) { d = 1; stop = c - 3 * atr[i]; }
        }
      }
      dir.push(d);
    }
    const up = dir.map((v, i) => i > 0 && v === 1 && dir[i - 1] === -1);
    const down = dir.map((v, i) => i > 0 && v === -1 && dir[i - 1] === 1);
    expect(up.some(Boolean) && down.some(Boolean)).toBe(true);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, down));
  });
});

describe('TFO + ADX', () => {
  it('histogram crosses; the extreme conditions are never true', () => {
    const r = tfo.calculate(bars);
    const hist = vals(r.plots.plot0);
    const up = xover(hist, 0);
    const dn = xunder(hist, 0);
    expect(up.some(Boolean) && dn.some(Boolean)).toBe(true);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
    const tfoV = vals(r.plots.plot2);
    expect(xunder(tfoV, 1).some(Boolean)).toBe(true);
    expect(times(r, 2)).toEqual([]);
    expect(times(r, 3)).toEqual([]);
  });
});

describe('The Jewel', () => {
  it('buy / sell / caution signals', () => {
    const r = jewel.calculate(bars);
    const k = vals(r.plots.plot1);
    const d = vals(r.plots.plot2);
    const adx = vals(r.plots.plot5);
    const rsi = A(ta.rsi(S(close), 14));
    const ema = A(ta.ema(S(close), 200));
    const up = xover(k, d);
    const dn = xunder(k, d);
    const buy = bars.map((b, i) => up[i] && gt(rsi[i], 55) && gt(adx[i], 20) && gt(b.close, ema[i]));
    const sell = bars.map((b, i) => dn[i] && lt(rsi[i], 45) && gt(adx[i], 20) && lt(b.close, ema[i]));
    const caution = bars.map((_b, i) => (gt(rsi[i], 70) && gt(k[i], 80)) || (lt(rsi[i], 30) && lt(k[i], 20)));
    expect(buy.some(Boolean) && sell.some(Boolean) && caution.some(Boolean)).toBe(true);
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    expect(times(r, 2)).toEqual(timeAt(bars, caution));
  });
});

describe('Theil-Sen Line Filter', () => {
  it('slope turns', () => {
    const r = theil.calculate(bars);
    const tsf = vals(r.plots.plot0);
    const chg = tsf.map((v, i) => (i > 0 ? v - tsf[i - 1] : NaN));
    const up = xover(chg, 0);
    const dn = xunder(chg, 0);
    expect(up.some(Boolean) && dn.some(Boolean)).toBe(true);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
  });
});

describe('Tillson T3', () => {
  it('buy / sell / colour change', () => {
    const r = t3.calculate(bars);
    const a = 0.7;
    const e1 = ta.ema(new Series(bars, (b) => (b.high + b.low + 2 * b.close) / 4), 8);
    const e2 = ta.ema(e1, 8), e3 = ta.ema(e2, 8), e4 = ta.ema(e3, 8), e5 = ta.ema(e4, 8), e6 = ta.ema(e5, 8);
    const [v3, v4, v5, v6] = [e3, e4, e5, e6].map(A);
    const c1 = -a * a * a, c2 = 3 * a * a + 3 * a * a * a, c3 = -6 * a * a - 3 * a - 3 * a * a * a, c4 = 1 + 3 * a + a * a * a + 3 * a * a;
    const T3 = v6.map((_v, i) => c1 * v6[i] + c2 * v5[i] + c3 * v4[i] + c4 * v3[i]);
    const prev = T3.map((_v, i) => (i > 0 ? T3[i - 1] : NaN));
    const buy = xover(T3, prev);
    const sell = xunder(T3, prev);
    expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    expect(times(r, 2)).toEqual(timeAt(bars, buy.map((b, i) => b || sell[i])));
  });
});

describe('Time-based Alerts', () => {
  // 5-minute bars over 4 days (seconds)
  const intraday = walk(1152, 5, 300, 1704067200);
  const hm = (tz: string, t: number) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(new Date(t * 1000));
    return [Number(parts.find((p) => p.type === 'hour')!.value), Number(parts.find((p) => p.type === 'minute')!.value)];
  };
  const H = [15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2];
  const MIN = [30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0];
  it('each alert time, odd and even groups; disabled alerts', () => {
    const r = timeAlerts.calculate(intraday, { enableAlert4: false });
    const per = H.map((h, k) => intraday.map((b) => {
      const [hh, mm] = hm('America/New_York', b.time as number);
      return k !== 3 && hh === h && mm === MIN[k];
    }));
    const odd = intraday.map((_b, i) => per.some((f, k) => k % 2 === 0 && f[i]));
    const even = intraday.map((_b, i) => per.some((f, k) => k % 2 === 1 && f[i]));
    expect(times(r, 0)).toEqual(timeAt(intraday, odd));
    expect(times(r, 1)).toEqual(timeAt(intraday, even));
    for (let k = 0; k < 12; k++) {
      if (k !== 3) expect(times(r, k + 2).length).toBeGreaterThan(2);
      expect(times(r, k + 2)).toEqual(timeAt(intraday, per[k]));
    }
    expect(times(r, 5)).toEqual([]);
  });
});

describe('TMA Overlay', () => {
  it('engulfing conditions, also with the triangles off', () => {
    const r = tma.calculate(bars, { showBullEngulfing: false, showBearEngulfing: false });
    const bull = bars.map((b, i) => i > 0 && le(b.open, close[i - 1]) && lt(b.open, bars[i - 1].open) && gt(b.close, bars[i - 1].open));
    const bear = bars.map((b, i) => i > 0 && ge(b.open, close[i - 1]) && gt(b.open, bars[i - 1].open) && lt(b.close, bars[i - 1].open));
    expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
    expect(times(r, 0)).toEqual(timeAt(bars, bull));
    expect(times(r, 1)).toEqual(timeAt(bars, bear));
  });
  it('session background ids', () => {
    const intraday = walk(600, 3, 900, 1704700800);
    const r = tma.calculate(intraday);
    const ids = new Set(r.bgColors.map((c) => c.id));
    expect(ids).toEqual(new Set(['bgcolor0', 'bgcolor1']));
    // the session from 8:30 is inside the analysis window from 7:00: every bgcolor1 bar is also a bgcolor0 bar
    const b0 = new Set(idTimes(r.bgColors as M[], 'bgcolor0'));
    const b1 = idTimes(r.bgColors as M[], 'bgcolor1');
    expect(b1.length).toBeGreaterThan(0);
    expect(b1.every((t) => b0.has(t))).toBe(true);
    expect(b0.size).toBeGreaterThan(b1.length);
  });
});

describe('TR High/Low meter', () => {
  const expected = (x: number[], useT: boolean, L: number, Sv: number) => {
    const x1 = (i: number) => (i > 0 ? x[i - 1] : NaN);
    const long = x.map((v, i) => (ge(v, 0) && gt(v, L) && lt(x1(i), L) && useT) || (ge(v, 0) && lt(x1(i), 0) && !useT));
    const short = x.map((v, i) => (le(v, 0) && lt(v, Sv) && gt(x1(i), Sv) && useT) || (le(v, 0) && gt(x1(i), 0) && !useT));
    const neutral = x.map((v, i) => (lt(v, L) && gt(x1(i), L)) || (gt(v, Sv) && lt(x1(i), Sv) && useT));
    return [long, short, neutral];
  };
  for (const useThreshold of [false, true]) {
    it(`buy / sell / neutral, no-trade zone ${useThreshold ? 'on' : 'off'}`, () => {
      const r = trMeter.calculate(bars, { useThreshold, longThreshold: 3, shortThreshold: -3 });
      const exp = expected(vals(r.plots.plot0), useThreshold, 3, -3);
      for (let k = 0; k < 3; k++) {
        expect(exp[k].some(Boolean)).toBe(true);
        expect(times(r, k)).toEqual(timeAt(bars, exp[k]));
      }
    });
  }
});

describe('Trade Prime - Fluid Trend', () => {
  it('buy / sell flips with a known ATR, also with the triangles off', () => {
    const r = fluid.calculate(bars, { opMode: 'Signal Mode', showArrows: false });
    const ref = fluid.calculate(bars, { opMode: 'Signal Mode' });
    // the centre line takes the bull colour (plot0 default) in an uptrend
    const bullColor = fluid.plotConfig[0].color;
    const isBull = r.plots.plot0.map((p) => (p as { color?: string }).color === bullColor);
    const atr = A(ta.atr(bars, 100));
    const buy = isBull.map((b, i) => i > 0 && b && !isBull[i - 1] && !isNaN(atr[i]));
    const sell = isBull.map((b, i) => i > 0 && !b && isBull[i - 1] && !isNaN(atr[i]));
    expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    // the triangles stand on the same bars once the smoothed channel is known
    const tri = (shape: string) => ref.markers.filter((m) => m.shape === shape).map((m) => m.time as number);
    expect(tri('triangleUp')).toEqual(times(r, 0).filter((t) => tri('triangleUp').includes(t)));
    expect(tri('triangleUp').length).toBe(times(r, 0).length);
    expect(tri('triangleDown').length).toBe(times(r, 1).length);
  });
});

describe('Trader XO', () => {
  const on = { crossoverBgMid: true, crossoverBgOBOS: true, crossoverBgGreater: true, crossoverBgLess: true };
  const fast = A(ta.ema(S(close), 12));
  const slow = A(ta.ema(S(close), 25));
  const rsi = ta.rsi(S(close), 14);
  const rArr = A(rsi);
  const hi = A(ta.highest(rsi, 14));
  const lo = A(ta.lowest(rsi, 14));
  const stoch = rArr.map((v, i) => (hi[i] === lo[i] ? NaN : ((v - lo[i]) / (hi[i] - lo[i])) * 100));
  const k = A(ta.sma(S(stoch), 3));
  const d = A(ta.sma(S(k), 3));
  const ma = A(ta.ema(S(close), 200));
  const kUp = xover(k, d);
  const kDn = xunder(k, d);
  const crossup = bars.map((b, i) => b.open > ma[i] && kUp[i] && (k[i] < 50 || d[i] < 50));
  const crossdown = bars.map((b, i) => b.open < ma[i] && kDn[i] && (k[i] > 50 || d[i] > 50));
  it('EMA crosses and Stoch RSI crossovers', () => {
    const r = xo.calculate(bars);
    const up = xover(fast, slow);
    const dn = xunder(fast, slow);
    const st = crossup.map((c, i) => c || crossdown[i]);
    expect(up.some(Boolean) && dn.some(Boolean) && st.some(Boolean)).toBe(true);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
    expect(times(r, 2)).toEqual(timeAt(bars, st));
  });
  it('bar colour ids per barcolor() call', () => {
    const r = xo.calculate(bars);
    const ids = new Set(r.barColors.map((c) => c.id));
    expect(ids).toEqual(new Set(['barcolor0', 'barcolor1', 'barcolor2', 'barcolor3']));
    // barcolor0 / barcolor1 are the Bull / Bear triangles
    const tri = (text: string) => r.markers.filter((m) => m.text === text).map((m) => m.time as number);
    expect(idTimes(r.barColors as M[], 'barcolor0')).toEqual(tri('Bull'));
    expect(idTimes(r.barColors as M[], 'barcolor1')).toEqual(tri('Bear'));
  });
  it('background ids per bgcolor() call, the mid-level red on the K rows without their switches', () => {
    const all = xo.calculate(bars, on);
    expect(new Set(all.bgColors.map((c) => c.id))).toEqual(new Set(['bgcolor0', 'bgcolor1', 'bgcolor2', 'bgcolor3']));
    const mid = xo.calculate(bars, { crossoverBgMid: true });
    const down = timeAt(bars, crossdown);
    expect(idTimes(mid.bgColors as M[], 'bgcolor0')).toEqual(timeAt(bars, crossup.map((c, i) => c || crossdown[i])));
    expect(idTimes(mid.bgColors as M[], 'bgcolor2')).toEqual(down);
    expect(idTimes(mid.bgColors as M[], 'bgcolor3')).toEqual(down);
    expect(idTimes(mid.bgColors as M[], 'bgcolor1')).toEqual([]);
  });
});

describe('Style ids', () => {
  it('The Strat: char0 to char3 on the Strat numbers', () => {
    const r = strat.calculate(bars);
    expect(r.markers.every((m) => ['char0', 'char1', 'char2', 'char3'].includes(m.id ?? ''))).toBe(true);
    const h1 = (i: number) => (i > 0 ? bars[i - 1].high : NaN);
    const l1 = (i: number) => (i > 0 ? bars[i - 1].low : NaN);
    const inside = bars.map((b, i) => le(b.high, h1(i)) && ge(b.low, l1(i)));
    const twoUp = bars.map((b, i) => gt(b.high, h1(i)) && ge(b.low, l1(i)));
    const twoDown = bars.map((b, i) => lt(b.low, l1(i)) && le(b.high, h1(i)));
    const three = bars.map((b, i) => gt(b.high, h1(i)) && lt(b.low, l1(i)));
    expect(idTimes(r.markers, 'char0')).toEqual(timeAt(bars, inside));
    expect(idTimes(r.markers, 'char1')).toEqual(timeAt(bars, twoUp));
    expect(idTimes(r.markers, 'char2')).toEqual(timeAt(bars, twoDown));
    expect(idTimes(r.markers, 'char3')).toEqual(timeAt(bars, three));
    expect(r.markers.filter((m) => m.id === 'char2').every((m) => m.text === '2')).toBe(true);
  });
  it('Three-Bar Reversal/Continuation: char0 to char4', () => {
    const r = threeBar.calculate(bars, { detectLevel: 1 });
    const ids = ['char0', 'char1', 'char2', 'char3', 'char4'];
    expect(r.markers.every((m) => ids.includes(m.id ?? ''))).toBe(true);
    for (const id of ids) expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
    const textOf = (id: string) => new Set(r.markers.filter((m) => m.id === id).map((m) => `${m.text}|${m.position}`));
    expect(textOf('char0')).toEqual(new Set(['.|bottom']));
    expect(textOf('char3')).toEqual(new Set(['⇧|belowBar']));
    expect(textOf('char4')).toEqual(new Set(['⇩|aboveBar']));
    // the alert() calls are on the signal bars
    const sig = [...idTimes(r.markers, 'char3'), ...idTimes(r.markers, 'char4')].sort((a, b) => a - b);
    expect([...new Set(r.alertCalls.map((c) => c.time))]).toEqual([...new Set(sig)]);
  });
});
