/**
 * Laguerre Filter
 *
 * A Laguerre filter of `order` elements with damping `gamma`: L0 = (1 - g) * src + g * L0[1],
 * Li = -g * L(i-1) + L(i-1)[1] + g * Li[1], all elements start at the first source value. The output is the
 * weighted mean of the elements, with triangular weights (1, 2, ..., 2, 1: distance to the nearer edge + 1).
 * The trend turns long when the output rises and short when it falls. The line and the candles take the trend
 * colour; gradient fills join the line and the close, and thin fills (6 % of ATR 14) mark the close edge.
 * Alerts (alertcondition, `alerts` of the result): the trend turning long / short, the close crossing the filter.
 * The Pine 'Line Width' input is not ported: the plot width is fixed by plotConfig (the Pine default, 3).
 *
 * Reference: "Laguerre Filter [BackQuant]" by BackQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BackQuant
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LaguerreFilterInputs {
  /** Laguerre price source */
  pricesource: SourceType;
  /** Gamma (damping): higher = smoother, more lag */
  gamma: number;
  /** Filter order: number of Laguerre elements */
  order: number;
  showLaguerre: boolean;
  showFill: boolean;
  paintCandles: boolean;
  longCol: string;
  shortCol: string;
}

export const defaultInputs: LaguerreFilterInputs = {
  pricesource: 'close',
  gamma: 0.8,
  order: 4,
  showLaguerre: true,
  showFill: true,
  paintCandles: true,
  longCol: '#00ff00',
  shortCol: '#ff0000',
};

export const inputConfig: InputConfig[] = [
  { id: 'pricesource', type: 'source', title: 'Laguerre Price Source', defval: 'close' },
  { id: 'gamma', type: 'float', title: 'Gamma (Damping)', defval: 0.8, min: 0.0, max: 0.99, step: 0.01 },
  { id: 'order', type: 'int', title: 'Filter Order', defval: 4, min: 2, max: 10 },
  { id: 'showLaguerre', type: 'bool', title: 'Show Filtered Price on chart?', defval: true },
  { id: 'showFill', type: 'bool', title: 'Show Gradient Fill?', defval: true },
  { id: 'paintCandles', type: 'bool', title: 'Paint candles according to Trend?', defval: true },
  { id: 'longCol', type: 'color', title: 'Long Color', defval: '#00ff00' },
  { id: 'shortCol', type: 'color', title: 'Short Color', defval: '#ff0000' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Laguerre', color: '#00ff00', lineWidth: 3 },
  { id: 'plot1', title: 'Price', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Edge Lower', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Edge Upper', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Laguerre Filter [BackQuant]',
  shortTitle: 'Laguerre Filter [BackQuant]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<LaguerreFilterInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: { toArray(): (number | null | undefined)[] }) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.pricesource));
  const g = cfg.gamma;
  const order = cfg.order;

  // var LaguerreFilter filter; init on the first bar (all elements = src), then update on every bar
  const value: number[] = new Array(n).fill(NaN);
  const trendArr: number[] = new Array(n).fill(0);
  let L: number[] = [];
  let val = NaN;
  let trend = 0;
  for (let b = 0; b < n; b++) {
    const s = src[b];
    if (b === 0) {
      L = new Array(order).fill(s);
      val = s;
    }
    const Lp = L.slice();
    L[0] = (1 - g) * s + g * Lp[0];
    for (let i = 1; i <= order - 1; i++) L[i] = -g * L[i - 1] + Lp[i - 1] + g * Lp[i];
    let sumWeights = 0.0;
    let sumValues = 0.0;
    for (let i = 0; i <= order - 1; i++) {
      const weight = Math.min(i, order - 1 - i) + 1.0;
      sumWeights += weight;
      sumValues += weight * L[i];
    }
    const prev = val;
    val = sumValues / sumWeights;
    if (gt(val, prev)) trend = 1;
    else if (lt(val, prev)) trend = -1;
    value[b] = val;
    trendArr[b] = trend;
  }

  const col = trendArr.map((t) => (t === 1 ? cfg.longCol : t === -1 ? cfg.shortCol : color.white));
  const close = bars.map((b) => b.close);
  const atr = A(ta.atr(bars, 14));
  const idx = bars.map((_b, i) => i);
  const t = (i: number) => bars[i].time;
  const above = (i: number) => gt(close[i], value[i]);
  const below = (i: number) => lt(close[i], value[i]);

  // fill(pPrice, pLag, close > v ? close : v, close > v ? v : close,
  //      close > v ? color.new(longCol, 15) : na, close > v ? color.new(longCol, 90) : na, title = "Bullish Fill")
  const bullFill = {
    topValue: idx.map((i) => (above(i) ? close[i] : value[i])),
    bottomValue: idx.map((i) => (above(i) ? value[i] : close[i])),
    topColor: idx.map((i): string | null => (above(i) ? String(color.new(cfg.longCol, 15)) : null)),
    bottomColor: idx.map((i): string | null => (above(i) ? String(color.new(cfg.longCol, 90)) : null)),
  };
  // fill(pPrice, pLag, close < v ? v : close, close < v ? close : v,
  //      close < v ? color.new(shortCol, 15) : na, close < v ? color.new(shortCol, 90) : na, title = "Bearish Fill")
  const bearFill = {
    topValue: idx.map((i) => (below(i) ? value[i] : close[i])),
    bottomValue: idx.map((i) => (below(i) ? close[i] : value[i])),
    topColor: idx.map((i): string | null => (below(i) ? String(color.new(cfg.shortCol, 15)) : null)),
    bottomColor: idx.map((i): string | null => (below(i) ? String(color.new(cfg.shortCol, 90)) : null)),
  };
  // fill(pPrice, pEdgeUp, close > v ? color.new(longCol, 45) : na); fill(pPrice, pEdgeDn, close < v ? color.new(shortCol, 45) : na)
  const bullEdge = idx.map((i) => (above(i) ? String(color.new(cfg.longCol, 45)) : 'transparent'));
  const bearEdge = idx.map((i) => (below(i) ? String(color.new(cfg.shortCol, 45)) : 'transparent'));

  // barcolor(paintCandles ? col : na)
  const barColors: BarColorData[] = cfg.paintCandles ? idx.map((i) => ({ time: t(i), color: col[i] })) : [];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: idx.map((i) => ({ time: t(i), value: cfg.showLaguerre ? value[i] : NaN, color: col[i] })),
      plot1: idx.map((i) => ({ time: t(i), value: cfg.showFill ? close[i] : NaN })),
      // edgeOffset = ta.atr(14) * 0.06
      plot2: idx.map((i) => ({ time: t(i), value: close[i] - atr[i] * 0.06 })),
      plot3: idx.map((i) => ({ time: t(i), value: close[i] + atr[i] * 0.06 })),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot0', options: { title: 'Bullish Fill' }, gradient: bullFill },
      { plot1: 'plot1', plot2: 'plot0', options: { title: 'Bearish Fill' }, gradient: bearFill },
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Bull Edge' }, colors: bullEdge },
      { plot1: 'plot1', plot2: 'plot3', options: { title: 'Bear Edge' }, colors: bearEdge },
    ],
    barColors,
    alerts: alertStates(alertConditions, bars, [
      // filter.isLong() and not filter.isLong()[1] (false before the first bar)
      idx.map((i) => trendArr[i] === 1 && !(i > 0 && trendArr[i - 1] === 1)),
      idx.map((i) => trendArr[i] === -1 && !(i > 0 && trendArr[i - 1] === -1)),
      // ta.cross(close, filter.value)
      ((up, dn) => up.map((u, i) => u || dn[i]))(crossedOver(close, value), crossedUnder(close, value)),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Laguerre Long', message: 'Laguerre Filter turned bullish {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Laguerre Short', message: 'Laguerre Filter turned bearish {{exchange}}:{{ticker}}' },
  { id: 'alert2', title: 'Price Cross', message: 'Price crossed Laguerre Filter {{exchange}}:{{ticker}}' },
];

export const LaguerreFilter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
