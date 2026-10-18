/**
 * Projected Crossover Trend
 *
 * Fast EMA and slow SMA of the source. The projected cross is fastLen * (fast - slow); the Market Direction Indicator
 * (MDI) is the EMA of 100 * its bar-to-bar change / close. The trend state turns long when the MDI is above 0 and the
 * close is above the close slowLen bars ago, short when the MDI is below 0 and the close is below it; otherwise it
 * keeps its value. Bars take the trend colour; LONG / SHORT triangles mark the state changes.
 * Alerts (alertcondition, `alerts` of the result): 'Long Signal' and 'Short Signal', true on the state changes.
 *
 * Reference: "Projected Crossover Trend" by SchizoQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © SchizoQuant
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ProjectedCrossoverTrendInputs {
  src: SourceType;
  /** Fast EMA length */
  fastLen: number;
  /** Slow SMA length (also the close lookback of the trend state) */
  slowLen: number;
  /** EMA length of the MDI */
  smoothLen: number;
  colorBars: boolean;
  showSignals: boolean;
  longColor: string;
  shortColor: string;
}

export const defaultInputs: ProjectedCrossoverTrendInputs = {
  src: 'close',
  fastLen: 10,
  slowLen: 30,
  smoothLen: 5,
  colorBars: true,
  showSignals: true,
  longColor: 'rgb(57, 255, 20)',
  shortColor: 'rgb(138, 43, 226)',
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'fastLen', type: 'int', title: 'Fast MA Length', defval: 10, min: 2 },
  { id: 'slowLen', type: 'int', title: 'Slow MA Length', defval: 30, min: 3 },
  { id: 'smoothLen', type: 'int', title: 'MDI Smooth Length', defval: 5, min: 1 },
  { id: 'colorBars', type: 'bool', title: 'Color Bars', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Signals', defval: true },
  { id: 'longColor', type: 'color', title: 'Bullish Color', defval: 'rgb(57, 255, 20)' },
  { id: 'shortColor', type: 'color', title: 'Bearish Color', defval: 'rgb(138, 43, 226)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast MA', color: 'rgb(57, 255, 20)', lineWidth: 2 },
  { id: 'plot1', title: 'Slow MA', color: 'rgb(138, 43, 226)', lineWidth: 2 },
];

export const metadata = {
  title: 'Projected Crossover Trend',
  shortTitle: 'Projected Crossover Trend',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ProjectedCrossoverTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = getSourceSeries(bars, cfg.src);

  const fastMA = A(ta.ema(src, cfg.fastLen));
  const slowMA = A(ta.sma(src, cfg.slowLen));
  const projectedCross = fastMA.map((f, i) => cfg.fastLen * (f - slowMA[i]));
  // mdiRaw = 100 * (projectedCross - projectedCross[1]) / close (x / 0 = na)
  const mdiRaw = projectedCross.map((p, i) => {
    const c = bars[i].close;
    return i > 0 && c !== 0 ? (100 * (p - projectedCross[i - 1])) / c : NaN;
  });
  const mdi = A(ta.ema(Series.fromArray(bars, mdiRaw), cfg.smoothLen));

  const t = (i: number) => bars[i].time;
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];
  let sq = 0; // var int SQ = 0
  for (let i = 0; i < n; i++) {
    const prevSq = sq;
    const closeBack = i - cfg.slowLen >= 0 ? bars[i - cfg.slowLen].close : NaN;
    if (gt(mdi[i], 0) && gt(bars[i].close, closeBack)) sq = 1;
    if (lt(mdi[i], 0) && lt(bars[i].close, closeBack)) sq = -1;
    // SQ[1] is na on the first bar: na != 1 is false
    const longSignal = i > 0 && sq === 1 && prevSq !== 1;
    const shortSignal = i > 0 && sq === -1 && prevSq !== -1;
    longFlags.push(longSignal);
    shortFlags.push(shortSignal);

    // barcolor(colorBars ? (SQ == 1 ? longColor : shortColor) : na)
    if (cfg.colorBars) barColors.push({ time: t(i), color: sq === 1 ? cfg.longColor : cfg.shortColor });
    if (cfg.showSignals && longSignal) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'triangleUp', color: cfg.longColor, size: 'small',
        text: 'LONG', textColor: color.white });
    }
    if (cfg.showSignals && shortSignal) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'triangleDown', color: cfg.shortColor, size: 'small',
        text: 'SHORT', textColor: color.white });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((_b, i) => ({ time: t(i), value: fastMA[i], color: cfg.longColor })),
      plot1: bars.map((_b, i) => ({ time: t(i), value: slowMA[i], color: cfg.shortColor })),
    },
    markers,
    barColors,
    // alertcondition(longSignal, "Long Signal") / alertcondition(shortSignal, "Short Signal")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long Signal', message: 'Projected Crossover Trend LONG Signal on {{ticker}}' },
  { id: 'alert1', title: 'Short Signal', message: 'Projected Crossover Trend SHORT Signal on {{ticker}}' },
];

export const ProjectedCrossoverTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
