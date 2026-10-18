/**
 * Biggest Volume
 *
 * Volume histogram. A bar whose volume equals the highest volume of the last `accuracy` bars is cyan, the other
 * bars are grey.
 * Alert (alertcondition, `alerts` of the result): 'Big Volume', true on those bars when "Enable Alert" is on.
 *
 * Reference: "Biggest Volume" by mikhail_marka
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © mikhail_marka
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface BiggestVolumeInputs {
  /** Lookback length of the highest volume */
  accuracy: number;
  /** Enable the "Big Volume" alert (alerts only, no drawn output) */
  alertSwitch: boolean;
}

export const defaultInputs: BiggestVolumeInputs = {
  accuracy: 14,
  alertSwitch: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'accuracy', type: 'int', title: 'Accuracy', defval: 14 },
  { id: 'alertSwitch', type: 'bool', title: 'Enable Alert', defval: true },
];

const BL = '#00bcd4';
const WT = '#b2b5be';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Volume', color: WT, lineWidth: 3, style: 'histogram' },
];

export const metadata = {
  title: 'Volume',
  shortTitle: 'Volume',
  overlay: false,
};

/** Pine float comparisons: a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Big Volume', message: 'Big Volume' },
];

export function calculate(
  bars: Bar[],
  inputs: Partial<BiggestVolumeInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const volume = bars.map((b) => b.volume ?? NaN);
  const hi = ta.highest(Series.fromArray(bars, volume), cfg.accuracy).toArray().map((v) => v ?? NaN);

  // plot(volume, color = volume == Hi ? Bl : Wt, linewidth = 3, style = plot.style_histogram)
  const plot0 = bars.map((b, i) => ({ time: b.time, value: volume[i], color: eq(volume[i], hi[i]) ? BL : WT }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    // alertcondition(AlrtSwitch and isVolBig, "Big Volume")
    alerts: alertStates(alertConditions, bars, [volume.map((v, i) => cfg.alertSwitch && eq(v, hi[i]))]),
  };
}

export const BiggestVolume = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
