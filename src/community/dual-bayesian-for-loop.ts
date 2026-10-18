/**
 * Dual Bayesian For Loop
 *
 * Loop score: the mean of +1 / -1 over i = loopStart..lookback, +1 when the source is above source[i].
 * A Bayesian update with a 0.5 prior and an evidence of 0.7 (value > 0) or 0.3 (otherwise) gives the short-term
 * probability of the loop score and the long-term probability of the SMA of the loop score over `length` bars.
 * The signal is the EMA(2) of the mean of both probabilities (in %): +1 above 50, -1 otherwise. It is drawn as
 * circles with a fill to zero, the price bars take its colour, and L / S markers show the crosses of zero.
 * Alerts (alertcondition, `alerts` of the result): 'Dual Bayesian Bullish Cross' / 'Dual Bayesian Bearish Cross', true
 * on the crosses of zero of the signal.
 *
 * Reference: "Dual Bayesian For Loop [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DualBayesianForLoopInputs {
  /** Price source */
  source: SourceType;
  /** Length of the long-term probability (SMA of the loop score) */
  length: number;
  /** First offset of the loop */
  loopstart: number;
  /** Last offset of the loop */
  lookback: number;
  bullCol: string;
  bearCol: string;
  /** Colour the price bars with the signal */
  showBars: boolean;
}

export const defaultInputs: DualBayesianForLoopInputs = {
  source: 'hlc3',
  length: 14,
  loopstart: 1,
  lookback: 70,
  bullCol: '#00ffaa',
  bearCol: '#ff0000',
  showBars: true,
};

const CORE = '════════ Core Settings ════════';
const VISUAL = '════════ Visualization Settings ════════';

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'hlc3', group: CORE },
  { id: 'length', type: 'int', title: 'Length', defval: 14, min: 1, group: CORE },
  { id: 'loopstart', type: 'int', title: 'Loop Start', defval: 1, min: 1, group: CORE },
  { id: 'lookback', type: 'int', title: 'Loop Lookback', defval: 70, min: 1, group: CORE },
  { id: 'bullCol', type: 'color', title: 'Bullish Color', defval: '#00ffaa', group: VISUAL },
  { id: 'bearCol', type: 'color', title: 'Bearish Color', defval: '#ff0000', group: VISUAL },
  { id: 'showBars', type: 'bool', title: 'Color Bars', defval: true, group: VISUAL },
];

const MID_COL = String(color.new(color.white, 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Bullish Level', color: '#00ffaa', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Bearish Level', color: '#ff0000', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Signal', color: '#00ffaa', lineWidth: 5, style: 'circles' },
  { id: 'plot3', title: 'Zero Line for Fill', color: MID_COL, lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Dual Bayesian For Loop [QuantAlgo]',
  shortTitle: 'Dual Bayesian For Loop [QuantAlgo]',
  overlay: false,
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;

/** bayesian_calc: prior 0.5, evidence 0.7 when the value is > 0 (na: 0.3) */
function bayesian(v: number): number {
  const evidence = gt(v, 0) ? 0.7 : 0.3;
  const prior = 0.5;
  return (prior * evidence) / (prior * evidence + (1 - prior) * (1 - evidence));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DualBayesianForLoopInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.source));

  // forloop_analysis: for i = loopstart to lookback (a Pine for loop counts down when loopstart > lookback);
  // source[i] is na before the first bar, so the comparison is false (-1)
  const step = cfg.lookback >= cfg.loopstart ? 1 : -1;
  const count = cfg.lookback - cfg.loopstart + 1;
  const loopScore = src.map((s, t) => {
    let sum = 0;
    for (let i = cfg.loopstart; step > 0 ? i <= cfg.lookback : i >= cfg.lookback; i += step) {
      sum += t - i >= 0 && gt(s, src[t - i]) ? 1 : -1;
    }
    // loop start = lookback + 1: sum / 0 is +-infinity (the > 0 test uses it) or na for 0 / 0
    return sum / count;
  });

  // ta.sma treats +-infinity as na
  const loopSma = A(ta.sma(S(loopScore.map((v) => (Number.isFinite(v) ? v : NaN))), cfg.length));
  const final = loopScore.map((v, i) => (bayesian(v) * 100 + bayesian(loopSma[i]) * 100) / 2);
  const signal = A(ta.ema(S(final), 2));
  const binary = signal.map((v) => (gt(v, 50) ? 1 : -1));

  const bullFill = String(color.new(cfg.bullCol, 10));
  const bearFill = String(color.new(cfg.bearCol, 10));
  const sigColor = (i: number) => (binary[i] > 0 ? cfg.bullCol : cfg.bearCol);

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // ta.crossover(binary_signal, 0) / ta.crossunder(binary_signal, 0)
    bullFlags.push(i > 0 && binary[i] > 0 && binary[i - 1] <= 0);
    bearFlags.push(i > 0 && binary[i] < 0 && binary[i - 1] >= 0);
    if (bullFlags[i]) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: cfg.bullCol, text: '𝑳',
        textColor: cfg.bullCol, size: 'tiny', forceOverlay: true });
    }
    if (bearFlags[i]) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: cfg.bearCol, text: '𝑺',
        textColor: cfg.bearCol, size: 'tiny', forceOverlay: true });
    }
    // barcolor(show_bars ? binary_signal > 0 ? bull_col : bear_col : na)
    if (cfg.showBars) barColors.push({ time: t, color: sigColor(i) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b) => ({ time: b.time, value: 1, color: cfg.bullCol })),
      plot1: bars.map((b) => ({ time: b.time, value: -1, color: cfg.bearCol })),
      plot2: bars.map((b, i) => ({ time: b.time, value: binary[i], color: sigColor(i) })),
      plot3: bars.map((b) => ({ time: b.time, value: 0, color: MID_COL })),
    },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: MID_COL, linestyle: 'dashed', linewidth: 1 } }],
    // fill(z, mid, binary > 0 ? binary : 0, binary > 0 ? 0 : binary,
    //      binary > 0 ? color.new(bull_col, 10) : na, binary > 0 ? na : color.new(bear_col, 10))
    fills: [{
      plot1: 'plot2',
      plot2: 'plot3',
      options: { title: 'Plots Background' },
      gradient: {
        topValue: binary.map((v) => (v > 0 ? v : 0)),
        bottomValue: binary.map((v) => (v > 0 ? 0 : v)),
        topColor: binary.map((v) => (v > 0 ? bullFill : null)),
        bottomColor: binary.map((v) => (v > 0 ? null : bearFill)),
      },
    }],
    markers,
    barColors,
    // alertcondition(ta.crossover(binary_signal, 0)) / alertcondition(ta.crossunder(binary_signal, 0))
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Dual Bayesian Bullish Cross', message: 'Dual Bayesian Bullish Cross {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Dual Bayesian Bearish Cross', message: 'Dual Bayesian Bearish Cross {{exchange}}:{{ticker}}' },
];

export const DualBayesianForLoop = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
