/**
 * Community ports, batch 44: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers / background colours.
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, getSourceSeries, str, type Bar } from 'oakscriptjs';
import * as bigMoves from '../../src/community/volatility-big-market-moves';
import * as vbp from '../../src/community/volatility-breakout-pulse';
import * as vco from '../../src/community/volatility-channel-oscillator';
import * as vwapS from '../../src/community/volatility-driven-vwap-structure';
import * as vgto from '../../src/community/volatility-gated-trend-oscillator';
import * as volSr from '../../src/community/volumatic-sr-levels';
import * as vbr from '../../src/community/volume-bar-range';
import * as vbc from '../../src/community/volume-bars-color';
import * as vbsr from '../../src/community/volume-based-support-resistance-zones';
import * as vch from '../../src/community/volume-candle-highlighter';
import * as vcmp from '../../src/community/volume-comparison-with-buyer-seller-pressure';
import * as vdiv from '../../src/community/volume-divergence';
import * as vgtr from '../../src/community/volume-gated-trend-ribbon';
import * as vpPro from '../../src/community/volume-profile-free-pro-by-rrb';
import * as vpUltra from '../../src/community/volume-profile-free-ultra-sli';
import * as vppa from '../../src/community/volume-profile-pivot-anchored';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'volatility-breakout-pulse': [['alert0', 'BUY ALERT', 'VBP FIX BUY Signal'], ['alert1', 'SELL ALERT', 'VBP FIX SELL Signal']],
  'volatility-channel-oscillator': [
    ['alert0', 'Bullish Divergence Detected', 'Bullish divergence detected at pivot, lookback right bars ago.'],
    ['alert1', 'Bearish Divergence Detected', 'Bearish divergence detected at pivot, lookback right bars ago.'],
    ['alert2', 'Buy Signal (Oversold)', 'Oscillator crossed above the oversold threshold.'],
    ['alert3', 'Sell Signal (Overbought)', 'Oscillator crossed below the overbought threshold.'],
    ['alert4', 'Buy Signal (Zero Line)', 'Oscillator crossed above the zero line.'],
    ['alert5', 'Sell Signal (Zero Line)', 'Oscillator crossed below the zero line.'],
    ['alert6', 'Buy Signal (MA Zero Line)', 'Moving Average crossed above the zero line.'],
    ['alert7', 'Sell Signal (MA Zero Line)', 'Moving Average crossed below the zero line.'],
  ],
  'volatility-driven-vwap-structure': [
    ['alert0', 'Bullish VWAP Structure Shift', 'Volatility-Driven VWAP Structure shifted bullish.'],
    ['alert1', 'Bearish VWAP Structure Shift', 'Volatility-Driven VWAP Structure shifted bearish.'],
    ['alert2', 'Any VWAP Structure Reversal', 'VWAP structure reversal detected.'],
    ['alert3', 'Close Crossed Above Anchored VWAP', 'Price crossed above the reversal-anchored VWAP.'],
    ['alert4', 'Close Crossed Below Anchored VWAP', 'Price crossed below the reversal-anchored VWAP.'],
    ['alert5', 'Close Crossed Above VWAP Structure Mean', 'Price crossed above the VWAP structure mean.'],
    ['alert6', 'Close Crossed Below VWAP Structure Mean', 'Price crossed below the VWAP structure mean.'],
    ['alert7', 'Price Touched Upper Band 1', 'Price touched the first upper anchored VWAP deviation band.'],
    ['alert8', 'Price Touched Lower Band 1', 'Price touched the first lower anchored VWAP deviation band.'],
    ['alert9', 'Price Touched Upper Band 2', 'Price touched the second upper anchored VWAP deviation band.'],
    ['alert10', 'Price Touched Lower Band 2', 'Price touched the second lower anchored VWAP deviation band.'],
  ],
  'volatility-gated-trend-oscillator': [
    ['alert0', 'Bullish Trend Signal', 'Volatility-Gated Trend Oscillator: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
    ['alert1', 'Bearish Trend Signal', 'Volatility-Gated Trend Oscillator: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}'],
    ['alert2', 'Trend Direction Changed', 'Volatility-Gated Trend Oscillator: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}'],
  ],
  'volume-bars-color': [['alert0', 'High Volume Alert', 'Anomalous High Volume detected!'], ['alert1', 'Low Volume Alert', 'Anomalous Low Volume detected!']],
  'volume-comparison-with-buyer-seller-pressure': [
    ['alert0', 'Strong Buy Signal', 'A strong buy signal has been detected (Buyer Pressure >= 0.75).'],
    ['alert1', 'Strong Sell Signal', 'A strong sell signal has been detected (Seller Pressure >= 0.75).'],
    ['alert2', 'Neutral Market', 'Market is neutral, with no strong buyer or seller dominance.'],
  ],
  'volume-gated-trend-ribbon': [
    ['alert0', 'Bullish Trend Signal', 'Volume-Gated Ribbon: Trend changed to BULLISH {{exchange}}:{{ticker}} - {{interval}}'],
    ['alert1', 'Bearish Trend Signal', 'Volume-Gated Ribbon: Trend changed to BEARISH {{exchange}}:{{ticker}} - {{interval}}'],
    ['alert2', 'Trend Change', 'Volume-Gated Ribbon: Trend direction changed - Check chart {{exchange}}:{{ticker}} - {{interval}}'],
  ],
};

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of daily bars with a random volume */
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
const bars = walk(1200, 44);
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const volume = bars.map((b) => b.volume as number);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
const S = (a: number[], list: Bar[] = bars) => Series.fromArray(list, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const prev = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);
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
type Marked = { id?: string; time: unknown };
const ids = (items: Marked[]) => [...new Set(items.map((m) => m.id))].sort();
const idTimes = (items: Marked[], id: string) => items.filter((m) => m.id === id).map((m) => m.time as number);

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'volatility-breakout-pulse': vbp, 'volatility-channel-oscillator': vco, 'volatility-driven-vwap-structure': vwapS,
    'volatility-gated-trend-oscillator': vgto, 'volume-bars-color': vbc, 'volume-comparison-with-buyer-seller-pressure': vcmp,
    'volume-gated-trend-ribbon': vgtr,
  };
  for (const [id, m] of Object.entries(mods)) it(id, () => expect(decls(m)).toEqual(SPEC[id]));
  it('exported objects carry the declarations and the alert() flag', () => {
    expect(vbp.VolatilityBreakoutPulse.alertConditions).toBe(vbp.alertConditions);
    expect(vco.VolatilityChannelOscillator.alertConditions).toBe(vco.alertConditions);
    expect(vwapS.VolatilityDrivenVWAPStructure.alertConditions).toBe(vwapS.alertConditions);
    expect(vgto.VolatilityGatedTrendOscillator.alertConditions).toBe(vgto.alertConditions);
    expect(vbc.VolumeBarsColor.alertConditions).toBe(vbc.alertConditions);
    expect(vcmp.VolumeComparisonWithBuyerSellerPressure.alertConditions).toBe(vcmp.alertConditions);
    expect(vgtr.VolumeGatedTrendRibbon.alertConditions).toBe(vgtr.alertConditions);
    expect(vbsr.VolumeBasedSupportResistanceZones.hasAlertFunction).toBe(true);
    expect(vppa.VolumeProfilePivotAnchored.hasAlertFunction).toBe(true);
  });
});

describe('alert conditions recomputed from the original expressions', () => {
  it('volatility-breakout-pulse: breakouts with a range above ATR * multiplier', () => {
    const r = vbp.calculate(bars);
    const hh = A(ta.highest(S(high), 20));
    const ll = A(ta.lowest(S(low), 20));
    const atr = A(ta.atr(bars, 14));
    const range = hh.map((h, i) => h - ll[i]);
    const buy = close.map((c, i) => gt(c, prev(hh, i)) && gt(range[i], atr[i] * 1.5));
    const sell = close.map((c, i) => lt(c, prev(ll, i)) && gt(range[i], atr[i] * 1.5));
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
  });

  it('volatility-channel-oscillator: the six crosses and the divergences at the pivot', () => {
    const r = vco.calculate(bars, { signalType: 'All' });
    const midSma = A(ta.sma(S(bars.map((b) => (b.high + b.low) / 2)), 30));
    const avgRange = A(ta.sma(S(bars.map((b) => b.high - b.low)), 30));
    const avgBody = A(ta.sma(S(bars.map((b) => Math.abs(b.close - b.open))), 30));
    const osc = close.map((c, i) => {
      const off = (avgRange[i] * 200) / 100 * (1 + avgBody[i] / Math.max(avgRange[i], 1e-10));
      const lower = midSma[i] - off;
      const width = Math.max(2 * off, 1e-10);
      return Math.max(Math.min((100 * (c - lower)) / width - 50, 100), -100);
    });
    const sig = A(ta.sma(S(osc), 20));
    const want = [crossOver(osc, -50), crossUnder(osc, 50), crossOver(osc, 0), crossUnder(osc, 0), crossOver(sig, 0), crossUnder(sig, 0)];
    want.forEach((f, k) => {
      expect(times(r, k + 2)).toEqual(timeAt(bars, f));
      expect(times(r, k + 2).length).toBeGreaterThan(0);
      // the triangles of the same signals carry the shape ids shape2 .. shape7
      expect(idTimes(r.markers, `shape${k + 2}`)).toEqual(timeAt(bars, f));
    });
    // bullCond / bearCond: the Bull / Bear labels are drawn 2 bars back (offset = -lookbackRight)
    const shift = (ts: number[]) => ts.map((t) => t - 2 * 86400);
    expect(shift(times(r, 0))).toEqual(idTimes(r.markers, 'shape0'));
    expect(shift(times(r, 1))).toEqual(idTimes(r.markers, 'shape1'));
    expect(times(r, 0).length + times(r, 1).length).toBeGreaterThan(0);
    // the conditions do not depend on the Signal Type; the divergences are off without the detection
    const none = vco.calculate(bars, { signalType: 'None', calculateDivergence: false });
    for (let k = 2; k < 8; k++) expect(times(none, k)).toEqual(times(r, k));
    expect(times(none, 0)).toEqual([]);
    expect(times(none, 1)).toEqual([]);
  });

  it('volatility-driven-vwap-structure: shifts, crosses and band touches on the plotted series', () => {
    const r = vwapS.calculate(bars, { vwapLengthInput: 50 });
    const v = (k: string) => (r.plots[k] as { value: number }[]).map((p) => p.value ?? NaN);
    const col = (r.plots.plot0 as { color: string }[]).map((p) => p.color);
    // direction == 1 draws the bullish colour; a direction change (also 0 -> 1 on the first ready bar) is a reversal
    const reversed = col.map((c, i) => i > 0 && c !== col[i - 1]);
    const bull = col.map((c) => c === '#00e676');
    const mid = v('plot0');
    const avwap = v('plot1');
    const want = [
      reversed.map((x, i) => x && bull[i]), reversed.map((x, i) => x && !bull[i]), reversed,
      crossOver(close, avwap), crossUnder(close, avwap), crossOver(close, mid), crossUnder(close, mid),
      high.map((h, i) => ge(h, v('plot2')[i])), low.map((l, i) => le(l, v('plot3')[i])),
      high.map((h, i) => ge(h, v('plot4')[i])), low.map((l, i) => le(l, v('plot5')[i])),
    ];
    want.forEach((f, k) => {
      expect(times(r, k)).toEqual(timeAt(bars, f));
      expect(times(r, k).length).toBeGreaterThan(0);
    });
    // the touches do not depend on the band display
    const hidden = vwapS.calculate(bars, { vwapLengthInput: 50, showBand1: false, showBand2: false });
    for (let k = 7; k < 11; k++) expect(times(hidden, k)).toEqual(times(r, k));
  });

  it('volatility-gated-trend-oscillator: trend state turns', () => {
    const r = vgto.calculate(bars);
    const src = A(getSourceSeries(bars, 'hlc3'));
    const base = A(ta.sma(S(src), 20));
    const raw = src.map((s, i) => s - base[i]);
    const floor = A(ta.sma(S(raw.map(Math.abs)), 20)).map((x) => x * 1.5);
    const state: number[] = [];
    let st = 0;
    raw.forEach((x, i) => {
      if (gt(x, floor[i])) st = 1;
      else if (lt(x, -floor[i])) st = -1;
      state.push(st);
    });
    const up = state.map((s, i) => s === 1 && i > 0 && state[i - 1] !== 1);
    const dn = state.map((s, i) => s === -1 && i > 0 && state[i - 1] !== -1);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
    expect(times(r, 2)).toEqual(timeAt(bars, up.map((u, i) => u || dn[i])));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
  });

  it('volume-bars-color: volume against the stdev band', () => {
    const r = vbc.calculate(bars);
    const m = A(ta.sma(S(volume), 30));
    const sd = A(ta.stdev(S(volume), 30));
    expect(times(r, 0)).toEqual(timeAt(bars, volume.map((x, i) => ge(x, m[i] + sd[i]))));
    expect(times(r, 1)).toEqual(timeAt(bars, volume.map((x, i) => le(x, m[i] - sd[i]))));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
  });

  it('volume-comparison-with-buyer-seller-pressure: pressure >= 0.75 and the rest', () => {
    const list = [...bars];
    // a bar with no range: na pressure, neutral
    list[50] = { ...list[50], high: 100, low: 100, open: 100, close: 100 };
    const r = vcmp.calculate(list);
    const buy = list.map((b) => ge((b.close - b.open) / (b.high - b.low), 0.75));
    const sell = list.map((b) => ge((b.open - b.close) / (b.high - b.low), 0.75));
    expect(times(r, 0)).toEqual(timeAt(list, buy));
    expect(times(r, 1)).toEqual(timeAt(list, sell));
    expect(times(r, 2)).toEqual(timeAt(list, buy.map((x, i) => !x && !sell[i])));
    expect(times(r, 2)).toContain(list[50].time);
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });

  it('volume-gated-trend-ribbon: fast EMA against slow EMA of the volume-gated close', () => {
    const r = vgtr.calculate(bars);
    const avg = A(ta.sma(S(volume), 50));
    const gated: number[] = [];
    let g = close[0];
    volume.forEach((x, i) => {
      if (ge(x, avg[i])) g = close[i];
      gated.push(g);
    });
    const fast = A(ta.ema(S(gated), 15));
    const slow = A(ta.ema(S(gated), 30));
    const state = fast.map((f, i) => (gt(f, slow[i]) ? 1 : -1));
    const up = state.map((s, i) => s === 1 && i > 0 && state[i - 1] !== 1);
    const dn = state.map((s, i) => s === -1 && i > 0 && state[i - 1] !== -1);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
    expect(times(r, 2)).toEqual(timeAt(bars, up.map((u, i) => u || dn[i])));
    expect(times(r, 0).length).toBeGreaterThan(3);
  });
});

describe('alert() calls', () => {
  const chart = { tickerid: 'NASDAQ:TEST', mintick: 0.01 };

  it('volume-based-support-resistance-zones: time frame 1 alerts, as the original selects them', () => {
    const inputs = { tf1Alerts: 'All Alerts On', tf2Menu: 'Disable' as const, tf3Menu: 'Disable' as const, tf4Menu: 'Disable' as const };
    const r = vbsr.calculate(bars, inputs, chart);
    // fractals of the chart bars (TF1 = Chart)
    const volMA = A(ta.sma(S(volume), 6));
    const H = (i: number) => (i >= 0 ? high[i] : NaN);
    const L = (i: number) => (i >= 0 ? low[i] : NaN);
    const fu: number[] = [], fd: number[] = [], uz: number[] = [], dz: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const volOk = i >= 3 && gt(volume[i - 3], volMA[i - 3]);
      const up = gt(H(i - 3), H(i - 4)) && gt(H(i - 4), H(i - 5)) && lt(H(i - 2), H(i - 3)) && lt(H(i - 1), H(i - 2)) && volOk;
      const dn = lt(L(i - 3), L(i - 4)) && lt(L(i - 4), L(i - 5)) && gt(L(i - 2), L(i - 3)) && gt(L(i - 1), L(i - 2)) && volOk;
      const o3 = i >= 3 ? bars[i - 3].open : NaN, c3 = i >= 3 ? bars[i - 3].close : NaN;
      fu.push(up ? H(i - 3) : prev(fu, i));
      fd.push(dn ? L(i - 3) : prev(fd, i));
      uz.push(up ? (ge(c3, o3) ? c3 : o3) : prev(uz, i));
      dz.push(dn ? (ge(c3, o3) ? o3 : c3) : prev(dz, i));
    }
    const conds: [boolean[], string][] = [
      [crossOver(close, uz), 'Price enters D Resistance Zone'],
      [crossUnder(close, fu), 'Price is testing D resistance as support'],
      [crossUnder(close, dz), 'Price enters D Support Zone'],
      [crossOver(close, fd), 'Price is testing D support as resistance'],
      [crossOver(close, fu), 'Price is breaking out D Resistance'],
      [crossUnder(close, fd), 'Price is breaking down D Support'],
      [fu.map((v, i) => !isNaN(v) && !isNaN(prev(fu, i)) && Math.abs(v - prev(fu, i)) > EPS), 'New D Resistance Zone Found'],
      [fd.map((v, i) => !isNaN(v) && !isNaN(prev(fd, i)) && Math.abs(v - prev(fd, i)) > EPS), 'New D Support Zone Found'],
    ];
    const want: { time: number; message: string; freq: string }[] = [];
    bars.forEach((b, i) => conds.forEach(([f, text]) => {
      if (f[i]) want.push({ time: b.time as number, message: `TEST - ${text}`, freq: 'once_per_bar' });
    }));
    expect(r.alertCalls).toEqual(want);
    for (const [f] of conds) expect(f.some(Boolean)).toBe(true);

    // 'Price Breaks Up Resistance' / 'Price Breaks Down Support' select no alert (the original tests other names)
    expect(vbsr.calculate(bars, { ...inputs, tf1Alerts: 'Price Breaks Up Resistance' }, chart).alertCalls).toEqual([]);
    expect(vbsr.calculate(bars, { ...inputs, tf1Alerts: 'Price Breaks Down Support' }, chart).alertCalls).toEqual([]);
    const either = vbsr.calculate(bars, { ...inputs, tf1Alerts: 'Price Breaks Either S/R' }, chart).alertCalls;
    expect(either).toEqual(want.filter((a) => a.message.includes('breaking')));
    // default inputs: no alerts; the drawings do not change with the alerts
    const plain = vbsr.calculate(bars, { tf2Menu: 'Disable', tf3Menu: 'Disable', tf4Menu: 'Disable' }, chart);
    expect(plain.alertCalls).toEqual([]);
    expect(plain.lines).toEqual(r.lines);
    // alerts of a time frame below the chart timeframe: its values are not in the bars
    expect(() => vbsr.calculate(bars, { tf2Alerts: 'All Alerts On' }, chart)).toThrow(/needed by its alerts/);
  });

  it('volume-profile-pivot-anchored: POC line crosses on the history and high volume alerts', () => {
    const r = vppa.calculate(bars, {}, chart);
    const last = bars.length - 1;
    const msg = (text: string, i: number) => `TEST${text}${str.tostring(close[i], 'mintick', 0.01)}`;
    for (const a of r.alertCalls) expect(a.freq).toBe('once_per_bar');
    // on the bars before the last one the POC line is lowest(low, 2) + 0.5 * (highest(high, 2) - lowest(low, 2)) / 25
    const hh = A(ta.highest(S(high), 2));
    const ll = A(ta.lowest(S(low), 2));
    const poc = hh.map((h, i) => ll[i] + (0.5 * (h - ll[i])) / 25);
    const pocCross = close.map((c, i) => (c > poc[i] && prev(close, i) <= prev(poc, i)) || (c < poc[i] && prev(close, i) >= prev(poc, i)));
    const pocText = ' : Pivots Volume Profile : Price touches/crosses Point Of Control Line, price ';
    const got = r.alertCalls.filter((a) => a.message.includes('Point Of Control') && a.time !== bars[last].time);
    expect(got).toEqual(bars.map((b, i) => ({ i, b })).filter(({ i }) => i < last && pocCross[i])
      .map(({ i, b }) => ({ time: b.time, message: msg(pocText, i), freq: 'once_per_bar' })));
    expect(got.length).toBeGreaterThan(10);
    // nzVolume > vSMA * 1.618
    const vs = A(ta.sma(S(volume), 89));
    const hv = r.alertCalls.filter((a) => a.message.includes(' high volume, price '));
    expect(hv).toEqual(bars.map((b, i) => ({ i, b })).filter(({ i }) => gt(volume[i], vs[i] * 1.618))
      .map(({ i, b }) => ({ time: b.time, message: msg(' high volume, price ', i), freq: 'once_per_bar' })));
    expect(hv.length).toBeGreaterThan(5);
    // value area lines: messages of the original, each only when its line is shown
    const vah = r.alertCalls.filter((a) => a.message.includes('Value Area High Line'));
    const val = r.alertCalls.filter((a) => a.message.includes('Value Area Low Line'));
    expect(vah.length).toBeGreaterThan(0);
    expect(val.length).toBeGreaterThan(0);
    expect(r.alertCalls.length).toBe(got.length + hv.length + vah.length + val.length
      + r.alertCalls.filter((a) => a.message.includes('Point Of Control') && a.time === bars[last].time).length);
    const off = vppa.calculate(bars, { pointOfControl: false, valueAreaHigh: false, valueAreaLow: false, volumeBars: false }, chart);
    expect(off.alertCalls).toEqual([]);
    // without a chart context the message starts with an empty ticker
    expect(vppa.calculate(bars).alertCalls[0].message.startsWith(' ')).toBe(true);
  });
});

describe('Style ids on the emitted items', () => {
  it('volatility-big-market-moves: bgcolor0 on the price pane, bgcolor1 on the indicator pane', () => {
    const r = bigMoves.calculate(bars, { minMove: 3 });
    expect(r.bgColors.length).toBeGreaterThan(0);
    for (const b of r.bgColors) expect(b.id).toBe(b.forceOverlay ? 'bgcolor0' : 'bgcolor1');
    expect(idTimes(r.bgColors, 'bgcolor0')).toEqual(idTimes(r.bgColors, 'bgcolor1'));
  });

  it('volatility-channel-oscillator: every marker has one of the spec ids', () => {
    const r = vco.calculate(bars, { signalType: 'All' });
    expect(ids(r.markers)).toEqual(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7']);
  });

  it('volumatic-sr-levels: four absolute circles per high volume bar', () => {
    const r = volSr.calculate(bars, { lowerThreshold: 50, upperThreshold: 50 });
    expect(ids(r.markers)).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
    for (const m of r.markers) expect(m.position).toBe('atPriceMiddle');
    const at = (id: string) => r.markers.filter((m) => m.id === id);
    // shape0 below shape1 (support -/+), shape2 above shape3 (resistance +/-)
    at('shape0').forEach((m, k) => expect(m.price!).toBeLessThanOrEqual(at('shape1')[k].price!));
    at('shape2').forEach((m, k) => expect(m.price!).toBeGreaterThanOrEqual(at('shape3')[k].price!));
  });

  it('volume-bar-range: ids by signal text style and signal kind', () => {
    const kinds: Record<string, number> = { '#2962ff': 0, '#363a45': 1, '#9c27b0': 2, '#ff9800': 3 };
    for (const [text, base] of [['买/卖', 0], ['B/S', 4], ['BUY/SELL', 8]] as const) {
      const r = vbr.calculate(bars, { signalText: text, lookback: 20, volMaPeriod: 10 });
      expect(r.markers.length).toBeGreaterThan(0);
      for (const m of r.markers) {
        const k = kinds[String(m.color).toLowerCase()];
        expect(k).toBeDefined();
        expect(m.id).toBe(`shape${base + k}`);
      }
    }
  });

  it('volume-candle-highlighter: one id per marker size and direction', () => {
    (['Tiny', 'Small', 'Normal', 'Large'] as const).forEach((size, k) => {
      const r = vch.calculate(bars, { markerSize: size });
      expect(r.markers.length).toBeGreaterThan(0);
      for (const m of r.markers) expect(m.id).toBe(m.shape === 'triangleUp' ? `shape${k}` : `shape${4 + k}`);
    });
  });

  it('volume-divergence: regular and hidden labels', () => {
    const r = vdiv.calculate(bars, { plotHiddenBull: true, plotHiddenBear: true });
    const byText: Record<string, string> = { ' Bull ': 'shape0', ' H Bull ': 'shape1', ' Bear ': 'shape2', ' H Bear ': 'shape3' };
    expect(r.markers.length).toBeGreaterThan(0);
    for (const m of r.markers) expect(m.id).toBe(byText[m.text!]);
    expect(ids(r.markers).every((id) => ['shape0', 'shape1', 'shape2', 'shape3'].includes(id!))).toBe(true);
  });

  for (const [name, mod] of [['volume-profile-free-pro-by-rrb', vpPro], ['volume-profile-free-ultra-sli', vpUltra]] as const) {
    it(`${name}: the level markers carry shape0 .. shape5`, () => {
      const spec = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5'];
      const all = new Set<string>();
      for (const dimNvaZones of [true, false]) {
        // the range is counted back from the current time: the chart context gives it (the day after the last bar)
        const now = ((bars[bars.length - 1].time as number) + 86400) * 1000;
        const r = (mod.calculate as (b: Bar[], i: object, c: object) => { markers: Marked[] })(bars, { dimNvaZones, showPoc2: true }, { now });
        expect(r.markers.length).toBeGreaterThan(0);
        for (const m of r.markers) {
          expect(spec).toContain(m.id);
          all.add(m.id!);
        }
      }
      expect([...all].sort()).toEqual(spec);
    });
  }
});
