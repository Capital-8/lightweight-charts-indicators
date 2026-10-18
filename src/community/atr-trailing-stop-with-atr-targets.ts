/**
 * ATR Trailing Stop with ATR Targets
 *
 * An ATR trailing stop with a trend state. In an up trend the stop is the highest high since the flip minus
 * ATR * mult; a close below it flips the trend down (stop = close + ATR * mult). In a down trend the stop is the
 * lowest low since the flip plus ATR * mult; a close above it flips the trend up (stop = close - ATR * mult). At each
 * flip three targets are frozen at the flip close +- 1, 2 and 3 ATR (ATR of the flip bar). Buy / Sell labels on the
 * flips and a light gray background on every bar.
 * Alerts (alertcondition, `alerts` of the result): 'ATR Flip Buy' / 'ATR Flip Sell' on the flips up / down (whether
 * the labels are shown or not).
 *
 * Reference: "ATR Trailing Stop with ATR Targets [v6]" by TRDRZone
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AtrTrailingStopWithAtrTargetsInputs {
  /** ATR period */
  atrLength: number;
  /** ATR multiplier of the trailing stop */
  atrMult: number;
  /** Trend state on the first bar */
  initialTrend: 'Bullish' | 'Bearish';
  /** Show the Buy / Sell labels */
  showSignals: boolean;
}

export const defaultInputs: AtrTrailingStopWithAtrTargetsInputs = {
  atrLength: 14,
  atrMult: 2.0,
  initialTrend: 'Bullish',
  showSignals: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrLength', type: 'int', title: 'ATR Period', defval: 14 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 2.0 },
  { id: 'initialTrend', type: 'string', title: 'Starting Trend', defval: 'Bullish', options: ['Bullish', 'Bearish'] },
  { id: 'showSignals', type: 'bool', title: 'Show Buy/Sell Signals', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ATR Trailing Stop', color: color.green, lineWidth: 2 },
  { id: 'plot1', title: 'Target 1 ATR', color: color.orange, lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'Target 2 ATR', color: color.yellow, lineWidth: 1, style: 'circles' },
  { id: 'plot3', title: 'Target 3 ATR', color: color.purple, lineWidth: 2, style: 'circles' },
];

export const metadata = {
  title: 'ATR Trailing Stop with ATR Targets [v6]',
  shortTitle: 'ATR Trailing Stop with ATR Targets [v6]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AtrTrailingStopWithAtrTargetsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { atrMult } = cfg;
  const atrArr = ta.atr(bars, cfg.atrLength).toArray().map((v) => v ?? NaN);

  // var state
  let trailStop = NaN;
  let highestHi = NaN;
  let lowestLo = NaN;
  let trend = cfg.initialTrend === 'Bullish' ? 1 : -1;
  let flipPrice = NaN;
  let flipBar = NaN;
  let flipAtr = NaN;
  let target1 = NaN;
  let target2 = NaN;
  let target3 = NaN;

  type Point = { time: number; value: number; color?: string };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const bg = String(color.new(color.gray, 95));
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const { high, low, close, time } = bars[i];
    const atr = atrArr[i];
    if (i === 0) {
      highestHi = high;
      lowestLo = low;
    }
    let buySignal = false;
    let sellSignal = false;
    if (trend === 1) {
      highestHi = isNaN(highestHi) ? high : Math.max(highestHi, high);
      trailStop = highestHi - atr * atrMult;
      if (lt(close, trailStop)) {
        trend = -1;
        highestHi = NaN;
        lowestLo = low;
        trailStop = close + atr * atrMult;
        flipPrice = close;
        flipBar = i;
        flipAtr = atr;
        target1 = flipPrice - flipAtr * 1;
        target2 = flipPrice - flipAtr * 2;
        target3 = flipPrice - flipAtr * 3;
        sellSignal = true;
      }
    } else {
      lowestLo = isNaN(lowestLo) ? low : Math.min(lowestLo, low);
      trailStop = lowestLo + atr * atrMult;
      if (gt(close, trailStop)) {
        trend = 1;
        lowestLo = NaN;
        highestHi = high;
        trailStop = close - atr * atrMult;
        flipPrice = close;
        flipBar = i;
        flipAtr = atr;
        target1 = flipPrice + flipAtr * 1;
        target2 = flipPrice + flipAtr * 2;
        target3 = flipPrice + flipAtr * 3;
        buySignal = true;
      }
    }

    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    plot0.push({ time, value: trailStop, color: trend === 1 ? color.green : color.red });
    // showTargets = not na(flipBar) and bar_index >= flipBar
    const showTargets = !isNaN(flipBar) && i >= flipBar;
    plot1.push({ time, value: showTargets ? target1 : NaN, color: color.orange });
    plot2.push({ time, value: showTargets ? target2 : NaN, color: color.yellow });
    plot3.push({ time, value: showTargets ? target3 : NaN, color: color.purple });

    if (cfg.showSignals && buySignal) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY',
        textColor: color.white, size: 'small' });
    }
    if (cfg.showSignals && sellSignal) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.white, size: 'small' });
    }
    // bgcolor(color.new(color.gray, 95))
    bgColors.push({ time, color: bg });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    markers,
    bgColors,
    // alertcondition(buySignal, ...) / alertcondition(sellSignal, ...)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ATR Flip Buy', message: 'ATR trailing stop flipped bullish — BUY' },
  { id: 'alert1', title: 'ATR Flip Sell', message: 'ATR trailing stop flipped bearish — SELL' },
];

export const AtrTrailingStopWithAtrTargets = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
