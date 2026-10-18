/**
 * OA - SMES (Smart Money Flow)
 *
 * The close position in the high-low range of `pricePer` bars (0..100) is smoothed with an SMA of `flowPeriod`
 * bars, then a zero-lag step is applied: smart money flow = (3 * smooth - 2 * SMA(smooth, 3) - 50) * 1.032 + 50.
 * The line is drawn with a wide glow line. Circles mark the crosses above 0 (entry), the entries confirmed by a
 * higher close on the next bar (green) and the crosses below 100 (exit), each with a larger glow circle. Hidden
 * levels at 100 / 75 / 60 and 40 / 25 / 0 carry the overbought and oversold zone fills.
 *
 * Reference: "OA - SMES" by onurag
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface OaSmesInputs {
  /** Smart money flow period (SMA of the normalized price) */
  flowPeriod: number;
  /** Smart money smoothing (used by the directional VHF of the Pine script, which is not drawn) */
  smoothingPeriod: number;
  /** Price analysis period (high-low range) */
  pricePer: number;
  /** Fibonacci period (used by the price position of the Pine script, which is not drawn) */
  fibPer: number;
  showFlow: boolean;
  showZones: boolean;
  showGlow: boolean;
}

export const defaultInputs: OaSmesInputs = {
  flowPeriod: 5,
  smoothingPeriod: 5,
  pricePer: 21,
  fibPer: 34,
  showFlow: true,
  showZones: true,
  showGlow: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'flowPeriod', type: 'int', title: 'Smart Money Flow Period', defval: 5, min: 1 },
  { id: 'smoothingPeriod', type: 'int', title: 'Smart Money Smoothing', defval: 5, min: 1 },
  { id: 'pricePer', type: 'int', title: 'Price Analysis Period', defval: 21, min: 5, max: 200 },
  { id: 'fibPer', type: 'int', title: 'Fibonacci Period', defval: 34, min: 5, max: 200 },
  { id: 'showFlow', type: 'bool', title: 'Show Smart Money Flow', defval: true },
  { id: 'showZones', type: 'bool', title: 'Show Extreme Zones', defval: true },
  { id: 'showGlow', type: 'bool', title: 'Show Glow Effects', defval: true },
];

const FLOW_COLOR = String(color.new(color.blue, 0));
const FLOW_GLOW_COLOR = String(color.new(color.blue, 80));
const ENTRY_COLOR = String(color.new(color.blue, 0));
const ENTRY_GLOW_COLOR = String(color.new(color.blue, 70));
const ENTRY_COLOR_2 = String(color.new(color.green, 0));
const ENTRY_GLOW_COLOR_2 = String(color.new(color.green, 70));
const OB_COLOR = String(color.new(color.red, 50));
const OS_COLOR = String(color.new(color.green, 50));
const OB_GLOW_COLOR = String(color.new(color.red, 80));
const OS_GLOW_COLOR = String(color.new(color.green, 80));
const EXIT_COLOR = String(color.new(color.red, 0));
const EXIT_GLOW_COLOR = String(color.new(color.red, 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Smart Money Flow', color: FLOW_COLOR, lineWidth: 2 },
  { id: 'plot1', title: 'Smart Money Flow Glow', color: FLOW_GLOW_COLOR, lineWidth: 6, display: 'pane' },
];

/** The six zone levels (Pine hline(..., display = display.none)): hidden, they only bound the zone fills */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_ob', price: 75, title: 'Overbought Zone', color: String(color.new(color.red, 0)), linestyle: 'dashed', display: 'none' },
  { id: 'hline_ob_glow', price: 60, title: 'Overbought Glow Zone', color: String(color.new(color.red, 40)), linestyle: 'dashed', display: 'none' },
  { id: 'hline_ob_upper', price: 100, title: 'Overbought Zone Upper', color: String(color.new(color.maroon, 0)), linestyle: 'dashed', display: 'none' },
  { id: 'hline_os', price: 25, title: 'Oversold Zone', color: String(color.new(color.green, 0)), linestyle: 'dashed', display: 'none' },
  { id: 'hline_os_glow', price: 40, title: 'Oversold Glow Zone', color: String(color.new(color.green, 40)), linestyle: 'dashed', display: 'none' },
  { id: 'hline_os_lower', price: 0, title: 'Oversold Zone Lower', color: String(color.new(color.lime, 0)), linestyle: 'dashed', display: 'none' },
];

/** Zone fills with the default inputs (showZones and showGlow true) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_ob', plot1: 'hline_ob', plot2: 'hline_ob_upper', color: OB_COLOR, title: 'Overbought Main Region' },
  { id: 'fill_ob_glow', plot1: 'hline_ob_glow', plot2: 'hline_ob', color: OB_GLOW_COLOR, title: 'Overbought Glow Region' },
  { id: 'fill_os', plot1: 'hline_os', plot2: 'hline_os_lower', color: OS_COLOR, title: 'Oversold Main Region' },
  { id: 'fill_os_glow', plot1: 'hline_os_glow', plot2: 'hline_os', color: OS_GLOW_COLOR, title: 'Oversold Glow Region' },
];

export const metadata = {
  title: 'OA - SMES',
  shortTitle: 'OA - SMES',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<OaSmesInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const mWeight = 1.032;

  // norm_price = (close - lowest(low, pricePer)) / (highest(high, pricePer) - lowest(low, pricePer)) * 100
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), cfg.pricePer));
  const hh = A(ta.highest(S(bars.map((b) => b.high)), cfg.pricePer));
  const norm = bars.map((b, i) => {
    const range = hh[i] - ll[i];
    return range === 0 ? NaN : ((b.close - ll[i]) / range) * 100; // range 0: close = lowest low, Pine 0 / 0 is NaN
  });
  const smoothNorm = A(ta.sma(S(norm), cfg.flowPeriod));
  const doubleSmooth = A(ta.sma(S(smoothNorm), 3));
  const smf = smoothNorm.map((s, i) => (3 * s - 2 * doubleSmooth[i] - 50) * mWeight + 50);

  // ta.crossover(smf, 0) / ta.crossunder(smf, 100): a tie on the previous bar counts
  // (exact comparisons: ta.crossover / ta.crossunder do not use the 1e-10 tolerance of the operators)
  const entry = smf.map((v, i) => i > 0 && v > 0 && smf[i - 1] <= 0);
  const exit = smf.map((v, i) => i > 0 && v < 100 && smf[i - 1] >= 100);
  // filtered_entry = entry_signal[1] and close > close[1]
  const filtered = bars.map((b, i) => i > 0 && entry[i - 1] && gt(b.close, bars[i - 1].close));

  const markers: MarkerData[] = [];
  // id: the plotshape output (shape0..shape5 in declaration order)
  const circle = (time: number, price: number, c: string, size: 'small' | 'normal', id: string) => {
    if (!isNaN(price)) markers.push({ time, position: 'atPriceMiddle', price, shape: 'circle', color: c, size, id });
  };
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    if (entry[i]) {
      circle(t, smf[i], ENTRY_COLOR, 'small', 'shape0');
      if (cfg.showGlow) circle(t, smf[i], ENTRY_GLOW_COLOR, 'normal', 'shape1');
    }
    if (filtered[i]) {
      circle(t, smf[i], ENTRY_COLOR_2, 'small', 'shape2');
      if (cfg.showGlow) circle(t, smf[i], ENTRY_GLOW_COLOR_2, 'normal', 'shape3');
    }
    if (exit[i]) {
      circle(t, smf[i], EXIT_COLOR, 'small', 'shape4');
      if (cfg.showGlow) circle(t, smf[i], EXIT_GLOW_COLOR, 'normal', 'shape5');
    }
  }

  // hline(showZones ? level : na): no line when na; the glow levels also need showGlow
  const levelOn: Record<string, boolean> = {
    hline_ob: cfg.showZones,
    hline_ob_glow: cfg.showZones && cfg.showGlow,
    hline_ob_upper: cfg.showZones,
    hline_os: cfg.showZones,
    hline_os_glow: cfg.showZones && cfg.showGlow,
    hline_os_lower: cfg.showZones,
  };
  const fillColors = (on: boolean, c: string) => new Array<string>(n).fill(on ? c : 'transparent');

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: cfg.showFlow ? smf[i] : NaN, color: FLOW_COLOR })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.showFlow && cfg.showGlow ? smf[i] : NaN, color: FLOW_GLOW_COLOR })),
    },
    hlines: hlineConfig.filter((h) => levelOn[h.id])
      .map((h) => ({ value: h.price, options: { title: h.title, color: h.color, linestyle: h.linestyle } })),
    fills: [
      { plot1: 'hline_ob', plot2: 'hline_ob_upper', options: { title: 'Overbought Main Region' },
        colors: fillColors(cfg.showZones, OB_COLOR) },
      { plot1: 'hline_ob_glow', plot2: 'hline_ob', options: { title: 'Overbought Glow Region' },
        colors: fillColors(cfg.showZones && cfg.showGlow, OB_GLOW_COLOR) },
      { plot1: 'hline_os', plot2: 'hline_os_lower', options: { title: 'Oversold Main Region' },
        colors: fillColors(cfg.showZones, OS_COLOR) },
      { plot1: 'hline_os_glow', plot2: 'hline_os', options: { title: 'Oversold Glow Region' },
        colors: fillColors(cfg.showZones && cfg.showGlow, OS_GLOW_COLOR) },
    ],
    markers,
  };
}

export const OaSmes = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
};
