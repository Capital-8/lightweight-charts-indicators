/**
 * Adaptive Kinetic Ribbon
 *
 * A kinetic line follows the source with an adaptive factor alpha = |velocity| / (|velocity| + volatility), where
 * velocity = source - source[length] and volatility = stdev(source - source[1], length) * sensitivity; the line
 * restarts at the source after a bar where it is na. A fast and a slow moving average of the kinetic line form a
 * ribbon. Its colour shows the trend (fast above slow) and the acceleration (fast rising): bullish / bearish
 * acceleration or deceleration. The ribbon fill and the price bars use the same colour. Presets replace the
 * calculation inputs.
 * Alerts (alertcondition, `alerts` of the result): ribbon crosses (bullish, bearish, any) and the first bar of each
 * acceleration / deceleration state (and of any acceleration, any deceleration).
 *
 * Reference: "Adaptive Kinetic Ribbon [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type KineticMaType = 'SMA' | 'EMA' | 'WMA' | 'HMA' | 'VWMA' | 'RMA';

export interface AdaptiveKineticRibbonInputs {
  src: SourceType;
  /** Lookback of the velocity and the volatility */
  length: number;
  /** Volatility sensitivity */
  mult: number;
  /** Ribbon moving average type */
  maType: KineticMaType;
  ribbonFastLength: number;
  ribbonSlowLength: number;
  /** 'Default' keeps the inputs above; the other presets replace them */
  presetConfig: 'Default' | 'Fast Response' | 'Smooth Trend';
  colorPreset: 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom';
  bullAccel: string;
  bullDecel: string;
  bearAccel: string;
  bearDecel: string;
  cloudTransparency: number;
  enableBarColoring: boolean;
  barTransparency: number;
}

export const defaultInputs: AdaptiveKineticRibbonInputs = {
  src: 'close',
  length: 20,
  mult: 1.5,
  maType: 'EMA',
  ribbonFastLength: 3,
  ribbonSlowLength: 8,
  presetConfig: 'Default',
  colorPreset: 'Custom',
  bullAccel: '#00ffaa',
  bullDecel: '#006400',
  bearAccel: '#ff0000',
  bearDecel: '#8b0000',
  cloudTransparency: 30,
  enableBarColoring: true,
  barTransparency: 30,
};

const CALC = '════════ Calculation Parameters ════════';
const VISUAL = '════════ Visualization Settings ════════';

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Price Source', defval: 'close', group: CALC },
  { id: 'length', type: 'int', title: 'Lookback Period', defval: 20, min: 5, group: CALC },
  { id: 'mult', type: 'float', title: 'Volatility Sensitivity', defval: 1.5, min: 0.1, step: 0.1, group: CALC },
  { id: 'maType', type: 'string', title: 'Ribbon MA Type', defval: 'EMA', options: ['SMA', 'EMA', 'WMA', 'HMA', 'VWMA', 'RMA'], group: CALC },
  { id: 'ribbonFastLength', type: 'int', title: 'Fast Ribbon Period', defval: 3, min: 1, group: CALC },
  { id: 'ribbonSlowLength', type: 'int', title: 'Slow Ribbon Period', defval: 8, min: 1, group: CALC },
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'], group: CALC },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'], group: VISUAL },
  { id: 'bullAccel', type: 'color', title: 'Bullish Acceleration', defval: '#00ffaa', group: VISUAL },
  { id: 'bullDecel', type: 'color', title: 'Bullish Deceleration', defval: '#006400', group: VISUAL },
  { id: 'bearAccel', type: 'color', title: 'Bearish Acceleration', defval: '#ff0000', group: VISUAL },
  { id: 'bearDecel', type: 'color', title: 'Bearish Deceleration', defval: '#8b0000', group: VISUAL },
  { id: 'cloudTransparency', type: 'int', title: 'Cloud Transparency', defval: 30, min: 0, max: 100, group: VISUAL },
  { id: 'enableBarColoring', type: 'bool', title: 'Enable Bar Coloring', defval: true, group: VISUAL },
  { id: 'barTransparency', type: 'int', title: 'Bar Color Transparency', defval: 30, min: 0, max: 100, group: VISUAL },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast Kinetic Ribbon', color: String(color.new('#00ffaa', 30)), lineWidth: 4 },
  { id: 'plot1', title: 'Slow Kinetic Ribbon', color: String(color.new('#00ffaa', 30)), lineWidth: 4 },
];

export const metadata = {
  title: 'Adaptive Kinetic Ribbon [QuantAlgo]',
  shortTitle: 'Adaptive Kinetic Ribbon [QuantAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;

const PRESET_COLORS: Record<string, [string, string, string, string]> = {
  Classic: ['#00ff00', '#006400', '#ff0000', '#8b0000'],
  Aqua: ['#00d4ff', '#006680', '#ff8c00', '#804600'],
  Cosmic: ['#49ffce', '#247f67', '#9932cc', '#4d1966'],
  Cyber: ['#ff6600', '#803300', '#00cccc', '#006666'],
  Neon: ['#ffff00', '#808000', '#ff00ff', '#800080'],
};

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveKineticRibbonInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  let { length, mult, maType, ribbonFastLength, ribbonSlowLength } = cfg;
  if (cfg.presetConfig === 'Fast Response') {
    [length, mult, maType, ribbonFastLength, ribbonSlowLength] = [12, 1.0, 'EMA', 2, 5];
  } else if (cfg.presetConfig === 'Smooth Trend') {
    [length, mult, maType, ribbonFastLength, ribbonSlowLength] = [30, 2.0, 'EMA', 5, 13];
  }
  const [bullAccel, bullDecel, bearAccel, bearDecel] = PRESET_COLORS[cfg.colorPreset]
    ?? [cfg.bullAccel, cfg.bullDecel, cfg.bearAccel, cfg.bearDecel];

  const src = A(getSourceSeries(bars, cfg.src));
  const diff1 = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const volatility = A(ta.stdev(S(diff1), length)).map((v) => v * mult);

  // var float kinetic_line = na
  // kinetic_line := na(kinetic_line[1]) ? source : kinetic_line[1] + adaptive_alpha * (source - kinetic_line[1])
  const kinetic: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const velocity = i - length >= 0 ? src[i] - src[i - length] : NaN;
    // a plain division: 0 / 0 is na (velocity 0 and volatility 0)
    const alpha = Math.abs(velocity) / (Math.abs(velocity) + volatility[i]);
    const prev = i > 0 ? kinetic[i - 1] : NaN;
    const k = isNaN(prev) ? src[i] : prev + alpha * (src[i] - prev);
    kinetic[i] = Number.isFinite(k) ? k : NaN;
  }

  const kin = S(kinetic);
  const vol = S(bars.map((b) => b.volume ?? NaN));
  const ma = (len: number): number[] => {
    switch (maType) {
      case 'SMA': return A(ta.sma(kin, len));
      case 'WMA': return A(ta.wma(kin, len));
      case 'HMA': return A(ta.hma(kin, len));
      case 'VWMA': return A(ta.vwma(kin, len, vol));
      case 'RMA': return A(ta.rma(kin, len));
      default: return A(ta.ema(kin, len));
    }
  };
  const fast = ma(ribbonFastLength);
  const slow = ma(ribbonSlowLength);

  const ribbonColor = (i: number) => {
    const trendUp = gt(fast[i], slow[i]);
    const acceleration = i > 0 && gt(fast[i], fast[i - 1]);
    return trendUp ? (acceleration ? bullAccel : bullDecel) : !acceleration ? bearAccel : bearDecel;
  };
  const css: string[] = new Array(n);
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const rc = ribbonColor(i);
    css[i] = String(color.new(rc, cfg.cloudTransparency));
    // barcolor(enableBarColoring ? color.new(ribbonColor, barTransparency) : na)
    if (cfg.enableBarColoring) barColors.push({ time: bars[i].time, color: String(color.new(rc, cfg.barTransparency)) });
  }

  // bullCross = ta.crossover(ribbon_fast, ribbon_slow); bearCross = ta.crossunder(ribbon_fast, ribbon_slow)
  const bullCross = crossedOver(fast, slow);
  const bearCross = crossedUnder(fast, slow);
  // states (trend_up = fast > slow, acceleration = fast > fast[1]); trigger = state and not state[1] (false before bar 0)
  const trendUp = fast.map((f, i) => gt(f, slow[i]));
  const accel = fast.map((f, i) => i > 0 && gt(f, fast[i - 1]));
  const trigger = (state: (i: number) => boolean) => bars.map((_b, i) => state(i) && !(i > 0 && state(i - 1)));
  const bullAccelT = trigger((i) => trendUp[i] && accel[i]);
  const bullDecelT = trigger((i) => trendUp[i] && !accel[i]);
  const bearAccelT = trigger((i) => !trendUp[i] && !accel[i]);
  const bearDecelT = trigger((i) => !trendUp[i] && accel[i]);
  const or = (a: boolean[], b: boolean[]) => a.map((v, i) => v || b[i]);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fast[i], color: css[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: slow[i], color: css[i] })),
    },
    // fill(p1, p2, color = css, title = 'Ribbon Fill')
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Ribbon Fill' }, colors: css }],
    barColors,
    alerts: alertStates(alertConditions, bars, [
      bullCross, bearCross, or(bullCross, bearCross),
      bullAccelT, bullDecelT, bearAccelT, bearDecelT, or(bullAccelT, bearAccelT), or(bullDecelT, bearDecelT),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Crossover', message: 'Adaptive Kinetic Ribbon: BULLISH crossover on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Crossover', message: 'Adaptive Kinetic Ribbon: BEARISH crossover on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Any Ribbon Crossover', message: 'Adaptive Kinetic Ribbon: Crossover detected! Check chart {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert3', title: 'Bullish Acceleration', message: 'Adaptive Kinetic Ribbon: BULLISH ACCELERATION on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert4', title: 'Bullish Deceleration', message: 'Adaptive Kinetic Ribbon: BULLISH DECELERATION on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert5', title: 'Bearish Acceleration', message: 'Adaptive Kinetic Ribbon: BEARISH ACCELERATION on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert6', title: 'Bearish Deceleration', message: 'Adaptive Kinetic Ribbon: BEARISH DECELERATION on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert7', title: 'Any Acceleration', message: 'Adaptive Kinetic Ribbon: ACCELERATION state entered on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert8', title: 'Any Deceleration', message: 'Adaptive Kinetic Ribbon: DECELERATION state entered on {{exchange}}:{{ticker}} - {{interval}}' },
];

export const AdaptiveKineticRibbon = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
