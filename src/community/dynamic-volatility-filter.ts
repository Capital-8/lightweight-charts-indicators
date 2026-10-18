/**
 * Dynamic Volatility Filter
 *
 * A filter line that only moves when the source is further from it than a noise threshold (ATR * noise multiplier).
 * Then the line moves toward the source by (source - line) * catch-up speed; else it stays flat. The trend is up
 * while the line rises, down while it falls; on a flat line it keeps the last direction, or turns neutral with
 * "Show Neutral". Four fills of fading transparency go from the line to the source, and optional bands at the line
 * +/- the threshold have a fill between them. Optional bar and background colours by trend. Presets override the
 * noise multiplier, the ATR period and the catch-up speed.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Trend Signal' / 'Bearish Trend Signal' (the trend turns
 * up / down) and 'Any Trend Change' (either).
 *
 * Reference: "Dynamic Volatility Filter [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DynamicVolatilityFilterInputs {
  /** 'Default' | 'Fast Response' | 'Smooth Trend' (the presets override noiseMult, lookback and snapSpeed) */
  preset: string;
  /** Price source */
  src: SourceType;
  /** ATR multiplier of the noise threshold */
  noiseMult: number;
  /** ATR period */
  lookback: number;
  /** Catch-up speed: fraction of the distance to the source the line moves when the threshold is broken */
  snapSpeed: number;
  showBands: boolean;
  /** Neutral colour while the line is flat */
  showNeutral: boolean;
  /** 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom' (Custom uses bullishColor / bearishColor) */
  colorPreset: string;
  bullishColor: string;
  bearishColor: string;
  neutralColor: string;
  /** Bar colours by trend */
  showCandles: boolean;
  barTransparency: number;
  /** Background colours by trend */
  showBgColor: boolean;
  bgTransparency: number;
}

export const defaultInputs: DynamicVolatilityFilterInputs = {
  preset: 'Default',
  src: 'close',
  noiseMult: 2.0,
  lookback: 20,
  snapSpeed: 0.3,
  showBands: true,
  showNeutral: false,
  colorPreset: 'Custom',
  bullishColor: '#00ffaa',
  bearishColor: '#ff0000',
  neutralColor: '#808080',
  showCandles: false,
  barTransparency: 0,
  showBgColor: false,
  bgTransparency: 90,
};

export const inputConfig: InputConfig[] = [
  { id: 'preset', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'src', type: 'source', title: 'Price Source', defval: 'close' },
  { id: 'noiseMult', type: 'float', title: 'Noise Filter', defval: 2.0, min: 0.5, step: 0.1 },
  { id: 'lookback', type: 'int', title: 'Volatility Period', defval: 20, min: 1 },
  { id: 'snapSpeed', type: 'float', title: 'Catch-up Speed', defval: 0.3, min: 0.05, max: 1.0, step: 0.05 },
  { id: 'showBands', type: 'bool', title: 'Show Volatility Bands', defval: true },
  { id: 'showNeutral', type: 'bool', title: 'Show Neutral', defval: false },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#ff0000' },
  { id: 'neutralColor', type: 'color', title: 'Neutral Color', defval: '#808080' },
  { id: 'showCandles', type: 'bool', title: 'Enable Bar Coloring', defval: false },
  { id: 'barTransparency', type: 'int', title: 'Bar Color Transparency', defval: 0, min: 0, max: 100 },
  { id: 'showBgColor', type: 'bool', title: 'Enable Background Coloring', defval: false },
  { id: 'bgTransparency', type: 'int', title: 'Background Color Transparency', defval: 90, min: 0, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Dynamic Volatility Filter Line', color: '#00ffaa', lineWidth: 4, style: 'linebr' },
  { id: 'plot1', title: 'Filter Line (fill)', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Mid 1', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Mid 2', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Mid 3', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Source', color: '#2962ff', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Upper Band', color: String(color.new('#00ffaa', 60)), lineWidth: 2 },
  { id: 'plot7', title: 'Lower Band', color: String(color.new('#00ffaa', 60)), lineWidth: 2 },
];

export const metadata = {
  title: 'Dynamic Volatility Filter [QuantAlgo]',
  shortTitle: 'Dynamic Volatility Filter [QuantAlgo]',
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
  inputs: Partial<DynamicVolatilityFilterInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  let { noiseMult, lookback, snapSpeed } = cfg;
  if (cfg.preset === 'Fast Response') {
    noiseMult = 1.2;
    lookback = 12;
    snapSpeed = 0.5;
  } else if (cfg.preset === 'Smooth Trend') {
    noiseMult = 2.8;
    lookback = 35;
    snapSpeed = 0.2;
  }
  const [bullish, bearish] = COLOR_PRESETS[cfg.colorPreset] ?? [cfg.bullishColor, cfg.bearishColor];

  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const atr = ta.atr(bars, lookback).toArray().map((v) => v ?? NaN);

  const line: number[] = new Array(n);
  const threshold: number[] = new Array(n);
  const lineColor: string[] = new Array(n);
  let dvf = NaN; // var float dvf_line = na
  let trendDir = 0; // var int trend_dir = 0
  const turnedBull: boolean[] = [], turnedBear: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const prevDir = i > 0 ? trendDir : NaN; // trend_dir[1] (na on the first bar: != compares false)
    threshold[i] = atr[i] * noiseMult;
    const prev = dvf;
    if (isNaN(dvf)) {
      dvf = src[i];
    } else {
      const diff = src[i] - dvf;
      if (gt(Math.abs(diff), threshold[i])) dvf = dvf + diff * snapSpeed;
    }
    line[i] = dvf;
    // dvf_line > dvf_line[1] / dvf_line < dvf_line[1] (dvf_line[1] is na on bar 0)
    if (gt(dvf, prev)) trendDir = 1;
    else if (gt(prev, dvf)) trendDir = -1;
    else trendDir = cfg.showNeutral ? 0 : trendDir;
    lineColor[i] = trendDir === 1 ? bullish : trendDir === -1 ? bearish : cfg.neutralColor;
    // turned_bullish = trend_dir == 1 and trend_dir[1] != 1; turned_bearish = trend_dir == -1 and trend_dir[1] != -1
    turnedBull.push(trendDir === 1 && !isNaN(prevDir) && prevDir !== 1);
    turnedBear.push(trendDir === -1 && !isNaN(prevDir) && prevDir !== -1);
  }

  const t = (i: number) => bars[i].time;
  const plot = (f: (i: number) => number, c?: (i: number) => string) =>
    bars.map((_b, i) => (c ? { time: t(i), value: f(i), color: c(i) } : { time: t(i), value: f(i) }));
  const mid = (k: number) => (i: number) => line[i] + (src[i] - line[i]) * k;
  const band60 = lineColor.map((c) => String(color.new(c, 60)));
  const layer = (tr: number) => lineColor.map((c) => String(color.new(c, tr)));

  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    // barcolor(show_candles ? color.new(line_color, bar_trans) : na); bgcolor(show_bgcolor ? color.new(line_color, bg_trans) : na)
    if (cfg.showCandles) barColors.push({ time: t(i), color: String(color.new(lineColor[i], cfg.barTransparency)) });
    if (cfg.showBgColor) bgColors.push({ time: t(i), color: String(color.new(lineColor[i], cfg.bgTransparency)) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(dvf_line, 'Dynamic Volatility Filter Line', line_color, linewidth = 4, style = plot.style_linebr)
      plot0: plot((i) => line[i], (i) => lineColor[i]),
      // fill anchors (display.none): dvf_line, mid1, mid2, mid3, src
      plot1: plot((i) => line[i]),
      plot2: plot(mid(0.25)),
      plot3: plot(mid(0.5)),
      plot4: plot(mid(0.75)),
      plot5: plot((i) => src[i]),
      // plot(show_bands ? dvf_line +/- threshold : na, color.new(line_color, 60), linewidth = 2, linestyle dotted)
      plot6: plot((i) => (cfg.showBands ? line[i] + threshold[i] : NaN), (i) => band60[i]),
      plot7: plot((i) => (cfg.showBands ? line[i] - threshold[i] : NaN), (i) => band60[i]),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot2', colors: layer(55) },
      { plot1: 'plot2', plot2: 'plot3', colors: layer(70) },
      { plot1: 'plot3', plot2: 'plot4', colors: layer(82) },
      { plot1: 'plot4', plot2: 'plot5', colors: layer(92) },
      // fill(p1, p2, color.new(line_color, show_bands ? 92 : 100))
      { plot1: 'plot6', plot2: 'plot7', colors: layer(cfg.showBands ? 92 : 100) },
    ],
    markers: [],
    barColors,
    bgColors,
    // trend_changed = turned_bullish or turned_bearish
    alerts: alertStates(alertConditions, bars, [turnedBull, turnedBear, turnedBull.map((b, i) => b || turnedBear[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Signal', message: 'Dynamic Volatility Filter: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Trend Signal', message: 'Dynamic Volatility Filter: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Any Trend Change', message: 'Dynamic Volatility Filter: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}' },
];

export const DynamicVolatilityFilter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
