/**
 * Corrected Moving Average
 *
 * The CMA follows the SMA of the source with a gain k that depends on the variance of the source: with
 * v1 = variance(src, length) and v2 = (CMA[1] - SMA)^2, v3 = v2 / (v1 + v2) (1 when v1 or v2 is 0) and
 * k = max(0, 2 - 1 / v3); CMA = CMA[1] + k * (SMA - CMA[1]). The CMA can take its direction colour, and a ribbon
 * fill between the SMA and the CMA shows whether the SMA is above or below the CMA.
 * Alerts (alertcondition, `alerts` of the result): 'Long Signal' / 'Short Signal', true on the bars where the SMA
 * crosses above / below the CMA.
 *
 * Reference: "Corrected Moving Average" by everget
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (c) 2020-present, Alex Orekhov (everget). Corrected Moving Average script may be freely
 * distributed under the terms of the GPL-3.0 license.
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import {
  alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState,
} from '../alert-states';

export interface CorrectedMovingAverageInputs {
  length: number;
  src: SourceType;
  /** Colour the CMA by its direction (green up, red down); orange otherwise */
  highlightDirection: boolean;
  /** Fill between the SMA and the CMA */
  applyRibbonFilling: boolean;
}

export const defaultInputs: CorrectedMovingAverageInputs = {
  length: 35,
  src: 'close',
  highlightDirection: false,
  applyRibbonFilling: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 35, min: 1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'highlightDirection', type: 'bool', title: 'Highlight CMA', defval: false },
  { id: 'applyRibbonFilling', type: 'bool', title: 'Apply Ribbon Filling', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'CMA', color: '#FF9800', lineWidth: 2 },
  { id: 'plot1', title: 'SMA', color: '#2962FF', lineWidth: 2 },
];

export const metadata = {
  title: 'Corrected Moving Average',
  shortTitle: 'CMA',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<CorrectedMovingAverageInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // sma = ta.sma(src, length); v1 = ta.variance(src, length)
  const srcSeries = getSourceSeries(bars, cfg.src);
  const sma = ta.sma(srcSeries, cfg.length).toArray().map((v) => v ?? NaN);
  const v1 = ta.variance(srcSeries, cfg.length).toArray().map((v) => v ?? NaN);

  const cma: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // cmaPrev = nz(cma[1], sma)
    const prev = i > 0 ? cma[i - 1] : NaN;
    const cmaPrev = isNaN(prev) ? sma[i] : prev;
    const dev = cmaPrev - sma[i];
    const v2 = dev * dev;
    // v3 = v1 == 0 or v2 == 0 ? 1 : v2 / (v1 + v2) (na == 0 is false). Plain division: v2 / 0 is +infinity,
    // then 1 / v3 is 0 and k is 2
    const v3 = v1[i] === 0 || v2 === 0 ? 1 : v2 / (v1[i] + v2);
    // k = math.max(0.0, 2 - 1 / v3) (na when v3 is na)
    const k = isNaN(v3) ? NaN : Math.max(0.0, 2 - 1 / v3);
    cma[i] = cmaPrev + k * (sma[i] - cmaPrev);
  }

  const bullishFillColor = String(color.new('#0ebb23', 75));
  const bearishFillColor = String(color.new('#cc0000', 75));
  const cmaPlot: { time: number; value: number; color: string }[] = [];
  const fillColors: string[] = [];
  for (let i = 0; i < n; i++) {
    // cmaColor = highlightDirection ? cma > cma[1] ? color.green : color.red : color.orange
    const prev = i > 0 ? cma[i - 1] : NaN;
    const cmaColor = cfg.highlightDirection ? (gt(cma[i], prev) ? color.green : color.red) : color.orange;
    cmaPlot.push({ time: bars[i].time, value: cma[i], color: cmaColor });
    // fillColor = applyRibbonFilling ? (sma > cma ? bullishFillColor : bearishFillColor) : #ffffff00
    fillColors.push(cfg.applyRibbonFilling ? (gt(sma[i], cma[i]) ? bullishFillColor : bearishFillColor) : '#ffffff00');
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(cma, 'CMA', linewidth = 2, color = cmaColor); plot(sma, 'SMA', linewidth = 2, color = color.blue)
      plot0: cmaPlot,
      plot1: bars.map((b, i) => ({ time: b.time, value: sma[i], color: color.blue })),
    },
    // fill(smaPlot, cmaPlot, color = fillColor)
    fills: [{ plot1: 'plot1', plot2: 'plot0', colors: fillColors }],
    markers: [],
    // longSignal = ta.crossover(sma, cma) / shortSignal = ta.crossunder(sma, cma)
    alerts: alertStates(alertConditions, bars, [crossedOver(sma, cma), crossedUnder(sma, cma)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long Signal', message: 'Enter Long\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
  { id: 'alert1', title: 'Short Signal', message: 'Enter Short\nSymbol: {{exchange}}:{{ticker}}\nPrice: {{close}}' },
];

export const CorrectedMovingAverage = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
