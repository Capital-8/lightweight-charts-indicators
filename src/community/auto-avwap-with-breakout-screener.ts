/**
 * Auto AVWAP (Anchored VWAP) with Breakout Screener
 *
 * Two anchored VWAPs that re-anchor by themselves. The high AVWAP (of the high, or hlc3) is anchored at the highest
 * high so far, the low AVWAP (of the low, or hlc3) at the lowest low so far. A smoothed stochastic RSI (K = moving
 * average of the stochastic of the RSI, D = SMA of K) drives the "next" anchors: the next high anchor moves to each
 * new high while D is under the lower band (or the high makes a new pivot high), the next low anchor likewise with D
 * above the upper band. After a move up (D above the upper band) and a K drop under D and under the lower reversal
 * level, the high AVWAP takes the next high anchor; the low AVWAP does the same after a move down. Breakout: the close
 * crosses above the high AVWAP (triangle above the bar and a circle at the bar midpoint).
 *
 * Alerts (alertcondition, `alerts` of the result): "Resistance Broken" when the open (or the close, see useOpen) is
 * above the high AVWAP, "Support Broken" when it is below the low AVWAP, and "Breakout" for either of them.
 *
 * Reference: "Auto AVWAP (Anchored-VWAP) with Breakout Screener" by manoharvs
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Electrified (electrifiedtrading)
 */

import { taCore, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type AutoAvwapKMode = 'SMA' | 'EMA' | 'WMA' | 'VWMA' | 'VAWMA';

export interface AutoAvwapWithBreakoutScreenerInputs {
  /** Use the high and the low instead of hlc3 for the AVWAPs */
  useHiLow: boolean;
  /** Use the open instead of the close for the alerts */
  useOpen: boolean;
  /** Moving average of the stochastic that gives K */
  kMode: AutoAvwapKMode;
  /** Source of the RSI */
  src: SourceType;
  /** K smoothing length */
  smoothK: number;
  /** D smoothing length */
  smoothD: number;
  /** RSI length */
  lengthRSI: number;
  /** Stochastic length */
  lengthStoch: number;
  lowerBand: number;
  upperBand: number;
  /** Level that, when broken down, signals a reversal */
  lowerReversal: number;
  /** Level that, when broken up, signals a reversal */
  upperReversal: number;
}

export const defaultInputs: AutoAvwapWithBreakoutScreenerInputs = {
  useHiLow: true,
  useOpen: true,
  kMode: 'WMA',
  src: 'hlc3',
  smoothK: 4,
  smoothD: 4,
  lengthRSI: 55,
  lengthStoch: 21,
  lowerBand: 20,
  upperBand: 80,
  lowerReversal: 20,
  upperReversal: 80,
};

export const inputConfig: InputConfig[] = [
  { id: 'useHiLow', type: 'bool', title: 'Use High/Low instead of HLC3', defval: true, group: 'Anchored VWAP' },
  { id: 'useOpen', type: 'bool', title: 'Use open instead of close for alerts.', defval: true, group: 'Anchored VWAP' },
  { id: 'kMode', type: 'string', title: 'K Mode', defval: 'WMA', options: ['SMA', 'EMA', 'WMA', 'VWMA', 'VAWMA'], group: 'Stochastic RSI' },
  { id: 'src', type: 'source', title: 'Source', defval: 'hlc3', group: 'Stochastic RSI' },
  { id: 'smoothK', type: 'int', title: 'K', defval: 4, min: 1, group: 'Stochastic RSI' },
  { id: 'smoothD', type: 'int', title: 'D', defval: 4, min: 1, group: 'Stochastic RSI' },
  { id: 'lengthRSI', type: 'int', title: 'RSI', defval: 55, min: 1, group: 'Lengths' },
  { id: 'lengthStoch', type: 'int', title: 'Stochastic', defval: 21, min: 1, group: 'Lengths' },
  { id: 'lowerBand', type: 'int', title: 'Lower', defval: 20, min: 0, max: 50, group: 'Band' },
  { id: 'upperBand', type: 'int', title: 'Upper', defval: 80, min: 50, max: 100, group: 'Band' },
  { id: 'lowerReversal', type: 'int', title: 'Lower', defval: 20, min: 0, max: 100, group: 'Reversal' },
  { id: 'upperReversal', type: 'int', title: 'Upper', defval: 80, min: 0, max: 100, group: 'Reversal' },
];

const HIGH_NEXT = String(color.new(color.red, 75));
const LOW_NEXT = String(color.new(color.green, 75));
const HIGH = String(color.new(color.red, 50));
const LOW = String(color.new(color.green, 50));
const BREAKOUT = String(color.new(color.green, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'High Next', color: HIGH_NEXT, lineWidth: 1, style: 'circles' },
  { id: 'plot1', title: 'Low Next', color: LOW_NEXT, lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'High', color: HIGH, lineWidth: 2, style: 'circles' },
  { id: 'plot3', title: 'Low', color: LOW, lineWidth: 2, style: 'circles' },
  { id: 'plot4', title: 'Breakout Above High Overlay', color: BREAKOUT, lineWidth: 2, style: 'circles' },
];

export const metadata = {
  title: 'Auto AVWAP (Anchored-VWAP) with Breakout Screener',
  shortTitle: 'Auto AVWAP Breakout',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Pine nz(): na and +-infinity give the replacement */
const nz = (x: number, r: number) => (Number.isFinite(x) ? x : r);

export function calculate(
  bars: Bar[],
  inputs: Partial<AutoAvwapWithBreakoutScreenerInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const volume = bars.map((b) => b.volume ?? NaN);
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);

  // vawma(src, len): sum(src[len - m] * volume[len - m] * m) / sum(volume[len - m] * m), m = 1..len
  const vawma = (x: number[], len: number): number[] => x.map((_v, bar) => {
    let sum = 0;
    let vol = 0;
    for (let m = 1; m <= len; m++) {
      const i = len - m;
      const v = bar - i >= 0 ? volume[bar - i] * m : NaN;
      vol = vol + v;
      sum = sum + (bar - i >= 0 ? x[bar - i] : NaN) * v;
    }
    return sum / vol;
  });
  const getMA = (x: number[], mode: AutoAvwapKMode, len: number): number[] => {
    switch (mode) {
      case 'WMA': return taCore.wma(x, len);
      case 'EMA': return taCore.ema(x, len);
      case 'VWMA': return taCore.vwma(x, len, volume);
      case 'VAWMA': return vawma(x, len);
      default: return taCore.sma(x, len);
    }
  };

  const rsi1 = taCore.rsi(src, cfg.lengthRSI);
  const stoch = taCore.stoch(rsi1, rsi1, rsi1, cfg.lengthStoch);
  const k = getMA(stoch, cfg.kMode, cfg.smoothK);
  const d = taCore.sma(k, cfg.smoothD);

  const hiAVWAP: number[] = new Array(n);
  const loAVWAP: number[] = new Array(n);
  const hiAVWAPNext: number[] = new Array(n);
  const loAVWAPNext: number[] = new Array(n);
  if (n > 0) {
    let hi = bars[0].high;
    let lo = bars[0].low;
    let phi = bars[0].high;
    let plo = bars[0].low;
    let state = 0;
    let hiS = 0;
    let loS = 0;
    let hiV = 0;
    let loV = 0;
    let hiSNext = 0;
    let loSNext = 0;
    let hiVNext = 0;
    let loVNext = 0;
    for (let i = 0; i < n; i++) {
      const { high, low, close } = bars[i];
      if (lt(d[i], cfg.lowerBand) || gt(high, phi)) {
        phi = high;
        hiSNext = 0;
        hiVNext = 0;
      }
      if (gt(d[i], cfg.upperBand) || lt(low, plo)) {
        plo = low;
        loSNext = 0;
        loVNext = 0;
      }
      if (gt(high, hi)) {
        hi = high;
        hiS = 0;
        hiV = 0;
      }
      if (lt(low, lo)) {
        lo = low;
        loS = 0;
        loV = 0;
      }
      const hlc3 = (high + low + close) / 3;
      const vwapHi = cfg.useHiLow ? high : hlc3;
      const vwapLo = cfg.useHiLow ? low : hlc3;
      const vol = volume[i];
      hiS += vwapHi * vol;
      loS += vwapLo * vol;
      hiV += vol;
      loV += vol;
      hiSNext += vwapHi * vol;
      loSNext += vwapLo * vol;
      hiVNext += vol;
      loVNext += vol;

      if (state !== -1 && lt(d[i], cfg.lowerBand)) state = -1;
      else if (state !== 1 && gt(d[i], cfg.upperBand)) state = 1;
      if (gt(hi, phi) && state === 1 && lt(k[i], d[i]) && lt(k[i], cfg.lowerReversal)) {
        hi = phi;
        hiS = hiSNext;
        hiV = hiVNext;
      }
      if (lt(lo, plo) && state === -1 && gt(k[i], d[i]) && gt(k[i], cfg.upperReversal)) {
        lo = plo;
        loS = loSNext;
        loV = loVNext;
      }
      hiAVWAP[i] = hiS / hiV;
      loAVWAP[i] = loS / loV;
      hiAVWAPNext[i] = hiSNext / hiVNext;
      loAVWAPNext[i] = loSNext / loVNext;
    }
  }

  // breakout_above_high = close > hiAVWAP and nz(close[1], close) <= nz(hiAVWAP[1], hiAVWAP)
  const breakout = bars.map((b, i) => gt(b.close, hiAVWAP[i])
    && le(nz(i > 0 ? bars[i - 1].close : NaN, b.close), nz(i > 0 ? hiAVWAP[i - 1] : NaN, hiAVWAP[i])));

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    if (breakout[i]) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleUp', color: color.green, size: 'small' });
    }
  }

  // alertValue = useOpen ? open : close; resistance = alertValue - hiAVWAP; support = alertValue - loAVWAP
  const resistanceBroken = bars.map((b, i) => gt((cfg.useOpen ? b.open : b.close) - hiAVWAP[i], 0));
  const supportBroken = bars.map((b, i) => lt((cfg.useOpen ? b.open : b.close) - loAVWAP[i], 0));

  const fin = (x: number) => (Number.isFinite(x) ? x : NaN);
  const line = (values: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: fin(values[i]), color: c }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(hiAVWAPNext, HIGH_NEXT),
      plot1: line(loAVWAPNext, LOW_NEXT),
      plot2: line(hiAVWAP, HIGH),
      plot3: line(loAVWAP, LOW),
      plot4: bars.map((b, i) => ({ time: b.time, value: breakout[i] ? (b.high + b.low) / 2 : NaN, color: BREAKOUT })),
    },
    markers,
    // alertcondition(resistance > 0 or support < 0) / (resistance > 0) / (support < 0)
    alerts: alertStates(alertConditions, bars, [
      resistanceBroken.map((r, i) => r || supportBroken[i]),
      resistanceBroken,
      supportBroken,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Breakout (▲▼)', message: 'Breakout ({{ticker}} {{interval}})' },
  { id: 'alert1', title: 'Resistance Broken ▲', message: 'Resistance Broken ▲ ({{ticker}} {{interval}})' },
  { id: 'alert2', title: 'Support Broken ▼', message: 'Support Broken ▼ ({{ticker}} {{interval}})' },
];

export const AutoAvwapWithBreakoutScreener = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
