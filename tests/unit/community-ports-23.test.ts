/**
 * Alerts and Style ids of 16 community ports (batch 23): the alertcondition() declarations (ids, titles and messages
 * of the originals), the bars on which each condition is true (re-computed here from the original's expression), the
 * alert() calls (bars, messages, frequency), and the Style-settings ids on the emitted markers, background colours
 * and bar colours.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, getSourceSeries, time as pineTime, type Bar } from 'oakscriptjs';
import { periodStarts } from '../../src/anchor-period';
import * as macdX from '../../src/community/macd-with-crossings-and-above-below-zero';
import * as macdBb from '../../src/community/macd-x-bb-x-stdev-x-rvi';
import * as macdXd from '../../src/community/macd-xd';
import * as knn from '../../src/community/machine-learning-knn-trend-predictor';
import * as mlRsi from '../../src/community/machine-learning-rsi-ai-classification-ranking';
import * as magnet from '../../src/community/magnet-force-rsi-filter-v6';
import * as maket from '../../src/community/maket-strat-absorption-bubbles';
import * as cipherA from '../../src/community/market-cipher-a';
import * as mpo from '../../src/community/market-pressure-oscillator';
import * as profile from '../../src/community/market-profile';
import * as pulse from '../../src/community/market-pulse-pro';
import * as sentiment from '../../src/community/market-sentiment-technicals';
import * as sessions from '../../src/community/market-sessions-by-leviathan';
import * as msb from '../../src/community/market-structure-break-order-block';
import * as msd from '../../src/community/market-structure-dashboard-flux-charts';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of bars with a random volume (spikes on 5 % of the bars) */
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
const bars = walk(1200, 7);
const n = bars.length;
const close = bars.map((b) => b.close);
const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
const S = (list: Bar[], a: number[]) => Series.fromArray(list, a);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const markerIds = (r: { markers: { id?: string }[] }) => [...new Set(r.markers.map((m) => m.id))].sort();
/** Independent crossover / crossunder (na = NaN compares false) */
const over = (a: number[], b: number[] | number) =>
  a.map((v, i) => { const w = (k: number) => (typeof b === 'number' ? b : b[k]); return i > 0 && v > w(i) && a[i - 1] <= w(i - 1); });
const under = (a: number[], b: number[] | number) =>
  a.map((v, i) => { const w = (k: number) => (typeof b === 'number' ? b : b[k]); return i > 0 && v < w(i) && a[i - 1] >= w(i - 1); });
const or = (a: boolean[], b: boolean[]) => a.map((v, i) => v || b[i]);

describe('macd-with-crossings-and-above-below-zero', () => {
  // two walks: crossings above zero in the "big" direction are rare
  const r = { markers: [...macdX.calculate(bars).markers, ...macdX.calculate(walk(3000, 99)).markers] };
  it('gives every marker the id of its plotshape output', () => {
    expect(r.markers.every((m) => typeof m.id === 'string')).toBe(true);
    expect(markerIds(r)).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']);
    const look = (id: string) => [...new Set(r.markers.filter((m) => m.id === id).map((m) => `${m.shape}/${m.position}/${m.size}`))];
    expect(look('shape0')).toEqual(['triangleDown/top/tiny']);
    expect(look('shape1')).toEqual(['triangleUp/bottom/tiny']);
    expect(look('shape2')).toEqual(['triangleUp/bottom/small']);
    expect(look('shape3')).toEqual(['triangleDown/top/small']);
    expect(look('shape4')).toEqual(['arrowUp/bottom/auto']);
    expect(look('shape5')).toEqual(['arrowDown/top/auto']);
  });
});

describe('macd-x-bb-x-stdev-x-rvi', () => {
  const r = macdBb.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(macdBb)).toEqual([
      ['alert0', 'Buy & Sell', 'Price entered buy / sell area'],
      ['alert1', 'Buy', 'Price entered buying area'],
      ['alert2', 'Sell', 'Price entered selling area'],
    ]);
    expect(macdBb.MacdXBbXStdevXRvi.alertConditions).toBe(macdBb.alertConditions);
  });
  it('fires on the first bar of a bullish / bearish line colour (signal filter on)', () => {
    const c = S(bars, close);
    const fast = A(ta.ema(c, 12));
    const slow = A(ta.ema(c, 26));
    const macd = fast.map((v, i) => v - slow[i]);
    const avg = A(ta.ema(S(bars, macd), 9));
    const sd = A(ta.stdev(S(bars, macd), 9));
    const upper = avg.map((v, i) => v + 0.89 * sd[i]);
    const lower = avg.map((v, i) => v - 0.89 * sd[i]);
    // Inside trigger: 1 = bullish colour, -1 = bearish colour
    const col = macd.map((m, i) => (gt(m, upper[i]) ? 1 : lt(m, lower[i]) ? -1 : gt(m, i > 0 ? macd[i - 1] : NaN) ? 1 : -1));
    const buy = col.map((v, i) => i > 0 && v === 1 && col[i - 1] !== 1 && le(macd[i], avg[i]));
    const sell = col.map((v, i) => i > 0 && v === -1 && col[i - 1] !== -1 && ge(macd[i], avg[i]));
    expect(buy.filter(Boolean).length).toBeGreaterThan(5);
    expect(sell.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[1].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[2].times).toEqual(timeAt(bars, sell));
    expect(r.alerts[0].times).toEqual(timeAt(bars, or(buy, sell)));
  });
  it('keeps firing when the signals are not plotted', () => {
    const r2 = macdBb.calculate(bars, { plotBuySignals: false, plotSellSignals: false });
    expect(r2.alerts.map((a) => a.times)).toEqual(r.alerts.map((a) => a.times));
  });
});

describe('macd-xd', () => {
  const r = macdXd.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(macdXd)).toEqual([
      ['alert0', 'Rising to falling', 'The MACD histogram switched from a rising to falling state'],
      ['alert1', 'Falling to rising', 'The MACD histogram switched from a falling to rising state'],
    ]);
    expect(macdXd.MacdXd.alertConditions).toBe(macdXd.alertConditions);
  });
  it('fires when the histogram changes sign', () => {
    const c = S(bars, close);
    const macd = A(ta.ema(c, 12)).map((v, i) => v - A(ta.ema(c, 26))[i]);
    const signal = A(ta.ema(S(bars, macd), 9));
    const hist = macd.map((m, i) => m - signal[i]);
    const down = hist.map((h, i) => i > 0 && ge(hist[i - 1], 0) && lt(h, 0));
    const up = hist.map((h, i) => i > 0 && le(hist[i - 1], 0) && gt(h, 0));
    expect(down.filter(Boolean).length).toBeGreaterThan(10);
    expect(r.alerts[0].times).toEqual(timeAt(bars, down));
    expect(r.alerts[1].times).toEqual(timeAt(bars, up));
  });
});

describe('machine-learning-knn-trend-predictor', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(knn)).toEqual([
      ['alert0', 'Open Long ▲', 'Open Long ▲ | {{ticker}}@{{close}} | ({{interval}})'],
      ['alert1', 'Open Short ▼', 'Open Short ▼ | {{ticker}}@{{close}} | ({{interval}})'],
    ]);
    expect(knn.MachineLearningKnnTrendPredictor.alertConditions).toBe(knn.alertConditions);
  });
  it('fires on the confirmed bars where the direction turns', () => {
    const N = 50, K = 100;
    const neighbors: number[] = new Array(N).fill(NaN);
    const distances: number[] = new Array(K).fill(NaN);
    const dir: number[] = [];
    for (let i = 0; i < n; i++) {
      neighbors.shift();
      distances.shift();
      const prev = i > 0 ? close[i - 1] : NaN;
      const d = Math.abs(close[i] - prev);
      distances.push(d);
      const valid = distances.filter((x) => !isNaN(x));
      const mn = valid.length ? Math.min(...valid) : NaN;
      neighbors.push(lt(d, mn) ? prev : close[i]);
      const vals = neighbors.filter((x) => !isNaN(x));
      const pred = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : NaN;
      dir.push(lt(pred, close[i]) ? 1 : gt(pred, close[i]) ? -1 : 0);
    }
    const long = dir.map((d, i) => i > 0 && d === 1 && dir[i - 1] !== 1);
    const short = dir.map((d, i) => i > 0 && d === -1 && dir[i - 1] !== -1);
    const r = knn.calculate(bars);
    expect(long.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timeAt(bars, long));
    expect(r.alerts[1].times).toEqual(timeAt(bars, short));
    // an open last bar is not confirmed
    const lastOpen = knn.calculate(bars, {}, { lastBarConfirmed: false });
    const lastT = bars[n - 1].time as number;
    expect(lastOpen.alerts[0].times).toEqual(timeAt(bars, long).filter((t) => t !== lastT));
  });
});

describe('machine-learning-rsi-ai-classification-ranking', () => {
  const r = mlRsi.calculate(bars, {}, { tickerid: 'NASDAQ:AAPL', timeframe: '1D' });
  const timesOf = (id: string) => r.markers.filter((m) => m.id === id).map((m) => m.time as number);
  it('declares the alertconditions and the alert() calls of the original', () => {
    expect(decls(mlRsi)).toEqual([
      ['alert0', 'Long Signal', 'ML RSI: Long signal — rank & confidence gates passed.'],
      ['alert1', 'Short Signal', 'ML RSI: Short signal — rank & confidence gates passed.'],
      ['alert2', 'Any Signal', 'ML RSI: New entry signal.'],
      ['alert3', 'Trend Flip Up', 'ML Supertrend flipped to UPTREND.'],
      ['alert4', 'Trend Flip Down', 'ML Supertrend flipped to DOWNTREND.'],
      ['alert5', 'Any Trend Flip', 'ML Supertrend changed direction.'],
    ]);
    expect(mlRsi.hasAlertFunction).toBe(true);
    expect(mlRsi.MachineLearningRsiAiClassificationRanking.hasAlertFunction).toBe(true);
    expect(mlRsi.MachineLearningRsiAiClassificationRanking.alertConditions).toBe(mlRsi.alertConditions);
  });
  it('gives the flip dots and the signal triangles the ids of their plotshape outputs', () => {
    expect(markerIds(r)).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5']);
    expect(timesOf('shape2')).toEqual(timesOf('shape4'));
    expect(timesOf('shape3')).toEqual(timesOf('shape5'));
    for (const m of r.markers.filter((x) => x.id === 'shape2' || x.id === 'shape4')) expect(m.shape).toBe('triangleUp');
    for (const m of r.markers.filter((x) => x.id === 'shape0' || x.id === 'shape1')) expect(m.shape).toBe('circle');
  });
  it('fires on the signals and the trailing stop flips', () => {
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[3].times.length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timesOf('shape2'));
    expect(r.alerts[1].times).toEqual(timesOf('shape3'));
    expect(r.alerts[3].times).toEqual(timesOf('shape0'));
    expect(r.alerts[4].times).toEqual(timesOf('shape1'));
    const union = (a: number[], b: number[]) => [...new Set([...a, ...b])].sort((x, y) => x - y);
    expect(r.alerts[2].times).toEqual(union(r.alerts[0].times, r.alerts[1].times));
    expect(r.alerts[5].times).toEqual(union(r.alerts[3].times, r.alerts[4].times));
    // the alerts do not depend on the markers shown
    const hidden = mlRsi.calculate(bars, { showMarks: false, showSt: false });
    expect(hidden.markers.length).toBe(0);
    expect(hidden.alerts.map((a) => a.times)).toEqual(r.alerts.map((a) => a.times));
  });
  it('calls alert() once per bar close with the ticker, timeframe, rank and confidence', () => {
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    const long = r.alertCalls.filter((c) => c.message.startsWith('🟢 LONG'));
    const up = r.alertCalls.filter((c) => c.message.startsWith('▲ Trend Up'));
    expect(long.map((c) => c.time)).toEqual(r.alerts[0].times);
    expect(up.map((c) => c.time)).toEqual(r.alerts[3].times);
    expect(r.alertCalls.filter((c) => c.message.startsWith('🔴 SHORT')).map((c) => c.time)).toEqual(r.alerts[1].times);
    expect(r.alertCalls.filter((c) => c.message.startsWith('▼ Trend Down')).map((c) => c.time)).toEqual(r.alerts[4].times);
    for (const c of long) expect(c.message).toMatch(/^🟢 LONG {2}\| {2}AAPL \(1D\) {2}Rank \d+ \/ Conf \d+$/);
    for (const c of up) expect(c.message).toBe('▲ Trend Up  |  AAPL (1D)');
    // no call on an open last bar
    const open = mlRsi.calculate(bars, {}, { tickerid: 'NASDAQ:AAPL', timeframe: '1D', lastBarConfirmed: false });
    expect(open.alertCalls.some((c) => c.time === bars[n - 1].time)).toBe(false);
  });
});

describe('magnet-force-rsi-filter-v6', () => {
  const r = magnet.calculate(bars);
  it('declares alert() calls', () => {
    expect(magnet.hasAlertFunction).toBe(true);
    expect(magnet.MagnetForceRsiFilterV6.hasAlertFunction).toBe(true);
  });
  it('calls alert() once per bar close on the SELL / BUY signals', () => {
    const c = S(bars, close);
    const core = A(ta.vwma(c, 20, S(bars, bars.map((b) => b.volume ?? NaN))));
    const sd = A(ta.stdev(c, 20));
    const upper = core.map((v, i) => v + 2 * sd[i]);
    const lower = core.map((v, i) => v - 2 * sd[i]);
    const rsi = A(ta.rsi(c, 14));
    const sell = under(close, upper).map((v, i) => v && i > 0 && ge(rsi[i - 1], 70));
    const buy = over(close, lower).map((v, i) => v && i > 0 && le(rsi[i - 1], 30));
    expect(sell.filter(Boolean).length + buy.filter(Boolean).length).toBeGreaterThan(3);
    const expected: { time: number; message: string }[] = [];
    bars.forEach((b, i) => {
      if (sell[i]) expected.push({ time: b.time as number, message: 'Magnet Pull Down: Price returning to core from Overbought' });
      if (buy[i]) expected.push({ time: b.time as number, message: 'Magnet Pull Up: Price returning to core from Oversold' });
    });
    expect(r.alertCalls.map((x) => ({ time: x.time, message: x.message }))).toEqual(expected);
    expect(r.alertCalls.every((x) => x.freq === 'once_per_bar_close')).toBe(true);
  });
});

describe('maket-strat-absorption-bubbles', () => {
  const r = maket.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(maket)).toEqual([
      ['alert0', 'Maket Strat Buying Absorption Bubble', 'Maket Strat Absorption Bubbles: Buying absorption bubble detected. Buyers may be absorbing selling pressure.'],
      ['alert1', 'Maket Strat Selling Absorption Bubble', 'Maket Strat Absorption Bubbles: Selling absorption bubble detected. Sellers may be absorbing buying pressure.'],
      ['alert2', 'Maket Strat Absorption Bubble', 'Maket Strat Absorption Bubbles: Absorption bubble detected.'],
    ]);
    expect(maket.MaketStratAbsorptionBubbles.alertConditions).toBe(maket.alertConditions);
  });
  it('fires on the confirmed bars with a bubble in the lower / upper wick', () => {
    const sd = A(ta.stdev(S(bars, bars.map((b) => b.volume ?? NaN)), 100));
    const buy: boolean[] = [], sell: boolean[] = [];
    bars.forEach((b, i) => {
      const scaled = !isNaN(sd[i]) && Math.abs(sd[i]) > EPS ? (b.volume as number) / sd[i] : 0;
      const any = ge(scaled, 0.1);
      const mid = (b.high + b.low) / 2;
      const top = Math.max(b.open, b.close), bot = Math.min(b.open, b.close);
      sell.push(any && ge(mid, top) && le(mid, b.high));
      buy.push(any && le(mid, bot) && ge(mid, b.low));
    });
    expect(buy.filter(Boolean).length).toBeGreaterThan(3);
    expect(sell.filter(Boolean).length).toBeGreaterThan(3);
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
    expect(r.alerts[2].times).toEqual(timeAt(bars, or(buy, sell)));
    const open = maket.calculate(bars, {}, { lastBarConfirmed: false });
    expect(open.alerts[2].times).toEqual(r.alerts[2].times.filter((t) => t !== bars[n - 1].time));
  });
  it('gives the bubbles the ids of their plotshape outputs (selling 0-4, buying 5-9 by band)', () => {
    expect(r.markers.every((m) => /^shape\d$/.test(m.id ?? ''))).toBe(true);
    for (const m of r.markers) {
      const k = Number(m.id!.slice(5));
      expect(m.color).toBe(k < 5 ? 'rgb(150, 0, 0)' : 'rgb(0, 120, 0)');
    }
    expect(markerIds(r).length).toBeGreaterThan(3);
  });
});

describe('market-cipher-a', () => {
  const r = cipherA.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(cipherA)).toEqual([
      ['alert0', 'Red Diamond', 'Red Diamond'],
      ['alert1', 'Blood Diamond', 'Blood Diamond'],
      ['alert2', 'YellowX', 'YellowX'],
      ['alert3', 'RedX', 'RedX'],
      ['alert4', 'Longema', 'Longema'],
      ['alert5', 'Bluetriangle', 'Bluetriangle'],
    ]);
    expect(cipherA.MarketCipherA.alertConditions).toBe(cipherA.alertConditions);
  });
  it('fires on the signals of the original', () => {
    const c = S(bars, close);
    const ema = (len: number) => A(ta.ema(c, len));
    const [e1, e2, e3, e8] = [ema(5), ema(11), ema(15), ema(34)];
    const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
    const esa = A(ta.ema(S(bars, hlc3), 9));
    const de = A(ta.ema(S(bars, hlc3.map((v, i) => Math.abs(v - esa[i]))), 9));
    const ci = hlc3.map((v, i) => (v - esa[i]) / (0.015 * de[i]));
    const wt1 = A(ta.ema(S(bars, ci), 13));
    const wt2 = A(ta.sma(S(bars, wt1), 3));
    const rsi = A(ta.rsi(c, 14));
    const mfi = A(ta.sma(S(bars, bars.map((b) => ((b.close - b.open) / (b.high - b.low)) * 150)), 60));
    const wtCross = or(over(wt1, wt2), under(wt1, wt2));
    const redDiamond = wtCross.map((v, i) => v && wt2[i] - wt1[i] >= 0);
    const redCross = under(e1, e2);
    const yellow = redDiamond.map((v, i) => v && wt2[i] < 45 && wt2[i] > -80 && rsi[i] < 30 && rsi[i] > 15 && mfi[i] < -5);
    const blood = redDiamond.map((v, i) => v && redCross[i]);
    const longEma = over(e2, e8);
    const blue = over(e2, e3);
    expect(redDiamond.filter(Boolean).length).toBeGreaterThan(20);
    expect(r.alerts[0].times).toEqual(timeAt(bars, redDiamond));
    expect(r.alerts[1].times).toEqual(timeAt(bars, blood));
    expect(r.alerts[2].times).toEqual(timeAt(bars, yellow));
    expect(r.alerts[3].times).toEqual(timeAt(bars, redCross));
    expect(r.alerts[4].times).toEqual(timeAt(bars, longEma));
    expect(r.alerts[5].times).toEqual(timeAt(bars, blue));
  });
  it('gives every marker the id of its plotshape output', () => {
    expect(r.markers.every((m) => /^shape[0-7]$/.test(m.id ?? ''))).toBe(true);
    expect(markerIds(r)).toEqual(expect.arrayContaining(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6']));
    const after = r.alerts[4].times.filter((t) => t > (bars[61].time as number));
    expect(r.markers.filter((m) => m.id === 'shape0').map((m) => m.time)).toEqual(after);
  });
});

describe('market-pressure-oscillator', () => {
  const r = mpo.calculate(bars, { signalType: 'All' });
  it('declares the alertconditions of the original', () => {
    expect(decls(mpo)).toEqual([
      ['alert0', 'Bullish Divergence Detected', 'Bullish divergence detected at pivot, lookback right bars ago.'],
      ['alert1', 'Bearish Divergence Detected', 'Bearish divergence detected at pivot, lookback right bars ago.'],
      ['alert2', 'Buy Signal (Oversold)', 'Oscillator crossed above the oversold threshold.'],
      ['alert3', 'Sell Signal (Overbought)', 'Oscillator crossed below the overbought threshold.'],
      ['alert4', 'Buy Signal (Zero Line)', 'Oscillator crossed above the zero line.'],
      ['alert5', 'Sell Signal (Zero Line)', 'Oscillator crossed below the zero line.'],
      ['alert6', 'Buy Signal (MA Zero Line)', 'Moving Average crossed above the zero line.'],
      ['alert7', 'Sell Signal (MA Zero Line)', 'Moving Average crossed below the zero line.'],
    ]);
    expect(mpo.MarketPressureOscillator.alertConditions).toBe(mpo.alertConditions);
  });
  it('fires on the threshold and zero-line crosses', () => {
    const len = 14;
    const body = bars.map((b) => Math.abs(b.close - b.open));
    const avgBody = A(ta.sma(S(bars, body), len));
    const contrib = bars.map((b, i) => {
      const dir = gt(b.close, b.open) ? 1 : lt(b.close, b.open) ? -1 : 0;
      return dir * (!isNaN(avgBody[i]) && avgBody[i] !== 0 ? body[i] / avgBody[i] : 1);
    });
    const norm = contrib.map((_, i) => {
      if (i < len - 1) return NaN;
      let s = 0;
      for (let k = 0; k < len; k++) s += contrib[i - k];
      return (s / (len * 2)) * 100;
    });
    const osc = A(ta.ema(S(bars, norm), 1));
    const ma = A(ta.sma(S(bars, osc), 14));
    const expected = [over(osc, -30), under(osc, 30), over(osc, 0), under(osc, 0), over(ma, 0), under(ma, 0)];
    expected.forEach((f, k) => expect(r.alerts[2 + k].times).toEqual(timeAt(bars, f)));
    expect(expected[2].filter(Boolean).length).toBeGreaterThan(10);
    // whatever the signal type shown
    const none = mpo.calculate(bars, { signalType: 'None' });
    expect(none.alerts.map((a) => a.times)).toEqual(r.alerts.map((a) => a.times));
  });
  it('fires the divergences on the bar that confirms the pivot of the label', () => {
    const lb = 2;
    const idx = new Map(bars.map((b, i) => [b.time as number, i]));
    const confirm = (id: string) => r.markers.filter((m) => m.id === id).map((m) => bars[idx.get(m.time as number)! + lb].time);
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[0].times).toEqual(confirm('shape6'));
    expect(r.alerts[1].times).toEqual(confirm('shape7'));
  });
  it('gives the triangles and labels the ids of their plotshape outputs', () => {
    expect(markerIds(r)).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7']);
    const timesOf = (id: string) => r.markers.filter((m) => m.id === id).map((m) => m.time);
    [0, 1, 2, 3, 4, 5].forEach((k) => expect(timesOf(`shape${k}`)).toEqual(r.alerts[2 + k].times));
  });
});

describe('market-profile', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(profile)).toEqual([
      ['alert0', 'Price in POC', 'Price in POC'],
      ['alert1', 'Price went above POC', 'Price went above POC'],
      ['alert2', 'Price went below POC', 'Price went below POC'],
    ]);
    expect(profile.MarketProfile.alertConditions).toBe(profile.alertConditions);
  });
  it('fires on the close in / above / below the POC channel of the last profile', () => {
    const list = bars.slice(0, 700);
    const r = profile.calculate(list, { timeframe: 'W' });
    const starts = periodStarts(list, 'W');
    let hHtf = NaN, lHtf = NaN, num = 0;
    let highest = list[0].high, lowest = list[0].low, poc = 0;
    const inP: boolean[] = [], above: boolean[] = [], below: boolean[] = [];
    list.forEach((b, i) => {
      const newbar = i > 0 && starts[i] !== starts[i - 1];
      const [ph, pl, pn] = [hHtf, lHtf, num];
      if (newbar) { hHtf = b.high; lHtf = b.low; num = 0; } else { hHtf = Math.max(hHtf, b.high); lHtf = Math.min(lHtf, b.low); num++; }
      if (newbar) {
        highest = ph; lowest = pl;
        const ch = (highest - lowest) / 20;
        const counts: number[] = new Array(22).fill(0);
        for (let x = 1; x <= 20; x++) {
          const lo = lowest + (x - 1) * ch, up = lowest + x * ch;
          for (let k = 1; k <= pn; k++) {
            const [l, h] = [list[i - k].low, list[i - k].high];
            if ((ge(l, lo) && le(l, up)) || (ge(h, lo) && le(h, up)) || (le(l, lo) && ge(h, up))) counts[x]++;
          }
        }
        let best = 0;
        for (let x = 1; x <= 20; x++) if (counts[x] >= best) { best = counts[x]; poc = x; }
      }
      const ch = (highest - lowest) / 20;
      const base = (x: number) => lowest + (x - 1) * ch;
      inP.push(ge(b.close, base(poc)) && le(b.close, base(poc + 1)));
      above.push(gt(b.close, base(poc + 1)));
      below.push(le(b.close, base(poc)));
    });
    const wentAbove = above.map((v, i) => i > 0 && (inP[i - 1] || below[i - 1]) && v);
    const wentBelow = below.map((v, i) => i > 0 && (inP[i - 1] || above[i - 1]) && v);
    expect(inP.filter(Boolean).length).toBeGreaterThan(5);
    expect(wentAbove.filter(Boolean).length).toBeGreaterThan(5);
    expect(r.alerts[0].times).toEqual(timeAt(list, inP));
    expect(r.alerts[1].times).toEqual(timeAt(list, wentAbove));
    expect(r.alerts[2].times).toEqual(timeAt(list, wentBelow));
  });
});

describe('market-pulse-pro', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(pulse)).toEqual([
      ['alert0', 'Bull 🟢 crossed X 🡅 Bear 🔴', 'Pulse-X: Bull 🟢 crossed above Bear 🔴'],
      ['alert1', 'Bear 🟠 crossed X 🡅 Bull 🔵', 'Pulse-X: Bear 🟠 crossed above Bull 🔵'],
      ['alert2', 'Bull Line rose 🡅 level 50', 'Pulse-X: Bull Line rose 🡅 level 50'],
      ['alert3', 'Bear Line fell 🡇 level 50', 'Pulse-X: Bear Line fell 🡇 level 50'],
    ]);
    expect(pulse.MarketPulsePro.alertConditions).toBe(pulse.alertConditions);
  });
  it('fires on the crosses of the bull and bear lines (EMA smoothing)', () => {
    const r = pulse.calculate(bars, { signalSmoothingMethod: 'EMA', normalSmoothingMethod: 'EMA' });
    const H = (a: number[], l: number) => A(ta.highest(S(bars, a), l));
    const L = (a: number[], l: number) => A(ta.lowest(S(bars, a), l));
    const E = (a: number[], l: number) => A(ta.ema(S(bars, a), l));
    const hh = H(bars.map((b) => b.high), 21), ll = L(bars.map((b) => b.low), 21);
    const smiIn = bars.map((b, i) => {
      const rng = hh[i] - ll[i];
      return ((b.close - (hh[i] + ll[i]) / 2) / (Math.abs(rng) <= EPS ? 1 : rng / 2)) * 100;
    });
    const smiK = E(smiIn, 5);
    const rsi = A(ta.rsi(S(bars, close), 14));
    const rh = H(rsi, 14), rl = L(rsi, 14);
    const stoch = rsi.map((v, i) => ((v - rl[i]) / (Math.abs(rh[i] - rl[i]) <= EPS ? 1 : rh[i] - rl[i])) * 100);
    const sig = E(close, 20);
    const sh = H(sig, 20), sl = L(sig, 20);
    const buyDom = bars.map((_, i) => {
      const ns = (sig[i] - sl[i]) / (Math.abs(sh[i] - sl[i]) <= EPS ? 1 : sh[i] - sl[i]);
      return (((smiK[i] + 100) / 200 + stoch[i] / 100 + ns) / 3) * 100;
    });
    const buy = E(buyDom, 10);
    const sell = E(buyDom.map((v) => 100 - v), 10);
    const f = [over(buy, sell), over(sell, buy), over(buy, 50), under(buy, 50)];
    expect(f[0].filter(Boolean).length).toBeGreaterThan(10);
    f.forEach((x, k) => expect(r.alerts[k].times).toEqual(timeAt(bars, x)));
  });
  it('fires on the crosses of the drawn lines (default HMA smoothing)', () => {
    const r = pulse.calculate(bars);
    const b = r.plots.plot0.map((p) => p.value);
    const s = r.plots.plot1.map((p) => p.value);
    expect(r.alerts[0].times).toEqual(timeAt(bars, over(b, s)));
    expect(r.alerts[3].times).toEqual(timeAt(bars, under(b, 50)));
    expect(r.alerts[0].times.length).toBeGreaterThan(10);
  });
});

describe('market-sentiment-technicals', () => {
  it('gives the divergence labels the ids of their plotshape outputs', () => {
    const r = sentiment.calculate(bars, { mrktOscDivergence: 'All' });
    expect(r.markers.length).toBeGreaterThan(0);
    expect(r.markers.every((m) => ['shape0', 'shape1', 'shape2', 'shape3'].includes(m.id ?? ''))).toBe(true);
    for (const m of r.markers) expect(m.shape).toBe(m.id === 'shape0' || m.id === 'shape1' ? 'labelUp' : 'labelDown');
    expect(markerIds(r).length).toBeGreaterThan(1);
  });
});

describe('market-sessions-by-leviathan', () => {
  // 30-minute bars on weekdays (UTC), 30 days
  const intraday: Bar[] = (() => {
    const raw = walk(30 * 48, 11, 1800, 1704067200); // 2024-01-01, a Monday
    return raw.filter((b) => { const d = new Date((b.time as number) * 1000).getUTCDay(); return d !== 0 && d !== 6; });
  })();
  const now = (intraday[intraday.length - 1].time as number) * 1000 + 3600000;
  const chart = { now, timeframe: '30' };
  const hourOf = (b: Bar) => new Date((b.time as number) * 1000).getUTCHours();
  const inHours = (b: Bar, from: number, to: number) => hourOf(b) >= from && hourOf(b) < to;
  const hours: [number, number][] = [[0, 9], [7, 16], [13, 22]];
  it('declares the alertconditions of the original', () => {
    expect(decls(sessions).map((d) => d[1])).toEqual([
      'Tokyo Open', 'London Open', 'New York Open', 'Sydney Open',
      'Tokyo Session - New High', 'London Session - New High', 'New York Session - New High', 'Sydney Session - New High',
      'Tokyo Session - New Low', 'London Session - New Low', 'New York Session - New Low', 'Sydney Session - New Low',
    ]);
    expect(sessions.alertConditions[10].message).toBe('New Low In New York Session');
    expect(sessions.MarketSessionsByLeviathan.alertConditions).toBe(sessions.alertConditions);
  });
  it('fires on the session starts, and the "new low" of the original (low above the session low)', () => {
    const r = sessions.calculate(intraday, {}, chart);
    hours.forEach(([from, to], k) => {
      const active = intraday.map((b) => inHours(b, from, to));
      const start = active.map((a, i) => a && !(i > 0 && active[i - 1]));
      let low = 0;
      const newLow = intraday.map((b, i) => {
        if (start[i]) low = b.low;
        else if (active[i]) low = Math.min(low, b.low);
        return active[i] && b.low > low;
      });
      expect(start.filter(Boolean).length).toBeGreaterThan(15);
      expect(r.alerts[k].times).toEqual(timeAt(intraday, start));
      // the high is updated before the test of the original: no new high inside the lookback
      expect(r.alerts[4 + k].times).toEqual([]);
      expect(r.alerts[8 + k].times).toEqual(timeAt(intraday, newLow));
    });
    expect(r.alerts[3].times.length).toBeGreaterThan(15);
  });
  it('gives the timeline squares, zone backgrounds and bar colours the ids of their outputs', () => {
    const tl = sessions.calculate(intraday, { displayType: 'Timeline' }, chart);
    expect(markerIds(tl)).toEqual(['shape0', 'shape1', 'shape2']);
    const t0 = new Set(tl.markers.filter((m) => m.id === 'shape0').map((m) => m.time));
    expect(intraday.filter((b) => inHours(b, 0, 9)).every((b) => t0.has(b.time))).toBe(true);
    const zones = sessions.calculate(intraday, { displayType: 'Zones' }, chart);
    expect(zones.bgColors.length).toBeGreaterThan(0);
    expect([...new Set(zones.bgColors.map((c) => c.id))].sort()).toEqual(['bgcolor0', 'bgcolor1', 'bgcolor2']);
    const merged = sessions.calculate(intraday, { displayType: 'Zones', merge: true }, chart);
    expect(merged.bgColors.every((c) => ['bgcolor4', 'bgcolor5', 'bgcolor6', 'bgcolor7'].includes(c.id ?? ''))).toBe(true);
    const candles = sessions.calculate(intraday, { displayType: 'Candles' }, chart);
    expect([...new Set(candles.barColors.map((c) => c.id))].sort()).toEqual(['barcolor0', 'barcolor1', 'barcolor2']);
    // the last call with a colour wins: New York bars that are also London bars show the New York colour
    const ny = new Set(intraday.filter((b) => inHours(b, 13, 22)).map((b) => b.time));
    expect(candles.barColors.filter((c) => ny.has(c.time)).every((c) => c.id === 'barcolor2')).toBe(true);
    const candlesMerged = sessions.calculate(intraday, { displayType: 'Candles', merge: true }, chart);
    expect(candlesMerged.barColors.every((c) => /^barcolor[4-7]$/.test(c.id ?? ''))).toBe(true);
    expect(candlesMerged.barColors.length).toBeGreaterThan(0);
  });
});

describe('market-structure-break-order-block', () => {
  const list = bars.slice(0, 700);
  const r = msb.calculate(list);
  it('declares the alertcondition and the alert() calls of the original', () => {
    expect(decls(msb)).toEqual([['alert0', 'MSB', 'MSB']]);
    expect(msb.hasAlertFunction).toBe(true);
    expect(msb.MarketStructureBreakOrderBlock.hasAlertFunction).toBe(true);
    expect(msb.MarketStructureBreakOrderBlock.alertConditions).toBe(msb.alertConditions);
  });
  it('fires "MSB" on each break (one label and one level line per break)', () => {
    expect(r.labels.length).toBeGreaterThan(3);
    expect(r.labels.length).toBeLessThan(50);
    expect(r.alerts[0].times.length).toBe(r.labels.length);
    expect(r.alerts[0].times.length).toBe(r.lines.filter((l) => l.width === 2).length);
    // the break is on the bar: a calculation that ends on that bar has the condition on its last bar
    for (const t of r.alerts[0].times.slice(0, 3)) {
      const k = list.findIndex((b) => b.time === t);
      expect(msb.calculate(list.slice(0, k + 1)).alerts[0].triggered).toBe(true);
      expect(msb.calculate(list.slice(0, k)).alerts[0].triggered).toBe(false);
    }
  });
  it('calls alert() once per bar when the close is in a zone', () => {
    const messages = new Set(['Price in the BU-OB zone', 'Price in the BE-OB zone', 'Price in the BE-BB zone', 'Price in the BU-BB zone']);
    expect(r.alertCalls.length).toBeGreaterThan(10);
    expect(r.alertCalls.every((c) => messages.has(c.message) && c.freq === 'once_per_bar')).toBe(true);
    const times = list.map((b) => b.time as number);
    expect(r.alertCalls.every((c) => times.includes(c.time))).toBe(true);
    // no zone before the first break
    expect(Math.min(...r.alertCalls.map((c) => c.time))).toBeGreaterThanOrEqual(r.alerts[0].times[0]);
  });
});

describe('market-structure-dashboard-flux-charts', () => {
  const hourly = walk(24 * 60, 5, 3600, 1704067200);
  const chart = { timeframe: '60', now: (hourly[hourly.length - 1].time as number) * 1000 + 3600000 };
  it('declares alert() calls and makes none with the alert inputs off', () => {
    expect(msd.hasAlertFunction).toBe(true);
    expect(msd.MarketStructureDashboardFluxCharts.hasAlertFunction).toBe(true);
    expect(msd.calculate(hourly, {}, chart).alertCalls).toEqual([]);
  });
  it('calls alert() on the volume state changes', () => {
    const r = msd.calculate(hourly, { alertCtfVolume: true }, chart);
    const avg = A(ta.sma(S(hourly, hourly.map((b) => b.volume ?? NaN)), 20));
    const p = hourly.map((b, i) => ((b.volume as number) / avg[i]) * 100);
    const state = p.map((v) => (gt(v, 200) ? 'EXTREME' : gt(v, 120) ? 'HIGH' : gt(v, 80) ? 'NORMAL' : gt(v, 50) ? 'LOW' : 'VERY LOW'));
    const changed = state.map((s, i) => i > 0 && s !== state[i - 1]);
    expect(r.alertCalls.map((c) => c.time)).toEqual(timeAt(hourly, changed));
    expect(r.alertCalls[0].message).toMatch(/^🔊 Volume → (EXTREME|HIGH|NORMAL|LOW|VERY LOW) \((\d+|NaN)% of avg\)$/);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar')).toBe(true);
  });
  it('calls alert() on the session changes of the bar time (New York)', () => {
    const r = msd.calculate(hourly, { alertSession: true }, chart);
    const name = (b: Bar) => {
      const h = pineTime.hour((b.time as number) * 1000, 'America/New_York');
      return h >= 19 || h < 3 ? 'ASIAN' : h >= 8 && h < 17 ? 'NEW YORK' : h >= 3 && h < 8 ? 'LONDON' : 'OFF HOURS';
    };
    const expected: string[] = [];
    hourly.forEach((b, i) => {
      if (i === 0) return;
      const [a, c] = [name(hourly[i - 1]), name(b)];
      if (a === c) return;
      expected.push(c === 'OFF HOURS' ? `🕐 ${a} Session Ended` : a === 'OFF HOURS' ? `🕐 ${c} Session Started` : `🕐 ${a} → ${c}`);
    });
    expect(r.alertCalls.map((c) => c.message)).toEqual(expected);
    expect(expected).toContain('🕐 NEW YORK Session Ended');
    expect(expected).toContain('🕐 ASIAN → LONDON');
  });
  it('calls alert() for the dashboard rows, the current timeframe and the levels with every alert on', () => {
    const all = Object.fromEntries(Object.keys(msd.defaultInputs).filter((k) => k.startsWith('alert')).map((k) => [k, true]));
    const r = msd.calculate(hourly, all, chart);
    const msgs = r.alertCalls.map((c) => c.message);
    expect(msgs.some((m) => /^⚡ \[1H\] Swing (High|Low) Broken$/.test(m))).toBe(true);
    expect(msgs.some((m) => /^📊 \[4H\] Structure → (Bullish ↑|Bearish ↓|Neutral →)$/.test(m))).toBe(true);
    expect(msgs.some((m) => /^📈 \[D\] EMA Trend → (Bullish ↑|Bearish ↓)$/.test(m))).toBe(true);
    expect(msgs.some((m) => /^⚡ \[CTF\] Swing (High|Low) Broken$/.test(m))).toBe(true);
    expect(msgs.some((m) => /^📉 Volatility → (HIGH|NORMAL|LOW)$/.test(m))).toBe(true);
    expect(msgs.some((m) => /^🎯 .+ (Started|Ended)$/.test(m))).toBe(true);
    expect(msgs.some((m) => /^📊 Trend Bias → .+ \((--|[+-]?\d+\/\d+)\)$/.test(m))).toBe(true);
    expect(msgs.some((m) => /^⚡ PD[HL] Broken$/.test(m))).toBe(true);
    expect(msgs.some((m) => /^🔄 PD[HL] Swept & Reclaimed [⤴⤵]$/.test(m))).toBe(true);
    // the timeframes below the chart timeframe are not active
    expect(msgs.some((m) => /\[(1M|5M|15M)\]/.test(m))).toBe(false);
    // the dashboard is the same as without the alerts
    expect(r.tables).toEqual(msd.calculate(hourly, {}, chart).tables);
  });
});
