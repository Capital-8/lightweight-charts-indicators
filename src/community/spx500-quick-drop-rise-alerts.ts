/**
 * SPX500 Quick Drop & Rise Alerts
 *
 * The percent change of the close over a number of bars, 100 * (close - close[lookback]) / close[lookback]. A change
 * at or below -threshold draws a red circle at the top of the chart (quick drop), a change at or above +threshold a
 * green circle at the bottom (quick rise).
 * Alerts (alertcondition, `alerts` of the result): 'Quick Price Drop' and 'Quick Price Rise', true on the bars of the
 * circles.
 *
 * Reference: "SPX500 Quick Drop & Rise Alerts" by PaperChains
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface Spx500QuickDropRiseAlertsInputs {
  /** Drop Threshold (%) */
  dropThreshold: number;
  /** Lookback Bars */
  lookbackBars: number;
}

export const defaultInputs: Spx500QuickDropRiseAlertsInputs = {
  dropThreshold: 0.05,
  lookbackBars: 1,
};

export const inputConfig: InputConfig[] = [
  { id: 'dropThreshold', type: 'float', title: 'Drop Threshold (%)', defval: 0.05, min: 0.001, step: 0.001 },
  { id: 'lookbackBars', type: 'int', title: 'Lookback Bars', defval: 1, min: 1 },
];

// No plot(): the outputs are plotshape circles
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'SPX500 Quick Drop & Rise Alerts',
  shortTitle: 'SPX500 Quick Drop & Rise Alerts',
  overlay: true,
};

/** Pine float comparisons: a == b within 1e-10; na compares false */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<Spx500QuickDropRiseAlertsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const markers: MarkerData[] = [];
  const dropFlags: boolean[] = [];
  const riseFlags: boolean[] = [];
  bars.forEach((b, i) => {
    const pastPrice = i - cfg.lookbackBars >= 0 ? bars[i - cfg.lookbackBars].close : NaN;
    // a non-zero x / 0 is +-infinity in Pine, compared as it is by >= / <=
    const changePct = (100 * (b.close - pastPrice)) / pastPrice;

    const dropCondition = le(changePct, -cfg.dropThreshold);
    const riseCondition = ge(changePct, cfg.dropThreshold);
    dropFlags.push(dropCondition);
    riseFlags.push(riseCondition);

    // plotshape(dropCondition, "Quick Drop", location.top, color.red, shape.circle, size.tiny)
    if (dropCondition) {
      markers.push({ time: b.time, position: 'top', shape: 'circle', color: color.red, size: 'tiny' });
    }
    // plotshape(riseCondition, "Quick Rise", location.bottom, color.green, shape.circle, size.tiny)
    if (riseCondition) {
      markers.push({ time: b.time, position: 'bottom', shape: 'circle', color: color.green, size: 'tiny' });
    }
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(dropCondition, "Quick Price Drop") / alertcondition(riseCondition, "Quick Price Rise")
    alerts: alertStates(alertConditions, bars, [dropFlags, riseFlags]),
  };
}

/** The original's alertconditions (the {{...}} placeholders are kept as the original writes them) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Quick Price Drop', message: 'SPX500 dropped more than {{dropThreshold}}% in {{lookbackBars}} bars!' },
  { id: 'alert1', title: 'Quick Price Rise', message: 'SPX500 rose more than {{dropThreshold}}% in {{lookbackBars}} bars!' },
];

export const Spx500QuickDropRiseAlerts = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
