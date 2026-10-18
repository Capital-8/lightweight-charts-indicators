/**
 * Pure UT Bot - Signals Only
 *
 * UT Bot trailing stop: nLoss = key value * ATR. While the close stays above the stop (this bar and the previous
 * bar) the stop rises to max(stop, close - nLoss); while it stays below, the stop falls to min(stop, close + nLoss);
 * on a flip the stop restarts at close - nLoss or close + nLoss. The stop is not drawn: BUY / SELL labels mark the
 * bars where the close crosses above / below it.
 * Alerts (alertcondition, `alerts` of the result): 'UT Buy Signal' / 'UT Sell Signal' on the bars of the BUY / SELL
 * labels.
 *
 * Reference: "Pure UT Bot - Signals Only" by BhargavMeghnathi
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface UtBotTrendVolumeInputs {
  /** Sensitivity (ATR multiplier) */
  keyValue: number;
  /** ATR period */
  atrPeriod: number;
}

export const defaultInputs: UtBotTrendVolumeInputs = {
  keyValue: 1.0,
  atrPeriod: 10,
};

export const inputConfig: InputConfig[] = [
  { id: 'keyValue', type: 'float', title: 'Sensitivity (Lower = More Signals)', defval: 1.0 },
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 10 },
];

// No plot(): the outputs are plotshape labels
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Pure UT Bot - Signals Only',
  shortTitle: 'Pure UT Bot - Signals Only',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** Pine nz(x, 0) */
const nz = (x: number) => (Number.isFinite(x) ? x : 0);
/** Pine math.max / math.min: na when an argument is na */
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));

export function calculate(
  bars: Bar[],
  inputs: Partial<UtBotTrendVolumeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const xATR = ta.atr(bars, cfg.atrPeriod).toArray().map((v) => v ?? NaN);

  // var float trailingStop = 0.0; trailingStop[1] before bar 0 is na (nz gives 0)
  const trailingStop: number[] = new Array(n);
  let prevStop = NaN;
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const c1 = i > 0 ? bars[i - 1].close : NaN;
    const nLoss = cfg.keyValue * xATR[i];
    const p = nz(prevStop);
    let ts: number;
    if (gt(c, p) && gt(c1, p)) ts = max(p, c - nLoss);
    else if (lt(c, p) && lt(c1, p)) ts = min(p, c + nLoss);
    else ts = gt(c, p) ? c - nLoss : c + nLoss;
    trailingStop[i] = ts;
    prevStop = ts;
  }

  // ta.crossover / ta.crossunder(close, trailingStop): exact comparisons (library functions)
  const S = (a: number[]) => Series.fromArray(bars, a);
  const closeS = S(bars.map((b) => b.close));
  const stopS = S(trailingStop);
  const buySignal = ta.crossover(closeS, stopS).toArray().map((v) => !!v);
  const sellSignal = ta.crossunder(closeS, stopS).toArray().map((v) => !!v);

  const buyCol = String(color.new('#26a69a', 0));
  const sellCol = String(color.new('#ef5350', 0));
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    // plotshape(buySignal, "BUY", shape.labelup, location.belowbar, text = "BUY", textcolor = color.white, size.small)
    if (buySignal[i]) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: buyCol, text: 'BUY',
        textColor: color.white, size: 'small' });
    }
    // plotshape(sellSignal, "SELL", shape.labeldown, location.abovebar, text = "SELL", textcolor = color.white, size.small)
    if (sellSignal[i]) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: sellCol, text: 'SELL',
        textColor: color.white, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(buySignal, "UT Buy Signal") / alertcondition(sellSignal, "UT Sell Signal")
    alerts: alertStates(alertConditions, bars, [buySignal, sellSignal]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'UT Buy Signal', message: 'UT Bot BUY' },
  { id: 'alert1', title: 'UT Sell Signal', message: 'UT Bot SELL' },
];

export const UtBotTrendVolume = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
