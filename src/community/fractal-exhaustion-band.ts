/**
 * Fractal Exhaustion Band
 *
 * A trailing trend line whose distance to price is ATR(10) * sensitivity * (1 + FDI), where FDI is the Fractal
 * Dimension Index over `power` bars: (log(path length of the source) - log(highest high - lowest low)) / log(power).
 * In an uptrend the line only rises (and only while FDI < 1.5); the trend flips down when close falls below the line
 * minus the buffer, and the line restarts at close + buffer / 2 (mirror rules in a downtrend). The band edge is the
 * extreme high (uptrend) or low (downtrend) since the flip, the mid line is the average of the edge and the trend
 * line. Lines, fills, flip circles, and optional candle and background colours follow the trend; the lines and fills
 * are not drawn on the flip bar. The presets replace the FDI period and the band width multiplier, as in Pine.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Trend', 'Bearish Trend' and 'Any Signal Change' on the
 * trend flips.
 *
 * Reference: "Fractal Exhaustion Band [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type FractalExhaustionPreset = 'Default' | 'Fast Response' | 'Smooth Trend';
export type FractalExhaustionColorPreset = 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom';

export interface FractalExhaustionBandInputs {
  /** Preset configuration; other than Default it replaces power and sensitivity */
  presetInput: FractalExhaustionPreset;
  /** Source */
  src: SourceType;
  /** FDI period */
  power: number;
  /** Band width multiplier */
  sensitivity: number;
  /** Colour preset; Custom uses bullColorInput / bearColorInput */
  colorPresetInput: FractalExhaustionColorPreset;
  bullColorInput: string;
  bearColorInput: string;
  /** Colour the candles with the trend colour */
  paintBarsInput: boolean;
  /** Candle colour transparency (0..100) */
  barTranspInput: number;
  /** Colour the background with the trend colour */
  paintBgInput: boolean;
  /** Background transparency (0..100) */
  bgTranspInput: number;
  /** Fill between the band edge, the mid line and the trend line */
  showFillInput: boolean;
}

export const defaultInputs: FractalExhaustionBandInputs = {
  presetInput: 'Default',
  src: 'close',
  power: 20,
  sensitivity: 1.2,
  colorPresetInput: 'Custom',
  bullColorInput: '#00ffaa',
  bearColorInput: '#ff0000',
  paintBarsInput: false,
  barTranspInput: 30,
  paintBgInput: false,
  bgTranspInput: 90,
  showFillInput: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'presetInput', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'power', type: 'int', title: 'FDI Period', defval: 20 },
  { id: 'sensitivity', type: 'float', title: 'Band Width Multiplier', defval: 1.2, step: 0.1 },
  { id: 'colorPresetInput', type: 'string', title: 'Colour Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullColorInput', type: 'color', title: 'Uptrend', defval: '#00ffaa' },
  { id: 'bearColorInput', type: 'color', title: 'Downtrend', defval: '#ff0000' },
  { id: 'paintBarsInput', type: 'bool', title: 'Colour Candles', defval: false },
  { id: 'barTranspInput', type: 'int', title: 'Candle Transparency', defval: 30, min: 0, max: 100 },
  { id: 'paintBgInput', type: 'bool', title: 'Colour Background', defval: false },
  { id: 'bgTranspInput', type: 'int', title: 'Background Transparency', defval: 90, min: 0, max: 100 },
  { id: 'showFillInput', type: 'bool', title: 'Show Band Fill', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Band Edge', color: '#00ffaa', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Band Mid', color: '#00ffaa', lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Fractal Line', color: '#00ffaa', lineWidth: 3, style: 'linebr' },
];

export const metadata = {
  title: 'Fractal Exhaustion Band',
  shortTitle: 'Fractal Exhaustion Band',
  overlay: true,
};

const COLOR_PRESETS: Record<Exclude<FractalExhaustionColorPreset, 'Custom'>, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

/** Pine float comparison: a > b only when a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;
/** Pine math.max / math.min: na when an argument is na */
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));

export function calculate(
  bars: Bar[],
  inputs: Partial<FractalExhaustionBandInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  let { power, sensitivity } = cfg;
  if (cfg.presetInput === 'Fast Response') {
    power = 10;
    sensitivity = 0.7;
  } else if (cfg.presetInput === 'Smooth Trend') {
    power = 40;
    sensitivity = 2.0;
  }
  const [bullColor, bearColor] = cfg.colorPresetInput === 'Custom'
    ? [cfg.bullColorInput, cfg.bearColorInput] : COLOR_PRESETS[cfg.colorPresetInput];
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.src));
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const highest = A(ta.highest(new Series(bars, (b) => b.high), power));
  const lowest = A(ta.lowest(new Series(bars, (b) => b.low), power));
  const atr = A(ta.atr(bars, 10));

  const trendLine: number[] = new Array(n);
  const trendDir: number[] = new Array(n);
  const ex: number[] = new Array(n);
  let tl = NaN;
  let dir = 1;
  for (let i = 0; i < n; i++) {
    // len = sum of |src[k] - src[k + 1]| for k = 0 to power - 2 (na before the first bars)
    let len = 0;
    for (let k = 0; k <= power - 2; k++) {
      const a = i - k >= 0 ? src[i - k] : NaN;
      const b = i - k - 1 >= 0 ? src[i - k - 1] : NaN;
      len += Math.abs(a - b);
    }
    const range = highest[i] - lowest[i];
    // fdi = high_ - low_ > 0 ? (log(len) - log(high_ - low_)) / log(power) : 0 (na range: 0)
    const fdi = gt(range, 0) ? (Math.log(len) - Math.log(range)) / Math.log(power) : 0;
    const buffer = atr[i] * (sensitivity * (1 + fdi));
    const close = bars[i].close;

    if (isNaN(tl)) tl = src[i];
    if (dir >= 0) {
      if (gt(tl - buffer, close)) {
        dir = -1;
        tl = close + buffer * 0.5;
      } else if (gt(1.5, fdi)) {
        tl = max(tl, close - buffer);
      }
    } else if (gt(close, tl + buffer)) {
      dir = 1;
      tl = close - buffer * 0.5;
    } else if (gt(1.5, fdi)) {
      tl = min(tl, close + buffer);
    }
    trendLine[i] = tl;
    trendDir[i] = dir;

    // ex := trend_dir != trend_dir[1] ? (up ? high : low) : up ? max(nz(ex[1], high), high) : min(nz(ex[1], low), low)
    // (trend_dir[1] is na on the first bar: the comparison is false)
    const prevDir = i > 0 ? trendDir[i - 1] : NaN;
    const prevEx = i > 0 && !isNaN(ex[i - 1]) ? ex[i - 1] : NaN;
    if (i > 0 && dir !== prevDir) ex[i] = dir === 1 ? high[i] : low[i];
    else ex[i] = dir === 1 ? Math.max(isNaN(prevEx) ? high[i] : prevEx, high[i]) : Math.min(isNaN(prevEx) ? low[i] : prevEx, low[i]);
  }

  const edgePlot: { time: number; value: number; color: string }[] = [];
  const midPlot: { time: number; value: number; color: string }[] = [];
  const trailPlot: { time: number; value: number; color: string }[] = [];
  const edgeFill: string[] = [];
  const trailFill: string[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const bullFlags: boolean[] = [];
  const bearFlags: boolean[] = [];
  const c = (col: string, transp: number) => String(color.new(col, transp));
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const dir = trendDir[i];
    const prevDir = i > 0 ? trendDir[i - 1] : NaN;
    const currentColor = dir === 1 ? bullColor : bearColor;
    // noColor = trend_dir != trend_dir[1] (false on the first bar)
    const noColor = i > 0 && dir !== prevDir;
    // mid = math.avg(ex, trend_line)
    const mid = (ex[i] + trendLine[i]) / 2;
    edgePlot.push({ time: t, value: ex[i], color: noColor ? 'transparent' : c(currentColor, 40) });
    midPlot.push({ time: t, value: mid, color: noColor ? 'transparent' : c(currentColor, 55) });
    trailPlot.push({ time: t, value: trendLine[i], color: noColor ? 'transparent' : currentColor });
    edgeFill.push(noColor || !cfg.showFillInput ? 'transparent' : c(currentColor, 85));
    trailFill.push(noColor || !cfg.showFillInput ? 'transparent' : c(currentColor, 70));

    // plotshape(bullFlip ? trend_line : na, circle, absolute, bullColor, tiny) and the glow (transparency 50, small)
    const bullFlip = dir === 1 && prevDir === -1;
    const bearFlip = dir === -1 && prevDir === 1;
    if (bullFlip && !isNaN(trendLine[i])) {
      markers.push({ time: t, position: 'atPriceMiddle', price: trendLine[i], shape: 'circle', color: bullColor, size: 'tiny', id: 'shape0' });
      markers.push({ time: t, position: 'atPriceMiddle', price: trendLine[i], shape: 'circle', color: c(bullColor, 50), size: 'small', id: 'shape1' });
    }
    if (bearFlip && !isNaN(trendLine[i])) {
      markers.push({ time: t, position: 'atPriceMiddle', price: trendLine[i], shape: 'circle', color: bearColor, size: 'tiny', id: 'shape2' });
      markers.push({ time: t, position: 'atPriceMiddle', price: trendLine[i], shape: 'circle', color: c(bearColor, 50), size: 'small', id: 'shape3' });
    }
    bullFlags.push(bullFlip);
    bearFlags.push(bearFlip);
    if (cfg.paintBarsInput) barColors.push({ time: t, color: c(currentColor, cfg.barTranspInput) });
    if (cfg.paintBgInput) bgColors.push({ time: t, color: c(currentColor, cfg.bgTranspInput) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: edgePlot, plot1: midPlot, plot2: trailPlot },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', colors: edgeFill },
      { plot1: 'plot1', plot2: 'plot2', colors: trailFill },
    ],
    markers,
    barColors,
    bgColors,
    // alertcondition(bullFlip) / alertcondition(bearFlip) / alertcondition(bullFlip or bearFlip)
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags, bullFlags.map((b, i) => b || bearFlags[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend', message: 'Fractal Exhaustion Band [QuantAlgo]: Bullish trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Trend', message: 'Fractal Exhaustion Band [QuantAlgo]: Bearish trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Any Signal Change', message: 'Fractal Exhaustion Band [QuantAlgo]: Trend direction flipped on {{exchange}}:{{ticker}} - {{interval}}' },
];

export const FractalExhaustionBand = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
