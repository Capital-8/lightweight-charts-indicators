/**
 * Enhanced VFI Buyer/Seller Pressure
 *
 * Buyer pressure (close - open) / (high - low) and seller pressure (open - close) / (high - low), drawn as histograms
 * scaled by 100 / max(buyer, seller, threshold): green / red when the pressure reaches the threshold, gray when
 * neither does. The background shows the same three states. The Volume Flow Indicator (VFI) is the sum over
 * `vfiLength` bars of the volume (capped at `vcoef` times its average) signed by the typical price change when this
 * change exceeds `coef` times the 30-bar stdev of the log returns times the close, divided by the average volume of
 * the previous bar, optionally smoothed by a 3-bar SMA; an EMA signal line and circles at their crosses.
 * Alerts (alertcondition, `alerts` of the result): 'VFI Crossover' / 'VFI Crossunder' (VFI crosses its EMA),
 * 'Strong Buying Pressure' / 'Strong Selling Pressure' (pressure above the threshold) and 'Neutral Zone'.
 *
 * Reference: "Enhanced VFI Buyer/Seller Pressure" by ask2maniish
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, array, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EnhancedVfiBuyerSellerPressureInputs {
  /** Pressure threshold of a strong buyer / seller bar */
  pressureThreshold: number;
  /** VFI length */
  vfiLength: number;
  /** Coefficient of the cutoff threshold */
  coef: number;
  /** Maximum volume cutoff multiplier */
  vcoef: number;
  /** EMA length of the signal line */
  signalLength: number;
  /** Smooth the VFI with a 3-bar SMA */
  smoothVfi: boolean;
}

export const defaultInputs: EnhancedVfiBuyerSellerPressureInputs = {
  pressureThreshold: 0.75,
  vfiLength: 130,
  coef: 0.2,
  vcoef: 2.5,
  signalLength: 5,
  smoothVfi: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'pressureThreshold', type: 'float', title: 'Pressure Threshold', defval: 0.75, min: 0, step: 0.01 },
  { id: 'vfiLength', type: 'int', title: 'VFI Length', defval: 130 },
  { id: 'coef', type: 'float', title: 'Coefficient', defval: 0.2 },
  { id: 'vcoef', type: 'float', title: 'Max. Volume Cutoff', defval: 2.5 },
  { id: 'signalLength', type: 'int', title: 'Signal Length', defval: 5 },
  { id: 'smoothVfi', type: 'bool', title: 'Smooth VFI?', defval: true },
];

const VFI_COL = String(color.new(color.aqua, 0));
const VFIMA_COL = String(color.new(color.yellow, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Buyer Pressure', color: color.green, lineWidth: 5, style: 'histogram' },
  { id: 'plot1', title: 'Seller Pressure', color: color.red, lineWidth: 5, style: 'histogram' },
  { id: 'plot2', title: 'VFI', color: VFI_COL, lineWidth: 2 },
  { id: 'plot3', title: 'VFI EMA', color: VFIMA_COL, lineWidth: 2 },
];

export const metadata = {
  title: 'Enhanced VFI Buyer/Seller Pressure',
  shortTitle: 'Enhanced VFI Buyer/Seller Pressure',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** Pine math.max: na when an argument is na */
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
/** Plots show +-infinity as na */
const fin = (x: number) => (Number.isFinite(x) ? x : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<EnhancedVfiBuyerSellerPressureInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const th = cfg.pressureThreshold;

  // Buyer / seller pressure (plain division: x / 0 is +-infinity, 0 / 0 na)
  const buyGreen = color.green;
  const buyFaded = String(color.new(color.green, 70));
  const sellRed = color.red;
  const sellFaded = String(color.new(color.red, 70));
  const bgBuy = String(color.new(color.green, 85));
  const bgSell = String(color.new(color.red, 85));
  const bgNeutral = String(color.new(color.gray, 95));
  const bgColors: BgColorData[] = [];
  const buyerPlot: { time: number; value: number; color: string }[] = [];
  const sellerPlot: { time: number; value: number; color: string }[] = [];
  const strongBuyFlags: boolean[] = [], strongSellFlags: boolean[] = [], neutralFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const buyerPressure = (b.close - b.open) / (b.high - b.low);
    const sellerPressure = (b.open - b.close) / (b.high - b.low);
    const strongBuy = ge(buyerPressure, th);
    const strongSell = ge(sellerPressure, th);
    const neutral = !strongBuy && !strongSell;
    // alertcondition(buyer_pressure > pressure_threshold) / (seller_pressure > pressure_threshold) / (neutral_signal)
    strongBuyFlags.push(gt(buyerPressure, th));
    strongSellFlags.push(gt(sellerPressure, th));
    neutralFlags.push(neutral);
    bgColors.push({ time: b.time, color: strongBuy ? bgBuy : strongSell ? bgSell : bgNeutral });
    const maxPressure = max(max(buyerPressure, sellerPressure), th);
    const histogramScale = gt(maxPressure, 0) ? 100 / maxPressure : 1;
    buyerPlot.push({
      time: b.time, value: fin(buyerPressure * histogramScale),
      color: strongBuy ? buyGreen : neutral ? color.gray : buyFaded,
    });
    sellerPlot.push({
      time: b.time, value: fin(sellerPressure * histogramScale),
      color: strongSell ? sellRed : neutral ? color.gray : sellFaded,
    });
  }

  // VFI
  const typical = bars.map((b) => (b.high + b.low + b.close) / 3);
  const inter = typical.map((t, i) => (i > 0 ? Math.log(t) - Math.log(typical[i - 1]) : NaN));
  const vinter = A(ta.stdev(S(inter), 30));
  const volume = bars.map((b) => b.volume ?? NaN);
  const smaVol = A(ta.sma(S(volume), cfg.vfiLength));
  const vcp: number[] = new Array(n);
  const raw: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const cutoff = cfg.coef * vinter[i] * bars[i].close;
    const vave = i > 0 ? smaVol[i - 1] : NaN; // ta.sma(volume, vfi_length)[1]
    const vmax = vave * cfg.vcoef;
    const vc = lt(volume[i], vmax) ? volume[i] : vmax;
    const mf = i > 0 ? typical[i] - typical[i - 1] : NaN;
    vcp[i] = gt(mf, cutoff) ? vc : lt(mf, -cutoff) ? -vc : 0;
    // sum_vcp = array.new_float(vfi_length, 0.0); array.set(sum_vcp, k, vcp[k]) for k = 0 .. vfi_length - 1
    const sumVcp: number[] = new Array(cfg.vfiLength).fill(0);
    for (let k = 0; k <= cfg.vfiLength - 1; k++) array.set(sumVcp, k, i - k >= 0 ? vcp[i - k] : NaN);
    raw[i] = array.sum(sumVcp) / vave;
  }
  // ma(x, y) => smooth_vfi ? ta.sma(x, y) : x
  const vfi = cfg.smoothVfi ? A(ta.sma(S(raw), 3)) : raw;
  const vfiS = S(vfi);
  const vfimaS = ta.ema(vfiS, cfg.signalLength);
  const vfima = A(vfimaS);
  const crossoverVfi = A(ta.crossover(vfiS, vfimaS));
  const crossunderVfi = A(ta.crossunder(vfiS, vfimaS));

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const v = vfi[i];
    if (!Number.isFinite(v)) continue;
    // plotshape(crossover_vfi ? vfi : na, "VFI Crossover", shape.circle, location.absolute, color.aqua, size.auto)
    if (crossoverVfi[i] === 1) {
      markers.push({ time: bars[i].time, position: 'atPriceMiddle', price: v, shape: 'circle', color: color.aqua, size: 'auto', id: 'shape0' });
    }
    // plotshape(crossunder_vfi ? vfi : na, "VFI Crossunder", shape.circle, location.absolute, color.yellow, size.auto)
    if (crossunderVfi[i] === 1) {
      markers.push({ time: bars[i].time, position: 'atPriceMiddle', price: v, shape: 'circle', color: color.yellow, size: 'auto', id: 'shape1' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: buyerPlot,
      plot1: sellerPlot,
      plot2: bars.map((b, i) => ({ time: b.time, value: fin(vfi[i]), color: VFI_COL })),
      plot3: bars.map((b, i) => ({ time: b.time, value: fin(vfima[i]), color: VFIMA_COL })),
    },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dotted', linewidth: 1 } }],
    markers,
    bgColors,
    alerts: alertStates(alertConditions, bars, [
      crossoverVfi.map((v) => v === 1), crossunderVfi.map((v) => v === 1), strongBuyFlags, strongSellFlags, neutralFlags,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'VFI Crossover', message: 'VFI has crossed above the EMA.' },
  { id: 'alert1', title: 'VFI Crossunder', message: 'VFI has crossed below the EMA.' },
  { id: 'alert2', title: 'Strong Buying Pressure', message: 'Buyer pressure exceeds the threshold.' },
  { id: 'alert3', title: 'Strong Selling Pressure', message: 'Seller pressure exceeds the threshold.' },
  { id: 'alert4', title: 'Neutral Zone', message: 'Buyer and seller pressures are in the neutral range.' },
];

export const EnhancedVfiBuyerSellerPressure = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
