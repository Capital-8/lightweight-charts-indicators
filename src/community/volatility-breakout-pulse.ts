/**
 * Volatility Breakout Pulse (VBP FIX)
 *
 * Resistance = highest high and support = lowest low of the last `len` bars. A close above the previous resistance
 * (below the previous support) is a breakout up (down) and colours the background green (red). A breakout is a BUY
 * (SELL) signal when the resistance - support range is larger than ATR(14) * multiplier.
 *
 * Reference: "Volatility Breakout Pulse (VBP FIX)" by JohnsonForexTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © JohnsonForexTrader
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolatilityBreakoutPulseInputs {
  /** Lookback period of the highest high / lowest low */
  len: number;
  /** Multiplier of ATR(14) */
  mult: number;
  /** Background colour on the breakout bars */
  showZones: boolean;
}

export const defaultInputs: VolatilityBreakoutPulseInputs = {
  len: 20,
  mult: 1.5,
  showZones: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Lookback Period', defval: 20 },
  { id: 'mult', type: 'float', title: 'Volatility Multiplier', defval: 1.5 },
  { id: 'showZones', type: 'bool', title: 'Show Zones', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Resistance', color: color.red, lineWidth: 1 },
  { id: 'plot1', title: 'Support', color: color.green, lineWidth: 1 },
];

export const metadata = {
  title: 'Volatility Breakout Pulse (VBP FIX)',
  shortTitle: 'Volatility Breakout Pulse (VBP FIX)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Pine default plotshape text colour */
const TEXT_COLOR = '#2962FF';

export function calculate(
  bars: Bar[],
  inputs: Partial<VolatilityBreakoutPulseInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const high = Series.fromArray(bars, bars.map((b) => b.high));
  const low = Series.fromArray(bars, bars.map((b) => b.low));
  const highestHigh = A(ta.highest(high, cfg.len));
  const lowestLow = A(ta.lowest(low, cfg.len));
  const atrVal = A(ta.atr(bars, 14));

  const bgUp = String(color.new(color.green, 85));
  const bgDn = String(color.new(color.red, 85));
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  bars.forEach((b, i) => {
    const priceRange = highestHigh[i] - lowestLow[i];
    const volatility = atrVal[i] * cfg.mult;
    const breakUp = i > 0 && gt(b.close, highestHigh[i - 1]);
    const breakDn = i > 0 && lt(b.close, lowestLow[i - 1]);
    const buySignal = breakUp && gt(priceRange, volatility);
    const sellSignal = breakDn && gt(priceRange, volatility);
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);

    if (cfg.showZones && breakUp) bgColors.push({ time: b.time, color: bgUp });
    else if (cfg.showZones && breakDn) bgColors.push({ time: b.time, color: bgDn });

    if (buySignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.lime, text: 'BUY',
        textColor: TEXT_COLOR });
    }
    if (sellSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: TEXT_COLOR });
    }
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: highestHigh[i], color: color.red })),
      plot1: bars.map((b, i) => ({ time: b.time, value: lowestLow[i], color: color.green })),
    },
    markers,
    bgColors,
    // alertcondition(buySignal, "BUY ALERT") / alertcondition(sellSignal, "SELL ALERT")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY ALERT', message: 'VBP FIX BUY Signal' },
  { id: 'alert1', title: 'SELL ALERT', message: 'VBP FIX SELL Signal' },
];

export const VolatilityBreakoutPulse = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
