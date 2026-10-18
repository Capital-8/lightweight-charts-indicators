/**
 * Community ports, batch 32: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression, or from the outputs that draw the
 * same condition), the alert() calls, and the Style ids on the emitted markers / arrows / background colours.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, str, color, type Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/chart-context';
import * as renkoFlip from '../../src/community/renko-flip-alert';
import * as renkoRmi from '../../src/community/renko-moving-average-rmi-alert-r3-by';
import * as renkoSniper from '../../src/community/renko-sniper-pro';
import * as retail from '../../src/community/retail-vs-banker-net-positions-symmetry-break';
import * as retest from '../../src/community/retest-support-resistance-signals';
import * as rcp from '../../src/community/reversal-correlation-pressure';
import * as revSig from '../../src/community/reversal-signals';
import * as rmaAtr from '../../src/community/rma-atr-bands';
import * as rmiSniper from '../../src/community/rmi-trend-sniper';
import * as robby from '../../src/community/robby-dss-bressert-colored-dots';
import * as rocw from '../../src/community/roc-weighted-ma-oscillator';
import * as sharpe from '../../src/community/rolling-sharpe-ratio-oscillator-astral-vision';
import * as rrr from '../../src/community/rrr-ema-ignition-buy-sell';
import * as rsi5 from '../../src/community/rsi-5up';
import * as rsiAdx1 from '../../src/community/rsi-adx-atr-18-01-25';
import * as rsiAdx2 from '../../src/community/rsi-adx-atr-combo';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'renko-flip-alert': [
    ['alert0', 'Bullish Renko Flip', 'Bullish Renko flip on {{ticker}} @ {{close}}'],
    ['alert1', 'Bearish Renko Flip', 'Bearish Renko flip on {{ticker}} @ {{close}}'],
  ],
  'retail-vs-banker-net-positions-symmetry-break': [
    ['alert0', 'Retail Flip: Red → Green', 'Retail (proxy) crossed above zero — color changed from red to green.'],
    ['alert1', 'Retail Flip: Green → Red', 'Retail (proxy) crossed below zero — color changed from green to red.'],
    ['alert2', 'Retail Flip: Either Direction', 'Retail (proxy) changed color (crossed the zero line).'],
    ['alert3', 'Institutional Extreme HIGH', 'Institutional proxy reached an extreme HIGH (pivot/window).'],
    ['alert4', 'Institutional Extreme LOW', 'Institutional proxy reached an extreme LOW (pivot/window).'],
    ['alert5', 'Symmetry Break (Institution)', 'Institution line made a sudden, outsized move while Retail was quiet or opposite (symmetry broken).'],
  ],
  'retest-support-resistance-signals': [
    ['alert0', 'New Support Re-Test', 'Alert Fired!'],
    ['alert1', 'New Resistance Re-Test', 'Alert Fired!'],
    ['alert2', 'Support Re-Test Downside Break', 'Alert Fired!'],
    ['alert3', 'Support Re-Test Upside Break', 'Alert Fired!'],
    ['alert4', 'Resistance Re-Test Downside Break', 'Alert Fired!'],
    ['alert5', 'Resistance Re-Test Upside Break', 'Alert Fired!'],
    ['alert6', 'Any Downside Break', 'Alert Fired!'],
    ['alert7', 'Any Upside Break', 'Alert Fired!'],
  ],
  'rma-atr-bands': [
    ['alert0', 'RMA ATR Bands Long', 'RMA ATR Bands Long Signal on {{ticker}}'],
    ['alert1', 'RMA ATR Bands Short', 'RMA ATR Bands Short Signal on {{ticker}}'],
  ],
  'rmi-trend-sniper': [['alert0', 'BUY', 'Alert Fired!'], ['alert1', 'SELL', 'Alert Fired!']],
  'roc-weighted-ma-oscillator': [
    ['alert0', 'ROC Weighted MA Postive Trend', 'ROC Weighted MA Bullish Signal on: {{exchange}}:{{ticker}}'],
    ['alert1', 'ROC Weighted MA Negative Trend', 'ROC Weighted MA Bearish Signal on: {{exchange}}:{{ticker}}'],
  ],
  'rrr-ema-ignition-buy-sell': [['alert0', 'BUY Alert', 'RRR EMA Ignition BUY'], ['alert1', 'SELL Alert', 'RRR EMA Ignition SELL']],
  'rsi-5up': [
    ['alert0', 'Regular Bullish Divergence', 'Found a new Regular Bullish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.'],
    ['alert1', 'Regular Bearish Divergence', 'Found a new Regular Bearish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar.'],
  ],
  'rsi-adx-atr-18-01-25': [
    ['alert0', 'RSI, ADX, and ATR Condition Met', 'RSI is between custom bounds, ADX is below the threshold, and ATR is below the threshold.'],
  ],
  'rsi-adx-atr-combo': [['alert0', 'All Conditions Met', 'RSI, ADX, and ATR conditions are all satisfied.']],
};

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

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
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
type M = { time: unknown; id?: string; text?: string; position?: string; shape?: string };
const idTimes = (ms: M[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);
const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const union = (a: number[], b: number[]) => uniq([...a, ...b]);
const indexOf = new Map(bars.map((b, i) => [b.time as number, i]));
const chart = { tickerid: 'NASDAQ:TEST', mintick: 0.01 } as ChartContext;

describe('declarations', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'renko-flip-alert': renkoFlip,
    'retail-vs-banker-net-positions-symmetry-break': retail,
    'retest-support-resistance-signals': retest,
    'rma-atr-bands': rmaAtr,
    'rmi-trend-sniper': rmiSniper,
    'roc-weighted-ma-oscillator': rocw,
    'rrr-ema-ignition-buy-sell': rrr,
    'rsi-5up': rsi5,
    'rsi-adx-atr-18-01-25': rsiAdx1,
    'rsi-adx-atr-combo': rsiAdx2,
  };
  for (const [id, m] of Object.entries(mods)) {
    it(`${id}: the original's alertconditions`, () => expect(decls(m)).toEqual(SPEC[id]));
  }
  it('the indicator objects carry the new exports', () => {
    expect(renkoFlip.RenkoFlipAlert.alertConditions).toBe(renkoFlip.alertConditions);
    expect(retail.RetailVsBankerNetPositionsSymmetryBreak.alertConditions).toBe(retail.alertConditions);
    expect(retest.RetestSupportResistanceSignals.alertConditions).toBe(retest.alertConditions);
    expect(rmaAtr.RMAATRBands.alertConditions).toBe(rmaAtr.alertConditions);
    expect(rmiSniper.RMITrendSniper.alertConditions).toBe(rmiSniper.alertConditions);
    expect(rocw.RocWeightedMAOscillator.alertConditions).toBe(rocw.alertConditions);
    expect(rrr.RrrEmaIgnitionBuySell.alertConditions).toBe(rrr.alertConditions);
    expect(rsi5.Rsi5Up.alertConditions).toBe(rsi5.alertConditions);
    expect(rsiAdx1.RsiAdxAtr180125.alertConditions).toBe(rsiAdx1.alertConditions);
    expect(rsiAdx2.RsiAdxAtrCombo.alertConditions).toBe(rsiAdx2.alertConditions);
    expect(renkoSniper.hasAlertFunction).toBe(true);
    expect(renkoSniper.RenkoSniperPro.hasAlertFunction).toBe(true);
    expect(revSig.hasAlertFunction).toBe(true);
    expect(revSig.ReversalSignals.hasAlertFunction).toBe(true);
  });
});

describe('Renko Flip Alert', () => {
  it('bull / bear flips on closed bars', () => {
    const bull = bars.map((b, i) => i > 0 && gt(b.close, b.open) && lt(bars[i - 1].close, bars[i - 1].open));
    const bear = bars.map((b, i) => i > 0 && lt(b.close, b.open) && gt(bars[i - 1].close, bars[i - 1].open));
    const r = renkoFlip.calculate(bars);
    expect(times(r, 0)).toEqual(timeAt(bars, bull));
    expect(times(r, 1)).toEqual(timeAt(bars, bear));
    expect(times(r, 0).length).toBeGreaterThan(50);
    // barstate.isconfirmed: not on an open last bar
    const last = [...bars.slice(0, -2), { ...bars[n - 2], open: 101, close: 100 }, { ...bars[n - 1], open: 100, close: 102 }];
    expect(renkoFlip.calculate(last).alerts[0].triggered).toBe(true);
    expect(renkoFlip.calculate(last, {}, { lastBarConfirmed: false } as ChartContext).alerts[0].triggered).toBe(false);
  });
});

describe('Renko+Moving Average+RMI Alert R3: arrows and exit shapes', () => {
  const rb = walk(1500, 21, 3600, 1577836800, 6);
  for (const inputs of [{}, { udOpen: false }, { exitFirst: true, udOpen: false }] as const) {
    it(`plotarrow outputs as arrows, exits with their shape ids (${JSON.stringify(inputs)})`, () => {
      const r = renkoRmi.calculate(rb, inputs);
      const up = r.arrows.filter((a) => a.id === 'arrow0');
      const down = r.arrows.filter((a) => a.id === 'arrow1');
      expect(up.map((a) => a.time)).toEqual(times(r, 0));
      expect(down.map((a) => a.time)).toEqual(times(r, 1));
      expect(up.length).toBeGreaterThan(0);
      expect(down.length).toBeGreaterThan(0);
      expect(up.every((a) => a.value === 1 && a.color === String(color.new('#00FF00', 20)))).toBe(true);
      expect(down.every((a) => a.value === -1 && a.color === String(color.new('#FF0000', 20)))).toBe(true);
      expect(r.arrows.every((a) => a.id === 'arrow0' || a.id === 'arrow1')).toBe(true);
      expect(idTimes(r.markers, 'shape0')).toEqual(times(r, 2));
      expect(idTimes(r.markers, 'shape1')).toEqual(times(r, 3));
      // no marker stands for the arrows any more; every marker is one of the two exit shapes
      expect(r.markers.every((m) => m.id === 'shape0' || m.id === 'shape1')).toBe(true);
      expect(r.markers.filter((m) => m.id === 'shape0').every((m) => m.text === 'Exit\nBuy' && m.position === 'belowBar')).toBe(true);
      expect(r.markers.filter((m) => m.id === 'shape1').every((m) => m.text === 'Exit\nSell' && m.position === 'aboveBar')).toBe(true);
    });
  }
});

describe('Renko Sniper PRO: alert() calls', () => {
  it('long / short sweep calls as the original computes them (a sweep never happens: no call)', () => {
    const r = renkoSniper.calculate(bars);
    const hh = A(ta.highest(Series.fromArray(bars, bars.map((b) => b.high)), 10));
    const ll = A(ta.lowest(Series.fromArray(bars, bars.map((b) => b.low)), 10));
    const sweepLow = bars.map((b, i) => lt(b.low, ll[i]) && gt(b.close, ll[i]));
    const sweepHigh = bars.map((b, i) => gt(b.high, hh[i]) && lt(b.close, hh[i]));
    // longCondition / shortCondition need a sweep: the window of ta.highest / ta.lowest holds the current bar
    expect(sweepLow.some(Boolean) || sweepHigh.some(Boolean)).toBe(false);
    expect(r.alertCalls).toEqual([]);
  });
});

describe('Retail vs Banker Net Positions: alerts and Style ids', () => {
  const r = retail.calculate(bars);
  const retNet = vals(r.plots.plot1 as { value: number }[]);
  it('retail flips: ta.crossover / ta.crossunder(retNet, 0)', () => {
    const up = retNet.map((v, i) => i > 0 && v > 0 && retNet[i - 1] <= 0);
    const down = retNet.map((v, i) => i > 0 && v < 0 && retNet[i - 1] >= 0);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, down));
    expect(times(r, 2)).toEqual(timeAt(bars, up.map((u, i) => u || down[i])));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });
  it('extremes and symmetry breaks on the bars of their characters / shapes', () => {
    expect(times(r, 3)).toEqual(idTimes(r.markers, 'char2'));
    expect(times(r, 4)).toEqual(idTimes(r.markers, 'char3'));
    expect(times(r, 5)).toEqual(idTimes(r.markers, 'shape4'));
    expect(times(r, 3).length).toBeGreaterThan(0);
    expect(times(r, 4).length).toBeGreaterThan(0);
    // marker ids: one per plotchar / plotshape of the original
    expect(idTimes(r.markers, 'char0')).toEqual(times(r, 0));
    expect(idTimes(r.markers, 'char1')).toEqual(times(r, 1));
    const ids = ['char0', 'char1', 'char2', 'char3', 'shape4'];
    expect(r.markers.every((m) => ids.includes(m.id as string))).toBe(true);
    const text: Record<string, string> = { char0: '▲', char1: '▼', char2: '●', char3: '●', shape4: 'Break' };
    expect(r.markers.every((m) => m.text === text[m.id as string])).toBe(true);
    // pivot extremes: instNet pivots of 8 / 8 bars (de-duplicated by 6 bars)
    const inst = vals(r.plots.plot0 as { value: number }[]);
    for (const t of times(r, 3)) {
      const i = indexOf.get(t)!;
      const c = i - 8;
      for (let k = c - 8; k <= c + 8; k++) if (k !== c) expect(inst[c]).toBeGreaterThanOrEqual(inst[k]);
    }
  });
  it('symmetry breaks fire with a loose setting and stay 40 bars apart', () => {
    const loose = retail.calculate(bars, { zInstCut: 1.5, zGapCut: 0, minInstROC: 0.5 });
    const t = times(loose, 5);
    expect(t.length).toBeGreaterThan(1);
    expect(t).toEqual(idTimes(loose.markers, 'shape4'));
    for (let k = 1; k < t.length; k++) expect(indexOf.get(t[k])! - indexOf.get(t[k - 1])!).toBeGreaterThan(40);
  });
});

describe('Support/Resistance Re-test Finder: alerts', () => {
  const rb = walk(1500, 5);
  for (const inputs of [{}, { flipsUntilDeletion: 3 }, { levelMethod: 'Body' as const, leftBars: 8, rightBars: 8 }]) {
    it(`re-tests on the R labels, breaks combined (${JSON.stringify(inputs)})`, () => {
      const r = retest.calculate(rb, inputs);
      const sup = r.markers.filter((m) => m.position === 'belowBar').map((m) => m.time as number);
      const res = r.markers.filter((m) => m.position === 'aboveBar').map((m) => m.time as number);
      expect(times(r, 0)).toEqual(sup);
      expect(times(r, 1)).toEqual(res);
      expect(times(r, 6)).toEqual(union(times(r, 2), times(r, 4)));
      expect(times(r, 7)).toEqual(union(times(r, 3), times(r, 5)));
      expect(times(r, 0).length).toBeGreaterThan(0);
      expect(times(r, 1).length).toBeGreaterThan(0);
      expect(times(r, 2).length + times(r, 4).length).toBeGreaterThan(0);
      // a support / resistance break comes after a re-test of that kind, never on the same bar (lines start there)
      if (times(r, 2).length) expect(times(r, 2)[0]).toBeGreaterThan(times(r, 0)[0]);
      if (times(r, 5).length) expect(times(r, 5)[0]).toBeGreaterThan(times(r, 1)[0]);
      // support broken downside: the close is below a support line (a line in the result) on that bar
      const lines = (r.lines ?? []) as unknown as { time1: number; price1: number }[];
      for (const t of times(r, 2)) {
        const i = rb.findIndex((b) => b.time === t);
        expect(lines.some((l) => l.time1 < t && lt(rb[i].close, l.price1) && !lt(rb[i - 1].close, l.price1))).toBe(true);
      }
    });
  }
  it('nothing on an open last bar', () => {
    const r = retest.calculate(rb, {}, { lastBarConfirmed: false } as ChartContext);
    expect(r.alerts.every((a) => !a.times.includes(rb[rb.length - 1].time as number))).toBe(true);
  });
});

describe('Reversal Correlation Pressure: arrows', () => {
  it('plotarrow as arrows (arrow0), value = the signal, colours of the original', () => {
    const r = rcp.calculate(walk(1500, 5));
    expect(r.arrows.length).toBeGreaterThan(0);
    expect(r.arrows.every((a) => a.id === 'arrow0' && a.value !== 0)).toBe(true);
    expect(r.arrows.every((a) => a.color === (a.value > 0 ? '#2962ff' : '#e91e63'))).toBe(true);
    expect((r as { markers?: unknown[] }).markers ?? []).toEqual([]);
    expect(r.barColors.map((b) => [b.time, b.color])).toEqual(r.arrows.map((a) => [a.time, a.color]));
  });
});

/** The original's plotshape outputs of Reversal Signals (spec shape0 ... shape55): text and location */
const REV_SHAPES: [string, string][] = (() => {
  const d = ['₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉', '₁₀', '₁₁', '₁₂'];
  const out: [string, string][] = [];
  const momentum = () => {
    for (let k = 0; k < 8; k++) out.push([d[k], 'aboveBar']);
    out.push(['ᵖ\n₈', 'aboveBar']);
  };
  momentum();
  out.push(['', 'belowBar'], ['ᵖ', 'belowBar'], ['', 'belowBar'], ['', 'atPriceMiddle']);
  momentum();
  out.push(['', 'aboveBar'], ['ᵖ', 'aboveBar'], ['', 'aboveBar'], ['', 'atPriceMiddle']);
  for (let k = 0; k < 12; k++) out.push([d[k], 'belowBar']);
  out.push(['₊', 'belowBar'], ['E', 'belowBar']);
  for (let k = 0; k < 12; k++) out.push([d[k], 'belowBar']);
  out.push(['₊', 'belowBar'], ['E', 'aboveBar']);
  out.push(['⇩', 'atPriceMiddle'], ['⇧', 'atPriceMiddle']);
  return out;
})();

describe('Reversal Signals: shape ids and alert() calls', () => {
  const rb = walk(1500, 7);
  it('every marker has the id of its plotshape output (text and place of that output)', () => {
    expect(REV_SHAPES.length).toBe(56);
    const seen = new Set<string>();
    for (const inputs of [{}, { bSh: 'Detailed' as const, eSh: 'Detailed' as const }]) {
      const r = revSig.calculate(rb, inputs, chart);
      for (const m of r.markers) {
        const k = Number(/^shape(\d+)$/.exec(m.id ?? '')?.[1] ?? NaN);
        expect(k).toBeGreaterThanOrEqual(0);
        expect(k).toBeLessThan(54);
        expect([m.text ?? '', m.position]).toEqual(REV_SHAPES[k]);
        seen.add(m.id as string);
      }
    }
    // the detailed counts of both phases are drawn on these bars
    for (const id of ['shape0', 'shape6', 'shape9', 'shape12', 'shape13', 'shape22', 'shape25', 'shape26', 'shape39', 'shape40']) {
      expect(seen.has(id)).toBe(true);
    }
  });
  it('alert() calls: completions, momentum starts and level crosses with the original messages', () => {
    const r = revSig.calculate(rb, {}, chart);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar' && c.message.startsWith('TEST '))).toBe(true);
    const callTimes = (s: string) => r.alertCalls.filter((c) => c.message.includes(s)).map((c) => c.time);
    // S.bSC == 9 and cmpltd: the bars of the completed (or perfect) bullish phase shapes
    expect(callTimes(' bullish momentum phase completion detected')).toEqual(union(idTimes(r.markers, 'shape9'), idTimes(r.markers, 'shape10')));
    expect(callTimes(' bearish momentum phase completion detected')).toEqual(union(idTimes(r.markers, 'shape22'), idTimes(r.markers, 'shape23')));
    expect(callTimes(' bullish trend exhaustion phase completion detected')).toEqual(idTimes(r.markers, 'shape39'));
    expect(callTimes(' bearish trend exhaustion phase completion detected')).toEqual(idTimes(r.markers, 'shape53'));
    expect(callTimes(' bullish momentum phase completion detected').length).toBeGreaterThan(0);
    // bSR > 0 and bSR[1] == 0 / f_xLX(close, bSR) from the resistance plot (na plot after the first level = 0)
    const bSR = vals(r.plots.plot0 as { value: number }[]);
    const first = bSR.findIndex((v) => !isNaN(v));
    const start = bSR.map((v, i) => i > first && !isNaN(v) && isNaN(bSR[i - 1]));
    expect(callTimes(' bearish momentum detected')).toEqual(timeAt(rb, start));
    const cross = bSR.map((l, i) => i > 0 && !isNaN(l)
      && ((gt(l, rb[i].close) && lt(l, rb[i - 1].close)) || (lt(l, rb[i].close) && gt(l, rb[i - 1].close))));
    // (a close above the level resets it on that bar: the original's cross alert cannot fire on the resistance)
    expect(callTimes(' crossing resistance level detected')).toEqual(timeAt(rb, cross));
    const comp = r.alertCalls.find((c) => c.message.includes(' bullish momentum phase completion'))!;
    const pi = rb.findIndex((b) => b.time === comp.time);
    expect(comp.message).toBe(`TEST bullish momentum phase completion detected, price ${str.tostring(rb[pi].close, 'mintick', 0.01)}`);
    // cmpltd is the exhaustion display: no completion call with the detailed display
    const det = revSig.calculate(rb, { eSh: 'Detailed' }, chart);
    expect(det.alertCalls.some((c) => c.message.includes('completion detected'))).toBe(false);
  });
  it('trade setup calls on the bars of the L / S labels', () => {
    const r = revSig.calculate(rb, { tso: 'Momentum' }, chart);
    const labelTimes = (t: string) => r.labels.filter((l) => l.text === t).map((l) => l.time as number);
    const callTimes = (s: string) => r.alertCalls.filter((c) => c.message.startsWith(s)).map((c) => c.time);
    expect(callTimes('TEST : Short Trade Setup')).toEqual(labelTimes('S'));
    expect(callTimes('TEST : Long Trade Setup')).toEqual(labelTimes('L'));
    expect(labelTimes('L').length).toBeGreaterThan(0);
    const l = r.labels.find((x) => x.text === 'L')!;
    const call = r.alertCalls.find((c) => c.time === l.time && c.message.startsWith('TEST : Long'))!;
    const i = rb.findIndex((b) => b.time === l.time);
    const tt = (l.tooltip as string).replace('\n\nnot a finacial advice, subject to high risk', '');
    expect(call.message).toBe(`TEST : ${tt}\n Price    : ${str.tostring(rb[i].close, 'mintick', 0.01)}\n\nnot a finacial advice, subject to high risk`);
  });
});

describe('RMA ATR Bands: alerts', () => {
  it('trend turns from the original expressions', () => {
    const ma = A(ta.rma(Series.fromArray(bars, bars.map((b) => b.high)), 14));
    const atr = A(ta.atr(bars, 13));
    let trend = 0;
    let prev = NaN;
    const long: boolean[] = [], short: boolean[] = [];
    bars.forEach((b, i) => {
      if (gt(b.close, ma[i] + atr[i] * 0.4)) trend = 1;
      if (lt(b.close, ma[i] - atr[i] * 1.6)) trend = -1;
      long.push(trend === 1 && !isNaN(prev) && prev !== 1);
      short.push(trend === -1 && !isNaN(prev) && prev !== -1);
      prev = trend;
    });
    const r = rmaAtr.calculate(bars);
    expect(times(r, 0)).toEqual(timeAt(bars, long));
    expect(times(r, 1)).toEqual(timeAt(bars, short));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });
});

describe('RMI Trend Sniper: alerts', () => {
  it('positive / negative turns (the candle colour gives the state)', () => {
    const r = rmiSniper.calculate(bars) as unknown as Alerts & { barColors: { time: number; color: string }[]; labels: { time: number; style: string }[] };
    const pos = new Array<boolean>(n).fill(false);
    const neg = new Array<boolean>(n).fill(false);
    for (const b of r.barColors) {
      const i = indexOf.get(b.time)!;
      if (b.color === '#4CAF50') pos[i] = true;
      else neg[i] = true;
    }
    expect(times(r, 0)).toEqual(timeAt(bars, pos.map((p, i) => p && !(i > 0 && pos[i - 1]))));
    expect(times(r, 1)).toEqual(timeAt(bars, neg.map((v, i) => v && !(i > 0 && neg[i - 1]))));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    // the labels mark the same turns once the band is drawn
    const after = (a: number[]) => a.filter((t) => indexOf.get(t)! > 60);
    expect(after(r.labels.filter((l) => l.style === 'label_up').map((l) => l.time))).toEqual(after(times(r, 0)));
    expect(after(r.labels.filter((l) => l.style === 'label_down').map((l) => l.time))).toEqual(after(times(r, 1)));
  });
});

describe('Robby DSS: palette', () => {
  it('the dots use the two colours of the original (one string each)', () => {
    const r = robby.calculate(bars, { emaPeriod: 10, stoPeriod: 20 });
    const cols = new Set((r.plots.plot0 as { color: string }[]).map((p) => p.color));
    expect([...cols].sort()).toEqual([color.lime, color.red].sort());
  });
});

describe('ROC-Weighted MA Oscillator: alerts', () => {
  it('oscillator above / below the neutral threshold', () => {
    const r = rocw.calculate(bars);
    const osc = vals(r.plots.plot0 as { value: number }[]);
    expect(times(r, 0)).toEqual(timeAt(bars, osc.map((o) => gt(o, 0.5))));
    expect(times(r, 1)).toEqual(timeAt(bars, osc.map((o) => lt(o, 0.5))));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });
});

describe('Rolling Sharpe Ratio Oscillator: bgcolor ids', () => {
  it('bgcolor0 below the oversold threshold, bgcolor1 above the overbought one', () => {
    const r = sharpe.calculate(bars, { len: 60, smoothLen: 5, threshOs: -0.5, threshOb: 0.5 });
    const ss = vals(r.plots.plot2 as { value: number }[]);
    expect(r.bgColors.every((b) => b.id === 'bgcolor0' || b.id === 'bgcolor1')).toBe(true);
    expect(idTimes(r.bgColors as M[], 'bgcolor0')).toEqual(timeAt(bars, ss.map((v) => lt(v, -0.5))));
    expect(idTimes(r.bgColors as M[], 'bgcolor1')).toEqual(timeAt(bars, ss.map((v) => gt(v, 0.5))));
    expect(idTimes(r.bgColors as M[], 'bgcolor0').length).toBeGreaterThan(0);
    expect(idTimes(r.bgColors as M[], 'bgcolor1').length).toBeGreaterThan(0);
  });
});

describe('RRR EMA Ignition: alerts', () => {
  it('BUY / SELL on the bars of the BUY / SELL labels', () => {
    const rb = walk(1500, 3, 86400, 1577836800, 3);
    const r = rrr.calculate(rb);
    expect(times(r, 0)).toEqual(r.markers.filter((m) => m.text === 'BUY').map((m) => m.time));
    expect(times(r, 1)).toEqual(r.markers.filter((m) => m.text === 'SELL').map((m) => m.time));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    // buySignal: close > ema55, ema9 > ema21, a green candle
    const e9 = vals(r.plots.plot0 as { value: number }[]);
    const e21 = vals(r.plots.plot1 as { value: number }[]);
    const e55 = vals(r.plots.plot2 as { value: number }[]);
    for (const t of times(r, 0)) {
      const i = rb.findIndex((b) => b.time === t);
      expect(gt(rb[i].close, e55[i]) && gt(e9[i], e21[i]) && gt(rb[i].close, rb[i].open) && gt(e55[i], e55[i - 2])).toBe(true);
    }
    // every signal bar is either a BUY or a SELL
    const ev = [...times(r, 0).map((t) => [t, 'b'] as const), ...times(r, 1).map((t) => [t, 's'] as const)].sort((a, b) => a[0] - b[0]);
    expect(ev.length).toBe(times(r, 0).length + times(r, 1).length);
  });
});

describe('RSI - 5UP: divergence alerts', () => {
  it('on the confirming bar, 5 bars after the Bull / Bear label', () => {
    const r = rsi5.calculate(bars, { calculateDivergence: true });
    const shifted = (text: string) => r.markers.filter((m) => m.text === text)
      .map((m) => bars[indexOf.get(m.time as number)! + 5].time as number);
    expect(times(r, 0)).toEqual(shifted(' Bull '));
    expect(times(r, 1)).toEqual(shifted(' Bear '));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    const off = rsi5.calculate(bars);
    expect(off.alerts.every((a) => a.times.length === 0)).toBe(true);
  });
});

describe('RSI + ADX + ATR: alerts', () => {
  it('18-01-25: RSI between the bounds, ADX and ATR under their thresholds', () => {
    const r = rsiAdx1.calculate(bars, { atrThreshold: 5.5, adxThreshold: 30 });
    const [rsi, adx, atr] = ['plot0', 'plot1', 'plot2'].map((k) => vals(r.plots[k] as { value: number }[]));
    const cond = rsi.map((v, i) => gt(v, 40) && lt(v, 60) && lt(adx[i], 30) && lt(atr[i], 5.5));
    expect(times(r, 0)).toEqual(timeAt(bars, cond));
    expect(times(r, 0)).toEqual(r.bgColors.map((b) => b.time));
    expect(times(r, 0).length).toBeGreaterThan(0);
  });
  it('combo: rsiCond and adxCond and atrCond', () => {
    const r = rsiAdx2.calculate(bars, { atrThreshold: 5.5, adxThreshold: 30 });
    const rsi = A(ta.rsi(Series.fromArray(bars, close), 14));
    const [adx, atr] = ['plot1', 'plot2'].map((k) => vals(r.plots[k] as { value: number }[]));
    const cond = rsi.map((v, i) => gt(v, 40) && lt(v, 60) && lt(adx[i], 30) && lt(atr[i], 5.5));
    expect(times(r, 0)).toEqual(timeAt(bars, cond));
    expect(times(r, 0)).toEqual(r.bgColors.map((b) => b.time));
    expect(times(r, 0).length).toBeGreaterThan(0);
  });
});
