/**
 * Candle BUY SELL + Support Resistance [v6]
 *
 * Support is the last pivot low and resistance the last pivot high (pivot length bars on each side), drawn as
 * step lines. BUY labels below the bar on a bullish engulfing candle or a hammer (lower wick at least 2 bodies,
 * upper wick at most 1 body); SELL labels above the bar on a bearish engulfing candle or a shooting star (upper
 * wick at least 2 bodies, lower wick at most 1 body).
 * Alerts (alertcondition, `alerts` of the result): 'Candle BUY' and 'Candle SELL', true on the bars of each signal
 * (also when the labels are hidden).
 *
 * Reference: "Candle BUY SELL + Support Resistance [v6]" by JohnsonForexTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © JohnsonForexTrader
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CandleBuySellSupportResistanceInputs {
  /** Pivot length (left and right bars) */
  pivotLength: number;
  showSupport: boolean;
  showResistance: boolean;
  /** Show the BUY / SELL labels */
  showSignals: boolean;
}

export const defaultInputs: CandleBuySellSupportResistanceInputs = {
  pivotLength: 5,
  showSupport: true,
  showResistance: true,
  showSignals: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'pivotLength', type: 'int', title: 'Pivot Length', defval: 5, min: 2, group: 'Support & Resistance' },
  { id: 'showSupport', type: 'bool', title: 'Show Support', defval: true, group: 'Support & Resistance' },
  { id: 'showResistance', type: 'bool', title: 'Show Resistance', defval: true, group: 'Support & Resistance' },
  { id: 'showSignals', type: 'bool', title: 'Show BUY / SELL', defval: true, group: 'Candle Signals' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Support', color: color.green, lineWidth: 2, style: 'stepline' },
  { id: 'plot1', title: 'Resistance', color: color.red, lineWidth: 2, style: 'stepline' },
];

export const metadata = {
  title: 'Candle BUY SELL + Support Resistance [v6]',
  shortTitle: 'Candle S/R',
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
  inputs: Partial<CandleBuySellSupportResistanceInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const len = cfg.pivotLength;

  const pivotLow = A(ta.pivotlow(S(bars.map((b) => b.low)), len, len));
  const pivotHigh = A(ta.pivothigh(S(bars.map((b) => b.high)), len, len));

  const bullish = bars.map((b) => gt(b.close, b.open));
  const bearish = bars.map((b) => lt(b.close, b.open));

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  let support = NaN; // var float support = na
  let resistance = NaN; // var float resistance = na
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const body = Math.abs(b.close - b.open);
    const candleRange = b.high - b.low;
    const upperWick = b.high - Math.max(b.open, b.close);
    const lowerWick = Math.min(b.open, b.close) - b.low;
    const p = i > 0 ? bars[i - 1] : null;

    // bearish[1] / bullish[1] are na (false) on bar 0
    const bullishEngulfing = bullish[i] && i > 0 && bearish[i - 1] && le(b.open, p!.close) && ge(b.close, p!.open);
    const bearishEngulfing = bearish[i] && i > 0 && bullish[i - 1] && ge(b.open, p!.close) && le(b.close, p!.open);
    const hammer = gt(candleRange, 0) && ge(lowerWick, body * 2) && le(upperWick, body);
    const shootingStar = gt(candleRange, 0) && ge(upperWick, body * 2) && le(lowerWick, body);

    if (!isNaN(pivotLow[i])) support = pivotLow[i];
    if (!isNaN(pivotHigh[i])) resistance = pivotHigh[i];

    const buySignal = bullishEngulfing || hammer;
    const sellSignal = bearishEngulfing || shootingStar;
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);

    plot0.push({ time: b.time, value: cfg.showSupport ? support : NaN, color: color.green });
    plot1.push({ time: b.time, value: cfg.showResistance ? resistance : NaN, color: color.red });

    // plotshape(showSignals and buySignal, "BUY", shape.labelup, location.belowbar, color.lime, text "BUY",
    //   textcolor color.black, size.tiny)
    if (cfg.showSignals && buySignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.lime, text: 'BUY',
        textColor: color.black, size: 'tiny' });
    }
    // plotshape(showSignals and sellSignal, "SELL", shape.labeldown, location.abovebar, color.red, text "SELL",
    //   textcolor color.white, size.tiny)
    if (cfg.showSignals && sellSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.white, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    // alertcondition(buySignal, "Candle BUY") / alertcondition(sellSignal, "Candle SELL")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Candle BUY', message: 'Candle BUY signal detected.' },
  { id: 'alert1', title: 'Candle SELL', message: 'Candle SELL signal detected.' },
];

export const CandleBuySellSupportResistance = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
