/**
 * Volume Bars Color
 *
 * Volume columns coloured by an SMA / standard deviation band of the volume over `meanPeriod` bars: red when the
 * volume is at or above mean + stdev * devK, yellow when at or below mean - stdev * devK, light grey otherwise.
 * The mean volume line and a filled band at mean +- 1 stdev. Optionally the price candles of the high volume bars
 * are coloured.
 * Alerts (alertcondition, `alerts` of the result): 'High Volume Alert' / 'Low Volume Alert' on the bars whose volume is
 * at or above the high threshold / at or below the low threshold.
 *
 * Reference: "Volume Bars Color" by Evgenyc111
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolumeBarsColorInputs {
  /** SMA / stdev length of the volume */
  meanPeriod: number;
  /** Standard deviation multiplier of the high / low volume thresholds */
  devK: number;
  /** Colour the candles of the high volume bars */
  candles: boolean;
  /** Candle colour of the high volume bars */
  candlesClr: string;
}

export const defaultInputs: VolumeBarsColorInputs = {
  meanPeriod: 30,
  devK: 1.0,
  candles: true,
  candlesClr: '#1320d3',
};

export const inputConfig: InputConfig[] = [
  { id: 'meanPeriod', type: 'int', title: 'Mean period', defval: 30 },
  { id: 'devK', type: 'float', title: 'Std deviation multiplier for volume bands', defval: 1.0 },
  { id: 'candles', type: 'bool', title: 'Colour extreme volume candles?', defval: true },
  { id: 'candlesClr', type: 'color', title: 'High volume candles color', defval: '#1320d3' },
];

const HIGH_VOLUME = color.rgb(207, 9, 9);
const LOW_VOLUME = color.rgb(250, 202, 46);
const AVERAGE_VOLUME = color.rgb(223, 223, 223);
const BAND = String(color.new('#9ad1ff', 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Volume Bars', color: HIGH_VOLUME, lineWidth: 3, style: 'columns' },
  { id: 'plot1', title: 'Mean Volume', color: color.blue, lineWidth: 1 },
  { id: 'plot2', title: 'High Band', color: BAND, lineWidth: 1 },
  { id: 'plot3', title: 'Low Band', color: BAND, lineWidth: 1 },
];

export const metadata = {
  title: 'Volume Bars Color',
  shortTitle: 'Volume Bars Color',
  overlay: false,
  precision: 0,
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeBarsColorInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const volume = bars.map((b) => b.volume ?? NaN);
  const volSeries = Series.fromArray(bars, volume);

  const meanVolume = A(ta.sma(volSeries, cfg.meanPeriod));
  const stdDevVolume = A(ta.stdev(volSeries, cfg.meanPeriod));
  const hiBand = meanVolume.map((m, i) => m + stdDevVolume[i]);
  const lowBand = meanVolume.map((m, i) => m - stdDevVolume[i]);
  const highThreshold = meanVolume.map((m, i) => m + stdDevVolume[i] * cfg.devK);
  const lowThreshold = meanVolume.map((m, i) => m - stdDevVolume[i] * cfg.devK);

  const isHigh = (i: number) => ge(volume[i], highThreshold[i]);
  const isLow = (i: number) => le(volume[i], lowThreshold[i]);
  // volumeColor = volume >= highVolumeThreshold ? high : volume <= lowVolumeThreshold ? low : average
  const volumeColor = (i: number) => (isHigh(i) ? HIGH_VOLUME : isLow(i) ? LOW_VOLUME : AVERAGE_VOLUME);

  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    // barcolor(volume >= highVolumeThreshold and candles ? candlesClr : na)
    if (isHigh(i) && cfg.candles) barColors.push({ time: bars[i].time, color: cfg.candlesClr });
  }

  const bandFill = String(color.new('#9ad1ff', 90));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: metadata.precision },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: volume[i], color: volumeColor(i) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: meanVolume[i], color: color.blue })),
      plot2: bars.map((b, i) => ({ time: b.time, value: hiBand[i], color: BAND })),
      plot3: bars.map((b, i) => ({ time: b.time, value: lowBand[i], color: BAND })),
    },
    // fill(High Band, Low Band, color.new(#9ad1ff, 90), title = 'Band Fill')
    fills: [{ plot1: 'plot2', plot2: 'plot3', options: { title: 'Band Fill', color: bandFill }, colors: new Array<string>(n).fill(bandFill) }],
    barColors,
    // alertcondition(volume >= highVolumeThreshold) / alertcondition(volume <= lowVolumeThreshold)
    alerts: alertStates(alertConditions, bars, [bars.map((_, i) => isHigh(i)), bars.map((_, i) => isLow(i))]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'High Volume Alert', message: 'Anomalous High Volume detected!' },
  { id: 'alert1', title: 'Low Volume Alert', message: 'Anomalous Low Volume detected!' },
];

export const VolumeBarsColor = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
