/**
 * Market Cipher B
 *
 * WaveTrend oscillator with MFI area, difference (VWAP) area, MFI bar, Stochastic RSI with its fill,
 * cross-detection dots and the original's characters: buy / sell circles, divergence circles, gold buy circle,
 * Sommi flags and diamonds (absolute positions, as the original's plotchar calls).
 *
 * Alerts (alertcondition, `alerts` of the result): the nine conditions of the original (buy / sell circles,
 * divergence circles, gold buy, Sommi flag/diamond, small dots).
 *
 * Higher timeframes (security of the original, chart context as the third argument): the Sommi flag uses the
 * WaveTrend of the "Sommi F. Wave timeframe" bars (no lookahead), the Sommi diamond the Heikin Ashi candles of the
 * two "HTF Candle Res." timeframes (lookahead on), built from the chart bars. A timeframe equal to or lower than the
 * chart timeframe uses the chart bars (the lower-timeframe data is not available).
 *
 * Reference: "VuManChu Cipher B + Divergences" (community)
 */

import {
  ta, getSourceSeries, Series, math, color, timeframe, heikinAshi, mapToChart,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { MarkerData, PineSize } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface MarketCipherBInputs {
  wtChannelLen: number;
  wtAvgLen: number;
  wtMALen: number;
  rsiMFIPeriod: number;
  rsiMFIMult: number;
  rsiMFIPosY: number;
  obLevel: number;
  obLevel2: number;
  obLevel3: number;
  osLevel: number;
  osLevel2: number;
  osLevel3: number;
  wtBuyShow: boolean;
  wtGoldShow: boolean;
  wtSellShow: boolean;
  wtDivShow: boolean;
  wtShowDiv: boolean;
  wtDivOBLevel: number;
  wtDivOSLevel: number;
  wtDivOBLevel_add: number;
  wtDivOSLevel_add: number;
  rsiLen: number;
  rsiShowDiv: boolean;
  rsiDivOBLevel: number;
  rsiDivOSLevel: number;
  stochShow: boolean;
  stochUseLog: boolean;
  stochAvg: boolean;
  stochLen: number;
  stochRsiLen: number;
  stochKSmooth: number;
  stochDSmooth: number;
  stochShowDiv: boolean;
  sommiFlagShow: boolean;
  sommiVwapTF: string;
  sommiVwapBearLevel: number;
  sommiVwapBullLevel: number;
  soomiFlagWTBearLevel: number;
  soomiFlagWTBullLevel: number;
  soomiRSIMFIBearLevel: number;
  soomiRSIMFIBullLevel: number;
  sommiDiamondShow: boolean;
  sommiHTCRes: string;
  sommiHTCRes2: string;
  soomiDiamondWTBearLevel: number;
  soomiDiamondWTBullLevel: number;
}

export const defaultInputs: MarketCipherBInputs = {
  wtChannelLen: 9,
  wtAvgLen: 12,
  wtMALen: 3,
  rsiMFIPeriod: 60,
  rsiMFIMult: 150,
  rsiMFIPosY: 2.5,
  obLevel: 53,
  obLevel2: 60,
  obLevel3: 100,
  osLevel: -53,
  osLevel2: -60,
  osLevel3: -75,
  wtBuyShow: true,
  wtGoldShow: true,
  wtSellShow: true,
  wtDivShow: true,
  wtShowDiv: true,
  wtDivOBLevel: 45,
  wtDivOSLevel: -65,
  wtDivOBLevel_add: 15,
  wtDivOSLevel_add: -40,
  rsiLen: 14,
  rsiShowDiv: false,
  rsiDivOBLevel: 60,
  rsiDivOSLevel: 30,
  stochShow: true,
  stochUseLog: true,
  stochAvg: false,
  stochLen: 14,
  stochRsiLen: 14,
  stochKSmooth: 3,
  stochDSmooth: 3,
  stochShowDiv: false,
  sommiFlagShow: false,
  sommiVwapTF: '720',
  sommiVwapBearLevel: 0,
  sommiVwapBullLevel: 0,
  soomiFlagWTBearLevel: 0,
  soomiFlagWTBullLevel: 0,
  soomiRSIMFIBearLevel: 0,
  soomiRSIMFIBullLevel: 0,
  sommiDiamondShow: false,
  sommiHTCRes: '60',
  sommiHTCRes2: '240',
  soomiDiamondWTBearLevel: 0,
  soomiDiamondWTBullLevel: 0,
};

export const inputConfig: InputConfig[] = [
  { id: 'wtChannelLen', type: 'int', title: 'WT Channel Length', defval: 9, min: 1 },
  { id: 'wtAvgLen', type: 'int', title: 'WT Average Length', defval: 12, min: 1 },
  { id: 'wtMALen', type: 'int', title: 'WT MA Length', defval: 3, min: 1 },
  { id: 'rsiMFIPeriod', type: 'int', title: 'MFI Period', defval: 60, min: 1 },
  { id: 'rsiMFIMult', type: 'float', title: 'MFI Area multiplier', defval: 150, min: 1 },
  { id: 'rsiMFIPosY', type: 'float', title: 'MFI Area Y Pos', defval: 2.5 },
  { id: 'obLevel', type: 'int', title: 'WT Overbought Level 1', defval: 53 },
  { id: 'obLevel2', type: 'int', title: 'WT Overbought Level 2', defval: 60 },
  { id: 'obLevel3', type: 'int', title: 'WT Overbought Level 3', defval: 100 },
  { id: 'osLevel', type: 'int', title: 'WT Oversold Level 1', defval: -53 },
  { id: 'osLevel2', type: 'int', title: 'WT Oversold Level 2', defval: -60 },
  { id: 'osLevel3', type: 'int', title: 'WT Oversold Level 3', defval: -75 },
  { id: 'wtBuyShow', type: 'bool', title: 'Show Buy dots', defval: true },
  { id: 'wtGoldShow', type: 'bool', title: 'Show Gold dots', defval: true },
  { id: 'wtSellShow', type: 'bool', title: 'Show Sell dots', defval: true },
  { id: 'wtDivShow', type: 'bool', title: 'Show Div. dots', defval: true },
  { id: 'wtShowDiv', type: 'bool', title: 'Show WT Regular Divergences', defval: true },
  { id: 'wtDivOBLevel', type: 'int', title: 'WT Bearish Divergence min', defval: 45 },
  { id: 'wtDivOSLevel', type: 'int', title: 'WT Bullish Divergence min', defval: -65 },
  { id: 'wtDivOBLevel_add', type: 'int', title: 'WT 2nd Bearish Divergence', defval: 15 },
  { id: 'wtDivOSLevel_add', type: 'int', title: 'WT 2nd Bullish Divergence 15 min', defval: -40 },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'rsiShowDiv', type: 'bool', title: 'Show RSI Regular Divergences', defval: false },
  { id: 'rsiDivOBLevel', type: 'int', title: 'RSI Bearish Divergence min', defval: 60 },
  { id: 'rsiDivOSLevel', type: 'int', title: 'RSI Bullish Divergence min', defval: 30 },
  { id: 'stochShow', type: 'bool', title: 'Show Stochastic RSI', defval: true },
  { id: 'stochUseLog', type: 'bool', title: ' Use Log?', defval: true },
  { id: 'stochAvg', type: 'bool', title: 'Use Average of both K & D', defval: false },
  { id: 'stochLen', type: 'int', title: 'Stochastic RSI Length', defval: 14 },
  { id: 'stochRsiLen', type: 'int', title: 'RSI Length ', defval: 14 },
  { id: 'stochKSmooth', type: 'int', title: 'Stochastic RSI K Smooth', defval: 3 },
  { id: 'stochDSmooth', type: 'int', title: 'Stochastic RSI D Smooth', defval: 3 },
  { id: 'stochShowDiv', type: 'bool', title: 'Show Stoch Regular Divergences', defval: false },
  { id: 'sommiFlagShow', type: 'bool', title: 'Show Sommi flag', defval: false },
  { id: 'sommiVwapTF', type: 'string', title: 'Sommi F. Wave timeframe', defval: '720' },
  { id: 'sommiVwapBearLevel', type: 'int', title: 'F. Wave Bear Level (less than)', defval: 0 },
  { id: 'sommiVwapBullLevel', type: 'int', title: 'F. Wave Bull Level (more than)', defval: 0 },
  { id: 'soomiFlagWTBearLevel', type: 'int', title: 'WT Bear Level (more than)', defval: 0 },
  { id: 'soomiFlagWTBullLevel', type: 'int', title: 'WT Bull Level (less than)', defval: 0 },
  { id: 'soomiRSIMFIBearLevel', type: 'int', title: 'Money flow Bear Level (less than)', defval: 0 },
  { id: 'soomiRSIMFIBullLevel', type: 'int', title: 'Money flow Bull Level (more than)', defval: 0 },
  { id: 'sommiDiamondShow', type: 'bool', title: 'Show Sommi diamond', defval: false },
  { id: 'sommiHTCRes', type: 'string', title: 'HTF Candle Res. 1', defval: '60' },
  { id: 'sommiHTCRes2', type: 'string', title: 'HTF Candle Res. 2', defval: '240' },
  { id: 'soomiDiamondWTBearLevel', type: 'int', title: 'WT Bear Level (More than)', defval: 0 },
  { id: 'soomiDiamondWTBullLevel', type: 'int', title: 'WT Bull Level (Less than)', defval: 0 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'wt1', title: 'WT Wave 1', color: '#4994EC', lineWidth: 2, style: 'area' },
  { id: 'wt2', title: 'WT Wave 2', color: '#1F1559', lineWidth: 1, style: 'area' },
  { id: 'vwap', title: 'VWAP (WT1-WT2)', color: '#FFFFFF80', lineWidth: 2, style: 'area' },
  { id: 'mfiArea', title: 'MFI Area', color: '#3EE145', lineWidth: 1, style: 'area' },
  { id: 'crossDot', title: 'Cross Dot', color: '#00FF00', lineWidth: 3, style: 'circles' },
  { id: 'crossLine', title: 'Cross Line', color: '#000000', lineWidth: 5 },
  { id: 'mfiBarTop', title: 'MFI Bar TOP Line', color: 'transparent', lineWidth: 1 },
  { id: 'mfiBarBottom', title: 'MFI Bar BOTTOM Line', color: 'transparent', lineWidth: 1 },
  { id: 'stochK', title: 'Stoch K', color: String(color.new('#21baf3', 70)), lineWidth: 2 },
  { id: 'stochD', title: 'Stoch D', color: String(color.new('#673ab7', 90)), lineWidth: 1 },
];

export const metadata = {
  title: 'Market Cipher B',
  shortTitle: 'MCB',
  overlay: false,
};

// Colours of the original
const COLOR_RED = '#ff0000';
const COLOR_GREEN = '#3fff00';
const COLOR_ORANGE = '#e2a400';
const COLOR_PINK = '#ff00f0';
const COLOR_BLUELIGHT = '#31c0ff';

const num = (a: (number | null | undefined)[]) => a.map((v) => (v == null ? NaN : v));

/** WaveTrend of the original (f_wavetrend): ci from hlc3, wt1 = ema(ci, avg), wt2 = sma(wt1, malen) */
function waveTrend(bars: Bar[], chlen: number, avg: number, malen: number): { wt1: number[]; wt2: number[] } {
  const hlc3 = getSourceSeries(bars, 'hlc3');
  const esa = ta.ema(hlc3, chlen);
  const de = ta.ema(math.abs(hlc3.sub(esa)) as Series, chlen);
  const ci = hlc3.sub(esa).div(de.mul(0.015));
  const wt1 = ta.ema(ci, avg);
  const wt2 = ta.sma(wt1, malen);
  return { wt1: num(wt1.toArray()), wt2: num(wt2.toArray()) };
}

/**
 * f_findDivs(src, topLimit, botLimit, useLimits) of the original: fractals of src two bars back, the previous
 * fractal's value and price (valuewhen(...)[2]) and the regular divergences
 */
function findDivs(src: number[], highs: number[], lows: number[], topLimit: number, botLimit: number, useLimits: boolean) {
  const n = src.length;
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const fractalTop: boolean[] = new Array(n).fill(false);
  const fractalBot: boolean[] = new Array(n).fill(false);
  const lowPrev: number[] = new Array(n).fill(NaN);
  const bearSignal: boolean[] = new Array(n).fill(false);
  const bullSignal: boolean[] = new Array(n).fill(false);
  const vwHigh: number[] = new Array(n).fill(NaN);
  const vwHighPrice: number[] = new Array(n).fill(NaN);
  const vwLow: number[] = new Array(n).fill(NaN);
  const vwLowPrice: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const s0 = at(src, i), s1 = at(src, i - 1), s2 = at(src, i - 2), s3 = at(src, i - 3), s4 = at(src, i - 4);
    const top = s4 < s2 && s3 < s2 && s2 > s1 && s2 > s0;
    const bot = s4 > s2 && s3 > s2 && s2 < s1 && s2 < s0;
    const fractalize = top ? 1 : bot ? -1 : 0;
    // fractalTop / fractalBot are floats (src[2] or na) used as conditions: true when not na and not 0
    const ft = fractalize > 0 && (useLimits ? s2 >= topLimit : true) ? s2 : NaN;
    const fb = fractalize < 0 && (useLimits ? s2 <= botLimit : true) ? s2 : NaN;
    fractalTop[i] = !Number.isNaN(ft) && ft !== 0;
    fractalBot[i] = !Number.isNaN(fb) && fb !== 0;
    vwHigh[i] = fractalTop[i] ? s2 : i > 0 ? vwHigh[i - 1] : NaN;
    vwHighPrice[i] = fractalTop[i] ? at(highs, i - 2) : i > 0 ? vwHighPrice[i - 1] : NaN;
    vwLow[i] = fractalBot[i] ? s2 : i > 0 ? vwLow[i - 1] : NaN;
    vwLowPrice[i] = fractalBot[i] ? at(lows, i - 2) : i > 0 ? vwLowPrice[i - 1] : NaN;
    const highPrev = at(vwHigh, i - 2);
    const highPrice = at(vwHighPrice, i - 2);
    lowPrev[i] = at(vwLow, i - 2);
    const lowPrice = at(vwLowPrice, i - 2);
    bearSignal[i] = fractalTop[i] && at(highs, i - 2) > highPrice && s2 < highPrev;
    bullSignal[i] = fractalBot[i] && at(lows, i - 2) < lowPrice && s2 > lowPrev[i];
  }
  return { fractalTop, fractalBot, lowPrev, bearSignal, bullSignal };
}

/** sma over an array: na when a value of the window is na */
function smaArr(src: number[], len: number): number[] {
  return src.map((_v, i) => {
    if (i < len - 1) return NaN;
    let sum = 0;
    for (let j = i - len + 1; j <= i; j++) sum += src[j];
    return sum / len;
  });
}

/** stoch(src, src, src, len): na while the window has an na value, or with a zero range */
function stochArr(src: number[], len: number): number[] {
  return src.map((v, i) => {
    if (i < len - 1) return NaN;
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      if (Number.isNaN(src[j])) return NaN;
      lo = Math.min(lo, src[j]);
      hi = Math.max(hi, src[j]);
    }
    return hi - lo > 0 ? (100 * (v - lo)) / (hi - lo) : NaN;
  });
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketCipherBInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const {
    wtChannelLen, wtAvgLen, wtMALen,
    rsiMFIPeriod, rsiMFIMult, rsiMFIPosY,
    obLevel, obLevel2, obLevel3, osLevel, osLevel2, osLevel3,
  } = cfg;

  const n = bars.length;

  // --- WaveTrend ---
  // Pine: esa = ema(hlc3, chlen), de = ema(abs(hlc3-esa), chlen)
  //        ci = (hlc3 - esa) / (0.015 * de)
  //        wt1 = ema(ci, avg), wt2 = sma(wt1, malen)
  const { wt1: wt1Arr, wt2: wt2Arr } = waveTrend(bars, wtChannelLen, wtAvgLen, wtMALen);

  // --- RSI+MFI Area ---
  // Pine: sma(((close - open) / (high - low)) * multiplier, period) - posY
  const mfiRaw: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const range = bars[i].high - bars[i].low;
    mfiRaw[i] = range > 0 ? ((bars[i].close - bars[i].open) / range) * rsiMFIMult : 0;
  }
  const mfiSeries = new Series(bars, (_bar, idx) => mfiRaw[idx]);
  const mfiSma = ta.sma(mfiSeries, rsiMFIPeriod);
  const mfiArr = mfiSma.toArray();

  const warmup = wtChannelLen + wtAvgLen;
  const mfiWarmup = rsiMFIPeriod;

  const toVal = (v: number | null, i: number, wu: number): number => {
    if (v == null || i < wu || !isFinite(v)) return NaN;
    return v;
  };

  // Pine: plot(wt1, style=area, color=#4994EC)
  const wt1Plot = wt1Arr.map((v, i) => ({ time: bars[i].time, value: toVal(v, i, warmup) }));
  // Pine: plot(wt2, style=area, color=#1F1559)
  const wt2Plot = wt2Arr.map((v, i) => ({ time: bars[i].time, value: toVal(v, i, warmup) }));

  // Pine: wtVwap = wt1 - wt2; plot(wtVwap, style=area, color=white)
  const vwapPlot = bars.map((b, i) => {
    const v1 = wt1Arr[i];
    const v2 = wt2Arr[i];
    if (isNaN(v1) || isNaN(v2) || i < warmup) return { time: b.time, value: NaN };
    return { time: b.time, value: v1 - v2 };
  });

  // Pine: plot(rsiMFI, style=area, color=rsiMFIColor)
  const mfiPlot = bars.map((b, i) => {
    const v = mfiArr[i];
    const val = toVal(v, i, mfiWarmup) - rsiMFIPosY;
    const color = val > 0 ? '#3EE14580' : '#FF3D2E80';
    return { time: b.time, value: isFinite(val) ? val : NaN, color };
  });

  // --- Cross dots ---
  // Pine: wtCross = cross(wt1, wt2)
  //       plot(wtCross ? wt2 : na, style=circles, color=signalColor, linewidth=3)
  const crossDotPlot: { time: number; value: number; color?: string }[] = [];
  const crossLinePlot: { time: number; value: number }[] = [];

  for (let i = 0; i < n; i++) {
    if (i < warmup + 1 || isNaN(wt1Arr[i]) || isNaN(wt2Arr[i]) ||
        isNaN(wt1Arr[i - 1]) || isNaN(wt2Arr[i - 1])) {
      crossDotPlot.push({ time: bars[i].time, value: NaN });
      crossLinePlot.push({ time: bars[i].time, value: NaN });
      continue;
    }

    const prev1 = wt1Arr[i - 1];
    const prev2 = wt2Arr[i - 1];
    const curr1 = wt1Arr[i];
    const curr2 = wt2Arr[i];

    // cross: either crossover or crossunder
    const crossUp = prev1 <= prev2 && curr1 > curr2;
    const crossDown = prev1 >= prev2 && curr1 < curr2;
    const isCross = crossUp || crossDown;

    if (isCross) {
      // Pine: plot(cross(wt1, wt2) ? wt2 : na, color=black, style=line, linewidth=5)
      crossLinePlot.push({ time: bars[i].time, value: curr2 });

      // Small circle at every cross (Pine line 495)
      const dotColor = (curr2 - curr1) > 0 ? '#FF5252' : '#00E676';
      crossDotPlot.push({ time: bars[i].time, value: curr2, color: dotColor });
    } else {
      crossDotPlot.push({ time: bars[i].time, value: NaN });
      crossLinePlot.push({ time: bars[i].time, value: NaN });
    }
  }

  // --- Signals of the original (na values compare false) ---
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  // rsiMFI: the MFI Area values
  const rsiMFI = mfiPlot.map((p) => p.value);

  // rsi = rsi(close, rsiLen)
  const rsi = num(ta.rsi(new Series(bars, (b) => b.close), cfg.rsiLen).toArray());

  // f_stochrsi(close, stochLen, stochRsiLen, stochKSmooth, stochDSmooth, stochUseLog, stochAvg)
  const stochSrc = bars.map((b) => (cfg.stochUseLog ? Math.log(b.close) : b.close));
  const stochRsi = num(ta.rsi(Series.fromArray(bars, stochSrc), cfg.stochRsiLen).toArray());
  const kk = smaArr(stochArr(stochRsi, cfg.stochLen), cfg.stochKSmooth);
  const stochD = smaArr(kk, cfg.stochDSmooth);
  const stochK = cfg.stochAvg ? kk.map((v, i) => (v + stochD[i]) / 2) : kk;

  // Divergences
  const wtDiv = findDivs(wt2Arr, highs, lows, cfg.wtDivOBLevel, cfg.wtDivOSLevel, true);
  const wtDivAdd = findDivs(wt2Arr, highs, lows, cfg.wtDivOBLevel_add, cfg.wtDivOSLevel_add, true);
  const rsiDiv = findDivs(rsi, highs, lows, cfg.rsiDivOBLevel, cfg.rsiDivOSLevel, true);
  const stochDiv = findDivs(stochK, highs, lows, 0, 0, false);
  // lastRsi = valuewhen(wtFractalBot, rsi[2], 0)[2]
  const rsiWhen: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    rsiWhen[i] = wtDiv.fractalBot[i] ? (i >= 2 ? rsi[i - 2] : NaN) : i > 0 ? rsiWhen[i - 1] : NaN;
  }

  // Bars of a timeframe as security(syminfo.tickerid, tf, ...) builds them; null: the chart bars
  const chartTf = chartTimeframe(bars, chart);
  const securityOf = (tf: string) => {
    if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) <= timeframe.in_seconds(chartTf)) return null;
    return higherTimeframeBars(bars, tf, chart);
  };
  // f_findSommiFlag: hwtVwap = wt1 - wt2 of the WaveTrend of the timeframe (no lookahead)
  const flagSec = securityOf(cfg.sommiVwapTF);
  let hwtVwap: number[];
  if (flagSec) {
    const h = waveTrend(flagSec.htf, wtChannelLen, wtAvgLen, wtMALen);
    hwtVwap = mapToChart(h.wt1.map((v, g) => v - h.wt2[g]), flagSec.group, flagSec.latest, false, false);
  } else {
    hwtVwap = wt1Arr.map((v, i) => v - wt2Arr[i]);
  }
  // f_getTFCandle: Heikin Ashi candle of the timeframe (lookahead on), candleBodyDir = close > open
  const candleBodyDir = (tf: string): boolean[] => {
    const sec = securityOf(tf);
    const ha = heikinAshi(sec ? sec.htf : bars);
    const dir = ha.map((b) => (b.close > b.open ? 1 : 0));
    const onChart = sec ? mapToChart(dir, sec.group, sec.latest, true, false) : dir;
    return onChart.map((v) => v === 1);
  };
  const dir1 = candleBodyDir(cfg.sommiHTCRes);
  const dir2 = candleBodyDir(cfg.sommiHTCRes2);

  const flags: boolean[][] = Array.from({ length: 9 }, () => new Array<boolean>(n).fill(false));
  const markers: MarkerData[] = [];
  // plotchar(..., location = location.absolute): the character at the price, on the bar (offset applied)
  const char = (id: string, i: number, price: number, ch: string, css: string, size: PineSize) => {
    if (i < 0) return;
    markers.push({ id, time: bars[i].time, position: 'atPriceMiddle', price, shape: 'circle', char: ch, color: css, size });
  };
  const buyCircle = String(color.new(COLOR_GREEN, 50));
  const sellCircle = String(color.new(COLOR_RED, 50));
  const gold = String(color.new(COLOR_ORANGE, 15));
  for (let i = 0; i < n; i++) {
    const c1 = wt1Arr[i];
    const c2 = wt2Arr[i];
    const p1 = i > 0 ? wt1Arr[i - 1] : NaN;
    const p2 = i > 0 ? wt2Arr[i - 1] : NaN;
    const wtCross = (c1 > c2 && p1 <= p2) || (c1 < c2 && p1 >= p2);
    const wtCrossUp = c2 - c1 <= 0;
    const wtCrossDown = c2 - c1 >= 0;
    // buySignal = wtCross and wtCrossUp and wtOversold; sellSignal = wtCross and wtCrossDown and wtOverbought
    const buySignal = wtCross && wtCrossUp && c2 <= osLevel;
    const sellSignal = wtCross && wtCrossDown && c2 >= obLevel;
    const buySignalDiv = (cfg.wtShowDiv && wtDiv.bullSignal[i]) || (cfg.wtShowDiv && wtDivAdd.bullSignal[i])
      || (cfg.stochShowDiv && stochDiv.bullSignal[i]) || (cfg.rsiShowDiv && rsiDiv.bullSignal[i]);
    const sellSignalDiv = (cfg.wtShowDiv && wtDiv.bearSignal[i]) || (cfg.wtShowDiv && wtDivAdd.bearSignal[i])
      || (cfg.stochShowDiv && stochDiv.bearSignal[i]) || (cfg.rsiShowDiv && rsiDiv.bearSignal[i]);
    const lastRsi = i >= 2 ? rsiWhen[i - 2] : NaN;
    const wtLowPrev = wtDiv.lowPrev[i];
    const wtGoldBuy = ((cfg.wtShowDiv && wtDiv.bullSignal[i]) || (cfg.rsiShowDiv && rsiDiv.bullSignal[i]))
      && wtLowPrev <= osLevel3 && c2 > osLevel3 && wtLowPrev - c2 <= -5 && lastRsi < 30;
    const sommiBearish = rsiMFI[i] < cfg.soomiRSIMFIBearLevel && c2 > cfg.soomiFlagWTBearLevel && wtCross && wtCrossDown
      && hwtVwap[i] < cfg.sommiVwapBearLevel;
    const sommiBullish = rsiMFI[i] > cfg.soomiRSIMFIBullLevel && c2 < cfg.soomiFlagWTBullLevel && wtCross && wtCrossUp
      && hwtVwap[i] > cfg.sommiVwapBullLevel;
    const sommiBearishDiamond = c2 >= cfg.soomiDiamondWTBearLevel && wtCross && wtCrossDown && !dir1[i] && !dir2[i];
    const sommiBullishDiamond = c2 <= cfg.soomiDiamondWTBullLevel && wtCross && wtCrossUp && dir1[i] && dir2[i];

    flags[0][i] = buySignal;
    flags[1][i] = buySignalDiv;
    flags[2][i] = wtGoldBuy;
    flags[3][i] = sommiBullish || sommiBullishDiamond;
    flags[4][i] = wtCross && wtCrossUp;
    flags[5][i] = sommiBearish || sommiBearishDiamond;
    flags[6][i] = sellSignal;
    flags[7][i] = sellSignalDiv;
    flags[8][i] = wtCross && wtCrossDown;

    if (cfg.sommiFlagShow && sommiBearish) char('char0', i, 108, '⚑', COLOR_PINK, 'tiny');
    if (cfg.sommiFlagShow && sommiBullish) char('char1', i, -108, '⚑', COLOR_BLUELIGHT, 'tiny');
    if (cfg.sommiDiamondShow && sommiBearishDiamond) char('char2', i, 108, '◆', COLOR_PINK, 'tiny');
    if (cfg.sommiDiamondShow && sommiBullishDiamond) char('char3', i, -108, '◆', COLOR_BLUELIGHT, 'tiny');
    if (cfg.wtBuyShow && buySignal) char('char4', i, -107, '·', buyCircle, 'small');
    if (cfg.wtSellShow && sellSignal) char('char5', i, 105, '·', sellCircle, 'small');
    // offset = -2, transp = 15: wtBullDiv ? green : wtBullDiv_add ? color.new(green, 60) : rsiShowDiv ? green : na
    if (cfg.wtDivShow && buySignalDiv) {
      const css = wtDiv.bullSignal[i] ? String(color.new(COLOR_GREEN, 15))
        : wtDivAdd.bullSignal[i] ? String(color.new(COLOR_GREEN, 60))
          : cfg.rsiShowDiv ? String(color.new(COLOR_GREEN, 15)) : 'transparent';
      char('char6', i - 2, -106, '•', css, 'small');
    }
    // wtBearDiv ? red : wtBearDiv_add ? color.new(red, 60) : rsiBearDiv ? red : na
    if (cfg.wtDivShow && sellSignalDiv) {
      const css = wtDiv.bearSignal[i] ? String(color.new(COLOR_RED, 15))
        : wtDivAdd.bearSignal[i] ? String(color.new(COLOR_RED, 60))
          : rsiDiv.bearSignal[i] ? String(color.new(COLOR_RED, 15)) : 'transparent';
      char('char7', i - 2, 106, '•', css, 'small');
    }
    if (wtGoldBuy && cfg.wtGoldShow) char('char8', i - 2, -106, '•', gold, 'normal');
  }
  markers.sort((a, b) => a.time - b.time);

  // MFI bar: plot(rsiMFIShow ? -95 : na) / plot(rsiMFIShow ? -99 : na) with transp 100,
  // fill(..., title = 'MFI Bar Colors', color = rsiMFIColor, transp = 75)
  const mfiBarTop = bars.map((b) => ({ time: b.time, value: -95 }));
  const mfiBarBottom = bars.map((b) => ({ time: b.time, value: -99 }));
  const mfiBarColors = rsiMFI.map((v) => String(color.new(v > 0 ? '#3ee145' : '#ff3d2e', 75)));
  // Stochastic RSI: plot(stochShow ? stochK : na, 'Stoch K') / plot(stochShow ? stochD : na, 'Stoch D'),
  // fill(stochKplot, stochDplot, title = 'KD Fill', color = stochK >= stochD ? #21baf3 95% : #673ab7 90%)
  const stochKPlot = bars.map((b, i) => ({ time: b.time, value: cfg.stochShow && Number.isFinite(stochK[i]) ? stochK[i] : NaN }));
  const stochDPlot = bars.map((b, i) => ({ time: b.time, value: cfg.stochShow && Number.isFinite(stochD[i]) ? stochD[i] : NaN }));
  const kdColors = stochK.map((k, i) => String(k >= stochD[i] ? color.new('#21baf3', 95) : color.new('#673ab7', 90)));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'wt1': wt1Plot,
      'wt2': wt2Plot,
      'vwap': vwapPlot,
      'mfiArea': mfiPlot,
      'crossDot': crossDotPlot,
      'crossLine': crossLinePlot,
      'mfiBarTop': mfiBarTop,
      'mfiBarBottom': mfiBarBottom,
      'stochK': stochKPlot,
      'stochD': stochDPlot,
    },
    fills: [
      { plot1: 'mfiBarTop', plot2: 'mfiBarBottom', options: { title: 'MFI Bar Colors' }, colors: mfiBarColors },
      { plot1: 'stochK', plot2: 'stochD', options: { title: 'KD Fill' }, colors: kdColors },
    ],
    hlines: [
      { value: 0, options: { color: '#FFFFFF80', linestyle: 'solid' as const, title: 'Zero' } },
      { value: obLevel, options: { color: '#FFFFFF26', linestyle: 'dashed' as const, title: 'OB1 (53)' } },
      { value: osLevel, options: { color: '#FFFFFF26', linestyle: 'dashed' as const, title: 'OS1 (-53)' } },
      { value: obLevel2, options: { color: '#FFFFFF15', linestyle: 'dashed' as const, title: 'OB2 (60)' } },
      { value: osLevel2, options: { color: '#FFFFFF15', linestyle: 'dashed' as const, title: 'OS2 (-60)' } },
      { value: obLevel3, options: { color: '#FFFFFF0A', linestyle: 'dotted' as const, title: 'OB3 (100)' } },
      { value: osLevel3, options: { color: '#FFFFFF0A', linestyle: 'dotted' as const, title: 'OS3 (-75)' } },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy (Big green circle)', message: 'Green circle WaveTrend Oversold' },
  { id: 'alert1', title: 'Buy (Big green circle + Div)', message: 'Buy & WT Bullish Divergence & WT Overbought' },
  { id: 'alert2', title: 'GOLD Buy (Big GOLDEN circle)', message: 'Green & GOLD circle WaveTrend Overbought' },
  { id: 'alert3', title: 'Sommi bullish flag/diamond', message: 'Blue flag/diamond' },
  { id: 'alert4', title: 'Buy (Small green dot)', message: 'Buy small circle' },
  { id: 'alert5', title: 'Sommi bearish flag/diamond', message: 'Purple flag/diamond' },
  { id: 'alert6', title: 'Sell (Big red circle)', message: 'Red Circle WaveTrend Overbought' },
  { id: 'alert7', title: 'Sell (Big red circle + Div)', message: 'Buy & WT Bearish Divergence & WT Overbought' },
  { id: 'alert8', title: 'Sell (Small red dot)', message: 'Sell small circle' },
];

export const MarketCipherB = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
