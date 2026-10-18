/**
 * Community ports, batch 43: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression, or checked against the drawings
 * that stand for the same event), and the Style ids on the emitted markers / background colours / arrows.
 */
import { describe, expect, it } from 'vitest';
import { taCore, type Bar } from 'oakscriptjs';
import * as ubs from '../../src/community/ultimate-buy-sell';
import * as orb from '../../src/community/ultimate-opening-range-breakout';
import * as ucsr from '../../src/community/ultra-clean-support-resistance-levels';
import * as um from '../../src/community/um-ema-sma-wma-hma-with-directional-color-change';
import * as ulo from '../../src/community/universal-large-orders-proxy-fabio-valentini-chat-gpt-recreation';
import * as usb from '../../src/community/universal-signal-backtester';
import * as uzs from '../../src/community/uptrick-dynamic-z-score-deviation';
import * as uta from '../../src/community/uptrick-trend-analysis';
import * as uvr from '../../src/community/uptrick-volatility-reversion-bands';
import * as udr from '../../src/community/user-defined-range-selector-and-color-changing-ema-line';
import * as utb from '../../src/community/ut-bot';
import * as utv from '../../src/community/ut-bot-trend-volume';
import * as vco from '../../src/community/vco-fusion';
import * as vdub from '../../src/community/vdub-sniper';
import * as vega from '../../src/community/vega';
import * as vaft from '../../src/community/volatility-adaptive-filtered-trend';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {"ultimate-buy-sell": [["alert0", "Buy signal", "Buy signal detected"], ["alert1", "Sell signal", "Sell signal detected"]], "ultimate-opening-range-breakout": [["alert0", "Bullish ORB", "Price broke above the opening range."], ["alert1", "Bearish ORB", "Price broke below the opening range."], ["alert2", "Target 3 Reached", "Price reached the final bullish target."], ["alert3", "Target 3 Reached", "Price reached the final bearish target."]], "um-ema-sma-wma-hma-with-directional-color-change": [["alert0", "Bullish Color Change", "MA and Smoothing Line Bullish Color Change (Red to Green)"], ["alert1", "Bearish Color Change", "MA and Smoothing Line Bearish Color Change (Green to Red)"]], "universal-large-orders-proxy-fabio-valentini-chat-gpt-recreation": [["alert0", "Large Buy Pressure", "Large buy pressure detected"], ["alert1", "Large Sell Pressure", "Large sell pressure detected"], ["alert2", "Extreme Buy Pressure", "Extreme buy pressure detected"], ["alert3", "Extreme Sell Pressure", "Extreme sell pressure detected"]], "uptrick-dynamic-z-score-deviation": [["alert0", "Buy Alert", "Uptrick Buy Reversal Signal"], ["alert1", "Sell Alert", "Uptrick Sell Reversal Signal"]], "uptrick-trend-analysis": [["alert0", "Regular Bullish Divergence", "Found a new Regular Bullish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar."], ["alert1", "Regular Bearish Divergence", "Found a new Regular Bearish Divergence, `Pivot Lookback Right` number of bars to the left of the current bar."]], "user-defined-range-selector-and-color-changing-ema-line": [["alert0", "User EMA Range Bullish Setup Armed", "User EMA Range: bullish setup armed. Price is overextended below the EMA."], ["alert1", "User EMA Range Bearish Setup Armed", "User EMA Range: bearish setup armed. Price is overextended above the EMA."], ["alert2", "User EMA Range Bullish EMA Reclaim", "User EMA Range: bullish setup has reclaimed the EMA acceptance level."], ["alert3", "User EMA Range Bearish EMA Loss", "User EMA Range: bearish setup has lost the EMA acceptance level."], ["alert4", "User EMA Range Bullish Acceptance Reversal", "User EMA Range bullish reversal: overextension below EMA, reclaim, and accepted hold above EMA."], ["alert5", "User EMA Range Bearish Acceptance Reversal", "User EMA Range bearish reversal: overextension above EMA, loss, and accepted hold below EMA."], ["alert6", "User EMA Range Bullish Latent Range Inversion", "User EMA Range: bullish latent range inversion detected."], ["alert7", "User EMA Range Bearish Latent Range Inversion", "User EMA Range: bearish latent range inversion detected."], ["alert8", "User EMA Range Final Buy Signal", "User EMA Range final buy signal fired according to selected signal mode."], ["alert9", "User EMA Range Final Sell Signal", "User EMA Range final sell signal fired according to selected signal mode."]], "ut-bot": [["alert0", "UT Long", "UT Long"], ["alert1", "UT Short", "UT Short"]], "ut-bot-trend-volume": [["alert0", "UT Buy Signal", "UT Bot BUY"], ["alert1", "UT Sell Signal", "UT Bot SELL"]], "vco-fusion": [["alert0", "Long Signal", "VCO Long Signal – MA1 crossed above Oversold"], ["alert1", "Short Signal", "VCO Short Signal – MA1 crossed below Overbought"], ["alert2", "Bull Cross (Range Filter)", "VCO Bull Cross – MA1 crossed above MA2 in bull range"], ["alert3", "Bear Cross (Range Filter)", "VCO Bear Cross – MA1 crossed below MA2 in bear range"], ["alert4", "Histogram Peak Up", "VCO Histogram turned UP (bullish wave turn)"], ["alert5", "Histogram Peak Down", "VCO Histogram turned DOWN (bearish wave turn)"], ["alert6", "Bullish Divergence", "VCO Bullish Divergence detected on MA1"], ["alert7", "Bearish Divergence", "VCO Bearish Divergence detected on MA1"]], "vega": [["alert0", "Bullish Zero Cross", "VEGA crossed above zero"], ["alert1", "Bearish Zero Cross", "VEGA crossed below zero"], ["alert2", "Squeeze Started", "VEGA squeeze started"], ["alert3", "Squeeze Fired", "VEGA squeeze fired (volatility expanding)"], ["alert4", "High Squeeze", "VEGA entered high compression squeeze"], ["alert5", "High Squeeze Released", "VEGA high compression squeeze releasing"]], "volatility-adaptive-filtered-trend": [["alert0", "Long Signal", "Volatility Adaptive Filtered Trend Long Signal on {{ticker}}"], ["alert1", "Short Signal", "Volatility Adaptive Filtered Trend Short Signal on {{ticker}}"]]};

/** Style ids of the originals' shape / colour / arrow outputs (spec) */
const STYLE: Record<string, string[]> = {"ultimate-buy-sell": ["shape0", "shape1", "shape2", "shape3", "shape4", "shape5", "shape6", "shape7", "shape8", "shape9", "shape10", "shape11", "shape12", "shape13", "bgcolor0", "bgcolor1", "bgcolor2", "bgcolor3"], "universal-large-orders-proxy-fabio-valentini-chat-gpt-recreation": ["shape0", "shape1", "shape2", "shape3", "shape4", "shape5"], "universal-signal-backtester": ["shape0", "shape1", "shape2", "shape3"], "uptrick-dynamic-z-score-deviation": ["shape0", "shape1", "shape2", "shape3", "shape4", "shape5", "shape6", "shape7"], "uptrick-volatility-reversion-bands": ["shape0", "shape1", "shape2", "shape3"], "user-defined-range-selector-and-color-changing-ema-line": ["shape0", "shape1", "shape2", "shape3", "shape4", "shape5", "shape6", "shape7", "shape8", "shape9"], "vco-fusion": ["shape0", "shape1", "shape2", "shape3", "shape4", "shape5", "shape6", "shape7"], "vdub-sniper": ["arrow0", "arrow1"]};

/** Seeded random walk of daily bars with a random volume */
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
/** The walk with strong bars (a body of nearly the whole range, a 20x volume): bullish at `ups`, bearish at `downs` */
function withSpikes(list: Bar[], ups: number[], downs: number[], size = 9): Bar[] {
  return list.map((b, i) => {
    const c = i > 0 ? list[i - 1].close : b.open;
    if (ups.includes(i)) return { ...b, open: c, low: c - 0.1, high: c + size, close: c + size - 0.1, volume: 2e7 };
    if (downs.includes(i)) return { ...b, open: c, high: c + 0.1, low: c - size, close: c - size + 0.1, volume: 2e7 };
    return b;
  });
}
const spiked = withSpikes(bars, [200, 400, 600, 800], [300, 500, 700, 900]);
/** The walk with a flat stretch (closes within 0.05, ranges of 3) on bars from..to - 1 */
function withFlat(list: Bar[], from: number, to: number): Bar[] {
  const base = list[from].close;
  return list.map((b, i) => (i < from || i >= to ? b
    : { ...b, open: base, close: base + ((i % 2) - 0.5) * 0.05, high: base + 1.5, low: base - 1.5 }));
}
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const N = (a: ArrayLike<number | null | undefined>) => Array.from(a, (v) => (v === null || v === undefined ? NaN : v));
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const prev = (a: number[], i: number, k = 1) => (i >= k ? a[i - k] : NaN);
const crossOver = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : prev(b, i);
  return v > w && prev(a, i) <= pw;
});
const crossUnder = (a: number[], b: number[] | number) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pw = typeof b === 'number' ? b : prev(b, i);
  return v < w && prev(a, i) >= pw;
});
type Mk = { time: number; id?: string; shape?: string; text?: string; size?: unknown; position?: string };
const markerTimes = (ms: Mk[], id: string) => [...new Set(ms.filter((m) => m.id === id).map((m) => m.time))].sort((x, y) => x - y);
/** Every emitted item carries one of the spec's ids */
const idsOk = (items: { id?: string }[], spec: string[]) => {
  for (const m of items) expect(spec).toContain(m.id);
};

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'ultimate-buy-sell': ubs, 'ultimate-opening-range-breakout': orb, 'um-ema-sma-wma-hma-with-directional-color-change': um,
    'universal-large-orders-proxy-fabio-valentini-chat-gpt-recreation': ulo, 'uptrick-dynamic-z-score-deviation': uzs,
    'uptrick-trend-analysis': uta, 'user-defined-range-selector-and-color-changing-ema-line': udr, 'ut-bot': utb,
    'ut-bot-trend-volume': utv, 'vco-fusion': vco, vega, 'volatility-adaptive-filtered-trend': vaft,
  };
  for (const [id, m] of Object.entries(mods)) it(id, () => expect(decls(m)).toEqual(SPEC[id]));
  it('exported objects carry the declarations', () => {
    expect(ubs.UltimateBuySell.alertConditions).toBe(ubs.alertConditions);
    expect(orb.UltimateOpeningRangeBreakout.alertConditions).toBe(orb.alertConditions);
    expect(um.UmEmaSmaWmaHmaWithDirectionalColorChange.alertConditions).toBe(um.alertConditions);
    expect(ulo.UniversalLargeOrdersProxy.alertConditions).toBe(ulo.alertConditions);
    expect(uzs.UptrickDynamicZScoreDeviation.alertConditions).toBe(uzs.alertConditions);
    expect(uta.UptrickTrendAnalysis.alertConditions).toBe(uta.alertConditions);
    expect(udr.UserDefinedRangeSelector.alertConditions).toBe(udr.alertConditions);
    expect(utb.UTBot.alertConditions).toBe(utb.alertConditions);
    expect(utv.UtBotTrendVolume.alertConditions).toBe(utv.alertConditions);
    expect(vco.VcoFusion.alertConditions).toBe(vco.alertConditions);
    expect(vega.Vega.alertConditions).toBe(vega.alertConditions);
    expect(vaft.VolatilityAdaptiveFilteredTrend.alertConditions).toBe(vaft.alertConditions);
  });
});

describe('Ultimate Buy and Sell', () => {
  /** The original's trade logic (RSI 32 RMA, RSI BB 32 SMA x 2, watch lookback 35, signals cleared by each buy / sell) */
  function signals(list: Bar[], lastConfirmed = true) {
    const c = list.map((b) => b.close);
    const n = c.length;
    const ch = c.map((v, i) => (i > 0 ? v - c[i - 1] : 0));
    const up = N(taCore.rma(ch.map((x) => Math.max(x, 0)), 32));
    const dn = N(taCore.rma(ch.map((x) => -Math.min(x, 0)), 32));
    const rsi = up.map((u, i) => (isNaN(u) || isNaN(dn[i]) ? NaN : dn[i] === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / dn[i])));
    const basis = N(taCore.sma(rsi, 32));
    const dev = N(taCore.stdev(rsi, 32)).map((v) => (isNaN(v) ? 0 : v));
    const upper = basis.map((b, i) => b + 2 * dev[i]);
    const lower = basis.map((b, i) => b - 2 * dev[i]);
    const warm = 37; // the port's warm-up (max of the lengths + 5)
    const confirmed = (i: number) => i < n - 1 || lastConfirmed;
    const ok = (i: number) => i >= warm;
    const bw = crossOver(rsi, lower).map((v, i) => ok(i) && confirmed(i) && (v || crossUnder(rsi, 30)[i]));
    const sw = crossUnder(rsi, upper).map((v, i) => ok(i) && confirmed(i) && (v || crossOver(rsi, 70)[i]));
    const bSig = crossOver(rsi, basis).map((v, i) => v || crossOver(rsi, 25)[i]);
    const sSig = crossUnder(rsi, basis).map((v, i) => v || crossUnder(rsi, 75)[i]);
    const plotBuy: boolean[] = [], plotSell: boolean[] = [], bgBuy: boolean[] = [], bgSell: boolean[] = [];
    let cleared = -1;
    for (let i = 0; i < n; i++) {
      const from = Math.max(0, i - 35 + 1, cleared + 1);
      const bMet = bw.slice(from, i + 1).some(Boolean);
      const sMet = sw.slice(from, i + 1).some(Boolean);
      const b = ok(i) && bSig[i] && bMet;
      const s = ok(i) && sSig[i] && sMet;
      bgBuy.push(b);
      bgSell.push(!b && s);
      plotBuy.push(b && confirmed(i));
      plotSell.push(!(b && confirmed(i)) && s && confirmed(i));
      if (plotBuy[i] || plotSell[i]) cleared = i;
    }
    return { plotBuy, plotSell, bgBuy, bgSell, bw, sw };
  }
  const r = ubs.calculate(bars);
  const s = signals(bars);
  it('alerts: the warning background bars (advance alerts on by default)', () => {
    expect(times(r, 0)).toEqual(timeAt(bars, s.bgBuy));
    expect(times(r, 1)).toEqual(timeAt(bars, s.bgSell));
    expect(times(r, 0).length).toBeGreaterThan(2);
    expect(times(r, 1).length).toBeGreaterThan(2);
  });
  it('markers: buy / sell triangles with 3 circles each, RSI watch squares', () => {
    expect(markerTimes(r.markers, 'shape0')).toEqual(timeAt(bars, s.plotBuy));
    expect(markerTimes(r.markers, 'shape1')).toEqual(timeAt(bars, s.plotSell));
    for (const k of [2, 3, 4]) expect(markerTimes(r.markers, `shape${k}`)).toEqual(timeAt(bars, s.plotBuy));
    for (const k of [5, 6, 7]) expect(markerTimes(r.markers, `shape${k}`)).toEqual(timeAt(bars, s.plotSell));
    expect(markerTimes(r.markers, 'shape8')).toEqual(timeAt(bars, s.bw));
    expect(markerTimes(r.markers, 'shape9')).toEqual(timeAt(bars, s.sw));
    const circle = r.markers.find((m) => m.id === 'shape2')!;
    const bar = bars.find((b) => b.time === circle.time)!;
    expect(circle).toMatchObject({ position: 'atPriceMiddle', price: bar.low, shape: 'circle', size: 'tiny', color: 'rgba(255,152,0,0.5)' });
    idsOk(r.markers, STYLE['ultimate-buy-sell']);
  });
  it('background colours, candles and fills', () => {
    expect(r.bgColors.filter((b) => b.id === 'bgcolor0').map((b) => b.time)).toEqual(timeAt(bars, s.bgBuy));
    expect(r.bgColors.filter((b) => b.id === 'bgcolor1').map((b) => b.time)).toEqual(timeAt(bars, s.bgSell));
    idsOk(r.bgColors, STYLE['ultimate-buy-sell']);
    const candles = r.plotCandles.candle0;
    expect(candles.length).toBe(bars.length);
    const buyIdx = s.plotBuy.indexOf(true);
    expect(candles[buyIdx].color).toBe('#FF9800');
    expect((r as { barColors?: unknown }).barColors).toBeUndefined();
    expect(r.fills!.map((f) => f.options?.title)).toEqual([
      'ATR-Adjusted Band Fill', 'Upper Bollinger Bands MA Based Fill', 'Lower Bollinger Bands ROC Based Fill',
    ]);
    expect(r.fills![2]).toMatchObject({ plot1: 'lowerInner', plot2: 'lowerOuter' });
  });
  it('an open last bar: the warning alert fires, the confirmed signal and its watch are not drawn', () => {
    const k = s.plotBuy.lastIndexOf(true);
    const part = bars.slice(0, k + 1);
    const open = ubs.calculate(part, {}, { lastBarConfirmed: false });
    const so = signals(part, false);
    expect(open.alerts[0].triggered).toBe(true);
    expect(times(open, 0)).toEqual(timeAt(part, so.bgBuy));
    expect(open.markers.some((m) => m.time === part[k].time && m.id === 'shape0')).toBe(false);
    expect(ubs.calculate(part).markers.some((m) => m.time === part[k].time && m.id === 'shape0')).toBe(true);
  });
});

describe('Ultimate Opening Range Breakout', () => {
  // 15-minute bars of 30 days around the clock; plotting not limited, so the range and level plots are on every bar
  const intra = walk(96 * 30, 5, 900, 1577836800, 1.2);
  const r = orb.calculate(intra, { stopPlotting: false });
  const ic = intra.map((b) => b.close);
  const val = (id: string) => (r.plots[id] as { value: number }[]).map((p) => p.value);
  it('Target 3 Reached: the close crosses the third extension level either way', () => {
    const u3 = val('plot4');
    const d3 = val('plot7');
    const cross = (lvl: number[]) => crossOver(ic, lvl).map((v, i) => v || crossUnder(ic, lvl)[i]);
    expect(times(r, 2)).toEqual(timeAt(intra, cross(u3)));
    expect(times(r, 3)).toEqual(timeAt(intra, cross(d3)));
    expect(times(r, 2).length + times(r, 3).length).toBeGreaterThan(3);
  });
  it('Bullish / Bearish ORB: a close crossing the range after the session; the break labels are among them', () => {
    const hi = val('plot0');
    const lo = val('plot1');
    const session = new Set(r.bgColors.map((b) => b.time));
    const up = new Set(timeAt(intra, crossOver(ic, hi)));
    const dn = new Set(timeAt(intra, crossUnder(ic, lo)));
    for (const t of times(r, 0)) { expect(up.has(t)).toBe(true); expect(session.has(t)).toBe(false); }
    for (const t of times(r, 1)) { expect(dn.has(t)).toBe(true); expect(session.has(t)).toBe(false); }
    const bull = r.labels.filter((l) => l.text.startsWith('BULL BREAK')).map((l) => l.time);
    const bear = r.labels.filter((l) => l.text.startsWith('BEAR BREAK')).map((l) => l.time);
    expect(bull.length).toBeGreaterThan(3);
    expect(bear.length).toBeGreaterThan(3);
    for (const t of bull) expect(times(r, 0)).toContain(t);
    for (const t of bear) expect(times(r, 1)).toContain(t);
  });
});

describe('Ultra Clean Support / Resistance Levels: palette left (the only extra colour is na)', () => {
  it('draws the original colours and transparent on level changes', () => {
    const r = ucsr.calculate(bars);
    const cols = new Set((r.plots.plot0 as { color?: string }[]).map((p) => p.color));
    expect([...cols].sort()).toEqual(['#4c0042', 'transparent']);
  });
});

describe('UM EMA SMA WMA HMA with Directional Color Change', () => {
  const r = um.calculate(bars);
  const src = bars.map((b) => (b.open + b.high + b.low + b.close) / 4);
  const out = N(taCore.ema(src, 65));
  const sm = N(taCore.ema(out, 2));
  const upAt = out.map((o, i) => o > sm[i]);
  const long = upAt.map((u, i) => u && !(i > 0 && upAt[i - 1]));
  const short = upAt.map((u, i) => !u && i > 0 && upAt[i - 1]);
  it('colour changes red to green / green to red', () => {
    expect(times(r, 0)).toEqual(timeAt(bars, long));
    expect(times(r, 1)).toEqual(timeAt(bars, short));
    expect(times(r, 0).length).toBeGreaterThan(5);
  });
  it('Enable Alerts off: no alert', () => {
    const off = um.calculate(bars, { enableAlerts: false });
    expect(times(off, 0)).toEqual([]);
    expect(times(off, 1)).toEqual([]);
  });
});

describe('Universal Large Orders Proxy', () => {
  /** buy1 / buy3 / sell1 / sell3 of the original (cooldown 1 bar) */
  function signals(list: Bar[], sigma = 2.3) {
    const n = list.length;
    const rng = list.map((b) => b.high - b.low);
    const vol = list.map((b) => b.volume ?? NaN);
    const cp = list.map((b, i) => (rng[i] === 0 ? 0.5 : (b.close - b.low) / rng[i]));
    const bodyPct = list.map((b, i) => (rng[i] === 0 ? 0 : Math.abs(b.close - b.open) / rng[i]));
    const boost = bodyPct.map((p, i) => (rng[i] === 0 ? 0 : 1 + p));
    const bp = vol.map((v, i) => (rng[i] === 0 ? 0 : v * cp[i] * boost[i]));
    const sp = vol.map((v, i) => (rng[i] === 0 ? 0 : v * (1 - cp[i]) * boost[i]));
    const p1 = (a: number[]) => a.map((_v, i) => prev(a, i));
    const avgB = p1(N(taCore.sma(bp, 30))), stdB = p1(N(taCore.stdev(bp, 30)));
    const avgS = p1(N(taCore.sma(sp, 30))), stdS = p1(N(taCore.stdev(sp, 30)));
    const avgV = p1(N(taCore.sma(vol, 30))), avgR = p1(N(taCore.sma(rng, 30)));
    const out = { buy1: [] as boolean[], buy3: [] as boolean[], sell1: [] as boolean[], sell3: [] as boolean[] };
    let lastB = NaN, lastS = NaN;
    for (let i = 0; i < n; i++) {
      const b = list[i];
      const bz = stdB[i] === 0 ? 0 : (bp[i] - avgB[i]) / stdB[i];
      const sz = stdS[i] === 0 ? 0 : (sp[i] - avgS[i]) / stdS[i];
      const base = vol[i] > avgV[i] * 1.35 && rng[i] > avgR[i] * 1.15;
      const upW = rng[i] === 0 ? 0 : (b.high - Math.max(b.open, b.close)) / rng[i];
      const loW = rng[i] === 0 ? 0 : (Math.min(b.open, b.close) - b.low) / rng[i];
      const bull = b.close > b.open && bodyPct[i] >= 0.45 && cp[i] >= 0.8 && upW <= 0.35;
      const bear = b.close < b.open && bodyPct[i] >= 0.45 && cp[i] <= 0.2 && loW <= 0.35;
      const bOk = isNaN(lastB) || i - lastB > 1;
      const sOk = isNaN(lastS) || i - lastS > 1;
      const buy1 = base && bull && bz > sigma && bOk, buy3 = base && bull && bz > sigma + 2 && bOk;
      const sell1 = base && bear && sz > sigma && sOk, sell3 = base && bear && sz > sigma + 2 && sOk;
      if (buy1) lastB = i;
      if (sell1) lastS = i;
      out.buy1.push(buy1); out.buy3.push(buy3); out.sell1.push(sell1); out.sell3.push(sell3);
    }
    return out;
  }
  it('pressure alerts recomputed (sigma 2.3 and a low sigma for more signals)', () => {
    for (const [list, sigma] of [[bars, 2.3], [bars, 0.8], [spiked, 2.3]] as [Bar[], number][]) {
      const r = ulo.calculate(list, { sigma });
      const s = signals(list, sigma);
      expect(times(r, 0)).toEqual(timeAt(list, s.buy1));
      expect(times(r, 1)).toEqual(timeAt(list, s.sell1));
      expect(times(r, 2)).toEqual(timeAt(list, s.buy3));
      expect(times(r, 3)).toEqual(timeAt(list, s.sell3));
      if (list === spiked) {
        // the strong bars give the extreme signals
        expect(times(r, 2)).toEqual(expect.arrayContaining([200, 400, 600, 800].map((i) => list[i].time)));
        expect(times(r, 3)).toEqual(expect.arrayContaining([300, 500, 700, 900].map((i) => list[i].time)));
      }
    }
  });
  it('Style ids: Buy / Sell Small, Medium, Large by circle size', () => {
    const r = ulo.calculate(spiked, { sigma: 0.8 });
    const sizes: Record<string, string> = { shape0: 'small', shape1: 'normal', shape2: 'large', shape3: 'small', shape4: 'normal', shape5: 'large' };
    for (const m of r.markers) expect(m.size).toBe(sizes[m.id!]);
    const buyIds = new Set(r.markers.filter((m) => m.color === ulo.defaultInputs.buyColor).map((m) => m.id));
    expect([...buyIds].every((id) => ['shape0', 'shape1', 'shape2'].includes(id!))).toBe(true);
    expect(markerTimes(r.markers, 'shape2')).toEqual(times(r, 2));
    idsOk(r.markers, STYLE['universal-large-orders-proxy-fabio-valentini-chat-gpt-recreation']);
  });
});

describe('Universal Signal Backtester: Style ids', () => {
  it('win / loss crosses carry the ids of their outputs', () => {
    const r = usb.calculate(bars);
    expect(r.markers.length).toBeGreaterThan(5);
    for (const m of r.markers) {
      const k = Number(m.id!.slice(5));
      expect(m.position).toBe(k < 2 ? 'aboveBar' : 'belowBar');
      expect(m.color.toLowerCase()).toBe(k % 2 === 0 ? '#089981' : '#f23645');
    }
    idsOk(r.markers, STYLE['universal-signal-backtester']);
  });
});

describe('Uptrick: Dynamic Z-Score Deviation', () => {
  function conds(list: Bar[], pz: number, rz: number) {
    const c = list.map((b) => b.close);
    const alma = N(taCore.alma(c, 50, 0.85, 6));
    const zsrc = c.map((v, i) => (i >= 50 ? 2 * v - c[i - 50] : NaN));
    const zlma = N(taCore.ema(zsrc, 50));
    const combo = alma.map((v, i) => (v + zlma[i]) / 2);
    const rsi = N(taCore.rsi(c, 14));
    const rs = N(taCore.alma(rsi, 10, 0.85, 6));
    const re = N(taCore.ema(rsi, 8));
    const rm = N(taCore.sma(rs, 50)), rsd = N(taCore.stdev(rs, 50));
    const zr = rs.map((v, i) => (v - rm[i]) / (rsd[i] + 1e-10));
    const pd = c.map((v, i) => v - combo[i]);
    const pm = N(taCore.sma(pd, 50)), psd = N(taCore.stdev(pd, 50));
    const zp = pd.map((v, i) => (v - pm[i]) / (psd[i] + 1e-10));
    const buy = c.map((v, i) => zp[i] < -pz && zr[i] < -rz && re[i] < 40 && v > prev(c, i));
    const sell = c.map((v, i) => zp[i] > pz && zr[i] > rz && re[i] > 60 && v < prev(c, i));
    return { buy, sell, strength: zp.map((v, i) => Math.abs(v) + Math.abs(zr[i])) };
  }
  it('buy / sell reversal alerts recomputed', () => {
    for (const [pz, rz] of [[2.0, 1.5], [1.0, 0.8]]) {
      const r = uzs.calculate(bars, { priceZThresh: pz, rsiZThresh: rz });
      const s = conds(bars, pz, rz);
      expect(times(r, 0)).toEqual(timeAt(bars, s.buy));
      expect(times(r, 1)).toEqual(timeAt(bars, s.sell));
      if (pz < 2) { expect(times(r, 0).length).toBeGreaterThan(2); expect(times(r, 1).length).toBeGreaterThan(2); }
    }
  });
  it('Style ids by signal strength (dynamic size) and Fixed when the dynamic size is off', () => {
    const r = uzs.calculate(bars, { priceZThresh: 1.0, rsiZThresh: 0.8 });
    const s = conds(bars, 1.0, 0.8);
    for (const m of r.markers) {
      const i = bars.findIndex((b) => b.time === m.time);
      const st = s.strength[i];
      const k = st >= 6 ? 0 : st >= 4 ? 1 : 2;
      expect(m.id).toBe(`shape${(m.shape === 'labelUp' ? 0 : 4) + k}`);
    }
    idsOk(r.markers, STYLE['uptrick-dynamic-z-score-deviation']);
    const fixed = uzs.calculate(bars, { priceZThresh: 1.0, rsiZThresh: 0.8, useDynamicSize: false });
    expect(new Set(fixed.markers.map((m) => m.id))).toEqual(new Set(['shape3', 'shape7']));
  });
});

describe('Uptrick: Trend Analysis', () => {
  it('divergence alerts are the bars where the Bull / Bear labels are found (drawn 5 bars back)', () => {
    // a more volatile walk: the 5 / 5 pivots of the MACD are few on the smooth one
    const list = walk(1500, 7, 86400, 1577836800, 8);
    const r = uta.calculate(list);
    const shift = (ts: number[]) => ts.map((t) => t - 5 * 86400);
    const bull = [...new Set(r.markers.filter((m) => m.text === ' Bull ').map((m) => m.time as number))];
    const bear = [...new Set(r.markers.filter((m) => m.text === ' Bear ').map((m) => m.time as number))];
    expect(shift(times(r, 0))).toEqual(bull);
    expect(shift(times(r, 1))).toEqual(bear);
    expect(bull.length).toBeGreaterThan(2);
    expect(bear.length).toBeGreaterThan(2);
    const off = uta.calculate(list, { calculateDivergence: false });
    expect(times(off, 0)).toEqual([]);
  });
});

describe('Uptrick: Volatility Reversion Bands: Style ids', () => {
  it('strong and weak signal labels carry the ids of their outputs', () => {
    const r = uvr.calculate(withSpikes(bars, [200, 400, 600, 800], [300, 500, 700, 900], 30), { weakSignals: true });
    const ids: Record<string, string> = { '▲+': 'shape0', '▼+': 'shape1', '▼': 'shape2', '▲': 'shape3' };
    expect(r.markers.length).toBeGreaterThan(5);
    for (const m of r.markers) expect(m.id).toBe(ids[m.text!]);
    expect(new Set(r.markers.map((m) => m.id)).size).toBe(4);
    idsOk(r.markers, STYLE['uptrick-volatility-reversion-bands']);
  });
});

describe('User Defined Range Selector and Color Changing EMA Line', () => {
  const inp = { overextensionThresholdPct: 4 };
  const r = udr.calculate(bars, inp);
  it('setup, reclaim, reversal and inversion alerts are the bars of their markers', () => {
    expect(times(r, 0)).toEqual(markerTimes(r.markers, 'shape6'));
    expect(times(r, 1)).toEqual(markerTimes(r.markers, 'shape7'));
    expect(times(r, 2)).toEqual(markerTimes(r.markers, 'shape8'));
    expect(times(r, 3)).toEqual(markerTimes(r.markers, 'shape9'));
    expect(times(r, 4)).toEqual(markerTimes(r.markers, 'shape0'));
    expect(times(r, 5)).toEqual(markerTimes(r.markers, 'shape1'));
    expect(times(r, 6)).toEqual(markerTimes(r.markers, 'shape2'));
    expect(times(r, 7)).toEqual(markerTimes(r.markers, 'shape3'));
    for (const k of [0, 1, 2, 3, 4, 5]) expect(times(r, k).length).toBeGreaterThan(0);
  });
  it('setup armed: the source (hlc3) at least the threshold away from the EMA', () => {
    const src = bars.map((b) => (b.high + b.low + b.close) / 3);
    const ema = N(taCore.ema(src, udr.defaultInputs.len));
    const ext = src.map((s, i) => Math.abs(s - ema[i]) / ema[i]);
    expect(times(r, 0)).toEqual(timeAt(bars, src.map((s, i) => s < ema[i] && ext[i] >= 0.04)));
    expect(times(r, 1)).toEqual(timeAt(bars, src.map((s, i) => s > ema[i] && ext[i] >= 0.04)));
  });
  it('final signals follow the signal mode', () => {
    expect(times(r, 8)).toEqual(times(r, 4));
    expect(times(r, 9)).toEqual(times(r, 5));
    const legacy = udr.calculate(bars, { ...inp, signalMode: 'Legacy Only', showLegacySignals: true });
    // a legacy buy / sell is drawn when there is no reversal on the bar
    const buys = new Set(times(legacy, 8));
    for (const t of markerTimes(legacy.markers, 'shape4')) expect(buys.has(t)).toBe(true);
    expect(times(legacy, 8).length).toBeGreaterThan(times(legacy, 4).length);
    const both = udr.calculate(bars, { ...inp, signalMode: 'Both' });
    expect(new Set(times(both, 8))).toEqual(new Set([...times(legacy, 8), ...times(both, 4)]));
    // long-only guard: the sells below the last buy are dropped
    const guard = udr.calculate(bars, { ...inp, signalMode: 'Both', longOnlyProfitGuard: true });
    expect(times(guard, 9).every((t) => times(both, 9).includes(t))).toBe(true);
    const buys9 = times(both, 8);
    for (const t of times(both, 9)) {
      const i = bars.findIndex((b) => b.time === t);
      const lastBuy = buys9.filter((x) => x < t).pop();
      const lastBuyClose = lastBuy === undefined ? NaN : bars.find((b) => b.time === lastBuy)!.close;
      // kept: no buy before, or the close above the close of the last buy before this bar
      expect(times(guard, 9).includes(t)).toBe(isNaN(lastBuyClose) || bars[i].close > lastBuyClose);
    }
  });
  it('Style ids on every marker', () => {
    const all = udr.calculate(bars, { ...inp, showLegacySignals: true });
    expect(new Set(all.markers.map((m) => m.id)).size).toBeGreaterThanOrEqual(8);
    idsOk(all.markers, STYLE['user-defined-range-selector-and-color-changing-ema-line']);
  });
});

describe('UT Bot Alerts', () => {
  it('UT Long / UT Short recomputed from the original trailing stop (after the ATR warm-up)', () => {
    const atr = N(taCore.atr(10, high, low, close));
    const stop: number[] = [];
    let p = NaN;
    for (let i = 0; i < close.length; i++) {
      const c = close[i], c1 = prev(close, i), q = isNaN(p) ? 0 : p, nl = atr[i];
      const v = c > q && c1 > q ? Math.max(q, c - nl) : c < q && c1 < q ? Math.min(q, c + nl) : c > q ? c - nl : c + nl;
      stop.push(v);
      p = v;
    }
    const above = crossOver(close, stop);
    const below = crossOver(stop, close);
    const buy = close.map((c, i) => c > stop[i] && above[i]);
    const sell = close.map((c, i) => c < stop[i] && below[i]);
    const r = utb.calculate(bars);
    const from = bars[100].time as number;
    const after = (ts: number[]) => ts.filter((t) => t >= from);
    expect(after(times(r, 0))).toEqual(after(timeAt(bars, buy)));
    expect(after(times(r, 1))).toEqual(after(timeAt(bars, sell)));
    expect(after(times(r, 0)).length).toBeGreaterThan(10);
    // the long / short labels are drawn on the same bars
    expect(after(r.markers.filter((m) => m.text === 'Buy').map((m) => m.time))).toEqual(after(times(r, 0)));
  });
});

describe('Pure UT Bot - Signals Only', () => {
  it('UT Buy / Sell Signal recomputed', () => {
    const atr = N(taCore.atr(10, high, low, close));
    const stop: number[] = [];
    let p = NaN;
    for (let i = 0; i < close.length; i++) {
      const c = close[i], c1 = prev(close, i), q = isNaN(p) ? 0 : p, nl = atr[i];
      const mx = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
      const mn = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));
      const v = c > q && c1 > q ? mx(q, c - nl) : c < q && c1 < q ? mn(q, c + nl) : c > q ? c - nl : c + nl;
      stop.push(v);
      p = v;
    }
    const r = utv.calculate(bars);
    expect(times(r, 0)).toEqual(timeAt(bars, crossOver(close, stop)));
    expect(times(r, 1)).toEqual(timeAt(bars, crossUnder(close, stop)));
    expect(times(r, 0).length).toBeGreaterThan(10);
  });
});

describe('VCO Fusion', () => {
  const r = vco.calculate(bars);
  const mid = bars.map((b) => (b.high + b.low) / 2);
  const midSma = N(taCore.sma(mid, 10));
  const avgRange = N(taCore.sma(bars.map((b) => b.high - b.low), 10));
  const avgBody = N(taCore.sma(bars.map((b) => Math.abs(b.close - b.open)), 10));
  const off = avgRange.map((a, i) => ((a * 200) / 100) * (1 + avgBody[i] / Math.max(a, 1e-10)));
  const osc = close.map((c, i) => {
    const lower = midSma[i] - off[i];
    const bw = Math.max(2 * off[i], 1e-10);
    return Math.max(Math.min((100 * (c - lower)) / bw - 50, 100), -100);
  });
  const ma1 = N(taCore.sma(N(taCore.ema(osc, 7)), 5));
  const ma2 = N(taCore.sma(N(taCore.ema(osc, 10)), 5));
  const hist = ma1.map((v, i) => v - ma2[i]);
  it('long / short, range crosses and histogram turns recomputed', () => {
    const cu = crossOver(ma1, ma2), cd = crossUnder(ma1, ma2);
    expect(times(r, 0)).toEqual(timeAt(bars, crossOver(ma1, -25)));
    expect(times(r, 1)).toEqual(timeAt(bars, crossUnder(ma1, 25)));
    expect(times(r, 2)).toEqual(timeAt(bars, cu.map((v, i) => v && ma1[i] >= 1 && ma1[i] <= 20)));
    expect(times(r, 3)).toEqual(timeAt(bars, cd.map((v, i) => v && ma1[i] >= -20 && ma1[i] <= -1)));
    const h1 = (i: number) => prev(hist, i), h2 = (i: number) => prev(hist, i, 2);
    expect(times(r, 4)).toEqual(timeAt(bars, hist.map((h, i) => h > h1(i) && h1(i) < h2(i) && h1(i) < -3)));
    expect(times(r, 5)).toEqual(timeAt(bars, hist.map((h, i) => h < h1(i) && h1(i) > h2(i) && h1(i) > 3)));
    for (let k = 0; k < 6; k++) expect(times(r, k).length).toBeGreaterThan(0);
  });
  it('divergence alerts are the bars where the Bull / Bear Div labels are found (drawn 2 bars back)', () => {
    const shift = (ts: number[]) => ts.map((t) => t - 2 * 86400);
    expect(shift(times(r, 6))).toEqual(markerTimes(r.markers, 'shape6'));
    expect(shift(times(r, 7))).toEqual(markerTimes(r.markers, 'shape7'));
    expect(times(r, 6).length).toBeGreaterThan(0);
    const noDiv = vco.calculate(bars, { showDivergence: false });
    expect(times(noDiv, 6)).toEqual([]);
  });
  it('Style ids: each shape output on its markers', () => {
    expect(markerTimes(r.markers, 'shape0')).toEqual(times(r, 5));
    expect(markerTimes(r.markers, 'shape1')).toEqual(times(r, 4));
    expect(markerTimes(r.markers, 'shape2')).toEqual(times(r, 0));
    expect(markerTimes(r.markers, 'shape3')).toEqual(times(r, 1));
    expect(markerTimes(r.markers, 'shape4')).toEqual(times(r, 2));
    expect(markerTimes(r.markers, 'shape5')).toEqual(times(r, 3));
    idsOk(r.markers, STYLE['vco-fusion']);
  });
});

describe('Vdub FX SniperVX2 Color v2: plotarrow', () => {
  it('the Supertrend entry arrows are arrows with the series value, not markers', () => {
    const r = vdub.calculate(bars);
    expect(r.arrows.length).toBeGreaterThan(5);
    for (const a of r.arrows) {
      expect(a.id === 'arrow0' ? a.value : -a.value).toBe(1);
      expect(a.color).toBe(a.id === 'arrow0' ? '#00FF0026' : '#FF000026');
    }
    idsOk(r.arrows, STYLE['vdub-sniper']);
    // the markers left are the BUY / SELL arrows of the plotshape outputs
    expect(r.markers.every((m) => m.text === '*BUY*' || m.text === '*SELL*')).toBe(true);
    // up and down arrows alternate
    for (let k = 1; k < r.arrows.length; k++) expect(r.arrows[k].id).not.toBe(r.arrows[k - 1].id);
  });
});

describe('VEGA Squeeze Pro', () => {
  const r = vega.calculate(bars);
  it('zero crosses of the VEGA histogram', () => {
    const v = (r.plots.plot2 as { value: number }[]).map((p) => p.value);
    expect(times(r, 0)).toEqual(timeAt(bars, crossOver(v, 0)));
    expect(times(r, 1)).toEqual(timeAt(bars, crossUnder(v, 0)));
    expect(times(r, 0).length).toBeGreaterThan(10);
  });
  it('squeeze state changes recomputed from the Bollinger Bands and the Keltner Channels', () => {
    // a flat stretch gives a high compression squeeze
    const list = withFlat(bars, 500, 560);
    const r = vega.calculate(list);
    const close = list.map((b) => b.close), high = list.map((b) => b.high), low = list.map((b) => b.low);
    const basis = N(taCore.sma(close, 20));
    const sd = N(taCore.stdev(close, 20));
    const atr = N(taCore.atr(20, high, low, close));
    const state = close.map((_c, i) => {
      const bu = basis[i] + 2 * sd[i], bl = basis[i] - 2 * sd[i];
      const inKc = (m: number) => bl > basis[i] - m * atr[i] && bu < basis[i] + m * atr[i];
      return inKc(0.5) ? 3 : inKc(1.0) ? 2 : inKc(1.5) ? 1 : 0;
    });
    const p = (i: number) => (i > 0 ? state[i - 1] : NaN);
    expect(times(r, 2)).toEqual(timeAt(list, state.map((s, i) => p(i) === 0 && s > 0)));
    expect(times(r, 3)).toEqual(timeAt(list, state.map((s, i) => p(i) > 0 && s === 0)));
    expect(times(r, 4)).toEqual(timeAt(list, state.map((s, i) => i > 0 && s === 3 && p(i) !== 3)));
    expect(times(r, 5)).toEqual(timeAt(list, state.map((s, i) => p(i) === 3 && s < 3)));
    for (let k = 2; k < 6; k++) expect(times(r, k).length).toBeGreaterThan(0);
  });
});

describe('Volatility Adaptive Filtered Trend', () => {
  it('long / short alerts are the regime changes (also with the signals hidden)', () => {
    const r = vaft.calculate(bars);
    expect(times(r, 0)).toEqual(r.markers.filter((m) => m.text === 'LONG').map((m) => m.time));
    expect(times(r, 1)).toEqual(r.markers.filter((m) => m.text === 'SHORT').map((m) => m.time));
    expect(times(r, 0).length).toBeGreaterThan(3);
    const hidden = vaft.calculate(bars, { showSignals: false });
    expect(hidden.markers).toEqual([]);
    expect(times(hidden, 0)).toEqual(times(r, 0));
    // the regimes alternate
    const all = [...times(r, 0).map((t) => [t, 1]), ...times(r, 1).map((t) => [t, -1])].sort((a, b) => a[0] - b[0]);
    for (let k = 1; k < all.length; k++) expect(all[k][1]).not.toBe(all[k - 1][1]);
  });
});
