/**
 * Fisher MPz
 *
 * A weighted composite of three Fisher transforms (short / medium / long periods) of hl2, optionally winsorized
 * (capped at its 5th / 95th nearest-rank percentiles over a lookback). Each transform takes a robust z-score
 * ((src - median) / (1.4826 * median absolute deviation)), clips it at a level (fixed, or 0.05 to 0.2 from the
 * ratio of the ATR to its SMA), normalises it to -1..1, smooths it (Kalman filter or EMA-like), and applies the
 * Fisher transform 0.5 * ln((1 + x) / (1 - x)) followed by a second Kalman filter (or a 0.5 feedback). The trigger
 * is the composite of the previous bar, optionally smoothed by a 2-period EMA. Classic style: cyan composite and
 * white trigger; Filled style: both lines and a fill coloured by the direction (composite >= trigger).
 * Alerts (alert() calls, `alertCalls` of the result, once per bar), with "Enable Alerts" on: "Fisher MPz: Bullish
 * Crossover - Composite crossed above Trigger" (with "Alert on Bullish Crossover") and "Fisher MPz: Bearish Crossover -
 * Composite crossed below Trigger" (with "Alert on Bearish Crossover") on the bars where the composite crosses the
 * trigger.
 *
 * Reference: "Fisher MPz" by B3AR_Trades
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { AlertCall } from '../types';
import { crossedOver, crossedUnder } from '../alert-states';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface FisherMPzInputs {
  /** Classic: cyan line with white trigger; Filled: directional colours and fill */
  visualStyle: 'Classic' | 'Filled';
  length1: number;
  length2: number;
  length3: number;
  weight1: number;
  weight2: number;
  weight3: number;
  useWinsorization: boolean;
  winsorLookback: number;
  lowerPercentile: number;
  upperPercentile: number;
  useKalman: boolean;
  /** Smoothing factor (when the Kalman filter is off) */
  smoothFactor: number;
  kalmanQ: number;
  kalmanR: number;
  useDynamicClip: boolean;
  zScoreClip: number;
  dynamicClipLength: number;
  /** 2-period EMA on the trigger line */
  smoothTrigger: boolean;
  showIndividual: boolean;
  compositeColor: string;
  triggerColor: string;
  bullishColor: string;
  bearishColor: string;
  /** Fill transparency (0 = solid, 100 = invisible) */
  fillOpacity: number;
  shortColor: string;
  mediumColor: string;
  longColor: string;
  /** Alert inputs: the alert() calls (`alertCalls`) */
  enableAlerts: boolean;
  alertOnBullish: boolean;
  alertOnBearish: boolean;
}

export const defaultInputs: FisherMPzInputs = {
  visualStyle: 'Classic',
  length1: 8,
  length2: 13,
  length3: 26,
  weight1: 4.0,
  weight2: 2.0,
  weight3: 1.0,
  useWinsorization: true,
  winsorLookback: 20,
  lowerPercentile: 5.0,
  upperPercentile: 95.0,
  useKalman: true,
  smoothFactor: 0.18,
  kalmanQ: 0.01,
  kalmanR: 0.1,
  useDynamicClip: true,
  zScoreClip: 0.7,
  dynamicClipLength: 20,
  smoothTrigger: true,
  showIndividual: false,
  compositeColor: '#00D9FF',
  triggerColor: '#FFFFFF',
  bullishColor: '#00FFFF',
  bearishColor: '#FF3366',
  fillOpacity: 50,
  shortColor: '#A78BFA',
  mediumColor: '#FBBF24',
  longColor: '#34D399',
  enableAlerts: false,
  alertOnBullish: false,
  alertOnBearish: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'visualStyle', type: 'string', title: 'Visual Style', defval: 'Classic', options: ['Classic', 'Filled'], group: 'Visual Style' },
  { id: 'length1', type: 'int', title: 'Short Period', defval: 8, min: 1, group: 'Periods' },
  { id: 'length2', type: 'int', title: 'Medium Period', defval: 13, min: 1, group: 'Periods' },
  { id: 'length3', type: 'int', title: 'Long Period', defval: 26, min: 1, group: 'Periods' },
  { id: 'weight1', type: 'float', title: 'Short Weight', defval: 4.0, min: 0.1, group: 'Weights' },
  { id: 'weight2', type: 'float', title: 'Medium Weight', defval: 2.0, min: 0.1, group: 'Weights' },
  { id: 'weight3', type: 'float', title: 'Long Weight', defval: 1.0, min: 0.1, group: 'Weights' },
  { id: 'useWinsorization', type: 'bool', title: 'Use Winsorization', defval: true, group: 'Winsorization' },
  { id: 'winsorLookback', type: 'int', title: 'Winsorization Lookback', defval: 20, min: 10, max: 200, group: 'Winsorization' },
  { id: 'lowerPercentile', type: 'float', title: 'Lower Percentile', defval: 5.0, min: 0.1, max: 49.9, group: 'Winsorization' },
  { id: 'upperPercentile', type: 'float', title: 'Upper Percentile', defval: 95.0, min: 50.1, max: 99.9, group: 'Winsorization' },
  { id: 'useKalman', type: 'bool', title: 'Use Kalman Filter', defval: true, group: 'Fisher Parameters' },
  { id: 'smoothFactor', type: 'float', title: 'Smoothing Factor (if Kalman off)', defval: 0.18, min: 0.01, max: 0.99, group: 'Fisher Parameters' },
  { id: 'kalmanQ', type: 'float', title: 'Kalman Process Noise (Q)', defval: 0.01, min: 0.001, max: 0.1, group: 'Fisher Parameters' },
  { id: 'kalmanR', type: 'float', title: 'Kalman Measurement Noise (R)', defval: 0.1, min: 0.01, max: 1.0, group: 'Fisher Parameters' },
  { id: 'useDynamicClip', type: 'bool', title: 'Use Dynamic Z-Score Clipping', defval: true, group: 'Fisher Parameters' },
  { id: 'zScoreClip', type: 'float', title: 'Base Z-Score Clip Level', defval: 0.7, min: 0.1, max: 5.0, group: 'Fisher Parameters' },
  { id: 'dynamicClipLength', type: 'int', title: 'Dynamic Clip Lookback', defval: 20, min: 5, max: 100, group: 'Fisher Parameters' },
  { id: 'smoothTrigger', type: 'bool', title: 'Add Smoothing to Trigger', defval: true, group: 'Fisher Parameters' },
  { id: 'showIndividual', type: 'bool', title: 'Show Individual Periods', defval: false, group: 'Display' },
  { id: 'compositeColor', type: 'color', title: 'Composite Fisher Color (Classic)', defval: '#00D9FF', group: 'Classic Style Colors' },
  { id: 'triggerColor', type: 'color', title: 'Trigger Line Color (Classic)', defval: '#FFFFFF', group: 'Classic Style Colors' },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color (Filled)', defval: '#00FFFF', group: 'Filled Style Colors' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color (Filled)', defval: '#FF3366', group: 'Filled Style Colors' },
  { id: 'fillOpacity', type: 'int', title: 'Fill Opacity', defval: 50, min: 0, max: 100, group: 'Filled Style Colors' },
  { id: 'shortColor', type: 'color', title: 'Short Period Color', defval: '#A78BFA', group: 'Individual Period Colors' },
  { id: 'mediumColor', type: 'color', title: 'Medium Period Color', defval: '#FBBF24', group: 'Individual Period Colors' },
  { id: 'longColor', type: 'color', title: 'Long Period Color', defval: '#34D399', group: 'Individual Period Colors' },
  { id: 'enableAlerts', type: 'bool', title: 'Enable Alerts', defval: false, group: 'Alerts' },
  { id: 'alertOnBullish', type: 'bool', title: 'Alert on Bullish Crossover', defval: false, group: 'Alerts' },
  { id: 'alertOnBearish', type: 'bool', title: 'Alert on Bearish Crossover', defval: false, group: 'Alerts' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Composite Fisher', color: '#00D9FF', lineWidth: 2 },
  { id: 'plot1', title: 'Trigger', color: '#FFFFFF', lineWidth: 2 },
  { id: 'plot2', title: 'Short Period', color: String(color.new('#A78BFA', 30)), lineWidth: 1 },
  { id: 'plot3', title: 'Medium Period', color: String(color.new('#FBBF24', 30)), lineWidth: 1 },
  { id: 'plot4', title: 'Long Period', color: String(color.new('#34D399', 30)), lineWidth: 1 },
];

/** hline(0, color = color.new(color.gray, 50), linestyle = hline.style_dotted, title = "Zero Line") */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero Line', color: String(color.new(color.gray, 50)), linestyle: 'dotted' },
];

export const metadata = {
  title: 'Fisher MPz',
  shortTitle: 'Fisher MPz',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const nz = (x: number) => (Number.isFinite(x) ? x : 0);

/**
 * kalmanFilter(src, Q, R): one state per Pine call site (var x = na, var P = na); returns the per-bar function.
 */
function kalmanSite(Q: number, R: number): (src: number) => number {
  let x = NaN;
  let P = NaN;
  return (src: number) => {
    if (isNaN(x)) {
      x = src;
      P = 1.0;
    }
    const xPrior = x;
    const pPrior = P + Q;
    const K = pPrior / (pPrior + R);
    x = xPrior + K * (src - xPrior);
    P = (1 - K) * pPrior;
    return x;
  };
}

export function calculate(bars: Bar[], inputs: Partial<FisherMPzInputs> = {}): IndicatorResult & { alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // priceSource = useWinsorization ? winsorize(hl2, winsorLookback, lowerPercentile, upperPercentile) : hl2
  const rawPrice = bars.map((b) => (b.high + b.low) / 2);
  let priceSource = rawPrice;
  if (cfg.useWinsorization) {
    const lowerT = A(ta.percentile_nearest_rank(S(rawPrice), cfg.winsorLookback, cfg.lowerPercentile));
    const upperT = A(ta.percentile_nearest_rank(S(rawPrice), cfg.winsorLookback, cfg.upperPercentile));
    priceSource = rawPrice.map((v, i) => Math.max(lowerT[i], Math.min(v, upperT[i])));
  }

  // calcDynamicClip(dynamicClipLength): the same on the three fisherTransform calls
  let clipLevel: number[] = new Array(n).fill(cfg.zScoreClip);
  if (cfg.useDynamicClip) {
    const atrValue = A(ta.atr(bars, cfg.dynamicClipLength));
    const atrSma = A(ta.sma(S(atrValue), cfg.dynamicClipLength));
    clipLevel = atrValue.map((a, i) => {
      const volatilityRatio = gt(atrSma[i], 0) ? a / atrSma[i] : 1.0;
      const normalizedVol = Math.min(Math.max((volatilityRatio - 0.5) / 1.5, 0), 1);
      return 0.05 + normalizedVol * (0.2 - 0.05);
    });
  }

  const fisherTransform = (length: number): number[] => {
    // calcRobustZScore(src, length)
    const median = A(ta.median(S(priceSource), length));
    const absDeviation = priceSource.map((v, i) => Math.abs(v - median[i]));
    const mad = A(ta.median(S(absDeviation), length));
    const kalman1 = kalmanSite(cfg.kalmanQ, cfg.kalmanR);
    const kalman2 = kalmanSite(cfg.kalmanQ, cfg.kalmanR);
    const out = new Array(n);
    let nValue1 = 0.0; // var float nValue1 = 0.0
    let fisher = 0.0; // var float fisher = 0.0
    for (let i = 0; i < n; i++) {
      const robustStdDev = mad[i] * 1.4826;
      const zScore = gt(robustStdDev, 0) ? (priceSource[i] - median[i]) / robustStdDev : 0.0;
      const clip = clipLevel[i];
      const zScoreClipped = Math.min(Math.max(zScore, -clip), clip);
      const normalized = zScoreClipped / clip;
      if (cfg.useKalman) nValue1 = kalman1(normalized);
      else nValue1 = cfg.smoothFactor * normalized + (1 - cfg.smoothFactor) * nz(nValue1);
      const nValue2 = Math.min(Math.max(nValue1, -0.999), 0.999);
      const raw = 0.5 * Math.log((1 + nValue2) / (1 - nValue2));
      if (cfg.useKalman) fisher = kalman2(raw);
      else fisher = raw + 0.5 * nz(fisher);
      out[i] = fisher;
    }
    return out;
  };
  const fisher1 = fisherTransform(cfg.length1);
  const fisher2 = fisherTransform(cfg.length2);
  const fisher3 = fisherTransform(cfg.length3);

  const totalWeight = cfg.weight1 + cfg.weight2 + cfg.weight3;
  const composite = fisher1.map((f1, i) => (f1 * cfg.weight1 + fisher2[i] * cfg.weight2 + fisher3[i] * cfg.weight3) / totalWeight);
  const compositePrev = composite.map((_v, i) => (i > 0 ? composite[i - 1] : NaN));
  // trigger = smoothTrigger ? ta.ema(composite[1], 2) : composite[1]
  const trigger = cfg.smoothTrigger ? A(ta.ema(S(compositePrev), 2)) : compositePrev;

  // bullishCross = ta.crossover(composite, trigger); bearishCross = ta.crossunder(composite, trigger)
  // if enableAlerts and alertOnBullish and bullishCross: alert("...", alert.freq_once_per_bar); bearish alike
  const bullishCross = crossedOver(composite, trigger);
  const bearishCross = crossedUnder(composite, trigger);
  const alertCalls: AlertCall[] = [];
  for (let i = 0; i < n; i++) {
    if (cfg.enableAlerts && cfg.alertOnBullish && bullishCross[i]) {
      alertCalls.push({ time: bars[i].time as number, message: 'Fisher MPz: Bullish Crossover - Composite crossed above Trigger', freq: 'once_per_bar' });
    }
    if (cfg.enableAlerts && cfg.alertOnBearish && bearishCross[i]) {
      alertCalls.push({ time: bars[i].time as number, message: 'Fisher MPz: Bearish Crossover - Composite crossed below Trigger', freq: 'once_per_bar' });
    }
  }

  const isClassic = cfg.visualStyle === 'Classic';
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const dirColor = (i: number) => (ge(composite[i], trigger[i]) ? cfg.bullishColor : cfg.bearishColor);
  const t = (i: number) => bars[i].time;
  const plot0 = bars.map((_b, i) => ({ time: t(i), value: fin(composite[i]), color: isClassic ? cfg.compositeColor : dirColor(i) }));
  const plot1 = bars.map((_b, i) => ({ time: t(i), value: fin(trigger[i]), color: isClassic ? cfg.triggerColor : dirColor(i) }));
  const indiv = (f: number[], c: string) => {
    const col = String(color.new(c, 30));
    return bars.map((_b, i) => ({ time: t(i), value: cfg.showIndividual ? fin(f[i]) : NaN, color: col }));
  };
  // fill(p1, p2, color = isClassic ? na : color.new(isBullish ? bullishColor : bearishColor, fillOpacity))
  const colors = bars.map((_b, i) => (isClassic ? 'transparent' : String(color.new(dirColor(i), cfg.fillOpacity))));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0,
      plot1,
      plot2: indiv(fisher1, cfg.shortColor),
      plot3: indiv(fisher2, cfg.mediumColor),
      plot4: indiv(fisher3, cfg.longColor),
    },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: String(color.new(color.gray, 50)), linestyle: 'dotted' } }],
    fills: [{ plot1: 'plot0', plot2: 'plot1', colors, options: { title: 'Direction Fill' } }],
    alertCalls,
  };
}

export const FisherMPz = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
