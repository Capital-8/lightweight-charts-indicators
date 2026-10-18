/**
 * Zero Lag Signals For Loop
 *
 * Zero lag basis: EMA of close + (close - close[lag]), lag = floor((length - 1) / 2). A for loop scores the basis
 * against its own past values (+1 when the basis is above basis[i], -1 otherwise, i = loop start to loop end).
 * The trend turns up when the score is above the up threshold and close is above basis + volatility
 * (volatility = highest ATR(length) over length * 3 bars times the multiplier); it turns down on the mirror
 * condition. The basis, a gradient fill from the basis to hl2, trend change labels and bar colours follow the trend.
 * The presets replace length, volatility multiplier, loop end and thresholds, as in Pine. The Pine input
 * "Show Signal Markers" is not used by the Pine plots: the labels are always drawn, as in Pine.
 * Alerts (alertcondition, `alerts` of the result): 'Zero Lag Signals Long' / 'Zero Lag Signals Short' when the trend
 * crosses over / under 0.
 *
 * Reference: "Zero Lag Signals For Loop [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type ZeroLagPreset = 'Default' | 'Fast Response' | 'Smooth Trend';
export type ZeroLagColorPreset = 'Classic' | 'Aqua' | 'Cosmic' | 'Cyber' | 'Neon' | 'Custom';

export interface ZeroLagSignalsForLoopInputs {
  /** Preset configuration; other than Default it replaces length, volatility multiplier, loop end and thresholds */
  presetConfig: ZeroLagPreset;
  /** Zero lag length */
  length: number;
  /** Volatility multiplier */
  volatilityMult: number;
  /** Loop start */
  loopStart: number;
  /** Loop end */
  loopEnd: number;
  /** Score above this value is needed for an uptrend */
  thresholdUp: number;
  /** Score below this value is needed for a downtrend */
  thresholdDown: number;
  /** Colour preset; Custom uses bullColor / bearColor */
  colorPreset: ZeroLagColorPreset;
  bullColor: string;
  bearColor: string;
  /** Pine input "Show Signal Markers": not used by any Pine output */
  showSignals: boolean;
  /** Colour the candles with the trend colour */
  paintCandles: boolean;
  /** Background colour on the bars where the trend crosses up / down through 0 */
  showBgLines: boolean;
}

export const defaultInputs: ZeroLagSignalsForLoopInputs = {
  presetConfig: 'Default',
  length: 50,
  volatilityMult: 1.5,
  loopStart: 1,
  loopEnd: 70,
  thresholdUp: 5,
  thresholdDown: -5,
  colorPreset: 'Custom',
  bullColor: '#00ffaa',
  bearColor: '#ff0000',
  showSignals: true,
  paintCandles: true,
  showBgLines: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'length', type: 'int', title: 'Zero Lag Length', defval: 50, min: 1 },
  { id: 'volatilityMult', type: 'float', title: 'Volatility Multiplier', defval: 1.5, min: 0.1 },
  { id: 'loopStart', type: 'int', title: 'Loop Start', defval: 1, min: 1 },
  { id: 'loopEnd', type: 'int', title: 'Loop End', defval: 70, min: 1 },
  { id: 'thresholdUp', type: 'int', title: 'Threshold Uptrend', defval: 5 },
  { id: 'thresholdDown', type: 'int', title: 'Threshold Downtrend', defval: -5 },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Cyber', 'Neon', 'Custom'] },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#ff0000' },
  { id: 'showSignals', type: 'bool', title: 'Show Signal Markers', defval: true },
  { id: 'paintCandles', type: 'bool', title: 'Color Candles', defval: true },
  { id: 'showBgLines', type: 'bool', title: 'Signal Change Lines', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero Lag Basis', color: '#00ffaa', lineWidth: 3 },
  { id: 'plot1', title: 'Price', color: color.blue, lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Zero Lag Signals For Loop',
  shortTitle: 'ZL Signals Loop',
  overlay: true,
};

const COLOR_PRESETS: Record<Exclude<ZeroLagColorPreset, 'Custom'>, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00d4ff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Cyber: ['#00cccc', '#ff6600'],
  Neon: ['#ffff00', '#ff00ff'],
};

export function calculate(
  bars: Bar[],
  inputs: Partial<ZeroLagSignalsForLoopInputs> = {}
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  let { length, volatilityMult, loopEnd, thresholdUp, thresholdDown } = cfg;
  const { presetConfig, loopStart, colorPreset, paintCandles, showBgLines } = cfg;
  if (presetConfig === 'Fast Response') {
    length = 30;
    volatilityMult = 1.2;
    loopEnd = 45;
    thresholdUp = 3;
    thresholdDown = -3;
  } else if (presetConfig === 'Smooth Trend') {
    length = 70;
    volatilityMult = 2.0;
    loopEnd = 100;
    thresholdUp = 8;
    thresholdDown = -8;
  }
  const [bullColor, bearColor] = colorPreset === 'Custom' ? [cfg.bullColor, cfg.bearColor] : COLOR_PRESETS[colorPreset];
  const n = bars.length;

  // lag = math.floor((length - 1) / 2); zl_basis = ta.ema(close + (close - close[lag]), length)
  const lag = Math.floor((length - 1) / 2);
  const zlSrc = bars.map((b, i) => (i >= lag ? b.close + (b.close - bars[i - lag].close) : NaN));
  const zlBasis = ta.ema(Series.fromArray(bars, zlSrc), length).toArray().map((v) => v ?? NaN);
  // volatility = ta.highest(ta.atr(length), length * 3) * volatility_mult
  const atr = ta.atr(bars, length);
  const volatility = ta.highest(atr, length * 3).toArray().map((v) => (v ?? NaN) * volatilityMult);

  const trend: number[] = new Array(n);
  const trendChanged: boolean[] = new Array(n);
  let trendVar = 0;
  let prevTrend = 0;
  for (let i = 0; i < n; i++) {
    // forloop_analysis: sum += basis > basis[i] ? 1 : -1 for i = loop_start to loop_end (na comparison: -1)
    let score = 0;
    for (let k = loopStart; k <= loopEnd; k++) {
      const past = i - k >= 0 ? zlBasis[i - k] : NaN;
      score += zlBasis[i] > past ? 1 : -1;
    }
    const close = bars[i].close;
    const longSignal = score > thresholdUp && close > zlBasis[i] + volatility[i];
    const shortSignal = score < thresholdDown && close < zlBasis[i] - volatility[i];
    if (longSignal) trendVar = 1;
    else if (shortSignal) trendVar = -1;
    trend[i] = trendVar;
    trendChanged[i] = trendVar !== prevTrend;
    prevTrend = trendVar;
  }

  // trend_col = trend == 1 ? bull_color : trend == -1 ? bear_color : na
  const trendCol = (i: number): string | null => (trend[i] === 1 ? bullColor : trend[i] === -1 ? bearColor : null);

  // plot(zl_basis, "Zero Lag Basis", color = trend_col, linewidth = 3)
  const plot0 = bars.map((b, i) => ({ time: b.time, value: zlBasis[i], color: trendCol(i) ?? 'transparent' }));
  // plot(hl2, "Price", display = display.none)
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const plot1 = bars.map((b, i) => ({ time: b.time, value: hl2[i] }));

  // fill(p_basis, p_price, hl2, zl_basis, na, color.new(trend_col, 20)): top_value hl2 (na colour),
  // bottom_value zl_basis (trend colour, transparency 20). Pine color.new(na, 20) is black with transparency 20
  // (0xCC000000), so the fill is drawn in black before the first trend.
  const bottomColor = bars.map((_b, i): string | null => {
    const c = trendCol(i);
    return c === null ? '#000000CC' : String(color.new(c, 20));
  });

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // plotshape(trend_changed and trend == 1 ? zl_basis : na, "Bullish Trend", shape.labelup, location.absolute,
    //   bull_color, text = "𝑳", textcolor = #000000, size = size.small)
    if (trendChanged[i] && trend[i] === 1 && !isNaN(zlBasis[i])) {
      markers.push({
        time: t, position: 'atPriceBottom', price: zlBasis[i], shape: 'labelUp', color: bullColor,
        text: '𝑳', textColor: '#000000', size: 'small', forceOverlay: true,
      });
    }
    // plotshape(trend_changed and trend == -1 ? zl_basis : na, "Bearish Trend", shape.labeldown, location.absolute,
    //   bear_color, text = "𝑺", textcolor = #ffffff, size = size.small)
    if (trendChanged[i] && trend[i] === -1 && !isNaN(zlBasis[i])) {
      markers.push({
        time: t, position: 'atPriceTop', price: zlBasis[i], shape: 'labelDown', color: bearColor,
        text: '𝑺', textColor: '#ffffff', size: 'small', forceOverlay: true,
      });
    }
    // bgcolor(show_bg_lines ? (ta.crossover(trend, 0) ? bull_color : ta.crossunder(trend, 0) ? bear_color : na) : na)
    if (showBgLines && i > 0) {
      if (trend[i] > 0 && trend[i - 1] <= 0) bgColors.push({ time: t, color: bullColor });
      else if (trend[i] < 0 && trend[i - 1] >= 0) bgColors.push({ time: t, color: bearColor });
    }
    // barcolor(paint_candles ? trend_col : na)
    const c = trendCol(i);
    if (paintCandles && c !== null) barColors.push({ time: t, color: c });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills: [
      {
        plot1: 'plot0', plot2: 'plot1',
        gradient: { topValue: hl2, bottomValue: zlBasis, topColor: new Array<string | null>(n).fill(null), bottomColor },
      },
    ],
    markers,
    barColors,
    bgColors,
    // alertcondition(ta.crossover(trend, 0)) / alertcondition(ta.crossunder(trend, 0))
    alerts: alertStates(alertConditions, bars, [crossedOver(trend, 0), crossedUnder(trend, 0)]),
  };
}

/** alertcondition() calls of the original ({{exchange}} / {{ticker}} placeholders kept) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Zero Lag Signals Long', message: 'Zero Lag Signals Long {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Zero Lag Signals Short', message: 'Zero Lag Signals Short {{exchange}}:{{ticker}}' },
];

export const ZeroLagSignalsForLoop = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
