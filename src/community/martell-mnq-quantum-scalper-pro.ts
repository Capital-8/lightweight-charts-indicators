/**
 * Martell MNQ Quantum Scalper Pro
 *
 * Trend: ALMA(close, 150, 0.85, 6). Choppiness index over 14 bars: 100 * log10(sum(ATR(1), 14) / (highest high -
 * lowest low)) / log10(14) (50 on a zero range); trending below 50. TSI: 100 * EMA(EMA(change, 13), 25) /
 * EMA(EMA(|change|, 13), 25) with an EMA(7) signal. A long entry when close > ALMA, trending, and the TSI crosses
 * over its signal below 0; a short entry when close < ALMA, trending, and the TSI crosses under its signal above 0.
 * Only one trade at a time: stop loss and take profit at entry -+ 2.5 * ATR(14) (long) or entry +- 2.5 * ATR(14)
 * (short); the trade closes when the bar touches either level. The SL / TP lines and a green / red background show
 * the open trade. The script parameters are constants (no inputs).
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): one call on each bar of a long entry and
 * one on each bar of a short entry, with the original's messages.
 *
 * Reference: "Martell MNQ Quantum Scalper Pro" by JMartell
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BgColorData, MarkerData } from '../types';

/** The original makes alert() calls (`alertCalls` of the result) */
export const hasAlertFunction = true;

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MartellMnqQuantumScalperProInputs {}

export const defaultInputs: MartellMnqQuantumScalperProInputs = {};

export const inputConfig: InputConfig[] = [];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ALMA Macro Trend', color: String(color.new(color.blue, 20)), lineWidth: 2 },
  { id: 'plot1', title: 'Long SL', color: color.red, lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'Long TP', color: color.green, lineWidth: 2, style: 'linebr' },
  { id: 'plot3', title: 'Short SL', color: color.red, lineWidth: 2, style: 'linebr' },
  { id: 'plot4', title: 'Short TP', color: color.green, lineWidth: 2, style: 'linebr' },
];

export const metadata = {
  title: 'Martell MNQ Quantum Scalper Pro',
  shortTitle: 'Martell MNQ Quantum Scalper Pro',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

// Script constants
const ALMA_LENGTH = 150;
const ALMA_OFFSET = 0.85;
const ALMA_SIGMA = 6.0;
const CHOP_LENGTH = 14;
const CHOP_LIMIT = 50.0;
const TSI_LONG = 25;
const TSI_SHORT = 13;
const TSI_SIGNAL = 7;
const ATR_PERIOD = 14;
const ATR_MULT = 2.5;

export function calculate(
  bars: Bar[],
  _inputs: Partial<MartellMnqQuantumScalperProInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[]; alertCalls: AlertCall[] } {
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));

  // macroTrend = ta.alma(close, almaLength, almaOffset, almaSigma)
  const macroTrend = A(ta.alma(close, ALMA_LENGTH, ALMA_OFFSET, ALMA_SIGMA));

  // Choppiness index
  const atrSum = A(math.sum(ta.atr(bars, 1), CHOP_LENGTH));
  const hh = A(ta.highest(S(bars.map((b) => b.high)), CHOP_LENGTH));
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), CHOP_LENGTH));
  const chop = bars.map((_b, i) => {
    const rangeChop = hh[i] - ll[i];
    return eq(rangeChop, 0) ? 50 : (100 * Math.log10(atrSum[i] / rangeChop)) / Math.log10(CHOP_LENGTH);
  });

  // TSI: double_smooth(src, long, short) => ta.ema(ta.ema(src, short), long)
  const pc = A(ta.change(close));
  const doubleSmooth = (v: number[]) => ta.ema(ta.ema(S(v), TSI_SHORT), TSI_LONG);
  const dsPc = A(doubleSmooth(pc));
  const dsAbsPc = A(doubleSmooth(pc.map((v) => Math.abs(v))));
  // A plain division: 0 / 0 is na; ta.ema skips non-finite values
  const tsi = dsPc.map((v, i) => 100 * (v / dsAbsPc[i]));
  const tsiEma = A(ta.ema(S(tsi), TSI_SIGNAL));
  const crossUp = A(ta.crossover(S(tsi), S(tsiEma)));
  const crossDn = A(ta.crossunder(S(tsi), S(tsiEma)));
  const atr = A(ta.atr(bars, ATR_PERIOD));

  let tradeState = 0; // var int tradeState = 0
  let slPrice = NaN; // var float slPrice = na
  let tpPrice = NaN; // var float tpPrice = na

  const plots: Record<string, { time: number; value: number }[]> = {
    plot0: [], plot1: [], plot2: [], plot3: [], plot4: [],
  };
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const alertCalls: AlertCall[] = [];
  const bgLong = String(color.new(color.green, 90));
  const bgShort = String(color.new(color.red, 90));
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const isTrending = lt(chop[i], CHOP_LIMIT);
    const bullishCross = crossUp[i] === 1 && lt(tsi[i], 0);
    const bearishCross = crossDn[i] === 1 && gt(tsi[i], 0);
    const longCond = gt(b.close, macroTrend[i]) && isTrending && bullishCross;
    const shortCond = lt(b.close, macroTrend[i]) && isTrending && bearishCross;

    // A. Close the open trade when the bar touches the SL or the TP
    if (tradeState === 1) {
      if (ge(b.high, tpPrice) || le(b.low, slPrice)) tradeState = 0;
    }
    if (tradeState === -1) {
      if (le(b.low, tpPrice) || ge(b.high, slPrice)) tradeState = 0;
    }

    // B. New entries only without an open trade
    const triggerLong = longCond && tradeState === 0;
    const triggerShort = shortCond && tradeState === 0;
    if (triggerLong) {
      tradeState = 1;
      slPrice = b.close - atr[i] * ATR_MULT;
      tpPrice = b.close + atr[i] * ATR_MULT;
    }
    if (triggerShort) {
      tradeState = -1;
      slPrice = b.close + atr[i] * ATR_MULT;
      tpPrice = b.close - atr[i] * ATR_MULT;
    }

    plots.plot0.push({ time: b.time, value: fin(macroTrend[i]) });
    plots.plot1.push({ time: b.time, value: tradeState === 1 ? fin(slPrice) : NaN });
    plots.plot2.push({ time: b.time, value: tradeState === 1 ? fin(tpPrice) : NaN });
    plots.plot3.push({ time: b.time, value: tradeState === -1 ? fin(slPrice) : NaN });
    plots.plot4.push({ time: b.time, value: tradeState === -1 ? fin(tpPrice) : NaN });

    if (triggerLong) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.rgb(0, 255, 128),
        text: 'BUY', textColor: '#2962FF', size: 'normal' });
    }
    if (triggerShort) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.rgb(255, 0, 64),
        text: 'SELL', textColor: '#2962FF', size: 'normal' });
    }

    // bgcolor(tradeState == 1 ? green 90 : tradeState == -1 ? red 90 : na, title = "Trade Window")
    if (tradeState === 1) bgColors.push({ time: b.time, color: bgLong });
    else if (tradeState === -1) bgColors.push({ time: b.time, color: bgShort });

    // if triggerLong / triggerShort: alert(..., alert.freq_once_per_bar_close)
    if (triggerLong) {
      alertCalls.push({ time: b.time, message: '¡COMPRA MNQ! RR 1:1. Entrada detectada. Gestiona el riesgo.', freq: 'once_per_bar_close' });
    }
    if (triggerShort) {
      alertCalls.push({ time: b.time, message: '¡VENTA MNQ! RR 1:1. Entrada detectada. Gestiona el riesgo.', freq: 'once_per_bar_close' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    bgColors,
    alertCalls,
  };
}

export const MartellMnqQuantumScalperPro = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
