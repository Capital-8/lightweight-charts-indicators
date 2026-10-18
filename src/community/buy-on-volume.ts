/**
 * Buy on Volume
 *
 * A DEMA of the close (2 * EMA - EMA of the EMA) and a "Lorentzian line" that is an SMA of the close over
 * max(1, int(0.8 * lorentzianLength)) bars (stepline). A BUY label below the bar when the DEMA crosses above the
 * line on a bar whose volume is above 1.3 times its SMA over `volumeLookback` bars.
 * Alert (alertcondition, `alerts` of the result): 'Buy Signal', true on the bars of a BUY label.
 *
 * Reference: "Buy Signal with DEMA and Volume Confirmation" by Mando4_27
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0', title: 'Buy Signal',
    message: 'Buy Signal! DEMA crossed above Lorentzian Line, and volume is 50% higher than average.',
  },
];

export interface BuyOnVolumeInputs {
  /** DEMA period */
  demaPeriod: number;
  /** Volume lookback period (SMA of the volume) */
  volumeLookback: number;
  /** Lorentzian length (the SMA uses 80 % of it) */
  lorentzianLength: number;
}

export const defaultInputs: BuyOnVolumeInputs = {
  demaPeriod: 6,
  volumeLookback: 20,
  lorentzianLength: 21,
};

export const inputConfig: InputConfig[] = [
  { id: 'demaPeriod', type: 'int', title: 'DEMA Period', defval: 6 },
  { id: 'volumeLookback', type: 'int', title: 'Volume Lookback Period', defval: 20 },
  { id: 'lorentzianLength', type: 'int', title: 'Lorentzian Length', defval: 21, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Lorentzian Line', color: String(color.new(color.aqua, 45)), lineWidth: 2, style: 'stepline' },
  { id: 'plot1', title: 'DEMA', color: color.blue, lineWidth: 2 },
];

export const metadata = {
  title: 'Buy Signal with DEMA and Volume Confirmation',
  shortTitle: 'Buy Signal with DEMA and Volume Confirmation',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<BuyOnVolumeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // fastDEMA = 2 * ema1 - ema2
  const ema1 = A(ta.ema(S(bars.map((b) => b.close)), cfg.demaPeriod));
  const ema2 = A(ta.ema(S(ema1), cfg.demaPeriod));
  const dema = ema1.map((e, i) => 2 * e - ema2[i]);
  // lorentzianLine = ta.sma(close, math.max(1, int(lorentzianLength * 0.8)))
  const sensitiveLength = Math.max(1, Math.trunc(cfg.lorentzianLength * 0.8));
  const line = A(ta.sma(S(bars.map((b) => b.close)), sensitiveLength));
  // averageVolume = ta.sma(volume, volumeLookback); volumeConfirmation = volume > averageVolume * 1.3
  const avgVol = A(ta.sma(S(bars.map((b) => b.volume ?? NaN)), cfg.volumeLookback));
  // demaCrossUp = ta.crossover(fastDEMA, lorentzianLine) (exact comparison)
  const crossUp = A(ta.crossover(S(dema), S(line)));

  const markers: MarkerData[] = [];
  const signalColor = String(color.new(color.green, 75));
  const buyFlags: boolean[] = [];
  bars.forEach((b, i) => {
    const buySignal = Boolean(crossUp[i]) && gt(b.volume ?? NaN, avgVol[i] * 1.3);
    buyFlags.push(buySignal);
    // plotshape(buySignal, "Buy Signal", location.belowbar, color.new(color.green, 75), shape.labelup, "BUY", size.small)
    if (buySignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: signalColor, text: 'BUY',
        textColor: color.blue, size: 'small' });
    }
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: line[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: dema[i] })),
    },
    markers,
    // alertcondition(buySignal, title="Buy Signal")
    alerts: alertStates(alertConditions, bars, [buyFlags]),
  };
}

export const BuyOnVolume = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
