/**
 * MACD Based Price Forecasting [LuxAlgo]
 *
 * The trend is up when the MACD is above its signal line (or above 0 with 'Trend Determination' = 'MACD') and down
 * when it is below. The reference price of a trend is the close of its first bar. On each bar of a trend the script
 * stores close - reference price in a memory for "bar k of an uptrend" (or of a downtrend), with at most 'Maximum
 * Memory' values per k.
 * When the MACD crosses its signal (or 0), a forecast is drawn from the current bar: for each next bar of the trend
 * the reference price plus the top, average and bottom percentile of the stored moves. The average is a line, the
 * area between the top and bottom percentiles is filled. Only the last forecast is kept.
 * The reference price is plotted, and the area between it and the close is filled with a gradient.
 *
 * Chart values read: the chart background colour (the transparent end of the gradient). Without a chart context it
 * is the dark theme colour #0F0F0F; the colour is fully transparent, so the drawing is the same.
 *
 * Reference: "MACD Based Price Forecasting [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, Series, array, color, barTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PolylineData } from '../types';
import { backgroundColorOf, type ChartContext } from '../chart-context';

export interface MacdBasedPriceForecastingInputs {
  /** Fast Length */
  fast: number;
  /** Slow Length */
  slow: number;
  /** Signal Length */
  sigLen: number;
  /** Trend Determination */
  trend: 'MACD' | 'MACD - Signal';
  /** Maximum Memory: stored moves per bar of a trend */
  maxMemory: number;
  /** Forecasting Length */
  fcast: number;
  /** Top Percentile */
  upPer: number;
  /** Average Percentage */
  midPer: number;
  /** Bottom Percentile */
  dnPer: number;
  /** Line Color (uptrend) */
  upLine: string;
  /** Line Color (downtrend) */
  dnLine: string;
  /** Areas (uptrend) */
  upArea: string;
  /** Areas (downtrend) */
  dnArea: string;
  /** Signal Area */
  signalArea: boolean;
  signalBull: string;
  signalBear: string;
}

export const defaultInputs: MacdBasedPriceForecastingInputs = {
  fast: 12,
  slow: 26,
  sigLen: 9,
  trend: 'MACD - Signal',
  maxMemory: 50,
  fcast: 100,
  upPer: 80,
  midPer: 50,
  dnPer: 20,
  upLine: '#3179f5',
  dnLine: '#ff5d00',
  upArea: 'rgba(49, 121, 245, 0.2)',
  dnArea: 'rgba(255, 93, 0, 0.2)',
  signalArea: true,
  signalBull: 'rgba(8, 153, 129, 0.5)',
  signalBear: 'rgba(242, 54, 69, 0.5)',
};

export const inputConfig: InputConfig[] = [
  { id: 'fast', type: 'int', title: 'Fast Length', defval: 12, min: 2, group: 'MACD' },
  { id: 'slow', type: 'int', title: 'Slow Length', defval: 26, min: 2, group: 'MACD' },
  { id: 'sigLen', type: 'int', title: 'Signal Length', defval: 9, min: 2, group: 'MACD' },
  { id: 'trend', type: 'string', title: 'Trend Determination', defval: 'MACD - Signal', options: ['MACD', 'MACD - Signal'], group: 'MACD' },
  { id: 'maxMemory', type: 'int', title: 'Maximum Memory', defval: 50, min: 2, group: 'Forecast' },
  { id: 'fcast', type: 'int', title: 'Forecasting Length', defval: 100, min: 1, group: 'Forecast' },
  { id: 'upPer', type: 'int', title: 'Top Percentile', defval: 80, group: 'Forecast' },
  { id: 'midPer', type: 'int', title: 'Average Percentage', defval: 50, group: 'Forecast' },
  { id: 'dnPer', type: 'int', title: 'Bottom Percentile', defval: 20, group: 'Forecast' },
  { id: 'upLine', type: 'color', title: 'Line Color', defval: '#3179f5', inline: 'css', group: 'Style' },
  { id: 'dnLine', type: 'color', title: '', defval: '#ff5d00', inline: 'css', group: 'Style' },
  { id: 'upArea', type: 'color', title: 'Areas', defval: 'rgba(49, 121, 245, 0.2)', inline: 'areas', group: 'Style' },
  { id: 'dnArea', type: 'color', title: '', defval: 'rgba(255, 93, 0, 0.2)', inline: 'areas', group: 'Style' },
  { id: 'signalArea', type: 'bool', title: 'Signal Area', defval: true, inline: 'signal', group: 'Style' },
  { id: 'signalBull', type: 'color', title: '', defval: 'rgba(8, 153, 129, 0.5)', inline: 'signal', group: 'Style' },
  { id: 'signalBear', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.5)', inline: 'signal', group: 'Style' },
];

const GRAY = '#787B86';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Reference Price', color: GRAY, lineWidth: 1 },
  { id: 'plot1', title: 'Plot', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'MACD Based Price Forecasting [LuxAlgo]',
  shortTitle: 'LuxAlgo - MACD Based Price Forecasting',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a != b when they differ by more (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdBasedPriceForecastingInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const { maxMemory, fcast } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const [macdS, signalS] = ta.macd(close, cfg.fast, cfg.slow, cfg.sigLen);
  const macd = A(macdS);
  const signal = A(signalS);
  // trigger = ta.cross(macd, 0) or ta.cross(macd, signal)
  const base = cfg.trend === 'MACD' ? new Array<number>(n).fill(0) : signal;
  const trigger = ta.cross(macdS, Series.fromArray(bars, base)).toArray().map((v) => Boolean(v));

  // color.new(chart.bg_color, 100)
  const clear = String(color.new(backgroundColorOf(chart), 100));

  // memory: one list of vectors for the uptrends and one for the downtrends; vector k holds the moves of bar k of a trend
  const upHolder: number[][] = [];
  const dnHolder: number[][] = [];
  let upIdx = 0;
  let dnIdx = 0;
  let upInit = NaN;
  let dnInit = NaN;
  let prevUp = false;
  let prevDn = false;
  let polylines: PolylineData[] = [];

  const populate = (holder: number[][], idx: number, value: number) => {
    if (holder.length < idx + 1) holder.push([]);
    holder[idx].unshift(value);
    if (holder[idx].length > maxMemory) holder[idx].pop();
  };

  const refPlot: Array<{ time: number; value: number; color?: string }> = [];
  const pricePlot: Array<{ time: number; value: number }> = [];
  const topValue: number[] = [];
  const bottomValue: number[] = [];
  const topColor: Array<string | null> = [];
  const bottomColor: Array<string | null> = [];
  let prevInit = NaN;

  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    // var uptrend_init_price = close, var downtrend_init_price = close
    if (i === 0) {
      upInit = c;
      dnInit = c;
    }
    const uptrend = gt(macd[i], base[i]);
    const downtrend = gt(base[i], macd[i]);
    if (uptrend && !prevUp) upInit = c;
    if (downtrend && !prevDn) dnInit = c;
    const initValue = uptrend ? upInit : dnInit;

    if (uptrend) populate(upHolder, upIdx, c - upInit);
    if (downtrend) populate(dnHolder, dnIdx, c - dnInit);
    upIdx = !uptrend ? 0 : upIdx + 1;
    dnIdx = !downtrend ? 0 : dnIdx + 1;

    if (trigger[i]) {
      const holder = uptrend ? upHolder : dnHolder;
      const idx = uptrend ? upIdx : dnIdx;
      const init = uptrend ? upInit : dnInit;
      const upper: Array<{ time: number; price: number }> = [];
      const mid: Array<{ time: number; price: number }> = [];
      const lower: Array<{ time: number; price: number }> = [];
      const last = Math.min(idx + fcast, holder.length - 1);
      let x = 0;
      // for i = idx-1 to math.min(idx+fcast, max_horizon-1): counts down when the end is below the start
      const step = last >= idx - 1 ? 1 : -1;
      for (let k = idx - 1; step > 0 ? k <= last : k >= last; k += step) {
        if (k < 0 || k >= holder.length) {
          throw new Error(`Index ${k} is out of bounds, array size is ${holder.length}`);
        }
        const vector = holder[k];
        const time = barTime(bars, i + x);
        upper.push({ time, price: init + array.percentile_linear_interpolation(vector, cfg.upPer) });
        mid.push({ time, price: init + array.percentile_linear_interpolation(vector, cfg.midPer) });
        lower.unshift({ time, price: init + array.percentile_linear_interpolation(vector, cfg.dnPer) });
        x += 1;
      }
      // polyline.delete(polyline.new(...)[1]): the forecast before this one is deleted
      polylines = [
        { points: mid, lineColor: uptrend ? cfg.upLine : cfg.dnLine },
        { points: upper.concat(lower), lineColor: 'transparent', fillColor: uptrend ? cfg.upArea : cfg.dnArea },
      ];
    }

    // plot(init_value, "Reference Price", init_value != init_value[1] ? na : color.gray)
    refPlot.push(ne(initValue, prevInit) ? { time: bars[i].time, value: initValue, color: 'transparent' }
      : { time: bars[i].time, value: initValue, color: GRAY });
    pricePlot.push({ time: bars[i].time, value: c });
    topValue.push(Math.max(c, initValue));
    bottomValue.push(Math.min(c, initValue));
    topColor.push(!cfg.signalArea ? null : uptrend ? cfg.signalBull : clear);
    bottomColor.push(!cfg.signalArea ? null : uptrend ? clear : cfg.signalBear);

    prevInit = initValue;
    prevUp = uptrend;
    prevDn = downtrend;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: refPlot, plot1: pricePlot },
    fills: [{ plot1: 'plot0', plot2: 'plot1', gradient: { topValue, bottomValue, topColor, bottomColor } }],
    polylines,
  };
}

export const MacdBasedPriceForecasting = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
