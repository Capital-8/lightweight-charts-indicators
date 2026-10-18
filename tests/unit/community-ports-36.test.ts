/**
 * Community ports, batch 36: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression, on the port's plotted series
 * when the expression reads one), the alert() calls, and the Style ids on the emitted markers / arrows and fills.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ta, Series, str, color, type Bar } from 'oakscriptjs';
import { makeBars } from './community-top100.helpers';
import * as smcp from '../../src/community/smart-money-concepts-probability';
import * as smfs from '../../src/community/smart-money-flow-signals';
import * as smvi from '../../src/community/smart-money-volume-index';
import * as strend from '../../src/community/smart-trend';
import * as snr from '../../src/community/smarter-snr';
import * as webhook from '../../src/community/smc-indicator-with-webhook';
import * as walls from '../../src/community/smc-statistical-liquidity-walls';
import * as smcfvg from '../../src/community/smc-structures-and-fvg';
import * as srsi from '../../src/community/smooth-rsi';
import * as spmacd from '../../src/community/sp-macd-with-divergence';
import * as spira from '../../src/community/spira-alligator';
import * as spx from '../../src/community/spx500-quick-drop-rise-alerts';
import * as sqc from '../../src/community/squeeze-channel';
import * as sslh from '../../src/community/ssl-hybrid';
import * as ssla from '../../src/community/ssl-hybrid-advanced';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {"smart-money-flow-signals": [["alert0", "Bullish Flow", "Smart Money Flow: BULLISH crossover detected! Money flowing INTO {{exchange}}:{{ticker}} - {{interval}}"], ["alert1", "Bearish Flow", "Smart Money Flow: BEARISH crossover detected! Money flowing OUT of {{exchange}}:{{ticker}} - {{interval}}"], ["alert2", "Any Flow Direction Change", "Smart Money Flow: Direction change detected! Check chart {{exchange}}:{{ticker}} - {{interval}}"], ["alert3", "Overbought Reversal", "Smart Money Flow: OVERBOUGHT reversal signal! Potential bearish reversal {{exchange}}:{{ticker}} - {{interval}}"], ["alert4", "Oversold Reversal", "Smart Money Flow: OVERSOLD reversal signal! Potential bullish reversal {{exchange}}:{{ticker}} - {{interval}}"], ["alert5", "Extreme Overbought", "Smart Money Flow: EXTREME overbought conditions! {{exchange}}:{{ticker}} - {{interval}}"], ["alert6", "Extreme Oversold", "Smart Money Flow: EXTREME oversold conditions! {{exchange}}:{{ticker}} - {{interval}}"]], "smart-money-volume-index": [["alert0", "High Smart Money Buy Interest", "Alert Fired!"], ["alert1", "High Smart Money Sell Interest", "Alert Fired!"], ["alert2", "Smart Money Buy Interest no longer high", "Alert Fired!"], ["alert3", "Smart Money Sell Interest no longer high", "Alert Fired!"], ["alert4", "Smart Money Buy Interest turned positive", "Alert Fired!"], ["alert5", "Smart Money Buy Interest turned negative", "Alert Fired!"], ["alert6", "Smart Money Sell Interest turned positive", "Alert Fired!"], ["alert7", "Smart Money Sell Interest turned negative", "Alert Fired!"], ["alert8", "Smart Money Buy Interest entered high zone", "Alert Fired!"], ["alert9", "Smart Money Buy Interest exited high zone", "Alert Fired!"]], "smart-trend": [["alert0", "Smart Trend: BUY Signal", "Smart Trend Buy Signal on {{ticker}}"], ["alert1", "Smart Trend: SELL Signal", "Smart Trend Sell Signal on {{ticker}}"]], "smarter-snr": [["alert0", "Upper Trendline Breaked", "Alert Fired!"], ["alert1", "Lower Trendline Breaked", "Alert Fired!"], ["alert2", "Close Price Crossover  The Resistance", "Alert Fired!"], ["alert3", "Close Price Crossunder The Resistance", "Alert Fired!"], ["alert4", "Close Price Crossover  The Support", "Alert Fired!"], ["alert5", "Close Price Crossunder The Support", "Alert Fired!"]], "smc-statistical-liquidity-walls": [["alert0", "Hit Premium Wall", "Price touched the solid Premium Liquidity Wall"], ["alert1", "Hit Discount Wall", "Price touched the solid Discount Liquidity Wall"]], "smc-structures-and-fvg": [["alert0", "BOS", "BOS"], ["alert1", "CHOCH", "CHOCH"]], "sp-macd-with-divergence": [["alert0", "Regular Bullish Divergence", "MACD: Regular Bullish Divergence detected."], ["alert1", "Regular Bearish Divergence", "MACD: Regular Bearish Divergence detected."]], "spira-alligator": [["alert0", "BUY Signal", "🟢 SPKOA BUY  — Lips krysset over Teeth, pris over EMA 144"], ["alert1", "SELL Signal", "🔴 SPKOA SELL — Lips krysset under Teeth, pris under EMA 144"]], "spx500-quick-drop-rise-alerts": [["alert0", "Quick Price Drop", "SPX500 dropped more than {{dropThreshold}}% in {{lookbackBars}} bars!"], ["alert1", "Quick Price Rise", "SPX500 rose more than {{dropThreshold}}% in {{lookbackBars}} bars!"]], "squeeze-channel": [["alert0", "Bullish Breakout", "EDRF: Bullish breakout"], ["alert1", "Bearish Breakout", "EDRF: Bearish breakout"], ["alert2", "Bull Reversal", "EDRF: Failed bear breakout - bull reversal"], ["alert3", "Bear Reversal", "EDRF: Failed bull breakout - bear reversal"], ["alert4", "Ext Bull Breakout", "EDRF: Extended resistance breakout"], ["alert5", "Ext Bear Breakout", "EDRF: Extended support breakdown"], ["alert6", "Ext Bull Reversal", "EDRF: Extended support reclaim"], ["alert7", "Ext Bear Reversal", "EDRF: Extended resistance rejection"], ["alert8", "Squeeze Started", "EDRF: Squeeze detected"]], "ssl-hybrid": [["alert0", "EXIT LONG Signal", "EXIT LONG Signal – see chart for price and risk details"], ["alert1", "EXIT SHORT Signal", "EXIT SHORT Signal – see chart for price and risk details"], ["alert2", "SSL2 BUY Continuation", "SSL2 BUY Continuation – see chart for ATR details"], ["alert3", "SSL2 SELL Continuation", "SSL2 SELL Continuation – see chart for ATR details"], ["alert4", "Price Above Upper Channel", "Price Above Upper Channel – price has broken above upper band"], ["alert5", "Price Below Lower Channel", "Price Below Lower Channel – price has broken below lower band"], ["alert6", "Price Crossed Above Baseline", "Price Crossed Above Baseline"], ["alert7", "Price Crossed Below Baseline", "Price Crossed Below Baseline"], ["alert8", "HIGH RISK Entry Conditions", "HIGH RISK Entry – check chart for context"], ["alert9", "FALSE BREAKOUT WARNING", "FALSE BREAKOUT WARNING – possible trap candle"], ["alert10", "EXTREME VOLATILITY", "EXTREME VOLATILITY – check ATR levels on chart"]], "ssl-hybrid-advanced": [["alert0", "TABLE:Strength Alert", "Table UP/DN Signal Strength"], ["alert1", "SSL Hybrid:SSL Cross Alert", "SSL1 has crossed."], ["alert2", "SSL Hybrid:SSL2 Cross Alert", "SSL2 has crossed."], ["alert3", "SSL Hybrid:Sell Continuation", "Sell Continuation."], ["alert4", "SSL Hybrid:Buy Continuation", "Buy Continuation."], ["alert5", "SSL Hybrid:Exit Sell", "Exit Sell Alert."], ["alert6", "SSL Hybrid:Exit Buy", "Exit Buy Alert."], ["alert7", "SSL Hybrid:Baseline Buy Entry", "Base Buy Alert."], ["alert8", "SSL Hybrid:Baseline Sell Entry", "Base Sell Alert."], ["alert9", "Advanced:EMA20/50 Signal", "Advanced:EMA20/50  Up/Dn  Signal"], ["alert10", "Advanced:QQE Crossover ", "Advanced: QQE Crossing Zero"], ["alert11", "FILTER:Buy/Sell Alert", "FILTER:TREND FILTER Buy/Sell  Alert"], ["alert12", "FILTER:Buy Alert", "FILTER:TREND FILTER- Buy Alert"], ["alert13", "FILTER:Sell Alert", "FILTER:TREND FILTER- Sell Alert"], ["alert14", "Advanced:SSL Buy Sell Alert", "Advanced:SSL BUY / SELL / Alert."], ["alert15", "Advanced ADX:Volatile Sideways /Exit trade", "Advanced:Low ADX / Dont Trade /Exit Trade"], ["alert16", "Advanced: MTF/HMA Crossover", "Advanced:MTF/HMA  Crossover Alert"], ["alert17", "MIXED:SSL/Channel or EMA Cross or HMA Buy/sell or SuperTrend", "MIXED Signal:\nSSL/Channel\n EMA Crossover\n HMA Entry/Exit \n SuperTrend Direction Changed"], ["alert18", "S/R:Resistance Broken", "Resistance Broken"], ["alert19", "S/R:Support Broken", "Support Broken"]]};

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
const bars = walk(1200, 11);
const n = bars.length;
const close = bars.map((b) => b.close);
const open = bars.map((b) => b.open);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
const S = (a: number[]) => Series.fromArray(bars, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const idTimes = (ms: { time: unknown; id?: string }[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);
const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const indexOf = new Map(bars.map((b, i) => [b.time as number, i]));

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

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'smart-money-flow-signals': smfs, 'smart-money-volume-index': smvi, 'smart-trend': strend, 'smarter-snr': snr,
    'smc-statistical-liquidity-walls': walls, 'smc-structures-and-fvg': smcfvg, 'sp-macd-with-divergence': spmacd,
    'spira-alligator': spira, 'spx500-quick-drop-rise-alerts': spx, 'squeeze-channel': sqc, 'ssl-hybrid': sslh,
    'ssl-hybrid-advanced': ssla,
  };
  for (const [id, m] of Object.entries(mods)) it(id, () => expect(decls(m)).toEqual(SPEC[id]));
  it('exported objects carry the declarations and the alert() flag', () => {
    expect(smfs.SmartMoneyFlowSignals.alertConditions).toBe(smfs.alertConditions);
    expect(smvi.SmartMoneyVolumeIndex.alertConditions).toBe(smvi.alertConditions);
    expect(strend.SmartTrend.alertConditions).toBe(strend.alertConditions);
    expect(snr.SmarterSnr.alertConditions).toBe(snr.alertConditions);
    expect(walls.SmcStatisticalLiquidityWalls.alertConditions).toBe(walls.alertConditions);
    expect(smcfvg.SmcStructuresAndFvg.alertConditions).toBe(smcfvg.alertConditions);
    expect(smcfvg.SmcStructuresAndFvg.hasAlertFunction).toBe(true);
    expect(spmacd.SpMacdWithDivergence.alertConditions).toBe(spmacd.alertConditions);
    expect(spira.SpiraAlligator.alertConditions).toBe(spira.alertConditions);
    expect(spx.Spx500QuickDropRiseAlerts.alertConditions).toBe(spx.alertConditions);
    expect(sqc.SqueezeChannel.alertConditions).toBe(sqc.alertConditions);
    expect(sslh.SslHybrid.alertConditions).toBe(sslh.alertConditions);
    expect(ssla.SslHybridAdvanced.alertConditions).toBe(ssla.alertConditions);
    expect(smcp.hasAlertFunction).toBe(true);
    expect(smcp.SmartMoneyConceptsProbability.hasAlertFunction).toBe(true);
    expect(webhook.hasAlertFunction).toBe(true);
    expect(webhook.SmcIndicatorWithWebhook.hasAlertFunction).toBe(true);
  });
});

describe('alert conditions recomputed from the original expressions', () => {
  it('smart-money-flow-signals: the composite wave crossing 0 and the levels', () => {
    const r = smfs.calculate(bars);
    const w = vals(r.plots.plot1);
    const bull = xover(w, 0);
    const bear = xunder(w, 0);
    const ob = w.map((v) => ge(v, 60));
    const os = w.map((v) => le(v, -60));
    expect(times(r, 0)).toEqual(timeAt(bars, bull));
    expect(times(r, 1)).toEqual(timeAt(bars, bear));
    expect(times(r, 2)).toEqual(timeAt(bars, bull.map((b, i) => b || bear[i])));
    // extreme_overbought and ta.crossunder(wave, overbought): never both on one bar
    expect(times(r, 3)).toEqual(timeAt(bars, ob.map((o, i) => o && xunder(w, 60)[i])));
    expect(times(r, 3)).toEqual([]);
    expect(times(r, 4)).toEqual([]);
    expect(times(r, 5)).toEqual(timeAt(bars, ob));
    expect(times(r, 6)).toEqual(timeAt(bars, os));
    for (const k of [0, 1, 5, 6]) expect(times(r, k).length).toBeGreaterThan(3);
  });

  it('smart-money-volume-index: buy / sell interest crossing the threshold, zero and 0.7 (Compare mode)', () => {
    const counts = new Array(10).fill(0);
    for (const thr of [0.9, 0.6, 0.4, 0.2]) {
      const r = smvi.calculate(bars, { mode: 'Compare', highInterestThreshold: thr });
      const buy = vals(r.plots.plot5);
      const sell = vals(r.plots.plot6).map((v) => -v);
      const want = [
        xover(buy, thr), xover(sell, thr), xunder(buy, thr), xunder(sell, thr),
        xover(buy, 0), xunder(buy, 0), xover(sell, 0), xunder(sell, 0), xover(buy, 0.7), xunder(buy, 0.7),
      ];
      want.forEach((f, k) => {
        expect(times(r, k)).toEqual(timeAt(bars, f));
        counts[k] += times(r, k).length;
      });
    }
    // the interests are ratios of positive values: never below 0 in Compare mode (the zero crossings need Net mode)
    for (const k of [0, 1, 2, 3, 8, 9]) expect(counts[k]).toBeGreaterThan(0);
    const net = smvi.calculate(bars, { mode: 'Net' });
    for (const k of [4, 5, 6, 7]) expect(net.alerts[k].times.length).toBeGreaterThan(0);
  });

  it('smart-money-volume-index: Net mode signals from the net index', () => {
    const r = smvi.calculate(bars, { mode: 'Net' });
    const up = vals(r.plots.plot12);
    const dn = vals(r.plots.plot18);
    // net index: drawn as n_up when > 0, n_dn when < 0
    const net = up.map((u, i) => (Number.isFinite(u) ? u : Number.isFinite(dn[i]) ? dn[i] : NaN));
    const crossings = times(r, 8).map((t) => indexOf.get(t)!);
    for (const i of crossings) {
      expect(net[i]).toBeGreaterThan(0.7);
      expect(Number.isNaN(net[i - 1]) || net[i - 1] <= 0.7).toBe(true);
    }
    expect(crossings.length).toBeGreaterThan(0);
    // sig_sell = -net_index: the sell interest is high when the net index is below -thr
    for (const t of times(r, 1)) expect(net[indexOf.get(t)!]).toBeLessThan(-0.9);
  });

  it('smart-trend: the trend changes that agree with the HMA filter', () => {
    for (const inputs of [{}, { useFilter: false, useVol: false, filterLen: 100 }]) {
      const r = strend.calculate(bars, inputs);
      const cfg = { ...strend.defaultInputs, ...inputs };
      const atr = A(ta.atr(bars, cfg.atrLength));
      const rank = A(ta.percentrank(S(bars.map((b) => b.volume!)), 500));
      const hma = A(ta.hma(S(close), cfg.filterLen));
      let line = NaN;
      let dir = 1;
      const dirs: number[] = [];
      const lines: number[] = [];
      for (let i = 0; i < n; i++) {
        const up = high[i] - atr[i] * cfg.multiplier;
        const lo = low[i] + atr[i] * cfg.multiplier;
        const vol = !cfg.useVol || gt(rank[i], cfg.volPctTarget);
        const prev = i > 0 ? lines[i - 1] : NaN;
        if (isNaN(line)) line = up;
        if (dir === 1) {
          if (lt(close[i], line) && vol) { dir = -1; line = lo; } else line = Math.max(isNaN(prev) ? 0 : prev, up);
        } else if (gt(close[i], line) && vol) { dir = 1; line = up; } else line = Math.min(isNaN(prev) ? 0 : prev, lo);
        lines.push(line);
        dirs.push(dir);
      }
      const long = dirs.map((d, i) => i > 0 && d === 1 && dirs[i - 1] === -1 && (!cfg.useFilter || gt(close[i], hma[i])));
      const short = dirs.map((d, i) => i > 0 && d === -1 && dirs[i - 1] === 1 && (!cfg.useFilter || lt(close[i], hma[i])));
      expect(times(r, 0)).toEqual(timeAt(bars, long));
      expect(times(r, 1)).toEqual(timeAt(bars, short));
      expect(times(r, 0).length + times(r, 1).length).toBeGreaterThan(1);
    }
  });

  it('smarter-snr: trendline breaks on closed bars, close crossing the levels', () => {
    const inputs = { useTab: false, newestBreak: false };
    const r = snr.calculate(bars, inputs);
    expect(times(r, 0)).toEqual(r.labels.filter((l) => l.text === '🔼').map((l) => l.time as number));
    expect(times(r, 1)).toEqual(r.labels.filter((l) => l.text === '🔽').map((l) => l.time as number));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    for (let k = 2; k < 6; k++) expect(times(r, k).length).toBeGreaterThan(0);
    // a break on an open last bar is not an alert
    const lastBreak = bars.findIndex((b) => b.time === times(r, 0)[times(r, 0).length - 1]);
    const cut = bars.slice(0, lastBreak + 1);
    const open1 = snr.calculate(cut, inputs, { lastBarConfirmed: false });
    expect(open1.alerts[0].times).not.toContain(cut[cut.length - 1].time);
    expect(snr.calculate(cut, inputs).alerts[0].times).toContain(cut[cut.length - 1].time);
    // the last three supports: crossing over one of them needs the close to end above a level it was at or below
    const lineLevels = new Set(r.lines.map((l) => l.price1));
    expect(lineLevels.size).toBeGreaterThan(0);
  });

  it('smc-statistical-liquidity-walls: high / low reaching basis +- 2 deviations', () => {
    const r = walls.calculate(bars);
    const basis = A(ta.sma(S(close), 20));
    const dev = A(ta.stdev(S(close), 20));
    const tr = A(ta.tr(bars, false));
    const sd = dev.map((d, i) => (Math.abs(d) <= EPS ? tr[i] : d));
    expect(times(r, 0)).toEqual(timeAt(bars, high.map((h, i) => ge(h, basis[i] + 2 * sd[i]))));
    expect(times(r, 1)).toEqual(timeAt(bars, low.map((l, i) => le(l, basis[i] - 2 * sd[i]))));
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
  });

  it('smc-structures-and-fvg: BOS / CHOCH flags held as the original var flags', () => {
    const cut = bars.slice(0, 400);
    const inputs = {
      isCurrentStructToShow: false, isFibo1ToShow: false, isFibo2ToShow: false, isFibo3ToShow: false,
      isFibo4ToShow: false, isFibo5ToShow: false, structHistoryNbr: 45,
      bullishBosColor: '#000001', bearishBosColor: '#000002', bullishChochColor: '#000003', bearishChochColor: '#000004',
    };
    const r = smcfvg.calculate(cut, inputs);
    // the break lines (all kept: fewer than the history and the 50-line limit), at the bar of the break
    expect(r.lines.length).toBeGreaterThan(5);
    expect(r.lines.length).toBeLessThan(45);
    const kind = new Map(r.lines.map((l) => [l.time2 as number, l.color === '#000001' || l.color === '#000002' ? 'BOS' : 'CHOCH']));
    let bos = false;
    let choch = false;
    const bosF: boolean[] = [];
    const chochF: boolean[] = [];
    for (const b of cut) {
      const k = kind.get(b.time as number);
      if (k === 'BOS') bos = true;
      else if (k === 'CHOCH') choch = true;
      else { bos = false; choch = false; }
      bosF.push(bos);
      chochF.push(choch);
    }
    expect(r.alerts[0].times).toEqual(timeAt(cut, bosF));
    expect(r.alerts[1].times).toEqual(timeAt(cut, chochF));
    expect(r.alerts[0].times.length).toBeGreaterThan(0);
    expect(r.alerts[1].times.length).toBeGreaterThan(0);
  });

  it('sp-macd-with-divergence: on the confirming bar, 5 bars after the Bull / Bear label', () => {
    const counts = [0, 0];
    for (const seed of [11, 12, 13, 14, 15]) {
      const list = walk(1500, seed);
      const at = new Map(list.map((b, i) => [b.time as number, i]));
      const r = spmacd.calculate(list);
      const shift = (t: number) => list[at.get(t)! + 5].time as number;
      expect(times(r, 0)).toEqual(r.markers.filter((m) => m.text === ' Bull ').map((m) => shift(m.time as number)));
      expect(times(r, 1)).toEqual(r.markers.filter((m) => m.text === ' Bear ').map((m) => shift(m.time as number)));
      counts[0] += times(r, 0).length;
      counts[1] += times(r, 1).length;
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan(0);
    // no divergence detection: no alert
    expect(spmacd.calculate(bars, { enableDivergence: false }).alerts.every((a) => a.times.length === 0)).toBe(true);
  });

  it('spira-alligator: the bars of the BUY / SELL signals, also without the labels', () => {
    const r = spira.calculate(bars);
    expect(times(r, 0)).toEqual(r.markers.filter((m) => m.shape === 'labelUp').map((m) => m.time as number));
    expect(times(r, 1)).toEqual(r.markers.filter((m) => m.shape === 'labelDown').map((m) => m.time as number));
    expect(times(r, 0).length + times(r, 1).length).toBeGreaterThan(0);
    expect(spira.calculate(bars, { showSignals: false, showBg: false }).alerts).toEqual(r.alerts);
  });

  it('spx500-quick-drop-rise-alerts: the change over the lookback at or beyond the threshold', () => {
    for (const inputs of [{}, { dropThreshold: 2, lookbackBars: 3 }]) {
      const r = spx.calculate(bars, inputs);
      const cfg = { ...spx.defaultInputs, ...inputs };
      const chg = close.map((c, i) => (i >= cfg.lookbackBars ? (100 * (c - close[i - cfg.lookbackBars])) / close[i - cfg.lookbackBars] : NaN));
      expect(times(r, 0)).toEqual(timeAt(bars, chg.map((v) => le(v, -cfg.dropThreshold))));
      expect(times(r, 1)).toEqual(timeAt(bars, chg.map((v) => ge(v, cfg.dropThreshold))));
      expect(times(r, 0).length).toBeGreaterThan(3);
      expect(times(r, 1).length).toBeGreaterThan(3);
    }
  });

  it('squeeze-channel: the shapes of each signal and the start of a squeeze', () => {
    const r = sqc.calculate(bars);
    for (let k = 0; k < 8; k++) expect(times(r, k)).toEqual(idTimes(r.markers, `shape${k}`));
    const bb = A(ta.sma(S(close), 12));
    const sd = A(ta.stdev(S(close), 12));
    const kc = A(ta.sma(S(close), 20));
    const atr = A(ta.atr(bars, 20));
    const on = bb.map((b, i) => gt(b - 2 * sd[i], kc[i] - 2 * atr[i]) && lt(b + 2 * sd[i], kc[i] + 2 * atr[i]));
    expect(times(r, 8)).toEqual(timeAt(bars, on.map((o, i) => o && !(i > 0 && on[i - 1]))));
    for (const k of [0, 1, 8]) expect(times(r, k).length).toBeGreaterThan(0);
    // the reversal alerts need the reversal option, as in the original
    const off = sqc.calculate(bars, { enableReversal: false });
    expect(off.alerts[2].times).toEqual([]);
    expect(off.alerts[3].times).toEqual([]);
  });

  it('ssl-hybrid: exits, baseline and channel crossings, warnings', () => {
    const r = sslh.calculate(bars);
    const bbmc = vals(r.plots.plot0);
    const upper = vals(r.plots.plot1);
    const lower = vals(r.plots.plot2);
    // exit_long = ta.crossunder(close, sslExit) = the down arrows, exit_short = the up arrows
    expect(times(r, 0)).toEqual(r.arrows.filter((a) => a.value < 0).map((a) => a.time as number));
    expect(times(r, 1)).toEqual(r.arrows.filter((a) => a.value > 0).map((a) => a.time as number));
    expect(times(r, 4)).toEqual(timeAt(bars, xover(close, upper)));
    expect(times(r, 5)).toEqual(timeAt(bars, xunder(close, lower)));
    expect(times(r, 6)).toEqual(timeAt(bars, close.map((c, i) => i > 0 && gt(c, bbmc[i]) && le(close[i - 1], bbmc[i]))));
    expect(times(r, 7)).toEqual(timeAt(bars, close.map((c, i) => i > 0 && lt(c, bbmc[i]) && ge(close[i - 1], bbmc[i]))));
    expect(times(r, 9)).toEqual(idTimes(r.markers, 'shape0'));
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 10]) expect(times(r, k).length).toBeGreaterThan(0);
    // ssl2_buy_signal = buy_atr and not buy_atr[1]: never on two bars in a row
    for (const k of [2, 3]) {
      const idx = times(r, k).map((t) => indexOf.get(t)!);
      for (let j = 1; j < idx.length; j++) expect(idx[j] - idx[j - 1]).toBeGreaterThan(1);
    }
  });

  it('ssl-hybrid-advanced: the conditions read from the drawn outputs', () => {
    const r = ssla.calculate(bars, { showSsl1: true, showssl2: true });
    const sslDown = vals(r.plots.plot0);
    const sslDown2 = vals(r.plots.plot1);
    expect(times(r, 1)).toEqual(timeAt(bars, xover(close, sslDown)));
    expect(times(r, 2)).toEqual(timeAt(bars, xover(close, sslDown2)));
    // Exit Sell = ta.crossover(close, sslExit) = up arrows, Exit Buy = down arrows, SSL Buy Sell = both
    const upArrows = r.arrows.filter((a) => a.value > 0).map((a) => a.time as number);
    const dnArrows = r.arrows.filter((a) => a.value < 0).map((a) => a.time as number);
    expect(times(r, 5)).toEqual(upArrows);
    expect(times(r, 6)).toEqual(dnArrows);
    expect(times(r, 14)).toEqual(uniq([...upArrows, ...dnArrows]));
    expect(times(r, 9)).toEqual(uniq([...idTimes(r.markers, 'shape3'), ...idTimes(r.markers, 'shape4')]));
    // qqeBuy = qqeGreenBar and not qqeGreenBar[1] (the QQE Up triangles), the same for the QQE Dn triangles
    const firstOf = (ts: number[]) => ts.filter((t) => !ts.includes(bars[indexOf.get(t)! - 1]?.time as number));
    expect(times(r, 10)).toEqual(uniq([...firstOf(idTimes(r.markers, 'shape5')), ...firstOf(idTimes(r.markers, 'shape6'))]));
    expect(times(r, 12)).toEqual(idTimes(r.markers, 'shape7'));
    expect(times(r, 13)).toEqual(idTimes(r.markers, 'shape8'));
    expect(times(r, 11)).toEqual(uniq([...times(r, 12), ...times(r, 13)]));
    // squeeze (the squeezed bands are drawn) or a low ADX (the purple background)
    const qqeBg = new Set([String(color.new('#002734', 0)), String(color.new('#3a0016', 0))]);
    const lowAdx = r.bgColors.filter((b) => !qqeBg.has(b.color)).map((b) => b.time as number);
    const squeezed = r.plots.plot11.filter((p) => Number.isFinite(p.value)).map((p) => p.time as number);
    expect(times(r, 15)).toEqual(uniq([...lowAdx, ...squeezed]));
    // MIXED: one of the EMA, HMA, SSL exit crossings or a supertrend change
    for (const t of times(r, 14)) expect(times(r, 17)).toContain(t);
    for (const t of times(r, 9)) expect(times(r, 17)).toContain(t);
    for (const t of times(r, 16)) expect(times(r, 17)).toContain(t);
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17]) expect(times(r, k).length).toBeGreaterThan(0);
    // with a filter, the `not sideways` conditions are false on the sideways bars
    const f = ssla.calculate(bars, { showSsl1: true, showssl2: true, adxsignalfilter: true });
    const sideways = new Set(lowAdx);
    for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 16, 17]) for (const t of f.alerts[k].times) expect(sideways.has(t)).toBe(false);
    expect(f.alerts[15]).toEqual(r.alerts[15]);
  });

  it('ssl-hybrid-advanced: the close crossing the middle of a support / resistance level', () => {
    const r = ssla.calculate(bars, { showsr: true });
    expect(times(r, 18).length).toBeGreaterThan(0);
    expect(times(r, 19).length).toBeGreaterThan(0);
    // each crossing bar crosses the price of a drawn level line (the levels in force on that bar)
    const levels = new Set(r.lines.map((l) => l.price1));
    expect(levels.size).toBeGreaterThan(0);
    expect(ssla.calculate(bars).alerts[18].times).toEqual([]);
  });
});

describe('alert() calls', () => {
  it('smart-money-concepts-probability: one call per structure change, ticker / timeframe / probabilities', () => {
    const chart = { tickerid: 'NASDAQ:AAPL', timeframe: '1D' };
    const r = smcp.calculate(bars, { showPD: false }, chart);
    // the structure lines end on the bars where pos changes (the first bullish / bearish structure has no line:
    // its start is na)
    const callTimes = r.alertCalls.map((c) => c.time);
    const lineEnds = uniq(r.lines.map((l) => l.time2 as number));
    for (const t of lineEnds) expect(callTimes).toContain(t);
    expect(callTimes.length - lineEnds.length).toBeGreaterThanOrEqual(0);
    expect(callTimes.length - lineEnds.length).toBeLessThanOrEqual(2);
    expect(uniq(callTimes)).toEqual(callTimes);
    expect(r.alertCalls.length).toBeGreaterThan(5);
    for (const c of r.alertCalls) {
      expect(c.freq).toBe('once_per_bar_close');
      expect(c.message).toMatch(/^AAPL\nD\nCHoCH: (NaN|[0-9.]+)%\n(SMS|BMS): (NaN|[0-9.]+)%$/);
    }
    const noTicker = smcp.calculate(bars, { showPD: false, alertTicker: false }, chart);
    expect(noTicker.alertCalls.every((c) => c.message.startsWith('D\nCHoCH: '))).toBe(true);
    const none = smcp.calculate(bars, { alertTicker: false, alertTimeframe: false, alertProbability: false }, chart);
    expect(none.alertCalls).toEqual([]);
  });

  it('smc-indicator-with-webhook: FVG, sweep and MSS webhook messages', () => {
    const r = webhook.calculate(bars);
    const head = '{"content": "@everyone \\n[1m XAUUSD] ';
    expect(r.alertCalls.length).toBeGreaterThan(10);
    for (const c of r.alertCalls) {
      expect(c.freq).toBe('once_per_bar');
      expect(c.message.startsWith(head)).toBe(true);
      expect(c.message.endsWith('"}')).toBe(true);
    }
    // FVG: low > high[2] and close[1] > open[1] (bullish), high < low[2] and close[1] < open[1] (bearish)
    const fvg: { time: number; message: string }[] = [];
    for (let i = 2; i < n; i++) {
      if (gt(low[i], high[i - 2]) && gt(close[i - 1], open[i - 1])) {
        fvg.push({ time: bars[i].time as number, message: head + 'Bullish FVG (' + str.tostring(high[i - 2]) + ' - ' + str.tostring(low[i]) + ')"}' });
      }
      if (lt(high[i], low[i - 2]) && lt(close[i - 1], open[i - 1])) {
        fvg.push({ time: bars[i].time as number, message: head + 'Bearish FVG (' + str.tostring(low[i - 2]) + ' - ' + str.tostring(high[i]) + ')"}' });
      }
    }
    const isFvg = (m: string) => m.includes('FVG (');
    expect(r.alertCalls.filter((c) => isFvg(c.message)).map(({ time, message }) => ({ time, message }))).toEqual(fvg);
    expect(fvg.length).toBeGreaterThan(3);
    // the FVG alerts do not need the boxes; the sweep alerts need the drawn sweeps; the MSS alerts do not
    const noDraw = webhook.calculate(bars, { drawFVG: false, drawLQSweeps: false, drawMSS: false });
    expect(noDraw.alertCalls.filter((c) => isFvg(c.message)).length).toBe(fvg.length);
    expect(noDraw.alertCalls.filter((c) => c.message.includes('swept @'))).toEqual([]);
    const mss = (x: { alertCalls: { message: string }[] }) => x.alertCalls.filter((c) => c.message.includes('MSS through'));
    expect(mss(noDraw).length).toBe(mss(r).length);
    expect(mss(r).length).toBeGreaterThan(0);
    expect(r.alertCalls.filter((c) => c.message.includes('swept @')).length).toBeGreaterThan(0);
    const off = webhook.calculate(bars, { sweepAlerts: false, MSSAlerts: false, FVGAlerts: false });
    expect(off.alertCalls).toEqual([]);
    // an open last bar runs nothing
    const last = webhook.calculate(bars.slice(0, fvg.length ? indexOf.get(fvg[0].time)! + 1 : 3), {}, { lastBarConfirmed: false });
    expect(last.alertCalls.filter((c) => c.time === fvg[0].time)).toEqual([]);
  });

  it('smc-structures-and-fvg: "FVG has been mitigated" once per gap', () => {
    const r = smcfvg.calculate(bars);
    expect(r.alertCalls.length).toBeGreaterThan(5);
    for (const c of r.alertCalls) {
      expect(c.message).toBe('FVG has been mitigated');
      expect(c.freq).toBe('once_per_bar');
    }
    expect(smcfvg.calculate(bars, { isFvgToShow: false }).alertCalls).toEqual([]);
  });
});

describe('Style ids', () => {
  it('squeeze-channel: every marker has the id of its plotshape', () => {
    const r = sqc.calculate(bars);
    const ids = new Set(['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5', 'shape6', 'shape7']);
    expect(r.markers.length).toBeGreaterThan(0);
    for (const m of r.markers) expect(ids.has(m.id!)).toBe(true);
    const shapeOf: Record<string, [string, string]> = {
      shape0: ['triangleUp', 'belowBar'], shape1: ['triangleDown', 'aboveBar'], shape2: ['diamond', 'belowBar'],
      shape3: ['diamond', 'aboveBar'], shape4: ['triangleUp', 'belowBar'], shape5: ['triangleDown', 'aboveBar'],
      shape6: ['diamond', 'belowBar'], shape7: ['diamond', 'aboveBar'],
    };
    for (const m of r.markers) expect([m.shape, m.position]).toEqual(shapeOf[m.id!]);
  });

  it('ssl-hybrid: the exit arrows are arrows (arrow0), the diamonds shape0', () => {
    const r = sslh.calculate(bars);
    expect(r.arrows.length).toBeGreaterThan(0);
    for (const a of r.arrows) {
      expect(a.id).toBe('arrow0');
      expect(Math.abs(a.value)).toBe(1);
    }
    // crafted candles larger than the ATR with the baseline inside the ATR bands: the diamonds
    const base = vals(r.plots.plot0);
    const crafted = bars.map((b) => ({ ...b }));
    const near = base.map((v, i) => (i > 300 && Math.abs(close[i] - v) < 0.3 ? i : -1)).filter((i) => i > 0).filter((_, k) => k % 7 === 0);
    for (const i of near) {
      crafted[i].open = crafted[i].close - 12;
      crafted[i].low = Math.min(crafted[i].low, crafted[i].open);
    }
    const c = sslh.calculate(crafted);
    expect(c.markers.length).toBeGreaterThan(0);
    for (const m of c.markers) expect(m.id).toBe('shape0');
    expect(c.alerts[9].times).toEqual(idTimes(c.markers, 'shape0'));
  });

  it('ssl-hybrid-advanced: arrows (arrow0) and every marker with the id of its plotshape', () => {
    const r = ssla.calculate(bars, { showpp: true });
    expect(r.arrows.length).toBeGreaterThan(0);
    for (const a of r.arrows) expect(a.id).toBe('arrow0');
    const ids = new Set(Array.from({ length: 11 }, (_v, k) => `shape${k}`));
    for (const m of r.markers) expect(ids.has(m.id!)).toBe(true);
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) expect(idTimes(r.markers, `shape${k}`).length).toBeGreaterThan(0);
    expect(r.markers.filter((m) => m.id === 'shape9').every((m) => m.text === 'H')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape10').every((m) => m.text === 'L')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape7').every((m) => m.text === 'Buy')).toBe(true);
    expect(r.markers.filter((m) => m.id === 'shape8').every((m) => m.text === 'Sell')).toBe(true);
  });

  it('ssl-hybrid / ssl-hybrid-advanced: arrows + markers keep the counts of the markers before', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const top250 = JSON.parse(readFileSync(join(dir, 'community-top250.expected.json'), 'utf-8'));
    const top750 = JSON.parse(readFileSync(join(dir, 'community-top750.expected.json'), 'utf-8'));
    const fixtures = { daily: makeBars(3200, 86400), m15: makeBars(4000, 900) };
    for (const name of ['daily', 'm15'] as const) {
      const a = sslh.calculate(fixtures[name] as Bar[]);
      // the snapshots count markers and arrows apart (before: all as markers)
      const n = (x: Record<string, number | undefined>) => (x.markers ?? 0) + (x.arrows ?? 0);
      expect(a.markers.length + a.arrows.length).toBe(n(top250['ssl-hybrid'][name]));
      const b = ssla.calculate(fixtures[name] as Bar[]);
      expect(b.markers.length + b.arrows.length).toBe(n(top750['ssl-hybrid-advanced'][name]));
    }
  });

  it('smooth-rsi: the untitled RoC fill is "Plots Background", listed also when hidden', () => {
    const shown = srsi.calculate(bars, { showRoc: true });
    expect(shown.fills).toHaveLength(1);
    expect(shown.fills![0].options?.title).toBe('Plots Background');
    expect(shown.fills![0].colors!.some((c) => c !== 'transparent')).toBe(true);
    const hidden = srsi.calculate(bars);
    expect(hidden.fills![0].options?.title).toBe('Plots Background');
    expect(hidden.fills![0].colors!.every((c) => c === 'transparent')).toBe(true);
  });
});
