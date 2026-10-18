/**
 * Climax Volume Reversal Radar
 *
 * Volume columns coloured by climax conditions. A bullish climax (green) is a down bar (close < open) that closes
 * below the close of `takingClose` bars ago on a volume above sma(volume, 10) * riskFactor; a bearish climax (red)
 * is an up bar that closes above that close on the same volume condition; other bars are gray. An optional SMA of
 * the volume is drawn as a line.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Climax Watch' and 'Bearish Climax Watch', true on the
 * green and red columns.
 *
 * Reference: "Climax Volume Reversal Radar" by Ty_yanse
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ClimaxVolumeReversalRadarInputs {
  /** Show the volume MA */
  showMA: boolean;
  /** Volume MA length (the climax average always uses 10 bars) */
  lengthMA: number;
  /** Reference close bars back */
  takingClose: number;
  /** Volume multiple of the 10-bar average volume */
  riskFactor: number;
}

export const defaultInputs: ClimaxVolumeReversalRadarInputs = {
  showMA: true,
  lengthMA: 10,
  takingClose: 5,
  riskFactor: 1.618,
};

export const inputConfig: InputConfig[] = [
  { id: 'showMA', type: 'bool', title: 'Show Volume MA', defval: true },
  { id: 'lengthMA', type: 'int', title: 'Volume MA Length', defval: 10, min: 1 },
  { id: 'takingClose', type: 'int', title: 'Reference Close Bars Back', defval: 5, min: 1 },
  { id: 'riskFactor', type: 'float', title: 'Risk Factor', defval: 1.618, min: 0.1, step: 0.001 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Volume', color: color.gray, lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Volume MA', color: color.black, lineWidth: 2 },
];

export const metadata = {
  title: 'Climax Volume Reversal Radar',
  shortTitle: 'Climax Vol Radar',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ClimaxVolumeReversalRadarInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const volume = Series.fromArray(bars, bars.map((b) => b.volume ?? NaN));
  const vol = A(volume);
  const avgVolume = A(ta.sma(volume, 10));
  const volumeMa = A(ta.sma(volume, cfg.lengthMA));

  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  const plot0 = bars.map((b, i) => {
    const ref = i >= cfg.takingClose ? bars[i - cfg.takingClose].close : NaN;
    const highVolume = gt(vol[i], avgVolume[i] * cfg.riskFactor);
    const bullishClimax = lt(b.close, ref) && lt(b.close, b.open) && highVolume;
    const bearishClimax = gt(b.close, ref) && gt(b.close, b.open) && highVolume;
    bullFlags.push(bullishClimax);
    bearFlags.push(bearishClimax);
    const c = bullishClimax ? color.green : bearishClimax ? color.red : color.gray;
    return { time: b.time, value: vol[i], color: c };
  });
  const plot1 = bars.map((b, i) => ({ time: b.time, value: cfg.showMA ? volumeMa[i] : NaN, color: color.black }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    // alertcondition(bullishClimax, "Bullish Climax Watch") / alertcondition(bearishClimax, "Bearish Climax Watch")
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Climax Watch', message: 'Bullish climax volume detected: possible capitulation or reversal watch zone.' },
  { id: 'alert1', title: 'Bearish Climax Watch', message: 'Bearish climax volume detected: possible buying exhaustion or reversal watch zone.' },
];

export const ClimaxVolumeReversalRadar = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
