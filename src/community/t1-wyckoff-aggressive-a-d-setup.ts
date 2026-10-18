/**
 * T1 Wyckoff Aggressive A/D Setup
 *
 * Wyckoff climax and automatic-reaction candles. A wide-range candle has a range above 1.3 times its SMA; volume
 * spikes above its SMA; the slope is the change of the linear regression of the close (offset 0 against offset 1).
 * Selling climax: a new 10-bar low, a volume spike, a close near the low, a wide range, a long lower wick and a
 * falling slope (buying climax: the mirror with a rising slope). Bullish AR: a wide range, a close near the high, a
 * volume spike and a falling slope (bearish AR: the mirror). SOS / SOW: a wide range, a close near the high / low, a
 * volume spike and a close that breaks the highest / lowest close of the lookback. "Reversal" mode: a Long label on a
 * bullish AR within the structure lookback of a selling climax (Short: bearish AR after a buying climax).
 * "Trend Following" mode: an SOS within 1.5 times the lookback of a selling climax and within the lookback of a
 * bullish AR (Short: SOW, buying climax, bearish AR). The background is green on a rising slope and red on a falling
 * slope.
 *
 * Reference: "[Teyo69] T1 Wyckoff Aggressive A/D Setup" by Teyo69
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Teyo69
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';

export interface T1WyckoffAggressiveADSetupInputs {
  volLen: number;
  signalOption: 'Reversal' | 'Trend Following';
  slopeLen: number;
  rangeLen: number;
  wickThresh: number;
  closeThresh: number;
  breakoutLookback: number;
  structureLookback: number;
}

export const defaultInputs: T1WyckoffAggressiveADSetupInputs = {
  volLen: 20,
  signalOption: 'Reversal',
  slopeLen: 10,
  rangeLen: 20,
  wickThresh: 0.4,
  closeThresh: 0.3,
  breakoutLookback: 20,
  structureLookback: 10,
};

export const inputConfig: InputConfig[] = [
  { id: 'volLen', type: 'int', title: 'Volume MA Length', defval: 20 },
  { id: 'signalOption', type: 'string', title: 'Signal Options', defval: 'Reversal', options: ['Reversal', 'Trend Following'] },
  { id: 'slopeLen', type: 'int', title: 'Linear Reg Slope Length', defval: 10 },
  { id: 'rangeLen', type: 'int', title: 'Candle Range MA Length', defval: 20 },
  { id: 'wickThresh', type: 'float', title: 'Wick % of Candle', defval: 0.4 },
  { id: 'closeThresh', type: 'float', title: 'Close Near Low Threshold (0-1)', defval: 0.3 },
  { id: 'breakoutLookback', type: 'int', title: 'Breakout Lookback High', defval: 20 },
  { id: 'structureLookback', type: 'int', title: 'Structure Threshold Lookback', defval: 10 },
];

// Markers and background colours only (plotshape, bgcolor)
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: '[Teyo69] T1 Wyckoff Aggressive A/D Setup',
  shortTitle: '[Teyo69] T1 Wyckoff Aggressive A/D Setup',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<T1WyckoffAggressiveADSetupInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));
  const high = S(bars.map((b) => b.high));
  const low = S(bars.map((b) => b.low));
  const vol = bars.map((b) => (b.volume === undefined || b.volume === null ? NaN : b.volume));
  const range = bars.map((b) => b.high - b.low);

  const volSMA = A(ta.sma(S(vol), cfg.volLen));
  const rangeSMA = A(ta.sma(S(range), cfg.rangeLen));
  const lin0 = A(ta.linreg(close, cfg.slopeLen, 0));
  const lin1 = A(ta.linreg(close, cfg.slopeLen, 1));
  const lowest10 = A(ta.lowest(low, 10));
  const highest10 = A(ta.highest(high, 10));
  const highestClose = A(ta.highest(close, cfg.breakoutLookback));
  const lowestClose = A(ta.lowest(close, cfg.breakoutLookback));
  const prev = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);

  const fallingSlope: boolean[] = new Array(n);
  const risingSlope: boolean[] = new Array(n);
  const sellingClimax: boolean[] = new Array(n);
  const buyingClimax: boolean[] = new Array(n);
  const bullishAr: boolean[] = new Array(n);
  const bearishAr: boolean[] = new Array(n);
  const sos: boolean[] = new Array(n);
  const sow: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const candleRange = range[i];
    fallingSlope[i] = lt(lin0[i], lin1[i]);
    risingSlope[i] = gt(lin0[i], lin1[i]);
    const volSpike = gt(vol[i], volSMA[i]);
    const makesNewLow = lt(b.low, prev(lowest10, i));
    const makesNewHigh = gt(b.high, prev(highest10, i));
    // Plain divisions: a zero range gives 0 / 0 = na (false)
    const closeNearLow = lt((b.close - b.low) / candleRange, cfg.closeThresh);
    const closeNearHigh = lt((b.high - b.close) / candleRange, cfg.closeThresh);
    const hasLowerWick = gt(b.open - b.low, candleRange * cfg.wickThresh);
    const hasUpperWick = gt(b.high - b.open, candleRange * cfg.wickThresh);
    const isWideRange = gt(candleRange, rangeSMA[i] * 1.3);
    const breaksStructure = gt(b.close, prev(highestClose, i));
    const breaksStructureLow = lt(b.close, prev(lowestClose, i));
    sellingClimax[i] = makesNewLow && volSpike && closeNearLow && isWideRange && hasLowerWick && fallingSlope[i];
    buyingClimax[i] = makesNewHigh && volSpike && closeNearHigh && isWideRange && hasUpperWick && risingSlope[i];
    bullishAr[i] = isWideRange && closeNearHigh && volSpike && fallingSlope[i];
    bearishAr[i] = isWideRange && closeNearLow && volSpike && risingSlope[i];
    sos[i] = isWideRange && closeNearHigh && volSpike && breaksStructure;
    sow[i] = isWideRange && closeNearLow && volSpike && breaksStructureLow;
  }

  const trend = cfg.signalOption === 'Trend Following';
  const reversal = cfg.signalOption === 'Reversal';
  const sbp1Mult = trend ? cfg.structureLookback * 1.5 : cfg.structureLookback * 1;
  const since = (c: boolean[]) => A(ta.barssince(S(c.map((x) => (x ? 1 : 0)))));
  const sinceSellingClimax = since(sellingClimax);
  const sinceBullishAr = since(bullishAr);
  const sinceBuyingClimax = since(buyingClimax);
  const sinceBearishAr = since(bearishAr);

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const bgRising = String(color.new(color.green, 85));
  const bgFalling = String(color.new(color.red, 85));
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const bullP1 = le(sinceSellingClimax[i], sbp1Mult);
    const bullP2 = le(sinceBullishAr[i], cfg.structureLookback);
    const bearP1 = le(sinceBuyingClimax[i], sbp1Mult);
    const bearP2 = le(sinceBearishAr[i], cfg.structureLookback);
    const agWsBull = reversal ? bullP1 && bullishAr[i] : trend ? bullP1 && bullP2 && sos[i] : false;
    const agWsBear = reversal ? bearP1 && bearishAr[i] : trend ? bearP1 && bearP2 && sow[i] : false;

    // Two bgcolor calls (layers): rising slope green, falling slope red
    if (risingSlope[i]) bgColors.push({ time: t, color: bgRising });
    if (fallingSlope[i]) bgColors.push({ time: t, color: bgFalling });
    // Both plotshape calls use location.belowbar and shape.labelup
    if (agWsBull) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'Long',
        textColor: color.white, id: 'shape0' });
    }
    if (agWsBear) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.red, text: 'Short',
        textColor: color.white, id: 'shape1' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    bgColors,
  };
}

export const T1WyckoffAggressiveADSetup = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
