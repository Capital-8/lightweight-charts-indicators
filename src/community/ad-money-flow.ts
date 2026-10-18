/**
 * Accumulation/Distribution Money Flow
 *
 * The A/D ratio is the close change divided by the true range (0 when na), optionally pushed towards its sign by the
 * A/D weight. The money flow is the RMA over `len` bars of volume * hlc3 (or volume) * A/D ratio. It is smoothed by
 * a moving average (the "smoothed" line) and smoothed again for the signal line; the histogram is their difference.
 * The ribbon between the two lines and the histogram are green when the histogram is positive, red otherwise.
 * Circles mark the crosses of the signal and the smoothed line (or, as an option, the turns of the smoothed line).
 * Bars are coloured by the histogram sign, by the sign of the line and of the histogram, or by a gradient of the
 * histogram normalised by its range over the last `normPeriod` bars.
 *
 * Reference: "Accumulation/Distribution Money Flow v1.3" by kypexin
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: original calculation author (c) cI8DH, see "Accumulation/Distribution Money Flow" indicator;
 * modified (c) kypexin
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';

export type AdMoneyFlowMaType = 'EMA' | 'DEMA' | 'TEMA' | 'WMA' | 'VWMA' | 'SMA' | 'SMMA' | 'HMA';

export interface AdMoneyFlowInputs {
  /** ADMF period length (RMA length) */
  len: number;
  /** Factor the price in (money flow = volume * hlc3) */
  priceEnable: boolean;
  /** A/D weight (at 1 all volume is included) */
  adWeight: number;
  /** Show the original ADMF line */
  showADMF: boolean;
  /** Show the histogram */
  showHist: boolean;
  /** MA type of the ADMF smoothing */
  ma1Type: AdMoneyFlowMaType;
  /** MA length of the ADMF smoothing */
  ma1Length: number;
  /** MA type of the signal */
  ma2Type: AdMoneyFlowMaType;
  /** MA length of the signal */
  ma2Length: number;
  /** Crossover markers (otherwise advance / decline markers) */
  crossMrk: boolean;
  /** Colour the bars */
  colorBars: boolean;
  /** Bar colour by the sign of the smoothed line and of the histogram */
  colorPlusMinus: boolean;
  /** Bar colour by a gradient of the normalised histogram */
  colorGrad: boolean;
  /** Bars back of the gradient normalisation range */
  normPeriod: number;
  /** Fill the ribbon between the smoothed line and the signal */
  fillRibbon: boolean;
}

export const defaultInputs: AdMoneyFlowInputs = {
  len: 9,
  priceEnable: true,
  adWeight: 0.0,
  showADMF: false,
  showHist: true,
  ma1Type: 'EMA',
  ma1Length: 2,
  ma2Type: 'EMA',
  ma2Length: 2,
  crossMrk: true,
  colorBars: true,
  colorPlusMinus: false,
  colorGrad: false,
  normPeriod: 100,
  fillRibbon: true,
};

const MA_TYPES = ['EMA', 'DEMA', 'TEMA', 'WMA', 'VWMA', 'SMA', 'SMMA', 'HMA'];

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'ADMF period length', defval: 9, min: 1 },
  { id: 'priceEnable', type: 'bool', title: 'Factor price (= money flow)', defval: true },
  { id: 'adWeight', type: 'float', title: 'A/D weight (at 1 all volume is included)', defval: 0.0, min: 0.0, max: 1.0, step: 0.5 },
  { id: 'showADMF', type: 'bool', title: 'Show original ADMA line', defval: false },
  { id: 'showHist', type: 'bool', title: 'Show histogram', defval: true },
  { id: 'ma1Type', type: 'string', title: 'MA smoother for ADMF', defval: 'EMA', options: MA_TYPES },
  { id: 'ma1Length', type: 'int', title: 'MA Length for ADMF', defval: 2, min: 1, step: 1 },
  { id: 'ma2Type', type: 'string', title: 'MA smoother for signal', defval: 'EMA', options: MA_TYPES },
  { id: 'ma2Length', type: 'int', title: 'MA Length for signal', defval: 2, min: 1, step: 1 },
  { id: 'crossMrk', type: 'bool', title: 'Crossover markers (otherwise advance/declibe markers)', defval: true },
  { id: 'colorBars', type: 'bool', title: 'Color bars', defval: true },
  { id: 'colorPlusMinus', type: 'bool', title: 'Color based on range', defval: false },
  { id: 'colorGrad', type: 'bool', title: 'Gradient coloring', defval: false },
  { id: 'normPeriod', type: 'int', title: 'Gradient normalize range, bars back', defval: 100, min: 10, step: 10 },
  { id: 'fillRibbon', type: 'bool', title: 'Fill ribbon', defval: true },
];

const ADMF_COLOR = String(color.new(color.rgb(200, 200, 255), 0));
const SMOOTHED_COLOR = String(color.new(color.rgb(36, 91, 240), 0));
const SIGNAL_COLOR = String(color.new(color.rgb(208, 158, 8), 0));
const HIST_UP = String(color.new(color.green, 60));
const HIST_DOWN = String(color.new(color.red, 60));
const BARS_UP = String(color.new(color.green, 10));
const BARS_DOWN = String(color.new(color.red, 10));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'A/D Money Flow', color: ADMF_COLOR, lineWidth: 1 },
  { id: 'plot1', title: 'A/D Money Flow smoothed', color: SMOOTHED_COLOR, lineWidth: 1 },
  { id: 'plot2', title: 'Signal', color: SIGNAL_COLOR, lineWidth: 1 },
  { id: 'plot3', title: 'Histogram', color: HIST_UP, lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'Accumulation/Distribution Money Flow v1.3',
  shortTitle: 'ADMF v1.3',
  overlay: false,
  precision: 0,
  format: 'volume',
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (x: number) => (isNaN(x) ? 0 : x);

export function calculate(
  bars: Bar[],
  inputs: Partial<AdMoneyFlowInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const volume = S(bars.map((b) => b.volume ?? NaN));

  // f_ma(type, src, len): one moving average per call
  const fMa = (type: AdMoneyFlowMaType, src: number[], len: number): number[] => {
    switch (type) {
      case 'SMA':
        return A(ta.sma(S(src), len));
      case 'EMA':
        return A(ta.ema(S(src), len));
      case 'DEMA': {
        const e = A(ta.ema(S(src), len));
        const ee = A(ta.ema(S(e), len));
        return e.map((v, i) => 2 * v - ee[i]);
      }
      case 'TEMA': {
        const e = A(ta.ema(S(src), len));
        const ee = A(ta.ema(S(e), len));
        const eee = A(ta.ema(S(ee), len));
        return e.map((v, i) => 3 * (v - ee[i]) + eee[i]);
      }
      case 'WMA':
        return A(ta.wma(S(src), len));
      case 'VWMA':
        return A(ta.vwma(S(src), len, volume));
      case 'SMMA': {
        // result := na(w[1]) ? ta.sma(_src, _len) : (w[1] * (_len - 1) + _src) / _len
        // ta.sma runs only on the bars where w[1] is na (its history is these bars)
        const w = A(ta.wma(S(src), len));
        const smaIdx: number[] = [];
        for (let i = 0; i < n; i++) if (i === 0 || isNaN(w[i - 1])) smaIdx.push(i);
        const smaVals = A(ta.sma(Series.fromArray(smaIdx.map((i) => bars[i]), smaIdx.map((i) => src[i])), len));
        const out: number[] = new Array(n).fill(NaN);
        smaIdx.forEach((i, k) => { out[i] = smaVals[k]; });
        for (let i = 1; i < n; i++) if (!isNaN(w[i - 1])) out[i] = (w[i - 1] * (len - 1) + src[i]) / len;
        return out;
      }
      case 'HMA': {
        const half = A(ta.wma(S(src), len / 2));
        const full = A(ta.wma(S(src), len));
        return A(ta.wma(S(half.map((v, i) => 2 * v - full[i])), Math.round(Math.sqrt(len))));
      }
      default:
        return new Array(n).fill(0);
    }
  };

  // AD_ratio = nz(ta.change(close) / ta.tr(true))
  const ad: number[] = bars.map((b, i) => {
    const tr = i === 0 ? b.high - b.low
      : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    const ch = i === 0 ? NaN : b.close - bars[i - 1].close;
    const r = nz(tr === 0 ? NaN : ch / tr);
    return (1 - cfg.adWeight) * r + Math.sign(r) * cfg.adWeight;
  });
  const vol = bars.map((b) => {
    const v = b.volume ?? NaN;
    return cfg.priceEnable ? v * ((b.high + b.low + b.close) / 3) : v;
  });
  const admf = A(ta.rma(S(vol.map((v, i) => v * ad[i])), cfg.len));
  const ma1 = fMa(cfg.ma1Type, admf, cfg.ma1Length);
  const ma2 = fMa(cfg.ma2Type, ma1, cfg.ma2Length);
  const hist = ma1.map((v, i) => v - ma2[i]);

  const histMax = A(ta.highest(S(hist), cfg.normPeriod));
  const histMin = A(ta.lowest(S(hist), cfg.normPeriod));

  const histColor = (i: number) => (gt(hist[i], 0) ? HIST_UP : HIST_DOWN);

  const barColors: BarColorData[] = [];
  if (cfg.colorBars) {
    for (let i = 0; i < n; i++) {
      let c: string | null;
      if (cfg.colorGrad) {
        // histGrad = 100 * hist / histRange: a plain division (x / 0 is +-infinity, 0 / 0 NaN); color.from_gradient
        // uses the infinite value
        const grad = (100 * hist[i]) / (histMax[i] - histMin[i]);
        c = gt(hist[i], 0)
          ? color.from_gradient(grad, 0, 100, String(color.new('#bdffbd', 0)), String(color.new('#00ff00', 0)))
          : color.from_gradient(grad, -100, 0, String(color.new('#ff0000', 0)), String(color.new('#ffbdbd', 0)));
      } else if (cfg.colorPlusMinus) {
        const m = ma1[i];
        const h = hist[i];
        c = gt(m, 0) && gt(h, 0) ? String(color.new('#00ff00', 10))
          : gt(m, 0) && lt(h, 0) ? String(color.new('#ffaaaa', 10))
            : lt(m, 0) && lt(h, 0) ? String(color.new('#ff0000', 10))
              : lt(m, 0) && gt(h, 0) ? String(color.new('#aaffaa', 10))
                : null;
      } else {
        c = gt(hist[i], 0) ? BARS_UP : BARS_DOWN;
      }
      if (c !== null) barColors.push({ time: bars[i].time, color: c });
    }
  }

  // Markers (plotshape, shape.circle, location.absolute, size.tiny)
  const markers: MarkerData[] = [];
  const rising = (x: number[], i: number) => i >= 1 && gt(x[i], x[i - 1]); // ta.rising(x, 1)
  const falling = (x: number[], i: number) => i >= 1 && lt(x[i], x[i - 1]); // ta.falling(x, 1)
  // Pine v6 `and` is lazy: `not ta.rising(ma1, 1)` / `not ta.falling(ma1, 1)` only run on the bars where the left
  // side is true, so they compare ma1 with its value on the previous such bar (na before the first one)
  let risePrev = NaN;
  let fallPrev = NaN;
  for (let i = 0; i < n; i++) {
    let under = NaN;
    let over = NaN;
    if (cfg.crossMrk) {
      // ta.crossunder(ma2, ma1): ma2 < ma1 and ma2[1] >= ma1[1]; ta.crossover(ma2, ma1): ma2 > ma1 and ma2[1] <= ma1[1];
      // both compare exactly (no 1e-10 tolerance; na compares false)
      if (i > 0 && ma2[i] < ma1[i] && ma2[i - 1] >= ma1[i - 1]) under = ma1[i];
      if (i > 0 && ma2[i] > ma1[i] && ma2[i - 1] <= ma1[i - 1]) over = ma2[i];
    } else {
      // ta.rising(ma1[1], 1) and not ta.rising(ma1, 1); ta.falling(ma1[1], 1) and not ta.falling(ma1, 1)
      if (i > 0 && rising(ma1, i - 1)) {
        if (!gt(ma1[i], risePrev)) under = ma1[i];
        risePrev = ma1[i];
      }
      if (i > 0 && falling(ma1, i - 1)) {
        if (!lt(ma1[i], fallPrev)) over = ma1[i];
        fallPrev = ma1[i];
      }
    }
    // plotshape(..., title = 'Signal crossunder') = shape0, plotshape(..., title = 'Signal crossover') = shape1
    if (!isNaN(under)) {
      markers.push({ time: bars[i].time, position: 'atPriceMiddle', price: under, shape: 'circle', color: ADMF_COLOR, size: 'tiny', id: 'shape0' });
    }
    if (!isNaN(over)) {
      markers.push({ time: bars[i].time, position: 'atPriceMiddle', price: over, shape: 'circle', color: SIGNAL_COLOR, size: 'tiny', id: 'shape1' });
    }
  }

  return {
    metadata: {
      title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay,
      precision: metadata.precision, format: metadata.format,
    },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: cfg.showADMF ? admf[i] : NaN, color: ADMF_COLOR })),
      plot1: bars.map((b, i) => ({ time: b.time, value: ma1[i], color: SMOOTHED_COLOR })),
      plot2: bars.map((b, i) => ({ time: b.time, value: ma2[i], color: SIGNAL_COLOR })),
      plot3: bars.map((b, i) => ({ time: b.time, value: cfg.showHist ? hist[i] : NaN, color: histColor(i) })),
    },
    hlines: [{ value: 0, options: { title: 'Zero line', color: String(color.new(color.gray, 50)), linestyle: 'dotted' } }],
    // fill(ma1Plot, ma2Plot, color = fillRibbon ? histColor : na)
    fills: [{
      plot1: 'plot1', plot2: 'plot2', options: { title: 'Plots Background' },
      colors: bars.map((_b, i) => (cfg.fillRibbon ? histColor(i) : 'transparent')),
    }],
    markers,
    barColors,
  };
}

export const AdMoneyFlow = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
