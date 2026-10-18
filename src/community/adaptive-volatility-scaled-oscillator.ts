/**
 * Adaptive Volatility-Scaled Oscillator (AVSO)
 *
 * A scaled metric is log(source * measure) / 10 (na when the product is not positive), with the measure chosen among
 * volume, close, stdev(close, dev), ATR(dev) or the Yang-Zhang volatility (variances of the open gap, the body and
 * the high-low log ranges). The oscillator is the Z-score of this metric over `length` bars, drawn as columns. An
 * EMA whose length grows with |Z| (smoothingLength + int(|Z| * 2)) smooths it. Both are coloured with a gradient
 * from light blue (Z <= -3) to dark blue (Z >= 3); the background is tinted when Z is above 2 or below -2.
 *
 * Reference: "Adaptive Volatility-Scaled Oscillator [AVSO] (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData } from '../types';

export interface AdaptiveVolatilityScaledOscillatorInputs {
  /** Price source of the scaled metric */
  src: SourceType;
  /** Volatility measure multiplied by the source */
  metricMeasure: 'Volume' | 'Close' | 'Standard Deviation' | 'ATR' | 'Yang';
  /** Bars of the mean and standard deviation of the scaled metric */
  length: number;
  /** ATR / standard deviation period */
  dev: number;
  /** Yang-Zhang volatility period */
  periodVol: number;
  /** Base length of the adaptive smoothing */
  smoothingLength: number;
}

export const defaultInputs: AdaptiveVolatilityScaledOscillatorInputs = {
  src: 'close',
  metricMeasure: 'Standard Deviation',
  length: 20,
  dev: 12,
  periodVol: 14,
  smoothingLength: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'metricMeasure', type: 'string', title: 'Volatility Measure', defval: 'Standard Deviation',
    options: ['Volume', 'Close', 'Standard Deviation', 'ATR', 'Yang'] },
  { id: 'length', type: 'int', title: 'Bars to Analyze', defval: 20, min: 2 },
  { id: 'dev', type: 'int', title: 'ATR / Standard Deviation Period', defval: 12, min: 1 },
  { id: 'periodVol', type: 'int', title: 'Yang Volatility Period', defval: 14, min: 1 },
  { id: 'smoothingLength', type: 'int', title: 'Smoothing Period', defval: 5, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Scaled Volatility', color: '#2962ff', lineWidth: 2, style: 'columns' },
  { id: 'plot1', title: 'Adaptive Smoothing', color: '#2962ff', lineWidth: 2 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero Line', color: color.gray, linestyle: 'dashed' },
  { id: 'hline_high', price: 2, title: 'High Volatility', color: color.blue, linestyle: 'dotted' },
  { id: 'hline_low', price: -2, title: 'Low Volatility', color: color.blue, linestyle: 'dotted' },
];

export const metadata = {
  title: 'Adaptive Volatility-Scaled Oscillator [AVSO] (Zeiierman)',
  shortTitle: 'Adaptive Volatility-Scaled Oscillator [AVSO] (Zeiierman)',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveVolatilityScaledOscillatorInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.src));

  // Yang-Zhang volatility: log returns (na -> 0), sigma^2 = k * var(oo) + (1 - k) * var(oc) + c * var(hl)
  const yang = (): number[] => {
    const z = (x: number) => (isNaN(x) ? 0 : x);
    const rOo = bars.map((b, i) => z(i > 0 ? Math.log(b.open / bars[i - 1].close) : NaN));
    const rOc = bars.map((b) => z(Math.log(b.close / b.open)));
    const rHl = bars.map((b) => z(Math.log(b.high / b.low)));
    const vOo = A(ta.variance(S(rOo), cfg.periodVol));
    const vOc = A(ta.variance(S(rOc), cfg.periodVol));
    const vHl = A(ta.variance(S(rHl), cfg.periodVol));
    const k = 0.34;
    const c = 0.34;
    return vOo.map((_, i) => {
      let s2 = k * vOo[i] + (1 - k) * vOc[i] + c * vHl[i];
      // sigma_YZ_sq >= 0 ? sigma_YZ_sq : 0 (na compares false -> 0)
      s2 = !isNaN(s2) && !(0 - s2 > EPS) ? s2 : 0;
      return Math.sqrt(s2);
    });
  };

  let measure: number[];
  switch (cfg.metricMeasure) {
    case 'Volume': measure = bars.map((b) => b.volume ?? NaN); break;
    case 'Close': measure = bars.map((b) => b.close); break;
    case 'ATR': measure = A(ta.atr(bars, cfg.dev)); break;
    case 'Yang': measure = yang(); break;
    default: measure = A(ta.stdev(S(bars.map((b) => b.close)), cfg.dev));
  }

  // scaledMetric(src, vol, 10): log(src * vol) / 10 when src * vol > 0, else na
  const metric = measure.map((m, i) => {
    const dollarVolume = src[i] * m;
    return gt(dollarVolume, 0) ? Math.log(dollarVolume) / 10 : NaN;
  });
  const mean = A(ta.sma(S(metric), cfg.length));
  const sd = A(ta.stdev(S(metric), cfg.length));
  // (x - mean) / std. With a std of 0 it is +-Infinity (0 / 0: NaN): na for the plot, na() and nz(), but the
  // gradient colour and the bgcolor tests `z > 2` / `z < -2` use the infinite value.
  const z = metric.map((m, i) => (m - mean[i]) / sd[i]);
  const finite = (v: number) => (Number.isFinite(v) ? v : NaN);

  // adaptive_ema(z, smoothingLength + int(|z| * 2)): var ema = z (na on bar 0); na(z) keeps ema, else
  // alpha * z + (1 - alpha) * nz(ema)
  const smooth: number[] = new Array(n);
  let ema = n > 0 ? z[0] : NaN;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(z[i])) {
      const len = cfg.smoothingLength + Math.trunc(Math.abs(z[i]) * 2);
      const alpha = 2.0 / (len + 1.0);
      ema = alpha * z[i] + (1 - alpha) * (Number.isFinite(ema) ? ema : 0);
    }
    smooth[i] = ema;
  }

  // gradient_color: z clamped to -3..3, RGB from (173, 216, 230) to (41, 98, 255), channels truncated by int()
  const zColor = z.map((v) => {
    const clamped = Math.max(Math.min(v, 3), -3);
    const norm = (clamped + 3) / 6;
    const r = Math.trunc(173 + (41 - 173) * norm);
    const g = Math.trunc(216 + (98 - 216) * norm);
    const b = Math.trunc(230 + (255 - 230) * norm);
    return String(color.rgb(r, g, b));
  });

  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    // bgcolor(z > 2 ? color.new(z_color, 80) : na) / bgcolor(z < -2 ? color.new(z_color, 80) : na)
    // ('High Volatility' = bgcolor0, 'Low Volatility' = bgcolor1)
    if (gt(z[i], 2)) bgColors.push({ id: 'bgcolor0', time: bars[i].time, color: String(color.new(zColor[i], 80)) });
    else if (gt(-2, z[i])) bgColors.push({ id: 'bgcolor1', time: bars[i].time, color: String(color.new(zColor[i], 80)) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: finite(z[i]), color: zColor[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: finite(smooth[i]), color: zColor[i] })),
    },
    hlines: hlineConfig.map((h) => ({ value: h.price, options: { title: h.title, color: h.color, linestyle: h.linestyle } })),
    bgColors,
  };
}

export const AdaptiveVolatilityScaledOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
};
