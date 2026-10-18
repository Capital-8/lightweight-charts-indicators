/**
 * Dynamic Trend Channel (DTC)
 *
 * The trend line is the EMA of the close over `length` bars. The channel bands are the EMA +- ATR(atrLength) *
 * atrMult, with a blue fill between them. The trend line and the bars are lime when the close is above the EMA,
 * red otherwise. A BUY label marks a close crossing over the upper band, a SELL label a close crossing under the
 * lower band.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' / 'Sell Alert', true on the BUY / SELL bars.
 *
 * Reference: "Dynamic Trend Channel (DTC)" by JohnsonForexTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © JohnsonForexTrader
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DynamicTrendChannelInputs {
  /** EMA length of the trend line */
  length: number;
  /** ATR length */
  atrLength: number;
  /** ATR multiplier of the band width */
  atrMult: number;
}

export const defaultInputs: DynamicTrendChannelInputs = {
  length: 30,
  atrLength: 14,
  atrMult: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Channel Length', defval: 30, min: 10 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 1.5, step: 0.1 },
];

const UPPER_COLOR = String(color.new(color.green, 40));
const LOWER_COLOR = String(color.new(color.red, 40));
const FILL_COLOR = String(color.new(color.blue, 90));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend', color: color.lime, lineWidth: 2 },
  { id: 'plot1', title: 'Upper Band', color: UPPER_COLOR, lineWidth: 1 },
  { id: 'plot2', title: 'Lower Band', color: LOWER_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: 'Dynamic Trend Channel (DTC)',
  shortTitle: 'DTC',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicTrendChannelInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  const basis = A(ta.ema(S(close), cfg.length));
  const atrValue = A(ta.atr(bars, cfg.atrLength));
  const upperBand = basis.map((v, i) => v + atrValue[i] * cfg.atrMult);
  const lowerBand = basis.map((v, i) => v - atrValue[i] * cfg.atrMult);

  // ta.crossover(close, upperBand) / ta.crossunder(close, lowerBand): exact comparisons
  const buySignal = A(ta.crossover(S(close), S(upperBand)));
  const sellSignal = A(ta.crossunder(S(close), S(lowerBand)));

  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const trendUp = gt(close[i], basis[i]);
    const trendColor = trendUp ? color.lime : color.red;
    plot0.push({ time, value: basis[i], color: trendColor });
    plot1.push({ time, value: upperBand[i], color: UPPER_COLOR });
    plot2.push({ time, value: lowerBand[i], color: LOWER_COLOR });
    if (buySignal[i] === 1) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: color.lime, text: 'BUY',
        textColor: color.black, size: 'small' });
    }
    if (sellSignal[i] === 1) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.white, size: 'small' });
    }
    barColors.push({ time, color: trendColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [{ plot1: 'plot1', plot2: 'plot2', options: { color: FILL_COLOR } }],
    markers,
    barColors,
    // alertcondition(buySignal, "Buy Alert") / alertcondition(sellSignal, "Sell Alert")
    alerts: alertStates(alertConditions, bars, [buySignal.map((v) => v === 1), sellSignal.map((v) => v === 1)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'Dynamic Trend Channel Buy' },
  { id: 'alert1', title: 'Sell Alert', message: 'Dynamic Trend Channel Sell' },
];

export const DynamicTrendChannel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
