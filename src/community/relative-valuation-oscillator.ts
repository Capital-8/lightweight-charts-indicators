/**
 * Relative Valuation Oscillator
 *
 * Z-score of the log price: (log(close) - SMA(log(close), lookback)) / stdev(log(close), lookback). Above the
 * threshold the price is overvalued, below minus the threshold undervalued. The score line takes the overvalued /
 * undervalued colour in these zones, else a faded neutral colour; threshold lines, a gradient fill between the score
 * and zero, circles at the score in the zones, optional circles above / below the price bars and optional background
 * colours on the price pane. Presets replace the lookback and the threshold; colour presets replace the colours.
 * Alerts (alertcondition, `alerts` of the result): the score crosses over the threshold / under minus the threshold,
 * crosses over / under 0, and either threshold cross ('Any Extreme Valuation').
 *
 * Reference: "Relative Valuation Oscillator [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type RvoPreset = 'Default' | 'Fast Response' | 'Smooth Trend';
export type RvoColorPreset = 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom';

export interface RelativeValuationOscillatorInputs {
  /** Lookback of the mean and the standard deviation of the log price */
  lookbackPeriod: number;
  /** Threshold in standard deviations */
  thresholdMult: number;
  /** 'Fast Response' (21, 1.5) and 'Smooth Trend' (60, 2) replace the lookback and the threshold */
  presetConfig: RvoPreset;
  colorPreset: RvoColorPreset;
  /** Undervalued colour (Custom colour preset) */
  bullishInput: string;
  /** Overvalued colour (Custom colour preset) */
  bearishInput: string;
  /** Fair value colour (Custom colour preset) */
  neutralInput: string;
  /** Circles above / below the price bars in the zones */
  enableOverlaySignals: boolean;
  /** Background colour of the price pane in the zones */
  enableBgSignals: boolean;
  bgTransparency: number;
}

export const defaultInputs: RelativeValuationOscillatorInputs = {
  lookbackPeriod: 34,
  thresholdMult: 2.0,
  presetConfig: 'Default',
  colorPreset: 'Custom',
  bullishInput: '#00ffaa',
  bearishInput: '#ff0000',
  neutralInput: '#787b86',
  enableOverlaySignals: true,
  enableBgSignals: false,
  bgTransparency: 70,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookbackPeriod', type: 'int', title: 'Lookback Period', defval: 34 },
  { id: 'thresholdMult', type: 'float', title: 'Deviation Threshold', defval: 2.0, min: 0.5, step: 0.1 },
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullishInput', type: 'color', title: 'Undervalued Color', defval: '#00ffaa' },
  { id: 'bearishInput', type: 'color', title: 'Overvalued Color', defval: '#ff0000' },
  { id: 'neutralInput', type: 'color', title: 'Fair Value Color', defval: '#787b86' },
  { id: 'enableOverlaySignals', type: 'bool', title: 'Show Valuation Extremes', defval: true },
  { id: 'enableBgSignals', type: 'bool', title: 'Enable Background Signals', defval: false },
  { id: 'bgTransparency', type: 'int', title: 'Background Transparency', defval: 70, min: 0, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Overvalued Threshold', color: String(color.new('#ff0000', 60)), lineWidth: 3 },
  { id: 'plot1', title: 'Undervalued Threshold', color: String(color.new('#00ffaa', 60)), lineWidth: 3 },
  { id: 'plot2', title: 'Valuation Score', color: String(color.new('#787b86', 50)), lineWidth: 2 },
  { id: 'plot3', title: 'Fair Value', color: String(color.new('#787b86', 80)), lineWidth: 1 },
];

export const metadata = {
  title: 'Relative Valuation Oscillator [QuantAlgo]',
  shortTitle: 'Relative Valuation Oscillator [QuantAlgo]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

function presetColors(cfg: RelativeValuationOscillatorInputs): [string, string, string] {
  switch (cfg.colorPreset) {
    case 'Classic': return ['#00ff00', '#ff0000', '#787b86'];
    case 'Aqua': return ['#00d4ff', '#ff8c00', '#5f6368'];
    case 'Cosmic': return ['#49ffce', '#9932cc', '#6b6d76'];
    case 'Cyber': return ['#00cccc', '#ff6600', '#7a7d85'];
    case 'Neon': return ['#ffff00', '#ff00ff', '#808080'];
    default: return [cfg.bullishInput, cfg.bearishInput, cfg.neutralInput];
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RelativeValuationOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  let lookback = cfg.lookbackPeriod;
  let threshold = cfg.thresholdMult;
  if (cfg.presetConfig === 'Fast Response') {
    lookback = 21;
    threshold = 1.5;
  } else if (cfg.presetConfig === 'Smooth Trend') {
    lookback = 60;
    threshold = 2;
  }
  const [bullish, bearish, neutral] = presetColors(cfg);

  // valuation_score = (log_price - sma(log_price)) / stdev(log_price): plain division (x / 0 is +-infinity)
  const logPrice = bars.map((b) => Math.log(b.close));
  const mean = A(ta.sma(S(logPrice), lookback));
  const sd = A(ta.stdev(S(logPrice), lookback));
  const score = logPrice.map((v, i) => (v - mean[i]) / sd[i]);

  const overColor = String(color.new(bearish, 60));
  const underColor = String(color.new(bullish, 60));
  const neutralFaded = String(color.new(neutral, 50));
  const fairColor = String(color.new(neutral, 80));
  const bgOver = String(color.new(bearish, cfg.bgTransparency));
  const bgUnder = String(color.new(bullish, cfg.bgTransparency));

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const plot2: { time: number; value: number; color: string }[] = [];
  const plot3: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const v = score[i];
    const isOver = gt(v, threshold);
    const isUnder = lt(v, -threshold);
    const shown = Number.isFinite(v) ? v : NaN; // plots and shapes show +-infinity as na
    plot0.push({ time: t, value: threshold, color: overColor });
    plot1.push({ time: t, value: -threshold, color: underColor });
    plot2.push({ time: t, value: shown, color: isOver ? bearish : isUnder ? bullish : neutralFaded });
    plot3.push({ time: t, value: 0, color: fairColor });

    if (!isNaN(shown)) {
      // plotshape(is_overvalued ? valuation_score : na, shape.circle, location.absolute, bearish, size.tiny)
      if (isOver) markers.push({ time: t, position: 'atPriceMiddle', price: shown, shape: 'circle', color: bearish, size: 'tiny', id: 'shape0' });
      if (isUnder) markers.push({ time: t, position: 'atPriceMiddle', price: shown, shape: 'circle', color: bullish, size: 'tiny', id: 'shape1' });
      // plotshape(enableOverlaySignals and is_overvalued ? valuation_score : na, location.abovebar, force_overlay)
      if (cfg.enableOverlaySignals && isOver) {
        markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: bearish, size: 'tiny', forceOverlay: true, id: 'shape2' });
      }
      if (cfg.enableOverlaySignals && isUnder) {
        markers.push({ time: t, position: 'belowBar', shape: 'circle', color: bullish, size: 'tiny', forceOverlay: true, id: 'shape3' });
      }
    }
    // bgcolor(enableBgSignals and is_overvalued ? color.new(bearish, bgTransparency) : na, force_overlay = true)
    if (cfg.enableBgSignals && isOver) bgColors.push({ time: t, color: bgOver, forceOverlay: true, id: 'bgcolor0' });
    if (cfg.enableBgSignals && isUnder) bgColors.push({ time: t, color: bgUnder, forceOverlay: true, id: 'bgcolor1' });
  }

  // overvalued_cross = ta.crossover(valuation_score, threshold_mult); undervalued_cross = ta.crossunder(valuation_score,
  // -threshold_mult); cross_above_zero / cross_below_zero = ta.crossover / ta.crossunder(valuation_score, 0)
  const overCross = crossedOver(score, threshold);
  const underCross = crossedUnder(score, -threshold);
  const anyExtreme = overCross.map((f, i) => f || underCross[i]);

  const fillArr = <T>(x: T) => new Array<T>(n).fill(x);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    fills: [
      // fill(upper_threshold, lower_threshold, color = color.new(neutral, 100))
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Fair Value Zone' }, colors: fillArr(String(color.new(neutral, 100))) },
      // fill(main_plot, fair_value_line, top_value = 0.5, bottom_value = -0.5, top_color = color.new(bearish, 80),
      //      bottom_color = color.new(bullish, 80))
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Valuation Glow' },
        gradient: { topValue: fillArr(0.5), bottomValue: fillArr(-0.5),
          topColor: fillArr<string | null>(String(color.new(bearish, 80))),
          bottomColor: fillArr<string | null>(String(color.new(bullish, 80))) } },
    ],
    markers,
    bgColors,
    alerts: alertStates(alertConditions, bars, [overCross, underCross, crossedOver(score, 0), crossedUnder(score, 0), anyExtreme]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Overvalued Threshold Crossed', message: 'Relative Valuation Oscillator: OVERVALUED threshold crossed on {{exchange}}:{{ticker}} - {{interval}}. Price may be statistically stretched to the upside.' },
  { id: 'alert1', title: 'Undervalued Threshold Crossed', message: 'Relative Valuation Oscillator: UNDERVALUED threshold crossed on {{exchange}}:{{ticker}} - {{interval}}. Price may be statistically stretched to the downside.' },
  { id: 'alert2', title: 'Crossed Above Fair Value (0)', message: 'Relative Valuation Oscillator: Crossed ABOVE Fair Value (0) on {{exchange}}:{{ticker}} - {{interval}}. Transitioning to overvaluation zone.' },
  { id: 'alert3', title: 'Crossed Below Fair Value (0)', message: 'Relative Valuation Oscillator: Crossed BELOW Fair Value (0) on {{exchange}}:{{ticker}} - {{interval}}. Transitioning to undervaluation zone.' },
  { id: 'alert4', title: 'Any Extreme Valuation', message: 'Relative Valuation Oscillator: Extreme valuation detected! Check chart {{exchange}}:{{ticker}} - {{interval}}' },
];

export const RelativeValuationOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
