/**
 * Clean Buy Sell Pro
 *
 * Trend from a fast and a slow EMA of the close. A buy condition is a bull trend (fast EMA > slow EMA) with the close
 * above the fast EMA; a sell condition is a bear trend with the close below the fast EMA. With the RSI confirmation,
 * the RSI must also be above 50 (buy) or below 50 (sell). A BUY / SELL label marks the first bar of each condition.
 * Alerts (alertcondition, `alerts` of the result): 'BUY Signal' and 'SELL Signal', true on the first bar of each
 * condition (with the labels hidden too).
 *
 * Reference: "Clean Buy Sell Pro [v6]" by JohnsonForexTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CleanBuySellProInputs {
  /** Fast EMA length */
  fastLength: number;
  /** Slow EMA length */
  slowLength: number;
  /** Use the RSI confirmation */
  useRSI: boolean;
  /** RSI length */
  rsiLength: number;
  /** Show the BUY / SELL labels */
  showLabels: boolean;
}

export const defaultInputs: CleanBuySellProInputs = {
  fastLength: 20,
  slowLength: 50,
  useRSI: true,
  rsiLength: 14,
  showLabels: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast EMA', defval: 20, min: 2, group: 'Trend Settings' },
  { id: 'slowLength', type: 'int', title: 'Slow EMA', defval: 50, min: 5, group: 'Trend Settings' },
  { id: 'useRSI', type: 'bool', title: 'Use RSI Confirmation', defval: true, group: 'Signal Settings' },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 2, group: 'Signal Settings' },
  { id: 'showLabels', type: 'bool', title: 'Show BUY / SELL', defval: true, group: 'Signal Settings' },
];

// No plot(): the outputs are plotshape labels
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Clean Buy Sell Pro [v6]',
  shortTitle: 'CBSP v6',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<CleanBuySellProInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const fastEMA = A(ta.ema(close, cfg.fastLength));
  const slowEMA = A(ta.ema(close, cfg.slowLength));
  const rsiValue = A(ta.rsi(close, cfg.rsiLength));

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  let buyPrev = false;
  let sellPrev = false;
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i].close;
    const bullTrend = gt(fastEMA[i], slowEMA[i]);
    const bearTrend = lt(fastEMA[i], slowEMA[i]);
    const bullMomentum = gt(rsiValue[i], 50);
    const bearMomentum = lt(rsiValue[i], 50);

    let buyCondition = bullTrend && gt(c, fastEMA[i]);
    let sellCondition = bearTrend && lt(c, fastEMA[i]);
    if (cfg.useRSI) {
      buyCondition = buyCondition && bullMomentum;
      sellCondition = sellCondition && bearMomentum;
    }

    // buySignal = buyCondition and not buyCondition[1] (a bool history before bar 0 is false)
    const buySignal = buyCondition && !buyPrev;
    const sellSignal = sellCondition && !sellPrev;
    buyPrev = buyCondition;
    sellPrev = sellCondition;
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);

    // plotshape(showLabels and buySignal, "BUY", shape.labelup, location.belowbar, color.lime, text = "BUY",
    //   textcolor = color.black, size = size.tiny)
    if (cfg.showLabels && buySignal) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: color.lime, text: 'BUY',
        textColor: color.black, size: 'tiny' });
    }
    // plotshape(showLabels and sellSignal, "SELL", shape.labeldown, location.abovebar, color.red, text = "SELL",
    //   textcolor = color.white, size = size.tiny)
    if (cfg.showLabels && sellSignal) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.white, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(buySignal, "BUY Signal") / alertcondition(sellSignal, "SELL Signal")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY Signal', message: 'Clean Buy Sell Pro: BUY signal detected.' },
  { id: 'alert1', title: 'SELL Signal', message: 'Clean Buy Sell Pro: SELL signal detected.' },
];

export const CleanBuySellPro = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
