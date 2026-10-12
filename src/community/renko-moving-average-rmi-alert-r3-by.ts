/**
 * Renko+Moving Average+RMI Alert R3
 *
 * Entry and exit signals from three parts:
 * - a moving average of the source (EMA 6 by default; SMA, WMA, VWMA, SMMA, DEMA, TEMA, Hull, zero-lag EMA, triangular
 *   or Ehlers super smoother), lime while it rose over the last 3 bars, red while it fell (the direction is kept
 *   otherwise)
 * - the open line of the period ("1D" by default, or "1W" / "1M"): the source on the first bar of each period
 *   (purple, not drawn on the first bar of a period)
 * - the Relative Momentum Index: 100 - 100 / (1 + up / down) with up / down the EMA (length 4) of the rise / fall of
 *   the source over "Momentum Length" bars (0 when the down EMA is 0), or the RSI of the source
 * A long starts when the bar is up (and closes above the open line with the filter on), the moving average rises and
 * the RMI is at or above "Overbought" and not falling; it ends when the moving average turns down or the RMI leaves
 * its zone (RMI mode), or on the first down bar after an up bar with "Exit Trade on 1st Opposite Renko Brick".
 * Shorts are the mirror; the short exit on the moving average never happens (the original tests a direction above 1).
 * Markers: an up arrow (BUY) and a down arrow (SELL) on the first bar of a trade, and an "Exit" cross when it ends.
 * The arrow height of the original (50 to 60 pixels) is not ported. The four alerts of the script have no output.
 *
 * Chart values (third argument): the time zone and the session of the symbol give the periods of the open line on
 * the exchange calendar (without them: the UTC calendar and the bars, see src/anchor-period.ts).
 *
 * Reference: "Renko+Moving Average+RMI Alert R3 by JustUncleL" by JustUncleL
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { securityStarts } from '../anchor-period';
import type { ChartContext } from '../chart-context';

type MaType = 'SMA' | 'EMA' | 'WMA' | 'VWMA' | 'SMMA' | 'DEMA' | 'TEMA' | 'HullMA' | 'ZEMA' | 'TMA' | 'SSMA';
type Source = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'volume';

export interface RenkoMovingAverageRmiAlertR3ByInputs {
  maType: MaType;
  maLen: number;
  maSrc: Source;
  /** Exit a trade on the first opposite brick (bar) */
  exitFirst: boolean;
  /** RMI / RSI length */
  rmiLen: number;
  /** Momentum length of the RMI */
  mom: number;
  ob: number;
  os: number;
  /** Use the RSI instead of the RMI */
  uRSI: boolean;
  /** Use the open line filter */
  udOpen: boolean;
  /** Period of the open line */
  dPeriod: '1D' | '1W' | '1M';
}

export const defaultInputs: RenkoMovingAverageRmiAlertR3ByInputs = {
  maType: 'EMA',
  maLen: 6,
  maSrc: 'close',
  exitFirst: false,
  rmiLen: 4,
  mom: 5,
  ob: 70,
  os: 30,
  uRSI: false,
  udOpen: true,
  dPeriod: '1D',
};

export const inputConfig: InputConfig[] = [
  { id: 'maType', type: 'string', title: 'MA Type: ', defval: 'EMA', options: ['SMA', 'EMA', 'WMA', 'VWMA', 'SMMA', 'DEMA', 'TEMA', 'HullMA', 'ZEMA', 'TMA', 'SSMA'] },
  { id: 'maLen', type: 'int', title: 'MA - Length', defval: 6, min: 1 },
  { id: 'maSrc', type: 'source', title: 'MA - Source', defval: 'close', options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'volume'] },
  { id: 'exitFirst', type: 'bool', title: 'Exit Trade on 1st Opposite Renko Brick', defval: false },
  { id: 'rmiLen', type: 'int', title: 'RMI/RSI MA Length', defval: 4 },
  { id: 'mom', type: 'int', title: 'Momentum Length', defval: 5, min: 0 },
  { id: 'ob', type: 'int', title: 'Overbought', defval: 70 },
  { id: 'os', type: 'int', title: 'Oversold', defval: 30 },
  { id: 'uRSI', type: 'bool', title: 'Use RSI instead of RMI', defval: false },
  { id: 'udOpen', type: 'bool', title: 'Use Daily Open Line Filter', defval: true },
  { id: 'dPeriod', type: 'string', title: 'Period for Daily Open Line', defval: '1D', options: ['1D', '1W', '1M'] },
];

const LIME = '#00FF00';
const RED = '#FF0000';
const PURPLE = '#800080';
const GRAY = '#808080';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA Plot', color: String(color.new(LIME, 10)), lineWidth: 2 },
  { id: 'plot1', title: 'Daily Open', color: String(color.new(PURPLE, 40)), lineWidth: 2 },
];

export const metadata = {
  title: 'Renko+Moving Average+RMI Alert R3 by JustUncleL',
  shortTitle: 'RENKO_MA_RMI',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
const nz = (x: number, y = 0) => (isNaN(x) ? y : x);

function sourceOf(bars: Bar[], src: Source): number[] {
  return bars.map((b) => {
    switch (src) {
      case 'open': return b.open;
      case 'high': return b.high;
      case 'low': return b.low;
      case 'hl2': return (b.high + b.low) / 2;
      case 'hlc3': return (b.high + b.low + b.close) / 3;
      case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
      case 'volume': return b.volume ?? NaN;
      default: return b.close;
    }
  });
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RenkoMovingAverageRmiAlertR3ByInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.maLen);
  const rmiLen = Math.trunc(cfg.rmiLen);
  const mom = Math.trunc(cfg.mom);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = sourceOf(bars, cfg.maSrc);
  const srcS = S(src);

  // variant(type, src, len)
  const variant = (): number[] => {
    switch (cfg.maType) {
      case 'EMA': return A(ta.ema(srcS, len));
      case 'WMA': return A(ta.wma(srcS, len));
      case 'VWMA': return A(ta.vwma(srcS, len, S(bars.map((b) => b.volume ?? NaN))));
      case 'SMMA': {
        // v5 := na(v5[1]) ? sma(src, len) : (v5[1] * (len - 1) + src) / len
        const sma = A(ta.sma(srcS, len));
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          const prev = i > 0 ? out[i - 1] : NaN;
          out.push(isNaN(prev) ? sma[i] : (prev * (len - 1) + src[i]) / len);
        }
        return out;
      }
      case 'DEMA': {
        const v2 = A(ta.ema(srcS, len));
        const e2 = A(ta.ema(S(v2), len));
        return v2.map((v, i) => 2 * v - e2[i]);
      }
      case 'TEMA': {
        const v2 = A(ta.ema(srcS, len));
        const e2 = A(ta.ema(S(v2), len));
        const e3 = A(ta.ema(S(e2), len));
        return v2.map((v, i) => 3 * (v - e2[i]) + e3[i]);
      }
      case 'HullMA': {
        const half = A(ta.wma(srcS, len / 2));
        const full = A(ta.wma(srcS, len));
        return A(ta.wma(S(half.map((v, i) => 2 * v - full[i])), Math.round(Math.sqrt(len))));
      }
      case 'SSMA': {
        // Ehlers super smoother
        const a1 = Math.exp((-1.414 * 3.14159) / len);
        const b1 = 2 * a1 * Math.cos((1.414 * 3.14159) / len);
        const c2 = b1;
        const c3 = -a1 * a1;
        const c1 = 1 - c2 - c3;
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          const p1 = i > 0 ? src[i - 1] : NaN;
          const v1 = i > 0 ? out[i - 1] : NaN;
          const v2 = i > 1 ? out[i - 2] : NaN;
          out.push((c1 * (src[i] + nz(p1))) / 2 + c2 * nz(v1) + c3 * nz(v2));
        }
        return out;
      }
      case 'ZEMA': {
        const e1 = A(ta.ema(srcS, len));
        const e2 = A(ta.ema(S(e1), len));
        return e1.map((v, i) => v + (v - e2[i]));
      }
      case 'TMA': return A(ta.sma(ta.sma(srcS, len), len));
      default: return A(ta.sma(srcS, len));
    }
  };
  const ma = variant();
  const maS = S(ma);
  const rising = ta.rising(maS, 3).toArray();
  const falling = ta.falling(maS, 3).toArray();

  // Open line: security(ticker, dperiod, time, gaps_off, lookahead_on), newDay = change(start)
  const start = securityStarts(bars, cfg.dPeriod, chart);

  // RMI
  const up = A(ta.ema(S(src.map((v, i) => (i >= mom ? Math.max(v - src[i - mom], 0) : NaN))), rmiLen));
  const dn = A(ta.ema(S(src.map((v, i) => (i >= mom ? Math.max(src[i - mom] - v, 0) : NaN))), rmiLen));
  const rmi = cfg.uRSI
    ? A(ta.rsi(srcS, rmiLen))
    : up.map((u, i) => (eq(dn[i], 0) ? 0 : 100 - 100 / (1 + u / dn[i])));

  const maPlot: Array<{ time: number; value: number; color: string }> = [];
  const openPlot: Array<{ time: number; value: number; color: string }> = [];
  const markers: MarkerData[] = [];
  const lime = String(color.new(LIME, 10));
  const red = String(color.new(RED, 10));
  const purple = String(color.new(PURPLE, 40));
  const arrowUp = String(color.new(LIME, 20));
  const arrowDown = String(color.new(RED, 20));

  let direction = 0;
  let dopen = NaN;
  let olong = NaN;
  let oshort = NaN;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    // direction := rising(ma, 3) ? 1 : falling(ma, 3) ? -1 : nz(direction[1])
    direction = rising[i] ? 1 : falling[i] ? -1 : direction;
    maPlot.push({ time: t, value: ma[i], color: direction > 0 ? lime : direction < 0 ? red : 'transparent' });

    // change(start): na on the first bar; valuewhen(start[1] <= time, src, 0)
    const newDay = i > 0 && start[i] !== start[i - 1];
    const dopenNow = i > 0 && start[i - 1] <= t ? src[i] : NaN;
    dopen = newDay ? dopenNow : nz(dopen, dopenNow);
    openPlot.push({ time: t, value: dopen, color: newDay ? 'transparent' : purple });

    const pa = gt(b.close, b.open) && (!cfg.udOpen || gt(b.close, dopen)) ? 1
      : lt(b.close, b.open) && (!cfg.udOpen || lt(b.close, dopen)) ? -1 : 0;
    const has = direction;
    const prevRmi = i > 0 ? rmi[i - 1] : NaN;
    const r = rmi[i];
    const rmiSig = ge(r, prevRmi) && ge(r, cfg.ob) ? 1 : le(r, prevRmi) && le(r, cfg.os) ? -1 : 0;
    const long = pa === 1 && has === 1 && rmiSig === 1;
    const short = pa === -1 && has === -1 && rmiSig === -1;
    const prev = i > 0 ? bars[i - 1] : null;
    const downBrick = lt(b.close, b.open) && prev !== null && gt(prev.close, prev.open);
    const upBrick = gt(b.close, b.open) && prev !== null && lt(prev.close, prev.open);

    const pl = olong;
    olong = gt(pl, 0) && (has < 0 || (!cfg.uRSI && rmiSig <= 0) || (cfg.exitFirst && downBrick)) ? 0
      : nz(pl) === 0 && long ? 1
      : gt(pl, 0) && has === 1 ? pl + 1 : 0;
    const ps = oshort;
    oshort = gt(ps, 0) && (has > 1 || (!cfg.uRSI && rmiSig >= 0) || (cfg.exitFirst && upBrick)) ? 0
      : nz(ps) === 0 && short ? 1
      : gt(ps, 0) && has === -1 ? ps + 1 : 0;

    if (eq(olong, 1)) markers.push({ time: t, position: 'belowBar', shape: 'arrowUp', color: arrowUp });
    if (eq(oshort, 1)) markers.push({ time: t, position: 'aboveBar', shape: 'arrowDown', color: arrowDown });
    if (gt(pl, 0) && olong === 0) {
      markers.push({ time: t, position: 'belowBar', shape: 'xcross', color: GRAY, text: 'Exit\nBuy', textColor: '#2962FF' });
    }
    if (gt(ps, 0) && oshort === 0) {
      markers.push({ time: t, position: 'aboveBar', shape: 'xcross', color: GRAY, text: 'Exit\nSell', textColor: '#2962FF' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: maPlot, plot1: openPlot },
    markers,
  };
}

export const RenkoMovingAverageRmiAlertR3By = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
