/**
 * Q KAMA Clarity Trend
 *
 * The source is smoothed by a Gaussian-weighted window (weights exp(-0.5 * ((i - (len - 1) / 2) / sigma)^2)), then
 * a Kaufman adaptive moving average (KAMA) of it is taken: efficiency ratio over `lenKAMA` bars, fast 2 / slow 30
 * smoothing constants. The trend turns up when the close goes above KAMA + ATR * multiplier and down when it goes
 * below KAMA - ATR * multiplier (or, as an option, when the close crosses KAMA). The KAMA line and a shadow fill to
 * hl2 take the trend colour; a ⦿ mark on the line and an arrow show each trend change.
 * Alerts (alertcondition, `alerts` of the result): 'Uptrend Started' and 'Downtrend Started', true on the trend
 * changes to up / down.
 *
 * Reference: "Q KAMA Clarity Trend " by Quantora
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Quantora
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface QKamaClarityTrendInputs {
  upTrendColor: string;
  downTrendColor: string;
  /** Shadow fill between the KAMA line and hl2 */
  showShadow: boolean;
  /** Gaussian filter length */
  lenGaussian: number;
  /** Gaussian filter sigma */
  sigma: number;
  src: SourceType;
  /** KAMA length (efficiency ratio window) */
  lenKAMA: number;
  lenATR: number;
  multATR: number;
  /** Trend from the close crossing KAMA instead of the ATR channel */
  useSimpleTrend: boolean;
}

export const defaultInputs: QKamaClarityTrendInputs = {
  upTrendColor: '#17dfad',
  downTrendColor: '#dd326b',
  showShadow: true,
  lenGaussian: 4,
  sigma: 2.0,
  src: 'close',
  lenKAMA: 45,
  lenATR: 14,
  multATR: 1.5,
  useSimpleTrend: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'upTrendColor', type: 'color', title: 'Uptrend Color', defval: '#17dfad' },
  { id: 'downTrendColor', type: 'color', title: 'Downtrend Color', defval: '#dd326b' },
  { id: 'showShadow', type: 'bool', title: 'Shadow Fill', defval: true },
  { id: 'lenGaussian', type: 'int', title: 'Gaussian Length', defval: 4 },
  { id: 'sigma', type: 'float', title: 'Gaussian Sigma', defval: 2.0 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'lenKAMA', type: 'int', title: 'KAMA Length', defval: 45 },
  { id: 'lenATR', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'multATR', type: 'float', title: 'ATR Multiplier', defval: 1.5 },
  { id: 'useSimpleTrend', type: 'bool', title: 'Use Price Cross KAMA for Trend', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'KAMA Trend Line', color: '#17dfad', lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Hidden Price Plot', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Q KAMA Clarity Trend ',
  shortTitle: 'Q KAMA Clarity Trend ',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS) && !(b - a > EPS);
const nz = (v: number, r = 0) => (isNaN(v) ? r : v);

export function calculate(
  bars: Bar[],
  inputs: Partial<QKamaClarityTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);

  // gaussianFilter(src, len, sigma): (len - 1) / 2 is a float division in Pine v6
  const gl = cfg.lenGaussian;
  const weights: number[] = [];
  for (let k = 0; k <= gl - 1; k++) weights.push(Math.exp(-0.5 * Math.pow((k - (gl - 1) / 2) / cfg.sigma, 2)));
  const filt: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let totalWeight = 0;
    let weightedSum = 0;
    for (let k = 0; k <= gl - 1; k++) {
      totalWeight += weights[k];
      weightedSum += (i - k >= 0 ? src[i - k] : NaN) * weights[k];
    }
    filt[i] = weightedSum / totalWeight;
  }

  // KAMA
  const L = cfg.lenKAMA;
  const fastSC = 2 / (2 + 1);
  const slowSC = 2 / (30 + 1);
  const change: number[] = new Array(n);
  const kama: number[] = new Array(n);
  let vol = NaN;
  for (let i = 0; i < n; i++) {
    change[i] = i > 0 ? Math.abs(filt[i] - filt[i - 1]) : NaN;
    // volatility := nz(volatility[1]) + change - nz(change[lenKAMA])
    vol = nz(vol) + change[i] - nz(i - L >= 0 ? change[i - L] : NaN);
    const direction = i - L >= 0 ? Math.abs(filt[i] - filt[i - L]) : NaN;
    const er = direction / (eq(vol, 0) ? 1 : vol);
    const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
    // kama := nz(kama[1] + sc * (filteredSrc - kama[1])); kama[1] is na on the first bar
    const prev = i > 0 ? kama[i - 1] : NaN;
    kama[i] = nz(prev + sc * (filt[i] - prev));
  }

  // ATR channel and trend
  const atr = ta.atr(bars, cfg.lenATR).toArray().map((v) => (v ?? NaN) * cfg.multATR);
  const trend: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const prev = i > 0 ? trend[i - 1] : 0;
    const upper = kama[i] + atr[i];
    const lower = kama[i] - atr[i];
    trend[i] = cfg.useSimpleTrend
      ? gt(c, kama[i]) ? 1 : lt(c, kama[i]) ? -1 : prev
      : gt(c, upper) ? 1 : lt(c, lower) ? -1 : prev;
  }

  const trendColor = trend.map((t) => (t === 1 ? cfg.upTrendColor : t === -1 ? cfg.downTrendColor : color.gray));
  const markers: MarkerData[] = [];
  // alertcondition(trendChanged and trend == 1 / trend == -1)
  const upFlags: boolean[] = bars.map((_b, i) => i > 0 && trend[i] !== trend[i - 1] && trend[i] === 1);
  const downFlags: boolean[] = bars.map((_b, i) => i > 0 && trend[i] !== trend[i - 1] && trend[i] === -1);
  for (let i = 1; i < n; i++) {
    // trendChanged = ta.change(trend) != 0 (na on the first bar)
    if (trend[i] === trend[i - 1]) continue;
    const t = bars[i].time;
    const col = trend[i] === 1 ? cfg.upTrendColor : cfg.downTrendColor;
    // plotchar(trendChanged ? kama : na, "Trend Change Marker", "⦿", location.absolute, size.tiny, color = col)
    markers.push({ time: t, position: 'atPriceMiddle', price: kama[i], shape: 'circle', color: 'transparent', text: '⦿',
      textColor: col, size: 'tiny' });
    // plotshape(trendChanged and trend == 1, "Buy Arrow", location.belowbar, shape.triangleup, upTrendColor, size.small)
    if (trend[i] === 1) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: cfg.upTrendColor, size: 'small' });
    }
    // plotshape(trendChanged and trend == -1, "Sell Arrow", location.abovebar, shape.triangledown, downTrendColor, size.small)
    if (trend[i] === -1) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: cfg.downTrendColor, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(kama, "KAMA Trend Line", color = trendColor, linewidth = 2, style = plot.style_linebr)
      plot0: bars.map((b, i) => ({ time: b.time, value: kama[i], color: trendColor[i] })),
      // plot(hl2, "Hidden Price Plot", display = display.none)
      plot1: bars.map((b) => ({ time: b.time, value: (b.high + b.low) / 2 })),
    },
    // fill(plotKAMA, hiddenPricePlot, color.new(trendColor, showShadow ? 80 : 100))
    fills: [
      { plot1: 'plot0', plot2: 'plot1', colors: trendColor.map((c) => String(color.new(c, cfg.showShadow ? 80 : 100))) },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [upFlags, downFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Uptrend Started', message: 'Uptrend started on {{ticker}}' },
  { id: 'alert1', title: 'Downtrend Started', message: 'Downtrend started on {{ticker}}' },
];

export const QKamaClarityTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
