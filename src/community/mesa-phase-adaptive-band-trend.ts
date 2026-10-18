/**
 * MESA Phase-Adaptive Band Trend
 *
 * An EMA centre line with bands at +- multiplier * stdev(returns)[1] * EMA. The multiplier moves from the slow
 * multiplier to the active multiplier with the phase activity: an Ehlers MESA (Hilbert transform) phase of the
 * smoothed source gives a phase change, alpha = fastLimit / phase change (at least slowLimit), and the activity is
 * the position of alpha between slowLimit and fastLimit. A close above the upper band starts a bullish regime, a
 * close below the lower band a bearish one: the line, the fill and the bars take the regime colour and LONG / SHORT
 * markers show the regime changes.
 * Alerts (alertcondition, `alerts` of the result): 'Long Signal' and 'Short Signal', true on the regime changes.
 *
 * Reference: "MESA Phase-Adaptive Band Trend [SchizoQuant]" by SchizoQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © SchizoQuant
 */

import { ta, math, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long Signal', message: 'Phase-Responsive Band Trend Long Signal on {{ticker}}' },
  { id: 'alert1', title: 'Short Signal', message: 'Phase-Responsive Band Trend Short Signal on {{ticker}}' },
];

export interface MesaPhaseAdaptiveBandTrendInputs {
  src: SourceType;
  fastLimit: number;
  slowLimit: number;
  /** EMA length of the centre line */
  trendLength: number;
  /** Stdev length of the returns */
  volLength: number;
  /** Band multiplier when the phase activity is strong */
  activeMult: number;
  /** Band multiplier when the phase activity is weak */
  slowMult: number;
  showBands: boolean;
  showFill: boolean;
  showSignals: boolean;
  colorBars: boolean;
  longColor: string;
  shortColor: string;
}

export const defaultInputs: MesaPhaseAdaptiveBandTrendInputs = {
  src: 'hl2',
  fastLimit: 0.5,
  slowLimit: 0.05,
  trendLength: 20,
  volLength: 20,
  activeMult: 1.5,
  slowMult: 3.0,
  showBands: true,
  showFill: true,
  showSignals: true,
  colorBars: true,
  longColor: 'rgb(57, 255, 20)',
  shortColor: 'rgb(138, 43, 226)',
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'hl2' },
  { id: 'fastLimit', type: 'float', title: 'Fast Limit', defval: 0.5, min: 0.01, max: 1.0, step: 0.01 },
  { id: 'slowLimit', type: 'float', title: 'Slow Limit', defval: 0.05, min: 0.001, max: 1.0, step: 0.001 },
  { id: 'trendLength', type: 'int', title: 'Trend Length', defval: 20, min: 2 },
  { id: 'volLength', type: 'int', title: 'Volatility Length', defval: 20, min: 2 },
  { id: 'activeMult', type: 'float', title: 'Active Multiplier', defval: 1.5, min: 0.1, step: 0.1 },
  { id: 'slowMult', type: 'float', title: 'Slow Multiplier', defval: 3.0, min: 0.1, step: 0.1 },
  { id: 'showBands', type: 'bool', title: 'Show Bands', defval: true },
  { id: 'showFill', type: 'bool', title: 'Show Fill', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Signals', defval: true },
  { id: 'colorBars', type: 'bool', title: 'Color Bars', defval: true },
  { id: 'longColor', type: 'color', title: 'Bullish Color', defval: 'rgb(57, 255, 20)' },
  { id: 'shortColor', type: 'color', title: 'Bearish Color', defval: 'rgb(138, 43, 226)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend', color: 'rgb(57, 255, 20)', lineWidth: 2 },
  { id: 'plot1', title: 'Upper Phase Band', color: 'rgba(57, 255, 20, 0.65)', lineWidth: 1 },
  { id: 'plot2', title: 'Lower Phase Band', color: 'rgba(138, 43, 226, 0.65)', lineWidth: 1 },
];

export const metadata = {
  title: 'MESA Phase-Adaptive Band Trend',
  shortTitle: 'MESA Phase-Adaptive Band Trend',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a != b when they differ by more than 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<MesaPhaseAdaptiveBandTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const srcS = getSourceSeries(bars, cfg.src);
  const src = A(srcS);
  const atan = (x: number) => math.atan(x) as number;
  // nz(x[k]) of an array filled up to bar i
  const at = (a: number[], i: number, k: number) => (i - k >= 0 && !isNaN(a[i - k]) ? a[i - k] : 0);
  const fir = (a: number[], i: number) => 0.0962 * a[i] + 0.5769 * at(a, i, 2) - 0.5769 * at(a, i, 4) - 0.0962 * at(a, i, 6);

  const smooth: number[] = new Array(n);
  const detrender: number[] = new Array(n);
  const q1: number[] = new Array(n);
  const i1: number[] = new Array(n);
  const i2: number[] = new Array(n);
  const q2: number[] = new Array(n);
  const re: number[] = new Array(n);
  const im: number[] = new Array(n);
  const phase: number[] = new Array(n);
  const phaseActivity: number[] = new Array(n);
  let period = 10.0; // var float period = 10.0 (value of the previous bar here)
  for (let i = 0; i < n; i++) {
    const s = src[i];
    const srcAt = (k: number) => (i - k >= 0 && !isNaN(src[i - k]) ? src[i - k] : s); // nz(src[k], src)
    smooth[i] = (4.0 * s + 3.0 * srcAt(1) + 2.0 * srcAt(2) + srcAt(3)) / 10.0;
    const previousPeriod = i > 0 && !isNaN(period) ? period : 10.0; // nz(period[1], 10.0)
    const periodFactor = 0.075 * previousPeriod + 0.54;

    detrender[i] = fir(smooth, i) * periodFactor;
    q1[i] = fir(detrender, i) * periodFactor;
    i1[i] = at(detrender, i, 3);
    const jI = fir(i1, i) * periodFactor;
    const jQ = fir(q1, i) * periodFactor;
    const i2Raw = i1[i] - jQ;
    const q2Raw = q1[i] + jI;
    i2[i] = 0.2 * i2Raw + 0.8 * at(i2, i, 1);
    q2[i] = 0.2 * q2Raw + 0.8 * at(q2, i, 1);
    const reRaw = i2[i] * at(i2, i, 1) + q2[i] * at(q2, i, 1);
    const imRaw = i2[i] * at(q2, i, 1) - q2[i] * at(i2, i, 1);
    re[i] = 0.2 * reRaw + 0.8 * at(re, i, 1);
    im[i] = 0.2 * imRaw + 0.8 * at(im, i, 1);

    const angle = ne(re[i], 0.0) ? (atan(im[i] / re[i]) * 180.0) / Math.PI : 0.0;
    const rawPeriod = ne(angle, 0.0) ? Math.abs(360.0 / angle) : previousPeriod;
    let limitedPeriod = Math.min(rawPeriod, 1.5 * previousPeriod);
    limitedPeriod = Math.max(limitedPeriod, 0.67 * previousPeriod);
    limitedPeriod = Math.max(6.0, Math.min(50.0, limitedPeriod));
    period = 0.2 * limitedPeriod + 0.8 * previousPeriod;

    phase[i] = ne(i1[i], 0.0) ? (atan(q1[i] / i1[i]) * 180.0) / Math.PI : at(phase, i, 1);
    let deltaPhase = at(phase, i, 1) - phase[i];
    deltaPhase = Math.max(deltaPhase, 1.0);
    let alphaPhase = cfg.fastLimit / deltaPhase;
    alphaPhase = Math.max(alphaPhase, cfg.slowLimit);
    const phaseRange = Math.max(cfg.fastLimit - cfg.slowLimit, 0.0001);
    phaseActivity[i] = Math.max(0.0, Math.min(1.0, (alphaPhase - cfg.slowLimit) / phaseRange));
  }

  const trend = A(ta.ema(srcS, cfg.trendLength));
  // priceReturn = src[1] != 0.0 ? (src - src[1]) / src[1] : 0.0 (na != 0 is false)
  const priceReturn = src.map((s, i) => (i > 0 && ne(src[i - 1], 0.0) ? (s - src[i - 1]) / src[i - 1] : 0.0));
  const stdevRet = A(ta.stdev(Series.fromArray(bars, priceReturn), cfg.volLength));

  const upperBand: number[] = new Array(n);
  const lowerBand: number[] = new Array(n);
  const sq: number[] = new Array(n);
  const longSignal: boolean[] = new Array(n);
  const shortSignal: boolean[] = new Array(n);
  let SQ = 0;
  for (let i = 0; i < n; i++) {
    const volatility = i > 0 ? stdevRet[i - 1] : NaN; // ta.stdev(priceReturn, volLength)[1]
    const adaptiveMult = cfg.slowMult - (cfg.slowMult - cfg.activeMult) * phaseActivity[i];
    upperBand[i] = trend[i] + adaptiveMult * volatility * trend[i];
    lowerBand[i] = trend[i] - adaptiveMult * volatility * trend[i];
    const close = bars[i].close;
    if (gt(close, upperBand[i])) SQ = 1;
    else if (lt(close, lowerBand[i])) SQ = -1;
    sq[i] = SQ;
    // SQ[1] != 1: SQ[1] is na on bar 0 (compares false)
    longSignal[i] = SQ === 1 && i > 0 && sq[i - 1] !== 1;
    shortSignal[i] = SQ === -1 && i > 0 && sq[i - 1] !== -1;
  }

  const col = (i: number) => (sq[i] === 1 ? cfg.longColor : cfg.shortColor);
  const upperColor = String(color.new(cfg.longColor, 35));
  const lowerColor = String(color.new(cfg.shortColor, 35));

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    if (cfg.showSignals && longSignal[i]) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: cfg.longColor, size: 'small',
        text: 'LONG', textColor: color.white });
    }
    if (cfg.showSignals && shortSignal[i]) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: cfg.shortColor, size: 'small',
        text: 'SHORT', textColor: color.white });
    }
    // barcolor(colorBars ? col : na)
    if (cfg.colorBars) barColors.push({ time: t, color: col(i) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: trend[i], color: col(i) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.showBands ? upperBand[i] : NaN, color: upperColor })),
      plot2: bars.map((b, i) => ({ time: b.time, value: cfg.showBands ? lowerBand[i] : NaN, color: lowerColor })),
    },
    // fill(upperPlot, lowerPlot, title = "Phase Band Fill", color = showFill ? color.new(col, 90) : na)
    fills: [{
      plot1: 'plot1', plot2: 'plot2', options: { title: 'Phase Band Fill' },
      colors: bars.map((_b, i) => (cfg.showFill ? String(color.new(col(i), 90)) : 'transparent')),
    }],
    markers,
    barColors,
    // alertcondition(longSignal, "Long Signal") / alertcondition(shortSignal, "Short Signal")
    alerts: alertStates(alertConditions, bars, [longSignal, shortSignal]),
  };
}

export const MesaPhaseAdaptiveBandTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
