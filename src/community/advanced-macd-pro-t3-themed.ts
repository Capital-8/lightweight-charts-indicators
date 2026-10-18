/**
 * Advanced MACD Pro - T3 Themed
 *
 * MACD line = EMA(fast) - EMA(slow) of the source, coloured by its sign; signal line = EMA of the MACD (hidden by
 * default); histogram = MACD - signal, optionally smoothed (SMA / EMA / WMA / RMA / T3; the raw value while the
 * smoothing is na). The histogram colour is strong / weakening bullish (MACD above the signal, histogram rising /
 * falling against nz(hist[1])), strong / weakening bearish, or neutral; an optional colour on bar / momentum
 * disagreement. An extra Tilson T3 line of the MACD is green after the MACD crosses above it and red after a cross
 * below (its first valid bar takes the colour of the current side). Circles at the pane bottom / top mark a bullish
 * bar under bearish momentum / a bearish bar under bullish momentum. Bull / Bear labels mark classic divergences:
 * a pivot low (high) of price lower (higher) than the previous pivot while the MACD at the pivot is higher (lower).
 * Four colour themes.
 * Alerts (alertcondition, `alerts` of the result), each gated by its alert input as the original: MACD / signal
 * crosses (only with the signal line shown), histogram and MACD zero crosses, MACD / extra T3 crosses, the two
 * divergences and the two bar / momentum disagreements.
 *
 * Reference: "Advanced MACD Pro (WhiteStone_Ibrahim) - T3 Themed" by WhiteStone_Ibrahim
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © WhiteStone_Ibrahim
 */

import {
  ta, taCore, callsite, Series, getSourceSeries, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type Theme = 'Default (Current Settings)' | 'Dark Mode' | 'Light Mode' | 'Neon Night';
type SmoothType = 'SMA' | 'EMA' | 'WMA' | 'RMA' | 'T3';

export interface AdvancedMacdProT3ThemedInputs {
  /** Colour theme; 'Default (Current Settings)' uses the colour inputs */
  colorTheme: Theme;
  fastLen: number;
  slowLen: number;
  macdSource: SourceType;
  showSignalLine: boolean;
  signalLen: number;
  signalLineColor: string;
  /** Signal line width (the port keeps the default width) */
  signalLineWidth: number;
  macdPosColor: string;
  macdNegColor: string;
  /** MACD line width (the port keeps the default width) */
  macdLineWidth: number;
  /** Zero line colour input (the Pine zero line uses #ffffff, not this input) */
  zeroLineColor: string;
  colorStrongBull: string;
  colorWeakBull: string;
  colorStrongBear: string;
  colorWeakBear: string;
  colorNeutralHist: string;
  smoothHistActive: boolean;
  smoothHistLen: number;
  smoothHistType: SmoothType;
  smoothHistT3VFactor: number;
  showT3SignalLine: boolean;
  t3SignalLen: number;
  t3SignalVFactor: number;
  t3SignalBullColor: string;
  t3SignalBearColor: string;
  /** T3 line width (the port keeps the default width) */
  t3SignalWidth: number;
  showDisagreementMarkers: boolean;
  disBullMarkerColor: string;
  disBearMarkerColor: string;
  useHistAltColorDisagreement: boolean;
  histAltColorBullDis: string;
  histAltColorBearDis: string;
  showBullDiv: boolean;
  showBearDiv: boolean;
  divPivLeft: number;
  divPivRight: number;
  divBullColor: string;
  divBearColor: string;
  /** Alert settings: the conditions of `alerts` are false while their input is off */
  alertSignalCross: boolean;
  alertHistZeroCross: boolean;
  alertMacdZeroCross: boolean;
  alertBullDiv: boolean;
  alertBearDiv: boolean;
  alertDisagreement: boolean;
  alertT3SignalCrossMacd: boolean;
}

export const defaultInputs: AdvancedMacdProT3ThemedInputs = {
  colorTheme: 'Default (Current Settings)',
  fastLen: 12,
  slowLen: 26,
  macdSource: 'close',
  showSignalLine: false,
  signalLen: 9,
  signalLineColor: color.red,
  signalLineWidth: 1,
  macdPosColor: color.blue,
  macdNegColor: color.orange,
  macdLineWidth: 2,
  zeroLineColor: String(color.new(color.gray, 50)),
  colorStrongBull: String(color.new(color.teal, 30)),
  colorWeakBull: String(color.new(color.teal, 70)),
  colorStrongBear: String(color.new(color.red, 30)),
  colorWeakBear: String(color.new(color.red, 70)),
  colorNeutralHist: String(color.new(color.gray, 50)),
  smoothHistActive: false,
  smoothHistLen: 5,
  smoothHistType: 'EMA',
  smoothHistT3VFactor: 0.7,
  showT3SignalLine: true,
  t3SignalLen: 9,
  t3SignalVFactor: 0.7,
  t3SignalBullColor: color.green,
  t3SignalBearColor: color.red,
  t3SignalWidth: 1,
  showDisagreementMarkers: true,
  disBullMarkerColor: color.green,
  disBearMarkerColor: color.red,
  useHistAltColorDisagreement: false,
  histAltColorBullDis: String(color.new(color.yellow, 40)),
  histAltColorBearDis: String(color.new(color.orange, 40)),
  showBullDiv: true,
  showBearDiv: true,
  divPivLeft: 5,
  divPivRight: 3,
  divBullColor: color.green,
  divBearColor: color.red,
  alertSignalCross: true,
  alertHistZeroCross: true,
  alertMacdZeroCross: false,
  alertBullDiv: true,
  alertBearDiv: true,
  alertDisagreement: false,
  alertT3SignalCrossMacd: false,
};

const G_THEME = 'Color Theme Settings';
const G_MACD = 'MACD Settings';
const G_HIST = 'Histogram Settings';
const G_SMOOTH = 'Histogram Smoothing';
const G_T3 = 'Extra T3 Signal Line';
const G_DIS = 'Bar/Price Disagreement Markers';
const G_DIS_HIST = 'Histogram Color Change on Disagreement';
const G_DIV = 'Classic Divergence Detection';
const G_ALERTS = 'Alert Settings';
const d = defaultInputs;

export const inputConfig: InputConfig[] = [
  { id: 'colorTheme', type: 'string', title: 'Select Color Theme', defval: d.colorTheme, group: G_THEME,
    options: ['Default (Current Settings)', 'Dark Mode', 'Light Mode', 'Neon Night'],
    tooltip: 'Select a general color theme for the indicator. The \'Default\' option uses the individual color settings below.' },
  { id: 'fastLen', type: 'int', title: 'Fast EMA Length', defval: 12, min: 1, group: G_MACD },
  { id: 'slowLen', type: 'int', title: 'Slow EMA Length', defval: 26, min: 1, group: G_MACD },
  { id: 'macdSource', type: 'source', title: 'MACD Source', defval: 'close', group: G_MACD },
  { id: 'showSignalLine', type: 'bool', title: 'Show Signal Line ✅', defval: false, group: G_MACD },
  { id: 'signalLen', type: 'int', title: 'Signal Line EMA Length', defval: 9, min: 1, group: G_MACD },
  { id: 'signalLineColor', type: 'color', title: 'Signal Line Color (Default)', defval: d.signalLineColor, group: G_MACD },
  { id: 'signalLineWidth', type: 'int', title: 'Signal Line Thickness', defval: 1, min: 1, max: 5, group: G_MACD },
  { id: 'macdPosColor', type: 'color', title: 'MACD Positive Value Color (Default)', defval: d.macdPosColor, group: G_MACD },
  { id: 'macdNegColor', type: 'color', title: 'MACD Negative Value Color (Default)', defval: d.macdNegColor, group: G_MACD },
  { id: 'macdLineWidth', type: 'int', title: 'MACD Line Thickness', defval: 2, min: 1, max: 5, group: G_MACD },
  { id: 'zeroLineColor', type: 'color', title: 'Zero Line Color (Default)', defval: d.zeroLineColor, group: G_MACD },
  { id: 'colorStrongBull', type: 'color', title: 'Strong Bullish Hist. Color (Default)', defval: d.colorStrongBull, group: G_HIST },
  { id: 'colorWeakBull', type: 'color', title: 'Weakening Bullish Hist. Color (Default)', defval: d.colorWeakBull, group: G_HIST },
  { id: 'colorStrongBear', type: 'color', title: 'Strong Bearish Hist. Color (Default)', defval: d.colorStrongBear, group: G_HIST },
  { id: 'colorWeakBear', type: 'color', title: 'Weakening Bearish Hist. Color (Default)', defval: d.colorWeakBear, group: G_HIST },
  { id: 'colorNeutralHist', type: 'color', title: 'Neutral Histogram Color (Default)', defval: d.colorNeutralHist, group: G_HIST },
  { id: 'smoothHistActive', type: 'bool', title: 'Smooth Histogram', defval: false, group: G_SMOOTH },
  { id: 'smoothHistLen', type: 'int', title: 'Smoothing Length', defval: 5, min: 1, group: G_SMOOTH },
  { id: 'smoothHistType', type: 'string', title: 'Smoothing Type', defval: 'EMA', options: ['SMA', 'EMA', 'WMA', 'RMA', 'T3'], group: G_SMOOTH },
  { id: 'smoothHistT3VFactor', type: 'float', title: 'Hist. T3 vFactor (Volume Factor)', defval: 0.7, min: 0, max: 1, step: 0.1, group: G_SMOOTH,
    tooltip: 'Volume factor if T3 smoothing is used for the histogram. Usually between 0 and 1.' },
  { id: 'showT3SignalLine', type: 'bool', title: 'Show Extra T3 Signal Line (On MACD)', defval: true, group: G_T3 },
  { id: 't3SignalLen', type: 'int', title: 'T3 Signal Length', defval: 9, min: 1, group: G_T3 },
  { id: 't3SignalVFactor', type: 'float', title: 'T3 Signal vFactor', defval: 0.7, min: 0, max: 1, step: 0.1, group: G_T3 },
  { id: 't3SignalBullColor', type: 'color', title: 'T3 Signal Bullish Color (Default)', defval: d.t3SignalBullColor, group: G_T3 },
  { id: 't3SignalBearColor', type: 'color', title: 'T3 Signal Bearish Color (Default)', defval: d.t3SignalBearColor, group: G_T3 },
  { id: 't3SignalWidth', type: 'int', title: 'T3 Signal Thickness', defval: 1, min: 1, max: 5, group: G_T3 },
  { id: 'showDisagreementMarkers', type: 'bool', title: 'Show Bar/Price Disagreement Markers', defval: true, group: G_DIS },
  { id: 'disBullMarkerColor', type: 'color', title: 'Bullish Marker Color (Below Bar) (Default)', defval: d.disBullMarkerColor, group: G_DIS },
  { id: 'disBearMarkerColor', type: 'color', title: 'Bearish Marker Color (Above Bar) (Default)', defval: d.disBearMarkerColor, group: G_DIS },
  { id: 'useHistAltColorDisagreement', type: 'bool', title: 'Use Alternative Histogram Color on Disagreement', defval: false, group: G_DIS_HIST },
  { id: 'histAltColorBullDis', type: 'color', title: 'Bullish Disagreement Hist. Color (Default)', defval: d.histAltColorBullDis, group: G_DIS_HIST },
  { id: 'histAltColorBearDis', type: 'color', title: 'Bearish Disagreement Hist. Color (Default)', defval: d.histAltColorBearDis, group: G_DIS_HIST },
  { id: 'showBullDiv', type: 'bool', title: 'Show Bullish Divergences', defval: true, group: G_DIV },
  { id: 'showBearDiv', type: 'bool', title: 'Show Bearish Divergences', defval: true, group: G_DIV },
  { id: 'divPivLeft', type: 'int', title: 'Pivot Left Bars (Divergence)', defval: 5, min: 1, group: G_DIV },
  { id: 'divPivRight', type: 'int', title: 'Pivot Right Bars (Divergence)', defval: 3, min: 1, group: G_DIV },
  { id: 'divBullColor', type: 'color', title: 'Bullish Divergence Color (Default)', defval: d.divBullColor, group: G_DIV },
  { id: 'divBearColor', type: 'color', title: 'Bearish Divergence Color (Default)', defval: d.divBearColor, group: G_DIV },
  { id: 'alertSignalCross', type: 'bool', title: 'MACD/Signal Cross Alert', defval: true, group: G_ALERTS,
    tooltip: 'These alerts may continue to work even if the signal line is hidden on the chart. Uncheck this option to completely disable them.' },
  { id: 'alertHistZeroCross', type: 'bool', title: 'Histogram Zero Line Cross Alert', defval: true, group: G_ALERTS },
  { id: 'alertMacdZeroCross', type: 'bool', title: 'MACD Zero Line Cross Alert', defval: false, group: G_ALERTS },
  { id: 'alertBullDiv', type: 'bool', title: 'Bullish Divergence Alert', defval: true, group: G_ALERTS },
  { id: 'alertBearDiv', type: 'bool', title: 'Bearish Divergence Alert', defval: true, group: G_ALERTS },
  { id: 'alertDisagreement', type: 'bool', title: 'Bar/Price Disagreement Alert', defval: false, group: G_ALERTS },
  { id: 'alertT3SignalCrossMacd', type: 'bool', title: 'MACD/Extra T3 Signal Cross Alert', defval: false, group: G_ALERTS },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MACD Line', color: color.blue, lineWidth: 2 },
  { id: 'plot1', title: 'Signal Line', color: color.red, lineWidth: 1 },
  { id: 'plot2', title: 'Extra T3 Signal Line', color: color.green, lineWidth: 1 },
  { id: 'plot3', title: 'MACD Histogram', color: String(color.new(color.gray, 50)), lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'Advanced MACD Pro (WhiteStone_Ibrahim) - T3 Themed',
  shortTitle: 'MACD Pro WSI V8',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

interface ThemeColors {
  macdPos: string; macdNeg: string; signal: string;
  strongBull: string; weakBull: string; strongBear: string; weakBear: string; neutral: string;
  t3Bull: string; t3Bear: string; disBull: string; disBear: string; altBull: string; altBear: string;
  divBull: string; divBear: string;
}

function themeColors(cfg: AdvancedMacdProT3ThemedInputs): ThemeColors | null {
  const N = (c: string, t: number) => String(color.new(c, t));
  switch (cfg.colorTheme) {
    case 'Default (Current Settings)':
      return {
        macdPos: cfg.macdPosColor, macdNeg: cfg.macdNegColor, signal: cfg.signalLineColor,
        strongBull: cfg.colorStrongBull, weakBull: cfg.colorWeakBull, strongBear: cfg.colorStrongBear,
        weakBear: cfg.colorWeakBear, neutral: cfg.colorNeutralHist, t3Bull: cfg.t3SignalBullColor,
        t3Bear: cfg.t3SignalBearColor, disBull: cfg.disBullMarkerColor, disBear: cfg.disBearMarkerColor,
        altBull: cfg.histAltColorBullDis, altBear: cfg.histAltColorBearDis, divBull: cfg.divBullColor,
        divBear: cfg.divBearColor,
      };
    case 'Dark Mode':
      return {
        macdPos: N('#2196F3', 0), macdNeg: N('#FF7043', 0), signal: N('#E91E63', 0),
        strongBull: N(color.teal, 40), weakBull: N(color.teal, 75), strongBear: N(color.red, 40),
        weakBear: N(color.red, 75), neutral: N(color.gray, 60), t3Bull: N(color.lime, 0), t3Bear: N(color.red, 0),
        disBull: N(color.lime, 0), disBear: N(color.red, 0), altBull: N(color.yellow, 50),
        altBear: N(color.orange, 50), divBull: N(color.lime, 0), divBear: N(color.red, 0),
      };
    case 'Light Mode':
      return {
        macdPos: N(color.blue, 0), macdNeg: N(color.orange, 0), signal: N(color.purple, 0),
        strongBull: N(color.green, 20), weakBull: N(color.green, 60), strongBear: N(color.maroon, 20),
        weakBear: N(color.maroon, 60), neutral: N(color.silver, 40), t3Bull: N(color.teal, 0),
        t3Bear: N(color.fuchsia, 0), disBull: N(color.green, 0), disBear: N(color.maroon, 0),
        altBull: N('#FFEB3B', 30), altBear: N('#FF9800', 30), divBull: N(color.green, 0), divBear: N(color.maroon, 0),
      };
    case 'Neon Night':
      return {
        macdPos: N('#00BCD4', 0), macdNeg: N('#FF4081', 0), signal: N('#FDD835', 0),
        strongBull: N('#76FF03', 20), weakBull: N('#76FF03', 60), strongBear: N('#FF1744', 20),
        weakBear: N('#FF1744', 60), neutral: N('#607D8B', 50), t3Bull: N('#00E676', 0), t3Bear: N('#D500F9', 0),
        disBull: N('#76FF03', 0), disBear: N('#FF1744', 0), altBull: N('#FFFF00', 40), altBear: N('#FF6D00', 40),
        divBull: N('#76FF03', 0), divBear: N('#FF1744', 0),
      };
    default:
      // No theme matches: every `var color` stays na
      return null;
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AdvancedMacdProT3ThemedInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const NA = 'transparent';
  const th = themeColors(cfg);
  const c = (k: keyof ThemeColors) => (th ? th[k] : NA);

  // Tilson T3 (coefficient based): six chained EMAs
  const t3 = (src: number[], len: number, v: number) => {
    const lenSafe = Math.max(1, len);
    const e1 = A(ta.ema(S(src), lenSafe));
    const e2 = A(ta.ema(S(e1), lenSafe));
    const e3 = A(ta.ema(S(e2), lenSafe));
    const e4 = A(ta.ema(S(e3), lenSafe));
    const e5 = A(ta.ema(S(e4), lenSafe));
    const e6 = A(ta.ema(S(e5), lenSafe));
    const c1 = -v * v * v;
    const c2 = 3 * v * v + 3 * v * v * v;
    const c3 = -6 * v * v - 3 * v - 3 * v * v * v;
    const c4 = 1 + 3 * v + 3 * v * v + v * v * v;
    return e6.map((_x, i) => c1 * e6[i] + c2 * e5[i] + c3 * e4[i] + c4 * e3[i]);
  };
  // Moving average selector (length > 0 always holds with minval 1)
  const fMa = (src: number[], len: number, type: SmoothType, v: number): number[] => {
    if (!(len > 0)) return src.map(() => NaN);
    switch (type) {
      case 'SMA': return A(ta.sma(S(src), len));
      case 'EMA': return A(ta.ema(S(src), len));
      case 'WMA': return A(ta.wma(S(src), len));
      case 'RMA': return A(ta.rma(S(src), len));
      case 'T3': return t3(src, len, v);
      default: return src.map(() => NaN);
    }
  };

  // MACD
  const srcS = getSourceSeries(bars, cfg.macdSource);
  const fastMa = A(ta.ema(srcS, cfg.fastLen));
  const slowMa = A(ta.ema(srcS, cfg.slowLen));
  const macd = fastMa.map((f, i) => f - slowMa[i]);
  const signal = A(ta.ema(S(macd), cfg.signalLen));
  const rawHist = macd.map((m, i) => m - signal[i]);
  let hist = rawHist;
  if (cfg.smoothHistActive) {
    const sm = fMa(rawHist, cfg.smoothHistLen, cfg.smoothHistType, cfg.smoothHistT3VFactor);
    hist = sm.map((v, i) => (Number.isFinite(v) ? v : rawHist[i])); // nz(f_ma(...), raw_hist)
  }

  // Extra T3 signal line (var: stays na when hidden)
  const t3Line = cfg.showT3SignalLine ? t3(macd, cfg.t3SignalLen, cfg.t3SignalVFactor) : macd.map(() => NaN);

  // T3 line colour: set on the first valid bar, then changed only on crosses (ta.crossover / crossunder run inside
  // the else branch: their history is the bars of that branch)
  const t3Color: string[] = new Array(n);
  const t3CrossUp = callsite.crossover();
  const t3CrossDown = callsite.crossunder();
  let t3Var = c('t3Bull'); // var t3_plot_color_var = c_t3_bull
  for (let i = 0; i < n; i++) {
    if (cfg.showT3SignalLine && !isNaN(macd[i]) && !isNaN(t3Line[i])) {
      const firstOrAfterNa = i === 0 || isNaN(macd[i - 1]) || isNaN(t3Line[i - 1]);
      const above = gt(macd[i], t3Line[i]);
      if (firstOrAfterNa) {
        t3Var = above ? c('t3Bull') : c('t3Bear');
      } else {
        const up = t3CrossUp(macd[i], t3Line[i]);
        const down = t3CrossDown(macd[i], t3Line[i]);
        if (up) t3Var = c('t3Bull');
        else if (down) t3Var = c('t3Bear');
      }
    } else {
      t3Var = NA;
    }
    t3Color[i] = t3Var;
  }

  // Histogram colour
  const bullMom = macd.map((m, i) => gt(m, signal[i]));
  const bearMom = macd.map((m, i) => gt(signal[i], m));
  const histColor: string[] = new Array(n);
  const bullDis: boolean[] = new Array(n);
  const bearDis: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = i > 0 && !isNaN(hist[i - 1]) ? hist[i - 1] : 0; // nz(hist[1])
    const inc = gt(hist[i], prev);
    const dec = gt(prev, hist[i]);
    let hc: string;
    if (bullMom[i] && inc) hc = c('strongBull');
    else if (bullMom[i] && dec) hc = c('weakBull');
    else if (bearMom[i] && dec) hc = c('strongBear');
    else if (bearMom[i] && inc) hc = c('weakBear');
    else hc = c('neutral');
    const b = bars[i];
    bullDis[i] = bearMom[i] && gt(b.close, b.open);
    bearDis[i] = bullMom[i] && gt(b.open, b.close);
    if (cfg.useHistAltColorDisagreement) {
      if (bullDis[i]) hc = c('altBull');
      if (bearDis[i]) hc = c('altBear');
    }
    histColor[i] = hc;
  }

  // Classic divergences: pivots of price, MACD at the pivot bar; ta.valuewhen runs only on the pivot bars
  const right = cfg.divPivRight;
  const pl = A(ta.pivotlow(S(bars.map((b) => b.low)), cfg.divPivLeft, right));
  const ph = A(ta.pivothigh(S(bars.map((b) => b.high)), cfg.divPivLeft, right));
  const macdAtPivot = macd.map((_m, i) => (i - right >= 0 ? macd[i - right] : NaN)); // macd_line[div_piv_right]
  const bool = (x: number) => !isNaN(x) && x !== 0; // bool(float): false for na and 0
  const prevAtPivot = (piv: number[], src: number[]) => callsite.whenCalled(
    piv.map((p) => !isNaN(p)), (p, s) => taCore.valuewhen(p.map(bool), s, 1), piv, src) as number[];
  const plPrev = prevAtPivot(pl, pl);
  const plMacdPrev = prevAtPivot(pl, macdAtPivot);
  const phPrev = prevAtPivot(ph, ph);
  const phMacdPrev = prevAtPivot(ph, macdAtPivot);
  const bullDiv = pl.map((p, i) => !isNaN(p) && gt(plPrev[i], p) && gt(macdAtPivot[i], plMacdPrev[i]));
  const bearDiv = ph.map((p, i) => !isNaN(p) && gt(p, phPrev[i]) && gt(phMacdPrev[i], macdAtPivot[i]));

  // Plots
  const t = (i: number) => bars[i].time;
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const plot0 = bars.map((_b, i) => ({
    time: t(i), value: fin(macd[i]), color: ge(macd[i], 0) ? c('macdPos') : c('macdNeg'),
  }));
  const plot1 = bars.map((_b, i) => ({
    time: t(i), value: cfg.showSignalLine ? fin(signal[i]) : NaN, color: c('signal'),
  }));
  const plot2 = bars.map((_b, i) => ({
    time: t(i), value: cfg.showT3SignalLine ? fin(t3Line[i]) : NaN, color: cfg.showT3SignalLine ? t3Color[i] : NA,
  }));
  const plot3 = bars.map((_b, i) => ({ time: t(i), value: fin(hist[i]), color: histColor[i] }));

  // Markers, in the plotshape order of each bar
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    if (cfg.showDisagreementMarkers && bullDis[i]) {
      markers.push({ time: t(i), position: 'bottom', shape: 'circle', color: c('disBull'), size: 'tiny' });
    }
    if (cfg.showDisagreementMarkers && bearDis[i]) {
      markers.push({ time: t(i), position: 'top', shape: 'circle', color: c('disBear'), size: 'tiny' });
    }
    // plotshape(show_bull_div and bull_div_signal ? low[div_piv_right] * 0.995 : na, location.bottom, ...): the
    // value only decides if the shape is drawn (a pivot bar always has low[div_piv_right])
    if (cfg.showBullDiv && bullDiv[i]) {
      markers.push({ time: t(i), position: 'bottom', shape: 'labelUp', color: c('divBull'), size: 'small',
        text: 'Bull', textColor: color.white });
    }
    if (cfg.showBearDiv && bearDiv[i]) {
      markers.push({ time: t(i), position: 'top', shape: 'labelDown', color: c('divBear'), size: 'small',
        text: 'Bear', textColor: color.white });
    }
  }

  // Alerts. var macd_cross_above_t3_signal / below: ta.crossover / crossunder run only on the bars where the T3 line
  // is shown and both values exist (their history is those bars); the flags keep their value on the other bars
  const t3AlertUp = callsite.crossover();
  const t3AlertDown = callsite.crossunder();
  const t3Above: boolean[] = new Array(n);
  const t3Below: boolean[] = new Array(n);
  let aboveVar = false;
  let belowVar = false;
  for (let i = 0; i < n; i++) {
    if (cfg.showT3SignalLine && !isNaN(t3Line[i]) && !isNaN(macd[i])) {
      aboveVar = !!t3AlertUp(macd[i], t3Line[i]);
      belowVar = !!t3AlertDown(macd[i], t3Line[i]);
    }
    t3Above[i] = aboveVar;
    t3Below[i] = belowVar;
  }
  const gate = (on: boolean, f: boolean[]) => f.map((v) => on && v);
  const sigOn = cfg.alertSignalCross && cfg.showSignalLine;
  const alertFlags = [
    gate(sigOn, crossedOver(macd, signal)), gate(sigOn, crossedUnder(macd, signal)),
    gate(cfg.alertHistZeroCross, crossedOver(hist, 0)), gate(cfg.alertHistZeroCross, crossedUnder(hist, 0)),
    gate(cfg.alertMacdZeroCross, crossedOver(macd, 0)), gate(cfg.alertMacdZeroCross, crossedUnder(macd, 0)),
    gate(cfg.alertT3SignalCrossMacd, t3Above), gate(cfg.alertT3SignalCrossMacd, t3Below),
    gate(cfg.alertBullDiv, bullDiv), gate(cfg.alertBearDiv, bearDiv),
    gate(cfg.alertDisagreement, bullDis), gate(cfg.alertDisagreement, bearDis),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: '#ffffff', linestyle: 'dashed', linewidth: 1 } }],
    markers,
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'MACD Crossed Above Signal', message: 'MACD ({{plot("MACD Line")}}) crossed above signal line ({{plot("Signal Line")}}). Value: {{plot("MACD Line")["0"]}}' },
  { id: 'alert1', title: 'MACD Crossed Below Signal', message: 'MACD ({{plot("MACD Line")}}) crossed below signal line ({{plot("Signal Line")}}). Value: {{plot("MACD Line")["0"]}}' },
  { id: 'alert2', title: 'MACD Histogram Crossed Above Zero', message: 'MACD Histogram ({{plot("MACD Histogram")}}) crossed above zero line. Value: {{plot("MACD Histogram")["0"]}}' },
  { id: 'alert3', title: 'MACD Histogram Crossed Below Zero', message: 'MACD Histogram ({{plot("MACD Histogram")}}) crossed below zero line. Value: {{plot("MACD Histogram")["0"]}}' },
  { id: 'alert4', title: 'MACD Crossed Above Zero', message: 'MACD Line ({{plot("MACD Line")}}) crossed above zero line. Value: {{plot("MACD Line")["0"]}}' },
  { id: 'alert5', title: 'MACD Crossed Below Zero', message: 'MACD Line ({{plot("MACD Line")}}) crossed below zero line. Value: {{plot("MACD Line")["0"]}}' },
  { id: 'alert6', title: 'MACD Crossed Above Extra T3 Signal', message: 'MACD ({{plot("MACD Line")}}) crossed above extra T3 signal line ({{plot("Extra T3 Signal Line")}}). Value: {{plot("MACD Line")["0"]}}' },
  { id: 'alert7', title: 'MACD Crossed Below Extra T3 Signal', message: 'MACD ({{plot("MACD Line")}}) crossed below extra T3 signal line ({{plot("Extra T3 Signal Line")}}). Value: {{plot("MACD Line")["0"]}}' },
  { id: 'alert8', title: 'Bullish MACD Divergence Detected', message: 'Bullish Divergence detected between Price (LL) and MACD Line (HL).' },
  { id: 'alert9', title: 'Bearish MACD Divergence Detected', message: 'Bearish Divergence detected between Price (HH) and MACD Line (LH).' },
  { id: 'alert10', title: 'Bullish Bar/Price Disagreement (MACD)', message: 'Price bar is bullish while MACD momentum is bearish (MACD<Signal).' },
  { id: 'alert11', title: 'Bearish Bar/Price Disagreement (MACD)', message: 'Price bar is bearish while MACD momentum is bullish (MACD>Signal).' },
];

export const AdvancedMacdProT3Themed = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
