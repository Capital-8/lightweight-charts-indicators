/**
 * Money Flow Extended
 *
 * Money Flow Index of hlc3 over `Length` bars, with a moving average (SMA / EMA / SMMA (RMA) / WMA / VWMA) of the
 * MFI. Bands at 80 / 50 / 20 with a background fill between 80 and 20, and gradient fills of the MFI above 80
 * (green) and below 20 (red). Regular divergences: an MFI pivot low (5 bars left, `Pivot Lookback` bars right) with a
 * higher MFI and a lower price low than at the previous pivot low (5 to 60 bars since the last pivot low) gives a
 * Bull label; an MFI pivot high with a lower MFI and a higher price high gives a Bear label. The divergence lines and
 * labels are drawn on the pivot bar (Pine offset = -lookbackRight).
 *
 * Alerts (alertcondition, `alerts` of the result): 'Regular Bullish Divergence' / 'Regular Bearish Divergence', true on
 * the bar on which the divergence is found (`Pivot Lookback` bars after the pivot).
 *
 * Reference: "Money Flow Extended" by alexrainman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export type MoneyFlowExtendedMAType = 'SMA' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';

export interface MoneyFlowExtendedInputs {
  /** MFI length */
  length: number;
  /** Bars right of a pivot (the divergence shows this many bars later) */
  lookbackRight: number;
  /** Detect divergences */
  calculateDivergence: boolean;
  /** Moving average type */
  maTypeInput: MoneyFlowExtendedMAType;
  /** Moving average length */
  maLengthInput: number;
}

export const defaultInputs: MoneyFlowExtendedInputs = {
  length: 14,
  lookbackRight: 5,
  calculateDivergence: true,
  maTypeInput: 'SMA',
  maLengthInput: 14,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 14, min: 1, max: 2000 },
  { id: 'lookbackRight', type: 'int', title: 'Pivot Lookback', defval: 5, min: 1, max: 5 },
  { id: 'calculateDivergence', type: 'bool', title: 'Calculate Divergence', defval: true },
  { id: 'maTypeInput', type: 'string', title: 'Type', defval: 'SMA', options: ['SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] },
  { id: 'maLengthInput', type: 'int', title: 'Length', defval: 14 },
];

const BAND = '#787B86';
const BAND_MID = String(color.new('#787B86', 50));
const BG_FILL = String(color.rgb(126, 87, 194, 90));
const NONE = String(color.new(color.white, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MF', color: '#7E57C2', lineWidth: 1 },
  { id: 'plot1', title: 'Middle Line', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'MF-based MA', color: color.yellow, lineWidth: 1 },
  { id: 'plot3', title: 'Regular Bullish', color: color.green, lineWidth: 2, display: 'pane' },
  { id: 'plot4', title: 'Regular Bearish', color: color.red, lineWidth: 2, display: 'pane' },
];

/** hline(80 / 50 / 20); Pine's default hline style is dashed */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_overbought', price: 80, title: 'Overbought', color: BAND, linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'Middle Band', color: BAND_MID, linestyle: 'dashed' },
  { id: 'hline_oversold', price: 20, title: 'Oversold', color: BAND, linestyle: 'dashed' },
];

/** fill(overbought, oversold, color = color.rgb(126, 87, 194, 90), title = "Background") */
export const fillConfig: FillConfig[] = [
  { id: 'fill_background', plot1: 'hline_overbought', plot2: 'hline_oversold', color: BG_FILL, title: 'Background' },
];

export const metadata = {
  title: 'Money Flow Extended',
  shortTitle: 'MF',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<MoneyFlowExtendedInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const lb = cfg.lookbackRight;
  const lookbackLeft = 5;
  const rangeUpper = 60;
  const rangeLower = 5;

  const volume = S(bars.map((b) => b.volume ?? NaN));
  // mf = ta.mfi(hlc3, length)
  const mf = A(ta.mfi(S(bars.map((b) => (b.high + b.low + b.close) / 3)), cfg.length, volume));
  const mfS = S(mf);
  const maFns: Record<MoneyFlowExtendedMAType, () => Series> = {
    SMA: () => ta.sma(mfS, cfg.maLengthInput),
    EMA: () => ta.ema(mfS, cfg.maLengthInput),
    'SMMA (RMA)': () => ta.rma(mfS, cfg.maLengthInput),
    WMA: () => ta.wma(mfS, cfg.maLengthInput),
    VWMA: () => ta.vwma(mfS, cfg.maLengthInput, volume),
  };
  const ma = maFns[cfg.maTypeInput] ? A(maFns[cfg.maTypeInput]()) : new Array<number>(n).fill(NaN);

  // Divergence
  const mfiLBR = (i: number) => (i - lb >= 0 ? mf[i - lb] : NaN);
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  if (cfg.calculateDivergence) {
    const pl = A(ta.pivotlow(mfS, lookbackLeft, lb));
    const ph = A(ta.pivothigh(mfS, lookbackLeft, lb));
    // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
    const plMf: number[] = [];
    const plLow: number[] = [];
    const phMf: number[] = [];
    const phHigh: number[] = [];
    // ta.barssince(plFound[1]) (both _inRange calls use plFound[1])
    let barsSince = NaN;
    for (let i = 0; i < n; i++) {
      const prevPl = i > 0 && plFound[i - 1];
      if (prevPl) barsSince = 0;
      else if (!isNaN(barsSince)) barsSince++;
      const inRange = rangeLower <= barsSince && barsSince <= rangeUpper;
      const m = mfiLBR(i);

      plFound[i] = !isNaN(pl[i]);
      const lowLBR = i - lb >= 0 ? bars[i - lb].low : NaN;
      if (plFound[i]) {
        plMf.push(m);
        plLow.push(lowLBR);
      }
      const vwPlMf = plMf.length >= 2 ? plMf[plMf.length - 2] : NaN;
      const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
      const mfiHL = gt(m, vwPlMf) && inRange;
      const priceLL = lt(lowLBR, vwPlLow);
      bullCond[i] = priceLL && mfiHL && plFound[i];

      phFound[i] = !isNaN(ph[i]);
      const highLBR = i - lb >= 0 ? bars[i - lb].high : NaN;
      if (phFound[i]) {
        phMf.push(m);
        phHigh.push(highLBR);
      }
      const vwPhMf = phMf.length >= 2 ? phMf[phMf.length - 2] : NaN;
      const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
      const mfiLH = lt(m, vwPhMf) && inRange;
      const priceHH = gt(highLBR, vwPhHigh);
      bearCond[i] = priceHH && mfiLH && phFound[i];
    }
  }

  const interval = barInterval(bars);
  const bullPlot: { time: number; value: number; color: string }[] = [];
  const bearPlot: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  for (let i = lb; i < n; i++) {
    // offset = -lookbackRight: the value of bar i is drawn on bar i - lookbackRight
    const time = barTime(bars, i - lb, interval);
    const m = mfiLBR(i);
    // plot(plFound ? mfiLBR : na, offset = -lookbackRight, linewidth = 2, color = bullCond ? bullColor : noneColor)
    bullPlot.push({ time, value: plFound[i] ? m : NaN, color: bullCond[i] ? color.green : NONE });
    bearPlot.push({ time, value: phFound[i] ? m : NaN, color: bearCond[i] ? color.red : NONE });
    // plotshape(bullCond ? mfiLBR : na, offset = -lookbackRight, text = " Bull ", shape.labelup, location.absolute,
    //   color = bullColor, textcolor = color.white)
    if (bullCond[i] && !isNaN(m)) {
      markers.push({ time, position: 'atPriceBottom', price: m, shape: 'labelUp', color: color.green, text: ' Bull ',
        textColor: color.white });
    }
    if (bearCond[i] && !isNaN(m)) {
      markers.push({ time, position: 'atPriceTop', price: m, shape: 'labelDown', color: color.red, text: ' Bear ',
        textColor: color.white });
    }
  }

  const t = (i: number) => bars[i].time;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      plot0: bars.map((_b, i) => ({ time: t(i), value: mf[i], color: '#7E57C2' })),
      // midLinePlot = plot(50, color = na, editable = false, display = display.none)
      plot1: bars.map((_b, i) => ({ time: t(i), value: 50 })),
      plot2: bars.map((_b, i) => ({ time: t(i), value: ma[i], color: color.yellow })),
      plot3: bullPlot,
      plot4: bearPlot,
    },
    hlines: [
      { value: 80, options: { title: 'Overbought', color: BAND, linestyle: 'dashed' } },
      { value: 50, options: { title: 'Middle Band', color: BAND_MID, linestyle: 'dashed' } },
      { value: 20, options: { title: 'Oversold', color: BAND, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_overbought', plot2: 'hline_oversold', options: { title: 'Background' },
        colors: new Array<string>(n).fill(BG_FILL) },
      // fill(mfiPlot, midLinePlot, 100, 80, top_color = color.new(color.green, 0), bottom_color = color.new(color.green, 100))
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Overbought Gradient Fill' },
        gradient: { topValue: new Array(n).fill(100), bottomValue: new Array(n).fill(80),
          topColor: new Array(n).fill(String(color.new(color.green, 0))),
          bottomColor: new Array(n).fill(String(color.new(color.green, 100))) } },
      // fill(mfiPlot, midLinePlot, 20, 0, top_color = color.new(color.red, 100), bottom_color = color.new(color.red, 0))
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Oversold Gradient Fill' },
        gradient: { topValue: new Array(n).fill(20), bottomValue: new Array(n).fill(0),
          topColor: new Array(n).fill(String(color.new(color.red, 100))),
          bottomColor: new Array(n).fill(String(color.new(color.red, 0))) } },
    ],
    markers,
    // alertcondition(bullCond, 'Regular Bullish Divergence') / alertcondition(bearCond, 'Regular Bearish Divergence')
    alerts: alertStates(alertConditions, bars, [bullCond, bearCond]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Regular Bullish Divergence', message: 'Found a new Regular Bullish Divergence, `Pivot Lookback` number of bars to the left of the current bar.' },
  { id: 'alert1', title: 'Regular Bearish Divergence', message: 'Found a new Regular Bearish Divergence, `Pivot Lookback` number of bars to the left of the current bar.' },
];

export const MoneyFlowExtended = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
