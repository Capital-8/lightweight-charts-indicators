/**
 * Alerts and Style ids of 16 community ports (batch 08): the alertcondition() declarations (ids, titles and messages
 * of the originals), the bars on which each condition is true (re-computed here from the original's expression), the
 * alert() calls (bars, messages, frequency), and the Style-settings ids on the emitted markers, background / bar
 * colours, arrows and fills.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, str, type Bar } from 'oakscriptjs';
import * as cisd from '../../src/community/change-in-state-of-delivery-cisd';
import * as cpd from '../../src/community/change-point-detection';
import * as cwp from '../../src/community/channels-with-patterns';
import * as chn from '../../src/community/chn-buy-sell-with-ema-200';
import * as cbsp from '../../src/community/clean-buy-sell-pro';
import * as cvb from '../../src/community/clean-volume-bars';
import * as climax from '../../src/community/climax-volume-reversal-radar';
import * as ichi from '../../src/community/cm-enhanced-ichimoku';
import * as gann from '../../src/community/cm-gann-swing';
import * as macd5 from '../../src/community/cm-macd-custom-mtf-v5';
import * as psar from '../../src/community/cm-parabolic-sar';
import * as sling from '../../src/community/cm-sling-shot';
import * as stochHl from '../../src/community/cm-stoch-highlight';
import * as stochMtf from '../../src/community/cm-stochastic-mtf';
import * as ma2 from '../../src/community/cm-ultimate-ma-mtf-v2';
import * as ma4 from '../../src/community/cm-ultimate-ma-mtf-v4';

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of daily bars with a random volume */
function walk(count: number, seed0: number): Bar[] {
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < count; i++) {
    const o = p + (rnd() - 0.5) * 1.5;
    p = Math.max(5, o + Math.sin(i / 13) * 1.2 + (rnd() - 0.5) * 4);
    const volume = rnd() < 0.05 ? 1e6 * (4 + rnd() * 10) : 1e6 * (0.3 + rnd());
    out.push({ time: 1577836800 + i * 86400, open: o, high: Math.max(o, p) + rnd() * 1.5, low: Math.min(o, p) - rnd() * 1.5, close: p, volume });
  }
  return out;
}
const bars = walk(1200, 7);
const close = bars.map((b) => b.close);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const uniq = <T>(a: T[]) => [...new Set(a)];

/** Independent SMA / EMA (SMA seed) / RMA (SMA seed) / RSI (na = NaN) */
function sma(src: number[], len: number): number[] {
  return src.map((_, i) => {
    if (i < len - 1) return NaN;
    let s = 0;
    for (let k = i - len + 1; k <= i; k++) s += src[k];
    return s / len;
  });
}
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
function rsi(src: number[], len: number): number[] {
  const ch = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const up = rma(ch.map((c) => (isNaN(c) ? NaN : Math.max(c, 0))), len);
  const dn = rma(ch.map((c) => (isNaN(c) ? NaN : Math.max(-c, 0))), len);
  return up.map((u, i) => (dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / dn[i])));
}

describe('change-in-state-of-delivery-cisd', () => {
  const r = cisd.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(cisd)).toEqual([
      ['alert0', 'Swing High Mitigation', 'Swing High Mitigated'],
      ['alert1', 'Swing Low Mitigation', 'Swing Low Mitigated'],
      ['alert2', 'Bearish Normal CISD', 'Bearish Normal CISD Detected'],
      ['alert3', 'Bullish Normal CISD', 'Bullish Normal CISD Detected'],
      ['alert4', 'Strong Bearish CISD', 'Strong Bearish CISD Detected'],
      ['alert5', 'Strong Bullish CISD', 'Strong Bullish CISD Detected'],
    ]);
    expect(cisd.ChangeInStateOfDeliveryCisd.alertConditions).toBe(cisd.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    // Re-computation of the original's levels and CISD rules (default inputs, every bar confirmed)
    const len = 12, expiry = 100, lookback = 10, tol = 0.7;
    expect(r.lines.length).toBeLessThan(500); // no line deleted by the line limit
    const ph = ta.pivothigh(new Series(bars, (b) => b.high), len, len).toArray();
    const pl = ta.pivotlow(new Series(bars, (b) => b.low), len, len).toArray();
    const highs: { x1: number; y: number }[] = [];
    const lows: { x1: number; y: number }[] = [];
    const f: boolean[][] = [[], [], [], [], [], []];
    let lastHigh = NaN, lastLow = NaN, sinceHigh = NaN, sinceLow = NaN;
    const bear: [number, number][] = [];
    const bull: [number, number][] = [];
    const C = (i: number, k: number) => (i - k >= 0 ? bars[i - k].close : NaN);
    const O = (i: number, k: number) => (i - k >= 0 ? bars[i - k].open : NaN);
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (ph[i] != null && !isNaN(ph[i] as number)) highs.unshift({ x1: i - len, y: bars[i - len].high });
      if (pl[i] != null && !isNaN(pl[i] as number)) lows.unshift({ x1: i - len, y: bars[i - len].low });
      const sweep = (list: { x1: number; y: number }[], touched: (y: number) => boolean) => {
        let hit = NaN;
        for (let k = list.length - 1; k >= 0; k--) {
          if (i - list[k].x1 < expiry) {
            if (touched(list[k].y)) { hit = list[k].y; list.splice(k, 1); }
          } else list.splice(k, 1);
        }
        while (list.length > 100) list.pop();
        return hit;
      };
      const wh = sweep(highs, (y) => ge(b.high, y));
      const wl = sweep(lows, (y) => le(b.low, y));
      if (!isNaN(wh)) lastHigh = wh;
      if (!isNaN(wl)) lastLow = wl;
      sinceHigh = !isNaN(wh) ? 0 : sinceHigh + 1;
      sinceLow = !isNaN(wl) ? 0 : sinceLow + 1;
      if (lt(C(i, 1), O(i, 1)) && gt(b.close, b.open)) bear.unshift([b.open, i]);
      if (gt(C(i, 1), O(i, 1)) && lt(b.close, b.open)) bull.unshift([b.open, i]);
      let state = 0;
      while (bear.length && lt(b.close, bear[0][0])) {
        const [lvl, idx] = bear[0];
        let highest = 0;
        for (let k = 0; k <= i - idx; k++) if (gt(C(i, k), highest)) highest = C(i, k);
        let init = i - idx + 1, top = 0;
        while (lt(C(i, init), O(i, init))) { top = O(i, init); init++; }
        if (gt((highest - lvl) / (top - lvl), tol)) { bear.length = 0; state = 1; } else bear.shift();
      }
      while (bull.length && gt(b.close, bull[0][0])) {
        const [lvl, idx] = bull[0];
        let lowest = b.close;
        for (let k = 0; k <= i - idx; k++) if (lt(C(i, k), lowest)) lowest = C(i, k);
        let init = i - idx + 1, bottom = 0;
        while (gt(C(i, init), O(i, init))) { bottom = O(i, init); init++; }
        if (gt((lvl - lowest) / (lvl - bottom), tol)) { bull.length = 0; state = 2; } else bull.shift();
      }
      f[0].push(!isNaN(wh));
      f[1].push(!isNaN(wl));
      f[2].push(state === 1);
      f[3].push(state === 2);
      f[4].push(state === 1 && sinceHigh <= lookback && lt(b.close, lastHigh));
      f[5].push(state === 2 && sinceLow <= lookback && gt(b.close, lastLow));
    }
    f.forEach((flags, k) => expect(r.alerts[k].times, `alert${k}`).toEqual(timeAt(bars, flags)));
    for (let k = 0; k < 4; k++) expect(r.alerts[k].times.length, `alert${k} fires`).toBeGreaterThan(0);
  });
  it('puts the ids of the original outputs on the markers', () => {
    const ids = r.markers.map((m) => m.id);
    expect(ids.every((id) => ['shape0', 'shape1', 'char2', 'char3'].includes(id as string))).toBe(true);
    expect(uniq(ids).sort()).toEqual(expect.arrayContaining(['char2', 'char3']));
    // the sweep labels are the strong CISD bars
    expect(r.markers.filter((m) => m.id === 'shape0').map((m) => m.time)).toEqual(r.alerts[4].times);
    expect(r.markers.filter((m) => m.id === 'shape1').map((m) => m.time)).toEqual(r.alerts[5].times);
  });
});

describe('palette issues left as they are', () => {
  it('change-point-detection / clean-volume-bars draw only the original colours and na', () => {
    const a = cpd.calculate(bars);
    expect(uniq(a.plots.plot0.map((p: any) => p.color)).every((c) => ['#089981', '#f23645', '#787B86', 'transparent'].includes(c))).toBe(true);
    const v = cvb.calculate(bars);
    expect(uniq(v.plots.plot2.map((p: any) => p.color)).every((c) => ['#FFFFFF', '#363A45', 'transparent'].includes(c))).toBe(true);
    const s = psar.calculate(bars);
    expect(uniq(s.plots.plot0.map((p: any) => p.color)).every((c) => ['rgba(0, 255, 0, 0.65)', 'transparent'].includes(c))).toBe(true);
  });
});

describe('channels-with-patterns', () => {
  const MESSAGES = ['New Bullish Channel', 'New Bearish Channel', 'Inverted Hammer', 'Bearish Engulfing', 'Hammer',
    'Bullish Engulfing', 'Channel Break Up', 'Channel Break Down'];
  const r = cwp.calculate(bars);
  it('makes the alert() calls of the original', () => {
    expect(cwp.hasAlertFunction).toBe(true);
    expect(cwp.ChannelsWithPatterns.hasAlertFunction).toBe(true);
    expect(r.alertCalls.length).toBeGreaterThan(0);
    expect(r.alertCalls.every((c) => MESSAGES.includes(c.message) && c.freq === 'once_per_bar')).toBe(true);
    for (const m of ['New Bullish Channel', 'New Bearish Channel', 'Channel Break Up', 'Channel Break Down']) {
      expect(r.alertCalls.some((c) => c.message === m), m).toBe(true);
    }
  });
  it('calls with the labels of the patterns and breaks that are kept', () => {
    const TEXT: Record<string, string> = { iH: 'Inverted Hammer', H: 'Hammer', 'Break Up': 'Channel Break Up', 'Break Down': 'Channel Break Down' };
    const calls = new Set(r.alertCalls.map((c) => `${c.time}|${c.message}`));
    for (const l of (r as any).labels as { time: number; text: string; tooltip?: string }[]) {
      const msg = l.text === 'EG' ? l.tooltip! : TEXT[l.text];
      expect(calls.has(`${l.time}|${msg}`), `${l.text} at ${l.time}`).toBe(true);
    }
  });
  it('the switches remove their calls only; the new-channel calls have no switch', () => {
    const off = cwp.calculate(bars, {
      newChannelAlert: false, breakAlert: false, hammerAlert: false, ihammerAlert: false, bullishEngulfingAlert: false,
      bearishEngulfingAlert: false,
    });
    const keep = (c: { message: string }) => c.message.startsWith('New ');
    expect(off.alertCalls).toEqual(r.alertCalls.filter(keep));
    expect(off.alertCalls.length).toBeGreaterThan(0);
  });
});

describe('chn-buy-sell-with-ema-200', () => {
  const r = chn.calculate(bars);
  it('declares the alertconditions of the original', () => {
    expect(decls(chn)).toEqual([
      ['alert0', 'BUY Signal', 'CHN BUY SELL: BUY signal'],
      ['alert1', 'SELL Signal', 'CHN BUY SELL: SELL signal'],
      ['alert2', 'BUY and SELL', 'CHN BUY SELL: Trading signal generated'],
    ]);
    expect(chn.ChnBuySellWithEma200.alertConditions).toBe(chn.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const r7 = rsi(close, 7);
    const e = ema(close, 200);
    let lastBuy = 0, lastSell = 0;
    const buy: boolean[] = [], sell: boolean[] = [];
    for (let i = 0; i < bars.length; i++) {
      const b = gt(close[i], e[i]) && ge(r7[i], 70) && i - lastBuy >= 5;
      const s = lt(close[i], e[i]) && le(r7[i], 30) && i - lastSell >= 5;
      if (b) lastBuy = i;
      if (s) lastSell = i;
      buy.push(b);
      sell.push(s);
    }
    expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
    expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
    expect(r.alerts[2].times).toEqual(timeAt(bars, buy.map((b, i) => b || sell[i])));
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[1].times.length).toBeGreaterThan(0);
  });
});

describe('clean-buy-sell-pro', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(cbsp)).toEqual([
      ['alert0', 'BUY Signal', 'Clean Buy Sell Pro: BUY signal detected.'],
      ['alert1', 'SELL Signal', 'Clean Buy Sell Pro: SELL signal detected.'],
    ]);
    expect(cbsp.CleanBuySellPro.alertConditions).toBe(cbsp.alertConditions);
  });
  it('fires on the bars of the original expressions, with the labels hidden too', () => {
    const fast = ema(close, 20), slow = ema(close, 50), r14 = rsi(close, 14);
    const buyC = close.map((c, i) => gt(fast[i], slow[i]) && gt(c, fast[i]) && gt(r14[i], 50));
    const sellC = close.map((c, i) => lt(fast[i], slow[i]) && lt(c, fast[i]) && lt(r14[i], 50));
    const buy = buyC.map((v, i) => v && !(i > 0 && buyC[i - 1]));
    const sell = sellC.map((v, i) => v && !(i > 0 && sellC[i - 1]));
    for (const showLabels of [true, false]) {
      const r = cbsp.calculate(bars, { showLabels });
      expect(r.alerts[0].times).toEqual(timeAt(bars, buy));
      expect(r.alerts[1].times).toEqual(timeAt(bars, sell));
    }
    expect(timeAt(bars, buy).length).toBeGreaterThan(0);
    expect(timeAt(bars, sell).length).toBeGreaterThan(0);
  });
});

describe('climax-volume-reversal-radar', () => {
  it('declares the alertconditions of the original', () => {
    expect(decls(climax)).toEqual([
      ['alert0', 'Bullish Climax Watch', 'Bullish climax volume detected: possible capitulation or reversal watch zone.'],
      ['alert1', 'Bearish Climax Watch', 'Bearish climax volume detected: possible buying exhaustion or reversal watch zone.'],
    ]);
    expect(climax.ClimaxVolumeReversalRadar.alertConditions).toBe(climax.alertConditions);
  });
  it('fires on the bars of the original expressions', () => {
    const r = climax.calculate(bars);
    const vol = bars.map((b) => b.volume as number);
    const avg = sma(vol, 10);
    const ref = (i: number) => (i >= 5 ? close[i - 5] : NaN);
    const bull = bars.map((b, i) => lt(b.close, ref(i)) && lt(b.close, b.open) && gt(vol[i], avg[i] * 1.618));
    const bear = bars.map((b, i) => gt(b.close, ref(i)) && gt(b.close, b.open) && gt(vol[i], avg[i] * 1.618));
    expect(r.alerts[0].times).toEqual(timeAt(bars, bull));
    expect(r.alerts[1].times).toEqual(timeAt(bars, bear));
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[1].times.length).toBeGreaterThan(0);
  });
});

describe('cm-enhanced-ichimoku', () => {
  it('gives the two Kumo fills and the two plotarrow outputs', () => {
    const r = ichi.calculate(bars, { showCrosses: true });
    expect(r.fills!.map((f) => [f.plot1, f.plot2, f.options?.title])).toEqual([
      ['plot2', 'plot3', 'Kumo (Cloud)'], ['plot2', 'plot3', 'Kumo (Cloud)'],
    ]);
    const [up, down] = r.fills!.map((f) => f.colors!);
    // lime where Span A >= Span B, red where Span A <= Span B, on the displaced span values
    r.plots.plot2.forEach((p: any, i: number) => {
      const b = (r.plots.plot3 as any)[i].value;
      if (isNaN(p.value)) return expect([up[i], down[i]]).toEqual(['transparent', 'transparent']);
      expect(up[i] !== 'transparent').toBe(p.value >= b);
      expect(down[i] !== 'transparent').toBe(p.value <= b);
    });
    expect(r.arrows.length).toBeGreaterThan(0);
    expect(r.arrows.every((a) => (a.id === 'arrow0' && a.value === 1) || (a.id === 'arrow1' && a.value === -1))).toBe(true);
    expect(uniq(r.arrows.map((a) => a.id)).sort()).toEqual(['arrow0', 'arrow1']);
    expect((r as any).markers).toBeUndefined();
    expect(ichi.calculate(bars).arrows).toEqual([]);
  });
});

describe('cm-sling-shot', () => {
  it('gives the conservative entries as arrows, not markers', () => {
    const r = sling.calculate(bars);
    expect(r.arrows.length).toBeGreaterThan(0);
    expect(r.arrows.every((a) => (a.id === 'arrow0' && a.value === 1) || (a.id === 'arrow1' && a.value === -1))).toBe(true);
    expect(r.markers.some((m) => m.shape === 'arrowUp' || m.shape === 'arrowDown')).toBe(false);
    const letters = sling.calculate(bars, { showLetters: true });
    expect(letters.markers.filter((m) => m.text === 'B').map((m) => m.time)).toEqual(
      letters.arrows.filter((a) => a.id === 'arrow0').map((a) => a.time),
    );
  });
});

describe('Style ids of bgcolor / barcolor / plotchar outputs', () => {
  const only = (items: { id?: string }[], ids: string[]) => items.every((x) => ids.includes(x.id as string));
  it('cm-gann-swing', () => {
    const r = gann.calculate(bars) as any;
    expect(only(r.bgColors, ['bgcolor0', 'bgcolor1'])).toBe(true);
    expect(only(r.barColors, ['barcolor0', 'barcolor1'])).toBe(true);
  });
  it('cm-macd-custom-mtf-v5', () => {
    const r = macd5.calculate(bars, { showCross: true, showHB: true });
    expect(only(r.bgColors, ['bgcolor0', 'bgcolor1'])).toBe(true);
    expect(only(r.barColors, ['barcolor0', 'barcolor1'])).toBe(true);
    expect(uniq(r.bgColors.map((c) => c.id)).sort()).toEqual(['bgcolor0', 'bgcolor1']);
    expect(uniq(r.barColors.map((c) => c.id)).sort()).toEqual(['barcolor0', 'barcolor1']);
    expect(r.bgColors.filter((c) => c.id === 'bgcolor0').every((c) => c.color === '#4BAF4F')).toBe(true);
  });
  it('cm-stoch-highlight', () => {
    const r = stochHl.calculate(bars, { sbh: true, sch: true, sac: true, sacl: true }) as any;
    const bg = ['bgcolor0', 'bgcolor1', 'bgcolor2', 'bgcolor3', 'bgcolor4', 'bgcolor5'];
    expect(only(r.bgColors, bg)).toBe(true);
    expect(uniq(r.bgColors.map((c: any) => c.id)).sort()).toEqual(bg);
    expect(only(r.barColors, ['barcolor0'])).toBe(true);
    expect(r.barColors.length).toBeGreaterThan(0);
    expect(only(r.markers, ['char0', 'char1', 'char2', 'char3'])).toBe(true);
    expect(uniq(r.markers.map((m: any) => m.id)).sort()).toEqual(['char0', 'char1', 'char2', 'char3']);
  });
  it('cm-stochastic-mtf', () => {
    const r = stochMtf.calculate(bars, { sbh: true, sch: true, sac: true, sacl: true }) as any;
    const bg = ['bgcolor0', 'bgcolor1', 'bgcolor2', 'bgcolor3', 'bgcolor4', 'bgcolor5'];
    expect(only(r.bgColors, bg)).toBe(true);
    expect(uniq(r.bgColors.map((c: any) => c.id)).sort()).toEqual(bg);
    expect(only(r.markers, ['char0', 'char1', 'char2', 'char3'])).toBe(true);
    expect(uniq(r.markers.map((m: any) => m.id)).sort()).toEqual(['char0', 'char1', 'char2', 'char3']);
    // default inputs: the same counts as before
    const d = stochMtf.calculate(bars) as any;
    expect(only(d.bgColors, ['bgcolor2', 'bgcolor3'])).toBe(true);
    expect(only(d.markers, ['char0', 'char1'])).toBe(true);
  });
  it('cm-ultimate-ma-mtf-v2: one entry per barcolor() call', () => {
    const r = ma2.calculate(bars, { spc: true, spc2: true }) as any;
    const ids = ['barcolor0', 'barcolor1', 'barcolor2', 'barcolor3'];
    expect(only(r.barColors, ids)).toBe(true);
    expect(uniq(r.barColors.map((c: any) => c.id)).sort()).toEqual(ids);
    const out1 = sma(close, 20);
    const up = bars.map((b, i) => lt(b.open, out1[i]) && gt(b.close, out1[i]));
    expect(r.barColors.filter((c: any) => c.id === 'barcolor0').map((c: any) => c.time)).toEqual(timeAt(bars, up));
  });
});

describe('cm-macd-custom-mtf-v5 alert() calls', () => {
  const chart = { tickerid: 'NASDAQ:AAPL', timeframe: 'D' };
  it('calls on the crosses with the message of the original, once per bar close', () => {
    expect(macd5.hasAlertFunction).toBe(true);
    expect(macd5.CmMacdCustomMtfV5.hasAlertFunction).toBe(true);
    const r = macd5.calculate(bars, { alertLongA: true, alertShortB: true }, chart);
    const m = ema(close, 12).map((v, i) => v - ema(close, 26)[i]);
    const s = ema(m, 9);
    const up = m.map((v, i) => i > 0 && ge(s[i - 1], m[i - 1]) && lt(s[i], v));
    const dn = m.map((v, i) => i > 0 && le(s[i - 1], m[i - 1]) && gt(s[i], v));
    const want: { time: number; message: string; freq: string }[] = [];
    const msg = (i: number, t: string) => `Symbol = (NASDAQ:AAPL) TimeFrame = (D) Current Price (${str.tostring(close[i])}) ${t}`;
    bars.forEach((b, i) => {
      const time = b.time as number;
      if (up[i]) want.push({ time, message: msg(i, 'MACD Crosses Up.'), freq: 'once_per_bar_close' });
      if (dn[i]) want.push({ time, message: msg(i, 'MACD Crosses Down.'), freq: 'once_per_bar_close' });
      if (up[i] && gt(m[i], 0)) want.push({ time, message: msg(i, 'MACD > 0 And Crosses Up.'), freq: 'once_per_bar_close' });
      if (dn[i] && lt(m[i], 0)) want.push({ time, message: msg(i, 'MACD < 0 And Crosses Down.'), freq: 'once_per_bar_close' });
    });
    expect(r.alertCalls).toEqual(want);
    expect(want.some((c) => c.message.includes(' And '))).toBe(true);
    // default switches: the two strict calls are off
    const d = macd5.calculate(bars, {}, chart);
    expect(d.alertCalls).toEqual(want.filter((c) => !c.message.includes(' And ')));
    expect(macd5.calculate(bars, { alertLong: false, alertShort: false }, chart).alertCalls).toEqual([]);
  });
});

describe('cm-ultimate-ma-mtf-v4 alert() calls', () => {
  it('calls on the slope turns and crosses with the message of the original, once per bar close', () => {
    expect(ma4.hasAlertFunction).toBe(true);
    expect(ma4.CmUltimateMaMtfV4.hasAlertFunction).toBe(true);
    expect(ma4.calculate(bars, {}, { tickerid: 'NASDAQ:AAPL' }).alertCalls).toEqual([]);
    const r = ma4.calculate(bars, {
      alert_Slope_Bull: true, alert_Slope_Bear: true, alert_Cross_Bull: true, alert_Cross_Bear: true,
    }, { tickerid: 'NASDAQ:AAPL' });
    const f = sma(close, 20), s = sma(close, 50);
    const at = (a: number[], j: number) => (j >= 0 ? a[j] : NaN);
    const want: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => {
      const time = b.time as number;
      const price = str.tostring(close[i]);
      const head = 'Symbol = (NASDAQ:AAPL) Fast MA TimeFrame = ()';
      const both = `${head} Slow MA TimeFrame = ()`;
      if (lt(at(f, i - 1), at(f, i - 3)) && ge(f[i], at(f, i - 2))) want.push({ time, message: `${head} Current Price (${price}) Fast MA Slope Up.`, freq: 'once_per_bar_close' });
      if (gt(at(f, i - 1), at(f, i - 3)) && lt(f[i], at(f, i - 2))) want.push({ time, message: `${head} Current Price (${price}) Fast MA Slope Down.`, freq: 'once_per_bar_close' });
      if (lt(at(f, i - 1), at(s, i - 1)) && ge(f[i], s[i])) want.push({ time, message: `${both} Current Price (${price}) Fast MA Crosses Above Slow MA.`, freq: 'once_per_bar_close' });
      if (gt(at(f, i - 1), at(s, i - 1)) && lt(f[i], s[i])) want.push({ time, message: `${both} Current Price (${price}) Fast MA Crosses Below Slow MA.`, freq: 'once_per_bar_close' });
    });
    expect(r.alertCalls).toEqual(want);
    for (const t of ['Slope Up.', 'Slope Down.', 'Above Slow MA.', 'Below Slow MA.']) {
      expect(want.some((c) => c.message.endsWith(t)), t).toBe(true);
    }
  });
});
