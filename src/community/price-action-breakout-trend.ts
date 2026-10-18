/**
 * Price Action Breakout Trend
 *
 * The breakout range is the highest high and the lowest low of the `lookback` bars before the current bar. The
 * trend starts long with the trailing stop at the prior low. In a long trend the stop ratchets up to the prior low;
 * the trend turns short when the test price (close, or low with the 'Wick' confirmation) goes below the stop, and
 * the stop resets to the prior high. The short side is the mirror. Presets set the lookback and the confirmation.
 * The stop is drawn as a step line with a six-layer fill fading from the stop to the close; triangles mark the
 * trend flips; optional breakout level lines, bar colours and background colours.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Breakout Signal', 'Bearish Breakout Signal' and 'Any
 * Breakout Signal', true on the bars where the trend turns long, short, or either.
 *
 * Reference: "Price Action Breakout Trend [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PriceActionBreakoutTrendInputs {
  /** Preset: 'Fast Response' (5, Wick) and 'Smooth Trend' (25, Close) override the lookback and confirmation */
  preset: 'Default' | 'Fast Response' | 'Smooth Trend';
  /** Number of prior bars of the breakout range */
  lookback: number;
  /** Price that triggers a flip: 'Close' or 'Wick' (low / high) */
  confirmation: 'Close' | 'Wick';
  showTrail: boolean;
  showFill: boolean;
  showMarkers: boolean;
  showLevels: boolean;
  colorPreset: 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom';
  bullishColor: string;
  bearishColor: string;
  showCandles: boolean;
  barTransparency: number;
  showBgColor: boolean;
  bgTransparency: number;
}

export const defaultInputs: PriceActionBreakoutTrendInputs = {
  preset: 'Default',
  lookback: 10,
  confirmation: 'Close',
  showTrail: true,
  showFill: true,
  showMarkers: true,
  showLevels: false,
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
  { id: 'lookback', type: 'int', title: 'Breakout Lookback', defval: 10, min: 1 },
  { id: 'confirmation', type: 'string', title: 'Breakout Confirmation', defval: 'Close', options: ['Close', 'Wick'] },
  { id: 'showTrail', type: 'bool', title: 'Show Trailing Stop', defval: true },
  { id: 'showFill', type: 'bool', title: 'Show Gradient Fill', defval: true },
  { id: 'showMarkers', type: 'bool', title: 'Show Markers', defval: true },
  { id: 'showLevels', type: 'bool', title: 'Show Breakout Levels', defval: false },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#ff0000' },
  { id: 'showCandles', type: 'bool', title: 'Enable Bar Coloring', defval: false },
  { id: 'barTransparency', type: 'int', title: 'Bar Color Transparency', defval: 0, min: 0, max: 100 },
  { id: 'showBgColor', type: 'bool', title: 'Enable Background Coloring', defval: false },
  { id: 'bgTransparency', type: 'int', title: 'Background Color Transparency', defval: 90, min: 0, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trailing Stop', color: '#00ffaa', lineWidth: 2, style: 'stepline' },
  { id: 'plot1', title: 'Price Anchor', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Gradient Level 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Gradient Level 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Gradient Level 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Gradient Level 4', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Gradient Level 5', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'Breakout High', color: String(color.new('#00ffaa', 50)), lineWidth: 3, style: 'linebr' },
  { id: 'plot8', title: 'Breakout Low', color: String(color.new('#00ffaa', 50)), lineWidth: 3, style: 'linebr' },
];

export const metadata = {
  title: 'Price Action Breakout Trend [QuantAlgo]',
  shortTitle: 'Price Action Breakout Trend [QuantAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const PRESET_COLORS: Record<string, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

export function calculate(
  bars: Bar[],
  inputs: Partial<PriceActionBreakoutTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const lookback = cfg.preset === 'Fast Response' ? 5 : cfg.preset === 'Smooth Trend' ? 25 : cfg.lookback;
  const confirmation = cfg.preset === 'Fast Response' ? 'Wick' : cfg.preset === 'Smooth Trend' ? 'Close' : cfg.confirmation;
  const [bullishColor, bearishColor] = PRESET_COLORS[cfg.colorPreset] ?? [cfg.bullishColor, cfg.bearishColor];

  // prior_high = ta.highest(high, lookback)[1]; prior_low = ta.lowest(low, lookback)[1]
  const hh = A(ta.highest(S(bars.map((b) => b.high)), lookback));
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), lookback));
  const priorHigh = bars.map((_b, i) => (i > 0 ? hh[i - 1] : NaN));
  const priorLow = bars.map((_b, i) => (i > 0 ? ll[i - 1] : NaN));

  const trailArr: number[] = new Array(n).fill(NaN);
  const trendArr: number[] = new Array(n).fill(0);
  let trail = NaN; // var float trail = na
  let trend = 0; // var int trend = 0
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (isNaN(trail) && !isNaN(priorLow[i])) {
      trail = priorLow[i];
      trend = 1;
    }
    const testDown = confirmation === 'Close' ? b.close : b.low;
    const testUp = confirmation === 'Close' ? b.close : b.high;
    if (trend === 1) {
      trail = Math.max(trail, priorLow[i]);
      if (lt(testDown, trail)) {
        trend = -1;
        trail = priorHigh[i];
      }
    } else if (trend === -1) {
      trail = Math.min(trail, priorHigh[i]);
      if (gt(testUp, trail)) {
        trend = 1;
        trail = priorLow[i];
      }
    }
    trailArr[i] = trail;
    trendArr[i] = trend;
  }

  const trendColor = trendArr.map((tr) => (tr === 1 ? bullishColor : bearishColor));
  const idx = bars.map((_b, i) => i);
  const t = (i: number) => bars[i].time;
  const close = bars.map((b) => b.close);
  // step = (close - trail) / 6; grad_k = trail + step * k
  const grad = (k: number) => idx.map((i) => ({ time: t(i), value: trailArr[i] + ((close[i] - trailArr[i]) / 6) * k }));

  const plots = {
    // plot(trend == 0 ? na : trail, color = show_trail ? color.new(trend_color, 0) : na, style = plot.style_stepline)
    plot0: idx.map((i) => ({
      time: t(i), value: trendArr[i] === 0 ? NaN : trailArr[i],
      color: cfg.showTrail ? String(color.new(trendColor[i], 0)) : 'transparent',
    })),
    plot1: idx.map((i) => ({ time: t(i), value: close[i] })),
    plot2: grad(1),
    plot3: grad(2),
    plot4: grad(3),
    plot5: grad(4),
    plot6: grad(5),
    plot7: idx.map((i) => ({
      time: t(i), value: cfg.showLevels ? priorHigh[i] : NaN, color: String(color.new(trendColor[i], 50)),
    })),
    plot8: idx.map((i) => ({
      time: t(i), value: cfg.showLevels ? priorLow[i] : NaN, color: String(color.new(trendColor[i], 50)),
    })),
  };

  // fill(..., color = show_fill ? color.new(trend_color, tr) : na)
  const layer = (tr: number) => idx.map((i) => (cfg.showFill ? String(color.new(trendColor[i], tr)) : 'transparent'));
  const fills = [
    { plot1: 'plot0', plot2: 'plot2', colors: layer(60) },
    { plot1: 'plot2', plot2: 'plot3', colors: layer(68) },
    { plot1: 'plot3', plot2: 'plot4', colors: layer(76) },
    { plot1: 'plot4', plot2: 'plot5', colors: layer(84) },
    { plot1: 'plot5', plot2: 'plot6', colors: layer(92) },
    { plot1: 'plot6', plot2: 'plot1', colors: layer(96) },
  ];

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const bullMarker = String(color.new(bullishColor, 0));
  const bearMarker = String(color.new(bearishColor, 0));
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [], changedFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? trendArr[i - 1] : NaN;
    const turnedBullish = trendArr[i] === 1 && prev === -1;
    const turnedBearish = trendArr[i] === -1 && prev === 1;
    bullFlags.push(turnedBullish);
    bearFlags.push(turnedBearish);
    changedFlags.push(turnedBullish || turnedBearish);
    if (cfg.showMarkers && turnedBullish) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'triangleUp', color: bullMarker, size: 'small' });
    }
    if (cfg.showMarkers && turnedBearish) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'triangleDown', color: bearMarker, size: 'small' });
    }
    // barcolor / bgcolor(show and trend != 0 ? color.new(trend_color, transparency) : na)
    if (cfg.showCandles && trendArr[i] !== 0) {
      barColors.push({ time: t(i), color: String(color.new(trendColor[i], cfg.barTransparency)) });
    }
    if (cfg.showBgColor && trendArr[i] !== 0) {
      bgColors.push({ time: t(i), color: String(color.new(trendColor[i], cfg.bgTransparency)) });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    barColors,
    bgColors,
    // alertcondition(turned_bullish / turned_bearish / trend_changed)
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags, changedFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Breakout Signal', message: 'Price Action Breakout Trend: BULLISH breakout confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Breakout Signal', message: 'Price Action Breakout Trend: BEARISH breakout confirmed on {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Any Breakout Signal', message: 'Price Action Breakout Trend: Trend direction changed on {{exchange}}:{{ticker}} - {{interval}}' },
];

export const PriceActionBreakoutTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
