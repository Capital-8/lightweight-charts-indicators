/**
 * Harmonic Sniper Trigger [Fisher]
 *
 * Fisher transform of the candle midpoint in the high / low range of `len` bars:
 * value = 0.66 * ((hl2 - lowest) / (highest - lowest) - 0.5) + 0.67 * value[1], clamped to +-0.999 above 0.99;
 * fisher = 0.5 * ln((1 + value) / (1 - value)) + 0.5 * fisher[1]. The trigger line is the fisher of the previous
 * bar. A fill between the two lines is green when the fisher is above the trigger, red otherwise; B / S labels mark
 * the crosses. Reference lines at +-1.5 and 0.
 * Alerts (alertcondition, `alerts` of the result): 'Fisher Buy Signal' / 'Fisher Sell Signal' on the bars of the B / S
 * crosses.
 *
 * Reference: "Harmonic Sniper Trigger [Fisher]" by PyraTime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © PyraTime
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface HarmonicSniperTriggerPyratimeInputs {
  /** Length of the highest / lowest window */
  len: number;
}

export const defaultInputs: HarmonicSniperTriggerPyratimeInputs = {
  len: 9,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Length', defval: 9, min: 1 },
];

/** Pine default plot colour (plots without a colour) */
const PINE_BLUE = '#2962FF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fisher', color: String(color.new(color.blue, 0)), lineWidth: 2 },
  { id: 'plot1', title: 'Trigger', color: String(color.new(color.orange, 0)), lineWidth: 1 },
  // fill(plot(fish1), plot(fish2), ...): plots without a colour, drawn with the Pine default colour
  { id: 'plot2', title: 'Fisher (fill)', color: PINE_BLUE, lineWidth: 1 },
  { id: 'plot3', title: 'Trigger (fill)', color: PINE_BLUE, lineWidth: 1 },
];

export const metadata = {
  title: 'Harmonic Sniper Trigger [Fisher]',
  shortTitle: 'PyraFish',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<HarmonicSniperTriggerPyratimeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const high = A(ta.highest(S(bars.map((b) => b.high)), cfg.len));
  const low = A(ta.lowest(S(bars.map((b) => b.low)), cfg.len));

  const fish1: number[] = new Array(n);
  const fish2: number[] = new Array(n);
  let prevValue = NaN;
  let prevFish = NaN;
  const nz = (x: number) => (Number.isFinite(x) ? x : 0);
  for (let i = 0; i < n; i++) {
    const hl2 = (bars[i].high + bars[i].low) / 2;
    // value := 0.66 * ((hl2 - low_) / (high_ - low_) - 0.5) + 0.67 * nz(value[1]) (plain division: 0 / 0 is na)
    let value = 0.66 * ((hl2 - low[i]) / (high[i] - low[i]) - 0.5) + 0.67 * nz(prevValue);
    // value := value > 0.99 ? 0.999 : value < -0.99 ? -0.999 : value
    value = gt(value, 0.99) ? 0.999 : lt(value, -0.99) ? -0.999 : value;
    // fish1 := 0.5 * math.log((1 + value) / (1 - value)) + 0.5 * nz(fish1[1])
    const f = 0.5 * Math.log((1 + value) / (1 - value)) + 0.5 * nz(prevFish);
    fish1[i] = f;
    fish2[i] = prevFish; // fish2 = fish1[1]
    prevValue = value;
    prevFish = f;
  }

  const t = (i: number) => bars[i].time;
  const fin = (x: number) => (Number.isFinite(x) ? x : NaN);
  const fishColor = String(color.new(color.blue, 0));
  const trigColor = String(color.new(color.orange, 0));
  const plots = {
    plot0: bars.map((_b, i) => ({ time: t(i), value: fin(fish1[i]), color: fishColor })),
    plot1: bars.map((_b, i) => ({ time: t(i), value: fin(fish2[i]), color: trigColor })),
    plot2: bars.map((_b, i) => ({ time: t(i), value: fin(fish1[i]) })),
    plot3: bars.map((_b, i) => ({ time: t(i), value: fin(fish2[i]) })),
  };

  // fill(..., color = fish1 > fish2 ? color.new(color.green, 80) : color.new(color.red, 80), title = "Trend Fill")
  const upFill = String(color.new(color.green, 80));
  const dnFill = String(color.new(color.red, 80));
  const fillColors = bars.map((_b, i) => (gt(fish1[i], fish2[i]) ? upFill : dnFill));

  // ta.crossover(fish1, fish2) / ta.crossunder(fish1, fish2)
  const crossUp = A(ta.crossover(S(fish1), S(fish2)));
  const crossDn = A(ta.crossunder(S(fish1), S(fish2)));
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    if (crossUp[i]) {
      markers.push({ time: t(i), position: 'bottom', shape: 'labelUp', color: color.green, text: 'B',
        textColor: color.white, size: 'tiny' });
    }
    if (crossDn[i]) {
      markers.push({ time: t(i), position: 'top', shape: 'labelDown', color: color.red, text: 'S',
        textColor: color.white, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: 1.5, options: { title: 'Overbought', color: String(color.new(color.red, 50)), linestyle: 'dotted' } },
      { value: -1.5, options: { title: 'Oversold', color: String(color.new(color.green, 50)), linestyle: 'dotted' } },
      { value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dashed' } },
    ],
    fills: [{ plot1: 'plot2', plot2: 'plot3', options: { title: 'Trend Fill' }, colors: fillColors }],
    markers,
    // alertcondition(cross_up, "Fisher Buy Signal") / alertcondition(cross_dn, "Fisher Sell Signal")
    alerts: alertStates(alertConditions, bars, [crossUp.map((v) => !!v), crossDn.map((v) => !!v)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Fisher Buy Signal', message: 'Fisher Cross UP (Green) - Check for GPM Time Line!' },
  { id: 'alert1', title: 'Fisher Sell Signal', message: 'Fisher Cross DOWN (Red) - Check for GPM Time Line!' },
];

export const HarmonicSniperTriggerPyratime = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
