/**
 * Big Trades Whale Detector [Volume Anomalies]
 *
 * Splits the bar volume into a buy part (close - low) / (high - low) * volume and a sell part
 * (high - close) / (high - low) * volume (0 on a zero range). A part is a big trade when it is above the SMA + k x
 * stdev of the previous `lookback` bars (both taken one bar back), with k = sensitivity (small), sensitivity + 1.5
 * (medium) and sensitivity + 3 (large). Circles of three sizes at the mean of close and low (buys) or of close and
 * high (sells).
 *
 * Reference: "Big Trades Whale Detector [Volume Anomalies] By HK" by colacorn
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © HK
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PineSize } from '../types';

export interface BigTradesWhaleDetectorInputs {
  /** Lookback period of the SMA / stdev */
  lookback: number;
  /** Sensitivity (sigma) */
  mult: number;
  buyColor: string;
  sellColor: string;
}

export const defaultInputs: BigTradesWhaleDetectorInputs = {
  lookback: 5,
  mult: 3.0,
  // color.new(color.lime, 20) / color.new(color.red, 20) as input defaults (alpha 0.8)
  buyColor: 'rgba(0, 230, 118, 0.8)',
  sellColor: 'rgba(242, 54, 69, 0.8)',
};

const GROUP = 'Big Trade (Whale) Settings';

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Lookback Period', defval: 5, min: 5, group: GROUP },
  { id: 'mult', type: 'float', title: 'Sensitivity (Sigma)', defval: 3.0, min: 1.0, step: 0.1, group: GROUP,
    tooltip: '2.0 = Signifikant, 4.0 = Extrem.' },
  { id: 'buyColor', type: 'color', title: 'Big Buy Color', defval: 'rgba(0, 230, 118, 0.8)', group: GROUP },
  { id: 'sellColor', type: 'color', title: 'Big Sell Color', defval: 'rgba(242, 54, 69, 0.8)', group: GROUP },
];

/** No plot(): the outputs are the six plotshape circles */
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Big Trades Whale Detector [Volume Anomalies] By HK',
  shortTitle: 'Big Trades Detector',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<BigTradesWhaleDetectorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const rawBuy: number[] = new Array(n);
  const rawSell: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];
    const volume = bars[i].volume ?? NaN;
    const range = high - low;
    rawBuy[i] = eq(range, 0) ? 0 : ((close - low) / range) * volume;
    rawSell[i] = eq(range, 0) ? 0 : ((high - close) / range) * volume;
  }
  const smaBuy = A(ta.sma(S(rawBuy), cfg.lookback));
  const stdBuy = A(ta.stdev(S(rawBuy), cfg.lookback));
  const smaSell = A(ta.sma(S(rawSell), cfg.lookback));
  const stdSell = A(ta.stdev(S(rawSell), cfg.lookback));

  const markers: MarkerData[] = [];
  const sizes: PineSize[] = ['small', 'normal', 'large'];
  // tier 0: t1 and not t2, tier 1: t2 and not t3, tier 2: t3 (t1 / t2 / t3: above avg + std * (mult, mult + 1.5,
  // mult + 3))
  const tier = (raw: number, avg: number, std: number): number => {
    const t1 = gt(raw, avg + std * cfg.mult);
    const t2 = gt(raw, avg + std * (cfg.mult + 1.5));
    const t3 = gt(raw, avg + std * (cfg.mult + 3.0));
    return t3 ? 2 : t2 ? 1 : t1 ? 0 : -1;
  };
  for (let i = 1; i < n; i++) {
    const { high, low, close, time } = bars[i];
    // ta.sma(raw, lookback)[1], ta.stdev(raw, lookback)[1]
    const b = tier(rawBuy[i], smaBuy[i - 1], stdBuy[i - 1]);
    const s = tier(rawSell[i], smaSell[i - 1], stdSell[i - 1]);
    // plotshape(cond ? math.avg(close, low) : na, shape.circle, location.absolute, c_bt_buy, size); id: the original's
    // output (buys shape0..shape2, sells shape3..shape5 by tier)
    const posBuy = (close + low) / 2;
    const posSell = (close + high) / 2;
    if (b >= 0 && !isNaN(posBuy)) {
      markers.push({ time, position: 'atPriceMiddle', price: posBuy, shape: 'circle', color: cfg.buyColor, size: sizes[b], id: `shape${b}` });
    }
    if (s >= 0 && !isNaN(posSell)) {
      markers.push({ time, position: 'atPriceMiddle', price: posSell, shape: 'circle', color: cfg.sellColor, size: sizes[s], id: `shape${3 + s}` });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
  };
}

export const BigTradesWhaleDetector = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
