/**
 * Institutional Volume RSI [Adaptive]
 *
 * RSI of the volume-weighted moving average of the close (or of the close: standard RSI), with Bollinger bands on
 * the RSI: basis = SMA(RSI, bands length), bands = basis +/- multiplier * stdev(RSI, bands length). The RSI line is
 * green above the basis and red below; a fill shades the zone between the bands. White circles mark the bars where
 * the RSI crosses over the upper band or under the lower band.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Volatility Breakout' / 'Bearish Volatility Breakout', true
 * on the bars of those crosses.
 *
 * Reference: "Institutional Volume RSI [Adaptive]" by abgthecoder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface InstitutionalVolumeRSIInputs {
  /** RSI length (also the VWMA length) */
  rsiLen: number;
  /** RSI source: VWMA of the close or the close */
  srcType: 'VWMA (Volume Weighted)' | 'Close (Standard)';
  /** Bands length */
  bbLen: number;
  /** Bands multiplier (standard deviations) */
  bbMult: number;
}

export const defaultInputs: InstitutionalVolumeRSIInputs = {
  rsiLen: 14,
  srcType: 'VWMA (Volume Weighted)',
  bbLen: 20,
  bbMult: 2.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'srcType', type: 'string', title: 'Source Type', defval: 'VWMA (Volume Weighted)', options: ['VWMA (Volume Weighted)', 'Close (Standard)'] },
  { id: 'bbLen', type: 'int', title: 'Bands Length', defval: 20, min: 1 },
  { id: 'bbMult', type: 'float', title: 'Bands Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
];

const BAND_COL = String(color.new(color.gray, 50));
const BASE_COL = String(color.new(color.white, 70));
const FILL_COL = String(color.new(color.blue, 95));
const BULL_COL = '#00E676';
const BEAR_COL = '#FF5252';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Band', color: BAND_COL, lineWidth: 1 },
  { id: 'plot1', title: 'Lower Band', color: BAND_COL, lineWidth: 1 },
  { id: 'plot2', title: 'Baseline', color: BASE_COL, lineWidth: 1, style: 'circles' },
  { id: 'plot3', title: 'Institutional RSI', color: BULL_COL, lineWidth: 2 },
  { id: 'plot4', title: 'Bullish Extreme', color: color.white, lineWidth: 3, style: 'circles' },
  { id: 'plot5', title: 'Bearish Extreme', color: color.white, lineWidth: 3, style: 'circles' },
];

export const metadata = {
  title: 'Institutional Volume RSI [Adaptive]',
  shortTitle: 'IV-RSI [Adaptive]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<InstitutionalVolumeRSIInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const close = S(bars.map((b) => b.close));
  // rsi_src = src_type == "VWMA (Volume Weighted)" ? ta.vwma(close, rsi_len) : close
  const rsiSrc = cfg.srcType === 'VWMA (Volume Weighted)'
    ? ta.vwma(close, cfg.rsiLen, S(bars.map((b) => b.volume ?? NaN)))
    : close;
  const rsi = A(ta.rsi(rsiSrc, cfg.rsiLen));
  const rsiS = S(rsi);
  const basis = A(ta.sma(rsiS, cfg.bbLen));
  const dev = A(ta.stdev(rsiS, cfg.bbLen));
  const upper = basis.map((b, i) => b + dev[i] * cfg.bbMult);
  const lower = basis.map((b, i) => b - dev[i] * cfg.bbMult);

  // ta.crossover(a, b): a > b and a[1] <= b[1]; ta.crossunder(a, b): a < b and a[1] >= b[1]
  // (exact comparisons, no 1e-10 tolerance; na gives false)
  const crossUp = (i: number) => i > 0 && rsi[i] > upper[i] && rsi[i - 1] <= upper[i - 1];
  const crossDn = (i: number) => i > 0 && rsi[i] < lower[i] && rsi[i - 1] >= lower[i - 1];

  const t = (i: number) => bars[i].time;
  const plot0 = bars.map((_b, i) => ({ time: t(i), value: upper[i], color: BAND_COL }));
  const plot1 = bars.map((_b, i) => ({ time: t(i), value: lower[i], color: BAND_COL }));
  const plot2 = bars.map((_b, i) => ({ time: t(i), value: basis[i], color: BASE_COL }));
  // rsi_color = rsi_val > basis ? #00E676 : #FF5252
  const plot3 = bars.map((_b, i) => ({ time: t(i), value: rsi[i], color: gt(rsi[i], basis[i]) ? BULL_COL : BEAR_COL }));
  const plot4 = bars.map((_b, i) => ({ time: t(i), value: crossUp(i) ? rsi[i] : NaN, color: color.white }));
  const plot5 = bars.map((_b, i) => ({ time: t(i), value: crossDn(i) ? rsi[i] : NaN, color: color.white }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5 },
    // fill(p_upper, p_lower, color = color.new(color.blue, 95), title = "Volatility Zone")
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Volatility Zone', color: FILL_COL } }],
    // alertcondition(cross_up, ...) / alertcondition(cross_dn, ...)
    alerts: alertStates(alertConditions, bars, [bars.map((_b, i) => crossUp(i)), bars.map((_b, i) => crossDn(i))]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Volatility Breakout', message: 'IV-RSI broke above Upper Band' },
  { id: 'alert1', title: 'Bearish Volatility Breakout', message: 'IV-RSI broke below Lower Band' },
];

export const InstitutionalVolumeRSI = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
