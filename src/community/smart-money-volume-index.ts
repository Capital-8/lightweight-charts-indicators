/**
 * Smart Money Volume Index [AlgoAlpha]
 *
 * The negative volume index ("smart" money) and the positive volume index ("dumb" money), each minus its 255-bar
 * EMA, give two RSI values. The ratio smart RSI / dumb RSI is the buy interest, the ratio of their distances to 100
 * the sell interest. Each ratio is summed over the index period and divided by the highest of the two sums over
 * the normalisation period. "Net" mode draws buy minus sell as layered columns, "Compare" mode draws both as
 * lines with a gradient fill. Price candles on the main pane take the colour of the interest.
 *
 * Chart values (third argument): the port reads the chart foreground and background colours (fills, candles, price
 * line; without them: #DBDBDB and #0F0F0F, a dark chart). `plotConfig` has the price line colour of the dark chart.
 *
 * Reference: "Smart Money Volume Index [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import { ta, math, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData } from '../types';
import { foregroundColorOf, backgroundColorOf, type ChartContext } from '../chart-context';

export interface SmartMoneyVolumeIndexInputs {
  /** "Compare": buy and sell interest as two lines; "Net": one oscillator */
  mode: 'Compare' | 'Net';
  /** Bars of the sum of the interest ratios */
  indexPeriod: number;
  /** RSI period of the volume flows */
  volumeFlowPeriod: number;
  /** Bars of the highest sum that normalises the index */
  normalizationPeriod: number;
  /** Level from which the interest is "high" */
  highInterestThreshold: number;
  upColor: string;
  secondaryUpColor: string;
  downColor: string;
  secondaryDownColor: string;
}

export const defaultInputs: SmartMoneyVolumeIndexInputs = {
  mode: 'Net',
  indexPeriod: 25,
  volumeFlowPeriod: 14,
  normalizationPeriod: 500,
  highInterestThreshold: 0.9,
  upColor: '#00ffbb',
  secondaryUpColor: '#008461',
  downColor: '#ff1100',
  secondaryDownColor: '#840900',
};

export const inputConfig: InputConfig[] = [
  { id: 'mode', type: 'string', title: 'Display Mode', defval: 'Net', options: ['Compare', 'Net'], group: 'Settings' },
  { id: 'indexPeriod', type: 'int', title: 'Index Period', defval: 25, min: 1, group: 'Settings' },
  { id: 'volumeFlowPeriod', type: 'int', title: 'Volume Flow Period', defval: 14, min: 1, group: 'Settings' },
  { id: 'normalizationPeriod', type: 'int', title: 'Normalization Period', defval: 500, min: 1, group: 'Settings' },
  { id: 'highInterestThreshold', type: 'float', title: 'High Interest Threshold', defval: 0.9, min: 0.01, max: 0.99, step: 0.05, group: 'Settings' },
  { id: 'upColor', type: 'color', title: 'Up Color', defval: '#00ffbb', group: 'Colors' },
  { id: 'secondaryUpColor', type: 'color', title: 'Secondary Up Color', defval: '#008461', group: 'Colors' },
  { id: 'downColor', type: 'color', title: 'Down Color', defval: '#ff1100', group: 'Colors' },
  { id: 'secondaryDownColor', type: 'color', title: 'Secondary Down Color', defval: '#840900', group: 'Colors' },
];

/** Transparency of the net columns: transp + 60, 55, 45, 30, 25 with transp = 20 */
const LAYERS: [factor: number, transparency: number][] = [[1, 80], [0.8, 75], [0.6, 65], [0.4, 50], [0.2, 45]];
const LAYER_NAMES = ['100', '80', '60', '40', '20'];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero Line', color: color.gray, lineWidth: 1 },
  { id: 'plot1', title: 'Top Limit', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Bottom Limit', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'High Buy Threshold', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'High Sell Threshold', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Buy Interest', color: '#00ffbb', lineWidth: 1, style: 'linebr' },
  { id: 'plot6', title: 'Sell Interest', color: '#ff1100', lineWidth: 1, style: 'linebr' },
  ...LAYERS.map(([, t], k): PlotConfig => ({
    id: `plot${7 + k}`, title: `Net Buy ${LAYER_NAMES[k]}`, color: String(color.new('#008461', t)), lineWidth: 4, style: 'columns',
  })),
  { id: 'plot12', title: 'Net Buy Line', color: String(color.new('#00ffbb', 20)), lineWidth: 1, style: 'linebr' },
  ...LAYERS.map(([, t], k): PlotConfig => ({
    id: `plot${13 + k}`, title: `Net Sell ${LAYER_NAMES[k]}`, color: String(color.new('#840900', t)), lineWidth: 4, style: 'columns',
  })),
  { id: 'plot18', title: 'Net Sell Line', color: String(color.new('#ff1100', 20)), lineWidth: 1, style: 'linebr' },
  { id: 'plot19', title: 'Price Tracking line', color: String(color.new('#DBDBDB', 85)), lineWidth: 1, forceOverlay: true },
];

export const metadata = {
  title: 'Smart Money Volume Index [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - Smart Money',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<SmartMoneyVolumeIndexInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { plotCandles: Record<string, PlotCandleData[]> } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const compare = cfg.mode === 'Compare';
  const net = cfg.mode === 'Net';
  const thr = cfg.highInterestThreshold;
  // chart.fg_color / chart.bg_color
  const CHART_FG = foregroundColorOf(chart);
  const CHART_BG = backgroundColorOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // dumb = ta.pvi - ta.ema(ta.pvi, 255); smart = ta.nvi - ta.ema(ta.nvi, 255)
  const pvi = ta.pvi(bars);
  const nvi = ta.nvi(bars);
  const drsi = A(ta.rsi(pvi.sub(ta.ema(pvi, 255)), cfg.volumeFlowPeriod));
  const srsi = A(ta.rsi(nvi.sub(ta.ema(nvi, 255)), cfg.volumeFlowPeriod));

  // r_buy = srsi / drsi; r_sell = (100 - srsi) / (100 - drsi)
  const rBuy = srsi.map((v, i) => v / drsi[i]);
  const rSell = srsi.map((v, i) => (100 - v) / (100 - drsi[i]));
  const sumsBuy = A(math.sum(S(rBuy), cfg.indexPeriod) as Series);
  const sumsSell = A(math.sum(S(rSell), cfg.indexPeriod) as Series);
  // peak = ta.highest(math.max(sums_buy, sums_sell), peakslen)
  const peak = A(ta.highest(S(sumsBuy.map((v, i) => (isNaN(v) || isNaN(sumsSell[i]) ? NaN : Math.max(v, sumsSell[i])))),
    cfg.normalizationPeriod));

  const indexBuy = sumsBuy.map((v, i) => v / peak[i]);
  const indexSell = sumsSell.map((v, i) => v / peak[i]);
  const netIndex = indexBuy.map((v, i) => v - indexSell[i]);

  const t = (i: number) => bars[i].time as number;
  const num = (v: number) => (Number.isFinite(v) ? v : NaN);
  const constant = (v: number): Point[] => bars.map((b) => ({ time: b.time as number, value: v }));
  const series = (f: (i: number) => number, c: string): Point[] => bars.map((_b, i) => ({ time: t(i), value: num(f(i)), color: c }));

  // plot_buy = mode == "Compare" ? index_buy : na; plot_sell = mode == "Compare" ? -index_sell : na
  const plotBuy = (i: number) => (compare ? indexBuy[i] : NaN);
  const plotSell = (i: number) => (compare ? -indexSell[i] : NaN);
  // n_up = mode == "Net" and net_index > 0 ? net_index : na; n_dn = mode == "Net" and net_index < 0 ? net_index : na
  const nUp = (i: number) => (net && gt(netIndex[i], 0) ? netIndex[i] : NaN);
  const nDn = (i: number) => (net && lt(netIndex[i], 0) ? netIndex[i] : NaN);

  const plots: Record<string, Point[]> = {
    plot0: constant(0),
    plot1: constant(1),
    plot2: constant(-1),
    plot3: constant(thr),
    plot4: constant(-thr),
    plot5: series(plotBuy, cfg.upColor),
    plot6: series(plotSell, cfg.downColor),
  };
  LAYERS.forEach(([factor, transparency], k) => {
    plots[`plot${7 + k}`] = series((i) => nUp(i) * factor, String(color.new(cfg.secondaryUpColor, transparency)));
    plots[`plot${13 + k}`] = series((i) => nDn(i) * factor, String(color.new(cfg.secondaryDownColor, transparency)));
  });
  plots.plot12 = series(nUp, String(color.new(cfg.upColor, 20)));
  plots.plot18 = series(nDn, String(color.new(cfg.downColor, 20)));
  // plot(close, "Price Tracking line", color = color.new(chart.fg_color, 85), force_overlay = true)
  plots.plot19 = series((i) => bars[i].close, String(color.new(CHART_FG, 85)));

  // v_up = mode == "Compare" ? index_buy : net_index; v_dn = mode == "Compare" ? -index_sell : net_index
  const fg = (transparency: number) => String(color.new(CHART_FG, transparency));
  const topActive = bars.map((_b, i) => gt(compare ? indexBuy[i] : netIndex[i], 0.7));
  const botActive = bars.map((_b, i) => lt(compare ? -indexSell[i] : netIndex[i], -0.7));
  const fills = [
    // fill(thresh_up, top, 1, thr, top_active ? fg 45 : fg 90, top_active ? fg 30 : fg 60)
    {
      plot1: 'plot3', plot2: 'plot1',
      gradient: {
        topValue: bars.map(() => 1), bottomValue: bars.map(() => thr),
        topColor: topActive.map((on) => (on ? fg(45) : fg(90))), bottomColor: topActive.map((on) => (on ? fg(30) : fg(60))),
      },
    },
    // fill(thresh_down, low_, -thr, -1, bot_active ? fg 30 : fg 60, bot_active ? fg 45 : fg 90)
    {
      plot1: 'plot4', plot2: 'plot2',
      gradient: {
        topValue: bars.map(() => -thr), bottomValue: bars.map(() => -1),
        topColor: botActive.map((on) => (on ? fg(30) : fg(60))), bottomColor: botActive.map((on) => (on ? fg(45) : fg(90))),
      },
    },
    // fill(bottom, i_buy, plot_buy, 0, green, chart.bg_color)
    {
      plot1: 'plot0', plot2: 'plot5',
      gradient: {
        topValue: bars.map((_b, i) => num(plotBuy(i))), bottomValue: bars.map(() => 0),
        topColor: bars.map(() => cfg.upColor), bottomColor: bars.map(() => CHART_BG),
      },
    },
    // fill(bottom, i_sell, plot_sell, 0, red, chart.bg_color)
    {
      plot1: 'plot0', plot2: 'plot6',
      gradient: {
        topValue: bars.map((_b, i) => num(plotSell(i))), bottomValue: bars.map(() => 0),
        topColor: bars.map(() => cfg.downColor), bottomColor: bars.map(() => CHART_BG),
      },
    },
  ];

  // plotcandle(open, high, low, close, color = candle_color, wickcolor = candle_color, bordercolor = candle_color,
  //   force_overlay = true)
  const candles: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    let candleColor: string | null;
    if (net) {
      // net_color = net_index > 0 ? from_gradient(abs_net, 0, 1, bg, green) : from_gradient(abs_net, 0, 1, bg, red)
      const absNet = Math.abs(netIndex[i]);
      candleColor = isNaN(absNet) ? null
        : String(color.from_gradient(absNet, 0, 1, CHART_BG, gt(netIndex[i], 0) ? cfg.upColor : cfg.downColor));
    } else {
      // comp_color = sig_buy > thr ? green : sig_sell > thr ? red : na
      candleColor = gt(indexBuy[i], thr) ? cfg.upColor : gt(indexSell[i], thr) ? cfg.downColor : null;
    }
    const c = candleColor ?? 'transparent';
    candles.push({
      time: t(i), open: bars[i].open, high: bars[i].high, low: bars[i].low, close: bars[i].close,
      color: c, wickColor: c, borderColor: c, forceOverlay: true,
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    plotCandles: { smartMoneyCandles: candles },
  };
}

export const SmartMoneyVolumeIndex = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
