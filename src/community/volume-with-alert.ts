/**
 * Volume with Alert
 *
 * Volume columns: yellow when the volume is at or above the threshold, else teal on bars with close >= open and red
 * on the other bars. A blue SMA of the volume and a dashed horizontal line at the threshold.
 * Alerts (alertcondition, `alerts` of the result): 'Volume exceeds threshold' on the bars with a yellow column.
 *
 * Reference: "Volume with Alert" by BullBearSR
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolumeWithAlertInputs {
  /** Volume level of the yellow columns and of the alert */
  threshold: number;
  /** SMA length of the volume */
  maLength: number;
}

export const defaultInputs: VolumeWithAlertInputs = {
  threshold: 1000,
  maLength: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'threshold', type: 'float', title: 'Alert when volume is ≥ to', defval: 1000, min: 0 },
  { id: 'maLength', type: 'int', title: 'Volume moving average length (visual only)', defval: 20, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Volume', color: color.teal, lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Volume Moving Average', color: color.blue, lineWidth: 1 },
];

/** hline(threshold) with the default threshold (the result `hlines` carry the input value) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_threshold', price: 1000, title: 'Threshold Line', color: String(color.new(color.orange, 40)), linestyle: 'dashed', linewidth: 1 },
];

export const metadata = {
  title: 'Volume with Alert',
  shortTitle: 'Vol Alert',
  overlay: false,
  format: 'volume',
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeWithAlertInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const vol = bars.map((b) => b.volume ?? NaN);
  const maVol = ta.sma(Series.fromArray(bars, vol), cfg.maLength).toArray().map((v) => v ?? NaN);

  const triggeredFlags: boolean[] = [];
  const plot0 = bars.map((b, i) => {
    const isBullish = ge(b.close, b.open);
    const baseColor = isBullish ? color.teal : color.red;
    // triggered = vol >= threshold (alertcondition "Volume exceeds threshold")
    const triggered = ge(vol[i], cfg.threshold);
    triggeredFlags.push(triggered);
    return { time: b.time, value: vol[i], color: triggered ? color.yellow : baseColor };
  });
  const plot1 = bars.map((b, i) => ({ time: b.time, value: maVol[i] }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [
      { value: cfg.threshold, options: { title: 'Threshold Line', color: String(color.new(color.orange, 40)), linestyle: 'dashed', linewidth: 1 } },
    ],
    alerts: alertStates(alertConditions, bars, [triggeredFlags]),
  };
}

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Volume exceeds threshold', message: 'High volume on {{ticker}} ({{interval}}): exceeds the configured threshold.' },
];

export const VolumeWithAlert = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
