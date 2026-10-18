/**
 * Volume Spike and Contraction Indicator
 *
 * Bands around the simple moving average of the volume: upper = SMA + spike sensitivity * stdev, lower = SMA -
 * contraction sensitivity * stdev (both over the MA length). A volume spike is a crossover of the volume above the
 * upper band; a volume contraction is a crossunder of the volume below the lower band on a closed bar. A spike is
 * marked with '💥' below a bull bar (close > open) or above any other bar; a contraction with '↗' below a bull bar or
 * '⤵' above any other bar.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Volume Spike' on a spike and 'Volume Contraction' on a contraction.
 *
 * Last bar: a volume contraction is marked on a closed bar only. The port reads the state of the last bar from the
 * optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Volume Spike and Contraction Indicator" by epicurusMcPot
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © epicurusMcPot
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolumeSpikeAndContractionInputs {
  /** Length of the volume SMA and stdev */
  maLength: number;
  /** Stdev multiplier of the upper band (spikes) */
  mult: number;
  /** Stdev multiplier of the lower band (contractions) */
  mult2: number;
}

export const defaultInputs: VolumeSpikeAndContractionInputs = {
  maLength: 20,
  mult: 3,
  mult2: 1,
};

export const inputConfig: InputConfig[] = [
  { id: 'maLength', type: 'int', title: 'Volume MA length', defval: 20 },
  { id: 'mult', type: 'float', title: 'Sensitivity of Spikes', defval: 3, min: 0.1, step: 0.1 },
  { id: 'mult2', type: 'float', title: 'Sensitivity of Contractions', defval: 1, min: 0.1, step: 0.1 },
];

// No plot(): the outputs are four plotchar markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Volume Spike and Contraction Indicator',
  shortTitle: 'Volume Spike and Contraction Indicator',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeSpikeAndContractionInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const volume = new Series(bars, (b) => b.volume ?? NaN);
  const volMA = A(ta.sma(volume, cfg.maLength));
  const volDev = A(ta.stdev(volume, cfg.maLength)).map((v) => cfg.mult * v);
  const volDev2 = A(ta.stdev(volume, cfg.maLength)).map((v) => cfg.mult2 * v);
  const upperDevVol1 = volMA.map((v, i) => v + volDev[i]);
  const lowerDevVol1 = volMA.map((v, i) => v - volDev2[i]);

  // ta.crossover / ta.crossunder compare exactly (library functions)
  const volumeSpike = ta.crossover(volume, S(upperDevVol1)).toArray();
  // volumeContraction = ta.crossunder(volume, lowerDevVol1) and barstate.isconfirmed
  const volumeContraction = ta.crossunder(volume, S(lowerDevVol1)).toArray().map((v, i) => !!v && barIsConfirmed(i));

  const yellow = String(color.yellow);
  const aqua = String(color.aqua);
  const markers: MarkerData[] = [];
  // plotchar(..., char, location, color, size = size.small, force_overlay = true): transparent shape, the char as text
  const mark = (id: string, time: number, position: 'aboveBar' | 'belowBar', text: string, textColor: string) =>
    markers.push({ id, time, position, shape: 'circle', color: 'transparent', text, textColor, size: 'small',
      forceOverlay: true });
  const spikeFlags: boolean[] = [];
  const contractionFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const isBullCandle = gt(b.close, b.open);
    const spike = !!volumeSpike[i];
    const contraction = !!volumeContraction[i];
    spikeFlags.push(spike);
    contractionFlags.push(contraction);
    if (spike && isBullCandle) mark('char0', b.time, 'belowBar', '💥', yellow);
    if (spike && !isBullCandle) mark('char1', b.time, 'aboveBar', '💥', yellow);
    if (contraction && isBullCandle) mark('char2', b.time, 'belowBar', '↗', aqua);
    if (contraction && !isBullCandle) mark('char3', b.time, 'aboveBar', '⤵', aqua);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    // alertcondition(volumeSpike, 'Volume Spike') / alertcondition(volumeContraction, 'Volume Contraction')
    alerts: alertStates(alertConditions, bars, [spikeFlags, contractionFlags]),
  };
}

/** The original's alertconditions (no message: the default one) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Volume Spike', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Volume Contraction', message: 'Alert Fired!' },
];

export const VolumeSpikeAndContractionIndicator = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions,
};
