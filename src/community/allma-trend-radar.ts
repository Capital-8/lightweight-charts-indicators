/**
 * AllMA Trend Radar
 *
 * A fast and a slow moving average of the close, each of one of 36 types (DEMA, TEMA, Hull, least squares, ALMA,
 * zero-lag EMA, FRAMA, KAMA, modular filter, Ehlers decycler, McGinley, VIDYA, ...). Buy / Sell triangles mark:
 * the fast MA crossing the slow MA (Up / Down), the fast MA above / below the slow MA (Greater / Less), and the close
 * crossing or being above / below the fast MA and the slow MA. Each signal type has a minimum number of bars between
 * two signals and optional RSI, money flow and stochastic filters. Hidden connector plots give the signals as
 * 1 / -1 / 0.
 *
 * Reference: "AllMA Trend Radar [trade_lexx]" by trade_lexx
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { taCore, math, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';

export const FAST_MA_TYPES = [
  'DEMA | Double Exponential MA', 'TEMA | Triple Exponential MA', 'HMA  | Hull MA', 'LSMA | Least Squares MA',
  'JMA  | Jurik MA', 'ALMA | Arnaud Legoux MA', 'ZLEMA | Zero-Lag Exponential MA', 'LMA  | Leo MA',
  'FRAMA | Fractal Adaptive MA', 'KAMA | Kaufman Adaptive MA', 'Modular Filter', 'ESD  | Ehlers Simple Decycler',
  'TMA  | Tillson MA', 'EMA  | Exponential MA', 'SMA  | Simple MA', 'WMA  | Weighted MA', 'TMA  | Triangular MA',
  'VWMA | Volume-Weighted MA', 'SMMA | Smoothed MA', 'Kijun', 'MD   | McGinley Dynamic', 'RMA  | Rolling MA',
  'VAMA | Volatility Adjusted MA', 'VAR  | Vector Autoregression MA', 'AHMA | Ahrens Moving Average',
  'EVWMA | Elastic Volume Weighted MA', 'SWMA | Sine Weighted MA', 'VIDYA | Variable Index Dynamic Average',
  'VMA  | Variable MA', 'GMMA | Geometric Mean MA', 'CMA  | Corrective MA', 'MM   | Moving Median',
  'QMA  | Quick MA', 'EIT  | Ehlers Instantaneous Trendline', 'AMA  | Adaptive MA', 'MMA  | Muller MA',
] as const;

export const SLOW_MA_TYPES = [
  'EMA  | Exponential MA', 'SMA  | Simple MA', 'WMA  | Weighted MA', 'TMA  | Triangular MA',
  'VWMA | Volume-Weighted MA', 'SMMA | Smoothed MA', 'Kijun', 'MD   | McGinley Dynamic', 'RMA  | Rolling MA',
  'VAMA | Volatility Adjusted MA', 'VAR  | Vector Autoregression MA', 'AHMA | Ahrens Moving Average',
  'EVWMA | Elastic Volume Weighted MA', 'SWMA | Sine Weighted MA', 'VIDYA | Variable Index Dynamic Average',
  'VMA  | Variable MA', 'GMMA | Geometric Mean MA', 'CMA  | Corrective MA', 'MM   | Moving Median',
  'QMA  | Quick MA', 'EIT  | Ehlers Instantaneous Trendline', 'AMA  | Adaptive MA', 'MMA  | Muller MA',
  'DEMA | Double Exponential MA', 'TEMA | Triple Exponential MA', 'HMA  | Hull MA', 'LSMA | Least Squares MA',
  'JMA  | Jurik MA', 'ALMA | Arnaud Legoux MA', 'ZLEMA | Zero-Lag Exponential MA', 'LMA  | Leo MA',
  'FRAMA | Fractal Adaptive MA', 'KAMA | Kaufman Adaptive MA', 'Modular Filter', 'ESD  | Ehlers Simple Decycler',
  'TMA  | Tillson MA',
] as const;

export type AllmaMaType = (typeof FAST_MA_TYPES)[number];

export interface AllmaTrendRadarInputs {
  maLengthFast: number;
  maTypeFast: AllmaMaType;
  maLengthSlow: number;
  maTypeSlow: AllmaMaType;
  /** Fast vs slow MA: crossover / crossunder signals */
  showUpDown: boolean;
  minBarsUpDown: number;
  /** Fast vs slow MA: fast above / below slow signals */
  showGreaterLess: boolean;
  minBarsGreaterLess: number;
  /** Close vs fast MA */
  showUpDownFast: boolean;
  minBarsUpDownFast: number;
  showGreaterLessFast: boolean;
  minBarsGreaterLessFast: number;
  /** Close vs slow MA */
  showUpDownSlow: boolean;
  minBarsUpDownSlow: number;
  showGreaterLessSlow: boolean;
  minBarsGreaterLessSlow: number;
  useRsiFilter: boolean;
  rsiLength: number;
  rsiOverboughtLower: number;
  rsiOverboughtUpper: number;
  rsiOversoldLower: number;
  rsiOversoldUpper: number;
  useMfiFilter: boolean;
  mfiLength: number;
  mfiOverboughtLower: number;
  mfiOverboughtUpper: number;
  mfiOversoldLower: number;
  mfiOversoldUpper: number;
  useStochFilter: boolean;
  stochKLength: number;
  stochDLength: number;
  stochSmooth: number;
  stochOverboughtLower: number;
  stochOverboughtUpper: number;
  stochOversoldLower: number;
  stochOversoldUpper: number;
}

export const defaultInputs: AllmaTrendRadarInputs = {
  maLengthFast: 14,
  maTypeFast: 'DEMA | Double Exponential MA',
  maLengthSlow: 14,
  maTypeSlow: 'SMA  | Simple MA',
  showUpDown: true,
  minBarsUpDown: 3,
  showGreaterLess: false,
  minBarsGreaterLess: 5,
  showUpDownFast: false,
  minBarsUpDownFast: 3,
  showGreaterLessFast: false,
  minBarsGreaterLessFast: 5,
  showUpDownSlow: false,
  minBarsUpDownSlow: 3,
  showGreaterLessSlow: false,
  minBarsGreaterLessSlow: 5,
  useRsiFilter: false,
  rsiLength: 14,
  rsiOverboughtLower: 70,
  rsiOverboughtUpper: 100,
  rsiOversoldLower: 1,
  rsiOversoldUpper: 30,
  useMfiFilter: false,
  mfiLength: 14,
  mfiOverboughtLower: 75,
  mfiOverboughtUpper: 100,
  mfiOversoldLower: 1,
  mfiOversoldUpper: 25,
  useStochFilter: false,
  stochKLength: 14,
  stochDLength: 3,
  stochSmooth: 3,
  stochOverboughtLower: 80,
  stochOverboughtUpper: 100,
  stochOversoldLower: 1,
  stochOversoldUpper: 20,
};

const level = (id: keyof AllmaTrendRadarInputs, title: string, defval: number): InputConfig =>
  ({ id, type: 'int', title, defval, min: 0, max: 100 });

export const inputConfig: InputConfig[] = [
  { id: 'maLengthFast', type: 'int', title: 'Fast MA Length', defval: 14, min: 2 },
  { id: 'maTypeFast', type: 'string', title: 'Type', defval: 'DEMA | Double Exponential MA', options: [...FAST_MA_TYPES] },
  { id: 'maLengthSlow', type: 'int', title: 'Slow MA Length', defval: 14, min: 2 },
  { id: 'maTypeSlow', type: 'string', title: 'Type', defval: 'SMA  | Simple MA', options: [...SLOW_MA_TYPES] },
  { id: 'showUpDown', type: 'bool', title: 'Up/Down Signal ⮕', defval: true },
  { id: 'minBarsUpDown', type: 'int', title: 'Min Bars', defval: 3, min: 0 },
  { id: 'showGreaterLess', type: 'bool', title: 'Greater/Less Signal ⮕', defval: false },
  { id: 'minBarsGreaterLess', type: 'int', title: 'Min Bars', defval: 5, min: 0 },
  { id: 'showUpDownFast', type: 'bool', title: 'Up/Down Signal ⮕', defval: false },
  { id: 'minBarsUpDownFast', type: 'int', title: 'Min Bars', defval: 3, min: 0 },
  { id: 'showGreaterLessFast', type: 'bool', title: 'Greater/Less Signal ⮕', defval: false },
  { id: 'minBarsGreaterLessFast', type: 'int', title: 'Min Bars', defval: 5, min: 0 },
  { id: 'showUpDownSlow', type: 'bool', title: 'Up/Down Signal ⮕', defval: false },
  { id: 'minBarsUpDownSlow', type: 'int', title: 'Min Bars', defval: 3, min: 0 },
  { id: 'showGreaterLessSlow', type: 'bool', title: 'Greater/Less Signal ⮕', defval: false },
  { id: 'minBarsGreaterLessSlow', type: 'int', title: 'Min Bars', defval: 5, min: 0 },
  { id: 'useRsiFilter', type: 'bool', title: 'RSI ⮕', defval: false },
  { id: 'rsiLength', type: 'int', title: 'Length', defval: 14, min: 1 },
  level('rsiOverboughtLower', '🪫 Sell ⮕ Above⬆', 70),
  level('rsiOverboughtUpper', 'Below⬇', 100),
  level('rsiOversoldLower', '🔋 Buy ⮕ Above⬆', 1),
  level('rsiOversoldUpper', 'Below⬇', 30),
  { id: 'useMfiFilter', type: 'bool', title: 'MFI ⮕', defval: false },
  { id: 'mfiLength', type: 'int', title: 'Length', defval: 14, min: 1 },
  level('mfiOverboughtLower', '🪫 Sell ⮕ Above⬆', 75),
  level('mfiOverboughtUpper', 'Below⬇', 100),
  level('mfiOversoldLower', '🔋 Buy ⮕ Above⬆', 1),
  level('mfiOversoldUpper', 'Below⬇', 25),
  { id: 'useStochFilter', type: 'bool', title: 'Stochastic ⮕', defval: false },
  { id: 'stochKLength', type: 'int', title: 'K Length', defval: 14, min: 1 },
  { id: 'stochDLength', type: 'int', title: 'D Length', defval: 3, min: 1 },
  { id: 'stochSmooth', type: 'int', title: 'Smooth', defval: 3, min: 1 },
  level('stochOverboughtLower', '🪫 Sell ⮕ Above⬆', 80),
  level('stochOverboughtUpper', 'Below⬇', 100),
  level('stochOversoldLower', '🔋 Buy ⮕ Above⬆', 1),
  level('stochOversoldUpper', 'Below⬇', 20),
];

const HIDDEN = String(color.new(color.white, 100));
const connector = (id: string, title: string): PlotConfig =>
  ({ id, title, color: HIDDEN, lineWidth: 1, display: 'none' });

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast MA', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'Slow MA', color: color.red, lineWidth: 1 },
  connector('plot2', '🔌Fast vs Slow Up/Down MA Signal🔌'),
  connector('plot3', '🔌Fast vs Slow Greater/Less MA Signal🔌'),
  connector('plot4', '🔌Slow Up/Down MA Signal🔌'),
  connector('plot5', '🔌Slow Greater/Less MA Signal🔌'),
  connector('plot6', '🔌Fast Up/Down MA Signal🔌'),
  connector('plot7', '🔌Fast Greater/Less MA Signal🔌'),
  connector('plot8', '🔌Combined Up/Down MA Signal🔌'),
  connector('plot9', '🔌Combined Greater/Less MA Signal🔌'),
  connector('plot10', '🔌Combined All MA Signals🔌'),
];

export const metadata = {
  title: 'AllMA Trend Radar [trade_lexx]',
  shortTitle: 'AllMA [trade_lexx]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** nz(): na and +-infinity give the replacement */
const nz = (x: number, y = 0) => (Number.isFinite(x) ? x : y);
const isNa = (x: number) => !Number.isFinite(x);
const A = (a: ArrayLike<number | null | undefined>) => Array.from(a, (v) => v ?? NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<AllmaTrendRadarInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);
  const hist = (a: number[], i: number, k: number) => (i - k >= 0 ? a[i - k] : NaN);

  // Fixed settings of the Pine script
  const almaOffset = 0.85;
  const almaSigma = 6;
  const kamaFastLength = 2;
  const kamaSlowLength = 30;
  const vamaVolLen = 51;
  const mfBeta = 0.8;
  const mfZ = 0.5;
  const mfFeedback = false;
  const eitAlpha = 0.07;

  // get_ma_out(type, close, len, ...): the type is fixed, so the taken branch runs on every bar
  const maOut = (type: string, len: number): number[] => {
    const src = close;
    const ema = (x: number[], l: number) => A(taCore.ema(x, l));
    const sma = (x: number[], l: number) => A(taCore.sma(x, l));
    const wma = (x: number[], l: number) => A(taCore.wma(x, l));
    const sum = (x: number[], l: number) => A(math.sum(x, l));
    const out: number[] = new Array(n).fill(NaN);
    switch (type) {
      case 'SMA  | Simple MA':
        return sma(src, len);
      case 'EMA  | Exponential MA':
        return ema(src, len);
      case 'DEMA | Double Exponential MA':
      case 'JMA  | Jurik MA': {
        const e = ema(src, len);
        const e2 = ema(e, len);
        return e.map((v, i) => 2 * v - e2[i]);
      }
      case 'TEMA | Triple Exponential MA': {
        const e = ema(src, len);
        const e2 = ema(e, len);
        const e3 = ema(e2, len);
        return e.map((v, i) => 3 * (v - e2[i]) + e3[i]);
      }
      case 'TMA  | Triangular MA':
        return sma(sma(src, Math.ceil(len / 2)), Math.floor(len / 2) + 1);
      case 'WMA  | Weighted MA':
        return wma(src, len);
      case 'VWMA | Volume-Weighted MA':
        return A(taCore.vwma(src, len, volume));
      case 'SMMA | Smoothed MA': {
        const w = wma(src, len);
        const s = sma(src, len);
        return src.map((v, i) => (isNa(hist(w, i, 1)) ? s[i] : (w[i - 1] * (len - 1) + v) / len));
      }
      case 'RMA  | Rolling MA':
        return A(taCore.rma(src, len));
      case 'HMA  | Hull MA': {
        const half = wma(src, len / 2);
        const full = wma(src, len);
        return wma(half.map((v, i) => 2 * v - full[i]), Math.round(Math.sqrt(len)));
      }
      case 'LSMA | Least Squares MA':
        return A(taCore.linreg(src, len, 0));
      case 'Kijun': {
        const lo = A(taCore.lowest(low, len));
        const hi = A(taCore.highest(high, len));
        return lo.map((v, i) => (v + hi[i]) / 2);
      }
      case 'MD   | McGinley Dynamic': {
        const e = ema(src, len);
        for (let i = 0; i < n; i++) {
          const prev = hist(out, i, 1);
          out[i] = isNa(prev) ? e[i] : prev + (src[i] - prev) / (len * Math.pow(src[i] / prev, 4));
        }
        return out;
      }
      case 'ALMA | Arnaud Legoux MA':
        return A(taCore.alma(src, len, almaOffset, almaSigma));
      case 'VAR  | Vector Autoregression MA': {
        const valpha = 2 / (len + 1);
        const vud1 = src.map((v, i) => (gt(v, hist(src, i, 1)) ? v - src[i - 1] : 0));
        const vdd1 = src.map((v, i) => (lt(v, hist(src, i, 1)) ? src[i - 1] - v : 0));
        const vUD = sum(vud1, 9);
        const vDD = sum(vdd1, 9);
        for (let i = 0; i < n; i++) {
          const vCMO = nz((vUD[i] - vDD[i]) / (vUD[i] + vDD[i]));
          out[i] = nz(valpha * Math.abs(vCMO) * src[i]) + (1 - valpha * Math.abs(vCMO)) * nz(hist(out, i, 1));
        }
        return out;
      }
      case 'ZLEMA | Zero-Lag Exponential MA': {
        // xLag = len / 2 (fractional for an odd length): the history index is truncated
        const xLag = Math.trunc(len / 2);
        return ema(src.map((v, i) => v + (v - hist(src, i, xLag))), len);
      }
      case 'AHMA | Ahrens Moving Average':
        for (let i = 0; i < n; i++) {
          const p = nz(hist(out, i, 1));
          out[i] = p + (src[i] - (p + nz(hist(out, i, len))) / 2) / len;
        }
        return out;
      case 'EVWMA | Elastic Volume Weighted MA': {
        const vs = sum(volume, len);
        for (let i = 0; i < n; i++) {
          out[i] = ((vs[i] - volume[i]) * nz(hist(out, i, 1)) + volume[i] * src[i]) / vs[i];
        }
        return out;
      }
      case 'SWMA | Sine Weighted MA':
        for (let i = 0; i < n; i++) {
          let s = 0.0;
          let weightSum = 0.0;
          for (let j = 0; j <= len - 1; j++) {
            const weight = Math.sin((j * Math.PI) / (len + 1));
            s = s + nz(hist(src, i, j)) * weight;
            weightSum = weightSum + weight;
          }
          out[i] = s / weightSum;
        }
        return out;
      case 'LMA  | Leo MA': {
        const w = wma(src, len);
        const s = sma(src, len);
        return w.map((v, i) => 2 * v - s[i]);
      }
      case 'VIDYA | Variable Index Dynamic Average': {
        const mom = A(taCore.change(src));
        const upSum = sum(mom.map((m) => Math.max(m, 0)), len);
        const downSum = sum(mom.map((m) => -Math.min(m, 0)), len);
        const alpha = 2 / (len + 1);
        for (let i = 0; i < n; i++) {
          const cmo = Math.abs((upSum[i] - downSum[i]) / (upSum[i] + downSum[i]));
          out[i] = src[i] * alpha * cmo + nz(hist(out, i, 1)) * (1 - alpha * cmo);
        }
        return out;
      }
      case 'FRAMA | Fractal Adaptive MA': {
        const length2 = Math.floor(len / 2);
        const hh2 = A(taCore.highest(high, length2));
        const ll2 = A(taCore.lowest(low, length2));
        const hh = A(taCore.highest(high, len));
        const ll = A(taCore.lowest(low, len));
        for (let i = 0; i < n; i++) {
          const N1 = (hh2[i] - ll2[i]) / length2;
          const N2 = (hist(hh2, i, length2) - hist(ll2, i, length2)) / length2;
          const N3 = (hh[i] - ll[i]) / len;
          const D = (Math.log(N1 + N2) - Math.log(N3)) / Math.log(2);
          const factor = Math.exp(-4.6 * (D - 1));
          out[i] = factor * src[i] + (1 - factor) * nz(hist(out, i, 1));
        }
        return out;
      }
      case 'VMA  | Variable MA': {
        const k = 1.0 / len;
        const pdmS: number[] = new Array(n).fill(NaN);
        const mdmS: number[] = new Array(n).fill(NaN);
        const pdiS: number[] = new Array(n).fill(NaN);
        const mdiS: number[] = new Array(n).fill(NaN);
        const iS: number[] = new Array(n).fill(NaN);
        for (let i = 0; i < n; i++) {
          const pdm = Math.max(src[i] - hist(src, i, 1), 0);
          const mdm = Math.max(hist(src, i, 1) - src[i], 0);
          pdmS[i] = (1 - k) * nz(hist(pdmS, i, 1)) + k * pdm;
          mdmS[i] = (1 - k) * nz(hist(mdmS, i, 1)) + k * mdm;
          const s = pdmS[i] + mdmS[i];
          const pdi = pdmS[i] / s;
          const mdi = mdmS[i] / s;
          pdiS[i] = (1 - k) * nz(hist(pdiS, i, 1)) + k * pdi;
          mdiS[i] = (1 - k) * nz(hist(mdiS, i, 1)) + k * mdi;
          const d = Math.abs(pdiS[i] - mdiS[i]);
          const s1 = pdiS[i] + mdiS[i];
          iS[i] = (1 - k) * nz(hist(iS, i, 1)) + (k * d) / s1;
        }
        const hhv = A(taCore.highest(iS, len));
        const llv = A(taCore.lowest(iS, len));
        for (let i = 0; i < n; i++) {
          const vI = (iS[i] - llv[i]) / (hhv[i] - llv[i]);
          out[i] = (1 - k * vI) * nz(hist(out, i, 1)) + k * vI * src[i];
        }
        return out;
      }
      case 'GMMA | Geometric Mean MA': {
        const smean = sum(src.map((v) => Math.log(v)), len);
        return smean.map((v) => Math.exp(v / len));
      }
      case 'CMA  | Corrective MA': {
        const s = sma(src, len);
        const v1s = A(taCore.variance(src, len));
        const tolerance = Math.pow(10, -5);
        for (let i = 0; i < n; i++) {
          const prev = hist(out, i, 1);
          const v1 = v1s[i];
          const v2 = Math.pow(nz(prev, s[i]) - s[i], 2);
          const v3 = eq(v1, 0) || eq(v2, 0) ? 1 : v2 / (v1 + v2);
          let err = 1;
          let kPrev = 1;
          let k = 1;
          for (let j = 0; j <= 5000; j++) {
            if (gt(err, tolerance)) {
              k = v3 * kPrev * (2 - kPrev);
              err = kPrev - k;
              kPrev = k;
            }
          }
          out[i] = nz(prev, src[i]) + k * (s[i] - nz(prev, src[i]));
        }
        return out;
      }
      case 'MM   | Moving Median':
        return A(taCore.percentile_nearest_rank(src, len, 50));
      case 'QMA  | Quick MA': {
        const peak = len / 3;
        for (let i = 0; i < n; i++) {
          let num = 0.0;
          let denom = 0.0;
          for (let j = 1; j <= len + 1; j++) {
            const mult = le(j, peak) ? j / peak : (len + 1 - j) / (len + 1 - peak);
            num = num + hist(src, i, j - 1) * mult;
            denom = denom + mult;
          }
          out[i] = !eq(denom, 0.0) ? num / denom : src[i];
        }
        return out;
      }
      case 'KAMA | Kaufman Adaptive MA': {
        const mom = A(taCore.change(src, len)).map((v) => Math.abs(v));
        const volatility = sum(A(taCore.change(src)).map((v) => Math.abs(v)), len);
        const fastAlpha = 2 / (kamaFastLength + 1);
        const slowAlpha = 2 / (kamaSlowLength + 1);
        for (let i = 0; i < n; i++) {
          // volatility != 0 is false when volatility is na
          const er = !isNaN(volatility[i]) && !eq(volatility[i], 0) ? mom[i] / volatility[i] : 0;
          const alpha = Math.pow(er * (fastAlpha - slowAlpha) + slowAlpha, 2);
          out[i] = alpha * src[i] + (1 - alpha) * nz(hist(out, i, 1), src[i]);
        }
        return out;
      }
      case 'VAMA | Volatility Adjusted MA': {
        const mid = ema(src, len);
        const dev = src.map((v, i) => v - mid[i]);
        const volUp = A(taCore.highest(dev, vamaVolLen));
        const volDown = A(taCore.lowest(dev, vamaVolLen));
        return mid.map((m, i) => m + (volUp[i] + volDown[i]) / 2);
      }
      case 'Modular Filter': {
        const alpha = 2 / (len + 1);
        const b: number[] = new Array(n).fill(NaN);
        const c: number[] = new Array(n).fill(NaN);
        const os: number[] = new Array(n).fill(NaN);
        for (let i = 0; i < n; i++) {
          const a = mfFeedback ? mfZ * src[i] + (1 - mfZ) * nz(hist(out, i, 1), src[i]) : src[i];
          const tb = alpha * a + (1 - alpha) * nz(hist(b, i, 1), a);
          b[i] = gt(a, tb) ? a : tb;
          const tc = alpha * a + (1 - alpha) * nz(hist(c, i, 1), a);
          c[i] = lt(a, tc) ? a : tc;
          os[i] = eq(a, b[i]) ? 1 : eq(a, c[i]) ? 0 : hist(os, i, 1);
          const upper = mfBeta * b[i] + (1 - mfBeta) * c[i];
          const lower = mfBeta * c[i] + (1 - mfBeta) * b[i];
          out[i] = os[i] * upper + (1 - os[i]) * lower;
        }
        return out;
      }
      case 'EIT  | Ehlers Instantaneous Trendline':
        for (let i = 0; i < n; i++) {
          const s1 = nz(hist(src, i, 1));
          const s2 = nz(hist(src, i, 2));
          // bar_index < 7: the bar index of the first bars of the data
          out[i] = i < 7
            ? (src[i] + 2 * s1 + s2) / 4
            : (eitAlpha - Math.pow(eitAlpha, 2) / 4) * src[i] + 0.5 * Math.pow(eitAlpha, 2) * s1
              - (eitAlpha - 0.75 * Math.pow(eitAlpha, 2)) * s2 + 2 * (1 - eitAlpha) * nz(hist(out, i, 1))
              - Math.pow(1 - eitAlpha, 2) * nz(hist(out, i, 2));
        }
        return out;
      case 'ESD  | Ehlers Simple Decycler': {
        const alphaArg = (2 * Math.PI) / (len * Math.sqrt(2));
        const hp: number[] = new Array(n).fill(NaN);
        let alpha = NaN;
        for (let i = 0; i < n; i++) {
          alpha = !eq(Math.cos(alphaArg), 0)
            ? (Math.cos(alphaArg) + Math.sin(alphaArg) - 1) / Math.cos(alphaArg)
            : nz(alpha);
          hp[i] = Math.pow(1 - alpha / 2, 2) * (src[i] - 2 * nz(hist(src, i, 1)) + nz(hist(src, i, 2)))
            + 2 * (1 - alpha) * nz(hist(hp, i, 1)) - Math.pow(1 - alpha, 2) * nz(hist(hp, i, 2));
          out[i] = src[i] - hp[i];
        }
        return out;
      }
      case 'AMA  | Adaptive MA': {
        const fastSc = 2 / (len / 2 + 1);
        const slowSc = 2 / (len * 2 + 1);
        const ch = A(taCore.change(src));
        for (let i = 0; i < n; i++) {
          const k = Math.pow(ch[i], 2);
          const alpha = fastSc * k + slowSc * (1 - k);
          out[i] = alpha * src[i] + (1 - alpha) * nz(hist(out, i, 1), src[i]);
        }
        return out;
      }
      case 'TMA  | Tillson MA': {
        const c = 0.7;
        for (let i = 0; i < n; i++) out[i] = c * src[i] + (1 - c) * nz(hist(out, i, 1), src[i]);
        return out;
      }
      case 'MMA  | Muller MA': {
        const alpha = 2 / (len + 1);
        for (let i = 0; i < n; i++) out[i] = alpha * src[i] + (1 - alpha) * nz(hist(out, i, 1), src[i]);
        return out;
      }
      default:
        return new Array(n).fill(0.0);
    }
  };

  const maFast = maOut(cfg.maTypeFast, cfg.maLengthFast);
  const maSlow = maOut(cfg.maTypeSlow, cfg.maLengthSlow);

  // Filters
  const rsi = A(taCore.rsi(close, cfg.rsiLength));
  const typical = bars.map((b) => (b.high + b.low + b.close) / 3);
  const posFlow = A(math.sum(typical.map((t, i) => volume[i] * t * (gt(t, hist(typical, i, 1)) ? 1 : 0)), cfg.mfiLength));
  const negFlow = A(math.sum(typical.map((t, i) => volume[i] * t * (lt(t, hist(typical, i, 1)) ? 1 : 0)), cfg.mfiLength));
  const mfi = posFlow.map((p, i) => 100 - 100 / (1 + p / Math.max(negFlow[i], 0.000001)));
  const stochK = A(taCore.sma(A(taCore.stoch(close, high, low, cfg.stochKLength)), cfg.stochSmooth));
  const inRange = (x: number, lo: number, hi: number) => ge(x, lo) && le(x, hi);
  const buyFilter = (signal: boolean, i: number) => signal
    && (!cfg.useRsiFilter || inRange(rsi[i], cfg.rsiOversoldLower, cfg.rsiOversoldUpper))
    && (!cfg.useMfiFilter || inRange(mfi[i], cfg.mfiOversoldLower, cfg.mfiOversoldUpper))
    && (!cfg.useStochFilter || inRange(stochK[i], cfg.stochOversoldLower, cfg.stochOversoldUpper));
  const sellFilter = (signal: boolean, i: number) => signal
    && (!cfg.useRsiFilter || inRange(rsi[i], cfg.rsiOverboughtLower, cfg.rsiOverboughtUpper))
    && (!cfg.useMfiFilter || inRange(mfi[i], cfg.mfiOverboughtLower, cfg.mfiOverboughtUpper))
    && (!cfg.useStochFilter || inRange(stochK[i], cfg.stochOverboughtLower, cfg.stochOverboughtUpper));

  // ta.crossover / ta.crossunder compare exactly, with the last bar where both values were not na
  const crossUp = A(taCore.crossover(maFast, maSlow).map(Number));
  const crossDown = A(taCore.crossunder(maFast, maSlow).map(Number));
  const crossUpFast = A(taCore.crossover(close, maFast).map(Number));
  const crossDownFast = A(taCore.crossunder(close, maFast).map(Number));
  const crossUpSlow = A(taCore.crossover(close, maSlow).map(Number));
  const crossDownSlow = A(taCore.crossunder(close, maSlow).map(Number));

  // A pair of signals with a minimum number of bars since the last signal of either side
  const pair = () => {
    let lastA = NaN;
    let lastB = NaN;
    return (i: number, condA: boolean, condB: boolean, minBars: number): [boolean, boolean] => {
      const okA = isNaN(lastA) || i - lastA >= minBars;
      const okB = isNaN(lastB) || i - lastB >= minBars;
      const sigA = buyFilter(condA && okA && okB, i);
      const sigB = sellFilter(condB && okB && okA, i);
      if (sigA) lastA = i;
      if (sigB) lastB = i;
      return [sigA, sigB];
    };
  };
  const greaterLess = pair();
  const upDown = pair();
  const greaterLessFast = pair();
  const upDownFast = pair();
  const greaterLessSlow = pair();
  const upDownSlow = pair();

  const markers: MarkerData[] = [];
  // id: the plotshape of the original (shape0 .. shape11 in declaration order)
  const buy = (i: number, id: string) => markers.push({ id, time: bars[i].time, position: 'belowBar', shape: 'triangleUp',
    color: color.green, text: 'Buy', textColor: color.blue });
  const sell = (i: number, id: string) => markers.push({ id, time: bars[i].time, position: 'aboveBar', shape: 'triangleDown',
    color: color.red, text: 'Sell', textColor: color.blue });

  const conn: number[][] = Array.from({ length: 9 }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const [greater, less] = greaterLess(i, gt(maFast[i], maSlow[i]), lt(maFast[i], maSlow[i]), cfg.minBarsGreaterLess);
    if (cfg.showGreaterLess && greater) buy(i, 'shape0');
    if (cfg.showGreaterLess && less) sell(i, 'shape1');
    const [up, down] = upDown(i, crossUp[i] === 1, crossDown[i] === 1, cfg.minBarsUpDown);
    if (cfg.showUpDown && up) buy(i, 'shape2');
    if (cfg.showUpDown && down) sell(i, 'shape3');
    const [greaterFast, lessFast] = greaterLessFast(i, gt(close[i], maFast[i]), lt(close[i], maFast[i]),
      cfg.minBarsGreaterLessFast);
    if (cfg.showGreaterLessFast && greaterFast) buy(i, 'shape4');
    if (cfg.showGreaterLessFast && lessFast) sell(i, 'shape5');
    const [upFast, downFast] = upDownFast(i, crossUpFast[i] === 1, crossDownFast[i] === 1, cfg.minBarsUpDownFast);
    if (cfg.showUpDownFast && upFast) buy(i, 'shape6');
    if (cfg.showUpDownFast && downFast) sell(i, 'shape7');
    const [greaterSlow, lessSlow] = greaterLessSlow(i, gt(close[i], maSlow[i]), lt(close[i], maSlow[i]),
      cfg.minBarsGreaterLessSlow);
    if (cfg.showGreaterLessSlow && greaterSlow) buy(i, 'shape8');
    if (cfg.showGreaterLessSlow && lessSlow) sell(i, 'shape9');
    const [upSlow, downSlow] = upDownSlow(i, crossUpSlow[i] === 1, crossDownSlow[i] === 1, cfg.minBarsUpDownSlow);
    if (cfg.showUpDownSlow && upSlow) buy(i, 'shape10');
    if (cfg.showUpDownSlow && downSlow) sell(i, 'shape11');

    const sig = (a: boolean, b: boolean) => (a ? 1 : b ? -1 : 0);
    const u = cfg.showUpDown && up;
    const d = cfg.showUpDown && down;
    const g = cfg.showGreaterLess && greater;
    const l = cfg.showGreaterLess && less;
    const us = cfg.showUpDownSlow && upSlow;
    const ds = cfg.showUpDownSlow && downSlow;
    const gs = cfg.showGreaterLessSlow && greaterSlow;
    const ls = cfg.showGreaterLessSlow && lessSlow;
    const uf = cfg.showUpDownFast && upFast;
    const df = cfg.showUpDownFast && downFast;
    const gf = cfg.showGreaterLessFast && greaterFast;
    const lf = cfg.showGreaterLessFast && lessFast;
    conn[0][i] = sig(u, d);
    conn[1][i] = sig(g, l);
    conn[2][i] = sig(us, ds);
    conn[3][i] = sig(gs, ls);
    conn[4][i] = sig(uf, df);
    conn[5][i] = sig(gf, lf);
    conn[6][i] = sig(u || uf || us, d || df || ds);
    conn[7][i] = sig(g || gf || gs, l || lf || ls);
    conn[8][i] = sig(u || uf || us || g || gf || gs, d || df || ds || l || lf || ls);
  }

  const line = (a: number[]) => bars.map((b, i) => ({ time: b.time, value: Number.isFinite(a[i]) ? a[i] : NaN }));
  const plots: IndicatorResult['plots'] = { plot0: line(maFast), plot1: line(maSlow) };
  conn.forEach((c, k) => {
    plots[`plot${k + 2}`] = line(c);
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
  };
}

export const AllmaTrendRadar = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
