/**
 * Kalman Hull Kijun
 *
 * A one-state Kalman filter (state x, error covariance P; prediction P + processNoise, gain
 * K = P / (P + measurementNoise), x += K * (price - x), P = (1 - K) * P) shared by all its calls: every call in a bar
 * updates the same state. Per bar the filter runs on the source with the measurement noise, then a Hull-like
 * combination: 2 * filter(source, noise / 2) - filter(source, noise), filtered again with round(sqrt(noise)). The base
 * line is the Donchian midpoint (average of the lowest and highest value) of that result over the Kijun period.
 * Long when the source is above the base, short when below. Gradient fills between the close and the base, a thin
 * "rim" fill of 0.08 * ATR(14) on the close, and optional candle colouring.
 * Alerts (alertcondition, `alerts` of the result): 'Kalman Hull Kijun Long' / 'Kalman Hull Kijun Short' on the bars
 * where the source is above / below the base.
 *
 * Reference: "Kalman Hull Kijun [BackQuant]" by BackQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BackQuant
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface KalmanHullKijunInputs {
  /** Kijun base period (Donchian length) */
  basePeriod: number;
  /** Kalman price source */
  src: SourceType;
  measurementNoise: number;
  processNoise: number;
  showKijun: boolean;
  showFill: boolean;
  /** Line width of the Kijun line (the port keeps the default width 3) */
  lineWidth: number;
  paintCandles: boolean;
  longColor: string;
  shortColor: string;
}

export const defaultInputs: KalmanHullKijunInputs = {
  basePeriod: 26,
  src: 'close',
  measurementNoise: 3.0,
  processNoise: 0.01,
  showKijun: true,
  showFill: true,
  lineWidth: 3,
  paintCandles: true,
  longColor: '#00ff00',
  shortColor: '#ff0000',
};

export const inputConfig: InputConfig[] = [
  { id: 'basePeriod', type: 'int', title: 'Kijun Base Period', defval: 26, group: 'Kijun Sen Base Settings' },
  { id: 'src', type: 'source', title: 'Kalman Price Source', defval: 'close', group: 'Kalman Hull Settings' },
  { id: 'measurementNoise', type: 'float', title: 'Measurement Noise', defval: 3.0, step: 1.0, group: 'Kalman Hull Settings',
    tooltip: 'Lookback Period/ Calculation Length' },
  { id: 'processNoise', type: 'float', title: 'Process Noise', defval: 0.01, step: 0.01, group: 'Kalman Hull Settings' },
  { id: 'showKijun', type: 'bool', title: 'Show Kijun on Chart?', defval: true, group: 'Plotting and UI Settings' },
  { id: 'showFill', type: 'bool', title: 'Show Gradient Fill', defval: true, group: 'Plotting and UI Settings' },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 3, group: 'Plotting and UI Settings' },
  { id: 'paintCandles', type: 'bool', title: 'Paint candles according to Trend?', defval: true, group: 'Plotting and UI Settings' },
  { id: 'longColor', type: 'color', title: 'Long Color', defval: '#00ff00', group: 'Plotting and UI Settings', inline: 'Col' },
  { id: 'shortColor', type: 'color', title: 'Short Color', defval: '#ff0000', group: 'Plotting and UI Settings', inline: 'Col' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Kalman Hull Kijun', color: '#00ff00', lineWidth: 3, visible: 'showKijun' },
  { id: 'plot1', title: 'Price (hidden)', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Rim Lower', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Rim Upper', color: '#2962ff', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Kalman Hull Kijun [BackQuant]',
  shortTitle: 'Kalman Hull Kijun [BackQuant]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<KalmanHullKijunInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const price = A(getSourceSeries(bars, cfg.src));

  // var float[] stateEstimate = array.new_float(5, na); var float[] errorCovariance = array.new_float(5, 100.0).
  // The 5 elements always hold the same value (same start, same update), so one state is kept.
  let state = NaN;
  let cov = 100.0;
  const kalman = (src: number, noise: number): number => {
    const predState = state; // simplified prediction
    const predCov = cov + cfg.processNoise;
    const kg = predCov / (predCov + noise);
    state = predState + kg * (src - predState);
    cov = (1 - kg) * predCov;
    return state;
  };

  const hma: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = price[i];
    // f_init: if na(stateEstimate[0]) => state = source, covariance = 1.0
    if (isNaN(state)) {
      state = p;
      cov = 1.0;
    }
    // kalmanFilteredPrice = f_kalman(pricesource, measurementNoise): not plotted, but it updates the shared state
    kalman(p, cfg.measurementNoise);
    // KHMA(src, len) = f_kalman(2 * f_kalman(src, len / 2) - f_kalman(src, len), math.round(math.sqrt(len)))
    const half = kalman(p, cfg.measurementNoise / 2);
    const full = kalman(p, cfg.measurementNoise);
    hma[i] = kalman(2 * half - full, Math.round(Math.sqrt(cfg.measurementNoise)));
  }

  // donchian(kalmanHMA, basePeriod) = math.avg(ta.lowest(src, len), ta.highest(src, len))
  const hmaSeries = Series.fromArray(bars, hma);
  const lo = A(ta.lowest(hmaSeries, cfg.basePeriod));
  const hi = A(ta.highest(hmaSeries, cfg.basePeriod));
  const base = lo.map((l, i) => (l + hi[i]) / 2);

  const atr = A(ta.atr(bars, 14));

  const col = (i: number) => (gt(price[i], base[i]) ? cfg.longColor : lt(price[i], base[i]) ? cfg.shortColor : color.white);
  const longStrong = String(color.new(cfg.longColor, 10));
  const longWeak = String(color.new(cfg.longColor, 85));
  const shortStrong = String(color.new(cfg.shortColor, 10));
  const shortWeak = String(color.new(cfg.shortColor, 85));
  const longRim = String(color.new(cfg.longColor, 35));
  const shortRim = String(color.new(cfg.shortColor, 35));

  const upTop: number[] = new Array(n);
  const upBottom: number[] = new Array(n);
  const upTopColor: Array<string | null> = new Array(n);
  const upBottomColor: Array<string | null> = new Array(n);
  const dnTop: number[] = new Array(n);
  const dnBottom: number[] = new Array(n);
  const dnTopColor: Array<string | null> = new Array(n);
  const dnBottomColor: Array<string | null> = new Array(n);
  const upRim: string[] = new Array(n);
  const dnRim: string[] = new Array(n);
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const above = gt(c, base[i]);
    const below = lt(c, base[i]);
    // fill(pPx, pBase, close > base ? close : base, close > base ? base : close,
    //      close > base ? color.new(longColor, 10) : na, close > base ? color.new(longColor, 85) : na, "Up Energy")
    upTop[i] = above ? c : base[i];
    upBottom[i] = above ? base[i] : c;
    upTopColor[i] = above ? longStrong : null;
    upBottomColor[i] = above ? longWeak : null;
    // fill(pPx, pBase, close < base ? base : close, close < base ? close : base,
    //      close < base ? color.new(shortColor, 10) : na, close < base ? color.new(shortColor, 85) : na, "Down Energy")
    dnTop[i] = below ? base[i] : c;
    dnBottom[i] = below ? c : base[i];
    dnTopColor[i] = below ? shortStrong : null;
    dnBottomColor[i] = below ? shortWeak : null;
    // fill(pPx, pRimUp, close > base ? color.new(longColor, 35) : na); fill(pPx, pRimDn, close < base ? ... : na)
    upRim[i] = above ? longRim : 'transparent';
    dnRim[i] = below ? shortRim : 'transparent';
    // barcolor(paintCandles ? col : na, title = "Trend Candles")
    if (cfg.paintCandles) barColors.push({ time: bars[i].time, color: col(i) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(base, color = col, title = "Kalman Hull Kijun", linewidth = lineW, display = showKijun ? all : none)
      plot0: bars.map((b, i) => ({ time: b.time, value: base[i], color: col(i) })),
      // pPx = plot(showFill ? close : na, title = "Price (hidden)", display = display.none)
      plot1: bars.map((b) => ({ time: b.time, value: cfg.showFill ? b.close : NaN })),
      // rim = ta.atr(14) * 0.08; pRimUp = plot(close - rim, display = display.none); pRimDn = plot(close + rim, ...)
      plot2: bars.map((b, i) => ({ time: b.time, value: b.close - atr[i] * 0.08 })),
      plot3: bars.map((b, i) => ({ time: b.time, value: b.close + atr[i] * 0.08 })),
    },
    fills: [
      // Up Energy
      { plot1: 'plot1', plot2: 'plot0',
        gradient: { topValue: upTop, bottomValue: upBottom, topColor: upTopColor, bottomColor: upBottomColor } },
      // Down Energy
      { plot1: 'plot1', plot2: 'plot0',
        gradient: { topValue: dnTop, bottomValue: dnBottom, topColor: dnTopColor, bottomColor: dnBottomColor } },
      // Up Rim
      { plot1: 'plot1', plot2: 'plot2', colors: upRim },
      // Down Rim
      { plot1: 'plot1', plot2: 'plot3', colors: dnRim },
    ],
    barColors,
    // long = pricesource > base; short = pricesource < base
    alerts: alertStates(alertConditions, bars, [
      base.map((v, i) => gt(price[i], v)),
      base.map((v, i) => lt(price[i], v)),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Kalman Hull Kijun Long', message: 'Kalman Hull Kijun Long {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Kalman Hull Kijun Short', message: 'Kalman Hull Kijun Short {{exchange}}:{{ticker}}' },
];

export const KalmanHullKijun = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
