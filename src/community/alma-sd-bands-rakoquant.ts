/**
 * ALMA SD Bands
 *
 * The basis is the ALMA of the source. The volatility is the standard deviation of the source (or of the log
 * returns of the close) over the same length, smoothed by a second ALMA. The bands are basis +- multiplier *
 * volatility. A regime starts bullish when the close goes above basis + deadband (deadband = deadband factor *
 * volatility, or 0) and bearish when it goes below basis - deadband; it then holds until the opposite crossing.
 * The bands, the band fill and the optional candle paint take the regime colour (lime / red, grey before the first
 * regime). Length and volatility smoothing come from the mode presets or the custom inputs.
 *
 * Alerts (alertcondition, `alerts` of the result): the bull / bear regime starting, on confirmed bars
 * (`barstate.isconfirmed`: the last bar only when the chart context, the optional third argument, says it is closed,
 * `lastBarConfirmed`; true without a context).
 *
 * Reference: "ALMA SD Bands | RakoQuant" by RakoQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © RakoQuant
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface AlmaSdBandsRakoquantInputs {
  /** Mode: length and volatility smoothing from the daily / intraday presets or the custom inputs */
  mode: 'Daily / Swing' | 'Intraday' | 'Custom';
  presetLenDaily: number;
  presetLenIntra: number;
  presetVolSmoothDaily: number;
  presetVolSmoothIntra: number;
  lenCustom: number;
  volSmoothCustom: number;
  src: SourceType;
  /** ALMA offset (0..1) */
  almaOffset: number;
  /** ALMA sigma */
  almaSigma: number;
  /** Band multiplier (in standard deviations) */
  mult: number;
  volType: 'Price StdDev' | 'Return StdDev';
  /** Deadband regime (less flicker) */
  useDeadband: boolean;
  /** Deadband (in standard deviations) */
  deadMult: number;
  showFill: boolean;
  paintBars: boolean;
  /** Band width (the port draws the bands with the default width 4) */
  lineWidth: number;
}

export const defaultInputs: AlmaSdBandsRakoquantInputs = {
  mode: 'Daily / Swing',
  presetLenDaily: 111,
  presetLenIntra: 21,
  presetVolSmoothDaily: 75,
  presetVolSmoothIntra: 10,
  lenCustom: 34,
  volSmoothCustom: 14,
  src: 'high',
  almaOffset: 0.85,
  almaSigma: 6.0,
  mult: 0.4,
  volType: 'Price StdDev',
  useDeadband: true,
  deadMult: 0.35,
  showFill: true,
  paintBars: false,
  lineWidth: 4,
};

export const inputConfig: InputConfig[] = [
  { id: 'mode', type: 'string', title: 'Mode', defval: 'Daily / Swing', options: ['Daily / Swing', 'Intraday', 'Custom'], group: 'Mode' },
  { id: 'presetLenDaily', type: 'int', title: 'Daily Length', defval: 111, min: 5, group: 'Mode Presets' },
  { id: 'presetLenIntra', type: 'int', title: 'Intraday Length', defval: 21, min: 5, group: 'Mode Presets' },
  { id: 'presetVolSmoothDaily', type: 'int', title: 'Daily Vol Smooth', defval: 75, min: 1, group: 'Mode Presets' },
  { id: 'presetVolSmoothIntra', type: 'int', title: 'Intraday Vol Smooth', defval: 10, min: 1, group: 'Mode Presets' },
  { id: 'lenCustom', type: 'int', title: 'Length', defval: 34, min: 5, group: 'Custom' },
  { id: 'volSmoothCustom', type: 'int', title: 'Vol Smooth Length', defval: 14, min: 1, group: 'Custom' },
  { id: 'src', type: 'source', title: 'Source', defval: 'high', group: 'Source' },
  { id: 'almaOffset', type: 'float', title: 'ALMA Offset (0..1)', defval: 0.85, min: 0.0, max: 1.0, step: 0.01, group: 'ALMA' },
  { id: 'almaSigma', type: 'float', title: 'ALMA Sigma', defval: 6.0, min: 0.5, step: 0.5, group: 'ALMA' },
  { id: 'mult', type: 'float', title: 'Band Multiplier (σ)', defval: 0.4, min: 0.1, step: 0.1, group: 'Bands' },
  { id: 'volType', type: 'string', title: 'Volatility Type', defval: 'Price StdDev', options: ['Price StdDev', 'Return StdDev'], group: 'Bands' },
  { id: 'useDeadband', type: 'bool', title: 'Deadband Regime (less flicker)', defval: true, group: 'Bands' },
  { id: 'deadMult', type: 'float', title: 'Deadband (in σ)', defval: 0.35, min: 0.0, step: 0.05, group: 'Bands' },
  { id: 'showFill', type: 'bool', title: 'Show Fill', defval: true, group: 'Visuals' },
  { id: 'paintBars', type: 'bool', title: 'Paint Candles', defval: false, group: 'Visuals' },
  { id: 'lineWidth', type: 'int', title: 'Band Width', defval: 4, min: 1, max: 4, group: 'Visuals' },
];

const MID_COL = String(color.new(color.white, 0));
const NEUTRAL_COL = String(color.new(color.gray, 40));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Band', color: color.lime, lineWidth: 4 },
  { id: 'plot1', title: 'Lower Band', color: color.lime, lineWidth: 4 },
  { id: 'plot2', title: 'ALMA Basis', color: MID_COL, lineWidth: 1 },
  { id: 'plot3', title: 'Smoothed Vol (σ)', color: color.blue, lineWidth: 1, display: 'data_window' },
];

export const metadata = {
  title: 'ALMA SD Bands | RakoQuant',
  shortTitle: 'RQ ALMA SD BANDS',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AlmaSdBandsRakoquantInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { barColors: BarColorData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const len = cfg.mode === 'Custom' ? cfg.lenCustom : cfg.mode === 'Intraday' ? cfg.presetLenIntra : cfg.presetLenDaily;
  const volSmoothLen = cfg.mode === 'Custom' ? cfg.volSmoothCustom
    : cfg.mode === 'Intraday' ? cfg.presetVolSmoothIntra : cfg.presetVolSmoothDaily;

  const src = getSourceSeries(bars, cfg.src);
  // 1) basis = ta.alma(src, len, almaOffset, almaSigma)
  const basis = A(ta.alma(src, len, cfg.almaOffset, cfg.almaSigma));
  // 2) ret = math.log(close / nz(close[1])): log(+infinity) on the first bar; ta.stdev skips the infinite value like na
  let rawVol: number[];
  if (cfg.volType === 'Return StdDev') {
    const ret = bars.map((b, i) => {
      const r = Math.log(b.close / (i > 0 && !isNaN(bars[i - 1].close) ? bars[i - 1].close : 0));
      return Number.isFinite(r) ? r : NaN;
    });
    rawVol = A(ta.stdev(S(ret), len));
  } else {
    rawVol = A(ta.stdev(src, len));
  }
  // 3) vol = ta.alma(rawVol, volSmoothLen, almaOffset, almaSigma)
  const vol = A(ta.alma(S(rawVol), volSmoothLen, cfg.almaOffset, cfg.almaSigma));

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const plot2: { time: number; value: number; color: string }[] = [];
  const plot3: { time: number; value: number }[] = [];
  const fillColors: string[] = [];
  const barColors: BarColorData[] = [];
  const candles: PlotCandleData[] = [];
  const lastConfirmed = lastBarConfirmedOf(chart);
  const buyAlert: boolean[] = new Array(n).fill(false);
  const sellAlert: boolean[] = new Array(n).fill(false);
  let state = 0; // var int state = 0
  let prevState = NaN; // state[1]
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const upper = basis[i] + cfg.mult * vol[i];
    const lower = basis[i] - cfg.mult * vol[i];
    const dead = cfg.useDeadband ? cfg.deadMult * vol[i] : 0.0;
    if (state === 0) {
      state = gt(b.close, basis[i] + dead) ? 1 : lt(b.close, basis[i] - dead) ? -1 : 0;
    } else if (state === 1) {
      state = lt(b.close, basis[i] - dead) ? -1 : 1;
    } else {
      state = gt(b.close, basis[i] + dead) ? 1 : -1;
    }
    // bullFlip = bull and not bull[1], bearFlip = bear and not bear[1];
    // buyAlert / sellAlert = barstate.isconfirmed and bullFlip / bearFlip
    const confirmed = i < n - 1 || lastConfirmed;
    buyAlert[i] = confirmed && state === 1 && prevState !== 1;
    sellAlert[i] = confirmed && state === -1 && prevState !== -1;
    prevState = state;
    const col = state === 1 ? color.lime : state === -1 ? color.red : NEUTRAL_COL;
    const bandCol = String(color.new(col, 0));
    plot0.push({ time: b.time, value: upper, color: bandCol });
    plot1.push({ time: b.time, value: lower, color: bandCol });
    plot2.push({ time: b.time, value: basis[i], color: MID_COL });
    plot3.push({ time: b.time, value: vol[i] });
    // fill(pU, pL, color = showFill ? color.new(col, 92) : na)
    fillColors.push(cfg.showFill ? String(color.new(col, 92)) : 'transparent');
    // barcolor(paintBars ? col : na)
    if (cfg.paintBars) barColors.push({ time: b.time, color: col });
    // plotcandle(open, high, low, close, color / wickcolor / bordercolor = paintBars ? col : na, force_overlay = true)
    const c = cfg.paintBars ? col : 'transparent';
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: c, wickColor: c,
      borderColor: c, forceOverlay: true });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' }, colors: fillColors }],
    barColors,
    plotCandles: { paintCandles: candles },
    alerts: alertStates(alertConditions, bars, [buyAlert, sellAlert]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RQ ALMA SD BANDS — BULL', message: 'RQ ALMA SD BANDS BULL regime on {{exchange}}:{{ticker}} (close={{close}})' },
  { id: 'alert1', title: 'RQ ALMA SD BANDS — BEAR', message: 'RQ ALMA SD BANDS BEAR regime on {{exchange}}:{{ticker}} (close={{close}})' },
];

export const AlmaSdBandsRakoquant = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
