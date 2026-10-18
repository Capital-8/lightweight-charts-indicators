/**
 * Double RSI
 *
 * DRSI = 2 * RSI(close, length) - RSI(RSI, length), a double-RSI line in the style of a DEMA. The trend state turns
 * long when DRSI is above the long threshold and short when it is below the short threshold; otherwise it keeps its
 * last state. The DRSI line is drawn four times (glow) in the state colour, the price candles take the state colour,
 * and triangles mark the changes from short to long and back.
 * Alerts (alertcondition, `alerts` of the result): 'DRSI: Buy' / 'DRSI: Sell' on the bars of those triangles
 * (ta.crossover / ta.crossunder of the state with 0).
 *
 * Reference: "Double RSI" by Clokivez
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Clokivez
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DoubleRsiInputs {
  /** Colour the price candles with the state colour */
  barColor: boolean;
  /** Draw the DRSI line (glow); off: the line colour is na */
  glow: boolean;
  /** RSI length */
  length: number;
  longThreshold: number;
  shortThreshold: number;
}

export const defaultInputs: DoubleRsiInputs = {
  barColor: true,
  glow: true,
  length: 13,
  longThreshold: 59,
  shortThreshold: 52,
};

export const inputConfig: InputConfig[] = [
  { id: 'barColor', type: 'bool', title: 'Bar Color', defval: true },
  { id: 'glow', type: 'bool', title: 'Make it Glow?', defval: true },
  { id: 'length', type: 'int', title: 'DRSI Length', defval: 13 },
  { id: 'longThreshold', type: 'int', title: 'Long Threshold', defval: 59 },
  { id: 'shortThreshold', type: 'int', title: 'Short Threshold', defval: 52 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'DRSI', color: String(color.new(color.lime, 30)), lineWidth: 1 },
  { id: 'plot1', title: 'DRSI', color: String(color.new(color.lime, 30)), lineWidth: 2 },
  { id: 'plot2', title: 'DRSI', color: String(color.new(color.lime, 80)), lineWidth: 10 },
  { id: 'plot3', title: 'DRSI', color: String(color.new(color.lime, 85)), lineWidth: 16 },
];

export const metadata = {
  title: 'Double RSI',
  shortTitle: 'DRSI',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<DoubleRsiInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // rsi = ta.rsi(close, rl); drsi = 2 * rsi - ta.rsi(rsi, rl)
  const rsi = A(ta.rsi(Series.fromArray(bars, bars.map((b) => b.close)), cfg.length));
  const rsi2 = A(ta.rsi(Series.fromArray(bars, rsi), cfg.length));
  const drsi = rsi.map((r, i) => 2 * r - rsi2[i]);

  // T := drsi > lt ? 1 : drsi < st ? -1 : T[1] (T[1] is na on the first bar, so T stays na until a signal)
  // col := T > 0 ? color.lime : T < 0 ? color.red : col[1] (na until the first signal)
  const T: number[] = new Array(n);
  const col: (string | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prevT = i > 0 ? T[i - 1] : NaN;
    T[i] = gt(drsi[i], cfg.longThreshold) ? 1 : lt(drsi[i], cfg.shortThreshold) ? -1 : prevT;
    const prevCol = i > 0 ? col[i - 1] : null;
    col[i] = gt(T[i], 0) ? color.lime : lt(T[i], 0) ? color.red : prevCol;
  }

  // color.new(na, t) is black with transparency t
  const glowCol = (i: number, t: number) => (cfg.glow ? String(color.new(col[i] as string, t)) : 'transparent');
  const plot = (t: number) => bars.map((b, i) => ({
    time: b.time, value: Number.isFinite(drsi[i]) ? drsi[i] : NaN, color: glowCol(i, t),
  }));

  const candles: PlotCandleData[] = [];
  const markers: MarkerData[] = [];
  const buyFlags = new Array<boolean>(n).fill(false);
  const sellFlags = new Array<boolean>(n).fill(false);
  // ta.crossover(T, 0) / ta.crossunder(T, 0): compared with the last bar where T was not na
  let lastT = NaN;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // plotcandle(open, high, low, close, "Bar Color", bc ? col : na, bc ? col : na, bordercolor = bc ? col : na,
    //   force_overlay = true)
    const c = cfg.barColor && col[i] !== null ? (col[i] as string) : 'transparent';
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: c, wickColor: c,
      borderColor: c, forceOverlay: true });
    if (!isNaN(T[i])) {
      if (!isNaN(lastT)) {
        // plotshape(L, "Buy", shape.triangleup, location.belowbar, #00ffbf, size = size.tiny, force_overlay = true)
        if (T[i] > 0 && lastT <= 0) {
          buyFlags[i] = true;
          markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: '#00ffbf', size: 'tiny',
            forceOverlay: true });
        }
        // plotshape(S, "Sell", shape.triangledown, location.abovebar, #ff0040, size = size.tiny, force_overlay = true)
        if (T[i] < 0 && lastT >= 0) {
          sellFlags[i] = true;
          markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: '#ff0040', size: 'tiny',
            forceOverlay: true });
        }
      }
      lastT = T[i];
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: plot(30),
      plot1: plot(30),
      plot2: plot(80),
      plot3: plot(85),
    },
    hlines: [
      { value: cfg.longThreshold, options: { title: 'Long Threshold', color: color.lime, linestyle: 'dashed' } },
      { value: cfg.shortThreshold, options: { title: 'Short Threshold', color: color.red, linestyle: 'dashed' } },
    ],
    markers,
    plotCandles: { barColor: candles },
    // alertcondition(ta.crossover(T, 0), "DRSI: Buy") / alertcondition(ta.crossunder(T, 0), "DRSI: Sell")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'DRSI: Buy', message: 'DRSI Buy Signal' },
  { id: 'alert1', title: 'DRSI: Sell', message: 'DRSI Sell Signal' },
];

export const DoubleRsi = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
