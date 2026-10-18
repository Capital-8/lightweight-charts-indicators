/**
 * Community ports, batch 49: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression on seeded bars), and the Style
 * ids / outputs (plotchar / plotshape markers, fill titles).
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as mcb from '../../src/community/market-cipher-b';
import * as rsisr from '../../src/community/rsi-support-resistance-by-dgt';
import * as srb from '../../src/community/sr-levels-breaks';
import * as stc from '../../src/community/schaff-trend-cycle';
import * as wto from '../../src/community/wavetrend-oscillator';

/** Seeded random walk with volume */
function makeBars(count: number, step: number, seed: number, start = 1_600_000_000): Bar[] {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = Math.max(1, open * (1 + (rnd() - 0.5) * 0.04));
    const high = Math.max(open, close) * (1 + rnd() * 0.015);
    const low = Math.min(open, close) * (1 - rnd() * 0.015);
    const volume = Math.round(1000 + rnd() * 9000 * (rnd() < 0.1 ? 5 : 1));
    bars.push({ time: start + i * step, open, high, low, close, volume });
    price = close;
  }
  return bars;
}

const DAY = 86400;
const daily = makeBars(1200, DAY, 12345);
const daily2 = makeBars(1500, DAY, 987);
const m15 = makeBars(1200, 900, 4242);

const arr = (s: Series) => s.toArray().map((v) => (v == null ? NaN : v));
const src = (bars: Bar[], f: (b: Bar) => number) => new Series(bars, f);
const timesOf = (bars: Bar[], flags: boolean[]) => bars.filter((_b, i) => flags[i]).map((b) => b.time);

function decls(list: { id: string; title: string; message?: string }[]) {
  return list.map((d) => [d.id, d.title, d.message]);
}

describe('sr-levels-breaks', () => {
  it('declares the original alertconditions', () => {
    expect(decls(srb.alertConditions)).toEqual([
      ['alert0', 'Support Broken', 'Support Broken'],
      ['alert1', 'Resistance Broken', 'Resistance Broken'],
    ]);
    expect(srb.SRLevelsBreaks.alertConditions).toBe(srb.alertConditions);
  });

  it.each([['daily', daily], ['daily2', daily2], ['m15', m15]] as const)('alert bars and marker ids (%s)', (_name, bars) => {
    const n = bars.length;
    const res = srb.calculate(bars);
    // highUsePivot = fixnan(pivothigh(15, 15)[1]); lowUsePivot = fixnan(pivotlow(15, 15)[1])
    const ph = arr(ta.pivothigh(src(bars, (b) => b.high), 15, 15));
    const pl = arr(ta.pivotlow(src(bars, (b) => b.low), 15, 15));
    const hp: number[] = [];
    const lp: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? ph[i - 1] : NaN;
      const b = i > 0 ? pl[i - 1] : NaN;
      hp.push(!isNaN(a) ? a : i > 0 ? hp[i - 1] : NaN);
      lp.push(!isNaN(b) ? b : i > 0 ? lp[i - 1] : NaN);
    }
    const vol = src(bars, (b) => b.volume!);
    const e5 = arr(ta.ema(vol, 5));
    const e10 = arr(ta.ema(vol, 10));
    const osc = e5.map((v, i) => (100 * (v - e10[i])) / e10[i]);
    const close = bars.map((b) => b.close);
    const under = close.map((c, i) => i > 0 && c < lp[i] && close[i - 1] >= lp[i - 1]);
    const over = close.map((c, i) => i > 0 && c > hp[i] && close[i - 1] <= hp[i - 1]);
    const support = under.map((u, i) => u && osc[i] > 20);
    const resistance = over.map((o, i) => o && osc[i] > 20);
    expect(res.alerts.map((a) => a.id)).toEqual(['alert0', 'alert1']);
    expect(res.alerts[0].times).toEqual(timesOf(bars, support));
    expect(res.alerts[1].times).toEqual(timesOf(bars, resistance));
    expect(res.alerts[0].triggered).toBe(support[n - 1]);

    // plotshape ids: B down / B up / Bull Wick / Bear Wick
    const want: string[] = [];
    for (let i = 1; i < n; i++) {
      const { open: o, high: h, low: l, close: c } = bars[i];
      if (under[i] && !(o - c < h - o) && osc[i] > 20) want.push(`${bars[i].time}:shape0`);
      if (over[i] && !(o - l > c - o) && osc[i] > 20) want.push(`${bars[i].time}:shape1`);
      if (over[i] && o - l > c - o) want.push(`${bars[i].time}:shape2`);
      if (under[i] && o - c < h - o) want.push(`${bars[i].time}:shape3`);
    }
    expect(res.markers.map((m) => `${m.time}:${m.id}`)).toEqual(want);
    const textOf: Record<string, string> = { shape0: 'B', shape1: 'B', shape2: 'Bull Wick', shape3: 'Bear Wick' };
    for (const m of res.markers) expect(m.text).toBe(textOf[m.id!]);
  });

  it('fires on the seeded bars and keeps the alerts with Show Breaks off', () => {
    const all = [daily, daily2, m15].map((b) => srb.calculate(b));
    expect(all.some((r) => r.alerts[0].times.length > 0)).toBe(true);
    expect(all.some((r) => r.alerts[1].times.length > 0)).toBe(true);
    expect(all.some((r) => r.markers.length > 0)).toBe(true);
    const off = srb.calculate(daily, { toggleBreaks: false });
    expect(off.markers).toEqual([]);
    expect(off.alerts).toEqual(srb.calculate(daily).alerts);
  });
});

describe('rsi-support-resistance-by-dgt', () => {
  it('declares the original alertconditions', () => {
    expect(decls(rsisr.alertConditions)).toEqual([
      ['alert0', 'Price Crossed Above OB Level',
        'RSI S&R: Price crossed above prior RSI overbought level\n{{exchange}}:{{ticker}} | Price={{close}} | {{time}}'],
      ['alert1', 'Price Crossed Below OS Level',
        'RSI S&R: Price crossed below prior RSI oversold level\n{{exchange}}:{{ticker}} | Price={{close}} | {{time}}'],
    ]);
    expect(rsisr.RsiSupportResistanceByDgt.alertConditions).toBe(rsisr.alertConditions);
  });

  it.each([['daily', daily], ['daily2', daily2], ['m15', m15]] as const)('alert bars (%s)', (_name, bars) => {
    const res = rsisr.calculate(bars);
    const rsi = arr(ta.rsi(src(bars, (b) => b.close), 14));
    // f_getPrice(rsi, 70, 'over') / f_getPrice(rsi, 30, 'under'), var return_1 = 0.
    const obLevel: number[] = [];
    const osLevel: number[] = [];
    let ob = 0;
    let os = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const r = rsi[i];
      const rp = i > 0 ? rsi[i - 1] : NaN;
      if (r > 70 && rp <= 70) ob = (b.high + b.close) / 2;
      if (r < 30 && rp >= 30) os = (b.low + b.close) / 2;
      obLevel.push(ob);
      osLevel.push(os);
    }
    const c = bars.map((b) => b.close);
    const above = c.map((v, i) => i > 0 && v > obLevel[i] && c[i - 1] <= obLevel[i - 1]);
    const below = c.map((v, i) => i > 0 && v < osLevel[i] && c[i - 1] >= osLevel[i - 1]);
    expect(res.alerts[0].times).toEqual(timesOf(bars, above));
    expect(res.alerts[1].times).toEqual(timesOf(bars, below));
  });

  it('fires on the seeded bars', () => {
    const all = [daily, daily2, m15].map((b) => rsisr.calculate(b));
    expect(all.some((r) => r.alerts[0].times.length > 0)).toBe(true);
    expect(all.some((r) => r.alerts[1].times.length > 0)).toBe(true);
  });
});

/** Independent recomputation of the original's conditions (chart timeframe for the Sommi parts: daily bars) */
function cipherExpected(bars: Bar[]) {
  const n = bars.length;
  const hlc3 = src(bars, (b) => (b.high + b.low + b.close) / 3);
  const esa = ta.ema(hlc3, 9);
  const apEsa = arr(hlc3).map((v, i) => v - arr(esa)[i]);
  const de = arr(ta.ema(Series.fromArray(bars, apEsa.map(Math.abs)), 9));
  const ci = apEsa.map((v, i) => v / (0.015 * de[i]));
  const wt1 = arr(ta.ema(Series.fromArray(bars, ci), 12));
  const wt2 = arr(ta.sma(Series.fromArray(bars, wt1), 3));
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const cross = wt1.map((v, i) => i > 0 && ((v > wt2[i] && wt1[i - 1] <= wt2[i - 1]) || (v < wt2[i] && wt1[i - 1] >= wt2[i - 1])));
  const up = wt2.map((v, i) => v - wt1[i] <= 0);
  const down = wt2.map((v, i) => v - wt1[i] >= 0);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);

  // f_findDivs(wt2, top, bot, true): valuewhen(...)[2] by scanning back for the latest fractal at or before i - 2
  const divs = (s: number[], top: number, bot: number) => {
    const isTop = (i: number) => at(s, i - 4) < at(s, i - 2) && at(s, i - 3) < at(s, i - 2) && at(s, i - 2) > at(s, i - 1) && at(s, i - 2) > s[i]
      && at(s, i - 2) >= top;
    const isBot = (i: number) => at(s, i - 4) > at(s, i - 2) && at(s, i - 3) > at(s, i - 2) && at(s, i - 2) < at(s, i - 1) && at(s, i - 2) < s[i]
      && at(s, i - 2) <= bot;
    const last = (cond: (j: number) => boolean, i: number) => {
      for (let j = i - 2; j >= 0; j--) if (cond(j)) return j;
      return -1;
    };
    const bear: boolean[] = [];
    const bull: boolean[] = [];
    const lowPrev: number[] = [];
    const fractalBot: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const jt = last(isTop, i);
      const jb = last(isBot, i);
      const lp = jb >= 0 ? at(s, jb - 2) : NaN;
      lowPrev.push(lp);
      fractalBot.push(isBot(i));
      bear.push(isTop(i) && at(high, i - 2) > (jt >= 0 ? at(high, jt - 2) : NaN) && at(s, i - 2) < (jt >= 0 ? at(s, jt - 2) : NaN));
      bull.push(isBot(i) && at(low, i - 2) < (jb >= 0 ? at(low, jb - 2) : NaN) && at(s, i - 2) > lp);
    }
    return { bear, bull, lowPrev, fractalBot };
  };
  const d1 = divs(wt2, 45, -65);
  const d2 = divs(wt2, 15, -40);
  const rsi = arr(ta.rsi(src(bars, (b) => b.close), 14));
  const gold = wt2.map((v, i) => {
    let lastRsi = NaN;
    for (let j = i - 2; j >= 0; j--) {
      if (d1.fractalBot[j]) {
        lastRsi = at(rsi, j - 2);
        break;
      }
    }
    return d1.bull[i] && d1.lowPrev[i] <= -75 && v > -75 && d1.lowPrev[i] - v <= -5 && lastRsi < 30;
  });
  // rsiMFI = sma(((close - open) / (high - low)) * 150, 60) - 2.5
  const mfi = arr(ta.sma(src(bars, (b) => ((b.close - b.open) / (b.high - b.low)) * 150), 60)).map((v) => v - 2.5);
  // Heikin Ashi of the chart bars (the HTF candle resolutions are lower than daily)
  const haDir: boolean[] = [];
  let haOpen = NaN;
  let haClose = NaN;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const c = (b.open + b.high + b.low + b.close) / 4;
    const o = i === 0 ? (b.open + b.close) / 2 : (haOpen + haClose) / 2;
    haOpen = o;
    haClose = c;
    haDir.push(c > o);
  }
  const vw = wt1.map((v, i) => v - wt2[i]);
  const sommiBear = wt2.map((v, i) => mfi[i] < 0 && v > 0 && cross[i] && down[i] && vw[i] < 0);
  const sommiBull = wt2.map((v, i) => mfi[i] > 0 && v < 0 && cross[i] && up[i] && vw[i] > 0);
  const diamondBear = wt2.map((v, i) => v >= 0 && cross[i] && down[i] && !haDir[i]);
  const diamondBull = wt2.map((v, i) => v <= 0 && cross[i] && up[i] && haDir[i]);
  const buy = wt2.map((v, i) => cross[i] && up[i] && v <= -53);
  const sell = wt2.map((v, i) => cross[i] && down[i] && v >= 53);
  const buyDiv = d1.bull.map((b, i) => b || d2.bull[i]);
  const sellDiv = d1.bear.map((b, i) => b || d2.bear[i]);
  return {
    flags: [
      buy, buyDiv, gold,
      sommiBull.map((b, i) => b || diamondBull[i]),
      cross.map((c, i) => c && up[i]),
      sommiBear.map((b, i) => b || diamondBear[i]),
      sell, sellDiv,
      cross.map((c, i) => c && down[i]),
    ],
    sommiBear, sommiBull, diamondBear, diamondBull, buy, sell, buyDiv, sellDiv, gold,
  };
}

describe('market-cipher-b', () => {
  it('declares the original alertconditions', () => {
    expect(decls(mcb.alertConditions)).toEqual([
      ['alert0', 'Buy (Big green circle)', 'Green circle WaveTrend Oversold'],
      ['alert1', 'Buy (Big green circle + Div)', 'Buy & WT Bullish Divergence & WT Overbought'],
      ['alert2', 'GOLD Buy (Big GOLDEN circle)', 'Green & GOLD circle WaveTrend Overbought'],
      ['alert3', 'Sommi bullish flag/diamond', 'Blue flag/diamond'],
      ['alert4', 'Buy (Small green dot)', 'Buy small circle'],
      ['alert5', 'Sommi bearish flag/diamond', 'Purple flag/diamond'],
      ['alert6', 'Sell (Big red circle)', 'Red Circle WaveTrend Overbought'],
      ['alert7', 'Sell (Big red circle + Div)', 'Buy & WT Bearish Divergence & WT Overbought'],
      ['alert8', 'Sell (Small red dot)', 'Sell small circle'],
    ]);
    expect(mcb.MarketCipherB.alertConditions).toBe(mcb.alertConditions);
  });

  it.each([['daily', daily], ['daily2', daily2]] as const)('alert bars (%s)', (_name, bars) => {
    const res = mcb.calculate(bars);
    const want = cipherExpected(bars);
    res.alerts.forEach((a, k) => expect(a.times, a.title).toEqual(timesOf(bars, want.flags[k])));
  });

  it('every condition fires on the seeded bars', () => {
    const all = [daily, daily2, makeBars(1500, DAY, 31337), makeBars(1500, DAY, 777)].map((b) => mcb.calculate(b));
    for (let k = 0; k < 9; k++) {
      expect(all.some((r) => r.alerts[k].times.length > 0), mcb.alertConditions[k].title).toBe(true);
    }
  });

  it('plotchar markers carry the ids of the original outputs, at their bars and prices', () => {
    const bars = daily;
    const res = mcb.calculate(bars, { sommiFlagShow: true, sommiDiamondShow: true });
    const want = cipherExpected(bars);
    const ids = new Set(['char0', 'char1', 'char2', 'char3', 'char4', 'char5', 'char6', 'char7', 'char8']);
    for (const m of res.markers) expect(ids.has(m.id!)).toBe(true);
    const timesById = (id: string) => res.markers.filter((m) => m.id === id).map((m) => m.time);
    const shift = (flags: boolean[]) => bars.filter((_b, i) => flags[i + 2]).map((b) => b.time);
    expect(timesById('char0')).toEqual(timesOf(bars, want.sommiBear));
    expect(timesById('char1')).toEqual(timesOf(bars, want.sommiBull));
    expect(timesById('char2')).toEqual(timesOf(bars, want.diamondBear));
    expect(timesById('char3')).toEqual(timesOf(bars, want.diamondBull));
    expect(timesById('char4')).toEqual(timesOf(bars, want.buy));
    expect(timesById('char5')).toEqual(timesOf(bars, want.sell));
    expect(timesById('char6')).toEqual(shift(want.buyDiv));
    expect(timesById('char7')).toEqual(shift(want.sellDiv));
    expect(timesById('char8')).toEqual(shift(want.gold));
    const price: Record<string, number> = {
      char0: 108, char1: -108, char2: 108, char3: -108, char4: -107, char5: 105, char6: -106, char7: 106, char8: -106,
    };
    const chars: Record<string, string> = {
      char0: '⚑', char1: '⚑', char2: '◆', char3: '◆', char4: '·', char5: '·', char6: '•', char7: '•', char8: '•',
    };
    for (const m of res.markers) {
      expect(m.position).toBe('atPriceMiddle');
      expect(m.price).toBe(price[m.id!]);
      expect(m.char).toBe(chars[m.id!]);
    }
    for (const id of ids) expect(timesById(id).length, id).toBeGreaterThan(0);
    // defaults: the Sommi characters are off
    const def = mcb.calculate(bars);
    expect(def.markers.some((m) => ['char0', 'char1', 'char2', 'char3'].includes(m.id!))).toBe(false);
    expect(def.markers.length).toBeGreaterThan(0);
    for (const m of def.markers) expect(ids.has(m.id!)).toBe(true);
  });

  it('gives the MFI Bar Colors and KD Fill fills', () => {
    const res = mcb.calculate(daily);
    const fills = res.fills!.map((f: any) => [f.plot1, f.plot2, f.options?.title]);
    expect(fills).toEqual([
      ['mfiBarTop', 'mfiBarBottom', 'MFI Bar Colors'],
      ['stochK', 'stochD', 'KD Fill'],
    ]);
    expect(res.plots.mfiBarTop.every((p: any) => p.value === -95)).toBe(true);
    expect(res.plots.stochK.some((p: any) => Number.isFinite(p.value))).toBe(true);
    expect(mcb.plotConfig.map((p) => p.id)).toEqual(Object.keys(res.plots));
  });

  it('uses the higher-timeframe bars on 15-minute bars', () => {
    const res = mcb.calculate(m15, { sommiFlagShow: true, sommiDiamondShow: true });
    expect(res.alerts).toHaveLength(9);
    const ids = new Set(['char0', 'char1', 'char2', 'char3', 'char4', 'char5', 'char6', 'char7', 'char8']);
    for (const m of res.markers) expect(ids.has(m.id!)).toBe(true);
    // the Sommi alerts are the flag or the diamond characters of the same bars
    const t = (id: string) => res.markers.filter((m) => m.id === id).map((m) => m.time);
    const bull = [...new Set([...t('char1'), ...t('char3')])].sort((a, b) => a - b);
    const bear = [...new Set([...t('char0'), ...t('char2')])].sort((a, b) => a - b);
    expect(res.alerts[3].times).toEqual(bull);
    expect(res.alerts[5].times).toEqual(bear);
  });
});

describe('ports without new outputs', () => {
  it('schaff-trend-cycle and wavetrend-oscillator have no alert conditions', () => {
    expect((stc as any).alertConditions).toBeUndefined();
    expect((wto as any).alertConditions).toBeUndefined();
    expect('alerts' in stc.calculate(daily)).toBe(false);
    expect('alerts' in wto.calculate(daily)).toBe(false);
  });
});
