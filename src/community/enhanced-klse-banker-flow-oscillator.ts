/**
 * Enhanced KLSE Banker Flow Oscillator
 *
 * Fund trend: the close position in the 27-bar range, smoothed twice by a weighted running average (xsa), smoothed by
 * a hull-type WMA chain (length 2, 3 or 8) or an EMA(5) by the market state (volatile with high / low volume,
 * trending, other), then blended with a Fisher transform of itself and clamped to 0..100. Bull bear line: a typical
 * price (with a volume-weighted close that caps volume outliers) in the high-low range of 34 bars (21 in volatile
 * markets), smoothed by the same hull chain (13 or 10 bars). Signals: banker entry (fund trend crosses over the bull
 * bear line in a low zone with momentum, volume and RSI confirmation), position increase, position decrease, exit and
 * weak rebound, drawn as coloured candles between the two lines, as markers, and as strong up / down trend characters.
 * The background shows the market state; columns show |fund trend - bull bear line| / 10.
 * Alerts (alertcondition, `alerts` of the result): one per signal (banker entry, position increase, position
 * decrease, exit, weak rebound), and 'Overbought Warning' / 'Oversold Opportunity', whose conditions in the original
 * (fund trend above 80 and crossing under 80 on the same bar, below 20 and crossing over 20) are never true.
 *
 * Reference: "Advanced Banker Chip Detector Pro" by Dr_Leong_Yee_Rock
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, callsite, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import type { MarkerData, BgColorData, PlotCandleData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EnhancedKLSEBankerFlowOscillatorInputs {
  smoothLength: number;
  fibLength: number;
  entryThreshold: number;
  /** Volume window (not used by the Pine calculations) */
  volWindow: number;
  sensitivity: number;
  showSignals: boolean;
  showStrength: boolean;
  showFills: boolean;
  bullColor: string;
  bearColor: string;
  entryColor: string;
  alertColor: string;
  reboundColor: string;
}

export const defaultInputs: EnhancedKLSEBankerFlowOscillatorInputs = {
  smoothLength: 13,
  fibLength: 34,
  entryThreshold: 25,
  volWindow: 13,
  sensitivity: 0.95,
  showSignals: true,
  showStrength: true,
  showFills: true,
  bullColor: '#00BCD4',
  bearColor: '#F44336',
  entryColor: '#FF9800',
  alertColor: '#9C27B0',
  reboundColor: '#8BC34A',
};

export const inputConfig: InputConfig[] = [
  { id: 'smoothLength', type: 'int', title: 'Smoothing Length', defval: 13, min: 5, max: 50 },
  { id: 'fibLength', type: 'int', title: 'Fibonacci Period', defval: 34, min: 13, max: 89 },
  { id: 'entryThreshold', type: 'float', title: 'Entry Threshold', defval: 25, min: 10, max: 40 },
  { id: 'volWindow', type: 'int', title: 'Volume Window', defval: 13, min: 5, max: 30 },
  { id: 'sensitivity', type: 'float', title: 'Signal Sensitivity', defval: 0.95, min: 0.8, max: 0.99, step: 0.01 },
  { id: 'showSignals', type: 'bool', title: 'Show Signal Markers', defval: true },
  { id: 'showStrength', type: 'bool', title: 'Show Signal Strength', defval: true },
  { id: 'showFills', type: 'bool', title: 'Show Zone Fills', defval: true },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00BCD4' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#F44336' },
  { id: 'entryColor', type: 'color', title: 'Entry Signal Color', defval: '#FF9800' },
  { id: 'alertColor', type: 'color', title: 'Alert Color', defval: '#9C27B0' },
  { id: 'reboundColor', type: 'color', title: 'Rebound Color', defval: '#8BC34A' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fund Trend', color: String(color.new('#00BCD4', 20)), lineWidth: 2 },
  { id: 'plot1', title: 'Bull Bear Line', color: String(color.new('#F44336', 20)), lineWidth: 2 },
  { id: 'plot2', title: 'Signal Strength', color: '#00BCD4', lineWidth: 1, style: 'columns' },
];

/** hline(80 / 20 / 10 / 90, dotted) with the default colours (the result `hlines` carry the input colours) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_ob', price: 80, title: 'Overbought', color: String(color.new('#F44336', 50)), linestyle: 'dotted' },
  { id: 'hline_os', price: 20, title: 'Oversold', color: String(color.new('#FF9800', 50)), linestyle: 'dotted' },
  { id: 'hline_extreme_os', price: 10, title: 'Extreme Oversold', color: String(color.new('#00BCD4', 50)), linestyle: 'dotted' },
  { id: 'hline_extreme_ob', price: 90, title: 'Extreme Overbought', color: String(color.new('#9C27B0', 50)), linestyle: 'dotted' },
];

/** fill(h2, h3) / fill(h1, h4) with the default colours */
export const fillConfig: FillConfig[] = [
  { id: 'fill_buy_zone', plot1: 'hline_os', plot2: 'hline_extreme_os', color: String(color.new('#00BCD4', 90)), title: 'Strong Buy Zone' },
  { id: 'fill_sell_zone', plot1: 'hline_ob', plot2: 'hline_extreme_ob', color: String(color.new('#F44336', 90)), title: 'Strong Sell Zone' },
];

export const metadata = {
  title: 'Advanced Banker Chip Detector Pro',
  shortTitle: 'Advanced Banker Chip Detector Pro',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
const nz = (v: number, r = 0) => (isNaN(v) ? r : v);

/** Pine plotcandle without wickcolor / bordercolor: the style defaults of the plot */
const CANDLE_WICK = '#737375';
const CANDLE_BORDER = '#000000';

export function calculate(
  bars: Bar[],
  inputs: Partial<EnhancedKLSEBankerFlowOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[]; bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]>;
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const at = (a: number[], i: number, k: number) => (i - k >= 0 ? a[i - k] : NaN);
  const close = bars.map((b) => b.close);
  const open = bars.map((b) => b.open);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);

  /** ta.wma with a length per bar: the WMA of the same history with each bar's length (truncated, as Pine) */
  const wmaSeries = (src: number[], lengths: number[]): number[] => {
    const cache = new Map<number, number[]>();
    return lengths.map((len, i) => {
      const key = Math.trunc(len);
      let w = cache.get(key);
      if (!w) {
        w = A(ta.wma(S(src), key));
        cache.set(key, w);
      }
      return w[i];
    });
  };
  // double_hull_ma(src, length): wma(wma(2 * wma(src, max(1, length / 2)) - wma(src, length), max(1, round(sqrt(length)))), 3)
  const doubleHullMa = (src: number[], lengths: number[]): number[] => {
    const h1 = wmaSeries(src, lengths.map((l) => Math.max(1, l / 2)));
    const h2 = wmaSeries(src, lengths);
    const sqn = lengths.map((l) => Math.max(1, Math.round(Math.sqrt(l))));
    const hull1 = wmaSeries(h1.map((v, i) => 2 * v - h2[i]), sqn);
    return A(ta.wma(S(hull1), 3));
  };
  const constLen = (l: number) => new Array<number>(n).fill(l);

  // xsa(src, len, wei): running sum of `len` values (restarted after na) and a weighted running average
  const xsa = (src: number[], len: number, wei: number): number[] => {
    const out: number[] = new Array(n);
    let sumfPrev = NaN;
    let outPrev = NaN;
    for (let i = 0; i < n; i++) {
      const old = at(src, i, len);
      const sumf = nz(sumfPrev) - nz(old) + src[i];
      const ma = isNaN(old) ? src[i] : sumf / Math.max(len, 1);
      const o = isNaN(outPrev) ? ma : (src[i] * wei + outPrev * (len - wei)) / Math.max(len, 1);
      out[i] = o;
      sumfPrev = sumf;
      outPrev = o;
    }
    return out;
  };

  // Raw banker fund trend
  const ll27 = A(ta.lowest(S(low), 27));
  const hh27 = A(ta.highest(S(high), 27));
  const rawPriceAction = close.map((c, i) => ((c - ll27[i]) / Math.max(0.001, hh27[i] - ll27[i])) * 100);
  const x1 = xsa(rawPriceAction, 5, 1);
  const x2 = xsa(xsa(rawPriceAction, 5, 1), 3, 1);
  const rawFundTrend = x1.map((v, i) => (3 * v - 2 * x2[i] - 50) * 1.032 + 50);

  // enhanced_market_condition()
  const rsi14 = A(ta.rsi(S(close), 14));
  const atr14 = A(ta.atr(bars, 14));
  const volSma20 = A(ta.sma(S(volume), 20));
  const ema8 = A(ta.ema(S(close), 8));
  const ema21 = A(ta.ema(S(close), 21));
  const marketState = bars.map((_b, i) => {
    const atrPct = (atr14[i] / close[i]) * 100;
    const volRatio = volume[i] / volSma20[i];
    const trendStrength = (Math.abs(ema8[i] - ema21[i]) / ema21[i]) * 100;
    const c10 = at(close, i, 10);
    const priceVelocity = (Math.abs(close[i] - c10) / c10) * 100;
    const isVolatile = gt(atrPct, 2.0) && gt(priceVelocity, 3.0);
    const isTrending = gt(trendStrength, 1.5) && gt(rsi14[i], 40) && lt(rsi14[i], 60);
    const highVolume = gt(volRatio, 1.2);
    const lowVolume = lt(volRatio, 0.7);
    return isVolatile && highVolume ? 3 : isVolatile && lowVolume ? 2 : isTrending ? 1 : 0;
  });

  // advanced_momentum(close, 10): CMO of the last 10 changes, EMA(2)
  const cmo = bars.map((_b, i) => {
    let up = 0;
    let down = 0;
    for (let k = 0; k <= 9; k++) {
      const diff = at(close, i, k) - at(close, i, k + 1);
      up += gt(diff, 0) ? diff : 0;
      down += lt(diff, 0) ? -diff : 0;
    }
    return eq(down, 0) ? 100 : eq(up, 0) ? -100 : (100 * (up - down)) / (up + down);
  });
  const momentum = A(ta.ema(S(cmo), 2));

  // enhanced_fisher(raw_fund_trend / 100, 10)
  const fSrc = rawFundTrend.map((v) => v / 100);
  const fHi = A(ta.highest(S(fSrc), 10));
  const fLo = A(ta.lowest(S(fSrc), 10));
  const fisherRaw: number[] = new Array(n);
  let valuePrev = NaN;
  let resultPrev = NaN;
  for (let i = 0; i < n; i++) {
    let value = gt(fHi[i] - fLo[i], 0) ? 2 * ((fSrc[i] - fLo[i]) / (fHi[i] - fLo[i]) - 0.5) : 0;
    value = Math.max(-0.999, Math.min(0.999, 0.25 * value + 0.5 * nz(valuePrev, 0)));
    const result = 0.5 * Math.log((1 + value) / Math.max(0.001, 1 - value)) + 0.5 * nz(resultPrev, 0);
    fisherRaw[i] = result;
    valuePrev = value;
    resultPrev = result;
  }
  const fisherEma = A(ta.ema(S(fisherRaw), 2));
  const fisherValue = fisherEma.map((v) => v * 50 + 50);

  // Adaptive fund trend
  const hull2 = doubleHullMa(rawFundTrend, constLen(2));
  const hull3 = doubleHullMa(rawFundTrend, constLen(3));
  const ema5 = A(ta.ema(S(rawFundTrend), 5));
  const hull8 = doubleHullMa(rawFundTrend, constLen(8));
  const fundtrend = bars.map((_b, i) => {
    const ms = marketState[i];
    const base = ms === 3 ? hull2[i] : ms === 2 ? hull3[i] : ms === 1 ? ema5[i] : hull8[i];
    const w = ms >= 2 ? 0.4 : 0.3;
    return Math.min(100, Math.max(0, base * (1 - w) + fisherValue[i] * w));
  });

  // enhanced_volume_weight(close, volume)
  const volStdev20 = A(ta.stdev(S(volume), 20));
  const adjustedVol = volume.map((v, i) => {
    const cap = volSma20[i] + 2 * volStdev20[i];
    return gt(v, cap) ? cap : v;
  });
  const pv5 = A(ta.sma(S(close.map((c, i) => c * adjustedVol[i])), 5));
  const av5 = A(ta.sma(S(adjustedVol), 5));
  const vwapComponent = pv5.map((v, i) => v / Math.max(0.001, av5[i]));
  const typ = bars.map((b, i) => (2 * b.close + b.high + b.low + b.open + vwapComponent[i]) / 6);

  // Dynamic support / resistance: ta.lowest / ta.highest with a length per bar
  const lowestSite = callsite.lowest();
  const highestSite = callsite.highest();
  const rawBullBear: number[] = new Array(n);
  const adaptiveSmooth: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const dynamicFib = marketState[i] >= 2 ? Math.min(cfg.fibLength, 21) : cfg.fibLength;
    const lol = lowestSite(low[i], dynamicFib);
    const hoh = highestSite(high[i], dynamicFib);
    rawBullBear[i] = ((typ[i] - lol) / Math.max(0.001, hoh - lol)) * 100;
    adaptiveSmooth[i] = marketState[i] >= 2 ? Math.max(5, cfg.smoothLength - 3) : cfg.smoothLength;
  }
  const bullbearline = doubleHullMa(rawBullBear, adaptiveSmooth).map((v) => Math.min(100, Math.max(0, v)));

  const prevFundtrend = fundtrend.map((v, i) => nz(at(fundtrend, i, 1), v));

  // Volume, momentum, RSI and MACD
  const relVolume = volume.map((v, i) => v / volSma20[i]);
  const volumeIncreasing = A(ta.rising(S(volume), 3));
  const priceMomentum = momentum.map((v) => v / 100);
  const ema12 = A(ta.ema(S(close), 12));
  const ema26 = A(ta.ema(S(close), 26));
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = A(ta.ema(S(macdLine), 9));
  const macdHist = macdLine.map((v, i) => v - signalLine[i]);
  const rsiFalling = A(ta.falling(S(rsi14), 3));
  const rsiRising = A(ta.rising(S(rsi14), 3));

  const fundtrendSma5 = A(ta.sma(S(fundtrend), 5));
  const volumeSma10 = A(ta.sma(S(volume), 10));
  const ftRising3 = A(ta.rising(S(fundtrend), 3));
  const ftFalling3 = A(ta.falling(S(fundtrend), 3));
  const ftRising2 = A(ta.rising(S(fundtrend), 2));
  // ta.crossover: exact comparisons
  const crossover = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];

  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const candles: PlotCandleData[][] = [[], [], [], [], []];
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const plot2: { time: number; value: number; color: string }[] = [];
  const trendFill: string[] = [];
  const fundColor = String(color.new(cfg.bullColor, 20));
  const bullBearColor = String(color.new(cfg.bearColor, 20));
  const bgByState = [
    String(color.new(color.gray, 97)), String(color.new(cfg.bullColor, 97)),
    String(color.new(cfg.bearColor, 97)), String(color.new(cfg.alertColor, 97)),
  ];
  const noFill = String(color.new(color.white, 100));
  const bull90 = String(color.new(cfg.bullColor, 90));
  const bear90 = String(color.new(cfg.bearColor, 90));
  const finite = (v: number) => (Number.isFinite(v) ? v : NaN);
  const flags: boolean[][] = [[], [], [], [], [], [], []];
  // fundtrend_crossunder_fixed_ob = ta.crossunder(fundtrend, 80); fundtrend_crossover_fixed_os = ta.crossover(fundtrend, 20)
  const crossUnderOb = crossedUnder(fundtrend, 80);
  const crossOverOs = crossedOver(fundtrend, 20);

  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const f = fundtrend[i];
    const bb = bullbearline[i];
    const ms = marketState[i];
    const rsiOversold = lt(rsi14[i], 40);
    const rsiOverbought = gt(rsi14[i], 60);

    const bankerEntry = crossover(fundtrend, bullbearline, i) && lt(bb, cfg.entryThreshold) && gt(close[i], open[i])
      && gt(priceMomentum[i], 0.1) && gt(relVolume[i], 0.8) && (rsiOversold || !!rsiFalling[i]) && (ms === 0 || ms === 2);
    const incPos = gt(f, bb) && gt(f, prevFundtrend[i]) && gt(priceMomentum[i], 0.05) && crossover(fundtrend, fundtrendSma5, i)
      && (gt(relVolume[i], 0.9) || !!volumeIncreasing[i]) && gt(macdHist[i], 0);
    const decPos = lt(f, prevFundtrend[i] * cfg.sensitivity) && gt(volume[i], volumeSma10[i]) && lt(priceMomentum[i], -0.05)
      && !!rsiFalling[i] && lt(macdHist[i], 0);
    const exitSig = lt(f, bb) && lt(f, prevFundtrend[i]) && !!ftFalling3[i] && (rsiOverbought || !!rsiFalling[i]) && lt(macdHist[i], 0);
    const rebound = lt(f, bb) && gt(f, prevFundtrend[i] * cfg.sensitivity) && gt(f, at(fundtrend, i, 1)) && !!ftRising2[i]
      && !!rsiRising[i] && gt(macdHist[i], at(macdHist, i, 1));
    const strongUp = gt(f, bb) && !!ftRising3[i];
    const strongDown = lt(f, bb) && !!ftFalling3[i];
    flags[0].push(bankerEntry);
    flags[1].push(incPos);
    flags[2].push(decPos);
    flags[3].push(exitSig);
    flags[4].push(rebound);
    // fundtrend > fixed_ob_level and fundtrend_crossunder_fixed_ob / fundtrend < fixed_os_level and ..._crossover_fixed_os
    flags[5].push(gt(f, 80) && crossUnderOb[i]);
    flags[6].push(lt(f, 20) && crossOverOs[i]);

    bgColors.push({ time: t, color: bgByState[ms] });

    // plotcandle(0, 50, 0, 50, "Banker Entry", color / wickcolor = bankerentry ? entry_color : na)
    const entryCol = bankerEntry ? cfg.entryColor : 'transparent';
    candles[0].push({ time: t, open: 0, high: 50, low: 0, close: 50, color: entryCol, wickColor: entryCol, borderColor: CANDLE_BORDER });
    // plotcandle(fundtrend, bullbearline, fundtrend, bullbearline, title, color = cond ? col : na)
    const signalCandle = (k: number, on: boolean, col: string) => {
      candles[k].push({ time: t, open: finite(f), high: finite(bb), low: finite(f), close: finite(bb),
        color: on ? col : 'transparent', wickColor: CANDLE_WICK, borderColor: CANDLE_BORDER });
    };
    signalCandle(1, incPos, cfg.bullColor);
    signalCandle(2, decPos, cfg.alertColor);
    signalCandle(3, exitSig, cfg.bearColor);
    signalCandle(4, rebound, cfg.reboundColor);

    plot0.push({ time: t, value: finite(f), color: fundColor });
    plot1.push({ time: t, value: finite(bb), color: bullBearColor });
    trendFill.push(cfg.showFills ? (gt(f, bb) ? bull90 : bear90) : noFill);

    if (cfg.showSignals) {
      if (bankerEntry) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: cfg.entryColor, size: 'small' });
      if (incPos) markers.push({ time: t, position: 'belowBar', shape: 'square', color: cfg.bullColor, size: 'tiny' });
      if (exitSig) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: cfg.bearColor, size: 'small' });
      // plotchar("▲" / "▼", location.bottom / top, size.tiny)
      if (strongUp) {
        markers.push({ time: t, position: 'bottom', shape: 'circle', color: 'transparent', text: '▲', textColor: cfg.bullColor, size: 'tiny' });
      }
      if (strongDown) {
        markers.push({ time: t, position: 'top', shape: 'circle', color: 'transparent', text: '▼', textColor: cfg.bearColor, size: 'tiny' });
      }
    }

    // strength_factor = show_strength ? math.abs(fundtrend - bullbearline) / 10 : 0
    const strength = cfg.showStrength ? Math.abs(f - bb) / 10 : 0;
    plot2.push({ time: t, value: finite(strength), color: gt(f, bb) ? cfg.bullColor : cfg.bearColor });
  }

  const buyZone = cfg.showFills ? bull90 : noFill;
  const sellZone = cfg.showFills ? bear90 : noFill;

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    hlines: [
      { value: 80, options: { title: 'Overbought', color: String(color.new(cfg.bearColor, 50)), linestyle: 'dotted' } },
      { value: 20, options: { title: 'Oversold', color: String(color.new(cfg.entryColor, 50)), linestyle: 'dotted' } },
      { value: 10, options: { title: 'Extreme Oversold', color: String(color.new(cfg.bullColor, 50)), linestyle: 'dotted' } },
      { value: 90, options: { title: 'Extreme Overbought', color: String(color.new(cfg.alertColor, 50)), linestyle: 'dotted' } },
    ],
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Trend Zone' }, colors: trendFill },
      { plot1: 'hline_os', plot2: 'hline_extreme_os', options: { title: 'Strong Buy Zone' }, colors: new Array<string>(n).fill(buyZone) },
      { plot1: 'hline_ob', plot2: 'hline_extreme_ob', options: { title: 'Strong Sell Zone' }, colors: new Array<string>(n).fill(sellZone) },
    ],
    markers,
    bgColors,
    plotCandles: {
      bankerEntry: candles[0],
      positionIncrease: candles[1],
      positionDecrease: candles[2],
      exitSignal: candles[3],
      weakRebound: candles[4],
    },
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Strong Banker Entry Signal', message: 'Strong Banker Entry Signal with volume confirmation! Consider long position.' },
  { id: 'alert1', title: 'Position Increase Detected', message: 'Banker Increasing Position with momentum confirmation! Add to existing position.' },
  { id: 'alert2', title: 'Position Decrease Detected', message: 'Banker Decreasing Position with volume confirmation! Consider partial profit taking.' },
  { id: 'alert3', title: 'Exit Signal Detected', message: 'Banker Exit Signal with downward momentum! Consider closing long positions.' },
  { id: 'alert4', title: 'Weak Rebound Detected', message: 'Banker Weak Rebound Signal - potential reversal point! Watch for confirmation.' },
  { id: 'alert5', title: 'Overbought Warning', message: 'Market reaching overbought levels! Consider taking profits.' },
  { id: 'alert6', title: 'Oversold Opportunity', message: 'Market reaching oversold levels! Look for entry signals.' },
];

export const EnhancedKLSEBankerFlowOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
