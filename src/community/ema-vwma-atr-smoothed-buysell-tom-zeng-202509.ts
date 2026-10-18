/**
 * EMA + VWMA + ATR Smoothed BuySell (merged)
 *
 * Four EMAs of the close (8, 21, 50, 200) and an ATR trailing stop: the stop follows the close at
 * `ATR multiplier * ATR` and flips side when the close crosses it. The position turns long when the close crosses
 * above the stop and short when it crosses below; Buy / Sell labels mark the first bar of each new position and the
 * bars are coloured by the position. A VWMA of the source and the average of the VWMA and the trailing stop are also
 * drawn.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' and 'Sell Signal', true on the Buy / Sell label bars.
 *
 * Reference: "EMA + ATR Smoothed BuySell (merged) - Modified" by zengtom
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EmaVwmaAtrSmoothedBuysellTomZeng202509Inputs {
  ema1Len: number;
  ema2Len: number;
  ema3Len: number;
  ema5Len: number;
  /** ATR length of the trailing stop */
  atrPeriod: number;
  /** Trailing stop distance in ATRs */
  atrMultip: number;
  /** VWMA length */
  vwmaLen: number;
  vwmaSrc: SourceType;
}

export const defaultInputs: EmaVwmaAtrSmoothedBuysellTomZeng202509Inputs = {
  ema1Len: 8,
  ema2Len: 21,
  ema3Len: 50,
  ema5Len: 200,
  atrPeriod: 21,
  atrMultip: 6.3,
  vwmaLen: 100,
  vwmaSrc: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'ema1Len', type: 'int', title: 'EMA 1', defval: 8 },
  { id: 'ema2Len', type: 'int', title: 'EMA 2', defval: 21 },
  { id: 'ema3Len', type: 'int', title: 'EMA 3', defval: 50 },
  { id: 'ema5Len', type: 'int', title: 'EMA 5', defval: 200 },
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 21 },
  { id: 'atrMultip', type: 'float', title: 'ATR Multiplier', defval: 6.3, min: 0.5, max: 1000, step: 0.1 },
  { id: 'vwmaLen', type: 'int', title: 'VWMA Smooth', defval: 100, min: 1 },
  { id: 'vwmaSrc', type: 'source', title: 'VWMA Source', defval: 'close' },
];

const VWMA_COLOR = String(color.new(color.blue, 60));
const LIME = String(color.new(color.lime, 0));
const RED = String(color.new(color.red, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 1', color: color.red, lineWidth: 1 },
  { id: 'plot1', title: 'EMA 2', color: color.orange, lineWidth: 1 },
  { id: 'plot2', title: 'EMA 3', color: color.yellow, lineWidth: 1 },
  { id: 'plot3', title: 'EMA 5', color: color.blue, lineWidth: 1 },
  { id: 'plot4', title: 'ATR Trailing Stop', color: color.gray, lineWidth: 2 },
  { id: 'plot5', title: 'VWMA', color: VWMA_COLOR, lineWidth: 1 },
  { id: 'plot6', title: 'ATR-VWMA Avg', color: color.aqua, lineWidth: 2 },
];

export const metadata = {
  title: 'EMA + ATR Smoothed BuySell (merged) - Modified',
  shortTitle: 'EMA_ATR_Combo_mod',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** nz(x, y) */
const nz = (x: number, y: number) => (isNaN(x) ? y : x);

export function calculate(
  bars: Bar[],
  inputs: Partial<EmaVwmaAtrSmoothedBuysellTomZeng202509Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const closeS = getSourceSeries(bars, 'close');
  const close = bars.map((b) => b.close);
  const t = (i: number) => bars[i].time;

  const ema1 = A(ta.ema(closeS, cfg.ema1Len));
  const ema2 = A(ta.ema(closeS, cfg.ema2Len));
  const ema3 = A(ta.ema(closeS, cfg.ema3Len));
  const ema5 = A(ta.ema(closeS, cfg.ema5Len));

  // ATR trailing stop
  const xATR = A(ta.atr(bars, cfg.atrPeriod));
  const stop: number[] = new Array(n).fill(NaN);
  const posArr: number[] = new Array(n);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const longFlags: boolean[] = [];
  const shortFlags: boolean[] = [];
  let pos = 0; // var int pos = 0
  let isLong = false; // var bool isLong = false
  let isShort = false; // var bool isShort = false
  for (let i = 0; i < n; i++) {
    const nLoss = cfg.atrMultip * xATR[i];
    const c = close[i];
    const c1 = i > 0 ? close[i - 1] : NaN;
    // prevStop = nz(xATRTrailingStop[1], close[1])
    const prevStop = nz(i > 0 ? stop[i - 1] : NaN, c1);
    let s: number;
    if (gt(c, prevStop) && gt(c1, prevStop)) s = Math.max(prevStop, c - nLoss);
    else if (lt(c, prevStop) && lt(c1, prevStop)) s = Math.min(prevStop, c + nLoss);
    else s = gt(c, prevStop) ? c - nLoss : c + nLoss;
    stop[i] = s;

    // prevStopForPos = nz(xATRTrailingStop[1], close[1]) (same value as prevStop)
    if (lt(c1, prevStop) && gt(c, s)) pos = 1;
    else if (gt(c1, prevStop) && lt(c, s)) pos = -1;
    // else pos := nz(pos[1], 0): unchanged
    posArr[i] = pos;

    const LONG = !isLong && pos === 1;
    const SHORT = !isShort && pos === -1;
    longFlags.push(LONG);
    shortFlags.push(SHORT);
    if (LONG) {
      isLong = true;
      isShort = false;
    }
    if (SHORT) {
      isLong = false;
      isShort = true;
    }
    // barcolor(isLong ? color.new(color.lime, 0) : isShort ? color.new(color.red, 0) : na)
    if (isLong) barColors.push({ time: t(i), color: LIME });
    else if (isShort) barColors.push({ time: t(i), color: RED });
    // plotshape(LONG, 'Buy', shape.labelup, location.belowbar, text 'Buy', white text, color.green, size.normal)
    if (LONG) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'labelUp', color: color.green, text: 'Buy', textColor: color.white, size: 'normal' });
    }
    // plotshape(SHORT, 'Sell', shape.labeldown, location.abovebar, text 'Sell', white text, color.red, size.normal)
    if (SHORT) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'Sell', textColor: color.white, size: 'normal' });
    }
  }

  // VWMA and the average of the VWMA and the trailing stop
  const vwma = A(ta.vwma(getSourceSeries(bars, cfg.vwmaSrc), cfg.vwmaLen, Series.fromArray(bars, bars.map((b) => b.volume ?? NaN))));
  const avg1 = bars.map((_b, i) => (isNaN(vwma[i]) || isNaN(stop[i]) ? NaN : (vwma[i] + stop[i]) / 2.0));

  const fin = (x: number) => (Number.isFinite(x) ? x : NaN);
  const line = (v: number[], col: string) => bars.map((b, i) => ({ time: b.time, value: fin(v[i]), color: col }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(ema1, color.red),
      plot1: line(ema2, color.orange),
      plot2: line(ema3, color.yellow),
      plot3: line(ema5, color.blue),
      // color = pos == 1 ? color.green : pos == -1 ? color.red : color.gray
      plot4: bars.map((b, i) => ({
        time: b.time, value: fin(stop[i]),
        color: posArr[i] === 1 ? color.green : posArr[i] === -1 ? color.red : color.gray,
      })),
      plot5: line(vwma, VWMA_COLOR),
      plot6: line(avg1, color.aqua),
    },
    markers,
    barColors,
    // alertcondition(LONG, "Buy Signal") / alertcondition(SHORT, "Sell Signal")
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell' },
];

export const EmaVwmaAtrSmoothedBuysellTomZeng202509 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
