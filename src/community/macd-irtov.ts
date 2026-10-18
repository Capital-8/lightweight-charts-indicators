/**
 * MACD (Buy & Sell signals)
 *
 * The standard MACD: macd = MA(src, fast) - MA(src, slow) (EMA or SMA), signal = MA(macd, signalLength) (EMA or SMA),
 * histogram = macd - signal as columns in four colours (above / below zero, rising / falling). A "B" label below
 * the bar when the MACD crosses above the signal and an "S" label above the bar when it crosses below, on the
 * price pane and only on the last 200 bars (Pine show_last = 200).
 * Alerts (alertcondition, `alerts` of the result): 'Rising to falling' (the histogram turns negative) and 'Falling to
 * rising' (it turns positive).
 *
 * Reference: "MACD (Buy & Sell signals)" by irtov
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MacdIrtovInputs {
  fastLength: number;
  slowLength: number;
  src: SourceType;
  /** Signal smoothing length */
  signalLength: number;
  /** Oscillator MA type */
  smaSource: 'SMA' | 'EMA';
  /** Signal line MA type */
  smaSignal: 'SMA' | 'EMA';
}

export const defaultInputs: MacdIrtovInputs = {
  fastLength: 12,
  slowLength: 26,
  src: 'close',
  signalLength: 9,
  smaSource: 'EMA',
  smaSignal: 'EMA',
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1, max: 50 },
  { id: 'smaSource', type: 'string', title: 'Oscillator MA Type', defval: 'EMA', options: ['SMA', 'EMA'] },
  { id: 'smaSignal', type: 'string', title: 'Signal Line MA Type', defval: 'EMA', options: ['SMA', 'EMA'] },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Histogram', color: '#26A69A', style: 'columns' },
  { id: 'plot1', title: 'MACD', color: '#2962FF' },
  { id: 'plot2', title: 'Signal', color: '#FF6D00' },
];

export const metadata = {
  title: 'Moving Average Convergence Divergence',
  shortTitle: 'MACD',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** Pine show_last of the Buy / Sell shapes */
const SHOW_LAST = 200;

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdIrtovInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const src = getSourceSeries(bars, cfg.src);
  const ma = (s: Series, len: number, type: 'SMA' | 'EMA') => A(type === 'SMA' ? ta.sma(s, len) : ta.ema(s, len));
  const fastMa = ma(src, cfg.fastLength, cfg.smaSource);
  const slowMa = ma(src, cfg.slowLength, cfg.smaSource);
  const macd = fastMa.map((f, i) => f - slowMa[i]);
  const signal = ma(S(macd), cfg.signalLength, cfg.smaSignal);
  const hist = macd.map((m, i) => m - signal[i]);
  const buy = A(ta.crossover(S(macd), S(signal)));
  const sell = A(ta.crossunder(S(macd), S(signal)));

  // alertcondition(hist[1] >= 0 and hist < 0, "Rising to falling") / alertcondition(hist[1] <= 0 and hist > 0, ...)
  const le0 = (v: number) => !isNaN(v) && !(v > EPS);
  const toFalling = hist.map((h, i) => i > 0 && ge(hist[i - 1], 0) && lt(h, 0));
  const toRising = hist.map((h, i) => i > 0 && le0(hist[i - 1]) && h > EPS);

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const plot0 = bars.map((b, i) => {
    const prev = i > 0 ? hist[i - 1] : NaN;
    const rising = lt(prev, hist[i]);
    const c = ge(hist[i], 0) ? (rising ? '#26A69A' : '#B2DFDB') : (rising ? '#FFCDD2' : '#FF5252');
    return { time: b.time, value: fin(hist[i]), color: c };
  });
  const plot1 = bars.map((b, i) => ({ time: b.time, value: fin(macd[i]) }));
  const plot2 = bars.map((b, i) => ({ time: b.time, value: fin(signal[i]) }));

  // plotshape(buy / sell, shape.labelup / labeldown, location.belowbar / abovebar, size.tiny, force_overlay = true,
  // show_last = 200): only the shapes of the last 200 bars are drawn
  const markers: MarkerData[] = [];
  for (let i = Math.max(0, n - SHOW_LAST); i < n; i++) {
    const time = bars[i].time;
    if (buy[i]) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: String(color.new('#069981', 0)),
        size: 'tiny', text: 'B', textColor: color.white, forceOverlay: true });
    }
    if (sell[i]) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: String(color.new(color.red, 0)),
        size: 'tiny', text: 'S', textColor: color.white, forceOverlay: true });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    hlines: [
      { value: 0, options: { title: 'Zero Line', color: String(color.new('#787B86', 50)), linestyle: 'dashed' } },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [toFalling, toRising]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Rising to falling', message: 'The MACD histogram switched from a rising to falling state' },
  { id: 'alert1', title: 'Falling to rising', message: 'The MACD histogram switched from a falling to rising state' },
];

export const MacdIrtov = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
