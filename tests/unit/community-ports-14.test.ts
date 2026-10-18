/**
 * Community ports, batch 14: the alertcondition() declarations and the bars on which each condition is true
 * (re-computed here from the original's expression), the alert() calls, and the Style ids on the emitted markers /
 * background colours.
 */
import { describe, expect, it } from 'vitest';
import type { Bar } from 'oakscriptjs';
import * as fisher from '../../src/community/fisher-volume-transform-alphanatt';
import * as fco from '../../src/community/flow-control-oscillator';
import * as followLine from '../../src/community/follow-line';
import * as forLoop from '../../src/community/for-loop-vote-trailing-stop-miesoncharts';
import * as forcePulse from '../../src/community/force-pulse';
import * as fourier from '../../src/community/fourier-series-model-of-the-market';
import * as feb from '../../src/community/fractal-exhaustion-band';
import * as fractalsTrend from '../../src/community/fractals-trend';
import * as fractalsV9 from '../../src/community/fractals-v9';
import * as fsvzo from '../../src/community/fsvzo';
import * as fullCandle from '../../src/community/full-candle-higher-lower';
import * as futech from '../../src/community/futech-v-spike-v-highlighter';
import * as fvgBreak from '../../src/community/fvg-breakout-breakdown';
import * as fvgSessions from '../../src/community/fvg-sessions';
import * as fxSessions from '../../src/community/fx-market-sessions';
import * as fxn from '../../src/community/fxn-asian-session-range';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of bars (`step` seconds apart) with a random volume */
function walk(count: number, seed0: number, step = 86400, scale = 1, start = 1577836800): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5 * scale;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 * scale + (rnd() - 0.5) * 4 * scale);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({
      time: start + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5 * scale,
      low: Math.min(o, p) - rnd() * 1.5 * scale, close: p, volume,
    });
  }
  return out;
}
const timesWhere = (list: Bar[], f: (i: number) => boolean) => list.filter((_, i) => f(i)).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const values = (pts: { value: number }[]) => pts.map((p) => p.value);
const crossover = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v > (typeof b === 'number' ? b : b[i]) && a[i - 1] <= (typeof b === 'number' ? b : b[i - 1]));
const crossunder = (a: number[], b: number[] | number) =>
  a.map((v, i) => i > 0 && v < (typeof b === 'number' ? b : b[i]) && a[i - 1] >= (typeof b === 'number' ? b : b[i - 1]));
const idTimes = (items: { id?: string; time: number }[], id: string) => items.filter((m) => m.id === id).map((m) => m.time);
const boolTimes = (list: Bar[], flags: boolean[]) => timesWhere(list, (i) => flags[i]);
const specDecls = (prefix: string, titles: [string, string][]) => titles.map(([t, m], k) => [`${prefix}${k}`, t, m]);

/** Pine ta.sma / ta.stdev (population) / ta.rma / ta.atr, for the re-computations */
const sma = (x: number[], len: number) => x.map((_v, i) => {
  if (i < len - 1) return NaN;
  let s = 0;
  for (let k = i - len + 1; k <= i; k++) s += x[k];
  return s / len;
});
const stdev = (x: number[], len: number) => {
  const m = sma(x, len);
  return x.map((_v, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += (x[k] - m[i]) ** 2;
    return Math.sqrt(s / len);
  });
};
const atr = (bars: Bar[], len: number) => {
  const tr = bars.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  const out: number[] = [];
  for (let i = 0; i < tr.length; i++) {
    if (i < len - 1) out.push(NaN);
    else if (i === len - 1) out.push(tr.slice(0, len).reduce((a, v) => a + v, 0) / len);
    else out.push((out[i - 1] * (len - 1) + tr[i]) / len);
  }
  return out;
};

describe('Fisher Volume Transform: alertconditions', () => {
  const bars = walk(1200, 3);
  const r = fisher.calculate(bars);
  it('declares the four conditions of the original', () => {
    expect(decls(fisher)).toEqual(specDecls('alert', [
      ['Fisher Bull Cross', 'Fisher Transform crossed above zero'],
      ['Fisher Bear Cross', 'Fisher Transform crossed below zero'],
      ['Signal Cross Up', 'Fisher crossed above signal'],
      ['Signal Cross Down', 'Fisher crossed below signal'],
    ]));
    expect(fisher.FisherVolumeTransformAlphanatt.alertConditions).toBe(fisher.alertConditions);
  });
  it('fires on the zero and signal crosses of the oscillator', () => {
    const osc = values(r.plots.plot20);
    const sig = values(r.plots.plot21);
    const exp = [crossover(osc, 0), crossunder(osc, 0), crossover(osc, sig), crossunder(osc, sig)];
    exp.forEach((f, k) => {
      expect(boolTimes(bars, f).length).toBeGreaterThan(10);
      expect(r.alerts[k].times).toEqual(boolTimes(bars, f));
    });
  });
});

describe('Flow Control Oscillator: alertconditions and background ids', () => {
  const bars = walk(1500, 7);
  const r = fco.calculate(bars);
  const mom = values(r.plots.plot0);
  const f = values(r.plots.plot1);
  const sig = values(r.plots.plot2);
  const adx = values(r.plots.plot6);
  it('declares the 14 conditions of the original', () => {
    expect(decls(fco)).toEqual(specDecls('alert', [
      ['Bullish Reversal Setup', 'REVERSAL: FCO crossing up from extreme oversold with weakening momentum!'],
      ['Bearish Reversal Setup', 'REVERSAL: FCO crossing down from extreme overbought with weakening momentum!'],
      ['Strong Bullish Trend', 'TREND: Buyers taking control with growing momentum and strong ADX!'],
      ['Strong Bearish Trend', 'TREND: Sellers taking control with growing momentum and strong ADX!'],
      ['FCO Crossed Above Signal', 'FCO crossed above Signal line - bullish momentum shift'],
      ['FCO Crossed Below Signal', 'FCO crossed below Signal line - bearish momentum shift'],
      ['Confirmed Bullish Signal', 'FCO crossed zero UP and Signal confirms - strong buy signal!'],
      ['Confirmed Bearish Signal', 'FCO crossed zero DOWN and Signal confirms - strong sell signal!'],
      ['Buyers Take Control', 'Buyers Now in Control!'],
      ['Sellers Take Control', 'Sellers Now in Control!'],
      ['Extreme Overbought', 'Buyers Exhausted - Watch for reversal!'],
      ['Extreme Oversold', 'Sellers Exhausted - Watch for reversal!'],
      ['Strong Bullish Momentum', 'Strong Buyers Gaining Strength!'],
      ['Strong Bearish Momentum', 'Strong Sellers Gaining Strength!'],
    ]));
    expect(fco.FlowControlOscillator.alertConditions).toBe(fco.alertConditions);
  });
  it('re-computes every condition from the series', () => {
    const bullMom = crossover(mom, 0), bearMom = crossunder(mom, 0);
    const xHigh = f.map((v) => gt(v, 1)), xLow = f.map((v) => lt(v, -1));
    const zUp = crossover(f, 0), zDn = crossunder(f, 0);
    const strong = adx.map((v) => gt(v, 0.25));
    const sUp = crossover(f, sig), sDn = crossunder(f, sig);
    const pa = (i: number) => (i > 0 ? Math.abs(mom[i - 1]) : NaN);
    const weak = mom.map((m, i) => lt(Math.abs(m), pa(i)));
    const grow = mom.map((m, i) => gt(Math.abs(m), pa(i)));
    const ps = (i: number) => (i > 0 ? sig[i - 1] : NaN);
    const exp: ((i: number) => boolean)[] = [
      (i) => xLow[i] && sUp[i] && weak[i], (i) => xHigh[i] && sDn[i] && weak[i],
      (i) => zUp[i] && gt(mom[i], 0) && grow[i] && strong[i], (i) => zDn[i] && lt(mom[i], 0) && grow[i] && strong[i],
      (i) => sUp[i], (i) => sDn[i], (i) => zUp[i] && gt(sig[i], ps(i)), (i) => zDn[i] && lt(sig[i], ps(i)),
      (i) => zUp[i], (i) => zDn[i], (i) => xHigh[i], (i) => xLow[i],
      (i) => bullMom[i] && strong[i], (i) => bearMom[i] && strong[i],
    ];
    exp.forEach((e, k) => expect(r.alerts[k].times).toEqual(timesWhere(bars, e)));
    for (const k of [2, 4, 5, 8, 9, 10, 11, 12, 13]) expect(r.alerts[k].times.length).toBeGreaterThan(0);
  });
  it('the backgrounds carry bgcolor0 (extreme zones) / bgcolor1 (weak trend)', () => {
    expect(idTimes(r.bgColors, 'bgcolor0')).toEqual(timesWhere(bars, (i) => gt(Math.abs(f[i]), 1)));
    expect(idTimes(r.bgColors, 'bgcolor1')).toEqual(timesWhere(bars, (i) => lt(adx[i], 0.2)));
    expect(r.bgColors.every((b) => b.id === 'bgcolor0' || b.id === 'bgcolor1')).toBe(true);
    expect(idTimes(r.bgColors, 'bgcolor1').length).toBeGreaterThan(0);
  });
});

describe('Follow Line: alertconditions', () => {
  const bars = walk(1500, 11);
  it('declares the three conditions of the original', () => {
    expect(decls(followLine)).toEqual([['alert0', 'Sell', 'Sell'], ['alert1', 'Buy', 'Buy'], ['alert2', 'Buy/Sell', 'Buy/Sell']]);
    expect(followLine.FollowLine.alertConditions).toBe(followLine.alertConditions);
  });
  for (const useATRFilter of [true, false]) {
    it(`fires on the flips of the original's trend (ATR filter ${useATRFilter})`, () => {
      const close = bars.map((b) => b.close);
      const m = sma(close, 21), sd = stdev(close, 21), a = atr(bars, 5);
      const tl: number[] = [], it: number[] = [];
      for (let i = 0; i < bars.length; i++) {
        const sig = gt(close[i], m[i] + sd[i]) ? 1 : lt(close[i], m[i] - sd[i]) ? -1 : 0;
        const p = i > 0 ? tl[i - 1] : NaN;
        let v = p;
        if (sig === 1) { v = useATRFilter ? bars[i].low - a[i] : bars[i].low; if (lt(v, p)) v = p; }
        if (sig === -1) { v = useATRFilter ? bars[i].high + a[i] : bars[i].high; if (gt(v, p)) v = p; }
        let d = i > 0 ? it[i - 1] : NaN;
        if (gt(v, p)) d = 1;
        if (lt(v, p)) d = -1;
        tl.push(v);
        it.push(d);
      }
      const buy = timesWhere(bars, (i) => i > 0 && it[i - 1] === -1 && it[i] === 1);
      const sell = timesWhere(bars, (i) => i > 0 && it[i - 1] === 1 && it[i] === -1);
      expect(buy.length).toBeGreaterThan(5);
      const r = followLine.calculate(bars, { useATRFilter });
      expect(r.alerts[0].times).toEqual(sell);
      expect(r.alerts[1].times).toEqual(buy);
      expect(r.alerts[2].times).toEqual([...buy, ...sell].sort((x, y) => x - y));
    });
  }
});

describe('For-Loop Vote Trailing Stop: alertconditions', () => {
  const bars = walk(1200, 13);
  it('declares the two conditions of the original', () => {
    expect(decls(forLoop)).toEqual([
      ['alert0', 'Vote Stop Long', 'Multi-horizon vote crossed long threshold'],
      ['alert1', 'Vote Stop Short', 'Multi-horizon vote crossed short threshold'],
    ]);
    expect(forLoop.ForLoopVoteTrailingStopMiesoncharts.alertConditions).toBe(forLoop.alertConditions);
  });
  it('fires on the regime flips of the vote', () => {
    const src = bars.map((b) => (b.high + b.low) / 2);
    const dir: number[] = [];
    let d = 0;
    for (let k = 0; k < bars.length; k++) {
      let score = 0;
      for (let i = 1; i <= 70; i++) score += gt(src[k], k - i >= 0 ? src[k - i] : NaN) ? 1 : -1;
      score /= 70;
      if (ge(score, 0.6) && d !== 1) d = 1;
      else if (le(score, -0.2) && d !== -1) d = -1;
      dir.push(d);
    }
    const up = timesWhere(bars, (i) => i > 0 && dir[i] === 1 && dir[i - 1] !== 1);
    const dn = timesWhere(bars, (i) => i > 0 && dir[i] === -1 && dir[i - 1] !== -1);
    expect(up.length).toBeGreaterThan(5);
    const r = forLoop.calculate(bars);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(dn);
  });
});

describe('Force Pulse: alertconditions and shape ids', () => {
  const bars = walk(1500, 17);
  const r = forcePulse.calculate(bars, { signalType: 'All' });
  const cpo = values(r.plots.plot3);
  const ma = values(r.plots.plot6);
  const exp = [crossover(cpo, 27), crossunder(cpo, 73), crossover(cpo, 50), crossunder(cpo, 50), crossover(ma, 50), crossunder(ma, 50)];
  it('declares the eight conditions of the original', () => {
    expect(decls(forcePulse)).toEqual(specDecls('alert', [
      ['Buy – Oversold', 'Force Pulse: Price crossed above oversold level'],
      ['Sell – Overbought', 'Force Pulse: Price crossed below overbought level'],
      ['Midline Long', 'Force Pulse: Oscillator crossed above Midline'],
      ['Midline Short', 'Force Pulse: Oscillator crossed below Midline'],
      ['MA Midline Long', 'Force Pulse: MA crossed above Midline'],
      ['MA Midline Short', 'Force Pulse: MA crossed below Midline'],
      ['Bullish Divergence', 'Force Pulse: Bullish divergence detected'],
      ['Bearish Divergence', 'Force Pulse: Bearish divergence detected'],
    ]));
    expect(forcePulse.ForcePulse.alertConditions).toBe(forcePulse.alertConditions);
  });
  it('fires on the crosses, whatever the shown signals', () => {
    exp.forEach((f, k) => {
      expect(boolTimes(bars, f).length).toBeGreaterThan(3);
      expect(r.alerts[k].times).toEqual(boolTimes(bars, f));
    });
    const none = forcePulse.calculate(bars, { signalType: 'None' });
    exp.forEach((f, k) => expect(none.alerts[k].times).toEqual(boolTimes(bars, f)));
  });
  it('the divergence alerts fire on the bar that finds the divergence (the label is drawn 3 bars back)', () => {
    const at = (t: number) => bars.findIndex((b) => b.time === t);
    const bull = idTimes(r.markers, 'shape6').map((t) => bars[at(t) + 3].time);
    const bear = idTimes(r.markers, 'shape7').map((t) => bars[at(t) + 3].time);
    expect(bull.length + bear.length).toBeGreaterThan(0);
    expect(r.alerts[6].times).toEqual(bull);
    expect(r.alerts[7].times).toEqual(bear);
  });
  it('the triangles carry shape0..shape5 and the labels shape6 / shape7', () => {
    exp.forEach((f, k) => expect(idTimes(r.markers, `shape${k}`)).toEqual(boolTimes(bars, f)));
    expect(r.markers.every((m) => /^shape[0-7]$/.test(m.id ?? ''))).toBe(true);
    expect(r.markers.filter((m) => m.text === ' Bull ').every((m) => m.id === 'shape6')).toBe(true);
    expect(r.markers.filter((m) => m.text === ' Bear ').every((m) => m.id === 'shape7')).toBe(true);
  });
});

describe('Fourier Series Model of the Market: alertconditions', () => {
  const bars = walk(1500, 19);
  it('declares the four conditions of the original', () => {
    expect(decls(fourier)).toEqual(specDecls('alert', [
      ['FSMM: Above +Threshold', 'FSMM: wave crossed above +threshold'],
      ['FSMM: Below -Threshold', 'FSMM: wave crossed below -threshold'],
      ['FSMM: Above Zero', 'FSMM: wave crossed above zero'],
      ['FSMM: Below Zero', 'FSMM: wave crossed below zero'],
    ]));
    expect(fourier.FourierSeriesModelOfTheMarket.alertConditions).toBe(fourier.alertConditions);
  });
  it('fires on the band crosses (only with the bands shown) and the zero crosses', () => {
    const r = fourier.calculate(bars);
    const wave = values(r.plots.plot0);
    const up = values(r.plots.plot2);
    const dn = values(r.plots.plot3);
    const exp = [crossover(wave, up), crossunder(wave, dn), crossover(wave, 0), crossunder(wave, 0)];
    exp.forEach((f, k) => {
      expect(boolTimes(bars, f).length).toBeGreaterThan(3);
      expect(r.alerts[k].times).toEqual(boolTimes(bars, f));
    });
    const off = fourier.calculate(bars, { showThreshold: false });
    expect(off.alerts[0].times).toEqual([]);
    expect(off.alerts[1].times).toEqual([]);
    expect(off.alerts[2].times).toEqual(r.alerts[2].times);
  });
});

describe('Fractal Exhaustion Band: alertconditions and shape ids', () => {
  const bars = walk(1500, 23);
  const r = feb.calculate(bars);
  // The trend from the colours of the trend line (transparent on the flip bars, where the trend is the other one)
  const dir: number[] = [];
  r.plots.plot2.forEach((p: { color?: string }, i: number) => {
    if (p.color === 'transparent') dir.push(-dir[i - 1]);
    else dir.push(p.color === '#00ffaa' ? 1 : -1);
  });
  const bull = timesWhere(bars, (i) => i > 0 && dir[i] === 1 && dir[i - 1] === -1);
  const bear = timesWhere(bars, (i) => i > 0 && dir[i] === -1 && dir[i - 1] === 1);
  it('declares the three conditions of the original (placeholders kept)', () => {
    expect(decls(feb)).toEqual(specDecls('alert', [
      ['Bullish Trend', 'Fractal Exhaustion Band [QuantAlgo]: Bullish trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['Bearish Trend', 'Fractal Exhaustion Band [QuantAlgo]: Bearish trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
      ['Any Signal Change', 'Fractal Exhaustion Band [QuantAlgo]: Trend direction flipped on {{exchange}}:{{ticker}} - {{interval}}'],
    ]));
    expect(feb.FractalExhaustionBand.alertConditions).toBe(feb.alertConditions);
  });
  it('fires on the trend flips', () => {
    expect(bull.length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(bull);
    expect(r.alerts[1].times).toEqual(bear);
    expect(r.alerts[2].times).toEqual([...bull, ...bear].sort((a, b) => a - b));
  });
  it('the flip circles and their glows carry shape0..shape3', () => {
    expect(idTimes(r.markers, 'shape0')).toEqual(bull);
    expect(idTimes(r.markers, 'shape1')).toEqual(bull);
    expect(idTimes(r.markers, 'shape2')).toEqual(bear);
    expect(idTimes(r.markers, 'shape3')).toEqual(bear);
    expect(r.markers.filter((m) => m.id === 'shape1').every((m) => m.size === 'small')).toBe(true);
    expect(r.markers.every((m) => /^shape[0-3]$/.test(m.id ?? ''))).toBe(true);
  });
});

describe('Fractals Trend: alertconditions', () => {
  const bars = walk(1500, 29);
  it('declares the two conditions of the original (default message)', () => {
    expect(decls(fractalsTrend)).toEqual([['alert0', 'Trend Up', 'Alert Fired!'], ['alert1', 'Trend Down', 'Alert Fired!']]);
    expect(fractalsTrend.FractalsTrend.alertConditions).toBe(fractalsTrend.alertConditions);
  });
  it('fires on the trend changes', () => {
    const r = fractalsTrend.calculate(bars);
    const trend = r.plots.plot0.map((p: { color?: string }) => p.color === fractalsTrend.defaultInputs.colorSup);
    const prev = (i: number) => (i > 0 ? trend[i - 1] : false);
    const up = timesWhere(bars, (i) => trend[i] !== prev(i) && trend[i]);
    const dn = timesWhere(bars, (i) => trend[i] !== prev(i) && !trend[i]);
    expect(up.length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(up);
    expect(r.alerts[1].times).toEqual(dn);
    // the line is broken on those bars
    expect([...up, ...dn].every((t) => isNaN(r.plots.plot0.find((p: { time: number }) => p.time === t)!.value))).toBe(true);
  });
});

describe('[RS]Fractals V9: alertcondition and shape ids', () => {
  const bars = walk(1500, 31);
  const r = fractalsV9.calculate(bars, { showHHLL: true });
  it('declares the condition of the original', () => {
    expect(decls(fractalsV9)).toEqual([['alert0', 'all patterns', 'The Patterns']]);
    expect(fractalsV9.FractalsV9.alertConditions).toBe(fractalsV9.alertConditions);
  });
  it('every bearish and bullish pattern on one bar never happens (bearish needs d > c, bullish d < c)', () => {
    expect(r.alerts[0].times).toEqual([]);
    expect(r.alerts[0].triggered).toBe(false);
  });
  it('the fractal triangles carry shape0 / shape1 (drawn 2 bars back)', () => {
    const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
    const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
    const top = (i: number) => lt(H(i - 4), H(i - 2)) && le(H(i - 3), H(i - 2)) && ge(H(i - 2), H(i - 1)) && gt(H(i - 2), H(i));
    const bot = (i: number) => gt(L(i - 4), L(i - 2)) && ge(L(i - 3), L(i - 2)) && le(L(i - 2), L(i - 1)) && lt(L(i - 2), L(i));
    const back = (f: (i: number) => boolean) => bars.flatMap((_b, i) => (i >= 2 && f(i) ? [bars[i - 2].time] : []));
    expect(idTimes(r.markers, 'shape0')).toEqual(back(top));
    expect(idTimes(r.markers, 'shape1')).toEqual(back(bot));
  });
  it('the other markers carry the id of their plotshape', () => {
    const texts: Record<string, string> = { shape2: '[HH]', shape3: '[LH]', shape4: '[HL]', shape5: '[LL]' };
    for (const [id, text] of Object.entries(texts)) {
      expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
      expect(r.markers.filter((m) => m.id === id).every((m) => m.text === text)).toBe(true);
    }
    const names = ['AB=CD', 'Bat', 'Alt Bat', 'Butterfly', 'Gartley', 'Crab', 'Shark', '5-O', 'Wolf Wave', 'Head and Shoulders',
      'Contracting Triangle', 'Expanding Triangle'];
    for (const m of r.markers.filter((x) => x.shape === 'labelDown' || x.shape === 'labelUp')) {
      const k = names.indexOf((m.text ?? '').trim());
      expect(m.id).toBe(`shape${(m.shape === 'labelDown' ? 8 : 20) + k}`);
    }
    expect(r.markers.some((m) => m.shape === 'labelDown' || m.shape === 'labelUp')).toBe(true);
    expect(r.markers.every((m) => /^shape([0-9]|[12][0-9]|3[01])$/.test(m.id ?? ''))).toBe(true);
  });
});

describe('FSVZO: alertconditions and shape ids', () => {
  const bars = walk(1500, 37);
  const r = fsvzo.calculate(bars);
  it('declares the four conditions of the original (placeholders kept)', () => {
    expect(decls(fsvzo)).toEqual(specDecls('alert', [
      ['Enhanced Bullish Flow Alert', '🟢 Enhanced Bullish Flow Detected! {{exchange}}:{{ticker}}'],
      ['Enhanced Bearish Flow Alert', '🔴 Enhanced Bearish Flow Detected! {{exchange}}:{{ticker}}'],
      ['Enhanced Bullish Reversal Alert', '🚀 Strong Enhanced Bullish Reversal! {{exchange}}:{{ticker}}'],
      ['Enhanced Bearish Reversal Alert', '💥 Strong Enhanced Bearish Reversal! {{exchange}}:{{ticker}}'],
    ]));
    expect(fsvzo.Fsvzo.alertConditions).toBe(fsvzo.alertConditions);
  });
  it('fires on the signal crosses (beyond -80 / +80 for the reversals)', () => {
    expect(r.plots.plot2.length).toBe(bars.length);
    const vzo = values(r.plots.plot2);
    const sig = values(r.plots.plot3);
    const up = crossover(vzo, sig), dn = crossunder(vzo, sig);
    expect(boolTimes(bars, up).length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(boolTimes(bars, up));
    expect(r.alerts[1].times).toEqual(boolTimes(bars, dn));
    expect(r.alerts[2].times).toEqual(timesWhere(bars, (i) => up[i] && lt(vzo[i], -80)));
    expect(r.alerts[3].times).toEqual(timesWhere(bars, (i) => dn[i] && gt(vzo[i], 80)));
  });
  it('the markers carry the ids of their plotshape / plotchar', () => {
    const allowed = ['shape0', 'shape1', 'char2', 'char3', 'char4', 'char5', 'shape6', 'shape7', 'shape8', 'shape9'];
    expect(r.markers.every((m) => allowed.includes(m.id ?? ''))).toBe(true);
    expect(idTimes(r.markers, 'shape0').length).toBeGreaterThan(5);
    expect(idTimes(r.markers, 'shape1').length).toBeGreaterThan(5);
    const byText: Record<string, string[]> = {
      ' BULL ': ['shape6'], ' H.BULL ': ['shape7'], ' BEAR ': ['shape8'], ' H.BEAR ': ['shape9'],
      '×': ['char2', 'char3'], '▲': ['char4'], '▼': ['char5'],
    };
    for (const m of r.markers) {
      if (m.text !== undefined) expect(byText[m.text]).toContain(m.id);
      else expect(['shape0', 'shape1']).toContain(m.id);
    }
    expect(r.markers.filter((m) => m.id === 'char2').every((m) => m.price === 125)).toBe(true);
    expect(r.markers.filter((m) => m.id === 'char3').every((m) => m.price === -125)).toBe(true);
  });
});

describe('Full Candle Higher/Lower: alertconditions', () => {
  const bars = walk(1500, 41);
  it('declares the two conditions of the original', () => {
    expect(decls(fullCandle)).toEqual([
      ['alert0', 'Higher Flag', 'Higher flag detected'], ['alert1', 'Lower Flag', 'Lower flag detected'],
    ]);
    expect(fullCandle.FullCandleHigherLower.alertConditions).toBe(fullCandle.alertConditions);
  });
  it('fires on the signals that do not repeat', () => {
    const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
    const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
    const higher: boolean[] = [], lower: boolean[] = [];
    let last = 'none';
    bars.forEach((b, i) => {
      const nh = gt(b.close, H(i - 1)) && le(L(i - 1), H(i - 2)) && last !== 'newHigher';
      const nl = lt(b.close, L(i - 1)) && ge(H(i - 1), L(i - 2)) && last !== 'newLower';
      if (nh) last = 'newHigher';
      else if (nl) last = 'newLower';
      higher.push(nh);
      lower.push(nl);
    });
    const r = fullCandle.calculate(bars);
    expect(boolTimes(bars, higher).length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(boolTimes(bars, higher));
    expect(r.alerts[1].times).toEqual(boolTimes(bars, lower));
  });
});

describe('FuTech V-Spike & V-Highlighter: alertconditions', () => {
  const bars = walk(1500, 43);
  it('declares the six conditions of the original (placeholders kept)', () => {
    expect(decls(futech)).toEqual(specDecls('alert', [
      ['Volume Spike', '{{ticker}} Volume Spike detected on {{interval}}'],
      ['Bullish Volume Spike', '{{ticker}} Bullish Volume Spike on {{interval}}'],
      ['Bearish Volume Spike', '{{ticker}} Bearish Volume Spike on {{interval}}'],
      ['Highest Volume Candle', '{{ticker}} Highest Volume candle in lookback period on {{interval}}'],
      ['Bullish Highest Volume Candle', '{{ticker}} Bullish Highest Volume candle on {{interval}}'],
      ['Bearish Highest Volume Candle', '{{ticker}} Bearish Highest Volume candle on {{interval}}'],
    ]));
    expect(futech.FuTechVSpikeVHighlighter.alertConditions).toBe(futech.alertConditions);
  });
  it('fires on the spikes and on the highest volume candles', () => {
    const r = futech.calculate(bars);
    const vol = bars.map((b) => b.volume as number);
    // highest volume of the last 20 bars
    const big = vol.map((v, i) => i >= 19 && v === Math.max(...vol.slice(i - 19, i + 1)));
    const up = (i: number) => ge(bars[i].close, bars[i].open);
    expect(boolTimes(bars, big).length).toBeGreaterThan(20);
    expect(r.alerts[3].times).toEqual(boolTimes(bars, big));
    expect(r.alerts[4].times).toEqual(timesWhere(bars, (i) => big[i] && up(i)));
    expect(r.alerts[5].times).toEqual(timesWhere(bars, (i) => big[i] && !up(i)));
    // the spikes: the bars coloured up / down, all of them spikes with a close above / below the previous close
    const upColor = futech.defaultInputs.upVolumeSpikeColor;
    expect(r.alerts[1].times).toEqual(r.barColors.filter((c) => c.color === upColor).map((c) => c.time));
    expect(r.alerts[2].times).toEqual(r.barColors.filter((c) => c.color !== upColor).map((c) => c.time));
    expect(r.alerts[1].times.length).toBeGreaterThan(5);
    const spikes = new Set(r.alerts[0].times);
    expect([...r.alerts[1].times, ...r.alerts[2].times].every((t) => spikes.has(t))).toBe(true);
    expect(r.alerts[0].times.every((t) => {
      const i = bars.findIndex((b) => b.time === t);
      return i > 0 && vol[i] > 1.5 * 1e6 * 0.3;
    })).toBe(true);
    // with the bar colours off the alerts stay
    expect(futech.calculate(bars, { showVolumeSpikeBarColor: false }).alerts[1].times).toEqual(r.alerts[1].times);
  });
});

describe('FVG Breakout/Breakdown: alertconditions and shape ids', () => {
  // NWOG bars: 2024-01-01 15:59 UTC (close) and 2024-01-04 00:00 UTC (open), then hourly bars
  const FRI = Date.UTC(2024, 0, 1, 15, 59) / 1000;
  const MON = Date.UTC(2024, 0, 4, 0, 0) / 1000;
  const bars = walk(1500, 47).map((b, i) => ({ ...b, time: i < 10 ? FRI + (i - 5) * 60 : MON + (i - 10) * 3600 }));
  const r = fvgBreak.calculate(bars);
  const bullF = (i: number) => i >= 3 && gt(bars[i - 1].low, bars[i - 3].high);
  const bearF = (i: number) => i >= 3 && lt(bars[i - 1].high, bars[i - 3].low);
  const fridayClose = bars[5].close;
  const mondayOpen = bars[10].open;
  const gap = mondayOpen - fridayClose;
  const buy = timesWhere(bars, (i) => i >= 10 && gt(bars[i].close, mondayOpen + gap) && bullF(i));
  const sell = timesWhere(bars, (i) => i >= 10 && lt(bars[i].close, mondayOpen - gap) && bearF(i));
  it('declares the two conditions of the original', () => {
    expect(decls(fvgBreak)).toEqual([
      ['alert0', 'Fresh Buy Signal', 'Fresh Buy signal based on NWOG breakout and FVG!'],
      ['alert1', 'Fresh Sell Signal', 'Fresh Sell signal based on NWOG breakdown and FVG!'],
    ]);
    expect(fvgBreak.FvgBreakoutBreakdown.alertConditions).toBe(fvgBreak.alertConditions);
  });
  it('fires on the fresh breakouts / breakdowns', () => {
    expect(buy.length).toBeGreaterThan(3);
    expect(sell.length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
    // no NWOG (other times): no signal
    const none = fvgBreak.calculate(walk(300, 47));
    expect(none.alerts[0].times).toEqual([]);
  });
  it('the labels carry shape0..shape3', () => {
    expect(idTimes(r.markers, 'shape0')).toEqual(timesWhere(bars, bullF));
    expect(idTimes(r.markers, 'shape1')).toEqual(timesWhere(bars, bearF));
    expect(idTimes(r.markers, 'shape2')).toEqual(buy);
    expect(idTimes(r.markers, 'shape3')).toEqual(sell);
    expect(r.markers.every((m) => /^shape[0-3]$/.test(m.id ?? ''))).toBe(true);
  });
});

describe('FVG Sessions: alertconditions', () => {
  const bars = walk(1500, 53, 3600);
  it('declares the eight conditions of the original', () => {
    expect(decls(fvgSessions)).toEqual(specDecls('alert', [
      ['Bullish FVG', 'New session bullish fvg'],
      ['Bearish FVG', 'New session bearish fvg'],
      ['Mitigated Bullish FVG', 'Session bullish fvg has been mitigated'],
      ['Mitigated Bearish FVG', 'Session bearish fvg has been mitigated'],
      ['Price Within Bullish FVG', 'Price is within bullish fvg'],
      ['Price Within Bearish FVG', 'Price is within bearish fvg'],
      ['Bullish FVG AVG Cross', 'Price crossed bullish fvg average'],
      ['Bearish FVG AVG Cross', 'Price crossed bearish fvg average'],
    ]));
    expect(fvgSessions.FvgSessions.alertConditions).toBe(fvgSessions.alertConditions);
  });
  it('re-computes the gap of the day and its conditions', () => {
    const day = (i: number) => Math.floor((bars[i].time as number) / 86400);
    const flags: boolean[][] = Array.from({ length: 8 }, () => []);
    let top = NaN, btm = NaN, isbull = false, isnew = true, mitigated = false;
    const avg: number[] = [], bullA: boolean[] = [], newA: boolean[] = [];
    bars.forEach((b, i) => {
      const H2 = i >= 2 ? bars[i - 2].high : NaN, L2 = i >= 2 ? bars[i - 2].low : NaN, C1 = i >= 1 ? bars[i - 1].close : NaN;
      if (i > 0 && day(i) !== day(i - 1)) isnew = true;
      let bn = false, sn = false, bm = false, sm = false;
      if (gt(b.low, H2) && gt(C1, H2) && isnew) { top = b.low; btm = H2; isbull = true; isnew = false; mitigated = false; bn = true; }
      else if (lt(b.high, L2) && lt(C1, L2) && isnew) { top = L2; btm = b.high; isbull = false; isnew = false; mitigated = false; sn = true; }
      if (!mitigated) {
        if (isbull && lt(b.close, btm)) { mitigated = true; bm = true; }
        else if (!isbull && gt(b.close, top)) { mitigated = true; sm = true; }
      }
      const within = ge(b.close, btm) && le(b.close, top) && !isnew;
      [bn, sn, bm, sm, within && isbull, within && !isbull].forEach((v, k) => flags[k].push(v));
      avg.push((top + btm) / 2);
      bullA.push(isbull);
      newA.push(isnew);
    });
    const close = bars.map((b) => b.close);
    const ov = crossover(close, avg), un = crossunder(close, avg);
    flags[6] = bars.map((_b, i) => (ov[i] || un[i]) && bullA[i] && !newA[i]);
    flags[7] = bars.map((_b, i) => (ov[i] || un[i]) && !bullA[i] && !newA[i]);
    const r = fvgSessions.calculate(bars);
    flags.forEach((f, k) => {
      expect(boolTimes(bars, f).length).toBeGreaterThan(2);
      expect(r.alerts[k].times).toEqual(boolTimes(bars, f));
    });
  });
});

describe('FX Market Sessions: alertconditions, alert() calls and shape ids', () => {
  // 15-minute bars from 2020-01-01 00:00 UTC
  const bars = walk(1500, 59, 900, 0.3);
  const r = fxSessions.calculate(bars, { alert3Show: true, sess1Op: 'Yes' });
  it('declares the 16 conditions of the original (default message) and the alert() calls', () => {
    const titles: [string, string][] = [];
    for (let k = 1; k <= 4; k++) titles.push([`Session #${k} started`, 'Alert Fired!'], [`Session #${k} ended`, 'Alert Fired!']);
    for (let k = 1; k <= 4; k++) {
      titles.push([`Session #${k} High crossed (after session closed)`, 'Alert Fired!'],
        [`Session #${k} Low crossed (after session closed)`, 'Alert Fired!']);
    }
    expect(decls(fxSessions)).toEqual(specDecls('alert', titles));
    expect(fxSessions.FxMarketSessions.alertConditions).toBe(fxSessions.alertConditions);
    expect(fxSessions.hasAlertFunction).toBe(true);
    expect(fxSessions.FxMarketSessions.hasAlertFunction).toBe(true);
  });
  it('the session starts / ends follow the session hours (UTC)', () => {
    const hours: [number, number][] = [[8, 17], [13, 22], [0, 9], [20, 5]];
    hours.forEach(([s, e], k) => {
      const minute = (t: number) => Math.floor((t % 86400) / 60);
      const inS = (t: number) => (s < e ? minute(t) >= s * 60 && minute(t) < e * 60 : minute(t) >= s * 60 || minute(t) < e * 60);
      const flags = bars.map((b) => inS(b.time as number));
      const started = timesWhere(bars, (i) => flags[i] && !(i > 0 && flags[i - 1]));
      const ended = timesWhere(bars, (i) => !flags[i] && i > 0 && flags[i - 1]);
      expect(started.length).toBeGreaterThan(10);
      expect(r.alerts[2 * k].times).toEqual(started);
      expect(r.alerts[2 * k + 1].times).toEqual(ended);
      // High / low crossed after the session: the crossing runs on the bars outside the session only
      const high = values(r.plots[`plot${2 * k}`]);
      const low = values(r.plots[`plot${2 * k + 1}`]);
      const hi: boolean[] = new Array(bars.length).fill(false), lo: boolean[] = new Array(bars.length).fill(false);
      let prev = -1;
      bars.forEach((b, i) => {
        if (flags[i]) return;
        if (prev >= 0) {
          hi[i] = b.close > high[i] && bars[prev].close <= high[prev];
          lo[i] = b.close < low[i] && bars[prev].close >= low[prev];
        }
        prev = i;
      });
      expect(r.alerts[8 + 2 * k].times).toEqual(boolTimes(bars, hi));
      expect(r.alerts[9 + 2 * k].times).toEqual(boolTimes(bars, lo));
      // the triangles of the same conditions carry shape<2k> / shape<2k + 1>
      expect(idTimes(r.markers, `shape${2 * k}`)).toEqual(boolTimes(bars, hi));
      expect(idTimes(r.markers, `shape${2 * k + 1}`)).toEqual(boolTimes(bars, lo));
    });
    expect(r.alerts.slice(8).some((a) => a.times.length > 0)).toBe(true);
    expect(r.markers.every((m) => /^shape[0-7]$/.test(m.id ?? ''))).toBe(true);
    // the conditions do not depend on the shown alerts
    const off = fxSessions.calculate(bars);
    expect(off.alerts).toEqual(r.alerts);
    expect(off.markers).toEqual([]);
  });
  it("alert('Opening range is fixed.') on the bar that fixes the opening range of session #1", () => {
    // 15 minutes on 15-minute bars: the range is fixed on the second bar of the session
    const expected = r.alerts[0].times.map((t) => t + 900).filter((t) => bars.some((b) => b.time === t));
    expect(r.alertCalls.map((c) => c.time)).toEqual(expected);
    expect(r.alertCalls.length).toBeGreaterThan(10);
    expect(r.alertCalls.every((c) => c.message === 'Opening range is fixed.' && c.freq === 'once_per_bar')).toBe(true);
    expect(fxSessions.calculate(bars).alertCalls).toEqual([]);
  });
});

describe('FXN - Asian Session Range: alertcondition and background ids', () => {
  // 15-minute bars from 2020-01-01 00:00 UTC; without a chart context the sessions are the input hours + 4 in UTC
  const bars = walk(1500, 61, 900, 0.3);
  const r = fxn.calculate(bars);
  const minute = (t: number) => Math.floor((t % 86400) / 60);
  // 1970-01-01 is a Thursday
  const weekday = (t: number) => (Math.floor(t / 86400) + 4) % 7;
  const weekdays = (t: number) => weekday(t) >= 1 && weekday(t) <= 5;
  const asian = (t: number) => weekdays(t) && minute(t) < 6 * 60;
  it('declares the condition of the original', () => {
    expect(decls(fxn)).toEqual([['alert0', 'Asian Range Break', 'Price has closed outside the Asian Session Range.']]);
    expect(fxn.FxnAsianSessionRange.alertConditions).toBe(fxn.alertConditions);
  });
  it('fires when a close crosses the Asian range in the tradable session', () => {
    let lo = NaN, hi = NaN;
    const flags = bars.map((b, i) => {
      const t = b.time as number;
      if (asian(t)) {
        const open = minute(t) === 0;
        lo = open ? b.low : Math.min(lo, b.low);
        hi = open ? b.high : Math.max(hi, b.high);
      }
      const trd = weekdays(t) && minute(t) >= 6 * 60 && minute(t) < 16 * 60;
      const pc = i > 0 ? bars[i - 1].close : NaN;
      return trd && ((ge(pc, lo) && lt(b.close, lo)) || (le(pc, hi) && gt(b.close, hi)));
    });
    expect(boolTimes(bars, flags).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(boolTimes(bars, flags));
  });
  it('the session backgrounds carry bgcolor0..bgcolor2', () => {
    expect(idTimes(r.bgColors, 'bgcolor0')).toEqual(timesWhere(bars, (i) => asian(bars[i].time as number)));
    for (const id of ['bgcolor1', 'bgcolor2']) expect(idTimes(r.bgColors, id).length).toBeGreaterThan(0);
    expect(r.bgColors.every((b) => ['bgcolor0', 'bgcolor1', 'bgcolor2'].includes(b.id ?? ''))).toBe(true);
  });
});
