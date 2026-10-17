/**
 * Trend Scalper
 *
 * Three EMAs of the close (9, 21, 89). A bullish stack is EMA1 > EMA2 > EMA3, a bearish stack EMA1 < EMA2 < EMA3.
 * A long signal is a bullish stack with the low between EMA2 and EMA1; a short signal is a bearish stack with the
 * high between EMA1 and EMA2. With "First signals only?" a long signal also needs a bearish stack within the
 * lookback bars and no long signal as the last signal (a short signal the same way).
 *
 * Alerts (alertcondition, `alerts` of the result): "Long Alert" / "Short Alert" on the bars of the long / short
 * triangles.
 *
 * Reference: "Trend Scalper" by abedmahmood
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrendScalperInputs {
  ema1Length: number;
  ema2Length: number;
  ema3Length: number;
  emaColor1: string;
  emaColor2: string;
  emaColor3: string;
  longColor: string;
  shortColor: string;
  showEMA1: boolean;
  showEMA2: boolean;
  showEMA3: boolean;
  /** Only the first signal after a stack change */
  onlyFirstTriangle: boolean;
  /** Lookback bars of the opposite stack (first signals mode) */
  lookbackBars: number;
}

export const defaultInputs: TrendScalperInputs = {
  ema1Length: 9,
  ema2Length: 21,
  ema3Length: 89,
  emaColor1: color.gray,
  emaColor2: color.gray,
  emaColor3: color.gray,
  longColor: color.green,
  shortColor: color.red,
  showEMA1: true,
  showEMA2: true,
  showEMA3: true,
  onlyFirstTriangle: false,
  lookbackBars: 50,
};

export const inputConfig: InputConfig[] = [
  { id: 'ema1Length', type: 'int', title: 'EMA 1 Length', defval: 9, min: 1 },
  { id: 'ema2Length', type: 'int', title: 'EMA 2 Length', defval: 21, min: 1 },
  { id: 'ema3Length', type: 'int', title: 'EMA 3 Length', defval: 89, min: 1 },
  { id: 'emaColor1', type: 'color', title: 'EMA 1 Color', defval: color.gray },
  { id: 'emaColor2', type: 'color', title: 'EMA 2 Color', defval: color.gray },
  { id: 'emaColor3', type: 'color', title: 'EMA 3 Color', defval: color.gray },
  { id: 'longColor', type: 'color', title: 'Long Signal Color', defval: color.green },
  { id: 'shortColor', type: 'color', title: 'Short Signal Color', defval: color.red },
  { id: 'showEMA1', type: 'bool', title: 'Show EMA 1', defval: true },
  { id: 'showEMA2', type: 'bool', title: 'Show EMA 2', defval: true },
  { id: 'showEMA3', type: 'bool', title: 'Show EMA 3', defval: true },
  { id: 'onlyFirstTriangle', type: 'bool', title: 'First signals only?', defval: false },
  { id: 'lookbackBars', type: 'int', title: 'Lookback Bars for Trend Validation', defval: 50, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 1', color: color.gray, lineWidth: 1 },
  { id: 'plot1', title: 'EMA 2', color: color.gray, lineWidth: 1 },
  { id: 'plot2', title: 'EMA 3', color: color.gray, lineWidth: 1 },
];

export const metadata = {
  title: 'Trend Scalper',
  shortTitle: 'Trend Scalper',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendScalperInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));
  const ema1 = A(ta.ema(close, cfg.ema1Length));
  const ema2 = A(ta.ema(close, cfg.ema2Length));
  const ema3 = A(ta.ema(close, cfg.ema3Length));

  const bullish = ema1.map((e1, i) => gt(e1, ema2[i]) && gt(ema2[i], ema3[i]));
  const bearish = ema1.map((e1, i) => lt(e1, ema2[i]) && lt(ema2[i], ema3[i]));
  // ta.barssince(x) <= lookbackBars: na (never true yet) compares false
  const sinceBull = A(ta.barssince(S(bullish.map((b) => (b ? 1 : 0)))));
  const sinceBear = A(ta.barssince(S(bearish.map((b) => (b ? 1 : 0)))));

  const markers: MarkerData[] = [];
  const longFlags: boolean[] = new Array(n);
  const shortFlags: boolean[] = new Array(n);
  let lastSignal = 0; // var int lastSignal = 0
  for (let i = 0; i < n; i++) {
    const { low, high } = bars[i];
    const recentBull = le(sinceBull[i], cfg.lookbackBars);
    const recentBear = le(sinceBear[i], cfg.lookbackBars);
    const longCond = bullish[i] && le(low, ema1[i]) && ge(low, ema2[i]);
    const shortCond = bearish[i] && ge(high, ema1[i]) && le(high, ema2[i]);
    const rawBuy = le(low, ema1[i]) && ge(low, ema2[i]) && bullish[i] && recentBear;
    const rawSell = ge(high, ema1[i]) && le(high, ema2[i]) && bearish[i] && recentBull;
    const buySignal = rawBuy && lastSignal !== 1;
    const sellSignal = rawSell && lastSignal !== -1;
    if (buySignal) lastSignal = 1;
    if (sellSignal) lastSignal = -1;
    const plotLong = cfg.onlyFirstTriangle ? buySignal : longCond;
    const plotShort = cfg.onlyFirstTriangle ? sellSignal : shortCond;
    longFlags[i] = plotLong;
    shortFlags[i] = plotShort;
    if (!cfg.onlyFirstTriangle && !(longCond || shortCond)) lastSignal = 0;

    // plotshape(plotLongSignal, "Long Signal", shape.triangleup, location.belowbar, longColor, size.small)
    if (plotLong) markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: cfg.longColor, size: 'small' });
    // plotshape(plotShortSignal, "Short Signal", shape.triangledown, location.abovebar, shortColor, size.small)
    if (plotShort) markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: cfg.shortColor, size: 'small' });
  }

  const line = (show: boolean, v: number[], col: string) =>
    bars.map((b, i) => ({ time: b.time, value: show ? v[i] : NaN, color: col }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(cfg.showEMA1, ema1, cfg.emaColor1),
      plot1: line(cfg.showEMA2, ema2, cfg.emaColor2),
      plot2: line(cfg.showEMA3, ema3, cfg.emaColor3),
    },
    markers,
    // alertcondition(plotLongSignal) / (plotShortSignal)
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long Alert', message: 'Trend Scalper Long Signal' },
  { id: 'alert1', title: 'Short Alert', message: 'Trend Scalper Short Signal' },
];

export const TrendScalper = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
