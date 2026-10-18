/**
 * PMax on RSI with Tillson T3
 *
 * The Profit Maximizer (PMax) trailing stop applied to an RSI instead of the price.
 * - RSI: Wilder averages (alpha = 1 / length, started at 0) of the up and down moves of the close.
 * - A "high" and a "low" RSI of the bar: the simple averages of the up / down moves of the last `length` bars, in
 *   which one bar is replaced by the move from the previous close to the high (to the low). The true range of the RSI
 *   is the largest of high RSI - low RSI and their distances to the previous RSI; its simple average is the ATR.
 * - Moving average: the Tillson T3 of the RSI (six chained EMAs combined with the volume factor).
 * - PMax: a stop at T3 - multiplier * ATR that only rises while T3 is above it (and the mirror stop above); the
 *   direction flips when T3 crosses the active stop.
 * Buy / Sell labels mark the crosses of T3 and PMax, and the area between the RSI and PMax is green when T3 is above
 * PMax, red when it is below.
 *
 * Alerts (alertcondition, `alerts` of the result): crosses of T3 and PMax (either way, over, under) and crosses of
 * the "Source" input (a price, compared with PMax as in the original) and PMax.
 *
 * Reference: "PMax on Rsi w T3" by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © KivancOzbilgic
 */

import {
  ta, Series, color, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PmaxOnRsiWithTillsonT3Inputs {
  /** Source of the price cross alert conditions */
  src: SourceType;
  multiplier: number;
  /** Tillson T3 length */
  length: number;
  /** Tillson T3 volume factor */
  t3a1: number;
  /** ATR length */
  periods: number;
  rsiLength: number;
  showRsi: boolean;
  showSupport: boolean;
  showSignals: boolean;
  highlighting: boolean;
}

export const defaultInputs: PmaxOnRsiWithTillsonT3Inputs = {
  src: 'hl2',
  multiplier: 3,
  length: 8,
  t3a1: 0.7,
  periods: 10,
  rsiLength: 14,
  showRsi: true,
  showSupport: true,
  showSignals: true,
  highlighting: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'hl2' },
  { id: 'multiplier', type: 'float', title: 'ATR Multiplier', defval: 3, step: 0.1 },
  { id: 'length', type: 'int', title: 'Tillson T3 Length', defval: 8, min: 1 },
  { id: 't3a1', type: 'float', title: 'TILLSON T3 Volume Factor', defval: 0.7, step: 0.1 },
  { id: 'periods', type: 'int', title: 'ATR Length', defval: 10 },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'showRsi', type: 'bool', title: 'Show RSI?', defval: true },
  { id: 'showSupport', type: 'bool', title: 'Show Moving Average?', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Crossing Signals?', defval: true },
  { id: 'highlighting', type: 'bool', title: 'Highlighter On/Off ?', defval: true },
];

// Colour constants of Pine version 4
const BLACK = '#363A45';
const RED = '#FF5252';
const GREEN = '#4CAF50';
const WHITE = '#FFFFFF';
/** fill() without a transparency: 90 in this Pine version */
const GREEN_FILL = String(color.new(GREEN, 90));
const RED_FILL = String(color.new(RED, 90));
const BAND_FILL = String(color.new('#9915FF', 90));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: '#8E1599', lineWidth: 1 },
  { id: 'plot1', title: 'T3', color: BLACK, lineWidth: 2 },
  { id: 'plot2', title: 'PMax', color: RED, lineWidth: 2 },
  // plot(rsi, title = "", style = plot.style_circles, linewidth = 0, display = display.none): the edge of the fills
  { id: 'plot3', title: 'RSI (fill edge)', color: 'transparent', lineWidth: 1, style: 'circles', display: 'none' },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 70, title: 'Upper Band', color: '#C0C0C0', linestyle: 'dashed' },
  { id: 'hline_lower', price: 30, title: 'Lower Band', color: '#C0C0C0', linestyle: 'dashed' },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill_bands', plot1: 'hline_upper', plot2: 'hline_lower', color: BAND_FILL, title: 'Background' },
  { id: 'fill_up', plot1: 'plot3', plot2: 'plot2', color: GREEN_FILL, title: 'UpTrend Highligter' },
  { id: 'fill_down', plot1: 'plot3', plot2: 'plot2', color: RED_FILL, title: 'DownTrend Highligter' },
];

export const metadata = {
  title: 'PMax on Rsi w T3',
  shortTitle: 'PmR3',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10; a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
/** Pine max(...): na when a value is na */
const max3 = (a: number, b: number, c: number) => (isNaN(a) || isNaN(b) || isNaN(c) ? NaN : Math.max(a, b, c));

export function calculate(
  bars: Bar[],
  inputs: Partial<PmaxOnRsiWithTillsonT3Inputs> = {},
): IndicatorResult & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { multiplier, length, t3a1, periods, rsiLength } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (values: number[]) => Series.fromArray(bars, values);

  // i = close >= close[1] ? close - close[1] : 0, i2 = close < close[1] ? close[1] - close : 0
  const up: number[] = [];
  const down: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const c1 = i > 0 ? bars[i - 1].close : NaN;
    up.push(ge(c, c1) ? c - c1 : 0);
    down.push(lt(c, c1) ? c1 - c : 0);
  }
  const avgUp = A(ta.sma(S(up), rsiLength));
  const avgDown = A(ta.sma(S(down), rsiLength));

  // rsi = rs == -1 ? 0 : 100 - 100 / (1 + rs): plain divisions (x / 0 is infinite, 0 / 0 is na)
  const rsiOf = (rs: number) => (eq(rs, -1) ? 0 : 100 - 100 / (1 + rs));
  const wwalpha = 1 / rsiLength;
  const rsi: number[] = [];
  const tr: number[] = [];
  let avUp = 0; // Wwma_Func: WWMA := wwalpha * src + (1 - wwalpha) * nz(WWMA[1])
  let avDown = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const c1 = i > 0 ? bars[i - 1].close : NaN;
    avUp = wwalpha * up[i] + (1 - wwalpha) * avUp;
    avDown = wwalpha * down[i] + (1 - wwalpha) * avDown;
    rsi.push(rsiOf(avUp / avDown));

    const k1 = gt(b.high, c1) ? b.high - c1 : 0;
    const k2 = lt(b.high, c1) ? c1 - b.high : 0;
    const k3 = gt(b.low, c1) ? b.low - c1 : 0;
    const k4 = lt(b.low, c1) ? c1 - b.low : 0;
    const avgUpH = (avgUp[i] * (rsiLength - 1) + k1) / rsiLength;
    const avgDownH = (avgDown[i] * (rsiLength - 1) + k2) / rsiLength;
    const avgUpL = (avgUp[i] * (rsiLength - 1) + k3) / rsiLength;
    const avgDownL = (avgDown[i] * (rsiLength - 1) + k4) / rsiLength;
    const rsih = rsiOf(avgUpH / avgDownH);
    const rsil = rsiOf(avgUpL / avgDownL);
    const rsi1 = i > 0 ? rsi[i - 1] : NaN;
    tr.push(max3(rsih - rsil, Math.abs(rsih - rsi1), Math.abs(rsil - rsi1)));
  }
  const atr = A(ta.sma(S(tr), periods));

  // Tillson T3 of the RSI
  const e1 = ta.ema(S(rsi), length);
  const e2 = ta.ema(e1, length);
  const e3 = ta.ema(e2, length);
  const e4 = ta.ema(e3, length);
  const e5 = ta.ema(e4, length);
  const e6 = ta.ema(e5, length);
  const [a3, a4, a5, a6] = [A(e3), A(e4), A(e5), A(e6)];
  const c1 = -t3a1 * t3a1 * t3a1;
  const c2 = 3 * t3a1 * t3a1 + 3 * t3a1 * t3a1 * t3a1;
  const c3 = -6 * t3a1 * t3a1 - 3 * t3a1 - 3 * t3a1 * t3a1 * t3a1;
  const c4 = 1 + 3 * t3a1 + t3a1 * t3a1 * t3a1 + 3 * t3a1 * t3a1;
  const mavg = a6.map((v, i) => c1 * v + c2 * a5[i] + c3 * a4[i] + c4 * a3[i]);

  // Pmax_Func
  const pmax: number[] = [];
  let longStopBefore = NaN;
  let shortStopBefore = NaN;
  let dirBefore = NaN;
  for (let i = 0; i < n; i++) {
    const m = mavg[i];
    let longStop = m - multiplier * atr[i];
    // nz(longStop[1], longStop)
    const longStopPrev = Number.isFinite(longStopBefore) ? longStopBefore : longStop;
    longStop = gt(m, longStopPrev) ? Math.max(longStop, longStopPrev) : longStop;
    let shortStop = m + multiplier * atr[i];
    const shortStopPrev = Number.isFinite(shortStopBefore) ? shortStopBefore : shortStop;
    shortStop = lt(m, shortStopPrev) ? Math.min(shortStop, shortStopPrev) : shortStop;
    let dir = isNaN(dirBefore) ? 1 : dirBefore;
    dir = dir === -1 && gt(m, shortStopPrev) ? 1 : dir === 1 && lt(m, longStopPrev) ? -1 : dir;
    pmax.push(dir === 1 ? longStop : shortStop);
    longStopBefore = longStop;
    shortStopBefore = shortStop;
    dirBefore = dir;
  }

  const mavgS = S(mavg);
  const pmaxS = S(pmax);
  const buy = ta.crossover(mavgS, pmaxS).toArray();
  const sell = ta.crossunder(mavgS, pmaxS).toArray();
  // crossover(src, PMax) / crossunder(src, PMax)
  const srcS = getSourceSeries(bars, cfg.src);
  const srcOver = ta.crossover(srcS, pmaxS).toArray();
  const srcUnder = ta.crossunder(srcS, pmaxS).toArray();

  type Point = { time: number; value: number };
  const plot0: Point[] = [];
  const plot1: Point[] = [];
  const plot2: Point[] = [];
  const plot3: Point[] = [];
  const upFill: string[] = [];
  const downFill: string[] = [];
  const markers: MarkerData[] = [];
  const plotValue = (v: number) => (Number.isFinite(v) ? v : NaN);
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    plot0.push({ time, value: cfg.showRsi ? plotValue(rsi[i]) : NaN });
    plot1.push({ time, value: cfg.showSupport ? plotValue(mavg[i]) : NaN });
    plot2.push({ time, value: plotValue(pmax[i]) });
    plot3.push({ time, value: plotValue(rsi[i]) });
    upFill.push(cfg.highlighting && gt(mavg[i], pmax[i]) ? GREEN_FILL : 'transparent');
    downFill.push(cfg.highlighting && lt(mavg[i], pmax[i]) ? RED_FILL : 'transparent');
    if (cfg.showSignals && buy[i] && Number.isFinite(pmax[i])) {
      markers.push({
        time, position: 'atPriceBottom', price: pmax[i] * 0.995, shape: 'labelUp', color: GREEN, text: 'Buy', textColor: WHITE, size: 'tiny',
      });
    }
    if (cfg.showSignals && sell[i] && Number.isFinite(pmax[i])) {
      markers.push({
        time, position: 'atPriceTop', price: pmax[i] * 1.005, shape: 'labelDown', color: RED, text: 'Sell', textColor: WHITE, size: 'tiny',
      });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    hlines: [
      { value: 70, options: { title: 'Upper Band', color: '#C0C0C0', linestyle: 'dashed' } },
      { value: 30, options: { title: 'Lower Band', color: '#C0C0C0', linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_upper', plot2: 'hline_lower', options: { title: 'Background', color: BAND_FILL } },
      { plot1: 'plot3', plot2: 'plot2', options: { title: 'UpTrend Highligter' }, colors: upFill },
      { plot1: 'plot3', plot2: 'plot2', options: { title: 'DownTrend Highligter' }, colors: downFill },
    ],
    markers,
    // alertcondition(cross(MAvg, PMax)) / crossover / crossunder; cross(src, PMax) / crossover / crossunder
    alerts: alertStates(alertConditions, bars, [
      buy.map((v, i) => !!v || !!sell[i]), buy.map(Boolean), sell.map(Boolean),
      srcOver.map((v, i) => !!v || !!srcUnder[i]), srcOver.map(Boolean), srcUnder.map(Boolean),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Cross Alert', message: 'PMax - Moving Avg Crossing!' },
  { id: 'alert1', title: 'Crossover Alarm', message: 'Moving Avg BUY SIGNAL!' },
  { id: 'alert2', title: 'Crossunder Alarm', message: 'Moving Avg SELL SIGNAL!' },
  { id: 'alert3', title: 'Price Cross Alert', message: 'PMax - Price Crossing!' },
  { id: 'alert4', title: 'Price Crossover Alarm', message: 'PRICE OVER PMax - BUY SIGNAL!' },
  { id: 'alert5', title: 'Price Crossunder Alarm', message: 'PRICE UNDER PMax - SELL SIGNAL!' },
];

export const PmaxOnRsiWithTillsonT3 = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig, fillConfig, alertConditions };
