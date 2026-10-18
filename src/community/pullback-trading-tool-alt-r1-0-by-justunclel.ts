/**
 * Pullback Trading Tool ALT R2.0 by JustUncleL
 *
 * Moving averages for pullback trading:
 * - a ribbon of a fast and a slow average (EMA 5 and EMA 12), coloured by their rise, with a fill;
 * - a signal average (EMA 50, circles) and bar colours from the open and the close against it (three tones, or the
 *   six "Grab" tones that also tell rising from falling candles);
 * - a fast, a medium and an optional slow anchored average (EMA 35 / 65 / 200) with a fill;
 * - pivot highs and lows (dots), optional HH / LH / HL / LL marks, and the last pivot levels as extensions or as a
 *   fractal chaos channel;
 * - optional entry arrows (the original's four plotarrow outputs, `arrows` of the result): a trend break (both
 *   ribbon averages above, or below, the three other averages) and the break of the last pivot level inside a trend.
 * Eleven average types: SMA, EMA, WMA, VWMA, SMMA, DEMA, TEMA, HullMA, ZEMA, TMA, SSMA.
 *
 * With an anchor timeframe in minutes above the chart timeframe (intraday charts only) every length is multiplied by
 * anchor / chart minutes. The chart timeframe is read from the chart context; without it, from the spacing of the
 * bars.
 *
 * Reference: "Pullback Trading Tool ALT R2.0 by JustUncleL" by JustUncleL
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright 2017,2018 JustUncleL
 */

import {
  ta, Series, color, timeframe, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType, type ArrowData,
} from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import type { ChartContext } from '../chart-context';

type MaType = 'SMA' | 'EMA' | 'WMA' | 'VWMA' | 'SMMA' | 'DEMA' | 'TEMA' | 'HullMA' | 'ZEMA' | 'TMA' | 'SSMA';
const MA_TYPES: MaType[] = ['SMA', 'EMA', 'WMA', 'VWMA', 'SMMA', 'DEMA', 'TEMA', 'HullMA', 'ZEMA', 'TMA', 'SSMA'];

export interface PullbackTradingToolAltInputs {
  maSrc: SourceType;
  showMAs: boolean;
  /** Multiply the ribbon lengths by the anchor multiplier too */
  anchorRibbon: boolean;
  fastType: MaType;
  fastLen: number;
  slowType: MaType;
  slowLen: number;
  /** Anchor timeframe in minutes (0 = none) */
  anchor: number;
  fastAnchorType: MaType;
  fastAnchorLen: number;
  mediumAnchorType: MaType;
  mediumAnchorLen: number;
  useSlowMA: boolean;
  slowAnchorType: MaType;
  slowAnchorLen: number;
  signalType: MaType;
  signalLen: number;
  showBreak: boolean;
  showPB: boolean;
  closeBr: boolean;
  lookback: number;
  showBarColor: boolean;
  useGrabClr: boolean;
  showPivots: boolean;
  pvtLenL: number;
  pvtLenR: number;
  showSRLevels: boolean;
  showChannel: boolean;
  maxLvlLen: number;
  uRenko: boolean;
  showHHLL: boolean;
}

export const defaultInputs: PullbackTradingToolAltInputs = {
  maSrc: 'close',
  showMAs: true,
  anchorRibbon: true,
  fastType: 'EMA',
  fastLen: 5,
  slowType: 'EMA',
  slowLen: 12,
  anchor: 0,
  fastAnchorType: 'EMA',
  fastAnchorLen: 35,
  mediumAnchorType: 'EMA',
  mediumAnchorLen: 65,
  useSlowMA: false,
  slowAnchorType: 'EMA',
  slowAnchorLen: 200,
  signalType: 'EMA',
  signalLen: 50,
  showBreak: false,
  showPB: false,
  closeBr: true,
  lookback: 6,
  showBarColor: true,
  useGrabClr: true,
  showPivots: true,
  pvtLenL: 2,
  pvtLenR: 2,
  showSRLevels: false,
  showChannel: false,
  maxLvlLen: 0,
  uRenko: false,
  showHHLL: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'maSrc', type: 'source', title: 'Source for All Moving Averages', defval: 'close' },
  { id: 'showMAs', type: 'bool', title: 'Show MA Ribbon', defval: true },
  { id: 'anchorRibbon', type: 'bool', title: 'Anchor MA Ribbon', defval: true },
  { id: 'fastType', type: 'string', title: 'Fast Ribbon MA Type: ', defval: 'EMA', options: MA_TYPES },
  { id: 'fastLen', type: 'int', title: 'Fast Ribbon MA Length:', defval: 5, min: 1 },
  { id: 'slowType', type: 'string', title: 'Slow Ribbon MA Type: ', defval: 'EMA', options: MA_TYPES },
  { id: 'slowLen', type: 'int', title: 'Slow Ribbon MA Length:', defval: 12, min: 1 },
  { id: 'anchor', type: 'int', title: 'Anchor TimeFrame in Mins (0=none, 1D=1440, 1W=7200)', defval: 0, min: 0, max: 1440 },
  { id: 'fastAnchorType', type: 'string', title: 'Fast Anchored MA Type: ', defval: 'EMA', options: MA_TYPES },
  { id: 'fastAnchorLen', type: 'int', title: 'Fast Anchored MA Length:', defval: 35, min: 1 },
  { id: 'mediumAnchorType', type: 'string', title: 'Medium Anchored MA Type: ', defval: 'EMA', options: MA_TYPES },
  { id: 'mediumAnchorLen', type: 'int', title: 'Medium Anchored MA Length:', defval: 65, min: 1 },
  { id: 'useSlowMA', type: 'bool', title: 'Show Slow Anchored MA', defval: false },
  { id: 'slowAnchorType', type: 'string', title: 'Slow Anchored MA Type: ', defval: 'EMA', options: MA_TYPES },
  { id: 'slowAnchorLen', type: 'int', title: 'Slow Anchored MA Length:', defval: 200, min: 1 },
  { id: 'signalType', type: 'string', title: 'Signal Anchored MA Type: ', defval: 'EMA', options: MA_TYPES },
  { id: 'signalLen', type: 'int', title: 'Signal Anchored MA Length:', defval: 50, min: 1 },
  { id: 'showBreak', type: 'bool', title: 'Show Entrys for Trend Breaks', defval: false },
  { id: 'showPB', type: 'bool', title: 'Show Entrys for PB Fractal Breaks', defval: false },
  { id: 'closeBr', type: 'bool', title: 'Use Close Break instead Touch Fractal Break', defval: true },
  { id: 'lookback', type: 'int', title: 'Pull Back Lookback Length', defval: 6, min: 1 },
  { id: 'showBarColor', type: 'bool', title: 'Show coloured Bars close relative to Signal MA', defval: true },
  { id: 'useGrabClr', type: 'bool', title: 'Use Grab Candle (6-tone) Colouring, instead of Standard (3-tone)', defval: true },
  { id: 'showPivots', type: 'bool', title: 'Show Pivot Points', defval: true },
  { id: 'pvtLenL', type: 'int', title: 'Pivot Length Left Hand Side', defval: 2, min: 1 },
  { id: 'pvtLenR', type: 'int', title: 'Pivot Length Right Hand Side', defval: 2, min: 1 },
  { id: 'showSRLevels', type: 'bool', title: 'Show S/R Level Extensions', defval: false },
  { id: 'showChannel', type: 'bool', title: 'Show Levels as a Fractal Chaos Channel', defval: false },
  { id: 'maxLvlLen', type: 'int', title: 'Maximum S/R Level Extension Length', defval: 0, min: 0 },
  { id: 'uRenko', type: 'bool', title: 'Use Renko Style Pivots (open/close for high/low)', defval: false },
  { id: 'showHHLL', type: 'bool', title: 'ShowHHLL', defval: false },
];

// Colour constants of Pine version 3 and of the script
const AQUA = '#00FFFF';
const FUCHSIA = '#FF00FF';
const GREEN = '#008000';
const GRAY = '#808080';
const WHITE = '#FFFFFF';
const MAROON = '#800000';
const LIME = '#00FF00';
const RED = '#FF0000';
const BLUE = '#0000FF';
const YELLOW = '#FFFF00';
const DARK_RED = '#8B0000';
const DODGER_BLUE = '#1E90FF';
const GOLD = '#FFD700';
const T = (hex: string, transp: number) => String(color.new(hex, transp));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast MA', color: T(AQUA, 10), lineWidth: 1 },
  { id: 'plot1', title: 'Slow MA', color: T(AQUA, 10), lineWidth: 1 },
  { id: 'plot2', title: 'Signal MA', color: T(GOLD, 20), lineWidth: 2, style: 'circles' },
  { id: 'plot3', title: 'Fast Anchored MA', color: T(DODGER_BLUE, 20), lineWidth: 1 },
  { id: 'plot4', title: 'Medium Anchored MA', color: T(GREEN, 20), lineWidth: 1 },
  { id: 'plot5', title: 'Slow Anchored MA', color: T(GRAY, 20), lineWidth: 2 },
  { id: 'plot6', title: 'High Pivot *', color: T(WHITE, 50), lineWidth: 3, style: 'circles' },
  { id: 'plot7', title: 'Low Pivot *', color: T(WHITE, 50), lineWidth: 3, style: 'circles' },
  { id: 'plot8', title: 'High Pivot *', color: GREEN, lineWidth: 2, style: 'circles' },
  { id: 'plot9', title: 'Low Pivot *', color: MAROON, lineWidth: 2, style: 'circles' },
  { id: 'plot10', title: 'Top Levels', color: GREEN, lineWidth: 1 },
  { id: 'plot11', title: 'Bottom Levels', color: MAROON, lineWidth: 1 },
  { id: 'plot12', title: 'Top Levels 2', color: GREEN, lineWidth: 1 },
  { id: 'plot13', title: 'Bottom Levels 2', color: MAROON, lineWidth: 1 },
  { id: 'plot14', title: 'Top Chaos Channel', color: GREEN, lineWidth: 1 },
  { id: 'plot15', title: 'Bottom Chaos Channel', color: MAROON, lineWidth: 1 },
];

export const metadata = {
  title: 'Pullback Trading Tool ALT R2.0 by JustUncleL',
  shortTitle: 'PBTOOLA R2.0',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** a != b (false when a value is na) */
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** A float read as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<PullbackTradingToolAltInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'barColors'> & { markers: MarkerData[]; barColors: BarColorData[]; arrows: ArrowData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const volume = new Series(bars, (b) => b.volume ?? NaN);

  // variant(type, src, len): the selected moving average, SMA for an unknown type
  const variant = (type: string, src: Series, len: number): number[] => {
    const ema = (s: Series) => ta.ema(s, len);
    switch (type) {
      case 'EMA': return A(ema(src));
      case 'WMA': return A(ta.wma(src, len));
      case 'VWMA': return A(ta.vwma(src, len, volume));
      case 'SMMA': {
        // v5 := na(v5[1]) ? sma(src, len) : (v5[1] * (len - 1) + src) / len
        const sma = A(ta.sma(src, len));
        const x = A(src);
        const out: number[] = new Array(n);
        for (let i = 0; i < n; i++) out[i] = i === 0 || isNaN(out[i - 1]) ? sma[i] : (out[i - 1] * (len - 1) + x[i]) / len;
        return out;
      }
      case 'DEMA': {
        const v2 = ema(src);
        return A(v2.mul(2).sub(ema(v2)));
      }
      case 'TEMA': {
        const v2 = ema(src);
        const v3 = ema(v2);
        return A(v2.sub(v3).mul(3).add(ema(v3)));
      }
      case 'HullMA':
        // wma(2 * wma(src, len / 2) - wma(src, len), round(sqrt(len)))
        return A(ta.wma(ta.wma(src, Math.trunc(len / 2)).mul(2).sub(ta.wma(src, len)), Math.round(Math.sqrt(len))));
      case 'SSMA': {
        // SuperSmoother filter, (c) 2013 John F. Ehlers
        const a1 = Math.exp((-1.414 * 3.14159) / len);
        const b1 = 2 * a1 * Math.cos((1.414 * 3.14159) / len);
        const c2 = b1;
        const c3 = -a1 * a1;
        const c1 = 1 - c2 - c3;
        const x = A(src);
        const nz = (v: number) => (isNaN(v) ? 0 : v);
        const out: number[] = new Array(n);
        for (let i = 0; i < n; i++) {
          out[i] = (c1 * (x[i] + nz(i > 0 ? x[i - 1] : NaN))) / 2 + c2 * nz(i > 0 ? out[i - 1] : NaN) + c3 * nz(i > 1 ? out[i - 2] : NaN);
        }
        return out;
      }
      case 'ZEMA': {
        const ema1 = ema(src);
        return A(ema1.add(ema1.sub(ema(ema1))));
      }
      case 'TMA': return A(ta.sma(ta.sma(src, len), len));
      default: return A(ta.sma(src, len));
    }
  };

  // Anchor multiplier: on an intraday chart below the anchor timeframe, round(anchor / chart minutes). On daily,
  // weekly and monthly charts the source needs an anchor above 1440 minutes, which the input does not allow: 1.
  const tf = chart?.timeframe ?? chartTimeframe(bars);
  const info = tf === '' ? null : timeframe.info(tf);
  const interval = info ? info.multiplier : 0;
  const mult = info !== null && info.isintraday && !(cfg.anchor === 0 || interval <= 0 || interval >= cfg.anchor)
    ? Math.round(cfg.anchor / interval) : 1;

  const fastAnchorLen = cfg.fastAnchorLen * mult;
  const mediumAnchorLen = cfg.mediumAnchorLen * mult;
  const slowAnchorLen = cfg.slowAnchorLen * mult;
  const signalLen = cfg.signalLen * mult;
  const fastLen = cfg.anchorRibbon ? cfg.fastLen * mult : cfg.fastLen;
  const slowLen = cfg.anchorRibbon ? cfg.slowLen * mult : cfg.slowLen;

  const maSrc = getSourceSeries(bars, cfg.maSrc);
  const fastMA = variant(cfg.fastType, maSrc, fastLen);
  const slowMA = variant(cfg.slowType, maSrc, slowLen);
  const fastAnchorMA = variant(cfg.fastAnchorType, maSrc, fastAnchorLen);
  const mediumAnchorMA = variant(cfg.mediumAnchorType, maSrc, mediumAnchorLen);
  const slowAnchorMA = variant(cfg.slowAnchorType, maSrc, slowAnchorLen);
  const signalMA = variant(cfg.signalType, maSrc, signalLen);
  const fastRising = ta.rising(S(fastMA), 2).toArray();
  const slowRising = ta.rising(S(slowMA), 2).toArray();

  // Pivots on the highs and lows, or on the candle bodies (Renko style)
  const R = cfg.pvtLenR;
  const hi = bars.map((b) => (cfg.uRenko ? Math.max(b.close, b.open) : b.high));
  const lo = bars.map((b) => (cfg.uRenko ? Math.min(b.close, b.open) : b.low));
  const pvthi = A(ta.pivothigh(S(hi), cfg.pvtLenL, R));
  const pvtlo = A(ta.pivotlow(S(lo), cfg.pvtLenL, R));

  const step = barInterval(bars);
  const time = (i: number) => barTime(bars, i, step);
  const plots: Record<string, Point[]> = {};
  for (let k = 0; k < 16; k++) plots[`plot${k}`] = [];
  const barColors: BarColorData[] = [];
  const markers: MarkerData[] = [];
  const arrows: ArrowData[] = [];
  const ribbonFill: string[] = [];

  // valuewhen histories of the pivots (latest value last)
  const highs: number[] = [];
  const lows: number[] = [];
  const back = (list: number[], k: number) => (list.length > k ? list[list.length - 1 - k] : NaN);
  let counthi = NaN;
  let countlo = NaN;
  let pvthis = NaN;
  let pvtlos = NaN;
  let trUp: boolean | null = null; // tr_up[1] is na on the first bar
  let trDown: boolean | null = null;
  let pullbackUpT = NaN;
  let pullbackDnT = NaN;
  const levelsOn = cfg.showSRLevels && !cfg.showChannel;
  const channelOn = cfg.showSRLevels && cfg.showChannel;
  const pivotsOn = cfg.showPivots && !cfg.showHHLL;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time as number;
    const sig = signalMA[i];

    // Bar colour from the open and the close against the signal average
    if (cfg.showBarColor) {
      const above = gt(b.open, sig) && gt(b.close, sig);
      const below = lt(b.open, sig) && lt(b.close, sig);
      const falling = gt(b.open, b.close);
      const c = !cfg.useGrabClr
        ? (above ? DODGER_BLUE : below ? RED : YELLOW)
        : above ? (falling ? GREEN : LIME) : below ? (falling ? DARK_RED : RED) : (falling ? BLUE : AQUA);
      barColors.push({ time: t, color: c });
    }

    plots.plot0.push({ time: t, value: cfg.showMAs ? fastMA[i] : NaN, color: T(fastRising[i] ? AQUA : FUCHSIA, 10) });
    plots.plot1.push({ time: t, value: cfg.showMAs ? slowMA[i] : NaN, color: T(slowRising[i] ? AQUA : FUCHSIA, 10) });
    ribbonFill.push(T(gt(fastMA[i], slowMA[i]) ? AQUA : FUCHSIA, 90));
    plots.plot2.push({ time: t, value: sig });
    plots.plot3.push({ time: t, value: fastAnchorMA[i] });
    plots.plot4.push({ time: t, value: mediumAnchorMA[i] });
    plots.plot5.push({ time: t, value: cfg.useSlowMA ? slowAnchorMA[i] : NaN });

    // Higher highs, lower highs, higher lows, lower lows: valuewhen(pvthi, high_[pvtLenR], 1) against (..., 0)
    const isHi = truthy(pvthi[i]);
    const isLo = truthy(pvtlo[i]);
    if (isHi) highs.push(i - R >= 0 ? hi[i - R] : NaN);
    if (isLo) lows.push(i - R >= 0 ? lo[i - R] : NaN);
    const hasHi = !isNaN(pvthi[i]);
    const hasLo = !isNaN(pvtlo[i]);
    const higherHigh = hasHi && lt(back(highs, 1), back(highs, 0)) ? pvthi[i] : NaN;
    const lowerHigh = hasHi && gt(back(highs, 1), back(highs, 0)) ? pvthi[i] : NaN;
    const higherLow = hasLo && lt(back(lows, 1), back(lows, 0)) ? pvtlo[i] : NaN;
    const lowerLow = hasLo && gt(back(lows, 1), back(lows, 0)) ? pvtlo[i] : NaN;
    // plotshape(..., offset = -pvtLenR, transp = 20): the mark is drawn pvtLenR bars back
    const mark = (v: number, above: boolean, base: string, text: string, id: string) => {
      if (cfg.showHHLL && truthy(v) && i - R >= 0) {
        markers.push({
          time: time(i - R), position: above ? 'aboveBar' : 'belowBar', shape: above ? 'triangleUp' : 'triangleDown',
          color: T(base, 20), text, id,
        });
      }
    };
    mark(higherHigh, true, LIME, 'HH', 'shape0');
    mark(lowerHigh, true, RED, 'LH', 'shape1');
    mark(higherLow, false, LIME, 'HL', 'shape2');
    mark(lowerLow, false, RED, 'LL', 'shape3');

    // Pivot dots, drawn pvtLenR bars back
    if (i - R >= 0) {
      const tb = time(i - R);
      plots.plot6.push({ time: tb, value: pivotsOn ? pvthi[i] : NaN });
      plots.plot7.push({ time: tb, value: pivotsOn ? pvtlo[i] : NaN });
      plots.plot8.push({ time: tb, value: pivotsOn ? pvthi[i] : NaN });
      plots.plot9.push({ time: tb, value: pivotsOn ? pvtlo[i] : NaN });
    }

    // Bars since the last pivot, and the last pivot levels
    counthi = isHi ? 0 : (isNaN(counthi) ? 0 : counthi) + 1;
    countlo = isLo ? 0 : (isNaN(countlo) ? 0 : countlo) + 1;
    const prevHis = pvthis;
    const prevLos = pvtlos;
    pvthis = isHi ? (i - R >= 0 ? bars[i - R].high : NaN) : (isNaN(prevHis) ? b.high : prevHis);
    pvtlos = isLo ? (i - R >= 0 ? bars[i - R].low : NaN) : (isNaN(prevLos) ? b.low : prevLos);
    // hipc = (pvthis != pvthis[1]) ? na : green; lopc = (pvtlos != pvtlos[1]) ? na : maroon
    const hipc = ne(pvthis, prevHis) ? 'transparent' : GREEN;
    const lopc = ne(pvtlos, prevLos) ? 'transparent' : MAROON;
    const top = levelsOn && (cfg.maxLvlLen === 0 || counthi < cfg.maxLvlLen) ? pvthis : NaN;
    const bottom = levelsOn && (cfg.maxLvlLen === 0 || countlo < cfg.maxLvlLen) ? pvtlos : NaN;
    if (i - R >= 0) {
      plots.plot10.push({ time: time(i - R), value: top, color: hipc });
      plots.plot11.push({ time: time(i - R), value: bottom, color: lopc });
    }
    plots.plot12.push({ time: t, value: top, color: hipc });
    plots.plot13.push({ time: t, value: bottom, color: lopc });
    plots.plot14.push({ time: t, value: channelOn ? pvthis : NaN });
    plots.plot15.push({ time: t, value: channelOn ? pvtlos : NaN });

    // Trend: both ribbon averages above (below) the medium, the fast anchored and the signal averages
    const prevUp = trUp;
    const prevDown = trDown;
    trUp = gt(slowMA[i], mediumAnchorMA[i]) && gt(slowMA[i], fastAnchorMA[i]) && gt(slowMA[i], sig)
      && gt(fastMA[i], mediumAnchorMA[i]) && gt(fastMA[i], fastAnchorMA[i]) && gt(fastMA[i], sig);
    trDown = lt(slowMA[i], mediumAnchorMA[i]) && lt(slowMA[i], fastAnchorMA[i]) && lt(slowMA[i], sig)
      && lt(fastMA[i], mediumAnchorMA[i]) && lt(fastMA[i], fastAnchorMA[i]) && lt(fastMA[i], sig);

    // Break of the last pivot level inside a trend
    const prevHigh = i > 0 ? bars[i - 1].high : NaN;
    const prevLow = i > 0 ? bars[i - 1].low : NaN;
    pullbackUpT = trUp && lt(prevHigh, pvthis) && gt(b.high, pvthis) && (!cfg.closeBr || gt(b.close, pvthis))
      ? (isNaN(pullbackUpT) ? 0 : pullbackUpT) + 1 : 0;
    pullbackDnT = trDown && gt(prevLow, pvtlos) && lt(b.low, pvtlos) && (!cfg.closeBr || lt(b.close, pvtlos))
      ? (isNaN(pullbackDnT) ? 0 : pullbackDnT) + 1 : 0;

    // plotarrow(series, colorup / colordown, transp = 0): the series value (sign = direction)
    const arrow = (on: boolean, value: number, c: string, id: string) => {
      if (on) arrows.push({ time: t, id, value, color: c });
    };
    arrow(cfg.showBreak && trUp && !prevUp, 1, AQUA, 'arrow0');
    arrow(cfg.showBreak && trDown && !prevDown, -1, BLUE, 'arrow1');
    arrow(cfg.showPB && pullbackUpT === 1, pullbackUpT, LIME, 'arrow2');
    arrow(cfg.showPB && pullbackDnT === 1, -pullbackDnT, RED, 'arrow3');
  }
  markers.sort((p, q) => p.time - q.time);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      // fill(p1, p2, color = fastMA > slowMA ? aqua : fuchsia, transp = 90, title = "Ribbon Fill")
      { plot1: 'plot0', plot2: 'plot1', colors: ribbonFill, options: { title: 'Ribbon Fill', color: T(AQUA, 90) } },
      // fill(p3, p4, color = gray, transp = 90, title = "Anchored MA Fill")
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Anchored MA Fill', color: T(GRAY, 90) } },
    ],
    markers,
    arrows,
    barColors,
  };
}

export const PullbackTradingToolAlt = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
