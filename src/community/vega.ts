/**
 * VEGA Squeeze Pro (Velocity of Efficient Gain Adaptation)
 *
 * The source is the close mixed with its linear regression (linreg_mix). An adaptive moving average (Kaufman style)
 * follows the source with sc = (er * (fast_sc - slow_sc) + slow_sc)^2, er the efficiency ratio over `length` bars.
 * The velocity is the bar change of this average, normalized by the ATR (* 100) or as a z-score over
 * `zscore_length` bars, with a dead zone near zero (snap to 0 or a soft fade). It is drawn as a histogram coloured by
 * its sign and direction; the same colour paints the candles. Squeeze Pro dots on the zero line show whether the
 * Bollinger Bands are inside the Keltner Channel at three widths (low / mid / high compression).
 * Alerts (alertcondition, `alerts` of the result): velocity crossing above / below zero, squeeze started / fired
 * (any compression begins / ends), high squeeze entered / released.
 *
 * Reference: "VEGA (Velocity of Efficient Gain Adaptation)" by B3AR_Trades
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type DeadZoneType = 'Snap' | 'Soft Fade' | 'None';

export interface VegaInputs {
  /** Efficiency ratio length */
  length: number;
  /** Fast smoothing constant */
  fastLength: number;
  /** Slow smoothing constant */
  slowLength: number;
  /** Mix the close with its linear regression */
  useLinreg: boolean;
  linregLen: number;
  /** 0 = regular close, 1 = full linear regression */
  linregMix: number;
  normType: 'ATR' | 'Z-Score';
  atrLength: number;
  atrDeadzoneType: DeadZoneType;
  atrDeadzone: number;
  zscoreLength: number;
  zscoreDeadzoneType: DeadZoneType;
  zscoreDeadzone: number;
  sqzEnabled: boolean;
  bbLength: number;
  bbMult: number;
  kcLength: number;
  kcMultHigh: number;
  kcMultMid: number;
  kcMultLow: number;
  sqzOffColor: string;
  sqzLowColor: string;
  sqzMidColor: string;
  sqzHighColor: string;
  colorCandles: boolean;
  bullStrong: string;
  bullWeak: string;
  bearStrong: string;
  bearWeak: string;
}

export const defaultInputs: VegaInputs = {
  length: 40,
  fastLength: 3,
  slowLength: 30,
  useLinreg: true,
  linregLen: 7,
  linregMix: 0.5,
  normType: 'Z-Score',
  atrLength: 14,
  atrDeadzoneType: 'Soft Fade',
  atrDeadzone: 5.0,
  zscoreLength: 20,
  zscoreDeadzoneType: 'Soft Fade',
  zscoreDeadzone: 0.5,
  sqzEnabled: true,
  bbLength: 20,
  bbMult: 2.0,
  kcLength: 20,
  kcMultHigh: 1.5,
  kcMultMid: 1.0,
  kcMultLow: 0.5,
  sqzOffColor: '#00FFFF00',
  sqzLowColor: '#00C3FF',
  sqzMidColor: '#E5FF00',
  sqzHighColor: '#FF0000',
  colorCandles: true,
  bullStrong: '#00FFFF',
  bullWeak: '#00FFFF99',
  bearStrong: '#FF0000',
  bearWeak: '#FF000099',
};

const DZ_OPTIONS = ['Snap', 'Soft Fade', 'None'];
const G_AMA = 'Adaptive MA Settings';
const G_SRC = 'Source Settings';
const G_NORM = 'Normalization';
const G_SQZ = 'Squeeze Pro Settings';
const G_VIS = 'Visual Settings';

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'ER Length', defval: 40, min: 2, group: G_AMA },
  { id: 'fastLength', type: 'int', title: 'Fast Smoothing', defval: 3, min: 1, group: G_AMA },
  { id: 'slowLength', type: 'int', title: 'Slow Smoothing', defval: 30, min: 1, group: G_AMA },
  { id: 'useLinreg', type: 'bool', title: 'Use LinReg Smoothed Candles', defval: true, group: G_SRC },
  { id: 'linregLen', type: 'int', title: 'LinReg Length', defval: 7, min: 2, group: G_SRC },
  { id: 'linregMix', type: 'float', title: 'LinReg Mix', defval: 0.5, min: 0.0, max: 1.0, step: 0.1, group: G_SRC },
  { id: 'normType', type: 'string', title: 'Normalization', defval: 'Z-Score', options: ['ATR', 'Z-Score'], group: G_NORM },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1, group: G_NORM },
  { id: 'atrDeadzoneType', type: 'string', title: 'ATR Dead Zone Type', defval: 'Soft Fade', options: DZ_OPTIONS, group: G_NORM },
  { id: 'atrDeadzone', type: 'float', title: 'ATR Dead Zone', defval: 5.0, min: 0.0, max: 50.0, step: 0.5, group: G_NORM },
  { id: 'zscoreLength', type: 'int', title: 'Z-Score Lookback', defval: 20, min: 2, group: G_NORM },
  { id: 'zscoreDeadzoneType', type: 'string', title: 'Z-Score Dead Zone Type', defval: 'Soft Fade', options: DZ_OPTIONS, group: G_NORM },
  { id: 'zscoreDeadzone', type: 'float', title: 'Z-Score Dead Zone', defval: 0.5, min: 0.0, max: 2.0, step: 0.1, group: G_NORM },
  { id: 'sqzEnabled', type: 'bool', title: 'Enable Squeeze Detection', defval: true, group: G_SQZ },
  { id: 'bbLength', type: 'int', title: 'BB Length', defval: 20, min: 1, group: G_SQZ },
  { id: 'bbMult', type: 'float', title: 'BB Multiplier', defval: 2.0, min: 0.1, step: 0.1, group: G_SQZ },
  { id: 'kcLength', type: 'int', title: 'KC Length', defval: 20, min: 1, group: G_SQZ },
  { id: 'kcMultHigh', type: 'float', title: 'KC High Multiplier', defval: 1.5, min: 0.1, step: 0.1, group: G_SQZ },
  { id: 'kcMultMid', type: 'float', title: 'KC Mid Multiplier', defval: 1.0, min: 0.1, step: 0.1, group: G_SQZ },
  { id: 'kcMultLow', type: 'float', title: 'KC Low Multiplier', defval: 0.5, min: 0.1, step: 0.1, group: G_SQZ },
  { id: 'sqzOffColor', type: 'color', title: 'No Squeeze', defval: '#00FFFF00', group: G_SQZ },
  { id: 'sqzLowColor', type: 'color', title: 'Low Squeeze', defval: '#00C3FF', group: G_SQZ },
  { id: 'sqzMidColor', type: 'color', title: 'Mid Squeeze', defval: '#E5FF00', group: G_SQZ },
  { id: 'sqzHighColor', type: 'color', title: 'High Squeeze', defval: '#FF0000', group: G_SQZ },
  { id: 'colorCandles', type: 'bool', title: 'Color Main Chart Candles', defval: true, group: G_VIS },
  { id: 'bullStrong', type: 'color', title: 'Bullish Rising', defval: '#00FFFF', group: G_VIS },
  { id: 'bullWeak', type: 'color', title: 'Bullish Falling', defval: '#00FFFF99', group: G_VIS },
  { id: 'bearStrong', type: 'color', title: 'Bearish Falling', defval: '#FF0000', group: G_VIS },
  { id: 'bearWeak', type: 'color', title: 'Bearish Rising', defval: '#FF000099', group: G_VIS },
];

const BAND_COL = String(color.new(color.red, 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Band +2σ', color: BAND_COL, lineWidth: 1, linestyle: 'dashed' },
  { id: 'plot1', title: 'Lower Band -2σ', color: BAND_COL, lineWidth: 1, linestyle: 'dashed' },
  { id: 'plot2', title: 'VEGA', color: '#00FFFF', lineWidth: 4, style: 'histogram' },
  { id: 'plot3', title: 'Squeeze Pro', color: '#00FFFF00', lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: 'VEGA Squeeze Pro',
  shortTitle: 'VEGA Pro',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** Pine `x != 0`: false when x is na */
const ne0 = (x: number) => !isNaN(x) && Math.abs(x) > EPS;
const nz = (x: number) => (isNaN(x) ? 0 : x);

export function calculate(
  bars: Bar[],
  inputs: Partial<VegaInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const closeS = S(close);

  // src = use_linreg ? close * (1 - linreg_mix) + ta.linreg(close, linreg_len, 0) * linreg_mix : close
  const linregClose = A(ta.linreg(closeS, cfg.linregLen, 0));
  const src = close.map((c, i) => (cfg.useLinreg ? c * (1 - cfg.linregMix) + linregClose[i] * cfg.linregMix : c));

  // Efficiency ratio: abs(src - src[length]) / math.sum(abs(src - src[1]), length)
  const absDiff = src.map((v, i) => (i > 0 ? Math.abs(v - src[i - 1]) : NaN));
  const volatility = A(math.sum(S(absDiff), cfg.length) as Series);
  const fastSc = 2.0 / (cfg.fastLength + 1);
  const slowSc = 2.0 / (cfg.slowLength + 1);
  const ama: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const changeAbs = i >= cfg.length ? Math.abs(src[i] - src[i - cfg.length]) : NaN;
    // er = volatility != 0 ? change_abs / volatility : 0 (na != 0 is false)
    const er = ne0(volatility[i]) ? changeAbs / volatility[i] : 0;
    const sc = Math.pow(er * (fastSc - slowSc) + slowSc, 2);
    const prev = i > 0 ? ama[i - 1] : NaN;
    // adaptive_ma := na(adaptive_ma[1]) ? src : sc * src + (1 - sc) * adaptive_ma[1]
    ama[i] = isNaN(prev) ? src[i] : sc * src[i] + (1 - sc) * prev;
  }

  // velocity_raw = adaptive_ma - nz(adaptive_ma[1])
  const velocityRaw = ama.map((v, i) => v - nz(i > 0 ? ama[i - 1] : NaN));
  const atrVal = A(ta.atr(bars, cfg.atrLength));
  const velocityMean = A(ta.sma(S(velocityRaw), cfg.zscoreLength));
  const velocityStdev = A(ta.stdev(S(velocityRaw), cfg.zscoreLength));

  const velocity: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let norm: number;
    if (cfg.normType === 'ATR') norm = ne0(atrVal[i]) ? (velocityRaw[i] / atrVal[i]) * 100 : velocityRaw[i];
    else norm = ne0(velocityStdev[i]) ? (velocityRaw[i] - velocityMean[i]) / velocityStdev[i] : 0;
    // Dead zone
    let v = norm;
    const zone = cfg.normType === 'ATR' ? cfg.atrDeadzone : cfg.zscoreDeadzone;
    const type = cfg.normType === 'ATR' ? cfg.atrDeadzoneType : cfg.zscoreDeadzoneType;
    if (type === 'Snap') {
      v = lt(Math.abs(norm), zone) ? 0.0 : norm;
    } else if (type === 'Soft Fade') {
      if (lt(Math.abs(norm), zone)) v = norm * (Math.abs(norm) / zone);
    }
    velocity[i] = v;
  }

  // Squeeze Pro: Bollinger Bands inside the Keltner Channel at three widths
  const bbBasis = A(ta.sma(closeS, cfg.bbLength));
  const bbStdev = A(ta.stdev(closeS, cfg.bbLength));
  const kcBasis = A(ta.sma(closeS, cfg.kcLength));
  const kcRange = A(ta.atr(bars, cfg.kcLength));
  const sqzColor: string[] = new Array(n);
  const sqzState: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const bbDev = cfg.bbMult * bbStdev[i];
    const bbUpper = bbBasis[i] + bbDev;
    const bbLower = bbBasis[i] - bbDev;
    const inKc = (mult: number) => gt(bbLower, kcBasis[i] - mult * kcRange[i]) && lt(bbUpper, kcBasis[i] + mult * kcRange[i]);
    const state = inKc(cfg.kcMultLow) ? 3 : inKc(cfg.kcMultMid) ? 2 : inKc(cfg.kcMultHigh) ? 1 : 0;
    sqzState[i] = state;
    sqzColor[i] = state === 3 ? cfg.sqzHighColor : state === 2 ? cfg.sqzMidColor : state === 1 ? cfg.sqzLowColor : cfg.sqzOffColor;
  }

  const plot0: { time: number; value: number }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const plot2: { time: number; value: number; color: string }[] = [];
  const plot3: { time: number; value: number; color: string }[] = [];
  const barColors: BarColorData[] = [];
  const zscore = cfg.normType === 'Z-Score';
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    // velocity_rising = velocity > nz(velocity[1])
    const rising = gt(velocity[i], nz(i > 0 ? velocity[i - 1] : NaN));
    const histColor = ge(velocity[i], 0)
      ? (rising ? cfg.bullStrong : cfg.bullWeak)
      : (rising ? cfg.bearWeak : cfg.bearStrong);
    plot0.push({ time: t, value: zscore ? 2.0 : NaN });
    plot1.push({ time: t, value: zscore ? -2.0 : NaN });
    plot2.push({ time: t, value: Number.isFinite(velocity[i]) ? velocity[i] : NaN, color: histColor });
    plot3.push({ time: t, value: cfg.sqzEnabled ? 0.0 : NaN, color: sqzColor[i] });
    // barcolor(color_candles ? hist_color : na, title = "Candle Colors")
    if (cfg.colorCandles) barColors.push({ time: t, color: histColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    hlines: [{ value: 0, options: { title: 'Zero', color: String(color.new(color.gray, 50)), linestyle: 'dotted' } }],
    barColors,
    // alertcondition(ta.crossover(velocity, 0)) / (ta.crossunder(velocity, 0)) and the squeeze state changes
    // (sqz_state[1] on the first bar is na: its comparisons are false)
    alerts: alertStates(alertConditions, bars, [
      crossedOver(velocity, 0),
      crossedUnder(velocity, 0),
      sqzState.map((st, i) => i > 0 && sqzState[i - 1] === 0 && st > 0),
      sqzState.map((st, i) => i > 0 && sqzState[i - 1] > 0 && st === 0),
      sqzState.map((st, i) => i > 0 && st === 3 && sqzState[i - 1] !== 3),
      sqzState.map((st, i) => i > 0 && sqzState[i - 1] === 3 && st < 3),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Zero Cross', message: 'VEGA crossed above zero' },
  { id: 'alert1', title: 'Bearish Zero Cross', message: 'VEGA crossed below zero' },
  { id: 'alert2', title: 'Squeeze Started', message: 'VEGA squeeze started' },
  { id: 'alert3', title: 'Squeeze Fired', message: 'VEGA squeeze fired (volatility expanding)' },
  { id: 'alert4', title: 'High Squeeze', message: 'VEGA entered high compression squeeze' },
  { id: 'alert5', title: 'High Squeeze Released', message: 'VEGA high compression squeeze releasing' },
];

export const Vega = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
