/**
 * Adaptive Ehlers Filtered Percentile
 *
 * A volatility-adaptive EMA: its length goes from the maximum period (standard deviation of the price changes at or
 * below 0.25 x its average) to the minimum period (at or above 1.75 x its average). An Ehlers nonlinear filter
 * smooths it: the weighted mean of the last `ehlersLength` values, each weighted by its distance to the value
 * `ehlersMomentum` bars before (SMA when all weights are 0). The bands are the filter +/- the percentile (nearest
 * rank) of the distance between the source and the filter, times a multiplier. A close above the upper band starts a
 * bullish regime, a close below the lower band a bearish regime; LONG / SHORT signals mark the regime changes, and the
 * filter, the fill and the bars take the regime colour.
 * Alerts (alertcondition, `alerts` of the result): 'Long Signal' and 'Short Signal', on the bars of the signals.
 *
 * Reference: "Adaptive Ehlers Filtered Percentile" by SchizoQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © SchizoQuant
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AdaptiveEhlersFilteredPercentileInputs {
  /** Source of the adaptive MA */
  maSrc: SourceType;
  /** Minimum MA period (high volatility) */
  maMin: number;
  /** Maximum MA period (low volatility) */
  maMax: number;
  /** Volatility period */
  volLen: number;
  /** Ehlers filter length */
  ehlersLength: number;
  /** Ehlers momentum length */
  ehlersMomentum: number;
  /** Percentile length */
  percentileLen: number;
  /** Percentile level */
  percentileLevel: number;
  upperMult: number;
  lowerMult: number;
  showMA: boolean;
  showBands: boolean;
  showFill: boolean;
  showSignals: boolean;
  colorBars: boolean;
  longColor: string;
  shortColor: string;
}

export const defaultInputs: AdaptiveEhlersFilteredPercentileInputs = {
  maSrc: 'close',
  maMin: 3,
  maMax: 30,
  volLen: 9,
  ehlersLength: 9,
  ehlersMomentum: 15,
  percentileLen: 50,
  percentileLevel: 75.0,
  upperMult: 0.7,
  lowerMult: 0.7,
  showMA: true,
  showBands: true,
  showFill: true,
  showSignals: true,
  colorBars: true,
  longColor: 'rgb(57, 255, 20)',
  shortColor: 'rgb(138, 43, 226)',
};

export const inputConfig: InputConfig[] = [
  { id: 'maSrc', type: 'source', title: 'Source', defval: 'close' },
  { id: 'maMin', type: 'int', title: 'Minimum MA Period', defval: 3, min: 1 },
  { id: 'maMax', type: 'int', title: 'Maximum MA Period', defval: 30, min: 2 },
  { id: 'volLen', type: 'int', title: 'Volatility Period', defval: 9, min: 2 },
  { id: 'ehlersLength', type: 'int', title: 'Filter Length', defval: 9, min: 2 },
  { id: 'ehlersMomentum', type: 'int', title: 'Momentum Length', defval: 15, min: 1 },
  { id: 'percentileLen', type: 'int', title: 'Percentile Length', defval: 50, min: 2 },
  { id: 'percentileLevel', type: 'float', title: 'Percentile Level', defval: 75.0, min: 1.0, max: 99.0, step: 1.0 },
  { id: 'upperMult', type: 'float', title: 'Upper Band Multiplier', defval: 0.7, min: 0.1, step: 0.1 },
  { id: 'lowerMult', type: 'float', title: 'Lower Band Multiplier', defval: 0.7, min: 0.1, step: 0.1 },
  { id: 'showMA', type: 'bool', title: 'Show Adaptive Filter', defval: true },
  { id: 'showBands', type: 'bool', title: 'Show Percentile Bands', defval: true },
  { id: 'showFill', type: 'bool', title: 'Show Band Fill', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Signals', defval: true },
  { id: 'colorBars', type: 'bool', title: 'Color Bars', defval: true },
  { id: 'longColor', type: 'color', title: 'Bullish Color', defval: 'rgb(57, 255, 20)' },
  { id: 'shortColor', type: 'color', title: 'Bearish Color', defval: 'rgb(138, 43, 226)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Adaptive Ehlers Filter', color: 'rgb(138, 43, 226)', lineWidth: 2 },
  { id: 'plot1', title: 'Upper Percentile Band', color: String(color.new('rgb(57, 255, 20)', 35)), lineWidth: 1 },
  { id: 'plot2', title: 'Lower Percentile Band', color: String(color.new('rgb(138, 43, 226)', 35)), lineWidth: 1 },
];

export const metadata = {
  title: 'Adaptive Ehlers Filtered Percentile',
  shortTitle: 'Adaptive Ehlers Filtered Percentile',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveEhlersFilteredPercentileInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.maSrc));

  // Volatility-adaptive length
  const deltaP = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const s = A(ta.stdev(S(deltaP), cfg.volLen));
  const sAverage = A(ta.sma(S(s), cfg.volLen));
  const adaptiveMA: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const sMin = sAverage[i] * 0.25;
    const sMax = sAverage[i] * 1.75;
    const volRange = sMax - sMin;
    const adaptiveLength = gt(volRange, 0.0)
      ? (le(s[i], sMin) ? cfg.maMax : ge(s[i], sMax) ? cfg.maMin
        : cfg.maMax - ((cfg.maMax - cfg.maMin) * (s[i] - sMin)) / volRange)
      : cfg.maMax;
    const alpha = 2.0 / (adaptiveLength + 1.0);
    const prev = i > 0 ? adaptiveMA[i - 1] : NaN;
    // adaptiveMA := na(adaptiveMA[1]) ? maSrc : adaptiveMA[1] + alpha * (maSrc - adaptiveMA[1])
    adaptiveMA[i] = isNaN(prev) ? src[i] : prev + alpha * (src[i] - prev);
  }

  // Ehlers nonlinear filter
  const ehlersFallback = A(ta.sma(S(adaptiveMA), cfg.ehlersLength));
  const at = (i: number) => (i >= 0 ? adaptiveMA[i] : NaN);
  const trendMA: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let num = 0.0;
    let coefSum = 0.0;
    for (let k = 0; k <= cfg.ehlersLength - 1; k++) {
      const cur = at(i - k);
      const ref = at(i - k - cfg.ehlersMomentum);
      if (!isNaN(cur) && !isNaN(ref)) {
        const coefficient = Math.abs(cur - ref);
        num += coefficient * cur;
        coefSum += coefficient;
      }
    }
    trendMA[i] = gt(coefSum, 0.0) ? num / coefSum : ehlersFallback[i];
  }

  // Percentile bands
  const deviation = trendMA.map((t, i) => Math.abs(src[i] - t));
  const percentileDistance = A(ta.percentile_nearest_rank(S(deviation), cfg.percentileLen, cfg.percentileLevel));
  const upperBand = trendMA.map((t, i) => t + percentileDistance[i] * cfg.upperMult);
  const lowerBand = trendMA.map((t, i) => t - percentileDistance[i] * cfg.lowerMult);

  // Regime (var int SQ = 0)
  const sq: number[] = new Array(n);
  let SQ = 0;
  for (let i = 0; i < n; i++) {
    if (gt(src[i], upperBand[i])) SQ = 1;
    else if (lt(src[i], lowerBand[i])) SQ = -1;
    sq[i] = SQ;
  }
  const col = sq.map((v) => (v === 1 ? cfg.longColor : cfg.shortColor));

  const t = (i: number) => bars[i].time;
  const upperCol = String(color.new(cfg.longColor, 35));
  const lowerCol = String(color.new(cfg.shortColor, 35));
  const plot0 = bars.map((_b, i) => ({ time: t(i), value: cfg.showMA ? trendMA[i] : NaN, color: col[i] }));
  const plot1 = bars.map((_b, i) => ({ time: t(i), value: cfg.showBands ? upperBand[i] : NaN, color: upperCol }));
  const plot2 = bars.map((_b, i) => ({ time: t(i), value: cfg.showBands ? lowerBand[i] : NaN, color: lowerCol }));

  // fill(upperPlot, lowerPlot, color = showFill ? color.new(col, 92) : na)
  const fills = [{
    plot1: 'plot1', plot2: 'plot2', options: { title: 'Percentile Band Fill' },
    colors: col.map((c) => (cfg.showFill ? String(color.new(c, 92)) : 'transparent')),
  }];

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    // longSignal = SQ == 1 and SQ[1] != 1 (SQ[1] na on the first bar: != is false)
    const longSignal = sq[i] === 1 && i > 0 && sq[i - 1] !== 1;
    const shortSignal = sq[i] === -1 && i > 0 && sq[i - 1] !== -1;
    longFlags.push(longSignal);
    shortFlags.push(shortSignal);
    if (cfg.showSignals && longSignal) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'triangleUp', color: cfg.longColor, size: 'small',
        text: 'LONG', textColor: color.white });
    }
    if (cfg.showSignals && shortSignal) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'triangleDown', color: cfg.shortColor, size: 'small',
        text: 'SHORT', textColor: color.white });
    }
    if (cfg.colorBars) barColors.push({ time: t(i), color: col[i] });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills,
    markers,
    barColors,
    // alertcondition(longSignal, ...) / alertcondition(shortSignal, ...)
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long Signal', message: 'Adaptive Ehlers Filtered Percentile Long Signal on {{ticker}}' },
  { id: 'alert1', title: 'Short Signal', message: 'Adaptive Ehlers Filtered Percentile Short Signal on {{ticker}}' },
];

export const AdaptiveEhlersFilteredPercentile = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
