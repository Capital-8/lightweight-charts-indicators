/**
 * CM RSI-2 Strategy Lower
 *
 * The 2-bar RSI of the close (Larry Connors' RSI-2 strategy), the lower pane of the strategy: averages of the gains
 * and the losses by rma over 2 bars. The line is lime when the close is above its 200-bar SMA, under its 5-bar SMA and
 * the RSI below 10 (buy setup), red when the close is under the 200 SMA, above the 5 SMA and the RSI above 90 (sell
 * setup), silver otherwise. Level lines at 100, 0, 90 and 10, the zone between 90 and 10 filled silver.
 *
 * Reference: "_CM_RSI_2_Strat_Low" by ChrisMoody
 */

import { ta, color, compare, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

/** The original has no inputs */
export type CMRSI2LowerInputs = Record<string, never>;

export const defaultInputs: CMRSI2LowerInputs = {};

export const inputConfig: InputConfig[] = [];

// Colour constants of the original's Pine version (1 / 2)
const LIME = '#00FF00';
const RED = '#FF0000';
const SILVER = '#C0C0C0';
const AQUA = '#00FFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: SILVER, lineWidth: 4, palette: [LIME, RED, SILVER] },
  { id: 'plot1', title: 'Upper Line 100', color: AQUA, lineWidth: 3 },
  { id: 'plot2', title: 'Lower Line 0', color: AQUA, lineWidth: 3 },
  { id: 'plot3', title: 'Upper Line 90', color: AQUA, lineWidth: 3 },
  { id: 'plot4', title: 'Lower Line 10', color: AQUA, lineWidth: 3 },
];

export const metadata = {
  title: '_CM_RSI_2_Strat_Low',
  shortTitle: '_CM_RSI_2_Strategy_Lower',
  overlay: false,
};

/**
 * up = rma(max(change(src), 0), 2); down = rma(-min(change(src), 0), 2);
 * rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))
 */
function rsi2(bars: Bar[]): number[] {
  const change = bars.map((b, i) => (i > 0 ? b.close - bars[i - 1].close : NaN));
  // max(na, 0) / min(na, 0) are na
  const up = ta.rma(Series.fromArray(bars, change.map((c) => (Number.isNaN(c) ? NaN : Math.max(c, 0)))), 2).toArray();
  const down = ta.rma(Series.fromArray(bars, change.map((c) => (Number.isNaN(c) ? NaN : -Math.min(c, 0)))), 2).toArray();
  return bars.map((_, i) => {
    const u = up[i] ?? NaN;
    const d = down[i] ?? NaN;
    if (compare.eq(d, 0)) return 100;
    if (compare.eq(u, 0)) return 0;
    return 100 - 100 / (1 + u / d);
  });
}

export function calculate(bars: Bar[], _inputs: Partial<CMRSI2LowerInputs> = {}): IndicatorResult {
  const rsi = rsi2(bars);
  const close = new Series(bars, (b) => b.close);
  const ma5 = ta.sma(close, 5).toArray().map((v) => v ?? NaN);
  const ma200 = ta.sma(close, 200).toArray().map((v) => v ?? NaN);

  // col = close > ma200 and close < ma5 and rsi < 10 ? lime : close < ma200 and close > ma5 and rsi > 90 ? red : silver
  const plot0 = bars.map((b, i) => {
    const c = b.close;
    const col = compare.gt(c, ma200[i]) && compare.lt(c, ma5[i]) && compare.lt(rsi[i], 10) ? LIME
      : compare.lt(c, ma200[i]) && compare.gt(c, ma5[i]) && compare.gt(rsi[i], 90) ? RED : SILVER;
    return { time: b.time, value: rsi[i], color: col };
  });
  const level = (v: number) => bars.map((b) => ({ time: b.time, value: v }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1: level(100), plot2: level(0), plot3: level(90), plot4: level(10) },
    // fill(band1, band0, color=silver, transp=90)
    fills: [
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Plots Background', color: String(color.new(SILVER, 90)) } },
    ],
  };
}

export const CMRSI2Lower = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
