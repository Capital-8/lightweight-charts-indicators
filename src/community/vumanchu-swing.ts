/**
 * VuManChu Swing Free
 *
 * Range filter-based momentum indicator with buy/sell signals.
 * Uses EMA-based smoothing for range size calculation and a
 * ratcheting filter that tracks price movement.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' and 'Sell Alert', true on the bars of the original's
 * longCondition / shortCondition (first long / short condition after the opposite one, from the first bar on).
 * As the original, the range size is na until both EMAs have their window (avrng from bar n, AC from bar 3n - 2):
 * while it is na the filter keeps the first source value and the bands are na. The filter is drawn from the first
 * bar (#05ff9b up / #ff0583 down / #cccccc flat at transparency 67), the BUY / SELL labels and the bar colours on
 * every bar where the original's conditions are true.
 *
 * Reference: "Range Filter - B&S Signals" (VuManChu Swing Free)
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VuManChuSwingInputs {
  swingPeriod: number;
  swingMultiplier: number;
  useBarColor: boolean;
}

export const defaultInputs: VuManChuSwingInputs = {
  swingPeriod: 20,
  swingMultiplier: 3.5,
  useBarColor: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'swingPeriod', type: 'int', title: 'Swing Period', defval: 20, min: 1 },
  { id: 'swingMultiplier', type: 'float', title: 'Swing Multiplier', defval: 3.5, min: 0.0000001, step: 0.5 },
  { id: 'useBarColor', type: 'bool', title: 'Bar Colors On/Off', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Filter', color: '#2962FF', lineWidth: 3 },
  { id: 'plot1', title: 'High Band', color: 'transparent', lineWidth: 1 },
  { id: 'plot2', title: 'Low Band', color: 'transparent', lineWidth: 1 },
];

export const metadata = {
  title: 'VuManChu Swing Free',
  shortTitle: 'VMC Swing',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<VuManChuSwingInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const { swingPeriod, swingMultiplier, useBarColor } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const closeSeries = new Series(bars, (b) => b.close);
  const closeArr = closeSeries.toArray();

  // Range Size: avrng = ema(abs(x - x[1]), n), AC = ema(avrng, wper) * qty, wper = n * 2 - 1 (x[1] is na on bar 0)
  const absChange: number[] = new Array(n);
  absChange[0] = NaN;
  for (let i = 1; i < n; i++) {
    absChange[i] = Math.abs((closeArr[i] ?? NaN) - (closeArr[i - 1] ?? NaN));
  }
  const absChangeSeries = Series.fromArray(bars, absChange);
  const avrng = ta.ema(absChangeSeries, swingPeriod);
  const wper = swingPeriod * 2 - 1;
  const acArr = ta.ema(avrng, wper).toArray().map((v) => (v == null ? NaN : v * swingMultiplier));

  // Range Filter: var rfilt = array.new_float(2, x) (the first bar's source); if x - r > rfilt[1] -> x - r;
  // if x + r < rfilt[1] -> x + r (both tests are false while r is na)
  const filt: number[] = new Array(n);
  const hBand: number[] = new Array(n);
  const lBand: number[] = new Array(n);

  let rf = NaN;
  for (let i = 0; i < n; i++) {
    const src = closeArr[i] ?? NaN;
    const r = acArr[i];
    if (i === 0) rf = src;
    const prevFilt = rf;
    if (src - r > prevFilt) rf = src - r;
    if (src + r < prevFilt) rf = src + r;
    filt[i] = rf;
    hBand[i] = rf + r;
    lBand[i] = rf - r;
  }

  // var fdir = 0.0; fdir := filt > filt[1] ? 1 : filt < filt[1] ? -1 : fdir
  const fdir: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? fdir[i - 1] : 0;
    const f1 = i > 0 ? filt[i - 1] : NaN;
    fdir[i] = filt[i] > f1 ? 1 : filt[i] < f1 ? -1 : prev;
  }

  // longCond = rng_src > filt and rng_src > rng_src[1] and upward > 0 or rng_src > filt and rng_src < rng_src[1] and upward > 0
  // shortCond = rng_src < filt and rng_src < rng_src[1] and downward > 0 or rng_src < filt and rng_src > rng_src[1] and downward > 0
  // CondIni := longCond ? 1 : shortCond ? -1 : CondIni[1]; longCondition = longCond and CondIni[1] == -1 (shortCondition
  // mirrored); rng_src[1] is na on bar 0, an unchanged source matches neither side
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  let condIni = 0;

  for (let i = 0; i < n; i++) {
    const src = closeArr[i] ?? NaN;
    const src1 = i > 0 ? (closeArr[i - 1] ?? NaN) : NaN;
    const upward = fdir[i] === 1;
    const downward = fdir[i] === -1;

    const longCond = src > filt[i] && src > src1 && upward || src > filt[i] && src < src1 && upward;
    const shortCond = src < filt[i] && src < src1 && downward || src < filt[i] && src > src1 && downward;
    const prev = condIni;
    condIni = longCond ? 1 : shortCond ? -1 : condIni;
    const longCondition = longCond && prev === -1;
    const shortCondition = shortCond && prev === 1;
    buyFlags.push(longCondition);
    sellFlags.push(shortCondition);

    if (longCondition) {
      markers.push({ id: 'shape0', time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#4CAF50', text: 'BUY', textColor: '#FFFFFF', size: 'normal' });
    }
    if (shortCondition) {
      markers.push({ id: 'shape1', time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#FF5252', text: 'SELL', textColor: '#FFFFFF', size: 'normal' });
    }

    // barcolor(use_barcolor ? bar_color : na)
    if (useBarColor) {
      let color: string;
      if (upward && src > filt[i]) {
        color = src > src1 ? '#05ff9b' : '#00b36b';
      } else if (downward && src < filt[i]) {
        color = src < src1 ? '#ff0583' : '#b8005d';
      } else {
        color = '#cccccc';
      }
      barColors.push({ id: 'barcolor0', time: bars[i].time, color });
    }
  }

  // plot(filt, color = filt_color, transp = 67, linewidth = 3): filt_color = upward ? #05ff9b : downward ? #ff0583 :
  // #cccccc, at 33 % opacity
  const plot0 = filt.map((v, i) => {
    const color = fdir[i] === 1 ? 'rgba(5,255,155,0.33)' : fdir[i] === -1 ? 'rgba(255,5,131,0.33)' : 'rgba(204,204,204,0.33)';
    return { time: bars[i].time, value: v, color };
  });

  const plot1 = hBand.map((v, i) => ({
    time: bars[i].time,
    value: v,
  }));

  const plot2 = lBand.map((v, i) => ({
    time: bars[i].time,
    value: v,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2 },
    fills: [
      { plot1: 'plot1', plot2: 'plot0', options: { color: 'rgba(0,179,107,0.08)' } },
      { plot1: 'plot2', plot2: 'plot0', options: { color: 'rgba(184,0,93,0.08)' } },
    ],
    markers,
    barColors,
    // alertcondition(longCondition, "Buy Alert") / alertcondition(shortCondition, "Sell Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'BUY' },
  { id: 'alert1', title: 'Sell Alert', message: 'SELL' },
];

export const VuManChuSwing = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
