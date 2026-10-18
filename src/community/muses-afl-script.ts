/**
 * L1 Filter Sig
 *
 * L1 proximal filter: a prediction z[1] + v[1] is pulled toward the source by mu; the step from z[1] is shrunk by a
 * threshold of ATR(200) * multiplier (soft thresholding: steps smaller than the threshold give a velocity of 0).
 * The trend is 1 while the filter rises, -1 while it falls. The filter and the source are coloured by the trend
 * with a fill between them; BUY / SELL arrows mark the trend changes.
 *
 * Alerts (alertcondition, `alerts` of the result): "Buy Alert" (buySignal) and "Sell Alert" (sellSignal).
 *
 * Reference: "Muses afl script" by mostafa47ab (indicator title "L1 Filter Sig")
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'L1 Filter BUY Signal!' },
  { id: 'alert1', title: 'Sell Alert', message: 'L1 Filter SELL Signal!' },
];

export interface MusesAflScriptInputs {
  src: SourceType;
  /** ATR multiplier of the threshold */
  atrMult: number;
  /** Pull of the prediction toward the source (0..1) */
  mu: number;
  showSignals: boolean;
}

export const defaultInputs: MusesAflScriptInputs = {
  src: 'close',
  atrMult: 1.5,
  mu: 0.6,
  showSignals: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'atrMult', type: 'float', title: 'ATR Mult', defval: 1.5, min: 0, step: 0.1 },
  { id: 'mu', type: 'float', title: 'μ', defval: 0.6, min: 0, max: 1, step: 0.1 },
  { id: 'showSignals', type: 'bool', title: 'Signals', defval: true },
];

const BULL_COLOR = '#089981';
const BEAR_COLOR = '#f23645';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Filter', color: BULL_COLOR, lineWidth: 3 },
  { id: 'plot1', title: 'Src', color: BULL_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: 'L1 Filter Sig',
  shortTitle: 'L1Filter',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<MusesAflScriptInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.src));
  const atr = A(ta.atr(bars, 200));

  const z: number[] = new Array(n);
  const trend: number[] = new Array(n);
  let v = 0.0;
  let tr = 0;
  for (let i = 0; i < n; i++) {
    const threshold = atr[i] * cfg.atrMult;
    if (i === 0) z[i] = src[i];
    else {
      const zPrev = z[i - 1];
      const vPrev = v; // v[1]
      const zPred = zPrev + vPrev;
      const zTemp = zPred + cfg.mu * (src[i] - zPred);
      const diff = zTemp - zPrev;
      if (gt(Math.abs(diff), threshold)) v = Math.sign(diff) * (Math.abs(diff) - threshold);
      else v = 0.0;
      z[i] = zPrev + v;
    }
    // trend: z > z[1] -> 1, z < z[1] -> -1, else unchanged
    const zp = i > 0 ? z[i - 1] : NaN;
    if (gt(z[i], zp)) tr = 1;
    else if (lt(z[i], zp)) tr = -1;
    trend[i] = tr;
  }

  const zColor = (i: number) => (trend[i] === 1 ? BULL_COLOR : BEAR_COLOR);
  const markers: MarkerData[] = [];
  // buySignal = showSignals and upChange / sellSignal = showSignals and downChange
  const buySignal: boolean[] = new Array(n).fill(false);
  const sellSignal: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    if (!cfg.showSignals) break;
    buySignal[i] = trend[i] === 1 && trend[i - 1] === -1;
    sellSignal[i] = trend[i] === -1 && trend[i - 1] === 1;
    if (trend[i] === 1 && trend[i - 1] === -1) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'arrowUp', color: BULL_COLOR, size: 'large',
        text: 'BUY', textColor: '#2962FF' });
    }
    if (trend[i] === -1 && trend[i - 1] === 1) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'arrowDown', color: BEAR_COLOR, size: 'large',
        text: 'SELL', textColor: '#2962FF' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: z[i], color: zColor(i) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: src[i], color: String(color.new(zColor(i), 0)) })),
    },
    // fill(plotZ, plotSrc, color = color.new(zColor, 90))
    fills: [{ plot1: 'plot0', plot2: 'plot1', colors: bars.map((_b, i) => String(color.new(zColor(i), 90))) }],
    markers,
    alerts: alertStates(alertConditions, bars, [buySignal, sellSignal]),
  };
}

export const MusesAflScript = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
