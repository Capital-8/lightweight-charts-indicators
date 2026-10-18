/**
 * AI Adaptive Oscillator
 *
 * An ensemble of five normalised oscillators: (RSI - 50) / 50, CCI / 200, (Stochastic %K - 50) / 50,
 * (MACD(len/2, len) - signal) / ATR and the volume weighted momentum change(close, len) * volume / SMA(volume, len)
 * divided by its standard deviation. Each oscillator gets a score: the share of the last `lookback` bars where its
 * sign on the bar before matched the sign of the close change. The scores (of the first `ensembleSize` oscillators)
 * weight the oscillators; the sum is smoothed with an alpha = adaptiveSpeed * ATR / SMA(ATR, 5 * len) clamped to
 * 0.1..0.9 and scaled by 6. Thresholds are 0.8 times the highest / lowest value over `lookback` bars (capped to
 * +-6). Bullish / bearish labels mark local bottoms below the lower threshold / tops above the upper one, with a
 * cooldown and a minimum change from the previous signal; the label text gives a confidence level from the scores,
 * the agreement of the oscillators and the signal strength. Gradient fills colour the 3..6 and -3..-6 zones and the
 * area between the oscillator and zero.
 *
 * Alerts (alertcondition, `alerts` of the result): the oscillator crossing zero (either way) and the bullish /
 * bearish signals.
 *
 * Reference: "AI Adaptive Oscillator [PhenLabs]" by PhenLabs
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © PhenLabs
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AiAdaptiveOscillatorInputs {
  bullishColor: string;
  bearishColor: string;
  /** Minimum number of bars between two signals of the same side */
  signalCooldownBars: number;
  /** Minimum change of the oscillator from the previous signal of the same side */
  signalMinChange: number;
  /** Length of the oscillators */
  baseLength: number;
  /** Adaptive speed of the smoothing */
  adaptiveSpeed: number;
  /** Lookback of the scores and of the thresholds */
  lookbackPeriod: number;
  /** Number of oscillators used (2..5) */
  ensembleSize: number;
}

export const defaultInputs: AiAdaptiveOscillatorInputs = {
  bullishColor: '#2b62fa',
  bearishColor: '#ce9851',
  signalCooldownBars: 10,
  signalMinChange: 1.5,
  baseLength: 14,
  adaptiveSpeed: 0.1,
  lookbackPeriod: 150,
  ensembleSize: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#2b62fa', group: 'Colors' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#ce9851', group: 'Colors' },
  { id: 'signalCooldownBars', type: 'int', title: 'Signal Cooldown (bars)', defval: 10, min: 1, max: 50, group: 'Signal Settings' },
  { id: 'signalMinChange', type: 'float', title: 'Min Change For New Signal', defval: 1.5, min: 0.5, max: 3.0, step: 0.1, group: 'Signal Settings' },
  { id: 'baseLength', type: 'int', title: 'Base Length', defval: 14, min: 2, group: 'AI Core' },
  { id: 'adaptiveSpeed', type: 'float', title: 'Adaptive Speed', defval: 0.1, min: 0.01, max: 0.3, step: 0.01, group: 'AI Core' },
  { id: 'lookbackPeriod', type: 'int', title: 'Learning Lookback Period', defval: 150, min: 10, group: 'AI Core' },
  { id: 'ensembleSize', type: 'int', title: 'Ensemble Size', defval: 5, min: 2, max: 5, group: 'AI Core' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Range Fill Level', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Lower Range Fill Level', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Zero Fill Level', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'AI Oscillator', color: '#2b62fa', lineWidth: 2 },
  { id: 'plot4', title: 'zero Line', color: String(color.new(color.gray, 100)), lineWidth: 1 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 6, title: 'Upper Range', color: String(color.new(color.gray, 70)), linestyle: 'dotted' },
  { id: 'hline_lower', price: -6, title: 'Lower Range', color: String(color.new(color.gray, 70)), linestyle: 'dotted' },
  { id: 'hline_zero', price: 0, title: 'Zero Line', color: String(color.new(color.gray, 50)), linestyle: 'dashed' },
];

export const metadata = {
  title: 'AI Adaptive Oscillator [PhenLabs]',
  shortTitle: 'PhenLabs - AIAO',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<AiAdaptiveOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.baseLength;
  const lookback = cfg.lookbackPeriod;
  const ens = cfg.ensembleSize;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const closeArr = bars.map((b) => b.close);
  const close = S(closeArr);
  const high = S(bars.map((b) => b.high));
  const low = S(bars.map((b) => b.low));
  const volume = bars.map((b) => b.volume ?? NaN);

  // Ensemble components (plain divisions: x / 0 is +-infinity, 0 / 0 na, as in Pine)
  const rsiOsc = A(ta.rsi(close, len)).map((v) => (v - 50) / 50);
  const cciOsc = A(ta.cci(close, len)).map((v) => v / 200);
  const stochOsc = A(ta.stoch(close, high, low, len)).map((v) => (v - 50) / 50);
  const fastLength = Math.round(len * 0.5);
  const emaFast = A(ta.ema(close, fastLength));
  const emaSlow = A(ta.ema(close, len));
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const macdSignal = A(ta.ema(S(macdLine), Math.round(len * 0.3)));
  const atr = A(ta.atr(bars, len));
  const macdOsc = macdLine.map((v, i) => (v - macdSignal[i]) / atr[i]);
  const change = A(ta.change(close, len));
  const volSma = A(ta.sma(S(volume), len));
  const volumeMomentum = change.map((v, i) => (v * volume[i]) / volSma[i]);
  const vmStdev = A(ta.stdev(S(volumeMomentum), len));
  const volumeOsc = volumeMomentum.map((v, i) => v / vmStdev[i]);

  // getPerformanceScore(signal, length): share of the last `length` bars k where signal[k - 1] > 0 and
  // close[k] - close[k - 1] > 0, or both < 0 (a running count of the hits)
  const score = (sig: number[]): number[] => {
    const hit = new Array<number>(n).fill(0);
    for (let k = 1; k < n; k++) {
      const pc = closeArr[k] - closeArr[k - 1];
      const sp = sig[k - 1];
      hit[k] = (gt(sp, 0) && gt(pc, 0)) || (lt(sp, 0) && lt(pc, 0)) ? 1 : 0;
    }
    const out = new Array<number>(n);
    let correct = 0;
    for (let j = 0; j < n; j++) {
      correct += hit[j];
      if (j - lookback >= 0) correct -= hit[j - lookback];
      out[j] = correct / lookback;
    }
    return out;
  };
  const oscs = [rsiOsc, cciOsc, stochOsc, macdOsc, volumeOsc];
  const scores = oscs.map(score);
  // array.push: RSI, CCI, Stochastic always; MACD when ensembleSize >= 4; volume when ensembleSize >= 5
  const size = 3 + (ens >= 4 ? 1 : 0) + (ens >= 5 ? 1 : 0);
  const used = Math.min(ens, size);

  // volatility = ta.atr(len) / ta.sma(ta.atr(len), len * 5)
  const atrSma = A(ta.sma(S(atr), len * 5));
  const vf: number[] = new Array(n);
  let prevAi = NaN; // aiOscillator[1]
  for (let i = 0; i < n; i++) {
    let totalScore = 0;
    for (let k = 0; k < size; k++) totalScore += scores[k][i];
    totalScore = Math.max(totalScore, 0.001);
    let ai = 0.0;
    for (let k = 0; k < used; k++) ai = ai + oscs[k][i] * (scores[k][i] / totalScore);
    const volatility = atr[i] / atrSma[i];
    const alpha = Math.min(0.9, Math.max(0.1, cfg.adaptiveSpeed * volatility));
    // nz(aiOscillator[1]): na and +-infinity give 0
    ai = ai * alpha + (Number.isFinite(prevAi) ? prevAi : 0) * (1 - alpha);
    prevAi = ai;
    vf[i] = ai * 6;
  }

  const highestVf = A(ta.highest(S(vf), lookback));
  const lowestVf = A(ta.lowest(S(vf), lookback));
  const upperThreshold = highestVf.map((v) => Math.min(6, v * 0.8));
  const lowerThreshold = lowestVf.map((v) => Math.max(-6, v * 0.8));

  // Signals
  const markers: MarkerData[] = [];
  const white = color.white;
  let lastBullishLevel = NaN;
  let lastBearishLevel = NaN;
  let barsSinceLastBullish = 999;
  let barsSinceLastBearish = 999;
  const confidence = (isSignal: boolean, bullish: boolean, i: number, scoreAvg: number): number => {
    if (!isSignal) return 0;
    let agreement = 0.0;
    for (let k = 0; k < used; k++) {
      if ((bullish && gt(oscs[k][i], 0)) || (!bullish && lt(oscs[k][i], 0))) agreement = agreement + 1;
    }
    const agreementScore = agreement / ens;
    let strength = bullish ? Math.abs(vf[i] / lowerThreshold[i]) : Math.abs(vf[i] / upperThreshold[i]);
    strength = Math.min(strength, 1.5);
    const conf = scoreAvg * 0.5 + agreementScore * 0.3 + strength * 0.2;
    return ge(conf, 0.8) ? 3 : ge(conf, 0.6) ? 2 : 1;
  };
  const texts = ['', ' ', '+', '++'];
  // plotshape ids by confidence (3: High, 2: Medium, 1: Average)
  const bullIds = ['', 'shape2', 'shape1', 'shape0'];
  const bearIds = ['', 'shape5', 'shape4', 'shape3'];
  const bullFlags: boolean[] = new Array(n).fill(false);
  const bearFlags: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    barsSinceLastBullish = barsSinceLastBullish + 1;
    barsSinceLastBearish = barsSinceLastBearish + 1;
    const v = vf[i];
    const v1 = i >= 1 ? vf[i - 1] : NaN;
    const v2 = i >= 2 ? vf[i - 2] : NaN;
    const bullishPattern = lt(v, lowerThreshold[i]) && gt(v, v1) && lt(v1, v2);
    const bearishPattern = gt(v, upperThreshold[i]) && lt(v, v1) && gt(v1, v2);
    const bullishSignal = bullishPattern && barsSinceLastBullish >= cfg.signalCooldownBars
      && (isNaN(lastBullishLevel) || ge(Math.abs(v - lastBullishLevel), cfg.signalMinChange));
    const bearishSignal = bearishPattern && barsSinceLastBearish >= cfg.signalCooldownBars
      && (isNaN(lastBearishLevel) || ge(Math.abs(v - lastBearishLevel), cfg.signalMinChange));
    bullFlags[i] = bullishSignal;
    bearFlags[i] = bearishSignal;
    if (bullishSignal) {
      lastBullishLevel = v;
      barsSinceLastBullish = 0;
    }
    if (bearishSignal) {
      lastBearishLevel = v;
      barsSinceLastBearish = 0;
    }
    const avgScore = (scores[0][i] + scores[1][i] + scores[2][i] + (ens >= 4 ? scores[3][i] : 0)
      + (ens >= 5 ? scores[4][i] : 0)) / ens;
    const bullC = confidence(bullishSignal, true, i, avgScore);
    const bearC = confidence(bearishSignal, false, i, avgScore);
    // plotshape(bullishSignal and bullishConfidence == k ? vf : na, shape.labelup, location.absolute, size.small)
    if (bullishSignal && !isNaN(v)) {
      markers.push({ id: bullIds[bullC], time: bars[i].time, position: 'atPriceBottom', price: v, shape: 'labelUp',
        color: cfg.bullishColor, text: texts[bullC], textColor: white, size: 'small' });
    }
    // plotshape(bearishSignal and bearishConfidence == k ? vf : na, shape.labeldown, location.absolute, size.small)
    if (bearishSignal && !isNaN(v)) {
      markers.push({ id: bearIds[bearC], time: bars[i].time, position: 'atPriceTop', price: v, shape: 'labelDown',
        color: cfg.bearishColor, text: texts[bearC], textColor: white, size: 'small' });
    }
  }

  // Fills
  const full = (x: number) => new Array<number>(n).fill(x);
  const nulls = () => new Array<string | null>(n).fill(null);
  const bear95 = String(color.new(cfg.bearishColor, 95));
  const bear30 = String(color.new(cfg.bearishColor, 30));
  const bull95 = String(color.new(cfg.bullishColor, 95));
  const bull30 = String(color.new(cfg.bullishColor, 30));
  const bull85 = String(color.new(cfg.bullishColor, 85));
  const bear85 = String(color.new(cfg.bearishColor, 85));
  const pos = vf.map((v) => gt(v, 0));
  const neg = vf.map((v) => lt(v, 0));
  const t = (i: number) => bars[i].time;

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      // f = plot(6, display = display.none), negf = plot(-6, ...), z = plot(0, ...)
      plot0: bars.map((b) => ({ time: b.time, value: 6 })),
      plot1: bars.map((b) => ({ time: b.time, value: -6 })),
      plot2: bars.map((b) => ({ time: b.time, value: 0 })),
      // plot(vf, color = vf > 0 ? bullishColor : bearishColor, linewidth = 2)
      plot3: vf.map((v, i) => ({ time: t(i), value: Number.isFinite(v) ? v : NaN, color: pos[i] ? cfg.bullishColor : cfg.bearishColor })),
      // p1 = plot(level, 'zero Line', color.new(color.gray, 100))
      plot4: bars.map((b) => ({ time: b.time, value: 0, color: String(color.new(color.gray, 100)) })),
    },
    hlines: [
      { value: 6, options: { title: 'Upper Range', color: String(color.new(color.gray, 70)), linestyle: 'dotted' } },
      { value: -6, options: { title: 'Lower Range', color: String(color.new(color.gray, 70)), linestyle: 'dotted' } },
      { value: 0, options: { title: 'Zero Line', color: String(color.new(color.gray, 50)), linestyle: 'dashed' } },
    ],
    fills: [
      // fill(z, f, top_value = 6, bottom_value = 3, bottom_color = na,
      //      top_color = color.from_gradient(vf, -6, 6, color.new(bearishColor, 95), color.new(bearishColor, 30)))
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'Upper Zone' },
        gradient: { topValue: full(6), bottomValue: full(3),
          topColor: vf.map((v) => String(color.from_gradient(v, -6, 6, bear95, bear30))), bottomColor: nulls() } },
      // fill(z, negf, top_value = -3, bottom_value = -6, top_color = na,
      //      bottom_color = color.from_gradient(-vf, -6, 6, color.new(bullishColor, 95), color.new(bullishColor, 30)))
      { plot1: 'plot2', plot2: 'plot1', options: { title: 'Lower Zone' },
        gradient: { topValue: full(-3), bottomValue: full(-6), topColor: nulls(),
          bottomColor: vf.map((v) => String(color.from_gradient(-v, -6, 6, bull95, bull30))) } },
      // fill(p1, v1, level, vf, vf > 0 ? color.new(bullishColor, 85) : na, vf > 0 ? bullishColor : na)
      { plot1: 'plot4', plot2: 'plot3', options: { title: 'Bullish Area' },
        gradient: { topValue: full(0), bottomValue: vf.slice(),
          topColor: pos.map((p) => (p ? bull85 : null)), bottomColor: pos.map((p) => (p ? cfg.bullishColor : null)) } },
      // fill(p1, v1, vf, -level, vf < 0 ? bearishColor : na, vf < 0 ? color.new(bearishColor, 85) : na)
      { plot1: 'plot4', plot2: 'plot3', options: { title: 'Bearish Area' },
        gradient: { topValue: vf.slice(), bottomValue: full(0),
          topColor: neg.map((p) => (p ? cfg.bearishColor : null)), bottomColor: neg.map((p) => (p ? bear85 : null)) } },
    ],
    markers,
    // alertcondition(ta.cross(vf, 0)) / (bullishSignal) / (bearishSignal)
    alerts: (() => {
      const up = crossedOver(vf, 0), down = crossedUnder(vf, 0);
      return alertStates(alertConditions, bars, [up.map((u, i) => u || down[i]), bullFlags, bearFlags]);
    })(),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'AI Oscillator Zero Line Cross', message: 'AI Oscillator crossed the zero line' },
  { id: 'alert1', title: 'AI Oscillator Bullish Signal', message: 'AI Oscillator shows potential bullish move' },
  { id: 'alert2', title: 'AI Oscillator Bearish Signal', message: 'AI Oscillator shows potential bearish move' },
];

export const AiAdaptiveOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
