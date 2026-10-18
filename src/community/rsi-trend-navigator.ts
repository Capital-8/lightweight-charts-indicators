/**
 * RSI Trend Navigator
 *
 * An adaptive average of the source (alpha 2 / (trendPeriod * 0.5 + 1) while the EMA-smoothed RSI is above 50, else
 * 2 / (trendPeriod * 1.5 + 1)) is moved by the normalised smoothed RSI ((RSI - 50) / 50) times ATR(14) times the
 * sensitivity. ATR bands around this value push a trailing trend line: it falls to the upper band when the band is
 * below it and rises to the lower band when the band is above it. The trend is bullish after a rise of the line and
 * bearish after a fall; it colours the line, a gradient fill between the line and hl2, and optionally the bars.
 * Alerts (alertcondition, `alerts` of the result): 'RSI Trend Bullish' / 'RSI Trend Bearish', true on the bar where
 * the trend turns bullish / bearish (both are off until the line first rises or falls).
 *
 * Reference: "RSI Trend Navigator [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type RSITrendNavigatorPreset = 'Classic' | 'Aqua' | 'Cosmic' | 'Custom';

export interface RSITrendNavigatorInputs {
  /** RSI period */
  rsiPeriod: number;
  /** EMA length of the RSI */
  rsiSmoothing: number;
  /** Base trend period (sets the adaptive alpha) */
  trendPeriod: number;
  /** RSI sensitivity */
  rsiSensitivity: number;
  /** ATR period of the bands */
  atrPeriod: number;
  /** ATR multiplier of the bands */
  atrMultiplier: number;
  /** Price source */
  priceSource: SourceType;
  /** Colour preset */
  colorPreset: RSITrendNavigatorPreset;
  /** Bullish colour of the 'Custom' preset */
  bullColor: string;
  /** Bearish colour of the 'Custom' preset */
  bearColor: string;
  /** Colour the candles */
  paintBars: boolean;
}

export const defaultInputs: RSITrendNavigatorInputs = {
  rsiPeriod: 14,
  rsiSmoothing: 5,
  trendPeriod: 21,
  rsiSensitivity: 0.5,
  atrPeriod: 14,
  atrMultiplier: 1.5,
  priceSource: 'close',
  colorPreset: 'Custom',
  bullColor: '#00ffaa',
  bearColor: '#ff0000',
  paintBars: false,
};

const TREND = '════════ Trend Settings ════════';
const VISUAL = '════════ Visualization Settings ════════';

export const inputConfig: InputConfig[] = [
  { id: 'rsiPeriod', type: 'int', title: 'RSI Period', defval: 14, min: 2, group: TREND },
  { id: 'rsiSmoothing', type: 'int', title: 'RSI Smoothing', defval: 5, min: 1, group: TREND },
  { id: 'trendPeriod', type: 'int', title: 'Base Trend Period', defval: 21, min: 2, group: TREND },
  { id: 'rsiSensitivity', type: 'float', title: 'RSI Sensitivity', defval: 0.5, min: 0.1, max: 2.0, step: 0.1, group: TREND },
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 14, min: 1, group: TREND },
  { id: 'atrMultiplier', type: 'float', title: 'ATR Multiplier', defval: 1.5, min: 0.1, step: 0.1, group: TREND },
  { id: 'priceSource', type: 'source', title: 'Price Source', defval: 'close', group: TREND },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Custom'], group: VISUAL },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa', group: VISUAL },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#ff0000', group: VISUAL },
  { id: 'paintBars', type: 'bool', title: 'Color Candles', defval: false, group: VISUAL },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI Trend Line', color: '#00ffaa', lineWidth: 4 },
  { id: 'plot1', title: 'Price', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'RSI Trend Navigator [QuantAlgo]',
  shortTitle: 'RSI Trend Navigator [QuantAlgo]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RSITrendNavigatorInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const [bullCol, bearCol] = cfg.colorPreset === 'Classic' ? ['#00ff00', '#ff0000']
    : cfg.colorPreset === 'Aqua' ? ['#00bfff', '#ff8c00']
      : cfg.colorPreset === 'Cosmic' ? ['#ff1493', '#9932cc']
        : [cfg.bullColor, cfg.bearColor];

  // rsiSmoothedTrend(priceSource, rsiPeriod, rsiSmoothing, trendPeriod, rsiSensitivity)
  const srcSeries = getSourceSeries(bars, cfg.priceSource);
  const src = A(srcSeries);
  const rsi = A(ta.rsi(srcSeries, cfg.rsiPeriod));
  const smoothedRSI = A(ta.ema(Series.fromArray(bars, rsi), cfg.rsiSmoothing));
  const atr14 = A(ta.atr(bars, 14));
  const atr = A(ta.atr(bars, cfg.atrPeriod));
  const fastAlpha = 2.0 / (cfg.trendPeriod * 0.5 + 1);
  const slowAlpha = 2.0 / (cfg.trendPeriod * 1.5 + 1);

  const trendLine: number[] = new Array(n).fill(NaN);
  const currentTrend: string[] = new Array(n);
  let adaptiveTrend = NaN; // var float adaptiveTrend = source (bar 0), then the update below on every bar
  let line = NaN; // var float trendLine = rsiTrendValue
  let isBullish = false;
  let isBearish = false;
  // alertcondition(isBullish and not isBullish[1]) / alertcondition(isBearish and not isBearish[1])
  const bullTurn: boolean[] = new Array(n).fill(false);
  const bearTurn: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const s = src[i];
    const normalizedRSI = (smoothedRSI[i] - 50) / 50;
    const rsiAdjustment = normalizedRSI * atr14[i] * cfg.rsiSensitivity;
    const adaptiveAlpha = gt(smoothedRSI[i], 50) ? fastAlpha : slowAlpha;
    // adaptiveTrend := adaptiveAlpha * source + (1 - adaptiveAlpha) * nz(adaptiveTrend[1], source)
    const prev = i === 0 || isNaN(adaptiveTrend) ? s : adaptiveTrend;
    adaptiveTrend = adaptiveAlpha * s + (1 - adaptiveAlpha) * prev;
    const rsiTrendValue = adaptiveTrend + rsiAdjustment;

    const deviation = atr[i] * cfg.atrMultiplier;
    const upperBound = rsiTrendValue + deviation;
    const lowerBound = rsiTrendValue - deviation;
    // trendLine := nz(trendLine[1], rsiTrendValue)
    if (isNaN(line)) line = rsiTrendValue;
    if (lt(upperBound, line)) line = upperBound;
    if (gt(lowerBound, line)) line = lowerBound;
    trendLine[i] = line;

    const prevLine = i > 0 ? trendLine[i - 1] : NaN;
    const wasBullish = isBullish;
    const wasBearish = isBearish;
    if (gt(line, prevLine)) { isBullish = true; isBearish = false; }
    else if (lt(line, prevLine)) { isBullish = false; isBearish = true; }
    bullTurn[i] = isBullish && !wasBullish;
    bearTurn[i] = isBearish && !wasBearish;
    currentTrend[i] = isBullish ? bullCol : bearCol;
  }

  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const barColors: BarColorData[] = [];
  if (cfg.paintBars) {
    // barcolor(paintBars ? currentTrend : na)
    for (let i = 0; i < n; i++) barColors.push({ time: bars[i].time, color: currentTrend[i] });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(trendLine, 'RSI Trend Line', color = currentTrend, linewidth = 4)
      plot0: bars.map((b, i) => ({ time: b.time, value: trendLine[i], color: currentTrend[i] })),
      // plot(hl2, 'Price', display = display.none, editable = false)
      plot1: bars.map((b, i) => ({ time: b.time, value: hl2[i] })),
    },
    fills: [{
      // fill(p_trend, p_price, hl2, trendLine, na, color.new(currentTrend, 20))
      plot1: 'plot0', plot2: 'plot1',
      gradient: {
        topValue: hl2,
        bottomValue: trendLine,
        topColor: new Array<string | null>(n).fill(null),
        bottomColor: currentTrend.map((c) => String(color.new(c, 20))),
      },
    }],
    barColors,
    alerts: alertStates(alertConditions, bars, [bullTurn, bearTurn]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RSI Trend Bullish', message: 'RSI Trend Bullish Signal {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'RSI Trend Bearish', message: 'RSI Trend Bearish Signal {{exchange}}:{{ticker}}' },
];

export const RSITrendNavigator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
