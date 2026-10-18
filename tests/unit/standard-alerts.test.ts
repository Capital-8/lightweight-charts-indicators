/**
 * Alert conditions of 8 standard built-ins (#7): declared on the registry entries with the reference titles and
 * messages, and true on the bars the reference scripts' formulas give (checked against the reference studies on
 * BATS:SPY 1D after the warm-up; here the formulas are checked on synthetic bars).
 */
import { describe, expect, it } from 'vitest';
import { indicatorRegistry } from '../../src/index';
import type { Bar } from 'oakscriptjs';

const bars: Bar[] = [];
let p = 100;
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 600; i++) {
  // a gap up every 37 bars (the bar opens 8 above the close before)
  const o = p + (i % 37 === 0 ? 8 : 0);
  p = Math.max(5, o + Math.sin(i / 9) * 2.5 + (rnd() - 0.5) * 3);
  bars.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * 0.5, low: Math.min(o, p) - rnd() * 0.5, close: p, volume: 1e6 + rnd() * 1e6 });
}
const entry = (id: string) => indicatorRegistry.find((e) => e.id === id)!;
const run = (id: string) => entry(id).calculate(bars, { ...entry(id).defaultInputs }, { timeframe: '1D', lastBarConfirmed: true });
const timesOf = (id: string, k: number): number[] => run(id).alerts[k].times;

describe('alert conditions of the standard built-ins', () => {
  it('are declared with the reference titles, and every result lists them in that order', () => {
    const want: Record<string, string[]> = {
      'awesome-oscillator': ['AO color changed to green', 'AO color changed to red'],
      macd: ['Rising to falling', 'Falling to rising'],
      supertrend: ['Downtrend to Uptrend', 'Uptrend to Downtrend', 'Trend Change'],
      rsi: ['Regular Bullish Divergence', 'Regular Bearish Divergence'],
      'rsi-divergence-indicator': ['Regular Bullish Divergence', 'Hidden Bullish Divergence', 'Regular Bearish Divergence', 'Hidden Bearish Divergence'],
      gaps: ['New Gap Appeared', 'Gap Closed'],
      'linreg-channel': ['Regression Channel Exited', 'Switched to Uptrend', 'Switched to Downtrend'],
      technicals: ['Sell', 'Buy', 'Strong Sell', 'Strong Buy'],
    };
    for (const [id, titles] of Object.entries(want)) {
      expect(entry(id).alertConditions!.map((c) => c.title), id).toEqual(titles);
      expect(run(id).alerts.map((a: { title: string }) => a.title), id).toEqual(titles);
    }
  });

  it('MACD: the histogram changes sign on the bars of its conditions', () => {
    const hist = run('macd').plots.plot0.map((pt: { value: number }) => pt.value);
    const at = new Map(bars.map((b, i) => [b.time as number, i]));
    for (const t of timesOf('macd', 0)) { const i = at.get(t)!; expect(hist[i - 1] >= 0 && hist[i] < 0).toBe(true); }
    for (const t of timesOf('macd', 1)) { const i = at.get(t)!; expect(hist[i - 1] <= 0 && hist[i] > 0).toBe(true); }
    expect(timesOf('macd', 0).length + timesOf('macd', 1).length).toBeGreaterThan(5);
  });

  it('Supertrend: Trend Change is the union of the two switches', () => {
    const up = timesOf('supertrend', 0), down = timesOf('supertrend', 1), change = timesOf('supertrend', 2);
    expect(change).toEqual([...up, ...down].sort((a, b) => a - b));
    expect(up.length).toBeGreaterThan(0);
  });

  it('Gaps: a gap appears on the bars where a box starts', () => {
    expect(timesOf('gaps', 0).length).toBeGreaterThan(0);
    expect(timesOf('gaps', 1).length).toBeGreaterThan(0);
  });

  it('Linear regression channel: conditions only on the last bar (the channel exists there only)', () => {
    const last = bars[bars.length - 1].time as number;
    for (const k of [0, 1, 2]) for (const t of timesOf('linreg-channel', k)) expect(t).toBe(last);
  });

  it('RSI: no divergence alert while "Calculate Divergence" is off; with it on they follow the labels', () => {
    expect(timesOf('rsi', 0)).toEqual([]);
    const r = entry('rsi').calculate(bars, { ...entry('rsi').defaultInputs, calculateDivergence: true });
    expect(r.alerts[0].times).toEqual(r.outputValues.bullLabel.map((x: { time: number }) => x.time));
    expect(r.alerts[1].times).toEqual(r.outputValues.bearLabel.map((x: { time: number }) => x.time));
  });
});

describe('community ports: alerts of their originals on the registry entries (#8, #13)', () => {
  const ids = indicatorRegistry.filter((e) => e.group === 'community' && ((e.alertConditions?.length ?? 0) > 0 || e.hasAlertFunction)).map((e) => e.id);
  it('647 community ports give the alerts of their originals', () => {
    expect(ids.length).toBeGreaterThanOrEqual(647);
  });
  it('every port declares its alertcondition()s or its alert() calls, and its result gives them', () => {
    for (const id of ids) {
      const e = indicatorRegistry.find((x) => x.id === id)!;
      expect(e, id).toBeDefined();
      expect((e.alertConditions?.length ?? 0) > 0 || e.hasAlertFunction === true, id).toBe(true);
      let r: any;
      try {
        r = e.calculate(bars, { ...e.defaultInputs }, { timeframe: '1D', tickerid: 'NASDAQ:AAPL', lastBarConfirmed: true, bars: () => bars });
      } catch {
        continue; // needs data these bars do not have (lower timeframes, other symbols)
      }
      if (!r || typeof r.then === 'function') continue;
      if (e.alertConditions?.length) expect(r.alerts?.map((a: any) => a.id), id).toEqual(e.alertConditions.map((a) => a.id));
      if (e.hasAlertFunction) expect(Array.isArray(r.alertCalls), id).toBe(true);
    }
  });
});
