/**
 * Bitcoin 2Y-SMA Bands | Astral Vision
 *
 * Investor bands from the 2-year SMA (730 bars) of the close: bottom = SMA * bottom multiplier, top = bottom * top
 * multiplier, drawn on the price pane with a background below the bottom / above the top and recoloured candles.
 * The pane shows log(close / bottom) with levels at log(top multiplier) and 0, filled where the ratio is below 1 or
 * above the top multiplier. Colours from a theme (or custom colours); the ratio colour is flat (positive below 1,
 * negative above the top multiplier, gray between) or a gradient between 1 and the top multiplier.
 *
 * Reference: "Bitcoin 2Y-SMA Bands| Astral Vision 🌠💠" by AstralVision
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AstralVision
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData, BgColorData } from '../types';

export type AstralTheme = 'Inferno' | 'Paradiso' | 'Futura' | 'Infinito' | 'Hermes';

export interface Bitcoin2ySmaBandsAstralVisionInputs {
  /** Bottom multiplier (2y-SMA x) */
  multBottom: number;
  /** Top multiplier (bottom x) */
  multTop: number;
  /** Draw the recoloured candles on the price pane */
  showCandle: boolean;
  /** Gradient colour of the ratio (else flat colours) */
  usegrad: boolean;
  theme: AstralTheme;
  usecustom: boolean;
  customPos: string;
  customNeg: string;
}

export const defaultInputs: Bitcoin2ySmaBandsAstralVisionInputs = {
  multBottom: 0.6,
  multTop: 6.5,
  showCandle: true,
  usegrad: false,
  theme: 'Hermes',
  usecustom: false,
  customPos: color.white,
  customNeg: color.gray,
};

export const inputConfig: InputConfig[] = [
  { id: 'multBottom', type: 'float', title: 'Bottom Multiplier (2y-SMA ×)', defval: 0.6, step: 0.05, group: 'Settings' },
  { id: 'multTop', type: 'float', title: 'Top Multiplier (Bottom ×)', defval: 6.5, step: 0.1, group: 'Settings' },
  { id: 'showCandle', type: 'bool', title: 'Plot Candle', defval: true, group: 'Plots' },
  { id: 'usegrad', type: 'bool', title: 'Use Gradient Color', defval: false, group: 'Plots' },
  { id: 'theme', type: 'string', title: 'Theme', defval: 'Hermes', options: ['Inferno', 'Paradiso', 'Futura', 'Infinito', 'Hermes'],
    group: 'Astral Colors' },
  { id: 'usecustom', type: 'bool', title: 'Use Custom Colors', defval: false, group: 'Astral Colors' },
  { id: 'customPos', type: 'color', title: 'Custom Positive', defval: color.white, group: 'Astral Colors' },
  { id: 'customNeg', type: 'color', title: 'Custom Negative', defval: color.gray, group: 'Astral Colors' },
];

const HERMES_POS = color.rgb(255, 160, 0);
const HERMES_NEG = color.rgb(0, 180, 120);

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Investor Bottom (2y-SMA × mult)', color: HERMES_POS, lineWidth: 2, forceOverlay: true },
  { id: 'plot1', title: 'Investor Top (Bottom × mult)', color: HERMES_NEG, lineWidth: 2, forceOverlay: true },
  { id: 'plot2', title: 'Top Level', color: HERMES_NEG, lineWidth: 1 },
  { id: 'plot3', title: 'Bottom Level', color: HERMES_POS, lineWidth: 1 },
  { id: 'plot4', title: 'Price / Investor Bottom', color: color.rgb(120, 120, 120), lineWidth: 2 },
];

/** plotcandle(open, high, low, close, "Candle", ..., force_overlay = true, display = show_candle ? all : none) */
export const plotCandleConfig = [{ id: 'candle', title: 'Candle' }];

export const metadata = {
  title: 'Bitcoin 2Y-SMA Bands| Astral Vision 🌠💠',
  shortTitle: 'Bitcoin 2Y-SMA Bands| Astral Vision 🌠💠',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

function themeColors(cfg: Bitcoin2ySmaBandsAstralVisionInputs): [string, string] {
  if (cfg.usecustom) return [cfg.customPos, cfg.customNeg];
  switch (cfg.theme) {
    case 'Inferno': return [color.rgb(255, 0, 0), color.rgb(120, 0, 0)];
    case 'Paradiso': return [color.rgb(0, 210, 255), color.rgb(0, 80, 160)];
    case 'Futura': return [color.rgb(0, 255, 180), color.rgb(180, 0, 255)];
    case 'Infinito': return [color.rgb(180, 120, 255), color.rgb(255, 220, 80)];
    default: return [HERMES_POS, HERMES_NEG];
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<Bitcoin2ySmaBandsAstralVisionInputs> = {},
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]>; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const [posCol, negCol] = themeColors(cfg);
  const gray = color.rgb(120, 120, 120);
  const posBg = String(color.new(posCol, 50));
  const negBg = String(color.new(negCol, 50));
  const posFill = String(color.new(posCol, 70));
  const negFill = String(color.new(negCol, 70));
  const multTop = cfg.multTop;

  const sma2y = A(ta.sma(new Series(bars, (b) => b.close), 730));
  const invBottom = sma2y.map((v) => v * cfg.multBottom);
  const invTop = invBottom.map((v) => v * multTop);
  // ratio = inv_bottom != 0 ? close / inv_bottom : na
  const ratio = invBottom.map((v, i) => (ne(v, 0) ? bars[i].close / v : NaN));

  const finalCol: string[] = new Array(n);
  const bgColors: BgColorData[] = [];
  const candles: PlotCandleData[] = [];
  const fillBottom: string[] = new Array(n);
  const fillTop: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = ratio[i];
    const t = bars[i].time;
    // flat_col = ratio > mult_top ? neg_col : ratio < 1.0 ? pos_col : color.rgb(120, 120, 120)
    const flat = gt(r, multTop) ? negCol : lt(r, 1.0) ? posCol : gray;
    finalCol[i] = cfg.usegrad ? color.from_gradient(r, 1.0, multTop, posCol, negCol) : flat;
    // bgcolor(ratio < 1.0 ? color.new(pos_col, 50) : na, force_overlay = true), then the top layer
    // id: the original's bgcolor() call (bgcolor0 / bgcolor1)
    if (lt(r, 1.0)) bgColors.push({ time: t, color: posBg, forceOverlay: true, id: 'bgcolor0' });
    if (gt(r, multTop)) bgColors.push({ time: t, color: negBg, forceOverlay: true, id: 'bgcolor1' });
    if (cfg.showCandle) {
      const b = bars[i];
      candles.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close, color: finalCol[i],
        wickColor: finalCol[i], borderColor: finalCol[i], forceOverlay: true });
    }
    fillBottom[i] = lt(r, 1.0) ? posFill : 'transparent';
    fillTop[i] = gt(r, multTop) ? negFill : 'transparent';
  }

  const finite = (v: number) => (Number.isFinite(v) ? v : NaN);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: finite(invBottom[i]), color: posCol })),
      plot1: bars.map((b, i) => ({ time: b.time, value: finite(invTop[i]), color: negCol })),
      plot2: bars.map((b) => ({ time: b.time, value: finite(Math.log(multTop)), color: negCol })),
      plot3: bars.map((b) => ({ time: b.time, value: Math.log(1.0), color: posCol })),
      plot4: bars.map((b, i) => ({ time: b.time, value: finite(Math.log(ratio[i])), color: finalCol[i] })),
    },
    fills: [
      // fill(p_ratio, h_one, ratio < 1.0 ? color.new(pos_col, 70) : na)
      { plot1: 'plot4', plot2: 'plot3', colors: fillBottom },
      // fill(p_ratio, h_top, ratio > mult_top ? color.new(neg_col, 70) : na)
      { plot1: 'plot4', plot2: 'plot2', colors: fillTop },
    ],
    plotCandles: { candle: candles },
    bgColors,
  };
}

export const Bitcoin2ySmaBandsAstralVision = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  plotCandleConfig,
};
