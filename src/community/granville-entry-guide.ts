/**
 * Granville Entry Guide
 *
 * Three SMAs of the close (short / middle / long). The trend is up when the middle SMA is above the long SMA (and,
 * with the slope condition, both rise); down in the opposite case; the background shows it. A long entry is a pivot
 * low (of the short SMA or of the candle low) confirmed `right bars` later on a bullish candle with a higher close and
 * a rising short SMA, in an uptrend, with the short / middle SMA deviation inside +- the deviation rate on the pivot
 * confirmation bar; a short entry is the mirror with a pivot high. Entries are only shown between the start and stop
 * dates. An optional envelope at +- the deviation rate around the middle SMA.
 *
 * Reference: "Granville Entry Guide" by fightpm
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';

export interface GranvilleEntryGuideInputs {
  /** Start date (UNIX ms, Pine input.time) */
  startDate: number;
  /** Stop date (UNIX ms, Pine input.time) */
  stopDate: number;
  /** Short SMA length */
  len1: number;
  col1: string;
  /** Middle SMA length */
  len2: number;
  col2: string;
  /** Long SMA length */
  len3: number;
  col3: string;
  trendFilter: boolean;
  slopeCondition: boolean;
  showTrend: boolean;
  /** Pivot source: candle low / high or the short SMA */
  source: 'candle' | 'short ma';
  leftBars: number;
  rightBars: number;
  showEntryPoint: boolean;
  deviationFilter: boolean;
  /** Deviation rate (%) */
  deviationRate: number;
  showEnvelope: boolean;
}

export const defaultInputs: GranvilleEntryGuideInputs = {
  startDate: 1672790400000, // timestamp("2023-01-04 00:00")
  stopDate: 253402214400000, // timestamp("9999-12-31 00:00")
  len1: 5,
  col1: color.red,
  len2: 25,
  col2: color.green,
  len3: 75,
  col3: color.blue,
  trendFilter: true,
  slopeCondition: true,
  showTrend: true,
  source: 'short ma',
  leftBars: 3,
  rightBars: 1,
  showEntryPoint: true,
  deviationFilter: true,
  deviationRate: 2.0,
  showEnvelope: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'startDate', type: 'time', title: 'start date', defval: 1672790400000, group: 'period' },
  { id: 'stopDate', type: 'time', title: 'stop date', defval: 253402214400000, group: 'period' },
  { id: 'len1', type: 'int', title: '短期', defval: 5, inline: 'short', group: 'moving average' },
  { id: 'col1', type: 'color', title: '', defval: color.red, inline: 'short', group: 'moving average' },
  { id: 'len2', type: 'int', title: '中期', defval: 25, inline: 'middle', group: 'moving average' },
  { id: 'col2', type: 'color', title: '', defval: color.green, inline: 'middle', group: 'moving average' },
  { id: 'len3', type: 'int', title: '長期', defval: 75, inline: 'long', group: 'moving average' },
  { id: 'col3', type: 'color', title: '', defval: color.blue, inline: 'long', group: 'moving average' },
  { id: 'trendFilter', type: 'bool', title: 'trend filter', defval: true, group: 'trend filter' },
  { id: 'slopeCondition', type: 'bool', title: 'slope condition', defval: true, group: 'trend filter' },
  { id: 'showTrend', type: 'bool', title: 'visible trend', defval: true, group: 'trend filter' },
  { id: 'source', type: 'string', title: 'source', defval: 'short ma', options: ['candle', 'short ma'], group: 'judge dip and retracement' },
  { id: 'leftBars', type: 'int', title: 'left bars', defval: 3, min: 1, display: 'data_window', group: 'judge dip and retracement' },
  { id: 'rightBars', type: 'int', title: 'right bars', defval: 1, min: 1, display: 'data_window', group: 'judge dip and retracement' },
  { id: 'showEntryPoint', type: 'bool', title: 'show entry point', defval: true, group: 'judge dip and retracement' },
  { id: 'deviationFilter', type: 'bool', title: 'deviation filter', defval: true, group: 'deviation filter' },
  { id: 'deviationRate', type: 'float', title: 'deviation rate(%)±', defval: 2.0, min: 0, step: 0.1, display: 'data_window', group: 'deviation filter' },
  { id: 'showEnvelope', type: 'bool', title: 'show envelope', defval: false, group: 'deviation filter' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'short', color: color.red, lineWidth: 2 },
  { id: 'plot1', title: 'middle', color: color.green, lineWidth: 2 },
  { id: 'plot2', title: 'long', color: color.blue, lineWidth: 2 },
  { id: 'plot3', title: 'short slope', color: color.red, lineWidth: 1, display: 'data_window' },
  { id: 'plot4', title: 'middle slope', color: color.green, lineWidth: 1, display: 'data_window' },
  { id: 'plot5', title: 'long slope', color: color.blue, lineWidth: 1, display: 'data_window' },
  { id: 'plot6', title: 'deviation(%)', color: color.black, lineWidth: 1, display: 'data_window' },
  { id: 'plot7', title: 'deviation+', color: String(color.new(color.green, 70)), lineWidth: 1 },
  { id: 'plot8', title: 'deviation-', color: String(color.new(color.green, 70)), lineWidth: 1 },
];

export const metadata = {
  title: 'Granville Entry Guide',
  shortTitle: 'Granville Entry Guide',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<GranvilleEntryGuideInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  const ma1 = A(ta.sma(S(close), cfg.len1));
  const ma2 = A(ta.sma(S(close), cfg.len2));
  const ma3 = A(ta.sma(S(close), cfg.len3));
  // slopeN = ta.change(maN, 1)
  const change = (a: number[]) => a.map((v, i) => (i > 0 ? v - a[i - 1] : NaN));
  const slope1 = change(ma1);
  const slope2 = change(ma2);
  const slope3 = change(ma3);

  const deviation = bars.map((_b, i) => ((ma1[i] - ma2[i]) / ma2[i]) * 100.0);
  const upper = ma2.map((v) => v * (1 + cfg.deviationRate / 100.0));
  const lower = ma2.map((v) => v * (1 - cfg.deviationRate / 100.0));
  const candle = cfg.source === 'candle';
  const pl = A(ta.pivotlow(S(candle ? bars.map((b) => b.low) : ma1), cfg.leftBars, cfg.rightBars));
  const ph = A(ta.pivothigh(S(candle ? bars.map((b) => b.high) : ma1), cfg.leftBars, cfg.rightBars));
  // bool(x): false for na and 0
  const bool = (x: number) => !isNaN(x) && x !== 0;

  const bgUp = String(color.new(color.red, 90));
  const bgDown = String(color.new(color.blue, 90));
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const tMs = t * 1000;
    const inDateRange = tMs >= cfg.startDate && tMs <= cfg.stopDate;
    const uptrend = cfg.slopeCondition
      ? gt(ma2[i], ma3[i]) && gt(slope2[i], 0) && gt(slope3[i], 0)
      : gt(ma2[i], ma3[i]);
    const downtrend = cfg.slopeCondition
      ? lt(ma2[i], ma3[i]) && lt(slope2[i], 0) && lt(slope3[i], 0)
      : lt(ma2[i], ma3[i]);
    // bgcolor((uptrend and showTrend) ? color.new(color.red, 90) : na); bgcolor((downtrend and showTrend) ? ...blue...)
    // (bgcolor0: the uptrend call, bgcolor1: the downtrend call)
    if (cfg.showTrend && downtrend) bgColors.push({ id: 'bgcolor1', time: t, color: bgDown });
    else if (cfg.showTrend && uptrend) bgColors.push({ id: 'bgcolor0', time: t, color: bgUp });

    // inRange = math.abs(deviation[rightBars]) < deviationRate
    const devPast = i - cfg.rightBars >= 0 ? deviation[i - cfg.rightBars] : NaN;
    const inRange = lt(Math.abs(devPast), cfg.deviationRate);
    const prevClose = i > 0 ? close[i - 1] : NaN;
    const b = bars[i];
    const dip = bool(pl[i]) && gt(b.close, b.open) && gt(b.close, prevClose) && gt(slope1[i], 0);
    const trueDip = cfg.deviationFilter ? inRange && dip : dip;
    const longCondition = cfg.trendFilter ? inDateRange && uptrend && trueDip : inDateRange && trueDip;
    const retracement = bool(ph[i]) && lt(b.close, b.open) && lt(b.close, prevClose) && lt(slope1[i], 0);
    const trueRetracement = cfg.deviationFilter ? inRange && retracement : retracement;
    const shortCondition = cfg.trendFilter
      ? inDateRange && downtrend && trueRetracement
      : inDateRange && trueRetracement;
    if (cfg.showEntryPoint && longCondition) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: color.red, size: 'tiny' });
    }
    if (cfg.showEntryPoint && shortCondition) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: color.blue, size: 'tiny' });
    }
  }

  const P = (vals: number[], c: string) => bars.map((b, i) => ({
    time: b.time, value: Number.isFinite(vals[i]) ? vals[i] : NaN, color: c,
  }));
  const envColor = String(color.new(cfg.col2, 70));
  const nan = new Array<number>(n).fill(NaN);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P(ma1, cfg.col1),
      plot1: P(ma2, cfg.col2),
      plot2: P(ma3, cfg.col3),
      plot3: P(slope1, cfg.col1),
      plot4: P(slope2, cfg.col2),
      plot5: P(slope3, cfg.col3),
      plot6: P(deviation, color.black),
      plot7: P(cfg.showEnvelope ? upper : nan, envColor),
      plot8: P(cfg.showEnvelope ? lower : nan, envColor),
    },
    // fill(p1, p2, color.new(col2, 90))
    fills: [{ plot1: 'plot7', plot2: 'plot8', colors: new Array<string>(n).fill(String(color.new(cfg.col2, 90))) }],
    bgColors,
    markers,
  };
}

export const GranvilleEntryGuide = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
