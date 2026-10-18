/**
 * Volume Surge Detector
 *
 * Volume columns with an SMA of the volume. The ratio volume / SMA sets the column colour: the second ratio colour
 * above surge level 2, the first ratio colour above surge level 1, else the up / down volume colour (close > open).
 * Alerts (alertcondition, `alerts` of the result): 'Volume Surge Trigger1' when the ratio is above surge level 1 and
 * 'Volume Surge Trigger2' when it is above surge level 2.
 *
 * Reference: "Volume Surge Detector[SpeculationLab]" by SpeculationLab
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © SpeculationLab
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolumeSurgeDetectorInputs {
  /** SMA length of the volume */
  maLength: number;
  maColor: string;
  /** Column colour of an up bar (close > open) */
  volColor1: string;
  /** Column colour of the other bars */
  volColor2: string;
  /** Volume / SMA ratio of surge level 1 */
  trigger1: number;
  /** Volume / SMA ratio of surge level 2 */
  trigger2: number;
  /** Column colour above surge level 1 */
  color1: string;
  /** Column colour above surge level 2 */
  color2: string;
}

// Input colour defaults as Pine stores them (alpha with 2 decimals): color.rgb(255, 255, 255, 54) -> 0.46,
// color.rgb(38, 166, 153, 43) -> 0.57, #ef535087 -> 0.53, #00bbd4de -> 0.87, #ffeb3bda -> 0.85
const DEF_MA = 'rgba(255, 255, 255, 0.46)';
const DEF_VOL1 = 'rgba(38, 166, 153, 0.57)';
const DEF_VOL2 = 'rgba(239, 83, 80, 0.53)';
const DEF_RATIO1 = 'rgba(0, 187, 212, 0.87)';
const DEF_RATIO2 = 'rgba(255, 235, 59, 0.85)';

export const defaultInputs: VolumeSurgeDetectorInputs = {
  maLength: 14,
  maColor: DEF_MA,
  volColor1: DEF_VOL1,
  volColor2: DEF_VOL2,
  trigger1: 5,
  trigger2: 10,
  color1: DEF_RATIO1,
  color2: DEF_RATIO2,
};

export const inputConfig: InputConfig[] = [
  { id: 'maLength', type: 'int', title: 'MA Length', defval: 14, group: 'VOLUME SETTINGS' },
  { id: 'maColor', type: 'color', title: 'MA Color', defval: DEF_MA, group: 'VOLUME SETTINGS' },
  { id: 'volColor1', type: 'color', title: 'Volume Color1', defval: DEF_VOL1, group: 'VOLUME SETTINGS' },
  { id: 'volColor2', type: 'color', title: 'Volume Color2', defval: DEF_VOL2, group: 'VOLUME SETTINGS' },
  { id: 'trigger1', type: 'float', title: 'Surge Level1', defval: 5, min: 1, group: 'SURGE SETTINGS' },
  { id: 'trigger2', type: 'float', title: 'Surge Level2', defval: 10, min: 1, group: 'SURGE SETTINGS' },
  { id: 'color1', type: 'color', title: 'Ratio Color1', defval: DEF_RATIO1, group: 'SURGE SETTINGS' },
  { id: 'color2', type: 'color', title: 'Ratio Color2', defval: DEF_RATIO2, group: 'SURGE SETTINGS' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Volume', color: DEF_VOL1, lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'MA', color: DEF_MA, lineWidth: 1 },
];

export const metadata = {
  title: 'Volume Surge Detector[SpeculationLab]',
  shortTitle: 'Volume Surge Detector[SpeculationLab]',
  overlay: false,
  format: 'volume',
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeSurgeDetectorInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const volume = bars.map((b) => b.volume ?? NaN);
  const ma = ta.sma(Series.fromArray(bars, volume), cfg.maLength).toArray().map((v) => v ?? NaN);

  const alert1Flags: boolean[] = [];
  const alert2Flags: boolean[] = [];
  const plot0 = bars.map((b, i) => {
    // A plain division: x / 0 is +-infinity (0 / 0 NaN); the comparisons use the infinite value
    const ratio = volume[i] / ma[i];
    const alert1 = gt(ratio, cfg.trigger1);
    const alert2 = gt(ratio, cfg.trigger2);
    alert1Flags.push(alert1);
    alert2Flags.push(alert2);
    const c = alert2 ? cfg.color2 : alert1 ? cfg.color1 : gt(b.close, b.open) ? cfg.volColor1 : cfg.volColor2;
    return { time: b.time, value: volume[i], color: c };
  });
  const plot1 = bars.map((b, i) => ({ time: b.time, value: ma[i], color: cfg.maColor }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, format: metadata.format },
    plots: { plot0, plot1 },
    // alertcondition(alert1, "Volume Surge Trigger1") / alertcondition(alert2, "Volume Surge Trigger2")
    alerts: alertStates(alertConditions, bars, [alert1Flags, alert2Flags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Volume Surge Trigger1', message: 'Volume Surge Level 1 Detected 📊（成交量放量 Level 1 )' },
  { id: 'alert1', title: 'Volume Surge Trigger2', message: 'Volume Surge Level 2 Detected 🚀(成交量放量 Level 2) ' },
];

export const VolumeSurgeDetector = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
