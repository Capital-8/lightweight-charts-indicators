/**
 * Adaptive ML Trailing Stop [BOSWaves]
 *
 * An ATR trailing stop whose distance adapts to the Kaufman efficiency ratio (ER) of the close:
 * distance = ATR * baseMultiplier * (1 + (1 - ER) * adaptiveStrength), wider in ranging markets. A K-nearest-
 * neighbours model compares the last `knnFeatureLength` normalized closes with the same pattern `offset` bars back
 * (offset up to `knnLookback`) and takes the inverse-distance weighted share of the K nearest patterns that were
 * followed by a rise. The prediction (0 bearish .. 1 bullish), weighted by the neighbours' agreement, tightens the
 * long stop and widens the short stop (or the opposite). Both raw stops are smoothed with the KAMA smoothing
 * constant, then trail: the long stop only rises and the short stop only falls while the previous close stays on
 * their side. The trend turns up when the close passes the previous short stop and down when it falls below the
 * previous long stop. The active stop is drawn with a four-layer fill to the close, circles mark trend changes,
 * diamonds mark touches of the stop (with a cooldown), and the candles take the trend colour.
 * Alerts (alertcondition, `alerts` of the result): 'Long Signal' and 'Short Signal', on the trend changes.
 *
 * Reference: "Adaptive ML Trailing Stop [BOSWaves]" by BOSWaves
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BOSWaves
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AdaptiveMLTrailingStopInputs {
  /** KAMA length (efficiency ratio period) */
  kamaLength: number;
  /** Fast period of the KAMA smoothing constant */
  fastLength: number;
  /** Slow period of the KAMA smoothing constant */
  slowLength: number;
  /** ATR period */
  atrPeriod: number;
  /** Base ATR multiplier */
  baseMultiplier: number;
  /** Adaptive strength (wider stops in ranging markets) */
  adaptiveStrength: number;
  /** Enable the KNN adjustment */
  knnEnabled: boolean;
  /** K neighbours */
  knnK: number;
  /** KNN lookback period (bars searched for similar patterns) */
  knnLookback: number;
  /** Pattern length */
  knnFeatureLength: number;
  /** KNN influence on the stop distance */
  knnWeight: number;
  /** Minimum number of bars between two diamonds */
  diamondCooldown: number;
  longColor: string;
  shortColor: string;
  showGradient: boolean;
}

export const defaultInputs: AdaptiveMLTrailingStopInputs = {
  kamaLength: 20,
  fastLength: 15,
  slowLength: 50,
  atrPeriod: 21,
  baseMultiplier: 2.5,
  adaptiveStrength: 1.0,
  knnEnabled: true,
  knnK: 7,
  knnLookback: 100,
  knnFeatureLength: 5,
  knnWeight: 0.2,
  diamondCooldown: 5,
  longColor: '#00ff88',
  shortColor: '#ff3366',
  showGradient: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'kamaLength', type: 'int', title: 'KAMA Length', defval: 20, min: 1 },
  { id: 'fastLength', type: 'int', title: 'Fast Period', defval: 15, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow Period', defval: 50, min: 1 },
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 21, min: 1 },
  { id: 'baseMultiplier', type: 'float', title: 'Base ATR Multiplier', defval: 2.5, min: 0.1, step: 0.1 },
  { id: 'adaptiveStrength', type: 'float', title: 'Adaptive Strength', defval: 1.0, min: 0.1, step: 0.1 },
  { id: 'knnEnabled', type: 'bool', title: 'Enable KNN', defval: true },
  { id: 'knnK', type: 'int', title: 'K Neighbors', defval: 7, min: 1, max: 20 },
  { id: 'knnLookback', type: 'int', title: 'KNN Lookback Period', defval: 100, min: 50, max: 500 },
  { id: 'knnFeatureLength', type: 'int', title: 'Pattern Length', defval: 5, min: 3, max: 20 },
  { id: 'knnWeight', type: 'float', title: 'KNN Influence', defval: 0.2, min: 0.0, max: 1.0, step: 0.1 },
  { id: 'diamondCooldown', type: 'int', title: 'Diamond Cooldown Bars', defval: 5, min: 1 },
  { id: 'longColor', type: 'color', title: 'Long Color', defval: '#00ff88' },
  { id: 'shortColor', type: 'color', title: 'Short Color', defval: '#ff3366' },
  { id: 'showGradient', type: 'bool', title: 'Show Gradient Fill', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Long Stop', color: '#00ff88', lineWidth: 3, style: 'linebr' },
  { id: 'plot1', title: 'Short Stop', color: '#ff3366', lineWidth: 3, style: 'linebr' },
  { id: 'plot2', title: 'Gradient Lower Band', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Gradient 25%', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Gradient 50%', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Gradient 75%', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Gradient Upper Band', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Adaptive ML Trailing Stop [BOSWaves]',
  shortTitle: 'Adaptive ML Trailing Stop [BOSWaves]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/**
 * One Pine ta.highest / ta.lowest call site that can run many times per bar (here inside the KNN loops); rule
 * found with probe plots of the normalized values:
 * - the source history has one slot per bar (a ring of len + 1 slots indexed by bar); each call overwrites the slot
 *   of the current bar, so earlier bars keep the value of their last call; a slot never written is skipped;
 * - the extreme is kept with its bar and replaced by a value that passes it (also by an earlier call of the same
 *   bar); the window of the last len bars is scanned again when the extreme is len bars old (the oldest bar wins
 *   a tie);
 * - an na source writes na, resets the extreme and returns na.
 */
function pineExtreme(len: number, isLow: boolean) {
  const ring = len + 1;
  const slot: number[] = new Array(ring).fill(NaN);
  let ext = NaN;
  let extBar = -1;
  return (bar: number, x: number): number => {
    slot[bar % ring] = x;
    if (isNaN(x)) {
      ext = NaN;
      return NaN;
    }
    if (isNaN(ext) || bar - extBar >= len) {
      ext = NaN;
      for (let k = 0; k < len && bar - k >= 0; k++) {
        const v = slot[(bar - k) % ring];
        if (!isNaN(v) && (isNaN(ext) || (isLow ? v <= ext : v >= ext))) {
          ext = v;
          extBar = bar - k;
        }
      }
    } else if (isLow ? x < ext : x > ext) {
      ext = x;
      extBar = bar;
    }
    return bar < len - 1 ? NaN : ext;
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveMLTrailingStopInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const at = (a: number[], i: number) => (i >= 0 && i < a.length ? a[i] : NaN);

  // KAMA efficiency ratio and smoothing constant
  const L = cfg.kamaLength;
  const er: number[] = new Array(n);
  const sc: number[] = new Array(n);
  const fastSC = 2.0 / (cfg.fastLength + 1);
  const slowSC = 2.0 / (cfg.slowLength + 1);
  for (let i = 0; i < n; i++) {
    const change = Math.abs(close[i] - at(close, i - L));
    // math.sum(math.abs(close - close[1]), kamaLength): na while the window holds bar 0 (close[1] na)
    let volatility = NaN;
    if (i >= L) {
      volatility = 0;
      for (let k = 0; k < L; k++) volatility += Math.abs(close[i - k] - close[i - k - 1]);
    }
    // volatility != 0 ? change / volatility : 0 (na != 0 is false)
    er[i] = !isNaN(volatility) && Math.abs(volatility) > EPS ? change / volatility : 0;
    sc[i] = Math.pow(er[i] * (fastSC - slowSC) + slowSC, 2);
  }

  // KNN pattern matching
  const FL = cfg.knnFeatureLength;
  const hiCur = pineExtreme(FL, false);
  const loCur = pineExtreme(FL, true);
  const hiHist = pineExtreme(FL, false);
  const loHist = pineExtreme(FL, true);
  // normalize(src, len): priceRange > 0 ? (src - lowest) / priceRange : 0.5
  const normalize = (hi: typeof hiCur, lo: typeof loCur, bar: number, src: number) => {
    const highest = hi(bar, src);
    const lowest = lo(bar, src);
    const priceRange = highest - lowest;
    return gt(priceRange, 0) ? (src - lowest) / priceRange : 0.5;
  };
  const knnPrediction: number[] = new Array(n);
  const knnConfidence: number[] = new Array(n);
  let prediction = 0.5; // var float knnPrediction = 0.5
  let confidence = 0.0; // var float knnConfidence = 0.0
  const K = cfg.knnK;
  for (let b = 0; b < n; b++) {
    if (cfg.knnEnabled && b > cfg.knnLookback) {
      const distances: number[] = [];
      const outcomes: number[] = [];
      for (let offset = FL; offset <= cfg.knnLookback; offset++) {
        // calcDistance(offset): Euclidean distance of the normalized patterns
        let sum = 0.0;
        for (let i = 0; i < FL; i++) {
          const currentNorm = normalize(hiCur, loCur, b, at(close, b - i));
          const historicalNorm = normalize(hiHist, loHist, b, at(close, b - i - offset));
          const diff = currentNorm - historicalNorm;
          sum += diff * diff;
        }
        const dist = Math.sqrt(sum);
        if (lt(dist, 999999.0)) {
          distances.push(dist);
          const past = at(close, b - offset);
          const futureReturn = (at(close, b - (offset - FL)) - past) / past;
          outcomes.push(gt(futureReturn, 0) ? 1.0 : 0.0);
        }
      }
      if (distances.length >= K) {
        const last = Math.min(K - 1, distances.length - 1);
        // selection sort of the K smallest distances
        for (let i = 0; i <= last; i++) {
          let minIdx = i;
          for (let j = i + 1; j <= distances.length - 1; j++) if (lt(distances[j], distances[minIdx])) minIdx = j;
          if (minIdx !== i) {
            [distances[i], distances[minIdx]] = [distances[minIdx], distances[i]];
            [outcomes[i], outcomes[minIdx]] = [outcomes[minIdx], outcomes[i]];
          }
        }
        let totalWeight = 0.0;
        let weightedSum = 0.0;
        for (let i = 0; i <= last; i++) {
          const w = gt(distances[i], 0) ? 1.0 / (distances[i] + 0.001) : 1.0;
          weightedSum += outcomes[i] * w;
          totalWeight += w;
        }
        prediction = gt(totalWeight, 0) ? weightedSum / totalWeight : 0.5;
        let bullish = 0;
        for (let i = 0; i <= Math.min(K - 1, outcomes.length - 1); i++) if (gt(outcomes[i], 0.5)) bullish += 1;
        confidence = Math.abs(bullish / Math.min(K, outcomes.length) - 0.5) * 2;
      }
    }
    knnPrediction[b] = prediction;
    knnConfidence[b] = confidence;
  }

  // Adaptive trailing stop
  const atr = ta.atr(bars, cfg.atrPeriod).toArray().map((v) => v ?? NaN);
  const longStop: number[] = new Array(n);
  const shortStop: number[] = new Array(n);
  const trendArr: number[] = new Array(n);
  const prevTrendArr: number[] = new Array(n);
  let smoothLong = NaN;
  let smoothShort = NaN;
  let trend = 0; // var int trend = 0
  for (let i = 0; i < n; i++) {
    const adaptiveMultiplier = cfg.baseMultiplier * (1 + (1 - er[i]) * cfg.adaptiveStrength);
    const knnAdjustment = cfg.knnEnabled ? (knnPrediction[i] - 0.5) * cfg.knnWeight * knnConfidence[i] : 0.0;
    const stopDistance = atr[i] * adaptiveMultiplier;
    const rawLong = close[i] - stopDistance * (1 - knnAdjustment);
    const rawShort = close[i] + stopDistance * (1 + knnAdjustment);
    smoothLong = isNaN(smoothLong) ? rawLong : smoothLong + sc[i] * (rawLong - smoothLong);
    smoothShort = isNaN(smoothShort) ? rawShort : smoothShort + sc[i] * (rawShort - smoothShort);
    const prevLong = at(longStop, i - 1);
    const prevShort = at(shortStop, i - 1);
    const close1 = at(close, i - 1);
    // math.max / math.min with na give na
    longStop[i] = gt(close1, prevLong) ? Math.max(smoothLong, prevLong) : smoothLong;
    shortStop[i] = lt(close1, prevShort) ? Math.min(smoothShort, prevShort) : smoothShort;
    prevTrendArr[i] = trend;
    if (gt(close[i], prevShort)) trend = 1;
    else if (lt(close[i], prevLong)) trend = -1;
    trendArr[i] = trend;
  }

  // Plots
  const t = (i: number) => bars[i].time;
  const up = (i: number) => trendArr[i] === 1;
  const upperBand = bars.map((_b, i) => (cfg.showGradient ? (up(i) ? close[i] : shortStop[i]) : NaN));
  const lowerBand = bars.map((_b, i) => (cfg.showGradient ? (up(i) ? longStop[i] : close[i]) : NaN));
  const mid = (f: number) => bars.map((_b, i) => (cfg.showGradient ? lowerBand[i] + (upperBand[i] - lowerBand[i]) * f : NaN));
  const mid1 = mid(0.25);
  const mid2 = mid(0.5);
  const mid3 = mid(0.75);
  const line = (vals: number[]) => bars.map((b, i) => ({ time: b.time, value: vals[i] }));

  const layer = (transp: number) => bars.map((_b, i) => (cfg.showGradient
    ? String(color.new(up(i) ? cfg.longColor : cfg.shortColor, transp)) : 'transparent'));

  // Markers: plotshape order Buy Signal, Sell Signal, Long Stop Touch, Short Stop Touch
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  let lastLongDiamond = -999;
  let lastShortDiamond = -999;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const buy = trendArr[i] === 1 && prevTrendArr[i] === -1;
    const sell = trendArr[i] === -1 && prevTrendArr[i] === 1;
    buyFlags.push(buy);
    sellFlags.push(sell);
    // low <= longStop and low[1] > longStop[1] or math.abs(low - longStop) < atr * 0.5
    const lowPrev = i > 0 ? bars[i - 1].low : NaN;
    const highPrev = i > 0 ? bars[i - 1].high : NaN;
    const longTouchRaw = trendArr[i] === 1
      && ((le(b.low, longStop[i]) && gt(lowPrev, at(longStop, i - 1))) || lt(Math.abs(b.low - longStop[i]), atr[i] * 0.5));
    const shortTouchRaw = trendArr[i] === -1
      && ((ge(b.high, shortStop[i]) && lt(highPrev, at(shortStop, i - 1))) || lt(Math.abs(b.high - shortStop[i]), atr[i] * 0.5));
    const longTouch = longTouchRaw && i - lastLongDiamond >= cfg.diamondCooldown;
    const shortTouch = shortTouchRaw && i - lastShortDiamond >= cfg.diamondCooldown;
    if (longTouch) lastLongDiamond = i;
    if (shortTouch) lastShortDiamond = i;
    if (buy) markers.push({ time: t(i), position: 'belowBar', shape: 'circle', color: cfg.longColor, size: 'small' });
    if (sell) markers.push({ time: t(i), position: 'aboveBar', shape: 'circle', color: cfg.shortColor, size: 'small' });
    if (longTouch) markers.push({ time: t(i), position: 'belowBar', shape: 'diamond', color: cfg.longColor, size: 'small' });
    if (shortTouch) markers.push({ time: t(i), position: 'aboveBar', shape: 'diamond', color: cfg.shortColor, size: 'small' });
    // barcolor(trend == 1 ? longColor : shortColor, title = "Trend Candles")
    barColors.push({ time: t(i), color: up(i) ? cfg.longColor : cfg.shortColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(trend == 1 ? longStop : na, "Long Stop", longColor, 3, plot.style_linebr)
      plot0: bars.map((b, i) => ({ time: b.time, value: up(i) ? longStop[i] : NaN, color: cfg.longColor })),
      // plot(trend == -1 ? shortStop : na, "Short Stop", shortColor, 3, plot.style_linebr)
      plot1: bars.map((b, i) => ({ time: b.time, value: trendArr[i] === -1 ? shortStop[i] : NaN, color: cfg.shortColor })),
      // gradPlot1..5 = plot(lowerBand / mid1 / mid2 / mid3 / upperBand, display = display.none)
      plot2: line(lowerBand),
      plot3: line(mid1),
      plot4: line(mid2),
      plot5: line(mid3),
      plot6: line(upperBand),
    },
    // fill(gradPlot1, gradPlot2, ... 85), (2, 3, 90), (3, 4, 95), (4, 5, color.new(stopColor, 97))
    fills: [
      { plot1: 'plot2', plot2: 'plot3', colors: layer(85) },
      { plot1: 'plot3', plot2: 'plot4', colors: layer(90) },
      { plot1: 'plot4', plot2: 'plot5', colors: layer(95) },
      { plot1: 'plot5', plot2: 'plot6', colors: layer(97) },
    ],
    markers,
    barColors,
    // alertcondition(trend == 1 and prevTrend == -1, ...) / alertcondition(trend == -1 and prevTrend == 1, ...)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long Signal', message: 'KNN-KAMA Trailing Stop: Long Entry' },
  { id: 'alert1', title: 'Short Signal', message: 'KNN-KAMA Trailing Stop: Short Entry' },
];

export const AdaptiveMLTrailingStop = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
