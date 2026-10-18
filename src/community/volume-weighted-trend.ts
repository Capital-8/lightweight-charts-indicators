/**
 * Volume Weighted Trend [QuantAlgo]
 *
 * VWMA of the close with bands at ATR(length) * multiplier. The trend turns up when close is above the upper band and
 * down when it is below the lower band. The VWMA (with a glow), the bands, their mid lines, four ribbons and the bars
 * take the trend colour.
 *
 * Alerts (alertcondition, `alerts` of the result): the trend turning up, turning down, and either.
 *
 * Reference: "Volume Weighted Trend [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

const PRESETS = ['Default', 'Fast Response', 'Smooth Trend'];
const COLOR_PRESETS = ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'];
const COLOR_PAIRS: Record<string, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

export interface VolumeWeightedTrendInputs {
  vwmaLength: number;
  atrMultiplier: number;
  /** Default uses vwmaLength / atrMultiplier; Fast Response 21 / 1.2; Smooth Trend 55 / 2.0 */
  presetConfig: string;
  /** Colour preset; Custom uses bullishColor / bearishColor */
  colorPreset: string;
  bullishColor: string;
  bearishColor: string;
  enableGlow: boolean;
  enableRibbons: boolean;
  /** Transparency of the band lines (0..100) */
  bandTransparency: number;
  enableBarcolor: boolean;
}

export const defaultInputs: VolumeWeightedTrendInputs = {
  vwmaLength: 34,
  atrMultiplier: 1.5,
  presetConfig: 'Default',
  colorPreset: 'Custom',
  bullishColor: '#00ffaa',
  bearishColor: '#ff0000',
  enableGlow: true,
  enableRibbons: true,
  bandTransparency: 90,
  enableBarcolor: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'vwmaLength', type: 'int', title: 'VWMA Length', defval: 34, min: 5 },
  { id: 'atrMultiplier', type: 'float', title: 'ATR Multiplier', defval: 1.5, min: 0.5, step: 0.1 },
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: PRESETS },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: COLOR_PRESETS },
  { id: 'bullishColor', type: 'color', title: 'Bullish Trend Color', defval: '#00ffaa' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Trend Color', defval: '#ff0000' },
  { id: 'enableGlow', type: 'bool', title: 'Enable Neon Glow Effect', defval: true },
  { id: 'enableRibbons', type: 'bool', title: 'Enable Volatility Ribbons', defval: true },
  { id: 'bandTransparency', type: 'int', title: 'Band Transparency', defval: 90, min: 0, max: 100 },
  { id: 'enableBarcolor', type: 'bool', title: 'Enable Bar Coloring', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VWMA Glow Outer', color: '#00ffaa', lineWidth: 8 },
  { id: 'plot1', title: 'VWMA Glow Inner', color: '#00ffaa', lineWidth: 4 },
  { id: 'plot2', title: 'VWMA Line', color: '#00ffaa', lineWidth: 2 },
  { id: 'plot3', title: 'Upper Band', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot4', title: 'Upper Mid', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot5', title: 'Lower Band', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot6', title: 'Lower Mid', color: '#00ffaa', lineWidth: 1 },
];

export const metadata = {
  title: 'Volume Weighted Trend [QuantAlgo]',
  shortTitle: 'Volume Weighted Trend',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeWeightedTrendInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  let { vwmaLength, atrMultiplier } = cfg;
  if (cfg.presetConfig === 'Fast Response') {
    vwmaLength = 21;
    atrMultiplier = 1.2;
  } else if (cfg.presetConfig === 'Smooth Trend') {
    vwmaLength = 55;
    atrMultiplier = 2.0;
  }
  const [bullish, bearish] = COLOR_PAIRS[cfg.colorPreset] ?? [cfg.bullishColor, cfg.bearishColor];
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const vwma = A(ta.vwma(new Series(bars, (b) => b.close), vwmaLength, new Series(bars, (b) => b.volume ?? NaN)));
  const atr = A(ta.atr(bars, vwmaLength));
  const upper = vwma.map((v, i) => v + atr[i] * atrMultiplier);
  const lower = vwma.map((v, i) => v - atr[i] * atrMultiplier);

  const c = (col: string, transp: number) => String(color.new(col, transp));
  const names = ['plot0', 'plot1', 'plot2', 'plot3', 'plot4', 'plot5', 'plot6'] as const;
  const plots: Record<string, { time: number; value: number; color: string }[]> = Object.fromEntries(names.map((k) => [k, []]));
  const ribbons: string[][] = [[], [], [], []];
  const barColors: BarColorData[] = [];
  let dir = 0; // var int trend_direction = 0
  const turnedBullish: boolean[] = [];
  const turnedBearish: boolean[] = [];
  const changed: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const prevDir = dir; // trend_direction[1] (na on the first bar: no turn there)
    if (bars[i].close > upper[i]) dir = 1;
    else if (bars[i].close < lower[i]) dir = -1;
    // trend_turned_bullish = trend_direction == 1 and trend_direction[1] != 1 (bearish: the mirror)
    const up = i > 0 && dir === 1 && prevDir !== 1;
    const down = i > 0 && dir === -1 && prevDir !== -1;
    turnedBullish.push(up);
    turnedBearish.push(down);
    changed.push(up || down);
    const trend = dir === 1 ? bullish : bearish;
    const upperMid = (upper[i] + vwma[i]) / 2;
    const lowerMid = (lower[i] + vwma[i]) / 2;
    plots.plot0.push({ time: t, value: cfg.enableGlow ? vwma[i] : NaN, color: c(trend, 80) });
    plots.plot1.push({ time: t, value: cfg.enableGlow ? vwma[i] : NaN, color: c(trend, 50) });
    plots.plot2.push({ time: t, value: vwma[i], color: c(trend, 0) });
    plots.plot3.push({ time: t, value: upper[i], color: c(trend, cfg.bandTransparency) });
    plots.plot4.push({ time: t, value: upperMid, color: c(trend, 95) });
    plots.plot5.push({ time: t, value: lower[i], color: c(trend, cfg.bandTransparency) });
    plots.plot6.push({ time: t, value: lowerMid, color: c(trend, 95) });
    // fills: outer ribbons transparency 85, inner ribbons 70; na colour when the ribbons are off
    const outer = cfg.enableRibbons ? c(trend, 85) : 'transparent';
    const inner = cfg.enableRibbons ? c(trend, 70) : 'transparent';
    ribbons[0].push(outer);
    ribbons[1].push(inner);
    ribbons[2].push(outer);
    ribbons[3].push(inner);
    // barcolor(enable_barcolor ? color.new(trend_direction == 1 ? bullish : bearish, 20) : na)
    if (cfg.enableBarcolor) barColors.push({ time: t, color: c(dir === 1 ? bullish : bearish, 20) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'plot3', plot2: 'plot4', colors: ribbons[0] },
      { plot1: 'plot4', plot2: 'plot2', colors: ribbons[1] },
      { plot1: 'plot5', plot2: 'plot6', colors: ribbons[2] },
      { plot1: 'plot6', plot2: 'plot2', colors: ribbons[3] },
    ],
    barColors,
    alerts: alertStates(alertConditions, bars, [turnedBullish, turnedBearish, changed]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Signal', message: 'Volume Weighted Trend: BULLISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Trend Signal', message: 'Volume Weighted Trend: BEARISH trend confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Trend Direction Changed', message: 'Volume Weighted Trend: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}' },
];

export const VolumeWeightedTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
