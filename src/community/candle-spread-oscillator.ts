/**
 * Candle Spread Oscillator (CS0)
 *
 * The candle body as a share of the bar range, spread = (close - open) / (high - low), smoothed with a Hull moving
 * average. The area line and the background take a gradient colour from fuchsia (-0.1 and below) to aqua
 * (0.2 and above). Midline at 0.
 * Alerts (alertcondition, `alerts` of the result): 'Cross Up' / 'Cross Down' when the oscillator crosses above /
 * below the midline.
 *
 * Reference: "Candle Spread Oscillator (CS0)" by RWCS_LTD
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © RWCS_LTD
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CandleSpreadOscillatorInputs {
  /** Smoothing period of the HMA */
  lookbackPeriod: number;
}

export const defaultInputs: CandleSpreadOscillatorInputs = {
  lookbackPeriod: 500,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookbackPeriod', type: 'int', title: 'Smoothing Period', defval: 500 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Candle Spread Oscillator', color: String(color.new(color.aqua, 50)), lineWidth: 2, style: 'areabr' },
];

export const metadata = {
  title: 'Candle Spread Oscillator (CS0)',
  shortTitle: 'Candle Spread Oscillator (CS0)',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<CandleSpreadOscillatorInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  // ta.hma(x, 1) is a Pine runtime error (wma length 0)
  if (cfg.lookbackPeriod === 1) throw new Error("Invalid value of the 'length' argument (0.0) in the 'wma' function");

  // spread = (close - open) / (high - low): a plain division (x / 0 is +-infinity, 0 / 0 na); ta.hma skips them
  const spread = bars.map((b) => (b.close - b.open) / (b.high - b.low));
  const smoothed = A(ta.hma(Series.fromArray(bars, spread), cfg.lookbackPeriod));

  const bottom = String(color.new(color.fuchsia, 50));
  const top = String(color.new(color.aqua, 50));
  const plot0: { time: number; value: number; color?: string }[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < bars.length; i++) {
    const v = smoothed[i];
    const t = bars[i].time;
    // gradientColor = color.from_gradient(smoothedSpread, -0.1, 0.2, ...): na for an na value
    if (isNaN(v)) {
      plot0.push({ time: t, value: NaN });
      continue;
    }
    const c = color.from_gradient(v, -0.1, 0.2, bottom, top);
    plot0.push({ time: t, value: v, color: c });
    bgColors.push({ time: t, color: c });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines: [{ value: 0, options: { title: 'Midline', color: color.gray, linestyle: 'dotted' } }],
    bgColors,
    // crossUp = ta.crossover(smoothedSpread, 0) / crossDown = ta.crossunder(smoothedSpread, 0)
    alerts: alertStates(alertConditions, bars, [crossedOver(smoothed, 0), crossedUnder(smoothed, 0)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Cross Up', message: 'Candle Spread Oscillator crossed above the midline.' },
  { id: 'alert1', title: 'Cross Down', message: 'Candle Spread Oscillator crossed below the midline.' },
];

export const CandleSpreadOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
