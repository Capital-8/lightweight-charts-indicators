/**
 * Flexible Marubozu Detector
 *
 * A marubozu is a candle with a long body (at least a percentage of the high - low range) and small shadows (each
 * shadow at most a percentage of the range); optionally the range must be at least a multiple of ATR(14). Bullish
 * (close > open) and bearish (close < open) marubozu candles get a bar colour and a BULL / BEAR MARU label.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Marubozu' and 'Bearish Marubozu', true on those candles.
 *
 * Reference: "Marubozu Detector" by toppermost
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Marubozu', message: 'Bullish Marubozu on {{ticker}}' },
  { id: 'alert1', title: 'Bearish Marubozu', message: 'Bearish Marubozu on {{ticker}}' },
];

export interface MarubozuDetectorInputs {
  /** Max shadow % of range (0-20) */
  shadowTolerance: number;
  /** Min body % of range (50-100) */
  minBodyPercent: number;
  /** Require a minimum candle size (range >= multiple of ATR(14)) */
  useMinSize: boolean;
  /** Min range multiple of ATR(14) */
  minSizeMult: number;
}

export const defaultInputs: MarubozuDetectorInputs = {
  shadowTolerance: 10.0,
  minBodyPercent: 80.0,
  useMinSize: false,
  minSizeMult: 1.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'shadowTolerance', type: 'float', title: 'Max Shadow % of Range', defval: 10.0, min: 0, max: 20 },
  { id: 'minBodyPercent', type: 'float', title: 'Min Body % of Range', defval: 80.0, min: 50, max: 100 },
  { id: 'useMinSize', type: 'bool', title: 'Require Min Candle Size (ATR-based)', defval: false },
  { id: 'minSizeMult', type: 'float', title: 'Min Range Multiple of ATR(14)', defval: 1.0, min: 0.5, max: 2.0, step: 0.1 },
];

// No plot(): the outputs are bar colours and plotshape labels
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Flexible Marubozu Detector',
  shortTitle: 'Marubozu',
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
  inputs: Partial<MarubozuDetectorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const shadowTolerance = cfg.shadowTolerance / 100;
  const minBodyPercent = cfg.minBodyPercent / 100;
  const atr14 = ta.atr(bars, 14).toArray().map((v) => v ?? NaN);

  const bullBar = String(color.new(color.green, 60));
  const bearBar = String(color.new(color.red, 60));
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  bars.forEach((b, i) => {
    const candleRange = b.high - b.low;
    const body = Math.abs(b.close - b.open);
    const upperShadow = b.high - Math.max(b.open, b.close);
    const lowerShadow = Math.min(b.open, b.close) - b.low;

    const isLongBody = ge(body, minBodyPercent * candleRange);
    const smallShadows = le(upperShadow, shadowTolerance * candleRange) && le(lowerShadow, shadowTolerance * candleRange);
    const isLargeEnough = cfg.useMinSize ? ge(candleRange, cfg.minSizeMult * atr14[i]) : true;

    const bullishMarubozu = isLongBody && smallShadows && isLargeEnough && gt(b.close, b.open);
    const bearishMarubozu = isLongBody && smallShadows && isLargeEnough && lt(b.close, b.open);
    bullFlags.push(bullishMarubozu);
    bearFlags.push(bearishMarubozu);

    // barcolor(bullishMarubozu ? color.new(color.green, 60) : bearishMarubozu ? color.new(color.red, 60) : na)
    if (bullishMarubozu) barColors.push({ time: b.time, color: bullBar });
    else if (bearishMarubozu) barColors.push({ time: b.time, color: bearBar });

    // plotshape(..., style = shape.labelup / labeldown, size = size.small, textcolor = color.white)
    if (bullishMarubozu) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BULL\nMARU',
        textColor: color.white, size: 'small' });
    }
    if (bearishMarubozu) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'BEAR\nMARU',
        textColor: color.white, size: 'small' });
    }
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    // alertcondition(bullishMarubozu, "Bullish Marubozu") and alertcondition(bearishMarubozu, "Bearish Marubozu")
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

export const MarubozuDetector = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
