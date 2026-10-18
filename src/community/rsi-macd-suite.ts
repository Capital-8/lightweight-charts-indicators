/**
 * RSI & MACD Suite
 *
 * RSI and MACD in one pane. RSI: the RMA of the up and down changes of the source, rsi = 100 - 100 / (1 + up / down)
 * (100 when down is 0, 0 when up is 0), with bands at 70 / 50 / 30, a band fill and gradient fills above 70 and
 * below 30. MACD: fast MA - slow MA (EMA or SMA) of a second source, a signal MA (EMA or SMA) of the MACD and the
 * histogram MACD - signal (teal at or above 0, red below), with a zero line.
 * Alerts (alertcondition, `alerts` of the result): the RSI crossing over 70, under 30 and across 50, the MACD
 * crossing over / under its signal and the histogram crossing over / under 0.
 *
 * Reference: "RSI & MACD Suite" by aaboomar
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © aaboomar
 */

import {
  ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig,
  type FillConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type MaType = 'EMA' | 'SMA';

export interface RsiMacdSuiteInputs {
  /** RSI length */
  rsiLength: number;
  /** RSI source */
  rsiSource: SourceType;
  /** MACD source */
  macdSource: SourceType;
  fastLength: number;
  slowLength: number;
  signalLength: number;
  /** Oscillator MA type (fast and slow MAs) */
  oscType: MaType;
  /** Signal MA type */
  sigType: MaType;
}

export const defaultInputs: RsiMacdSuiteInputs = {
  rsiLength: 14,
  rsiSource: 'close',
  macdSource: 'close',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  oscType: 'EMA',
  sigType: 'EMA',
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'Length', defval: 14, min: 1, group: 'RSI Settings' },
  { id: 'rsiSource', type: 'source', title: 'Source', defval: 'close', group: 'RSI Settings' },
  { id: 'macdSource', type: 'source', title: 'Source', defval: 'close', group: 'MACD Settings' },
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12, min: 1, group: 'MACD Settings' },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26, min: 1, group: 'MACD Settings' },
  { id: 'signalLength', type: 'int', title: 'Signal Length', defval: 9, min: 1, group: 'MACD Settings' },
  { id: 'oscType', type: 'string', title: 'Oscillator MA Type', defval: 'EMA', options: ['EMA', 'SMA'], group: 'MACD Settings' },
  { id: 'sigType', type: 'string', title: 'Signal MA Type', defval: 'EMA', options: ['EMA', 'SMA'], group: 'MACD Settings' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI - Line', color: color.yellow, lineWidth: 2 },
  { id: 'plot1', title: 'RSI Midline', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'MACD - Histogram', color: '#26a69a', lineWidth: 1, style: 'columns' },
  { id: 'plot3', title: 'MACD - Line', color: color.blue, lineWidth: 2 },
  { id: 'plot4', title: 'MACD - Signal Line', color: '#ff6d00', lineWidth: 2 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 70, title: 'RSI - Upper Band (70)', color: color.white, linestyle: 'solid' },
  { id: 'hline_mid', price: 50, title: 'RSI - Middle Band (50)', color: String(color.new(color.white, 50)), linestyle: 'solid' },
  { id: 'hline_lower', price: 30, title: 'RSI - Lower Band (30)', color: color.white, linestyle: 'solid' },
  { id: 'hline_zero', price: 0, title: 'MACD - Zero Line', color: '#787b8680', linestyle: 'solid' },
];

/** fill(rsiUpperBand, rsiLowerBand, color.rgb(126, 87, 194, 90)) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_bands', plot1: 'hline_upper', plot2: 'hline_lower', color: String(color.rgb(126, 87, 194, 90)), title: 'RSI - Background Fill' },
];

export const metadata = {
  title: 'RSI & MACD Suite',
  shortTitle: 'RSI+MACD',
  overlay: false,
};

/** Pine float comparisons: a == b within 1e-10, a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiMacdSuiteInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  if (cfg.fastLength >= cfg.slowLength) throw new Error('MACD Fast length must be less than Slow length');

  // RSI: change = ta.change(src); up = ta.rma(math.max(change, 0)); down = ta.rma(-math.min(change, 0))
  const change = A(ta.change(getSourceSeries(bars, cfg.rsiSource)));
  const up = A(ta.rma(S(change.map((c) => (isNaN(c) ? NaN : Math.max(c, 0)))), cfg.rsiLength));
  const down = A(ta.rma(S(change.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0)))), cfg.rsiLength));
  // rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))
  const rsi = up.map((u, i) => (eq(down[i], 0) ? 100 : eq(u, 0) ? 0 : 100 - 100 / (1 + u / down[i])));

  // MACD
  const ma = (src: Series, len: number, type: MaType) => A(type === 'EMA' ? ta.ema(src, len) : ta.sma(src, len));
  const macdSrc = getSourceSeries(bars, cfg.macdSource);
  const maFast = ma(macdSrc, cfg.fastLength, cfg.oscType);
  const maSlow = ma(macdSrc, cfg.slowLength, cfg.oscType);
  const macd = maFast.map((f, i) => f - maSlow[i]);
  const signal = ma(S(macd), cfg.signalLength, cfg.sigType);
  const hist = macd.map((m, i) => m - signal[i]);

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const t = (i: number) => bars[i].time;
  const plots = {
    plot0: bars.map((_b, i) => ({ time: t(i), value: fin(rsi[i]), color: color.yellow })),
    // midLinePlot = plot(50, color = na, editable = false, display = display.none)
    plot1: bars.map((_b, i) => ({ time: t(i), value: 50 })),
    // hColor = hist >= 0 ? #26a69a : #ff5252
    plot2: bars.map((_b, i) => ({ time: t(i), value: fin(hist[i]), color: ge(hist[i], 0) ? '#26a69a' : '#ff5252' })),
    plot3: bars.map((_b, i) => ({ time: t(i), value: fin(macd[i]), color: color.blue })),
    plot4: bars.map((_b, i) => ({ time: t(i), value: fin(signal[i]), color: '#ff6d00' })),
  };

  // fill(rsiPlot, midLinePlot, 100, 70, top_color = color.new(color.green, 0), bottom_color = color.new(color.green, 100))
  // fill(rsiPlot, midLinePlot, 30, 0, top_color = color.new(color.red, 100), bottom_color = color.new(color.red, 0))
  const fillArr = <T>(v: T) => new Array<T>(n).fill(v);
  // ta.cross(rsi, 50) = crossover or crossunder
  const rsiOver50 = crossedOver(rsi, 50);
  const rsiUnder50 = crossedUnder(rsi, 50);
  const alertFlags = [
    crossedOver(rsi, 70),
    crossedUnder(rsi, 30),
    rsiOver50.map((v, i) => v || rsiUnder50[i]),
    crossedOver(macd, signal),
    crossedUnder(macd, signal),
    crossedOver(hist, 0),
    crossedUnder(hist, 0),
  ];
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots,
    hlines: hlineConfig.map((h) => ({ value: h.price, options: { title: h.title, color: h.color, linestyle: h.linestyle } })),
    fills: [
      { plot1: 'hline_upper', plot2: 'hline_lower', options: { title: 'RSI - Background Fill' },
        colors: fillArr(String(color.rgb(126, 87, 194, 90))) },
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'RSI - Overbought Gradient' },
        gradient: { topValue: fillArr(100), bottomValue: fillArr(70),
          topColor: fillArr<string | null>(String(color.new(color.green, 0))),
          bottomColor: fillArr<string | null>(String(color.new(color.green, 100))) } },
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'RSI - Oversold Gradient' },
        gradient: { topValue: fillArr(30), bottomValue: fillArr(0),
          topColor: fillArr<string | null>(String(color.new(color.red, 100))),
          bottomColor: fillArr<string | null>(String(color.new(color.red, 0))) } },
    ],
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RSI Overbought', message: 'RSI crossed above 70 (Overbought)' },
  { id: 'alert1', title: 'RSI Oversold', message: 'RSI crossed below 30 (Oversold)' },
  { id: 'alert2', title: 'RSI Midline Cross', message: 'RSI crossed the 50 midline' },
  { id: 'alert3', title: 'MACD Bullish Cross', message: 'MACD line crossed above Signal line (Bullish)' },
  { id: 'alert4', title: 'MACD Bearish Cross', message: 'MACD line crossed below Signal line (Bearish)' },
  { id: 'alert5', title: 'MACD Histogram Bullish', message: 'MACD Histogram crossed above zero (Bullish momentum)' },
  { id: 'alert6', title: 'MACD Histogram Bearish', message: 'MACD Histogram crossed below zero (Bearish momentum)' },
];

export const RsiMacdSuite = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
