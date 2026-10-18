/**
 * Asymmetric Volatility Trend Line
 *
 * A trend line with a volatility threshold: stdev(source, lookback) * multiplier. In an up trend (or no trend yet)
 * the line ratchets up to source - threshold / 4 when the source is above the line + threshold / 2, and flips down
 * to source + threshold / 4 when the source falls below the line - threshold. In a down trend it is the mirror:
 * ratchets down with half the threshold, flips up with the full threshold. The line is bullish or bearish coloured
 * by trend; four fills of fading transparency go from the line to the source; a "⦿" marks the line value on the bar
 * before each direction change. Optional bar and background colours by trend. Presets override the multiplier and
 * the lookback.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Trend Signal' / 'Bearish Trend Signal' on the bars where
 * the direction turns to 1 from -1 / to -1 from 1, 'Any Trend Change' on both.
 *
 * Reference: "Asymmetric Volatility Trend Line [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AsymmetricVolatilityTrendLineInputs {
  /** 'Default' | 'Fast Response' | 'Smooth Trend' (the presets override thresholdMult and lookback) */
  preset: string;
  /** Price source */
  src: SourceType;
  /** Multiplier of the standard deviation threshold */
  thresholdMult: number;
  /** Standard deviation lookback */
  lookback: number;
  /** 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom' (Custom uses bullishColor / bearishColor) */
  colorPreset: string;
  bullishColor: string;
  bearishColor: string;
  /** Bar colours by trend */
  showCandles: boolean;
  barTransparency: number;
  /** Background colours by trend */
  showBgColor: boolean;
  bgTransparency: number;
}

export const defaultInputs: AsymmetricVolatilityTrendLineInputs = {
  preset: 'Default',
  src: 'close',
  thresholdMult: 1.5,
  lookback: 20,
  colorPreset: 'Custom',
  bullishColor: '#00ffaa',
  bearishColor: '#ff0000',
  showCandles: false,
  barTransparency: 0,
  showBgColor: false,
  bgTransparency: 90,
};

export const inputConfig: InputConfig[] = [
  { id: 'preset', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'src', type: 'source', title: 'Price Source', defval: 'close' },
  { id: 'thresholdMult', type: 'float', title: 'Threshold Multiplier', defval: 1.5, min: 0.1, step: 0.05 },
  { id: 'lookback', type: 'int', title: 'Volatility Lookback', defval: 20, min: 1 },
  { id: 'colorPreset', type: 'string', title: 'Colour Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullishColor', type: 'color', title: 'Bullish Colour', defval: '#00ffaa' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Colour', defval: '#ff0000' },
  { id: 'showCandles', type: 'bool', title: 'Enable Bar Colouring', defval: false },
  { id: 'barTransparency', type: 'int', title: 'Bar Colour Transparency', defval: 0, min: 0, max: 100 },
  { id: 'showBgColor', type: 'bool', title: 'Enable Background Colouring', defval: false },
  { id: 'bgTransparency', type: 'int', title: 'Background Colour Transparency', defval: 90, min: 0, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend Line', color: '#00ffaa', lineWidth: 4, style: 'linebr' },
  { id: 'plot1', title: 'Trend Line (fill)', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Mid 1', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Mid 2', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Mid 3', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Source', color: '#2962ff', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Asymmetric Volatility Trend Line [QuantAlgo]',
  shortTitle: 'Asymmetric Volatility Trend Line [QuantAlgo]',
  overlay: true,
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;

const COLOR_PRESETS: Record<string, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

export function calculate(
  bars: Bar[],
  inputs: Partial<AsymmetricVolatilityTrendLineInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  let { thresholdMult, lookback } = cfg;
  if (cfg.preset === 'Fast Response') {
    thresholdMult = 1.0;
    lookback = 12;
  } else if (cfg.preset === 'Smooth Trend') {
    thresholdMult = 2.5;
    lookback = 35;
  }
  const [bullish, bearish] = COLOR_PRESETS[cfg.colorPreset] ?? [cfg.bullishColor, cfg.bearishColor];

  const srcSeries = getSourceSeries(bars, cfg.src);
  const src = srcSeries.toArray().map((v) => v ?? NaN);
  const sd = ta.stdev(srcSeries, lookback).toArray().map((v) => v ?? NaN);

  const line: number[] = new Array(n);
  const lineColor: string[] = new Array(n);
  const reversal: boolean[] = new Array(n);
  const dirs: number[] = new Array(n);
  let tl = NaN; // var float trend_line = na
  let dir = 0; // var int trend_dir = 0
  let prevDir = 0; // var int prev_dir = 0
  for (let i = 0; i < n; i++) {
    const vt = sd[i] * thresholdMult;
    const s = src[i];
    if (isNaN(tl)) {
      tl = s;
    } else {
      prevDir = dir;
      if (dir >= 0) {
        if (gt(s, tl + vt * 0.5)) {
          tl = Math.max(tl, s - vt * 0.25);
          dir = 1;
        } else if (gt(tl - vt, s)) {
          tl = s + vt * 0.25;
          dir = -1;
        }
      } else if (gt(tl - vt * 0.5, s)) {
        tl = Math.min(tl, s + vt * 0.25);
        dir = -1;
      } else if (gt(s, tl + vt)) {
        tl = s - vt * 0.25;
        dir = 1;
      }
    }
    line[i] = tl;
    // is_reversal = trend_dir != prev_dir and bar_index > 0 (prev_dir is 0 on the first bar, as trend_dir)
    reversal[i] = dir !== prevDir && i > 0;
    lineColor[i] = dir === 1 ? bullish : bearish;
    dirs[i] = dir;
  }

  // turned_bullish = trend_dir == 1 and trend_dir[1] == -1; turned_bearish the mirror; trend_changed = either
  const turnedBullish = dirs.map((d, i) => i > 0 && d === 1 && dirs[i - 1] === -1);
  const turnedBearish = dirs.map((d, i) => i > 0 && d === -1 && dirs[i - 1] === 1);
  const trendChanged = turnedBullish.map((f, i) => f || turnedBearish[i]);

  const t = (i: number) => bars[i].time;
  const plot = (f: (i: number) => number, c?: (i: number) => string) =>
    bars.map((_b, i) => (c ? { time: t(i), value: f(i), color: c(i) } : { time: t(i), value: f(i) }));
  const mid = (k: number) => (i: number) => line[i] + (src[i] - line[i]) * k;
  const layer = (tr: number) => lineColor.map((c) => String(color.new(c, tr)));

  const interval = barInterval(bars);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    // plotchar(is_reversal ? trend_line[1] : na, 'Reversal', '⦿', location.absolute, color = line_color,
    //          size = size.small, offset = -1): the value of bar i is drawn on bar i - 1
    if (reversal[i] && i > 0 && !isNaN(line[i - 1])) {
      markers.push({ time: barTime(bars, i - 1, interval), position: 'atPriceMiddle', price: line[i - 1], shape: 'circle',
        color: 'transparent', text: '⦿', textColor: lineColor[i], size: 'small' });
    }
    // barcolor(show_candles ? color.new(line_color, bar_trans) : na); bgcolor(show_bgcolor ? color.new(line_color, bg_trans) : na)
    if (cfg.showCandles) barColors.push({ time: t(i), color: String(color.new(lineColor[i], cfg.barTransparency)) });
    if (cfg.showBgColor) bgColors.push({ time: t(i), color: String(color.new(lineColor[i], cfg.bgTransparency)) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(trend_line, 'Trend Line', line_color, linewidth = 4, style = plot.style_linebr)
      plot0: plot((i) => line[i], (i) => lineColor[i]),
      // fill anchors (display.none): trend_line, mid1, mid2, mid3, src
      plot1: plot((i) => line[i]),
      plot2: plot(mid(0.25)),
      plot3: plot(mid(0.5)),
      plot4: plot(mid(0.75)),
      plot5: plot((i) => src[i]),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot2', colors: layer(55) },
      { plot1: 'plot2', plot2: 'plot3', colors: layer(70) },
      { plot1: 'plot3', plot2: 'plot4', colors: layer(82) },
      { plot1: 'plot4', plot2: 'plot5', colors: layer(92) },
    ],
    markers,
    barColors,
    bgColors,
    alerts: alertStates(alertConditions, bars, [turnedBullish, turnedBearish, trendChanged]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0', title: 'Bullish Trend Signal',
    message: 'Asymmetric Volatility Trend Line: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}',
  },
  {
    id: 'alert1', title: 'Bearish Trend Signal',
    message: 'Asymmetric Volatility Trend Line: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}',
  },
  {
    id: 'alert2', title: 'Any Trend Change',
    message: 'Asymmetric Volatility Trend Line: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}',
  },
];

export const AsymmetricVolatilityTrendLine = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
