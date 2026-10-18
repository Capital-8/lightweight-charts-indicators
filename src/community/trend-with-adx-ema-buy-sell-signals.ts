/**
 * Trend with ADX - Buy & Sell
 *
 * Directional movement (+DI / -DI) from the RMA of the true range and of the plus / minus directional movement:
 * the background is green when +DI is above -DI, else red. A fast and a slow EMA of the close are drawn; a Buy
 * label marks a fast EMA cross above the slow EMA after a cross below, a Sell label the opposite.
 * Alerts (alertcondition, `alerts` of the result): 'Trend Green Alert' (+DI above -DI), 'Trend Red Alert' (-DI above
 * +DI), 'Buy Alert' and 'Sell Alert' (the bars of the Buy / Sell labels).
 *
 * Reference: "Trend with ADX/EMA - Buy & Sell Signals" by RMPM
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrendWithAdxEmaBuySellSignalsInputs {
  /** ADX length (RMA length of the true range and directional movement) */
  len: number;
  /** Threshold (not used by the script) */
  th: number;
  /** Fast EMA length */
  len1: number;
  /** Slow EMA length */
  len2: number;
}

export const defaultInputs: TrendWithAdxEmaBuySellSignalsInputs = {
  len: 14,
  th: 20,
  len1: 5,
  len2: 8,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'ADX Length', defval: 14, min: 1 },
  { id: 'th', type: 'float', title: 'Threshold', defval: 20 },
  { id: 'len1', type: 'int', title: 'FastEMA', defval: 5, min: 1 },
  { id: 'len2', type: 'int', title: 'SlowEMA', defval: 8, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'FastEMA', color: color.green, lineWidth: 1 },
  { id: 'plot1', title: 'SlowEMA', color: color.red, lineWidth: 1 },
];

export const metadata = {
  title: 'Trend with ADX - Buy & Sell',
  shortTitle: 'Trend',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendWithAdxEmaBuySellSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const nz = (v: number) => (Number.isNaN(v) ? 0 : v);

  const tr: number[] = new Array(n);
  const dmPlus: number[] = new Array(n);
  const dmMinus: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const prevClose = i > 0 ? nz(bars[i - 1].close) : 0;
    const prevHigh = i > 0 ? nz(bars[i - 1].high) : 0;
    const prevLow = i > 0 ? nz(bars[i - 1].low) : 0;
    tr[i] = Math.max(Math.max(b.high - b.low, Math.abs(b.high - prevClose)), Math.abs(b.low - prevClose));
    dmPlus[i] = gt(b.high - prevHigh, prevLow - b.low) ? Math.max(b.high - prevHigh, 0) : 0;
    dmMinus[i] = gt(prevLow - b.low, b.high - prevHigh) ? Math.max(prevLow - b.low, 0) : 0;
  }
  const smoothedTr = A(ta.rma(S(tr), cfg.len));
  const smoothedPlus = A(ta.rma(S(dmPlus), cfg.len));
  const smoothedMinus = A(ta.rma(S(dmMinus), cfg.len));

  const ema1 = A(ta.ema(S(bars.map((b) => b.close)), cfg.len1));
  const ema2 = A(ta.ema(S(bars.map((b) => b.close)), cfg.len2));
  const longCond = A(ta.crossover(S(ema1), S(ema2)));
  const shortCond = A(ta.crossunder(S(ema1), S(ema2)));

  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const bull = 'rgb(173, 230, 174)';
  const bear = 'rgb(227, 142, 142)';
  const greenFlags: boolean[] = [], redFlags: boolean[] = [], buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  let condIni = NaN; // CondIni[1] is na on the first bar
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // A plain division: x / 0 is +-infinity (0 / 0 NaN), the comparison uses the infinite value
    const diPlus = (smoothedPlus[i] / smoothedTr[i]) * 100;
    const diMinus = (smoothedMinus[i] / smoothedTr[i]) * 100;
    bgColors.push({ time: t, color: gt(diPlus, diMinus) ? bull : bear });
    // trendGreen = DIPlus > DIMinus / trendRed = DIMinus > DIPlus
    greenFlags.push(gt(diPlus, diMinus));
    redFlags.push(gt(diMinus, diPlus));

    // CondIni := longCond ? 1 : shortCond ? -1 : CondIni[1]
    const prev = condIni;
    condIni = longCond[i] ? 1 : shortCond[i] ? -1 : prev;
    buyFlags.push(!!longCond[i] && prev === -1);
    sellFlags.push(!!shortCond[i] && prev === 1);
    if (longCond[i] && prev === -1) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'Buy',
        textColor: color.white, size: 'tiny' });
    }
    if (shortCond[i] && prev === 1) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'Sell',
        textColor: color.white, size: 'tiny' });
    }
  }

  const plot0 = bars.map((b, i) => ({ time: b.time, value: ema1[i], color: color.green }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: ema2[i], color: color.red }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    bgColors,
    alerts: alertStates(alertConditions, bars, [greenFlags, redFlags, buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Trend Green Alert', message: 'Trend Green Alert' },
  { id: 'alert1', title: 'Trend Red Alert', message: 'Trend Red Alert' },
  { id: 'alert2', title: 'Buy Alert', message: 'Buy Alert' },
  { id: 'alert3', title: 'Sell Alert', message: 'Sell Alert' },
];

export const TrendWithAdxEmaBuySellSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
