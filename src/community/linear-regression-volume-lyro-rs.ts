/**
 * Linear Regression Volume | Lyro RS
 *
 * A volume-weighted average price, ma(close * volume, len) / ma(volume, len) with the chosen average (SMA, RMA, HMA
 * or ALMA with offset 0 and sigma 0), smoothed by a linear regression of `len` bars: the fair value line. Three
 * band pairs at 1, 2 and 3 times mult * stdev(close, len) around it are filled. The line and the fills are green
 * when the fair value rises, pink when it falls, gray otherwise.
 * Alerts (alertcondition, `alerts` of the result): the fair value rising (Long) / falling (Short).
 *
 * Reference: "Linear Regression Volume | Lyro RS" by LyroRS
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Lyro RS
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LinearRegressionVolumeLyroRsInputs {
  /** Length of the volume-weighted average, the linear regression and the standard deviation */
  len: number;
  /** Deviation multiplier of the bands */
  mult: number;
  /** Average of the volume-weighted price */
  typeMA: 'SMA' | 'RMA' | 'HMA' | 'ALMA';
}

export const defaultInputs: LinearRegressionVolumeLyroRsInputs = {
  len: 35,
  mult: 1.0,
  typeMA: 'SMA',
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Regression Length', defval: 35 },
  { id: 'mult', type: 'float', title: 'Deviation Multiplier', defval: 1.0 },
  { id: 'typeMA', type: 'string', title: 'Type', defval: 'SMA', options: ['SMA', 'RMA', 'HMA', 'ALMA'],
    tooltip: 'Change to what suits your style' },
];

const UPPER_COL = '#ff026f';
const LOWER_COL = '#40ed49';
const UPPER_T = String(color.new(UPPER_COL, 100));
const LOWER_T = String(color.new(LOWER_COL, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fair Value', color: LOWER_COL, lineWidth: 2 },
  { id: 'plot1', title: 'Upper Band 1', color: UPPER_T, lineWidth: 1 },
  { id: 'plot2', title: 'Lower Band 1', color: UPPER_T, lineWidth: 1 },
  { id: 'plot3', title: 'Upper Band 2', color: UPPER_T, lineWidth: 1 },
  { id: 'plot4', title: 'Lower Band 2', color: LOWER_T, lineWidth: 1 },
  { id: 'plot5', title: 'Upper Band 3', color: UPPER_T, lineWidth: 1 },
  { id: 'plot6', title: 'Lower Band 3', color: LOWER_T, lineWidth: 1 },
];

export const metadata = {
  title: 'Linear Regression Volume | Lyro RS',
  shortTitle: 'LR Volume | 𝓛𝔂𝓻𝓸 𝓡𝓢',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<LinearRegressionVolumeLyroRsInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { len, mult } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // vw_linregCho(close, len, typeMA): ma(close * volume, len) / ma(volume, len) (x / 0 is +-infinity, 0 / 0 na)
  const pv = S(bars.map((b) => b.close * (b.volume ?? NaN)));
  const vol = S(bars.map((b) => b.volume ?? NaN));
  const ma = (s: Series): number[] => {
    switch (cfg.typeMA) {
      case 'SMA': return A(ta.sma(s, len));
      case 'RMA': return A(ta.rma(s, len));
      case 'HMA': return A(ta.hma(s, len));
      case 'ALMA': return A(ta.alma(s, len, 0, 0));
      default: return new Array<number>(bars.length).fill(NaN);
    }
  };
  const num = ma(pv);
  const den = ma(vol);
  // ta.linreg skips na like the averages: give it NaN for +-infinity
  const vwPrice = num.map((x, i) => {
    const v = x / den[i];
    return Number.isFinite(v) ? v : NaN;
  });
  const baseline = A(ta.linreg(S(vwPrice), len, 0));
  const dev = A(ta.stdev(S(bars.map((b) => b.close)), len)).map((s) => mult * s);

  // bandColor = slope > 0 ? #40ed49 : slope < 0 ? #ff026f : color.gray
  const slope = baseline.map((b, i) => (i > 0 ? b - baseline[i - 1] : NaN));
  const bandColor = slope.map((sl) => (gt(sl, 0) ? LOWER_COL : lt(sl, 0) ? UPPER_COL : color.gray));

  const line = (k: number, col: string) => bars.map((b, i) => ({ time: b.time, value: baseline[i] + k * dev[i], color: col }));
  const fillCols = (t: number) => bandColor.map((c) => String(color.new(c, t)));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: baseline[i], color: bandColor[i] })),
      plot1: line(1, UPPER_T),
      plot2: line(-1, UPPER_T),
      plot3: line(2, UPPER_T),
      plot4: line(-2, LOWER_T),
      plot5: line(3, UPPER_T),
      plot6: line(-3, LOWER_T),
    },
    fills: [
      // fill(upper1Plot, lower1Plot, color = color.new(bandColor, 85)) (and 92, 96 for bands 2 and 3)
      { plot1: 'plot1', plot2: 'plot2', colors: fillCols(85) },
      { plot1: 'plot3', plot2: 'plot4', colors: fillCols(92) },
      { plot1: 'plot5', plot2: 'plot6', colors: fillCols(96) },
    ],
    // alertcondition(slope > 0, ...) / alertcondition(slope < 0, ...)
    alerts: alertStates(alertConditions, bars, [slope.map((sl) => gt(sl, 0)), slope.map((sl) => lt(sl, 0))]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Linear Regression Volume - Long', message: 'Linear Regression Volume is Long {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Linear Regression Volume - Short', message: 'Linear Regression Volume is Short {{exchange}}:{{ticker}}' },
];

export const LinearRegressionVolumeLyroRs = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
