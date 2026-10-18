/**
 * Smooth RSI [MarktQuant]
 *
 * The RSI of the high, open, low and close over `length` bars, drawn as candles (open = RSI of the open, high = RSI
 * of the high, low = RSI of the low, close = RSI of the close). The trend colour is green when the average of the
 * four RSIs is above 50 and the average rate of change of the four prices over `lengthc` bars is positive, red when
 * the average RSI is below 50 and the average rate of change is negative, and keeps its last value otherwise (white
 * at the start). It colours the RSI candles, the price bars and a copy of the price candles on the price pane. An
 * optional line draws the average rate of change + 50, filled to 50.
 *
 * Reference: "Smooth RSI [MarktQuant]" by MarktQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © MarktQuant
 */

import {
  ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar,
} from 'oakscriptjs';
import type { BarColorData, MarkerData, PlotCandleData } from '../types';

export interface SmoothRSIInputs {
  /** RSI length */
  length: number;
  /** RoC length */
  lengthc: number;
  /** Show the RSI candles */
  showRsi: boolean;
  /** Show the RoC line and its fill */
  showRoc: boolean;
}

export const defaultInputs: SmoothRSIInputs = {
  length: 28,
  lengthc: 28,
  showRsi: true,
  showRoc: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'RSI', defval: 28 },
  { id: 'lengthc', type: 'int', title: 'RoC Length', defval: 28 },
  { id: 'showRsi', type: 'bool', title: 'Show RSI', defval: true },
  { id: 'showRoc', type: 'bool', title: 'Show RoC', defval: false },
];

const ROC_UP = color.rgb(117, 186, 255, 50);
const ROC_DOWN = color.rgb(255, 183, 75, 48);

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RoC Plot', color: ROC_UP, lineWidth: 2, visible: 'showRoc' },
  { id: 'plot1', title: 'Mid Threshold', color: '#2962ff', lineWidth: 1, display: 'none' },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_low', price: 30, title: 'Low Threshold', color: '#08b60e67', linestyle: 'dashed' },
  { id: 'hline_high', price: 70, title: 'High Threshold', color: '#ea00006d', linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'Mid Threshold', color: '#eb61048b', linestyle: 'dashed' },
];

export const metadata = {
  title: 'Smooth RSI [MarktQuant]',
  shortTitle: 'Smooth RSI [MarktQuant]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SmoothRSIInputs> = {},
): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[]; barColors: BarColorData[]; plotCandles: Record<string, PlotCandleData[]>;
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const high = bars.map((b) => b.high);
  const open = bars.map((b) => b.open);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);

  const c1 = A(ta.rsi(S(high), cfg.length));
  const c2 = A(ta.rsi(S(open), cfg.length));
  const c3 = A(ta.rsi(S(low), cfg.length));
  const c4 = A(ta.rsi(S(close), cfg.length));
  const c1c = A(ta.roc(S(high), cfg.lengthc));
  const c2c = A(ta.roc(S(open), cfg.lengthc));
  const c3c = A(ta.roc(S(low), cfg.lengthc));
  const c4c = A(ta.roc(S(close), cfg.lengthc));

  const rsiCandles: PlotCandleData[] = [];
  const chartCandles: PlotCandleData[] = [];
  const barColors: BarColorData[] = [];
  const rocPlot: { time: number; value: number; color: string }[] = [];
  const midPlot: { time: number; value: number }[] = [];
  const fillColors: string[] = [];
  let colss: string = color.white; // var color colss = color.white
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const sum = (c1[i] + c2[i] + c3[i] + c4[i]) / 4;
    const sumc = (c1c[i] + c2c[i] + c3c[i] + c4c[i]) / 4;
    const rocc = gt(sumc, 0) ? ROC_UP : lt(sumc, 0) ? ROC_DOWN : null;
    const bul = gt(sum, 50) && gt(sumc, 0);
    const ber = lt(sum, 50) && lt(sumc, 0);
    if (bul) colss = color.rgb(0, 197, 89);
    if (ber) colss = color.rgb(225, 15, 0);

    barColors.push({ time: t, color: colss });
    // plotcandle(c2, c1, c3, c4, ...): no candle when a value is na; display = d1 ? display.all : display.none
    if (cfg.showRsi && !isNaN(c1[i]) && !isNaN(c2[i]) && !isNaN(c3[i]) && !isNaN(c4[i])) {
      rsiCandles.push({ time: t, open: c2[i], high: c1[i], low: c3[i], close: c4[i], color: colss, wickColor: colss,
        borderColor: colss });
    }
    // plotcandle(open, high, low, close, ..., force_overlay = true)
    chartCandles.push({ time: t, open: open[i], high: high[i], low: low[i], close: close[i], color: colss,
      wickColor: colss, borderColor: colss, forceOverlay: true });
    rocPlot.push({ time: t, value: sumc + 50, color: rocc ?? 'transparent' });
    midPlot.push({ time: t, value: 50 });
    // color.new(rocc, 90): color.new(na, 90) is black with transparency 90
    fillColors.push(String(color.new(rocc ?? '#000000', 90)));
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: rocPlot, plot1: midPlot },
    hlines: [
      { value: 30, options: { title: 'Low Threshold', color: '#08b60e67', linestyle: 'dashed' } },
      { value: 70, options: { title: 'High Threshold', color: '#ea00006d', linestyle: 'dashed' } },
      { value: 50, options: { title: 'Mid Threshold', color: '#eb61048b', linestyle: 'dashed' } },
    ],
    // fill(l1, mid, color.new(rocc, 90), display = d3 ? display.all : display.none), untitled ("Plots Background"):
    // FillData has no display option, so the hidden fill is given with transparent colours (listed, draws nothing)
    fills: [{
      plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' },
      colors: cfg.showRoc ? fillColors : fillColors.map(() => 'transparent'),
    }],
    markers: [],
    barColors,
    plotCandles: { rsiCandles, chartCandles },
  };
}

export const SmoothRSI = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
};
