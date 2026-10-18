/**
 * Community ports, batch 38: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression, or checked against the drawings
 * that stand for the same event), the alert() calls, and the Style ids on the emitted markers.
 */
import { describe, expect, it } from 'vitest';
import { ta, taCore, str, math, heikinAshi, Series, type Bar } from 'oakscriptjs';
import * as stLadder from '../../src/community/supertrend-ladder';
import * as stMtf from '../../src/community/supertrend-mtf-heikin-ashi';
import * as stRvk from '../../src/community/supertrend-relative-volume-kernel';
import * as sdFlux from '../../src/community/supply-demand-flux-charts';
import * as srFlux from '../../src/community/support-and-resistance-flux-charts';
import * as srLog from '../../src/community/support-and-resistance-logistic-regression';
import * as srCb from '../../src/community/support-resistance-channel-breakout';
import * as srCh from '../../src/community/support-resistance-channels';
import * as srChMtf from '../../src/community/support-resistance-channels-mtf';
import * as srDyn from '../../src/community/support-resistance-dynamic';
import * as srDyn2 from '../../src/community/support-resistance-dynamic-v2';
import * as srHvb from '../../src/community/support-resistance-high-volume-boxes';
import * as srInt from '../../src/community/support-resistance-interactive';
import * as srSig from '../../src/community/support-resistance-signals-mtf';
import * as srV2 from '../../src/community/support-resistance-v2-indicator';
import * as srBr from '../../src/community/support-resistance-with-breaks-and-retests';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {"supertrend-mtf-heikin-ashi": [["alert0", "Supertrend Trend Up", "Supertrend Trend Up"], ["alert1", "Supertrend  Trend Down", "Supertrend Trend Down"], ["alert2", "Supertrend HTF Trend Up", "Supertrend HTF Trend Upl"], ["alert3", "Supertrend HTF Trend Down", "Supertrend HTF Trend Down"]], "supertrend-relative-volume-kernel": [["alert0", "Bullish Trend", "Alert Fired!"], ["alert1", "Bearish Trend", "Alert Fired!"]], "supply-demand-flux-charts": [["alert0", "Supply Zone Retest @ {{ticker}}", "Supply Zone Retest @ {{ticker}}"], ["alert1", "Demand Zone Retest @ {{ticker}}", "Demand Zone Retest @ {{ticker}}"], ["alert2", "Supply Zone Break @ {{ticker}}", "Supply Zone Break @ {{ticker}}"], ["alert3", "Demand Zone Break @ {{ticker}}", "Demand Zone Break @ {{ticker}}"]], "support-and-resistance-flux-charts": [["alert0", "New Retest", ""], ["alert1", "New Break", ""]], "support-and-resistance-logistic-regression": [["alert0", "Support Retest", "Alert Fired!"], ["alert1", "Resistance Retest", "Alert Fired!"], ["alert2", "Support Break", "Alert Fired!"], ["alert3", "Resistance Break", "Alert Fired!"]], "support-resistance-channel-breakout": [["alert0", "🔔 Breakout Resistance Channel", "Breakout above resistance Channel detected."], ["alert1", "🔔 Breakout Support Channel", "Breakout below support Channel detected."], ["alert2", "🔔 Breakout Support/Resistance Channel", "Breakout Support/Resistance Channel detected."]], "support-resistance-channels": [["alert0", "Resistance Broken", "Resistance Broken"], ["alert1", "Support Broken", "Support Broken"]], "support-resistance-channels-mtf": [["alert0", "Resistance Broken", "Resistance Broken"], ["alert1", "Support Broken", "Support Broken"]], "support-resistance-dynamic": [["alert0", "Resistance Broken", "Resistance Broken, Close Price: {{close}}, Resistance level = {{plot(\"RS_level\")}}"], ["alert1", "Support Broken", "Support Broken, Close Price: {{close}}, Support level = {{plot(\"RS_level\")}}"]], "support-resistance-dynamic-v2": [["alert0", "Resistance Broken", "Resistance Broken"], ["alert1", "Support Broken", "Support Broken"], ["alert2", "Support or Resistance Broken", "Support or Resistance Broken"]], "support-resistance-v2-indicator": [["alert0", "New S/R line", "New S/R line"]], "support-resistance-with-breaks-and-retests": [["alert0", "New Support Level", "Alert Fired!"], ["alert1", "New Resistance Level", "Alert Fired!"], ["alert2", "Support Breakout", "Alert Fired!"], ["alert3", "Resistance Breakout", "Alert Fired!"], ["alert4", "Support Retest", "Alert Fired!"], ["alert5", "Potential Support Retest", "Alert Fired!"], ["alert6", "Resistance Retest", "Alert Fired!"], ["alert7", "Potential Resistance Retest", "Alert Fired!"]]};

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
const close = bars.map((b) => b.close);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const STEP = 86400;
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
const S = (a: number[], list: Bar[] = bars) => Series.fromArray(list, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const uniq = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const prev = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);
/** ta.crossover / ta.crossunder as the library runs them: the previous values are the last pair without na */
const crossKeep = (a: number[], b: number[], up: boolean) => {
  let pa = NaN, pb = NaN;
  return a.map((v, i) => {
    const w = b[i];
    const res = up ? v > w && pa <= pb : v < w && pa >= pb;
    if (!isNaN(v) && !isNaN(w)) { pa = v; pb = w; }
    return res;
  });
};
const labelTimes = (ls: { time: unknown; text?: string; style?: string }[], text: string, style?: string) =>
  uniq(ls.filter((l) => l.text === text && (style === undefined || l.style === style)).map((l) => l.time as number));
const isSubset = (a: number[], b: number[]) => a.every((x) => b.includes(x));

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'supertrend-mtf-heikin-ashi': stMtf, 'supertrend-relative-volume-kernel': stRvk, 'supply-demand-flux-charts': sdFlux,
    'support-and-resistance-flux-charts': srFlux, 'support-and-resistance-logistic-regression': srLog,
    'support-resistance-channel-breakout': srCb, 'support-resistance-channels': srCh, 'support-resistance-channels-mtf': srChMtf,
    'support-resistance-dynamic': srDyn, 'support-resistance-dynamic-v2': srDyn2, 'support-resistance-v2-indicator': srV2,
    'support-resistance-with-breaks-and-retests': srBr,
  };
  for (const [id, m] of Object.entries(mods)) it(id, () => expect(decls(m)).toEqual(SPEC[id]));
  it('exported objects carry the declarations and the alert() flag', () => {
    expect(stMtf.SupertrendMtfHeikinAshi.alertConditions).toBe(stMtf.alertConditions);
    expect(stRvk.SupertrendRelativeVolumeKernel.alertConditions).toBe(stRvk.alertConditions);
    expect(sdFlux.SupplyDemandFluxCharts.alertConditions).toBe(sdFlux.alertConditions);
    expect(srFlux.SupportAndResistanceFluxCharts.alertConditions).toBe(srFlux.alertConditions);
    expect(srFlux.SupportAndResistanceFluxCharts.hasAlertFunction).toBe(true);
    expect(srLog.SupportAndResistanceLogisticRegression.alertConditions).toBe(srLog.alertConditions);
    expect(srCb.SupportResistanceChannelBreakout.alertConditions).toBe(srCb.alertConditions);
    expect(srCh.SupportResistanceChannels.alertConditions).toBe(srCh.alertConditions);
    expect(srChMtf.SupportResistanceChannelsMtf.alertConditions).toBe(srChMtf.alertConditions);
    expect(srDyn.SupportResistanceDynamic.alertConditions).toBe(srDyn.alertConditions);
    expect(srDyn2.SupportResistanceDynamicV2.alertConditions).toBe(srDyn2.alertConditions);
    expect(srV2.SupportResistanceV2Indicator.alertConditions).toBe(srV2.alertConditions);
    expect(srBr.SupportResistanceWithBreaksAndRetests.alertConditions).toBe(srBr.alertConditions);
    expect(srBr.SupportResistanceWithBreaksAndRetests.hasAlertFunction).toBe(true);
    expect(srInt.SupportResistanceInteractive.hasAlertFunction).toBe(true);
    expect(srSig.SupportResistanceSignalsMtf.hasAlertFunction).toBe(true);
  });
  it('supertrend-ladder is left as it is (the port is another script than the spec original)', () => {
    expect((stLadder as Record<string, unknown>).alertConditions).toBeUndefined();
  });
});

describe('alert conditions recomputed from the original expressions', () => {
  it('supertrend-mtf-heikin-ashi: trend changes of the chart and the higher timeframe line', () => {
    /** TUp / TDown / Trend of the original on high / low / close / atr arrays */
    const trendOf = (h: number[], l: number[], c: number[], atr: number[], mult: number) => {
      const out: number[] = [];
      let tUp = NaN, tDown = NaN, tr = NaN;
      for (let i = 0; i < h.length; i++) {
        const hl2 = (h[i] + l[i]) / 2;
        const up = hl2 - mult * atr[i], dn = hl2 + mult * atr[i];
        const c1 = prev(c, i), pu = tUp, pd = tDown;
        tUp = gt(c1, pu) ? Math.max(up, pu) : up;
        tDown = lt(c1, pd) ? Math.min(dn, pd) : dn;
        tr = gt(c[i], pd) ? 1 : lt(c[i], pu) ? -1 : isNaN(tr) ? 1 : tr;
        out.push(tr);
      }
      return out;
    };
    const ha = heikinAshi(bars);
    const hh = ha.map((b) => b.high), hl = ha.map((b) => b.low), hc = ha.map((b) => b.close);
    const atr = taCore.atr(7, hh, hl, hc);
    const trend = trendOf(hh, hl, hc, atr, 2);
    // HTF = the chart timeframe: the values of the Heikin Ashi bar before (high[1] with lookahead)
    const sh = (a: number[]) => a.map((_v, i) => prev(a, i));
    const trendH = trendOf(sh(hh), sh(hl), sh(hc), sh(atr), 2);
    const up = (t: number[]) => t.map((v, i) => v === 1 && prev(t, i) === -1);
    const down = (t: number[]) => t.map((v, i) => v === -1 && prev(t, i) === 1);
    const r = stMtf.calculate(bars, { mode: 'User Defined', htfUser: 'D' });
    expect(times(r, 0)).toEqual(timeAt(bars, up(trend)));
    expect(times(r, 1)).toEqual(timeAt(bars, down(trend)));
    expect(times(r, 2)).toEqual(timeAt(bars, up(trendH)));
    expect(times(r, 3)).toEqual(timeAt(bars, down(trendH)));
    for (let k = 0; k < 4; k++) expect(times(r, k).length).toBeGreaterThan(5);
    // Auto (weekly): the HTF alerts are the bars of the trend-change circles
    const auto = stMtf.calculate(bars);
    const circles = (p: { time: unknown; value: number }[]) => p.filter((x) => !isNaN(x.value)).map((x) => x.time as number);
    expect(times(auto, 2)).toEqual(circles(auto.plots.plot2 as { time: unknown; value: number }[]));
    expect(times(auto, 3)).toEqual(circles(auto.plots.plot3 as { time: unknown; value: number }[]));
    expect(times(auto, 2).length).toBeGreaterThan(0);
  });

  it('supertrend-relative-volume-kernel: closed-bar crosses of the SuperTrend', () => {
    const [stS] = ta.supertrend(bars, 3, 10);
    const st = A(stS);
    const r = stRvk.calculate(bars);
    expect(times(r, 0)).toEqual(timeAt(bars, crossKeep(close, st, true)));
    expect(times(r, 1)).toEqual(timeAt(bars, crossKeep(close, st, false)));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
    // the arrows stand for the same events
    expect(times(r, 0)).toEqual(r.markers.filter((m) => m.shape === 'arrowUp').map((m) => m.time));
    // an open last bar does not count
    const crafted = bars.slice(0, times(r, 0).length ? bars.findIndex((b) => b.time === times(r, 0)[3]) + 1 : 0);
    const open = stRvk.calculate(crafted, {}, { lastBarConfirmed: false });
    expect(open.alerts[0].triggered).toBe(false);
    expect(stRvk.calculate(crafted).alerts[0].triggered).toBe(true);
  });

  it('supply-demand-flux-charts: retests and breaks of the zones on closed bars', () => {
    const r = sdFlux.calculate(bars, { breaksEnabled: true });
    for (let k = 0; k < 4; k++) expect(times(r, k).length).toBeGreaterThan(0);
    // the labels left on the chart are on alert bars of their kind (labels of zones that are gone are deleted)
    expect(isSubset(labelTimes(r.labels, 'R', 'label_down'), times(r, 0))).toBe(true);
    expect(isSubset(labelTimes(r.labels, 'R', 'label_up'), times(r, 1))).toBe(true);
    expect(isSubset(labelTimes(r.labels, 'B', 'label_up'), times(r, 2))).toBe(true);
    expect(isSubset(labelTimes(r.labels, 'B', 'label_down'), times(r, 3))).toBe(true);
    expect(labelTimes(r.labels, 'R').length).toBeGreaterThan(0);
    // one retest per side every 6 bars at most
    for (const k of [0, 1]) times(r, k).forEach((t, j, a) => { if (j > 0) expect(t - a[j - 1]).toBeGreaterThan(5 * STEP); });
    // the alerts do not depend on the labels being shown
    expect(sdFlux.calculate(bars, { retestsEnabled: false }).alerts).toEqual(r.alerts);
    // an open last bar gives no alert
    const lastAlert = Math.max(...times(r, 0));
    const cut = bars.slice(0, bars.findIndex((b) => b.time === lastAlert) + 1);
    expect(sdFlux.calculate(cut).alerts[0].triggered).toBe(true);
    expect(sdFlux.calculate(cut, {}, { lastBarConfirmed: false }).alerts[0].triggered).toBe(false);
  });

  it('support-and-resistance-flux-charts: rendered retests and breaks, and the alert() calls', () => {
    const r = srFlux.calculate(bars, { srPivotLength: 8 });
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
    const rTimes = labelTimes(r.labels, 'R');
    const bTimes = labelTimes(r.labels, 'B');
    // a retest alert: an "R" label on the bar or the bar before; a break alert: a "B" label within one bar
    for (const t of times(r, 0)) expect(rTimes.includes(t) || rTimes.includes(t - STEP)).toBe(true);
    for (const t of times(r, 1)) expect(bTimes.some((x) => Math.abs(x - t) <= STEP)).toBe(true);
    // the alerts need the labels shown
    const off = srFlux.calculate(bars, { srPivotLength: 8, showRetests: false, showBreaks: false });
    expect(times(off, 0)).toEqual([]);
    expect(times(off, 1)).toEqual([]);
    // alert() calls on the same bars (retest call first)
    const expected = bars.flatMap((b) => [
      ...(times(r, 0).includes(b.time as number) ? [{ time: b.time, message: 'New Retests Occured.', freq: 'once_per_bar' }] : []),
      ...(times(r, 1).includes(b.time as number) ? [{ time: b.time, message: 'New Breaks Occured.', freq: 'once_per_bar' }] : []),
    ]);
    expect(r.alertCalls).toEqual(expected);
    const noRetest = srFlux.calculate(bars, { srPivotLength: 8, enableRetestAlerts: false });
    expect(noRetest.alertCalls.every((c) => c.message === 'New Breaks Occured.')).toBe(true);
    expect(noRetest.alerts).toEqual(r.alerts);
  });

  it('support-and-resistance-logistic-regression: retests and breaks of the model levels', () => {
    const model = { pivotLength: 5, probabilityThreshold: 0.5 };
    const r = srLog.calculate(bars, { ...model, showRetests: true, showBreaks: true, showPredictionLabels: false });
    expect(r.labels.length).toBeLessThan(500);
    expect(times(r, 0)).toEqual(labelTimes(r.labels, 'R', 'label_up'));
    expect(times(r, 1)).toEqual(labelTimes(r.labels, 'R', 'label_down'));
    expect(times(r, 2)).toEqual(labelTimes(r.labels, 'B', 'label_down'));
    expect(times(r, 3)).toEqual(labelTimes(r.labels, 'B', 'label_up'));
    for (let k = 0; k < 4; k++) expect(times(r, k).length).toBeGreaterThan(0);
    // a retest of a support: the low under a level and the close back above it, on each alert bar
    const lines = srLog.calculate(bars, { ...model, hideFarLines: false }).lines;
    for (const t of times(r, 0)) {
      const b = bars.find((x) => x.time === t)!;
      expect(lines.some((l) => l.price1 > b.low && l.price1 < b.close)).toBe(true);
    }
    // the alerts do not depend on the labels being shown
    expect(srLog.calculate(bars, model).alerts).toEqual(r.alerts);
  });

  it('support-resistance-channel-breakout: closes leaving the channels after the cooldown', () => {
    for (const cfg of [{}, { src: 'Close' as const, period: 20, breakoutCooldown: 3 }]) {
      const period = (cfg as { period?: number }).period ?? 50;
      const cool = (cfg as { breakoutCooldown?: number }).breakoutCooldown ?? 10;
      const useClose = (cfg as { src?: string }).src === 'Close';
      const srcR = useClose ? close : high, srcS = useClose ? close : low;
      const sh = (a: number[]) => a.map((_v, i) => prev(a, i));
      const res = A(ta.highest(S(sh(srcR)), period)), sup = A(ta.lowest(S(sh(srcS)), period));
      const resTop = res.map((v) => v * (1 + 5e-4)), supBot = sup.map((v) => v * (1 - 5e-4));
      const top: boolean[] = [], bot: boolean[] = [];
      let lastT = NaN, lastB = NaN;
      for (let i = 0; i < bars.length; i++) {
        const pt = gt(close[i], resTop[i]) && le(prev(close, i), prev(resTop, i));
        const pb = lt(close[i], supBot[i]) && ge(prev(close, i), prev(supBot, i));
        const ft = pt && (isNaN(lastT) || i - lastT >= cool), fb = pb && (isNaN(lastB) || i - lastB >= cool);
        if (ft) lastT = i;
        if (fb) lastB = i;
        top.push(ft);
        bot.push(fb);
      }
      const r = srCb.calculate(bars, cfg);
      expect(times(r, 0)).toEqual(timeAt(bars, top));
      expect(times(r, 1)).toEqual(timeAt(bars, bot));
      expect(times(r, 2)).toEqual(timeAt(bars, top.map((v, i) => v || bot[i])));
      expect(times(r, 0).length).toBeGreaterThan(3);
      expect(times(r, 1).length).toBeGreaterThan(3);
      expect(srCb.calculate(bars, { ...cfg, showBreakout: false }).alerts).toEqual(r.alerts);
    }
  });

  it('support-resistance-channels: closes out of every channel crossing a channel edge', () => {
    const list = bars.slice(0, 900);
    const r = srCh.calculate(list, { showSRBroken: true });
    expect(times(r, 0)).toEqual(r.markers.filter((m) => m.shape === 'triangleUp').map((m) => m.time));
    expect(times(r, 1)).toEqual(r.markers.filter((m) => m.shape === 'triangleDown').map((m) => m.time));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    // recomputed on sampled bars with the channels of that bar (the boxes drawn when it is the last bar)
    const sample = new Set([...times(r, 0), ...times(r, 1)].map((t) => list.findIndex((b) => b.time === t)));
    for (let i = 320; i < list.length; i += 37) sample.add(i);
    for (const i of sample) {
      const prefix = list.slice(0, i + 1);
      const chans = srCh.calculate(prefix).boxes.map((b) => [b.price1, b.price2]);
      const c = list[i].close, c1 = list[i - 1].close;
      const inside = chans.some(([hi, lo]) => c <= hi && c >= lo);
      const res = !inside && chans.some(([hi]) => c1 <= hi && c > hi);
      const sup = !inside && chans.some(([, lo]) => c1 >= lo && c < lo);
      expect([times(r, 0).includes(list[i].time as number), times(r, 1).includes(list[i].time as number)]).toEqual([res, sup]);
    }
  });

  it('support-resistance-channels-mtf: the last bar only, against the channels drawn on it', () => {
    const full = srChMtf.calculate(bars, { showsrfit: false, showtable: false });
    expect(full.alerts.every((a) => a.times.every((t) => t === bars[bars.length - 1].time))).toBe(true);
    let fired = [0, 0];
    for (let i = 500; i < bars.length; i++) {
      const prefix = bars.slice(0, i + 1);
      const r = srChMtf.calculate(prefix, { showsrfit: false, showtable: false });
      const chans = r.boxes.map((b) => [b.price1, b.price2]);
      const c = prefix[i].close, c1 = prefix[i - 1].close;
      const inside = chans.some(([hi, lo]) => le(c, hi) && ge(c, lo));
      const res = !inside && chans.some(([hi]) => le(c1, hi) && gt(c, hi));
      const sup = !inside && chans.some(([, lo]) => ge(c1, lo) && lt(c, lo));
      expect([r.alerts[0].triggered, r.alerts[1].triggered]).toEqual([res, sup]);
      expect(r.alerts[0].times).toEqual(res ? [prefix[i].time] : []);
      fired = [fired[0] + (res ? 1 : 0), fired[1] + (sup ? 1 : 0)];
    }
    expect(fired[0]).toBeGreaterThan(0);
    expect(fired[1]).toBeGreaterThan(0);
  });

  it('support-resistance-dynamic: the level crossed by the close (RS_level)', () => {
    const r = srDyn.calculate(bars);
    const rs = (r.plots.plot0 as { time: unknown; value: number }[]).map((p) => p.value);
    expect(uniq([...times(r, 0), ...times(r, 1)])).toEqual(timeAt(bars, rs.map((v) => !isNaN(v))));
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
    bars.forEach((b, i) => {
      const t = b.time as number;
      const up = times(r, 0).includes(t), dn = times(r, 1).includes(t);
      if (up && !dn) expect(close[i] > rs[i] && close[i - 1] <= rs[i]).toBe(true);
      if (dn && !up) expect(close[i] < rs[i] && close[i - 1] >= rs[i]).toBe(true);
    });
  });

  it('support-resistance-dynamic-v2: closes crossing the levels of the bar (the lines drawn when it is the last bar)', () => {
    const list = bars.slice(0, 800);
    const r = srDyn2.calculate(list);
    const over: boolean[] = [], under: boolean[] = [];
    for (let i = 0; i < list.length; i++) {
      const levels = i < 300 ? [] : srDyn2.calculate(list.slice(0, i + 1)).lines.map((l) => l.price1);
      const c = list[i].close, c1 = i > 0 ? list[i - 1].close : NaN;
      over.push(levels.some((m) => le(c1, m) && gt(c, m)));
      under.push(levels.some((m) => ge(c1, m) && lt(c, m)));
    }
    expect(times(r, 0)).toEqual(timeAt(list, over));
    expect(times(r, 1)).toEqual(timeAt(list, under));
    expect(times(r, 2)).toEqual(timeAt(list, over.map((v, i) => v || under[i])));
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
  });

  it('support-resistance-v2-indicator: a new support (low) or resistance (high) level', () => {
    const r = srV2.calculate(bars);
    const drawn = r.lines.filter((l) => l.price1 !== 0);
    expect(r.lines.length).toBeLessThan(500);
    expect(times(r, 0)).toEqual(uniq(drawn.map((l) => l.time1 as number)));
    expect(times(r, 0).length).toBeGreaterThan(3);
    for (const t of times(r, 0)) {
      const b = bars.find((x) => x.time === t)!;
      const starts = drawn.filter((l) => l.time1 === t);
      expect(starts.every((l) => l.price1 === b.low || l.price1 === b.high)).toBe(true);
    }
  });

  it('support-resistance-with-breaks-and-retests: levels, breakouts, retests and the alert() calls', () => {
    const r = srBr.calculate(bars);
    const fix = (a: number[]) => { let v = NaN; return a.map((x) => (isNaN(x) ? v : (v = x))); };
    const pl = fix(A(ta.pivotlow(S(low), 20, 20))), ph = fix(A(ta.pivothigh(S(high), 20, 20)));
    const changed = (a: number[]) => a.map((v, i) => { const d = v - prev(a, i); return !isNaN(d) && d !== 0; });
    expect(times(r, 0)).toEqual(timeAt(bars, changed(pl)));
    expect(times(r, 1)).toEqual(timeAt(bars, changed(ph)));
    // breakout alerts: ta.barssince(na(sBreak)) == 1 on the bar of the "Break" label of the side (a new level on
    // the same bar resets the break)
    const breakS = labelTimes(r.labels, 'Break', 'label_upper_right');
    const breakR = labelTimes(r.labels, 'Break', 'label_lower_right');
    expect(isSubset(times(r, 2), breakS)).toBe(true);
    expect(isSubset(times(r, 3), breakR)).toBe(true);
    expect(times(r, 2).length).toBeGreaterThan(breakS.length / 2);
    expect(times(r, 3).length).toBeGreaterThan(breakR.length / 2);
    // retests: one "Retest" label per alert, 1 to "Retest Detection Limiter" bars before it
    expect(r.labels.length).toBeLessThan(500);
    const reS = r.labels.filter((l) => l.text === 'Retest' && l.style === 'label_lower_left').map((l) => l.time as number);
    const reR = r.labels.filter((l) => l.text === 'Retest' && l.style === 'label_upper_left').map((l) => l.time as number);
    expect(times(r, 4).length).toBe(reS.length);
    expect(times(r, 6).length).toBe(reR.length);
    expect(times(r, 4).length + times(r, 6).length).toBeGreaterThan(0);
    for (const t of times(r, 4)) expect(reS.some((x) => t - x >= STEP && t - x <= 2 * STEP)).toBe(true);
    // a retest follows a potential retest
    expect(times(r, 5).length).toBeGreaterThanOrEqual(times(r, 4).length);
    expect(times(r, 7).length).toBeGreaterThanOrEqual(times(r, 6).length);
    // retests off: no retest conditions
    const off = srBr.calculate(bars, { retest: false });
    for (const k of [4, 5, 6, 7]) expect(times(off, k)).toEqual([]);
    expect(off.alerts.slice(0, 4)).toEqual(r.alerts.slice(0, 4));
    // AllAlerts(): one call per true condition, in the original's order, with the title as message
    const expected = bars.flatMap((b) => r.alerts.filter((a) => a.times.includes(b.time as number))
      .map((a) => ({ time: b.time, message: a.title, freq: 'once_per_bar' })));
    expect(r.alertCalls).toEqual(expected);
  });
});

describe('alert() calls', () => {
  it('support-resistance-interactive: zone broken / price in zone on the last bar', () => {
    const list = bars.slice(0, 600);
    const last = list.length - 1;
    // a rising last bar
    let k = last;
    while (!(list[k].close > list[k - 1].close + 0.5)) k--;
    const cut = list.slice(0, k + 1);
    const c = cut[k].close, c1 = cut[k - 1].close;
    const hh = Math.max(...cut.slice(-300).map((b) => b.high)), ll = Math.min(...cut.slice(-300).map((b) => b.low));
    const thold = (hh - ll) * 1 / 100;
    const mid = (c + c1) / 2;
    const tick = (v: number) => str.tostring(math.round_to_mintick(v, 0.01) as number);
    const r = srInt.calculate(cut, { srnum: 3, sr1: mid - thold, sr2: c, sr3: mid + thold + 1000 });
    expect(r.alertCalls).toEqual([
      { time: cut[k].time, freq: 'once_per_bar', message: 'Resistance Broken, Close :' + str.tostring(c) + ' Resistance :' + tick(mid - thold + thold) },
      {
        time: cut[k].time, freq: 'once_per_bar_close',
        message: 'Price in SR Zone, Close :' + str.tostring(c) + ' Upper Band :' + str.tostring((math.round_to_mintick(c, 0.01) as number) + thold)
          + ' Lower Band :' + str.tostring((math.round_to_mintick(c, 0.01) as number) - thold),
      },
    ]);
    // a falling bar breaks a support
    let j = last;
    while (!(list[j].close < list[j - 1].close - 0.5)) j--;
    const cut2 = list.slice(0, j + 1);
    const m2 = (cut2[j].close + cut2[j - 1].close) / 2;
    const hh2 = Math.max(...cut2.slice(-300).map((b) => b.high)), ll2 = Math.min(...cut2.slice(-300).map((b) => b.low));
    const th2 = (hh2 - ll2) / 100;
    const r2 = srInt.calculate(cut2, { srnum: 1, sr1: m2 + th2, supporsrbrknfreq: 'once_per_bar_close' });
    expect(r2.alertCalls).toEqual([
      { time: cut2[j].time, freq: 'once_per_bar_close', message: 'Support Broken, Close :' + str.tostring(cut2[j].close) + ' Support :' + tick(m2 + th2 - th2) },
    ]);
    expect(srInt.calculate(cut, { srnum: 3, sr1: mid - thold, sr2: c, enablesrbroken: false, enablepiz: false }).alertCalls).toEqual([]);
    // srnum hides the levels after it
    expect(srInt.calculate(cut, { srnum: 1, sr1: c + 1000, sr2: c }).alertCalls).toEqual([]);
  });

  it('support-resistance-signals-mtf: messages, frequencies and the bars of the events', () => {
    const chart = { tickerid: 'NASDAQ:AAPL', mintick: 0.01 };
    const r = srSig.calculate(bars, { swSH: 'Small' }, chart);
    const tail = (i: number) => '\nAAPL price (' + str.tostring(bars[i].close, 'mintick', 0.01) + '), timeframe D';
    const idx = (t: number) => bars.findIndex((b) => b.time === t);
    for (const c of r.alertCalls) {
      const i = idx(c.time);
      expect(c.message.endsWith(tail(i))).toBe(true);
      expect(c.freq).toBe(c.message.startsWith('Test of') ? 'once_per_bar_close' : 'once_per_bar');
    }
    const at = (text: string) => r.alertCalls.filter((c) => c.message.startsWith(text)).map((c) => c.time);
    // volume spike: nz(volume) > sma(nz(volume), 17) * 4.669
    const vol = bars.map((b) => b.volume ?? 0);
    const vSMA = A(ta.sma(S(vol), 17));
    expect(at('High trading activity (Volume SPIKE) detected\n')).toEqual(timeAt(bars, vol.map((v, i) => gt(v, vSMA[i] * 4.669))));
    expect(at('High trading activity').length).toBeGreaterThan(3);
    // rejections: long lower / upper wick on high volume on the bar before
    const atr = A(ta.atr(bars, 17));
    const isHV = vol.map((v, i) => ge(v, 1.618 * vSMA[i]));
    const lls = bars.map((b, i) => ge(Math.abs(b.low - Math.min(b.open, b.close)), 1.618 * atr[i]) && isHV[i]);
    const lus = bars.map((b, i) => ge(Math.abs(b.high - Math.max(b.open, b.close)), 1.618 * atr[i]) && isHV[i]);
    expect(at('Rejection of lower prices detected\n')).toEqual(timeAt(bars, lls.map((_v, i) => i > 0 && lls[i - 1])));
    const higher = at('Rejection of higher prices detected\n');
    const higherAll = timeAt(bars, lus.map((_v, i) => i > 0 && lus[i - 1]));
    expect(isSubset(higher, higherAll)).toBe(true);
    expect(higherAll.filter((t) => t > (bars[200].time as number))).toEqual(higher.filter((t) => t > (bars[200].time as number)));
    // swings: one call on each pivot bar of 15 bars
    const ph = A(ta.pivothigh(S(high), 15, 15)), pl = A(ta.pivotlow(S(low), 15, 15));
    const swH = r.alertCalls.filter((c) => /^New (Higher|Lower) High/.test(c.message) || c.message.startsWith('New  formed')).length;
    expect(at('New ').length).toBe(ph.filter((v) => !isNaN(v)).length + pl.filter((v) => !isNaN(v)).length);
    expect(swH).toBeGreaterThan(0);
    // breakouts / tests / retests: the label of the event on the bar before
    const labelAt = (text: string) => r.labels.filter((l) => l.text === text).map((l) => (l.time as number) + STEP);
    expect(r.labels.length).toBeLessThan(500);
    expect(at('Bullish breakout detected')).toEqual(labelAt('▲\n\nB'));
    expect(at('Bearish breakout detected')).toEqual(labelAt('B\n\n▼'));
    expect(uniq([...at('Test of resistance'), ...at('Test of support')])).toEqual(uniq(labelAt('T')));
    expect(uniq([...at('Re-test of resistance'), ...at('Re-test of support')])).toEqual(uniq(labelAt('R')));
    expect(at('Bullish breakout').length + at('Bearish breakout').length).toBeGreaterThan(3);
    expect(at('Test of').length).toBeGreaterThan(3);
    // size 'None' turns a kind of call off; no swing calls by default
    const none = srSig.calculate(bars, { srBS: 'None', srTS: 'None', srRS: 'None', srPS: 'None' }, chart);
    expect(none.alertCalls.every((c) => c.message.startsWith('High trading activity'))).toBe(true);
    // without a chart context the ticker is empty
    expect(srSig.calculate(bars).alertCalls[0].message).toContain('\n price (');
  });
});

describe('Style ids', () => {
  it('support-resistance-high-volume-boxes: the four plotchar diamonds', () => {
    const spec: Record<string, [string, string]> = {
      char0: ['aboveBar', '#e92929'], char1: ['belowBar', '#20ca26'], char2: ['belowBar', '#20ca26'], char3: ['aboveBar', '#e92929'],
    };
    for (const list of [bars, walk(1500, 5)]) {
      const r = srHvb.calculate(list, { lookbackPeriod: 5 });
      expect(r.markers.length).toBeGreaterThan(0);
      for (const m of r.markers) {
        expect(Object.keys(spec)).toContain(m.id);
        expect([m.position, m.textColor]).toEqual(spec[m.id as string]);
      }
    }
    const ids = new Set([bars, walk(1500, 5)].flatMap((list) => srHvb.calculate(list, { lookbackPeriod: 5 }).markers.map((m) => m.id)));
    expect(ids.has('char0') && ids.has('char1')).toBe(true);
  });
});
