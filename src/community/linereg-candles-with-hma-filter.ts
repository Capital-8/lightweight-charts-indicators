/**
 * Advanced LinReg Candles with AI Optimization
 *
 * Candles made of the linear regressions (length L) of open, high, low and close, and a signal line: a running
 * average of the regression close (s += (x - s) / len, or an EMA, or a volume form). A cross of the regression close
 * over / under the signal line is a buy / sell signal: marker, background colour and candle colour (a gradient by a
 * signal strength made of the distance to the signal, the regression slope and the relative volume). Optional:
 * volatility adaptation of the lengths (ATR based, with factors updated every N bars), confirmation by the next bar,
 * an anti-whipsaw filter (slope and volume), and divergences between the regression close and its smoothed slope.
 * Alerts (alertcondition, `alerts` of the result): buy / sell signals at least 'Bars Between Alerts' bars after the
 * previous alert of the same kind, bullish / bearish divergences; all off when 'Enable Alerts' is off.
 *
 * Reference: "Advanced LinReg Candles with AI Optimization" by MaximusGains
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © MaximusGains
 */

import { ta, Series, color, callsite, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AdvancedLinRegCandlesInputs {
  /** Signal smoothing length */
  signalLength: number;
  /** Signal line: running SMA (true) or running EMA (false) */
  smaSignal: boolean;
  /** Use the linear regressions for OHLC */
  linReg: boolean;
  /** Linear regression length */
  linregLength: number;
  useVolumeWeight: boolean;
  volatilityAdaptation: boolean;
  divergenceDetection: boolean;
  confirmSignals: boolean;
  antiWhipsaw: boolean;
  showBg: boolean;
  showCandles: boolean;
  showMarkers: boolean;
  /** Declared in the Pine script, not used by its outputs */
  showSlope: boolean;
  useGradient: boolean;
  buyColor: string;
  sellColor: string;
  bullishCandleColor: string;
  bearishCandleColor: string;
  markerBuyColor: string;
  markerSellColor: string;
  backgroundBuyColor: string;
  backgroundSellColor: string;
  /** Declared in the Pine script, not used by its outputs */
  slopeUpColor: string;
  /** Declared in the Pine script, not used by its outputs */
  slopeDownColor: string;
  /** Declared in the Pine script, not used by its outputs */
  lookbackPeriods: number;
  /** Bars between two updates of the optimisation factors */
  optimizationFrequency: number;
  volatilitySensitivity: number;
  /** Alert settings (alertcondition only: `alerts` of the result; the lookback is not used by the original) */
  alertEnabled: boolean;
  alertLookback: number;
  alertRearmBars: number;
}

export const defaultInputs: AdvancedLinRegCandlesInputs = {
  signalLength: 11,
  smaSignal: true,
  linReg: true,
  linregLength: 11,
  useVolumeWeight: false,
  volatilityAdaptation: false,
  divergenceDetection: false,
  confirmSignals: false,
  antiWhipsaw: false,
  showBg: true,
  showCandles: true,
  showMarkers: true,
  showSlope: true,
  useGradient: true,
  buyColor: String(color.rgb(230, 0, 211, 31)),
  sellColor: String(color.rgb(8, 8, 8)),
  bullishCandleColor: String(color.rgb(26, 110, 29, 14)),
  bearishCandleColor: String(color.rgb(207, 29, 29, 27)),
  markerBuyColor: color.lime,
  markerSellColor: String(color.rgb(238, 255, 82)),
  backgroundBuyColor: String(color.new('#c210aa', 81)),
  backgroundSellColor: String(color.new('#070707', 55)),
  slopeUpColor: String(color.new('#00FFAA', 40)),
  slopeDownColor: String(color.new('#FF5555', 40)),
  lookbackPeriods: 33,
  optimizationFrequency: 10,
  volatilitySensitivity: 1.0,
  alertEnabled: true,
  alertLookback: 1,
  alertRearmBars: 2,
};

const G_MAIN = 'Main Settings';
const G_VISUAL = 'Visual Settings';
const G_ADVANCED = 'Advanced Features';
const G_ALERTS = 'Alert Settings';
const G_OPT = 'AI Optimization Settings';

export const inputConfig: InputConfig[] = [
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 11, min: 1, max: 200, group: G_MAIN },
  { id: 'smaSignal', type: 'bool', title: 'Simple MA (Signal Line)', defval: true, group: G_MAIN },
  { id: 'linReg', type: 'bool', title: 'Use Lin Reg for OHLC', defval: true, group: G_MAIN },
  { id: 'linregLength', type: 'int', title: 'Linear Regression Length', defval: 11, min: 1, max: 200, group: G_MAIN },
  { id: 'useVolumeWeight', type: 'bool', title: 'Enable Volume Weighting', defval: false, group: G_ADVANCED },
  { id: 'volatilityAdaptation', type: 'bool', title: 'Enable Volatility Adaptation', defval: false, group: G_ADVANCED },
  { id: 'divergenceDetection', type: 'bool', title: 'Enable Divergence Detection', defval: false, group: G_ADVANCED },
  { id: 'confirmSignals', type: 'bool', title: 'Require Signal Confirmation', defval: false, group: G_ADVANCED },
  { id: 'antiWhipsaw', type: 'bool', title: 'Enable Anti-Whipsaw Filter', defval: false, group: G_ADVANCED },
  { id: 'showBg', type: 'bool', title: 'Show Background Highlight', defval: true, group: G_VISUAL },
  { id: 'showCandles', type: 'bool', title: 'Show LinReg Candles', defval: true, group: G_VISUAL },
  { id: 'showMarkers', type: 'bool', title: 'Show Signal Markers', defval: true, group: G_VISUAL },
  { id: 'showSlope', type: 'bool', title: 'Show LinReg Slope', defval: true, group: G_VISUAL },
  { id: 'useGradient', type: 'bool', title: 'Use Gradient Colors', defval: true, group: G_VISUAL },
  { id: 'buyColor', type: 'color', title: 'Buy Candle Color', defval: defaultInputs.buyColor, group: G_VISUAL },
  { id: 'sellColor', type: 'color', title: 'Sell Candle Color', defval: defaultInputs.sellColor, group: G_VISUAL },
  { id: 'bullishCandleColor', type: 'color', title: 'Bullish Candle Default Color', defval: defaultInputs.bullishCandleColor, group: G_VISUAL },
  { id: 'bearishCandleColor', type: 'color', title: 'Bearish Candle Default Color', defval: defaultInputs.bearishCandleColor, group: G_VISUAL },
  { id: 'markerBuyColor', type: 'color', title: 'Buy Marker Color', defval: defaultInputs.markerBuyColor, group: G_VISUAL },
  { id: 'markerSellColor', type: 'color', title: 'Sell Marker Color', defval: defaultInputs.markerSellColor, group: G_VISUAL },
  { id: 'backgroundBuyColor', type: 'color', title: 'Buy Background Color', defval: defaultInputs.backgroundBuyColor, group: G_VISUAL },
  { id: 'backgroundSellColor', type: 'color', title: 'Sell Background Color', defval: defaultInputs.backgroundSellColor, group: G_VISUAL },
  { id: 'slopeUpColor', type: 'color', title: 'Upward Slope Color', defval: defaultInputs.slopeUpColor, group: G_VISUAL },
  { id: 'slopeDownColor', type: 'color', title: 'Downward Slope Color', defval: defaultInputs.slopeDownColor, group: G_VISUAL },
  { id: 'lookbackPeriods', type: 'int', title: 'Optimization Lookback Periods', defval: 33, min: 10, max: 500, group: G_OPT },
  { id: 'optimizationFrequency', type: 'int', title: 'Optimization Frequency (bars)', defval: 10, min: 1, max: 50, group: G_OPT },
  { id: 'volatilitySensitivity', type: 'float', title: 'Volatility Sensitivity', defval: 1.0, min: 0.1, max: 3.0, step: 0.1, group: G_OPT },
  { id: 'alertEnabled', type: 'bool', title: 'Enable Alerts', defval: true, group: G_ALERTS },
  { id: 'alertLookback', type: 'int', title: 'Alert Lookback (bars)', defval: 1, min: 1, max: 10, group: G_ALERTS },
  { id: 'alertRearmBars', type: 'int', title: 'Bars Between Alerts', defval: 2, min: 1, max: 50, group: G_ALERTS },
];

const SIGNAL_SMA_COLOR = String(color.rgb(255, 255, 255, 47));
const VOL_COLOR = String(color.new(color.purple, 80));
const LEN_COLOR = String(color.new(color.blue, 80));
const SIG_LEN_COLOR = String(color.new(color.orange, 80));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Signal Line', color: SIGNAL_SMA_COLOR, lineWidth: 2 },
  { id: 'plot1', title: 'Volatility Measure', color: VOL_COLOR, lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Adaptive LinReg Length', color: LEN_COLOR, lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Adaptive Signal Length', color: SIG_LEN_COLOR, lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Advanced LinReg Candles with AI Optimization',
  shortTitle: 'AI LinReg',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (x: number, y: number) => (isNaN(x) ? y : x);

/** Running average with a per-bar length: var x = na; x := na(x) ? src : x + (src - x) / math.max(1, len) */
function varSma(src: number[], len: number[]): number[] {
  let v = NaN;
  return src.map((s, i) => (v = isNaN(v) ? s : v + (s - v) / Math.max(1, len[i])));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AdvancedLinRegCandlesInputs> = {},
): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[]; bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]>;
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const open = bars.map((b) => b.open);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);
  const va = cfg.volatilityAdaptation;

  // Adaptive parameters
  const atr = A(ta.atr(bars, 14));
  const sma9 = A(ta.sma(S(close), 9));
  const sma14 = A(ta.sma(S(close), 14));
  const sma21 = A(ta.sma(S(close), 21));
  const volMeasure: number[] = new Array(n);
  const optLinreg: number[] = new Array(n);
  const optSignal: number[] = new Array(n);
  const validLinreg: number[] = new Array(n);
  const validSignal: number[] = new Array(n);
  let linregFactor = 1.0; // var float optimal_linreg_factor = 1.0
  let signalFactor = 1.0; // var float optimal_signal_factor = 1.0
  for (let i = 0; i < n; i++) {
    // volatility_measure = na(atr_value) ? 0 : atr_value / nz(close, 1) * 100
    const vm = isNaN(atr[i]) ? 0 : (atr[i] / nz(close[i], 1)) * 100;
    volMeasure[i] = vm;
    const adapt = (len: number, lo: number) => (va
      ? (isNaN(vm) ? len : Math.max(lo, Math.min(30, Math.round(len * (1.5 - (vm / 100) * cfg.volatilitySensitivity)))))
      : len);
    const adaptiveLinreg = adapt(cfg.linregLength, 3);
    const adaptiveSignal = adapt(cfg.signalLength, 2);
    // math.max / math.round give na with an na factor
    optLinreg[i] = isNaN(adaptiveLinreg) ? cfg.linregLength : Math.max(2, Math.round(adaptiveLinreg * linregFactor));
    optSignal[i] = isNaN(adaptiveSignal) ? cfg.signalLength : Math.max(1, Math.round(adaptiveSignal * signalFactor));
    // The factors are updated after the lengths of this bar (bar_index from the first bar of the data)
    if (va && i % cfg.optimizationFrequency === 0) {
      const recentVolatility = (atr[i] / sma9[i]) * 100;
      const recentTrendStrength = (Math.abs(sma14[i] - sma21[i]) / sma21[i]) * 100;
      linregFactor = Math.max(0.9, Math.min(1.0, 1.0 + (recentVolatility - 2) * 0.02));
      signalFactor = Math.max(0.5, Math.min(2.0, 1.0 + (recentTrendStrength - 1) * 0.01));
    }
    validLinreg[i] = Math.max(1, Math.round(nz(optLinreg[i], cfg.linregLength)));
    validSignal[i] = Math.max(1, Math.round(nz(optSignal[i], cfg.signalLength)));
  }

  // ta.linreg with a per-bar length: it keeps no state, so the value of bar i with length L is the value of the
  // fixed-length series of length L on bar i
  const byLength = (src: number[], len: number[], fn: (s: Series, l: number) => Series): number[] => {
    const cache = new Map<number, number[]>();
    return len.map((l, i) => {
      let r = cache.get(l);
      if (!r) {
        r = A(fn(S(src), l));
        cache.set(l, r);
      }
      return r[i];
    });
  };
  const linreg = (src: number[], len: number[], offset: number) => byLength(src, len, (s, l) => ta.linreg(s, l, offset));

  // calcOHLC: validLen = math.max(1, na(len) ? 14 : len)
  const ohlcLen = validLinreg.map((l) => Math.max(1, l));
  const bopen = cfg.linReg ? linreg(open, ohlcLen, 0) : open;
  const bhigh = cfg.linReg ? linreg(high, ohlcLen, 0) : high;
  const blow = cfg.linReg ? linreg(low, ohlcLen, 0) : low;
  const bclose = cfg.linReg ? linreg(close, ohlcLen, 0) : close;

  // calcSignalLine: one branch runs (the inputs are constant)
  const sigLen = validSignal.map((l) => Math.max(1, l));
  let signal: number[];
  if (cfg.useVolumeWeight) {
    // var_vwma: x + (src * volume / volume - x) / math.max(1, len) (volume 0 gives 0 / 0 = na)
    let v = NaN;
    signal = bclose.map((s, i) => (v = isNaN(v) ? s : v + ((s * volume[i]) / volume[i] - v) / Math.max(1, sigLen[i])));
  } else if (cfg.smaSignal) {
    signal = varSma(bclose, sigLen);
  } else {
    // var_ema: alpha = 2.0 / math.max(1, len + 1)
    let v = NaN;
    signal = bclose.map((s, i) => (v = isNaN(v) ? s : v + (2.0 / Math.max(1, sigLen[i] + 1)) * (s - v)));
  }

  // slope = (ta.linreg(bclose, len, 0) - ta.linreg(bclose, len, 1)) / bclose * 1000
  const lr0 = linreg(bclose, validLinreg, 0);
  const lr1 = linreg(bclose, validLinreg, 1);
  const slope = bclose.map((c, i) => ((lr0[i] - lr1[i]) / c) * 1000);
  const smoothedSlope = A(ta.sma(S(slope), 3));

  // calcSignals
  const volSma20 = varSma(volume, new Array(n).fill(20));
  const crossover = callsite.crossover();
  const crossunder = callsite.crossunder();
  const buySignal: boolean[] = new Array(n);
  const sellSignal: boolean[] = new Array(n);
  const rawBuy: boolean[] = new Array(n);
  const rawSell: boolean[] = new Array(n);
  const buy: boolean[] = new Array(n);
  const sell: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    rawBuy[i] = crossover(bclose[i], signal[i]);
    rawSell[i] = crossunder(bclose[i], signal[i]);
    const slopeBuy = !cfg.antiWhipsaw || gt(slope[i], 0);
    const slopeSell = !cfg.antiWhipsaw || lt(slope[i], 0);
    // volume_factor = use_volume_weight ? math.min(3.0, _volume / var_sma(_volume, 20)) : 1.0
    const volumeFactor = cfg.useVolumeWeight ? Math.min(3.0, volume[i] / volSma20[i]) : 1.0;
    const strongEnough = !cfg.antiWhipsaw || gt(volumeFactor, 0.8);
    buy[i] = rawBuy[i] && slopeBuy && strongEnough;
    sell[i] = rawSell[i] && slopeSell && strongEnough;
    buySignal[i] = cfg.confirmSignals ? i > 0 && buy[i - 1] && gt(bclose[i], bclose[i - 1]) : buy[i];
    sellSignal[i] = cfg.confirmSignals ? i > 0 && sell[i - 1] && lt(bclose[i], bclose[i - 1]) : sell[i];
  }

  // calcSignalStrength
  const strength = bclose.map((c, i) => {
    const priceDistance = (Math.abs(c - signal[i]) / signal[i]) * 100;
    const slopeFactor = Math.abs(slope[i]) * 10;
    const volumeFactor = volume[i] / volSma20[i];
    return Math.min(1.0, (priceDistance * 0.3 + slopeFactor * 0.4 + volumeFactor * 0.3) / 2);
  });

  // checkDivergence(bclose, smoothed_slope, divergence_lookback)
  const bullDiv: boolean[] = new Array(n).fill(false);
  const bearDiv: boolean[] = new Array(n).fill(false);
  if (cfg.divergenceDetection) {
    const lookback = validLinreg.map((l) => Math.max(1, Math.max(5, Math.min(30, Math.round(l * 1.5)))));
    const prev = (x: number[]) => x.map((_v, i) => (i > 0 ? x[i - 1] : NaN));
    // ta.lowest / ta.highest(x, lookback): with volatility adaptation the lookback changes per bar (series length,
    // one call site per call: callsite.lowest / highest keep the Pine state); without it the length is fixed
    const extreme = (x: number[], isLow: boolean) => {
      if (!va) return A(isLow ? ta.lowest(S(x), lookback[0] ?? 1) : ta.highest(S(x), lookback[0] ?? 1));
      const site = isLow ? callsite.lowest() : callsite.highest();
      return x.map((v, i) => site(v, lookback[i]));
    };
    const lowPrice = extreme(prev(bclose), true);
    const lowSlope = extreme(prev(smoothedSlope), true);
    const highPrice = extreme(prev(bclose), false);
    const highSlope = extreme(prev(smoothedSlope), false);
    for (let i = 0; i < n; i++) {
      bullDiv[i] = lt(bclose[i], lowPrice[i]) && gt(smoothedSlope[i], lowSlope[i]);
      bearDiv[i] = gt(bclose[i], highPrice[i]) && lt(smoothedSlope[i], highSlope[i]);
    }
  }

  // getCandleColor
  const buyFrom = String(color.new(cfg.buyColor, 70));
  const sellFrom = String(color.new(cfg.sellColor, 70));
  const candleColor = bars.map((_b, i) => {
    if (buySignal[i] || rawBuy[i]) {
      return cfg.useGradient ? color.from_gradient(strength[i], 0.0, 1.0, buyFrom, cfg.buyColor) : cfg.buyColor;
    }
    if (sellSignal[i] || rawSell[i]) {
      return cfg.useGradient ? color.from_gradient(strength[i], 0.0, 1.0, sellFrom, cfg.sellColor) : cfg.sellColor;
    }
    return lt(bopen[i], bclose[i]) ? cfg.bullishCandleColor : cfg.bearishCandleColor;
  });

  // Background
  const bullDivBg = String(color.new(cfg.backgroundBuyColor, 90));
  const bearDivBg = String(color.new(cfg.backgroundSellColor, 90));
  const bgColors: BgColorData[] = [];
  if (cfg.showBg) {
    for (let i = 0; i < n; i++) {
      let c: string | null = null;
      if (buySignal[i] || (rawBuy[i] && !cfg.confirmSignals)) c = cfg.backgroundBuyColor;
      else if (sellSignal[i] || (rawSell[i] && !cfg.confirmSignals)) c = cfg.backgroundSellColor;
      else if (bullDiv[i]) c = bullDivBg;
      else if (bearDiv[i]) c = bearDivBg;
      if (c !== null) bgColors.push({ time: bars[i].time, color: c });
    }
  }

  // plotcandle(show_candles ? bopen : na, ...): no candle where a value is na
  const candles: PlotCandleData[] = [];
  if (cfg.showCandles) {
    for (let i = 0; i < n; i++) {
      if ([bopen[i], bhigh[i], blow[i], bclose[i]].some((v) => isNaN(v))) continue;
      const c = candleColor[i];
      candles.push({ time: bars[i].time, open: bopen[i], high: bhigh[i], low: blow[i], close: bclose[i],
        color: c, wickColor: c, borderColor: c });
    }
  }

  // Markers
  const markers: MarkerData[] = [];
  const bullDivMarker = String(color.new(cfg.markerBuyColor, 40));
  const bearDivMarker = String(color.new(cfg.markerSellColor, 40));
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    if (cfg.showMarkers && buySignal[i]) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: cfg.markerBuyColor, text: 'buy',
        textColor: String(color.rgb(27, 240, 211)), size: 'tiny', id: 'shape0' });
    }
    if (cfg.showMarkers && sellSignal[i]) {
      markers.push({ time: t, position: 'aboveBar', shape: 'cross', color: cfg.markerSellColor, text: 'sell',
        textColor: String(color.rgb(17, 240, 221)), size: 'tiny', id: 'shape1' });
    }
    if (cfg.divergenceDetection && bullDiv[i]) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: bullDivMarker, text: '⋓',
        textColor: String(color.rgb(25, 184, 33)), size: 'tiny', id: 'shape2' });
    }
    if (cfg.divergenceDetection && bearDiv[i]) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: bearDivMarker, text: '⋒',
        textColor: String(color.rgb(201, 30, 30)), size: 'tiny', id: 'shape3' });
    }
  }

  // var last_buy_alert_bar = 0 / last_sell_alert_bar = 0: a signal alerts when alert_rearm_bars bars have passed
  const buyAlert: boolean[] = new Array(n);
  const sellAlert: boolean[] = new Array(n);
  let lastBuy = 0, lastSell = 0;
  for (let i = 0; i < n; i++) {
    const b = buySignal[i] && i - lastBuy >= cfg.alertRearmBars;
    const s = sellSignal[i] && i - lastSell >= cfg.alertRearmBars;
    if (b) lastBuy = i;
    if (s) lastSell = i;
    buyAlert[i] = cfg.alertEnabled && b;
    sellAlert[i] = cfg.alertEnabled && s;
  }
  const divAlert = (d: boolean[]) => d.map((v) => cfg.alertEnabled && cfg.divergenceDetection && v);

  const signalColor = (i: number) => (cfg.smaSignal ? SIGNAL_SMA_COLOR : candleColor[i]);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: signal[i], color: signalColor(i) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: va ? volMeasure[i] : NaN, color: VOL_COLOR })),
      plot2: bars.map((b, i) => ({ time: b.time, value: va ? optLinreg[i] : NaN, color: LEN_COLOR })),
      plot3: bars.map((b, i) => ({ time: b.time, value: va ? optSignal[i] : NaN, color: SIG_LEN_COLOR })),
    },
    markers,
    bgColors,
    plotCandles: { linregCandles: candles },
    alerts: alertStates(alertConditions, bars, [buyAlert, sellAlert, divAlert(bullDiv), divAlert(bearDiv)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'LinReg Candles: Buy signal generated' },
  { id: 'alert1', title: 'Sell Alert', message: 'LinReg Candles: Sell signal generated' },
  { id: 'alert2', title: 'Bullish Divergence Alert', message: 'LinReg Candles: Bullish divergence detected' },
  { id: 'alert3', title: 'Bearish Divergence Alert', message: 'LinReg Candles: Bearish divergence detected' },
];

export const AdvancedLinRegCandles = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
