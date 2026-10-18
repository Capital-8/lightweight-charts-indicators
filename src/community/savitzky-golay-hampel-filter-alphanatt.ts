/**
 * Savitzky-Golay Hampel Filter | AlphaNatt
 *
 * A weighted sum of the last `window` closes (weights of a simplified Savitzky-Golay kernel for the polynomial order,
 * over the bars 0 .. window / 2 back, each used for the two symmetric kernel positions), divided by the sum of the
 * absolute weights. A Hampel test marks the close as an outlier when |close - median| > threshold * 1.4826 * MAD of
 * the window. A second weighted pass uses, on each past bar, the first filter value when that bar was an outlier and
 * the close otherwise; a WMA smooths the result. The line is cyan when it rose on the last two bars and the close is
 * above it or its slope is above 1 % of ATR 14, magenta otherwise.
 * Alerts (alertcondition, `alerts` of the result): 'SG-Hampel Bull Cross' / 'SG-Hampel Bear Cross', the close crossing
 * above / below the line while its slope is above 1 % of ATR 14.
 *
 * Reference: "Savitzky-Golay Hampel Filter | AlphaNatt" by AlphaNatt
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SavitzkyGolayHampelFilterAlphanattInputs {
  /** Polynomial order (2 = quadratic, 3 = cubic, 4-5 = equal weights) */
  polyOrder: number;
  /** Window size (an even value is increased by 1) */
  windowSize: number;
  /** MAD multiplier for the outlier detection */
  hampelThreshold: number;
  /** WMA length of the final smoothing */
  smoothingFactor: number;
}

export const defaultInputs: SavitzkyGolayHampelFilterAlphanattInputs = {
  polyOrder: 2,
  windowSize: 21,
  hampelThreshold: 3.0,
  smoothingFactor: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'polyOrder', type: 'int', title: 'Polynomial Order', defval: 2, min: 2, max: 5 },
  { id: 'windowSize', type: 'int', title: 'Window Size', defval: 21, min: 7, max: 51, step: 2 },
  { id: 'hampelThreshold', type: 'float', title: 'Hampel Threshold', defval: 3.0, min: 1.0, max: 5.0, step: 0.5 },
  { id: 'smoothingFactor', type: 'int', title: 'Final Smoothing', defval: 3, min: 1, max: 7 },
];

const BULL = '#00F1FF';
const BEAR = '#FF019A';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Savitzky-Golay Hampel Filter', color: BULL, lineWidth: 2 },
];

export const metadata = {
  title: 'Savitzky-Golay Hampel Filter | AlphaNatt',
  shortTitle: 'SGHF | AlphaNatt',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const neq = (a: number, b: number) => Math.abs(a - b) > EPS;
const nz = (x: number, y = 0) => (isNaN(x) ? y : x);

/** getSGCoeff(i, order, window_) */
function sgCoeff(i: number, order: number, window: number): number {
  const center = Math.floor(window / 2);
  const norm = (window * (window * window - 1)) / 12;
  if (order === 2) {
    const coeff = -center + i;
    const weight = 3 * window * (window + 1) - 7 - 20 * coeff * coeff;
    return weight / (4 * norm);
  } else if (order === 3) {
    const coeff = i - center;
    const h = coeff * coeff;
    return (315 + h * (-420 + h * 48)) / 320;
  }
  return 1.0 / window;
}

/** array.median of an array without na values */
function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SavitzkyGolayHampelFilterAlphanattInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);
  const closeAt = (i: number) => (i >= 0 ? close[i] : NaN); // close[k] before the first bar is na

  const window = cfg.windowSize % 2 === 0 ? cfg.windowSize + 1 : cfg.windowSize;
  const halfWindow = Math.floor(window / 2);
  const weights: number[] = [];
  let sumWeights = 0.0;
  for (let k = 0; k < window; k++) {
    weights.push(sgCoeff(k, cfg.polyOrder, window));
    sumWeights += Math.abs(weights[k]);
  }

  const sgFilter: number[] = new Array(n);
  const isOutlier: boolean[] = new Array(n);
  const sgFinal: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let sg = 0.0;
    for (let k = 0; k < window; k++) {
      const back = Math.abs(k - halfWindow);
      sg += nz(closeAt(i - back)) * weights[k];
    }
    sgFilter[i] = neq(sumWeights, 0) ? sg / sumWeights : close[i];

    // Hampel filter: median and MAD of nz(close[k], close) over the window
    const win: number[] = [];
    for (let k = 0; k < window; k++) win.push(nz(closeAt(i - k), close[i]));
    const med = median(win);
    let mad = median(win.map((v) => Math.abs(v - med)));
    mad = eq(mad, 0) ? 0.001 : mad;
    isOutlier[i] = gt(Math.abs(close[i] - med), cfg.hampelThreshold * 1.4826 * mad);
    const cleanedPrice = isOutlier[i] ? sgFilter[i] : close[i];

    // Second pass: isOutlier[k] ? sgFilter[k] : nz(close[k], close) (isOutlier before the first bar is false)
    let fin = 0.0;
    for (let k = 0; k < window; k++) {
      const back = Math.abs(k - halfWindow);
      const j = i - back;
      const price = j >= 0 && isOutlier[j] ? sgFilter[j] : nz(closeAt(j), close[i]);
      fin += price * weights[k];
    }
    sgFinal[i] = neq(sumWeights, 0) ? fin / sumWeights : cleanedPrice;
  }

  const finalFilter = A(ta.wma(Series.fromArray(bars, sgFinal), cfg.smoothingFactor));
  const atr = A(ta.atr(bars, 14));
  const ff = (i: number) => (i >= 0 ? finalFilter[i] : NaN);

  const crossUp = crossedOver(close, finalFilter);
  const crossDown = crossedUnder(close, finalFilter);
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  const plot0 = bars.map((b, i) => {
    const firstDerivative = ff(i) - ff(i - 1);
    // A plain division: ATR 0 gives +-infinity (0 / 0 na), as in Pine
    const trendStrength = (Math.abs(firstDerivative) / atr[i]) * 100;
    const strongTrend = gt(trendStrength, 1.0);
    // alertcondition(ta.crossover(close, finalFilter) and strongTrend, ...) / ta.crossunder(...) and strongTrend
    bullFlags.push(crossUp[i] && strongTrend);
    bearFlags.push(crossDown[i] && strongTrend);
    const priceAbove = gt(b.close, ff(i));
    const rising = gt(ff(i), ff(i - 1)) && gt(ff(i - 1), ff(i - 2));
    const bullish = (rising && priceAbove) || (rising && strongTrend);
    return { time: b.time, value: ff(i), color: bullish ? BULL : BEAR };
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'SG-Hampel Bull Cross', message: 'Price crossed above filter with strong trend' },
  { id: 'alert1', title: 'SG-Hampel Bear Cross', message: 'Price crossed below filter with strong trend' },
];

export const SavitzkyGolayHampelFilterAlphanatt = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
