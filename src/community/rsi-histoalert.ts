/**
 * RSI HistoAlert Strategy
 *
 * A modified RSI: RSIMain = (RSI(close, RSIPeriod) - 50) * RSIHistoModify, drawn as a blue line and as a histogram
 * coloured green when RSIMain >= 0 and red when it is below 0. Levels at 0 (purple, solid), BuyAlertLevel (green,
 * dashed) and SellAlertLevel (red, dashed). The price bars are coloured from the position: 1 (green) when RSIMain is
 * above BuyAlertLevel, -1 (red) when it is below SellAlertLevel, else the position of the bar before (0 at the start:
 * blue).
 *
 * Reference: "RSI HistoAlert Strategy" by HPotter
 * Original notice: Copyright by HPotter v1.0 07/08/2014
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';

export interface RSIHistoAlertInputs {
  /** RSIPeriod */
  rsiLen: number;
  /** BuyAlertLevel */
  buyAlertLevel: number;
  /** SellAlertLevel */
  sellAlertLevel: number;
  /** RSIHistoModify */
  rsiHistoModify: number;
}

export const defaultInputs: RSIHistoAlertInputs = {
  rsiLen: 13,
  buyAlertLevel: -10,
  sellAlertLevel: 10,
  rsiHistoModify: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLen', type: 'int', title: 'RSIPeriod', defval: 13, min: 1 },
  { id: 'buyAlertLevel', type: 'int', title: 'BuyAlertLevel', defval: -10 },
  { id: 'sellAlertLevel', type: 'int', title: 'SellAlertLevel', defval: 10 },
  { id: 'rsiHistoModify', type: 'float', title: 'RSIHistoModify', defval: 1.5 },
];

/** Pine v1 colour constants */
const GREEN = '#008000';
const RED = '#FF0000';
const BLUE = '#0000FF';
const PURPLE = '#800080';
const BLACK = '#000000';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI HistoAlert', color: BLUE, lineWidth: 1 },
  { id: 'plot1', title: 'Histogram', color: GREEN, lineWidth: 1, style: 'histogram' },
];

/** hline(0 / BuyAlertLevel / SellAlertLevel) with the default inputs (the result `hlines` carry the input levels) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline0', price: 0, title: 'Level', color: PURPLE, linestyle: 'solid' },
  { id: 'hline1', price: -10, title: 'Level', color: GREEN, linestyle: 'dashed' },
  { id: 'hline2', price: 10, title: 'Level', color: RED, linestyle: 'dashed' },
];

export const metadata = {
  title: 'RSI HistoAlert Strategy',
  shortTitle: 'RSI HistoAlert Strategy',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<RSIHistoAlertInputs> = {},
): Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // xPrice = close; RSIMain = (rsi(xPrice, RSIPeriod) - 50) * RSIHistoModify
  const rsi = ta.rsi(new Series(bars, (b) => b.close), cfg.rsiLen).toArray();
  const rsiMain = rsi.map((v) => (v == null || isNaN(v) ? NaN : (v - 50) * cfg.rsiHistoModify));

  const plot0: { time: number; value: number }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const barColors: BarColorData[] = [];
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    const r = rsiMain[i];
    // rsiHcolor = iff(RSIMain >= 0, green, iff(RSIMain < 0, red, black))
    const hColor = ge(r, 0) ? GREEN : lt(r, 0) ? RED : BLACK;
    // pos = iff(RSIMain > BuyAlertLevel, 1, iff(RSIMain < SellAlertLevel, -1, nz(pos[1], 0)))
    pos = gt(r, cfg.buyAlertLevel) ? 1 : lt(r, cfg.sellAlertLevel) ? -1 : pos;
    // barcolor(pos == -1 ? red : pos == 1 ? green : blue)
    barColors.push({ id: 'barcolor0', time: t, color: pos === -1 ? RED : pos === 1 ? GREEN : BLUE });
    // plot(RSIMain, color=blue, title="RSI HistoAlert")
    plot0.push({ time: t, value: r });
    // plot(RSIMain, color=rsiHcolor, title="Histogram", style=histogram, linewidth=1)
    plot1.push({ time: t, value: r, color: hColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [
      // hline(0, color=purple, linestyle=line)
      { id: 'hline0', value: 0, options: { title: 'Level', color: PURPLE, linestyle: 'solid' } },
      // hline(BuyAlertLevel, color=green, linestyle=dashed)
      { id: 'hline1', value: cfg.buyAlertLevel, options: { title: 'Level', color: GREEN, linestyle: 'dashed' } },
      // hline(SellAlertLevel, color=red, linestyle=dashed)
      { id: 'hline2', value: cfg.sellAlertLevel, options: { title: 'Level', color: RED, linestyle: 'dashed' } },
    ],
    barColors,
  };
}

export const RSIHistoAlert = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig };
