/**
 * Robby DSS Bressert Colored Dots
 *
 * Double smoothed stochastic (Bressert DSS): the stochastic of the close over `stoPeriod` bars, smoothed with an EMA
 * of `emaPeriod` bars; the stochastic of that line over `stoPeriod` bars, smoothed again with an EMA of `emaPeriod`
 * bars. The DSS is drawn as dots: lime while it rises, red while it falls; the colour is kept when it does not
 * change. Dashed overbought and oversold lines.
 *
 * Reference: "Robby DSS Bressert Colored Dots" by huatzhi
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface RobbyDssBressertColoredDotsInputs {
  /** Smoothing period (EMA) */
  emaPeriod: number;
  /** Stochastic period */
  stoPeriod: number;
  overboughtLevel: number;
  oversoldLevel: number;
}

export const defaultInputs: RobbyDssBressertColoredDotsInputs = {
  emaPeriod: 60,
  stoPeriod: 120,
  overboughtLevel: 80,
  oversoldLevel: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaPeriod', type: 'int', title: 'Smoothing Period (EMA)', defval: 60 },
  { id: 'stoPeriod', type: 'int', title: 'Stochastic Period', defval: 120 },
  { id: 'overboughtLevel', type: 'float', title: 'Overbought Level', defval: 80 },
  { id: 'oversoldLevel', type: 'float', title: 'Oversold Level', defval: 20 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'DSS Dots', color: color.red, lineWidth: 3, style: 'circles' },
];

export const metadata = {
  title: 'Robby DSS Bressert Colored Dots',
  shortTitle: 'Robby DSS',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(bars: Bar[], inputs: Partial<RobbyDssBressertColoredDotsInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // stochOfPrice = ta.stoch(close, high, low, stoPeriod); firstSmooth = ta.ema(stochOfPrice, emaPeriod)
  const close = bars.map((b) => b.close);
  const stochOfPrice = A(ta.stoch(S(close), S(bars.map((b) => b.high)), S(bars.map((b) => b.low)), cfg.stoPeriod));
  const firstSmooth = A(ta.ema(S(stochOfPrice), cfg.emaPeriod));
  // stochOfSmoothed = ta.stoch(firstSmooth, firstSmooth, firstSmooth, stoPeriod); dssValue = ta.ema(stochOfSmoothed, emaPeriod)
  const fs = S(firstSmooth);
  const stochOfSmoothed = A(ta.stoch(fs, fs, fs, cfg.stoPeriod));
  const dss = A(ta.ema(S(stochOfSmoothed), cfg.emaPeriod));

  // var color dotColor = color.red; lime when dssValue > dssValue[1], red when dssValue < dssValue[1], else kept
  // (color.new(c, 0) is the colour c itself: one string per colour of the palette)
  const lime: string = color.lime;
  const red: string = color.red;
  let dotColor: string = red;
  const plot0 = bars.map((b, i) => {
    const prev = i > 0 ? dss[i - 1] : NaN;
    if (gt(dss[i], prev)) dotColor = lime;
    else if (lt(dss[i], prev)) dotColor = red;
    return { time: b.time, value: dss[i], color: dotColor };
  });

  const gray = String(color.new(color.gray, 50));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines: [
      { value: cfg.overboughtLevel, options: { title: 'Overbought', color: gray, linestyle: 'dashed' } },
      { value: cfg.oversoldLevel, options: { title: 'Oversold', color: gray, linestyle: 'dashed' } },
    ],
  };
}

export const RobbyDssBressertColoredDots = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
