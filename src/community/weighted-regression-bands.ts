/**
 * Weighted Regression Bands
 *
 * A weighted high / low midline over `len` bars, by one of three methods on the bar medians (high + low) / 2:
 * Simple (highest and lowest median), Advanced (median of the bar with the highest / lowest median * range * decay,
 * smoothed by kf(x, 0.1)) or Smooth (range * decay^2 weighted mean of the medians). The midline is smoothed by
 * kf(x, filterStrength), with kf(x, a) = previous + a * (x - previous) (started at x). The fair value is the
 * "Linear Regression" of the midline (the script regresses the current midline value on every x of the window, so
 * it gives back the midline) or its ALMA(len, 0.85, 6). Bands at the fair value -/+ 1, 2 and 3 times
 * mult * stdev(close, len) are filled; the line and the fills are green while the fair value rises and red while
 * it falls (they keep the last colour on a flat bar).
 * Alerts (alertcondition, `alerts` of the result): 'Trend - Long' / 'Trend - Short' on the bars where the slope of the
 * fair value turns positive / negative (slope > 0 and slope[1] <= 0, and the mirror).
 *
 * Reference: "Weighted Regression Bands (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface WeightedRegressionBandsInputs {
  /** Length of the weighting window, the regression / ALMA and the stdev */
  len: number;
  /** Deviation multiplier */
  mult: number;
  /** Fair value method */
  MA: 'Linear Regression' | 'ALMA';
  /** Weighted high / low method */
  weightingMethod: 'Simple' | 'Advanced' | 'Smooth';
  /** Smoothing of the midline (1 = none) */
  filterStrength: number;
  upperCol: string;
  lowerCol: string;
  /** Bands (off: the deviation multiplier is 0) */
  noband: boolean;
}

export const defaultInputs: WeightedRegressionBandsInputs = {
  len: 50,
  mult: 1.0,
  MA: 'Linear Regression',
  weightingMethod: 'Simple',
  filterStrength: 0.08,
  upperCol: '#00e676',
  lowerCol: '#e91e63',
  noband: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Length', defval: 50, min: 1 },
  { id: 'mult', type: 'float', title: 'Deviation Multiplier', defval: 1.0, min: 0.01, step: 0.1 },
  { id: 'MA', type: 'string', title: 'Method', defval: 'Linear Regression', options: ['Linear Regression', 'ALMA'] },
  { id: 'weightingMethod', type: 'string', title: 'Weighted HL Method', defval: 'Simple', options: ['Simple', 'Advanced', 'Smooth'] },
  { id: 'filterStrength', type: 'float', title: 'Smoothing [1 = None Smoothing]', defval: 0.08, min: 0.01, max: 1, step: 0.01, group: 'Trend Factor' },
  { id: 'upperCol', type: 'color', title: '', defval: '#00e676', inline: 'c' },
  { id: 'lowerCol', type: 'color', title: '', defval: '#e91e63', inline: 'c' },
  { id: 'noband', type: 'bool', title: 'Bands', defval: true, inline: 'c' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Weighted Regression Line', color: '#00e676', lineWidth: 2 },
  { id: 'plot1', title: 'Upper Band 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Upper Band 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Upper Band 3', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Lower Band 1', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Lower Band 2', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Lower Band 3', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Weighted Regression Bands (Zeiierman)',
  shortTitle: 'Weighted Regression Bands (Zeiierman)',
  overlay: true,
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > 1e-10);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > 1e-10);
/** Pine x / y: na when y is 0 */
const div = (x: number, y: number) => (y === 0 ? NaN : x / y);

/** Pine `for i = from to to`: counts down when from > to */
function pineFor(from: number, to: number, f: (i: number) => void): void {
  if (from <= to) for (let i = from; i <= to; i++) f(i);
  else for (let i = from; i >= to; i--) f(i);
}

/** kf(src, s_len): one state per call site; na(state) ? src : state + s_len * (src - state) */
function makeKf(sLen: number): (x: number) => number {
  let state = NaN;
  return (x: number) => {
    state = isNaN(state) ? x : state + sLen * (x - state);
    return state;
  };
}

export function calculate(
  bars: Bar[], inputs: Partial<WeightedRegressionBandsInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.len;
  const mult = cfg.noband ? cfg.mult : 0;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // (high[i] + low[i]) / 2 and high[i] - low[i] of bar t (na before the first bar)
  const med = (t: number, i: number) => (t - i >= 0 ? (bars[t - i].high + bars[t - i].low) / 2 : NaN);
  const rng = (t: number, i: number) => (t - i >= 0 ? bars[t - i].high - bars[t - i].low : NaN);

  const kfAdvHi = makeKf(0.1);
  const kfAdvLo = makeKf(0.1);
  const kfMid = makeKf(cfg.filterStrength);
  const whlMid: number[] = new Array(n);
  const lenW = Math.max(1, len);
  for (let t = 0; t < n; t++) {
    let hi = NaN;
    let lo = NaN;
    if (cfg.weightingMethod === 'Simple') {
      // WeightedHighest / WeightedLowest: for i = 1 to math.min(_len - 1, bar_index)
      hi = med(t, 0);
      lo = med(t, 0);
      pineFor(1, Math.min(lenW - 1, t), (i) => {
        const m = med(t, i);
        if (gt(m, hi)) hi = m;
        if (lt(m, lo)) lo = m;
      });
    } else if (cfg.weightingMethod === 'Advanced') {
      // highest / lowest score = median * range * (1 - i / _len); the median of that bar, then kf(x, 0.1)
      let wHi = NaN;
      let maxScore = NaN;
      let wLo = NaN;
      let minScore = NaN;
      pineFor(0, Math.min(lenW - 1, t), (i) => {
        const m = med(t, i);
        const score = m * rng(t, i) * (1.0 - i / lenW);
        if (isNaN(maxScore) || gt(score, maxScore)) {
          maxScore = score;
          wHi = m;
        }
        if (isNaN(minScore) || lt(score, minScore)) {
          minScore = score;
          wLo = m;
        }
      });
      hi = kfAdvHi(wHi);
      lo = kfAdvLo(wLo);
    } else if (cfg.weightingMethod === 'Smooth') {
      // sum(median * range * (1 - i / len)^2) / sum(range * (1 - i / len)^2), i = 0 to len - 1
      let num = 0.0;
      let denom = 0.0;
      pineFor(0, len - 1, (i) => {
        const w = rng(t, i) * Math.pow(1 - i / len, 2);
        num += med(t, i) * w;
        denom += w;
      });
      hi = div(num, denom);
      lo = hi; // SmoothWeightedLowest is the same computation
    }
    whlMid[t] = kfMid((hi + lo) / 2);
  }

  // Fair value
  let fair: number[];
  if (cfg.MA === 'ALMA') {
    fair = A(ta.alma(Series.fromArray(bars, whlMid), len, 0.85, 6));
  } else {
    // LinReg_WHL: y = whlMid (the current value) for every x = 0 .. len - 1
    fair = whlMid.map((y) => {
      let sumX = 0.0;
      let sumY = 0.0;
      let sumXY = 0.0;
      let sumXX = 0.0;
      pineFor(0, len - 1, (x) => {
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
      });
      const slope = div(len * sumXY - sumX * sumY, len * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / len;
      return slope * (len - 1) + intercept;
    });
  }

  const sd = A(ta.stdev(Series.fromArray(bars, bars.map((b) => b.close)), len));
  const dev = sd.map((s) => mult * s);

  // bandColor := slope > 0 ? upper_col : slope < 0 ? lower_col : bandColor[1] (na on the first bar)
  const bandColor: (string | null)[] = new Array(n);
  const slopes: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const slope = i > 0 ? fair[i] - fair[i - 1] : NaN;
    slopes[i] = slope;
    bandColor[i] = gt(slope, 0) ? cfg.upperCol : lt(slope, 0) ? cfg.lowerCol : i > 0 ? bandColor[i - 1] : null;
  }
  // bullishFlip = slope > 0 and slope[1] <= 0; bearishFlip = slope < 0 and slope[1] >= 0
  const prevSlope = (i: number) => (i > 0 ? slopes[i - 1] : NaN);
  const bullishFlip = slopes.map((v, i) => gt(v, 0) && le(prevSlope(i), 0));
  const bearishFlip = slopes.map((v, i) => lt(v, 0) && ge(prevSlope(i), 0));

  const line = (k: number) => bars.map((b, i) => ({ time: b.time, value: fair[i] + dev[i] * k }));
  // color.new(na, t) is black with transparency t
  const fillCol = (t: number) => bandColor.map((c) => String(color.new(c ?? '#000000', t)));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fair[i], color: bandColor[i] ?? 'transparent' })),
      plot1: line(1),
      plot2: line(2),
      plot3: line(3),
      plot4: line(-1),
      plot5: line(-2),
      plot6: line(-3),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot4', colors: fillCol(85) },
      { plot1: 'plot2', plot2: 'plot5', colors: fillCol(92) },
      { plot1: 'plot3', plot2: 'plot6', colors: fillCol(96) },
    ],
    alerts: alertStates(alertConditions, bars, [bullishFlip, bearishFlip]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Trend - Long', message: 'Trend turned bullish for {{ticker}}' },
  { id: 'alert1', title: 'Trend - Short', message: 'Trend turned bearish for {{ticker}}' },
];

export const WeightedRegressionBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
