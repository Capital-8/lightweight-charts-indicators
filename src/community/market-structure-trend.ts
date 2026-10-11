/**
 * Market Structure Trend
 *
 * Swing highs / lows are confirmed pivots (left / right structure bars). Once both exist, the trend starts bullish
 * when the source is at or above the swing midpoint. A bullish trend turns bearish when the source (or the low with
 * Break On Wick) closes below the last swing low minus a buffer (a percentage of the swing range); a bearish trend
 * turns bullish above the last swing high plus the buffer. The structure line is the last swing low in an uptrend
 * and the last swing high in a downtrend, drawn with a glow; four radial fill bands go from the line to the bar
 * midpoint. Circles mark the trend flips; optional bar and background colours follow the trend.
 *
 * Last bar: the structure direction and level change on a closed bar only. The port reads the state of the last bar
 * from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Market Structure Trend [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, BgColorData, MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface MarketStructureTrendInputs {
  /** 'Default' uses the manual structure inputs; the presets override them */
  preset: 'Default' | 'Fast Response' | 'Smooth Trend';
  /** Price that confirms a structure break */
  src: SourceType;
  leftBars: number;
  rightBars: number;
  /** Confirmation buffer, % of the swing range */
  bufferPct: number;
  /** Use the high / low for the break instead of the source */
  breakOnWick: boolean;
  showRadial: boolean;
  radialTrans: number;
  showMarkers: boolean;
  colorPreset: 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom';
  bullishColor: string;
  bearishColor: string;
  showCandles: boolean;
  barTrans: number;
  showBgcolor: boolean;
  bgTrans: number;
}

export const defaultInputs: MarketStructureTrendInputs = {
  preset: 'Default',
  src: 'close',
  leftBars: 5,
  rightBars: 5,
  bufferPct: 0.0,
  breakOnWick: false,
  showRadial: true,
  radialTrans: 75,
  showMarkers: true,
  colorPreset: 'Custom',
  bullishColor: '#00ffaa',
  bearishColor: '#ff0000',
  showCandles: false,
  barTrans: 0,
  showBgcolor: false,
  bgTrans: 90,
};

const G_STRUCTURE = '════════ Structure Settings ════════';
const G_VISUAL = '════════ Visual Settings ════════';

export const inputConfig: InputConfig[] = [
  { id: 'preset', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'], group: G_STRUCTURE },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: G_STRUCTURE },
  { id: 'leftBars', type: 'int', title: 'Left Structure Bars', defval: 5, min: 1, max: 200, group: G_STRUCTURE },
  { id: 'rightBars', type: 'int', title: 'Right Structure Bars', defval: 5, min: 1, max: 200, group: G_STRUCTURE },
  { id: 'bufferPct', type: 'float', title: 'Confirmation Buffer %', defval: 0.0, min: 0.0, max: 100.0, step: 0.5, group: G_STRUCTURE },
  { id: 'breakOnWick', type: 'bool', title: 'Break On Wick', defval: false, group: G_STRUCTURE },
  { id: 'showRadial', type: 'bool', title: 'Show Radial Layering', defval: true, group: G_VISUAL },
  { id: 'radialTrans', type: 'int', title: 'Radial Layer Transparency', defval: 75, min: 0, max: 100, group: G_VISUAL },
  { id: 'showMarkers', type: 'bool', title: 'Show Structure Shift Markers', defval: true, group: G_VISUAL },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'], group: G_VISUAL },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa', group: G_VISUAL },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#ff0000', group: G_VISUAL },
  { id: 'showCandles', type: 'bool', title: 'Enable Bar Coloring', defval: false, group: G_VISUAL },
  { id: 'barTrans', type: 'int', title: 'Bar Color Transparency', defval: 0, min: 0, max: 100, group: G_VISUAL },
  { id: 'showBgcolor', type: 'bool', title: 'Enable Background Coloring', defval: false, group: G_VISUAL },
  { id: 'bgTrans', type: 'int', title: 'Background Color Transparency', defval: 90, min: 0, max: 100, group: G_VISUAL },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Glow Up', color: String(color.new('#00ffaa', 70)), lineWidth: 6, style: 'linebr' },
  { id: 'plot1', title: 'Glow Down', color: String(color.new('#ff0000', 70)), lineWidth: 6, style: 'linebr' },
  { id: 'plot2', title: 'Bullish Structure', color: '#00ffaa', lineWidth: 2, style: 'linebr' },
  { id: 'plot3', title: 'Bearish Structure', color: '#ff0000', lineWidth: 2, style: 'linebr' },
  { id: 'plot4', title: 'Radial Base', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Radial 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Radial 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'Radial 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot8', title: 'Radial Edge', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Market Structure Trend [QuantAlgo]',
  shortTitle: 'Market Structure Trend [QuantAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

const PRESET_COLORS: Record<string, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketStructureTrendInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: { toArray(): (number | null | undefined)[] }) => s.toArray().map((v) => v ?? NaN);

  const leftBars = cfg.preset === 'Fast Response' ? 3 : cfg.preset === 'Smooth Trend' ? 12 : cfg.leftBars;
  const rightBars = cfg.preset === 'Fast Response' ? 3 : cfg.preset === 'Smooth Trend' ? 12 : cfg.rightBars;
  const bufferPct = cfg.preset === 'Smooth Trend' ? 10.0 : cfg.preset === 'Fast Response' ? 0.0 : cfg.bufferPct;
  const [bullishColor, bearishColor] = PRESET_COLORS[cfg.colorPreset] ?? [cfg.bullishColor, cfg.bearishColor];

  const srcSeries = getSourceSeries(bars, cfg.src);
  const src = A(srcSeries);
  const highS = getSourceSeries(bars, 'high');
  const lowS = getSourceSeries(bars, 'low');
  const pivotHigh = A(ta.pivothigh(highS, leftBars, rightBars));
  const pivotLow = A(ta.pivotlow(lowS, leftBars, rightBars));

  const radialT = [
    cfg.radialTrans,
    Math.min(100, cfg.radialTrans + 12),
    Math.min(100, cfg.radialTrans + 24),
    Math.min(100, cfg.radialTrans + 32),
  ];
  const glowUp = String(color.new(bullishColor, 70));
  const glowDown = String(color.new(bearishColor, 70));

  const plots: Record<string, Point[]> = {};
  for (let k = 0; k < 9; k++) plots[`plot${k}`] = [];
  const fillColors: string[][] = [[], [], [], []];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];

  let swingHigh = NaN; // var float swing_high = na
  let swingLow = NaN; // var float swing_low = na
  let dir = 0; // var int structure_dir = 0
  let level = NaN; // var float structure_level = na
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    const prevDir = i > 0 ? dir : NaN; // structure_dir[1] (na on the first bar)
    if (!isNaN(pivotHigh[i])) swingHigh = pivotHigh[i];
    if (!isNaN(pivotLow[i])) swingLow = pivotLow[i];

    const ready = !isNaN(swingHigh) && !isNaN(swingLow);
    const structureRange = ready ? Math.abs(swingHigh - swingLow) : NaN;
    const confirmBuffer = ((isNaN(structureRange) ? 0 : structureRange) * bufferPct) / 100.0;
    const breakDownLevel = swingLow - confirmBuffer;
    const breakUpLevel = swingHigh + confirmBuffer;
    const breakDownSrc = cfg.breakOnWick ? b.low : src[i];
    const breakUpSrc = cfg.breakOnWick ? b.high : src[i];

    // if barstate.isconfirmed and structure_ready
    if (barIsConfirmed(i) && ready) {
      if (dir === 0) {
        dir = ge(src[i], (swingHigh + swingLow) / 2.0) ? 1 : -1;
        level = dir === 1 ? swingLow : swingHigh;
      } else if (dir === 1) {
        if (lt(breakDownSrc, breakDownLevel)) {
          dir = -1;
          level = swingHigh;
        } else {
          level = swingLow;
        }
      } else if (dir === -1) {
        if (gt(breakUpSrc, breakUpLevel)) {
          dir = 1;
          level = swingLow;
        } else {
          level = swingHigh;
        }
      }
    }

    const bullShift = dir === 1 && prevDir === -1 && barIsConfirmed(i);
    const bearShift = dir === -1 && prevDir === 1 && barIsConfirmed(i);
    const structureColor = dir === -1 ? bearishColor : bullishColor;

    const line = dir === 0 ? NaN : level;
    const up = dir === 1 ? line : NaN;
    const dn = dir === -1 ? line : NaN;
    plots.plot0.push({ time: t, value: up, color: glowUp });
    plots.plot1.push({ time: t, value: dn, color: glowDown });
    plots.plot2.push({ time: t, value: up, color: bullishColor });
    plots.plot3.push({ time: t, value: dn, color: bearishColor });

    const base = line;
    const edge = dir === 0 ? NaN : (b.high + b.low) / 2;
    const both = !isNaN(base) && !isNaN(edge);
    const r1 = both ? base + (edge - base) * 0.25 : NaN;
    const r2 = both ? base + (edge - base) * 0.5 : NaN;
    const r3 = both ? base + (edge - base) * 0.75 : NaN;
    const radial = [base, r1, r2, r3, edge];
    for (let k = 0; k < 5; k++) plots[`plot${k + 4}`].push({ time: t, value: cfg.showRadial ? radial[k] : NaN });
    for (let k = 0; k < 4; k++) {
      fillColors[k].push(cfg.showRadial && dir !== 0 ? String(color.new(structureColor, radialT[k])) : 'transparent');
    }

    // plotshape(..., style = shape.circle, location = location.absolute, size = size.tiny)
    if (cfg.showMarkers && !isNaN(line)) {
      if (bullShift) markers.push({ time: t, position: 'atPriceMiddle', price: line, shape: 'circle', color: bullishColor, size: 'tiny' });
      if (bearShift) markers.push({ time: t, position: 'atPriceMiddle', price: line, shape: 'circle', color: bearishColor, size: 'tiny' });
    }
    if (cfg.showCandles && dir !== 0) barColors.push({ time: t, color: String(color.new(structureColor, cfg.barTrans)) });
    if (cfg.showBgcolor && dir !== 0) bgColors.push({ time: t, color: String(color.new(structureColor, cfg.bgTrans)) });
  }

  const titles = ['Radial Layer 1', 'Radial Layer 2', 'Radial Layer 3', 'Radial Layer 4'];
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: titles.map((title, k) => ({ plot1: `plot${k + 4}`, plot2: `plot${k + 5}`, options: { title }, colors: fillColors[k] })),
    markers,
    barColors,
    bgColors,
  };
}

export const MarketStructureTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
