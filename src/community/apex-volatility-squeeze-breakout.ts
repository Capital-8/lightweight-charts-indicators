/**
 * Apex Volatility Squeeze & Breakout
 *
 * Bollinger bands (SMA of the close +- mult * stdev) smoothed by an EMA, with a squeeze state when the band width
 * (mult * stdev) is below the Keltner width (mult * ATR). A trend state is 1 when the close is above the smoothed
 * upper band and no squeeze, -1 when below the smoothed lower band and no squeeze, 0 in a squeeze (kept otherwise).
 * The bands, the basis circles, the cloud fill and the candles take the trend colour. The Buy / Sell conditions of
 * the source require trend == 1 (or -1) and trend == 0 on the same bar, so they never fire (ported as written).
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Volatility Breakout' / 'Bearish Volatility Breakout' on
 * the Buy / Sell conditions (so, as in the original, they never trigger).
 *
 * Reference: "Apex Volatility Squeeze & Breakout [Pineify]" by Pineify
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ApexVolatilitySqueezeBreakoutInputs {
  /** Lookback length of the SMA, stdev and ATR */
  length: number;
  /** Band multiplier (stdev) */
  bbMult: number;
  /** Squeeze multiplier (ATR) */
  kcMult: number;
  /** EMA length of the band smoothing */
  smoothLen: number;
  bullColor: string;
  bearColor: string;
  sqzColor: string;
  /** Colour the candles by the trend state */
  colorBars: boolean;
}

export const defaultInputs: ApexVolatilitySqueezeBreakoutInputs = {
  length: 20,
  bbMult: 2.0,
  kcMult: 1.5,
  smoothLen: 5,
  bullColor: '#089981',
  bearColor: '#f23645',
  sqzColor: '#ffb74d',
  colorBars: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Lookback Length', defval: 20, min: 2 },
  { id: 'bbMult', type: 'float', title: 'Band Multiplier (StDev)', defval: 2.0, step: 0.1 },
  { id: 'kcMult', type: 'float', title: 'Squeeze Multiplier (ATR)', defval: 1.5, step: 0.1 },
  { id: 'smoothLen', type: 'int', title: 'Band Smoothing', defval: 5, min: 1 },
  { id: 'bullColor', type: 'color', title: 'Bullish Trend', defval: '#089981' },
  { id: 'bearColor', type: 'color', title: 'Bearish Trend', defval: '#f23645' },
  { id: 'sqzColor', type: 'color', title: 'Squeeze (Consolidation)', defval: '#ffb74d' },
  { id: 'colorBars', type: 'bool', title: 'Color Candles Based on Volatility Trend', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Volatility Band', color: '#ffb74d', lineWidth: 2 },
  { id: 'plot1', title: 'Lower Volatility Band', color: '#ffb74d', lineWidth: 2 },
  { id: 'plot2', title: 'Center Basis', color: '#ffb74d', lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'Apex Volatility Squeeze & Breakout [Pineify]',
  shortTitle: 'Apex Volatility Squeeze & Breakout [Pineify]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ApexVolatilitySqueezeBreakoutInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  const basis = A(ta.sma(S(close), cfg.length));
  const sd = A(ta.stdev(S(close), cfg.length));
  const atrRaw = A(ta.atr(bars, cfg.length));
  const dev = sd.map((v) => cfg.bbMult * v);
  const atr = atrRaw.map((v) => cfg.kcMult * v);
  const isSqueeze = dev.map((d, i) => lt(d, atr[i]));
  const upperRaw = basis.map((b, i) => b + dev[i]);
  const lowerRaw = basis.map((b, i) => b - dev[i]);
  const smoothUpper = A(ta.ema(S(upperRaw), cfg.smoothLen));
  const smoothLower = A(ta.ema(S(lowerRaw), cfg.smoothLen));
  const smoothBasis = A(ta.ema(S(basis), cfg.smoothLen));

  // var int trend = 0
  const trendArr: number[] = new Array(n);
  let trend = 0;
  for (let i = 0; i < n; i++) {
    const c = close[i];
    if (gt(c, smoothUpper[i]) && !isSqueeze[i]) trend = 1;
    else if (lt(c, smoothLower[i]) && !isSqueeze[i]) trend = -1;
    else if (isSqueeze[i]) trend = 0;
    trendArr[i] = trend;
  }
  const currentColor = trendArr.map((t) => (t === 1 ? cfg.bullColor : t === -1 ? cfg.bearColor : cfg.sqzColor));

  const t = (i: number) => bars[i].time;
  const plot0 = bars.map((_b, i) => ({ time: t(i), value: smoothUpper[i], color: currentColor[i] }));
  const plot1 = bars.map((_b, i) => ({ time: t(i), value: smoothLower[i], color: currentColor[i] }));
  const plot2 = bars.map((_b, i) => ({ time: t(i), value: smoothBasis[i], color: String(color.new(currentColor[i], 50)) }));

  // fill(p_upper, p_lower, color = color.new(current_color, 90), title = "Volatility Cloud")
  const fills = [{
    plot1: 'plot0', plot2: 'plot1', options: { title: 'Volatility Cloud' },
    colors: currentColor.map((c) => String(color.new(c, 90))),
  }];

  // barcolor(color_bars ? (close > open ? current_color : color.new(current_color, 40)) : na)
  const barColors: BarColorData[] = cfg.colorBars
    ? bars.map((b, i) => ({
      time: b.time,
      color: gt(b.close, b.open) ? currentColor[i] : String(color.new(currentColor[i], 40)),
    }))
    : [];

  // long_breakout = ta.crossover(close, smooth_upper) and trend == 1 and trend == 0 (never true, as in the source)
  const crossUp = ta.crossover(S(close), S(smoothUpper)).toArray();
  const crossDown = ta.crossunder(S(close), S(smoothLower)).toArray();
  const markers: MarkerData[] = [];
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const isTrend = (k: number) => trendArr[i] === k;
    const longBreakout = !!crossUp[i] && isTrend(1) && isTrend(0);
    const shortBreakout = !!crossDown[i] && isTrend(-1) && isTrend(0);
    longFlags.push(longBreakout);
    shortFlags.push(shortBreakout);
    if (longBreakout) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'labelUp', color: cfg.bullColor, text: 'BUY',
        textColor: color.white, size: 'small' });
    }
    if (shortBreakout) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'labelDown', color: cfg.bearColor, text: 'SELL',
        textColor: color.white, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills,
    barColors,
    markers,
    // alertcondition(long_breakout, ...) / alertcondition(short_breakout, ...)
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Volatility Breakout', message: 'Price broke out of the squeeze upwards. Buy Signal.' },
  { id: 'alert1', title: 'Bearish Volatility Breakout', message: 'Price broke out of the squeeze downwards. Sell Signal.' },
];

export const ApexVolatilitySqueezeBreakout = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
