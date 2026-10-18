/**
 * Adaptive Pivot Zones
 *
 * The range runs from the last pivot low to the last pivot high (pivots with `lenSwing` bars on each side). Three
 * levels inside it (low + range * level 1 / 2 / 3), each smoothed by an SMA, are drawn with fills between them. The
 * lines and fills are bullish when the close is above the highest level, bearish below the lowest one, and keep
 * their previous colour (or take the neutral colour) in between. Optional bar colours: bull above the middle level,
 * bear below it.
 * Alerts (alertcondition, `alerts` of the result): the close crosses over / under the middle level.
 *
 * Reference: "Adaptive Pivot Zones" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AdaptivePivotZonesInputs {
  /** Pivot length (bars on each side) */
  lenSwing: number;
  /** SMA length of the levels */
  smoothLen: number;
  pivotLevel1: number;
  pivotLevel2: number;
  pivotLevel3: number;
  /** Bullish colour (line) */
  bullColor: string;
  /** Bearish colour (line) */
  bearColor: string;
  /** Use the neutral colour between the lowest and the highest level */
  useNeutral: boolean;
  /** Neutral colour (line) */
  neutralColor: string;
  /** Fill transparency (0-100) */
  fillOpacity: number;
  /** Paint bars (middle level) */
  paintBars: boolean;
  paintBullColor: string;
  paintBearColor: string;
}

export const defaultInputs: AdaptivePivotZonesInputs = {
  lenSwing: 10,
  smoothLen: 1,
  pivotLevel1: 0.382,
  pivotLevel2: 0.5,
  pivotLevel3: 0.618,
  bullColor: 'rgb(22, 193, 67)',
  bearColor: 'rgb(229, 11, 11)',
  useNeutral: false,
  neutralColor: color.gray,
  fillOpacity: 80,
  paintBars: false,
  paintBullColor: color.green,
  paintBearColor: color.red,
};

export const inputConfig: InputConfig[] = [
  { id: 'lenSwing', type: 'int', title: 'Pivot Length', defval: 10, min: 2 },
  { id: 'smoothLen', type: 'int', title: 'Smoothing Length', defval: 1, min: 1 },
  { id: 'pivotLevel1', type: 'float', title: 'Pivot Level 1', defval: 0.382, min: 0.0, max: 1.0, step: 0.001 },
  { id: 'pivotLevel2', type: 'float', title: 'Pivot Level 2', defval: 0.5, min: 0.0, max: 1.0, step: 0.001 },
  { id: 'pivotLevel3', type: 'float', title: 'Pivot Level 3', defval: 0.618, min: 0.0, max: 1.0, step: 0.001 },
  { id: 'bullColor', type: 'color', title: 'Bullish Color (line)', defval: 'rgb(22, 193, 67)' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color (line)', defval: 'rgb(229, 11, 11)' },
  { id: 'useNeutral', type: 'bool', title: 'Use Neutral Color?', defval: false },
  { id: 'neutralColor', type: 'color', title: 'Neutral Color (line)', defval: color.gray },
  { id: 'fillOpacity', type: 'int', title: 'Fill Opacity (0–100)', defval: 80, min: 0, max: 100 },
  { id: 'paintBars', type: 'bool', title: 'Paint Bars (Mid Pivot)', defval: false },
  { id: 'paintBullColor', type: 'color', title: 'Bull Candle Color', defval: color.green },
  { id: 'paintBearColor', type: 'color', title: 'Bear Candle Color', defval: color.red },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Pivot Line 1', color: 'rgb(22, 193, 67)', lineWidth: 2 },
  { id: 'plot1', title: 'Pivot Line 2', color: 'rgb(22, 193, 67)', lineWidth: 1 },
  { id: 'plot2', title: 'Pivot Line 3', color: 'rgb(22, 193, 67)', lineWidth: 2 },
];

export const metadata = {
  title: 'Adaptive Pivot Zones',
  shortTitle: 'Adaptive Pivot Zones',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptivePivotZonesInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // ph = ta.pivothigh(high, lenSwing, lenSwing); pl = ta.pivotlow(low, lenSwing, lenSwing)
  const ph = A(ta.pivothigh(S(bars.map((b) => b.high)), cfg.lenSwing, cfg.lenSwing));
  const pl = A(ta.pivotlow(S(bars.map((b) => b.low)), cfg.lenSwing, cfg.lenSwing));

  // var drHigh / drLow: last pivot high / low; the levels exist once both are known
  const line1: number[] = new Array(n).fill(NaN);
  const line2: number[] = new Array(n).fill(NaN);
  const line3: number[] = new Array(n).fill(NaN);
  let drHigh = NaN;
  let drLow = NaN;
  for (let i = 0; i < n; i++) {
    if (!isNaN(ph[i])) drHigh = ph[i];
    if (!isNaN(pl[i])) drLow = pl[i];
    if (!isNaN(drHigh) && !isNaN(drLow)) {
      const rng = drHigh - drLow;
      line1[i] = drLow + rng * cfg.pivotLevel1;
      line2[i] = drLow + rng * cfg.pivotLevel2;
      line3[i] = drLow + rng * cfg.pivotLevel3;
    }
  }
  const s1 = A(ta.sma(S(line1), cfg.smoothLen));
  const s2 = A(ta.sma(S(line2), cfg.smoothLen));
  const s3 = A(ta.sma(S(line3), cfg.smoothLen));

  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const fillColors: string[] = [];
  const barColors: BarColorData[] = [];
  let prevColor = cfg.bullColor; // var color prevColor = bullColor
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    let lowerLine = NaN;
    let upperLine = NaN;
    if (!isNaN(s1[i]) && !isNaN(s2[i]) && !isNaN(s3[i])) {
      lowerLine = Math.min(Math.min(s1[i], s2[i]), s3[i]);
      upperLine = Math.max(Math.max(s1[i], s2[i]), s3[i]);
    }
    // calcColor(lowerLine, upperLine)
    let col = prevColor;
    if (!isNaN(lowerLine) && !isNaN(upperLine)) {
      if (lt(b.close, lowerLine)) col = cfg.bearColor;
      else if (gt(b.close, upperLine)) col = cfg.bullColor;
      else if (cfg.useNeutral) col = cfg.neutralColor;
      else col = prevColor;
    }
    prevColor = col;

    plot0.push({ time: b.time, value: s1[i], color: col });
    plot1.push({ time: b.time, value: s2[i], color: col });
    plot2.push({ time: b.time, value: s3[i], color: col });
    // fillColor = color.new(combinedColor, fillOpacity)
    fillColors.push(String(color.new(col, cfg.fillOpacity)));

    // barcolor(paintBars ? (close > mid ? paintBullColor : close < mid ? paintBearColor : na) : na)
    if (cfg.paintBars && !isNaN(s2[i])) {
      if (gt(b.close, s2[i])) barColors.push({ time: b.time, color: cfg.paintBullColor });
      else if (lt(b.close, s2[i])) barColors.push({ time: b.time, color: cfg.paintBearColor });
    }
  }

  // bullCross = not na(smoothedLine2) and ta.crossover(close, smoothedLine2); bearCross alike with ta.crossunder
  const close = bars.map((b) => b.close);
  const crossUp = crossedOver(close, s2);
  const crossDown = crossedUnder(close, s2);
  const bullCross = crossUp.map((c, i) => !isNaN(s2[i]) && c);
  const bearCross = crossDown.map((c, i) => !isNaN(s2[i]) && c);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Fill 1-2' }, colors: fillColors },
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Fill 2-3' }, colors: fillColors },
    ],
    barColors,
    alerts: alertStates(alertConditions, bars, [bullCross, bearCross]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Change', message: 'Price crossed ABOVE mid pivot → Bullish bias' },
  { id: 'alert1', title: 'Bearish Trend Change', message: 'Price crossed BELOW mid pivot → Bearish bias' },
];

export const AdaptivePivotZones = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
