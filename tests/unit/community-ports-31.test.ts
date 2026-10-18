/**
 * Community ports, batch 31: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), and the Style ids on the
 * emitted markers / background colours / arrows, the plotcandle output of Renko Chart.
 */
import { describe, expect, it } from 'vitest';
import { color, type Bar } from 'oakscriptjs';
import * as rwt from '../../src/community/ranges-with-targets';
import * as rbt from '../../src/community/rbt-strategy';
import * as rcyc from '../../src/community/rcyc-bullish-bearish-indicator';
import * as r401k from '../../src/community/readyfor401ks-just-tell-me-when';
import * as ribbon from '../../src/community/redk-magic-ribbon';
import * as mobars from '../../src/community/redk-momentum-bars';
import * as rss from '../../src/community/redk-rss-wma';
import * as tpx from '../../src/community/redk-tpx';
import * as vader from '../../src/community/redk-vader';
import * as xflex from '../../src/community/reflex-trendflex';
import * as rco from '../../src/community/regression-channel-oscillator';
import * as rsh from '../../src/community/relative-strength-heatmap';
import * as libertus from '../../src/community/relative-strength-index-divergences-libertus';
import * as rvo from '../../src/community/relative-valuation-oscillator';
import * as rco2 from '../../src/community/renko-candles-overlay';
import * as renko from '../../src/community/renko-chart';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'ranges-with-targets': [['alert0', 'BUY', 'Alert Fired!'], ['alert1', 'Sell', 'Alert Fired!']],
  'rbt-strategy': [['alert0', 'Bullish Signal', 'Bullish > Bearish Setup'], ['alert1', 'Bearish Signal', 'Bearish > Bullish Setup']],
  'rcyc-bullish-bearish-indicator': [
    ['alert0', 'Red Candle Alert', 'Red Candle Signal: J Value has crossed above the selected midline.'],
    ['alert1', 'Yellow Candle Alert', 'Yellow Candle Signal: J Value has crossed below the selected midline.'],
  ],
  'readyfor401ks-just-tell-me-when': [
    ['alert0', 'Buy Long or Sell Short', 'In Long or Out Short.'],
    ['alert1', 'Sell Long or Buy Short', 'Out Long or In Short.'],
  ],
  'redk-magic-ribbon': [
    ['alert0', 'Fast Line Swings Up', 'MagicRibbon - Fast Line Swing Up Detected!'],
    ['alert1', 'Fast Line Swings Down', 'MagicRibbon - Fast Line Swing Down Detected!'],
    ['alert2', 'Slow Line Swings Up', 'MagicRibbon - Slow Line Swing Up Detected!'],
    ['alert3', 'Slow Line Swings Down', 'MagicRibbon - Slow Line Swing Down Detected!'],
  ],
  'redk-momentum-bars': [
    ['alert0', '.   MoBars Crossing 0 Up', 'MoBars Up - Bullish Mode Detected!'],
    ['alert1', '..  MoBars Crossing 0 Down', 'MoBars Down - Bearish Mode Detected!'],
    ['alert2', '... MoBars Crossing 0', 'Mobars Swing - Possible Reversal Detected!'],
  ],
  'redk-rss-wma': [
    ['alert0', 'RSS_WMA Swing Up', 'RSS_WMA Swing Up Detected!'],
    ['alert1', 'RSS_WMA Swing Down', 'RSS_WMA Swing Down Detected!'],
    ['alert2', 'RSS_WMA Swing', 'RSS_WMA Up/Down Swing Detected!'],
  ],
  'redk-tpx': [
    ['alert0', 'TPX Bulls in Control', 'TPX Bull Pressure >= Control Level'],
    ['alert1', 'TPX Bears in Control', 'TPX Bear Pressure >= Control Level'],
    ['alert2', 'Net Pressure Swing', 'Net Pressure Swing Detected!'],
  ],
  'redk-vader': [
    ['alert0', '.   VADER Crossing 0 Up', 'VADER Up - Buying Energy Detected!'],
    ['alert1', '..  VADER Crossing 0 Down', 'VADER Down - Selling Energy Detected!'],
    ['alert2', '... VADER Crossing 0', 'VADER Swing - Possible Reversal'],
    ['alert3', '*  VADER Speeding Up', 'VADER Speeding Up!'],
    ['alert4', '** VADER Slowing Down', 'VADER Slowing Down!'],
  ],
  'reflex-trendflex': [
    ['alert0', 'Reflex & Trendflex: Above +Threshold', 'xFlex: oscillator crossed above +threshold'],
    ['alert1', 'Reflex & Trendflex: Below -Threshold', 'xFlex: oscillator crossed below -threshold'],
    ['alert2', 'Reflex & Trendflex: Reflex Above Zero', 'xFlex: Reflex crossed above zero'],
    ['alert3', 'Reflex & Trendflex: Reflex Below Zero', 'xFlex: Reflex crossed below zero'],
    ['alert4', 'Reflex & Trendflex: Trendflex Above Zero', 'xFlex: Trendflex crossed above zero'],
    ['alert5', 'Reflex & Trendflex: Trendflex Below Zero', 'xFlex: Trendflex crossed below zero'],
  ],
  'regression-channel-oscillator': [
    ['alert0', 'Buy (Oversold)', 'Oscillator crossed above oversold.'],
    ['alert1', 'Sell (Overbought)', 'Oscillator crossed below overbought.'],
    ['alert2', 'Signal MA Cross Above 0', 'Signal MA crossed ABOVE zero line.'],
    ['alert3', 'Signal MA Cross Below 0', 'Signal MA crossed BELOW zero line.'],
    ['alert4', 'Signal MA Cross Above MA OS', 'Signal MA crossed ABOVE its oversold threshold.'],
    ['alert5', 'Signal MA Cross Below MA OB', 'Signal MA crossed BELOW its overbought threshold.'],
  ],
  'relative-strength-heatmap': [
    ['alert0', 'RSI Heatmap Strong Bull', 'RSI heatmap strongly overbought cluster {{exchange}}:{{ticker}}'],
    ['alert1', 'RSI Heatmap Strong Bear', 'RSI heatmap strongly oversold cluster {{exchange}}:{{ticker}}'],
  ],
  'relative-strength-index-divergences-libertus': [
    ['alert0', 'Bear div', 'Bear div'], ['alert1', 'Bull div', 'Bull div'],
    ['alert2', 'Pivot high', 'Pivot high'], ['alert3', 'Pivot low', 'Pivot low'],
  ],
  'relative-valuation-oscillator': [
    ['alert0', 'Overvalued Threshold Crossed', 'Relative Valuation Oscillator: OVERVALUED threshold crossed on {{exchange}}:{{ticker}} - {{interval}}. Price may be statistically stretched to the upside.'],
    ['alert1', 'Undervalued Threshold Crossed', 'Relative Valuation Oscillator: UNDERVALUED threshold crossed on {{exchange}}:{{ticker}} - {{interval}}. Price may be statistically stretched to the downside.'],
    ['alert2', 'Crossed Above Fair Value (0)', 'Relative Valuation Oscillator: Crossed ABOVE Fair Value (0) on {{exchange}}:{{ticker}} - {{interval}}. Transitioning to overvaluation zone.'],
    ['alert3', 'Crossed Below Fair Value (0)', 'Relative Valuation Oscillator: Crossed BELOW Fair Value (0) on {{exchange}}:{{ticker}} - {{interval}}. Transitioning to undervaluation zone.'],
    ['alert4', 'Any Extreme Valuation', 'Relative Valuation Oscillator: Extreme valuation detected! Check chart {{exchange}}:{{ticker}} - {{interval}}'],
  ],
  'renko-candles-overlay': [['alert0', 'Trend is UP', 'Trend is UP'], ['alert1', 'Trend is DOWN', 'Trend is DOWN']],
  'renko-chart': [
    ['alert0', 'Breakout Uptrend started', 'Breakout Uptrend started'],
    ['alert1', 'Breakout Downtrend started', 'Breakout Downtrend started'],
    ['alert2', 'Main Trend is Up', 'Main Trend is Up'], ['alert3', 'Main Trend is Down', 'Main Trend is Down'],
    ['alert4', 'Renko Trend is Up', 'Renko Trend is Up'], ['alert5', 'Renko Trend is Down', 'Renko Trend is Down'],
  ],
};

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of bars with a random volume */
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
const open = bars.map((b) => b.open);
const high = bars.map((b) => b.high);
const low = bars.map((b) => b.low);
const timeAt = (list: Bar[], flags: boolean[]) => list.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
const or = (a: boolean[], b: boolean[]) => a.map((f, i) => f || b[i]);

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
/** ta.rma with an SMA seed of the first `len` values */
function rma(src: number[], len: number): number[] {
  const out: number[] = [];
  let prev = NaN;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < src.length; i++) {
    if (isNaN(prev)) {
      if (!isNaN(src[i])) { sum += src[i]; count++; }
      prev = count === len ? sum / len : NaN;
    } else {
      prev = (prev * (len - 1) + src[i]) / len;
    }
    out.push(prev);
  }
  return out;
}
const win = (src: number[], i: number, len: number) => (i < len - 1 ? null : src.slice(i - len + 1, i + 1));
const sma = (src: number[], len: number) => src.map((_, i) => {
  const w = win(src, i, len);
  return w && w.every((v) => !isNaN(v)) ? w.reduce((a, b) => a + b, 0) / len : NaN;
});
const wma = (src: number[], len: number) => src.map((_, i) => {
  const w = win(src, i, len);
  if (!w || w.some((v) => isNaN(v))) return NaN;
  let s = 0;
  for (let k = 0; k < len; k++) s += w[k] * (k + 1);
  return s / ((len * (len + 1)) / 2);
});
const highest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.max(...src.slice(i - len + 1, i + 1))));
const lowest = (src: number[], len: number) => src.map((_, i) => (i < len - 1 ? NaN : Math.min(...src.slice(i - len + 1, i + 1))));

describe('declarations equal the spec', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'ranges-with-targets': rwt, 'rbt-strategy': rbt, 'rcyc-bullish-bearish-indicator': rcyc,
    'readyfor401ks-just-tell-me-when': r401k, 'redk-magic-ribbon': ribbon, 'redk-momentum-bars': mobars,
    'redk-rss-wma': rss, 'redk-tpx': tpx, 'redk-vader': vader, 'reflex-trendflex': xflex,
    'regression-channel-oscillator': rco, 'relative-strength-heatmap': rsh,
    'relative-strength-index-divergences-libertus': libertus, 'relative-valuation-oscillator': rvo,
    'renko-candles-overlay': rco2, 'renko-chart': renko,
  };
  for (const [id, m] of Object.entries(mods)) it(id, () => expect(decls(m)).toEqual(SPEC[id]));
  it('exported objects carry the declarations', () => {
    expect(rwt.RangesWithTargets.alertConditions).toBe(rwt.alertConditions);
    expect(rbt.RbtStrategy.alertConditions).toBe(rbt.alertConditions);
    expect(rcyc.RcycBullishBearishIndicator.alertConditions).toBe(rcyc.alertConditions);
    expect(r401k.Readyfor401ksJustTellMeWhen.alertConditions).toBe(r401k.alertConditions);
    expect(ribbon.RedKMagicRibbon.alertConditions).toBe(ribbon.alertConditions);
    expect(mobars.RedKMomentumBars.alertConditions).toBe(mobars.alertConditions);
    expect(rss.RedKRSSWMA.alertConditions).toBe(rss.alertConditions);
    expect(tpx.RedKTPX.alertConditions).toBe(tpx.alertConditions);
    expect(vader.RedKVADER.alertConditions).toBe(vader.alertConditions);
    expect(xflex.ReflexTrendflex.alertConditions).toBe(xflex.alertConditions);
    expect(rco.RegressionChannelOscillator.alertConditions).toBe(rco.alertConditions);
    expect(rsh.RelativeStrengthHeatmap.alertConditions).toBe(rsh.alertConditions);
    expect(libertus.RelativeStrengthIndexDivergencesLibertus.alertConditions).toBe(libertus.alertConditions);
    expect(rvo.RelativeValuationOscillator.alertConditions).toBe(rvo.alertConditions);
    expect(rco2.RenkoCandlesOverlay.alertConditions).toBe(rco2.alertConditions);
    expect(renko.RenkoChart.alertConditions).toBe(renko.alertConditions);
  });
});

describe('alert conditions recomputed from the original expressions', () => {
  it('ranges-with-targets: a BUY / Sell alert on each bar that opens a trade (its dashed width-2 line)', () => {
    const hourly = walk(1500, 11, 3600);
    const r = rwt.calculate(hourly);
    const opens = r.lines.filter((l) => l.width === 2);
    expect(opens.length).toBeLessThan(500);
    const longs = opens.filter((l) => l.price2 > l.price1).map((l) => l.time1);
    const shorts = opens.filter((l) => l.price2 < l.price1).map((l) => l.time1);
    expect(times(r, 0)).toEqual(longs);
    expect(times(r, 1)).toEqual(shorts);
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
    // the trades open after bar 100 only
    const t100 = hourly[100].time as number;
    expect([...times(r, 0), ...times(r, 1)].every((t) => t > t100)).toBe(true);
  });

  it('rbt-strategy: reversal bar after the filters', () => {
    const r = rbt.calculate(bars);
    const dir = (i: number) => (i < 0 ? 0 : gt(close[i], open[i]) ? 1 : lt(close[i], open[i]) ? -1 : 0);
    const bull: boolean[] = [];
    const bear: boolean[] = [];
    for (let i = 0; i < n; i++) {
      if (i < 1) { bull.push(false); bear.push(false); continue; }
      const pO = open[i - 1], pC = close[i - 1];
      const pBody = Math.abs(pC - pO);
      const pUp = high[i - 1] - Math.max(pO, pC);
      const pLo = Math.min(pO, pC) - low[i - 1];
      const pDoji = ge(pUp + pLo, 2 * pBody);
      const body = Math.abs(close[i] - open[i]);
      const isBull = gt(close[i], open[i]);
      const isBear = lt(close[i], open[i]);
      let sum = 0;
      for (let k = 1; k <= 5; k++) sum += i - k >= 0 ? high[i - k] - low[i - k] : NaN;
      const bigEnough = ge(high[i] - low[i], sum / 5);
      const pDir = dir(i - 1);
      const same = pDir !== 0 && dir(i - 2) === pDir && dir(i - 3) === pDir;
      const pct = gt(body, 0.3 * pBody) && lt(body, 3 * pBody);
      bull.push(isBull && pDir === -1 && pct && !pDoji && !gt(body, pBody + pUp) && same && bigEnough);
      bear.push(isBear && pDir === 1 && pct && !pDoji && !gt(body, pBody + pLo) && same && bigEnough);
    }
    expect(times(r, 0)).toEqual(timeAt(bars, bull));
    expect(times(r, 1)).toEqual(timeAt(bars, bear));
    expect(times(r, 0).length).toBeGreaterThan(0);
    expect(times(r, 1).length).toBeGreaterThan(0);
  });

  it('rcyc-bullish-bearish-indicator: J crosses of the midline', () => {
    const r = rcyc.calculate(bars);
    const hi = highest(high, 9);
    const lo = lowest(low, 9);
    const k = close.map((c, i) => {
      const range = hi[i] - lo[i];
      return !isNaN(range) && Math.abs(range) > EPS ? (100 * (c - lo[i])) / range : 50;
    });
    const pK = rma(k, 3);
    const pD = rma(pK, 3);
    const j = pK.map((v, i) => 3 * v - 2 * pD[i]);
    expect(times(r, 0)).toEqual(timeAt(bars, xover(j, 50)));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(j, 50)));
    expect(times(r, 0).length).toBeGreaterThan(3);
    // the red / yellow candles are the cross bars
    expect(r.plotCandles.candles.filter((c) => c.color === color.red).map((c) => c.time)).toEqual(times(r, 0));
    expect(r.plotCandles.candles.filter((c) => c.color === color.yellow).map((c) => c.time)).toEqual(times(r, 1));
  });

  it('readyfor401ks-just-tell-me-when: close crosses of the exit SSL (JMA 8 of high / low)', () => {
    const r = r401k.calculate(bars);
    const jma = (src: number[], length: number) => {
      const phaseRatio = 20 / 100 + 1.5;
      const beta = (0.45 * (length - 1)) / (0.45 * (length - 1) + 2);
      const alpha = Math.pow(beta, 2);
      let e0 = 0, e1 = 0, e2 = 0, j = 0;
      return src.map((s) => {
        e0 = (1 - alpha) * s + alpha * e0;
        e1 = (s - e0) * (1 - beta) + beta * e1;
        e2 = (e0 + phaseRatio * e1 - j) * Math.pow(1 - alpha, 2) + Math.pow(alpha, 2) * e2;
        j = e2 + j;
        return j;
      });
    };
    const eh = jma(high, 8);
    const el = jma(low, 8);
    let hlv = 0;
    const exit = close.map((c, i) => {
      hlv = c > eh[i] ? 1 : c < el[i] ? -1 : hlv;
      return hlv < 0 ? eh[i] : el[i];
    });
    const up = xover(close, exit);
    const dn = xover(exit, close);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
    expect(times(r, 0).length).toBeGreaterThan(3);
    // the exit arrows (plotarrow 'Exit Arrows') are on the same bars, value +1 / -1
    expect(r.arrows.filter((a) => a.value === 1).map((a) => a.time)).toEqual(times(r, 0));
    expect(r.arrows.filter((a) => a.value === -1).map((a) => a.time)).toEqual(times(r, 1));
  });

  it('redk-magic-ribbon: swings of the fast and the slow line', () => {
    const r = ribbon.calculate(bars);
    const f = vals(r.plots.plot0);
    const s = vals(r.plots.plot1);
    const swing = (x: number[], sign: number) => {
      const m = x.map((v, i) => i > 0 && (sign > 0 ? gt(v, x[i - 1]) : lt(v, x[i - 1])));
      return m.map((v, i) => v && !(i > 0 && m[i - 1]));
    };
    expect(times(r, 0)).toEqual(timeAt(bars, swing(f, 1)));
    expect(times(r, 1)).toEqual(timeAt(bars, swing(f, -1)));
    expect(times(r, 2)).toEqual(timeAt(bars, swing(s, 1)));
    expect(times(r, 3)).toEqual(timeAt(bars, swing(s, -1)));
    for (let k = 0; k < 4; k++) expect(times(r, k).length).toBeGreaterThan(5);
  });

  it('redk-momentum-bars: bar high over 0, bar low under 0', () => {
    const r = mobars.calculate(bars);
    const fil = sma(close, 50);
    const fastM = sma(close, 10).map((v, i) => v - fil[i]);
    const slowM = sma(close, 20).map((v, i) => v - fil[i]);
    const relM = wma(slowM, 3);
    const h = fastM.map((c, i) => Math.max(relM[i], c));
    const l = fastM.map((c, i) => Math.min(relM[i], c));
    const up = xover(h, 0);
    const dn = xunder(l, 0);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
    expect(times(r, 2)).toEqual(timeAt(bars, or(up, dn)));
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
  });

  it('redk-rss-wma: swings of the drawn line', () => {
    const r = rss.calculate(bars);
    const ll = vals(r.plots.plot0);
    const up = ll.map((v, i) => i > 0 && v > ll[i - 1]);
    const su = up.map((u, i) => u && !(i > 0 && up[i - 1]));
    const sd = up.map((u, i) => i > 0 && up[i - 1] && !u);
    expect(times(r, 0)).toEqual(timeAt(bars, su));
    expect(times(r, 1)).toEqual(timeAt(bars, sd));
    expect(times(r, 2)).toEqual(timeAt(bars, or(su, sd)));
    expect(times(r, 0).length).toBeGreaterThan(5);
  });

  it('redk-tpx: pressures at the control level and TPX crossing 0', () => {
    const r = tpx.calculate(bars);
    const h2 = highest(high, 2);
    const l2 = lowest(low, 2);
    const bulls: number[] = [];
    const bears: number[] = [];
    for (let i = 0; i < n; i++) {
      const R = h2[i] - l2[i];
      const ch = i > 0 ? high[i] - high[i - 1] : NaN;
      const cl = i > 0 ? low[i] - low[i - 1] : NaN;
      const bu = Math.min((Math.max(ch, 0) + Math.max(cl, 0)) / R, 1) * 100;
      const be = Math.max((Math.min(ch, 0) + Math.min(cl, 0)) / R, -1) * -100;
      bulls.push(isNaN(bu) || !isFinite(bu) || !(R > 0) ? 0 : bu);
      bears.push(isNaN(be) || !isFinite(be) || !(R > 0) ? 0 : be);
    }
    const ab = wma(bulls, 7);
    const ae = wma(bears, 7);
    const t = wma(ab.map((v, i) => v - ae[i]), 3);
    expect(times(r, 0)).toEqual(timeAt(bars, ab.map((v) => v >= 30)));
    expect(times(r, 1)).toEqual(timeAt(bars, ae.map((v) => v >= 30)));
    expect(times(r, 2)).toEqual(timeAt(bars, or(xover(t, 0), xunder(t, 0))));
    for (let k = 0; k < 3; k++) expect(times(r, k).length).toBeGreaterThan(3);
  });

  it('redk-vader: signal crossing 0 and the sentiment line', () => {
    const r = vader.calculate(bars, { showSenti: true });
    // the original's signal is known from bar 19 + 9 + 4 + 2, its sentiment from bar 19 + 9 + 19 + 2
    const sig = vals(r.plots.plot0).map((v, i) => (i < 34 ? NaN : v));
    const sen = vals(r.plots.plot3).map((v, i) => (i < 49 ? NaN : v));
    const up = xover(sig, 0);
    const dn = xunder(sig, 0);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
    expect(times(r, 2)).toEqual(timeAt(bars, or(up, dn)));
    expect(times(r, 3)).toEqual(timeAt(bars, xover(sig, sen)));
    expect(times(r, 4)).toEqual(timeAt(bars, xunder(sig, sen)));
    for (let k = 0; k < 5; k++) expect(times(r, k).length).toBeGreaterThan(3);
    // the alerts do not depend on the sentiment being shown
    expect(vader.calculate(bars).alerts).toEqual(r.alerts);
  });

  it('reflex-trendflex: threshold and zero crosses', () => {
    const r = xflex.calculate(bars);
    const rf = vals(r.plots.plot0);
    const tf = vals(r.plots.plot1);
    const up = vals(r.plots.plot2);
    const dn = vals(r.plots.plot3);
    expect(times(r, 0)).toEqual(timeAt(bars, xover(rf, up)));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(rf, dn)));
    expect(times(r, 2)).toEqual(timeAt(bars, xover(rf, 0)));
    expect(times(r, 3)).toEqual(timeAt(bars, xunder(rf, 0)));
    expect(times(r, 4)).toEqual(timeAt(bars, xover(tf, 0)));
    expect(times(r, 5)).toEqual(timeAt(bars, xunder(tf, 0)));
    for (let k = 0; k < 6; k++) expect(times(r, k).length).toBeGreaterThan(0);
    // without the threshold its two conditions are false; on Trendflex they follow it
    const off = xflex.calculate(bars, { showThreshold: false });
    expect(times(off, 0)).toEqual([]);
    expect(times(off, 1)).toEqual([]);
    const onT = xflex.calculate(bars, { thresholdSource: 'Trendflex' });
    expect(times(onT, 0)).toEqual(timeAt(bars, xover(tf, vals(onT.plots.plot2))));
  });

  it('regression-channel-oscillator: level and signal crosses', () => {
    const r = rco.calculate(bars);
    const osc = vals(r.plots.plot2);
    const sig = vals(r.plots.plot4);
    expect(times(r, 0)).toEqual(timeAt(bars, xover(osc, -50)));
    expect(times(r, 1)).toEqual(timeAt(bars, xunder(osc, 50)));
    expect(times(r, 2)).toEqual(timeAt(bars, xover(sig, 0)));
    expect(times(r, 3)).toEqual(timeAt(bars, xunder(sig, 0)));
    expect(times(r, 4)).toEqual(timeAt(bars, xover(sig, -25)));
    expect(times(r, 5)).toEqual(timeAt(bars, xunder(sig, 25)));
    for (let k = 0; k < 6; k++) expect(times(r, k).length).toBeGreaterThan(0);
  });

  it('relative-strength-heatmap: 10 or more RSIs above 70 / below 30', () => {
    const r = rsh.calculate(bars);
    const bull = vals(r.plots.plot20);
    const bear = vals(r.plots.plot21);
    expect(times(r, 0)).toEqual(timeAt(bars, bull.map((c) => c >= 10)));
    expect(times(r, 1)).toEqual(timeAt(bars, bear.map((c) => c >= 10)));
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
  });

  it('relative-strength-index-divergences-libertus: divergences and pivots', () => {
    const r = libertus.calculate(bars);
    const rsi = vals(r.plots.plot0);
    const first = rsi.findIndex((v) => !isNaN(v));
    const isTop = (i: number, lowest_: boolean) => {
      if (i < 89 || isNaN(rsi[i])) return false;
      const w = rsi.slice(Math.max(first, i - 89), i + 1);
      return lowest_ ? rsi[i] <= Math.min(...w) : rsi[i] >= Math.max(...w);
    };
    const mx: number[] = [], mxr: number[] = [], mn: number[] = [], mnr: number[] = [];
    const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
    const bear: boolean[] = [], bull: boolean[] = [], ph: boolean[] = [], pl: boolean[] = [];
    const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
    const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
    for (let i = 0; i < n; i++) {
      const c = close[i], v = rsi[i];
      const hb0 = isTop(i, false), lb0 = isTop(i, true);
      mx[i] = hb0 ? c : isNaN(at(mx, i - 1)) ? c : mx[i - 1];
      mxr[i] = hb0 ? v : isNaN(at(mxr, i - 1)) ? v : mxr[i - 1];
      mn[i] = lb0 ? c : isNaN(at(mn, i - 1)) ? c : mn[i - 1];
      mnr[i] = lb0 ? v : isNaN(at(mnr, i - 1)) ? v : mnr[i - 1];
      if (gt(c, mx[i])) mx[i] = c;
      if (gt(v, mxr[i])) mxr[i] = v;
      if (lt(c, mn[i])) mn[i] = c;
      if (lt(v, mnr[i])) mnr[i] = v;
      ph.push(eq(mxr[i], at(mxr, i - 2)) && ne(at(mxr, i - 2), at(mxr, i - 3)));
      pl.push(eq(mnr[i], at(mnr, i - 2)) && ne(at(mnr, i - 2), at(mnr, i - 3)));
      const r1 = at(rsi, i - 1);
      bear.push(gt(at(mx, i - 1), at(mx, i - 2)) && lt(r1, mxr[i]) && le(v, r1));
      bull.push(lt(at(mn, i - 1), at(mn, i - 2)) && gt(r1, mnr[i]) && ge(v, r1));
    }
    expect(times(r, 0)).toEqual(timeAt(bars, bear));
    expect(times(r, 1)).toEqual(timeAt(bars, bull));
    expect(times(r, 2)).toEqual(timeAt(bars, ph));
    expect(times(r, 3)).toEqual(timeAt(bars, pl));
    for (let k = 0; k < 4; k++) expect(times(r, k).length).toBeGreaterThan(3);
  });

  it('relative-valuation-oscillator: threshold and fair value crosses', () => {
    const r = rvo.calculate(bars);
    const lg = close.map((c) => Math.log(c));
    const mean = sma(lg, 34);
    const sd = lg.map((_, i) => {
      const w = win(lg, i, 34);
      if (!w) return NaN;
      const m = w.reduce((a, b) => a + b, 0) / 34;
      return Math.sqrt(w.reduce((a, b) => a + (b - m) * (b - m), 0) / 34);
    });
    const score = lg.map((v, i) => (v - mean[i]) / sd[i]);
    const o = xover(score, 2);
    const u = xunder(score, -2);
    expect(times(r, 0)).toEqual(timeAt(bars, o));
    expect(times(r, 1)).toEqual(timeAt(bars, u));
    expect(times(r, 2)).toEqual(timeAt(bars, xover(score, 0)));
    expect(times(r, 3)).toEqual(timeAt(bars, xunder(score, 0)));
    expect(times(r, 4)).toEqual(timeAt(bars, or(o, u)));
    for (let k = 0; k < 5; k++) expect(times(r, k).length).toBeGreaterThan(0);
  });

  it('renko-candles-overlay: the Renko trend turns (Traditional bricks)', () => {
    const box = 2;
    const r = rco2.calculate(bars, { mode: 'Traditional', tboxsize: box, changebrol: true });
    let head = Math.floor(bars[0].open / box) * box;
    let trend = 0;
    const tr: number[] = [];
    for (let i = 0; i < n; i++) {
      const c = close[i];
      const num = Math.floor(Math.abs(head - c) / box);
      if (num > 0) {
        if (trend === 0) {
          if (num >= 2) { trend = head < c ? 1 : -1; head += num * trend * box; }
        } else if (head * trend < c * trend) {
          head += num * trend * box;
        } else if (num >= 2) {
          trend *= -1;
          head += num * trend * box;
        }
      }
      tr.push(trend);
    }
    const up = tr.map((t, i) => i > 0 && tr[i - 1] === -1 && t === 1);
    const dn = tr.map((t, i) => i > 0 && tr[i - 1] === 1 && t === -1);
    expect(times(r, 0)).toEqual(timeAt(bars, up));
    expect(times(r, 1)).toEqual(timeAt(bars, dn));
    expect(times(r, 0).length).toBeGreaterThan(3);
    // the default ATR bricks also turn
    const d = rco2.calculate(bars);
    expect(times(d, 0).length).toBeGreaterThan(0);
    expect(times(d, 1).length).toBeGreaterThan(0);
  });

  it('renko-chart: breakout, main trend and Renko trend turns', () => {
    const r = renko.calculate(bars);
    const warm = 14;
    const after = (ts: number[]) => ts.filter((t) => t >= (bars[warm + 1].time as number));
    // main trend turns: the circles plot of the original at the trend line (green up / red down)
    const tc = r.plots.trendChange as { time: number; value: number; color?: string }[];
    const turn = (c: string) => tc.filter((p) => Number.isFinite(p.value) && p.color === c).map((p) => p.time);
    expect(after(times(r, 2))).toEqual(after(turn('#4CAF50')));
    expect(after(times(r, 3))).toEqual(after(turn('#FF5252')));
    // Renko trend turns: the bar colour turns to the up / down colour of the theme (default Blue/Red)
    const col = r.barColors.map((b) => b.color);
    const bt = r.barColors.map((b) => b.time);
    // the up colour: the colour of the bars where the Renko trend turns up
    const ups = new Set(col.filter((_, i) => r.alerts[4].times.includes(bt[i] as number)));
    expect(ups.size).toBe(1);
    const upCol = [...ups][0];
    expect(new Set(col).size).toBe(2);
    const toUp = bt.filter((_, i) => i > 0 && col[i] === upCol && col[i - 1] !== upCol);
    const toDown = bt.filter((_, i) => i > 0 && col[i] !== upCol && col[i - 1] === upCol);
    expect(after(times(r, 4)).filter((t) => t > (bt[0] as number))).toEqual(toUp.filter((t) => t >= (bars[warm + 1].time as number)));
    expect(after(times(r, 5)).filter((t) => t > (bt[0] as number))).toEqual(toDown.filter((t) => t >= (bars[warm + 1].time as number)));
    // breakout starts: the breakout line turns lime / red
    const bo = r.plots.breakoutLine as { time: number; color?: string }[];
    const lime = bo.filter((p, i) => i > warm && p.color === '#00E676' && bo[i - 1].color !== '#00E676').map((p) => p.time);
    const red = bo.filter((p, i) => i > warm && p.color === '#FF5252' && bo[i - 1].color !== '#FF5252').map((p) => p.time);
    expect(after(times(r, 0)).filter((t) => t > (bars[warm + 1].time as number))).toEqual(lime);
    expect(after(times(r, 1)).filter((t) => t > (bars[warm + 1].time as number))).toEqual(red);
    for (let k = 0; k < 6; k++) expect(times(r, k).length).toBeGreaterThan(0);
  });
});

describe('Style ids', () => {
  it('readyfor401ks-just-tell-me-when: crosses are shape0, exit arrows are arrow0 (no arrow markers)', () => {
    const r = r401k.calculate(bars);
    expect(r.markers.length).toBeGreaterThan(0);
    expect(new Set(r.markers.map((m) => m.id))).toEqual(new Set(['shape0']));
    expect(r.markers.every((m) => m.shape === 'cross' && m.position === 'top')).toBe(true);
    expect(r.arrows.length).toBeGreaterThan(0);
    expect(r.arrows.every((a) => a.id === 'arrow0' && Math.abs(a.value) === 1 && a.color.length > 0)).toBe(true);
  });

  it('relative-strength-heatmap: four bgcolor layers', () => {
    const r = rsh.calculate(bars);
    const ids = new Set(r.bgColors.map((b) => b.id));
    expect(ids).toEqual(new Set(['bgcolor0', 'bgcolor1', 'bgcolor2', 'bgcolor3']));
    const bull = r.bgColors.filter((b) => b.id === 'bgcolor0').map((b) => b.time);
    expect(r.bgColors.filter((b) => b.id === 'bgcolor1').map((b) => b.time)).toEqual(bull);
    expect(bull).toEqual(times(r, 0));
    expect(r.bgColors.filter((b) => b.id === 'bgcolor2').map((b) => b.time)).toEqual(times(r, 1));
    expect(r.bgColors.filter((b) => b.id === 'bgcolor3').map((b) => b.time)).toEqual(times(r, 1));
  });

  it('relative-valuation-oscillator: four shapes and two bgcolors', () => {
    const r = rvo.calculate(bars, { enableBgSignals: true });
    const ids = new Set(r.markers.map((m) => m.id));
    expect(ids).toEqual(new Set(['shape0', 'shape1', 'shape2', 'shape3']));
    for (const m of r.markers) {
      if (m.id === 'shape0' || m.id === 'shape1') expect(m.position).toBe('atPriceMiddle');
      if (m.id === 'shape2') expect(m.position).toBe('aboveBar');
      if (m.id === 'shape3') expect(m.position).toBe('belowBar');
    }
    const t0 = r.markers.filter((m) => m.id === 'shape0').map((m) => m.time);
    expect(r.markers.filter((m) => m.id === 'shape2').map((m) => m.time)).toEqual(t0);
    expect(new Set(r.bgColors.map((b) => b.id))).toEqual(new Set(['bgcolor0', 'bgcolor1']));
    expect(r.bgColors.filter((b) => b.id === 'bgcolor0').map((b) => b.time)).toEqual(t0);
    expect(r.bgColors.filter((b) => b.id === 'bgcolor1').map((b) => b.time))
      .toEqual(r.markers.filter((m) => m.id === 'shape1').map((m) => m.time));
  });

  it('renko-chart: Renko Candles plotcandle (Candle style) on the open / close of the Area style', () => {
    expect(renko.plotCandleConfig).toEqual([{ id: 'renkoCandles', title: 'Renko Candles' }]);
    const area = renko.calculate(bars);
    expect(area.plotCandles.renkoCandles.length).toBe(n);
    expect(area.plotCandles.renkoCandles.every((c) => isNaN(c.open) && isNaN(c.close))).toBe(true);
    const cand = renko.calculate(bars, { showStyle: 'Candle' });
    expect(vals(cand.plots.renkoOpen).every((v) => isNaN(v))).toBe(true);
    const o = vals(area.plots.renkoOpen);
    const c = vals(area.plots.renkoClose);
    const candles = cand.plotCandles.renkoCandles;
    let checked = 0;
    for (let i = 0; i < n; i++) {
      if (isNaN(o[i]) || isNaN(c[i])) continue;
      checked++;
      expect(candles[i].open).toBe(o[i]);
      expect(candles[i].close).toBe(c[i]);
      expect(candles[i].high).toBe(Math.max(o[i], c[i]));
      expect(candles[i].low).toBe(Math.min(o[i], c[i]));
    }
    expect(checked).toBeGreaterThan(100);
    expect(cand.alerts).toEqual(area.alerts);
  });
});
