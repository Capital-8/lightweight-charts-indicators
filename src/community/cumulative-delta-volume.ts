/**
 * Cumulative Delta Volume
 *
 * Splits the volume of each bar into a buying and a selling part from the candle shape: the share of the leading
 * side is 0.5 * (upper wick + lower wick + 2 * body) / (upper wick + lower wick + body). The delta (buying volume on
 * an up bar, minus the selling volume on a down bar) is summed over all bars. The running sum is shown as candles
 * (open = previous sum, close = current sum; Heikin Ashi candles by default) or as a line, with two optional SMAs
 * and two optional EMAs of the candle close.
 *
 * Reference: "Cumulative Delta Volume" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: (c) LonesomeTheBlue
 */

import { ta, Series, compare, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData } from '../types';

export interface CumulativeDeltaVolumeInputs {
  /** Style */
  linestyle: 'Candle' | 'Line';
  /** Heikin Ashi Candles? */
  hacandle: boolean;
  /** SMA 1 */
  showma1: boolean;
  ma1len: number;
  ma1col: string;
  /** SMA 2 */
  showma2: boolean;
  ma2len: number;
  ma2col: string;
  /** EMA 1 */
  showema1: boolean;
  ema1len: number;
  ema1col: string;
  /** EMA 2 */
  showema2: boolean;
  ema2len: number;
  ema2col: string;
  /** Body (up) */
  colorup: string;
  /** Body (down) */
  colordown: string;
  /** Border (up); also the wick colour */
  bcolup: string;
  /** Border (down); also the wick colour */
  bcoldown: string;
  /** Wicks (up): not used by the original script */
  wcolup: string;
  /** Wicks (down): not used by the original script */
  wcoldown: string;
}

// Colours of the original Pine version
const LIME = '#00E676';
const RED = '#FF5252';
const BLUE = '#2196F3';

export const defaultInputs: CumulativeDeltaVolumeInputs = {
  linestyle: 'Candle',
  hacandle: true,
  showma1: false,
  ma1len: 50,
  ma1col: LIME,
  showma2: false,
  ma2len: 200,
  ma2col: RED,
  showema1: false,
  ema1len: 50,
  ema1col: LIME,
  showema2: false,
  ema2len: 200,
  ema2col: RED,
  colorup: LIME,
  colordown: RED,
  bcolup: '#74e05e',
  bcoldown: '#ffad7d',
  wcolup: '#b5b5b8',
  wcoldown: '#b5b5b8',
};

export const inputConfig: InputConfig[] = [
  { id: 'linestyle', type: 'string', title: 'Style', defval: 'Candle', options: ['Candle', 'Line'] },
  { id: 'hacandle', type: 'bool', title: 'Heikin Ashi Candles?', defval: true },
  { id: 'showma1', type: 'bool', title: 'SMA 1', defval: false, inline: 'ma1' },
  { id: 'ma1len', type: 'int', title: '', defval: 50, min: 1, inline: 'ma1' },
  { id: 'ma1col', type: 'color', title: '', defval: LIME, inline: 'ma1' },
  { id: 'showma2', type: 'bool', title: 'SMA 2', defval: false, inline: 'ma2' },
  { id: 'ma2len', type: 'int', title: '', defval: 200, min: 1, inline: 'ma2' },
  { id: 'ma2col', type: 'color', title: '', defval: RED, inline: 'ma2' },
  { id: 'showema1', type: 'bool', title: 'EMA 1', defval: false, inline: 'ema1' },
  { id: 'ema1len', type: 'int', title: '', defval: 50, min: 1, inline: 'ema1' },
  { id: 'ema1col', type: 'color', title: '', defval: LIME, inline: 'ema1' },
  { id: 'showema2', type: 'bool', title: 'EMA 2', defval: false, inline: 'ema2' },
  { id: 'ema2len', type: 'int', title: '', defval: 200, min: 1, inline: 'ema2' },
  { id: 'ema2col', type: 'color', title: '', defval: RED, inline: 'ema2' },
  { id: 'colorup', type: 'color', title: 'Body', defval: LIME, inline: 'bcol' },
  { id: 'colordown', type: 'color', title: '', defval: RED, inline: 'bcol' },
  { id: 'bcolup', type: 'color', title: 'Border', defval: '#74e05e', inline: 'bocol' },
  { id: 'bcoldown', type: 'color', title: '', defval: '#ffad7d', inline: 'bocol' },
  { id: 'wcolup', type: 'color', title: 'Wicks', defval: '#b5b5b8', inline: 'wcol' },
  { id: 'wcoldown', type: 'color', title: '', defval: '#b5b5b8', inline: 'wcol' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'CDV Line', color: BLUE, lineWidth: 2 },
  { id: 'plot1', title: 'SMA 1', color: LIME, lineWidth: 1 },
  { id: 'plot2', title: 'SMA 2', color: RED, lineWidth: 1 },
  { id: 'plot3', title: 'EMA 1', color: LIME, lineWidth: 1 },
  { id: 'plot4', title: 'EMA 2', color: RED, lineWidth: 1 },
];

export const metadata = {
  title: 'Cumulative Delta Volume',
  shortTitle: 'CDV',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<CumulativeDeltaVolumeInputs> = {},
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]> } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const candleMode = cfg.linestyle === 'Candle';

  // delta = close >= open ? volume * _rate(open <= close) : -volume * _rate(open > close)
  const delta = bars.map((b) => {
    const tw = b.high - Math.max(b.open, b.close);
    const bw = Math.min(b.open, b.close) - b.low;
    const body = Math.abs(b.close - b.open);
    const rate = (cond: boolean) => {
      const ret = (0.5 * (tw + bw + (cond ? 2 * body : 0))) / (tw + bw + body);
      // ret := nz(ret) == 0 ? 0.5 : ret
      return compare.eq(Number.isFinite(ret) ? ret : 0, 0) ? 0.5 : ret;
    };
    const vol = b.volume ?? NaN;
    return compare.ge(b.close, b.open) ? vol * rate(compare.le(b.open, b.close)) : -(vol * rate(compare.gt(b.open, b.close)));
  });
  const cumdelta = A(ta.cum(Series.fromArray(bars, delta)));

  const cO: number[] = new Array(n).fill(NaN);
  const cH: number[] = new Array(n).fill(NaN);
  const cL: number[] = new Array(n).fill(NaN);
  const cC: number[] = new Array(n).fill(NaN);
  const candles: PlotCandleData[] = [];
  let haOpenPrev = NaN;
  let haClosePrev = NaN;
  for (let i = 0; i < n; i++) {
    let o = NaN;
    let h = NaN;
    let l = NaN;
    let c = NaN;
    if (candleMode) {
      const prev = i > 0 ? cumdelta[i - 1] : NaN;
      o = prev;
      // max / min with an na argument are na
      h = isNaN(prev) || isNaN(cumdelta[i]) ? NaN : Math.max(cumdelta[i], prev);
      l = isNaN(prev) || isNaN(cumdelta[i]) ? NaN : Math.min(cumdelta[i], prev);
      c = cumdelta[i];
    }
    const haClose = (o + h + l + c) / 4;
    const haOpen = isNaN(haOpenPrev) ? (o + c) / 2 : (haOpenPrev + haClosePrev) / 2;
    const haHigh = Math.max(h, Math.max(haOpen, haClose));
    const haLow = Math.min(l, Math.min(haOpen, haClose));
    haOpenPrev = haOpen;
    haClosePrev = haClose;

    cO[i] = cfg.hacandle ? haOpen : o;
    cH[i] = cfg.hacandle ? haHigh : h;
    cL[i] = cfg.hacandle ? haLow : l;
    cC[i] = cfg.hacandle ? haClose : c;
    // plotcandle draws no candle when a value is na
    if (!isNaN(cO[i]) && !isNaN(cH[i]) && !isNaN(cL[i]) && !isNaN(cC[i])) {
      const up = compare.le(cO[i], cC[i]);
      candles.push({
        time: bars[i].time, open: cO[i], high: cH[i], low: cL[i], close: cC[i],
        color: up ? cfg.colorup : cfg.colordown,
        // bordercolor and wickcolor both use the border colours
        borderColor: up ? cfg.bcolup : cfg.bcoldown,
        wickColor: up ? cfg.bcolup : cfg.bcoldown,
      });
    }
  }

  // plot(showma and linestyle == "Candle" ? sma(c_, len) : na): the average only runs when the option is on
  const closeSeries = Series.fromArray(bars, cC);
  const naLine = new Array(n).fill(NaN);
  const ma1 = cfg.showma1 && candleMode ? A(ta.sma(closeSeries, cfg.ma1len)) : naLine;
  const ma2 = cfg.showma2 && candleMode ? A(ta.sma(closeSeries, cfg.ma2len)) : naLine;
  const ema1 = cfg.showema1 && candleMode ? A(ta.ema(closeSeries, cfg.ema1len)) : naLine;
  const ema2 = cfg.showema2 && candleMode ? A(ta.ema(closeSeries, cfg.ema2len)) : naLine;

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: candleMode ? NaN : cumdelta[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: ma1[i], color: cfg.ma1col })),
      plot2: bars.map((b, i) => ({ time: b.time, value: ma2[i], color: cfg.ma2col })),
      plot3: bars.map((b, i) => ({ time: b.time, value: ema1[i], color: cfg.ema1col })),
      plot4: bars.map((b, i) => ({ time: b.time, value: ema2[i], color: cfg.ema2col })),
    },
    plotCandles: { cdvCandles: candles },
  };
}

export const CumulativeDeltaVolume = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
