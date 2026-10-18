/**
 * AI Volume Signals
 *
 * A volume spike is a volume above `volumeMultiplier` times its EMA. A spike on a bullish candle (close > open) with
 * the close above the 50 EMA gives a BUY label below the bar; a spike on a bearish candle with the close below the
 * 50 EMA gives a SELL label above the bar. The volume EMA can be drawn.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' and 'Sell Alert', true on the bars of each signal.
 *
 * Reference: "AI Volume Signals" by szymonsobkowiak
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AiVolumeSignalsInputs {
  /** Volume EMA length */
  volumeEmaLength: number;
  /** Multiplier of the volume EMA for the spike detection */
  volumeMultiplier: number;
  /** Draw the volume EMA */
  showVolumeEMA: boolean;
}

export const defaultInputs: AiVolumeSignalsInputs = {
  volumeEmaLength: 20,
  volumeMultiplier: 2.0,
  showVolumeEMA: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'volumeEmaLength', type: 'int', title: 'Volume EMA Length', defval: 20 },
  { id: 'volumeMultiplier', type: 'float', title: 'Multiplier (for spike detection)', defval: 2.0 },
  { id: 'showVolumeEMA', type: 'bool', title: 'Show Volume EMA', defval: false, tooltip: 'Check to show the Volume EMA on the chart' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Volume EMA', color: color.orange, lineWidth: 1 },
];

export const metadata = {
  title: 'AI Volume Signals',
  shortTitle: 'AI Volume Signals',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AiVolumeSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const volumeEMA = A(ta.ema(new Series(bars, (b) => b.volume ?? NaN), cfg.volumeEmaLength));
  const priceMA = A(ta.ema(new Series(bars, (b) => b.close), 50));

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  bars.forEach((b, i) => {
    const volumeSpike = gt(b.volume ?? NaN, volumeEMA[i] * cfg.volumeMultiplier);
    const trendUp = gt(b.close, priceMA[i]);
    const trendDown = lt(b.close, priceMA[i]);
    // plotshape(buySignal, "Buy Signal", location.belowbar, color.green, shape.labelup, text = "BUY")
    const buySignal = volumeSpike && trendUp && gt(b.close, b.open);
    const sellSignal = volumeSpike && trendDown && lt(b.close, b.open);
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    if (buySignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY', textColor: color.blue });
    }
    // plotshape(sellSignal, "Sell Signal", location.abovebar, color.red, shape.labeldown, text = "SELL")
    if (sellSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL', textColor: color.blue });
    }
  });

  const plot0 = bars.map((b, i) => ({ time: b.time, value: cfg.showVolumeEMA ? volumeEMA[i] : NaN }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    // alertcondition(buySignal, "Buy Alert") / alertcondition(sellSignal, "Sell Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'AI Volume Signal: BUY' },
  { id: 'alert1', title: 'Sell Alert', message: 'AI Volume Signal: SELL' },
];

export const AiVolumeSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
