/**
 * Dual MA SD Oscillator
 *
 * The spread between a fast and a slow EMA of the source, smoothed by an EMA, drawn as columns. Bands at plus and
 * minus the standard deviation of the spread. The trend state turns bullish when the spread closes above the upper
 * band and bearish when it closes below the lower band; it colours the columns and the price bars, and BULL / BEAR
 * triangles on the price pane mark the first bar of a new state.
 * Alerts (alertcondition, `alerts` of the result): 'Bull Signal' / 'Bear Signal', true on the first bar of a new
 * state (also with the signals hidden).
 *
 * Reference: "Dual MA SD Oscillator" by SchizoQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © SchizoQuant
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DualMaSdOscillatorInputs {
  /** Price source of the fast and slow EMAs */
  src: SourceType;
  /** Fast EMA length */
  maFast: number;
  /** Slow EMA length */
  maSlow: number;
  /** EMA length of the spread smoothing */
  maSmooth: number;
  /** Standard deviation length of the upper band */
  upperSDLen: number;
  /** Standard deviation length of the lower band */
  lowerSDLen: number;
  showSignals: boolean;
  colorBars: boolean;
  longColor: string;
  shortColor: string;
}

export const defaultInputs: DualMaSdOscillatorInputs = {
  src: 'close',
  maFast: 1,
  maSlow: 30,
  maSmooth: 1,
  upperSDLen: 25,
  lowerSDLen: 25,
  showSignals: true,
  colorBars: true,
  longColor: 'rgb(57, 255, 20)',
  shortColor: 'rgb(138, 43, 226)',
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: 'MA Settings' },
  { id: 'maFast', type: 'int', title: 'Fast Length', defval: 1, min: 1, group: 'MA Settings' },
  { id: 'maSlow', type: 'int', title: 'Slow Length', defval: 30, min: 1, group: 'MA Settings' },
  { id: 'maSmooth', type: 'int', title: 'Smooth Length', defval: 1, min: 1, group: 'Smoothing' },
  { id: 'upperSDLen', type: 'int', title: 'Upper SD Length', defval: 25, min: 1, group: 'Standard Deviation' },
  { id: 'lowerSDLen', type: 'int', title: 'Lower SD Length', defval: 25, min: 1, group: 'Standard Deviation' },
  { id: 'showSignals', type: 'bool', title: 'Show Signals', defval: true, group: 'Visualization' },
  { id: 'colorBars', type: 'bool', title: 'Color Bars', defval: true, group: 'Visualization' },
  { id: 'longColor', type: 'color', title: 'Bullish Color', defval: 'rgb(57, 255, 20)', group: 'Color Settings', inline: '1' },
  { id: 'shortColor', type: 'color', title: 'Bearish Color', defval: 'rgb(138, 43, 226)', group: 'Color Settings', inline: '1' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper SD Band', color: String(color.new('rgb(57, 255, 20)', 45)), lineWidth: 1 },
  { id: 'plot1', title: 'Lower SD Band', color: String(color.new('rgb(138, 43, 226)', 45)), lineWidth: 1 },
  { id: 'plot2', title: 'Histogram', color: String(color.new('rgb(57, 255, 20)', 70)), lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'Dual MA SD Oscillator',
  shortTitle: 'Dual MA SD Oscillator',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<DualMaSdOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = getSourceSeries(bars, cfg.src);

  const fastMA = A(ta.ema(src, cfg.maFast));
  const slowMA = A(ta.ema(src, cfg.maSlow));
  const spread = fastMA.map((f, i) => f - slowMA[i]);
  const smoothedMA = A(ta.ema(S(spread), cfg.maSmooth));
  const upperBand = A(ta.stdev(S(smoothedMA), cfg.upperSDLen));
  const lowerBand = A(ta.stdev(S(smoothedMA), cfg.lowerSDLen)).map((v) => -v);

  const longCol = cfg.longColor;
  const shortCol = cfg.shortColor;
  const upperCol = String(color.new(longCol, 45));
  const lowerCol = String(color.new(shortCol, 45));
  const histLong = String(color.new(longCol, 70));
  const histShort = String(color.new(shortCol, 70));

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: Array<{ time: number; value: number; color: string }> = [];
  const plot2: Array<{ time: number; value: number; color: string }> = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];
  let sq = 0; // var int SQ = 0
  let prevSq = NaN; // SQ[1] (na on the first bar)
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    if (gt(smoothedMA[i], upperBand[i])) sq = 1; // long
    if (lt(smoothedMA[i], lowerBand[i])) sq = -1; // short
    // SQ[1] != 1 is false when SQ[1] is na (first bar)
    const longSignal = sq === 1 && !isNaN(prevSq) && prevSq !== 1;
    const shortSignal = sq === -1 && !isNaN(prevSq) && prevSq !== -1;
    const col = sq === 1 ? longCol : shortCol;
    longFlags.push(longSignal);
    shortFlags.push(shortSignal);

    plot0.push({ time: t, value: upperBand[i], color: upperCol });
    plot1.push({ time: t, value: lowerBand[i], color: lowerCol });
    plot2.push({ time: t, value: smoothedMA[i], color: sq === 1 ? histLong : histShort });
    // plotshape(showSignals and longSignal, 'Bull Signal', shape.triangleup, location.belowbar, size.small,
    //   force_overlay = true, text = 'BULL', textcolor = color.white)
    if (cfg.showSignals && longSignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: longCol, size: 'small', text: 'BULL',
        textColor: color.white, forceOverlay: true });
    }
    if (cfg.showSignals && shortSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: shortCol, size: 'small', text: 'BEAR',
        textColor: color.white, forceOverlay: true });
    }
    // barcolor(colorBars ? col : na)
    if (cfg.colorBars) barColors.push({ time: t, color: col });
    prevSq = sq;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dashed' } }],
    // fill(upperPlot, lowerPlot, title = 'SD Band Fill', color = color.new(color.gray, 93))
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'SD Band Fill' },
      colors: new Array<string>(n).fill(String(color.new(color.gray, 93))) }],
    markers,
    barColors,
    // alertcondition(longSignal, "Bull Signal") / alertcondition(shortSignal, "Bear Signal")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bull Signal', message: 'Dual MA SD Oscillator Bull Signal on {{ticker}}' },
  { id: 'alert1', title: 'Bear Signal', message: 'Dual MA SD Oscillator Bear Signal on {{ticker}}' },
];

export const DualMaSdOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
