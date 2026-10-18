/**
 * Fisher Volume Transform
 *
 * The close is blended with a volume-weighted close (close * volume / SMA(volume)) by the volume weight. The blend
 * is normalised to -0.999..0.999 inside its highest / lowest range over the Fisher period (0 while the range is 0 or
 * na) and Fisher-transformed (0.5 * ln((1 + x) / (1 - x))). The oscillator is 25 * EMA(fisher, smoothing), with an
 * EMA signal line of twice the smoothing. Nine gradient fill layers per side, a histogram with a colour gradient,
 * the oscillator line and the signal line.
 * Alerts (alertcondition, `alerts` of the result): the oscillator crossing zero and crossing the signal line.
 *
 * Reference: "Fisher Volume Transform | AlphaNatt" by AlphaNatt
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FisherVolumeTransformAlphanattInputs {
  fisherPeriod: number;
  volumeWeight: number;
  smoothing: number;
}

export const defaultInputs: FisherVolumeTransformAlphanattInputs = {
  fisherPeriod: 10,
  volumeWeight: 0.7,
  smoothing: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'fisherPeriod', type: 'int', title: 'Fisher Period', defval: 10, min: 5, max: 30 },
  { id: 'volumeWeight', type: 'float', title: 'Volume Weight', defval: 0.7, min: 0.1, max: 1.0, step: 0.1 },
  { id: 'smoothing', type: 'int', title: 'Smoothing', defval: 3, min: 1, max: 10 },
];

const BULL = '#00F1FF';
const BEAR = '#FF019A';
const LAYERS = [1, 0.89, 0.78, 0.67, 0.56, 0.44, 0.33, 0.22, 0.11];
const FILL_TRANSP = [75, 78, 81, 84, 87, 90, 93, 96, 98];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero', color: color.gray, lineWidth: 1 },
  ...LAYERS.map((k, j) => ({ id: `plot${1 + j}`, title: `Positive Layer ${Math.round(k * 100)}%`, color: BULL, lineWidth: 1, display: 'none' as const })),
  ...LAYERS.map((k, j) => ({ id: `plot${10 + j}`, title: `Negative Layer ${Math.round(k * 100)}%`, color: BEAR, lineWidth: 1, display: 'none' as const })),
  { id: 'plot19', title: 'Histogram', color: BULL, lineWidth: 3, style: 'histogram' },
  { id: 'plot20', title: 'Fisher Transform', color: BULL, lineWidth: 2 },
  { id: 'plot21', title: 'Signal', color: String(color.new(BULL, 30)), lineWidth: 1 },
];

export const metadata = {
  title: 'Fisher Volume Transform | AlphaNatt',
  shortTitle: 'FVT | AlphaNatt',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a != b beyond 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<FisherVolumeTransformAlphanattInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { fisherPeriod, volumeWeight, smoothing } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // vwPrice = close * (volume / ta.sma(volume, fisherPeriod)): a plain division (x / 0 is +-infinity, 0 / 0 na)
  const volume = bars.map((b) => b.volume ?? NaN);
  const volSma = A(ta.sma(S(volume), fisherPeriod));
  const blended = bars.map((b, i) => b.close * (1 - volumeWeight) + b.close * (volume[i] / volSma[i]) * volumeWeight);

  // fisherTransform(blendedPrice, fisherPeriod)
  const blendedS = S(blended);
  const highest = A(ta.highest(blendedS, fisherPeriod));
  const lowest = A(ta.lowest(blendedS, fisherPeriod));
  const fisher = blended.map((src, i) => {
    const rangee = highest[i] - lowest[i];
    // rangee != 0 is false when rangee is na: 0
    let normalized = ne(rangee, 0) ? ((src - lowest[i]) / rangee - 0.5) * 2 : 0;
    normalized = Math.max(Math.min(normalized, 0.999), -0.999);
    return 0.5 * Math.log((1 + normalized) / (1 - normalized));
  });
  const fisherSmooth = A(ta.ema(S(fisher), smoothing));
  const osc = fisherSmooth.map((v) => v * 25);
  const signal = A(ta.ema(S(osc), smoothing * 2));

  const time = (i: number) => bars[i].time;
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const P = (f: (i: number) => Point): Point[] => bars.map((_b, i) => f(i));
  const plots: Record<string, Point[]> = {};
  plots.plot0 = P((i) => ({ time: time(i), value: 0, color: color.gray }));
  // p1..p9: showGradient and oscillator > 0 ? oscillator * k : 0; n1..n9: oscillator < 0
  LAYERS.forEach((k, j) => {
    plots[`plot${1 + j}`] = P((i) => ({ time: time(i), value: gt(osc[i], 0) ? fin(osc[i] * k) : 0 }));
  });
  LAYERS.forEach((k, j) => {
    plots[`plot${10 + j}`] = P((i) => ({ time: time(i), value: lt(osc[i], 0) ? fin(osc[i] * k) : 0 }));
  });
  const bullZero = color.new(BULL, 100);
  const bullFull = color.new(BULL, 0);
  const bearFull = color.new(BEAR, 0);
  const bearZero = color.new(BEAR, 100);
  plots.plot19 = P((i) => ({
    time: time(i),
    value: fin(osc[i]),
    color: gt(osc[i], 0)
      ? String(color.from_gradient(osc[i], 0, 100, bullZero, bullFull))
      : String(color.from_gradient(osc[i], -100, 0, bearFull, bearZero)),
  }));
  plots.plot20 = P((i) => ({ time: time(i), value: fin(osc[i]), color: gt(osc[i], 0) ? BULL : BEAR }));
  const sigBull = String(color.new(BULL, 30));
  const sigBear = String(color.new(BEAR, 30));
  plots.plot21 = P((i) => ({ time: time(i), value: fin(signal[i]), color: gt(osc[i], signal[i]) ? sigBull : sigBear }));

  // fill(p1, p2, color.new(bullColor, 75)) ... fill(p9, zeroLine, color.new(bullColor, 98)); same for n1..n9
  const fills = [
    ...FILL_TRANSP.map((tr, j) => ({ plot1: `plot${1 + j}`, plot2: j < 8 ? `plot${2 + j}` : 'plot0', color: String(color.new(BULL, tr)) })),
    ...FILL_TRANSP.map((tr, j) => ({ plot1: `plot${10 + j}`, plot2: j < 8 ? `plot${11 + j}` : 'plot0', color: String(color.new(BEAR, tr)) })),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    // alertcondition(ta.crossover(oscillator, 0)) / crossunder(oscillator, 0) / crossover / crossunder(oscillator, signal)
    alerts: alertStates(alertConditions, bars, [
      crossedOver(osc, 0), crossedUnder(osc, 0), crossedOver(osc, signal), crossedUnder(osc, signal),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Fisher Bull Cross', message: 'Fisher Transform crossed above zero' },
  { id: 'alert1', title: 'Fisher Bear Cross', message: 'Fisher Transform crossed below zero' },
  { id: 'alert2', title: 'Signal Cross Up', message: 'Fisher crossed above signal' },
  { id: 'alert3', title: 'Signal Cross Down', message: 'Fisher crossed below signal' },
];

export const FisherVolumeTransformAlphanatt = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
