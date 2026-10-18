/**
 * Accurate Swing Trading System
 *
 * Swing support/resistance with buy/sell signals, as the original: res = highest(high, swing), sup = lowest(low,
 * swing); the direction is 1 when the close is above res[1], -1 below sup[1] (its last non-zero value is kept);
 * TSL = sup in direction 1, else res (width 3), green when the close is at or above it, else red; the same colour
 * on the bars ('Barcolor') and the background ('Bgcolor', transparency 90). BUY / SELL labels (black text) where
 * the close crosses above / below the TSL.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' / 'Sell Signal', on the bars of these labels.
 *
 * Reference: "Accurate Swing Trading System" (community)
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import {
  alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState,
} from '../alert-states';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

// color.green / color.red / color.black of a version 4 script
const GREEN = '#4CAF50';
const RED = '#FF5252';
const BLACK = '#363A45';
const GREEN_90 = String(color.new(GREEN, 90));
const RED_90 = String(color.new(RED, 90));

export interface AccurateSwingTradingInputs {
  swingLength: number;
  showBarColor: boolean;
  showBgColor: boolean;
}

export const defaultInputs: AccurateSwingTradingInputs = {
  swingLength: 3,
  showBarColor: true,
  showBgColor: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'swingLength', type: 'int', title: 'Swing Length', defval: 3, min: 1 },
  { id: 'showBarColor', type: 'bool', title: 'Color Bars', defval: true },
  { id: 'showBgColor', type: 'bool', title: 'Background Color', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'TSL', color: '#4CAF50', lineWidth: 3 },
];

export const metadata = {
  title: 'Accurate Swing Trading',
  shortTitle: 'AST',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<AccurateSwingTradingInputs> = {},
): IndicatorResult & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const { swingLength, showBarColor, showBgColor } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  // res = highest(high, no), sup = lowest(low, no): na until the window is full
  const hh = ta.highest(highSeries, swingLength).toArray();
  const ll = ta.lowest(lowSeries, swingLength).toArray();

  // avd = iff(close > res[1], 1, iff(close < sup[1], -1, 0)), avn = valuewhen(avd != 0, avd, 0) (na before the
  // first), tsl = iff(avn == 1, sup, res)
  const tsl: number[] = new Array(n);
  let avn = NaN;
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const res1 = i > 0 ? hh[i - 1] ?? NaN : NaN;
    const sup1 = i > 0 ? ll[i - 1] ?? NaN : NaN;
    const avd = gt(c, res1) ? 1 : lt(c, sup1) ? -1 : 0;
    if (avd !== 0) avn = avd;
    tsl[i] = avn === 1 ? ll[i] ?? NaN : hh[i] ?? NaN;
  }
  const closes = bars.map((b) => b.close);
  // Buy = crossover(close, tsl), Sell = crossunder(close, tsl)
  const buy = crossedOver(closes, tsl);
  const sell = crossedUnder(closes, tsl);

  // colr = close >= tsl ? color.green : close <= tsl ? color.red : na
  const colr = bars.map((b, i) => (Number.isNaN(tsl[i]) ? null : !lt(b.close, tsl[i]) ? GREEN : RED));

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    // plotshape(Buy, "BUY", shape.labelup, location.belowbar, color.green, text = "BUY", textcolor = color.black)
    if (buy[i]) markers.push({ id: 'shape0', time: t, position: 'belowBar', shape: 'labelUp', color: GREEN, text: 'BUY', textColor: BLACK });
    // plotshape(Sell, "SELL", shape.labeldown, location.abovebar, color.red, text = "SELL", textcolor = color.black)
    if (sell[i]) markers.push({ id: 'shape1', time: t, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'SELL', textColor: BLACK });
    const c = colr[i];
    if (c === null) continue;
    // barcolor(Barcolor ? colr : na); bgcolor(Bgcolor ? colr : na) (default transparency 90)
    if (showBarColor) barColors.push({ id: 'barcolor0', time: t, color: c });
    if (showBgColor) bgColors.push({ id: 'bgcolor0', time: t, color: c === GREEN ? GREEN_90 : RED_90 });
  }

  // plot(tsl, color = colr, linewidth = 3, title = "TSL")
  const tslPlot = tsl.map((v, i) => ({ time: bars[i].time, value: v, color: colr[i] ?? 'transparent' }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': tslPlot },
    markers,
    barColors,
    bgColors,
    alerts: alertStates(alertConditions, bars, [buy, sell]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell' },
];

export const AccurateSwingTrading = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
