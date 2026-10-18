/**
 * Fastlane
 *
 * Marks the bars with a large move (|1-bar rate of change of the close| >= a percentage) and / or a large volume
 * (volume >= a threshold). Combined mode (default): a yellow circle below the bars where both are true. Separate
 * mode: a blue circle below the bars with a large move and a blue cross above the bars with a large volume.
 * Alert (alertcondition, `alerts` of the result): 'Fastlane', true on the bars of the yellow circles (combined mode).
 *
 * Reference: "Fastlane" by HB5
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © HB5
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FastlaneInputs {
  /** Combine the conditions (move and volume) */
  use: boolean;
  /** Volume threshold */
  vol: number;
  /** Minimum |rate of change| of the close, in % */
  per: number;
}

export const defaultInputs: FastlaneInputs = {
  use: true,
  vol: 500000,
  per: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'use', type: 'bool', title: 'Combine the conditions?', defval: true },
  { id: 'vol', type: 'int', title: 'Volume Above', defval: 500000 },
  { id: 'per', type: 'int', title: '% check', defval: 5 },
];

// No plot(): the outputs are plotshape markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Fastlane',
  shortTitle: 'Fastlane',
  overlay: true,
};

/** Pine default colour of a plotshape without a colour */
const PINE_BLUE = '#2962FF';

/** Pine float comparison: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<FastlaneInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const roc1 = ta.roc(new Series(bars, (b) => b.close), 1).toArray();
  const yellow = String(color.new(color.yellow, 0));
  const markers: MarkerData[] = [];
  const fastlane: boolean[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const roc = ge(Math.abs(roc1[i]), cfg.per);
    const check = ge(b.volume ?? NaN, cfg.vol);
    // alertcondition(use ? roc and check : false)
    fastlane.push(cfg.use && roc && check);
    if (!cfg.use) {
      // plotshape(not use ? roc : false, style = shape.circle, location = location.belowbar)
      if (roc) markers.push({ time: b.time, position: 'belowBar', shape: 'circle', color: PINE_BLUE, id: 'shape0' });
      // plotshape(not use ? check : false): Pine defaults, shape.xcross above the bar
      if (check) markers.push({ time: b.time, position: 'aboveBar', shape: 'xcross', color: PINE_BLUE, id: 'shape1' });
    } else if (roc && check) {
      // plotshape(use ? roc and check : false, style = shape.circle, color = color.new(color.yellow, 0),
      //           location = location.belowbar)
      markers.push({ time: b.time, position: 'belowBar', shape: 'circle', color: yellow, id: 'shape2' });
    }
  }
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    alerts: alertStates(alertConditions, bars, [fastlane]),
  };
}

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Fastlane', message: 'Fastlane' },
];

export const Fastlane = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
