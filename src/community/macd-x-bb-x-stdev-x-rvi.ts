/**
 * [Venturose] MACD x BB x STDEV x RVI
 *
 * MACD line (fast EMA - slow EMA) with Bollinger-style bands: the EMA of the MACD (midline) plus / minus the
 * standard deviation of the MACD times a factor, and a long EMA of the MACD (trend). The MACD line is green above the
 * upper band, red below the lower band and, inside the bands, green when rising and red when falling ("Inside"
 * trigger); with the "Flipped" trigger it is red below the upper band, green above the lower band, else neutral.
 * Buy / sell signals are the first bar of a green / red line (optionally only at or below / at or above the
 * midline). A Relative Volatility Index (EMA of the standard deviation of the close on up / down bars) above / below
 * its thresholds gives sell / buy hint flags.
 * Alerts (alertcondition, `alerts` of the result): 'Buy & Sell', 'Buy' and 'Sell', true on the bars of the buy / sell
 * signals (whether or not they are plotted).
 *
 * Reference: "[Venturose] MACD x BB x STDEV x RVI" by Vaquant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Vaquant
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MacdXBbXStdevXRviInputs {
  fastEmaPeriod: number;
  slowEmaPeriod: number;
  /** EMA / stdev period of the MACD (midline and bands) */
  avgPeriod: number;
  /** EMA period of the MACD trend line */
  smoothedAvgPeriod: number;
  stdevFactor: number;
  /** RVI standard deviation length */
  rviLength: number;
  /** RVI offset (an input of the Pine source that is not used) */
  rviOffset: number;
  /** RVI EMA length */
  rviMaLength: number;
  rviUpperThreshold: number;
  rviLowerThreshold: number;
  bearishColor: string;
  bullishColor: string;
  neutralLineColor: string;
  neutralColor: string;
  neutralFillColor: string;
  avgColor: string;
  smoothedAvgColor: string;
  plotBuyHints: boolean;
  plotSellHints: boolean;
  plotBuySignals: boolean;
  plotSellSignals: boolean;
  /** Trigger: 'Inside' or 'Flipped' */
  triggerAt: 'Inside' | 'Flipped';
  enableSignalFilter: boolean;
}

export const defaultInputs: MacdXBbXStdevXRviInputs = {
  fastEmaPeriod: 12,
  slowEmaPeriod: 26,
  avgPeriod: 9,
  smoothedAvgPeriod: 100,
  stdevFactor: 0.89,
  rviLength: 10,
  rviOffset: 0,
  rviMaLength: 14,
  rviUpperThreshold: 81,
  rviLowerThreshold: 19,
  bearishColor: color.red,
  bullishColor: color.green,
  neutralLineColor: color.white,
  // input.color(color.new(color.gray, 60)) / input.color(color.new(color.gray, 90)): input alpha 0.4 / 0.1
  neutralColor: 'rgba(120, 123, 134, 0.4)',
  neutralFillColor: 'rgba(120, 123, 134, 0.1)',
  avgColor: color.black,
  smoothedAvgColor: color.blue,
  plotBuyHints: false,
  plotSellHints: true,
  plotBuySignals: true,
  plotSellSignals: false,
  triggerAt: 'Inside',
  enableSignalFilter: true,
};

const G_VALUES = 'MACD / BB / STDEV';
const G_RVI = 'Relative Volatility Index';
const G_COLORS = 'Colors';
const G_DISPLAY = 'Display';
const G_LOGIC = 'Logic';

export const inputConfig: InputConfig[] = [
  { id: 'fastEmaPeriod', type: 'int', title: 'Fast Moving Average Period', defval: 12, group: G_VALUES },
  { id: 'slowEmaPeriod', type: 'int', title: 'Slow Moving Average Period', defval: 26, group: G_VALUES },
  { id: 'avgPeriod', type: 'int', title: 'Average Period', defval: 9, group: G_VALUES },
  { id: 'smoothedAvgPeriod', type: 'int', title: 'Smoothed Average Period', defval: 100, group: G_VALUES },
  { id: 'stdevFactor', type: 'float', title: 'Standard Deviation Multiplier', defval: 0.89, group: G_VALUES },
  { id: 'rviLength', type: 'int', title: 'Length', defval: 10, min: 1, group: G_RVI },
  { id: 'rviOffset', type: 'int', title: 'Offset', defval: 0, min: -500, max: 500, group: G_RVI },
  { id: 'rviMaLength', type: 'int', title: 'MA Length', defval: 14, min: 1, group: G_VALUES },
  { id: 'rviUpperThreshold', type: 'int', title: 'Upper Threshold', defval: 81, min: 50, max: 100 },
  { id: 'rviLowerThreshold', type: 'int', title: 'Lower Threshold', defval: 19, min: 0, max: 50 },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: color.red, group: G_COLORS },
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: color.green, group: G_COLORS },
  { id: 'neutralLineColor', type: 'color', title: 'Neutral Line Color', defval: color.white, group: G_COLORS },
  { id: 'neutralColor', type: 'color', title: 'Neutral Bands Color', defval: 'rgba(120, 123, 134, 0.4)', group: G_COLORS },
  { id: 'neutralFillColor', type: 'color', title: 'Neutral Fill Color', defval: 'rgba(120, 123, 134, 0.1)', group: G_COLORS },
  { id: 'avgColor', type: 'color', title: 'Midline Color', defval: color.black, group: G_COLORS },
  { id: 'smoothedAvgColor', type: 'color', title: 'Smoothed Midline Color', defval: color.blue, group: G_COLORS },
  { id: 'plotBuyHints', type: 'bool', title: 'Plot Buy Hints', defval: false, group: G_DISPLAY,
    tooltip: 'Hint when it could be interesting to buy, instead of waiting for an "official" signal.' },
  { id: 'plotSellHints', type: 'bool', title: 'Plot Sell Hints', defval: true, group: G_DISPLAY,
    tooltip: 'Hint when it could be interesting to sell, instead of waiting for an "official" signal.' },
  { id: 'plotBuySignals', type: 'bool', title: 'Plot Buy Signals', defval: true, group: G_DISPLAY },
  { id: 'plotSellSignals', type: 'bool', title: 'Plot Sell Signals', defval: false, group: G_DISPLAY },
  { id: 'triggerAt', type: 'string', title: 'Trigger', defval: 'Inside', options: ['Inside', 'Flipped'], group: G_LOGIC },
  { id: 'enableSignalFilter', type: 'bool', title: 'Enable Signal Filter', defval: true, group: G_LOGIC },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'BB + MACD', color: color.white, lineWidth: 2 },
  { id: 'plot1', title: 'Upper Band', color: 'rgba(120, 123, 134, 0.4)', lineWidth: 1 },
  { id: 'plot2', title: 'Lower Band', color: 'rgba(120, 123, 134, 0.4)', lineWidth: 1 },
  { id: 'plot3', title: 'Midline', color: color.black, lineWidth: 1 },
  { id: 'plot4', title: 'Trend', color: color.blue, lineWidth: 1 },
];

export const metadata = {
  title: '[Venturose] MACD x BB x STDEV x RVI',
  shortTitle: '[Venturose] MACD,BB,STDEV,RVI',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

/** Colour key for Pine colour == / != (same RGBA) */
const colorKey = (c: string): string => {
  const s = String(c).trim().toLowerCase();
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) return `#${m[1]}${m[2] ?? 'ff'}`;
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (m) {
    const h = (x: number) => Math.round(x).toString(16).padStart(2, '0');
    const a = m[4] === undefined ? 255 : Math.floor(Number(m[4]) * 255 + 0.5);
    return `#${h(+m[1])}${h(+m[2])}${h(+m[3])}${h(a)}`;
  }
  return s;
};

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdXBbXStdevXRviInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));

  // MACD and its bands
  const fastEma = A(ta.ema(close, cfg.fastEmaPeriod));
  const slowEma = A(ta.ema(close, cfg.slowEmaPeriod));
  const macd = fastEma.map((v, i) => v - slowEma[i]);
  const macdS = S(macd);
  const avg = A(ta.ema(macdS, cfg.avgPeriod));
  const stdev = A(ta.stdev(macdS, cfg.avgPeriod));
  const smoothedAvg = A(ta.ema(macdS, cfg.smoothedAvgPeriod));
  const upperBand = avg.map((v, i) => v + cfg.stdevFactor * stdev[i]);
  const lowerBand = avg.map((v, i) => v - cfg.stdevFactor * stdev[i]);

  // RVI: upper = ema(change(close) <= 0 ? 0 : stddev), lower = ema(change(close) > 0 ? 0 : stddev)
  const stddev = A(ta.stdev(close, cfg.rviLength));
  const change = bars.map((b, i) => (i > 0 ? b.close - bars[i - 1].close : NaN));
  const upper = A(ta.ema(S(change.map((c, i) => (le(c, 0) ? 0 : stddev[i]))), cfg.rviMaLength));
  const lower = A(ta.ema(S(change.map((c, i) => (gt(c, 0) ? 0 : stddev[i]))), cfg.rviMaLength));
  // rvi = upper + lower != 0 ? upper / (upper + lower) * 100 : 0 (na != 0 is false)
  const rvi = upper.map((u, i) => (ne(u + lower[i], 0) ? (u / (u + lower[i])) * 100 : 0));

  const bull = cfg.bullishColor;
  const bear = cfg.bearishColor;
  const bullKey = colorKey(bull);
  const bearKey = colorKey(bear);
  const inside = cfg.triggerAt === 'Inside';

  const plotColor: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const m = macd[i];
    let c = cfg.neutralLineColor;
    if (inside) {
      if (gt(m, upperBand[i])) c = bull;
      else if (lt(m, lowerBand[i])) c = bear;
      else c = gt(m, i > 0 ? macd[i - 1] : NaN) ? bull : bear;
    } else {
      // bearish_trigger = lower_band, bullish_trigger = upper_band
      c = cfg.neutralLineColor;
      if (lt(m, lowerBand[i])) c = bear;
      if (gt(m, upperBand[i])) c = bull;
    }
    plotColor[i] = c;
  }

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [], anyFlags: boolean[] = [];
  const bearFill = String(color.new(bear, 90 / 1.5));
  const bullFill = String(color.new(bull, 90 / 1.5));
  const bearFills: string[] = new Array(n);
  const bullFills: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const key = colorKey(plotColor[i]);
    // plot_color[1] != x: false on bar 0 (na)
    const prevKey = i > 0 ? colorKey(plotColor[i - 1]) : null;
    const buySignal = key === bullKey && prevKey !== null && prevKey !== bullKey
      && (!cfg.enableSignalFilter || le(macd[i], avg[i]));
    const sellSignal = key === bearKey && prevKey !== null && prevKey !== bearKey
      && (!cfg.enableSignalFilter || ge(macd[i], avg[i]));
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    anyFlags.push(buySignal || sellSignal);
    if (buySignal && cfg.plotBuySignals) {
      markers.push({ time: t, position: 'bottom', shape: 'triangleUp', color: bull, size: 'small' });
    }
    if (sellSignal && cfg.plotSellSignals) {
      markers.push({ time: t, position: 'top', shape: 'triangleDown', color: bear, size: 'small' });
    }
    if (gt(rvi[i], cfg.rviUpperThreshold) && cfg.plotSellHints) {
      markers.push({ time: t, position: 'top', shape: 'flag', color: bear, size: 'small' });
    }
    if (lt(rvi[i], cfg.rviLowerThreshold) && cfg.plotBuyHints) {
      markers.push({ time: t, position: 'bottom', shape: 'flag', color: bull, size: 'small' });
    }
    // bearish_color_plot = macd < lower_band ? color.new(bearish_color, 60) : na; bullish: macd > upper_band
    bearFills[i] = lt(macd[i], lowerBand[i]) ? bearFill : 'transparent';
    bullFills[i] = gt(macd[i], upperBand[i]) ? bullFill : 'transparent';
  }

  const line = (vals: number[], col: (i: number) => string) =>
    bars.map((b, i) => ({ time: b.time, value: Number.isFinite(vals[i]) ? vals[i] : NaN, color: col(i) }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(macd, (i) => plotColor[i]),
      plot1: line(upperBand, () => cfg.neutralColor),
      plot2: line(lowerBand, () => cfg.neutralColor),
      plot3: line(avg, () => cfg.avgColor),
      plot4: line(smoothedAvg, () => cfg.smoothedAvgColor),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot2', colors: new Array<string>(n).fill(cfg.neutralFillColor) },
      { plot1: 'plot0', plot2: 'plot2', colors: bearFills },
      { plot1: 'plot0', plot2: 'plot1', colors: bullFills },
    ],
    markers,
    // alertcondition(buy_signal or sell_signal, 'Buy & Sell') / (buy_signal, 'Buy') / (sell_signal, 'Sell')
    alerts: alertStates(alertConditions, bars, [anyFlags, buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy & Sell', message: 'Price entered buy / sell area' },
  { id: 'alert1', title: 'Buy', message: 'Price entered buying area' },
  { id: 'alert2', title: 'Sell', message: 'Price entered selling area' },
];

export const MacdXBbXStdevXRvi = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
