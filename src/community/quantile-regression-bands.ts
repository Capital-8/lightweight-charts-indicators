/**
 * Quantile Regression Bands [BackQuant]
 *
 * A linear regression line is fitted on the last `length` source values (ta.linreg at offsets 0 and length - 1).
 * The residuals of the source against that line are sorted and four quantiles are read with the nearest rank
 * method (index round(tau * (length - 1))). The bands are the regression end value plus each quantile residual.
 * The centre and the four bands are smoothed with an EMA. The outer bands get five gradient zones towards the
 * centre (fills of decreasing opacity); the inner bands are filled together. Bars are green when the close and the
 * previous close are above the smoothed centre, red otherwise.
 * Alerts (alertcondition, `alerts` of the result): 'Price Crosses Upper Outer Band' / 'Price Crosses Lower Outer Band',
 * the source crossing over the smoothed upper outer band / under the smoothed lower outer band.
 *
 * Reference: "Quantile Regression Bands [BackQuant]" by BackQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BackQuant
 */

import {
  ta, Series, getSourceSeries, color, callsite, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Price Crosses Upper Outer Band', message: '{{exchange}}:{{ticker}} Crossed above the upper outer quantile band.' },
  { id: 'alert1', title: 'Price Crosses Lower Outer Band', message: '{{exchange}}:{{ticker}} Crossed below the lower outer quantile band.' },
];

export interface QuantileRegressionBandsInputs {
  /** Price source of the regression */
  src: SourceType;
  /** Lookback length of the regression and of the residuals */
  length: number;
  /** Inner lower quantile (tau) */
  tauLow1: number;
  /** Inner upper quantile (tau) */
  tauHigh1: number;
  /** Outer lower quantile (tau) */
  tauLow2: number;
  /** Outer upper quantile (tau) */
  tauHigh2: number;
  showCenter: boolean;
  showInnerBands: boolean;
  showOuterBands: boolean;
  centerColor: string;
  innerBandColor: string;
  outerBandColor: string;
  /** Transparency of the inner band fill */
  innerFillTransp: number;
  /** Not used by the script (input only) */
  outerFillTransp: number;
  barColoring: boolean;
  /** EMA length of the centre and band smoothing */
  smoothLen: number;
}

export const defaultInputs: QuantileRegressionBandsInputs = {
  src: 'close',
  length: 75,
  tauLow1: 0.25,
  tauHigh1: 0.75,
  tauLow2: 0.01,
  tauHigh2: 0.99,
  showCenter: true,
  showInnerBands: true,
  showOuterBands: true,
  centerColor: '#FFFFFF',
  innerBandColor: '#00ff00',
  outerBandColor: '#ff0000',
  innerFillTransp: 90,
  outerFillTransp: 95,
  barColoring: true,
  smoothLen: 3,
};

const CALC = 'Calculation Settings';
const BAND = 'Band Settings';
const UI = 'Visuals';

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: CALC },
  { id: 'length', type: 'int', title: 'Lookback Length', defval: 75, min: 10, group: CALC },
  { id: 'tauLow1', type: 'float', title: 'Inner Lower Quantile (τ)', defval: 0.25, min: 0.01, step: 0.01, group: BAND },
  { id: 'tauHigh1', type: 'float', title: 'Inner Upper Quantile (τ)', defval: 0.75, min: 0.51, step: 0.01, group: BAND },
  { id: 'tauLow2', type: 'float', title: 'Outer Lower Quantile (τ)', defval: 0.01, min: 0.01, step: 0.01, group: BAND },
  { id: 'tauHigh2', type: 'float', title: 'Outer Upper Quantile (τ)', defval: 0.99, min: 0.51, step: 0.01, group: BAND },
  { id: 'showCenter', type: 'bool', title: 'Show Center Line', defval: true, group: BAND },
  { id: 'showInnerBands', type: 'bool', title: 'Show Inner Bands', defval: true, group: BAND },
  { id: 'showOuterBands', type: 'bool', title: 'Show Outer Bands', defval: true, group: BAND },
  { id: 'centerColor', type: 'color', title: 'Center Line Color', defval: '#FFFFFF', group: BAND },
  { id: 'innerBandColor', type: 'color', title: 'Inner Bands Color', defval: '#00ff00', group: BAND },
  { id: 'outerBandColor', type: 'color', title: 'Outer Bands Color', defval: '#ff0000', group: BAND },
  { id: 'innerFillTransp', type: 'int', title: 'Inner Fill Transparency', defval: 90, min: 0, max: 100, group: BAND },
  { id: 'outerFillTransp', type: 'int', title: 'Outer Fill Transparency', defval: 95, min: 0, max: 100, group: BAND },
  { id: 'barColoring', type: 'bool', title: 'Bar Coloring', defval: true, group: UI },
  { id: 'smoothLen', type: 'int', title: 'Band Smoothing Length', defval: 3, min: 1, max: 10, group: UI },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Center (Linear Regression)', color: '#FFFFFF', lineWidth: 2 },
  { id: 'plot1', title: 'Inner Lower Band', color: '#00ff00', lineWidth: 1 },
  { id: 'plot2', title: 'Inner Upper Band', color: '#00ff00', lineWidth: 1 },
  { id: 'plot3', title: 'Outer Lower Band', color: '#ff0000', lineWidth: 1 },
  { id: 'plot4', title: 'Outer Upper Band', color: '#ff0000', lineWidth: 1 },
  { id: 'plot5', title: 'Upper Zone', color: String(color.new('#ff0000', 0)), lineWidth: 1 },
  { id: 'plot6', title: 'UG2', color: String(color.new('#ff0000', 70)), lineWidth: 1 },
  { id: 'plot7', title: 'UG3', color: String(color.new('#ff0000', 80)), lineWidth: 1 },
  { id: 'plot8', title: 'UG4', color: String(color.new('#ff0000', 90)), lineWidth: 1 },
  { id: 'plot9', title: 'UG5', color: String(color.new('#ff0000', 95)), lineWidth: 1 },
  { id: 'plot10', title: 'Lower Zone', color: String(color.new('#00ff00', 0)), lineWidth: 1 },
  { id: 'plot11', title: 'LG2', color: String(color.new('#00ff00', 70)), lineWidth: 1 },
  { id: 'plot12', title: 'LG3', color: String(color.new('#00ff00', 80)), lineWidth: 1 },
  { id: 'plot13', title: 'LG4', color: String(color.new('#00ff00', 90)), lineWidth: 1 },
  { id: 'plot14', title: 'LG5', color: String(color.new('#00ff00', 95)), lineWidth: 1 },
];

export const metadata = {
  title: 'Quantile Regression Bands [BackQuant]',
  shortTitle: 'QRB [BackQuant]',
  overlay: true,
};

/** Pine float comparison: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<QuantileRegressionBandsInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { length } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const src = A(getSourceSeries(bars, cfg.src));
  // The ta.linreg calls run inside `if bar_index >= length - 1`: two call sites whose window is kept by bar
  // (the bars before the first call count as 0)
  const endSite = callsite.linreg();
  const startSite = callsite.linreg();
  const linregEnd = src.map((v, i) => (i >= length - 1 ? endSite(i, v, length, 0) : NaN));
  const linregStart = src.map((v, i) => (i >= length - 1 ? startSite(i, v, length, length - 1) : NaN));

  const center = new Array<number>(n).fill(NaN);
  const lowerInner = new Array<number>(n).fill(NaN);
  const upperInner = new Array<number>(n).fill(NaN);
  const lowerOuter = new Array<number>(n).fill(NaN);
  const upperOuter = new Array<number>(n).fill(NaN);
  const residuals: number[] = [];
  // array.get(id, index): an index outside the array is a Pine runtime error
  const get = (arr: number[], idx: number) => {
    if (idx < 0 || idx >= arr.length) throw new Error(`Index ${idx} is out of bounds, array size is ${arr.length}`);
    return arr[idx];
  };
  for (let i = length - 1; i < n; i++) {
    const end = linregEnd[i];
    const start = linregStart[i];
    const slope = (end - start) / (length - 1.0);
    const intercept = start;
    residuals.length = 0;
    for (let k = 0; k <= length - 1; k++) {
      const t = length - 1.0 - k;
      const predicted = intercept + slope * t;
      residuals.push(src[i - k] - predicted);
    }
    // array.sort ascending
    residuals.sort((a, b) => a - b);
    const size = residuals.length;
    if (size === length) {
      // math.round: nearest integer, ties up (tau >= 0.01 here)
      const qLow1 = get(residuals, Math.round(cfg.tauLow1 * (size - 1)));
      const qHigh1 = get(residuals, Math.round(cfg.tauHigh1 * (size - 1)));
      const qLow2 = get(residuals, Math.round(cfg.tauLow2 * (size - 1)));
      const qHigh2 = get(residuals, Math.round(cfg.tauHigh2 * (size - 1)));
      center[i] = end;
      lowerInner[i] = end + qLow1;
      upperInner[i] = end + qHigh1;
      lowerOuter[i] = end + qLow2;
      upperOuter[i] = end + qHigh2;
    }
  }

  const centerSm = A(ta.ema(S(center), cfg.smoothLen));
  const lowerInnerSm = A(ta.ema(S(lowerInner), cfg.smoothLen));
  const upperInnerSm = A(ta.ema(S(upperInner), cfg.smoothLen));
  const lowerOuterSm = A(ta.ema(S(lowerOuter), cfg.smoothLen));
  const upperOuterSm = A(ta.ema(S(upperOuter), cfg.smoothLen));

  const line = (show: boolean, f: (i: number) => number, c: string) => bars.map((b, i) => ({
    time: b.time, value: show ? f(i) : NaN, color: c,
  }));
  const out = cfg.outerBandColor;
  const inn = cfg.innerBandColor;
  // upper_step = (upper - center_sm) / 5, lower_step = (center_sm - lower) / 5
  const upperStep = (i: number) => (upperOuterSm[i] - centerSm[i]) / 5;
  const lowerStep = (i: number) => (centerSm[i] - lowerOuterSm[i]) / 5;
  const so = cfg.showOuterBands;
  const plots = {
    plot0: line(cfg.showCenter, (i) => centerSm[i], cfg.centerColor),
    plot1: line(cfg.showInnerBands, (i) => lowerInnerSm[i], inn),
    plot2: line(cfg.showInnerBands, (i) => upperInnerSm[i], inn),
    plot3: line(so, (i) => lowerOuterSm[i], out),
    plot4: line(so, (i) => upperOuterSm[i], out),
    plot5: line(so, (i) => upperOuterSm[i], String(color.new(out, 0))),
    plot6: line(so, (i) => upperOuterSm[i] - upperStep(i), String(color.new(out, 70))),
    plot7: line(so, (i) => upperOuterSm[i] - 2 * upperStep(i), String(color.new(out, 80))),
    plot8: line(so, (i) => upperOuterSm[i] - 3 * upperStep(i), String(color.new(out, 90))),
    plot9: line(so, (i) => upperOuterSm[i] - 4 * upperStep(i), String(color.new(out, 95))),
    plot10: line(so, (i) => lowerOuterSm[i], String(color.new(inn, 0))),
    plot11: line(so, (i) => lowerOuterSm[i] + lowerStep(i), String(color.new(inn, 70))),
    plot12: line(so, (i) => lowerOuterSm[i] + 2 * lowerStep(i), String(color.new(inn, 80))),
    plot13: line(so, (i) => lowerOuterSm[i] + 3 * lowerStep(i), String(color.new(inn, 90))),
    plot14: line(so, (i) => lowerOuterSm[i] + 4 * lowerStep(i), String(color.new(inn, 95))),
  };

  const fill = (plot1: string, plot2: string, c: string, title?: string) => ({
    plot1, plot2, options: title ? { color: c, title } : { color: c }, colors: new Array<string>(n).fill(c),
  });
  const fills = [
    fill('plot5', 'plot6', String(color.new(out, 70))),
    fill('plot6', 'plot7', String(color.new(out, 80))),
    fill('plot7', 'plot8', String(color.new(out, 90))),
    fill('plot8', 'plot9', String(color.new(out, 95))),
    fill('plot9', 'plot0', String(color.new(out, 99))),
    fill('plot10', 'plot11', String(color.new(inn, 70))),
    fill('plot11', 'plot12', String(color.new(inn, 80))),
    fill('plot12', 'plot13', String(color.new(inn, 90))),
    fill('plot13', 'plot14', String(color.new(inn, 95))),
    fill('plot14', 'plot0', String(color.new(inn, 99))),
    fill('plot1', 'plot2', String(color.new(inn, cfg.innerFillTransp)), 'Inner Band Fill'),
  ];

  // barcolor(barColoring ? (isUptrend ? inner_band_color : outer_band_color) : na)
  const barColors: BarColorData[] = [];
  if (cfg.barColoring) {
    for (let i = 0; i < n; i++) {
      const isUptrend = gt(bars[i].close, centerSm[i]) && i > 0 && gt(bars[i - 1].close, centerSm[i - 1]);
      barColors.push({ time: bars[i].time, color: isUptrend ? inn : out });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    barColors,
    // alertcondition(ta.crossover(src, upper_outer_sm)) / alertcondition(ta.crossunder(src, lower_outer_sm))
    alerts: alertStates(alertConditions, bars, [crossedOver(src, upperOuterSm), crossedUnder(src, lowerOuterSm)]),
  };
}

export const QuantileRegressionBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
