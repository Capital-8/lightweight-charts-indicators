/**
 * Alerts and Style ids of 16 community ports (batch 21): the alertcondition() declarations (ids, titles and messages
 * of the originals), the bars on which each condition is true (re-computed here from the original's expression), the
 * alert() calls, and the Style-settings ids on the emitted markers.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, type Bar } from 'oakscriptjs';
import * as lrs from '../../src/community/liquidation-reversal-signals';
import * as ldp from '../../src/community/liquidity-delta-profiler';
import * as lfz from '../../src/community/liquidity-flow-zones';
import * as grabs from '../../src/community/liquidity-grabs';
import * as lind from '../../src/community/liquidity-indicator';
import * as sonar from '../../src/community/liquidity-levels-mtf-sonarlab';
import * as lld from '../../src/community/liquidity-location-detector';
import * as pools from '../../src/community/liquidity-pools-pro';
import * as lupen from '../../src/community/liquidity-sentiment-profile-lupen';
import * as lsc from '../../src/community/liquidity-sweep-confirmation';
import * as lsf from '../../src/community/liquidity-sweep-filter';
import * as trap from '../../src/community/liquidity-trap-reversal-bot';
import * as zones from '../../src/community/liquidity-zones';
import * as logistic from '../../src/community/logistic-rsi-stoch-roc-ao-by-dgt';
import * as dom from '../../src/community/long-short-dom';
import * as lor from '../../src/community/lorentzian-classification';

/** Seeded random walk of daily bars with a random volume (5 % of the bars with a volume spike) */
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
const bars = walk(1200, 11);
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const uniq = <T>(a: T[]) => [...new Set(a)];
const markerTimes = (ms: { id?: string; time: number }[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time);
const chart = { tickerid: 'NASDAQ:TEST' };

/** ta.crossover / ta.crossunder with exact comparisons (na = false) */
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

/** Independent SMA / EMA (SMA seed) / RMA (SMA seed) / population stdev / highest / lowest / sum */
function window(src: number[], len: number, f: (w: number[]) => number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    const w = src.slice(i - len + 1, i + 1);
    return w.some(isNaN) ? NaN : f(w);
  });
}
const sma = (src: number[], len: number) => window(src, len, (w) => w.reduce((s, v) => s + v, 0) / len);
const sum = (src: number[], len: number) => window(src, len, (w) => w.reduce((s, v) => s + v, 0));
const stdev = (src: number[], len: number) => window(src, len, (w) => {
  const m = w.reduce((s, v) => s + v, 0) / len;
  return Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / len);
});
const highest = (src: number[], len: number) => window(src, len, (w) => Math.max(...w));
const lowest = (src: number[], len: number) => window(src, len, (w) => Math.min(...w));
function smoothed(src: number[], len: number, alpha: number): number[] {
  const out: number[] = [];
  let prev = NaN;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(prev)) {
      let s = 0, ok = i >= len - 1;
      for (let k = i - len + 1; ok && k <= i; k++) { if (isNaN(src[k])) ok = false; else s += src[k]; }
      prev = ok ? s / len : NaN;
    } else {
      prev = alpha * src[i] + (1 - alpha) * prev;
    }
    out.push(prev);
  }
  return out;
}
const ema = (src: number[], len: number) => smoothed(src, len, 2 / (len + 1));
const rma = (src: number[], len: number) => smoothed(src, len, 1 / len);
const trueRange = (list: Bar[]) => list.map((b, i) => (i === 0 ? b.high - b.low
  : Math.max(b.high - b.low, Math.abs(b.high - list[i - 1].close), Math.abs(b.low - list[i - 1].close))));
const atr = (list: Bar[], len: number) => rma(trueRange(list), len);
function rsi(src: number[], len: number): number[] {
  const up = src.map((v, i) => (i === 0 ? NaN : Math.max(v - src[i - 1], 0)));
  const dn = src.map((v, i) => (i === 0 ? NaN : Math.max(src[i - 1] - v, 0)));
  const u = rma(up, len), d = rma(dn, len);
  return u.map((x, i) => (isNaN(x) || isNaN(d[i]) ? NaN : d[i] === 0 ? 100 : x === 0 ? 0 : 100 - 100 / (1 + x / d[i])));
}
/** ta.pivothigh / ta.pivotlow: the value of bar i - right on bar i when it is above (below) all bars around it */
function pivot(src: number[], left: number, right: number, isHigh: boolean): number[] {
  return src.map((_, i) => {
    const c = i - right;
    if (c - left < 0) return NaN;
    for (let k = c - left; k <= i; k++) {
      if (k === c) continue;
      if (isHigh ? src[k] >= src[c] : src[k] <= src[c]) return NaN;
    }
    return src[c];
  });
}

describe('liquidation-reversal-signals', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(lrs)).toEqual([
      ['alert0', 'Bullish ST Start', 'Bullish supertrend became visible after qualifying liquidation and confirmation.'],
      ['alert1', 'Bearish ST Start', 'Bearish supertrend became visible after qualifying liquidation and confirmation.'],
      ['alert2', 'Short Liquidation Spike', 'Short-side liquidation detected (zU > threshold).'],
      ['alert3', 'Long Liquidation Spike', 'Long-side liquidation detected (zD > threshold).'],
    ]);
    expect(lrs.LiquidationReversalSignals.alertConditions).toBe(lrs.alertConditions);
  });
  it('fires on the bars of the original expressions and gives the shape ids', () => {
    const zThresh = 2, length = 200;
    // the up / down volume of the chart bars (lower timeframe = chart timeframe)
    let buy = true;
    const u: number[] = [], d: number[] = [];
    bars.forEach((b, i) => {
      const pc = i > 0 ? bars[i - 1].close : NaN;
      if (b.close > b.open) buy = true;
      else if (b.open > b.close) buy = false;
      else if (b.close > pc) buy = true;
      else if (pc > b.close) buy = false;
      u.push(buy ? b.volume! : 0);
      d.push(buy ? 0 : b.volume!); // d := -d of a negative down volume
    });
    const z = (x: number[]) => {
      const m = sma(x, length), s = stdev(x, length);
      return x.map((v, i) => (s[i] !== 0 ? (v - m[i]) / s[i] : NaN));
    };
    const zU = z(u), zD = z(d);
    const direction = ta.supertrend(bars, 2, 10)[1].toArray().map((v) => v ?? NaN);
    const shortLiq = direction.map((v, i) => v < 0 && zU[i] > zThresh);
    const longLiq = direction.map((v, i) => v > 0 && zD[i] > zThresh);
    const r = lrs.calculate(bars, { lowerTF: '1D', zThresh }, { timeframe: '1D' });
    expect(shortLiq.some(Boolean) && longLiq.some(Boolean)).toBe(true);
    expect(r.alerts[2].times).toEqual(timeAt(bars, shortLiq));
    expect(r.alerts[3].times).toEqual(timeAt(bars, longLiq));
    // the start labels and the liquidation dots carry the ids of their plotshape / plotchar outputs
    expect(r.alerts[0].times.length + r.alerts[1].times.length).toBeGreaterThan(0);
    expect(markerTimes(r.markers, 'shape0')).toEqual(r.alerts[0].times);
    expect(markerTimes(r.markers, 'shape1')).toEqual(r.alerts[1].times);
    expect(markerTimes(r.markers, 'char2')).toEqual(r.alerts[2].times);
    expect(markerTimes(r.markers, 'char3')).toEqual(r.alerts[3].times);
    expect(r.markers.every((m) => ['shape0', 'shape1', 'char2', 'char3'].includes(m.id as string))).toBe(true);
  });
});

describe('liquidity-delta-profiler', () => {
  it('makes the alert() calls of the original', () => {
    expect(ldp.hasAlertFunction).toBe(true);
    expect(ldp.LiquidityDeltaProfiler.hasAlertFunction).toBe(true);
    const r = ldp.calculate(bars);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar')).toBe(true);
    const rx = [
      /^Price testing Resistance BSL Zone at (-?[\d.]+)$/, /^Price testing Support SSL Zone at (-?[\d.]+)$/,
      /^Resistance BSL Zone Swept at (-?[\d.]+)$/, /^Support SSL Zone Swept at (-?[\d.]+)$/,
      /^Reversal Signal \((ABS|EXH|DIV|REJ)\) detected at (-?[\d.]+)$/,
    ];
    rx.forEach((x) => expect(r.alertCalls.some((c) => x.test(c.message))).toBe(true));
    expect(r.alertCalls.every((c) => rx.some((x) => x.test(c.message)))).toBe(true);
    // one reversal call per reversal label, at the close of its bar
    const reversal = r.alertCalls.filter((c) => c.message.startsWith('Reversal'));
    const signalLabels = r.labels.filter((l) => ['ABS', 'EXH', 'DIV', 'REJ'].includes(l.text ?? ''));
    expect(reversal.map((c) => `${c.time} ${c.message.slice(17, 20)}`).sort())
      .toEqual(signalLabels.map((l) => `${l.time} ${l.text}`).sort());
    reversal.forEach((c) => {
      const b = bars.find((x) => x.time === c.time)!;
      expect(Number(c.message.split(' at ')[1])).toBeCloseTo(b.close, 8);
    });
    // a swept zone: the bar goes beyond its level
    r.alertCalls.filter((c) => c.message.includes('Swept')).forEach((c) => {
      const b = bars.find((x) => x.time === c.time)!;
      const level = Number(c.message.split(' at ')[1]);
      expect(c.message.startsWith('Resistance') ? b.high > level : b.low < level).toBe(true);
    });
  });
});

describe('liquidity-flow-zones', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(lfz)).toEqual([
      ['alert0', 'Bullish Liquidity Sweep', 'Bullish Liquidity Sweep detected'],
      ['alert1', 'Bearish Liquidity Sweep', 'Bearish Liquidity Sweep detected'],
    ]);
    expect(lfz.LiquidityFlowZones.alertConditions).toBe(lfz.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const ph = pivot(high, 5, 5, true), pl = pivot(low, 5, 5, false), a = atr(bars, 14);
    let lastHigh = NaN, lastLow = NaN;
    const bull: boolean[] = [], bear: boolean[] = [];
    bars.forEach((b, i) => {
      if (!isNaN(ph[i])) lastHigh = ph[i];
      if (!isNaN(pl[i])) lastLow = pl[i];
      bear.push(!isNaN(lastHigh) && b.high > lastHigh + a[i] * 0.2 && b.close < lastHigh);
      bull.push(!isNaN(lastLow) && b.low < lastLow - a[i] * 0.2 && b.close > lastLow);
    });
    const r = lfz.calculate(bars);
    expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, bull));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bear));
  });
});

describe('liquidity-grabs', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(grabs)).toEqual([
      ['alert0', 'Buyside Liquidity Grab @ {{ticker}}', 'Buyside Liquidity Grab @ {{ticker}}'],
      ['alert1', 'Sellside Liquidity Grab @ {{ticker}}', 'Sellside Liquidity Grab @ {{ticker}}'],
    ]);
    expect(grabs.LiquidityGrabs.alertConditions).toBe(grabs.alertConditions);
  });
  it('fires on the bars of the original expressions (whatever the cooldown)', () => {
    const list = walk(1500, 5);
    const H = list.map((b) => b.high), L = list.map((b) => b.low);
    const ph = pivot(H, 25, 25, true), pl = pivot(L, 25, 25, false);
    const buys: number[] = [], sells: number[] = [];
    const buy: boolean[] = [], sell: boolean[] = [];
    list.forEach((b, i) => {
      if (!isNaN(ph[i])) { buys.push(ph[i]); if (buys.length > 5) buys.shift(); }
      if (!isNaN(pl[i])) { sells.push(pl[i]); if (sells.length > 5) sells.shift(); }
      const top = Math.max(b.close, b.open), bot = Math.min(b.close, b.open), body = Math.abs(b.close - b.open);
      let found = false, isBuy = true, size = NaN;
      const remove: number[] = [];
      for (const liq of buys) {
        if (b.high > liq && top < liq) { found = true; size = Math.floor(Math.min((b.high - top) / body / 0.5, 3)); remove.push(liq); break; }
        if (top > liq) { remove.push(liq); break; }
      }
      if (!found) {
        for (const liq of sells) {
          if (b.low < liq && bot > liq) { found = true; isBuy = false; size = Math.floor(Math.min((bot - b.low) / body / 0.5, 3)); remove.push(liq); break; }
          if (bot < liq) { remove.push(liq); break; }
        }
      }
      for (const liq of remove) {
        const k = buys.indexOf(liq);
        if (k !== -1) { buys.splice(k, 1); continue; }
        const j = sells.indexOf(liq);
        if (j !== -1) sells.splice(j, 1);
      }
      buy.push(found && size > 0 && isBuy);
      sell.push(found && size > 0 && !isBuy);
    });
    const r = grabs.calculate(list);
    expect(buy.some(Boolean) && sell.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(list, buy));
    expect(r.alerts[1].times).toEqual(timeAt(list, sell));
    // every drawn bubble is an alert bar; the cooldown can hide bubbles of alert bars
    const drawn = (keys: string[]) => list.filter((_, i) => keys.some((k) => !isNaN((r.plots[k] as { value: number }[])[i].value)))
      .map((b) => b.time);
    expect(drawn(['buySm', 'buyMd', 'buyLg']).every((t) => r.alerts[0].times.includes(t))).toBe(true);
    expect(drawn(['sellSm', 'sellMd', 'sellLg']).every((t) => r.alerts[1].times.includes(t))).toBe(true);
    // barstate.isconfirmed: an open last bar gives no alert
    const lastT = list[list.length - 1].time;
    const open = grabs.calculate(list, {}, { lastBarConfirmed: false });
    expect(open.alerts[0].times).toEqual(r.alerts[0].times.filter((t) => t !== lastT));
  });
});

describe('liquidity-indicator', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(lind)).toEqual([
      ['alert0', 'Local High Detected', 'Local high detected at [CurrencyPair] [TimeFrame]'],
      ['alert1', 'Local Low Detected', 'Local low detected at [CurrencyPair] [TimeFrame]'],
    ]);
    expect(lind.LiquidityIndicator.alertConditions).toBe(lind.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const hh = highest(high, 10), ll = lowest(low, 10);
    const isHigh = high.map((h, i) => h === hh[i]), isLow = low.map((l, i) => l === ll[i]);
    const r = lind.calculate(bars);
    expect(isHigh.some(Boolean) && isLow.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, isHigh));
    expect(r.alerts[1].times).toEqual(timeAt(bars, isLow));
  });
});

describe('liquidity-levels-mtf-sonarlab', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(sonar)).toEqual([
      ['alert0', 'New High', 'Price is breaking out!'],
      ['alert1', 'New Low', 'Price is breaking down!'],
      ['alert2', 'New HTF High', 'Price is breaking out!'],
      ['alert3', 'New HTF Low', 'Price is breaking down!'],
    ]);
    expect(sonar.LiquidityLevelsMtfSonarlab.alertConditions).toBe(sonar.alertConditions);
    expect(sonar.hasAlertFunction).toBe(true);
    expect(sonar.LiquidityLevelsMtfSonarlab.hasAlertFunction).toBe(true);
  });
  it('fires when a level is mitigated, and makes the alert() calls with the input texts', () => {
    // "Remove" mitigated levels: at most 2 open levels per side (displayLimit / 2 = 2.5)
    const ph = pivot(high, 15, 5, true), pl = pivot(low, 15, 5, false);
    const highs: number[] = [], lows: number[] = [];
    const newHigh: boolean[] = [], newLow: boolean[] = [];
    bars.forEach((b, i) => {
      if (i >= 6 && ph[i - 1]) highs.push(bars[i - 6].high);
      if (i >= 6 && pl[i - 1]) lows.push(bars[i - 6].low);
      const prevClose = i > 0 ? bars[i - 1].close : NaN;
      let mh = false, ml = false;
      for (let k = highs.length - 1; k >= 0; k--) if (prevClose > highs[k]) { highs.splice(k, 1); mh = true; }
      if (highs.length > 2.5) highs.shift();
      for (let k = lows.length - 1; k >= 0; k--) if (prevClose < lows[k]) { lows.splice(k, 1); ml = true; }
      if (lows.length > 2.5) lows.shift();
      newHigh.push(mh);
      newLow.push(ml);
    });
    const r = sonar.calculate(bars, { mitiOptions: 'Remove' }, { timeframe: '1D' });
    expect(newHigh.some(Boolean) && newLow.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, newHigh));
    expect(r.alerts[1].times).toEqual(timeAt(bars, newLow));
    expect(r.alerts[2].times).toEqual([]);
    expect(r.alerts[3].times).toEqual([]);
    const calls = (msg: string) => r.alertCalls.filter((c) => c.message === msg).map((c) => c.time);
    expect(calls('Break out!')).toEqual(r.alerts[0].times);
    expect(calls('Break down!')).toEqual(r.alerts[1].times);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar')).toBe(true);
    // the alert inputs: off = no call, the text is the input
    const off = sonar.calculate(bars, { mitiOptions: 'Remove', alertNewHigh: false, alertNewLowTxt: 'Down' }, { timeframe: '1D' });
    expect(off.alertCalls.filter((c) => c.message === 'Break out!')).toEqual([]);
    expect(off.alertCalls.filter((c) => c.message === 'Down').map((c) => c.time)).toEqual(r.alerts[1].times);
    // the higher timeframe levels (here the chart timeframe) give the HTF alerts and their calls
    const htf = sonar.calculate(bars, { htfBool: true, alertNewHigh: false, alertNewLow: false }, { timeframe: '1D' });
    expect(htf.alerts[2].times.length).toBeGreaterThan(0);
    expect(htf.alerts[3].times.length).toBeGreaterThan(0);
    expect(htf.alertCalls.filter((c) => c.message === 'Break out!').map((c) => c.time)).toEqual(htf.alerts[2].times);
    expect(htf.alertCalls.filter((c) => c.message === 'Break down!').map((c) => c.time)).toEqual(htf.alerts[3].times);
  });
});

describe('liquidity-location-detector', () => {
  it('gives the plotshape ids of the EMA crosses', () => {
    const r = lld.calculate(bars, { ema1: true, ema2: true });
    const f = ema(close, 20), s = ema(close, 35);
    expect(markerTimes(r.markers, 'shape0')).toEqual(timeAt(bars, xover(f, s)));
    expect(markerTimes(r.markers, 'shape1')).toEqual(timeAt(bars, xunder(f, s)));
    expect(markerTimes(r.markers, 'shape0').length).toBeGreaterThan(0);
    expect(r.markers.every((m) => m.id === 'shape0' || m.id === 'shape1')).toBe(true);
  });
});

describe('liquidity-pools-pro', () => {
  const list = walk(1500, 7, 3600, 1577836800);
  const ctx = { tickerid: 'NASDAQ:TEST', timeframe: '60', mintick: 0.01 };
  it('makes the alert() calls of the original', () => {
    expect(pools.hasAlertFunction).toBe(true);
    expect(pools.LiquidityPoolsPro.hasAlertFunction).toBe(true);
    const r = pools.calculate(list, { alertUpdate: true }, ctx);
    expect(r.alertCalls.length).toBeGreaterThan(0);
    expect(r.alertCalls.every((c) => c.freq === 'once_per_bar_close')).toBe(true);
    const entries = r.alertCalls.filter((c) => /SWEEP (BUY|SELL)/.test(c.message));
    expect(entries.length).toBeGreaterThan(0);
    // trade ids 1, 2, 3, ... in the entry order; the entries are on signal bars ("Long" / "Short" labels)
    entries.forEach((c, k) => {
      expect(c.message).toMatch(new RegExp(`^(🟢 SWEEP BUY|🔴 SWEEP SELL) \\| NASDAQ:TEST \\| ID: ${k + 1} \\| TF: 60 \\| Price: \\d+\\.\\d\\d \\| Pool: \\d+/100 \\| SL: \\d+\\.\\d\\d \\| TP1: \\d+\\.\\d\\d \\| TP2: \\d+\\.\\d\\d \\| TP3: \\d+\\.\\d\\d \\| R:R: [\\d.]+$`));
      const b = list.find((x) => x.time === c.time)!;
      expect(c.message).toContain(`Price: ${b.close.toFixed(2)}`);
      const lbl = r.labels.find((l) => l.time === c.time && l.text === (c.message.includes('BUY') ? 'Long' : 'Short'));
      expect(lbl).toBeDefined();
    });
    // each trade closes once (stop or TP3) before the next one, with its own id
    const exits = r.alertCalls.filter((c) => /^(🛑 SL HIT|🛡️ BE STOP-OUT|🏆 TP3 HIT)/.test(c.message));
    expect(exits.length).toBeGreaterThan(0);
    exits.forEach((c) => expect(c.message).toMatch(/\| ID: \d+ \|/));
    const ids = (cs: typeof exits) => cs.map((c) => Number(/ID: (\d+)/.exec(c.message)![1]));
    expect(uniq(ids(exits)).length).toBe(exits.length);
    expect(r.alertCalls.some((c) => c.message.startsWith('🎯 TP1 HIT'))).toBe(true);
    // without the update input: no TP1 / TP2 / break-even calls
    const quiet = pools.calculate(list, {}, ctx);
    expect(quiet.alertCalls.some((c) => /^(🎯|🛡️ BREAK-EVEN)/.test(c.message))).toBe(false);
    expect(quiet.alertCalls.filter((c) => /SWEEP/.test(c.message))).toEqual(entries);
    // webhook JSON
    const hook = pools.calculate(list, { webhook: true, alertUpdate: true }, ctx);
    expect(hook.alertCalls.length).toBe(r.alertCalls.length);
    hook.alertCalls.forEach((c) => {
      const j = JSON.parse(c.message);
      expect(['buy', 'sell', 'exit', 'update']).toContain(j.action);
      expect(j.ticker).toBe('NASDAQ:TEST');
      expect(j.tf).toBe('60');
    });
  });
});

describe('liquidity-sentiment-profile-lupen', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(lupen)).toEqual([
      ['alert0', 'LSP Buy', 'LSP Bullish Crossover'],
      ['alert1', 'LSP Sell', 'LSP Bearish Crossover'],
    ]);
    expect(lupen.LiquiditySentimentProfileLupen.alertConditions).toBe(lupen.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const bull = bars.map((b) => ((b.close > b.open ? Math.abs(b.close - b.open) : 0) + Math.min(b.close, b.open) - b.low) * b.volume!);
    const bear = bars.map((b) => ((b.close < b.open ? Math.abs(b.close - b.open) : 0) + b.high - Math.max(b.close, b.open)) * b.volume!);
    const sb = sma(bull, 14).map((v) => v * 14), sr = sma(bear, 14).map((v) => v * 14);
    const raw = sb.map((v, i) => {
      const t = v + sr[i];
      return !isNaN(t) && t !== 0 ? ((v - sr[i]) / t) * 100 : 0;
    });
    const sig = ema(raw, 5);
    const r = lupen.calculate(bars);
    expect(xover(raw, sig).some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, xover(raw, sig)));
    expect(r.alerts[1].times).toEqual(timeAt(bars, xunder(raw, sig)));
  });
});

describe('liquidity-sweep-confirmation', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(lsc)).toEqual([
      ['alert0', 'BUY Alert', 'Liquidity Sweep BUY'],
      ['alert1', 'SELL Alert', 'Liquidity Sweep SELL'],
      ['alert2', 'RSI LONG TP', 'RSI TP LONG'],
      ['alert3', 'RSI SHORT TP', 'RSI TP SHORT'],
    ]);
    expect(lsc.LiquiditySweepConfirmation.alertConditions).toBe(lsc.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const ph = pivot(high, 3, 3, true), pl = pivot(low, 3, 3, false);
    const rejLow = lowest(low, 3), rejHigh = highest(high, 3), r14 = rsi(close, 14);
    let lastHigh = NaN, lastLow = NaN, sweptHigh = false, sweptLow = false, inLong = false, inShort = false;
    let prevLE = false, prevSE = false;
    const f: boolean[][] = [[], [], [], []];
    bars.forEach((b, i) => {
      if (!isNaN(ph[i])) lastHigh = ph[i];
      if (!isNaN(pl[i])) lastLow = pl[i];
      if (!isNaN(lastHigh) && b.high > lastHigh) sweptHigh = true;
      if (!isNaN(lastLow) && b.low < lastLow) sweptLow = true;
      const sell = sweptHigh && b.close < rejLow[i - 1];
      const buy = sweptLow && b.close > rejHigh[i - 1];
      if (buy) sweptLow = false;
      if (sell) sweptHigh = false;
      if (buy) { inLong = true; inShort = false; }
      if (sell) { inShort = true; inLong = false; }
      const le = inLong && r14[i] >= 70, se = inShort && r14[i] <= 30;
      const longTP = inLong && prevLE && r14[i] < 70, shortTP = inShort && prevSE && r14[i] > 30;
      prevLE = le; prevSE = se;
      if (longTP) inLong = false;
      if (shortTP) inShort = false;
      [buy, sell, longTP, shortTP].forEach((x, k) => f[k].push(x));
    });
    const r = lsc.calculate(bars);
    f.forEach((x, k) => {
      expect(x.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(bars, x));
    });
  });
});

describe('liquidity-sweep-filter', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(lsf)).toEqual([
      ['alert0', 'Bullish Trend', 'Bullish Trend'],
      ['alert1', 'Bearish Trend', 'Bearish Trend'],
      ['alert2', 'Strong Bullish Sweep', 'Strong Bullish Sweep'],
      ['alert3', 'Strong Bearish Sweep', 'Strong Bearish Sweep'],
      ['alert4', 'Bullish Sweep', 'Bullish Sweep'],
      ['alert5', 'Bearish Sweep', 'Bearish Sweep'],
    ]);
    expect(lsf.LiquiditySweepFilter.alertConditions).toBe(lsf.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const basis = sma(ema(close, 12), 12);
    const dev = ema(close.map((c, i) => Math.abs(c - basis[i])), 36).map((v) => v * 2);
    let t = 0;
    const trend = close.map((c, i) => {
      if (c > basis[i] + dev[i]) t = 1;
      if (c < basis[i] - dev[i]) t = -1;
      return t;
    });
    const r = lsf.calculate(bars);
    expect(xover(trend, 0).some(Boolean) && xunder(trend, 0).some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, xover(trend, 0)));
    expect(r.alerts[1].times).toEqual(timeAt(bars, xunder(trend, 0)));
    // the sweep conditions are those of the sweep characters (plotchar ▲ ▼ △ ▽)
    const chars = (text: string) => r.markers.filter((m) => m.text === text && m.shape === 'circle').map((m) => m.time);
    ['▲', '▼', '△', '▽'].forEach((ch, k) => {
      expect(chars(ch).length).toBeGreaterThan(0);
      expect(r.alerts[2 + k].times).toEqual(chars(ch));
    });
    // a strong sweep is also a sweep
    expect(r.alerts[2].times.every((x) => r.alerts[4].times.includes(x))).toBe(true);
  });
});

describe('liquidity-trap-reversal-bot', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(trap)).toEqual([
      ['alert0', '111% Liquidity Long', 'Liquidity swept at the 111% Low Extension. Bullish Reversal triggered.'],
      ['alert1', '111% Liquidity Short', 'Liquidity swept at the 111% High Extension. Bearish Reversal triggered.'],
      ['alert2', 'Pivot High Breakout', 'Close crossed ABOVE the Pivot High. Bullish Breakout confirmed.'],
      ['alert3', 'Pivot Low Breakdown', 'Close crossed BELOW the Pivot Low. Bearish Breakdown confirmed.'],
    ]);
    expect(trap.LiquidityTrapReversalBot.alertConditions).toBe(trap.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const list = walk(1500, 3);
    const H = list.map((b) => b.high), L = list.map((b) => b.low);
    const ph = pivot(H, 15, 15, true), pl = pivot(L, 15, 15, false);
    // ta.crossover / ta.crossunder called only when the left operand of `and` is true: their own history
    const lazy = (over: boolean) => {
      let pa = NaN, pb = NaN;
      return (a: number, b: number) => {
        const res = over ? a > b && pa <= pb : a < b && pa >= pb;
        pa = a; pb = b;
        return res;
      };
    };
    const sc = lazy(false), lc = lazy(true), bo = lazy(true), bd = lazy(false);
    let lastPh = NaN, lastPl = NaN, range = NaN, shortArmed = false, longArmed = false;
    const f: boolean[][] = [[], [], [], []];
    list.forEach((b, i) => {
      if (!isNaN(ph[i])) { lastPh = ph[i]; if (!isNaN(lastPl)) range = Math.abs(lastPh - lastPl); }
      if (!isNaN(pl[i])) { lastPl = pl[i]; if (!isNaN(lastPh)) range = Math.abs(lastPh - lastPl); }
      if (b.high >= lastPh + range * 0.11) shortArmed = true;
      if (!isNaN(ph[i])) shortArmed = false;
      const shortSig = shortArmed && sc(b.close, lastPh);
      if (shortSig) shortArmed = false;
      if (b.low <= lastPl - range * 0.11) longArmed = true;
      if (!isNaN(pl[i])) longArmed = false;
      const longSig = longArmed && lc(b.close, lastPl);
      if (longSig) longArmed = false;
      const has = !isNaN(range);
      [longSig, shortSig, has && bo(b.close, lastPh), has && bd(b.close, lastPl)].forEach((x, k) => f[k].push(x));
    });
    const r = trap.calculate(list);
    f.forEach((x, k) => {
      expect(x.some(Boolean)).toBe(true);
      expect(r.alerts[k].times).toEqual(timeAt(list, x));
    });
  });
});

describe('liquidity-zones', () => {
  it('gives the plotshape ids of the filtered pivots', () => {
    const r = zones.calculate(bars, { flt: 'Low' });
    expect(r.markers.length).toBeGreaterThan(0);
    expect(uniq(r.markers.map((m) => m.id)).sort()).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    // shape0 / shape1: the two circles of a pivot high (small / tiny), shape2 / shape3 of a pivot low
    expect(markerTimes(r.markers, 'shape0')).toEqual(markerTimes(r.markers, 'shape1'));
    expect(markerTimes(r.markers, 'shape2')).toEqual(markerTimes(r.markers, 'shape3'));
    r.markers.forEach((m) => {
      const b = bars.find((x) => x.time === m.time)!;
      expect(m.price).toBe(m.id === 'shape0' || m.id === 'shape1' ? b.high : b.low);
      expect(m.size).toBe(m.id === 'shape0' || m.id === 'shape2' ? 'small' : 'tiny');
    });
  });
});

describe('logistic-rsi-stoch-roc-ao-by-dgt', () => {
  it('declares the alertconditions of the original', () => {
    const tail = '\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}';
    expect(decls(logistic)).toEqual([
      ['alert0', 'Long : Early Warning', 'LOGISTIC - Not Confirmed Probable Long Trade Opportunity' + tail],
      ['alert1', 'Long : Trading Opportunity', 'LOGISTIC - Probable Long Trade Opportunity' + tail],
      ['alert2', 'Short : Early Warning', 'LOGISTIC - Not Confirmed Probable Short Trade Opportunity' + tail],
      ['alert3', 'Short : Trading Opportunity', 'LOGISTIC - Probable Short Trade Opportunity' + tail],
    ]);
    expect(logistic.LogisticRsiStochRocAoByDgt.alertConditions).toBe(logistic.alertConditions);
  });
  const now = (bars[bars.length - 1].time + 86400) * 1000;
  it('fires on the crosses of the standard deviation line', () => {
    const r = logistic.calculate(bars, {}, { now });
    const sd = (r.plots.plot27 as { value: number }[]).map((p) => p.value);
    const up = xover(sd, 0), dn = xunder(sd, 0);
    const shift = (x: boolean[]) => x.map((_, i) => i > 0 && x[i - 1]);
    expect(up.some(Boolean) && dn.some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, up));
    expect(r.alerts[1].times).toEqual(timeAt(bars, shift(up)));
    expect(r.alerts[2].times).toEqual(timeAt(bars, dn));
    expect(r.alerts[3].times).toEqual(timeAt(bars, shift(dn)));
    expect(r.alertCalls).toEqual([]); // backtest off: no alert() call
  });
  it('makes the alert() calls of the backtest framework', () => {
    expect(logistic.hasAlertFunction).toBe(true);
    const r = logistic.calculate(bars, { isBackTest: true, isStopLoss: true }, { now, ...chart });
    const rx = /^(Long entry|Short entry|Stop loss|Long early warning|Short early warning) — NASDAQ:TEST \| Price: (-?[\d.]+)$/;
    expect(r.alertCalls.length).toBeGreaterThan(0);
    r.alertCalls.forEach((c) => {
      expect(c.message).toMatch(rx);
      expect(c.freq).toBe('once_per_bar');
      const b = bars.find((x) => x.time === c.time)!;
      expect(Number(rx.exec(c.message)![2])).toBeCloseTo(b.close, 8);
    });
    const kinds = uniq(r.alertCalls.map((c) => rx.exec(c.message)![1]));
    expect(kinds).toEqual(expect.arrayContaining(['Long entry', 'Short entry', 'Long early warning', 'Short early warning']));
    // the early warnings come one bar after a cross; the entries on the bars of entry labels
    const after = (times: number[]) => times.map((t) => t + 86400);
    r.alertCalls.filter((c) => c.message.startsWith('Long early')).forEach((c) => expect(after(r.alerts[0].times)).toContain(c.time));
    r.alertCalls.filter((c) => c.message.startsWith('Short early')).forEach((c) => expect(after(r.alerts[2].times)).toContain(c.time));
    r.alertCalls.filter((c) => c.message.startsWith('Long entry')).forEach((c) =>
      expect(r.labels.some((l) => l.text === 'L' && l.time === c.time)).toBe(true));
    r.alertCalls.filter((c) => c.message.startsWith('Short entry')).forEach((c) =>
      expect(r.labels.some((l) => l.text === 'S' && l.time === c.time)).toBe(true));
  });
});

describe('long-short-dom', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(dom)).toEqual([
      ['alert0', 'VI+ пересекает VI- вверх', 'VI+ пересек VI- вверх (возможный лонг)'],
      ['alert1', 'VI+ пересекает VI- вниз', 'VI+ пересек VI- вниз (возможный шорт)'],
    ]);
    expect(dom.LongShortDom.alertConditions).toBe(dom.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const vmp = sum(bars.map((b, i) => (i > 0 ? Math.abs(b.high - bars[i - 1].low) : NaN)), 14);
    const vmm = sum(bars.map((b, i) => (i > 0 ? Math.abs(b.low - bars[i - 1].high) : NaN)), 14);
    const str = sum(trueRange(bars), 14);
    const vip = vmp.map((v, i) => v / str[i]), vim = vmm.map((v, i) => v / str[i]);
    const r = dom.calculate(bars);
    expect(xover(vip, vim).some(Boolean)).toBe(true);
    expect(r.alerts[0].times).toEqual(timeAt(bars, xover(vip, vim)));
    expect(r.alerts[1].times).toEqual(timeAt(bars, xunder(vip, vim)));
  });
});

describe('lorentzian-classification', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(lor)).toEqual([
      ['alert0', 'Open Long ▲', 'LDC Open Long ▲ | {{ticker}}@{{close}} | ({{interval}})'],
      ['alert1', 'Close Long ▲', 'LDC Close Long ▲ | {{ticker}}@{{close}} | ({{interval}})'],
      ['alert2', 'Open Short ▼', 'LDC Open Short  | {{ticker}}@{{close}} | ({{interval}})'],
      ['alert3', 'Close Short ▼', 'LDC Close Short ▼ | {{ticker}}@{{close}} | ({{interval}})'],
      ['alert4', 'Open Position ▲▼', 'LDC Open Position ▲▼ | {{ticker}}@{{close}} | ({{interval}})'],
      ['alert5', 'Close Position ▲▼', 'LDC Close Position  ▲▼ | {{ticker}}@[{{close}}] | ({{interval}})'],
      ['alert6', 'Kernel Bullish Color Change', 'LDC Kernel Bullish ▲ | {{ticker}}@{{close}} | ({{interval}})'],
      ['alert7', 'Kernel Bearish Color Change', 'LDC Kernel Bearish ▼ | {{ticker}}@{{close}} | ({{interval}})'],
    ]);
    expect(lor.LorentzianClassification.alertConditions).toBe(lor.alertConditions);
  });
  it('fires on the entries / exits of the markers and on the kernel colour changes, with the shape ids', () => {
    const r = lor.calculate(bars, { showExits: true });
    const t = (id: string) => markerTimes(r.markers, id);
    expect(t('shape0').length && t('shape1').length && t('shape2').length && t('shape3').length).toBeTruthy();
    expect(r.alerts[0].times).toEqual(t('shape0'));
    expect(r.alerts[1].times).toEqual(t('shape2'));
    expect(r.alerts[2].times).toEqual(t('shape1'));
    expect(r.alerts[3].times).toEqual(t('shape3'));
    const sorted = (a: number[]) => uniq(a).sort((x, y) => x - y);
    expect(r.alerts[4].times).toEqual(sorted([...t('shape0'), ...t('shape1')]));
    expect(r.alerts[5].times).toEqual(sorted([...t('shape2'), ...t('shape3')]));
    expect(r.markers.every((m) => ['shape0', 'shape1', 'shape2', 'shape3'].includes(m.id as string))).toBe(true);
    // kernel rate changes (no kernel smoothing): yhat1[1] < yhat1 and yhat1[2] > yhat1[1] (bullish), the mirror
    const y = (r.plots.plot0 as { value: number }[]).map((p) => p.value);
    const bull = y.map((v, i) => i >= 2 && y[i - 1] < v && y[i - 2] > y[i - 1]);
    const bear = y.map((v, i) => i >= 2 && y[i - 1] > v && y[i - 2] < y[i - 1]);
    expect(bull.some(Boolean) && bear.some(Boolean)).toBe(true);
    expect(r.alerts[6].times).toEqual(timeAt(bars, bull));
    expect(r.alerts[7].times).toEqual(timeAt(bars, bear));
    // the exits are drawn only with "Show Default Exits"; the alerts do not depend on it
    const hidden = lor.calculate(bars);
    expect(t('shape2').length).toBeGreaterThan(0);
    expect(markerTimes(hidden.markers, 'shape2')).toEqual([]);
    expect(hidden.alerts[1].times).toEqual(r.alerts[1].times);
  });
});
