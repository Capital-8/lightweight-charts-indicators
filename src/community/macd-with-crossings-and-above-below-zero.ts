/**
 * MACD With Crossings and Above Below Zero
 *
 * MACD (fast MA - slow MA, EMA or SMA) with a signal line (EMA or SMA) and a histogram coloured by its sign and
 * direction. The MACD and signal lines change colour at zero; the one-bar change of the MACD is drawn as a
 * "derivative" line. Triangles mark the MACD / signal crossings (small triangles for crossings on the "expected"
 * side of zero, bigger ones on the other side). Arrows show which DMI line (+DI / -DI) is above. The background is
 * coloured by ADX levels (12.5 / 25 / 50 / 75). An RSI scaled to 0..1 is drawn with bands at 0.3 and 0.7.
 *
 * Reference: "MACD With Crossings and Above Below Zero" by Kgroomes
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';

export interface MacdWithCrossingsAndAboveBelowZeroInputs {
  fastLength: number;
  slowLength: number;
  src: SourceType;
  /** Signal line length */
  signalLength: number;
  /** SMA instead of EMA for the fast and slow MAs */
  smaSource: boolean;
  /** SMA instead of EMA for the signal line */
  smaSignal: boolean;
  /** ADX smoothing (also the DI length used by the script) */
  adxLen: number;
  /** DI length (not used by the original computation, which uses the ADX smoothing) */
  diLen: number;
  /** RSI length */
  rsiLen: number;
  /** RSI source */
  rsiSrc: SourceType;
}

export const defaultInputs: MacdWithCrossingsAndAboveBelowZeroInputs = {
  fastLength: 12,
  slowLength: 26,
  src: 'close',
  signalLength: 9,
  smaSource: false,
  smaSignal: false,
  adxLen: 14,
  diLen: 14,
  rsiLen: 14,
  rsiSrc: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1, max: 50 },
  { id: 'smaSource', type: 'bool', title: 'Simple MA(Oscillator)', defval: false },
  { id: 'smaSignal', type: 'bool', title: 'Simple MA(Signal Line)', defval: false },
  { id: 'adxLen', type: 'int', title: 'ADX Smoothing', defval: 14 },
  { id: 'diLen', type: 'int', title: 'DI Length', defval: 14 },
  { id: 'rsiLen', type: 'int', title: 'Length', defval: 14, min: 1 },
  { id: 'rsiSrc', type: 'source', title: 'Source', defval: 'close' },
];

const COL_GROW_ABOVE = '#26A69A';
const COL_GROW_BELOW = '#FFCDD2';
const COL_FALL_ABOVE = '#B2DFDB';
const COL_FALL_BELOW = '#EF5350';
const DERIV_COLOR = String(color.new('#ffff00', 50));
const RSI_COLOR = String(color.new(color.yellow, 0));
const RED = String(color.new(color.red, 0));
const GREEN = String(color.new(color.green, 0));
const BAND_COLOR = '#C0C0C0';
const BAND_FILL = String(color.new('#9915FF', 90));
// ADX background colours
const BG_75 = String(color.rgb(255, 235, 59, 60));
const BG_50 = String(color.rgb(255, 153, 0, 50));
const BG_25 = String(color.rgb(255, 82, 82, 80));
const BG_12 = String(color.rgb(33, 150, 243, 80));
const BG_LOW = String(color.rgb(33, 150, 243, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ADX', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Histogram', color: COL_GROW_ABOVE, lineWidth: 1, style: 'columns' },
  { id: 'plot2', title: 'MACD', color: '#00f0ff', lineWidth: 1 },
  { id: 'plot3', title: 'Signal', color: '#ff6a00', lineWidth: 1 },
  { id: 'plot4', title: 'MACD Derivative', color: DERIV_COLOR, lineWidth: 1 },
  { id: 'plot5', title: 'RSI', color: RSI_COLOR, lineWidth: 1 },
];

/** hline(.70, 'Upper Band') / hline(.30, 'Lower Band'), dashed (Pine default) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 0.7, title: 'Upper Band', color: BAND_COLOR, linestyle: 'dashed' },
  { id: 'hline_lower', price: 0.3, title: 'Lower Band', color: BAND_COLOR, linestyle: 'dashed' },
];

/** fill(rsi_band1, rsi_band0, color = color.new(#9915FF, 90), title = 'Background') */
export const fillConfig: FillConfig[] = [
  { id: 'fill_bands', plot1: 'hline_upper', plot2: 'hline_lower', color: BAND_FILL, title: 'Background' },
];

export const metadata = {
  title: 'MACD With Crossings and Above Below Zero',
  shortTitle: 'MACD Xs & 0',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** Plots show na for na and +-infinity */
const fin = (x: number) => (Number.isFinite(x) ? x : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdWithCrossingsAndAboveBelowZeroInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const t = (i: number) => bars[i].time;

  // MACD (the inputs choose the MA on every bar, so each ta call runs on all bars or on none)
  const src = getSourceSeries(bars, cfg.src);
  const fastMa = A(cfg.smaSource ? ta.sma(src, cfg.fastLength) : ta.ema(src, cfg.fastLength));
  const slowMa = A(cfg.smaSource ? ta.sma(src, cfg.slowLength) : ta.ema(src, cfg.slowLength));
  const macd = bars.map((_b, i) => fastMa[i] - slowMa[i]);
  const signal = A(cfg.smaSignal ? ta.sma(S(macd), cfg.signalLength) : ta.ema(S(macd), cfg.signalLength));
  const hist = bars.map((_b, i) => macd[i] - signal[i]);

  // dirmov(len): the original uses adxlen for every rma (len is not used)
  const adxLen = cfg.adxLen;
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const plusDM = bars.map((_b, i) => {
    const up = i > 0 ? high[i] - high[i - 1] : NaN; // ta.change(high)
    const down = i > 0 ? -(low[i] - low[i - 1]) : NaN; // -ta.change(low)
    return isNaN(up) ? NaN : gt(up, down) && gt(up, 0) ? up : 0;
  });
  const minusDM = bars.map((_b, i) => {
    const up = i > 0 ? high[i] - high[i - 1] : NaN;
    const down = i > 0 ? -(low[i] - low[i - 1]) : NaN;
    return isNaN(down) ? NaN : gt(down, up) && gt(down, 0) ? down : 0;
  });
  const truerange = A(ta.rma(ta.tr(bars), adxLen));
  const rmaPlus = A(ta.rma(S(plusDM), adxLen));
  const rmaMinus = A(ta.rma(S(minusDM), adxLen));
  // fixnan(100 * ta.rma(dm, adxlen) / truerange): a plain division (x / 0 is +-infinity, kept by fixnan; 0 / 0 is na)
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
  const rmaDx = A(ta.rma(S(dx), adxLen));
  const sig = rmaDx.map((v) => 100 * v);

  // RSI scaled to 0..1
  const rsiSrc = getSourceSeries(bars, cfg.rsiSrc).toArray().map((v) => v ?? NaN);
  const chg = rsiSrc.map((v, i) => (i > 0 ? v - rsiSrc[i - 1] : NaN));
  const rsiUp = A(ta.rma(S(chg.map((c) => Math.max(c, 0))), cfg.rsiLen));
  const rsiDown = A(ta.rma(S(chg.map((c) => -Math.min(c, 0))), cfg.rsiLen));
  const rsi = bars.map((_b, i) => {
    const d = rsiDown[i];
    const u = rsiUp[i];
    return (eq(d, 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / d)) / 100;
  });

  // Crossings: ta.crossover / ta.crossunder(signal, macd) (exact comparisons)
  const xover = A(ta.crossover(S(signal), S(macd)));
  const xunder = A(ta.crossunder(S(signal), S(macd)));

  const plot0 = bars.map((b, i) => ({ time: b.time, value: fin(sig[i]) }));
  const plot1 = bars.map((b, i) => {
    const h = hist[i];
    const grow = i > 0 && lt(hist[i - 1], h); // hist[1] < hist
    const c = ge(h, 0) ? (grow ? COL_GROW_ABOVE : COL_FALL_ABOVE) : grow ? COL_GROW_BELOW : COL_FALL_BELOW;
    return { time: b.time, value: fin(h), color: c };
  });
  const plot2 = bars.map((b, i) => ({ time: b.time, value: fin(macd[i]), color: le(macd[i], 0) ? '#00477d' : '#00f0ff' }));
  const plot3 = bars.map((b, i) => ({ time: b.time, value: fin(signal[i]), color: le(signal[i], 0) ? '#ff2600' : '#ff6a00' }));
  // plot(ta.change(macd))
  const plot4 = bars.map((b, i) => ({ time: b.time, value: fin(i > 0 ? macd[i] - macd[i - 1] : NaN), color: DERIV_COLOR }));
  const plot5 = bars.map((b, i) => ({ time: b.time, value: fin(rsi[i]), color: RSI_COLOR }));

  // bgcolor(bcol): ADX levels
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const s = sig[i];
    const c = ge(s, 75) ? BG_75 : ge(s, 50) ? BG_50 : ge(s, 25) ? BG_25 : ge(s, 12.5) ? BG_12 : lt(s, 12.5) ? BG_LOW : null;
    if (c) bgColors.push({ time: t(i), color: c });
  }

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const over = xover[i] === 1;
    const under = xunder[i] === 1;
    // xUp = macd > 0 ? crossover : false -> 'MACD X Up': triangle down, top, tiny, red
    if (gt(macd[i], 0) && over) markers.push({ time: t(i), id: 'shape0', position: 'top', shape: 'triangleDown', color: RED, size: 'tiny' });
    // xDn = macd < 0 ? crossunder : false -> 'MACD X Dn': triangle up, bottom, tiny, green
    if (lt(macd[i], 0) && under) markers.push({ time: t(i), id: 'shape1', position: 'bottom', shape: 'triangleUp', color: GREEN, size: 'tiny' });
    // xDnHigh = macd >= 0 ? crossunder : false -> 'Big MACD X Up': triangle up, bottom, small, green
    if (ge(macd[i], 0) && under) markers.push({ time: t(i), id: 'shape2', position: 'bottom', shape: 'triangleUp', color: GREEN, size: 'small' });
    // xUpLow = macd <= 0 ? crossover : false -> 'Big MACD X Dn': triangle down, top, small, red
    if (le(macd[i], 0) && over) markers.push({ time: t(i), id: 'shape3', position: 'top', shape: 'triangleDown', color: RED, size: 'small' });
    // 'DMI+': plusDM > minusDM, arrow up, bottom, size.auto, green; 'DMI-': plusDM < minusDM, arrow down, top, red
    if (gt(plus[i], minus[i])) markers.push({ time: t(i), id: 'shape4', position: 'bottom', shape: 'arrowUp', color: GREEN, size: 'auto' });
    if (lt(plus[i], minus[i])) markers.push({ time: t(i), id: 'shape5', position: 'top', shape: 'arrowDown', color: RED, size: 'auto' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5 },
    hlines: [
      { value: 0.7, options: { title: 'Upper Band', color: BAND_COLOR, linestyle: 'dashed' } },
      { value: 0.3, options: { title: 'Lower Band', color: BAND_COLOR, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_upper', plot2: 'hline_lower', options: { title: 'Background' }, colors: new Array<string>(n).fill(BAND_FILL) },
    ],
    markers,
    bgColors,
  };
}

export const MacdWithCrossingsAndAboveBelowZero = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
};
