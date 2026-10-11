/**
 * VWAP Predictive Breakout + RSI + OB + Trend/Chop
 *
 * The VWAP line with breakout signals. A long signal when the close crosses above the VWAP (close > VWAP, close[1] <
 * VWAP) after three closes above it, on a volume spike (volume > SMA(volume, 20) * multiplier), with a strong body
 * (body / (range + 0.001) > min), a rising RSI below the upper limit, a low near the last bullish engulfing low
 * (low < engulfing low + ATR(5)) and a clean candle (body > ATR * min and wicks / (body + 0.001) < ratio). The short
 * signal mirrors it. As in the source, the cross needs close[1] < VWAP and the three-close confirmation needs
 * close[1] > VWAP, so the long / short signals never fire. Circles mark the bullish / bearish engulfing bars. The background is green when trending
 * (ADX > threshold, |EMA fast - EMA slow| > 0.15 * ATR and a clean candle), red otherwise (choppy).
 *
 * Timeframes: Pine `ta.vwap` resets on each new trading day (anchor timeframe.change("1D")). When each bar is one
 * trading day or more, it resets on every bar, so the VWAP is hlc3 of the bar (na when the volume is 0 or na). On
 * intraday bars (barInterval, the most frequent gap between bars, below one day) the reset needs the exchange time
 * zone and the session of the symbol: the port reads them from the optional third argument (see
 * src/chart-context.ts) and sums from the first bar of each trading day (from the first bar on the first day).
 * Without them calculate() throws an Error on intraday bars.
 *
 * Reference: "VWAP Predictive Breakout + RSI + OB + Trend/Chop" by Viggy02
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © vignesh_coumarane1994
 */

import { ta, Series, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { barInterval } from '../bar-time';
import type { ChartContext } from '../chart-context';
import { executeScript, timeframe as scriptTimeframe } from 'oakscriptjs/script';

export interface VwapPredictiveBreakoutRsiObTrendChopInputs {
  /** Volume spike multiplier */
  volMultiplier: number;
  /** Min body size (as part of the range) */
  bodyStrength: number;
  /** RSI period */
  rsiPeriod: number;
  /** Max RSI for long */
  rsiUpper: number;
  /** Min RSI for short */
  rsiLower: number;
  /** ADX length */
  adxLen: number;
  /** ADX trend threshold */
  adxThreshold: number;
  /** ATR length */
  atrLen: number;
  /** Fast EMA length */
  emaFast: number;
  /** Slow EMA length */
  emaSlow: number;
  /** Bollinger band length */
  bbLen: number;
  /** Bollinger band multiplier */
  bbMult: number;
  /** Min body size (as part of the ATR) */
  candleBodyMin: number;
  /** Wick-to-body ratio threshold */
  wickRatioThreshold: number;
}

export const defaultInputs: VwapPredictiveBreakoutRsiObTrendChopInputs = {
  volMultiplier: 1.5,
  bodyStrength: 0.6,
  rsiPeriod: 14,
  rsiUpper: 65,
  rsiLower: 35,
  adxLen: 7,
  adxThreshold: 18,
  atrLen: 7,
  emaFast: 9,
  emaSlow: 21,
  bbLen: 12,
  bbMult: 1.5,
  candleBodyMin: 0.4,
  wickRatioThreshold: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'volMultiplier', type: 'float', title: 'Volume Spike Multiplier', defval: 1.5 },
  { id: 'bodyStrength', type: 'float', title: 'Min Body Size (as % of Range)', defval: 0.6 },
  { id: 'rsiPeriod', type: 'int', title: 'RSI Period', defval: 14 },
  { id: 'rsiUpper', type: 'int', title: 'Max RSI for Long', defval: 65 },
  { id: 'rsiLower', type: 'int', title: 'Min RSI for Short', defval: 35 },
  { id: 'adxLen', type: 'int', title: 'ADX Length', defval: 7 },
  { id: 'adxThreshold', type: 'int', title: 'ADX Trend Threshold', defval: 18 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 7 },
  { id: 'emaFast', type: 'int', title: 'Fast EMA', defval: 9 },
  { id: 'emaSlow', type: 'int', title: 'Slow EMA', defval: 21 },
  { id: 'bbLen', type: 'int', title: 'Bollinger Band Length', defval: 12 },
  { id: 'bbMult', type: 'float', title: 'BB Multiplier', defval: 1.5 },
  { id: 'candleBodyMin', type: 'float', title: 'Min Body Size (as % of ATR)', defval: 0.4 },
  { id: 'wickRatioThreshold', type: 'float', title: 'Wick-to-Body Ratio Threshold', defval: 1.5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VWAP', color: color.gray, lineWidth: 2 },
];

export const metadata = {
  title: 'VWAP Predictive Breakout + RSI + OB + Trend/Chop',
  shortTitle: 'VWAP Predictive Breakout + RSI + OB + Trend/Chop',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const DAY_SECONDS = 86400;

/**
 * First bar of each trading day of the exchange on intraday bars (Pine timeframe.change("1D")), found by the library
 * from the time zone and the session of the chart context. Null when the context does not give both, or when the bars
 * are not intraday.
 */
function tradingDayStarts(bars: Bar[], chart?: ChartContext): boolean[] | null {
  const interval = barInterval(bars);
  if (chart?.timezone === undefined || chart.session === undefined || !(interval > 0 && interval < 86400)) return null;
  let change: Array<number | null> = [];
  const context = { ...chart, timeframe: chart.timeframe ?? timeframe.from_seconds(interval) };
  executeScript(() => { change = scriptTimeframe.change('1D').toArray(); }, bars, {}, context);
  return change.map((v) => v === 1);
}

/**
 * ta.vwap (hlc3) on intraday bars: sum(hlc3 * volume) / sum(volume) since the first bar of the trading day (since the
 * first bar on the first day)
 */
function intradayVwap(bars: Bar[], dayStarts: boolean[]): number[] {
  const hlc3 = Series.fromArray(bars, bars.map((b) => (b.high + b.low + b.close) / 3));
  const volume = Series.fromArray(bars, bars.map((b) => b.volume ?? NaN));
  const anchor = Series.fromArray(bars, dayStarts.map((v, i) => Number(i === 0 || v)));
  return ta.vwap(hlc3, volume, anchor).toArray().map((v) => v ?? NaN);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<VwapPredictiveBreakoutRsiObTrendChopInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const interval = barInterval(bars);
  const dayStarts = tradingDayStarts(bars, chart);
  if (interval > 0 && interval < DAY_SECONDS && dayStarts === null) {
    throw new Error(
      'VWAP Predictive Breakout + RSI + OB + Trend/Chop supports daily and higher timeframes only: on intraday bars '
      + 'ta.vwap resets on each trading day, which needs the exchange time zone and session.',
    );
  }

  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const vol = bars.map((b) => b.volume ?? NaN);
  const closeArr = bars.map((b) => b.close);
  const close = S(closeArr);

  // ta.vwap (hlc3, anchor timeframe.change("1D")). Intraday bars: the sums restart on each trading day of the
  // exchange. Daily or higher bars: a new anchor on every bar, so sum(hlc3 * volume) / sum(volume) over the bar
  // alone (0 / 0 = na when the volume is 0, na when it is na)
  const vwap = dayStarts ? intradayVwap(bars, dayStarts)
    : bars.map((b, i) => (((b.high + b.low + b.close) / 3) * vol[i]) / vol[i]);
  const volumeAvg = A(ta.sma(S(vol), 20));
  const rsi = A(ta.rsi(close, cfg.rsiPeriod));

  // Trend / chop: hand-written ADX
  const plusDM = bars.map((b, i) => {
    if (i === 0) return 0;
    const upMove = b.high - bars[i - 1].high;
    const downMove = bars[i - 1].low - b.low;
    return gt(upMove, downMove) && gt(upMove, 0) ? upMove : 0;
  });
  const minusDM = bars.map((b, i) => {
    if (i === 0) return 0;
    const upMove = b.high - bars[i - 1].high;
    const downMove = bars[i - 1].low - b.low;
    return gt(downMove, upMove) && gt(downMove, 0) ? downMove : 0;
  });
  const trur = A(ta.rma(ta.tr(bars), cfg.adxLen));
  const rmaPlus = A(ta.rma(S(plusDM), cfg.adxLen));
  const rmaMinus = A(ta.rma(S(minusDM), cfg.adxLen));
  // Plain divisions: x / 0 is +-infinity, 0 / 0 na (ta.rma skips both)
  const plusDI = rmaPlus.map((v, i) => (100 * v) / trur[i]);
  const minusDI = rmaMinus.map((v, i) => (100 * v) / trur[i]);
  const dx = plusDI.map((p, i) => (100 * Math.abs(p - minusDI[i])) / (p + minusDI[i]));
  const adx = A(ta.rma(S(dx), cfg.adxLen));

  const atrOB = A(ta.atr(bars, 5));
  const atr = A(ta.atr(bars, cfg.atrLen));
  const ema1 = A(ta.ema(close, cfg.emaFast));
  const ema2 = A(ta.ema(close, cfg.emaSlow));
  // basis / dev / bbWidth feed breakoutUp / breakoutDown, which the script does not plot: not computed

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const bgTrend = String(color.new(color.green, 85));
  const bgChop = String(color.new(color.red, 85));

  let obBullLow = NaN; // var float obBullLow = na
  let obBearHigh = NaN; // var float obBearHigh = na
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const c = b.close;
    const c1 = i > 0 ? closeArr[i - 1] : NaN;
    const c2 = i > 1 ? closeArr[i - 2] : NaN;
    const o1 = i > 0 ? bars[i - 1].open : NaN;
    const v = vwap[i];

    const volSpike = gt(vol[i], volumeAvg[i] * cfg.volMultiplier);
    const candleRange = b.high - b.low;
    const candleBody = Math.abs(c - b.open);
    const strongBody = gt(candleBody / (candleRange + 0.001), cfg.bodyStrength);

    const rsiPrev = i > 0 ? rsi[i - 1] : NaN;
    const rsiBull = lt(rsi[i], cfg.rsiUpper) && gt(rsi[i], rsiPrev);
    const rsiBear = gt(rsi[i], cfg.rsiLower) && lt(rsi[i], rsiPrev);

    const crossUp = gt(c, v) && lt(c1, v);
    const crossDown = lt(c, v) && gt(c1, v);
    const aboveConfirm = gt(c, v) && gt(c1, v) && gt(c2, v);
    const belowConfirm = lt(c, v) && lt(c1, v) && lt(c2, v);

    // Order block (engulfing)
    const bullEngulf = gt(c, b.open) && lt(b.open, c1) && gt(c, o1);
    const bearEngulf = lt(c, b.open) && gt(b.open, c1) && lt(c, o1);
    if (bullEngulf) obBullLow = b.low;
    if (bearEngulf) obBearHigh = b.high;
    const nearBullOB = !isNaN(obBullLow) && lt(b.low, obBullLow + atrOB[i]);
    const nearBearOB = !isNaN(obBearHigh) && gt(b.high, obBearHigh - atrOB[i]);

    // Candle behaviour
    const bodySize = Math.abs(c - b.open);
    const upperWick = b.high - Math.max(c, b.open);
    const lowerWick = Math.min(c, b.open) - b.low;
    const wickToBodyRatio = (upperWick + lowerWick) / (bodySize + 0.001);
    const strongCandle = gt(bodySize, atr[i] * cfg.candleBodyMin);
    const lowWickRatio = lt(wickToBodyRatio, cfg.wickRatioThreshold);
    const cleanCandle = strongCandle && lowWickRatio;

    const emaDistance = Math.abs(ema1[i] - ema2[i]);
    const isTrending = gt(adx[i], cfg.adxThreshold) && gt(emaDistance, atr[i] * 0.15) && cleanCandle;

    const predictUp = crossUp && volSpike && strongBody && aboveConfirm && rsiBull && nearBullOB && cleanCandle;
    const predictDown = crossDown && volSpike && strongBody && belowConfirm && rsiBear && nearBearOB && cleanCandle;

    if (predictUp) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.lime, text: '↑BUY',
        textColor: '#2962FF', size: 'small' });
    }
    if (predictDown) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, text: '↓SELL',
        textColor: '#2962FF', size: 'small' });
    }
    if (bullEngulf) markers.push({ time: b.time, position: 'belowBar', shape: 'circle', color: color.green, size: 'tiny' });
    if (bearEngulf) markers.push({ time: b.time, position: 'aboveBar', shape: 'circle', color: color.red, size: 'tiny' });

    // bgcolor(isTrending ? green 85 : na); bgcolor(isChoppy ? red 85 : na) with isChoppy = not isTrending
    bgColors.push({ time: b.time, color: isTrending ? bgTrend : bgChop });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: bars.map((b, i) => ({ time: b.time, value: Number.isFinite(vwap[i]) ? vwap[i] : NaN })) },
    markers,
    bgColors,
  };
}

export const VwapPredictiveBreakoutRsiObTrendChop = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
