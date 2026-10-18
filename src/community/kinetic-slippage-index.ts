/**
 * Kinetic Slippage Index (KSI)
 *
 * Price movement per unit of volume: ksi = 1e6 * tr^2 / (volume * ema(volume, volEmaLength)), 0 when the volume EMA
 * is not above 0 (tr = true range, the high - low on the first bar). The signal line is the EMA of the KSI. The
 * histogram is green when the KSI is above the signal line, red otherwise. Horizontal lines at 0 and at the spike
 * level.
 * Alert (alertcondition, `alerts` of the result): 'KSI Anomalous Spike', the KSI crossing over the spike level.
 *
 * Reference: "Kinetic Slippage Index (KSI)" by HPotter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © HPotter, Copyright by HPotter v1.01
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, crossedOver, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface KineticSlippageIndexInputs {
  /** True range period (not used by the computation of the original script) */
  atrLength: number;
  /** EMA period of the volume */
  volEmaLength: number;
  /** EMA period of the signal line */
  sigLength: number;
  /** Level of the spike line */
  sigSpike: number;
}

export const defaultInputs: KineticSlippageIndexInputs = {
  atrLength: 14,
  volEmaLength: 20,
  sigLength: 9,
  sigSpike: 0,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrLength', type: 'int', title: 'ATR / Range Period', defval: 14, min: 1 },
  { id: 'volEmaLength', type: 'int', title: 'Volume EMA Period', defval: 20, min: 1 },
  { id: 'sigLength', type: 'int', title: 'Signal Line Period', defval: 9, min: 1 },
  { id: 'sigSpike', type: 'float', title: 'Spike Signal Level', defval: 0, min: 0 },
];

const upColor = String(color.new(color.green, 30));
const downColor = String(color.new(color.red, 30));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'KSI Histogram', color: upColor, lineWidth: 2, style: 'histogram' },
  { id: 'plot1', title: 'Signal Line', color: color.orange, lineWidth: 1 },
];

export const metadata = {
  title: 'Kinetic Slippage Index (KSI)',
  shortTitle: 'KSI',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<KineticSlippageIndexInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const trueRange = A(ta.tr(bars, true));
  const volume = bars.map((b) => b.volume ?? NaN);
  const emaVolume = A(ta.ema(S(volume), cfg.volEmaLength));
  const ksi = bars.map((_b, i) => {
    // emaVolume > 0 ? tr^2 / (volume * emaVolume) : 0. Pine tr^2 / 0 is +infinity, but the plot draws nothing for it,
    // ta.ema skips it like na (its value is na on that bar, so ksi > signal is false): NaN gives the same outputs
    if (!gt(emaVolume[i], 0)) return 0;
    const den = volume[i] * emaVolume[i];
    return (den === 0 ? NaN : Math.pow(trueRange[i], 2) / den) * 1000000;
  });
  const signal = A(ta.ema(S(ksi), cfg.sigLength));
  // isSpike = ta.crossover(ksi, sigSpike): with the Pine value of tr^2 / 0 (+infinity, na for 0 / 0)
  const ksiPine = ksi.map((v, i) => (isNaN(v) && volume[i] * emaVolume[i] === 0 && Math.pow(trueRange[i], 2) > 0 ? Infinity : v));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: ksi[i], color: gt(ksi[i], signal[i]) ? upColor : downColor })),
      plot1: bars.map((b, i) => ({ time: b.time, value: signal[i], color: color.orange })),
    },
    hlines: [
      { value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dashed' } },
      { value: cfg.sigSpike, options: { title: 'Spike Line', color: color.orange, linestyle: 'dashed' } },
    ],
    alerts: alertStates(alertConditions, bars, [crossedOver(ksiPine, cfg.sigSpike)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0',
    title: 'KSI Anomalous Spike',
    message: 'KSI Alert! Anomalous volume/range divergence detected on {{exchange}}:{{ticker}}, TF: {{interval}}. Potential trend exhaustion or false breakout.',
  },
];

export const KineticSlippageIndex = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
