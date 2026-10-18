/**
 * Gamma Hedging Pressure PRO
 *
 * A momentum proxy: gammaRaw = (close - close[gammaLength]) / max(stdev(close, gammaLength), 0.00001). It is
 * normalised to -100..+100 over the lowest / highest of the last `normLookback` values, optionally smoothed with an
 * EMA, and split into a bullish pressure (the positive part) and a bearish pressure (the absolute negative part),
 * both 0..100. The background is green / red when the bullish / bearish pressure is above the extreme level.
 * Alerts (alertcondition, `alerts` of the result): each pressure above the extreme level, and crossing over it.
 *
 * Reference: "Gamma Hedging Pressure PRO (0–100 / 0–100)" by uzair2join
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, crossedOver, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface GammaHedgingPressureInputs {
  /** Length of the stdev and of the momentum */
  gammaLength: number;
  /** Lookback of the lowest / highest normalisation */
  normLookback: number;
  /** Smooth the normalised value with an EMA */
  useSmoothing: boolean;
  /** EMA length */
  smoothLength: number;
  /** Extreme level (background and hline) */
  extremeLevel: number;
}

export const defaultInputs: GammaHedgingPressureInputs = {
  gammaLength: 20,
  normLookback: 100,
  useSmoothing: true,
  smoothLength: 5,
  extremeLevel: 70,
};

export const inputConfig: InputConfig[] = [
  { id: 'gammaLength', type: 'int', title: 'Gamma Calculation Length', defval: 20 },
  { id: 'normLookback', type: 'int', title: 'Normalization Lookback', defval: 100 },
  { id: 'useSmoothing', type: 'bool', title: 'Enable EMA Smoothing', defval: true },
  { id: 'smoothLength', type: 'int', title: 'EMA Length', defval: 5 },
  { id: 'extremeLevel', type: 'int', title: 'Extreme Level', defval: 70, min: 50, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bullish Gamma Pressure', color: color.green, lineWidth: 2 },
  { id: 'plot1', title: 'Bearish Gamma Pressure', color: color.red, lineWidth: 2 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_extreme', price: 70, title: 'Extreme Level', color: color.gray, linestyle: 'dashed' },
  { id: 'hline_zero', price: 0, title: 'Zero Line', color: color.gray, linestyle: 'dashed' },
];

export const metadata = {
  title: 'Gamma Hedging Pressure PRO (0–100 / 0–100)',
  shortTitle: 'Gamma Hedging Pressure PRO (0–100 / 0–100)',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<GammaHedgingPressureInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  // volatility = ta.stdev(close, gammaLength); momentum = close - close[gammaLength]
  const volatility = A(ta.stdev(S(close), cfg.gammaLength));
  const gammaRaw = close.map((c, i) => {
    const momentum = i - cfg.gammaLength >= 0 ? c - close[i - cfg.gammaLength] : NaN;
    // math.max(na, x) is na
    return momentum / (isNaN(volatility[i]) ? NaN : Math.max(volatility[i], 0.00001));
  });

  const lowestVal = A(ta.lowest(S(gammaRaw), cfg.normLookback));
  const highestVal = A(ta.highest(S(gammaRaw), cfg.normLookback));
  const gammaNorm = gammaRaw.map((g, i) => {
    const d = highestVal[i] - lowestVal[i];
    const rangeVal = isNaN(d) ? NaN : Math.max(d, 0.00001);
    return (200 * (g - lowestVal[i])) / rangeVal - 100;
  });

  const gammaFinal = cfg.useSmoothing ? A(ta.ema(S(gammaNorm), cfg.smoothLength)) : gammaNorm;

  const bullBg = String(color.new(color.green, 85));
  const bearBg = String(color.new(color.red, 85));
  const plot0 = [];
  const plot1 = [];
  const bgColors: BgColorData[] = [];
  const bulls: number[] = [];
  const bears: number[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const g = gammaFinal[i];
    // math.max(gammaFinal, 0) / math.abs(math.min(gammaFinal, 0)): na stays na
    const bullPressure = isNaN(g) ? NaN : Math.max(g, 0);
    const bearPressure = isNaN(g) ? NaN : Math.abs(Math.min(g, 0));
    bulls.push(bullPressure);
    bears.push(bearPressure);
    plot0.push({ time, value: fin(bullPressure), color: color.green });
    plot1.push({ time, value: fin(bearPressure), color: color.red });
    const bg = gt(bullPressure, cfg.extremeLevel) ? bullBg : gt(bearPressure, cfg.extremeLevel) ? bearBg : null;
    if (bg) bgColors.push({ time, color: bg });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [
      { value: cfg.extremeLevel, options: { title: 'Extreme Level', color: color.gray, linestyle: 'dashed' } },
      { value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dashed' } },
    ],
    bgColors,
    // alertcondition(bullPressure > extremeLevel) / (bearPressure > extremeLevel) / ta.crossover(..., extremeLevel)
    alerts: alertStates(alertConditions, bars, [
      bulls.map((v) => gt(v, cfg.extremeLevel)),
      bears.map((v) => gt(v, cfg.extremeLevel)),
      crossedOver(bulls, cfg.extremeLevel),
      crossedOver(bears, cfg.extremeLevel),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Extreme Bullish Gamma', message: 'Bullish Gamma Pressure above threshold' },
  { id: 'alert1', title: 'Extreme Bearish Gamma', message: 'Bearish Gamma Pressure above threshold' },
  { id: 'alert2', title: 'Bullish Pressure Rising', message: 'Bullish Gamma crossing extreme level' },
  { id: 'alert3', title: 'Bearish Pressure Rising', message: 'Bearish Gamma crossing extreme level' },
];

export const GammaHedgingPressure = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
