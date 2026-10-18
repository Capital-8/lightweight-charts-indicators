/**
 * The Ultimate Buy and Sell Indicator
 *
 * Multi-component buy/sell system combining RSI with Bollinger Bands,
 * Price Bollinger Bands, watch signals, and MA-based candle coloring.
 * RSI crosses BB bands to set "watch" flags; buy/sell when RSI crosses
 * basis while watch flag is active within a configurable lookback window (the watch signals are cleared by each
 * buy / sell). Draws the buy / sell triangles with their 3 target circles, the RSI watch squares, the signal warning
 * background, the MA-coloured candles (plotcandle) and the band fills.
 * Alerts (alertcondition, `alerts` of the result): 'Buy signal' and 'Sell signal', on the bars of the warning
 * background (the original's "Advance alerts one candle", on by default). The price / ATR watch signals and the
 * bought / sold background are off by default in the original and not ported.
 *
 * Reference: "Ultimate Buy and Sell Indicator"
 */

import { ta, taCore, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData, PlotCandleData, PineSize } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface UltimateBuySellInputs {
  rsiLength: number;
  rsiMaType: string;
  rsiBbMaType: string;
  rsiBbLength: number;
  rsiMultiplier: number;
  priceBbLength: number;
  priceMaType: string;
  priceInnerMult: number;
  priceOuterMult: number;
  watchLookback: number;
  fastMaType: string;
  fastMaLength: number;
  slowMaType: string;
  slowMaLength: number;
}

export const defaultInputs: UltimateBuySellInputs = {
  rsiLength: 32,
  rsiMaType: 'RMA',
  rsiBbMaType: 'SMA',
  rsiBbLength: 32,
  rsiMultiplier: 2.0,
  priceBbLength: 20,
  priceMaType: 'SMA',
  priceInnerMult: 2.1,
  priceOuterMult: 2.4,
  watchLookback: 35,
  fastMaType: 'WMA',
  fastMaLength: 10,
  slowMaType: 'WMA',
  slowMaLength: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 32, min: 1 },
  { id: 'rsiMaType', type: 'string', title: 'RSI Calculation MA', defval: 'RMA', options: ['SMA', 'EMA', 'WMA', 'RMA'] },
  { id: 'rsiBbMaType', type: 'string', title: 'RSI BB MA Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA', 'RMA'] },
  { id: 'rsiBbLength', type: 'int', title: 'RSI BB Length', defval: 32, min: 1 },
  { id: 'rsiMultiplier', type: 'float', title: 'RSI BB StdDev', defval: 2.0, min: 1, max: 3, step: 0.1 },
  { id: 'priceBbLength', type: 'int', title: 'Price BB Length', defval: 20, min: 2 },
  { id: 'priceMaType', type: 'string', title: 'Price BB MA Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA', 'RMA'] },
  { id: 'priceInnerMult', type: 'float', title: 'Price Inner BB Mult', defval: 2.1, min: 1, max: 4, step: 0.1 },
  { id: 'priceOuterMult', type: 'float', title: 'Price Outer BB Mult', defval: 2.4, min: 2, max: 6, step: 0.1 },
  { id: 'watchLookback', type: 'int', title: 'Watch Signal Lookback', defval: 35, min: 5, step: 5 },
  { id: 'fastMaType', type: 'string', title: 'Fast MA Type', defval: 'WMA', options: ['SMA', 'EMA', 'WMA', 'RMA'] },
  { id: 'fastMaLength', type: 'int', title: 'Fast MA Length', defval: 10, min: 1 },
  { id: 'slowMaType', type: 'string', title: 'Slow MA Type', defval: 'WMA', options: ['SMA', 'EMA', 'WMA', 'RMA'] },
  { id: 'slowMaLength', type: 'int', title: 'Slow MA Length', defval: 20, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'priceBasis', title: 'Price BB Basis', color: '#FF8C00', lineWidth: 1 },
  { id: 'upperInner', title: 'Upper Inner BB', color: 'transparent', lineWidth: 1 },
  { id: 'lowerInner', title: 'Lower Inner BB', color: 'transparent', lineWidth: 1 },
  { id: 'upperOuter', title: 'Upper Outer BB', color: 'transparent', lineWidth: 1 },
  { id: 'lowerOuter', title: 'Lower Outer BB', color: 'transparent', lineWidth: 1 },
  // ATR-adjusted band lines, hidden by default (the original's line transparency 100 when they are not shown)
  { id: 'upperAtr', title: 'Upper ATR Band', color: 'transparent', lineWidth: 1 },
  { id: 'middleAtr', title: 'Middle ATR Band', color: 'transparent', lineWidth: 1 },
  { id: 'lowerAtr', title: 'Lower ATR Band', color: 'transparent', lineWidth: 1 },
];

const ORANGE = '#FF9800';
const FUCHSIA = '#E040FB';
const GREEN = '#4CAF50';
const YELLOW = '#FFEB3B';
const RED = '#F23645';
const BAND_UP = 'rgba(76,175,80,0.3)';
const BAND_DOWN = 'rgba(242,54,69,0.3)';
const BUY_WATCH = 'rgba(255,152,0,0.8)';
const SELL_WATCH = 'rgba(224,64,251,0.8)';
/** Colours (orange / fuchsia at transparency 50, 65, 85) and sizes of the 3 signal circles */
const CIRCLES_BUY: [string, PineSize][] = [['rgba(255,152,0,0.5)', 'tiny'], ['rgba(255,152,0,0.35)', 'small'], ['rgba(255,152,0,0.15)', 'normal']];
const CIRCLES_SELL: [string, PineSize][] = [['rgba(224,64,251,0.5)', 'tiny'], ['rgba(224,64,251,0.35)', 'small'], ['rgba(224,64,251,0.15)', 'normal']];

export const metadata = {
  title: 'Ultimate Buy & Sell',
  shortTitle: 'UltimateBS',
  overlay: true,
};

function computeMA(bars: Bar[], src: number[], len: number, type: string): number[] {
  const srcSeries = new Series(bars, (_, i) => src[i]);
  switch (type) {
    case 'EMA': return ta.ema(srcSeries, len).toArray().map(v => v ?? NaN);
    case 'WMA': return ta.wma(srcSeries, len).toArray().map(v => v ?? NaN);
    case 'RMA': return ta.rma(srcSeries, len).toArray().map(v => v ?? NaN);
    default: return ta.sma(srcSeries, len).toArray().map(v => v ?? NaN);
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<UltimateBuySellInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const closeArr = bars.map(b => b.close);

  // 1. Compute RSI manually with configurable MA type
  const change: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    change[i] = closeArr[i] - closeArr[i - 1];
  }
  const gains = change.map(c => Math.max(c, 0));
  const losses = change.map(c => -Math.min(c, 0));

  const avgGain = computeMA(bars, gains, cfg.rsiLength, cfg.rsiMaType);
  const avgLoss = computeMA(bars, losses, cfg.rsiLength, cfg.rsiMaType);

  const rsi: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const up = avgGain[i];
    const down = avgLoss[i];
    if (isNaN(up) || isNaN(down)) continue;
    if (down === 0) rsi[i] = 100;
    else if (up === 0) rsi[i] = 0;
    else rsi[i] = 100 - 100 / (1 + up / down);
  }

  // 2. RSI Bollinger Bands
  const rsiBasis = computeMA(bars, rsi, cfg.rsiBbLength, cfg.rsiBbMaType);
  const rsiSeries = new Series(bars, (_, i) => rsi[i]);
  const rsiDevArr = ta.stdev(rsiSeries, cfg.rsiBbLength).toArray().map(v => v ?? 0);
  const rsiUpper: number[] = rsiBasis.map((b, i) => b + cfg.rsiMultiplier * rsiDevArr[i]);
  const rsiLower: number[] = rsiBasis.map((b, i) => b - cfg.rsiMultiplier * rsiDevArr[i]);

  // 3. Price Bollinger Bands
  const closeSeries = new Series(bars, b => b.close);
  const priceBasis = computeMA(bars, closeArr, cfg.priceBbLength, cfg.priceMaType);
  const priceDevArr = ta.stdev(closeSeries, cfg.priceBbLength).toArray().map(v => v ?? 0);
  const priceDevSrc = ta.stdev(closeSeries, 20).toArray().map(v => v ?? NaN);
  const upperInner: number[] = priceBasis.map((b, i) => b + cfg.priceInnerMult * priceDevArr[i]);
  const lowerInner: number[] = priceBasis.map((b, i) => b - cfg.priceInnerMult * priceDevArr[i]);
  const upperOuter: number[] = priceBasis.map((b, i) => b + cfg.priceOuterMult * priceDevArr[i]);
  const lowerOuter: number[] = priceBasis.map((b, i) => b - cfg.priceOuterMult * priceDevArr[i]);

  // 4. Watch signals and buy/sell logic
  const warmup = Math.max(cfg.rsiLength, cfg.rsiBbLength, cfg.priceBbLength) + 5;
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says it is still open
  const lastConfirmed = lastBarConfirmedOf(chart);
  const confirmedAt = (i: number) => i < n - 1 || lastConfirmed;

  // buyWatch2 / buyWatch3 (RSI crosses over its lower band / under 30) and sellWatch2 / sellWatch3 (RSI crosses under
  // its upper band / over 70), on confirmed bars
  const buyWatchArr: boolean[] = new Array(n).fill(false);
  const sellWatchArr: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    if (i < warmup || !confirmedAt(i)) continue;
    const rsiCrossOverLower = rsi[i - 1] <= rsiLower[i - 1] && rsi[i] > rsiLower[i];
    const rsiCrossUnderUpper = rsi[i - 1] >= rsiUpper[i - 1] && rsi[i] < rsiUpper[i];
    const rsiCrossUnder30 = rsi[i - 1] >= 30 && rsi[i] < 30;
    const rsiCrossOver70 = rsi[i - 1] <= 70 && rsi[i] > 70;
    buyWatchArr[i] = rsiCrossOverLower || rsiCrossUnder30;
    sellWatchArr[i] = rsiCrossUnderUpper || rsiCrossOver70;
  }

  // The watch arrays of the original: the last `watchLookback` bars, emptied on every buy / sell signal (cleared
  // after bar `clearedAt`); a watch signal in them is the watch quota
  let clearedAt = -1;
  const watchMet = (watchArr: boolean[], idx: number): boolean => {
    const start = Math.max(0, idx - cfg.watchLookback + 1, clearedAt + 1);
    for (let j = start; j <= idx; j++) if (watchArr[j]) return true;
    return false;
  };

  // plotBuyBG / plotSellBG: a signal event with the watch quota met (repaints on the open bar); plotBuy / plotSell:
  // the same on a confirmed bar (sets the bought / sold state and clears the watch arrays)
  const plotBuy: boolean[] = new Array(n).fill(false);
  const plotSell: boolean[] = new Array(n).fill(false);
  const plotBuyBG: boolean[] = new Array(n).fill(false);
  const plotSellBG: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    if (i < warmup) continue;
    // Buy events: RSI crosses over its basis or over 25; sell events: RSI crosses under its basis or under 75
    const rsiCrossOverBasis = rsi[i - 1] <= rsiBasis[i - 1] && rsi[i] > rsiBasis[i];
    const rsiCrossUnderBasis = rsi[i - 1] >= rsiBasis[i - 1] && rsi[i] < rsiBasis[i];
    const rsiCrossOver25 = rsi[i - 1] <= 25 && rsi[i] > 25;
    const rsiCrossUnder75 = rsi[i - 1] >= 75 && rsi[i] < 75;
    const buySignal = rsiCrossOverBasis || rsiCrossOver25;
    const sellSignal = rsiCrossUnderBasis || rsiCrossUnder75;
    const buyWatchMet = watchMet(buyWatchArr, i);
    const sellWatchMet = watchMet(sellWatchArr, i);

    if (buySignal && buyWatchMet) plotBuyBG[i] = true;
    else if (sellSignal && sellWatchMet) plotSellBG[i] = true;

    if (buySignal && buyWatchMet && confirmedAt(i)) { plotBuy[i] = true; clearedAt = i; }
    else if (sellSignal && sellWatchMet && confirmedAt(i)) { plotSell[i] = true; clearedAt = i; }
  }

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // plotshape(plotBuy, "BUY/LONG", belowbar, triangleup, orange) / plotshape(plotSell, "SELL/SHORT", abovebar,
    // triangledown, fuchsia)
    if (plotBuy[i]) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: ORANGE, text: 'Buy', id: 'shape0' });
    else if (plotSell[i]) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: FUCHSIA, text: 'Sell', id: 'shape1' });
    // The 3 target circles on the low of a buy / the high of a sell (location.absolute; tiny, small, normal)
    if (plotBuy[i]) {
      CIRCLES_BUY.forEach(([c, size], k) => markers.push({
        time: t, position: 'atPriceMiddle', price: bars[i].low, shape: 'circle', color: c, size, id: `shape${2 + k}`,
      }));
    } else if (plotSell[i]) {
      CIRCLES_SELL.forEach(([c, size], k) => markers.push({
        time: t, position: 'atPriceMiddle', price: bars[i].high, shape: 'circle', color: c, size, id: `shape${5 + k}`,
      }));
    }
    // RSI watch signals: squares below / above the bar
    if (buyWatchArr[i]) markers.push({ time: t, position: 'belowBar', shape: 'square', color: BUY_WATCH, size: 'tiny', id: 'shape8' });
    if (sellWatchArr[i]) markers.push({ time: t, position: 'aboveBar', shape: 'square', color: SELL_WATCH, size: 'tiny', id: 'shape9' });
    // Signal warning background: bgcolor(plotBuyBG ? orange 80) / bgcolor(plotSellBG ? fuchsia 80)
    if (plotBuyBG[i]) bgColors.push({ time: t, color: 'rgba(255,152,0,0.2)', id: 'bgcolor0' });
    if (plotSellBG[i]) bgColors.push({ time: t, color: 'rgba(224,64,251,0.2)', id: 'bgcolor1' });
  }

  // 5. MA-coloured candles (plotcandle): orange on a buy, fuchsia on a sell, else green over both MAs, yellow between
  // them, red under both (na MAs: red)
  const fastMA = computeMA(bars, closeArr, cfg.fastMaLength, cfg.fastMaType);
  const slowMA = computeMA(bars, closeArr, cfg.slowMaLength, cfg.slowMaType);
  const candles: PlotCandleData[] = bars.map((b, i) => {
    const c = closeArr[i];
    const aboveBoth = c >= fastMA[i] && c >= slowMA[i];
    const betweenBoth = (c >= fastMA[i] && c < slowMA[i]) || (c < fastMA[i] && c >= slowMA[i]);
    const maColor = aboveBoth ? GREEN : betweenBoth ? YELLOW : RED;
    const col = plotBuy[i] ? ORANGE : plotSell[i] ? FUCHSIA : maColor;
    return { time: b.time as number, open: b.open, high: b.high, low: b.low, close: b.close, color: col, wickColor: col, borderColor: col };
  });

  // 6. Band fill colours (transparency 70): upper bands by price vs its SMA 50, lower bands by the 10-bar rate of
  // change (na: the bear colour)
  const bullBear = computeMA(bars, closeArr, 50, 'SMA');
  const upperFillColors = closeArr.map((c, i) => (c >= bullBear[i] ? BAND_UP : BAND_DOWN));
  const lowerFillColors = closeArr.map((c, i) => {
    const prevC = i >= 10 ? closeArr[i - 10] : NaN;
    return ((c - prevC) / prevC) * 100 > 0 ? BAND_UP : BAND_DOWN;
  });

  // ATR-adjusted bands (ATR Bollinger Bands: WMA 20 +- (ATR 20 + 1.5 stdev 20)); lines and fill hidden by default
  const atrMa = computeMA(bars, closeArr, 20, 'WMA');
  const atr = taCore.atr(20, bars.map(b => b.high), bars.map(b => b.low), closeArr);
  const upperAtr = atrMa.map((m, i) => m + atr[i] + 1.5 * priceDevSrc[i]);
  const lowerAtr = atrMa.map((m, i) => m - atr[i] - 1.5 * priceDevSrc[i]);

  // Build plots
  const plotPriceBasis = priceBasis.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : v }));
  const plotUpperInner = upperInner.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : v }));
  const plotLowerInner = lowerInner.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : v }));
  const plotUpperOuter = upperOuter.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : v }));
  const plotLowerOuter = lowerOuter.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : v }));
  const line = (a: number[]) => a.map((v, i) => ({ time: bars[i].time, value: v ?? NaN }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      priceBasis: plotPriceBasis,
      upperInner: plotUpperInner,
      lowerInner: plotLowerInner,
      upperOuter: plotUpperOuter,
      lowerOuter: plotLowerOuter,
      upperAtr: line(upperAtr),
      middleAtr: line(atrMa),
      lowerAtr: line(lowerAtr),
    },
    fills: [
      { plot1: 'upperAtr', plot2: 'lowerAtr', options: { title: 'ATR-Adjusted Band Fill', color: 'transparent' } },
      { plot1: 'upperInner', plot2: 'upperOuter', options: { title: 'Upper Bollinger Bands MA Based Fill', color: BAND_UP }, colors: upperFillColors },
      { plot1: 'lowerInner', plot2: 'lowerOuter', options: { title: 'Lower Bollinger Bands ROC Based Fill', color: BAND_UP }, colors: lowerFillColors },
    ],
    markers,
    bgColors,
    plotCandles: { candle0: candles },
    // alertcondition(enableAdvancedAlerts ? plotBuyBG : plotBuy, 'Buy signal') and the sell mirror; "Advance alerts
    // one candle" is on by default: the bars of the warning background
    alerts: alertStates(alertConditions, bars, [plotBuyBG, plotSellBG]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy signal', message: 'Buy signal detected' },
  { id: 'alert1', title: 'Sell signal', message: 'Sell signal detected' },
];

export const UltimateBuySell = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
