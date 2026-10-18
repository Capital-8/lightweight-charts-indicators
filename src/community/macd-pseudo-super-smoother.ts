/**
 * MACD Pseudo Super Smoother [MACDPSS]
 *
 * A MACD where the moving averages are FIR filters that imitate a super smoother. Four filter types:
 * - Type 1: weights decay * y * exp(-y / period) over 3 * length bars, period = (length + 1) * 1.5,
 *   decay = exp(-sqrt(2) * pi / period * y), y = i + 1.
 * - Type 2: weights decay * (cos + sin)(arg * y) * y * exp(-y / length) over 3 * length bars,
 *   period = (length + 1) * 2.5, arg = sqrt(2) * pi / period.
 * - Type 3: weights sin(pi / z * y) * exp(-|i - z / 4| / z * 2) over 3 * length bars, z = length * 1.25.
 * - Type 4: a shaped window over `length` bars applied to the average of the source and the previous source.
 * Bars before the first bar use the first non-na source. MACD = fast filter - slow filter, signal = filter of the
 * MACD, histogram = MACD - signal, coloured by its sign and by its direction.
 * Alerts (alertcondition, `alerts` of the result): 'Rising to falling' (the histogram turns negative) and 'Falling to
 * rising' (it turns positive).
 *
 * Reference: "MACD Pseudo Super Smoother [MACDPSS]" by The_Peaceful_Lizard
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © The_Peaceful_Lizard
 */

import {
  getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar,
  type SourceType,
} from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type MacdPssFilterType = 'Type 1' | 'Type 2' | 'Type 3' | 'Type 4';

export interface MacdPseudoSuperSmootherInputs {
  source: SourceType;
  fastLength: number;
  slowLength: number;
  /** Signal smoothing length */
  signalLength: number;
  /** Filter type of the fast and slow lines */
  oscillatorStyle: MacdPssFilterType;
  /** Filter type of the signal line */
  smoothingStyle: MacdPssFilterType;
}

export const defaultInputs: MacdPseudoSuperSmootherInputs = {
  source: 'close',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  oscillatorStyle: 'Type 1',
  smoothingStyle: 'Type 2',
};

const FILTER_TYPES: MacdPssFilterType[] = ['Type 1', 'Type 2', 'Type 3', 'Type 4'];

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26, min: 2 },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1, max: 50 },
  { id: 'oscillatorStyle', type: 'string', title: 'Oscillator MA Type', defval: 'Type 1', options: FILTER_TYPES },
  { id: 'smoothingStyle', type: 'string', title: 'Signal Line MA Type', defval: 'Type 2', options: FILTER_TYPES },
];

const UP_STRONG = '#26A69A';
const UP_WEAK = '#B2DFDB';
const DOWN_WEAK = '#FFCDD2';
const DOWN_STRONG = '#FF5252';
const ZERO_LINE = String(color.new('#787B86', 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Histogram', color: UP_STRONG, lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'MACD', color: '#2962FF', lineWidth: 1 },
  { id: 'plot2', title: 'Signal', color: '#FF6D00', lineWidth: 1 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero Line', color: ZERO_LINE, linestyle: 'dashed' },
];

export const metadata = {
  title: 'MACD Pseudo Super Smoother [MACDPSS]',
  shortTitle: 'MACD Pseudo Super Smoother [MACDPSS]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** Pine na(): +-infinity is na too */
const isNa = (x: number) => !Number.isFinite(x);

// FIR weights (fir1 .. fir4 of the Pine script)
const fir1 = (x: number, length: number) => {
  const y = x + 1;
  const period = (length + 1) * 1.5;
  const arg = (Math.sqrt(2) * Math.PI) / period;
  const decay = Math.exp(-arg * y);
  return decay * y * Math.exp(-y / period);
};

const fir2 = (x: number, length: number) => {
  const y = x + 1;
  const period = (length + 1) * 2.5;
  const arg = (Math.sqrt(2) * Math.PI) / period;
  const decay = Math.exp(-arg * y);
  const cosTerm = Math.cos(arg * y);
  const sinTerm = Math.sin(arg * y);
  return decay * (cosTerm + sinTerm) * y * Math.exp(-y / length);
};

const fir3 = (x: number, length: number) => {
  const y = x + 1;
  const z = length * 1.25;
  return Math.sin((Math.PI / z) * y) * Math.exp(((-Math.abs(x - z / 4)) / z) * 2);
};

const fir4 = (x: number, length: number, shape: number, overshoot: number) => {
  const y = x / length;
  const phase = Math.PI / (10.0 / 3.0);
  const pi3 = Math.PI / 3;
  const sqrt = Math.pow(y, shape);
  const iSqrt = Math.pow(1 - y, shape);
  // y <= 0.2 (Pine comparison within 1e-10)
  const startUp = !(y - 0.2 > EPS) ? Math.pow(Math.cos(1.5 * Math.PI * y - phase), 4 / 3.0) : 1;
  const speed = -Math.pow(Math.cos(0.5 * Math.PI * y - pi3), 12) * overshoot * sqrt * iSqrt;
  return iSqrt * startUp + speed;
};

/**
 * One call site of pseudo_ss1 / 2 / 3 / 4 on every bar: sum(nz(src[i], first_nz) * w(i)) / sum(w(i)).
 * `var float first_nz` is the first non-na source of this call site.
 */
function pseudoSuperSmoother(source: number[], length: number, style: MacdPssFilterType): number[] {
  const n = source.length;
  let src = source;
  let weights: number[];
  if (style === 'Type 4') {
    // src = math.avg(source, source[1]); fir4(i, length, shape = 1.5, overshoot = 2.2) over length bars
    src = source.map((v, t) => (t > 0 ? (v + source[t - 1]) / 2 : NaN));
    weights = Array.from({ length }, (_v, i) => fir4(i, length, 1.5, 2.2));
  } else {
    const fir = style === 'Type 1' ? fir1 : style === 'Type 2' ? fir2 : fir3;
    weights = Array.from({ length: length * 3 }, (_v, i) => fir(i, length));
  }
  const out = new Array<number>(n).fill(NaN);
  let firstNz = NaN;
  for (let t = 0; t < n; t++) {
    if (isNa(firstNz) && !isNa(src[t])) firstNz = src[t];
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i];
      weight += w;
      const v = t - i >= 0 ? src[t - i] : NaN;
      sum += (isNa(v) ? firstNz : v) * w;
    }
    out[t] = sum / weight;
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdPseudoSuperSmootherInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const source = getSourceSeries(bars, cfg.source).toArray().map((v) => v ?? NaN);

  const fastMa = pseudoSuperSmoother(source, cfg.fastLength, cfg.oscillatorStyle);
  const slowMa = pseudoSuperSmoother(source, cfg.slowLength, cfg.oscillatorStyle);
  const macd = fastMa.map((v, i) => v - slowMa[i]);
  const signal = pseudoSuperSmoother(macd, cfg.signalLength, cfg.smoothingStyle);
  const hist = macd.map((v, i) => v - signal[i]);

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const histNa = hist.map(fin);
  // alertcondition(hist[1] >= 0 and hist < 0, "Rising to falling") / alertcondition(hist[1] <= 0 and hist > 0, ...)
  const le0 = (v: number) => !isNaN(v) && !(v > EPS);
  const toFalling = histNa.map((h, i) => i > 0 && ge(histNa[i - 1], 0) && lt(h, 0));
  const toRising = histNa.map((h, i) => i > 0 && le0(histNa[i - 1]) && h > EPS);
  // hist >= 0 ? (hist[1] < hist ? #26A69A : #B2DFDB) : (hist[1] < hist ? #FFCDD2 : #FF5252)
  const plot0 = bars.map((b, i) => {
    const h = hist[i];
    const rising = i > 0 && lt(hist[i - 1], h);
    const c = ge(h, 0) ? (rising ? UP_STRONG : UP_WEAK) : rising ? DOWN_WEAK : DOWN_STRONG;
    return { time: b.time, value: fin(h), color: c };
  });
  const plot1 = bars.map((b, i) => ({ time: b.time, value: fin(macd[i]), color: '#2962FF' }));
  const plot2 = bars.map((b, i) => ({ time: b.time, value: fin(signal[i]), color: '#FF6D00' }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: ZERO_LINE, linestyle: 'dashed' } }],
    alerts: alertStates(alertConditions, bars, [toFalling, toRising]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Rising to falling', message: 'The MACD histogram switched from a rising to falling state' },
  { id: 'alert1', title: 'Falling to rising', message: 'The MACD histogram switched from a falling to rising state' },
];

export const MacdPseudoSuperSmoother = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
