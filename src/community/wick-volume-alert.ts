/**
 * Wick Volume Alert
 *
 * Marks bars with a long wick: the upper (or lower) wick divided by the body is at least a ratio. With the volume
 * filter, the volume must also be at least a multiple of the previous volume. Optional price limits: only below a
 * lower limit and / or only above an upper limit (when both are on, the upper limit test replaces the lower one, as
 * in the Pine script). A body of 0 gives an infinite ratio (a wick > 0 counts as long) or na (no wick).
 *
 * Last bar: a wick label needs a closed bar. The port reads the state of the last bar from the optional third
 * argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): the alert message input on every closed bar
 * with a long upper or lower wick, high volume and the price within the limits.
 *
 * Reference: "Wick Volume Alert" by Shazam77
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Shazam77
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface WickVolumeAlertInputs {
  wickToBodyRatio: number;
  useVolumeFilter: boolean;
  volumeMultiplier: number;
  /** Message of the alert() calls (`alertCalls`) */
  alertMessage: string;
  useUpperPriceLimit: boolean;
  upperPriceLimit: number;
  useLowerPriceLimit: boolean;
  lowerPriceLimit: number;
}

export const defaultInputs: WickVolumeAlertInputs = {
  wickToBodyRatio: 1.8,
  useVolumeFilter: true,
  volumeMultiplier: 1.3,
  alertMessage: 'Long wick detected!',
  useUpperPriceLimit: false,
  upperPriceLimit: 200.0,
  useLowerPriceLimit: false,
  lowerPriceLimit: 100.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'wickToBodyRatio', type: 'float', title: 'Wick to body ratio', defval: 1.8, min: 0 },
  { id: 'useVolumeFilter', type: 'bool', title: 'Use volume filter', defval: true },
  { id: 'volumeMultiplier', type: 'float', title: 'Volume multiplier', defval: 1.3, min: 0 },
  { id: 'alertMessage', type: 'string', title: 'Alert message', defval: 'Long wick detected!' },
  { id: 'useUpperPriceLimit', type: 'bool', title: 'Only trigger alert above a certain price', defval: false },
  { id: 'upperPriceLimit', type: 'float', title: 'Upper price limit', defval: 200.0 },
  { id: 'useLowerPriceLimit', type: 'bool', title: 'Only trigger alert below a certain price', defval: false },
  { id: 'lowerPriceLimit', type: 'float', title: 'Lower price limit', defval: 100.0 },
];

// No plot(): plotshape markers only
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Wick Volume Alert',
  shortTitle: 'Wick Volume Alert',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false); +-infinity is compared */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<WickVolumeAlertInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const upperColor = String(color.new(color.red, 0));
  const lowerColor = String(color.new(color.green, 0));

  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  bars.forEach((b, i) => {
    const bodySize = Math.abs(b.close - b.open);
    const upperWick = b.high - Math.max(b.open, b.close);
    const lowerWick = Math.min(b.open, b.close) - b.low;

    // Plain division: x / 0 is +-infinity, 0 / 0 is na
    const longUpperWick = ge(upperWick / bodySize, cfg.wickToBodyRatio);
    const longLowerWick = ge(lowerWick / bodySize, cfg.wickToBodyRatio);

    const volume = b.volume ?? NaN;
    const volume1 = i > 0 ? (bars[i - 1].volume ?? NaN) : NaN;
    const highVolume = cfg.useVolumeFilter ? ge(volume, volume1 * cfg.volumeMultiplier) : true;

    let priceWithinLimits = true;
    if (cfg.useLowerPriceLimit) priceWithinLimits = lt(b.close, cfg.lowerPriceLimit);
    if (cfg.useUpperPriceLimit) priceWithinLimits = gt(b.close, cfg.upperPriceLimit);

    const isConfirmed = barIsConfirmed(i); // barstate.isconfirmed
    if (longUpperWick && highVolume && isConfirmed && priceWithinLimits) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'labelDown', color: upperColor, size: 'small' });
    }
    if (longLowerWick && highVolume && isConfirmed && priceWithinLimits) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: lowerColor, size: 'small' });
    }
    // alert(alert_message, alert.freq_once_per_bar_close)
    if (isConfirmed && highVolume && priceWithinLimits && (longUpperWick || longLowerWick)) {
      alertCalls.push({ time: b.time, message: cfg.alertMessage, freq: 'once_per_bar_close' });
    }
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    alertCalls,
  };
}

export const WickVolumeAlert = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
