/**
 * CVD & Big Trade Detector
 *
 * Splits the bar volume into buy volume ((close - low) / range * volume) and sell volume ((high - close) / range *
 * volume), 0 on a zero range. The cumulative delta (buy - sell) is drawn as floating candles: open = the previous
 * cumulative delta (0 on the first bar), close = the cumulative delta, high / low = the larger / smaller of both;
 * up colour when close >= open. A big buy (sell) is a buy (sell) volume above the SMA + mult * stdev of the
 * previous `lookback` bars of that volume: a circle at the candle close.
 *
 * Reference: "Big Trade CVD (Floating Bars)" by colacorn
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © HK
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';

export interface CvdBigTradeDetectorInputs {
  /** SMA / stdev length of the big trade thresholds */
  btLookback: number;
  /** Threshold: SMA + this * stdev */
  btMult: number;
  /** Candle colour when the CVD rises or stays */
  cvdUpColor: string;
  /** Candle colour when the CVD falls */
  cvdDownColor: string;
  /** Big buy marker colour */
  btBuyColor: string;
  /** Big sell marker colour */
  btSellColor: string;
}

export const defaultInputs: CvdBigTradeDetectorInputs = {
  btLookback: 50,
  btMult: 2.0,
  // input.color(color.new(color.teal, 10)): the input stores alpha 0.9, byte 230
  cvdUpColor: '#089981E6',
  cvdDownColor: '#880E4FE6',
  btBuyColor: '#00E676',
  btSellColor: '#F23645',
};

export const inputConfig: InputConfig[] = [
  { id: 'btLookback', type: 'int', title: 'Lookback Period', defval: 50, min: 10 },
  { id: 'btMult', type: 'float', title: 'Sensitivity (Sigma)', defval: 2.0, min: 1.0, step: 0.1 },
  { id: 'cvdUpColor', type: 'color', title: 'CVD Up Color', defval: '#089981E6' },
  { id: 'cvdDownColor', type: 'color', title: 'CVD Down Color', defval: '#880E4FE6' },
  { id: 'btBuyColor', type: 'color', title: 'Big Buy Marker', defval: '#00E676' },
  { id: 'btSellColor', type: 'color', title: 'Big Sell Marker', defval: '#F23645' },
];

// No plot(): the outputs are the CVD candles and the big trade markers
export const plotConfig: PlotConfig[] = [];

export const plotCandleConfig = [{ id: 'cvd', title: 'CVD Floating Bars' }];

export const metadata = {
  title: 'Big Trade CVD (Floating Bars)',
  shortTitle: 'IOM CVD Float',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<CvdBigTradeDetectorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const rawBuy: number[] = new Array(n);
  const rawSell: number[] = new Array(n);
  const delta: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const range = b.high - b.low;
    const volume = b.volume ?? NaN;
    rawBuy[i] = eq(range, 0) ? 0 : ((b.close - b.low) / range) * volume;
    rawSell[i] = eq(range, 0) ? 0 : ((b.high - b.close) / range) * volume;
    delta[i] = rawBuy[i] - rawSell[i];
  }
  const cvd = A(ta.cum(S(delta)));
  const avgBuy = A(ta.sma(S(rawBuy), cfg.btLookback));
  const stdBuy = A(ta.stdev(S(rawBuy), cfg.btLookback));
  const avgSell = A(ta.sma(S(rawSell), cfg.btLookback));
  const stdSell = A(ta.stdev(S(rawSell), cfg.btLookback));

  const candles: PlotCandleData[] = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const cvdOpen = i > 0 && !isNaN(cvd[i - 1]) ? cvd[i - 1] : 0; // na(cvd[1]) ? 0 : cvd[1]
    const cvdClose = cvd[i];
    const cvdHigh = Math.max(cvdOpen, cvdClose);
    const cvdLow = Math.min(cvdOpen, cvdClose);
    const col = ge(cvdClose, cvdOpen) ? cfg.cvdUpColor : cfg.cvdDownColor;
    // plotcandle(cvd_open, cvd_high, cvd_low, cvd_close, color = wickcolor = bordercolor = bar_color)
    candles.push({ time: t, open: cvdOpen, high: cvdHigh, low: cvdLow, close: cvdClose, color: col, wickColor: col, borderColor: col });

    // thresholds from the previous bar: ta.sma(...)[1] + ta.stdev(...)[1] * bt_mult
    const threshBuy = i > 0 ? avgBuy[i - 1] + stdBuy[i - 1] * cfg.btMult : NaN;
    const threshSell = i > 0 ? avgSell[i - 1] + stdSell[i - 1] * cfg.btMult : NaN;
    // plotshape(is_bt_buy ? cvd_close : na, shape.circle, location.absolute, c_bt_buy, size.tiny)
    if (gt(rawBuy[i], threshBuy) && !isNaN(cvdClose)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: cvdClose, shape: 'circle', color: cfg.btBuyColor, size: 'tiny', id: 'shape0' });
    }
    if (gt(rawSell[i], threshSell) && !isNaN(cvdClose)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: cvdClose, shape: 'circle', color: cfg.btSellColor, size: 'tiny', id: 'shape1' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    plotCandles: { cvd: candles },
  };
}

export const CvdBigTradeDetector = { calculate, metadata, defaultInputs, inputConfig, plotConfig, plotCandleConfig };
