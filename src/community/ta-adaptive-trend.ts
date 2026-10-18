/**
 * TA Adaptive Trend Lite
 *
 * A fast and a slow EMA of the close. The zone between them is filled mint green when the fast EMA is above the slow
 * EMA, orange when it is below, gray otherwise. Triangles mark the crosses of the fast EMA over / under the slow EMA.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish EMA cross' and 'Bearish EMA cross', on the bars of the
 * crosses (whatever the marker input).
 *
 * Reference: "TA (Miles) Adaptive Trend" by TradingApologist
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0', title: 'Bullish EMA cross',
    message: 'TA Adaptive Trend: fast EMA crossed above slow EMA on {{ticker}} ({{interval}})',
  },
  {
    id: 'alert1', title: 'Bearish EMA cross',
    message: 'TA Adaptive Trend: fast EMA crossed below slow EMA on {{ticker}} ({{interval}})',
  },
];

export interface TaAdaptiveTrendInputs {
  /** Fast EMA length */
  fastLen: number;
  /** Slow EMA length */
  slowLen: number;
  /** Show the crossover markers */
  showFlips: boolean;
}

export const defaultInputs: TaAdaptiveTrendInputs = {
  fastLen: 21,
  slowLen: 55,
  showFlips: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLen', type: 'int', title: 'Fast EMA', defval: 21, min: 2 },
  { id: 'slowLen', type: 'int', title: 'Slow EMA', defval: 55, min: 2 },
  { id: 'showFlips', type: 'bool', title: 'Show crossover markers', defval: true },
];

const FAST_COLOR = String(color.new(color.teal, 0));
const SLOW_COLOR = String(color.new(color.orange, 0));
const ZONE_UP = String(color.new('#98FF98', 80));
const ZONE_DOWN = String(color.new(color.orange, 85));
const ZONE_FLAT = String(color.new(color.gray, 90));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast EMA', color: FAST_COLOR, lineWidth: 1 },
  { id: 'plot1', title: 'Slow EMA', color: SLOW_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: 'TA Adaptive Trend Lite',
  shortTitle: 'TA Adaptive Trend Lite',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TaAdaptiveTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const closeS = Series.fromArray(bars, bars.map((b) => b.close));

  const fastS = ta.ema(closeS, cfg.fastLen);
  const slowS = ta.ema(closeS, cfg.slowLen);
  const fastMA = A(fastS);
  const slowMA = A(slowS);
  // ta.crossover / ta.crossunder: exact comparisons
  const bull = A(ta.crossover(fastS, slowS));
  const bear = A(ta.crossunder(fastS, slowS));

  const plot0 = [];
  const plot1 = [];
  const zoneColors: string[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    plot0.push({ time, value: fastMA[i], color: FAST_COLOR });
    plot1.push({ time, value: slowMA[i], color: SLOW_COLOR });
    zoneColors.push(gt(fastMA[i], slowMA[i]) ? ZONE_UP : lt(fastMA[i], slowMA[i]) ? ZONE_DOWN : ZONE_FLAT);
    if (cfg.showFlips && bull[i] === 1) {
      markers.push({ time, position: 'belowBar', shape: 'triangleUp', color: color.teal, size: 'tiny' });
    }
    if (cfg.showFlips && bear[i] === 1) {
      markers.push({ time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    // fill(pFast, pSlow, color = zoneColor, title = "Trend Zone")
    fills: [{ plot1: 'plot0', plot2: 'plot1', colors: zoneColors, options: { title: 'Trend Zone' } }],
    markers,
    // alertcondition(bull, 'Bullish EMA cross') / alertcondition(bear, 'Bearish EMA cross')
    alerts: alertStates(alertConditions, bars, [bull.map((v) => v === 1), bear.map((v) => v === 1)]),
  };
}

export const TaAdaptiveTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
