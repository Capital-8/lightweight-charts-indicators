/**
 * Bilateral Filter For Loop
 *
 * A bilateral filter of the source over `Window Period` bars: each past value src[i] has the weight
 * exp(-i^2 / (2 * spatialSigma^2)) * exp(-(src - src[i])^2 / (2 * rangeSigma^2)); the filter is the weighted mean.
 * The score adds +1 for each bar offset from `Calculation Start` to `Calculation End` where the filter is above its
 * value at that offset, and -1 otherwise. A score above the long threshold sets the trend long, a cross under the
 * short threshold sets it short. The score line, the optional bar colours and background follow the trend.
 * Alerts (alertcondition, `alerts` of the result): 'Bilateral Filter FL Long' (score above the long threshold and no
 * cross under the short one) and 'Bilateral Filter FL Short' (score crossing under the short threshold).
 *
 * Reference: "Bilateral Filter For Loop [BackQuant]" by BackQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BackQuant
 */

import { getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bilateral Filter FL Long', message: 'Bilateral Filter FL Long - {{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bilateral Filter FL Short', message: 'Bilateral Filter FL Short - {{ticker}} - {{interval}}' },
];

export interface BilateralFilterForLoopInputs {
  /** Price source */
  src: SourceType;
  /** Window period of the bilateral filter */
  p: number;
  /** Spatial sigma */
  sigmaD: number;
  /** Range sigma */
  sigmaR: number;
  /** First bar offset of the score loop */
  start: number;
  /** Last bar offset of the score loop */
  end: number;
  /** Long threshold */
  upper: number;
  /** Short threshold */
  lower: number;
  /** Show the threshold lines */
  showthres: boolean;
  /** Colour the bars by trend */
  paintCandles: boolean;
  /** Colour the background by trend */
  bgcol: boolean;
  /** Signal line width (the plot width stays 3 in plotConfig) */
  linew: number;
  longcol: string;
  shortcol: string;
}

export const defaultInputs: BilateralFilterForLoopInputs = {
  src: 'close',
  p: 14,
  sigmaD: 1.0,
  sigmaR: 1.0,
  start: 1,
  end: 45,
  upper: 40,
  lower: -10,
  showthres: true,
  paintCandles: false,
  bgcol: false,
  linew: 3,
  longcol: '#00ff00',
  shortcol: '#ff0000',
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Price Source', defval: 'close' },
  { id: 'p', type: 'int', title: 'Window Period (Bilateral Filter)', defval: 14 },
  { id: 'sigmaD', type: 'float', title: 'Spatial Sigma', defval: 1.0 },
  { id: 'sigmaR', type: 'float', title: 'Range Sigma', defval: 1.0 },
  { id: 'start', type: 'int', title: 'Calculation Start', defval: 1 },
  { id: 'end', type: 'int', title: 'Calculation End', defval: 45, max: 50 },
  { id: 'upper', type: 'int', title: 'Long Threshold', defval: 40 },
  { id: 'lower', type: 'int', title: 'Short Threshold', defval: -10 },
  { id: 'showthres', type: 'bool', title: 'Show Threshold Lines?', defval: true },
  { id: 'paintCandles', type: 'bool', title: 'Color Bars According to Trend?', defval: false },
  { id: 'bgcol', type: 'bool', title: 'Background Colour', defval: false },
  { id: 'linew', type: 'int', title: 'Signal Line Width', defval: 3, min: 1, max: 4, step: 1 },
  { id: 'longcol', type: 'color', title: 'Long Colour', defval: '#00ff00' },
  { id: 'shortcol', type: 'color', title: 'Short Colour', defval: '#ff0000' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'For Loop', color: color.gray, lineWidth: 3 },
  { id: 'plot1', title: 'Long Threshold', color: '#00ff00', lineWidth: 1 },
  { id: 'plot2', title: 'Short Threshold', color: '#ff0000', lineWidth: 1 },
];

export const metadata = {
  title: 'Bilateral Filter For Loop [BackQuant]',
  shortTitle: 'BF FL [BackQuant]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<BilateralFilterForLoopInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  // x[k] on bar b: na before the first bar
  const at = (a: number[], b: number, k: number) => (b - k >= 0 && k >= 0 ? a[b - k] : NaN);

  // bilateral_filter(src, p, sigma_d, sigma_r): for i = 0 to p - 1 (a Pine loop runs downwards when p - 1 < 0)
  const loopRange = (from: number, to: number): number[] => {
    const r: number[] = [];
    if (from <= to) for (let k = from; k <= to; k++) r.push(k);
    else for (let k = from; k >= to; k--) r.push(k);
    return r;
  };
  const filterOffsets = loopRange(0, cfg.p - 1);
  const sub: number[] = new Array(n);
  for (let b = 0; b < n; b++) {
    let result = 0.0;
    let totalWeight = 0.0;
    for (const i of filterOffsets) {
      const s = at(src, b, i);
      const spatialWeight = Math.exp(-Math.pow(i, 2) / (2 * Math.pow(cfg.sigmaD, 2)));
      const rangeWeight = Math.exp(-Math.pow(src[b] - s, 2) / (2 * Math.pow(cfg.sigmaR, 2)));
      const weight = spatialWeight * rangeWeight;
      result = result + s * weight;
      totalWeight = totalWeight + weight;
    }
    sub[b] = result / totalWeight;
  }

  // forloop(start, end): for i = start to end by 1: return_val += sub > sub[i] ? 1 : -1
  const scoreOffsets = loopRange(cfg.start, cfg.end);
  const score: number[] = new Array(n);
  for (let b = 0; b < n; b++) {
    let v = 0.0;
    for (const i of scoreOffsets) v += gt(sub[b], at(sub, b, i)) ? 1 : -1;
    score[b] = v;
  }

  // L = score > upper; S = ta.crossunder(score, lower) (exact comparison); var out = 0
  const outArr: number[] = new Array(n);
  let out = 0;
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];
  for (let b = 0; b < n; b++) {
    const L = gt(score[b], cfg.upper);
    const S = b > 0 && score[b] < cfg.lower && score[b - 1] >= cfg.lower;
    longFlags.push(L && !S);
    shortFlags.push(S);
    if (L && !S) out = 1;
    if (S) out = -1;
    outArr[b] = out;
  }

  const trendColor = (o: number) => (o === 1 ? cfg.longcol : o === -1 ? cfg.shortcol : color.gray);
  const t = (i: number) => bars[i].time;
  const plot0 = bars.map((_b, i) => ({ time: t(i), value: score[i], color: trendColor(outArr[i]) }));
  const plot1 = bars.map((_b, i) => ({ time: t(i), value: cfg.showthres ? cfg.upper : NaN, color: cfg.longcol }));
  const plot2 = bars.map((_b, i) => ({ time: t(i), value: cfg.showthres ? cfg.lower : NaN, color: cfg.shortcol }));

  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const longBg = String(color.new(cfg.longcol, 90));
  const shortBg = String(color.new(cfg.shortcol, 90));
  for (let i = 0; i < n; i++) {
    if (cfg.paintCandles) barColors.push({ time: t(i), color: trendColor(outArr[i]) });
    if (cfg.bgcol) {
      const o = outArr[i];
      bgColors.push({ time: t(i), color: o === 1 ? longBg : o === -1 ? shortBg : color.gray });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    barColors,
    bgColors,
    // alertcondition(L and not S, "Bilateral Filter FL Long") / alertcondition(S, "Bilateral Filter FL Short")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

export const BilateralFilterForLoop = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
