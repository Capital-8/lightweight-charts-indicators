/**
 * Rolling Z-Score Channel
 *
 * Rolling z-score of the source: z = (src - sma(src, window)) / stdev(src, window, sample), 0 when the deviation is
 * not positive; optionally smoothed (LinReg, Hull MA, Super Smoother or Two-Pole Gaussian). In Adaptive mode the
 * band levels are the average of the upper / lower percentiles (linear interpolation) of the z-score over 50, 100
 * and 200 bars; in Fixed mode they are fixed z values. The levels are floored at +- the minimum band z, optionally
 * smoothed and made symmetric, then mapped back to price: band = sma + z * stdev, inner bands at a fraction of z.
 * The basis takes a gradient colour by the z-score; glow plots, gradient zone fills and breakout fills draw the
 * channel. Triangles mark the re-entries (source crossing back over the lower band / under the upper band).
 * Alerts (alertcondition, `alerts` of the result): the source crosses over the upper band, under the lower band,
 * back under the upper band, back over the lower band, over and under the basis.
 *
 * Reference: "Rolling Z-Score Channel" by B3AR_Trades
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, BgColorData, MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type ZChannelTheme = 'Modern' | 'Classic' | 'Neon' | 'Monochrome' | 'Sunset' | 'Ocean';
export type ZChannelSmoothing = 'LinReg' | 'Hull MA' | 'Super Smoother' | 'Two-Pole Gaussian';

export interface AdaptiveRollingZScoreChannelInputs {
  theme: ZChannelTheme;
  /** Basis colour by a gradient of the z-score (else the neutral colour) */
  useGradient: boolean;
  channelFill: 'Gradient' | 'Solid' | 'None';
  fillTransp: number;
  /** Breakout colour fill between the source and the band it crossed */
  showBreakout: boolean;
  showGlow: boolean;
  /** Background tint while the source is outside the channel */
  showBgTint: boolean;
  colorBars: boolean;
  bandMode: 'Fixed Z-Score' | 'Adaptive';
  fixedZUp: number;
  fixedZDn: number;
  symmetricBands: boolean;
  minBandZ: number;
  showInner: boolean;
  /** Inner band level as a fraction of the band z */
  innerFrac: number;
  showBasis: boolean;
  /** Rolling window of the SMA and standard deviation */
  rollWin: number;
  pctUpper: number;
  pctLower: number;
  smoothZ: boolean;
  smoothBands: boolean;
  smoothType: ZChannelSmoothing;
  smoothLength: number;
  showSignals: boolean;
  src: SourceType;
}

export const defaultInputs: AdaptiveRollingZScoreChannelInputs = {
  theme: 'Neon',
  useGradient: true,
  channelFill: 'Gradient',
  fillTransp: 90,
  showBreakout: true,
  showGlow: true,
  showBgTint: false,
  colorBars: false,
  bandMode: 'Adaptive',
  fixedZUp: 2.0,
  fixedZDn: -2.0,
  symmetricBands: false,
  minBandZ: 0.5,
  showInner: true,
  innerFrac: 0.5,
  showBasis: true,
  rollWin: 80,
  pctUpper: 95.0,
  pctLower: 5.0,
  smoothZ: false,
  smoothBands: false,
  smoothType: 'Two-Pole Gaussian',
  smoothLength: 5,
  showSignals: true,
  src: 'close',
};

const G_THEME = 'Theme & Coloring';
const G_BAND = 'Channel Settings';
const G_ZS = 'Z-Score Settings';
const G_PCT = 'Percentile Thresholds';
const G_SMTH = 'Smoothing';
const G_SIG = 'Signals';
const G_SRC = 'Source';

export const inputConfig: InputConfig[] = [
  { id: 'theme', type: 'string', title: 'Theme', defval: 'Neon', options: ['Modern', 'Classic', 'Neon', 'Monochrome', 'Sunset', 'Ocean'], group: G_THEME },
  { id: 'useGradient', type: 'bool', title: 'Gradient Basis Coloring', defval: true, group: G_THEME },
  { id: 'channelFill', type: 'string', title: 'Channel Fill', defval: 'Gradient', options: ['Gradient', 'Solid', 'None'], group: G_THEME },
  { id: 'fillTransp', type: 'int', title: 'Channel Fill Transparency', defval: 90, min: 50, max: 100, group: G_THEME },
  { id: 'showBreakout', type: 'bool', title: 'Breakout Color Fill', defval: true, group: G_THEME },
  { id: 'showGlow', type: 'bool', title: 'Glow Effect on Bands', defval: true, group: G_THEME },
  { id: 'showBgTint', type: 'bool', title: 'Background Tint on Extremes', defval: false, group: G_THEME },
  { id: 'colorBars', type: 'bool', title: 'Color Bars', defval: false, group: G_THEME },
  { id: 'bandMode', type: 'string', title: 'Band Mode', defval: 'Adaptive', options: ['Fixed Z-Score', 'Adaptive'], group: G_BAND },
  { id: 'fixedZUp', type: 'float', title: 'Fixed Upper Z', defval: 2.0, min: 0.1, max: 6.0, step: 0.1, group: G_BAND },
  { id: 'fixedZDn', type: 'float', title: 'Fixed Lower Z', defval: -2.0, min: -6.0, max: -0.1, step: 0.1, group: G_BAND },
  { id: 'symmetricBands', type: 'bool', title: 'Force Symmetric Bands', defval: false, group: G_BAND },
  { id: 'minBandZ', type: 'float', title: 'Minimum Band Z', defval: 0.5, min: 0.1, max: 3.0, step: 0.1, group: G_BAND },
  { id: 'showInner', type: 'bool', title: 'Show Inner Bands', defval: true, group: G_BAND },
  { id: 'innerFrac', type: 'float', title: 'Inner Band Fraction', defval: 0.5, min: 0.1, max: 0.9, step: 0.05, group: G_BAND },
  { id: 'showBasis', type: 'bool', title: 'Show Basis Line', defval: true, group: G_BAND },
  { id: 'rollWin', type: 'int', title: 'Rolling Window', defval: 80, min: 10, max: 500, group: G_ZS },
  { id: 'pctUpper', type: 'float', title: 'Upper Percentile', defval: 95.0, min: 50.0, max: 99.0, step: 0.5, group: G_PCT },
  { id: 'pctLower', type: 'float', title: 'Lower Percentile', defval: 5.0, min: 1.0, max: 50.0, step: 0.5, group: G_PCT },
  { id: 'smoothZ', type: 'bool', title: 'Smooth Z-Score', defval: false, group: G_SMTH },
  { id: 'smoothBands', type: 'bool', title: 'Smooth Band Levels', defval: false, group: G_SMTH },
  { id: 'smoothType', type: 'string', title: 'Smoothing', defval: 'Two-Pole Gaussian', options: ['LinReg', 'Hull MA', 'Super Smoother', 'Two-Pole Gaussian'], group: G_SMTH },
  { id: 'smoothLength', type: 'int', title: 'Smoothing Length', defval: 5, min: 2, max: 50, group: G_SMTH },
  { id: 'showSignals', type: 'bool', title: 'Plot Re-Entry Markers', defval: true, group: G_SIG },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: G_SRC },
];

/** Theme colours (bull, bear, neutral); Modern is the default of the Pine palette */
const THEMES: Record<string, [string, string, string]> = {
  Modern: [color.rgb(0, 255, 255), color.rgb(255, 0, 0), color.rgb(180, 180, 180)],
  Classic: [color.rgb(0, 230, 118), color.rgb(244, 67, 54), color.rgb(160, 160, 160)],
  Neon: [color.rgb(57, 255, 20), color.rgb(255, 20, 147), color.rgb(120, 120, 200)],
  Monochrome: [color.rgb(240, 240, 240), color.rgb(90, 90, 90), color.rgb(160, 160, 160)],
  Sunset: [color.rgb(255, 200, 87), color.rgb(199, 62, 89), color.rgb(180, 140, 140)],
  Ocean: [color.rgb(100, 220, 255), color.rgb(20, 80, 180), color.rgb(140, 160, 200)],
};
const [NEON_BULL, NEON_BEAR, NEON_NEUTRAL] = THEMES.Neon;
/** Pine default plot colour */
const PINE_BLUE = '#2962FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Price Anchor', color: String(color.new(color.white, 100)), lineWidth: 1 },
  { id: 'plot1', title: 'Upper Glow 3', color: String(color.new(NEON_BEAR, 94)), lineWidth: 9 },
  { id: 'plot2', title: 'Upper Glow 2', color: String(color.new(NEON_BEAR, 90)), lineWidth: 6 },
  { id: 'plot3', title: 'Upper Glow 1', color: String(color.new(NEON_BEAR, 84)), lineWidth: 3 },
  { id: 'plot4', title: 'Lower Glow 3', color: String(color.new(NEON_BULL, 94)), lineWidth: 9 },
  { id: 'plot5', title: 'Lower Glow 2', color: String(color.new(NEON_BULL, 90)), lineWidth: 6 },
  { id: 'plot6', title: 'Lower Glow 1', color: String(color.new(NEON_BULL, 84)), lineWidth: 3 },
  { id: 'plot7', title: 'Basis Glow 2', color: String(color.new(NEON_NEUTRAL, 90)), lineWidth: 7 },
  { id: 'plot8', title: 'Basis Glow 1', color: String(color.new(NEON_NEUTRAL, 80)), lineWidth: 4 },
  { id: 'plot9', title: 'Upper Band', color: String(color.new(NEON_BEAR, 10)), lineWidth: 2 },
  { id: 'plot10', title: 'Lower Band', color: String(color.new(NEON_BULL, 10)), lineWidth: 2 },
  { id: 'plot11', title: 'Inner Upper', color: String(color.new(NEON_BEAR, 55)), lineWidth: 1 },
  { id: 'plot12', title: 'Inner Lower', color: String(color.new(NEON_BULL, 55)), lineWidth: 1 },
  { id: 'plot13', title: 'Basis', color: NEON_NEUTRAL, lineWidth: 2 },
  { id: 'plot14', title: 'Z-Score', color: PINE_BLUE, lineWidth: 1, display: 'data_window' },
  { id: 'plot15', title: 'Upper Z', color: PINE_BLUE, lineWidth: 1, display: 'data_window' },
  { id: 'plot16', title: 'Lower Z', color: PINE_BLUE, lineWidth: 1, display: 'data_window' },
];

export const metadata = {
  title: 'Rolling Z-Score Channel',
  shortTitle: 'Z-Channel',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10; a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const nz = (x: number, y = 0) => (isNaN(x) ? y : x);

type Point = { time: number; value: number; color: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveRollingZScoreChannelInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.src));
  const len = cfg.smoothLength;

  // Theme palettes (Modern when the theme is not listed)
  const [themeBull, themeBear, themeNeutral] = THEMES[cfg.theme] ?? THEMES.Modern;

  // Smoothing coefficients
  const ssA1 = Math.exp(-Math.sqrt(2) * Math.PI / len);
  const ssB1 = 2 * ssA1 * Math.cos(Math.sqrt(2) * Math.PI / len);
  const ssC2 = ssB1;
  const ssC3 = -ssA1 * ssA1;
  const ssC1 = 1 - ssC2 - ssC3;
  const gsBeta = (1 - Math.cos(2 * Math.PI / len)) / (Math.sqrt(2) - 1);
  const gsAlpha = -gsBeta + Math.sqrt(gsBeta * gsBeta + 2 * gsBeta);
  const gsA2 = gsAlpha * gsAlpha;
  const gsOm = 1 - gsAlpha;
  const gsOm2 = gsOm * gsOm;
  const stId = cfg.smoothType === 'Two-Pole Gaussian' ? 3 : cfg.smoothType === 'Super Smoother' ? 2
    : cfg.smoothType === 'Hull MA' ? 1 : 0;

  // The four smoothers of a series (each Pine call keeps its own history; all run on every bar)
  const smooth = (x: number[]): number[] => {
    const ss: number[] = new Array(n);
    const gs: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const x1 = i > 0 ? x[i - 1] : NaN;
      const s1 = i > 0 ? ss[i - 1] : NaN;
      const s2 = i > 1 ? ss[i - 2] : NaN;
      ss[i] = ssC1 * (x[i] + nz(x1)) / 2 + ssC2 * nz(s1) + ssC3 * nz(s2);
      const g1 = i > 0 ? gs[i - 1] : NaN;
      const g2 = i > 1 ? gs[i - 2] : NaN;
      gs[i] = gsA2 * x[i] + 2 * gsOm * nz(g1) - gsOm2 * nz(g2);
    }
    const lin = A(ta.linreg(S(x), len, 0));
    const hma = A(ta.hma(S(x), len));
    return x.map((_v, i) => (stId === 1 ? hma[i] : stId === 2 ? ss[i] : stId === 3 ? gs[i] : lin[i]));
  };

  // Location and dispersion
  const locationEst = A(ta.sma(S(src), cfg.rollWin));
  const dispersion = A(ta.stdev(S(src), cfg.rollWin, false));
  const zRaw = src.map((s, i) => (gt(dispersion[i], 0) ? (s - locationEst[i]) / dispersion[i] : 0.0));
  const smZ = smooth(zRaw);
  const zScore = cfg.smoothZ ? smZ : zRaw;

  // Percentile band levels in z units: equal weights of the 50, 100 and 200 bar percentiles
  const zS = S(zScore);
  const pct = (length: number, p: number) => A(ta.percentile_linear_interpolation(zS, length, p));
  const thUpS = pct(50, cfg.pctUpper);
  const thUpM = pct(100, cfg.pctUpper);
  const thUpL = pct(200, cfg.pctUpper);
  const thDnS = pct(50, cfg.pctLower);
  const thDnM = pct(100, cfg.pctLower);
  const thDnL = pct(200, cfg.pctLower);
  const wSum = 1.0 + 1.0 + 1.0;
  const isFixed = cfg.bandMode === 'Fixed Z-Score';
  const zUpFlr: number[] = new Array(n);
  const zDnFlr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const upWsum = thUpS[i] * 1.0 + thUpM[i] * 1.0 + thUpL[i] * 1.0;
    const dnWsum = thDnS[i] * 1.0 + thDnM[i] * 1.0 + thDnL[i] * 1.0;
    const zUpSel = isFixed ? cfg.fixedZUp : upWsum / wSum;
    const zDnSel = isFixed ? cfg.fixedZDn : dnWsum / wSum;
    zUpFlr[i] = Math.max(nz(zUpSel, cfg.minBandZ), cfg.minBandZ);
    zDnFlr[i] = Math.min(nz(zDnSel, -cfg.minBandZ), -cfg.minBandZ);
  }
  const smU = smooth(zUpFlr);
  const smD = smooth(zDnFlr);

  // Colours
  const fNear = Math.trunc(Math.max(cfg.fillTransp - 12, 0));
  const fFar = Math.trunc(Math.min(cfg.fillTransp + 6, 100));
  const fillOff = cfg.channelFill === 'None';
  const fOuter = cfg.channelFill === 'Gradient' ? fFar : fNear;
  const C = (c: string, t: number) => String(color.new(c, t));
  const upFillTop = fillOff ? C(themeBear, 100) : C(themeBear, fNear);
  const upFillBot = fillOff ? C(themeBear, 100) : C(themeBear, fOuter);
  const dnFillTop = fillOff ? C(themeBull, 100) : C(themeBull, fOuter);
  const dnFillBot = fillOff ? C(themeBull, 100) : C(themeBull, fNear);
  const NA = 'transparent';

  const plots: Record<string, Point[]> = {};
  for (let k = 0; k <= 16; k++) plots[`plot${k}`] = [];
  const push = (k: number, time: number, value: number, col: string) => {
    plots[`plot${k}`].push({ time, value: Number.isFinite(value) ? value : NaN, color: col });
  };
  const upperArr: number[] = new Array(n);
  const lowerArr: number[] = new Array(n);
  const basisArr: number[] = new Array(n);
  const brkUp: string[] = new Array(n);
  const brkDn: string[] = new Array(n);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const anchorCol = C(color.white, 100);
  const pineBlue = PINE_BLUE;
  // ta.crossover(src, lower) / ta.crossunder(src, upper): exact comparisons with the last bar where both values
  // were not na
  let prevLo: [number, number] | null = null;
  let prevUp: [number, number] | null = null;

  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const zUpPre = cfg.smoothBands ? smU[i] : zUpFlr[i];
    const zDnPre = cfg.smoothBands ? smD[i] : zDnFlr[i];
    const symMag = Math.max(Math.abs(zUpPre), Math.abs(zDnPre));
    const zUp = cfg.symmetricBands ? symMag : zUpPre;
    const zDn = cfg.symmetricBands ? -symMag : zDnPre;

    // Inversion back to price
    const loc = locationEst[i];
    const disp = dispersion[i];
    const basis = loc;
    const upper = loc + zUp * disp;
    const lower = loc + zDn * disp;
    const innerUp = loc + zUp * cfg.innerFrac * disp;
    const innerDn = loc + zDn * cfg.innerFrac * disp;
    upperArr[i] = upper;
    lowerArr[i] = lower;
    basisArr[i] = basis;
    const inOb = !isNaN(upper) && gt(src[i], upper);
    const inOs = !isNaN(lower) && lt(src[i], lower);

    // Gradient colour of the basis
    const z = zScore[i];
    const gradTop = Math.max(zUp, 0.01);
    const gradBot = Math.min(zDn, -0.01);
    const gradColor = ge(z, 0)
      ? String(color.from_gradient(z, 0, gradTop, themeNeutral, themeBear))
      : String(color.from_gradient(z, gradBot, 0, themeBull, themeNeutral));
    const basisColor = cfg.useGradient ? gradColor : themeNeutral;

    brkUp[i] = cfg.showBreakout && inOb ? C(themeBear, 75) : NA;
    brkDn[i] = cfg.showBreakout && inOs ? C(themeBull, 75) : NA;
    const glow = (c: string, tr: number) => (cfg.showGlow ? C(c, tr) : NA);

    // bgcolor(show_bg_tint ? (in_ob ? bg_ob : in_os ? bg_os : na) : na)
    if (cfg.showBgTint && (inOb || inOs)) bgColors.push({ time: t, color: C(inOb ? themeBear : themeBull, 92) });

    const basisPlot = cfg.showBasis ? basis : NaN;
    push(0, t, src[i], anchorCol);
    push(1, t, upper, glow(themeBear, inOb ? 88 : 94));
    push(2, t, upper, glow(themeBear, inOb ? 80 : 90));
    push(3, t, upper, glow(themeBear, inOb ? 68 : 84));
    push(4, t, lower, glow(themeBull, inOs ? 88 : 94));
    push(5, t, lower, glow(themeBull, inOs ? 80 : 90));
    push(6, t, lower, glow(themeBull, inOs ? 68 : 84));
    push(7, t, basisPlot, glow(basisColor, 90));
    push(8, t, basisPlot, glow(basisColor, 80));
    push(9, t, upper, C(themeBear, 10));
    push(10, t, lower, C(themeBull, 10));
    push(11, t, cfg.showInner ? innerUp : NaN, C(themeBear, 55));
    push(12, t, cfg.showInner ? innerDn : NaN, C(themeBull, 55));
    push(13, t, basisPlot, basisColor);

    // barcolor(color_bars ? (in_ob ? theme_bear : in_os ? theme_bull : base_bar) : na)
    if (cfg.colorBars) barColors.push({ time: t, color: inOb ? themeBear : inOs ? themeBull : basisColor });

    push(14, t, z, pineBlue);
    push(15, t, zUp, pineBlue);
    push(16, t, zDn, pineBlue);

    let reentryUp = false;
    if (!isNaN(src[i]) && !isNaN(lower)) {
      reentryUp = prevLo !== null && src[i] > lower && prevLo[0] <= prevLo[1];
      prevLo = [src[i], lower];
    }
    let reentryDn = false;
    if (!isNaN(src[i]) && !isNaN(upper)) {
      reentryDn = prevUp !== null && src[i] < upper && prevUp[0] >= prevUp[1];
      prevUp = [src[i], upper];
    }
    if (cfg.showSignals && reentryUp) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: themeBull, size: 'tiny' });
    }
    if (cfg.showSignals && reentryDn) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: themeBear, size: 'tiny' });
    }
  }

  const fills = [
    // fill(p_upper, p_basis, upper, basis, up_fill_top, up_fill_bot, title = "Upper Zone")
    { plot1: 'plot9', plot2: 'plot13', options: { title: 'Upper Zone' }, gradient: { topValue: upperArr, bottomValue: basisArr,
      topColor: new Array(n).fill(upFillTop), bottomColor: new Array(n).fill(upFillBot) } },
    // fill(p_basis, p_lower, basis, lower, dn_fill_top, dn_fill_bot, title = "Lower Zone")
    { plot1: 'plot13', plot2: 'plot10', options: { title: 'Lower Zone' }, gradient: { topValue: basisArr, bottomValue: lowerArr,
      topColor: new Array(n).fill(dnFillTop), bottomColor: new Array(n).fill(dnFillBot) } },
    // fill(p_src, p_upper, color = brk_up_col, title = "Breakout Above")
    { plot1: 'plot0', plot2: 'plot9', options: { title: 'Breakout Above' }, colors: brkUp },
    // fill(p_src, p_lower, color = brk_dn_col, title = "Breakdown Below")
    { plot1: 'plot0', plot2: 'plot10', options: { title: 'Breakdown Below' }, colors: brkDn },
  ];

  // alertcondition(ta.crossover(src, upper)), (ta.crossunder(src, lower)), (reentry_dn = ta.crossunder(src, upper)),
  // (reentry_up = ta.crossover(src, lower)), (ta.crossover(src, basis)), (ta.crossunder(src, basis))
  const alertFlags = [
    crossedOver(src, upperArr), crossedUnder(src, lowerArr), crossedUnder(src, upperArr), crossedOver(src, lowerArr),
    crossedOver(src, basisArr), crossedUnder(src, basisArr),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    barColors,
    bgColors,
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Break Above Upper', message: 'Closed above upper band' },
  { id: 'alert1', title: 'Break Below Lower', message: 'Closed below lower band' },
  { id: 'alert2', title: 'Re-Entry From Above', message: 'Closed back inside from above' },
  { id: 'alert3', title: 'Re-Entry From Below', message: 'Closed back inside from below' },
  { id: 'alert4', title: 'Basis Cross Up', message: 'Crossed above basis' },
  { id: 'alert5', title: 'Basis Cross Down', message: 'Crossed below basis' },
];

export const AdaptiveRollingZScoreChannel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
