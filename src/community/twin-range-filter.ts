/**
 * Twin Range Filter
 *
 * As the original: two smooth average ranges of the source, EMA(EMA(|source - source[1]|, t), 2t - 1) * m for the fast
 * (27, 1.6) and slow (55, 2) settings, averaged; the range filter follows the source but moves only when the source
 * leaves the range around it (na until the range exists). Long condition = source above the filter, not equal to the
 * source of the bar before, with the filter rising (count of rising bars > 0); short condition the mirror; CondIni = 1
 * on a long condition, -1 on a short one, else the value of the bar before. Long label below the bar (shape0) on a
 * long condition after CondIni -1, Short label above it (shape1) on a short condition after CondIni 1.
 * Alerts (alertcondition, `alerts` of the result): 'Long' and 'Short' on the bars of the labels.
 * As the original, only the two labels are drawn (no filter line, fills or bar colours).
 *
 * Reference: "Twin Range Filter" by colinmck
 */

import { taCore, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TwinRangeFilterInputs {
  src: SourceType;
  fastPeriod: number;
  fastRange: number;
  slowPeriod: number;
  slowRange: number;
}

export const defaultInputs: TwinRangeFilterInputs = {
  src: 'close',
  fastPeriod: 27,
  fastRange: 1.6,
  slowPeriod: 55,
  slowRange: 2,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'fastPeriod', type: 'int', title: 'Fast period', defval: 27, min: 1 },
  { id: 'fastRange', type: 'float', title: 'Fast range', defval: 1.6, min: 0.1 },
  { id: 'slowPeriod', type: 'int', title: 'Slow period', defval: 55, min: 1 },
  { id: 'slowRange', type: 'float', title: 'Slow range', defval: 2, min: 0.1 },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Twin Range Filter',
  shortTitle: 'TRF',
  overlay: true,
};

/** smoothrng(x, t, m) of the original */
export function smoothRange(x: number[], t: number, m: number): number[] {
  const absChange = x.map((v, i) => (i > 0 ? Math.abs(v - x[i - 1]) : NaN));
  return taCore.ema(taCore.ema(absChange, t), t * 2 - 1).map((v) => v * m);
}

/** rngfilt(x, r) of the original: nz() of the filter of the bar before */
export function rangeFilter(x: number[], r: number[]): number[] {
  const out: number[] = new Array(x.length);
  let prevRaw = NaN;
  for (let i = 0; i < x.length; i++) {
    const p = Number.isFinite(prevRaw) ? prevRaw : 0;
    const v = x[i] > p ? (x[i] - r[i] < p ? p : x[i] - r[i]) : (x[i] + r[i] > p ? p : x[i] + r[i]);
    out[i] = Number.isFinite(v) ? v : NaN;
    prevRaw = out[i];
  }
  return out;
}

export function calculate(bars: Bar[], inputs: Partial<TwinRangeFilterInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] }
  & { alerts: AlertConditionState[] } {
  const { fastPeriod, fastRange, slowPeriod, slowRange, src } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const source = getSourceSeries(bars, src).toArray().map((v) => v ?? NaN);
  const smrng1 = smoothRange(source, fastPeriod, fastRange);
  const smrng2 = smoothRange(source, slowPeriod, slowRange);
  const smrng = smrng1.map((v, i) => (v + smrng2[i]) / 2);
  const filt = rangeFilter(source, smrng);

  // upward / downward: counts of rising / falling filter bars (na comparisons false)
  const upward: number[] = new Array(n);
  const downward: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = filt[i], f1 = i > 0 ? filt[i - 1] : NaN;
    const up1 = i > 0 ? upward[i - 1] : 0, dn1 = i > 0 ? downward[i - 1] : 0;
    upward[i] = f > f1 ? up1 + 1 : f < f1 ? 0 : up1;
    downward[i] = f < f1 ? dn1 + 1 : f > f1 ? 0 : dn1;
  }

  // longCond := source > filt and source > source[1] and upward > 0 or source > filt and source < source[1] and
  // upward > 0 (shortCond the mirror); CondIni := longCond ? 1 : shortCond ? -1 : CondIni[1] (na on the first bar);
  // long = longCond and CondIni[1] == -1, short = shortCond and CondIni[1] == 1
  const longFlags: boolean[] = [];
  const shortFlags: boolean[] = [];
  const markers: MarkerData[] = [];
  let condIni = NaN;
  for (let i = 0; i < n; i++) {
    const s = source[i];
    const s1 = i > 0 ? source[i - 1] : NaN;
    const longCond = (s > filt[i] && s > s1 && upward[i] > 0) || (s > filt[i] && s < s1 && upward[i] > 0);
    const shortCond = (s < filt[i] && s < s1 && downward[i] > 0) || (s < filt[i] && s > s1 && downward[i] > 0);
    const long = longCond && condIni === -1;
    const short = shortCond && condIni === 1;
    longFlags.push(long);
    shortFlags.push(short);
    if (long) {
      markers.push({ id: 'shape0', time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#00E676', text: 'Long', textColor: '#000000', size: 'tiny' });
    }
    if (short) {
      markers.push({ id: 'shape1', time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#FF5252', text: 'Short', textColor: '#FFFFFF', size: 'tiny' });
    }
    condIni = longCond ? 1 : shortCond ? -1 : condIni;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    // the original plots only the two labels
    plots: {},
    markers,
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long', message: 'Long' },
  { id: 'alert1', title: 'Short', message: 'Short' },
];

export const TwinRangeFilter = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
