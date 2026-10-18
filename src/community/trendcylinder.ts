/**
 * Trend Cylinder
 *
 * A trend line that moves to the midpoint of the close and itself when the close is farther than
 * ATR x factor x step from it (ATR: RMA(10) of ATR(200)); otherwise it stays in place (plus a step of
 * ATR / 2^100 in the last direction, too small to change it). The direction is the sign of the last change of the
 * trend line. Bands: trend +/- (ATR x factor - ATR - EMA(200) of the 100-bar standard deviation of the close).
 * The line and the bands are drawn only when the direction is the same as on the previous bar; the line is bullish
 * after a rise, bearish after a fall. Gradient fills go from the trend line (transparent) to each band.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Trend Shift' (the trend line rises after a fall on the bar
 * before) and 'Bearish Trend Shift' (falls after a rise).
 *
 * Reference: "Trend Cylinder (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrendCylinderInputs {
  /** Volatility period (standard deviation length) */
  volatilityPeriod: number;
  /** Trend factor */
  trendFactor: number;
  /** Trend step */
  trendStep: number;
  bullishTrendColor: string;
  bearishTrendColor: string;
  /** Colour of the fill under the upper band (fill between the lower band and the trend) */
  colorForUpperBand: string;
  /** Colour of the fill above the trend line (fill between the upper band and the trend) */
  colorForLowerBand: string;
}

export const defaultInputs: TrendCylinderInputs = {
  volatilityPeriod: 100,
  trendFactor: 9,
  trendStep: 0.7,
  bullishTrendColor: '#493893',
  bearishTrendColor: '#862458',
  colorForUpperBand: String(color.new('#862458', 10)),
  colorForLowerBand: String(color.new('#493893', 10)),
};

export const inputConfig: InputConfig[] = [
  { id: 'volatilityPeriod', type: 'int', title: 'Period', defval: 100, min: 2, max: 1000, step: 10 },
  { id: 'trendFactor', type: 'float', title: 'Factor', defval: 9, min: 0.1, step: 0.1 },
  { id: 'trendStep', type: 'float', title: 'Step', defval: 0.7, min: 0.5, max: 5.0, step: 0.1 },
  { id: 'bullishTrendColor', type: 'color', title: 'Bullish Trend', defval: '#493893' },
  { id: 'bearishTrendColor', type: 'color', title: 'Bearish Trend', defval: '#862458' },
  { id: 'colorForUpperBand', type: 'color', title: 'Upper Band', defval: String(color.new('#862458', 10)) },
  { id: 'colorForLowerBand', type: 'color', title: 'Lower Band', defval: String(color.new('#493893', 10)) },
];

const BAND_COL = String(color.new(color.black, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend Line', color: '#493893', lineWidth: 2 },
  { id: 'plot1', title: 'Upper Band', color: BAND_COL, lineWidth: 1 },
  { id: 'plot2', title: 'Lower Band', color: BAND_COL, lineWidth: 1 },
];

export const metadata = {
  title: 'Trend Cylinder (Zeiierman)',
  shortTitle: 'Trend Cylinder (Zeiierman)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendCylinderInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  const averageTrueRange = A(ta.rma(ta.atr(bars, 200), 10));
  const stdevEma = A(ta.ema(ta.stdev(S(close), cfg.volatilityPeriod), 200));

  const trend: number[] = new Array(n);
  const direction: number[] = new Array(n);
  const upperBand: number[] = new Array(n);
  const lowerBand: number[] = new Array(n);
  let currentTrend = 0.0; // var float currentTrend = 0.0
  let prevArg = NaN; // determineTrendDirection(direction): direction[1] is the argument of the previous call
  for (let i = 0; i < n; i++) {
    const scaledStandardDev = (isNaN(averageTrueRange[i]) ? 0 : averageTrueRange[i]) * cfg.trendFactor;
    // trendDirection := determineTrendDirection(currentTrend), with currentTrend of the previous bar
    const d = currentTrend - prevArg;
    direction[i] = gt(d, 0) ? 1 : lt(d, 0) ? -1 : 0;
    prevArg = currentTrend;
    const priceTrendDiff = Math.abs(close[i] - currentTrend);
    const reciprocalFactor = (scaledStandardDev * (1 / cfg.trendFactor) * 1) / Math.pow(2, 100);
    currentTrend = gt(priceTrendDiff, scaledStandardDev * cfg.trendStep)
      ? (close[i] + currentTrend) / 2
      : direction[i] * reciprocalFactor + currentTrend;
    trend[i] = currentTrend;
    upperBand[i] = currentTrend + scaledStandardDev - averageTrueRange[i] - stdevEma[i];
    lowerBand[i] = currentTrend - scaledStandardDev + averageTrueRange[i] + stdevEma[i];
  }

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const plot2: { time: number; value: number; color: string }[] = [];
  const topColor: Array<string | null> = [];
  const bottomColor: Array<string | null> = [];
  const noColor = String(color.new(color.black, 100)); // color.new(na, 100)
  // var color colorForPlot = bullishTrendColor, then colorForPlot := ... : colorForPlot[1] on every bar: on the first
  // bar colorForPlot[1] is na, so the colour stays na until the first rise or fall of the trend line
  let colorForPlot = 'transparent';
  const bullShift: boolean[] = [], bearShift: boolean[] = [];
  let prevBullish = false, prevBearish = false;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // isTrendConsistent = trendDirection == trendDirection[1] (false on the first bar)
    const consistent = i > 0 && direction[i] === direction[i - 1];
    const isBullishTrend = i > 0 && gt(trend[i], trend[i - 1]);
    const isBearishTrend = i > 0 && lt(trend[i], trend[i - 1]);
    // bullishShift = isBullishTrend and isBearishTrend[1] / bearishShift = isBearishTrend and isBullishTrend[1]
    bullShift.push(isBullishTrend && prevBearish);
    bearShift.push(isBearishTrend && prevBullish);
    prevBullish = isBullishTrend;
    prevBearish = isBearishTrend;
    colorForPlot = isBullishTrend ? cfg.bullishTrendColor : isBearishTrend ? cfg.bearishTrendColor : colorForPlot;
    plot0.push({ time: t, value: consistent ? trend[i] : NaN, color: colorForPlot });
    plot1.push({ time: t, value: consistent ? upperBand[i] : NaN, color: BAND_COL });
    plot2.push({ time: t, value: consistent ? lowerBand[i] : NaN, color: BAND_COL });
    topColor.push(cfg.colorForLowerBand);
    bottomColor.push(noColor);
  }

  // fill(plotUpper, plotTrend, top_value = upperBand, bottom_value = currentTrend, top_color = colorForLowerBand,
  //      bottom_color = color.new(na, 100))
  // fill(plotTrend, plotLower, top_value = currentTrend, bottom_value = lowerBand, top_color = color.new(na, 100),
  //      bottom_color = colorForUpperBand)
  const fills = [
    {
      plot1: 'plot1', plot2: 'plot0', options: { title: 'Background Upper' },
      gradient: { topValue: upperBand.slice(), bottomValue: trend.slice(), topColor, bottomColor },
    },
    {
      plot1: 'plot0', plot2: 'plot2', options: { title: 'Background Lower' },
      gradient: {
        topValue: trend.slice(), bottomValue: lowerBand.slice(),
        topColor: bottomColor.slice(), bottomColor: topColor.map(() => cfg.colorForUpperBand),
      },
    },
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills,
    alerts: alertStates(alertConditions, bars, [bullShift, bearShift]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Shift', message: 'Trend Cylinder: Bullish trend shift detected' },
  { id: 'alert1', title: 'Bearish Trend Shift', message: 'Trend Cylinder: Bearish trend shift detected' },
];

export const TrendCylinder = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
