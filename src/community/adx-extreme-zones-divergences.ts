/**
 * ADX Extreme Zones + Divergences
 *
 * The ADX of ta.dmi(DI length, ADX smoothing), coloured with the extreme colour at or above the extreme level, with
 * a fill between the ADX and the extreme level there. Optional +DI / -DI lines and dashed / dotted reference lines at
 * the cutoff and extreme levels. Divergences: pivot highs / lows of the ADX (left bars, right bars or 1 bar with fast
 * confirmation) are compared with the previous pivot, spaced by the min / max bars between pivots: regular bullish
 * (price lower low, ADX higher low), hidden bullish (price higher low, ADX lower low), regular bearish (price higher
 * high, ADX lower high) and hidden bearish (price lower high, ADX higher high), with a sensitivity % on both legs.
 * Lines and labels are drawn on the pivot bar.
 *
 * Alerts (alertcondition, `alerts` of the result): the four divergences (with the master toggle, whatever the
 * per-kind display toggles), the ADX crossing over / under the extreme level and +DI crossing over / under -DI.
 *
 * Reference: "ADX Extreme Zones + Divergences [tradeviZion]" by TradeVizion
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TradeVizion
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AdxExtremeZonesDivergencesInputs {
  /** DI length (first argument of ta.dmi) */
  diLen: number;
  /** ADX smoothing (second argument of ta.dmi) */
  adxSmooth: number;
  showPlusDI: boolean;
  showMinusDI: boolean;
  plusDIColor: string;
  minusDIColor: string;
  /** DI line width (the plot width is static: default 1) */
  diLineWidth: number;
  /** ADX extreme level (highlight at or above) */
  extremeLevel: number;
  /** ADX cutoff line level */
  cutoffLevel: number;
  showCutoff: boolean;
  showExtreme: boolean;
  showExtremeFill: boolean;
  extremeFillColor: string;
  adxNormalColor: string;
  adxExtremeColor: string;
  /** Master toggle of the divergence engine */
  showDivergences: boolean;
  pivotLeftBars: number;
  pivotRightBars: number;
  minBarsBetweenPivots: number;
  maxBarsBetweenPivots: number;
  /** Sensitivity % between consecutive pivot legs */
  sensitivity: number;
  /** Fast pivot confirm: one right bar */
  fastPivotConfirm: boolean;
  showRegularBullish: boolean;
  showRegularBearish: boolean;
  regularBullishColor: string;
  regularBearishColor: string;
  showHiddenBullish: boolean;
  showHiddenBearish: boolean;
  hiddenBullishColor: string;
  hiddenBearishColor: string;
  /** Divergence line width (the plot width is static: default 2) */
  divLineWidth: number;
  divTextColor: string;
}

export const defaultInputs: AdxExtremeZonesDivergencesInputs = {
  diLen: 7,
  adxSmooth: 7,
  showPlusDI: false,
  showMinusDI: false,
  plusDIColor: String(color.new('#26a69a', 0)),
  minusDIColor: String(color.new('#ef5350', 0)),
  diLineWidth: 1,
  extremeLevel: 60,
  cutoffLevel: 40,
  showCutoff: true,
  showExtreme: true,
  showExtremeFill: true,
  extremeFillColor: String(color.new('#f23645', 80)),
  adxNormalColor: '#787B86',
  adxExtremeColor: '#f23645',
  showDivergences: true,
  pivotLeftBars: 5,
  pivotRightBars: 5,
  minBarsBetweenPivots: 5,
  maxBarsBetweenPivots: 60,
  sensitivity: 2.0,
  fastPivotConfirm: true,
  showRegularBullish: true,
  showRegularBearish: true,
  regularBullishColor: color.green,
  regularBearishColor: color.red,
  showHiddenBullish: false,
  showHiddenBearish: false,
  hiddenBullishColor: String(color.new(color.green, 80)),
  hiddenBearishColor: String(color.new(color.red, 80)),
  divLineWidth: 2,
  divTextColor: color.white,
};

export const inputConfig: InputConfig[] = [
  { id: 'diLen', type: 'int', title: 'DI length', defval: 7, min: 1 },
  { id: 'adxSmooth', type: 'int', title: 'ADX smoothing', defval: 7, min: 1 },
  { id: 'showPlusDI', type: 'bool', title: 'Show +DI line', defval: false },
  { id: 'showMinusDI', type: 'bool', title: 'Show -DI line', defval: false },
  { id: 'plusDIColor', type: 'color', title: '+DI colour', defval: defaultInputs.plusDIColor },
  { id: 'minusDIColor', type: 'color', title: '-DI colour', defval: defaultInputs.minusDIColor },
  { id: 'diLineWidth', type: 'int', title: 'DI line width', defval: 1, min: 1, max: 4 },
  { id: 'extremeLevel', type: 'int', title: 'ADX extreme (highlight ≥)', defval: 60, min: 1, max: 100 },
  { id: 'cutoffLevel', type: 'int', title: 'ADX cutoff (line)', defval: 40, min: 1, max: 100 },
  { id: 'showCutoff', type: 'bool', title: 'Show cutoff line', defval: true },
  { id: 'showExtreme', type: 'bool', title: 'Show extreme line', defval: true },
  { id: 'showExtremeFill', type: 'bool', title: 'Fill ADX extreme zone', defval: true },
  { id: 'extremeFillColor', type: 'color', title: 'Fill colour', defval: defaultInputs.extremeFillColor },
  { id: 'adxNormalColor', type: 'color', title: 'ADX normal', defval: '#787B86' },
  { id: 'adxExtremeColor', type: 'color', title: 'ADX extreme', defval: '#f23645' },
  { id: 'showDivergences', type: 'bool', title: 'Show ADX divergences', defval: true },
  { id: 'pivotLeftBars', type: 'int', title: 'Pivot left bars', defval: 5, min: 0 },
  { id: 'pivotRightBars', type: 'int', title: 'Pivot right bars', defval: 5, min: 0 },
  { id: 'minBarsBetweenPivots', type: 'int', title: 'Min bars between pivots', defval: 5, min: 0 },
  { id: 'maxBarsBetweenPivots', type: 'int', title: 'Max bars between pivots', defval: 60, min: 1 },
  { id: 'sensitivity', type: 'float', title: 'Sensitivity %', defval: 2.0, min: 0.1, max: 10.0, step: 0.1 },
  { id: 'fastPivotConfirm', type: 'bool', title: 'Fast pivot confirm', defval: true },
  { id: 'showRegularBullish', type: 'bool', title: 'Regular bullish', defval: true },
  { id: 'showRegularBearish', type: 'bool', title: 'Regular bearish', defval: true },
  { id: 'regularBullishColor', type: 'color', title: 'Regular bullish colour', defval: color.green },
  { id: 'regularBearishColor', type: 'color', title: 'Regular bearish colour', defval: color.red },
  { id: 'showHiddenBullish', type: 'bool', title: 'Hidden bullish', defval: false },
  { id: 'showHiddenBearish', type: 'bool', title: 'Hidden bearish', defval: false },
  { id: 'hiddenBullishColor', type: 'color', title: 'Hidden bullish colour', defval: defaultInputs.hiddenBullishColor },
  { id: 'hiddenBearishColor', type: 'color', title: 'Hidden bearish colour', defval: defaultInputs.hiddenBearishColor },
  { id: 'divLineWidth', type: 'int', title: 'Divergence line width', defval: 2, min: 1, max: 4 },
  { id: 'divTextColor', type: 'color', title: 'Divergence label text', defval: color.white },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ADX', color: '#787B86', lineWidth: 2 },
  { id: 'plot1', title: 'Extreme level (fill)', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: '+DI', color: defaultInputs.plusDIColor, lineWidth: 1 },
  { id: 'plot3', title: '-DI', color: defaultInputs.minusDIColor, lineWidth: 1 },
  { id: 'plot4', title: 'Reg bull line', color: color.green, lineWidth: 2 },
  { id: 'plot5', title: 'Hidden bull line', color: defaultInputs.hiddenBullishColor, lineWidth: 2 },
  { id: 'plot6', title: 'Reg bear line', color: color.red, lineWidth: 2 },
  { id: 'plot7', title: 'Hidden bear line', color: defaultInputs.hiddenBearishColor, lineWidth: 2 },
];

export const metadata = {
  title: 'ADX Extreme Zones + Divergences [tradeviZion]',
  shortTitle: 'tZv-ADXex',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<AdxExtremeZonesDivergencesInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const interval = barInterval(bars);
  const t = (i: number) => bars[i].time;

  // [diPlus, diMinus, adxValue] = ta.dmi(diLen, adxSmooth)
  const [plusS, minusS, adxS] = ta.dmi(bars, cfg.diLen, cfg.adxSmooth);
  const diPlus = A(plusS);
  const diMinus = A(minusS);
  const adx = A(adxS);

  // Divergence engine
  const bullSens = 1.0 + cfg.sensitivity / 100.0;
  const bearSens = 1.0 - cfg.sensitivity / 100.0;
  const divR = cfg.fastPivotConfirm ? 1 : cfg.pivotRightBars;
  const adxPH = A(ta.pivothigh(S(adx), cfg.pivotLeftBars, divR));
  const adxPL = A(ta.pivotlow(S(adx), cfg.pivotLeftBars, divR));

  const back = (a: number[], i: number) => (i - divR >= 0 ? a[i - divR] : NaN);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullPlot: boolean[] = new Array(n).fill(false);
  const hiBullPlot: boolean[] = new Array(n).fill(false);
  const bearPlot: boolean[] = new Array(n).fill(false);
  const hiBearPlot: boolean[] = new Array(n).fill(false);
  // div*Alert: the conditions without the per-kind display toggles (div*Plot = toggle and div*Alert)
  const bullAlert: boolean[] = new Array(n).fill(false);
  const hiBullAlert: boolean[] = new Array(n).fill(false);
  const bearAlert: boolean[] = new Array(n).fill(false);
  const hiBearAlert: boolean[] = new Array(n).fill(false);
  // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
  const plAdx: number[] = [];
  const plLow: number[] = [];
  const phAdx: number[] = [];
  const phHigh: number[] = [];
  let bsPl = NaN; // ta.barssince(plFound[1])
  let bsPh = NaN; // ta.barssince(phFound[1])
  for (let i = 0; i < n; i++) {
    const a = back(adx, i);
    const lo = back(lows, i);
    const hi = back(highs, i);
    plFound[i] = !isNaN(adxPL[i]);
    phFound[i] = !isNaN(adxPH[i]);

    const prevPl = i > 0 && plFound[i - 1];
    const prevPh = i > 0 && phFound[i - 1];
    bsPl = prevPl ? 0 : isNaN(bsPl) ? NaN : bsPl + 1;
    bsPh = prevPh ? 0 : isNaN(bsPh) ? NaN : bsPh + 1;
    const plSpaced = cfg.minBarsBetweenPivots <= bsPl && bsPl <= cfg.maxBarsBetweenPivots;
    const phSpaced = cfg.minBarsBetweenPivots <= bsPh && bsPh <= cfg.maxBarsBetweenPivots;

    if (plFound[i]) {
      plAdx.push(a);
      plLow.push(lo);
    }
    if (phFound[i]) {
      phAdx.push(a);
      phHigh.push(hi);
    }
    const vwPlAdx = plAdx.length >= 2 ? plAdx[plAdx.length - 2] : NaN;
    const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
    const vwPhAdx = phAdx.length >= 2 ? phAdx[phAdx.length - 2] : NaN;
    const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;

    // Regular bullish: price LL, ADX HL
    const adxHlReg = gt(a, bullSens * vwPlAdx) && plSpaced;
    const priceLlReg = lt(lo, bearSens * vwPlLow);
    bullAlert[i] = cfg.showDivergences && priceLlReg && adxHlReg && plFound[i];
    bullPlot[i] = cfg.showRegularBullish && bullAlert[i];
    // Hidden bullish: price HL, ADX LL
    const adxLlHi = lt(a, bearSens * vwPlAdx) && plSpaced;
    const priceHlHi = gt(lo, bullSens * vwPlLow);
    hiBullAlert[i] = cfg.showDivergences && priceHlHi && adxLlHi && plFound[i];
    hiBullPlot[i] = cfg.showHiddenBullish && hiBullAlert[i];
    // Regular bearish: price HH, ADX LH
    const adxLhReg = lt(a, bearSens * vwPhAdx) && phSpaced;
    const priceHhReg = gt(hi, bullSens * vwPhHigh);
    bearAlert[i] = cfg.showDivergences && priceHhReg && adxLhReg && phFound[i];
    bearPlot[i] = cfg.showRegularBearish && bearAlert[i];
    // Hidden bearish: price LH, ADX HH
    const adxHhHi = gt(a, bullSens * vwPhAdx) && phSpaced;
    const priceLhHi = lt(hi, bearSens * vwPhHigh);
    hiBearAlert[i] = cfg.showDivergences && priceLhHi && adxHhHi && phFound[i];
    hiBearPlot[i] = cfg.showHiddenBearish && hiBearAlert[i];
  }

  // Plots
  const extLvl = cfg.extremeLevel;
  const isExtreme = (i: number) => !isNaN(adx[i]) && ge(adx[i], extLvl);
  const divNone = String(color.new(color.white, 100));
  const P = (f: (i: number) => Point | null): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p = f(i);
      if (p) out.push(p);
    }
    return out;
  };
  // plot(..., offset = -divR): the value of bar i is drawn on bar i - divR
  const divLine = (found: boolean[], on: boolean[], col: string) => P((i) => (i - divR < 0 ? null : {
    time: barTime(bars, i - divR, interval),
    value: found[i] ? back(adx, i) : NaN,
    color: on[i] ? col : divNone,
  }));
  const plots: Record<string, Point[]> = {
    plot0: P((i) => ({ time: t(i), value: adx[i], color: isExtreme(i) ? cfg.adxExtremeColor : cfg.adxNormalColor })),
    plot1: P((i) => ({ time: t(i), value: extLvl })),
    plot2: P((i) => ({ time: t(i), value: diPlus[i], color: cfg.showPlusDI ? cfg.plusDIColor : 'transparent' })),
    plot3: P((i) => ({ time: t(i), value: diMinus[i], color: cfg.showMinusDI ? cfg.minusDIColor : 'transparent' })),
    plot4: divLine(plFound, bullPlot, cfg.regularBullishColor),
    plot5: divLine(plFound, hiBullPlot, cfg.hiddenBullishColor),
    plot6: divLine(phFound, bearPlot, cfg.regularBearishColor),
    plot7: divLine(phFound, hiBearPlot, cfg.hiddenBearishColor),
  };

  // fill(adxPlot, extPlotForFill, showExtFill and not na(adx) and adx >= extLvl ? cExtFill : na)
  const fills = [{
    plot1: 'plot0', plot2: 'plot1',
    colors: bars.map((_b, i) => (cfg.showExtremeFill && isExtreme(i) ? cfg.extremeFillColor : 'transparent')),
  }];

  // plotshape(cond ? adxValue[divR] : na, offset = -divR, location.absolute, size.tiny)
  const markers: MarkerData[] = [];
  for (let i = divR; i < n; i++) {
    const price = back(adx, i);
    if (isNaN(price)) continue;
    const time = barTime(bars, i - divR, interval);
    const add = (id: string, on: boolean, text: string, up: boolean, col: string) => {
      if (on) {
        markers.push({ id, time, position: up ? 'atPriceBottom' : 'atPriceTop', price, shape: up ? 'labelUp' : 'labelDown',
          color: col, text, textColor: cfg.divTextColor, size: 'tiny' });
      }
    };
    add('shape0', bullPlot[i], 'Bull', true, cfg.regularBullishColor);
    add('shape1', hiBullPlot[i], 'H Bull', true, cfg.hiddenBullishColor);
    add('shape2', bearPlot[i], 'Bear', false, cfg.regularBearishColor);
    add('shape3', hiBearPlot[i], 'H Bear', false, cfg.hiddenBearishColor);
  }

  // hline(showCutoff ? midLvl : na, ...), hline(showExtreme ? extLvl : na, ...): an na level draws no line
  const hlines = [];
  if (cfg.showCutoff) {
    hlines.push({ value: cfg.cutoffLevel, options: { title: 'ADX cutoff', color: String(color.new(color.gray, 40)), linestyle: 'dashed' as const } });
  }
  if (cfg.showExtreme) {
    hlines.push({ value: extLvl, options: { title: 'ADX extreme', color: String(color.new(cfg.adxExtremeColor, 60)), linestyle: 'dotted' as const } });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines,
    fills,
    markers,
    // adxEnterExt / adxExitExt = ta.crossover / ta.crossunder(adxValue, extLvl);
    // diBullCross / diBearCross = ta.crossover / ta.crossunder(diPlus, diMinus)
    alerts: alertStates(alertConditions, bars, [
      bullAlert, bearAlert, hiBullAlert, hiBearAlert,
      crossedOver(adx, extLvl), crossedUnder(adx, extLvl),
      crossedOver(diPlus, diMinus), crossedUnder(diPlus, diMinus),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ADX divergence - regular bullish', message: 'tZv-ADXex: regular bullish divergence vs price.' },
  { id: 'alert1', title: 'ADX divergence - regular bearish', message: 'tZv-ADXex: regular bearish divergence vs price.' },
  { id: 'alert2', title: 'ADX divergence - hidden bullish', message: 'tZv-ADXex: hidden bullish divergence vs price.' },
  { id: 'alert3', title: 'ADX divergence - hidden bearish', message: 'tZv-ADXex: hidden bearish divergence vs price.' },
  { id: 'alert4', title: 'ADX enters extreme zone', message: 'tZv-ADXex: ADX crossed into the extreme zone.' },
  { id: 'alert5', title: 'ADX exits extreme zone', message: 'tZv-ADXex: ADX crossed back below the extreme zone.' },
  { id: 'alert6', title: 'DI cross - bullish (+DI over -DI)', message: 'tZv-ADXex: +DI crossed above -DI (bullish direction).' },
  { id: 'alert7', title: 'DI cross - bearish (-DI over +DI)', message: 'tZv-ADXex: -DI crossed above +DI (bearish direction).' },
];

export const AdxExtremeZonesDivergences = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
