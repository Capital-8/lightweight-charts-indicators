/**
 * For-Loop Vote Trailing Stop
 *
 * A multi-horizon vote: for each horizon i from a to b, +1 when src > src[i], else -1; the sum is divided by
 * (b - a + 1). The vote drives a trailing stop: when the vote reaches the long threshold (and the regime is not long)
 * the regime turns long with stop = src - atrK * ATR; when it reaches the short threshold (and the regime is not
 * short) the regime turns short with stop = src + atrK * ATR. Otherwise the stop ratchets: max(stop, src - offset)
 * in a long regime, min(stop, src + offset) in a short regime. The stop is green in a long regime, red otherwise;
 * triangles mark the regime flips.
 * Alerts (alertcondition, `alerts` of the result): 'Vote Stop Long' / 'Vote Stop Short' on the regime flips.
 *
 * Reference: "For-Loop Vote Trailing Stop | Mies" by MiesOnCharts
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © MiesOnCharts
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ForLoopVoteTrailingStopMiesonchartsInputs {
  /** Source */
  src: SourceType;
  /** Min horizon (bars) */
  a: number;
  /** Max horizon (bars) */
  b: number;
  /** Long threshold */
  thrUp: number;
  /** Short threshold */
  thrDn: number;
  /** ATR length (stop offset) */
  atrLen: number;
  /** ATR multiplier */
  atrK: number;
}

export const defaultInputs: ForLoopVoteTrailingStopMiesonchartsInputs = {
  src: 'hl2',
  a: 1,
  b: 70,
  thrUp: 0.6,
  thrDn: -0.2,
  atrLen: 14,
  atrK: 1.75,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'hl2' },
  { id: 'a', type: 'int', title: 'Min Horizon (bars)', defval: 1, min: 1 },
  { id: 'b', type: 'int', title: 'Max Horizon (bars)', defval: 70, min: 5 },
  { id: 'thrUp', type: 'float', title: 'Long Threshold', defval: 0.6, min: 0.0, max: 1.0, step: 0.05 },
  { id: 'thrDn', type: 'float', title: 'Short Threshold', defval: -0.2, min: -1.0, max: 0.0, step: 0.05 },
  { id: 'atrLen', type: 'int', title: 'ATR Length (stop offset)', defval: 14, min: 1 },
  { id: 'atrK', type: 'float', title: 'ATR Multiplier', defval: 1.75, min: 0.5, step: 0.25 },
];

const UP_COLOR = String(color.new(color.rgb(0, 255, 21), 0));
const DN_COLOR = String(color.new(color.rgb(255, 0, 0), 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Vote Stop', color: UP_COLOR, lineWidth: 2, style: 'linebr' },
];

export const metadata = {
  title: 'For-Loop Vote Trailing Stop | Mies',
  shortTitle: 'For-Loop Vote Trailing Stop | Mies',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (x: number, y: number) => x - y > EPS;
const ge = (x: number, y: number) => !isNaN(x) && !isNaN(y) && !(y - x > EPS);
const le = (x: number, y: number) => !isNaN(x) && !isNaN(y) && !(x - y > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<ForLoopVoteTrailingStopMiesonchartsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const atr = ta.atr(bars, cfg.atrLen).toArray().map((v) => v ?? NaN);

  let dir = 0; // var int dir = 0
  let stop = NaN; // var float stop = na
  let prevDir = NaN; // dir[1] (na on the first bar)
  const plot0: { time: number; value: number; color: string }[] = new Array(n);
  const markers: MarkerData[] = [];
  const upFlags: boolean[] = [];
  const dnFlags: boolean[] = [];
  // for i = a to b: counts down when a > b
  const step = cfg.a <= cfg.b ? 1 : -1;

  for (let k = 0; k < n; k++) {
    let score = 0.0;
    for (let i = cfg.a; step > 0 ? i <= cfg.b : i >= cfg.b; i += step) {
      const past = k - i >= 0 ? src[k - i] : NaN;
      score += gt(src[k], past) ? 1 : -1;
    }
    score /= cfg.b - cfg.a + 1;

    const atrOff = cfg.atrK * atr[k];
    const longSig = ge(score, cfg.thrUp);
    const shortSig = le(score, cfg.thrDn);

    if (longSig && dir !== 1) {
      dir = 1;
      stop = src[k] - atrOff;
    } else if (shortSig && dir !== -1) {
      dir = -1;
      stop = src[k] + atrOff;
    } else if (dir === 1) {
      // math.max / math.min return na when an argument is na
      stop = Math.max(stop, src[k] - atrOff);
    } else if (dir === -1) {
      stop = Math.min(stop, src[k] + atrOff);
    }

    const isUp = dir === 1;
    plot0[k] = { time: bars[k].time, value: Number.isFinite(stop) ? stop : NaN, color: isUp ? UP_COLOR : DN_COLOR };

    // flipUp = dir == 1 and dir[1] != 1; flipDn = dir == -1 and dir[1] != -1 (na != x is false)
    const flipUp = dir === 1 && !isNaN(prevDir) && prevDir !== 1;
    const flipDn = dir === -1 && !isNaN(prevDir) && prevDir !== -1;
    if (flipUp) {
      markers.push({ time: bars[k].time, position: 'belowBar', shape: 'triangleUp', color: UP_COLOR, size: 'small' });
    }
    if (flipDn) {
      markers.push({ time: bars[k].time, position: 'aboveBar', shape: 'triangleDown', color: DN_COLOR, size: 'small' });
    }
    upFlags.push(flipUp);
    dnFlags.push(flipDn);
    prevDir = dir;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    // alertcondition(flipUp, "Vote Stop Long") / alertcondition(flipDn, "Vote Stop Short")
    alerts: alertStates(alertConditions, bars, [upFlags, dnFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Vote Stop Long', message: 'Multi-horizon vote crossed long threshold' },
  { id: 'alert1', title: 'Vote Stop Short', message: 'Multi-horizon vote crossed short threshold' },
];

export const ForLoopVoteTrailingStopMiesoncharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
