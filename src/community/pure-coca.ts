/**
 * Pure Coca
 *
 * Z-score of a moving average of the source: z = (ma - sma(ma, lookback)) / stdev(ma, lookback), drawn as a
 * histogram (red above 0, white otherwise). The candle and background colours are kept from the last event: a cross
 * of z above the upper boundary gives red, (optional down trend) a cross of z below the lower boundary gives white
 * candles on a grey background, and a cross of z above the lower midline or below the upper midline gives dim grey.
 *
 * The average type "VWAP" restarts on each day. On intraday bars the port reads the exchange time zone and the
 * session of the symbol from the optional third argument (see src/chart-context.ts) and uses the trading day of
 * the exchange, as the original. Without them the day starts at 00:00 UTC.
 *
 * Reference: "Pure Coca" by La_Von
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: @Adam's Cat
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData, PlotCandleData } from '../types';
import type { ChartContext } from '../chart-context';
import { periodChanges } from '../anchor-period';

export type PureCocaMaType = 'SMA' | 'EMA' | 'WMA' | 'RMA' | 'VWMA' | 'ALMA' | 'TEMA' | 'DEMA' | 'KAMA' | 'T3' | 'JMA'
  | 'SMMA' | 'VWAP';

export interface PureCocaInputs {
  /** Lookback of the z-score mean and standard deviation */
  lookback: number;
  /** Length of the moving average of the source */
  maLength: number;
  /** Moving average type (TEMA, DEMA and KAMA give na in the original script) */
  maType: PureCocaMaType;
  src: SourceType;
  /** Upper boundary: a cross of z above it starts the red colour */
  upperB: number;
  /** Midline for the upper boundary: a cross of z below it starts the dim grey colour */
  upperMD: number;
  /** Down trend plot: white candles when z crosses below the lower boundary */
  downT: boolean;
  /** Lower boundary */
  lowerB: number;
  /** Midline for the lower boundary: a cross of z above it starts the dim grey colour */
  lowerMD: number;
  barColoring: boolean;
  showBGCol: boolean;
}

export const defaultInputs: PureCocaInputs = {
  lookback: 26,
  maLength: 1,
  maType: 'EMA',
  src: 'close',
  upperB: 1.9,
  upperMD: 0.3,
  downT: false,
  lowerB: -2.4,
  lowerMD: -0.1,
  barColoring: true,
  showBGCol: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Lookback Period', defval: 26 },
  { id: 'maLength', type: 'int', title: 'MA Length', defval: 1 },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'EMA',
    options: ['SMA', 'EMA', 'WMA', 'RMA', 'VWMA', 'ALMA', 'TEMA', 'DEMA', 'KAMA', 'T3', 'JMA', 'SMMA', 'VWAP'] },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'upperB', type: 'float', title: 'Upper Boundery', defval: 1.9, step: 0.1 },
  { id: 'upperMD', type: 'float', title: 'Midline For Upper Boundery', defval: 0.3, step: 0.1 },
  { id: 'downT', type: 'bool', title: 'Down Trend Plot', defval: false },
  { id: 'lowerB', type: 'float', title: 'Lower Boundery', defval: -2.4, step: 0.1 },
  { id: 'lowerMD', type: 'float', title: 'Midline For Lowe Boundery', defval: -0.1, step: 0.1 },
  { id: 'barColoring', type: 'bool', title: 'Bar Coloring', defval: true },
  { id: 'showBGCol', type: 'bool', title: 'Background Color', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Z-Score', color: '#ff0000', lineWidth: 1, style: 'histogram' },
];

export const metadata = {
  title: 'Pure Coca',
  shortTitle: '( ͡x ͜ʖ ͡x)',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

/**
 * Start of a new day (Pine ta.vwap anchor: timeframe.change("1D")); true on the first bar, where the sums start as in
 * Pine. With the time zone and the session of the chart context: the trading days of the exchange. Else: UTC days.
 */
function newDay(bars: Bar[], chart?: ChartContext): boolean[] {
  return periodChanges(bars, '1D', chart).map((change, i) => i === 0 || change);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<PureCocaInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]> } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = getSourceSeries(bars, cfg.src);
  const len = cfg.maLength;
  const volume = S(bars.map((b) => b.volume ?? NaN));

  // f_ma(src, ma_length, ma_type)
  let smoothed: number[];
  switch (cfg.maType) {
    case 'SMA': smoothed = A(ta.sma(src, len)); break;
    case 'EMA': smoothed = A(ta.ema(src, len)); break;
    case 'WMA': case 'JMA': smoothed = A(ta.wma(src, len)); break;
    case 'RMA': case 'SMMA': smoothed = A(ta.rma(src, len)); break;
    case 'VWMA': smoothed = A(ta.vwma(src, len, volume)); break;
    case 'ALMA': smoothed = A(ta.alma(src, len, 0.85, 6)); break;
    case 'T3': smoothed = A(ta.wma(ta.wma(ta.wma(src, len), len), len)); break;
    case 'VWAP': {
      // ta.vwap: VWAP of hlc3 anchored to the session (a new day on daily bars)
      const hlc3 = S(bars.map((b) => (b.high + b.low + b.close) / 3));
      smoothed = A(ta.vwap(hlc3, volume, S(newDay(bars, chart).map(Number))));
      break;
    }
    default: smoothed = new Array(n).fill(NaN); // TEMA, DEMA, KAMA: na
  }

  // z_score = (smoothed - mean) / stdev: a plain division (x / 0 is +-infinity, 0 / 0 NaN); the comparisons use the
  // infinite value, the plot shows na for it
  const mean = A(ta.sma(S(smoothed), cfg.lookback));
  const sd = A(ta.stdev(S(smoothed), cfg.lookback));
  const z = smoothed.map((v, i) => (v - mean[i]) / sd[i]);

  // ta.crossover(a, b): a > b and a[1] <= b[1]; ta.crossunder(a, b): a < b and a[1] >= b[1] (exact, no 1e-10 tolerance)
  const crossover = (i: number, level: number) => i > 0 && z[i] > level && z[i - 1] <= level;
  const crossunder = (i: number, level: number) => i > 0 && z[i] < level && z[i - 1] >= level;

  const red = '#ff0000';
  const white = '#ffffff';
  const dimGray = '#696969';
  const bgRed = String(color.new('#ff0000', 75));
  const bgDown = String(color.new('#646464', 40));
  const bgS = String(color.new('#1d1d1d', 75));

  const candles: PlotCandleData[] = [];
  const bgColors: BgColorData[] = [];
  let coloring: string | null = null; // var color coloring = na
  let bgCol: string | null = null; // var color bgCol = na
  // S = ta.crossover(z_score, lowerMD) or ta.crossunder(z_score, upperMD): Pine v6 `or` is lazy, so the crossunder
  // only runs (and keeps its history) on the bars where the crossover is false.
  let cuPrevZ = NaN;
  let cuRan = false;
  for (let i = 0; i < n; i++) {
    const co = crossover(i, cfg.lowerMD);
    let cu = false;
    if (!co) {
      cu = cuRan && z[i] < cfg.upperMD && cuPrevZ >= cfg.upperMD;
      cuPrevZ = z[i];
      cuRan = true;
    }
    const sig = co || cu;
    if (crossover(i, cfg.upperB)) {
      coloring = red;
      bgCol = bgRed;
    }
    if (cfg.downT && crossunder(i, cfg.lowerB)) {
      coloring = white;
      bgCol = bgDown;
    }
    if (sig) {
      coloring = dimGray;
      bgCol = bgS;
    }
    // plotcandle(open, high, low, close, 'BarColor', color, bordercolor = color, wickcolor = color, force_overlay = true)
    // color = barColoring ? coloring : na; an na colour draws no candle
    const c = cfg.barColoring && coloring ? coloring : 'transparent';
    const b = bars[i];
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: c, borderColor: c,
      wickColor: c, forceOverlay: true });
    // bgcolor(bgCol, force_overlay = true, display = showBGCol ? display.all : display.none)
    if (cfg.showBGCol && bgCol) bgColors.push({ time: b.time, color: bgCol, forceOverlay: true });
  }

  // hline(downT ? lowerMD : na) / hline(downT ? lowerB : na): an na hline is not drawn
  const hlines = [
    { value: cfg.upperB, options: { title: 'Upper Boundery', color: '#ffffff', linestyle: 'dashed' as const } },
    { value: cfg.upperMD, options: { title: 'Midline For Upper Boundery', color: '#ffffff', linestyle: 'solid' as const } },
    ...(cfg.downT
      ? [
        { value: cfg.lowerMD, options: { title: 'Midline For Upper Boundery', color: '#ff0000', linestyle: 'solid' as const } },
        { value: cfg.lowerB, options: { title: 'Lower Boundery', color: '#ff0000', linestyle: 'dashed' as const } },
      ]
      : []),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(z_score, style = plot.style_histogram, color = z_score > 0 ? #ff0000 : #ffffff, title = 'Z-Score')
      plot0: bars.map((b, i) => ({ time: b.time, value: Number.isFinite(z[i]) ? z[i] : NaN, color: gt(z[i], 0) ? red : white })),
    },
    hlines,
    bgColors,
    plotCandles: { BarColor: candles },
  };
}

export const PureCoca = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
