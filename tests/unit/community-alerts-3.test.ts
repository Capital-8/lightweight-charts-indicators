/**
 * Alerts of 8 community ports: the alertcondition() declarations (ids, titles and messages of the originals), the
 * bars on which each condition is true (re-computed here from the original's expression, or matched against the
 * port's own outputs of the same expression) and the alert() calls (bars, messages, frequency).
 */
import { describe, expect, it } from 'vitest';
import { ta, str, Series, type Bar } from 'oakscriptjs';
import * as avwap from '../../src/community/auto-avwap-with-breakout-screener';
import * as pitchfork from '../../src/community/auto-pitchfork-fib-retracement-zig-zag';
import * as dff from '../../src/community/dynamic-fractal-flow';
import * as insideBar from '../../src/community/inside-bar-coloring-w-alerts';
import * as linreg from '../../src/community/linear-regression-channel-curve-slope-by-dgt';
import * as pulse from '../../src/community/pulse-range';
import * as scalp from '../../src/community/scalping-swing-trading-tool-r1-4-by-justunclel';
import * as trendScalper from '../../src/community/trend-scalper';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of daily bars with slow swings and a random volume (spikes now and then) */
function walk(count: number, seed0: number, base = 100, swing = 1.2): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = base;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * swing + (rnd() - 0.5) * 4);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1500, 7);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const values = (pts: { value: number }[]) => pts.map((p) => p.value);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const crossOver = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pv = i > 0 ? a[i - 1] : NaN;
  const pw = i > 0 ? (typeof b === 'number' ? b : b[i - 1]) : NaN;
  return v > w && pv <= pw;
});
const chart = { tickerid: 'NASDAQ:AAPL', timeframe: '1D', lastBarConfirmed: true };

describe('Auto AVWAP with Breakout Screener', () => {
  it('declares the 3 alertconditions of the original', () => {
    expect(decls(avwap)).toEqual([
      ['alert0', 'Breakout (▲▼)', 'Breakout ({{ticker}} {{interval}})'],
      ['alert1', 'Resistance Broken ▲', 'Resistance Broken ▲ ({{ticker}} {{interval}})'],
      ['alert2', 'Support Broken ▼', 'Support Broken ▼ ({{ticker}} {{interval}})'],
    ]);
    expect(avwap.AutoAvwapWithBreakoutScreener.alertConditions).toBe(avwap.alertConditions);
  });

  for (const useOpen of [true, false]) {
    it(`resistance / support broken by the ${useOpen ? 'open' : 'close'} against the high / low AVWAP`, () => {
      const r = avwap.calculate(bars, { useOpen });
      const hi = values(r.plots.plot2);
      const lo = values(r.plots.plot3);
      const v = bars.map((b) => (useOpen ? b.open : b.close));
      const res = v.map((x, i) => gt(x - hi[i], 0));
      const sup = v.map((x, i) => lt(x - lo[i], 0));
      expect(r.alerts[1].times).toEqual(timeAt(bars, res));
      expect(r.alerts[2].times).toEqual(timeAt(bars, sup));
      expect(r.alerts[0].times).toEqual(timeAt(bars, res.map((x, i) => x || sup[i])));
      expect(r.alerts[1].times.length).toBeGreaterThan(10);
      expect(r.alerts[2].times.length).toBeGreaterThan(10);
    });
  }
});

describe('Auto Pitchfork, Fib Retracement and Zig Zag', () => {
  const pf = walk(700, 3, 200, 0.9);
  const calc = (list: Bar[], inputs = {}) => pitchfork.calculate(list, inputs, chart);
  const full = calc(pf);
  const crossing = (list: Bar[], i: number, level: number) => {
    const c = list[i].close;
    const c1 = i > 0 ? list[i - 1].close : NaN;
    return (gt(level, c) && lt(level, c1)) || (lt(level, c) && gt(level, c1));
  };
  /** The alert() messages of the last bar of `list`, from the levels drawn on that bar (labels) */
  const expectedLast = (list: Bar[], r: ReturnType<typeof calc>) => {
    const i = list.length - 1;
    const out: string[] = [];
    for (const l of r.labels) {
      if (!crossing(list, i, l.price)) continue;
      let m: RegExpMatchArray | null;
      if (/^PF1 M /.test(l.text)) out.push('AutoPitchfork: AAPL crossing median level');
      else if ((m = l.text.match(/^PF1 ([\d.]+) ([RS]) /))) out.push(`AutoPitchfork: AAPL crossing ${m[2] === 'R' ? 'resistance' : 'support'} level${m[1]}`);
      else if ((m = l.text.match(/^EXT ([-\d.]+)\n/))) out.push(`AutoFib Extention : AAPL crossing level ${m[1]}`);
      else if ((m = l.text.match(/^([RS]\d) \((.*)\)$/))) out.push(`Camarilla (PVTvX) : AAPL crossing Camarilla level ${m[1]} level, price ${m[2]}`);
    }
    return out.sort();
  };
  const level0 = (msg: string) => / level0$/.test(msg);

  it('calls alert() on every bar where the close crosses a level of that bar, in the formats of the original', () => {
    expect(pitchfork.hasAlertFunction).toBe(true);
    expect(pitchfork.AutoPitchforkFibRetracementZigZag.hasAlertFunction).toBe(true);
    let checked = 0;
    let pivots = 0;
    for (let k = 200; k <= pf.length; k++) {
      const list = pf.slice(0, k);
      const r = k === pf.length ? full : calc(list);
      const t = list[k - 1].time;
      const own = r.alertCalls.filter((c) => c.time === t).map((c) => c.message);
      // the levels drawn on the last bar give the calls of that bar (level 0 has no label: it is on the median)
      expect(own.filter((m) => !level0(m)).sort(), `bar ${k - 1}`).toEqual(expectedLast(list, r));
      // a calculation on more bars gives the same calls on that bar (Camarilla calls are made on the last bar only)
      const later = full.alertCalls.filter((c) => c.time === t && !c.message.includes('(PVTvX)')).map((c) => c.message);
      expect(later, `bar ${k - 1}`).toEqual(own.filter((m) => !m.includes('(PVTvX)')));
      checked += own.length;
      pivots += own.filter((m) => m.includes('(PVTvX)')).length;
    }
    expect(checked).toBeGreaterThan(20);
    expect(pivots).toBeGreaterThan(0);
    expect(full.alertCalls.every((c) => c.freq === 'once_per_bar')).toBe(true);
    for (const c of full.alertCalls) {
      expect(c.message).toMatch(
        /^(AutoPitchfork: AAPL crossing (median level|(resistance|support) level[\d.]+)|AutoFib Extention : AAPL crossing level -?[\d.]+|Camarilla \(PVTvX\) : AAPL crossing Camarilla level [RS]\d level, price [\d.]+)$/,
      );
    }
    // the Camarilla calls are on the last bar only
    expect(full.alertCalls.filter((c) => c.message.includes('(PVTvX)')).every((c) => c.time === pf[pf.length - 1].time)).toBe(true);
  });

  it('second pitchfork, retracements and switched-off levels', () => {
    const r = calc(pf, { pitch: false, pitchSecond: true, fibTool: 'Retracements' });
    const msgs = new Set(r.alertCalls.map((c) => c.message));
    expect([...msgs].some((m) => m === 'AutoPitchfork2: AAPL crossing median level')).toBe(true);
    expect([...msgs].some((m) => m.startsWith('AutoFib Retracment : AAPL crossing level '))).toBe(true);
    expect([...msgs].some((m) => m === 'AutoPitchfork: AAPL crossing median level')).toBe(false);
    const off = calc(pf, { pitch: false, isFib: false, pivot: 'None' });
    expect(off.alertCalls).toEqual([]);
  });
});

describe('Dynamic Fractal Flow', () => {
  it('declares the 4 alertconditions of the original', () => {
    expect(decls(dff)).toEqual([
      ['alert0', 'DFF Bullish Signal', 'Dynamic Fractal Flow: Bullish signal detected!'],
      ['alert1', 'DFF Bearish Signal', 'Dynamic Fractal Flow: Bearish signal detected!'],
      ['alert2', 'DFF Bullish Acceleration', 'Dynamic Fractal Flow: Bullish acceleration detected!'],
      ['alert3', 'DFF Bearish Acceleration', 'Dynamic Fractal Flow: Bearish acceleration detected!'],
    ]);
    expect(dff.DynamicFractalFlow.alertConditions).toBe(dff.alertConditions);
  });

  /** The four conditions from the plotted signal, raw signal and bands (noise filter off: every bar is trending) */
  const recompute = (r: ReturnType<typeof dff.calculate>, trending: boolean) => {
    const S = (a: number[]) => Series.fromArray(bars, a);
    const diff = (a: number[]) => a.map((v, i) => (i > 0 ? v - a[i - 1] : NaN));
    const rsn = values(r.plots.plot0);
    const base = values(r.plots.plot1);
    const upper = values(r.plots.plot5);
    const lower = values(r.plots.plot6);
    const mom = A(ta.ema(S(diff(base)), 5));
    const acc = A(ta.ema(S(diff(mom)), 3));
    const jerk = A(ta.ema(S(diff(acc)), 3));
    const width = upper.map((u, i) => u - lower[i]);
    const wSma = A(ta.sma(S(width), 50));
    const squeeze = width.map((w, i) => lt(w, wSma[i] * 0.8));
    const bandUp = crossOver(rsn, lower);
    const bandDown = crossOver(rsn.map((v) => -v), upper.map((u) => -u));
    const thrUp = crossOver(rsn, 0.3);
    const thrDown = crossOver(rsn.map((v) => -v), 0.3);
    const accBull = rsn.map((v, i) => gt(acc[i], 0) && gt(jerk[i], 0) && lt(v, 0) && gt(mom[i], 0) && !squeeze[i]);
    const accBear = rsn.map((v, i) => lt(acc[i], 0) && lt(jerk[i], 0) && gt(v, 0) && lt(mom[i], 0) && !squeeze[i]);
    const bull = rsn.map((v, i) => accBull[i] || (trending && ((bandUp[i] && lt(v, 0) && gt(mom[i], 0)) || (thrUp[i] && !squeeze[i]))));
    const bear = rsn.map((v, i) => accBear[i] || (trending && ((bandDown[i] && gt(v, 0) && lt(mom[i], 0)) || (thrDown[i] && !squeeze[i]))));
    return [bull, bear, accBull, accBear];
  };

  it('signals of the original with the noise filter off', () => {
    const r = dff.calculate(bars, { useNoiseFilter: false, showRawSignal: true });
    const want = recompute(r, true);
    want.forEach((f, k) => expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f)));
    // entries and threshold crosses add bars to the acceleration ones
    expect(r.alerts[0].times.length).toBeGreaterThan(r.alerts[2].times.length);
    expect(r.alerts[1].times.length).toBeGreaterThan(r.alerts[3].times.length);
    expect(r.alerts[2].times.length).toBeGreaterThan(0);
    expect(r.alerts[3].times.length).toBeGreaterThan(0);
  });

  it('with the default noise filter (threshold 1) no bar is trending: the signals are the acceleration ones', () => {
    const r = dff.calculate(bars, { showRawSignal: true });
    const want = recompute(r, false);
    want.forEach((f, k) => expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, f)));
    expect(r.alerts[0].times).toEqual(r.alerts[2].times);
    const off = dff.calculate(bars, { useAcceleration: false });
    expect(off.alerts[2].times).toEqual([]);
    expect(off.alerts[3].times).toEqual([]);
  });
});

describe('Inside Bar Coloring w/ Alerts', () => {
  const crafted: Bar[] = [
    ...bars.slice(0, 300),
    { time: bars[300].time, open: 100, high: 110.5, low: 90.25, close: 105, volume: 1 },
    { time: bars[301].time, open: 101, high: 108.75, low: 95.5, close: 100.125, volume: 1 },
    { time: bars[302].time, open: 99, high: 108, low: 96, close: 107, volume: 1 },
  ];
  const inside = crafted.map((b, i) => i > 0 && le(b.high, crafted[i - 1].high) && ge(b.low, crafted[i - 1].low));

  it('calls alert() on every confirmed inside bar when the alerts are on', () => {
    expect(insideBar.hasAlertFunction).toBe(true);
    expect(insideBar.InsideBarColoringWAlerts.hasAlertFunction).toBe(true);
    expect(insideBar.calculate(crafted).alertCalls).toEqual([]);
    const r = insideBar.calculate(crafted, { alertOnInsideBar: true });
    expect(r.alertCalls.map((c) => c.time)).toEqual(timeAt(crafted, inside));
    expect(r.alertCalls.length).toBeGreaterThan(5);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar')).toBe(true);
    const tail = r.alertCalls.slice(-2).map((c) => c.message);
    expect(tail).toEqual([
      'Inside Bar Detected: Bearish | High: 108.75 | Low: 95.5',
      'Inside Bar Detected: Bullish | High: 108 | Low: 96',
    ]);
  });

  it('not on the open last bar (barstate.isconfirmed)', () => {
    const r = insideBar.calculate(crafted, { alertOnInsideBar: true }, { lastBarConfirmed: false });
    expect(r.alertCalls.map((c) => c.time)).toEqual(timeAt(crafted, inside).slice(0, -1));
  });
});

describe('Linear Regression Channel / Curve / Slope by DGT', () => {
  it('declares the 2 alertconditions of the original', () => {
    expect(decls(linreg)).toEqual([
      ['alert0', 'Volume Spike — Possible Exhaustion',
        'LɪɴRᴇɢ | {{exchange}}:{{ticker}} — Unusual volume spike detected, possible exhaustion or climactic move.\nPrice : {{close}}'],
      ['alert1', 'High Volatility — Wide Bar Detected',
        'LɪɴRᴇɢ | {{exchange}}:{{ticker}} — Unusually wide bar detected, possible breakout or volatility surge.\nPrice : {{close}}'],
    ]);
    expect(linreg.hasAlertFunction).toBe(true);
    expect(linreg.LinearRegressionChannelCurveSlopeByDgt.alertConditions).toBe(linreg.alertConditions);
  });

  it('volume spikes and wide bars: crossovers of the volume and the range', () => {
    // a wide bar every 150 bars
    const list = bars.map((b, i) => (i % 150 === 75 ? { ...b, high: b.high + 15, low: b.low - 15 } : b));
    const r = linreg.calculate(list, {}, chart);
    const vol = list.map((b) => b.volume ?? 0);
    const vSma = A(ta.sma(Series.fromArray(list, vol), 89));
    const atr = A(ta.atr(list, 13)).map((v) => v * 2.718);
    expect(r.alerts[0].times).toEqual(timeAt(list, crossOver(vol, vSma.map((v) => v * 4.669))));
    expect(r.alerts[1].times).toEqual(timeAt(list, crossOver(list.map((b) => Math.abs(b.high - b.low)), atr)));
    expect(r.alerts[0].times.length).toBeGreaterThan(3);
    expect(r.alerts[1].times.length).toBeGreaterThan(3);
  });

  it('alert() calls of the last bar: the close crossing the channel lines, the first base line crossing the second channel', () => {
    const price = (v: number) => str.tostring(v, 'mintick', 0.01);
    const crossing = (now: number, before: number, level: number) => (gt(level, now) && lt(level, before)) || (lt(level, now) && gt(level, before));
    let closeCalls = 0;
    let baseCalls = 0;
    for (let k = 250; k <= 900; k++) {
      const list = bars.slice(0, k);
      const r = linreg.calculate(list, {}, chart);
      const prev = linreg.calculate(list.slice(0, -1), {}, chart);
      const i = k - 1;
      const want: string[] = [];
      const at = (rr: typeof r, text: string) => rr.labels.find((l) => l.text === text)!.price;
      for (const ch of ['1', '2']) {
        const base = at(r, `LRL ${ch === '1' ? '1ST' : '2ND'}`);
        if (crossing(list[i].close, list[i - 1].close, base)) want.push(`Price crossed LR${ch} Base Line @ ${price(base)}`);
        for (const sd of ['1', '2', '3']) {
          for (const [side, word] of [['R', 'Upper'], ['S', 'Lower']]) {
            const lv = at(r, `SD ${sd} ${side}${ch}`);
            if (crossing(list[i].close, list[i - 1].close, lv)) want.push(`Price crossed LR${ch} ${word} Band (SD ${sd}) @ ${price(lv)}`);
          }
        }
      }
      // the base line of the first channel on this bar and on the bar before (that bar as the last one)
      const e1 = at(r, 'LRL 1ST');
      const e1Before = at(prev, 'LRL 1ST');
      const second: Array<[string, number]> = [['LR1 Base crossed LR2 Base Line', at(r, 'LRL 2ND')]];
      for (const [side, word] of [['R', 'Upper'], ['S', 'Lower']]) {
        for (const sd of ['1', '2', '3']) second.push([`LR1 Base crossed LR2 ${word} Band (SD ${sd})`, at(r, `SD ${sd} ${side}2`)]);
      }
      for (const [txt, lv] of second) if (crossing(e1, e1Before, lv)) want.push(`${txt} @ ${price(lv)}`);
      const got = r.alertCalls.map((c) => {
        expect(c.time).toBe(list[i].time);
        expect(c.freq).toBe('once_per_bar');
        return c.message;
      });
      expect(got, `bar ${i}`).toEqual(want.map((w) => `LɪɴRᴇɢ | AAPL — ${w}`));
      closeCalls += got.filter((m) => m.includes('Price crossed')).length;
      baseCalls += got.filter((m) => m.includes('LR1 Base crossed')).length;
    }
    expect(closeCalls).toBeGreaterThan(5);
    expect(baseCalls).toBeGreaterThan(0);
  });
});

describe('Pulse Range', () => {
  it('declares the 3 alertconditions of the original', () => {
    expect(decls(pulse)).toEqual([
      ['alert0', 'Pulse Range — Green Signal', 'Pulse Range: center line changed from red to green'],
      ['alert1', 'Pulse Range — Red Signal', 'Pulse Range: center line changed from green to red'],
      ['alert2', 'Pulse Range — Direction Change', 'Pulse Range: center line changed direction'],
    ]);
    expect(pulse.PulseRange.alertConditions).toBe(pulse.alertConditions);
  });

  it('turns of the center line (direction from its values), only when the alerts are enabled', () => {
    const list = bars.slice(0, 700);
    const r = pulse.calculate(list, { rangeLength: 10, rangeScale: 1 });
    const center = values(r.plots.plot0);
    const dir: number[] = [];
    let d = 0;
    center.forEach((c, i) => {
      if (gt(c, center[i - 1])) d = 1;
      else if (lt(c, center[i - 1])) d = -1;
      dir.push(d);
    });
    const green = dir.map((x, i) => x === 1 && (dir[i - 1] ?? 0) === -1);
    const red = dir.map((x, i) => x === -1 && (dir[i - 1] ?? 0) === 1);
    expect(r.alerts[0].times).toEqual(timeAt(list, green));
    expect(r.alerts[1].times).toEqual(timeAt(list, red));
    expect(r.alerts[2].times).toEqual(timeAt(list, green.map((g, i) => g || red[i])));
    expect(r.alerts[0].times.length).toBeGreaterThan(3);
    const off = pulse.calculate(list, { rangeLength: 10, rangeScale: 1, alertsEnabled: false });
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
  });

  it('with "Confirm Signal On Bar Close" an open last bar gives no signal', () => {
    const r = pulse.calculate(bars.slice(0, 700), { rangeLength: 10, rangeScale: 1 });
    const t = r.alerts[2].times[r.alerts[2].times.length - 1];
    const k = bars.findIndex((b) => b.time === t);
    const cut = bars.slice(0, k + 1);
    expect(pulse.calculate(cut, { rangeLength: 10, rangeScale: 1 }).alerts[2].triggered).toBe(true);
    expect(pulse.calculate(cut, { rangeLength: 10, rangeScale: 1 }, { lastBarConfirmed: false }).alerts[2].triggered).toBe(false);
    expect(pulse.calculate(cut, { rangeLength: 10, rangeScale: 1, confirmAtClose: false }, { lastBarConfirmed: false }).alerts[2].triggered).toBe(true);
  });
});

describe('Scalping Swing Trading Tool R1-4 by JustUncleL', () => {
  it('declares the 2 alertconditions of the original', () => {
    expect(decls(scalp)).toEqual([
      ['alert0', 'SCAPSWING alert Up', 'SWING_UP'],
      ['alert1', 'SCAPSWING alert Down', 'SWING_DN'],
    ]);
    expect(scalp.ScalpingSwingTradingTool.alertConditions).toBe(scalp.alertConditions);
  });

  for (const filterEma200 of [true, false]) {
    it(`up_alert == 1 / dn_alert == 1: the first bar that leaves the PAC (200 EMA filter ${filterEma200 ? 'on' : 'off'})`, () => {
      const r = scalp.calculate(bars, { filterEma200, showPacExit: true }, chart);
      const S = (f: (b: Bar) => number) => A(ta.ema(new Series(bars, f), 10));
      const pacC = S((b) => b.close);
      const pacU = S((b) => b.high);
      const pacL = S((b) => b.low);
      const ema200 = A(ta.ema(new Series(bars, (b) => b.close), 200));
      const isUp = bars.map((b, i) => gt(b.close, b.open) && gt(b.close, pacU[i]) && i > 0 && lt(bars[i - 1].close, pacU[i - 1])
        && (!filterEma200 || gt(pacC[i], ema200[i])));
      const isDn = bars.map((b, i) => lt(b.close, b.open) && lt(b.close, pacL[i]) && i > 0 && gt(bars[i - 1].close, pacL[i - 1])
        && (!filterEma200 || lt(pacC[i], ema200[i])));
      const up = isUp.map((x, i) => x && !(isUp[i - 1] ?? false));
      const dn = isDn.map((x, i) => x && !(isDn[i - 1] ?? false));
      expect(r.alerts[0].times).toEqual(timeAt(bars, up));
      expect(r.alerts[1].times).toEqual(timeAt(bars, dn));
      expect(r.alerts[0].times.length).toBeGreaterThan(3);
      expect(r.alerts[1].times.length).toBeGreaterThan(3);
      // the BUY / SELL arrows are drawn on the bar after
      const next = (ts: number[]) => ts.map((t) => bars.findIndex((b) => b.time === t) + 1).filter((i) => i < bars.length).map((i) => bars[i].time);
      expect(r.markers.filter((m) => m.text === 'BUY').map((m) => m.time)).toEqual(next(r.alerts[0].times));
      expect(r.markers.filter((m) => m.text === 'SELL').map((m) => m.time)).toEqual(next(r.alerts[1].times));
    });
  }
});

describe('Trend Scalper', () => {
  it('declares the 2 alertconditions of the original', () => {
    expect(decls(trendScalper)).toEqual([
      ['alert0', 'Long Alert', 'Trend Scalper Long Signal'],
      ['alert1', 'Short Alert', 'Trend Scalper Short Signal'],
    ]);
    expect(trendScalper.TrendScalper.alertConditions).toBe(trendScalper.alertConditions);
  });

  it('long / short conditions from the EMA stack and the wick between EMA 1 and EMA 2', () => {
    const r = trendScalper.calculate(bars);
    const e1 = values(r.plots.plot0);
    const e2 = values(r.plots.plot1);
    const e3 = values(r.plots.plot2);
    const long = bars.map((b, i) => gt(e1[i], e2[i]) && gt(e2[i], e3[i]) && le(b.low, e1[i]) && ge(b.low, e2[i]));
    const short = bars.map((b, i) => lt(e1[i], e2[i]) && lt(e2[i], e3[i]) && ge(b.high, e1[i]) && le(b.high, e2[i]));
    expect(r.alerts[0].times).toEqual(timeAt(bars, long));
    expect(r.alerts[1].times).toEqual(timeAt(bars, short));
    expect(r.alerts[0].times.length).toBeGreaterThan(5);
    expect(r.alerts[1].times.length).toBeGreaterThan(5);
  });

  it('first signals only: the alerts follow the triangles', () => {
    const r = trendScalper.calculate(bars, { onlyFirstTriangle: true });
    expect(r.alerts[0].times).toEqual(r.markers.filter((m) => m.shape === 'triangleUp').map((m) => m.time));
    expect(r.alerts[1].times).toEqual(r.markers.filter((m) => m.shape === 'triangleDown').map((m) => m.time));
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[0].times.length).toBeLessThan(trendScalper.calculate(bars).alerts[0].times.length);
  });
});
