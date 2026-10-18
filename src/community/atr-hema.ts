/**
 * ATR HEMA
 *
 * Holt exponential moving average of the source: a level smoothed with alpha = 2 / (alpha length + 1) plus a trend
 * term smoothed with gamma = 2 / (gamma length + 1). The line is bullish when it rises and bearish when it falls;
 * when the change of the line is smaller than ATR(length) * multiplier (neutral zone) the line keeps its previous
 * colour. Triangles with L / S mark the changes from bearish to bullish and from bullish to bearish; the candles can
 * take the line colour.
 * Alerts (alertcondition, `alerts` of the result): 'ATR HEMA Postive Trend' / 'ATR HEMA Negative Trend' on the bars of
 * the L / S triangles.
 *
 * Reference: "ATR HEMA [SeerQuant]" by SeerQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type ATRHEMAColorScheme = 'Default' | 'Modern' | 'Cool' | 'Alternate' | 'Bright';

export interface ATRHEMAInputs {
  /** Alpha length (level smoothing) */
  alphaL: number;
  /** Gamma length (trend smoothing) */
  gammaL: number;
  /** Neutral zone multiplier of the ATR */
  atrMult: number;
  /** ATR length */
  atrleng: number;
  /** Calculation source */
  src: SourceType;
  /** Colour scheme (bullish, bearish, neutral colours) */
  colScheme: ATRHEMAColorScheme;
  /** Colour the candles with the line colour */
  paint: boolean;
}

export const defaultInputs: ATRHEMAInputs = {
  alphaL: 20,
  gammaL: 20,
  atrMult: 0.04,
  atrleng: 14,
  src: 'hl2',
  colScheme: 'Default',
  paint: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'alphaL', type: 'int', title: 'Alpha Length', defval: 20 },
  { id: 'gammaL', type: 'int', title: 'Gamma Length', defval: 20 },
  { id: 'atrMult', type: 'float', title: 'Neutral Zone Multiplier (ATR)', defval: 0.04, step: 0.01 },
  { id: 'atrleng', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'src', type: 'source', title: 'Source', defval: 'hl2' },
  { id: 'colScheme', type: 'string', title: 'Color Scheme', defval: 'Default', options: ['Default', 'Modern', 'Cool', 'Alternate', 'Bright'] },
  { id: 'paint', type: 'bool', title: 'Colour Candles?', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'HEMA', color: '#00ff73', lineWidth: 4 },
];

export const metadata = {
  title: 'ATR HEMA [SeerQuant]',
  shortTitle: 'ATR HEMA',
  overlay: true,
};

/** [bull, bear, neutral] per colour scheme (the neutral colour is not used by the Pine outputs) */
const SCHEMES: Record<ATRHEMAColorScheme, [string, string, string]> = {
  Default: ['#00ff73', '#ff0040', '#606060'],
  Modern: ['#23d7e4', '#b30f61', '#707070'],
  Cool: ['#00ffcc', '#2f00ff', '#505050'],
  Alternate: ['#00ff80', '#ff6600', '#505050'],
  Bright: ['#e8ec00', '#f200fa', '#505050'],
};

/** Pine float comparisons: a < b only when b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ATRHEMAInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const [bull, bear] = SCHEMES[cfg.colScheme];
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const atr = ta.atr(bars, cfg.atrleng).toArray().map((v) => v ?? NaN);

  const alpha = 2 / (cfg.alphaL + 1);
  const gamma = 2 / (cfg.gammaL + 1);

  const hema: number[] = new Array(n);
  const b: number[] = new Array(n);
  const hemaColor: (string | null)[] = new Array(n);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];
  let prevColorVar: string | null = null; // var color prevColor = na
  let hemaColorVar: string | null = null; // var color hemaColor = na
  for (let i = 0; i < n; i++) {
    // hema := (1 - alpha) * (nz(hema[1]) + nz(b[1], src)) + alpha * src (hema[1], b[1] are na on the first bar)
    const hemaPrev = i > 0 ? hema[i - 1] : NaN;
    const bPrev = i > 0 ? b[i - 1] : NaN;
    const nzHemaPrev = isNaN(hemaPrev) ? 0 : hemaPrev;
    hema[i] = (1 - alpha) * (nzHemaPrev + (isNaN(bPrev) ? src[i] : bPrev)) + alpha * src[i];
    // b := (1 - gamma) * nz(b[1]) + gamma * (hema - nz(hema[1]))
    b[i] = (1 - gamma) * (isNaN(bPrev) ? 0 : bPrev) + gamma * (hema[i] - nzHemaPrev);

    // neutralThreshold = ta.atr(atrleng) * atrMult; hemaChange = hema - hema[1]
    // inNeutralZone = math.abs(hemaChange) < neutralThreshold (false when a value is na)
    const neutralThreshold = atr[i] * cfg.atrMult;
    const hemaChange = hema[i] - hemaPrev;
    const inNeutralZone = lt(Math.abs(hemaChange), neutralThreshold);
    if (inNeutralZone) hemaColorVar = prevColorVar;
    else hemaColorVar = gt(hemaChange, 0) ? bull : bear;

    const longSignal = hemaColorVar === bull && prevColorVar === bear;
    const shortSignal = hemaColorVar === bear && prevColorVar === bull;
    prevColorVar = hemaColorVar;
    hemaColor[i] = hemaColorVar;
    longFlags.push(longSignal);
    shortFlags.push(shortSignal);

    const t = bars[i].time;
    // barcolor(paint ? hemaColor : na)
    if (cfg.paint && hemaColorVar !== null) barColors.push({ time: t, color: hemaColorVar });
    // plotshape(longSignal, style = shape.triangleup, color = bull, location = location.belowbar, text = "𝐋",
    //   textcolor = bull, size = size.small, force_overlay = true); the short signal mirrors it above the bar
    if (longSignal) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: bull, text: '𝐋', textColor: bull,
        size: 'small', forceOverlay: true });
    }
    if (shortSignal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: bear, text: '𝐒', textColor: bear,
        size: 'small', forceOverlay: true });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(hema, "HEMA", linewidth = 4, color = hemaColor, force_overlay = true)
      plot0: bars.map((bar, i) => ({ time: bar.time, value: hema[i], color: hemaColor[i] ?? 'transparent' })),
    },
    markers,
    barColors,
    // alertcondition(longSignal, ...) / alertcondition(shortSignal, ...)
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ATR HEMA Postive Trend', message: 'ATR HEMA Bullish Signal on: {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'ATR HEMA Negative Trend', message: 'ATR HEMA Bearish Signal on: {{exchange}}:{{ticker}}' },
];

export const ATRHEMA = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
