/**
 * Community ports, batch 46: the alertcondition() declarations (ids, titles and messages of the originals), the bars
 * on which each condition is true (re-computed here from the original's expression), the alert() calls, and the
 * Style ids / outputs (markers, circle plots, bgColors, fill title, palette).
 */
import { describe, expect, it } from 'vitest';
import { ta, Series, color, type Bar } from 'oakscriptjs';
import * as vulkan from '../../src/community/vulkan-profit';
import * as vumanchu from '../../src/community/vumanchu-swing';
import * as vdo from '../../src/community/vwap-deviation-oscillator';
import * as vmec from '../../src/community/vwap-mvwap-ema-crossover';
import * as vpc from '../../src/community/vwap-periodic-close';
import * as vpb from '../../src/community/vwap-predictive-breakout-rsi-ob-trend-chop';
import * as wtt from '../../src/community/wavelet-transform-trend';
import * as wml from '../../src/community/wavelet-trend-ml-integration';
import * as wavetrend from '../../src/community/wavetrend';
import * as wtdd from '../../src/community/wavetrend-oscillator-divergence-direction';
import * as wedge from '../../src/community/wedge-and-flag-finder';
import * as wrb from '../../src/community/weighted-regression-bands';
import * as wwc from '../../src/community/weis-wave-candle';
import * as wwv from '../../src/community/weis-wave-volume';
import * as whale from '../../src/community/whale-activity-impact-oscillator';

/** alertcondition() declarations of the originals (spec ids / titles / messages) */
const SPEC: Record<string, [string, string, string][]> = {
  'vulkan-profit': [
    ['alert0', 'Vulkan Profit Buy Signal', 'Vulkan Profit: BUY Signal'],
    ['alert1', 'Vulkan Profit Sell Signal', 'Vulkan Profit: SELL Signal'],
  ],
  'vumanchu-swing': [
    ['alert0', 'Buy Alert', 'BUY'],
    ['alert1', 'Sell Alert', 'SELL'],
  ],
  'vwap-deviation-oscillator': [
    ['alert0', 'VWAP Deviation Bullish', 'VWAP Deviation crossed above 0 (Bullish) {{exchange}}:{{ticker}}'],
    ['alert1', 'VWAP Deviation Bearish', 'VWAP Deviation crossed below 0 (Bearish) {{exchange}}:{{ticker}}'],
    ['alert2', 'VWAP Deviation Overbought', 'VWAP Deviation crossed above +1σ {{exchange}}:{{ticker}}'],
    ['alert3', 'VWAP Deviation Oversold', 'VWAP Deviation crossed below -1σ {{exchange}}:{{ticker}}'],
    ['alert4', 'VWAP Deviation Polarity Change', 'VWAP Deviation polarity changed {{exchange}}:{{ticker}}'],
    ['alert5', 'VWAP Deviation Zone Change', 'VWAP Deviation zone changed {{exchange}}:{{ticker}}'],
  ],
  'vwap-predictive-breakout-rsi-ob-trend-chop': [
    ['alert0', 'Predictive Long Entry', 'Long: VWAP breakout + RSI + OB + Clean Candle'],
    ['alert1', 'Predictive Short Entry', 'Short: VWAP breakdown + RSI + OB + Clean Candle'],
  ],
  'wavelet-transform-trend': [
    ['alert0', 'Bullish Wavelet Trend', 'Wavelet Transform Trend: BULLISH on {{exchange}}:{{ticker}} - {{interval}}'],
    ['alert1', 'Bearish Wavelet Trend', 'Wavelet Transform Trend: BEARISH on {{exchange}}:{{ticker}} - {{interval}}'],
    ['alert2', 'Any Wavelet Trend Flip', 'Wavelet Transform Trend: Trend flipped on {{exchange}}:{{ticker}} - {{interval}}'],
  ],
  'wavelet-trend-ml-integration': [
    ['alert0', 'Bullish Signal', 'Bullish Signal Detected'],
    ['alert1', 'Bearish Signal', 'Bearish Signal Detected'],
  ],
  'wavetrend-oscillator-divergence-direction': [
    'Ventas en Sobre Compra', 'Todas las Ventas', 'Compras en Sobre Venta', 'Todas las Compras',
    'Compras/Ventas en Sobre Compra/Venta', 'Todas las Ventas/Compras', 'Cambio Direccion WT', 'Overbought Sales',
    'All Sales', 'Oversold Buys', 'All Buys', 'Buys/Sales Overbought/Oversold', 'All Sales/Buys', 'WT Direction Change',
  ].map((t, k) => [`alert${k}`, t, 'Alert Fired!']),
  'weighted-regression-bands': [
    ['alert0', 'Trend - Long', 'Trend turned bullish for {{ticker}}'],
    ['alert1', 'Trend - Short', 'Trend turned bearish for {{ticker}}'],
  ],
  'weis-wave-candle': [
    ['alert0', 'Upward Trend Change', 'Weis Wave: Trend changed to Upward'],
    ['alert1', 'Downward Trend Change', 'Weis Wave: Trend changed to Downward'],
  ],
  'whale-activity-impact-oscillator': [
    ['alert0', 'Whale Buying Detected', 'Whale buying detected!'],
    ['alert1', 'Whale Selling Detected', 'Whale selling detected!'],
  ],
};

const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Seeded random walk of bars with a random volume (some volume spikes) */
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
const bars = walk(1200, 46);
const n = bars.length;
const close = bars.map((b) => b.close);
const timeAt = (flags: boolean[]) => bars.filter((_, i) => flags[i]).map((b) => b.time as number);
const decls = (m: { alertConditions: { id: string; title: string; message?: string }[] }) =>
  m.alertConditions.map((d) => [d.id, d.title, d.message]);
const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));
const S = (a: number[]) => Series.fromArray(bars, a);
type Alerts = { alerts: { id: string; times: number[]; triggered: boolean }[] };
const times = (r: Alerts, k: number) => r.alerts[k].times;
type M = { time: unknown; id?: string; text?: string };
const idTimes = (ms: M[], id: string) => ms.filter((m) => m.id === id).map((m) => m.time as number);
const vals = (p: { value: number }[]) => p.map((x) => x.value);
/** Exact crosses (PineScript ta.crossover / ta.crossunder), na is false */
const xOver = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
const xUnder = (a: number[], b: number[], i: number) => i > 0 && a[i] < b[i] && a[i - 1] >= b[i - 1];
const range = (f: (i: number) => boolean) => Array.from({ length: n }, (_, i) => f(i));

describe('declarations', () => {
  const mods: Record<string, { alertConditions: { id: string; title: string; message?: string }[] }> = {
    'vulkan-profit': vulkan,
    'vumanchu-swing': vumanchu,
    'vwap-deviation-oscillator': vdo,
    'vwap-predictive-breakout-rsi-ob-trend-chop': vpb,
    'wavelet-transform-trend': wtt,
    'wavelet-trend-ml-integration': wml,
    'wavetrend-oscillator-divergence-direction': wtdd,
    'weighted-regression-bands': wrb,
    'weis-wave-candle': wwc,
    'whale-activity-impact-oscillator': whale,
  };
  for (const [id, m] of Object.entries(mods)) {
    it(`${id}: the original's alertconditions`, () => expect(decls(m)).toEqual(SPEC[id]));
  }
  it('the indicator objects carry the new exports', () => {
    expect(vulkan.VulkanProfit.alertConditions).toBe(vulkan.alertConditions);
    expect(vumanchu.VuManChuSwing.alertConditions).toBe(vumanchu.alertConditions);
    expect(vdo.VwapDeviationOscillator.alertConditions).toBe(vdo.alertConditions);
    expect(vpb.VwapPredictiveBreakoutRsiObTrendChop.alertConditions).toBe(vpb.alertConditions);
    expect(wtt.WaveletTransformTrend.alertConditions).toBe(wtt.alertConditions);
    expect(wml.WaveletTrendMLIntegration.alertConditions).toBe(wml.alertConditions);
    expect(wtdd.WaveTrendOscillatorDivergenceDirection.alertConditions).toBe(wtdd.alertConditions);
    expect(wrb.WeightedRegressionBands.alertConditions).toBe(wrb.alertConditions);
    expect(wwc.WeisWaveCandle.alertConditions).toBe(wwc.alertConditions);
    expect(whale.WhaleActivityImpactOscillator.alertConditions).toBe(whale.alertConditions);
    expect(wedge.hasAlertFunction).toBe(true);
    expect(wedge.WedgeAndFlagFinder.hasAlertFunction).toBe(true);
  });
});

describe('Vulkan Profit', () => {
  const r = vulkan.calculate(bars);
  it('buy / sell alerts on the first bar of a bullish / bearish state', () => {
    const fw = A(ta.wma(S(close), 3)), mw = A(ta.wma(S(close), 8));
    const fe = A(ta.ema(S(close), 18)), se = A(ta.ema(S(close), 28));
    const bull = range((i) => Math.min(fw[i], mw[i]) > Math.max(fe[i], se[i]));
    const bear = range((i) => Math.max(fw[i], mw[i]) < Math.min(fe[i], se[i]));
    const buy = range((i) => bull[i] && !(i > 0 && bull[i - 1]));
    const sell = range((i) => bear[i] && !(i > 0 && bear[i - 1]));
    expect(times(r, 0).length).toBeGreaterThan(5);
    expect(times(r, 1).length).toBeGreaterThan(5);
    expect(times(r, 0)).toEqual(timeAt(buy));
    expect(times(r, 1)).toEqual(timeAt(sell));
  });
  it('alerts also when the triangles are hidden', () => {
    expect(vulkan.calculate(bars, { showSignals: false }).alerts).toEqual(r.alerts);
  });
});

describe('VuManChu Swing (Range Filter - B&S Signals)', () => {
  const r = vumanchu.calculate(bars);
  it('longCondition / shortCondition re-computed from the range filter', () => {
    const per = 20, qty = 3.5;
    // abs(x - x[1]) is na on the first bar (x[1] is na)
    const absCh = close.map((c, i) => (i > 0 ? Math.abs(c - close[i - 1]) : NaN));
    const ac = A(ta.ema(Series.fromArray(bars, A(ta.ema(S(absCh), per))), per * 2 - 1)).map((v) => v * qty);
    const filt: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i === 0) { filt.push(close[0]); continue; }
      const p = filt[i - 1], x = close[i], rr = ac[i];
      filt.push(x - rr > p ? x - rr : x + rr < p ? x + rr : p);
    }
    const fdir: number[] = [0];
    for (let i = 1; i < n; i++) fdir.push(filt[i] > filt[i - 1] ? 1 : filt[i] < filt[i - 1] ? -1 : fdir[i - 1]);
    let ini = 0;
    const buy: boolean[] = [], sell: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const s1 = i > 0 ? close[i - 1] : NaN;
      const up = fdir[i] === 1, dn = fdir[i] === -1;
      const lc = (close[i] > filt[i] && close[i] > s1 && up) || (close[i] > filt[i] && close[i] < s1 && up);
      const sc = (close[i] < filt[i] && close[i] < s1 && dn) || (close[i] < filt[i] && close[i] > s1 && dn);
      buy.push(lc && ini === -1);
      sell.push(sc && ini === 1);
      ini = lc ? 1 : sc ? -1 : ini;
    }
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
    expect(times(r, 0)).toEqual(timeAt(buy));
    expect(times(r, 1)).toEqual(timeAt(sell));
  });
  it('after the warm-up the alerts fall on the BUY / SELL labels', () => {
    const after = (ts: number[]) => ts.filter((t) => t >= (bars[40].time as number));
    expect(after(times(r, 0))).toEqual(after(r.markers.filter((m) => m.text === 'BUY').map((m) => m.time as number)));
    expect(after(times(r, 1))).toEqual(after(r.markers.filter((m) => m.text === 'SELL').map((m) => m.time as number)));
  });
});

describe('VWAP Deviation Oscillator', () => {
  for (const devMode of ['Absolute', 'Percent', 'Z-Score'] as const) {
    it(`${devMode}: crosses of 0 / +-1 sigma, sign and zone changes`, () => {
      const r = vdo.calculate(bars, { devMode });
      const osc = vals(r.plots.plot0 as { value: number }[]);
      const s1 = vals(r.plots.plot2 as { value: number }[]);
      const zero = osc.map(() => 0);
      const neg = s1.map((v) => -v);
      const zone = osc.map((o, i) => {
        const s = s1[i], c1 = 0.5 * s, c2 = s, c3 = 2 * s, c4 = 2.8 * s;
        return ge(o, c4) ? 4 : ge(o, c3) ? 3 : ge(o, c2) ? 2 : ge(o, c1) ? 1 : ge(o, 0) ? 0
          : gt(o, -c1) ? 5 : gt(o, -c2) ? 6 : gt(o, -c3) ? 7 : gt(o, -c4) ? 8 : 9;
      });
      const changed = (a: number[]) => range((i) => i > 0 && !isNaN(a[i]) && !isNaN(a[i - 1]) && a[i] !== a[i - 1]);
      const flags = [
        range((i) => xOver(osc, zero, i)), range((i) => xUnder(osc, zero, i)),
        range((i) => xOver(osc, s1, i)), range((i) => xUnder(osc, neg, i)),
        changed(osc.map(Math.sign)), changed(zone),
      ];
      flags.forEach((f, k) => {
        expect(times(r, k).length).toBeGreaterThan(0);
        expect(times(r, k)).toEqual(timeAt(f));
      });
    });
  }
  it('the fill "Plot Fill" is given in both plot types (transparent in the histogram mode)', () => {
    const h = vdo.calculate(bars);
    expect(h.fills).toHaveLength(1);
    expect(h.fills![0]).toMatchObject({ plot1: 'plot0', plot2: 'plot1', options: { title: 'Plot Fill' } });
    expect(new Set(h.fills![0].colors)).toEqual(new Set(['transparent']));
    const l = vdo.calculate(bars, { plotType: 'Line' });
    expect(l.fills![0].options?.title).toBe('Plot Fill');
    expect(l.fills![0].colors!.some((c) => c !== 'transparent')).toBe(true);
  });
});

describe('VWAP/MVWAP/EMA Crossover (Style ids)', () => {
  const r = vmec.calculate(bars);
  const ids = ['shape0', 'shape1', 'shape2', 'shape3', 'shape4', 'shape5'];
  it('every marker has one of the original shape ids, and each output is drawn', () => {
    for (const m of r.markers) expect(ids).toContain(m.id);
    for (const id of ids) expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
  });
  it('Long Entry is the first bar of Buy, Risky / WAIT / Enter Here are Buy bars; the signal shapes are transparent', () => {
    const buy = new Set(idTimes(r.markers, 'shape2'));
    const buyArr = bars.map((b) => buy.has(b.time as number));
    expect(idTimes(r.markers, 'shape0')).toEqual(timeAt(range((i) => i > 0 && buyArr[i] && !buyArr[i - 1])));
    expect(idTimes(r.markers, 'shape1')).toEqual(timeAt(range((i) => i > 0 && !buyArr[i] && buyArr[i - 1])));
    for (const id of ['shape3', 'shape4', 'shape5']) for (const t of idTimes(r.markers, id)) expect(buy.has(t)).toBe(true);
    for (const m of r.markers.filter((x) => ['shape2', 'shape3', 'shape4', 'shape5'].includes(x.id!))) {
      expect(m.color).toMatch(/, 0\)$/);
    }
  });
});

describe('VWAP Periodic Close (bgcolor ids)', () => {
  it('Day theme: bgcolor0 on every bar, bgcolor1 from bar 1001 (offset 1001)', () => {
    const r = vpc.calculate(bars, { theme: 'Day' });
    const b0 = r.bgColors!.filter((b) => b.id === 'bgcolor0');
    const b1 = r.bgColors!.filter((b) => b.id === 'bgcolor1');
    expect(b0).toHaveLength(n);
    expect(b1.map((b) => b.time)).toEqual(bars.slice(1001).map((b) => b.time));
    for (const b of r.bgColors!) expect(['bgcolor0', 'bgcolor1']).toContain(b.id);
  });
  it('Custom theme: no background', () => {
    expect(vpc.calculate(bars).bgColors).toHaveLength(0);
  });
});

describe('VWAP Predictive Breakout + RSI + OB + Trend/Chop', () => {
  const r = vpb.calculate(bars);
  it('as in the original, the cross and the three-close confirmation exclude each other: no alert', () => {
    // crossUp needs close[1] < vwap, aboveConfirm close[1] > vwap (the daily vwap is hlc3 of the bar)
    const vwap = bars.map((b) => (b.high + b.low + b.close) / 3);
    const both = range((i) => i > 1 && close[i] > vwap[i] && close[i - 1] < vwap[i] && close[i - 1] > vwap[i]);
    expect(timeAt(both)).toEqual([]);
    expect(times(r, 0)).toEqual([]);
    expect(times(r, 1)).toEqual([]);
    expect(r.alerts.map((a) => a.triggered)).toEqual([false, false]);
  });
});

describe('Wavelet Transform Trend', () => {
  const r = wtt.calculate(bars, { showBgcolor: true, displayStyle: 'Line' });
  it('trend flips re-computed from the trend direction (background on a trend, colour of the line)', () => {
    const bgT = new Set(r.bgColors.map((b) => b.time));
    const bear = String(color.new('#ff0000', 90));
    const bgCol = new Map(r.bgColors.map((b) => [b.time, b.color]));
    const dir = bars.map((b) => (bgT.has(b.time) ? (bgCol.get(b.time) === bear ? -1 : 1) : 0));
    const bull = range((i) => dir[i] === 1 && (i > 0 ? dir[i - 1] : 0) === -1);
    const bearF = range((i) => dir[i] === -1 && (i > 0 ? dir[i - 1] : 0) === 1);
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
    expect(times(r, 0)).toEqual(timeAt(bull));
    expect(times(r, 1)).toEqual(timeAt(bearF));
    expect(times(r, 2)).toEqual(timeAt(range((i) => bull[i] || bearF[i])));
    // the trend line is broken on the flip bars
    const line = vals(r.plots.plot1 as { value: number }[]);
    for (let i = 0; i < n; i++) if (bull[i] || bearF[i]) expect(line[i]).toBeNaN();
  });
  it('the alerts do not depend on the display', () => {
    expect(wtt.calculate(bars).alerts).toEqual(r.alerts);
  });
});

describe('Wavelet-Trend ML Integration', () => {
  const r = wml.calculate(bars, { lookback: 100 });
  it('zero crossings of the final signal, on the label bars', () => {
    const f = vals(r.plots.plot9 as { value: number }[]);
    const up = range((i) => i > 0 && f[i] > 0 && f[i - 1] <= 0);
    const dn = range((i) => i > 0 && f[i] < 0 && f[i - 1] >= 0);
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
    expect(times(r, 0)).toEqual(timeAt(up));
    expect(times(r, 1)).toEqual(timeAt(dn));
    expect(times(r, 0)).toEqual(r.markers.filter((m) => m.shape === 'labelUp').map((m) => m.time));
  });
});

describe('WaveTrend with Crosses (circle plots)', () => {
  const r = wavetrend.calculate(bars) as ReturnType<typeof wavetrend.calculate> & { markers: M[] };
  it('no markers: the crosses are the two circle plots of the original, at wt2', () => {
    expect(r.markers).toHaveLength(0);
    const w1 = vals(r.plots.plot0 as { value: number }[]);
    const w2 = vals(r.plots.plot1 as { value: number }[]);
    const cross = range((i) => xOver(w1, w2, i) || xUnder(w1, w2, i));
    const p3 = r.plots.plot3 as { value: number; color: string }[];
    const p4 = r.plots.plot4 as { value: number; color: string }[];
    expect(cross.filter(Boolean).length).toBeGreaterThan(20);
    for (let i = 0; i < n; i++) {
      if (cross[i]) {
        expect(p3[i].value).toBe(w2[i]);
        expect(p4[i].value).toBe(w2[i]);
        expect(p4[i].color).toBe(w2[i] - w1[i] > 0 ? '#FF0000' : '#00FF00');
      } else {
        expect(p3[i].value).toBeNaN();
        expect(p4[i].value).toBeNaN();
      }
    }
    expect(wavetrend.plotConfig.slice(3).map((p) => [p.color, p.lineWidth, p.style])).toEqual([['#000000', 3, 'circles'], ['#00FF00', 2, 'circles']]);
  });
});

describe('Oscilador WaveTrend (divergence + direction)', () => {
  const run = (only: boolean) => wtdd.calculate(bars, { senal: true, ventasEnSobreCompra: only, comprasEnSobreVenta: only, nsc: 40, nsv: -40 });
  it('sell / buy crosses, both sides and the direction change, declared twice', () => {
    for (const only of [true, false]) {
      const r = run(only);
      const w1 = vals(r.plots.wt1 as { value: number }[]);
      const w2 = vals(r.plots.wt2 as { value: number }[]);
      const venta = range((i) => xUnder(w1, w2, i) && ge(w1[i], 40) && only);
      const venta1 = range((i) => xUnder(w1, w2, i) && !only);
      const compra = range((i) => xOver(w1, w2, i) && le(w1[i], -40) && only);
      const compra1 = range((i) => xOver(w1, w2, i) && !only);
      // direction := rising(wt1, 1) ? 1 : falling(wt1, 1) ? -1 : nz(direction[1]); falling() runs only when rising()
      // is false, so it compares with wt1 of the last bar on which it ran
      const dir: number[] = [];
      let fallPrev = NaN;
      for (let i = 0; i < n; i++) {
        const p = i > 0 ? dir[i - 1] : 0;
        const rising = i > 0 && w1[i] > w1[i - 1];
        let falling = false;
        if (!rising) {
          falling = w1[i] < fallPrev;
          fallPrev = w1[i];
        }
        dir.push(rising ? 1 : falling ? -1 : p);
      }
      const change = range((i) => i > 0 && dir[i] !== dir[i - 1]);
      const set = [venta, venta1, compra, compra1, range((i) => venta[i] || compra[i]), range((i) => venta1[i] || compra1[i]), change];
      [...set, ...set].forEach((f, k) => expect(times(r, k)).toEqual(timeAt(f)));
      expect(times(r, only ? 0 : 1).length).toBeGreaterThan(0);
      expect(times(r, only ? 2 : 3).length).toBeGreaterThan(0);
      expect(times(r, 6).length).toBeGreaterThan(50);
    }
  });
  it('divergence labels carry the ids of the original shapes', () => {
    const r = wtdd.calculate(bars, { divRegAl: true, divRegBa: true, divOcuAl: true, divOcuBa: true });
    const byText: Record<string, string> = { '🐻 R': 'shape0', '🐻 O': 'shape1', '🐂 R': 'shape2', '🐂 O': 'shape3' };
    expect(r.markers.length).toBeGreaterThan(4);
    for (const m of r.markers) expect(m.id).toBe(byText[m.text!]);
    for (const id of Object.values(byText)) expect(idTimes(r.markers, id).length).toBeGreaterThan(0);
  });
});

describe('Wedge and Flag Finder (alert() calls)', () => {
  const few = bars.slice(0, 700);
  it('one call per pattern drawn, with its kind, once per bar close by default', () => {
    const r = wedge.calculate(few, { drawZigzag: false });
    const flags = r.labels.filter((l) => l.text === 'Flag').length;
    const wedges = r.labels.filter((l) => l.text === 'Wedge').length;
    expect(flags + wedges).toBeGreaterThan(0);
    expect(r.alertCalls.filter((c) => c.message === 'New Flag pattern found')).toHaveLength(flags);
    expect(r.alertCalls.filter((c) => c.message === 'New Wedge pattern found')).toHaveLength(wedges);
    expect(r.alertCalls).toHaveLength(flags + wedges);
    for (const c of r.alertCalls) expect(c.freq).toBe('once_per_bar_close');
    const ts = r.alertCalls.map((c) => c.time);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    const known = new Set(few.map((b) => b.time));
    for (const t of ts) expect(known.has(t)).toBe(true);
  });
  it('once per bar when "Alert only after the confirmation of the bar" is off', () => {
    const r = wedge.calculate(few, { drawZigzag: false, alertOnBarCompletion: false });
    expect(r.alertCalls.length).toBeGreaterThan(0);
    for (const c of r.alertCalls) expect(c.freq).toBe('once_per_bar');
  });
});

describe('Weighted Regression Bands', () => {
  for (const MA of ['Linear Regression', 'ALMA'] as const) {
    it(`${MA}: slope flips of the fair value`, () => {
      const r = wrb.calculate(bars, { MA } as never);
      const fair = vals(r.plots.plot0 as { value: number }[]);
      const slope = fair.map((v, i) => (i > 0 ? v - fair[i - 1] : NaN));
      const sp = (i: number) => (i > 0 ? slope[i - 1] : NaN);
      const up = range((i) => gt(slope[i], 0) && le(sp(i), 0));
      const dn = range((i) => lt(slope[i], 0) && ge(sp(i), 0));
      expect(times(r, 0).length).toBeGreaterThan(3);
      expect(times(r, 1).length).toBeGreaterThan(3);
      expect(times(r, 0)).toEqual(timeAt(up));
      expect(times(r, 1)).toEqual(timeAt(dn));
    });
  }
});

describe('Weis Wave Candle', () => {
  for (const method of ['LazyBear Style', 'Impulse Trend'] as const) {
    it(`${method}: wave changes up / down and the bgcolor ids`, () => {
      const r = wwc.calculate(bars, { method });
      const up = vals(r.plots.plot0 as { value: number }[]);
      const down = vals(r.plots.plot1 as { value: number }[]);
      const wave = up.map((u, i) => (u > 0 ? 1 : down[i] > 0 ? -1 : 0));
      expect(times(r, 0).length).toBeGreaterThan(3);
      expect(times(r, 1).length).toBeGreaterThan(3);
      expect(times(r, 0)).toEqual(timeAt(range((i) => i > 0 && wave[i] === 1 && wave[i - 1] === -1)));
      expect(times(r, 1)).toEqual(timeAt(range((i) => i > 0 && wave[i] === -1 && wave[i - 1] === 1)));
      for (const b of r.bgColors) expect(['bgcolor0', 'bgcolor1']).toContain(b.id);
      expect(r.bgColors.filter((b) => b.id === 'bgcolor0').map((b) => b.time)).toEqual(timeAt(range((i) => up[i] > 0.01)));
      expect(r.bgColors.filter((b) => b.id === 'bgcolor1').map((b) => b.time)).toEqual(timeAt(range((i) => down[i] > 0.01)));
    });
  }
});

describe('Weis Wave Volume (palette)', () => {
  it('the columns take the colours of the original: green / red with a transparency of 75', () => {
    const r = wwv.calculate(bars);
    const up = String(color.new(color.green, 75));
    const down = String(color.new(color.red, 75));
    const cols = new Set((r.plots.plot0 as { color: string }[]).map((p) => p.color));
    expect(cols).toEqual(new Set([up, down]));
    expect(wwv.plotConfig[0].color).toBe(up);
  });
});

describe('Whale Activity Impact Oscillator', () => {
  const r = whale.calculate(bars, { volumeSpikeMultiplier: 2 });
  it('whale buy / sell bars from the original expression', () => {
    const v = bars.map((b) => b.volume as number);
    const pc = close.map((c, i) => (i > 0 ? (c - close[i - 1]) / close[i - 1] : NaN));
    const avgV = A(ta.sma(S(v), 50));
    const avgP = A(ta.sma(S(pc), 50));
    const spike = (i: number) => gt(v[i], 2 * avgV[i]) && gt(Math.abs(pc[i]), 2 * avgP[i]);
    const buy = range((i) => spike(i) && gt(pc[i], 0));
    const sell = range((i) => spike(i) && lt(pc[i], 0));
    expect(times(r, 0).length).toBeGreaterThan(3);
    expect(times(r, 1).length).toBeGreaterThan(3);
    expect(times(r, 0)).toEqual(timeAt(buy));
    expect(times(r, 1)).toEqual(timeAt(sell));
  });
});
