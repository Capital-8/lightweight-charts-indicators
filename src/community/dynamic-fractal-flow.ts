/**
 * Dynamic Fractal Flow
 *
 * Tracks the last up fractal (a high that is the highest of the `2 * floor(fractalLength / 2) + 1` bars centred on
 * it) and the last down fractal, and the close position between them (0 = last down fractal, 1 = last up fractal;
 * 0 until both exist). The position is smoothed by a WMA (omega length) and 1 to 5 cascading EMAs (robustness
 * steps), clamped to 0..1 and scaled to -5..5. A noise filter damps the signal when the market is choppy
 * (choppiness index >= 50 or efficiency ratio <= noise threshold): the signal is multiplied by
 * max(0.2, efficiency ratio / noise threshold). Bollinger bands of the signal, a gradient line and fill to zero,
 * and a background coloured by the trend state (signal against the threshold and the EMA of its change).
 *
 * Alerts (alertcondition, `alerts` of the result): "DFF Bullish Signal" / "DFF Bearish Signal" (acceleration, band
 * entry or threshold cross of the signal) and "DFF Bullish Acceleration" / "DFF Bearish Acceleration" (EMA of the
 * change of the momentum and of its change both of one sign against the signal), outside band squeezes.
 *
 * Reference: "Dynamic Fractal Flow [Alpha Extract]" by AlphaExtract
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © YourName - Dynamic Fractal Flow
 */

import {
  ta, taCore, math, callsite, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DynamicFractalFlowInputs {
  /** Fractal length: the fractal window is 2 * floor(fractalLength / 2) + 1 bars */
  fractalLength: number;
  /** WMA length of the fractal position */
  omegaLength: number;
  /** Number of cascading EMAs (1 to 5) */
  robustnessSteps: number;
  showBands: boolean;
  /** Standard deviation multiplier of the bands */
  sdMultiplier: number;
  /** Length of the bands */
  bandLength: number;
  /** No effect on the outputs (the Pine script does not use it) */
  showSignals: boolean;
  showGradient: boolean;
  /** No effect on the outputs (the Pine script has no dashboard code) */
  showDashboard: boolean;
  showRawSignal: boolean;
  signalThreshold: number;
  useNoiseFilter: boolean;
  noiseThreshold: number;
  /** Acceleration signals of the alert conditions: no effect on the plots */
  useAcceleration: boolean;
}

export const defaultInputs: DynamicFractalFlowInputs = {
  fractalLength: 5,
  omegaLength: 21,
  robustnessSteps: 1,
  showBands: true,
  sdMultiplier: 0.5,
  bandLength: 20,
  showSignals: true,
  showGradient: true,
  showDashboard: true,
  showRawSignal: false,
  signalThreshold: 0.3,
  useNoiseFilter: true,
  noiseThreshold: 1,
  useAcceleration: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'fractalLength', type: 'int', title: 'Fractal Length', defval: 5, min: 5, max: 100, group: 'Core Settings' },
  { id: 'omegaLength', type: 'int', title: 'Omega Weighting Period', defval: 21, min: 10, max: 100, group: 'Core Settings' },
  { id: 'robustnessSteps', type: 'int', title: 'Robustness Steps', defval: 1, min: 1, max: 5, group: 'Core Settings' },
  { id: 'showBands', type: 'bool', title: 'Show SD Bands', defval: true, group: 'Bands' },
  { id: 'sdMultiplier', type: 'float', title: 'SD Multiplier', defval: 0.5, min: 0.5, max: 5.0, step: 0.5, group: 'Bands' },
  { id: 'bandLength', type: 'int', title: 'Band Length', defval: 20, min: 20, max: 200, group: 'Bands' },
  { id: 'showSignals', type: 'bool', title: 'Show Entry Signals', defval: true, group: 'Visual' },
  { id: 'showGradient', type: 'bool', title: 'Show Gradient Fill', defval: true, group: 'Visual' },
  { id: 'showDashboard', type: 'bool', title: 'Show Dashboard', defval: true, group: 'Visual' },
  { id: 'showRawSignal', type: 'bool', title: 'Show Raw Signal (Before Filter)', defval: false, group: 'Visual' },
  { id: 'signalThreshold', type: 'float', title: 'Signal Threshold', defval: 0.3, min: 0.1, max: 1.0, step: 0.1, group: 'Signals' },
  { id: 'useNoiseFilter', type: 'bool', title: 'Use Noise Filter', defval: true, group: 'Advanced Filters' },
  { id: 'noiseThreshold', type: 'float', title: 'Noise Threshold', defval: 1, min: 0.1, max: 1.0, step: 0.1, group: 'Advanced Filters' },
  { id: 'useAcceleration', type: 'bool', title: 'Use Acceleration Signals', defval: true, group: 'Advanced Filters' },
];

const BULL = '#00ff88';
const BEAR = '#ff0066';
const NEUTRAL = '#888888';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'DFF Signal', color: NEUTRAL, lineWidth: 3 },
  { id: 'plot1', title: 'Raw Signal', color: String(color.new(color.gray, 30)), lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'Zero', color: String(color.new(color.gray, 50)), lineWidth: 1 },
  { id: 'plot3', title: 'Upper Threshold', color: String(color.new(BULL, 70)), lineWidth: 1, style: 'circles' },
  { id: 'plot4', title: 'Lower Threshold', color: String(color.new(BEAR, 70)), lineWidth: 1, style: 'circles' },
  { id: 'plot5', title: 'Upper Band', color: String(color.new(color.blue, 70)), lineWidth: 1 },
  { id: 'plot6', title: 'Lower Band', color: String(color.new(color.blue, 70)), lineWidth: 1 },
  { id: 'plot7', title: 'Mid Band', color: String(color.new(color.gray, 80)), lineWidth: 1, style: 'cross' },
];

export const metadata = {
  title: 'Dynamic Fractal Flow [Alpha Extract]',
  shortTitle: 'Dynamic Fractal Flow [Alpha Extract]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10; a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicFractalFlowInputs> = {},
): IndicatorResult & { bgColors: BgColorData[]; alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);

  // Fractals: high[len] == ta.highest(high, len * 2 + 1), len = floor(fractalLength / 2)
  const fl = Math.floor(cfg.fractalLength / 2);
  const fhh = A(ta.highest(S(high), fl * 2 + 1));
  const fll = A(ta.lowest(S(low), fl * 2 + 1));
  const fractalPosition: number[] = new Array(n);
  let lastUp = NaN; // var float lastUpFractal = na
  let lastDown = NaN; // var float lastDownFractal = na
  for (let i = 0; i < n; i++) {
    const hLen = i - fl >= 0 ? high[i - fl] : NaN;
    const lLen = i - fl >= 0 ? low[i - fl] : NaN;
    if (eq(hLen, fhh[i])) lastUp = hLen;
    if (eq(lLen, fll[i])) lastDown = lLen;
    // fractalRange = lastUpFractal - lastDownFractal (the ATR fallback is only used when the position is 0)
    if (isNaN(lastUp) || isNaN(lastDown)) {
      fractalPosition[i] = 0.0;
    } else {
      const fractalRange = lastUp - lastDown;
      fractalPosition[i] = gt(fractalRange, 0) ? (close[i] - lastDown) / fractalRange : 0.0;
    }
  }
  // The volatility / volume omega weighting of the Pine script (omegaDynamic) is not used by any output.

  const weightedFractal = A(ta.wma(S(fractalPosition), cfg.omegaLength));

  // Cascading EMA smoothing (robustness steps); smoothMultiplier = 1.0
  const steps = [1.5, 2.0, 2.5, 3.0, 3.5];
  let robustSignal = weightedFractal;
  for (let k = 0; k < steps.length; k++) {
    if (cfg.robustnessSteps >= k + 1) {
      robustSignal = A(ta.ema(S(robustSignal), Math.round(cfg.fractalLength * steps[k])));
    }
  }

  // robustSignalBase = (math.min(math.max(robustSignal, 0), 1) - 0.5) * 10 (na stays na)
  const base = robustSignal.map((v) => (isNaN(v) ? NaN : (Math.min(Math.max(v, 0), 1) - 0.5) * 10));
  // momentumSmooth = ta.ema(ta.change(robustSignalBase, 1), 5)
  const change = base.map((v, i) => (i > 0 ? v - base[i - 1] : NaN));
  const momentumSmooth = A(ta.ema(S(change), Math.trunc(Math.max(3, Math.round(5 * 1.0)))));

  // Noise filter
  const len = cfg.fractalLength;
  const hh = A(ta.highest(S(high), len));
  const ll = A(ta.lowest(S(low), len));
  const hhll = hh.map((v, i) => v - ll[i]);
  // choppiness = hhll != 0 ? 100 * math.log10(math.sum(ta.atr(1), len) / hhll) / math.log10(len) : 0
  // math.sum(ta.atr(1), len) only runs on the bars where hhll != 0 (na compares false): its history is those bars.
  // ta.atr(1) = the true range of the bar (rma of length 1).
  const choppyCalled = hhll.map((v) => !isNaN(v) && !eq(v, 0));
  const atr1 = A(ta.atr(bars, 1));
  const atrSum = callsite.whenCalled(choppyCalled, (x) => math.sum(x, len) as number[], atr1) as number[];
  const choppiness = hhll.map((v, i) => (choppyCalled[i] ? (100 * Math.log10(atrSum[i] / v)) / Math.log10(len) : 0));
  // efficiencyRatio = nz(math.abs(close - close[len]) / math.sum(math.abs(ta.change(close)), len), 0)
  const absChange = close.map((c, i) => (i > 0 ? Math.abs(c - close[i - 1]) : NaN));
  const changeSum = math.sum(absChange, len) as number[];
  const efficiencyRatio = close.map((c, i) => {
    const er = (i - len >= 0 ? Math.abs(c - close[i - len]) : NaN) / changeSum[i];
    return Number.isFinite(er) ? er : 0;
  });

  const rsn: number[] = new Array(n); // robustSignalNorm
  const trending: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const isTrending = cfg.useNoiseFilter
      ? lt(choppiness[i], 50) && gt(efficiencyRatio[i], cfg.noiseThreshold)
      : true;
    trending[i] = isTrending;
    const damping = cfg.useNoiseFilter
      ? (isTrending ? 1.0 : Math.max(0.2, efficiencyRatio[i] / cfg.noiseThreshold))
      : 1.0;
    rsn[i] = base[i] * damping;
  }

  // [midBand, upperBand, lowerBand] = ta.bb(robustSignalNorm, bandLength, sdMultiplier)
  const [midBand, upperBand, lowerBand] = taCore.bb(rsn, cfg.bandLength, cfg.sdMultiplier);

  // Signals of the alert conditions
  // accelerationSmooth = ta.ema(ta.change(momentumSmooth), 3); jerkSmooth = ta.ema(ta.change(accelerationSmooth), 3)
  const diff = (a: number[]) => a.map((v, i) => (i > 0 ? v - a[i - 1] : NaN));
  const acceleration = A(ta.ema(S(diff(momentumSmooth)), 3));
  const jerk = A(ta.ema(S(diff(acceleration)), 3));
  // isSqueeze = (upperBand - lowerBand) < ta.sma(upperBand - lowerBand, 50) * 0.8
  const width = upperBand.map((u, i) => u - lowerBand[i]);
  const widthSma = A(ta.sma(S(width), 50));
  const squeeze = width.map((w, i) => lt(w, widthSma[i] * 0.8));
  const thrUp = crossedOver(rsn, cfg.signalThreshold);
  const thrDown = crossedUnder(rsn, -cfg.signalThreshold);
  const bandUp = crossedOver(rsn, lowerBand);
  const bandDown = crossedUnder(rsn, upperBand);
  const accelBull: boolean[] = new Array(n);
  const accelBear: boolean[] = new Array(n);
  const anyBull: boolean[] = new Array(n);
  const anyBear: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = rsn[i];
    const m = momentumSmooth[i];
    const bullishAcceleration = cfg.useAcceleration && gt(acceleration[i], 0) && gt(jerk[i], 0) && lt(v, 0) && gt(m, 0);
    const bearishAcceleration = cfg.useAcceleration && lt(acceleration[i], 0) && lt(jerk[i], 0) && gt(v, 0) && lt(m, 0);
    const bullishEntry = bandUp[i] && lt(v, 0) && gt(m, 0) && trending[i];
    const bearishEntry = bandDown[i] && gt(v, 0) && lt(m, 0) && trending[i];
    const strongBull = thrUp[i] && !squeeze[i] && trending[i];
    const strongBear = thrDown[i] && !squeeze[i] && trending[i];
    accelBull[i] = bullishAcceleration && !squeeze[i];
    accelBear[i] = bearishAcceleration && !squeeze[i];
    anyBull[i] = accelBull[i] || bullishEntry || strongBull;
    anyBear[i] = accelBear[i] || bearishEntry || strongBear;
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const t = (i: number) => bars[i].time;
  const thr = cfg.signalThreshold;
  const zeroColor = String(color.new(color.gray, 50));
  const rawColor = String(color.new(color.gray, 30));
  const upThrColor = String(color.new(BULL, 70));
  const loThrColor = String(color.new(BEAR, 70));
  const bandColor = String(color.new(color.blue, 70));
  const midColor = String(color.new(color.gray, 80));
  const bullBg = String(color.new(BULL, 95));
  const bearBg = String(color.new(BEAR, 95));
  const neutralBg = String(color.new(NEUTRAL, 98));

  const plots: Record<string, { time: number; value: number; color?: string }[]> = {
    plot0: [], plot1: [], plot2: [], plot3: [], plot4: [], plot5: [], plot6: [], plot7: [],
  };
  const fillColors: string[] = new Array(n);
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const v = rsn[i];
    const intensity = Math.abs(v);
    const baseColor = gt(v, 0) ? BULL : BEAR;
    const lineColor = color.from_gradient(intensity, 0, 1, NEUTRAL, baseColor);
    plots.plot0.push({ time: t(i), value: fin(v), color: lineColor });
    plots.plot1.push({ time: t(i), value: cfg.showRawSignal ? fin(base[i]) : NaN, color: rawColor });
    plots.plot2.push({ time: t(i), value: 0, color: zeroColor });
    plots.plot3.push({ time: t(i), value: thr, color: upThrColor });
    plots.plot4.push({ time: t(i), value: -thr, color: loThrColor });
    plots.plot5.push({ time: t(i), value: cfg.showBands ? fin(upperBand[i]) : NaN, color: bandColor });
    plots.plot6.push({ time: t(i), value: cfg.showBands ? fin(lowerBand[i]) : NaN, color: bandColor });
    plots.plot7.push({ time: t(i), value: cfg.showBands ? fin(midBand[i]) : NaN, color: midColor });

    // fill(mainLine, zeroLine, color = showGradient ? fillColor : na)
    fillColors[i] = cfg.showGradient
      ? color.from_gradient(intensity, 0, 1, String(color.new(baseColor, 90)), String(color.new(baseColor, 50)))
      : 'transparent';

    // trendState: Strong Bullish / Bullish / Strong Bearish / Bearish / Neutral
    const m = momentumSmooth[i];
    const bullish = (gt(v, thr) && gt(m, 0)) || (gt(v, 0) && gt(m, 0));
    const bearish = !bullish && ((lt(v, -thr) && lt(m, 0)) || (lt(v, 0) && lt(m, 0)));
    bgColors.push({ time: t(i), color: bullish ? bullBg : bearish ? bearBg : neutralBg });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [{ plot1: 'plot0', plot2: 'plot2', colors: fillColors }],
    bgColors,
    // alertcondition(anyBullSignal) / (anyBearSignal) / (accelBullSignal) / (accelBearSignal)
    alerts: alertStates(alertConditions, bars, [anyBull, anyBear, accelBull, accelBear]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'DFF Bullish Signal', message: 'Dynamic Fractal Flow: Bullish signal detected!' },
  { id: 'alert1', title: 'DFF Bearish Signal', message: 'Dynamic Fractal Flow: Bearish signal detected!' },
  { id: 'alert2', title: 'DFF Bullish Acceleration', message: 'Dynamic Fractal Flow: Bullish acceleration detected!' },
  { id: 'alert3', title: 'DFF Bearish Acceleration', message: 'Dynamic Fractal Flow: Bearish acceleration detected!' },
];

export const DynamicFractalFlow = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
