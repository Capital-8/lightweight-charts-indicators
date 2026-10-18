/**
 * MA Angle Alerts (SMA, EMA, VWMA, WMA)
 *
 * A moving average of the close (SMA, EMA, WMA or VWMA). Its slope over `barsToCheck` bars,
 * (ma - ma[barsToCheck]) / barsToCheck, is turned into an angle in degrees with atan. An "UP" signal (and a green
 * background) is drawn on the first bar where the angle is above the threshold, a "DOWN" signal (and a red
 * background) on the first bar where it is below minus the threshold. The angle is also plotted, with horizontal
 * lines at +- the threshold.
 * Alerts (alertcondition, `alerts` of the result): 'MA Angling Up' / 'MA Angling Down' on the bars of an UP / DOWN
 * signal.
 *
 * Reference: "MA Angle Alerts (SMA, EMA, VWMA, WMA)" by readysetfire
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type SmaAngleAlertsMAType = 'SMA' | 'EMA' | 'WMA' | 'VWMA';

export interface SmaAngleAlertsInputs {
  /** Moving average type */
  maType: SmaAngleAlertsMAType;
  /** Moving average length */
  maLength: number;
  /** Angle threshold (degrees) */
  angleThreshold: number;
  /** Bars to check for the slope */
  barsToCheck: number;
}

export const defaultInputs: SmaAngleAlertsInputs = {
  maType: 'SMA',
  maLength: 9,
  angleThreshold: 35,
  barsToCheck: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA', 'VWMA'] },
  { id: 'maLength', type: 'int', title: 'MA Length', defval: 9 },
  { id: 'angleThreshold', type: 'float', title: 'Angle Threshold (Degrees)', defval: 35 },
  { id: 'barsToCheck', type: 'int', title: 'Bars to Check for Slope', defval: 5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Selected MA', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'Slope Angle (°)', color: color.orange, lineWidth: 1 },
];

export const metadata = {
  title: 'MA Angle Alerts (SMA, EMA, VWMA, WMA)',
  shortTitle: 'MA Angle Alerts (SMA, EMA, VWMA, WMA)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SmaAngleAlertsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { maType, maLength, angleThreshold, barsToCheck } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  // getMA(close, maLength, maType): the type is an input, so the same branch runs on every bar
  let ma: number[];
  if (maType === 'EMA') ma = A(ta.ema(close, maLength));
  else if (maType === 'WMA') ma = A(ta.wma(close, maLength));
  else if (maType === 'VWMA') ma = A(ta.vwma(close, maLength, Series.fromArray(bars, bars.map((b) => b.volume ?? NaN))));
  else ma = A(ta.sma(close, maLength));

  const upBg = String(color.new(color.green, 85));
  const downBg = String(color.new(color.red, 85));
  const plot0: { time: number; value: number }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  // var bool lastAngleUp / lastAngleDown: updated on every confirmed (historical) bar
  let lastAngleUp = false;
  let lastAngleDown = false;
  const upFlags: boolean[] = [];
  const downFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const prev = i - barsToCheck >= 0 ? ma[i - barsToCheck] : NaN;
    // maSlope = (ma - ma[barsToCheck]) / barsToCheck: plain division (0 / 0 is na)
    const maSlope = (ma[i] - prev) / barsToCheck;
    const slopeAngle = Math.atan(maSlope) * (180 / Math.PI);
    const angleUp = gt(slopeAngle, angleThreshold);
    const angleDown = lt(slopeAngle, -angleThreshold);
    const angleUpAlert = angleUp && !lastAngleUp;
    const angleDownAlert = angleDown && !lastAngleDown;
    upFlags.push(angleUpAlert);
    downFlags.push(angleDownAlert);
    lastAngleUp = angleUp;
    lastAngleDown = angleDown;

    plot0.push({ time: t, value: ma[i] });
    plot1.push({ time: t, value: Number.isFinite(slopeAngle) ? slopeAngle : NaN });
    // bgcolor(angleUpAlert ? green 85 : na), then bgcolor(angleDownAlert ? red 85 : na) (drawn on top)
    if (angleDownAlert) bgColors.push({ time: t, color: downBg });
    else if (angleUpAlert) bgColors.push({ time: t, color: upBg });
    // plotshape(..., style = shape.labelup / labeldown, text = "UP" / "DOWN"), default text colour
    if (angleUpAlert) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'UP', textColor: color.blue });
    }
    if (angleDownAlert) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'DOWN', textColor: color.blue });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [
      { value: angleThreshold, options: { title: 'Upper Threshold', color: color.green, linestyle: 'dotted' } },
      { value: -angleThreshold, options: { title: 'Lower Threshold', color: color.red, linestyle: 'dotted' } },
    ],
    bgColors,
    markers,
    // alertcondition(angleUpAlert, "MA Angling Up") / alertcondition(angleDownAlert, "MA Angling Down")
    alerts: alertStates(alertConditions, bars, [upFlags, downFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'MA Angling Up', message: 'MA is angling up beyond threshold.' },
  { id: 'alert1', title: 'MA Angling Down', message: 'MA is angling down beyond threshold.' },
];

export const SmaAngleAlerts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
