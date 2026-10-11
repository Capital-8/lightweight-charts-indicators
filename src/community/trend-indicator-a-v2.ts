/**
 * Trend Indicator A (v2.3), smoothed Heikin Ashi cloud
 *
 * A moving average of each price of the Heikin Ashi candles of the chart timeframe (open, close, high, low). The
 * cloud between the smoothed open and the smoothed close has the positive colour when the close line is above the
 * open line (trend = 100 * (close - open) / (high - low) > 0), else the negative colour. Two lighter clouds go from
 * the smoothed high to the top of the body and from the bottom of the body to the smoothed low.
 *
 * Heikin Ashi candle: close = (open + high + low + close) / 4; open = the average of the open and the close of the
 * candle before (the average of open and close on the first bar); high / low = the highest / lowest of the bar
 * high / low and the candle open and close.
 *
 * Moving average types: ALMA, HMA, SMA, SWMA, VWMA, WMA, ZLEMA (an EMA of x + x - x[(length - 1) / 2]) and EMA. As
 * in the original, the type "WMA" computes the volume weighted average, the same as "VWMA".
 *
 * Reference: "Trend Indicator A (v2.3)" by DZIV
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Author DZIV (dzi_v_)
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface TrendIndicatorAV2Inputs {
  maType: 'ALMA' | 'HMA' | 'SMA' | 'SWMA' | 'VWMA' | 'WMA' | 'ZLEMA' | 'EMA';
  maPeriod: number;
  almaOffset: number;
  almaSigma: number;
  showCloseLine: boolean;
  showHighLowLines: boolean;
  showFill: boolean;
  colorPositive: string;
  colorNegative: string;
  colorNeutral: string;
}

export const defaultInputs: TrendIndicatorAV2Inputs = {
  maType: 'EMA',
  maPeriod: 9,
  almaOffset: 0.85,
  almaSigma: 6,
  showCloseLine: true,
  showHighLowLines: false,
  showFill: true,
  colorPositive: '#26A69A',
  colorNegative: '#EF5350',
  colorNeutral: '#808080',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'maType', type: 'string', title: 'MA Type', defval: 'EMA',
    options: ['ALMA', 'HMA', 'SMA', 'SWMA', 'VWMA', 'WMA', 'ZLEMA', 'EMA'], group: 'Setup',
  },
  { id: 'maPeriod', type: 'int', title: 'MA Period (Length)', defval: 9, min: 1, group: 'Setup' },
  { id: 'almaOffset', type: 'float', title: 'ALMA Shift', defval: 0.85, min: 0, max: 1, step: 0.05, group: 'Setup (ALMA)' },
  { id: 'almaSigma', type: 'int', title: 'ALMA Deviation', defval: 6, min: 1, step: 1, group: 'Setup (ALMA)' },
  { id: 'showCloseLine', type: 'bool', title: 'Show Close line', defval: true, group: 'On/Off' },
  { id: 'showHighLowLines', type: 'bool', title: 'Show High/Low lines', defval: false, group: 'On/Off' },
  { id: 'showFill', type: 'bool', title: 'Show fill', defval: true, group: 'On/Off' },
  { id: 'colorPositive', type: 'color', title: 'Positive color (Bullish)', defval: '#26A69A', group: 'Colors' },
  { id: 'colorNegative', type: 'color', title: 'Negative color (Bearish)', defval: '#EF5350', group: 'Colors' },
  { id: 'colorNeutral', type: 'color', title: 'Neutral color', defval: '#808080', group: 'Colors' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Open line', color: 'transparent' },
  { id: 'plot1', title: 'Close line', color: '#26A69A', lineWidth: 2 },
  { id: 'plot2', title: 'High line', color: '#808080' },
  { id: 'plot3', title: 'Low line', color: '#808080' },
  { id: 'plot4', title: 'Highest Body line', color: 'transparent' },
  { id: 'plot5', title: 'Lowest Body line', color: 'transparent' },
];

export const metadata = {
  title: 'Trend Indicator A (v2.3)',
  shortTitle: 'Trend Indicator A (v2.3)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

/** Heikin Ashi candles of the bars (ticker.heikinashi on the chart timeframe) */
function heikinAshi(bars: Bar[]): Array<{ open: number; high: number; low: number; close: number }> {
  const out: Array<{ open: number; high: number; low: number; close: number }> = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({ open, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), close });
  }
  return out;
}

export function calculate(bars: Bar[], inputs: Partial<TrendIndicatorAV2Inputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const period = Math.trunc(cfg.maPeriod);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const volume = new Series(bars, (b) => b.volume ?? NaN);

  // f(x)
  const f = (values: number[]): number[] => {
    const x = Series.fromArray(bars, values);
    switch (cfg.maType) {
      case 'ALMA': return A(ta.alma(x, period, cfg.almaOffset, cfg.almaSigma));
      case 'HMA': return A(ta.hma(x, period));
      case 'SMA': return A(ta.sma(x, period));
      case 'SWMA': return A(ta.swma(x));
      case 'VWMA':
      case 'WMA': return A(ta.vwma(x, period, volume));
      case 'ZLEMA': {
        const lag = Math.floor((period - 1) / 2);
        const z = values.map((v, i) => v + v - (i >= lag ? values[i - lag] : NaN));
        return A(ta.ema(Series.fromArray(bars, z), period));
      }
      default: return A(ta.ema(x, period));
    }
  };

  const ha = heikinAshi(bars);
  const maOpen = f(ha.map((c) => c.open));
  const maClose = f(ha.map((c) => c.close));
  const maHigh = f(ha.map((c) => c.high));
  const maLow = f(ha.map((c) => c.low));

  const neutral = cfg.showHighLowLines ? cfg.colorNeutral : 'transparent';
  const cloudNeutral = cfg.showFill ? String(color.new(cfg.colorNeutral, 87.5)) : 'transparent';

  type Point = { time: number; value: number; color?: string };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const plot4: Point[] = [];
  const plot5: Point[] = [];
  const cloud: string[] = [];
  const upper: string[] = [];
  const lower: string[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    // A plain division: x / 0 is +-infinity (0 / 0 na), and the comparison uses the infinite value
    const trend = (100 * (maClose[i] - maOpen[i])) / (maHigh[i] - maLow[i]);
    const colorTrend = gt(trend, 0) ? cfg.colorPositive : cfg.colorNegative;
    plot0.push({ time, value: maOpen[i], color: 'transparent' });
    plot1.push({ time, value: maClose[i], color: cfg.showCloseLine ? colorTrend : 'transparent' });
    plot2.push({ time, value: maHigh[i], color: neutral });
    plot3.push({ time, value: maLow[i], color: neutral });
    plot4.push({ time, value: Math.max(maOpen[i], maClose[i]), color: 'transparent' });
    plot5.push({ time, value: Math.min(maOpen[i], maClose[i]), color: 'transparent' });
    cloud.push(String(color.new(colorTrend, 50)));
    upper.push(cloudNeutral);
    lower.push(cloudNeutral);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5 },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Open/Close Cloud' }, colors: cloud },
      { plot1: 'plot2', plot2: 'plot4', options: { title: 'High Cloud' }, colors: upper },
      { plot1: 'plot5', plot2: 'plot3', options: { title: 'Low Cloud' }, colors: lower },
    ],
  };
}

export const TrendIndicatorAV2 = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
