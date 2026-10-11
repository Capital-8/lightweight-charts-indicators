/**
 * RedK Relative Strength Index (Volume Weighted RSI)
 *
 * An RSI where each price change is multiplied by the bar volume (or 1 when volume weighting is off or the symbol has
 * no volume). The up and down moves are averaged with a WMA of `len` bars, the RSI is rescaled to -100..100 and
 * smoothed with a WMA. A sentiment RSI uses the same formula over `sentiment * len` bars, rounded to a step, and is
 * drawn as an area. Triangles mark the bars where the RSI crosses zero in the direction of the sentiment RSI.
 *
 * Last bar: with the real-time option a signal needs a closed bar. The port reads the state of the last bar from the
 * optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "RedK Vol_Weighted RSI: Extending the power of the classic RSI" by RedKTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © RedKTrader
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface RedKVolWeightedRsiInputs {
  /** RSI length */
  len: number;
  /** Sentiment factor: the sentiment RSI length is sentiment * len */
  sentiment: number;
  /** WMA smoothing length of both RSIs */
  smooth: number;
  /** Weight the price changes by the volume */
  vw: boolean;
  /** Rounding step of the sentiment RSI (0 = no rounding) */
  step: number;
  /** Real-time signal update: signals on confirmed bars only */
  rtOpt: boolean;
}

export const defaultInputs: RedKVolWeightedRsiInputs = {
  len: 10,
  sentiment: 3,
  smooth: 3,
  vw: true,
  step: 5,
  rtOpt: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Length', defval: 10, min: 1 },
  { id: 'sentiment', type: 'int', title: 'Sentiment Factor', defval: 3, min: 1 },
  { id: 'smooth', type: 'int', title: 'Smoothing', defval: 3, min: 1 },
  { id: 'vw', type: 'bool', title: 'Volume Weighted ?', defval: true },
  { id: 'step', type: 'int', title: 'Step', defval: 5, min: 0, max: 50, step: 5 },
  { id: 'rtOpt', type: 'bool', title: 'Real-time Signal Update?', defval: true },
];

const SENT_UP = String(color.new('#33aa00', 70));
const SENT_DN = String(color.new('#d5180b', 70));
const RAW_COL = String(color.new(color.purple, 50));
const RSI_UP = String(color.new(color.aqua, 20));
const RSI_DN = String(color.new(color.orange, 20));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Sentiment', color: SENT_UP, lineWidth: 2, style: 'area' },
  { id: 'plot1', title: 'Raw RSI', color: RAW_COL, lineWidth: 1 },
  { id: 'plot2', title: 'K_RSI', color: RSI_UP, lineWidth: 3 },
];

export const metadata = {
  title: 'RedK Relative Strength Index',
  shortTitle: 'RedK_RSI',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RedKVolWeightedRsiInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // v = na(volume) or not vw ? 1.0 : volume
  const v = bars.map((b) => (b.volume === undefined || b.volume === null || isNaN(b.volume) || !cfg.vw ? 1.0 : b.volume));
  // ta.change(src) * v (na on bar 0); math.max / math.min give na with an na argument
  const chg = bars.map((b, i) => (i > 0 ? (b.close - bars[i - 1].close) * v[i] : NaN));
  const upMove = S(chg.map((x) => (isNaN(x) ? NaN : Math.max(x, 0))));
  const downMove = S(chg.map((x) => (isNaN(x) ? NaN : -Math.min(x, 0))));

  const rsiOf = (length: number) => {
    const up = A(ta.wma(upMove, length));
    const down = A(ta.wma(downMove, length));
    // rsiraw = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down)); rescaled to -100..100
    const raw100 = up.map((u, i) => {
      const d = down[i];
      const raw = eq(d, 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / d);
      return raw * 2 - 100;
    });
    return { raw100, smoothed: A(ta.wma(S(raw100), cfg.smooth)) };
  };
  const { raw100: rsiraw100, smoothed: rsi } = rsiOf(cfg.len);
  const { smoothed: longrsi } = rsiOf(cfg.sentiment * cfg.len);
  // longrsis = step > 0 ? math.round(longrsi / step) * step : longrsi
  const longrsis = longrsi.map((x) => (cfg.step > 0 ? math.round(x / cfg.step) * cfg.step : x));

  const markers: MarkerData[] = [];
  const sigDn = String(color.new(color.red, 20));
  const sigUp = String(color.new(color.green, 20));
  for (let i = 1; i < n; i++) {
    // RT_update = RT_Opt ? barstate.isconfirmed : true
    const rtUpdate = cfg.rtOpt ? barIsConfirmed(i) : true;
    const signalUp = rtUpdate && gt(longrsi[i], 0) && ge(rsi[i], 0) && lt(rsi[i - 1], 0);
    const signalDn = rtUpdate && lt(longrsi[i], 0) && lt(rsi[i], 0) && ge(rsi[i - 1], 0);
    // plotshape(..., location.top / location.bottom, size.small, display = display.pane)
    if (signalDn) markers.push({ time: bars[i].time, position: 'top', shape: 'triangleDown', color: sigDn, size: 'small' });
    if (signalUp) markers.push({ time: bars[i].time, position: 'bottom', shape: 'triangleUp', color: sigUp, size: 'small' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(longrsis, 'Sentiment', style = plot.style_area, color = longrsis >= 0 ? ... : ..., linewidth = 2)
      plot0: bars.map((b, i) => ({ time: b.time, value: longrsis[i], color: ge(longrsis[i], 0) ? SENT_UP : SENT_DN })),
      plot1: bars.map((b, i) => ({ time: b.time, value: rsiraw100[i], color: RAW_COL })),
      plot2: bars.map((b, i) => ({ time: b.time, value: rsi[i], color: ge(rsi[i], 0) ? RSI_UP : RSI_DN })),
    },
    hlines: [
      { value: 0, options: { title: 'Zero Line', color: String(color.new(color.yellow, 30)), linestyle: 'dotted' } },
      { value: 40, options: { title: 'Strong Up Level', color: String(color.new(color.green, 50)), linestyle: 'dotted' } },
      { value: -40, options: { title: 'Strong Down Level', color: String(color.new(color.red, 50)), linestyle: 'dotted' } },
    ],
    markers,
  };
}

export const RedKVolWeightedRsi = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
