/**
 * Wavelet-Trend ML Integration [Alpha Extract]
 *
 * Trend filter: two high-pass filters of the close (short and long scale, each smoothed by EMA(3)); their
 * difference times long / short, noise-reduced (mean of EMA(1) and EMA(2)), divided by ATR and normalised by its
 * highest absolute value over `lookback` bars (clamped to -1..1). Binary classifier: a logistic unit on six binary
 * features (RSI > 50, CCI crossing +/-100, DMI, highest / lowest bar position, fast / slow EMA, SuperTrend
 * direction) whose weights learn online against the sign of the standardised close. The signal is the mean of both,
 * EMA smoothed, scaled by the ratio of its stdev over `lookback` to its stdev over 2 * lookback, clamped to -2..2.
 * Candles on the price pane, reference lines, a gradient fill to zero and labels on the zero crossings.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Signal' / 'Bearish Signal' on the zero crossings (the
 * bars of the labels).
 *
 * Reference: "Wavelet-Trend ML Integration [Alpha Extract]" by AlphaExtract
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface WaveletTrendMLIntegrationInputs {
  shortLength: number;
  longLength: number;
  smoothing: number;
  /** Normalisation lookback (max 1000) */
  lookback: number;
  atrLength: number;
  /** Enable the high-pass filter (else EMAs) */
  useWavelet: boolean;
  noiseReduction: boolean;
  wnMin: number;
  wnMax: number;
  /** Enable the binary classifier */
  enableAI: boolean;
  adaptivePeriod: number;
  /** Learning rate */
  adaptationRate: number;
  momentumPeriod: number;
  volatilityPeriod: number;
  trendStrengthPeriod: number;
  oscillationPeriod: number;
  velocityPeriod: number;
  resistanceFactor: number;
  resistancePeriod: number;
  upperCol: string;
  lowerCol: string;
  showHLines: boolean;
  hlineColor: string;
  hlineStyle: string;
}

export const defaultInputs: WaveletTrendMLIntegrationInputs = {
  shortLength: 12,
  longLength: 23,
  smoothing: 8,
  lookback: 1000,
  atrLength: 8,
  useWavelet: true,
  noiseReduction: true,
  wnMin: 1,
  wnMax: 2,
  enableAI: true,
  adaptivePeriod: 50,
  adaptationRate: 0.08,
  momentumPeriod: 29,
  volatilityPeriod: 45,
  trendStrengthPeriod: 35,
  oscillationPeriod: 35,
  velocityPeriod: 30,
  resistanceFactor: 3.2,
  resistancePeriod: 2,
  upperCol: '#00b35f',
  lowerCol: '#cf1059',
  showHLines: true,
  hlineColor: String(color.new(color.gray, 70)),
  hlineStyle: 'Dashed',
};

export const inputConfig: InputConfig[] = [
  { id: 'shortLength', type: 'int', title: 'Short Scale Length', defval: 12 },
  { id: 'longLength', type: 'int', title: 'Long Scale Length', defval: 23 },
  { id: 'smoothing', type: 'int', title: 'Final Signal Smoothing', defval: 8 },
  { id: 'lookback', type: 'int', title: 'Normalization Lookback', defval: 1000, min: 1, max: 1000, step: 1 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 8 },
  { id: 'useWavelet', type: 'bool', title: 'Enable High-Pass Filter', defval: true },
  { id: 'noiseReduction', type: 'bool', title: 'Enable Noise Reduction', defval: true },
  { id: 'wnMin', type: 'int', title: 'NoiseR Min Length', defval: 1 },
  { id: 'wnMax', type: 'int', title: 'NoiseR Max Length', defval: 2 },
  { id: 'enableAI', type: 'bool', title: 'Enable Binary Classifier', defval: true },
  { id: 'adaptivePeriod', type: 'int', title: 'Adaptive Normalization Period', defval: 50 },
  { id: 'adaptationRate', type: 'float', title: 'Learning Rate', defval: 0.08, step: 0.01, max: 0.15 },
  { id: 'momentumPeriod', type: 'int', title: 'Momentum Detector Length', defval: 29 },
  { id: 'volatilityPeriod', type: 'int', title: 'Volatility Detector Length', defval: 45 },
  { id: 'trendStrengthPeriod', type: 'int', title: 'Trend Strength Length', defval: 35 },
  { id: 'oscillationPeriod', type: 'int', title: 'Oscillation Detector Length', defval: 35 },
  { id: 'velocityPeriod', type: 'int', title: 'Price Velocity Length', defval: 30 },
  { id: 'resistanceFactor', type: 'float', title: 'Dynamic Resistance Factor', defval: 3.2, step: 0.1 },
  { id: 'resistancePeriod', type: 'int', title: 'Resistance Detection Period', defval: 2, step: 1 },
  { id: 'upperCol', type: 'color', title: 'Up Color', defval: '#00b35f' },
  { id: 'lowerCol', type: 'color', title: 'Down Color', defval: '#cf1059' },
  { id: 'showHLines', type: 'bool', title: 'Show Horizontal Reference Lines', defval: true },
  { id: 'hlineColor', type: 'color', title: 'Reference Line Color', defval: String(color.new(color.gray, 70)) },
  { id: 'hlineStyle', type: 'string', title: 'Reference Line Style', defval: 'Dashed', options: ['Solid', 'Dashed', 'Dotted'] },
];

const LEVELS: [string, number, number][] = [
  ['Upper Extreme', 1.0, 1], ['Strong Bullish', 0.75, 1], ['Bullish Zone', 0.5, 1], ['Weak Bullish', 0.25, 1],
  ['Zero Line', 0, 2], ['Weak Bearish', -0.25, 1], ['Bearish Zone', -0.5, 1], ['Strong Bearish', -0.75, 1],
  ['Lower Extreme', -1.0, 1],
];

export const plotConfig: PlotConfig[] = [
  ...LEVELS.map(([title, , width], k) => ({ id: `plot${k}`, title, color: '#787B864D', lineWidth: width })),
  { id: 'plot9', title: 'Signal', color: '#00b35f', lineWidth: 1 },
  { id: 'plot10', title: 'Zero Line', color: '#00b35f', lineWidth: 2 },
];

export const metadata = {
  title: 'Trend Filter with Pattern Recognition',
  shortTitle: 'Wavelet-Trend ML',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<WaveletTrendMLIntegrationInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const nz = (v: number) => (isNaN(v) ? 0 : v);
  const atr = A(ta.atr(bars, cfg.atrLength));

  // highPassFilter(src, len): hp := (1 - alpha / 2) * (src - src[1]) + (1 - alpha) * nz(hp[1]); ta.ema(hp, 3)
  const pi = 3.14159265359;
  const highPass = (len: number) => {
    const alpha = (1 - Math.sin((2 * pi) / len)) / Math.cos((2 * pi) / len);
    const hp: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      hp[i] = (1 - alpha / 2) * (close[i] - (i > 0 ? close[i - 1] : NaN)) + (1 - alpha) * nz(i > 0 ? hp[i - 1] : NaN);
    }
    return A(ta.ema(S(hp), 3));
  };
  const fastC = cfg.useWavelet ? highPass(cfg.shortLength) : A(ta.ema(S(close), cfg.shortLength));
  const slowC = cfg.useWavelet ? highPass(cfg.longLength) : A(ta.ema(S(close), cfg.longLength));
  const scaleRatio = cfg.longLength / cfg.shortLength;
  const rawSignal = fastC.map((f, i) => (f - slowC[i]) * scaleRatio);
  // wn(src): noiseReduction ? (ema(src, wnMin) + ema(src, wnMax)) / 2 : src
  const emaMin = A(ta.ema(S(rawSignal), cfg.wnMin));
  const emaMax = A(ta.ema(S(rawSignal), cfg.wnMax));
  const smoothed = cfg.noiseReduction ? emaMin.map((v, i) => (v + emaMax[i]) / 2) : rawSignal;
  // math.max(na, x) is na
  const atrAdj = smoothed.map((v, i) => v / (isNaN(atr[i]) ? NaN : Math.max(atr[i] * scaleRatio, 0.001)));
  const absMax = A(ta.highest(S(atrAdj.map(Math.abs)), cfg.lookback));
  const filterNorm = atrAdj.map((v, i) => Math.min(Math.max(v / (isNaN(absMax[i]) ? NaN : Math.max(absMax[i], 0.001)), -1), 1));

  // Binary classifier features
  const mean = A(ta.sma(S(close), cfg.adaptivePeriod));
  const dev = A(ta.stdev(S(close), cfg.adaptivePeriod));
  const rsi = A(ta.rsi(S(close), cfg.momentumPeriod));
  const cci = A(ta.cci(S(bars.map((b) => (b.high + b.low + b.close) / 3)), cfg.volatilityPeriod));
  const [diPlusS, diMinusS] = ta.dmi(bars, cfg.trendStrengthPeriod, 10);
  const diPlus = A(diPlusS);
  const diMinus = A(diMinusS);
  const hb = A(ta.highestbars(new Series(bars, (b) => b.high), cfg.oscillationPeriod));
  const lb = A(ta.lowestbars(new Series(bars, (b) => b.low), cfg.oscillationPeriod));
  const velFast = A(ta.ema(S(close), cfg.velocityPeriod));
  const velSlow = A(ta.ema(S(close), cfg.velocityPeriod - 10));
  const [, stDirS] = ta.supertrend(bars, cfg.resistanceFactor, cfg.resistancePeriod);
  const stDir = A(stDirS);

  const base = [1, 4, 1, 2, 5, 4]; // alpha_momentum, beta_volatility, gamma_trend, delta_oscillation, epsilon_velocity, zeta_resistance
  const adj = [0, 0, 0, 0, 0, 0]; // var learning adjustments
  const bias = 1.0;
  const rawFinal: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // market_direction = standardize_data(close) > 0 ? 1 : 0
    const std = (close[i] - mean[i]) / (isNaN(dev[i]) ? NaN : Math.max(dev[i], 0.0001));
    const target = std > 0 ? 1 : 0;
    let fVol = 0.5;
    if (i > 0 && cci[i] > 100 && cci[i - 1] <= 100) fVol = 1;
    if (i > 0 && cci[i] < -100 && cci[i - 1] >= -100) fVol = 0;
    const osUp = ((cfg.oscillationPeriod + hb[i]) / cfg.oscillationPeriod) * 100;
    const osDn = ((cfg.oscillationPeriod + lb[i]) / cfg.oscillationPeriod) * 100;
    const f = [rsi[i] > 50 ? 1 : 0, fVol, diPlus[i] > diMinus[i] ? 1 : 0, osUp > osDn ? 1 : 0,
      velFast[i] > velSlow[i] ? 1 : 0, stDir[i] === -1 ? 1 : 0];
    let ai = 0.0;
    if (cfg.enableAI) {
      // the weights used for both predictions are the ones before this bar's update
      const w = base.map((b, k) => b + adj[k]);
      const input = bias + w.reduce((s, wk, k) => s + wk * f[k], 0);
      const prediction = 1 / (1 + Math.exp(-input));
      const gradient = prediction - target;
      for (let k = 0; k < 6; k++) adj[k] -= cfg.adaptationRate * gradient * f[k];
      ai = (prediction - 0.5) * 2;
    }
    if (cfg.useWavelet && cfg.enableAI) rawFinal[i] = (filterNorm[i] + ai) / 2;
    else if (cfg.useWavelet) rawFinal[i] = filterNorm[i];
    else if (cfg.enableAI) rawFinal[i] = ai;
    else rawFinal[i] = NaN; // replaced below by ta.mom(close, 14) / close
  }
  if (!cfg.useWavelet && !cfg.enableAI) {
    const mom = A(ta.mom(S(close), 14));
    for (let i = 0; i < n; i++) rawFinal[i] = mom[i] / close[i];
  }

  const smoothedFinal = A(ta.ema(S(rawFinal), cfg.smoothing));
  const recentVol = A(ta.stdev(S(smoothedFinal), cfg.lookback));
  const longVol = A(ta.stdev(S(smoothedFinal), cfg.lookback * 2));
  const finalSignal = smoothedFinal.map((v, i) => {
    const scale = recentVol[i] / (isNaN(longVol[i]) ? NaN : Math.max(longVol[i], 0.0001));
    return Math.min(Math.max(v * scale, -2), 2);
  });

  const plots: Record<string, { time: number; value: number; color: string }[]> = {};
  for (let k = 0; k <= 10; k++) plots[`plot${k}`] = [];
  const candles: PlotCandleData[] = [];
  const markers: MarkerData[] = [];
  const fillColors: (string | null)[] = [];
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  const zeroLineColor = String(color.new(cfg.hlineColor, 30));
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // lineCondition: Dashed -> bar_index % 4 <= 1; Dotted -> bar_index % 2 == 0; Solid -> true
    const cond = cfg.hlineStyle === 'Dashed' ? i % 4 <= 1 : cfg.hlineStyle === 'Dotted' ? i % 2 === 0 : true;
    const refCol = cfg.showHLines && cond ? cfg.hlineColor : 'transparent';
    const zeroCol = cfg.showHLines && cond ? zeroLineColor : 'transparent';
    LEVELS.forEach(([, level], k) => {
      plots[`plot${k}`].push({ time: t, value: cfg.showHLines ? level : NaN, color: level === 0 ? zeroCol : refCol });
    });
    const trend = finalSignal[i] >= 0 ? cfg.upperCol : cfg.lowerCol;
    plots.plot9.push({ time: t, value: finalSignal[i], color: trend });
    plots.plot10.push({ time: t, value: 0, color: trend });
    candles.push({ time: t, open: bars[i].open, high: bars[i].high, low: bars[i].low, close: bars[i].close,
      color: trend, wickColor: trend, borderColor: trend, forceOverlay: true });
    fillColors.push(String(color.new(trend, 70)));
    // plotshape(finalSignal > 0 and finalSignal[1] <= 0, labelup, belowbar, text "︿") and the bearish label
    const prev = i > 0 ? finalSignal[i - 1] : NaN;
    // alertcondition(finalSignal > 0 and finalSignal[1] <= 0) / alertcondition(finalSignal < 0 and finalSignal[1] >= 0)
    bullFlags.push(finalSignal[i] > 0 && prev <= 0);
    bearFlags.push(finalSignal[i] < 0 && prev >= 0);
    if (finalSignal[i] > 0 && prev <= 0) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: cfg.upperCol, text: '︿', textColor: color.white,
        size: 'tiny', forceOverlay: true });
    }
    if (finalSignal[i] < 0 && prev >= 0) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: cfg.lowerCol, text: '﹀', textColor: color.white,
        size: 'tiny', forceOverlay: true });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    // fill(p1, p2, finalSignal, 0, na, color.new(trend_col, 70))
    fills: [{
      plot1: 'plot9', plot2: 'plot10',
      gradient: { topValue: finalSignal, bottomValue: new Array(n).fill(0), topColor: new Array(n).fill(null), bottomColor: fillColors },
    }],
    markers,
    plotCandles: { signalCandles: candles },
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Signal', message: 'Bullish Signal Detected' },
  { id: 'alert1', title: 'Bearish Signal', message: 'Bearish Signal Detected' },
];

export const WaveletTrendMLIntegration = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
