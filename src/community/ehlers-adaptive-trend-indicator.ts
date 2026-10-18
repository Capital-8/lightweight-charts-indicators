/**
 * Ehlers Adaptive Trend Indicator [Alpha Extract]
 *
 * Ehlers-style adaptive filter: the basis is the average of the last p1 source values weighted by
 * |src[i] - src[i + p2]| (the source itself when all weights are 0). Bands are the basis +- the EMA of the source
 * standard deviation times the sensitivity. A trend state flips down when the close falls below the lower band and up
 * when it rises above the upper band; the trend level trails the lower band in an up trend (highest value) and the
 * upper band in a down trend (lowest value). A fill between the basis and the trend level and the bar colours follow
 * the trend.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' / 'Sell Signal', true on every bar of an up / down
 * trend.
 *
 * Reference: "Ehlers Adaptive Trend Indicator [Alpha Extract]" by AlphaExtract
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlphaExtract
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EhlersAdaptiveTrendIndicatorInputs {
  src: SourceType;
  /** Ehlers length: number of weighted source values, also the standard deviation length */
  p1: number;
  /** Momentum length: the weight of src[i] is |src[i] - src[i + p2]| */
  p2: number;
  /** EMA length of the standard deviation */
  smoothingLen: number;
  /** Band width in smoothed standard deviations */
  sensitivity: number;
  colorBull: string;
  colorBear: string;
  colorBasis: string;
  /** Colour the price bars by the trend */
  colorBarTrend: boolean;
}

export const defaultInputs: EhlersAdaptiveTrendIndicatorInputs = {
  src: 'hlc3',
  p1: 30,
  p2: 25,
  smoothingLen: 10,
  sensitivity: 1.0,
  colorBull: color.green,
  colorBear: color.red,
  colorBasis: color.yellow,
  colorBarTrend: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'hlc3' },
  { id: 'p1', type: 'int', title: 'Ehlers Length (p1)', defval: 30 },
  { id: 'p2', type: 'int', title: 'Momentum Length (p2)', defval: 25 },
  { id: 'smoothingLen', type: 'int', title: 'Smoothing Length', defval: 10 },
  { id: 'sensitivity', type: 'float', title: 'Sensitivity', defval: 1.0, step: 0.1 },
  { id: 'colorBull', type: 'color', title: 'Bullish Color', defval: color.green },
  { id: 'colorBear', type: 'color', title: 'Bearish Color', defval: color.red },
  { id: 'colorBasis', type: 'color', title: 'Basis Line Color', defval: color.yellow },
  { id: 'colorBarTrend', type: 'bool', title: 'Color Bars by Trend', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Ehlers Basis', color: color.yellow, lineWidth: 2 },
  { id: 'plot1', title: 'Trend Level', color: color.green, lineWidth: 2 },
];

export const metadata = {
  title: 'Ehlers Adaptive Trend Indicator [Alpha Extract]',
  shortTitle: 'Ehlers Adaptive Trend Indicator [Alpha Extract]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** Pine a != b: false when a or b is na */
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<EhlersAdaptiveTrendIndicatorInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { p1, p2 } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const srcS = getSourceSeries(bars, cfg.src);
  const src = A(srcS);

  // Ehlers filter: computed from bar_index >= p1 - 1 + p2, na before
  const basis: number[] = new Array(n).fill(NaN);
  const coef: number[] = new Array(p1).fill(0.0); // var coefArray = array.new_float(p1, 0.0)
  for (let b = 0; b < n; b++) {
    if (b >= p1 - 1 + p2) {
      let num = 0.0;
      let sumCoef = 0.0;
      for (let i = 0; i <= p1 - 1; i++) coef[i] = Math.abs(src[b - i] - src[b - i - p2]);
      for (let i = 0; i <= p1 - 1; i++) {
        num += coef[i] * src[b - i];
        sumCoef += coef[i];
      }
      basis[b] = ne(sumCoef, 0) ? num / sumCoef : src[b];
    }
  }

  // Volatility and dynamic bands
  const vol = ta.stdev(srcS, p1);
  const smoothedVol = A(ta.ema(vol, cfg.smoothingLen));
  const upperBand = bars.map((_b, i) => basis[i] + smoothedVol[i] * cfg.sensitivity);
  const lowerBand = bars.map((_b, i) => basis[i] - smoothedVol[i] * cfg.sensitivity);

  // Trend state and reference level
  const trendArr: number[] = new Array(n);
  const levelArr: number[] = new Array(n);
  let trend = 0;
  let prevLevel = NaN;
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    if (isNaN(prevLevel)) {
      trend = ge(close, basis[i]) ? 1 : -1;
      prevLevel = basis[i];
    } else if (trend === 1 && lt(close, lowerBand[i])) {
      trend = -1;
      prevLevel = lowerBand[i];
    } else if (trend === -1 && gt(close, upperBand[i])) {
      trend = 1;
      prevLevel = upperBand[i];
    } else {
      // math.max / math.min give na when an argument is na
      prevLevel = trend === 1 ? Math.max(prevLevel, lowerBand[i]) : Math.min(prevLevel, upperBand[i]);
    }
    trendArr[i] = trend;
    levelArr[i] = prevLevel;
  }

  const bullFill = String(color.new(cfg.colorBull, 80));
  const bearFill = String(color.new(cfg.colorBear, 80));
  const bullBar = String(color.new(cfg.colorBull, 50));
  const bearBar = String(color.new(cfg.colorBear, 50));
  const fin = (x: number) => (Number.isFinite(x) ? x : NaN);

  const barColors: BarColorData[] = [];
  if (cfg.colorBarTrend) {
    for (let i = 0; i < n; i++) barColors.push({ time: bars[i].time, color: trendArr[i] === 1 ? bullBar : bearBar });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(basis[i]), color: cfg.colorBasis })),
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(levelArr[i]), color: trendArr[i] === 1 ? cfg.colorBull : cfg.colorBear })),
    },
    // fill(pBasis, pTrend, color = trend == 1 ? color.new(colorBull, 80) : color.new(colorBear, 80))
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' },
        colors: trendArr.map((tr) => (tr === 1 ? bullFill : bearFill)) },
    ],
    barColors,
    // buySignal = trend == 1, sellSignal = trend == -1
    alerts: alertStates(alertConditions, bars, [trendArr.map((tr) => tr === 1), trendArr.map((tr) => tr === -1)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy Signal triggered' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell Signal triggered' },
];

export const EhlersAdaptiveTrendIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
