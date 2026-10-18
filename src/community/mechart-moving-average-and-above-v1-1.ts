/**
 * MechArt Moving Average and % Above V1.1
 *
 * A moving average of the close (SMA, EMA, WMA or VWMA) and a target line `percentage` % above it:
 * target = MA * (1 + percentage / 100). The background is red when the chosen price (high by default) is above the
 * target, and green when the chosen price (high by default) is below the moving average.
 * Alerts (alertcondition, `alerts` of the result): 'Price Above Target Price (Red)' and 'Price Below Moving Average
 * (Green)', true on the bars of the red and of the green background.
 *
 * Reference: "MechArt Moving Average and % Above V1.1" by MechArt_
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Price Above Target Price (Red)', message: 'Price is above the target price' },
  { id: 'alert1', title: 'Price Below Moving Average (Green)', message: 'Price is below the moving average' },
];

type MaType = 'SMA' | 'EMA' | 'WMA' | 'VWMA';
type PriceType = 'close' | 'open' | 'high' | 'low';

export interface MechartMovingAverageAndAboveV11Inputs {
  /** Moving average type */
  maType: MaType;
  /** Moving average length */
  smaPeriod: number;
  /** Target distance above the moving average (%) */
  percentage: number;
  /** Price compared with the target (red background) */
  priceTypeRed: PriceType;
  /** Price compared with the moving average (green background) */
  priceTypeGreen: PriceType;
}

export const defaultInputs: MechartMovingAverageAndAboveV11Inputs = {
  maType: 'SMA',
  smaPeriod: 200,
  percentage: 100,
  priceTypeRed: 'high',
  priceTypeGreen: 'high',
};

const PRICE_TYPES = ['close', 'open', 'high', 'low'];

export const inputConfig: InputConfig[] = [
  { id: 'maType', type: 'string', title: 'Moving Average Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA', 'VWMA'] },
  { id: 'smaPeriod', type: 'int', title: 'SMA Period', defval: 200, min: 1, max: 500 },
  { id: 'percentage', type: 'int', title: 'Percentage Above MA', defval: 100, min: 1, max: 500 },
  { id: 'priceTypeRed', type: 'string', title: 'Price Type for Red Trigger (Above Target)', defval: 'high', options: PRICE_TYPES },
  { id: 'priceTypeGreen', type: 'string', title: 'Price Type for Green Trigger (Below MA)', defval: 'high', options: PRICE_TYPES },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Moving Average', color: color.blue, lineWidth: 2 },
  { id: 'plot1', title: 'Target Price', color: color.red, lineWidth: 2 },
];

export const metadata = {
  title: 'MechArt Moving Average and % Above V1.1',
  shortTitle: 'MechArt Moving Average and % Above V1.1',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<MechartMovingAverageAndAboveV11Inputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));
  const price = (b: Bar, type: PriceType) => b[type];

  // Only the selected switch branch runs (the type is an input)
  let ma: number[];
  switch (cfg.maType) {
    case 'EMA': ma = A(ta.ema(close, cfg.smaPeriod)); break;
    case 'WMA': ma = A(ta.wma(close, cfg.smaPeriod)); break;
    case 'VWMA': ma = A(ta.vwma(close, cfg.smaPeriod, S(bars.map((b) => b.volume ?? NaN)))); break;
    default: ma = A(ta.sma(close, cfg.smaPeriod)); break;
  }
  // targetPrice = maValue * (1 + percentage / 100) (int / int is a float division in Pine v6)
  const target = ma.map((m) => m * (1 + cfg.percentage / 100));

  const red = String(color.new(color.red, 90));
  const green = String(color.new(color.green, 90));
  const bgColors: BgColorData[] = [];
  const aboveFlags: boolean[] = [], belowFlags: boolean[] = [];
  bars.forEach((b, i) => {
    const conditionAbove = gt(price(b, cfg.priceTypeRed), target[i]);
    const conditionBelow = lt(price(b, cfg.priceTypeGreen), ma[i]);
    aboveFlags.push(conditionAbove);
    belowFlags.push(conditionBelow);
    // bgcolor layers in Pine order (the later call is drawn on top)
    if (conditionAbove) bgColors.push({ time: b.time, color: red });
    if (conditionBelow) bgColors.push({ time: b.time, color: green });
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: ma[i], color: color.blue })),
      plot1: bars.map((b, i) => ({ time: b.time, value: target[i], color: color.red })),
    },
    bgColors,
    // alertcondition(conditionAbove, ...) / alertcondition(conditionBelow, ...)
    alerts: alertStates(alertConditions, bars, [aboveFlags, belowFlags]),
  };
}

export const MechartMovingAverageAndAboveV11 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
