/**
 * Sequential Pattern Strength
 *
 * Counts runs of higher closes (up sequence) and lower closes (down sequence); an unchanged close shortens the
 * current run by one. The sequence quality is the run length divided by the bars since the run started, and the
 * price extension is the % move from the close before the run. Both sequences reset when the run reaches the
 * maximum length or the extension passes the reset threshold times the run length. Pattern strength =
 * sequence * quality * (1 + |extension| / 10), plus 10 times the 5-bar SMA momentum in % of close, smoothed by an
 * EMA. Drawn as a histogram and a glowing line; gradient zones between +-2 * max length and +-50.
 * Alerts (alertcondition, `alerts` of the result): the signal (the previous bar's with the confirmed bars option)
 * turning positive / negative and crossing above +2 * max length / below -2 * max length.
 *
 * Last bar: with the confirmed bars option the signal plots are na on an open bar. The port reads the state of the
 * last bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Sequential Pattern Strength [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © QuantAlgo
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SequentialPatternStrengthInputs {
  /** Maximum sequence length before the pattern resets */
  maxSequence: number;
  /** Price move (%) per sequence bar that resets the pattern */
  resetThreshold: number;
  /** EMA length of the signal */
  smooth: number;
  /** Use confirmed bars only (the plots are hidden on an unconfirmed bar; all bars given to the port are confirmed) */
  useConfirmedBars: boolean;
  bullishColor: string;
  bearishColor: string;
  /** Transparency of the histogram columns */
  columnTransparency: number;
  /** Colour the price bars by the signal sign */
  colorCandles: boolean;
}

export const defaultInputs: SequentialPatternStrengthInputs = {
  maxSequence: 9,
  resetThreshold: 0.3,
  smooth: 3,
  useConfirmedBars: false,
  bullishColor: '#00ffaa',
  bearishColor: '#ff0000',
  columnTransparency: 65,
  colorCandles: false,
};

const PATTERN = '════════ Pattern Settings ════════';
const COLORS = '════════ Color Options ════════';

export const inputConfig: InputConfig[] = [
  { id: 'maxSequence', type: 'int', title: 'Max Sequence Length', defval: 9, group: PATTERN },
  { id: 'resetThreshold', type: 'float', title: 'Reset Threshold %', defval: 0.3, step: 0.1, group: PATTERN },
  { id: 'smooth', type: 'int', title: 'Pattern Smoothing', defval: 3, group: PATTERN },
  { id: 'useConfirmedBars', type: 'bool', title: 'Use Confirmed Bars Only', defval: false, group: PATTERN },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#00ffaa', group: COLORS },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: '#ff0000', group: COLORS },
  { id: 'columnTransparency', type: 'int', title: 'Background Column Transparency', defval: 65, min: 0, max: 100, group: COLORS },
  { id: 'colorCandles', type: 'bool', title: 'Color Price Candles', defval: false, group: COLORS },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Signal Histogram', color: String(color.new('#00ffaa', 65)), lineWidth: 1, style: 'histogram' },
  { id: 'plot1', title: 'SPS Signal', color: '#00ffaa', lineWidth: 3 },
  { id: 'plot2', title: 'Signal Glow', color: String(color.new('#00ffaa', 85)), lineWidth: 10, display: 'pane' },
  { id: 'plot3', title: 'Signal Outer Glow', color: String(color.new('#00ffaa', 98)), lineWidth: 25, display: 'pane' },
  { id: 'plot4', title: 'Upper Threshold', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Upper Level', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Lower Threshold', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'Lower Level', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Sequential Pattern Strength [QuantAlgo]',
  shortTitle: 'Sequential Pattern Strength [QuantAlgo]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<SequentialPatternStrengthInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  let upSequence = 0; // var int
  let downSequence = 0; // var int
  let sequenceStartPrice = n > 0 ? close[0] : NaN; // var float sequenceStartPrice = close (first bar)
  let lastStart = NaN; // ta.valuewhen(upSequence == 1 or downSequence == 1, bar_index, 0)
  const patternStrength: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? close[i - 1] : NaN;
    if (gt(close[i], prev)) {
      if (upSequence === 0) sequenceStartPrice = prev;
      upSequence += 1;
      downSequence = 0;
    } else if (lt(close[i], prev)) {
      if (downSequence === 0) sequenceStartPrice = prev;
      downSequence += 1;
      upSequence = 0;
    } else {
      if (upSequence > 0) upSequence = Math.max(0, upSequence - 1);
      if (downSequence > 0) downSequence = Math.max(0, downSequence - 1);
    }
    const currentSequence = upSequence > 0 ? upSequence : -downSequence;
    const perfectMoves = Math.max(upSequence, downSequence);
    // bar_index differences do not depend on the first bar index
    if (upSequence === 1 || downSequence === 1) lastStart = i;
    const totalMoves = Math.abs(i - lastStart);
    const sequenceQuality = gt(totalMoves, 0) ? perfectMoves / totalMoves : 1.0;
    const priceExtension = ((close[i] - sequenceStartPrice) / sequenceStartPrice) * 100;
    const isExhausted = ge(Math.abs(currentSequence), cfg.maxSequence)
      || gt(Math.abs(priceExtension), cfg.resetThreshold * Math.abs(currentSequence));
    if (isExhausted) {
      upSequence = 0;
      downSequence = 0;
    }
    patternStrength[i] = currentSequence * sequenceQuality * (1 + Math.abs(priceExtension) / 10);
  }

  // momentum = ta.sma(close - close[1], 5) / close * 100
  const sma5 = A(ta.sma(S(close.map((c, i) => (i > 0 ? c - close[i - 1] : NaN))), 5));
  const enhancedSignal = patternStrength.map((p, i) => {
    const v = p + (sma5[i] / close[i]) * 100 * 10;
    return Number.isFinite(v) ? v : NaN;
  });
  const signal = A(ta.ema(S(enhancedSignal), cfg.smooth));

  const bull = cfg.bullishColor;
  const bear = cfg.bearishColor;
  const histBull = String(color.new(bull, cfg.columnTransparency));
  const histBear = String(color.new(bear, cfg.columnTransparency));
  const glowBull = String(color.new(bull, 85));
  const glowBear = String(color.new(bear, 85));
  const outerBull = String(color.new(bull, 98));
  const outerBear = String(color.new(bear, 98));
  const maxThreshold = cfg.maxSequence * 2;

  // show_data = use_confirmed_bars ? barstate.isconfirmed : true; plot(show_data ? signal : na, ...)
  const shown = (i: number) => (cfg.useConfirmedBars && !barIsConfirmed(i) ? NaN : signal[i]);
  const plots: IndicatorResult['plots'] = {
    plot0: bars.map((b, i) => ({ time: b.time, value: shown(i), color: gt(signal[i], 0) ? histBull : histBear })),
    plot1: bars.map((b, i) => ({ time: b.time, value: shown(i), color: gt(signal[i], 0) ? bull : bear })),
    plot2: bars.map((b, i) => ({ time: b.time, value: shown(i), color: gt(signal[i], 0) ? glowBull : glowBear })),
    plot3: bars.map((b, i) => ({ time: b.time, value: shown(i), color: gt(signal[i], 0) ? outerBull : outerBear })),
    plot4: bars.map((b) => ({ time: b.time, value: maxThreshold })),
    plot5: bars.map((b) => ({ time: b.time, value: 50 })),
    plot6: bars.map((b) => ({ time: b.time, value: -maxThreshold })),
    plot7: bars.map((b) => ({ time: b.time, value: -50 })),
  };

  // confirmed_signal = use_confirmed_bars ? signal[1] : signal; confirmed_signal_prev = ... ? signal[2] : signal[1]
  const sig = (i: number) => (i >= 0 ? signal[i] : NaN);
  const lagK = cfg.useConfirmedBars ? 1 : 0;
  const longF: boolean[] = [], shortF: boolean[] = [], obF: boolean[] = [], osF: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const cs = sig(i - lagK);
    const cp = sig(i - lagK - 1);
    longF.push(gt(cs, 0) && le(cp, 0));
    shortF.push(le(cs, 0) && gt(cp, 0));
    obF.push(gt(cs, maxThreshold) && le(cp, maxThreshold));
    osF.push(lt(cs, -maxThreshold) && ge(cp, -maxThreshold));
  }

  const constant = <T>(v: T) => new Array<T>(n).fill(v);
  const barColors: BarColorData[] = cfg.colorCandles
    ? bars.map((b, i) => ({ time: b.time, color: gt(signal[i], 0) ? bull : bear }))
    : [];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [{ value: 0, options: { title: 'Neutral', color: color.gray, linestyle: 'dotted', linewidth: 1 } }],
    fills: [
      // fill(p1, p2, maxThreshold, 50, color.new(bullish_color, 60), na)
      { plot1: 'plot4', plot2: 'plot5', options: { title: 'Upper Zone' }, gradient: {
        topValue: constant(maxThreshold), bottomValue: constant(50),
        topColor: constant<string | null>(String(color.new(bull, 60))), bottomColor: constant<string | null>(null),
      } },
      // fill(p3, p4, -maxThreshold, -50, color.new(bearish_color, 60), na)
      { plot1: 'plot6', plot2: 'plot7', options: { title: 'Lower Zone' }, gradient: {
        topValue: constant(-maxThreshold), bottomValue: constant(-50),
        topColor: constant<string | null>(String(color.new(bear, 60))), bottomColor: constant<string | null>(null),
      } },
    ],
    barColors,
    alerts: alertStates(alertConditions, bars, [longF, shortF, obF, osF]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'SPS Long', message: 'Sequential pattern strength turned positive' },
  { id: 'alert1', title: 'SPS Short', message: 'Sequential pattern strength turned negative' },
  { id: 'alert2', title: 'SPS Overbought', message: 'Sequential pattern strength crossed above overbought level' },
  { id: 'alert3', title: 'SPS Oversold', message: 'Sequential pattern strength crossed below oversold level' },
];

export const SequentialPatternStrength = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
