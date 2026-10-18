/**
 * Wavelet Transform Trend
 *
 * An undecimated Haar wavelet transform of the source: level k approximation a_k = (a_(k-1) + a_(k-1)[shift_k]) / 2
 * with shifts that double each level (base = round((period - 1) / (2^levels - 1)), capped at the period). The detail
 * bands d_k = a_(k-1) - a_k can be added back after a soft threshold (detail multiplier * 1.2533 * RMA of |d_k|).
 * The wavelet path gets an ATR band (ATR * multiplier); the band edges ratchet as a SuperTrend and the trend flips
 * when the close leaves the band. Line mode draws the trailing band edge with a glow and seven radial fill layers
 * toward the bar midpoint; Wave mode draws fills between lagged copies of the wavelet path. Optional bar and
 * background colours. The presets replace the period, levels and ATR inputs, the colour presets the two colours.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Wavelet Trend' / 'Bearish Wavelet Trend' on the bars where
 * the trend turns up / down, 'Any Wavelet Trend Flip' on both.
 *
 * Reference: "Wavelet Transform Trend [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, getSourceSeries, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type WaveletTransformTrendPreset = 'Default' | 'Fast Response' | 'Smooth Trend';
export type WaveletTransformTrendColorPreset = 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom';

export interface WaveletTransformTrendInputs {
  /** Preset configuration; other than Default it replaces the period, levels, ATR period and ATR multiplier */
  preset: WaveletTransformTrendPreset;
  /** Source of the wavelet transform */
  src: SourceType;
  /** Wavelet period (span of the deepest approximation, in bars) */
  periodInput: number;
  /** Wavelet levels (capped at floor(log2(period))) */
  levelsInput: number;
  /** Use only the deepest approximation (no detail bands) */
  approxOnly: boolean;
  /** Soft threshold of the detail bands, in multiples of their noise scale */
  detailMult: number;
  atrLenInput: number;
  atrMultInput: number;
  /** 'Line' (trailing level with radial layers) or 'Wave' (lagged wavelet path fills) */
  displayStyle: 'Line' | 'Wave';
  showRadial: boolean;
  radialTrans: number;
  waveLayers: number;
  waveSpan: number;
  waveBrightness: number;
  colorPreset: WaveletTransformTrendColorPreset;
  bullishColor: string;
  bearishColor: string;
  /** Colour the bars with the trend colour */
  showCandles: boolean;
  barTrans: number;
  /** Colour the background with the trend colour */
  showBgcolor: boolean;
  bgTrans: number;
}

export const defaultInputs: WaveletTransformTrendInputs = {
  preset: 'Default',
  src: 'close',
  periodInput: 16,
  levelsInput: 3,
  approxOnly: true,
  detailMult: 1.0,
  atrLenInput: 14,
  atrMultInput: 1.5,
  displayStyle: 'Wave',
  showRadial: true,
  radialTrans: 75,
  waveLayers: 5,
  waveSpan: 12,
  waveBrightness: 30,
  colorPreset: 'Custom',
  bullishColor: '#00ffaa',
  bearishColor: '#ff0000',
  showCandles: false,
  barTrans: 0,
  showBgcolor: false,
  bgTrans: 90,
};

export const inputConfig: InputConfig[] = [
  { id: 'preset', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'periodInput', type: 'int', title: 'Wavelet Period', defval: 16, min: 4, max: 200 },
  { id: 'levelsInput', type: 'int', title: 'Wavelet Levels', defval: 3, min: 1, max: 6 },
  { id: 'approxOnly', type: 'bool', title: 'Wavelet Approximation Only', defval: true },
  { id: 'detailMult', type: 'float', title: 'Wavelet Detail Threshold', defval: 1.0, min: 0.1, max: 5.0, step: 0.1 },
  { id: 'atrLenInput', type: 'int', title: 'ATR Period', defval: 14, min: 1 },
  { id: 'atrMultInput', type: 'float', title: 'ATR Mult', defval: 1.5, min: 0.1, step: 0.1 },
  { id: 'displayStyle', type: 'string', title: 'Trend Display', defval: 'Wave', options: ['Line', 'Wave'] },
  { id: 'showRadial', type: 'bool', title: 'Show Radial Layering', defval: true },
  { id: 'radialTrans', type: 'int', title: 'Radial Layer Transparency', defval: 75, min: 0, max: 100 },
  { id: 'waveLayers', type: 'int', title: 'Wave Layers', defval: 5, min: 3, max: 5 },
  { id: 'waveSpan', type: 'int', title: 'Wave Span', defval: 12, min: 4, max: 40 },
  { id: 'waveBrightness', type: 'int', title: 'Wave Brightness', defval: 30, min: 10, max: 70 },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#ff0000' },
  { id: 'showCandles', type: 'bool', title: 'Enable Bar Coloring', defval: false },
  { id: 'barTrans', type: 'int', title: 'Bar Color Transparency', defval: 0, min: 0, max: 100 },
  { id: 'showBgcolor', type: 'bool', title: 'Enable Background Coloring', defval: false },
  { id: 'bgTrans', type: 'int', title: 'Background Color Transparency', defval: 90, min: 0, max: 100 },
];

const HIDDEN = { color: 'transparent', lineWidth: 1, display: 'none' } as const;

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Wavelet Transform Trend Glow', color: '#00ffaa', lineWidth: 6, style: 'linebr', display: 'pane' },
  { id: 'plot1', title: 'Wavelet Transform Trend', color: '#00ffaa', lineWidth: 3, style: 'linebr' },
  { id: 'plot2', title: 'Radial Base', ...HIDDEN },
  { id: 'plot3', title: 'Radial 1', ...HIDDEN },
  { id: 'plot4', title: 'Radial 2', ...HIDDEN },
  { id: 'plot5', title: 'Radial 3', ...HIDDEN },
  { id: 'plot6', title: 'Radial 4', ...HIDDEN },
  { id: 'plot7', title: 'Radial 5', ...HIDDEN },
  { id: 'plot8', title: 'Radial 6', ...HIDDEN },
  { id: 'plot9', title: 'Radial Edge', ...HIDDEN },
  { id: 'plot10', title: 'Wave Layer Base', ...HIDDEN },
  { id: 'plot11', title: 'Wave Layer 1', ...HIDDEN },
  { id: 'plot12', title: 'Wave Layer 2', ...HIDDEN },
  { id: 'plot13', title: 'Wave Layer 3', ...HIDDEN },
  { id: 'plot14', title: 'Wave Layer 4', ...HIDDEN },
  { id: 'plot15', title: 'Wave Layer 5', ...HIDDEN },
];

export const metadata = {
  title: 'Wavelet Transform Trend [QuantAlgo]',
  shortTitle: 'Wavelet Transform Trend [QuantAlgo]',
  overlay: true,
};

const COLOR_PRESETS: Record<Exclude<WaveletTransformTrendColorPreset, 'Custom'>, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

/** Pine float comparisons: a > b only when a - b > 1e-10; na operands give false */
const EPS = 1e-10;
const gt = (a: number, b: number): boolean => a - b > EPS;
const lt = (a: number, b: number): boolean => b - a > EPS;
const le = (a: number, b: number): boolean => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<WaveletTransformTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const periodRaw = cfg.preset === 'Fast Response' ? 8 : cfg.preset === 'Smooth Trend' ? 32 : cfg.periodInput;
  const levelsRaw = cfg.preset === 'Fast Response' ? 2 : cfg.preset === 'Smooth Trend' ? 4 : cfg.levelsInput;
  const atrLen = cfg.preset === 'Fast Response' ? 10 : cfg.preset === 'Smooth Trend' ? 21 : cfg.atrLenInput;
  const atrMult = cfg.preset === 'Fast Response' ? 1.2 : cfg.preset === 'Smooth Trend' ? 2.0 : cfg.atrMultInput;
  const [bullishColor, bearishColor] = cfg.colorPreset === 'Custom'
    ? [cfg.bullishColor, cfg.bearishColor] : COLOR_PRESETS[cfg.colorPreset];

  // Level schedule
  const maxLevels = Math.max(1, Math.trunc(Math.floor(Math.log(periodRaw) / Math.log(2) + 1e-9)));
  const levels = Math.max(1, Math.min(levelsRaw, Math.min(6, maxLevels)));
  const levelSpan = Math.trunc(Math.pow(2, levels)) - 1;
  const base = Math.max(1, Math.trunc(Math.round((periodRaw - 1) / Math.max(1.0, levelSpan))));
  const shifts = [1, 2, 4, 8, 16, 32].map((k) => Math.min(base * k, periodRaw));

  // Haar approximations a1..a6 and details d1..d6
  const src = A(getSourceSeries(bars, cfg.src));
  const approx: number[][] = [];
  const details: number[][] = [];
  let prev = src;
  for (let k = 1; k <= 6; k++) {
    const sh = shifts[k - 1];
    const p = prev;
    // a_k = levels >= k ? (a_(k-1) + a_(k-1)[shift_k]) * 0.5 : a_(k-1) (level 1 always)
    const a = k === 1 || levels >= k ? p.map((v, i) => (i >= sh ? (v + p[i - sh]) * 0.5 : NaN)) : p.slice();
    approx.push(a);
    details.push(p.map((v, i) => v - a[i]));
    prev = a;
  }
  const a6 = approx[5];

  // softThresh(d_k, detail_mult * ta.rma(math.abs(d_k), atr_len) * 1.2533), summed over the six levels
  const softThresh = (x: number, t: number) => {
    const ax = Math.abs(x);
    return le(ax, t) ? 0.0 : Math.sign(x) * (ax - t);
  };
  const thresholds = details.map((d) => A(ta.rma(S(d.map((v) => Math.abs(v))), atrLen)).map((r) => cfg.detailMult * (r * 1.2533)));
  const waveletPath = a6.map((v, i) => {
    if (cfg.approxOnly) return v;
    let sum = 0;
    for (let k = 0; k < 6; k++) sum += softThresh(details[k][i], thresholds[k][i]);
    return v + sum;
  });

  // Historical bars are confirmed: wavelet_confirmed = wavelet_path, mid_confirmed = hl2
  const waveletConfirmed = waveletPath;
  const midConfirmed = bars.map((b) => (b.high + b.low) / 2);
  const atr = A(ta.atr(bars, atrLen));

  const trendDir: number[] = new Array(n);
  const trendLevel: number[] = new Array(n);
  let upperBand = NaN;
  let lowerBand = NaN;
  let level = NaN;
  let dir = 0;
  for (let i = 0; i < n; i++) {
    const trendDev = atr[i] * atrMult;
    const upperRaw = waveletConfirmed[i] + trendDev;
    const lowerRaw = waveletConfirmed[i] - trendDev;
    if (!isNaN(upperRaw) && !isNaN(lowerRaw)) {
      const prevUpper = isNaN(upperBand) ? upperRaw : upperBand;
      const prevLower = isNaN(lowerBand) ? lowerRaw : lowerBand;
      const close = bars[i].close;
      const prevClose = i > 0 && !isNaN(bars[i - 1].close) ? bars[i - 1].close : close;
      const prevDir = dir;
      lowerBand = gt(lowerRaw, prevLower) || lt(prevClose, prevLower) ? lowerRaw : prevLower;
      upperBand = lt(upperRaw, prevUpper) || gt(prevClose, prevUpper) ? upperRaw : prevUpper;
      dir = prevDir === 0 ? (gt(close, waveletConfirmed[i]) ? 1 : -1)
        : prevDir === -1 ? (gt(close, upperBand) ? 1 : -1)
          : (lt(close, lowerBand) ? -1 : 1);
      level = dir === 1 ? lowerBand : upperBand;
    }
    trendDir[i] = dir;
    trendLevel[i] = level;
  }

  const showLine = cfg.displayStyle === 'Line';
  const radialT = (idx: number) => {
    const ceilT = cfg.radialTrans + (100 - cfg.radialTrans) * 0.85;
    return Math.trunc(Math.round(cfg.radialTrans + (ceilT - cfg.radialTrans) * Math.pow(idx / 6.0, 0.8)));
  };
  const radialTs = [0, 1, 2, 3, 4, 5, 6].map(radialT);
  const radialK = [0.142857, 0.285714, 0.428571, 0.571429, 0.714286, 0.857143];

  const waveOff1 = Math.max(1, Math.trunc(Math.round((cfg.waveSpan * 1.0) / cfg.waveLayers)));
  const waveOff2 = Math.max(waveOff1 + 1, Math.trunc(Math.round((cfg.waveSpan * 2.0) / cfg.waveLayers)));
  const waveOff3 = Math.max(waveOff2 + 1, Math.trunc(Math.round((cfg.waveSpan * 3.0) / cfg.waveLayers)));
  const waveOff4 = Math.max(waveOff3 + 1, Math.trunc(Math.round((cfg.waveSpan * 4.0) / cfg.waveLayers)));
  const waveOff5 = Math.max(waveOff4 + 1, cfg.waveSpan);
  const waveOffs = [0, waveOff1, waveOff2, waveOff3, waveOff4, waveOff5];
  const waveT = [
    cfg.waveBrightness,
    Math.min(92, cfg.waveBrightness + 12),
    Math.min(94, cfg.waveBrightness + 22),
    Math.min(96, cfg.waveBrightness + 30),
    Math.min(97, cfg.waveBrightness + 36),
  ];

  const plots: Record<string, Point[]> = {};
  for (let p = 0; p < 16; p++) plots[`plot${p}`] = [];
  const radialFill: string[][] = Array.from({ length: 7 }, () => new Array(n));
  const waveFill: string[][] = Array.from({ length: 5 }, () => new Array(n));
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [], anyFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const d = trendDir[i];
    const prevD = i > 0 ? trendDir[i - 1] : 0; // nz(trend_dir[1])
    // bullish_trend_shift / bearish_trend_shift / any_trend_shift
    const bullShift = d === 1 && prevD === -1;
    const bearShift = d === -1 && prevD === 1;
    const anyShift = bullShift || bearShift;
    bullFlags.push(bullShift);
    bearFlags.push(bearShift);
    anyFlags.push(anyShift);
    const trendColor = d === -1 ? bearishColor : bullishColor;
    const showWave = !showLine && !isNaN(waveletConfirmed[i]);
    const hasTrend = d !== 0 && !isNaN(trendLevel[i]);
    const lineLive = showLine && hasTrend && !anyShift;

    const line = lineLive ? trendLevel[i] : NaN;
    plots.plot0.push({ time: t, value: line, color: String(color.new(trendColor, 70)) });
    plots.plot1.push({ time: t, value: line, color: trendColor });

    // Radial layers between the trend level and the bar midpoint
    const radialOn = showLine && cfg.showRadial && lineLive;
    const radialBase = radialOn ? trendLevel[i] : NaN;
    const radialEdge = radialOn ? midConfirmed[i] : NaN;
    const radialGap = radialEdge - radialBase;
    plots.plot2.push({ time: t, value: radialBase });
    for (let k = 0; k < 6; k++) plots[`plot${3 + k}`].push({ time: t, value: radialOn ? radialBase + radialGap * radialK[k] : NaN });
    plots.plot9.push({ time: t, value: radialEdge });
    for (let k = 0; k < 7; k++) radialFill[k][i] = radialOn ? String(color.new(trendColor, radialTs[k])) : 'transparent';

    // Wave layers: lagged copies of the wavelet path
    for (let k = 0; k < 6; k++) {
      const on = showWave && (k < 4 || cfg.waveLayers >= k);
      const j = i - waveOffs[k];
      plots[`plot${10 + k}`].push({ time: t, value: on && j >= 0 ? waveletConfirmed[j] : NaN });
    }
    for (let k = 0; k < 5; k++) {
      const on = showWave && hasTrend && (k < 3 || cfg.waveLayers >= k + 1);
      waveFill[k][i] = on ? String(color.new(trendColor, waveT[k])) : 'transparent';
    }

    // barcolor(show_candles and has_trend ? color.new(trend_color, bar_trans) : na); bgcolor likewise
    if (cfg.showCandles && hasTrend) barColors.push({ time: t, color: String(color.new(trendColor, cfg.barTrans)) });
    if (cfg.showBgcolor && hasTrend) bgColors.push({ time: t, color: String(color.new(trendColor, cfg.bgTrans)) });
  }

  const fills = [
    ...radialFill.map((colors, k) => ({ plot1: `plot${2 + k}`, plot2: `plot${3 + k}`, options: { title: `Radial Layer ${k + 1}` }, colors })),
    ...waveFill.map((colors, k) => ({ plot1: `plot${10 + k}`, plot2: `plot${11 + k}`, options: { title: `Wave Layer ${k + 1}` }, colors })),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers: [],
    barColors,
    bgColors,
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags, anyFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Wavelet Trend', message: 'Wavelet Transform Trend: BULLISH on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Wavelet Trend', message: 'Wavelet Transform Trend: BEARISH on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Any Wavelet Trend Flip', message: 'Wavelet Transform Trend: Trend flipped on {{exchange}}:{{ticker}} - {{interval}}' },
];

export const WaveletTransformTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
