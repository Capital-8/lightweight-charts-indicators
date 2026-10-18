/**
 * CCI Stochastic
 *
 * The stochastic of the CCI: CCI of the source over `CCI Period` bars, then the stochastic of the CCI against its
 * own highest / lowest over `Stoch Period` bars, smoothed by an SMA (K) and a second SMA (D). The line shows D (or K)
 * in red above the overbought level, green below the oversold level and gray between them. The zone between the
 * overbought level and 100 is filled red while the line is above it, the zone between 0 and the oversold level green
 * while the line is under it.
 *
 * Arrows at 0 / 100 (35 / 65 for the center zone): "Enter" when the line crosses under the oversold level (buy) or
 * over the overbought level (sell), "Exit" when it crosses under the overbought level (sell) or over the oversold
 * level (buy), "Center" (off by default) when it crosses the 50 level.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Trend Enter Buy' / 'Trend Enter Sell', 'Trend Center Buy' /
 * 'Trend Center Sell' and 'Trend Exit Buy' / 'Trend Exit Sell', true on the bars of the matching arrow (with its
 * "Show Arrows" inputs on).
 *
 * Reference: "CCI Stochastic" by Daveatt
 */

import {
  ta, color, callsite, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CCIStochasticInputs {
  source: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'hlcc4';
  cciPeriod: number;
  stochPeriod: number;
  stochSmoothK: number;
  stochSmoothD: number;
  /** Line shown: the D line or the K line */
  dOrK: 'D' | 'K';
  overbought: number;
  oversold: number;
  showArrows: boolean;
  showArrowsEnter: boolean;
  showArrowsCenter: boolean;
  showArrowsExit: boolean;
}

export const defaultInputs: CCIStochasticInputs = {
  source: 'close',
  cciPeriod: 28,
  stochPeriod: 28,
  stochSmoothK: 3,
  stochSmoothD: 3,
  dOrK: 'D',
  overbought: 80,
  oversold: 20,
  showArrows: true,
  showArrowsEnter: true,
  showArrowsCenter: false,
  showArrowsExit: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'source', defval: 'close' },
  { id: 'cciPeriod', type: 'int', title: 'CCI Period', defval: 28 },
  { id: 'stochPeriod', type: 'int', title: 'Stoch Period', defval: 28 },
  { id: 'stochSmoothK', type: 'int', title: 'Stoch Smooth K', defval: 3 },
  { id: 'stochSmoothD', type: 'int', title: 'Stoch Smooth D', defval: 3 },
  { id: 'dOrK', type: 'string', title: 'd_or_k', defval: 'D', options: ['D', 'K'] },
  { id: 'overbought', type: 'int', title: 'Overbought', defval: 80 },
  { id: 'oversold', type: 'int', title: 'Oversold', defval: 20 },
  { id: 'showArrows', type: 'bool', title: 'Show Arrows', defval: true },
  { id: 'showArrowsEnter', type: 'bool', title: 'Show Arrows on Enter zone', defval: true },
  { id: 'showArrowsCenter', type: 'bool', title: 'Show Arrows on Center zone', defval: false },
  { id: 'showArrowsExit', type: 'bool', title: 'Show Arrows on Exit zone', defval: true },
];

// Colour constants of Pine version 4
const RED = '#FF5252';
const LIME = '#00E676';
const GREEN = '#4CAF50';
const GRAY = '#787B86';
const AQUA = '#00BCD4';
const FUCHSIA = '#E040FB';
const ORANGE = '#FF9800';
const MAROON = '#880E4F';
const NONE = String(color.new('#FFFFFF', 100));

export const plotConfig: PlotConfig[] = [
  // plot(ma, "Moving Average", linewidth=3, color=ma_color): red above OB, green below OS, gray between
  { id: 'plot0', title: 'Moving Average', color: GRAY, lineWidth: 3, palette: [RED, GREEN, GRAY] },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_ob', price: 80, title: 'Upper Line', color: RED, linestyle: 'solid', linewidth: 1 },
  { id: 'hline_os', price: 20, title: 'Lower Line', color: LIME, linestyle: 'solid', linewidth: 1 },
  { id: 'hline_mid', price: 50, title: 'Mid Line', color: GRAY, linestyle: 'solid', linewidth: 1 },
  { id: 'hline_max', price: 100, title: 'Max Level', color: NONE, linestyle: 'dotted', linewidth: 1 },
  { id: 'hline_min', price: 0, title: 'Min Level', color: NONE, linestyle: 'dotted', linewidth: 1 },
];

/**
 * fill(maxLevelPlot, overbought) and fill(minLevelPlot, oversold), untitled ("Hlines Background"): the colour changes
 * per bar (result `fills`)
 */
export const fillConfig: FillConfig[] = [
  { id: 'fill_ob', plot1: 'hline_max', plot2: 'hline_ob', color: String(color.new(RED, 90)), title: 'Hlines Background' },
  { id: 'fill_os', plot1: 'hline_min', plot2: 'hline_os', color: String(color.new(GREEN, 90)), title: 'Hlines Background' },
];

export const metadata = {
  title: 'CCI Stochastic',
  shortTitle: 'CCI_S',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<CCIStochasticInputs> = {},
): IndicatorResult & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const OB = cfg.overbought;
  const OS = cfg.oversold;

  // cci = cci(source, cci_period); stoch_cci_k = sma(stoch(cci, cci, cci, stoch_period), K); stoch_cci_d = sma(k, D)
  const cci = ta.cci(getSourceSeries(bars, cfg.source), cfg.cciPeriod);
  const k = ta.sma(ta.stoch(cci, cci, cci, cfg.stochPeriod), cfg.stochSmoothK);
  const d = ta.sma(k, cfg.stochSmoothD);
  const ma = (cfg.dOrK === 'D' ? d : k).toArray().map((v) => v ?? NaN);

  // Each crossing call runs only in its branch: `if showArrowsX` (an input) and the else branch of the first test
  const enterUnder = callsite.crossunder();
  const enterOver = callsite.crossover();
  const exitUnder = callsite.crossunder();
  const exitOver = callsite.crossover();
  const centerUnder = callsite.crossunder();
  const centerOver = callsite.crossover();

  const plot0: { time: number; value: number; color: string }[] = [];
  const obColors: string[] = [];
  const osColors: string[] = [];
  const markers: MarkerData[] = [];
  const flags: boolean[][] = [[], [], [], [], [], []];
  // id: shape<k> of the k-th plotshape (Enter Buy / Sell, Center Buy / Sell, Exit Buy / Sell)
  const arrow = (id: string, time: number, up: boolean, price: number, c: string) => {
    markers.push({ id, time, position: 'atPriceMiddle', price, shape: up ? 'arrowUp' : 'arrowDown',
      color: String(color.new(c, 20)), size: 'normal' });
  };

  for (let i = 0; i < n; i++) {
    const m = ma[i];
    const t = bars[i].time;
    // trend_enter = if showArrowsEnter: crossunder(ma, OS) ? 1 : crossover(ma, OB) ? -1 : na
    let trendEnter = NaN;
    if (cfg.showArrowsEnter) {
      if (enterUnder(m, OS)) trendEnter = 1;
      else if (enterOver(m, OB)) trendEnter = -1;
    }
    let trendExit = NaN;
    if (cfg.showArrowsExit) {
      if (exitUnder(m, OB)) trendExit = -1;
      else if (exitOver(m, OS)) trendExit = 1;
    }
    let trendCenter = NaN;
    if (cfg.showArrowsCenter) {
      if (centerUnder(m, 50)) trendCenter = -1;
      else if (centerOver(m, 50)) trendCenter = 1;
    }

    // ma_color = ma > OB ? red : ma < OS ? green : gray
    plot0.push({ time: t, value: m, color: gt(m, OB) ? RED : lt(m, OS) ? GREEN : GRAY });
    obColors.push(gt(m, OB) ? String(color.new(RED, 90)) : NONE);
    osColors.push(lt(m, OS) ? String(color.new(GREEN, 90)) : NONE);

    // The plotshape and alertcondition calls test the same expressions, in the same order
    const signals = [
      cfg.showArrows && cfg.showArrowsEnter && trendEnter === 1,
      cfg.showArrows && cfg.showArrowsEnter && trendEnter === -1,
      cfg.showArrows && cfg.showArrowsCenter && trendCenter === 1,
      cfg.showArrows && cfg.showArrowsCenter && trendCenter === -1,
      cfg.showArrows && cfg.showArrowsExit && trendExit === 1,
      cfg.showArrows && cfg.showArrowsExit && trendExit === -1,
    ];
    signals.forEach((on, k) => flags[k].push(on));
    if (signals[0]) arrow('shape0', t, true, 0, GREEN);
    if (signals[1]) arrow('shape1', t, false, 100, RED);
    if (signals[2]) arrow('shape2', t, true, 35, AQUA);
    if (signals[3]) arrow('shape3', t, false, 65, FUCHSIA);
    if (signals[4]) arrow('shape4', t, true, 0, ORANGE);
    if (signals[5]) arrow('shape5', t, false, 100, MAROON);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines: [
      { value: OB, options: { title: 'Upper Line', color: RED, linestyle: 'solid', linewidth: 1 } },
      { value: OS, options: { title: 'Lower Line', color: LIME, linestyle: 'solid', linewidth: 1 } },
      { value: 50, options: { title: 'Mid Line', color: GRAY, linestyle: 'solid', linewidth: 1 } },
      { value: 100, options: { title: 'Max Level', color: NONE, linestyle: 'dotted', linewidth: 1 } },
      { value: 0, options: { title: 'Min Level', color: NONE, linestyle: 'dotted', linewidth: 1 } },
    ],
    fills: [
      { plot1: 'hline_max', plot2: 'hline_ob', options: { title: 'Hlines Background' }, colors: obColors },
      { plot1: 'hline_min', plot2: 'hline_os', options: { title: 'Hlines Background' }, colors: osColors },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions (the message is the title) */
export const alertConditions: AlertConditionDecl[] = [
  'Trend Enter Buy', 'Trend Enter Sell', 'Trend Center Buy', 'Trend Center Sell', 'Trend Exit Buy', 'Trend Exit Sell',
].map((title, k) => ({ id: `alert${k}`, title, message: title }));

export const CCIStochastic = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig, fillConfig, alertConditions,
};
