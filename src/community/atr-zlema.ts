/**
 * ATR ZLEMA
 *
 * A zero-lag EMA (EMA of source + (source - source[lag])) that only moves when its new value differs from the last
 * kept value by more than ATR * noise filter. An ATR trailing line (ZLEMA -/+ ATR * multiplier) follows the ZLEMA
 * and flips side when the ZLEMA crosses it; the trend (up / down) colours the trailing line, a gradient cloud
 * between the line and the ZLEMA, triangle signals on the flips and the price bars.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Trend' / 'Bearish Trend' on the flips up / down,
 * 'Any Trend Change' on both.
 *
 * Reference: "ATR ZLEMA [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ATRZLEMAInputs {
  /** Price source of the ZLEMA */
  source: SourceType;
  zlemaLength: number;
  atrLength: number;
  atrMultiplier: number;
  /** ZLEMA only updates when its change is larger than ATR * noiseFilter */
  enableNoiseFilter: boolean;
  noiseFilter: number;
  /** 'Default' keeps the four inputs above; the other presets replace them */
  presetConfig: 'Default' | 'Fast Response' | 'Smooth Trend';
  colorPreset: 'Classic' | 'Aqua' | 'Cosmic' | 'Ember' | 'Neon' | 'Custom';
  /** Used with colorPreset 'Custom' */
  bullColorInput: string;
  bearColorInput: string;
  cloudTransparency: number;
  barTransparency: number;
  showShapes: boolean;
  enableBarColoring: boolean;
}

export const defaultInputs: ATRZLEMAInputs = {
  source: 'close',
  zlemaLength: 14,
  atrLength: 14,
  atrMultiplier: 3.5,
  enableNoiseFilter: true,
  noiseFilter: 0.3,
  presetConfig: 'Default',
  colorPreset: 'Custom',
  bullColorInput: '#00ffaa',
  bearColorInput: '#ff0000',
  cloudTransparency: 50,
  barTransparency: 10,
  showShapes: true,
  enableBarColoring: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Price Source', defval: 'close' },
  { id: 'zlemaLength', type: 'int', title: 'ZLEMA Length', defval: 14, min: 1 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'atrMultiplier', type: 'float', title: 'ATR Multiplier', defval: 3.5, min: 0.1, step: 0.1 },
  { id: 'enableNoiseFilter', type: 'bool', title: 'Enable Noise Filter', defval: true },
  { id: 'noiseFilter', type: 'float', title: 'Noise Filter Threshold', defval: 0.3, min: 0.0, step: 0.1 },
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Ember', 'Neon', 'Custom'] },
  { id: 'bullColorInput', type: 'color', title: 'Bullish Trend Color', defval: '#00ffaa' },
  { id: 'bearColorInput', type: 'color', title: 'Bearish Trend Color', defval: '#ff0000' },
  { id: 'cloudTransparency', type: 'int', title: 'Cloud Transparency', defval: 50, min: 0, max: 100 },
  { id: 'barTransparency', type: 'int', title: 'Bar Color Transparency', defval: 10, min: 0, max: 100 },
  { id: 'showShapes', type: 'bool', title: 'Show Trend Reversal Signals', defval: true },
  { id: 'enableBarColoring', type: 'bool', title: 'Enable Bar Coloring', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ATR ZLEMA', color: '#00ffaa', lineWidth: 2, display: 'none' },
  { id: 'plot1', title: 'ZLEMA', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'ATR ZLEMA [QuantAlgo]',
  shortTitle: 'ATR ZLEMA [QuantAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const COLOR_PRESETS: Record<string, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00bfff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Ember: ['#ff6600', '#00cccc'],
  Neon: ['#ffff00', '#ff00ff'],
};

export function calculate(
  bars: Bar[],
  inputs: Partial<ATRZLEMAInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  let { zlemaLength, atrLength, atrMultiplier, noiseFilter } = cfg;
  if (cfg.presetConfig === 'Fast Response') {
    zlemaLength = 10;
    atrLength = 10;
    atrMultiplier = 2.5;
    noiseFilter = 0.2;
  } else if (cfg.presetConfig === 'Smooth Trend') {
    zlemaLength = 21;
    atrLength = 21;
    atrMultiplier = 5.0;
    noiseFilter = 0.5;
  }
  const [bullColor, bearColor] = COLOR_PRESETS[cfg.colorPreset] ?? [cfg.bullColorInput, cfg.bearColorInput];

  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  // atr = ta.rma(ta.tr(true), atrLength)
  const atr = A(ta.rma(ta.tr(bars, true), atrLength));
  // lag = math.floor((zlemaLength - 1) / 2); rawZlema = ta.ema(source + (source - source[lag]), zlemaLength)
  const lag = Math.floor((zlemaLength - 1) / 2);
  const src = A(getSourceSeries(bars, cfg.source));
  const zlSrc = src.map((v, i) => (i >= lag ? v + (v - src[i - lag]) : NaN));
  const rawZlema = A(ta.ema(Series.fromArray(bars, zlSrc), zlemaLength));

  const zlemaArr: number[] = new Array(n);
  const zlemaATRArr: number[] = new Array(n);
  const trendArr: number[] = new Array(n);
  let zlema = NaN; // var float zlema = na
  let zlemaATR = NaN; // var float zlemaATR = na
  let trend = 1; // var int trend = 1
  for (let i = 0; i < n; i++) {
    if (isNaN(zlema)) {
      zlema = rawZlema[i];
    } else if (cfg.enableNoiseFilter) {
      const noiseThreshold = atr[i] * noiseFilter;
      const priceChange = Math.abs(rawZlema[i] - zlema);
      if (gt(priceChange, noiseThreshold)) zlema = rawZlema[i];
    } else {
      zlema = rawZlema[i];
    }

    const atrBand = atr[i] * atrMultiplier;
    if (isNaN(zlemaATR)) zlemaATR = zlema - atrBand;

    // math.max / math.min return na when an argument is na (JS Math.max / Math.min too)
    if (trend === 1) {
      if (lt(zlema, zlemaATR)) {
        trend = -1;
        zlemaATR = zlema + atrBand;
      } else {
        zlemaATR = Math.max(zlemaATR, zlema - atrBand);
      }
    } else {
      if (gt(zlema, zlemaATR)) {
        trend = 1;
        zlemaATR = zlema - atrBand;
      } else {
        zlemaATR = Math.min(zlemaATR, zlema + atrBand);
      }
    }
    zlemaArr[i] = zlema;
    zlemaATRArr[i] = zlemaATR;
    trendArr[i] = trend;
  }

  const trendColor = (i: number) => (trendArr[i] === 1 ? bullColor : bearColor);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bullGlow = String(color.new(bullColor, 50));
  const bearGlow = String(color.new(bearColor, 50));
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [], anyFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // bullSignal = trend == 1 and trend[1] == -1 (trend[1] is na on the first bar)
    const bullSignal = i > 0 && trendArr[i] === 1 && trendArr[i - 1] === -1;
    const bearSignal = i > 0 && trendArr[i] === -1 && trendArr[i - 1] === 1;
    bullFlags.push(bullSignal);
    bearFlags.push(bearSignal);
    anyFlags.push(bullSignal || bearSignal);
    const price = zlemaATRArr[i];
    if (cfg.showShapes && !isNaN(price)) {
      // plotshape(showShapes and bullSignal ? zlemaATR : na, shape.triangleup, location.absolute, bullColor, size.tiny)
      // then the glow: color.new(bullColor, 50), size.small (same for the bearish triangles); ids: the four plotshapes
      if (bullSignal) {
        markers.push({ time: t, position: 'atPriceMiddle', price, shape: 'triangleUp', color: bullColor, size: 'tiny', id: 'shape0' });
        markers.push({ time: t, position: 'atPriceMiddle', price, shape: 'triangleUp', color: bullGlow, size: 'small', id: 'shape1' });
      }
      if (bearSignal) {
        markers.push({ time: t, position: 'atPriceMiddle', price, shape: 'triangleDown', color: bearColor, size: 'tiny', id: 'shape2' });
        markers.push({ time: t, position: 'atPriceMiddle', price, shape: 'triangleDown', color: bearGlow, size: 'small', id: 'shape3' });
      }
    }
    // barcolor(enableBarColoring ? color.new(trendColor, barTransparency) : na)
    if (cfg.enableBarColoring) barColors.push({ time: t, color: String(color.new(trendColor(i), cfg.barTransparency)) });
  }

  // fill(pZLEMAATR, pPrice, zlemaATR, zlema, color.new(trendColor, cloudTransparency), color.new(trendColor, 100))
  const topColor = bars.map((_b, i): string | null => String(color.new(trendColor(i), cfg.cloudTransparency)));
  const bottomColor = bars.map((_b, i): string | null => String(color.new(trendColor(i), 100)));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(zlemaATR, 'ATR ZLEMA', color = trendColor, linewidth = 2, display = display.none)
      plot0: bars.map((b, i) => ({ time: b.time, value: zlemaATRArr[i], color: trendColor(i) })),
      // plot(zlema, 'ZLEMA', display = display.none)
      plot1: bars.map((b, i) => ({ time: b.time, value: zlemaArr[i] })),
    },
    fills: [{
      plot1: 'plot0', plot2: 'plot1',
      gradient: { topValue: zlemaATRArr, bottomValue: zlemaArr, topColor, bottomColor },
    }],
    markers,
    barColors,
    // alertcondition(bullSignal) / alertcondition(bearSignal) / alertcondition(bullSignal or bearSignal)
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags, anyFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend', message: 'ATR ZLEMA: BULLISH trend detected on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Trend', message: 'ATR ZLEMA: BEARISH trend detected on {{exchange}}:{{ticker}} - {{interval}}' },
  {
    id: 'alert2', title: 'Any Trend Change',
    message: 'ATR ZLEMA: Trend reversal detected! Check chart {{exchange}}:{{ticker}} - {{interval}}',
  },
];

export const ATRZLEMA = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
