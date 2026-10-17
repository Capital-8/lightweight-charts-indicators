/**
 * Heikin Ashi Doji with High Volume
 *
 * Heikin Ashi candle from the chart bars: haClose = (open + high + low + close) / 4, haOpen = average of the previous
 * haOpen and haClose (first bar: (open + close) / 2), haHigh / haLow include the real high / low. The Heikin Ashi
 * candle is a doji when its body is at most `bodyThresholdPct` % of its range. A grey circle below the bar marks a
 * doji on a bar whose volume is at least `volMultiplier` times its `volLength`-bar simple average. Alert
 * (alertcondition, `alerts` of the result): 'Doji + High Volume', true on the bars of the circle.
 *
 * Reference: "Heikin Ashi Doji with High Volume" by nwfjf6m8
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © nwfjf6m8
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface HeikinAshiDojiHighVolumeInputs {
  /** Maximum Heikin Ashi body in % of the Heikin Ashi range */
  bodyThresholdPct: number;
  /** Length of the volume average */
  volLength: number;
  /** Volume multiplier */
  volMultiplier: number;
}

export const defaultInputs: HeikinAshiDojiHighVolumeInputs = {
  bodyThresholdPct: 10.0,
  volLength: 20,
  volMultiplier: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'bodyThresholdPct', type: 'float', title: 'Max Body % of Candle Range', defval: 10.0, min: 0, step: 0.1 },
  { id: 'volLength', type: 'int', title: 'Volume MA Length', defval: 20, min: 1 },
  { id: 'volMultiplier', type: 'float', title: 'Volume Multiplier', defval: 1.5, min: 0.1, step: 0.1 },
];

// No plot(): the only output is a plotshape marker
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Heikin Ashi Doji with High Volume',
  shortTitle: 'Heikin Ashi Doji with High Volume',
  overlay: true,
};

/** Pine float comparisons: a <= b unless a - b > 1e-10, a != b when |a - b| > 1e-10 (na compares false) */
const EPS = 1e-10;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<HeikinAshiDojiHighVolumeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { bodyThresholdPct, volLength, volMultiplier } = { ...defaultInputs, ...inputs };
  const volume = bars.map((b) => b.volume ?? NaN);
  const volMA = ta.sma(Series.fromArray(bars, volume), volLength).toArray().map((v) => v ?? NaN);
  const gray = color.gray;

  const markers: MarkerData[] = [];
  const signalFlags: boolean[] = [];
  let haOpenPrev = NaN; // var float haOpen = na
  let haClosePrev = NaN;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = isNaN(haOpenPrev) ? (b.open + b.close) / 2 : (haOpenPrev + haClosePrev) / 2;
    const haHigh = Math.max(b.high, Math.max(haOpen, haClose));
    const haLow = Math.min(b.low, Math.min(haOpen, haClose));
    haOpenPrev = haOpen;
    haClosePrev = haClose;

    const haBodySize = Math.abs(haClose - haOpen);
    const haRange = haHigh - haLow;
    const bodyPct = ne(haRange, 0) ? (haBodySize / haRange) * 100 : 0;
    const isDoji = le(bodyPct, bodyThresholdPct);
    const highVol = ge(volume[i], volMA[i] * volMultiplier);
    signalFlags.push(isDoji && highVol);

    // plotshape(signal, title = "Signal", style = shape.circle, color = color.gray, size = size.tiny,
    //           location = location.belowbar)
    if (isDoji && highVol) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'circle', color: gray, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(signal, title = "Doji + High Volume")
    alerts: alertStates(alertConditions, bars, [signalFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Doji + High Volume', message: 'Heikin Ashi Doji with High Volume detected' },
];

export const HeikinAshiDojiHighVolume = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
