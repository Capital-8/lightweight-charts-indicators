/**
 * Navier-Cauchy Market Elasticity [PhenLabs]
 *
 * An elasticity analogy: the strain is the price change over `lengthDisplacement` bars divided by the old close;
 * the Young modulus is 1 / (stdev(close) / sma(close)) over `lengthElasticity` bars; with the Poisson ratio nu the
 * Lame parameters are lambda = E * nu / ((1 + nu) * (1 - 2 * nu)) and mu = E / (2 * (1 + nu)). The stress
 * (lambda + 2 * mu) * strain * multiplier is smoothed with an SMA. A histogram shows the stress normalised by its
 * 20-bar average absolute value; the line, a wide glow line, bands at +-2 standard deviations (and 1.5 times them),
 * dots and lines on extreme values, an optional momentum ribbon and background zones show the stress level. The
 * colours go from a light to a strong bullish / bearish colour with the stress size.
 *
 * Alerts (alertcondition, `alerts` of the result): the smoothed stress crossing above the upper band / 1.5 times it
 * ("High Stress" / "Extreme High Stress") and below the lower band / 1.5 times it ("High Compression" / "Extreme
 * Compression"), with the bands as computed (also when they are not shown).
 *
 * Reference: "Navier-Cauchy Market Elasticity [PhenLabs]" by PhenLabs
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © PhenLabs
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'High Stress', message: 'Market under high tension' },
  { id: 'alert1', title: 'High Compression', message: 'Market under high compression' },
  { id: 'alert2', title: 'Extreme High Stress', message: 'Market under extreme tension' },
  { id: 'alert3', title: 'Extreme Compression', message: 'Market under extreme compression' },
];

export type NcmeDisplayStyle = 'Histogram' | 'Line' | 'Both' | 'Advanced';
export type NcmeColorScheme = 'Modern' | 'Classic' | 'Neon' | 'Ocean' | 'Fire';

export interface NavierCauchyMarketElasticityInputs {
  displayStyle: NcmeDisplayStyle;
  /** SMA length of the stress (1 = no smoothing) */
  smoothingPeriod: number;
  /** Show the reference bands */
  showBands: boolean;
  /** Colour the background by stress level */
  showZones: boolean;
  /** Gradient colours */
  showGradient: boolean;
  /** Glow line (Advanced mode) */
  showGlow: boolean;
  /** Momentum ribbon (Advanced mode) */
  showMomentumRibbon: boolean;
  /** Dots on extreme values (Advanced mode) */
  showExtremeDots: boolean;
  /** More subtle colours in Advanced mode */
  reducedOpacity: boolean;
  /** Length of the price displacement (strain) */
  lengthDisplacement: number;
  /** Length of the elasticity (volatility) and of the bands */
  lengthElasticity: number;
  /** Ratio of lateral to axial strain */
  poissonRatio: number;
  /** Scale factor of the stress */
  stressMultiplier: number;
  colorScheme: NcmeColorScheme;
}

export const defaultInputs: NavierCauchyMarketElasticityInputs = {
  displayStyle: 'Advanced',
  smoothingPeriod: 3,
  showBands: true,
  showZones: true,
  showGradient: true,
  showGlow: true,
  showMomentumRibbon: false,
  showExtremeDots: true,
  reducedOpacity: true,
  lengthDisplacement: 14,
  lengthElasticity: 30,
  poissonRatio: 0.3,
  stressMultiplier: 100,
  colorScheme: 'Modern',
};

const G_DISPLAY = 'Display Settings';
const G_ADVANCED = 'Advanced Mode Options';
const G_CORE = 'Elasticity Parameters';
const G_COLORS = 'Color Settings';

export const inputConfig: InputConfig[] = [
  { id: 'displayStyle', type: 'string', title: 'Display Style', defval: 'Advanced', options: ['Histogram', 'Line', 'Both', 'Advanced'], group: G_DISPLAY },
  { id: 'smoothingPeriod', type: 'int', title: 'Smoothing Period', defval: 3, min: 1, group: G_DISPLAY, tooltip: 'Number of periods for moving average smoothing (1 = no smoothing)' },
  { id: 'showBands', type: 'bool', title: 'Show Reference Bands', defval: true, group: G_DISPLAY, tooltip: 'Display upper and lower reference bands for extreme values' },
  { id: 'showZones', type: 'bool', title: 'Show Background Zones', defval: true, group: G_DISPLAY, tooltip: 'Color background based on stress levels' },
  { id: 'showGradient', type: 'bool', title: 'Enable Gradient Effects', defval: true, group: G_DISPLAY, tooltip: 'Use gradient coloring for smoother transitions' },
  { id: 'showGlow', type: 'bool', title: 'Show Glow Effect', defval: true, group: G_ADVANCED, tooltip: 'Enable glow effect in advanced mode' },
  { id: 'showMomentumRibbon', type: 'bool', title: 'Show Momentum Ribbon', defval: false, group: G_ADVANCED, tooltip: 'Display momentum ribbon overlay' },
  { id: 'showExtremeDots', type: 'bool', title: 'Show Extreme Dots', defval: true, group: G_ADVANCED, tooltip: 'Mark extreme values with dots' },
  { id: 'reducedOpacity', type: 'bool', title: 'Reduced Opacity Mode', defval: true, group: G_ADVANCED, tooltip: 'Use more subtle colors in advanced mode' },
  { id: 'lengthDisplacement', type: 'int', title: 'Displacement Length', defval: 14, min: 1, group: G_CORE, tooltip: 'The lookback period for measuring price displacement (strain)' },
  { id: 'lengthElasticity', type: 'int', title: 'Elasticity Length', defval: 30, min: 1, group: G_CORE, tooltip: 'The period for calculating market elasticity based on volatility' },
  { id: 'poissonRatio', type: 'float', title: 'Poisson Ratio', defval: 0.3, min: 0, max: 0.5, step: 0.05, group: G_CORE, tooltip: 'Theoretical ratio of lateral to axial strain (0.3 is standard for most markets)' },
  { id: 'stressMultiplier', type: 'float', title: 'Stress Multiplier', defval: 100, min: 1, group: G_CORE, tooltip: 'Scaling factor to make stress values more visible' },
  { id: 'colorScheme', type: 'string', title: 'Color Scheme', defval: 'Modern', options: ['Modern', 'Classic', 'Neon', 'Ocean', 'Fire'], group: G_COLORS },
];

/** bullish, bullish strong, bearish, bearish strong colours of each scheme */
const SCHEMES: Record<NcmeColorScheme, [string, string, string, string]> = {
  Modern: ['#26D0CE', '#1A9B9A', '#E06B9D', '#B84A7D'],
  Classic: ['#00C176', '#009959', '#FF6B6B', '#DE4747'],
  Neon: ['#00FF88', '#00CC66', '#FF1744', '#D50000'],
  Ocean: ['#00B4D8', '#0077B6', '#F72585', '#B5179E'],
  Fire: ['#FFB700', '#FF8C00', '#DC2F02', '#9D0208'],
};

const NEUTRAL_COLOR = '#7B8794';
const ZERO_LINE_COLOR = String(color.new('#FFFFFF', 80));
const BANDS_COLOR = String(color.new('#FFFFFF', 90));
const BANDS2_COLOR = String(color.new('#FFFFFF', 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Stress Histogram', color: '#26D0CE', lineWidth: 3, style: 'histogram' },
  { id: 'plot1', title: 'Stress Line', color: '#26D0CE', lineWidth: 2, style: 'line' },
  { id: 'plot2', title: 'Stress Glow', color: String(color.new('#26D0CE', 85)), lineWidth: 9, style: 'line' },
  { id: 'plot3', title: 'Upper Band', color: BANDS_COLOR, lineWidth: 1, style: 'line' },
  { id: 'plot4', title: 'Lower Band', color: BANDS_COLOR, lineWidth: 1, style: 'line' },
  { id: 'plot5', title: 'Upper Band 2', color: BANDS2_COLOR, lineWidth: 1 },
  { id: 'plot6', title: 'Lower Band 2', color: BANDS2_COLOR, lineWidth: 1 },
  { id: 'plot7', title: 'Momentum Ribbon', color: String(color.new('#26D0CE', 90)), lineWidth: 1, style: 'area' },
  { id: 'plot8', title: 'Extreme High Line', color: String(color.new('#1A9B9A', 70)), lineWidth: 1, style: 'linebr' },
  { id: 'plot9', title: 'Extreme Low Line', color: String(color.new('#B84A7D', 70)), lineWidth: 1, style: 'linebr' },
];

/** hline(0, 'Zero Line', color.new(#FFFFFF, 80), solid, 1) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero Line', color: ZERO_LINE_COLOR, linestyle: 'solid', linewidth: 1 },
];

/** fill(Upper Band, Lower Band) with the default inputs (Advanced mode: transparency 98) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_bands', plot1: 'plot3', plot2: 'plot4', color: String(color.new(NEUTRAL_COLOR, 98)), title: 'Band Fill' },
];

export const metadata = {
  title: 'Navier-Cauchy Market Elasticity [PhenLabs]',
  shortTitle: 'NCME - PhenLabs',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
/** Pine math.max / math.min: na when an argument is na (NaN in JS too) */
const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<NavierCauchyMarketElasticityInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const adv = cfg.displayStyle === 'Advanced';
  const [bullishColor, bullishStrongColor, bearishColor, bearishStrongColor] = SCHEMES[cfg.colorScheme] ?? SCHEMES.Modern;
  const nu = cfg.poissonRatio;
  const L = cfg.lengthDisplacement;

  // Stress
  const sdClose = A(ta.stdev(S(close), cfg.lengthElasticity));
  const smaClose = A(ta.sma(S(close), cfg.lengthElasticity));
  const stressValue = close.map((c, i) => {
    const old = i - L >= 0 ? close[i - L] : NaN;
    const priceStrain = (c - old) / old;
    const volatility = sdClose[i] / smaClose[i];
    const youngsModulus = 1 / volatility;
    const lambda = (youngsModulus * nu) / ((1 + nu) * (1 - 2 * nu));
    const mu = youngsModulus / (2 * (1 + nu));
    const normalStress = (lambda + 2 * mu) * priceStrain;
    return normalStress * cfg.stressMultiplier;
  });
  const smoothed = A(ta.sma(S(stressValue), cfg.smoothingPeriod));
  const absSmoothed = smoothed.map((v) => Math.abs(v));
  const avgStress = A(ta.sma(S(absSmoothed), 20));
  const normalized = smoothed.map((v, i) => v / (eq(avgStress[i], 0) ? 1 : avgStress[i]));
  const stressDev = A(ta.stdev(S(smoothed), 50));
  const upperBand = A(ta.stdev(S(smoothed), cfg.lengthElasticity)).map((v) => v * 2);
  const momentum = A(ta.change(S(smoothed), 1));

  const baseOpacity = adv && cfg.reducedOpacity ? 70 : 100;
  const stressColor = (value: number, thr: number, thr2: number): string => {
    if (cfg.showGradient) {
      const ratio = Math.min(Math.abs(value) / thr2, 1);
      if (gt(value, 0)) {
        return gt(value, thr)
          ? color.from_gradient(ratio, 0, 1, bullishColor, bullishStrongColor)
          : color.from_gradient(ratio, 0, 1, String(color.new(bullishColor, 50)), bullishColor);
      }
      return lt(value, -thr)
        ? color.from_gradient(ratio, 0, 1, bearishColor, bearishStrongColor)
        : color.from_gradient(ratio, 0, 1, String(color.new(bearishColor, 50)), bearishColor);
    }
    return gt(value, 0) ? (gt(value, thr) ? bullishStrongColor : bullishColor)
      : lt(value, -thr) ? bearishStrongColor : bearishColor;
  };

  const showHist = cfg.displayStyle === 'Histogram' || cfg.displayStyle === 'Both' || adv;
  const histScale = adv ? 50 : 75;
  const showLine = cfg.displayStyle === 'Line' || cfg.displayStyle === 'Both' || adv;
  const showGlowEffect = adv && showLine && cfg.showGlow;
  const showSecondaryBands = adv && cfg.showBands;
  const showDots = adv && cfg.showExtremeDots;
  const showMomentum = adv && cfg.showMomentumRibbon;
  const zoneOpacity = adv ? 98 : 95;

  type Point = { time: number; value: number; color?: string };
  const names = ['plot0', 'plot1', 'plot2', 'plot3', 'plot4', 'plot5', 'plot6', 'plot7', 'plot8', 'plot9'];
  const plots: Record<string, Point[]> = Object.fromEntries(names.map((k) => [k, [] as Point[]]));
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const fillColors: string[] = new Array(n);
  const extremeHighColor = String(color.new(bullishStrongColor, 70));
  const extremeLowColor = String(color.new(bearishStrongColor, 70));
  const fillColor = cfg.showBands ? String(color.new(NEUTRAL_COLOR, adv ? 98 : 95)) : 'transparent';

  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const s = smoothed[i];
    const thr = 1.5 * stressDev[i];
    const thr2 = 2.5 * stressDev[i];
    // opacity = math.min(math.max(|s| / thr2 * baseOpacity, 30), baseOpacity): na when an argument is na
    const opacity = Math.min(Math.max((absSmoothed[i] / thr2) * baseOpacity, 30), baseOpacity);
    const sc = stressColor(s, thr, thr2);
    const sizeMultiplier = adv ? Math.max(0.5, Math.min(2, Math.abs(normalized[i]))) : 1;
    const ub = upperBand[i];
    const lb = -ub;
    const ub2 = ub * 1.5;
    const lb2 = lb * 1.5;

    // Background zones
    const topZone = gt(s, ub2);
    const highZone = gt(s, ub) && le(s, ub2);
    const lowZone = lt(s, lb) && ge(s, lb2);
    const bottomZone = lt(s, lb2);
    if (cfg.showZones) {
      const bg = topZone ? String(color.new(bullishStrongColor, zoneOpacity))
        : highZone ? String(color.new(bullishColor, zoneOpacity + 2))
          : lowZone ? String(color.new(bearishColor, zoneOpacity + 2))
            : bottomZone ? String(color.new(bearishStrongColor, zoneOpacity)) : null;
      if (bg !== null) bgColors.push({ time: t, color: bg });
    }

    // Stress Histogram: color.new(stressColor, histOpacity)
    const histOpacity = adv ? 100 - opacity + 20 : 100 - opacity;
    plots.plot0.push({
      time: t, value: showHist ? fin(normalized[i] * histScale * sizeMultiplier) : NaN,
      color: String(color.new(sc, histOpacity)),
    });
    plots.plot1.push({ time: t, value: showLine ? fin(s) : NaN, color: sc });
    plots.plot2.push({ time: t, value: showGlowEffect ? fin(s) : NaN, color: String(color.new(sc, 85)) });
    plots.plot3.push({ time: t, value: cfg.showBands ? fin(ub) : NaN });
    plots.plot4.push({ time: t, value: cfg.showBands ? fin(lb) : NaN });
    plots.plot5.push({ time: t, value: showSecondaryBands ? fin(ub2) : NaN });
    plots.plot6.push({ time: t, value: showSecondaryBands ? fin(lb2) : NaN });
    fillColors[i] = fillColor;

    // plotshape(dotHigh / dotLow, shape.circle, location.absolute, size.tiny)
    if (showDots && gt(s, ub2) && Number.isFinite(s)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: s, shape: 'circle',
        color: String(color.new(bullishStrongColor, 30)), size: 'tiny', id: 'shape0' });
    }
    if (showDots && lt(s, lb2) && Number.isFinite(s)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: s, shape: 'circle',
        color: String(color.new(bearishStrongColor, 30)), size: 'tiny', id: 'shape1' });
    }

    // Momentum Ribbon
    const momentumColor = gt(momentum[i], 0) ? String(color.new(bullishColor, 90)) : String(color.new(bearishColor, 90));
    plots.plot7.push({ time: t, value: showMomentum ? fin(s + momentum[i] * 5) : NaN, color: momentumColor });

    // Extreme stress lines
    plots.plot8.push({ time: t, value: gt(s, ub2) && adv ? fin(ub2) : NaN, color: extremeHighColor });
    plots.plot9.push({ time: t, value: lt(s, lb2) && adv ? fin(lb2) : NaN, color: extremeLowColor });
  }

  // alertcondition: crossover(smoothedStress, upperBand) / crossunder(.., lowerBand) / the same with the 1.5x bands
  const lowerBand = upperBand.map((v) => -v);
  const alerts = alertStates(alertConditions, bars, [
    crossedOver(smoothed, upperBand),
    crossedUnder(smoothed, lowerBand),
    crossedOver(smoothed, upperBand.map((v) => v * 1.5)),
    crossedUnder(smoothed, lowerBand.map((v) => v * 1.5)),
  ]);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: 0, options: { title: 'Zero Line', color: ZERO_LINE_COLOR, linestyle: 'solid', linewidth: 1 } },
    ],
    fills: [{ plot1: 'plot3', plot2: 'plot4', options: { title: 'Band Fill', color: fillColor }, colors: fillColors }],
    markers,
    bgColors,
    alerts,
  };
}

export const NavierCauchyMarketElasticity = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
