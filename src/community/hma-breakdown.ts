/**
 * HMA Breakdown
 *
 * The parts of a Hull moving average: the WMA of the close over `length` (full) and over length / 2 (half), a lower
 * band full - (half - full), the HMA = WMA(2 * half - full, int(sqrt(length))) and its signal WMA(HMA, int(sqrt(length))).
 * The WMA lines take the up colour when the half WMA is above the full WMA, the HMA and signal lines when the HMA is
 * above the signal; fills join the lower band and the half WMA (gradient) and the signal and the HMA. An optional
 * pair of EMAs (10 / 12) of WMA(SMA(close, 3), 5) is lime / red by their cross, with a fill between them.
 * "TMA Candle": candles from tma[gap] to tma (tma = WMA(half WMA, length / 2), gap = 'Candle Lookback'), up colour
 * when tma rises over the gap; hidden by default (display.none in the original).
 *
 * Reference: "HMA Breakdown [NLR]" by NonLinearRookie
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © NonLinearRookie
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData } from '../types';

export interface HmaBreakdownInputs {
  /** HMA length */
  length: number;
  /** Candle Lookback: bars back of the TMA candle open */
  candleGap: number;
  /** Uptrend colour */
  up: string;
  /** Downtrend colour */
  down: string;
  /** Show the two EMAs */
  showMaCross: boolean;
  /** Fast EMA length */
  fastLength: number;
  /** Slow EMA length */
  slowLength: number;
}

export const defaultInputs: HmaBreakdownInputs = {
  length: 50,
  candleGap: 1,
  up: color.lime,
  down: color.fuchsia,
  showMaCross: true,
  fastLength: 10,
  slowLength: 12,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'HMA Length', defval: 50 },
  { id: 'candleGap', type: 'int', title: 'Candle Lookback', defval: 1 },
  { id: 'up', type: 'color', title: 'Uptrend Color', defval: color.lime },
  { id: 'down', type: 'color', title: 'Downtrend Color', defval: color.fuchsia },
  { id: 'showMaCross', type: 'bool', title: 'Show EMA Cross', defval: true },
  { id: 'fastLength', type: 'int', title: 'Fast EMA Length', defval: 10 },
  { id: 'slowLength', type: 'int', title: 'Slow EMA Length', defval: 12 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'WMA Half', color: color.lime, lineWidth: 1 },
  { id: 'plot1', title: 'WMA Full', color: color.lime, lineWidth: 1 },
  { id: 'plot2', title: 'Lower Band', color: color.lime, lineWidth: 2 },
  { id: 'plot3', title: 'Signal', color: String(color.new(color.lime, 50)), lineWidth: 1 },
  { id: 'plot4', title: 'HMA', color: color.lime, lineWidth: 2 },
  { id: 'plot5', title: 'Fast EMA', color: String(color.new(color.lime, 70)), lineWidth: 1 },
  { id: 'plot6', title: 'Slow EMA', color: color.lime, lineWidth: 1 },
];

/** plotcandle(tmax, tma, tmax, tma, "TMA Candle", ..., display = display.none) */
export const plotCandleConfig = [{ id: 'tmaCandle', title: 'TMA Candle', display: 'none' as const }];

/** Pine plotcandle without wickcolor / bordercolor: the style defaults of the plot */
const CANDLE_WICK = '#737375';
const CANDLE_BORDER = '#000000';

export const metadata = {
  title: 'HMA Breakdown [NLR]',
  shortTitle: 'HMA Breakdown [NLR]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<HmaBreakdownInputs> = {},
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]> } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));

  // sqrt_len = int(math.sqrt(length)); half_len = length / 2 (int division of two ints)
  const sqrtLen = Math.trunc(Math.sqrt(cfg.length));
  const halfLen = Math.trunc(cfg.length / 2);
  const wmaFull = A(ta.wma(close, cfg.length));
  const wmaHalf = A(ta.wma(close, halfLen));
  const hma = A(ta.wma(S(wmaHalf.map((h, i) => 2 * h - wmaFull[i])), sqrtLen));
  const signal = A(ta.wma(S(hma), sqrtLen));
  const lower = wmaHalf.map((h, i) => wmaFull[i] - (h - wmaFull[i]));

  // src2 = ta.wma(ta.sma(close, 3), 5); mx1 / mx2 = ta.ema(src2, fast / slow)
  const src2 = ta.wma(ta.sma(close, 3), 5);
  const mx1 = A(ta.ema(src2, cfg.fastLength));
  const mx2 = A(ta.ema(src2, cfg.slowLength));

  const wmaClr = wmaHalf.map((h, i) => (gt(h, wmaFull[i]) ? cfg.up : cfg.down));
  const hmaClr = hma.map((h, i) => (gt(h, signal[i]) ? cfg.up : cfg.down));
  const mxClr = mx1.map((v, i) => (gt(v, mx2[i]) ? color.lime : '#ff0000'));
  // tma = ta.wma(wma_half, half_len); tmax = tma[candle_gap];
  // plotcandle(tmax, tma, tmax, tma, "TMA Candle", tma > tmax ? up : down): no candle when a value is na
  const tma = A(ta.wma(S(wmaHalf), halfLen));
  const gap = Math.trunc(cfg.candleGap);
  const tmaCandles: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    const tmax = i - gap >= 0 && i - gap < n ? tma[i - gap] : NaN;
    if (isNaN(tmax) || isNaN(tma[i])) continue;
    tmaCandles.push({
      time: bars[i].time as number, open: tmax, high: tma[i], low: tmax, close: tma[i],
      color: gt(tma[i], tmax) ? cfg.up : cfg.down, wickColor: CANDLE_WICK, borderColor: CANDLE_BORDER,
    });
  }

  const line = (v: number[], c: (i: number) => string) => bars.map((b, i) => ({ time: b.time, value: v[i], color: c(i) }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(wmaHalf, (i) => wmaClr[i]),
      plot1: line(wmaFull, (i) => wmaClr[i]),
      plot2: line(lower, (i) => wmaClr[i]),
      plot3: line(signal, (i) => String(color.new(hmaClr[i], 50))),
      plot4: line(hma, (i) => hmaClr[i]),
      plot5: line(cfg.showMaCross ? mx1 : new Array<number>(n).fill(NaN), (i) => String(color.new(mxClr[i], 70))),
      plot6: line(cfg.showMaCross ? mx2 : new Array<number>(n).fill(NaN), (i) => mxClr[i]),
    },
    fills: [
      // fill(plowr, phalf, lower, wma_half, color.new(wma_clr, 90), na)
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'Lower Band / WMA Half' },
        gradient: {
          topValue: lower.slice(),
          bottomValue: wmaHalf.slice(),
          topColor: wmaClr.map((c) => String(color.new(c, 90))),
          bottomColor: new Array<string | null>(n).fill(null),
        } },
      // fill(psig, phma, color.new(hma_clr, 90))
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Signal / HMA' },
        colors: hmaClr.map((c) => String(color.new(c, 90))) },
      // fill(pmx1, pmx2, color.new(mxclr, 80))
      { plot1: 'plot5', plot2: 'plot6', options: { title: 'Fast / Slow EMA' },
        colors: mxClr.map((c) => String(color.new(c, 80))) },
    ],
    plotCandles: { tmaCandle: tmaCandles },
  };
}

export const HmaBreakdown = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  plotCandleConfig,
};
