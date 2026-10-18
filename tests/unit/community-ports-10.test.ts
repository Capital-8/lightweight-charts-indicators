/**
 * Community ports, batch 10: the alertcondition() declarations and the bars on which each condition is true
 * (re-computed here from the original's expression), the alert() calls, and the Style ids on the emitted markers /
 * background colours.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as decode from '../../src/community/decode-moving-average-toolkit';
import * as deltaZones from '../../src/community/delta-zones-buy-sell-pressure';
import * as demaFlow from '../../src/community/dema-flow';
import * as devTrend from '../../src/community/deviation-trend-profile';
import * as dix from '../../src/community/directional-indicator-crossovers-v1';
import * as dlo from '../../src/community/directional-logistic-oscillator';
import * as divV3 from '../../src/community/divergence-for-many-indicator-v3';
import * as divV4 from '../../src/community/divergence-for-many-indicators-v4';
import * as divInd from '../../src/community/divergence-indicator';
import * as divScreener from '../../src/community/divergence-screener';
import * as dmiHist from '../../src/community/dmi-histogram-indicator';
import * as dopeDpo from '../../src/community/dope-dpo';
import * as doubleMacd from '../../src/community/double-macd';
import * as doubleRsi from '../../src/community/double-rsi';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Seeded random walk of bars (`step` seconds apart) with a random volume */
function walk(count: number, seed0: number, step = 86400, scale = 1): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5 * scale;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 * scale + (rnd() - 0.5) * 4 * scale);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({
      time: 1577836800 + i * step, open: o, high: Math.max(o, p) + rnd() * 1.5 * scale,
      low: Math.min(o, p) - rnd() * 1.5 * scale, close: p, volume,
    });
  }
  return out;
}
/** Bars with long random wicks (the lows / highs do not follow the closes) */
function wicky(count: number, seed0: number): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5);
    p = Math.max(5, o + Math.sin(i / 9) * 1.5 + (rnd() - 0.5) * 2);
    out.push({
      time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * 8, low: Math.min(o, p) - rnd() * 8,
      close: p, volume: 1e6,
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
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const sec = (t: number) => (t >= 1e12 ? t / 1000 : t);
const isSubset = (a: number[], b: number[]) => a.every((t) => b.includes(t));

describe('DECODE Moving Average Toolkit: alertconditions and Style ids', () => {
  const bars = walk(1200, 7);
  it('declares the ten conditions of the original (placeholders kept)', () => {
    const expected = [1, 2, 3, 4, 5].flatMap((k) => [
      [`alert${2 * k - 2}`, `Alert ${k} Bullish Cross`, `{{ticker}}: Configured Fast MA crossed above Configured Slow MA (Alert ${k})`],
      [`alert${2 * k - 1}`, `Alert ${k} Bearish Cross`, `{{ticker}}: Configured Fast MA crossed below Configured Slow MA (Alert ${k})`],
    ]);
    expect(decls(decode)).toEqual(expected);
    expect(decode.DecodeMovingAverageToolkit.alertConditions).toBe(decode.alertConditions);
  });
  it('fires on the crosses of the enabled alerts only, symbols shown or not', () => {
    const r = decode.calculate(bars);
    const e1 = values(r.plots.plot0), e2 = values(r.plots.plot1), s3 = values(r.plots.plot7), s5 = values(r.plots.plot9);
    const bull1 = boolTimes(bars, crossover(e1, e2));
    const bear1 = boolTimes(bars, crossunder(e1, e2));
    expect(bull1.length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(bull1);
    expect(r.alerts[1].times).toEqual(bear1);
    expect(r.alerts[8].times).toEqual(boolTimes(bars, crossover(s3, s5)));
    expect(r.alerts[9].times).toEqual(boolTimes(bars, crossunder(s3, s5)));
    for (const k of [2, 3, 4, 5, 6, 7]) expect(r.alerts[k].times).toEqual([]);
    // Alert 2 (EMA 2 / EMA 3) enabled, its symbols hidden
    const r2 = decode.calculate(bars, { alert2Enable: true });
    const e3 = values(r2.plots.plot2);
    expect(r2.alerts[2].times).toEqual(boolTimes(bars, crossover(e2, e3)));
    expect(r2.alerts[3].times).toEqual(boolTimes(bars, crossunder(e2, e3)));
    expect(idTimes(r2.markers, 'shape2')).toEqual([]);
    // Alert 1 disabled: no condition, no symbol
    const r3 = decode.calculate(bars, { alert1Enable: false });
    expect(r3.alerts[0].times).toEqual([]);
    expect(idTimes(r3.markers, 'shape0')).toEqual([]);
  });
  it('the alert symbols carry shape<2k-2> (bullish) / shape<2k-1> (bearish)', () => {
    const r = decode.calculate(bars, {
      alert2Enable: true, alert2ShowSymbol: true, alert3Enable: true, alert3ShowSymbol: true,
      alert4Enable: true, alert4ShowSymbol: true,
    });
    for (let k = 0; k < 10; k++) {
      expect(idTimes(r.markers, `shape${k}`)).toEqual(r.alerts[k].times);
    }
    expect(r.markers.length).toBeGreaterThan(30);
    const ids = new Set(Array.from({ length: 10 }, (_, k) => `shape${k}`));
    expect(r.markers.every((m) => ids.has(m.id as string))).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape4').every((m) => m.text === 'A3 ▲')).toBe(true);
  });
});

describe('Delta Zones Buy/Sell Pressure: alertconditions', () => {
  it('declares the four conditions of the original', () => {
    expect(decls(deltaZones)).toEqual([
      ['alert0', 'Buy Pressure Alert', 'Buy pressure detected!'],
      ['alert1', 'Sell Pressure Alert', 'Sell pressure detected!'],
      ['alert2', 'HTF Buy Zone Alert', 'HTF Buy zone appeared!'],
      ['alert3', 'HTF Sell Zone Alert', 'HTF Sell zone appeared!'],
    ]);
    expect(deltaZones.DeltaZonesBuySellPressure.alertConditions).toBe(deltaZones.alertConditions);
  });
  it('buy / sell pressure: delta beyond its standard deviation times the level', () => {
    const bars = walk(1200, 21);
    const r = deltaZones.calculate(bars, { stddevlevel: 2 });
    const pos: number[] = [], neg: number[] = [];
    for (const b of bars) {
      const upD = (b.open - b.low) - (b.high - b.close);
      const dnD = (b.high - b.open) - (b.close - b.low);
      const d = Math.abs(upD) > EPS ? upD : Math.abs(dnD) > EPS ? dnD : NaN;
      pos.push(gt(d, 0) ? d : NaN);
      neg.push(lt(d, 0) ? d : NaN);
    }
    const sdP = A(ta.stdev(Series.fromArray(bars, pos), 20));
    const sdN = A(ta.stdev(Series.fromArray(bars, neg), 20));
    const buy = timesWhere(bars, (i) => !isNaN(pos[i]) && !isNaN(sdP[i]) && !lt(pos[i], sdP[i] * 2));
    const sell = timesWhere(bars, (i) => !isNaN(neg[i]) && !isNaN(sdN[i]) && !gt(neg[i], sdN[i] * -2));
    expect(buy.length).toBeGreaterThan(5);
    expect(sell.length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
    // same bars as the triangles
    expect(r.markers.filter((m) => m.shape === 'triangleUp').map((m) => m.time)).toEqual(buy);
    expect(r.alerts[2].times).toEqual([]);
    expect(r.alerts[3].times).toEqual([]);
  });
  it('HTF zones: on the bars where a higher timeframe zone appears (its label)', () => {
    const bars = walk(1500, 9, 300, 0.2);
    const r = deltaZones.calculate(bars, { showHTFBoxes: true, htfTimeframe: '60', stddevlevel: 1.5 });
    const buyLabels = r.labels.filter((l) => l.text.endsWith('m BUY')).map((l) => sec(l.time));
    const sellLabels = r.labels.filter((l) => l.text.endsWith('m SELL')).map((l) => sec(l.time));
    expect(buyLabels.length).toBeGreaterThan(2);
    expect(sellLabels.length).toBeGreaterThan(2);
    expect(r.alerts[2].times).toEqual(buyLabels);
    expect(r.alerts[3].times).toEqual(sellLabels);
    // showBuyBoxes off: no HTF buy zone
    const r2 = deltaZones.calculate(bars, { showHTFBoxes: true, htfTimeframe: '60', stddevlevel: 1.5, showBuyBoxes: false });
    expect(r2.alerts[2].times).toEqual([]);
    expect(r2.alerts[3].times).toEqual(sellLabels);
  });
});

describe('DEMA Flow: alertconditions', () => {
  const bars = walk(1500, 13);
  it('declares the two conditions of the original', () => {
    expect(decls(demaFlow)).toEqual([
      ['alert0', 'DEMA Trend Bullish', 'DEMA Trend: Turned Bullish ▲'],
      ['alert1', 'DEMA Trend Bearish', 'DEMA Trend: Turned Bearish ▼'],
    ]);
    expect(demaFlow.DemaFlow.alertConditions).toBe(demaFlow.alertConditions);
  });
  it('fires when the trend signal crosses 0', () => {
    const r = demaFlow.calculate(bars);
    const smooth = values(r.plots.plot0);
    const atr = A(ta.atr(bars, 14));
    const trend: number[] = [];
    let t = 0;
    bars.forEach((b, i) => {
      if (gt(b.close, smooth[i] + 2.1 * atr[i])) t = 1;
      if (lt(b.close, smooth[i] - 1.5 * atr[i])) t = -1;
      trend.push(t);
    });
    const bull = boolTimes(bars, crossover(trend, 0));
    const bear = boolTimes(bars, crossunder(trend, 0));
    expect(bull.length).toBeGreaterThan(5);
    expect(bear.length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(bull);
    expect(r.alerts[1].times).toEqual(bear);
  });
});

describe('Deviation Trend Profile: Style ids', () => {
  const bars = walk(1500, 17);
  it('the turn circles carry shape0 / shape1 (up, tiny / small) and shape2 / shape3 (down)', () => {
    const r = devTrend.calculate(bars);
    expect(r.markers.length).toBeGreaterThan(4);
    expect(r.markers.every((m) => ['shape0', 'shape1', 'shape2', 'shape3'].includes(m.id as string))).toBe(true);
    expect(idTimes(r.markers, 'shape0')).toEqual(idTimes(r.markers, 'shape1'));
    expect(idTimes(r.markers, 'shape2')).toEqual(idTimes(r.markers, 'shape3'));
    expect(idTimes(r.markers, 'shape0').length).toBeGreaterThan(1);
    expect(idTimes(r.markers, 'shape2').length).toBeGreaterThan(1);
    for (const m of r.markers) {
      expect(m.size).toBe(m.id === 'shape0' || m.id === 'shape2' ? 'tiny' : 'small');
    }
    // up and down turns alternate
    const turns = r.markers.filter((m) => m.id === 'shape0' || m.id === 'shape2').map((m) => m.id);
    for (let k = 1; k < turns.length; k++) expect(turns[k]).not.toBe(turns[k - 1]);
  });
});

describe('Directional Indicator Crossovers v1: alertconditions', () => {
  const bars = walk(1200, 19);
  it('declares the two conditions of the original', () => {
    expect(decls(dix)).toEqual([
      ['alert0', 'Bullish DI Crossover', 'Bullish DI crossover (+DI over -DI).'],
      ['alert1', 'Bearish DI Crossover', 'Bearish DI crossover (-DI over +DI).'],
    ]);
    expect(dix.DirectionalIndicatorCrossoversV1.alertConditions).toBe(dix.alertConditions);
  });
  it('fires on the DI crosses, with the ADX filter when it is on, marks shown or not', () => {
    for (const [useAdxFilt, showMarks] of [[false, true], [true, false]] as const) {
      const r = dix.calculate(bars, { useAdxFilt, showMarks, adxThr: 25 });
      const p = values(r.plots.plot0), m = values(r.plots.plot1), adx = values(r.plots.plot2);
      const ok = (i: number) => !useAdxFilt || gt(adx[i], 25);
      const bull = crossover(p, m).map((v, i) => v && ok(i));
      const bear = crossover(m, p).map((v, i) => v && ok(i));
      expect(bull.filter(Boolean).length).toBeGreaterThan(5);
      expect(r.alerts[0].times).toEqual(boolTimes(bars, bull));
      expect(r.alerts[1].times).toEqual(boolTimes(bars, bear));
    }
  });
});

describe('Directional Logistic Oscillator: alertconditions', () => {
  const bars = walk(1500, 23);
  it('declares the six conditions of the original', () => {
    expect(decls(dlo)).toEqual([
      ['alert0', '[DLO] Reversion Up', 'DLO: Potential bullish reversion detected (cycle turning upward)'],
      ['alert1', '[DLO] Reversion Down', 'DLO: Potential bearish reversion detected (cycle turning downward)'],
      ['alert2', '[DLO] MR Buy', 'DLO: Mean-reversion BUY – oscillator crossed up from extreme oversold zone (percentile-based)'],
      ['alert3', '[DLO] MR Sell', 'DLO: Mean-reversion SELL – oscillator crossed down from extreme overbought zone (percentile-based)'],
      ['alert4', '[DLO] Osc Bullish Cross', 'DLO: Oscillator crossed above zero → bullish momentum shift'],
      ['alert5', '[DLO] Osc Bearish Cross', 'DLO: Oscillator crossed below zero → bearish momentum shift'],
    ]);
    expect(dlo.DirectionalLogisticOscillator.alertConditions).toBe(dlo.alertConditions);
  });
  it('fires on cycle turns, percentile crosses and zero crosses of the current bar', () => {
    const r = dlo.calculate(bars, { meanLookback: 100 });
    const strength = values(r.plots.plot0);
    const S = (a: number[]) => Series.fromArray(bars, a);
    const sSma = A(ta.sma(S(strength), 7));
    const sEma = A(ta.ema(S(strength), 7));
    const cyc = A(ta.ema(S(sSma), 4));
    const at = (k: number) => (k >= 0 ? cyc[k] : NaN);
    const revUp = bars.map((_b, k) => gt(at(k), at(k - 1)) && !gt(at(k - 1), at(k - 2)));
    const revDn = bars.map((_b, k) => lt(at(k), at(k - 1)) && !lt(at(k - 1), at(k - 2)));
    const pr = (a: number[], p: number) => A(ta.percentile_nearest_rank(S(a), 100, p));
    const c1 = crossover(sSma, pr(sSma, 10)), c2 = crossover(sEma, pr(sEma, 5));
    const u1 = crossunder(sSma, pr(sSma, 90)), u2 = crossunder(sEma, pr(sEma, 95));
    const mrBuy = c1.map((v, k) => v || c2[k]);
    const mrSell = u1.map((v, k) => v || u2[k]);
    const expected = [revUp, revDn, mrBuy, mrSell, crossover(strength, 0), crossunder(strength, 0)].map((f) => boolTimes(bars, f));
    expected.forEach((t) => expect(t.length).toBeGreaterThan(3));
    expected.forEach((t, k) => expect(r.alerts[k].times).toEqual(t));
    // the ▲ marks (intrabar on) are the MR Buy bars
    expect(r.markers.filter((m) => m.text === '▲').map((m) => m.time)).toEqual(expected[2]);
    // "Allow Intrabar Updating" off: the marks move one bar, the alerts do not
    const r2 = dlo.calculate(bars, { meanLookback: 100, intrabar: false });
    expected.forEach((t, k) => expect(r2.alerts[k].times).toEqual(t));
  });
});

describe('Divergence for many indicator v3: alertconditions', () => {
  const bars = walk(1500, 29);
  it('declares the four conditions of the original', () => {
    expect(decls(divV3)).toEqual([
      ['alert0', 'Positive Divergence', 'Positive Divergence'],
      ['alert1', 'Negative Divergence', 'Negative Divergence'],
      ['alert2', 'Positive Hidden Divergence', 'Positive Hidden Divergence'],
      ['alert3', 'Negative Hidden Divergence', 'Negative Hidden Divergence'],
    ]);
    expect(divV3.DivergenceForManyIndicatorV3.alertConditions).toBe(divV3.alertConditions);
  });
  it('regular divergences: on new left-side extremes, the bars of the divergence lines', () => {
    const r = divV3.calculate(bars);
    const [pos, neg, hpos, hneg] = r.alerts.map((a) => a.times);
    expect(pos.length).toBeGreaterThan(5);
    expect(neg.length).toBeGreaterThan(5);
    expect(hpos).toEqual([]);
    expect(hneg).toEqual([]);
    // the high (low) is the highest (lowest) of the last 6 bars: pivothigh(lb, 0)
    const hh = A(ta.highest(new Series(bars, (b) => b.high), 6));
    const ll = A(ta.lowest(new Series(bars, (b) => b.low), 6));
    const idx = new Map(bars.map((b, i) => [b.time as number, i]));
    expect(neg.every((t) => bars[idx.get(t)!].high === hh[idx.get(t)!])).toBe(true);
    expect(pos.every((t) => bars[idx.get(t)!].low === ll[idx.get(t)!])).toBe(true);
    // every live line ends on a bar of its side's condition
    expect(isSubset(r.lines.filter((l) => l.color === '#FF5252').map((l) => l.time2), neg)).toBe(true);
    expect(isSubset(r.lines.filter((l) => l.color === '#00E676').map((l) => l.time2), pos)).toBe(true);
    expect(r.lines.length).toBeGreaterThan(5);
    // a higher minimum keeps a part of the bars
    const r3 = divV3.calculate(bars, { showLimit: 3 });
    expect(isSubset(r3.alerts[0].times, pos)).toBe(true);
    expect(r3.alerts[0].times.length).toBeLessThan(pos.length);
  });
  it('hidden divergences: only with "Show Hidden Divergences"', () => {
    const r = divV3.calculate(bars, { showHidden: true });
    const [pos, neg, hpos, hneg] = r.alerts.map((a) => a.times);
    expect(pos).toEqual([]);
    expect(neg).toEqual([]);
    expect(hpos.length).toBeGreaterThan(2);
    expect(hneg.length).toBeGreaterThan(2);
    expect(isSubset(r.lines.filter((l) => l.color === '#FF5252').map((l) => l.time2), hneg)).toBe(true);
    expect(isSubset(r.lines.filter((l) => l.color === '#00E676').map((l) => l.time2), hpos)).toBe(true);
  });
});

describe('Divergence for Many Indicators v4: alertconditions', () => {
  const bars = walk(1500, 31);
  it('declares the six conditions of the original', () => {
    expect(decls(divV4)).toEqual([
      ['alert0', 'Positive Regular Divergence Detected', 'Positive Regular Divergence Detected'],
      ['alert1', 'Negative Regular Divergence Detected', 'Negative Regular Divergence Detected'],
      ['alert2', 'Positive Hidden Divergence Detected', 'Positive Hidden Divergence Detected'],
      ['alert3', 'Negative Hidden Divergence Detected', 'Negative Hidden Divergence Detected'],
      ['alert4', 'Positive Divergence Detected', 'Positive Divergence Detected'],
      ['alert5', 'Negative Divergence Detected', 'Negative Divergence Detected'],
    ]);
    expect(divV4.DivergenceForManyIndicatorsV4.alertConditions).toBe(divV4.alertConditions);
  });
  it('fires on the bars of the divergence lines and labels of each type', () => {
    const r = divV4.calculate(bars, { divergenceType: 'Regular/Hidden' });
    const t = r.alerts.map((a) => a.times);
    t.slice(0, 4).forEach((x) => expect(x.length).toBeGreaterThan(2));
    const union = (a: number[], b: number[]) => bars.map((x) => x.time as number).filter((x) => a.includes(x) || b.includes(x));
    expect(t[4]).toEqual(union(t[0], t[2]));
    expect(t[5]).toEqual(union(t[1], t[3]));
    // a line ends on the bar before the signal (no "Don't Wait for Confirmation")
    const next = new Map(bars.slice(0, -1).map((b, i) => [b.time as number, bars[i + 1].time as number]));
    const ends = (c: string) => r.lines.filter((l) => l.color === c).map((l) => next.get(l.time2)!);
    expect(isSubset(ends('#FFEB3B'), t[0])).toBe(true);
    expect(isSubset(ends('#311B92'), t[1])).toBe(true);
    expect(isSubset(ends('#00E676'), t[2])).toBe(true);
    expect(isSubset(ends('#FF5252'), t[3])).toBe(true);
    // labels: above the bar for the negative side, below for the positive side
    expect(isSubset(r.labels.filter((l) => l.style === 'label_down').map((l) => l.time), t[5])).toBe(true);
    expect(isSubset(r.labels.filter((l) => l.style === 'label_up').map((l) => l.time), t[4])).toBe(true);
    // Regular only: the same regular bars, no hidden ones
    const reg = divV4.calculate(bars);
    expect(reg.alerts[2].times).toEqual([]);
    expect(reg.alerts[3].times).toEqual([]);
    expect(reg.alerts[4].times).toEqual(reg.alerts[0].times);
    expect(reg.alerts[0].times.length).toBeGreaterThan(2);
  });
});

describe('Divergence Indicator (any oscillator): Style ids', () => {
  const bars = wicky(1500, 37);
  it('the four divergence labels carry shape0..shape3', () => {
    const r = divInd.calculate(bars, { plotHiddenBull: true, plotHiddenBear: true, src: 'close' });
    const byText: Record<string, string> = { ' Bull ': 'shape0', ' H Bull ': 'shape1', ' Bear ': 'shape2', ' H Bear ': 'shape3' };
    for (const id of Object.values(byText)) expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
    for (const m of r.markers) expect(m.id).toBe(byText[m.text as string]);
  });
});

describe('Divergence Screener: alert() calls', () => {
  const bars = walk(1200, 13);
  it('declares alert() calls', () => {
    expect(divScreener.hasAlertFunction).toBe(true);
    expect(divScreener.DivergenceScreener.hasAlertFunction).toBe(true);
  });
  it('one call per drawn divergence, "Alert : " and the label tooltip, once per bar close', () => {
    const r = divScreener.calculate(bars);
    expect(r.alertCalls.length).toBeGreaterThan(3);
    const types = ['Bullish Divergence', 'Bearish Divergence', 'Bullish Hidden Divergence', 'Bearish Hidden Divergence'];
    for (const c of r.alertCalls) {
      expect(c.freq).toBe('once_per_bar_close');
      expect(types.some((t) => c.message.startsWith(`Alert : ${t}\nPrice : `))).toBe(true);
      expect(c.message).toMatch(/\nOscillator :/);
      expect(bars.some((b) => b.time === c.time)).toBe(true);
    }
    // the last 500 bars only
    expect(r.alertCalls.every((c) => c.time >= (bars[bars.length - 500].time as number))).toBe(true);
    // the labels drawn on the price pane (those not replaced later) have their alert
    const r5 = divScreener.calculate(walk(1200, 5));
    const messages = r5.alertCalls.map((c) => c.message);
    const priceLabels = r5.labels.filter((l) => l.forceOverlay);
    expect(priceLabels.length).toBeGreaterThan(0);
    for (const l of priceLabels) expect(messages).toContain('Alert : ' + l.tooltip);
  });
  it('only the types chosen in the Alerts inputs', () => {
    const none = divScreener.calculate(bars, {
      bullishDivergenceAlert: false, bullishHiddenDivergenceAlert: false, bearishDivergenceAlert: false, bearishHiddenDivergenceAlert: false,
    });
    expect(none.alertCalls).toEqual([]);
    const all = divScreener.calculate(bars);
    const bull = divScreener.calculate(bars, { bullishHiddenDivergenceAlert: false, bearishDivergenceAlert: false, bearishHiddenDivergenceAlert: false });
    expect(bull.alertCalls).toEqual(all.alertCalls.filter((c) => c.message.startsWith('Alert : Bullish Divergence\n')));
  });
});

describe('DMI Histogram Indicator: alertconditions', () => {
  const bars = walk(1500, 43);
  it('declares the seven conditions of the original', () => {
    expect(decls(dmiHist)).toEqual([
      ['alert0', 'ADX Bear Trend Reversal? ', 'Possible Bearish Reversal - ADX pivot downward while +DI > -DI'],
      ['alert1', 'ADX Bull Trend Reversal?', 'Possible Bullish Reversal - ADX pivot downward while -DI > +DI'],
      ['alert2', 'ADX Cross Above +DI', 'ADX crossed above +DI'],
      ['alert3', 'ADX Cross Above -DI', 'ADX crossed above -DI'],
      ['alert4', "ADX Cross Above it's MA", 'Possible Trend Strengthening - ADX pivot upward'],
      ['alert5', 'Bullish DI Cross', '+DI crossed above -DI (Possibly Bullish)'],
      ['alert6', 'Bearish DI Cross', '+DI crossed below -DI (Possibly Bearish)'],
    ]);
    expect(dmiHist.DmiHistogramIndicator.alertConditions).toBe(dmiHist.alertConditions);
  });
  it('fires on the ADX / DI crosses and the ADX reversals', () => {
    const r = dmiHist.calculate(bars, { showAdxReversals: false });
    const plus = values(r.plots.plot1).map((v) => v + 20);
    const adx = values(r.plots.plot3);
    const sAdx = values(r.plots.plot4);
    const sMinus = values(r.plots.plot5).map((v) => v + 22);
    const rev = crossunder(adx, sAdx);
    const expected = [
      rev.map((v, i) => v && gt(plus[i], sMinus[i])), rev.map((v, i) => v && gt(sMinus[i], plus[i])),
      crossover(adx, plus), crossover(adx, sMinus), crossover(adx, sAdx), crossover(plus, sMinus), crossunder(plus, sMinus),
    ].map((f) => boolTimes(bars, f));
    expected.forEach((t) => expect(t.length).toBeGreaterThan(1));
    expected.forEach((t, k) => expect(r.alerts[k].times).toEqual(t));
    // the triangles (when shown) are the reversal bars
    const shown = dmiHist.calculate(bars);
    expect(shown.markers.filter((m) => m.position === 'top').map((m) => m.time)).toEqual(expected[0]);
    expect(shown.markers.filter((m) => m.position === 'bottom').map((m) => m.time)).toEqual(expected[1]);
  });
});

describe('Dope DPO: Style ids', () => {
  const bars = walk(1500, 47);
  it('the background colours carry bgcolor0..3 (pane) and bgcolor4..7 (price pane)', () => {
    const r = dopeDpo.calculate(bars, { showOverlayFills: true });
    expect(r.bgColors.length).toBeGreaterThan(20);
    const ids = Array.from({ length: 8 }, (_, k) => `bgcolor${k}`);
    expect(r.bgColors.every((b) => ids.includes(b.id as string))).toBe(true);
    for (let k = 0; k < 4; k++) {
      const pane = r.bgColors.filter((b) => b.id === `bgcolor${k}`);
      const over = r.bgColors.filter((b) => b.id === `bgcolor${k + 4}`);
      expect(pane.length).toBeGreaterThan(0);
      expect(over.map((b) => [b.time, b.color])).toEqual(pane.map((b) => [b.time, b.color]));
      expect(pane.every((b) => !b.forceOverlay)).toBe(true);
      expect(over.every((b) => b.forceOverlay)).toBe(true);
      expect(new Set(pane.map((b) => b.color)).size).toBe(1);
    }
    // flip / sync colours: green 75, red 75, green 50, red 50
    const colorOf = (id: string) => r.bgColors.find((b) => b.id === id)!.color;
    expect(colorOf('bgcolor0')).not.toBe(colorOf('bgcolor1'));
    expect(colorOf('bgcolor0')).not.toBe(colorOf('bgcolor2'));
    // without the overlay fills only the pane ids are left, on the same bars as before
    const r2 = dopeDpo.calculate(bars);
    expect(r2.bgColors).toEqual(r.bgColors.filter((b) => !b.forceOverlay));
  });
});

describe('Double MACD: alertconditions and Style ids', () => {
  const bars = walk(1500, 53);
  it('declares the three conditions of the original (default message)', () => {
    expect(decls(doubleMacd)).toEqual([
      ['alert0', 'Compras', 'Alert Fired!'],
      ['alert1', 'Ventas', 'Alert Fired!'],
      ['alert2', 'Compras/Ventas', 'Alert Fired!'],
    ]);
    expect(doubleMacd.DoubleMACD.alertConditions).toBe(doubleMacd.alertConditions);
  });
  it('fires on the trend and counter-trend entries', () => {
    const r = doubleMacd.calculate(bars);
    const close = new Series(bars, (b) => b.close);
    const m1 = A(ta.ema(close, 12)).map((v, i) => v - A(ta.ema(close, 26))[i]);
    const m2 = A(ta.ema(close, 5)).map((v, i) => v - A(ta.ema(close, 15))[i]);
    const largo = crossover(m2, 0).map((v, i) => v && m1[i] < m2[i] && m1[i - 1] < m1[i] && m1[i] < 0);
    const largo1 = crossover(m2, m1).map((v, i) => v && m2[i] < 0);
    const corto = crossunder(m2, 0).map((v, i) => v && m1[i] > m2[i] && m1[i - 1] > m1[i] && m1[i] > 0);
    const corto1 = crossunder(m2, m1).map((v, i) => v && m2[i] > 0);
    const buy = largo.map((v, i) => v || largo1[i]);
    const sell = corto.map((v, i) => v || corto1[i]);
    expect(boolTimes(bars, largo).length).toBeGreaterThan(2);
    expect(boolTimes(bars, largo1).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(boolTimes(bars, buy));
    expect(r.alerts[1].times).toEqual(boolTimes(bars, sell));
    expect(r.alerts[2].times).toEqual(boolTimes(bars, buy.map((v, i) => v || sell[i])));
    // the entry triangles are on those bars
    const entry = r.markers.filter((m) => m.shape === 'triangleUp').map((m) => m.time);
    expect(isSubset(entry, r.alerts[0].times)).toBe(true);
  });
  it('the divergence labels carry shape0..3, the entry triangles shape4..7', () => {
    const r = doubleMacd.calculate(bars);
    const byText: Record<string, string> = {
      'Bear R': 'shape0', 'Bear O': 'shape1', 'Bull R': 'shape2', 'Bull O': 'shape3',
      Buy: 'shape4', 'CT Buy': 'shape5', Sell: 'shape6', 'CT Sell': 'shape7',
    };
    expect(r.markers.length).toBeGreaterThan(20);
    for (const m of r.markers) expect(m.id).toBe(byText[m.text as string]);
    for (const id of ['shape0', 'shape2', 'shape4', 'shape5', 'shape6', 'shape7']) {
      expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
    }
  });
});

describe('Double RSI: alertconditions', () => {
  const bars = walk(1500, 59);
  it('declares the two conditions of the original', () => {
    expect(decls(doubleRsi)).toEqual([
      ['alert0', 'DRSI: Buy', 'DRSI Buy Signal'],
      ['alert1', 'DRSI: Sell', 'DRSI Sell Signal'],
    ]);
    expect(doubleRsi.DoubleRsi.alertConditions).toBe(doubleRsi.alertConditions);
  });
  it('fires when the state crosses 0', () => {
    const r = doubleRsi.calculate(bars);
    const drsi = values(r.plots.plot0);
    const T: number[] = [];
    drsi.forEach((d, i) => T.push(gt(d, 59) ? 1 : lt(d, 52) ? -1 : i > 0 ? T[i - 1] : NaN));
    const buy = boolTimes(bars, crossover(T, 0));
    const sell = boolTimes(bars, crossunder(T, 0));
    expect(buy.length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(buy);
    expect(r.alerts[1].times).toEqual(sell);
    expect(r.markers.filter((m) => m.shape === 'triangleUp').map((m) => m.time)).toEqual(buy);
  });
});
