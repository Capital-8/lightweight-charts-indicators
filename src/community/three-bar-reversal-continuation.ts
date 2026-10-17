/**
 * Three-Bar Reversal/Continuation
 *
 * Bar strength 0 to 3: one point each when the bar range, the volume and range * volume are above `coeff` times
 * their `length`-bar simple averages. Strength dots at the bottom of the chart (white 1, yellow 2, lime 3).
 * Pattern: the bar two bars back has a strength of at least `detectLevel` (and the bar before it is not also that
 * strong with the same direction), the previous bar has strength 0, and the current bar has a larger range or a
 * larger volume than the previous bar. Bullish: a green bar with a higher high that closes above hl2; bearish: a
 * red bar with a lower low that closes below hl2. Without continuation, a bullish signal needs a `length`-bar
 * lowest low on one of the last 3 bars and a bearish signal a `length`-bar highest high.
 *
 * Alerts (alert() calls, `alertCalls` of the result): "Bullish R/C Detected" on a bullish signal, else "Bearish R/C
 * Detected" on a bearish signal; once per bar when the bar's volume and range are above their averages, once per bar
 * close otherwise.
 *
 * Reference: "Three-Bar Reversal/Continuation" by abuzka
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, AlertCall } from '../types';

export interface ThreeBarReversalContinuationInputs {
  /** Period of the averages and of the lowest / highest window */
  length: number;
  /** Coefficient applied to the averages */
  coeff: number;
  /** Strength needed on the signal bar (1 to 3) */
  detectLevel: number;
  /** Char of the bullish signal */
  symbolUp: string;
  /** Char of the bearish signal */
  symbolDown: string;
  /** Show continuation signals (no lowest / highest filter) */
  showCont: boolean;
  /** Show the strength dots */
  showStrength: boolean;
  /** Colour of the signal chars */
  plotColor: string;
}

export const defaultInputs: ThreeBarReversalContinuationInputs = {
  length: 10,
  coeff: 2,
  detectLevel: 3,
  symbolUp: '⇧',
  symbolDown: '⇩',
  showCont: true,
  showStrength: true,
  plotColor: color.aqua,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Period', defval: 10, min: 1, step: 1 },
  { id: 'coeff', type: 'float', title: 'Coefficient', defval: 2, min: 0.1, step: 0.1 },
  { id: 'detectLevel', type: 'int', title: 'Detection Level', defval: 3, min: 1, max: 3, step: 1 },
  { id: 'symbolUp', type: 'string', title: 'Symbol Up', defval: '⇧', options: ['⇧', '↑', '▲', '⇑'] },
  { id: 'symbolDown', type: 'string', title: 'Symbol Down', defval: '⇩', options: ['⇩', '↓', '▼', '⇓'] },
  { id: 'showCont', type: 'bool', title: 'Show Continuation', defval: true },
  { id: 'showStrength', type: 'bool', title: 'Show Strength Dots', defval: true },
  { id: 'plotColor', type: 'color', title: 'Signal Color', defval: color.aqua },
];

// No plot(): the outputs are plotchar markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Three-Bar Reversal/Continuation',
  shortTitle: 'Three-Bar Reversal/Continuation',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ThreeBarReversalContinuationInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { length, coeff, detectLevel, symbolUp, symbolDown, showCont, showStrength, plotColor } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);
  const barRange = bars.map((b) => b.high - b.low);
  const barColor = bars.map((b) => gt(b.open, b.close)); // open > close
  const rngVol = barRange.map((r, i) => r * volume[i]);
  const avgRange = A(ta.sma(Series.fromArray(bars, barRange), length));
  const avgVolume = A(ta.sma(Series.fromArray(bars, volume), length));
  const avgRngVol = A(ta.sma(Series.fromArray(bars, rngVol), length));
  const lowest = A(ta.lowest(Series.fromArray(bars, low), length));
  const highest = A(ta.highest(Series.fromArray(bars, high), length));

  const strength: number[] = new Array(n);
  const isLowest: boolean[] = new Array(n);
  const isHighest: boolean[] = new Array(n);
  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  const white = color.white;
  const yellow = color.yellow;
  const lime = color.lime;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    const condRange = gt(barRange[i], coeff * avgRange[i]) ? 1 : 0;
    const condVol = gt(volume[i], coeff * avgVolume[i]) ? 1 : 0;
    const condRngVol = gt(rngVol[i], coeff * avgRngVol[i]) ? 1 : 0;
    strength[i] = condRange + condVol + condRngVol;

    // plotchar(strength == k and showStrength, char = ".", location = location.bottom, size = size.tiny)
    const dot = (c: string) =>
      markers.push({ time: t, position: 'bottom', shape: 'circle', color: 'transparent', text: '.', textColor: c, size: 'tiny' });
    if (strength[i] === 1 && showStrength) dot(white);
    if (strength[i] === 2 && showStrength) dot(yellow);
    if (strength[i] === 3 && showStrength) dot(lime);

    // strength[k] / barRange[1] / volume[1] before the first bar are na (comparisons false); bool history is false
    const s1 = i >= 1 ? strength[i - 1] : NaN;
    const s2 = i >= 2 ? strength[i - 2] : NaN;
    const s3 = i >= 3 ? strength[i - 3] : NaN;
    const bc2 = i >= 2 ? barColor[i - 2] : false;
    const bc3 = i >= 3 ? barColor[i - 3] : false;
    const range1 = i >= 1 ? barRange[i - 1] : NaN;
    const vol1 = i >= 1 ? volume[i - 1] : NaN;
    const high1 = i >= 1 ? high[i - 1] : NaN;
    const low1 = i >= 1 ? low[i - 1] : NaN;
    const validPattern = !(s3 >= detectLevel && bc3 === bc2)
      && s2 >= detectLevel && s1 === 0
      && (gt(barRange[i], range1) || gt(volume[i], vol1));

    const hl2 = (b.high + b.low) / 2;
    let bullCond = gt(b.close, b.open) && gt(b.high, high1) && gt(b.close, hl2) && validPattern;
    let bearCond = lt(b.close, b.open) && lt(b.low, low1) && lt(b.close, hl2) && validPattern;

    isLowest[i] = eq(lowest[i], b.low);
    const lo1 = i >= 1 ? isLowest[i - 1] : false;
    const lo2 = i >= 2 ? isLowest[i - 2] : false;
    if (!(isLowest[i] || lo1 || lo2) && !showCont) bullCond = false;

    isHighest[i] = eq(highest[i], b.high);
    const hi1 = i >= 1 ? isHighest[i - 1] : false;
    const hi2 = i >= 2 ? isHighest[i - 2] : false;
    if (!(isHighest[i] || hi1 || hi2) && !showCont) bearCond = false;

    // plotchar(bullCond, char = symbolUp, location = location.belowbar, color = plotColor, size = size.tiny)
    if (bullCond) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: 'transparent', text: symbolUp,
        textColor: plotColor, size: 'tiny' });
    }
    // plotchar(bearCond, char = symbolDown, location = location.abovebar, color = plotColor, size = size.tiny)
    if (bearCond) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: 'transparent', text: symbolDown,
        textColor: plotColor, size: 'tiny' });
    }

    // reqConfirm = volume > avgVolume and barRange > avgRange; alert() on bullCond, else on bearCond
    const reqConfirm = gt(volume[i], avgVolume[i]) && gt(barRange[i], avgRange[i]);
    const freq = reqConfirm ? 'once_per_bar' : 'once_per_bar_close';
    if (bullCond) alertCalls.push({ time: t, message: 'Bullish R/C Detected', freq });
    else if (bearCond) alertCalls.push({ time: t, message: 'Bearish R/C Detected', freq });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    alertCalls,
  };
}

export const hasAlertFunction = true;

export const ThreeBarReversalContinuation = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction,
};
