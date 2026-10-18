/**
 * Savitzky Flow Bands [ChartPrime]
 *
 * Filter: a weighted sum of the last 16 closes with the fixed coefficients of the script (-4 .. 3, then eight times
 * -4, normalised by their sum -36), averaged over length - 1 bars. Bands at the filter +/- 2 * SMA(high - low, 100)
 * only move up (lower band) or down (upper band) while close stays on the band side, as a trailing stop. The direction
 * turns up when close is above the upper band and down when close is below the lower band. The trend band follows
 * the lower band in an up trend and the upper band in a down trend; a thicker copy fades as the trend gets older.
 * Diamonds (drawn one bar later) mark the direction changes; candles take the direction colour.
 *
 * Reference: "Savitzky Flow Bands [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, PlotCandleData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface SavitzkyFlowBandsInputs {
  /** Length: the filter is averaged over length - 1 bars */
  length: number;
  /** Up colour */
  colorUp: string;
  /** Down colour */
  colorDn: string;
  /** Colour the candles with the direction colour */
  candles: boolean;
}

export const defaultInputs: SavitzkyFlowBandsInputs = {
  length: 15,
  colorUp: '#31ca45',
  colorDn: '#FF7112',
  candles: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 15 },
  { id: 'colorUp', type: 'color', title: 'Up', defval: '#31ca45' },
  { id: 'colorDn', type: 'color', title: 'Down', defval: '#FF7112' },
  { id: 'candles', type: 'bool', title: 'CandleStick Color', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Filter', color: '#31ca45', lineWidth: 1, style: 'circles' },
  { id: 'plot1', title: 'Trend Band', color: '#31ca45', lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Trend Extinguishing', color: '#31ca45', lineWidth: 4, style: 'linebr' },
];

export const metadata = {
  title: 'Savitzky Flow Bands [ChartPrime]',
  shortTitle: 'Savitzky Flow Bands',
  overlay: true,
};

// Pine compares floats with a tolerance of 1e-10 (a comparison with na is false)
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/**
 * Coefficients of the script: for i = -4 to 4, coefficients[i + 4] = i; at i = 4 the loop `for j = 5 to -4` (Pine
 * counts down) sets coefficients[8 .. 15] = j for each j, so the last value -4 stays.
 */
function coefficients(): number[] {
  const c: number[] = new Array(16).fill(NaN);
  for (let i = -4; i <= 4; i++) {
    c[i + 4] = i;
    if (i === 4) {
      for (let j = 5; j >= -4; j--) {
        for (let g = 8; g <= 15; g++) c[g] = j;
      }
    }
  }
  return c;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SavitzkyFlowBandsInputs> = {},
): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[];
  barColors: BarColorData[];
  plotCandles: Record<string, PlotCandleData[]>;
} {
  const { length, colorUp, colorDn, candles } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  // savitzky_golay_filter_w_15_vectors(close)
  const coef = coefficients();
  const normFactor = coef.reduce((s, v) => s + v, 0); // coefficients.sum() = -36
  // sum = sum of coefficients[i] * source[i], i = 0 .. 15 (na while source[i] is na)
  const filtered = bars.map((_b, i) => {
    let sum = 0;
    for (let k = 0; k < coef.length; k++) sum += coef[k] * (i - k >= 0 ? close[i - k] : NaN);
    return sum / normFactor;
  });
  // for i = 1 to length - 1: polynomial := math.sum(sum / norm_factor, i) / i
  // The value kept is the one of the last loop index, length - 1. With length <= 1 the loop (counting down) reaches
  // i = 0, and Pine stops with a runtime error: math.sum length must be > 0.
  if (length < 2) {
    throw new Error("Invalid value of the 'length' argument (0) in the 'sum' function. It must be > 0.");
  }
  const last = length - 1;
  const basis = A(math.sum(S(filtered), last) as Series).map((v) => v / last);

  // distance = ta.sma(high - low, 100) * 2
  const distance = A(ta.sma(S(bars.map((b) => b.high - b.low)), 100)).map((v) => v * 2);

  const lBand: number[] = new Array(n);
  const hBand: number[] = new Array(n);
  const direction: number[] = new Array(n);
  const change: boolean[] = new Array(n);
  const count: number[] = new Array(n);
  let dir = NaN; // var direction = int(na)
  let cnt = 0; // var count = 0
  for (let i = 0; i < n; i++) {
    let l = basis[i] - distance[i];
    let h = basis[i] + distance[i];
    // prevLowerBand = nz(l_band[1]); prevUpperBand = nz(h_band[1])
    const prevL = i > 0 && !isNaN(lBand[i - 1]) ? lBand[i - 1] : 0;
    const prevU = i > 0 && !isNaN(hBand[i - 1]) ? hBand[i - 1] : 0;
    const prevClose = i > 0 ? close[i - 1] : NaN;
    // l_band := l_band > prevLowerBand or close[1] < prevLowerBand ? l_band : prevLowerBand
    l = gt(l, prevL) || lt(prevClose, prevL) ? l : prevL;
    // h_band := h_band < prevUpperBand or close[1] > prevUpperBand ? h_band : prevUpperBand
    h = lt(h, prevU) || gt(prevClose, prevU) ? h : prevU;
    lBand[i] = l;
    hBand[i] = h;
    if (gt(close[i], h)) dir = 1;
    if (lt(close[i], l)) dir = 0;
    direction[i] = dir;
    // change = direction != direction[1] (a comparison with na is false)
    const prevDir = i > 0 ? direction[i - 1] : NaN;
    change[i] = !isNaN(dir) && !isNaN(prevDir) && dir !== prevDir;
    // if direction == direction (not na): count += 1; if change: count := 0
    if (!isNaN(dir)) cnt += 1;
    if (change[i]) cnt = 0;
    count[i] = cnt;
  }

  const interval = barInterval(bars);
  const upFaded = String(color.new(colorUp, 70));
  const filterPlot: { time: number; value: number; color: string }[] = [];
  const bandPlot: { time: number; value: number; color: string }[] = [];
  const fadePlot: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const candleData: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const up = direction[i] > 0;
    // t_color = basis > basis[2] ? color_up : color_dn
    const tColor = i >= 2 && gt(basis[i], basis[i - 2]) ? colorUp : colorDn;
    // plot(basis, color = t_color, title = "Filter", style = plot.style_circles)
    filterPlot.push({ time: t, value: basis[i], color: tColor });

    // plotshape(change ? t_band : na, shape.diamond, color_up, size.tiny, location.absolute, offset = 1), and the same
    // with color.new(color_up, 70), size.small: drawn one bar later
    const tBand = up ? lBand[i] : hBand[i];
    if (change[i] && !isNaN(tBand)) {
      const mt = barTime(bars, i + 1, interval);
      markers.push({ time: mt, position: 'atPriceMiddle', price: tBand, shape: 'diamond', color: colorUp, size: 'tiny', id: 'shape0' });
      markers.push({ time: mt, position: 'atPriceMiddle', price: tBand, shape: 'diamond', color: upFaded, size: 'small', id: 'shape1' });
    }

    // plot(change ? na : (direction > 0 ? l_band : h_band), "Trend Band", plot.style_linebr, color_up)
    const band = change[i] ? NaN : tBand;
    bandPlot.push({ time: t, value: band, color: colorUp });
    // "Trend Extinguishing": color.from_gradient(count, 10, 100, color_up, color(na)), linewidth 4.
    // color(na) has no colour: '#00000000' (alpha 0), which from_gradient treats as na.
    fadePlot.push({ time: t, value: band, color: String(color.from_gradient(count[i], 10, 100, colorUp, '#00000000')) });

    // candl_col = direction > 0 ? color_up : color_dn; barcolor and plotcandle(force_overlay) when candles
    const candleColor = up ? colorUp : colorDn;
    if (candles) {
      barColors.push({ time: t, color: candleColor });
      candleData.push({
        time: t, open: bars[i].open, high: bars[i].high, low: bars[i].low, close: bars[i].close,
        color: candleColor, wickColor: candleColor, borderColor: candleColor, forceOverlay: true,
      });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: filterPlot, plot1: bandPlot, plot2: fadePlot },
    markers,
    barColors,
    plotCandles: candles ? { candle0: candleData } : {},
  };
}

export const SavitzkyFlowBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
