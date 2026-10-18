/**
 * Dynamic Score PSAR [QuantAlgo]
 *
 * The distance of the close to the Parabolic SAR, divided by the 21-bar EMA of the high - low range (x 100), is drawn
 * as columns. The trend score counts, over the last `Window Length` bars, +1 for each past value below the current
 * value and -1 otherwise. Uptrend: positive value and score above the uptrend threshold; downtrend: negative value
 * and score below the downtrend threshold. Columns, bands at +-600 / +-900 and bars are coloured by the trend (a
 * gradient on the value), with markers and background colours when the value crosses zero in a confirmed trend.
 * Presets replace the PSAR and score settings.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Reversal' / 'Bearish Reversal' (the signals), and
 * 'Histogram Turned Bullish' / 'Bearish' / 'Neutral' (first bar of an uptrend / downtrend / neutral state).
 *
 * Reference: "Dynamic Score PSAR [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type DynamicScorePsarPreset = 'Default' | 'Fast Response' | 'Smooth Trend';

export interface DynamicScorePsarInputs {
  /** Preset: 'Fast Response' and 'Smooth Trend' replace the PSAR and score settings */
  presetConfig: DynamicScorePsarPreset;
  psarStart: number;
  psarIncrement: number;
  psarMax: number;
  /** Number of past bars of the trend score */
  windowLen: number;
  uptrendThreshold: number;
  downtrendThreshold: number;
  bullishColor: string;
  bearishColor: string;
  neutralColor: string;
  /** Colour the price bars by the trend */
  colorBars: boolean;
}

export const defaultInputs: DynamicScorePsarInputs = {
  presetConfig: 'Default',
  psarStart: 0.02,
  psarIncrement: 0.0005,
  psarMax: 0.2,
  windowLen: 60,
  uptrendThreshold: 30,
  downtrendThreshold: -20,
  bullishColor: '#00ffaa',
  bearishColor: '#ff0000',
  neutralColor: '#787b86',
  colorBars: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'psarStart', type: 'float', title: 'PSAR Start', defval: 0.02, min: 0.0, step: 0.001 },
  { id: 'psarIncrement', type: 'float', title: 'PSAR Increment', defval: 0.0005, min: 0.0, step: 0.001 },
  { id: 'psarMax', type: 'float', title: 'PSAR Max Value', defval: 0.2, step: 0.001 },
  { id: 'windowLen', type: 'int', title: 'Window Length', defval: 60 },
  { id: 'uptrendThreshold', type: 'int', title: 'Uptrend Threshold', defval: 30 },
  { id: 'downtrendThreshold', type: 'int', title: 'Downtrend Threshold', defval: -20 },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#ff0000' },
  { id: 'neutralColor', type: 'color', title: 'Neutral Color', defval: '#787b86' },
  { id: 'colorBars', type: 'bool', title: 'Color Bars?', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Dynamic PSAR', color: '#787b86', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Upper OB', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot2', title: 'Upper OS', color: '#ff0000', lineWidth: 1 },
  { id: 'plot3', title: 'Lower OB', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot4', title: 'Lower OS', color: '#ff0000', lineWidth: 1 },
];

export const metadata = {
  title: 'Dynamic Score PSAR [QuantAlgo]',
  shortTitle: 'Dynamic Score PSAR [QuantAlgo]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const PRESETS: Record<string, { start: number; inc: number; max: number; window: number; up: number; down: number }> = {
  'Fast Response': { start: 0.04, inc: 0.002, max: 0.3, window: 30, up: 15, down: -10 },
  'Smooth Trend': { start: 0.01, inc: 0.0002, max: 0.15, window: 100, up: 50, down: -35 },
};

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicScorePsarInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const p = PRESETS[cfg.presetConfig] ?? {
    start: cfg.psarStart, inc: cfg.psarIncrement, max: cfg.psarMax,
    window: cfg.windowLen, up: cfg.uptrendThreshold, down: cfg.downtrendThreshold,
  };

  // normalized_psar = (close - ta.sar(...)) / ta.ema(high - low, 21) * 100. On flat bars (high == low) the EMA is 0:
  // Pine gives +-infinity for a non-zero value / 0 (it compares and colours as +-infinity; the plot draws nothing)
  const sar = A(ta.sar(bars, p.start, p.inc, p.max));
  const rangeEma = A(ta.ema(Series.fromArray(bars, bars.map((b) => b.high - b.low)), 21));
  const np = bars.map((b, i) => ((b.close - sar[i]) / rangeEma[i]) * 100);

  const bullFaded = String(color.new(cfg.bullishColor, 40));
  const bearFaded = String(color.new(cfg.bearishColor, 40));
  const bullBg = String(color.new(cfg.bullishColor, 70));
  const bearBg = String(color.new(cfg.bearishColor, 70));

  type Point = { time: number; value: number; color: string };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const flags: boolean[][] = [[], [], [], [], []];
  let prevLong = false, prevShort = false; // long_condition[1] / short_condition[1] (false before the first bar)

  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const v = np[i];
    // dynamic_score(): +1 when normalized_psar > normalized_psar[k + 1], else -1 (na history: -1)
    let score = 0;
    for (let k = 0; k < p.window; k++) {
      const past = i - k - 1 >= 0 ? np[i - k - 1] : NaN;
      score += gt(v, past) ? 1 : -1;
    }
    const longCondition = gt(v, 0) && gt(score, p.up);
    const shortCondition = lt(v, 0) && lt(score, p.down);
    // ta.crossover(x, 0): x > 0 and x[1] <= 0; ta.crossunder(x, 0): x < 0 and x[1] >= 0 (exact comparisons)
    const prev = i > 0 ? np[i - 1] : NaN;
    const bullishSignal = v > 0 && prev <= 0 && longCondition;
    const bearishSignal = v < 0 && prev >= 0 && shortCondition;
    flags[0].push(bullishSignal);
    flags[1].push(bearishSignal);
    flags[2].push(longCondition && !prevLong);
    flags[3].push(shortCondition && !prevShort);
    flags[4].push(!longCondition && !shortCondition && (prevLong || prevShort));
    prevLong = longCondition;
    prevShort = shortCondition;

    const uptrendColor = color.from_gradient(v, 0, 400, bullFaded, cfg.bullishColor);
    const downtrendColor = color.from_gradient(v, -400, 0, cfg.bearishColor, bearFaded);
    const finalColor = longCondition ? uptrendColor : shortCondition ? downtrendColor : cfg.neutralColor;

    plot0.push({ time: t, value: Number.isFinite(v) ? v : NaN, color: finalColor });
    plot1.push({ time: t, value: 900, color: uptrendColor });
    plot2.push({ time: t, value: -900, color: downtrendColor });
    plot3.push({ time: t, value: 600, color: uptrendColor });
    plot4.push({ time: t, value: -600, color: downtrendColor });

    // plotchar(bearish_signal ? 400 : na, '▼', location.absolute, bearish_color, size.tiny); bullish at -400
    if (bearishSignal) {
      markers.push({ time: t, position: 'atPriceMiddle', price: 400, shape: 'circle', color: 'transparent', text: '▼',
        textColor: cfg.bearishColor, size: 'tiny' });
    }
    if (bullishSignal) {
      markers.push({ time: t, position: 'atPriceMiddle', price: -400, shape: 'circle', color: 'transparent', text: '▲',
        textColor: cfg.bullishColor, size: 'tiny' });
    }

    if (cfg.colorBars) {
      barColors.push({ time: t, color: longCondition ? cfg.bullishColor : shortCondition ? cfg.bearishColor : cfg.neutralColor,
        id: 'barcolor0' });
    }
    if (bullishSignal) bgColors.push({ time: t, color: bullBg, id: 'bgcolor0' });
    if (bearishSignal) bgColors.push({ time: t, color: bearBg, id: 'bgcolor1' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    hlines: [{ value: 0, options: { title: '0 Line', color: '#787b86', linestyle: 'solid' } }],
    fills: [
      // fill(obupper, oblower, color.new(bullish_color, 90)) / fill(osupper, oslower, color.new(bearish_color, 90))
      { plot1: 'plot1', plot2: 'plot3', options: { title: 'OB Fill' }, colors: new Array<string>(n).fill(String(color.new(cfg.bullishColor, 90))) },
      { plot1: 'plot2', plot2: 'plot4', options: { title: 'OS Fill' }, colors: new Array<string>(n).fill(String(color.new(cfg.bearishColor, 90))) },
    ],
    markers,
    barColors,
    bgColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Reversal', message: 'Dynamic Score PSAR crossed above zero line with bullish confirmation' },
  { id: 'alert1', title: 'Bearish Reversal', message: 'Dynamic Score PSAR crossed below zero line with bearish confirmation' },
  { id: 'alert2', title: 'Histogram Turned Bullish', message: 'Dynamic Score PSAR histogram turned bullish (green)' },
  { id: 'alert3', title: 'Histogram Turned Bearish', message: 'Dynamic Score PSAR histogram turned bearish (red)' },
  { id: 'alert4', title: 'Histogram Turned Neutral', message: 'Dynamic Score PSAR histogram turned neutral (grey)' },
];

export const DynamicScorePsar = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
