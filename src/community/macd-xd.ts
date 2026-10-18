/**
 * MACD XD
 *
 * The standard MACD: MACD = MA(src, fast) - MA(src, slow) (EMA or SMA), signal = MA(MACD, signal length) (EMA or SMA),
 * histogram = MACD - signal as columns: dark green above zero and rising, light green above zero and falling, light
 * red below zero and rising, red below zero and falling. Zero line.
 * Alerts (alertcondition, `alerts` of the result): 'Rising to falling' (histogram from >= 0 to < 0) and 'Falling to
 * rising' (histogram from <= 0 to > 0).
 *
 * Reference: "MACD XD" by Zen_Formless
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MacdXdInputs {
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

export const defaultInputs: MacdXdInputs = {
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
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1, max: 50, display: 'data_window' },
  { id: 'smaSource', type: 'string', title: 'Oscillator MA Type', defval: 'EMA', options: ['SMA', 'EMA'], display: 'data_window' },
  { id: 'smaSignal', type: 'string', title: 'Signal Line MA Type', defval: 'EMA', options: ['SMA', 'EMA'], display: 'data_window' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Histogram', color: '#26A69A', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'MACD', color: '#2962FF', lineWidth: 1 },
  { id: 'plot2', title: 'Signal', color: '#FF6D00', lineWidth: 1 },
];

export const metadata = {
  title: 'MACD XD',
  shortTitle: 'MACD XD',
  overlay: false,
};

/** Pine float comparisons: a < b only when b - a > 1e-10; a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdXdInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = getSourceSeries(bars, cfg.src);

  const ma = (s: Series, len: number, type: 'SMA' | 'EMA') => A(type === 'SMA' ? ta.sma(s, len) : ta.ema(s, len));
  const fastMa = ma(src, cfg.fastLength, cfg.smaSource);
  const slowMa = ma(src, cfg.slowLength, cfg.smaSource);
  const macd = fastMa.map((f, i) => f - slowMa[i]);
  const signal = ma(Series.fromArray(bars, macd), cfg.signalLength, cfg.smaSignal);
  const hist = macd.map((m, i) => m - signal[i]);

  const histColor = (i: number) => {
    const prev = i > 0 ? hist[i - 1] : NaN;
    // hist >= 0 ? (hist[1] < hist ? #26A69A : #B2DFDB) : (hist[1] < hist ? #FFCDD2 : #FF5252)
    if (ge(hist[i], 0)) return lt(prev, hist[i]) ? '#26A69A' : '#B2DFDB';
    return lt(prev, hist[i]) ? '#FFCDD2' : '#FF5252';
  };

  // alertcondition(hist[1] >= 0 and hist < 0) / alertcondition(hist[1] <= 0 and hist > 0)
  const toFalling = hist.map((h, i) => i > 0 && ge(hist[i - 1], 0) && lt(h, 0));
  const toRising = hist.map((h, i) => i > 0 && le(hist[i - 1], 0) && gt(h, 0));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: hist[i], color: histColor(i) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: macd[i], color: '#2962FF' })),
      plot2: bars.map((b, i) => ({ time: b.time, value: signal[i], color: '#FF6D00' })),
    },
    hlines: [
      { value: 0, options: { title: 'Zero Line', color: String(color.new('#787B86', 50)), linestyle: 'dashed' } },
    ],
    alerts: alertStates(alertConditions, bars, [toFalling, toRising]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Rising to falling', message: 'The MACD histogram switched from a rising to falling state' },
  { id: 'alert1', title: 'Falling to rising', message: 'The MACD histogram switched from a falling to rising state' },
];

export const MacdXd = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
