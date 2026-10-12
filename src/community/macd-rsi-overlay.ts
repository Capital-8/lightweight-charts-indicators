/**
 * MACD & RSI Overlay (Expo)
 *
 * Price-scaled MACD / RSI lines drawn on the chart. An adaptive average blends a 2-bar SMA of the close and a trend
 * SMA by their relative distance (summed over 10 bars); the projected price is scalingFactor * close +
 * (1 - scalingFactor) * the previous adaptive average. The MACD line is the WMA (Smooth) of its 5-bar RMA, the RSI
 * line the WMA (Smooth) of its 1-bar RMA, and the signal line its SMA. The RSI line is coloured by the RSI(14) of
 * the close against the overbought / oversold levels. A one-cell table shows the trend of the last bar.
 *
 * Chart values read: the chart background colour (table frame and border). Without a chart context the dark theme
 * colour is used.
 *
 * Reference: "MACD & RSI Overlay (Expo)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { taCore, math, color, compare, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { TableData, TablePosition, PineSize } from '../types';
import { backgroundColorOf, type ChartContext } from '../chart-context';

export interface MacdRsiOverlayInputs {
  /** Lines shown: MACD, RSI 14 or both */
  macdRsi: 'MACD' | 'RSI 14' | 'Both';
  /** WMA length of the lines */
  smooth: number;
  /** SMA length of the signal line */
  signalLength: number;
  macdColor: string;
  rsiColor: string;
  signalColor: string;
  /** RSI overbought level */
  ob: number;
  /** RSI oversold level */
  os: number;
  obColor: string;
  osColor: string;
  /** Length of the trend SMA */
  trendFactor: number;
  /** Distance of the lines from the price */
  scalingFactor: number;
  showTable: boolean;
  tableSize: 'auto' | 'tiny' | 'small' | 'normal' | 'large' | 'huge';
  tablePosition: 'top_right' | 'top_center' | 'top_left' | 'bottom_right' | 'bottom_center' | 'bottom_left' | 'middle_right' | 'middle_left';
}

export const defaultInputs: MacdRsiOverlayInputs = {
  macdRsi: 'MACD',
  smooth: 1,
  signalLength: 14,
  macdColor: color.aqua,
  rsiColor: 'rgb(19, 96, 238)',
  signalColor: '#F8DE7E',
  ob: 70,
  os: 30,
  obColor: color.lime,
  osColor: '#FF5252',
  trendFactor: 30,
  scalingFactor: 2.5,
  showTable: true,
  tableSize: 'normal',
  tablePosition: 'top_right',
};

const T1 = 'Select if you want to display MACD [12,26] or RSI [14] or both at the same time on your chart.';
const T2 = 'Set the smoothing length';
const T3 = 'Set the signal line length';
const T4 = 'Increase this value if you want to factor in the underlying trend. A high value returns a long-term underlying trend and a low value returns the short-term underlying trend.';
const T5 = 'The scale refers to how far or close the MACD and RSI lines should be relative to the price. A higher scale means that the lines should be further away from the price, while a lower scale means that the lines should be closer to the price';

export const inputConfig: InputConfig[] = [
  { id: 'macdRsi', type: 'string', title: '', defval: 'MACD', options: ['MACD', 'RSI 14', 'Both'], group: 'MACD/RSI', inline: 'macdrsi', tooltip: T1 },
  { id: 'smooth', type: 'int', title: 'Smooth', defval: 1, min: 1, max: 200, step: 1, group: 'MACD/RSI', inline: 'macdrsi', tooltip: T2 },
  { id: 'signalLength', type: 'int', title: 'Signal Length', defval: 14, min: 5, max: 200, step: 1, group: 'MACD/RSI', inline: 'macdrsi', tooltip: T3 },
  { id: 'macdColor', type: 'color', title: 'MACD Line', defval: color.aqua, group: 'MACD/RSI', inline: 'col' },
  { id: 'rsiColor', type: 'color', title: 'RSI Line', defval: 'rgb(19, 96, 238)', group: 'MACD/RSI', inline: 'col' },
  { id: 'signalColor', type: 'color', title: 'Signal Line', defval: '#F8DE7E', group: 'MACD/RSI', inline: 'col' },
  { id: 'ob', type: 'int', title: '', defval: 70, min: 0, max: 100, group: 'RSI OB/OS', inline: 'obos_col' },
  { id: 'os', type: 'int', title: '', defval: 30, min: 0, max: 100, group: 'RSI OB/OS', inline: 'obos_col' },
  { id: 'obColor', type: 'color', title: '', defval: color.lime, group: 'RSI OB/OS', inline: 'obos_col' },
  { id: 'osColor', type: 'color', title: '', defval: '#FF5252', group: 'RSI OB/OS', inline: 'obos_col' },
  { id: 'trendFactor', type: 'int', title: 'Trend Factor', defval: 30, min: 1, max: 300, step: 2, group: 'Trend Feature', tooltip: T4 },
  { id: 'scalingFactor', type: 'float', title: 'Scaling Factor', defval: 2.5, step: 0.1, max: 10, group: 'Scaling', tooltip: T5 },
  { id: 'showTable', type: 'bool', title: 'Show Trend Table', defval: true, group: 'Trend Table', inline: 'tbl' },
  { id: 'tableSize', type: 'string', title: 'Size', defval: 'normal', options: ['auto', 'tiny', 'small', 'normal', 'large', 'huge'], inline: 'tbl' },
  { id: 'tablePosition', type: 'string', title: 'Location', defval: 'top_right',
    options: ['top_right', 'top_center', 'top_left', 'bottom_right', 'bottom_center', 'bottom_left', 'middle_right', 'middle_left'], inline: 'tbl' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MACD Line', color: color.aqua, lineWidth: 1 },
  { id: 'plot1', title: 'RSI Line', color: 'rgb(19, 96, 238)', lineWidth: 1 },
  { id: 'plot2', title: 'Signal Line', color: '#F8DE7E', lineWidth: 1 },
];

export const metadata = {
  title: 'MACD & RSI Overlay (Expo)',
  shortTitle: 'MACD & RSI Overlay (Expo)',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdRsiOverlayInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = bars.map((b) => b.close);

  // Moving averages
  const priceMa = taCore.sma(close, 2);
  const trendMa = taCore.sma(close, cfg.trendFactor);
  const error = priceMa.map((p, i) => Math.abs(p - trendMa[i]));
  const errorSum = math.sum(error, 10);
  // ama = errorSum == 0 ? close[1] : priceMa * (error / errorSum) + trendMa * (1 - error / errorSum)
  const ama = close.map((_c, i) => (compare.eq(errorSum[i], 0)
    ? (i > 0 ? close[i - 1] : NaN)
    : priceMa[i] * (error[i] / errorSum[i]) + trendMa[i] * (1 - error[i] / errorSum[i])));
  // pma = scalingFactor * close + (1.0 - scalingFactor) * ama[1]
  const pma = close.map((c, i) => cfg.scalingFactor * c + (1.0 - cfg.scalingFactor) * (i > 0 ? ama[i - 1] : NaN));

  const macd = taCore.wma(taCore.rma(pma, 5), cfg.smooth);
  const rsi = taCore.wma(taCore.rma(pma, 1), cfg.smooth);
  const signal = taCore.sma(pma, cfg.signalLength);
  const rsiOfClose = taCore.rsi(close, 14);

  const showMacd = cfg.macdRsi === 'MACD' || cfg.macdRsi === 'Both';
  const showRsi = cfg.macdRsi === 'RSI 14' || cfg.macdRsi === 'Both';
  const macdCol = String(color.new(cfg.macdColor, 0));
  const v = (x: number) => (Number.isFinite(x) ? x : NaN);
  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // rsi_col_ = rsi_ > ob ? ob_col : rsi_ < os ? os_col : rsi_col
    const r = rsiOfClose[i];
    const rsiCol = compare.gt(r, cfg.ob) ? cfg.obColor : compare.lt(r, cfg.os) ? cfg.osColor : cfg.rsiColor;
    plot0.push({ time: t, value: showMacd ? v(macd[i]) : NaN, color: macdCol });
    plot1.push({ time: t, value: showRsi ? v(rsi[i]) : NaN, color: String(color.new(rsiCol, 0)) });
    plot2.push({ time: t, value: v(signal[i]), color: String(color.new(cfg.signalColor, 0)) });
  }

  // var tbl = table.new(pos, 1, 1, frame_color = chart.bg_color, frame_width = 2, border_width = 2,
  //   border_color = chart.bg_color); the cell is written on the last bar
  const chartBg = backgroundColorOf(chart);
  const table: TableData = {
    position: cfg.tablePosition as TablePosition, columns: 1, rows: 1, cells: [],
    frameColor: chartBg, frameWidth: 2, borderColor: chartBg, borderWidth: 2,
  };
  if (n > 0 && cfg.showTable) {
    const i = n - 1;
    const macdTrend = `MACD: ${compare.gt(macd[i], close[i]) ? 'Bullish' : 'Bearish'}`;
    const rsiTrend = `RSI: ${compare.lt(close[i], rsi[i]) ? 'Bullish' : 'Bearish'}`;
    const h1 = cfg.macdRsi === 'MACD' ? macdTrend : cfg.macdRsi === 'RSI 14' ? rsiTrend : `${macdTrend}\n${rsiTrend}`;
    const bull = h1.includes('Bullish');
    const bear = h1.includes('Bearish');
    const trendCol = bull && bear ? color.orange : bull ? color.lime : '#FF5252';
    table.cells.push({
      column: 0, row: 0, text: h1, textColor: '#FFFFFF', bgColor: String(color.new(trendCol, 30)),
      textSize: cfg.tableSize as PineSize,
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    tables: n > 0 ? [table] : [],
  };
}

export const MacdRsiOverlay = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
