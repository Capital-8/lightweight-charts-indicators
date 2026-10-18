/**
 * ATR Volatility and Trend Analysis
 *
 * Three pairs of bands at close +- ATR * multiplier. A volatility breakout circle marks the first bar where the ATR
 * is above its SMA (same length) times the threshold. Trend: the ATR is above its SMA (trend smoothing length) and
 * the close is above its SMA (bullish) or not (bearish); a label marks the first bar of each new trend state.
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): "ATR Volatility Breakout",
 * "ATR Bullish Trend Signal", "ATR Bearish Trend Signal" on the bars of those signals (shown or not), "Price Above ATR
 * Band 1" / "Price Below ATR Band 1" when the close crosses over the upper / under the lower band 1 (the bands are
 * close +- ATR, so as in the original these two never run).
 *
 * Reference: "ATR Volatility and Trend Analysis" by dchunt-stack
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © dchunt-stack. Copyright © 2025 dchunt-stack. All rights reserved
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';
import { crossedOver, crossedUnder } from '../alert-states';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface AtrVolatilityAndTrendAnalysisInputs {
  /** ATR length */
  atrLength: number;
  showBands: boolean;
  band1Mult: number;
  band2Mult: number;
  band3Mult: number;
  showVolSignals: boolean;
  /** ATR / SMA(ATR) ratio above which volatility breaks out */
  volThreshold: number;
  showTrend: boolean;
  /** SMA length of the trend detection */
  trendLength: number;
  upperBandColor: string;
  lowerBandColor: string;
  signalColor: string;
  bullTrendSignalColor: string;
  bearTrendSignalColor: string;
}

const BULL_COLOR = '#26a69aff';
const BEAR_COLOR = '#ef5350ff';
const SIGNAL_COLOR = '#ffeb3bff';
const BAND_COLOR_UPPER = '#2196f380';
const BAND_COLOR_LOWER = '#f4433680';

export const defaultInputs: AtrVolatilityAndTrendAnalysisInputs = {
  atrLength: 14,
  showBands: true,
  band1Mult: 1.0,
  band2Mult: 2.0,
  band3Mult: 3.0,
  showVolSignals: true,
  volThreshold: 1.5,
  showTrend: true,
  trendLength: 21,
  upperBandColor: BAND_COLOR_UPPER,
  lowerBandColor: BAND_COLOR_LOWER,
  signalColor: SIGNAL_COLOR,
  bullTrendSignalColor: BULL_COLOR,
  bearTrendSignalColor: BEAR_COLOR,
};

const G1 = 'ATR Settings';
const G2 = 'ATR Bands Settings';
const G3 = 'Volatility Signals';
const G4 = 'Trend Detection';
const G5 = 'Visual Settings';

export const inputConfig: InputConfig[] = [
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1, max: 100, group: G1, tooltip: 'Period for ATR calculation' },
  { id: 'showBands', type: 'bool', title: 'Show ATR Bands', defval: true, group: G2, tooltip: 'Display ATR-based support/resistance bands' },
  { id: 'band1Mult', type: 'float', title: 'Band 1 Multiplier', defval: 1.0, min: 0.1, max: 10.0, step: 0.1, group: G2, tooltip: 'ATR multiplier for first band' },
  { id: 'band2Mult', type: 'float', title: 'Band 2 Multiplier', defval: 2.0, min: 0.1, max: 10.0, step: 0.1, group: G2, tooltip: 'ATR multiplier for second band' },
  { id: 'band3Mult', type: 'float', title: 'Band 3 Multiplier', defval: 3.0, min: 0.1, max: 10.0, step: 0.1, group: G2, tooltip: 'ATR multiplier for third band' },
  { id: 'showVolSignals', type: 'bool', title: 'Show Volatility Signals', defval: true, group: G3, tooltip: 'Display volatility breakout signals' },
  { id: 'volThreshold', type: 'float', title: 'Volatility Threshold', defval: 1.5, min: 0.5, max: 5.0, step: 0.1, group: G3, tooltip: 'ATR multiplier threshold for volatility signals' },
  { id: 'showTrend', type: 'bool', title: 'Show Trend Signals', defval: true, group: G4, tooltip: 'Display ATR-based trend signals' },
  { id: 'trendLength', type: 'int', title: 'Trend Smoothing', defval: 21, min: 5, max: 50, group: G4, tooltip: 'Period for trend smoothing' },
  { id: 'upperBandColor', type: 'color', title: 'Upper Band Color', defval: BAND_COLOR_UPPER, group: G5 },
  { id: 'lowerBandColor', type: 'color', title: 'Lower Band Color', defval: BAND_COLOR_LOWER, group: G5 },
  { id: 'signalColor', type: 'color', title: 'Volatility Signal Color', defval: SIGNAL_COLOR, group: G5 },
  { id: 'bullTrendSignalColor', type: 'color', title: 'Bullish Trend Signal Color', defval: BULL_COLOR, group: G5 },
  { id: 'bearTrendSignalColor', type: 'color', title: 'Bearish Trend Signal Color', defval: BEAR_COLOR, group: G5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Band 1', color: BAND_COLOR_UPPER, lineWidth: 1 },
  { id: 'plot1', title: 'Lower Band 1', color: BAND_COLOR_LOWER, lineWidth: 1 },
  { id: 'plot2', title: 'Upper Band 2', color: String(color.new(BAND_COLOR_UPPER, 60)), lineWidth: 1 },
  { id: 'plot3', title: 'Lower Band 2', color: String(color.new(BAND_COLOR_LOWER, 60)), lineWidth: 1 },
  { id: 'plot4', title: 'Upper Band 3', color: String(color.new(BAND_COLOR_UPPER, 80)), lineWidth: 1 },
  { id: 'plot5', title: 'Lower Band 3', color: String(color.new(BAND_COLOR_LOWER, 80)), lineWidth: 1 },
];

export const metadata = {
  title: 'ATR Volatility and Trend Analysis',
  shortTitle: 'ATR Volatility and Trend Analysis',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AtrVolatilityAndTrendAnalysisInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  const atrValue = A(ta.atr(bars, cfg.atrLength));
  const atrSma = A(ta.sma(S(atrValue), cfg.atrLength));
  // getTrendDirection(close, atrValue, trendLength)
  const srcSma = A(ta.sma(S(close), cfg.trendLength));
  const atrSmaTrend = A(ta.sma(S(atrValue), cfg.trendLength));

  // atrCrossover = ta.crossover(close, upperBand1); atrCrossunder = ta.crossunder(close, lowerBand1)
  const atrCrossover = crossedOver(close, close.map((c, i) => c + atrValue[i] * cfg.band1Mult));
  const atrCrossunder = crossedUnder(close, close.map((c, i) => c - atrValue[i] * cfg.band1Mult));

  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  const call = (time: number, message: string) => alertCalls.push({ time, message, freq: 'once_per_bar_close' });
  let prevBreakout = false; // volBreakout[1] (false before the first bar)
  let prevTrend = NaN; // trendDirection[1] (na before the first bar: `!=` is false)
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const volBreakout = gt(atrValue[i], atrSma[i] * cfg.volThreshold);
    const volSignal = volBreakout && !prevBreakout;
    prevBreakout = volBreakout;

    const priceAboveSma = gt(close[i], srcSma[i]);
    const atrRising = gt(atrValue[i], atrSmaTrend[i]);
    const trend = priceAboveSma && atrRising ? 1 : !priceAboveSma && atrRising ? -1 : 0;
    const bullishTrend = trend === 1 && !isNaN(prevTrend) && prevTrend !== 1;
    const bearishTrend = trend === -1 && !isNaN(prevTrend) && prevTrend !== -1;
    prevTrend = trend;

    if (volSignal) call(t, 'ATR Volatility Breakout');
    if (bullishTrend) call(t, 'ATR Bullish Trend Signal');
    if (bearishTrend) call(t, 'ATR Bearish Trend Signal');
    if (atrCrossover[i]) call(t, 'Price Above ATR Band 1');
    if (atrCrossunder[i]) call(t, 'Price Below ATR Band 1');

    if (cfg.showVolSignals && volSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: cfg.signalColor, size: 'tiny' });
    }
    if (cfg.showTrend && bullishTrend) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: cfg.bullTrendSignalColor, text: '↑',
        textColor: color.white, size: 'tiny' });
    }
    if (cfg.showTrend && bearishTrend) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: cfg.bearTrendSignalColor, text: '↓',
        textColor: color.white, size: 'tiny' });
    }
  }

  // getBands(close, atrValue, mult): close +- atrValue * mult
  const band = (sign: number, mult: number, col: string) => bars.map((b, i) => ({
    time: b.time, value: cfg.showBands ? b.close + sign * (atrValue[i] * mult) : NaN, color: col,
  }));
  const plots = {
    plot0: band(1, cfg.band1Mult, cfg.upperBandColor),
    plot1: band(-1, cfg.band1Mult, cfg.lowerBandColor),
    plot2: band(1, cfg.band2Mult, String(color.new(cfg.upperBandColor, 60))),
    plot3: band(-1, cfg.band2Mult, String(color.new(cfg.lowerBandColor, 60))),
    plot4: band(1, cfg.band3Mult, String(color.new(cfg.upperBandColor, 80))),
    plot5: band(-1, cfg.band3Mult, String(color.new(cfg.lowerBandColor, 80))),
  };

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    alertCalls,
  };
}

export const AtrVolatilityAndTrendAnalysis = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
