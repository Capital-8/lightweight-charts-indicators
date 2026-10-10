/**
 * SSL Hybrid
 *
 * A baseline moving average with a channel of its smoothed range, coloured by the close position (above the
 * channel, below it, or inside); an SSL line made of the baseline averages of the high and the low (the side
 * switches when the close gets beyond them); a second, faster SSL line (circles) coloured when the close continues
 * beyond the baseline within an ATR distance; exit arrows when the close crosses a third SSL line; white diamonds on
 * candles larger than one ATR near the baseline; optional ATR bands. The transparency of the colours grows with the
 * percentile rank of the ATR (risk gradient). A table on the last bar gives the risk level, the distance of the
 * close from the baseline in ATR, the volatility percentile and the ATR.
 *
 * Reference: "SSL Hybrid" by Mihkel00
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, str, math, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData, BarColorData, TableData, TableCellData } from '../types';

type DisplayMode = 'Baseline Only' | 'Baseline + SSL' | 'SSL Only' | 'Entry/Exit Only' | 'Full Display';
type MaType =
  | 'SMA' | 'EMA' | 'DEMA' | 'TEMA' | 'LSMA' | 'WMA' | 'MF' | 'VAMA' | 'TMA' | 'HMA' | 'JMA' | 'Kijun v2' | 'EDSMA' | 'McGinley';

export interface SslHybridInputs {
  displayMode: DisplayMode;
  colorBars: boolean;
  /** Show Signal Diamonds: candle larger than 1 ATR within the baseline range */
  showSignals: boolean;
  showRiskTable: boolean;
  bullishColor: string;
  bearishColor: string;
  maType: MaType;
  len: number;
  src: SourceType;
  showBaselineChannel: boolean;
  multy: number;
  useTrueRange: boolean;
  ssl2Type: MaType;
  len2: number;
  atrCrit: number;
  ssl3Type: MaType;
  len3: number;
  atrLen: number;
  mult: number;
  smoothing: 'RMA' | 'SMA' | 'EMA' | 'WMA';
  showAtrBands: boolean;
  riskLookback: number;
  riskSensitivity: number;
  enableRiskGradient: boolean;
  jurikPhase: number;
  jurikPower: number;
  kidiv: number;
  volatilityLookback: number;
  beta: number;
  feedback: boolean;
  z: number;
  ssfLength: number;
  ssfPoles: number;
}

export const defaultInputs: SslHybridInputs = {
  displayMode: 'Full Display',
  colorBars: true,
  showSignals: true,
  showRiskTable: true,
  bullishColor: '#00c3ff',
  bearishColor: '#ff0062',
  maType: 'HMA',
  len: 60,
  src: 'close',
  showBaselineChannel: true,
  multy: 0.2,
  useTrueRange: true,
  ssl2Type: 'JMA',
  len2: 5,
  atrCrit: 0.9,
  ssl3Type: 'HMA',
  len3: 15,
  atrLen: 14,
  mult: 1.0,
  smoothing: 'WMA',
  showAtrBands: false,
  riskLookback: 100,
  riskSensitivity: 2,
  enableRiskGradient: true,
  jurikPhase: 3,
  jurikPower: 1,
  kidiv: 1,
  volatilityLookback: 10,
  beta: 0.8,
  feedback: false,
  z: 0.5,
  ssfLength: 20,
  ssfPoles: 2,
};

const G_DISPLAY = 'Display Controls';
const G_COLORS = 'Colors';
const G_BASE = 'Baseline Settings';
const G_SSL = 'SSL Settings';
const G_EXIT = 'Exit Settings';
const G_ATR = 'ATR Settings';
const G_RISK = 'Risk Assessment';
const G_JMA = 'Jurik (JMA) Settings';
const G_MF = 'Modular Filter Settings';
const G_EDSMA = 'EDSMA Settings';

export const inputConfig: InputConfig[] = [
  {
    id: 'displayMode', type: 'string', title: 'Display Mode', defval: 'Full Display',
    options: ['Baseline Only', 'Baseline + SSL', 'SSL Only', 'Entry/Exit Only', 'Full Display'], group: G_DISPLAY,
  },
  { id: 'colorBars', type: 'bool', title: 'Color Bars', defval: true, group: G_DISPLAY },
  {
    id: 'showSignals', type: 'bool', title: 'Show Signal Diamonds', defval: true, group: G_DISPLAY,
    tooltip: 'Candle > 1 ATR within baseline range - Potential false breakout warning',
  },
  { id: 'showRiskTable', type: 'bool', title: 'Show Risk Table', defval: true, group: G_DISPLAY },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#00c3ff', group: G_COLORS },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#ff0062', group: G_COLORS },
  {
    id: 'maType', type: 'string', title: 'Baseline Type', defval: 'HMA',
    options: ['SMA', 'EMA', 'DEMA', 'TEMA', 'LSMA', 'WMA', 'MF', 'VAMA', 'TMA', 'HMA', 'JMA', 'Kijun v2', 'EDSMA', 'McGinley'], group: G_BASE,
  },
  { id: 'len', type: 'int', title: 'Baseline Length', defval: 60, group: G_BASE },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: G_BASE },
  { id: 'showBaselineChannel', type: 'bool', title: 'Show Baseline Channel', defval: true, group: G_BASE },
  { id: 'multy', type: 'float', title: 'Channel Multiplier', defval: 0.2, step: 0.05, group: G_BASE },
  { id: 'useTrueRange', type: 'bool', title: 'Use True Range for Channel', defval: true, group: G_BASE },
  {
    id: 'ssl2Type', type: 'string', title: 'SSL2 Type', defval: 'JMA',
    options: ['SMA', 'EMA', 'DEMA', 'TEMA', 'WMA', 'MF', 'VAMA', 'TMA', 'HMA', 'JMA', 'McGinley'], group: G_SSL,
  },
  { id: 'len2', type: 'int', title: 'SSL2 Length', defval: 5, group: G_SSL },
  { id: 'atrCrit', type: 'float', title: 'Continuation ATR Criteria', defval: 0.9, step: 0.1, group: G_SSL },
  {
    id: 'ssl3Type', type: 'string', title: 'Exit Type', defval: 'HMA',
    options: ['DEMA', 'TEMA', 'LSMA', 'VAMA', 'TMA', 'HMA', 'JMA', 'Kijun v2', 'McGinley', 'MF'], group: G_EXIT,
  },
  { id: 'len3', type: 'int', title: 'Exit Length', defval: 15, group: G_EXIT },
  { id: 'atrLen', type: 'int', title: 'ATR Period', defval: 14, group: G_ATR },
  { id: 'mult', type: 'float', title: 'ATR Multiplier', defval: 1.0, step: 0.1, group: G_ATR },
  { id: 'smoothing', type: 'string', title: 'ATR Smoothing', defval: 'WMA', options: ['RMA', 'SMA', 'EMA', 'WMA'], group: G_ATR },
  { id: 'showAtrBands', type: 'bool', title: 'Show ATR Bands', defval: false, group: G_ATR },
  { id: 'riskLookback', type: 'int', title: 'Risk Lookback Period', defval: 100, min: 50, max: 500, group: G_RISK },
  { id: 'riskSensitivity', type: 'float', title: 'Risk Sensitivity', defval: 2, min: 0.2, max: 3.0, step: 0.1, group: G_RISK },
  { id: 'enableRiskGradient', type: 'bool', title: 'Enable Risk Gradient', defval: true, group: G_RISK },
  { id: 'jurikPhase', type: 'int', title: 'Phase', defval: 3, group: G_JMA },
  { id: 'jurikPower', type: 'int', title: 'Power', defval: 1, group: G_JMA },
  { id: 'kidiv', type: 'int', title: 'Kijun MOD Divider', defval: 1, max: 4, group: 'Kijun Settings' },
  { id: 'volatilityLookback', type: 'int', title: 'Volatility Lookback Length', defval: 10, group: 'VAMA Settings' },
  { id: 'beta', type: 'float', title: 'Beta', defval: 0.8, min: 0, max: 1, step: 0.1, group: G_MF },
  { id: 'feedback', type: 'bool', title: 'Feedback', defval: false, group: G_MF },
  { id: 'z', type: 'float', title: 'Feedback Weighting', defval: 0.5, step: 0.1, min: 0, max: 1, group: G_MF },
  { id: 'ssfLength', type: 'int', title: 'Super Smoother Filter Length', defval: 20, min: 1, group: G_EDSMA },
  // input.int(2, options = [2, 3])
  { id: 'ssfPoles', type: 'int', title: 'Super Smoother Filter Poles', defval: 2, min: 2, max: 3, group: G_EDSMA },
];

const NEUTRAL = String(color.new('#666666', 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Baseline', color: '#00c3ff', lineWidth: 3 },
  { id: 'plot1', title: 'Upper Channel', color: '#00c3ff', lineWidth: 1 },
  { id: 'plot2', title: 'Lower Channel', color: '#00c3ff', lineWidth: 1 },
  { id: 'plot3', title: 'SSL1', color: '#00c3ff', lineWidth: 2 },
  { id: 'plot4', title: 'SSL2', color: '#00c3ff', lineWidth: 2, style: 'circles' },
  { id: 'plot5', title: '+ATR', color: NEUTRAL, lineWidth: 1 },
  { id: 'plot6', title: '-ATR', color: NEUTRAL, lineWidth: 1 },
];

export const metadata = {
  title: 'SSL Hybrid',
  shortTitle: 'SSL Hybrid',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** Pine nz(x, y): na and the infinities are replaced */
const nz = (x: number, y = 0) => (Number.isFinite(x) ? x : y);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<SslHybridInputs> = {},
): Omit<IndicatorResult, 'markers' | 'barColors' | 'tables'> & {
  markers: MarkerData[]; barColors: BarColorData[]; tables: TableData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const highSeries = S(high);
  const lowSeries = S(low);

  // ---- Moving averages (each call has its own state)
  const ema = (src: number[], len: number) => A(ta.ema(S(src), len));
  const superSmoother = (src: number[]): number[] => {
    const PI = 2 * Math.asin(1);
    const out: number[] = new Array(n);
    if (cfg.ssfPoles === 2) {
      const arg = (Math.sqrt(2) * PI) / cfg.ssfLength;
      const a1 = Math.exp(-arg);
      const b1 = 2 * a1 * Math.cos(arg);
      const c2 = b1;
      const c3 = -Math.pow(a1, 2);
      const c1 = 1 - c2 - c3;
      for (let i = 0; i < n; i++) {
        out[i] = c1 * src[i] + c2 * nz(i >= 1 ? out[i - 1] : NaN) + c3 * nz(i >= 2 ? out[i - 2] : NaN);
      }
    } else {
      const arg = PI / cfg.ssfLength;
      const a1 = Math.exp(-arg);
      const b1 = 2 * a1 * Math.cos(1.738 * arg);
      const c1 = Math.pow(a1, 2);
      const coef2 = b1 + c1;
      const coef3 = -(c1 + b1 * c1);
      const coef4 = Math.pow(c1, 2);
      const coef1 = 1 - coef2 - coef3 - coef4;
      for (let i = 0; i < n; i++) {
        out[i] = coef1 * src[i] + coef2 * nz(i >= 1 ? out[i - 1] : NaN) + coef3 * nz(i >= 2 ? out[i - 2] : NaN)
          + coef4 * nz(i >= 3 ? out[i - 3] : NaN);
      }
    }
    return out;
  };

  const ma = (type: MaType, src: number[], len: number): number[] => {
    switch (type) {
      case 'TMA':
        return A(ta.sma(ta.sma(S(src), Math.ceil(len / 2)), Math.floor(len / 2) + 1));
      case 'MF': {
        // Modular filter
        const out: number[] = new Array(n);
        const alpha = 2 / (len + 1);
        let b = NaN;
        let c = NaN;
        let os = NaN;
        let ts = NaN;
        for (let i = 0; i < n; i++) {
          const a = cfg.feedback ? cfg.z * src[i] + (1 - cfg.z) * nz(ts, src[i]) : src[i];
          const up = alpha * a + (1 - alpha) * nz(b, a);
          b = gt(a, up) ? a : up;
          const dn = alpha * a + (1 - alpha) * nz(c, a);
          c = lt(a, dn) ? a : dn;
          os = eq(a, b) ? 1 : eq(a, c) ? 0 : os;
          const upper = cfg.beta * b + (1 - cfg.beta) * c;
          const lower = cfg.beta * c + (1 - cfg.beta) * b;
          ts = os * upper + (1 - os) * lower;
          out[i] = ts;
        }
        return out;
      }
      case 'LSMA':
        return A(ta.linreg(S(src), len, 0));
      case 'SMA':
        return A(ta.sma(S(src), len));
      case 'EMA':
        return ema(src, len);
      case 'DEMA': {
        const e = ema(src, len);
        const e2 = ema(e, len);
        return e.map((v, i) => 2 * v - e2[i]);
      }
      case 'TEMA': {
        const e = ema(src, len);
        const e2 = ema(e, len);
        const e3 = ema(e2, len);
        return e.map((v, i) => 3 * (v - e2[i]) + e3[i]);
      }
      case 'WMA':
        return A(ta.wma(S(src), len));
      case 'VAMA': {
        // Volatility adjusted moving average
        const mid = ema(src, len);
        const dev = S(src.map((v, i) => v - mid[i]));
        const volUp = A(ta.highest(dev, cfg.volatilityLookback));
        const volDown = A(ta.lowest(dev, cfg.volatilityLookback));
        return mid.map((v, i) => v + (volUp[i] + volDown[i]) / 2);
      }
      case 'HMA': {
        // len / 2 is a float in Pine v6: the length argument takes its integer part
        const half = A(ta.wma(S(src), Math.trunc(len / 2)));
        const full = A(ta.wma(S(src), len));
        return A(ta.wma(S(half.map((v, i) => 2 * v - full[i])), math.round(Math.sqrt(len)) as number));
      }
      case 'JMA': {
        const phase = cfg.jurikPhase;
        const phaseRatio = phase < -100 ? 0.5 : phase > 100 ? 2.5 : phase / 100 + 1.5;
        const beta = (0.45 * (len - 1)) / (0.45 * (len - 1) + 2);
        const alpha = Math.pow(beta, cfg.jurikPower);
        const out: number[] = new Array(n);
        let e0 = NaN;
        let e1 = NaN;
        let e2 = NaN;
        let jma = NaN;
        for (let i = 0; i < n; i++) {
          e0 = (1 - alpha) * src[i] + alpha * nz(e0);
          e1 = (src[i] - e0) * (1 - beta) + beta * nz(e1);
          e2 = (e0 + phaseRatio * e1 - nz(jma)) * Math.pow(1 - alpha, 2) + Math.pow(alpha, 2) * nz(e2);
          jma = e2 + nz(jma);
          out[i] = jma;
        }
        return out;
      }
      case 'Kijun v2': {
        // Uses the low and the high of the bars, whatever the source
        const kijunLow = A(ta.lowest(lowSeries, len));
        const kijunHigh = A(ta.highest(highSeries, len));
        // len / kidiv is a float in Pine v6: the length argument takes its integer part
        const convLen = Math.trunc(len / cfg.kidiv);
        const convLow = A(ta.lowest(lowSeries, convLen));
        const convHigh = A(ta.highest(highSeries, convLen));
        return kijunLow.map((v, i) => ((v + kijunHigh[i]) / 2 + (convLow[i] + convHigh[i]) / 2) / 2);
      }
      case 'McGinley': {
        // mg := na(mg[1]) ? ta.ema(src, len) : mg[1] + (src - mg[1]) / (len * math.pow(src / mg[1], 4))
        // The EMA only runs on the bars where the previous value is na: its history is those bars
        const out: number[] = new Array(n);
        const full = ema(src, len);
        const called: number[] = [];
        let mg = NaN;
        for (let i = 0; i < n; i++) {
          if (Number.isNaN(mg)) {
            called.push(src[i]);
            if (called.length === i + 1) mg = full[i];
            else {
              const part = ta.ema(Series.fromArray(bars.slice(0, called.length), called), len).toArray();
              mg = part[part.length - 1] ?? NaN;
            }
          } else {
            mg = mg + (src[i] - mg) / (len * Math.pow(src[i] / mg, 4));
          }
          out[i] = mg;
        }
        return out;
      }
      case 'EDSMA': {
        // Ehlers deviation scaled moving average
        const zeros = src.map((v, i) => v - nz(i >= 2 ? src[i - 2] : NaN));
        const avgZeros = zeros.map((v, i) => (v + (i >= 1 ? zeros[i - 1] : NaN)) / 2);
        const ssf = superSmoother(avgZeros);
        const stdev = A(ta.stdev(S(ssf), len));
        const out: number[] = new Array(n);
        let edsma = NaN;
        for (let i = 0; i < n; i++) {
          // stdev != 0 (false for na)
          const scaledFilter = Math.abs(stdev[i]) > EPS ? ssf[i] / stdev[i] : 0;
          const alpha = (5 * Math.abs(scaledFilter)) / len;
          edsma = alpha * src[i] + (1 - alpha) * nz(edsma);
          out[i] = edsma;
        }
        return out;
      }
      default:
        return new Array(n).fill(NaN);
    }
  };

  // ---- ATR and risk
  const trueRange = ta.tr(bars, true);
  const atr = A(cfg.smoothing === 'RMA' ? ta.rma(trueRange, cfg.atrLen)
    : cfg.smoothing === 'SMA' ? ta.sma(trueRange, cfg.atrLen)
      : cfg.smoothing === 'EMA' ? ta.ema(trueRange, cfg.atrLen) : ta.wma(trueRange, cfg.atrLen));
  const atrPercentile = A(ta.percentrank(S(atr), cfg.riskLookback));
  /** Transparency of the bullish / bearish colours: grows with the ATR percentile */
  const riskSaturation = (i: number): number => {
    if (!cfg.enableRiskGradient) return 0;
    const adjusted = Math.pow(atrPercentile[i] / 100, cfg.riskSensitivity) * 100;
    if (le(adjusted, 25)) return 0;
    if (le(adjusted, 50)) return 10;
    return math.round(25 + ((adjusted - 50) / 50) * 25) as number;
  };

  // ---- Baseline, SSL lines
  const srcArr = A(getSourceSeries(bars, cfg.src));
  const bbmc = ma(cfg.maType, close, cfg.len);
  const keltMa = ma(cfg.maType, srcArr, cfg.len);
  const rangeValue = cfg.useTrueRange ? ta.tr(bars, false) : S(bars.map((b) => b.high - b.low));
  const rangeMa = A(ta.ema(rangeValue, cfg.len));
  const emaHigh = ma(cfg.maType, high, cfg.len);
  const emaLow = ma(cfg.maType, low, cfg.len);
  const maHigh = ma(cfg.ssl2Type, high, cfg.len2);
  const maLow = ma(cfg.ssl2Type, low, cfg.len2);
  const exitHigh = ma(cfg.ssl3Type, high, cfg.len3);
  const exitLow = ma(cfg.ssl3Type, low, cfg.len3);
  /** Hlv := close > hi ? 1 : close < lo ? -1 : Hlv[1]; the line is the high average while Hlv < 0, else the low one */
  const sslLine = (hi: number[], lo: number[]): number[] => {
    const out: number[] = new Array(n);
    let hlv = NaN;
    for (let i = 0; i < n; i++) {
      hlv = gt(close[i], hi[i]) ? 1 : lt(close[i], lo[i]) ? -1 : hlv;
      out[i] = hlv < 0 ? hi[i] : lo[i];
    }
    return out;
  };
  const sslDown = sslLine(emaHigh, emaLow);
  const sslDown2 = sslLine(maHigh, maLow);
  const sslExit = sslLine(exitHigh, exitLow);

  // ---- Signals
  const closeSeries = S(close);
  const exitSeries = S(sslExit);
  const crossLong = A(ta.crossover(closeSeries, exitSeries));
  const crossShort = A(ta.crossover(exitSeries, closeSeries));

  const mode = cfg.displayMode;
  const showBaseline = mode === 'Baseline Only' || mode === 'Baseline + SSL' || mode === 'Full Display';
  const showSsl1 = mode === 'SSL Only' || mode === 'Baseline + SSL' || mode === 'Full Display';
  const showSsl2 = mode === 'SSL Only' || mode === 'Full Display';
  const showExit = mode === 'Entry/Exit Only' || mode === 'Full Display';
  const showChannel = showBaseline && cfg.showBaselineChannel;

  const plots: Record<string, Point[]> = { plot0: [], plot1: [], plot2: [], plot3: [], plot4: [], plot5: [], plot6: [] };
  const fillColors: string[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const white = String(color.white);
  const transparentNeutral = String(color.new('#666666', 80));
  let bullishColor = NEUTRAL;
  let bearishColor = NEUTRAL;

  for (let i = 0; i < n; i++) {
    const { time, open } = bars[i];
    const c = close[i];
    const saturation = riskSaturation(i);
    bullishColor = String(color.new(cfg.bullishColor, saturation));
    bearishColor = String(color.new(cfg.bearishColor, saturation));
    const transparentBull = String(color.new(cfg.bullishColor, Math.max(80, saturation + 20)));
    const transparentBear = String(color.new(cfg.bearishColor, Math.max(80, saturation + 20)));

    const upperBand = atr[i] * cfg.mult + c;
    const lowerBand = c - atr[i] * cfg.mult;
    const upperK = keltMa[i] + rangeMa[i] * cfg.multy;
    const lowerK = keltMa[i] - rangeMa[i] * cfg.multy;

    // Baseline violation candle: larger than the ATR, with the baseline inside the ATR bands
    const atrViolation = gt(Math.abs(c - open), atr[i]);
    const inRange = gt(upperBand, bbmc[i]) && lt(lowerBand, bbmc[i]);
    const candleSizeViolation = atrViolation && inRange;

    // SSL2 continuation
    const upperHalf = atr[i] * cfg.atrCrit + c;
    const lowerHalf = c - atr[i] * cfg.atrCrit;
    const sellAtr = gt(upperHalf, sslDown2[i]) && lt(c, bbmc[i]) && lt(c, sslDown2[i]);
    const buyAtr = lt(lowerHalf, sslDown2[i]) && gt(c, bbmc[i]) && gt(c, sslDown2[i]);

    const baselineColor = gt(c, upperK) ? bullishColor : lt(c, lowerK) ? bearishColor : NEUTRAL;
    const sslColor = gt(c, sslDown[i]) ? bullishColor : lt(c, sslDown[i]) ? bearishColor : NEUTRAL;
    const ssl2Color = buyAtr ? bullishColor : sellAtr ? bearishColor : NEUTRAL;
    const channelFillColor = gt(c, upperK) ? transparentBull : lt(c, lowerK) ? transparentBear : transparentNeutral;

    plots.plot0.push({ time, value: showBaseline ? bbmc[i] : NaN, color: baselineColor });
    plots.plot1.push({ time, value: showChannel ? upperK : NaN, color: baselineColor });
    plots.plot2.push({ time, value: showChannel ? lowerK : NaN, color: baselineColor });
    fillColors.push(showChannel ? channelFillColor : 'transparent');
    plots.plot3.push({ time, value: showSsl1 ? sslDown[i] : NaN, color: sslColor });
    plots.plot4.push({ time, value: showSsl2 ? sslDown2[i] : NaN, color: ssl2Color });
    plots.plot5.push({ time, value: cfg.showAtrBands ? upperBand : NaN });
    plots.plot6.push({ time, value: cfg.showAtrBands ? lowerBand : NaN });

    // plotarrow(show_exit ? codiff : na, colorup = bullish_color, colordown = bearish_color, maxheight = 20)
    if (showExit) {
      if (crossLong[i] === 1) markers.push({ time, position: 'belowBar', shape: 'arrowUp', color: bullishColor });
      else if (crossShort[i] === 1) markers.push({ time, position: 'aboveBar', shape: 'arrowDown', color: bearishColor });
    }
    if (cfg.showSignals && candleSizeViolation) {
      markers.push({ time, position: 'top', shape: 'diamond', color: white, size: 'tiny' });
    }
    if (cfg.colorBars) barColors.push({ time, color: baselineColor });
  }

  // ---- Risk table (last bar)
  const tables: TableData[] = [];
  if (n > 0 && cfg.showRiskTable) {
    const last = n - 1;
    const percentile = atrPercentile[last];
    const distance = Math.abs(close[last] - bbmc[last]) / atr[last];
    const entryDistance = lt(distance, 1) ? 'Near' : lt(distance, 2) ? 'Extended' : 'Far';
    const riskLevel = gt(percentile, 75) ? 'High' : lt(percentile, 25) ? 'Low' : 'Normal';
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string, textColor: string) => {
      cells.push({ column, row, text, textColor, textSize: 'small' });
    };
    cell(0, 0, 'Risk Level', white);
    cell(1, 0, riskLevel, riskLevel === 'High' ? bearishColor : riskLevel === 'Low' ? bullishColor : NEUTRAL);
    cell(0, 1, 'Entry Distance', white);
    cell(1, 1, entryDistance, entryDistance === 'Near' ? bullishColor : entryDistance === 'Extended' ? String(color.yellow) : bearishColor);
    cell(0, 2, 'Vol %ile', white);
    cell(1, 2, str.tostring(math.round(percentile, 1)) + '%', white);
    cell(0, 3, 'ATR', white);
    cell(1, 3, str.tostring(atr[last], '#.####'), white);
    tables.push({
      position: 'bottom_right', columns: 2, rows: 4, cells, bgColor: String(color.new('#1a1a1a', 5)), borderWidth: 1,
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    // fill(upper_channel, lower_channel, title = "Baseline Channel")
    fills: [{ plot1: 'plot1', plot2: 'plot2', colors: fillColors }],
    markers,
    barColors,
    tables,
  };
}

export const SslHybrid = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
