/**
 * Combo Oscillator - MACD + Stoch + RSI + EMA
 *
 * The average of four components, smoothed with an EMA:
 * - EMA: (ema(close, fast) - ema(close, slow)) / atr * 35, clamped to -100..100 (0 when atr is 0 or na)
 * - MACD: macd histogram / atr * 250, clamped to -100..100 (0 when atr is 0 or na)
 * - RSI: (rsi - 50) * 2
 * - Stochastic: (sma(stoch, smoothK) - 50) * 2
 * The line is lime at or above 0 and red below 0. Labels mark the crosses of the line above and below 0. The
 * component lines are optional.
 * Alerts (alertcondition, `alerts` of the result): 'Combo Bullish Cross' and 'Combo Bearish Cross', true on the bars
 * where the line crosses above / below 0 (also with the signals hidden).
 *
 * Reference: "Combo Oscillator - MACD + Stoch + RSI + EMA" by Gauder84
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, callsite, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ComboOscillatorMacdStochRsiEmaInputs {
  emaFastLen: number;
  emaSlowLen: number;
  macdFastLen: number;
  macdSlowLen: number;
  macdSignalLen: number;
  rsiLen: number;
  stochLen: number;
  stochSmoothK: number;
  /** Stoch D smoothing (the D line is computed in the source but not used) */
  stochSmoothD: number;
  atrLen: number;
  smoothLen: number;
  showComponents: boolean;
  showSignals: boolean;
}

export const defaultInputs: ComboOscillatorMacdStochRsiEmaInputs = {
  emaFastLen: 21,
  emaSlowLen: 55,
  macdFastLen: 12,
  macdSlowLen: 26,
  macdSignalLen: 9,
  rsiLen: 14,
  stochLen: 14,
  stochSmoothK: 3,
  stochSmoothD: 3,
  atrLen: 14,
  smoothLen: 3,
  showComponents: false,
  showSignals: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaFastLen', type: 'int', title: 'EMA Fast', defval: 21, min: 1 },
  { id: 'emaSlowLen', type: 'int', title: 'EMA Slow', defval: 55, min: 1 },
  { id: 'macdFastLen', type: 'int', title: 'MACD Fast', defval: 12, min: 1 },
  { id: 'macdSlowLen', type: 'int', title: 'MACD Slow', defval: 26, min: 1 },
  { id: 'macdSignalLen', type: 'int', title: 'MACD Signal', defval: 9, min: 1 },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'stochLen', type: 'int', title: 'Stochastic Length', defval: 14, min: 1 },
  { id: 'stochSmoothK', type: 'int', title: 'Stoch K Smooth', defval: 3, min: 1 },
  { id: 'stochSmoothD', type: 'int', title: 'Stoch D Smooth', defval: 3, min: 1 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'smoothLen', type: 'int', title: 'Combo Smoothing', defval: 3, min: 1 },
  { id: 'showComponents', type: 'bool', title: 'Show component lines', defval: false },
  { id: 'showSignals', type: 'bool', title: 'Show zero-line cross signals', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Combo Oscillator', color: color.lime, lineWidth: 2 },
  { id: 'plot1', title: 'EMA Component', color: color.orange, lineWidth: 1 },
  { id: 'plot2', title: 'MACD Component', color: color.blue, lineWidth: 1 },
  { id: 'plot3', title: 'RSI Component', color: color.purple, lineWidth: 1 },
  { id: 'plot4', title: 'Stoch Component', color: color.aqua, lineWidth: 1 },
];

export const metadata = {
  title: 'Combo Oscillator - MACD + Stoch + RSI + EMA',
  shortTitle: 'Combo Oscillator - MACD + Stoch + RSI + EMA',
  overlay: false,
};

/** Pine float comparisons: a == b within 1e-10; na compares false (`na != 0` is false) */
const EPS = 1e-10;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<ComboOscillatorMacdStochRsiEmaInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));
  const high = S(bars.map((b) => b.high));
  const low = S(bars.map((b) => b.low));
  // math.max(-100, math.min(100, x)): na stays na
  const clamp = (x: number) => Math.max(-100, Math.min(100, x));

  const emaFast = A(ta.ema(close, cfg.emaFastLen));
  const emaSlow = A(ta.ema(close, cfg.emaSlowLen));
  const atr = A(ta.atr(bars, cfg.atrLen));
  const [, , macdHistS] = ta.macd(close, cfg.macdFastLen, cfg.macdSlowLen, cfg.macdSignalLen);
  const macdHist = A(macdHistS);
  const rsi = A(ta.rsi(close, cfg.rsiLen));
  const stochRaw = ta.stoch(close, high, low, cfg.stochLen);
  const stochK = A(ta.sma(stochRaw, cfg.stochSmoothK));

  const emaComponent: number[] = new Array(n);
  const macdComponent: number[] = new Array(n);
  const rsiComponent: number[] = new Array(n);
  const stochComponent: number[] = new Array(n);
  const comboRaw: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const atrOk = ne(atr[i], 0);
    emaComponent[i] = clamp((atrOk ? (emaFast[i] - emaSlow[i]) / atr[i] : 0.0) * 35.0);
    macdComponent[i] = clamp((atrOk ? macdHist[i] / atr[i] : 0.0) * 250.0);
    rsiComponent[i] = (rsi[i] - 50.0) * 2.0;
    stochComponent[i] = (stochK[i] - 50.0) * 2.0;
    comboRaw[i] = (emaComponent[i] + macdComponent[i] + rsiComponent[i] + stochComponent[i]) / 4.0;
  }
  const combo = A(ta.ema(S(comboRaw), cfg.smoothLen));

  const t = (i: number) => bars[i].time;
  const plot0 = bars.map((_b, i) => ({ time: t(i), value: combo[i], color: ge(combo[i], 0) ? color.lime : color.red }));
  const component = (values: number[], c: string) =>
    bars.map((_b, i) => ({ time: t(i), value: cfg.showComponents ? values[i] : NaN, color: c }));

  // ta.crossover(combo, 0) / ta.crossunder(combo, 0): exact comparisons
  const markers: MarkerData[] = [];
  const bullSite = callsite.crossover();
  const bearSite = callsite.crossunder();
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const bullCross = bullSite(combo[i], 0);
    const bearCross = bearSite(combo[i], 0);
    bullFlags.push(!!bullCross);
    bearFlags.push(!!bearCross);
    if (cfg.showSignals && bullCross) {
      markers.push({ time: t(i), position: 'bottom', shape: 'labelUp', color: color.green, text: '▲',
        textColor: color.white, size: 'tiny' });
    }
    if (cfg.showSignals && bearCross) {
      markers.push({ time: t(i), position: 'top', shape: 'labelDown', color: color.red, text: '▼',
        textColor: color.white, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0,
      plot1: component(emaComponent, color.orange),
      plot2: component(macdComponent, color.blue),
      plot3: component(rsiComponent, color.purple),
      plot4: component(stochComponent, color.aqua),
    },
    hlines: [
      { value: 0, options: { title: 'Zero', color: String(color.new(color.gray, 40)), linestyle: 'dashed' as const } },
      { value: 50, options: { title: '+50', color: String(color.new(color.gray, 80)), linestyle: 'dashed' as const } },
      { value: -50, options: { title: '-50', color: String(color.new(color.gray, 80)), linestyle: 'dashed' as const } },
    ],
    markers,
    // alertcondition(bullCross, "Combo Bullish Cross") / alertcondition(bearCross, "Combo Bearish Cross")
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Combo Bullish Cross', message: 'Combo Oscillator crossed above zero.' },
  { id: 'alert1', title: 'Combo Bearish Cross', message: 'Combo Oscillator crossed below zero.' },
];

export const ComboOscillatorMacdStochRsiEma = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
