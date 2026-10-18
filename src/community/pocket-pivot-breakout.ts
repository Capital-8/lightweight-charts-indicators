/**
 * Pocket Pivot Breakout
 *
 * A pocket pivot is a green bar whose body is more than "% change" percent of the close and whose volume is not
 * lower than the volume of any down (or flat) bar of the last "Pocket Pivot Lookback Days" bars (up bars count as
 * volume 0). It draws a blue triangle below the bar. Optionally, a gap-up bar (low above the previous high by more
 * than "Gap-up Value in %" percent of the low) is coloured blue.
 * Alerts (alertcondition, `alerts` of the result): 'Pocket Pivot Breakout Alert' on the pocket pivot bars and
 * 'Gap-Up Alert' on the gap-up bars (only with "Gap-up Bar" on, as in the original).
 *
 * Reference: "Pocket Pivot Breakout" by simatricks
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PocketPivotBreakoutInputs {
  /** Minimum body of the green bar, in percent of the close */
  barsize: number;
  /** Number of previous bars whose volume is checked */
  ppdays: number;
  /** Colour the gap-up bars */
  gapcandle: boolean;
  /** Minimum gap, in percent of the low */
  gapvalue: number;
}

export const defaultInputs: PocketPivotBreakoutInputs = {
  barsize: 3,
  ppdays: 10,
  gapcandle: false,
  gapvalue: 0.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'barsize', type: 'int', title: '% change', defval: 3 },
  { id: 'ppdays', type: 'int', title: 'Pocket Pivot Lookback Days', defval: 10 },
  { id: 'gapcandle', type: 'bool', title: 'Gap-up Bar', defval: false },
  { id: 'gapvalue', type: 'float', title: 'Gap-up Value in %', defval: 0.5 },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Pocket Pivot Breakout',
  shortTitle: 'Pocket Pivot Breakout',
  overlay: true,
};

// Pine comparison operators: a > b only when a - b > 1e-10; a comparison with na is false
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<PocketPivotBreakoutInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const ppFlags: boolean[] = [], gapFlags: boolean[] = [];
  const num = (v: number | undefined) => (v === undefined || v === null ? NaN : v);

  // volchk = array.new<float>(ppdays + 1); for i = 1 to ppdays (counts down when ppdays < 1)
  const size = cfg.ppdays + 1;
  if (size < 0) throw new Error(`Invalid array size ${size} in array.new`);
  const step = cfg.ppdays >= 1 ? 1 : -1;
  const idxs: number[] = [];
  for (let i = 1; step > 0 ? i <= cfg.ppdays : i >= cfg.ppdays; i += step) idxs.push(i);
  const bad = idxs.find((i) => i >= size);
  if (bars.length && bad !== undefined) throw new Error(`Index ${bad} is out of bounds, array size is ${size}`);

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const vol = num(b.volume);
    const greenday = gt(b.close, b.open) && gt(((b.close - b.open) / b.close) * 100, cfg.barsize);
    const h1 = i > 0 ? bars[i - 1].high : NaN;
    const gapup = gt(b.low, h1) && gt(((b.low - h1) / b.low) * 100, cfg.gapvalue) && cfg.gapcandle;

    const volchk: number[] = new Array(size).fill(NaN);
    for (const k of idxs) {
      const p = i - k >= 0 ? bars[i - k] : undefined;
      // close[k] > open[k] (false when na): 0, else volume[k] (na before the first bar)
      volchk[k] = p && gt(p.close, p.open) ? 0 : p ? num(p.volume) : NaN;
    }
    let ppchk = 0;
    for (const k of idxs) if (lt(vol, volchk[k])) ppchk += 1;
    const ispp = ppchk < 1 && greenday;
    ppFlags.push(ispp);
    gapFlags.push(gapup);

    // plotshape(ispp ? 1 : 0, style = shape.triangleup, location = location.belowbar, color = color.blue,
    // size = size.auto): with location.belowbar the series is read as a bool (0 draws no shape)
    if (ispp) markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.blue, size: 'auto' });
    // barcolor(gapup ? color.blue : na, title = 'Gap-up Bar Color')
    if (gapup) barColors.push({ time: b.time, color: color.blue });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    // alertcondition(ispp, 'Pocket Pivot Breakout Alert') / alertcondition(gapup, 'Gap-Up Alert')
    alerts: alertStates(alertConditions, bars, [ppFlags, gapFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Pocket Pivot Breakout Alert', message: 'Pocket Pivot Breakout Alert' },
  { id: 'alert1', title: 'Gap-Up Alert', message: 'Gap-Up Alert' },
];

export const PocketPivotBreakout = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
