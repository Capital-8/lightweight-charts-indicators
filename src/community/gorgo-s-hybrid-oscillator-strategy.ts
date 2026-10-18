/**
 * Gorgo's Hybrid Oscillator STrategy (GHOST)
 *
 * The oscillator is the average of the RSI (hlc3, 24) and the Ultimate Oscillator (7 / 14 / 28). A zero-lag
 * accumulation of the oscillator a = lag * osc + (1 - lag) * b[25] + a[1] (lag 1.4) gives the ZLMA line
 * b = change(a, 50) / 50. The stochastic of the CCI (hlc3, 28; stoch 28, smoothed 3 and 3) marks overbought /
 * oversold circles. The ADX (14) is drawn as columns, coloured by the DI direction above the ADX threshold and
 * lighter when it falls. Buy / sell conditions (oscillator, stochastic CCI, ADX, volume above its SMA) colour the
 * background. Optional volume panel: volume candles coloured by the volume level, the highest volume (30) and the
 * volume SMA and excess levels of the previous bar.
 * Alerts (alertcondition, `alerts` of the result): 'BUY' and 'SELL', on the bars of the buy / sell conditions.
 *
 * Reference: "Gorgo's Hybrid Oscillator STrategy" by Gorgomannaro
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface GorgosHybridOscillatorStrategyInputs {
  /** Overbought level of the stochastic CCI and of the oscillator */
  overboughtLevel: number;
  /** Oversold level of the stochastic CCI and of the oscillator */
  oversoldLevel: number;
  /** ADX threshold */
  adxThreshold: number;
  /** Show the ADX */
  showAdx: boolean;
  /** Volume SMA length */
  volumeLength: number;
  /** Volume excess multiplier of the volume SMA */
  volumeExcess: number;
  /** Show the volume panel */
  showVsa: boolean;
}

export const defaultInputs: GorgosHybridOscillatorStrategyInputs = {
  overboughtLevel: 69.0,
  oversoldLevel: 35.0,
  adxThreshold: 24.0,
  showAdx: true,
  volumeLength: 9,
  volumeExcess: 2.7,
  showVsa: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'overboughtLevel', type: 'float', title: 'overbought_level', defval: 69.0 },
  { id: 'oversoldLevel', type: 'float', title: 'oversold_level', defval: 35.0 },
  { id: 'adxThreshold', type: 'float', title: 'adx_threshold', defval: 24.0 },
  { id: 'showAdx', type: 'bool', title: 'Mostra ADX', defval: true },
  { id: 'volumeLength', type: 'int', title: 'media_volume', defval: 9 },
  { id: 'volumeExcess', type: 'float', title: 'eccesso_volumetrico', defval: 2.7, step: 0.1 },
  { id: 'showVsa', type: 'bool', title: 'Mostra i Volumi', defval: false },
];

const OSC_COLOR = String(color.new('#00d0ff', 25));
const OB_COLOR = String(color.new('#ff0000', 50));
const OS_COLOR = String(color.new('#00ff00', 50));
const STOCH_COLOR = '#7878787a';
const HIGHEST_COLOR = String(color.rgb(255, 255, 255, 90));
const AZZURRO = 'rgb(0, 149, 255)'; // color.rgb(0, 149, 255)
const ROSSO = 'rgb(255, 0, 0)'; // color.rgb(255, 0, 0)
const BIANCO = 'rgb(255, 225, 255)'; // color.rgb(255, 225, 255)
const GRIGIO = 'rgb(68, 68, 68)'; // color.rgb(68, 68, 68)
const LEVEL_COLOR = String(color.new(color.white, 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ZLMA', color: '#ac0b00', lineWidth: 1 },
  { id: 'plot1', title: 'Oscillator', color: OSC_COLOR, lineWidth: 2 },
  { id: 'plot2', title: 'Overbought', color: OB_COLOR, lineWidth: 3, style: 'circles' },
  { id: 'plot3', title: 'Oversold', color: OS_COLOR, lineWidth: 3, style: 'circles' },
  { id: 'plot4', title: 'Stochastic CCI', color: STOCH_COLOR, lineWidth: 1 },
  { id: 'plot5', title: 'ADX', color: String(color.new('#4a4a4a', 75)), lineWidth: 1, style: 'columns' },
  { id: 'plot6', title: 'Highest Volume (lookback)', color: HIGHEST_COLOR, lineWidth: 2, style: 'columns' },
  { id: 'plot7', title: 'media_volume', color: String(color.new(AZZURRO, 0)), lineWidth: 1 },
  { id: 'plot8', title: 'eccesso_volumetrico', color: String(color.new(ROSSO, 0)), lineWidth: 1 },
];

/** hline(overbought_level / oversold_level / adx_threshold) with the default values */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_ob', price: 69, title: 'Overbought line', color: LEVEL_COLOR, linestyle: 'dotted' },
  { id: 'hline_os', price: 35, title: 'Overbought line', color: LEVEL_COLOR, linestyle: 'dotted' },
  { id: 'hline_adx', price: 24, title: 'ADX threshold', color: LEVEL_COLOR, linestyle: 'dashed' },
];

export const metadata = {
  title: "Gorgo's Hybrid Oscillator STrategy",
  shortTitle: 'GHOST',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
/** Plots show na for +-infinity */
const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<GorgosHybridOscillatorStrategyInputs> = {},
): IndicatorResult & { bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const prev = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);
  const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);

  // RSI of hlc3, length 24
  const change = hlc3.map((v, i) => (i > 0 ? v - hlc3[i - 1] : NaN));
  const up = A(ta.rma(S(change.map((c) => (isNaN(c) ? NaN : Math.max(c, 0)))), 24));
  const down = A(ta.rma(S(change.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0)))), 24));
  const rsi = up.map((u, i) => (eq(down[i], 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / down[i])));

  // Ultimate oscillator: average(bp, tr_, length) = math.sum(bp, length) / math.sum(tr_, length)
  const highU = bars.map((b, i) => Math.max(b.high, prev(close, i))); // math.max(high, close[1]): na on bar 0
  const lowU = bars.map((b, i) => Math.min(b.low, prev(close, i)));
  const bp = S(close.map((c, i) => c - lowU[i]));
  const trU = S(highU.map((h, i) => h - lowU[i]));
  const average = (len: number) => {
    const s1 = A(math.sum(bp, len) as Series);
    const s2 = A(math.sum(trU, len) as Series);
    return s1.map((v, i) => v / s2[i]);
  };
  const avg7 = average(7);
  const avg14 = average(14);
  const avg28 = average(28);
  const out = avg7.map((v, i) => (100 * (4 * v + 2 * avg14[i] + avg28[i])) / 7);

  // CCI stochastic
  const cci = ta.cci(S(hlc3), 28);
  const stochK = ta.sma(ta.stoch(cci, cci, cci, 28), 3);
  const stochD = A(ta.sma(stochK, 3));

  // osc = math.avg(out, rsi)
  const osc = out.map((o, i) => (o + rsi[i]) / 2);

  // ADX + DI
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const plusDM = bars.map((_b, i) => {
    const u = i > 0 ? high[i] - high[i - 1] : NaN; // ta.change(high)
    const d = i > 0 ? -(low[i] - low[i - 1]) : NaN; // -ta.change(low)
    return isNaN(u) ? NaN : gt(u, d) && gt(u, 0) ? u : 0;
  });
  const minusDM = bars.map((_b, i) => {
    const u = i > 0 ? high[i] - high[i - 1] : NaN;
    const d = i > 0 ? -(low[i] - low[i - 1]) : NaN;
    return isNaN(d) ? NaN : gt(d, u) && gt(d, 0) ? d : 0;
  });
  const truerange = A(ta.rma(ta.tr(bars), 14));
  const rmaPlus = A(ta.rma(S(plusDM), 14));
  const rmaMinus = A(ta.rma(S(minusDM), 14));
  // fixnan(100 * ta.rma(dm, dilen) / truerange): a plain division (x / 0 is +-infinity, kept by fixnan; 0 / 0 is na)
  const fixnan = (x: number[]) => {
    let last = NaN;
    return x.map((v) => (isNaN(v) ? last : (last = v)));
  };
  const plus = fixnan(bars.map((_b, i) => (100 * rmaPlus[i]) / truerange[i]));
  const minus = fixnan(bars.map((_b, i) => (100 * rmaMinus[i]) / truerange[i]));
  // adx = 100 * ta.rma(math.abs(plus - minus) / (sum == 0 ? 1 : sum), adxlen)
  const dx = bars.map((_b, i) => {
    const sum = plus[i] + minus[i];
    return Math.abs(plus[i] - minus[i]) / (eq(sum, 0) ? 1 : sum);
  });
  const adx = A(ta.rma(S(dx), 14)).map((v) => 100 * v);

  // ZLMA: var a = 0.0, var b = 0.0; a := nz(lag * src + (1 - lag) * b[25] + a[1], src); b := ta.change(a, 50) / 50
  const length = 50;
  const lag = 1.4;
  const half = Math.trunc(length / 2);
  const za: number[] = new Array(n);
  const zb: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const src = osc[i];
    const bLag = i - half >= 0 ? zb[i - half] : NaN;
    const aPrev = i > 0 ? za[i - 1] : NaN;
    const x = lag * src + (1 - lag) * bLag + aPrev;
    za[i] = isNaN(x) ? src : x;
    zb[i] = (i - length >= 0 ? za[i] - za[i - length] : NaN) / length;
  }

  // Signals
  const ob = cfg.overboughtLevel;
  const os = cfg.oversoldLevel;
  const thr = cfg.adxThreshold;
  const midline = (ob + os) / 2.0;
  const mediaVolume = A(ta.sma(S(volume), cfg.volumeLength));
  const eccesso = mediaVolume.map((v) => v * cfg.volumeExcess);
  const bgColors: BgColorData[] = [];
  const buyBg = String(color.new('#ff0000', 75));
  const sellBg = String(color.new('#ffffff', 75));
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const sd = stochD[i];
    const oscPrev = prev(osc, i);
    const mvPrev = prev(mediaVolume, i);
    let buy = le(b.close, b.open)
      && (lt(sd, 20.0) ? gt(adx[i], 15.0) : ge(adx[i], thr))
      && lt(osc[i], oscPrev)
      && lt(osc[i], os)
      && lt(sd, midline)
      && ge(volume[i], mvPrev);
    buy = buy || (ge(volume[i], prev(eccesso, i)) && le(osc[i], oscPrev) && le(osc[i], 40.0));
    let sell = ge(b.close, b.open)
      && gt(adx[i], prev(adx, i))
      && (gt(sd, 90.0) ? gt(adx[i], 15.0) : ge(adx[i], thr))
      && ge(osc[i], oscPrev)
      && ge(osc[i], ob)
      && ge(sd, midline)
      && ge(volume[i], mvPrev);
    sell = sell || (ge(volume[i], mvPrev * 2.0) && ge(osc[i], oscPrev) && ge(osc[i], 60.0));
    buyFlags.push(buy);
    sellFlags.push(sell);
    // sfondo := buy ? red 75 : sfondo; sfondo := sell ? white 75 : sfondo
    const bg = sell ? sellBg : buy ? buyBg : null;
    if (bg) bgColors.push({ time: b.time, color: bg });
  }

  // Volume panel
  const highestVol = cfg.showVsa ? A(ta.highest(S(volume), 30)) : new Array<number>(n).fill(NaN);
  const candles: PlotCandleData[] = [];
  const wick = String(color.new(color.black, 100));
  if (cfg.showVsa) {
    for (let i = 0; i < n; i++) {
      const v = volume[i];
      const col = gt(v, prev(eccesso, i)) ? String(color.new(ROSSO, 0))
        : gt(v, prev(highestVol, i)) ? String(color.new(BIANCO, 0))
          : ge(v, prev(mediaVolume, i)) ? String(color.new(AZZURRO, 30)) : String(color.new(GRIGIO, 30));
      // plotcandle(0, volume, 0, volume): no candle when the volume is na
      if (!isNaN(v)) {
        candles.push({ time: bars[i].time, open: 0, high: v, low: 0, close: v, color: col, wickColor: wick, borderColor: wick });
      }
    }
  }

  const adxColor = (i: number) => {
    const t = gt(adx[i], prev(adx, i)) ? 25 : 75;
    return String(ge(adx[i], thr) ? (ge(plus[i], minus[i]) ? color.new('#ff0000', t) : color.new('#00ff00', t))
      : color.new('#4a4a4a', t));
  };
  const line = (f: (i: number) => number, c: (i: number) => string) =>
    bars.map((b, i) => ({ time: b.time, value: fin(f(i)), color: c(i) }));
  const k = (c: string) => () => c;

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      plot0: line((i) => zb[i], k('#ac0b00')),
      plot1: line((i) => osc[i], k(OSC_COLOR)),
      // plot(cci_ob ? overbought_level : na): cci_ob = stoch_cci_d >= overbought_level
      plot2: line((i) => (ge(stochD[i], ob) ? ob : NaN), k(OB_COLOR)),
      // plot(cci_os ? oversold_level : na): cci_os = stoch_cci_d < oversold_level
      plot3: line((i) => (lt(stochD[i], os) ? os : NaN), k(OS_COLOR)),
      plot4: line((i) => stochD[i], k(STOCH_COLOR)),
      plot5: line((i) => (cfg.showAdx ? adx[i] : NaN), adxColor),
      plot6: line((i) => (cfg.showVsa ? prev(highestVol, i) : NaN), k(HIGHEST_COLOR)),
      plot7: line((i) => (cfg.showVsa ? prev(mediaVolume, i) : NaN), k(String(color.new(AZZURRO, 0)))),
      plot8: line((i) => (cfg.showVsa ? prev(eccesso, i) : NaN), k(String(color.new(ROSSO, 0)))),
    },
    hlines: [
      { value: ob, options: { title: 'Overbought line', color: LEVEL_COLOR, linestyle: 'dotted' } },
      { value: os, options: { title: 'Overbought line', color: LEVEL_COLOR, linestyle: 'dotted' } },
      // hline(show_adx ? adx_threshold : na): no line when the ADX is hidden
      ...(cfg.showAdx ? [{ value: thr, options: { title: 'ADX threshold', color: LEVEL_COLOR, linestyle: 'dashed' as const } }] : []),
    ],
    bgColors,
    plotCandles: { volume: candles },
    // alertcondition(buy_signal, 'BUY') / alertcondition(sell_signal, 'SELL')
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY', message: '00_buy signal @ {{close}}' },
  { id: 'alert1', title: 'SELL', message: '00_sell signal @ {{close}}' },
];

export const GorgosHybridOscillatorStrategy = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
