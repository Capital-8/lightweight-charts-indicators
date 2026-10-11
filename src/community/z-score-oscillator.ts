/**
 * Z-Score Oscillator
 *
 * Z-score of the source over a rolling window (mean / sample standard deviation, or median / MAD * 1.4826; 0 when
 * the dispersion is not positive), optionally smoothed (ALMA, LinReg, Hull MA, Super Smoother, Two-Pole Gaussian).
 * Percentile thresholds of the z-score (single lookback, or a weighted blend of three lookbacks) give the upper and
 * lower levels. Three display modes: Oscillator (z-score scaled so the thresholds are +-100, clipped to the extreme
 * clip), Z-Score (raw z-score with gradient threshold lines) and Percentile Rank (percent rank of the z-score - 50).
 * Fills, a three-layer glow and an optional background tint mark the overbought / oversold territory; the main line
 * has a gradient (or sign) colour, more opaque when it moves away from zero. Optional pivot divergences between price
 * and the displayed value (regular and hidden) with Bull / Bear labels.
 *
 * Last bar: with 'Delay Plot Until Candle Closes' a divergence is not drawn on an open bar. The port reads the state
 * of the last bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as
 * closed.
 *
 * Reference: "Z-Score Oscillator" by B3AR_Trades
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export type ZScoreTheme = 'Modern' | 'Classic' | 'Neon' | 'Monochrome' | 'Sunset' | 'Ocean';
export type ZScoreDisplayMode = 'Oscillator' | 'Z-Score' | 'Percentile Rank';
export type ZScoreCalcMethod = 'Mean / StDev' | 'Median / MAD';
export type ZScoreSmoothing = 'ALMA' | 'LinReg' | 'Hull MA' | 'Super Smoother' | 'Two-Pole Gaussian';

export interface ZScoreOscillatorInputs {
  /** Colour palette */
  themeChoice: ZScoreTheme;
  /** Gradient colour of the main line (else a colour by sign) */
  useGradient: boolean;
  /** Fill between the main line and the band in overbought / oversold territory */
  showObOsFill: boolean;
  /** Glow around the main line in overbought / oversold territory */
  showGlow: boolean;
  /** Background tint in overbought / oversold territory */
  showBgTint: boolean;
  /** Display mode */
  displayMode: ZScoreDisplayMode;
  /** Oscillator mode: clip of the value */
  extremeClip: number;
  /** Location / dispersion estimates */
  calcMethod: ZScoreCalcMethod;
  /** Rolling window of the location and dispersion */
  rollingWindow: number;
  /** Percentile lookback (single threshold and percent rank window) */
  pctLookback: number;
  /** Upper percentile */
  pctUpper: number;
  /** Lower percentile */
  pctLower: number;
  /** Blend the thresholds of three lookbacks */
  mpEnabled: boolean;
  mpPeriodS: number;
  mpPeriodM: number;
  mpPeriodL: number;
  mpWeightS: number;
  mpWeightM: number;
  mpWeightL: number;
  /** Smooth the z-score */
  smthEnabled: boolean;
  smthType: ZScoreSmoothing;
  smthLength: number;
  almaOffset: number;
  almaSigma: number;
  /** Divergence detection */
  divEnabled: boolean;
  /** Pivot lookback right */
  divLbR: number;
  /** Pivot lookback left */
  divLbL: number;
  /** Max bars between two pivots */
  divRangeUpper: number;
  /** Min bars between two pivots */
  divRangeLower: number;
  divPlotBull: boolean;
  divPlotBear: boolean;
  divPlotHidBull: boolean;
  divPlotHidBear: boolean;
  /** Delay the divergences until the candle closes (only changes the last bar, when it is still open) */
  divNoRepaint: boolean;
  /** Source */
  src: SourceType;
}

export const defaultInputs: ZScoreOscillatorInputs = {
  themeChoice: 'Modern',
  useGradient: true,
  showObOsFill: true,
  showGlow: true,
  showBgTint: false,
  displayMode: 'Oscillator',
  extremeClip: 150.0,
  calcMethod: 'Mean / StDev',
  rollingWindow: 80,
  pctLookback: 200,
  pctUpper: 95.0,
  pctLower: 5.0,
  mpEnabled: true,
  mpPeriodS: 50,
  mpPeriodM: 100,
  mpPeriodL: 200,
  mpWeightS: 1.0,
  mpWeightM: 1.0,
  mpWeightL: 1.0,
  smthEnabled: true,
  smthType: 'Hull MA',
  smthLength: 5,
  almaOffset: 0.85,
  almaSigma: 6.0,
  divEnabled: false,
  divLbR: 5,
  divLbL: 5,
  divRangeUpper: 60,
  divRangeLower: 5,
  divPlotBull: true,
  divPlotBear: true,
  divPlotHidBull: false,
  divPlotHidBear: false,
  divNoRepaint: false,
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'themeChoice', type: 'string', title: 'Theme', defval: 'Modern', options: ['Modern', 'Classic', 'Neon', 'Monochrome', 'Sunset', 'Ocean'] },
  { id: 'useGradient', type: 'bool', title: 'Gradient Line Coloring', defval: true },
  { id: 'showObOsFill', type: 'bool', title: 'OB/OS Color Fill', defval: true },
  { id: 'showGlow', type: 'bool', title: 'Glow Effect on Extremes', defval: true },
  { id: 'showBgTint', type: 'bool', title: 'Background Tint on Extremes', defval: false },
  { id: 'displayMode', type: 'string', title: 'Mode', defval: 'Oscillator', options: ['Oscillator', 'Z-Score', 'Percentile Rank'] },
  { id: 'extremeClip', type: 'float', title: 'Extreme Clip', defval: 150.0, min: 100.0, max: 300.0, step: 10.0 },
  { id: 'calcMethod', type: 'string', title: 'Calculation Method', defval: 'Mean / StDev', options: ['Mean / StDev', 'Median / MAD'] },
  { id: 'rollingWindow', type: 'int', title: 'Rolling Window', defval: 80, min: 10, max: 500, step: 1 },
  { id: 'pctLookback', type: 'int', title: 'Percentile Lookback', defval: 200, min: 20, max: 2000, step: 10 },
  { id: 'pctUpper', type: 'float', title: 'Upper Percentile', defval: 95.0, min: 50.0, max: 99.0, step: 0.5 },
  { id: 'pctLower', type: 'float', title: 'Lower Percentile', defval: 5.0, min: 1.0, max: 50.0, step: 0.5 },
  { id: 'mpEnabled', type: 'bool', title: 'Enable Multi-Period Blend', defval: true },
  { id: 'mpPeriodS', type: 'int', title: 'Short Period', defval: 50, min: 10, max: 500, step: 5 },
  { id: 'mpPeriodM', type: 'int', title: 'Medium Period', defval: 100, min: 10, max: 1000, step: 10 },
  { id: 'mpPeriodL', type: 'int', title: 'Long Period', defval: 200, min: 20, max: 2000, step: 10 },
  { id: 'mpWeightS', type: 'float', title: 'Short Weight', defval: 1.0, min: 0.0, max: 5.0, step: 0.1 },
  { id: 'mpWeightM', type: 'float', title: 'Medium Weight', defval: 1.0, min: 0.0, max: 5.0, step: 0.1 },
  { id: 'mpWeightL', type: 'float', title: 'Long Weight', defval: 1.0, min: 0.0, max: 5.0, step: 0.1 },
  { id: 'smthEnabled', type: 'bool', title: 'Enable Smoothing', defval: true },
  { id: 'smthType', type: 'string', title: 'Smoothing Type', defval: 'Hull MA', options: ['ALMA', 'LinReg', 'Hull MA', 'Super Smoother', 'Two-Pole Gaussian'] },
  { id: 'smthLength', type: 'int', title: 'Smoothing Length', defval: 5, min: 2, max: 50, step: 1 },
  { id: 'almaOffset', type: 'float', title: 'ALMA Offset', defval: 0.85, min: 0.0, max: 1.0, step: 0.05 },
  { id: 'almaSigma', type: 'float', title: 'ALMA Sigma', defval: 6.0, min: 1.0, max: 20.0, step: 0.5 },
  { id: 'divEnabled', type: 'bool', title: 'Enable Divergence Detection', defval: false },
  { id: 'divLbR', type: 'int', title: 'Pivot Lookback Right', defval: 5, min: 1, max: 20, step: 1 },
  { id: 'divLbL', type: 'int', title: 'Pivot Lookback Left', defval: 5, min: 1, max: 20, step: 1 },
  { id: 'divRangeUpper', type: 'int', title: 'Max of Lookback Range', defval: 60, min: 10, max: 200, step: 5 },
  { id: 'divRangeLower', type: 'int', title: 'Min of Lookback Range', defval: 5, min: 1, max: 50, step: 1 },
  { id: 'divPlotBull', type: 'bool', title: 'Plot Regular Bullish', defval: true },
  { id: 'divPlotBear', type: 'bool', title: 'Plot Regular Bearish', defval: true },
  { id: 'divPlotHidBull', type: 'bool', title: 'Plot Hidden Bullish', defval: false },
  { id: 'divPlotHidBear', type: 'bool', title: 'Plot Hidden Bearish', defval: false },
  { id: 'divNoRepaint', type: 'bool', title: 'Delay Plot Until Candle Closes (No Repaint)', defval: false },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
];

interface Palette { bull: string; bear: string; neutral: string; accent: string }

const THEMES: Record<ZScoreTheme, Palette> = {
  Modern: { bull: color.rgb(0, 255, 255), bear: color.rgb(255, 0, 0), neutral: color.rgb(180, 180, 180), accent: color.rgb(17, 99, 246) },
  Classic: { bull: color.rgb(0, 230, 118), bear: color.rgb(244, 67, 54), neutral: color.rgb(160, 160, 160), accent: color.rgb(255, 235, 59) },
  Neon: { bull: color.rgb(57, 255, 20), bear: color.rgb(255, 20, 147), neutral: color.rgb(120, 120, 200), accent: color.rgb(0, 191, 255) },
  Monochrome: { bull: color.rgb(240, 240, 240), bear: color.rgb(90, 90, 90), neutral: color.rgb(160, 160, 160), accent: color.rgb(200, 200, 200) },
  Sunset: { bull: color.rgb(255, 200, 87), bear: color.rgb(199, 62, 89), neutral: color.rgb(180, 140, 140), accent: color.rgb(255, 87, 51) },
  Ocean: { bull: color.rgb(100, 220, 255), bear: color.rgb(20, 80, 180), neutral: color.rgb(140, 160, 200), accent: color.rgb(0, 191, 255) },
};

const D = THEMES.Modern;
const NONE = 'transparent';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Regular Bullish', color: D.bull, lineWidth: 2 },
  { id: 'plot1', title: 'Hidden Bullish', color: String(color.new(D.bull, 70)), lineWidth: 2 },
  { id: 'plot2', title: 'Regular Bearish', color: D.bear, lineWidth: 2 },
  { id: 'plot3', title: 'Hidden Bearish', color: String(color.new(D.bear, 70)), lineWidth: 2 },
  { id: 'plot4', title: 'Zero Line', color: D.accent, lineWidth: 1 },
  { id: 'plot5', title: 'Upper Band (+100)', color: String(color.new(D.bear, 30)), lineWidth: 1 },
  { id: 'plot6', title: 'Lower Band (-100)', color: String(color.new(D.bull, 30)), lineWidth: 1 },
  { id: 'plot7', title: 'Extreme Upper', color: String(color.new(D.bear, 70)), lineWidth: 1, style: 'circles' },
  { id: 'plot8', title: 'Extreme Lower', color: String(color.new(D.bull, 70)), lineWidth: 1, style: 'circles' },
  { id: 'plot9', title: 'Rank Upper Band', color: String(color.new(D.bear, 30)), lineWidth: 1 },
  { id: 'plot10', title: 'Rank Lower Band', color: String(color.new(D.bull, 30)), lineWidth: 1 },
  { id: 'plot11', title: 'Rank Max (+50)', color: String(color.new(D.bear, 70)), lineWidth: 1, style: 'circles' },
  { id: 'plot12', title: 'Rank Min (-50)', color: String(color.new(D.bull, 70)), lineWidth: 1, style: 'circles' },
  { id: 'plot13', title: 'Upper Threshold', color: D.bear, lineWidth: 2 },
  { id: 'plot14', title: 'Lower Threshold', color: D.bull, lineWidth: 2 },
  { id: 'plot15', title: 'Active Overbought', color: NONE, lineWidth: 1 },
  { id: 'plot16', title: 'Active Oversold', color: NONE, lineWidth: 1 },
  { id: 'plot17', title: 'Upper Level', color: NONE, lineWidth: 1 },
  { id: 'plot18', title: 'Lower Level', color: NONE, lineWidth: 1 },
  { id: 'plot19', title: 'Glow Outer', color: String(color.new(D.bear, 92)), lineWidth: 12, style: 'linebr' },
  { id: 'plot20', title: 'Glow Middle', color: String(color.new(D.bear, 85)), lineWidth: 8, style: 'linebr' },
  { id: 'plot21', title: 'Glow Inner', color: String(color.new(D.bear, 70)), lineWidth: 5, style: 'linebr' },
  { id: 'plot22', title: 'Value', color: D.bull, lineWidth: 3 },
];

/** fill(p_active_ob, p_level_ob) / fill(p_active_os, p_level_os) with the default inputs */
export const fillConfig: FillConfig[] = [
  { id: 'fill_ob', plot1: 'plot15', plot2: 'plot17', color: String(color.new(D.bear, 70)), title: 'Overbought Zone Fill' },
  { id: 'fill_os', plot1: 'plot16', plot2: 'plot18', color: String(color.new(D.bull, 70)), title: 'Oversold Zone Fill' },
];

export const metadata = {
  title: 'Z-Score Oscillator',
  shortTitle: 'Z-Score',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<ZScoreOscillatorInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const th = THEMES[cfg.themeChoice] ?? THEMES.Modern;
  const srcSeries = getSourceSeries(bars, cfg.src);
  const src = A(srcSeries);

  // Location and dispersion
  let location: number[];
  let dispersion: number[];
  if (cfg.calcMethod === 'Mean / StDev') {
    location = A(ta.sma(srcSeries, cfg.rollingWindow));
    dispersion = A(ta.stdev(srcSeries, cfg.rollingWindow, false));
  } else {
    location = A(ta.percentile_linear_interpolation(srcSeries, cfg.rollingWindow, 50.0));
    const absDev = src.map((s, i) => Math.abs(s - location[i]));
    dispersion = A(ta.percentile_linear_interpolation(S(absDev), cfg.rollingWindow, 50.0)).map((v) => v * 1.4826);
  }
  // z_raw = dispersion > 0 ? (src - location_est) / dispersion : 0.0
  const zRaw = src.map((s, i) => (gt(dispersion[i], 0) ? (s - location[i]) / dispersion[i] : 0.0));

  // Smoothing
  const len = cfg.smthLength;
  let zScore: number[];
  if (!cfg.smthEnabled) {
    zScore = zRaw;
  } else if (cfg.smthType === 'ALMA') {
    zScore = A(ta.alma(S(zRaw), len, cfg.almaOffset, cfg.almaSigma));
  } else if (cfg.smthType === 'LinReg') {
    zScore = A(ta.linreg(S(zRaw), len, 0));
  } else if (cfg.smthType === 'Hull MA') {
    zScore = A(ta.hma(S(zRaw), len));
  } else if (cfg.smthType === 'Super Smoother') {
    const a1 = Math.exp((-Math.sqrt(2) * Math.PI) / len);
    const b1 = 2 * a1 * Math.cos((Math.sqrt(2) * Math.PI) / len);
    const c2 = b1;
    const c3 = -a1 * a1;
    const c1 = 1 - c2 - c3;
    zScore = new Array(n);
    for (let i = 0; i < n; i++) {
      // ss := c1 * (s + nz(s[1])) / 2 + c2 * nz(ss[1]) + c3 * nz(ss[2])
      const s1 = i >= 1 ? zRaw[i - 1] : 0;
      const ss1 = i >= 1 ? zScore[i - 1] : 0;
      const ss2 = i >= 2 ? zScore[i - 2] : 0;
      zScore[i] = (c1 * (zRaw[i] + nz(s1))) / 2 + c2 * nz(ss1) + c3 * nz(ss2);
    }
  } else if (cfg.smthType === 'Two-Pole Gaussian') {
    const beta = (1 - Math.cos((2 * Math.PI) / len)) / (Math.pow(Math.sqrt(2), 2 / 2) - 1);
    const alpha = -beta + Math.sqrt(beta * beta + 2 * beta);
    zScore = new Array(n);
    for (let i = 0; i < n; i++) {
      // g := alpha^2 * s + 2 * (1 - alpha) * nz(g[1]) - (1 - alpha)^2 * nz(g[2])
      const g1 = i >= 1 ? zScore[i - 1] : 0;
      const g2 = i >= 2 ? zScore[i - 2] : 0;
      zScore[i] = Math.pow(alpha, 2) * zRaw[i] + 2 * (1 - alpha) * nz(g1) - Math.pow(1 - alpha, 2) * nz(g2);
    }
  } else {
    zScore = zRaw;
  }
  const zSeries = S(zScore);

  // Percentile thresholds (z-score units)
  const pct = (length: number, p: number) => A(ta.percentile_linear_interpolation(zSeries, length, p));
  const upSingle = pct(cfg.pctLookback, cfg.pctUpper);
  const loSingle = pct(cfg.pctLookback, cfg.pctLower);
  const upS = pct(cfg.mpPeriodS, cfg.pctUpper);
  const upM = pct(cfg.mpPeriodM, cfg.pctUpper);
  const upL = pct(cfg.mpPeriodL, cfg.pctUpper);
  const loS = pct(cfg.mpPeriodS, cfg.pctLower);
  const loM = pct(cfg.mpPeriodM, cfg.pctLower);
  const loL = pct(cfg.mpPeriodL, cfg.pctLower);
  const wS = cfg.mpWeightS;
  const wM = cfg.mpWeightM;
  const wL = cfg.mpWeightL;
  const weightSum = wS + wM + wL;
  const zUpper = zScore.map((_z, i) => {
    const blend = gt(weightSum, 0) ? (upS[i] * wS + upM[i] * wM + upL[i] * wL) / weightSum : upSingle[i];
    return cfg.mpEnabled ? blend : upSingle[i];
  });
  const zLower = zScore.map((_z, i) => {
    const blend = gt(weightSum, 0) ? (loS[i] * wS + loM[i] * wM + loL[i] * wL) / weightSum : loSingle[i];
    return cfg.mpEnabled ? blend : loSingle[i];
  });

  // Oscillator normalisation
  const oscillator = zScore.map((z, i) => {
    let oscRaw = 0.0;
    if (ge(z, 0) && gt(zUpper[i], 0)) oscRaw = (z / zUpper[i]) * 100.0;
    else if (lt(z, 0) && lt(zLower[i], 0)) oscRaw = (z / Math.abs(zLower[i])) * 100.0;
    return Math.max(Math.min(oscRaw, cfg.extremeClip), -cfg.extremeClip);
  });

  // Percentile rank, centred on zero
  const pctRank = A(ta.percentrank(zSeries, cfg.pctLookback)).map((v) => v - 50.0);
  const pctRankUpper = cfg.pctUpper - 50.0;
  const pctRankLower = cfg.pctLower - 50.0;

  const isOsc = cfg.displayMode === 'Oscillator';
  const isPct = cfg.displayMode === 'Percentile Rank';
  const isZsc = cfg.displayMode === 'Z-Score';
  const main = isOsc ? oscillator : isPct ? pctRank : zScore;
  const upperLevel = zScore.map((_z, i) => (isOsc ? 100.0 : isPct ? pctRankUpper : zUpper[i]));
  const lowerLevel = zScore.map((_z, i) => (isOsc ? -100.0 : isPct ? pctRankLower : zLower[i]));
  const inOb = main.map((m, i) => ge(m, upperLevel[i]));
  const inOs = main.map((m, i) => le(m, lowerLevel[i]));

  // Divergence detection
  const lbR = cfg.divLbR;
  const pivotLow = A(ta.pivotlow(S(main), cfg.divLbL, lbR));
  const pivotHigh = A(ta.pivothigh(S(main), cfg.divLbL, lbR));
  const plFound = pivotLow.map((v) => !isNaN(v));
  const phFound = pivotHigh.map((v) => !isNaN(v));
  const mainR = (i: number) => (i - lbR >= 0 ? main[i - lbR] : NaN);
  const bullCond: boolean[] = new Array(n).fill(false);
  const hidBullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  const hidBearCond: boolean[] = new Array(n).fill(false);
  {
    // ta.barssince(plFound[1]) / ta.barssince(phFound[1]): na until the first true
    let sincePl = NaN;
    let sincePh = NaN;
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plMain: number[] = [];
    const plPrice: number[] = [];
    const phMain: number[] = [];
    const phPrice: number[] = [];
    for (let i = 0; i < n; i++) {
      // repaint = not div_no_repaint or barstate.ishistory or barstate.isconfirmed: false only on an open last bar
      const repaint = !cfg.divNoRepaint || barIsConfirmed(i);
      const prevPl = i > 0 && plFound[i - 1];
      const prevPh = i > 0 && phFound[i - 1];
      sincePl = prevPl ? 0 : isNaN(sincePl) ? NaN : sincePl + 1;
      sincePh = prevPh ? 0 : isNaN(sincePh) ? NaN : sincePh + 1;
      const inRangePl = cfg.divRangeLower <= sincePl && sincePl <= cfg.divRangeUpper;
      const inRangePh = cfg.divRangeLower <= sincePh && sincePh <= cfg.divRangeUpper;
      const m = mainR(i);
      const lowR = i - lbR >= 0 ? bars[i - lbR].low : NaN;
      const highR = i - lbR >= 0 ? bars[i - lbR].high : NaN;
      if (plFound[i]) {
        plMain.push(m);
        plPrice.push(lowR);
      }
      if (phFound[i]) {
        phMain.push(m);
        phPrice.push(highR);
      }
      const prevPlMain = plMain.length >= 2 ? plMain[plMain.length - 2] : NaN;
      const prevPlPrice = plPrice.length >= 2 ? plPrice[plPrice.length - 2] : NaN;
      const prevPhMain = phMain.length >= 2 ? phMain[phMain.length - 2] : NaN;
      const prevPhPrice = phPrice.length >= 2 ? phPrice[phPrice.length - 2] : NaN;

      const oscHL = gt(m, prevPlMain) && inRangePl;
      const priceLL = lt(lowR, prevPlPrice);
      bullCond[i] = cfg.divEnabled && cfg.divPlotBull && priceLL && oscHL && plFound[i] && repaint;
      const oscLL = lt(m, prevPlMain) && inRangePl;
      const priceHL = gt(lowR, prevPlPrice);
      hidBullCond[i] = cfg.divEnabled && cfg.divPlotHidBull && priceHL && oscLL && plFound[i] && repaint;
      const oscLH = lt(m, prevPhMain) && inRangePh;
      const priceHH = gt(highR, prevPhPrice);
      bearCond[i] = cfg.divEnabled && cfg.divPlotBear && priceHH && oscLH && phFound[i] && repaint;
      const oscHH = gt(m, prevPhMain) && inRangePh;
      const priceLH = lt(highR, prevPhPrice);
      hidBearCond[i] = cfg.divEnabled && cfg.divPlotHidBear && priceLH && oscHH && phFound[i] && repaint;
    }
  }

  const interval = barInterval(bars);
  const t = (i: number) => bars[i].time;
  const P = (f: (i: number) => Point | null): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p = f(i);
      if (p) out.push(p);
    }
    return out;
  };
  const hidBull = String(color.new(th.bull, 70));
  const hidBear = String(color.new(th.bear, 70));
  const divNone = String(color.new(color.white, 100));
  // plot(div_enabled and found ? main_value[div_lbR] : na, offset = -div_lbR): the value of bar i is drawn on bar i - lbR
  const divPlot = (found: boolean[], cond: boolean[], col: string) => P((i) => (i - lbR < 0 ? null : {
    time: barTime(bars, i - lbR, interval),
    value: cfg.divEnabled && found[i] ? mainR(i) : NaN,
    color: cond[i] ? col : divNone,
  }));

  const markers: MarkerData[] = [];
  const textColor = color.white;
  for (let i = lbR; i < n; i++) {
    const price = mainR(i);
    if (isNaN(price)) continue;
    const time = barTime(bars, i - lbR, interval);
    // plotshape(cond ? main_value[div_lbR] : na, offset = -div_lbR, style = shape.labelup / labeldown, location.absolute)
    if (bullCond[i]) markers.push({ time, position: 'atPriceBottom', price, shape: 'labelUp', color: th.bull, text: ' Bull ', textColor });
    if (hidBullCond[i]) markers.push({ time, position: 'atPriceBottom', price, shape: 'labelUp', color: th.bull, text: ' H Bull ', textColor });
    if (bearCond[i]) markers.push({ time, position: 'atPriceTop', price, shape: 'labelDown', color: th.bear, text: ' Bear ', textColor });
    if (hidBearCond[i]) markers.push({ time, position: 'atPriceTop', price, shape: 'labelDown', color: th.bear, text: ' H Bear ', textColor });
  }

  // bgcolor(show_bg_tint ? (in_extreme_ob ? color.new(theme_bear, 92) : in_extreme_os ? color.new(theme_bull, 92) : na) : na)
  const bgColors: BgColorData[] = [];
  if (cfg.showBgTint) {
    const obTint = String(color.new(th.bear, 92));
    const osTint = String(color.new(th.bull, 92));
    for (let i = 0; i < n; i++) {
      if (inOb[i]) bgColors.push({ time: t(i), color: obTint });
      else if (inOs[i]) bgColors.push({ time: t(i), color: osTint });
    }
  }

  const constant = (v: number, col: string) => P((i) => ({ time: t(i), value: v, color: col }));
  const grayLine = String(color.new(color.gray, 70));
  const bearSolid = String(color.new(th.bear, 0));
  const bullSolid = String(color.new(th.bull, 0));
  // glow_base = in_extreme_ob ? theme_bear : in_extreme_os ? theme_bull : na; color.new(na, t) is black with transparency t
  const glowBase = (i: number) => (inOb[i] ? th.bear : inOs[i] ? th.bull : '#000000');
  const glowValue = (i: number) => (cfg.showGlow && (inOb[i] || inOs[i]) ? main[i] : NaN);
  const glow = (transp: number) => P((i) => ({ time: t(i), value: glowValue(i), color: String(color.new(glowBase(i), transp)) }));

  const plots: Record<string, Point[]> = {
    plot0: divPlot(plFound, bullCond, th.bull),
    plot1: divPlot(plFound, hidBullCond, hidBull),
    plot2: divPlot(phFound, bearCond, th.bear),
    plot3: divPlot(phFound, hidBearCond, hidBear),
    plot4: constant(0, String(color.new(th.accent, 0))),
    plot5: constant(isOsc ? 100.0 : NaN, String(color.new(th.bear, 30))),
    plot6: constant(isOsc ? -100.0 : NaN, String(color.new(th.bull, 30))),
    plot7: constant(isOsc ? cfg.extremeClip : NaN, String(color.new(th.bear, 70))),
    plot8: constant(isOsc ? -cfg.extremeClip : NaN, String(color.new(th.bull, 70))),
    plot9: constant(isPct ? pctRankUpper : NaN, String(color.new(th.bear, 30))),
    plot10: constant(isPct ? pctRankLower : NaN, String(color.new(th.bull, 30))),
    plot11: constant(isPct ? 50.0 : NaN, String(color.new(th.bear, 70))),
    plot12: constant(isPct ? -50.0 : NaN, String(color.new(th.bull, 70))),
    // color.from_gradient(z_score, 0, z_thresh_upper, color.new(color.gray, 70), color.new(theme_bear, 0))
    plot13: P((i) => ({
      time: t(i), value: isZsc ? zUpper[i] : NaN,
      color: isZsc ? color.from_gradient(zScore[i], 0, zUpper[i], grayLine, bearSolid) : NONE,
    })),
    // color.from_gradient(z_score, z_thresh_lower, 0, color.new(theme_bull, 0), color.new(color.gray, 70))
    plot14: P((i) => ({
      time: t(i), value: isZsc ? zLower[i] : NaN,
      color: isZsc ? color.from_gradient(zScore[i], zLower[i], 0, bullSolid, grayLine) : NONE,
    })),
    plot15: P((i) => ({ time: t(i), value: inOb[i] ? main[i] : NaN, color: NONE })),
    plot16: P((i) => ({ time: t(i), value: inOs[i] ? main[i] : NaN, color: NONE })),
    plot17: P((i) => ({ time: t(i), value: upperLevel[i], color: NONE })),
    plot18: P((i) => ({ time: t(i), value: lowerLevel[i], color: NONE })),
    plot19: glow(92),
    plot20: glow(85),
    plot21: glow(70),
    plot22: P((i) => {
      const m = main[i];
      const lineBase = cfg.useGradient
        ? (ge(m, 0)
          ? color.from_gradient(m, 0, upperLevel[i], th.neutral, th.bull)
          : color.from_gradient(m, lowerLevel[i], 0, th.bear, th.neutral))
        : (ge(m, 0) ? th.bull : th.accent);
      const prev = i > 0 ? main[i - 1] : NaN;
      const opacity = (gt(m, 0) && gt(m, prev)) || (lt(m, 0) && lt(m, prev)) ? 20 : 60;
      return { time: t(i), value: m, color: String(color.new(lineBase, opacity)) };
    }),
  };

  const obFill = String(color.new(th.bear, cfg.showObOsFill ? 70 : 100));
  const osFill = String(color.new(th.bull, cfg.showObOsFill ? 70 : 100));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'plot15', plot2: 'plot17', options: { title: 'Overbought Zone Fill' }, colors: new Array<string>(n).fill(obFill) },
      { plot1: 'plot16', plot2: 'plot18', options: { title: 'Oversold Zone Fill' }, colors: new Array<string>(n).fill(osFill) },
    ],
    markers,
    bgColors,
  };
}

function nz(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

export const ZScoreOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  fillConfig,
};
