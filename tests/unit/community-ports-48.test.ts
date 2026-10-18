/**
 * Community ports, batch 48: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids on the emitted markers / bar colours / arrows (and the fills titled as the original's).
 */
import { describe, expect, it } from 'vitest';
import { ta, taCore, Series, type Bar } from 'oakscriptjs';
import * as absorption from '../../src/community/absorption-bubbles';
import * as mesa from '../../src/community/ehlers-mesa-ma';
import * as ewo from '../../src/community/elliott-wave-oscillator-signals-by-dgt';
import * as ichimoku from '../../src/community/ichimoku-kink-hy';
import * as logistic from '../../src/community/logistic-rsi-stoch-roc-ao-by-dgt';
import * as lorentzian from '../../src/community/lorentzian-classification';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'absorption-bubbles': [
    ["alert0", "Buying Absorption", "Absorption detected: Buyers absorbed selling pressure"],
    ["alert1", "Selling Absorption", "Absorption detected: Sellers absorbed buying pressure"],
    ["alert2", "Absorption (Any)", "Absorption detected: Buying or Selling absorption event"],
  ],
  'elliott-wave-oscillator-signals-by-dgt': [
    ["alert0", "Long : Early Warning", "EWOˢ - Probable Long Trade (Not Confirmed)\n{{exchange}}:{{ticker}}\nPrice = {{close}}\nTime = {{time}}"],
    ["alert1", "Long : Trading Opportunity", "EWOˢ - Probable Long Trade Opportunity\n{{exchange}}:{{ticker}}\nPrice = {{close}}\nTime = {{time}}"],
    ["alert2", "Short : Early Warning", "EWOˢ - Probable Short Trade (Not Confirmed)\n{{exchange}}:{{ticker}}\nPrice = {{close}}\nTime = {{time}}"],
    ["alert3", "Short : Trading Opportunity", "EWOˢ - Probable Short Trade Opportunity\n{{exchange}}:{{ticker}}\nPrice = {{close}}\nTime = {{time}}"],
    ["alert4", "Crossover Upper High KC", "Crossover Upper High KC Band\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}"],
    ["alert5", "Crossover Upper Mid KC", "Crossover Upper Mid KC Band\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}"],
    ["alert6", "Crossunder Lower Mid KC", "Crossunder Lower Mid KC Band\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}"],
    ["alert7", "Crossunder Lower Low KC", "Crossunder Lower Low KC Band\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}"],
  ],
  'ichimoku-kink-hy': [
    ["alert0", "Signal: Bullish Reversal ▲", "SIGNAL: Bullish Reversal — All Ichimoku filters aligned ▲ — {{ticker}} {{interval}} @ {{close}}"],
    ["alert1", "Signal: Bearish Reversal ▼", "SIGNAL: Bearish Reversal — All Ichimoku filters aligned ▼ — {{ticker}} {{interval}} @ {{close}}"],
    ["alert2", "S/R: Zone Flipped (S↔R)", "Ichimoku: S/R zone flipped type (Support ↔ Resistance) - {{ticker}} {{interval}} @ {{close}}"],
    ["alert3", "S/R: Zone Retested", "Ichimoku: S/R zone retested (price rejected at level) - {{ticker}} {{interval}} @ {{close}}"],
    ["alert4", "S/R: Resistance Broken ↑", "Ichimoku: Resistance broken upward (bullish breakout) - {{ticker}} {{interval}} @ {{close}}"],
    ["alert5", "S/R: Support Broken ↓", "Ichimoku: Support broken downward (bearish breakdown) - {{ticker}} {{interval}} @ {{close}}"],
    ["alert6", "S/R: Median (Equilibrium) Crossed", "Ichimoku: S/R equilibrium (median) crossed — Hosoda balance point breached - {{ticker}} {{interval}} @ {{close}}"],
    ["alert7", "TK-Range: Bullish Breakout ↑", "TK-RANGE BREAKOUT: Price broke ABOVE TK/KJ consolidation zone - {{ticker}} {{interval}} @ {{close}}"],
    ["alert8", "TK-Range: Bearish Breakdown ↓", "TK-RANGE BREAKDOWN: Price broke BELOW TK/KJ consolidation zone - {{ticker}} {{interval}} @ {{close}}"],
    ["alert9", "TK-Range: Median (Equilibrium) Crossed", "TK-RANGE MEDIAN: Equilibrium crossed within extended consolidation zone - {{ticker}} {{interval}} @ {{close}}"],
    ["alert10", "Swing: High Detected", "SWING HIGH detected - Structural pivot confirmed - {{ticker}} {{interval}} @ {{close}}"],
    ["alert11", "Swing: Low Detected", "SWING LOW detected - Structural pivot confirmed - {{ticker}} {{interval}} @ {{close}}"],
    ["alert12", "Wave: Bullish Pattern Detected", "WAVE THEORY: Bullish wave pattern completed (I/V/N/P/Y/W) - {{ticker}} {{interval}} @ {{close}}"],
    ["alert13", "Wave: Bearish Pattern Detected", "WAVE THEORY: Bearish wave pattern completed (I/V/N/P/Y/W) - {{ticker}} {{interval}} @ {{close}}"],
    ["alert14", "Price Target: Bullish Target Reached ↑", "PRICE THEORY: Bullish N-wave target reached (V/N/E/NT/2E/3E) - {{ticker}} {{interval}} @ {{close}}"],
    ["alert15", "Price Target: Bearish Target Reached ↓", "PRICE THEORY: Bearish N-wave target reached (V/N/E/NT/2E/3E) - {{ticker}} {{interval}} @ {{close}}"],
    ["alert16", "Kihon: Time Cycle Window", "KIHON SŪCHI: Time cycle window active (±1 bar) - Potential reversal timing - {{ticker}} {{interval}} @ {{close}}"],
    ["alert17", "Taito: Time Symmetry Window", "TAITO SŪCHI: Time symmetry projection reached (±1 bar) - Duration echo detected - {{ticker}} {{interval}} @ {{close}}"],
    ["alert18", "TxP: Time Window with Active Targets", "TIME x PRICE: Kihon/Taito window active with unreached price targets — watch for confluence - {{ticker}} {{interval}} @ {{close}}"],
    ["alert19", "TxP: Bullish Confluence CONFIRMED ◆", "TIME x PRICE CONFLUENCE CONFIRMED ◆ — Bullish target reached during time cycle window - {{ticker}} {{interval}} @ {{close}}"],
    ["alert20", "TxP: Bearish Confluence CONFIRMED ◆", "TIME x PRICE CONFLUENCE CONFIRMED ◆ — Bearish target reached during time cycle window - {{ticker}} {{interval}} @ {{close}}"],
    ["alert21", "Panel: Consensus Direction Changed", "PANEL: CONSENSUS DIRECTION CHANGED - Check panel for new bias - {{ticker}} {{interval}} @ {{close}}"],
  ],
  'logistic-rsi-stoch-roc-ao-by-dgt': [
    ["alert0", "Long : Early Warning", "LOGISTIC - Not Confirmed Probable Long Trade Opportunity\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}"],
    ["alert1", "Long : Trading Opportunity", "LOGISTIC - Probable Long Trade Opportunity\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}"],
    ["alert2", "Short : Early Warning", "LOGISTIC - Not Confirmed Probable Short Trade Opportunity\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}"],
    ["alert3", "Short : Trading Opportunity", "LOGISTIC - Probable Short Trade Opportunity\n{{exchange}}:{{ticker}}->\nPrice = {{close}},\nTime = {{time}}"],
  ],
  'lorentzian-classification': [
    ["alert0", "Open Long ▲", "LDC Open Long ▲ | {{ticker}}@{{close}} | ({{interval}})"],
    ["alert1", "Close Long ▲", "LDC Close Long ▲ | {{ticker}}@{{close}} | ({{interval}})"],
    ["alert2", "Open Short ▼", "LDC Open Short  | {{ticker}}@{{close}} | ({{interval}})"],
    ["alert3", "Close Short ▼", "LDC Close Short ▼ | {{ticker}}@{{close}} | ({{interval}})"],
    ["alert4", "Open Position ▲▼", "LDC Open Position ▲▼ | {{ticker}}@{{close}} | ({{interval}})"],
    ["alert5", "Close Position ▲▼", "LDC Close Position  ▲▼ | {{ticker}}@[{{close}}] | ({{interval}})"],
    ["alert6", "Kernel Bullish Color Change", "LDC Kernel Bullish ▲ | {{ticker}}@{{close}} | ({{interval}})"],
    ["alert7", "Kernel Bearish Color Change", "LDC Kernel Bearish ▼ | {{ticker}}@{{close}} | ({{interval}})"],
  ],
};

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of daily bars with a random volume (5 % of the bars with a large volume) */
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
const bars = walk(1200, 48);
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const vals = (p: { value: number }[]) => p.map((x) => x.value);
/** Pine ta.crossover / ta.crossunder: now and on the bar before (na compares false) */
const crossP = (a: number[], b: number[] | number, up: boolean) => a.map((v, i) => {
  const w = typeof b === 'number' ? b : b[i];
  const pv = i > 0 ? a[i - 1] : NaN;
  const pw = i > 0 ? (typeof b === 'number' ? b : b[i - 1]) : NaN;
  return up ? v > w && pv <= pw : v < w && pv >= pw;
});
const prev = (f: boolean[]) => f.map((_, i) => i > 0 && f[i - 1]);
const union = (a: number[], b: number[]) => [...new Set([...a, ...b])].sort((x, y) => x - y);
type Marker = { id?: string; time: unknown; size?: unknown; color?: string; price?: number; shape?: string };
const idTimes = (ms: Marker[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);
const idsOf = (ms: { id?: string }[]) => [...new Set(ms.map((m) => m.id))].sort();

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'absorption-bubbles': absorption, 'elliott-wave-oscillator-signals-by-dgt': ewo, 'ichimoku-kink-hy': ichimoku,
    'logistic-rsi-stoch-roc-ao-by-dgt': logistic, 'lorentzian-classification': lorentzian,
  };
  for (const [id, mod] of Object.entries(mods)) {
    it(id, () => expect(decls(mod)).toEqual(SPEC[id]));
  }
  it('indicator objects carry the declarations', () => {
    expect(absorption.AbsorptionBubbles.alertConditions).toBe(absorption.alertConditions);
    expect(ewo.ElliottWaveOscillatorSignalsByDgt.alertConditions).toBe(ewo.alertConditions);
    expect(ichimoku.IchimokuKinkHy.alertConditions).toBe(ichimoku.alertConditions);
    expect(logistic.LogisticRsiStochRocAoByDgt.alertConditions).toBe(logistic.alertConditions);
    expect(lorentzian.LorentzianClassification.alertConditions).toBe(lorentzian.alertConditions);
  });
  it('alert() ports flag hasAlertFunction', () => {
    expect(ewo.hasAlertFunction).toBe(true);
    expect(ewo.ElliottWaveOscillatorSignalsByDgt.hasAlertFunction).toBe(true);
    expect(logistic.hasAlertFunction).toBe(true);
    expect(logistic.LogisticRsiStochRocAoByDgt.hasAlertFunction).toBe(true);
  });
});

describe('absorption-bubbles', () => {
  // scaledVol = volume / ta.stdev(volume, 100) (population deviation); the five bands from the threshold 0.1
  const len = 100;
  const t = 0.1;
  const scaled = bars.map((b, i) => {
    if (i < len - 1) return NaN;
    const win = bars.slice(i - len + 1, i + 1).map((x) => x.volume as number);
    const mean = win.reduce((s, v) => s + v, 0) / len;
    const sd = Math.sqrt(win.reduce((s, v) => s + (v - mean) ** 2, 0) / len);
    return (b.volume as number) / sd;
  });
  const band = (v: number) => (ge(v, t + 6) ? 4 : ge(v, t + 3) ? 3 : ge(v, t + 2) ? 2 : ge(v, t + 1) ? 1 : ge(v, t) ? 0 : -1);
  const mid = bars.map((b) => (b.high + b.low) / 2);
  const validUp = bars.map((b, i) => ge(mid[i], Math.max(b.open, b.close)) && le(mid[i], b.high));
  const validDn = bars.map((b, i) => le(mid[i], Math.min(b.open, b.close)) && ge(mid[i], b.low));
  const anyCond = scaled.map((v) => band(v) >= 0);
  const r = absorption.calculate(bars);

  it('alerts: buying (lower wick), selling (upper wick), any', () => {
    const buy = anyCond.map((c, i) => c && validDn[i]);
    const sell = anyCond.map((c, i) => c && validUp[i]);
    expect(times(r, 0)).toEqual(timeAt(bars, buy));
    expect(times(r, 1)).toEqual(timeAt(bars, sell));
    expect(times(r, 2)).toEqual(timeAt(bars, buy.map((b, i) => b || sell[i])));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
  });
  it('alerts wait for a confirmed last bar (barstate.isconfirmed)', () => {
    const k = anyCond.map((c, i) => c && (validUp[i] || validDn[i])).lastIndexOf(true);
    const cut = bars.slice(0, k + 1);
    expect(absorption.calculate(cut).alerts[2].triggered).toBe(true);
    expect(absorption.calculate(cut, {}, { lastBarConfirmed: false }).alerts[2].triggered).toBe(false);
    expect(absorption.calculate(cut, {}, { lastBarConfirmed: false }).alerts[2].times).not.toContain(cut[k].time);
  });
  it('style ids: shape0-4 upper wick by size, shape5-9 lower wick, barcolor0 bull, barcolor1 bear', () => {
    const sizes = ['tiny', 'small', 'normal', 'large', 'huge'];
    const byTime = new Map(bars.map((b, i) => [b.time as number, i]));
    expect(r.markers.length).toBeGreaterThan(10);
    for (const m of r.markers) {
      const i = byTime.get(m.time as number)!;
      const k = band(scaled[i]);
      expect(m.id).toBe(validUp[i] ? `shape${k}` : `shape${k + 5}`);
      expect(m.size).toBe(sizes[k]);
    }
    expect(idsOf(r.markers).every((id) => /^shape[0-9]$/.test(id ?? ''))).toBe(true);
    expect(r.barColors.length).toBeGreaterThan(0);
    for (const c of r.barColors) {
      const b = bars[byTime.get(c.time)!];
      expect(c.id).toBe(b.close > b.open ? 'barcolor0' : 'barcolor1');
    }
  });
});

describe('ehlers-mesa-ma', () => {
  const r = mesa.calculate(bars, { markCrossovers: true });
  it('crossover markers are plotarrow arrows (arrow0, +1 up / -1 down) with Mark crossover points; no markers', () => {
    const m = vals(r.plots.plot0);
    const f = vals(r.plots.plot1);
    const expected: { time: number; value: number }[] = [];
    for (let i = 51; i < bars.length; i++) {
      if ((m[i - 1] > f[i - 1]) !== (m[i] > f[i])) expected.push({ time: bars[i].time as number, value: m[i] > f[i] ? 1 : -1 });
    }
    // (compared after the warm-up: MAMA / FAMA start from 0 and may cross on the first bars, as in the original)
    expect(r.arrows.filter((a) => a.time >= (bars[51].time as number)).map((a) => ({ time: a.time, value: a.value }))).toEqual(expected);
    expect(expected.length).toBeGreaterThan(10);
    expect(idsOf(r.arrows)).toEqual(['arrow0']);
    expect((r as { markers?: unknown[] }).markers ?? []).toEqual([]);
    // off by default (input 'Mark crossover points')
    expect(mesa.calculate(bars).arrows).toEqual([]);
  });
  it('fills titled as the original (NegativeFill DummyL to MAMA, PositiveFill DummyL to FAMA)', () => {
    const rf = mesa.calculate(bars, { fillRegion: true });
    expect(rf.fills?.map((x) => [x.options?.title, x.plot1, x.plot2])).toEqual([
      ['NegativeFill', 'duml', 'plot0'], ['PositiveFill', 'duml', 'plot1'],
    ]);
    // DummyL = max(MAMA, FAMA): the fill to the higher line is empty, so each fill shows on its side only
    const m = vals(rf.plots.plot0), f = vals(rf.plots.plot1), d = vals(rf.plots.duml);
    for (let i = 50; i < bars.length; i++) expect(d[i]).toBe(m[i] > f[i] ? m[i] : f[i]);
    // off by default (input 'Fill MAMA/FAMA Region'): DummyL is na
    expect(vals(mesa.calculate(bars).plots.duml).every((v) => Number.isNaN(v))).toBe(true);
  });
});

describe('elliott-wave-oscillator-signals-by-dgt', () => {
  const cS = new Series(bars, (b) => b.close);
  const e5 = A(ta.ema(cS, 5));
  const e34 = A(ta.ema(cS, 34));
  const osc = e5.map((v, i) => (v / e34[i] - 1) * 100);
  const sig = A(ta.ema(Series.fromArray(bars, osc), 5));
  const up = crossP(osc, sig, true);
  const dn = crossP(osc, sig, false);
  const mid = A(ta.ema(cS, 20));
  const atr = A(ta.atr(bars, 10));
  const kc = (mult: number) => mid.map((v, i) => v + mult * atr[i]);
  const r = ewo.calculate(bars);

  it('alerts: early warning on the cross, trading opportunity one bar later, Keltner band crosses', () => {
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, prev(up)));
    expect(times(r, 2)).toEqual(timeAt(bars, dn));
    expect(times(r, 3)).toEqual(timeAt(bars, prev(dn)));
    expect(times(r, 4)).toEqual(timeAt(bars, crossP(close, kc(3), true)));
    expect(times(r, 5)).toEqual(timeAt(bars, crossP(close, kc(2), true)));
    expect(times(r, 6)).toEqual(timeAt(bars, crossP(close, kc(-2), false)));
    expect(times(r, 7)).toEqual(timeAt(bars, crossP(close, kc(-3), false)));
    for (let k = 0; k < 8; k++) expect(times(r, k).length).toBeGreaterThan(3);
  });
  it('Keltner alerts do not depend on the channels being displayed', () => {
    const shown = ewo.calculate(bars, { k: true });
    for (let k = 4; k < 8; k++) expect(times(shown, k)).toEqual(times(r, k));
  });
  it('alert() calls of the backtest: entries, stop loss and early warnings, once per bar', () => {
    const none = ewo.calculate(bars);
    expect(none.alertCalls).toEqual([]);
    const chart = { now: (bars[bars.length - 1].time as number) * 1000, tickerid: 'NASDAQ:AAPL' };
    const bt = ewo.calculate(bars, { isBackTest: true, lenBckTst: 10, isStopLoss: true, stopLoss: 1 }, chart);
    expect(bt.alertCalls.length).toBeGreaterThan(10);
    const re = /^(Long entry|Short entry|Stop loss|Long early warning|Short early warning) — NASDAQ:AAPL \| Price: -?[\d.]+$/;
    const byTime = new Map(bars.map((b, i) => [b.time as number, i]));
    for (const c of bt.alertCalls) {
      expect(c.message).toMatch(re);
      expect(c.freq).toBe('once_per_bar');
      const i = byTime.get(c.time)!;
      expect(c.message.endsWith('Price: ' + String(Number(c.message.split('Price: ')[1])))).toBe(true);
      expect(Math.abs(Number(c.message.split('Price: ')[1]) - close[i])).toBeLessThan(1e-6);
      // entries on the second bar after a cross, early warnings on the bar after a cross
      if (c.message.startsWith('Long entry')) expect(up[i - 2]).toBe(true);
      if (c.message.startsWith('Short entry')) expect(dn[i - 2]).toBe(true);
      if (c.message.startsWith('Long early warning')) expect(up[i - 1] && !dn[i]).toBe(true);
      if (c.message.startsWith('Short early warning')) expect(dn[i - 1] && !up[i]).toBe(true);
    }
    const kinds = new Set(bt.alertCalls.map((c) => c.message.split(' — ')[0]));
    expect([...kinds].sort()).toEqual(['Long early warning', 'Long entry', 'Short early warning', 'Short entry', 'Stop loss']);
  });
  it('style ids: shape0 strong long, shape1 long, shape2 strong short, shape3 short', () => {
    const shown = bars.map((_, i) => i >= bars.length - 233);
    const want = [
      up.map((u, i) => u && shown[i] && lt(osc[i], -13)), up.map((u, i) => u && shown[i] && ge(osc[i], -13)),
      dn.map((d, i) => d && shown[i] && gt(osc[i], 13)), dn.map((d, i) => d && shown[i] && le(osc[i], 13)),
    ];
    for (let k = 0; k < 4; k++) expect(idTimes(r.markers, `shape${k}`)).toEqual(timeAt(bars, want[k]));
    expect(r.markers.every((m) => /^shape[0-3]$/.test(m.id ?? ''))).toBe(true);
    // the strong shapes need a larger threshold to show up on these bars
    const low = ewo.calculate(bars, { t: 1 });
    expect(idsOf(low.markers)).toEqual(['shape0', 'shape1', 'shape2', 'shape3']);
  });
});

describe('ichimoku-kink-hy', () => {
  const opts = {
    tkrEnabled: true, swingEnabled: true, waveEnabled: true, priceTEnabled: true, kihonEnabled: true, taitoEnabled: true,
    txpEnabled: true,
  } as const;
  const r = ichimoku.calculate(bars, opts);
  const count = (x: Alerts) => x.alerts.map((a) => a.times.length);

  it('signals: the regime flips, as the signal triangles', () => {
    expect(times(r, 0)).toEqual(r.markers!.filter((m) => m.shape === 'triangleUp').map((m) => m.time));
    expect(times(r, 1)).toEqual(r.markers!.filter((m) => m.shape === 'triangleDown').map((m) => m.time));
    expect(times(r, 0).length).toBeGreaterThan(3);
  });
  it('TK-Range breakouts: close leaves the TK / KJ band after 3 bars inside', () => {
    const tk = vals(r.plots.plot2);
    const kj = vals(r.plots.plot3);
    const atr14 = taCore.atr(14, high, low, close);
    let consec = 0;
    const consecs: number[] = [];
    const inside = tk.map((a, i) => {
      const have = !isNaN(a) && !isNaN(kj[i]);
      const top = Math.max(a, kj[i]);
      const bot = Math.min(a, kj[i]);
      return have && ge(Math.abs(a - kj[i]), atr14[i] * 0.1) && ge(close[i], bot - 0.005) && le(close[i], top + 0.005);
    });
    inside.forEach((x) => consecs.push((consec = x ? consec + 1 : 0)));
    const top = tk.map((a, i) => Math.max(a, kj[i]));
    const bot = tk.map((a, i) => Math.min(a, kj[i]));
    const exitUp = inside.map((x, i) => i > 0 && consecs[i - 1] >= 3 && !x && gt(close[i], top[i - 1]));
    const exitDn = inside.map((x, i) => i > 0 && consecs[i - 1] >= 3 && !x && lt(close[i], bot[i - 1]));
    expect(times(r, 7)).toEqual(timeAt(bars, exitUp));
    expect(times(r, 8)).toEqual(timeAt(bars, exitDn));
    expect(times(r, 7).length + times(r, 8).length).toBeGreaterThan(3);
    // TK-Range off: no breakout alerts
    const off = ichimoku.calculate(bars, { ...opts, tkrEnabled: false });
    expect(times(off, 7)).toEqual([]);
    expect(times(off, 9)).toEqual([]);
  });
  it('swings: the pivots of the swing length (only with swings on)', () => {
    const ph = taCore.pivothigh(high, 10, 10);
    const pl = taCore.pivotlow(low, 10, 10);
    expect(times(r, 10)).toEqual(timeAt(bars, ph.map((v) => !isNaN(v))));
    expect(times(r, 11)).toEqual(timeAt(bars, pl.map((v) => !isNaN(v))));
    const off = ichimoku.calculate(bars);
    for (const k of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) expect(times(off, k)).toEqual([]);
  });
  it('waves, targets, time windows and confluence fire, with the original rules between them', () => {
    const c = count(r);
    for (const k of [9, 12, 13, 14, 15, 16, 17, 18, 21]) expect(c[k]).toBeGreaterThan(0);
    const t12 = new Set(times(r, 12));
    expect(times(r, 13).some((x) => t12.has(x))).toBe(false);
    const windows = new Set(union(times(r, 16), times(r, 17)));
    for (const k of [18, 19, 20]) expect(times(r, k).every((x) => windows.has(x))).toBe(true);
    const confirmed = new Set(union(times(r, 19), times(r, 20)));
    expect(times(r, 18).some((x) => confirmed.has(x))).toBe(false);
    // a confirmation is a target reached on that bar
    const reached = new Set(union(times(r, 14), times(r, 15)));
    expect([...confirmed].every((x) => reached.has(x))).toBe(true);
    expect(times(r, 21)).not.toContain(bars[0].time);
  });
  it('S/R zone breaks, retests, flips and median crossings', () => {
    const line = ichimoku.calculate(bars, { srFlipEnabled: true });
    expect(times(line, 2).length).toBeGreaterThan(0);
    expect(times(line, 3).length + times(line, 4).length + times(line, 5).length).toBeGreaterThan(0);
    // a flip is a break
    const brk = new Set(union(times(line, 4), times(line, 5)));
    expect(times(line, 2).every((x) => brk.has(x))).toBe(true);
    // the median alert needs the Zone layout
    expect(times(line, 6)).toEqual([]);
    const zone = ichimoku.calculate(bars, { srZoneLayout: 'Zone', srZonePlacement: 'Median' });
    expect(times(zone, 6).length).toBeGreaterThan(0);
    // in Zone + Median every non-silent break is a median crossing
    const zb = union(times(zone, 4), times(zone, 5));
    expect(zb.every((x) => times(zone, 6).includes(x))).toBe(true);
    const plain = ichimoku.calculate(bars);
    expect(times(plain, 2)).toEqual([]);
    expect(times(plain, 4).length + times(plain, 5).length).toBeGreaterThan(0);
  });
});

describe('logistic-rsi-stoch-roc-ao-by-dgt', () => {
  it('alerts: crosses of the standard deviation line over / under 0, and one bar later', () => {
    const r = logistic.calculate(bars);
    const sd = vals(r.plots.plot27);
    const up = crossP(sd, 0, true);
    const dn = crossP(sd, 0, false);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, prev(up)));
    expect(times(r, 2)).toEqual(timeAt(bars, dn));
    expect(times(r, 3)).toEqual(timeAt(bars, prev(dn)));
    expect(times(r, 0).length).toBeGreaterThan(5);
  });
  it('alert() calls with the backtest on', () => {
    expect(logistic.calculate(bars).alertCalls).toEqual([]);
    const chart = { now: (bars[bars.length - 1].time as number) * 1000, tickerid: 'NASDAQ:AAPL' };
    const bt = logistic.calculate(bars, { isBackTest: true, lenBckTst: 10 }, chart);
    expect(bt.alertCalls.length).toBeGreaterThan(5);
    for (const c of bt.alertCalls) {
      expect(c.message).toMatch(/^(Long entry|Short entry|Stop loss|Long early warning|Short early warning) — NASDAQ:AAPL \| Price: -?[\d.]+$/);
      expect(c.freq).toBe('once_per_bar');
    }
  });
});

describe('lorentzian-classification', () => {
  const r = lorentzian.calculate(bars, { showExits: true });
  it('alerts: open / close trades as the entry / exit shapes, combined alerts, kernel colour changes', () => {
    expect(times(r, 0)).toEqual(idTimes(r.markers, 'shape0'));
    expect(times(r, 2)).toEqual(idTimes(r.markers, 'shape1'));
    expect(times(r, 1)).toEqual(idTimes(r.markers, 'shape2'));
    expect(times(r, 3)).toEqual(idTimes(r.markers, 'shape3'));
    expect(times(r, 4)).toEqual(union(times(r, 0), times(r, 2)));
    expect(times(r, 5)).toEqual(union(times(r, 1), times(r, 3)));
    const y = vals(r.plots.plot0);
    const bull = y.map((v, i) => i >= 2 && lt(y[i - 1], v) && gt(y[i - 2], y[i - 1]));
    const bear = y.map((v, i) => i >= 2 && gt(y[i - 1], v) && lt(y[i - 2], y[i - 1]));
    expect(times(r, 6)).toEqual(timeAt(bars, bull));
    expect(times(r, 7)).toEqual(timeAt(bars, bear));
    for (let k = 0; k < 8; k++) expect(times(r, k).length).toBeGreaterThan(0);
  });
});
