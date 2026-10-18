/**
 * RSI + EMA + MZONES with Divergences
 *
 * RSI from RMAs of the up and down changes of the source (100 when the down RMA is 0, 0 when the up RMA is 0), an
 * EMA of the RSI (light blue when rising or flat, orange when falling), zone lines at 80 / 65 / 50 / 35 / 20 with two
 * fills, and regular / hidden divergences between RSI pivots and price (the classic pivot divergence logic: a pivot
 * of the RSI compared with the previous pivot, 5 to 60 bars after it). Pivot lines and labels are drawn on the
 * pivot bar (offset -lbR).
 * Alerts (alertcondition, `alerts` of the result): the four divergences, true on the bar that confirms the pivot
 * (lbR bars after it), whether or not their "Plot ..." option is on.
 *
 * Reference: "RSI+EMA+MZONES with Divergences" by lordoflolz
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © lordoflolz
 */

import {
  ta, Series, color, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RsiEmaMzonesWithDivergencesInputs {
  /** RSI period */
  len: number;
  /** RSI source */
  src: SourceType;
  /** Pivot lookback right */
  lbR: number;
  /** Pivot lookback left */
  lbL: number;
  rangeUpper: number;
  rangeLower: number;
  plotBull: boolean;
  plotHiddenBull: boolean;
  plotBear: boolean;
  plotHiddenBear: boolean;
  showLabels: boolean;
  /** EMA length of the RSI */
  lenema: number;
}

export const defaultInputs: RsiEmaMzonesWithDivergencesInputs = {
  len: 14,
  src: 'close',
  lbR: 5,
  lbL: 5,
  rangeUpper: 60,
  rangeLower: 5,
  plotBull: true,
  plotHiddenBull: false,
  plotBear: true,
  plotHiddenBear: false,
  showLabels: true,
  lenema: 21,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'RSI Period', defval: 14, min: 1 },
  { id: 'src', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'lbR', type: 'int', title: 'Pivot Lookback Right', defval: 5 },
  { id: 'lbL', type: 'int', title: 'Pivot Lookback Left', defval: 5 },
  { id: 'rangeUpper', type: 'int', title: 'Max of Lookback Range', defval: 60 },
  { id: 'rangeLower', type: 'int', title: 'Min of Lookback Range', defval: 5 },
  { id: 'plotBull', type: 'bool', title: 'Plot Bullish', defval: true },
  { id: 'plotHiddenBull', type: 'bool', title: 'Plot Hidden Bullish', defval: false },
  { id: 'plotBear', type: 'bool', title: 'Plot Bearish', defval: true },
  { id: 'plotHiddenBear', type: 'bool', title: 'Plot Hidden Bearish', defval: false },
  { id: 'showLabels', type: 'bool', title: 'Show Divergence Labels', defval: true },
  { id: 'lenema', type: 'int', title: 'EMA Length', defval: 21, min: 1 },
];

const BULL = color.green;
const BEAR = color.red;
const HIDDEN_BULL = String(color.new(color.green, 80));
const HIDDEN_BEAR = String(color.new(color.red, 80));
const TEXT = color.white;
const NONE = String(color.new(color.white, 100));
const RSI_COL = '#fff59d';
const EMA_UP = '#95effb';
const EMA_DOWN = color.orange;
const ZONE_FILL_UP = String(color.new('#434651', 75));
const ZONE_FILL_DOWN = String(color.new('#613f0e', 85));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: RSI_COL, lineWidth: 1 },
  { id: 'plot1', title: 'RSI EMA', color: EMA_UP, lineWidth: 2 },
  { id: 'plot2', title: 'Regular Bullish', color: BULL, lineWidth: 2 },
  { id: 'plot3', title: 'Hidden Bullish', color: HIDDEN_BULL, lineWidth: 2 },
  { id: 'plot4', title: 'Regular Bearish', color: BEAR, lineWidth: 2 },
  { id: 'plot5', title: 'Hidden Bearish', color: HIDDEN_BEAR, lineWidth: 2 },
];

/** hline(65 / 80 / 50 / 35 / 20) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_bull', price: 65, title: 'Bull Line', color: '#5e5b3e', linestyle: 'dashed' },
  { id: 'hline_upper', price: 80, title: 'Upper Band', color: '#5e5b3e', linestyle: 'dashed' },
  { id: 'hline_middle', price: 50, title: 'Middle Line', color: '#d1d4dc', linestyle: 'dotted' },
  { id: 'hline_bear', price: 35, title: 'Bear Line', color: '#a46b18', linestyle: 'dashed' },
  { id: 'hline_lower', price: 20, title: 'Lower Band', color: '#a46b18', linestyle: 'dashed' },
];

/** fill(band1, band0, color.new(#434651, 75)); fill(band3, band2, color.new(#613f0e, 85)) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_upper', plot1: 'hline_bull', plot2: 'hline_upper', color: ZONE_FILL_UP, title: 'Hlines Background' },
  { id: 'fill_lower', plot1: 'hline_bear', plot2: 'hline_lower', color: ZONE_FILL_DOWN, title: 'Hlines Background' },
];

export const metadata = {
  title: 'RSI+EMA+MZONES with Divergences',
  shortTitle: 'RSI+EMA+Div',
  overlay: false,
};

/** Pine float comparisons: 1e-10 tolerance, na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS) && !(b - a > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiEmaMzonesWithDivergencesInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const { lbL, lbR, rangeLower, rangeUpper } = cfg;

  // up = ta.rma(math.max(ta.change(src), 0), len); down = ta.rma(-math.min(ta.change(src), 0), len)
  const src = A(getSourceSeries(bars, cfg.src));
  const ch = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const up = A(ta.rma(S(ch.map((c) => (isNaN(c) ? NaN : Math.max(c, 0)))), cfg.len));
  const down = A(ta.rma(S(ch.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0)))), cfg.len));
  // rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))
  const rsi = up.map((u, i) => (eq(down[i], 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / down[i])));
  const out = A(ta.ema(S(rsi), cfg.lenema));

  const rsiS = S(rsi);
  const plFound = A(ta.pivotlow(rsiS, lbL, lbR)).map((v) => !isNaN(v));
  const phFound = A(ta.pivothigh(rsiS, lbL, lbR)).map((v) => !isNaN(v));

  const interval = barInterval(bars);
  const plotRegBull: Point[] = [];
  const plotHidBull: Point[] = [];
  const plotRegBear: Point[] = [];
  const plotHidBear: Point[] = [];
  const markers: MarkerData[] = [];

  // _inRange(plFound[1]): ta.barssince(plFound[1] == true), on every bar
  let plBars = NaN;
  let phBars = NaN;
  // ta.valuewhen(found, x[lbR], 1): x at the previous found bar (the latest found bar can be the current one)
  const plRsi: number[] = [];
  const plLow: number[] = [];
  const phRsi: number[] = [];
  const phHigh: number[] = [];
  const prev = (a: number[]) => (a.length >= 2 ? a[a.length - 2] : NaN);
  // bullCondAlert, hiddenBullCondAlert, bearCondAlert, hiddenBearCondAlert (without the "Plot ..." options)
  const alertFlags: boolean[][] = [[], [], [], []];

  for (let i = 0; i < n; i++) {
    if (i > 0 && plFound[i - 1]) plBars = 0;
    else if (!isNaN(plBars)) plBars++;
    if (i > 0 && phFound[i - 1]) phBars = 0;
    else if (!isNaN(phBars)) phBars++;
    const inRangePl = rangeLower <= plBars && plBars <= rangeUpper;
    const inRangePh = rangeLower <= phBars && phBars <= rangeUpper;

    const r = i - lbR >= 0 ? rsi[i - lbR] : NaN; // rsi[lbR]
    const lowR = i - lbR >= 0 ? bars[i - lbR].low : NaN;
    const highR = i - lbR >= 0 ? bars[i - lbR].high : NaN;
    if (plFound[i]) {
      plRsi.push(r);
      plLow.push(lowR);
    }
    if (phFound[i]) {
      phRsi.push(r);
      phHigh.push(highR);
    }
    const vwPlRsi = prev(plRsi);
    const vwPlLow = prev(plLow);
    const vwPhRsi = prev(phRsi);
    const vwPhHigh = prev(phHigh);

    const bullCondAlert = lt(lowR, vwPlLow) && gt(r, vwPlRsi) && inRangePl && plFound[i];
    const hiddenBullCondAlert = gt(lowR, vwPlLow) && lt(r, vwPlRsi) && inRangePl && plFound[i];
    const bearCondAlert = gt(highR, vwPhHigh) && lt(r, vwPhRsi) && inRangePh && phFound[i];
    const hiddenBearCondAlert = lt(highR, vwPhHigh) && gt(r, vwPhRsi) && inRangePh && phFound[i];
    alertFlags[0].push(bullCondAlert);
    alertFlags[1].push(hiddenBullCondAlert);
    alertFlags[2].push(bearCondAlert);
    alertFlags[3].push(hiddenBearCondAlert);
    const bullCond = cfg.plotBull && bullCondAlert;
    const hiddenBullCond = cfg.plotHiddenBull && hiddenBullCondAlert;
    const bearCond = cfg.plotBear && bearCondAlert;
    const hiddenBearCond = cfg.plotHiddenBear && hiddenBearCondAlert;

    // plot(..., offset = -lbR): the value of bar i is drawn on bar i - lbR
    if (i - lbR < 0) continue;
    const t = barTime(bars, i - lbR, interval);
    const plV = plFound[i] ? r : NaN;
    const phV = phFound[i] ? r : NaN;
    plotRegBull.push({ time: t, value: plV, color: bullCond ? BULL : NONE });
    plotHidBull.push({ time: t, value: plV, color: hiddenBullCond ? HIDDEN_BULL : NONE });
    plotRegBear.push({ time: t, value: phV, color: bearCond ? BEAR : NONE });
    plotHidBear.push({ time: t, value: phV, color: hiddenBearCond ? HIDDEN_BEAR : NONE });

    // plotshape(cond and showLabels ? rsi[lbR] : na, offset = -lbR, location.absolute, textcolor = color.white)
    if (cfg.showLabels && !isNaN(r)) {
      if (bullCond) markers.push({ id: 'shape0', time: t, position: 'atPriceBottom', price: r, shape: 'labelUp', color: BULL, text: 'Bull', textColor: TEXT });
      if (hiddenBullCond) markers.push({ id: 'shape1', time: t, position: 'atPriceBottom', price: r, shape: 'labelUp', color: HIDDEN_BULL, text: 'H Bull', textColor: TEXT });
      if (bearCond) markers.push({ id: 'shape2', time: t, position: 'atPriceTop', price: r, shape: 'labelDown', color: BEAR, text: 'Bear', textColor: TEXT });
      if (hiddenBearCond) markers.push({ id: 'shape3', time: t, position: 'atPriceTop', price: r, shape: 'labelDown', color: HIDDEN_BEAR, text: 'H Bear', textColor: TEXT });
    }
  }

  const val = (v: number) => (Number.isFinite(v) ? v : NaN);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: val(rsi[i]), color: RSI_COL })),
      // col = out >= out[1] ? #95effb : color.orange
      plot1: bars.map((b, i) => ({
        time: b.time, value: val(out[i]), color: i > 0 && ge(out[i], out[i - 1]) ? EMA_UP : EMA_DOWN,
      })),
      plot2: plotRegBull,
      plot3: plotHidBull,
      plot4: plotRegBear,
      plot5: plotHidBear,
    },
    hlines: hlineConfig.map((h) => ({ value: h.price, options: { title: h.title, color: h.color, linestyle: h.linestyle } })),
    fills: fillConfig.map((f) => ({ plot1: f.plot1, plot2: f.plot2, options: { title: f.title, color: f.color } })),
    markers,
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Regular Bullish Divergence', message: 'Found a new Regular Bullish Divergence!' },
  { id: 'alert1', title: 'Hidden Bullish Divergence', message: 'Found a new Hidden Bullish Divergence!' },
  { id: 'alert2', title: 'Regular Bearish Divergence', message: 'Found a new Regular Bearish Divergence!' },
  { id: 'alert3', title: 'Hidden Bearish Divergence', message: 'Found a new Hidden Bearish Divergence!' },
];

export const RsiEmaMzonesWithDivergences = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
