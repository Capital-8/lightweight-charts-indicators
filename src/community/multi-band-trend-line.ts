/**
 * Multi-Band Trend Line
 *
 * Bands of one type: Bollinger Bands, Keltner Channels, Donchian Channels (highest high / lowest low of the previous
 * `period` bars), moving average envelopes (SMA +/- percent) or ATR bands (SMA +/- ATR(period) * multiplier).
 * A close above the upper band raises the trend line to max(low - ATR, previous line), a close below the lower
 * band lowers it to min(high + ATR, previous line) (without the ATR filter: low / high); otherwise the line stays.
 * The previous line is 0 while it is na, as in the Pine nz(). The trend is up when the line rises and down when it
 * falls; the line is green in an up trend, red otherwise. BUY / SELL labels on trend changes and a light green /
 * red background by trend.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' / 'Sell Alert', true on the bars of the BUY / SELL
 * labels.
 *
 * Reference: "Multi-Band Trend Line" by Mr_Rakun
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Mr_Rakun
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MultiBandTrendLineInputs {
  bandType: 'Bollinger Bands' | 'Keltner Channels' | 'Donchian Channels' | 'Moving Average Envelopes' | 'ATR Bands';
  /** Band period */
  period: number;
  /** Band source */
  source: SourceType;
  /** Move the trend line by the ATR beyond the low / high */
  useAtrFilter: boolean;
  /** ATR period of the filter */
  atrPeriod: number;
  /** Bollinger Bands standard deviation multiplier */
  bbStd: number;
  /** Keltner Channels ATR multiplier */
  kcMultiplier: number;
  /** Moving average envelope percent */
  maPercentage: number;
  /** ATR bands multiplier */
  atrMultiplier: number;
}

export const defaultInputs: MultiBandTrendLineInputs = {
  bandType: 'Bollinger Bands',
  period: 20,
  source: 'close',
  useAtrFilter: true,
  atrPeriod: 14,
  bbStd: 2.0,
  kcMultiplier: 2.0,
  maPercentage: 2.0,
  atrMultiplier: 2.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'bandType', type: 'string', title: 'Band Type', defval: 'Bollinger Bands', options: ['Bollinger Bands', 'Keltner Channels', 'Donchian Channels', 'Moving Average Envelopes', 'ATR Bands'] },
  { id: 'period', type: 'int', title: 'Period', defval: 20, min: 1 },
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'useAtrFilter', type: 'bool', title: 'Use ATR Filter', defval: true },
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 14, min: 1 },
  { id: 'bbStd', type: 'float', title: 'BB Standard Deviation', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'kcMultiplier', type: 'float', title: 'KC ATR Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'maPercentage', type: 'float', title: 'MA Envelope %', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'atrMultiplier', type: 'float', title: 'ATR Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
];

const BAND_COL = String(color.new(color.gray, 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Band', color: BAND_COL, lineWidth: 1 },
  { id: 'plot1', title: 'Lower Band', color: BAND_COL, lineWidth: 1 },
  { id: 'plot2', title: 'Trend Line', color: color.green, lineWidth: 2 },
];

export const metadata = {
  title: 'Multi-Band Trend Line',
  shortTitle: 'Multi-Band Trend Line',
  overlay: true,
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;
/** Pine nz(x) */
const nz = (x: number) => (isNaN(x) ? 0 : x);
/** Pine math.max / math.min: na when an argument is na */
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));

export function calculate(
  bars: Bar[],
  inputs: Partial<MultiBandTrendLineInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = getSourceSeries(bars, cfg.source);
  const atrValue = A(ta.atr(bars, cfg.atrPeriod));

  let upper: number[];
  let lower: number[];
  switch (cfg.bandType) {
    case 'Keltner Channels': {
      const [, kcUpper, kcLower] = ta.kc(bars, src, cfg.period, cfg.kcMultiplier);
      upper = A(kcUpper);
      lower = A(kcLower);
      break;
    }
    case 'Donchian Channels': {
      // [dc_upper[1], dc_lower[1]]
      const hi = A(ta.highest(S(bars.map((b) => b.high)), cfg.period));
      const lo = A(ta.lowest(S(bars.map((b) => b.low)), cfg.period));
      upper = hi.map((_v, i) => (i > 0 ? hi[i - 1] : NaN));
      lower = lo.map((_v, i) => (i > 0 ? lo[i - 1] : NaN));
      break;
    }
    case 'Moving Average Envelopes': {
      const ma = A(ta.sma(src, cfg.period));
      upper = ma.map((m) => m + (m * cfg.maPercentage) / 100);
      lower = ma.map((m) => m - (m * cfg.maPercentage) / 100);
      break;
    }
    case 'ATR Bands': {
      const ma = A(ta.sma(src, cfg.period));
      const atr = A(ta.atr(bars, cfg.period));
      upper = ma.map((m, i) => m + atr[i] * cfg.atrMultiplier);
      lower = ma.map((m, i) => m - atr[i] * cfg.atrMultiplier);
      break;
    }
    default: {
      const [, bbUpper, bbLower] = ta.bb(src, cfg.period, cfg.bbStd);
      upper = A(bbUpper);
      lower = A(bbLower);
    }
  }

  const trendLine: number[] = new Array(n);
  const trendArr: number[] = new Array(n);
  let tl = NaN; // var float trendLine = na
  let trend = 0; // var int trend = 0
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const prev = nz(tl); // nz(trendLine[1])
    // Signal = close > upper ? 1 : close < lower ? -1 : 0
    const signal = gt(b.close, upper[i]) ? 1 : gt(lower[i], b.close) ? -1 : 0;
    if (signal === 1) tl = max(cfg.useAtrFilter ? b.low - atrValue[i] : b.low, prev);
    else if (signal === -1) tl = min(cfg.useAtrFilter ? b.high + atrValue[i] : b.high, prev);
    else tl = prev;
    if (gt(tl, prev)) trend = 1;
    else if (gt(prev, tl)) trend = -1;
    trendLine[i] = tl;
    trendArr[i] = trend;
  }

  const t = (i: number) => bars[i].time;
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const buyCol = String(color.new(color.green, 60));
  const sellCol = String(color.new(color.red, 60));
  const bgUp = String(color.new(color.green, 95));
  const bgDn = String(color.new(color.red, 95));
  const buyFlags = new Array<boolean>(n).fill(false);
  const sellFlags = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    buyFlags[i] = i > 0 && trendArr[i - 1] < 0 && trendArr[i] > 0;
    sellFlags[i] = i > 0 && trendArr[i - 1] > 0 && trendArr[i] < 0;
    // buy_condition = trend[1] < 0 and trend > 0; sell_condition = trend[1] > 0 and trend < 0
    if (i > 0 && trendArr[i - 1] < 0 && trendArr[i] > 0) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'labelUp', color: buyCol, text: 'BUY', textColor: color.teal, size: 'small' });
    }
    if (i > 0 && trendArr[i - 1] > 0 && trendArr[i] < 0) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'labelDown', color: sellCol, text: 'SELL', textColor: color.red, size: 'small' });
    }
    // bgcolor(trend > 0 ? color.new(color.green, 95) : trend < 0 ? color.new(color.red, 95) : na)
    if (trendArr[i] !== 0) bgColors.push({ time: t(i), color: trendArr[i] > 0 ? bgUp : bgDn });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: upper[i], color: BAND_COL })),
      plot1: bars.map((b, i) => ({ time: b.time, value: lower[i], color: BAND_COL })),
      // plot(trendLine, 'Trend Line', color = trend > 0 ? color.green : color.red, linewidth = 2)
      plot2: bars.map((b, i) => ({ time: b.time, value: trendLine[i], color: trendArr[i] > 0 ? color.green : color.red })),
    },
    markers,
    bgColors,
    // alertcondition(buy_condition, "Buy Alert") / alertcondition(sell_condition, "Sell Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'Buy Signal Generated' },
  { id: 'alert1', title: 'Sell Alert', message: 'Sell Signal Generated' },
];

export const MultiBandTrendLine = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
