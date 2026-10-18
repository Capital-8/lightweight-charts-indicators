/**
 * IPO Stock Screener
 *
 * Counts the bars available on the chart (bar_index + 1). While this count is below the "IPO Days" threshold the
 * symbol is a recent IPO: the background is green, a red label is drawn at the top of the pane and a blue column of
 * height 1 is plotted. An orange column shows the bar count on every bar.
 * Alert (alertcondition, `alerts` of the result): 'IPO Date within IPO Days' on the bars where the count is below the
 * threshold.
 *
 * Reference: "IPO Date Screener" by starshiptrade
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © starshiptrade
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface IpoDateScreenerInputs {
  /** Number of bars (days) of the IPO threshold */
  barThreshold: number;
}

export const defaultInputs: IpoDateScreenerInputs = {
  barThreshold: 498,
};

export const inputConfig: InputConfig[] = [
  { id: 'barThreshold', type: 'int', title: 'IPO Days', defval: 498, min: 1, max: 499 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'IPO Date within IPO Days', color: color.blue, lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Days Since IPO', color: color.orange, lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'IPO Stock Screener',
  shortTitle: 'IPO Stock Screener',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<IpoDateScreenerInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const plot0: { time: number; value: number }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const newFlags: boolean[] = [];

  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].time;
    // barsAvailable = bar_index + 1 (bar_index counts from the first bar given to the port)
    const barsAvailable = i + 1;
    const isStockNew = barsAvailable < cfg.barThreshold;
    newFlags.push(isStockNew);
    // bgcolor(isStockNew ? color.green : na)
    if (isStockNew) bgColors.push({ time: t, color: color.green });
    // plotshape(isStockNew, location = location.top, color = color.red, style = shape.labeldown)
    if (isStockNew) markers.push({ time: t, position: 'top', shape: 'labelDown', color: color.red });
    // plot(isStockNew ? 1 : na, style = plot.style_columns, color = color.blue)
    plot0.push({ time: t, value: isStockNew ? 1 : NaN });
    // plot(barsAvailable, style = plot.style_columns, color = color.orange)
    plot1.push({ time: t, value: barsAvailable });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    bgColors,
    // alertcondition(isStockNew, "IPO Date within IPO Days")
    alerts: alertStates(alertConditions, bars, [newFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'IPO Date within IPO Days', message: 'This stock has fewer bars than the user-defined threshold.' },
];

export const IpoDateScreener = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
