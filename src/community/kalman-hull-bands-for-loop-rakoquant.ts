/**
 * Kalman Hull Bands For Loop
 *
 * A one-dimensional Kalman filter (measurement noise R, process noise Q) smooths the source; the baseline is the
 * Hull MA of the filtered source. The envelope is baseline +- multiplier * population standard deviation (computed
 * with a for loop over `sdLen` bars) of the residual source - baseline, or of the raw source. The regime turns bull
 * when the close crosses over the upper band and bear when it crosses under the lower band. The active rail
 * (the upper band in a bear regime, the lower band in a bull regime) is drawn in neon colours, the other rail
 * faint; the baseline and the optional candle paint take the regime colour.
 * Alerts (alertcondition, `alerts` of the result): 'RakoQuant Bull Breakout' / 'RakoQuant Bear Breakout' on the bars
 * where the close crosses over the upper band / under the lower band, confirmed bars only (an unconfirmed last bar:
 * `lastBarConfirmed` of the optional chart context, third argument).
 *
 * Reference: "RakoQuant | Kalman Hull Bands For Loop" by RakoQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © RakoQuant
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, PlotCandleData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface KalmanHullBandsForLoopRakoquantInputs {
  src: SourceType;
  /** R (measurement noise) */
  R: number;
  /** Q (process noise) */
  Q: number;
  /** Hull MA length of the baseline */
  hmaLen: number;
  /** Length of the loop standard deviation */
  sdLen: number;
  /** Deviation of the residual (source - baseline) or of the raw source */
  sdMode: 'Residual vs Baseline' | 'Raw Source';
  /** Deviation multiplier */
  mult: number;
  paintBars: boolean;
  showBaseline: boolean;
  /** Show the inactive rails (faint) */
  showInactive: boolean;
}

export const defaultInputs: KalmanHullBandsForLoopRakoquantInputs = {
  src: 'high',
  R: 0.045,
  Q: 0.0005,
  hmaLen: 37,
  sdLen: 16,
  sdMode: 'Residual vs Baseline',
  mult: 2.0,
  paintBars: true,
  showBaseline: true,
  showInactive: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'high', group: 'Source' },
  { id: 'R', type: 'float', title: 'R (Measurement Noise)', defval: 0.045, min: 0.000001, step: 0.001, group: 'Kalman Filter' },
  { id: 'Q', type: 'float', title: 'Q (Process Noise)', defval: 0.0005, min: 0.000001, step: 0.0001, group: 'Kalman Filter' },
  { id: 'hmaLen', type: 'int', title: 'Hull Length', defval: 37, min: 1, group: 'Baseline' },
  { id: 'sdLen', type: 'int', title: 'Deviation Length (Loop StdDev)', defval: 16, min: 2, group: 'Deviation' },
  { id: 'sdMode', type: 'string', title: 'Deviation Mode', defval: 'Residual vs Baseline', options: ['Residual vs Baseline', 'Raw Source'], group: 'Deviation' },
  { id: 'mult', type: 'float', title: 'Deviation Multiplier', defval: 2.0, min: 0.1, step: 0.1, group: 'Deviation' },
  { id: 'paintBars', type: 'bool', title: 'Paint Candles', defval: true, group: 'Visuals' },
  { id: 'showBaseline', type: 'bool', title: 'Show Baseline', defval: true, group: 'Visuals' },
  { id: 'showInactive', type: 'bool', title: 'Show Inactive Rails (Faint)', defval: true, group: 'Visuals' },
];

const BULL_COL = '#00ffc3';
const BEAR_COL = '#ff00d0';
const NEUT_COL = '#808080';
const INACTIVE_COL = String(color.new(NEUT_COL, 85));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Rail (Active)', color: BEAR_COL, lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Upper Rail (Inactive)', color: INACTIVE_COL, lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Lower Rail (Active)', color: BULL_COL, lineWidth: 2, style: 'linebr' },
  { id: 'plot3', title: 'Lower Rail (Inactive)', color: INACTIVE_COL, lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Baseline', color: String(color.new(NEUT_COL, 65)), lineWidth: 1 },
];

export const metadata = {
  title: 'RakoQuant | Kalman Hull Bands For Loop',
  shortTitle: 'RakoQuant | Kalman Hull Bands For Loop',
  overlay: true,
};

type Point = { time: number; value: number; color: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<KalmanHullBandsForLoopRakoquantInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { barColors: BarColorData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.src));

  // kalman_1d(src, R, Q): var xhat / P, initialised with the first non-na source
  const kSrc: number[] = new Array(n);
  let xhat = NaN;
  let P = NaN;
  for (let i = 0; i < n; i++) {
    const x = src[i];
    if (isNaN(xhat)) {
      xhat = x;
      P = 1.0;
    }
    const xhatminus = xhat;
    const Pminus = P + cfg.Q;
    const K = Pminus / (Pminus + cfg.R);
    xhat = xhatminus + K * (x - xhatminus);
    P = (1 - K) * Pminus;
    kSrc[i] = xhat;
  }

  // baseline = ta.hma(kSrc, hmaLen)
  const baseline = A(ta.hma(Series.fromArray(bars, kSrc), cfg.hmaLen));

  // stdev_loop(devSeries, sdLen): population standard deviation with two for loops (na while x[i] is na)
  const dev = bars.map((_b, i) => (cfg.sdMode === 'Residual vs Baseline' ? src[i] - baseline[i] : src[i]));
  const len = cfg.sdLen;
  const sd = bars.map((_b, j) => {
    const x = (i: number) => (j - i >= 0 ? dev[j - i] : NaN);
    let sum = 0.0;
    for (let i = 0; i <= len - 1; i++) sum += x(i);
    const mean = sum / len;
    let variance = 0.0;
    for (let i = 0; i <= len - 1; i++) {
      const d = x(i) - mean;
      variance += d * d;
    }
    return Math.sqrt(variance / len);
  });

  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const barColors: BarColorData[] = [];
  const candles: PlotCandleData[] = [];
  let state = 0; // var int RakoQuant = 0
  // ta.crossover / ta.crossunder: exact comparisons with the last bar where both values were not na
  let prevUp: [number, number] | null = null;
  let prevLo: [number, number] | null = null;
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const upper = baseline[i] + cfg.mult * sd[i];
    const lower = baseline[i] - cfg.mult * sd[i];
    let bullBreak = false;
    if (!isNaN(b.close) && !isNaN(upper)) {
      bullBreak = prevUp !== null && b.close > upper && prevUp[0] <= prevUp[1];
      prevUp = [b.close, upper];
    }
    let bearBreak = false;
    if (!isNaN(b.close) && !isNaN(lower)) {
      bearBreak = prevLo !== null && b.close < lower && prevLo[0] >= prevLo[1];
      prevLo = [b.close, lower];
    }
    if (bullBreak) state = 1;
    else if (bearBreak) state = -1;
    // buyAlert = barstate.isconfirmed and bullBreak; sellAlert = barstate.isconfirmed and bearBreak
    const confirmed = i < n - 1 || lastBarConfirmedOf(chart);
    buyFlags.push(confirmed && bullBreak);
    sellFlags.push(confirmed && bearBreak);

    const activeCol = state === 1 ? BULL_COL : state === -1 ? BEAR_COL : NEUT_COL;
    plot0.push({ time: b.time, value: state === -1 ? upper : NaN, color: BEAR_COL });
    plot1.push({ time: b.time, value: cfg.showInactive && state !== -1 ? upper : NaN, color: INACTIVE_COL });
    plot2.push({ time: b.time, value: state === 1 ? lower : NaN, color: BULL_COL });
    plot3.push({ time: b.time, value: cfg.showInactive && state !== 1 ? lower : NaN, color: INACTIVE_COL });
    plot4.push({ time: b.time, value: cfg.showBaseline ? baseline[i] : NaN, color: String(color.new(activeCol, 65)) });

    // cCol = paintBars ? activeCol : na; barcolor(cCol); plotcandle(..., color / wickcolor / bordercolor = cCol)
    if (cfg.paintBars) barColors.push({ time: b.time, color: activeCol });
    const c = cfg.paintBars ? activeCol : 'transparent';
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: c, wickColor: c,
      borderColor: c, forceOverlay: true });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    barColors,
    plotCandles: { candles },
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RakoQuant Bull Breakout', message: 'RakoQuant Kalman Hull Rail Bands turned BULL {{exchange}}:{{ticker}} (close={{close}})' },
  { id: 'alert1', title: 'RakoQuant Bear Breakout', message: 'RakoQuant Kalman Hull Rail Bands turned BEAR {{exchange}}:{{ticker}} (close={{close}})' },
];

export const KalmanHullBandsForLoopRakoquant = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
